/*
 * 点击/双击判定。由指针事件调用。
 */

const DOUBLE_CLICK_MS = 500;
let lastClickAt = 0;

function handlePetClick() {
  const now = Date.now();
  clearTimeout(S.quipTimer);
  if (now - lastClickAt < DOUBLE_CLICK_MS) {
    lastClickAt = 0;
    api.action('feed');
    return;
  }
  lastClickAt = now;
  S.quipTimer = setTimeout(() => {
    wake();
    S.mood = clamp(S.mood + 1, 0, 100);
    playOnce(ANIM.clicks);
    sfx('click');
    const custom = usingCustomQuips();
    const line = !custom && Math.random() < 0.3 ? creditsLine() : null;
    if (custom) say(pick(quipsPool()), 3200);
    else if (line) sayScene('ledger', line);
    else sayClickCombo(pick(quipsPool()), 3200);
    api.updateStats({ satiety: S.satiety, mood: S.mood });
  }, 230);
}
