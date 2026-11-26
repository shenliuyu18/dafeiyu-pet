/*
 * 命中测试与透明包围盒。函数由 Region 上报与交互事件调用。
 */

const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
// 缓存只存与位置无关的 alpha 比例；屏幕坐标每次都按当前矩形换算。
// 缓存绝对坐标会让拖拽瞬间用到几百像素外的旧盒子（松手时形象被裁 = 闪烁）。
let maskCache = { at: 0, src: '', pose: false, alpha: null };
const { boxFromAlpha } = window.PetLib.regionBox;
// 与帧调度共用「移动中」阈值，避免两处各写一个 14 后改一处漏一处
const REGION_BUSY_SPEED = window.PetLib.frameSchedule.BUSY_SPEED;

function alphaBounds(el, w, h) {
  if (!w || !h) return null;
  const mw = 160;
  const mh = Math.max(1, Math.round((mw * h) / w));
  if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
    maskCanvas.width = mw;
    maskCanvas.height = mh;
  }
  maskCtx.clearRect(0, 0, mw, mh);
  let data;
  try {
    maskCtx.drawImage(el, 0, 0, mw, mh);
    // 跨源素材（或 file:// 预览）会把画布标记为 tainted，getImageData 直接抛错；
    // 不能让异常冒到 Region 上报里，否则整轮命中盒更新都会中断。
    data = maskCtx.getImageData(0, 0, mw, mh).data;
  } catch {
    return null;
  }
  let minX = mw, minY = mh, maxX = -1, maxY = -1;
  for (let y = 0; y < mh; y++) {
    const row = y * mw * 4;
    for (let x = 0; x < mw; x++) {
      if (data[row + x * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x0: minX / mw, y0: minY / mh, x1: (maxX + 1) / mw, y1: (maxY + 1) / mh };
}

function petRenderBox() {
  const kind = charNow().kind;
  const el = kind === 'pose' ? petImgEl : kind === 'sprite' ? petSpriteEl : vidEl;
  const src = kind === 'sprite' ? `sprite:${spriteDrawn}` : el.currentSrc || el.getAttribute('src') || '';
  const now = performance.now();
  const speed = Math.hypot(P.vx, P.vy);
  // 立绘 / 图集按 src 缓存即可；逐帧视频的 alpha 包围盒随画面变化，
  // 静止 250ms、移动中 120ms 采样一次。游动时动作帧差别大，采样太慢会拿到
  // 上一帧的窄包围盒，配合 Region 滞后正好把前缘裁掉（边缘闪烁）。
  const ttl = kind === 'video' && speed > REGION_BUSY_SPEED ? 90 : 160;
  const rect = el.getBoundingClientRect();
  const cached = maskCache.alpha && maskCache.src === src && maskCache.pose === kind;
  if (cached && (kind === 'video' ? now - maskCache.at < ttl : true)) {
    // 比例可复用，但坐标必须用当前矩形重算：拖拽时速度恒为 0，缓存会一直"新鲜"
    return boxFromAlpha(rect, maskCache.alpha, flipEl.classList.contains('left'));
  }
  const iw = kind === 'pose' ? petImgEl.naturalWidth : kind === 'sprite' ? SPRITE.cellW : vidEl.videoWidth;
  const ih = kind === 'pose' ? petImgEl.naturalHeight : kind === 'sprite' ? SPRITE.cellH : vidEl.videoHeight;
  const alpha = alphaBounds(el, iw, ih);
  if (!alpha) {
    // 切换动作的瞬间视频还在加载（readyState=0），取不到像素。
    // 此时若返回 null，Region 会塌缩成只剩命中框、把角色上半身裁掉。
    // 沿用上一份比例先撑住，等下一轮采样成功再换。
    if (maskCache.alpha && maskCache.pose === kind) return boxFromAlpha(rect, maskCache.alpha, flipEl.classList.contains('left'));
    maskCache = { at: now, src, pose: kind, alpha: null };
    return null;
  }
  maskCache = { at: now, src, pose: kind, alpha };
  return boxFromAlpha(rect, alpha, flipEl.classList.contains('left'));
}

// 漫游时位置上报约 90ms 一次，SetWindowRgn 还要再晚一两帧才生效；
// 95px/s 的游速实测会把画面拉到 Region 外最多 16px，余量太小就会切掉前缘。
// 按速度给 alpha 包围盒留出这段滞后距离，停下后自动收回。
const REGION_PAD_IDLE = 12;
const REGION_PAD_MAX = 48;

function petRegionPad() {
  const speed = Math.hypot(P.vx, P.vy);
  if (speed <= REGION_BUSY_SPEED) return REGION_PAD_IDLE;
  return Math.min(REGION_PAD_MAX, REGION_PAD_IDLE + Math.ceil(speed * 0.32));
}

// 气泡投影是 0 8px 22px，可见范围约 33px；Region 只按 8px 外扩会把投影
// 硬切成矩形。漫游时 Region 比内容晚 1~2 帧，这条切线相对气泡来回移动，
// 看起来就是气泡边缘闪烁。按投影完整范围外扩，切线落在完全透明的尾部。
const BUBBLE_REGION_PAD = 44;

// 真正可见的窗口区域：角色命中区 + 当前画面 alpha 包围盒 + 气泡 / 倒计时牌 / 特效 / Zzz。
// Go 端用它生成窗口 Region，空白处不再挡住桌面点击与滚轮。
//
// 渲染盒取「最近一小段时间的包络」而不是当前帧：拖拽松手会立刻切一次待机、
// 随后有速度再切一次漫游动画，逐帧 alpha 形状差异又大；区域跟着跳变会让窗口
// 反复重设 Region，看起来就是闪。
// 用带时间戳的样本队列取并集，超窗即丢弃——空闲时盒不变，并集就是当前盒；
// 运动/切动画时短期保留旧范围，既不会裁内容，也不会无限膨胀。
const REGION_ENV_MS = 300;
let regionEnv = [];

function regionEnvelope(box, now) {
  if (box) regionEnv.push({ at: now, box: { x: box.x, y: box.y, w: box.w, h: box.h } });
  while (regionEnv.length > 1 && now - regionEnv[0].at > REGION_ENV_MS) regionEnv.shift();
  if (!regionEnv.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of regionEnv) {
    if (s.box.x < x0) x0 = s.box.x;
    if (s.box.y < y0) y0 = s.box.y;
    if (s.box.x + s.box.w > x1) x1 = s.box.x + s.box.w;
    if (s.box.y + s.box.h > y1) y1 = s.box.y + s.box.h;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function petHitBoxes(includeBubble = false) {
  const boxes = [];
  const add = (el, pad, hit, soft) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;
    const b = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, hit: !!hit };
    if (soft) b.soft = true;
    boxes.push(b);
  };
  add(hitEl, REGION_PAD_IDLE, true);
  if (oneShotPlaying) {
    // 单次动作的画面幅度大，而 alpha 包围盒是按 250ms 采样、静止时区域 400ms 才
    // 保活上报一次——角色跳出旧包围盒的部分会先被 Region 裁掉，等下次上报才出现。
    // 动作期间直接圈定整块动画画布：范围固定，既不裁内容，也不会随帧变化闪动。
    const kind = charNow().kind;
    add(kind === 'pose' ? petImgEl : kind === 'sprite' ? petSpriteEl : vidEl, REGION_PAD_IDLE);
  } else {
    const rb = petRenderBox();
    const env = regionEnvelope(rb, performance.now());
    if (env) {
      const pad = petRegionPad();
      boxes.push({ x: env.x - pad, y: env.y - pad, w: env.w + pad * 2, h: env.h + pad * 2, hit: false });
    }
  }
  const bubbleIncluded = includeBubble || bubbleEl.classList.contains('show') || Number(getComputedStyle(bubbleEl).opacity) > 0.02;
  if (bubbleIncluded) {
    add(bubbleEl, BUBBLE_REGION_PAD, false, true);
    if (bubbleReserve > 0) {
      const r = bubbleEl.getBoundingClientRect();
      const down = bubbleEl.classList.contains('down');
      // 换更长的文字时气泡会在同一帧变宽；贴屏幕边时还会整体平移。
      // SetWindowRgn 比页面晚 2~3 帧，只按当前矩形预留会把新宽度裁成直边
      // （非 v1 形象命中框窄，旧 Region 更窄，所以只有它们明显）。
      const layoutW = bubbleEl.offsetWidth || r.width;
      const maxW = (parseFloat(getComputedStyle(bubbleEl).maxWidth) || r.width) * (layoutW ? r.width / layoutW : 1);
      const cx = r.left + r.width / 2;
      const p = BUBBLE_REGION_PAD;
      const left = Math.min(r.left, cx - maxW + r.width / 2) - p;
      const right = Math.max(r.right, cx + maxW - r.width / 2) + p;
      boxes.push({
        x: left,
        y: r.top - p - (down ? 0 : bubbleReserve),
        w: right - left,
        h: r.height + p * 2 + bubbleReserve,
        hit: false,
        soft: true,
      });
    }
  }
  if (chipEl.classList.contains('show') || Number(getComputedStyle(chipEl).opacity) > 0.02) add(chipEl, 6);
  for (const el of fxEl.children) add(el, 4);
  if (stage.classList.contains('doze')) add(document.querySelector('.zzz'), 6);
  return boxes;
}
window.__petHitBoxes = petHitBoxes;

function hitTest(x, y) {
  if (menuOpen && menuEl.classList.contains('show')) {
    const m = menuEl.getBoundingClientRect();
    if (x >= m.left && x <= m.right && y >= m.top && y <= m.bottom) return true;
  }
  const r = hitEl.getBoundingClientRect();
  const pad = 6;
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}
