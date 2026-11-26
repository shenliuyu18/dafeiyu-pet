'use strict';

// 组装 Wails 前端目录：复用 renderer/ 与 assets/，把 ../assets/ 改成 assets/
// 用法：node tools/wails-prepare.js

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

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

for (const f of ['index.html', 'style.css', 'archive-memes.js', 'dsh-memes.js', 'pet.js', 'app-state.js']) {
  fs.copyFileSync(path.join(srcRenderer, f), path.join(out, f));
}
fs.mkdirSync(path.join(out, 'lib'), { recursive: true });
for (const f of ['format.js', 'i18n.js', 'lines-i18n.js', 'memes-i18n.js', 'meme-gallery-i18n.js', 'ui-i18n.js', 'action-i18n.js', 'pack-action-i18n.js', 'geometry-config.js', 'dialogue-data.js', 'motion.js', 'meme-queue.js', 'bubble-layout.js', 'meme-pool.js', 'anim-actions.js', 'frame-schedule.js', 'power-save.js', 'store-progress.js', 'settings-payload.js', 'time-format.js', 'pet-rect.js', 'region-box.js', 'legacy-pack-sprite.js', 'anim.js']) {
  fs.copyFileSync(path.join(srcRenderer, 'lib', f), path.join(out, 'lib', f));
}
fs.mkdirSync(path.join(out, 'features'), { recursive: true });
for (const f of fs.readdirSync(path.join(srcRenderer, 'features'))) {
  if (f.endsWith('.js')) fs.copyFileSync(path.join(srcRenderer, 'features', f), path.join(out, 'features', f));
}
fs.copyFileSync(path.join(root, 'wails', 'frontend', 'api.js'), path.join(out, 'api.js'));


// Go embed 不接受中文文件名；把 assets 原字节装进 store-only zip，
// 运行时由虚拟 fs 直接读取（不做有损压缩，文件名保持原样）。
// 逐文件流式写入：峰值内存只跟最大的单个文件 + 1MB 缓冲有关，
// 不再把所有素材读进数组后 Buffer.concat（旧实现峰值 ≥222MB）。
function writeAll(fd, buf, position) {
  let off = 0;
  while (off < buf.length) {
    const n = position === undefined
      ? fs.writeSync(fd, buf, off, buf.length - off)
      : fs.writeSync(fd, buf, off, buf.length - off, position + off);
    if (n <= 0) throw new Error('写入 assets.zip 失败');
    off += n;
  }
}

function buildAssetsZip() {
  const files = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) files.push({ full, name: `assets/${r}` });
    }
  };
  walk(srcAssets, '');

  const zipPath = path.join(out, 'assets.zip');
  const fd = fs.openSync(zipPath, 'w');
  const central = [];
  const chunk = Buffer.alloc(1024 * 1024);
  let offset = 0;
  let totalBytes = 0;
  try {
    for (const f of files) {
      const name = Buffer.from(f.name, 'utf8');
      const size = fs.statSync(f.full).size;
      const headerPos = offset;
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0800, 6); // UTF-8 文件名
      lh.writeUInt16LE(0, 8);      // store，不压缩
      lh.writeUInt16LE(0, 10);
      lh.writeUInt16LE(0, 12);
      lh.writeUInt32LE(0, 14);     // CRC 先占位，流式读完再回填
      lh.writeUInt32LE(size, 18);
      lh.writeUInt32LE(size, 22);
      lh.writeUInt16LE(name.length, 26);
      lh.writeUInt16LE(0, 28);
      writeAll(fd, lh);
      writeAll(fd, name);

      const inFd = fs.openSync(f.full, 'r');
      let left = size;
      let crc = 0;
      try {
        while (left > 0) {
          const n = fs.readSync(inFd, chunk, 0, Math.min(chunk.length, left), null);
          if (n <= 0) throw new Error(`读取素材失败: ${f.full}`);
          writeAll(fd, chunk.subarray(0, n));
          crc = zlib.crc32(chunk.subarray(0, n), crc);
          left -= n;
        }
      } finally {
        fs.closeSync(inFd);
      }
      crc = crc >>> 0;
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32LE(crc, 0);
      writeAll(fd, crcBuf, headerPos + 14);

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
      offset += lh.length + name.length + size;
      totalBytes += size;
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
    writeAll(fd, centralBuf);
    writeAll(fd, eocd);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  console.log(`[wails-prepare] assets.zip (${lite ? 'lite 压缩素材' : '完整原素材'}): ${files.length} files, ${(totalBytes / 1048576).toFixed(1)}MB (store)`);
}
buildAssetsZip();

const rewrite = (f) => {
  const p = path.join(out, f);
  let s = fs.readFileSync(p, 'utf8');
  s = s.split('../assets/').join('assets/');
  // 已安装形象包的封面与动画都拼成 ../characters/<id>/...；打包后页面就在资源根，
  // '../' 会跳出根导致 AssetServer 404（商店卡片裂图、包形象不出图）。
  s = s.split('../characters/').join('characters/');
  fs.writeFileSync(p, s);
};
rewrite('index.html');
rewrite('pet.js');
rewrite('style.css');
rewrite('archive-memes.js');
rewrite('dsh-memes.js');
// features 下也有 characters 路径（形象包封面、动作、气泡梗图），同样要改写
for (const f of fs.readdirSync(path.join(out, 'features'))) {
  if (f.endsWith('.js')) rewrite(path.join('features', f));
}

// Wails 运行时由 WebView2 注入；为 Wails 副本放宽 CSP，避免本地 runtime/事件被拦
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: file: blob:; style-src \'self\' \'unsafe-inline\'; script-src \'self\' \'unsafe-inline\'; img-src \'self\' data: file: blob:; media-src \'self\' file: blob:; font-src \'self\' file: data:; connect-src \'self\' ws: wss: http: https:;">',
);
html = html.replace('<link rel="stylesheet" href="style.css">', `<link rel="stylesheet" href="style.css?v=${pkg.version}">`);
html = html.replace('<script src="assets/anims/index.js"></script>', `<script>window.__DAFEIYU_LITE = ${lite ? 'true' : 'false'};</script>
<script src="assets/anims/index.js?v=${pkg.version}"></script>`);
html = html.replace('<script src="archive-memes.js"></script>', `<script src="archive-memes.js?v=${pkg.version}"></script>`);
html = html.replace('<script src="dsh-memes.js"></script>', `<script src="dsh-memes.js?v=${pkg.version}"></script>`);
html = html.replace('<script src="app-state.js"></script>', `<script src="app-state.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/lines-i18n.js"></script>', `<script src="lib/lines-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/geometry-config.js"></script>', `<script src="lib/geometry-config.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/dialogue-data.js"></script>', `<script src="lib/dialogue-data.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/memes-i18n.js"></script>', `<script src="lib/memes-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/meme-gallery-i18n.js"></script>', `<script src="lib/meme-gallery-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/ui-i18n.js"></script>', `<script src="lib/ui-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/action-i18n.js"></script>', `<script src="lib/action-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/pack-action-i18n.js"></script>', `<script src="lib/pack-action-i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/i18n.js"></script>', `<script src="lib/i18n.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/format.js"></script>', `<script src="lib/format.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/motion.js"></script>', `<script src="lib/motion.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/meme-queue.js"></script>', `<script src="lib/meme-queue.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/bubble-layout.js"></script>', `<script src="lib/bubble-layout.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/meme-pool.js"></script>', `<script src="lib/meme-pool.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/anim-actions.js"></script>', `<script src="lib/anim-actions.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/frame-schedule.js"></script>', `<script src="lib/frame-schedule.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/power-save.js"></script>', `<script src="lib/power-save.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/store-progress.js"></script>', `<script src="lib/store-progress.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/settings-payload.js"></script>', `<script src="lib/settings-payload.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/time-format.js"></script>', `<script src="lib/time-format.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/pet-rect.js"></script>', `<script src="lib/pet-rect.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/region-box.js"></script>', `<script src="lib/region-box.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/legacy-pack-sprite.js"></script>', `<script src="lib/legacy-pack-sprite.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="lib/anim.js"></script>', `<script src="lib/anim.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/animation-data.js"></script>', `<script src="features/animation-data.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/character-settings.js"></script>', `<script src="features/character-settings.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/fs-diag.js"></script>', `<script src="features/fs-diag.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/settings-toggles.js"></script>', `<script src="features/settings-toggles.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/usage.js"></script>', `<script src="features/usage.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/picker-pins.js"></script>', `<script src="features/picker-pins.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/settings-content.js"></script>', `<script src="features/settings-content.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/update.js"></script>', `<script src="features/update.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/pomodoro.js"></script>', `<script src="features/pomodoro.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/bubble.js"></script>', `<script src="features/bubble.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/interaction.js"></script>', `<script src="features/interaction.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/hit.js"></script>', `<script src="features/hit.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/dialogue.js"></script>', `<script src="features/dialogue.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/sprite.js"></script>', `<script src="features/sprite.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/animation-playback.js"></script>', `<script src="features/animation-playback.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/actions.js"></script>', `<script src="features/actions.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/lifecycle.js"></script>', `<script src="features/lifecycle.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/loop.js"></script>', `<script src="features/loop.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/runtime.js"></script>', `<script src="features/runtime.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/status.js"></script>', `<script src="features/status.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/picker.js"></script>', `<script src="features/picker.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/menu.js"></script>', `<script src="features/menu.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/confirm.js"></script>', `<script src="features/confirm.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/ledger-format.js"></script>', `<script src="features/ledger-format.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/animation.js"></script>', `<script src="features/animation.js?v=${pkg.version}"></script>`);
  html = html.replace('<script src="features/settings.js"></script>', `<script src="features/settings.js?v=${pkg.version}"></script>`);
html = html.replace('<script src="features/pointer-events.js"></script>', `<script src="features/pointer-events.js?v=${pkg.version}"></script>`);
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





















