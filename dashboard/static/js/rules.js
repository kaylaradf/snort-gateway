/* rules.js */

async function loadRules() {
  const rules = await fetch('/api/rules').then(r => r.json());
  document.getElementById('ruleCount').textContent = `${rules.length} rules`;
  document.getElementById('rulesBody').innerHTML = rules.map(r => `
    <tr>
      <td class="td-ip">${r.sid ?? '—'}</td>
      <td><span class="badge badge-p3">${r.protocol}</span></td>
      <td><span class="badge badge-p${r.priority ?? 3}">P${r.priority ?? '—'}</span></td>
      <td class="td-msg" title="${r.msg}">${r.msg}</td>
      <td style="color:var(--text-muted);font-size:var(--text-xs);font-family:var(--font-ui)">${r.classtype}</td>
    </tr>`).join('');
}

loadRules();
