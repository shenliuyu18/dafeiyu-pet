const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMode, isSaving, gaps, IDLE_GAP, ROAM_GAP } = require('../renderer/lib/power-save.js');

test('模式归一化：非 on/off 一律按 auto', () => {
  assert.equal(normalizeMode('on'), 'on');
  assert.equal(normalizeMode('off'), 'off');
  assert.equal(normalizeMode('auto'), 'auto');
  assert.equal(normalizeMode('ON'), 'auto');
  assert.equal(normalizeMode(''), 'auto');
  assert.equal(normalizeMode(undefined), 'auto');
});

test('强制开/关不受电源状态影响', () => {
  assert.equal(isSaving('on', true, true), true);
  assert.equal(isSaving('on', false, true), true);
  assert.equal(isSaving('off', false, true), false);
  assert.equal(isSaving('off', true, true), false);
});

test('auto 仅在确认使用电池时省电', () => {
  assert.equal(isSaving('auto', false, true), true);
  assert.equal(isSaving('auto', true, true), false);
  // 电源状态不可信：按交流电处理，不省电
  assert.equal(isSaving('auto', false, false), false);
  assert.equal(isSaving('auto', true, false), false);
  assert.equal(isSaving('auto', undefined, undefined), false);
});

test('省电时用固定低帧率间隔，恢复时回到基线', () => {
  assert.deepEqual(gaps(100, 22, false), { idle: 100, roam: 22 });
  assert.deepEqual(gaps(100, 22, true), { idle: 166, roam: 33 });
  assert.equal(IDLE_GAP, 166);
  assert.equal(ROAM_GAP, 33);
});