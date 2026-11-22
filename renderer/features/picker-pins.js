/*
 * 动作置顶与弹窗判定。由选个动作面板与全局事件调用。
 */

function pinsFor(charId = S.character) {
  const arr = S.pinnedActions && S.pinnedActions[charId];
  return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
}

function actionText(name) {
  const prefix = name.startsWith('__pose:') ? '__pose:' : name.startsWith('__sprite:') ? '__sprite:' : '';
  if (!prefix) return name;
  const key = name.slice(prefix.length);
  const found = charNow().actions.find(([p]) => p === key);
  return found ? found[1] : key;
}

function actionAvailable(name) {
  const ch = charNow();
  if (ch.kind === 'pose') return ch.actions.some(([p]) => `__pose:${p}` === name);
  if (ch.kind === 'sprite') return ch.actions.some(([p]) => `__sprite:${p}` === name);
  return HAS.has(name);
}

function updatePickerHint(errorText) {
  if (!pickerHint) return;
  const n = pinsFor().filter(actionAvailable).length;
  pickerHint.textContent = errorText || `点击动作右侧的 ☆ 可置顶，当前 ${n}/${PINS_MAX}`;
  pickerHint.classList.toggle('err', !!errorText);
}

function togglePin(name) {
  const charId = S.character;
  const arr = [...pinsFor(charId)];
  const i = arr.indexOf(name);
  if (i >= 0) {
    arr.splice(i, 1);
  } else {
    if (arr.length >= PINS_MAX) {
      updatePickerHint(`最多置顶 ${PINS_MAX} 个动作，请先取消一个`);
      return;
    }
    arr.push(name);
  }
  S.pinnedActions = { ...S.pinnedActions, [charId]: arr };
  saveSettings();
  if (pickerOpen) {
    const scroll = pickerBody.scrollTop;
    pickerBuilt = false;
    pickerBody.innerHTML = '';
    buildPicker();
    pickerBody.scrollTop = scroll;
    positionPicker();
  } else {
    pickerBuilt = false;
  }
}

function modalOpen() {
  const m = document.getElementById('wails-modal-root');
  return !!m && !m.classList.contains('hide');
}
