/*
 * 番茄钟：倒计时、休息间隔、工作动作轮换与统计刷新。
 */

function fmtClock(ms) {
  return window.PetLib.timeFormat.clock(ms);
}

let pomoAnim = null;
let pomoResting = false;
let pomoGapTimer = null;

function clearPomoGap() {
  clearTimeout(pomoGapTimer);
  pomoGapTimer = null;
}

// 上一个动作播完：待机休息「播放间隔」，到点再播下一个工作动作
function enterPomoGap() {
  clearPomoGap();
  if (!S.pomoRunning) return;
  pomoResting = true;
  applyBase();
  pomoGapTimer = setTimeout(startPomoWork, S.pomoAnimSec * 1000);
}

function startPomoWork() {
  clearPomoGap();
  if (!S.pomoRunning) return;
  // 手动动作正在播：等它结束后会重新进入间隔
  if (oneShotPlaying) return;
  if (S.dragging || P.frozen || !S.awake || S.autoDoze) {
    pomoGapTimer = setTimeout(startPomoWork, 500);
    return;
  }
  const pool = usable(ANIM.work).filter((n) => n !== pomoAnim);
  if (pool.length) pomoAnim = pick(pool);
  else if (!pomoAnim) pomoAnim = pick(usable(ANIM.work));
  if (!pomoAnim) {
    pomoResting = true;
    applyBase();
    return;
  }
  pomoResting = false;
  playOnce([pomoAnim], true);
}

function setPomodoro(p) {
  const running = !!(p && p.running);
  const was = S.pomoRunning;
  S.pomoRunning = running;
  stage.classList.toggle('focus', running);
  chipEl.classList.toggle('show', running);
  if (running) {
    // 倒计时每秒都会推一次，只刷新数字，不能重启动画
    chipTime.textContent = fmtClock(p.remaining);
    if (!was) {
      pomoAnim = null;
      pomoResting = false;
      // 只有到处游模式才游去角落；右下角/固定不动就待在原地
      if (S.dock === 'roam') {
        const b = bounds();
        P.swimTo = { x: b.maxX, y: b.maxY };
        P.target = null;
        P.pauseUntil = 0;
      }
    }
  } else {
    P.swimTo = null;
  }
  if (running === was) return;
  // 重新计时，避免专注刚结束就立刻触发自动动作
  lastAutoAt = Date.now();
  if (running) {
    if (charNow().kind === 'pose') applyBase();
    else startPomoWork();
  } else {
    clearPomoGap();
    pomoResting = false;
    sfx('error');
    applyBase();
  }
}
