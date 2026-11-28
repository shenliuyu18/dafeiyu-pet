/*
 * 主循环、就绪标记、气泡定位与 Region 保活。
 */

function frame(now) {
  requestAnimationFrame(frame);
  // 画面停更看门狗（定义在 runtime.js）：vidEl 在 pet.js 才定义，所以延迟到首帧再初始化。
  if (typeof initStallWatch === 'function') initStallWatch();
  if (typeof watchRafGap === 'function') watchRafGap(now);
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
  applyBreath(now);
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

// 省电待机的呼吸位移：跟着主循环的空闲帧率（约 10fps）走，替代原来 60fps 的 CSS 动画。
// 实测那样每帧都要合成一次透明视频层，渲染进程 CPU 会从 ~8% 涨到 ~17%，省电模式反而更费电。
const breathEl = document.getElementById('petBox');
let lastBreath = '';
function applyBreath(now) {
  // powerIdle 由 pet.js 维护；脚本加载顺序不影响这里运行时读取
  const on = window.powerIdle === true;
  const t = on ? `translate3d(0, ${(Math.sin((now / 3600) * Math.PI * 2) * 2).toFixed(1)}px, 0)` : '';
  if (t === lastBreath) return;
  lastBreath = t;
  breathEl.style.transform = t;
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

let bubblePosRatio = 1;

function positionBubble() {
  const h = Math.max(bubbleEl.offsetHeight, 240);
  bubbleEl.classList.toggle('down', window.PetLib.bubble.shouldFlipDown(P.y, h, petScale));

  // 用实测的屏幕坐标校正：气泡所在的 #scale 缩放和 petScale 不是同一个值，
  // 按比例换算会算错。关键：水平、垂直的偏移都要「先归零 → 量测 → 按实际缩放换算」，
  // 否则会在「已挪好」和「没挪」两个状态之间反复横跳——用户看到的就是
  // 「先弹出一半（被窗口上沿裁掉）→ 又变成完整」。
  // 缩放比例在同一次布局里是稳定的，缓存后两轮即可收敛；原先每轮都重新量，
  // 连续 20 次气泡会多出 20 次强制重排。
  let accX = 0, accY = 0;
  for (let k = 0; k < 2; k++) {
    bubbleEl.style.marginLeft = accX ? `${accX.toFixed(1)}px` : '';
    bubbleEl.style.setProperty('--bubble-shift', accY ? `${accY.toFixed(1)}px` : '');
    const r = bubbleEl.getBoundingClientRect();
    if (!r.width) break;
    const measured = bubbleEl.offsetWidth ? r.width / bubbleEl.offsetWidth : 1;
    if (k === 0 && measured > 0) bubblePosRatio = measured;
    const ratio = bubblePosRatio || measured || 1;
    const need = window.PetLib.bubble.edgeShift(r, innerWidth, 4);
    if (Math.abs(need) < 2 && k > 0) break;
    accX += need / ratio;
    accY += window.PetLib.bubble.topShift(r, 4) / ratio;
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
  // 多开时按槽位错开，免得所有宠物都钉在同一个角上完全重叠
  const slot = (typeof S !== 'undefined' && S.instance && S.instance.slot) || 1;
  const x = b.maxX - (slot - 1) * 64;
  const y = b.maxY - (slot - 1) * 48;
  return { x: clamp(x, b.minX, b.maxX), y: clamp(y, b.minY, b.maxY) };
}
