#!/usr/bin/env node
/* loongsite 源码级设计契约检查（与 stylelint 配套）。
   1) 断言 design.tokens.json 的 sourceContract 每条声明在 style.css 中精确成立
   2) 断言动效分级变量（--m-*）在 CSS 里等于 tokens 的档位值
   3) 断言 JS 侧动效常数（GX 光斑衰减半径等）等于 tokens
   4) 断言 DESIGN.md 的自动契约表与 tokens 一致
   用法：
     node scripts/check-design.mjs          # 检查（CI/verify 用）
     node scripts/check-design.mjs --write  # 把契约表写进 DESIGN.md（= npm run design:sync 的底层） */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';
import { TOKENS } from '../design.tokens.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'assets', 'css', 'style.css');
const JS_PATH = path.join(ROOT, 'assets', 'js', 'main.js');
const DOC_PATH = path.join(ROOT, 'DESIGN.md');
const MARK_START = '<!-- design-tokens:auto:start -->';
const MARK_END = '<!-- design-tokens:auto:end -->';
const WRITE = process.argv.includes('--write');

const fails = [];
let okCount = 0;
let checkedCount = 0;

/* 断言：实际值必须与期望值完全一致 */
function expect(label, got, expected) {
  checkedCount += 1;
  if (got === undefined) fails.push(`${label} 缺少声明：期望 ${expected}`);
  else if (got !== expected) fails.push(`${label} 期望 ${expected}，实为 ${got}`);
  else okCount += 1;
}

/* ---------- 1. CSS 源码契约 ---------- */
const css = readFileSync(CSS_PATH, 'utf8');
const root = postcss.parse(css);
const declMap = new Map(); // selector(=顶层规则) -> Map(prop -> value)
root.walkRules((rule) => {
  if (rule.parent.type !== 'root') return; // 契约规则必须写在顶层
  const sel = rule.selector.replace(/\s+/g, ' ').trim();
  if (!declMap.has(sel)) declMap.set(sel, new Map());
  const m = declMap.get(sel);
  rule.walkDecls((d) => m.set(d.prop, d.value.replace(/\s+/g, ' ').trim()));
});

for (const [sel, props] of Object.entries(TOKENS.sourceContract)) {
  if (sel.startsWith('_')) continue;
  const has = declMap.get(sel);
  if (!has) { fails.push(`[契约] 找不到顶层规则 ${sel}`); continue; }
  for (const [prop, expected] of Object.entries(props)) {
    expect(`[契约] ${sel} 的 ${prop}`, has.get(prop), expected);
  }
}

/* ---------- 2. 动效分级变量（--m-* 必须等于 tokens 的档位） ---------- */
const TIER_SEL = { full: ':root', light: 'html[data-motion="light"]' };
const TIER_PROP = {
  dur1: '--m-dur-1',
  dur2: '--m-dur-2',
  dur3: '--m-dur-3',
  dist1: '--m-dist-1',
  dist2: '--m-dist-2',
  dist3: '--m-dist-3',
  stagger: '--m-stagger',
  parallax: '--m-parallax',
  spot: '--m-spot'
};
for (const [tier, sel] of Object.entries(TIER_SEL)) {
  const has = declMap.get(sel);
  if (!has) { fails.push(`[分级] 找不到顶层规则 ${sel}`); continue; }
  for (const [key, prop] of Object.entries(TIER_PROP)) {
    expect(`[分级] ${sel} 的 ${prop}`, has.get(prop), TOKENS.motion.tiers[tier][key]);
  }
}
const rootDecl = declMap.get(':root');
if (rootDecl) {
  expect('[分级] :root 的 --ease-soft', rootDecl.get('--ease-soft'), TOKENS.motion.ease.soft);
  expect('[分级] :root 的 --ease-snap', rootDecl.get('--ease-snap'), TOKENS.motion.ease.snap);
}

/* ---------- 3. JS 侧动效常数 ---------- */
const js = readFileSync(JS_PATH, 'utf8');
const JS_CHECKS = [
  ['GX 光斑衰减半径 POOL', /var POOL = (\d+);/, TOKENS.motion.gx.pool],
  ['GX 棱边接光带 RIM_BAND', /var RIM_BAND = (\d+);/, TOKENS.motion.gx.rimBand]
];
for (const [name, re, expected] of JS_CHECKS) {
  const m = re.exec(js);
  checkedCount += 1;
  if (!m) fails.push(`[JS] main.js 里找不到 ${name}`);
  else if (Number(m[1]) !== Number(expected)) fails.push(`[JS] main.js 的 ${name} 期望 ${expected}，实为 ${m[1]}`);
  else okCount += 1;
}

/* ---------- 4. DESIGN.md 契约表同步 ---------- */
function buildDocBlock() {
  const t = TOKENS;
  const fw = t.fontWeightAllowed.filter((v) => v !== 'inherit').join(' / ');
  const rows = [
    ['间距刻度', t.spacingScale.join(' / ')],
    ['gap 允许值', t.gapAllowed.join(' / ')],
    ['字号', '12 / 13 / 14 / 16 / 18px（另含 rem 与标题 clamp 白名单，见 design.tokens.json）'],
    ['字重', `${fw}（上限 600）`],
    ['半径', '999 胶囊 · 50% 圆 · 16 面板 · 12 内层 · 8 小容器 · 4 微型 · 2 线形（嵌套 16→12→8→4）'],
    ['控件高度', `lg ${t.controlHeights.lg} · md ${t.controlHeights.md} · sm ${t.controlHeights.sm} · fab ${t.controlHeights.fab} · 导航条 ${t.controlHeights.nav}`],
    ['页级节奏', `页头→首块 ${t.pageRhythm.headToFirstBlock} · 工具条→内容 ${t.pageRhythm.toolbarToGrid} · 内容→动作行 ${t.pageRhythm.contentToActions} · 标签→行 ${t.pageRhythm.labelToRow}`],
    ['行间距', `按钮行 ${t.rowGaps.buttonRow} · 工具条 / 徽章行 / chip 对 ${t.rowGaps.toolbar}`],
    ['动效时长', `full ${t.motion.tiers.full.dur1} / ${t.motion.tiers.full.dur2} / ${t.motion.tiers.full.dur3} · 轻量 ${t.motion.tiers.light.dur1} / ${t.motion.tiers.light.dur2} / ${t.motion.tiers.light.dur3}（悬停 / 边框与跨页 / 浮现）`],
    ['动效位移', `full ${t.motion.tiers.full.dist1} / ${t.motion.tiers.full.dist2} / ${t.motion.tiers.full.dist3} · 轻量 ${t.motion.tiers.light.dist1} / ${t.motion.tiers.light.dist2} / ${t.motion.tiers.light.dist3}；错峰 ${t.motion.tiers.full.stagger} / ${t.motion.tiers.light.stagger}`],
    ['动效曲线', `${t.motion.ease.soft}（soft）· ${t.motion.ease.snap}（snap）`],
    ['光斑', `强度 full ${t.motion.gx.spotFull} · 轻量 ${t.motion.gx.spotLight} · 衰减半径 ${t.motion.gx.pool}px · 棱边接光带 ${t.motion.gx.rimBand}px`],
    ['阅读进度', `pathLength ${t.motion.reading.pathLength} · 环线与目录指示条 ${t.motion.reading.stroke}px`],
    ['正文对比度', `≥ ${t.contrastMin}:1`]
  ];
  if (t.renderedContract.footerSticky) {
    rows.push(['页脚', '贴底：body 竖直弹性列 + main flex:1（短页也贴屏幕底；渲染门禁断言 文档底=页脚底 且 文档高≥视口）']);
  }
  for (const g of t.renderedContract.uniformFillGroups || []) {
    rows.push(['块同色组', `${g.label}：${g.root} 内 ${g.childSelectors.join(' / ')} 同底色 + 同阴影（渲染门禁断言）`]);
  }
  const head =
    '> 本表由 `design.tokens.json` 自动生成（`npm run design:sync`），检查器校验一致性——请勿手改。\n\n' +
    '| 契约 | 值 |\n|---|---|';
  const body = rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  return `${MARK_START}\n${head}\n${body}\n${MARK_END}`;
}

const doc = readFileSync(DOC_PATH, 'utf8');
const i0 = doc.indexOf(MARK_START);
const i1 = doc.indexOf(MARK_END);
if (i0 === -1 || i1 === -1) {
  fails.push('[文档] DESIGN.md 缺少 design-tokens:auto 标记块（把生成的契约表插进去）');
} else {
  const next = doc.slice(0, i0) + buildDocBlock() + doc.slice(i1 + MARK_END.length);
  if (next !== doc) {
    if (WRITE) {
      writeFileSync(DOC_PATH, next);
      console.log(`[文档] 已同步 DESIGN.md 契约表（${TOKENS.version} 版 tokens）`);
    } else {
      fails.push('[文档] DESIGN.md 契约表与 design.tokens.json 不一致（运行 npm run design:sync）');
    }
  } else {
    checkedCount += 1;
    okCount += 1;
  }
}

/* ---------- 5. 跨页过渡不变量：只允许整页 opacity 淡化 ----------
   文字一旦被快照后再平移/缩放就会重采样；命名内容元素还会留下旧标题残影。
   这里把"除导航外不许有独立快照、root 不许位移"锁进源码门禁。 */
const vtn = [];
root.walkDecls('view-transition-name', (d) => {
  const sel = d.parent.selector.replace(/\s+/g, ' ').trim();
  vtn.push(`${sel}=${d.value}`);
});
expect('[过渡] 只允许导航拥有独立快照', vtn.sort().join(' | '), '.nav=site-nav | html.vt-theme .nav=none');

const legacySel = [];
root.walkRules((r) => {
  if (/vt-name|data-vt-|vt-arrive|vt-settle|vt-morph|vt-dir/.test(r.selector)) legacySel.push(r.selector);
});
expect('[过渡] 不得再有飞行标题 / 方向 / morph 规则', legacySel.join(' | '), '');

const rootNew = declMap.get('::view-transition-new(root)');
expect('[过渡] 新页 root 只做令牌化淡入', rootNew && rootNew.get('animation'), 'vt-fade-in var(--m-dur-2) var(--ease-soft) both');
const rootGroup = declMap.get('::view-transition-group(root)');
expect('[过渡] root 组不做位置/尺寸插值', rootGroup && rootGroup.get('animation'), 'none');

let fade = null;
const legacyKf = [];
root.walkAtRules('keyframes', (at) => {
  if (at.params === 'vt-fade-in') fade = at;
  else if (/^vt-(page|morph|in-|out-)/.test(at.params)) legacyKf.push(at.params);
});
const fadeDecls = [];
if (fade) fade.walkDecls((d) => fadeDecls.push(`${d.prop}:${d.value}`));
expect('[过渡] vt-fade-in 只改 opacity', fadeDecls.join(' | '), 'opacity:0');
expect('[过渡] 不得再有位移动画关键帧', legacyKf.join(' | '), '');

const legacyMarks = [
  ['main.js', js],
  ['templates.mjs', readFileSync(path.join(ROOT, 'scripts', 'templates.mjs'), 'utf8')],
  ['build.mjs', readFileSync(path.join(ROOT, 'scripts', 'build.mjs'), 'utf8')],
  ['index.html', readFileSync(path.join(ROOT, 'index.html'), 'utf8')]
];
for (const [file, src] of legacyMarks) {
  expect(`[过渡] ${file} 不得残留旧标记`,
    /vt-name|data-morph|data-vt\b|vt-dir|vt-morph|vt-arrive|vt-settle/.test(src), false);
}

/* ---------- 结果 ---------- */
console.log(`[check-design] 源码契约 ${okCount}/${checkedCount} 条通过`);
if (fails.length) {
  console.log(`[check-design] 失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('[check-design] 全部通过 ✓');
