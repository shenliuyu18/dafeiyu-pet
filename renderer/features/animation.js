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

function resetSpriteConfig() {
  SPRITE.sheet = '';
  SPRITE.sequences = {};
  for (const k of Object.keys(SPRITE_MAP)) delete SPRITE_MAP[k];
}

// 图集类形象（gptv1）的尺寸、帧序列与动作映射全部来自包内 sprite 块。
// 老包没有这个块时视为需要重新下载，不保留任何内置排版参数。
function registerCodeChar(key, pack) {
  // 老包没有 sprite 描述时回落到兼容参数，避免“装了但不能播”被当成可更新
  const sp = window.PetLib.legacyPack.spriteFor(pack);
  if (!sp || !sp.sequences) {
    delete CHARS[key];
    return;
  }
  const dir = `../characters/${pack.id}/`;
  const sheet = dir + (sp.sheet || 'spritesheet.webp');
  const prev = CHARS[key];
  if (!prev || prev.dir !== dir || prev.sheet !== sheet) spriteSheetImg = null;
  Object.assign(SPRITE, {
    sheet,
    cellW: sp.cellW || 192,
    cellH: sp.cellH || 208,
    cols: sp.cols || 0,
    rows: sp.rows || 0,
    sequences: sp.sequences,
  });
  for (const k of Object.keys(SPRITE_MAP)) delete SPRITE_MAP[k];
  Object.assign(SPRITE_MAP, sp.map || {});
  CHARS[key] = {
    label: pack.name || key,
    kind: 'sprite',
    dsh: false,
    dir,
    sheet,
    pack,
    actions: (sp.actions || []).map((a) => [a.key, a.label]),
  };
}

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
  const codeKey = Object.keys(CODE_CHAR_PACKS).find((k) => CODE_CHAR_PACKS[k] === pack.id);
  if (codeKey) {
    registerCodeChar(codeKey, pack);
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

// 包内台词/动作名译文随安装列表整体重建；卸载后对应词条立即消失。
function rebuildPackI18n() {
  const lines = { en: {}, ja: {} };
  const ui = { en: {}, ja: {} };
  for (const p of Object.values(PACKS)) {
    if (!p.i18n) continue;
    for (const lang of ['en', 'ja']) {
      const loc = p.i18n[lang];
      if (!loc) continue;
      Object.assign(lines[lang], loc.lines || {});
      Object.assign(ui[lang], loc.categories || {}, loc.actions || {});
    }
  }
  window.PetLib.i18n.setPackDictionaries(lines, ui);
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
// 商店 DOM 只在「形象与音效」页打开时存在；目录数据一旦拿到就常驻内存。
let storeBuilt = false;
let storeDirty = true;
let catalogLoaded = false;
let catalogLoading = null;

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
  return '<div class="store-item" data-store-id="' + esc(opts.id) + '" title="' + esc(opts.tip || '') + '">' + cover +
    '<div class="store-meta"><b>' + esc(opts.name) + '</b><span>' + esc(opts.sub) + '</span>' + bar + '</div>' +
    '<div class="store-actions">' + opts.actions + '</div></div>';
}

// 商店文案走 i18n：T(中文模板, 变量) 会按当前语言翻译并用变量替换 {x}
const TT = (zh, vars) => (window.PetLib && window.PetLib.i18n && window.PetLib.i18n.T) ? window.PetLib.i18n.T(zh, vars) : zh;

const BUILTIN_ROWS = () => {
  const n1 = (window.PET_ANIMS || []).length + (PLUS.v1 ? '+' + PLUS.v1.actions.length : '');
  const rows = [{
    id: 'v1', label: '大肥鱼', cover: '../assets/thumbs/v1.webp',
    sub: TT('逐帧动画 · {n} 动作', { n: n1 }) + (PLUS.v1 ? TT('（含扩充）') : ''),
  }];
  // GPT娘v1 的素材改成按需下载（素材仓库 Release），装了才出现在列表里
  if (CHARS.gpt) rows.push({ id: 'gpt', storeKey: 'gptv1', label: 'GPT娘v1', cover: '../assets/thumbs/gptv1.webp', sub: TT('{n} 帧图集 · 已下载', { n: 73 }), del: 'gptv1' });
  return rows;
};

function renderStore() {
  if (!setStore) return;
  // 设置没打开时不要预先建 DOM：商店在隐藏页里，首帧前渲染纯属浪费。
  if (!settingsOpen) {
    storeDirty = true;
    return;
  }
  const rows = [];
  const add = (key, html) => rows.push({ key, html });

  const plusRow = (id) => {
    const p = PACKS[id];
    if (!p) return;
    const target = PLUS_TARGET[id];
    add(id, storeCard({
      id, name: shortPackName(p.name), cover: p.cover, tip: (p.license || '') + ' · ' + p.name,
      sub: TT('{n} 动作 · {size}', { n: p.actions.length, size: fmtMB(p.bytes) }),
      actions: '<button disabled title="动作已并入 ' + esc(CHARS[target] ? CHARS[target].label : target) + '">已并入</button>' +
               '<button class="danger" data-del="' + esc(id) + '">卸载</button>',
    }));
  };

  for (const b of BUILTIN_ROWS()) {
    add(b.storeKey || b.id, storeCard({
      id: b.id, name: b.label, cover: b.cover, tip: TT('内置形象'),
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
      ? (p.actions.length ? TT('{n} 个素材 · {size}', { n: p.actions.length, size: fmtMB(p.bytes) }) : TT('素材包') + ' · ' + fmtMB(p.bytes))
      : TT('{n} 个动作 · {size}', { n: p.actions.length, size: fmtMB(p.bytes) }) + (p.version ? ' · v' + p.version : '');
    add(id, storeCard({
      id, name: shortPackName(p.name), cover: p.cover, tip: (p.license || '') + ' · ' + p.name, sub,
      actions: acts + '<button class="danger" data-del="' + esc(id) + '">卸载</button>',
    }));
  }

  for (const c of CATALOG) {
    if (RETIRED_PACKS.has(c.id)) continue;
    const installed = PACKS[c.id];
    const codeKey = Object.keys(CODE_CHAR_PACKS).find((k) => CODE_CHAR_PACKS[k] === c.id);
    // 老版 gptv1 包没有 sprite 配置，装了也不能播，按「可更新」重新下载
    const installedUsable = installed && (!codeKey || !!CHARS[codeKey]);
    // 旧包 / 本地导入的包没有 version 字段，此时无法比较版本，不应提示「可更新」，
    // 否则会把「已安装且能用」的包又列成可更新（仓库其实并没有发新版本）。
    const canUpdate = installedUsable &&
      window.PetLib.format.needsUpdate(c.version, installed.version);
    if (installedUsable && !canUpdate) continue;
    const pending = dlProgress[c.id] !== undefined;
    const label = installed ? TT('可更新') : TT('下载');
    const btn = pending ? '<button disabled>' + TT('下载中…') + '</button>' : '<button data-download="' + esc(c.id) + '">' + label + '</button>';
    add(c.id, storeCard({
      id: c.id, name: shortPackName(c.name),
      cover: STORE_RANK.has(c.id) && c.id !== 'v1' ? storeThumb(c.id) : '',
      tip: TT('来自 GitHub（加速链接）'),
      sub: TT('{n} 动作 · {size}', { n: c.actions, size: fmtMB(c.zipBytes) }) + (installed ? ' · ' + TT('已安装') + ' v' + (installed.version || '?') : ' · ' + TT('未安装')) + (c.version ? ' · v' + c.version : ''),
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
    parts.push('<div class="store-empty">' + (catalogErr ? TT('暂时连不上形象列表（{e}）', { e: esc(catalogErr) }) : TT('还没有可用的形象包')) + '</div>');
  }
  parts.push('<div class="set-row store-import">' +
    '<button data-import="1">从本地文件导入（.zip）…</button>' +
    '<button data-refresh="1">刷新列表</button></div>');
  // 一次解析、一次插入；比逐卡 appendChild 少一轮布局抖动
  const tpl = document.createElement('template');
  tpl.innerHTML = parts.join('');
  setStore.replaceChildren(tpl.content);
  storeBuilt = true;
  storeDirty = false;
}

// 目录/已装包变化或下载状态变化时统一走这里：只有商店可见才真正重绘。
function markStoreDirty() {
  storeDirty = true;
  if (storeBuilt && settingsOpen) renderStore();
}

async function loadCatalog(force) {
  if (!force && catalogLoaded) return;
  if (catalogLoading) return catalogLoading;
  catalogLoading = (async () => {
    try {
      const list = await window.go.main.App.FetchCharacterCatalog();
      CATALOG = list || [];
      catalogErr = '';
      catalogLoaded = true;
    } catch (e) {
      CATALOG = [];
      catalogErr = (e && e.message) ? e.message : String(e);
    }
    catalogLoading = null;
    markStoreDirty();
  })();
  return catalogLoading;
}

// 只在第一次打开「形象与音效」时拉目录并建商店 DOM；之后复用缓存。
function ensureStoreReady() {
  if (!storeBuilt || storeDirty) renderStore();
  if (!catalogLoaded) loadCatalog();
}

async function downloadPack(id) {
  const item = CATALOG.find((c) => c.id === id);
  if (!item || !item.url) return;
  dlProgress[id] = 0;
  markStoreDirty();
  try {
    await window.go.main.App.InstallCharacter(id, item.url);
    delete dlProgress[id];
    await refreshPacks(id === 'dsh1' ? null : id);
    applyCharacter(S.character, false);
  } catch (e) {
    delete dlProgress[id];
    markStoreDirty();
    await askConfirm({ title: '下载失败', message: tr(String((e && e.message) || e)), alert: true });
  }
}

async function refreshPacks(selectId) {
  const list = await window.go.main.App.ListInstalledCharacters();
  // 先清空再重建，否则卸载掉的包还会留在 PACKS/CHARS 里
  for (const k of Object.keys(PACKS)) delete PACKS[k];
  for (const k of Object.keys(CHARS)) if (k.startsWith('pack:') || CODE_CHAR_PACKS[k]) delete CHARS[k];
  for (const k of Object.keys(PLUS)) delete PLUS[k];
  resetSpriteConfig();
  for (const p of list || []) registerPack(p);
  rebuildPackI18n();
  // 启动时 v1 的动作表先于形象包应用，dsh1 扩充包扫到后必须重算；
  // 卸载扩充包时也要重算，把已经并进去的动作清掉。
  if (S.character === 'v1' || PLUS[S.character]) applyCharacter(S.character, false);
  else if (CODE_CHAR_PACKS[S.character]) {
    // gptv1 图集参数来自包；老包缺 sprite 块时回落到大肥鱼
    applyCharacter(CHARS[S.character] ? S.character : 'v1', !CHARS[S.character]);
  } else if (S.character.startsWith('pack:') && !CHARS[S.character]) {
    // 另一只宠物卸载了本实例正在用的形象包：回落到内置形象
    applyCharacter('v1', true);
  }
  markStoreDirty();
  if (selectId && CHARS['pack:' + selectId]) applyCharacter('pack:' + selectId, true);
}

async function loadInstalledCharacters() {
  // 只扫本地包；远程目录等第一次打开商店时再拉（2.1 启动瘦身）
  try { await refreshPacks(); } catch (e) { console.warn('读取形象包失败', e); }
}

const progressPending = new Set();
let progressTimer = 0;

function updateStoreProgress(id) {
  if (!setStore) return;
  const card = [...setStore.querySelectorAll('.store-item')].find((el) => el.dataset.storeId === id);
  if (!card) return;
  const pct = window.PetLib.storeProgress.percent(dlProgress[id] || 0);
  let bar = card.querySelector('.store-progress');
  if (!bar) {
    if (pct <= 0 || pct >= 100) return;
    const meta = card.querySelector('.store-meta');
    if (!meta) return;
    bar = document.createElement('div');
    bar.className = 'store-progress';
    bar.appendChild(document.createElement('i'));
    meta.appendChild(bar);
  }
  const fill = bar.firstElementChild;
  if (fill) fill.style.width = pct + '%';
}

// 进度事件 100ms 合并一次，只改对应卡片的进度条；完成/失败才整表重绘。
function scheduleStoreProgress(id) {
  progressPending.add(id);
  if (progressTimer) return;
  progressTimer = setTimeout(() => {
    progressTimer = 0;
    const ids = [...progressPending];
    progressPending.clear();
    if (!settingsOpen || !storeBuilt) return;
    for (const one of ids) updateStoreProgress(one);
  }, 100);
}

function applyCharacterProgress(p) {
  if (!p || !p.id || !p.total) return;
  dlProgress[p.id] = window.PetLib.storeProgress.mergeProgress(dlProgress[p.id], p.downloaded, p.total);
  if (settingsOpen && storeBuilt) scheduleStoreProgress(p.id);
}

// 下载进度事件（Go 侧 InstallCharacter 每读一块就 emit 一次）
// Wails v2 没有 window.runtime.EventsOn；api 在 pet.js 里才初始化，必须等 pet-api-ready 再注册。
window.addEventListener && window.addEventListener('pet-api-ready', () => {
  if (window.pet && window.pet.on) window.pet.on('character-progress', applyCharacterProgress);
});
// 调试 / 性能预算钩子：合成进度事件，验证不会产生 >50ms 长任务
window.__storeProgress = (id, downloaded, total) => applyCharacterProgress({ id, downloaded, total });

async function importPack() {
  try {
    // 走 Wails v2 后端弹框（window.runtime.OpenFileDialog 是 v1 的 API，v2 里不存在）
    const picked = await window.go.main.App.PickPackFile();
    if (!picked) return;
    const id = await window.go.main.App.InstallCharacterFromFile(picked);
    await refreshPacks(id);
  } catch (e) {
    await askConfirm({ title: '导入失败', message: tr(String((e && e.message) || e)), alert: true });
  }
}

async function removePack(id) {
  const name = PACKS[id] ? PACKS[id].name : id;
  const ok = await askConfirm({
    title: '卸载形象包',
    message: `确定卸载「${name}」吗？动画文件会从本机删除。`,
    okText: '卸载',
    danger: true,
  });
  if (!ok) return;
  try {
    await window.go.main.App.RemoveCharacter(id);
    // 全量重建：清掉 PACKS/CHARS/PLUS（扩充包的动作要一并从 v1 的池子里移除，
    // 否则 v1 还会去播已经删掉的文件）；再刷新远程目录，卸载的包重新出现在「可下载」里
    await refreshPacks();
    loadCatalog();
    applyCharacter(S.character === 'pack:' + id ? 'v1' : S.character, false);
  } catch (e) {
    await askConfirm({ title: '卸载失败', message: tr(String((e && e.message) || e)), alert: true });
  } finally {
    markStoreDirty();   // 任何一步出错都要把列表重画，别留下刷到一半的状态
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
  if (S.onlyPrimarySound && S.instance && !S.instance.leader) return;
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
  // 正在看白饭账本（账本气泡开着）时不要被自动动作打断
  if (typeof usageEl !== 'undefined' && typeof bubbleEl !== 'undefined' &&
      !usageEl.classList.contains('hide') && bubbleEl.classList.contains('show')) return;
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
  // 基础动画切换（待机 ↔ 漫游、拖拽 ↔ 待机等）也会改变 alpha 形状。
  // 给视频形象短暂保持整窗 Region，避免新形状边缘先被旧区域裁一下。
  if (ch.kind === 'video' && api.holdRegion) api.holdRegion(160);
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
