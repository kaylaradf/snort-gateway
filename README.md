# PERKUTUT — Snort Gateway

**Pemantau Event & Rekon Keamanan Untuk Tindak Ulang Terstruktur**

Sistem monitoring IDS berbasis Snort 2.9.x dengan pipeline lengkap: parsing alert realtime, penyimpanan ke SQLite, notifikasi ke Telegram dan/atau WhatsApp Group, serta dashboard web interaktif.

---

## Tech Stack

| Komponen | Detail |
|---|---|
| OS | Ubuntu 22.04 / 24.04 |
| IDS | Snort 2.9.20 |
| Python | 3.12.x |
| Database | SQLite3 (stdlib) |
| Notifikasi | Telegram Bot API + WhatsApp (Baileys) |
| Dashboard | Flask 3.x + Chart.js 4.x |
| Services | systemd (`snort-gateway`, `snort-gateway-dashboard`, `wa-gateway`) |
| Dependencies | `requests`, `flask`, `node.js 20+` (opsional untuk WA) |

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
    ├── [jika telegram.enabled=true]  → Telegram Bot API
    └── [jika whatsapp.enabled=true]  → wa-gateway (HTTP POST :3001)
                                              └── Baileys → WhatsApp Group

/var/log/snort/ids_alerts.db
    │
    │  read-only queries
    ▼
dashboard/app.py (Flask, port 5000)
    └── http://<server>:5000
```

---

## Struktur Direktori

```
snort-gateway/                       ← repo
├── parser.py                        # Parser Snort alert
├── requirements.txt                 # Python dependencies
├── snort-gateway.service            # systemd: parser
├── snort-gateway-dashboard.service  # systemd: dashboard
├── wa-gateway.service               # systemd: WhatsApp gateway
├── local.rules                      # Snort rules yang di-cover
├── install.sh                       # Installer interaktif
├── uninstall.sh                     # Uninstaller
├── README.md / INSTALL.md / UNINSTALL.md
├── dashboard/
│   ├── app.py                       # Flask backend + semua API endpoint
│   ├── templates/
│   │   ├── base.html                # Layout (sidebar, topbar, palette)
│   │   ├── overview.html            # KPI, chart, recent events
│   │   ├── eventlog.html            # Tabel alert + search + filter
│   │   ├── analytics.html           # Timeline, donut, top IPs
│   │   ├── rules.html               # Tabel local.rules
│   │   ├── settings.html            # Config editor, WA gateway, activity log
│   │   └── about.html               # Info tim
│   └── static/
│       ├── css/style.css            # Styles + 8 color palettes (incl. Light)
│       ├── js/base.js               # Clock, palette switcher, page transition
│       ├── js/overview.js           # Overview page logic
│       ├── js/eventlog.js           # Event log + search debounce
│       ├── js/analytics.js          # Analytics charts
│       ├── js/rules.js              # Rules table
│       ├── js/settings.js           # Settings page logic
│       └── logorks.png              # Logo PERKUTUT
└── wa-gateway/
    ├── server.js                    # HTTP server + Baileys WA client
    ├── setup.js                     # Onboarding: scan QR, pilih group
    ├── package.json
    ├── config.json                  # Group JID + port  ← JANGAN di-commit
    └── auth_info/                   # Session WhatsApp  ← JANGAN di-commit
```

---

## Konfigurasi (`config.ini`)

File ini dibuat otomatis oleh `install.sh`. Lokasi: `/opt/ids-dashboard/config.ini`

```ini
[telegram]
bot_token = <your_bot_token>
chat_id   = <your_chat_id>
enabled   = true              # true/false — aktifkan notifikasi Telegram

[paths]
alert_log = /var/log/snort/snort.alert.fast
db_path   = /var/log/snort/ids_alerts.db
pos_file  = /var/log/snort/parser.pos
log_file  = /var/log/snort/parser.log

[settings]
dedup_window_seconds   = 5    # sid+src_ip sama dalam N detik → skip notif
min_priority_notify    = 2    # priority > nilai ini → simpan DB saja, tidak notif
poll_interval_seconds  = 1    # interval polling alert log
max_notif_per_category = 1

[whatsapp]
enabled     = false           # true/false — aktifkan notifikasi WhatsApp
gateway_url = http://127.0.0.1:3001/send
```

> Config bisa diedit dari dashboard di halaman **Settings → config.ini**.
> Field `enabled` dikelola terpisah — **jangan edit manual** kecuali terpaksa.

### Cara dapat Bot Token & Chat ID Telegram
1. Buka [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Kirim pesan ke bot, buka `https://api.telegram.org/bot<TOKEN>/getUpdates` → ambil `chat.id`

---

## Database Schema

### Tabel `alerts`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INTEGER PK | Auto increment |
| timestamp | TEXT | `YYYY-MM-DD HH:MM:SS WIB` |
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
| 1000001–1000004 | HTTP GET/POST/PUT/DELETE | Web Traffic |
| 2000001–2000005 | Possible Nmap SYN/FIN/NULL/XMAS/UDP Scan | Reconnaissance |
| 2100001–2100003 | Nmap HTTP Probe / Aggressive Scan | Reconnaissance |

---

## Logika Notifikasi

| Kondisi | Aksi |
|---|---|
| Priority 1 | 🔴 CRITICAL — notif ke channel yang aktif |
| Priority 2 | 🟠 WARNING — notif ke channel yang aktif |
| Priority 3+ | Simpan DB saja, tidak notif |
| Priority 0 | Skip sepenuhnya |
| SID 527 dari `0.0.0.0` / `::` | Skip (DHCP noise) |
| `sid + src_ip` sama dalam `dedup_window_seconds` | Skip notif, tetap masuk DB |
| `telegram.enabled = false` | Skip Telegram |
| `whatsapp.enabled = false` | Skip WhatsApp |

---

## Dashboard

Akses di `http://<server-ip>:5000`

| Halaman | Fungsi |
|---|---|
| Overview | KPI cards, line chart (5-min bucket), donut by category, top IPs, top rules, recent events |
| Event Log | Tabel semua alert, search dengan debounce (ip/port/sid/msg/category), filter priority, pagination |
| Analytics | Timeline multi-range (1H/6H/24H/7D/30D), top IPs bar chart, donut, by protocol |
| Rules | Tabel semua rule dari `local.rules` |
| Settings | System status + restart, WhatsApp gateway info + ganti group, config.ini editor, activity log |
| About | Info tim pengembang |

### Color Palettes
Midnight (default) · Dracula · Monokai · Solarized · One Dark · Tokyo Night · Gruvbox · Light

---

## Snort Requirements

```
# /etc/snort/snort.conf
output alert_fast: snort.alert.fast
```

```bash
# /etc/default/snort — satu interface saja
DEBIAN_SNORT_INTERFACE="ens37"
```

> Dua instance Snort menulis ke file yang sama → race condition → alert hilang.

---

## Instalasi

```bash
git clone https://github.com/kaylaradf/snort-gateway.git
cd snort-gateway
sudo bash install.sh
```

Lihat [INSTALL.md](./INSTALL.md) untuk panduan lengkap.

## Uninstall

```bash
sudo bash uninstall.sh
```

Lihat [UNINSTALL.md](./UNINSTALL.md) untuk detail.

---

## Service Management

```bash
# Status
sudo systemctl status snort-gateway
sudo systemctl status snort-gateway-dashboard
sudo systemctl status wa-gateway

# Restart
sudo systemctl restart snort-gateway
sudo systemctl restart snort-gateway-dashboard
sudo systemctl restart wa-gateway

# Log realtime
journalctl -u snort-gateway -f
journalctl -u wa-gateway -f
tail -f /var/log/snort/parser.log
```

---

## Catatan Keamanan

- `config.ini` mengandung Telegram credentials — **jangan di-commit** (sudah ada di `.gitignore`)
- `wa-gateway/config.json` dan `wa-gateway/auth_info/` — **jangan di-commit**
- Dashboard berjalan di port 5000 tanpa autentikasi — **batasi akses dengan firewall**
- Restart service dari dashboard membutuhkan sudoers — dikonfigurasi otomatis oleh `install.sh`
