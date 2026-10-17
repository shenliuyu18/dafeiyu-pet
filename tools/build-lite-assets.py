#!/usr/bin/env python3
"""生成 Lite 版素材到 assets-lite/，不修改 assets/ 原素材。

- 动画：480x270、24fps、VP9 alpha（文本类 CRF 36 / 核心动作 CRF 40 / 其他 CRF 44）
- 立绘：最长边 720、WebP q84
- 音效 / 字体 / 词库 / 梗图 / 图标按原样复制
用法：python tools/build-lite-assets.py [--force]
"""

import concurrent.futures
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "assets-lite")
FORCE = "--force" in sys.argv

CORE = {
    "待机呼吸休闲", "原地漂浮踏步", "螃蟹走路", "原地左转奔跑",
    "被鼠标拖拽悬空反馈", "原地小憩沉眠",
    "工作状态-垂头叹气冒汗", "工作状态-雀跃庆祝",
    "写代码", "工作状态-思考冒泡", "工作状态-忙碌点按", "工作状态-清点归档",
    "点击回应-开心跃动", "点击回应-害羞惊讶", "点击回应-傲娇生气", "点击回应-挠痒咯咯笑", "点击回应-元气挥手",
    "吃白饭", "吃Token", "大口吃零食",
}
TEXT = {"是啊，吃什么", "深度思考碎碎念", "碎碎念-擦桌碎碎念", "碎碎念-发呆碎碎念", "碎碎念-对屏碎碎念"}
PORTRAIT_DIRS = {"fish2", "fish3", "fish4", "fish5", "fish6", "gpt"}


def run(cmd, **kw):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kw)


def probe(path):
    r = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-show_entries", "stream_tags=ALPHA_MODE", "-of", "default=noprint_wrappers=1", path,
    ])
    text = r.stdout.decode("utf-8", "ignore")
    dur = 0.0
    for line in text.splitlines():
        if line.startswith("duration="):
            try:
                dur = float(line.split("=", 1)[1])
            except ValueError:
                pass
    return dur, "ALPHA_MODE=1" in text


def fresh(src, dst):
    if FORCE or not os.path.exists(dst):
        return False
    return os.path.getmtime(dst) >= os.path.getmtime(src) and os.path.getsize(dst) > 0


def encode_video(name):
    src = os.path.join(SRC, "anims", name + ".webm")
    dst = os.path.join(OUT, "anims", name + ".webm")
    if fresh(src, dst):
        return ("skip", name, os.path.getsize(dst))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    src_dur, src_alpha = probe(src)
    if not src_alpha:
        shutil.copy2(src, dst)
        return ("copy", name, os.path.getsize(dst))
    crf = 36 if name in TEXT else 40 if name in CORE else 44
    fd, tmp = tempfile.mkstemp(suffix=".webm", dir=os.path.dirname(dst))
    os.close(fd)
    try:
        r = run([
            "ffmpeg", "-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", src,
            "-vf", "scale=480:270:flags=lanczos",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", str(crf), "-b:v", "0",
            "-row-mt", "1", "-lag-in-frames", "25", "-auto-alt-ref", "1", "-cpu-used", "3",
            "-an", tmp,
        ])
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode("utf-8", "ignore")[:300])
        dur, alpha = probe(tmp)
        if not alpha or abs(dur - src_dur) > 0.2:
            raise RuntimeError(f"verify failed (alpha={alpha}, {dur} vs {src_dur})")
        if os.path.getsize(tmp) >= os.path.getsize(src):
            shutil.copy2(src, dst)
            return ("copy", name, os.path.getsize(dst))
        os.replace(tmp, dst)
        return ("ok", name, os.path.getsize(dst))
    except Exception as e:
        shutil.copy2(src, dst)
        return ("fallback:" + str(e)[:80], name, os.path.getsize(dst))
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def compress_image(rel):
    src = os.path.join(SRC, rel)
    dst = os.path.join(OUT, rel)
    if fresh(src, dst):
        return ("skip", rel, os.path.getsize(dst))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if rel.startswith("memes" + os.sep) or rel.startswith("pic" + os.sep):
        shutil.copy2(src, dst)
        return ("copy", rel, os.path.getsize(dst))
    top = rel.split(os.sep, 1)[0]
    if top not in PORTRAIT_DIRS:
        shutil.copy2(src, dst)
        return ("copy", rel, os.path.getsize(dst))
    try:
        from PIL import Image
        im = Image.open(src)
        im.load()
        rgb = im.convert("RGBA")
        w, h = rgb.size
        if max(w, h) > 720:
            scale = 720 / max(w, h)
            rgb = rgb.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
        rgb.save(dst, "WEBP", quality=84, method=6)
        if os.path.getsize(dst) >= os.path.getsize(src):
            shutil.copy2(src, dst)
        return ("ok", rel, os.path.getsize(dst))
    except Exception as e:
        shutil.copy2(src, dst)
        return ("fallback:" + str(e)[:80], rel, os.path.getsize(dst))


def other(rel):
    src = os.path.join(SRC, rel)
    dst = os.path.join(OUT, rel)
    if fresh(src, dst):
        return ("skip", rel, os.path.getsize(dst))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    return ("copy", rel, os.path.getsize(dst))


def main():
    os.makedirs(OUT, exist_ok=True)
    videos, images, others = [], [], []
    for base, dirs, files in os.walk(SRC):
        for f in files:
            full = os.path.join(base, f)
            rel = os.path.relpath(full, SRC)
            if rel.lower().endswith(".webm"):
                videos.append(os.path.splitext(f)[0])
            elif rel.lower().endswith((".webp", ".png", ".jpg", ".jpeg")):
                images.append(rel)
            else:
                others.append(rel)

    before = sum(os.path.getsize(os.path.join(SRC, r)) for r in
                 [os.path.join("anims", v + ".webm") for v in videos] + images + others)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(encode_video, v) for v in videos]
        for fut in concurrent.futures.as_completed(futs):
            res = fut.result()
            results.append(res)
            print(f"[lite] video {res[0]:<28} {res[1]} -> {res[2]:,}B", flush=True)
    for rel in images:
        res = compress_image(rel)
        results.append(res)
        print(f"[lite] image {res[0]:<28} {res[1]} -> {res[2]:,}B", flush=True)
    for rel in others:
        res = other(rel)
        results.append(res)
        print(f"[lite] asset {res[0]:<28} {rel} -> {res[2]:,}B", flush=True)

    after = 0
    count = 0
    for base, dirs, files in os.walk(OUT):
        for f in files:
            count += 1
            after += os.path.getsize(os.path.join(base, f))
    print(f"[lite] {count} files: {before / 1048576:.1f}MB -> {after / 1048576:.1f}MB "
          f"({after * 100 // max(1, before)}%) -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
