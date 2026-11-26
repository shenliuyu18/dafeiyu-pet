/*
 * 省电档纯函数：电源状态 -> 是否省电、帧间隔。
 * 与 DOM / Wails 解耦，方便单测和以后扩展到 macOS。
 */
(function (root) {
  'use strict';

  const IDLE_GAP = 166; // 约 6fps
  const ROAM_GAP = 33;  // 约 30fps

  /** @param {string} v */
  function normalizeMode(v) {
    return v === 'on' || v === 'off' ? v : 'auto';
  }

  /**
   * @param {string} mode auto | on | off
   * @param {boolean} onAC
   * @param {boolean} known 电源状态是否可信；不可信时按交流电处理
   */
  function isSaving(mode, onAC, known) {
    mode = normalizeMode(mode);
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return known === true && onAC === false;
  }

  /**
   * @param {number} baseIdle 正常空闲间隔
   * @param {number} baseRoam 正常漫游间隔
   * @param {boolean} saving
   */
  function gaps(baseIdle, baseRoam, saving) {
    return saving ? { idle: IDLE_GAP, roam: ROAM_GAP } : { idle: baseIdle, roam: baseRoam };
  }

  const api = { normalizeMode, isSaving, gaps, IDLE_GAP, ROAM_GAP };
  root.PetLib = root.PetLib || {};
  root.PetLib.powerSave = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);