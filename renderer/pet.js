'use strict';

const stage = document.getElementById('stage');
const petEl = document.getElementById('pet');
const hitEl = document.getElementById('hit');
const leanEl = document.getElementById('lean');
const vidEl = document.getElementById('petVid');
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
const chipEl = document.getElementById('chip');
const chipTime = document.getElementById('chip-time');
const fxEl = document.getElementById('fx');
const menuEl = document.getElementById('menu');
const menuPomo = document.getElementById('menu-pomo');
const menuUsage = document.getElementById('menu-usage');
const menuSleepIco = document.getElementById('menu-sleep-ico');
const menuSleepTxt = document.getElementById('menu-sleep-txt');

const isElectron = typeof window.pet !== 'undefined';
const api = isElectron ? window.pet : mockApi();

// 布局常量，与 style.css / index.html / main.js 保持一致
const PET = { x0: 76, y0: 144, x1: 224, y1: 312, cx: 150, cy: 228 };
const LEAN_MAX = 5;

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

const MEMES = {
  click: ['可爱', '哦鲸鲸', '厉害了我的鲸', '先养着吧', 'Ciallo'],
  feed: ['吃白饭的大肥鱼', '吃饱饱摸肚子', '就一碗'],
  hungry: ['压力一只大肥鱼', '就一碗', '死掉了'],
  sleep: ['深度睡眠'],
  ledger: ['token给妈妈保管', '厉害了我的鲸'],
  work: ['誓死践行开源精神', '鱼片有资源吗'],
  error: ['哪来的电脑病毒', '完蛋了把黄油删了'],
};

const FEED_LINES = ['大口！大口！', '这才是我要的白饭！', '白饭真香，比 Token 香', '谢谢款待，吃完就去干活（骗你的）', '再来一碗！就一点点！'];
const HUNGRY_LINES = ['白饭呢…我的白饭呢…', '（盯着你的 Token 咽口水）', '没白饭吃了，我要饿瘦了…', '工资还没结，先给我一碗白饭吧'];
const SLEEP_LINES = ['吃饱了…眯一会儿', '午睡时间，别叫我干活', '让我躺会儿，我是一条咸鱼（鲸）'];

const S = {
  satiety: 78,
  mood: 82,
  awake: true,
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

// ---------------------------------------------------------------- 预览兜底

function mockApi() {
  return {
    ready() {},
    reportPos() {},
    setMenuOpen() {},
    setDragging() {},
    updateStats() {},
    action() {},
    notify() {},
    quit() {},
    on() {
      return () => {};
    },
  };
}

// ---------------------------------------------------------------- 移动引擎

function bounds() {
  return { minX: -PET.x0, maxX: innerWidth - PET.x1, minY: -PET.y0, maxY: innerHeight - PET.y1 };
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
    if (P.swimTo) {
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
  applyLean(S.mouse.x, S.mouse.y);
  const t = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
  if (t !== lastTransform) {
    lastTransform = t;
    petEl.style.transform = t;
  }
  if (now - lastPosReport > 50) {
    lastPosReport = now;
    api.reportPos({ x: Math.round(P.x), y: Math.round(P.y) });
  }
  requestAnimationFrame(frame);
}

function clampInBounds() {
  const b = bounds();
  P.x = clamp(P.x, b.minX, b.maxX);
  P.y = clamp(P.y, b.minY, b.maxY);
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
  work: ['写代码', '工作状态-思考冒泡'],
  money: ['余额-数金皱眉', '余额-钱袋满溢'],
};

let curAnim = '';
let curNoMirror = false;
let oneShotPlaying = false;
let oneShotTimer = null;

function refreshFlip() {
  flipEl.classList.toggle('left', P.facing === 'left' && !curNoMirror);
}

function playAnim(pool, loop) {
  const name = Array.isArray(pool) ? pick(pool) : pool;
  if (name === curAnim) return;
  curAnim = name;
  curNoMirror = NO_MIRROR.has(name);
  refreshFlip();
  vidEl.loop = !!loop;
  vidEl.src = ANIM_DIR + name + '.webm';
  const pr = vidEl.play();
  if (pr && pr.catch) pr.catch(() => {});
}

function playOnce(pool) {
  clearTimeout(oneShotTimer);
  oneShotPlaying = true;
  playAnim(pool, false);
  const back = () => {
    if (!oneShotPlaying) return;
    oneShotPlaying = false;
    clearTimeout(oneShotTimer);
    applyBase();
  };
  const dur = (vidEl.duration || 6) * 1000;
  oneShotTimer = setTimeout(back, Math.min(12000, dur + 400));
  vidEl.onended = back;
}

// 闲时随机小节目：分类与权重参考 dsh-pet 的 animationWeights / categories 配置
const HAS = new Set(window.PET_ANIMS || []);
const ACTIONS = [
  { weight: 20, id: 'small', pool: ['悠闲哼歌','超大伸懒腰','原地敲击桌面互动','原地重力下蹲压缩','哈欠连天','女仆屈膝礼仪','被吓一跳','小幅度原地360度旋转展示','偷吃零食被抓住','用鲸鱼尾巴拍打地面','打瞌睡被惊醒','照镜子','整体换装试色','轻快记录','摇扇纳凉','晨间刷牙'] },
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

// 音效（来自 dsh-dafeiyu）
const SFX = {};
for (const [k, vol] of [['success', 0.35], ['error', 0.3]]) {
  const a = new Audio(`../assets/sounds/${k}.wav`);
  a.volume = vol;
  SFX[k] = a;
}
function sfx(name) {
  const a = SFX[name];
  if (!a) return;
  try {
    a.currentTime = 0;
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});
  } catch {
    /* 播放失败忽略 */
  }
}

// 每隔一段时间抽一个小节目（或在待机时碎碎念）
let nextShowAt = Date.now() + 20000 + Math.random() * 30000;
function maybeShow() {
  const now = Date.now();
  if (now < nextShowAt) return;
  nextShowAt = now + 30000 + Math.random() * 50000;
  if (oneShotPlaying || S.dragging || !S.awake || S.autoDoze || S.pomoRunning) return;
  if (Math.random() < 0.25) {
    const w = usable(WHISPERS);
    if (w.length) {
      playOnce(w);
      say(pick(QUIPS), 3600, 'click');
      return;
    }
  }
  const pool = pickWeighted();
  if (pool.length) playOnce(pool);
}

// 基础状态 -> 动画
function applyBase() {
  if (oneShotPlaying) return;
  if (S.dragging) return playAnim(ANIM.drag, true);
  if (!S.awake || S.autoDoze) return playAnim(ANIM.sleep, true);
  if (S.pomoRunning) return playAnim(ANIM.work, true);
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
    memeEl.src = `../assets/memes/${pick(pool)}.png`;
    memeEl.classList.remove('hide');
  } else {
    memeEl.classList.add('hide');
  }
  barsEl.classList.add('hide');
  bubbleEl.classList.add('show');
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}

function showStatus() {
  clearTimeout(S.bubbleTimer);
  let word = '今天状态不错哦～';
  if (S.satiety < 32) word = '白饭没吃饱，喂喂我嘛…';
  else if (S.mood > 85) word = '我心情超好的！';
  else if (S.mood < 40) word = '有点提不起劲…';
  bubbleText.textContent = word;
  barSat.style.width = `${Math.round(S.satiety)}%`;
  barMood.style.width = `${Math.round(S.mood)}%`;
  usageEl.classList.add('hide');
  barsEl.classList.remove('hide');
  bubbleEl.classList.add('show');
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), 6000);
}

// 白饭账本：白饭 = 你被烧掉的 Qoder credits
function showUsage(ledger) {
  const l = ledger || S.ledger;
  clearTimeout(S.bubbleTimer);
  bubbleText.textContent = l && l.available ? '这是你喂给我的白饭' : '还没找到白饭记录…';
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
  barsEl.classList.add('hide');
  usageEl.classList.remove('hide');
  bubbleEl.classList.add('show');
  S.bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), 9000);
  const tier = balanceTierPools();
  playOnce(tier.length ? tier : ANIM.money);
}

function creditsLine() {
  const l = S.ledger;
  if (!l || !l.available) return null;
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
    say(pick(FEED_LINES));
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

function setPomodoro(p) {
  const running = !!(p && p.running);
  const was = S.pomoRunning;
  if (!running && was) sfx('error');
  S.pomoRunning = running;
  stage.classList.toggle('focus', running);
  chipEl.classList.toggle('show', running);
  applyBase();
  if (running) {
    chipTime.textContent = fmtClock(p.remaining);
    if (!was) {
      const b = bounds();
      P.swimTo = { x: b.maxX - 30, y: b.maxY - 30 };
      P.target = null;
      P.pauseUntil = 0;
    }
  } else {
    P.swimTo = null;
  }
}

// ---------------------------------------------------------------- 右键菜单

let menuOpen = false;

function refreshMenu() {
  menuPomo.textContent = S.pomoRunning ? '🍅 结束专注' : '🍅 开始专注 25 分钟';
  menuSleepIco.textContent = S.awake ? '😴' : '☀️';
  menuSleepTxt.textContent = S.awake ? '让它睡一会儿' : '叫醒它';
  const l = S.ledger;
  menuUsage.textContent = l && l.available ? `🍚 白饭账本 · 本月 ${l.month}` : '🍚 白饭账本';
}

function openMenu(x, y) {
  refreshMenu();
  menuEl.classList.remove('hide');
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${clamp(x, 4, innerWidth - r.width - 8)}px`;
  menuEl.style.top = `${clamp(y, 4, innerHeight - r.height - 8)}px`;
  requestAnimationFrame(() => menuEl.classList.add('show'));
  menuOpen = true;
  api.setMenuOpen(true);
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuEl.classList.remove('show');
  setTimeout(() => {
    if (!menuOpen) menuEl.classList.add('hide');
  }, 160);
  api.setMenuOpen(false);
}

menuEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  closeMenu();
  if (act === 'status') showStatus();
  else api.action(act);
});

// ---------------------------------------------------------------- 指针交互

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
  if (S.moved < 6 && Date.now() - S.downAt < 500) {
    clearTimeout(S.quipTimer);
    S.quipTimer = setTimeout(() => {
      wake();
      S.mood = clamp(S.mood + 1, 0, 100);
      playOnce(ANIM.clicks);
      const line = Math.random() < 0.3 ? creditsLine() : null;
      say(line || pick(QUIPS), 3200, line ? 'ledger' : 'click');
      api.updateStats({ satiety: S.satiety, mood: S.mood });
    }, 230);
  }
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (S.dragging) return;
  if (hitTest(e.clientX, e.clientY)) openMenu(e.clientX, e.clientY);
  else closeMenu();
});

document.addEventListener('mousedown', (e) => {
  if (menuOpen && !e.target.closest('#menu')) closeMenu();
});

hitEl.addEventListener('dblclick', () => {
  clearTimeout(S.quipTimer);
  api.action('feed');
});

// ---------------------------------------------------------------- 主进程事件

api.on('init', (st) => {
  S.satiety = st.satiety;
  S.mood = st.mood;
  S.awake = st.awake;
  S.ledger = st.ledger || null;
  if (st.pomodoro && st.pomodoro.running) setPomodoro(st.pomodoro);
  const b = bounds();
  if (st.pos) {
    P.x = clamp(st.pos.x, b.minX, b.maxX);
    P.y = clamp(st.pos.y, b.minY, b.maxY);
  } else {
    P.x = b.maxX - 80;
    P.y = b.maxY - 60;
  }
  applyHungry();
  applyDoze();
  applyBase();
  const hi = creditsLine();
  setTimeout(() => say(hi ? `你好呀，我是蓝色大肥鱼～ ${hi}` : '你好呀，我是蓝色大肥鱼～', 4600), 700);
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
  if (!S.awake) say(pick(SLEEP_LINES), 2600, 'sleep');
});

api.on('bubble', (t) => say(t));

api.on('pomodoro', (p) => setPomodoro(p));

api.on('pomodoro-done', () => {
  setPomodoro({ running: false, remaining: 0 });
  P.swimTo = { x: innerWidth / 2 - PET.cx, y: innerHeight / 2 - PET.cy };
  playHappy();
  burstHearts(6);
  say('专注结束啦，起来动一动～', 5000);
});

api.on('show-status', showStatus);

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
    api.reportPos({ x: Math.round(P.x), y: Math.round(P.y) });
  }

  if (!S.awake) return;
  if (S.satiety < 32 && now - S.hungryAt > 6 * 60000) {
    S.hungryAt = now;
    say(pick(HUNGRY_LINES), 3200, 'hungry');
  }
  if (!S.autoDoze && !S.dragging && !S.pomoRunning && now - S.lastInteract > 100000) {
    S.autoDoze = true;
    applyDoze();
  }
  maybeShow();
}, 30000);

requestAnimationFrame(frame);

// 浏览器预览模式
if (!isElectron) {
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
    say(pick(HUNGRY_LINES));
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
  } else if (name === 'show') {
    const pool = pickWeighted();
    if (pool.length) playOnce(pool);
  } else if (name === 'swim') {
    stage.classList.add('swim', 'drag');
  }
};

if (!isElectron) {
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene) setTimeout(() => window.__devScene(scene), 350);
}

api.ready();
