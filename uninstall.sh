#!/usr/bin/env bash
# uninstall.sh — Snort Gateway uninstaller
# Jalankan dengan: sudo bash uninstall.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Jalankan sebagai root: sudo bash uninstall.sh"

# ── Konfirmasi ────────────────────────────────────────────────────────────────
echo -e "${RED}[!] Ini akan menghapus:${NC}"
echo "    - systemd service snort-gateway + snort-gateway-dashboard"
echo "    - /opt/ids-dashboard/ (parser.py, config.ini, dashboard/)"
echo "    - /var/log/snort/parser.log"
echo "    - /var/log/snort/parser.pos"
echo "    - /var/log/snort/dashboard-activity.log"
echo "    - /etc/sudoers.d/snort-gateway"
echo ""
read -rp "Lanjutkan? (y/N): " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Dibatalkan."; exit 0; }

# Tanya soal database
echo ""
read -rp "Hapus database alerts (/var/log/snort/ids_alerts.db)? (y/N): " del_db

# ── Stop & disable services ───────────────────────────────────────────────────
for svc in snort-gateway snort-gateway-dashboard ids-parser; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        info "Menghentikan $svc"
        systemctl stop "$svc"
    fi
    if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
        info "Menonaktifkan $svc"
        systemctl disable "$svc"
    fi
    if [[ -f "/etc/systemd/system/${svc}.service" ]]; then
        info "Menghapus ${svc}.service"
        rm -f "/etc/systemd/system/${svc}.service"
    fi
done
systemctl daemon-reload

# ── Hapus direktori instalasi ─────────────────────────────────────────────────
if [[ -d /opt/ids-dashboard ]]; then
    info "Menghapus /opt/ids-dashboard/"
    rm -rf /opt/ids-dashboard
fi

# ── Hapus file log ────────────────────────────────────────────────────────────
for f in /var/log/snort/parser.log \
          /var/log/snort/parser.pos \
          /var/log/snort/dashboard-activity.log; do
    [[ -f "$f" ]] && { info "Menghapus $f"; rm -f "$f"; }
done

# ── Hapus DB (opsional) ───────────────────────────────────────────────────────
if [[ "$del_db" =~ ^[Yy]$ ]]; then
    [[ -f /var/log/snort/ids_alerts.db ]] && {
        info "Menghapus /var/log/snort/ids_alerts.db"
        rm -f /var/log/snort/ids_alerts.db
    }
else
    warn "Database dipertahankan di /var/log/snort/ids_alerts.db"
fi

# ── Hapus sudoers ─────────────────────────────────────────────────────────────
[[ -f /etc/sudoers.d/snort-gateway ]] && {
    info "Menghapus /etc/sudoers.d/snort-gateway"
    rm -f /etc/sudoers.d/snort-gateway
}

# ── Selesai ───────────────────────────────────────────────────────────────────
echo ""
info "Uninstall selesai."
warn "snort.conf, local.rules, dan snort.alert.fast tidak diubah — Snort tetap berjalan normal."
echo ""
