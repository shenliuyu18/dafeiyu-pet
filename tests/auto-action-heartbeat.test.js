const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readRenderer(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'renderer', file), 'utf8');
}

// 执行真实的 lifecycle/animation 模块和 pet.js 的启动循环；只替换浏览器定时器与 DOM 边界。
function loadPetRuntime() {
  const intervals = [];
  const lean = [];
  const actions = [];
  let clock = 1000;
  let wakeCount = 0;
  const ctx = {
    console,
    Date: class extends Date { static now() { return 100000; } },
    document: { getElementById: () => null },
    window: { runtime: null },
    S: {
      mouse: { x: 0, y: 0 },
      over: false,
      awake: true,
      dragging: false,
      autoDoze: false,
      pomoRunning: false,
      autoActionSec: 40,
    },
    oneShotPlaying: false,
    lastCursorAt: 0,
    performance: { now: () => ++clock },
    applyLean: (x, y) => lean.push({ x, y }),
    wake: () => { wakeCount++; },
    charNow: () => ({ kind: 'video' }),
    WHISPERS: [],
    ACTIONS: [{ weight: 1, pool: ['自动动作'] }],
    usable: (list) => list,
    playOnce: (name) => actions.push(name),
    setInterval: (callback, delay) => {
      const timer = { id: intervals.length + 1, callback, delay };
      intervals.push(timer);
      return timer.id;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readRenderer('features/animation.js'), ctx);
  vm.runInContext(readRenderer('features/lifecycle.js'), ctx);

  const petSource = readRenderer('pet.js');
  const loopStart = petSource.indexOf('// ---------------------------------------------------------------- 循环');
  const loopEnd = petSource.indexOf('requestAnimationFrame(frame);', loopStart);
  assert.ok(loopStart >= 0 && loopEnd > loopStart, '无法定位 pet.js 启动循环');
  vm.runInContext(petSource.slice(loopStart, loopEnd), ctx);
  return { ctx, intervals, lean, actions, wakeCount: () => wakeCount };
}

test('连续 cursor 事件不新增永久定时器，视线与唤醒行为保持', () => {
  const runtime = loadPetRuntime();
  const initialTimers = runtime.intervals.slice();

  for (let i = 0; i < 100; i++) {
    vm.runInContext(`handleCursor({ x: ${i + 1}, y: ${i + 2}, over: true })`, runtime.ctx);
  }

  assert.equal(runtime.intervals.length, initialTimers.length, 'cursor 事件创建了新的永久定时器');
  assert.deepEqual(runtime.intervals, initialTimers, 'cursor 事件替换了原有定时器');
  assert.deepEqual({ ...runtime.ctx.S.mouse }, { x: 100, y: 101 });
  assert.equal(runtime.ctx.lastCursorAt, 1100);
  assert.equal(runtime.ctx.S.over, true);
  assert.equal(runtime.lean.length, 100);
  assert.deepEqual(runtime.lean[99], { x: 100, y: 101 });
  assert.equal(runtime.wakeCount(), 1);
});

test('全局只有一个 500ms 自动动作心跳且到期只表演一次', () => {
  const { ctx, intervals, actions } = loadPetRuntime();
  const heartbeats = intervals.filter((timer) => timer.callback.name === 'maybeShow');
  assert.equal(heartbeats.length, 1, '自动动作心跳数量不是 1');
  assert.equal(heartbeats[0].delay, 500);

  vm.runInContext('lastAutoAt = 0', ctx);
  heartbeats[0].callback();
  assert.deepEqual(actions, [['自动动作']]);

  heartbeats[0].callback();
  assert.deepEqual(actions, [['自动动作']], '未到间隔时重复表演');
});
