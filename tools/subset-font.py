# -*- coding: utf-8 -*-
"""一次性字体压缩脚本：把上首软糖体 TTF 子集化并按 WOFF2 输出。

用法（项目根目录）：
    python tools/subset-font.py

字符集来源：程序自身源码里出现的所有字符（pet.js / main.js / index.html /
preload.js / usage.js / assets/anims/index.js），外加 ASCII 与常用中英标点。
—— 也就是说：日后如果往界面文案里加了新汉字，需要重跑本脚本，否则那些字会
回退到系统字体渲染（不会崩，只是字形不一致）。

依赖：pip install fonttools brotli
"""

import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_TTF = ROOT / "assets" / "fonts" / "上首软糖体.ttf"
OUT_WOFF2 = ROOT / "assets" / "fonts" / "上首软糖体.woff2"
CHARS_TXT = ROOT / ".font-chars.txt"

SOURCES = [
    "renderer/pet.js",
    "renderer/index.html",
    "main.js",
    "preload.js",
    "usage.js",
    "assets/anims/index.js",
]

# 界面可能动态拼出的字符：数字/字母（ASCII 全覆盖）+ 常用标点
EXTRA = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "　、。！？；：（）「」『』《》【】“”‘’—…·～￥％°±×÷−＋"
    + "①②③④⑤⑥⑦⑧⑨⑩★☆♥❤✓✔✕✖→←↑↓"
)


def main() -> int:
    chars = set(EXTRA)
    for rel in SOURCES:
        p = ROOT / rel
        try:
            chars.update(p.read_text(encoding="utf-8"))
        except FileNotFoundError:
            print(f"[subset] 跳过不存在的文件: {rel}")
    chars = {c for c in chars if c.strip() and not c.isspace()}
    chars.update(" \u3000")  # 空格与全角空格
    CHARS_TXT.write_text("".join(sorted(chars)), encoding="utf-8")
    print(f"[subset] 收集到 {len(chars)} 个字符 -> {CHARS_TXT.name}")

    if not SRC_TTF.exists():
        print(f"[subset] 找不到 {SRC_TTF}（可能已删；请从 git 历史或备份取回）")
        return 1

    before = SRC_TTF.stat().st_size
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(SRC_TTF),
        f"--text-file={CHARS_TXT}",
        "--flavor=woff2",
        "--layout-features=*",
        "--name-IDs=*",
        "--recommended-glyphs",
        f"--output-file={OUT_WOFF2}",
    ]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        return r.returncode
    after = OUT_WOFF2.stat().st_size
    print(f"[subset] {before/1048576:.2f}MB TTF -> {after/1048576:.2f}MB WOFF2 ({after*100//before}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
