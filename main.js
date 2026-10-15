'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const usageLedger = require('./usage');

const FOCUS_MS = 25 * 60 * 1000;
const DEFAULT_STATE = { satiety: 78, mood: 82, pos: null, awake: true };

// 与渲染层 PET 常量保持一致：角色可见区域（#pet 局部坐标）
const PET = { x0: 76, y0: 144, x1: 224, y1: 312 };
const HIT_PAD = 6;
const CURSOR_POLL_MS = 30;

const argv = process.argv.slice(1);
const DEV_SHOT = argv.includes('--dev-shot');
const DEV_INPUT = argv.includes('--dev-input');
const DEV_CPU = argv.includes('--dev-cpu');
const DEV_SCENE = (argv.find((a) => a.startsWith('--dev-scene=')) || '').split('=')[1] || 'idle';

// 打包后没有控制台，崩溃与启动参数落一份日志到临时目录，便于排查
function crashLog(kind, err) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('temp'), 'dafeiyu-error.log'),
      `[${new Date().toISOString()}] ${kind}: ${(err && err.stack) || err}
`,
    );
  } catch {
    /* 日志写不进去就算了 */
  }
}
process.on('uncaughtException', (e) => crashLog('uncaught', e));
process.on('unhandledRejection', (e) => crashLog('rejection', e));

let win = null;
let tray = null;
let state = { ...DEFAULT_STATE };
const pomo = { running: false, endsAt: 0, ticker: null };
let ledger = null;

// 鼠标穿透判定状态：渲染层上报鱼的位置，主进程轮询光标做命中测试
const pet = { x: 0, y: 0, initialized: false };
let interactive = false;
let menuOpen = false;
let dragging = false;
let savedPosAt = 0;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const send = (ch, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, payload);
};

// --------------------------------------------------------------------------
// 状态持久化
// --------------------------------------------------------------------------

const statePath = () => path.join(app.getPath('userData'), 'dafeiyu-state.json');

function loadState() {
  try {
    state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(statePath(), 'utf8')) };
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function saveStateNow() {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch {
    /* 忽略写入失败 */
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStateNow, 500);
}

// --------------------------------------------------------------------------
// 窗口：铺满工作区的透明置顶画布，鱼在画布内游动
// --------------------------------------------------------------------------

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function createWindow() {
  const wa = workArea();
  win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    title: '蓝色大肥鱼',
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

function syncBounds() {
  if (!win || win.isDestroyed()) return;
  const wa = workArea();
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
}

function toggleVisible() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

// --------------------------------------------------------------------------
// 鼠标穿透：轮询光标位置，命中鱼身（或菜单/拖拽中）时才让窗口接收鼠标
// --------------------------------------------------------------------------

let lastCursor = { x: NaN, y: NaN };

function cursorTick() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const wa = workArea();
  const p = screen.getCursorScreenPoint();
  const wx = p.x - wa.x;
  const wy = p.y - wa.y;
  const moved = wx !== lastCursor.x || wy !== lastCursor.y;

  const over =
    pet.initialized &&
    wx >= pet.x + PET.x0 - HIT_PAD &&
    wx <= pet.x + PET.x1 + HIT_PAD &&
    wy >= pet.y + PET.y0 - HIT_PAD &&
    wy <= pet.y + PET.y1 + HIT_PAD;

  const want = over || menuOpen || dragging;
  if (want !== interactive) {
    interactive = want;
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  if (moved) {
    lastCursor = { x: wx, y: wy };
    send('cursor', { x: wx, y: wy, over });
  }
}

// --------------------------------------------------------------------------
// 番茄钟
// --------------------------------------------------------------------------

const remaining = () => Math.max(0, pomo.endsAt - Date.now());

function fmtClock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function startPomodoro() {
  setAwake(true);
  pomo.running = true;
  pomo.endsAt = Date.now() + FOCUS_MS;
  send('pomodoro', { running: true, remaining: FOCUS_MS });
  updateTray();

  clearInterval(pomo.ticker);
  pomo.ticker = setInterval(() => {
    const left = remaining();
    send('pomodoro', { running: true, remaining: left });
    if (tray && !tray.isDestroyed()) tray.setToolTip(`大肥鱼 · 专注中 ${fmtClock(left)}`);
    if (left <= 0) finishPomodoro();
  }, 1000);
}

function stopPomodoro() {
  if (!pomo.running) return;
  pomo.running = false;
  clearInterval(pomo.ticker);
  pomo.ticker = null;
  send('pomodoro', { running: false, remaining: 0 });
  updateTray();
}

function finishPomodoro() {
  stopPomodoro();
  send('pomodoro-done');
  balloon('done', '大肥鱼', '专注时间结束啦，起来动一动吧！');
}

// --------------------------------------------------------------------------
// 互动
// --------------------------------------------------------------------------

function petStatus() {
  return {
    satiety: Math.round(state.satiety),
    mood: Math.round(state.mood),
    awake: state.awake,
    pomodoro: { running: pomo.running, remaining: remaining() },
    pos: state.pos,
    ledger: ledger || refreshUsage(),
  };
}

// 白饭账本：可选套餐额度（state.planQuota，单位 credits/月），填了才显示百分比
function refreshUsage() {
  let data = { today: 0, month: 0, session: 0, sessionId: '', available: false, updatedAt: Date.now() };
  try {
    data = { ...usageLedger.collect() };
  } catch {
    /* 读不到就保持空账本 */
  }
  const quota = Number(state.planQuota) || 0;
  ledger = { ...data, quota, percent: quota > 0 ? Math.min(100, (data.month / quota) * 100) : null };
  checkQuotaWarning();
  return ledger;
}

function setAwake(v) {
  if (state.awake === v) return;
  state.awake = v;
  saveState();
  send('awake', v);
}

function doFeed() {
  if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
  state.satiety = clamp(state.satiety + 22, 0, 100);
  state.mood = clamp(state.mood + 8, 0, 100);
  state.awake = true;
  saveState();
  send('awake', true);
  send('feed', { satiety: Math.round(state.satiety), mood: Math.round(state.mood) });
}

function handleAction(name) {
  switch (name) {
    case 'feed':
      doFeed();
      break;
    case 'pomodoro':
      if (pomo.running) {
        stopPomodoro();
        send('bubble', '专注先停一下～');
      } else {
        startPomodoro();
      }
      break;
    case 'sleep':
      setAwake(!state.awake);
      break;
    case 'status':
      send('show-status');
      break;
    case 'usage':
      refreshUsage();
      send('show-usage', ledger);
      break;
    case 'hide':
      if (win && !win.isDestroyed()) win.hide();
      break;
    case 'quit':
      app.quit();
      break;
    default:
      break;
  }
}

// --------------------------------------------------------------------------
// 托盘通知（图标来自 dsh-pet 的 assets/pic/notify-*.png）
// --------------------------------------------------------------------------

const NOTIFY_ICONS = {
  done: 'notify-done.png',
  error: 'notify-error.png',
  truncated: 'notify-truncated.png',
  question: 'notify-question.png',
  approval: 'notify-approval.png',
};
let notifyCache = null;

function notifyIcon(kind) {
  if (!notifyCache) {
    notifyCache = {};
    for (const [k, f] of Object.entries(NOTIFY_ICONS)) {
      const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'pic', f));
      if (!img.isEmpty()) notifyCache[k] = img.resize({ width: 32, height: 32 });
    }
  }
  return notifyCache[kind] || null;
}

function balloon(kind, title, content) {
  if (!tray || tray.isDestroyed()) return;
  const opts = { title, content };
  const icon = notifyIcon(kind);
  if (icon) {
    opts.icon = icon;
    opts.iconType = 'custom';
  }
  try {
    tray.displayBalloon(opts);
  } catch {
    /* 通知失败忽略 */
  }
}

// 套餐用量跨过 80% / 100% 时提醒一次（按自然月记账）
function checkQuotaWarning() {
  const quota = Number(state.planQuota) || 0;
  if (!quota || !ledger) return;
  const percent = (ledger.month / quota) * 100;
  const month = new Date().toISOString().slice(0, 7);
  if (state.warnMonth !== month) {
    state.warnMonth = month;
    state.warnTier = 1;
    saveState();
  }
  const tier = percent >= 100 ? 3 : percent >= 80 ? 2 : 1;
  if (tier > (state.warnTier || 1)) {
    state.warnTier = tier;
    saveState();
    if (tier === 3) {
      balloon('truncated', '白饭账本', `本月套餐已经被吃光了（${ledger.month} credits），大肥鱼要饿肚子了…`);
    } else {
      balloon('error', '白饭账本', `本月白饭已吃掉 ${percent.toFixed(0)}%（${ledger.month} credits），悠着点…`);
    }
  }
}

// --------------------------------------------------------------------------
// 托盘
// --------------------------------------------------------------------------

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const visible = !!win && !win.isDestroyed() && win.isVisible();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? '🙈  藏起大肥鱼' : '🐟  叫出大肥鱼', click: toggleVisible },
      { label: '🐟  投喂小鱼干', click: doFeed },
      pomo.running
        ? { label: `🍅  结束专注（剩 ${fmtClock(remaining())}）`, click: stopPomodoro }
        : { label: '🍅  开始专注 25 分钟', click: startPomodoro },
      {
        label: ledger && ledger.available ? `🍚  本月白饭 ${ledger.month} credits` : '🍚  白饭账本',
        click: () => {
          refreshUsage();
          send('show-usage', ledger);
        },
      },
      { type: 'separator' },
      { label: '📊  看看状态', click: () => send('show-status') },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  tray.setToolTip(pomo.running ? `大肥鱼 · 专注中 ${fmtClock(remaining())}` : '蓝色大肥鱼');
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'logo.png');
  let img = nativeImage.createFromPath(iconPath);
  img = img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
  try {
    tray = new Tray(img);
  } catch {
    return;
  }
  tray.on('click', toggleVisible);
  updateTray();
}

// --------------------------------------------------------------------------
// IPC
// --------------------------------------------------------------------------

function registerIpc() {
  ipcMain.on('ready', () => {
    send('init', petStatus());
    updateTray();
  });

  ipcMain.on('pos', (_e, pos) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    pet.x = pos.x;
    pet.y = pos.y;
    pet.initialized = true;
    if (Date.now() - savedPosAt > 20000) {
      savedPosAt = Date.now();
      state.pos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      saveState();
    }
  });

  ipcMain.on('menu', (_e, open) => {
    menuOpen = !!open;
  });

  ipcMain.on('drag', (_e, on) => {
    dragging = !!on;
  });

  ipcMain.on('stats', (_e, s) => {
    if (typeof s.satiety === 'number') state.satiety = clamp(s.satiety, 0, 100);
    if (typeof s.mood === 'number') state.mood = clamp(s.mood, 0, 100);
    saveState();
  });

  ipcMain.on('action', (_e, name) => handleAction(String(name)));
  ipcMain.on('quit', () => app.quit());

  ipcMain.on('bubble', (_e, text) => {
    if (typeof text === 'string' && win && !win.isVisible()) {
      balloon('question', '大肥鱼', text);
    }
  });
}

// --------------------------------------------------------------------------
// 开发用工具
// --------------------------------------------------------------------------

// tools/ 不进安装包，这里必须容错：文件不在时开发模式静默降级
let dev = null;
if (DEV_SHOT || DEV_INPUT) {
  try {
    dev = require('./tools/dev');
  } catch (e) {
    crashLog('dev-missing', e.message);
  }
}

// --------------------------------------------------------------------------
// 启动
// --------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.showInactive();
  });

  app.setAppUserModelId('com.dafeiyu.desktop-pet');

  app.whenReady().then(() => {
    loadState();
    registerIpc();
    createWindow();
    createTray();

    screen.on('display-metrics-changed', syncBounds);
    screen.on('display-added', syncBounds);
    screen.on('display-removed', syncBounds);

    setInterval(cursorTick, CURSOR_POLL_MS);
    setInterval(() => {
      refreshUsage();
      updateTray();
    }, 5 * 60 * 1000);

    if (DEV_INPUT) {
      global.__petDiag = () => ({ interactive, menuOpen, dragging, pet: { ...pet } });
    }
    if (DEV_CPU) {
      let n = 0;
      const t = setInterval(() => {
        const m = app.getAppMetrics();
        const cpu = m.reduce((a, x) => a + (x.cpu ? x.cpu.percentCPUUsage : 0), 0);
        const mem = m.reduce((a, x) => a + x.memory.workingSetSize, 0);
        console.log(`CPU sample cpu=${cpu.toFixed(1)}% mem=${(mem / 1024).toFixed(0)}MB procs=${m.length}`);
        if (++n >= 5) {
          clearInterval(t);
          win.destroy();
          app.quit();
        }
      }, 4000);
    }
    if (DEV_SHOT || DEV_INPUT || DEV_CPU) crashLog('argv', JSON.stringify(process.argv));
    if (DEV_SHOT) {
      win.webContents.once('did-finish-load', () => {
        (dev.runDevShot(win, DEV_SCENE) || Promise.resolve()).catch((e) => crashLog('devShot', e));
      });
    }
    if (DEV_INPUT) win.webContents.once('did-finish-load', () => dev.runInputTest(win));
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    clearInterval(pomo.ticker);
    if (pet.initialized) state.pos = { x: Math.round(pet.x), y: Math.round(pet.y) };
    saveStateNow();
  });
}
