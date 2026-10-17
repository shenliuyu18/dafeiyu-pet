'use strict';

// 组装 Wails 前端目录：复用 renderer/ 与 assets/，把 ../assets/ 改成 assets/
// 用法：node tools/wails-prepare.js

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const srcRenderer = path.join(root, 'renderer');
// --lite 使用 tools/build-lite-assets.py 生成的压缩素材；完整版始终用原始素材
const lite = process.argv.includes('--lite');
const srcAssets = path.join(root, lite ? 'assets-lite' : 'assets');
const out = path.join(root, 'wails', 'frontend', 'dist');
if (!fs.existsSync(srcAssets)) {
  console.error(`[wails-prepare] 缺少素材目录: ${srcAssets}${lite ? '（先运行 python tools/build-lite-assets.py）' : ''}`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of ['index.html', 'style.css', 'pet.js']) {
  fs.copyFileSync(path.join(srcRenderer, f), path.join(out, f));
}
fs.copyFileSync(path.join(root, 'wails', 'frontend', 'api.js'), path.join(out, 'api.js'));


// Go embed 不接受中文文件名；把 assets 原字节装进 store-only zip，
// 运行时由虚拟 fs 直接读取（不做有损压缩，文件名保持原样）。
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildAssetsZip() {
  const files = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) files.push({ full, name: `assets/${r}`, data: fs.readFileSync(full) });
    }
  };
  walk(srcAssets, '');
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    lh.writeUInt16LE(0, 8);      // store，不压缩
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(size, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + f.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.writeFileSync(path.join(out, 'assets.zip'), Buffer.concat([...local, centralBuf, eocd]));
  console.log(`[wails-prepare] assets.zip (${lite ? 'lite 压缩素材' : '完整原素材'}): ${files.length} files, ${(offset / 1048576).toFixed(1)}MB (store)`);
}
buildAssetsZip();

const rewrite = (f) => {
  const p = path.join(out, f);
  let s = fs.readFileSync(p, 'utf8');
  s = s.split('../assets/').join('assets/');
  fs.writeFileSync(p, s);
};
rewrite('index.html');
rewrite('pet.js');
rewrite('style.css');

// Wails 运行时由 WebView2 注入；为 Wails 副本放宽 CSP，避免本地 runtime/事件被拦
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: file: blob:; style-src \'self\' \'unsafe-inline\'; script-src \'self\' \'unsafe-inline\'; img-src \'self\' data: file: blob:; media-src \'self\' file: blob:; font-src \'self\' file: data:; connect-src \'self\' ws: wss: http: https:;">',
);
html = html.replace('<link rel="stylesheet" href="style.css">', `<link rel="stylesheet" href="style.css?v=${pkg.version}">`);
html = html.replace('<script src="assets/anims/index.js"></script>', `<script src="assets/anims/index.js?v=${pkg.version}"></script>`);
html = html.replace('<script src="pet.js"></script>', `<script src="api.js?v=${pkg.version}"></script>
<script src="pet.js?v=${pkg.version}"></script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);

const count = (dir) => {
  let n = 0;
  let bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = count(p);
      n += sub.n;
      bytes += sub.bytes;
    } else {
      n++;
      bytes += fs.statSync(p).size;
    }
  }
  return { n, bytes };
};
const c = count(out);
console.log(`[wails-prepare] ${c.n} files, ${(c.bytes / 1048576).toFixed(1)}MB -> ${out}`);
