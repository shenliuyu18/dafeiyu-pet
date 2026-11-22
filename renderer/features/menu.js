/*
 * 右键菜单定位、内容刷新与开关。函数在 DOM 就绪后由 pet.js 调用。
 */

function positionMenu() {
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  const pad = 8;
  menuEl.style.left = `${clamp(menuAnchor.x, pad, Math.max(pad, innerWidth - w - pad))}px`;
  menuEl.style.top = `${clamp(menuAnchor.y, pad, Math.max(pad, innerHeight - h - pad))}px`;
}

function refreshMenu() {
  menuFeedTxt.textContent = isDsh() ? '喂一碗白饭' : '投喂';
  menuPomo.textContent = S.pomoRunning ? '🍅 结束专注' : `🍅 开始专注 ${S.pomoMin} 分钟`;
  menuSleepIco.textContent = S.awake ? '😴' : '☀️';
  menuSleepTxt.textContent = S.awake ? '让它睡一会儿' : '叫醒它';
  const l = S.ledger;
  if (l && l.source && l.source !== 'qoder') {
    const first = l.available && l.rows && l.rows[0] ? ` ${l.rows[0].value}` : '';
    menuUsage.textContent = `🍚 白饭账本 · ${l.providerShort || 'API'}${first}`;
  } else {
    menuUsage.textContent = l && l.available ? `🍚 ${isDsh() ? '白饭账本' : '用量账本'} · 本月 ${l.month}` : `🍚 ${isDsh() ? '白饭账本' : '用量账本'}`;
  }
}

async function ensurePanelOpen() {
  // 首开面板时字体可能仍在 swap，等字体落定再显示，避免文字层空白
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 300)),
      ]);
    } catch { /* ignore */ }
  }
  if (!api.setPanel) return;
  for (let i = 0; i < 3; i++) {
    try {
      await api.setPanel(true);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
}

async function openMenu(x, y) {
  closeSettings();
  closePicker();
  refreshMenu();
  menuAnchor = { x, y };
  // 先让主进程把 Region 扩成整窗，再显示面板，避免开面板瞬间被裁
  await ensurePanelOpen();
  menuEl.classList.remove('hide');
  menuEl.scrollTop = 0;
  positionMenu();
  menuOpen = true;
  // 同步显示，避免窗口被遮挡/后台时 requestAnimationFrame 被节流，首次右键偶发“菜单不出现”
  void menuEl.offsetWidth;
  menuEl.classList.add('show');
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

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => { if (menuOpen) positionMenu(); }).observe(menuEl);
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuEl.classList.remove('show');
  setTimeout(() => {
    if (!menuOpen) menuEl.classList.add('hide');
  }, 160);
  api.setPanel(null);
}
