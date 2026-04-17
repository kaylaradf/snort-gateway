# Uninstall IDS Parser

```bash
sudo bash uninstall.sh
```

Script akan meminta konfirmasi sebelum menghapus apapun.

---

## Yang Dihapus

| Path | Keterangan |
|---|---|
| `ids-parser` systemd service | Di-stop, disabled, dan file unit dihapus |
| `/opt/ids-dashboard/` | Seluruh direktori instalasi (parser.py, config.ini, dll) |
| `/var/log/snort/ids_alerts.db` | Database SQLite semua alert |
| `/var/log/snort/parser.log` | Log parser |
| `/var/log/snort/parser.pos` | File posisi baca terakhir |

## Yang TIDAK Dihapus

- `/etc/snort/snort.conf` — konfigurasi Snort tidak diubah
- `/etc/snort/rules/local.rules` — rules Snort tidak diubah
- `/var/log/snort/snort.alert.fast` — alert log Snort tidak disentuh
- Snort itu sendiri tetap berjalan normal
