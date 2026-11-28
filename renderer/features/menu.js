/*
 * 右键菜单定位、内容刷新与开关。函数在 DOM 就绪后由 pet.js 调用。
 */

const PANEL_FOCUSABLE = 'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 面板要先等主进程把 Region 扩成整窗才能显示，这段是异步的。
// 期间按 Esc / 点别处都应该能取消，否则面板会在用户已经放弃后突然弹出并抢焦点。
let panelOpenSeq = 0;
let panelPending = false;

function beginPanelOpen() {
  panelPending = true;
  return ++panelOpenSeq;
}

function endPanelOpen(seq) {
  if (seq !== panelOpenSeq) return false;
  panelPending = false;
  return true;
}

function cancelPendingPanel() {
  if (!panelPending) return false;
  panelPending = false;
  panelOpenSeq += 1;
  // 已经扩开的 Region 要收回去，否则整窗可点、挡住桌面
  if (api.setPanel) api.setPanel(null);
  return true;
}

function currentPanel() {
  if (confirmOpen) return confirmEl;
  if (settingsOpen) return settingsEl;
  if (pickerOpen) return pickerEl;
  if (menuOpen) return menuEl;
  return null;
}

function panelFocusable(panel) {
  return [...panel.querySelectorAll(PANEL_FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

function activatePanel(panel) {
  panel.setAttribute('aria-hidden', 'false');
  hitEl.setAttribute('aria-expanded', 'true');
  hitEl.setAttribute('aria-controls', panel.id);
  const first = panelFocusable(panel)[0] || panel;
  first.focus({ preventScroll: true });
}

function closePanelFocus(panel) {
  hitEl.setAttribute('aria-expanded', 'false');
  if (panel.contains(document.activeElement)) hitEl.focus({ preventScroll: true });
}

function trapPanelFocus(e) {
  const panel = currentPanel();
  if (!panel || e.key !== 'Tab') return;
  const items = panelFocusable(panel);
  if (!items.length) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!panel.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function positionMenu() {
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  const pad = 8;
  menuEl.style.left = `${clamp(menuAnchor.x, pad, Math.max(pad, innerWidth - w - pad))}px`;
  menuEl.style.top = `${clamp(menuAnchor.y, pad, Math.max(pad, innerHeight - h - pad))}px`;
}

function menuT(zh, vars) {
  const i = window.PetLib && window.PetLib.i18n;
  return i && i.T ? i.T(zh, vars) : zh;
}

function refreshMenu() {
  menuFeedTxt.textContent = menuT(isDsh() ? '喂一碗白饭' : '投喂');
  menuPomo.textContent = S.pomoRunning ? '🍅 ' + menuT('结束专注') : '🍅 ' + menuT('开始专注 {n} 分钟', { n: S.pomoMin });
  menuSleepIco.textContent = S.awake ? '😴' : '☀️';
  menuSleepTxt.textContent = S.awake ? menuT('让它睡一会儿') : menuT('叫醒它');
  const multi = !!(S.instance && S.instance.count > 1);
  const quitTxt = document.getElementById('menu-quit-txt');
  if (quitTxt) quitTxt.textContent = multi ? menuT('关闭这只') : menuT('退出');
  const quitAll = document.getElementById('menu-quit-all');
  if (quitAll) quitAll.classList.toggle('hide', !multi);
  const spawnBtn = menuEl.querySelector('[data-act="spawn"]');
  if (spawnBtn) {
    spawnBtn.querySelector('span').textContent = menuT('再养一只');
    spawnBtn.disabled = !!(S.instance && S.instance.count >= (S.instance.max || 16));
  }
  const l = S.ledger;
  const name = menuT(isDsh() ? '白饭账本' : '用量账本');
  if (l && l.available && l.rows && l.rows[0]) {
    menuUsage.textContent = `🧾 ${name} · ${l.providerShort || 'API'} ${l.rows[0].value}`;
  } else {
    menuUsage.textContent = `🧾 ${name}`;
  }
}

// 返回 false 表示这次展开在途中被取消或始终失败，调用方不应再显示面板。
async function ensurePanelOpen(seq) {
  const outdated = () => seq !== panelOpenSeq;
  // 首开面板时字体可能仍在 swap，等字体落定再显示，避免文字层空白
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 300)),
      ]);
    } catch { /* ignore */ }
  }
  // 字体等待期间可能已被 Esc / 点别处取消，此时不能再扩 Region，
  // 否则窗口会一直停在整窗可点状态，静默挡住桌面。
  if (outdated()) return false;
  if (!api.setPanel) return true;
  for (let i = 0; i < 3; i++) {
    try {
      await api.setPanel(true);
      // 展开途中被取消：把这次扩开立刻收回
      if (outdated()) {
        api.setPanel(null);
        return false;
      }
      return true;
    } catch {
      if (outdated()) return false;
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  return false;
}

async function openMenu(x, y) {
  closeSettings();
  closePicker();
  const seq = beginPanelOpen();
  refreshMenu();
  menuAnchor = { x, y };
  // 先让主进程把 Region 扩成整窗，再显示面板，避免开面板瞬间被裁
  if (!(await ensurePanelOpen(seq))) {
    // 被取消或扩展失败：清掉待打开标记，别让下一次点击被误吞
    if (seq === panelOpenSeq) panelPending = false;
    return;
  }
  if (!endPanelOpen(seq)) return;
  menuEl.classList.remove('hide');
  menuEl.scrollTop = 0;
  positionMenu();
  menuOpen = true;
  // 同步显示，避免窗口被遮挡/后台时 requestAnimationFrame 被节流，首次右键偶发“菜单不出现”
  void menuEl.offsetWidth;
  menuEl.classList.add('show');
  activatePanel(menuEl);
  const relayout = () => { if (menuOpen) positionMenu(); };
  requestAnimationFrame(() => {
    positionMenu();
    // 字体加载/文字变化会改变菜单尺寸，显示后再扩一次 Region 并重新夹取
    if (api.setPanel) api.setPanel(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
    setTimeout(relayout, 120);
    setTimeout(relayout, 360);
  });
}

window.addEventListener('pet-api-ready', () => {
  if (typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => { if (menuOpen) positionMenu(); }).observe(menuEl);
});

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  closePanelFocus(menuEl);
  menuEl.setAttribute('aria-hidden', 'true');
  menuEl.classList.remove('show');
  setTimeout(() => {
    if (!menuOpen) menuEl.classList.add('hide');
  }, 160);
  api.setPanel(null);
}
