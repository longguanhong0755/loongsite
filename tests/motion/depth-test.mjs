/* P2 验收：首屏标题分层入场 + 景深视差（首页 / 项目详情）。
   用法：BASE=http://127.0.0.1:8090 node --experimental-websocket tests/motion/depth-test.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:8090';
const CDP_PORT = Number(process.env.CDP || 9404);
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

async function go(cdp, sessionId, url) {
  const load = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url }, sessionId);
  await Promise.race([load, sleep(15000)]);
  await sleep(500);
}

/* 立刻把页面滚到指定位置（绕开平滑滚动），等一帧让调度器跑完 */
const SCROLL_TO = (y) => `(() => {
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.scrollTop = ${y};
  return new Promise(function (res) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { res(window.scrollY); }); });
  });
})()`;

async function run() {
  const prof = fs.mkdtempSync('/tmp/loongdepth-');
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

    /* ---------- 1. 标题分层：拆字符 + 无障碍 + 错峰 ---------- */
    await go(cdp, sessionId, BASE + '/?motion=full');
    const split = await ev(cdp, sessionId, `(() => {
      var h = document.querySelector('.hero-name');
      var cs = getComputedStyle(document.documentElement);
      var chs = [].slice.call(h.querySelectorAll('.ch'));
      return {
        hasSplit: h.hasAttribute('data-split'),
        text: h.getAttribute('aria-label'),
        n: chs.length,
        hidden: chs.every(function (c) { return c.getAttribute('aria-hidden') === 'true'; }),
        idx: chs.map(function (c) { return c.style.getPropertyValue('--ch-i'); }),
        chars: chs.map(function (c) { return c.textContent; }),
        delays: chs.map(function (c) { return getComputedStyle(c).animationDelay; }),
        dur: chs.length ? getComputedStyle(chs[0]).animationDuration : null,
        name: chs.length ? getComputedStyle(chs[0]).animationName : null,
        stagger: cs.getPropertyValue('--m-stagger').trim(),
        layerRatio: cs.getPropertyValue('--hero-layer-ratio').trim(),
        charRatio: cs.getPropertyValue('--hero-char-ratio').trim(),
        dur3: cs.getPropertyValue('--m-dur-3').trim(),
        hi: getComputedStyle(document.querySelector('.hero-name')).getPropertyValue('--hi').trim()
      };
    })()`);
    check('标题已拆成字符', split.hasSplit && split.n === split.chars.length && split.n > 1, { n: split.n });
    check('字符内容拼回原名', split.chars.join('') === split.text, split.chars);
    check('无障碍：h1 留 aria-label', !!split.text && split.text.length > 0, split.text);
    check('无障碍：字符块 aria-hidden', split.hidden, split.hidden);
    check('字符序号递增且从 0 开始', split.idx.join(',') === split.idx.map((_, i) => String(i)).join(','), split.idx);
    check('字符错峰：延迟逐个变大', split.delays.every((d, i) => i === 0 || parseFloat(d) > parseFloat(split.delays[i - 1])), split.delays);
    const step = parseFloat(split.delays[1]) - parseFloat(split.delays[0]);
    const expectStep = parseFloat(split.stagger) * parseFloat(split.charRatio);
    check('字符错峰步长 = --m-stagger × --hero-char-ratio', Math.abs(step - expectStep) < 0.002, { step, expectStep });
    check('标题动画时长 = --m-dur-3', split.dur === split.dur3, { dur: split.dur, dur3: split.dur3 });
    check('完整档：字符带 3D 倾斜入场', split.name === 'ch-in', split.name);

    /* 拆字符不能改排版：先把入场动画直接推到终点，再量落位后的排版。
       headless 帧率低时 sleep 不可靠，动画停在 3D 中间态会把投影宽度量歪。 */
    await ev(cdp, sessionId, `(() => {
      var list = document.querySelectorAll('.hero-name .ch, .hero-main > *, .hero-avatar, .stats-strip, .scroll-cue');
      for (var i = 0; i < list.length; i++) {
        var as = list[i].getAnimations ? list[i].getAnimations() : [];
        for (var j = 0; j < as.length; j++) { try { as[j].finish(); } catch (e) {} }
      }
    })()`);
    await sleep(80);
    const layout = await ev(cdp, sessionId, `(() => {
      var h = document.querySelector('.hero-name');
      var cs = getComputedStyle(h);
      var probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0';
      probe.style.fontSize = cs.fontSize;
      probe.style.fontWeight = cs.fontWeight;
      probe.style.fontFamily = cs.fontFamily;
      probe.style.letterSpacing = cs.letterSpacing;
      probe.textContent = h.getAttribute('aria-label');
      document.body.appendChild(probe);
      var plain = probe.getBoundingClientRect().width;
      probe.remove();
      var split = 0;
      [].forEach.call(h.querySelectorAll('.ch'), function (c) { split += c.getBoundingClientRect().width; });
      return { split: split, plain: plain,
               overflow: document.documentElement.scrollWidth - window.innerWidth };
    })()`);
    check('拆字符不改排版：宽度与未拆一致', Math.abs(layout.split - layout.plain) < 1.5, layout);
    check('拆字符不产生横向溢出', layout.overflow <= 0, layout);

    /* 层间错峰：层号 × --m-stagger × --hero-layer-ratio */
    const layers = await ev(cdp, sessionId, `(() => {
      function d(sel) { var el = document.querySelector(sel); return el ? getComputedStyle(el).animationDelay : null; }
      var firstCh = document.querySelector('.hero-name .ch');
      return { eyebrow: d('.hero-eyebrow'), name: firstCh ? getComputedStyle(firstCh).animationDelay : null,
               title: d('.hero-title'), tagline: d('.hero-tagline'), contacts: d('.hero-contacts'),
               avatar: d('.hero-avatar'), stats: d('.stats-strip'), cue: d('.scroll-cue') };
    })()`);
    const st = parseFloat(split.stagger), lr = parseFloat(split.layerRatio);
    check('层间错峰按令牌算（名字 = 2 层）', Math.abs(parseFloat(layers.name) - 2 * st * lr) < 0.002, { name: layers.name, expect: 2 * st * lr });
    check('层间错峰按令牌算（眉标 = 1 层）', Math.abs(parseFloat(layers.eyebrow) - 1 * st * lr) < 0.002, layers.eyebrow);
    check('层间错峰按令牌算（头衔 = 3 层）', Math.abs(parseFloat(layers.title) - 3 * st * lr) < 0.002, layers.title);
    check('层间错峰递增', parseFloat(layers.eyebrow) < parseFloat(layers.name) &&
      parseFloat(layers.name) < parseFloat(layers.title) &&
      parseFloat(layers.title) < parseFloat(layers.tagline) &&
      parseFloat(layers.tagline) < parseFloat(layers.contacts), layers);

    /* ---------- 2. 视差：首页 ---------- */
    await go(cdp, sessionId, BASE + '/?motion=full');
    const before = await ev(cdp, sessionId, `(() => {
      var s = document.querySelector('[data-parallax]');
      return { px: s.style.getPropertyValue('--px'),
               card: getComputedStyle(document.querySelector('.hero-card')).translate,
               cue: getComputedStyle(document.querySelector('.scroll-cue')).translate };
    })()`);
    check('首页有视差作用域', before.px !== undefined);
    check('未滚动时视差为 0', parseFloat(before.px) === 0 && before.card === '0px', before);

    const y = await ev(cdp, sessionId, SCROLL_TO(320));
    const after = await ev(cdp, sessionId, `(() => {
      var s = document.querySelector('[data-parallax]');
      return { px: parseFloat(s.style.getPropertyValue('--px')),
               card: getComputedStyle(document.querySelector('.hero-card')).translate,
               cue: getComputedStyle(document.querySelector('.scroll-cue')).translate,
               cardF: getComputedStyle(document.querySelector('.hero-card')).getPropertyValue('--px-f').trim() };
    })()`);
    check('滚动后 --px 变成 0~1 的进度', after.px > 0 && after.px <= 1, { px: after.px, y });
    const cardTravel = Math.abs(parseFloat(after.card.split(' ')[1]));
    check('卡片行程 = 进度 × --px-f', Math.abs(cardTravel - after.px * parseFloat(after.cardF)) < 0.5, { cardTravel, px: after.px, f: after.cardF });
    check('卡片行程比提示语大（层次分开了）', cardTravel > 10, cardTravel);
    const cueTravel = Math.abs(parseFloat(after.cue.split(' ')[1]));
    check('提示语与卡片错速（两层分离）', Math.abs(cardTravel - cueTravel) > 5, { cardTravel, cueTravel });

    /* 视差写 translate 不写 transform：静止卡片不建 3D 图层（避免文字反复栅格化），
       悬停写 --rx/--ry 时仍与视差叠加。 */
    const compose = await ev(cdp, sessionId, `(() => {
      var card = document.querySelector('.hero-card');
      return { translate: getComputedStyle(card).translate, transform: getComputedStyle(card).transform };
    })()`);
    check('视差只写 translate；静止卡片不建 3D 层', compose.translate !== 'none' && compose.transform === 'none', compose);
    const composeTilt = await ev(cdp, sessionId, `(() => {
      var card = document.querySelector('.hero-card');
      var prev = card.style.transition;
      card.style.transition = 'none';
      card.style.setProperty('--rx', '4deg');
      card.style.setProperty('--ry', '-3deg');
      var cs = getComputedStyle(card);
      var out = { translate: cs.translate, transform: cs.transform };
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
      card.style.transition = prev;
      return out;
    })()`);
    check('视差与悬停 3D 倾斜可叠加', composeTilt.translate !== 'none' && /^matrix3d\(/.test(composeTilt.transform), composeTilt);

    /* ---------- 3. 轻量档：视差关掉、字符不带 3D ---------- */
    await go(cdp, sessionId, BASE + '/?motion=light');
    await ev(cdp, sessionId, SCROLL_TO(320));
    const light = await ev(cdp, sessionId, `(() => {
      var s = document.querySelector('[data-parallax]');
      var ch = document.querySelector('.hero-name .ch');
      return { tier: document.documentElement.getAttribute('data-motion'),
               px: s.style.getPropertyValue('--px'),
               card: getComputedStyle(document.querySelector('.hero-card')).translate,
               name: ch ? getComputedStyle(ch).animationName : null };
    })()`);
    check('轻量档：视差整体不动', light.card === '0px' || light.card === 'none', light);
    check('轻量档：字符不做 3D 倾斜', light.name === 'ch-in-flat', light.name);

    /* ---------- 4. 项目详情页也有视差 ---------- */
    await go(cdp, sessionId, BASE + '/projects/guessword?motion=full');
    const d0 = await ev(cdp, sessionId, `(() => {
      var s = document.querySelector('[data-parallax]');
      return { has: !!s, px: s ? s.style.getPropertyValue('--px') : null,
               tf: s ? getComputedStyle(s).translate : null };
    })()`);
    check('详情页有视差作用域', d0.has, d0);
    await ev(cdp, sessionId, SCROLL_TO(260));
    const d1 = await ev(cdp, sessionId, `(() => {
      var s = document.querySelector('[data-parallax]');
      return { px: parseFloat(s.style.getPropertyValue('--px')), tf: getComputedStyle(s).translate };
    })()`);
    const dTravel = Math.abs(parseFloat(d1.tf.split(' ')[1]));
    check('详情页滚动后视差生效', d1.px > 0 && dTravel > 5, { px: d1.px, travel: dTravel });

    /* ---------- 5. 其它页面不挂视差 ---------- */
    await go(cdp, sessionId, BASE + '/blog/?motion=full');
    const blog = await ev(cdp, sessionId, `({ scope: !!document.querySelector('[data-parallax]') })`);
    check('博客列表页没有视差作用域', blog.scope === false, blog);

    const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '_perf');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'depth-test.json'), JSON.stringify({ results }, null, 2));
    const fails = results.filter((x) => !x.pass);
    console.log(`\nP2 分层入场与景深视差：${results.length - fails.length}/${results.length} 条通过`);
    if (fails.length) process.exitCode = 1;
  } finally {
    await sleep(200);
    kill();
  }
}

run().catch((e) => { console.error('运行失败：', e.message); process.exitCode = 1; });
