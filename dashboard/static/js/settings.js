/* settings.js */

/* ── TERMINAL LOG ───────────────────────────────────────── */
const COLORS = {
  info:    'var(--text-muted)',
  success: 'var(--success)',
  error:   'var(--critical)',
  warn:    'var(--warning)',
  dim:     'var(--text-faint)',
};

function termLog(msg, type = 'info') {
  const el = document.getElementById('terminalLog');
  if (!el) return;
  const now = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const line = document.createElement('div');
  line.style.color = COLORS[type] || COLORS.info;
  const prefix = { success: '✓', error: '✗', warn: '⚠', info: '›', dim: ' ' }[type] || '›';
  line.innerHTML = `<span style="color:var(--text-faint)">[${now}]</span> ${prefix} ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function termSep() {
  const el = document.getElementById('terminalLog');
  if (!el) return;
  const line = document.createElement('div');
  line.style.cssText = 'border-top:1px solid var(--border);margin:4px 0;';
  el.appendChild(line);
}

document.getElementById('btnClearLog').addEventListener('click', () => {
  document.getElementById('terminalLog').innerHTML = '';
  termLog('Log cleared.', 'dim');
});

/* ── STATUS ─────────────────────────────────────────────── */
function setDotLocal(id, ok) {
  const el = document.getElementById(id);
  if (el) el.className = 'status-dot ' + (ok ? 'on' : 'off');
}

async function loadStatus() {
  const d = await fetch('/api/status').then(r => r.json());
  setDotLocal('s-snort',  d.snort_running);
  setDotLocal('s-parser', d.parser_running);
  document.getElementById('pathInfo').innerHTML = [
    ['DB Path',       d.db_path],
    ['Alert Log',     d.alert_log],
    ['Rules',         d.rules_path],
    ['DB Size',       `${d.db_size_mb} MB`],
    ['Total Records', d.total_records.toLocaleString()],
  ].map(([k, v]) => `
    <div style="display:flex;gap:var(--space-4);font-size:var(--text-xs)">
      <span style="color:var(--text-faint);min-width:110px;font-family:var(--font-ui)">${k}</span>
      <span style="font-family:var(--font-mono);color:var(--text-muted)">${v}</span>
    </div>`).join('');
  document.getElementById('lastLog').textContent = d.last_log ? `Last log: ${d.last_log}` : '';
}

/* ── CONFIG EDITOR ──────────────────────────────────────── */
const LABELS = {
  bot_token:              'Bot Token',
  chat_id:                'Chat ID',
  alert_log:              'Alert Log Path',
  db_path:                'DB Path',
  pos_file:               'Position File',
  log_file:               'Log File',
  dedup_window_seconds:   'Dedup Window (s)',
  min_priority_notify:    'Min Priority Notify',
  poll_interval_seconds:  'Poll Interval (s)',
  max_notif_per_category: 'Max Notif / Category',
};

async function loadConfig() {
  const data = await fetch('/api/config').then(r => r.json());
  const form = document.getElementById('configForm');
  form.innerHTML = Object.entries(data).map(([section, keys]) => `
    <div>
      <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                  color:var(--text-faint);font-family:var(--font-ui);margin-bottom:var(--space-3)">${section}</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        ${Object.entries(keys).map(([k, v]) => `
          <div style="display:grid;grid-template-columns:160px 1fr;align-items:center;gap:var(--space-3)">
            <label style="font-size:var(--text-xs);color:var(--text-muted);font-family:var(--font-ui)"
                   for="cfg-${section}-${k}">${LABELS[k] || k}</label>
            <input class="log-filter-input" style="flex:none"
                   id="cfg-${section}-${k}"
                   data-section="${section}" data-key="${k}"
                   value="${v}" type="text">
          </div>`).join('')}
      </div>
    </div>`).join('');
}

document.getElementById('btnSaveConfig').addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#configForm input[data-section]');
  const payload = {};
  inputs.forEach(el => {
    const s = el.dataset.section, k = el.dataset.key;
    if (!payload[s]) payload[s] = {};
    payload[s][k] = el.value;
  });

  termSep();
  termLog('Menyimpan konfigurasi...', 'info');

  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json());

  if (res.ok) {
    termLog('Konfigurasi tersimpan.', 'success');
    termLog('Silahkan restart service agar perubahan berlaku.', 'warn');
  } else {
    termLog('Gagal menyimpan konfigurasi.', 'error');
  }
});

/* ── RESTART ────────────────────────────────────────────── */
async function restartService(endpoint, label) {
  termSep();
  termLog(`Mengirim perintah restart ${label}...`, 'info');

  const res = await fetch(endpoint, { method: 'POST' }).then(r => r.json());

  if (res.ok) {
    termLog(`${label} berhasil direstart.`, 'success');
    termLog(`Menunggu service ${label} aktif kembali...`, 'dim');
    setTimeout(async () => {
      await loadStatus();
      const snortOk  = document.getElementById('s-snort')?.classList.contains('on');
      const parserOk = document.getElementById('s-parser')?.classList.contains('on');
      const ok = label.toLowerCase().includes('snort') ? snortOk : parserOk;
      termLog(`${label} status: ${ok ? 'running ✓' : 'tidak terdeteksi, cek manual'}`, ok ? 'success' : 'warn');
    }, 2500);
  } else {
    termLog(`Gagal restart ${label}: ${res.msg}`, 'error');
  }
}

document.getElementById('btnRestartSnort').addEventListener('click',
  () => restartService('/api/restart/snort', 'Snort'));
document.getElementById('btnRestartParser').addEventListener('click',
  () => restartService('/api/restart/parser', 'ids-parser'));

/* ── INIT ───────────────────────────────────────────────── */
termLog('PERKUTUT Settings siap.', 'dim');
termLog('Perubahan config.ini memerlukan restart service.', 'dim');

loadStatus();
loadConfig();
setInterval(loadStatus, 10000);
