const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsPayload } = require('../renderer/lib/settings-payload.js');

function sampleS() {
  return {
    dock: 'free',
    pomoMin: 25,
    pomoAnimSec: 8,
    ledgerOn: true,
    autoStart: 'high',
    safeResume: true,
    fullscreenHide: false,
    memeOrder: 'random',
    powerSave: 'auto',
    launchApp: 'C:/app.exe',
    character: 'v1',
    fontFamily: 'system',
    fontScale: 1.1,
    fontWeight: 700,
    sfx: true,
    lang: 'zh',
    autoActionSec: 30,
    ledgerSource: 'auto',
    autoUpdate: true,
    onlyPrimarySound: true,
    multiWarnOff: false,
    customQuips: 'a\nb',
    useCustomQuips: false,
    pinnedActions: ['idle', 'work'],
    // 下面这些不该出现在载荷里
    pomoRunning: true,
    bubbleTimer: 7,
  };
}

test('设置载荷逐字段映射', () => {
  assert.deepEqual(settingsPayload(sampleS(), 1.25), {
    scale: 1.25,
    dock: 'free',
    pomoMin: 25,
    pomoAnimSec: 8,
    ledger: true,
    autoStart: 'high',
    safeResume: true,
    fullscreenHide: false,
    memeOrder: 'random',
    powerSave: 'auto',
    launchApp: 'C:/app.exe',
    character: 'v1',
    fontFamily: 'system',
    fontSize: 1.1,
    fontWeight: 700,
    sfx: true,
    lang: 'zh',
    autoActionSec: 30,
    ledgerSource: 'auto',
    autoUpdate: true,
    onlyPrimarySound: true,
    multiWarnOff: false,
    customQuips: 'a\nb',
    useCustomQuips: false,
    pinnedActions: ['idle', 'work'],
  });
});

test('设置载荷只含白名单字段', () => {
  const out = settingsPayload(sampleS(), 1);
  assert.equal(Object.keys(out).length, 25);
  assert.equal('pomoRunning' in out, false);
  assert.equal('bubbleTimer' in out, false);
  assert.equal('onlyPrimarySound' in out, true);
});

test('缺字段时保留 undefined，不做默认值兜底', () => {
  const out = settingsPayload({ dock: 'corner' }, 1);
  assert.equal(out.dock, 'corner');
  assert.equal(out.powerSave, undefined);
  assert.equal(out.scale, 1);
});