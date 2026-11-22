const test = require('node:test');
const assert = require('node:assert/strict');
const { classicMeme, mergeByFile } = require('../renderer/lib/meme-pool.js');

test('经典梗图生成 webp 地址并带配文', () => {
  const m = classicMeme('Ciallo', '你好', '../assets/memes/');
  assert.equal(m.file, 'Ciallo');
  assert.equal(m.url, '../assets/memes/Ciallo.webp');
  assert.equal(m.text, '你好');
});

test('合并时按文件名去重，经典图优先', () => {
  const out = mergeByFile(
    [{ file: 'a', text: 'classic' }, { file: 'b' }],
    [{ file: 'a', text: 'gallery' }, { file: 'c' }]
  );
  assert.deepEqual(out.map((m) => m.file), ['a', 'b', 'c']);
  assert.equal(out[0].text, 'classic');
});