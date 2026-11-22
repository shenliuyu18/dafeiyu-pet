/*
 * 设置页读写：保存设置、同步控件状态、账本开关。
 * 依赖 pet.js 的全局状态与 DOM 引用，调用时已初始化。
 */
(function (root) {
  'use strict';

function saveSettings() {
  api.saveSettings({
    scale: petScale,
    dock: S.dock,
    pomoMin: S.pomoMin,
    pomoAnimSec: S.pomoAnimSec,
    ledger: S.ledgerOn,
    autoStart: S.autoStart,
    safeResume: S.safeResume,
    fullscreenHide: S.fullscreenHide,
    memeOrder: S.memeOrder,
    launchApp: S.launchApp,
    character: S.character,
    fontFamily: S.fontFamily,
    fontSize: S.fontScale,
    sfx: S.sfx,
    lang: S.lang,
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
  setFontVal.textContent = `${Math.round(S.fontScale * 100)}%`;
  if (setFonts) {
    for (const btn of setFonts.querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.font === S.fontFamily);
    }
  }
  for (const btn of setSfx.querySelectorAll('button')) {
    btn.classList.toggle('on', btn.dataset.sfx === S.sfx);
  }
  if (setLang) {
    for (const btn of setLang.querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.lang === S.lang);
    }
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
  if (setSafeResume) {
    for (const btn of setSafeResume.querySelectorAll('button')) {
      btn.classList.toggle('on', (btn.dataset.saferesume === '1') === S.safeResume);
    }
  }
  if (setFullscreenHide) {
    for (const btn of setFullscreenHide.querySelectorAll('button')) {
      btn.classList.toggle('on', (btn.dataset.fullscreenhide === '1') === S.fullscreenHide);
    }
  }
  if (setMemeOrder) {
    for (const btn of setMemeOrder.querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.memeorder === S.memeOrder);
    }
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

  const settingsApi = { saveSettings, syncSettingsUI, applyLedgerUI };
  root.PetLib = root.PetLib || {};
  root.PetLib.settingsUi = settingsApi;
})(typeof window !== 'undefined' ? window : globalThis);

