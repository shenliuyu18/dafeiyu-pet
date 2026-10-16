'use strict';

// 打包后裁剪 Electron 运行时里本应用用不到的组件（减小安装体积）：
//   dxcompiler.dll / dxil.dll      —— WebGPU (Dawn) 的 DXIL 着色器编译
//   vk_swiftshader* / vulkan-1.dll —— 软件 Vulkan（WebGPU / 无 GPU 时的 WebGL 回退）
// 本桌宠只用 CSS 动画 + VP9-alpha 视频 + D3D11/ANGLE 合成（d3dcompiler_47.dll 保留，不能删），
// 上述组件不会被加载。若日后要用 WebGL/WebGPU，需要把对应文件放回去。

const fs = require('node:fs');
const path = require('node:path');

const REMOVE = ['dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'];

exports.default = async function afterPack(context) {
  let freed = 0;
  for (const f of REMOVE) {
    const p = path.join(context.appOutDir, f);
    try {
      freed += fs.statSync(p).size;
      fs.rmSync(p, { force: true });
    } catch {
      /* 不存在就跳过 */
    }
  }
  console.log(`[afterpack] 裁剪运行时冗余文件 ${(freed / 1048576).toFixed(1)}MB -> ${context.appOutDir}`);
};
