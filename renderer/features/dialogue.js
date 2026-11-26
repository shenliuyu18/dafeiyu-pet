/*
 * 台词选择与浏览器预览兜底。
 */

// 当前形象对应的包：pack:<id> 直接取，图集类代码 key 走 CODE_CHAR_PACKS 映射。
function activePack() {
  let id = '';
  if (String(S.character).startsWith('pack:')) id = S.character.slice(5);
  else if (CODE_CHAR_PACKS[S.character]) id = CODE_CHAR_PACKS[S.character];
  return id && PACKS[id] ? PACKS[id] : null;
}

function charLines(key) {
  // 台词随包安装；未下载/旧包没有 dialogue 时回退到内置或中性台词
  const p = activePack();
  if (p && p.dialogue && p.dialogue[key]) return p.dialogue[key];
  const l = CHAR_LINES[S.character];
  return l && l[key] ? l[key] : null;
}

function charIntro() {
  const p = activePack();
  if (p && p.dialogue && p.dialogue.intro) return p.dialogue.intro;
  const l = CHAR_LINES[S.character];
  if (l && l.intro) return l.intro;
  // 包名可能带「动作包」后缀，自我介绍里用短名（如「Kimi」而不是「Kimi 动作包」）
  const raw = charNow().label || '新形象';
  const name = typeof shortPackName === 'function' ? shortPackName(raw) : raw;
  return `你好呀，我是${name}～`;
}

function mockApi() {
  return {
    ready() {},
    reportPos() {},
    setPanel() {},
    setDragging() {},
    holdRegion() {},
    updateStats() {},
    action() {},
    notify() {},
    saveSettings() {},
    editWords() {},
    pickApp() {
      return Promise.resolve(null);
    },
    importFont() {
      return Promise.resolve(null);
    },
    autostartStatus() {
      return Promise.resolve({ enabled: true, task: true });
    },
    quit() {},
    refreshUsage() {
      return Promise.resolve({
        source: 'deepseek', providerLabel: 'DeepSeek', available: false, errorCode: 'PREVIEW',
        error: '浏览器预览没有账本接口', errorHint: '安装版才会查询平台账单',
      });
    },
    fullscreenDiagnostics() {
      return Promise.resolve({ enabled: true, active: false, signal: '预览', entries: [] });
    },
    exportDiagnostics() {
      return Promise.resolve({ ok: false, error: '预览模式没有诊断导出接口' });
    },
    pomoStats() {
      return Promise.resolve({ today: 0, week: 0, total: 0, days: [] });
    },
    keyCheck() {
      return Promise.resolve({ ok: true, latencyMs: 0 });
    },
    logFrontend() {},
    closeOverlays() {},
    on() {
      return () => {};
    },
  };
}
