'use strict';

// 白饭账本：汇总 Qoder 桌面端转录里的 credits 真值
// 数据源：~/.qoder-cn/projects/<slug>/<sessionId>.jsonl（含 <sessionId>/subagents/agent-*.jsonl）
// 每条 assistant 消息的 message.usage.credits 是平台计费真值，合计即「大肥鱼吃掉的白饭」

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const fileCache = new Map(); // `${path}|${mtime}|${size}` -> { month, day }

function transcriptsRoot() {
  return path.join(os.homedir(), '.qoder-cn', 'projects');
}

function listTranscripts(dir, out, depth) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listTranscripts(p, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function sumFile(file, monthStart, dayStart) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const key = `${file}|${st.mtimeMs}|${st.size}`;
  const cached = fileCache.get(key);
  if (cached) return { ...cached, mtime: st.mtimeMs };

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  let month = 0;
  let day = 0;
  let session = 0;
  for (const line of text.split('\n')) {
    if (!line.includes('"credits"')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const u = obj && obj.message && obj.message.usage;
    if (!u || typeof u.credits !== 'number' || u.billable === false) continue;
    const t = Date.parse(obj.timestamp || '');
    session += u.credits;
    if (!t || t < monthStart) continue;
    month += u.credits;
    if (t >= dayStart) day += u.credits;
  }

  const res = { month, day, session };
  fileCache.set(key, res);
  for (const k of [...fileCache.keys()]) {
    if (k !== key && k.startsWith(`${file}|`)) fileCache.delete(k);
  }
  return { ...res, mtime: st.mtimeMs };
}

const round1 = (n) => Math.round(n * 10) / 10;

// 返回 { today, month, session, sessionId, files, available, updatedAt }
function collect() {
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const out = {
    today: 0,
    month: 0,
    session: 0,
    sessionId: '',
    files: 0,
    available: false,
    updatedAt: Date.now(),
  };

  let latestMtime = 0;
  let latestSession = 0;
  let latestId = '';

  for (const file of listTranscripts(transcriptsRoot(), [], 0)) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (st.mtimeMs < monthStart) continue; // 本月没动过的转录不参与统计
    const s = sumFile(file, monthStart, dayStart);
    if (!s) continue;
    out.files++;
    out.available = true;
    out.month += s.month;
    out.today += s.day;
    if (st.mtimeMs > latestMtime) {
      latestMtime = st.mtimeMs;
      latestSession = s.session;
      latestId = path.basename(file, '.jsonl');
    }
  }

  out.today = round1(out.today);
  out.month = round1(out.month);
  out.session = round1(latestSession);
  out.sessionId = latestId ? latestId.slice(0, 8) : '';
  return out;
}

module.exports = { collect, transcriptsRoot };
