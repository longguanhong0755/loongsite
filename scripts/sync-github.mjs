// 抓取 GitHub 仓库数据 → data/repos/<repo>.json
// 只读抓取；token 从 .env.local 读取（该文件已被 .gitignore 忽略）。
// 用法：node scripts/sync-github.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OWNER = 'longguanhong0755';
const REPO = 'guessword';

/** 单文件超过该大小不进站内查看（只显示元信息 + GitHub 跳转） */
const MAX_BAKE = 256 * 1024;
/** 抓取大文件上限，超过直接不下载 */
const MAX_FETCH = 1024 * 1024;

const TEXT_EXT = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'css', 'html', 'htm', 'sh', 'bash',
  'json', 'toml', 'yml', 'yaml', 'md', 'txt', 'gitignore', 'gitattributes', 'ini', 'conf', 'csv'
]);

function readEnv() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*(.+)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = readEnv();
const TOKEN = process.env.GITHUB_TOKEN || env.GITHUB_TOKEN || '';
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN（.env.local 或环境变量）');
  process.exit(1);
}

const API = 'https://api.github.com';
const HEADERS = {
  authorization: `Bearer ${TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'loongsite-build'
};

async function apiJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchBlobText(sha) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/git/blobs/${sha}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`blob ${sha}: ${res.status}`);
  const data = await res.json();
  const buf = Buffer.from(data.content || '', 'base64');
  if (buf.includes(0)) return null; // 二进制
  return buf.toString('utf8');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  console.log(`→ 抓取 ${OWNER}/${REPO}`);

  const [meta, languages, treeRes, readmeRes] = await Promise.all([
    apiJson(`${API}/repos/${OWNER}/${REPO}`),
    apiJson(`${API}/repos/${OWNER}/${REPO}/languages`),
    apiJson(`${API}/repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent('HEAD')}?recursive=1`),
    fetch(`${API}/repos/${OWNER}/${REPO}/readme`, {
      headers: { ...HEADERS, accept: 'application/vnd.github.raw' }
    }).then((r) => (r.ok ? r.text() : ''))
  ]);

  const tree = (treeRes.tree || [])
    .filter((e) => e.type === 'blob' || e.type === 'tree')
    .map((e) => ({ path: e.path, type: e.type === 'blob' ? 'file' : 'dir', size: e.size || 0, sha: e.sha }));

  const blobs = tree.filter((e) => e.type === 'file');
  console.log(`  文件 ${blobs.length} 个 / 目录 ${tree.length - blobs.length} 个`);

  const candidates = blobs.filter((f) => {
    const ext = f.path.includes('.') ? f.path.split('.').pop().toLowerCase() : '';
    if (!TEXT_EXT.has(ext)) return false;
    if (f.size > MAX_FETCH) return false;
    return true;
  });

  const files = {};
  const omitted = [];

  await mapLimit(candidates, 8, async (f) => {
    const ext = f.path.split('.').pop().toLowerCase();
    const binnable = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'woff', 'woff2', 'pdf', 'zip'];
    if (binnable.includes(ext)) {
      omitted.push({ path: f.path, size: f.size, reason: 'binary' });
      return;
    }
    if (f.size > MAX_BAKE) {
      omitted.push({ path: f.path, size: f.size, reason: 'too-large' });
      return;
    }
    try {
      const text = await fetchBlobText(f.sha);
      if (text === null) {
        omitted.push({ path: f.path, size: f.size, reason: 'binary' });
        return;
      }
      files[f.path] = text;
      console.log(`  ✓ ${f.path} (${(f.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      omitted.push({ path: f.path, size: f.size, reason: 'error' });
      console.warn(`  ! ${f.path}: ${err.message}`);
    }
  });

  // 没有进 files 的（非文本类型）也要记录
  for (const f of blobs) {
    if (files[f.path]) continue;
    if (omitted.some((o) => o.path === f.path)) continue;
    omitted.push({ path: f.path, size: f.size, reason: 'skipped' });
  }

  const out = {
    synced_at: new Date().toISOString(),
    owner: OWNER,
    name: REPO,
    full_name: meta.full_name,
    description: meta.description || '',
    homepage: meta.homepage || '',
    default_branch: meta.default_branch || 'main',
    created_at: meta.created_at,
    pushed_at: meta.pushed_at,
    stars: meta.stargazers_count || 0,
    forks: meta.forks_count || 0,
    watchers: meta.subscribers_count || 0,
    size_kb: meta.size || 0,
    license: meta.license ? meta.license.spdx_id : null,
    topics: meta.topics || [],
    languages,
    tree,
    readme: readmeRes || '',
    files,
    omitted
  };

  const dir = path.join(ROOT, 'data', 'repos');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${REPO}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`→ 写入 ${path.relative(ROOT, file)}（${kb} KB；站内可读 ${Object.keys(files).length} 个文件，元信息-only ${omitted.length} 个）`);
}

main().catch((err) => {
  console.error('同步失败：', err.message);
  process.exit(1);
});
