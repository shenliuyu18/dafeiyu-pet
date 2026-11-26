/*
 * 老版形象包的兼容图集参数。
 *
 * 历史版本的 gptv1 包 manifest 里没有 sprite 描述，但图集文件本身与仓库一致。
 * 若直接丢弃这份描述，老包会被判成“装了但不能播”，商店又把它列成“可更新”，
 * 而目录里并没有新版本号。这里保留一份兼容参数：新包有 sprite 时始终以包为准，
 * 只有老包才回落到这份内置值。
 */
(function (root) {
  'use strict';

  const LEGACY = {
    gptv1: {
  "sheet": "spritesheet.webp",
  "cellW": 192,
  "cellH": 208,
  "cols": 8,
  "rows": 11,
  "sequences": {
    "idle": {
      "row": 0,
      "count": 6,
      "times": [
        1680,
        660,
        660,
        840,
        840,
        1920
      ]
    },
    "runRight": {
      "row": 1,
      "count": 8,
      "times": [
        120,
        120,
        120,
        120,
        120,
        120,
        120,
        220
      ]
    },
    "runLeft": {
      "row": 2,
      "count": 8,
      "times": [
        120,
        120,
        120,
        120,
        120,
        120,
        120,
        220
      ]
    },
    "waving": {
      "row": 3,
      "count": 4,
      "times": [
        140,
        140,
        140,
        280
      ]
    },
    "jumping": {
      "row": 4,
      "count": 5,
      "times": [
        140,
        140,
        140,
        140,
        280
      ]
    },
    "failed": {
      "row": 5,
      "count": 8,
      "times": [
        140,
        140,
        140,
        140,
        140,
        140,
        140,
        240
      ]
    },
    "waiting": {
      "row": 6,
      "count": 6,
      "times": [
        150,
        150,
        150,
        150,
        150,
        260
      ]
    },
    "work": {
      "row": 7,
      "count": 6,
      "times": [
        120,
        120,
        120,
        120,
        120,
        220
      ]
    },
    "review": {
      "row": 8,
      "count": 6,
      "times": [
        150,
        150,
        150,
        150,
        150,
        280
      ]
    },
    "sleep": {
      "row": 0,
      "count": 1,
      "times": [
        1200
      ],
      "frame": 2
    }
  },
  "map": {
    "待机呼吸休闲": "idle",
    "原地漂浮踏步": "run",
    "螃蟹走路": "run",
    "原地左转奔跑": "run",
    "被鼠标拖拽悬空反馈": "jumping",
    "原地小憩沉眠": "sleep",
    "工作状态-垂头叹气冒汗": "failed",
    "工作状态-雀跃庆祝": "review",
    "写代码": "work",
    "工作状态-思考冒泡": "waiting",
    "工作状态-忙碌点按": "work",
    "工作状态-清点归档": "work",
    "吃白饭": "review",
    "吃Token": "review",
    "大口吃零食": "review",
    "点击回应-开心跃动": "review",
    "点击回应-害羞惊讶": "jumping",
    "点击回应-傲娇生气": "failed",
    "点击回应-挠痒咯咯笑": "waving",
    "点击回应-元气挥手": "waving",
    "余额-数金皱眉": "waiting",
    "余额-钱袋满溢": "review",
    "是啊，吃什么": "waiting",
    "深度思考碎碎念": "waiting"
  },
  "actions": [
    {
      "key": "idle",
      "label": "待机眨眼"
    },
    {
      "key": "waving",
      "label": "挥手打招呼"
    },
    {
      "key": "jumping",
      "label": "悬停招手"
    },
    {
      "key": "work",
      "label": "敲键盘"
    },
    {
      "key": "review",
      "label": "拍手庆祝"
    },
    {
      "key": "waiting",
      "label": "歪头等待"
    },
    {
      "key": "failed",
      "label": "低头鼓劲"
    },
    {
      "key": "runRight",
      "label": "向右奔跑"
    },
    {
      "key": "runLeft",
      "label": "向左奔跑"
    }
  ]
},
  };

  function spriteFor(pack) {
    if (!pack) return null;
    if (pack.sprite && pack.sprite.sequences) return pack.sprite;
    return LEGACY[pack.id] || null;
  }

  const api = { spriteFor, LEGACY };
  root.PetLib = root.PetLib || {};
  root.PetLib.legacyPack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
