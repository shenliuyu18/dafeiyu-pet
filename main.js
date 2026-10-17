'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, dialog, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { spawn } = require('node:child_process');

const DEFAULT_STATE = {
  satiety: 78,
  mood: 82,
  pos: null,
  awake: true,
  scale: 0.85,
  dock: 'roam',
  pomoMin: 25,
  ledger: true,
  autoStart: false,
  launchApp: '',
  character: 'v1',
  fontSize: 1,
  sfx: 'default',
  autoActionSec: 40,
  ledgerSource: 'qoder',
  autoUpdate: true,
  deepseekKey: '',
  apiKeys: {},
  lastUpdateCheck: 0,
};

// 形象 id：v1 = 原版逐帧动画；v2~v5 = dsh-whale-widget-plus 的四套表情立绘；gpt = GPT 娘
const CHAR_IDS = new Set(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'gpt']);
// 1.4.0 及更早的状态文件里是 whale1 / whale2
const charId = (v) => (v === 'whale1' ? 'v1' : v === 'whale2' ? 'v5' : CHAR_IDS.has(v) ? v : 'v1');

// 与渲染层 PET 常量保持一致：角色可见区域（#pet 局部坐标）
const PET = { x0: 76, y0: 144, x1: 224, y1: 312 };
const HIT_PAD = 6;
const CURSOR_POLL_MS = 30;

const argv = process.argv.slice(1);
const DEV_SHOT = argv.includes('--dev-shot');
const DEV_INPUT = argv.includes('--dev-input');
const DEV_CPU = argv.includes('--dev-cpu');
const DEV_GPU = argv.includes('--dev-gpu');
// 开发用：模拟当前版本号，方便测试“发现新版本/下载安装包”流程
const DEV_VERSION = !app.isPackaged ? (argv.find((a) => a.startsWith('--dev-version=')) || '').split('=')[1] || '' : '';
const DEV_SCENE = (argv.find((a) => a.startsWith('--dev-scene=')) || '').split('=')[1] || 'idle';

// 1.3.0 起两个版本合并：白饭账本内置，可在设置里开关（state.ledger）
const usageLedger = require('./usage');

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
  // 1.3.0 起两个版本合并为单版本（数据目录用 %APPDATA%\dafeiyu-desktop-pet）：
  // 本目录还没有状态文件时，把 1.2.0「适配 Qoder 版」独立目录里的配置带过来
  //（番茄钟时长、尺寸、白饭套餐额度等手工配置不丢）
  try {
    if (!fs.existsSync(statePath())) {
      const legacyQoder = path.join(app.getPath('appData'), 'dafeiyu-desktop-pet-qoder', 'dafeiyu-state.json');
      if (fs.existsSync(legacyQoder)) {
        fs.mkdirSync(path.dirname(statePath()), { recursive: true });
        fs.copyFileSync(legacyQoder, statePath());
      }
    }
  } catch {
    /* 带不过来就用默认状态 */
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
  state.character = charId(state.character);
  // 旧的 deepseekKey 等明文 Key 迁移成加密存储
  migrateApiKeysEncryption();
  // 1.6.0 起自动动作默认间隔 20 秒 → 40 秒：只把旧默认值迁一次
  if (!state.autoAction40) {
    state.autoAction40 = true;
    if (Number(state.autoActionSec) === 20) state.autoActionSec = 40;
    saveState();
  }
}

// 白饭账本开关（默认开；老状态里没有这个字段也按开处理）
const ledgerOn = () => state.ledger !== false;

// 开机自启动：随设置同步注册表（Windows 的 HKCU\...\Run）。
// 开发模式（未打包）把应用路径作为参数带上，登录后才能真正拉起本项目
function applyLoginItem() {
  const on = !!state.autoStart;
  try {
    app.setLoginItemSettings({
      openAtLogin: on,
      path: process.execPath,
      args: app.isPackaged ? [] : [app.getAppPath()],
    });
  } catch {
    /* 注册失败忽略 */
  }
}

// 关联启动：桌宠启动时同步打开用户选择的应用（可执行文件 / 快捷方式等）
function launchLinkedApp() {
  const p = typeof state.launchApp === 'string' ? state.launchApp.trim() : '';
  if (!p) return;
  try {
    if (fs.existsSync(p)) shell.openPath(p);
  } catch {
    /* 打不开就跳过 */
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
    title: '大肥鱼桌宠',
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
    if (tray && !tray.isDestroyed()) tray.setToolTip(`大肥鱼桌宠 · 专注中 ${fmtClock(left)}`);
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
  balloon('done', '大肥鱼桌宠', '专注时间结束啦，起来动一动吧！');
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
    settings: {
      scale: Number(state.scale) || 1,
      dock: state.dock === 'corner' || state.dock === 'fixed' ? state.dock : 'roam',
      pomoMin: pomoMinutes(),
      ledger: ledgerOn(),
      autoStart: !!state.autoStart,
      launchApp: typeof state.launchApp === 'string' ? state.launchApp : '',
      character: CHAR_IDS.has(state.character) ? state.character : charId(state.character),
      fontSize: Number(state.fontSize) || 1,
      sfx: state.sfx === 'whale' || state.sfx === 'off' ? state.sfx : 'default',
      autoActionSec: Number(state.autoActionSec) || 20,
      ledgerSource: API_PROVIDERS[state.ledgerSource] ? state.ledgerSource : 'qoder',
      autoUpdate: state.autoUpdate !== false,
    },
    version: app.getVersion(),
    apiKeys: apiKeysConfigured(),
    ledger: ledgerOn() ? ledger || refreshUsage() : null,
  };
}

// 白饭账本：来源可在设置里切换
//   qoder    —— 本机 Qoder 会话转录里的 credits 用量（state.planQuota 可选套餐额度）
//   deepseek —— DeepSeek 账户余额（需要 API Key：环境变量 DEEPSEEK_API_KEY 或状态文件里的 deepseekKey）
function refreshUsage() {
  if (!ledgerOn()) return null;
  if (API_PROVIDERS[state.ledgerSource]) {
    // 异步拉取；先返回缓存，拿到后推给渲染层
    fetchApiBalance(state.ledgerSource).then((data) => {
      ledger = data;
      send('usage', ledger);
      updateTray();
    });
    return ledger;
  }
  let data = { source: 'qoder', today: 0, month: 0, session: 0, sessionId: '', available: false, updatedAt: Date.now() };
  try {
    data = { ...data, ...usageLedger.collect() };
  } catch {
    /* 读不到就保持空账本 */
  }
  const quota = Number(state.planQuota) || 0;
  ledger = { source: 'qoder', ...data, quota, percent: quota > 0 ? Math.min(100, (data.month / quota) * 100) : null };
  checkQuotaWarning();
  return ledger;
}

// ---------------- API 账单（Qoder 之外的多平台） ----------------
// 只访问各平台官方接口；API Key 加密保存（Windows DPAPI），只在查询时发送给对应平台。
function httpGetJson({ host, path, headers, timeout = 9000 }) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: host, path, method: 'GET', headers: { Accept: 'application/json', ...headers }, timeout },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ json: JSON.parse(body), status: res.statusCode });
          } catch {
            resolve({ error: `HTTP ${res.statusCode}` });
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: '请求超时' });
    });
    req.on('error', () => resolve({ error: '网络错误' }));
    req.end();
  });
}

// 深度求和：兜底解析不同平台的 cost_report 结构
function deepSumAmount(obj) {
  let sum = 0;
  if (!obj || typeof obj !== 'object') return 0;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'amount' && (typeof v === 'number' || typeof v === 'string')) {
      const num = Number(v);
      if (Number.isFinite(num)) sum += num;
    } else if (v && typeof v === 'object') {
      sum += deepSumAmount(v);
    }
  }
  return sum;
}

async function fetchDeepseek(key) {
  const r = await httpGetJson({ host: 'api.deepseek.com', path: '/user/balance', headers: { Authorization: `Bearer ${key}` } });
  if (r.error) return { error: 'DeepSeek 请求失败' };
  const b = ((r.json.balance_infos || [])[0]) || {};
  const sym = (b.currency || 'CNY') === 'CNY' ? '¥' : '';
  return {
    available: r.json.is_available !== false,
    rows: [
      { label: '可用余额', value: `${sym}${b.total_balance ?? '—'}` },
      { label: '赠送余额', value: `${sym}${b.granted_balance ?? '—'}` },
      { label: '充值余额', value: `${sym}${b.topped_up_balance ?? '—'}` },
    ],
  };
}

async function fetchMoonshot(key) {
  const r = await httpGetJson({ host: 'api.moonshot.cn', path: '/v1/users/me/balance', headers: { Authorization: `Bearer ${key}` } });
  if (r.error) return { error: 'Kimi 请求失败' };
  if (r.json.error) return { error: `Kimi：${r.json.error.message || '请求被拒绝'}` };
  const d = r.json.data || {};
  return {
    available: true,
    rows: [
      { label: '可用余额', value: `¥${d.available_balance ?? '—'}` },
      { label: '代金券', value: `¥${d.voucher_balance ?? '—'}` },
      { label: '现金余额', value: `¥${d.cash_balance ?? '—'}` },
    ],
  };
}

async function fetchSiliconflow(key) {
  const r = await httpGetJson({ host: 'api.siliconflow.cn', path: '/v1/user/info', headers: { Authorization: `Bearer ${key}` } });
  if (r.error) return { error: 'SiliconFlow 请求失败' };
  const d = r.json.data || {};
  if (r.json.code !== undefined && r.json.code !== 20000 && r.json.code !== 0) {
    return { error: `SiliconFlow：${r.json.message || '请求被拒绝'}` };
  }
  return {
    available: true,
    rows: [
      { label: '可用余额', value: `¥${d.totalBalance ?? '—'}` },
      { label: '赠送余额', value: `¥${d.balance ?? '—'}` },
      { label: '充值余额', value: `¥${d.chargeBalance ?? '—'}` },
    ],
  };
}

async function fetchDoubao(key) {
  // 豆包走火山引擎费用中心：Key 填「AK:SK」（火山引擎访问密钥对）
  const parts = key.split(/[:\uFF1A,\uFF0C\s]+/).filter(Boolean);
  const ak = parts[0];
  const sk = parts[1];
  if (!ak || !sk) return { error: '豆包需要填写「AK:SK」（火山引擎访问密钥对）' };
  const auth = 'Basic ' + Buffer.from(`${ak}:${sk}`).toString('base64');
  const r = await httpGetJson({
    host: 'open.volcengineapi.com',
    path: '/?Action=QueryBalanceAcct&Version=2022-01-01',
    headers: { Authorization: auth },
  });
  if (r.error) return { error: '豆包（火山引擎）请求失败' };
  const j = r.json;
  if (!j.Result) {
    const meta = (j.ResponseMetadata && j.ResponseMetadata.Error) || {};
    return { error: `豆包：${meta.Message || '请求被拒绝（检查 AK/SK 与权限）'}` };
  }
  const d = j.Result;
  return {
    available: true,
    rows: [
      { label: '可用余额', value: `¥${d.AvailableBalance ?? '—'}` },
      { label: '现金余额', value: `¥${d.CashBalance ?? '—'}` },
      { label: '欠费金额', value: `¥${d.ArrearsBalance ?? '—'}` },
    ],
  };
}

async function fetchOpenai(key) {
  // OpenAI 组织成本接口需要 Admin Key（sk-admin...）
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const d = new Date();
  const monthStart = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
  const dayStart = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
  const weekStart = now - 7 * 86400;
  const r = await httpGetJson({
    host: 'api.openai.com',
    path: `/v1/organization/costs?start_time=${monthStart}&end_time=${now}&interval=1d&limit=180`,
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.error) return { error: 'OpenAI 请求失败（需要可访问 api.openai.com 的网络）' };
  if (r.json.error) return { error: `OpenAI：${r.json.error.message || '请求被拒绝（需要 Admin Key）'}` };
  let month = 0;
  let week = 0;
  let today = 0;
  let currency = 'usd';
  for (const b of r.json.data || []) {
    let sBucket = 0;
    for (const it of b.results || []) {
      sBucket += Number((it.amount || {}).value) || 0;
      currency = (it.amount || {}).currency || currency;
    }
    const t = Number(b.start_time) || 0;
    month += sBucket;
    if (t >= weekStart) week += sBucket;
    if (t >= dayStart) today += sBucket;
  }
  const sym = currency.toLowerCase() === 'cny' ? '¥' : '$';
  return {
    available: true,
    rows: [
      { label: '本月消费', value: `${sym}${month.toFixed(2)}` },
      { label: '近 7 天', value: `${sym}${week.toFixed(2)}` },
      { label: '今日', value: `${sym}${today.toFixed(2)}` },
    ],
  };
}

async function fetchClaude(key) {
  // Anthropic 成本报表需要 Admin Key（sk-ant-admin...），金额单位是美分
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const q = `starting_at=${encodeURIComponent(monthStart.toISOString())}&ending_at=${encodeURIComponent(now.toISOString())}&bucket_width=1d&limit=31`;
  const r = await httpGetJson({
    host: 'api.anthropic.com',
    path: `/v1/organizations/cost_report?${q}`,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  });
  if (r.error) return { error: 'Claude 请求失败' };
  if (r.json.error) return { error: `Claude：${r.json.error.message || '请求被拒绝（需要 Admin Key）'}` };
  const nowMs = Date.now();
  const dayStartMs = new Date(new Date().toDateString()).getTime();
  const weekStartMs = nowMs - 7 * 86400000;
  let monthCents = 0;
  let weekCents = 0;
  let todayCents = 0;
  for (const b of r.json.data || []) {
    const cents = deepSumAmount(b.results || []);
    const t = Date.parse(b.starting_at || '');
    monthCents += cents;
    if (Number.isFinite(t)) {
      if (t >= weekStartMs) weekCents += cents;
      if (t >= dayStartMs) todayCents += cents;
    }
  }
  if (!r.json.data) monthCents = deepSumAmount(r.json);
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  return {
    available: true,
    rows: [
      { label: '本月消费', value: money(monthCents) },
      { label: '近 7 天', value: money(weekCents) },
      { label: '今日', value: money(todayCents) },
    ],
  };
}

const API_PROVIDERS = {
  deepseek: { label: 'DeepSeek', short: 'DeepSeek', env: 'DEEPSEEK_API_KEY', fetch: fetchDeepseek },
  moonshot: { label: 'Kimi（Moonshot）', short: 'Kimi', env: 'MOONSHOT_API_KEY', fetch: fetchMoonshot },
  siliconflow: { label: 'SiliconFlow（硅基流动）', short: 'SiliconFlow', env: 'SILICONFLOW_API_KEY', fetch: fetchSiliconflow },
  doubao: { label: '豆包（火山方舟）', short: '豆包', env: 'VOLC_ACCESSKEY', fetch: fetchDoubao },
  openai: { label: 'ChatGPT（OpenAI）', short: 'OpenAI', env: 'OPENAI_ADMIN_KEY', fetch: fetchOpenai },
  claude: { label: 'Claude（Anthropic）', short: 'Claude', env: 'ANTHROPIC_ADMIN_KEY', fetch: fetchClaude },
};

// ---------------- API Key 加密存取（Windows DPAPI） ----------------
function encryptKey(key) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(key).toString('base64');
    }
  } catch {
    /* 加密不可用则按明文标记 */
  }
  return 'plain:' + key;
}

function decryptKey(stored) {
  if (typeof stored !== 'string' || !stored) return '';
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')).trim();
    } catch {
      return '';
    }
  }
  if (stored.startsWith('plain:')) return stored.slice(6).trim();
  return stored.trim();
}

function apiKey(provider) {
  const saved = state.apiKeys && typeof state.apiKeys[provider] === 'string' ? decryptKey(state.apiKeys[provider]) : '';
  const legacy = provider === 'deepseek' && typeof state.deepseekKey === 'string' ? state.deepseekKey.trim() : '';
  const def = API_PROVIDERS[provider];
  return saved || legacy || (def && process.env[def.env]) || '';
}

// 启动时把历史明文 Key 迁移成加密存储
function migrateApiKeysEncryption() {
  if (!state.apiKeys || typeof state.apiKeys !== 'object') state.apiKeys = {};
  let changed = false;
  if (state.deepseekKey && !state.apiKeys.deepseek) {
    state.apiKeys.deepseek = encryptKey(state.deepseekKey);
    state.deepseekKey = '';
    changed = true;
  }
  for (const [k, v] of Object.entries(state.apiKeys)) {
    if (typeof v === 'string' && v && !v.startsWith('enc:') && !v.startsWith('plain:')) {
      state.apiKeys[k] = encryptKey(v);
      changed = true;
    }
  }
  if (changed) saveState();
}

let apiFetching = false;
function fetchApiBalance(provider) {
  const def = API_PROVIDERS[provider];
  const base = {
    source: provider,
    providerLabel: def ? def.label : provider,
    providerShort: def ? def.short : provider,
    available: false,
    rows: [],
    updatedAt: Date.now(),
    error: '',
  };
  if (!def) return Promise.resolve({ ...base, error: '未知的账本来源' });
  const key = apiKey(provider);
  if (!key) return Promise.resolve({ ...base, error: `未配置 ${def.label} API Key` });
  if (apiFetching) return Promise.resolve(ledger || base);
  apiFetching = true;
  return def.fetch(key).then((r) => {
    apiFetching = false;
    return { ...base, ...r, available: !r.error, updatedAt: Date.now() };
  });
}

// ---- API Key 配置窗口 ----
let keyWin = null;
let keyTarget = 'deepseek';

function apiKeysConfigured() {
  const out = {};
  for (const id of Object.keys(API_PROVIDERS)) out[id] = !!apiKey(id);
  return out;
}

const KEY_HINTS = {
  deepseek: '普通 API Key 即可（sk-…）',
  moonshot: '普通 API Key 即可（sk-…）',
  siliconflow: '普通 API Key 即可（sk-…）',
  doubao: '豆包需要填写火山引擎访问密钥对「AK:SK」',
  openai: '需要 OpenAI Admin Key（sk-admin…），普通 Key 无法查询账单',
  claude: '需要 Anthropic Admin Key（sk-ant-admin…）',
};

function keyWindowInfo() {
  const def = API_PROVIDERS[keyTarget] || API_PROVIDERS.deepseek;
  return { provider: keyTarget, label: def.label, hint: KEY_HINTS[keyTarget] || '', hasKey: !!apiKey(keyTarget) };
}

function openKeyWindow(provider) {
  keyTarget = API_PROVIDERS[provider] ? provider : 'deepseek';
  if (keyWin && !keyWin.isDestroyed()) {
    keyWin.webContents.send('key-target', keyWindowInfo());
    keyWin.show();
    keyWin.focus();
    return;
  }
  keyWin = new BrowserWindow({
    width: 440,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '配置 API Key',
    parent: win && !win.isDestroyed() ? win : undefined,
    modal: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'key-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  keyWin.loadFile(path.join(__dirname, 'renderer', 'key.html'));
  keyWin.once('ready-to-show', () => {
    keyWin.show();
    keyWin.focus();
  });
  keyWin.on('closed', () => {
    keyWin = null;
  });
}

// 检查 GitHub Releases 是否有新版本（数字段比较，忽略大小写与 v 前缀）
function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (data) => {
      if (done) return;
      done = true;
      resolve(data);
    };
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: '/repos/shenliuyu18/dafeiyu-pet/releases/latest',
        method: 'GET',
        headers: { 'User-Agent': 'dafeiyu-pet', Accept: 'application/vnd.github+json' },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            if (!j.tag_name) return finish({ error: '没有找到发布版本' });
            finish({
              tag: j.tag_name,
              url: j.html_url || 'https://github.com/shenliuyu18/dafeiyu-pet/releases',
              assets: (j.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
            });
          } catch {
            finish({ error: 'GitHub 返回解析失败' });
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      finish({ error: '请求超时' });
    });
    req.on('error', () => finish({ error: '网络请求失败' }));
    req.end();
  });
}

// 检查更新（结果返回给渲染层在设置里内联显示，不弹系统对话框）
let lastUpdate = null;

async function getUpdateInfo() {
  const cur = DEV_VERSION || app.getVersion();
  const info = await fetchLatestRelease();
  if (info.error) return { current: cur, error: info.error };
  const list = info.assets || [];
  const exe = list.find((a) => /setup\.exe$/i.test(a.name)) || list.find((a) => /\.exe$/i.test(a.name));
  const hasUpdate = cmpVersion(info.tag, cur) > 0;
  const out = {
    current: cur,
    latest: info.tag,
    hasUpdate,
    assetName: exe ? exe.name : '',
    url: exe ? exe.url : '',
    proxyUrl: exe ? `https://gh-proxy.org/${exe.url}` : '',
    error: hasUpdate && !exe ? '最新版本没有找到安装包' : '',
  };
  lastUpdate = out;
  return out;
}

// 下载到系统下载文件夹（自动跟随重定向、防重名）
let updateDownloading = false;
function uniqueDownloadPath(dir, name) {
  const safe = path.basename(String(name || 'ai-desktop-pet-setup.exe')).replace(/[\\/:*?"<>|]/g, '_');
  let p = path.join(dir, safe);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  for (let i = 1; i < 100; i++) {
    p = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const req = https.get(url, { headers: { 'User-Agent': 'ai-desktop-pet' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 8) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return finish(downloadFile(next, dest, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return finish({ ok: false, error: `HTTP ${res.statusCode}` });
      }
      const total = Number(res.headers['content-length']) || 0;
      let received = 0;
      let lastTick = 0;
      const ws = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastTick > 400) {
          lastTick = now;
          onProgress(received, total);
        }
      });
      res.on('error', () => {
        ws.destroy();
        finish({ ok: false, error: '下载中断' });
      });
      ws.on('error', () => finish({ ok: false, error: '写入文件失败' }));
      ws.on('finish', () => finish({ ok: true, file: path.basename(dest), path: dest, size: received }));
      res.pipe(ws);
    });
    req.on('timeout', () => {
      req.destroy();
      finish({ ok: false, error: '请求超时' });
    });
    req.on('error', () => finish({ ok: false, error: '网络请求失败' }));
  });
}

async function startUpdateDownload(mode) {
  if (updateDownloading) return { started: false, error: '正在下载' };
  const info = lastUpdate || (await getUpdateInfo());
  if (!info || !info.hasUpdate || !info.url) return { started: false, error: '没有可下载的新版本' };
  const dir = app.getPath('downloads');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* 下载目录不可用就让写入报错 */
  }
  const dest = uniqueDownloadPath(dir, info.assetName);
  const url = mode === 'accel' ? info.proxyUrl : info.url;
  updateDownloading = true;
  downloadFile(url, dest, (received, total) => {
    const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
    send('update-progress', { received, total, percent });
  }).then((r) => {
    updateDownloading = false;
    send('update-done', r);
  });
  return { started: true };
}

// 生成一个等本进程退出 → 静默安装 → 重新拉起桌宠的脚本（独立进程执行，不受主进程退出影响）
function spawnSilentUpdate(installerPath) {
  const exe = process.execPath;
  const script = path.join(app.getPath('temp'), `dafeiyu-update-${Date.now()}.cmd`);
  const lines = [
    '@echo off',
    'ping -n 4 127.0.0.1 >nul',
    `start /wait "" "${installerPath}" /S`,
    'ping -n 3 127.0.0.1 >nul',
    `start "" "${exe}"`,
    'del "%~f0"',
  ];
  try {
    fs.writeFileSync(script, lines.join('\r\n') + '\r\n');
    const child = spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// 自动更新：下载最新安装包 → 静默安装 → 自动重启（下载走加速镜像）
let autoUpdating = false;
async function autoInstallUpdate(manual) {
  if (autoUpdating || updateDownloading) return { started: false, error: '正在更新' };
  const info = lastUpdate || (await getUpdateInfo());
  if (!info || !info.hasUpdate || !info.url) return { started: false, error: '没有可更新的版本' };
  const dir = path.join(app.getPath('temp'), 'dafeiyu-update');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* 写入时再报错 */
  }
  const dest = path.join(dir, `update-${Date.now()}-${path.basename(info.assetName || 'setup.exe')}`);
  autoUpdating = true;
  updateDownloading = true;
  balloon('done', '大肥鱼桌宠', `发现新版本 ${info.latest}，正在后台下载并自动安装…`);
  const r = await downloadFile(info.proxyUrl || info.url, dest, (received, total) => {
    const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
    send('update-progress', { received, total, percent });
  });
  updateDownloading = false;
  autoUpdating = false;
  if (!r.ok) {
    balloon('error', '大肥鱼桌宠', `自动更新下载失败：${r.error || '网络错误'}，可在设置里手动重试`);
    send('update-done', { ok: false, error: r.error || '下载失败' });
    return { started: false, error: r.error || '下载失败' };
  }
  if (!spawnSilentUpdate(dest)) {
    updateDownloading = false;
    send('update-done', { ok: false, error: '无法启动安装程序' });
    return { started: false, error: '无法启动安装程序' };
  }
  setTimeout(() => app.quit(), 500);
  return { started: true };
}

// 启动时的静默检查：发现新版本自动下载并安装（开发用 --dev-version 模拟时只提示不安装）
async function silentUpdateCheck() {
  const info = await getUpdateInfo();
  if (!info || info.error || !info.hasUpdate) return;
  if (state.autoUpdate === false) {
    balloon('done', '大肥鱼桌宠', `发现新版本 ${info.latest}，可在设置 → 启动与更新里下载或安装`);
    return;
  }
  if (DEV_VERSION) {
    balloon('done', '大肥鱼桌宠', `（dev）发现新版本 ${info.latest}，正式版会自动安装`);
    return;
  }
  autoInstallUpdate(false);
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
      if (!ledgerOn()) break;
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
  if (!ledgerOn()) return;
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
      balloon('truncated', '用量账本', `本月套餐已经被用光了（${ledger.month} credits）…`);
    } else {
      balloon('error', '用量账本', `本月用量已到 ${percent.toFixed(0)}%（${ledger.month} credits），悠着点…`);
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
      { label: visible ? '🙈  藏起桌宠' : '🐟  叫出桌宠', click: toggleVisible },
      { label: '🍚  投喂', click: doFeed },
      pomo.running
        ? { label: `🍅  结束专注（剩 ${fmtClock(remaining())}）`, click: stopPomodoro }
        : { label: `🍅  开始专注 ${pomoMinutes()} 分钟`, click: startPomodoro },
      { label: '🎬  选个动作…', click: showPickerFromTray },
      ...(ledgerOn()
        ? [
            {
              label: !ledger
                ? '🍚  白饭账本'
                : ledger.source !== 'qoder'
                  ? ledger.available && ledger.rows && ledger.rows[0]
                    ? `🍚  ${ledger.providerShort || 'API'} ${ledger.rows[0].value}`
                    : '🍚  白饭账本'
                  : ledger.available
                    ? `🍚  本月白饭 ${ledger.month} credits`
                    : '🍚  白饭账本',
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
  tray.setToolTip(pomo.running ? `大肥鱼桌宠 · 专注中 ${fmtClock(remaining())}` : '大肥鱼桌宠');
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
    if (s.dock === 'corner' || s.dock === 'roam' || s.dock === 'fixed') state.dock = s.dock;
    if (Number.isFinite(s.pomoMin)) state.pomoMin = clamp(Math.round(s.pomoMin), 5, 120);
    if (typeof s.ledger === 'boolean') {
      state.ledger = s.ledger;
      if (state.ledger) refreshUsage();
    }
    if (typeof s.autoStart === 'boolean') {
      state.autoStart = s.autoStart;
      applyLoginItem();
    }
    if (typeof s.launchApp === 'string') state.launchApp = s.launchApp.slice(0, 1024);
    if (s.ledgerSource === 'qoder' || API_PROVIDERS[s.ledgerSource]) {
      if (state.ledgerSource !== s.ledgerSource) ledger = null;
      state.ledgerSource = s.ledgerSource;
    }
    if (typeof s.autoUpdate === 'boolean') state.autoUpdate = s.autoUpdate;
    if (CHAR_IDS.has(s.character)) state.character = s.character;
    if (Number.isFinite(s.fontSize)) state.fontSize = clamp(s.fontSize, 0.8, 1.4);
    if (s.sfx === 'default' || s.sfx === 'whale' || s.sfx === 'off') state.sfx = s.sfx;
    if (Number.isFinite(s.autoActionSec)) state.autoActionSec = clamp(Math.round(s.autoActionSec), 5, 300);
    saveState();
    if (ledgerOn()) refreshUsage();
    updateTray();
  });

  ipcMain.handle('check-update', () => getUpdateInfo());

  // 配置 API Key：打开小窗口（主界面不可聚焦，输入框放在这个独立窗口里）
  ipcMain.on('key-open', (_e, provider) => openKeyWindow(provider));
  ipcMain.handle('key-info', () => keyWindowInfo());
  ipcMain.handle('key-save', (_e, key) => {
    const k = typeof key === 'string' ? key.trim() : '';
    if (k.length < 8) return { ok: false, error: 'Key 太短，看起来不像有效的 API Key' };
    if (!state.apiKeys || typeof state.apiKeys !== 'object') state.apiKeys = {};
    state.apiKeys[keyTarget] = encryptKey(k);
    saveState();
    if (state.ledgerSource === keyTarget && ledgerOn()) refreshUsage();
    send('keys-updated', apiKeysConfigured());
    return { ok: true };
  });
  ipcMain.handle('key-clear', () => {
    if (state.apiKeys && typeof state.apiKeys === 'object') delete state.apiKeys[keyTarget];
    if (keyTarget === 'deepseek') state.deepseekKey = '';
    saveState();
    if (state.ledgerSource === keyTarget && ledgerOn()) refreshUsage();
    send('keys-updated', apiKeysConfigured());
    return { ok: true };
  });
  ipcMain.on('key-close', () => {
    if (keyWin && !keyWin.isDestroyed()) keyWin.close();
  });

  ipcMain.on('open-url', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\/(github\.com\/shenliuyu18\/dafeiyu-pet|gh-proxy\.org)\//.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });
  ipcMain.handle('download-update', (_e, mode) => startUpdateDownload(mode === 'accel' ? 'accel' : 'direct'));
  ipcMain.handle('install-update', () => autoInstallUpdate(true));

  // 选择「一起启动的应用」：原生文件选择框，返回路径或 null（取消）
  ipcMain.handle('pick-app', async () => {
    try {
      const r = await dialog.showOpenDialog({
        title: '选择要和桌宠一起启动的应用',
        properties: ['openFile'],
        filters: [
          { name: '应用 / 快捷方式', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (r.canceled || !r.filePaths || !r.filePaths.length) return null;
      return r.filePaths[0];
    } catch {
      return null;
    }
  });

  ipcMain.on('action', (_e, name) => handleAction(String(name)));
  ipcMain.on('quit', () => app.quit());

  ipcMain.on('bubble', (_e, text) => {
    if (typeof text === 'string' && win && !win.isVisible()) {
      balloon('question', '大肥鱼桌宠', text);
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
    applyLoginItem();
    launchLinkedApp();
    setTimeout(() => {
      if (Date.now() - (Number(state.lastUpdateCheck) || 0) > 24 * 60 * 60 * 1000) {
        state.lastUpdateCheck = Date.now();
        saveState();
        silentUpdateCheck();
      }
    }, 12000);

    screen.on('display-metrics-changed', syncBounds);
    screen.on('display-added', syncBounds);
    screen.on('display-removed', syncBounds);

    setInterval(cursorTick, CURSOR_POLL_MS);
    setInterval(() => {
      if (ledgerOn()) refreshUsage();
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
