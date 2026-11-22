/*
 * 全屏判定诊断面板。
 */

function fsDiagLines(d) {
  const entries = (d && d.entries) || [];
  if (!entries.length) return '还没有判定记录（切换一次全屏应用后再刷新）。';
  return entries.map((e) => {
    const q = e.quns !== null && e.quns !== undefined ? ` QUNS=${e.quns}` : '';
    const rect = e.rect ? ` ${e.rect}` : '';
    const flags = `${e.fsHidden ? ' fsHidden' : ''}${e.petHidden ? ' petHidden' : ''}`;
    return `${e.t || '--:--:--'}  ${e.active ? '全屏' : '非全屏'}  ${e.signal || '—'}${q}  ${e.class || '—'}${rect}  → ${e.action || 'none'}${flags}`;
  }).join('\n');
}

async function refreshFsDiag(showDetail) {
  if (!hasApi || typeof api.fullscreenDiagnostics !== 'function') {
    if (fsDiagStatus) fsDiagStatus.textContent = '预览模式没有全屏诊断接口。';
    return;
  }
  try {
    const d = await api.fullscreenDiagnostics();
    if (fsDiagStatus) {
      fsDiagStatus.className = 'set-hint';
      fsDiagStatus.textContent = fsDiagSummary(d);
    }
    if (fsDiagLog) {
      fsDiagLog.textContent = fsDiagLines(d);
      if (showDetail) fsDiagLog.classList.remove('hide');
    }
  } catch (e) {
    if (fsDiagStatus) {
      fsDiagStatus.className = 'set-hint err';
      fsDiagStatus.textContent = '读取判定记录失败：' + (e && e.message ? e.message : e);
    }
  }
}

function toggleFsDiag() {
  if (!fsDiagLog) return;
  const show = fsDiagLog.classList.contains('hide');
  fsDiagLog.classList.toggle('hide', !show);
  if (show) refreshFsDiag(true);
}
