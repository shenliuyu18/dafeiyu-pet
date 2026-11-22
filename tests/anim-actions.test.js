const test = require('node:test');
const assert = require('node:assert/strict');
const { ANIM_BUILTIN, PLUS_TARGET, CODE_CHAR_PACKS } = require('../renderer/lib/anim-actions.js');

test('内置动作表每个槽位都有动作', () => {
  for (const [key, list] of Object.entries(ANIM_BUILTIN)) {
    assert.ok(Array.isArray(list) && list.length > 0, `${key} 为空`);
  }
  assert.ok(ANIM_BUILTIN.work.length >= 4);
});

test('扩充包与图集映射指向有效形象键', () => {
  assert.equal(PLUS_TARGET.dsh1, 'v1');
  assert.equal(CODE_CHAR_PACKS.gpt, 'gptv1');
  assert.ok(Object.keys(PLUS_TARGET).every((k) => k && typeof PLUS_TARGET[k] === 'string'));
});
