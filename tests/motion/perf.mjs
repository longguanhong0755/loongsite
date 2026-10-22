/* 动效性能基线：CDP 驱动真实页面，量化"每帧主线程成本"，并给出掉帧/长任务证据。
   用法：
     BASE=http://127.0.0.1:8090 npm run perf          # 完整档
     BASE=... TIER=light npm run perf                 # 模拟系统减动效（轻量档）
     BASE=https://loongsite.com OUT=... npm run perf  # 线上体检
   门槛（环境变量覆盖）：
     SCRIPT_MS   每帧脚本预算，默认 6ms
     STYLE_MS    每帧样式+布局预算，默认 4ms
     LONG_TASKS  场景内 50ms 以上长任务上限，默认 3
     P95_MS / JANK_PCT  只有在"节拍可信"时才当硬门槛（见下）
   节拍说明：无 GPU 的 headless 用软件光栅，BeginFrame 会被绘图拖慢，rAF 间隔不代表
   真实设备的帧率。所以启动时先量一次空白页节拍：≥45fps 才把 p95/掉帧当硬门槛，
   否则只做参考输出，硬门槛落在每帧主线程成本（脚本/样式/布局/长任务）上。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9391);
const REDUCE = process.env.TIER === 'light';
const SCRIPT_MAX = Number(process.env.SCRIPT_MS || 6);
const STYLE_MAX = Number(process.env.STYLE_MS || 4);
const LONG_MAX = Number(process.env.LONG_TASKS || 3);
const P95_MAX = Number(process.env.P95_MS || 20);
const JANK_MAX = Number(process.env.JANK_PCT || 6);
const OUT = path.resolve(process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '_perf'));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

/* 帧节拍记录器：注入时机不可靠（document start 时 documentElement 可能为 null），
   所以做成幂等函数，场景开始前再补装一次 */
const RECORDER = `(function(){
  if (window.__perf && !window.__perf.stop) return;
  var P = window.__perf = { frames: [], long: [], stop: false };
  var prev = 0;
  function tick(ts){
    if (P.stop) return;
    if (prev) { var d = ts - prev; if (d > 0 && d < 1000) P.frames.push(Math.round(d * 10) / 10); }
    prev = ts;
    window.requestAnimationFrame(tick);
  }
  window.requestAnimationFrame(tick);
  try {
    new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ P.long.push({ dur: Math.round(e.duration), at: Math.round(e.startTime) }); }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  window.__perfStop = function(){ P.stop = true; };
})();`;

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

const pct = (arr, q) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const r2 = (n) => Math.round(n * 100) / 100;

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongperf-');
  const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu',
    `--user-data-dir=${prof}`, `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,800',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars', 'about:blank'],
    { stdio: 'ignore', detached: true });
  const kill = () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch (e) {} };
  const scenarios = [];
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
    const send = (m, p) => Promise.race([
      cdp.send(m, p, sessionId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('CDP 超时: ' + m)), 20000)),
    ]);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) => errors.push((p.exceptionDetails.text || '') + ' ' + ((p.exceptionDetails.exception || {}).description || '')));
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Performance.enable');
    if (REDUCE) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
      return r.result.value;
    };

    /* 1. 空白页节拍：判定这台机器能不能用 rAF 间隔当硬门槛 */
    await send('Page.navigate', { url: 'data:text/html,<body>x</body>' });
    await sleep(600);
    const cadence = Number(await evaluate('new Promise(function(res){var n=0,t0=performance.now();function f(){n++;if(performance.now()-t0<700){requestAnimationFrame(f);}else{res(Math.round(n/((performance.now()-t0)/1000)));}}requestAnimationFrame(f);})'));
    const cadenceOk = cadence >= 45;
    log(`空白页节拍 ${cadence}fps → rAF 间隔${cadenceOk ? '可信，作为硬门槛' : '不可信（软件光栅），仅作参考；硬门槛落在每帧主线程成本'}`);

    await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });

    const metrics = async () => {
      const m = await send('Performance.getMetrics');
      const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
      return { script: g('ScriptDuration'), style: g('RecalcStyleDuration'), layout: g('LayoutDuration'), task: g('TaskDuration') };
    };

    /* 2. 场景执行：记录帧数 + 长任务 + 主线程各类耗时 */
    const runScenario = async (label, ms, body) => {
      await evaluate(RECORDER + 'window.__perf&&(window.__perf.stop=false,window.__perf.frames.length=0,window.__perf.long.length=0);');
      const m0 = await metrics();
      const t0 = Date.now();
      await body();
      const waited = Date.now() - t0;
      if (waited < ms) await sleep(ms - waited);
      const m1 = await metrics();
      const st = JSON.parse(await evaluate('window.__perfStop&&window.__perfStop(),JSON.stringify({frames:(window.__perf||{}).frames||[],long:(window.__perf||{}).long||[],tier:document.documentElement.getAttribute("data-motion")||"full",path:location.pathname})'));
      const f = st.frames.length || 1;
      const jank = st.frames.filter((x) => x > 25).length;
      const row = {
        label,
        path: st.path,
        tier: st.tier,
        seconds: r2((Date.now() - t0) / 1000),
        frames: st.frames.length,
        fps: r2(st.frames.length / Math.max(0.2, (Date.now() - t0) / 1000)),
        p50: pct(st.frames, 0.5),
        p95: pct(st.frames, 0.95),
        max: st.frames.length ? Math.max(...st.frames) : 0,
        jankPct: r2((jank / f) * 100),
        scriptPerFrame: r2((m1.script - m0.script) * 1000 / f),
        styleLayoutPerFrame: r2(((m1.style - m0.style) + (m1.layout - m0.layout)) * 1000 / f),
        busyPct: r2(((m1.task - m0.task) * 1000) / Math.max(200, Date.now() - t0) * 100),
        longTasks: st.long.length,
        worstLongTask: st.long.length ? Math.max(...st.long.map((x) => x.dur)) : 0,
      };
      scenarios.push(row);
      log(`${label}: ${row.frames}帧(${row.fps}fps p95=${row.p95}ms 掉帧${row.jankPct}%) 每帧脚本=${row.scriptPerFrame}ms 样式+布局=${row.styleLayoutPerFrame}ms 主线程占用=${row.busyPct}% 长任务=${row.longTasks}(${row.worstLongTask}ms) tier=${row.tier}`);
      return row;
    };
    const wheel = async (dy, steps, gap) => {
      for (let i = 0; i < steps; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 380, deltaX: 0, deltaY: dy, button: 'none' });
        await sleep(gap);
      }
    };

    const loadEvt = new Promise((res) => cdp.on('Page.loadEventFired', res));
    await send('Page.navigate', { url: BASE + '/' });
    await Promise.race([loadEvt, sleep(15000)]);
    await sleep(700);
    await runScenario('首页载入（首屏编排）', 1600, async () => {});

    await evaluate('window.scrollTo(0, 0)');
    await sleep(400);
    await runScenario('连续滚动（浮现+进度+章节）', 1400, () => wheel(240, 30, 34));

    const card = await evaluate(`(() => {
      var el = document.querySelector('.project-card') || document.querySelector('.glass');
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (card) {
      await sleep(500);
      await runScenario('玻璃光斑跟随（GX 悬停）', 800, async () => {
        for (let i = 0; i < 24; i++) {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: card.x - 180 + i * 15, y: card.y - 40 + (i % 5) * 12, buttons: 0 });
          await sleep(28);
        }
      });
    } else log('跳过悬停场景：页面上找不到玻璃块');

    const navTo = await evaluate(`(() => {
      var a = Array.from(document.querySelectorAll('.nav-links .nav-link')).find(function (x) { return x.getAttribute('href') === '/projects/'; });
      if (!a) return null;
      var r = a.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (navTo) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: navTo.x, y: navTo.y, button: 'left', clickCount: 1 });
      await runScenario('跨页导航（过渡 + 到达上浮）', 2000, async () => {
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: navTo.x, y: navTo.y, button: 'left', clickCount: 1 });
        await sleep(300);
      });
    } else log('跳过跨页场景：找不到 /projects/ 导航');

    /* 3. 判定 */
    const bad = [];
    for (const s of scenarios) {
      if (s.frames < 10) bad.push(`${s.label}：帧数太少（${s.frames}），采样无效`);
      if (s.scriptPerFrame > SCRIPT_MAX) bad.push(`${s.label}：每帧脚本 ${s.scriptPerFrame}ms > ${SCRIPT_MAX}ms`);
      if (s.styleLayoutPerFrame > STYLE_MAX) bad.push(`${s.label}：每帧样式+布局 ${s.styleLayoutPerFrame}ms > ${STYLE_MAX}ms`);
      if (s.longTasks > LONG_MAX) bad.push(`${s.label}：长任务 ${s.longTasks} > ${LONG_MAX}（最坏 ${s.worstLongTask}ms）`);
      if (cadenceOk && s.p95 > P95_MAX) bad.push(`${s.label}：p95 帧间隔 ${s.p95}ms > ${P95_MAX}ms`);
      if (cadenceOk && s.jankPct > JANK_MAX) bad.push(`${s.label}：掉帧 ${s.jankPct}% > ${JANK_MAX}%`);
    }
    if (errors.length) bad.push(`JS 异常 ${errors.length} 条：` + errors.slice(0, 3).join(' | '));
    const file = path.join(OUT, (REDUCE ? 'light' : 'full') + '.json');
    fs.writeFileSync(file, JSON.stringify({ base: BASE, at: new Date().toISOString(), cadence, cadenceOk, budget: { SCRIPT_MAX, STYLE_MAX, LONG_MAX, P95_MAX, JANK_MAX }, scenarios, errors }, null, 2));
    log('报告已写入 ' + file);
    await send('Browser.close').catch(() => {});
    if (bad.length) {
      console.log('\n动效性能不达标：');
      bad.forEach((b) => console.log('  ✗ ' + b));
      process.exitCode = 1;
    } else {
      console.log(`\n动效性能基线通过 ✓（${scenarios.length} 个场景：每帧脚本 ≤ ${SCRIPT_MAX}ms、样式+布局 ≤ ${STYLE_MAX}ms、长任务 ≤ ${LONG_MAX}${cadenceOk ? `、p95 ≤ ${P95_MAX}ms` : '；节拍不可信，未硬卡帧间隔'}）`);
    }
  } finally {
    await sleep(200);
    kill();
  }
}

run().catch((e) => { console.error('运行失败：', e.message); process.exitCode = 1; });
