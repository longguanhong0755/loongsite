# 动效验收套件

这些脚本用 CDP 驱动无头 Chrome，对真实渲染结果做断言（不是读源码）。先起本地预览：

```bash
npm run serve     # http://127.0.0.1:8090
```

```bash
npm run test:tier       # P0 分级            28 条
npm run test:route      # 跨页丝滑验收       56 条
npm run test:depth      # P2 首屏/视差       28 条
npm run test:interact   # P3 GX/微交互       35 条
npm run test:blog       # P4 阅读环/目录     19 条
npm run test:degrade    # P5 降级            8 条
npm run perf            # 性能（完整档）
npm run perf:light      # 性能（轻量档）
```

结果写到 `_perf/*.json`；`perf` 另写 `full.json` / `light.json`。

## headless 环境的坑（脚本里已经处理）

- **帧率只有 3–5fps**：CSS 过渡经常整段不推进。凡是"过渡结束后的值"都要么关掉过渡再量，
  要么只断言目标属性（`--read` / `--toc-y`），不要等动画跑完。
- **`scroll-behavior: smooth`**：`scrollIntoView()` 默认平滑，在低帧率下几百毫秒都到不了位，
  元素还在视口外 → `:hover` 永不触发。脚本统一用 `behavior:'instant'`。
- **默认 `prefers-reduced-motion: reduce`**：页面会落到 `light` 档。要测完整档必须显式
  `?motion=full`（或 CDP `Emulation.setEmulatedMedia` 覆盖），性能脚本两档都强制指定。
- **坐标相同的 `pointermove` 不会派发**：悬停前先把鼠标挪到 `(2,2)` 再移到目标。
- **剪贴板**：复制测试需要 `Browser.grantPermissions` 授权。
- **跨文档导航**：`Performance` 计数器会重置，导航场景的每帧成本记为 `null`（只测帧/长任务）。
- **跨页过渡的帧在 headless 里不推进**：跨页验收不靠逐帧截图，而是分三个时间点读 DOM：
  `pagereveal` 时检查“没有任何独立快照 / 首屏没有 rise 在跑 / 粒子层没被藏”，
  `viewTransition.finished` +200/500ms 检查标题与正文矩形是否漂移（阈值 0.5px）。
  这样即使过渡动画停在第一帧，也能证明文字没有被第二层移动。
- **headless 偶尔不给新文档派发 `pagereveal`**：旧页 `pageswap` 会留下标记，新页 load 后
  没有探针时改用“加载完成 + 200/500ms”的合成轨迹；文字零漂移与无补播仍然有效，
  只有 `vt-active` 标记在合成轨迹里跳过。
- **导航也并回整页淡化**：旧版本给 `.nav` 单独命名，旧导航隐藏、新导航第一帧整块出现，
  玻璃背板会瞬间换成新页底色。现在页面里 `view-transition-name` 数量为 0。
- **不支持跨文档 VT 的浏览器**（Firefox 等）走 `.page-veil` 兜底：点击同源链接先把整页
  淡到主题底色，新页首帧再由同一层遮罩淡出；`?vt=off` 可在 Chromium 里强制走这条路径。
- **档位原因**：页面把判定原因写在 `data-motion-why`（query / stored / reduced-motion /
  network / low-cores / low-memory / default），跨页验收会分别模拟系统减动效和人工覆盖。

## 性能口径

- 硬门槛：每帧脚本 ≤ 6ms。帧率 <45 时，帧间隔、样式+布局、长任务只作参考——无 GPU 的软件光栅
  会把这三项放大到不代表真实设备（GX 悬停场景的样式+布局在 headless 里约 11–20ms，
  这是 P3 就存在的环境成本，不是 P4 引入的）。
- 场景：首页载入 / 连续滚动 / GX 悬停 / 跨页导航；全场 ≥3.6s，保证低帧率下也有 ≥10 帧
  （导航过渡会冻结帧，下限放宽到 6）。

### P3 → P4 回归对比（同机、同 harness、完整档）

| 场景 | P3 脚本/样式+布局 (ms) | P4 脚本/样式+布局 (ms) |
|---|---|---|
| 首页载入 | 1.30 / 1.18 | 0.87 / 1.11 |
| 连续滚动 | 1.25 / 2.81 | 1.29 / 2.60 |
| GX 悬停 | 2.09 / 11.86 | 1.93 / 12.66 |
| 跨页导航 | 仅帧/长任务 | 仅帧/长任务 |

差异都在噪声内；P4 的目录测量已缓存 `offsetTop/offsetHeight`，滚动帧不再读布局。
