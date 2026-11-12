import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSession, hashPassword, isValidSession, verifyPassword } from '../src/auth.js';
import { renderMarkdown } from '../src/markdown.js';
import { contrast, paletteFromColor, PRESETS, themeCss } from '../src/theme.js';
import { formatNum, hueOf, parsePrice, parseTags, tagKind } from '../src/util.js';

test('价格：数字和文字两种形态', () => {
  assert.deepEqual(parsePrice('68'), { num: 68, text: '68' });
  assert.deepEqual(parsePrice(' ¥9.90 '), { num: 9.9, text: '9.9' });
  assert.deepEqual(parsePrice('面议'), { num: null, text: '面议' });
  assert.deepEqual(parsePrice(''), { num: null, text: '' });
  assert.equal(formatNum(598.0), '598');
});

test('标签：拆分与自动归类', () => {
  assert.deepEqual(parseTags('热卖，质保 30 天, 新品、当天开通'), ['热卖', '质保 30 天', '新品', '当天开通']);
  assert.equal(tagKind('热卖'), 'hot');
  assert.equal(tagKind('新品'), 'new');
  assert.equal(tagKind('质保 30 天'), 'ok');
  assert.equal(tagKind('当天开通'), '');
});

test('自动封面：每个商品的色相固定且在 0–359 之间', () => {
  for (let id = 1; id <= 50; id++) {
    assert.equal(hueOf(id), hueOf(id));
    assert.ok(hueOf(id) >= 0 && hueOf(id) < 360);
  }
  assert.notEqual(hueOf(1), hueOf(2));
});

test('主题色：预设和自选主色都满足对比度要求', () => {
  const palettes = [...Object.values(PRESETS), ...['#7B61FF', '#FFD400', '#00C853', '#111111', '#FF0033', '#F5F5F5'].map(paletteFromColor)];
  for (const p of palettes) {
    // 按钮上的白字
    assert.ok(contrast('#FFFFFF', p.ctaFrom) >= 4.5, `${p.name} ${p.accent} 按钮起点 ${p.ctaFrom}`);
    assert.ok(contrast('#FFFFFF', p.ctaTo) >= 4.5, `${p.name} ${p.accent} 按钮终点 ${p.ctaTo}`);
    // 派生出来的文字色
    const css = themeCss(p);
    const [, dark, light] = css.split('\n');
    const colors = (line, name) => [...line.match(new RegExp(`--${name}:([^;}]+)`))[1].matchAll(/#[0-9A-F]{6}/g)].map((m) => m[0]);
    for (const c of [...colors(dark, 'accent-text'), ...colors(dark, 'grad-text')]) assert.ok(contrast(c, '#07080D') >= 4.5, `${p.accent} 深色 ${c}`);
    for (const c of [...colors(light, 'accent-text'), ...colors(light, 'grad-text')]) assert.ok(contrast(c, '#F5F6FB') >= 4.5, `${p.accent} 浅色 ${c}`);
    for (const c of colors(light, 'grad-display')) assert.ok(contrast(c, '#F5F6FB') >= 3, `${p.accent} 浅色大标题 ${c}`);
  }
});

test('主题色：默认预设的派生值与设计说明书一致', () => {
  const css = themeCss(PRESETS.aurora);
  assert.ok(css.includes('--accent-text:#AD9DFF'));
  assert.ok(css.includes('linear-gradient(100deg,#B0A0FF,#78D9FF 50%,#FF97DB)'));
  assert.ok(css.includes('--accent-text:#5F44E0'));
  assert.ok(css.includes('linear-gradient(100deg,#624ECC,#226E8C 50%,#9E427E)'));
});

test('图文详情：排版扩展可用，原始 HTML 不会被执行', () => {
  const html = renderMarkdown('## 标题\n\n**粗** ==重点==\n\n:::tip\n提示内容\n:::\n\n:::warn\n注意\n:::\n\n- 一\n- 二');
  assert.match(html, /<h3>标题<\/h3>/);
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<mark>重点<\/mark>/);
  assert.match(html, /callout--tip[\s\S]*提示内容/);
  assert.match(html, /callout--warn[\s\S]*注意/);
  assert.match(html, /<li>一<\/li>/);

  const evil = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点我](javascript:alert(1))\n\n![x](javascript:alert(1))');
  assert.ok(!/<script/i.test(evil));
  assert.ok(!/<img[^>]+onerror/i.test(evil));
  assert.ok(!/href="javascript:/i.test(evil));
  assert.ok(!/src="javascript:/i.test(evil));
});

test('图文详情：站内图片带上宽高和模糊占位', () => {
  const html = renderMarkdown('![图](/uploads/abc123.webp)', (id) => (id === 'abc123' ? { w: 800, h: 600, blur: 'data:image/webp;base64,AAA' } : undefined));
  assert.match(html, /width="800" height="600"/);
  assert.match(html, /background-image:url\(data:image\/webp;base64,AAA\)/);
});

test('密码与登录状态', () => {
  const hash = hashPassword('correct horse');
  assert.ok(!hash.includes('correct horse'));
  assert.ok(verifyPassword('correct horse', hash));
  assert.ok(!verifyPassword('wrong', hash));
  assert.ok(!verifyPassword('anything', ''));

  const token = createSession('secret-a');
  assert.ok(isValidSession(token, 'secret-a'));
  assert.ok(!isValidSession(token, 'secret-b'), '换了密钥应失效');
  const [expires, mac] = token.split('.');
  assert.ok(!isValidSession(`${Number(expires) + 1000}.${mac}`, 'secret-a'), '篡改过期时间应失效');
  assert.ok(!isValidSession(`${Date.now() - 1000}.${mac}`, 'secret-a'), '过期应失效');
  assert.ok(!isValidSession('', 'secret-a'));
});
