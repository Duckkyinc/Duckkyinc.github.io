// Duckky Plus: who bought it, from the Tebex store - turned into plus.json on this website, which every Duckky
// launcher reads (and so knows who has Plus). Runs every 5 minutes on GitHub (.github/workflows/plus.yml).
// Only fingerprints of Minecraft account ids are published (sha256 of "duckky-plus|" + the id) - never names or emails.
// A refunded / charged back purchase drops out on the next run.
//
// How long each purchase lasts comes from its package's name on Tebex (every Plus package has "Duckky Plus" in it):
//   "... Monthly" / "1 Month"       1 month        "... Quarterly" / "3 Months"   3 months
//   "... Semi-Annually" / "6 Months" 6 months      "... Annually" / "Yearly" / "12 Months"   a year
//   anything else ("Permanent", and the first $4.99 one)   forever
// A subscription's renewals are new payments, so each one adds its length; buying a length again adds to what's left.
// A few days of grace after the end, so a renewal that's a little late doesn't take Plus away.
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const SECRET = String(process.env.TEBEX_SECRET || '').trim().replace(/^tebex\s+secret\s+/i, '').trim(); // (works with or without the "tebex secret" words in front)
const PACKAGE = (process.env.PLUS_PACKAGE || 'Duckky Plus').toLowerCase();
const OUT = 'plus.json';
const fp = (uuid) => crypto.createHash('sha256').update('duckky-plus|' + String(uuid).replace(/-/g, '').toLowerCase()).digest('hex');

async function page(n) {
  const r = await fetch(`https://plugin.tebex.io/payments?paged=1&page=${n}`, { headers: { 'X-Tebex-Secret': SECRET, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Tebex answered ${r.status}`);
  return r.json();
}

const DAY = 86400_000, GRACE = 3 * DAY;
/** A package name -> its length in months (0 = forever). */
function monthsOf(name) {
  const n = String(name || '').toLowerCase();
  if (/semi|6\s*-?\s*months?|half/.test(n)) return 6;
  if (/quarter|3\s*-?\s*months?/.test(n)) return 3;
  if (/annual|year|12\s*-?\s*months?/.test(n)) return 12;
  if (/month/.test(n)) return 1;
  return 0;
}
function addMonths(t, m) { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + m); return d.getTime(); }

(async () => {
  const have = new Set(), gone = new Set();
  const timed = new Map(); // fingerprint -> [{ at, months }] (Plus for a while: added up below)
  if (!SECRET) console.log('No TEBEX_SECRET yet - add it in the repo settings (Settings > Secrets and variables > Actions). Only extra.txt is used.');
  // (says hello the way the Tebex plugin does - so the store shows as connected; and checks the key works)
  if (SECRET) {
    const r = await fetch('https://plugin.tebex.io/information', { headers: { 'X-Tebex-Secret': SECRET, Accept: 'application/json' } });
    if (!r.ok) throw new Error('Tebex said ' + r.status + ' - is TEBEX_SECRET the right key?');
    const info = await r.json().catch(() => ({}));
    console.log('Connected to the Tebex store' + (info.account && info.account.name ? ': ' + info.account.name : ''));
  }
  let n = 1, last = SECRET ? 1 : 0;
  while (n <= last) {
    const j = await page(n);
    last = Math.min(Number(j.last_page) || 1, 2000);
    for (const p of j.data || []) {
      const uuid = p && p.player && p.player.uuid;
      if (!uuid || !/^[0-9a-f-]{32,36}$/i.test(uuid)) continue;
      const pk = (p.packages || []).filter((k) => String(k.name || '').toLowerCase().includes(PACKAGE) || String(k.id) === process.env.PLUS_PACKAGE_ID);
      if (!pk.length) continue;
      const st = String(p.status || '').toLowerCase();
      const h = fp(uuid);
      if (/chargeback/.test(st)) { gone.add(h); continue; } // (a chargeback: no Plus at all)
      if (st !== 'complete') continue; // (refunded / pending: this payment doesn't count)
      const at = Date.parse(p.date || p.time || '') || 0;
      for (const k of pk) {
        const m = monthsOf(k.name);
        if (!m) { have.add(h); continue; } // (forever)
        if (!at) continue;
        if (!timed.has(h)) timed.set(h, []);
        timed.get(h).push({ at, months: m * Math.max(1, Number(k.quantity) || 1) });
      }
    }
    n++;
  }
  // (Plus for a while: each payment's length, one after the other - a renewal or a second purchase adds on)
  const now = Date.now();
  let active = 0;
  for (const [h, list] of timed) {
    list.sort((a, b) => a.at - b.at);
    let end = 0;
    for (const x of list) end = addMonths(Math.max(end, x.at), x.months);
    if (now < end + GRACE) { have.add(h); active++; }
  }
  if (timed.size) console.log(`${active} of ${timed.size} with Plus for a while still have it`);
  for (const h of gone) have.delete(h); // (charged back: no Plus - even if they'd bought it twice)
  // (given Plus by hand - the owner, testers: one Minecraft account id a line in .github/plus/extra.txt)
  try { for (const l of fs.readFileSync('.github/plus/extra.txt', 'utf8').split(/\r?\n/)) { const u = l.replace(/#.*/, '').trim(); if (/^[0-9a-f-]{32,36}$/i.test(u)) have.add(fp(u)); } } catch {}
  const list = [...have].sort();
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  if (old && JSON.stringify(old.h) === JSON.stringify(list)) { console.log(`No change (${list.length} with Plus)`); return; }
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, at: Date.now(), h: list }) + '\n');
  console.log(`plus.json: ${list.length} with Plus`);
})().catch((e) => { console.error(e.message); process.exit(1); });
