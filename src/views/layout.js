import { html, raw } from 'hono/html';
import { SPRITE } from './icons.js';
import { coverHtml, ico, priceHtml } from './parts.js';

/**
 * <head> 里最先执行的一小段脚本，必须在首次绘制前跑完：
 * 深浅色、是否播放入场动画、轻量模式、极光相位（跨页面保持连续）。
 */
const HEAD_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem('theme')}catch(e){}
if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
d.setAttribute('data-theme',t);d.classList.add('js');
var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
if(n&&n.type==='back_forward')d.classList.add('no-intro');
var c=navigator.connection;if((navigator.deviceMemory&&navigator.deviceMemory<=4)||(c&&c.saveData))d.classList.add('lite');
d.style.setProperty('--aurora-t',-((Date.now()/1000)%15808).toFixed(2)+'s');
setTimeout(function(){if(!window.__ready)d.classList.remove('js')},4000);
addEventListener('pagereveal',function(e){if(!e.viewTransition)return;var id;try{id=sessionStorage.getItem('vt')}catch(x){}
var el=id&&document.querySelector('.card[data-id="'+id+'"] .cover');if(!el)return;el.style.viewTransitionName='cover';
e.viewTransition.finished.catch(function(){}).then(function(){el.style.viewTransitionName=''})});
addEventListener('pageshow',function(e){if(e.persisted)d.classList.add('no-intro')});
})();`;

const COPY_SVG = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5 10 17.5 19 7"/></svg>');
const copyBtn = (text, msg) => html`<button class="copy" data-copy="${text}" data-msg="${msg}"><span>复制</span>${COPY_SVG}</button>`;

/** 把设置里填写的联系方式整理成联系面板里的一行行。没填的不显示。 */
function contactWays(s) {
  const ways = [];
  if (s.wechat) ways.push({ icon: 'wechat', color: '#07C160', label: '微信号', value: s.wechat, msg: '微信号已复制', qr: s.wechat_qr });
  if (s.qq) {
    ways.push({ icon: 'qq', color: '#12B7F5', label: 'QQ 号', value: s.qq, msg: 'QQ 号已复制', link: { href: `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(s.qq)}&site=qq&menu=yes`, text: '打开 QQ', qq: s.qq } });
  }
  if (s.telegram) {
    const name = s.telegram.replace(/^@|^https?:\/\/t\.me\//i, '');
    ways.push({ icon: 'tg', color: '#2AABEE', label: 'Telegram', value: `@${name}`, msg: 'Telegram 已复制', link: { href: `https://t.me/${encodeURIComponent(name)}`, text: '打开' } });
  }
  if (s.email) ways.push({ icon: 'mail', color: 'var(--cta-from)', label: '邮箱', value: s.email, msg: '邮箱已复制', link: { href: `mailto:${s.email}`, text: '写邮件' } });
  if (s.extra_value) {
    const isUrl = /^https?:\/\//i.test(s.extra_value);
    ways.push({ icon: 'share', color: 'var(--cta-to)', label: s.extra_label || '其他', value: s.extra_value, msg: '已复制', link: isUrl ? { href: s.extra_value, text: '打开' } : null });
  }
  return ways;
}

function contactSheet(s, product) {
  const ways = contactWays(s);
  const say = product
    ? `你好，我想了解【${product.name}】${product.priceIsNum ? `（¥${product.priceLabel}）` : ''}`
    : '你好，我想了解一下店里的商品';
  return html`<div class="sheet" id="contact" role="dialog" aria-modal="true" aria-labelledby="contactTitle">
    <div class="sheet__scrim" data-close></div>
    <div class="sheet__panel">
      <span class="sheet__grab" id="grab" aria-hidden="true"></span>
      <div class="sheet__head">
        <h2 id="contactTitle">${product ? '联系购买' : '联系我'}</h2>
        <button class="iconbtn" data-close aria-label="关闭">${ico('x')}</button>
      </div>
      ${product
        ? html`<div class="sum" data-stagger>${coverHtml(product, { eager: true })}<div><div class="sum__t">${product.name}</div>${priceHtml(product)}</div></div>`
        : ''}
      ${ways.length
        ? html`<div class="say" data-stagger>
              <p><small>把这句话发给我，我就知道你想买什么</small>${say}</p>
              ${copyBtn(say, '咨询语已复制，去粘贴给店主吧')}
            </div>
            <div class="ways">
              ${ways.map(
                (w) => html`<div class="way" data-stagger style="--c:${w.color}">
                    <span class="way__ic">${ico(w.icon)}</span>
                    <span class="way__m"><small>${w.label}</small><b>${w.value}</b></span>
                    ${w.qr ? html`<button class="btn btn--glass btn--sm" id="qrBtn" aria-expanded="false" aria-controls="qr">二维码</button>` : ''}
                    ${w.link
                      ? html`<a class="btn btn--glass btn--sm" href="${w.link.href}" target="_blank" rel="noopener noreferrer" data-qq="${w.link.qq || ''}">${w.link.text}</a>`
                      : ''}
                    ${copyBtn(w.value, w.msg)}
                  </div>
                  ${w.qr
                    ? html`<div class="qr" id="qr"><div class="qr__in">
                        <div class="qr__box"><img src="/uploads/${w.qr}.webp" alt="微信二维码" width="176" height="176" loading="lazy" /></div>
                        <p>长按识别二维码，或保存后用微信扫一扫</p>
                      </div></div>`
                    : ''}`,
              )}
            </div>
            ${s.hours ? html`<p class="hours" data-stagger><i></i>${s.hours}</p>` : ''}`
        : html`<p class="nocontact">店主还没有填写联系方式。</p>`}
    </div>
  </div>`;
}

function noticeModal(site) {
  if (!site.noticeLines.length) return '';
  return html`<div class="sheet sheet--center" id="notice" role="dialog" aria-modal="true" aria-labelledby="noticeTitle" data-popup="${site.settings.notice_popup}" data-ver="${site.noticeVer}">
    <div class="sheet__scrim" data-close></div>
    <div class="sheet__panel modal">
      <span class="modal__tag" id="noticeTitle">${ico('horn')}店铺公告</span>
      <div class="modal__body">${site.noticeLines.map((l) => html`<p>${l}</p>`)}</div>
      <div class="modal__act">
        ${site.settings.notice_popup === '1' ? html`<button class="btn btn--ghost" data-close data-mute>不再提醒</button>` : ''}
        <button class="btn btn--primary" data-close data-autofocus>我知道了</button>
      </div>
    </div>
  </div>`;
}

/**
 * 前台所有页面共用的外壳：极光背景、顶栏、联系面板、公告弹窗、轻提示。
 * @param {object} o
 * @param {'home'|'detail'|'state'} o.kind
 */
export function layout({ site, kind, title, description, ogImage, canonical, main, product = null, extraHead = '' }) {
  const s = site.settings;
  const isDetail = kind !== 'home';
  const logo = s.avatar ? html`<img src="/uploads/${s.avatar}-s.webp" alt="" width="30" height="30" />` : ico('spark');
  const year = new Date().getFullYear();

  return html`<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="${product ? 'product' : 'website'}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${ogImage ? html`<meta property="og:image" content="${ogImage}" />` : ''}
    ${canonical ? html`<link rel="canonical" href="${canonical}" />` : ''}
    <meta name="theme-color" content="#07080D" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#F5F6FB" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script>${raw(HEAD_SCRIPT)}</script>
    <link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="${site.asset('/css/site.css')}" />
    <style>${raw(site.themeCss)}</style>
    ${extraHead}
    <script src="${site.asset('/js/site.js')}" defer></script>
  </head>
  <body class="${isDetail ? 'view-detail' : ''}">
    ${raw(SPRITE)}
    <div class="bg" aria-hidden="true">
      <div class="bg__in" id="bgIn"><i class="bg__blob bg__blob--1"></i><i class="bg__blob bg__blob--2"></i><i class="bg__blob bg__blob--3"></i></div>
      <i class="bg__grid"></i><i class="bg__grain"></i>
    </div>

    <header class="top" id="top">
      <div class="wrap top__in">
        ${isDetail ? html`<a class="iconbtn" href="/" data-back aria-label="返回首页">${ico('back')}</a>` : ''}
        <a class="top__brand" href="/" data-back><span class="top__logo">${logo}</span><span>${s.shop_name}</span></a>
        <span class="top__space"></span>
        ${isDetail ? '' : html`<button class="btn btn--primary btn--sm top__cta" data-contact>联系我</button>`}
        <button class="iconbtn theme" id="themeBtn" aria-label="切换深色 / 浅色">${ico('sun', 'sun')}${ico('moon', 'moon')}</button>
      </div>
    </header>

    ${main}

    <footer class="wrap" id="foot">
      <div class="foot">
        © ${year} ${s.shop_name} · ${s.footer || '本站只做商品展示，购买请联系店主'}
        ${s.icp ? html`<br /><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${s.icp}</a>` : ''}
      </div>
    </footer>

    ${contactSheet(s, product)} ${noticeModal(site)}

    <div class="sheet sheet--center" id="copyFallback" role="dialog" aria-modal="true" aria-labelledby="copyFallbackTitle">
      <div class="sheet__scrim" data-close></div>
      <div class="sheet__panel modal">
        <span class="modal__tag" id="copyFallbackTitle">${ico('info')}请手动复制</span>
        <p>浏览器不允许自动复制。请长按下面的文字，选中后复制。</p>
        <input class="fallback-copy" id="copyFallbackText" readonly aria-label="要复制的内容" />
        <div class="modal__act"><button class="btn btn--primary" data-close data-autofocus>好的</button></div>
      </div>
    </div>

    <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="查看大图">
      <div class="lightbox__scrim"></div>
      <img alt="" />
      <button class="iconbtn" aria-label="关闭">${ico('x')}</button>
    </div>

    <div class="toast" id="toast" role="status" aria-live="polite"><i>${ico('check')}</i><span id="toastText"></span></div>
  </body>
</html>`;
}
