# -*- coding: utf-8 -*-
"""loongsite 渲染级设计门禁（像素断言 + 视觉基线）。

用法：
    python scripts/audit-design.py                # 断言 + 与基线比对
    python scripts/audit-design.py --baseline     # 冻结当前渲染为基线（tests/design-baseline/）
    python scripts/audit-design.py --no-baseline  # 只跑断言，不比对基线
可调：--port 8097

断言来源：design.tokens.json 的 renderedContract / controlHeights / pageRhythm / contrastMin。
"""
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = json.loads((ROOT / "design.tokens.json").read_text(encoding="utf-8"))
SHOTS = ROOT / "_bak" / "_shots" / "px"
BASELINE_DIR = ROOT / "tests" / "design-baseline"
DIFF_DIR = SHOTS / "diff"
PORT = 8097

H_TOL = 0.6      # 高度容差
GAP_TOL = 0.8    # 间距容差
AXIS_TOL = 0.6   # 左缘同轴容差
DIFF_CHANNEL = 28      # 基线比对的单通道差阈值
DIFF_RATIO_MAX = 0.003 # 允许 0.3% 像素不同

FREEZE_CSS = """
*, *::before, *::after { animation: none !important; transition: none !important; }
[data-clock-wrap] { visibility: hidden !important; }
.bg-fx, .bg-deco, canvas { display: none !important; }
.reveal { opacity: 1 !important; transform: none !important; }
/* 玻璃块即使 0° 也带 perspective 变换层，栅格化在两次截图间会有亚像素差异；
   审计只关心静态布局，冻结掉倾斜（悬停才有的姿态不属于基线）。 */
.gx-tilt { transform: none !important; }
"""

# ---------------- 测量 JS ----------------
JS_MEASURE = r"""
() => {
  const out = {};
  const box = (el) => { const b = el.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,top:b.top,bottom:b.bottom,left:b.left}; };
  out.h = {b:0, t:0, sh:0};
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.scrollH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

  out.heights = {};
  for (const sel of HEIGHT_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel));
    if (!els.length) continue;
    const hs = els.map((e) => +e.getBoundingClientRect().height.toFixed(2)).filter((h) => h > 0.5);
    if (hs.length) out.heights[sel] = hs;   // 全部不可见（如藏在关闭的弹窗里）则跳过
  }
  out.pairs = {};
  for (const [a, b] of PAIRS) {
    const ea = document.querySelector(a), eb = document.querySelector(b);
    if (!ea || !eb) continue;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    out.pairs[a + '|' + b] = +(rb.top - ra.bottom).toFixed(2);
  }
  out.axis = {};
  for (const sel of AXIS_SELECTORS) {
    const e = document.querySelector(sel);
    if (e) out.axis[sel] = +e.getBoundingClientRect().left.toFixed(2);
  }
  out.radii = {};
  for (const [sel, expect] of RADIUS_CHECKS) {
    const e = document.querySelector(sel);
    if (!e) continue;
    const cs = getComputedStyle(e);
    out.radii[sel] = {
      r: parseFloat(cs.borderTopLeftRadius),
      h: e.getBoundingClientRect().height,
      expect
    };
  }
  out.fonts = {};
  for (const [sel, expect] of FONT_CHECKS) {
    const e = document.querySelector(sel);
    if (e) out.fonts[sel] = getComputedStyle(e).fontSize;
  }
  const bp = document.querySelector('.btn-primary');
  if (bp) {
    const cs = getComputedStyle(bp);
    out.primary = { color: cs.color, bg: cs.backgroundColor, fs: cs.fontSize };
  }
  const ft = document.querySelector('.footer');
  if (ft) {
    out.footer = {
      docH: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      vh: window.innerHeight,
      bottom: +ft.getBoundingClientRect().bottom.toFixed(2)
    };
  }
  out.uniform = [];
  for (const g of (window.UNIFORM_GROUPS || [])) {
    const rootEl = document.querySelector(g.root);
    if (!rootEl) continue;
    const items = [];
    rootEl.querySelectorAll(g.childSelectors.join(',')).forEach((e) => {
      if (e.getBoundingClientRect().height <= 0.5) return;
      const cs = getComputedStyle(e);
      items.push({ cls: String(e.className).slice(0, 30), bg: cs.backgroundColor,
                   shadow: cs.boxShadow, border: cs.borderTopColor });
    });
    if (items.length) out.uniform.push({ label: g.label || g.root, items });
  }
  return out;
}
"""


def start_server(port):
    proc = subprocess.Popen(
        ["node", "scripts/serve.mjs", str(port)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1.5) as r:
                if r.status == 200:
                    return proc
        except Exception:
            time.sleep(0.25)
    proc.terminate()
    raise SystemExit(f"[audit] serve.mjs 在 {port} 端口未就绪")


def luminance(rgb):
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])


def parse_rgb(s):
    m = re.findall(r"[\d.]+", s)
    return tuple(float(v) for v in m[:3])


def contrast_ratio(fg, bg):
    l1, l2 = luminance(parse_rgb(fg)), luminance(parse_rgb(bg))
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def discover_pages(port):
    proj = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8")).get("projects", [])
    detail = next((p for p in proj if p.get("slug")), None)
    repo_proj = next((p for p in proj if p.get("repoBrowser")), None)
    posts = sorted((ROOT / "content" / "blog").glob("*.md")) if (ROOT / "content" / "blog").exists() else []
    pages = [("home", "/"), ("projects", "/projects/"), ("sites", "/sites/"), ("blog", "/blog/")]
    if detail:
        pages.append(("detail", f"/projects/{detail['slug']}"))
    if posts:
        pages.append(("post", f"/blog/{posts[0].stem}"))
    if repo_proj:
        slug = repo_proj["slug"]
        pages.append(("repo", f"/projects/repo/{slug}/"))
        try:  # 找仓库里的第一个代码页链接
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/projects/repo/{slug}/", timeout=5) as r:
                html = r.read().decode("utf-8", "replace")
            m = re.search(rf'href="(/projects/repo/{re.escape(slug)}/blob/[^"#/][^"#]*)"', html)
            if m:
                pages.append(("code", m.group(1)))
        except Exception:
            pass
    pages.append(("404", "/nope/"))
    return pages


# 页级间距对（按页面名）与默认
PAGE_PAIRS = {
    "projects": [(".page-head", ".section"), (".filter-row", ".grid")],
    "detail": [(".page-lead", ".btn-row"), (".btn-row", ".metrics"), (".page-head", ".section")],
    "home": [(".hero-tagline", ".hero-contacts"), (".contact-group .contact-label", ".contact-group .btn-row")],
    "_default": [(".page-head", ".section")],
}
PAIR_EXPECT = {
    ".page-head|.section": TOKENS["pageRhythm"]["headToFirstBlock"],
    ".filter-row|.grid": TOKENS["pageRhythm"]["toolbarToGrid"],
    ".page-lead|.btn-row": TOKENS["pageRhythm"]["contentToActions"],
    ".btn-row|.metrics": TOKENS["pageRhythm"]["contentToActions"],
    ".hero-tagline|.hero-contacts": 24,
    ".contact-group .contact-label|.contact-group .btn-row": TOKENS["pageRhythm"]["labelToRow"],
}

CONFIGS = [("d", 1440, 900, "light"), ("dd", 1440, 900, "dark"), ("m", 390, 844, "light")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--baseline", action="store_true", help="冻结当前渲染为基线")
    ap.add_argument("--no-baseline", action="store_true", help="不比对基线")
    args = ap.parse_args()
    port = args.port

    import os
    from patchright.sync_api import sync_playwright
    from PIL import Image, ImageChops, ImageFilter

    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    DIFF_DIR.mkdir(parents=True, exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)

    proc = start_server(port)
    import atexit
    atexit.register(proc.terminate)   # 异常退出也回收预览服务
    base = f"http://127.0.0.1:{port}"
    PAGES = discover_pages(port)
    failures, notes, okcount = [], [], 0

    def fail(page, cfg, what):
        failures.append(f"[{page}/{cfg}] {what}")

    def check(page, cfg, cond, what):
        nonlocal okcount
        if cond:
            okcount += 1
        else:
            fail(page, cfg, what)

    rc = TOKENS["renderedContract"]
    height_sel = list(rc["controlSelectors"].keys())
    axis_sel = rc["leftAxisSelectors"]
    radius_checks = list(rc["radiusChecks"].items())
    uniform_groups = rc.get("uniformFillGroups", [])
    font_checks_light = 0

    with sync_playwright() as p:
        # 无 branded Chrome 的环境（CI / 容器）可用 LOONGSITE_CHROME 指向本地 Chromium
        chrome_exe = os.environ.get("LOONGSITE_CHROME")
        browser = p.chromium.launch(
            headless=True,
            **({"executable_path": chrome_exe} if chrome_exe else {"channel": "chrome"})
        )
        # patchright evaluate 只接受单个参数：把选择器表一次性传进去
        measure = (
            "([HS, PS, AS, RC, FC, UG]) => {"
            "  window.HEIGHT_SELECTORS = HS; window.PAIRS = PS; window.AXIS_SELECTORS = AS;"
            "  window.RADIUS_CHECKS = RC; window.FONT_CHECKS = FC; window.UNIFORM_GROUPS = UG;"
            "  return (" + JS_MEASURE + ")();"
            "}"
        )
        for cfg_name, vw, vh, theme in CONFIGS:
            ctx = browser.new_context(
                viewport={"width": vw, "height": vh},
                reduced_motion="reduce",
                device_scale_factor=1,
            )
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m, e=errors: e.append(m.text[:140]) if m.type == "error" else None)
            page.on("pageerror", lambda x, e=errors: e.append("pageerror: " + str(x)[:140]))
            for pname, path in PAGES:
                errors.clear()
                page.goto(base + path, wait_until="load")
                if theme == "dark":
                    page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
                page.add_style_tag(content=FREEZE_CSS)
                page.wait_for_timeout(500)

                pairs = PAGE_PAIRS.get(pname, PAGE_PAIRS["_default"])
                data = page.evaluate(measure, [height_sel, pairs, axis_sel, radius_checks, [], uniform_groups])
                cfg = cfg_name

                # 1) 控制台错误（404 页的资源 404 属预期）
                real_errs = [e for e in errors if "404" not in e and "Failed to load resource" not in e]
                check(pname, cfg, len(real_errs) == 0, f"控制台错误 {real_errs[:3]}")

                # 2) 横向溢出
                check(pname, cfg, data["overflow"] <= 0, f"横向溢出 {data['overflow']}px")

                # 3) 控件高度档位
                for sel, got_list in data["heights"].items():
                    expect = rc["controlSelectors"][sel]
                    bad = [h for h in got_list if abs(h - expect) > H_TOL]
                    check(pname, cfg, not bad,
                          f"{sel} 高度期望 {expect}，实测 {sorted(set(got_list))}")

                # 4) 页级间距对
                for key, got in data["pairs"].items():
                    expect = PAIR_EXPECT.get(key)
                    if expect is None:
                        continue
                    check(pname, cfg, abs(got - expect) <= GAP_TOL,
                          f"间距 {key} 期望 {expect}，实测 {got}")

                # 5) 左缘同轴
                xs = list(data["axis"].values())
                if len(xs) >= 2:
                    check(pname, cfg, max(xs) - min(xs) <= AXIS_TOL,
                          f"左缘不同轴 {data['axis']}")

                # 6) 半径矩阵
                for sel, r in data["radii"].items():
                    if r["expect"] in ("pill", "circle"):
                        # Chrome 对 999px 的计算值原样返回；语义 = 半径 ≥ 高一半（两端全圆）
                        check(pname, cfg, r["r"] >= r["h"] / 2 - H_TOL,
                              f"{sel} 期望{'胶囊/圆'}（半径≥{r['h']/2:.1f}），实测 {r['r']}")
                    else:
                        exp = float(r["expect"].replace("px", ""))
                        check(pname, cfg, abs(r["r"] - exp) <= H_TOL,
                              f"{sel} 半径期望 {r['expect']}，实测 {r['r']}")

                # 7) 主按钮对比度（浅色配置下的默认态）
                if data.get("primary") and cfg in ("d", "dd"):
                    ratio = contrast_ratio(data["primary"]["color"], data["primary"]["bg"])
                    check(pname, cfg, ratio >= TOKENS["contrastMin"],
                          f"主按钮对比度 {ratio:.2f}:1 < {TOKENS['contrastMin']}")

                # 7b) 块同色组（如联系卡：卡内所有块同底色 + 同阴影 + 同边框色）
                for g in data.get("uniform", []):
                    keys = {(i["bg"], i["shadow"], i["border"]) for i in g["items"]}
                    bgs = sorted({i["bg"] for i in g["items"]})
                    check(pname, cfg, len(keys) == 1,
                          f"{g['label']} 不一致（{len(g['items'])} 块）：底色 {bgs}")

                # 7c) 页脚贴底（文档底 = 页脚底；短页由 main 撑满视口，页脚落在视口底）
                f = data.get("footer")
                if f and rc.get("footerSticky"):
                    check(pname, cfg, abs(f["docH"] - f["bottom"]) <= 1.5,
                          f"页脚未贴文档底：docH {f['docH']} vs 页脚底 {f['bottom']}")
                    check(pname, cfg, f["docH"] >= f["vh"] - 1.5,
                          f"文档未填满视口：docH {f['docH']} < vh {f['vh']}")

                # 8) 视觉基线
                shot_h = min(int(data["scrollH"]) + 4, 1160 if vw > 800 else 900)
                shot = page.screenshot(clip={"x": 0, "y": 0, "width": vw, "height": shot_h})
                name = f"{pname}__{cfg}.png"
                if args.baseline:
                    (BASELINE_DIR / name).write_bytes(shot)
                elif not args.no_baseline:
                    bl = BASELINE_DIR / name
                    if not bl.exists():
                        notes.append(f"[基线] 缺 {name}（先跑 npm run baseline）")
                    else:
                        a = Image.open(bl).convert("RGB")
                        b = Image.open(__import__("io").BytesIO(shot)).convert("RGB")
                        if a.size != b.size:
                            fail(pname, cfg, f"基线尺寸变化 {a.size} → {b.size}")
                        else:
                            # 1px 高斯：headless 的文字栅格在两次截图间会有亚像素抖动
                            # （同机连拍可差 0.7%）；真实布局位移 ≥1px 仍会留下差异。
                            a = a.filter(ImageFilter.GaussianBlur(1))
                            b = b.filter(ImageFilter.GaussianBlur(1))
                            diff = ImageChops.difference(a, b).convert("L")
                            hist = diff.histogram()
                            tot = a.size[0] * a.size[1]
                            changed = sum(hist[DIFF_CHANNEL + 1:])
                            ratio = changed / tot
                            if ratio > DIFF_RATIO_MAX:
                                mask = diff.point(lambda v: 255 if v > DIFF_CHANNEL else 0)
                                mask.save(DIFF_DIR / name)
                                fail(pname, cfg,
                                     f"视觉基线差异 {ratio*100:.2f}% > {DIFF_RATIO_MAX*100}%（热点图 _bak/_shots/px/diff/{name}）")
                            else:
                                okcount += 1
            ctx.close()
        browser.close()

    proc.terminate()

    # ---------- 报告 ----------
    lines = []
    lines.append(f"[audit] 通过 {okcount} 项断言 / 失败 {len(failures)} 项")
    for n in sorted(set(notes)):
        lines.append("  · " + n)
    for f in failures:
        lines.append("  ✗ " + f)
    report = "\n".join(lines)
    print(report)
    (SHOTS / "audit-latest.txt").write_text(report, encoding="utf-8")
    if args.baseline:
        print(f"[audit] 基线已写入 {BASELINE_DIR}（{len(PAGES)} 页 × {len(CONFIGS)} 配置）")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
