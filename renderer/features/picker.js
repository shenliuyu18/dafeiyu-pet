/*
 * 选个动作面板：分组、置顶、打开与关闭。函数由 pet.js 事件调用。
 */

// 按形象记住上次浏览到的滚动位置：切换形象后再切回来，仍停在原处。
const pickerScrollByChar = {};

function pickerSec(label, items) {
  const sec = document.createElement('details');
  sec.className = 'pick-sec';
  sec.open = true;
  const lab = document.createElement('summary');
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

// 搜索过滤：纯前端隐藏不匹配的动作项与空分组，不重建 DOM（保留置顶与滚动状态）。
function applyPickerFilter() {
  const box = document.getElementById('picker-search');
  const q = (box && box.value ? box.value : '').trim().toLowerCase();
  let total = 0;
  for (const sec of pickerBody.querySelectorAll('.pick-sec')) {
    let visible = 0;
    for (const item of sec.querySelectorAll('.pick-item')) {
      const btn = item.querySelector('button[data-anim]');
      const hit = !q || (btn && btn.textContent.toLowerCase().includes(q));
      item.classList.toggle('pick-hide', !hit);
      if (hit) visible++;
    }
    sec.classList.toggle('pick-hide', visible === 0);
    if (q && visible > 0) sec.open = true;
    total += visible;
  }
  const empty = document.getElementById('picker-empty');
  if (empty) empty.classList.toggle('hide', total > 0 || !q);
}

function bindPickerSearch() {
  const box = document.getElementById('picker-search');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';
  box.addEventListener('input', applyPickerFilter);
}

function buildPicker() {
  if (pickerBuilt) return;
  pickerBuilt = true;
  updatePickerHint();
  const frag = document.createDocumentFragment();
  pickerBody.replaceChildren();
  const ch = charNow();
  const pinned = pinsFor().filter(actionAvailable);
  if (pinned.length) {
    frag.appendChild(
      pickerSec(`📌 置顶动作 ${pinned.length}/${PINS_MAX}`, pinned.map((n) => ({ id: n, text: actionText(n) }))),
    );
  }
  if (ch.kind === 'sprite' || ch.kind === 'pose') {
    // 图集 / 立绘形象：直接列它自己的动作（__sprite: / __pose: 前缀走同一套播放管线）
    const prefix = ch.kind === 'sprite' ? '__sprite:' : '__pose:';
    frag.appendChild(
      pickerSec(`${shortPackName(ch.label)} 的动作`, ch.actions.map(([p, text]) => ({ id: prefix + p, text }))),
    );
    pickerBody.appendChild(frag);
    applyPickerFilter();
    return;
  }
  const added = new Set();
  const pack = activePack();
  if (pack) {
    // 下载形象包：完全按包内清单 actions[].category 分组（分类与动作名都来自包）
    const catOf = new Map((pack.actions || []).map((a) => [a.id, a.category || '未分类']));
    const groups = new Map();
    for (const n of HAS) {
      const c = catOf.get(n) || '其他';
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(n);
    }
    const weightOf = (c) => (typeof PACK_CAT_WEIGHT !== 'undefined' && PACK_CAT_WEIGHT[c]) || 0;
    const cats = [...groups.keys()].sort((a, b) => weightOf(b) - weightOf(a) || String(a).localeCompare(String(b), 'zh'));
    for (const c of cats) {
      const items = groups.get(c);
      items.forEach((n) => added.add(n));
      frag.appendChild(pickerSec(c, items));
    }
  } else {
    for (const g of PICKER_GROUPS) {
      const items = [];
      for (const n of g.list) {
        if (added.has(n) || !HAS.has(n) || items.includes(n)) continue;
        items.push(n);
      }
      if (!items.length) continue;
      items.forEach((n) => added.add(n));
      frag.appendChild(pickerSec(g.name, items));
    }
    // 内置大肥鱼 plus 扩充动作：按包内 category 分类展示
    const plus = byPool('plus').filter((n) => HAS.has(n) && !added.has(n));
    if (plus.length) {
      plus.forEach((n) => added.add(n));
      const plusTarget = Object.keys(PLUS).find((k) => CHARS[k]);
      const meta = (plusTarget && PLUS[plusTarget] && PLUS[plusTarget].actions) || [];
      const catOf = new Map(meta.map((a) => [a.id, a.category || '未分类']));
      const tI = window.PetLib && window.PetLib.i18n;
      const T = (z) => (tI && tI.T ? tI.T(z) : z);
      const label = T(shortPackName(plusTarget && CHARS[plusTarget] ? CHARS[plusTarget].label : '大肥鱼')) + ' plus';
      const groups = new Map();
      for (const n of plus) {
        const c = catOf.get(n) || '未分类';
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(n);
      }
      const weightOf = (c) => (typeof PACK_CAT_WEIGHT !== 'undefined' && PACK_CAT_WEIGHT[c]) || 0;
      const cats = [...groups.keys()].sort((a, b) => weightOf(b) - weightOf(a) || String(a).localeCompare(String(b), 'zh'));
      for (const c of cats) {
        frag.appendChild(pickerSec(`${label} · ${T(c)}（${groups.get(c).length}）`, groups.get(c)));
      }
    }
  }
  const rest = [...HAS].filter((n) => !added.has(n)).sort();
  if (rest.length) frag.appendChild(pickerSec('其他', rest));
  pickerBody.appendChild(frag);
  applyPickerFilter();
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
  const seq = beginPanelOpen();
  bindPickerSearch();
  const searchBox = document.getElementById('picker-search');
  if (searchBox) searchBox.value = '';
  buildPicker();
  applyPickerFilter();
  const restoreScroll = pickerScrollByChar[S.character] || 0;
  if (!(await ensurePanelOpen(seq))) {
    if (seq === panelOpenSeq) panelPending = false;
    return;
  }
  if (!endPanelOpen(seq)) return;
  pickerEl.classList.remove('hide');
  pickerEl.setAttribute('aria-hidden', 'false');
  positionPicker();
  pickerOpen = true;
  P.frozen = true;
  P.vx = 0;
  P.vy = 0;
  P.target = null;
  stage.classList.remove('swim');
  requestAnimationFrame(() => {
    positionPicker();
    if (!pickerOpen) return;
    pickerEl.classList.add('show');
    activatePanel(pickerEl);
    // 恢复该形象上次的滚动位置（面板此时已显示、高度可量，设置才有意义）
    pickerBody.scrollTop = restoreScroll;
    // 与右键菜单一致：显示后再扩一次 Region 并重定位，避免首帧 Region 未定稳时面板被裁。
    if (api.setPanel) api.setPanel(true);
    const relayout = () => {
      if (!pickerOpen) return;
      positionPicker();
      if (api.setPanel) api.setPanel(true);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
    setTimeout(relayout, 120);
    setTimeout(relayout, 300);
  });
}

function closePicker() {
  if (!pickerOpen) return;
  pickerOpen = false;
  if (pickerBody) pickerScrollByChar[S.character] = pickerBody.scrollTop;
  closePanelFocus(pickerEl);
  pickerEl.setAttribute('aria-hidden', 'true');
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
