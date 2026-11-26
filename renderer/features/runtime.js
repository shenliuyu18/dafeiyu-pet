/*
 * 运行时辅助：快照兜底、错误上报、边界与移动引擎。
 */

let snapDrawn = false;
function drawSnapFrame(show) {
  if (!petSnap) return false;
  if (vidEl.readyState >= 2 && vidEl.videoWidth) {
    if (petSnap.width !== vidEl.videoWidth) {
      petSnap.width = vidEl.videoWidth;
      petSnap.height = vidEl.videoHeight;
    }
    snapCtx.clearRect(0, 0, petSnap.width, petSnap.height);
    const t0 = performance.now();
    snapCtx.drawImage(vidEl, 0, 0, petSnap.width, petSnap.height);
    const cost = performance.now() - t0;
    if (cost > 150) {
      // 视频帧回读偶尔会很慢（GPU 正忙时），这一下会直接卡住主线程
      reportVisualStall('snap-slow', `ms=${cost.toFixed(0)} rs=${vidEl.readyState}`);
    }
    snapDrawn = true;
  } else if (!snapDrawn) {
    // 还没成功截过任何一帧：画布是空的，显示出来也是透明
    return false;
  }
  // 取不到当前帧时沿用画布里的旧画面，总比整块透明强
  if (show) {
    snapShownAt = performance.now();
    snapFrameSeen = false;
    petSnap.classList.remove('hide');
    // 安全兜底：万一新视频一直不 playing / 不出帧，1.5s 后收起旧画面，避免永久盖着
    clearTimeout(snapHideTimer);
    snapHideTimer = setTimeout(() => {
      if (petSnap) petSnap.classList.add('hide');
    }, 1500);
  }
  return true;
}

function snapshotFrame() {
  drawSnapFrame(true);
}

// 媒体管线被 Chromium 重置（readyState 掉回 1、currentTime 归零）时，先把最近一帧垫上去，
// 等新帧出来再撤；不这么做就是整块空白，用户看到的就是「桌宠消失」。
function showSnapCover() {
  if (!petSnap || !snapDrawn || !petSnap.classList.contains('hide')) return;
  snapWaitFrame = true;
  petSnap.classList.remove('hide');
}

function hideSnap() {
  if (petSnap) petSnap.classList.add('hide');
}

// 新视频的 playing 事件可能早于首帧真正合成；此时立刻藏快照会露出空白或半帧。
// 以前兜底 240ms 就撤：换动画时若新视频解码稍慢（刚切回桌面、GPU 被看图器占着），
// 旧帧被提前撤掉，用户就看到「闪一下 / 消失零点几秒」。现在一直等到真的出现新帧，
// 最长 1.5 秒；超时未出帧会记一条 snap-hold，便于下次取证。
let snapHideTimer = 0;
let snapShownAt = 0;
let snapFrameSeen = false;
function hideSnapWhenReady() {
  // 没有快照可撤时（首帧播放、或已经撤过）不要起兜底计时，否则会误报 snap-hold
  if (!petSnap || petSnap.classList.contains('hide')) return;
  clearTimeout(snapHideTimer);
  const done = () => { clearTimeout(snapHideTimer); hideSnap(); };
  const seen = () => { snapFrameSeen = true; done(); };
  if (typeof vidEl.requestVideoFrameCallback === 'function') {
    vidEl.requestVideoFrameCallback(() => requestAnimationFrame(seen));
  } else {
    requestAnimationFrame(() => requestAnimationFrame(seen));
  }
  snapHideTimer = setTimeout(() => {
    const held = snapShownAt ? performance.now() - snapShownAt : 0;
    if (!snapFrameSeen && held > 400) {
      reportVisualStall('snap-hold', `ms=${held.toFixed(0)} anim=${curAnim} rs=${vidEl.readyState} ct=${(vidEl.currentTime * 1000).toFixed(0)}`);
    }
    done();
  }, 1500);
}

// ---------------------------------------------------------------- 画面停更看门狗
// 用户反馈过「桌宠消失约 2 秒又自己回来、后台日志没有任何动作」。那一刻窗口可能仍然
// 可见且置顶，只是渲染层没出帧；这里记录现场（Go 端会把窗口 / Region / 隐藏标志一并落盘），
// 视频卡帧时顺手自愈，避免真的空掉。
const stallReportAt = new Map();
let stallRepairAt = 0;
let stallRepairCount = 0;
function reportVisualStall(kind, detail) {
  const now = Date.now();
  if (now - (stallReportAt.get(kind) || 0) < 5000) return;
  stallReportAt.set(kind, now);
  try {
    if (window.go && window.go.main && window.go.main.App && window.go.main.App.ReportVisualStall) {
      window.go.main.App.ReportVisualStall(kind, detail);
    }
  } catch { /* 日志失败不能反过来影响画面 */ }
}

let rafLastAt = 0;
let rafGapAt = 0;
let skipRafStallUntil = 0;
let visHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    visHiddenAt = performance.now();
    return;
  }
  // 窗口明明没有最小化却被 Chromium 标成 hidden（原生遮挡判定），恢复时画面可能整段空白。
  // 隐藏超过 0.7 秒就记一次现场，这比 rAF 断档更能说明“消失 N 秒”的来源。
  const dur = visHiddenAt ? performance.now() - visHiddenAt : 0;
  visHiddenAt = 0;
  if (dur > 700) {
    reportVisualStall('visibility-hidden', `ms=${dur.toFixed(0)} kind=${typeof charNow === 'function' ? charNow().kind : '?'} anim=${typeof curAnim === 'string' ? curAnim : ''}`);
  }
  // 隐藏/恢复本身会造成 rAF 断档，上面已单独记录，这里不要再报一次
  skipRafStallUntil = performance.now() + 1500;
  rafLastAt = 0;
});

function watchRafGap(now) {
  if (document.hidden) {
    rafLastAt = now;
    return;
  }
  const gap = rafLastAt ? now - rafLastAt : 0;
  rafLastAt = now;
  if (gap > 800 && now >= skipRafStallUntil) {
    rafGapAt = now;
    // 带上「距上次换视频源多久」：实测卡顿都紧贴换源时刻（readyState=1、currentTime=0），
    // 有了这个字段就能确认是不是解码器初始化把渲染线程堵住。
    const srcAt = window.__lastSrcAt || 0;
    const sinceSrc = srcAt ? (now - srcAt).toFixed(0) : '-';
    const snapState = typeof petSnap !== 'undefined' && petSnap ? (petSnap.classList.contains('hide') ? 'hide' : 'show') : '-';
    reportVisualStall('raf-gap', `ms=${gap.toFixed(0)} anim=${curAnim} srcAnim=${window.__lastSrcAnim || ''} sinceSrc=${sinceSrc} snap=${snapState} one=${oneShotPlaying} rs=${vidEl.readyState} ct=${(vidEl.currentTime * 1000).toFixed(0)} cw=${vidEl.videoWidth}`);
    // 断档结束时视频还没就绪，多半是媒体管线被重置，先垫上最近一帧
    if (vidEl.readyState < 2) showSnapCover();
  }
}

// 视频出帧看门狗：playing 但 900ms 没有新帧时，seek 一步逼解码器重新出帧，并用快照垫住，
// 避免画面直接空掉（透明窗口空帧 = 桌宠消失）。
// 注意：vidEl / charNow 定义在后面的 pet.js，这里必须在它们可用之后再绑定，否则加载即报错。
let vfSeenAt = 0;
let vfWatchFrom = 0;
let vfCheckAt = 0;
let reloadAt = 0;
let coverAt = 0;
let vfLastFrames = -1;
let snapWaitFrame = false;
let stallInited = false;
function initStallWatch() {
  if (stallInited) return;
  stallInited = true;
  if (typeof vidEl.requestVideoFrameCallback === 'function') {
    const onFrame = (now, meta) => {
      vfSeenAt = performance.now();
      stallRepairCount = 0; // 有新帧就说明解码器活着，重置自愈配额
      vfLastFrames = meta && typeof meta.presentedFrames === 'number' ? meta.presentedFrames : -1;
      // 自愈后用快照垫住画面，等真的出了新帧再撤掉；一直不出帧就保留旧画面，别空着
      if (snapWaitFrame) {
        snapWaitFrame = false;
        hideSnap();
      }
      try { vidEl.requestVideoFrameCallback(onFrame); } catch { /* ignore */ }
    };
    try { vidEl.requestVideoFrameCallback(onFrame); } catch { /* ignore */ }
  }
  vidEl.addEventListener('loadstart', () => { vfSeenAt = 0; vfWatchFrom = performance.now(); });
  vidEl.addEventListener('play', () => { if (!vfSeenAt) vfWatchFrom = performance.now(); });
  // 媒体层被重置/出错时留下现场。换源本身也会触发 emptied/stalled，这类不算异常。
  for (const ev of ['emptied', 'error', 'stalled']) {
    vidEl.addEventListener(ev, () => {
      const srcAt = window.__lastSrcAt || 0;
      if (srcAt && performance.now() - srcAt < 3000) return;
      const name = String(vidEl.currentSrc || vidEl.getAttribute('src') || '').split('/').pop();
      reportVisualStall('media-' + ev, `rs=${vidEl.readyState} ct=${(vidEl.currentTime * 1000).toFixed(0)} anim=${curAnim} file=${name}`);
    });
  }
  setInterval(() => {
    const now = performance.now();
    const kindVideo = charNow().kind === 'video';
    const hasSrc = !!vidEl.getAttribute('src');
    if (document.hidden || !hasSrc || !kindVideo) {
      vfSeenAt = 0;
      vfWatchFrom = 0;
      reloadAt = 0;
      vfCheckAt = now;
      return;
    }
    const playingNow = !vidEl.paused && !vidEl.ended;
    // 播放中 readyState 掉到 1/0：Chromium 把媒体管线重置了（实测 currentTime 归零、
    // 主线程卡近 1 秒）。这条日志能证明与换源无关，同时先把封面帧垫上。
    if (playingNow && vidEl.readyState < 2) {
      if (!reloadAt) reloadAt = now;
      const srcAt = window.__lastSrcAt || 0;
      // 刚换源时短暂 readyState<2 是正常的（快照已经垫着），只记录与换源无关的重置
      if (now - reloadAt > 300 && (!srcAt || now - srcAt > 5000)) {
        reportVisualStall('video-reload', `rs=${vidEl.readyState} ct=${(vidEl.currentTime * 1000).toFixed(0)} anim=${curAnim} sinceSrc=${srcAt ? (now - srcAt).toFixed(0) : '-'}`);
        showSnapCover();
      }
      vfSeenAt = now;
      vfWatchFrom = now;
      vfCheckAt = now;
      return;
    }
    reloadAt = 0;
    if (!playingNow) {
      vfSeenAt = 0;
      vfWatchFrom = 0;
      vfCheckAt = now;
      return;
    }
    // 主线程被堵时 rVFC 和这个定时器都会一起停：定时器自己晚了就说明不是解码器故障。
    // 必须在这里判，因为阻塞结束后定时器会先于 rAF 运行，rafGapAt 那时还没更新。
    const checkGap = vfCheckAt ? now - vfCheckAt : 0;
    vfCheckAt = now;
    if (checkGap > 1000 || now - rafGapAt < 1500) {
      vfSeenAt = now;
      return;
    }
    // 顺便刷新封面画布（不显示）：媒体被重置时可以立刻垫上最近一帧
    if (petSnap && petSnap.classList.contains('hide') && now - coverAt > 3000) {
      coverAt = now;
      drawSnapFrame(false);
    }
    const since = vfSeenAt || vfWatchFrom;
    if (!since) {
      vfWatchFrom = now;
      return;
    }
    const ms = now - since;
    if (ms <= 900) return;
    reportVisualStall('video-stall', `ms=${ms.toFixed(0)} rs=${vidEl.readyState} ct=${(vidEl.currentTime * 1000).toFixed(0)} anim=${curAnim} frames=${vfLastFrames}`);
    vfSeenAt = now; // 给自愈一个观察窗口，别每 500ms 刷日志
    // 解码器真死时不要无限 seek：3 次自愈后就只记录，不再反复折腾画面
    if (now - stallRepairAt < 3000 || stallRepairCount >= 3) return;
    stallRepairAt = now;
    stallRepairCount++;
    snapshotFrame();
    snapWaitFrame = true;
    try { vidEl.currentTime = Math.max(0, vidEl.currentTime + 0.06); } catch { /* ignore */ }
    const pr = vidEl.play();
    if (pr && pr.catch) pr.catch(() => {});
  }, 500);
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
