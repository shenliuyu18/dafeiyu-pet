'use strict';

// 开发调试工具：截图 / 真实鼠标链路验证
// 由主进程在带 --dev-shot / --dev-input 参数时调用

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { execFile } = require('node:child_process');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ps = (cmd) =>
  new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], (err, stdout) =>
      resolve({ err, out: String(stdout || '').trim() }),
    );
  });

async function captureScene(win, scene) {
  // 打包后 app 目录只读，截图落到临时目录
  const outDir = app.isPackaged
    ? path.join(app.getPath('temp'), 'dafeiyu-shots')
    : path.join(__dirname, '..', 'dev-shots');
  fs.mkdirSync(outDir, { recursive: true });

  await wait(1500);
  if (scene !== 'idle') {
    await win.webContents.executeJavaScript(`window.__devScene && window.__devScene(${JSON.stringify(scene)})`);
    await wait(1100);
  }
  await win.webContents.executeJavaScript('window.__freeze && window.__freeze(true)');

  const info = await win.webContents.executeJavaScript(`(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { win: { w: innerWidth, h: innerHeight }, pet: window.__petPos(), img: r('#petVid'),
      bubble: r('#bubble'), chip: r('#chip'), hit: r('#hit'), zzz: r('.zzz'), settings: r('#settings'),
      zzzAnim: getComputedStyle(document.querySelector('.zzz span')).animationName,
      imgLoaded: document.querySelector('#petVid').readyState > 0, anim: curAnim, animCount: (window.PET_ANIMS || []).length,
      scale: petScale, dock: S.dock, usageHidden: !!document.getElementById('menu-usage-btn').classList.contains('hide'),
      cls: document.getElementById('stage').className };
  })()`);
  console.log('LAYOUT', JSON.stringify(info));

  const wide = scene === 'settings';
  const rect = {
    x: Math.max(0, info.pet.x - (wide ? 340 : 60)),
    y: Math.max(0, info.pet.y - (wide ? 40 : 20)),
    width: wide ? 760 : 420,
    height: wide ? 470 : 400,
  };
  rect.width = Math.min(rect.width, info.win.w - rect.x);
  rect.height = Math.min(rect.height, info.win.h - rect.y);

  fs.writeFileSync(path.join(outDir, `${scene}-raw.png`), (await win.webContents.capturePage(rect)).toPNG());
  await win.webContents.executeJavaScript('document.body.classList.add("dev-bg")');
  await wait(350);
  fs.writeFileSync(path.join(outDir, `${scene}-bg.png`), (await win.webContents.capturePage(rect)).toPNG());
}

async function runDevShot(win, scene) {
  await captureScene(win, scene);
  win.destroy();
  require('electron').app.quit();
}

// 真实鼠标端到端验证：穿透判定 → 点击 → 拖拽
// 为安全起见先铺一块不透明"测试垫"窗口，万一事件真的穿透了，也只会落在这块垫子上
async function runInputTest(win) {
  const { app, BrowserWindow, screen } = require('electron');
  await wait(1500);

  await win.webContents.executeJavaScript(`
    window.__ev = { move: 0, down: 0, up: 0, lastDown: null, lastMove: null };
    document.addEventListener('mousemove', (e) => { window.__ev.move++; window.__ev.lastMove = [e.clientX, e.clientY, e.screenX, e.screenY]; }, true);
    document.addEventListener('mousedown', (e) => { window.__ev.down++; window.__ev.lastDown = [e.clientX, e.clientY, e.screenX, e.screenY]; }, true);
    document.addEventListener('mouseup', () => window.__ev.up++, true);
    'ok'
  `);

  const PET_START = { x: 420, y: 380 };
  const FISH = { x: PET_START.x + 150, y: PET_START.y + 214 };

  const guard = new BrowserWindow({
    x: 250,
    y: 330,
    width: 900,
    height: 620,
    frame: false,
    focusable: true,
    skipTaskbar: true,
    show: true,
    webPreferences: { contextIsolation: true },
  });
  await guard.loadURL(
    `data:text/html,<body style="margin:0;background:%23141d33;color:%236f86c9;font:600 15px system-ui;display:flex;align-items:center;justify-content:center">大肥鱼自动化测试垫</body>`,
  );
  guard.setAlwaysOnTop(true, 'normal');
  win.setAlwaysOnTop(true, 'screen-saver'); // 重新置顶，确保鱼窗压在测试垫之上
  await win.webContents.executeJavaScript(`applyScale(1, false); window.__freeze(true); window.__teleport(${PET_START.x}, ${PET_START.y});`);
  await wait(500);

  const before = await ps(
    'Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; "$($p.X),$($p.Y)"',
  );
  const mouse = (cmd) =>
    ps(`Add-Type -Namespace W -Name U -MemberDefinition '
      [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
      [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    '; ${cmd}`);

  const results = {};

  // 1) 光标远离鱼：应保持穿透
  await mouse(`[W.U]::SetCursorPos(60, 60)`);
  await wait(500);
  results.away = global.__petDiag();

  // 2) 光标移到鱼身上：应关闭穿透
  await mouse(`[W.U]::SetCursorPos(${FISH.x}, ${FISH.y})`);
  await wait(600);
  results.over = global.__petDiag();

  const petHwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString();
  const guardHwnd = guard.getNativeWindowHandle().readBigUInt64LE(0).toString();
  const hit = await ps(`
    Add-Type -Namespace W -Name P -MemberDefinition '
      [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
      [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
      [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
      [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
    ';
    $p = New-Object W.P+POINT; $p.X = ${FISH.x}; $p.Y = ${FISH.y};
    $h = [W.P]::WindowFromPoint($p);
    $root = [W.P]::GetAncestor($h, 2);
    "under=$h root=$root ex=$([W.P]::GetWindowLong($root, -20)) style=$([W.P]::GetWindowLong($root, -16))"`);
  console.log('INPUT hwnd pet=' + petHwnd + ' guard=' + guardHwnd + ' | ' + hit.out);

  // 3) 真实左键单击
  await mouse(`[W.U]::mouse_event(2,0,0,0,[System.UIntPtr]::Zero); Start-Sleep -Milliseconds 90; [W.U]::mouse_event(4,0,0,0,[System.UIntPtr]::Zero)`);
  await wait(400);
  results.afterClick = await win.webContents.executeJavaScript('window.__ev');

  // 4) 真实拖拽：按下 → 分步移动 → 抬起
  await mouse(`
    [W.U]::SetCursorPos(${FISH.x}, ${FISH.y}); Start-Sleep -Milliseconds 120;
    [W.U]::mouse_event(2,0,0,0,[System.UIntPtr]::Zero); Start-Sleep -Milliseconds 120;
    [W.U]::SetCursorPos(${FISH.x + 40}, ${FISH.y + 25}); Start-Sleep -Milliseconds 90;
    [W.U]::SetCursorPos(${FISH.x + 90}, ${FISH.y + 55}); Start-Sleep -Milliseconds 90;
    [W.U]::SetCursorPos(${FISH.x + 140}, ${FISH.y + 90}); Start-Sleep -Milliseconds 90;
    [W.U]::mouse_event(4,0,0,0,[System.UIntPtr]::Zero)`);
  await wait(400);
  results.afterDrag = await win.webContents.executeJavaScript('({ ev: window.__ev, pos: window.__petPos() })');

  // 5) 右键菜单 → 投喂：验证 渲染层菜单 → 主进程状态 → 回传动画 的整条链路
  await win.webContents.executeJavaScript(`window.__devScene('menu')`);
  await wait(250);
  const menuShown = await win.webContents.executeJavaScript(
    `document.getElementById('menu').classList.contains('show')`,
  );
  await win.webContents.executeJavaScript(`document.querySelector('#menu button[data-act="feed"]').click()`);
  await wait(300);
  const afterFeed = await win.webContents.executeJavaScript(
    `({ cls: document.getElementById('stage').className, menuShown: document.getElementById('menu').classList.contains('show') })`,
  );
  results.menu = { shown: menuShown, afterFeed };

  // 恢复现场
  const [ox, oy] = before.out.split(',').map((n) => parseInt(n, 10));
  if (Number.isFinite(ox) && Number.isFinite(oy)) await mouse(`[W.U]::SetCursorPos(${ox}, ${oy})`);
  guard.destroy();

  const moved = results.afterDrag.pos;
  const dx = moved.x - PET_START.x;
  const dy = moved.y - PET_START.y;

  console.log('INPUT away   ', JSON.stringify(results.away));
  console.log('INPUT over   ', JSON.stringify(results.over));
  console.log('INPUT click  ', JSON.stringify(results.afterClick));
  console.log('INPUT drag   ', JSON.stringify(results.afterDrag), 'delta', dx, dy);
  console.log('INPUT menu   ', JSON.stringify(results.menu));

  const ok =
    results.away.interactive === false &&
    results.over.interactive === true &&
    results.afterClick.down === 1 &&
    results.afterClick.up === 1 &&
    Math.abs(dx - 140) < 14 &&
    Math.abs(dy - 90) < 14 &&
    results.menu.shown === true &&
    results.menu.afterFeed.menuShown === false &&
    results.menu.afterFeed.cls.includes('eat');
  console.log('INPUT RESULT', ok ? 'PASS' : 'FAIL');

  win.destroy();
  app.quit();
}

module.exports = { runDevShot, runInputTest };
