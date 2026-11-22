/*
 * 状态气泡与白饭账本文案。函数在 pet.js 初始化后调用。
 */

function showStatus() {
  clearTimeout(S.bubbleTimer);
  saySeq++;
  let word = '今天状态不错哦～';
  if (S.satiety < 32) word = isDsh() ? '白饭没吃饱，喂喂我嘛…' : '有点饿了…';
  else if (S.mood > 85) word = '我心情超好的！';
  else if (S.mood < 40) word = '有点提不起劲…';
  withBubbleRoom(() => {
    bubbleSetText(word);
    barSat.style.width = `${Math.round(S.satiety)}%`;
    barMood.style.width = `${Math.round(S.mood)}%`;
    usageEl.classList.add('hide');
    barsEl.classList.remove('hide');
    revealBubble(6000);
  });
}

function creditsLine() {
  if (!S.ledgerOn || !isDsh()) return null;
  const l = S.ledger;
  if (!l || !l.available) return null;
  if (l.source && l.source !== 'qoder') return `${l.providerShort || 'API'}：${(l.rows && l.rows[0] && l.rows[0].value) || '暂无数据'}`;
  if (l.today > 0) return `今天你已经喂了我 ${l.today} credits 白饭啦`;
  if (l.month > 0) return `这个月我吃掉了 ${l.month} credits 白饭`;
  return '今天还没吃到白饭，快让我干活';
}

function applyHungry() {
  const hungry = S.satiety < 32;
  // 状态没变就不重跑动画选择：饱食度每 30 秒都在变，但跨过阈值才有必要切状态
  if (stage.classList.contains('hungry') === hungry) return;
  stage.classList.toggle('hungry', hungry);
  applyBase();
}

function applyDoze() {
  stage.classList.toggle('doze', !S.awake || S.autoDoze);
  applyBase();
}
