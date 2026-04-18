/**
 * wa-gateway/server.js
 * WhatsApp Gateway — Baileys + HTTP server
 * POST /send  { "message": "..." }  → kirim ke group WA
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode   = require('qrcode-terminal');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');

// ── Config ────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('[wa-gateway] config.json tidak ditemukan. Jalankan: node setup.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

const cfg = loadConfig();
const PORT      = cfg.port      || 3001;
const GROUP_JID = cfg.group_jid || '';
const AUTH_DIR  = path.join(__dirname, 'auth_info');

if (!GROUP_JID) {
  console.error('[wa-gateway] group_jid belum diset di config.json');
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────
let sock = null;
let isReady = false;
const msgQueue = [];

// ── WhatsApp Connection ───────────────────────────────────
async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: require('@whiskeysockets/baileys').makeCacheableSignalKeyStore
      ? undefined
      : undefined,
    browser: ['PERKUTUT IDS', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n[wa-gateway] Scan QR code berikut dengan WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n[wa-gateway] Menunggu scan...\n');
    }

    if (connection === 'open') {
      isReady = true;
      console.log('[wa-gateway] Terhubung ke WhatsApp ✓');
      // flush queue
      while (msgQueue.length > 0) {
        const m = msgQueue.shift();
        await sendMessage(m);
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
    console.log(`[wa-gateway] Pesan terkirim ke ${GROUP_JID}`);
  } catch (e) {
    console.error('[wa-gateway] Gagal kirim:', e.message);
  }
}

// ── HTTP Server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        if (!message) {
          res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'message required' }));
          return;
        }
        if (isReady) {
          await sendMessage(message);
        } else {
          msgQueue.push(message);
          console.log('[wa-gateway] Belum terhubung, pesan masuk antrian');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, queued: !isReady }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, connected: isReady, queue: msgQueue.length }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-gateway] HTTP server listening on 127.0.0.1:${PORT}`);
});

connectWA();
