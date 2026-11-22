/*
 * 命中测试与透明包围盒。函数由 Region 上报与交互事件调用。
 */

const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
let maskCache = { at: 0, src: '', pose: false, box: null };

function alphaBounds(el, w, h) {
  if (!w || !h) return null;
  const mw = 160;
  const mh = Math.max(1, Math.round((mw * h) / w));
  if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
    maskCanvas.width = mw;
    maskCanvas.height = mh;
  }
  maskCtx.clearRect(0, 0, mw, mh);
  try {
    maskCtx.drawImage(el, 0, 0, mw, mh);
  } catch {
    return null;
  }
  const data = maskCtx.getImageData(0, 0, mw, mh).data;
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
  // 立绘 / 图集按 src 缓存即可；逐帧视频的 alpha 包围盒随画面变化，
  // 250ms 采样一次（约 4 次/秒）就够 Region 用，外扩 6px 会盖住这点误差。
  // 立绘 / 图集在图片尚未加载完时会拿到 null，必须继续重试，不能把空结果永久缓存。
  const fresh = maskCache.src === src && maskCache.pose === kind &&
    (kind === 'video' ? now - maskCache.at < 250 : !!maskCache.box);
  if (fresh) return maskCache.box;
  const rect = el.getBoundingClientRect();
  const iw = kind === 'pose' ? petImgEl.naturalWidth : kind === 'sprite' ? SPRITE.cellW : vidEl.videoWidth;
  const ih = kind === 'pose' ? petImgEl.naturalHeight : kind === 'sprite' ? SPRITE.cellH : vidEl.videoHeight;
  const ab = alphaBounds(el, iw, ih);
  let box = null;
  if (ab && rect.width > 0 && rect.height > 0) {
    const mirrored = flipEl.classList.contains('left');
    const x0 = mirrored ? 1 - ab.x1 : ab.x0;
    const x1 = mirrored ? 1 - ab.x0 : ab.x1;
    box = {
      x: rect.left + x0 * rect.width,
      y: rect.top + ab.y0 * rect.height,
      w: (x1 - x0) * rect.width,
      h: (ab.y1 - ab.y0) * rect.height,
    };
  }
  maskCache = { at: now, src, pose: kind, box };
  return box;
}

// 真正可见的窗口区域：角色命中区 + 当前画面 alpha 包围盒 + 气泡 / 倒计时牌 / 特效 / Zzz。
// Go 端用它生成窗口 Region，空白处不再挡住桌面点击与滚轮。
function petHitBoxes(includeBubble = false) {
  const boxes = [];
  const add = (el, pad, hit) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;
    boxes.push({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, hit: !!hit });
  };
  add(hitEl, 8, true);
  const rb = petRenderBox();
  if (rb) boxes.push({ x: rb.x - 6, y: rb.y - 6, w: rb.w + 12, h: rb.h + 12, hit: false });
  const bubbleIncluded = includeBubble || bubbleEl.classList.contains('show') || Number(getComputedStyle(bubbleEl).opacity) > 0.02;
  if (bubbleIncluded) {
    add(bubbleEl, 8);
    if (bubbleReserve > 0) {
      const r = bubbleEl.getBoundingClientRect();
      const down = bubbleEl.classList.contains('down');
      // 换更长的文字时气泡会在同一帧变宽；贴屏幕边时还会整体平移。
      // SetWindowRgn 比页面晚 2~3 帧，只按当前矩形预留会把新宽度裁成直边
      // （非 v1 形象命中框窄，旧 Region 更窄，所以只有它们明显）。
      const layoutW = bubbleEl.offsetWidth || r.width;
      const maxW = (parseFloat(getComputedStyle(bubbleEl).maxWidth) || r.width) * (layoutW ? r.width / layoutW : 1);
      const cx = r.left + r.width / 2;
      const left = Math.min(r.left, cx - maxW + r.width / 2) - 8;
      const right = Math.max(r.right, cx + maxW - r.width / 2) + 8;
      boxes.push({
        x: left,
        y: r.top - 8 - (down ? 0 : bubbleReserve),
        w: right - left,
        h: r.height + 16 + bubbleReserve,
        hit: false,
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
