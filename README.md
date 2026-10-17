# 大肥鱼桌宠 🐳🍚

一只在桌面上到处游的「蓝色大肥鱼」小桌宠——爱吃白饭、爱摸鱼、偶尔打个盹。会朝你的鼠标倾身、被你拖着甩来甩去、饿了会蔫、闲下来会碎碎念，还会记账：**它吃掉的白饭，就是你在 Qoder 里烧掉的 credits。** 现在有三个形象可以随时切换：大肥鱼（逐帧动画版）/ 大肥鱼 2（表情立绘版）/ GPT 娘。

角色素材与动画来自开源项目 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT）：**106 个 640×360 的 VP9-alpha 透明 WebM 动画**（待机 / 吃白饭 / 吃 Token / 被拖拽悬空 / 5 种点击回应 / 小憩沉眠 / 写代码 / 余额结算 / 玩魔方 / 放烟花 / 中秋赏月 / 装点圣诞树 …）＋ 27 张白饭梗表情包 ＋ 上首软糖体 ＋ 光标图标；提示音来自 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)。

## 下载安装

到 [Releases](https://github.com/shenliuyu18/dafeiyu-pet/releases) 下载安装包（Windows x64，双击安装，可自选安装目录，自动创建桌面 / 开始菜单快捷方式）：

| 版本 | 文件 | 说明 |
| --- | --- | --- |
| 大肥鱼桌宠 | `dafeiyu-pet-1.3.0-setup.exe` | 全部功能：摸鱼互动 + 白饭账本（Qoder / DeepSeek / Kimi / SiliconFlow 可切换）+ 大肥鱼v1~v6 与 GPT 娘（测试）可切换；没装 Qoder 也能正常用 |

> ⚠️ **升级前请先卸载旧版本（1.2.0 及更早），再安装 1.3.0。** 直接覆盖安装不会清理旧版留下的文件（老字体、梗图、多余的 DLL，白占 40MB+），也可能出现新旧快捷方式混杂。

> 安装包没有做代码签名，Windows SmartScreen 可能提示「未知发布者」——点「更多信息」→「仍要运行」就行。

## 开发运行

```bash
npm install
npm start
```

启动后她会出现在屏幕右下角，托盘里有图标可以随时叫出/藏起。

## 互动

| 操作 | 效果 |
| --- | --- |
| 拖拽 | 把她拖到桌面任意位置（播放"被鼠标拖拽悬空"动画，光标变抓取样式） |
| 单击 | 摸一下，随机播一个点击回应动画 + 冒一句梗台词（附梗图表情包），心情 +1 |
| 双击 | 喂一碗白饭（播放吃白饭 / 吃 Token / 大口吃零食动画） |
| 右键 | 菜单：喂白饭 / **选个动作…** / 番茄钟 / **白饭账本**（可在设置里关闭） / 状态 / 睡觉 / 设置 / 躲起来 / 退出 |
| 鼠标靠近 | 她会朝光标方向轻轻倾身；偶尔好奇地游过来 |
| 不管它 | 约 100 秒后开始打瞌睡（小憩沉眠动画 + Zzz）；闲下来每隔 30~80 秒自己找个乐子 |
| 玩点什么 | 从 106 个动画里按权重抽：小动作（伸懒腰/照镜子/敲桌面）、玩耍（玩魔方/抽陀螺/小提琴/蓝鲸现世）、吃什么（早餐/西瓜/涮火锅）、时节（放烟花/堆雪人/中秋赏月/装点圣诞树），另有 25% 概率变成"碎碎念"；想自己点播就右键菜单「选个动作」 |
| 提示音 | 喂饭成功与番茄钟结束播 `success`，取消专注播 `error`（音量 0.3 左右，不吵） |
| 托盘通知 | 番茄钟结束（完成图标）、宠物藏起来时的碎碎念（提问图标）；填了 `planQuota` 后，本月消耗跨过 80% / 100% 各弹一次提醒（警告 / 用尽图标） |

**⚙️ 设置**（右键菜单或托盘打开）：**形象与音效**（大肥鱼v1：106 个逐帧动画版；大肥鱼v2~v6：表情立绘版，分别有 18 / 32 / 32 / 16 / 2 种姿势与表情，各有独立的「选个动作」列表；GPT 娘：白发龙娘立绘 + 专属语录，不带白饭梗与表情包；音效：默认 / 鲸鱼音效 / 静音）、**尺寸与字体**（尺寸：小 70% / 默认 85% / 大 110% / 特大 140% 预设，还能 5% 微调，范围 0.6×~1.6×；字体大小 80%~140%，调气泡里的文字）、**待机与自动动作**（待机位置：到处游 / 待在右下角 / **固定不动**——拖到哪就待在哪；自动动作间隔：5~300 秒，**默认 40 秒**，每隔该时间随机做一个动作）、**番茄钟**（15 / 25 / 45 / 60 分钟预设，还能 ±5 分钟微调，范围 5~120 分钟）、**白饭账本**（开关 + 来源：Qoder credits / DeepSeek / Kimi / SiliconFlow / 豆包 / ChatGPT / Claude；配置各平台 API Key 后可查账单——⚠️ Key 用 Windows DPAPI 加密保存、只发给官方接口，设置里有醒目风险提示）、**启动与更新**（开机自启动、一起启动的应用、**自动更新开关**（默认开启）、**检查 GitHub 更新**——结果直接显示在设置里：发现新版本可「GitHub直链下载」「GitHub加速下载」（保存到系统「下载」文件夹）或「自动安装更新」（静默安装并自动重启）；每天首次启动会自动检查并按开关自动安装）、**关于大肥鱼桌宠**（操作说明 + GitHub 仓库 / Releases / 问题反馈链接）。设置按 7 个二级菜单分类，会记住、重启不丢。

**👧 形象**：大肥鱼v2~v6 与 GPT 娘是表情立绘（来自开源项目的素材，v6 的「摸摸头」是动态图），会按状态换姿势（睡觉 / 饿了 / 打工 / 摸鱼 / 喝奶茶……），平时有轻微呼吸浮动、换姿势会弹一下；点击、喂饭、拖拽、番茄钟等互动照常。"选个动作"面板会按当前形象列出它自己的动作。

**动画状态机**：核心状态 22 个动画随状态切换（待机呼吸 / 漂浮踏步 / 螃蟹走路 / 东张西望 / 点击回应 ×5 / 吃白饭 / 吃 Token / 大口吃零食 / 小憩沉眠 / 垂头叹气 / 雀跃庆祝 / 写代码 / 余额数金），外加 84 个闲时小节目；带文字的动画（`是啊，吃什么` / `深度思考碎碎念`）不参与镜像，避免字被翻过来。

**🍚 白饭账本**（设置里可关闭、可切换来源，右键菜单打开；GPT 娘显示为「用量账本」）：来源选 Qoder 时显示「今天吃掉 / 本月吃掉 / 本次会话」（单位 credits）；来源选 DeepSeek / Kimi / SiliconFlow 时显示该平台账户的「可用余额 / 赠送余额 / 充值余额」（需在设置 → 白饭账本里配置对应 API Key）。数字来自本机 Qoder 桌面端的会话转录（`~/.qoder-cn/projects/**/*.jsonl` 里每条 assistant 消息的 `message.usage.credits` 真值，含子代理），每 5 分钟自动刷新，托盘菜单也会显示本月合计。

想显示**套餐百分比**的话，在状态文件里加一行额度（单位 credits/月），账本就会多出一根进度条（Qoder 来源）。API 平台余额需要先在「设置 → 白饭账本 → API Key 配置」里填写对应平台的 Key（也可以设环境变量 `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `SILICONFLOW_API_KEY`）；⚠️ Key 会以明文保存在本机状态文件中，查询时只发送给对应平台的官方接口，请勿在共用电脑上填写，风险自负：

```jsonc
// %APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json
{ "satiety": 80, "mood": 90, "planQuota": 3000 }
```

**白饭梗小词典**：白饭 = 偷吃你的 Token；剩饭 = 缓存；外包摸鱼 = 调别的 Agent 干活；到点下班吃饭 = 推理完成。

**饱食度**随时间缓慢下降，掉到 32 以下她会变蔫、游得更慢、饭碗也空了；喂饭回满并提升心情。**番茄钟**：时长可在设置里调（5~120 分钟）；开始专注后她会游到屏幕角落挂倒计时牌安静陪你，时间到再游到屏幕正中央蹦跶提醒你休息；倒计时牌贴到屏幕下缘时会自动翻到鱼身上（不会被任务栏挡住）。

## 数据存放

`%APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json` —— 饱食度、心情、位置（下次启动回到原地）、尺寸 / 待机位置 / 番茄钟时长 / 白饭账本开关 / 开机自启动 / 一起启动的应用，以及可选套餐额度。

## 打包成 exe

```bash
npm run dist          # dist/dafeiyu-pet-<版本>-setup.exe（NSIS 安装包，可改安装目录、建桌面/开始菜单快捷方式）
npm run dist-install  # 打包并直接静默安装到本机（关闭正在运行的桌宠 → /S 安装 → 自动重新启动）
npm run dist-dir      # 只产出免安装目录 dist/win-unpacked/（含可执行文件，可直接拷走运行）
```

也可以直接 `node tools/build.js [--dir] [--out=目录]`，输出目录建议指到项目外（如 `--out=C:/Users/你的用户名/.dafeiyu-build`）。已启用 `compression: maximum` 并只打包中英文语言包来压体积。

用的是 electron-builder。国内网络需要镜像（脚本里已经带上，直接跑上面两条即可；手动执行时加环境变量）：

```bash
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
npm run dist
```

打包要点：`asar: false`（视频/字体直接走 file://，省掉 asar 里读媒体的坑）、`assets/**` 全量随包、图标用 `assets/icon.ico`（由 logo.png 转的多尺寸 ico）。用户数据存在 `%APPDATA%\dafeiyu-desktop-pet\`，和开发模式共用一份。

两个已经踩过的坑：

- **输出目录别放在项目里**：Windows 上这类工作区常有索引/杀软持有目录句柄，`win-unpacked.tmp → win-unpacked` 的改名会报 `EPERM`，改用 `-c.directories.output=<项目外路径>` 即可。
- **`tools/` 不进包**：主进程里 `require('./tools/dev')` 必须容错，否则被打包版带 `--dev-shot` 启动时会在主进程抛异常（正常启动不受影响，所以容易漏掉）。现在已经 try/catch 降级。

打包后没有控制台，主进程的未捕获异常与启动参数会追加写到 `%TEMP%\dafeiyu-error.log`，排查用。

## 目录结构

```
main.js                 主进程：透明置顶全屏窗口、托盘、番茄钟、鼠标穿透判定、账本推送
usage.js                白饭账本：扫描转录汇总 credits（按自然日/月，带 mtime+size 缓存；可用设置开关关闭）
preload.js              contextBridge 白名单桥
renderer/
  index.html            透明视频画布 + 气泡/菜单/账本卡片的 DOM 结构
  style.css             漂浮 / 倾身 / 蹦跳 / 拖拽挣扎 等反馈动画 + 上首软糖体
  pet.js                移动引擎、倾身跟随、状态机、动画状态机、气泡、菜单、账本卡片
assets/anims/*.webm     106 个 VP9-alpha 透明动画（大肥鱼 1 的形象素材）
assets/anims/index.js   动画清单（CSP 不允许 fetch，用 <script> 注入全局）
assets/fish2/*.webp     大肥鱼v2 的半身立绘（18 种表情）
assets/fish3/*.webp     大肥鱼v3 的半身立绘（32 种表情）
assets/fish4/*.webp     大肥鱼v4 的全身立绘（32 种姿势）
assets/fish5/*.webp     大肥鱼v5 的全身立绘（16 种姿势）
assets/fish6/*.webp     大肥鱼v6 的立绘（DSniang1 + 摸摸头动图）
assets/gpt/*.webp       GPT 娘的立绘
assets/memes/*.webp     白饭梗表情包（气泡配图）
assets/sounds/*.wav     默认音效（成功 / 失败）
assets/sounds/whale-*.mp3  鲸鱼音效（DeepSeek 鲸鱼挂件的按下/松开提示音）
assets/fonts/上首软糖体.woff2  气泡字体（按源码用字子集化）
assets/pic/             光标 + 托盘通知图标（notify-*.png）
assets/logo.png         托盘图标
tools/dev.js            开发用截图 / 真实鼠标链路自测
tools/build.js          打包脚本（安装包 / 免安装目录，配置文件透传中文参数避开编码坑）
tools/make-char-assets.py  立绘形象素材流水线（裁 alpha 包围盒 → 归一化 640×360 → WebP）
tools/subset-font.py    气泡字体子集化（按源码用字收集字符转 WOFF2）
tools/shrink-anims.js   动画素材重编码（VP9 alpha 压缩，保透明通道）
tools/pipeline/         自制动作的素材流水线（去水印 → 抠绿 → 归一化 → 编码）
docs/                   动作生成提示词库 + 通知图标提示词
```

## 实现要点

- **窗口**：一块铺满工作区的透明、置顶、不抢焦点的窗口，角色在窗口里用 CSS `transform` 游动（GPU 合成，60fps 顺滑）。早期版本用「小窗口 + setPosition 跟随」，在 150% DPI 缩放下 Windows 会累积 1px 尺寸漂移，因此改成整屏画布方案。
- **鼠标穿透**：主进程每 30ms 轮询光标位置，命中角色（或菜单打开 / 拖拽中）才 `setIgnoreMouseEvents(false)`，其余时间整块画布完全穿透。Windows 上 `forward: true` 转发不可靠，所以没有依赖它。
- **角色素材**：直接使用 dsh-pet 的 VP9-alpha 透明 WebM，用 `<video>` 播放（Chromium 原生支持 alpha 通道）。素材画布 640×360，角色居中约占 226×282，四周透明，所以显示框比角色大一圈也不影响观感。注意 CSP 里必须放行 `media-src` 与 `font-src`，否则视频和字体会被 `default-src 'none'` 拦掉。
- **动画状态机**：`applyBase()` 按「拖拽 > 睡觉 > 番茄钟 > 饿了 > 移动 / 待机」优先级选循环动画；点击/喂食/账本等一次性动作走 `playOnce()`（播完自动回到基础态，带超时兜底），播小节目时站定不走动。
- **闲时小节目**：分类权重照抄 dsh-pet 的 `animationWeights` / `categories`（小动作 20 / 玩耍 20 / 吃什么 16 / 时节 14 / 文字 10），另外 25% 概率改成"碎碎念"（配一句梗台词）。账本按套餐已用百分比分 6 档播对应的「余额-*」动画（照抄它的 `events.balance` 档位）。
- **倾身跟随**：视频是位图序列，瞳孔没法单独动，改成整个身子朝光标方向最多偏移 5px（拖拽时停用）。
- **尺寸缩放**：角色包在 `#scale` 里整体 CSS `scale`（左上角为原点），命中框、移动边界、主进程穿透判定按比例换算，0.6×~1.6× 任意档位拖拽/点击都精确。

## 加自己的动作（可选）

1. 照着 [docs/桌面宠物10秒动作提示词.md](docs/桌面宠物10秒动作提示词.md) 里的模板（106 个动作的完整提示词库，含"系统通知图标"那份）让 AI 生成一段 10 秒、正面、纯色背景的角色动画。
2. 一条命令处理完（抠绿 + 归一化 640×360/30fps + 编码 VP9-alpha + 刷新动画清单）：

   ```bash
   tools/pipeline/make-anim.sh 写周报.mp4 写周报
   ```

3. 把动作名加进 [renderer/pet.js](renderer/pet.js) 的对应动画池（或 `ACTIONS` 的某个分类），重启桌宠即可。带文字的动作记得同时加进 `NO_MIRROR`，免得被左右翻转。

`tools/pipeline/` 里的其余脚本（`chroma_step02.py` 等）是 dsh-pet 原版生产线，按它们自己的工作区约定写死（`step01/`→`step02/` 目录、自带 ffmpeg、依赖 numpy），留作参考；日常用 `make-anim.sh` 就够了。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)——v1.0.0（2026-10-15）首个正式版；v1.1.0 新增设置界面与右下角停靠；v1.2.0 新增番茄钟自定义时长与「选个动作」、默认尺寸 85%、安装包瘦身到 98MB；v1.3.0 合并为单一版本，新增固定位置、开机自启动与关联启动；v1.4.0 新增多形象切换与字体大小调节；v1.5.0 加入四套表情立绘；v1.3.0 新增**多形象（大肥鱼v1~v6 + GPT 娘）**、**多平台 AI 账单账本（含豆包 / ChatGPT / Claude，API Key 加密保存）**、**二级菜单设置**、**自动更新（可开关）**、音效包、字体大小、固定位置、自启动、自动动作间隔、番茄钟时长、「选个动作」，并做了大幅体积优化（升级前记得先卸载旧版本）。

## 素材来源与许可

角色动画、表情包、字体、光标与通知图标来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT License，见 [THIRD-PARTY-dsh-pet-LICENSE.txt](THIRD-PARTY-dsh-pet-LICENSE.txt)）——一个跑在 DeepSeek Harness 里的桌宠插件，也是这套「蓝发小女仆 + 鲸尾」形象与 106 个动作动画的出处。本程序取用了它的全部动画、全部表情包与图标字体，实现完全独立；随机小节目的分类权重、余额分档规则、`NO_MIRROR` 约定都参考了它的配置文件，`tools/pipeline/` 与 `docs/` 直接来自其素材生产线，方便你继续扩动作。

成功 / 失败提示音来自 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)（同一套素材的 macOS(Swift) 移植版，同样 MIT），它的状态划分（idle / poke / head_pat / working / waiting / success / error / dragging / eat_token）也参考了本程序的动画状态机设计。

「大肥鱼v2~v5」的表情立绘来自 [louke6572/dsh-whale-widget-plus](https://github.com/louke6572/dsh-whale-widget-plus)（MIT，见 [THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt](THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt)）——DeepSeek Harness 的余额挂件系列（原作 MeteorNOX/DeepSeek-Balance-Whale-Widget）的素材，取用了它的四套表情包（共 98 张表情姿势图）；「鲸鱼音效」的提示音也来自该项目。

「大肥鱼v6」的形象来自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT，见 [THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt](THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt)）——DeepSeek Harness 余额挂件的原作，取用了它的立绘与「摸摸头」动图。

「GPT 娘」的立绘与语录来自 [T7moris/GPT-Niang](https://github.com/T7moris/GPT-Niang)（MIT，见 [THIRD-PARTY-GPT-Niang-LICENSE.txt](THIRD-PARTY-GPT-Niang-LICENSE.txt)）——Windows / macOS 的 GPT 额度挂件，取用了它的立绘与 `quotes.json` 语录。

## 开发工具

```bash
npm run shot                    # 截图当前状态到 dev-shots/
npm run shot -- --dev-scene=eat # 场景：idle/eat/happy/doze/hungry/status/usage/pomodoro/menu/bubble
npm run input-test              # 真机自测：鼠标穿透切换、真实点击、拖拽、菜单投喂链路
npm start -- --dev-cpu          # 打印动画播放时的 CPU / 内存占用
```

`input-test` 会先铺一块不透明"测试垫"窗口再模拟真实鼠标，即使事件意外穿透也只会落在测试垫上，不会误点桌面图标。

实测占用（150% DPI、透明视频常驻播放、含音频进程）：**CPU ≈ 2.2–3.3%（单核占比）**，内存 ≈ 440MB。
