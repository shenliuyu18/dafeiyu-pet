'use strict';

// 打包脚本：node tools/build.js [--qoder] [--dir] [--out=目录]
//   默认    打标准版「大肥鱼桌宠」（不含 Qoder 白饭账本，不需要装 Qoder）
//   --qoder 打「大肥鱼桌宠·适配Qoder版」（含白饭账本 / 套餐提醒；package.json 注入 qoder:true）
//   --dir   只出免安装目录（win-unpacked），不打 NSIS 安装包
//   --out   输出目录（默认 dist；建议指向项目外的路径，避免工作区索引/杀软锁目录导致 EPERM）
// 用配置文件透传中文参数，避开 npm 脚本经 cmd.exe 的编码坑。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const qoder = args.includes('--qoder');
const dir = args.includes('--dir');
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice('--out='.length) : 'dist';

const pkg = require('../package.json');
const config = JSON.parse(JSON.stringify(pkg.build || {}));
config.directories = { ...(config.directories || {}), output: out };

if (qoder) {
  config.appId = 'com.dafeiyu.desktop-pet.qoder';
  config.productName = '大肥鱼桌宠·适配Qoder版';
  // win 级 artifactName 优先于顶层，两处都要覆盖
  config.artifactName = 'dafeiyu-pet-qoder-${version}-setup.${ext}';
  config.win = { ...(config.win || {}), artifactName: 'dafeiyu-pet-qoder-${version}-setup.${ext}' };
  // name 决定 NSIS 默认安装目录（productName 含中文时会回退到 name）与默认数据目录，
  // 两版必须不同，否则安装/卸载/数据会互相覆盖
  config.extraMetadata = { ...(config.extraMetadata || {}), qoder: true, name: 'dafeiyu-desktop-pet-qoder' };
  config.nsis = { ...(config.nsis || {}), shortcutName: '大肥鱼桌宠·适配Qoder版' };
  // usage.js 只有 Qoder 版需要（标准版不包含任何 Qoder 相关内容）
  config.files = [...(config.files || []), 'usage.js'];
}

// 配置文件放在项目根目录：electron-builder 对配置里的相对路径（files/icon 等）按项目根解析
const cfgPath = path.join(__dirname, '..', '.build-config.json');
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

console.log(`[build] ${qoder ? '适配Qoder版' : '标准版'}${dir ? '（免安装目录）' : ''} -> ${out}`);

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
