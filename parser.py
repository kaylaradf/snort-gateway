#!/usr/bin/env python3
"""
Snort Alert Parser — IDS Dashboard
Tails snort.alert.fast, parses alerts, saves to SQLite, sends Telegram notifications.
"""

import re
import os
import time
import signal
import sqlite3
import logging
import configparser
from datetime import datetime, timezone, timedelta

JAKARTA_TZ = timezone(timedelta(hours=7))

import requests

# ─── CONFIG ──────────────────────────────────────────────────────────────────

CONFIG_PATH = "/opt/ids-dashboard/config.ini"

config = configparser.ConfigParser()
config.read(CONFIG_PATH)

BOT_TOKEN   = config["telegram"]["bot_token"]
CHAT_ID     = config["telegram"]["chat_id"]
TG_ENABLED  = config.getboolean("telegram", "enabled", fallback=True)
ALERT_LOG   = config["paths"]["alert_log"]
DB_PATH     = config["paths"]["db_path"]
POS_FILE    = config["paths"]["pos_file"]
LOG_FILE    = config["paths"]["log_file"]
DEDUP_WIN   = int(config["settings"]["dedup_window_seconds"])
MIN_PRIO    = int(config["settings"]["min_priority_notify"])
POLL_SEC    = float(config["settings"]["poll_interval_seconds"])

# WhatsApp gateway (opsional)
WA_ENABLED  = config.getboolean("whatsapp", "enabled", fallback=False)
WA_URL      = config.get("whatsapp", "gateway_url", fallback="http://127.0.0.1:3001/send")

# ─── LOGGING ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

# ─── SID MAPPING ─────────────────────────────────────────────────────────────

SID_CATEGORY = {
    # Bad Traffic
    527:     "Bad Traffic",
    # Reconnaissance
    621:     "Reconnaissance",
    1228:    "Reconnaissance",
    1418:    "Reconnaissance",
    1421:    "Reconnaissance",
    2000001: "Reconnaissance",
    2000002: "Reconnaissance",
    2000003: "Reconnaissance",
    2000004: "Reconnaissance",
    2000005: "Reconnaissance",
    2100001: "Reconnaissance",
    2100002: "Reconnaissance",
    2100003: "Reconnaissance",
    # ICMP
    1000099: "ICMP",
    # Web Traffic
    1000001: "Web Traffic",
    1000002: "Web Traffic",
    1000003: "Web Traffic",
    1000004: "Web Traffic",
}

# ─── REGEX ───────────────────────────────────────────────────────────────────

# Format: MM/DD-HH:MM:SS.usec  [**] [gen:sid:rev] msg [**] [Classification: ...] [Priority: N] {PROTO} src -> dst
ALERT_RE = re.compile(
    r"^(?P<ts>\d{2}/\d{2}-\d{2}:\d{2}:\d{2}\.\d+)"          # timestamp
    r"\s+\[\*\*\]\s+"
    r"\[(?P<gen>\d+):(?P<sid>\d+):(?P<rev>\d+)\]\s+"          # [gen:sid:rev]
    r"(?P<msg>.+?)\s+\[\*\*\]"                                 # msg
    r"(?:\s+\[Classification:\s*(?P<classtype>[^\]]+)\])?"     # optional classification
    r"\s+\[Priority:\s*(?P<priority>\d+)\]"                    # priority
    r"\s+\{(?P<proto>[^}]+)\}"                                 # protocol
    r"\s+(?P<src>[^\s]+)\s+->\s+(?P<dst>[^\s]+)$"             # src -> dst
)

# src/dst with port: 192.168.1.1:1234 or [fe80::1]:1234
ADDR_PORT_RE = re.compile(r"^(?P<ip>.+):(?P<port>\d+)$")


def parse_addr(addr: str):
    """Return (ip, port_or_None). Handles IPv4, IPv6, with/without port."""
    m = ADDR_PORT_RE.match(addr)
    if m:
        return m.group("ip"), int(m.group("port"))
    return addr, None


def parse_timestamp(ts: str) -> str:
    """Convert MM/DD-HH:MM:SS.usec (UTC) → YYYY-MM-DD HH:MM:SS WIB."""
    year = datetime.now(timezone.utc).year
    dt = datetime.strptime(f"{year}/{ts.split('.')[0]}", "%Y/%m/%d-%H:%M:%S")
    dt = dt.replace(tzinfo=timezone.utc).astimezone(JAKARTA_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S WIB")


def parse_line(line: str) -> dict | None:
    """Parse one alert line. Returns dict or None if invalid."""
    line = line.strip()
    if not line:
        return None
    m = ALERT_RE.match(line)
    if not m:
        return None

    src_ip, src_port = parse_addr(m.group("src"))
    dst_ip, dst_port = parse_addr(m.group("dst"))
    sid = int(m.group("sid"))

    return {
        "timestamp": parse_timestamp(m.group("ts")),
        "src_ip":    src_ip,
        "src_port":  src_port,
        "dst_ip":    dst_ip,
        "dst_port":  dst_port,
        "protocol":  m.group("proto"),
        "sid":       sid,
        "generator": int(m.group("gen")),
        "rev":       int(m.group("rev")),
        "msg":       m.group("msg").strip(),
        "priority":  int(m.group("priority")),
        "classtype": (m.group("classtype") or "").strip() or None,
        "category":  SID_CATEGORY.get(sid),
    }

# ─── DATABASE ────────────────────────────────────────────────────────────────

def init_db(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL,
            src_ip      TEXT NOT NULL,
            src_port    INTEGER,
            dst_ip      TEXT NOT NULL,
            dst_port    INTEGER,
            protocol    TEXT,
            sid         INTEGER NOT NULL,
            generator   INTEGER DEFAULT 1,
            rev         INTEGER DEFAULT 1,
            msg         TEXT NOT NULL,
            priority    INTEGER,
            classtype   TEXT,
            category    TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS notif_log (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            sid      INTEGER,
            src_ip   TEXT,
            category TEXT,
            sent_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()


def save_alert(conn: sqlite3.Connection, alert: dict) -> int:
    cur = conn.execute(
        """INSERT INTO alerts
           (timestamp, src_ip, src_port, dst_ip, dst_port, protocol,
            sid, generator, rev, msg, priority, classtype, category)
           VALUES (:timestamp,:src_ip,:src_port,:dst_ip,:dst_port,:protocol,
                   :sid,:generator,:rev,:msg,:priority,:classtype,:category)""",
        alert,
    )
    conn.commit()
    return cur.lastrowid


def is_duplicate(conn: sqlite3.Connection, sid: int, src_ip: str) -> bool:
    cur = conn.execute(
        """SELECT 1 FROM notif_log
           WHERE sid=? AND src_ip=?
             AND sent_at >= datetime('now', ? || ' seconds')
           LIMIT 1""",
        (sid, src_ip, f"-{DEDUP_WIN}"),
    )
    return cur.fetchone() is not None


def record_notif(conn: sqlite3.Connection, sid: int, src_ip: str):
    conn.execute("INSERT INTO notif_log (sid, src_ip) VALUES (?,?)", (sid, src_ip))
    conn.commit()

# ─── TELEGRAM ────────────────────────────────────────────────────────────────

PRIORITY_META = {
    1: ("🔴", "CRITICAL", "GAWAT BOS!"),
    2: ("🟠", "WARNING",  "PERINGATAN EUY!"),
    0: ("🔵", "INFO",     "INKFO INKFO"),
}


def build_message(alert: dict, alert_id: int) -> str:
    emoji, severity, advice = PRIORITY_META.get(
        alert["priority"], ("🟡", "LOW", "Monitor activity")
    )
    src_port  = f":{alert['src_port']}" if alert["src_port"] else ""
    dst_port  = f":{alert['dst_port']}" if alert["dst_port"] else ""
    category  = alert["category"] or "Unknown"
    classtype = alert["classtype"] or "N/A"

    return (
        f"{emoji} <b>[{severity}] IDS ALERT</b> — {advice}\n"
        f"<code>"
        f"{'─' * 30}\n"
        f"🎯 {alert['msg']}\n\n"
        f"SID      : {alert['sid']}\n"
        f"Alert ID : #{alert_id}\n"
        f"Category : {category}\n"
        f"Classtype: {classtype}\n"
        f"{'─' * 30}\n"
        f"From     : {alert['src_ip']}{src_port}\n"
        f"To       : {alert['dst_ip']}{dst_port}\n"
        f"Protocol : {alert['protocol']}\n"
        f"{'─' * 30}\n"
        f"🕐 {alert['timestamp']}"
        f"</code>"
    )


def send_telegram(alert: dict, alert_id: int) -> bool:
    if not TG_ENABLED:
        return False
    url  = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": CHAT_ID, "text": build_message(alert, alert_id), "parse_mode": "HTML"}
    for attempt in range(3):
        try:
            resp = requests.post(url, data=data, timeout=10)
            if resp.status_code == 200:
                return True
            log.warning("Telegram HTTP %s: %s", resp.status_code, resp.text[:200])
        except requests.RequestException as e:
            log.warning("Telegram attempt %d failed: %s", attempt + 1, e)
        time.sleep(2 ** attempt)
    log.error("Telegram: gagal kirim setelah 3 percobaan untuk SID %s", alert["sid"])
    return False

# ─── WHATSAPP ────────────────────────────────────────────────────────────────

def build_wa_message(alert: dict, alert_id: int) -> str:
    emoji = {1: "🔴", 2: "🟠"}.get(alert["priority"], "🟡")
    severity = {1: "CRITICAL", 2: "WARNING"}.get(alert["priority"], "INFO")
    src_port = f":{alert['src_port']}" if alert["src_port"] else ""
    dst_port = f":{alert['dst_port']}" if alert["dst_port"] else ""
    return (
        f"{emoji} *[{severity}] IDS ALERT #{alert_id}*\n"
        f"{'─' * 28}\n"
        f"🎯 {alert['msg']}\n"
        f"SID      : {alert['sid']}\n"
        f"Category : {alert['category'] or 'Unknown'}\n"
        f"{'─' * 28}\n"
        f"From     : {alert['src_ip']}{src_port}\n"
        f"To       : {alert['dst_ip']}{dst_port}\n"
        f"Protocol : {alert['protocol']}\n"
        f"🕐 {alert['timestamp']}"
    )


def send_whatsapp(alert: dict, alert_id: int) -> bool:
    if not WA_ENABLED:
        return False
    try:
        resp = requests.post(
            WA_URL,
            json={"message": build_wa_message(alert, alert_id)},
            timeout=5,
        )
        if resp.status_code == 200:
            return True
        log.warning("WhatsApp gateway HTTP %s", resp.status_code)
    except requests.RequestException as e:
        log.warning("WhatsApp gateway tidak tersedia: %s", e)
    return False

# ─── POSITION TRACKING ───────────────────────────────────────────────────────

def read_pos() -> int:
    try:
        return int(open(POS_FILE).read().strip())
    except (FileNotFoundError, ValueError):
        return 0


def write_pos(pos: int):
    with open(POS_FILE, "w") as f:
        f.write(str(pos))

# ─── MAIN LOOP ───────────────────────────────────────────────────────────────

running = True


def handle_signal(signum, frame):
    global running
    log.info("Signal %s diterima, shutdown...", signum)
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def open_log_file():
    """Buka alert log, seek ke posisi terakhir. Retry kalau file belum ada."""
    while running:
        try:
            f = open(ALERT_LOG, "r", errors="replace")
            pos = read_pos()
            # Kalau file lebih kecil dari pos (log rotate), mulai dari awal
            f.seek(0, 2)
            size = f.tell()
            if pos > size:
                log.info("Log rotate terdeteksi, reset posisi ke 0")
                pos = 0
            f.seek(pos)
            log.info("Membuka %s di posisi %d", ALERT_LOG, pos)
            return f
        except FileNotFoundError:
            log.warning("Alert log tidak ditemukan: %s — retry dalam 5 detik", ALERT_LOG)
            time.sleep(5)


def main():
    log.info("Parser IDS dimulai")
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    f = open_log_file()

    while running:
        line = f.readline()

        if not line:
            # Cek apakah file di-rotate (inode berubah)
            try:
                if os.stat(ALERT_LOG).st_ino != os.fstat(f.fileno()).st_ino:
                    log.info("Log rotate terdeteksi (inode berubah), reopen file")
                    f.close()
                    write_pos(0)
                    f = open_log_file()
            except OSError as e:
                log.error("Gagal cek inode: %s", e)
            time.sleep(POLL_SEC)
            continue

        write_pos(f.tell())

        alert = parse_line(line)
        if not alert:
            continue

        # Filter DHCP noise — SID 527 dari 0.0.0.0 bukan serangan
        if alert["sid"] == 527 and alert["src_ip"] in ("0.0.0.0", "::"):
            continue

        try:
            alert_id = save_alert(conn, alert)
        except sqlite3.Error as e:
            log.error("Gagal simpan ke DB: %s | line: %s", e, line.strip())
            continue

        if alert["priority"] == 0 or alert["priority"] > MIN_PRIO:
            continue

        if is_duplicate(conn, alert["sid"], alert["src_ip"]):
            log.debug("Duplikat, skip notif SID=%s src=%s", alert["sid"], alert["src_ip"])
            continue

        record_notif(conn, alert["sid"], alert["src_ip"])
        if send_telegram(alert, alert_id):
            log.info("Notif Telegram terkirim: SID=%s src=%s alert_id=#%s", alert["sid"], alert["src_ip"], alert_id)
        if send_whatsapp(alert, alert_id):
            log.info("Notif WhatsApp terkirim: SID=%s src=%s alert_id=#%s", alert["sid"], alert["src_ip"], alert_id)

    f.close()
    conn.close()
    log.info("Parser IDS berhenti")


if __name__ == "__main__":
    main()
