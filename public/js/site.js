/* 极光 Aurora · 前台交互。动效编号（A/E/F）对应 docs/ui-design.md 第 6 节 */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lite = root.classList.contains('lite');
const noIntro = root.classList.contains('no-intro');
const EASE = 'cubic-bezier(.16,1,.3,1)';
const anim = (el, kf, opt) => (reduce ? null : el.animate(kf, { easing: EASE, fill: 'backwards', ...opt }));
window.__ready = true;

/* ---------- F6 轻提示 ---------- */
const toastEl = $('#toast');
let toastT;
function toast(msg) {
  $('#toastText').textContent = msg;
  toastEl.classList.add('is-show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-show'), 2000);
}

/* ---------- F5 复制 ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) { /* 换下一种方式 */ }
  try {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
async function doCopy(btn, text, msg) {
  if (!(await copyText(text))) {
    // 浏览器不允许复制：给出可以长按选中的文本框
    $('#copyFallbackText').value = text;
    openSheet($('#copyFallback'));
    return;
  }
  if (btn) {
    btn.classList.add('is-done');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => btn.classList.remove('is-done'), 2000);
  }
  toast(msg);
  if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* 忽略 */ } }
}

/* ---------- F4 涟漪 ---------- */
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn,.chip');
  if (!b || reduce) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.append(s);
  s.addEventListener('animationend', () => s.remove());
});

/* ---------- A2 背景视差 / F3 磁吸按钮（仅鼠标设备） ---------- */
if (fine && !reduce && !lite) {
  const bgIn = $('#bgIn');
  addEventListener('pointermove', (e) => {
    bgIn.style.transform = `translate3d(${(e.clientX / innerWidth - 0.5) * -28}px,${(e.clientY / innerHeight - 0.5) * -28}px,0)`;
  }, { passive: true });
}
if (fine && !reduce) {
  $$('[data-magnetic]').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
      b.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px');
    });
    b.addEventListener('pointerleave', () => {
      b.style.setProperty('--tx', '0px');
      b.style.setProperty('--ty', '0px');
    });
  });
}

/* ---------- F10 深浅色切换 ---------- */
function setTheme(next, x, y) {
  const apply = () => {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* 隐私模式下不保存 */ }
  };
  if (!document.startViewTransition || reduce) return apply();
  root.classList.add('vt-theme');
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 560, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
  vt.finished.catch(() => {}).finally(() => root.classList.remove('vt-theme'));
}
$('#themeBtn')?.addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', r.left + r.width / 2, r.top + r.height / 2);
});

/* ---------- F7 / F9 浮层 ---------- */
let lastFocus = null;
function openSheet(el) {
  if (!el || el.classList.contains('is-open')) return;
  lastFocus = document.activeElement;
  el.classList.add('is-open');
  el.style.removeProperty('--drag');
  document.body.style.overflow = 'hidden';
  $$('[data-stagger]', el).forEach((n, i) => anim(n, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 120 + i * 60 }));
  const f = $('[data-autofocus]', el) || $('.sheet__head .iconbtn', el);
  if (f) f.focus({ preventScroll: true });
}
function closeSheet(el) {
  el.classList.remove('is-open', 'is-drag');
  if (!$('.sheet.is-open')) document.body.style.overflow = '';
  if (el.id === 'contact') {
    $('#qr')?.classList.remove('is-open');
    $('#qrBtn')?.setAttribute('aria-expanded', 'false');
  }
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-contact]')) return openSheet($('#contact'));
  if (t.closest('[data-notice]')) return openSheet($('#notice'));
  const close = t.closest('[data-close]');
  if (close) {
    const sheet = close.closest('.sheet');
    if (close.hasAttribute('data-mute')) { try { localStorage.setItem('notice-off', sheet.dataset.ver); } catch (err) { /* 忽略 */ } }
    return closeSheet(sheet);
  }
  const cp = t.closest('.copy');
  if (cp) return doCopy(cp, cp.dataset.copy, cp.dataset.msg || '已复制');
  if (t.closest('#qrBtn')) {
    const open = $('#qr').classList.toggle('is-open');
    $('#qrBtn').setAttribute('aria-expanded', open);
    return;
  }
  const qq = t.closest('[data-qq]');
  // 微信里打不开 QQ：改成复制号码并提示
  if (qq && qq.dataset.qq && /MicroMessenger/i.test(navigator.userAgent)) {
    e.preventDefault();
    return doCopy(null, qq.dataset.qq, '已复制 QQ 号，请到 QQ 里添加');
  }
  if (t.closest('#shareBtn')) return doCopy(null, location.href, '商品链接已复制');
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#lightbox.is-open')) return closeLightbox();
    $$('.sheet.is-open').forEach(closeSheet);
    return;
  }
  if (e.key !== 'Tab') return;
  // 浮层打开时，焦点只在浮层内循环
  const s = $$('.sheet.is-open').pop();
  if (!s) return;
  const f = $$('button,a[href],input', $('.sheet__panel', s)).filter((n) => n.offsetParent !== null);
  if (!f.length) return;
  const a = document.activeElement, first = f[0], last = f[f.length - 1];
  if (!s.contains(a) || (e.shiftKey && a === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});

/* 手机上按住横条下拉关闭联系面板 */
(() => {
  const sheet = $('#contact'), grab = $('#grab');
  if (!grab) return;
  let y0 = 0, t0 = 0, dy = 0, on = false;
  grab.addEventListener('pointerdown', (e) => { on = true; y0 = e.clientY; t0 = e.timeStamp; dy = 0; sheet.classList.add('is-drag'); grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', (e) => { if (!on) return; dy = Math.max(0, e.clientY - y0); sheet.style.setProperty('--drag', dy + 'px'); });
  const end = (e) => {
    if (!on) return;
    on = false;
    sheet.classList.remove('is-drag');
    sheet.style.removeProperty('--drag');
    if (dy > 120 || dy / Math.max(1, e.timeStamp - t0) > 0.6) closeSheet(sheet);
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
})();

/* ---------- 公告：A6 跑马灯 + 首次进入弹窗 ---------- */
(() => {
  const text = $('.notice__text');
  if (text) {
    const first = text.firstElementChild, track = text.parentElement;
    const w = first.getBoundingClientRect().width;
    if (w - 56 > track.clientWidth && !reduce) {
      text.style.setProperty('--marquee', Math.max(8, w / 40).toFixed(1) + 's'); // 约 40px/秒
      text.classList.add('is-run');
    } else {
      first.nextElementSibling?.remove(); // 一行放得下就不滚动
    }
  }
  const modal = $('#notice');
  if (!modal || modal.dataset.popup !== '1' || noIntro) return;
  let seen = '';
  try { seen = localStorage.getItem('notice-off') || sessionStorage.getItem('notice-seen') || ''; } catch (e) { /* 忽略 */ }
  if (seen === modal.dataset.ver) return;
  try { sessionStorage.setItem('notice-seen', modal.dataset.ver); } catch (e) { /* 忽略 */ }
  setTimeout(() => openSheet(modal), 900);
})();

/* ---------- 图片：F12 渐显，加载失败回退到自动封面 ---------- */
$$('.cover--img').forEach((cover) => {
  const img = $('.cover__img', cover);
  const done = () => cover.classList.add('is-loaded');
  const fail = () => {
    cover.classList.remove('cover--img');
    cover.style.removeProperty('--ph');
    img.remove();
    cover.insertAdjacentHTML('beforeend', `<span class="cover__icon"><svg class="ico"><use href="#i-${cover.dataset.icon || 'spark'}"/></svg></span>`);
  };
  if (img.complete) (img.naturalWidth ? done : fail)();
  else { img.addEventListener('load', done); img.addEventListener('error', fail); }
});

/* ---------- F13 图片放大 ---------- */
const lightbox = $('#lightbox');
let lbSource = null;
function openLightbox(src, sourceEl) {
  const img = $('img', lightbox);
  lbSource = sourceEl;
  img.src = src;
  const show = () => {
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const a = sourceEl.getBoundingClientRect(), b = img.getBoundingClientRect();
    if (b.width) anim(img, [{ transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px,${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${a.width / b.width})` }, { transform: 'none' }], { duration: 420 });
  };
  img.decode ? img.decode().then(show, show) : show();
}
function closeLightbox() {
  const img = $('img', lightbox);
  const finish = () => { lightbox.classList.remove('is-open'); document.body.style.overflow = ''; img.style.transform = ''; };
  if (reduce || !lbSource || !document.contains(lbSource)) return finish();
  const a = lbSource.getBoundingClientRect(), b = img.getBoundingClientRect();
  lightbox.classList.remove('is-open');
  lightbox.style.visibility = 'visible';
  img.animate([{ transform: getComputedStyle(img).transform }, { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px,${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${a.width / b.width})`, opacity: 0.4 }], { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)' })
    .finished.catch(() => {}).finally(() => { lightbox.style.visibility = ''; finish(); });
}
if (lightbox) {
  document.addEventListener('click', (e) => {
    const z = e.target.closest('.prose img.zoomable, .detail__media .cover--img');
    if (!z) return;
    const img = z.matches('img') ? z : $('.cover__img', z);
    if (img) openLightbox(img.currentSrc || img.src, img);
  });
  // 点任意位置关闭；没有放大时可以下拉关闭
  let y0 = null, dy = 0;
  const img = $('img', lightbox);
  lightbox.addEventListener('click', () => { if (Math.abs(dy) < 8) closeLightbox(); dy = 0; });
  img.addEventListener('pointerdown', (e) => { if ((window.visualViewport?.scale || 1) < 1.02) { y0 = e.clientY; dy = 0; } });
  img.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = e.clientY - y0; if (dy > 0) img.style.transform = `translateY(${dy}px) scale(${Math.max(0.8, 1 - dy / 900)})`; });
  const up = () => { if (y0 === null) return; y0 = null; if (dy > 110) closeLightbox(); else img.style.transform = ''; };
  img.addEventListener('pointerup', up);
  img.addEventListener('pointercancel', up);
}

/* ---------- 滚动：E6 顶栏收缩、E7 分类吸顶、E11 回到顶部 ---------- */
const top = $('#top'), toolbar = $('#toolbar'), totop = $('#totop');
function onScroll() {
  const y = scrollY;
  top.classList.toggle('is-scrolled', y > 96);
  if (toolbar) toolbar.classList.toggle('is-stuck', toolbar.getBoundingClientRect().top <= top.offsetHeight + 1 && y > 96);
  if (totop) {
    const max = root.scrollHeight - innerHeight;
    totop.style.setProperty('--p', max > 0 ? ((y / max) * 100).toFixed(1) : 0);
    totop.classList.toggle('is-show', y > 520);
  }
}
addEventListener('scroll', onScroll, { passive: true });
totop?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));
onScroll();

/* ---------- 详情页 ---------- */
const detail = $('#detail');
if (detail) {
  // 记下刚看的商品，返回首页时封面可以变形回对应的卡片（E8）
  try { sessionStorage.setItem('vt', detail.dataset.id || ''); } catch (e) { /* 忽略 */ }
  // 从首页点进来的，「返回」直接回到上一页，保留滚动位置和筛选
  const fromHome = (() => { try { const r = new URL(document.referrer); return r.origin === location.origin && r.pathname === '/'; } catch (e) { return false; } })();
  if (fromHome && history.length > 1) {
    $$('[data-back]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); history.back(); }));
  }
}

/* ---------- 首页 ---------- */
const grid = $('#grid');
if (grid) initHome();

function initHome() {
  const chips = $('#chips'), ind = $('#ind'), q = $('#q'), search = $('#search'), empty = $('#empty');
  const cards = $$('.card', grid);
  const saved = history.state || {};
  const state = { cat: saved.cat || 'all', q: saved.q || '' };
  const match = (c) => (state.cat === 'all' || c.dataset.cat === state.cat) && (!state.q || c.dataset.text.includes(state.q));
  const save = () => { try { history.replaceState({ ...state }, ''); } catch (e) { /* 忽略 */ } };

  /* E3 分类指示器 */
  function moveInd(animate = true) {
    const a = $('.chip[aria-pressed="true"]', chips);
    if (!a) return;
    ind.classList.toggle('no-anim', !animate);
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  function selectChip(cat) {
    $$('.chip', chips).forEach((x) => x.setAttribute('aria-pressed', x.dataset.cat === cat));
  }

  /* E2 卡片入场 */
  let io = null;
  function showAll() {
    if (io) { io.disconnect(); io = null; }
    cards.forEach((c) => c.classList.remove('pre'));
  }
  if (reduce || noIntro || !('IntersectionObserver' in window)) showAll();
  else {
    io = new IntersectionObserver((es) => {
      es.filter((e) => e.isIntersecting).forEach((e, i) => {
        io.unobserve(e.target);
        e.target.classList.remove('pre');
        anim(e.target, [{ opacity: 0, transform: 'translateY(28px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: Math.min(i, 8) * 55 });
      });
    }, { threshold: 0.12 });
    cards.forEach((c) => io.observe(c));
  }

  /* E4 筛选重排 */
  async function applyFilter(animate = true) {
    showAll();
    const leaving = cards.filter((c) => !c.hidden && !match(c));
    if (animate && !reduce && leaving.length) {
      await Promise.all(leaving.map((c) => c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {})));
    }
    const first = new Map(cards.filter((c) => !c.hidden).map((c) => [c, c.getBoundingClientRect()]));
    let shown = 0;
    cards.forEach((c) => { c.getAnimations().forEach((a) => a.cancel()); c.hidden = !match(c); if (!c.hidden) shown++; });
    if (empty) empty.hidden = shown > 0 || !cards.length;
    if (!animate || reduce) return;
    let n = 0;
    cards.forEach((c) => {
      if (c.hidden) return;
      const a = first.get(c), b = c.getBoundingClientRect();
      if (a) { const dx = a.left - b.left, dy = a.top - b.top; if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 440, easing: EASE }); }
      else anim(c, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(n++, 8) * 40 });
    });
    if (!shown && empty) anim(empty, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
  }

  chips?.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c || c.getAttribute('aria-pressed') === 'true') return;
    state.cat = c.dataset.cat;
    selectChip(state.cat);
    moveInd();
    c.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    save();
    applyFilter();
  });

  /* E5 搜索 */
  let qT;
  function setQuery(v) {
    state.q = v.trim().toLowerCase();
    search.classList.toggle('has-value', !!v);
    save();
    clearTimeout(qT);
    qT = setTimeout(applyFilter, 120);
  }
  if (q) {
    q.addEventListener('input', () => setQuery(q.value));
    q.addEventListener('focus', () => toolbar.classList.add('is-searching'));
    q.addEventListener('blur', () => { if (!q.value) toolbar.classList.remove('is-searching'); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
    $('#qClear').addEventListener('click', (e) => { e.preventDefault(); q.value = ''; setQuery(''); q.blur(); toolbar.classList.remove('is-searching'); });
  }
  $('#emptyReset')?.addEventListener('click', () => {
    if (q) { q.value = ''; search.classList.remove('has-value'); toolbar.classList.remove('is-searching'); }
    state.q = ''; state.cat = 'all';
    selectChip('all'); moveInd(); save(); applyFilter();
  });

  /* E8：点卡片时给封面起名，跨页面时封面会变形放大成详情页大封面 */
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    $$('.cover', grid).forEach((c) => (c.style.viewTransitionName = ''));
    $('.cover', card).style.viewTransitionName = 'cover';
  });

  /* F1 卡片光斑 + 倾斜（仅鼠标设备） */
  if (fine && !reduce) {
    grid.addEventListener('pointermove', (e) => {
      const c = e.target.closest('.card');
      if (!c) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      c.style.setProperty('--mx', x + 'px');
      c.style.setProperty('--my', y + 'px');
      c.style.setProperty('--ry', ((x / r.width - 0.5) * 8).toFixed(2) + 'deg');
      c.style.setProperty('--rx', ((0.5 - y / r.height) * 8).toFixed(2) + 'deg');
    });
    grid.addEventListener('pointerout', (e) => {
      const c = e.target.closest('.card');
      if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
    });
  }

  /* E1 数字滚动 */
  if (!reduce && !noIntro) {
    $$('[data-count]').forEach((el) => {
      const to = +el.dataset.count;
      if (!Number.isFinite(to)) return;
      const t0 = performance.now() + 420, dur = 900;
      el.textContent = '0';
      (function tick(now) {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(tick);
      })(performance.now());
    });
  }

  /* 恢复上次的筛选（从详情页返回时） */
  if (state.cat !== 'all' && !$(`.chip[data-cat="${CSS.escape(state.cat)}"]`, chips)) state.cat = 'all';
  if (state.cat !== 'all' || state.q) {
    selectChip(state.cat);
    if (q && state.q) { q.value = state.q; search.classList.add('has-value'); toolbar.classList.add('is-searching'); }
    applyFilter(false);
  }
  if (chips) {
    moveInd(false);
    addEventListener('resize', () => moveInd(false));
    document.fonts?.ready.then(() => moveInd(false));
    requestAnimationFrame(() => ind.classList.remove('no-anim'));
  }
}
})();
