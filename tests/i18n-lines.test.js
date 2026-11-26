const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const i18n = require('../renderer/lib/i18n.js');
require('../renderer/lib/lines-i18n.js');
require('../renderer/lib/memes-i18n.js');
require('../renderer/lib/meme-gallery-i18n.js');
const data = require('../renderer/lib/dialogue-data.js');

function neutralLines() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf8');
  const ns = src.indexOf('const NEUTRAL_QUIPS = [');
  const ne = src.indexOf('];', ns);
  assert.ok(ns > 0 && ne > ns, '中性台词块定位失败');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${src.slice(ns, ne + 2)}\nthis.__out = NEUTRAL_QUIPS;`, ctx);
  return ctx.__out;
}

function extraMemes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf8');
  const ns = src.indexOf('const EXTRA_MEMES = [');
  const ne = src.indexOf('];', ns);
  assert.ok(ns > 0 && ne > ns, 'EXTRA_MEMES 定位失败');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${src.slice(ns, ne + 2)}
this.__out = EXTRA_MEMES;`, ctx);
  return ctx.__out;
}

function dialogueLines() {
  const set = new Set();
  for (const pack of Object.values(data.CHAR_LINES)) {
    for (const key of ['intro', 'quips', 'feed', 'hungry', 'sleep']) {
      const v = pack[key];
      if (Array.isArray(v)) v.forEach((x) => set.add(x));
      else if (v) set.add(v);
    }
  }
  data.QUIPS.forEach((x) => set.add(x));
  neutralLines().forEach((x) => set.add(x));
  extraMemes().forEach((m) => set.add(m.text));
  for (const arr of Object.values(data.MEMES)) arr.forEach((x) => set.add(x));
  Object.values(data.CLASSIC_MEME_TEXTS).forEach((x) => set.add(x));
  return [...set];
}

test('内置形象台词与默认梗图都有英/日翻译', () => {
  const lines = dialogueLines();
  const missing = [];
  for (const line of lines) {
    for (const lang of ['en', 'ja']) {
      if (i18n.line(line, lang) === line) missing.push(`${lang}: ${line}`);
    }
  }
  assert.equal(missing.length, 0, `缺少翻译：\n${missing.join('\n')}`);
});

function galleryLines() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of ['archive-memes.js', 'dsh-memes.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', f), 'utf8'), ctx);
  }
  const set = new Set();
  (ctx.window.ARCHIVE_MEMES || []).forEach((m) => set.add(m.text));
  (ctx.window.DSH_MEMES || []).forEach((m) => set.add(m.text));
  return [...set];
}

test('图库梗图配文都有英/日翻译', () => {
  const missing = [];
  for (const line of galleryLines()) {
    for (const lang of ['en', 'ja']) {
      if (i18n.line(line, lang) === line) missing.push(`${lang}: ${line}`);
    }
  }
  assert.equal(missing.length, 0, `缺少翻译：\n${missing.join('\n')}`);
});
