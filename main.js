'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_STATE = { satiety: 78, mood: 82, pos: null, awake: true, scale: 0.85, dock: 'roam', pomoMin: 25 };

// 与渲染层 PET 常量保持一致：角色可见区域（#pet 局部坐标）
const PET = { x0: 76, y0: 144, x1: 224, y1: 312 };
const HIT_PAD = 6;
const CURSOR_POLL_MS = 30;

const argv = process.argv.slice(1);
const DEV_SHOT = argv.includes('--dev-shot');
const DEV_INPUT = argv.includes('--dev-input');
const DEV_CPU = argv.includes('--dev-cpu');
const DEV_GPU = argv.includes('--dev-gpu');
const DEV_SCENE = (argv.find((a) => a.startsWith('--dev-scene=')) || '').split('=')[1] || 'idle';

// 双版本：标准版（默认，不含 Qoder 白饭账本）/ 适配 Qoder 版（打包时注入 package.json 的
// qoder:true，开发用 --qoder 模拟）
let pkgMeta = {};
try {
  pkgMeta = require('./package.json');
} catch {
  /* 读不到就按标准版处理 */
}
const QODER = !!pkgMeta.qoder || argv.includes('--qoder');
if (QODER) {
  try {
    // 适配 Qoder 版用独立数据目录（与标准版完全隔离）。
    // 开发/测试显式传了 --user-data-dir 时尊重外部指定
    if (!app.commandLine.hasSwitch('user-data-dir')) {
      app.setPath('userData', path.join(app.getPath('appData'), 'dafeiyu-desktop-pet-qoder'));
    }
  } catch {
    /* 目录设置失败就用默认的 */
  }
}
const usageLedger = QODER ? require('./usage') : null;

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

// 鼠标穿透判定状态：渲染层上报鱼的位置与缩放，主进程轮询光标做命中测试
const pet = { x: 0, y: 0, s: 1, initialized: false };
let interactive = false;
// 面板（菜单/设置卡）打开标志。打开期间本窗口整窗接收鼠标并重新断言置顶：
// 面板上的点击直达本窗口，避免与同屏另一个版本互相截断点击（"菜单卡死"）
let panelOpen = false;
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
  if (QODER) {
    // 1.2.0 起适配 Qoder 版用独立数据目录：首次启动时把 1.1.0 完整版旧目录里的状态带过来，
    // 白饭套餐额度（planQuota）、番茄钟时长、尺寸等手工配置不丢
    try {
      if (!fs.existsSync(statePath())) {
        const legacy = path.join(app.getPath('appData'), 'dafeiyu-desktop-pet', 'dafeiyu-state.json');
        if (fs.existsSync(legacy)) {
          fs.mkdirSync(path.dirname(statePath()), { recursive: true });
          fs.copyFileSync(legacy, statePath());
        }
      }
    } catch {
      /* 带不过来就用默认状态 */
    }
  }
  try {
    state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(statePath(), 'utf8')) };
  } catch {
    state = { ...DEFAULT_STATE };
  }
  // 1.2.0 起默认尺寸改为原来的 85%：对老状态做一次性迁移
  //（存着 100% 说明是旧默认值；手动调过其他比例的不动，用 scale85 标记只迁一次）
  if (!state.scale85) {
    state.scale85 = true;
    if (!Number.isFinite(Number(state.scale)) || Math.abs(Number(state.scale) - 1) < 0.001) state.scale = 0.85;
    saveState();
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
  // 不传 forward：forward 会装系统级鼠标钩子，多个实例共存时钩子会把点击的按下事件吞掉
  // （表现为另一个版本的菜单/按钮点不动）。视线跟随本来就靠下面的 30ms 光标轮询实现
  win.setIgnoreMouseEvents(true);
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

function openSettingsFromTray() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) win.showInactive();
  send('show-settings');
}

function showPickerFromTray() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) win.showInactive();
  send('show-picker');
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
    wx >= pet.x + PET.x0 * pet.s - HIT_PAD &&
    wx <= pet.x + PET.x1 * pet.s + HIT_PAD &&
    wy >= pet.y + PET.y0 * pet.s - HIT_PAD &&
    wy <= pet.y + PET.y1 * pet.s + HIT_PAD;

  const want = over || dragging || panelOpen;
  if (want !== interactive) {
    interactive = want;
    win.setIgnoreMouseEvents(!interactive);
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

// 番茄钟时长可在设置里改（5~120 分钟），存 state.pomoMin
const pomoMinutes = () => clamp(Math.round(Number(state.pomoMin) || 25), 5, 120);
const focusMs = () => pomoMinutes() * 60 * 1000;

function fmtClock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function startPomodoro() {
  setAwake(true);
  pomo.running = true;
  pomo.endsAt = Date.now() + focusMs();
  send('pomodoro', { running: true, remaining: focusMs() });
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
    qoder: QODER,
    settings: {
      scale: Number(state.scale) || 1,
      dock: state.dock === 'corner' ? 'corner' : 'roam',
      pomoMin: pomoMinutes(),
    },
    ledger: QODER ? ledger || refreshUsage() : null,
  };
}

// 白饭账本：可选套餐额度（state.planQuota，单位 credits/月），填了才显示百分比
function refreshUsage() {
  if (!QODER) return null;
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
      if (!QODER) break;
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
  if (!QODER) return;
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
        : { label: `🍅  开始专注 ${pomoMinutes()} 分钟`, click: startPomodoro },
      { label: '🎬  选个动作…', click: showPickerFromTray },
      ...(QODER
        ? [
            {
              label: ledger && ledger.available ? `🍚  本月白饭 ${ledger.month} credits` : '🍚  白饭账本',
              click: () => {
                refreshUsage();
                send('show-usage', ledger);
              },
            },
          ]
        : []),
      { type: 'separator' },
      { label: '⚙️  设置', click: openSettingsFromTray },
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
    if (Number.isFinite(pos.s)) pet.s = clamp(pos.s, 0.6, 1.6);
    pet.initialized = true;
    if (Date.now() - savedPosAt > 20000) {
      savedPosAt = Date.now();
      state.pos = { x: Math.round(pos.x), y: Math.round(pos.y) };
      saveState();
    }
  });

  ipcMain.on('panel', (_e, open) => {
    panelOpen = !!open;
    // 注意：这里不能再做任何置顶/提升 z 顺序的操作（moveTop / setAlwaysOnTop）。
    // Windows 上两个 "screen-saver" 级置顶窗口之间一旦发生 z 重排，
    // 被压下去那个窗口的鼠标按下事件会全部丢失（表现为另一版本"菜单卡死"）。
    // 面板打开时的整窗鼠标接收已能保证面板点击直达本窗口。
  });

  ipcMain.on('drag', (_e, on) => {
    dragging = !!on;
    // 同样不做 z 顺序操作（见上面 panel 处的说明）；拖拽期间整窗接收鼠标
  });

  ipcMain.on('stats', (_e, s) => {
    if (typeof s.satiety === 'number') state.satiety = clamp(s.satiety, 0, 100);
    if (typeof s.mood === 'number') state.mood = clamp(s.mood, 0, 100);
    saveState();
  });

  ipcMain.on('settings', (_e, s) => {
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.scale)) state.scale = clamp(s.scale, 0.6, 1.6);
    if (s.dock === 'corner' || s.dock === 'roam') state.dock = s.dock;
    if (Number.isFinite(s.pomoMin)) state.pomoMin = clamp(Math.round(s.pomoMin), 5, 120);
    saveState();
    updateTray();
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

  app.setAppUserModelId(QODER ? 'com.dafeiyu.desktop-pet.qoder' : 'com.dafeiyu.desktop-pet');

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
      if (QODER) refreshUsage();
      updateTray();
    }, 5 * 60 * 1000);

    if (DEV_INPUT) {
      global.__petDiag = () => ({ interactive, panel: panelOpen, dragging, pet: { ...pet } });
    }
    if (DEV_GPU) {
      // 打包版校验用：裁掉运行时冗余 DLL 后，把 GPU 特性状态写到临时目录再退出
      app
        .getGPUInfo('basic')
        .then((gpu) => {
          fs.writeFileSync(
            path.join(app.getPath('temp'), 'dafeiyu-gpu.json'),
            JSON.stringify({ featureStatus: app.getGPUFeatureStatus(), gpu }, null, 2),
          );
        })
        .catch((e) => crashLog('devGpu', e))
        .finally(() => {
          if (win && !win.isDestroyed()) win.destroy();
          app.quit();
        });
    }
    if (!app.isPackaged) {
      global.__dbg = () => ({ interactive, panel: panelOpen, dragging, pet: { ...pet } });
      global.__win = () => win;
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
