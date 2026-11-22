const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: { PET_ANIMS: [] } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'features', 'animation-data.js'), 'utf8'), ctx);
  return ctx;
}

test('形象数据模块可独立加载', () => {
  const ctx = load();
  assert.equal(vm.runInContext("CHARS.v1.label", ctx), '大肥鱼');
  assert.equal(vm.runInContext("typeof isDsh", ctx), 'function');
  assert.ok(vm.runInContext('SPRITE.sequences.idle.times.length', ctx) > 0);
});

