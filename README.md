# loongsite —— loong 的个人网站

个人主页 / 作品集 / 技术博客，纯静态站点：**零运行时依赖、零外部请求**——样式与线条图标手写内联；品牌与游戏图标用各自官方的原色版本（内联 SVG / 本地 PNG）。

## 现在长什么样

- 首页：Hero（**可倾斜的头像盘** + 名字 + 头衔 + **QQ 联系**/GitHub 按钮 + 真实数据统计条）、**可交互迷你终端**（关于我）、技能、精选项目、我的网站、联系（彩色品牌标；邮箱与游戏 UID 不可点、旁边一键复制；游戏组：原神 / 崩铁 / 异环，官方 App 图标）
- 站点分类：首页 / 项目 / **网站** / 博客，四个导航分类
- 项目区：4 个项目页（附上一个/下一个导航、右缘章节导航、指标数字滚动）；列表页带公开/私有筛选（FLIP 动画）
- 仓库浏览器：`/projects/repo/guessword/`（**桌面双栏文件树** + 文件过滤（`/` 聚焦、回车直达）+ README + 代码高亮 + **点行号复制 #L 永久链接** + 换行开关）
- 404：终端风找路页（`ls` 站点地图、`cd /projects` 直达）
- 全站：跨页纯淡化过渡（Chromium View Transitions，导航栏保持不动）+ 预渲染秒开 + 顶部进度条 + 回顶按钮 + 页脚本地时钟；亮/暗双主题；纯黑白灰 + 玻璃质感（品牌标保留各自官方色）
- 玻璃悬停（GX v3）：**全站玻璃块统一一套代码/一组参数**。页面上只有"一束光"（鼠标位置），鼠标经过时玻璃块显影这束光——小型柔光斑（~140px）+ 光标处边缘亮线 + 棱边（**只加白、不压暗**）；悬停**不给整块加色**：只有光标处那束光和边框微亮，无整块提亮、无任何位移与阴影跳变；嵌套块（卡片里的按钮）与外层卡片同时显影，相邻块带淡淡余光；弹簧柔滑跟随（MagicUI MagicCard 参数），进入即到位、离开原地淡出；5 种大卡片另带 ≤4° 轻微倾斜。触屏 / 减动效 / 无 JS 自动退化；键盘 Tab 聚焦也显示柔光
- **真实折射**（移植自 [glassfx](https://github.com/SquareMediaGroup/glassfx)，MIT）：导航栏在滚动时真实弯折背后的内容（简化滤镜）；QQ 弹层打开时带完整折射 + 边缘细色散。仅 Chromium 生效（`@supports` 门），手机与非 Chromium 自动退回普通模糊；卡片悬停折射默认关闭（性能考虑，给 `<html>` 加 `gx-cardrefr` 类可开启）
- 动效语言（统一基调）：悬停=只留光感；跨页=纯交叉淡化（导航不动）；**滚动浮现（可重播）**=向下翻时块从下方缓缓浮上来（错峰）、滚出视口后收起、每次从下方回来都再浮现一次，往回翻从上方进入的块直接显示；**右缘章节小圆点**=鼠标贴到屏幕最右侧时沿半圆弧散开、标签同时放大；时长/曲线全站统一令牌（`--dur-1/2/3` + `--ease-soft`）
- 背景：网格 + 光晕 + 颗粒噪点 + **原生 WebGL 粒子网**（漂移点 + 邻近连线 + 鼠标附近点亮并向光标连线；单色随主题换色；**整体缓慢向下漂移**；粒子层是独立固定层，不继承网格的纵向遮罩淡出，下半屏同样清晰；30fps 节流、密度自适应、无 WebGL 自动退回网格背景）
- 悬停光斑剖面="实心核心 + 柔尾"，深浅两个主题的亮度差异已用实拍像素差定标拉齐（浅色卡片/背景降一档腾出"变亮"空间）
- **头像盘（Hero）**：鼠标在盘上时整块盘做 3D 倾斜——鼠标一侧下沉、对侧翘起、圆心处归零（≤11° + 640px 透视；指数滤波平滑跟随、离开后缓慢回弹，盘外含方框四角=离开）；**盘缘水波纹**（交互时随鼠标移动在对应方位出、静止后每几秒随机方位出一圈极淡的；涟漪按当前倾角把盘缘点投影到屏幕，始终贴着倾斜后的边缘）；盘上不动、无阴影高光造假立体。用户点名效果，不受减动效限制（同粒子层）
- 减弱动效（`prefers-reduced-motion`）下只关闭位移动画（倾斜/漂移/滑入），颜色、明暗、淡入淡出与滚动浮现保持平滑；无 JS 时内容完整可读

## 设计系统

全站视觉的唯一标准在 **[`DESIGN.md`](DESIGN.md)**：配色阶梯（**零强调色**，品牌图标是唯一彩色例外）、排版刻度（12/13/14/16/18/20/24/32/48…，**无半像素字号、字重 ≤600**）、4px 间距、圆角矩阵（999 胶囊 / 50% 圆 / 16 面板 / 12 内层 / 8 小容器 / 4 微型，嵌套律 16→12→8→4）、三级堆叠阴影、hover 语言（悬停=只留光感；实心反色面有光斑上限）、动效令牌，以及**本地扩展（不可删）**清单（玻璃 / 粒子 / 头像盘 / 涟漪 / 终端 / 双主题…）。改任何页面前先读它；**所有数值的唯一来源是 [`design.tokens.json`](design.tokens.json)**，交付前必须 `npm run verify` 全绿（见下）。

## 设计门禁（让标准不靠人记）

`design.tokens.json` 是全部数值（刻度 / 控件档位 / 半径矩阵 / 页级节奏 / 组件契约）的唯一事实源；三层检查都从它取值：

```bash
npm run check        # 源码级：stylelint 白名单 + 组件契约断言 + DESIGN.md 文档同步
npm run audit        # 渲染级：9 类页面 × 浅/深 × 1440/390 的像素断言 + 视觉基线比对
npm run verify       # = build + check + audit（交付前必须全绿）
npm run baseline     # 有意改变视觉、人工过目后重新冻结基线（tests/design-baseline/）
npm run design:sync  # 改了 tokens 后同步 DESIGN.md 的契约表
```

- 审计失败会精确输出"哪个页面 / 哪个选择器 / 期望 vs 实测"（例如 `间距 .page-head|.section 期望 48，实测 88`），按提示修，不要绕过。
- 渲染断言覆盖：控件高度档位（44/36/32/40/56）、页级间距（页头→首块 48、工具条→网格 16…）、左缘同轴、圆角矩阵、成对控件等高（chip 与复制钮）、主按钮对比度、无横向溢出。
- [`AGENTS.md`](AGENTS.md) 是写给 AI 代理的同一套规则；`scripts/deploy-server.py` 内置该门禁（`--skip-verify` 才跳过）。

## 常用命令

```bash
npm install                  # 首次
npm run sync                 # 从 GitHub 抓取 guessword 仓库结构/README/小文件 → data/repos/（需要 .env.local 里的 token）
npm run build                # 生成全部静态页面（首页/项目/仓库浏览器/网站/博客/404/sitemap）
npm run serve                # 本地预览 http://127.0.0.1:8090
npm run verify               # 交付门槛：build + check + audit 必须全绿
npm run check                # 源码级设计契约（stylelint + 组件断言 + 文档同步）
npm run audit                # 渲染级像素断言 + 视觉基线比对
python scripts/deploy-server.py   # 门禁 + 构建 + 上传到服务器（原子切换，保留 5 个历史版本可回滚）
```

## 改内容

| 想改什么 | 改哪里 |
| --- | --- |
| 名字 / 头衔 / 签名 / 邮箱 / GitHub | `data/profile.json` |
| 技能标签 | `data/profile.json` 的 `skills` |
| 游戏 UID（原神 / 星铁 / 异环） | `data/profile.json` 的 `games`（`icon` 指向 `assets/img/games/` 里的官方图标） |
| 网站分类里的站点 | `data/profile.json` 的 `sites`（首页与 /sites/ 同步渲染） |
| 工作 / 教育经历 | `data/profile.json` 的 `experience` / `education`（**留空数组时整块不显示**） |
| 项目文案（简介、要点、指标、标签） | `data/projects.json` |
| 加博客文章 | 在 `content/blog/` 放 `xxx.md`，开头写 front matter（见下） |
| 头像 | 替换 `assets/img/avatar-512.jpg` / `avatar-256.jpg`（正方形） |
| QQ 名片弹层里的图 | 替换 `assets/img/qq-card.jpg` |

改完跑 `npm run verify`（build + check + audit 全绿才算完）；部署时 `deploy-server.py` 会先过同一道门禁再构建。

### 博客文章的写法

```markdown
---
title: 语义猜词游戏的排名引擎
date: 2026-10-20
summary: 一句话摘要，会显示在列表里
---

正文用 Markdown 写。
```

## 部署

线上是纯静态站：**https://loongsite.com**（+www），nginx 直接发 `npm run build` 的产物，不需要 Node、不需要数据库。

本仓库刻意**不**包含以下内容（属于服务器侧内部资料，公开仓库里看不到）：

- `deploy/`（nginx 站点配置模板，含私有路径）、`scripts/deploy.sh`（旧部署脚本）
- `.env.local`（GitHub / 服务器凭据）、`data/repos/`（抓取产物）
- `HANDOFF_AGENT.md` / `HANDOFF_SERVER_AGENT.md`（服务器交接说明）
- 生成物：`index.html` / `404.html` / `sitemap.xml` / `robots.txt` / `projects/` / `blog/` / `sites/`——跑 `npm run build` 即可重建

```bash
npm install
npm run build            # 生成全部静态页面
npm run serve            # 本地预览 http://127.0.0.1:8090
npm run verify           # build + check + audit（交付门槛）
```

服务器上的发布方式：`releases/` 保留历史版本 + `current` 符号链接原子切换，可随时回滚；细节见本地未提交的 `_deploy-internal.md`。

## 目录说明

```
DESIGN.md             设计系统（唯一标准，先读它）
design.tokens.json    设计数值唯一事实源（CSS / DESIGN.md / 两个检查器都从它取值）
AGENTS.md             给 AI 代理的设计与交付约定（同样规则）
stylelint.config.mjs  源码级数值白名单配置
index.html            首页（生成物，不入库）
404.html / robots.txt / sitemap.xml（生成物，不入库）
projects/             项目列表 + 项目页 + repo/（仓库浏览器，生成物，不入库）
blog/                 博客列表与文章（生成物，不入库）
sites/                网站分类（生成物，不入库）
assets/css|js|img     样式、交互脚本、头像与图标（favicon 是手写 SVG）
data/                 profile.json / projects.json（内容源）+ repos/（抓取产物，gitignore）
content/blog/         博客 Markdown 源文件
scripts/              build.mjs / templates.mjs / serve.mjs / sync-github.mjs / check-design.mjs / audit-design.py / deploy-server.py
scripts/deploy.sh     旧部署脚本（含内部地址，gitignore）
tests/design-baseline/视觉基线 PNG（27 张，audit 比对用）
deploy/               nginx 配置模板（含私有路径，gitignore）
```

## 注意

- `.env.local`（含 GitHub token）**不要提交**，已在 `.gitignore` 里
- `data/repos/` 是 `npm run sync` 的产物，可随时重新生成
- 站点是纯静态的：服务器上不需要 Node、不需要数据库，nginx 直接发文件
