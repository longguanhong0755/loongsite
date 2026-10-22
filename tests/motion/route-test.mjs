/* P1 验收：关系化跨页过渡（卡片→详情 morph / 方向化滑入）+ 导航玻璃块拖拽。
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

/* 点击一个链接，但阻止真实跳转（我们的计划器先注册，先于它跑完），
   这样能在页面还在原地时读出 sessionStorage 里的过渡计划。 */
const CLICK_AND_READ = (sel) => `(() => {
  document.addEventListener('click', function (e) { e.preventDefault(); }, true);
  var a = document.querySelector(${JSON.stringify(sel)});
  if (!a) return { missing: true };
  a.click();
  var d = document.documentElement;
  return {
    dir: sessionStorage.getItem('vt-dir'),
    morph: sessionStorage.getItem('vt-morph'),
    htmlDir: d.getAttribute('data-vt-dir'),
    htmlMorph: d.getAttribute('data-vt-morph')
  };
})()`;

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

    /* ---------- 1. 首页点项目卡：只 morph，不给方向（跨栏目） ---------- */
    await go(cdp, sessionId, BASE + '/');
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    let r = await ev(cdp, sessionId, CLICK_AND_READ('[data-morph="proj-guessword"] a[href="/projects/guessword"]'));
    check('首页→项目卡：写入 morph', r.morph === 'proj-guessword', r);
    check('首页→项目卡：跨栏目不给方向', r.dir === null, r.dir);
    let vtn = await ev(cdp, sessionId, `(() => {
      var card = document.querySelector('[data-morph="proj-guessword"]');
      var title = card.querySelector('.vt-name');
      return { card: getComputedStyle(card).viewTransitionName, title: getComputedStyle(title).viewTransitionName };
    })()`);
    check('旧页：卡片拿到共享元素名', vtn.card === 'proj-guessword', vtn);
    check('旧页：卡内标题不再单独飞（父子同名会打架）', vtn.title === 'none', vtn);

    /* ---------- 2. 列表→详情：morph + 前进方向 ---------- */
    await go(cdp, sessionId, BASE + '/projects/');
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    r = await ev(cdp, sessionId, CLICK_AND_READ('[data-morph="proj-guessword"] a[href="/projects/guessword"]'));
    check('列表→详情：方向 = fwd', r.dir === 'fwd', r);
    check('列表→详情：morph = proj-guessword', r.morph === 'proj-guessword', r);

    /* ---------- 3. 详情→列表（返回链接）：back ---------- */
    await go(cdp, sessionId, BASE + '/projects/guessword');
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    r = await ev(cdp, sessionId, CLICK_AND_READ('.backlink'));
    check('详情→列表：方向 = back', r.dir === 'back', r);
    check('详情→列表：不是卡片展开（无 morph）', r.morph === null, r);

    /* ---------- 4. 详情页翻页：上一个 back / 下一个 fwd ---------- */
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    r = await ev(cdp, sessionId, CLICK_AND_READ('.pager-item.pager-next'));
    check('详情页「下一个」：方向 = fwd', r.dir === 'fwd', r);
    check('详情页「下一个」：morph 到下一个项目', /^proj-/.test(r.morph || ''), r.morph);
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    r = await ev(cdp, sessionId, CLICK_AND_READ('.pager-item:not(.pager-next)'));
    check('详情页「上一个」：方向 = back', r.dir === 'back', r);
    check('详情页「上一个」：morph 到上一个项目', /^proj-/.test(r.morph || ''), r.morph);

    /* ---------- 5. 跨栏目不给方向 ---------- */
    await go(cdp, sessionId, BASE + '/blog/');
    await ev(cdp, sessionId, 'sessionStorage.clear()');
    r = await ev(cdp, sessionId, CLICK_AND_READ('.nav-link[href="/projects/"]'));
    check('博客→项目（跨栏目）：无方向', r.dir === null, r);
    check('博客→项目（跨栏目）：无 morph', r.morph === null, r);

    /* ---------- 6. 新页首绘前读走计划并落到 <html> ---------- */
    await ev(cdp, sessionId, `sessionStorage.setItem('vt-dir','fwd');sessionStorage.setItem('vt-morph','proj-guessword');`);
    await go(cdp, sessionId, BASE + '/projects/guessword');
    r = await ev(cdp, sessionId, `(() => {
      var d = document.documentElement;
      var head = document.querySelector('.page-head[data-morph="proj-guessword"]');
      var h1 = head.querySelector('.vt-name');
      return {
        dir: d.getAttribute('data-vt-dir'),
        morph: d.getAttribute('data-vt-morph'),
        hero: getComputedStyle(head).viewTransitionName,
        h1: getComputedStyle(h1).viewTransitionName,
        leftDir: sessionStorage.getItem('vt-dir'),
        leftMorph: sessionStorage.getItem('vt-morph')
      };
    })()`);
    check('新页：data-vt-dir = fwd', r.dir === 'fwd', r);
    check('新页：data-vt-morph = proj-guessword', r.morph === 'proj-guessword', r);
    check('新页：详情容器拿到共享元素名', r.hero === 'proj-guessword', r);
    check('新页：标题不再单独飞', r.h1 === 'none', r);
    check('新页：读完即清（不留给下一页）', r.leftDir === null && r.leftMorph === null, r);

    /* ---------- 7. 导航玻璃块拖拽 ---------- */
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

    /* 等松手后的动画 + 跳转 */
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

    /* ---------- 8. 拖到空白处松手 = 什么都不发生 ---------- */
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

    /* ---------- 9. 真实跨页到达：只允许整页一层运动 ---------- */
    await go(cdp, sessionId, BASE + '/projects/?motion=full');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__arrival = null;
        window.addEventListener('pagereveal', function (e) {
          if (!e || !e.viewTransition) return;
          setTimeout(function () {
            var blocks = [].slice.call(document.querySelectorAll('.reveal.is-in'));
            window.__arrival = {
              hasVT: true,
              cls: document.documentElement.className,
              translates: blocks.slice(0, 6).map(function (el) { return getComputedStyle(el).translate; })
            };
          }, 0);
        }, { once: true });`
    }, sessionId);
    const arrived = new Promise((res) => cdp.on('Page.loadEventFired', res));
    await ev(cdp, sessionId, `document.querySelector('.nav-link[href="/blog/"]').click()`);
    await Promise.race([arrived, sleep(15000)]);
    await sleep(400);
    const arrival = await ev(cdp, sessionId, 'window.__arrival');
    check('到达：确实走 View Transition', arrival && arrival.hasVT, arrival && arrival.hasVT);
    check('到达：首屏块没有二次位移（translate 保持 0）', arrival && arrival.translates.length > 0 && arrival.translates.every((t) => t === 'none' || t === '0px'), arrival && arrival.translates);
    check('到达：html 不再挂 vt-arrive / vt-settle', arrival && !/vt-(arrive|settle)/.test(arrival.cls), arrival && arrival.cls);

    const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '_perf');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'route-test.json'), JSON.stringify({ results }, null, 2));
    const fails = results.filter((x) => !x.pass);
    console.log(`\nP1 路由过渡：${results.length - fails.length}/${results.length} 条通过`);
    if (fails.length) process.exitCode = 1;
  } finally {
    await sleep(200);
    kill();
  }
}

run().catch((e) => { console.error('运行失败：', e.message); process.exitCode = 1; });
