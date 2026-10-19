# 大肥鱼桌宠 🐳🍚

一只在桌面上到处游的「蓝色大肥鱼」小桌宠——爱吃白饭、爱摸鱼、偶尔打个盹。会朝你的鼠标倾身、被你拖着甩来甩去、饿了会蔫、闲下来会碎碎念，还会记账：**它吃掉的白饭，就是你在 Qoder 里烧掉的 credits。** 现在有七个形象可以随时切换：大肥鱼v1（逐帧动画）/ 大肥鱼v2~v6（五套表情立绘）/ GPT 娘（测试）。

角色素材与动画来自开源项目 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT）：**106 个 640×360 的高画质 VP9-alpha 透明 WebM 动画**（待机 / 吃白饭 / 吃 Token / 被拖拽悬空 / 5 种点击回应 / 小憩沉眠 / 写代码 / 余额结算 / 玩魔方 / 放烟花 / 中秋赏月 / 装点圣诞树 …）＋ 27 张无损梗图表情包 ＋ 完整上首软糖体 ＋ 光标图标；提示音来自 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)。立绘形象取用上游原始 PNG 并按 2 倍分辨率归一到 1280×720 画布，放大桌宠或在 150% DPI 屏幕上依然清晰。

> **架构（1.4.2 正式版）**：已迁移到 **Wails v2 + 系统 WebView2**，不再打包 Chromium，并提供两个版本：**完整版**（全部原始素材，安装包 68.6MiB / 安装后约 74.7MiB）与 **Lite 版**（动画 480×270 VP9-alpha、立绘 720px WebP q84，安装包 39.7MiB / 安装后约 46.0MiB）。完整版素材按原字节装进 store-only 的 `assets.zip`，**不重新编码、不降采样、不做字体子集化**；Lite 版由 `tools/build-lite-assets.py` 生成压缩素材，音效、字体、敏感词库与梗图保留。两版功能一致，使用独立安装目录、状态目录与单实例，可同时运行。安装包内置微软 WebView2 在线引导：目标机缺少运行时会自动下载安装（需要联网），安装向导为简体中文。

## 下载安装

到 [Releases](https://github.com/shenliuyu18/dafeiyu-pet/releases) 下载安装包（Windows x64，双击安装，可自选安装目录，自动创建桌面 / 开始菜单快捷方式）：

| 版本 | 文件 | 说明 |
| --- | --- | --- |
| 大肥鱼桌宠（正式版·完整） | `dafeiyu-pet-1.4.2-setup.exe` | **Wails/WebView2**；原始素材；用户级安装、桌面/开始菜单快捷方式；中文安装向导；安装包 68.6MiB，安装后约 74.7MiB |
| 大肥鱼桌宠 Lite（正式版） | `dafeiyu-pet-lite-1.4.2-setup.exe` | **Wails/WebView2**；压缩素材；功能与完整版一致；中文安装向导；安装包 39.7MiB，安装后约 46.0MiB |

> 备用下载：[蓝奏云网盘](https://wwaql.lanzouu.com/b01i5xmkri)（密码 **5meo**），完整版与 Lite 版同步提供。

> 安装路径：完整版 `%LOCALAPPDATA%\Programs\大肥鱼桌宠`，Lite 版 `%LOCALAPPDATA%\Programs\大肥鱼桌宠 Lite`；两版可同时安装、同时运行。完整版沿用 `%APPDATA%\dafeiyu-desktop-pet` 的设置与 API Key；Lite 版使用独立的 `%APPDATA%\dafeiyu-desktop-pet-lite`，互不影响。桌面 / 开始菜单快捷方式和托盘图标均为 `assets/logo.png` 生成的图标。

> ⚠️ **从 Electron 旧版（1.3.0 及更早）升级：请先在「Windows 设置 → 应用」卸载旧版，再安装 1.4.2。** 1.4.0 起仓库与本机都不再包含 Electron 代码、运行时和依赖；直接覆盖安装不会清理旧版留下的文件（白占 200MB+），也可能出现新旧快捷方式混杂。Wails 版的完整版与 Lite 版使用独立安装目录，可以同时安装、同时运行。

> 安装包没有做代码签名，Windows SmartScreen 可能提示「未知发布者」——点「更多信息」→「仍要运行」就行。

## 开发运行

本项目为 **Wails v2 + 系统 WebView2**，不再包含 Electron 代码或依赖，也没有 npm 运行时依赖。开发/打包前置：Node.js、Go 1.25+、Wails CLI v2.16+、NSIS 3.x、Windows 自带/已安装的 WebView2；具体构建命令见下方「打包」。启动后她会出现在屏幕右下角，托盘里有图标可以随时叫出/藏起。

## 互动

| 操作 | 效果 |
| --- | --- |
| 拖拽 | 把她拖到桌面任意位置（播放"被鼠标拖拽悬空"动画，光标变抓取样式） |
| 单击 | 摸一下，随机播一个点击回应动画 + 冒一句梗台词（附梗图表情包），心情 +1 |
| 双击 | 喂一碗白饭（播放吃白饭 / 吃 Token / 大口吃零食动画） |
| 右键 | 菜单：喂白饭 / **选个动作…** / 番茄钟 / **白饭账本**（可在设置里关闭） / 状态 / 睡觉 / 设置 / 躲起来 / 退出 |
| 鼠标靠近 | 她会朝光标方向轻轻倾身；偶尔好奇地游过来 |
| 不管它 | 约 100 秒后开始打瞌睡（小憩沉眠动画 + Zzz）；闲下来每隔设定时间（默认 40 秒，可在设置里调）自己找个乐子 |
| 玩点什么 | 从 106 个动画里按权重抽：小动作（伸懒腰/照镜子/敲桌面）、玩耍（玩魔方/抽陀螺/小提琴/蓝鲸现世）、吃什么（早餐/西瓜/涮火锅）、时节（放烟花/堆雪人/中秋赏月/装点圣诞树），另有 25% 概率变成"碎碎念"；想自己点播就右键菜单「选个动作」，点动作右侧的 ☆ 可置顶，最多 10 个 |
| 提示音 | 喂饭成功与番茄钟结束播 `success`，取消专注播 `error`（音量 0.3 左右，不吵） |
| 托盘通知 | 番茄钟结束（完成图标）、宠物藏起来时的碎碎念（提问图标）；填了 `planQuota` 后，本月消耗跨过 80% / 100% 各弹一次提醒（警告 / 用尽图标） |

**⚙️ 设置**（右键菜单或托盘打开）：**形象与音效**（大肥鱼v1：106 个逐帧动画版；大肥鱼v2~v6：表情立绘版，分别有 18 / 32 / 32 / 16 / 2 种姿势与表情，各有独立的「选个动作」列表；GPT 娘：白发龙娘立绘 + 专属语录，不带白饭梗与表情包；音效：默认 / 鲸鱼音效 / 静音）、**尺寸与字体**（尺寸：小 70% / 默认 85% / 大 110% / 特大 140% 预设，还能 5% 微调，范围 0.6×~1.6×；字体大小 80%~140%，同时缩放气泡、右键菜单与「选个动作」面板）、**待机与自动动作**（待机位置：到处游 / 待在右下角 / **固定不动**——拖到哪就待在哪；自动动作间隔：5~300 秒，**默认 40 秒**，每隔该时间随机做一个动作）、**番茄钟**（15 / 25 / 45 / 60 分钟预设，还能 ±5 分钟微调，范围 5~120 分钟；工作动作播完后的休息间隔默认 5 秒，可在 5~120 秒间调节）、**白饭账本**（开关 + 来源：Qoder credits / DeepSeek / Kimi / SiliconFlow / 豆包 / ChatGPT / Claude；配置各平台 API Key 后可查账单——⚠️ Key 用 Windows DPAPI 加密保存、只发给官方接口，设置里有醒目风险提示）、**启动与更新**（开机自启动、一起启动的应用、**自动更新开关**（默认开启）、**检查 GitHub 更新**——结果直接显示在设置里：发现新版本可「GitHub直链下载」「GitHub加速下载」（保存到系统「下载」文件夹）或「自动安装更新」（静默安装并自动重启）；每天首次启动会自动检查并按开关自动安装）、**自定义互动文字**（独立小窗编辑，每行一句、最多 20 行 × 40 字；保存时用离线敏感词库检查，启用以代替默认台词）、**关于大肥鱼桌宠**（操作说明 + GitHub 仓库 / 更新日志 / 问题反馈链接）。「选个动作」支持点 ☆ 置顶常用动作（每个形象最多 10 个）。设置按 8 个二级菜单分类，会记住、重启不丢。

**👧 形象**：大肥鱼v2~v6 与 GPT 娘是表情立绘（来自开源项目的素材，v6 的「摸摸头」是动态图），会按状态换姿势（睡觉 / 饿了 / 打工 / 摸鱼 / 喝奶茶……），平时有轻微呼吸浮动、换姿势会弹一下；点击、喂饭、拖拽、番茄钟等互动照常。"选个动作"面板会按当前形象列出它自己的动作。

**动画状态机**：核心状态 22 个动画随状态切换（待机呼吸 / 漂浮踏步 / 螃蟹走路 / 东张西望 / 点击回应 ×5 / 吃白饭 / 吃 Token / 大口吃零食 / 小憩沉眠 / 垂头叹气 / 雀跃庆祝 / 写代码 / 余额数金），外加 84 个闲时小节目；带文字的动画（`是啊，吃什么` / `深度思考碎碎念`）不参与镜像，避免字被翻过来。

**🍚 白饭账本**（设置里可关闭、可切换来源，右键菜单打开；GPT 娘显示为「用量账本」）：来源选 Qoder 时显示「今天吃掉 / 本月吃掉 / 本次会话」（单位 credits）；来源选 DeepSeek / Kimi / SiliconFlow 时显示该平台账户的「可用余额 / 赠送余额 / 充值余额」（需在设置 → 白饭账本里配置对应 API Key）。数字来自本机 Qoder 桌面端的会话转录（`~/.qoder-cn/projects/**/*.jsonl` 里每条 assistant 消息的 `message.usage.credits` 真值，含子代理），每 5 分钟自动刷新，托盘菜单也会显示本月合计。

想显示**套餐百分比**的话，在状态文件里加一行额度（单位 credits/月），账本就会多出一根进度条（Qoder 来源）。API 平台余额需要先在「设置 → 白饭账本 → API Key 配置」里填写对应平台的 Key（也可以设环境变量 `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `SILICONFLOW_API_KEY`）；⚠️ Key 用 Windows DPAPI 加密后保存在本机状态文件中，只有当前 Windows 账户能解密，查询时只发送给对应平台的官方接口，请勿在共用电脑上填写，风险自负：

```jsonc
// %APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json
{ "satiety": 80, "mood": 90, "planQuota": 3000 }
```

**白饭梗小词典**：白饭 = 偷吃你的 Token；剩饭 = 缓存；外包摸鱼 = 调别的 Agent 干活；到点下班吃饭 = 推理完成。

**饱食度**随时间缓慢下降，掉到 32 以下她会变蔫、游得更慢、饭碗也空了；喂饭回满并提升心情。**番茄钟**：时长可在设置里调（5~120 分钟）；开始专注后她会游到屏幕角落挂倒计时牌安静陪你，专注期间不执行其他自动动作，每个工作动作完整播完后休息设定的「工作动画播放间隔」（默认 5 秒）再播下一个；右键「选个动作」等手动操作仍可播放；时间到再游到屏幕正中央蹦跶提醒你休息；倒计时牌贴到屏幕下缘时会自动翻到鱼身上（不会被任务栏挡住）。

## 数据存放

`%APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json` —— 饱食度、心情、位置（下次启动回到原地）、尺寸 / 待机位置 / 番茄钟时长与工作动画间隔 / 白饭账本开关 / 开机自启动 / 一起启动的应用，以及可选套餐额度。

## 打包

前置：Node.js、Go 1.25+、Wails CLI v2.16+、NSIS 3.x、Windows 自带/已安装的 WebView2。项目**没有 npm 依赖**，构建脚本使用 Node 内置模块，并把本机用户目录里的 Go/Wails/NSIS 工具链自动加入 PATH。

```bash
npm run build              # 完整版 → dist/dafeiyu-pet-<版本>-setup.exe
npm run build:lite         # Lite 版（自动生成压缩素材）→ dist/dafeiyu-pet-lite-<版本>-setup.exe
npm run dist-install       # 构建完整版并静默安装到本机 + 启动
npm run dist-install:lite  # 构建 Lite 版并静默安装到本机 + 启动
```

- 前端由 `tools/wails-prepare.js` 从 `renderer/` + `assets/`（完整版）或 `assets-lite/`（Lite 版）生成：HTML/JS/CSS 改写相对路径，素材装进 `assets.zip`，Wails 用虚拟 fs 直接读取并支持视频 Range 请求。完整版保持 store-only 原字节；Lite 版素材由 `tools/build-lite-assets.py` 预压缩（`--lite` 构建时自动调用）。
- Go 后端在 `wails/`：透明置顶全屏窗口、Win32 鼠标 Region 与点击穿透、托盘、番茄钟、Qoder credits、API 账单与 DPAPI Key、敏感词过滤、更新检查/静默安装。构建启用 `-trimpath` 与 `-buildvcs=false`，不会把本机工具链路径或 VCS 信息写进 exe。
- 安装包使用 `-webview2 download`：安装器检测到缺少 WebView2 时会下载并安装；Wails NSIS 已内置微软在线引导，因此完整版安装包体积为 68.6MiB。发布资产命名为 `dafeiyu-pet-<正式版本>-setup.exe` / `dafeiyu-pet-lite-<正式版本>-setup.exe`（不再带 `wails` 后缀），更新检查会按 `setup.exe` 后缀与 lite 标识选择对应版本。安装向导使用简体中文（NSIS `SimpChinese`）。
- 正式版发布时同步更新 **GitHub Release** 与 **蓝奏云网盘**（<https://wwaql.lanzouu.com/b01i5xmkri>，密码 **5meo**）。蓝奏云使用半自动脚本 `npm run lanzou:upload -- dist/dafeiyu-pet-<版本>-setup.exe dist/dafeiyu-pet-lite-<版本>-setup.exe`：首次在独立 Edge 手动登录，之后脚本自动填入两个安装包，不读取或保存密码 / Cookie。
- **版本号约定**：开发期间用测试版版本号（如 `1.5.0-beta.1`），只在发布到 GitHub 时才改成正式版号（如 `1.5.0`），并同步 CHANGELOG/README/安装包名。当前正式版为 **1.4.2**；Wails 的 Windows 文件版本使用数字段 `1.4.2.0`，应用内关于页与更新检查使用完整版本号。

## 目录结构

```
wails/                  Wails v2 + Go 后端（唯一实现）
  main.go               启动、绑定、窗口/透明/焦点/更新
  win32.go              Win32 窗口样式、动态 Region、命中轮询、DPAPI
  state.go              状态持久化、设置、DPAPI Key、自动启动
  ledger.go             Qoder credits + 6 个 API 平台账单
  words.go              离线敏感词 Trie 过滤
  update.go             GitHub 更新检查/下载/静默安装
  tray_windows.go       原生托盘与气泡通知
  assets.go             assets.zip 虚拟文件系统（支持 Range）
  frontend/api.js       window.pet → Wails 绑定/事件 + 内联 Key/文字编辑
  build/appicon.png     logo 生成的程序图标源图
  build/windows/icon.ico、info.json、installer/project.nsi
                        安装包图标、exe 版本信息、简体中文 NSIS 安装向导
tools/wails-prepare.js  从 renderer/ + assets/ 生成 Wails 前端（assets.zip 不压缩）
tools/wails-build.js    一键构建 NSIS、拷贝到 dist、可 --install
tools/build-lite-assets.py  Lite 压缩素材流水线（只写 assets-lite/）
tools/make-char-assets.py   立绘裁 alpha / 归一化 / WebP 流水线
tools/build-lexicon.py      离线敏感词库生成
tools/pipeline/             自制动作素材流水线（去水印 → 抠绿 → 归一化 → 编码）
renderer/               两版共用的前端 DOM/CSS/JS
  index.html            透明视频画布 + 气泡/菜单/账本卡片的 DOM 结构
  style.css             漂浮 / 倾身 / 蹦跳 / 拖拽挣扎 等反馈动画 + 上首软糖体
  pet.js                移动引擎、倾身跟随、动画状态机、气泡、菜单、账本卡片
assets/anims/*.webm     106 个上游原始 VP9-alpha 透明动画（51.8MB，大肥鱼 1 的形象素材）
assets/anims/index.js   动画清单（CSP 不允许 fetch，用 <script> 注入全局）
assets/fish2/*.webp     大肥鱼v2 的半身立绘（18 种表情，1280×720 画布）
assets/fish3/*.webp     大肥鱼v3 的半身立绘（32 种表情）
assets/fish4/*.webp     大肥鱼v4 的全身立绘（32 种姿势）
assets/fish5/*.webp     大肥鱼v5 的全身立绘（16 种姿势）
assets/fish6/*.webp     大肥鱼v6 的立绘（DSniang1 + 摸摸头动图）
assets/gpt/*.webp       GPT 娘的立绘（高分辨率归一化）
assets/memes/*.webp     白饭梗表情包（无损 WebP，气泡配图）
assets/sounds/*.wav     默认音效（成功 / 失败）
assets/sounds/whale-*.mp3  鲸鱼音效（DeepSeek 鲸鱼挂件的按下/松开提示音）
assets/fonts/上首软糖体.woff2  完整气泡字体（2.2MB，支持任意自定义汉字）
assets/sensitive/       离线敏感词库（Sensitive-lexicon, MIT）+ 来源说明
assets/pic/             光标 + 托盘通知图标（notify-*.png）
assets/logo.png         图标源图（大肥鱼v6 平静立绘，透明背景）
docs/                   动作生成提示词库 + 通知图标提示词
```

## 实现要点

- **Wails 透明窗口与点击穿透**：`WindowIsTranslucent: true` + `BackdropType: None` 让 WebView2 真正透出桌面；`WS_EX_NOACTIVATE` 默认不抢焦点，打开设置时移除并 `SetForegroundWindow`，关闭后恢复。全屏窗口用 **动态 Region**（`SetWindowRgn`）保留桌宠 + 完整气泡/梗图/账本卡/倒计时牌区域；菜单、设置、拖拽时恢复整窗。面板/焦点调用串行化，并在**显示面板前先扩 Region**、**关闭面板后延迟 260ms 再缩 Region**（覆盖 160ms 淡出动画）；前端 JS/CSS 带版本号，避免 WebView2 使用旧缓存。这样 WebView2 子窗口不会吞掉桌面点击，气泡和设置也完整显示。
- **素材零改动（完整版）**：`assets.zip` 以 store-only 写入，视频/立绘/梗图/字体/音效字节与源文件一致；Wails 通过 `zipFS` 提供虚拟文件系统，视频 Range 请求可用。Lite 版是唯一例外，压缩结果单独生成到 `assets-lite/`，不覆盖完整版素材。
- **前端结构**：`renderer/` 是唯一的界面源码；`wails/frontend/api.js` 把它映射到 Wails 绑定/事件，并在主窗口内提供可聚焦的 API Key/自定义文字编辑卡片。
- **窗口**：一块铺满工作区的透明、置顶、不抢焦点的窗口，角色在窗口里用 CSS `transform` 游动（GPU 合成，60fps 顺滑）。早期版本用「小窗口 + setPosition 跟随」，在 150% DPI 缩放下 Windows 会累积 1px 尺寸漂移，因此改成整屏画布方案。
- **角色素材**：直接使用 dsh-pet 的 VP9-alpha 透明 WebM，用 `<video>` 播放（Chromium 原生支持 alpha 通道）。素材画布 640×360，角色居中约占 226×282，四周透明，所以显示框比角色大一圈也不影响观感。注意 CSP 里必须放行 `media-src` 与 `font-src`，否则视频和字体会被 `default-src 'none'` 拦掉。
- **动画状态机**：`applyBase()` 按「拖拽 > 睡觉 > 番茄钟 > 饿了 > 移动 / 待机」优先级选循环动画；点击/喂食/账本等一次性动作走 `playOnce()`（播完自动回到基础态，带超时兜底），播小节目时站定不走动。
- **闲时小节目**：分类权重照抄 dsh-pet 的 `animationWeights` / `categories`（小动作 20 / 玩耍 20 / 吃什么 16 / 时节 14 / 文字 10），另外 25% 概率改成"碎碎念"（配一句梗台词）。账本按套餐已用百分比分 6 档播对应的「余额-*」动画（照抄它的 `events.balance` 档位）。
- **倾身跟随**：视频是位图序列，瞳孔没法单独动，改成整个身子朝光标方向最多偏移 5px（拖拽时停用）。
- **尺寸缩放**：角色包在 `#scale` 里整体 CSS `scale`（左上角为原点），命中框、移动边界、Wails 穿透判定按比例换算，0.6×~1.6× 任意档位拖拽/点击都精确。

## 加自己的动作（可选）

1. 照着 [docs/桌面宠物10秒动作提示词.md](docs/桌面宠物10秒动作提示词.md) 里的模板（106 个动作的完整提示词库，含"系统通知图标"那份）让 AI 生成一段 10 秒、正面、纯色背景的角色动画。
2. 一条命令处理完（抠绿 + 归一化 640×360/30fps + 编码 VP9-alpha + 刷新动画清单）：

   ```bash
   tools/pipeline/make-anim.sh 写周报.mp4 写周报
   ```

3. 把动作名加进 [renderer/pet.js](renderer/pet.js) 的对应动画池（或 `ACTIONS` 的某个分类），重启桌宠即可。带文字的动作记得同时加进 `NO_MIRROR`，免得被左右翻转。

`tools/pipeline/` 里的其余脚本（`chroma_step02.py` 等）是 dsh-pet 原版生产线，按它们自己的工作区约定写死（`step01/`→`step02/` 目录、自带 ffmpeg、依赖 numpy），留作参考；日常用 `make-anim.sh` 就够了。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)——v1.0.0（2026-10-15）首个正式版；v1.1.0 新增设置界面与右下角停靠；v1.2.0 新增番茄钟自定义时长与「选个动作」、默认尺寸 85%；v1.3.0 合并为单一版本，新增多形象（大肥鱼v1~v6 + GPT 娘）、多平台 AI 账单账本（API Key 加密保存）、二级菜单设置、自动更新、音效包、字体大小、固定位置、自启动与自动动作间隔；**v1.4.0（2026-10-18）正式版**恢复上游最高画质素材、加入自定义互动文字与离线敏感词过滤，修复长动作后半段被截断与全屏窗口吞点击，迁移到 Wails + 系统 WebView2，并同时提供完整版（素材零压缩）与 Lite 版（压缩素材），两版可并存。安装向导为简体中文。v1.4.1 修复完整版与 Lite 同时运行时的窗口互相抢占导致的闪现问题；v1.4.2 增加蓝奏云下载入口，并让 GitHub 直链/加速下载在完成后自动打开安装程序。

## 素材来源与许可

角色动画、表情包、字体、光标与通知图标来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT License，见 [THIRD-PARTY-dsh-pet-LICENSE.txt](THIRD-PARTY-dsh-pet-LICENSE.txt)）——一个跑在 DeepSeek Harness 里的桌宠插件，也是这套「蓝发小女仆 + 鲸尾」形象与 106 个动作动画的出处。本程序取用了它的全部动画、全部表情包与图标字体，实现完全独立；随机小节目的分类权重、余额分档规则、`NO_MIRROR` 约定都参考了它的配置文件，`tools/pipeline/` 与 `docs/` 直接来自其素材生产线，方便你继续扩动作。

成功 / 失败提示音来自 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)（同一套素材的 macOS(Swift) 移植版，同样 MIT），它的状态划分（idle / poke / head_pat / working / waiting / success / error / dragging / eat_token）也参考了本程序的动画状态机设计。

「大肥鱼v2~v5」的表情立绘来自 [louke6572/dsh-whale-widget-plus](https://github.com/louke6572/dsh-whale-widget-plus)（MIT，见 [THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt](THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt)）——DeepSeek Harness 的余额挂件系列（原作 MeteorNOX/DeepSeek-Balance-Whale-Widget）的素材，取用了它的四套表情包（共 98 张表情姿势图）；「鲸鱼音效」的提示音也来自该项目。

「大肥鱼v6」的形象来自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT，见 [THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt](THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt)）——DeepSeek Harness 余额挂件的原作，取用了它的立绘与「摸摸头」动图。

「GPT 娘」的立绘与语录来自 [T7moris/GPT-Niang](https://github.com/T7moris/GPT-Niang)（MIT，见 [THIRD-PARTY-GPT-Niang-LICENSE.txt](THIRD-PARTY-GPT-Niang-LICENSE.txt)）——Windows / macOS 的 GPT 额度挂件，取用了它的立绘与 `quotes.json` 语录。

自定义互动文字的敏感词库来自 [Konsheng/Sensitive-lexicon](https://github.com/Konsheng/Sensitive-lexicon)（MIT License，见 [THIRD-PARTY-Sensitive-lexicon-LICENSE.txt](THIRD-PARTY-Sensitive-lexicon-LICENSE.txt)），取用其政治 / 色情 / 暴力 / 涉枪涉爆 / 广告等分类，在本机离线匹配；词库原文与选用清单见 `assets/sensitive/SOURCES.txt`。

## 关于旧版

1.4.0 起不再提供 Electron 版本：仓库中没有 Electron 主进程、预加载脚本、旧编辑窗口或 electron/electron-builder 依赖，也没有回退构建。若本机还装有 1.3.0 或更早的 Electron 版，请先在「Windows 设置 → 应用」中卸载，再安装 1.4.2。
