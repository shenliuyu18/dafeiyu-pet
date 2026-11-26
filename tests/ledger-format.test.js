const test = require('node:test');
const assert = require('node:assert/strict');
const { ledgerDiagText } = require('../renderer/features/ledger-format.js');

test('账本诊断文本包含状态与错误码', () => {
  const t = ledgerDiagText({ provider: 'deepseek', available: true, errorCode: 'E401', httpStatus: 401, latencyMs: 12 });
  assert.match(t, /状态：已连上/);
  assert.match(t, /错误码：E401/);
  assert.match(t, /HTTP：401/);
});
