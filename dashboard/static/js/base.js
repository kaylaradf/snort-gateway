/* base.js — shared logic for all pages */

/* ── CLOCK ─────────────────────────────────────────────── */
function tick() { document.getElementById('clock').textContent = new Date().toTimeString().slice(0, 8); }
tick(); setInterval(tick, 1000);

/* ── THEME ──────────────────────────────────────────────── */
function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-palette');
  const next = cur === 'light' ? (localStorage.getItem('ids-palette-dark') || 'default') : cur;
  if (cur !== 'light') {
    localStorage.setItem('ids-palette-dark', cur);
    applyPalette('light');
  } else {
    applyPalette(next);
  }
}

function applyPalette(id) {
  document.documentElement.setAttribute('data-palette', id);
  localStorage.setItem('ids-palette', id);
  grid.querySelectorAll('.palette-swatch').forEach(s => {
    s.classList.toggle('active', s.getAttribute('data-pid') === id);
  });
  const p = PALETTES.find(x => x.id === id);
  if (palNameEl) palNameEl.textContent = p ? p.name : 'Light';
  if (typeof onPaletteChange === 'function') onPaletteChange();
}

/* ── PALETTES ───────────────────────────────────────────── */
const PALETTES = [
  { id: 'default',   name: 'Midnight',    c: ['#0d0e11','#4d9cff','#ff5370','#c3e88d'] },
  { id: 'dracula',   name: 'Dracula',     c: ['#1e1f29','#bd93f9','#ff5555','#50fa7b'] },
  { id: 'monokai',   name: 'Monokai',     c: ['#1b1d1e','#a6e22e','#f92672','#66d9e8'] },
  { id: 'solarized', name: 'Solarized',   c: ['#002b36','#268bd2','#dc322f','#859900'] },
  { id: 'onedark',   name: 'One Dark',    c: ['#21252b','#61afef','#e06c75','#98c379'] },
  { id: 'tokyo',     name: 'Tokyo Night', c: ['#1a1b2e','#7aa2f7','#f7768e','#9ece6a'] },
  { id: 'gruvbox',   name: 'Gruvbox',     c: ['#1d2021','#83a598','#fb4934','#b8bb26'] },
];

const _saved = localStorage.getItem('ids-palette') || 'default';
document.documentElement.setAttribute('data-palette', _saved);

const grid = document.getElementById('paletteGrid');
const palNameEl = document.getElementById('paletteName');

PALETTES.forEach(p => {
  const sw = document.createElement('div');
  sw.className = 'palette-swatch' + (p.id === _saved ? ' active' : '');
  sw.setAttribute('data-pid', p.id);
  p.c.forEach(col => {
    const s = document.createElement('div');
    s.style.cssText = `flex:1;background:${col};`;
    sw.appendChild(s);
  });
  sw.addEventListener('click', () => applyPalette(p.id));
  grid.appendChild(sw);
  if (p.id === _saved) palNameEl.textContent = p.name;
});

/* ── STATUS POLLING ─────────────────────────────────────── */
function getVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function setDot(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'status-dot ' + (ok ? 'on' : 'off');
}

async function pollStatus() {
  try {
    const d = await fetch('/api/status').then(r => r.json());
    setDot('dotSnort', d.snort_running);
    setDot('dotParser', d.parser_running);
    const dbEl = document.getElementById('dbInfo');
    if (dbEl) dbEl.textContent = `${d.total_records.toLocaleString()} records · ${d.db_size_mb} MB`;
    const badge = document.getElementById('navBadgeP1');
    if (badge && d.p1_today != null) badge.textContent = d.p1_today || '—';
  } catch (_) {}
}

pollStatus();
setInterval(pollStatus, 30000);
