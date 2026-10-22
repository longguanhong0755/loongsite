/* P5 降级验证：无 JS / 系统减动效 / 轻量档 / 触屏。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/degrade-test.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9408);
const POST = '/blog/ssh-over-tls';
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
async function go(cdp, sessionId, url) {
  const load = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url }, sessionId);
  await Promise.race([load, sleep(15000)]);
  await sleep(900);
}
const scrollTo = async (cdp, sessionId, top) => {
  await ev(cdp, sessionId, `window.scrollTo({ top: ${Math.round(top)}, behavior: 'instant' }); 1`);
  await sleep(800);
};

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongdegrade-');
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
    await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

    /* ================= G. 无 JS =================
       单独开一个 target 跑：脚本禁用后同一 session 的 Emulation 状态会变得不可靠 */
    const nojsTarget = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const nojs = (await cdp.send('Target.attachToTarget', { targetId: nojsTarget.targetId, flatten: true })).sessionId;
    await cdp.send('Page.enable', {}, nojs);
    await cdp.send('Runtime.enable', {}, nojs);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true }, nojs);
    await go(cdp, nojs, BASE + POST);
    const noJs = await ev(cdp, nojs, `(() => {
      var art = document.querySelector('.post-article');
      var p = document.querySelector('.prose p');
      var h = document.querySelector('.prose h2');
      var links = document.querySelectorAll('[data-toc] a[href^="#"]');
      var reveal = document.querySelector('.reveal');
      return {
        jsClass: document.documentElement.classList.contains('js'),
        artVisible: !!art && getComputedStyle(art).opacity === '1',
        text: p ? p.textContent.slice(0, 24) : '',
        textVisible: !!p && getComputedStyle(p).visibility === 'visible' && p.getBoundingClientRect().height > 0,
        heading: !!h,
        tocLinks: links.length,
        revealOpacity: reveal ? getComputedStyle(reveal).opacity : null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toTop: (function () { var b = document.querySelector('[data-to-top]'); return b ? getComputedStyle(b).visibility : null; })()
      };
    })()`);
    check('G1 无 JS：正文与标题完整可见（未被入场动画藏起来）',
      noJs.artVisible && noJs.textVisible && noJs.heading && noJs.revealOpacity === '1', noJs);
    check('G2 无 JS：目录链接仍在，无横向溢出', noJs.tocLinks > 0 && noJs.overflow <= 0,
      { tocLinks: noJs.tocLinks, overflow: noJs.overflow });
    check('G3 无 JS：未注入 js 类，回顶按钮保持隐藏', noJs.jsClass === false && noJs.toTop === 'hidden', noJs);
    await cdp.send('Target.closeTarget', { targetId: nojsTarget.targetId });

    /* ================= H. 系统减动效 ================= */
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    }, sessionId);
    await go(cdp, sessionId, BASE + POST);
    const reduce = await ev(cdp, sessionId, `(() => {
      var ring = document.querySelector('[data-read-ring]');
      return {
        motion: document.documentElement.getAttribute('data-motion'),
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        ring: !!ring,
        read: ring ? ring.style.getPropertyValue('--read') : null,
        toc: !!document.querySelector('.toc-indicator')
      };
    })()`);
    check('G4 减动效：落到轻量档，平滑滚动关闭',
      reduce.motion === 'light' && reduce.scrollBehavior === 'auto', reduce);
    check('G5 减动效：阅读环与目录指示条仍在', reduce.ring && reduce.toc, reduce);
    const maxY = await ev(cdp, sessionId, `document.documentElement.scrollHeight - innerHeight`);
    await scrollTo(cdp, sessionId, maxY * 0.5);
    const reduceAfter = await ev(cdp, sessionId, `(() => {
      var ring = document.querySelector('[data-read-ring]');
      var link = document.querySelector('.toc-link.is-active');
      return { read: ring ? Number(ring.style.getPropertyValue('--read')) : null,
        active: link ? link.getAttribute('href') : null };
    })()`);
    check('G6 减动效：滚动仍驱动进度与目录高亮',
      reduceAfter.read > 0 && reduceAfter.read < 1 && !!reduceAfter.active, reduceAfter);

    /* ================= I. 轻量档（查询参数） ================= */
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    }, sessionId);
    await go(cdp, sessionId, BASE + POST + '?motion=light');
    const light = await ev(cdp, sessionId, `({ motion: document.documentElement.getAttribute('data-motion'),
      ring: !!document.querySelector('[data-read-ring]'),
      dur: getComputedStyle(document.documentElement).getPropertyValue('--m-dur-2').trim() })`);
    check('G7 轻量档：令牌按 light 生效', light.motion === 'light' && light.dur === '0.14s' && light.ring, light);

    /* ================= J. 触屏 ================= */
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
    await go(cdp, sessionId, BASE + '/?motion=full');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: 300, y: 400, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    }, sessionId);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: 320, y: 420, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    }, sessionId);
    await sleep(1200);
    const touch = await ev(cdp, sessionId, `({ gxOn: document.documentElement.classList.contains('gx-on'),
      lit: document.querySelectorAll('.gx-lit').length, hot: document.querySelectorAll('.gx-hot').length })`);
    check('G8 触屏：不误触发悬停光斑', touch.gxOn === false && touch.lit === 0 && touch.hot === 0, touch);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId).catch(() => {});

    const passed = results.filter((r) => r.pass).length;
    fs.mkdirSync('_perf', { recursive: true });
    fs.writeFileSync('_perf/degrade-test.json', JSON.stringify(results, null, 2));
    console.log(`\nP5 降级验证：${passed}/${results.length} 条通过`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    kill();
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
