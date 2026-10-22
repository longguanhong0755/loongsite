/* 跨页验收：一次换页只允许整页 opacity 淡化，文字零位移。
   覆盖：跨栏目 / 列表→详情 / 详情→列表 / 浏览器后退 / full·light / 桌面·手机，
   外加导航玻璃块拖拽。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/route-test.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9394);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = {};
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiters.has(m.id)) {
        const w = this.waiters.get(m.id); this.waiters.delete(m.id);
        m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result);
      } else if (m.method && this.events[m.method]) this.events[m.method](m.params);
    };
  }
  send(m, p, sid) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method: m, params: p || {}, sessionId: sid }));
    return new Promise((resolve, reject) => this.waiters.set(id, { resolve, reject }));
  }
  on(m, fn) { this.events[m] = fn; }
}

const ev = async (cdp, sessionId, expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expression.slice(0, 120));
  return r.result.value;
};

async function go(cdp, sessionId, url) {
  const load = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url }, sessionId);
  await Promise.race([load, sleep(15000)]);
  await sleep(450);
}

/* 在每个新文档的最早期注入轨迹探针。pagereveal 的监听会先于页面自己的
   ARRIVAL 注册，所以首次采样放到 setTimeout(0)，等内联脚本把
   vt-active / vt-boot / 首屏标记都写完再读。 */
const TRACE = `(function () {
  window.__trace = null;
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }
  function rects() {
    var sel = '.hero-main > *, .hero-name, .hero-title, .page-head h1, .page-title, .card-title, .post-title, .section-title, .post-article p';
    var list = document.querySelectorAll(sel), out = {}, n = 0;
    for (var i = 0; i < list.length && n < 14; i++) {
      if (!visible(list[i])) continue;
      var r = list[i].getBoundingClientRect();
      out[n++] = { t: +r.top.toFixed(2), l: +r.left.toFixed(2), w: +r.width.toFixed(2) };
    }
    return out;
  }
  function named() {
    var all = document.querySelectorAll('body *'), out = [];
    for (var i = 0; i < all.length; i++) {
      var n = getComputedStyle(all[i]).viewTransitionName;
      if (n && n !== 'none') out.push(n);
    }
    return out;
  }
  function running() {
    var sel = '.reveal, .hero-main > *, .hero-avatar, .stats-strip, .scroll-cue, .page-head h1';
    var list = document.querySelectorAll(sel), out = [];
    for (var i = 0; i < list.length; i++) {
      var as = list[i].getAnimations ? list[i].getAnimations() : [];
      for (var j = 0; j < as.length; j++) {
        var a = as[j];
        if (a.animationName && /^(rise|ch-in|ch-in-flat)$/.test(a.animationName)) {
          out.push({ name: a.animationName, state: a.playState });
        }
      }
    }
    return out;
  }
  function snap() {
    return {
      rects: rects(), named: named(), running: running(),
      cls: document.documentElement.className,
      boot: document.documentElement.classList.contains('vt-boot'),
      active: document.documentElement.classList.contains('vt-active'),
      scrollY: window.scrollY
    };
  }
  function done(tr) { setTimeout(function () { tr.done = true; }, 0); }
  window.addEventListener('pagereveal', function (e) {
    if (!e || !e.viewTransition) return;
    var tr = { hasVT: true };
    setTimeout(function () { tr.at = snap(); }, 0);
    e.viewTransition.finished.then(function () {
      setTimeout(function () {
        tr.finished = snap();
        setTimeout(function () { tr.after200 = snap(); }, 200);
        setTimeout(function () { tr.after500 = snap(); done(tr); }, 500);
      }, 0);
    }, function () { done(tr); });
    window.__trace = tr;
  }, { once: true });
})();`;

async function waitTrace(cdp, sessionId, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const tr = await ev(cdp, sessionId, 'window.__trace');
    if (tr && tr.done) return tr;
    await sleep(80);
  }
  return ev(cdp, sessionId, 'window.__trace');
}

/* 两组矩形在 top/left/width 上的最大差 */
function drift(a, b) {
  if (!a || !b) return 999;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return 999;
  let max = 0;
  for (const k of ka) {
    if (!b[k]) return 999;
    max = Math.max(max, Math.abs(a[k].t - b[k].t), Math.abs(a[k].l - b[k].l), Math.abs(a[k].w - b[k].w));
  }
  return +max.toFixed(3);
}

function ascends(tr) {
  return !!tr && tr.hasVT && tr.at && tr.at.active && tr.at.boot;
}

function onlyNavNamed(tr) {
  if (!tr || !tr.at || !tr.at.named) return false;
  return tr.at.named.length >= 1 && tr.at.named.every((n) => n === 'site-nav');
}

async function clickAndTrace(cdp, sessionId, startUrl, sel) {
  await go(cdp, sessionId, startUrl);
  const load = new Promise((res) => cdp.on('Page.loadEventFired', res));
  const clicked = await ev(cdp, sessionId, `(() => {
    var a = document.querySelector(${JSON.stringify(sel)});
    if (!a) return false;
    a.click();
    return true;
  })()`);
  if (!clicked) throw new Error('找不到点击目标 ' + sel);
  await Promise.race([load, sleep(15000)]);
  return waitTrace(cdp, sessionId);
}

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongroute-');
  const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu',
    `--user-data-dir=${prof}`, `--remote-debugging-port=${CDP_PORT}`, '--window-size=1440,900',
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  const kill = () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch (e) {} };
  try {
    let ws;
    for (let i = 0; i < 40 && !ws; i++) {
      await sleep(250);
      try {
        const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        ws = new WebSocket((await v.json()).webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
      } catch (e) { ws = undefined; }
    }
    if (!ws) throw new Error('CDP 连接失败');
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: TRACE }, sessionId);

    /* ---------- 1. 静态守卫：内容元素不能有独立快照 / 旧标记 ---------- */
    await go(cdp, sessionId, BASE + '/');
    let layers = await ev(cdp, sessionId, `(() => {
      var all = document.querySelectorAll('body *'), bad = [];
      for (var i = 0; i < all.length; i++) {
        var n = getComputedStyle(all[i]).viewTransitionName;
        if (n && n !== 'none') bad.push(n);
      }
      return { named: bad, legacy: document.querySelectorAll('.vt-name,[data-morph],[data-vt]').length };
    })()`);
    check('首页：只有导航拥有独立快照', layers.named.length === 1 && layers.named[0] === 'site-nav', layers.named);
    check('首页：没有飞行标题 / 关系标记残留', layers.legacy === 0, layers.legacy);

    await go(cdp, sessionId, BASE + '/projects/');
    layers = await ev(cdp, sessionId, `(() => {
      var all = document.querySelectorAll('body *'), bad = [];
      for (var i = 0; i < all.length; i++) {
        var n = getComputedStyle(all[i]).viewTransitionName;
        if (n && n !== 'none') bad.push(n);
      }
      return { named: bad, legacy: document.querySelectorAll('.vt-name,[data-morph],[data-vt]').length };
    })()`);
    check('项目列表：只有导航拥有独立快照', layers.named.length === 1 && layers.named[0] === 'site-nav', layers.named);
    check('项目列表：没有飞行标题 / 关系标记残留', layers.legacy === 0, layers.legacy);

    /* ---------- 2. 跨栏目：项目列表 → 博客（full / 桌面） ---------- */
    let tr = await clickAndTrace(cdp, sessionId, BASE + '/projects/?motion=full', '.nav-link[href="/blog/"]');
    check('跨栏目到达：确实走 View Transition', !!(tr && tr.hasVT), tr && tr.hasVT);
    check('跨栏目到达：html 挂上 vt-active + vt-boot', ascends(tr), tr && tr.at && { cls: tr.at.cls, boot: tr.at.boot });
    check('跨栏目到达：除导航外没有独立快照层', onlyNavNamed(tr), tr && tr.at && tr.at.named);
    check('跨栏目到达：首屏没有 rise / ch-in 在跑', tr && tr.at && tr.at.running.length === 0, tr && tr.at && tr.at.running);
    check('跨栏目到达：落位时 vt-boot 已摘掉', tr && tr.finished && !tr.finished.boot, tr && tr.finished && tr.finished.boot);
    check('跨栏目到达：结束后 200/500ms 文字零漂移', tr && drift(tr.finished && tr.finished.rects, tr.after200 && tr.after200.rects) <= 0.5 && drift(tr.after200 && tr.after200.rects, tr.after500 && tr.after500.rects) <= 0.5, tr && { finish: drift(tr.finished && tr.finished.rects, tr.after200 && tr.after200.rects), later: drift(tr.after200 && tr.after200.rects, tr.after500 && tr.after500.rects) });
    check('跨栏目到达：结束后没有补播入场', tr && tr.after500 && tr.after500.running.length === 0, tr && tr.after500 && tr.after500.running);

    /* ---------- 3. 列表 → 详情：不再 morph，也只做整页淡化 ---------- */
    tr = await clickAndTrace(cdp, sessionId, BASE + '/projects/?motion=full', '.project-card .card-title a');
    check('列表→详情：确实走 View Transition', !!(tr && tr.hasVT), tr && tr.hasVT);
    check('列表→详情：详情页除导航外没有独立快照', onlyNavNamed(tr), tr && tr.at && tr.at.named);
    check('列表→详情：首屏没有二次位移动画', tr && tr.at && tr.at.running.length === 0, tr && tr.at && tr.at.running);
    check('列表→详情：落位后文字不漂移', tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects) <= 0.5, tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects));

    /* ---------- 4. 详情 → 列表（返回链接） ---------- */
    tr = await clickAndTrace(cdp, sessionId, BASE + '/projects/guessword?motion=full', '.backlink');
    check('详情→列表：确实走 View Transition', !!(tr && tr.hasVT), tr && tr.hasVT);
    check('详情→列表：没有旧页面头部残留（只有导航命名）', onlyNavNamed(tr), tr && tr.at && tr.at.named);
    check('详情→列表：落位后文字不漂移', tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects) <= 0.5, tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects));
    check('详情→列表：结束后没有补播入场', tr && tr.after500 && tr.after500.running.length === 0, tr && tr.after500 && tr.after500.running);

    /* ---------- 5. 浏览器后退：无论走 VT 还是 bfcache，文字都必须稳定 ---------- */
    await go(cdp, sessionId, BASE + '/projects/guessword?motion=full');
    await ev(cdp, sessionId, `document.querySelector('.backlink').click()`);
    await sleep(900);
    await ev(cdp, sessionId, 'history.back()');
    await sleep(1100);
    const backPath = await ev(cdp, sessionId, 'location.pathname');
    check('浏览器后退：回到详情页', backPath === '/projects/guessword', backPath);
    const back1 = await ev(cdp, sessionId, `(() => {
      var h = document.querySelector('.page-title');
      var r = h && h.getBoundingClientRect();
      var as = document.querySelectorAll('.reveal.is-in');
      var moving = [];
      for (var i = 0; i < as.length; i++) {
        var list = as[i].getAnimations ? as[i].getAnimations() : [];
        for (var j = 0; j < list.length; j++) if (list[j].animationName === 'rise') moving.push(list[j].playState);
      }
      return { top: r && +r.top.toFixed(2), left: r && +r.left.toFixed(2), moving: moving,
        named: [].slice.call(document.querySelectorAll('body *')).map(function (el) { return getComputedStyle(el).viewTransitionName; }).filter(function (n) { return n && n !== 'none'; }) };
    })()`);
    await sleep(400);
    const back2 = await ev(cdp, sessionId, `(() => {
      var h = document.querySelector('.page-title');
      var r = h && h.getBoundingClientRect();
      return { top: r && +r.top.toFixed(2), left: r && +r.left.toFixed(2) };
    })()`);
    check('浏览器后退：标题 400ms 内不漂移', back1 && back2 && Math.abs(back1.top - back2.top) <= 0.5 && Math.abs(back1.left - back2.left) <= 0.5, { back1, back2 });
    check('浏览器后退：没有 rise 补播', back1 && back1.moving.length === 0, back1 && back1.moving);
    check('浏览器后退：除导航外没有独立快照', back1 && back1.named.length === 1 && back1.named[0] === 'site-nav', back1 && back1.named);

    /* ---------- 6. 轻量档：同一条淡化，仍然零位移 ---------- */
    tr = await clickAndTrace(cdp, sessionId, BASE + '/projects/?motion=light', '.nav-link[href="/blog/"]');
    check('轻量档到达：确实走 View Transition', !!(tr && tr.hasVT), tr && tr.hasVT);
    check('轻量档到达：只有导航命名', onlyNavNamed(tr), tr && tr.at && tr.at.named);
    check('轻量档到达：首屏没有二次位移动画', tr && tr.at && tr.at.running.length === 0, tr && tr.at && tr.at.running);
    check('轻量档到达：落位后文字不漂移', tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects) <= 0.5, tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects));

    /* ---------- 7. 手机视口：同一条淡化 ---------- */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    tr = await clickAndTrace(cdp, sessionId, BASE + '/?motion=full', '.nav-link[href="/blog/"]');
    check('手机到达：确实走 View Transition', !!(tr && tr.hasVT), tr && tr.hasVT);
    check('手机到达：只有导航命名', onlyNavNamed(tr), tr && tr.at && tr.at.named);
    check('手机到达：首屏没有二次位移动画', tr && tr.at && tr.at.running.length === 0, tr && tr.at && tr.at.running);
    check('手机到达：落位后文字不漂移', tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects) <= 0.5, tr && drift(tr.finished && tr.finished.rects, tr.after500 && tr.after500.rects));
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);

    /* ---------- 8. 导航玻璃块拖拽 ---------- */
    await go(cdp, sessionId, BASE + '/');
    const drag = await ev(cdp, sessionId, `(async () => {
      function pt(type, x, y, target) {
        var ev = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
        target.dispatchEvent(ev);
      }
      var active = document.querySelector('.nav-links .nav-link.is-active');
      var target = document.querySelector('.nav-links .nav-link[href="/blog/"]');
      if (!active || !target) return { missing: true };
      var ar = active.getBoundingClientRect();
      var tr = target.getBoundingClientRect();
      var ax = ar.left + ar.width / 2, ay = ar.top + ar.height / 2;
      var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
      pt('pointerdown', ax, ay, active);
      pt('pointermove', ax + 12, ay, document);
      var mid = {
        ghost: !!document.querySelector('.nav-drag'),
        dragging: document.documentElement.classList.contains('nav-dragging'),
        path: location.pathname
      };
      pt('pointermove', tx, ty, document);
      var over = {
        drop: !!document.querySelector('.nav-link.is-drop'),
        dropHref: (document.querySelector('.nav-link.is-drop') || {}).getAttribute ? document.querySelector('.nav-link.is-drop').getAttribute('href') : null,
        path: location.pathname
      };
      pt('pointerup', tx, ty, document);
      return { mid: mid, over: over, before: location.pathname };
    })()`);
    check('拖拽中：生成玻璃块', drag.mid && drag.mid.ghost, drag.mid);
    check('拖拽中：<html> 进入 nav-dragging', drag.mid && drag.mid.dragging, drag.mid);
    check('拖拽中：不发生跳转', drag.mid && drag.mid.path === '/', drag.mid);
    check('拖到目标：目标栏目高亮', drag.over && drag.over.dropHref === '/blog/', drag.over);
    check('拖到目标：松手前仍不跳转', drag.over && drag.over.path === '/', drag.over);

    let landed = null;
    for (let i = 0; i < 40; i++) {
      await sleep(120);
      landed = await ev(cdp, sessionId, 'location.pathname');
      if (landed === '/blog/') break;
    }
    check('拖拽松手：跳到落点栏目', landed === '/blog/', landed);
    const ghostGone = await ev(cdp, sessionId, `({
      ghost: !!document.querySelector('.nav-drag'),
      dragging: document.documentElement.classList.contains('nav-dragging'),
      drop: !!document.querySelector('.nav-link.is-drop')
    })`);
    check('拖拽结束：玻璃块与高亮都清干净', !ghostGone.ghost && !ghostGone.dragging && !ghostGone.drop, ghostGone);

    /* ---------- 9. 拖到空白处松手 = 什么都不发生 ---------- */
    await go(cdp, sessionId, BASE + '/');
    const miss = await ev(cdp, sessionId, `(async () => {
      function pt(type, x, y, target) {
        var ev = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true,
          pointerId: 2, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
        target.dispatchEvent(ev);
      }
      var active = document.querySelector('.nav-links .nav-link.is-active');
      var ar = active.getBoundingClientRect();
      pt('pointerdown', ar.left + ar.width / 2, ar.top + ar.height / 2, active);
      pt('pointermove', ar.left + ar.width / 2 + 14, ar.top + ar.height / 2, document);
      pt('pointerup', ar.left + ar.width / 2 + 14, ar.top + ar.height / 2 + 200, document);
      return { path: location.pathname };
    })()`);
    await sleep(600);
    const after = await ev(cdp, sessionId, 'location.pathname');
    check('拖到空白处松手：不跳转', after === '/', { before: miss.path, after });

    /* ---------- 10. 主题圆形揭示：不能被跨页淡化规则污染 ---------- */
    await go(cdp, sessionId, BASE + '/');
    const themeBefore = await ev(cdp, sessionId, `document.documentElement.getAttribute('data-theme')`);
    await ev(cdp, sessionId, `document.querySelector('[data-theme-toggle]').click()`);
    let themeState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      themeState = await ev(cdp, sessionId, `({
        theme: document.documentElement.getAttribute('data-theme'),
        vtTheme: document.documentElement.classList.contains('vt-theme'),
        boot: document.documentElement.classList.contains('vt-boot')
      })`);
      if (!themeState.vtTheme && themeState.theme !== themeBefore) break;
    }
    check('主题切换：颜色确实切换', themeState && themeState.theme !== themeBefore, themeState);
    check('主题切换：vt-theme 会清掉', themeState && !themeState.vtTheme, themeState);
    check('主题切换：不会误加跨页到达锁', themeState && !themeState.boot, themeState);

    const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '_perf');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'route-test.json'), JSON.stringify({ results }, null, 2));
    const fails = results.filter((x) => !x.pass);
    console.log(`\n跨页丝滑验收：${results.length - fails.length}/${results.length} 条通过`);
    if (fails.length) process.exitCode = 1;
  } finally {
    await sleep(200);
    kill();
  }
}

run().catch((e) => { console.error('运行失败：', e.message); process.exitCode = 1; });
