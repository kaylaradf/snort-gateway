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
    ['DB Path',    d.db_path],
    ['Alert Log',  d.alert_log],
    ['Rules',      d.rules_path],
    ['DB Size',    `${d.db_size_mb} MB`],
    ['Total Records', d.total_records.toLocaleString()],
  ].map(([k, v]) => `
    <div style="display:flex;gap:var(--space-4);font-size:var(--text-xs);font-family:var(--font-ui)">
      <span style="color:var(--text-faint);min-width:100px">${k}</span>
      <span style="font-family:var(--font-mono);color:var(--text-muted)">${v}</span>
    </div>`).join('');

  document.getElementById('lastLog').textContent = d.last_log ? `Last log: ${d.last_log}` : '';
}

loadStatus();
setInterval(loadStatus, 10000);
