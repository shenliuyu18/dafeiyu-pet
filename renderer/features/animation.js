/*
 * 形象包注册、商店列表、动作选择与播放。
 * 顶层声明由经典脚本共享；DOM 事件在 initAnimationDom() 中延迟绑定。
 */

function buildPackTables(actions, slots) {
  const ids = actions.map((a) => a.id);
  const catOf = new Map(actions.map((a) => [a.id, a.category || '未分类']));
  const inCat = (c) => ids.filter((n) => catOf.get(n) === c);
  const kw = (...ks) => ids.filter((n) => ks.some((k) => n.includes(k)));
  const or = (...lists) => {
    for (const l of lists) if (l && l.length) return l;
    return [];
  };
  // 自制形象包可以用 slots 明确指定行为槽位，优先于按分类/关键字猜；
  // 旧包没有 slots 时继续走启发式。
  const slot = (...names) => {
    if (!slots) return [];
    for (const n of names) {
      const v = slots[n];
      if (!v) continue;
      const list = (Array.isArray(v) ? v : [v]).filter((x) => ids.includes(x));
      if (list.length) return list;
    }
    return [];
  };

  const idle = or(slot('idle'), kw('待机', '站立', '晃神', '发呆'), inCat('日常起居'), [ids[0]]);
  const anim = {
    idle,
    move: or(slot('move'), kw('走', '跑', '踏步', '跳'), inCat('运动健身'), idle),
    drag: or(slot('drag'), kw('拖', '悬空', '被吓', '惊'), inCat('情绪反应'), idle),
    clicks: or(slot('click', 'clicks'), kw('点击', '回应', '招手'), inCat('情绪反应'), ids.slice(0, 6)),
    feed: or(slot('feed'), inCat('吃喝'), kw('吃', '喝'), ids.slice(0, 3)),
    sleep: or(
      slot('sleep'),
      // 只取真正的“睡觉”动作：哈欠、打瞌睡被惊醒会让循环看起来像没睡稳
      ids.filter((n) => /睡|沉眠|打瞌睡/.test(n) && !/惊醒|哈欠/.test(n)),
      kw('睡', '困', '眠', '哈欠'),
      inCat('日常起居'),
      idle
    ),
    sad: or(slot('sad'), kw('难过', '叹气', '汗', '生闷气', '委屈'), inCat('情绪反应'), idle),
    happy: or(slot('happy'), kw('开心', '笑', '庆祝', '欢呼'), inCat('情绪反应'), idle),
    work: or(slot('work'), inCat('工作职业'), kw('工作', '办公', '敲'), ids.slice(0, 4)),
    money: or(slot('money'), kw('余额', '钱'), idle),
  };

  const pools = [];
  for (const c of Object.keys(PACK_CAT_WEIGHT)) {
    const pool = inCat(c);
    if (pool.length) pools.push({ weight: PACK_CAT_WEIGHT[c], id: c, pool });
  }
  if (!pools.length) pools.push({ weight: 20, id: 'all', pool: ids });

  const whispers = kw('碎碎念', '嘀咕');
  const balance = kw('余额');
  return {
    anim,
    pools,
    whispers: whispers.length ? whispers : idle,
    balance: balance.length ? balance : idle,
  };
}

// 当前已安装/已注册的形象包：id -> { id, name, cover, actions:[{id,category}] }
const PACKS = {};
// 已下线形象：旧目录/旧清单里即使还留着也不再注册（v2 的主图已并入表情包库）
const RETIRED_PACKS = new Set(['v2']);

// 包名统一成「角色 + 版本」，卡片上不放「动作包」字样
const PACK_LABEL = { gpt: 'GPT娘v2', dsh1: '大肥鱼 plus' };
const shortPackName = (n) => String(n || '').replace(/\s*动作包$/, '').replace(/·.*$/, '');

function registerPack(pack) {
  if (RETIRED_PACKS.has(pack.id)) return;
  if (PACK_LABEL[pack.id]) pack = Object.assign({}, pack, { name: PACK_LABEL[pack.id] });
  PACKS[pack.id] = pack;
  const target = PLUS_TARGET[pack.id];
  if (target) {
    // 扩充包：动作并进目标形象，不单独出现在形象列表里
    PLUS[target] = { dir: `../characters/${pack.id}/animations/`, root: `../characters/${pack.id}/`, actions: pack.actions || [] };
    delete CHARS['pack:' + pack.id];
    return;
  }
  CHARS['pack:' + pack.id] = {
    label: pack.name,
    kind: 'pack',
    dsh: false,
    dir: `../characters/${pack.id}/animations/`,
    pack,
  };
}

// 切换形象时换掉整套动作表（内置 <-> 包）
function applyAnimTables(ch, id) {
  if (ch.kind === 'pack' && ch.pack && ch.pack.actions && ch.pack.actions.length) {
    const t = buildPackTables(ch.pack.actions, ch.pack.slots);
    animDir = ch.dir;
    animFile = {};
    for (const a of ch.pack.actions) animFile[a.id] = `../characters/${ch.pack.id}/` + a.file;
    HAS = new Set(ch.pack.actions.map((a) => a.id));
    ANIM = t.anim;
    ACTIONS = t.pools;
    WHISPERS = t.whispers;
    BALANCE_TIERS = t.balance;
    return;
  }
  animDir = ANIM_DIR;
  plusSrc = {};
  animFile = {};
  const base = window.PET_ANIMS || [];
  const plus = (id && PLUS[id]) || null;
  if (plus && plus.actions.length) {
    const extra = plus.actions.map((a) => a.id);
    for (const a of plus.actions) {
      plusSrc[a.id] = plus.dir;
      animFile[a.id] = plus.root + a.file;
    }
    HAS = new Set([...base, ...extra]);
    ACTIONS = [...ACTIONS_BUILTIN, { weight: 14, id: 'plus', pool: extra }];
  } else {
    HAS = new Set(base);
    ACTIONS = ACTIONS_BUILTIN;
  }
  ANIM = ANIM_BUILTIN;
  WHISPERS = WHISPERS_BUILTIN;
  BALANCE_TIERS = BALANCE_BUILTIN;
}

// ── 形象商店 ──────────────────────────────────────────────────────────────
// 列表来自远程目录（characters.json）+ 本地已安装的包；本地导入的包同样进这里。
const setStore = document.getElementById('set-store');
const dlProgress = {};
const fmtMB = (b) => ((b || 0) / 1048576).toFixed(1) + ' MB';

let CATALOG = [];        // 远程可下载列表
let catalogErr = '';

// 固定展示顺序：GPT娘v2 紧跟在 GPT娘v1 下面，其余按角色排
const STORE_ORDER = ['v1', 'dsh1', 'gptv1', 'gpt', 'claude', 'gemini', 'glm', 'grok', 'kimi', 'qwen'];
const STORE_RANK = new Map(STORE_ORDER.map((id, i) => [id, i]));
// 未下载的形象包也要有预览图：CSP 不允许远程图片，远程 cover 只会裂图，
// 所以所有目录里的包都把封面预置在 assets/thumbs/<id>.webp。
const storeThumb = (id) => '../assets/thumbs/' + id + '.webp';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function storeCard(opts) {
  const cover = opts.cover
    ? `<img class="store-cover" src="${esc(opts.cover)}" alt="">`
    : `<div class="store-cover store-cover-ph">${esc(String(opts.name || '?').trim().charAt(0))}</div>`;
  const pct = Math.round((dlProgress[opts.id] || 0) * 100);
  const bar = pct > 0 && pct < 100 ? `<div class="store-progress"><i style="width:${pct}%"></i></div>` : '';
  return '<div class="store-item" title="' + esc(opts.tip || '') + '">' + cover +
    '<div class="store-meta"><b>' + esc(opts.name) + '</b><span>' + esc(opts.sub) + '</span>' + bar + '</div>' +
    '<div class="store-actions">' + opts.actions + '</div></div>';
}

const BUILTIN_ROWS = () => {
  const rows = [{
    id: 'v1', label: '大肥鱼', cover: '../assets/thumbs/v1.webp',
    sub: '逐帧动画 · ' + (window.PET_ANIMS || []).length + (PLUS.v1 ? '+' + PLUS.v1.actions.length : '') + ' 动作' + (PLUS.v1 ? '（含扩充）' : ''),
  }];
  // GPT娘v1 的素材改成按需下载（素材仓库 Release），装了才出现在列表里
  if (CHARS.gpt) rows.push({ id: 'gpt', storeKey: 'gptv1', label: 'GPT娘v1', cover: '../assets/thumbs/gptv1.webp', sub: '73 帧图集 · 已下载', del: 'gptv1' });
  return rows;
};

function renderStore() {
  if (!setStore) return;
  const rows = [];
  const add = (key, html) => rows.push({ key, html });

  const plusRow = (id) => {
    const p = PACKS[id];
    if (!p) return;
    const target = PLUS_TARGET[id];
    add(id, storeCard({
      id, name: shortPackName(p.name), cover: p.cover, tip: (p.license || '') + ' · ' + p.name,
      sub: p.actions.length + ' 动作 · ' + fmtMB(p.bytes),
      actions: '<button disabled title="动作已并入 ' + esc(CHARS[target] ? CHARS[target].label : target) + '">已并入</button>' +
               '<button class="danger" data-del="' + esc(id) + '">卸载</button>',
    }));
  };

  for (const b of BUILTIN_ROWS()) {
    add(b.storeKey || b.id, storeCard({
      id: b.id, name: b.label, cover: b.cover, tip: '内置形象',
      sub: b.sub,
      actions: '<button data-char="' + esc(b.id) + '"' + (S.character === b.id ? ' class="on"' : '') + '>' +
               (S.character === b.id ? '使用中' : '使用') + '</button>' +
               (b.del ? '<button class="danger" data-del="' + esc(b.del) + '">卸载</button>' : ''),
    }));
    if (b.id === 'v1') plusRow('dsh1');   // 扩充包紧跟在大肥鱼下面
  }

  for (const id of Object.keys(PACKS).sort()) {
    if (Object.values(CODE_CHAR_PACKS).includes(id)) continue;   // 素材型包已在上面以内置形象身份出现
    if (PLUS_TARGET[id]) continue;                     // 扩充包单独放在大肥鱼下面
    const p = PACKS[id];
    const plusFor = PLUS_TARGET[id];
    // 图集形象：包只是素材载体，切换要用代码里的形象 key（gpt）
    const codeKey = Object.keys(CODE_CHAR_PACKS).find((k) => CODE_CHAR_PACKS[k] === id);
    const using = codeKey ? S.character === codeKey : S.character === 'pack:' + id;
    const acts = plusFor
      ? '<button disabled title="动作已并入 ' + esc(CHARS[plusFor] ? CHARS[plusFor].label : plusFor) + '">已并入</button>'
      : '<button data-char="' + esc(codeKey || 'pack:' + id) + '"' + (using ? ' class="on"' : '') + '>' +
        (using ? '使用中' : '使用') + '</button>';
    const sub = codeKey
      ? (p.actions.length ? p.actions.length + ' 个素材' : '素材包') + ' · ' + fmtMB(p.bytes)
      : p.actions.length + ' 个动作 · ' + fmtMB(p.bytes) + (p.version ? ' · v' + p.version : '');
    add(id, storeCard({
      id, name: shortPackName(p.name), cover: p.cover, tip: (p.license || '') + ' · ' + p.name, sub,
      actions: acts + '<button class="danger" data-del="' + esc(id) + '">卸载</button>',
    }));
  }

  for (const c of CATALOG) {
    if (RETIRED_PACKS.has(c.id)) continue;
    const installed = PACKS[c.id];
    const canUpdate = installed && c.version && window.PetLib.format.isNewer(c.version, installed.version);
    if (installed && !canUpdate) continue;
    const pending = dlProgress[c.id] !== undefined;
    const label = installed ? '可更新' : '下载';
    const btn = pending ? '<button disabled>下载中…</button>' : '<button data-download="' + esc(c.id) + '">' + label + '</button>';
    add(c.id, storeCard({
      id: c.id, name: shortPackName(c.name),
      cover: STORE_RANK.has(c.id) && c.id !== 'v1' ? storeThumb(c.id) : '',
      tip: '来自 GitHub（加速链接）',
      sub: c.actions + ' 动作 · ' + fmtMB(c.zipBytes) + (installed ? ' · 已安装 v' + (installed.version || '?') : ' · 未安装') + (c.version ? ' · v' + c.version : ''),
      actions: btn,
    }));
  }

  // 已安装/可下载都按同一顺序排；目录里以后新增的包排在已知角色后面
  rows.sort((a, b) => {
    const ra = STORE_RANK.has(a.key) ? STORE_RANK.get(a.key) : 1e6;
    const rb = STORE_RANK.has(b.key) ? STORE_RANK.get(b.key) : 1e6;
    return ra - rb || a.key.localeCompare(b.key);
  });
  const parts = rows.map((r) => r.html);

  if (!parts.length) {
    parts.push('<div class="store-empty">' + (catalogErr ? '暂时连不上形象列表（' + esc(catalogErr) + '）' : '还没有可用的形象包') + '</div>');
  }
  parts.push('<div class="set-row store-import">' +
    '<button data-import="1">从本地文件导入（.zip）…</button>' +
    '<button data-refresh="1">刷新列表</button></div>');
  setStore.innerHTML = parts.join('');
}

async function loadCatalog() {
  try {
    const list = await window.go.main.App.FetchCharacterCatalog();
    CATALOG = list || [];
    catalogErr = '';
  } catch (e) {
    CATALOG = [];
    catalogErr = (e && e.message) ? e.message : String(e);
  }
  renderStore();
}

async function downloadPack(id) {
  const item = CATALOG.find((c) => c.id === id);
  if (!item || !item.url) return;
  dlProgress[id] = 0;
  renderStore();
  try {
    await window.go.main.App.InstallCharacter(id, item.url);
    delete dlProgress[id];
    await refreshPacks(id === 'dsh1' ? null : id);
    applyCharacter(S.character, false);
  } catch (e) {
    delete dlProgress[id];
    renderStore();
    alert(tr('下载失败：' + (e && e.message ? e.message : e)));
  }
}

async function refreshPacks(selectId) {
  const list = await window.go.main.App.ListInstalledCharacters();
  // 先清空再重建，否则卸载掉的包还会留在 PACKS/CHARS 里
  for (const k of Object.keys(PACKS)) delete PACKS[k];
  for (const k of Object.keys(CHARS)) if (k.startsWith('pack:')) delete CHARS[k];
  for (const k of Object.keys(PLUS)) delete PLUS[k];
  for (const p of list || []) registerPack(p);
  refreshCodeChars();
  // 启动时 v1 的动作表先于形象包应用，dsh1 扩充包扫到后必须重算；
  // 卸载扩充包时也要重算，把已经并进去的动作清掉。
  if (S.character === 'v1' || PLUS[S.character]) applyCharacter(S.character, false);
  renderStore();
  if (selectId && CHARS['pack:' + selectId]) applyCharacter('pack:' + selectId, true);
}

// GPT娘v1 的定义留在代码里，素材在用户目录；没装就隐藏，切过来的话回落 v1
function refreshCodeChars() {
  for (const key of Object.keys(CODE_CHAR_PACKS)) {
    const packId = CODE_CHAR_PACKS[key];
    const wasCurrent = S.character === key;
    if (PACKS[packId]) {
      const dir = '../characters/' + packId + '/';
      const changed = !CHARS[key] || CHARS[key].dir !== dir;
      if (!CHARS[key]) CHARS[key] = Object.assign({}, CODE_CHAR_DEFS[key], { dir });
      else CHARS[key].dir = dir;
      // GPT娘v1 的图集路径写在 SPRITE 配置里（原先是内置路径），素材包就位后要指向用户目录并强制重载
      if (key === 'gpt') {
        const want = dir + 'spritesheet.webp';
        if (SPRITE.sheet !== want) {
          SPRITE.sheet = want;
          spriteSheetImg = null;
        }
      }
      // 启动时它可能已经按「还没就位的旧路径」应用过一次（图集 404 = 隐形），
      // 目录变了就必须重新应用，否则「使用中」的形象和实际显示的对不上
      if (changed && wasCurrent) applyCharacter(key, false);
    } else {
      if (CHARS[key]) delete CHARS[key];
      if (wasCurrent) applyCharacter('v1', true);
    }
  }
}

async function loadInstalledCharacters() {
  try { await refreshPacks(); } catch (e) { console.warn('读取形象包失败', e); }
  loadCatalog();
}

// 下载进度事件（Go 侧 InstallCharacter 每读一块就 emit 一次）
if (window.runtime && window.runtime.EventsOn) {
  window.runtime.EventsOn('character-progress', (p) => {
    if (!p || !p.id || !p.total) return;
    dlProgress[p.id] = Math.min(1, p.downloaded / p.total);
    if (settingsOpen) renderStore();
  });
}

async function importPack() {
  try {
    const picked = await window.runtime.OpenFileDialog({
      Title: '选择形象包（.zip）',
      Filters: [{ DisplayName: '形象包', Pattern: '*.zip' }],
    });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    const id = await window.go.main.App.InstallCharacterFromFile(file);
    await refreshPacks(id);
  } catch (e) {
    alert(tr('导入失败：' + (e && e.message ? e.message : e)));
  }
}

async function removePack(id) {
  const name = PACKS[id] ? PACKS[id].name : id;
  if (!confirm('确定卸载「' + name + '」吗？动画文件会从本机删除。')) return;
  try {
    await window.go.main.App.RemoveCharacter(id);
    // 全量重建：清掉 PACKS/CHARS/PLUS（扩充包的动作要一并从 v1 的池子里移除，
    // 否则 v1 还会去播已经删掉的文件）；再刷新远程目录，卸载的包重新出现在「可下载」里
    await refreshPacks();
    loadCatalog();
    applyCharacter(S.character === 'pack:' + id ? 'v1' : S.character, false);
  } catch (e) {
    alert(tr('卸载失败：' + (e && e.message ? e.message : e)));
  } finally {
    renderStore();   // 任何一步出错都要把列表重画，别留下刷到一半的状态
  }
}
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
function startMaybeShowTimer() {
  setInterval(maybeShow, 500);
}

function maybeShow() {
  const now = Date.now();
  if (now - lastAutoAt < S.autoActionSec * 1000) return;
  if (oneShotPlaying || S.dragging || !S.awake || S.autoDoze || S.pomoRunning) return;
  lastAutoAt = now;
  if (charNow().kind === 'sprite') {
    const key = pick(['waving', 'jumping', 'review', 'waiting', 'failed', 'work']);
    playOnce([`__sprite:${key}`]);
    return;
  }
  if (Math.random() < 0.25) {
    const w = usable(WHISPERS);
    if (w.length) {
      playOnce(w);
      sayScene('click', pick(quipsPool()), 3600);
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
  const kind = window.PetLib.anim.baseKind({
    dragging: S.dragging,
    awake: S.awake,
    autoDoze: S.autoDoze,
    pomoRunning: S.pomoRunning,
    pomoResting,
    satiety: S.satiety,
    swimming: P.swimming,
  });
  if (kind === 'pomo') {
    playAnim(pomoAnim || ANIM.work, true);
    return;
  }
  if (ch.kind === 'pose' && kind === 'idle') {
    // 立绘形象用各自配置的待机姿势（各套立绘的区分点之一）
    setPose(pick(ch.idle), true);
    return;
  }
  playAnim(ANIM[kind] || ANIM.idle, true);
}
