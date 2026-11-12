import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';

const { app, store, notes } = createApp(config);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`AI 商品展示网站已启动：http://localhost:${info.port}  后台：http://localhost:${info.port}/admin`);
  console.log(`数据目录：${config.dataDir}`);
  for (const n of notes) console.log(n);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
