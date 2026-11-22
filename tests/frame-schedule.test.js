const test = require('node:test');
const assert = require('node:assert/strict');
const { gapLimit, shouldReportPosition } = require('../renderer/lib/frame-schedule.js');

test('拖拽满帧，漫游降帧，空闲最低', () => {
  const base = { idleGap: 100, roamGap: 22, vx: 0, vy: 0, dragging: false };
  assert.equal(gapLimit({ ...base, dragging: true, vx: 50 }), 0);
  assert.equal(gapLimit({ ...base, vx: 15 }), 22);
  assert.equal(gapLimit({ ...base, vy: -15 }), 22);
  assert.equal(gapLimit({ ...base }), 100);
});

test('位置上报 80ms 节流', () => {
  assert.equal(shouldReportPosition(100, 50, 0, 1, 1, 0, 0), false);
  assert.equal(shouldReportPosition(131, 50, 0, 1, 1, 0, 0), true);
});

test('位置未变时 400ms 保活', () => {
  assert.equal(shouldReportPosition(500, 400, 300, 10, 10, 10, 10), false);
  assert.equal(shouldReportPosition(701, 600, 300, 10, 10, 10, 10), true);
});