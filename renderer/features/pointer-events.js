/*
 * 指针交互事件：拖拽、点击、右键菜单、孤儿 mouseup 兜底、窗口 resize。
 * 在 pet.js 初始化完成后加载。
 */

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
  api.setDragging(false);
  applyBase();
  if (S.moved < 6 && Date.now() - S.downAt < 500) handlePetClick();
});

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (S.dragging || modalOpen()) return;
  if (hitTest(e.clientX, e.clientY)) openMenu(e.clientX, e.clientY);
  else {
    closeMenu();
    closePicker();
  }
});

document.addEventListener('mousedown', (e) => {
  if (modalOpen()) return;
  if (menuOpen && !e.target.closest('#menu')) closeMenu();
  if (settingsOpen && !e.target.closest('#settings')) closeSettings();
  if (pickerOpen && !e.target.closest('#picker')) closePicker();
});
