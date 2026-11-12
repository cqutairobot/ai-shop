import { html } from 'hono/html';

export const ico = (name, cls = '') => html`<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}" /></svg>`;

/** 价格：数字用展示字体加「¥」，文字（如「面议」）用正文字体。 */
export function priceHtml(p) {
  if (!p.priceIsNum) return html`<span class="price price--txt">${p.priceLabel || '面议'}</span>`;
  return html`<span class="price${p.priceLabel.length > 5 ? ' price--long' : ''}"><i>¥</i>${p.priceLabel}</span>`;
}

export const origHtml = (p) => (p.origLabel ? html`<s class="orig">¥${p.origLabel}</s>` : '');

export const tagsHtml = (p) =>
  p.tags.length ? html`<div class="tags">${p.tags.map((t) => html`<span class="tag${t.kind ? ` tag--${t.kind}` : ''}">${t.text}</span>`)}</div>` : '';

/**
 * 商品封面。上传了图片就显示图片（先显示模糊占位），否则显示自动生成的渐变封面。
 * @param {'s'|'l'} size 列表用缩略图，详情页用大图
 */
export function coverHtml(p, { size = 's', badge = '', eager = false } = {}) {
  if (!p.cover) {
    return html`<div class="cover" style="--h:${p.hue}"><i class="cover__art"></i><span class="cover__icon">${ico(p.icon)}</span>${badge}</div>`;
  }
  const src = `/uploads/${p.cover}${size === 's' ? '-s' : ''}.webp`;
  return html`<div class="cover cover--img" style="--h:${p.hue};--ph:url(${p.cover_blur || ''})" data-icon="${p.icon}">
    <i class="cover__art"></i>
    <img class="cover__img" src="${src}" alt="" width="${p.cover_w || 800}" height="${p.cover_h || 600}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />
    ${badge}
  </div>`;
}

export const emptyArt = html`<svg class="art" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
  <circle cx="54" cy="54" r="26" /><path d="m74 74 20 20" /><path d="M44 50h.01M64 50h.01M46 64c5-4 11-4 16 0" stroke-width="3" />
  <path d="M96 26v10M91 31h10M22 88v8M18 92h8" opacity=".6" />
</svg>`;
