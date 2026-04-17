/* overview.js — Overview page logic, polling every 10s */

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 10;

function resolveColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
const CAT_VAR = {
  'Reconnaissance': '--recon-c',
  'Bad Traffic':    '--dos-c',
  'ICMP':           '--xss-c',
  'Web Traffic':    '--sqli-c',
};
function catColor(name) { return resolveColor(CAT_VAR[name] || '--scan-c'); }

const CAT_BADGE = {
  'Reconnaissance': 'badge-recon',
  'Bad Traffic':    'badge-bad',
  'ICMP':           'badge-icmp',
  'Web Traffic':    'badge-web',
};
function catBadge(name) { return CAT_BADGE[name] || 'badge-http'; }

/* ── CHARTS INIT ────────────────────────────────────────── */
let tlChart, donutChart;

function chartColors() {
  return {
    p1: resolveColor('--critical') + 'bf',
    p2: resolveColor('--warning')  + '88',
  };
}

function initCharts() {
  const cc = chartColors();
  tlChart = new Chart(document.getElementById('timelineChart'), {
    type: 'bar',
    data: { labels: [], datasets: [
      { label: 'P1', data: [], backgroundColor: cc.p1, stack: 'a', borderRadius: 2, borderSkipped: false },
      { label: 'P2', data: [], backgroundColor: cc.p2, stack: 'a', borderRadius: 2, borderSkipped: false },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 8, boxHeight: 8, padding: 10, usePointStyle: true, pointStyle: 'circle', color: () => getVar('--text-muted') }},
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { maxRotation: 0, color: () => getVar('--text-faint') }, stacked: true, border: { display: false }},
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, stacked: true, beginAtZero: true, ticks: { stepSize: 5, color: () => getVar('--text-faint') }, border: { display: false }},
      },
    },
  });

  donutChart = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0, hoverOffset: 5 }]},
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw}` }}},
    },
  });
}

/* ── FETCH & RENDER ─────────────────────────────────────── */
async function loadOverview() {
  const d = await fetch('/api/overview').then(r => r.json());
  document.getElementById('kpiTotal').textContent = d.total_today;
  document.getElementById('kpiP1').textContent    = d.p1_today;
  document.getElementById('kpiP2').textContent    = d.p2_today;
  document.getElementById('kpiIPs').textContent   = d.attacker_ips;
  document.getElementById('kpiTopIP').textContent = d.top_ip;

  const pct = d.pct_change;
  const pctEl = document.getElementById('kpiPct');
  if (pct > 0)       pctEl.innerHTML = `<span class="up">↑ ${pct}%</span>&nbsp;vs yesterday`;
  else if (pct < 0)  pctEl.innerHTML = `<span class="down">↓ ${Math.abs(pct)}%</span>&nbsp;vs yesterday`;
  else               pctEl.textContent = 'same as yesterday';

  const t = d.last_alert_time;
  document.getElementById('kpiLastTime').textContent = t !== '—' ? t.slice(11, 19) : '—';
  const msgEl = document.getElementById('kpiLastMsg');
  msgEl.textContent  = d.last_alert_msg;
  msgEl.title        = d.last_alert_msg;
}

async function loadTimeline() {
  const rows = await fetch('/api/overview/timeline').then(r => r.json());
  tlChart.data.labels             = rows.map(r => r.t);
  tlChart.data.datasets[0].data   = rows.map(r => r.p1);
  tlChart.data.datasets[1].data   = rows.map(r => r.p2);
  tlChart.update('none');
}

async function loadDonut() {
  const rows = await fetch('/api/overview/by_category').then(r => r.json());
  const total = rows.reduce((s, r) => s + r.count, 0);
  document.getElementById('donutTotal').textContent = total;

  donutChart.data.labels                          = rows.map(r => r.category);
  donutChart.data.datasets[0].data                = rows.map(r => r.count);
  donutChart.data.datasets[0].backgroundColor     = rows.map(r => catColor(r.category));
  donutChart.update('none');

  const legend = document.getElementById('donutLegend');
  legend.innerHTML = rows.map(r => {
    const pct = total ? Math.round(r.count / total * 100) : 0;
    return `<div class="legend-item">
      <div class="legend-left">
        <span class="legend-dot" style="background:${catColor(r.category)}"></span>
        <span class="legend-name">${r.category}</span>
      </div>
      <span><span class="legend-val">${r.count}</span><span class="legend-pct">${pct}%</span></span>
    </div>`;
  }).join('');
}

async function loadTopIPs() {
  const rows = await fetch('/api/overview/top_ips').then(r => r.json());
  const max  = rows[0]?.count || 1;
  document.getElementById('topIPs').innerHTML = rows.map((r, i) => `
    <div class="ip-row">
      <span class="ip-rank">${i + 1}</span>
      <span class="ip-addr">${r.ip}</span>
      <div class="ip-bar-wrap" style="width:80px">
        <div class="ip-bar" style="width:${Math.round(r.count/max*100)}%;background:var(--critical)"></div>
      </div>
      <span class="ip-count">${r.count}</span>
    </div>`).join('');
}

async function loadTopRules() {
  const rows = await fetch('/api/overview/top_rules').then(r => r.json());
  const max  = rows[0]?.count || 1;
  document.getElementById('topRules').innerHTML = rows.map(r => `
    <div class="ip-row">
      <span class="ip-rank">#</span>
      <span class="ip-addr" style="font-size:0.62rem;color:var(--text-muted)">${r.sid} · ${r.msg}</span>
      <div class="ip-bar-wrap" style="width:80px">
        <div class="ip-bar" style="width:${Math.round(r.count/max*100)}%;background:var(--accent)"></div>
      </div>
      <span class="ip-count">${r.count}</span>
    </div>`).join('');
}

async function loadRecentEvents() {
  const rows = await fetch('/api/overview/recent_events').then(r => r.json());
  document.getElementById('recentBody').innerHTML = rows.map(r => {
    const dst = r.dst_port ? `${r.dst_ip}:${r.dst_port}` : r.dst_ip;
    const src = r.src_port ? `${r.src_ip}:${r.src_port}` : r.src_ip;
    return `<tr class="p${r.priority}">
      <td class="td-time">${r.timestamp ? r.timestamp.slice(11, 19) : '—'}</td>
      <td><span class="badge badge-p${r.priority}">P${r.priority}</span></td>
      <td class="td-ip">${r.sid}</td>
      <td class="td-msg" title="${r.msg}">${r.msg}</td>
      <td><span class="badge ${catBadge(r.category)}">${r.category || '—'}</span></td>
      <td class="td-ip">${src}</td>
      <td class="td-ip">${dst}</td>
      <td><span class="badge badge-p3">${r.protocol}</span></td>
    </tr>`;
  }).join('');
}

/* ── PALETTE HOOK ───────────────────────────────────────── */
function onPaletteChange() {
  setTimeout(() => {
    const cc = chartColors();
    tlChart.data.datasets[0].backgroundColor = cc.p1;
    tlChart.data.datasets[1].backgroundColor = cc.p2;
    tlChart.update('none');
    loadDonut();
  }, 50);
}

/* ── POLLING ────────────────────────────────────────────── */
let countdown = 10;
const countEl = document.getElementById('countDown');

function refreshAll() {
  loadOverview();
  loadTimeline();
  loadDonut();
  loadTopIPs();
  loadTopRules();
  loadRecentEvents();
}

initCharts();
refreshAll();

setInterval(() => {
  countdown--;
  if (countEl) countEl.textContent = countdown + 's';
  if (countdown <= 0) {
    countdown = 10;
    refreshAll();
  }
}, 1000);
