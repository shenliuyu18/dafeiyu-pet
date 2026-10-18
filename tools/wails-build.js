'use strict';

// Wails 构建：准备前端 → wails build -nsis → 拷贝安装包到 dist
// 用法：
//   node tools/wails-build.js [--install]                 完整版（原始素材）
//   node tools/wails-build.js --lite [--install]          Lite 版（压缩素材）
//   node tools/wails-build.js --lite --rebuild-assets     强制重新生成 Lite 素材
// 完整版素材始终原字节打包（store），Lite 素材由 tools/build-lite-assets.py 生成。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync, spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const wailsDir = path.join(root, 'wails');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const lite = process.argv.includes('--lite');
const doInstall = process.argv.includes('--install');
const rebuildAssets = process.argv.includes('--rebuild-assets');
const productName = lite ? '大肥鱼桌宠 Lite' : '大肥鱼桌宠';
const outputName = lite ? 'dafeiyu-pet-lite' : 'dafeiyu-pet';
const numericVersion = (() => {
  const parts = String(version).split('-')[0].split('.').map((x) => parseInt(x, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join('.');
})();

// 同步 Go 版本
let mainGo = fs.readFileSync(path.join(wailsDir, 'main.go'), 'utf8');
mainGo = mainGo.replace(/var Version = "[^"]*"/, `var Version = "${version}"`);
fs.writeFileSync(path.join(wailsDir, 'main.go'), mainGo);

// 临时切换 wails.json 的产物名/产品名；构建结束（无论成败）恢复
const cfgPath = path.join(wailsDir, 'wails.json');
const originalCfg = fs.readFileSync(cfgPath, 'utf8');
const cfg = JSON.parse(originalCfg);
cfg.name = outputName;
cfg.outputfilename = outputName;
cfg.info = cfg.info || {};
cfg.info.productName = productName;
cfg.info.productVersion = numericVersion;
cfg.info.comments = lite ? 'Wails + WebView2 Lite 版（素材压缩）' : 'Wails + WebView2 版';
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

// 本机工具链路径（用户级安装）
const pathParts = (process.env.PATH || '').split(path.delimiter);
const add = (p) => { if (p && fs.existsSync(p) && !pathParts.includes(p)) pathParts.unshift(p); };
add(path.join(process.env.LOCALAPPDATA || '', 'go-toolchain', 'go', 'bin'));
add(path.join(process.env.LOCALAPPDATA || '', 'gopath', 'bin'));
add('C:\\Program Files (x86)\\NSIS');
// 不把本机源码/工具链绝对路径写进 exe；同时避免嵌入本机 VCS 信息
const goFlags = (process.env.GOFLAGS || '').split(/\s+/).filter(Boolean);
for (const flag of ['-trimpath', '-buildvcs=false']) {
  if (!goFlags.includes(flag)) goFlags.push(flag);
}
const env = {
  ...process.env,
  PATH: pathParts.join(path.delimiter),
  GOPATH: path.join(process.env.LOCALAPPDATA || os.homedir(), 'gopath'),
  GOPROXY: 'https://goproxy.cn,direct',
  GOSUMDB: 'off',
  GOFLAGS: goFlags.join(' '),
};
const wails = path.join(process.env.LOCALAPPDATA || '', 'gopath', 'bin', 'wails.exe');
const cli = fs.existsSync(wails) ? wails : 'wails';

function restoreConfig() {
  fs.writeFileSync(cfgPath, originalCfg);
}
function fail(msg, code) {
  restoreConfig();
  if (msg) console.error(msg);
  process.exit(code || 1);
}

console.log(`[wails] ${productName} · 版本 ${version}（Windows 文件版本 ${numericVersion}）`);

try {
  if (lite) {
    const liteDir = path.join(root, 'assets-lite');
    if (rebuildAssets || !fs.existsSync(liteDir)) {
      console.log('[wails] 生成 Lite 压缩素材…');
      const r = spawnSync('python', [path.join(root, 'tools', 'build-lite-assets.py')], { stdio: 'inherit', cwd: root, env });
      if (r.status !== 0) fail('[wails] Lite 素材生成失败');
    }
  }
  const prep = spawnSync(process.execPath, [path.join(root, 'tools', 'wails-prepare.js'), ...(lite ? ['--lite'] : [])], { stdio: 'inherit', cwd: root });
  if (prep.status !== 0) fail('[wails] 前端准备失败');

  const buildArgs = ['build', '-nsis', '-installscope', 'user', '-webview2', 'download', '-clean'];
  if (lite) buildArgs.push('-ldflags', '-X main.Variant=lite');
  let build = spawnSync(cli, buildArgs, { stdio: 'inherit', cwd: wailsDir, env });
  if (build.status !== 0) {
    console.warn('[wails] 清理构建目录失败（文件被占用），改用不清理构建重试…');
    build = spawnSync(cli, buildArgs.filter((a) => a !== '-clean'), { stdio: 'inherit', cwd: wailsDir, env });
  }
  if (build.status !== 0) fail('[wails] 构建失败');

  const builtExe = path.join(wailsDir, 'build', 'bin', `${outputName}.exe`);
  const builtInstaller = path.join(wailsDir, 'build', 'bin', `${outputName}-amd64-installer.exe`);
  if (!fs.existsSync(builtInstaller)) fail(`[wails] 未找到 NSIS 安装包: ${builtInstaller}`);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const outInstaller = path.join(dist, `${outputName}-${version}-setup.exe`);
  fs.copyFileSync(builtInstaller, outInstaller);
  console.log(`[wails] exe  ${fs.statSync(builtExe).size.toLocaleString()} B`);
  console.log(`[wails] 安装包 ${fs.statSync(outInstaller).size.toLocaleString()} B -> ${outInstaller}`);

  if (doInstall) {
    const installDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', productName);
    const installedExe = path.join(installDir, `${outputName}.exe`);
    try {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*\\Programs\\${productName}\\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ], { stdio: 'ignore' });
    } catch { /* 没运行就跳过 */ }
    console.log(`[wails] 静默安装到本机（${productName}）…`);
    const r = spawnSync('cmd.exe', ['/c', 'start', '/wait', '', outInstaller, '/S'], { stdio: 'inherit' });
    console.log('[wails] 安装器退出码:', r.status);
    if (fs.existsSync(installedExe)) {
      spawn(installedExe, [], { detached: true, stdio: 'ignore' }).unref();
      console.log('[wails] 已启动:', installedExe);
    }
  }
} finally {
  restoreConfig();
}
