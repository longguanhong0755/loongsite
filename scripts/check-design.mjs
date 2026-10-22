#!/usr/bin/env node
/* loongsite 源码级设计契约检查（与 stylelint 配套）。
   1) 断言 design.tokens.json 的 sourceContract 每条声明在 style.css 中精确成立
   2) 断言 DESIGN.md 的自动契约表与 tokens 一致
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
const DOC_PATH = path.join(ROOT, 'DESIGN.md');
const MARK_START = '<!-- design-tokens:auto:start -->';
const MARK_END = '<!-- design-tokens:auto:end -->';
const WRITE = process.argv.includes('--write');

const fails = [];
let okCount = 0;

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

let contractCount = 0;
for (const [sel, props] of Object.entries(TOKENS.sourceContract)) {
  if (sel.startsWith('_')) continue;
  const has = declMap.get(sel);
  if (!has) { fails.push(`[契约] 找不到顶层规则 ${sel}`); continue; }
  for (const [prop, expected] of Object.entries(props)) {
    contractCount += 1;
    const got = has.get(prop);
    if (got === undefined) fails.push(`[契约] ${sel} 缺少声明 ${prop}: ${expected}`);
    else if (got !== expected) fails.push(`[契约] ${sel} 的 ${prop} 期望 ${expected}，实为 ${got}`);
    else okCount += 1;
  }
}

/* ---------- 2. DESIGN.md 契约表同步 ---------- */
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
    okCount += 1;
  }
}

/* ---------- 结果 ---------- */
const contractFails = fails.filter((f) => f.startsWith('[契约]')).length;
console.log(`[check-design] 源码契约 ${contractCount - contractFails}/${contractCount} 条通过`);
if (fails.length) {
  console.log(`[check-design] 失败 ${fails.length} 项：`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('[check-design] 全部通过 ✓');
