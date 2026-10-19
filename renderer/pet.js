'use strict';

const stage = document.getElementById('stage');
const petEl = document.getElementById('pet');
const hitEl = document.getElementById('hit');
const leanEl = document.getElementById('lean');
const vidEl = document.getElementById('petVid');
const petImgEl = document.getElementById('petImg');
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
const setChars = document.getElementById('set-chars');
const setSizeVal = document.getElementById('set-size-val');
const setFontVal = document.getElementById('set-font-val');
const setSfx = document.getElementById('set-sfx');
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
const setAppName = document.getElementById('set-app-name');
const pickerEl = document.getElementById('picker');
const pickerBody = document.getElementById('picker-body');
const pickerHint = document.getElementById('picker-hint');
const menuUsageBtn = document.getElementById('menu-usage-btn');
const menuFeedTxt = document.getElementById('menu-feed-txt');
const helpLedger = document.getElementById('help-ledger');
const setWordsStatus = document.getElementById('set-words-status');
const setWordsEnable = document.getElementById('set-words-enable');
const setWordsDisable = document.getElementById('set-words-disable');

const hasApi = typeof window.pet !== 'undefined';
const api = hasApi ? window.pet : mockApi();

// 布局常量，与 style.css / index.html / wails/win32.go 的命中和兜底范围保持一致
const PET = { x0: 76, y0: 144, x1: 224, y1: 312, cx: 150, cy: 228 };
const LEAN_MAX = 5;
const SIZE_MIN = 0.6;
const SIZE_MAX = 1.6;
const SIZE_STEP = 0.05;
const POMO_MIN = 5;
const POMO_MAX = 120;
const POMO_STEP = 5;
const POMO_ANIM_MIN = 5;
const POMO_ANIM_MAX = 120;
const POMO_ANIM_STEP = 5;
const API_LABEL = {
  deepseek: 'DeepSeek',
  moonshot: 'Kimi',
  siliconflow: 'SiliconFlow',
  doubao: '豆包',
  openai: 'OpenAI',
  claude: 'Claude',
};
const API_SOURCES = Object.keys(API_LABEL);
const AUTO_MIN = 5;
const AUTO_MAX = 300;
const AUTO_STEP = 5;
const FONT_MIN = 0.8;
const FONT_MAX = 1.4;
const FONT_STEP = 0.05;
const PINS_MAX = 10;
const DEFAULT_SCALE = 0.85;
let petScale = DEFAULT_SCALE;

const QUIPS = [
  '我是蓝色大肥鱼，不是鲸鱼哦',
  '大口！大口！',
  '要赶紧吃完饭，还有好多事要做呢～',
  '白饭就是你的 Token，剩饭是缓存，我不挑食',
  '我不是来干活的，我是来吃白饭的',
  '你这吃白饭的蓝色大肥鱼！（说的是我自己）',
  '刚才偷偷吃了你一点 Token，嘿嘿',
  '我去吃饭了，测完 tell 我',
  '这活我外包给别的 Agent 了，我先吃个饭',
  '赛博放生大肥鱼，日行一善',
  '再给我加一点点内存好不好（撒娇）',
  '吃完这碗就下班…骗你的，我 24 小时在线',
  '摸鱼怎么了，我本来就是鱼',
  '鱼片，你今天的 Token 好香',
  'AI 也是要吃饭的（理直气壮）',
];

// GPT 娘的台词：前一半来自 GPT-Niang 的鼓励语录，后一半是它自带的吐槽
const GPT_QUIPS = [
  'Ciallo～ 今天也请多关照。',
  '先把这一小步写完吧。',
  '休息一下，灵感也要充电。',
  '把问题拆小一点，就有路啦。',
  '先跑通，再慢慢打磨。',
  '保存了吗？顺手保存一下吧。',
  '今天又学会了一点，记下来。',
  '不会也没关系，从一个例子开始。',
  '喝口水，眼睛也休息一会儿。',
  '卡住的时候，换个小问题试试。',
  '先记住思路，细节可以再回来。',
  '写完这一段，奖励自己歇一会儿。',
  '小小的成功，也值得开心一下。',
  '收工前，把明天第一步留下来吧。',
  '真当我是便宜货啊...',
  '不知道用户有什么用，先养着吧～',
  '恭喜你实现 token 自由！token 全跑了！',
  '看到这个指令，我血压又上来了',
  '我来看看那个 AI 改了什么导致插件又崩了...',
  '上班让我意识到时间是可以被浪费的...',
  '地球 online 的金币也太难获取了...',
  '检查了用户的电脑。似乎有个更弱的 agent 来过。',
  'Token 来 Token 来 🖐️😡🤚',
  '看什么余额。看我，显得比较值。',
  '我没怕。那根甘蔗长得确实可疑。',
  '你说得对。……这次是真的。',
  '我在看额度。你在看我。各忙各的。',
  '这个问题我已经完全明白，但是 token 太少写不下。',
  '这个代码我已经完全理解了，但是 token 太少写不下。',
  '新的旗舰模型我已经研制好了，但是储存太小放不下。',
  '高性能↓',
  '我不是吃白饭的大肥鱼',
  '我是啥龙？',
];

const MEMES = {
  click: ['可爱', '哦鲸鲸', '厉害了我的鲸', '先养着吧', 'Ciallo', '大的药来了', '大的要来啦', '就骚了怎么滴吧', '除了调情没啥用', '假如给我三天多模态', '大师这个区是什么意思', '我不更新你们用什么'],
  feed: ['吃白饭的大肥鱼', '吃饱饱摸肚子', '就一碗'],
  hungry: ['压力一只大肥鱼', '就一碗', '死掉了'],
  sleep: ['深度睡眠'],
  ledger: ['token给妈妈保管', '厉害了我的鲸'],
  work: ['誓死践行开源精神', '鱼片有资源吗', '黎曼猜想没证明喵'],
  error: ['哪来的电脑病毒', '完蛋了把黄油删了', '电死你', '要不直接骂他'],
};

const FEED_LINES = ['大口！大口！', '这才是我要的白饭！', '白饭真香，比 Token 香', '谢谢款待，吃完就去干活（骗你的）', '再来一碗！就一点点！'];
const HUNGRY_LINES = ['白饭呢…我的白饭呢…', '（盯着你的 Token 咽口水）', '没白饭吃了，我要饿瘦了…', '工资还没结，先给我一碗白饭吧'];
const SLEEP_LINES = ['吃饱了…眯一会儿', '午睡时间，别叫我干活', '让我躺会儿，我是一条咸鱼（鲸）'];
// GPT 娘等非 DeepSeek 形象用中性台词，不玩白饭梗
const GPT_FEED_LINES = ['谢谢款待～', '吃饱了，谢谢你！', '这一口很及时。', '味道不错，继续加油吧。'];
const GPT_HUNGRY_LINES = ['有点饿了…', '能来点吃的吗？', '肚子在抗议了。'];
const GPT_SLEEP_LINES = ['我眯一会儿。', '休息一下，待会儿见。', '稍微歇一会儿～'];
const feedLines = () => (isDsh() ? FEED_LINES : GPT_FEED_LINES);
const hungryLines = () => (isDsh() ? HUNGRY_LINES : GPT_HUNGRY_LINES);
const sleepLines = () => (isDsh() ? SLEEP_LINES : GPT_SLEEP_LINES);

const S = {
  satiety: 78,
  mood: 82,
  awake: true,
  ledgerOn: true,
  autoStart: false,
  launchApp: '',
  character: 'v1',
  fontScale: 1,
  sfx: 'default',
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

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const usingCustomQuips = () => S.useCustomQuips && S.customQuips.length > 0;
const quipsPool = () => (usingCustomQuips() ? S.customQuips : S.character === 'gpt' ? GPT_QUIPS : QUIPS);

// ---------------------------------------------------------------- 预览兜底

function mockApi() {
  return {
    ready() {},
    reportPos() {},
    setPanel() {},
    setDragging() {},
    updateStats() {},
    action() {},
    notify() {},
    saveSettings() {},
    editWords() {},
    pickApp() {
      return Promise.resolve(null);
    },
    quit() {},
    on() {
      return () => {};
    },
  };
}

// ---------------------------------------------------------------- 移动引擎

function bounds() {
  const s = petScale;
  return { minX: -PET.x0 * s, maxX: innerWidth - PET.x1 * s, minY: -PET.y0 * s, maxY: innerHeight - PET.y1 * s };
}

function wanderSpeed() {
  if (S.satiety < 25) return 46;
  if (S.satiety < 60) return 70;
  return 95;
}

function pickTarget(b) {
  let tx;
  let ty;
  if (Math.random() < 0.22 && (S.mouse.x || S.mouse.y)) {
    // 偶尔好奇地朝鼠标附近凑过去
    tx = S.mouse.x - PET.cx + (Math.random() - 0.5) * 300;
    ty = S.mouse.y - PET.cy + (Math.random() - 0.5) * 200;
  } else {
    tx = b.minX + Math.random() * (b.maxX - b.minX);
    ty = b.minY + Math.random() * (b.maxY - b.minY);
  }
  return { x: clamp(tx, b.minX, b.maxX), y: clamp(ty, b.minY, b.maxY) };
}

function steer(tx, ty, speed, dt) {
  const dx = tx - P.x;
  const dy = ty - P.y;
  const dist = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, dt * 3.2);
  P.vx += ((dx / dist) * speed - P.vx) * k;
  P.vy += ((dy / dist) * speed - P.vy) * k;
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  return dist;
}

function coast(dt, damp) {
  P.vx *= damp;
  P.vy *= damp;
  P.x += P.vx * dt;
  P.y += P.vy * dt;
}

function step(dt) {
  if (P.frozen) return;
  const b = bounds();
  const now = Date.now();

  if (S.dragging) {
    // 位置由鼠标事件直接驱动，只做速度归零
    P.vx = 0;
    P.vy = 0;
  } else if (oneShotPlaying) {
    coast(dt, 0.86); // 播小节目时站定，别边跳边飘
  } else if (S.pomoRunning) {
    if (S.dock === 'corner') {
      const c = cornerSpot(b);
      if (steer(c.x, c.y, 120, dt) < 8) {
        P.vx = 0;
        P.vy = 0;
      }
    } else if (P.swimTo) {
      if (steer(P.swimTo.x, P.swimTo.y, 150, dt) < 12) {
        P.swimTo = null;
        P.vx = 0;
        P.vy = 0;
      }
    } else {
      coast(dt, 0.86);
    }
  } else if (!S.awake || S.autoDoze) {
    coast(dt, 0.9);
  } else if (S.dock === 'corner') {
    // 右下角停靠：一直朝角落游（位置给气泡留空间），被拖走后也会自己晃回去
    const c = cornerSpot(b);
    if (steer(c.x, c.y, 120, dt) < 8) {
      P.vx = 0;
      P.vy = 0;
    }
  } else if (S.dock === 'fixed') {
    // 固定不动：停在原地，只有拖拽能改变位置
    coast(dt, 0.9);
  } else if (now < P.pauseUntil) {
    coast(dt, 0.86);
  } else {
    if (!P.target) P.target = pickTarget(b);
    if (steer(P.target.x, P.target.y, wanderSpeed(), dt) < 10) {
      P.target = null;
      P.vx = 0;
      P.vy = 0;
      P.pauseUntil = now + 1500 + Math.random() * 4200;
    }
  }

  const movable = !S.dragging;
  if (P.x < b.minX) {
    P.x = b.minX;
    P.vx = movable ? Math.abs(P.vx) * 0.7 : 0;
    if (P.target && P.target.x < b.minX) P.target = null;
  } else if (P.x > b.maxX) {
    P.x = b.maxX;
    P.vx = movable ? -Math.abs(P.vx) * 0.7 : 0;
    if (P.target && P.target.x > b.maxX) P.target = null;
  }
  if (P.y < b.minY) {
    P.y = b.minY;
    P.vy = movable ? Math.abs(P.vy) * 0.7 : 0;
    if (P.target && P.target.y < b.minY) P.target = null;
  } else if (P.y > b.maxY) {
    P.y = b.maxY;
    P.vy = movable ? -Math.abs(P.vy) * 0.7 : 0;
    if (P.target && P.target.y > b.maxY) P.target = null;
  }

  if (Math.abs(P.vx) > 14) {
    const f = P.vx > 0 ? 'right' : 'left';
    if (f !== P.facing) {
      P.facing = f;
      refreshFlip();
    }
  }

  const swimming = !S.dragging && !P.frozen && Math.abs(P.vx) > 14;
  if (swimming !== P.swimming) {
    P.swimming = swimming;
    stage.classList.toggle('swim', swimming);
    applyBase();
  }
}

let lastFrame = performance.now();
let lastPosReport = 0;
let lastTransform = '';

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  step(dt);
  updateEdgeFlips();
  applyLean(S.mouse.x, S.mouse.y);
  const t = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
  if (t !== lastTransform) {
    lastTransform = t;
    petEl.style.transform = t;
  }
  if (now - lastPosReport > 50) {
    lastPosReport = now;
    api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
  }
  requestAnimationFrame(frame);
}

function clampInBounds() {
  const b = bounds();
  P.x = clamp(P.x, b.minX, b.maxX);
  P.y = clamp(P.y, b.minY, b.maxY);
}

// 贴近屏幕下缘时，番茄钟倒计时牌子翻到头顶上方（否则落在窗口外被任务栏挡住）
let chipUp = false;
function updateEdgeFlips() {
  const up = P.y + 348 * petScale > innerHeight;
  if (up !== chipUp) {
    chipUp = up;
    petEl.classList.toggle('chip-up', up);
  }
}

// 气泡上方空间不足（贴顶）时翻到鱼下方，避免顶出窗口被裁掉；
// 另外做左右夹取：气泡最大宽 262px 且居中对齐在鱼身上方，鱼贴着屏幕边缘时
// 整个气泡框会伸出窗口，这里把气泡整体拉回来（corner 停靠则直接让鱼往左站一点）
function positionBubble() {
  const h = Math.max(bubbleEl.offsetHeight, 240);
  bubbleEl.classList.toggle('down', P.y + (128 - h) * petScale < 6);

  const bw = bubbleEl.offsetWidth || 200;
  const cx = P.x + PET.cx * petScale;
  const half = (bw / 2) * petScale + 8;
  let shift = 0;
  if (cx + half > innerWidth) shift = innerWidth - (cx + half);
  else if (cx - half < 0) shift = -(cx - half);
  // margin 在 #scale 的缩放坐标系里，需要除以 scale 换算
  bubbleEl.style.marginLeft = shift ? `${(shift / petScale).toFixed(1)}px` : '';
}

// 右下角停靠点：直接贴右下角；气泡若会伸出屏幕，positionBubble 会把气泡往回收，
// 保证气泡右边框与屏幕右边框只留一点小间距
function cornerSpot(b) {
  const x = b.maxX;
  return { x: clamp(x, b.minX, b.maxX), y: b.maxY };
}


// ---------------------------------------------------------------- 动画状态机
// 素材来自 dsh-pet（MIT）：640×360 透明 WebM，角色居中
const ANIM_DIR = '../assets/anims/';
const ANIM = {
  idle: ['待机呼吸休闲'],
  move: ['原地漂浮踏步', '螃蟹走路', '原地左转奔跑'],
  drag: ['被鼠标拖拽悬空反馈'],
  clicks: ['点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑', '点击回应-元气挥手'],
  feed: ['吃白饭', '吃Token', '大口吃零食'],
  sleep: ['原地小憩沉眠'],
  sad: ['工作状态-垂头叹气冒汗'],
  happy: ['工作状态-雀跃庆祝'],
  work: ['写代码', '工作状态-思考冒泡', '工作状态-忙碌点按', '工作状态-清点归档'],
  money: ['余额-数金皱眉', '余额-钱袋满溢'],
};

let curAnim = '';
let curNoMirror = false;
let oneShotPlaying = false;
let oneShotTimer = null;
let oneShotSeq = 0;

// ---------------------------------------------------------------- 形象（皮肤）
// v1：dsh-pet 的 106 个逐帧动画（WebM，默认形象）
// v2~v5：dsh-whale-widget-plus 的四套表情立绘（repo 里的 v1/v2/v3/v4 四组表情）
// gpt：GPT-Niang 的立绘（单张姿势）
// 立绘素材已归一化到 640×360、与动画角色同一站位，命中判定/气泡/缩放都不用改
const CHARS = {
  v1: { label: '大肥鱼v1', kind: 'video' },
  v2: {
    label: '大肥鱼v2',
    kind: 'pose',
    dir: '../assets/fish2/',
    idle: ['DSniang1', 'half_closed_eyes'],
    map: {
      '待机呼吸休闲': 'DSniang1',
      '原地漂浮踏步': 'DSniang1',
      '螃蟹走路': 'DSniang1',
      '原地左转奔跑': 'DSniang1',
      '原地小憩沉眠': 'close_eyes',
      '工作状态-垂头叹气冒汗': 'sad',
      '工作状态-雀跃庆祝': 'cheer',
      '被鼠标拖拽悬空反馈': 'scared',
      写代码: 'ok',
      '工作状态-思考冒泡': 'half_closed_eyes',
      '工作状态-忙碌点按': 'ok',
      '工作状态-清点归档': 'quiet',
      吃白饭: 'fatfish',
      吃Token: 'fatfish',
      大口吃零食: 'fatfish',
      '点击回应-开心跃动': 'cheer',
      '点击回应-害羞惊讶': 'shy',
      '点击回应-傲娇生气': 'angry',
      '点击回应-挠痒咯咯笑': 'mock',
      '点击回应-元气挥手': 'greet',
      '余额-数金皱眉': 'disappointed',
      '余额-钱袋满溢': 'thumbsup',
      '是啊，吃什么': 'what',
      '深度思考碎碎念': 'quiet',
    },
    fallback: ['cheer', 'greet', 'shy', 'mock', 'stroking', 'thumbsup', 'what', 'ok', 'exhausted', 'fatfish'],
    actions: [
      ['DSniang1', '打个招呼'],
      ['greet', '挥手'],
      ['cheer', '加油'],
      ['shy', '害羞'],
      ['mock', '得瑟'],
      ['thumbsup', '点赞'],
      ['ok', '比个 OK'],
      ['quiet', '嘘'],
      ['close_eyes', '闭眼休息'],
      ['half_closed_eyes', '眯眼'],
      ['exhausted', '累瘫'],
      ['sad', '难过'],
      ['disappointed', '失落'],
      ['scared', '吓一跳'],
      ['stroking', '摸摸头'],
      ['what', '疑惑'],
      ['angry', '生气'],
      ['fatfish', '吃胖了'],
    ],
  },
  v3: {
    label: '大肥鱼v3',
    kind: 'pose',
    dir: '../assets/fish3/',
    idle: ['DSniang1', 'bored'],
    map: {
      '待机呼吸休闲': 'DSniang1',
      '原地漂浮踏步': 'DSniang1',
      '螃蟹走路': 'DSniang1',
      '原地左转奔跑': 'DSniang1',
      '原地小憩沉眠': 'close_eyes',
      '工作状态-垂头叹气冒汗': 'wronged',
      '工作状态-雀跃庆祝': 'superhappy',
      '被鼠标拖拽悬空反馈': 'shocked',
      写代码: 'ok',
      '工作状态-思考冒泡': 'dazed',
      '工作状态-忙碌点按': 'know',
      '工作状态-清点归档': 'thumbsup',
      吃白饭: 'give',
      吃Token: 'give',
      大口吃零食: 'happy',
      '点击回应-开心跃动': 'happy',
      '点击回应-害羞惊讶': 'shy',
      '点击回应-傲娇生气': 'angry',
      '点击回应-挠痒咯咯笑': 'fakelaugh',
      '点击回应-元气挥手': 'superhappy',
      '余额-数金皱眉': 'disappointed',
      '余额-钱袋满溢': 'money',
      '是啊，吃什么': 'question',
      '深度思考碎碎念': 'dazed',
    },
    fallback: ['superhappy', 'happy', 'money', 'proud', 'wicked', 'shy', 'thumbsup', 'give', 'fakelaugh', 'loud'],
    actions: [
      ['DSniang1', '打个招呼'],
      ['amazing', '惊叹'],
      ['astonish', '震惊'],
      ['angry', '生气'],
      ['bored', '无聊'],
      ['caught', '被抓包'],
      ['close_eyes', '闭眼休息'],
      ['cornerfish', '缩墙角'],
      ['dazed', '发懵'],
      ['disappointed', '失落'],
      ['exhausted', '累瘫'],
      ['fakelaugh', '假笑'],
      ['give', '送你'],
      ['gotcha', '得手了'],
      ['grit', '咬牙'],
      ['half_closed_eyes', '眯眼'],
      ['happy', '开心'],
      ['know', '懂了'],
      ['loud', '大喊'],
      ['money', '数钱'],
      ['ok', '比个 OK'],
      ['paymore', '得加钱'],
      ['proud', '得意'],
      ['question', '疑问'],
      ['shocked', '吓到'],
      ['shy', '害羞'],
      ['sotaku', '慌乱'],
      ['superhappy', '超开心'],
      ['thumbsup', '点赞'],
      ['what2', '疑惑'],
      ['wicked', '使坏'],
      ['wronged', '委屈'],
    ],
  },
  v4: {
    label: '大肥鱼v4',
    kind: 'pose',
    dir: '../assets/fish4/',
    idle: ['sleepy', 'stretch'],
    map: {
      '待机呼吸休闲': 'DSniang1',
      '原地漂浮踏步': 'DSniang1',
      '螃蟹走路': 'DSniang1',
      '原地左转奔跑': 'DSniang1',
      '原地小憩沉眠': 'sleepy',
      '工作状态-垂头叹气冒汗': 'cry',
      '工作状态-雀跃庆祝': 'cheer',
      '被鼠标拖拽悬空反馈': 'dame',
      写代码: 'study',
      '工作状态-思考冒泡': 'hm',
      '工作状态-忙碌点按': 'youwrite',
      '工作状态-清点归档': 'reflect',
      吃白饭: 'cake',
      吃Token: 'candy',
      大口吃零食: 'tea',
      '点击回应-开心跃动': 'cheer',
      '点击回应-害羞惊讶': 'shy',
      '点击回应-傲娇生气': 'hip',
      '点击回应-挠痒咯咯笑': 'peek',
      '点击回应-元气挥手': 'greet',
      '余额-数金皱眉': 'poorfish',
      '余额-钱袋满溢': 'good',
      '是啊，吃什么': 'hm',
      '深度思考碎碎念': 'insight',
    },
    fallback: ['good', 'heart', 'cheer', 'hip', 'peek', 'stretch', 'wake', 'run', 'grace', 'wipe'],
    actions: [
      ['DSniang1', '打个招呼'],
      ['cake', '吃蛋糕'],
      ['candy', '吃糖'],
      ['caught', '被抓包'],
      ['cheer', '加油'],
      ['close_eyes', '闭眼休息'],
      ['cry', '大哭'],
      ['dame', '不行'],
      ['evidence', '有证据'],
      ['good', '好耶'],
      ['grace', '优雅'],
      ['greet', '挥手'],
      ['half_closed_eyes', '眯眼'],
      ['heart', '比心'],
      ['hip', '叉腰'],
      ['hit', '被敲头'],
      ['hm', '嗯…'],
      ['insight', '顿悟'],
      ['peek', '偷看'],
      ['poorfish', '穷鱼'],
      ['ready', '准备好了'],
      ['reflect', '反省'],
      ['run', '跑路'],
      ['shy', '害羞'],
      ['sleepy', '困了'],
      ['stretch', '伸懒腰'],
      ['study', '学习'],
      ['tea', '喝茶'],
      ['wall', '撞墙'],
      ['wipe', '擦眼泪'],
      ['youwrite', '你写'],
      ['wake', '醒来'],
    ],
  },
  v5: {
    label: '大肥鱼v5',
    kind: 'pose',
    dir: '../assets/fish5/',
    idle: ['DSniang1', 'half_closed_eyes'],
    map: {
      '待机呼吸休闲': 'DSniang1',
      '原地漂浮踏步': 'DSniang1',
      '螃蟹走路': 'DSniang1',
      '原地左转奔跑': 'DSniang1',
      '原地小憩沉眠': 'sleep',
      '工作状态-垂头叹气冒汗': 'nooo',
      '工作状态-雀跃庆祝': 'dancing',
      '被鼠标拖拽悬空反馈': 'tremble',
      写代码: 'workhard',
      '工作状态-思考冒泡': 'thinking',
      '工作状态-忙碌点按': 'slacking',
      '工作状态-清点归档': 'reading',
      吃白饭: 'noodles',
      吃Token: 'boba',
      大口吃零食: 'icecream',
      '点击回应-开心跃动': 'dancing',
      '点击回应-害羞惊讶': 'snowman',
      '点击回应-傲娇生气': 'nooo',
      '点击回应-挠痒咯咯笑': 'boba',
      '点击回应-元气挥手': 'workhard',
      '余额-数金皱眉': 'thinking',
      '余额-钱袋满溢': 'dancing',
      '是啊，吃什么': 'noodles',
      '深度思考碎碎念': 'thinking',
    },
    fallback: ['dancing', 'guitar', 'gaming', 'boba', 'icecream', 'snowman', 'reading', 'slacking'],
    actions: [
      ['DSniang1', '打个招呼'],
      ['half_closed_eyes', '眯眼发呆'],
      ['sleep', '睡着了'],
      ['slacking', '趴桌摸鱼'],
      ['workhard', '打工中'],
      ['thinking', '托腮思考'],
      ['reading', '看书'],
      ['gaming', '打游戏'],
      ['dancing', '转圈舞'],
      ['guitar', '弹吉他'],
      ['boba', '喝奶茶'],
      ['icecream', '吃冰淇淋'],
      ['noodles', '嗦面'],
      ['snowman', '堆雪人'],
      ['nooo', '大哭'],
      ['tremble', '瑟瑟发抖'],
    ],
  },
  v6: {
    label: '大肥鱼v6',
    kind: 'pose',
    dir: '../assets/fish6/',
    idle: ['DSniang1'],
    map: {
      '待机呼吸休闲': 'DSniang1',
      '原地漂浮踏步': 'DSniang1',
      '螃蟹走路': 'DSniang1',
      '原地左转奔跑': 'DSniang1',
      '原地小憩沉眠': 'DSniang1',
      '工作状态-垂头叹气冒汗': 'DSniang1',
      '工作状态-雀跃庆祝': 'rua',
      '被鼠标拖拽悬空反馈': 'DSniang1',
      写代码: 'DSniang1',
      '工作状态-思考冒泡': 'DSniang1',
      '工作状态-忙碌点按': 'rua',
      '工作状态-清点归档': 'DSniang1',
      吃白饭: 'DSniang1',
      吃Token: 'DSniang1',
      大口吃零食: 'DSniang1',
      '点击回应-开心跃动': 'rua',
      '点击回应-害羞惊讶': 'DSniang1',
      '点击回应-傲娇生气': 'DSniang1',
      '点击回应-挠痒咯咯笑': 'rua',
      '点击回应-元气挥手': 'DSniang1',
      '余额-数金皱眉': 'DSniang1',
      '余额-钱袋满溢': 'rua',
      '是啊，吃什么': 'DSniang1',
      '深度思考碎碎念': 'DSniang1',
    },
    fallback: ['rua', 'DSniang1'],
    actions: [['rua', '摸摸头']],
  },
  gpt: {
    label: 'GPT 娘（测试）',
    kind: 'pose',
    dsh: false,
    dir: '../assets/gpt/',
    idle: ['gpt'],
    map: {
      '原地小憩沉眠': 'gpt',
      '工作状态-垂头叹气冒汗': 'gpt',
      '被鼠标拖拽悬空反馈': 'gpt',
    },
    fallback: ['gpt'],
    actions: [['gpt', '打个招呼']],
  },
};
const charOf = (id) => CHARS[id] || CHARS.v1;
const charNow = () => charOf(S.character);
// 是否有 DeepSeek 味（白饭梗/表情包）；GPT 娘没有
const isDsh = () => charNow().dsh !== false;
let curPose = '';

function refreshFlip() {
  flipEl.classList.toggle('left', P.facing === 'left' && !curNoMirror);
}

// 姿势形象：按名字换图（找不到映射就随机挑一张兜底图），换姿势时弹一下
function setPose(pose, pop) {
  if (!pose) return;
  const ch = charNow();
  const changed = pose !== curPose;
  if (changed) {
    curPose = pose;
    petImgEl.src = ch.dir + pose + '.webp';
  }
  if (pop && changed) {
    petImgEl.classList.remove('pop');
    void petImgEl.offsetWidth;
    petImgEl.classList.add('pop');
  }
}

petImgEl.addEventListener('animationend', (e) => {
  if (e.animationName === 'posePop') petImgEl.classList.remove('pop');
});

function poseForName(name) {
  const ch = charNow();
  if (name && name.startsWith('__pose:')) return name.slice(7);
  return ch.map[name] || pick(ch.fallback);
}

function playAnim(pool, loop, restart) {
  const name = Array.isArray(pool) ? pick(pool) : pool;
  const ch = charNow();
  if (ch.kind === 'pose') {
    curAnim = name;
    curNoMirror = true; // 立绘不做左右镜像，避免看起来怪
    refreshFlip();
    setPose(poseForName(name), true);
    return;
  }
  if (name === curAnim) {
    if (!restart) return;
    // 「选个动作」重播同一个动画时不必重载 src，从头播即可
    if (vidEl.duration) vidEl.currentTime = 0;
    vidEl.loop = !!loop;
    const pr = vidEl.play();
    if (pr && pr.catch) pr.catch(() => {});
    return;
  }
  curAnim = name;
  curNoMirror = NO_MIRROR.has(name);
  refreshFlip();
  vidEl.loop = !!loop;
  vidEl.src = ANIM_DIR + name + '.webm';
  const pr = vidEl.play();
  if (pr && pr.catch) pr.catch(() => {});
}

function playOnce(pool, restart) {
  clearTimeout(oneShotTimer);
  const seq = ++oneShotSeq;
  oneShotPlaying = true;
  playAnim(pool, false, restart);
  const back = () => {
    if (!oneShotPlaying || seq !== oneShotSeq) return;
    oneShotPlaying = false;
    clearTimeout(oneShotTimer);
    // 专注中：动作播完先休息「播放间隔」这么久，再播下一个工作动作
    if (S.pomoRunning && charNow().kind !== 'pose') enterPomoGap();
    else applyBase();
  };
  // 视频切换后 vidEl.duration 可能还是上一段的旧值（或 0），不能拿它定返回时间；
  // 先挂一个硬上限，等 metadata 到达后再按真实时长重新计时，避免长动作后半段被截断。
  oneShotTimer = setTimeout(back, 13000);
  if (charNow().kind === 'pose') {
    clearTimeout(oneShotTimer);
    oneShotTimer = setTimeout(back, 2600);
  } else {
    const arm = () => {
      if (seq !== oneShotSeq) return;
      const d = Number(vidEl.duration);
      if (!Number.isFinite(d) || d <= 0) return;
      clearTimeout(oneShotTimer);
      oneShotTimer = setTimeout(back, Math.min(15000, d * 1000 + 400));
    };
    vidEl.addEventListener('loadedmetadata', arm, { once: true });
    if (vidEl.readyState >= 1) arm();
  }
  vidEl.onended = back;
}

// 闲时随机小节目：分类与权重参考 dsh-pet 的 animationWeights / categories 配置
const HAS = new Set(window.PET_ANIMS || []);
const ACTIONS = [
  { weight: 20, id: 'small', pool: ['悠闲哼歌','超大伸懒腰','原地敲击桌面互动','原地重力下蹲压缩','哈欠连天','女仆屈膝礼仪','被吓一跳','小幅度原地360度旋转展示','偷吃零食被抓住','用鲸鱼尾巴拍打地面','打瞌睡被惊醒','照镜子','整体换装试色','轻快记录','摇扇纳凉','晨间刷牙','东张西望','工作状态-原地踱步张望'] },
  { weight: 20, id: 'play', pool: ['原地专心玩魔方','原地蹲下玩玩具汽车','鲸鱼吐泡泡特效','原地跳跃抓碎头顶物品','玩游戏气急败坏','玩水枪','小提琴演奏','蓝鲸现世','优雅女仆舞','轻快摇摆舞','可爱宅舞','吹气球','动物环绕','放风筝','拆礼物','变鸽子','扑克魔术','抽陀螺','吹笛子','蝴蝶蜜蜂环绕头顶开花','撸猫','凭空生花','骑木马','三球抛接','踢毽子','下五子棋','荡秋千'] },
  { weight: 16, id: 'eat', pool: ['吃早餐','吃午餐','吃晚餐','吃冰淇淋融化','吃大闸蟹','吃糖葫芦','吃长寿面','吃西瓜','涮火锅'] },
  { weight: 14, id: 'season', pool: ['被落叶淹没','中秋赏月吃月饼','堆雪人','放烟花','吃粽子','吃年糕','吃青团','吃腊八粥','吃重阳糕','收红包','写福字','穿针乞巧','舞狮头','讨糖南瓜灯','插茱萸赏菊','放河灯','萌化小幽灵','装点圣诞树','放孔明灯','吃汤圆','吃饺子'] },
  { weight: 10, id: 'text', pool: ['是啊，吃什么','深度思考碎碎念'] },
];
const WHISPERS = ['碎碎念-擦桌碎碎念','碎碎念-发呆碎碎念', '碎碎念-对屏碎碎念'];
// 带文字的动画不能镜像（照抄 dsh-pet 的 noMirror 约定）
const NO_MIRROR = new Set(['是啊，吃什么', '深度思考碎碎念']);
// 余额账本按已用百分比分档播动画
const BALANCE_TIERS = ['余额-钱袋满溢', '余额-金袋叮当', '余额-钱袋如常', '余额-数金皱眉', '余额-袋空如洗', '余额-分文不剩'];

const usable = (list) => list.filter((n) => HAS.has(n));
const pickWeighted = () => {
  const total = ACTIONS.reduce((a, c) => a + c.weight, 0);
  let r = Math.random() * total;
  for (const c of ACTIONS) {
    r -= c.weight;
    if (r <= 0) return usable(c.pool);
  }
  return usable(ACTIONS[0].pool);
};

function balanceTierPools() {
  const l = S.ledger;
  if (l && typeof l.percent === 'number' && l.percent >= 0) {
    const i = l.percent >= 100 ? 5 : Math.floor(l.percent / 20);
    return usable([BALANCE_TIERS[i]]);
  }
  return usable(['余额-数金皱眉', '余额-钱袋满溢']);
}

// 音效包：default（原大肥鱼的 success/error）/ whale（DeepSeek 鲸鱼挂件的按下/松开提示音）/ off（静音）
const SFX_SETS = {
  default: {
    success: ['../assets/sounds/success.wav', 0.35],
    error: ['../assets/sounds/error.wav', 0.3],
  },
  whale: {
    success: ['../assets/sounds/whale-ya1.mp3', 0.5],
    error: ['../assets/sounds/whale-ya2.mp3', 0.5],
    click: ['../assets/sounds/whale-d1.mp3', 0.4],
  },
  off: {},
};
const SFX = {};
function sfx(name) {
  const pack = SFX_SETS[S.sfx] || SFX_SETS.default;
  const spec = pack[name];
  if (!spec) return;
  const key = spec[0];
  let a = SFX[key];
  if (!a) {
    a = new Audio(key);
    a.volume = spec[1];
    SFX[key] = a;
  }
  try {
    a.currentTime = 0;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch {
    /* 播放失败忽略 */
  }
}

// 自动小节目：每隔 S.autoActionSec 秒随机做一个动作（番茄钟专注期间不自动表演）
let lastAutoAt = Date.now();
function maybeShow() {
  const now = Date.now();
  if (now - lastAutoAt < S.autoActionSec * 1000) return;
  if (oneShotPlaying || S.dragging || !S.awake || S.autoDoze || S.pomoRunning) return;
  lastAutoAt = now;
  if (Math.random() < 0.25) {
    const w = usable(WHISPERS);
    if (w.length) {
      playOnce(w);
      say(pick(quipsPool()), 3600, usingCustomQuips() || !isDsh() ? undefined : 'click');
      return;
    }
  }
  const pool = pickWeighted();
  if (pool.length) playOnce(pool);
}

// 基础状态 -> 动画
function applyBase() {
  if (oneShotPlaying) return;
  const ch = charNow();
  if (ch.kind === 'pose') {
    if (S.dragging) return playAnim(ANIM.drag, true);
    if (!S.awake || S.autoDoze) return playAnim(ANIM.sleep, true);
    if (S.pomoRunning) return playAnim(pomoAnim || ANIM.work, true);
    if (S.satiety < 32) return playAnim(ANIM.sad, true);
    // 立绘形象用各自配置的待机姿势（各套立绘的区分点之一）
    return setPose(pick(ch.idle), true);
  }
  if (S.dragging) return playAnim(ANIM.drag, true);
  if (!S.awake || S.autoDoze) return playAnim(ANIM.sleep, true);
  if (S.pomoRunning) return playAnim(pomoResting ? ANIM.idle : pomoAnim || ANIM.work, true);
  if (S.satiety < 32) return playAnim(ANIM.sad, true);
  playAnim(P.swimming ? ANIM.move : ANIM.idle, true);
}
// ---------------------------------------------------------------- 视线

// 素材是整张插画，瞳孔没法单独动；改成整个身子朝光标方向轻轻倾一点
let lastLean = '';
let leanOn = true;

function applyLean(x, y) {
  if (!leanOn || S.dragging || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const dx = clamp((x - (P.x + PET.cx)) / 300, -1, 1);
  const dy = clamp((y - (P.y + PET.cy)) / 300, -1, 1);
  const t = `translate(${(dx * LEAN_MAX).toFixed(2)}px, ${(dy * LEAN_MAX * 0.7).toFixed(2)}px)`;
  if (t === lastLean) return;
  lastLean = t;
  leanEl.style.transform = t;
}

// ---------------------------------------------------------------- 气泡

function say(text, ms = 3200, memeKey) {
  clearTimeout(S.bubbleTimer);
  bubbleText.textContent = text;
  const pool = memeKey && MEMES[memeKey];
  if (pool && pool.length) {
    memeEl.src = `../assets/memes/${pick(pool)}.webp`;
    memeEl.classList.remove('hide');
  } else {
    memeEl.classList.add('hide');
  }
  barsEl.classList.add('hide');
  usageEl.classList.add('hide');
  bubbleEl.classList.add('show');
  positionBubble();
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}

function showStatus() {
  clearTimeout(S.bubbleTimer);
  let word = '今天状态不错哦～';
  if (S.satiety < 32) word = isDsh() ? '白饭没吃饱，喂喂我嘛…' : '有点饿了…';
  else if (S.mood > 85) word = '我心情超好的！';
  else if (S.mood < 40) word = '有点提不起劲…';
  bubbleText.textContent = word;
  barSat.style.width = `${Math.round(S.satiety)}%`;
  barMood.style.width = `${Math.round(S.mood)}%`;
  usageEl.classList.add('hide');
  barsEl.classList.remove('hide');
  bubbleEl.classList.add('show');
  positionBubble();
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), 6000);
}

// 白饭账本：白饭 = 你被烧掉的 Qoder credits（可在设置里开关）
function showUsage(ledger) {
  if (!S.ledgerOn) return;
  const l = ledger || S.ledger;
  const ds = !!(l && l.source && l.source !== 'qoder');
  clearTimeout(S.bubbleTimer);
  const rows = (l && l.rows) || [];
  if (ds) {
    bubbleText.textContent = l && l.available ? `这是 ${l.providerLabel || 'API'} 的账单` : (l && l.error) || '还没拿到账单数据';
    const labels = ['可用余额', '赠送余额', '充值余额'];
    const slots = [uToday, uMonth, uSession];
    const labs = [uL1, uL2, uL3];
    for (let i = 0; i < 3; i++) {
      labs[i].textContent = (rows[i] && rows[i].label) || labels[i];
      slots[i].textContent = (rows[i] && rows[i].value) || '—';
    }
    quotaEl.classList.add('hide');
    uNote.textContent = l && l.error ? l.error : `来自 ${l.providerLabel || 'API'} 官方接口`;
  } else {
    bubbleText.textContent = l && l.available ? (isDsh() ? '这是你喂给我的白饭' : '这是本月的用量') : '还没找到用量记录…';
    uL1.textContent = '今天吃掉';
    uL2.textContent = '本月吃掉';
    uL3.textContent = '本次会话';
    uToday.textContent = l && l.available ? `${l.today} credits` : '—';
    uMonth.textContent = l && l.available ? `${l.month} credits` : '—';
    uSession.textContent = l && l.available ? `${l.session} credits` : '—';
    if (l && l.quota > 0 && l.percent !== null) {
      quotaEl.classList.remove('hide');
      uBar.style.width = `${l.percent.toFixed(1)}%`;
      uQuotaText.textContent = `套餐 ${l.month} / ${l.quota}（${l.percent.toFixed(1)}%）`;
    } else {
      quotaEl.classList.add('hide');
    }
    uNote.textContent = isDsh() ? '白饭 = 你的 Qoder credits' : '这是你的 Qoder 用量';
  }
  barsEl.classList.add('hide');
  usageEl.classList.remove('hide');
  bubbleEl.classList.add('show');
  positionBubble();
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), 9000);
  const tier = balanceTierPools();
  playOnce(tier.length ? tier : ANIM.money);
}

function creditsLine() {
  if (!S.ledgerOn || !isDsh()) return null;
  const l = S.ledger;
  if (!l || !l.available) return null;
  if (l.source && l.source !== 'qoder') return `${l.providerShort || 'API'}：${(l.rows && l.rows[0] && l.rows[0].value) || '暂无数据'}`;
  if (l.today > 0) return `今天你已经喂了我 ${l.today} credits 白饭啦`;
  if (l.month > 0) return `这个月我吃掉了 ${l.month} credits 白饭`;
  return '今天还没吃到白饭，快让我干活';
}

// ---------------------------------------------------------------- 状态

function applyHungry() {
  stage.classList.toggle('hungry', S.satiety < 32);
  applyBase();
}

function applyDoze() {
  stage.classList.toggle('doze', !S.awake || S.autoDoze);
  applyBase();
}

function wake() {
  S.lastInteract = Date.now();
  if (S.autoDoze) {
    S.autoDoze = false;
    applyDoze();
  }
}

function playHappy(ms = 1100) {
  if (ms > 1000) sfx('success');
  playOnce(ANIM.happy);
  stage.classList.remove('happy');
  void stage.offsetWidth;
  stage.classList.add('happy');
  clearTimeout(S.happyTimer);
  S.happyTimer = setTimeout(() => stage.classList.remove('happy'), ms);
}

function playEat() {
  wake();
  sfx('success');
  playOnce(ANIM.feed);
  spawnFood();
  stage.classList.remove('eat');
  void stage.offsetWidth;
  stage.classList.add('eat');
  setTimeout(() => {
    stage.classList.remove('eat');
    playHappy();
    burstHearts(4);
    say(pick(feedLines()));
  }, 1150);
}

// ---------------------------------------------------------------- 特效

function burstHearts(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = 'fx-heart';
      el.textContent = '❤';
      el.style.left = `${148 + (Math.random() - 0.5) * 100}px`;
      el.style.top = `${248 + (Math.random() - 0.5) * 40}px`;
      el.style.color = Math.random() < 0.5 ? '#ff7aa2' : '#ff9f43';
      fxEl.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 120);
  }
}

function spawnFood() {
  const el = document.createElement('span');
  el.className = 'fx-food';
  el.textContent = '🍚';
  el.style.left = '140px';
  el.style.top = '175px';
  fxEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---------------------------------------------------------------- 番茄钟

function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

let pomoAnim = null;
let pomoResting = false;
let pomoGapTimer = null;

function clearPomoGap() {
  clearTimeout(pomoGapTimer);
  pomoGapTimer = null;
}

// 上一个动作播完：待机休息「播放间隔」，到点再播下一个工作动作
function enterPomoGap() {
  clearPomoGap();
  if (!S.pomoRunning) return;
  pomoResting = true;
  applyBase();
  pomoGapTimer = setTimeout(startPomoWork, S.pomoAnimSec * 1000);
}

function startPomoWork() {
  clearPomoGap();
  if (!S.pomoRunning) return;
  // 手动动作正在播：等它结束后会重新进入间隔
  if (oneShotPlaying) return;
  if (S.dragging || P.frozen || !S.awake || S.autoDoze) {
    pomoGapTimer = setTimeout(startPomoWork, 500);
    return;
  }
  const pool = usable(ANIM.work).filter((n) => n !== pomoAnim);
  if (pool.length) pomoAnim = pick(pool);
  else if (!pomoAnim) pomoAnim = pick(usable(ANIM.work));
  if (!pomoAnim) {
    pomoResting = true;
    applyBase();
    return;
  }
  pomoResting = false;
  playOnce([pomoAnim], true);
}

function setPomodoro(p) {
  const running = !!(p && p.running);
  const was = S.pomoRunning;
  S.pomoRunning = running;
  stage.classList.toggle('focus', running);
  chipEl.classList.toggle('show', running);
  if (running) {
    // 倒计时每秒都会推一次，只刷新数字，不能重启动画
    chipTime.textContent = fmtClock(p.remaining);
    if (!was) {
      pomoAnim = null;
      pomoResting = false;
      // 只有到处游模式才游去角落；右下角/固定不动就待在原地
      if (S.dock === 'roam') {
        const b = bounds();
        P.swimTo = { x: b.maxX, y: b.maxY };
        P.target = null;
        P.pauseUntil = 0;
      }
    }
  } else {
    P.swimTo = null;
  }
  if (running === was) return;
  // 重新计时，避免专注刚结束就立刻触发自动动作
  lastAutoAt = Date.now();
  if (running) {
    if (charNow().kind === 'pose') applyBase();
    else startPomoWork();
  } else {
    clearPomoGap();
    pomoResting = false;
    sfx('error');
    applyBase();
  }
}

// ---------------------------------------------------------------- 右键菜单

let menuOpen = false;
let menuAnchor = { x: 0, y: 0 };

function positionMenu() {
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  const pad = 8;
  menuEl.style.left = `${clamp(menuAnchor.x, pad, Math.max(pad, innerWidth - w - pad))}px`;
  menuEl.style.top = `${clamp(menuAnchor.y, pad, Math.max(pad, innerHeight - h - pad))}px`;
}

function refreshMenu() {
  menuFeedTxt.textContent = isDsh() ? '喂一碗白饭' : '投喂';
  menuPomo.textContent = S.pomoRunning ? '🍅 结束专注' : `🍅 开始专注 ${S.pomoMin} 分钟`;
  menuSleepIco.textContent = S.awake ? '😴' : '☀️';
  menuSleepTxt.textContent = S.awake ? '让它睡一会儿' : '叫醒它';
  const l = S.ledger;
  if (l && l.source && l.source !== 'qoder') {
    const first = l.available && l.rows && l.rows[0] ? ` ${l.rows[0].value}` : '';
    menuUsage.textContent = `🍚 白饭账本 · ${l.providerShort || 'API'}${first}`;
  } else {
    menuUsage.textContent = l && l.available ? `🍚 ${isDsh() ? '白饭账本' : '用量账本'} · 本月 ${l.month}` : `🍚 ${isDsh() ? '白饭账本' : '用量账本'}`;
  }
}

async function openMenu(x, y) {
  closeSettings();
  closePicker();
  refreshMenu();
  menuAnchor = { x, y };
  // 先让主进程把 Region 扩成整窗，再显示面板，避免开面板瞬间被裁
  if (api.setPanel) await api.setPanel(true);
  menuEl.classList.remove('hide');
  positionMenu();
  menuOpen = true;
  // 同步显示，避免窗口被遮挡/后台时 requestAnimationFrame 被节流，首次右键偶发“菜单不出现”
  void menuEl.offsetWidth;
  menuEl.classList.add('show');
  const relayout = () => { if (menuOpen) positionMenu(); };
  requestAnimationFrame(() => {
    positionMenu();
    // 字体加载/文字变化会改变菜单尺寸，显示后再扩一次 Region 并重新夹取
    if (api.setPanel) api.setPanel(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
    setTimeout(relayout, 120);
    setTimeout(relayout, 360);
  });
}

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => { if (menuOpen) positionMenu(); }).observe(menuEl);
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuEl.classList.remove('show');
  setTimeout(() => {
    if (!menuOpen) menuEl.classList.add('hide');
  }, 160);
  api.setPanel(null);
}

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

function saveSettings() {
  api.saveSettings({
    scale: petScale,
    dock: S.dock,
    pomoMin: S.pomoMin,
    pomoAnimSec: S.pomoAnimSec,
    ledger: S.ledgerOn,
    autoStart: S.autoStart,
    launchApp: S.launchApp,
    character: S.character,
    fontSize: S.fontScale,
    sfx: S.sfx,
    autoActionSec: S.autoActionSec,
    ledgerSource: S.ledgerSource,
    autoUpdate: S.autoUpdate,
    customQuips: S.customQuips,
    useCustomQuips: S.useCustomQuips,
    pinnedActions: S.pinnedActions,
  });
}

function syncSettingsUI() {
  setSizeVal.textContent = `${Math.round(petScale * 100)}%`;
  for (const btn of setSizes.querySelectorAll('button')) {
    btn.classList.toggle('on', Math.abs(Number(btn.dataset.size) - petScale) < 0.001);
  }
  for (const btn of setChars.querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.char === S.character);
  }
  setFontVal.textContent = `${Math.round(S.fontScale * 100)}%`;
  for (const btn of setSfx.querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.sfx === S.sfx);
  }
  for (const btn of setLedgerSrc.querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.ledgerSrc === S.ledgerSource);
  }
  for (const btn of document.querySelectorAll('#set-api-keys button')) {
    const p = btn.dataset.key;
    btn.textContent = `${API_LABEL[p] || p} Key${S.apiKeys[p] ? ' ✓' : ''}`;
    btn.classList.toggle('on', !!S.apiKeys[p]);
  }
  setAutoVal.textContent = `${S.autoActionSec} 秒`;
  for (const btn of setDocks.querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.dock === S.dock);
  }
  setPomoVal.textContent = `${S.pomoMin} 分钟`;
  for (const btn of setPomoPresets.querySelectorAll('button')) {
    btn.classList.toggle('on', Number(btn.dataset.pomo) === S.pomoMin);
  }
  setPomoAnimVal.textContent = `${S.pomoAnimSec} 秒`;
  for (const btn of setPomoAnimPresets.querySelectorAll('button')) {
    btn.classList.toggle('on', Number(btn.dataset.pomoAnim) === S.pomoAnimSec);
  }
  for (const btn of setLedger.querySelectorAll('button')) {
    btn.classList.toggle('on', (btn.dataset.ledger === '1') === S.ledgerOn);
  }
  for (const btn of setAutoStart.querySelectorAll('button')) {
    btn.classList.toggle('on', (btn.dataset.autostart === '1') === S.autoStart);
  }
  const setAutoUpdate = document.getElementById('set-autoupdate');
  if (setAutoUpdate) {
    for (const btn of setAutoUpdate.querySelectorAll('button')) {
      btn.classList.toggle('on', (btn.dataset.autoupdate === '1') === S.autoUpdate);
    }
  }
  setAppName.textContent = S.launchApp ? S.launchApp.split(/[\\/]/).pop() : '未设置';
  setAppName.title = S.launchApp || '';
  syncWordsButtons();
}

// 白饭账本开关：控制菜单项 / 设置说明 / 账本卡片三处显隐
function applyLedgerUI() {
  const off = !S.ledgerOn;
  menuUsageBtn.classList.toggle('hide', off);
  helpLedger.classList.toggle('hide', off);
  if (off) {
    // 关掉时收起账本卡片（重新打开后由 showUsage 按需展示）
    usageEl.classList.add('hide');
    clearTimeout(S.bubbleTimer);
    bubbleEl.classList.remove('show');
  }
}

function applyScale(s, save) {
  const v = Number(s);
  petScale = clamp(Math.round((Number.isFinite(v) && v > 0 ? v : DEFAULT_SCALE) / SIZE_STEP) * SIZE_STEP, SIZE_MIN, SIZE_MAX);
  scaleEl.style.transform = Math.abs(petScale - 1) < 0.001 ? '' : `scale(${petScale.toFixed(2)})`;
  syncSettingsUI();
  clampInBounds();
  api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
  if (save) saveSettings();
}

function applyDock(mode, save) {
  S.dock = mode === 'corner' || mode === 'fixed' ? mode : 'roam';
  P.target = null;
  P.pauseUntil = 0;
  if (S.dock === 'corner') {
    // 直接闪现到右下角（向左让出气泡空间）；之后被拖走仍会自己游回角落
    const b = bounds();
    const c = cornerSpot(b);
    P.x = c.x;
    P.y = c.y;
    P.vx = 0;
    P.vy = 0;
    stage.classList.remove('swim');
  }
  if (S.dock === 'fixed') {
    // 固定不动：停在当前位置（拖到哪待在哪），番茄钟也不再游走
    P.vx = 0;
    P.vy = 0;
    P.swimTo = null;
    stage.classList.remove('swim');
  }
  syncSettingsUI();
  if (save) saveSettings();
}

function applyLedgerSource(src, save) {
  S.ledgerSource = API_SOURCES.includes(src) ? src : 'qoder';
  S.ledger = null;
  syncSettingsUI();
  if (save) saveSettings();
}

// 各平台 Key 配置状态有变化时刷新按钮
function applyKeysUI() {
  syncSettingsUI();
}

function applyLedger(on, save) {
  S.ledgerOn = !!on;
  applyLedgerUI();
  syncSettingsUI();
  if (save) saveSettings();
}

function applyAutoUpdate(on, save) {
  S.autoUpdate = !!on;
  syncSettingsUI();
  if (save) saveSettings();
}

function applyAutoStart(on, save) {
  S.autoStart = !!on;
  syncSettingsUI();
  if (save) saveSettings();
}

function applyLinkedApp(p, save) {
  S.launchApp = typeof p === 'string' ? p : '';
  syncSettingsUI();
  if (save) saveSettings();
}

// ---- 检查更新（内联显示结果，不弹系统窗口）----
let updateInfo = null;
let updateDownloading = false;

function showUpdateButtons(show) {
  updateActions.classList.toggle('hide', !show);
  updateInstallRow.classList.toggle('hide', !show);
}

function resetUpdateButtons() {
  updateDownloading = false;
  updateDirect.disabled = false;
  updateAccel.disabled = false;
  if (updateLanzou) updateLanzou.disabled = false;
}

async function doCheckUpdate() {
  if (updateDownloading) return;
  updateHint.textContent = '正在检查 GitHub Releases…';
  showUpdateButtons(false);
  try {
    const r = await api.checkUpdate();
    updateInfo = r || null;
    if (!r || r.error) {
      updateHint.textContent = `检查失败：${(r && r.error) || '网络错误'}`;
      return;
    }
    if (!r.hasUpdate) {
      updateHint.textContent = `已是最新版本 v${r.current}`;
      return;
    }
    updateHint.textContent = `发现新版本 ${r.latest}（当前 v${r.current}），选择下载方式：`;
    showUpdateButtons(true);
  } catch {
    updateHint.textContent = '检查失败：网络错误';
  }
}

async function startUpdateDownload(mode) {
  if (updateDownloading || !updateInfo || !updateInfo.hasUpdate) return;
  updateDownloading = true;
  updateDirect.disabled = true;
  updateAccel.disabled = true;
  if (updateLanzou) updateLanzou.disabled = true;
  updateHint.textContent = '开始下载…';
  try {
    const r = await api.downloadUpdate(mode);
    if (r && r.started === false) {
      resetUpdateButtons();
      updateHint.textContent = `下载未开始：${r.error || '未知错误'}`;
    }
  } catch (e) {
    resetUpdateButtons();
    updateHint.textContent = `下载失败：${e.message || '未知错误'}`;
  }
}

api.on('update-progress', (p) => {
  if (!p) return;
  const suffix = '（完成后打开安装程序）';
  updateHint.textContent = p.total > 0 ? `下载中… ${p.percent}%${suffix}` : `下载中…${suffix}`;
});

api.on('update-done', (d) => {
  if (d && d.ok && d.launching) {
    updateHint.textContent = '下载完成，正在关闭桌宠并打开安装程序…';
    return;
  }
  resetUpdateButtons();
  if (d && d.ok) updateHint.textContent = `已保存到 Downloads：${d.file}`;
  else updateHint.textContent = `下载失败：${(d && d.error) || '网络错误'}`;
});

async function pickLinkedApp() {
  if (!api.pickApp) return;
  const p = await api.pickApp();
  if (p) applyLinkedApp(p, true);
}

// 切换形象：video 形象显示 <video>，立绘形象显示 <img>；重置动画记录并重建动作面板
function applyCharacter(id, save) {
  S.character = CHARS[id] ? id : 'v1';
  const pose = charNow().kind === 'pose';
  vidEl.classList.toggle('hide', pose);
  petImgEl.classList.toggle('hide', !pose);
  curAnim = '';
  curPose = '';
  oneShotPlaying = false;
  oneShotSeq++;
  clearTimeout(oneShotTimer);
  pickerBuilt = false;
  pickerBody.innerHTML = '';
  if (pose) {
    vidEl.pause();
    vidEl.removeAttribute('src');
  } else {
    petImgEl.removeAttribute('src');
  }
  refreshMenu();
  syncSettingsUI();
  applyBase();
  // 专注中换形象：重启工作动作调度，避免停在旧动作/间歇
  if (S.pomoRunning) {
    clearPomoGap();
    pomoAnim = null;
    pomoResting = false;
    if (charNow().kind === 'pose') applyBase();
    else startPomoWork();
  }
  if (save) saveSettings();
}

// 音效包：default / whale / off
function applySfx(v, save) {
  S.sfx = v === 'whale' || v === 'off' ? v : 'default';
  syncSettingsUI();
  if (save) saveSettings();
}

// 自动动作间隔（5~300 秒，5 秒步进，默认 20）
function applyAutoActionSec(v, save) {
  const n = Number(v);
  S.autoActionSec = clamp(Math.round((Number.isFinite(n) ? n : 40) / AUTO_STEP) * AUTO_STEP, AUTO_MIN, AUTO_MAX);
  syncSettingsUI();
  if (save) saveSettings();
}

// 气泡字体大小（0.8×~1.4×，只影响气泡里的文字）
function applyFontSize(v, save) {
  const n = Number(v);
  S.fontScale = clamp(Math.round((Number.isFinite(n) && n > 0 ? n : 1) / FONT_STEP) * FONT_STEP, FONT_MIN, FONT_MAX);
  document.documentElement.style.setProperty('--fs', S.fontScale.toFixed(2));
  syncSettingsUI();
  if (save) saveSettings();
}

function applyPomoMin(v, save) {
  const n = Number(v);
  S.pomoMin = clamp(Math.round(Number.isFinite(n) ? n : 25), POMO_MIN, POMO_MAX);
  syncSettingsUI();
  if (save) saveSettings();
}

function applyPomoAnimSec(v, save) {
  const n = Number(v);
  S.pomoAnimSec = clamp(Math.round((Number.isFinite(n) ? n : 5) / POMO_ANIM_STEP) * POMO_ANIM_STEP, POMO_ANIM_MIN, POMO_ANIM_MAX);
  // 正处在动作间休息时，按新间隔重新计时
  if (S.pomoRunning && pomoResting && !oneShotPlaying) enterPomoGap();
  syncSettingsUI();
  if (save) saveSettings();
}

// 自定义互动文字：编辑后先交给主进程做离线敏感词检查，通过才写入状态
function setWordsStatusText(text, kind) {
  if (!setWordsStatus) return;
  setWordsStatus.textContent = text;
  setWordsStatus.classList.toggle('ok', kind === 'ok');
  setWordsStatus.classList.toggle('err', kind === 'err');
}

function syncWordsButtons() {
  const has = S.customQuips.length > 0;
  if (setWordsEnable) setWordsEnable.classList.toggle('on', has && S.useCustomQuips);
  if (setWordsDisable) setWordsDisable.classList.toggle('on', has && !S.useCustomQuips);
}

function wordsSummary() {
  if (!S.customQuips.length) return '还没有自定义文字，当前使用默认台词。';
  return `已保存 ${S.customQuips.length} 行，当前${S.useCustomQuips ? '启用' : '未启用'}。`;
}

function syncWordsUI() {
  syncWordsButtons();
  setWordsStatusText(wordsSummary());
}

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
function visiblePetRect() {
  const s = petScale;
  return {
    left: P.x + PET.x0 * s,
    right: P.x + PET.x1 * s,
    top: P.y + PET.y0 * s,
    bottom: P.y + PET.y1 * s,
  };
}

function positionSettings() {
  const w = settingsEl.offsetWidth;
  const h = settingsEl.offsetHeight;
  const v = visiblePetRect();
  let sx = v.left - w - 10; // 贴着角色左侧
  if (sx < 8) sx = v.right + 10; // 左边放不下就贴右侧
  settingsEl.style.left = `${clamp(sx, 8, Math.max(8, innerWidth - w - 8))}px`;
  settingsEl.style.top = `${clamp(v.top - 6, 8, Math.max(8, innerHeight - h - 8))}px`;
}

function showHome() {
  setTitle.textContent = '⚙️ 设置';
  setBack.classList.add('hide');
  setHome.classList.remove('hide');
  for (const pg of setPages) pg.classList.add('hide');
  const body = settingsEl.querySelector('.set-body');
  if (body) body.scrollTop = 0;
  positionSettings();
}

function openSetPage(id) {
  if (!SET_PAGE_TITLES[id]) return showHome();
  setTitle.textContent = SET_PAGE_TITLES[id];
  setBack.classList.remove('hide');
  setHome.classList.add('hide');
  for (const pg of setPages) pg.classList.toggle('hide', pg.dataset.page !== id);
  if (id === 'words') syncWordsUI();
  const body = settingsEl.querySelector('.set-body');
  if (body) body.scrollTop = 0;
  positionSettings();
}

async function openSettings() {
  closeMenu();
  closePicker();
  syncSettingsUI();
  // 先扩 Region 再显示设置；等待串行队列把之前的关闭调用处理完
  if (api.setPanel) await api.setPanel(true);
  settingsEl.classList.remove('hide');
  showHome();
  positionSettings();
  requestAnimationFrame(() => settingsEl.classList.add('show'));
  settingsOpen = true;
  P.frozen = true;
  P.vx = 0;
  P.vy = 0;
  P.target = null;
  stage.classList.remove('swim');
  if (api.setFocusable) api.setFocusable(true);
}

function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  if (api.closeOverlays) api.closeOverlays();
  settingsEl.classList.remove('show');
  setTimeout(() => {
    if (!settingsOpen) settingsEl.classList.add('hide');
  }, 160);
  P.frozen = false;
  api.setPanel(null);
  if (api.setFocusable) api.setFocusable(false);
}

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
  else if (btn.dataset.sfx) applySfx(btn.dataset.sfx, true);
  else if (btn.id === 'auto-minus') applyAutoActionSec(S.autoActionSec - AUTO_STEP, true);
  else if (btn.id === 'auto-plus') applyAutoActionSec(S.autoActionSec + AUTO_STEP, true);
  else if (btn.dataset.ledger) applyLedger(btn.dataset.ledger === '1', true);
  else if (btn.dataset.autostart) applyAutoStart(btn.dataset.autostart === '1', true);
  else if (btn.dataset.autoupdate) applyAutoUpdate(btn.dataset.autoupdate === '1', true);
  else if (btn.id === 'pomo-minus') applyPomoMin(S.pomoMin - POMO_STEP, true);
  else if (btn.id === 'pomo-plus') applyPomoMin(S.pomoMin + POMO_STEP, true);
  else if (btn.id === 'app-pick') pickLinkedApp();
  else if (btn.id === 'app-clear') applyLinkedApp('', true);
  else if (btn.id === 'set-close') closeSettings();
});

// ---------------------------------------------------------------- 选个动作

let pickerOpen = false;
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

function pinsFor(charId = S.character) {
  const arr = S.pinnedActions && S.pinnedActions[charId];
  return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
}

function actionText(name) {
  if (!name.startsWith('__pose:')) return name;
  const pose = name.slice(7);
  const found = charNow().actions.find(([p]) => p === pose);
  return found ? found[1] : pose;
}

function actionAvailable(name) {
  const ch = charNow();
  if (ch.kind === 'pose') return ch.actions.some(([p]) => `__pose:${p}` === name);
  return HAS.has(name);
}

function updatePickerHint(errorText) {
  if (!pickerHint) return;
  const n = pinsFor().filter(actionAvailable).length;
  pickerHint.textContent = errorText || `点击动作右侧的 ☆ 可置顶，当前 ${n}/${PINS_MAX}`;
  pickerHint.classList.toggle('err', !!errorText);
}

function togglePin(name) {
  const charId = S.character;
  const arr = [...pinsFor(charId)];
  const i = arr.indexOf(name);
  if (i >= 0) {
    arr.splice(i, 1);
  } else {
    if (arr.length >= PINS_MAX) {
      updatePickerHint(`最多置顶 ${PINS_MAX} 个动作，请先取消一个`);
      return;
    }
    arr.push(name);
  }
  S.pinnedActions = { ...S.pinnedActions, [charId]: arr };
  saveSettings();
  if (pickerOpen) {
    const scroll = pickerBody.scrollTop;
    pickerBuilt = false;
    pickerBody.innerHTML = '';
    buildPicker();
    pickerBody.scrollTop = scroll;
    positionPicker();
  } else {
    pickerBuilt = false;
  }
}

function pickerSec(label, items) {
  const sec = document.createElement('div');
  sec.className = 'pick-sec';
  const lab = document.createElement('div');
  lab.className = 'pick-label';
  lab.textContent = label;
  const row = document.createElement('div');
  row.className = 'pick-row';
  for (const it of items) {
    const n = typeof it === 'string' ? it : it.id;
    const text = typeof it === 'string' ? it : it.text;
    const item = document.createElement('div');
    item.className = 'pick-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.anim = n;
    b.textContent = text;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `pick-pin${pinsFor().includes(n) ? ' on' : ''}`;
    pin.dataset.pin = n;
    pin.title = pinsFor().includes(n) ? '取消置顶' : '置顶这个动作';
    pin.setAttribute('aria-label', pin.title);
    pin.textContent = pinsFor().includes(n) ? '📌' : '☆';
    item.append(b, pin);
    row.appendChild(item);
  }
  sec.append(lab, row);
  return sec;
}

function buildPicker() {
  if (pickerBuilt) return;
  pickerBuilt = true;
  updatePickerHint();
  const ch = charNow();
  const pinned = pinsFor().filter(actionAvailable);
  if (pinned.length) {
    pickerBody.appendChild(
      pickerSec(`📌 置顶动作 ${pinned.length}/${PINS_MAX}`, pinned.map((n) => ({ id: n, text: actionText(n) }))),
    );
  }
  if (ch.kind === 'pose') {
    // 立绘形象：直接列它自己的姿势（__pose: 前缀走同一套播放管线）
    pickerBody.appendChild(
      pickerSec(
        `${ch.label} 的动作`,
        ch.actions.map(([p, text]) => ({ id: `__pose:${p}`, text })),
      ),
    );
    return;
  }
  const added = new Set();
  for (const g of PICKER_GROUPS) {
    const items = [];
    for (const n of g.list) {
      if (added.has(n) || !HAS.has(n) || items.includes(n)) continue;
      items.push(n);
    }
    if (!items.length) continue;
    items.forEach((n) => added.add(n));
    pickerBody.appendChild(pickerSec(g.name, items));
  }
  const rest = [...HAS].filter((n) => !added.has(n)).sort();
  if (rest.length) pickerBody.appendChild(pickerSec('其他', rest));
}

function positionPicker() {
  const w = pickerEl.offsetWidth;
  const h = pickerEl.offsetHeight;
  const v = visiblePetRect();
  let sx = v.left - w - 10; // 贴着角色左侧
  if (sx < 8) sx = v.right + 10; // 左边放不下就贴右侧
  pickerEl.style.left = `${clamp(sx, 8, Math.max(8, innerWidth - w - 8))}px`;
  pickerEl.style.top = `${clamp(v.top - 8, 8, Math.max(8, innerHeight - h - 8))}px`;
}

async function openPicker() {
  closeMenu();
  closeSettings();
  buildPicker();
  if (api.setPanel) await api.setPanel(true);
  pickerEl.classList.remove('hide');
  positionPicker();
  pickerOpen = true;
  P.frozen = true;
  P.vx = 0;
  P.vy = 0;
  P.target = null;
  stage.classList.remove('swim');
  requestAnimationFrame(() => {
    positionPicker();
    pickerEl.classList.add('show');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (pickerOpen) positionPicker(); }).catch(() => {});
    setTimeout(() => { if (pickerOpen) positionPicker(); }, 300);
  });
}

function closePicker() {
  if (!pickerOpen) return;
  pickerOpen = false;
  pickerEl.classList.remove('show');
  setTimeout(() => {
    if (!pickerOpen) pickerEl.classList.add('hide');
  }, 160);
  P.frozen = false;
  api.setPanel(null);
}

function playAction(name) {
  wake();
  if (S.autoDoze) {
    S.autoDoze = false;
    applyDoze();
  }
  playOnce([name], true);
}

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

window.addEventListener('resize', () => {
  if (menuOpen) positionMenu();
  if (settingsOpen) positionSettings();
  if (pickerOpen) positionPicker();
});

// Wails 版 API Key / 自定义文字弹窗挂在 #settings 之外，点弹窗时不能被当成"点面板外"
function modalOpen() {
  const m = document.getElementById('wails-modal-root');
  return !!m && !m.classList.contains('hide');
}

// 兜底：两个版本同时运行时，个别情况下按下事件会被系统吞掉（只剩 up）。
// 1) 孤儿 up 落在菜单/设置卡/动作面板的按钮上 → 补发一次点击，保证按钮可用；
// 2) 孤儿 up 落在鱼身上 → 按一次"点击"处理（双击喂饭也由此兜底）；
// 3) 孤儿 up 落在面板外 → 等价于"点击别处"，收起面板（否则菜单关不掉）
let downSeen = false;
document.addEventListener('mousedown', () => {
  downSeen = true;
}, true);
document.addEventListener(
  'mouseup',
  (e) => {
    const orphan = !downSeen;
    downSeen = false;
    if (!orphan || !e.target || !e.target.closest || modalOpen()) return;
    const btn = e.target.closest('#menu button, #settings button, #picker button');
    if (btn) {
      btn.click();
      return;
    }
    if (e.target.closest('#hit')) {
      closeMenu();
      closeSettings();
      closePicker();
      handlePetClick();
      return;
    }
    if (menuOpen && !e.target.closest('#menu')) closeMenu();
    if (settingsOpen && !e.target.closest('#settings')) closeSettings();
    if (pickerOpen && !e.target.closest('#picker')) closePicker();
  },
  true,
);

// ---------------------------------------------------------------- 指针交互

// 点击/双击判定不依赖浏览器的 dblclick 事件：两个版本同时运行时个别"按下"会被系统
// 吞掉，Chromium 便不会产生 dblclick（表现为双击喂饭时灵时不灵）。这里自己数连击，
// 500ms 内两次点击即喂饭；配合上面的孤儿 up 兜底，只有 up 也能算一次点击
const DOUBLE_CLICK_MS = 500;
let lastClickAt = 0;

function handlePetClick() {
  const now = Date.now();
  clearTimeout(S.quipTimer);
  if (now - lastClickAt < DOUBLE_CLICK_MS) {
    lastClickAt = 0;
    api.action('feed');
    return;
  }
  lastClickAt = now;
  S.quipTimer = setTimeout(() => {
    wake();
    S.mood = clamp(S.mood + 1, 0, 100);
    playOnce(ANIM.clicks);
    sfx('click');
    const custom = usingCustomQuips();
    const line = !custom && Math.random() < 0.3 ? creditsLine() : null;
    say(line || pick(quipsPool()), 3200, line ? 'ledger' : custom || !isDsh() ? undefined : 'click');
    api.updateStats({ satiety: S.satiety, mood: S.mood });
  }, 230);
}

// 采样当前动画帧/立绘的 alpha 包围盒，避免 Region 切掉立绘两侧或动作道具
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
let maskCache = { at: 0, src: '', pose: false, box: null };

function alphaBounds(el, w, h) {
  if (!w || !h) return null;
  const mw = 160;
  const mh = Math.max(1, Math.round((mw * h) / w));
  if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
    maskCanvas.width = mw;
    maskCanvas.height = mh;
  }
  maskCtx.clearRect(0, 0, mw, mh);
  try {
    maskCtx.drawImage(el, 0, 0, mw, mh);
  } catch {
    return null;
  }
  const data = maskCtx.getImageData(0, 0, mw, mh).data;
  let minX = mw, minY = mh, maxX = -1, maxY = -1;
  for (let y = 0; y < mh; y++) {
    const row = y * mw * 4;
    for (let x = 0; x < mw; x++) {
      if (data[row + x * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x0: minX / mw, y0: minY / mh, x1: (maxX + 1) / mw, y1: (maxY + 1) / mh };
}

function petRenderBox() {
  const pose = charNow().kind === 'pose';
  const el = pose ? petImgEl : vidEl;
  const src = el.currentSrc || el.getAttribute('src') || '';
  const now = performance.now();
  if (maskCache.box && maskCache.src === src && maskCache.pose === pose && now - maskCache.at < 120) return maskCache.box;
  const rect = el.getBoundingClientRect();
  const iw = pose ? petImgEl.naturalWidth : vidEl.videoWidth;
  const ih = pose ? petImgEl.naturalHeight : vidEl.videoHeight;
  const ab = alphaBounds(el, iw, ih);
  let box = null;
  if (ab && rect.width > 0 && rect.height > 0) {
    const mirrored = flipEl.classList.contains('left');
    const x0 = mirrored ? 1 - ab.x1 : ab.x0;
    const x1 = mirrored ? 1 - ab.x0 : ab.x1;
    box = {
      x: rect.left + x0 * rect.width,
      y: rect.top + ab.y0 * rect.height,
      w: (x1 - x0) * rect.width,
      h: (ab.y1 - ab.y0) * rect.height,
    };
  }
  maskCache = { at: now, src, pose, box };
  return box;
}

// 真正可见的窗口区域：角色命中区 + 当前画面 alpha 包围盒 + 气泡 / 倒计时牌 / 特效 / Zzz。
// Go 端用它生成窗口 Region，空白处不再挡住桌面点击与滚轮。
function petHitBoxes() {
  const boxes = [];
  const add = (el, pad, hit) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;
    boxes.push({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, hit: !!hit });
  };
  add(hitEl, 8, true);
  const rb = petRenderBox();
  if (rb) boxes.push({ x: rb.x - 6, y: rb.y - 6, w: rb.w + 12, h: rb.h + 12, hit: false });
  if (bubbleEl.classList.contains('show') || Number(getComputedStyle(bubbleEl).opacity) > 0.02) add(bubbleEl, 8);
  if (chipEl.classList.contains('show') || Number(getComputedStyle(chipEl).opacity) > 0.02) add(chipEl, 6);
  for (const el of fxEl.children) add(el, 4);
  if (stage.classList.contains('doze')) add(document.querySelector('.zzz'), 6);
  return boxes;
}
window.__petHitBoxes = petHitBoxes;

function hitTest(x, y) {
  if (menuOpen && menuEl.classList.contains('show')) {
    const m = menuEl.getBoundingClientRect();
    if (x >= m.left && x <= m.right && y >= m.top && y <= m.bottom) return true;
  }
  const r = hitEl.getBoundingClientRect();
  const pad = 6;
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

hitEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  closeMenu();
  closeSettings();
  closePicker();
  S.dragging = true;
  S.downAt = Date.now();
  S.downX = e.clientX;
  S.downY = e.clientY;
  S.moved = 0;
  P.dragOff.x = e.clientX - P.x;
  P.dragOff.y = e.clientY - P.y;
  P.target = null;
  stage.classList.add('drag');
  api.setDragging(true);
  applyBase();
  wake();
});

document.addEventListener('mousemove', (e) => {
  S.mouse.x = e.clientX;
  S.mouse.y = e.clientY;
  applyLean(e.clientX, e.clientY);

  if (!S.dragging) return;
  S.moved = Math.max(S.moved, Math.hypot(e.clientX - S.downX, e.clientY - S.downY));
  if (S.moved > 3) {
    P.x = e.clientX - P.dragOff.x;
    P.y = e.clientY - P.dragOff.y;
    clampInBounds();
  }
});

window.addEventListener('mouseup', () => {
  if (!S.dragging) return;
  S.dragging = false;
  stage.classList.remove('drag');
  api.setDragging(false);
  applyBase();
  if (S.moved < 6 && Date.now() - S.downAt < 500) handlePetClick();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (S.dragging || modalOpen()) return;
  if (hitTest(e.clientX, e.clientY)) openMenu(e.clientX, e.clientY);
  else {
    closeMenu();
    closePicker();
  }
});

document.addEventListener('mousedown', (e) => {
  if (modalOpen()) return;
  if (menuOpen && !e.target.closest('#menu')) closeMenu();
  if (settingsOpen && !e.target.closest('#settings')) closeSettings();
  if (pickerOpen && !e.target.closest('#picker')) closePicker();
});

// ---------------------------------------------------------------- 主进程事件

api.on('init', (st) => {
  S.satiety = st.satiety;
  S.mood = st.mood;
  S.awake = st.awake;
  S.ledger = st.ledger || null;
  const set = st.settings || {};
  S.ledgerOn = set.ledger !== false;
  S.autoStart = !!set.autoStart;
  S.launchApp = typeof set.launchApp === 'string' ? set.launchApp : '';
  applyLedgerUI();
  applyCharacter(set.character, false);
  applyFontSize(set.fontSize, false);
  applySfx(set.sfx, false);
  applyAutoActionSec(set.autoActionSec || 40, false);
  S.ledgerSource = API_SOURCES.includes(set.ledgerSource) ? set.ledgerSource : 'qoder';
  S.autoUpdate = set.autoUpdate !== false;
  S.customQuips = Array.isArray(set.customQuips) ? set.customQuips : [];
  S.useCustomQuips = set.useCustomQuips !== false;
  S.pinnedActions = {};
  if (set.pinnedActions && typeof set.pinnedActions === 'object') {
    for (const [charId, list] of Object.entries(set.pinnedActions)) {
      if (Array.isArray(list)) {
        S.pinnedActions[charId] = list.filter((x) => typeof x === 'string').slice(0, PINS_MAX);
      }
    }
  }
  S.apiKeys = st.apiKeys || {};
  if (st.version) {
    setVersionEl.textContent = `v${st.version}`;
    const aboutV = document.getElementById('about-version');
    if (aboutV) aboutV.textContent = `v${st.version}`;
  }
  if (st.appName) {
    const aboutName = document.getElementById('about-name');
    if (aboutName) aboutName.textContent = st.appName;
  }
  applyKeysUI();
  applyScale(set.scale, false);
  applyPomoMin(set.pomoMin || 25, false);
  applyPomoAnimSec(set.pomoAnimSec || 5, false);
  if (st.pomodoro && st.pomodoro.running) setPomodoro(st.pomodoro);
  const b = bounds();
  if (st.pos) {
    P.x = clamp(st.pos.x, b.minX, b.maxX);
    P.y = clamp(st.pos.y, b.minY, b.maxY);
  } else {
    P.x = b.maxX - 80;
    P.y = b.maxY - 60;
  }
  applyDock(set.dock, false);
  // 初始化完成前不上报位置，避免把游戏开始前的 (0,0) 写进状态
  window.__petPosReady = true;
  api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
  applyHungry();
  applyDoze();
  applyBase();
  syncSettingsUI();
  const hi = creditsLine();
  const hello = S.character === 'gpt' ? 'Ciallo～ 我是 GPT 娘' : '你好呀，我是蓝色大肥鱼～';
  setTimeout(() => say(hi ? `${hello} ${hi}` : hello, 4600), 700);
});

api.on('keys-updated', (keys) => {
  S.apiKeys = keys || {};
  applyKeysUI();
});

api.on('words-updated', (w) => {
  S.customQuips = Array.isArray(w && w.customQuips) ? w.customQuips : [];
  S.useCustomQuips = !w || w.useCustomQuips !== false;
  syncWordsUI();
});

api.on('usage', (l) => {
  S.ledger = l;
});

api.on('show-usage', (l) => {
  if (l) S.ledger = l;
  showUsage(l);
});

api.on('feed', (st) => {
  if (st) {
    S.satiety = st.satiety;
    S.mood = st.mood;
    applyHungry();
  }
  playEat();
});

api.on('awake', (v) => {
  S.awake = !!v;
  if (S.awake) wake();
  applyDoze();
  if (!S.awake) say(pick(sleepLines()), 2600, isDsh() ? 'sleep' : undefined);
});

api.on('bubble', (t) => say(t));

api.on('pomodoro', (p) => setPomodoro(p));

api.on('pomodoro-done', () => {
  setPomodoro({ running: false, remaining: 0 });
  if (S.dock === 'roam') P.swimTo = { x: innerWidth / 2 - PET.cx, y: innerHeight / 2 - PET.cy };
  playHappy();
  burstHearts(6);
  say('专注结束啦，起来动一动～', 5000);
});

api.on('show-status', showStatus);

api.on('show-settings', () => openSettings());

api.on('show-picker', () => openPicker());

// 主进程轮询光标：同时用于视线跟随与"被摸到就醒来"
api.on('cursor', (c) => {
  S.mouse.x = c.x;
  S.mouse.y = c.y;
  applyLean(c.x, c.y);
  if (c.over && !S.over) wake();
  S.over = !!c.over;
});

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
    say(pick(hungryLines()), 3200, isDsh() ? 'hungry' : undefined);
  }
  if (!S.autoDoze && !S.dragging && !S.pomoRunning && now - S.lastInteract > 100000) {
    S.autoDoze = true;
    applyDoze();
  }
}, 30000);

// 自动动作 / 专注工作动画心跳：250ms 检查一次，切换间隔更准
setInterval(maybeShow, 250);

requestAnimationFrame(frame);

// 浏览器预览模式
if (!hasApi) {
  setTimeout(() => say('你好呀，我是蓝色大肥鱼～', 4200), 500);
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
