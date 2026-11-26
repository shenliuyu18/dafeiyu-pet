/*
 * 白饭账本气泡：展示、错误提示、渲染、重试与诊断同步。
 */

const USAGE_ROW_LABELS = ['可用余额', '赠送余额', '充值余额'];

function showUsage(ledger, animate = true) {
  if (!S.ledgerOn) return;
  const cur = ledger || S.ledger;
  // 缓存里的错误/提示是按当时界面语言生成的；切过语言后先重拉一次，避免中英混排
  if (cur && cur.lang && cur.lang !== S.lang && typeof api.refreshUsage === 'function') {
    saySeq++;
    withBubbleRoom(() => renderUsage(null, false));
    Promise.resolve(api.refreshUsage()).then((l) => {
      // 加载态里 usageEl 还是隐藏的，handleUsage 的就地重渲染条件不满足；
      // 直接按新结果渲染一次，保证从「读取中」切到内容。
      if (l) {
        S.ledger = l;
        usagePending = false;
        showUsage(l, false);
      }
    }).catch(() => {});
    return;
  }
  // 当前来源还没填 Key：直接提示去配置，不要一直停在“正在读取账单…”
  if (!cur && S.apiKeys && !S.apiKeys[S.ledgerSource]) {
    const name = (typeof API_LABEL !== 'undefined' && API_LABEL[S.ledgerSource]) || S.ledgerSource || '接口';
    saySeq++;
    withBubbleRoom(() => renderUsage({
      source: S.ledgerSource, provider: S.ledgerSource, available: false,
      error: `还没填写 ${name} 的 API Key`,
      errorHint: '设置 → 白饭账本 → 填写 API Key',
      rows: [], updatedAt: Date.now(),
    }, false));
    return;
  }
  saySeq++;
  withBubbleRoom(() => renderUsage(cur, animate));
}

function usageNote(l, fallback) {
  const err = l && l.error ? String(l.error) : '';
  const hint = l && l.errorHint ? String(l.errorHint) : '';
  const parts = [];
  if (err) parts.push(err);
  if (hint && hint !== err) parts.push(hint);
  if (err) {
    const meta = [];
    if (l.httpStatus) meta.push(`HTTP ${l.httpStatus}`);
    if (l.latencyMs) meta.push(`${l.latencyMs} ms`);
    if (meta.length) parts.push(meta.join(' · '));
  }
  uNote.textContent = parts.length ? parts.join('\n') : fallback;
  uNote.classList.toggle('err', parts.length > 0);
  const canRetry = !!hasApi && typeof api.refreshUsage === 'function';
  uRetry.classList.toggle('hide', !parts.length || !canRetry);
}

function renderUsage(l, animate) {
  if (!l) {
    // 异步请求还没回来：明确告诉用户在读，而不是显示一排 “—”
    clearTimeout(S.bubbleTimer);
    bubbleSetText('正在读取账单…');
    setUsageRows(null);
    uNote.textContent = '';
    uNote.classList.remove('err');
    uRetry.classList.add('hide');
    barsEl.classList.add('hide');
    usageEl.classList.remove('hide');
    revealBubble(9000);
    return;
  }
  clearTimeout(S.bubbleTimer);
  const label = (l && l.providerLabel) || 'API';
  if (l.pending) {
    bubbleSetText('正在重新检测…');
  } else {
    bubbleSetText(l.available ? `这是 ${label} 的账单` : (l.error || '还没拿到账单数据'));
  }
  setUsageRows(l.rows || []);
  usageNote(l, (l && l.note) || `来自 ${label} 官方接口`);
  if (l.pending) uRetry.classList.add('hide');
  barsEl.classList.add('hide');
  usageEl.classList.remove('hide');
  revealBubble(9000);
  if (animate) {
    const tier = balanceTierPools();
    playOnce(tier.length ? tier : ANIM.money);
  }
}

function setUsageRows(rows) {
  const slots = [uToday, uMonth, uSession];
  const labs = [uL1, uL2, uL3];
  for (let i = 0; i < 3; i++) {
    const row = rows && rows[i];
    labs[i].textContent = (row && row.label) || USAGE_ROW_LABELS[i];
    slots[i].textContent = (row && row.value) || '—';
  }
}

async function retryUsage() {
  if (!hasApi || usagePending || typeof api.refreshUsage !== 'function') return;
  usagePending = true;
  withBubbleRoom(() => {
    uRetry.classList.add('hide');
    uNote.classList.remove('err');
    uNote.textContent = '正在重新检测…';
    revealBubble(20000);
  });
  try {
    const l = await api.refreshUsage();
    if (l && l.pending) {
      // 上一次请求还没结束，等 usage 事件回来；超时再放开按钮
      setTimeout(() => {
        if (!usagePending) return;
        usagePending = false;
        withBubbleRoom(() => {
          uNote.textContent = '检测超时，请稍后再试';
          uNote.classList.add('err');
          uRetry.classList.remove('hide');
        });
      }, 12000);
      return;
    }
    usagePending = false;
    S.ledger = l || null;
    if (l) showUsage(l, false);
    syncLedgerDiag(l);
  } catch (e) {
    usagePending = false;
    withBubbleRoom(() => {
      uNote.textContent = '检测失败：' + (e && e.message ? e.message : e);
      uNote.classList.add('err');
      uRetry.classList.remove('hide');
    });
  }
}

function syncLedgerDiag(l) {
  if (!ledgerDiagStatus || !l) return;
  const who = l.providerLabel || API_LABEL[l.provider] || l.source || '账单';
  const state = l.pending ? '检测中…' : (l.available ? '已连上 ✓' : '未连上');
  ledgerDiagStatus.textContent = `${who}：${state}${l.errorCode ? `（${l.errorCode}）` : ''}`;
  ledgerDiagStatus.className = 'set-hint ' + (l.available ? 'ok' : (l.pending ? '' : 'err'));
  if (ledgerDiagDetail && !ledgerDiagDetail.classList.contains('hide')) {
    ledgerDiagDetail.textContent = ledgerDiagText(l);
  }
}

async function recheckLedger() {
  if (!hasApi || typeof api.refreshUsage !== 'function') {
    if (ledgerDiagStatus) ledgerDiagStatus.textContent = '预览模式没有账本接口。';
    return;
  }
  if (ledgerDiagStatus) {
    ledgerDiagStatus.className = 'set-hint';
    ledgerDiagStatus.textContent = '正在重新检测…';
  }
  try {
    const l = await api.refreshUsage();
    if (l && l.pending) {
      syncLedgerDiag(l);
      return;
    }
    S.ledger = l || null;
    syncLedgerDiag(l);
  } catch (e) {
    if (ledgerDiagStatus) {
      ledgerDiagStatus.className = 'set-hint err';
      ledgerDiagStatus.textContent = '检测失败：' + (e && e.message ? e.message : e);
    }
  }
}