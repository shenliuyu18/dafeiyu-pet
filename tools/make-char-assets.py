# -*- coding: utf-8 -*-
"""把新形象的立绘/表情图归一化成和现有 640×360 动画同一坐标系的透明画布，再压成 WebP。

用法：
    python tools/make-char-assets.py <源目录> <输出目录> <目标内容高度> [质量 0-100]

源目录里的 PNG 会按 alpha 包围盒裁剪，等比缩放到「目标内容高度」，然后贴到 640×360
画布上（水平居中 x=320、底边对齐 y=329——与现有动画角色的站位一致），输出同名 .webp。
只处理文件名不含下划线前缀的 PNG；结果零依赖（ffmpeg + 纯 Python 扫描 alpha）。
"""

import pathlib
import subprocess
import sys

CANVAS_W, CANVAS_H = 640, 360
ANCHOR_CX, ANCHOR_BOTTOM = 320, 329


def ffprobe_wh(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', str(path)],
        capture_output=True, text=True).stdout.strip()
    w, h = out.split(',')
    return int(w), int(h)


def alpha_bbox(path, thr=8):
    w, h = ffprobe_wh(path)
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-vf', 'alphaextract,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        capture_output=True).stdout
    if len(raw) < w * h:
        raise SystemExit('alpha extract failed: ' + str(path))
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        row = raw[y * w:(y + 1) * w]
        if max(row) <= thr:
            continue
        if y < miny:
            miny = y
        maxy = y
        x0 = 0
        while x0 < w and row[x0] <= thr:
            x0 += 1
        x1 = w - 1
        while x1 >= 0 and row[x1] <= thr:
            x1 -= 1
        if x0 < minx:
            minx = x0
        if x1 > maxx:
            maxx = x1
    if maxx < 0:
        return None
    return (minx, miny, maxx, maxy)


def normalize(src: pathlib.Path, out: pathlib.Path, target_h: int, quality: int = 88):
    box = alpha_bbox(src)
    if not box:
        raise SystemExit('全透明，跳过: ' + str(src))
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    new_h = target_h
    new_w = max(1, round(bw * target_h / bh))
    px = max(0, min(CANVAS_W - new_w, ANCHOR_CX - new_w // 2))
    py = max(0, min(CANVAS_H - new_h, ANCHOR_BOTTOM - new_h))
    vf = (
        f'crop={bw}:{bh}:{x0}:{y0},'
        f'scale={new_w}:{new_h}:flags=lanczos,'
        f'format=rgba,pad={CANVAS_W}:{CANVAS_H}:{px}:{py}:color=black@0'
    )
    r = subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vf', vf,
         '-c:v', 'libwebp', '-quality', str(quality), '-preset', 'picture', str(out)],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('encode failed: %s\n%s' % (src, r.stderr))
    return new_w, new_h, out.stat().st_size


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    src_dir, out_dir, target_h = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3])
    quality = int(sys.argv[4]) if len(sys.argv) > 4 else 88
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for p in sorted(src_dir.glob('*.png')):
        if p.name.startswith('_'):
            continue
        nw, nh, size = normalize(p, out_dir / (p.stem + '.webp'), target_h, quality)
        total += size
        print(f'{p.name} -> {p.stem}.webp  {nw}x{nh}  {size // 1024}KB')
    print(f'合计 {total // 1024}KB -> {out_dir}')


if __name__ == '__main__':
    main()
