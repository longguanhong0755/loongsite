#!/usr/bin/env bash
# 部署到 Cloudflare Pages（当前线上入口：https://loongsite.pages.dev，国内可直连）
# 说明：这是固定入口，哪天服务器通了想切回去，改 DNSPod 记录即可（见 README）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi
: "${CLOUDFLARE_API_TOKEN:?请在 .env.local 里设置 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?请在 .env.local 里设置 CLOUDFLARE_ACCOUNT_ID}"
PROJECT="${LOONGSITE_CF_PROJECT:-loongsite}"

echo "== 1/3 构建 =="
node scripts/build.mjs | tail -2

echo "== 2/3 打包（只含运行时文件）=="
rm -rf _dist && mkdir -p _dist
cp -r index.html 404.html robots.txt sitemap.xml assets projects blog _dist/
echo "   $(find _dist -type f | wc -l) 个文件 / $(du -sh _dist | cut -f1)"

echo "== 3/3 上传到 Cloudflare Pages =="
wrangler pages deploy _dist --project-name="$PROJECT" --branch=main --commit-dirty=true
echo
echo "线上地址：https://$PROJECT.pages.dev"
