/* P3 验收：GX 光斑增强 + 全站微交互（按钮 / 链接 / 状态 / 筛选 / 图标 / 加载）。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/interact-test.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9406);
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
  await sleep(700);
}

/* 把鼠标移到某个元素上，返回它的位置。
   先把鼠标挪到角落再移过去：Chromium 不会为"坐标与上一次完全相同"的
   移动派发 pointermove，页面刚导航完时就会漏掉第一次悬停。 */
async function hover(cdp, sessionId, selector, dy) {
  /* 先滚到视口中间：元素在视口外时派发的鼠标事件不会命中它。
     必须用 instant——全站开着 scroll-behavior:smooth，headless 只有 ~3fps，
     平滑滚动几百毫秒都到不了位，元素仍在视口外，:hover 永远不会触发。 */
  await ev(cdp, sessionId, `(() => {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return 1;
  })()`);
  await sleep(200);
  const box = await ev(cdp, sessionId, `(() => {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height, top: r.top, left: r.left };
  })()`);
  if (!box) return null;
  const y = dy === undefined ? box.y : Math.round(box.top + dy);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 }, sessionId);
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: y, buttons: 0 }, sessionId);
  return box;
}

/* 取元素上所有动画的关键帧（用来断言 FLIP / 进出场的变换内容） */
const KF = `(function (el) {
  if (!el) return [];
  return el.getAnimations().map(function (a) {
    var kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
    return { t: kf.length ? kf[0].transform : null, o: kf.length ? kf[0].opacity : null, dur: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null };
  });
})`;

async function run() {
  const prof = fs.mkdtempSync('/tmp/loonginteract-');
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
    await cdp.send('Browser.grantPermissions', {
      origin: BASE,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
    });
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});

    /* ================= A. GX 光斑增强（首页，完整档） ================= */
    await go(cdp, sessionId, BASE + '/?motion=full');
    check('A0 完整档生效', (await ev(cdp, sessionId, `document.documentElement.getAttribute('data-motion')`)) === 'full');

    const btnBox = await hover(cdp, sessionId, '.hero-card .btn', 0);
    check('A1 鼠标进入后开启光斑', (await ev(cdp, sessionId, `document.documentElement.classList.contains('gx-on')`)) === true);
    await sleep(1500); /* 等弹簧帧把光斑位置写到宿主上（headless 帧率低） */

    const gxState = await ev(cdp, sessionId, `(() => {
      var host = document.querySelector('.hero-card .btn');
      var veil = host.querySelector('.gx-veil');
      var sib = host.parentElement.querySelector('.btn + .btn') || document.querySelectorAll('.hero-card .btn')[1];
      return {
        hot: host.classList.contains('gx-hot'),
        lit: host.classList.contains('gx-lit'),
        k: host.style.getPropertyValue('--gx-k'),
        rimK: host.style.getPropertyValue('--gx-rim-k'),
        mx: host.style.getPropertyValue('--mx'),
        my: host.style.getPropertyValue('--my'),
        sibK: sib ? sib.style.getPropertyValue('--gx-k') : null,
        sibLit: sib ? sib.classList.contains('gx-lit') : null,
        sibHot: sib ? sib.classList.contains('gx-hot') : null
      };
    })()`);
    check('A2 悬停目标同时是 lit 与 hot', gxState.lit && gxState.hot, gxState);
    check('A3 命中块的光照系数 = 1', gxState.k === '1.000', { k: gxState.k });
    check('A4 光斑位置跟着光标', !!gxState.mx && !!gxState.my, { mx: gxState.mx, my: gxState.my });
    check('A5 邻近块也亮但更暗（按距离衰减）',
      gxState.sibLit && !gxState.sibHot && gxState.sibK !== null && Number(gxState.sibK) < 1 && Number(gxState.sibK) > 0,
      { sibK: gxState.sibK, sibLit: gxState.sibLit });

    /* 棱边接光：光标在顶边时亮，挪到块中间就灭 */
    const topBtn = await ev(cdp, sessionId, `(() => { var r = document.querySelector('.hero-card .btn').getBoundingClientRect(); return { top: r.top }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnBox.x, y: Math.round(topBtn.top + 2), buttons: 0 }, sessionId);
    await sleep(300);
    const rimTop = await ev(cdp, sessionId, `document.querySelector('.hero-card .btn').style.getPropertyValue('--gx-rim-k')`);
    check('A6 光标贴近顶边：棱边接光亮起', Number(rimTop) > 0.7, { rimK: rimTop });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: btnBox.x, y: Math.round(topBtn.top + 60), buttons: 0 }, sessionId);
    await sleep(300);
    const rimMid = await ev(cdp, sessionId, `document.querySelector('.hero-card .btn').style.getPropertyValue('--gx-rim-k')`);
    check('A7 光标离开顶边：棱边接光变暗', Number(rimMid) < Number(rimTop), { rimTop: rimTop, rimMid: rimMid });

    /* 显影强度：完整档 = 1，轻量档 = --m-spot */
    await hover(cdp, sessionId, '.hero-card .btn', 0);
    await sleep(2600);
    const opFull = await ev(cdp, sessionId, `getComputedStyle(document.querySelector('.hero-card .btn .gx-veil')).opacity`);
    check('A8 完整档：光斑满强度', Number(opFull) > 0.9, { op: opFull });
    const coreFull = await ev(cdp, sessionId, `getComputedStyle(document.querySelector('.hero-card .btn .gx-veil'), '::after').opacity`);
    check('A9 高光核（::after）点亮', Number(coreFull) > 0.9, { core: coreFull });
    const rimBand = await ev(cdp, sessionId, `getComputedStyle(document.querySelector('.hero-card .btn .gx-veil'), '::before').opacity`);
    check('A10 棱边高光带（::before）有点亮', Number(rimBand) > 0, { rim: rimBand });

    await go(cdp, sessionId, BASE + '/?motion=light');
    await hover(cdp, sessionId, '.hero-card .btn', 0);
    await sleep(2600);
    const opLight = await ev(cdp, sessionId, `getComputedStyle(document.querySelector('.hero-card .btn .gx-veil')).opacity`);
    check('A11 轻量档：光斑按 --m-spot 收力（0.7）', Math.abs(Number(opLight) - 0.7) < 0.06, { op: opLight });

    /* ================= B. 筛选：28px 滑条 + 进出场 + FLIP ================= */
    await go(cdp, sessionId, BASE + '/projects/?motion=full');
    const bar0 = await ev(cdp, sessionId, `(() => {
      var bar = document.querySelector('.filter-bar');
      var chip = document.querySelector('.filter-chip.is-active');
      var r = bar.getBoundingClientRect();
      var m = /translate3d\\(([-0-9.]+)px/.exec(bar.style.transform);
      return { w: Math.round(r.width), inline: bar.style.width, chip: chip.getAttribute('data-filter'),
        x: m ? Number(m[1]) : null,
        expectX: chip.offsetLeft + (chip.offsetWidth - Math.min(chip.offsetWidth, 28)) / 2,
        hasBar: document.querySelector('.filter-row').classList.contains('has-bar') };
    })()`);
    check('B1 选中滑条存在且是 28px', bar0.w === 28 && bar0.inline === '28px', bar0);
    check('B2 滑条落在活动芯片下方', Math.abs(bar0.x - bar0.expectX) < 1.5, bar0);
    check('B3 滑条容器已标记可见', bar0.hasBar === true);

    /* 采样器：headless 帧率只有几帧/秒，动画转瞬即逝，
       轮询记录每张卡片身上出现过的关键帧，事后才能断言"当时放了什么动画"。 */
    const SAMPLER = `(() => {
      window.__kf = {};
      if (window.__kfTimer) clearInterval(window.__kfTimer);
      window.__kfTimer = setInterval(function () {
        var cards = document.querySelectorAll('[data-project-grid] .project-card');
        for (var i = 0; i < cards.length; i++) {
          var anims = cards[i].getAnimations();
          for (var j = 0; j < anims.length; j++) {
            var e = anims[j].effect;
            if (!e || !e.getKeyframes) continue;
            var kf = e.getKeyframes();
            var t = kf.length ? kf[0].transform : null;
            if (!t) continue;
            var t1 = kf.length > 1 ? kf[kf.length - 1].transform : null;
            var tag = t + ' => ' + (t1 || 'none');
            if (!window.__kf[i]) window.__kf[i] = [];
            if (window.__kf[i].indexOf(tag) < 0) window.__kf[i].push(tag);
          }
        }
      }, 50);
      return 1;
    })()`;

    /* 点"私有"：公开卡片退场，私有卡片上移（FLIP） */
    await ev(cdp, sessionId, SAMPLER);
    await ev(cdp, sessionId, `document.querySelector('[data-filter="private"]').click()`);
    await sleep(3200);
    const privState = await ev(cdp, sessionId, `(() => {
      var grid = document.querySelector('[data-project-grid]');
      var cards = [].slice.call(grid.querySelectorAll('.project-card'));
      var shown = cards.filter(function (c) { return !c.classList.contains('is-hidden'); });
      var tags = [];
      for (var k in window.__kf) { tags = tags.concat(window.__kf[k]); }
      return { shown: shown.length, hidden: cards.length - shown.length, tags: tags, per: window.__kf };
    })()`);
    check('B4 筛选后可见/隐藏数量正确', privState.shown === 3 && privState.hidden === 3, privState);
    const flipTags = privState.tags.filter((t) => t.indexOf('translate(') >= 0);
    check('B5 留下的卡片有 FLIP 位移动画', flipTags.length > 0, { n: flipTags.length, tags: privState.tags });
    check('B6 FLIP 末帧回到 none（卡片精确落位）',
      flipTags.length > 0 && flipTags.every((t) => /=>\s*none$/.test(t)), flipTags);

    /* 再点"全部"：公开卡片是"进场"（之前被隐藏过）——
       进场只能淡入+轻微放大，绝不能从文档原点飞进来（那是没有旧位置时误用空矩形当旧位置的老 bug） */
    await ev(cdp, sessionId, `(() => { window.__kf = {}; document.querySelector('[data-filter="all"]').click(); return 1; })()`);
    await sleep(3200);
    const enterState = await ev(cdp, sessionId, `(() => {
      var grid = document.querySelector('[data-project-grid]');
      var cards = [].slice.call(grid.querySelectorAll('.project-card'));
      var shown = cards.filter(function (c) { return !c.classList.contains('is-hidden'); });
      var enterIdx = -1;
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-visibility') === 'public') { enterIdx = i; break; }
      }
      return {
        shown: shown.length,
        hidden: cards.length - shown.length,
        enterIdx: enterIdx,
        enterTags: (window.__kf && window.__kf[enterIdx]) || []
      };
    })()`);
    check('B7 进场卡片有缩放淡入动画',
      enterState.enterTags.some((t) => t.indexOf('scale(0.97)') >= 0), enterState.enterTags);
    /* 进场只允许本地小幅位移（升起 16px）。从文档原点飞进来会留下上百/上千像素的位移，
       那正是"隐藏卡片量出空矩形当旧位置"的老 bug。 */
    const enterShifts = enterState.enterTags.filter((t) => t.indexOf('translate') >= 0).map((t) => {
      const m = /translate(?:3d|Y|X)?\((-?[\d.]+)px(?:,\s*(-?[\d.]+)px)?/.exec(t);
      return m ? { x: Number(m[1] || 0), y: Number(m[2] || 0) } : { x: 0, y: 0 };
    });
    check('B8 进场卡片不是从原点飞进来（位移不超过本地尺度 64px）',
      enterShifts.every((s) => Math.abs(s.x) <= 64 && Math.abs(s.y) <= 64), enterShifts);

    const settled = await ev(cdp, sessionId, `(() => {
      var bar = document.querySelector('.filter-bar');
      var chip = document.querySelector('.filter-chip.is-active');
      var inline = bar.style.transform;
      var m = /translate3d\\(([-0-9.]+)px/.exec(inline);
      return {
        inline: inline, x: m ? Number(m[1]) : null,
        expectX: chip.offsetLeft + (chip.offsetWidth - Math.min(chip.offsetWidth, 28)) / 2,
        hidden: document.querySelectorAll('.project-card.is-hidden').length,
        barW: bar.getBoundingClientRect().width
      };
    })()`);
    check('B9 滑条跟着新芯片移动', settled.x !== null && Math.abs(settled.x - settled.expectX) < 1.5, settled);
    check('B10 滑条宽度仍是 28px', settled.barW === 28, settled);

    /* ================= C. 复制状态：转圈 → 对勾 → 复原 ================= */
    await go(cdp, sessionId, BASE + '/?motion=full');
    await ev(cdp, sessionId, `(() => {
      var real = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: function (t) { return new Promise(function (res, rej) { setTimeout(function () { real ? real(t).then(res, rej) : res(); }, 500); }); }
      } });
      return 1;
    })()`);
    await ev(cdp, sessionId, `document.querySelector('.chip-copy').click()`);
    await sleep(150);
    const busy = await ev(cdp, sessionId, `(() => {
      var b = document.querySelector('.chip-copy');
      return { busy: b.getAttribute('aria-busy'), spin: !!b.querySelector('.ic-spin') };
    })()`);
    check('C1 复制进行中：按钮标记 busy', busy.busy === '1', busy);
    check('C2 复制进行中：图标换成转圈', busy.spin === true, busy);
    await sleep(1200);
    const done = await ev(cdp, sessionId, `(() => {
      var b = document.querySelector('.chip-copy');
      return { isDone: b.classList.contains('is-done'), ok: !!b.querySelector('.ic-ok'),
        spin: !!b.querySelector('.ic-spin'), label: b.getAttribute('aria-label') };
    })()`);
    check('C3 复制成功：图标变成对勾', done.ok === true && done.spin === false, done);
    check('C4 复制成功：按钮进入完成态', done.isDone === true, done);
    check('C5 复制成功：读屏标签同步', done.label === '已复制', done);
    await sleep(2200);
    const restored = await ev(cdp, sessionId, `(() => {
      var b = document.querySelector('.chip-copy');
      return { ok: !!b.querySelector('.ic-ok'), spin: !!b.querySelector('.ic-spin'),
        isDone: b.classList.contains('is-done'), label: b.getAttribute('aria-label'),
        icon: !!b.querySelector('.ic') };
    })()`);
    check('C6 1.6 秒后按钮复原', restored.ok === false && restored.isDone === false && restored.icon === true, restored);
    check('C7 复原后标签还原', restored.label !== '已复制', restored);

    /* ================= D. 图标 / 链接 / 加载 ================= */
    await go(cdp, sessionId, BASE + '/projects/guessword?motion=full');
    const iconCls = await ev(cdp, sessionId, `(() => {
      var next = document.querySelector('.btn .ic-next');
      var back = document.querySelector('.backlink .ic-back');
      var ext = document.querySelector('.btn .ic-ext');
      return { next: !!next, back: !!back, ext: !!ext };
    })()`);
    check('D1 方向图标带语义类（可做微动）', iconCls.next && iconCls.back && iconCls.ext, iconCls);

    /* 图标轻推幅度 = --m-dist-1 的一半：满档 3px、轻档 1.5px（跟着令牌走，不另立数字） */
    const nudgeOf = async (url) => {
      await go(cdp, sessionId, url);
      await hover(cdp, sessionId, '.btn .ic-next', 0);
      await sleep(2000);
      return ev(cdp, sessionId, `getComputedStyle(document.querySelector('.btn .ic-next')).transform`);
    };
    const nudgeFull = await nudgeOf(BASE + '/projects/guessword?motion=full');
    const tx = /matrix\(1, 0, 0, 1, (-?[\d.]+),/.exec(nudgeFull || '');
    check('D5 满档：按钮箭头悬停右推 3px', !!tx && Math.abs(Number(tx[1]) - 3) < 0.2, { transform: nudgeFull });
    const nudgeLight = await nudgeOf(BASE + '/projects/guessword?motion=light');
    const txL = /matrix\(1, 0, 0, 1, (-?[\d.]+),/.exec(nudgeLight || '');
    check('D6 轻档：箭头轻推减半（1.5px）', !!txL && Math.abs(Number(txL[1]) - 1.5) < 0.2, { transform: nudgeLight });
    await go(cdp, sessionId, BASE + '/projects/guessword?motion=full');

    const spinRule = await ev(cdp, sessionId, `(() => {
      var st = document.createElement('style');
      st.textContent = '.x{color:red}';
      return 1;
    })()`);
    const animNames = await ev(cdp, sessionId, `(() => {
      var el = document.createElement('div');
      el.className = 'ic ic-spin';
      document.body.appendChild(el);
      var n = getComputedStyle(el).animationName;
      el.remove();
      return n;
    })()`);
    check('D2 加载指示有转圈动画', animNames === 'spin', { anim: animNames });

    await go(cdp, sessionId, BASE + '/blog/ui-components.html?motion=full');
    const linkIdle = await ev(cdp, sessionId, `(() => {
      var a = document.querySelector('.prose a');
      if (!a) return null;
      var cs = getComputedStyle(a);
      var r = a.getBoundingClientRect();
      return { size: cs.backgroundSize, deco: cs.textDecorationLine, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    check('D3 正文链接有下划线扫出效果（初始宽度 0）', linkIdle && linkIdle.size.indexOf('0%') === 0, linkIdle);
    if (linkIdle) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: linkIdle.x, y: linkIdle.y, buttons: 0 }, sessionId);
      await sleep(2600);
      const linkHover = await ev(cdp, sessionId, `getComputedStyle(document.querySelector('.prose a')).backgroundSize`);
      check('D4 悬停后下划线扫出（宽度 100%）', linkHover.indexOf('100%') === 0, { size: linkHover });
    }

    const passed = results.filter((r) => r.pass).length;
    fs.mkdirSync('_perf', { recursive: true });
    fs.writeFileSync('_perf/interact-test.json', JSON.stringify(results, null, 2));
    console.log(`\nP3 GX 光斑与微交互：${passed}/${results.length} 条通过`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    kill();
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
