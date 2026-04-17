# Install IDS Parser — Step by Step

Panduan instalasi parser dari nol di server baru yang sudah ada Snort-nya.

---

## Prerequisites

- Ubuntu 22.04 / 24.04
- Snort 2.9.x sudah terinstall dan jalan
- Python 3.10+
- Akses root / sudo
- Telegram Bot Token + Chat ID sudah siap

---

## Langkah 1 — Pastikan Snort output ke alert_fast

Cek `/etc/snort/snort.conf`:
```bash
grep "output alert_fast" /etc/snort/snort.conf
```

Kalau belum ada, tambahkan:
```
output alert_fast: snort.alert.fast
```

Lalu restart Snort:
```bash
sudo systemctl restart snort
```

---

## Langkah 2 — Pastikan Snort jalan di satu interface

```bash
# /etc/default/snort
DEBIAN_SNORT_INTERFACE="ens37"   # ganti sesuai interface kamu
```

> ⚠️ Jangan set dua interface di satu instance — dua proses Snort akan menulis ke file yang sama dan menyebabkan alert hilang.

---

## Langkah 3 — Jalankan install.sh

```bash
sudo bash install.sh
```

Script akan:
1. Membuat direktori `/opt/ids-dashboard/`
2. Menyalin `parser.py`, `requirements.txt`, `ids-parser.service`
3. Install Python dependencies
4. Membuat template `config.ini`
5. Register dan enable systemd service

---

## Langkah 4 — Isi config.ini

```bash
sudo nano /opt/ids-dashboard/config.ini
```

Ganti:
- `bot_token` → token dari @BotFather
- `chat_id` → chat ID Telegram kamu
- `alert_log` → path ke `snort.alert.fast` (default: `/var/log/snort/snort.alert.fast`)

---

## Langkah 5 — Test manual sebelum service

```bash
python3 /opt/ids-dashboard/parser.py
```

Pastikan tidak ada error. Trigger alert dari Snort (misal: `ping` ke target), cek apakah notif masuk Telegram.

---

## Langkah 6 — Start service

```bash
sudo systemctl start ids-parser
sudo systemctl status ids-parser
```

---

## Monitoring

```bash
# Log parser realtime
tail -f /var/log/snort/parser.log

# Cek alert di DB
python3 -c "
import sqlite3
conn = sqlite3.connect('/var/log/snort/ids_alerts.db')
rows = conn.execute('SELECT timestamp, sid, msg, src_ip, priority FROM alerts ORDER BY id DESC LIMIT 10').fetchall()
for r in rows: print(r)
"

# Cek notif yang terkirim
python3 -c "
import sqlite3
conn = sqlite3.connect('/var/log/snort/ids_alerts.db')
rows = conn.execute('SELECT sid, src_ip, category, sent_at FROM notif_log ORDER BY id DESC LIMIT 10').fetchall()
for r in rows: print(r)
"
```

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Fix |
|---|---|---|
| Parser jalan tapi tidak ada alert masuk DB | Snort tidak output ke `alert_fast` | Cek `snort.conf`, tambah `output alert_fast` |
| Alert masuk DB tapi tidak ke Telegram | Priority > `min_priority_notify` atau kena dedup | Cek `parser.log` untuk log `Duplikat, skip` |
| Alert muncul di Snort console tapi tidak di file | Dua instance Snort nulis ke file yang sama | Set satu interface saja di `DEBIAN_SNORT_INTERFACE` |
| Parser crash loop di systemd | Error di startup (config salah, file tidak ada) | Jalankan manual dulu: `python3 /opt/ids-dashboard/parser.py` |
| Notif spam saat pentest | `dedup_window_seconds` terlalu besar | Turunkan ke `2` di `config.ini` |
