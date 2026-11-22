/*
 * 气泡与梗图：显示、预加载、台词选图、场景文案。
 */

function revealBubble(ms) {
  const start = Date.now();
  let lastH = -1, stableFrames = 0;
  function paint() {
    if (!bubbleEl.classList.contains('show')) bubbleEl.classList.add('show');
    clearTimeout(S.bubbleTimer);
    S.bubbleTimer = setTimeout(() => {
      bubbleEl.classList.remove('show');
      bubbleReserve = 0;
    }, ms);
    if (bubbleReserve) {
      // 已经按最终尺寸画出来了，把预留的空白区域收回去
      bubbleReserve = 0;
      requestAnimationFrame(() => {
        if (bubbleEl.classList.contains('show')) reportRegionNow(true);
      });
    }
  }
  // 先把包含气泡的 Region 扩好再亮出：亮出这一帧就已经在 Region 内，
  // 不会出现「下半截先出现、上半截等 Region 更新后再补上」。
  function show() {
    positionBubble();
    const expectH = bubbleEl.offsetHeight;
    const ready = reportRegionNow(true);
    const after = () => {
      // 等 Region 响应期间内容又变了：重新走一遍闸门，别把半截气泡亮出来
      if (bubbleEl.offsetHeight !== expectH) {
        tryReveal();
        return;
      }
      paint();
    };
    if (ready && typeof ready.then === 'function') ready.then(after, after);
    else after();
  }
  // 两重条件同时满足才显示：
  // 1) 高度连续 3 帧不再变化（图片/字体/内容全部就位，不会中途再长高）
  // 2) 高度 ≥ 36px（排除空带子）
  // 梗图加载到一半时高度是逐帧上涨的，「高度稳定」能把这种状态拦住
  function tryReveal() {
    const h = bubbleEl.offsetHeight;
    if ((h < 36 || h !== lastH) && Date.now() - start < 1500) {
      stableFrames = (h === lastH && h >= 36) ? stableFrames + 1 : 0;
      lastH = h;
      requestAnimationFrame(tryReveal);
      return;
    }
    show();
  }
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(tryReveal, tryReveal);
  } else {
    requestAnimationFrame(tryReveal);
  }
}

function preloadMeme(file) {
  if (!file) return Promise.resolve(false);
  if (memePreloads.has(file)) return memePreloads.get(file);
  const p = new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      memePreloads.delete(file);
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    setTimeout(() => finish(false), 2000);
    img.src = file;
  });
  memePreloads.set(file, p);
  return p;
}

function say(text, ms = 3200, memeKey, memeFile) {
  clearTimeout(S.bubbleTimer);
  const seq = ++saySeq;
  const pool = memeKey && MEMES[memeKey];
  const file = memeFile || (pool && pool.length ? `../assets/memes/${pick(pool)}.webp` : '');
  // 经典梗图按文件名配文；形象包/档案馆的图自己带文案，不覆盖
  let line = text;
  if (!memeFile && file) {
    const name = file.split('/').pop().replace(/\.[^.]+$/, '');
    if (CLASSIC_MEME_TEXTS[name]) line = CLASSIC_MEME_TEXTS[name];
  }
  const shown = bubbleEl.classList.contains('show');
  // 等待期间可能又来了新的 say()，旧的那次必须作废，不能把新内容覆盖回去。
  const run = (preloaded) => { if (seq === saySeq) sayNow(line, ms, file, memeFile, preloaded); };
  const swap = (preloaded) => {
    if (seq !== saySeq) return;
    // 先让 Region 多留出长高的空间，等它生效再改 DOM，避免上半截被旧 Region 裁掉。
    if (bubbleReserve) {
      run(preloaded);
      return;
    }
    reserveBubbleSpace(420).then(() => run(preloaded), () => run(preloaded));
  };
  if (!shown) {
    run(false);
  } else if (file) {
    preloadMeme(file).then(swap, () => swap(false));
  } else {
    swap(false);
  }
}

let bubbleSrc = '';

// 气泡正文单独走这里：记录中文原文，切换语言时可以直接重译当前气泡。
// 优先用台词字典，未命中再走界面动态规则（账本/状态类文案）。
function trBubble(src) {
  const i = window.PetLib && window.PetLib.i18n;
  if (!i || S.lang === 'zh') return src;
  const viaLine = i.line(src, S.lang);
  if (viaLine !== src) return viaLine;
  return i.translate ? i.translate(src, S.lang) : src;
}

function bubbleSetText(src) {
  bubbleSrc = String(src == null ? '' : src);
  bubbleText.textContent = trBubble(bubbleSrc);
}

function retranslateBubble() {
  if (!bubbleSrc) return;
  bubbleText.textContent = trBubble(bubbleSrc);
  if (bubbleEl.classList.contains('show')) {
    positionBubble();
    reportRegionNow(true);
  }
}

function sayNow(text, ms, file, memeFile, preloaded = false) {
  const applyText = () => {
    bubbleSetText(text);
    barsEl.classList.add('hide');
    usageEl.classList.add('hide');
  };
  const reveal = () => revealBubble(ms);
  // 硬闸门：气泡高度没长齐（图片/字体没就绪时会是一条 ~20px 的空带子）就绝不显示。
  // 逐帧录屏确认过：空带子先弹 0.1s、图片到位才撑高——用户看到的就是「先一半后全部」。
  // 最多等 400ms，超时（比如图片加载失败）也照常显示。
  const revealLaidOut = (start) => {
    if (bubbleEl.offsetHeight < 36 && Date.now() - start < 1500) {
      requestAnimationFrame(() => revealLaidOut(start));
      return;
    }
    reveal();
  };
  // 字体没就绪时文字用回退字体排版，气泡先按小高度弹出，字体到位后行数变化、
  // 气泡往上长出一截——看起来就是「下半部分先出现，上半部分再出现」。
  // 所以亮出气泡前先等字体就绪（本地字体，通常几十毫秒）。
  const fontsReady = (fn) => {
    if (!document.fonts || document.fonts.status === 'loaded') fn();
    else document.fonts.ready.then(fn, fn);
  };
  if (file) {
    // 梗图有固定宽度 132px、高度靠图片本身撑开：加载期间高度是 0，
    // 气泡会先弹成一条空带子，图片到位后才撑高——「先弹出一半再弹出全部」。
    // 修法：加载期间让梗图 display:none（完全不参与布局，气泡高度=纯文字高度，
    // 一开始就是最终高度），加载完/失败后才让它回到布局，再亮气泡。
    memeEl.classList.toggle('archive', !!memeFile);
    const done = () => fontsReady(() => revealLaidOut(Date.now()));
    // 用解析后的绝对 URL 比较——file 是 "../assets/..." 而 src 是 "http://.../assets/..."，
    // 直接 endsWith 永远不相等，缓存判断永远失败
    const abs = new URL(file, location.href).href;
    const cached = memeEl.src === abs && memeEl.complete && memeEl.naturalWidth > 0;
    if (preloaded) {
      // 图已经离屏读过：文字、图片、尺寸在同一帧里换好，旧气泡不会被缩成小条
      const ready = () => {
        applyText();
        memeEl.classList.remove('hide');
        positionBubble();
        done();
      };
      memeEl.onload = ready;
      memeEl.onerror = () => {
        applyText();
        memeEl.classList.add('hide');
        done();
      };
      memeEl.src = file;
      if (memeEl.complete && memeEl.naturalWidth > 0) ready();
    } else if (cached) {
      applyText();
      memeEl.classList.remove('hide');
      done();
    } else {
      applyText();                            // 首次显示时气泡还不可见，提前排版没有视觉影响
      memeEl.classList.add('hide');           // 加载期间不占布局
      memeEl.onload = () => {
        memeEl.classList.remove('hide');      // 加载完才占布局（此时高度已是最终值）
        positionBubble();
        done();
      };
      memeEl.onerror = () => { memeEl.classList.add('hide'); done(); };
      memeEl.src = file;
      // 同一个 src 赋值不会触发重新加载/onload：如果其实早已加载完成，直接走完成分支
      if (memeEl.complete && memeEl.naturalWidth > 0) {
        memeEl.classList.remove('hide');
        positionBubble();
        done();
      }
    }
  } else {
    applyText();
    memeEl.classList.add('hide');
    fontsReady(() => revealLaidOut(Date.now()));
  }
}

function classicMeme(name) {
  return window.PetLib.memePool.classicMeme(name, CLASSIC_MEME_TEXTS[name] || '', '../assets/memes/');
}

function sceneMemePool(scene) {
  const classic = (MEMES[scene] || []).map((name) => classicMeme(name));
  const gallery = allMemes()
    .filter((m) => m.scenes.includes(scene))
    .map((m) => ({ file: m.file, url: memeUrl(m), text: m.text }));
  return window.PetLib.memePool.mergeByFile(classic, gallery);
}

function nextSceneMeme(scene, fallbackText) {
  const pool = sceneMemePool(scene);
  if (!pool.length) return null;
  const out = S.memeOrder === 'random' ? pick(pool) : memeQueue.next(scene, () => pool);
  if (!out) return null;
  return out.text ? out : { ...out, text: fallbackText };
}

function resetMemeQueues() {
  memeQueue.reset();
}

function sayScene(scene, fallbackText, ms = 3200) {
  if (!isDsh() || usingCustomQuips()) {
    say(fallbackText, ms);
    return;
  }
  const m = nextSceneMeme(scene, fallbackText);
  if (!m) {
    say(fallbackText, ms);
    return;
  }
  say(m.text || fallbackText, ms, null, m.url);
}

function sayClickCombo(fallbackText, ms = 3200) {
  sayScene('click', fallbackText, ms);
}
