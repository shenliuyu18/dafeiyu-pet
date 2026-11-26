/*
 * 确认 / 提示面板：替代浏览器原生 confirm()、alert()。
 * 原生对话框标题固定显示 "wails.localhost"，字体与配色也无法跟随设置，
 * 因此在渲染层自绘一个与菜单、动作面板同源外观的面板。
 */

let confirmOpen = false;
let confirmResolve = null;
// 独立于菜单/面板的互斥序号：确认框是浮层，不该被其它面板的开合影响。
let confirmSeq = 0;
// 弹窗定位锚点：优先贴近触发它的按钮（设置里的“卸载”），避免跑到桌宠旁的空白处
let confirmAnchor = null;

function positionConfirm() {
  const w = confirmEl.offsetWidth;
  const h = confirmEl.offsetHeight;
  const pad = 8;
  const maxL = Math.max(pad, innerWidth - w - pad);
  const maxT = Math.max(pad, innerHeight - h - pad);

  if (confirmAnchor) {
    // 贴近触发按钮：默认放在按钮左下方，放不下就翻到左上方，最后夹进窗口
    let sx = confirmAnchor.left;
    let sy = confirmAnchor.bottom + 8;
    if (sx + w > innerWidth - pad) sx = confirmAnchor.right - w;
    if (sy + h > innerHeight - pad) sy = confirmAnchor.top - h - 8;
    confirmEl.style.left = `${clamp(sx, pad, maxL)}px`;
    confirmEl.style.top = `${clamp(sy, pad, maxT)}px`;
    return;
  }

  // 没有按钮锚点（如 Esc/快捷键触发）时退回贴桌宠
  const v = visiblePetRect();
  let sx = v.left - w - 10;
  if (sx < pad) sx = v.right + 10;
  confirmEl.style.left = `${clamp(sx, pad, maxL)}px`;
  confirmEl.style.top = `${clamp(v.top - 8, pad, maxT)}px`;
}

// opts: { title, message, okText, cancelText, danger, alert }
// alert 为 true 时只显示一个确认按钮。
async function askConfirm(opts) {
  const o = opts || {};
  if (confirmOpen) closeConfirm(false);
  // 锚点 = 当前焦点/点击的那个按钮，让弹窗出现在它旁边而不是桌宠旁边
  confirmAnchor = null;
  try {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#settings, #picker, #menu, button')) {
      const r = ae.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        confirmAnchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }
    }
  } catch { /* ignore */ }
  confirmTitleEl.textContent = o.title || '确认操作';
  confirmMsgEl.textContent = o.message || '';
  confirmOkBtn.textContent = o.okText || '确定';
  confirmOkBtn.classList.toggle('danger', !!o.danger);
  confirmCancelBtn.classList.toggle('hide', !!o.alert);
  confirmCancelBtn.textContent = o.cancelText || '取消';

  // 确认框是独立浮层，且必须「立刻」出现（用户刚点了卸载）。
  // 不能像菜单那样先 await 扩 Region：那条调用排在 UI 串行队列后面，
  // 前面只要有一次未完成的窗口操作，这里就会一直等，用户会以为按钮没反应。
  // 因此先显示，再异步请求扩 Region。
  const mySeq = ++confirmSeq;

  confirmEl.classList.remove('hide');
  confirmEl.setAttribute('aria-hidden', 'false');
  confirmOpen = true;
  positionConfirm();
  void confirmEl.offsetWidth;
  confirmEl.classList.add('show');
  activatePanel(confirmEl);
  // 面板可能比桌宠命中区大，扩一次整窗避免被 Region 裁掉
  if (api.setPanel) {
    Promise.resolve(api.setPanel(true)).catch(() => {});
  }
  // 文字变化会改变高度，显示后再夹一次
  requestAnimationFrame(() => { if (confirmOpen && mySeq === confirmSeq) positionConfirm(); });

  return new Promise((resolve) => { confirmResolve = resolve; });
}

function closeConfirm(result) {
  if (!confirmOpen) return;
  confirmOpen = false;
  confirmSeq += 1;   // 作废任何仍在等待 Region 的打开流程
  closePanelFocus(confirmEl);
  confirmEl.setAttribute('aria-hidden', 'true');
  confirmEl.classList.remove('show');
  setTimeout(() => {
    if (!confirmOpen) confirmEl.classList.add('hide');
  }, 160);
  // 确认框可能是叠在「设置 / 动作面板」之上弹出的。取消/确定后如果背后的面板还开着，
  // 就不能把整窗 Region 收回，否则背后的设置面板会立刻被鱼形 Region 裁掉（卸载→取消可稳定复现）。
  const under = (typeof currentPanel === 'function') ? currentPanel() : null;
  if (under) {
    if (api.setPanel) api.setPanel(true);
  } else {
    api.setPanel(null);
  }
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(!!result);
}

// 用委托而不是直接引用按钮：本文件先于 pet.js 加载，此时按钮的 const 还没初始化。
document.addEventListener('click', (e) => {
  if (!confirmOpen) return;
  const btn = e.target && e.target.closest && e.target.closest('#confirm button');
  if (!btn) return;
  if (btn.id === 'confirm-ok') closeConfirm(true);
  else if (btn.id === 'confirm-cancel') closeConfirm(false);
});
