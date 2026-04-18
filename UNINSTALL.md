# UNINSTALL — Snort Gateway

```bash
sudo bash uninstall.sh
```

Script meminta konfirmasi sebelum menghapus apapun, dan menawarkan opsi untuk menyimpan database alert.

---

## Yang Dihapus

| Path / Service | Keterangan |
|---|---|
| `snort-gateway.service` | Di-stop, disabled, file unit dihapus |
| `snort-gateway-dashboard.service` | Di-stop, disabled, file unit dihapus |
| `wa-gateway.service` | Di-stop, disabled, file unit dihapus |
| `/opt/ids-dashboard/` | Seluruh direktori instalasi (parser, dashboard, wa-gateway, config) |
| `/var/log/snort/ids_alerts.db` | Database SQLite semua alert (**opsional** — ditanya dulu) |
| `/var/log/snort/parser.log` | Log parser |
| `/var/log/snort/parser.pos` | File posisi baca terakhir |
| `/var/log/snort/dashboard-activity.log` | Log aktivitas dashboard Settings |
| `/etc/sudoers.d/snort-gateway` | Konfigurasi sudoers untuk restart service |

## Yang TIDAK Dihapus

- `/etc/snort/snort.conf` — konfigurasi Snort tidak diubah
- `/etc/snort/rules/local.rules` — rules Snort tidak diubah
- `/var/log/snort/snort.alert.fast` — alert log Snort tidak disentuh
- Snort itu sendiri tetap berjalan normal
- Node.js tidak diuninstall

---

## Uninstall Manual

Jika script tidak tersedia:

```bash
# Stop dan hapus semua service
for svc in snort-gateway snort-gateway-dashboard wa-gateway; do
  sudo systemctl stop $svc 2>/dev/null
  sudo systemctl disable $svc 2>/dev/null
  sudo rm -f /etc/systemd/system/${svc}.service
done
sudo systemctl daemon-reload

# Hapus direktori instalasi
sudo rm -rf /opt/ids-dashboard

# Hapus log dan state (opsional)
sudo rm -f /var/log/snort/ids_alerts.db
sudo rm -f /var/log/snort/parser.log
sudo rm -f /var/log/snort/parser.pos
sudo rm -f /var/log/snort/dashboard-activity.log

# Hapus sudoers
sudo rm -f /etc/sudoers.d/snort-gateway
```
