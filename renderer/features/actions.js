/*
 * 交互动作、特效、语言与诊断导出等运行期函数。
 */

function applyLean(x, y) {
  if (!leanOn || S.dragging || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const dx = clamp((x - (P.x + PET.cx)) / 300, -1, 1);
  const dy = clamp((y - (P.y + PET.cy)) / 300, -1, 1);
  const t = `translate(${(dx * LEAN_MAX).toFixed(2)}px, ${(dy * LEAN_MAX * 0.7).toFixed(2)}px)`;
  if (t === lastLean) return;
  lastLean = t;
  leanEl.style.transform = t;
}

function wake() {
  S.lastInteract = Date.now();
  if (S.autoDoze) {
    S.autoDoze = false;
    applyDoze();
  }
}

function playHappy(ms = 1100) {
  if (ms > 1000) sfx('success');
  playOnce(ANIM.happy);
  stage.classList.remove('happy');
  void stage.offsetWidth;
  stage.classList.add('happy');
  clearTimeout(S.happyTimer);
  S.happyTimer = setTimeout(() => stage.classList.remove('happy'), ms);
}

function playEat() {
  wake();
  sfx('success');
  playOnce(ANIM.feed);
  spawnFood();
  stage.classList.remove('eat');
  void stage.offsetWidth;
  stage.classList.add('eat');
  setTimeout(() => {
    stage.classList.remove('eat');
    playHappy();
    burstHearts(4);
    sayScene('feed', pick(feedLines()));
  }, 1150);
}

function burstHearts(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = 'fx-heart';
      el.textContent = '❤';
      el.style.left = `${148 + (Math.random() - 0.5) * 100}px`;
      el.style.top = `${248 + (Math.random() - 0.5) * 40}px`;
      el.style.color = Math.random() < 0.5 ? '#ff7aa2' : '#ff9f43';
      fxEl.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 120);
  }
}

function spawnFood() {
  const el = document.createElement('span');
  el.className = 'fx-food';
  el.textContent = '🍚';
  el.style.left = '140px';
  el.style.top = '175px';
  fxEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function toggleLedgerDiag() {
  if (!ledgerDiagDetail) return;
  const show = ledgerDiagDetail.classList.contains('hide');
  ledgerDiagDetail.classList.toggle('hide', !show);
  if (show) ledgerDiagDetail.textContent = ledgerDiagText(S.ledger);
}

function fsDiagSummary(d) {
  if (!d) return '没有拿到判定数据。';
  const pet = d.fsHidden ? '已因全屏隐藏' : (d.hidden ? '手动隐藏' : '显示中');
  return `当前：${d.active ? '全屏' : '非全屏'}（${d.signal || '—'}） · 桌宠：${pet} · 连续命中 ${d.hits}/${d.confirmTicks}，连续恢复 ${d.clears}/${d.clearTicks}`;
}

function fmtPomoMinutes(v) {
  return window.PetLib.timeFormat.minutes(v);
}

async function renderPomoStats() {
  if (!pomoSummary || !pomoChart) return;
  if (!hasApi || typeof api.pomoStats !== 'function') return;
  try {
    const s = await api.pomoStats();
    if (!s) return;
    pomoSummary.textContent = `今天 ${fmtPomoMinutes(s.today)} · 近 7 天 ${fmtPomoMinutes(s.week)} · 累计 ${fmtPomoMinutes(s.total)}`;
    const days = Array.isArray(s.days) ? s.days : [];
    const max = Math.max(1, ...days.map((d) => Number(d.minutes) || 0));
    pomoChart.innerHTML = days.map((d) => {
      const mins = Number(d.minutes) || 0;
      const pct = Math.max(2, Math.round((mins / max) * 100));
      const cls = d.today ? 'pomo-col today' : 'pomo-col';
      return `<div class="${cls}"><div class="pomo-bar"><i style="height:${pct}%"></i></div><b>${Math.round(mins)}</b><span>${d.weekday || ''}</span></div>`;
    }).join('');
  } catch (e) {
    pomoSummary.textContent = '统计读取失败：' + (e && e.message ? e.message : e);
  }
}

function applyLanguage(lang, save) {
  S.lang = lang === 'en' || lang === 'ja' ? lang : 'zh';
  if (window.PetLib && window.PetLib.i18n) window.PetLib.i18n.apply(S.lang);
  // 账本缓存的按语言校验在 showUsage 里处理：这里不做提前重拉，
  // 否则 Settings 的保存链还没到 Go，拿回来的仍是旧语言文案。
  if (typeof retranslateBubble === 'function') retranslateBubble();
  // 省电提示是脚本用 T() 拼出来的，apply() 只扫 DOM，切语言后必须手动重算
  if (typeof updatePowerHint === 'function') updatePowerHint();
  const suffix = S.lang === 'zh' ? '' : '.' + S.lang;
  for (const btn of document.querySelectorAll('.set-link[data-doc]')) {
    btn.dataset.link = `https://github.com/shenliuyu18/dafeiyu-pet/blob/main/${btn.dataset.doc}${suffix}.md`;
  }
  if (setLang) {
    for (const btn of setLang.querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.lang === S.lang);
    }
  }
  if (save) saveSettings();
}

async function exportDiagnostics() {
  if (!diagnosticsStatus) return;
  if (!hasApi || typeof api.exportDiagnostics !== 'function') {
    diagnosticsStatus.className = 'set-hint err';
    diagnosticsStatus.textContent = '预览模式无法导出诊断包。';
    return;
  }
  diagnosticsStatus.className = 'set-hint';
  diagnosticsStatus.textContent = '正在打包诊断信息…';
  try {
    const r = await api.exportDiagnostics();
    if (!r || !r.ok) {
      diagnosticsStatus.className = 'set-hint err';
      diagnosticsStatus.textContent = '导出失败：' + ((r && r.error) || '未知错误');
      return;
    }
    const size = r.size ? `（${(r.size / 1024).toFixed(1)} KB）` : '';
    diagnosticsStatus.className = 'set-hint ok';
    diagnosticsStatus.textContent = `已导出${size}：${r.path}`;
  } catch (e) {
    diagnosticsStatus.className = 'set-hint err';
    diagnosticsStatus.textContent = '导出失败：' + (e && e.message ? e.message : e);
  }
}
