/*
 * 视频/立绘/单次动作播放。图集细节在 sprite.js。
 */

function refreshFlip() {
  flipEl.classList.toggle('left', P.facing === 'left' && !curNoMirror);
}

function setPose(pose, pop) {
  if (!pose) return;
  const ch = charNow();
  const changed = pose !== curPose;
  if (changed) {
    curPose = pose;
    petImgEl.src = ch.dir + pose + '.webp';
  }
  if (pop && changed) {
    petImgEl.classList.remove('pop');
    void petImgEl.offsetWidth;
    petImgEl.classList.add('pop');
  }
}

function startVideo() {
  if (document.hidden) {
    vidEl.pause();
    return;
  }
  const pr = vidEl.play();
  if (pr && pr.catch) pr.catch(() => {});
}

function poseForName(name) {
  const ch = charNow();
  if (name && name.startsWith('__pose:')) return name.slice(7);
  return ch.map[name] || pick(ch.fallback);
}

function playAnim(pool, loop, restart) {
  const name = Array.isArray(pool) ? pick(pool) : pool;
  const ch = charNow();
  if (ch.kind === 'sprite') {
    playSprite(name, loop, restart);
    return;
  }
  if (ch.kind === 'pose') {
    curAnim = name;
    curNoMirror = true; // 立绘不做左右镜像，避免看起来怪
    refreshFlip();
    setPose(poseForName(name), true);
    return;
  }
  if (name === curAnim) {
    if (!restart) return;
    // 「选个动作」重播同一个动画时不必重载 src，从头播即可
    if (vidEl.duration) vidEl.currentTime = 0;
    vidEl.loop = !!loop;
    startVideo();
    return;
  }
  curAnim = name;
  curNoMirror = NO_MIRROR.has(name);
  refreshFlip();
  snapshotFrame();
  vidEl.loop = !!loop;
  vidEl.src = animFile[name] || (plusSrc[name] || animDir) + name + '.webm';
  startVideo();
}

function playOnce(pool, restart) {
  clearTimeout(oneShotTimer);
  const seq = ++oneShotSeq;
  oneShotPlaying = true;
  playAnim(pool, false, restart);
  const back = () => {
    if (!oneShotPlaying || seq !== oneShotSeq) return;
    oneShotPlaying = false;
    clearTimeout(oneShotTimer);
    // 专注中：动作播完先休息「播放间隔」这么久，再播下一个工作动作
    if (S.pomoRunning && charNow().kind !== 'pose') enterPomoGap();
    else applyBase();
  };
  // 视频切换后 vidEl.duration 可能还是上一段的旧值（或 0），不能拿它定返回时间；
  // 先挂一个硬上限，等 metadata 到达后再按真实时长重新计时，避免长动作后半段被截断。
  oneShotTimer = setTimeout(back, 13000);
  if (charNow().kind === 'sprite') {
    clearTimeout(oneShotTimer);
    oneShotTimer = setTimeout(back, Math.min(8000, spriteDuration(curAnim) + 220));
  } else if (charNow().kind === 'pose') {
    clearTimeout(oneShotTimer);
    oneShotTimer = setTimeout(back, 2600);
  } else {
    const arm = () => {
      if (seq !== oneShotSeq) return;
      const d = Number(vidEl.duration);
      if (!Number.isFinite(d) || d <= 0) return;
      clearTimeout(oneShotTimer);
      oneShotTimer = setTimeout(back, Math.min(15000, d * 1000 + 400));
    };
    vidEl.addEventListener('loadedmetadata', arm, { once: true });
    if (vidEl.readyState >= 1) arm();
  }
  vidEl.onended = back;
}
