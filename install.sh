#!/usr/bin/env bash
# install.sh — Snort Gateway installer
# Jalankan dengan: sudo bash install.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() { echo -e "\n${CYAN}${BOLD}━━ $1 ━━${NC}"; }
ask()     { echo -e "${YELLOW}[?]${NC} $1"; }

# ── Cek root ──────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Jalankan sebagai root: sudo bash install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
echo "  ██████  ███████ ██████  ██   ██ ██    ██ ████████ ██    ██ ████████"
echo "  ██   ██ ██      ██   ██ ██  ██  ██    ██    ██    ██    ██    ██   "
echo "  ██████  █████   ██████  █████   ██    ██    ██    ██    ██    ██   "
echo "  ██      ██      ██   ██ ██  ██  ██    ██    ██    ██    ██    ██   "
echo "  ██      ███████ ██   ██ ██   ██  ██████     ██     ██████     ██   "
echo -e "${NC}"
echo -e "  ${BOLD}Pemantau Event & Rekon Keamanan Untuk Tindak Ulang Terstruktur${NC}"
echo -e "  Snort Gateway Installer\n"

# ── Cek dependensi ────────────────────────────────────────────────────────────
section "Mengecek Dependensi"

# Snort
if command -v snort &>/dev/null; then
    SNORT_VER=$(snort -V 2>&1 | grep -oP 'Version \S+' | head -1)
    info "Snort ditemukan: $SNORT_VER"
else
    error "Snort tidak ditemukan. Install Snort 2.9.x terlebih dahulu."
fi

# Python 3.10+
PY=$(command -v python3) || error "python3 tidak ditemukan"
PY_VER=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
$PY -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" \
    || error "Python 3.10+ dibutuhkan, ditemukan $PY_VER"
info "Python $PY_VER ditemukan"

# requests
if ! $PY -c "import requests" 2>/dev/null; then
    warn "requests tidak ditemukan, menginstall..."
    if command -v pip3 &>/dev/null; then
        pip3 install -q requests
    else
        apt-get install -y python3-requests &>/dev/null || \
            $PY -m pip install -q requests
    fi
    info "requests terinstall"
else
    info "requests ditemukan"
fi

# Flask
if ! $PY -c "import flask" 2>/dev/null; then
    warn "Flask tidak ditemukan, menginstall..."
    if apt-get install -y python3-flask &>/dev/null; then
        info "Flask terinstall via apt"
    else
        pip3 install -q flask || $PY -m pip install -q flask
        info "Flask terinstall via pip"
    fi
else
    FLASK_VER=$($PY -c "import flask; print(flask.__version__)")
    info "Flask $FLASK_VER ditemukan"
fi

# systemd
command -v systemctl &>/dev/null || error "systemd tidak ditemukan"
info "systemd ditemukan"

# ── Cek file source ───────────────────────────────────────────────────────────
section "Mengecek File Source"
for f in parser.py requirements.txt snort-gateway.service snort-gateway-dashboard.service; do
    [[ -f "$SCRIPT_DIR/$f" ]] || error "File $f tidak ditemukan di $SCRIPT_DIR"
    info "  $f ✓"
done
[[ -d "$SCRIPT_DIR/dashboard" ]] || error "Direktori dashboard/ tidak ditemukan"
info "  dashboard/ ✓"

# ── Cek snort.conf ────────────────────────────────────────────────────────────
section "Mengecek Konfigurasi Snort"
SNORT_CONF="/etc/snort/snort.conf"
[[ -f "$SNORT_CONF" ]] || error "snort.conf tidak ditemukan di $SNORT_CONF"

if ! grep -q "^output alert_fast" "$SNORT_CONF"; then
    warn "output alert_fast tidak ditemukan di snort.conf"
    echo "    Menambahkan: output alert_fast: snort.alert.fast"
    echo "output alert_fast: snort.alert.fast" >> "$SNORT_CONF"
    warn "Snort perlu di-restart setelah instalasi"
else
    info "output alert_fast sudah dikonfigurasi"
fi

# ── Onboarding config.ini ─────────────────────────────────────────────────────
section "Konfigurasi"

INSTALL_DIR="/opt/ids-dashboard"
CONFIG="$INSTALL_DIR/config.ini"
mkdir -p "$INSTALL_DIR"
mkdir -p "/var/log/snort"

if [[ -f "$CONFIG" ]]; then
    warn "config.ini sudah ada di $CONFIG"
    read -rp "    Timpa dengan konfigurasi baru? (y/N): " overwrite
    [[ "$overwrite" =~ ^[Yy]$ ]] || { info "Menggunakan config.ini yang ada"; SKIP_CONFIG=1; }
fi

if [[ -z "$SKIP_CONFIG" ]]; then
    echo ""
    echo -e "  ${BOLD}Telegram Bot${NC}"
    echo -e "  ${CYAN}Cara dapat token: @BotFather → /newbot${NC}"
    echo -e "  ${CYAN}Cara dapat chat_id: kirim pesan ke bot, buka https://api.telegram.org/bot<TOKEN>/getUpdates${NC}"
    echo ""
    read -rp "  Bot Token : " BOT_TOKEN
    read -rp "  Chat ID   : " CHAT_ID
    [[ -z "$BOT_TOKEN" ]] && error "Bot Token tidak boleh kosong"
    [[ -z "$CHAT_ID" ]]   && error "Chat ID tidak boleh kosong"

    echo ""
    echo -e "  ${BOLD}Paths${NC} (tekan Enter untuk pakai default)"
    read -rp "  Alert log  [/var/log/snort/snort.alert.fast]: " ALERT_LOG
    read -rp "  DB path    [/var/log/snort/ids_alerts.db]:    " DB_PATH
    read -rp "  Pos file   [/var/log/snort/parser.pos]:       " POS_FILE
    read -rp "  Log file   [/var/log/snort/parser.log]:       " LOG_FILE
    ALERT_LOG="${ALERT_LOG:-/var/log/snort/snort.alert.fast}"
    DB_PATH="${DB_PATH:-/var/log/snort/ids_alerts.db}"
    POS_FILE="${POS_FILE:-/var/log/snort/parser.pos}"
    LOG_FILE="${LOG_FILE:-/var/log/snort/parser.log}"

    echo ""
    echo -e "  ${BOLD}Settings${NC} (tekan Enter untuk pakai default)"
    read -rp "  Dedup window seconds   [5]:  " DEDUP
    read -rp "  Min priority notify    [2]:  " MIN_PRIO
    read -rp "  Poll interval seconds  [1]:  " POLL
    read -rp "  Max notif per category [1]:  " MAX_NOTIF
    DEDUP="${DEDUP:-5}"
    MIN_PRIO="${MIN_PRIO:-2}"
    POLL="${POLL:-1}"
    MAX_NOTIF="${MAX_NOTIF:-1}"

    info "Menulis config.ini..."
    cat > "$CONFIG" <<EOF
[telegram]
bot_token = $BOT_TOKEN
chat_id   = $CHAT_ID

[paths]
alert_log = $ALERT_LOG
db_path   = $DB_PATH
pos_file  = $POS_FILE
log_file  = $LOG_FILE

[settings]
dedup_window_seconds   = $DEDUP
min_priority_notify    = $MIN_PRIO
poll_interval_seconds  = $POLL
max_notif_per_category = $MAX_NOTIF
EOF
    chmod 600 "$CONFIG"
    info "config.ini tersimpan (mode 600)"
fi

# ── Copy file ─────────────────────────────────────────────────────────────────
section "Menginstall File"

info "Menyalin parser.py"
cp "$SCRIPT_DIR/parser.py" "$INSTALL_DIR/parser.py"

info "Menyalin dashboard/"
rm -rf "$INSTALL_DIR/dashboard"
cp -r "$SCRIPT_DIR/dashboard" "$INSTALL_DIR/dashboard"

if [[ -f "$SCRIPT_DIR/local.rules" ]]; then
    info "Menyalin local.rules ke /etc/snort/rules/"
    cp "$SCRIPT_DIR/local.rules" /etc/snort/rules/local.rules
fi

# ── Sudoers untuk restart dari dashboard ─────────────────────────────────────
section "Mengkonfigurasi Sudoers"
SUDOERS_FILE="/etc/sudoers.d/snort-gateway"
DASH_USER=$(stat -c '%U' "$INSTALL_DIR/dashboard/app.py" 2>/dev/null || echo "root")
cat > "$SUDOERS_FILE" <<EOF
# Snort Gateway — izinkan restart service dari dashboard
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway-dashboard
EOF
chmod 440 "$SUDOERS_FILE"
info "Sudoers dikonfigurasi di $SUDOERS_FILE"

# ── Install systemd services ──────────────────────────────────────────────────
section "Menginstall Systemd Services"

# Hapus service lama jika ada
for old in ids-parser ids-parser.service; do
    if systemctl is-active --quiet "$old" 2>/dev/null; then
        info "Menghentikan service lama: $old"
        systemctl stop "$old" 2>/dev/null || true
    fi
    if systemctl is-enabled --quiet "$old" 2>/dev/null; then
        systemctl disable "$old" 2>/dev/null || true
    fi
    rm -f "/etc/systemd/system/${old}.service"
done

cp "$SCRIPT_DIR/snort-gateway.service"           /etc/systemd/system/snort-gateway.service
cp "$SCRIPT_DIR/snort-gateway-dashboard.service" /etc/systemd/system/snort-gateway-dashboard.service
systemctl daemon-reload

systemctl enable snort-gateway
systemctl enable snort-gateway-dashboard
info "snort-gateway.service enabled"
info "snort-gateway-dashboard.service enabled"

# ── Selesai ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Instalasi selesai!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Langkah selanjutnya:"
echo ""
echo "  1. Test parser manual:"
echo "     python3 $INSTALL_DIR/parser.py"
echo ""
echo "  2. Start services:"
echo "     sudo systemctl start snort-gateway"
echo "     sudo systemctl start snort-gateway-dashboard"
echo ""
echo "  3. Cek status:"
echo "     sudo systemctl status snort-gateway"
echo "     sudo systemctl status snort-gateway-dashboard"
echo ""
echo "  4. Akses dashboard:"
echo "     http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "  5. Monitor log:"
echo "     tail -f /var/log/snort/parser.log"
echo "     journalctl -u snort-gateway -f"
echo ""
