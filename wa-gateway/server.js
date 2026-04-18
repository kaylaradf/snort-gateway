/**
 * wa-gateway/server.js
 * WhatsApp Gateway — Baileys + HTTP server
 * Endpoints:
 *   POST /send   { "message": "..." }  → kirim ke group WA
 *   GET  /status → { connected, qr_pending, queue }
 *   GET  /qr     → { qr: "data:image/png;base64,..." } atau { qr: null }
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode  = require('qrcode-terminal');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');

// ── Config ────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('[wa-gateway] config.json tidak ditemukan. Jalankan: node setup.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

const cfg      = loadConfig();
const PORT     = cfg.port      || 3001;
const GROUP_JID = cfg.group_jid || '';
const AUTH_DIR = path.join(__dirname, 'auth_info');

if (!GROUP_JID) {
  console.error('[wa-gateway] group_jid belum diset di config.json. Jalankan: node setup.js');
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────
let sock      = null;
let isReady   = false;
let lastQR    = null;   // raw QR string untuk ditampilkan di dashboard
const msgQueue = [];

// ── WhatsApp Connection ───────────────────────────────────
async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['PERKUTUT IDS', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQR = qr;
      console.log('\n[wa-gateway] QR tersedia — buka dashboard Settings untuk scan\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      isReady = true;
      lastQR  = null;
      console.log('[wa-gateway] Terhubung ke WhatsApp ✓  group:', cfg.group_name || GROUP_JID);
      while (msgQueue.length > 0) {
        await sendMessage(msgQueue.shift());
      }
    }

    if (connection === 'close') {
      isReady = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[wa-gateway] Koneksi terputus (${code}), reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectWA, 5000);
      } else {
        console.log('[wa-gateway] Logged out. Hapus folder auth_info/ dan jalankan ulang.');
        process.exit(1);
      }
    }
  });
}

async function sendMessage(text) {
  try {
    await sock.sendMessage(GROUP_JID, { text });
    console.log(`[wa-gateway] Pesan terkirim → ${cfg.group_name || GROUP_JID}`);
    return true;
  } catch (e) {
    console.error('[wa-gateway] Gagal kirim:', e.message);
    return false;
  }
}

// ── HTTP Server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // POST /send
  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        if (!message) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'message required' })); return; }
        if (isReady) {
          await sendMessage(message);
        } else {
          msgQueue.push(message);
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, queued: !isReady }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // GET /status
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({
      ok: true,
      connected: isReady,
      qr_pending: lastQR !== null,
      queue: msgQueue.length,
      group: cfg.group_name || GROUP_JID,
    }));
    return;
  }

  // GET /qr — return QR as text for frontend to render
  if (req.method === 'GET' && req.url === '/qr') {
    res.writeHead(200);
    res.end(JSON.stringify({ qr: lastQR }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-gateway] HTTP server → 127.0.0.1:${PORT}`);
  console.log(`[wa-gateway] Group target: ${cfg.group_name || GROUP_JID}`);
});

connectWA();
