import { html, raw } from 'hono/html';
import { layout } from './layout.js';
import { coverHtml, emptyArt, ico, origHtml, priceHtml, tagsHtml } from './parts.js';

/* ---------- 首页 ---------- */

function cardHtml(p, index) {
  const badge = p.out ? html`<span class="badge">缺货</span>` : p.pinned ? html`<span class="badge">${ico('star')}推荐</span>` : '';
  const text = [p.name, p.category_name || '', ...p.tags.map((t) => t.text)].join(' ').toLowerCase();
  return html`<a class="card pre${p.out ? ' is-out' : ''}" href="/p/${p.id}" data-id="${p.id}" data-cat="${p.category_id ?? 'none'}" data-text="${text}">
    ${coverHtml(p, { badge, eager: index < 4 })}
    <div class="card__body">
      <h3 class="card__title">${p.name}</h3>
      ${tagsHtml(p)}
      <div class="card__foot">${priceHtml(p)}${origHtml(p)}<span class="card__go">${ico('arrow')}</span></div>
    </div>
  </a>`;
}

export function homePage(site, { products, categories }) {
  const s = site.settings;
  const cats = categories.filter((c) => c.count > 0);
  const uncategorized = products.filter((p) => !p.category_id).length;
  const chip = (id, name, n, on = false) => html`<button class="chip" data-cat="${id}" aria-pressed="${on ? 'true' : 'false'}">${name}<span class="chip__n">${n}</span></button>`;
  const noticeText = site.noticeLines.join(' · ');

  const main = html`<main id="home">
    <section class="wrap hero">
      <div class="avatar" data-in>
        <span class="avatar__img">${s.avatar ? html`<img src="/uploads/${s.avatar}-s.webp" alt="${s.shop_name}" width="100" height="100" />` : ico('spark')}</span>
        <i class="avatar__dot" title="在线"></i>
      </div>
      <h1 class="hero__title" data-in style="--i:1"><span class="grad">${s.shop_name}</span></h1>
      ${s.tagline ? html`<p class="hero__sub" data-in style="--i:2">${s.tagline}</p>` : ''}
      <div class="stats" data-in style="--i:3">
        <span><b data-count="${products.length}">${products.length}</b>件商品</span>
        ${cats.length ? html`<i></i><span><b data-count="${cats.length}">${cats.length}</b>个分类</span>` : ''}
        ${s.stat_num && s.stat_label ? html`<i></i><span><b data-count="${s.stat_num}">${s.stat_num}</b>${s.stat_label}</span>` : ''}
      </div>
      <div class="hero__act" data-in style="--i:4">
        <button class="btn btn--primary btn--lg" data-contact data-magnetic>联系我</button>
        ${noticeText ? html`<button class="btn btn--glass btn--lg" data-notice>店铺公告</button>` : ''}
      </div>
      ${noticeText
        ? html`<button class="notice" data-notice data-in style="--i:5" aria-label="查看店铺公告">
            ${ico('horn')}
            <span class="notice__track"><span class="notice__text"><span>${noticeText}</span><span aria-hidden="true">${noticeText}</span></span></span>
            <span class="notice__more">${ico('chev')}</span>
          </button>`
        : ''}
    </section>

    ${products.length
      ? html`<div class="toolbar" id="toolbar" data-in style="--i:6">
          <div class="wrap toolbar__in">
            ${cats.length
              ? html`<div class="chips" id="chips" role="toolbar" aria-label="商品分类">
                  <i class="chips__ind no-anim" id="ind"></i>
                  ${chip('all', '全部', products.length, true)} ${cats.map((c) => chip(c.id, c.name, c.count))}
                  ${uncategorized ? chip('none', '未分类', uncategorized) : ''}
                </div>`
              : html`<span class="top__space"></span>`}
            <label class="search" id="search">
              ${ico('search')}
              <input id="q" type="search" placeholder="搜索商品" autocomplete="off" aria-label="搜索商品" enterkeyhint="search" />
              <button class="search__clear" id="qClear" type="button" aria-label="清除搜索">${ico('x')}</button>
            </label>
          </div>
        </div>`
      : ''}

    <section class="wrap">
      <div class="grid" id="grid" aria-live="polite">
        ${products.map(cardHtml)}
        ${products.length
          ? html`<div class="empty" id="empty" hidden>
              ${emptyArt}<b>没有找到相关商品</b><span>换个关键词试试，或者直接联系我问问</span>
              <button class="btn btn--glass" id="emptyReset">清除筛选</button>
            </div>`
          : html`<div class="empty">
              ${emptyArt}<b>店主还在上架商品</b><span>想买什么可以先联系我</span>
              <button class="btn btn--primary" data-contact>联系我</button>
            </div>`}
      </div>
    </section>

    <button class="totop" id="totop" aria-label="回到顶部">${ico('up')}</button>
  </main>`;

  // 首页整页解析完再首次绘制，返回时封面才能找到对应卡片做变形；鼠标移到卡片上时预取详情页
  const extraHead = raw(
    '<link rel="expect" href="#foot" blocking="render" />' +
      '<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/p/*"},"eagerness":"moderate"}]}</script>',
  );

  return layout({
    site,
    kind: 'home',
    title: s.shop_name,
    description: s.tagline || `${s.shop_name} 的商品展示`,
    ogImage: s.avatar ? `${site.origin}/uploads/${s.avatar}.webp` : '',
    canonical: `${site.origin}/`,
    main,
    extraHead,
  });
}

/* ---------- 商品详情页 ---------- */

export function detailPage(site, p) {
  const s = site.settings;
  const main = html`<main id="detail" class="wrap detail" data-id="${p.id}">
      <div class="detail__grid${p.out ? ' is-out' : ''}">
        <div class="detail__media">${coverHtml(p, { size: 'l', eager: true, badge: p.out ? html`<span class="badge">缺货</span>` : '' })}</div>
        <div class="detail__info">
          <h1 class="detail__title" data-d>${p.name}</h1>
          ${p.tags.length ? html`<div data-d style="--i:1">${tagsHtml(p)}</div>` : ''}
          <div class="detail__price" data-d style="--i:2">
            ${priceHtml(p)}${origHtml(p)}${p.saveLabel ? html`<span class="save">立省 ¥${p.saveLabel}</span>` : ''}
          </div>
          <div class="steps" data-d style="--i:3">
            <div class="step"><b>联系店主</b>点下方按钮</div>
            <div class="step"><b>发咨询语</b>复制后发给我</div>
            <div class="step"><b>确认购买</b>沟通后办理</div>
          </div>
          ${p.body_html ? html`<div class="prose" data-d style="--i:4">${raw(p.body_html)}</div>` : ''}
        </div>
      </div>
    </main>

    <div class="buybar" id="buybar">
      <div class="wrap buybar__in">
        <button class="iconbtn" id="shareBtn" aria-label="复制商品链接">${ico('share')}</button>
        <div class="buybar__p">${priceHtml(p)}${p.origLabel ? html`<small>原价 ¥${p.origLabel}</small>` : ''}</div>
        <button class="btn btn--lg ${p.out ? 'btn--muted' : 'btn--primary'}" data-contact data-magnetic>${p.out ? '暂时缺货，咨询到货时间' : '联系购买'}</button>
      </div>
    </div>`;

  const plain = p.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return layout({
    site,
    kind: 'detail',
    title: `${p.name} · ${s.shop_name}`,
    description: `${p.priceIsNum ? `¥${p.priceLabel} · ` : ''}${plain.slice(0, 90) || s.tagline}`,
    ogImage: p.cover ? `${site.origin}/uploads/${p.cover}.webp` : s.avatar ? `${site.origin}/uploads/${s.avatar}.webp` : '',
    canonical: `${site.origin}/p/${p.id}`,
    main,
    product: p,
  });
}

/* ---------- 已下架 / 页面不存在 / 出错 ---------- */

export function statePage(site, { title, text }) {
  const main = html`<main class="wrap">
    <div class="empty state">
      ${emptyArt}<b>${title}</b><span>${text}</span>
      <a class="btn btn--primary" href="/">回到首页</a>
    </div>
  </main>`;
  return layout({ site, kind: 'state', title: `${title} · ${site.settings.shop_name}`, description: text, main });
}
