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

  function ensureModal() {
    if (modalRoot) return;
    modalRoot = document.createElement('div');
    modalRoot.id = 'wails-modal-root';
    modalRoot.className = 'hide';
    modalRoot.innerHTML = `
      <style>
        #wails-modal-root { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }
        #wails-modal-root.hide { display: none; }
        #wails-modal-root .wails-mask { position: absolute; inset: 0; background: rgba(15, 25, 55, .32); }
        #wails-modal-root .wails-card { position: relative; width: 380px; max-width: calc(100vw - 40px); box-sizing: border-box; background: #fff; color: #22305e; border-radius: 14px; box-shadow: 0 18px 50px rgba(16,28,76,.4); padding: 16px 18px; font-family: "Microsoft YaHei UI", system-ui, sans-serif; }
        #wails-modal-root .wails-card.wide { width: 520px; }
        #wails-modal-root .wails-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
        #wails-modal-root .wails-hint { font-size: 11.5px; line-height: 1.6; color: #5b688f; margin-bottom: 10px; }
        #wails-modal-root input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #dde4ff; border-radius: 8px; font: inherit; font-size: 12.5px; outline: none; }
        #wails-modal-root input:focus { border-color: #4d6bfe; }
        #wails-modal-root textarea { width: 100%; height: 250px; box-sizing: border-box; padding: 9px 10px; border: 1px solid #dde4ff; border-radius: 9px; font: inherit; font-size: 12.5px; line-height: 1.7; resize: vertical; outline: none; }
        #wails-modal-root textarea:focus { border-color: #4d6bfe; }
        #wails-modal-root .wails-row { display: flex; gap: 8px; margin-top: 12px; }
        #wails-modal-root button { flex: 1; padding: 7px 0; border: 1px solid #dde4ff; border-radius: 8px; background: #f4f7ff; color: #33406e; font: inherit; font-size: 12.5px; cursor: pointer; }
        #wails-modal-root button.primary { flex: 1.4; border: 0; background: #4d6bfe; color: #fff; }
        #wails-modal-root button:hover { filter: brightness(.97); }
        #wails-modal-root button:disabled { opacity: .6; cursor: default; }
        #wails-modal-root .wails-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; font-size: 11px; color: #97a2c4; }
        #wails-modal-root .wails-status { min-height: 16px; margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #5b688f; }
        #wails-modal-root .wails-status.err { color: #b33939; }
        #wails-modal-root .wails-status.ok { color: #2f7d4f; }
        #wails-key-card.hide, #wails-words-card.hide { display: none; }
      </style>
      <div class="wails-mask"></div>
      <div class="wails-card" id="wails-key-card">
        <div class="wails-title" id="wails-key-title">配置 API Key</div>
        <div class="wails-hint" id="wails-key-hint"></div>
        <input id="wails-key-input" type="password" placeholder="粘贴 API Key" autocomplete="off" spellcheck="false">
        <div class="wails-row">
          <button id="wails-key-save" class="primary">保存</button>
          <button id="wails-key-clear">清除已存 Key</button>
          <button id="wails-key-cancel">取消</button>
        </div>
        <div class="wails-status" id="wails-key-status"></div>
      </div>
      <div class="wails-card wide hide" id="wails-words-card">
        <div class="wails-title">自定义互动文字</div>
        <div class="wails-hint">每行一句，最多 20 行、每行 40 字。保存非空文字后会自动启用；启用后，点击桌宠和闲时碎碎念会优先使用这些话。</div>
        <textarea id="wails-words-area" spellcheck="false" placeholder="每行一句，例如：&#10;今天也要好好吃饭～&#10;摸鱼使我快乐"></textarea>
        <div class="wails-meta"><span id="wails-words-count">0 / 20 行</span><span>每行最多 40 字</span></div>
        <div class="wails-row">
          <button id="wails-words-save" class="primary">保存并检查</button>
          <button id="wails-words-cancel">取消</button>
        </div>
        <div class="wails-status" id="wails-words-status"></div>
      </div>`;
    document.body.appendChild(modalRoot);

    modalRoot.querySelector('.wails-mask').addEventListener('click', closeOverlays);
    modalRoot.querySelector('#wails-key-cancel').addEventListener('click', closeOverlays);
    modalRoot.querySelector('#wails-words-cancel').addEventListener('click', closeOverlays);

    modalRoot.querySelector('#wails-key-save').addEventListener('click', async () => {
      const btn = el('wails-key-save');
      const key = el('wails-key-input').value.trim();
      if (!key) { keyStatus('请先输入 API Key', 'err'); return; }
      btn.disabled = true;
      keyStatus('正在保存…');
      try {
        const r = await invoke('KeySave', keyCtx.provider, key);
        if (!r || !r.ok) { keyStatus((r && r.error) || '保存失败', 'err'); return; }
        keyStatus('已保存 ✓', 'ok');
        setTimeout(closeOverlays, 500);
      } catch (e) {
        keyStatus('保存失败：' + e.message, 'err');
      } finally {
        btn.disabled = false;
      }
    });
    modalRoot.querySelector('#wails-key-clear').addEventListener('click', async () => {
      try {
        await invoke('KeyClear', keyCtx.provider);
        keyStatus('已清除', 'ok');
      } catch (e) {
        keyStatus('清除失败：' + e.message, 'err');
      }
    });
    modalRoot.querySelector('#wails-words-save').addEventListener('click', async () => {
      const btn = el('wails-words-save');
      const lines = el('wails-words-area').value.split(/\r?\n/);
      btn.disabled = true;
      wordsStatus('正在用离线敏感词库检查…');
      try {
        const r = await invoke('WordsSave', JSON.stringify(lines));
        if (!r || !r.ok) { wordsStatus((r && r.error) || '保存失败', 'err'); return; }
        wordsStatus(r.count ? `已保存 ${r.count} 行，并通过敏感词检查 ✓` : '已清空，当前使用默认台词 ✓', 'ok');
        setTimeout(closeOverlays, 500);
      } catch (e) {
        wordsStatus('保存失败：' + e.message, 'err');
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

  function updateWordsCount() {
    const e = el('wails-words-area');
    const c = el('wails-words-count');
    if (!e || !c) return;
    const lines = e.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const over = lines.findIndex((s) => Array.from(s).length > wordsCtx.maxLen);
    c.textContent = `${lines.length} / ${wordsCtx.maxLines} 行` + (over >= 0 ? ` · 第 ${over + 1} 行超长` : '');
    c.style.color = over >= 0 ? '#b33939' : '';
  }

  async function openKey(provider) {
    ensureModal();
    keyCtx.provider = provider || 'deepseek';
    el('wails-key-card').classList.remove('hide');
    el('wails-words-card').classList.add('hide');
    modalRoot.classList.remove('hide');
    keyStatus('');
    el('wails-key-input').value = '';
    try {
      const info = await invoke('KeyInfo', keyCtx.provider);
      el('wails-key-title').textContent = `配置 ${info.label || keyCtx.provider} API Key`;
      el('wails-key-hint').textContent = info.hint || '';
      keyStatus(info.hasKey ? '已配置 Key（重新输入可覆盖）' : '尚未配置');
    } catch (e) {
      keyStatus('读取配置失败：' + e.message, 'err');
    }
    setTimeout(() => el('wails-key-input').focus(), 0);
  }

  async function openWords() {
    ensureModal();
    el('wails-key-card').classList.add('hide');
    el('wails-words-card').classList.remove('hide');
    modalRoot.classList.remove('hide');
    wordsStatus('');
    try {
      const info = await invoke('WordsInfo');
      wordsCtx = { maxLines: info.maxLines || 20, maxLen: info.maxLen || 40 };
      el('wails-words-area').value = (info.lines || []).join('\n');
      updateWordsCount();
      wordsStatus(info.lines && info.lines.length ? (info.use ? '当前已启用自定义文字。' : '已保存，但当前未启用。') : '当前使用默认台词。');
    } catch (e) {
      wordsStatus('读取失败：' + e.message, 'err');
    }
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
      if (!runtimeReady || !pos || !window.__petPosReady) return;
      const boxes = typeof window.__petHitBoxes === 'function' ? window.__petHitBoxes() : [];
      invoke('ReportPos', Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.s) || 1, JSON.stringify(boxes)).catch(() => {});
    },
    setPanel: (open) => { if (!runtimeReady) return Promise.resolve(); return queueUiStrict('SetPanel', !!open); },
    setDragging: (on) => { if (runtimeReady) queueUi('SetDragging', !!on); },
    setFocusable: (on) => { if (runtimeReady) queueUi('SetFocusable', !!on); },
    updateStats: (s) => { if (s) invoke('UpdateStats', Number(s.satiety) || 0, Number(s.mood) || 0).catch(() => {}); },
    saveSettings: (s) => queueSave(JSON.stringify(s || {})),
    pickApp: () => invoke('PickApp'),
    checkUpdate: () => invoke('CheckUpdate'),
    downloadUpdate: (mode) => invoke('DownloadUpdate', mode || 'direct'),
    installUpdate: () => invoke('InstallUpdate'),
    keyOpen: (provider) => openKey(provider),
    keyInfo: (provider) => invoke('KeyInfo', provider),
    keySave: (provider, key) => invoke('KeySave', provider, key),
    keyClear: (provider) => invoke('KeyClear', provider),
    editWords: () => openWords(),
    wordsInfo: () => invoke('WordsInfo'),
    wordsSave: (lines) => invoke('WordsSave', JSON.stringify(lines || [])),
    closeOverlays,
    openExternal: (url) => invoke('OpenExternal', url).catch(() => {}),
    action: (name) => invoke('Action', String(name)).catch(() => {}),
    notify: (text) => invoke('Notify', String(text)).catch(() => {}),
    quit: () => invoke('Quit').catch(() => {}),
    on,
  };
})();
