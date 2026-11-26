/*
 * 指针交互事件：拖拽、点击、右键菜单、孤儿 mouseup 兜底、窗口 resize。
 * 在 pet.js 初始化完成后加载。
 */

// #hit 用 div 模拟按钮；键盘 click 的 detail 为 0，不重复走指针拖拽判定。
hitEl.addEventListener('click', (e) => {
  if (e.detail === 0) handlePetClick();
});

// 键盘（Shift+F10 / ContextMenu）打开菜单后，Chromium 还会再派发一次 contextmenu。
// 不忽略它的话，菜单会被二次定位，或按「点到面板外」被立刻关掉。
let menuKeyAt = 0;

document.addEventListener('keydown', (e) => {
  if (modalOpen()) return;
  if (e.key === 'Escape') {
    const panel = currentPanel();
    // 面板还在等 Region 时不开放大：此时按 Esc 就应该取消
    if (!panel) {
      if (cancelPendingPanel()) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (panel === confirmEl) closeConfirm(false);
    else if (panel === menuEl) closeMenu();
    else if (panel === settingsEl) closeSettings();
    else closePicker();
    return;
  }
  trapPanelFocus(e);
  if (e.defaultPrevented || document.activeElement !== hitEl) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) hitEl.click();
  } else if (!e.repeat && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu' || e.code === 'ContextMenu')) {
    e.preventDefault();
    menuKeyAt = Date.now();
    const rect = hitEl.getBoundingClientRect();
    void openMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}, true);

window.addEventListener('resize', () => {
  if (menuOpen) positionMenu();
  if (settingsOpen) positionSettings();
  if (pickerOpen) positionPicker();
});

// Wails 版 API Key / 自定义文字弹窗挂在 #settings 之外，点弹窗时不能被当成"点面板外"


// 兜底：两个版本同时运行时，个别情况下按下事件会被系统吞掉（只剩 up）。
// 1) 孤儿 up 落在菜单/设置卡/动作面板的按钮上 → 补发一次点击，保证按钮可用；
// 2) 孤儿 up 落在鱼身上 → 按一次"点击"处理（双击喂饭也由此兜底）；
// 3) 孤儿 up 落在面板外 → 等价于"点击别处"，收起面板（否则菜单关不掉）
let downSeen = false;
document.addEventListener('mousedown', () => {
  downSeen = true;
}, true);
document.addEventListener(
  'mouseup',
  (e) => {
    const orphan = !downSeen;
    downSeen = false;
    if (!orphan || !e.target || !e.target.closest || modalOpen()) return;
    const btn = e.target.closest('#menu button, #settings button, #picker button');
    if (btn) {
      btn.click();
      return;
    }
    if (e.target.closest('#hit')) {
      closeMenu();
      closeSettings();
      closePicker();
      handlePetClick();
      return;
    }
    if (menuOpen && !e.target.closest('#menu')) closeMenu();
    if (settingsOpen && !e.target.closest('#settings')) closeSettings();
    if (pickerOpen && !e.target.closest('#picker')) closePicker();
  },
  true,
);

// ---------------------------------------------------------------- 指针交互

// 点击/双击判定不依赖浏览器的 dblclick 事件：两个版本同时运行时个别"按下"会被系统
// 吞掉，Chromium 便不会产生 dblclick（表现为双击喂饭时灵时不灵）。这里自己数连击，
// 500ms 内两次点击即喂饭；配合上面的孤儿 up 兜底，只有 up 也能算一次点击


// 采样当前动画帧/立绘的 alpha 包围盒，避免 Region 切掉立绘两侧或动作道具
hitEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  closeMenu();
  closeSettings();
  closePicker();
  S.dragging = true;
  S.downAt = Date.now();
  S.downX = e.clientX;
  S.downY = e.clientY;
  S.moved = 0;
  P.dragOff.x = e.clientX - P.x;
  P.dragOff.y = e.clientY - P.y;
  P.target = null;
  stage.classList.add('drag');
  api.setDragging(true);
  applyBase();
  wake();
});

document.addEventListener('mousemove', (e) => {
  S.mouse.x = e.clientX;
  S.mouse.y = e.clientY;
  applyLean(e.clientX, e.clientY);

  if (!S.dragging) return;
  S.moved = Math.max(S.moved, Math.hypot(e.clientX - S.downX, e.clientY - S.downY));
  if (S.moved > 3) {
    P.x = e.clientX - P.dragOff.x;
    P.y = e.clientY - P.dragOff.y;
    clampInBounds();
  }
});

window.addEventListener('mouseup', () => {
  if (!S.dragging) return;
  S.dragging = false;
  stage.classList.remove('drag');
  applyBase();

  // 松手瞬间 Region 会从整窗收缩回角色区域。若此时直接用上一次上报的盒子，
  // 拖拽中的位置（80ms 节流）已经落后，右边会被裁掉一段——看起来就是闪一下。
  // 因此先用当前位置强制上报，并等新动画能出帧（形状确定）后再放开 Region。
  const release = () => { api.setDragging(false); };
  const report = () => Promise.resolve(reportRegionNow(true));
  if (charNow().kind === 'video' && vidEl.readyState < 2) {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      vidEl.removeEventListener('loadeddata', once);
      report().finally(release);
    };
    vidEl.addEventListener('loadeddata', once);
    setTimeout(once, 200);   // 兜底：动画加载异常时别把 Region 挂在整窗
  } else {
    report().finally(release);
  }

  if (S.moved < 6 && Date.now() - S.downAt < 500) handlePetClick();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // 紧随键盘打开的那一次 contextmenu 是合成事件，交给 keydown 处理即可。
  // 用掉就清零：之后 400ms 内的真实右键（如换个位置、点到空白处收起）必须照常生效。
  if (Date.now() - menuKeyAt < 400) {
    menuKeyAt = 0;
    return;
  }
  if (S.dragging || modalOpen()) return;
  if (hitTest(e.clientX, e.clientY)) openMenu(e.clientX, e.clientY);
  else {
    closeMenu();
    closePicker();
  }
});

document.addEventListener('mousedown', (e) => {
  // 弹窗不再是带遮罩的模态：点弹窗外关闭，点弹窗内照常操作
  if (modalOpen()) {
    if (!e.target.closest('#wails-modal-root')) api.closeOverlays();
    return;
  }
  // 确认框优先：点框外视为取消
  if (confirmOpen) {
    if (!e.target.closest('#confirm')) closeConfirm(false);
    return;
  }
  if (!menuOpen && !settingsOpen && !pickerOpen) { cancelPendingPanel(); return; }
  if (menuOpen && !e.target.closest('#menu')) closeMenu();
  if (settingsOpen && !e.target.closest('#settings')) closeSettings();
  if (pickerOpen && !e.target.closest('#picker')) closePicker();
});
