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

test('应用本体不再内置下载包的动作名译文', () => {
  global.window = global;
  const i18n = require('../renderer/lib/i18n.js');
  require('../renderer/lib/action-i18n.js');
  const d = i18n.dictionaries;
  for (const k of ['唱歌-清唱', '图书管理员嘘', '宇航员行走', '待机眨眼', '敲键盘', '向右奔跑']) {
    assert.equal(d.en[k], undefined, `en 仍内置 ${k}`);
    assert.equal(d.ja[k], undefined, `ja 仍内置 ${k}`);
  }
  assert.ok(d.en['基础状态']);
});

test('形象包内容自带台词、动作名与分类译文', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'tools', 'character-pack', 'content');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 9, '缺少形象包内容文件');
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const en = j.i18n && j.i18n.en;
    const ja = j.i18n && j.i18n.ja;
    assert.ok(en && ja, `${f} 缺少 en/ja`);
    assert.deepEqual(Object.keys(ja.lines || {}).sort(), Object.keys(en.lines || {}).sort(), `${f} lines 语言不对齐`);
    assert.deepEqual(Object.keys(ja.actions || {}).sort(), Object.keys(en.actions || {}).sort(), `${f} actions 语言不对齐`);
    assert.deepEqual(Object.keys(ja.categories || {}).sort(), Object.keys(en.categories || {}).sort(), `${f} categories 语言不对齐`);
    for (const lang of ['en', 'ja']) {
      for (const [src, tr] of Object.entries(j.i18n[lang].lines || {})) {
        assert.ok(String(tr).trim(), `${f} ${lang} lines「${src}」译文为空`);
      }
      for (const [src, tr] of Object.entries(j.i18n[lang].actions || {})) {
        assert.ok(String(tr).trim(), `${f} ${lang} actions「${src}」译文为空`);
      }
    }
    if (j.dialogue) {
      const texts = [];
      for (const key of ['intro', 'quips', 'feed', 'hungry', 'sleep']) {
        const v = j.dialogue[key];
        if (Array.isArray(v)) texts.push(...v.filter(Boolean));
        else if (v) texts.push(v);
      }
      for (const m of j.dialogue.memes || []) if (m.text) texts.push(m.text);
      const lines = j.i18n.en.lines || {};
      const missing = texts.filter((t) => !lines[t]);
      assert.equal(missing.length, 0, `${f} 台词缺英文：${missing.join(' / ')}`);
    }
    if (j.sprite) {
      assert.ok(j.sprite.sequences && j.sprite.sequences.idle, `${f} sprite 缺少 idle`);
      assert.ok(j.sprite.sequences.waiting, `${f} sprite 缺少 waiting`);
      assert.ok(j.sprite.map && Object.keys(j.sprite.map).length, `${f} sprite 缺少动作映射`);
    }
  }
});
