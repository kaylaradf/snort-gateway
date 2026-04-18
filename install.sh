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

[[ $EUID -ne 0 ]] && error "Jalankan sebagai root: sudo bash install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/ids-dashboard"
CONFIG="$INSTALL_DIR/config.ini"

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

command -v snort &>/dev/null || error "Snort tidak ditemukan. Install Snort 2.9.x terlebih dahulu."
info "Snort ditemukan: $(snort -V 2>&1 | grep -oP 'Version \S+' | head -1)"

PY=$(command -v python3) || error "python3 tidak ditemukan"
PY_VER=$($PY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
$PY -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" \
    || error "Python 3.10+ dibutuhkan, ditemukan $PY_VER"
info "Python $PY_VER ditemukan"

if ! $PY -c "import requests" 2>/dev/null; then
    warn "requests tidak ditemukan, menginstall..."
    apt-get install -y python3-requests &>/dev/null || $PY -m pip install -q requests
    info "requests terinstall"
else
    info "requests ditemukan"
fi

if ! $PY -c "import flask" 2>/dev/null; then
    warn "Flask tidak ditemukan, menginstall..."
    apt-get install -y python3-flask &>/dev/null || $PY -m pip install -q flask
    info "Flask terinstall"
else
    info "Flask $($PY -c 'import flask; print(flask.__version__)') ditemukan"
fi

command -v systemctl &>/dev/null || error "systemd tidak ditemukan"
info "systemd ditemukan"

if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | tr -d 'v' | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
        info "Node.js $(node --version) ditemukan"
    else
        warn "Node.js $(node --version) terlalu lama (butuh >=20), mengupgrade..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
        apt-get install -y nodejs &>/dev/null
        info "Node.js $(node --version) terinstall"
    fi
else
    warn "Node.js tidak ditemukan, menginstall Node.js 20..."
    if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null && \
       apt-get install -y nodejs &>/dev/null; then
        info "Node.js $(node --version) terinstall"
    else
        warn "Gagal install Node.js - WhatsApp gateway tidak tersedia"
        warn "Install manual: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
        NO_NODE=1
    fi
fi

# ── Cek file source ───────────────────────────────────────────────────────────
section "Mengecek File Source"
for f in parser.py requirements.txt snort-gateway.service snort-gateway-dashboard.service wa-gateway.service; do
    [[ -f "$SCRIPT_DIR/$f" ]] || error "File $f tidak ditemukan di $SCRIPT_DIR"
    info "  $f ✓"
done
[[ -d "$SCRIPT_DIR/dashboard" ]]   || error "Direktori dashboard/ tidak ditemukan"
[[ -d "$SCRIPT_DIR/wa-gateway" ]]  || error "Direktori wa-gateway/ tidak ditemukan"
info "  dashboard/ ✓"
info "  wa-gateway/ ✓"

# ── Cek snort.conf ────────────────────────────────────────────────────────────
section "Mengecek Konfigurasi Snort"
SNORT_CONF="/etc/snort/snort.conf"
[[ -f "$SNORT_CONF" ]] || error "snort.conf tidak ditemukan di $SNORT_CONF"

if ! grep -q "^output alert_fast" "$SNORT_CONF"; then
    warn "output alert_fast tidak ditemukan di snort.conf"
    echo "output alert_fast: snort.alert.fast" >> "$SNORT_CONF"
    warn "Ditambahkan. Snort perlu di-restart setelah instalasi."
else
    info "output alert_fast sudah dikonfigurasi"
fi

# ── Pilih Notification Gateway ────────────────────────────────────────────────
section "Pilih Notification Gateway"
echo ""
echo -e "  Pilih channel notifikasi alert IDS:\n"
echo -e "  ${BOLD}[1]${NC} Telegram Bot"
echo -e "      Notifikasi via Telegram. Butuh Bot Token + Chat ID dari @BotFather."
echo ""
echo -e "  ${BOLD}[2]${NC} WhatsApp Group"
echo -e "      Notifikasi via WhatsApp group. Butuh nomor WA + scan QR."
if [[ -n "$NO_NODE" ]]; then
    echo -e "      ${RED}(tidak tersedia — Node.js belum terinstall)${NC}"
fi
echo ""
echo -e "  ${BOLD}[3]${NC} Keduanya (Telegram + WhatsApp)"
if [[ -n "$NO_NODE" ]]; then
    echo -e "      ${RED}(WhatsApp tidak tersedia — Node.js belum terinstall)${NC}"
fi
echo ""
echo -e "  ${BOLD}[4]${NC} Skip — konfigurasi manual nanti via dashboard"
echo ""

while true; do
    read -rp "  Pilihan [1/2/3/4]: " GW_CHOICE
    case "$GW_CHOICE" in
        1) GATEWAY="telegram"; break ;;
        2)
            [[ -n "$NO_NODE" ]] && { warn "Node.js tidak tersedia, pilih 1, 3, atau 4"; continue; }
            GATEWAY="whatsapp"; break ;;
        3)
            [[ -n "$NO_NODE" ]] && { warn "Node.js tidak tersedia untuk WhatsApp, pilih 1 atau 4"; continue; }
            GATEWAY="both"; break ;;
        4) GATEWAY="skip"; break ;;
        *) warn "Masukkan 1, 2, 3, atau 4" ;;
    esac
done
info "Gateway dipilih: $GATEWAY"

# ── Onboarding config.ini ─────────────────────────────────────────────────────
section "Konfigurasi"
mkdir -p "$INSTALL_DIR"
mkdir -p "/var/log/snort"

if [[ -f "$CONFIG" ]]; then
    warn "config.ini sudah ada di $CONFIG"
    read -rp "    Timpa dengan konfigurasi baru? (y/N): " overwrite
    [[ "$overwrite" =~ ^[Yy]$ ]] || { info "Menggunakan config.ini yang ada"; SKIP_CONFIG=1; }
fi

if [[ -z "$SKIP_CONFIG" ]]; then

    # Telegram credentials
    BOT_TOKEN="GANTI_DENGAN_BOT_TOKEN"
    CHAT_ID="GANTI_DENGAN_CHAT_ID"
    TG_ENABLED="false"

    if [[ "$GATEWAY" == "telegram" || "$GATEWAY" == "both" ]]; then
        echo ""
        echo -e "  ${BOLD}Telegram Bot${NC}"
        echo -e "  ${CYAN}Cara dapat token : @BotFather → /newbot${NC}"
        echo -e "  ${CYAN}Cara dapat chat_id: kirim pesan ke bot, buka${NC}"
        echo -e "  ${CYAN}  https://api.telegram.org/bot<TOKEN>/getUpdates${NC}"
        echo ""
        read -rp "  Bot Token : " BOT_TOKEN
        read -rp "  Chat ID   : " CHAT_ID
        [[ -z "$BOT_TOKEN" ]] && error "Bot Token tidak boleh kosong"
        [[ -z "$CHAT_ID" ]]   && error "Chat ID tidak boleh kosong"
        TG_ENABLED="true"
        info "Telegram dikonfigurasi"
    fi

    # Paths
    echo ""
    echo -e "  ${BOLD}Paths${NC} (Enter untuk pakai default)"
    read -rp "  Alert log  [/var/log/snort/snort.alert.fast]: " ALERT_LOG
    read -rp "  DB path    [/var/log/snort/ids_alerts.db]:    " DB_PATH
    read -rp "  Pos file   [/var/log/snort/parser.pos]:       " POS_FILE
    read -rp "  Log file   [/var/log/snort/parser.log]:       " LOG_FILE
    ALERT_LOG="${ALERT_LOG:-/var/log/snort/snort.alert.fast}"
    DB_PATH="${DB_PATH:-/var/log/snort/ids_alerts.db}"
    POS_FILE="${POS_FILE:-/var/log/snort/parser.pos}"
    LOG_FILE="${LOG_FILE:-/var/log/snort/parser.log}"

    # Settings
    echo ""
    echo -e "  ${BOLD}Settings${NC} (Enter untuk pakai default)"
    read -rp "  Dedup window seconds   [5]:  " DEDUP
    read -rp "  Min priority notify    [2]:  " MIN_PRIO
    read -rp "  Poll interval seconds  [1]:  " POLL
    read -rp "  Max notif per category [1]:  " MAX_NOTIF
    DEDUP="${DEDUP:-5}"
    MIN_PRIO="${MIN_PRIO:-2}"
    POLL="${POLL:-1}"
    MAX_NOTIF="${MAX_NOTIF:-1}"

    # WA enabled flag
    WA_ENABLED="false"
    [[ "$GATEWAY" == "whatsapp" || "$GATEWAY" == "both" ]] && WA_ENABLED="true"

    info "Menulis config.ini..."
    cat > "$CONFIG" <<EOF
[telegram]
bot_token = $BOT_TOKEN
chat_id   = $CHAT_ID
enabled   = $TG_ENABLED

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

[whatsapp]
enabled     = $WA_ENABLED
gateway_url = http://127.0.0.1:3001/send
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

if [[ -z "$NO_NODE" ]]; then
    info "Menyalin wa-gateway/"
    rm -rf "$INSTALL_DIR/wa-gateway"
    cp -r "$SCRIPT_DIR/wa-gateway" "$INSTALL_DIR/wa-gateway"
    info "Menginstall Node.js dependencies wa-gateway..."
    cd "$INSTALL_DIR/wa-gateway" && npm install --omit=dev --silent 2>/dev/null
    cd "$SCRIPT_DIR"
fi

if [[ -f "$SCRIPT_DIR/local.rules" ]]; then
    if [[ -f /etc/snort/rules/local.rules ]]; then
        warn "local.rules sudah ada"
        read -rp "    Timpa dengan local.rules dari repo? (y/N): " overwrite_rules
        if [[ "$overwrite_rules" =~ ^[Yy]$ ]]; then
            cp /etc/snort/rules/local.rules /etc/snort/rules/local.rules.backup
            info "Backup: /etc/snort/rules/local.rules.backup"
            cp "$SCRIPT_DIR/local.rules" /etc/snort/rules/local.rules
            info "local.rules diperbarui"
        else
            info "local.rules dipertahankan"
        fi
    else
        cp "$SCRIPT_DIR/local.rules" /etc/snort/rules/local.rules
        info "local.rules disalin"
    fi
fi

# ── Sudoers ───────────────────────────────────────────────────────────────────
section "Mengkonfigurasi Sudoers"
cat > /etc/sudoers.d/snort-gateway <<EOF
# Snort Gateway — izinkan restart service dari dashboard
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway
root ALL=(ALL) NOPASSWD: /bin/systemctl restart snort-gateway-dashboard
root ALL=(ALL) NOPASSWD: /bin/systemctl restart wa-gateway
EOF
chmod 440 /etc/sudoers.d/snort-gateway
info "Sudoers dikonfigurasi"

# ── Install systemd services ──────────────────────────────────────────────────
section "Menginstall Systemd Services"

for old in ids-parser ids-parser.service; do
    systemctl stop "$old" 2>/dev/null || true
    systemctl disable "$old" 2>/dev/null || true
    rm -f "/etc/systemd/system/${old}.service"
done

cp "$SCRIPT_DIR/snort-gateway.service"           /etc/systemd/system/snort-gateway.service
cp "$SCRIPT_DIR/snort-gateway-dashboard.service" /etc/systemd/system/snort-gateway-dashboard.service
if [[ -z "$NO_NODE" ]]; then
    cp "$SCRIPT_DIR/wa-gateway.service" /etc/systemd/system/wa-gateway.service
fi
systemctl daemon-reload

systemctl enable snort-gateway
systemctl enable snort-gateway-dashboard
info "snort-gateway.service enabled"
info "snort-gateway-dashboard.service enabled"
if [[ -z "$NO_NODE" ]]; then
    systemctl enable wa-gateway
    info "wa-gateway.service enabled"
fi

# ── Setup WhatsApp (jika dipilih) ─────────────────────────────────────────────
if [[ "$GATEWAY" == "whatsapp" || "$GATEWAY" == "both" ]] && [[ -z "$NO_NODE" ]]; then
    section "Setup WhatsApp Gateway"
    echo ""
    warn "Sekarang akan menjalankan setup WhatsApp."
    warn "Siapkan nomor WhatsApp yang akan dipakai untuk kirim notifikasi."
    echo ""
    read -rp "  Lanjutkan setup WhatsApp sekarang? (Y/n): " do_wa_setup
    if [[ ! "$do_wa_setup" =~ ^[Nn]$ ]]; then
        info "Menjalankan wa-gateway/setup.js..."
        echo ""
        cd "$INSTALL_DIR/wa-gateway" && node setup.js
        cd "$SCRIPT_DIR"
        echo ""
        if [[ -f "$INSTALL_DIR/wa-gateway/config.json" ]]; then
            info "WhatsApp setup selesai, memulai wa-gateway service..."
            systemctl start wa-gateway
            sleep 2
            systemctl is-active --quiet wa-gateway \
                && info "wa-gateway berjalan ✓" \
                || warn "wa-gateway belum aktif, cek: journalctl -u wa-gateway -f"
        else
            warn "config.json belum tersimpan — setup mungkin belum selesai"
            warn "Jalankan manual: cd $INSTALL_DIR/wa-gateway && node setup.js"
        fi
    else
        warn "Setup WhatsApp dilewati."
        warn "Jalankan manual nanti: cd $INSTALL_DIR/wa-gateway && node setup.js"
    fi
fi

# ── Start services ────────────────────────────────────────────────────────────
section "Menjalankan Services"
systemctl restart snort-gateway
systemctl restart snort-gateway-dashboard
info "snort-gateway started"
info "snort-gateway-dashboard started"

# ── Selesai ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Instalasi selesai!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Gateway aktif  : ${GATEWAY}"
[[ "$GATEWAY" == "skip" ]] && echo -e "  ${YELLOW}[!] Gateway belum dikonfigurasi. Edit config.ini dan restart parser:${NC}"
[[ "$GATEWAY" == "skip" ]] && echo "      sudo nano /opt/ids-dashboard/config.ini"
[[ "$GATEWAY" == "skip" ]] && echo "      sudo systemctl restart snort-gateway"
echo "  Dashboard      : http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "  Service management:"
echo "    sudo systemctl status snort-gateway"
echo "    sudo systemctl status snort-gateway-dashboard"
[[ -z "$NO_NODE" ]] && echo "    sudo systemctl status wa-gateway"
echo ""
echo "  Monitor log:"
echo "    tail -f /var/log/snort/parser.log"
echo "    journalctl -u snort-gateway -f"
echo ""
