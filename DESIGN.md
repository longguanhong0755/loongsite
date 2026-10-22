# loongsite DESIGN.md —— 设计系统（唯一标准）

> 本文件是 loongsite 的设计系统**唯一标准（single source of truth）**；所有**数值**的唯一来源是
> `design.tokens.json`（§10 自动门禁）。改任何页面前先读本文件；交付前必须 `npm run verify` 全绿。
> 令牌与实现的落点：`assets/css/style.css` 顶部的 `:root`（亮色）与 `html[data-theme="dark"]`（暗色）
> 两块；图标（内联 SVG）在 `scripts/templates.mjs` 的 `ICONS`。

**规则来源注记**：本站语言为底；下列规则取材自 GitHub `VoltAgent/awesome-design-md`（84 份设计体系）
中与本站同向的五份，只取与本站一致的部分——
`vercel`（类型刻度 / 4px 间距 / 圆角集 / 分层阴影 / 代码窗 / 主按钮黑墨）、
`x.ai`（mono 小标签 / 发丝线承载层级 / 字重纪律）、`ollama`（终端卡 / 区块节奏 / 每页一个深色时刻）、
`linear.app`（4 级表面阶梯 / 发丝线优先于阴影）、`resend`（发丝线用半透明 alpha 表达 / 代码窗三点 chrome）。
**五家的强调色、渐变、品牌色一律不采用。**

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- 名字：**石墨玻璃纸（graphite glass paper）**——纯黑白灰的玻璃层压在网格纸上，一束光在上面走。
- 关键词：纯黑白灰 · 玻璃（backdrop blur）· 发丝线 · 网格 + 胶片颗粒 + WebGL 粒子网 · 一束光 ·
  技术制图细节（四角刻度 / 等宽小标 / 章节编号 01–05）。
- 情绪：冷静、精确、有呼吸感。**不热闹、不炫技、不解释**。
- 明暗双主题是**对等的一等公民**：暗色不是"深色 band"，而是完整 token 集（§2）。
- 禁止：任何强调色 / 渐变 / 插图 / emoji / 花字体。

## 2. Color Palette & Roles（颜色与角色）

**零强调色（硬约束）**。全站界面色只有黑白灰；彩色仅允许出现在**品牌图标**里
（QQ、Gmail、洛谷、linux.do、LD士多、三个游戏图标）——它们是"内容"，不是"界面色"。

**表面阶梯**（4 级，取自 Linear 的表面阶梯概念）：

| token | 用途 |
|---|---|
| `--panel` | 大块玻璃面（卡片、导航） |
| `--panel-strong` | 需要更实一点的面（按钮、chip、悬浮件） |
| `--panel-solid` | 完全要不透明的场合（弹层里的图、指标格、代码按钮） |
| `--panel-inset` | "凹陷"底（输入框、行 hover、卡片图标底、tag） |

纪律：一个元素只用一层表面；最多两层嵌套（外层玻璃卡 → 内层按钮/chip）。

**文字阶梯**（3 级，取自 Vercel 的 ink/body/mute）：`--text`（标题/正文）· `--text-2`（次要）·
`--text-3`（弱，标签/说明）。正文不用 `--text-3`。

**发丝线三级**（用半透明 alpha 表达，取自 Resend）：
`--line-soft`（分区、表格线）· `--line`（常规边框）· `--line-strong`（hover / 强调边框）。
亮色 `rgba(19,19,21,.07/.13/.22)`，暗色 `rgba(255,255,255,.07/.13/.26)`。
卡片**内部**分区用 dashed（contact-group、site-url 等），卡片**外框**一律 solid。

**实心反色**（取自 Vercel "black ink IS the conversion target"）：`--solid` / `--solid-text`。
亮色=黑底白字，暗色=白底黑字。只有三种元素可以用：主按钮 `.btn-primary`、
当前选中的筛选 `.filter-chip.is-active`、跳转链接 `.skip-link`。

其余：`--sel`（选区）· `--code-bg`（代码底）· `--tok-*`（语法四色，均为灰阶）·
`--grid` / `--grain` / `--glow`（背景）。

## 3. Typography Rules（排版）

**字体**：只用系统字体栈 `--sans` / `--mono`，**零自托管字体**（上游 Vercel 文档本身即认可 system-ui 回退）。
`--mono` 只用于**技术层**：代码、终端、文件名、指标数字、小标签。**正文永不用 mono。**

**刻度**（按 Vercel 角色表收敛；clamp 为响应式区间）：

| 角色 | 字号 | 字重 | 行高 | 字距 | 用于 |
|---|---|---|---|---|---|
| display-xl | 40–56 (clamp) | 600 | 1.02 | -0.04em | hero 名字 |
| display-lg | 28–32 (clamp) | 600 | 1.25 | -0.02em | 二级页标题 |
| display-md | 24–32 (clamp) | 600 | 1.25 | -0.02em | 章节标题 |
| display-sm | 20 / 16–20 (clamp) | 600 | 1.3 | -0.02em | 卡片标题、hero 副题 |
| body-lg | 18 | 400 | 1.75 | 0.012em | 引导段（page-lead） |
| body | 16 | 400 | 1.75 | 0.012em | 正文（桌面与移动端同一档） |
| body-sm | 14 | 400 | 1.7 | 0.012em | 次要文字、按钮、列表 |
| caption | 12 | 400 / 600 | 1.6 | 0.04em | 小标签、meta |
| code | 13 | 400 | 1.7 | 0 | 代码/终端/文件树 |

**纪律**：
- 字重上限 **600**；只有 400 / 500 / 600 三档（500 用于按钮与强调，600 用于标题）。
- **不存在半像素字号**（12.5 / 13.5 / 14.5 等一律不进代码）。
- 小标签两档（取自 x.ai 的 mono 标签概念，按中文折半）：**大写 mono 标签 → 字距 0.12em**；
  **小写 mono 标签 → 0.04em**。`text-transform: uppercase` 只用于标签，**标题永不全大写**。
- 标题负字距是"口音"：display 系 -0.02em，hero -0.04em；中文按量级折半理解，不逐值照搬。
- 数字（指标、日期、UID、计数）一律 `font-variant-numeric: tabular-nums`。

## 4. Component Stylings（组件）

- **玻璃卡** `.glass`：`background: var(--panel)` + `backdrop-filter: blur(20px) saturate(1.25)` +
  1px `var(--line)` 边框 + `var(--rim)` 顶部高光 + 阴影（§6）。圆角 `--radius: 16px`。
- **按钮**：唯一几何=胶囊（`border-radius: 999px`，等同上游 pill 语义；一屏内不混用按钮几何）。
  高度三档（§10 契约）：**lg 44**（`.btn` / `.btn-primary` / 静态 chip / 复制圆钮）·
  **md 36**（`.btn-sm` / 筛选胶囊 / 导航项）· **sm 32**（徽章 / 标签 / 终端 chips / 复制按钮 / 面包屑）。
  导航条整体 **56**。控件高度由显式 `height` 决定、弹性居中，**不吃正文行高**（防半像素高度）。
  - `.btn`（玻璃底）/ `.btn-primary`（实心反色）/ `.btn-ghost`（透明）/ `.btn-sm`（小一号）。
- **hover 语言（本站核心）**：**悬停=只留光感**——光标处一束光 + 边框提亮。
  不给整块加色、无位移、无阴影跳变、无相邻变暗、无扫线。
  - 玻璃块：GX 光斑系统（`--gx-spot` / `--gx-rim` / `--gx-edge`，光标位置注入）。
  - **实心反色面专属上限**（`--gx-spot-solid: .18` / `--gx-edge-solid: 0` / `--gx-rim-solid: .5`）：
    黑底白字面上只留"一束薄光"、没有宽光晕——防止亮色模式下黑按钮被白斑盖成白底白字
    （修前实测：白斑 0.95 叠满 → 白底白字；修后：文字对比度 ≈7.3:1）。
  - 卡片：`border-color → var(--line-strong)` + 四角刻度呼应；行/树节点：`--panel-inset` 底。
- **chip**：`.chip-pair` = 静态 chip（`cursor: default`）+ 复制圆钮（与 chip **等高**的圆形，lg 档 44px，hover 提亮）；
  UID/邮箱数字用 mono。
  - **联系卡同色（契约）**：`.contact-card` 内所有块**同一材质、同一底色**——静态 chip、社交链接 chip
    （`.btn-ghost` 在卡内被提为实心面）与复制圆钮（`.chip-copy`）一律 `--panel-strong` 底 + `var(--rim), var(--shadow-sm)`；
    悬停只亮边框、**不改底色**。卡内不允许出现第二种填充色（渲染门禁断言）。
- **标签**：`.badge`（胶囊 + 前置小圆/小方点）· `.tag`（8px 圆角）· `.path-copy` / `.kbd`。
- **导航**：胶囊导航（滚动后压缩 + 阴影加深）；当前项 = `--panel-inset` 底 + inset 发丝环；36px 圆图标钮。
- **终端** `.term`：三点 chrome + 等宽 13/1.7 + 命令 chips + 前缀 `$`；每页**只此一处**深色/终端时刻。
- **代码窗**：mono 13、行号列、行 hover `--panel-inset`、语言色条为灰阶分段（`lang-bar`）。
- **正文** `.prose`：16px；inline code 4px 圆角 mono（微型档）；引用=2px 左发丝线；表格发丝线分隔。
- **头像盘**（hero 专属）：3D 倾斜（≤11°、640px 透视）+ 盘缘水波纹——用户点名效果，见 §8。

## 5. Layout Principles（布局）

- 容器 `--wrap: 1080px`（`min(1080px, 100% - 48px)`；移动端 gutter 32px）。
- 区块节奏：`.section` 上间距 **88px**（移动端 64px）；页脚 `margin-top: 96px`。
- 间距基准 **4px**。主刻度：`4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 88 · 96`。
  紧凑档 `2 · 6 · 10` 仅限光学微调与行内小间隙（如徽章内 4px、chip 内 6px），新代码优先主刻度。
- 栅格间距 16px；卡片内边距 24px（大面板 24/32）；二级页头部 `padding-top: 48px`。
- **页级节奏（契约）**：页头 → 首个内容块 **48**（与"导航 → 返回"的 48 对称）；
  工具条（筛选 chips）→ 内容网格 **16**；内容 → 动作行 **24**；分组标签 → 按钮行 12；区块之间 88 不变。
- **行间距（契约）**：按钮行 gap **12**；工具条 / 徽章行 / chip 对 gap **8**。
- **页脚贴底（契约）**：`body` 为竖直弹性列（`display:flex; flex-direction:column`），`main { flex:1 }`——
  正文不足一屏的短页（/blog/、/sites/ 等）页脚同样贴住屏幕底；任何页面 **文档底 = 页脚底**
  （渲染门禁断言，防止再出现"博客页页脚悬在半空"）。
- **半径矩阵（契约）**：999 胶囊 · 50% 圆 · 16 面板 · 12 面板内层/媒体 · 8 小容器（32 档）·
  4 微型（≤24px）· 2 线状图形；**嵌套律 16→12→8→4**（内层永远小一档）。字面量圆角一律走 `var()`。

## 6. Depth & Elevation（浮起）

三级阴影，**全部是"多层小偏移 + 低透明度"的堆叠，绝不单层重投影**（取自 Vercel 的分层阴影纪律）：

| token | 值（亮色） |
|---|---|
| `--shadow-sm` | `0 1px 1px rgba(15,15,18,.04), 0 2px 4px -1px rgba(15,15,18,.06)` |
| `--shadow-md` | `0 2px 4px -1px rgba(15,15,18,.06), 0 12px 24px -12px rgba(15,15,18,.18)` |
| `--shadow-lg` | `0 4px 8px -4px rgba(15,15,18,.05), 0 24px 56px -28px rgba(15,15,18,.26)` |

暗色主题同构（`rgba(0,0,0,…)`）。**发丝线优先于阴影**：能靠 1px 边框分层的场合不上阴影
（pager-item、notice、chip 等平面件只有边框）。`--rim`（1px 顶部高光）是玻璃"有厚度"的唯一暗示。

## 7. Motion（动效）—— 本站扩展

- **分级**：只有 `full` / `light` 两档。首绘前由 `<head>` 内联脚本定档并写进 `html[data-motion]`——
  系统减动效、省流量或 2G-慢网、核心数 ≤2 / 内存 ≤2GB 落到 `light`；
  `?motion=full|light` 人工覆盖并记住。普通笔记本（4 核 / 4GB）仍是完整档。
- **轻量档不是关掉效果**：时长更短、位移更小、景深视差（`--m-parallax`）关掉，签名效果照样在。
- 令牌：数值唯一来源是 `design.tokens.json → motion`，CSS 侧为 `--m-dur-1/2/3`、`--m-dist-1/2/3`、
  `--m-stagger`、`--m-parallax`、`--m-spot`；`--dur-1/2/3` 只是指向它们的别名。
  曲线只有 `--ease-soft`（cubic-bezier(.22,.61,.36,1)）与 `--ease-snap`（cubic-bezier(.2,.7,.2,1)）。不许出现第二组。
- 分工：悬停色/光 `--m-dur-1`；边框、跨页淡化、导航压缩 `--m-dur-2`；滚动浮现与到达后上浮 `--m-dur-3`。
  错峰写**序号**不写时长：JS 只给 `--rise-i` / `--d`，实际延迟 = `calc(序号 * var(--m-stagger))`——
  JS 里不许出现第二套时长或位移数字（要读令牌就走 `LSMotion.dur/dist/stagger`）。
- 按帧任务统一走 `Motion.frame(key, fn)`：同一 key 一帧内只跑一次，页面隐藏时不排空、回前台补一帧。
- 滚动浮现：向下进入视口时从下方浮入（错峰），回翻从上方进入直接显示（`.no-rise`）；滚出收起重播。
- **跨页过渡按"关系"选**（不是所有跳转一个样）：点击时算出这页和目标页的关系，写进 `sessionStorage`，
  新页在首绘前读走并落到 `html[data-vt-dir]` / `html[data-vt-morph]`：
  - 列表→详情（卡片 / 翻页条目）：`data-morph` 指定共享元素名，卡片展开成详情容器，根层只淡入；
  - 同栏目内往返：`data-vt-dir=fwd|back` → 方向化横向滑入；
  - 跨栏目：不带方向，整页从上方落位 + 首屏块上浮。
  morph 优先于方向——两者同时存在时横向滑动会和卡片展开抢镜头，所以方向规则一律带 `:not([data-vt-morph])`。
  morph 期间标题不再单独飞（`html[data-vt-morph] .vt-name { view-transition-name: none }`）：
  父子同名会让整次过渡作废。
- **首屏分层入场**：层间错峰 = `--m-stagger × --hero-layer-ratio`（2.5），
  字符间错峰 = `--m-stagger × --hero-char-ratio`（1.25）。写成**比率**而不是绝对时长——
  轻量档 stagger 变短，错峰自动等比缩小，不必再维护第二套数字。
  标题拆成字符逐个浮起（完整档带 3D 倾斜 `ch-in`，轻量档只做小位移 `ch-in-flat`）；
  拆完要留无障碍：`h1` 挂 `aria-label` 原文，字符块 `aria-hidden`。
- **景深视差**（仅首页 / 项目详情）：`--px` 是 JS 写的 0~1 滚动进度，
  每层行程 = `--px × --px-f × --m-parallax`（`--px-f` = 该层像素，行程越大越"近"）。
  视差写**独立的 `translate` 属性**（不写 `transform`）——玻璃悬停的 3D 倾斜走 `transform`，
  两者分开写才叠加而不是互相顶掉。
  只让"层间空隙会变大"的方向错速：竖着排的内容（正文压到指标上）会露馅。
- **导航玻璃块拖拽**：按住当前栏目的玻璃块横向拖到别的栏目，那块玻璃跟着手指走、
  落点栏目高亮，**松手才跳转**；拖到空白处松手 = 什么都不发生。阈值 6px，
  纵向滚动不受影响（`touch-action: pan-y`）。
- **GX 光斑（P3）**：显影不再是"命中 / 没命中"两档。JS 每帧按光标到玻璃块的距离算衰减系数
  `--gx-k`（1 − d/`pool`，`pool` = 76px），按光标到块顶边的距离算棱边接光系数
  `--gx-rim-k`（影响带 `rimBand` = 90px），两个系数写在**宿主**上（`--mx` / `--my` 同理）。
  CSS 只做乘法，不自己算距离：宽光晕 `--gx-k × 0.55 × --m-spot`，命中块满强度 `--m-spot`。
  三层光：宽光晕（`.gx-veil`）→ 顶边棱光（`::before`，`background-size: 100% 2px` 只画顶边一条）→
  光标正下方的高光核（`::after`）。`--m-spot`（满档 1 / 轻档 0.7）就是分级强度。
  键盘焦点才发光斑：普通 `:focus-within` 不亮，`:focus-visible` / `:has(:focus-visible)` 才亮。
- **微交互（P3）**：沿用卡片那条语言——悬停**不**整体改块色、不挪布局，动的是局部元素。
  图标轻推 = `--m-dist-1` 的一半（满档 3px、轻档 1.5px），不另立一套数字：
  按钮里的箭头右推、外链箭头右上、返回箭头左推。
  行内链接的下划线从左往右扫出（`background-size: 0% 1px → 100% 1px`）代替原来直接变色的下划线。
  异步动作（复制）走三态：转圈 `.ic-spin`（循环指示器，转速固定不随档位）→ 对勾 `.ic-ok`
  （`--m-dur-2`）→ 1.6s 后复原图标与 `aria-label`；进行中挂 `aria-busy="1"`。
- **筛选编排（P3）**：退场（淡出缩小）→ 真正隐藏后网格重排 → FLIP 位移落位 → 进场（淡入 + 放大 0.97）。
  顺序有讲究：退场卡片还在流里时留下的卡片位置根本没变，先量新位置 FLIP 才有意义。
  隐藏中的卡片量出来是空矩形，**不能当旧位置用**——否则进场卡片从文档原点 (0,0) 飞进来。
  连续快点用 `filterSeq` 作废上一轮，退场动画要先取消。
  选中指示条固定 28px，只跟活动芯片平移（`translate3d`），不改宽不改块色。
- `prefers-reduced-motion`：停掉导航位移（`scroll-behavior`），其余交给上面的轻量档。
- **例外（用户点名的"签名效果"，不受减动效限制）**：背景粒子层、头像盘 3D 倾斜、盘缘水波纹。

## 8. Local Extensions（上游没有、本站固有——**不可删**）

上游 84 份文档全都没有下列内容，它们是本站的设计资产，改动前必须明白后果：

1. 玻璃模糊参数（`blur(20px) saturate(1.25)`）与折射滤镜（glassfx 移植，仅 Chromium）。
2. GX「一束光」悬停系统（含实心面上限，§4）。
3. WebGL 粒子网背景 + 网格 + 胶片颗粒 + 光晕呼吸（`bg-deco` / `bg-fx`）——粒子种子**每次加载随机**
   （刷新后布局与漂移轨迹不重复；固定种子会让每次刷新回到同一张图）。
4. 跨页纯交叉淡化（View Transitions，导航不动）+ 预渲染（Speculation Rules）。
5. 顶部进度条 / 回顶 / 全局轻提示（toast）。
6. 头像盘 3D 倾斜 + 盘缘水波纹（明细参数在 `main.js` 头像 IIFE 与 `style.css` `.hero-disc` 段）。
7. 迷你终端（关于我 / 404）与仓库浏览器（文件树 / 过滤 / 行链接）。
8. 双主题 token 对照表（`:root` ↔ `[data-theme="dark"]`）。
9. 品牌彩色图标例外（§2）。

## 9. Do's and Don'ts

**Do**：用 token 不写裸值 · 悬停只留光感 · 正文 16px · 数字 tabular-nums · 发丝线承载层级 ·
一屏一种按钮几何 · 每页最多一个"深色/终端时刻" · 新值必须来自 §3/§5 的刻度。

**Don't**：引入第 7 种颜色或任何强调色/渐变 · 正文用 mono · 标题全大写 · 单层重投影阴影 ·
标题字重 >600 · 半像素字号 · 给实心面全强度光斑 · 给平面件加阴影 · 删 §8 的本地扩展。

**Agent Prompt Guide**：改页面前先读本文件 → 只动 `style.css` / `templates.mjs` / `build.mjs` →
`npm run build`（应输出 72 页 + 2 篇博客）→ 本地 `node scripts/serve.mjs 8094` →
截图矩阵：8 类页面（首页 / 项目列表 / 项目详情 / 网站 / 博客列表 / 博客文章 / 仓库 / 404）
× 浅深 × 1440/390，另加主按钮 hover、减动效、移动端溢出检查；
控制台须零错误（本地 `serve.mjs` 对 `/nope/` 的 404 状态是预期行为）。
**交付门槛：`npm run verify`（build + check + audit）必须全绿（§10）。**

## 10. 自动门禁（Enforcement）—— 标准不靠人记

唯一事实源：**`design.tokens.json`**（刻度 / 档位 / 半径矩阵 / 页级节奏 / 组件契约）。
本文件的契约表、CSS 的 `:root` 变量、两个检查器全部从它取值。

- **源码级 `npm run check`**：stylelint 白名单（`border-radius` / `font-size` / `font-weight` / `gap`
  只许 token 值）＋ `scripts/check-design.mjs` 对关键组件逐条断言声明值（`sourceContract`）。
- **渲染级 `npm run audit`**：`scripts/audit-design.py` 无头浏览器在 8 类页面 × 浅/深 × 1440/390 上断言
  控件高度档位、页级间距（页头→首块 48 / 工具条→网格 16 …）、左缘同轴、半径、成对控件等高、
  对比度、无横向溢出；并对 `tests/design-baseline/` 做像素基线比对（`npm run baseline` 冻结基线）。
- **文档同步**：下表由 `npm run design:sync` 从 tokens 生成，`check` 校验一致性（防文档漂移）。

新增任何数值（字号 / 半径 / 档位 / 间距）的顺序：先改 `design.tokens.json` → `npm run design:sync`
→ 再改 CSS → 最后 `npm run verify` 全绿。

<!-- design-tokens:auto:start -->
> 本表由 `design.tokens.json` 自动生成（`npm run design:sync`），检查器校验一致性——请勿手改。

| 契约 | 值 |
|---|---|
| 间距刻度 | 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 / 88 / 96 |
| gap 允许值 | 1 / 2 / 3 / 4 / 6 / 8 / 12 / 16 / 24 / 32 / 48 / clamp(24px, 4vw, 48px) |
| 字号 | 12 / 13 / 14 / 16 / 18px（另含 rem 与标题 clamp 白名单，见 design.tokens.json） |
| 字重 | 400 / 500 / 600（上限 600） |
| 半径 | 999 胶囊 · 50% 圆 · 16 面板 · 12 内层 · 8 小容器 · 4 微型 · 2 线形（嵌套 16→12→8→4） |
| 控件高度 | lg 44 · md 36 · sm 32 · fab 40 · 导航条 56 |
| 页级节奏 | 页头→首块 48 · 工具条→内容 16 · 内容→动作行 24 · 标签→行 12 |
| 行间距 | 按钮行 12 · 工具条 / 徽章行 / chip 对 8 |
| 动效时长 | full 0.16s / 0.24s / 0.5s · 轻量 0.1s / 0.14s / 0.3s（悬停 / 边框与跨页 / 浮现） |
| 动效位移 | full 6px / 16px / 28px · 轻量 3px / 8px / 14px；错峰 0.028s / 0.016s |
| 动效曲线 | cubic-bezier(0.22, 0.61, 0.36, 1)（soft）· cubic-bezier(0.2, 0.7, 0.2, 1)（snap） |
| 光斑 | 强度 full 1 · 轻量 0.7 · 衰减半径 76px · 棱边接光带 90px |
| 正文对比度 | ≥ 4.5:1 |
| 页脚 | 贴底：body 竖直弹性列 + main flex:1（短页也贴屏幕底；渲染门禁断言 文档底=页脚底 且 文档高≥视口） |
| 块同色组 | 联系卡所有块同底色同材质：.contact-card 内 .btn / .chip-copy 同底色 + 同阴影（渲染门禁断言） |
<!-- design-tokens:auto:end -->
