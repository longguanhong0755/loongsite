// 构建脚本：data/*.json + data/repos/*.json + content/blog/*.md → 静态 HTML
// 用法：node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { layout, icon, esc, badge, tag, sectionHead, projectCard } from './templates.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'profile.json'), 'utf8'));
const projects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'projects.json'), 'utf8')).projects;
const repoFile = path.join(ROOT, 'data', 'repos', 'guessword.json');
const repo = fs.existsSync(repoFile) ? JSON.parse(fs.readFileSync(repoFile, 'utf8')) : null;

const written = [];
function write(rel, html) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push([rel, html.length]);
}

// 构建前清掉上一轮的生成物（手写资源 assets/ 与内容源 data/ content/ 不动）
for (const rel of ['index.html', '404.html', 'sitemap.xml', 'robots.txt', 'projects', 'sites', 'blog']) {
  fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });
}

/* ============================== 小工具 ============================== */

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

const formatDate = (iso) => (iso ? String(iso).slice(0, 10) : '');

const extOf = (p) => {
  const base = p.split('/').pop();
  if (!base.includes('.')) return base.startsWith('.') ? base.slice(1).toLowerCase() : '';
  return base.split('.').pop().toLowerCase();
};

const KIND = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'React', ts: 'TypeScript', tsx: 'React',
  py: 'Python', html: 'HTML', htm: 'HTML', css: 'CSS', json: 'JSON', md: 'Markdown', sh: 'Shell', bash: 'Shell',
  toml: 'TOML', yml: 'YAML', yaml: 'YAML', txt: '文本', svg: 'SVG', sql: 'SQL', lock: 'Lockfile'
};
const fileKind = (ext) => KIND[ext] || (ext ? ext.toUpperCase() : '文件');

const ICON_OF = {
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', py: 'code', css: 'code', html: 'code', sh: 'terminal',
  json: 'database', toml: 'database', yml: 'database', md: 'file', txt: 'file'
};
const kindIcon = (ext) => ICON_OF[ext] || 'file';

/* ============================== 语法高亮 ============================== */
/* 极简扫描器：转义每一个字符，按 token 包 span（灰阶着色，无彩色） */

const KW = {
  js: new Set('const let var function return if else for while do switch case break continue new class extends import export from as default try catch finally throw typeof instanceof in of delete void yield await async this super null undefined true false NaN Infinity static get set require module exports'.split(' ')),
  py: new Set('def class return if elif else for while break continue import from as pass raise try except finally with lambda yield global nonlocal assert del in is not and or None True False self print await async match case'.split(' ')),
  sh: new Set('if then else elif fi for while do done case esac function return export local echo exit cd set source unset printf read test'.split(' ')),
  toml: new Set('true false'.split(' ')),
  default: new Set()
};

function commentCfg(ext) {
  if (['py', 'sh', 'bash', 'toml', 'yml', 'yaml', 'ini', 'conf'].includes(ext)) return { line: '#' };
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css'].includes(ext)) return { line: '//', block: ['/*', '*/'] };
  if (['html', 'htm', 'xml', 'svg'].includes(ext)) return { html: true };
  if (ext === 'md') return { md: true };
  if (ext === 'json') return { json: true };
  return { line: '#' };
}

const span = (cls, text) => `<span class="tok-${cls}">${esc(text)}</span>`;

function strEnd(line, i, q) {
  let j = i + 1;
  while (j < line.length) {
    if (line[j] === '\\') { j += 2; continue; }
    if (line[j] === q) return j + 1;
    j++;
  }
  return line.length;
}

function hlTag(tag) {
  let out = '';
  const m = /^<\/?([A-Za-z][\w:-]*)/.exec(tag);
  let i = 0;
  if (m) {
    out += esc(m[0].slice(0, m[0].length - m[1].length)) + span('t', m[1]);
    i = m[0].length;
  }
  let j = i;
  while (j < tag.length) {
    const q = tag[j];
    if (q === '"' || q === "'") {
      const e = strEnd(tag, j, q);
      out += esc(tag.slice(i, j)) + span('a', tag.slice(j, e));
      i = e; j = e; continue;
    }
    j++;
  }
  return out + esc(tag.slice(i));
}

function hlHtmlLine(line) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith('<!--')) {
      const end = line.indexOf('-->', i);
      if (end === -1) return out + span('c', rest);
      out += span('c', line.slice(i, end + 3)); i = end + 3; continue;
    }
    if (line[i] === '<') {
      const end = line.indexOf('>', i);
      if (end === -1) return out + esc(rest);
      out += hlTag(line.slice(i, end + 1)); i = end + 1; continue;
    }
    out += esc(line[i]); i++;
  }
  return out;
}

function hlMdLine(line, state) {
  const t = line.replace(/^\s+/, '');
  if (t.startsWith('```')) {
    state.fence = !state.fence;
    return span('c', line);
  }
  if (state.fence) return span('s', line);
  if (/^#{1,6}\s/.test(t)) return span('h', line);
  return line.split(/(`[^`]*`)/g).map((p) => (p.startsWith('`') ? span('c', p) : esc(p))).join('');
}

function hlCode(text, ext) {
  ext = ext || 'txt';
  const cfg = commentCfg(ext);
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const state = { block: false, fence: false };
  const out = [];

  for (const line of lines) {
    if (cfg.html) { out.push('<span class="line">' + hlHtmlLine(line) + '</span>'); continue; }
    if (cfg.md) { out.push('<span class="line">' + hlMdLine(line, state) + '</span>'); continue; }

    let html = '';
    let i = 0;
    while (i < line.length) {
      if (state.block) {
        const end = line.indexOf(cfg.block[1], i);
        if (end === -1) { html += span('c', line.slice(i)); i = line.length; break; }
        html += span('c', line.slice(i, end + cfg.block[1].length));
        i = end + cfg.block[1].length;
        state.block = false;
        continue;
      }
      const rest = line.slice(i);
      if (cfg.block && rest.startsWith(cfg.block[0])) { state.block = true; continue; }
      if (cfg.line && rest.startsWith(cfg.line)) { html += span('c', rest); i = line.length; break; }

      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const end = strEnd(line, i, ch);
        const s = line.slice(i, end);
        if (cfg.json) html += span(/^\s*:/.test(line.slice(end)) ? 't' : 's', s);
        else html += span('s', s);
        i = end; continue;
      }
      if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_$]/.test(line[i - 1]))) {
        const m = /^\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/.exec(rest);
        if (m) { html += span('n', m[0]); i += m[0].length; continue; }
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(rest);
        const w = m[0];
        let cls = null;
        if (cfg.json) cls = (w === 'true' || w === 'false' || w === 'null') ? 'k' : null;
        else if ((KW[ext] || KW.default).has(w)) cls = 'k';
        html += cls ? span(cls, w) : esc(w);
        i += w.length; continue;
      }
      html += esc(ch);
      i++;
    }
    out.push('<span class="line">' + html + '</span>');
  }
  return out.join('');
}

/* ============================== Markdown ============================== */

const LANG_MAP = {
  javascript: 'js', js: 'js', node: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', shell: 'sh', console: 'sh', html: 'html', css: 'css', json: 'json',
  markdown: 'md', md: 'md', toml: 'toml', yaml: 'yml', yml: 'yml', text: 'txt', '': 'txt'
};

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(...args) {
      const first = args[0];
      const text = typeof first === 'string' ? first : first.text || '';
      const langRaw = typeof first === 'string' ? args[1] || '' : first.lang || '';
      const ext = LANG_MAP[String(langRaw).toLowerCase().trim()] || 'txt';
      return `<pre><code class="hl hl-${esc(ext)}">${hlCode(text, ext)}</code></pre>`;
    }
  }
});

function mdToHtml(md) {
  return marked.parse(String(md || ''));
}

/** 把仓库 README 里的相对链接改到 GitHub */
function fixRepoLinks(html, owner, name, branch) {
  return html.replace(/href="([^"]+)"/g, (m, url) => {
    if (/^(https?:|mailto:|#|\/)/.test(url)) return m;
    const clean = url.replace(/^\.\//, '');
    return `href="https://github.com/${owner}/${name}/blob/${branch}/${clean}"`;
  });
}

/* ============================== 页面：首页 ============================== */

const SKILL_ICON = { '前端 / 桌面': 'code', '后端 / 数据': 'database', 'AI / 检索': 'sparkles', '部署 / 工程': 'server' };
const CONTACT_ICON = { email: 'mail', github: 'github' };
const CONTACT_GROUPS = [
  { key: 'mail', label: '邮箱' },
  { key: 'social', label: '主页与社区' }
];

/* 迷你终端：关于我 / 404 共用；命令数据由页面内 JSON 提供，引擎在 assets/js/main.js */
const TERM_CHIPS = ['help', 'whoami', 'skills', 'projects', 'sites', 'contact', 'qq', 'theme'];
function terminalBlock(is404 = false) {
  const chips = (is404 ? ['ls', ...TERM_CHIPS.slice(0, 5)] : TERM_CHIPS)
    .map((c) => `<button class="term-chip" type="button" data-term-cmd="${c}">${c}</button>`).join('');
  const intro = is404
    ? '        <div class="term-line term-muted">404 —— 这个页面不存在，用终端找路吧：</div>'
    : '        <div class="term-line term-muted">输入 <b>help</b> 查看命令清单，也可以直接点下面的命令。</div>';
  return `<div class="term glass reveal" data-term${is404 ? ' data-term-404' : ''}>
      <div class="term-head">
        <span class="term-title">${icon('terminal', 14)}<span>loong@loongsite</span></span>
        <span class="term-hint">命令可输入，也可点选</span>
      </div>
      <div class="term-body" data-term-out role="log" aria-live="polite">
${intro}
      </div>
      <div class="term-input-row">
        <span class="term-prompt" aria-hidden="true">$</span>
        <input class="term-input" data-term-in type="text" autocomplete="off" spellcheck="false" aria-label="命令输入" placeholder="help">
      </div>
      <div class="term-chips">${chips}</div>
    </div>`;
}

function termDataJson() {
  const data = {
    whoami: [profile.name, profile.title],
    about: profile.about || [],
    skills: (profile.skills || []).map((g) => [g.group, g.items]),
    projects: projects.map((p) => ({ name: p.name, subtitle: p.subtitle, href: `/projects/${p.slug}`, pub: p.visibility === 'public' })),
    sites: (profile.sites || []).map((s) => ({ name: s.name, href: s.href })),
    contacts: (profile.contacts || [])
      .filter((c) => c.type === 'email' || c.type === 'github')
      .map((c) => ({ type: c.type, label: c.label, href: c.href })),
    repo: repo ? { href: '/projects/repo/guessword/' } : null
  };
  return `<script type="application/json" id="term-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/* 仓库浏览器：文件树数据内联（58 条路径，极小）+ 侧栏骨架（树由 main.js 构建） */
function repoTreeJson() {
  if (!repo) return '';
  const data = {
    base: REPO_BASE,
    tree: repo.tree.map((e) => ({ p: e.path, t: e.type }))
  };
  return `<script type="application/json" id="repo-tree">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function repoTreeAside(current) {
  if (!repo) return '';
  return `<aside class="repo-tree glass reveal" data-repo-tree data-current="${esc(current || '')}">
          <div class="repo-tree-head">
            <span class="repo-tree-title">${icon('folder', 14)}<span>${esc(repo.name)}</span></span>
            <input class="repo-tree-filter" data-tree-filter type="text" placeholder="筛选文件  /" aria-label="筛选文件" autocomplete="off" spellcheck="false">
          </div>
          <div class="repo-tree-body" data-tree-body></div>
          <div class="repo-tree-foot"><a href="${REPO_BASE}/">${icon('home', 13)}仓库根目录</a></div>
        </aside>`;
}

function renderHome() {
  const contacts = profile.contacts || [];
  const mail = contacts.find((c) => c.type === 'email');
  const gh = contacts.find((c) => c.type === 'github');
  const latestPosts = readPosts().slice(0, 2);

  const heroContacts = [
    `<a class="btn" href="/assets/img/qq-card.jpg" data-qr-open target="_blank" rel="noopener">${icon('qq', 17)}QQ 联系</a>`,
    gh ? `<a class="btn" href="${esc(gh.href)}" target="_blank" rel="me noopener">${icon('github', 17)}GitHub</a>` : '',
    `<a class="btn btn-ghost" href="#work">看看项目${icon('chevronRight', 15)}</a>`
  ].filter(Boolean).join('\n        ');

  const contactChip = (c) => {
    const ic = c.icon || CONTACT_ICON[c.type] || 'external';
    const ext = /^https?:/.test(c.href) ? ' target="_blank" rel="me noopener"' : '';
    if (c.type === 'email') {
      /* 邮箱不做 mailto 链接（避免唤起本机邮件客户端）：静态 chip + 旁边复制按钮 */
      const addr = c.href.replace(/^mailto:/, '');
      return `<span class="chip-pair"><span class="btn chip-static">${icon(ic, 17)}${esc(c.label)}</span><button class="chip-copy" type="button" data-copy-text="${esc(addr)}" aria-label="复制 ${esc(addr)}" title="复制邮箱">${icon('copy', 14)}</button></span>`;
    }
    return `<a class="btn btn-ghost" href="${esc(c.href)}"${ext}>${icon(ic, 17)}${esc(c.label)}</a>`;
  };
  const contactGroups = CONTACT_GROUPS.map((g) => {
    const items = contacts.filter((c) => (c.group || (c.type === 'email' ? 'mail' : 'social')) === g.key);
    if (!items.length) return '';
    return `<div class="contact-group">
          <div class="contact-label">${esc(g.label)}</div>
          <div class="btn-row">${items.map(contactChip).join('\n            ')}</div>
        </div>`;
  }).filter(Boolean).join('\n        ');

  /* 游戏账号：和邮箱 chip 同一语言——静态 chip + 复制按钮（UID 不可点，复制拿去加好友） */
  const games = profile.games || [];
  const gamesGroup = games.length
    ? `<div class="contact-group">
          <div class="contact-label">游戏</div>
          <div class="btn-row">${games.map((gm) => `<span class="chip-pair"><span class="btn chip-static"><img class="game-ic" src="${esc(gm.icon)}" width="18" height="18" alt="" aria-hidden="true" loading="lazy" decoding="async">${esc(gm.name)}<span class="uid-num">${esc(gm.uid)}</span></span><button class="chip-copy" type="button" data-copy-text="${esc(gm.uid)}" aria-label="复制 ${esc(gm.name)} UID" title="复制 UID">${icon('copy', 14)}</button></span>`).join('\n            ')}</div>
        </div>`
    : '';

  const repoFiles = repo ? repo.tree.filter((e) => e.type === 'file').length : null;
  const statDefs = [
    ['项目', projects.length],
    ['公开项目', projects.filter((p) => p.visibility === 'public').length],
    ['上线网站', (profile.sites || []).length],
    repoFiles != null
      ? ['仓库文件', repoFiles]
      : ['技能标签', (profile.skills || []).reduce((n, g) => n + g.items.length, 0)]
  ];
  const statsStrip = `<div class="stats-strip">${statDefs.map(([k, v]) => `<div class="stat-item"><span class="stat-num" data-count="${v}">${v}</span><span class="stat-label">${esc(k)}</span></div>`).join('')}</div>`;

  const skills = (profile.skills || []).map((g) => `<div class="skill-card glass reveal">
        <div class="skill-group-name">${icon(SKILL_ICON[g.group] || 'cpu', 17)}<span>${esc(g.group)}</span></div>
        <div class="skill-items">${g.items.map(tag).join('')}</div>
      </div>`).join('\n');

  const exp = renderExperience();

  const content = `
    <section class="hero container" data-parallax>
      <div class="hero-card glass" data-px>
        <div class="hero-main">
          <div class="hero-eyebrow">${icon('sparkles', 14)}<span>HELLO</span></div>
          <h1 class="hero-name">${esc(profile.name)}</h1>
          <p class="hero-title">${esc(profile.title)}</p>
          <p class="hero-tagline">${esc(profile.tagline)}</p>
          <div class="hero-contacts">
        ${heroContacts}
          </div>
        </div>
        <div class="hero-disc"><div class="hero-avatar"><img src="${esc(profile.avatar)}" srcset="${esc(profile.avatarSmall)} 256w, ${esc(profile.avatar)} 512w" sizes="(max-width: 760px) 118px, 188px" alt="${esc(profile.name)}" width="512" height="512" fetchpriority="high" decoding="async"></div></div>
        ${statsStrip}
      </div>
      <a class="scroll-cue" href="#about" aria-label="向下浏览" data-px>向下探索${icon('arrowUp', 14)}</a>
    </section>

    <nav class="rail" aria-label="页面章节" data-rail-nav>
      <a class="rail-item" href="#about" data-rail="about"><i aria-hidden="true"></i><span>关于</span></a>
      <a class="rail-item" href="#skills" data-rail="skills"><i aria-hidden="true"></i><span>技能</span></a>
      <a class="rail-item" href="#work" data-rail="work"><i aria-hidden="true"></i><span>项目</span></a>
      <a class="rail-item" href="#sites" data-rail="sites"><i aria-hidden="true"></i><span>网站</span></a>
      <a class="rail-item" href="#journal" data-rail="journal"><i aria-hidden="true"></i><span>文章</span></a>
      <a class="rail-item" href="#contact" data-rail="contact"><i aria-hidden="true"></i><span>联系</span></a>
    </nav>

    <section class="section container" id="about">
      ${sectionHead('user', 'About', '关于我', '', '01')}
      <div class="about-grid">
        <div class="card glass reveal corners">
          <div class="about-body">${(profile.about || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        </div>
        ${terminalBlock(false)}
      </div>
    </section>
    ${termDataJson()}

    <section class="section container" id="skills">
      ${sectionHead('cpu', 'Skills', '技能', '下面这些标签，都来自真正做完并上线的项目。', '02')}
      <div class="skill-groups">
${skills}
      </div>
    </section>

    <section class="section container" id="work">
      ${sectionHead('grid', 'Work', '精选项目', `${projects.length} 个从零做到上线的项目；公开的可以看代码，私有的只放简介。`, '03')}
      <div class="grid grid-auto">
${projects.map((p, i) => projectCard(p, i + 1, projects.length)).join('\n')}
      </div>
      <div class="btn-row mt-24"><a class="btn" href="/projects/">全部项目${icon('chevronRight', 15)}</a></div>
    </section>
${renderSites()}${renderJournal(latestPosts)}${exp}
    <section class="section container" id="contact">
      ${sectionHead('at', 'Contact', '联系我', '有事直接发邮件，或者在下面这些地方找到我。', '06')}
      <div class="card glass reveal contact-card corners">
${contactGroups}
${gamesGroup}
      </div>
    </section>

    <div class="qrmodal" data-qr-modal hidden aria-hidden="true">
      <div class="qrmodal-backdrop" data-qr-close></div>
      <div class="qrmodal-panel glass corners" role="dialog" aria-modal="true" aria-label="添加 QQ 好友">
        <div class="qrmodal-head">
          <span class="qrmodal-title">${icon('qq', 16)}<span>加我 QQ</span></span>
          <button class="icon-btn" type="button" data-qr-close aria-label="关闭">${icon('close', 16)}</button>
        </div>
        <div class="qrmodal-body">
          <img class="qrmodal-img" src="/assets/img/qq-card.jpg" alt="QQ 名片：looooong，QQ 号 1820100714，扫码加好友" width="981" height="1728" loading="lazy" decoding="async">
        </div>
        <div class="qrmodal-foot">
          <span class="qrmodal-qq">QQ：1820100714</span>
          <button class="btn btn-sm" type="button" data-copy-text="1820100714">${icon('copy', 14)}复制 QQ 号</button>
        </div>
      </div>
    </div>`;


  write('index.html', layout({ profile, title: '', description: profile.description, current: '/', path: '/', content }));
}

function siteCards() {
  return (profile.sites || []).map((s) => {
    const url = String(s.href || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `<a class="site-card glass reveal corners" href="${esc(s.href)}" target="_blank" rel="noopener">
      <div class="card-top">
        <div class="card-icon">${icon(s.icon || 'globe', 22)}</div>
        <span class="site-open" aria-hidden="true">${icon('arrowUpRight', 16)}</span>
      </div>
      <div class="site-name">${esc(s.name)}</div>
      <p class="card-subtitle">${esc(s.subtitle)}</p>
      <p class="card-summary">${esc(s.desc)}</p>
      <div class="site-url">${icon('globe', 13)}<span>${esc(url)}</span></div>
    </a>`;
  }).join('\n');
}

function renderSites() {
  if (!(profile.sites || []).length) return '';
  return `
    <section class="section container" id="sites">
      ${sectionHead('globe', 'Sites', '我的网站', '自己部署、长期在线的站点，点开就能用。', '04')}
      <div class="grid grid-3">
${siteCards()}
      </div>
      <div class="btn-row mt-24"><a class="btn" href="/sites/">全部网站${icon('chevronRight', 15)}</a></div>
    </section>
`;
}

function postCard(p) {
  return `<a class="post-item glass reveal" href="/blog/${p.slug}">
        <div class="post-meta"><span>${esc(p.fm.date || '')}</span>${p.fm.tags ? `<span>${esc(p.fm.tags)}</span>` : ''}</div>
        <div class="post-title">${esc(p.fm.title || p.slug)}</div>
        ${p.fm.summary ? `<div class="post-summary">${esc(p.fm.summary)}</div>` : ''}
      </a>`;
}

function renderJournal(posts) {
  if (!posts.length) return '';
  return `
    <section class="section container" id="journal">
      ${sectionHead('pen', 'Journal', '最近文章', '项目之外的复盘与笔记，想到就写。', '05')}
      <div class="grid grid-2">
${posts.map((p) => postCard(p)).join('\n')}
      </div>
      <div class="btn-row mt-24"><a class="btn" href="/blog/">全部文章${icon('chevronRight', 15)}</a></div>
    </section>
`;
}

/* ============================== 页面：网站 ============================== */

function renderSitesIndex() {
  const sites = profile.sites || [];
  const list = sites.length
    ? `<div class="grid grid-3">
${siteCards()}
      </div>`
    : `<div class="card glass empty-state reveal">
        <div class="empty-icon">${icon('globe', 24)}</div>
        <div class="empty-title">网站还在部署</div>
        <div class="empty-text">之后这里会放我自己部署的站点。暂时想看代码的话，去项目区逛逛。</div>
        <div class="btn-row mt-24"><a class="btn" href="/projects/">看看项目${icon('chevronRight', 15)}</a></div>
      </div>`;

  const content = `
    <div class="page-head container">
      <a class="backlink" href="/">${icon('arrowLeft', 15)}返回首页</a>
      <h1 class="page-title">网站</h1>
      <p class="page-lead">自己部署、长期在线的站点，点开就能用。</p>
    </div>
    <section class="section container">
${list}
    </section>`;
  write('sites/index.html', layout({ profile, title: '网站', description: 'loong 自己部署、长期在线的站点。', current: '/sites/', path: '/sites/', content }));
}

function renderExperience() {
  const exp = profile.experience || [];
  const edu = profile.education || [];
  if (!exp.length && !edu.length) return ''; // 经历为空 → 整块不渲染

  const item = (e) => `<div class="timeline-item">
        <div class="timeline-when">${esc(e.when || '')}</div>
        <div class="timeline-what">${esc(e.what || '')}</div>
        ${e.where ? `<div class="timeline-where">${esc(e.where)}</div>` : ''}
        ${e.desc ? `<div class="timeline-where">${esc(e.desc)}</div>` : ''}
      </div>`;

  return `
    <section class="section container" id="experience">
      ${sectionHead('briefcase', 'Experience', '经历')}
      <div class="card glass reveal">
        <div class="timeline">${exp.map(item).join('')}</div>
        ${edu.length ? `<div class="timeline">${edu.map(item).join('')}</div>` : ''}
      </div>
    </section>`;
}

/* ============================== 页面：项目 ============================== */

function renderProjectsIndex() {
  const pub = projects.filter((p) => p.visibility === 'public').length;
  const priv = projects.length - pub;
  const content = `
    <div class="page-head container">
      <a class="backlink" href="/">${icon('arrowLeft', 15)}返回首页</a>
      <h1 class="page-title">项目</h1>
      <p class="page-lead">一共 ${projects.length} 个：${pub} 个公开（可以看演示和源码），${priv} 个私有（只放简介，细节邮件聊）。</p>
    </div>
    <section class="section container">
      <div class="filter-row" data-filter-root>
        <button class="filter-chip is-active" type="button" data-filter="all">全部<span class="filter-n">${projects.length}</span></button>
        <button class="filter-chip" type="button" data-filter="public">公开<span class="filter-n">${pub}</span></button>
        <button class="filter-chip" type="button" data-filter="private">私有<span class="filter-n">${priv}</span></button>
      </div>
      <div class="grid grid-auto" data-project-grid>
${projects.map((p, i) => projectCard(p, i + 1, projects.length)).join('\n')}
      </div>
    </section>`;
  write('projects/index.html', layout({ profile, title: '项目', current: '/projects/', path: '/projects/', content }));
}

function renderMetrics(p) {
  if (!p.metrics || !p.metrics.length) return '';
  const cells = p.metrics.map((m) => {
    const mm = /^([0-9][0-9,]*(?:\.[0-9]+)?)([\s\S]*)$/.exec(String(m.v));
    const vHtml = mm
      ? `<span data-count="${mm[1].replace(/,/g, '')}" data-count-suffix="${esc(mm[2])}"${mm[1].indexOf(',') !== -1 ? ' data-count-group="1"' : ''}>${esc(m.v)}</span>`
      : esc(m.v);
    return `<div class="metric"><div class="metric-k">${esc(m.k)}</div><div class="metric-v">${vHtml}</div></div>`;
  }).join('');
  return `<div class="metrics">${cells}</div>`;
}

function renderProjectPage(p) {
  const isPublic = p.visibility === 'public';
  const actions = [];
  if (isPublic) {
    if (p.demo) actions.push(`<a class="btn btn-primary" href="${esc(p.demo)}" target="_blank" rel="noopener">${icon('globe', 17)}访问演示站</a>`);
    if (p.repoBrowser) actions.push(`<a class="btn" href="${esc(p.repoBrowser)}">${icon('code', 17)}浏览源码</a>`);
    if (p.repo) actions.push(`<a class="btn btn-ghost" href="https://github.com/${esc(p.repo)}" target="_blank" rel="noopener">${icon('github', 17)}在 GitHub 打开${icon('external', 13)}</a>`);
  }

  const repoCard = isPublic && repo
    ? `<section class="section container" id="source">
      ${sectionHead('terminal', 'Source', '源码', '仓库结构和 README 都做成了站内可读的页面。', '03')}
      <div class="card glass reveal corners">
        <div class="stat-strip">
          <div class="stat"><div class="stat-k">文件</div><div class="stat-v">${repo.tree.filter((e) => e.type === 'file').length} 个</div></div>
          <div class="stat"><div class="stat-k">目录</div><div class="stat-v">${repo.tree.filter((e) => e.type === 'dir').length} 个</div></div>
          <div class="stat"><div class="stat-k">仓库大小</div><div class="stat-v">${formatBytes(repo.size_kb * 1024)}</div></div>
          <div class="stat"><div class="stat-k">默认分支</div><div class="stat-v">${esc(repo.default_branch)}</div></div>
          <div class="stat"><div class="stat-k">最近更新</div><div class="stat-v">${esc(formatDate(repo.pushed_at))}</div></div>
        </div>
        <div class="btn-row mt-24">
          <a class="btn btn-primary" href="/projects/repo/guessword/">进入仓库浏览器${icon('chevronRight', 15)}</a>
          ${p.repo ? `<a class="btn btn-ghost" href="https://github.com/${esc(p.repo)}" target="_blank" rel="noopener">${icon('github', 16)}原始仓库${icon('external', 13)}</a>` : ''}
        </div>
      </div>
    </section>`
    : '';

  const privateNotice = isPublic ? '' : `<div class="notice mt-24">${icon('lock', 17)}<div>这是一个私有项目：仓库不公开，这里只放简介。想了解实现细节、或者看演示，直接发邮件给我。</div></div>`;

  const idx = projects.indexOf(p);
  const prevP = projects[(idx - 1 + projects.length) % projects.length];
  const nextP = projects[(idx + 1) % projects.length];

  const content = `
    <div class="page-head container" id="top" data-parallax data-px>
      <a class="backlink" href="/projects/">${icon('arrowLeft', 15)}返回项目列表</a>
      <div class="meta-row">
        ${isPublic ? badge('公开项目', 'public') : badge('私有项目', 'private')}
        <span class="card-year">${esc(p.year)}</span>
        <span class="card-year">${esc(p.subtitle)}</span>
      </div>
      <h1 class="page-title mt-8">${esc(p.name)}</h1>
      <p class="page-lead">${esc(p.summary)}</p>
      ${actions.length ? `<div class="btn-row mt-24">${actions.join('\n        ')}</div>` : ''}
      ${renderMetrics(p)}
      ${privateNotice}
    </div>

    <nav class="rail" aria-label="页面章节" data-rail-nav>
      <a class="rail-item" href="#top" data-rail="top"><i aria-hidden="true"></i><span>概览</span></a>
      <a class="rail-item" href="#highlights" data-rail="highlights"><i aria-hidden="true"></i><span>要点</span></a>
      <a class="rail-item" href="#story" data-rail="story"><i aria-hidden="true"></i><span>细节</span></a>
      ${repoCard ? '<a class="rail-item" href="#source" data-rail="source"><i aria-hidden="true"></i><span>源码</span></a>' : ''}
    </nav>

    <section class="section container" id="highlights">
      ${sectionHead('zap', 'Highlights', '项目要点', '', '01')}
      <div class="card glass reveal corners">
        <ul class="highlights">${(p.highlights || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      </div>
    </section>

    <section class="section container" id="story">
      ${sectionHead('pen', 'Story', '细节', '', '02')}
      <div class="card glass reveal corners">
        <div class="about-body">${(p.detail || []).map((d) => `<p>${esc(d)}</p>`).join('')}</div>
      </div>
    </section>
${repoCard}
    <section class="section container" id="tags">
      <div class="card-tags">${(p.tags || []).map(tag).join('')}</div>
    </section>

    <section class="section container">
      <div class="pager reveal">
        <a class="pager-item" href="/projects/${prevP.slug}">
          <span class="pager-k">${icon('arrowLeft', 13)}上一个</span>
          <span class="pager-v">${esc(prevP.name)}</span>
          <span class="pager-s">${esc(prevP.subtitle)}</span>
        </a>
        <a class="pager-item pager-next" href="/projects/${nextP.slug}">
          <span class="pager-k">下一个${icon('chevronRight', 13)}</span>
          <span class="pager-v">${esc(nextP.name)}</span>
          <span class="pager-s">${esc(nextP.subtitle)}</span>
        </a>
      </div>
    </section>`;

  write(`projects/${p.slug}.html`, layout({ profile, title: p.name, description: p.summary, current: '/projects/', path: `/projects/${p.slug}`, content }));
}

/* ============================== 页面：仓库浏览器 ============================== */

const REPO_BASE = '/projects/repo/guessword';

function repoChildren(dir) {
  const prefix = dir ? dir + '/' : '';
  const map = new Map();
  for (const e of repo.tree) {
    if (!e.path.startsWith(prefix)) continue;
    const rest = e.path.slice(prefix.length);
    if (!rest) continue;
    const seg = rest.split('/')[0];
    const nested = rest.includes('/');
    const cur = map.get(seg) || { name: seg, type: nested || e.type === 'dir' ? 'dir' : 'file', size: 0, count: 0 };
    if (cur.type === 'dir') {
      cur.count += 1;
      if (e.type === 'file') cur.size += e.size || 0;
    } else {
      cur.size = e.size || 0;
    }
    map.set(seg, cur);
  }
  return [...map.values()].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

function repoBreadcrumb(dir) {
  const parts = dir ? dir.split('/') : [];
  const items = [`<a href="${REPO_BASE}/">${esc(repo.name)}</a>`];
  let acc = '';
  parts.forEach((p, idx) => {
    acc += (acc ? '/' : '') + p;
    if (idx === parts.length - 1) items.push(`<span class="current">${esc(p)}</span>`);
    else items.push(`<a href="${REPO_BASE}/${acc}/">${esc(p)}</a>`);
  });
  return `<nav class="breadcrumb" aria-label="路径">${items.join('<span class="sep">/</span>')}</nav>`;
}

function fileRow(entry, baseDir) {
  const isDir = entry.type === 'dir';
  const prefix = baseDir ? baseDir + '/' : '';
  const href = isDir
    ? `${REPO_BASE}/${prefix}${entry.name}/`
    : `${REPO_BASE}/blob/${prefix}${entry.name.endsWith('.html') ? entry.name + '.src' : entry.name}`;
  const ic = isDir ? 'folder' : kindIcon(extOf(entry.name));
  const right = isDir
    ? `<span class="file-size">${entry.count} 项</span><span class="file-kind">${formatBytes(entry.size)}</span>`
    : `<span class="file-size">${formatBytes(entry.size)}</span><span class="file-kind">${esc(fileKind(extOf(entry.name)))}</span>`;
  return `<a class="file-row${isDir ? ' is-dir' : ''}" href="${href}">
        ${icon(ic, 17)}
        <span class="file-name">${esc(entry.name)}</span>
        ${right}
      </a>`;
}

function fileList(dir) {
  const entries = repoChildren(dir);
  if (!entries.length) return `<div class="file-empty">这个目录是空的</div>`;
  return `<div class="filelist-head"><span>名称</span><span>大小 / 类型</span></div>${entries.map((e) => fileRow(e, dir)).join('\n      ')}`;
}

function repoHead() {
  const langs = Object.entries(repo.languages || {}).sort((a, b) => b[1] - a[1]);
  const total = langs.reduce((s, [, v]) => s + v, 0) || 1;
  const top = langs.slice(0, 5);
  const segs = top.map(([, v]) => `<i class="lang-seg" style="width:${((v / total) * 100).toFixed(2)}%"></i>`).join('');
  const legend = top.map(([k, v], i) => `<span><i style="background:var(--${i === 0 ? 'text' : i === 1 ? 'text-2' : i === 2 ? 'text-3' : i === 3 ? 'line-strong' : 'line'})"></i>${esc(k)} ${((v / total) * 100).toFixed(1)}%</span>`).join('');

  return `<div class="repo-head glass corners reveal">
      <div class="repo-title-row">
        <span class="repo-title"><span class="repo-owner">${esc(repo.owner)} /</span> ${esc(repo.name)}</span>
        ${badge('公开', 'public')}
        <div class="repo-actions">
          <a class="btn btn-sm" href="/projects/guessword">${icon('sparkles', 15)}项目简介</a>
          ${repo.homepage ? `<a class="btn btn-sm" href="${esc(repo.homepage)}" target="_blank" rel="noopener">${icon('globe', 15)}演示站</a>` : ''}
          <a class="btn btn-sm btn-primary" href="https://github.com/${esc(repo.full_name)}" target="_blank" rel="noopener">${icon('github', 15)}GitHub${icon('external', 13)}</a>
        </div>
      </div>
      ${repo.description ? `<p class="page-lead mt-12">${esc(repo.description)}</p>` : ''}
      <div class="repo-stats">
        <div class="lang-bar">${segs}</div>
        <div class="lang-legend">${legend}</div>
      </div>
      <div class="repo-stats">
        <span>${icon('clock', 15)} 更新于 ${esc(formatDate(repo.pushed_at))}</span>
        <span>${icon('download', 15)} 站内同步于 ${esc(formatDate(repo.synced_at))}</span>
        <span>${icon('branch', 15)} ${esc(repo.default_branch)}</span>
        <span>${icon('file', 15)} ${repo.tree.filter((e) => e.type === 'file').length} 个文件</span>
        <span>${icon('box', 15)} ${formatBytes(repo.size_kb * 1024)}</span>
      </div>
    </div>`;
}

function readmeCard() {
  if (!repo.readme) return '';
  const html = fixRepoLinks(mdToHtml(repo.readme), repo.owner, repo.name, repo.default_branch);
  return `<div class="readme glass mt-24 reveal">
      <div class="readme-head">${icon('file', 15)}<span>README.md</span></div>
      <div class="prose">${html}</div>
    </div>`;
}

function renderRepoIndex() {
  const content = `
    <div class="page-head container">
      <a class="backlink" href="/projects/guessword">${icon('arrowLeft', 15)}返回项目简介</a>
      ${repoHead()}
    </div>
    <section class="section container">
      <div class="repo-layout">
        ${repoTreeAside('')}
        <div class="repo-main">
          <div class="filelist glass reveal">
      ${fileList('')}
          </div>
          ${readmeCard()}
        </div>
      </div>
    </section>
    ${repoTreeJson()}`;
  write('projects/repo/guessword/index.html', layout({ profile, title: `${repo.name} 仓库`, description: repo.description, current: '/projects/', path: '/projects/repo/guessword/', content }));
}

function renderRepoDir(dir) {
  const content = `
    <div class="page-head container">
      ${repoBreadcrumb(dir)}
      <a class="backlink" href="${REPO_BASE}/">${icon('arrowLeft', 15)}仓库根目录</a>
      <h1 class="page-title">${esc(dir)}/</h1>
    </div>
    <section class="section container">
      <div class="repo-layout">
        ${repoTreeAside(dir)}
        <div class="repo-main">
          <div class="filelist glass reveal">
      ${fileList(dir)}
          </div>
        </div>
      </div>
    </section>
    ${repoTreeJson()}`;
  write(`projects/repo/guessword/${dir}/index.html`, layout({ profile, title: `${repo.name}/${dir}`, current: '/projects/', path: `/projects/repo/guessword/${dir}/`, content }));
}

function renderRepoBlob(filePath) {
  const entry = repo.tree.find((e) => e.path === filePath) || { size: 0 };
  const ext = extOf(filePath);
  // 源文件本身以 .html 结尾时，生成的查看页加 .src，避免和目录 index 规则撞名
  const blobPath = filePath.endsWith('.html') ? `${filePath}.src` : filePath;
  const text = repo.files[filePath];
  const omitted = (repo.omitted || []).find((o) => o.path === filePath);
  const ghUrl = `https://github.com/${repo.owner}/${repo.name}/blob/${repo.default_branch}/${filePath}`;
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';

  let body = '';
  let meta = formatBytes(entry.size);

  if (typeof text === 'string') {
    let source = text;
    let prettyNote = '';
    if (ext === 'json') {
      try {
        const pretty = JSON.stringify(JSON.parse(source), null, 2);
        if (pretty.length < 900 * 1024) { source = pretty; prettyNote = '（已美化显示）'; }
      } catch { /* 保底原文 */ }
    }
    const lineCount = source.split('\n').length;
    meta = `${formatBytes(entry.size)} · ${lineCount} 行`;
    body = `<div class="code-card glass corners reveal">
      <div class="code-head">
        <span class="code-path">${icon(kindIcon(ext), 15)} ${esc(filePath)}</span>
        <span class="code-meta">${esc(meta)}${prettyNote ? ' ' + prettyNote : ''}</span>
        <button class="copy-btn" type="button" data-wrap-toggle title="切换自动换行">${icon('layers', 14)}换行</button>
        <button class="copy-btn" type="button" data-copy="#file-code">${icon('copy', 14)}复制</button>
        <a class="copy-btn" href="${esc(ghUrl)}" target="_blank" rel="noopener">${icon('external', 14)}GitHub</a>
      </div>
      <div class="code-scroll"><pre class="code"><code id="file-code">${hlCode(source, ext)}</code></pre></div>
    </div>`;
  } else {
    const reason = omitted && omitted.reason === 'too-large'
      ? `这个文件 ${formatBytes(entry.size)}，太大，不在站内展示（避免拖慢页面）。`
      : '这个文件是二进制或无法按文本读取，不在站内展示。';
    body = `<div class="card glass reveal">
      <div class="notice">${icon('box', 17)}<div>${esc(reason)}<br>可以直接去 GitHub 看原文件。</div></div>
      <div class="btn-row mt-24">
        <a class="btn btn-primary" href="${esc(ghUrl)}" target="_blank" rel="noopener">${icon('github', 16)}在 GitHub 查看${icon('external', 13)}</a>
      </div>
    </div>`;
  }

  const content = `
    <div class="page-head container">
      ${repoBreadcrumb(filePath)}
      <a class="backlink" href="${REPO_BASE}/${dir ? dir + '/' : ''}">${icon('arrowLeft', 15)}返回 ${dir || repo.name}</a>
      <h1 class="page-title">${esc(filePath.split('/').pop())}</h1>
      <div class="page-sub">${esc(filePath)}${typeof text === 'string' ? ` · ${esc(meta)}` : ''}<button class="path-copy" type="button" data-copy-text="${esc(filePath)}" title="复制文件路径">${icon('copy', 12)}复制路径</button></div>
    </div>
    <section class="section container">
      <div class="repo-layout">
        ${repoTreeAside(filePath)}
        <div class="repo-main">
          ${body}
        </div>
      </div>
    </section>
    ${repoTreeJson()}`;
  write(`projects/repo/guessword/blob/${blobPath}.html`, layout({ profile, title: filePath, current: '/projects/', path: `/projects/repo/guessword/blob/${blobPath}`, content }));
}

/* ============================== 页面：博客 ============================== */

function parsePost(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'content', 'blog', file), 'utf8');
  const slug = file.replace(/\.md$/, '');
  let fm = {};
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const block = raw.slice(3, end).trim();
      body = raw.slice(end + 4).replace(/^\r?\n/, '');
      for (const line of block.split(/\r?\n/)) {
        const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.trim());
        if (m) fm[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return { slug, fm, body };
}

function readPosts() {
  const dir = path.join(ROOT, 'content', 'blog');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  return files.map(parsePost).sort((a, b) => String(b.fm.date || '').localeCompare(String(a.fm.date || '')));
}

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function readingMinutes(html) {
  const text = stripTags(html);
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}

/* 给 h2/h3 加锚点，并抽出目录数据 */
function postBodyHtml(md) {
  const heads = [];
  let n = 0;
  const html = mdToHtml(md).replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    n += 1;
    const id = `sec-${n}`;
    heads.push({ level: Number(level), id, text: stripTags(inner) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html, heads };
}

function renderToc(heads, extra = '') {
  return `<nav class="toc${extra ? ' ' + extra : ''}" aria-label="文章目录" data-toc>
        <span class="toc-indicator" aria-hidden="true"></span>
        <div class="toc-title">ON THIS PAGE</div>
${heads.map((h) => `<a class="toc-link toc-l${h.level}" href="#${h.id}">${esc(h.text)}</a>`).join('\n')}
      </nav>`;
}

function postPager(posts, idx) {
  if (posts.length < 2) return '';
  const newer = idx > 0 ? posts[idx - 1] : null;
  const older = idx < posts.length - 1 ? posts[idx + 1] : null;
  const link = (p, cls, label, iconName, iconAfter) => `<a class="pager-item${cls ? ' ' + cls : ''}" href="/blog/${p.slug}">
          <span class="pager-k">${iconAfter ? `${label}${icon(iconName, 13)}` : `${icon(iconName, 13)}${label}`}</span>
          <span class="pager-v">${esc(p.fm.title || p.slug)}</span>
          <span class="pager-s">${esc(p.fm.date || '')}</span>
        </a>`;
  return `<div class="pager post-pager mt-24">
        ${newer ? link(newer, '', '上一篇', 'arrowLeft', false) : ''}
        ${older ? link(older, 'pager-next', '下一篇', 'chevronRight', true) : ''}
      </div>`;
}

function renderBlog() {
  const posts = readPosts();

  const list = posts.length
    ? `<div class="post-list">${posts.map((p) => postCard(p)).join('\n')}</div>`
    : `<div class="card glass empty-state reveal">
        <div class="empty-icon">${icon('pen', 24)}</div>
        <div class="empty-title">文章还在路上</div>
        <div class="empty-text">这里之后会放技术笔记和项目复盘。暂时先留个位置——想看代码的话，去项目区逛逛。</div>
        <div class="btn-row mt-24"><a class="btn" href="/projects/">看看项目${icon('chevronRight', 15)}</a></div>
      </div>`;

  const content = `
    <div class="page-head container">
      <a class="backlink" href="/">${icon('arrowLeft', 15)}返回首页</a>
      <h1 class="page-title">博客</h1>
      <p class="page-lead">${posts.length ? `一共 ${posts.length} 篇。` : '技术笔记与项目复盘，慢慢写。'}</p>
    </div>
    <section class="section container">
${list}
    </section>`;
  write('blog/index.html', layout({ profile, title: '博客', current: '/blog/', path: '/blog/', content }));

  posts.forEach((p, i) => {
    const { html, heads } = postBodyHtml(p.body);
    const minutes = readingMinutes(html);
    const hasToc = heads.length >= 2;
    const tocDesktop = hasToc ? `<aside class="post-aside">${renderToc(heads)}</aside>` : '';
    const tocMobile = hasToc ? `<details class="toc-mobile">
        <summary><span>文章目录</span><span class="toc-sum"><span class="toc-count">${heads.length} 节</span>${icon('chevronRight', 14)}</span></summary>
        ${renderToc(heads, 'toc-inline')}
      </details>` : '';
    const body = `<article class="card glass reveal post-article">
      <div class="post-meta"><span>${esc(p.fm.date || '')}</span><span>约 ${minutes} 分钟</span></div>
      <h1 class="page-title mt-8">${esc(p.fm.title || p.slug)}</h1>
      ${tocMobile}
      <div class="prose mt-24">${html}</div>
      ${postPager(posts, i)}
    </article>`;
    const c = `
    <div class="page-head container">
      <a class="backlink" href="/blog/">${icon('arrowLeft', 15)}返回博客</a>
    </div>
    <section class="container post-section">
      <div class="post-layout${hasToc ? ' has-toc' : ''}">
        ${tocDesktop}
        <div class="post-main">
${body}
        </div>
      </div>
    </section>`;
    write(`blog/${p.slug}.html`, layout({ profile, title: p.fm.title || p.slug, description: p.fm.summary || '', current: '/blog/', path: `/blog/${p.slug}`, content: c, readRing: true }));
  });
  return posts.length;
}

/* ============================== 其他 ============================== */

function renderNotFound() {
  const content = `
    <div class="container page-head">
      <h1 class="page-title">404</h1>
      <p class="page-lead">这条路径不存在——试试用终端找路，或者从下面回去。</p>
    </div>
    <section class="section container">
      ${terminalBlock(true)}
      <div class="btn-row mt-24">
        <a class="btn btn-primary" href="/">${icon('home', 16)}回首页</a>
        <a class="btn" href="/projects/">看项目</a>
      </div>
    </section>
    ${termDataJson()}`;
  write('404.html', layout({ profile, title: '404', current: '', path: '/404', content }));
}

function renderRobotsAndSitemap() {
  const base = profile.siteUrl.replace(/\/$/, '');
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);

  const blogDir = path.join(ROOT, 'content', 'blog');
  const postUrls = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.md')).map((f) => `/blog/${f.replace(/\.md$/, '')}`)
    : [];
  const urls = ['/', '/projects/', '/sites/', '/blog/', ...postUrls, ...projects.map((p) => `/projects/${p.slug}`)];
  if (repo) {
    urls.push('/projects/repo/guessword/');
    for (const e of repo.tree.filter((x) => x.type === 'dir')) urls.push(`/projects/repo/guessword/${e.path}/`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
  write('sitemap.xml', xml);
}

/* ============================== 主流程 ============================== */

renderHome();
renderProjectsIndex();
renderSitesIndex();
for (const p of projects) renderProjectPage(p);

if (repo) {
  renderRepoIndex();
  for (const e of repo.tree.filter((x) => x.type === 'dir')) renderRepoDir(e.path);
  for (const e of repo.tree.filter((x) => x.type === 'file')) renderRepoBlob(e.path);
} else {
  console.warn('! 缺少 data/repos/guessword.json —— 先跑 npm run sync');
}

const postCount = renderBlog();
renderNotFound();
renderRobotsAndSitemap();

console.log(`构建完成：${written.length} 个页面`);
for (const [rel, size] of written.sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${(size / 1024).toFixed(1).padStart(8)} KB  ${rel}`);
}
console.log(`  其余 ${Math.max(0, written.length - 6)} 个页面…`);
console.log(`  博客文章：${postCount} 篇${postCount ? '' : '（空状态）'}`);
