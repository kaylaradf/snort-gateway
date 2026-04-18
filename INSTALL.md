# INSTALL — Snort Gateway

Panduan instalasi lengkap. Untuk instalasi otomatis jalankan:

```bash
git clone https://github.com/kaylaradf/snort-gateway.git
cd snort-gateway
sudo bash install.sh
```

Script memandu seluruh proses secara interaktif — pilih gateway notifikasi, isi credentials, setup WhatsApp jika dipilih, dan start semua service otomatis di akhir.

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

Edit `/etc/default/snort`:
```bash
DEBIAN_SNORT_INTERFACE="ens37"   # ganti sesuai interface yang menghadap attacker
```

> ⚠️ Dua instance Snort menulis ke file yang sama → race condition → alert hilang.

Restart Snort setelah ubah interface:
```bash
sudo systemctl restart snort
```

---

## Langkah 3 — Install Node.js (hanya jika pakai WhatsApp)

Lewati langkah ini jika tidak butuh notifikasi WhatsApp.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # pastikan v20.x
```

---

## Langkah 4 — Jalankan install.sh

```bash
sudo bash install.sh
```

### Alur interaktif

```
━━ Mengecek Dependensi ━━
[+] Snort 2.9.20 ditemukan
[+] Python 3.12 ditemukan
[+] Flask ditemukan
[+] Node.js v20.x ditemukan

━━ Pilih Notification Gateway ━━

  [1] Telegram Bot
  [2] WhatsApp Group
  [3] Keduanya (Telegram + WhatsApp)

  Pilihan [1/2/3]: _
```

**Jika pilih Telegram (1 atau 3):**
```
  Telegram Bot
  Cara dapat token : @BotFather → /newbot
  Cara dapat chat_id: buka https://api.telegram.org/bot<TOKEN>/getUpdates

  Bot Token : <isi token>
  Chat ID   : <isi chat ID>
```

**Jika pilih WhatsApp (2 atau 3):**
```
━━ Setup WhatsApp Gateway ━━
  Lanjutkan setup WhatsApp sekarang? (Y/n): Y

  ── Step 1: Cek session WhatsApp
  ── Step 2: Menghubungkan ke WhatsApp
  [QR code tampil di terminal — scan dengan WhatsApp: Linked Devices → Link a Device]
  [✓] WhatsApp terhubung!
  ── Step 3: Mengambil daftar group
  ── Step 4: Pilih group tujuan notifikasi
  ── Step 5: Konfigurasi port [3001]
  ── Step 6: Menyimpan konfigurasi
  [✓] Setup selesai! wa-gateway distart otomatis.
```

Setelah semua selesai, script langsung start `snort-gateway` dan `snort-gateway-dashboard`.

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

## Ganti atau Tambah Gateway Setelah Install

**Aktifkan/nonaktifkan Telegram atau WhatsApp:**
Edit `/opt/ids-dashboard/config.ini`, ubah field `enabled` di section yang sesuai:
```ini
[telegram]
enabled = true    # atau false

[whatsapp]
enabled = true    # atau false
```
Restart parser agar perubahan berlaku:
```bash
sudo systemctl restart snort-gateway
```

**Ganti group WhatsApp:**
Bisa langsung dari dashboard di **Settings → WhatsApp Gateway → Ganti Group**.
Atau via terminal:
```bash
cd /opt/ids-dashboard/wa-gateway
node setup.js
sudo systemctl restart wa-gateway
```

**Setup ulang WhatsApp (ganti nomor / session expired):**
```bash
cd /opt/ids-dashboard/wa-gateway
rm -rf auth_info/
node setup.js
sudo systemctl restart wa-gateway
```

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Fix |
|---|---|---|
| Tidak ada alert masuk DB | Snort tidak output ke `alert_fast` | Cek `snort.conf`, tambah `output alert_fast` |
| Alert masuk DB tapi tidak ke Telegram | `enabled = false` atau priority > `min_priority_notify` | Edit `config.ini`, restart parser |
| Alert masuk DB tapi tidak ke WhatsApp | `wa-gateway` tidak jalan atau `enabled = false` | Cek `systemctl status wa-gateway` |
| Alert hilang / tidak konsisten | Dua instance Snort menulis ke file yang sama | Set satu interface di `DEBIAN_SNORT_INTERFACE` |
| `wa-gateway` tidak jalan | `config.json` belum ada | Jalankan `node setup.js` |
| Error 515 saat setup WA | Normal — WhatsApp minta restart setelah pairing | `setup.js` auto-reconnect, tunggu sebentar |
| WhatsApp logged out | Session expired atau akun di-ban | Hapus `auth_info/`, jalankan `node setup.js` ulang |
| Dashboard tidak bisa diakses dari luar | Port 5000 terblokir firewall | `ufw allow 5000` atau sesuaikan firewall |
| Restart dari dashboard gagal | sudoers belum dikonfigurasi | Jalankan ulang `install.sh` |

### Konfigurasi sudoers manual

Jika restart service dari dashboard tidak berfungsi:

```bash
cat > /etc/sudoers.d/snort-gateway << 'EOF'
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway-dashboard
root ALL=(ALL) NOPASSWD: /bin/systemctl restart wa-gateway
EOF
chmod 440 /etc/sudoers.d/snort-gateway
```
