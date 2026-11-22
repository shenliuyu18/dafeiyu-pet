const test = require('node:test');
const assert = require('node:assert/strict');
const { dictionaries } = require('../renderer/lib/i18n.js');

test('en / ja 字典覆盖同一批中文键', () => {
  const en = Object.keys(dictionaries.en).sort();
  const ja = Object.keys(dictionaries.ja).sort();
  assert.deepEqual(ja, en);
  assert.ok(en.length >= 30);
  for (const k of en) {
    assert.ok(dictionaries.en[k] && dictionaries.ja[k], `empty translation for ${k}`);
  }
});
test('line 翻译常用台词并可回退', () => {
  const { line } = require('../renderer/lib/i18n.js');
  assert.equal(line('记得喝水。', 'en'), 'Remember to drink water.');
  assert.equal(line('记得喝水。', 'ja'), 'お水を飲んでね。');
  assert.equal(line('不存在的台词', 'en'), '不存在的台词');
  assert.equal(line('记得喝水。', 'zh'), '记得喝水。');
});

test('UI 字典包含静态与动态文案', () => {
  global.window = global;
  const i18n = require('../renderer/lib/i18n.js');
  require('../renderer/lib/ui-i18n.js');
  for (const lang of ['en', 'ja']) {
    assert.equal(i18n.dictionaries[lang]['设置'], lang === 'en' ? 'Settings' : '設定');
    assert.ok(i18n.dictionaries[lang]['正在重新检测…']);
    assert.ok(Object.keys(i18n.dictionaries[lang]).length >= 150);
  }
});

test('动态文案按模式翻译', () => {
  global.window = global;
  const i18n = require('../renderer/lib/i18n.js');
  require('../renderer/lib/ui-i18n.js');
  assert.equal(i18n.translate('35 秒', 'en'), '35 s');
  assert.equal(i18n.translate('35 分钟', 'ja'), '35分');
  assert.equal(i18n.translate('今天 3 分钟 · 近 7 天 12 分钟 · 累计 99 分钟', 'en'), 'Today 3 min · Last 7 days 12 min · Total 99 min');
  assert.equal(i18n.translate('已是最新版本 v1.5.3', 'ja'), '最新バージョン v1.5.3 です');
  assert.equal(i18n.translate('下载失败：网络错误', 'en'), 'Download failed: Network error');
  assert.equal(i18n.translate('普通文本', 'en'), '普通文本');
});

test('下载包与图集动作名都有英/日翻译', () => {
  global.window = global;
  const i18n = require('../renderer/lib/i18n.js');
  require('../renderer/lib/action-i18n.js');
  const d = i18n.dictionaries;
  for (const k of ['唱歌-清唱', '图书管理员嘘', '宇航员行走', '待机眨眼', '敲键盘', '向右奔跑']) {
    assert.notEqual(d.en[k], undefined, `en missing ${k}`);
    assert.notEqual(d.ja[k], undefined, `ja missing ${k}`);
  }
  assert.equal(d.en['待机眨眼'], 'Idle blink');
  assert.equal(d.ja['敲键盘'], 'キーボードを打つ');
});
