'use strict';

// 打包脚本：node tools/build.js [--lite] [--dir] [--out=目录]
//   --lite  打简版（无 Qoder 白饭账本，package.json 注入 lite:true、改名叫「大肥鱼桌宠·简版」）
//   --dir   只出免安装目录（win-unpacked），不打 NSIS 安装包
//   --out   输出目录（默认 dist；建议指向项目外的路径，避免工作区索引/杀软锁目录导致 EPERM）
// 用配置文件透传中文参数，避开 npm 脚本经 cmd.exe 的编码坑。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const lite = args.includes('--lite');
const dir = args.includes('--dir');
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice('--out='.length) : 'dist';

const pkg = require('../package.json');
const config = JSON.parse(JSON.stringify(pkg.build || {}));
config.directories = { ...(config.directories || {}), output: out };

if (lite) {
  config.appId = 'com.dafeiyu.desktop-pet.lite';
  config.productName = '大肥鱼桌宠·简版';
  // win 级 artifactName 优先于顶层，两处都要覆盖
  config.artifactName = 'dafeiyu-pet-lite-${version}-setup.${ext}';
  config.win = { ...(config.win || {}), artifactName: 'dafeiyu-pet-lite-${version}-setup.${ext}' };
  // name 决定 NSIS 默认安装目录（productName 含中文时会回退到 name），
  // 两版必须不同，否则安装/卸载会互相覆盖
  config.extraMetadata = { ...(config.extraMetadata || {}), lite: true, name: 'dafeiyu-desktop-pet-lite' };
  config.nsis = { ...(config.nsis || {}), shortcutName: '大肥鱼桌宠·简版' };
}

// 配置文件放在项目根目录：electron-builder 对配置里的相对路径（files/icon 等）按项目根解析
const cfgPath = path.join(__dirname, '..', '.build-config.json');
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

console.log(`[build] ${lite ? '简版' : '完整版'}${dir ? '（免安装目录）' : ''} -> ${out}`);

const cli = require.resolve('electron-builder/cli.js');
const r = spawnSync(process.execPath, [cli, '--win', dir ? 'dir' : 'nsis', '--config', cfgPath], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

try {
  fs.unlinkSync(cfgPath);
} catch {
  /* 临时配置删不掉不影响结果 */
}

process.exit(r.status === null ? 1 : r.status);
