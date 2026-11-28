/*
 * 主进程 init 状态应用：设置、形象、字体、位置与问候。
 */

/** @param {import('../types').InitPayload} st */
function handleInit(st) {
  S.satiety = st.satiety;
  S.mood = st.mood;
  S.awake = st.awake;
  S.ledger = st.ledger || null;
  const set = st.settings || {};
  S.ledgerOn = set.ledger !== false;
  S.autoStart = !!set.autoStart;
  S.safeResume = set.safeResume !== false;
  S.fullscreenHide = set.fullscreenHide !== false;
  S.memeOrder = set.memeOrder === 'random' ? 'random' : 'queue';
  S.powerSave = window.PetLib.powerSave.normalizeMode(set.powerSave);
  if (st.power && typeof st.power === 'object') {
    S.powerKnown = st.power.known === true;
    S.onAC = st.power.onAC !== false;
  }
  applyPowerProfile();
  S.launchApp = typeof set.launchApp === 'string' ? set.launchApp : '';
  applyFontFamily(set.fontFamily, false);
  applyLedgerUI();
  // 形象包要读磁盘、是异步的：先按内置形象起来，读完再把保存的包形象应用回去。
  // 不要在包装好前就按包路径加载，否则 gpt 图集会先 404 一次（表现为闪一下空白）。
  const savedChar = String(set.character || 'v1');
  const needsPack = savedChar.startsWith('pack:') || !!CODE_CHAR_PACKS[savedChar];
  applyCharacter(needsPack ? 'v1' : savedChar, false);
  // 包形象要等注册完再问候，否则会在「先按 v1 起来」的阶段说成大肥鱼。
  const greet = () => {
    const hi = creditsLine();
    const hello = charIntro();
    setTimeout(() => say(hi ? `${hello} ${hi}` : hello, 4600), 700);
  };
  if (!needsPack) greet();
  loadInstalledCharacters().then(() => {
    if (needsPack && CHARS[savedChar]) applyCharacter(savedChar, false);
    if (needsPack) greet();
  });
  applyFontSize(set.fontSize, false);
  applyFontWeight(set.fontWeight, false);
  applySfx(set.sfx, false);
  S.lang = ['zh', 'en', 'ja'].includes(set.lang) ? set.lang : 'zh';
  applyLanguage(S.lang, false);
  applyAutoActionSec(set.autoActionSec || 40, false);
  S.ledgerSource = API_SOURCES.includes(set.ledgerSource) ? set.ledgerSource : 'deepseek';
  S.autoUpdate = set.autoUpdate === true;
  S.onlyPrimarySound = set.onlyPrimarySound === true;
  S.multiWarnOff = set.multiWarnOff === true;
  if (st.instance && typeof st.instance === 'object') {
    S.instance = { ...S.instance, ...st.instance };
  }
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
    // 新开的宠物错开出生位置，避免和已有的完全重叠
    const slot = (S.instance && S.instance.slot) || 1;
    P.x = clamp(b.maxX - 80 - (slot - 1) * 64, b.minX, b.maxX);
    P.y = clamp(b.maxY - 60 - (slot - 1) * 48, b.minY, b.maxY);
  }
  applyDock(set.dock, false);
  // 初始化完成前不上报位置，避免把游戏开始前的 (0,0) 写进状态
  window.__petPosReady = true;
  const firstReport = api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale, force: true });
  Promise.resolve(firstReport).then(
    () => requestAnimationFrame(markPetReady),
    () => requestAnimationFrame(markPetReady),
  );
  setTimeout(markPetReady, 1500); // Region 上报异常时也不能一直藏着
  applyHungry();
  applyDoze();
  applyBase();
  syncSettingsUI();
}

function handlePowerMode(p) {
  if (!p) return;
  S.powerKnown = p.known === true;
  S.onAC = p.onAC !== false;
  if (p.mode) S.powerSave = window.PetLib.powerSave.normalizeMode(p.mode);
  applyPowerProfile();
  syncSettingsUI();
  updatePowerHint();
}

function handlePowerResume(p) {
  try {
    if (p && Number.isFinite(p.x)) P.x = p.x;
    if (p && Number.isFinite(p.y)) P.y = p.y;
    clampInBounds();
    api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
    if (menuOpen) positionMenu();
    if (settingsOpen) positionSettings();
    if (pickerOpen) positionPicker();
  } finally {
    if (api.powerAck) api.powerAck(p && p.seq);
  }
}

function handleKeysUpdated(keys) {
  S.apiKeys = keys || {};
  applyKeysUI();
}

function handleWordsUpdated(w) {
  S.customQuips = Array.isArray(w && w.customQuips) ? w.customQuips : [];
  S.useCustomQuips = !w || w.useCustomQuips !== false;
  syncWordsUI();
}

function handleUsage(l) {
  S.ledger = l;
  usagePending = false;
  // 账本气泡开着的时候，异步结果回来必须就地重渲染：
  // 以前只写进 S.ledger，用户看到的是打开瞬间那份空数据（issue #3）
  if (l && !usageEl.classList.contains('hide') && bubbleEl.classList.contains('show')) {
    showUsage(l, false);
  }
  syncLedgerDiag(l);
}

function handleShowUsage(l) {
  if (l) S.ledger = l;
  showUsage(l);
}

function handleFeed(st) {
  if (st) {
    S.satiety = st.satiety;
    S.mood = st.mood;
    applyHungry();
  }
  playEat();
}

function handleAwake(v) {
  S.awake = !!v;
  if (S.awake) wake();
  applyDoze();
  if (!S.awake) sayScene('sleep', pick(sleepLines()), 2600);
}

function handlePomodoroDone() {
  setPomodoro({ running: false, remaining: 0 });
  if (S.dock === 'roam') P.swimTo = { x: innerWidth / 2 - PET.cx, y: innerHeight / 2 - PET.cy };
  playHappy();
  burstHearts(6);
  sayScene('happy', '专注结束啦，起来动一动～', 5000);
  renderPomoStats();
}

function handleCursor(c) {
  S.mouse.x = c.x;
  S.mouse.y = c.y;
  lastCursorAt = performance.now();
  applyLean(c.x, c.y);
  if (c.over && !S.over) wake();
  S.over = !!c.over;
}

