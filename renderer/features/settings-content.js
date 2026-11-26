/*
 * 设置页内容：字体、自定义文字、面板定位与开关。
 */

function setCustomFontFace(file) {
  let style = document.getElementById('user-font-face');
  if (!style) {
    style = document.createElement('style');
    style.id = 'user-font-face';
    document.head.appendChild(style);
  }
  style.textContent = `@font-face{font-family:"UserFont";src:url("/userfonts/${encodeURIComponent(file)}");font-display:swap;}`;
}

function updateFontHint() {
  if (!setFontHint) return;
  const name = customFontName(S.fontFamily);
  setFontHint.textContent = name
    ? `当前：${name}（自定义），重新导入会替换。`
    : '支持 .ttf / .otf / .woff / .woff2；看不清时建议换「雅黑」并把字体大小调大。';
}

// 字体族 / 字号 / 字重都会改变文字排版与气泡尺寸；保存时统一重排气泡并刷新 Region，
// 否则气泡开着改设置会被旧 Region 裁边。
function afterFontChange(save) {
  if (!save) return;
  saveSettings();
  if (bubbleEl.classList.contains('show')) {
    requestAnimationFrame(() => {
      positionBubble();
      reportRegionNow(true);
    });
  }
}

function applyFontFamily(v, save) {
  const raw = typeof v === 'string' ? v : 'soft';
  const custom = customFontName(raw);
  const fam = custom ? 'custom' : FONT_PRESETS.includes(raw) ? raw : 'soft';
  S.fontFamily = custom ? raw : fam;
  if (custom) {
    setCustomFontFace(custom);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('16px "UserFont"', '你好呀蓝色大肥鱼0123456789').catch(() => {});
    }
  }
  document.documentElement.dataset.font = fam;
  updateFontHint();
  syncSettingsUI();
  afterFontChange(save);
}

function importFont() {
  if (typeof api.importFont !== 'function') return;
  const btn = document.getElementById('font-import');
  if (btn) btn.disabled = true;
  Promise.resolve()
    .then(() => api.importFont())
    .then((name) => {
      if (name) applyFontFamily(`custom:${name}`, true);
    })
    .catch(() => {
      if (setFontHint) setFontHint.textContent = '导入失败：请选择 .ttf / .otf / .woff / .woff2 字体文件，且不超过 40 MB。';
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function applyFontSize(v, save) {
  const n = Number(v);
  S.fontScale = clamp(Math.round((Number.isFinite(n) && n > 0 ? n : 1) / FONT_STEP) * FONT_STEP, FONT_MIN, FONT_MAX);
  document.documentElement.style.setProperty('--fs', S.fontScale.toFixed(2));
  syncSettingsUI();
  afterFontChange(save);
}

function applyFontWeight(v, save) {
  const n = Number(v);
  // 只保留常规 / 加粗两档；旧状态里的 500、600 就近归到 400 或 700
  S.fontWeight = Number.isFinite(n) && n >= 550 ? 700 : 400;
  // data-fw 让软糖体这类单字重字体在加粗档允许合成加粗，其余档保持 font-synthesis:none
  document.documentElement.style.setProperty('--fw', String(S.fontWeight));
  document.documentElement.dataset.fw = S.fontWeight === 700 ? 'bold' : 'normal';
  syncSettingsUI();
  afterFontChange(save);
}

function setWordsStatusText(text, kind) {
  if (!setWordsStatus) return;
  setWordsStatus.textContent = text;
  setWordsStatus.classList.toggle('ok', kind === 'ok');
  setWordsStatus.classList.toggle('err', kind === 'err');
}

function syncWordsButtons() {
  const has = S.customQuips.length > 0;
  for (const [btn, selected] of [[setWordsEnable, has && S.useCustomQuips], [setWordsDisable, has && !S.useCustomQuips]]) {
    if (!btn) continue;
    btn.classList.toggle('on', selected);
    btn.setAttribute('aria-pressed', String(selected));
  }
}

function wordsSummary() {
  if (!S.customQuips.length) return '还没有自定义文字，当前使用默认台词。';
  return `已保存 ${S.customQuips.length} 行，当前${S.useCustomQuips ? '启用' : '未启用'}。`;
}

function syncWordsUI() {
  syncWordsButtons();
  setWordsStatusText(wordsSummary());
}

function visiblePetRect() {
  return window.PetLib.petRect.visibleRect(P.x, P.y, petScale, PET);
}

let settingsPosSig = '';

function positionSettings() {
  const w = settingsEl.offsetWidth;
  const h = settingsEl.offsetHeight;
  const v = visiblePetRect();
  // 尺寸、位置、字体都没变时不必再写 left/top（写样式会触发一轮布局）
  const sig = `${w}:${h}:${Math.round(v.left)}:${Math.round(v.top)}:${Math.round(v.right)}:${Math.round(v.bottom)}:${innerWidth}:${innerHeight}`;
  if (sig === settingsPosSig) return;
  settingsPosSig = sig;
  let sx = v.left - w - 10; // 贴着角色左侧
  if (sx < 8) sx = v.right + 10; // 左边放不下就贴右侧
  settingsEl.style.left = `${clamp(sx, 8, Math.max(8, innerWidth - w - 8))}px`;
  settingsEl.style.top = `${clamp(v.top - 6, 8, Math.max(8, innerHeight - h - 8))}px`;
}

function showHome() {
  setTitle.textContent = '⚙️ 设置';
  setBack.classList.add('hide');
  setHome.classList.remove('hide');
  for (const nav of setHome.querySelectorAll('.set-nav')) nav.removeAttribute('aria-current');
  for (const pg of setPages) pg.classList.add('hide');
  const body = settingsEl.querySelector('.set-body');
  if (body) body.scrollTop = 0;
  positionSettings();
  if (settingsOpen) setHome.querySelector('.set-nav').focus({ preventScroll: true });
}

function openSetPage(id) {
  if (!SET_PAGE_TITLES[id]) return showHome();
  setTitle.textContent = SET_PAGE_TITLES[id];
  setBack.classList.remove('hide');
  setHome.classList.add('hide');
  for (const nav of setHome.querySelectorAll('.set-nav')) {
    if (nav.dataset.page === id) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  for (const pg of setPages) pg.classList.toggle('hide', pg.dataset.page !== id);
  if (id === 'look') ensureStoreReady();
  if (id === 'words') syncWordsUI();
  if (id === 'startup') refreshAutostartHint();
  if (id === 'pomo') renderPomoStats();
  if (id === 'help') { refreshFsDiag(false); syncLedgerDiag(S.ledger); }
  const body = settingsEl.querySelector('.set-body');
  if (body) body.scrollTop = 0;
  positionSettings();
  if (settingsOpen) setBack.focus({ preventScroll: true });
}

async function openSettings() {
  closeMenu();
  closePicker();
  const seq = beginPanelOpen();
  syncSettingsUI();
  // 先扩 Region 再显示设置；等待串行队列把之前的关闭调用处理完
  if (!(await ensurePanelOpen(seq))) {
    if (seq === panelOpenSeq) panelPending = false;
    return;
  }
  if (!endPanelOpen(seq)) return;
  settingsEl.classList.remove('hide');
  settingsEl.setAttribute('aria-hidden', 'false');
  showHome();
  positionSettings();
  requestAnimationFrame(() => {
    if (!settingsOpen) return;
    settingsEl.classList.add('show');
    activatePanel(settingsEl);
    // 与右键菜单一致：显示后再扩一次 Region 并重定位。首帧的 Region/尺寸可能还没定稳，
    // 只靠打开前那一次扩窗，个别机器上会让面板停在旧 Region 里被裁掉左侧或边缘。
    positionSettings();
    if (api.setPanel) api.setPanel(true);
    const relayout = () => {
      if (!settingsOpen) return;
      positionSettings();
      if (api.setPanel) api.setPanel(true);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
    setTimeout(relayout, 120);
    setTimeout(relayout, 360);
  });
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
  closePanelFocus(settingsEl);
  settingsEl.setAttribute('aria-hidden', 'true');
  if (api.closeOverlays) api.closeOverlays();
  settingsEl.classList.remove('show');
  setTimeout(() => {
    if (!settingsOpen) {
      settingsEl.classList.add('hide');
      // 商店 DOM（含缩略图解码位图）随面板一起释放，数据仍留在 CATALOG/PACKS
      if (storeBuilt && setStore) {
        setStore.replaceChildren();
        storeBuilt = false;
        storeDirty = true;
      }
    }
  }, 160);
  P.frozen = false;
  api.setPanel(null);
  if (api.setFocusable) api.setFocusable(false);
}

