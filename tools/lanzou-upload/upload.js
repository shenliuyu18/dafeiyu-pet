#!/usr/bin/env node
'use strict';

/**
 * 蓝奏云半自动上传辅助：
 * - 使用独立 Edge profile，不读取、不打印、不保存账号密码或 Cookie
 * - 首次运行在打开的浏览器里手动登录蓝奏云；之后该 profile 会保留登录态
 * - 登录后进入目标文件夹，回到终端按 Enter，再在网页点击“上传”
 * - Playwright 拦截文件选择器，自动一次性填入完整版和 Lite 版安装包
 *
 * 用法：
 *   node tools/lanzou-upload/upload.js <完整版安装包> <Lite安装包>
 *   npm run lanzou:upload -- dist/dafeiyu-pet-1.4.2-setup.exe dist/dafeiyu-pet-lite-1.4.2-setup.exe
 *   node tools/lanzou-upload/upload.js --check   # 仅检查 Edge/网页可达性，不登录
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { chromium } = require('playwright-core');

const LOGIN_URL = 'https://pc.woozooo.com/';
const SHARE_URL = 'https://wwaql.lanzouu.com/b01i5xmkri';
const PASSWORD = '5meo';
const PROFILE_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'dafeiyu-lanzou-profile');

const EDGE_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

function findEdge() {
  const found = EDGE_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('找不到 Microsoft Edge，请先安装 Edge 或修改 EDGE_CANDIDATES。');
  return found;
}

function usage() {
  console.log(`
蓝奏云半自动上传

用法：
  node tools/lanzou-upload/upload.js <完整版安装包> <Lite安装包>
  node tools/lanzou-upload/upload.js --check

示例：
  node tools/lanzou-upload/upload.js dist/dafeiyu-pet-1.4.2-setup.exe dist/dafeiyu-pet-lite-1.4.2-setup.exe

说明：
  · 首次运行会打开独立 Edge；请在里面登录蓝奏云，并进入目标文件夹。
  · 本脚本不会读取、打印或保存密码、Cookie 或登录令牌。
  · 蓝奏云目录：${SHARE_URL}  密码：${PASSWORD}
`);
}

function parseFiles(argv) {
  const files = argv.filter((a) => !a.startsWith('-'));
  if (files.length !== 2) {
    throw new Error('需要恰好两个安装包路径（完整版 + Lite）。使用 --help 查看用法。');
  }
  for (const file of files) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`文件不存在：${file}`);
    if (!/\.exe$/i.test(file)) throw new Error(`不是 exe 安装包：${file}`);
    const base = path.basename(file).toLowerCase();
    if (!base.startsWith('dafeiyu-pet') || !base.includes('-setup')) {
      throw new Error(`文件名不像大肥鱼安装包：${file}`);
    }
  }
  return files.map((file) => path.resolve(file));
}

async function check() {
  const edge = findEdge();
  console.log(`[check] Edge: ${edge}`);
  const browser = await chromium.launch({ executablePath: edge, headless: true });
  try {
    const page = await browser.newPage();
    const res = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`[check] ${LOGIN_URL} -> HTTP ${res ? res.status() : '?'} · ${await page.title()}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) return usage();
  if (argv.includes('--check')) return check();

  const files = parseFiles(argv);
  const edge = findEdge();
  console.log('[lanzou] 安装包：');
  for (const file of files) console.log(`  · ${path.basename(file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MiB)`);
  console.log(`[lanzou] 独立浏览器配置：${PROFILE_DIR}`);
  console.log('[lanzou] 请只在这个独立窗口登录；脚本不会读取登录态。\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: edge,
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.bringToFront();

    console.log('① 在打开的 Edge 中登录蓝奏云。');
    console.log(`② 进入要上传的文件夹（${SHARE_URL}，密码 ${PASSWORD} 对应的分享目录）。`);
    await ask('   登录并进入目标文件夹后，按 Enter 继续…');

    let chosen = false;
    const attach = (p) => {
      p.on('filechooser', async (chooser) => {
        if (chosen) return;
        chosen = true;
        try {
          await chooser.setFiles(files);
          console.log(`\n[lanzou] 已自动填入 ${files.length} 个安装包，等待网页上传完成。`);
        } catch (err) {
          console.error(`\n[lanzou] 填入文件失败：${err.message}`);
          chosen = false;
        }
      });
    };
    context.pages().forEach(attach);
    context.on('page', attach);

    console.log('\n③ 现在请在网盘网页点击“上传 / 添加文件”按钮；脚本会自动选择这两个安装包。');
    await ask('   上传完成后，按 Enter 关闭脚本…');
    console.log('[lanzou] 已退出。请确认网盘文件列表和分享链接都已更新。');
  } finally {
    rl.close();
    await context.close();
  }
}

main().catch((err) => {
  console.error(`[lanzou] ${err.message}`);
  process.exitCode = 1;
});
