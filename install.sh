#!/usr/bin/env bash
# install.sh — IDS Parser installer
# Jalankan dengan: sudo bash install.sh
# Harus dijalankan dari direktori yang sama dengan parser.py

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Cek root ──────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Jalankan sebagai root: sudo bash install.sh"

# ── Cek file yang dibutuhkan ada di direktori ini ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for f in parser.py requirements.txt ids-parser.service; do
    [[ -f "$SCRIPT_DIR/$f" ]] || error "File $f tidak ditemukan di $SCRIPT_DIR"
done

# ── Cek Snort terinstall ──────────────────────────────────────────────────────
command -v snort &>/dev/null || error "Snort tidak ditemukan. Install Snort 2.9.x terlebih dahulu."
info "Snort ditemukan: $(snort -V 2>&1 | grep Version | xargs)"

# ── Cek Python 3.10+ ─────────────────────────────────────────────────────────
PY=$(command -v python3) || error "python3 tidak ditemukan"
PY_VER=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
$PY -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" \
    || error "Python 3.10+ dibutuhkan, ditemukan $PY_VER"
info "Python $PY_VER ditemukan"

# ── Cek output alert_fast di snort.conf ──────────────────────────────────────
SNORT_CONF="/etc/snort/snort.conf"
[[ -f "$SNORT_CONF" ]] || error "snort.conf tidak ditemukan di $SNORT_CONF"
if ! grep -q "^output alert_fast" "$SNORT_CONF"; then
    warn "output alert_fast tidak ditemukan di snort.conf"
    echo "    Menambahkan: output alert_fast: snort.alert.fast"
    echo "output alert_fast: snort.alert.fast" >> "$SNORT_CONF"
    warn "Snort perlu di-restart setelah instalasi: sudo systemctl restart snort"
fi

# ── Buat direktori ────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/ids-dashboard"
LOG_DIR="/var/log/snort"
info "Membuat direktori $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# ── Copy file ─────────────────────────────────────────────────────────────────
info "Menyalin parser.py dan requirements.txt"
cp "$SCRIPT_DIR/parser.py"        "$INSTALL_DIR/parser.py"
cp "$SCRIPT_DIR/requirements.txt" "$INSTALL_DIR/requirements.txt"

# ── Install dependencies ──────────────────────────────────────────────────────
info "Menginstall Python dependencies"
if command -v pip3 &>/dev/null; then
    pip3 install -q -r "$INSTALL_DIR/requirements.txt"
else
    $PY -m pip install -q -r "$INSTALL_DIR/requirements.txt"
fi

# ── Buat config.ini kalau belum ada ──────────────────────────────────────────
CONFIG="$INSTALL_DIR/config.ini"
if [[ -f "$CONFIG" ]]; then
    warn "config.ini sudah ada, tidak ditimpa"
else
    info "Membuat template config.ini"
    cat > "$CONFIG" <<'EOF'
[telegram]
bot_token = GANTI_DENGAN_BOT_TOKEN
chat_id   = GANTI_DENGAN_CHAT_ID

[paths]
alert_log = /var/log/snort/snort.alert.fast
db_path   = /var/log/snort/ids_alerts.db
pos_file  = /var/log/snort/parser.pos
log_file  = /var/log/snort/parser.log

[settings]
dedup_window_seconds   = 2
min_priority_notify    = 2
poll_interval_seconds  = 1
max_notif_per_category = 1
EOF
    warn "Isi config.ini sebelum menjalankan parser: nano $CONFIG"
fi

# ── Install systemd service ───────────────────────────────────────────────────
info "Menginstall systemd service"
cp "$SCRIPT_DIR/ids-parser.service" /etc/systemd/system/ids-parser.service
systemctl daemon-reload
systemctl enable ids-parser

# ── Selesai ───────────────────────────────────────────────────────────────────
echo ""
info "Instalasi selesai!"
echo ""
echo "  Langkah selanjutnya:"
echo "  1. Isi config:   nano $CONFIG"
echo "  2. Test manual:  python3 $INSTALL_DIR/parser.py"
echo "  3. Start:        sudo systemctl start ids-parser"
echo "  4. Cek log:      tail -f $LOG_DIR/parser.log"
echo ""
