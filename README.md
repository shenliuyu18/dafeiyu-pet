<div align="center">
  <img src="assets/logo.png" width="120" alt="大肥鱼桌宠">
  <h1>大肥鱼桌宠</h1>
  <p><strong>会吃白饭、会摸鱼、会记账的 Windows 桌面伙伴。</strong></p>
  <p>
    <a href="https://github.com/shenliuyu18/dafeiyu-pet/releases">下载</a> ·
    <a href="https://shenliuyu18.github.io/dafeiyu-pet/">官网</a> ·
    <a href="CHANGELOG.md">更新日志</a> ·
    <a href="https://github.com/shenliuyu18/dafeiyu-pet/issues">问题反馈</a>
  </p>
</div>

---

一只在桌面上到处游的「蓝色大肥鱼」小桌宠。她会朝你的鼠标倾身、被你拖着甩来甩去、饿了会蔫、闲下来会碎碎念，还会记账：**她吃掉的白饭，就是你在 Qoder 里烧掉的 credits。**

- **106 个逐帧动作**：待机、吃白饭、写代码、玩魔方、放烟花、中秋赏月、装点圣诞树……
- **8 个可选形象**：大肥鱼 v1–v6、GPT 娘、GPT娘v2（测试）。
- **143 张表情包**：经典梗图 + 蓝色大肥鱼档案馆精选 + dsh-meme 图库，逐张配文。
- **白饭账本**：读取本机 Qoder 用量，也能查 DeepSeek、Kimi、SiliconFlow、豆包、ChatGPT、Claude 的余额。
- **不只是卖萌**：番茄钟、全屏视频/游戏自动避让、自定义互动文字、开机自启、随时点播喜欢的动作。

技术栈为 **Wails v2 + 系统 WebView2**：不打包 Chromium，安装体积小、内存占用低，素材与数据都留在本机。

## 下载安装

到 [Releases](https://github.com/shenliuyu18/dafeiyu-pet/releases) 下载安装包（Windows 10/11 x64，双击安装，可自选目录，自动创建桌面 / 开始菜单快捷方式）：

| 版本 | 文件 | 体积 | 说明 |
| --- | --- | --- | --- |
| 完整版 | `dafeiyu-pet-<版本>-setup.exe` | 安装包约 114 MiB，安装后约 120 MiB | 全部原始素材，不重新编码、不降采样 |
| Lite 版 | `dafeiyu-pet-lite-<版本>-setup.exe` | 安装包约 44 MiB，安装后约 51 MiB | 压缩素材，功能与完整版一致 |

备用下载：[蓝奏云网盘](https://wwaql.lanzouu.com/b01i5xmkri)（密码 **5meo**）。

> **版本说明**：当前正式版为 **1.4.6**。仓库 `main` 分支为开发版 **1.4.8-beta.1**，新增 GPT娘v2（测试）与 dsh-meme 去重图库，安装包尚未发布。

### 完整版还是 Lite？

| | 完整版 | Lite 版 |
| --- | --- | --- |
| 动画 | 106 个 640×360 原始 VP9-alpha WebM | 480×270 VP9-alpha 压缩 |
| 表情立绘 | 1280×720 原始 WebP | 720px WebP（q84） |
| 档案馆表情 | 原始图片 | 480px WebP |
| 音效 / 字体 / 敏感词库 / 梗图 | 保留 | 保留 |
| 功能 | 完全一致 | 完全一致 |

完整版素材按原字节装进 store-only 的 `assets.zip`；Lite 版由 `tools/build-lite-assets.py` 单独生成到 `assets-lite/`，不会覆盖完整版素材。

### 安装位置

- 完整版：`%LOCALAPPDATA%\Programs\大肥鱼桌宠`
- Lite 版：`%LOCALAPPDATA%\Programs\大肥鱼桌宠 Lite`

两版使用独立安装目录、状态目录与单实例，可以同时安装、同时运行，互不影响。

### 安装提示

- **缺少 WebView2**：安装器会自动下载并安装（需要联网）。
- **SmartScreen 提示「未知发布者」**：安装包未做代码签名，点「更多信息」→「仍要运行」即可。
- **从 Electron 旧版（1.3.0 及更早）升级**：请先在「Windows 设置 → 应用」卸载旧版，再安装新版。1.4.0 起仓库与本机都不再包含 Electron 代码和运行时；直接覆盖安装不会清理旧文件（白占 200 MB+），也可能留下新旧混杂的快捷方式。

## 形象

设置 → 形象与音效里可以随时切换，切换后立即生效并记住选择。

| 形象 | 类型 | 内容 |
| --- | --- | --- |
| 大肥鱼v1 | 逐帧动画 | 106 个 640×360 VP9-alpha 透明 WebM（默认） |
| 大肥鱼v2 | 表情立绘 | 18 种姿势与表情 |
| 大肥鱼v3 | 表情立绘 | 32 种姿势与表情 |
| 大肥鱼v4 | 表情立绘 | 32 种姿势与表情 |
| 大肥鱼v5 | 表情立绘 | 16 种姿势与表情 |
| 大肥鱼v6 | 表情立绘 | 2 种姿势，其中「摸摸头」为动图 |
| GPT 娘 | 图集动画 | 73 帧透明图集，支持待机、奔跑、挥手、工作、等待、庆祝与 16 方向视线 |
| GPT娘v2（测试） | 表情卡 | 8 种表情：自然微笑、平静、惊讶、害羞、鼓腮、闭眼轻笑、认真、委屈 |

立绘统一归一化到 1280×720 画布，放大桌宠或在 150% DPI 屏幕上依然清晰；平时有轻微呼吸浮动，换姿势会弹一下。每个形象都有独立的「选个动作」列表。

GPT 娘和 GPT娘v2 使用专属语录与中性文案，不带白饭梗和表情包，账本显示为「用量账本」。

## 互动

| 操作 | 效果 |
| --- | --- |
| 拖拽 | 放到桌面任意位置，播放「被鼠标拖拽悬空」动画，光标变抓取样式 |
| 单击 | 摸一下：随机播点击回应动画，冒一句梗台词并配表情包，心情 +1 |
| 双击 | 喂一碗白饭（吃白饭 / 吃 Token / 大口吃零食） |
| 右键 | 菜单：喂白饭 / 选个动作… / 番茄钟 / 白饭账本 / 状态 / 睡觉 / 设置 / 躲起来 / 退出 |
| 鼠标靠近 | 朝光标方向轻轻倾身；偶尔好奇地游过来 |
| 放置不管 | 约 100 秒后开始打瞌睡；闲下来按设定间隔自己找乐子 |
| 选个动作 | 从 106 个动画里点播节目，点 ☆ 可置顶，每个形象最多 10 个 |
| 提示音 | 喂饭成功与番茄钟结束播放 `success`，取消专注播放 `error`（音量约 0.3） |
| 托盘通知 | 番茄钟结束、桌宠藏起来时的碎碎念；设置套餐额度后，本月用量跨过 80% / 100% 各提醒一次 |

闲时小节目按权重抽取：小动作（伸懒腰、照镜子、敲桌面）、玩耍（玩魔方、抽陀螺、小提琴、蓝鲸现世）、吃什么（早餐、西瓜、涮火锅）、时节（放烟花、堆雪人、中秋赏月、装点圣诞树），另有 25% 概率变成「碎碎念」。

## 设置

设置按 8 个页面分类，修改后立即生效并持久化。

| 页面 | 内容 |
| --- | --- |
| 形象与音效 | 8 个可选形象；音效：默认 / 鲸鱼音效 / 静音；点击表情播放顺序：伪随机队列 / 真随机 |
| 尺寸与字体 | 尺寸预设：小 70% / 默认 85% / 大 110% / 特大 140%，支持 5% 微调（0.6×–1.6×）；字体 80%–140%，同步缩放气泡、右键菜单和动作面板 |
| 待机与自动动作 | 待机位置：到处游 / 右下角 / 固定不动；全屏视频/游戏自动隐藏（可关闭）；自动动作间隔 5–300 秒，默认 40 秒 |
| 番茄钟 | 时长 5–120 分钟（15 / 25 / 45 / 60 预设，±5 分钟微调）；工作动画播放间隔 5–120 秒，默认 5 秒 |
| 白饭账本 | 开关；来源：Qoder credits / DeepSeek / Kimi / SiliconFlow / 豆包 / ChatGPT / Claude；API Key 配置 |
| 启动与更新 | 开机自启：关闭 / 普通 / 高优先级；休眠唤醒安全自检；一起启动的应用；自动更新开关；检查 GitHub 更新（直链下载 / 加速下载 / 自动安装） |
| 自定义互动文字 | 独立小窗编辑，最多 20 行 × 40 字；保存时用离线敏感词库检查；启用后替代默认台词 |
| 关于 | 版本号、操作说明、GitHub 仓库 / 更新日志 / 问题反馈链接 |

「选个动作」里的 ☆ 置顶会按形象分别保存。点击表情的「伪随机队列」会先把组合打乱后依次播放，播完重新洗牌，并避免新一轮首张与上一轮末张重复；「真随机」每次独立抽取。

## 白饭账本

右键菜单或托盘打开。选择 Qoder 来源时显示「今天吃掉 / 本月吃掉 / 本次会话」（单位 credits）；选择 AI 平台时显示该账户的「可用余额 / 赠送余额 / 充值余额」。

- **Qoder credits**：读取本机 Qoder 桌面端的会话转录（`~/.qoder-cn/projects/**/*.jsonl` 中每条 assistant 消息的 `message.usage.credits`，含子代理），每 5 分钟自动刷新，托盘菜单同步显示本月合计。
- **API 平台**：DeepSeek、Kimi、SiliconFlow、豆包、ChatGPT、Claude。豆包填 `AK:SK`；OpenAI / Claude 需要 Admin Key；也可以使用环境变量 `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `SILICONFLOW_API_KEY`。
- **Key 安全**：API Key 用 Windows DPAPI 加密后保存在本机状态文件里，只有当前 Windows 账户能解密；查询时只发送给对应平台的官方接口。请勿在共用电脑上填写，风险自负。

想显示套餐百分比，在状态文件里加一行月额度，账本会多出一根进度条（Qoder 来源）：

```jsonc
// %APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json
{ "satiety": 80, "mood": 90, "planQuota": 3000 }
```

**白饭梗小词典**：白饭 = 偷吃你的 Token；剩饭 = 缓存；外包摸鱼 = 调别的 Agent 干活；到点下班吃饭 = 推理完成。

## 表情与动画

**表情库**：经典梗图 20 张 + 蓝色大肥鱼档案馆精选 59 张 + dsh-meme 去重图库 64 张，共 143 张，每张都配有一句贴合画面的文案。导入新图包时已清理现有重复素材（7 张经典梗图 + 1 张档案馆重复图），新图包中与现有重复的 9 张未重复导入。

**动画状态机**：22 个核心动画随状态切换（待机呼吸 / 漂浮踏步 / 螃蟹走路 / 东张西望 / 点击回应 ×5 / 吃白饭 / 吃 Token / 大口吃零食 / 小憩沉眠 / 垂头叹气 / 雀跃庆祝 / 写代码 / 余额数金），外加 84 个闲时小节目。带文字的动画（`是啊，吃什么` / `深度思考碎碎念`）不参与镜像，避免文字被左右翻转。

**饱食度**随时间缓慢下降，低于 32 时她会变蔫、游得更慢、饭碗变空；喂饭回满并提升心情。

**番茄钟**：开始专注后她会游到屏幕角落挂倒计时牌安静陪你，期间不执行其他自动动作，每个工作动作完整播完后休息设定间隔再播下一个；右键「选个动作」等手动操作仍然可用。时间到会游回屏幕中央蹦跶提醒休息。倒计时牌贴到屏幕下缘时会自动翻到鱼身上，不会被任务栏挡住。

## 数据存放

`%APPDATA%\dafeiyu-desktop-pet\dafeiyu-state.json`（Lite 版为 `%APPDATA%\dafeiyu-desktop-pet-lite`）保存饱食度、心情、位置、尺寸 / 待机位置 / 番茄钟时长与工作动画间隔 / 白饭账本开关 / 开机自启动 / 一起启动的应用 / 自定义文字，以及可选的套餐额度与 API Key（DPAPI 加密）。

## 开发运行

前置：Node.js、Go 1.25+、Wails CLI v2.16+、NSIS 3.x、Windows 自带或已安装的 WebView2。

项目没有 npm 运行时依赖，构建脚本只使用 Node 内置模块，并会自动把本机用户目录里的 Go / Wails / NSIS 工具链加入 PATH。

```bash
npm run build              # 完整版 → dist/dafeiyu-pet-<版本>-setup.exe
npm run build:lite         # Lite 版（自动生成压缩素材）→ dist/dafeiyu-pet-lite-<版本>-setup.exe
npm run dist-install       # 构建完整版、静默安装到本机并启动
npm run dist-install:lite  # 构建 Lite 版、静默安装到本机并启动
```

日常调试也可以直接进入 `wails/` 运行 `wails dev`。启动后她会出现在屏幕右下角，托盘图标可以随时叫出或藏起。

## 打包

- 前端由 `tools/wails-prepare.js` 从 `renderer/` + `assets/`（完整版）或 `assets-lite/`（Lite 版）生成：HTML / JS / CSS 改写相对路径，素材装进 `assets.zip`，Wails 通过虚拟文件系统读取并支持视频 Range 请求。完整版保持 store-only 原字节。
- `tools/wails-build.js` 负责同步版本号、调用 Wails 构建 NSIS 安装包、拷贝到 `dist/`，并支持 `--lite` / `--install`。
- 安装包使用 `-webview2 download`：检测到缺少 WebView2 时会下载并安装。安装向导为简体中文（NSIS `SimpChinese`）。
- 发布资产命名为 `dafeiyu-pet-<正式版本>-setup.exe` / `dafeiyu-pet-lite-<正式版本>-setup.exe`，更新检查会按 `setup.exe` 后缀和 lite 标识选择对应版本。
- **版本号约定**：开发期使用测试版号（如 `1.5.0-beta.1`），发布到 GitHub 时改成正式版号（如 `1.5.0`），并同步 CHANGELOG / README / 安装包名。Wails 的 Windows 文件版本使用数字段（如 `1.4.6.0`），应用内关于页与更新检查使用完整版本号。

## 目录结构

```
wails/                    Wails v2 + Go 后端（唯一实现）
  main.go                 启动、绑定、窗口、透明、焦点、更新
  win32.go                Win32 窗口样式、动态 Region、命中轮询、DPAPI
  fullscreen_windows.go   全屏前台检测与自动避让
  state.go                状态持久化、设置、DPAPI Key、自动启动
  ledger.go               Qoder credits + 6 个 API 平台账单
  actions.go              右键菜单动作分发（喂饭 / 番茄钟 / 睡觉 / 状态 / 账本）
  words.go                离线敏感词 Trie 过滤
  update.go               GitHub 更新检查 / 下载 / 静默安装
  power.go                休眠唤醒自检
  tray_windows.go         原生托盘与气泡通知
  assets.go               assets.zip 虚拟文件系统（支持 Range）
  frontend/api.js         window.pet → Wails 绑定/事件 + 内联 Key/文字编辑
  build/                  程序图标、版本信息、NSIS 安装向导
tools/
  wails-prepare.js        从 renderer/ + assets/ 生成 Wails 前端
  wails-build.js          一键构建 NSIS、拷贝到 dist、可 --install
  build-lite-assets.py    Lite 压缩素材流水线（只写 assets-lite/）
  make-char-assets.py     立绘裁 alpha / 归一化 / WebP 流水线
  build-lexicon.py        离线敏感词库生成
  pipeline/               自制动作素材流水线（去水印 → 抠绿 → 归一化 → 编码）
  lanzou-upload/          蓝奏云半自动上传脚本
renderer/                 两版共用的前端 DOM/CSS/JS
  index.html              透明视频画布 + 气泡/菜单/账本/设置结构
  style.css               漂浮 / 倾身 / 蹦跳 / 拖拽挣扎等反馈动画 + 上首软糖体
  pet.js                  移动引擎、倾身跟随、动画状态机、气泡、菜单、账本
  archive-memes.js        档案馆精选表情清单与配文
  dsh-memes.js            dsh-meme 图库清单与配文
assets/
  anims/*.webm            106 个上游原始 VP9-alpha 透明动画（大肥鱼v1）
  anims/index.js          动画清单（CSP 不允许 fetch，用 <script> 注入）
  fish2~fish6/*.webp      五套表情立绘（1280×720）
  gpt/spritesheet.webp    GPT 娘透明图集（1536×2288，73 帧）
  gpt2/*.webp             GPT娘v2（测试）表情卡（8 张，CC BY-NC-SA 4.0）
  memes/*.webp            经典梗图表情包（无损 WebP）
  memes/archive/*         档案馆精选 + dsh-meme 去重图库（123 张）
  sounds/*.wav|mp3        默认音效与鲸鱼音效
  fonts/上首软糖体.woff2   完整气泡字体
  sensitive/              离线敏感词库与来源说明
  pic/                    光标与托盘通知图标
  logo.png                图标源图
web/                      官网静态页（部署到 GitHub Pages）
docs/                     动作生成提示词库 + 通知图标提示词
```

## 实现要点

- **透明窗口与点击穿透**：`WindowIsTranslucent: true` + `BackdropType: None` 让 WebView2 真正透出桌面；`WS_EX_NOACTIVATE` 默认不抢焦点，打开设置时移除并 `SetForegroundWindow`，关闭后恢复。全屏窗口用动态 Region（`SetWindowRgn`）保留桌宠和完整气泡 / 梗图 / 账本 / 倒计时牌区域；菜单、设置、拖拽时恢复整窗。面板/焦点调用串行化，显示面板前先扩 Region，关闭后延迟 260 ms 再缩 Region。前端 JS/CSS 带版本号，避免 WebView2 使用旧缓存。
- **素材零改动（完整版）**：`assets.zip` 以 store-only 写入，视频、立绘、梗图、字体、音效字节与源文件一致；Wails 通过 `zipFS` 提供虚拟文件系统，视频 Range 请求可用。Lite 版是唯一例外，压缩结果单独生成到 `assets-lite/`。
- **前端结构**：`renderer/` 是唯一的界面源码；`wails/frontend/api.js` 把它映射到 Wails 绑定/事件，并在主窗口内提供可聚焦的 API Key / 自定义文字编辑卡片。
- **窗口**：一块铺满工作区的透明、置顶、不抢焦点的窗口，角色在窗口里用 CSS `transform` 游动（GPU 合成）。早期版本用「小窗口 + setPosition 跟随」，在 150% DPI 下会累积 1 px 尺寸漂移，因此改成整屏画布方案。
- **角色素材**：直接使用 VP9-alpha 透明 WebM，用 `<video>` 播放（Chromium 原生支持 alpha 通道）。素材画布 640×360，角色居中约占 226×282，四周透明。CSP 必须放行 `media-src` 与 `font-src`，否则视频和字体会被 `default-src 'none'` 拦掉。
- **动画状态机**：`applyBase()` 按「拖拽 > 睡觉 > 番茄钟 > 饿了 > 移动 / 待机」优先级选择循环动画；点击、喂食、账本等一次性动作走 `playOnce()`，播完自动回到基础态并带超时兜底。
- **闲时小节目**：分类权重参考 dsh-pet 的 `animationWeights` / `categories`（小动作 20 / 玩耍 20 / 吃什么 16 / 时节 14 / 文字 10），另有 25% 概率改成「碎碎念」。账本按套餐已用百分比分 6 档播放对应的「余额-*」动画。
- **倾身跟随**：视频是位图序列，瞳孔无法单独运动，改为整个身子朝光标方向最多偏移 5 px（拖拽时停用）。
- **尺寸缩放**：角色包在 `#scale` 里整体 CSS `scale`，命中框、移动边界、Wails 穿透判定按比例换算，0.6×–1.6× 任意档位拖拽/点击都精确。

## 加自己的动作

1. 照着 [docs/桌面宠物10秒动作提示词.md](docs/桌面宠物10秒动作提示词.md) 的模板（106 个动作的完整提示词库），让 AI 生成一段 10 秒、正面、纯色背景的角色动画。
2. 一条命令完成抠绿 + 归一化 640×360 / 24 fps + 编码 VP9-alpha + 刷新动画清单：

   ```bash
   tools/pipeline/make-anim.sh 写周报.mp4 写周报
   ```

3. 把动作名加进 [renderer/pet.js](renderer/pet.js) 的对应动画池（或 `ACTIONS` 的某个分类），重启桌宠即可。带文字的动作记得同时加进 `NO_MIRROR`，避免被左右翻转。

`tools/pipeline/` 里的其余脚本是 dsh-pet 原版生产线，按它们自己的工作区约定写死（`step01/` → `step02/` 目录、自带 ffmpeg、依赖 numpy），留作参考；日常用 `make-anim.sh` 就够了。

## 常见问题

**打不开或只显示白屏？** 先确认系统已安装 Microsoft Edge WebView2 Runtime。安装包会自动下载安装；也可以从微软官网手动安装后重启桌宠。

**会弹「未知发布者」吗？** 会。安装包没有代码签名，SmartScreen 可能拦截；点「更多信息」→「仍要运行」。

**完整版和 Lite 能同时装吗？** 能。两版安装目录、状态目录、单实例标识都相互独立，可以同时运行。

**怎么彻底卸载？** 在「Windows 设置 → 应用」卸载后，如需清除设置和 Key，再删除 `%APPDATA%\dafeiyu-desktop-pet`（Lite 版为 `%APPDATA%\dafeiyu-desktop-pet-lite`）。

**全屏看视频时她还在？** 设置 → 待机与自动动作 → 全屏视频 / 游戏，确认已开启。普通窗口和最大化窗口不会触发隐藏。

**自定义文字保存不了？** 保存时会用离线敏感词库检查，含敏感词的行会被拦截；每行最多 40 字，最多 20 行。

**检查更新失败？** GitHub 访问不稳定时可以稍后重试，或直接从 Releases 手动下载安装包覆盖安装，设置会保留。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

- v1.0.0（2026-10-15）：首个正式版。
- v1.2.0：番茄钟自定义时长、「选个动作」、默认尺寸 85%。
- v1.3.0：多形象（大肥鱼v1–v6 + GPT 娘）、多平台 AI 账单、二级菜单设置、自动更新、音效包、字体大小、固定位置、自启动。
- v1.4.0：恢复上游最高画质素材、自定义互动文字与离线敏感词过滤、Wails + WebView2 迁移、完整版 / Lite 双版本。
- v1.4.1–v1.4.4：双版本闪现、蓝奏云入口、右键菜单 Region 修复、全屏自动避让、高优先级自启与唤醒自检。
- v1.4.5：档案馆精选表情与 GPT 娘 73 帧图集动画。
- v1.4.6：点击表情播放顺序可选。
- v1.4.7-beta.1：GPT娘v2（测试）。
- v1.4.8-beta.1：dsh-meme 去重图库与重复表情清理。

## 素材来源与许可

角色动画、表情包、字体、光标与通知图标来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT，见 [THIRD-PARTY-dsh-pet-LICENSE.txt](THIRD-PARTY-dsh-pet-LICENSE.txt)）——一个跑在 DeepSeek Harness 里的桌宠插件，也是这套「蓝发小女仆 + 鲸尾」形象与 106 个动作动画的出处。本程序取用了它的全部动画、全部表情包与图标字体，实现完全独立；随机小节目的分类权重、余额分档规则、`NO_MIRROR` 约定都参考了它的配置文件，`tools/pipeline/` 与 `docs/` 直接来自其素材生产线。

成功 / 失败提示音来自 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)（MIT），它的状态划分（idle / poke / head_pat / working / waiting / success / error / dragging / eat_token）也参考了本程序的动画状态机设计。

「大肥鱼v2–v5」的表情立绘来自 [louke6572/dsh-whale-widget-plus](https://github.com/louke6572/dsh-whale-widget-plus)（MIT，见 [THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt](THIRD-PARTY-dsh-whale-widget-plus-LICENSE.txt)），取用了四套表情包（共 98 张姿势与表情图）；「鲸鱼音效」也来自该项目。

「大肥鱼v6」的形象来自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT，见 [THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt](THIRD-PARTY-DeepSeek-Balance-Whale-Widget-LICENSE.txt)），取用了立绘与「摸摸头」动图。

「GPT 娘」的语录来自 [T7moris/GPT-Niang](https://github.com/T7moris/GPT-Niang)（MIT，见 [THIRD-PARTY-GPT-Niang-LICENSE.txt](THIRD-PARTY-GPT-Niang-LICENSE.txt)）；73 帧透明图集来自 [weit0529/gpt-pet](https://github.com/weit0529/gpt-pet)（MIT，见 [THIRD-PARTY-gpt-pet-LICENSE.txt](THIRD-PARTY-gpt-pet-LICENSE.txt)）。

「GPT娘v2（测试）」表情卡来自 [lmy414/ai-chan-sheets](https://github.com/lmy414/ai-chan-sheets)，角色设定与原始立绘由 ZipZipPipe 创作；按 CC BY-NC-SA 4.0 非商业使用并保留出处，详见 [THIRD-PARTY-ai-chan-sheets-NOTICE.txt](THIRD-PARTY-ai-chan-sheets-NOTICE.txt)。

「档案馆精选表情」来自 [EDMOK/blue-fish-archive](https://github.com/EDMOK/blue-fish-archive) / [fisharchive.cc](https://fisharchive.cc/)。角色二次设计依 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 授权，单张表情权利归各自创作者；本项目仅非商业使用并保留出处，详见 [THIRD-PARTY-blue-fish-archive-NOTICE.txt](THIRD-PARTY-blue-fish-archive-NOTICE.txt)。

「dsh-meme 大肥鱼图库」来自 [yyh-001/dsh-meme](https://github.com/yyh-001/dsh-meme) 与 [yyh-001/dsh-meme-packs](https://github.com/yyh-001/dsh-meme-packs)。dafeiyu-001 / dafeiyu-learned 为 personal 图库，商业使用或再分发前需取得权利人许可；pack-mvc2p5cv（GPT生大肥鱼，Anterique0 投稿）为 CC BY-NC-SA 4.0。详见 [THIRD-PARTY-dsh-meme-NOTICE.txt](THIRD-PARTY-dsh-meme-NOTICE.txt)。

自定义互动文字的敏感词库来自 [Konsheng/Sensitive-lexicon](https://github.com/Konsheng/Sensitive-lexicon)（MIT，见 [THIRD-PARTY-Sensitive-lexicon-LICENSE.txt](THIRD-PARTY-Sensitive-lexicon-LICENSE.txt)），取用政治 / 色情 / 暴力 / 涉枪涉爆 / 广告等分类，在本机离线匹配；词库原文与选用清单见 `assets/sensitive/SOURCES.txt`。

## 关于旧版

1.4.0 起不再提供 Electron 版本：仓库中没有 Electron 主进程、预加载脚本、旧编辑窗口或 electron / electron-builder 依赖，也没有回退构建。若本机还装有 1.3.0 或更早的 Electron 版，请先在「Windows 设置 → 应用」中卸载，再安装新版。
