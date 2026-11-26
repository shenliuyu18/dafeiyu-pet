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

// 切换形象时立即释放解码器与缓冲；只 removeAttribute 不 load() 时，
// WebView2 何时回收旧视频的缓冲不确定。
function releaseVideo() {
  try { vidEl.pause(); } catch { /* 播放器可能已销毁 */ }
  vidEl.removeAttribute('src');
  try { vidEl.load(); } catch { /* 加载器状态异常时忽略 */ }
  hideSnap();
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
  const src = animFile[name] || (plusSrc[name] || animDir) + name + '.webm';
  // 换源会让 <video> 立刻变成空白；部分机器上解码器初始化会把渲染线程堵住几百毫秒
  // （实测 raf-gap 889ms、此时 readyState=1 / currentTime=0），同步换源就正好露出空白。
  // 先让浏览器把快照合成出去（下一个任务再换源），空白窗口就被旧帧盖住了。
  setTimeout(() => {
    if (curAnim !== name) return; // 期间又切了别的动作
    window.__lastSrcAt = performance.now();
    window.__lastSrcAnim = name;
    const t0 = performance.now();
    vidEl.src = src;
    startVideo();
    const cost = performance.now() - t0;
    if (cost > 150) reportVisualStall('src-slow', `ms=${cost.toFixed(0)} anim=${name} rs=${vidEl.readyState}`);
  }, 0);
  // 换成新动画后，上一段动画的 alpha 形状还挂在 Region 上（缓存兜底）。
  // 等新动画首帧可用就立刻按它的真实形状上报一次，避免切换瞬间边缘被裁。
  vidEl.addEventListener('loadeddata', () => {
    if (curAnim === name) reportRegionNow(true);
  }, { once: true });
}

function playOnce(pool, restart) {
  clearTimeout(oneShotTimer);
  const seq = ++oneShotSeq;
  oneShotPlaying = true;
  // 动画形状会突变：先让 Go 短暂保持整窗 Region，再扩盒、开播。
  if (api.holdRegion) api.holdRegion(220);
  const back = () => {
    if (!oneShotPlaying || seq !== oneShotSeq) return;
    oneShotPlaying = false;
    clearTimeout(oneShotTimer);
    // 专注中：动作播完先休息「播放间隔」这么久，再播下一个工作动作
    if (S.pomoRunning && charNow().kind !== 'pose') enterPomoGap();
    else applyBase();
  };
  // 先把 Region 扩到整块画布，再切动作。反过来做的话，动作开播后的头几帧
  // （IPC + SetWindowRgn 大约 10~25ms）还在旧 Region 外，边缘会被裁一下才补齐。
  const go = () => {
    if (!oneShotPlaying || seq !== oneShotSeq) return;
    playAnim(pool, false, restart);
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
      // 换源已推迟到下一个任务；此时 readyState/duration 还是上一段视频的，
      // 直接 arm 会按旧时长提前结束新动作。只有确认 currentSrc 已经是这段动画才立刻计时。
      const wantBase = String(animFile[curAnim] || ((plusSrc[curAnim] || animDir) + curAnim + '.webm')).split('/').pop();
      let srcBase = '';
      try { srcBase = decodeURIComponent(vidEl.currentSrc || '').split('/').pop(); } catch { srcBase = ''; }
      if (vidEl.readyState >= 1 && srcBase === wantBase) arm();
    }
  };
  Promise.resolve(reportRegionNow(true)).then(go, go);
  vidEl.onended = back;
}
