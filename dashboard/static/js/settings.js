/* settings.js */

/* ── TERMINAL LOG ───────────────────────────────────────── */
const COLORS = {
  info: 'var(--text-muted)', success: 'var(--success)',
  error: 'var(--critical)', warn: 'var(--warning)', dim: 'var(--text-faint)',
};

function termLog(msg, type = 'info', persist = true) {
  const el = document.getElementById('terminalLog');
  if (!el) return;
  const now = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const prefix = { success: '✓', error: '✗', warn: '⚠', info: '›', dim: ' ' }[type] || '›';
  const text = `[${now}] ${prefix} ${msg}`;
  const div = document.createElement('div');
  div.style.cssText = `color:${COLORS[type]};white-space:pre-wrap;word-break:break-all`;
  div.innerHTML = `<span style="color:var(--text-faint)">[${now}]</span> ${prefix} ${msg}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  if (persist) fetch('/api/activitylog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line: text }),
  });
}

function termSep(persist = true) {
  const el = document.getElementById('terminalLog');
  if (!el) return;
  const div = document.createElement('div');
  div.style.cssText = 'border-top:1px solid var(--border);margin:4px 0;';
  el.appendChild(div);
  if (persist) fetch('/api/activitylog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line: '---' }),
  });
}

async function loadActivityLog() {
  const lines = await fetch('/api/activitylog').then(r => r.json());
  const el = document.getElementById('terminalLog');
  if (!el || !lines.length) return;
  lines.forEach(raw => {
    if (raw === '---') {
      const sep = document.createElement('div');
      sep.style.cssText = 'border-top:1px solid var(--border);margin:4px 0;';
      el.appendChild(sep);
    } else {
      const type = raw.includes('] ✓') ? 'success' : raw.includes('] ✗') ? 'error'
                 : raw.includes('] ⚠') ? 'warn'    : raw.includes(']  ') ? 'dim' : 'info';
      const div = document.createElement('div');
      div.style.cssText = `color:${COLORS[type]};white-space:pre-wrap;word-break:break-all`;
      div.textContent = raw;
      el.appendChild(div);
    }
  });
  el.scrollTop = el.scrollHeight;
}

document.getElementById('btnClearLog').addEventListener('click', async () => {
  document.getElementById('terminalLog').innerHTML = '';
  await fetch('/api/activitylog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line: '--- log cleared ---' }),
  });
  termLog('Log cleared.', 'dim', false);
});

/* ── SYSTEM STATUS ──────────────────────────────────────── */
function setDot(id, ok) {
  const el = document.getElementById(id);
  if (el) el.className = 'status-dot ' + (ok ? 'on' : 'off');
}

async function loadStatus() {
  const d = await fetch('/api/status').then(r => r.json());
  setDot('s-snort', d.snort_running);
  setDot('s-parser', d.parser_running);
  document.getElementById('pathInfo').innerHTML = [
    ['DB Path',       d.db_path],
    ['Alert Log',     d.alert_log],
    ['Rules',         d.rules_path],
    ['DB Size',       `${d.db_size_mb} MB`],
    ['Total Records', d.total_records.toLocaleString()],
  ].map(([k, v]) => `
    <div style="display:flex;gap:var(--space-3);font-size:var(--text-xs)">
      <span style="color:var(--text-faint);min-width:100px;font-family:var(--font-ui);flex-shrink:0">${k}</span>
      <span style="font-family:var(--font-mono);color:var(--text-muted);word-break:break-all">${v}</span>
    </div>`).join('');
  document.getElementById('lastLog').textContent = d.last_log ? `Last: ${d.last_log}` : '';
}

/* ── WHATSAPP STATUS ────────────────────────────────────── */
let _waQrInterval = null;

async function loadWaStatus() {
  const d = await fetch('/api/wa/status').then(r => r.json()).catch(() => ({ ok: false, connected: false, qr_pending: false }));

  setDot('waDot', d.connected);
  const statusEl = document.getElementById('waStatus');
  const qrWrap   = document.getElementById('waQrWrap');
  const btnQr    = document.getElementById('btnRefreshQr');
  const groupEl  = document.getElementById('waCurrentGroup');

  if (!d.ok) {
    statusEl.textContent = 'Gateway tidak berjalan';
    qrWrap.style.display = 'none';
    btnQr.style.display  = 'none';
    clearInterval(_waQrInterval);
    return;
  }

  if (d.connected) {
    statusEl.textContent = `Terhubung${d.group ? ' · ' + d.group : ''}`;
    qrWrap.style.display = 'none';
    btnQr.style.display  = 'none';
    if (groupEl) groupEl.textContent = d.group ? `Group: ${d.group}` : '';
    clearInterval(_waQrInterval);
  } else if (d.qr_pending) {
    statusEl.textContent = 'Menunggu scan QR...';
    qrWrap.style.display = 'block';
    btnQr.style.display  = 'inline-flex';
    loadWaQr();
  } else {
    statusEl.textContent = 'Menghubungkan...';
    qrWrap.style.display = 'none';
    btnQr.style.display  = 'none';
  }
}

async function loadWaQr() {
  const d = await fetch('/api/wa/qr').then(r => r.json()).catch(() => ({ qr: null }));
  if (!d.qr) return;
  const canvas = document.getElementById('waQrCanvas');
  if (canvas && typeof QRCode !== 'undefined') {
    QRCode.toCanvas(canvas, d.qr, { width: 160, margin: 1, color: { dark: '#000', light: '#fff' }});
  }
}

document.getElementById('btnRefreshQr')?.addEventListener('click', loadWaQr);

/* ── WHATSAPP GROUP ─────────────────────────────────────── */
async function loadWaGroup() {
  const d = await fetch('/api/wa/groups').then(r => r.json()).catch(() => ({ ok: false }));
  if (d.ok && d.current) {
    document.getElementById('waCurrentGroup').textContent = d.current.group_name || '—';
    document.getElementById('waCurrentJid').textContent   = d.current.group_jid  || '—';
    document.getElementById('waNewName').value = d.current.group_name || '';
    document.getElementById('waNewJid').value  = d.current.group_jid  || '';
  }
}

document.getElementById('btnSetGroup').addEventListener('click', async () => {
  const jid  = document.getElementById('waNewJid').value.trim();
  const name = document.getElementById('waNewName').value.trim();
  if (!jid) { termLog('JID tidak boleh kosong.', 'error'); return; }
  termSep();
  termLog('Menyimpan group tujuan...', 'info');
  const res = await fetch('/api/wa/setgroup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_jid: jid, group_name: name }),
  }).then(r => r.json());
  if (res.ok) {
    termLog(`Group diubah ke: ${name || jid}`, 'success');
    termLog('Restart wa-gateway agar perubahan berlaku.', 'warn');
    loadWaGroup();
  } else {
    termLog(`Gagal: ${res.error || 'unknown error'}`, 'error');
  }
});

/* ── CONFIG EDITOR ──────────────────────────────────────── */
const LABELS = {
  bot_token: 'Bot Token', chat_id: 'Chat ID',
  alert_log: 'Alert Log Path', db_path: 'DB Path',
  pos_file: 'Position File', log_file: 'Log File',
  dedup_window_seconds: 'Dedup Window (s)', min_priority_notify: 'Min Priority Notify',
  poll_interval_seconds: 'Poll Interval (s)', max_notif_per_category: 'Max Notif / Category',
  enabled: 'Enabled', gateway_url: 'Gateway URL', group_jid: 'Group JID', group_name: 'Group Name',
};

// Sections yang ditampilkan di config editor (skip whatsapp — dihandle di panel kiri)
const SKIP_KEYS = new Set(['enabled']);

async function loadConfig() {
  const data = await fetch('/api/config').then(r => r.json());
  const form = document.getElementById('configForm');
  form.innerHTML = Object.entries(data).map(([section, keys]) => `
    <div>
      <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                  color:var(--text-faint);font-family:var(--font-ui);margin-bottom:var(--space-3)">${section}</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        ${Object.entries(keys).filter(([k]) => k !== 'enabled').map(([k, v]) => `
          <div style="display:grid;grid-template-columns:140px 1fr;align-items:center;gap:var(--space-2)">
            <label style="font-size:var(--text-xs);color:var(--text-muted);font-family:var(--font-ui)"
                   for="cfg-${section}-${k}">${LABELS[k] || k}</label>
            <input class="log-filter-input" style="flex:none;font-size:0.68rem"
                   id="cfg-${section}-${k}" data-section="${section}" data-key="${k}"
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json());
  if (res.ok) {
    termLog('Konfigurasi tersimpan.', 'success');
    termLog('Restart service agar perubahan berlaku.', 'warn');
      } else {
    termLog('Gagal menyimpan konfigurasi.', 'error');
  }
});

/* ── RESTART ────────────────────────────────────────────── */
async function restartService(endpoint, label, dotId) {
  termSep();
  termLog(`Mengirim perintah restart ${label}...`, 'info');
  const res = await fetch(endpoint, { method: 'POST' }).then(r => r.json());
  if (res.ok) {
    termLog(`${label} berhasil direstart.`, 'success');
    setTimeout(async () => {
      await loadStatus();
      if (dotId) {
        const ok = document.getElementById(dotId)?.classList.contains('on');
        termLog(`${label} status: ${ok ? 'running ✓' : 'tidak terdeteksi, cek manual'}`, ok ? 'success' : 'warn');
      }
    }, 2500);
  } else {
    termLog(`Gagal restart ${label}: ${res.msg}`, 'error');
  }
}

document.getElementById('btnRestartSnort').addEventListener('click',
  () => restartService('/api/restart/snort', 'Snort', 's-snort'));
document.getElementById('btnRestartParser').addEventListener('click',
  () => restartService('/api/restart/parser', 'snort-gateway', 's-parser'));
document.getElementById('btnRestartWa').addEventListener('click', async () => {
  termSep();
  termLog('Mengirim perintah restart wa-gateway...', 'info');
  const res = await fetch('/api/restart/wa', { method: 'POST' }).then(r => r.json());
  termLog(res.ok ? 'wa-gateway direstart.' : `Gagal: ${res.msg}`, res.ok ? 'success' : 'error');
  if (res.ok) setTimeout(loadWaStatus, 3000);
});

/* ── INIT ───────────────────────────────────────────────── */
loadActivityLog();
loadStatus();
loadConfig();
loadWaStatus();
loadWaGroup();

setInterval(loadStatus, 10000);
setInterval(loadWaStatus, 8000);
