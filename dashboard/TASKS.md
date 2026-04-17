# IDS Dashboard — Task Tracker

## Stack
- Backend: Flask 3.0.2, Python 3.12.3, SQLite3
- Frontend: Vanilla JS, Chart.js 4.4, CSS custom properties
- Port: 5000 (localhost only)
- Polling: Overview 10s, Event Log 5s, Analytics 30s

---

## Progress

### Infrastructure
- [x] Struktur direktori (`templates/`, `static/css/`, `static/js/`)
- [x] `app.py` — semua API endpoint
- [x] `templates/base.html` — sidebar, topbar, palette switcher
- [ ] `static/css/style.css` — semua styles dari index.html dipindah + tambahan
- [ ] `static/js/base.js` — clock, palette switcher, status polling (sidebar dots + db info)

---

### Overview (`/`)
- [x] `templates/overview.html` — markup KPI, charts, top IPs, top rules, recent events
- [ ] `static/js/overview.js` — fetch + render semua section, polling 10s

---

### Event Log (`/eventlog`)
- [ ] `templates/eventlog.html`
- [ ] `static/js/eventlog.js` — filter (q, priority, category, ip, port), pagination, polling 5s

---

### Analytics (`/analytics`)
- [ ] `templates/analytics.html`
- [ ] `static/js/analytics.js` — timeline chart, by category, top IPs, by protocol, range selector, polling 30s

---

### Rules (`/rules`)
- [ ] `templates/rules.html`
- [ ] `static/js/rules.js` — render tabel parsed rules dari local.rules

---

### Settings (`/settings`)
- [ ] `templates/settings.html`
- [ ] `static/js/settings.js` — tampilkan status parser, snort, db info, paths

---

## API Endpoints (semua sudah di app.py)

| Endpoint | Dipakai di |
|---|---|
| `GET /api/overview` | Overview KPI |
| `GET /api/overview/timeline` | Overview chart |
| `GET /api/overview/by_category` | Overview donut |
| `GET /api/overview/top_ips` | Overview top IPs |
| `GET /api/overview/top_rules` | Overview top rules |
| `GET /api/overview/recent_events` | Overview recent events |
| `GET /api/events?q=&priority=&category=&ip=&port=&page=` | Event Log |
| `GET /api/events/categories` | Event Log filter chips |
| `GET /api/analytics/timeline?range=` | Analytics |
| `GET /api/analytics/by_category?range=` | Analytics |
| `GET /api/analytics/top_ips?range=` | Analytics |
| `GET /api/analytics/by_protocol?range=` | Analytics |
| `GET /api/rules` | Rules |
| `GET /api/status` | Settings + sidebar status |
