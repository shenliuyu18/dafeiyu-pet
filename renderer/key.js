'use strict';

const $ = (id) => document.getElementById(id);
let info = null;

function render(i) {
  info = i || info;
  if (!info) return;
  $('title').textContent = `配置 ${info.label} API Key`;
  $('hint').textContent = info.hint || '';
  $('status').textContent = info.hasKey ? '已配置 Key（重新输入可覆盖）' : '尚未配置';
  $('key').value = '';
  $('key').focus();
}

window.keyApi.info().then(render);
window.keyApi.onTarget(render);

$('save').addEventListener('click', async () => {
  const k = $('key').value.trim();
  if (!k) {
    $('status').textContent = '请先输入 API Key';
    return;
  }
  const r = await window.keyApi.save(k);
  if (r && r.ok) {
    $('status').textContent = '已保存 ✓';
    setTimeout(() => window.keyApi.close(), 700);
  } else {
    $('status').textContent = (r && r.error) || '保存失败';
  }
});

$('clear').addEventListener('click', async () => {
  await window.keyApi.clear();
  if (info) render({ ...info, hasKey: false });
  $('status').textContent = '已清除已保存的 Key';
});

$('cancel').addEventListener('click', () => window.keyApi.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.keyApi.close();
});
