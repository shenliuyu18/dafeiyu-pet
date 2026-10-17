'use strict';

// 打包后自动安装到开发机：关闭正在运行的桌宠 → 静默安装最新构建 → 重新启动
// 用法：node tools/install-local.js [安装包路径]
//   npm run dist-install  = 打包 + 本机安装

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn, execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const candidate = path.join(root, 'dist', `dafeiyu-pet-${pkg.version}-setup.exe`);
const installer = process.argv[2] ? path.resolve(process.argv[2]) : candidate;

if (!fs.existsSync(installer)) {
  console.error('[install] 找不到安装包:', installer);
  process.exit(1);
}

// 只关闭安装目录里的桌宠进程（不碰开发实例）
const ps = [
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like '*\Programs\dafeiyu-desktop-pet\*' }",
  'foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }',
].join('; ');
try {
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
} catch {
  /* 没有运行中的实例就算了 */
}

console.log('[install] 正在静默安装:', installer);
const r = spawnSync('cmd.exe', ['/c', 'start', '/wait', '', installer, '/S'], { stdio: 'inherit' });
console.log('[install] 安装器退出码:', r.status === null ? 'unknown' : r.status);

const installDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', pkg.name);
const exe = path.join(installDir, '大肥鱼桌宠.exe');
if (fs.existsSync(exe)) {
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  console.log('[install] 已安装并重新启动:', exe);
} else {
  console.log('[install] 安装完成，但没找到可执行文件，请手动启动目录:', installDir);
}
