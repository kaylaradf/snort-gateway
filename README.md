# IDS Parser — Dokumentasi & Setup Guide

Parser realtime untuk Snort IDS. Membaca alert log, menyimpan ke SQLite, dan mengirim notifikasi ke Telegram.

---

## Tech Stack

| Komponen | Detail |
|---|---|
| OS | Ubuntu 24.04 |
| IDS | Snort 2.9.20 |
| Python | 3.12.3 |
| Database | SQLite3 (stdlib) |
| Notifikasi | Telegram Bot API |
| Dependency | `requests>=2.31.0` |
| Service | systemd |

---

## Arsitektur Pipeline

```
Snort 2.9.x
    │
    │  output alert_fast → snort.alert.fast
    ▼
/var/log/snort/snort.alert.fast
    │
    │  tail realtime (position tracking)
    ▼
parser.py
    ├── parse regex → dict
    ├── filter (DHCP noise, priority 0)
    ├── save → SQLite (alerts)
    ├── dedup check → notif_log (sid + src_ip, window N detik)
    └── send → Telegram Bot API
```

---

## Struktur File

```
/opt/ids-dashboard/
├── parser.py            # Parser utama
├── config.ini           # Konfigurasi (JANGAN di-commit, ada credentials)
├── requirements.txt     # Python dependencies
├── ids-parser.service   # systemd unit file
└── SETUP.md             # Quick setup

/var/log/snort/
├── snort.alert.fast     # Alert log Snort (input parser)
├── ids_alerts.db        # SQLite database
├── parser.pos           # Posisi baca terakhir (restart-safe)
└── parser.log           # Log parser
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
dedup_window_seconds  = 2       # sid+src_ip sama dalam N detik → skip
min_priority_notify   = 2       # priority > nilai ini → simpan DB saja, tidak notif
poll_interval_seconds = 1
max_notif_per_category = 1
```

### Cara dapat Bot Token & Chat ID Telegram
1. Buka [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Kirim pesan ke bot kamu, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates` → ambil `chat.id`

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
| category | TEXT | Custom category (mapping manual) |
| created_at | TEXT | Waktu insert ke DB |

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
| 1000001 | HTTP GET WP Container | Web Traffic |
| 1000002 | HTTP POST WP Container | Web Traffic |
| 1000003 | HTTP PUT WP Container | Web Traffic |
| 1000004 | HTTP DELETE WP Container | Web Traffic |
| 2000001 | Possible Nmap SYN Scan | Reconnaissance |
| 2000002 | Possible Nmap FIN Scan | Reconnaissance |
| 2000003 | Possible Nmap NULL Scan | Reconnaissance |
| 2000004 | Possible Nmap XMAS Scan | Reconnaissance |
| 2000005 | Possible Nmap UDP Scan | Reconnaissance |
| 2100001 | Nmap HTTP Probe HEAD (-sV) | Reconnaissance |
| 2100002 | NMAP HTTP Probe No User Agent (-sV) | Reconnaissance |
| 2100003 | ET SCAN Nmap Aggressive Scan Detected | Reconnaissance |

---

## Logika Notifikasi

- **Priority 1** → 🔴 CRITICAL — selalu notif
- **Priority 2** → 🟠 WARNING — selalu notif
- **Priority 3+** → simpan ke DB saja, tidak notif
- **Priority 0** → skip (rule tanpa priority di Snort default ke 0)
- **Dedup** → `sid + src_ip` sama dalam `dedup_window_seconds` → skip notif, tetap masuk DB
- **Filter DHCP** → SID 527 dari `0.0.0.0` atau `::` → skip sepenuhnya

---

## Snort Requirements

### `snort.conf` — output yang harus aktif
```
output alert_fast: snort.alert.fast
```

### Interface
Snort harus jalan di **satu interface saja** per instance yang menulis ke satu `snort.alert.fast`. Dua instance menulis ke file yang sama menyebabkan race condition.

```
# /etc/default/snort
DEBIAN_SNORT_INTERFACE="ens37"   # interface yang menghadap attacker/target
```

### `local.rules` — rules yang di-cover parser ini
Lihat file `local.rules` di direktori ini untuk rules lengkap yang sudah diuji.

---

## Setup Manual

Lihat [INSTALL.md](./INSTALL.md) untuk langkah instalasi lengkap, atau jalankan script otomatis:

```bash
sudo bash install.sh
```
