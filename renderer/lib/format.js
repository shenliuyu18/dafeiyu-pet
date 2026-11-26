/*
 * 商店/清单用的版本比较。支持 1.2、1.2.3、v1.2.3-beta，缺失字段视为 0。
 */
(function (root) {
  'use strict';

  function parse(v) {
    const s = String(v || '').trim().replace(/^v/i, '');
    const [core, pre = ''] = s.split('-');
    const nums = core.split('.').map((x) => parseInt(x, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre };
  }

  function compareVersion(a, b) {
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
      if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i] ? 1 : -1;
    }
    if (pa.pre === pb.pre) return 0;
    if (!pa.pre) return 1;
    if (!pb.pre) return -1;
    return pa.pre > pb.pre ? 1 : -1;
  }

  function isNewer(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    return compareVersion(candidate, current) > 0;
  }

  // 商店是否要提示「可更新」：两边都有版本号才能比较。
  // 旧包 / 本地导入的包没有 version，不能当作「有更新」。
  function needsUpdate(catalogVersion, installedVersion) {
    if (!catalogVersion || !installedVersion) return false;
    return compareVersion(catalogVersion, installedVersion) > 0;
  }

  const api = { compareVersion, isNewer, needsUpdate };
  root.PetLib = root.PetLib || {};
  root.PetLib.format = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);