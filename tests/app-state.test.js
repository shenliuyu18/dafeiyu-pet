'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_STATE = path.join(__dirname, '..', 'renderer', 'app-state.js');

test('app-state 保留默认 S/P，并以经典脚本词法绑定共享', () => {
  class FixedDate extends Date {
    static now() { return 123456789; }
  }
  const context = vm.createContext({ Date: FixedDate });
  vm.runInContext(fs.readFileSync(APP_STATE, 'utf8'), context, { filename: APP_STATE });

  const state = vm.runInContext(`({
    S: {
      satiety: S.satiety, mood: S.mood, awake: S.awake, ledgerOn: S.ledgerOn,
      autoStart: S.autoStart, safeResume: S.safeResume, fullscreenHide: S.fullscreenHide,
      memeOrder: S.memeOrder, powerSave: S.powerSave, onAC: S.onAC,
      powerKnown: S.powerKnown, powerSaving: S.powerSaving, launchApp: S.launchApp,
      character: S.character, fontFamily: S.fontFamily, fontScale: S.fontScale,
      fontWeight: S.fontWeight, sfx: S.sfx, lang: S.lang, autoActionSec: S.autoActionSec,
      ledgerSource: S.ledgerSource, apiKeys: S.apiKeys, autoUpdate: S.autoUpdate,
      customQuips: S.customQuips, useCustomQuips: S.useCustomQuips, pinnedActions: S.pinnedActions,
      dock: S.dock, pomoMin: S.pomoMin, pomoAnimSec: S.pomoAnimSec, dragging: S.dragging,
      hover: S.hover, autoDoze: S.autoDoze, pomoRunning: S.pomoRunning, ledger: S.ledger,
      lastInteract: S.lastInteract, hungryAt: S.hungryAt, bubbleTimer: S.bubbleTimer,
      quipTimer: S.quipTimer, happyTimer: S.happyTimer, downAt: S.downAt, moved: S.moved,
      downX: S.downX, downY: S.downY, over: S.over,
      mouse: S.mouse,
    },
    P: {
      x: P.x, y: P.y, vx: P.vx, vy: P.vy, target: P.target, swimTo: P.swimTo,
      pauseUntil: P.pauseUntil, facing: P.facing, dragOff: P.dragOff,
      frozen: P.frozen, swimming: P.swimming,
    },
    mapType: reportedErrors.constructor.name,
    keys: Object.keys(S).sort(),
    pKeys: Object.keys(P).sort(),
  })`, context);

  assert.deepEqual(JSON.parse(JSON.stringify(state.S)), {
    satiety: 78, mood: 82, awake: true, ledgerOn: true,
    autoStart: false, safeResume: true, fullscreenHide: true,
    memeOrder: 'queue', powerSave: 'auto', onAC: true,
    powerKnown: false, powerSaving: false, launchApp: '',
    character: 'v1', fontFamily: 'soft', fontScale: 1,
    fontWeight: 400, sfx: 'default', lang: 'zh', autoActionSec: 40,
    ledgerSource: 'deepseek', apiKeys: {}, autoUpdate: false,
    customQuips: [], useCustomQuips: true, pinnedActions: {},
    dock: 'roam', pomoMin: 25, pomoAnimSec: 5, dragging: false,
    hover: false, autoDoze: false, pomoRunning: false, ledger: null,
    lastInteract: 123456789, hungryAt: 0, bubbleTimer: null,
    quipTimer: null, happyTimer: null, downAt: 0, moved: 0,
    downX: 0, downY: 0, over: false,
    mouse: { x: 0, y: 0 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(state.P)), {
    x: 0, y: 0, vx: 0, vy: 0, target: null, swimTo: null,
    pauseUntil: 0, facing: 'right', dragOff: { x: 0, y: 0 },
    frozen: false, swimming: false,
  });
  assert.equal(state.mapType, 'Map');
  assert.equal(state.keys.length, Object.keys(state.S).length, 'S 不应有未断言的默认字段');
  assert.equal(state.pKeys.length, Object.keys(state.P).length, 'P 不应有未断言的默认字段');
  assert.equal(context.S, undefined, 'const S 不应挂到 globalThis');
  assert.equal(context.P, undefined, 'const P 不应挂到 globalThis');
  assert.equal(context.reportedErrors, undefined, 'const reportedErrors 不应挂到 globalThis');

  vm.runInContext('S.mood = 1; P.x = 2; reportedErrors.set("shared", true);', context);
  const shared = vm.runInContext('({ mood: S.mood, x: P.x, reported: reportedErrors.get("shared") })', context);
  assert.deepEqual(JSON.parse(JSON.stringify(shared)), { mood: 1, x: 2, reported: true });
});

test('index.html 在 feature 脚本之前加载 app-state.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const stateAt = html.indexOf('<script src="app-state.js"></script>');
  const featureAt = html.indexOf('<script src="features/');
  assert.ok(stateAt >= 0, 'index.html 未加载 app-state.js');
  assert.ok(featureAt > stateAt, 'app-state.js 必须先于 feature 脚本加载');
});

test('wails-prepare 复制并注入 app-state.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'wails-prepare.js'), 'utf8');
  assert.match(source, /for \(const f of \[[^\]]*'app-state\.js'/, '复制 allowlist 缺少 app-state.js');
  assert.match(source, /replace\('<script src="app-state\.js"><\/script>', `<script src="app-state\.js\?v=\$\{pkg\.version\}"><\/script>`\)/, '缓存注入缺少 app-state.js');
});
