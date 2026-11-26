const test = require('node:test');
const assert = require('node:assert/strict');
const { spriteFor, LEGACY } = require('../renderer/lib/legacy-pack-sprite.js');

test('老版 gptv1 包缺 sprite 时回落到内置图集参数', () => {
  const sp = spriteFor({ id: 'gptv1' });
  assert.ok(sp, '应返回兼容参数');
  assert.ok(sp.sequences && sp.sequences.idle, '应含 idle 序列');
  assert.equal(sp.cellW, 192);
  assert.equal(sp.cellH, 208);
  assert.equal(sp.cols, 8);
  assert.equal(sp.rows, 11);
  // 图集 73 帧：8 列 × 11 行，序列总数不能超过 88
  const total = Object.values(sp.sequences).reduce((a, s) => a + (s.count || 0), 0);
  assert.ok(total > 0 && total <= 88, `序列总帧数异常: ${total}`);
});

test('包内自带 sprite 时始终以包为准', () => {
  const own = { sheet: 'other.webp', cellW: 100, sequences: { idle: { row: 0, count: 1, times: [100] } } };
  const sp = spriteFor({ id: 'gptv1', sprite: own });
  assert.equal(sp, own, '新包参数不应被兼容值覆盖');
});

test('未知包没有兼容参数', () => {
  assert.equal(spriteFor({ id: 'unknown' }), null);
  assert.equal(spriteFor(null), null);
  assert.deepEqual(Object.keys(LEGACY), ['gptv1']);
});