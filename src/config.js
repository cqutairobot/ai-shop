import path from 'node:path';

const env = process.env;

/** 运行配置，全部来自环境变量，都有默认值。 */
export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  /** 数据目录：里面是 shop.db 和 uploads/，备份时拷贝这个目录即可 */
  dataDir: path.resolve(env.DATA_DIR || 'data'),
  /** 后台初始密码，只在第一次启动（数据库里还没有密码）时生效 */
  adminPassword: env.ADMIN_PASSWORD || '',
  /** 放在 Caddy / Nginx 后面时设为 1，用于读取真实访客 IP 和 HTTPS 状态 */
  trustProxy: env.TRUST_PROXY === '1',
  /** 第一次启动时是否写入示例店铺和示例商品 */
  seedDemo: env.SEED_DEMO !== '0',
};
