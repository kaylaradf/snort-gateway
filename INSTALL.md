# INSTALL — Snort Gateway

Panduan instalasi lengkap dari nol. Untuk instalasi otomatis jalankan saja:

```bash
sudo bash install.sh
```

Script akan memandu konfigurasi secara interaktif.

---

## Prerequisites

- Ubuntu 22.04 / 24.04
- Snort 2.9.x sudah terinstall dan berjalan
- Python 3.10+
- `python3-flask` atau `flask` via pip
- Akses root / sudo
- Telegram Bot Token + Chat ID (siapkan sebelum instalasi)

---

## Langkah 1 — Pastikan Snort output ke alert_fast

```bash
grep "output alert_fast" /etc/snort/snort.conf
```

Kalau belum ada, tambahkan di `snort.conf`:
```
output alert_fast: snort.alert.fast
```

Restart Snort:
```bash
sudo systemctl restart snort
```

---

## Langkah 2 — Pastikan Snort jalan di satu interface

```bash
# /etc/default/snort
DEBIAN_SNORT_INTERFACE="ens37"   # ganti sesuai interface yang menghadap attacker
```

> ⚠️ Jangan set dua interface — dua proses Snort menulis ke file yang sama menyebabkan race condition dan alert hilang.

---

## Langkah 3 — Jalankan install.sh

```bash
git clone https://github.com/kaylaradf/snort-gateway.git
cd snort-gateway
sudo bash install.sh
```

Script akan:
1. Mengecek semua dependensi (Snort, Python, Flask, requests)
2. Menginstall dependensi yang kurang secara otomatis
3. Membuat direktori `/opt/ids-dashboard/`
4. Menyalin `parser.py` dan `dashboard/`
5. Memandu pengisian `config.ini` secara interaktif (onboarding prompt)
6. Mengkonfigurasi sudoers untuk restart service dari dashboard
7. Mendaftarkan dan mengaktifkan systemd service `snort-gateway`

---

## Langkah 4 — Isi config.ini (jika skip saat onboarding)

```bash
sudo nano /opt/ids-dashboard/config.ini
```

Minimal yang harus diisi:
- `bot_token` → token dari @BotFather
- `chat_id` → chat ID Telegram

---

## Langkah 5 — Test manual

```bash
python3 /opt/ids-dashboard/parser.py
```

Trigger alert dari Snort (misal: `ping` ke target), pastikan notif masuk Telegram dan tidak ada error.

---

## Langkah 6 — Start service

```bash
sudo systemctl start snort-gateway
sudo systemctl status snort-gateway
```

---

## Langkah 7 — Akses Dashboard

Buka browser di: `http://<IP-SERVER>:5000`

---

## Monitoring

```bash
# Log parser realtime
tail -f /var/log/snort/parser.log

# Log service
journalctl -u snort-gateway -f

# Cek alert terbaru di DB
python3 -c "
import sqlite3
conn = sqlite3.connect('/var/log/snort/ids_alerts.db')
rows = conn.execute('SELECT timestamp, sid, msg, src_ip, priority FROM alerts ORDER BY id DESC LIMIT 10').fetchall()
for r in rows: print(r)
"
```

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Fix |
|---|---|---|
| Parser jalan tapi tidak ada alert masuk DB | Snort tidak output ke `alert_fast` | Cek `snort.conf`, tambah `output alert_fast` |
| Alert masuk DB tapi tidak ke Telegram | Priority > `min_priority_notify` atau kena dedup | Cek `parser.log` |
| Alert muncul di Snort console tapi tidak di file | Dua instance Snort nulis ke file yang sama | Set satu interface di `DEBIAN_SNORT_INTERFACE` |
| Parser crash loop di systemd | Config salah atau file tidak ada | Jalankan manual: `python3 /opt/ids-dashboard/parser.py` |
| Dashboard tidak bisa diakses | Flask tidak jalan atau port 5000 terblokir | Cek `systemctl status snort-gateway`, cek firewall |
| Restart service dari dashboard gagal | sudoers belum dikonfigurasi | Jalankan ulang `install.sh` atau lihat bagian sudoers di bawah |

### Konfigurasi sudoers manual

Jika restart service dari dashboard tidak berfungsi:

```bash
echo "www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart snort, /bin/systemctl restart snort-gateway" \
  | sudo tee /etc/sudoers.d/snort-gateway
sudo chmod 440 /etc/sudoers.d/snort-gateway
```

> Ganti `www-data` dengan user yang menjalankan Flask jika berbeda.
