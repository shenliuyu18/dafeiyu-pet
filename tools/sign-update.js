/* 可选：用 Ed25519 私钥给 SHA256SUMS.txt 签名。
 * 私钥通过环境变量 UPDATE_SIGNING_KEY 传入：PEM 文本的 base64（PKCS#8）。
 * 未配置时直接跳过，不阻断发布。
 */
const fs = require('fs');
const crypto = require('crypto');

const target = process.argv[2];
if (!target) {
  console.error('用法: node tools/sign-update.js <SHA256SUMS.txt>');
  process.exit(1);
}

const raw = (process.env.UPDATE_SIGNING_KEY || '').trim();
if (!raw) {
  console.log('[sign-update] 未配置 UPDATE_SIGNING_KEY，跳过签名');
  process.exit(0);
}

let key;
const text = Buffer.from(raw, 'base64').toString('utf8').trim();
try {
  key = text.includes('BEGIN')
    ? crypto.createPrivateKey(text)
    : crypto.createPrivateKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'pkcs8' });
} catch (e) {
  console.error('[sign-update] 私钥格式无效：' + e.message);
  process.exit(1);
}

const data = fs.readFileSync(target);
const sig = crypto.sign(null, data, key);
fs.writeFileSync(target + '.sig', sig.toString('base64') + '\n');
console.log(`[sign-update] 已生成 ${target}.sig`);