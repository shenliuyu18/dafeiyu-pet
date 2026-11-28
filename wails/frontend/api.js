/* Wails 版 window.pet：把前端 API 映射到 Go 绑定/事件，并提供内联 API Key/互动文字编辑器。 */
(() => {
  'use strict';

  let runtimeReady = false;
  const queued = [];
  const queuedEvents = [];

  const app = () => window.go && window.go.main && window.go.main.App;

  const invoke = (name, ...args) => {
    const fn = app() && app()[name];
    if (typeof fn !== 'function') return Promise.reject(new Error(`Wails 绑定未就绪：${name}`));
    return fn(...args);
  };

  const registerEvent = (name, fn) => {
    try { window.runtime.EventsOn(name, fn); } catch (e) { console.error('EventsOn', name, e); }
  };

  let tick = null;
  const finishReady = () => {
    if (runtimeReady) return;
    if (!(window.runtime && app())) return;
    runtimeReady = true;
    if (tick) clearInterval(tick);
    // 先注册事件，再执行 Ready()；否则 Go 立即发出的 init 会丢
    for (const [name, fn] of queuedEvents.splice(0)) registerEvent(name, fn);
    for (const fn of queued.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
  };

  let uiChain = Promise.resolve();
  const queueUi = (name, ...args) => {
    uiChain = uiChain.then(() => invoke(name, ...args)).catch(() => {});
    return uiChain;
  };
  // 面板扩 Region 必须知道调用是否真的送达；失败时前端要重试，不能当作已展开
  const queueUiStrict = (name, ...args) => {
    const p = uiChain.then(() => invoke(name, ...args));
    uiChain = p.catch(() => {});
    return p;
  };

  // 设置是整份快照；连续点击时若并发调用，旧快照可能后落盘覆盖新设置
  let saveChain = Promise.resolve();
  const queueSave = (payload) => {
    saveChain = saveChain.then(() => invoke('SaveSettings', payload)).catch(() => {});
    return saveChain;
  };

  const whenReady = (fn) => {
    if (runtimeReady) { try { fn(); } catch (e) { console.error(e); } return; }
    queued.push(fn);
    finishReady();
  };

  tick = setInterval(finishReady, 20);

  const on = (name, fn) => {
    if (runtimeReady) registerEvent(name, fn);
    else {
      queuedEvents.push([name, fn]);
      finishReady();
    }
    return () => {
      try { window.runtime.EventsOff(name); } catch { /* ignore */ }
    };
  };

  // ---------------- 内联编辑窗口 ----------------
  let modalRoot = null;
  let keyCtx = { provider: 'deepseek' };
  let wordsCtx = { maxLines: 20, maxLen: 40 };

  const el = (id) => document.getElementById(id);
  // 弹窗文案跟随界面语言；i18n 在 renderer 里，api.js 只在真正打开弹窗时才用到它。
  const L = (zh, vars) => {
    const i = window.PetLib && window.PetLib.i18n;
    return i && i.T ? i.T(zh, vars) : zh;
  };

  function ensureModal() {
    if (modalRoot) return;
    modalRoot = document.createElement('div');
    modalRoot.id = 'wails-modal-root';
    modalRoot.className = 'hide';
    modalRoot.innerHTML = `
      <style>
        /* 与右键菜单 / 动作面板同一套视觉：白底、14px 圆角、同一层阴影与描边。
           不再全屏居中、不再盖半透明遮罩：贴桌宠弹出，点面板外或 Esc 关闭。 */
        #wails-modal-root { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
        #wails-modal-root.hide { display: none; }
        #wails-modal-root .wails-card {
          position: absolute;
          pointer-events: auto;
          box-sizing: border-box;
          width: calc(320px * var(--fs, 1));
          max-width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
          overflow-y: auto;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.97);
          color: #22305e;
          box-shadow: 0 12px 30px rgba(16, 28, 76, 0.34), 0 0 0 1px rgba(120, 150, 255, 0.22);
          /* 跟随设置里的字体选择（--font-ui 由 html[data-font] 决定） */
          font-family: var(--font-ui, "Microsoft YaHei UI", system-ui, sans-serif);
          font-size: calc(13px * var(--fs, 1));
        }
        #wails-modal-root .wails-card.wide { width: calc(380px * var(--fs, 1)); }
        #wails-modal-root .wails-title { font-size: calc(13.5px * var(--fs, 1)); font-weight: 700; margin-bottom: 6px; }
        #wails-modal-root .wails-hint { font-size: calc(11.5px * var(--fs, 1)); line-height: 1.6; color: #5b688f; margin-bottom: 8px; }
        #wails-modal-root input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #dde4ff; border-radius: 9px; background: #fff; color: inherit; font: inherit; font-size: calc(12px * var(--fs, 1)); outline: none; }
        #wails-modal-root input:focus { border-color: #4d6bfe; }
        #wails-modal-root textarea { width: 100%; height: calc(210px * var(--fs, 1)); box-sizing: border-box; padding: 8px 9px; border: 1px solid #dde4ff; border-radius: 9px; background: #fff; color: inherit; font: inherit; font-size: calc(12px * var(--fs, 1)); line-height: 1.7; resize: vertical; outline: none; }
        #wails-modal-root textarea:focus { border-color: #4d6bfe; }
        /* 按钮对齐设置页：浅蓝底 + 1px 边框，主操作实心蓝 */
        #wails-modal-root .wails-row { display: flex; gap: 6px; margin-top: 10px; }
        #wails-modal-root button { flex: 1; padding: calc(6px * var(--fs, 1)) 0; border: 1px solid #dde4ff; border-radius: calc(9px * var(--fs, 1)); background: #f4f7ff; color: #33406e; font: inherit; font-size: calc(12px * var(--fs, 1)); cursor: pointer; }
        #wails-modal-root button.primary { flex: 1.3; border-color: transparent; background: #4d6bfe; color: #fff; font-weight: 600; }
        #wails-modal-root button:hover { filter: brightness(.97); }
        #wails-modal-root button:disabled { opacity: .6; cursor: default; }
        #wails-modal-root .wails-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; font-size: calc(11px * var(--fs, 1)); color: #97a2c4; }
        #wails-modal-root .wails-status { min-height: 16px; margin-top: 8px; font-size: calc(11.5px * var(--fs, 1)); line-height: 1.5; color: #5b688f; }
        #wails-modal-root .wails-status.err { color: #b33939; }
        #wails-modal-root .wails-status.ok { color: #2f7d4f; }
        #wails-modal-root .wails-status.warn { color: #9a6700; }
        #wails-key-card.hide, #wails-words-card.hide { display: none; }
      </style>
      <div class="wails-card" id="wails-key-card">
        <div class="wails-title" id="wails-key-title">${L('配置 API Key')}</div>
        <div class="wails-hint" id="wails-key-hint"></div>
        <input id="wails-key-input" type="password" placeholder="${L('粘贴 API Key')}" autocomplete="off" spellcheck="false">
        <div class="wails-row">
          <button id="wails-key-save" class="primary">${L('保存')}</button>
          <button id="wails-key-clear">${L('清除已存 Key')}</button>
          <button id="wails-key-cancel">${L('取消')}</button>
        </div>
        <div class="wails-status" id="wails-key-status"></div>
      </div>
      <div class="wails-card wide hide" id="wails-words-card">
        <div class="wails-title">${L('自定义互动文字')}</div>
        <div class="wails-hint">${L('每行一句，最多 20 行、每行 40 字。保存非空文字后会自动启用；启用后，点击桌宠和闲时碎碎念会优先使用这些话。')}</div>
        <textarea id="wails-words-area" spellcheck="false" placeholder="${L('每行一句，例如：今天也要好好吃饭～ 摸鱼使我快乐')}"></textarea>
        <div class="wails-meta"><span id="wails-words-count"></span><span>${L('每行最多 40 字')}</span></div>
        <div class="wails-row">
          <button id="wails-words-save" class="primary">${L('保存并检查')}</button>
          <button id="wails-words-cancel">${L('取消')}</button>
        </div>
        <div class="wails-status" id="wails-words-status"></div>
      </div>`;
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('#wails-key-cancel').addEventListener('click', closeOverlays);
    modalRoot.querySelector('#wails-words-cancel').addEventListener('click', closeOverlays);

    modalRoot.querySelector('#wails-key-save').addEventListener('click', async () => {
      const btn = el('wails-key-save');
      const key = el('wails-key-input').value.trim();
      if (!key) { keyStatus(L('请先输入 API Key'), 'err'); return; }
      btn.disabled = true;
      keyStatus(L('正在验证 Key…（最多 9 秒）'));
      try {
        // 先验证再落盘：Key 无效 / 无权限时不让用户以为「保存成功但读不到账本」
        let check = null;
        try {
          check = await invoke('KeyCheck', keyCtx.provider, key);
        } catch (e) {
          check = { ok: false, error: e.message, errorCode: 'CHECK_FAILED' };
        }
        const blocking = check && !check.ok &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'INVALID_KEY_FORMAT', 'UNKNOWN_PROVIDER'].includes(check.errorCode);
        if (blocking) {
          const hint = check.errorHint ? `；${check.errorHint}` : '';
          keyStatus(L('验证未通过：{msg}', { msg: (check.error || L('Key 不可用')) + hint }), 'err');
          btn.disabled = false;
          return;
        }
        keyStatus(L('正在保存…'));
        const r = await invoke('KeySave', keyCtx.provider, key);
        if (!r || !r.ok) { keyStatus((r && r.error) || L('保存失败'), 'err'); return; }
        if (check && check.ok) {
          keyStatus(L('已验证并保存 ✓') + (check.latencyMs ? `（${check.latencyMs} ms）` : ''), 'ok');
        } else {
          const why = (check && check.error) || L('网络或平台暂时不可达');
          keyStatus(L('已保存 ✓，但这次没能验证：{why}', { why }), 'warn');
        }
        setTimeout(closeOverlays, check && check.ok ? 500 : 1800);
      } catch (e) {
        keyStatus(L('保存失败：{e}', { e: e.message }), 'err');
      } finally {
        btn.disabled = false;
      }
    });
    modalRoot.querySelector('#wails-key-clear').addEventListener('click', async () => {
      try {
        await invoke('KeyClear', keyCtx.provider);
        keyStatus(L('已清除'), 'ok');
      } catch (e) {
        keyStatus(L('清除失败：{e}', { e: e.message }), 'err');
      }
    });
    modalRoot.querySelector('#wails-words-save').addEventListener('click', async () => {
      const btn = el('wails-words-save');
      const lines = el('wails-words-area').value.split(/\r?\n/);
      btn.disabled = true;
      wordsStatus(L('正在用离线敏感词库检查…'));
      try {
        const r = await invoke('WordsSave', JSON.stringify(lines));
        if (!r || !r.ok) { wordsStatus((r && r.error) || L('保存失败'), 'err'); return; }
        wordsStatus(r.count ? L('已保存 {n} 行，并通过敏感词检查 ✓', { n: r.count }) : L('已清空，当前使用默认台词 ✓'), 'ok');
        setTimeout(closeOverlays, 500);
      } catch (e) {
        wordsStatus(L('保存失败：{e}', { e: e.message }), 'err');
      } finally {
        btn.disabled = false;
      }
    });
    el('wails-words-area').addEventListener('input', updateWordsCount);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalRoot.classList.contains('hide')) closeOverlays();
    });
  }

  const keyStatus = (t, k) => { const e = el('wails-key-status'); if (e) { e.textContent = t; e.className = 'wails-status' + (k ? ' ' + k : ''); } };
  const wordsStatus = (t, k) => { const e = el('wails-words-status'); if (e) { e.textContent = t; e.className = 'wails-status' + (k ? ' ' + k : ''); } };

  // 贴桌宠弹出：优先放左侧，放不下翻到右侧，再夹进窗口内（与「选个动作」面板同一套算法）。
  // 注意 api.js 是独立 IIFE，拿不到 features 里的 visiblePetRect，这里直接量 #hit 的位置。
  function positionModal() {
    if (!modalRoot) return;
    const card = modalRoot.querySelector('.wails-card:not(.hide)');
    if (!card) return;
    const pad = 8;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (!w || !h) return;
    let v = null;
    const hit = document.getElementById('hit');
    if (hit && hit.getClientRects().length) {
      const r = hit.getBoundingClientRect();
      if (r.width > 0) v = { left: r.left, top: r.top, right: r.right };
    }
    if (!v) v = { left: pad, top: pad, right: innerWidth - pad };
    let left = v.left - w - 10;
    if (left < pad) left = v.right + 10;
    const maxLeft = Math.max(pad, innerWidth - w - pad);
    const maxTop = Math.max(pad, innerHeight - h - pad);
    card.style.left = `${Math.min(Math.max(left, pad), maxLeft)}px`;
    card.style.top = `${Math.min(Math.max(v.top - pad, pad), maxTop)}px`;
  }

  function showModalCard(which) {
    ensureModal();
    el('wails-key-card').classList.toggle('hide', which !== 'key');
    el('wails-words-card').classList.toggle('hide', which !== 'words');
    modalRoot.classList.remove('hide');
    // 先放进 DOM 再量尺寸，否则 offsetWidth 为 0 会摆错位置
    positionModal();
  }

  function updateWordsCount() {
    const e = el('wails-words-area');
    const c = el('wails-words-count');
    if (!e || !c) return;
    const lines = e.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const over = lines.findIndex((s) => Array.from(s).length > wordsCtx.maxLen);
    c.textContent = L('{n} / {m} 行', { n: lines.length, m: wordsCtx.maxLines }) + (over >= 0 ? ' ' + L('· 第 {n} 行超长', { n: over + 1 }) : '');
    c.style.color = over >= 0 ? '#b33939' : '';
  }

  async function openKey(provider) {
    keyCtx.provider = provider || 'deepseek';
    showModalCard('key');
    keyStatus('');
    el('wails-key-input').value = '';
    try {
      const info = await invoke('KeyInfo', keyCtx.provider);
      el('wails-key-title').textContent = L('配置 {p} API Key', { p: info.label || keyCtx.provider });
      el('wails-key-hint').textContent = info.hint || '';
      keyStatus(L(info.hasKey ? '已配置 Key（重新输入可覆盖）' : '尚未配置'));
    } catch (e) {
      keyStatus(L('读取配置失败：{e}', { e: e.message }), 'err');
    }
    // 提示文案变化会改变卡片高度，重新夹到窗口内再聚焦
    positionModal();
    setTimeout(() => el('wails-key-input').focus(), 0);
  }

  async function openWords() {
    showModalCard('words');
    wordsStatus('');
    try {
      const info = await invoke('WordsInfo');
      wordsCtx = { maxLines: info.maxLines || 20, maxLen: info.maxLen || 40 };
      el('wails-words-area').value = (info.lines || []).join('\n');
      updateWordsCount();
      wordsStatus(L(info.lines && info.lines.length ? (info.use ? '当前已启用自定义文字。' : '已保存，但当前未启用。') : '当前使用默认台词。'));
    } catch (e) {
      wordsStatus(L('读取失败：{e}', { e: e.message }), 'err');
    }
    positionModal();
    setTimeout(() => el('wails-words-area').focus(), 0);
  }

  function closeOverlays() {
    if (!modalRoot) return;
    modalRoot.classList.add('hide');
  }

  // ---------------- window.pet 映射 ----------------
  window.__wails = true;
  window.pet = {
    platform: 'wails',
    ready: () => whenReady(() => invoke('Ready')),
    reportPos: (pos) => {
      if (!runtimeReady || !pos || !window.__petPosReady) return Promise.resolve();
      const boxes = typeof window.__petHitBoxes === 'function' ? window.__petHitBoxes(!!pos.bubble) : [];
      // force：气泡长高/首次出现时不能等 80ms 节流，否则 Region 会晚一拍，上半截被裁
      return invoke('ReportPos', Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.s) || 1, JSON.stringify(boxes), !!pos.force).catch(() => {});
    },
    logFrontend: (level, msg) => {
      if (!runtimeReady) return Promise.resolve();
      return invoke('LogFrontend', String(level || 'error'), String(msg || '')).catch(() => {});
    },
    setPanel: (open) => { if (!runtimeReady) return Promise.resolve(); return queueUiStrict('SetPanel', !!open); },
    powerAck: (seq) => { if (runtimeReady) invoke('PowerAck', Number(seq) || 0).catch(() => {}); },
    setDragging: (on) => { if (runtimeReady) queueUi('SetDragging', !!on); },
    holdRegion: (ms) => { if (runtimeReady) invoke('HoldRegion', Math.max(1, Math.min(1000, Number(ms) || 160))).catch(() => {}); },
    setFocusable: (on) => { if (runtimeReady) queueUi('SetFocusable', !!on); },
    updateStats: (s) => { if (s) invoke('UpdateStats', Number(s.satiety) || 0, Number(s.mood) || 0).catch(() => {}); },
    saveSettings: (s) => queueSave(JSON.stringify(s || {})),
    pickApp: () => invoke('PickApp'),
    importFont: () => invoke('ImportFont'),
    autostartStatus: () => invoke('AutostartStatus'),
    checkUpdate: () => invoke('CheckUpdate'),
    downloadUpdate: (mode) => invoke('DownloadUpdate', mode || 'direct'),
    installUpdate: () => invoke('InstallUpdate'),
    keyOpen: (provider) => openKey(provider),
    keyInfo: (provider) => invoke('KeyInfo', provider),
    keySave: (provider, key) => invoke('KeySave', provider, key),
    keyCheck: (provider, key) => invoke('KeyCheck', provider, key),
    keyClear: (provider) => invoke('KeyClear', provider),
    refreshUsage: () => invoke('RefreshUsage'),
    fullscreenDiagnostics: () => invoke('FullscreenDiagnostics'),
    exportDiagnostics: () => invoke('ExportDiagnostics'),
    pomoStats: () => invoke('PomoStats'),
    editWords: () => openWords(),
    wordsInfo: () => invoke('WordsInfo'),
    wordsSave: (lines) => invoke('WordsSave', JSON.stringify(lines || [])),
    closeOverlays,
    openExternal: (url) => invoke('OpenExternal', url).catch(() => {}),
    action: (name) => invoke('Action', String(name)).catch(() => {}),
    notify: (text) => invoke('Notify', String(text)).catch(() => {}),
    quit: () => invoke('Quit').catch(() => {}),
    spawnInstance: () => invoke('SpawnInstance'),
    instanceInfo: () => invoke('InstanceInfo'),
    quitAll: () => invoke('QuitAll'),
    on,
  };
})();

