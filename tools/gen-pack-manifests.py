#!/usr/bin/env python3
"""把已发布的官方形象包清单汇总成应用内置的迁移表。

输出：wails/pack_manifests.json（go:embed，启动时用于给旧安装包补 1.0.1 字段）
用法：python tools/gen-pack-manifests.py
每次重新构建/发布形象包后执行一次，并重新打包应用。
"""
import io
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "characters-build", "packs-content")
OUT = os.path.join(ROOT, "wails", "pack_manifests.json")


def main():
    packs = {}
    for name in sorted(os.listdir(SRC)):
        if not name.endswith("-full.zip"):
            continue
        pid = name[: -len("-full.zip")]
        with zipfile.ZipFile(os.path.join(SRC, name)) as z:
            packs[pid] = json.loads(z.read("manifest.json").decode("utf-8"))
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(packs, f, ensure_ascii=False, indent=1)
    print(f"wrote {OUT}: {len(packs)} packs, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
