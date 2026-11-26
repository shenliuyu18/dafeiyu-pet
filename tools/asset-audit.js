'use strict';

// 素材审计：总量、重复内容、未被引用的梗图、大文件。
// 用法：node tools/asset-audit.js [--json]
// 只读，不修改任何文件。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const json = process.argv.includes('--json');

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...walk(full, r));
    else if (e.isFile()) out.push({ full, rel: r.split(path.sep).join('/'), size: fs.statSync(full).size });
  }
  return out;
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function collectReferences() {
  const refs = new Set();
  const textFiles = [];
  for (const d of ['renderer', 'wails/frontend']) {
    const base = path.join(root, d);
    if (!fs.existsSync(base)) continue;
    for (const f of walk(base)) {
      if (/\.(js|html|css)$/.test(f.full)) textFiles.push(f.full);
    }
  }
  for (const file of textFiles) {
    const s = fs.readFileSync(file, 'utf8');
    for (const m of s.matchAll(/(?:\.\.\/)?assets\/([^'"\s)`]+?\.(?:png|jpe?g|webp|webm|wav|mp3|ttf|otf|woff2?|txt|ico))/g)) {
      refs.add(`assets/${m[1]}`);
    }
    for (const m of s.matchAll(/\{ file: '([^']+)', ext: '([^']+)'/g)) {
      refs.add(`assets/memes/archive/${m[1]}.${m[2]}`);
    }
    for (const m of s.matchAll(/\{ file: '([^']+)', ext: '([^']+)',[^}]*dir: '\.\.\/assets\/memes\/'/g)) {
      refs.add(`assets/memes/${m[1]}.${m[2]}`);
    }
  }
  // 经典梗图：dialogue-data.js 的 MEMES 里是裸文件名，运行时拼成 .webp
  const dialogue = path.join(root, 'renderer', 'lib', 'dialogue-data.js');
  if (fs.existsSync(dialogue)) {
    const s = fs.readFileSync(dialogue, 'utf8');
    const block = s.slice(s.indexOf('const MEMES'), s.indexOf('const CLASSIC_MEME_TEXTS'));
    for (const m of block.matchAll(/'([^']+)'/g)) refs.add(`assets/memes/${m[1]}.webp`);
  }
  return refs;
}

const files = walk(assetsDir);
const refs = collectReferences();
const total = files.reduce((s, f) => s + f.size, 0);
const byDir = {};
const byExt = {};
for (const f of files) {
  const top = f.rel.split('/')[0];
  byDir[top] = (byDir[top] || 0) + f.size;
  const ext = path.extname(f.rel).slice(1).toLowerCase() || '(none)';
  byExt[ext] = (byExt[ext] || 0) + f.size;
}

const hashes = new Map();
const dupes = [];
for (const f of files) {
  const h = sha256(f.full);
  if (hashes.has(h)) dupes.push([hashes.get(h), f.rel, f.size]);
  else hashes.set(h, f.rel);
}

const memeRefs = [...refs].filter((r) => r.startsWith('assets/memes/'));
const unreferenced = files
  .filter((f) => f.rel.startsWith('memes/') && !refs.has(`assets/${f.rel}`))
  .map((f) => ({ rel: f.rel, size: f.size }));

const big = files.filter((f) => f.size >= 1024 * 1024).sort((a, b) => b.size - a.size).slice(0, 15);

const report = {
  totalBytes: total,
  totalMB: +(total / 1048576).toFixed(2),
  byDirMB: Object.fromEntries(Object.entries(byDir).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])),
  byExtMB: Object.fromEntries(Object.entries(byExt).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])),
  duplicates: dupes.map(([a, b, size]) => ({ a, b, size })),
  duplicateBytes: dupes.reduce((s, d) => s + d[2], 0),
  referencedMemeFiles: memeRefs.length,
  unreferencedMemes: unreferenced,
  largestFiles: big.map((f) => ({ rel: f.rel, MB: +(f.size / 1048576).toFixed(2) })),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`素材总量：${report.totalMB} MB`);
  console.log('按目录：', report.byDirMB);
  console.log('按格式：', report.byExtMB);
  console.log(`重复文件：${dupes.length} 组，可回收 ${(report.duplicateBytes / 1048576).toFixed(2)} MB`);
  for (const d of dupes.slice(0, 10)) console.log(`  - ${d.a} == ${d.b} (${(d.size / 1048576).toFixed(2)} MB)`);
  console.log(`梗图引用：${memeRefs.length} 个；未被引用：${unreferenced.length} 个`);
  for (const u of unreferenced.slice(0, 20)) console.log(`  - ${u.rel} (${(u.size / 1048576).toFixed(2)} MB)`);
  console.log('最大的文件：');
  for (const f of report.largestFiles) console.log(`  - ${f.rel} (${f.MB} MB)`);
}