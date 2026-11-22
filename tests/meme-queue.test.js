const test = require('node:test');
const assert = require('node:assert/strict');
const { MemeQueue, shuffle } = require('../renderer/lib/meme-queue.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((file) => ({ file, text: file.toUpperCase() }));

test('shuffle 返回同一批元素', () => {
  const out = shuffle(pool, seeded(1));
  assert.deepEqual(out.map((x) => x.file).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('每轮恰好抽完整个池，且跨轮不连续重复', () => {
  const q = new MemeQueue(seeded(7));
  const seen = [];
  for (let round = 0; round < 5; round++) {
    const files = [];
    for (let i = 0; i < pool.length; i++) {
      const item = q.next('click', () => pool);
      assert.ok(item, 'queue should not be empty mid-round');
      files.push(item.file);
    }
    assert.deepEqual([...files].sort(), ['a', 'b', 'c', 'd', 'e', 'f'], `round ${round}`);
    seen.push(...files);
  }
  for (let i = 1; i < seen.length; i++) {
    assert.notEqual(seen[i], seen[i - 1], `consecutive duplicate at ${i}`);
  }
});

test('reset 清空队列与上一张', () => {
  const q = new MemeQueue(seeded(3));
  q.next('click', () => pool);
  q.reset();
  assert.equal(q.last, '');
  const item = q.next('click', () => pool);
  assert.ok(pool.some((x) => x.file === item.file));
});

test('空池返回 null', () => {
  const q = new MemeQueue(seeded(4));
  assert.equal(q.next('empty', () => []), null);
});