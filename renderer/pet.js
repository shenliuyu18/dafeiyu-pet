// 启动第一件事：显式加载软糖体。CSS @font-face 的字体只有被文字用到才会开始下载，
// 而首条气泡出现前页面上几乎没有文字 —— 不主动 load 的话，document.fonts.status 会
// 误报 loaded，气泡先用回退字体排版显示，字体到位后字形变宽折行，气泡就「长高」。
if (document.fonts && document.fonts.load) {
  try {
    document.fonts.load('16px "ShouShou"', '你好呀蓝色大肥鱼0123456789');
    document.fonts.load('700 16px "ShouShou"', '你好呀蓝色大肥鱼0123456789');
  } catch (e) { /* 字体加载失败不阻塞 */ }
}

'use strict';

// 禁用 WebView2 页面缩放：Ctrl+滚轮、Ctrl+加减和触控板捏合都会放大整页，
// 而桌宠窗口的 Region / 命中区按未缩放坐标计算，缩放后整体错位。
for (const ev of ['wheel', 'mousewheel']) {
  window.addEventListener(ev, (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false, capture: true });
}
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (['+', '-', '=', '0', '_'].includes(e.key) || /^Numpad(Add|Subtract|0)$/.test(e.code)) e.preventDefault();
}, true);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  window.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}

const stage = document.getElementById('stage');
const petEl = document.getElementById('pet');
const hitEl = document.getElementById('hit');
const leanEl = document.getElementById('lean');
const vidEl = document.getElementById('petVid');
const petSnap = document.getElementById('petSnap');
const snapCtx = petSnap ? petSnap.getContext('2d') : null;

// 切换动作前把当前帧拍下来盖在原位，新视频开始播了再撤掉，形象就不会闪没


const petImgEl = document.getElementById('petImg');
const petSpriteEl = document.getElementById('petSprite');
const memeEl = document.getElementById('bubble-meme');
const flipEl = document.getElementById('flip');
const bubbleEl = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const barsEl = document.getElementById('bubble-bars');
const barSat = document.getElementById('bar-sat');
const barMood = document.getElementById('bar-mood');
const usageEl = document.getElementById('bubble-usage');
const uToday = document.getElementById('u-today');
const uMonth = document.getElementById('u-month');
const uSession = document.getElementById('u-session');
const quotaEl = document.getElementById('u-quota');
const uBar = document.getElementById('u-bar');
const uQuotaText = document.getElementById('u-quota-text');
const uNote = document.getElementById('u-note');
const uRetry = document.getElementById('u-retry');
const uL1 = document.getElementById('u-l1');
const uL2 = document.getElementById('u-l2');
const uL3 = document.getElementById('u-l3');
const chipEl = document.getElementById('chip');
const chipTime = document.getElementById('chip-time');
const fxEl = document.getElementById('fx');
const menuEl = document.getElementById('menu');
const menuPomo = document.getElementById('menu-pomo');
const menuUsage = document.getElementById('menu-usage');
const menuSleepIco = document.getElementById('menu-sleep-ico');
const menuSleepTxt = document.getElementById('menu-sleep-txt');
const scaleEl = document.getElementById('scale');
const settingsEl = document.getElementById('settings');
const setSizes = document.getElementById('set-sizes');
const setDocks = document.getElementById('set-docks');
const setSizeVal = document.getElementById('set-size-val');
const setFontVal = document.getElementById('set-font-val');
const setFonts = document.getElementById('set-fonts');
const setFontHint = document.getElementById('font-hint');
const setSfx = document.getElementById('set-sfx');
const setLang = document.getElementById('set-lang');
const setMemeOrder = document.getElementById('set-meme-order');
const setLedgerSrc = document.getElementById('set-ledger-src');
const setBack = document.getElementById('set-back');
const setTitle = document.getElementById('set-title');
const setHome = document.getElementById('set-home');
const setPages = [...document.querySelectorAll('.set-page')];
const setVersionEl = document.getElementById('set-version');
const updateHint = document.getElementById('update-hint');
const updateActions = document.getElementById('update-actions');
const updateInstallRow = document.getElementById('update-install-row');
const updateLanzou = document.getElementById('update-lanzou');
const updateDirect = document.getElementById('update-direct');
const updateAccel = document.getElementById('update-accel');
const setAutoVal = document.getElementById('set-auto-val');
const setPomoVal = document.getElementById('set-pomo-val');
const setPomoPresets = document.getElementById('set-pomo-presets');
const setPomoAnimVal = document.getElementById('set-pomo-anim-val');
const setPomoAnimPresets = document.getElementById('set-pomo-anim-presets');
const setLedger = document.getElementById('set-ledger');
const setAutoStart = document.getElementById('set-autostart');
const setAutoStartHint = document.getElementById('autostart-hint');
const setSafeResume = document.getElementById('set-safe-resume');
const setFullscreenHide = document.getElementById('set-fullscreen-hide');
const setAppName = document.getElementById('set-app-name');
const pickerEl = document.getElementById('picker');
const pickerBody = document.getElementById('picker-body');
const pickerHint = document.getElementById('picker-hint');
const menuUsageBtn = document.getElementById('menu-usage-btn');
const menuFeedTxt = document.getElementById('menu-feed-txt');
const helpLedger = document.getElementById('help-ledger');
const ledgerDiagStatus = document.getElementById('ledger-diag-status');
const ledgerDiagDetail = document.getElementById('ledger-diag-detail');
const fsDiagStatus = document.getElementById('fs-diag-status');
const fsDiagLog = document.getElementById('fs-diag-log');
const diagnosticsStatus = document.getElementById('diagnostics-status');
const pomoSummary = document.getElementById('pomo-stats-summary');
const pomoChart = document.getElementById('pomo-chart');
const setWordsStatus = document.getElementById('set-words-status');
const setWordsEnable = document.getElementById('set-words-enable');
const setWordsDisable = document.getElementById('set-words-disable');

// 注意：浏览器会给 id="pet" 的元素创建同名全局 window.pet，不能只判断 typeof。
const hasApi = !!(window.pet && typeof window.pet.on === 'function');
const api = hasApi ? window.pet : mockApi();

// 前端未捕获异常写进本机错误日志（TEMP/dafeiyu-error.log），不联网；
// 同一异常 60 秒内只记一次，避免坏素材 / 坏动画把日志刷爆。
const reportedErrors = new Map();

window.addEventListener('error', (e) => reportClientError('js-error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportClientError('unhandled-rejection', e.reason));

// 布局常量，与 style.css / index.html / wails/win32.go 的命中和兜底范围保持一致
let petScale = DEFAULT_SCALE;

const { QUIPS, GPT_QUIPS, MEMES, CLASSIC_MEME_TEXTS, FEED_LINES, HUNGRY_LINES, SLEEP_LINES, AI_FEED_LINES, AI_HUNGRY_LINES, AI_SLEEP_LINES, CHAR_LINES } = window.PetLib.dialogue;
const { saveSettings, syncSettingsUI, applyLedgerUI } = window.PetLib.settingsUi;
const { ledgerDiagText } = window.PetLib.ledgerFormat;
const feedLines = () => charLines('feed') || (isDsh() ? FEED_LINES : AI_FEED_LINES);
const hungryLines = () => charLines('hungry') || (isDsh() ? HUNGRY_LINES : AI_HUNGRY_LINES);
const sleepLines = () => charLines('sleep') || (isDsh() ? SLEEP_LINES : AI_SLEEP_LINES);


// 开场白必须跟着当前形象走；自定义包没有写人设时用包名兜底。


const S = {
  satiety: 78,
  mood: 82,
  awake: true,
  ledgerOn: true,
  autoStart: false,
  safeResume: true,
  fullscreenHide: true,
  memeOrder: 'queue',
  launchApp: '',
  character: 'v1',
  fontFamily: 'soft',
  fontScale: 1,
  sfx: 'default',
  lang: 'zh',
  autoActionSec: 40,
  ledgerSource: 'qoder',
  apiKeys: {},
  autoUpdate: true,
  customQuips: [],
  useCustomQuips: true,
  pinnedActions: {},
  dock: 'roam',
  pomoMin: 25,
  pomoAnimSec: 5,
  dragging: false,
  hover: false,
  autoDoze: false,
  pomoRunning: false,
  ledger: null,
  lastInteract: Date.now(),
  hungryAt: 0,
  bubbleTimer: null,
  quipTimer: null,
  happyTimer: null,
  downAt: 0,
  moved: 0,
  mouse: { x: 0, y: 0 },
};

const P = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  target: null,
  swimTo: null,
  pauseUntil: 0,
  facing: 'right',
  dragOff: { x: 0, y: 0 },
  frozen: false,
  swimming: false,
};

const { clamp } = window.PetLib.motion;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const usingCustomQuips = () => S.useCustomQuips && S.customQuips.length > 0;
// 形象包是别的角色，不该说大肥鱼或 GPT 娘的台词，用一组中性台词
const NEUTRAL_QUIPS = [
  '在的，需要我做什么随时说。',
  '今天也一起加油吧。',
  '要不要起来活动一下？',
  '记得喝水。',
  '坐久了，肩膀放松一下。',
  '我一直在这儿陪着你。',
  '有进展吗？慢慢来，不着急。',
  '累了就歇一会儿。',
];

const quipsPool = () => {
  if (usingCustomQuips()) return S.customQuips;
  const own = charLines('quips');
  if (own) return own;
  if (S.character === 'gpt') return GPT_QUIPS;
  if (String(S.character).startsWith('pack:')) return NEUTRAL_QUIPS;
  return QUIPS;
};

// ---------------------------------------------------------------- 预览兜底



// ---------------------------------------------------------------- 移动引擎













let lastFrame = performance.now();
let lastPosReport = 0;
let lastSentX = -99999;
let lastSentY = -99999;
let lastPosSentAt = 0;
let lastTransform = '';

// 帧间隔：空闲 100ms（10fps）足够做几何 / Region 保活；移动或拖拽走更密的档位。
// 倾身由光标事件直接更新，CSS transition 会把 10fps 的几何更新补顺滑。
let idleFrameGap = 100;
let roamFrameGap = 22; // 约 45fps：慢速游动看不出差别，比 60fps 省约 1/4 的合成开销
// 调试 / 基准钩子：__frameGap(空闲 ms, 漫游 ms)，传 0 表示不限制
window.__frameGap = (idle, roam) => {
  idleFrameGap = Math.max(0, Number(idle) || 0);
  roamFrameGap = Math.max(0, Number(roam) || 0);
};



// 首帧隐藏到 init 把位置和形象都设好再显示，避免先画在 (0,0) 再跳到目标位置。
let petRevealTimer = 0;

// 纯浏览器预览没有 init 事件，兜底显示；正式 Wails 环境只等 init。
if (!window.__wails) petRevealTimer = setTimeout(markPetReady, 1200);



// 贴近屏幕下缘时，番茄钟倒计时牌子翻到头顶上方（否则落在窗口外被任务栏挡住）
let chipUp = false;


// 气泡上方空间不足（贴顶）时翻到鱼下方，避免顶出窗口被裁掉；
// 另外做左右夹取：气泡最大宽 262px 且居中对齐在鱼身上方，鱼贴着屏幕边缘时
// 整个气泡框会伸出窗口，这里把气泡整体拉回来（corner 停靠则直接让鱼往左站一点）


// 气泡长高/首次出现时立即上报并强制刷新 Region。位置没变时 frame() 只在
// 400ms 保活那一次才上报，气泡新增的上半截会被旧 Region 裁掉大半秒。


// 换内容前先往 Region 里多留一块空间（气泡上是长高方向，.down 时是下方）。
// 等这次上报送达后再改 DOM，新高度就已经落在 Region 内，不会有一两帧被裁。
let bubbleReserve = 0;


// 气泡已经显示时改内容：先扩好 Region 再动 DOM，否则新版宽/高要等
// ResizeObserver → IPC → SetWindowRgn，这两三帧会被旧 Region 裁掉边缘。


// 右下角停靠点：直接贴右下角；气泡若会伸出屏幕，positionBubble 会把气泡往回收，
// 保证气泡右边框与屏幕右边框只留一点小间距



// ---------------------------------------------------------------- 动画状态机
// 素材来自 dsh-pet（MIT）：640×360 透明 WebM，角色居中
const ANIM_DIR = '../assets/anims/';
const { ANIM_BUILTIN, PLUS_TARGET, CODE_CHAR_PACKS } = window.PetLib.animActions;
for (const k of Object.keys(CODE_CHAR_PACKS)) CODE_CHAR_DEFS[k] = CHARS[k];
let ANIM = ANIM_BUILTIN;
let animDir = ANIM_DIR;
const PLUS = {};          // charId -> { dir, actions:[{id,category}] }
let plusSrc = {};         // 动作名 -> 目录（并入后按动作名选目录）
let animFile = {};        // 动作名 -> 完整文件路径（形象包素材按 <id>-<动作> 命名后用清单解析）

let curAnim = '';
let curNoMirror = false;
let oneShotPlaying = false;
let oneShotTimer = null;
let oneShotSeq = 0;

// ---------------------------------------------------------------- 形象（皮肤）
// v1：dsh-pet 的 106 个逐帧动画（WebM，内置默认形象）
let spriteSheetImg = null;
let spriteMode = 'idle';
let spriteTimer = null;
let spriteSeqId = 0;
let spriteFrame = 0;
let spriteLookIndex = null;
let spriteDrawn = '';
let lastCursorAt = 0;























let curPose = '';



// 姿势形象：按名字换图（找不到映射就随机挑一张兜底图），换姿势时弹一下


vidEl.addEventListener('playing', hideSnap);
// 播放失败（文件缺失/包损坏）时把该动作从池里踢掉并回落待机，而不是让形象凭空消失
const failedActions = new Set();
vidEl.addEventListener('error', () => {
  hideSnap();
  const name = curAnim;
  if (name && !failedActions.has(name)) {
    failedActions.add(name);
    HAS.delete(name);
    delete animFile[name];
    delete plusSrc[name];
    curAnim = '';
    try { playAnim(ANIM.idle, true); } catch (e) { /* 兜底失败就静默 */ }
  }
});
petImgEl.addEventListener('animationend', (e) => {
  if (e.animationName === 'posePop') petImgEl.classList.remove('pop');
});

// 窗口被隐藏（托盘躲起来 / 全屏避让 / 最小化）时停止视频解码；
// 重新可见时再续播当前动作。隐藏状态下继续解码是纯浪费。

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    vidEl.pause();
    return;
  }
  if (charNow().kind === 'video' && vidEl.getAttribute('src')) {
    const pr = vidEl.play();
    if (pr && pr.catch) pr.catch(() => {});
  }
});







// 闲时随机小节目：分类与权重参考 dsh-pet 的 animationWeights / categories 配置
// ---------------------------------------------------------------- 视线

// 素材是整张插画，瞳孔没法单独动；改成整个身子朝光标方向轻轻倾一点
let lastLean = '';
let leanOn = true;



// ---------------------------------------------------------------- 气泡

// 所有气泡显示路径统一走这里：字体就绪 + 高度长齐（≥36px）才亮出来，
// 否则就会像录屏里那样先弹一条空带子/半截，内容到位后才撑高。


let saySeq = 0;
const memePreloads = new Map();

// 先离屏把梗图读进缓存，旧气泡保持不动。换内容时如果先改文字、图片还在加载，
// 大白色气泡会缩成一条小文字（深色桌面上看起来就是闪一下黑屏），等图到位再长回去。






if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (bubbleEl.classList.contains('show')) positionBubble();
  });
}
// 兜底：气泡里任何内容变化（文字/账本条/用量表）都重新定位一次。
// 气泡有三种显示路径（say / 碎碎念 / 账本），内容都是异步填充的，
// 与其在每条路径上打补丁，不如盯着 DOM 变化统一处理。
const bubbleRefit = () => { if (bubbleEl.classList.contains('show')) positionBubble(); };
const bubbleObserver = new MutationObserver(bubbleRefit);
for (const el of [bubbleText, barsEl, usageEl]) {
  if (el) bubbleObserver.observe(el, { childList: true, characterData: true, subtree: true });
}
memeEl.addEventListener('load', bubbleRefit);

// 气泡已在显示时内容变高（梗图加载完、账本异步补行）也要立刻扩 Region。
// ResizeObserver 在布局后触发，配合 force 上报把裁切压到一帧以内。
if (typeof ResizeObserver === 'function') {
  let lastBox = '';
  new ResizeObserver(() => {
    if (!bubbleEl.classList.contains('show')) {
      lastBox = '';
      return;
    }
    const r = bubbleEl.getBoundingClientRect();
    const sig = `${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    if (sig === lastBox) return;
    lastBox = sig;
    reportRegionNow(true);
  }).observe(bubbleEl);
}

// DSniang1 并入经典表情库；放在根目录，按文件名直接引用
const EXTRA_MEMES = [
  { file: 'DSniang1', ext: 'webp', text: '就这？本鱼看你的眼神已经说明一切。', scenes: ['click'], dir: '../assets/memes/' },
];
const allMemes = () => (window.ARCHIVE_MEMES || []).concat(window.DSH_MEMES || []).concat(EXTRA_MEMES);
const memeUrl = (m) => {
  const ext = m.dir ? m.ext : (window.__DAFEIYU_LITE ? 'webp' : m.ext);
  return (m.dir || '../assets/memes/archive/') + m.file + '.' + ext;
};
// 经典梗图和扩展图库合并成一个池，按场景洗牌后依次播放。
// 所有场景共享「上一张」，避免跨场景或跨轮连续重复；真随机模式每次独立抽取。
const memeQueue = new window.PetLib.memeQueue.MemeQueue();



// 场景 -> 合并池：经典梗图 + 档案馆/dsh/DSniang1，按文件名去重


// 场景 -> 一张梗图 { file, url, text }；队列模式下保证不连续重复








memeEl.addEventListener('load', () => {
  if (bubbleEl.classList.contains('show')) positionBubble();
});



// 白饭账本：白饭 = 你被烧掉的 Qoder credits（可在设置里开关）
// animate=false 用于后台刷新（异步账单回来时补渲染），不重放数金动画






let usagePending = false;

// 气泡里的「重新检测」：跳过 45 秒缓存，直接问平台要一次结果。


if (uRetry) uRetry.addEventListener('click', (e) => {
  e.stopPropagation();
  retryUsage();
});



// ---------------------------------------------------------------- 状态











// ---------------------------------------------------------------- 特效





// ---------------------------------------------------------------- 番茄钟

// ---------------------------------------------------------------- 右键菜单

let menuOpen = false;
let menuAnchor = { x: 0, y: 0 };

menuEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  closeMenu();
  if (act === 'status') showStatus();
  else if (act === 'settings') openSettings();
  else if (act === 'acts') openPicker();
  else api.action(act);
});

// ---------------------------------------------------------------- 设置

let settingsOpen = false;

// ---------------------------------------------------------------- 账本 / 全屏诊断





























// 各平台 Key 配置状态有变化时刷新按钮


















// ---- 检查更新（内联显示结果，不弹系统窗口）----
let updateInfo = null;
let updateDownloading = false;
let updateChecking = false;



// 音效包：default / whale / off


// 自动动作间隔（5~300 秒，5 秒步进，默认 20）


// 内置字体走系统字体（不占安装包），自定义字体由 Go 端复制到配置目录后经 /userfonts/ 提供。
const FONT_PRESETS = ['soft', 'yahei', 'dengxian', 'kaiti', 'simsun'];
const customFontName = (fam) => (typeof fam === 'string' && fam.startsWith('custom:') ? fam.slice(7) : '');









// 气泡字体大小（0.8×~1.4×，只影响气泡里的文字）






// 自定义互动文字：编辑后先交给主进程做离线敏感词检查，通过才写入状态








const SET_PAGE_TITLES = {
  look: '🐟 形象与音效',
  sizefont: '📏 尺寸与字体',
  place: '📍 待机与自动动作',
  pomo: '🍅 番茄钟',
  ledger: '🍚 白饭账本',
  startup: '🚀 启动与更新',
  words: '💬 自定义互动文字',
  help: '❓ 关于大肥鱼桌宠',
};

// 设置面板定位：优先放在鱼的左边，放不下就放右边；无论鱼在哪、页面多高，
// 都把面板整体夹取在屏幕内（子页切换后高度会变，需要重新调用）
// 角色本体的屏幕范围（包围盒四周有透明留白，菜单按本体对齐才会显得"贴得近"）











settingsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.id === 'set-back') return showHome();
  if (btn.dataset.page) return openSetPage(btn.dataset.page);
  if (btn.dataset.ledgerSrc) return applyLedgerSource(btn.dataset.ledgerSrc, true);
  if (btn.dataset.key) return api.keyOpen(btn.dataset.key);
  if (btn.dataset.link) return api.openExternal(btn.dataset.link);
  if (btn.id === 'check-update') {
    doCheckUpdate();
    return;
  }
  if (btn.id === 'update-direct' || btn.id === 'update-accel') {
    startUpdateDownload(btn.id === 'update-accel' ? 'accel' : 'direct');
    return;
  }
  if (btn.id === 'update-lanzou') {
    api.openExternal('https://wwaql.lanzouu.com/b01i5xmkri');
    return;
  }
  if (btn.id === 'ledger-recheck') {
    recheckLedger();
    return;
  }
  if (btn.id === 'ledger-diag-toggle') {
    toggleLedgerDiag();
    return;
  }
  if (btn.id === 'fs-diag-refresh') {
    refreshFsDiag(true);
    return;
  }
  if (btn.id === 'fs-diag-toggle') {
    toggleFsDiag();
    return;
  }
  if (btn.id === 'export-diagnostics') {
    exportDiagnostics();
    return;
  }
  if (btn.dataset.lang) {
    applyLanguage(btn.dataset.lang, true);
    return;
  }
  if (btn.id === 'set-words-edit') {
    api.editWords();
    return;
  }
  if (btn.id === 'set-words-clear') {
    S.customQuips = [];
    saveSettings();
    syncSettingsUI();
    setWordsStatusText('已清空，当前使用默认台词。', 'ok');
    return;
  }
  if (btn.id === 'set-words-enable' || btn.id === 'set-words-disable') {
    const on = btn.id === 'set-words-enable';
    if (on && !S.customQuips.length) {
      setWordsStatusText('还没有已保存的自定义文字，请先点「编辑自定义文字…」写几句。', 'err');
      return;
    }
    S.useCustomQuips = on;
    saveSettings();
    syncSettingsUI();
    setWordsStatusText(on ? `已启用 ${S.customQuips.length} 行自定义文字。` : '已切换为默认台词。', 'ok');
    return;
  }
  if (btn.dataset.char) applyCharacter(btn.dataset.char, true);
  else if (btn.dataset.download) downloadPack(btn.dataset.download);
  else if (btn.dataset.refresh) loadCatalog();
  else if (btn.dataset.import) importPack();
  else if (btn.dataset.del) removePack(btn.dataset.del);
  else if (btn.dataset.size) applyScale(Number(btn.dataset.size), true);
  else if (btn.dataset.dock) applyDock(btn.dataset.dock, true);
  else if (btn.dataset.pomo) applyPomoMin(Number(btn.dataset.pomo), true);
  else if (btn.dataset.pomoAnim) applyPomoAnimSec(Number(btn.dataset.pomoAnim), true);
  else if (btn.id === 'pomo-anim-minus') applyPomoAnimSec(S.pomoAnimSec - POMO_ANIM_STEP, true);
  else if (btn.id === 'pomo-anim-plus') applyPomoAnimSec(S.pomoAnimSec + POMO_ANIM_STEP, true);
  else if (btn.id === 'size-minus') applyScale(petScale - SIZE_STEP, true);
  else if (btn.id === 'size-plus') applyScale(petScale + SIZE_STEP, true);
  else if (btn.id === 'font-minus') applyFontSize(S.fontScale - FONT_STEP, true);
  else if (btn.id === 'font-plus') applyFontSize(S.fontScale + FONT_STEP, true);
  else if (btn.dataset.font) applyFontFamily(btn.dataset.font, true);
  else if (btn.id === 'font-import') importFont();
  else if (btn.dataset.sfx) applySfx(btn.dataset.sfx, true);
  else if (btn.id === 'auto-minus') applyAutoActionSec(S.autoActionSec - AUTO_STEP, true);
  else if (btn.id === 'auto-plus') applyAutoActionSec(S.autoActionSec + AUTO_STEP, true);
  else if (btn.dataset.ledger) applyLedger(btn.dataset.ledger === '1', true);
  else if (btn.dataset.autostart !== undefined) applyAutoStart(btn.dataset.autostart === '1', true);
  else if (btn.dataset.saferesume) applySafeResume(btn.dataset.saferesume === '1', true);
  else if (btn.dataset.fullscreenhide) applyFullscreenHide(btn.dataset.fullscreenhide === '1', true);
  else if (btn.dataset.memeorder) applyMemeOrder(btn.dataset.memeorder, true);
  else if (btn.dataset.autoupdate) applyAutoUpdate(btn.dataset.autoupdate === '1', true);
  else if (btn.id === 'pomo-minus') applyPomoMin(S.pomoMin - POMO_STEP, true);
  else if (btn.id === 'pomo-plus') applyPomoMin(S.pomoMin + POMO_STEP, true);
  else if (btn.id === 'app-pick') pickLinkedApp();
  else if (btn.id === 'app-clear') applyLinkedApp('', true);
  else if (btn.id === 'set-close') closeSettings();
});

// ---------------------------------------------------------------- 选个动作

let pickerOpen = false;

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => { if (settingsOpen) positionSettings(); }).observe(settingsEl);
  new ResizeObserver(() => { if (pickerOpen) positionPicker(); }).observe(pickerEl);
}
let pickerBuilt = false;

const byPool = (id) => (ACTIONS.find((a) => a.id === id) || { pool: [] }).pool;
const PICKER_GROUPS = [
  { name: '基础状态', list: [...ANIM.idle, ...ANIM.move, ...ANIM.drag, ...ANIM.sleep, ...ANIM.sad, ...ANIM.happy] },
  { name: '吃什么', list: [...ANIM.feed, ...byPool('eat')] },
  { name: '点击回应', list: ANIM.clicks },
  { name: '小动作', list: byPool('small') },
  { name: '玩耍', list: byPool('play') },
  { name: '时节', list: byPool('season') },
  { name: '工作与账本', list: [...ANIM.work, '工作状态-垂头叹气冒汗', '工作状态-雀跃庆祝', ...BALANCE_TIERS, ...ANIM.money] },
  { name: '文字碎碎念', list: [...byPool('text'), ...WHISPERS] },
];











pickerEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.id === 'picker-close') {
    closePicker();
    return;
  }
  if (btn.hasAttribute('data-pin')) {
    togglePin(btn.dataset.pin);
    return;
  }
  const name = btn.dataset.anim;
  if (!name) return;
  closePicker();
  playAction(name);
});

// ---------------------------------------------------------------- 主进程事件



api.on('init', handleInit);

api.on('power-resume', handlePowerResume);

api.on('keys-updated', handleKeysUpdated);

api.on('words-updated', handleWordsUpdated);

api.on('usage', handleUsage);

api.on('show-usage', handleShowUsage);

api.on('feed', handleFeed);

api.on('awake', handleAwake);

api.on('bubble', (t) => say(t));

api.on('pomodoro', (p) => setPomodoro(p));

api.on('pomodoro-done', handlePomodoroDone);

api.on('show-status', showStatus);

api.on('show-settings', () => openSettings());

api.on('show-picker', () => openPicker());

// 主进程轮询光标：同时用于视线跟随与"被摸到就醒来"
api.on('cursor', handleCursor);

// ---------------------------------------------------------------- 循环

let lastTick = Date.now();
let lastReport = Date.now();

setInterval(() => {
  const now = Date.now();
  const mins = (now - lastTick) / 60000;
  lastTick = now;

  S.satiety = clamp(S.satiety - 0.6 * mins, 0, 100);
  S.mood = clamp(S.mood - (S.satiety < 25 ? 0.55 : 0.22) * mins, 0, 100);
  applyHungry();
  api.updateStats({ satiety: S.satiety, mood: S.mood });

  if (now - lastReport > 20000) {
    lastReport = now;
    api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
  }

  if (!S.awake) return;
  if (S.satiety < 32 && now - S.hungryAt > 6 * 60000) {
    S.hungryAt = now;
    sayScene('hungry', pick(hungryLines()), 3200);
  }
  if (!S.autoDoze && !S.dragging && !S.pomoRunning && now - S.lastInteract > 100000) {
    S.autoDoze = true;
    applyDoze();
  }
}, 30000);

// 自动动作 / 专注工作动画心跳：500ms 检查一次即可（最短自动间隔也有 5 秒）
setInterval(maybeShow, 500);

requestAnimationFrame(frame);

// 浏览器预览模式
if (!hasApi) {
  setTimeout(() => say(charIntro(), 4200), 500);
}

// 开发截图挂钩
window.__petPos = () => ({ x: Math.round(P.x), y: Math.round(P.y) });
window.__teleport = (x, y) => {
  P.x = x;
  P.y = y;
  P.vx = 0;
  P.vy = 0;
  P.target = null;
};
window.__freeze = (v) => {
  P.frozen = !!v;
  if (v) {
    P.vx = 0;
    P.vy = 0;
    P.target = null;
    stage.classList.remove('swim');
  }
};

window.__devScene = (name) => {
  if (name === 'eat') playEat();
  else if (name === 'happy') {
    playHappy();
    burstHearts(4);
    say('好次！谢谢投喂～');
  } else if (name === 'doze') {
    S.autoDoze = true;
    applyDoze();
  } else if (name === 'hungry') {
    S.satiety = 14;
    S.mood = 48;
    applyHungry();
    say(pick(hungryLines()));
  } else if (name === 'status') {
    S.satiety = 64;
    S.mood = 88;
    showStatus();
  } else if (name === 'usage') {
    showUsage(S.ledger || { today: 12.4, month: 88.6, session: 25.1, quota: 3000, percent: 2.95, available: true });
  } else if (name === 'pomodoro') {
    setPomodoro({ running: true, remaining: 19 * 60000 + 32000 });
  } else if (name === 'bubble') {
    say('我是蓝色大肥鱼，不是鲸鱼哦');
  } else if (name === 'menu') {
    window.__freeze(true);
    openMenu(P.x + 150, P.y + 90);
  } else if (name === 'settings') {
    openSettings();
  } else if (name.startsWith('char:')) {
    applyCharacter(name.slice(5), false);
  } else if (name === 'words') {
    openSettings();
    openSetPage('words');
  } else if (name === 'picker') {
    openPicker();
  } else if (name === 'huge') {
    applyScale(1.5, true);
  } else if (name === 'corner') {
    window.__teleport(120, 100);
    applyDock('corner', true); // 应立刻闪现到右下角
  } else if (name === 'show') {
    const pool = pickWeighted();
    if (pool.length) playOnce(pool);
  } else if (name === 'swim') {
    stage.classList.add('swim', 'drag');
  }
};

if (!hasApi) {
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene) setTimeout(() => window.__devScene(scene), 350);
}

api.ready();































