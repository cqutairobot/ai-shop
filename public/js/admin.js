/* 管理后台交互：列表内快捷修改、排序、图文编辑器、图片预览 */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 轻提示 ---------- */
const toastEl = $('#toast');
let toastT;
function toast(msg, bad = false) {
  $('#toastText').textContent = msg;
  toastEl.classList.toggle('is-bad', bad);
  toastEl.classList.add('is-show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-show'), bad ? 3500 : 2200);
}
if (toastEl.dataset.msg) {
  setTimeout(() => toast(toastEl.dataset.msg), 250);
  history.replaceState(null, '', location.pathname); // 去掉地址里的提示参数，刷新时不再重复提示
}

/* ---------- 深浅色 ---------- */
$('#themeBtn')?.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* 忽略 */ }
});

/* ---------- 删除等操作前确认 ---------- */
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset.confirm;
  if (msg && !confirm(msg)) e.preventDefault();
});

async function post(url, data) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch (e) {
    throw new Error('网络连接失败，修改没有保存');
  }
  const json = await res.json().catch(() => ({ ok: false }));
  if (!json.ok) throw new Error(json.error || '保存失败，请刷新页面后重试');
  return json;
}

/* ---------- 商品列表：直接改价格、状态、置顶 ---------- */
const prows = $('#prows');
if (prows) {
  $$('[data-field]', prows).forEach((el) => (el.dataset.saved = el.value));
  prows.addEventListener('change', async (e) => {
    const el = e.target.closest('input[data-field],select[data-field]');
    if (!el) return;
    const row = el.closest('.prow');
    try {
      const r = await post(`/admin/api/products/${row.dataset.id}`, { [el.dataset.field]: el.value });
      if (el.dataset.field === 'price') el.value = r.price;
      el.dataset.saved = el.value;
      row.classList.toggle('is-off', r.status === 'off');
      $('.prow__thumb', row).classList.toggle('is-out', r.status === 'out');
      el.classList.add('is-saved');
      setTimeout(() => el.classList.remove('is-saved'), 1200);
      toast('已保存');
    } catch (err) {
      el.value = el.dataset.saved; // 没保存成功就恢复原值，避免看到的和实际的不一致
      toast(err.message, true);
    }
  });
  prows.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.prow__price')) e.target.blur(); });
  prows.addEventListener('click', async (e) => {
    const pin = e.target.closest('.pin');
    if (!pin) return;
    const row = pin.closest('.prow');
    try {
      await post(`/admin/api/products/${row.dataset.id}`, { pinned: pin.getAttribute('aria-pressed') !== 'true' });
      location.href = '/admin/products?msg=saved'; // 置顶会改变排列顺序，重新加载列表
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ---------- 排序：上移 / 下移（商品和分类共用） ---------- */
$$('.rows[data-order]').forEach((list) => {
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const row = btn.closest('li');
    const other = btn.dataset.move === 'up' ? row.previousElementSibling : row.nextElementSibling;
    if (!other) return;
    if (row.dataset.pinned !== other.dataset.pinned) return toast('置顶的商品始终排在最前，不能和未置顶的互换', true);
    const a = row.getBoundingClientRect().top, b = other.getBoundingClientRect().top;
    btn.dataset.move === 'up' ? other.before(row) : other.after(row);
    if (!reduce) {
      const opt = { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' };
      row.animate([{ transform: `translateY(${a - row.getBoundingClientRect().top}px)` }, { transform: 'none' }], opt);
      other.animate([{ transform: `translateY(${b - other.getBoundingClientRect().top}px)` }, { transform: 'none' }], opt);
    }
    btn.focus();
    try {
      await post(list.dataset.order, { ids: [...list.children].map((li) => Number(li.dataset.id)) });
      toast('顺序已保存');
    } catch (err) {
      toast(err.message, true);
    }
  });
});

/* ---------- 分类图标选择 ---------- */
document.addEventListener('change', (e) => {
  const radio = e.target.closest('.iconpick input[type="radio"]');
  if (!radio) return;
  const pick = radio.closest('.iconpick');
  $('summary use', pick).setAttribute('href', `#i-${radio.value}`);
  pick.open = false;
});
document.addEventListener('click', (e) => {
  $$('.iconpick[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

/* ---------- 图片选择后立即预览 ---------- */
$$('[data-upload]').forEach((box) => {
  const input = $('input[type="file"]', box), preview = $('[data-preview]', box);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      input.value = '';
      return toast('图片不能超过 10MB，请换一张小一点的', true);
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = URL.createObjectURL(file);
    preview.replaceChildren(img);
    const remove = $('input[type="checkbox"]', box);
    if (remove) remove.checked = false;
  });
});

/* ---------- 离开未保存的表单时提醒 ---------- */
$$('form[data-guard]').forEach((form) => {
  let dirty = false;
  form.addEventListener('input', () => (dirty = true));
  form.addEventListener('submit', () => (dirty = false));
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
});

/* ---------- 图文编辑器 ---------- */
const editor = $('#editor');
if (editor) {
  const ta = $('#bodyMd'), preview = $('#mdPreview'), fileInput = $('#mdImage');
  let timer, seq = 0;

  async function refresh() {
    const mine = ++seq;
    try {
      const r = await post('/admin/api/preview', { md: ta.value });
      if (mine === seq) preview.innerHTML = r.html; // 只采用最新一次的结果
    } catch (e) { /* 预览失败不影响编辑 */ }
  }
  const changed = () => {
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 300); });
  if (ta.value && !preview.innerHTML.trim()) refresh();

  /** 用 before / after 包住选中的文字；没有选中时插入占位文字并选中它。 */
  function wrap(before, after, placeholder) {
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'end');
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    ta.focus();
    changed();
  }
  /** 给选中的每一行加前缀（标题、列表）。 */
  function prefixLines(prefix, placeholder) {
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let e = v.indexOf('\n', ta.selectionEnd);
    if (e === -1) e = v.length;
    const empty = !v.slice(s, e).trim();
    const block = empty ? placeholder : v.slice(s, e);
    const out = block.split('\n').map((l) => (l.startsWith(prefix) ? l : prefix + l)).join('\n');
    ta.setRangeText(out, s, e, 'end');
    if (empty) ta.setSelectionRange(s + prefix.length, s + out.length); // 选中占位文字，直接打字就能替换
    ta.focus();
    changed();
  }
  /** 插入独占一段的内容（图片、提示框）。插在当前行之后，不打断正在写的那一行，前后自动留空行。 */
  function insertBlock(text, selectText) {
    const v = ta.value;
    let at = v.indexOf('\n', ta.selectionEnd);
    if (at === -1) at = v.length;
    const head = v.slice(0, at), tail = v.slice(at);
    const before = !head.trim() ? '' : head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n';
    const after = !tail.trim() ? '\n' : tail.startsWith('\n\n') ? '' : tail.startsWith('\n') ? '\n' : '\n\n';
    ta.setRangeText(before + text + after, at, at, 'end');
    if (selectText) {
      const pos = at + before.length + text.indexOf(selectText);
      ta.setSelectionRange(pos, pos + selectText.length);
    }
    ta.focus();
    changed();
  }

  const actions = {
    h: () => prefixLines('## ', '小标题'),
    b: () => wrap('**', '**', '加粗的文字'),
    mark: () => wrap('==', '==', '重点文字'),
    ul: () => prefixLines('- ', '列表内容'),
    link: () => wrap('[', '](https://)', '链接文字'),
    img: () => fileInput.click(),
    tip: () => insertBlock(':::tip\n提示内容\n:::', '提示内容'),
    warn: () => insertBlock(':::warn\n注意事项\n:::', '注意事项'),
  };
  editor.addEventListener('click', (e) => {
    const b = e.target.closest('[data-md]');
    if (b) actions[b.dataset.md]?.();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('图片不能超过 10MB，请换一张小一点的', true);
    editor.classList.add('is-busy');
    toast('正在上传图片…');
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/admin/api/upload', { method: 'POST', body: data });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) throw new Error(json.error || '图片上传失败，请重试');
      insertBlock(`![图片说明](${json.url})`, '图片说明');
      toast('图片已插入');
    } catch (err) {
      toast(err.message || '图片上传失败，请重试', true);
    } finally {
      editor.classList.remove('is-busy');
    }
  });
}
})();
