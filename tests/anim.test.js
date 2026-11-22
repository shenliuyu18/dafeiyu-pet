const test = require('node:test');
const assert = require('node:assert/strict');
const { baseKind } = require('../renderer/lib/anim.js');

const base = {
  dragging: false,
  awake: true,
  autoDoze: false,
  pomoRunning: false,
  pomoResting: false,
  satiety: 80,
  swimming: false,
};

test('拖拽优先级最高', () => {
  assert.equal(baseKind({ ...base, dragging: true, awake: false, satiety: 10 }), 'drag');
});

test('睡眠高于番茄钟与饥饿', () => {
  assert.equal(baseKind({ ...base, awake: false, pomoRunning: true }), 'sleep');
  assert.equal(baseKind({ ...base, autoDoze: true, satiety: 5 }), 'sleep');
});

test('番茄钟区分工作与休息', () => {
  assert.equal(baseKind({ ...base, pomoRunning: true }), 'pomo');
  assert.equal(baseKind({ ...base, pomoRunning: true, pomoResting: true }), 'idle');
});

test('饥饿优先于移动/待机', () => {
  assert.equal(baseKind({ ...base, satiety: 31, swimming: true }), 'sad');
});

test('移动与待机', () => {
  assert.equal(baseKind({ ...base, swimming: true }), 'move');
  assert.equal(baseKind({ ...base }), 'idle');
});