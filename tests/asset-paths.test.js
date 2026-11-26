const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 打包后页面就在资源根目录，任何 '../' 都会跳出根，AssetServer 直接 404。
// 开发期 renderer/ 与 characters/ 同级，所以源码里保留 '../characters/' 是对的；
// 必须由构建脚本在复制时改写成根相对路径。
test('wails-prepare 把 characters 路径改写成根相对', () => {
  const src = read('tools/wails-prepare.js');
  assert.match(src, /s\.split\('\.\.\/characters\/'\)\.join\('characters\/'\)/,
    '构建脚本应去掉 characters 路径的前导 ../，否则打包后封面与动画会 404');
});

test('构建脚本的路径改写覆盖所有会拼 characters 的前端文件', () => {
  const src = read('tools/wails-prepare.js');
  const rewriteTargets = src.slice(src.indexOf('rewrite(\'index.html\')'));
  for (const f of ['index.html', 'pet.js']) {
    assert.ok(rewriteTargets.includes(`rewrite('${f}')`), `${f} 应参与路径改写`);
  }
  // features 目录整体复制，需要逐个改写其中含 characters 的文件
  assert.match(src, /features[\s\S]*rewrite|rewrite[\s\S]*features/,
    'features 下的文件同样需要改写 characters 路径');
});
