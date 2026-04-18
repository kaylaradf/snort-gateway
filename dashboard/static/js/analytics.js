/* analytics.js */

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 10;

function resolveColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
const CAT_VAR = {
  'Reconnaissance': '--recon-c', 'Bad Traffic': '--dos-c',
  'ICMP': '--xss-c', 'Web Traffic': '--sqli-c',
};
function catColor(n) { return resolveColor(CAT_VAR[n] || '--scan-c'); }

function chartColors() {
  return {
    p1:     resolveColor('--critical') + 'bf',
    p2:     resolveColor('--warning')  + '88',
    accent: resolveColor('--accent')   + '99',
  };
}

let currentRange = '1h';
let tlChart, donutChart, ipChart;

function initCharts() {
  const cc = chartColors();
  tlChart = new Chart(document.getElementById('timelineChart'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'P1', data: [], borderColor: cc.p1, backgroundColor: cc.p1.slice(0,7) + '22', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
      { label: 'P2', data: [], borderColor: cc.p2, backgroundColor: cc.p2.slice(0,7) + '18', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 8, boxHeight: 8, padding: 10, usePointStyle: true, pointStyle: 'circle', color: () => getVar('--text-muted') }},
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { maxRotation: 0, maxTicksLimit: 12, color: () => getVar('--text-faint') }, border: { display: false }},
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, beginAtZero: true, ticks: { color: () => getVar('--text-faint') }, border: { display: false }},
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

  ipChart = new Chart(document.getElementById('ipChart'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: cc.accent, borderRadius: 3, borderSkipped: false }]},
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} alerts` }}},
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: () => getVar('--text-faint') }, border: { display: false }},
        y: { grid: { display: false }, ticks: { color: () => getVar('--text-muted'), font: { family: "'JetBrains Mono'" }}, border: { display: false }},
      },
    },
  });
}

async function loadAll() {
  const r = currentRange;

  const [timeline, cats, ips, protos] = await Promise.all([
    fetch(`/api/analytics/timeline?range=${r}`).then(x => x.json()),
    fetch(`/api/analytics/by_category?range=${r}`).then(x => x.json()),
    fetch(`/api/analytics/top_ips?range=${r}`).then(x => x.json()),
    fetch(`/api/analytics/by_protocol?range=${r}`).then(x => x.json()),
  ]);

  /* timeline */
  tlChart.data.labels           = timeline.map(x => x.t);
  tlChart.data.datasets[0].data = timeline.map(x => x.p1);
  tlChart.data.datasets[1].data = timeline.map(x => x.p2);
  tlChart.update('none');

  /* donut */
  const total = cats.reduce((s, x) => s + x.count, 0);
  document.getElementById('donutTotal').textContent = total;
  donutChart.data.labels                      = cats.map(x => x.category);
  donutChart.data.datasets[0].data            = cats.map(x => x.count);
  donutChart.data.datasets[0].backgroundColor = cats.map(x => catColor(x.category));
  donutChart.update('none');
  document.getElementById('donutLegend').innerHTML = cats.map(x => {
    const pct = total ? Math.round(x.count / total * 100) : 0;
    return `<div class="legend-item">
      <div class="legend-left"><span class="legend-dot" style="background:${catColor(x.category)}"></span><span class="legend-name">${x.category}</span></div>
      <span><span class="legend-val">${x.count}</span><span class="legend-pct">${pct}%</span></span>
    </div>`;
  }).join('');

  /* top IPs bar chart */
  ipChart.data.labels           = ips.map(x => x.ip);
  ipChart.data.datasets[0].data = ips.map(x => x.count);
  ipChart.update('none');

  /* protocol list */
  const maxP = protos[0]?.count || 1;
  document.getElementById('protoList').innerHTML = protos.map(x => `
    <div class="ip-row">
      <span class="ip-rank">#</span>
      <span class="ip-addr">${x.protocol}</span>
      <div class="ip-bar-wrap" style="width:80px"><div class="ip-bar" style="width:${Math.round(x.count/maxP*100)}%;background:var(--accent)"></div></div>
      <span class="ip-count">${x.count}</span>
    </div>`).join('');
}

/* range buttons */
document.getElementById('rangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('[data-r]');
  if (!btn) return;
  currentRange = btn.getAttribute('data-r');
  document.querySelectorAll('#rangeButtons .pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAll();
});

function onPaletteChange() {
  setTimeout(() => {
    const cc = chartColors();
    tlChart.data.datasets[0].borderColor = cc.p1;
    tlChart.data.datasets[0].backgroundColor = cc.p1.slice(0,7) + '22';
    tlChart.data.datasets[1].borderColor = cc.p2;
    tlChart.data.datasets[1].backgroundColor = cc.p2.slice(0,7) + '18';
    ipChart.data.datasets[0].backgroundColor = cc.accent;
    tlChart.update('none'); ipChart.update('none');
    loadAll();
  }, 50);
}

initCharts();
loadAll();
setInterval(loadAll, 30000);
