import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { renderMarkdown } from './markdown.js';
import { formatNum, hueOf, parsePrice, parseTags, tagKind } from './util.js';

/** 店铺设置的全部字段和默认值。设置表里只存改动过的项。 */
export const SETTING_DEFAULTS = {
  shop_name: '我的 AI 小铺',
  tagline: '精选 AI 工具与会员，价格透明。看中了直接联系我。',
  avatar: '',
  stat_num: '',
  stat_label: '',
  notice: '',
  notice_popup: '0',
  wechat: '',
  wechat_qr: '',
  qq: '',
  telegram: '',
  email: '',
  extra_label: '',
  extra_value: '',
  hours: '',
  theme: 'aurora',
  theme_color: '#7B61FF',
  footer: '',
  icp: '',
  demo: '0',
};

/** 分类可选的图标，用在自动封面上。 */
export const CATEGORY_ICONS = ['spark', 'chat', 'image', 'code', 'bolt', 'video', 'wave', 'doc', 'globe', 'box', 'star', 'gift'];

export const STATUSES = { on: '在售', out: '缺货', off: '下架' };

const MIGRATIONS = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE categories (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     icon TEXT NOT NULL DEFAULT 'spark',
     sort INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE products (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
     price_text TEXT NOT NULL DEFAULT '',
     price_num REAL,
     orig_price REAL,
     cover TEXT NOT NULL DEFAULT '',
     tags TEXT NOT NULL DEFAULT '[]',
     body_md TEXT NOT NULL DEFAULT '',
     body_html TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'on',
     pinned INTEGER NOT NULL DEFAULT 0,
     sort INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX products_order ON products (pinned DESC, sort ASC, id DESC);
   CREATE TABLE images (
     id TEXT PRIMARY KEY,
     w INTEGER NOT NULL,
     h INTEGER NOT NULL,
     blur TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,
];

const PRODUCT_ORDER = 'ORDER BY p.pinned DESC, p.sort ASC, p.id DESC';
const PRODUCT_SELECT = `SELECT p.*, c.name AS category_name, c.icon AS category_icon, i.w AS cover_w, i.h AS cover_h, i.blur AS cover_blur
  FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN images i ON i.id = p.cover`;

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.uploadsDir = path.join(dataDir, 'uploads');
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'shop.db'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.#migrate();
    this.settingsCache = null;
  }

  #migrate() {
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  #tx(fn) {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close() {
    this.db.close();
  }

  /* ---------- 设置 ---------- */

  settings() {
    if (!this.settingsCache) {
      const rows = this.db.prepare('SELECT key, value FROM settings').all();
      this.settingsCache = { ...SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    }
    return this.settingsCache;
  }

  setSettings(values) {
    const stmt = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.#tx(() => {
      for (const [k, v] of Object.entries(values)) stmt.run(k, String(v ?? ''));
    });
    this.settingsCache = null;
  }

  /** 内部用的密钥类设置（密码哈希、会话密钥），不出现在默认值里。 */
  secret(key) {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
  }

  /** 会话签名密钥，第一次用到时生成。 */
  sessionSecret() {
    let s = this.secret('session_secret');
    if (!s) {
      s = crypto.randomBytes(32).toString('hex');
      this.setSettings({ session_secret: s });
    }
    return s;
  }

  /* ---------- 分类 ---------- */

  /** @param {boolean} publicOnly 只统计前台可见（未下架）的商品数 */
  categories(publicOnly = false) {
    const where = publicOnly ? "AND p.status != 'off'" : '';
    return this.db
      .prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id ${where}) AS count FROM categories c ORDER BY c.sort ASC, c.id ASC`)
      .all();
  }

  addCategory(name, icon = 'spark') {
    const sort = this.db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories').get().s;
    return Number(this.db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)').run(name, validIcon(icon), sort).lastInsertRowid);
  }

  updateCategory(id, { name, icon }) {
    this.db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, validIcon(icon), id);
  }

  deleteCategory(id) {
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  reorderCategories(ids) {
    const stmt = this.db.prepare('UPDATE categories SET sort = ? WHERE id = ?');
    this.#tx(() => ids.forEach((id, i) => stmt.run(i + 1, id)));
  }

  /* ---------- 商品 ---------- */

  publicProducts() {
    return this.db.prepare(`${PRODUCT_SELECT} WHERE p.status != 'off' ${PRODUCT_ORDER}`).all().map(shape);
  }

  adminProducts() {
    return this.db.prepare(`${PRODUCT_SELECT} ${PRODUCT_ORDER}`).all().map(shape);
  }

  product(id) {
    const row = this.db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);
    return row ? shape(row) : null;
  }

  /** 把表单数据整理成可以入库的字段。 */
  #fields(input) {
    const price = parsePrice(input.price);
    const orig = parsePrice(input.orig_price);
    const body = String(input.body_md ?? '');
    return {
      name: String(input.name ?? '').trim().slice(0, 120),
      category_id: Number(input.category_id) || null,
      price_text: price.text.slice(0, 20),
      price_num: price.num,
      orig_price: orig.num,
      cover: String(input.cover ?? ''),
      tags: JSON.stringify(Array.isArray(input.tags) ? input.tags : parseTags(input.tags)),
      body_md: body,
      body_html: renderMarkdown(body, (id) => this.image(id)),
      status: STATUSES[input.status] ? input.status : 'on',
      pinned: input.pinned ? 1 : 0,
    };
  }

  createProduct(input) {
    const f = this.#fields(input);
    // 新商品排在未置顶商品的最前面
    const sort = this.db.prepare('SELECT COALESCE(MIN(sort), 0) - 1 AS s FROM products').get().s;
    const r = this.db
      .prepare(
        `INSERT INTO products (name, category_id, price_text, price_num, orig_price, cover, tags, body_md, body_html, status, pinned, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(f.name, f.category_id, f.price_text, f.price_num, f.orig_price, f.cover, f.tags, f.body_md, f.body_html, f.status, f.pinned, sort);
    return Number(r.lastInsertRowid);
  }

  updateProduct(id, input) {
    const f = this.#fields(input);
    this.db
      .prepare(
        `UPDATE products SET name = ?, category_id = ?, price_text = ?, price_num = ?, orig_price = ?, cover = ?, tags = ?,
         body_md = ?, body_html = ?, status = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(f.name, f.category_id, f.price_text, f.price_num, f.orig_price, f.cover, f.tags, f.body_md, f.body_html, f.status, f.pinned, id);
  }

  /** 列表里的快捷修改：只改价格、状态或置顶。 */
  patchProduct(id, patch) {
    if (patch.price !== undefined) {
      const price = parsePrice(patch.price);
      if (!price.text) throw new Error('价格不能为空');
      this.db.prepare("UPDATE products SET price_text = ?, price_num = ?, updated_at = datetime('now') WHERE id = ?").run(price.text.slice(0, 20), price.num, id);
    }
    if (patch.status !== undefined && STATUSES[patch.status]) {
      this.db.prepare("UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?").run(patch.status, id);
    }
    if (patch.pinned !== undefined) {
      this.db.prepare("UPDATE products SET pinned = ?, updated_at = datetime('now') WHERE id = ?").run(patch.pinned ? 1 : 0, id);
    }
  }

  duplicateProduct(id) {
    const p = this.product(id);
    if (!p) return null;
    return this.createProduct({
      name: `${p.name}（副本）`,
      category_id: p.category_id,
      price: p.price_text,
      orig_price: p.orig_price ?? '',
      cover: p.cover,
      tags: p.tags.map((t) => t.text),
      body_md: p.body_md,
      status: 'off', // 副本先下架，改好再上架
      pinned: 0,
    });
  }

  deleteProduct(id) {
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }

  reorderProducts(ids) {
    const stmt = this.db.prepare('UPDATE products SET sort = ? WHERE id = ?');
    this.#tx(() => ids.forEach((id, i) => stmt.run(i + 1, id)));
  }

  deleteAllProductsAndCategories() {
    this.#tx(() => {
      this.db.exec('DELETE FROM products; DELETE FROM categories;');
    });
  }

  /* ---------- 图片 ---------- */

  addImage({ id, w, h, blur }) {
    this.db.prepare('INSERT INTO images (id, w, h, blur) VALUES (?, ?, ?, ?)').run(id, w, h, blur);
  }

  image(id) {
    return id ? this.db.prepare('SELECT * FROM images WHERE id = ?').get(id) : undefined;
  }

  /** 找出已经没有任何地方引用、并且上传超过一天的图片。 */
  orphanImageIds() {
    const used = new Set();
    const s = this.settings();
    [s.avatar, s.wechat_qr].forEach((id) => id && used.add(id));
    for (const p of this.db.prepare('SELECT cover, body_md FROM products').all()) {
      if (p.cover) used.add(p.cover);
      for (const m of p.body_md.matchAll(/\/uploads\/([0-9a-f]+)\.webp/g)) used.add(m[1]);
    }
    return this.db
      .prepare("SELECT id FROM images WHERE created_at < datetime('now', '-1 day')")
      .all()
      .map((r) => r.id)
      .filter((id) => !used.has(id));
  }

  removeImageRow(id) {
    this.db.prepare('DELETE FROM images WHERE id = ?').run(id);
  }

  /** 导出一份一致的数据库快照，供备份使用。 */
  snapshotTo(file) {
    fs.rmSync(file, { force: true });
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
}

function validIcon(icon) {
  return CATEGORY_ICONS.includes(icon) ? icon : 'spark';
}

/** 把数据库行整理成模板直接能用的商品对象。 */
function shape(row) {
  const isNum = row.price_num !== null;
  return {
    ...row,
    tags: JSON.parse(row.tags).map((text) => ({ text, kind: tagKind(text) })),
    priceIsNum: isNum,
    priceLabel: isNum ? formatNum(row.price_num) : row.price_text,
    origLabel: row.orig_price !== null && isNum && row.orig_price > row.price_num ? formatNum(row.orig_price) : '',
    saveLabel: row.orig_price !== null && isNum && row.orig_price > row.price_num ? formatNum(row.orig_price - row.price_num) : '',
    out: row.status === 'out',
    off: row.status === 'off',
    pinned: !!row.pinned,
    icon: row.category_icon || 'spark',
    hue: hueOf(row.id),
  };
}
