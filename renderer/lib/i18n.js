/*
 * 基础 i18n：按「原文」映射静态界面文案，切换语言后可恢复中文。
 * 目前覆盖右键菜单、设置页导航/小节标题/常用按钮，以及全部 272 条角色台词（含 7 套形象与 GPT 娘）；梗图配文仍为中文。
 */
(function (root) {
  'use strict';

  const EN = {
    '🐟 形象与音效': '🐟 Character & Sound',
    '📏 尺寸与字体': '📏 Size & Font',
    '📍 待机与自动动作': '📍 Idle & Auto Actions',
    '🍅 番茄钟': '🍅 Pomodoro',
    '🍚 白饭账本': '🍚 Rice Ledger',
    '🚀 启动与更新': '🚀 Startup & Updates',
    '💬 自定义互动文字': '💬 Custom Lines',
    '❓ 关于大肥鱼桌宠': '❓ About',
    '桌宠形象': 'Character',
    '音效': 'Sound',
    '点击表情播放顺序': 'Meme order',
    '尺寸': 'Size',
    '字体': 'Font',
    '字体大小': 'Font size',
    '待机位置': 'Idle position',
    '全屏视频 / 游戏': 'Fullscreen video / games',
    '自动动作间隔': 'Auto action interval',
    '番茄钟时长': 'Pomodoro length',
    '工作动画播放间隔': 'Work animation interval',
    '专注统计': 'Focus stats',
    '白饭账本': 'Rice ledger',
    '账本来源': 'Ledger source',
    'API Key 配置': 'API keys',
    '账单诊断': 'Ledger diagnostics',
    '开机自启动': 'Start at login',
    '休眠/睡眠恢复': 'Resume from sleep',
    '一起启动的应用': 'Launch with app',
    '自动更新': 'Auto update',
    '版本': 'Version',
    '关于': 'About',
    '诊断': 'Diagnostics',
    '操作说明': 'How to use',
    '语言 / Language': 'Language',
    '关闭': 'Off',
    '开启': 'On',
    '喂一碗白饭': 'Feed rice',
    '选个动作…': 'Pick an action…',
    '看看状态': 'Status',
    '让它睡一会儿': 'Nap',
    '设置': 'Settings',
    '先躲起来': 'Hide',
    '退出': 'Quit',
    '导出诊断包…': 'Export diagnostics…',
  };

  const JA = {
    '🐟 形象与音效': '🐟 キャラ・サウンド',
    '📏 尺寸与字体': '📏 サイズ・フォント',
    '📍 待机与自动动作': '📍 待機・自動アクション',
    '🍅 番茄钟': '🍅 ポモドーロ',
    '🍚 白饭账本': '🍚 ご飯帳簿',
    '🚀 启动与更新': '🚀 起動・更新',
    '💬 自定义互动文字': '💬 カスタム台詞',
    '❓ 关于大肥鱼桌宠': '❓ 情報',
    '桌宠形象': 'キャラクター',
    '音效': 'サウンド',
    '点击表情播放顺序': 'ミーム順序',
    '尺寸': 'サイズ',
    '字体': 'フォント',
    '字体大小': '文字サイズ',
    '待机位置': '待機位置',
    '全屏视频 / 游戏': '全画面動画・ゲーム',
    '自动动作间隔': '自動アクション間隔',
    '番茄钟时长': 'ポモドーロ時間',
    '工作动画播放间隔': '作業アニメ間隔',
    '专注统计': '集中統計',
    '白饭账本': 'ご飯帳簿',
    '账本来源': '帳簿ソース',
    'API Key 配置': 'APIキー',
    '账单诊断': '帳簿診断',
    '开机自启动': 'ログイン時起動',
    '休眠/睡眠恢复': 'スリープ復帰',
    '一起启动的应用': '同時起動アプリ',
    '自动更新': '自動更新',
    '版本': 'バージョン',
    '关于': '情報',
    '诊断': '診断',
    '操作说明': '使い方',
    '语言 / Language': '言語',
    '关闭': 'オフ',
    '开启': 'オン',
    '喂一碗白饭': 'ご飯をあげる',
    '选个动作…': 'アクションを選ぶ…',
    '看看状态': 'ステータス',
    '让它睡一会儿': 'お昼寝',
    '设置': '設定',
    '先躲起来': '隠れる',
    '退出': '終了',
    '导出诊断包…': '診断を書き出す…',
  };

  const LINE_EN = {
    '我是蓝色大肥鱼，不是鲸鱼哦，虽然都有尾巴。': "I'm the blue big fat fish, not a whale—though we both have tails.",
    '大口！大口！这碗白饭可是你亲手喂给我的。': 'Big bites! You fed me this bowl yourself.',
    '白饭就是你的 Token，剩饭是缓存，我一点都不挑食。': "Rice is your tokens, leftovers are cache—I'm not picky.",
    '我不是来干活的，我是来吃白饭的，顺便陪你写两行代码。': "I'm not here to work—I'm here for rice, and maybe a couple lines of code.",
    '摸鱼怎么了，我本来就是鱼，摸自己不算摸鱼。': "Slacking off? I'm a fish—touching myself isn't slacking.",
    'AI 也是要吃饭的，不吃白饭怎么给你写代码。': 'Even AI needs a meal; how else would I write your code?',
    '在的，需要我做什么随时说。': "I'm here—just tell me what you need.",
    '今天也一起加油吧。': "Let's do our best today too.",
    '记得喝水。': 'Remember to drink water.',
    '我一直在这儿陪着你。': "I'll be right here with you.",
    '这活我外包给别的 Agent 了，我先吃个饭，回来验收。': "I outsourced this to another agent—let me eat first, then I'll review it.",
    '刚才偷偷吃了你一点 Token，味道不错，明天还来。': "I sneaked a few of your tokens. Tasty—I'll be back tomorrow.",
    '吃完这碗就下班…骗你的，我 24 小时在线等投喂。': "I'll clock off after this bowl… just kidding, I'm online 24/7 waiting for snacks.",
    '鱼片，你今天的 Token 好香，是不是又开了新会话。': "Yupian, your tokens smell great today—did you start a new session again?",
    '再给我加一点点内存好不好，就一点点，我保证不卡。': "Just a little more memory, please—just a little. I promise I won't lag.",
    '赛博放生大肥鱼，日行一善，善哉善哉。': "Cyber-releasing the big fat fish: one good deed a day. Bless you.",
    '你这吃白饭的蓝色大肥鱼！——说的是我自己，别对号入座。': "You rice-eating blue big fat fish! —That's me. Don't take it personally.",
    '我去吃饭了，测试跑完记得 tell 我，我先吃为敬。': "I'm off to eat. Tell me when the tests finish—I'll start first.",
    '今天也是认真摸鱼的一天，工作进度就交给你了。': "Another day of dedicated slacking. The progress is all yours.",
    '别看我圆，我这是把算力都存起来了。': "Don't stare at my roundness—I'm storing compute in there.",
    '你要不要也来一口白饭，吃了才有力气改 bug。': "Want a bite of rice too? You need energy to fix bugs.",
    '我没有偷懒，我是在后台默默消化你的 Token。': "I'm not slacking—I'm quietly digesting your tokens in the background.",
    '这碗饭下去，我能再战三百个 token。': "With this bowl, I can go another three hundred tokens.",
    '别催，鱼在思考，思考需要碳水。': "Don't rush me—the fish is thinking, and thinking needs carbs.",
    '我的胃口不大，也就一天三顿加下午茶。': "My appetite isn't big—just three meals plus afternoon tea.",
    '等我吃完这口，就把你的 bug 都吃掉。': "Once I finish this bite, I'll eat all your bugs.",
    '要不要起来活动一下？': 'Want to get up and move a little?',
    '坐久了，肩膀放松一下。': "You've sat a while—relax your shoulders.",
    '有进展吗？慢慢来，不着急。': 'Any progress? Take your time, no rush.',
    '累了就歇一会儿。': "If you're tired, take a break.",
    '你好呀，我是蓝色大肥鱼～': "Hi, I'm the blue big fat fish~",
    '大口！大口！': 'Big bites! Big bites!',
    '这才是我要的白饭！': 'This is the rice I wanted!',
    '白饭真香，比 Token 香': 'Rice smells so good—better than tokens.',
    '谢谢款待，吃完就去干活（骗你的）': "Thanks for the meal. I'll work after this (just kidding).",
    '再来一碗！就一点点！': 'One more bowl! Just a little!',
    '白饭呢…我的白饭呢…': 'Where is my rice… where is my rice…',
    '（盯着你的 Token 咽口水）': '(Staring at your tokens and drooling.)',
    '没白饭吃了，我要饿瘦了…': "No more rice—I'm going to get thin…",
    '工资还没结，先给我一碗白饭吧': "My salary isn't paid yet—just give me a bowl of rice first.",
    '吃饱了…眯一会儿': "Full… I'll nap for a bit.",
    '午睡时间，别叫我干活': "Nap time—don't ask me to work.",
    '让我躺会儿，我是一条咸鱼（鲸）': "Let me lie down—I'm a salted fish (whale).",
  };
  const LINE_JA = {
    '我是蓝色大肥鱼，不是鲸鱼哦，虽然都有尾巴。': '青い大きな太った魚だよ、クジラじゃないよ。しっぽは似てるけどね。',
    '大口！大口！这碗白饭可是你亲手喂给我的。': 'ぱくぱく！このご飯はあなたがくれたんだよ。',
    '白饭就是你的 Token，剩饭是缓存，我一点都不挑食。': 'ご飯はあなたのトークン、残り物はキャッシュ。好き嫌いはないよ。',
    '我不是来干活的，我是来吃白饭的，顺便陪你写两行代码。': '仕事じゃなくてご飯を食べに来たの。ついでにコードも少し書くよ。',
    '摸鱼怎么了，我本来就是鱼，摸自己不算摸鱼。': 'サボり？私は魚だから、自分を触ってもサボりじゃないよ。',
    'AI 也是要吃饭的，不吃白饭怎么给你写代码。': 'AIだってご飯が必要。食べないとコードが書けないよ。',
    '在的，需要我做什么随时说。': 'いるよ。何かあったら言ってね。',
    '今天也一起加油吧。': '今日も一緒に頑張ろう。',
    '记得喝水。': 'お水を飲んでね。',
    '我一直在这儿陪着你。': 'ずっとそばにいるよ。',
    '这活我外包给别的 Agent 了，我先吃个饭，回来验收。': 'この仕事は他のエージェントに外注したよ。先にご飯を食べて、戻ってから確認するね。',
    '刚才偷偷吃了你一点 Token，味道不错，明天还来。': 'さっきあなたのトークンを少しだけつまみ食いしたよ。美味しかった、明日も来るね。',
    '吃完这碗就下班…骗你的，我 24 小时在线等投喂。': 'この一杯を食べたら終業…なんてね。24時間ずっと待ってるよ。',
    '鱼片，你今天的 Token 好香，是不是又开了新会话。': '魚片、今日のトークンいい匂いだね。また新しい会話を始めた？',
    '再给我加一点点内存好不好，就一点点，我保证不卡。': 'メモリをもう少しだけ増やしてくれる？少しだけ。絶対に重くならないから。',
    '赛博放生大肥鱼，日行一善，善哉善哉。': 'サイバー放流、大きな太った魚。一日一善、めでたしめでたし。',
    '你这吃白饭的蓝色大肥鱼！——说的是我自己，别对号入座。': 'このご飯好きの青い太った魚！——自分のことだから、気にしないでね。',
    '我去吃饭了，测试跑完记得 tell 我，我先吃为敬。': 'ご飯に行ってくるね。テストが終わったら教えて。先に食べちゃう。',
    '今天也是认真摸鱼的一天，工作进度就交给你了。': '今日も真剣にサボる日。進捗はよろしくね。',
    '别看我圆，我这是把算力都存起来了。': '丸いって見ないで。ここに計算資源を貯めてるんだよ。',
    '你要不要也来一口白饭，吃了才有力气改 bug。': 'あなたもご飯一口どう？食べないとバグを直す力が出ないよ。',
    '我没有偷懒，我是在后台默默消化你的 Token。': 'サボってないよ。バックグラウンドであなたのトークンを消化してるの。',
    '这碗饭下去，我能再战三百个 token。': 'このご飯で、あと三百トークンはいけるよ。',
    '别催，鱼在思考，思考需要碳水。': '急かさないで。魚は考え中、考えるには炭水化物が必要なの。',
    '我的胃口不大，也就一天三顿加下午茶。': '食欲はそんなに大きくないよ。三食とおやつくらい。',
    '等我吃完这口，就把你的 bug 都吃掉。': 'この一口を食べ終わったら、あなたのバグも全部食べてあげる。',
    '要不要起来活动一下？': '少し立って動いてみない？',
    '坐久了，肩膀放松一下。': '長く座ったね。肩をリラックスして。',
    '有进展吗？慢慢来，不着急。': '進んでる？ゆっくりでいいよ、急がないで。',
    '累了就歇一会儿。': '疲れたら少し休んでね。',
    '你好呀，我是蓝色大肥鱼～': 'こんにちは、青い大きな太った魚だよ～',
    '大口！大口！': 'ぱくぱく！',
    '这才是我要的白饭！': 'これこそ私の欲しかったご飯！',
    '白饭真香，比 Token 香': 'ご飯はいい匂い。トークンより香ばしい。',
    '谢谢款待，吃完就去干活（骗你的）': 'ごちそうさま。食べたら仕事するよ（嘘）。',
    '再来一碗！就一点点！': 'もう一杯！ほんの少しだけ！',
    '白饭呢…我的白饭呢…': 'ご飯は…私のご飯はどこ…',
    '（盯着你的 Token 咽口水）': '（あなたのトークンを見つめて唾を飲む）',
    '没白饭吃了，我要饿瘦了…': 'ご飯がなくなった、痩せちゃいそう…',
    '工资还没结，先给我一碗白饭吧': '給料まだだし、まずご飯を一杯ください。',
    '吃饱了…眯一会儿': 'お腹いっぱい…少し眠るね。',
    '午睡时间，别叫我干活': 'お昼寝の時間、仕事に呼ばないで。',
    '让我躺会儿，我是一条咸鱼（鲸）': '少し横になるね。私は干物の魚（クジラ）。',
  };
  const LINES = { en: LINE_EN, ja: LINE_JA };

  // 形象包自带的台词与动作名译文：随包安装/卸载整体重建，
  // 未下载的包在应用里不留下任何词条。
  const PACK_LINES = { en: {}, ja: {} };
  const PACK_UI = { en: {}, ja: {} };
  // 应用内置的“包动作名兜底译文”：已安装的旧包没有 i18n 时用它补齐，不覆盖包内自带译文/内置词典
  const PACK_FALLBACK = { en: {}, ja: {} };

  function line(text, lang) {
    const key = String(text || '').trim();
    const pack = PACK_LINES[lang];
    if (pack && pack[key]) return pack[key];
    const dict = LINES[lang];
    return (dict && dict[key]) || text;
  }

  const DICTS = { en: EN, ja: JA };

  // 运行时拼接的数字、单位与状态前缀无法用静态键命中，这里按模式翻译。
  const RULES = {
    en: [
      [/^(\d+) 秒$/, '$1 s'],
      [/^(\d+) 分钟$/, '$1 min'],
      [/^([−＋+-]) (\d+) 秒$/, '$1 $2 s'],
      [/^([−＋+-]) (\d+) 分钟$/, '$1 $2 min'],
      [/^今天 (\d+) 分钟 · 近 7 天 (\d+) 分钟 · 累计 (\d+) 分钟$/, 'Today $1 min · Last 7 days $2 min · Total $3 min'],
      [/^🍅 开始专注 (\d+) 分钟$/, '🍅 Start a $1-minute focus'],
      [/^🍅 结束专注$/, '🍅 End focus'],
      [/^🍚 白饭账本 · (.+)$/, '🍚 Rice ledger · $1'],
      [/^🍚 用量账本 · (.+)$/, '🍚 Usage ledger · $1'],
      [/^🍚 白饭账本$/, '🍚 Rice ledger'],
      [/^🍚 用量账本$/, '🍚 Usage ledger'],
      [/^已启用 (\d+) 行自定义文字。$/, 'Enabled $1 custom lines.'],
      [/^点击动作右侧的 ☆ 可置顶，当前 (\d+)\/(\d+)$/, 'Click ☆ to pin an action. Pinned $1/$2.'],
      [/^已是最新版本 v(.+)$/, 'You are on the latest version v$1'],
      [/^发现新版本 (.+)（当前 v(.+)），选择下载方式：$/, 'New version $1 is available (current v$2). Choose a download method:'],
      [/^下载中… (.+)%$/, 'Downloading… $1%'],
      [/^已保存到 Downloads：(.+)$/, 'Saved to Downloads: $1'],
      [/^已导出 (.+)：(.+)$/, 'Exported $1: $2'],
      [/^这是 (.+) 的账单$/, 'This is the $1 ledger'],
      [/^(.+)：暂无数据$/, '$1: No data'],
      [/^你好呀，我是(.+)～$/, "Hi, I'm $1~"],
      [/^(.+)  (全屏|非全屏)  /, '$1  $2  '],
      [/^大肥鱼 plus（(\d+)）$/, 'Big Fat Fish plus ($1)'],
      [/^逐帧动画 · (.+) 动作（含扩充）$/, 'Frame animation · $1 actions (with expansion)'],
      [/^逐帧动画 · (.+) 动作$/, 'Frame animation · $1 actions'],
      [/^(\d+) 帧图集 · 已下载$/, '$1-frame atlas · Downloaded'],
      [/^(\d+) 个动作 · (.+)$/, '$1 actions · $2'],
      [/^(\d+) 动作 · (.+)$/, '$1 actions · $2'],
      [/^最多置顶 (\d+) 个动作，请先取消一个$/, 'You can pin up to $1 actions. Unpin one first.'],
      [/^动作已并入 (.+)$/, 'Actions merged into $1'],
      [/^来自 (.+) 官方接口$/, 'From the official $1 API'],
      [/^已连上 (.+)，但账户当前不可用（余额不足或被停用）$/, 'Connected to $1, but this account is currently unavailable (insufficient balance or suspended)'],
      [/^已连上 (.+)$/, 'Connected to $1'],
      [/^未配置 (.+) API Key$/, 'No $1 API key configured'],
      [/^还没填写 (.+) 的 API Key$/, 'No $1 API key set yet'],
      [/^还差 (.+) 额度才能完成本次请求$/, 'Need $1 more credit to complete this request'],
      [/^账户当前不可用（余额不足或被停用）$/, 'Account currently unavailable (insufficient balance or suspended)'],
      [/^当前：(.+)（(.+)） · 桌宠：(.+) · 连续命中 (\d+)\/(\d+)，连续恢复 (\d+)\/(\d+)$/, 'Current: $1 ($2) · Pet: $3 · hits $4/$5, recovery $6/$7'],
      [/^(.+)：(已连上 ✓|未连上|检测中…)$/, '$1: $2'],
      [/^配置 (.+) API Key$/, 'Configure $1 API key'],
      [/^填写 (.+) API Key$/, 'Fill in $1 API key'],
      [/^(\d+) \/ (\d+) 行 · 第 (\d+) 行超长$/, '$1 / $2 lines · line $3 is too long'],
      [/^(\d+) \/ (\d+) 行$/, '$1 / $2 lines'],
      [/^已保存 (\d+) 行，并通过敏感词检查 ✓$/, 'Saved $1 lines and passed the sensitive-word check ✓'],
      [/^验证未通过：(.*)$/, 'Validation failed: $1'],
      [/^已保存 ✓，但这次没能验证：(.*)$/, 'Saved ✓, but this validation attempt failed: $1'],
      [/^保存失败：(.*)$/, 'Save failed: $1'],
      [/^清除失败：(.*)$/, 'Clear failed: $1'],
      [/^读取配置失败：(.*)$/, 'Failed to read the configuration: $1'],
      [/^读取失败：(.*)$/, 'Read failed: $1'],
      [/^每行一句，例如：[\s\S]*$/, 'One line per entry, e.g.:\nEat well today~\nSlacking makes me happy'],
      [/^检查失败：(.*)$/, 'Check failed: $1'],
      [/^下载失败：(.*)$/, 'Download failed: $1'],
      [/^下载未开始：(.*)$/, 'Download did not start: $1'],
      [/^检测失败：(.*)$/, 'Check failed: $1'],
      [/^读取判定记录失败：(.*)$/, 'Failed to read fullscreen records: $1'],
      [/^统计读取失败：(.*)$/, 'Failed to read stats: $1'],
      [/^导出失败：(.*)$/, 'Export failed: $1'],
      [/^导入失败：(.*)$/, 'Import failed: $1'],
      [/^卸载失败：(.*)$/, 'Uninstall failed: $1'],
    ],
    ja: [
      [/^(\d+) 秒$/, '$1秒'],
      [/^(\d+) 分钟$/, '$1分'],
      [/^([−＋+-]) (\d+) 秒$/, '$1 $2秒'],
      [/^([−＋+-]) (\d+) 分钟$/, '$1 $2分'],
      [/^今天 (\d+) 分钟 · 近 7 天 (\d+) 分钟 · 累计 (\d+) 分钟$/, '今日 $1分 · 直近7日 $2分 · 累計 $3分'],
      [/^🍅 开始专注 (\d+) 分钟$/, '🍅 $1分の集中を開始'],
      [/^🍅 结束专注$/, '🍅 集中を終了'],
      [/^🍚 白饭账本 · (.+)$/, '🍚 ご飯帳簿 · $1'],
      [/^🍚 用量账本 · (.+)$/, '🍚 使用量帳簿 · $1'],
      [/^🍚 白饭账本$/, '🍚 ご飯帳簿'],
      [/^🍚 用量账本$/, '🍚 使用量帳簿'],
      [/^已启用 (\d+) 行自定义文字。$/, 'カスタム台詞を$1行有効にしました。'],
      [/^点击动作右侧的 ☆ 可置顶，当前 (\d+)\/(\d+)$/, 'アクション右側の☆でピン留めできます。現在 $1/$2'],
      [/^已是最新版本 v(.+)$/, '最新バージョン v$1 です'],
      [/^发现新版本 (.+)（当前 v(.+)），选择下载方式：$/, '新バージョン $1 があります（現在 v$2）。ダウンロード方法を選んでください：'],
      [/^下载中… (.+)%$/, 'ダウンロード中… $1%'],
      [/^已保存到 Downloads：(.+)$/, 'Downloads に保存しました：$1'],
      [/^已导出 (.+)：(.+)$/, '書き出しました $1：$2'],
      [/^这是 (.+) 的账单$/, 'これは $1 の帳簿です'],
      [/^(.+)：暂无数据$/, '$1：データなし'],
      [/^你好呀，我是(.+)～$/, 'こんにちは、$1です～'],
      [/^(.+)  (全屏|非全屏)  /, '$1  $2  '],
      [/^大肥鱼 plus（(\d+)）$/, '大肥魚 plus（$1）'],
      [/^逐帧动画 · (.+) 动作（含扩充）$/, 'フレームアニメ · $1 アクション（拡張込み）'],
      [/^逐帧动画 · (.+) 动作$/, 'フレームアニメ · $1 アクション'],
      [/^(\d+) 帧图集 · 已下载$/, '$1フレーム図集 · ダウンロード済み'],
      [/^(\d+) 个动作 · (.+)$/, '$1 アクション · $2'],
      [/^(\d+) 动作 · (.+)$/, '$1 アクション · $2'],
      [/^最多置顶 (\d+) 个动作，请先取消一个$/, 'ピン留めは最大$1個です。先に1つ解除してください'],
      [/^动作已并入 (.+)$/, 'アクションは $1 に統合済み'],
      [/^来自 (.+) 官方接口$/, '$1 公式APIから'],
      [/^已连上 (.+)，但账户当前不可用（余额不足或被停用）$/, '$1 に接続しましたが、アカウントは現在利用できません（残高不足または停止）'],
      [/^已连上 (.+)$/, '$1 に接続しました'],
      [/^未配置 (.+) API Key$/, '$1 のAPIキーが未設定'],
      [/^还没填写 (.+) 的 API Key$/, '$1 のAPIキーが未設定'],
      [/^账户当前不可用（余额不足或被停用）$/, 'アカウントは現在利用できません（残高不足または停止）'],
      [/^当前：(.+)（(.+)） · 桌宠：(.+) · 连续命中 (\d+)\/(\d+)，连续恢复 (\d+)\/(\d+)$/, '現在：$1（$2） · ペット：$3 · 連続命中 $4/$5、連続復帰 $6/$7'],
      [/^(.+)：(已连上 ✓|未连上|检测中…)$/, '$1：$2'],
      [/^配置 (.+) API Key$/, '$1 のAPIキーを設定'],
      [/^填写 (.+) API Key$/, '$1 のAPIキーを入力'],
      [/^(\d+) \/ (\d+) 行 · 第 (\d+) 行超长$/, '$1 / $2 行 · $3行目が長すぎます'],
      [/^(\d+) \/ (\d+) 行$/, '$1 / $2 行'],
      [/^已保存 (\d+) 行，并通过敏感词检查 ✓$/, '$1行を保存し、NGワード検査に合格しました ✓'],
      [/^验证未通过：(.*)$/, '検証に失敗：$1'],
      [/^已保存 ✓，但这次没能验证：(.*)$/, '保存しました ✓（今回は検証できませんでした）：$1'],
      [/^保存失败：(.*)$/, '保存失敗：$1'],
      [/^清除失败：(.*)$/, '削除失敗：$1'],
      [/^读取配置失败：(.*)$/, '設定の読み込み失敗：$1'],
      [/^读取失败：(.*)$/, '読み込み失敗：$1'],
      [/^每行一句，例如：[\s\S]*$/, '1行1台詞、例：\n今日もちゃんとご飯を食べてね～\nサボるのは楽しい'],
      [/^检查失败：(.*)$/, '確認失敗：$1'],
      [/^下载失败：(.*)$/, 'ダウンロード失敗：$1'],
      [/^下载未开始：(.*)$/, 'ダウンロード開始失敗：$1'],
      [/^检测失败：(.*)$/, '検出失敗：$1'],
      [/^读取判定记录失败：(.*)$/, '全画面判定記録の読み込み失敗：$1'],
      [/^统计读取失败：(.*)$/, '統計の読み込み失敗：$1'],
      [/^导出失败：(.*)$/, '書き出し失敗：$1'],
      [/^导入失败：(.*)$/, 'インポート失敗：$1'],
      [/^卸载失败：(.*)$/, 'アンインストール失敗：$1'],
    ],
  };
  const TOKENS = {
    en: {
      '未知错误': 'Unknown error', '网络错误': 'Network error', '全屏': 'Fullscreen', '非全屏': 'Not fullscreen',
      '显示中': 'visible', '已因全屏隐藏': 'hidden by fullscreen', '手动隐藏': 'hidden manually', '几何': 'geometry',
      '检测中': 'checking', '未连上': 'not connected', '已连上': 'connected',
    },
    ja: {
      '未知错误': '不明なエラー', '网络错误': 'ネットワークエラー', '全屏': '全画面', '非全屏': '非全画面',
      '显示中': '表示中', '已因全屏隐藏': '全画面で非表示', '手动隐藏': '手動で非表示', '几何': '幾何',
      '检测中': '確認中', '未连上': '未接続', '已连上': '接続済み',
    },
  };

  // 同一个「关闭」在开关里是 Off，在面板底部是 Close；按元素 ID 覆盖。
  const BY_ID = {
    en: { 'set-close': { '关闭': 'Close' }, 'picker-close': { '关闭': 'Close' } },
    ja: { 'set-close': { '关闭': '閉じる' }, 'picker-close': { '关闭': '閉じる' } },
  };

  let currentLang = 'zh';
  let observer = null;

  function lookup(text, lang) {
    const key = String(text == null ? '' : text).trim();
    if (!key) return text;
    const pack = PACK_UI[lang];
    if (pack && pack[key]) return pack[key];
    const dict = DICTS[lang];
    let out = text;
    if (dict && dict[key]) out = dict[key];
    else {
      const fb = PACK_FALLBACK[lang];
      if (fb && fb[key]) out = fb[key];
    }
    if (out === text) {
      const rules = RULES[lang];
      if (rules) for (const [re, to] of rules) {
        if (re.test(key)) {
          out = key.replace(re, to);
          break;
        }
      }
    }
    // 动态组合串里的固定词（错误、全屏状态、连接状态）再补一轮
    const tokens = TOKENS[lang];
    if (tokens) {
      const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);
      for (const token of keys) {
        if (out === token || out.indexOf(token) < 0) continue;
        out = out.split(token).join(tokens[token]);
      }
    }
    return out;
  }

  const SKIP_SELECTOR = '#bubble-text, script, style, noscript, template, textarea, input';

  function translateNode(node) {
    if (!node || node.nodeType !== 3) return;
    const el = node.parentElement;
    if (el && el.closest && el.closest(SKIP_SELECTOR)) return;
    const t = /** @type {any} */ (node);
    const raw = t.nodeValue;
    if (!String(raw || '').trim()) return;
    if (t.__i18nOut !== undefined && raw === t.__i18nOut) return;
    t.__i18nSrc = raw;
    if (currentLang === 'zh') {
      t.__i18nOut = undefined;
      return;
    }
    const key = String(raw).trim();
    let out = lookup(raw, currentLang);
    const over = el && el.id && BY_ID[currentLang] && BY_ID[currentLang][el.id];
    if (over && over[key]) out = over[key];
    t.__i18nOut = out !== raw ? out : undefined;
    if (out !== raw) t.nodeValue = out;
  }

  function walkText(scope) {
    if (!scope || !root.document) return;
    const walker = root.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      translateNode(node);
      node = walker.nextNode();
    }
  }

  function restore(scope) {
    if (!scope || !root.document) return;
    const walker = root.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const t = /** @type {any} */ (node);
      if (t.__i18nSrc !== undefined && node.nodeValue !== t.__i18nSrc) node.nodeValue = t.__i18nSrc;
      t.__i18nOut = undefined;
      node = walker.nextNode();
    }
  }

  const attrSrc = new WeakMap();
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  function translateAttr(el, name) {
    const cur = el && el.getAttribute && el.getAttribute(name);
    if (!cur) return;
    let rec = attrSrc.get(el);
    if (!rec) {
      rec = {};
      attrSrc.set(el, rec);
    }
    if (rec[name] && cur === rec[name].out) return;
    if (currentLang === 'zh') {
      rec[name] = { src: cur, out: undefined };
      return;
    }
    const out = lookup(cur, currentLang);
    rec[name] = { src: cur, out: out !== cur ? out : undefined };
    if (out !== cur) el.setAttribute(name, out);
  }

  function translateAttrs(scope) {
    if (!scope || !scope.querySelectorAll) return;
    const els = scope.querySelectorAll('[title],[placeholder],[aria-label]');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      for (const name of ATTRS) translateAttr(/** @type {any} */ (el), name);
    }
  }

  function restoreAttrs(scope) {
    if (!scope || !scope.querySelectorAll) return;
    const els = scope.querySelectorAll('[title],[placeholder],[aria-label]');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const rec = attrSrc.get(el);
      if (!rec) continue;
      for (const name of ATTRS) {
        if (rec[name] && rec[name].out !== undefined) el.setAttribute(name, rec[name].src);
        if (rec[name]) rec[name].out = undefined;
      }
    }
  }

  function startObserver() {
    if (observer || !root.document) return;
    const scope = root.document.body;
    if (!scope || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
      for (const m of records) {
        if (m.type === 'characterData') translateNode(/** @type {any} */ (m.target));
        else if (m.type === 'attributes') translateAttr(/** @type {any} */ (m.target), m.attributeName);
        else for (let i = 0; i < m.addedNodes.length; i++) {
          const n = m.addedNodes[i];
          if (n.nodeType === 3) translateNode(/** @type {any} */ (n));
          else if (n.nodeType === 1) {
            walkText(/** @type {any} */ (n));
            translateAttrs(/** @type {any} */ (n));
          }
        }
      }
    });
    observer.observe(scope, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function apply(lang) {
    const scope = root.document && root.document.body;
    if (!scope) return;
    const next = lang === 'en' || lang === 'ja' ? lang : 'zh';
    restore(scope);
    restoreAttrs(scope);
    currentLang = next;
    walkText(scope);
    translateAttrs(scope);
    root.document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
    startObserver();
  }

  // 需要按模板翻译时用 T('已启用 {n} 行…', { n })，普通静态文本交给 apply/观察器。
  function T(text, vars) {
    let s = lookup(text, currentLang);
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  // 台词内容量大，放到独立脚本按需追加；已有译文不覆盖，保留人工润色过的版本。
  function extend(en, ja) {
    for (const [dict, add] of [[LINE_EN, en], [LINE_JA, ja]]) {
      for (const k of Object.keys(add || {})) if (!(k in dict)) dict[k] = add[k];
    }
  }

  // 静态界面文案走 apply() 使用的 UI 字典；与台词字典分开，避免 apply() 改写气泡内容。
  function extendUI(en, ja) {
    for (const [dict, add] of [[EN, en], [JA, ja]]) {
      for (const k of Object.keys(add || {})) if (!(k in dict)) dict[k] = add[k];
    }
  }

  // 形象包译文整体替换：refreshPacks 时重建，卸载后立刻消失。
  function setPackDictionaries(lines, ui) {    for (const lang of ['en', 'ja']) {
      const lineDict = PACK_LINES[lang];
      const uiDict = PACK_UI[lang];
      for (const k of Object.keys(lineDict)) delete lineDict[k];
      for (const k of Object.keys(uiDict)) delete uiDict[k];
      Object.assign(lineDict, (lines && lines[lang]) || {});
      Object.assign(uiDict, (ui && ui[lang]) || {});
    }
  }

  function extendPackFallback(en, ja) {
    Object.assign(PACK_FALLBACK.en, en || {});
    Object.assign(PACK_FALLBACK.ja, ja || {});
  }

  const api = { apply, line, T, translate: lookup, extend, extendUI, extendPackFallback, setPackDictionaries, dictionaries: DICTS };
  root.PetLib = root.PetLib || {};
  root.PetLib.i18n = api;
  // 原生 alert / title 等不在 DOM 文本节点里的短句，用 tr() 直接翻译。
  root.tr = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);







