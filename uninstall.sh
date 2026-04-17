#!/usr/bin/env bash
# uninstall.sh — IDS Parser uninstaller
# Jalankan dengan: sudo bash uninstall.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Jalankan sebagai root: sudo bash uninstall.sh"

# ── Konfirmasi ────────────────────────────────────────────────────────────────
echo -e "${RED}[!] Ini akan menghapus:${NC}"
echo "    - systemd service ids-parser"
echo "    - /opt/ids-dashboard/ (parser.py, config.ini, dll)"
echo "    - /var/log/snort/ids_alerts.db"
echo "    - /var/log/snort/parser.log"
echo "    - /var/log/snort/parser.pos"
echo ""
read -rp "Lanjutkan? (y/N): " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Dibatalkan."; exit 0; }

# ── Stop & disable service ────────────────────────────────────────────────────
if systemctl is-active --quiet ids-parser 2>/dev/null; then
    info "Menghentikan ids-parser service"
    systemctl stop ids-parser
fi
if systemctl is-enabled --quiet ids-parser 2>/dev/null; then
    info "Menonaktifkan ids-parser service"
    systemctl disable ids-parser
fi
if [[ -f /etc/systemd/system/ids-parser.service ]]; then
    info "Menghapus ids-parser.service"
    rm -f /etc/systemd/system/ids-parser.service
    systemctl daemon-reload
fi

# ── Hapus direktori instalasi ─────────────────────────────────────────────────
if [[ -d /opt/ids-dashboard ]]; then
    info "Menghapus /opt/ids-dashboard/"
    rm -rf /opt/ids-dashboard
fi

# ── Hapus file log & DB ───────────────────────────────────────────────────────
for f in /var/log/snort/ids_alerts.db /var/log/snort/parser.log /var/log/snort/parser.pos; do
    if [[ -f "$f" ]]; then
        info "Menghapus $f"
        rm -f "$f"
    fi
done

# ── Selesai ───────────────────────────────────────────────────────────────────
echo ""
info "Uninstall selesai."
warn "snort.conf dan local.rules tidak diubah — Snort tetap berjalan normal."
echo ""
