import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.js';

/** 用一个临时数据目录启动完整应用，直接向它发请求（不需要真的监听端口）。 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-shop-test-'));
const PASSWORD = 'test-password-1';
let app, store, cookie, photo;

const get = (url, headers = {}) => app.request(url, { headers: { cookie, ...headers } });
const postJson = (url, data) => app.request(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const postForm = (url, fields, headers = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return app.request(url, { method: 'POST', headers: { cookie, ...headers }, body: form });
};

before(async () => {
  ({ app, store } = createApp({ port: 0, host: '127.0.0.1', dataDir, adminPassword: PASSWORD, trustProxy: true, seedDemo: true }));
  const png = await sharp({ create: { width: 1000, height: 750, channels: 3, background: '#7B61FF' } }).png().toBuffer();
  photo = new File([png], 'cover.png', { type: 'image/png' });
});

after(() => {
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('首次启动写入示例数据，首页和详情页可以访问', async () => {
  const home = await app.request('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /极光 AI 小铺/);
  assert.equal((html.match(/class="card pre/g) || []).length, 12);
  assert.match(html, /aria-pressed="true">全部/);

  const detail = await app.request('/p/1');
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /联系购买/);

  assert.equal((await app.request('/p/99999')).status, 404);
  assert.equal((await app.request('/no-such-page')).status, 404);
  assert.equal((await app.request('/healthz')).status, 200);
});

test('后台必须登录，密码错误和跨站请求会被拒绝', async () => {
  const page = await app.request('/admin/products');
  assert.equal(page.status, 302);
  assert.match(page.headers.get('location'), /\/admin\/login$/);
  assert.equal((await app.request('/admin/api/products/1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await app.request('/admin/export')).status, 302);

  const wrong = await app.request('/admin/login', { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.1' }, body: new URLSearchParams({ password: 'nope' }) });
  assert.equal(wrong.status, 401);

  const crossSite = await app.request('/admin/login', { method: 'POST', headers: { origin: 'https://evil.example', host: 'shop.example' }, body: new URLSearchParams({ password: PASSWORD }) });
  assert.equal(crossSite.status, 403);

  const ok = await app.request('/admin/login', { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.1' }, body: new URLSearchParams({ password: PASSWORD }) });
  assert.equal(ok.status, 302);
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  cookie = setCookie.split(';')[0];
  assert.equal((await get('/admin/products')).status, 200);
});

test('同一 IP 连续输错 5 次后被锁定', async () => {
  const attempt = () => app.request('/admin/login', { method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, body: new URLSearchParams({ password: 'bad' }) });
  for (let i = 0; i < 5; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);
  // 锁定期间，正确的密码也不能登录
  const right = await app.request('/admin/login', { method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, body: new URLSearchParams({ password: PASSWORD }) });
  assert.equal(right.status, 429);
});

test('新增带封面的商品，前台立即可见', async () => {
  const res = await postForm('/admin/products/new', {
    name: '测试商品 <b>甲</b>',
    price: '129',
    orig_price: '199',
    tags: '新品，质保 90 天',
    status: 'on',
    body_md: '介绍 ==重点==\n\n:::tip\n先联系\n:::',
    cover_file: photo,
  });
  assert.equal(res.status, 302);

  const p = store.adminProducts().find((x) => x.name.startsWith('测试商品'));
  assert.ok(p.cover, '应保存封面');
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads', `${p.cover}.webp`)));
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads', `${p.cover}-s.webp`)));
  const thumb = await app.request(`/uploads/${p.cover}-s.webp`);
  assert.equal(thumb.status, 200);
  assert.match(thumb.headers.get('cache-control'), /immutable/);
  const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
  assert.equal(meta.width, 480, '缩略图宽度应压到 480px');

  const home = await (await app.request('/')).text();
  assert.match(home, /测试商品 &lt;b&gt;甲&lt;\/b&gt;/, '商品名里的 HTML 应被转义');
  const detail = await (await app.request(`/p/${p.id}`)).text();
  assert.match(detail, /<i>¥<\/i>129/);
  assert.match(detail, /立省 ¥70/);
  assert.match(detail, /<mark>重点<\/mark>/);
  assert.match(detail, /callout--tip/);
});

test('必填项为空时不保存，并保留已填内容', async () => {
  const count = store.adminProducts().length;
  const res = await postForm('/admin/products/new', { name: '', price: '50', body_md: '保留我' });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /请填写商品名称/);
  assert.match(html, /保留我/);
  assert.equal(store.adminProducts().length, count);
});

test('不是图片的文件会被拒绝', async () => {
  const res = await postForm('/admin/api/upload', { file: new File(['not an image'], 'a.png', { type: 'image/png' }) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('列表里直接改价格和状态；下架后访客看不到', async () => {
  const p = store.adminProducts().find((x) => x.name.startsWith('测试商品'));
  let r = await (await postJson(`/admin/api/products/${p.id}`, { price: '88.50' })).json();
  assert.deepEqual([r.ok, r.price], [true, '88.5']);
  assert.match(await (await app.request(`/p/${p.id}`)).text(), /<i>¥<\/i>88\.5/);

  r = await (await postJson(`/admin/api/products/${p.id}`, { price: '面议' })).json();
  assert.equal(r.price, '面议');
  assert.equal((await postJson(`/admin/api/products/${p.id}`, { price: '  ' })).status, 400);

  await postJson(`/admin/api/products/${p.id}`, { status: 'out' });
  assert.match(await (await app.request(`/p/${p.id}`)).text(), /暂时缺货/);

  await postJson(`/admin/api/products/${p.id}`, { status: 'off' });
  assert.equal((await app.request(`/p/${p.id}`)).status, 404);
  assert.ok(!(await (await app.request('/')).text()).includes('测试商品'));
  await postJson(`/admin/api/products/${p.id}`, { status: 'on' });
});

test('排序、置顶、复制、删除', async () => {
  const ids = store.publicProducts().filter((p) => !p.pinned).map((p) => p.id);
  const reversed = [...ids].reverse();
  assert.equal((await postJson('/admin/api/products/order', { ids: reversed })).status, 200);
  assert.deepEqual(store.publicProducts().filter((p) => !p.pinned).map((p) => p.id), reversed);

  const last = reversed.at(-1);
  await postJson(`/admin/api/products/${last}`, { pinned: true });
  assert.ok(store.publicProducts().slice(0, 2).some((p) => p.id === last), '置顶后排到最前');

  const before = store.adminProducts().length;
  const copy = await app.request(`/admin/products/${last}/copy`, { method: 'POST', headers: { cookie } });
  const copyId = Number(copy.headers.get('location').match(/products\/(\d+)/)[1]);
  assert.equal(store.adminProducts().length, before + 1);
  assert.equal(store.product(copyId).status, 'off', '副本默认下架');

  await app.request(`/admin/products/${copyId}/delete`, { method: 'POST', headers: { cookie } });
  assert.equal(store.product(copyId), null);
});

test('分类：新增、改名、删除后商品变成未分类', async () => {
  await postForm('/admin/categories', { name: '临时分类', icon: 'gift' });
  const cat = store.categories().find((c) => c.name === '临时分类');
  assert.equal(cat.icon, 'gift');
  await postForm(`/admin/categories/${cat.id}`, { name: '改名后', icon: 'not-an-icon' });
  assert.deepEqual([store.categories().find((c) => c.id === cat.id).name, store.categories().find((c) => c.id === cat.id).icon], ['改名后', 'spark']);

  const p = store.adminProducts()[0];
  await postForm(`/admin/products/${p.id}`, { name: p.name, price: p.priceLabel, category_id: String(cat.id), status: p.status });
  assert.equal(store.product(p.id).category_id, cat.id);
  await app.request(`/admin/categories/${cat.id}/delete`, { method: 'POST', headers: { cookie } });
  assert.equal(store.product(p.id).category_id, null);
  assert.match(await (await app.request('/')).text(), /data-cat="none"/);
});

test('店铺设置：店名、主题色、公告、联系方式生效', async () => {
  const res = await postForm('/admin/settings', {
    shop_name: '我的测试店',
    tagline: '一句话',
    notice: '第一条\n第二条',
    notice_popup: '1',
    wechat: 'my_wechat',
    qq: '12345 6789',
    theme: 'sunset',
    theme_color: '#00C853',
    wechat_qr_file: photo,
  });
  assert.equal(res.status, 302);
  const home = await (await app.request('/')).text();
  assert.match(home, /<title>我的测试店<\/title>/);
  assert.match(home, /--accent:#FF7A45/);
  assert.match(home, /第一条 · 第二条/);
  assert.match(home, /data-popup="1"/);
  assert.match(home, /my_wechat/);
  assert.match(home, /uin=123456789/);
  assert.match(home, /id="qrBtn"/);

  await postForm('/admin/settings', { shop_name: '我的测试店', theme: 'custom', theme_color: '#00C853' });
  assert.match(await (await app.request('/')).text(), /--accent:#00C853/);
});

test('修改密码：需要当前密码，新密码立即生效', async () => {
  const bad = await postForm('/admin/password', { current: 'wrong', password: 'new-password-2', confirm: 'new-password-2' });
  assert.equal(bad.status, 400);
  const short = await postForm('/admin/password', { current: PASSWORD, password: 'short', confirm: 'short' });
  assert.equal(short.status, 400);
  const ok = await postForm('/admin/password', { current: PASSWORD, password: 'new-password-2', confirm: 'new-password-2' });
  assert.equal(ok.status, 302);

  const login = (password) => app.request('/admin/login', { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.2' }, body: new URLSearchParams({ password }) });
  assert.equal((await login(PASSWORD)).status, 401);
  assert.equal((await login('new-password-2')).status, 302);
});

test('导出备份是一个完整的 ZIP，包含数据库和图片', async () => {
  const res = await get('/admin/export');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, '以 ZIP 文件头开始');
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, '以 ZIP 目录结束标记收尾');
  const entries = buf.readUInt16LE(end + 10);
  const names = [];
  let pos = buf.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i++) {
    assert.equal(buf.readUInt32LE(pos), 0x02014b50);
    const len = buf.readUInt16LE(pos + 28);
    names.push(buf.subarray(pos + 46, pos + 46 + len).toString());
    pos += 46 + len;
  }
  assert.ok(names.includes('shop.db'));
  assert.ok(names.some((n) => /^uploads\/[0-9a-f]+\.webp$/.test(n)));
  assert.ok(!fs.readdirSync(dataDir).some((f) => f.startsWith('export-')), '临时快照应被清理');
});

test('清空示例数据后首页显示空状态', async () => {
  const res = await app.request('/admin/demo/clear', { method: 'POST', headers: { cookie } });
  assert.equal(res.status, 302);
  assert.equal(store.adminProducts().length, 0);
  assert.equal(store.settings().demo, '0');
  assert.match(await (await app.request('/')).text(), /店主还在上架商品/);
});
