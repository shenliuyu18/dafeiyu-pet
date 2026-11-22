/*
 * 梗图池：经典图与图库合并、按文件名去重。
 */
(function (root) {
  'use strict';

  function classicMeme(name, text, baseUrl) {
    return { file: name, url: baseUrl + name + '.webp', text: text || '' };
  }

  function mergeByFile(a, b) {
    const seen = new Set();
    return a.concat(b).filter((m) => {
      if (!m || seen.has(m.file)) return false;
      seen.add(m.file);
      return true;
    });
  }

  const api = { classicMeme, mergeByFile };
  root.PetLib = root.PetLib || {};
  root.PetLib.memePool = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);