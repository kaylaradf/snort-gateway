# INSTALL — Snort Gateway

Panduan instalasi lengkap. Untuk instalasi otomatis:

```bash
sudo bash install.sh
```

Script akan memandu seluruh proses secara interaktif — termasuk pilih gateway notifikasi, isi credentials, dan setup WhatsApp jika dipilih.

---

## Prerequisites

| Komponen | Keterangan |
|---|---|
| Ubuntu 22.04 / 24.04 | OS yang didukung |
| Snort 2.9.x | Sudah terinstall dan berjalan |
| Python 3.10+ | Sudah tersedia di Ubuntu 22/24 |
| Node.js 20+ | **Opsional** — hanya untuk WhatsApp gateway |
| Akses root / sudo | Dibutuhkan untuk install service |

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
DEBIAN_SNORT_INTERFACE="ens37"
```

> ⚠️ Dua instance Snort menulis ke file yang sama → race condition → alert hilang.

---

## Langkah 3 — Install Node.js (hanya jika pakai WhatsApp)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # pastikan v20.x
```

---

## Langkah 4 — Jalankan install.sh

```bash
git clone https://github.com/kaylaradf/snort-gateway.git
cd snort-gateway
sudo bash install.sh
```

### Alur interaktif install.sh

```
━━ Mengecek Dependensi ━━
[+] Snort ditemukan
[+] Python 3.12 ditemukan
[+] Flask ditemukan
[+] Node.js v20.x ditemukan   ← atau warning jika tidak ada

━━ Pilih Notification Gateway ━━

  [1] Telegram Bot
  [2] WhatsApp Group
  [3] Keduanya (Telegram + WhatsApp)

  Pilihan [1/2/3]: _
```

**Jika pilih Telegram (1 atau 3):**
```
━━ Konfigurasi ━━
  Telegram Bot
  Bot Token : <isi token dari @BotFather>
  Chat ID   : <isi chat ID>
```

**Jika pilih WhatsApp (2 atau 3):**
```
━━ Setup WhatsApp Gateway ━━
  Lanjutkan setup WhatsApp sekarang? (Y/n): Y

  ── Step 1: Cek session WhatsApp
  ── Step 2: Menghubungkan ke WhatsApp
  [QR code muncul di terminal — scan dengan WhatsApp]
  ── Step 3: Mengambil daftar group
  ── Step 4: Pilih group tujuan notifikasi
  ── Step 5: Konfigurasi port
  ── Step 6: Menyimpan konfigurasi
```

Setelah setup selesai, `wa-gateway` langsung distart otomatis.

---

## Langkah 5 — Verifikasi

```bash
# Cek semua service
sudo systemctl status snort-gateway
sudo systemctl status snort-gateway-dashboard
sudo systemctl status wa-gateway        # jika pakai WhatsApp

# Akses dashboard
http://<IP-SERVER>:5000

# Monitor log
tail -f /var/log/snort/parser.log
journalctl -u snort-gateway -f
```

---

## Ganti Gateway Setelah Install

Toggle Telegram/WhatsApp bisa dilakukan langsung dari dashboard di halaman **Settings → Notification Channels** tanpa perlu edit file manual.

Untuk setup ulang WhatsApp (misal ganti nomor atau group):
```bash
cd /opt/ids-dashboard/wa-gateway
rm -rf auth_info/   # hapus session lama
node setup.js
sudo systemctl restart wa-gateway
```

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Fix |
|---|---|---|
| Parser jalan tapi tidak ada alert masuk DB | Snort tidak output ke `alert_fast` | Cek `snort.conf` |
| Alert masuk DB tapi tidak ke Telegram | `enabled = false` atau priority > `min_priority_notify` | Cek Settings dashboard |
| Alert masuk DB tapi tidak ke WhatsApp | wa-gateway tidak jalan atau `enabled = false` | Cek `systemctl status wa-gateway` |
| wa-gateway tidak jalan | `config.json` belum ada | Jalankan `node setup.js` |
| QR tidak muncul di dashboard | wa-gateway belum start | `sudo systemctl start wa-gateway` |
| WhatsApp logged out | Session expired | Hapus `auth_info/`, jalankan `node setup.js` ulang |
| Dashboard tidak bisa diakses | Port 5000 terblokir | Cek firewall |
| Restart dari dashboard gagal | sudoers belum dikonfigurasi | Jalankan ulang `install.sh` |

### Konfigurasi sudoers manual

```bash
cat > /etc/sudoers.d/snort-gateway <<EOF
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway-dashboard
root ALL=(ALL) NOPASSWD: /bin/systemctl restart wa-gateway
EOF
chmod 440 /etc/sudoers.d/snort-gateway
```
