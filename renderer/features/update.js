/*
 * 更新检查与下载 UI。由设置页按钮调用。
 */

function relayoutUpdatePanel() {
  if (settingsOpen) requestAnimationFrame(positionSettings);
}

function showUpdateButtons(show) {
  updateActions.classList.toggle('hide', !show);
  updateInstallRow.classList.toggle('hide', !show);
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
  updateHint.textContent = '开始下载…';
  try {
    const r = await api.downloadUpdate(mode);
    if (r && r.started === false) {
      resetUpdateButtons();
      updateHint.textContent = `下载未开始：${r.error || '未知错误'}`;
      relayoutUpdatePanel();
    }
  } catch (e) {
    resetUpdateButtons();
    updateHint.textContent = `下载失败：${e.message || '未知错误'}`;
    relayoutUpdatePanel();
  }
}

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
  else updateHint.textContent = `下载失败：${(d && d.error) || '网络错误'}`;
  relayoutUpdatePanel();
});

async function pickLinkedApp() {
  if (!api.pickApp) return;
  const p = await api.pickApp();
  if (p) applyLinkedApp(p, true);
}

// 切换形象：video 显示 <video>，立绘显示 <img>，图集显示 <canvas>；重置动画记录并重建动作面板
