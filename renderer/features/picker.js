/*
 * 选个动作面板：分组、置顶、打开与关闭。函数由 pet.js 事件调用。
 */

function pickerSec(label, items) {
  const sec = document.createElement('div');
  sec.className = 'pick-sec';
  const lab = document.createElement('div');
  lab.className = 'pick-label';
  lab.textContent = label;
  const row = document.createElement('div');
  row.className = 'pick-row';
  for (const it of items) {
    const n = typeof it === 'string' ? it : it.id;
    const text = typeof it === 'string' ? it : it.text;
    const item = document.createElement('div');
    item.className = 'pick-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.anim = n;
    b.textContent = text;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `pick-pin${pinsFor().includes(n) ? ' on' : ''}`;
    pin.dataset.pin = n;
    pin.title = pinsFor().includes(n) ? '取消置顶' : '置顶这个动作';
    pin.setAttribute('aria-label', pin.title);
    pin.textContent = pinsFor().includes(n) ? '📌' : '☆';
    item.append(b, pin);
    row.appendChild(item);
  }
  sec.append(lab, row);
  return sec;
}

function buildPicker() {
  if (pickerBuilt) return;
  pickerBuilt = true;
  updatePickerHint();
  const ch = charNow();
  const pinned = pinsFor().filter(actionAvailable);
  if (pinned.length) {
    pickerBody.appendChild(
      pickerSec(`📌 置顶动作 ${pinned.length}/${PINS_MAX}`, pinned.map((n) => ({ id: n, text: actionText(n) }))),
    );
  }
  if (ch.kind === 'sprite') {
    // GPT 娘：直接列图集动作（__sprite: 前缀走同一套播放管线）
    pickerBody.appendChild(
      pickerSec(
        `${ch.label} 的动作`,
        ch.actions.map(([p, text]) => ({ id: `__sprite:${p}`, text })),
      ),
    );
    return;
  }
  if (ch.kind === 'pose') {
    // 立绘形象：直接列它自己的姿势（__pose: 前缀走同一套播放管线）
    pickerBody.appendChild(
      pickerSec(
        `${ch.label} 的动作`,
        ch.actions.map(([p, text]) => ({ id: `__pose:${p}`, text })),
      ),
    );
    return;
  }
  const added = new Set();
  for (const g of PICKER_GROUPS) {
    const items = [];
    for (const n of g.list) {
      if (added.has(n) || !HAS.has(n) || items.includes(n)) continue;
      items.push(n);
    }
    if (!items.length) continue;
    items.forEach((n) => added.add(n));
    pickerBody.appendChild(pickerSec(g.name, items));
  }
  // 扩充包动作单独列一节；plus 池只参与随机调度，不在 PICKER_GROUPS 里
  const plus = byPool('plus').filter((n) => HAS.has(n) && !added.has(n));
  if (plus.length) {
    plus.forEach((n) => added.add(n));
    const target = Object.keys(PLUS).find((k) => CHARS[k]) || 'v1';
    pickerBody.appendChild(pickerSec(`${CHARS[target].label} plus（${plus.length}）`, plus));
  }
  const rest = [...HAS].filter((n) => !added.has(n)).sort();
  if (rest.length) pickerBody.appendChild(pickerSec('其他', rest));
}

function positionPicker() {
  const w = pickerEl.offsetWidth;
  const h = pickerEl.offsetHeight;
  const v = visiblePetRect();
  let sx = v.left - w - 10; // 贴着角色左侧
  if (sx < 8) sx = v.right + 10; // 左边放不下就贴右侧
  pickerEl.style.left = `${clamp(sx, 8, Math.max(8, innerWidth - w - 8))}px`;
  pickerEl.style.top = `${clamp(v.top - 8, 8, Math.max(8, innerHeight - h - 8))}px`;
}

async function openPicker() {
  closeMenu();
  closeSettings();
  buildPicker();
  await ensurePanelOpen();
  pickerEl.classList.remove('hide');
  positionPicker();
  pickerOpen = true;
  P.frozen = true;
  P.vx = 0;
  P.vy = 0;
  P.target = null;
  stage.classList.remove('swim');
  requestAnimationFrame(() => {
    positionPicker();
    pickerEl.classList.add('show');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (pickerOpen) positionPicker(); }).catch(() => {});
    setTimeout(() => { if (pickerOpen) positionPicker(); }, 300);
  });
}

function closePicker() {
  if (!pickerOpen) return;
  pickerOpen = false;
  pickerEl.classList.remove('show');
  setTimeout(() => {
    if (!pickerOpen) pickerEl.classList.add('hide');
  }, 160);
  P.frozen = false;
  api.setPanel(null);
}

function playAction(name) {
  wake();
  if (S.autoDoze) {
    S.autoDoze = false;
    applyDoze();
  }
  playOnce([name], true);
}
