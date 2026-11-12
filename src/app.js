import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { hashPassword, randomPassword } from './auth.js';
import { removeImageFiles } from './images.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';
import { seedDemo } from './seed.js';
import { Store } from './store.js';
import { resolvePalette, themeCss } from './theme.js';
import { shortHash } from './util.js';
import { statePage } from './views/public.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * 组装整个应用。测试里也用它，传入一个临时数据目录即可。
 * @param {import('./config.js').config} config
 */
export function createApp(config) {
  const store = new Store(config.dataDir);
  const notes = firstRun(store, config);

  /** 静态资源地址带上版本号，文件改动后访客不会拿到旧缓存。 */
  const asset = (p) => {
    try {
      const st = fs.statSync(path.join(PUBLIC_DIR, p));
      return `${p}?v=${Math.round(st.mtimeMs).toString(36)}`;
    } catch {
      return p;
    }
  };

  /** 每个页面都要用到的站点信息。 */
  let themeCache = { key: '', css: '' };
  const siteOf = (c) => {
    const settings = store.settings();
    const key = `${settings.theme}|${settings.theme_color}`;
    if (themeCache.key !== key) themeCache = { key, css: themeCss(resolvePalette(settings)) };
    const noticeLines = settings.notice.split('\n').map((l) => l.trim()).filter(Boolean);
    const proto = (config.trustProxy && c.req.header('x-forwarded-proto')) || new URL(c.req.url).protocol.replace(':', '');
    return {
      settings,
      themeCss: themeCache.css,
      asset,
      noticeLines,
      noticeVer: shortHash(settings.notice),
      origin: `${proto}://${c.req.header('host') || 'localhost'}`,
      secure: proto === 'https',
    };
  };

  /** 清理没有任何地方引用的旧图片（换封面、删商品之后留下的）。 */
  const gc = async () => {
    for (const id of store.orphanImageIds()) {
      await removeImageFiles(store.uploadsDir, id);
      store.removeImageRow(id);
    }
  };

  const ctx = { store, config, siteOf, asset, gc };
  const app = new Hono();

  // 同站跳转保留来源地址：详情页靠它判断访客是不是从首页点进来的
  app.use(secureHeaders({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false, xFrameOptions: 'SAMEORIGIN', referrerPolicy: 'strict-origin-when-cross-origin' }));
  app.use(compress());

  // 静态资源：带版本号的长期缓存，上传的图片文件名是随机的，同样长期缓存
  const longCache = 'public, max-age=31536000, immutable';
  const staticOpts = {
    root: path.relative(process.cwd(), PUBLIC_DIR) || '.',
    onFound: (p, c) => c.header('Cache-Control', c.req.query('v') || p.includes('/fonts/') ? longCache : 'public, max-age=3600'),
  };
  for (const prefix of ['/css/*', '/js/*', '/fonts/*', '/favicon.svg', '/robots.txt']) app.use(prefix, serveStatic(staticOpts));
  app.use(
    '/uploads/*',
    serveStatic({
      root: path.relative(process.cwd(), store.uploadsDir) || '.',
      rewriteRequestPath: (p) => p.replace(/^\/uploads/, ''),
      onFound: (_p, c) => c.header('Cache-Control', longCache),
    }),
  );

  app.get('/healthz', (c) => c.text('ok'));
  app.route('/admin', adminRoutes(ctx));
  app.route('/', publicRoutes(ctx));

  app.notFound((c) => {
    if (c.req.path.startsWith('/admin')) return c.redirect('/admin');
    return c.html(statePage(siteOf(c), { title: '页面不存在', text: '这个页面不存在或已被移除，去首页看看吧。' }), 404);
  });
  app.onError((err, c) => {
    console.error(err);
    if (c.req.path.startsWith('/admin/api/')) return c.json({ ok: false, error: '服务器出错了，请稍后再试' }, 500);
    return c.html(statePage(siteOf(c), { title: '页面出错了', text: '服务器遇到了一点问题，请稍后再试。' }), 500);
  });

  gc().catch((e) => console.error('清理图片失败', e));

  return { app, store, notes, gc };
}

/** 第一次启动：写入示例数据，设置后台密码。返回需要在启动日志里提示的内容。 */
function firstRun(store, config) {
  const notes = [];
  if (!store.secret('initialized')) {
    if (config.seedDemo) seedDemo(store);
    store.setSettings({ initialized: '1' });
  }
  if (!store.secret('admin_hash')) {
    const password = config.adminPassword || randomPassword();
    store.setSettings({ admin_hash: hashPassword(password) });
    notes.push(config.adminPassword ? '后台密码已按 ADMIN_PASSWORD 设置。' : `后台初始密码：${password}（请登录后在「店铺设置」里修改）`);
  }
  return notes;
}
