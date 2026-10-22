/* 动效分级验收：档位判定 + 令牌取值 + 到达编排的序号写法。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/tier-test.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9392);
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

const PROBE = `(() => {
  var d = document.documentElement;
  var cs = getComputedStyle(d);
  var M = window.LSMotion || {};
  return {
    tier: d.getAttribute('data-motion'),
    dur2: cs.getPropertyValue('--m-dur-2').trim(),
    dur3: cs.getPropertyValue('--m-dur-3').trim(),
    mDur1: cs.getPropertyValue('--m-dur-1').trim(),
    dist2: cs.getPropertyValue('--m-dist-2').trim(),
    stagger: cs.getPropertyValue('--m-stagger').trim(),
    parallax: cs.getPropertyValue('--m-parallax').trim(),
    dur1Alias: cs.getPropertyValue('--dur-1').trim(),
    apiTier: M.tier ? M.tier() : null,
    apiDur2: M.dur ? M.dur(2) : null,
    apiDur3: M.dur ? M.dur(3) : null,
    apiDist2: M.dist ? M.dist(2) : null,
    apiStagger: M.stagger ? M.stagger() : null,
    apiParallax: M.parallax ? M.parallax() : null,
    riseKeyframes: (function () {
      var out = null;
      for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        var rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          if (rules[j].type === CSSRule.KEYFRAMES_RULE && rules[j].name === 'rise') {
            out = rules[j].cssRules[0].style.transform || rules[j].cssRules[0].cssText;
          }
        }
      }
      return out;
    })(),
    rootTransition: (function () {
      var out = '';
      for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        var rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          var r = rules[j];
          var sel = r.selectorText || '';
          if (sel.indexOf('::view-transition-new(root)') >= 0) out += r.cssText + ' | ';
          if (r.type === CSSRule.KEYFRAMES_RULE && (r.name === 'vt-fade-in' || r.name === 'vt-page')) out += r.cssText + ' | ';
        }
      }
      return out;
    })(),
    arrivalRule: (function () {
      var out = '';
      for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        var rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          var sel = rules[j].selectorText || '';
          if (sel.indexOf('vt-settle') >= 0 || sel.indexOf('vt-arrive') >= 0) out += rules[j].cssText + ' | ';
        }
      }
      return out;
    })(),
    legacyRule: (function () {
      var out = '';
      for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        var rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (var j = 0; j < rules.length; j++) {
          var r = rules[j];
          var sel = r.selectorText || '';
          if (/vt-name|data-vt-|vt-morph|vt-dir/.test(sel)) out += r.cssText + ' | ';
          if (r.type === CSSRule.KEYFRAMES_RULE && /^vt-(page|morph|in-|out-)/.test(r.name)) out += r.cssText + ' | ';
        }
      }
      return out;
    })()
  };
})()`;

async function read(cdp, sessionId, url, reduce) {
  const send = (m, p) => Promise.race([
    cdp.send(m, p, sessionId),
    new Promise((_, rej) => setTimeout(() => rej(new Error('CDP 超时: ' + m)), 20000)),
  ]);
  await send('Emulation.setEmulatedMedia', reduce
    ? { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }
    : { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const load = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await send('Page.navigate', { url });
  await Promise.race([load, sleep(15000)]);
  await sleep(600);
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function clearMotion(cdp, sessionId) {
  const send = (m, p) => cdp.send(m, p, sessionId);
  await send('Runtime.evaluate', { expression: 'try{localStorage.removeItem("motion");}catch(e){}' });
}

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongtier-');
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

    const auto = await read(cdp, sessionId, BASE + '/', false);
    check('自适应：无参数时按设备能力判档（full/light 之一）', auto.tier === 'full' || auto.tier === 'light', auto.tier);

    const full = await read(cdp, sessionId, BASE + '/?motion=full', false);
    check('完整档：档位 = full', full.tier === 'full', full.tier);
    check('完整档：--m-dur-2 = 0.24s', full.dur2 === '0.24s', full.dur2);
    check('完整档：--m-dist-2 = 16px', full.dist2 === '16px', full.dist2);
    check('完整档：--m-stagger = 0.028s', full.stagger === '0.028s', full.stagger);
    check('完整档：--m-parallax = 1', full.parallax === '1', full.parallax);
    check('完整档：--dur-1 别名与 --m-dur-1 同值', full.dur1Alias === full.mDur1, { alias: full.dur1Alias, m: full.mDur1 });
    check('LSMotion 暴露档位', full.apiTier === 'full', full.apiTier);
    check('LSMotion.dur(2) = 240ms', full.apiDur2 === 240, full.apiDur2);
    check('LSMotion.dur(3) = 500ms', full.apiDur3 === 500, full.apiDur3);
    check('LSMotion.dist(2) = 16', full.apiDist2 === 16, full.apiDist2);
    check('LSMotion.stagger() = 0.028', Math.abs(full.apiStagger - 0.028) < 1e-6, full.apiStagger);
    check('LSMotion.parallax() = 1', full.apiParallax === 1, full.apiParallax);
    check('浮现位移走令牌 var(--m-dist-2)', /var\(--m-dist-2\)|translateY\(16px\)/.test(full.riseKeyframes || ''), full.riseKeyframes);
    check('到达只有整页一层运动（无首屏块二次位移）', full.arrivalRule === '', (full.arrivalRule || '').slice(0, 160));
    check('整页只做 opacity 淡入（走 --m-dur-2，无位移）',
      /vt-fade-in/.test(full.rootTransition || '') && /var\(--m-dur-2\)/.test(full.rootTransition || '')
      && !/(translate|transform|scale)\s*:/.test(full.rootTransition || ''), (full.rootTransition || '').slice(0, 220));
    check('不再有飞行标题 / 方向 / morph 规则', full.legacyRule === '', (full.legacyRule || '').slice(0, 160));

    await clearMotion(cdp, sessionId);
    const light = await read(cdp, sessionId, BASE + '/', true);
    check('减动效：档位 = light', light.tier === 'light', light.tier);
    check('减动效：--m-dur-2 = 0.14s', light.dur2 === '0.14s', light.dur2);
    check('减动效：--m-dist-2 = 8px', light.dist2 === '8px', light.dist2);
    check('减动效：--m-stagger = 0.016s', light.stagger === '0.016s', light.stagger);
    check('减动效：视差关闭（--m-parallax = 0）', light.parallax === '0', light.parallax);
    check('减动效：LSMotion.dur(2) = 140ms', light.apiDur2 === 140, light.apiDur2);
    check('减动效：LSMotion.parallax() = 0', light.apiParallax === 0, light.apiParallax);

    const forced = await read(cdp, sessionId, BASE + '/?motion=full', true);
    check('?motion=full 覆盖减动效 → full', forced.tier === 'full', forced.tier);
    check('?motion=full 时令牌回到完整档', forced.dur2 === '0.24s' && forced.parallax === '1', { dur2: forced.dur2, parallax: forced.parallax });

    const explicitLight = await read(cdp, sessionId, BASE + '/?motion=light', false);
    check('?motion=light 强制轻量档', explicitLight.tier === 'light', explicitLight.tier);
    check('轻量档令牌生效', explicitLight.apiDur2 === 140 && explicitLight.apiDist2 === 8, { dur: explicitLight.apiDur2, dist: explicitLight.apiDist2 });

    const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '_perf');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'tier-test.json'), JSON.stringify({ full, light, forced, explicitLight, results }, null, 2));
    const fails = results.filter((r) => !r.pass);
    console.log(`\n动效分级：${results.length - fails.length}/${results.length} 条通过`);
    if (fails.length) process.exitCode = 1;
  } finally {
    await sleep(200);
    kill();
  }
}

run().catch((e) => { console.error('运行失败：', e.message); process.exitCode = 1; });
