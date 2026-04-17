# PERKUTUT — Snort Gateway

**Pemantau Event & Rekon Keamanan Untuk Tindak Ulang Terstruktur**

Sistem monitoring IDS berbasis Snort 2.9.x dengan pipeline lengkap: parsing alert realtime, penyimpanan ke SQLite, notifikasi Telegram, dan dashboard web interaktif.

---

## Tech Stack

| Komponen | Detail |
|---|---|
| OS | Ubuntu 22.04 / 24.04 |
| IDS | Snort 2.9.20 |
| Python | 3.12.x |
| Database | SQLite3 (stdlib) |
| Notifikasi | Telegram Bot API |
| Dashboard | Flask 3.x + Chart.js 4.x |
| Service | systemd (`snort-gateway`) |
| Dependencies | `requests>=2.31.0`, `flask>=3.0.0` |

---

## Arsitektur Pipeline

```
Snort 2.9.x (ens37)
    │
    │  output alert_fast → snort.alert.fast
    ▼
/var/log/snort/snort.alert.fast
    │
    │  tail realtime (position tracking, restart-safe)
    ▼
parser.py
    ├── parse regex → dict
    ├── filter (DHCP noise SID 527, priority 0)
    ├── save → SQLite (alerts)
    ├── dedup check → notif_log (sid + src_ip, window N detik)
    └── send → Telegram Bot API
    
/var/log/snort/ids_alerts.db
    │
    │  read-only queries
    ▼
dashboard/app.py (Flask, port 5000)
    └── browser → http://<server>:5000
```

---

## Struktur Direktori

```
/root/ids-gateway/              ← repo utama
├── parser.py                   # Parser Snort alert
├── config.ini                  # Konfigurasi (JANGAN di-commit)
├── requirements.txt            # Python dependencies
├── snort-gateway.service       # systemd unit file
├── local.rules                 # Snort rules yang di-cover
├── install.sh                  # Installer otomatis
├── uninstall.sh                # Uninstaller
├── README.md
├── INSTALL.md
├── UNINSTALL.md
└── dashboard/
    ├── app.py                  # Flask backend (semua API endpoint)
    ├── templates/
    │   ├── base.html           # Layout utama (sidebar, topbar)
    │   ├── overview.html       # Halaman Overview
    │   ├── eventlog.html       # Halaman Event Log
    │   ├── analytics.html      # Halaman Analytics
    │   ├── rules.html          # Halaman Rules
    │   ├── settings.html       # Halaman Settings + config editor
    │   └── about.html          # Halaman About (team)
    ├── static/
    │   ├── css/style.css       # Semua styles + 7 color palettes
    │   ├── js/base.js          # Shared: clock, palette switcher, status poll
    │   ├── js/overview.js      # Overview: KPI, charts, recent events
    │   ├── js/eventlog.js      # Event Log: search, filter, pagination
    │   ├── js/analytics.js     # Analytics: timeline, donut, top IPs
    │   ├── js/rules.js         # Rules: tabel local.rules
    │   ├── js/settings.js      # Settings: config editor, restart, terminal log
    │   └── logorks.png         # Logo PERKUTUT
    └── assets/
        └── logorks.png

/opt/ids-dashboard/             ← direktori instalasi runtime
├── parser.py
└── config.ini

/var/log/snort/
├── snort.alert.fast            # Alert log Snort (input parser)
├── ids_alerts.db               # SQLite database
├── parser.pos                  # Posisi baca terakhir
├── parser.log                  # Log parser
└── dashboard-activity.log      # Log aktivitas dashboard (settings)
```

---

## Konfigurasi (`config.ini`)

```ini
[telegram]
bot_token = <your_bot_token>
chat_id   = <your_chat_id>

[paths]
alert_log = /var/log/snort/snort.alert.fast
db_path   = /var/log/snort/ids_alerts.db
pos_file  = /var/log/snort/parser.pos
log_file  = /var/log/snort/parser.log

[settings]
dedup_window_seconds   = 5      # sid+src_ip sama dalam N detik → skip notif
min_priority_notify    = 2      # priority > nilai ini → simpan DB saja, tidak notif
poll_interval_seconds  = 1      # interval polling alert log
max_notif_per_category = 1
```

> Config juga bisa diedit langsung dari dashboard di halaman **Settings**.

### Cara dapat Bot Token & Chat ID Telegram
1. Buka [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Kirim pesan ke bot, buka `https://api.telegram.org/bot<TOKEN>/getUpdates` → ambil `chat.id`

---

## Database Schema

### Tabel `alerts`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INTEGER PK | Auto increment |
| timestamp | TEXT | Format: `YYYY-MM-DD HH:MM:SS WIB` |
| src_ip | TEXT | Source IP |
| src_port | INTEGER | NULL untuk ICMP |
| dst_ip | TEXT | Destination IP |
| dst_port | INTEGER | NULL untuk ICMP |
| protocol | TEXT | TCP / UDP / ICMP |
| sid | INTEGER | Snort rule SID |
| generator | INTEGER | Generator ID |
| rev | INTEGER | Rule revision |
| msg | TEXT | Alert message |
| priority | INTEGER | 1=Critical, 2=Warning, 3=Info |
| classtype | TEXT | Snort classtype |
| category | TEXT | Custom category (SID mapping) |
| created_at | TEXT | Waktu insert ke DB (UTC) |

### Tabel `notif_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INTEGER PK | Auto increment |
| sid | INTEGER | SID yang dikirim |
| src_ip | TEXT | Source IP |
| category | TEXT | Category alert |
| sent_at | TEXT | Waktu notif dikirim |

---

## SID → Category Mapping

| SID | Message | Category |
|---|---|---|
| 527 | BAD-TRAFFIC same SRC/DST | Bad Traffic |
| 621 | SCAN FIN | Reconnaissance |
| 1228 | SCAN nmap XMAS | Reconnaissance |
| 1418 | SNMP request tcp | Reconnaissance |
| 1421 | SNMP AgentX/tcp request | Reconnaissance |
| 1000099 | ICMP PING Detected | ICMP |
| 1000001–1000004 | HTTP GET/POST/PUT/DELETE WP Container | Web Traffic |
| 2000001–2000005 | Possible Nmap SYN/FIN/NULL/XMAS/UDP Scan | Reconnaissance |
| 2100001–2100003 | Nmap HTTP Probe / Aggressive Scan | Reconnaissance |

---

## Logika Notifikasi

| Kondisi | Aksi |
|---|---|
| Priority 1 | 🔴 CRITICAL — selalu notif Telegram |
| Priority 2 | 🟠 WARNING — selalu notif Telegram |
| Priority 3+ | Simpan DB saja, tidak notif |
| Priority 0 | Skip sepenuhnya |
| SID 527 dari `0.0.0.0` / `::` | Skip (DHCP noise) |
| `sid + src_ip` sama dalam `dedup_window_seconds` | Skip notif, tetap masuk DB |

---

## Dashboard

Akses di `http://<server-ip>:5000`

| Halaman | Fungsi |
|---|---|
| Overview | KPI cards, timeline chart, donut by category, top IPs, top rules, recent events |
| Event Log | Tabel semua alert, search (ip/port/sid/msg/category), filter priority, pagination |
| Analytics | Timeline multi-range (1H/6H/24H/7D/30D), top IPs bar chart, by protocol |
| Rules | Tabel semua rule dari `local.rules` |
| Settings | Status service, config.ini editor, restart Snort/Parser, terminal activity log |
| About | Info tim pengembang |

### Color Palettes
Midnight (default) · Dracula · Monokai · Solarized · One Dark · Tokyo Night · Gruvbox · Light

---

## Snort Requirements

### `snort.conf`
```
output alert_fast: snort.alert.fast
```

### Interface — satu saja
```bash
# /etc/default/snort
DEBIAN_SNORT_INTERFACE="ens37"
```
> Dua instance Snort menulis ke file yang sama → race condition → alert hilang.

---

## Instalasi

```bash
sudo bash install.sh
```

Lihat [INSTALL.md](./INSTALL.md) untuk panduan lengkap.

## Uninstall

```bash
sudo bash uninstall.sh
```

Lihat [UNINSTALL.md](./UNINSTALL.md) untuk detail apa yang dihapus.

---

## Service Management

```bash
# Status
sudo systemctl status snort-gateway

# Start / Stop / Restart
sudo systemctl start snort-gateway
sudo systemctl stop snort-gateway
sudo systemctl restart snort-gateway

# Log realtime
journalctl -u snort-gateway -f
tail -f /var/log/snort/parser.log
```

---

## Catatan Keamanan

- `config.ini` mengandung Telegram credentials — **jangan di-commit ke git** (sudah ada di `.gitignore`)
- Dashboard berjalan di port 5000, tidak ada autentikasi — **batasi akses dengan firewall** ke IP tertentu saja
- Dashboard hanya read-only ke database, kecuali fitur edit config dan restart service
- Restart service dari dashboard membutuhkan `sudo` tanpa password untuk `systemctl` — konfigurasi di `/etc/sudoers.d/snort-gateway`
