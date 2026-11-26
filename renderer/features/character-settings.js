/*
 * 形象、音效、自动动作与番茄钟参数应用。初始化时由 pet.js 调用。
 */

function applyCharacter(id, save) {
  // 图集/立绘型包的素材目录与代码里的形象 key 不同（gptv1 -> gpt），
  // 下载完成或旧状态里出现 pack:gptv1 时统一映射回代码 key，避免用视频播图集。
  const prevKind = charNow().kind;
  const codeKey = Object.keys(CODE_CHAR_PACKS).find((k) => 'pack:' + CODE_CHAR_PACKS[k] === id);
  if (codeKey && CHARS[codeKey]) id = codeKey;
  const resolved = CHARS[id] ? id : 'v1';
  const missing = resolved !== id;
  S.character = resolved;
  if (missing && save) {
    saveSettings();
    setTimeout(() => say('形象包读取失败，已切回大肥鱼～', 3600), 500);
  }
  const kind = charNow().kind;
  applyAnimTables(charNow(), S.character);
  vidEl.classList.toggle('hide', kind !== 'video' && kind !== 'pack');
  petImgEl.classList.toggle('hide', kind !== 'pose');
  petSpriteEl.classList.toggle('hide', kind !== 'sprite');
  curAnim = '';
  curPose = '';
  oneShotPlaying = false;
  oneShotSeq++;
  clearTimeout(oneShotTimer);
  stopSpriteAnimation();
  pickerBuilt = false;
  pickerBody.innerHTML = '';
  if (prevKind === 'video' || prevKind === 'pack') releaseVideo();
  if (kind === 'video' || kind === 'pack') {
    petImgEl.removeAttribute('src');
    petSpriteEl.getContext('2d').clearRect(0, 0, SPRITE.cellW, SPRITE.cellH);
    spriteDrawn = '';
  }
  if (kind === 'pose') {
    petSpriteEl.getContext('2d').clearRect(0, 0, SPRITE.cellW, SPRITE.cellH);
    spriteDrawn = '';
  }
  if (kind === 'sprite') {
    petImgEl.removeAttribute('src');
    ensureSpriteSheet();
    hitEl.style.left = '126px';
    hitEl.style.top = '36px';
    hitEl.style.width = '173px';
    hitEl.style.height = '187px';
  } else {
    hitEl.style.left = '';
    hitEl.style.top = '';
    hitEl.style.width = '';
    hitEl.style.height = '';
  }
  refreshMenu();
  syncSettingsUI();
  markStoreDirty();       // 商店列表的「使用中」标记必须跟着切换刷新，否则选中和实际使用对不上
  applyBase();
  // 换形象后立刻按新动作表起一个基础动作；睡眠中必须继续睡，不能切回待机
  if (kind === 'video' || kind === 'pack') {
    curAnim = '';
    if (!S.awake || S.autoDoze) playAnim(ANIM.sleep, true);
    else playAnim(ANIM.idle, true);
  }
  // 专注中换形象：重启工作动作调度，避免停在旧动作/间歇
  if (S.pomoRunning) {
    clearPomoGap();
    pomoAnim = null;
    pomoResting = false;
    if (charNow().kind === 'pose') applyBase();
    else startPomoWork();
  }
  if (save) saveSettings();
}

function applySfx(v, save) {
  S.sfx = v === 'whale' || v === 'off' ? v : 'default';
  syncSettingsUI();
  if (save) saveSettings();
}

function applyAutoActionSec(v, save) {
  const n = Number(v);
  S.autoActionSec = clamp(Math.round((Number.isFinite(n) ? n : 40) / AUTO_STEP) * AUTO_STEP, AUTO_MIN, AUTO_MAX);
  syncSettingsUI();
  if (save) saveSettings();
}

function applyPomoMin(v, save) {
  const n = Number(v);
  S.pomoMin = clamp(Math.round(Number.isFinite(n) ? n : 25), POMO_MIN, POMO_MAX);
  syncSettingsUI();
  if (save) saveSettings();
}

function applyPomoAnimSec(v, save) {
  const n = Number(v);
  S.pomoAnimSec = clamp(Math.round((Number.isFinite(n) ? n : 5) / POMO_ANIM_STEP) * POMO_ANIM_STEP, POMO_ANIM_MIN, POMO_ANIM_MAX);
  // 正处在动作间休息时，按新间隔重新计时
  if (S.pomoRunning && pomoResting && !oneShotPlaying) enterPomoGap();
  syncSettingsUI();
  if (save) saveSettings();
}
