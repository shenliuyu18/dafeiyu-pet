/*
 * 台词选择与浏览器预览兜底。
 */

function charLines(key) {
  const l = CHAR_LINES[S.character];
  return l && l[key] ? l[key] : null;
}

function charIntro() {
  const l = CHAR_LINES[S.character];
  if (l && l.intro) return l.intro;
  return `你好呀，我是${charNow().label || '新形象'}～`;
}

function mockApi() {
  return {
    ready() {},
    reportPos() {},
    setPanel() {},
    setDragging() {},
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
        source: 'qoder', available: false, errorCode: 'PREVIEW',
        error: '浏览器预览没有账本接口', errorHint: '安装版才会读取本机账本',
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
    on() {
      return () => {};
    },
  };
}
