# -*- coding: utf-8 -*-
"""从 Konsheng/Sensitive-lexicon（MIT）生成离线敏感词库。

用法：
    python tools/build-lexicon.py <Sensitive-lexicon 仓库目录>

输出 assets/sensitive/lexicon.txt：去重、去空白/标点、忽略单字后的词条，每行一条。
同时写 SOURCES.txt 记录上游提交与选用分类。生成的文件随程序离线分发，
不会联网更新，也不会把用户输入发送到任何服务器。
"""

import datetime
import pathlib
import re
import subprocess
import sys
import unicodedata

CATEGORIES = [
    "政治类型.txt",
    "反动词库.txt",
    "色情类型.txt",
    "色情词库.txt",
    "暴恐词库.txt",
    "涉枪涉爆.txt",
    "贪腐词库.txt",
    "其他词库.txt",
    "广告类型.txt",
    "补充词库.txt",
    "网易前端过滤敏感词库.txt",
    "零时-Tencent.txt",
]

# 这些词是桌宠互动/日常技术交流的正常用语，若词库把它们单独列为词条会造成误伤。
# 只对完全相同的词条做白名单，不豁免包含它们的更长词条。
BENIGN = {
    # 桌宠与白饭梗
    "白饭", "摸鱼", "鲸鱼", "大肥鱼", "大肥", "桌宠", "番茄钟", "专注", "休息",
    "吃饭", "睡觉", "起床", "打工", "上班", "下班", "加班", "工资", "老板", "同事",
    "项目", "需求", "代码", "程序", "电脑", "手机", "键盘", "鼠标", "屏幕", "桌面",
    "系统", "软件", "硬件", "网络", "游戏", "奶茶", "咖啡", "零食", "火锅", "烧烤",
    "冰淇淋", "西瓜", "饺子", "汤圆", "粽子", "月饼", "红包", "猫", "狗", "鱼",
    "鸟", "花", "草", "树", "月亮", "星星", "太阳", "下雨", "天气", "假期", "周末",
    "放假", "旅游", "电影", "音乐", "小说", "动漫", "生日", "新年", "春节", "中秋",
    "国庆", "圣诞", "春节", "贴贴", "抱抱", "亲亲", "加油", "努力", "开心", "快乐",
    "幸福", "难过", "伤心", "生气", "可爱", "漂亮", "帅气", "聪明", "笨蛋", "傻瓜",
    "减肥", "健身", "考试", "学习", "学校", "老师", "同学", "朋友", "家人", "爸爸",
    "妈妈", "哥哥", "姐姐", "弟弟", "妹妹", "宝宝", "宝贝", "摆烂", "躺平", "内卷",
    "社畜", "吃瓜", "吐槽", "工作", "生活", "今天", "明天", "昨天", "现在", "马上",
    "一起", "喜欢", "讨厌", "谢谢", "你好", "再见", "晚安", "早安",
    # 开发/技术交流
    "测试", "测完", "调试", "开发", "编译", "部署", "发布", "版本", "打包", "接口",
    "报错", "崩溃", "产品", "运营", "设计", "会议", "邮件", "文档", "更新", "安装",
    "token", "agent", "bug", "api", "gpt", "chatgpt", "claude", "deepseek", "qoder",
    "electron", "github", "npm", "json", "webp", "webm", "cpu", "gpu", "sdk", "ide",
    "vscode", "python", "javascript", "typescript", "java", "node", "react", "vue",
    "sql", "html", "css", "code", "debug", "test", "release", "version", "update",
    "install", "windows", "macos", "linux", "ciallo",
    # 日常口语/功能词（避免从正常句子里误拆出敏感词）
    "完成", "上线", "下线", "修改", "改动", "提交", "合并", "分支", "仓库", "日志",
    "错误", "异常", "成功", "失败", "开始", "结束", "暂停", "继续", "好的", "可以",
    "知道", "觉得", "真的", "非常", "特别", "一点", "很多", "什么", "怎么", "为什么",
    "哪里", "这个", "那个", "我们", "你们", "他们", "自己", "大家", "事情", "时间",
    "地方", "东西", "问题", "办法", "感觉", "希望", "需要", "应该", "可能", "准备",
    "决定", "发现", "看到", "听到", "想到", "做到", "得到", "回来", "出去", "进来",
    "过去", "起来", "下来", "出来", "上来", "已经", "正在", "刚刚", "一直", "总是",
    "经常", "偶尔", "当然", "其实", "所以", "因为", "但是", "而且", "如果", "虽然",
    "然后", "最后", "第一", "第二", "一次", "一下", "一些", "有点", "不错", "好玩",
    "好看", "好吃", "好喝", "好听", "好累", "好困", "好饿", "好想", "好像", "好吧",
    "好啊", "哈哈", "嘿嘿", "嘻嘻", "呜呜", "啊啊", "嗯嗯", "哦哦", "运行", "启动",
    "关闭", "保存", "加载", "读取", "写入", "文件", "文件夹", "图片", "视频", "声音",
    "动画", "动作", "表情", "气泡", "菜单", "设置", "按钮", "窗口", "页面", "输入",
    "输出", "tel", "tell", "服务器", "服务", "崩了",
}

CLEAN_CATS = {"P", "S", "Z", "C"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    return "".join(ch for ch in s if unicodedata.category(ch)[0] not in CLEAN_CATS)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    repo = pathlib.Path(sys.argv[1]).resolve()
    vocab = repo / "Vocabulary"
    if not vocab.is_dir():
        raise SystemExit(f"找不到词库目录: {vocab}")

    commit = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True,
    ).stdout.strip() or "unknown"

    terms = set()
    used = []
    for name in CATEGORIES:
        p = vocab / name
        if not p.is_file():
            print(f"[lexicon] 跳过不存在的分类: {name}")
            continue
        used.append(name)
        count = 0
        for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            # 少量条目用逗号分隔多个词，逐条取出
            for part in re.split(r"[,，]", line):
                low = part.lower()
                if re.search(r"https?://|www\.|\.(com|cn|net|org)\b", low):
                    continue
                w = norm(part)
                # 很短的纯 ASCII 词条（tel、app 等）在中文句子里误伤率太高，直接忽略
                if re.fullmatch(r"[a-z0-9]+", w) and len(w) < 4:
                    continue
                if len(w) < 2 or len(w) > 50 or w.isdigit() or w in BENIGN:
                    continue
                if w not in terms:
                    terms.add(w)
                    count += 1
        print(f"[lexicon] {name}: +{count}")

    out_dir = pathlib.Path(__file__).resolve().parent.parent / "assets" / "sensitive"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "lexicon.txt"
    header = (
        "# 敏感词库：Konsheng/Sensitive-lexicon (MIT)\n"
        f"# upstream: https://github.com/Konsheng/Sensitive-lexicon commit {commit}\n"
        "# 已做 NFKC / 去空白标点 / 去重 / 忽略单字处理；程序内为离线匹配。\n"
    )
    out.write_text(header + "\n".join(sorted(terms)) + "\n", encoding="utf-8")

    sources = out_dir / "SOURCES.txt"
    sources.write_text(
        "敏感词库来源\n"
        "============\n\n"
        "上游：Konsheng/Sensitive-lexicon\n"
        "地址：https://github.com/Konsheng/Sensitive-lexicon\n"
        f"提交：{commit}\n"
        "许可：MIT（见仓库根目录 THIRD-PARTY-Sensitive-lexicon-LICENSE.txt）\n"
        f"生成时间：{datetime.date.today().isoformat()}\n\n"
        "选用的分类：\n" + "\n".join(f"- {n}" for n in used) + "\n\n"
        "说明：原始词库经过 NFKC、去空白/标点、去重与单字过滤；另有一份很小的\n"
        "      桌宠常用词白名单（只豁免完全相同的词条），避免正常台词被误伤。\n"
        "      词库完全离线使用，不联网、不上传用户输入。\n",
        encoding="utf-8",
    )
    print(f"[lexicon] 合计 {len(terms)} 条 -> {out} ({out.stat().st_size / 1024:.0f}KB)")


if __name__ == "__main__":
    main()
