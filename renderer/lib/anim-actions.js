/*
 * 内置动作表与形象包映射。纯数据，渲染层按需引用。
 */
(function (root) {
  'use strict';

  // 内置（大肥鱼）的语义动作表；形象包会在 applyCharacter 里换成自己的表
  const ANIM_BUILTIN = {
    idle: ['待机呼吸休闲'],
    move: ['原地漂浮踏步', '螃蟹走路', '原地左转奔跑'],
    drag: ['被鼠标拖拽悬空反馈'],
    clicks: ['点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑', '点击回应-元气挥手'],
    feed: ['吃白饭', '吃Token', '大口吃零食'],
    sleep: ['原地小憩沉眠'],
    sad: ['工作状态-垂头叹气冒汗'],
    happy: ['工作状态-雀跃庆祝'],
    work: ['写代码', '工作状态-思考冒泡', '工作状态-忙碌点按', '工作状态-清点归档'],
    money: ['余额-数金皱眉', '余额-钱袋满溢'],
  };

  // 扩充包（plus）：把另一个角色包的动作并入某个内置形象。
  const PLUS_TARGET = { dsh1: 'v1' };
  // 图集形象的素材不在安装包里：对应 zip 装好后才启用（charKey -> packId）
  const CODE_CHAR_PACKS = { gpt: 'gptv1' };

  const api = { ANIM_BUILTIN, PLUS_TARGET, CODE_CHAR_PACKS };
  root.PetLib = root.PetLib || {};
  root.PetLib.animActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
