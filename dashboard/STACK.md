# IDS Dashboard — Stack & Context

## Tujuan
Dashboard read-only untuk monitoring Snort IDS secara realtime.
Menampilkan alert dari SQLite database yang diisi oleh `parser.py`.
Tidak ada write operation dari dashboard — semua data masuk lewat parser.

---

## Infrastruktur

| Komponen | Detail |
|---|---|
| OS | Ubuntu 24.04 |
| IDS | Snort 2.9.20, satu interface (`ens37`) |
| Target | WordPress (Docker, port 8080) |
| Attacker | Kali Linux (`192.168.26.102`) |
| Network | `192.168.26.0/24` |
| Python | 3.12.3 |
| Flask | 3.0.2 |
| Database | SQLite3 — `/var/log/snort/ids_alerts.db` |
| Alert Log | `/var/log/snort/snort.alert.fast` |
| Parser Log | `/var/log/snort/parser.log` |
| Rules | `/etc/snort/rules/local.rules` |

---

## Pipeline Data

```
Snort (ens37)
    │
    ▼
snort.alert.fast
    │
    ▼
parser.py  ──→  ids_alerts.db  ──→  Flask (port 5000)  ──→  Browser
    │
    └──→  Telegram Bot API
```

---

## Backend

- **Framework**: Flask 3.0.2
- **Port**: 5000, localhost only (`127.0.0.1`)
- **Pattern**: read-only, semua endpoint `GET`
- **DB access**: SQLite3 via `g` (per-request connection)
- **Agregasi**: dilakukan di SQL query, bukan di Python, untuk efisiensi

---

## Frontend

- **Rendering**: Server-side template (Jinja2) + client-side data fetch
- **Charts**: Chart.js 4.4
- **Fonts**: JetBrains Mono (data/code), Inter (UI), General Sans (body)
- **Theming**: CSS custom properties, 7 palette (Midnight, Dracula, Monokai, Solarized, One Dark, Tokyo Night, Gruvbox)
- **Realtime**: polling (tidak pakai WebSocket/SSE)

---

## Polling Interval

| Halaman | Interval | Alasan |
|---|---|---|
| Overview | 10 detik | KPI + chart tidak perlu terlalu sering |
| Event Log | 5 detik | Butuh data paling fresh |
| Analytics | 30 detik | Data agregasi, tidak berubah drastis |
| Sidebar status | 30 detik | Snort/parser status jarang berubah |

---

## Halaman & Fungsi

| Halaman | Fungsi |
|---|---|
| Overview | KPI hari ini, alert volume chart (1 jam), donut by category, top attacker IPs, top triggered rules, 10 recent events |
| Event Log | Tabel semua alert, filter (search, priority, category, IP, port), pagination 50/page |
| Analytics | Timeline chart (1H/6H/24H/7D/30D), by category, top IPs, by protocol — semua dengan range selector |
| Rules | Tabel parsed `local.rules` — SID, msg, protocol, priority, classtype |
| Settings | Info read-only: status Snort, status parser, DB size, total records, paths, last parser log |

---

## Database Schema (relevant)

### `alerts`
| Kolom | Tipe |
|---|---|
| id | INTEGER PK |
| timestamp | TEXT (`YYYY-MM-DD HH:MM:SS WIB`) |
| src_ip | TEXT |
| src_port | INTEGER / NULL |
| dst_ip | TEXT |
| dst_port | INTEGER / NULL |
| protocol | TEXT |
| sid | INTEGER |
| generator | INTEGER |
| rev | INTEGER |
| msg | TEXT |
| priority | INTEGER (1=Critical, 2=Warning, 3=Info) |
| classtype | TEXT |
| category | TEXT |
| created_at | TEXT |

### `notif_log`
| Kolom | Tipe |
|---|---|
| id | INTEGER PK |
| sid | INTEGER |
| src_ip | TEXT |
| category | TEXT |
| sent_at | TEXT |

---

## Keputusan Desain

- **Read-only** — tidak ada form input yang mengubah DB atau config
- **No WebSocket** — polling cukup untuk lab, WebSocket overkill
- **Agregasi di SQL** — bukan lazy loading, query sudah di-group sebelum dikirim ke frontend
- **OWASP field dihapus** — tidak dipakai di parser maupun dashboard
- **Modular JS** — tiap halaman punya file JS sendiri, `base.js` hanya untuk shared logic
- **Satu instance Snort** — hanya `ens37`, mencegah race condition dua proses nulis ke file yang sama
