/*
 * 图集播放：加载 spritesheet、按行采样、序列推进与待机循环。
 */

function ensureSpriteSheet() {
  if (spriteSheetImg) return spriteSheetImg;
  const img = new Image();
  img.decoding = 'async';
  img.src = SPRITE.sheet;
  img.onload = () => {
    if (charNow().kind === 'sprite') applyBase();
  };
  spriteSheetImg = img;
  return img;
}

function drawSpriteCell(row, col) {
  const key = `${row}:${col}`;
  if (key === spriteDrawn) return;
  const img = ensureSpriteSheet();
  if (!img || !img.naturalWidth) return;
  const ctx = petSpriteEl.getContext('2d');
  ctx.clearRect(0, 0, SPRITE.cellW, SPRITE.cellH);
  ctx.drawImage(img, col * SPRITE.cellW, row * SPRITE.cellH, SPRITE.cellW, SPRITE.cellH, 0, 0, SPRITE.cellW, SPRITE.cellH);
  spriteDrawn = key;
}

function stopSpriteAnimation() {
  spriteSeqId++;
  clearTimeout(spriteTimer);
  spriteTimer = null;
  spriteMode = 'idle';
  spriteLookIndex = null;
}

function spriteSequence(key) {
  return SPRITE.sequences[key] || SPRITE.sequences.waiting;
}

function spriteDurationKey(key) {
  const seq = spriteSequence(key);
  const start = seq.frame || 0;
  return seq.times.slice(start).reduce((a, b) => a + b, 0);
}

function spriteKeyFor(name) {
  const raw = name && name.startsWith('__sprite:') ? name.slice(9) : SPRITE_MAP[name] || 'waiting';
  // 移动类动作按朝向选左右两套装帧（图集里两套发饰方向不同，不做镜像）
  return raw === 'run' ? (P.facing === 'left' ? 'runLeft' : 'runRight') : raw;
}

function spriteDuration(name) {
  return spriteDurationKey(spriteKeyFor(name));
}

function spriteLookIndexAt() {
  const r = petSpriteEl.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  const dx = S.mouse.x - (r.left + r.width / 2);
  const dy = S.mouse.y - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < 1) return null;
  return Math.round(((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 22.5) % 16;
}

function startSpriteSequence(key, loop) {
  const seq = spriteSequence(key);
  const id = ++spriteSeqId;
  clearTimeout(spriteTimer);
  spriteMode = 'sequence';
  spriteLookIndex = null;
  spriteFrame = seq.frame || 0;
  const tick = () => {
    if (id !== spriteSeqId || charNow().kind !== 'sprite' || spriteMode !== 'sequence') return;
    drawSpriteCell(seq.row, spriteFrame);
    const ms = seq.times[spriteFrame] || 150;
    spriteFrame++;
    if (spriteFrame >= seq.count) {
      if (loop) {
        spriteFrame = seq.frame || 0;
      } else {
        spriteTimer = null;
        return;
      }
    }
    spriteTimer = setTimeout(tick, ms);
  };
  tick();
}

function startSpriteIdle() {
  const id = ++spriteSeqId;
  clearTimeout(spriteTimer);
  spriteMode = 'idle';
  spriteFrame = 0;
  spriteLookIndex = null;
  const idle = SPRITE.sequences.idle;
  const tick = () => {
    if (id !== spriteSeqId || charNow().kind !== 'sprite' || spriteMode !== 'idle') return;
    const look = performance.now() - lastCursorAt < 1800 ? spriteLookIndexAt() : null;
    if (look !== null) {
      if (look !== spriteLookIndex) {
        spriteLookIndex = look;
        drawSpriteCell(9 + Math.floor(look / 8), look % 8);
      }
      spriteTimer = setTimeout(tick, 90);
      return;
    }
    spriteLookIndex = null;
    drawSpriteCell(idle.row, spriteFrame);
    const ms = idle.times[spriteFrame] || 150;
    spriteFrame = (spriteFrame + 1) % idle.count;
    spriteTimer = setTimeout(tick, ms);
  };
  tick();
}

function playSprite(name, loop, restart) {
  const key = spriteKeyFor(name);
  // 同一状态被重复触发时不要从头重放，否则待机/工作会被反复打断
  if (!restart && name === curAnim && spriteTimer) {
    if (key === 'idle' && spriteMode === 'idle') return;
    if (key !== 'idle' && spriteMode === 'sequence') return;
  }
  curAnim = name;
  curNoMirror = true;
  refreshFlip();
  if (key === 'idle') startSpriteIdle();
  else startSpriteSequence(key, loop);
}
