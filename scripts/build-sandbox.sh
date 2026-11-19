#!/bin/bash
# Sandbox-only build (esbuild + standalone Tailwind) for local verification when npm install is unavailable.
# The real build is `npm run build` (Vite). Output goes to .scratch/web (git-ignored).
set -e
cd "$(dirname "$0")/.."
W=.scratch/web; rm -rf $W && mkdir -p $W/assets
NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/esbuild src/main.tsx --bundle --splitting --format=esm --outdir=$W/assets --entry-names=[name] --chunk-names=chunk-[hash] --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --loader:.css=empty --log-level=warning
TW=$(ls /tmp/claude-0/-home-claude/*/scratchpad/tw/tailwindcss | head -1)
$TW -c tailwind.config.js -i src/index.css -o $W/assets/main.css --minify 2>&1 | tail -1
cp public/* $W/ 2>/dev/null || true
sed -e 's#<script type="module" src="/src/main.tsx">#<link rel="stylesheet" href="/assets/main.css"><script type="module" src="/assets/main.js">#' index.html > $W/index.html
ls -la $W/assets | head -8
