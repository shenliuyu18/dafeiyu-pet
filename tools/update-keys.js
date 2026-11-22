/* 生成更新验签用的 Ed25519 密钥对：
 * - UPDATE_SIGNING_KEY：私钥 PEM 的 base64，只放进 GitHub Secrets
 * - UPDATE_SIGNING_PUBKEY：公钥原始 32 字节的 base64，构建时注入程序
 */
const crypto = require('crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubRaw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');

console.log('UPDATE_SIGNING_KEY=' + Buffer.from(privPem).toString('base64'));
console.log('UPDATE_SIGNING_PUBKEY=' + pubRaw.toString('base64'));
console.log('\n私钥只保存到 GitHub Secrets；公钥随构建注入，可公开。');