import { Hono } from 'hono';
import { detailPage, homePage, statePage } from '../views/public.js';

/** 前台：首页和商品详情页，全部由服务端直接渲染成 HTML。 */
export function publicRoutes({ store, siteOf }) {
  const app = new Hono();

  // 页面内容随时可能在后台被修改，所以让浏览器每次都来确认是否有更新
  app.use(async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-cache');
  });

  app.get('/', (c) => c.html(homePage(siteOf(c), { products: store.publicProducts(), categories: store.categories(true) })));

  app.get('/p/:id{[0-9]+}', (c) => {
    const p = store.product(Number(c.req.param('id')));
    if (!p) return c.html(statePage(siteOf(c), { title: '商品不存在', text: '没有找到这个商品，去首页看看其他商品吧。' }), 404);
    if (p.off) return c.html(statePage(siteOf(c), { title: '商品已下架', text: '这个商品已经下架，去首页看看其他商品吧。' }), 404);
    return c.html(detailPage(siteOf(c), p));
  });

  return app;
}
