import { html, raw } from 'hono/html';
import { CATEGORY_ICONS, STATUSES } from '../store.js';
import { PRESETS } from '../theme.js';
import { SPRITE } from './icons.js';
import { coverHtml, ico } from './parts.js';

/** 后台沿用前台的颜色、字体和组件，但没有极光背景和入场动画（设计说明书 8.5「安静模式」）。 */

const HEAD_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem('theme')}catch(e){}
if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.setAttribute('data-theme',t)})();`;

const MESSAGES = {
  saved: '已保存',
  created: '商品已添加',
  deleted: '已删除',
  copied: '已复制一份。副本默认是下架状态，改好后记得上架',
  pw: '密码已修改',
  demo: '示例数据已清空，可以开始添加自己的商品了',
  catadded: '分类已添加',
  catname: '分类名称不能为空',
};

const ICON_NAMES = { spark: '星光', chat: '对话', image: '图片', code: '代码', bolt: '闪电', video: '视频', wave: '声音', doc: '文档', globe: '地球', box: '盒子', star: '星标', gift: '礼物' };

function shell({ site, title, active, body, msg = '', bare = false }) {
  const nav = [
    ['products', '商品'],
    ['categories', '分类'],
    ['settings', '店铺设置'],
  ];
  return html`<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${title} · 管理后台</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script>${raw(HEAD_SCRIPT)}</script>
    <link rel="stylesheet" href="${site.asset('/css/site.css')}" />
    <link rel="stylesheet" href="${site.asset('/css/admin.css')}" />
    <style>${raw(site.themeCss)}</style>
    <script src="${site.asset('/js/admin.js')}" defer></script>
  </head>
  <body class="adm">
    ${raw(SPRITE)}
    ${bare
      ? ''
      : html`<header class="adm-top">
          <div class="adm-wrap adm-top__in">
            <a class="adm-brand" href="/admin/products"><span class="top__logo">${ico('spark')}</span><span>管理后台</span></a>
            <nav class="adm-nav" aria-label="后台导航">
              ${nav.map(([key, label]) => html`<a href="/admin/${key}" aria-current="${active === key ? 'page' : 'false'}">${label}</a>`)}
            </nav>
            <span class="top__space"></span>
            <a class="btn btn--glass btn--sm adm-view" href="/" target="_blank" rel="noopener">${ico('eye')}<span>查看网站</span></a>
            <button class="iconbtn theme" id="themeBtn" type="button" aria-label="切换深色 / 浅色">${ico('sun', 'sun')}${ico('moon', 'moon')}</button>
            <form method="post" action="/admin/logout"><button class="iconbtn" aria-label="退出登录" title="退出登录">${ico('out')}</button></form>
          </div>
        </header>`}
    <main class="adm-wrap adm-main">${body}</main>
    <div class="toast" id="toast" role="status" aria-live="polite" data-msg="${MESSAGES[msg] || ''}"><i>${ico('check')}</i><span id="toastText"></span></div>
  </body>
</html>`;
}

const errorBox = (error) => (error ? html`<div class="callout callout--warn" role="alert">${ico('info')}<span>${error}</span></div>` : '');

const field = (label, control, hint = '') =>
  html`<label class="field"><span class="field__label">${label}</span>${control}${hint ? html`<span class="field__hint">${hint}</span>` : ''}</label>`;

/* ---------- 登录 ---------- */

export function loginPage(site, { error = '' }) {
  const body = html`<form class="panel login" method="post" action="/admin/login">
    <span class="top__logo login__logo">${ico('spark')}</span>
    <h1>${site.settings.shop_name}</h1>
    <p class="muted">管理后台</p>
    ${errorBox(error)}
    ${field('密码', html`<input class="input" type="password" name="password" required autofocus autocomplete="current-password" />`)}
    <button class="btn btn--primary btn--lg">登录</button>
  </form>`;
  return shell({ site, title: '登录', body, bare: true });
}

/* ---------- 商品列表 ---------- */

const moveBtns = html`<div class="move">
  <button class="iconbtn iconbtn--sm" type="button" data-move="up" aria-label="上移" title="上移">${ico('up')}</button>
  <button class="iconbtn iconbtn--sm" type="button" data-move="down" aria-label="下移" title="下移">${ico('down')}</button>
</div>`;

export function productsPage(site, { products, msg }) {
  const row = (p) => html`<li class="prow${p.off ? ' is-off' : ''}" data-id="${p.id}" data-pinned="${p.pinned ? '1' : '0'}">
    ${moveBtns}
    <a class="prow__thumb${p.out ? ' is-out' : ''}" href="/admin/products/${p.id}" tabindex="-1" aria-hidden="true">${coverHtml(p)}</a>
    <div class="prow__main">
      <a class="prow__name" href="/admin/products/${p.id}">${p.name}</a>
      <span class="muted">${p.category_name || '未分类'}</span>
    </div>
    <input class="input prow__price" data-field="price" value="${p.priceLabel}" aria-label="${p.name} 的价格" title="改完按回车或点别处即可保存" autocomplete="off" />
    <select class="input prow__status" data-field="status" aria-label="${p.name} 的状态">
      ${Object.entries(STATUSES).map(([k, label]) => html`<option value="${k}" ${p.status === k ? raw('selected') : ''}>${label}</option>`)}
    </select>
    <div class="prow__act">
      <button class="iconbtn iconbtn--sm pin${p.pinned ? ' is-on' : ''}" type="button" data-field="pinned" aria-pressed="${p.pinned ? 'true' : 'false'}" aria-label="置顶" title="置顶（排在最前并显示「推荐」）">${ico('star')}</button>
      <a class="iconbtn iconbtn--sm" href="/admin/products/${p.id}" aria-label="编辑" title="编辑">${ico('edit')}</a>
      <form method="post" action="/admin/products/${p.id}/copy"><button class="iconbtn iconbtn--sm" aria-label="复制一份" title="复制一份">${ico('dup')}</button></form>
      <form method="post" action="/admin/products/${p.id}/delete" data-confirm="确定删除「${p.name}」吗？删除后无法恢复。">
        <button class="iconbtn iconbtn--sm iconbtn--danger" aria-label="删除" title="删除">${ico('trash')}</button>
      </form>
    </div>
  </li>`;

  const body = html`
    ${site.settings.demo === '1'
      ? html`<div class="callout callout--tip demo-tip">
          ${ico('info')}
          <span>现在显示的是<strong>示例数据</strong>，方便你先看看效果。正式使用前，请到「店铺设置」最下面点「清空示例数据」，再填写自己的店铺信息和商品。</span>
        </div>`
      : ''}
    <div class="adm-head">
      <h1>商品<small>${products.length} 件</small></h1>
      <a class="btn btn--primary" href="/admin/products/new">${ico('plus')}新增商品</a>
    </div>
    ${products.length
      ? html`<p class="muted adm-tip">价格和状态可以直接在这里改，改完自动保存。用左侧的箭头调整排列顺序，置顶的商品始终排在最前。</p>
          <ul class="rows" id="prows" data-order="/admin/api/products/order">${products.map(row)}</ul>`
      : html`<div class="panel blank"><b>还没有商品</b><span class="muted">点右上角的「新增商品」添加第一件。</span></div>`}
  `;
  return shell({ site, title: '商品', active: 'products', body, msg });
}

/* ---------- 新增 / 编辑商品 ---------- */

export function productFormPage(site, { product, values, error, categories, msg = '' }) {
  const isNew = !product;
  // 表单回填：优先用刚提交但没通过校验的内容，其次是已保存的商品
  const v = values || {
    name: product?.name || '',
    category_id: String(product?.category_id || ''),
    price: product?.priceLabel || '',
    orig_price: product?.orig_price ?? '',
    tags: product?.tags.map((t) => t.text).join('，') || '',
    status: product?.status || 'on',
    pinned: product?.pinned || false,
    body_md: product?.body_md || '',
  };
  const preview = product ? { ...product, name: v.name } : { cover: '', hue: 258, icon: 'spark' };

  const body = html`
    <div class="adm-head">
      <h1><a class="iconbtn iconbtn--sm" href="/admin/products" aria-label="返回商品列表">${ico('back')}</a>${isNew ? '新增商品' : '编辑商品'}</h1>
      ${!isNew && !product.off ? html`<a class="btn btn--glass btn--sm" href="/p/${product.id}" target="_blank" rel="noopener">${ico('eye')}查看页面</a>` : ''}
    </div>
    ${errorBox(error)}
    <form class="pform" method="post" enctype="multipart/form-data" action="/admin/products/${isNew ? 'new' : product.id}" data-guard>
      <div class="pform__cols">
        <section class="panel">
          <h2>基本信息</h2>
          ${field('商品名称 *', html`<input class="input" name="name" value="${v.name}" required maxlength="120" placeholder="例如：AI 对话助手 Pro 会员 · 月卡" />`)}
          <div class="field-row">
            ${field('价格 *', html`<input class="input" name="price" value="${v.price}" required maxlength="20" placeholder="68" autocomplete="off" />`, '填数字，或者「面议」这样的文字')}
            ${field('原价', html`<input class="input" name="orig_price" value="${v.orig_price}" maxlength="12" inputmode="decimal" placeholder="选填" autocomplete="off" />`, '填了会显示划线价和「立省」')}
          </div>
          ${field(
            '分类',
            html`<select class="input" name="category_id">
              <option value="">未分类</option>
              ${categories.map((c) => html`<option value="${c.id}" ${String(c.id) === String(v.category_id) ? raw('selected') : ''}>${c.name}</option>`)}
            </select>`,
            categories.length ? '' : '还没有分类，可以先保存，之后到「分类」里添加',
          )}
          ${field('标签', html`<input class="input" name="tags" value="${v.tags}" maxlength="120" placeholder="热卖，质保 30 天" autocomplete="off" />`, '用逗号隔开。带「热」「新」「保」字的标签会自动上色')}
        </section>

        <section class="panel">
          <h2>封面与状态</h2>
          <div class="upload" data-upload>
            <div class="upload__preview" data-preview>${coverHtml(preview, { eager: true })}</div>
            <div class="upload__side">
              <label class="btn btn--glass btn--sm">选择图片<input type="file" name="cover_file" accept="image/*" hidden /></label>
              ${product?.cover ? html`<label class="check"><input type="checkbox" name="cover_remove" value="1" />移除当前图片</label>` : ''}
              <span class="field__hint">建议 4:3 横图。不上传也可以，会自动生成一张渐变封面</span>
            </div>
          </div>
          <fieldset class="field">
            <legend class="field__label">状态</legend>
            <div class="seg">
              ${Object.entries(STATUSES).map(
                ([k, label]) => html`<label><input type="radio" name="status" value="${k}" ${v.status === k ? raw('checked') : ''} /><span>${label}</span></label>`,
              )}
            </div>
            <span class="field__hint">缺货：仍然展示，但标记为缺货。下架：访客看不到</span>
          </fieldset>
          <label class="check"><input type="checkbox" name="pinned" value="1" ${v.pinned ? raw('checked') : ''} />置顶推荐（排在最前，封面显示「推荐」）</label>
        </section>
      </div>

      <section class="panel">
        <h2>图文详情</h2>
        <div class="editor" id="editor">
          <div class="editor__bar" role="toolbar" aria-label="排版工具">
            <button type="button" data-md="h">标题</button>
            <button type="button" data-md="b"><b>加粗</b></button>
            <button type="button" data-md="mark"><mark>重点</mark></button>
            <button type="button" data-md="ul">列表</button>
            <button type="button" data-md="link">链接</button>
            <button type="button" data-md="img">插入图片</button>
            <button type="button" data-md="tip">提示框</button>
            <button type="button" data-md="warn">注意框</button>
            <input type="file" id="mdImage" accept="image/*" hidden />
          </div>
          <div class="editor__panes">
            <textarea class="input editor__text" name="body_md" id="bodyMd" rows="18" placeholder="在这里写商品介绍。选中文字后点上面的按钮可以加粗、标重点；右侧会实时显示访客看到的效果。">${v.body_md}</textarea>
            <div class="editor__preview">
              <span class="field__label">预览</span>
              <div class="prose" id="mdPreview">${product && !values ? raw(product.body_html) : ''}</div>
            </div>
          </div>
        </div>
      </section>

      <div class="savebar">
        <div class="adm-wrap savebar__in">
          <a class="btn btn--ghost" href="/admin/products">取消</a>
          <span class="top__space"></span>
          <button class="btn btn--glass" name="next" value="view">保存并查看</button>
          <button class="btn btn--primary" name="next" value="list">保存</button>
        </div>
      </div>
    </form>
  `;
  return shell({ site, title: isNew ? '新增商品' : '编辑商品', active: 'products', body, msg });
}

/* ---------- 分类 ---------- */

const iconPicker = (current) => html`<details class="iconpick">
  <summary aria-label="选择封面图标" title="封面图标">${ico(current)}</summary>
  <div class="iconpick__list">
    ${CATEGORY_ICONS.map(
      (name) => html`<label title="${ICON_NAMES[name]}"><input type="radio" name="icon" value="${name}" ${name === current ? raw('checked') : ''} /><span>${ico(name)}</span><span class="sr">${ICON_NAMES[name]}</span></label>`,
    )}
  </div>
</details>`;

export function categoriesPage(site, { categories, msg }) {
  const row = (c) => html`<li class="crow" data-id="${c.id}">
    ${moveBtns}
    <form class="crow__form" method="post" action="/admin/categories/${c.id}">
      ${iconPicker(c.icon)}
      <input class="input" name="name" value="${c.name}" required maxlength="20" aria-label="分类名称" />
      <span class="muted crow__n">${c.count} 件</span>
      <button class="btn btn--glass btn--sm">保存</button>
    </form>
    <form method="post" action="/admin/categories/${c.id}/delete" data-confirm="确定删除分类「${c.name}」吗？该分类下的 ${c.count} 件商品会变成「未分类」，商品本身不会被删除。">
      <button class="iconbtn iconbtn--sm iconbtn--danger" aria-label="删除分类 ${c.name}" title="删除">${ico('trash')}</button>
    </form>
  </li>`;

  const body = html`
    <div class="adm-head"><h1>分类<small>${categories.length} 个</small></h1></div>
    <p class="muted adm-tip">分类会显示在首页商品列表上方。图标用在没有上传封面的商品上。没有商品的分类不会在首页出现。</p>
    ${categories.length ? html`<ul class="rows" id="crows" data-order="/admin/api/categories/order">${categories.map(row)}</ul>` : ''}
    <form class="panel crow__form addcat" method="post" action="/admin/categories">
      ${iconPicker('spark')}
      <input class="input" name="name" required maxlength="20" placeholder="新分类名称，例如：AI 绘画" aria-label="新分类名称" />
      <button class="btn btn--primary btn--sm">${ico('plus')}添加分类</button>
    </form>
  `;
  return shell({ site, title: '分类', active: 'categories', body, msg });
}

/* ---------- 店铺设置 ---------- */

function imageField(name, label, id, hint, round = false) {
  return html`<div class="upload" data-upload>
    <div class="upload__preview upload__preview--sq${round ? ' upload__preview--round' : ''}" data-preview>
      ${id ? html`<img src="/uploads/${id}-s.webp" alt="" />` : html`<span class="muted">未上传</span>`}
    </div>
    <div class="upload__side">
      <span class="field__label">${label}</span>
      <label class="btn btn--glass btn--sm">选择图片<input type="file" name="${name}_file" accept="image/*" hidden /></label>
      ${id ? html`<label class="check"><input type="checkbox" name="${name}_remove" value="1" />移除当前图片</label>` : ''}
      <span class="field__hint">${hint}</span>
    </div>
  </div>`;
}

export function settingsPage(site, { msg, error }) {
  const s = site.settings;
  const input = (name, attrs = '') => html`<input class="input" name="${name}" value="${s[name]}" ${raw(attrs)} />`;
  const swatch = (key, p) => html`<label class="swatch">
    <input type="radio" name="theme" value="${key}" ${s.theme === key ? raw('checked') : ''} />
    <i style="--a:${p.accent};--b:${p.accent2};--c:${p.accent3}"></i><span>${p.name}</span>
  </label>`;

  const body = html`
    <div class="adm-head"><h1>店铺设置</h1></div>
    ${errorBox(error)}
    <form class="sform" method="post" enctype="multipart/form-data" action="/admin/settings" data-guard>
      <section class="panel">
        <h2>店铺信息</h2>
        ${field('店名', input('shop_name', 'required maxlength="40"'), '建议 16 字以内')}
        ${field('一句话简介', input('tagline', 'maxlength="120"'), '显示在店名下面，建议 40 字以内')}
        ${imageField('avatar', '头像', s.avatar, '建议正方形图片。不上传则显示默认图标', true)}
        <div class="field-row">
          ${field('亮点数字', input('stat_num', 'maxlength="8" placeholder="30"'))}
          ${field('亮点文字', input('stat_label', 'maxlength="12" placeholder="天质保"'), '选填。显示在首页「x 件商品」旁边，两项都填才显示')}
        </div>
      </section>

      <section class="panel">
        <h2>公告</h2>
        ${field('公告内容', html`<textarea class="input" name="notice" rows="4" maxlength="2000" placeholder="每行一条。留空则不显示公告">${s.notice}</textarea>`, '显示在首页的公告条上，点开可以看全文')}
        <label class="check"><input type="checkbox" name="notice_popup" value="1" ${s.notice_popup === '1' ? raw('checked') : ''} />访客第一次进入时自动弹出公告</label>
      </section>

      <section class="panel">
        <h2>联系方式</h2>
        <p class="muted">填了的才会显示在「联系购买」面板里。</p>
        <div class="field-row">
          ${field('微信号', input('wechat', 'maxlength="40" autocomplete="off"'))}
          ${field('QQ 号', input('qq', 'maxlength="20" inputmode="numeric" autocomplete="off"'))}
        </div>
        ${imageField('wechat_qr', '微信二维码', s.wechat_qr, '上传后，联系面板里会多一个「二维码」按钮')}
        <div class="field-row">
          ${field('Telegram 用户名', input('telegram', 'maxlength="60" placeholder="选填" autocomplete="off"'))}
          ${field('邮箱', input('email', 'type="email" maxlength="80" placeholder="选填" autocomplete="off"'))}
        </div>
        <div class="field-row">
          ${field('其他联系方式的名称', input('extra_label', 'maxlength="12" placeholder="例如：闲鱼"'))}
          ${field('其他联系方式的内容', input('extra_value', 'maxlength="120" placeholder="账号或网址"'))}
        </div>
        ${field('在线时间说明', input('hours', 'maxlength="60" placeholder="在线时间 9:00–23:00，一般 10 分钟内回复"'))}
      </section>

      <section class="panel">
        <h2>主题色</h2>
        <div class="swatches">
          ${Object.entries(PRESETS).map(([key, p]) => swatch(key, p))}
          <label class="swatch">
            <input type="radio" name="theme" value="custom" ${s.theme === 'custom' ? raw('checked') : ''} />
            <input type="color" name="theme_color" value="${s.theme_color}" aria-label="自选主色" /><span>自选</span>
          </label>
        </div>
        <span class="field__hint">选「自选」时只需要挑一个主色，其余配色会自动算出来</span>
      </section>

      <section class="panel">
        <h2>页脚</h2>
        ${field('页脚文字', input('footer', 'maxlength="80" placeholder="本站只做商品展示，购买请联系店主"'))}
        ${field('备案号', input('icp', 'maxlength="40" placeholder="没有可以不填"'))}
      </section>

      <div class="savebar">
        <div class="adm-wrap savebar__in"><span class="top__space"></span><button class="btn btn--primary">保存设置</button></div>
      </div>
    </form>

    <section class="panel">
      <h2>修改后台密码</h2>
      <form class="pwform" method="post" action="/admin/password">
        ${field('当前密码', html`<input class="input" type="password" name="current" required autocomplete="current-password" />`)}
        ${field('新密码', html`<input class="input" type="password" name="password" required minlength="8" autocomplete="new-password" />`, '至少 8 位')}
        ${field('再输一次新密码', html`<input class="input" type="password" name="confirm" required minlength="8" autocomplete="new-password" />`)}
        <button class="btn btn--glass">修改密码</button>
      </form>
    </section>

    <section class="panel">
      <h2>数据</h2>
      <p class="muted">导出的压缩包里有全部商品、设置和图片。把它保存在自己电脑上就是一份完整备份。</p>
      <div class="data-act">
        <a class="btn btn--glass" href="/admin/export" download>导出备份</a>
        ${s.demo === '1'
          ? html`<form method="post" action="/admin/demo/clear" data-confirm="确定清空示例数据吗？所有商品和分类都会被删除，店铺设置保留。">
              <button class="btn btn--glass danger">清空示例数据</button>
            </form>`
          : ''}
      </div>
    </section>
  `;
  return shell({ site, title: '店铺设置', active: 'settings', body, msg });
}
