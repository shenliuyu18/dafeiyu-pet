#!/usr/bin/env python3
"""PNG 素材无损转 WebP（只做无损，不改变像素）。

用法：
  python tools/optimize-assets.py            # 预演，只打印体积
  python tools/optimize-assets.py --apply    # 实际转换（原 PNG 备份到 .asset-backup/）

规则：
  - 仅处理 assets/memes/archive/*.png；
  - Pillow lossless=True, method=6，解码回 RGBA 逐像素比对，必须完全一致；
  - 无损 WebP 比原 PNG 更大时保留 PNG（不做负收益转换）；
  - 转换后同步 renderer/archive-memes.js / renderer/dsh-memes.js 里的 ext。
"""

import argparse
import io
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'memes' / 'archive'
BACKUP = ROOT / '.asset-backup' / 'memes-archive'
MANIFESTS = [ROOT / 'renderer' / 'archive-memes.js', ROOT / 'renderer' / 'dsh-memes.js']


def rgba(img):
    return img.convert('RGBA') if img.mode != 'RGBA' else img


def encode(img):
    buf = io.BytesIO()
    img.save(buf, format='WEBP', lossless=True, method=6, exact=True)
    return buf.getvalue()


def identical(a_bytes, b_bytes):
    a = rgba(Image.open(io.BytesIO(a_bytes)))
    b = rgba(Image.open(io.BytesIO(b_bytes)))
    if a.size != b.size:
        return False
    return ImageChops.difference(a, b).getbbox() is None


def sync_manifests(apply):
    """把清单里已经有对应 .webp 的 png 条目改成 webp（幂等，可重复执行）。"""
    changed = []
    for mf in MANIFESTS:
        if not mf.exists():
            continue
        text = mf.read_text(encoding='utf-8')

        def repl(m):
            name = m.group(1)
            return f"{{ file: '{name}', ext: 'webp'" if (SRC / f'{name}.webp').exists() else m.group(0)

        new = re.sub(r"\{ file: '([^']+)', ext: 'png'", repl, text)
        if new != text:
            changed.append((mf, new.count("ext: 'webp'")))
            if apply:
                mf.write_text(new, encoding='utf-8')
    return changed


def report_manifests(apply):
    for mf, n in sync_manifests(apply):
        print(f'{"已更新" if apply else "将更新"} {mf.relative_to(ROOT)}（webp 条目 {n} 个）')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    pngs = sorted(SRC.glob('*.png'))
    if not pngs:
        print('没有待处理的 PNG')
        report_manifests(args.apply)
        return 0

    total_png = total_webp = 0
    converted, skipped_smaller, skipped_special, failed = [], [], [], []

    print(f"{'file':<48}{'png':>10}{'webp':>10}{'节省':>9}  verdict")
    for p in pngs:
        raw = p.read_bytes()
        total_png += len(raw)
        try:
            img = Image.open(io.BytesIO(raw))
            if getattr(img, 'n_frames', 1) > 1:
                skipped_special.append((p.name, '动图 PNG'))
                continue
            img.load()
            out = encode(img)
            if not identical(raw, out):
                failed.append((p.name, '像素不一致'))
                print(f'{p.name:<48}{len(raw)/1048576:>9.2f}M{"-":>10}  PIXEL MISMATCH')
                continue
        except Exception as e:  # noqa: BLE001
            failed.append((p.name, str(e)))
            print(f'{p.name:<48}{len(raw)/1048576:>9.2f}M{"-":>10}  ERROR {e}')
            continue

        if len(out) >= len(raw):
            skipped_smaller.append((p.name, len(raw), len(out)))
            total_webp += len(raw)
            print(f'{p.name:<48}{len(raw)/1048576:>9.2f}M{len(out)/1048576:>9.2f}M{"+":>8}  keep png')
            continue

        converted.append(p.name)
        total_webp += len(out)
        print(f'{p.name:<48}{len(raw)/1048576:>9.2f}M{len(out)/1048576:>9.2f}M{(len(raw)-len(out))/1048576:>8.2f}M  webp')

        if args.apply:
            BACKUP.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, BACKUP / p.name)
            tmp = p.with_suffix('.webp.tmp')
            tmp.write_bytes(out)
            tmp.replace(p.with_suffix('.webp'))
            p.unlink()

    print()
    print(f'PNG 合计 {total_png/1048576:.2f} MB → {total_webp/1048576:.2f} MB，'
          f'节省 {(total_png-total_webp)/1048576:.2f} MB ({(1-total_webp/total_png)*100:.1f}%)')
    print(f'转换 {len(converted)}，保留原样 {len(skipped_smaller)}，跳过 {len(skipped_special)}，失败 {len(failed)}')
    if skipped_special:
        for n, why in skipped_special:
            print(f'  跳过 {n}: {why}')
    if failed:
        for n, why in failed:
            print(f'  失败 {n}: {why}', file=sys.stderr)
    report_manifests(args.apply)
    if not args.apply:
        print('（预演模式，未改动任何文件；加 --apply 执行）')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())