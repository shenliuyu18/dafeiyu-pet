/*
 * 表情包伪随机队列：每轮打乱后依次播放，避免新一轮首张与上一轮末张重复。
 * 抽出来之后可以脱离 DOM / 素材清单单独测试。
 */
(function (root) {
  'use strict';

  function shuffle(list, rng) {
    const rand = rng || Math.random;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  class MemeQueue {
    constructor(rng) {
      this.rng = rng || Math.random;
      this.buckets = new Map();
      this.last = '';
    }

    next(scene, build) {
      let q = this.buckets.get(scene);
      if (!q || !q.length) {
        q = shuffle(build(), this.rng);
        this.buckets.set(scene, q);
      }
      if (!q.length) return null;
      let item = q.shift();
      // 撞上上一张时优先在队内换一张；如果本轮刚好排到最后一张，
      // 重洗一轮并把撞车的这张挪到队尾，避免轮次边界连续重复。
      if (item.file === this.last) {
        if (!q.length) {
          q = shuffle(build(), this.rng).filter((x) => x.file !== this.last);
          this.buckets.set(scene, q);
          if (q.length) q.push(item);
        } else {
          q.push(item);
        }
        item = q.shift();
      }
      if (!item) return null;
      this.last = item.file;
      return item;
    }

    reset() {
      this.buckets.clear();
      this.last = '';
    }
  }

  const api = { shuffle, MemeQueue };
  root.PetLib = root.PetLib || {};
  root.PetLib.memeQueue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);