/**
 * 忘记后台密码时使用：生成一个新的随机密码并打印出来。
 *   本机：npm run reset-password
 *   Docker：docker compose exec app npm run reset-password
 */
import { hashPassword, randomPassword } from './auth.js';
import { config } from './config.js';
import { Store } from './store.js';

const store = new Store(config.dataDir);
const password = randomPassword();
store.setSettings({ admin_hash: hashPassword(password) });
store.close();
console.log(`后台密码已重置为：${password}`);
console.log('请登录后台，在「店铺设置」里改成自己的密码。');
