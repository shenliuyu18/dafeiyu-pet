#!/usr/bin/env python3
"""把 tools/character-pack/content 里的台词/翻译/图集参数合并进形象包，生成可上传的包。

输入：
    tools/character-pack/content/<id>.json   包内文字（单一数据源）
    characters-build/full/<id>.zip           完整版素材
    characters-build/lite/<id>.zip           Lite 版素材

输出：
    characters-build/packs-content/<id>-full.zip
    characters-build/packs-content/<id>-lite.zip
    characters-build/packs-content/characters.json
    characters-build/packs-content/SHA256SUMS.txt

素材不重新编码：直接复制原 zip 条目（webm/webp 保持 STORED），只替换 manifest.json。
用法：
    python tools/build-pack-content.py
    python tools/build-pack-content.py --only claude gemini
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "tools", "character-pack", "content")
BUILD = os.path.join(ROOT, "characters-build")
FULL = os.path.join(BUILD, "full")
LITE = os.path.join(BUILD, "lite")
OUT = os.path.join(BUILD, "packs-content")

STORE_EXT = (".webm", ".webp", ".mp4", ".png", ".jpg", ".jpeg")


def read_json(path):
    with io.open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path, data):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def merge_manifest(manifest, content, names, version="1.0.1"):
    m = json.loads(json.dumps(manifest))  # deep copy
    m["version"] = version
    if content.get("dialogue"):
        m["dialogue"] = content["dialogue"]
    if content.get("i18n"):
        m["i18n"] = content["i18n"]
    if content.get("sprite"):
        m["sprite"] = content["sprite"]
    cat = content.get("category")
    if cat:
        for a in m.get("actions") or []:
            if isinstance(a, dict) and not a.get("category"):
                a["category"] = cat
    check_refs(m, names)
    return m


def check_refs(m, names):
    need = []
    for mem in (m.get("dialogue") or {}).get("memes") or []:
        if mem.get("file"):
            need.append(mem["file"])
    if (m.get("sprite") or {}).get("sheet"):
        need.append(m["sprite"]["sheet"])
    for rel in need:
        if rel not in names:
            raise SystemExit(f"[{m.get('id')}] 清单引用的文件不在包里：{rel}")


def rebuild(src_zip, dst_zip, manifest_bytes):
    with zipfile.ZipFile(src_zip) as zin, zipfile.ZipFile(dst_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zout:
        for info in zin.infolist():
            if info.filename == "manifest.json":
                continue  # 稍后用合并后的版本重写
            data = zin.read(info.filename)
            if info.filename.lower().endswith(STORE_EXT):
                zout.writestr(info.filename, data, compress_type=zipfile.ZIP_STORED)
            else:
                zout.writestr(info.filename, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        zout.writestr("manifest.json", manifest_bytes, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None, help="只处理这些包 id")
    ap.add_argument("--version", default="1.0.1", help="写进各包 manifest 的版本号")
    ap.add_argument("--tag", default="packs-1.0.1", help="Release 标签（用于重写目录里的下载地址）")
    args = ap.parse_args()

    ids = sorted(f[:-5] for f in os.listdir(CONTENT) if f.endswith(".json"))
    if args.only:
        ids = [i for i in ids if i in set(args.only)]
    os.makedirs(OUT, exist_ok=True)

    catalog = read_json(os.path.join(LITE, "characters.json"))
    by_id = {p["id"]: p for p in catalog["packs"]}
    sums = []
    for pid in ids:
        full_src = os.path.join(FULL, pid + ".zip")
        lite_src = os.path.join(LITE, pid + ".zip")
        for p in (full_src, lite_src):
            if not os.path.isfile(p):
                raise SystemExit(f"缺少素材包：{p}")
        content = read_json(os.path.join(CONTENT, pid + ".json"))
        with zipfile.ZipFile(full_src) as z:
            names = set(z.namelist())
            base = json.loads(z.read("manifest.json").decode("utf-8"))
        manifest = merge_manifest(base, content, names, args.version)
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

        full_out = os.path.join(OUT, pid + "-full.zip")
        lite_out = os.path.join(OUT, pid + "-lite.zip")
        rebuild(full_src, full_out, manifest_bytes)
        rebuild(lite_src, lite_out, manifest_bytes)
        sums.append((full_out, hashlib_filename(full_out)))
        sums.append((lite_out, hashlib_filename(lite_out)))

        item = by_id.get(pid)
        if item is not None:
            item["zipBytes"] = os.path.getsize(full_out)
            item["liteZipBytes"] = os.path.getsize(lite_out)
        print(f"[{pid}] full {os.path.getsize(full_out)/1048576:.1f} MB / lite {os.path.getsize(lite_out)/1048576:.1f} MB")

    # 目录里的下载地址与版本同步到新 Release：旧地址指向的包清单不兼容 1.5.4。
    tag_re = re.compile(r"/releases/download/[^/]+/")
    for item in catalog.get("packs", []):
        for key in ("url", "liteUrl"):
            if item.get(key):
                item[key] = tag_re.sub("/releases/download/%s/" % args.tag, item[key])
        item["version"] = args.version
    catalog["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_json(os.path.join(OUT, "characters.json"), catalog)

    lines = ["{}  {}".format(sha256(path), name) for path, name in sums]
    with io.open(os.path.join(OUT, "SHA256SUMS.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\n输出目录：{OUT}")


def hashlib_filename(path):
    return os.path.basename(path)


if __name__ == "__main__":
    main()