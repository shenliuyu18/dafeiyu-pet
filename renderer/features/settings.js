/*
 * 设置页读写：保存设置、同步控件状态、账本开关。
 * 依赖 pet.js 的全局状态与 DOM 引用，调用时已初始化。
 */
(function (root) {
  'use strict';

function saveSettings() {
  api.saveSettings(window.PetLib.settingsPayload.settingsPayload(S, petScale));
}

function syncKeyBtn(btn, provider) {
  if (!btn) return;
  btn.dataset.key = provider;
  const has = !!S.apiKeys[provider];
  const name = API_LABEL[provider] || provider;
  const label = btn.querySelector('.klabel');
  const state = btn.querySelector('.kstate');
  const badge = document.getElementById('set-key-badge');
  if (label) label.textContent = `填写 ${name} API Key`;
  if (state) state.textContent = has ? '已配置' : '去填写';
  if (badge) {
    badge.textContent = has ? '已配置 ✓' : '待填写';
    badge.classList.toggle('ok', has);
  }
  btn.classList.toggle('ok', has);
}

function syncSegmentButtons(group, isSelected) {
  if (!group) return;
  for (const btn of group.querySelectorAll('button')) {
    const selected = !!isSelected(btn);
    btn.classList.toggle('on', selected);
    btn.setAttribute('aria-pressed', String(selected));
  }
}

function syncSettingsUI() {
  setSizeVal.textContent = `${Math.round(petScale * 100)}%`;
  syncSegmentButtons(setSizes, (btn) => Math.abs(Number(btn.dataset.size) - petScale) < 0.001);
  setFontVal.textContent = `${Math.round(S.fontScale * 100)}%`;
  syncSegmentButtons(setFontWeights, (btn) => Number(btn.dataset.fw) === S.fontWeight);
  syncSegmentButtons(setFonts, (btn) => btn.dataset.font === S.fontFamily);
  syncSegmentButtons(setSfx, (btn) => btn.dataset.sfx === S.sfx);
  syncSegmentButtons(setLang, (btn) => btn.dataset.lang === S.lang);
  syncSegmentButtons(setLedgerSrc, (btn) => {
    const selected = btn.dataset.ledgerSrc === S.ledgerSource;
    btn.classList.toggle('has-key', !!S.apiKeys[btn.dataset.ledgerSrc]);
    return selected;
  });
  syncKeyBtn(document.getElementById('set-key-btn'), S.ledgerSource);
  setAutoVal.textContent = `${S.autoActionSec} 秒`;
  syncSegmentButtons(setDocks, (btn) => btn.dataset.dock === S.dock);
  setPomoVal.textContent = `${S.pomoMin} 分钟`;
  syncSegmentButtons(setPomoPresets, (btn) => Number(btn.dataset.pomo) === S.pomoMin);
  setPomoAnimVal.textContent = `${S.pomoAnimSec} 秒`;
  syncSegmentButtons(setPomoAnimPresets, (btn) => Number(btn.dataset.pomoAnim) === S.pomoAnimSec);
  syncSegmentButtons(setLedger, (btn) => (btn.dataset.ledger === '1') === S.ledgerOn);
  syncSegmentButtons(setAutoStart, (btn) => (btn.dataset.autostart === '1') === S.autoStart);
  syncSegmentButtons(setSafeResume, (btn) => (btn.dataset.saferesume === '1') === S.safeResume);
  syncSegmentButtons(setFullscreenHide, (btn) => (btn.dataset.fullscreenhide === '1') === S.fullscreenHide);
  syncSegmentButtons(setMemeOrder, (btn) => btn.dataset.memeorder === S.memeOrder);
  syncSegmentButtons(setPowerSave, (btn) => btn.dataset.powersave === S.powerSave);
  syncSegmentButtons(setAutoUpdate, (btn) => (btn.dataset.autoupdate === '1') === S.autoUpdate);
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

