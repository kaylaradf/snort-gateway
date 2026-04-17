/* settings.js */

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
let _configData = {};

const LABELS = {
  bot_token:             'Bot Token',
  chat_id:               'Chat ID',
  alert_log:             'Alert Log Path',
  db_path:               'DB Path',
  pos_file:              'Position File',
  log_file:              'Log File',
  dedup_window_seconds:  'Dedup Window (s)',
  min_priority_notify:   'Min Priority Notify',
  poll_interval_seconds: 'Poll Interval (s)',
  max_notif_per_category:'Max Notif / Category',
};

async function loadConfig() {
  _configData = await fetch('/api/config').then(r => r.json());
  const form = document.getElementById('configForm');
  form.innerHTML = Object.entries(_configData).map(([section, keys]) => `
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
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json());
  const msg = document.getElementById('saveMsg');
  msg.textContent = res.ok ? '✓ Saved successfully' : '✗ Save failed';
  msg.style.color = res.ok ? 'var(--success)' : 'var(--critical)';
  setTimeout(() => { msg.textContent = ''; }, 3000);
});

/* ── RESTART BUTTONS ────────────────────────────────────── */
async function restartService(endpoint, label) {
  const msg = document.getElementById('restartMsg');
  msg.textContent = `Restarting ${label}...`;
  msg.style.color = 'var(--text-muted)';
  const res = await fetch(endpoint, { method: 'POST' }).then(r => r.json());
  msg.textContent = res.ok ? `✓ ${label} restarted` : `✗ ${res.msg}`;
  msg.style.color = res.ok ? 'var(--success)' : 'var(--critical)';
  setTimeout(() => { msg.textContent = ''; loadStatus(); }, 3000);
}

document.getElementById('btnRestartSnort').addEventListener('click',
  () => restartService('/api/restart/snort', 'Snort'));
document.getElementById('btnRestartParser').addEventListener('click',
  () => restartService('/api/restart/parser', 'Parser'));

loadStatus();
loadConfig();
setInterval(loadStatus, 10000);
