import { Marked } from 'marked';
import { escapeHtml } from './util.js';

/**
 * 商品详情的排版：Markdown 加两个小扩展。
 *   ==重点==              → 彩色强调
 *   :::tip  …  :::        → 蓝色提示框
 *   :::warn …  :::        → 橙色注意框
 * 原始 HTML 一律转义，不会被当成标签执行。
 */

const ICON_INFO = '<svg class="ico" aria-hidden="true"><use href="#i-info"/></svg>';

const safeHref = (href) => (/^(https?:|mailto:|tel:|\/)/i.test(href) ? href : '#');
const safeSrc = (src) => (/^(https?:\/\/|\/uploads\/)/i.test(src) ? src : '');

const callout = {
  name: 'callout',
  level: 'block',
  start: (src) => src.match(/^:::(tip|warn)/m)?.index,
  tokenizer(src) {
    const m = /^:::(tip|warn)[ \t]*\n?([\s\S]*?)\n?:::[ \t]*(?:\n+|$)/.exec(src);
    if (!m) return undefined;
    const token = { type: 'callout', raw: m[0], kind: m[1], tokens: [] };
    this.lexer.inline(m[2].trim().replace(/\n+/g, ' '), token.tokens);
    return token;
  },
  renderer(token) {
    return `<div class="callout callout--${token.kind}">${ICON_INFO}<span>${this.parser.parseInline(token.tokens)}</span></div>\n`;
  },
};

const highlight = {
  name: 'highlight',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    const m = /^==([^=\n]+)==/.exec(src);
    if (!m) return undefined;
    const token = { type: 'highlight', raw: m[0], tokens: [] };
    this.lexer.inlineTokens(m[1], token.tokens);
    return token;
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
  },
};

/**
 * @param {string} md
 * @param {(id: string) => ({w:number,h:number,blur:string}|undefined)} [lookupImage] 用来给站内图片补上宽高和模糊占位
 */
export function renderMarkdown(md, lookupImage) {
  const marked = new Marked({ gfm: true, breaks: true });
  marked.use({
    extensions: [callout, highlight],
    renderer: {
      html: ({ text }) => escapeHtml(text),
      heading({ tokens, depth }) {
        const tag = depth <= 2 ? 'h3' : 'h4';
        return `<${tag}>${this.parser.parseInline(tokens)}</${tag}>\n`;
      },
      link({ href, tokens }) {
        const url = safeHref(href);
        const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeHtml(url)}"${ext}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, text }) {
        const src = safeSrc(href);
        if (!src) return '';
        const id = /^\/uploads\/([0-9a-f]+)\.webp$/.exec(src)?.[1];
        const info = id && lookupImage ? lookupImage(id) : undefined;
        const size = info ? ` width="${info.w}" height="${info.h}"` : '';
        const blur = info?.blur ? ` style="background-image:url(${info.blur})"` : '';
        return `<img class="zoomable" src="${escapeHtml(src)}" alt="${escapeHtml(text)}" loading="lazy" decoding="async"${size}${blur}>`;
      },
    },
  });
  return marked.parse(String(md ?? ''));
}
