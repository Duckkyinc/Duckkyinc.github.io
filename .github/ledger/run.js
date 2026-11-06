// Duckky Coins - the ledger job. Runs on GitHub every 5 minutes (.github/workflows/ledger.yml) and stays for about
// 4.5 minutes each time, answering requests live as they come in:
//   1. reads signed requests from launchers and the website (the Nostr relays the launchers already use, and ntfy.sh)
//   2. checks each one (core.js) - a new launcher key is checked with Mojang first, so nobody can act as someone else
//   3. sends each account its new wallet, signed, on its own answers topic - so a purchase shows in seconds
//   4. every minute, coins bought on the Tebex store
//   5. saves everything: state.json on the "ledger-state" branch (every minute), ledger.json on the website
//      (levels, who owns what, the creators' capes - no coins) at the end of the run
// Its signing keys come from TEBEX_SECRET, so there's no extra secret to set up. Launchers check its answers with the
// public key in ledger.json (which only this repo can change).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const C = require('./core');
const { Nostr } = require('./nostr');

const SECRET = String(process.env.TEBEX_SECRET || process.env.LEDGER_SEED || '').trim().replace(/^tebex\s+secret\s+/i, '').trim();
const RUN_MS = Number(process.env.RUN_MS) || 270_000;
const STATE_DIR = process.env.STATE_DIR || '.ledger-state';
const STATE = path.join(STATE_DIR, 'state.json');
const DRY = !!process.env.DRY; // (tests: no git, no Tebex)
const NTFY = process.env.NTFY || 'https://ntfy.sh';
const LTOPIC = 'dkyl' + crypto.createHash('sha256').update('duckky-ledger-v1').digest('hex').slice(0, 40);
const replyTopic = (u) => 'dkyw' + crypto.createHash('sha256').update('duckky-wallet-v1|' + u).digest('hex').slice(0, 40);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!SECRET) { console.log('No TEBEX_SECRET - add it in Settings > Secrets and variables > Actions. The ledger needs it for its keys.'); process.exit(0); }
const hk = (what) => crypto.createHmac('sha256', SECRET).update(what).digest();
const edPriv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), hk('duckky-ledger-sign-v1')]), format: 'der', type: 'pkcs8' });
const edPub = C.b64u(crypto.createPublicKey(edPriv).export({ format: 'der', type: 'spki' }).subarray(12));
const nostr = new Nostr(hk('duckky-ledger-nostr-v1'), { log });

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
let st = readJson(STATE, null) || C.empty();
const shop = () => readJson('shop.json', { items: [] });
const plusSet = () => new Set((readJson('plus.json', { h: [] }).h || []));
let dirty = false, pubDirty = false;

function signReply(obj) { const d = JSON.stringify(obj); return JSON.stringify({ d, s: C.b64u(crypto.sign(null, Buffer.from(d), edPriv)) }); }
function answer(u, r) {
  const w = C.wallet(st, u, shop());
  if (!w) return;
  nostr.publish(replyTopic(u), signReply({ w, r: r || null, at: Date.now(), pub: edPub }));
}

async function hasJoined(name, sid) {
  try {
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${sid}`, { signal: AbortSignal.timeout(8000) });
    return r.status === 200 ? r.json() : null;
  } catch { return null; }
}
const sha1hex = (s) => crypto.createHash('sha1').update(s).digest('hex'); // (the "server id" the launcher joined with)

const queue = [];
let busy = false;
function take(text, at) { if (typeof text === 'string' && text.length < 8000) { queue.push(text); st.cursor.nostr = Math.max(st.cursor.nostr || 0, at || 0); pump(); } }
async function pump() {
  if (busy) return; busy = true;
  try {
    while (queue.length) {
      const text = queue.shift();
      let req; try { req = JSON.parse(text); } catch { continue; }
      if (!req || typeof req !== 'object') continue;
      const now = Date.now();
      if (req.k === 'reg') { await reg(req, now); continue; }
      const r = C.apply(st, req, { now, shop: shop(), plus: plusSet() });
      if (r.err === 'dup' || r.err === 'bad') continue;
      if (r.ok) { dirty = true; if (['buy', 'xp', 'sell', 'mod', 'unsell'].includes(req.k)) pubDirty = true; }
      const u = C.id32(req.u);
      if (r.err === 'unknown') { nostr.publish(replyTopic(u), signReply({ w: null, r: { n: req.n, ok: false, err: 'unknown' }, at: now, pub: edPub })); continue; }
      if (r.err === 'sig' || r.err === 'old') continue; // (not theirs, or a stale copy: no answer)
      for (const w of r.who || []) answer(w, w === u ? { n: req.n, k: req.k, ok: r.ok, err: r.err, msg: r.msg, up: r.up, coins: r.coins, paid: r.paid, item: r.item } : null);
      log(req.k, r.ok ? 'ok' : r.err, r.msg || '');
    }
  } finally { busy = false; }
}
/** A launcher's key: signed with that key, and Mojang says the account really joined our "server" with it just now. */
async function reg(req, now) {
  const u = C.id32(req.u);
  if (!/^[0-9a-f]{32}$/.test(u) || typeof req.pub !== 'string' || typeof req.name !== 'string') return;
  if (Math.abs(now - (Number(req.ts) || 0)) > 60_000) return; // (Mojang's check only lasts a moment)
  if (!C.verifySig(req.pub, req)) return;
  if (st.acc[u] && st.acc[u].keys.some((k) => k.k === req.pub)) { answer(u, { k: 'reg', ok: true, n: req.n }); return; }
  const j = await hasJoined(req.name, sha1hex(`duckky-ledger|${req.pub}|${req.ts}`));
  if (!j || C.id32(j.id) !== u) { log('reg failed for', req.name); return; }
  const r = C.register(st, { u, name: j.name || req.name, pub: req.pub }, now);
  if (r.ok) { dirty = true; log('reg', j.name); answer(u, { k: 'reg', ok: true, n: req.n }); }
}

async function ntfyPoll() {
  try {
    const since = st.cursor.ntfy || '10m';
    const r = await fetch(`${NTFY}/${LTOPIC}/json?poll=1&since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return;
    for (const line of (await r.text()).split('\n')) {
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.event !== 'message') continue;
      st.cursor.ntfy = m.id; take(m.message, 0);
    }
  } catch {}
}
async function tebexPoll() {
  if (DRY) return;
  try {
    const out = [];
    for (let n = 1; n <= 3; n++) { // (the newest payments are on the first pages)
      const r = await fetch(`https://plugin.tebex.io/payments?paged=1&page=${n}`, { headers: { 'X-Tebex-Secret': SECRET, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) break;
      const j = await r.json(); out.push(...(j.data || []));
      if (n >= (Number(j.last_page) || 1)) break;
    }
    const who = C.tebex(st, out, Date.now());
    if (who.length) { dirty = true; for (const u of who) answer(u, { k: 'coins', ok: true, msg: 'Coins added' }); }
  } catch (e) { log('tebex:', e.message); }
}

function save(final) {
  C.prune(st, Date.now());
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (dirty || final) { fs.writeFileSync(STATE, JSON.stringify(st)); dirty = false; }
  if (!DRY) {
    try { execSync(`git -C ${STATE_DIR} add state.json && (git -C ${STATE_DIR} diff --cached --quiet || (git -C ${STATE_DIR} commit -qm "ledger" && git -C ${STATE_DIR} push -q origin HEAD:ledger-state))`, { stdio: 'inherit' }); } catch (e) { log('state push failed', e.message); }
  }
  if (final) {
    const pub = C.publicLedger(st, { pub: edPub, npub: nostr.pub, topic: LTOPIC });
    const old = readJson('ledger.json', null);
    const strip = (o) => o && JSON.stringify({ ...o, at: 0 });
    if (strip(old) !== strip(pub)) {
      fs.writeFileSync('ledger.json', JSON.stringify(pub) + '\n');
      if (!DRY) { try { execSync('git add ledger.json && git commit -qm "Duckky Coins: ledger" && (git pull -q --rebase || true) && git push -q', { stdio: 'inherit' }); } catch (e) { log('ledger.json push failed', e.message); } }
    }
  }
}

(async () => {
  st.cursor ||= {};
  log(`ledger: ${Object.keys(st.acc).length} accounts, key ${edPub.slice(0, 10)}...`);
  nostr.start();
  nostr.subscribe([LTOPIC], Math.max(0, (st.cursor.nostr || Math.floor(Date.now() / 1000) - 3600) - 300), take);
  const end = Date.now() + RUN_MS;
  let lastN = 0, lastT = 0, lastS = Date.now();
  while (Date.now() < end) {
    const now = Date.now();
    if (now - lastN > 8000) { lastN = now; await ntfyPoll(); }
    if (now - lastT > 60_000) { lastT = now; await tebexPoll(); }
    if (now - lastS > 60_000 && dirty) { lastS = now; save(false); }
    await new Promise((r) => setTimeout(r, 500));
  }
  while (busy || queue.length) await new Promise((r) => setTimeout(r, 200));
  save(true);
  nostr.close();
  log('done');
  process.exit(0);
})().catch((e) => { console.error(e); try { save(true); } catch {} process.exit(1); });
