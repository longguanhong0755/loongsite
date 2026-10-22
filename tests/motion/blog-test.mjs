/* P4 验收：博客阅读进度环 + 目录平滑跟随。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/blog-test.mjs
   注意：全站 scroll-behavior:smooth，headless 帧率低——滚动一律用 behavior:'instant'。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9407);
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
  await sleep(800);
}
/* 视口宽度切换后重新加载，避免用旧的布局缓存 */
async function viewport(cdp, sessionId, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
}
const scrollTo = async (cdp, sessionId, top) => {
  await ev(cdp, sessionId, `window.scrollTo({ top: ${Math.round(top)}, behavior: 'instant' }); 1`);
  await sleep(700);
};
const readState = (cdp, sessionId) => ev(cdp, sessionId, `(() => {
  var ring = document.querySelector('[data-read-ring]');
  var btn = document.querySelector('[data-to-top]');
  var fill = document.querySelector('.read-ring-fill');
  var art = document.querySelector('.post-article');
  var sy = window.pageYOffset;
  var vh = window.innerHeight;
  var r = art.getBoundingClientRect();
  var start = r.top + sy;
  var span = r.height - vh;
  var expect = span > 0 ? (sy - start) / span : (sy >= start ? 1 : 0);
  expect = Math.max(0, Math.min(1, expect));
  return {
    hasRing: !!ring, isOn: btn && btn.classList.contains('is-on'),
    read: ring ? Number(ring.style.getPropertyValue('--read')) : null,
    expect: expect,
    /* Chrome 对非零值会序列化成 calc(88.4px)，这里取其中的数值 */
    offset: fill ? (function () {
      var raw = getComputedStyle(fill).getPropertyValue('stroke-dashoffset');
      var m = /-?[0-9.]+/.exec(raw);
      return m ? parseFloat(m[0]) : null;
    })() : null,
    rawOffset: fill ? getComputedStyle(fill).getPropertyValue('stroke-dashoffset') : null,
    dasharray: fill ? getComputedStyle(fill).strokeDasharray : null,
    border: btn ? getComputedStyle(btn).borderTopColor : null,
    sy: sy, vh: vh, scrollH: document.documentElement.scrollHeight
  };
})()`);
const tocState = (cdp, sessionId, hostSel) => ev(cdp, sessionId, `(() => {
  var host = document.querySelector(${JSON.stringify(hostSel)});
  if (!host) return null;
  var link = host.querySelector('.toc-link.is-active');
  var ind = host.querySelector('.toc-indicator');
  return {
    active: link ? link.getAttribute('href') : null,
    hasActive: host.classList.contains('has-active'),
    ready: host.classList.contains('is-ready'),
    y: ind ? ind.style.getPropertyValue('--toc-y') : null,
    h: ind ? ind.style.getPropertyValue('--toc-h') : null,
    linkY: link ? link.offsetTop : null,
    linkH: link ? link.offsetHeight : null,
    opacity: ind ? getComputedStyle(ind).opacity : null,
    transition: ind ? getComputedStyle(ind).transitionProperty : null,
    clientH: host.clientHeight, scrollH: host.scrollHeight, scrollTop: host.scrollTop
  };
})()`);

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongblog-');
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
    await viewport(cdp, sessionId, 1440, 900);

    /* ================= E. 阅读进度环 ================= */
    await go(cdp, sessionId, BASE + POST + '?motion=full');
    /* headless 帧率极低，进度过渡可能整段不推进；这里只验"进度 → dashoffset"的映射 */
    await ev(cdp, sessionId, `document.querySelector('.read-ring-fill').style.transition = 'none'; 1`);
    const markup = await ev(cdp, sessionId, `(() => {
      var ring = document.querySelector('[data-read-ring]');
      var circles = ring ? ring.querySelectorAll('circle') : [];
      return {
        ring: !!ring, hasRingClass: ring ? ring.classList.contains('has-ring') : false,
        circles: circles.length,
        pathLengths: [].map.call(circles, function (c) { return c.getAttribute('pathLength'); }),
        track: !!document.querySelector('.read-ring-track'),
        fill: !!document.querySelector('.read-ring-fill'),
        onIndexPage: !!document.querySelector('.post-list') && !document.querySelector('.post-article')
      };
    })()`);
    check('E1 文章页回顶按钮带阅读环（轨道 + 进度圆）',
      markup.ring && markup.hasRingClass && markup.circles === 2 && markup.track && markup.fill &&
      markup.pathLengths.every((v) => v === '100'), markup);

    const atTop = await readState(cdp, sessionId);
    check('E2 页面顶部：进度 0，回顶按钮未出现', atTop.read === 0 && !atTop.isOn, atTop);
    check('E3 进度环的边框让位给 SVG 轨道', atTop.border === 'rgba(0, 0, 0, 0)', { border: atTop.border });

    await scrollTo(cdp, sessionId, 600);
    const atMid = await readState(cdp, sessionId);
    check('E4 滚过 320px：回顶按钮出现', atMid.isOn === true, { isOn: atMid.isOn });
    check('E5 滚动后进度在 0~1 之间且与文章位置一致',
      atMid.read > 0 && atMid.read < 1 && Math.abs(atMid.read - atMid.expect) < 0.01, atMid);
    check('E6 dashoffset = pathLength × (1 − 进度)',
      (atMid.dasharray === '100px' || atMid.dasharray === '100') &&
      Math.abs(atMid.offset - 100 * (1 - atMid.read)) < 0.6,
      { dasharray: atMid.dasharray, offset: atMid.offset, read: atMid.read });
    check('E7 进度环线宽 2px', await ev(cdp, sessionId,
      `getComputedStyle(document.querySelector('.read-ring circle')).strokeWidth`) === '2px');

    await scrollTo(cdp, sessionId, atMid.scrollH);
    const atBottom = await readState(cdp, sessionId);
    check('E8 文章底部：进度收满 1', atBottom.read >= 0.98, atBottom);
    check('E9 收满后 dashoffset 归零（容差 1）', Math.abs(atBottom.offset) <= 1, { offset: atBottom.offset });

    /* 非文章页不挂进度环 */
    await go(cdp, sessionId, BASE + '/blog/?motion=full');
    const noRing = await ev(cdp, sessionId, `!document.querySelector('[data-read-ring]') && !document.querySelector('.read-ring')`);
    check('E10 非文章页不挂阅读环', noRing === true);

    /* ================= F. 目录平滑跟随 ================= */
    await go(cdp, sessionId, BASE + POST + '?motion=full');
    const tocTop = await tocState(cdp, sessionId, '[data-toc]');
    check('F1 桌面目录有指示条，首次定位已就绪',
      !!tocTop && tocTop.ready && tocTop.y !== null && tocTop.y !== '' && tocTop.linkY === null, tocTop);
    check('F2 未进入正文时指示条隐藏', tocTop.opacity === '0' && !tocTop.hasActive, { opacity: tocTop.opacity });
    /* headless 里 CSS 过渡经常整段不推进：先记下声明的过渡，再关掉过渡量位置/透明度 */
    const tocTransition = tocTop.transition;
    await ev(cdp, sessionId, `document.querySelector('.toc-indicator').style.transition = 'none'; 1`);

    /* 目录判定的阈值是"标题进入视口顶部 120px 以内"，这里滚到标题上方 100px 处 */
    const sec3Top = await ev(cdp, sessionId, `(() => {
      var h = document.getElementById('sec-3');
      return h.getBoundingClientRect().top + window.pageYOffset - 100;
    })()`);
    await scrollTo(cdp, sessionId, sec3Top);
    const toc3 = await tocState(cdp, sessionId, '[data-toc]');
    check('F3 滚到第 3 节：目录高亮对应条目',
      toc3.active === '#sec-3' && toc3.hasActive && toc3.opacity === '1', toc3);
    check('F4 指示条位置/高度 = 活动条目的 offsetTop/offsetHeight',
      toc3.y === toc3.linkY + 'px' && toc3.h === toc3.linkH + 'px', toc3);
    check('F5 指示条用 transform + height 过渡（平滑跟随）',
      /transform/.test(tocTransition || '') && /height/.test(tocTransition || ''), { transition: tocTransition });

    const sec6Top = await ev(cdp, sessionId, `(() => {
      var h = document.getElementById('sec-6');
      return h.getBoundingClientRect().top + window.pageYOffset - 100;
    })()`);
    await scrollTo(cdp, sessionId, sec6Top);
    const toc6 = await tocState(cdp, sessionId, '[data-toc]');
    const moved = toc3.linkY !== null && toc6.linkY !== null && toc6.linkY !== toc3.linkY;
    check('F6 继续下滚：高亮切换，指示条移到新位置',
      toc6.active === '#sec-6' && moved && toc6.y === toc6.linkY + 'px', { before: toc3.linkY, after: toc6.linkY, active: toc6.active });

    /* 移动端：目录默认收起，展开后重新定位 */
    await viewport(cdp, sessionId, 390, 844);
    await go(cdp, sessionId, BASE + POST + '?motion=full');
    const mobileClosed = await ev(cdp, sessionId, `(() => {
      var d = document.querySelector('.toc-mobile');
      return { visible: !!d && getComputedStyle(d).display !== 'none', open: d && d.open };
    })()`);
    check('F7 移动端目录默认收起且可见', mobileClosed.visible && mobileClosed.open === false, mobileClosed);
    /* 展开目录会把它下面的正文推下去，所以先展开、再按新的文档位置滚动 */
    await ev(cdp, sessionId, `document.querySelector('.toc-mobile').open = true;
      document.querySelector('.toc-inline .toc-indicator').style.transition = 'none'; 1`);
    await sleep(900);
    const sec2Top = await ev(cdp, sessionId, `(() => {
      var h = document.getElementById('sec-2');
      return h.getBoundingClientRect().top + window.pageYOffset - 100;
    })()`);
    await scrollTo(cdp, sessionId, sec2Top);
    const tocM = await tocState(cdp, sessionId, '.toc-inline');
    check('F8 展开移动目录：指示条重新定位到当前小节',
      tocM && tocM.active === '#sec-2' && tocM.hasActive && tocM.y === tocM.linkY + 'px' && tocM.h === tocM.linkH + 'px', tocM);
    const noOverflow = await ev(cdp, sessionId, `document.documentElement.scrollWidth <= window.innerWidth + 1`);
    check('F9 移动端无横向溢出', noOverflow === true);

    const passed = results.filter((r) => r.pass).length;
    fs.mkdirSync('_perf', { recursive: true });
    fs.writeFileSync('_perf/blog-test.json', JSON.stringify(results, null, 2));
    console.log(`\nP4 阅读进度环与目录跟随：${passed}/${results.length} 条通过`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    kill();
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
