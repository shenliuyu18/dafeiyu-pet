/*
 * 启动/更新/位置等设置开关应用。初始化时由 pet.js 调用。
 */

function applyAutoUpdate(on, save) {
  S.autoUpdate = !!on;
  syncSettingsUI();
  if (save) saveSettings();
}

function refreshAutostartHint() {
  if (!setAutoStartHint || typeof api.autostartStatus !== 'function') return;
  Promise.resolve()
    .then(() => api.autostartStatus())
    .then((s) => {
      if (!s || !setAutoStartHint) return;
      if (!s.enabled) setAutoStartHint.textContent = '已关闭：登录 Windows 时不会自动启动。';
      else if (s.task) setAutoStartHint.textContent = '已开启：登录时由计划任务启动，无延迟。';
      else setAutoStartHint.textContent = '已开启，但系统里没有找到计划任务；请再点一次「开启」重建。';
    })
    .catch(() => {});
}

function applyAutoStart(on, save) {
  S.autoStart = on === true || on === '1' || on === 1;
  syncSettingsUI();
  if (save) {
    saveSettings();
    setTimeout(refreshAutostartHint, 900);
  }
}

function applySafeResume(on, save) {
  S.safeResume = !!on;
  syncSettingsUI();
  if (save) saveSettings();
}

function applyFullscreenHide(on, save) {
  S.fullscreenHide = !!on;
  syncSettingsUI();
  if (save) saveSettings();
}

function applyMemeOrder(mode, save) {
  S.memeOrder = mode === 'random' ? 'random' : 'queue';
  resetMemeQueues();
  syncSettingsUI();
  if (save) saveSettings();
}

function applyLinkedApp(p, save) {
  S.launchApp = typeof p === 'string' ? p : '';
  syncSettingsUI();
  if (save) saveSettings();
}

function applyScale(s, save) {
  const v = Number(s);
  petScale = clamp(Math.round((Number.isFinite(v) && v > 0 ? v : DEFAULT_SCALE) / SIZE_STEP) * SIZE_STEP, SIZE_MIN, SIZE_MAX);
  // 用 zoom 而不是 transform: scale：zoom 在排版阶段按最终字号生成字形，
  // 气泡里的文字不会被「先按 100% 字号画好再缩小」而发虚。
  scaleEl.style.zoom = Math.abs(petScale - 1) < 0.001 ? '' : petScale.toFixed(2);
  syncSettingsUI();
  clampInBounds();
  api.reportPos({ x: Math.round(P.x), y: Math.round(P.y), s: petScale });
  if (save) saveSettings();
}

function applyDock(mode, save) {
  S.dock = mode === 'corner' || mode === 'fixed' ? mode : 'roam';
  P.target = null;
  P.pauseUntil = 0;
  if (S.dock === 'corner') {
    // 直接闪现到右下角（向左让出气泡空间）；之后被拖走仍会自己游回角落
    const b = bounds();
    const c = cornerSpot(b);
    P.x = c.x;
    P.y = c.y;
    P.vx = 0;
    P.vy = 0;
    stage.classList.remove('swim');
  }
  if (S.dock === 'fixed') {
    // 固定不动：停在当前位置（拖到哪待在哪），番茄钟也不再游走
    P.vx = 0;
    P.vy = 0;
    P.swimTo = null;
    stage.classList.remove('swim');
  }
  syncSettingsUI();
  if (save) saveSettings();
}

function applyLedgerSource(src, save) {
  S.ledgerSource = API_SOURCES.includes(src) ? src : 'qoder';
  S.ledger = null;
  syncSettingsUI();
  if (save) saveSettings();
}

function applyKeysUI() {
  syncSettingsUI();
}

function applyLedger(on, save) {
  S.ledgerOn = !!on;
  applyLedgerUI();
  syncSettingsUI();
  if (save) saveSettings();
}
