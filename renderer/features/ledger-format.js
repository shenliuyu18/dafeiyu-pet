/*
 * 账本诊断文本格式化。纯函数，API_LABEL 不存在时用空表。
 */
(function (root) {
  'use strict';

const KEY_SOURCE_LABEL = {
  saved: '本机保存（DPAPI）',
  legacy: '旧版字段',
  env: '环境变量',
  '': '未配置',
};

function ledgerDiagText(l) {
  if (!l) return '还没有账单数据。';
  const lines = [];
  lines.push(`来源：${l.providerLabel || (typeof API_LABEL !== 'undefined' ? API_LABEL[l.provider] : '') || (typeof API_LABEL !== 'undefined' ? API_LABEL[l.source] : '') || l.source || '—'}`);
  lines.push(`Key：${KEY_SOURCE_LABEL[l.keySource] ?? l.keySource ?? '未配置'}`);
  lines.push(`状态：${l.pending ? '检测中' : (l.available ? '已连上' : '未连上')}`);
  if (l.errorCode) lines.push(`错误码：${l.errorCode}`);
  if (l.httpStatus) lines.push(`HTTP：${l.httpStatus}`);
  if (l.latencyMs) lines.push(`耗时：${l.latencyMs} ms`);
  if (l.lastOkAt) lines.push(`上次成功：${new Date(l.lastOkAt).toLocaleString()}`);
  if (l.updatedAt) lines.push(`本次检测：${new Date(l.updatedAt).toLocaleString()}`);
  if (l.error) lines.push(`错误：${l.error}`);
  if (l.errorHint) lines.push(`提示：${l.errorHint}`);
  return lines.join('\n');
}

  root.PetLib = root.PetLib || {};
  root.PetLib.ledgerFormat = { KEY_SOURCE_LABEL, ledgerDiagText };
  if (typeof module !== 'undefined' && module.exports) module.exports = { KEY_SOURCE_LABEL, ledgerDiagText };
})(typeof window !== 'undefined' ? window : globalThis);
