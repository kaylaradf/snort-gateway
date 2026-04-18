/**
 * wa-gateway/setup.js
 * Onboarding: scan QR, list semua group, pilih group, simpan config.json
 * Jalankan sekali: node setup.js
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode  = require('qrcode-terminal');
const readline = require('readline');
const fs      = require('fs');
const path    = require('path');

const AUTH_DIR    = path.join(__dirname, 'auth_info');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  console.log('\n=== PERKUTUT — WhatsApp Gateway Setup ===\n');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['PERKUTUT IDS', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log('Scan QR code berikut dengan WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nMenunggu scan...\n');
      }
      if (connection === 'open') {
        console.log('Terhubung ke WhatsApp ✓\n');
        resolve();
      }
      if (connection === 'close') {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) reject(new Error('Logged out'));
      }
    });
  });

  // Fetch semua group
  console.log('Mengambil daftar group...\n');
  await new Promise(r => setTimeout(r, 3000)); // tunggu store sync

  const groups = await sock.groupFetchAllParticipating();
  const list = Object.values(groups).sort((a, b) => a.subject.localeCompare(b.subject));

  if (list.length === 0) {
    console.log('Tidak ada group ditemukan. Pastikan nomor sudah join group.');
    process.exit(1);
  }

  console.log('Group yang tersedia:\n');
  list.forEach((g, i) => {
    console.log(`  [${i + 1}] ${g.subject}`);
    console.log(`       JID: ${g.id}`);
    console.log(`       Anggota: ${g.participants.length}\n`);
  });

  const choice = await ask('Pilih nomor group (1-' + list.length + '): ');
  const idx = parseInt(choice) - 1;
  if (isNaN(idx) || idx < 0 || idx >= list.length) {
    console.log('Pilihan tidak valid.'); process.exit(1);
  }

  const selected = list[idx];
  console.log(`\nGroup dipilih: ${selected.subject}`);
  console.log(`JID: ${selected.id}\n`);

  const port = await ask('Port HTTP gateway [3001]: ');

  const config = {
    group_jid: selected.id,
    group_name: selected.subject,
    port: parseInt(port) || 3001,
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('\nconfig.json tersimpan:');
  console.log(JSON.stringify(config, null, 2));
  console.log('\nSetup selesai! Jalankan gateway dengan:\n  node server.js\n  atau: sudo systemctl start wa-gateway\n');

  await sock.end();
  rl.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
