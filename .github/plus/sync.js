// Duckky Plus: who bought it, from the Tebex store - turned into plus.json on this website, which every Duckky
// launcher reads (and so knows who has Plus). Runs every 5 minutes on GitHub (.github/workflows/plus.yml).
// Only fingerprints of Minecraft account ids are published (sha256 of "duckky-plus|" + the id) - never names or emails.
// A refunded / charged back purchase drops out on the next run.
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const SECRET = process.env.TEBEX_SECRET || '';
const PACKAGE = (process.env.PLUS_PACKAGE || 'Duckky Plus').toLowerCase();
const OUT = 'plus.json';
const fp = (uuid) => crypto.createHash('sha256').update('duckky-plus|' + String(uuid).replace(/-/g, '').toLowerCase()).digest('hex');

async function page(n) {
  const r = await fetch(`https://plugin.tebex.io/payments?paged=1&page=${n}`, { headers: { 'X-Tebex-Secret': SECRET, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Tebex answered ${r.status}`);
  return r.json();
}

(async () => {
  const have = new Set(), gone = new Set();
  if (!SECRET) console.log('No TEBEX_SECRET yet - add it in the repo settings (Settings > Secrets and variables > Actions). Only extra.txt is used.');
  let n = 1, last = SECRET ? 1 : 0;
  while (n <= last) {
    const j = await page(n);
    last = Math.min(Number(j.last_page) || 1, 2000);
    for (const p of j.data || []) {
      const uuid = p && p.player && p.player.uuid;
      if (!uuid || !/^[0-9a-f-]{32,36}$/i.test(uuid)) continue;
      if (!(p.packages || []).some((k) => String(k.name || '').toLowerCase().includes(PACKAGE) || String(k.id) === process.env.PLUS_PACKAGE_ID)) continue;
      const st = String(p.status || '').toLowerCase();
      if (st === 'complete') have.add(fp(uuid)); else if (/refund|chargeback/.test(st)) gone.add(fp(uuid));
    }
    n++;
  }
  for (const h of gone) have.delete(h); // (refunded: no Plus - even if they'd bought it twice)
  // (given Plus by hand - the owner, testers: one Minecraft account id a line in .github/plus/extra.txt)
  try { for (const l of fs.readFileSync('.github/plus/extra.txt', 'utf8').split(/\r?\n/)) { const u = l.replace(/#.*/, '').trim(); if (/^[0-9a-f-]{32,36}$/i.test(u)) have.add(fp(u)); } } catch {}
  const list = [...have].sort();
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  if (old && JSON.stringify(old.h) === JSON.stringify(list)) { console.log(`No change (${list.length} with Plus)`); return; }
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, at: Date.now(), h: list }) + '\n');
  console.log(`plus.json: ${list.length} with Plus`);
})().catch((e) => { console.error(e.message); process.exit(1); });
