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
  if (save) {
    saveSettings();
    if (bubbleEl.classList.contains('show')) {
      requestAnimationFrame(() => {
        positionBubble();
        reportRegionNow(true);
      });
    }
  }
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
  if (save) saveSettings();
}

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

function visiblePetRect() {
  return window.PetLib.petRect.visibleRect(P.x, P.y, petScale, PET);
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
  if (id === 'startup') refreshAutostartHint();
  if (id === 'pomo') renderPomoStats();
  if (id === 'ledger') syncLedgerDiag(S.ledger);
  if (id === 'place') refreshFsDiag(false);
  const body = settingsEl.querySelector('.set-body');
  if (body) body.scrollTop = 0;
  positionSettings();
}

async function openSettings() {
  closeMenu();
  closePicker();
  syncSettingsUI();
  // 先扩 Region 再显示设置；等待串行队列把之前的关闭调用处理完
  await ensurePanelOpen();
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

