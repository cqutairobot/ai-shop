import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { stream } from 'hono/streaming';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  clearLoginFailures,
  createSession,
  hashPassword,
  isValidSession,
  loginLockRemaining,
  recordLoginFailure,
  SESSION_MAX_AGE,
  verifyPassword,
} from '../auth.js';
import { ImageError, processImage } from '../images.js';
import { renderMarkdown } from '../markdown.js';
import { SETTING_DEFAULTS } from '../store.js';
import { isHex, PRESETS } from '../theme.js';
import { categoriesPage, loginPage, productFormPage, productsPage, settingsPage } from '../views/admin.js';
import { writeZip } from '../zip.js';

const COOKIE = 'sid';
const MAX_BODY = 12 * 1024 * 1024;

/** 管理后台。挂在 /admin 下，除登录页外都需要登录。 */
export function adminRoutes({ store, config, siteOf, gc }) {
  const app = new Hono();

  const clientIp = (c) => {
    if (config.trustProxy) {
      const fwd = c.req.header('x-forwarded-for');
      if (fwd) return fwd.split(',')[0].trim();
    }
    try {
      return getConnInfo(c).remote.address || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const isApi = (c) => c.req.path.startsWith('/admin/api/');

  app.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');

    // 防跨站请求：浏览器发来的修改请求必须来自本站
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (origin) {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch { /* 留空，按不匹配处理 */ }
        if (host !== c.req.header('host')) return c.text('请求来源不正确', 403);
      }
    }

    if (c.req.path !== '/admin/login' && !isValidSession(getCookie(c, COOKIE), store.sessionSecret())) {
      if (isApi(c)) return c.json({ ok: false, error: '登录已过期，请刷新页面重新登录' }, 401);
      return c.redirect('/admin/login');
    }
    await next();
  });

  app.use(
    bodyLimit({
      maxSize: MAX_BODY,
      onError: (c) => (isApi(c) ? c.json({ ok: false, error: '上传的内容太大了，图片请控制在 10MB 以内' }, 413) : c.text('上传的内容太大了，图片请控制在 10MB 以内', 413)),
    }),
  );

  /* ---------- 登录 ---------- */

  app.get('/login', (c) => {
    if (isValidSession(getCookie(c, COOKIE), store.sessionSecret())) return c.redirect('/admin/products');
    return c.html(loginPage(siteOf(c), {}));
  });

  app.post('/login', async (c) => {
    const ip = clientIp(c);
    const site = siteOf(c);
    const locked = loginLockRemaining(ip);
    if (locked) return c.html(loginPage(site, { error: `密码输错次数太多，请 ${locked} 分钟后再试。` }), 429);

    const { password } = await c.req.parseBody();
    if (!verifyPassword(String(password || ''), store.secret('admin_hash'))) {
      const left = recordLoginFailure(ip);
      const error = left ? `密码不对，还可以再试 ${left} 次。` : '密码输错次数太多，请 15 分钟后再试。';
      return c.html(loginPage(site, { error }), 401);
    }
    clearLoginFailures(ip);
    setCookie(c, COOKIE, createSession(store.sessionSecret()), { httpOnly: true, sameSite: 'Lax', secure: site.secure, path: '/admin', maxAge: SESSION_MAX_AGE });
    return c.redirect('/admin/products');
  });

  app.post('/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/admin' });
    return c.redirect('/admin/login');
  });

  app.get('/', (c) => c.redirect('/admin/products'));

  /* ---------- 图片 ---------- */

  /** 处理表单里的一张图片：有新上传就用新的，勾了「移除」就清空，否则保持原样。 */
  async function pickImage(body, field, current, kind = 'photo') {
    const file = body[`${field}_file`];
    if (file instanceof File && file.size > 0) {
      const img = await processImage(store.uploadsDir, Buffer.from(await file.arrayBuffer()), kind);
      store.addImage(img);
      return img.id;
    }
    if (body[`${field}_remove`] === '1') return '';
    return current;
  }

  app.post('/api/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || !file.size) return c.json({ ok: false, error: '没有收到图片' }, 400);
    try {
      const img = await processImage(store.uploadsDir, Buffer.from(await file.arrayBuffer()));
      store.addImage(img);
      return c.json({ ok: true, url: `/uploads/${img.id}.webp` });
    } catch (e) {
      if (e instanceof ImageError) return c.json({ ok: false, error: e.message }, 400);
      throw e;
    }
  });

  app.post('/api/preview', async (c) => {
    const { md } = await c.req.json();
    return c.json({ ok: true, html: renderMarkdown(String(md ?? '').slice(0, 200_000), (id) => store.image(id)) });
  });

  /* ---------- 商品 ---------- */

  app.get('/products', (c) => c.html(productsPage(siteOf(c), { products: store.adminProducts(), msg: c.req.query('msg') })));

  const formPage = (c, product, values, error, status = 200) =>
    c.html(productFormPage(siteOf(c), { product, values, error, categories: store.categories(), msg: c.req.query('msg') }), status);

  app.get('/products/new', (c) => formPage(c, null, null, ''));

  app.get('/products/:id{[0-9]+}', (c) => {
    const p = store.product(Number(c.req.param('id')));
    if (!p) return c.redirect('/admin/products');
    return formPage(c, p, null, '');
  });

  /** 新增和编辑共用：读表单、校验、处理封面。 */
  async function saveProduct(c, existing) {
    const body = await c.req.parseBody();
    const values = {
      name: String(body.name || '').trim(),
      category_id: String(body.category_id || ''),
      price: String(body.price || '').trim(),
      orig_price: String(body.orig_price || '').trim(),
      tags: String(body.tags || ''),
      status: String(body.status || 'on'),
      pinned: body.pinned === '1',
      body_md: String(body.body_md || ''),
      cover: existing?.cover || '',
    };
    const fail = (error) => formPage(c, existing, values, error, 400);
    if (!values.name) return fail('请填写商品名称。');
    if (!values.price) return fail('请填写价格。可以填数字，也可以填「面议」这样的文字。');
    try {
      values.cover = await pickImage(body, 'cover', values.cover);
    } catch (e) {
      if (e instanceof ImageError) return fail(e.message);
      throw e;
    }
    let id = existing?.id;
    if (existing) store.updateProduct(id, values);
    else id = store.createProduct(values);
    gc().catch(() => {});
    if (body.next === 'view' && values.status !== 'off') return c.redirect(`/p/${id}`);
    return c.redirect(`/admin/products?msg=${existing ? 'saved' : 'created'}`);
  }

  app.post('/products/new', (c) => saveProduct(c, null));

  app.post('/products/:id{[0-9]+}', (c) => {
    const p = store.product(Number(c.req.param('id')));
    if (!p) return c.redirect('/admin/products');
    return saveProduct(c, p);
  });

  app.post('/products/:id{[0-9]+}/delete', (c) => {
    store.deleteProduct(Number(c.req.param('id')));
    gc().catch(() => {});
    return c.redirect('/admin/products?msg=deleted');
  });

  app.post('/products/:id{[0-9]+}/copy', (c) => {
    const id = store.duplicateProduct(Number(c.req.param('id')));
    return c.redirect(id ? `/admin/products/${id}?msg=copied` : '/admin/products');
  });

  // 列表里直接改价格、状态、置顶
  app.post('/api/products/:id{[0-9]+}', async (c) => {
    const id = Number(c.req.param('id'));
    if (!store.product(id)) return c.json({ ok: false, error: '商品不存在，可能已被删除' }, 404);
    const patch = await c.req.json();
    try {
      store.patchProduct(id, patch);
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
    const p = store.product(id);
    return c.json({ ok: true, price: p.priceLabel, status: p.status, pinned: p.pinned });
  });

  const readIds = async (c) => {
    const { ids } = await c.req.json();
    return Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
  };

  app.post('/api/products/order', async (c) => {
    store.reorderProducts(await readIds(c));
    return c.json({ ok: true });
  });

  /* ---------- 分类 ---------- */

  app.get('/categories', (c) => c.html(categoriesPage(siteOf(c), { categories: store.categories(), msg: c.req.query('msg') })));

  app.post('/categories', async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name || '').trim().slice(0, 20);
    if (!name) return c.redirect('/admin/categories?msg=catname');
    store.addCategory(name, String(body.icon || 'spark'));
    return c.redirect('/admin/categories?msg=catadded');
  });

  app.post('/categories/:id{[0-9]+}', async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name || '').trim().slice(0, 20);
    if (!name) return c.redirect('/admin/categories?msg=catname');
    store.updateCategory(Number(c.req.param('id')), { name, icon: String(body.icon || 'spark') });
    return c.redirect('/admin/categories?msg=saved');
  });

  app.post('/categories/:id{[0-9]+}/delete', (c) => {
    store.deleteCategory(Number(c.req.param('id')));
    return c.redirect('/admin/categories?msg=deleted');
  });

  app.post('/api/categories/order', async (c) => {
    store.reorderCategories(await readIds(c));
    return c.json({ ok: true });
  });

  /* ---------- 店铺设置 ---------- */

  app.get('/settings', (c) => c.html(settingsPage(siteOf(c), { msg: c.req.query('msg'), error: '' })));

  app.post('/settings', async (c) => {
    const body = await c.req.parseBody();
    const current = store.settings();
    const text = (k, max = 200) => String(body[k] ?? '').trim().slice(0, max);
    const next = {
      shop_name: text('shop_name', 40) || SETTING_DEFAULTS.shop_name,
      tagline: text('tagline', 120),
      stat_num: text('stat_num', 8),
      stat_label: text('stat_label', 12),
      notice: String(body.notice ?? '').replace(/\r/g, '').trim().slice(0, 2000),
      notice_popup: body.notice_popup === '1' ? '1' : '0',
      wechat: text('wechat', 40),
      qq: text('qq', 20).replace(/\s+/g, ''),
      telegram: text('telegram', 60),
      email: text('email', 80),
      extra_label: text('extra_label', 12),
      extra_value: text('extra_value', 120),
      hours: text('hours', 60),
      theme: PRESETS[body.theme] || body.theme === 'custom' ? String(body.theme) : 'aurora',
      theme_color: isHex(body.theme_color) ? String(body.theme_color).toUpperCase() : current.theme_color,
      footer: text('footer', 80),
      icp: text('icp', 40),
    };
    try {
      next.avatar = await pickImage(body, 'avatar', current.avatar);
      next.wechat_qr = await pickImage(body, 'wechat_qr', current.wechat_qr, 'qr');
    } catch (e) {
      if (e instanceof ImageError) return c.html(settingsPage({ ...siteOf(c), settings: { ...current, ...next } }, { msg: '', error: e.message }), 400);
      throw e;
    }
    store.setSettings(next);
    gc().catch(() => {});
    return c.redirect('/admin/settings?msg=saved');
  });

  app.post('/password', async (c) => {
    const body = await c.req.parseBody();
    const fail = (error) => c.html(settingsPage(siteOf(c), { msg: '', error }), 400);
    if (!verifyPassword(String(body.current || ''), store.secret('admin_hash'))) return fail('当前密码不对，密码没有修改。');
    const pw = String(body.password || '');
    if (pw.length < 8) return fail('新密码至少需要 8 位。');
    if (pw !== String(body.confirm || '')) return fail('两次输入的新密码不一致。');
    store.setSettings({ admin_hash: hashPassword(pw) });
    return c.redirect('/admin/settings?msg=pw');
  });

  app.post('/demo/clear', (c) => {
    store.deleteAllProductsAndCategories();
    store.setSettings({ demo: '0' });
    gc().catch(() => {});
    return c.redirect('/admin/products?msg=demo');
  });

  /* ---------- 数据导出 ---------- */

  app.get('/export', (c) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const snapshot = path.join(config.dataDir, `export-${Date.now()}.db`);
    store.snapshotTo(snapshot);
    const files = [{ name: 'shop.db', path: snapshot }];
    for (const f of fs.readdirSync(store.uploadsDir)) files.push({ name: `uploads/${f}`, path: path.join(store.uploadsDir, f) });

    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="ai-shop-backup-${stamp}.zip"`);
    return stream(c, async (s) => {
      try {
        await writeZip((chunk) => s.write(chunk), files);
      } finally {
        fs.rmSync(snapshot, { force: true });
      }
    });
  });

  return app;
}
