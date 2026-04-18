/* eventlog.js */

const CAT_BADGE = {
  'Reconnaissance': 'badge-recon', 'Bad Traffic': 'badge-bad',
  'ICMP': 'badge-icmp', 'Web Traffic': 'badge-web',
};
function catBadge(n) { return CAT_BADGE[n] || 'badge-http'; }

let currentPage = 1;
let activePriority = null;
let dateStart = '', dateEnd = '';

/* load categories into select */
async function loadCategories() {
  const cats = await fetch('/api/events/categories').then(r => r.json());
  const sel = document.getElementById('catSelect');
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = o.textContent = c;
    sel.appendChild(o);
  });
}

async function loadEvents() {
  const q    = document.getElementById('searchInput').value.trim();
  const cat  = document.getElementById('catSelect').value;
  const params = new URLSearchParams({ page: currentPage });
  if (q)              params.set('q', q);
  if (activePriority) params.set('priority', activePriority);
  if (cat)            params.set('category', cat);
  if (dateStart)      params.set('start', dateStart);
  if (dateEnd)        params.set('end', dateEnd);

  const d = await fetch('/api/events?' + params).then(r => r.json());

  document.getElementById('pageInfo').textContent =
    `${d.total.toLocaleString()} events — page ${d.page} / ${d.pages || 1}`;
  document.getElementById('btnPrev').disabled = d.page <= 1;
  document.getElementById('btnNext').disabled = d.page >= d.pages;

  document.getElementById('eventsBody').innerHTML = d.data.map(r => {
    const dst = r.dst_port ? `${r.dst_ip}:${r.dst_port}` : (r.dst_ip || '—');
    const src = r.src_port ? `${r.src_ip}:${r.src_port}` : r.src_ip;
    return `<tr class="p${r.priority}">
      <td class="td-time">${r.timestamp ? r.timestamp.slice(11,19) : '—'}</td>
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

function changePage(dir) {
  currentPage = Math.max(1, currentPage + dir);
  loadEvents();
}

/* priority chip toggle */
document.getElementById('priorityChips').addEventListener('click', e => {
  const btn = e.target.closest('[data-p]');
  if (!btn) return;
  const p = btn.getAttribute('data-p');
  if (activePriority === p) {
    activePriority = null;
    btn.classList.remove('active');
  } else {
    activePriority = p;
    document.querySelectorAll('#priorityChips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
  }
  currentPage = 1;
  loadEvents();
});

/* search: trigger on Enter or button click, not realtime */
function doSearch() { currentPage = 1; loadEvents(); }
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});
document.getElementById('btnSearch').addEventListener('click', doSearch);
document.getElementById('catSelect').addEventListener('change', () => { currentPage = 1; loadEvents(); });

/* date range */
document.getElementById('btnApplyDate').addEventListener('click', () => {
  dateStart = document.getElementById('dateStart').value;
  dateEnd   = document.getElementById('dateEnd').value;
  currentPage = 1;
  loadEvents();
});
document.getElementById('btnClearDate').addEventListener('click', () => {
  dateStart = ''; dateEnd = '';
  document.getElementById('dateStart').value = '';
  document.getElementById('dateEnd').value = '';
  currentPage = 1;
  loadEvents();
});

/* polling */
let countdown = 5;
const countEl = document.getElementById('countDown');
setInterval(() => {
  countdown--;
  if (countEl) countEl.textContent = countdown + 's';
  if (countdown <= 0) { countdown = 5; loadEvents(); }
}, 1000);

loadCategories();
loadEvents();
