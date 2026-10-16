'use strict';

// 一次性素材压缩脚本：把 assets/anims/*.webm 重新编码到更小体积
//   node tools/shrink-anims.js
// 两档策略：
//   核心动画（常驻可见：待机/移动/拖拽/点击/吃饭/睡觉/工作）crf 46 @ 24fps
//   其余小节目 crf 52 @ 16fps
// 注意：必须用 libvpx-vp9 解码器读入（原生 vp9 解码器会丢 alpha 通道，编码出来变不透明）
// 原始文件请先备份；编码结果先落临时文件，逐个校验（ALPHA_MODE/时长/透明通道）通过后才覆盖。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const ANIM_DIR = path.join(__dirname, '..', 'assets', 'anims');
const TMP_DIR = path.join(ANIM_DIR, '.shrink-tmp');

const CORE = new Set([
  '待机呼吸休闲', '原地漂浮踏步', '螃蟹走路', '原地左转奔跑',
  '被鼠标拖拽悬空反馈', '原地小憩沉眠',
  '工作状态-垂头叹气冒汗', '工作状态-雀跃庆祝',
  '写代码', '工作状态-思考冒泡', '工作状态-忙碌点按', '工作状态-清点归档',
  '点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑', '点击回应-元气挥手',
  '吃白饭', '吃Token', '大口吃零食',
]);
const CORE_CRF = 46;
const CORE_FPS = 0; // 保持原帧率
const REST_CRF = 52;
const REST_FPS = 16;

const ff = (args) => spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
const probe = (file) =>
  spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream_tags=ALPHA_MODE', '-of', 'default=noprint_wrappers=1', file], {
    encoding: 'utf8',
  }).stdout;

function alphaMean(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'alphaextract', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1 << 24 });
  const buf = r.stdout;
  if (!buf || !buf.length) return null;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

function encodeOne(name) {
  const src = path.join(ANIM_DIR, `${name}.webm`);
  const tmp = path.join(TMP_DIR, `${name}.webm`);
  const core = CORE.has(name);
  const crf = core ? CORE_CRF : REST_CRF;
  const fps = core ? CORE_FPS : REST_FPS;
  const args = ['-c:v', 'libvpx-vp9', '-i', src];
  if (fps) args.push('-vf', `fps=${fps}`);
  args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-lag-in-frames', '25', '-auto-alt-ref', '1', '-cpu-used', '2', tmp);
  const r = ff(args);
  if (r.status !== 0) return { name, ok: false, why: 'encode ' + String(r.stderr).slice(0, 200) };

  const info = probe(tmp);
  if (!/ALPHA_MODE=1/.test(info)) return { name, ok: false, why: 'no alpha tag' };
  const dur = parseFloat((info.match(/duration=([\d.]+)/) || [])[1] || '0');
  const srcDur = parseFloat((probe(src).match(/duration=([\d.]+)/) || [])[1] || '0');
  if (!(Math.abs(dur - srcDur) < 0.1)) return { name, ok: false, why: `duration ${dur} vs ${srcDur}` };
  const am = alphaMean(tmp);
  if (am === null || am <= 2 || am >= 253) return { name, ok: false, why: `alpha mean ${am}` };

  const before = fs.statSync(src).size;
  const after = fs.statSync(tmp).size;
  return { name, ok: true, before, after, core };
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const names = fs
    .readdirSync(ANIM_DIR)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => f.slice(0, -5));
  console.log(`[shrink] ${names.length} 个动画，核心 ${names.filter((n) => CORE.has(n)).length} 个`);

  const results = [];
  const CONC = 4;
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (idx < names.length) {
        const name = names[idx++];
        const r = encodeOne(name);
        results.push(r);
        console.log(`[shrink] ${r.ok ? 'ok  ' : 'FAIL'} ${name}${r.ok ? ` ${r.before} -> ${r.after} (${Math.round((r.after / r.before) * 100)}%)` : ' :: ' + r.why}`);
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`[shrink] ${failed.length} 个失败，不覆盖任何文件：`);
    for (const f of failed) console.log('  -', f.name, f.why);
    process.exit(1);
  }

  let before = 0;
  let after = 0;
  for (const r of results) {
    fs.copyFileSync(path.join(TMP_DIR, `${r.name}.webm`), path.join(ANIM_DIR, `${r.name}.webm`));
    before += r.before;
    after += r.after;
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`[shrink] 全部覆盖完成：${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB (${Math.round((after / before) * 100)}%)`);
}

main();
