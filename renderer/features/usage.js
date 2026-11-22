/*
 * 白饭账本气泡：展示、错误提示、渲染、重试与诊断同步。
 */

function showUsage(ledger, animate = true) {
  if (!S.ledgerOn) return;
  saySeq++;
  const l = ledger || S.ledger;
  const ds = !!(l && l.source && l.source !== 'qoder');
  withBubbleRoom(() => renderUsage(l, ds, animate));
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

function renderUsage(l, ds, animate) {
  if (!l) {
    // 异步请求还没回来：明确告诉用户在读，而不是显示一排 “—”
    clearTimeout(S.bubbleTimer);
    bubbleSetText('正在读取账单…');
    uL1.textContent = '今天吃掉';
    uL2.textContent = '本月吃掉';
    uL3.textContent = '本次会话';
    uToday.textContent = '—';
    uMonth.textContent = '—';
    uSession.textContent = '—';
    quotaEl.classList.add('hide');
    uNote.textContent = '';
    uNote.classList.remove('err');
    uRetry.classList.add('hide');
    barsEl.classList.add('hide');
    usageEl.classList.remove('hide');
    revealBubble(9000);
    return;
  }
  clearTimeout(S.bubbleTimer);
  const rows = (l && l.rows) || [];
  if (l.pending) {
    bubbleSetText('正在重新检测…');
  } else if (ds) {
    bubbleSetText(l && l.available ? `这是 ${l.providerLabel || 'API'} 的账单` : (l && l.error) || '还没拿到账单数据');
  } else {
    bubbleSetText(l && l.available ? (isDsh() ? '这是你喂给我的白饭' : '这是本月的用量') : '还没找到用量记录…');
  }
  if (ds) {
    const labels = ['可用余额', '赠送余额', '充值余额'];
    const slots = [uToday, uMonth, uSession];
    const labs = [uL1, uL2, uL3];
    for (let i = 0; i < 3; i++) {
      labs[i].textContent = (rows[i] && rows[i].label) || labels[i];
      slots[i].textContent = (rows[i] && rows[i].value) || '—';
    }
    quotaEl.classList.add('hide');
    usageNote(l, (l && l.note) || `来自 ${l.providerLabel || 'API'} 官方接口`);
  } else {
    uL1.textContent = '今天吃掉';
    uL2.textContent = '本月吃掉';
    uL3.textContent = '本次会话';
    uToday.textContent = l && l.available ? `${l.today} credits` : '—';
    uMonth.textContent = l && l.available ? `${l.month} credits` : '—';
    uSession.textContent = l && l.available ? `${l.session} credits` : '—';
    if (l && l.quota > 0 && l.percent !== null) {
      quotaEl.classList.remove('hide');
      uBar.style.width = `${l.percent.toFixed(1)}%`;
      uQuotaText.textContent = `套餐 ${l.month} / ${l.quota}（${l.percent.toFixed(1)}%）`;
    } else {
      quotaEl.classList.add('hide');
    }
    usageNote(l, isDsh() ? '白饭 = 你的 Qoder credits' : '这是你的 Qoder 用量');
  }
  if (l.pending) uRetry.classList.add('hide');
  barsEl.classList.add('hide');
  usageEl.classList.remove('hide');
  revealBubble(9000);
  if (animate) {
    const tier = balanceTierPools();
    playOnce(tier.length ? tier : ANIM.money);
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
