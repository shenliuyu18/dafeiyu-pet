#!/usr/bin/env python3
"""校验桌宠形象包（文件夹或 zip），规则与应用的导入校验保持一致。

用法：
    python tools/character-pack/validate.py 我的形象/
    python tools/character-pack/validate.py 我的形象.zip
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,31}$")
OFFICIAL = False  # --official：官方包（允许保留 id / 图集包），规则与 Go 的远程下载校验一致

RESERVED = {"v1", "v2", "v3", "v4", "v5", "v6", "gpt", "gptv1", "dsh1"}
SLOTS = {"idle", "click", "feed", "sleep", "drag", "sad", "happy", "work", "money", "move"}
MEME_SCENES = {"click", "feed", "hungry", "sleep", "ledger", "work", "error", "happy"}
IMAGE_EXT = {".webp", ".png", ".jpg", ".jpeg"}
MAX_ACTIONS = 500
MAX_LINES = 300
MAX_MEMES = 100
MAX_TEXT = 300
MAX_ENTRIES = 4000
MAX_BYTES = 2 << 30

errors = []
warnings = []
notes = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def clean_rel(name):
    n = str(name or "").strip().replace("\\", "/")
    if not n or ":" in n:
        return None
    n = os.path.normpath(n).replace("\\", "/")
    if n in (".", "..") or n.startswith("../") or n.startswith("/"):
        return None
    return n


def load_manifest(data):
    try:
        return json.loads(data.decode("utf-8-sig"))
    except Exception as e:
        err(f"manifest.json 不是合法 JSON：{e}")
        return None


class PackView:
    """把文件夹或 zip 统一成 {相对路径: 读取函数}"""

    def __init__(self, path):
        self.path = path
        self.zip = None
        self.root = None
        if os.path.isdir(path):
            self.root = path
            self.names = None
        elif os.path.isfile(path):
            try:
                self.zip = zipfile.ZipFile(path)
            except Exception as e:
                raise SystemExit(f"[错误] 无法打开 zip：{e}")
            self.names = []
        else:
            raise SystemExit(f"[错误] 路径不存在：{path}")

    def scan_zip(self):
        total = 0
        for info in self.zip.infolist():
            name = info.filename.replace("\\", "/")
            cleaned = os.path.normpath(name).replace("\\", "/")
            if cleaned in (".", ""):
                continue
            if cleaned == ".." or cleaned.startswith("../") or cleaned.startswith("/") or ":" in cleaned:
                err(f"zip 内含非法路径：{info.filename}")
                continue
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                err(f"zip 内含符号链接：{info.filename}")
                continue
            total += info.file_size
            self.names.append(cleaned)
        if len(self.names) > MAX_ENTRIES:
            err(f"zip 内文件太多（{len(self.names)}，最多 {MAX_ENTRIES}）")
        if total > MAX_BYTES:
            err(f"zip 解压后体积 {total / (1 << 30):.2f} GB，超过 2 GB")
        notes.append(f"zip 条目 {len(self.names)} 个，解压后 {total / 1048576:.1f} MB")

    def manifest_prefix(self):
        if self.zip is None:
            candidates = []
            if os.path.isfile(os.path.join(self.root, "manifest.json")):
                candidates.append("")
            for name in os.listdir(self.root):
                sub = os.path.join(self.root, name)
                if os.path.isdir(sub) and os.path.isfile(os.path.join(sub, "manifest.json")):
                    candidates.append(name + "/")
            if not candidates:
                err("没有找到 manifest.json（放在根目录或单层文件夹里）")
                return None
            if len(candidates) > 1:
                err("找到多份 manifest.json，无法确定使用哪一份")
                return None
            return candidates[0]
        candidates = []
        for name in self.names:
            if os.path.basename(name) != "manifest.json":
                continue
            prefix = name[: -len("manifest.json")]
            if prefix and not prefix.endswith("/"):
                continue
            if prefix.strip("/").count("/") > 0:
                continue
            candidates.append(prefix)
        if not candidates:
            err("zip 内没有 manifest.json（放在压缩包根目录或单层文件夹里）")
            return None
        if len(candidates) > 1:
            err("zip 内有多份 manifest.json，无法确定使用哪一份")
            return None
        return candidates[0]

    def read(self, rel):
        if self.zip is not None:
            return self.zip.read(rel)
        with open(os.path.join(self.root, rel.replace("/", os.sep)), "rb") as f:
            return f.read()

    def exists(self, rel, prefix):
        full = prefix + rel if self.zip is not None else rel
        if self.zip is not None:
            return full in self.names
        return os.path.isfile(os.path.join(self.root, full.replace("/", os.sep)))

    def size(self, rel, prefix):
        full = prefix + rel if self.zip is not None else rel
        if self.zip is not None:
            try:
                return self.zip.getinfo(full).file_size
            except KeyError:
                return -1
        p = os.path.join(self.root, full.replace("/", os.sep))
        return os.path.getsize(p) if os.path.isfile(p) else -1

    def extract(self, rel, prefix, dst):
        full = prefix + rel if self.zip is not None else rel
        if self.zip is not None:
            with open(dst, "wb") as f:
                f.write(self.zip.read(full))
            return dst
        src = os.path.join(self.root, full.replace("/", os.sep))
        shutil.copy2(src, dst)
        return dst


def probe_video(path):
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "stream=codec_name,width,height:stream_tags", "-of", "json", path],
            capture_output=True, timeout=30,
        ).stdout.decode("utf-8", "ignore")
        data = json.loads(out)
        streams = data.get("streams") or []
        return streams[0] if streams else None
    except Exception:
        return None


def main():
    global OFFICIAL
    args = [a for a in sys.argv[1:] if a != "--official"]
    OFFICIAL = official = len(args) != len(sys.argv[1:])
    if len(args) != 1:
        raise SystemExit(__doc__ + "\n    python tools/character-pack/validate.py --official 官方包.zip")
    view = PackView(args[0])
    if view.zip is not None:
        view.scan_zip()
    prefix = view.manifest_prefix()
    if prefix is None:
        report()
        return

    data = view.read(prefix + "manifest.json")
    m = load_manifest(data)
    if m is None:
        report()
        return

    if m.get("schemaVersion") != 1:
        err(f"schemaVersion 必须是 1（当前 {m.get('schemaVersion')!r}）")
    pid = str(m.get("id") or "")
    if not ID_RE.match(pid):
        err(f"id 需为 2–32 位小写字母/数字/-/_，且以字母或数字开头（当前 {pid!r}）")
    if pid in RESERVED and not official:
        err(f"id「{pid}」是保留名称")
    name = str(m.get("name") or "").strip()
    if not name:
        err("缺少 name")
    elif len(name) > 60:
        err("name 最多 60 个字")

    cover = clean_rel(m.get("cover"))
    if cover is None:
        err("cover 必须是包内相对路径")
    elif os.path.splitext(cover)[1].lower() not in IMAGE_EXT:
        err("cover 只支持 .webp/.png/.jpg")
    elif not view.exists(cover, prefix):
        err(f"找不到封面文件：{m.get('cover')}")
    elif view.size(cover, prefix) <= 0:
        err(f"封面文件为空：{m.get('cover')}")

    if m.get("kind") == "sprite" and not OFFICIAL:
        err("图集（spritesheet）形象暂不支持自制导入，请使用 .webm 透明视频")

    actions = m.get("actions")
    if not isinstance(actions, list) or not actions:
        err("actions 不能为空")
        actions = []
    if len(actions) > MAX_ACTIONS:
        err(f"actions 最多 {MAX_ACTIONS} 条（当前 {len(actions)}）")

    seen = set()
    checked_video = 0
    for i, a in enumerate(actions, 1):
        if not isinstance(a, dict):
            err(f"第 {i} 条动作不是对象")
            continue
        aid = str(a.get("id") or "").strip()
        if not aid:
            err(f"第 {i} 条动作缺少 id")
            continue
        if len(aid) > 60:
            err(f"动作 id 过长：{aid}")
        if aid in seen:
            err(f"动作 id 重复：{aid}")
        if not str(a.get("category") or "").strip():
            err(f"动作「{aid}」缺少 category（选个动作会按它分组）")
        seen.add(aid)
        rel = clean_rel(a.get("file"))
        if rel is None:
            err(f"动作「{aid}」的 file 必须是包内相对路径")
            continue
        ext = os.path.splitext(rel)[1].lower()
        if ext != ".webm" and not (OFFICIAL and m.get("kind") == "sprite" and ext in IMAGE_EXT):
            err(f"动作「{aid}」只支持 .webm 透明视频（当前 {ext or '无扩展名'}）")
            continue
        if not view.exists(rel, prefix):
            err(f"找不到动作文件：{a.get('file')}")
            continue
        if view.size(rel, prefix) <= 0:
            err(f"动作文件为空：{a.get('file')}")
            continue
        if checked_video < 3:
            with tempfile.TemporaryDirectory() as td:
                tmp = os.path.join(td, "check.webm")
                view.extract(rel, prefix, tmp)
                stream = probe_video(tmp)
            if stream is None:
                warn("未找到 ffprobe，跳过视频编码检查")
            else:
                checked_video += 1
                codec = stream.get("codec_name")
                tags = stream.get("tags") or {}
                w, h = stream.get("width"), stream.get("height")
                if codec != "vp9":
                    warn(f"动作「{aid}」编码是 {codec}，建议 VP9")
                if tags.get("ALPHA_MODE") != "1":
                    warn(f"动作「{aid}」没有透明通道（ALPHA_MODE=1），桌面会露出背景")
                if w and h and abs(w / h - 16 / 9) > 0.03:
                    warn(f"动作「{aid}」分辨率 {w}×{h} 不是 16:9，显示会被拉伸")

    slots = m.get("slots")
    if slots is not None:
        if not isinstance(slots, dict):
            err("slots 必须是对象")
        else:
            for key, val in slots.items():
                if key not in SLOTS:
                    err(f"未知槽位 {key!r}")
                    continue
                vals = [val] if isinstance(val, str) else val
                if not isinstance(vals, list) or not vals:
                    err(f"槽位 {key} 不能为空")
                    continue
                for aid in vals:
                    if aid not in seen:
                        err(f"槽位 {key} 引用了不存在的动作 {aid!r}")

    if len(actions) and len(seen) == len(actions):
        notes.append(f"动作 {len(seen)} 个")

    validate_dialogue(m, view, prefix, seen)
    report()


def check_text(label, text, required=False):
    s = str(text or "").strip()
    if not s:
        if required:
            err(f"{label} 不能为空")
        return False
    if len(s) > MAX_TEXT:
        err(f"{label} 超过 {MAX_TEXT} 字")
    return True


def validate_dialogue(m, view, prefix, action_ids):
    d = m.get("dialogue")
    i18n = m.get("i18n")
    if i18n is not None and not isinstance(i18n, dict):
        err("i18n 必须是对象")
        i18n = None
    texts, cats = set(), set()
    for a in m.get("actions") or []:
        if isinstance(a, dict) and a.get("category"):
            cats.add(str(a["category"]))
    # 图集包的动作名来自 sprite.actions[].label；i18n.actions 的原文就是这些标签
    sprite = m.get("sprite")
    if isinstance(sprite, dict):
        for a in sprite.get("actions") or []:
            if isinstance(a, dict) and a.get("label"):
                action_ids.add(str(a["label"]))
    if d is None:
        if i18n:
            for lang, loc in i18n.items():
                if isinstance(loc, dict) and loc.get("lines"):
                    err(f"{lang} 的 lines 翻译需要同时提供 dialogue 台词")
    elif not isinstance(d, dict):
        err("dialogue 必须是对象")
    else:
        check_text("dialogue.intro", d.get("intro"))
        if str(d.get("intro") or "").strip():
            texts.add(str(d["intro"]).strip())
        for key in ("quips", "feed", "hungry", "sleep"):
            vals = d.get(key) or []
            if not isinstance(vals, list):
                err(f"dialogue.{key} 必须是数组")
                continue
            if len(vals) > MAX_LINES:
                err(f"dialogue.{key} 最多 {MAX_LINES} 条")
            for i, s in enumerate(vals, 1):
                if check_text(f"dialogue.{key} 第 {i} 条", s):
                    texts.add(str(s).strip())
        memes = d.get("memes") or []
        if not isinstance(memes, list):
            err("dialogue.memes 必须是数组")
            memes = []
        if len(memes) > MAX_MEMES:
            err(f"dialogue.memes 最多 {MAX_MEMES} 张")
        for i, mem in enumerate(memes, 1):
            if not isinstance(mem, dict):
                err(f"第 {i} 张梗图不是对象")
                continue
            rel = clean_rel(mem.get("file"))
            if rel is None or os.path.splitext(rel)[1].lower() not in IMAGE_EXT:
                err(f"第 {i} 张梗图的 file 只支持包内 .webp/.png/.jpg")
            elif not view.exists(rel, prefix):
                err(f"找不到梗图文件：{mem.get('file')}")
            scenes = mem.get("scenes") or []
            if not scenes:
                err(f"第 {i} 张梗图缺少 scenes")
            for sc in scenes:
                if sc not in MEME_SCENES:
                    err(f"第 {i} 张梗图的场景 {sc!r} 不受支持")
            if check_text(f"第 {i} 张梗图的 text", mem.get("text"), True):
                texts.add(str(mem["text"]).strip())
        if not texts:
            err("dialogue 不能为空")
    if not i18n:
        return
    allowed = {"lines": texts, "actions": set(action_ids), "categories": cats}
    for lang, loc in i18n.items():
        if lang not in ("en", "ja"):
            err(f"不支持的语言 {lang!r}（只有 en/ja）")
            continue
        if not isinstance(loc, dict):
            err(f"i18n.{lang} 必须是对象")
            continue
        for field, table in allowed.items():
            dictv = loc.get(field) or {}
            if not isinstance(dictv, dict):
                err(f"i18n.{lang}.{field} 必须是对象")
                continue
            for src, tr in dictv.items():
                if src not in table:
                    err(f"i18n.{lang}.{field} 的原文 {src!r} 不在包内")
                check_text(f"i18n.{lang}.{field} 译文 {src!r}", tr, True)


def report():
    for n in notes:
        print(f"[信息] {n}")
    for w in warnings:
        print(f"[提示] {w}")
    for e in errors:
        print(f"[错误] {e}")
    if errors:
        print(f"\n校验失败：{len(errors)} 个错误")
        sys.exit(1)
    print("\n校验通过，可以打包导入。")


if __name__ == "__main__":
    main()
