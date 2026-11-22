/*
 * 主循环、就绪标记、气泡定位与 Region 保活。
 */

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) {
    lastFrame = now;
    return;
  }
  const gap = now - lastFrame;
  // 拖拽必须满帧；漫游按 roamFrameGap（默认约 45fps）；空闲降到 10fps 左右。
  const gapLimit = window.PetLib.frameSchedule.gapLimit({ dragging: S.dragging, vx: P.vx, vy: P.vy, idleGap: idleFrameGap, roamGap: roamFrameGap });
  if (gap < gapLimit) return;
  // 注意：只有真正处理这一帧才推进 lastFrame。若每次 rAF 都更新，
  // 空闲时 gap 永远是 ~16ms，会一帧都进不来。
  lastFrame = now;
  const dt = Math.min(0.05, gap / 1000);
  step(dt);
  updateEdgeFlips();
  applyLean(S.mouse.x, S.mouse.y);
  const t = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
  if (t !== lastTransform) {
    lastTransform = t;
    petEl.style.transform = t;
  }
  // 上报粒度 80ms；位置没变化时压到 400ms 保活一次（气泡、倒计时牌等命中框变化靠它补上）。
  // 以前是雷打不动的 50ms，静止时也在白跑 JSON 序列化 + Go 端 SetWindowRgn。
  if (now - lastPosReport > 80) {
    const rx = Math.round(P.x);
    const ry = Math.round(P.y);
    if (window.PetLib.frameSchedule.shouldReportPosition(now, lastPosReport, lastPosSentAt, rx, ry, lastSentX, lastSentY)) {
      lastPosReport = now;
      lastSentX = rx;
      lastSentY = ry;
      lastPosSentAt = now;
      api.reportPos({ x: rx, y: ry, s: petScale });
    }
  }
}

function markPetReady() {
  if (document.body.classList.contains('pet-ready')) return;
  if (petRevealTimer) {
    clearTimeout(petRevealTimer);
    petRevealTimer = 0;
  }
  lastTransform = '';
  petEl.style.transform = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
  document.body.classList.add('pet-ready');
}

function clampInBounds() {
  const b = bounds();
  P.x = clamp(P.x, b.minX, b.maxX);
  P.y = clamp(P.y, b.minY, b.maxY);
}

function updateEdgeFlips() {
  const up = P.y + 348 * petScale > innerHeight;
  if (up !== chipUp) {
    chipUp = up;
    petEl.classList.toggle('chip-up', up);
  }
}

function positionBubble() {
  const h = Math.max(bubbleEl.offsetHeight, 240);
  bubbleEl.classList.toggle('down', window.PetLib.bubble.shouldFlipDown(P.y, h, petScale));

  // 用实测的屏幕坐标校正：气泡所在的 #scale 缩放和 petScale 不是同一个值，
  // 按比例换算会算错。关键：水平、垂直的偏移都要「先归零 → 量测 → 按实际缩放换算」，
  // 否则会在「已挪好」和「没挪」两个状态之间反复横跳——用户看到的就是
  // 「先弹出一半（被窗口上沿裁掉）→ 又变成完整」。
  // 迭代收敛式夹取：不做任何「布局坐标↔屏幕坐标」换算（那套换算在 fs/petScale
  // 叠加时永远算不准），而是量一次挪一点、再量再挪，2~3 次后必然收敛到屏幕内。
  // 每轮：归零 → 量 → 计算本轮需要的屏幕像素位移 → 按上一轮的经验比例折算成本轮增量。
  let accX = 0, accY = 0, prevScale = 0;
  for (let k = 0; k < 3; k++) {
    bubbleEl.style.marginLeft = accX ? `${accX.toFixed(1)}px` : '';
    bubbleEl.style.setProperty('--bubble-shift', accY ? `${accY.toFixed(1)}px` : '');
    const r = bubbleEl.getBoundingClientRect();
    if (!r.width) break;
    const scale = bubbleEl.offsetWidth ? r.width / bubbleEl.offsetWidth : 1;
    const need = window.PetLib.bubble.edgeShift(r, innerWidth, 4);
    if (k === 0) prevScale = scale;
    if (Math.abs(need) < 2) break;
    // 用「上一轮测得的实际缩放」把本轮屏幕像素位移折算成布局增量
    const ratio = prevScale || scale || 1;
    accX += need / ratio;
    const upNeed = window.PetLib.bubble.topShift(r, 4) / ratio;
    accY += upNeed;
  }
  bubbleEl.style.marginLeft = accX ? `${accX.toFixed(1)}px` : '';
  bubbleEl.style.setProperty('--bubble-shift', accY ? `${accY.toFixed(1)}px` : '');
}

function reportRegionNow(includeBubble) {
  const x = Math.round(P.x);
  const y = Math.round(P.y);
  lastSentX = x;
  lastSentY = y;
  lastPosSentAt = performance.now();
  return api.reportPos({ x, y, s: petScale, force: true, bubble: !!includeBubble });
}

function reserveBubbleSpace(px) {
  bubbleReserve = Math.max(bubbleReserve, px || 0);
  return reportRegionNow(true);
}

function withBubbleRoom(fn) {
  if (!bubbleEl.classList.contains('show')) {
    fn();
    return;
  }
  reserveBubbleSpace(420).then(fn, fn);
}

function cornerSpot(b) {
  const x = b.maxX;
  return { x: clamp(x, b.minX, b.maxX), y: b.maxY };
}
