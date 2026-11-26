'use strict';

// 直接用本机 Edge 打开 renderer/index.html，覆盖真实脚本加载、交互与布局；不启动 Wails。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'renderer', 'index.html')).href;
const SOURCES = ['deepseek', 'moonshot', 'siliconflow', 'openai', 'claude'];
const ISSUE_TIMEOUT = 15000;

function findEdge() {
  const searched = [];
  const add = (candidate, source) => {
    if (!candidate) return;
    const executable = candidate.trim().replace(/^"(.*)"$/, '$1');
    if (searched.some((item) => item.path === executable)) return;
    searched.push({ path: executable, source });
    try {
      if (fs.statSync(executable).isFile()) return executable;
    } catch { /* 继续尝试其他常见位置 */ }
    return '';
  };

  for (const name of ['EDGE_PATH', 'EDGE_EXECUTABLE_PATH', 'MSEDGE_PATH']) {
    const found = add(process.env[name], name);
    if (found) return found;
  }

  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    process.env.LOCALAPPDATA,
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].filter(Boolean);
  for (const root of roots) {
    for (const channel of ['Microsoft\\Edge\\Application', 'Microsoft\\Edge Beta\\Application', 'Microsoft\\Edge Dev\\Application']) {
      const found = add(path.join(root, channel, 'msedge.exe'), '常见安装路径');
      if (found) return found;
    }
  }

  const detail = searched.map((item) => `  - ${item.path}（${item.source}）`).join('\n');
  throw new Error(`未找到 Microsoft Edge。请安装 Edge，或设置 EDGE_PATH / EDGE_EXECUTABLE_PATH / MSEDGE_PATH 指向 msedge.exe。已检查：\n${detail}`);
}

async function assertNoUnexpectedOverflow(page, label, opts) {
  const checkPage = !opts || opts.checkPage !== false;
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const settings = document.getElementById('settings');
    const settingsBody = settings && settings.querySelector('.set-body');
    const rect = settings && settings.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      root: { width: root.scrollWidth, height: root.scrollHeight, clientWidth: root.clientWidth, clientHeight: root.clientHeight },
      body: { width: body.scrollWidth, height: body.scrollHeight, clientWidth: body.clientWidth, clientHeight: body.clientHeight },
      settings: rect && {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: settings.scrollWidth, clientWidth: settings.clientWidth,
        height: settings.scrollHeight, clientHeight: settings.clientHeight,
      },
      settingsBody: settingsBody && {
        width: settingsBody.scrollWidth, clientWidth: settingsBody.clientWidth,
        height: settingsBody.scrollHeight, clientHeight: settingsBody.clientHeight,
      },
      // 气泡贴近窗口下沿时本来就会伸出窗口（Region 会裁掉多余额外部分），
      // 这会让 root/body 的 scrollSize 变大，属于既有行为，不该当成布局回归。
      bubbleOutOfViewport: (() => {
        const b = document.getElementById('bubble');
        if (!b || !b.classList.contains('show')) return false;
        const r = b.getBoundingClientRect();
        return r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
      })(),
    };
  });

  for (const name of ['root', 'body']) {
    const item = metrics[name];
    if (!checkPage || metrics.bubbleOutOfViewport) continue;
    assert.ok(item.width <= item.clientWidth + 1, `${label} ${name} 横向溢出：${item.width} > ${item.clientWidth}`);
    assert.ok(item.height <= item.clientHeight + 1, `${label} ${name} 纵向溢出：${item.height} > ${item.clientHeight}`);
  }
  if (metrics.settings) {
    const rect = metrics.settings;
    assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= metrics.viewport.width + 1 && rect.bottom <= metrics.viewport.height + 1,
      `${label} 设置面板超出视口：${JSON.stringify(rect)}，视口 ${metrics.viewport.width}x${metrics.viewport.height}`);
    assert.ok(rect.width <= rect.clientWidth + 1, `${label} 设置面板横向溢出：${rect.width} > ${rect.clientWidth}`);
    assert.ok(metrics.settingsBody.width <= metrics.settingsBody.clientWidth + 1,
      `${label} 设置内容横向溢出：${metrics.settingsBody.width} > ${metrics.settingsBody.clientWidth}`);
    // set-body 的纵向滚动是长页面的预期行为；面板本身必须完整夹在视口内。
  }
  console.log(`[smoke] ${label}：无意外页面溢出，设置内容纵向滚动 ${metrics.settingsBody.height - metrics.settingsBody.clientHeight}px`);
}

async function main() {
  const executablePath = findEdge();
  const browserIssues = [];
  let browser;
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    });
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    // 烟雾测试只读本地文件；显式阻止页面发出任何 HTTP(S) 请求。
    await context.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    page.setDefaultTimeout(ISSUE_TIMEOUT);
    page.on('pageerror', (error) => browserIssues.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const location = message.location();
        browserIssues.push(`console error: ${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`);
      }
    });
    await page.addInitScript(() => {
      window.__rendererSmokeReady = false;
      window.addEventListener('pet-api-ready', () => { window.__rendererSmokeReady = true; }, { once: true });
    });

    console.log(`[smoke] Edge: ${executablePath}`);
    console.log(`[smoke] 页面: ${PAGE_URL}`);
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__rendererSmokeReady === true || Number.isFinite(window.__firstFrameMs));
    await page.locator('#hit').waitFor({ state: 'visible' });
    await assertNoUnexpectedOverflow(page, '初始化');

    const accessibility = await page.evaluate(() => ({
      hitTabIndex: document.getElementById('hit').tabIndex,
      menuRole: document.getElementById('menu').getAttribute('role'),
      menuLabel: document.getElementById('menu').getAttribute('aria-label'),
      settingsRole: document.getElementById('settings').getAttribute('role'),
      settingsLabel: document.getElementById('settings').getAttribute('aria-label'),
      pickerRole: document.getElementById('picker').getAttribute('role'),
      pickerLabel: document.getElementById('picker').getAttribute('aria-label'),
    }));
    assert.equal(accessibility.hitTabIndex, 0, '#hit 应可通过键盘聚焦');
    assert.deepEqual(accessibility, {
      hitTabIndex: 0,
      menuRole: 'menu',
      menuLabel: '桌宠菜单',
      settingsRole: 'dialog',
      settingsLabel: '设置',
      pickerRole: 'dialog',
      pickerLabel: '选个动作',
    });

    const css = fs.readFileSync(path.join(ROOT, 'renderer', 'style.css'), 'utf8');
    assert.match(css, /:focus-visible\s*\{/, '缺少键盘焦点样式');
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/, '缺少减少动态效果样式');

    await page.locator('#hit').evaluate((hit) => hit.addEventListener('click', () => { hit.dataset.smokeClicks = String(Number(hit.dataset.smokeClicks || 0) + 1); }));
    await page.locator('#hit').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#hit').getAttribute('data-smoke-clicks'), '2', 'Enter / Space 应触发 #hit 点击');

    await page.locator('#hit').focus();
    await page.keyboard.press('Shift+F10');
    await page.locator('#menu.show').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.matches('#menu button')), true, '键盘打开菜单后应聚焦菜单项');
    await page.keyboard.press('Escape');
    await page.locator('#menu.show').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hit', 'Escape 关闭菜单后应返回 #hit');

    // 面板要等主进程扩 Region 才显示；这段等待期间按 Esc 必须能撤销，
    // 否则用户放弃后面板仍会弹出来并抢焦点。
    // 人为把 setPanel 拖慢 400ms，稳定复现「等待中」这个窗口。
    await page.evaluate(() => {
      window.__panelCalls = [];
      const original = api.setPanel;
      api.setPanel = (open) => {
        window.__panelCalls.push(open);
        return new Promise((resolve) => setTimeout(() => resolve(original.call(api, open)), open ? 400 : 0));
      };
    });
    await page.evaluate(() => { void openMenu(60, 60); });
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => !!document.querySelector('#menu.show')), false, 'Esc 应取消仍在等待中的菜单打开');
    // 不论取消发生在字体等待期还是 Region 扩展之后，最后一次调用都必须是「收回」。
    // 只看尾部而不比对完整顺序，避免字体就绪时机不同导致断言时好时坏。
    assert.equal(await page.evaluate(() => window.__panelCalls.at(-1)), null, '取消后 Region 必须处于收回状态');
    assert.equal(await page.evaluate(() => window.__panelCalls.includes(true)), true, '应观察到 Region 曾被扩开');

    // 关键回归：把字体等待拉长到 300ms，让取消必然落在 ensurePanelOpen 的字体等待之后、
    // setPanel(true) 之前。此前这种时序会先 cancel 出 null，再被后到的 true 覆盖，Region 永久整窗。
    await page.evaluate(() => {
      window.__panelCalls = [];
      const fonts = document.fonts;
      const originalReady = fonts.ready;
      Object.defineProperty(fonts, 'ready', {
        configurable: true,
        get: () => new Promise((resolve) => setTimeout(() => resolve(originalReady), 300)),
      });
    });
    await page.evaluate(() => { void openMenu(60, 60); });
    await page.waitForTimeout(40);
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => !!document.querySelector('#menu.show')), false, '字体等待期取消后不应再显示菜单');
    const fontWaitCalls = await page.evaluate(() => window.__panelCalls);
    assert.notEqual(fontWaitCalls.at(-1), true, `取消后不应把 Region 留在扩开状态，实际调用 ${JSON.stringify(fontWaitCalls)}`);

    await page.locator('#hit').focus();
    await page.keyboard.press('Shift+F10');
    await page.locator('#menu.show').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#menu.show').waitFor({ state: 'hidden' });

    // 按键打开菜单后，Chromium 还会再派发一次 contextmenu；必须忽略，
    // 否则菜单位置会被二次定位或被判成「点到外面」而立刻关闭。
    await page.evaluate(() => {
      window.__menuOpens = 0;
      const original = window.openMenu;
      window.openMenu = (...args) => { window.__menuOpens += 1; return original.apply(null, args); };
    });
    await page.locator('#hit').focus();
    await page.keyboard.press('ContextMenu');
    await page.locator('#menu.show').waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__menuOpens), 1, '按键打开菜单后不应被随后的 contextmenu 再次打开');
    assert.equal(await page.evaluate(() => !!document.querySelector('#menu.show')), true, '按键打开的菜单不应一闪即关');
    await page.locator('#menu button[data-act="settings"]').click();
    await page.locator('#settings.show').waitFor({ state: 'visible' });
    await page.locator('#set-close').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.matches('#set-home .set-nav')), true, '设置面板 Tab 应循环到首个控件');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'set-close', '设置面板 Shift+Tab 应循环到末个控件');
    await page.keyboard.press('Escape');
    await page.locator('#settings.show').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'hit', 'Escape 关闭设置后应返回 #hit');

    await page.locator('#hit').focus();
    await page.keyboard.press('Shift+F10');
    await page.locator('#menu.show').waitFor({ state: 'visible' });
    await page.locator('#menu button[data-act="settings"]').click();
    await page.locator('#settings.show').waitFor({ state: 'visible' });
    await page.locator('#set-home .set-nav[data-page="ledger"]').click();
    await page.locator('.set-page[data-page="ledger"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#set-home .set-nav[data-page="ledger"]').getAttribute('aria-current'), 'page', '当前设置导航缺少 aria-current');
    assert.equal(await page.locator('#set-home .set-nav[data-page="look"]').getAttribute('aria-current'), null, '非当前设置导航不应有 aria-current');

    const actualSources = await page.locator('#set-ledger-src button').evaluateAll((buttons) => buttons.map((button) => button.dataset.ledgerSrc));
    assert.deepEqual(actualSources, SOURCES, '白饭账本来源按钮数量或顺序不正确');
    for (const source of SOURCES) {
      await page.locator(`#set-ledger-src button[data-ledger-src="${source}"]`).waitFor({ state: 'visible' });
    }
    console.log(`[smoke] 五个来源: ${actualSources.join(', ')}`);

    const pressed = await page.locator('#set-ledger-src button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
    assert.deepEqual(pressed, ['true', 'false', 'false', 'false', 'false'], '账本来源分段选择未同步 aria-pressed');

    await page.locator('#set-ledger-src button[data-ledger-src="moonshot"]').click();
    await page.waitForFunction(() => document.querySelector('#set-ledger-src button[data-ledger-src="moonshot"]').classList.contains('on'));
    const pressedAfterSwitch = await page.locator('#set-ledger-src button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
    assert.deepEqual(pressedAfterSwitch, ['false', 'true', 'false', 'false', 'false'], '切换账本来源后 aria-pressed 未同步');

    // 首次使用要能一眼找到填 Key 的入口：独立区块 + 状态徽标 + 实心主按钮文案
    const keyEntry = await page.evaluate(() => {
      const btn = document.getElementById('set-key-btn');
      const badge = document.getElementById('set-key-badge');
      const entry = btn && btn.closest('.key-entry');
      const style = btn && getComputedStyle(btn);
      return {
        inKeyEntry: !!entry,
        hasHint: !!entry && !!entry.querySelector('.key-entry-hint'),
        badge: badge && badge.textContent.trim(),
        label: btn && btn.querySelector('.klabel').textContent.trim(),
        action: btn && btn.querySelector('.kstate').textContent.trim(),
        // 实心强调：纯色背景或渐变背景，且不是白底/透明
        solid: !!style && (
          (style.backgroundImage && style.backgroundImage !== 'none') ||
          (style.backgroundColor !== 'rgb(255, 255, 255)' && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')
        ),
      };
    });
    assert.equal(keyEntry.inKeyEntry, true, 'Key 按钮应包在独立区块里');
    assert.equal(keyEntry.hasHint, true, 'Key 区块应带一句用途说明');
    assert.equal(keyEntry.badge, '待填写', `未配置 Key 时徽标应为「待填写」，实际 ${keyEntry.badge}`);
    assert.match(keyEntry.label, /填写.*API Key/, `按钮文案应明确是填写 Key，实际 ${keyEntry.label}`);
    assert.equal(keyEntry.action, '去填写', `未配置时右侧应提示「去填写」，实际 ${keyEntry.action}`);
    assert.equal(keyEntry.solid, true, 'Key 按钮应为实心强调色，不能是白底');

    // Key 区块变高后，设置面板本身仍要完整夹在视口内（内容纵向滚动由 .set-body 承担，
    // 不在断言范围内；气泡贴近窗口下沿时撑开 body 是既有现象，与本区块无关）。
    const panelFits = await page.evaluate(() => {
      const s = document.getElementById('settings');
      const r = s.getBoundingClientRect();
      const body = s.querySelector('.set-body');
      return {
        inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        noHorizontal: body.scrollWidth <= body.clientWidth + 1,
      };
    });
    assert.equal(panelFits.inViewport, true, '加入 Key 区块后设置面板仍应完整显示在窗口内');
    assert.equal(panelFits.noHorizontal, true, 'Key 区块不应引入横向滚动');

    // 省电待机时隐藏再恢复：视频必须继续保持暂停，否则会和 CSS 呼吸叠加、省电档失效。
    // 前面 Enter/Space 触发的单次动作最长可能挂十几秒，会挡住省电判定；先等它播完。
    await page.waitForFunction(() => typeof oneShotPlaying === 'undefined' || oneShotPlaying === false, null, { timeout: 20000 });
    const powerReady = await page.evaluate(() => {
      S.powerSave = 'on';
      S.onAC = false;
      S.powerKnown = true;
      S.lastInteract = Date.now() - 60000;
      applyPowerProfile();
      updatePowerIdle();
      return {
        idle: document.body.classList.contains('power-idle'),
        readyState: document.getElementById('petVid').readyState,
      };
    });
    assert.deepEqual(powerReady.idle, true, '始终省电 + 长时间未交互应进入省电待机');
    assert.ok(powerReady.readyState >= 2, `视频未就绪（readyState=${powerReady.readyState}），省电断言无意义`);
    await page.evaluate(async () => {
      const vid = document.getElementById('petVid');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 200));
    });
    const powerIdle = await page.evaluate(() => ({
      idle: document.body.classList.contains('power-idle'),
      paused: document.getElementById('petVid').paused,
    }));
    assert.deepEqual(powerIdle, { idle: true, paused: true }, '省电待机恢复可见后视频应保持暂停');
    const keyContext = await page.locator('#set-key-btn').evaluate((button) => {
      const card = button.closest('.set-card');
      return {
        provider: button.dataset.key,
        label: button.querySelector('.klabel').textContent.trim(),
        state: button.querySelector('.kstate').textContent.trim(),
        inLedgerCard: !!card && !!card.querySelector('#set-ledger-src button[data-ledger-src="moonshot"].on'),
      };
    });
    assert.deepEqual(keyContext, { provider: 'moonshot', label: '填写 Kimi API Key', state: '去填写', inLedgerCard: true }, '切换到 Kimi 后 Key 行上下文不正确');
    console.log(`[smoke] Kimi Key 行: ${keyContext.label} / ${keyContext.state}`);
    // 账本页已在前面单独校验过 Key 区块与设置面板尺寸：这里只量面板本身。
    // 此时桌宠可能正显示气泡，而气泡伸出窗口是既有行为，不该算成布局回归。
    await assertNoUnexpectedOverflow(page, '白饭账本', { checkPage: false });

    // 拖拽后立刻松手：若能取到渲染盒，它必须紧跟当前位置，不能沿用拖拽前的绝对坐标。
    // 注意：file:// 下 canvas 会被判定为跨域污染，alpha 采样失败会退化成只剩命中框，
    // 因此这里只校验「不崩、不脱节」，像素级换算由 tests/region-box.test.js 覆盖。
    const dragRegion = await page.evaluate(async () => {
      const hit = document.getElementById('hit');
      const ev = (type, x, y) => (type === 'mousedown' ? hit : document)
        .dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y }));
      const startPet = document.getElementById('pet').getBoundingClientRect();
      ev('mousedown', 200, 260);
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 12));
        ev('mousemove', 200 + i * 34, 260 + i * 10);
      }
      ev('mouseup', 540, 360);
      const pet = document.getElementById('pet').getBoundingClientRect();
      const boxes = window.__petHitBoxes(false) || [];
      const render = boxes.find((b) => !b.hit);
      return {
        moved: Math.abs(pet.left - startPet.left) > 100,
        hasHit: boxes.some((b) => b.hit),
        hasRender: !!render,
        insidePet: !!render && render.x + render.w / 2 > pet.left && render.x + render.w / 2 < pet.right,
        sample: render && { x: Math.round(render.x), petLeft: Math.round(pet.left) },
      };
    });
    assert.equal(dragRegion.moved, true, '拖拽应真的移动了形象');
    assert.equal(dragRegion.hasHit, true, '松手后命中框必须仍在');
    if (dragRegion.hasRender) {
      assert.equal(dragRegion.insidePet, true, `松手时渲染盒仍在旧位置：${JSON.stringify(dragRegion.sample)}`);
    }

    // 确认框必须是自绘面板（原生 confirm 标题是 wails.localhost，字体也跟不上设置）
    const confirmUi = await page.evaluate(async () => {
      const style = getComputedStyle(document.documentElement);
      const fontUi = style.getPropertyValue('--font-ui').trim();
      const p = askConfirm({ title: '卸载形象包', message: '确定卸载「测试娘」吗？', okText: '卸载', danger: true });
      // 首次展开要等字体落定（最长 300ms），用轮询代替固定等待
      for (let i = 0; i < 40; i++) {
        if (document.getElementById('confirm').classList.contains('show')) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const el = document.getElementById('confirm');
      const cs = getComputedStyle(el);
      const shown = !!el && el.classList.contains('show') && !el.classList.contains('hide');
      const ok = document.getElementById('confirm-ok');
      const result = {
        shown,
        role: el.getAttribute('role'),
        title: document.getElementById('confirm-title').textContent,
        msg: document.getElementById('confirm-msg').textContent,
        okText: ok.textContent,
        danger: ok.classList.contains('danger'),
        fontFamily: cs.fontFamily,
        expectedFont: fontUi.split(',')[0].replace(/["']/g, '').trim(),
        inViewport: (() => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
      };
      ok.click();
      result.confirmed = await p;
      await new Promise((r) => setTimeout(r, 250));
      result.hiddenAfter = document.getElementById('confirm').classList.contains('hide') || !document.getElementById('confirm').classList.contains('show');
      return result;
    });
    assert.equal(confirmUi.shown, true, '确认框应显示');
    assert.equal(confirmUi.role, 'alertdialog', '确认框应使用 alertdialog 语义');
    assert.equal(confirmUi.title, '卸载形象包');
    assert.equal(confirmUi.okText, '卸载');
    assert.equal(confirmUi.danger, true, '卸载按钮应为危险色');
    assert.equal(confirmUi.inViewport, true, '确认框应完整显示在窗口内');
    assert.equal(confirmUi.confirmed, true, '点确定应返回 true');
    assert.equal(confirmUi.hiddenAfter, true, '确认后应关闭');
    // 浏览器默认给 button 套系统 UI 字体；形象商店卡片按钮曾因此不跟随设置字体。
    const buttonFonts = await page.evaluate(() => {
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const probe = (cls, parentCls) => {
        const wrap = document.createElement('div');
        if (parentCls) wrap.className = parentCls;
        const b = document.createElement('button');
        if (cls) b.className = cls;
        wrap.appendChild(b);
        document.body.appendChild(wrap);
        const f = getComputedStyle(b).fontFamily;
        wrap.remove();
        return f;
      };
      return {
        body: bodyFont,
        storeAction: probe('', 'store-actions'),   // 商店卡片「使用 / 卸载」
        setGrid: probe('', 'set-grid'),            // 设置页分段按钮
        plain: probe(''),
      };
    });
    for (const key of ['storeAction', 'setGrid', 'plain']) {
      assert.equal(buttonFonts[key], buttonFonts.body,
        `${key} 按钮字体应跟随正文字体（应 ${buttonFonts.body}，实际 ${buttonFonts[key]}）`);
    }

    // 字体必须跟随全局设置：与设置面板的计算字体一致，说明用的是同一个 --font-ui
    const fontParity = await page.evaluate(() => ({
      confirm: getComputedStyle(document.getElementById('confirm')).fontFamily,
      settings: getComputedStyle(document.getElementById('settings')).fontFamily,
    }));
    assert.equal(fontParity.confirm, fontParity.settings,
      `确认框字体应与设置面板一致（都走 --font-ui）：confirm=${fontParity.confirm} settings=${fontParity.settings}`);

    // 开发期 renderer/ 与 characters/ 同级，../characters/ 是正确的；
    // 打包后必须被改写成根相对，否则跳出资源根导致商店卡片裂图。
    // 这里校验构建产物，而不是预览页面的运行时值。
    const distFeatures = path.join(ROOT, 'wails', 'frontend', 'dist', 'features');
    if (fs.existsSync(distFeatures)) {
      const leaked = [];
      for (const f of fs.readdirSync(distFeatures)) {
        if (!f.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(distFeatures, f), 'utf8');
        if (src.includes('../characters/')) leaked.push(f);
      }
      assert.deepEqual(leaked, [], `构建产物仍含 ../characters/，打包后会裂图：${leaked.join(', ')}`);
    }

    // 留出一个短窗口，收集切换后触发的异步异常与 console error。
    await page.waitForTimeout(350);
    assert.equal(browserIssues.length, 0, `浏览器运行错误：\n${browserIssues.join('\n')}`);
    console.log('[smoke] 通过：无 pageerror / console error');
  } finally {
    if (browser) await browser.close();
    if (browserIssues.length) console.error(`[smoke] 收集到 ${browserIssues.length} 个浏览器错误：\n${browserIssues.join('\n')}`);
  }
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.stack || error.message}`);
  process.exitCode = 1;
});
