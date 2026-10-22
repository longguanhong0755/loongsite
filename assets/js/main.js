(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- 主题切换 ---------- */
  var toggles = document.querySelectorAll('[data-theme-toggle]');

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncButtons(t) {
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute('aria-pressed', String(t === 'dark'));
      toggles[i].setAttribute('title', t === 'dark' ? '切换到浅色' : '切换到深色');
    }
  }

  function apply(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    syncButtons(t);
  }

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- 动效分级 + 统一调度 ----------
     档位（full / light）由 head 里的内联脚本在首绘前写好 data-motion，数值全部住在
     --m-* 令牌里：这里只把令牌读给 WAAPI/JS 动画用，并把所有按帧任务合批成一条 rAF
     （页面隐藏时不跑，回到前台再补一帧，避免后台标签页空转）。
     JS 里不出现第二套时长/位移数字——要改数值改 design.tokens.json。 */
  var Motion = (function () {
    var cache = {};
    function raw(name) {
      if (cache[name] === undefined) {
        var v = '';
        try { v = getComputedStyle(root).getPropertyValue('--m-' + name).trim(); } catch (e) {}
        cache[name] = v;
      }
      return cache[name];
    }
    function num(name) {
      var v = parseFloat(raw(name));
      return isFinite(v) ? v : 0;
    }
    var tasks = [];
    var frameId = 0;
    function flush() {
      frameId = 0;
      if (document.hidden) return;              /* 隐藏时任务留在队列，回前台再排空 */
      var list = tasks;
      tasks = [];
      for (var i = 0; i < list.length; i++) list[i].fn();
    }
    function pump() {
      if (!frameId) frameId = window.requestAnimationFrame(flush);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && tasks.length) pump();
    });
    return {
      /* 同一个 key 一帧内只登记一次：多个 scroll/pointer 回调合批 */
      frame: function (key, fn) {
        for (var i = 0; i < tasks.length; i++) { if (tasks[i].key === key) return; }
        tasks.push({ key: key, fn: fn });
        pump();
      },
      tier: function () { return root.getAttribute('data-motion') === 'light' ? 'light' : 'full'; },
      isFull: function () { return root.getAttribute('data-motion') !== 'light'; },
      dur: function (slot) { return Math.round(num('dur-' + slot) * 1000); },     /* ms，给 WAAPI */
      dist: function (slot) { return num('dist-' + slot); },                       /* px */
      stagger: function () { return num('stagger'); },                            /* s，逐项错峰步长 */
      parallax: function () { return num('parallax'); },                          /* 0 = 关掉景深 */
      spot: function () { return num('spot'); }                                  /* 光斑强度系数 */
    };
  })();
  window.LSMotion = Motion;

  /* 主题切换：从主题按钮位置做整页圆形揭示（View Transition）。
     旧页面先冻结成快照，换主题后用 520ms 的 clip-path 圆揭开新页面；
     换肤期间 <html> 带 .vt-theme，悬停熄灯逻辑会跳过（浮层会伪造 pointerleave）。
     这是本站点名的效果，与背景粒子/头像涟漪一致：不因系统"减弱动态效果"跳过。
     连续点击用 run 令牌保证只有最后一场能摘掉 .vt-theme；
     兜底只在 ready 4s 不来、或揭示开始 1.6s 后仍未结束时介入，
     避免把慢机器准备快照的时间误当成卡死、把动画提前掐掉。 */
  var themeRun = 0;
  var themePending = null;
  function flipTheme(btn) {
    var next = (themePending || current()) === 'dark' ? 'light' : 'dark';
    themePending = next;
    if (!document.startViewTransition) {
      themePending = null;
      apply(next);
      return;
    }
    var x = window.innerWidth - 44;
    var y = 36;
    if (btn && btn.getBoundingClientRect) {
      var r = btn.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    var far = Math.sqrt(Math.max(x, window.innerWidth - x) * Math.max(x, window.innerWidth - x)
      + Math.max(y, window.innerHeight - y) * Math.max(y, window.innerHeight - y));
    var run = ++themeRun;
    root.classList.add('vt-theme');
    var tr;
    try {
      tr = document.startViewTransition(function () { apply(next); });
    } catch (e) {
      themePending = null;
      root.classList.remove('vt-theme');
      apply(next);
      return;
    }
    var settled = false;
    var guard = 0;
    var finish = function () {
      if (run !== themeRun || settled) return;
      settled = true;
      window.clearTimeout(guard);
      themePending = null;
      root.classList.remove('vt-theme');
    };
    guard = window.setTimeout(function () {
      if (run !== themeRun || settled) return;
      try { tr.skipTransition(); } catch (e) {}
      apply(next);
      finish();
    }, 4000);
    tr.ready.then(function () {
      if (run !== themeRun || settled) return;
      try {
        root.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + far + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 520, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      } catch (e) {}
      window.clearTimeout(guard);
      guard = window.setTimeout(function () {
        if (run !== themeRun || settled) return;
        try { tr.skipTransition(); } catch (e) {}
        finish();
      }, 1600);
    }).catch(function () { finish(); });
    tr.finished.then(finish, finish);
  }

  for (var k = 0; k < toggles.length; k++) {
    toggles[k].addEventListener('click', function () { flipTheme(this); });
  }
  syncButtons(current());

  /* 未手动选择时跟随系统 */
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  if (!stored && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      var s = null;
      try { s = localStorage.getItem('theme'); } catch (err) {}
      if (!s) {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        syncButtons(e.matches ? 'dark' : 'light');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* 元素在视口里的可见比例；rootBottom 用来复现 IntersectionObserver 的 rootMargin */
  function visibleRatio(el, rootBottom) {
    var r = el.getBoundingClientRect();
    if (!r.height) return 0;
    var v = Math.min(r.bottom, rootBottom) - Math.max(r.top, 0);
    return v > 0 ? v / r.height : 0;
  }

  /* ---------- 入场动效：从下方滚入的块缓缓浮上来；往上翻（从上方进入）直接显示 ----------
     块滚出视口后收起，之后每次从下方重新滑入都会再浮现一次（可重播） */
  var reveals = document.querySelectorAll('.reveal');
  /* 首屏块必须在首绘之前就位：跨页过渡取的是新文档的第一帧，而 IntersectionObserver 的
     首次回调晚于首绘——慢一步就是"淡进一张空白页、内容再逐块长出来"，像重新打开了一个网站。
     判定门槛与下面 io 的 rootMargin(-6%) / threshold(0.04) 对齐，否则会"先显后隐"闪一下 */
  var firstScreen = [];
  if ('IntersectionObserver' in window && reveals.length) {
    var revRoot = window.innerHeight * 0.94;
    for (var fs = 0; fs < reveals.length; fs++) {
      if (visibleRatio(reveals[fs], revRoot) >= 0.04) {
        reveals[fs].classList.add('is-in', 'no-rise');
        firstScreen.push(reveals[fs]);
      }
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var el = en.target;
        var k = firstScreen.indexOf(el);
        if (!en.isIntersecting) {
          /* 离开视口：收起，下次进入时按方向重新判定（从下方回来 → 重放浮现） */
          if (k > -1) firstScreen.splice(k, 1);  /* 真正滚出屏幕后才交还给常规入场 */
          el.classList.remove('is-in');
          return;
        }
        if (k > -1) return;                      /* 首屏已就位的块不重播入场 */
        if (en.boundingClientRect.top < 0) {
          el.classList.add('no-rise');    /* 从上方进入（往回翻 / 锚点直达）→ 直接显示，不做入场 */
        } else {
          el.classList.remove('no-rise'); /* 从下方进入 → 浮现（重播） */
        }
        el.classList.add('is-in');
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    reveals.forEach(function (el) { io.observe(el); });

    /* 保险：滚到页面底部仍有块未显示时，补一次显影（避免内容一直空白） */
    var sweep = function () {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 4) return;
      var rest = document.querySelectorAll('.reveal:not(.is-in)');
      for (var s = 0; s < rest.length; s++) {
        var r = rest[s].getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) rest[s].classList.add('is-in');
      }
    };
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('load', sweep);
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- 代码复制 ---------- */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.querySelector(btn.getAttribute('data-copy'));
      if (!target) return;
      var text = target.textContent || '';

      function done() {
        var old = btn.innerHTML;
        btn.classList.add('is-done');
        btn.textContent = '已复制';
        setTimeout(function () {
          btn.classList.remove('is-done');
          btn.innerHTML = old;
        }, 1600);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  });

  /* ---------- 轻提示（复制邮箱 / 行链接等共用） ---------- */
  var toastEl = document.querySelector('[data-toast]');
  var toastText = document.querySelector('[data-toast-text]');
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl || !toastText) return;
    toastText.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2000);
  }

  /* ---------- 页脚本地时钟（固定 Asia/Shanghai，不随访客时区变） ---------- */
  var clockNums = document.querySelectorAll('[data-clock]');
  if (clockNums.length) {
    var clockFmt = null;
    try {
      clockFmt = new Intl.DateTimeFormat('en-GB', { hour12: false, timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { clockFmt = null; }
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var tickClock = function () {
      var s;
      if (clockFmt) { s = clockFmt.format(new Date()); }
      else { var d = new Date(); s = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
      for (var i = 0; i < clockNums.length; i++) clockNums[i].textContent = s;
    };
    tickClock();
    setInterval(tickClock, 1000);
    var clockWraps = document.querySelectorAll('[data-clock-wrap]');
    for (var w = 0; w < clockWraps.length; w++) clockWraps[w].removeAttribute('hidden');
  }

  /* ---------- 滚动状态：顶部进度条 / 导航压缩 / 回顶按钮 ---------- */
  var bar = document.querySelector('[data-progress]');
  var navWrap = document.querySelector('.nav-wrap');
  var toTop = document.querySelector('[data-to-top]');

  function onScrollNow() {
    var doc = document.documentElement;
    var sy = window.pageYOffset || doc.scrollTop || 0;
    if (bar) {
      var max = doc.scrollHeight - window.innerHeight;
      var show = max > 320;
      bar.classList.toggle('is-on', show);
      if (show) bar.firstElementChild.style.transform = 'scaleX(' + Math.min(1, Math.max(0, sy / max)).toFixed(4) + ')';
    }
    if (navWrap) navWrap.classList.toggle('is-scrolled', sy > 10);
    if (toTop) toTop.classList.toggle('is-on', sy > 900);
  }

  function onScroll() {
    Motion.frame('scroll', onScrollNow);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScrollNow();

  /* ---------- 文章目录：随滚动高亮当前小节 ---------- */
  var tocLinks = [].slice.call(document.querySelectorAll('[data-toc] a[href^="#"]'));
  if (tocLinks.length) {
    var pageTop = function () { return window.pageYOffset || document.documentElement.scrollTop || 0; };
    var tocItems = tocLinks.map(function (a) {
      return { a: a, el: document.getElementById(a.getAttribute('href').slice(1)) };
    }).filter(function (it) { return it.el; });
    var syncToc = function () {
      var y = pageTop() + 120;
      var active = null;
      for (var i = 0; i < tocItems.length; i++) {
        if (tocItems[i].el.getBoundingClientRect().top + pageTop() <= y) active = tocItems[i];
      }
      var activeHref = active ? active.a.getAttribute('href') : '';
      for (var j = 0; j < tocItems.length; j++) {
        tocItems[j].a.classList.toggle('is-active', tocItems[j].a.getAttribute('href') === activeHref);
      }
    };
    var tocOnScroll = function () {
      Motion.frame('toc', syncToc);
    };
    window.addEventListener('scroll', tocOnScroll, { passive: true });
    window.addEventListener('resize', tocOnScroll);
    syncToc();
  }

  if (toTop) {
    toTop.addEventListener('click', function () {
      try { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    });
  }

  /* 跨页过渡激活时打标记：入场编排据此跳过，避免与过渡动画打架。
     到达时整页从上方落位，落位结束后再让首屏块错峰浮上来。 */
  window.addEventListener('pagereveal', function (e) {
    if (!e || !e.viewTransition) return;
    root.classList.add('vt-active', 'vt-arrive');
    var blocks = document.querySelectorAll('.reveal.is-in.no-rise');
    for (var b = 0; b < blocks.length; b++) {
      blocks[b].style.setProperty('--rise-i', String(b));
    }
    var settle = function () { root.classList.add('vt-settle'); };
    if (e.viewTransition.finished && e.viewTransition.finished.then) {
      e.viewTransition.finished.then(settle, settle);
    } else {
      window.setTimeout(settle, 500);
    }
  });

  /* ---------- 数字滚动（首屏统计 / 项目指标） ---------- */
  var countEls = document.querySelectorAll('[data-count]');
  if (countEls.length) {
    var runCount = function (el) {
      var to = parseInt((el.getAttribute('data-count') || '0').replace(/,/g, ''), 10) || 0;
      var suf = el.getAttribute('data-count-suffix') || '';
      var grp = el.getAttribute('data-count-group') === '1';
      var fmt = function (n) { return grp ? n.toLocaleString('en-US') : String(n); };
      if (to <= 0) { el.textContent = fmt(to) + suf; return; }
      var t0 = null;
      var step = function (ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / 900);
        var e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(to * e)) + suf;
        if (k < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };
    /* 首屏数字保留服务端渲染的终值：归零再滚动是"刚打开一个网站"的信号，
       而跨页过渡抓的正是这一帧，淡进来会先看到一串 0 */
    var countNow = [];
    for (var c0 = 0; c0 < countEls.length; c0++) {
      if (visibleRatio(countEls[c0], window.innerHeight) >= 0.4) { countNow.push(countEls[c0]); continue; }
      countEls[c0].textContent = '0' + (countEls[c0].getAttribute('data-count-suffix') || '');
    }
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (ens) {
        ens.forEach(function (en) {
          if (!en.isIntersecting) return;
          cio.unobserve(en.target);
          if (countNow.indexOf(en.target) > -1) return;  /* 首屏就位的数字不滚动 */
          runCount(en.target);
        });
      }, { threshold: 0.4 });
      countEls.forEach(function (el) { cio.observe(el); });
    } else {
      countEls.forEach(runCount);
    }
  }

  /* ---------- 玻璃面（GX v3）：一束全局光 + 玻璃显影 + 轻微倾斜 ---------- */
  var GX_SEL = '.glass, .btn, .icon-btn, .chip-copy, .path-copy, .filter-chip, .term-chip';
  var GX_TILT = '.hero-card, .project-card, .site-card, .skill-card, .contact-card';
  var gxHosts = document.querySelectorAll(GX_SEL);
  for (var g0 = 0; g0 < gxHosts.length; g0++) {
    var gh = gxHosts[g0];
    if (gh.classList.contains('gx')) continue;
    if (window.getComputedStyle(gh).position === 'static') gh.style.position = 'relative';
    gh.classList.add('gx');
    if (gh.matches && gh.matches(GX_TILT)) gh.classList.add('gx-tilt');
    var veil = document.createElement('i');
    veil.className = 'gx-veil';
    veil.setAttribute('aria-hidden', 'true');
    gh.insertBefore(veil, gh.firstChild);
  }

  if (gxHosts.length) {
    /* 一束全局光：光只有一束（鼠标位置），玻璃块显影：
       —— .gx-lit：光标半径内的所有玻璃块（含嵌套外层与相邻块 → 余光，CSS 里降为半透明）
       —— .gx-hot：光标正下方的悬停链（目标元素 + 其所有外层玻璃块）→ 另加整块提亮 + 折射
       手感：进入玻璃即到位（不飞入）；移动中弹簧柔滑跟随（MagicUI MagicCard 参数）；
       离开原地淡出（不滑走）。不依赖 matchMedia 的 hover 探测（触屏笔记本常误报），
       首次收到鼠标 pointermove 才挂 gx-on；光与倾斜都是本站点名的效果，
       不因系统"减弱动态效果"关闭。 */
    var K = 250, C = 30, M = 0.6;
    var POOL = 76;                 /* 显影半径：光斑 70px + 一点余量 */
    var lit = [], hot = [], litRect = [];
    var wasLit = false;
    var lastTarget = null, lastX = 0, lastY = 0, hasPt = false;
    var sx = 0, sy = 0, vx = 0, vy = 0;
    var lastT = 0, gxRaf = 0, pending = false;
    var tiltEl = null, tiltT = 0;
    var TILT_CAP = 4, TILT_CAP_WIDE = 1.8;

    var tiltClear = function (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
    var tiltReset = function () {
      if (tiltT || !tiltEl) return;
      var el = tiltEl;
      tiltEl = null;
      tiltT = window.setTimeout(function () { tiltT = 0; tiltClear(el); }, 150);
    };
    var clearAll = function () {
      var i;
      for (i = 0; i < lit.length; i++) lit[i].classList.remove('gx-lit');
      for (i = 0; i < hot.length; i++) {
        hot[i].classList.remove('gx-hot');
        hot[i].classList.remove('gx-refr');
      }
      lit = []; hot = []; litRect = []; wasLit = false;
    };

    /* 指针离开页面 / 窗口失焦 / 切到后台：熄灯并把尚未执行的光帧一起作废。
       快速划出时 pointermove 排队的 rAF 会在 pointerout 之后才跑，
       只清类会被旧坐标重新点亮；hasPt=false 让那一帧直接放弃。 */
    var rest = function () {
      hasPt = false;
      pending = false;
      if (gxRaf) { window.cancelAnimationFrame(gxRaf); gxRaf = 0; }
      lastT = 0; vx = vy = 0;
      lastTarget = null;
      if (tiltT) { window.clearTimeout(tiltT); tiltT = 0; }
      if (tiltEl) { tiltClear(tiltEl); tiltEl = null; }
      clearAll();
      document.documentElement.classList.remove('gx-on');
    };

    var gxStep = function (now) {
      gxRaf = 0;
      var dt = lastT ? Math.min(0.033, Math.max(0.004, (now - lastT) / 1000)) : 1 / 60;
      lastT = now;
      vx += ((K * (lastX - sx) - C * vx) / M) * dt;
      vy += ((K * (lastY - sy) - C * vy) / M) * dt;
      sx += vx * dt; sy += vy * dt;
      var i;
      /* 光斑位置用 applyFrame 时缓存的矩形：弹簧跟随期间每帧不再读布局，
         避免倾斜写入 CSS 变量后立刻 getBoundingClientRect 触发同步排版 */
      for (i = 0; i < lit.length; i++) {
        var rr = litRect[i];
        if (!rr) continue;
        lit[i].style.setProperty('--mx', (sx - rr.l).toFixed(1) + 'px');
        lit[i].style.setProperty('--my', (sy - rr.t).toFixed(1) + 'px');
      }
      var dx = lastX - sx, dy = lastY - sy;
      if (lit.length && (vx * vx + vy * vy > 4 || dx * dx + dy * dy > 4)) {
        gxRaf = window.requestAnimationFrame(gxStep);
      } else {
        lastT = 0;
      }
    };

    var applyFrame = function () {
      if (!hasPt) return;
      var i, el, r;
      /* 悬停链（目标 → 所有外层玻璃块）= gx-hot；其中尺寸合理的再加 gx-refr（真实折射） */
      var chain = [];
      var n = lastTarget;
      while (n && n.nodeType === 1) {
        if (n.classList && n.classList.contains('gx')) chain.push(n);
        n = n.parentElement;
      }
      for (i = 0; i < hot.length; i++) {
        if (chain.indexOf(hot[i]) < 0) {
          hot[i].classList.remove('gx-hot');
          hot[i].classList.remove('gx-refr');
        }
      }
      for (i = 0; i < chain.length; i++) {
        if (hot.indexOf(chain[i]) < 0) {
          chain[i].classList.add('gx-hot');
          r = chain[i].getBoundingClientRect();
          if (r.width <= 1300 && r.height <= 1100) chain[i].classList.add('gx-refr');
        }
      }
      hot = chain;
      /* 光集：光标半径内的所有玻璃块 = gx-lit；顺带缓存矩形给弹簧帧用 */
      var next = [], nextRect = [];
      for (i = 0; i < gxHosts.length; i++) {
        el = gxHosts[i];
        r = el.getBoundingClientRect();
        if (r.width && r.height &&
            lastX >= r.left - POOL && lastX <= r.right + POOL &&
            lastY >= r.top - POOL && lastY <= r.bottom + POOL) {
          next.push(el);
          nextRect.push({ l: r.left, t: r.top });
        }
      }
      for (i = 0; i < lit.length; i++) {
        if (next.indexOf(lit[i]) < 0) lit[i].classList.remove('gx-lit');
      }
      for (i = 0; i < next.length; i++) {
        if (lit.indexOf(next[i]) < 0) next[i].classList.add('gx-lit');
      }
      lit = next;
      litRect = nextRect;
      /* 轻微倾斜（悬停链里最内层的可倾斜卡片；即时坐标） */
      var tiltTarget = null;
      for (i = 0; i < chain.length; i++) {
        if (chain[i].matches && chain[i].matches(GX_TILT)) { tiltTarget = chain[i]; break; }
      }
      if (tiltTarget) {
        if (tiltT) { window.clearTimeout(tiltT); tiltT = 0; }
        if (tiltEl && tiltEl !== tiltTarget) tiltClear(tiltEl);
        tiltEl = tiltTarget;
        r = tiltTarget.getBoundingClientRect();
        if (r.width && r.height) {
          var px = (lastX - r.left) / r.width, py = (lastY - r.top) / r.height;
          var cap = r.width > 640 ? TILT_CAP_WIDE : TILT_CAP;
          var dx2 = Math.max(-1, Math.min(1, (px - 0.5) * 2));
          var dy2 = Math.max(-1, Math.min(1, (py - 0.5) * 2));
          tiltTarget.style.setProperty('--rx', (dy2 * cap).toFixed(2) + 'deg');
          tiltTarget.style.setProperty('--ry', (-dx2 * cap).toFixed(2) + 'deg');
        }
      } else {
        tiltReset();
      }
      /* 光：进入即到位（不飞入）；移动中弹簧跟随 */
      if (lit.length) {
        if (!wasLit) { sx = lastX; sy = lastY; vx = 0; vy = 0; }
        if (!gxRaf) gxRaf = window.requestAnimationFrame(gxStep);
      }
      wasLit = lit.length > 0;
    };

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      if (!document.documentElement.classList.contains('gx-on')) {
        document.documentElement.classList.add('gx-on');
      }
      lastTarget = e.target; lastX = e.clientX; lastY = e.clientY; hasPt = true;
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; applyFrame(); });
    }, { passive: true });

    document.addEventListener('pointerout', function (e) {
      /* 换肤的 View Transition 会伪造 pointerleave/out（relatedTarget 是 <html>），
         此时不要熄灯，否则切换后悬停光会突然消失 */
      if (document.documentElement.classList.contains('vt-theme')) return;
      if (!e.relatedTarget) rest();
    });
    /* pointerleave 不冒泡，挂在 <html> 上：从窗口边缘快速划出时它也一定会到。
       只认真正离开窗口（relatedTarget 为空）；主题切换等浮层造成的伪 leave 不算 */
    document.documentElement.addEventListener('pointerleave', function (e) {
      if (document.documentElement.classList.contains('vt-theme')) return;
      if (!e.relatedTarget) rest();
    });
    window.addEventListener('scroll', function () {
      if (hasPt) {
        var t = document.elementFromPoint ? document.elementFromPoint(lastX, lastY) : null;
        lastTarget = (t && t.nodeType === 1) ? t : null;
        if (!pending) {
          pending = true;
          window.requestAnimationFrame(function () { pending = false; applyFrame(); });
        }
      } else {
        tiltReset();
      }
    }, { passive: true });
    window.addEventListener('resize', function () { if (hasPt) applyFrame(); });
    window.addEventListener('blur', rest);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) rest();
    });
    /* 从 bfcache 后退回来：保留的是离开前那一帧的状态，鼠标未必还在原处 */
    window.addEventListener('pageshow', function (e) { if (e.persisted) rest(); });
  }

  /* ---------- 右缘章节导航：滚动高亮 + 进出场 ---------- */
  var rail = document.querySelector('[data-rail-nav]');
  if (rail) {
    var railItems = [];
    var railLinks = rail.querySelectorAll('[data-rail]');
    for (var r0 = 0; r0 < railLinks.length; r0++) {
      var sec = document.getElementById(railLinks[r0].getAttribute('data-rail'));
      if (sec) railItems.push({ link: railLinks[r0], sec: sec });
    }
    var railActive = null;
    var railTop = [];
    var railLast = null;
    var railP = '';
    /* 章节位置按文档坐标缓存：滚动时只做数值比较，不再逐项读布局；进度线也在这里更新 */
    var railMeasure = function () {
      if (!railItems.length) return;
      var sy = window.scrollY || window.pageYOffset || 0;
      for (var i = 0; i < railItems.length; i++) {
        var rr = railItems[i].sec.getBoundingClientRect();
        railTop[i] = rr.top + sy;
        railItems[i].bottom = rr.bottom + sy;
      }
      railLast = railItems[railItems.length - 1];
    };
    var railUpdate = function () {
      if (!railItems.length || !railLast) return;
      var vh = window.innerHeight;
      var sy = window.scrollY || window.pageYOffset || 0;
      var mid = sy + vh * 0.38;
      var cur = null;
      for (var i = 0; i < railItems.length; i++) {
        if (railTop[i] <= mid) cur = railItems[i].link;
      }
      if (cur !== railActive) {
        if (railActive) railActive.classList.remove('is-active');
        if (cur) cur.classList.add('is-active');
        railActive = cur;
      }
      rail.classList.toggle('is-on', railTop[0] - sy <= vh * 0.55 && railLast.bottom - sy >= vh * 0.3);
      var p = 0;
      var span = railTop[railItems.length - 1] - railTop[0];
      if (span > 1) p = (mid - railTop[0]) / span;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var pv = p.toFixed(3);
      if (pv !== railP) {
        railP = pv;
        rail.style.setProperty('--rail-p', pv);
      }
    };
    var railOnScroll = function () { Motion.frame('rail', railUpdate); };
    var railRefresh = function () { railMeasure(); railUpdate(); };
    railRefresh();
    window.addEventListener('scroll', railOnScroll, { passive: true });
    window.addEventListener('resize', railRefresh);
    window.addEventListener('load', railRefresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(railRefresh);
    if ('ResizeObserver' in window) {
      var railRO = new ResizeObserver(function () { railMeasure(); railUpdate(); });
      railRO.observe(document.body);
    }

    /* 鼠标贴到屏幕最右侧（60px 内）时：圆点沿半圆弧散开、标签放大；离开即收回 */
    var railEdge = function (e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      rail.classList.toggle('is-open', e.clientX >= window.innerWidth - 60);
    };
    window.addEventListener('pointermove', railEdge, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (!e.relatedTarget) rail.classList.remove('is-open');
    });
  }

  /* ---------- 复制文本按钮（邮箱 chip 等） ---------- */
  document.querySelectorAll('[data-copy-text]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy-text') || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('已复制 ' + text); }, function () { toast('复制失败，请手动选择'); });
      } else {
        toast('已复制 ' + text);
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  /* ---------- 迷你终端（关于我 / 404 共用） ---------- */
  var term = document.querySelector('[data-term]');
  if (term) {
    var termOut = term.querySelector('[data-term-out]');
    var termIn = term.querySelector('[data-term-in]');
    var termJsonEl = document.getElementById('term-data');
    var TD = {};
    try { TD = JSON.parse((termJsonEl && termJsonEl.textContent) || '{}') || {}; } catch (e) { TD = {}; }
    var termHist = [];
    var termHistIdx = -1;

    var tEsc = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var tLine = function (html, cls) {
      var d = document.createElement('div');
      d.className = 'term-line' + (cls ? ' ' + cls : '');
      d.innerHTML = html;
      termOut.appendChild(d);
      termOut.scrollTop = termOut.scrollHeight;
    };
    var tText = function (s, cls) { tLine(tEsc(s), cls); };
    var tLink = function (href, label) {
      var ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
      return '<a class="term-link" href="' + tEsc(href) + '"' + ext + '>' + tEsc(label) + '</a>';
    };
    var tList = function (items) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        tLine('  ' + (it[0] ? '<span class="term-muted">' + tEsc(it[0]) + '</span>  ' : '') + it[1], '');
      }
    };

    var CMDS = {
      help: { desc: '命令清单', run: function () {
        tText('可用命令：', 'term-ok');
        tList([
          ['whoami', '我是谁'],
          ['about', '展开讲讲'],
          ['skills', '技能分组'],
          ['projects', '项目与链接'],
          ['sites', '自己部署的网站'],
          ['contact', '联系方式'],
          ['qq', 'QQ 名片二维码'],
          ['ls', '站点地图'],
          ['cd <路径>', '跳转，如 cd /projects'],
          ['theme', '切换深浅色'],
          ['clear', '清屏']
        ]);
      } },
      whoami: { desc: '我是谁', run: function () {
        var w = TD.whoami || []; 
        tText((w[0] || 'loong') + ' · ' + (w[1] || '全栈开发 · AI 应用'), 'term-ok');
        if (TD.about && TD.about[0]) tText(TD.about[0], 'term-muted');
      } },
      about: { desc: '展开讲讲', run: function () {
        var a = TD.about || [];
        if (!a.length) { tText('暂无介绍。', 'term-muted'); return; }
        for (var i = 0; i < a.length; i++) tText(a[i]);
      } },
      skills: { desc: '技能分组', run: function () {
        var g = TD.skills || [];
        for (var i = 0; i < g.length; i++) {
          tLine('  <span class="term-ok">' + tEsc(g[i][0]) + '</span>  <span class="term-muted">' + tEsc((g[i][1] || []).join(' · ')) + '</span>');
        }
      } },
      projects: { desc: '项目与链接', run: function () {
        var ps = TD.projects || [];
        for (var i = 0; i < ps.length; i++) {
          tLine('  ' + tLink(ps[i].href, ps[i].name) + ' <span class="term-muted">· ' + tEsc(ps[i].subtitle || '') + (ps[i].pub ? '' : ' · 私有') + '</span>');
        }
        tText('细节都可以发邮件聊。', 'term-muted');
      } },
      sites: { desc: '自己部署的网站', run: function () {
        var ss = TD.sites || [];
        for (var i = 0; i < ss.length; i++) {
          tLine('  ' + tLink(ss[i].href, ss[i].name));
        }
        if (TD.repo) tLine('  ' + tLink(TD.repo.href, '仓库浏览器') + ' <span class="term-muted">· GuessWord 源码站内可读</span>');
      } },
      contact: { desc: '联系方式', run: function () {
        var cs = TD.contacts || [];
        for (var i = 0; i < cs.length; i++) {
          if (cs[i].type === 'email') {
            tLine('  <span class="term-ok">' + tEsc(cs[i].label) + '</span> <span class="term-muted">· 在「联系我」可一键复制</span>');
          } else {
            tLine('  ' + tLink(cs[i].href, cs[i].label));
          }
        }
        tText('QQ 1820100714 —— 输入 qq 看名片码。', 'term-muted');
      } },
      qq: { desc: 'QQ 名片二维码', run: function () {
        openQr();
        tText('已打开 QQ 名片（扫码加好友）。', 'term-muted');
      } },
      ls: { desc: '站点地图', run: function () {
        var rows = [
          ['/', '首页'],
          ['/projects/', '项目'],
          ['/sites/', '网站'],
          ['/blog/', '博客'],
          ['/projects/guessword', 'GuessWord 项目']
        ];
        if (TD.repo) rows.push(['/projects/repo/guessword/', '仓库浏览器']);
        for (var i = 0; i < rows.length; i++) {
          tLine('  ' + tLink(rows[i][0], rows[i][0]) + ' <span class="term-muted">' + tEsc(rows[i][1]) + '</span>');
        }
      } },
      cd: { desc: '跳转', run: function (arg) {
        if (!arg) { tText('用法：cd /projects', 'term-muted'); return; }
        var a = arg.replace(/\s+$/, '').replace(/^\.\//, '');
        if (a.charAt(0) !== '/') a = '/' + a;
        var map = {
          '/home': '/', '/home/': '/',
          '/项目': '/projects/', '/项目/': '/projects/',
          '/网站': '/sites/', '/网站/': '/sites/',
          '/博客': '/blog/', '/博客/': '/blog/',
          '/wiki/guessword': '/projects/repo/guessword/'
        };
        var target = map[a] || a;
        if (target.charAt(target.length - 1) !== '/' && target.indexOf('.') === -1) target += '/';
        var here = location.pathname;
        if (target === here || target === here + '/') { tText('已经在这里了。', 'term-muted'); return; }
        tText('正在前往 ' + target + ' …', 'term-muted');
        location.href = target;
      } },
      theme: { desc: '切换深浅色', run: function () {
        flipTheme(null);
        tText('主题已切换：' + (current() === 'dark' ? '深色' : '浅色'), 'term-ok');
      } },
      clear: { desc: '清屏', run: function () { termOut.innerHTML = ''; } },
      sudo: { desc: '', run: function () {
        tText('sudo: permission denied —— 这台服务器只有 loong 说了算。', 'term-muted');
      } }
    };

    function runCmd(raw) {
      var cmd = String(raw || '').replace(/^\s+|\s+$/g, '');
      if (!cmd) return;
      tText('$ ' + cmd, 'term-echo');
      if (cmd === 'clear') { termOut.innerHTML = ''; return; }
      var m = /^(\S+)\s*(.*)$/.exec(cmd);
      var name = m[1].toLowerCase();
      var arg = m[2] || '';
      if (CMDS[name]) { CMDS[name].run(arg); }
      else { tText('命令不存在：' + name + '（试试 help，或者 ls 看看有什么）', 'term-muted'); }
      termHist.push(cmd);
      termHistIdx = termHist.length;
    }

    /* 输入框 */
    termIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runCmd(termIn.value);
        termIn.value = '';
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (termHistIdx > 0) { termHistIdx--; termIn.value = termHist[termHistIdx]; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (termHistIdx < termHist.length - 1) { termHistIdx++; termIn.value = termHist[termHistIdx]; }
        else { termHistIdx = termHist.length; termIn.value = ''; }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        var v = termIn.value.replace(/^\s+/, '');
        if (!v || v.indexOf(' ') !== -1) return;
        var names = Object.keys(CMDS).filter(function (n) { return n.indexOf(v) === 0 && n !== 'sudo'; });
        if (names.length === 1) termIn.value = names[0] + ' ';
        else if (names.length > 1) {
          var pre = names[0];
          for (var i = 1; i < names.length; i++) {
            while (names[i].indexOf(pre) !== 0 && pre) pre = pre.slice(0, -1);
          }
          termIn.value = pre;
        }
      }
    });

    /* 点命令行区域聚焦输入框 */
    termOut.addEventListener('click', function () { termIn.focus(); });

    /* 命令 chips */
    var chips = term.querySelectorAll('[data-term-cmd]');
    for (var ci = 0; ci < chips.length; ci++) {
      chips[ci].addEventListener('click', function () {
        runCmd(this.getAttribute('data-term-cmd'));
        termIn.focus();
      });
    }

    /* 404：进门先给一份站点地图 */
    if (term.hasAttribute('data-term-404')) runCmd('ls');
  }

  /* ---------- 项目筛选（/projects/）：FLIP 重排 + hash 记忆 ---------- */
  var froot = document.querySelector('[data-filter-root]');
  var fgrid = document.querySelector('[data-project-grid]');
  if (froot && fgrid) {
    var fchips = froot.querySelectorAll('[data-filter]');
    var fcards = fgrid.querySelectorAll('[data-visibility]');

    var applyFilter = function (mode, animate) {
      var first = {};
      if (animate) {
        for (var i = 0; i < fcards.length; i++) first[i] = fcards[i].getBoundingClientRect();
      }
      for (var j = 0; j < fcards.length; j++) {
        var show = mode === 'all' || fcards[j].getAttribute('data-visibility') === mode;
        fcards[j].classList.toggle('is-hidden', !show);
      }
      if (animate) {
        for (var k = 0; k < fcards.length; k++) {
          if (fcards[k].classList.contains('is-hidden')) continue;
          var last = fcards[k].getBoundingClientRect();
          var f = first[k];
          var dx = f ? f.left - last.left : 0;
          var dy = f ? f.top - last.top : 0;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            fcards[k].animate(
              [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
              { duration: 340, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
            );
          }
        }
      }
    };

    var setChip = function (mode) {
      for (var i = 0; i < fchips.length; i++) {
        fchips[i].classList.toggle('is-active', fchips[i].getAttribute('data-filter') === mode);
      }
    };

    var normMode = function (h) {
      h = (h || '').replace('#', '');
      return (h === 'public' || h === 'private') ? h : 'all';
    };

    /* 选中指示条：位置跟随活动芯片；活动芯片自身的实心面保持不变，避免滑动时出现白字压白底 */
    var fbar = document.createElement('i');
    fbar.className = 'filter-bar';
    fbar.setAttribute('aria-hidden', 'true');
    froot.insertBefore(fbar, froot.firstChild);
    var placeBar = function (animate) {
      var active = null;
      for (var i = 0; i < fchips.length; i++) {
        if (fchips[i].classList.contains('is-active')) { active = fchips[i]; break; }
      }
      if (!active) return;
      var w = Math.min(active.offsetWidth, 28);
      var x = active.offsetLeft + (active.offsetWidth - w) / 2;
      var y = active.offsetTop + active.offsetHeight + 4;
      if (!animate) {
        fbar.style.transition = 'none';
        fbar.style.width = w + 'px';
        fbar.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        void fbar.offsetWidth;
        fbar.style.transition = '';
        froot.classList.add('has-bar');
      } else {
        fbar.style.width = w + 'px';
        fbar.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      }
    };
    var barTick = 0;
    var queueBar = function () {
      if (barTick) return;
      barTick = window.requestAnimationFrame(function () { barTick = 0; placeBar(false); });
    };
    window.addEventListener('resize', queueBar);

    var initial = normMode(location.hash);
    setChip(initial);
    applyFilter(initial, false);
    placeBar(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeBar(false); });

    for (var fi = 0; fi < fchips.length; fi++) {
      fchips[fi].addEventListener('click', function () {
        var mode = this.getAttribute('data-filter');
        setChip(mode);
        applyFilter(mode, true);
        placeBar(true);
        try { history.replaceState(null, '', mode === 'all' ? location.pathname : '#' + mode); } catch (e) {}
      });
    }
    window.addEventListener('hashchange', function () {
      var m2 = normMode(location.hash);
      setChip(m2);
      applyFilter(m2, true);
      placeBar(true);
    });
  }

  /* ---------- 仓库浏览器：文件树侧栏（构建 / 筛选 / 键盘） ---------- */
  var rtree = document.querySelector('[data-repo-tree]');
  var rtreeBody = rtree ? rtree.querySelector('[data-tree-body]') : null;
  if (rtree && rtreeBody) {
    var rtJson = document.getElementById('repo-tree');
    var RT = {};
    try { RT = JSON.parse((rtJson && rtJson.textContent) || '{}') || {}; } catch (e) { RT = {}; }
    var rtBase = RT.base || '/';
    var rtAll = RT.tree || [];
    var rtCur = rtree.getAttribute('data-current') || '';

    var SVG_CARET = '<svg class="ic" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 6 6 6-6 6"/></svg>';
    var SVG_FOLDER = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.3a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17Z"/></svg>';
    var SVG_FILE = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>';

    var rEsc = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var fileUrl = function (p) {
      return rtBase + '/blob/' + p.split('/').map(encodeURIComponent).join('/');
    };
    var dirUrl = function (p) {
      return rtBase + '/' + p.split('/').map(encodeURIComponent).join('/') + '/';
    };

    var rtExpanded = {};
    try {
      var rtSaved = JSON.parse(sessionStorage.getItem('rtree-exp') || '[]');
      for (var re = 0; re < rtSaved.length; re++) rtExpanded[rtSaved[re]] = 1;
    } catch (e) {}
    var saveExpanded = function () {
      var out = [];
      for (var k in rtExpanded) { if (rtExpanded[k]) out.push(k); }
      try { sessionStorage.setItem('rtree-exp', JSON.stringify(out)); } catch (e) {}
    };

    /* 与 build 侧 repoChildren 相同的树构建：目录在前，字母序 */
    var childrenOf = function (dir) {
      var prefix = dir ? dir + '/' : '';
      var map = {};
      var order = [];
      for (var i = 0; i < rtAll.length; i++) {
        var e = rtAll[i];
        if (e.p.indexOf(prefix) !== 0) continue;
        var rest = e.p.slice(prefix.length);
        if (!rest) continue;
        var seg = rest.split('/')[0];
        if (!map[seg]) {
          map[seg] = { name: seg, dir: rest.indexOf('/') !== -1 || e.t === 'dir' };
          order.push(seg);
        }
      }
      order.sort(function (a, b) {
        if (map[a].dir !== map[b].dir) return map[a].dir ? -1 : 1;
        return a.localeCompare(b);
      });
      return order.map(function (n) { return map[n]; });
    };

    var buildTree = function () {
      if (rtCur) {
        var segs = rtCur.split('/');
        var acc = '';
        for (var i = 0; i < segs.length - 1; i++) {
          acc = acc ? acc + '/' + segs[i] : segs[i];
          rtExpanded[acc] = 1;
        }
      }
      rtreeBody.innerHTML = '';
      var active = null;
      var renderLevel = function (dir, depth) {
        var kids = childrenOf(dir);
        for (var i = 0; i < kids.length; i++) {
          var kid = kids[i];
          var path = dir ? dir + '/' + kid.name : kid.name;
          if (kid.dir) {
            var isOpen = !!rtExpanded[path];
            var row = document.createElement('div');
            row.className = 'tnode tnode-dir' + (isOpen ? ' is-open' : '') + (rtCur === path ? ' is-active' : '');
            row.style.paddingLeft = (8 + depth * 13) + 'px';
            row.innerHTML = '<span class="tnode-caret">' + SVG_CARET + '</span>' + SVG_FOLDER +
              '<span class="tnode-name">' + rEsc(kid.name) + '</span>';
            if (rtCur === path) active = row;
            rtreeBody.appendChild(row);
            row.addEventListener('click', (function (d) {
              return function () {
                rtExpanded[d] = rtExpanded[d] ? 0 : 1;
                saveExpanded();
                buildTree();
              };
            })(path));
            if (isOpen) renderLevel(path, depth + 1);
          } else {
            var file = document.createElement('a');
            file.className = 'tnode' + (rtCur === path ? ' is-active' : '');
            file.href = fileUrl(path);
            file.style.paddingLeft = (8 + depth * 13 + 18) + 'px';
            file.innerHTML = SVG_FILE + '<span class="tnode-name">' + rEsc(kid.name) + '</span>';
            if (rtCur === path) active = file;
            rtreeBody.appendChild(file);
          }
        }
      };
      renderLevel('', 0);
      if (active && active.scrollIntoView) {
        try { active.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    };

    var rtFilter = rtree.querySelector('[data-tree-filter]');
    var rtFiles = [];
    for (var rf = 0; rf < rtAll.length; rf++) { if (rtAll[rf].t === 'file') rtFiles.push(rtAll[rf].p); }

    var subseq = function (q, s) {
      var qi = 0;
      for (var i = 0; i < s.length && qi < q.length; i++) {
        if (s.charAt(i) === q.charAt(qi)) qi++;
      }
      return qi === q.length;
    };
    var hi = function (q, s) {
      var qi = 0;
      var out = '';
      for (var i = 0; i < s.length; i++) {
        if (qi < q.length && s.charAt(i) === q.charAt(qi)) {
          out += '<b>' + rEsc(s.charAt(i)) + '</b>';
          qi++;
        } else {
          out += rEsc(s.charAt(i));
        }
      }
      return out;
    };

    var rtCursor = -1;
    var moveCursor = function (d) {
      var items = rtreeBody.querySelectorAll('a.tnode');
      if (!items.length) return;
      rtCursor = Math.max(0, Math.min(items.length - 1, rtCursor + d));
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-cursor', i === rtCursor);
      try { items[rtCursor].scrollIntoView({ block: 'nearest' }); } catch (e) {}
    };

    if (rtFilter) {
      rtFilter.addEventListener('input', function () {
        rtCursor = -1;
        var q = rtFilter.value.replace(/^\s+|\s+$/g, '').toLowerCase();
        if (!q) { buildTree(); return; }
        var matches = [];
        for (var i = 0; i < rtFiles.length && matches.length < 60; i++) {
          if (subseq(q, rtFiles[i].toLowerCase())) matches.push(rtFiles[i]);
        }
        rtreeBody.innerHTML = '';
        if (!matches.length) {
          rtreeBody.innerHTML = '<div class="repo-tree-empty">没有匹配的文件</div>';
          return;
        }
        for (var j = 0; j < matches.length; j++) {
          var a = document.createElement('a');
          a.className = 'tnode';
          a.href = fileUrl(matches[j]);
          a.style.paddingLeft = '8px';
          a.innerHTML = SVG_FILE + '<span class="tnode-name">' + hi(q, matches[j]) + '</span>';
          rtreeBody.appendChild(a);
        }
      });
      rtFilter.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          var items = rtreeBody.querySelectorAll('a.tnode');
          if (items.length) items[rtCursor >= 0 ? rtCursor : 0].click();
        } else if (e.key === 'Escape') {
          rtFilter.value = '';
          rtCursor = -1;
          buildTree();
          rtFilter.blur();
        }
      });
      window.addEventListener('keydown', function (e) {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        rtFilter.focus();
      });
    }
    buildTree();
  }

  /* ---------- 代码页：行号永久链接 / 自动换行 ---------- */
  var codePre = document.querySelector('.code-scroll pre.code');
  if (codePre) {
    var codeLines = codePre.querySelectorAll('.line');
    var flashLine = function (el) {
      el.classList.add('is-flash');
      setTimeout(function () { el.classList.remove('is-flash'); }, 1500);
    };
    var mh = /^#L([0-9]+)$/.exec(location.hash || '');
    if (mh) {
      var ln0 = parseInt(mh[1], 10) - 1;
      if (codeLines[ln0]) {
        setTimeout(function () {
          try { codeLines[ln0].scrollIntoView({ block: 'center' }); } catch (e) { codeLines[ln0].scrollIntoView(); }
          flashLine(codeLines[ln0]);
        }, 80);
      }
    }
    codePre.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.line') : null;
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (e.clientX - r.left > 58) return; /* 仅左侧行号栏响应 */
      var n = 0;
      for (var i = 0; i < codeLines.length; i++) {
        if (codeLines[i] === el) { n = i + 1; break; }
      }
      if (!n) return;
      var url = location.origin + location.pathname + '#L' + n;
      var okCopy = function () { toast('已复制第 ' + n + ' 行链接'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(okCopy, function () { toast('复制失败'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(ta);
        okCopy();
      }
      try { history.replaceState(null, '', '#L' + n); } catch (err2) {}
      flashLine(el);
    });
    var wrapBtn = document.querySelector('[data-wrap-toggle]');
    if (wrapBtn) {
      wrapBtn.addEventListener('click', function () {
        var on = codePre.classList.toggle('is-wrap');
        wrapBtn.classList.toggle('is-on', on);
      });
    }
  }

  /* ---------- QQ 名片弹层（首页「QQ 联系」/ 终端 qq 命令） ---------- */
  function openQr() {
    var m = document.querySelector('[data-qr-modal]');
    if (!m) return;
    qrLastFocus = document.activeElement;
    m.hidden = false;
    m.setAttribute('aria-hidden', 'false');
    root.classList.add('no-scroll');
    var c = m.querySelector('[data-qr-close]');
    if (c && c.focus) c.focus();
  }
  function closeQr() {
    var m = document.querySelector('[data-qr-modal]');
    if (!m || m.hidden) return;
    m.hidden = true;
    m.setAttribute('aria-hidden', 'true');
    root.classList.remove('no-scroll');
    if (qrLastFocus && qrLastFocus.focus) qrLastFocus.focus();
  }
  var qrLastFocus = null;
  var qrOpens = document.querySelectorAll('[data-qr-open]');
  for (var qo = 0; qo < qrOpens.length; qo++) {
    qrOpens[qo].addEventListener('click', function (e) {
      e.preventDefault();
      openQr();
    });
  }
  var qrModal = document.querySelector('[data-qr-modal]');
  if (qrModal) {
    var qrCloses = qrModal.querySelectorAll('[data-qr-close]');
    for (var qc = 0; qc < qrCloses.length; qc++) {
      qrCloses[qc].addEventListener('click', closeQr);
    }
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeQr();
    });
  }

  /* ---------- 背景粒子漂移（零依赖原生 WebGL 实现）
     漂移细点 + 邻近点细线 + 鼠标附近点亮并向光标连线；单色、随主题换色、密度按视口面积自适应；
     无 WebGL / 无 JS 时安静退回现有网格背景。 */
  (function () {
    var deco = document.querySelector('.bg-deco');
    if (!deco || !window.WebGLRenderingContext) return;
    var cv = document.createElement('canvas');
    cv.className = 'bg-fx';
    cv.setAttribute('aria-hidden', 'true');
    /* 挂 body 独立固定层，而不是 .bg-deco 内部：网格遮罩会把下半屏淡到看不见 */
    document.body.appendChild(cv);

    var gl = null;
    try {
      gl = cv.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
    } catch (err) { gl = null; }
    if (!gl) { if (cv.parentNode) cv.parentNode.removeChild(cv); return; }

    var MAX_LINES = 1200, MAX_DPR = 1.25, EDGE = 20;
    var THEMES = {
      light: { baseHex: '#565B66', accentHex: '#15161A', restA: 0.5, litA: 1.0, linkA: 0.3, cursorA: 0.6 },
      dark: { baseHex: '#9AA0AD', accentHex: '#E9EBF0', restA: 0.35, litA: 1.0, linkA: 0.22, cursorA: 0.5 }
    };

    var VS_LINE = [
      'precision highp float;',
      'attribute vec2 a_p0;',
      'attribute vec2 a_p1;',
      'attribute vec2 a_corner;',
      'attribute vec3 a_shade;',
      'uniform vec2 uSize;',
      'varying float v_alpha;',
      'varying float v_mix;',
      'varying float v_off;',
      'varying float v_half;',
      'void main() {',
      '  vec2 d = a_p1 - a_p0;',
      '  float len = max(length(d), 1e-5);',
      '  vec2 nrm = vec2(-d.y, d.x) / len;',
      '  float half_ = max(a_shade.z * 0.5, 0.35);',
      '  float ext = half_ + 0.75;',
      '  vec2 p = mix(a_p0, a_p1, a_corner.x);',
      '  p += nrm * a_corner.y * ext;',
      '  v_alpha = a_shade.x;',
      '  v_mix = a_shade.y;',
      '  v_off = a_corner.y * ext;',
      '  v_half = half_;',
      '  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);',
      '}'
    ].join('\n');
    var FS_LINE = [
      'precision mediump float;',
      'uniform vec3 uBase, uAccent;',
      'varying float v_alpha;',
      'varying float v_mix;',
      'varying float v_off;',
      'varying float v_half;',
      'void main() {',
      '  float cov = clamp((v_half - abs(v_off)) / 0.75 + 0.5, 0.0, 1.0);',
      '  float a = v_alpha * cov;',
      '  vec3 col = mix(uBase, uAccent, v_mix);',
      '  gl_FragColor = vec4(col * a, a);',
      '}'
    ].join('\n');
    var VS_DOT = [
      'precision highp float;',
      'attribute vec2 a_pos;',
      'attribute float a_lit;',
      'uniform vec2 uSize;',
      'uniform float uDpr, uDot;',
      'varying float v_lit;',
      'void main() {',
      '  gl_PointSize = max(1.0, uDot * uDpr);',
      '  v_lit = a_lit;',
      '  gl_Position = vec4(a_pos.x / uSize.x * 2.0 - 1.0, 1.0 - a_pos.y / uSize.y * 2.0, 0.0, 1.0);',
      '}'
    ].join('\n');
    var FS_DOT = [
      'precision mediump float;',
      'uniform vec3 uBase, uAccent;',
      'uniform float uRestAlpha, uLitAlpha;',
      'varying float v_lit;',
      'void main() {',
      '  float d = length(gl_PointCoord - 0.5) * 2.0;',
      '  float disc = 1.0 - smoothstep(0.72, 1.0, d);',
      '  vec3 col = mix(uBase, uAccent, v_lit);',
      '  float a = disc * mix(uRestAlpha, uLitAlpha, v_lit);',
      '  if (a <= 0.004) discard;',
      '  gl_FragColor = vec4(col * a, a);',
      '}'
    ].join('\n');

    function compile(type, source) {
      var sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
      return sh;
    }
    function link(vsSrc, fsSrc) {
      var vs = compile(gl.VERTEX_SHADER, vsSrc);
      var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      var prog = gl.createProgram();
      if (!prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      return prog;
    }
    function parseColor(str, fb) {
      var m = String(str || '').replace('#', '');
      if (m.length === 6) {
        return [parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255];
      }
      return fb;
    }
    function rnd(seed) {
      var a = seed >>> 0;
      return function () {
        a += 0x6d2b79f5;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    var lineProg = link(VS_LINE, FS_LINE);
    var dotProg = link(VS_DOT, FS_DOT);
    if (!lineProg || !dotProg) { if (cv.parentNode) cv.parentNode.removeChild(cv); return; }

    var CORNERS = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
    var lP0 = new Float32Array(MAX_LINES * 6 * 2);
    var lP1 = new Float32Array(MAX_LINES * 6 * 2);
    var lCorner = new Float32Array(MAX_LINES * 6 * 2);
    var lShade = new Float32Array(MAX_LINES * 6 * 3);
    for (var e0 = 0; e0 < MAX_LINES; e0++) {
      for (var c0 = 0; c0 < 6; c0++) {
        var k0 = (e0 * 6 + c0) * 2;
        lCorner[k0] = CORNERS[c0][0];
        lCorner[k0 + 1] = CORNERS[c0][1];
      }
    }
    var bP0 = gl.createBuffer(), bP1 = gl.createBuffer(), bCorner = gl.createBuffer(), bShade = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bP0);
    gl.bufferData(gl.ARRAY_BUFFER, lP0.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bP1);
    gl.bufferData(gl.ARRAY_BUFFER, lP1.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bCorner);
    gl.bufferData(gl.ARRAY_BUFFER, lCorner, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bShade);
    gl.bufferData(gl.ARRAY_BUFFER, lShade.byteLength, gl.DYNAMIC_DRAW);

    var aL = {
      p0: gl.getAttribLocation(lineProg, 'a_p0'),
      p1: gl.getAttribLocation(lineProg, 'a_p1'),
      corner: gl.getAttribLocation(lineProg, 'a_corner'),
      shade: gl.getAttribLocation(lineProg, 'a_shade'),
      pos: gl.getAttribLocation(dotProg, 'a_pos'),
      lit: gl.getAttribLocation(dotProg, 'a_lit')
    };
    var uLSize = gl.getUniformLocation(lineProg, 'uSize');
    var uLBase = gl.getUniformLocation(lineProg, 'uBase');
    var uLAccent = gl.getUniformLocation(lineProg, 'uAccent');
    var uDSize = gl.getUniformLocation(dotProg, 'uSize');
    var uDDpr = gl.getUniformLocation(dotProg, 'uDpr');
    var uDDot = gl.getUniformLocation(dotProg, 'uDot');
    var uDRest = gl.getUniformLocation(dotProg, 'uRestAlpha');
    var uDLit = gl.getUniformLocation(dotProg, 'uLitAlpha');
    var uDBase = gl.getUniformLocation(dotProg, 'uBase');
    var uDAccent = gl.getUniformLocation(dotProg, 'uAccent');

    /* 每次加载取随机种子：刷新后粒子布局与漂移轨迹都是新的（固定种子会让每次刷新回到同一张图） */
    var R = rnd((Math.random() * 4294967296) >>> 0);
    var nCount = 0;
    var nx = new Float32Array(0), ny = new Float32Array(0), nSpd = new Float32Array(0);
    var gPos = new Float32Array(0), gLit = new Float32Array(0), gDrawY = new Float32Array(0);
    var bGPos = gl.createBuffer(), bGLit = gl.createBuffer();
    var ptr = { x: -1e4, y: -1e4 };
    var cur = null, curName = '';
    var curW = 1, curH = 1;
    var raf = 0, last = 0, builtN = -1, builtW = 0, builtH = 0;
    var FRAME_MS = 1000 / 30;   /* 粒子层按 30fps 渲染：慢漂移下观感一致，合成成本约减半 */
    var lines = 0;

    function build(n, w, h) {
      nCount = n;
      nx = new Float32Array(n);
      ny = new Float32Array(n);
      nSpd = new Float32Array(n);
      gPos = new Float32Array(n * 2);
      gLit = new Float32Array(n);
      gDrawY = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        nx[i] = R() * w;
        ny[i] = R() * h;
        nSpd[i] = (R() * 0.4 + 0.1) * 60;   /* px/s（0.5 倍速后 ≈3–15px/s，缓慢漂移） */
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bGPos);
      gl.bufferData(gl.ARRAY_BUFFER, gPos.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bGLit);
      gl.bufferData(gl.ARRAY_BUFFER, gLit.byteLength, gl.DYNAMIC_DRAW);
      builtN = n;
      builtW = w;
      builtH = h;
    }

    function pushLine(x0, y0, x1, y1, a0, a1, mix, wpx) {
      if (lines >= MAX_LINES) return;
      for (var cI = 0; cI < 6; cI++) {
        var kI = (lines * 6 + cI) * 2;
        var sI = (lines * 6 + cI) * 3;
        lP0[kI] = x0; lP0[kI + 1] = y0;
        lP1[kI] = x1; lP1[kI + 1] = y1;
        lShade[sI] = CORNERS[cI][0] === 0 ? a0 : a1;
        lShade[sI + 1] = mix;
        lShade[sI + 2] = wpx;
      }
      lines++;
    }

    function render(now) {
      raf = window.requestAnimationFrame(render);
      if (last && now - last < FRAME_MS) return;   /* 30fps 节流（跳过时不产生画布更新） */
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;

      var thName = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      if (thName !== curName) {
        curName = thName;
        cur = THEMES[thName];
        cur.base = parseColor(cur.baseHex, [0.34, 0.36, 0.4]);
        cur.accent = parseColor(cur.accentHex, [0.09, 0.09, 0.1]);
      }

      var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      var cw = cv.clientWidth || window.innerWidth;
      var ch = cv.clientHeight || window.innerHeight;
      curW = cw; curH = ch;
      var bw = Math.max(1, Math.round(cw * dpr));
      var bh = Math.max(1, Math.round(ch * dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      gl.viewport(0, 0, bw, bh);

      var want = Math.round(cw * ch / 15000);
      if (want < 60) want = 60;
      if (want > 130) want = 130;
      if (want !== builtN) {
        build(want, cw, ch);
      } else if (cw !== builtW || ch !== builtH) {
        var sx = cw / Math.max(builtW || cw, 1);
        var sy = ch / Math.max(builtH || ch, 1);
        for (var i0 = 0; i0 < nCount; i0++) { nx[i0] *= sx; ny[i0] *= sy; }
        builtW = cw; builtH = ch;
      }

      var sp = 0.5;                                  /* 漂移速度（组件默认的一半） */
      var th = 12 * Math.PI / 180;                   /* 方向：主要向下、略偏右（v7 按用户要求改为向下） */
      var dirX = Math.sin(th), dirY = Math.cos(th);
      var reach = 180, LINKD = 140, LINKW = 2;
      var l2 = LINKD * LINKD;

      lines = 0;
      var i2, j2;
      /* 滚动景深：星图整体做 1% 的纵向视差；按一个周期回绕，避免画布上下出现空白 */
      var bgShift = ((window.scrollY || window.pageYOffset || 0) * 0.01) % (ch + EDGE * 2);
      for (i2 = 0; i2 < nCount; i2++) {
        nx[i2] += nSpd[i2] * dirX * dt * sp;
        ny[i2] += nSpd[i2] * dirY * dt * sp;
        if (nx[i2] < -EDGE) { nx[i2] = cw + EDGE; ny[i2] = R() * ch; }
        else if (nx[i2] > cw + EDGE) { nx[i2] = -EDGE; ny[i2] = R() * ch; }
        if (ny[i2] < -EDGE) { ny[i2] = ch + EDGE; nx[i2] = R() * cw; }
        else if (ny[i2] > ch + EDGE) { ny[i2] = -EDGE; nx[i2] = R() * cw; }
        var gy = ny[i2] + bgShift;
        if (gy > ch + EDGE) gy -= ch + EDGE * 2;
        gDrawY[i2] = gy;
        var dx0 = ptr.x - nx[i2], dy0 = ptr.y - gy;
        var d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        var lit = d0 < reach ? 1 : 0;
        if (lit) {
          var la = cur.cursorA * (1 - d0 / reach);
          pushLine(nx[i2], gy, ptr.x, ptr.y, la, la, 1, LINKW);
        }
        gPos[i2 * 2] = nx[i2];
        gPos[i2 * 2 + 1] = gy;
        gLit[i2] = lit;
      }
      for (i2 = 0; i2 < nCount && lines < MAX_LINES; i2++) {
        for (j2 = i2 + 1; j2 < nCount && lines < MAX_LINES; j2++) {
          var ddx = nx[i2] - nx[j2], ddy = gDrawY[i2] - gDrawY[j2];
          var dd = ddx * ddx + ddy * ddy;
          if (dd >= l2) continue;
          var pa = cur.linkA * (1 - Math.sqrt(dd) / LINKD);
          pushLine(nx[i2], gDrawY[i2], nx[j2], gDrawY[j2], pa, pa, 0, LINKW);
        }
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      if (lines > 0) {
        var verts = lines * 6;
        gl.useProgram(lineProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, bP0);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lP0.subarray(0, verts * 2));
        gl.enableVertexAttribArray(aL.p0);
        gl.vertexAttribPointer(aL.p0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bP1);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lP1.subarray(0, verts * 2));
        gl.enableVertexAttribArray(aL.p1);
        gl.vertexAttribPointer(aL.p1, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bCorner);
        gl.enableVertexAttribArray(aL.corner);
        gl.vertexAttribPointer(aL.corner, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bShade);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lShade.subarray(0, verts * 3));
        gl.enableVertexAttribArray(aL.shade);
        gl.vertexAttribPointer(aL.shade, 3, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uLSize, cw, ch);
        gl.uniform3f(uLBase, cur.base[0], cur.base[1], cur.base[2]);
        gl.uniform3f(uLAccent, cur.accent[0], cur.accent[1], cur.accent[2]);
        gl.drawArrays(gl.TRIANGLES, 0, verts);
        gl.disableVertexAttribArray(aL.p0);
        gl.disableVertexAttribArray(aL.p1);
        gl.disableVertexAttribArray(aL.corner);
        gl.disableVertexAttribArray(aL.shade);
      }

      if (nCount > 0) {
        gl.useProgram(dotProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, bGPos);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, gPos);
        gl.enableVertexAttribArray(aL.pos);
        gl.vertexAttribPointer(aL.pos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bGLit);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, gLit);
        gl.enableVertexAttribArray(aL.lit);
        gl.vertexAttribPointer(aL.lit, 1, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uDSize, cw, ch);
        gl.uniform1f(uDDpr, dpr);
        gl.uniform1f(uDDot, 5.0);
        gl.uniform1f(uDRest, cur.restA);
        gl.uniform1f(uDLit, cur.litA);
        gl.uniform3f(uDBase, cur.base[0], cur.base[1], cur.base[2]);
        gl.uniform3f(uDAccent, cur.accent[0], cur.accent[1], cur.accent[2]);
        gl.drawArrays(gl.POINTS, 0, nCount);
        gl.disableVertexAttribArray(aL.pos);
        gl.disableVertexAttribArray(aL.lit);
      }
    }

    cv.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    });
    document.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      ptr.x = (ev.clientX - r.left) / r.width * curW;
      ptr.y = (ev.clientY - r.top) / r.height * curH;
    }, { passive: true });
    document.addEventListener('pointerout', function (ev) {
      if (!ev.relatedTarget) { ptr.x = -1e4; ptr.y = -1e4; }
    });

    raf = window.requestAnimationFrame(render);
  })();

  /* 头像盘：3D 倾斜 + 边缘水波纹（用户点名效果）。
     倾斜：整块盘绕中心 rotateX/rotateY——鼠标一侧下沉、对侧翘起，圆心处归零；
     倾角用指数滤波跟随，指针离开（或滑到方框四角=盘外）后平滑回弹。
     水波纹：画在外层 2D 画布、不参与倾斜——涟漪出现的位置按当前倾角把盘缘点
     投影到屏幕（rotateY→rotateX→透视，与 CSS 的变换顺序/透视距离一致），
     所以始终贴着倾斜后的边缘；移动触发（速度/靠边程度轻微加权），静止时
     每隔几秒在随机方位出一圈极淡的。本站既定策略：用户点名的效果不受
     prefers-reduced-motion 限制（同类：背景粒子、滚动浮现）。 */
  (function () {
    var disc = document.querySelector('.hero-disc');
    if (!disc) return;
    var av = disc.querySelector('.hero-avatar');
    if (!av) return;

    var MAX = 11;            /* 盘缘处最大倾角（度）——克制档，看得出倾斜但不晃眼 */
    var PERSP = 640;         /* 与 CSS .hero-disc 的 perspective 一致，涟漪投影要用 */
    var TAU = 0.1;           /* 倾角跟随时间常数（秒） */
    var TAU2 = Math.PI * 2;

    var cv = document.createElement('canvas');
    cv.className = 'hero-ripples';
    cv.setAttribute('aria-hidden', 'true');
    disc.appendChild(cv);
    var g = cv.getContext('2d');
    if (!g && cv.parentNode) cv.parentNode.removeChild(cv);

    var cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
    var wrote = { x: 99, y: 99 };
    var ripples = [], travel = 0, lastPX = 0, lastPY = 0, hasPt = false;
    var raf = 0, last = 0, idleTimer = 0;
    var root = document.documentElement;

    function kick() {
      disc.classList.add('is-live');
      if (!raf) { last = 0; raf = window.requestAnimationFrame(tick); }
    }

    function armIdle() {
      if (idleTimer || !g) return;
      idleTimer = window.setTimeout(function () {
        idleTimer = 0;
        if (hasPt || ripples.length) return;
        addRipple(Math.random() * TAU2, 0.11 + Math.random() * 0.045, 0);
      }, 2100 + Math.random() * 2300);
    }

    function addRipple(az, amp, boost) {
      if (!g) return;
      ripples.push({ az: az, t: 0, dur: 0.55 + Math.random() * 0.25, amp: amp, max: 11 + Math.random() * 6 + boost });
      if (ripples.length > 8) ripples.shift();
      kick();
    }

    function onMove(ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      var r = av.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var rr = (av.offsetWidth || 2) / 2;
      var dx = (ev.clientX - cx) / rr, dy = (ev.clientY - cy) / rr;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.0001) { tgt.x = 0; tgt.y = 0; hasPt = true; kick(); return; }
      if (d > 1.08) {              /* 盘外（含方框四角）：视为离开，平滑回弹 */
        hasPt = false;
        tgt.x = 0; tgt.y = 0;
        travel = 0; lastPX = 0; lastPY = 0;
        kick();
        return;
      }
      hasPt = true;
      var a = d < 1 ? d : 1;       /* 幅度：圆心为零、边缘封顶 */
      var ux = dx / d, uy = dy / d;
      tgt.x = -MAX * a * uy;       /* 鼠标在下 → 下缘下沉（rotateX 负角，y 轴向下） */
      tgt.y = MAX * a * ux;        /* 鼠标在右 → 右缘下沉（rotateY 正角） */
      /* 交互涟漪：按位移距离节流；移动越快 / 越靠边，稍明显一点（始终很淡） */
      var mv = 0;
      if (lastPX || lastPY) mv = Math.sqrt((ev.clientX - lastPX) * (ev.clientX - lastPX) + (ev.clientY - lastPY) * (ev.clientY - lastPY));
      lastPX = ev.clientX; lastPY = ev.clientY;
      travel += mv;
      if (travel > 30 && d > 0.25) {
        travel = 0;
        var amp = (0.18 + 0.09 * a) * (0.75 + 0.45 * Math.min(1, mv / 26));
        addRipple(Math.atan2(dy, dx), Math.min(0.36, amp), a > 0.8 ? 3 : 0);
      }
      kick();
    }

    function onLeave() {
      hasPt = false;
      tgt.x = 0; tgt.y = 0;
      travel = 0; lastPX = 0; lastPY = 0;
      kick();
    }

    function draw(dt) {
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!ripples.length) return;
      var cx = w / 2, cy = h / 2;
      var rr = (av.offsetWidth || 0) / 2;
      var ink = root.getAttribute('data-theme') === 'dark' ? '208,214,226' : '38,41,50';
      var ax = cur.x * Math.PI / 180, ay = cur.y * Math.PI / 180;
      var ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
      for (var i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.t += dt;
        var p = rp.t / rp.dur;
        if (p >= 1) { ripples.splice(i, 1); continue; }
        /* 盘缘外 3px 的点（本地坐标）→ rotateY → rotateX → 透视投影到画布坐标 */
        var lx = Math.cos(rp.az) * (rr + 3), ly = Math.sin(rp.az) * (rr + 3);
        var x1 = lx * cb;
        var z1 = -lx * sb;
        var y2 = ly * ca - z1 * sa;
        var z2 = ly * sa + z1 * ca;
        var s = PERSP / (PERSP - z2);
        var px = cx + x1 * s, py = cy + y2 * s;
        var e = 1 - Math.pow(1 - p, 2.2);
        var rad = 2 + rp.max * e;
        var env = p < 0.22 ? p / 0.22 : 1 - (p - 0.22) / 0.78;
        var al = rp.amp * env;
        if (al < 0.006) continue;
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(' + ink + ',' + al.toFixed(3) + ')';
        g.beginPath(); g.arc(px, py, rad, 0, TAU2); g.stroke();
        g.strokeStyle = 'rgba(' + ink + ',' + (al * 0.5).toFixed(3) + ')';
        g.beginPath(); g.arc(px, py, rad * 0.6 + 1, 0, TAU2); g.stroke();
      }
    }

    function tick(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      var k = 1 - Math.exp(-dt / TAU);
      cur.x += (tgt.x - cur.x) * k;
      cur.y += (tgt.y - cur.y) * k;
      var settled = false;
      if (!hasPt && Math.abs(cur.x) < 0.02 && Math.abs(cur.y) < 0.02) {
        cur.x = 0; cur.y = 0;
        settled = true;
      }
      if (Math.abs(cur.x - wrote.x) > 0.005 || Math.abs(cur.y - wrote.y) > 0.005) {
        wrote.x = cur.x; wrote.y = cur.y;
        av.style.setProperty('--av-rx', cur.x.toFixed(2) + 'deg');
        av.style.setProperty('--av-ry', cur.y.toFixed(2) + 'deg');
      }
      if (g) draw(dt);
      if (!settled || ripples.length) {
        raf = window.requestAnimationFrame(tick);
      } else {
        raf = 0;
        disc.classList.remove('is-live');
        armIdle();
      }
    }

    /* 不挂 reduce 开关：用户点名的效果（同粒子层）。触屏 pointerType 非 mouse，直接忽略。 */
    disc.addEventListener('pointermove', onMove, { passive: true });
    disc.addEventListener('pointerleave', onLeave, { passive: true });
    disc.addEventListener('pointercancel', onLeave, { passive: true });
    if (g) armIdle();
  })();

  window.__lsToast = toast;
})();
