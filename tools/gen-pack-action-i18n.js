'use strict';
// 从 tools/character-pack/content/*.json 汇总各形象包的动作名英/日译文，
// 生成应用内置的兜底词典：即使已安装的是没有 i18n 的旧包，也能按动作名翻译。
const fs = require('fs');
const path = require('path');
const CONTENT = path.join(__dirname, 'character-pack', 'content');
const OUT = path.join(__dirname, '..', 'renderer', 'lib', 'pack-action-i18n.js');
const EN = {};
const JA = {};
for (const f of fs.readdirSync(CONTENT)) {
  if (!f.endsWith('.json')) continue;
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')); } catch { continue; }
  const i18n = j.i18n || {};
  for (const [lang, dst] of [['en', EN], ['ja', JA]]) {
    const loc = i18n[lang] || {};
    Object.assign(dst, loc.categories || {});
    Object.assign(dst, loc.actions || {});
  }
}
delete EN['spritesheet']; delete JA['spritesheet'];
const enc = (o) => JSON.stringify(o, null, 0);
const body = `/*
 * 内置兜底：各形象包的动作名/分类英日译文（由 tools/gen-pack-action-i18n.js 生成，勿手改）。
 * 仅在已安装包缺 i18n 时补齐，不覆盖包内自带译文。
 */
(function (root) {
  'use strict';
  const EN = ${enc(EN)};
  const JA = ${enc(JA)};
  if (root.PetLib && root.PetLib.i18n && root.PetLib.i18n.extendPackFallback) {
    root.PetLib.i18n.extendPackFallback(EN, JA);
  }
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(OUT, body, 'utf8');
console.log('wrote', OUT, 'EN', Object.keys(EN).length, 'JA', Object.keys(JA).length);
