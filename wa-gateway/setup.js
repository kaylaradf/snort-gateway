/**
 * wa-gateway/setup.js
 * Onboarding: scan QR, list semua group, pilih group, simpan config.json
 * Jalankan sekali: node setup.js
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode   = require('qrcode-terminal');
const readline = require('readline');
const fs       = require('fs');
const path     = require('path');

const AUTH_DIR    = path.join(__dirname, 'auth_info');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', R = '\x1b[0m';
const ok   = (m) => console.log(`${G}[✓]${R} ${m}`);
const info = (m) => console.log(`${C}[i]${R} ${m}`);
const warn = (m) => console.log(`${Y}[!]${R} ${m}`);
const step = (n, m) => console.log(`\n${B}${C}── Step ${n}: ${m}${R}`);

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  info(`Baileys version: ${version.join('.')}`);

  return new Promise((resolve, reject) => {
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['PERKUTUT IDS', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log('\nScan QR code ini dengan WhatsApp kamu:\n');
        console.log('  Buka WhatsApp → Linked Devices → Link a Device\n');
        qrcode.generate(qr, { small: true });
        console.log('\nMenunggu scan QR...\n');
      }

      if (connection === 'open') {
        ok('WhatsApp terhubung!\n');
        resolve(sock);
      }

      if (connection === 'close') {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          reject(new Error('Logged out'));
          return;
        }

        // 515 = WhatsApp minta restart setelah pairing — ini NORMAL
        if (code === 515) {
          info('WhatsApp minta restart koneksi setelah pairing (normal)...');
          info('Reconnecting...\n');
        } else {
          warn(`Koneksi terputus (code: ${code}), reconnecting...`);
        }

        try {
          const newSock = await connect();
          resolve(newSock);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

async function main() {
  console.log(`\n${B}${C}╔══════════════════════════════════════════╗`);
  console.log(`║   PERKUTUT — WhatsApp Gateway Setup      ║`);
  console.log(`╚══════════════════════════════════════════╝${R}\n`);

  // ── Step 1: Cek session lama ──────────────────────────
  step(1, 'Cek session WhatsApp');
  const hasCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
  if (hasCreds) {
    info('Session lama ditemukan — tidak perlu scan QR ulang');
  } else {
    info('Belum ada session — akan tampil QR untuk di-scan');
  }

  // ── Step 2: Connect ───────────────────────────────────
  step(2, 'Menghubungkan ke WhatsApp');
  info('Membuka koneksi...');

  const sock = await connect();

  // ── Step 3: Fetch groups ──────────────────────────────
  step(3, 'Mengambil daftar group');
  info('Menunggu sinkronisasi data (3 detik)...');
  await new Promise(r => setTimeout(r, 3000));

  info('Mengambil semua group yang diikuti nomor ini...');
  const groups = await sock.groupFetchAllParticipating();
  const list   = Object.values(groups).sort((a, b) => a.subject.localeCompare(b.subject));

  if (list.length === 0) {
    warn('Tidak ada group ditemukan!');
    warn('Pastikan nomor WhatsApp sudah join minimal 1 group.');
    process.exit(1);
  }

  ok(`Ditemukan ${list.length} group:\n`);
  list.forEach((g, i) => {
    console.log(`  ${B}[${i + 1}]${R} ${g.subject}`);
    console.log(`       JID     : ${C}${g.id}${R}`);
    console.log(`       Anggota : ${g.participants.length}\n`);
  });

  // ── Step 4: Pilih group ───────────────────────────────
  step(4, 'Pilih group tujuan notifikasi');
  const choice = await ask(`Masukkan nomor group (1-${list.length}): `);
  const idx    = parseInt(choice) - 1;

  if (isNaN(idx) || idx < 0 || idx >= list.length) {
    warn('Pilihan tidak valid.'); process.exit(1);
  }

  const selected = list[idx];
  ok(`Group dipilih: ${B}${selected.subject}${R}`);
  info(`JID: ${selected.id}`);

  // ── Step 5: Port ──────────────────────────────────────
  step(5, 'Konfigurasi port');
  info('Port adalah port HTTP internal yang dipakai parser.py untuk kirim pesan ke gateway ini.');
  const portInput = await ask('Port HTTP gateway [3001]: ');
  const port      = parseInt(portInput) || 3001;
  ok(`Port: ${port}`);

  // ── Step 6: Simpan config ─────────────────────────────
  step(6, 'Menyimpan konfigurasi');
  const config = {
    group_jid:  selected.id,
    group_name: selected.subject,
    port,
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  ok(`config.json tersimpan di: ${CONFIG_FILE}`);

  // ── Selesai ───────────────────────────────────────────
  console.log(`\n${G}${B}╔══════════════════════════════════════════╗`);
  console.log(`║   Setup selesai!                         ║`);
  console.log(`╚══════════════════════════════════════════╝${R}\n`);

  console.log('Langkah selanjutnya:\n');
  console.log(`  ${B}1. Jalankan gateway:${R}`);
  console.log('     node server.js');
  console.log('     atau: sudo systemctl start wa-gateway\n');
  console.log(`  ${B}2. Aktifkan di config.ini:${R}`);
  console.log('     [whatsapp]');
  console.log('     enabled     = true');
  console.log(`     gateway_url = http://127.0.0.1:${port}/send\n`);
  console.log(`  ${B}3. Restart parser:${R}`);
  console.log('     sudo systemctl restart snort-gateway\n');

  await sock.end();
  rl.close();
  process.exit(0);
}

main().catch(e => {
  console.error(`\n\x1b[31m[✗] Error: ${e.message}\x1b[0m`);
  process.exit(1);
});
