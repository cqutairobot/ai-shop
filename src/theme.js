/**
 * 主题色：预设、自选主色的补全、以及派生色的计算。
 * 规则见 docs/ui-design.md 第 2.2、2.3 节。结果由服务端算好输出成 CSS 变量。
 */

export const PRESETS = {
  aurora: { name: '极光紫', accent: '#7B61FF', accent2: '#3EC8FF', accent3: '#FF6BCB', ctaFrom: '#6C4DFF', ctaTo: '#3D63F2' },
  ocean: { name: '深海蓝', accent: '#3B82F6', accent2: '#22D3EE', accent3: '#8B5CF6', ctaFrom: '#2563EB', ctaTo: '#4F46E5' },
  mint: { name: '薄荷青', accent: '#14B8A6', accent2: '#4ADE80', accent3: '#38BDF8', ctaFrom: '#0F766E', ctaTo: '#0E7490' },
  sunset: { name: '落日橙', accent: '#FF7A45', accent2: '#FFC53D', accent3: '#FF4D8D', ctaFrom: '#C2410C', ctaTo: '#BE185D' },
  sakura: { name: '樱花粉', accent: '#F472B6', accent2: '#C084FC', accent3: '#FB7185', ctaFrom: '#C81E6E', ctaTo: '#9333EA' },
};

const BG = { dark: '#07080D', light: '#F5F6FB' };

/* ---------- 颜色工具 ---------- */

export function isHex(v) {
  return /^#[0-9a-f]{6}$/i.test(String(v));
}
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** 把 a 和 b 按比例混合，ratio 是 a 的占比（0–1）。 */
export function mix(a, b, ratio) {
  const x = toRgb(a), y = toRgb(b);
  return toHex(x.map((v, i) => v * ratio + y[i] * (1 - ratio)));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度 */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** 不够对比度时，继续朝 toward（黑或白）混色，直到达标。 */
function ensureContrast(color, against, target, toward) {
  let c = color;
  for (let i = 0; i < 40 && contrast(c, against) < target; i++) c = mix(c, toward, 0.94);
  return c;
}

/* ---------- OKLCH（自选主色时用来转色相、调明度） ---------- */

function hexToOklch(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToRgbLinear({ L, C, H }) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToHex(lch) {
  // 超出 sRGB 色域时逐步降低彩度
  let c = { ...lch };
  for (let i = 0; i < 30; i++) {
    const rgb = oklchToRgbLinear(c);
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) break;
    c.C *= 0.92;
  }
  return toHex(oklchToRgbLinear(c).map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255;
  }));
}

/** 店主只选一个主色时，补全另外两个极光色和按钮渐变色。 */
export function paletteFromColor(hex) {
  const base = hexToOklch(hex);
  const accent2 = oklchToHex({ L: Math.max(base.L, 0.8), C: Math.min(Math.max(base.C, 0.1), 0.15), H: (base.H + 300) % 360 });
  const accent3 = oklchToHex({ L: 0.72, C: Math.max(base.C, 0.17), H: (base.H + 60) % 360 });
  const darken = (h) => {
    let c = { L: Math.min(base.L, 0.6), C: base.C, H: h };
    let out = oklchToHex(c);
    for (let i = 0; i < 40 && contrast('#FFFFFF', out) < 4.6; i++) {
      c = { ...c, L: c.L - 0.015 };
      out = oklchToHex(c);
    }
    return out;
  };
  return { name: '自定义', accent: hex.toUpperCase(), accent2, accent3, ctaFrom: darken(base.H), ctaTo: darken((base.H + 335) % 360) };
}

/** 根据设置取出当前调色板。 */
export function resolvePalette(settings) {
  if (settings.theme === 'custom' && isHex(settings.theme_color)) return paletteFromColor(settings.theme_color);
  return PRESETS[settings.theme] || PRESETS.aurora;
}

/** 算出派生色，返回可以直接放进 <style> 的 CSS。 */
export function themeCss(p) {
  const W = '#FFFFFF', K = '#000000';
  const grad = (stops) => `linear-gradient(100deg,${stops[0]},${stops[1]} 50%,${stops[2]})`;

  const dark = {
    text: ensureContrast(mix(p.accent, W, 0.62), BG.dark, 4.5, W),
    grad: [mix(p.accent, W, 0.6), mix(p.accent2, W, 0.7), mix(p.accent3, W, 0.7)].map((c) => ensureContrast(c, BG.dark, 4.5, W)),
  };
  const light = {
    text: ensureContrast(mix(p.ctaFrom, K, 0.88), BG.light, 4.5, K),
    grad: [mix(p.accent, K, 0.8), mix(p.accent2, K, 0.55), mix(p.accent3, K, 0.62)].map((c) => ensureContrast(c, BG.light, 4.5, K)),
    display: [mix(p.accent, K, 0.92), mix(p.accent2, K, 0.66), mix(p.accent3, K, 0.8)].map((c) => ensureContrast(c, BG.light, 3, K)),
  };

  return [
    `:root{--accent:${p.accent};--accent-2:${p.accent2};--accent-3:${p.accent3};--cta-from:${p.ctaFrom};--cta-to:${p.ctaTo}}`,
    `:root,[data-theme="dark"]{--accent-text:${dark.text};--grad-text:${grad(dark.grad)};--grad-display:${grad(dark.grad)}}`,
    `[data-theme="light"]{--accent-text:${light.text};--grad-text:${grad(light.grad)};--grad-display:${grad(light.display)}}`,
  ].join('\n');
}
