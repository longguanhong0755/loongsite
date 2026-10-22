# 动效验收套件

这些脚本用 CDP 驱动无头 Chrome，对真实渲染结果做断言（不是读源码）。先起本地预览：

```bash
npm run serve     # http://127.0.0.1:8090
```

```bash
npm run test:tier       # P0 分级            27 条
npm run test:route      # P1 跨页过渡        30 条
npm run test:depth      # P2 首屏/视差       27 条
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
