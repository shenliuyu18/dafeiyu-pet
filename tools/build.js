'use strict';

// 打包脚本：node tools/build.js [--dir] [--out=目录]
//   默认  打 NSIS 安装包（可改安装目录、建桌面/开始菜单快捷方式）
//   --dir 只出免安装目录（win-unpacked）
//   --out 输出目录（默认 dist；建议指向项目外的路径，避免工作区索引/杀软锁目录导致 EPERM）
// 用配置文件透传中文参数，避开 npm 脚本经 cmd.exe 的编码坑。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const dir = args.includes('--dir');
const outArg = args.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice('--out='.length) : 'dist';

const pkg = require('../package.json');
const config = JSON.parse(JSON.stringify(pkg.build || {}));
config.directories = { ...(config.directories || {}), output: out };

// 配置文件放在项目根目录：electron-builder 对配置里的相对路径（files/icon 等）按项目根解析
const cfgPath = path.join(__dirname, '..', '.build-config.json');
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

console.log(`[build] 大肥鱼桌宠 v${pkg.version}${dir ? '（免安装目录）' : ''} -> ${out}`);

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
