#!/usr/bin/env python3
"""
IDS Dashboard — Flask Backend
Read-only. Serves data from SQLite ids_alerts.db.
"""

import sqlite3
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, g

app = Flask(__name__)

DB_PATH      = "/var/log/snort/ids_alerts.db"
RULES_PATH   = "/etc/snort/rules/local.rules"
PARSER_LOG   = "/var/log/snort/parser.log"
SNORT_ALERT  = "/var/log/snort/snort.alert.fast"

def now_wib():
    """DB stores timestamps in WIB (system local time). Use local time for queries."""
    return datetime.now()

# ─── DB ──────────────────────────────────────────────────────────────────────

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, check_same_thread=False)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    db = g.pop("db", None)
    if db:
        db.close()

# ─── PAGES ───────────────────────────────────────────────────────────────────

@app.route("/")
def overview():
    return render_template("overview.html", active="overview")

@app.route("/eventlog")
def eventlog():
    return render_template("eventlog.html", active="eventlog")

@app.route("/analytics")
def analytics():
    return render_template("analytics.html", active="analytics")

@app.route("/rules")
def rules():
    return render_template("rules.html", active="rules")

@app.route("/settings")
def settings():
    return render_template("settings.html", active="settings")

# ─── API: OVERVIEW ───────────────────────────────────────────────────────────

@app.route("/api/overview")
def api_overview():
    db = get_db()
    today = now_wib().strftime("%Y-%m-%d")
    yesterday = (now_wib() - timedelta(days=1)).strftime("%Y-%m-%d")

    total_today = db.execute(
        "SELECT COUNT(*) FROM alerts WHERE created_at >= ?", (today,)
    ).fetchone()[0]

    total_yesterday = db.execute(
        "SELECT COUNT(*) FROM alerts WHERE created_at >= ? AND created_at < ?",
        (yesterday, today)
    ).fetchone()[0]

    p1_today = db.execute(
        "SELECT COUNT(*) FROM alerts WHERE priority=1 AND created_at >= ?", (today,)
    ).fetchone()[0]

    p2_today = db.execute(
        "SELECT COUNT(*) FROM alerts WHERE priority=2 AND created_at >= ?", (today,)
    ).fetchone()[0]

    attacker_ips = db.execute(
        "SELECT COUNT(DISTINCT src_ip) FROM alerts WHERE created_at >= ?", (today,)
    ).fetchone()[0]

    top_ip = db.execute(
        "SELECT src_ip FROM alerts WHERE created_at >= ? GROUP BY src_ip ORDER BY COUNT(*) DESC LIMIT 1",
        (today,)
    ).fetchone()

    last_alert = db.execute(
        "SELECT timestamp, msg FROM alerts ORDER BY id DESC LIMIT 1"
    ).fetchone()

    pct_change = 0
    if total_yesterday > 0:
        pct_change = round((total_today - total_yesterday) / total_yesterday * 100)

    return jsonify({
        "total_today":   total_today,
        "pct_change":    pct_change,
        "p1_today":      p1_today,
        "p2_today":      p2_today,
        "attacker_ips":  attacker_ips,
        "top_ip":        top_ip["src_ip"].split(".")[-1] if top_ip else "—",
        "last_alert_time": last_alert["timestamp"] if last_alert else "—",
        "last_alert_msg":  last_alert["msg"] if last_alert else "—",
    })


@app.route("/api/overview/timeline")
def api_timeline():
    """Alert count per 5-minute bucket for the last hour, split by priority."""
    db = get_db()
    since = (now_wib() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute(
        """SELECT strftime('%H:%M', created_at) as t,
                  SUM(CASE WHEN priority=1 THEN 1 ELSE 0 END) as p1,
                  SUM(CASE WHEN priority=2 THEN 1 ELSE 0 END) as p2
           FROM alerts
           WHERE created_at >= ?
           GROUP BY strftime('%Y-%m-%d %H:%M', created_at)
           ORDER BY t""",
        (since,)
    ).fetchall()
    return jsonify([{"t": r["t"], "p1": r["p1"], "p2": r["p2"]} for r in rows])


@app.route("/api/overview/by_category")
def api_by_category():
    db = get_db()
    today = now_wib().strftime("%Y-%m-%d")
    rows = db.execute(
        """SELECT COALESCE(category,'Unknown') as category, COUNT(*) as count
           FROM alerts WHERE created_at >= ?
           GROUP BY category ORDER BY count DESC""",
        (today,)
    ).fetchall()
    return jsonify([{"category": r["category"], "count": r["count"]} for r in rows])


@app.route("/api/overview/top_ips")
def api_top_ips():
    db = get_db()
    today = now_wib().strftime("%Y-%m-%d")
    rows = db.execute(
        """SELECT src_ip, COUNT(*) as count FROM alerts
           WHERE created_at >= ?
           GROUP BY src_ip ORDER BY count DESC LIMIT 5""",
        (today,)
    ).fetchall()
    return jsonify([{"ip": r["src_ip"], "count": r["count"]} for r in rows])


@app.route("/api/overview/top_rules")
def api_top_rules():
    db = get_db()
    today = now_wib().strftime("%Y-%m-%d")
    rows = db.execute(
        """SELECT sid, msg, COUNT(*) as count FROM alerts
           WHERE created_at >= ?
           GROUP BY sid ORDER BY count DESC LIMIT 5""",
        (today,)
    ).fetchall()
    return jsonify([{"sid": r["sid"], "msg": r["msg"], "count": r["count"]} for r in rows])


@app.route("/api/overview/recent_events")
def api_recent_events():
    db = get_db()
    rows = db.execute(
        """SELECT timestamp, priority, sid, msg, category, src_ip, src_port,
                  dst_ip, dst_port, protocol
           FROM alerts ORDER BY id DESC LIMIT 10"""
    ).fetchall()
    return jsonify([dict(r) for r in rows])

# ─── API: EVENT LOG ───────────────────────────────────────────────────────────

@app.route("/api/events")
def api_events():
    from flask import request
    db   = get_db()
    q    = request.args.get("q", "").strip()
    p    = request.args.get("priority", "")
    cat  = request.args.get("category", "")
    page = max(1, int(request.args.get("page", 1)))
    per  = 50

    sql    = "FROM alerts WHERE 1=1"
    params = []

    if q:
        # search across msg, sid, src_ip, dst_ip, category, port
        sql += """ AND (
            msg      LIKE ? OR
            CAST(sid AS TEXT) LIKE ? OR
            src_ip   LIKE ? OR
            dst_ip   LIKE ? OR
            category LIKE ? OR
            CAST(src_port AS TEXT) LIKE ? OR
            CAST(dst_port AS TEXT) LIKE ?
        )"""
        like = f"%{q}%"
        params += [like, like, like, like, like, like, like]
    if p:
        sql += " AND priority=?"
        params.append(int(p))
    if cat:
        sql += " AND category=?"
        params.append(cat)

    total = db.execute(f"SELECT COUNT(*) {sql}", params).fetchone()[0]
    rows  = db.execute(
        f"SELECT timestamp, priority, sid, rev, msg, category, classtype, "
        f"src_ip, src_port, dst_ip, dst_port, protocol {sql} "
        f"ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [per, (page - 1) * per]
    ).fetchall()

    return jsonify({
        "total": total,
        "page":  page,
        "pages": (total + per - 1) // per,
        "data":  [dict(r) for r in rows],
    })


@app.route("/api/events/categories")
def api_event_categories():
    db = get_db()
    rows = db.execute(
        "SELECT DISTINCT category FROM alerts WHERE category IS NOT NULL ORDER BY category"
    ).fetchall()
    return jsonify([r["category"] for r in rows])

# ─── API: ANALYTICS ──────────────────────────────────────────────────────────

@app.route("/api/analytics/timeline")
def api_analytics_timeline():
    from flask import request
    db    = get_db()
    rang  = request.args.get("range", "24h")

    if rang == "1h":
        since  = now_wib() - timedelta(hours=1)
        bucket = "%Y-%m-%d %H:%M"
    elif rang == "6h":
        since  = now_wib() - timedelta(hours=6)
        bucket = "%Y-%m-%d %H:%M"
    elif rang == "7d":
        since  = now_wib() - timedelta(days=7)
        bucket = "%Y-%m-%d"
    elif rang == "30d":
        since  = now_wib() - timedelta(days=30)
        bucket = "%Y-%m-%d"
    else:  # 24h default
        since  = now_wib() - timedelta(hours=24)
        bucket = "%Y-%m-%d %H:00"

    rows = db.execute(
        f"""SELECT strftime('{bucket}', created_at) as t,
                   SUM(CASE WHEN priority=1 THEN 1 ELSE 0 END) as p1,
                   SUM(CASE WHEN priority=2 THEN 1 ELSE 0 END) as p2,
                   COUNT(*) as total
            FROM alerts WHERE created_at >= ?
            GROUP BY t ORDER BY t""",
        (since.strftime("%Y-%m-%d %H:%M:%S"),)
    ).fetchall()
    return jsonify([{"t": r["t"], "p1": r["p1"], "p2": r["p2"], "total": r["total"]} for r in rows])


@app.route("/api/analytics/by_category")
def api_analytics_category():
    from flask import request
    db   = get_db()
    rang = request.args.get("range", "24h")
    since = _since(rang)
    rows = db.execute(
        """SELECT COALESCE(category,'Unknown') as category, COUNT(*) as count
           FROM alerts WHERE created_at >= ?
           GROUP BY category ORDER BY count DESC""",
        (since,)
    ).fetchall()
    return jsonify([{"category": r["category"], "count": r["count"]} for r in rows])


@app.route("/api/analytics/top_ips")
def api_analytics_top_ips():
    from flask import request
    db   = get_db()
    rang = request.args.get("range", "24h")
    since = _since(rang)
    rows = db.execute(
        """SELECT src_ip, COUNT(*) as count,
                  SUM(CASE WHEN priority=1 THEN 1 ELSE 0 END) as p1
           FROM alerts WHERE created_at >= ?
           GROUP BY src_ip ORDER BY count DESC LIMIT 10""",
        (since,)
    ).fetchall()
    return jsonify([{"ip": r["src_ip"], "count": r["count"], "p1": r["p1"]} for r in rows])


@app.route("/api/analytics/by_protocol")
def api_analytics_protocol():
    from flask import request
    db   = get_db()
    rang = request.args.get("range", "24h")
    since = _since(rang)
    rows = db.execute(
        """SELECT protocol, COUNT(*) as count FROM alerts
           WHERE created_at >= ? GROUP BY protocol ORDER BY count DESC""",
        (since,)
    ).fetchall()
    return jsonify([{"protocol": r["protocol"], "count": r["count"]} for r in rows])


def _since(rang):
    m = {"1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720}
    h = m.get(rang, 24)
    return (now_wib() - timedelta(hours=h)).strftime("%Y-%m-%d %H:%M:%S")

# ─── API: RULES ───────────────────────────────────────────────────────────────

@app.route("/api/rules")
def api_rules():
    import re
    rules = []
    try:
        with open(RULES_PATH) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                sid   = re.search(r'sid:(\d+)', line)
                msg   = re.search(r'msg:"([^"]+)"', line)
                proto = re.match(r'alert\s+(\w+)', line)
                prio  = re.search(r'priority:(\d+)', line)
                cls   = re.search(r'classtype:([^;]+)', line)
                rules.append({
                    "sid":       int(sid.group(1)) if sid else None,
                    "msg":       msg.group(1) if msg else line[:60],
                    "protocol":  proto.group(1).upper() if proto else "—",
                    "priority":  int(prio.group(1)) if prio else None,
                    "classtype": cls.group(1).strip() if cls else "—",
                    "action":    "alert",
                })
    except FileNotFoundError:
        pass
    return jsonify(rules)

# ─── API: SETTINGS / STATUS ───────────────────────────────────────────────────

@app.route("/api/status")
def api_status():
    import os, subprocess
    snort_ok  = subprocess.run(["pgrep", "-x", "snort"],  capture_output=True).returncode == 0
    parser_ok = subprocess.run(["pgrep", "-f", "parser.py"], capture_output=True).returncode == 0

    try:
        db_size = os.path.getsize(DB_PATH)
    except OSError:
        db_size = 0

    db = get_db()
    total_records = db.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    today = now_wib().strftime("%Y-%m-%d")
    p1_today = db.execute(
        "SELECT COUNT(*) FROM alerts WHERE priority=1 AND created_at >= ?", (today,)
    ).fetchone()[0]

    last_log = ""
    try:
        with open(PARSER_LOG) as f:
            lines = f.readlines()
            last_log = lines[-1].strip() if lines else ""
    except OSError:
        pass

    return jsonify({
        "snort_running":  snort_ok,
        "parser_running": parser_ok,
        "db_size_mb":     round(db_size / 1024 / 1024, 2),
        "total_records":  total_records,
        "last_log":       last_log,
        "db_path":        DB_PATH,
        "alert_log":      SNORT_ALERT,
        "rules_path":     RULES_PATH,
        "p1_today":       p1_today,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
