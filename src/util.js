/** 把用户输入的价格整理成「数字」或「文字」两种形态。 */
export function parsePrice(input) {
  const text = String(input ?? '').trim().replace(/^[¥￥]\s*/, '');
  if (text !== '' && /^\d+(\.\d+)?$/.test(text)) return { num: Number(text), text: formatNum(Number(text)) };
  return { num: null, text };
}

/** 数字去掉多余的小数位：68.00 → 68，9.90 → 9.9 */
export function formatNum(n) {
  return String(Math.round(n * 100) / 100);
}

/** 标签颜色不需要店主选择，按文字内容自动归类。 */
export function tagKind(text) {
  if (/热|爆|火/.test(text)) return 'hot';
  if (/新/.test(text)) return 'new';
  if (/保|售后|包赔/.test(text)) return 'ok';
  return '';
}

/** 把「热卖, 质保 30 天」这样的输入拆成标签数组（支持中英文逗号、顿号、换行）。 */
export function parseTags(input) {
  return String(input ?? '')
    .split(/[,，、\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** 每个商品一个固定色相，相邻商品用黄金角错开，用于自动封面。 */
export function hueOf(id) {
  return Math.round((Number(id) * 137.508 + 258) % 360);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** 简短的内容指纹，用于静态资源版本号和公告「不再提醒」。 */
export function shortHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
