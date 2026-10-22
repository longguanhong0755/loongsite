# loongsite — 给 AI 代理（和未来的人）的工作约定

这个站点的审美标准不是"感觉"，是**可执行的契约**。动手前先读：

1. `DESIGN.md` —— 设计系统唯一标准（§10 是自动门禁说明）
2. `design.tokens.json` —— 一切数值的唯一事实源（刻度 / 档位 / 半径矩阵 / 页级节奏 / 组件契约）

## 硬规则

- 只动允许的文件：`assets/css/style.css`、`scripts/templates.mjs`、`scripts/build.mjs`、
  `data/*.json`、`data/posts/*.md`。不要改动 `design.tokens.json` 之外引入数值的方式。
- **不许引入刻度外数值**：
  - 字号 ∈ `fontSizeAllowed`（12/13/14/16/18px 或等值 rem；标题只用登记过的 clamp）
  - 字重 ∈ {400, 500, 600}（上限 600）
  - `gap` ∈ `gapAllowed`（1/2/3/4/6/8/12/16/24/32/48；无 7/9/10/17/22）
  - `border-radius` 只许 `var(--radius)` / `var(--radius-sm)` / `var(--radius-xs)` /
    `var(--radius-2xs)` / `999px` / `50%` / `inherit` / `2px`（字面量 px 圆角禁止）
  - 加新数值的顺序：改 `design.tokens.json` → `npm run design:sync` → 再改 CSS
- 控件高度只用四档：**lg 44 / md 36 / sm 32 / fab 40**（导航条 56）。高度必须显式 `height`，
  不许依赖继承行高拼出来（会出 46.5px 这种半像素）。
- 页级节奏（契约）：页头→首块 **48**、工具条→内容 **16**、内容→动作行 **24**、
  按钮行 gap **12**、工具条 / 徽章行 / chip 对 gap **8**；区块之间 88。
- 圆角嵌套律：**16 → 12 → 8 → 4**（内层永远小一档）。
- **页脚贴底**：`body` 必须保持竖直弹性列（`display:flex; flex-direction:column`）+ `main { flex:1 }`——
  短页页脚也要在屏幕底（渲染门禁断言：文档底=页脚底）。
- **块同色**：`.contact-card` 内所有块（`.btn` / `.btn-ghost` / `.chip-copy`）必须同底色同阴影
  （`--panel-strong` + `var(--rim), var(--shadow-sm)`）；悬停只亮边框、不改底色（渲染门禁断言）。
- 粒子层（`bg-fx`）：种子必须每次加载随机（`Math.random()`），不许改回固定种子（刷新会回到同一张图）。
- 站点保持**零外部依赖**：不加运行时 JS/CSS/字体/CDN。图标只用手写内联 SVG 或本地 PNG。
- `DESIGN.md` §8 的本地扩展（玻璃 / 粒子 / 光感悬停 / 头像盘 / 水波纹 / 双主题 / 终端）**不可删**。
- 悬停语言：**只留光感**——光标处一束光 + 边框提亮；不位移、不换背景色、不加阴影跳变。
- 部署只走 `python scripts/deploy-server.py`（内置设计门禁；`--skip-verify` 慎用）。

## 交付门槛（每次改完必须全绿）

```
npm run verify     # = build + check + audit
```

- `check`：源码级——stylelint 白名单 + `scripts/check-design.mjs` 组件契约 + DESIGN.md 文档同步。
- `audit`：渲染级——`scripts/audit-design.py` 在 9 类页面 × 浅/深 × 1440/390 上断言
  控件高度档位、页级间距、左缘同轴、半径、成对控件等高、主按钮对比度、无横向溢出，
  并与 `tests/design-baseline/` 做像素基线比对。
- 有意改变视觉时（例如设计升级）：先 `npm run audit -- --no-baseline` 确认断言全绿 →
  人工过目截图 → `npm run baseline` 重新冻结基线 → 提交时说明原因。
- 审计失败时输出会精确到"哪个页面 / 哪个选择器 / 期望 vs 实测"，按提示修，不要绕。
