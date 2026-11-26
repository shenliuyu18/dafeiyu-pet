/*
 * 更新检查与下载 UI。由设置页按钮调用。
 */

function relayoutUpdatePanel() {
  if (settingsOpen) requestAnimationFrame(positionSettings);
}

const updateErrorRow = document.getElementById('update-error-row');
let updateErrSummary = '';

const UPDATE_ERROR_LABELS = {
  NETWORK: '网络错误',
  HASH: '安装包校验失败',
  MISMATCH: '更新包与当前版本不匹配',
  LAUNCH: '安装程序启动失败',
  DISK: '写入文件失败',
  BUSY: '正在更新',
  NO_UPDATE: '没有可用更新',
  ISOLATED: '隔离调试实例不允许更新',
  UNKNOWN: '未知错误',
};

function clearUpdateError() {
  updateErrSummary = '';
  if (updateErrorRow) updateErrorRow.classList.add('hide');
}

function setUpdateError(code, msg) {
  const key = UPDATE_ERROR_LABELS[code] ? code : 'UNKNOWN';
  const label = UPDATE_ERROR_LABELS[key];
  const cur = updateInfo && updateInfo.current ? `v${updateInfo.current}` : '';
  const latest = updateInfo && updateInfo.latest ? updateInfo.latest : '';
  updateErrSummary = [
    '大肥鱼桌宠更新失败',
    `时间：${new Date().toLocaleString()}`,
    `版本：${cur}${latest ? ' → ' + latest : ''}`,
    `错误码：${key}（${label}）`,
    `详情：${msg || '未知错误'}`,
  ].join('\n');
  if (updateErrorRow) updateErrorRow.classList.remove('hide');
  relayoutUpdatePanel();
  return label;
}

function setUpdateFailure(code, msg) {
  const label = setUpdateError(code, msg);
  const i = window.PetLib && window.PetLib.i18n;
  const T = (z, v) => (i && i.T ? i.T(z, v) : z);
  updateHint.textContent = T('下载失败（{l}）：{m}；可点下方「复制错误摘要」反馈', {
    l: T(label), m: msg || T('未知错误'),
  });
}

function showUpdateButtons(show) {
  updateActions.classList.toggle('hide', !show);
  updateInstallRow.classList.toggle('hide', !show);
  // 下载方式说明只在出现下载按钮（发现新版本 / 仍可下载上次的新版本）时一起显示
  const dlHint = document.getElementById('update-dl-hint');
  if (dlHint) dlHint.classList.toggle('hide', !show);
  relayoutUpdatePanel();
}

function resetUpdateButtons() {
  updateDownloading = false;
  updateDirect.disabled = false;
  updateAccel.disabled = false;
  if (updateLanzou) updateLanzou.disabled = false;
}

async function doCheckUpdate() {
  if (updateDownloading || updateChecking) return;
  updateChecking = true;
  const prev = updateInfo;
  clearUpdateError();
  updateHint.textContent = '正在检查 GitHub Releases…';
  try {
    const r = await api.checkUpdate();
    if (!r || r.error) {
      if (prev && prev.hasUpdate) {
        updateInfo = prev;
        updateHint.textContent = `检查失败：${(r && r.error) || '网络错误'}；仍可下载上次发现的新版本 ${prev.latest}`;
        showUpdateButtons(true);
      } else {
        updateInfo = r || null;
        updateHint.textContent = `检查失败：${(r && r.error) || '网络错误'}`;
        showUpdateButtons(false);
      }
      return;
    }
    updateInfo = r;
    if (!r.hasUpdate) {
      updateHint.textContent = `已是最新版本 v${r.current}`;
      showUpdateButtons(false);
      return;
    }
    updateHint.textContent = `发现新版本 ${r.latest}（当前 v${r.current}），选择下载方式：`;
    showUpdateButtons(true);
  } catch {
    if (prev && prev.hasUpdate) {
      updateInfo = prev;
      updateHint.textContent = `检查失败：网络错误；仍可下载上次发现的新版本 ${prev.latest}`;
      showUpdateButtons(true);
    } else {
      updateHint.textContent = '检查失败：网络错误';
      showUpdateButtons(false);
    }
  } finally {
    updateChecking = false;
    relayoutUpdatePanel();
  }
}

async function startUpdateDownload(mode) {
  if (updateDownloading || !updateInfo || !updateInfo.hasUpdate) return;
  updateDownloading = true;
  updateDirect.disabled = true;
  updateAccel.disabled = true;
  if (updateLanzou) updateLanzou.disabled = true;
  clearUpdateError();
  updateHint.textContent = '开始下载…';
  try {
    const r = await api.downloadUpdate(mode);
    if (r && r.started === false) {
      resetUpdateButtons();
      setUpdateError(r.code, r.error);
      updateHint.textContent = `下载未开始：${r.error || '未知错误'}${r.code ? `（${UPDATE_ERROR_LABELS[r.code] || r.code}）` : ''}`;
      relayoutUpdatePanel();
    }
  } catch (e) {
    resetUpdateButtons();
    setUpdateFailure('UNKNOWN', e.message || '未知错误');
    relayoutUpdatePanel();
  }
}

window.addEventListener('pet-api-ready', () => {
  api.on('update-progress', (p) => {
    if (!p) return;
    const suffix = '（完成后打开安装程序）';
    updateHint.textContent = p.total > 0 ? `下载中… ${p.percent}%${suffix}` : `下载中…${suffix}`;
    relayoutUpdatePanel();
  });

  api.on('update-done', (d) => {
    if (d && d.ok && d.launching) {
      updateHint.textContent = '下载完成，正在关闭桌宠并打开安装程序…';
      relayoutUpdatePanel();
      return;
    }
    resetUpdateButtons();
    if (d && d.ok) updateHint.textContent = `已保存到 Downloads：${d.file}`;
    else setUpdateFailure((d && d.code) || 'UNKNOWN', (d && d.error) || '网络错误');
    relayoutUpdatePanel();
  });
});

const updateCopyBtn = document.getElementById('update-copy-err');
if (updateCopyBtn) {
  updateCopyBtn.addEventListener('click', async () => {
    const text = updateErrSummary || updateHint.textContent || '';
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { /* 回退到 execCommand */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    updateHint.textContent = ok ? '错误摘要已复制，可直接粘贴到 issue。' : '复制失败：请手动选中错误提示复制。';
    relayoutUpdatePanel();
  });
}

async function pickLinkedApp() {
  if (!api.pickApp) return;
  const p = await api.pickApp();
  if (p) applyLinkedApp(p, true);
}

// 切换形象：video 显示 <video>，立绘显示 <img>，图集显示 <canvas>；重置动画记录并重建动作面板
