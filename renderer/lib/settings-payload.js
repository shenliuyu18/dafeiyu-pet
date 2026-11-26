/*
 * 设置载荷：把渲染层状态压成发给主进程的扁平对象。
 * 纯函数，便于单测；字段增减只改这一处。
 */
(function (root) {
  'use strict';

  /**
   * @param {object} S 渲染层状态
   * @param {number} petScale 当前缩放
   * @returns {object}
   */
  function settingsPayload(S, petScale) {
    return {
      scale: petScale,
      dock: S.dock,
      pomoMin: S.pomoMin,
      pomoAnimSec: S.pomoAnimSec,
      ledger: S.ledgerOn,
      autoStart: S.autoStart,
      safeResume: S.safeResume,
      fullscreenHide: S.fullscreenHide,
      memeOrder: S.memeOrder,
      powerSave: S.powerSave,
      launchApp: S.launchApp,
      character: S.character,
      fontFamily: S.fontFamily,
      fontSize: S.fontScale,
      fontWeight: S.fontWeight,
      sfx: S.sfx,
      lang: S.lang,
      autoActionSec: S.autoActionSec,
      ledgerSource: S.ledgerSource,
      autoUpdate: S.autoUpdate,
      customQuips: S.customQuips,
      useCustomQuips: S.useCustomQuips,
      pinnedActions: S.pinnedActions,
    };
  }

  const api = { settingsPayload };
  root.PetLib = root.PetLib || {};
  root.PetLib.settingsPayload = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);