/*
 * 运行时辅助：快照兜底、错误上报、边界与移动引擎。
 */

function snapshotFrame() {
  if (!petSnap || vidEl.readyState < 2 || !vidEl.videoWidth) return;
  if (petSnap.width !== vidEl.videoWidth) {
    petSnap.width = vidEl.videoWidth;
    petSnap.height = vidEl.videoHeight;
  }
  snapCtx.clearRect(0, 0, petSnap.width, petSnap.height);
  snapCtx.drawImage(vidEl, 0, 0, petSnap.width, petSnap.height);
  petSnap.classList.remove('hide');
}

function hideSnap() {
  if (petSnap) petSnap.classList.add('hide');
}

function reportClientError(kind, err) {
  if (typeof api.logFrontend !== 'function') return;
  let msg = '';
  try {
    msg = String((err && (err.stack || err.message)) || err || '').trim();
  } catch { /* ignore */ }
  if (!msg) return;
  if (msg.length > 1200) msg = msg.slice(0, 1200) + '…';
  const now = Date.now();
  if (now - (reportedErrors.get(msg) || 0) < 60000) return;
  if (reportedErrors.size > 60) reportedErrors.clear();
  reportedErrors.set(msg, now);
  try {
    api.logFrontend(kind, msg);
  } catch { /* 日志失败不能反过来影响页面 */ }
}

function bounds() {
  const s = petScale;
  return { minX: -PET.x0 * s, maxX: innerWidth - PET.x1 * s, minY: -PET.y0 * s, maxY: innerHeight - PET.y1 * s };
}

function wanderSpeed() {
  return window.PetLib.motion.wanderSpeed(S.satiety);
}

function pickTarget(b) {
  return window.PetLib.motion.pickTarget(b, S.mouse, PET.cx, PET.cy);
}

function steer(tx, ty, speed, dt) {
  return window.PetLib.motion.steer(P, tx, ty, speed, dt);
}

function coast(dt, damp) {
  window.PetLib.motion.coast(P, dt, damp);
}

function step(dt) {
  if (P.frozen) return;
  const b = bounds();
  const now = Date.now();

  if (S.dragging) {
    // 位置由鼠标事件直接驱动，只做速度归零
    P.vx = 0;
    P.vy = 0;
  } else if (S.dock === 'corner') {
    // 右下角停靠是位置约束，优先于睡眠/小节目：被拖走后无论当前在播什么都要游回去
    const c = cornerSpot(b);
    if (steer(c.x, c.y, 120, dt) < 8) {
      P.vx = 0;
      P.vy = 0;
    }
  } else if (oneShotPlaying) {
    coast(dt, 0.86); // 播小节目时站定，别边跳边飘
  } else if (S.pomoRunning) {
    if (P.swimTo) {
      if (steer(P.swimTo.x, P.swimTo.y, 150, dt) < 12) {
        P.swimTo = null;
        P.vx = 0;
        P.vy = 0;
      }
    } else {
      coast(dt, 0.86);
    }
  } else if (!S.awake || S.autoDoze) {
    coast(dt, 0.9);
  } else if (S.dock === 'fixed') {
    // 固定不动：停在原地，只有拖拽能改变位置
    coast(dt, 0.9);
  } else if (now < P.pauseUntil) {
    coast(dt, 0.86);
  } else {
    if (!P.target) P.target = pickTarget(b);
    if (steer(P.target.x, P.target.y, wanderSpeed(), dt) < 10) {
      P.target = null;
      P.vx = 0;
      P.vy = 0;
      P.pauseUntil = now + 1500 + Math.random() * 4200;
    }
  }

  const movable = !S.dragging;
  if (P.x < b.minX) {
    P.x = b.minX;
    P.vx = movable ? Math.abs(P.vx) * 0.7 : 0;
    if (P.target && P.target.x < b.minX) P.target = null;
  } else if (P.x > b.maxX) {
    P.x = b.maxX;
    P.vx = movable ? -Math.abs(P.vx) * 0.7 : 0;
    if (P.target && P.target.x > b.maxX) P.target = null;
  }
  if (P.y < b.minY) {
    P.y = b.minY;
    P.vy = movable ? Math.abs(P.vy) * 0.7 : 0;
    if (P.target && P.target.y < b.minY) P.target = null;
  } else if (P.y > b.maxY) {
    P.y = b.maxY;
    P.vy = movable ? -Math.abs(P.vy) * 0.7 : 0;
    if (P.target && P.target.y > b.maxY) P.target = null;
  }

  if (Math.abs(P.vx) > 14) {
    const f = P.vx > 0 ? 'right' : 'left';
    if (f !== P.facing) {
      P.facing = f;
      refreshFlip();
    }
  }

  const swimming = !S.dragging && !P.frozen && Math.abs(P.vx) > 14;
  if (swimming !== P.swimming) {
    P.swimming = swimming;
    stage.classList.toggle('swim', swimming);
    applyBase();
  }
}
