#!/usr/bin/env bash
# 把一个"纯色背景的角色动画"处理成桌宠能用的透明 WebM，并自动更新动画清单。
#
# 用法:
#   tools/pipeline/make-anim.sh <输入视频> <动作名> [关键色]
# 例:
#   tools/pipeline/make-anim.sh 写周报.mp4 写周报
#   tools/pipeline/make-anim.sh raw.mov 刷手机 0x67CD73
#
# 关键色默认 0x67CD73（dsh-pet 素材生成时用的绿）；用 ffmpeg 的 chromakey 抠掉它，
# 归一化到 640×360 / 30fps（与现有素材一致，角色居中、四周留白），再编码成
# VP9-alpha WebM —— Chromium 才能带透明播放。
set -e

IN="$1"
NAME="$2"
KEY="${3:-0x67CD73}"

if [ -z "$IN" ] || [ -z "$NAME" ]; then
  echo "用法: tools/pipeline/make-anim.sh <输入视频> <动作名> [关键色]"
  exit 1
fi

# git-bash 下 pwd 给的是 /c/... 形式，Windows 版 node 读不了，优先取 pwd -W
ROOT="$(cd "$(dirname "$0")/../.." && { pwd -W 2>/dev/null || pwd; })"
OUT="$ROOT/assets/anims/$NAME.webm"

command -v ffmpeg >/dev/null || { echo "需要 ffmpeg 在 PATH 上"; exit 1; }

echo "→ 抠绿 + 归一化 + 编码: $OUT"
ffmpeg -y -loglevel error -i "$IN" \
  -vf "chromakey=${KEY}:0.16:0.06,fps=30,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf 32 -an \
  "$OUT"

echo "→ 更新动画清单"
node -e "
const fs = require('fs'), path = require('path');
const dir = path.join('$ROOT', 'assets', 'anims');
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => f.slice(0, -5)).sort();
fs.writeFileSync(path.join(dir, 'index.js'), 'window.PET_ANIMS=' + JSON.stringify(names) + ';\n', 'utf8');
console.log('   共 ' + names.length + ' 个动画');
"

echo "✅ 完成。把「$NAME」加进 renderer/pet.js 的动画池（带文字的话同时加进 NO_MIRROR），重启桌宠生效。"
