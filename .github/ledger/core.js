// Duckky Coins: the rules. Pure logic - no network, no files - so it can be tested on its own.
// run.js feeds it signed requests from launchers and the website, and saves what comes out.
//
// Everything that can change a balance goes through here, and only here:
//   - XP from playing (minutes the launcher reports - capped, so a hacked launcher can only get a little)
//   - level-up rewards in coins
//   - buying an item (Duckky Plus: 15% off; a creator's item: they get 80% of what was paid)
//   - creators putting a cape up for sale (verified creators only, a category is a must, the owner approves it first)
//   - coins bought on the Tebex store
'use strict';
const crypto = require('crypto');

const OWNER = 'ef149da2e38948d3808a943167da39e3';
const RULES = {
  PLUS_OFF: 0.15, // (Duckky Plus: 15% off everything)
  SELLER_CUT: 0.8, // (a creator gets 80% of what the buyer paid)
  PRICE_MIN: 200, PRICE_MAX: 2500, // (what a creator may ask for a cape)
  REPORT_MAX: 15, // (minutes of play one report can claim)
  DAY_MAX: 960, // (16 hours of play a day at most)
  DAILY: 25, // (XP the first time you play each day)
  PLUS_BOOST: 1.25, // (Duckky Plus: 25% more XP)
  REQ_AGE: 2 * 3600_000, // (a request older than 2 hours is ignored)
  NONCE_KEEP: 3 * 86400_000,
  MAX_KEYS: 6, // (launchers + website logins per account)
  MAX_PENDING: 5, // (capes waiting for approval, per creator)
};
const CATS = ['Animals', 'Cute', 'Cool', 'Funny', 'Gaming', 'Nature', 'Space', 'Food', 'Seasonal', 'Abstract', 'Other'];

// ---- levels: the same curve the launcher always used ----
const MAX_LV = 1000;
const need = (lv) => Math.min(300, 50 + 25 * lv);
function levelOf(xp) {
  let left = Math.max(0, Math.floor(xp || 0)), lv = 1;
  while (lv < 10 && left >= need(lv)) { left -= need(lv); lv++; }
  if (lv >= 10) { lv = Math.min(MAX_LV, 10 + Math.floor(left / 300)); left = lv >= MAX_LV ? 0 : left % 300; }
  return { level: lv, into: left, next: lv >= MAX_LV ? 0 : need(lv) };
}
/** Coins for reaching level `lv`: 30 at level 2, 10 more each level (up to 500) - and a 250 bonus every 10 levels. */
const reward = (lv) => (lv < 2 ? 0 : Math.min(500, 10 + 10 * lv) + (lv % 10 === 0 ? 250 : 0));

// ---- keys and signatures (Ed25519) ----
const id32 = (u) => String(u || '').replace(/-/g, '').toLowerCase();
const okId = (u) => /^[0-9a-f]{32}$/.test(u);
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const ED_PUB_DER = Buffer.from('302a300506032b6570032100', 'hex');
function pubKey(raw) { const b = unb64u(raw); if (b.length !== 32) return null; try { return crypto.createPublicKey({ key: Buffer.concat([ED_PUB_DER, b]), format: 'der', type: 'spki' }); } catch { return null; } }
/** The exact bytes a request is signed over: its fields (not the signature) in key order. */
function canon(o) { const out = {}; for (const k of Object.keys(o).sort()) if (k !== 's') out[k] = o[k]; return Buffer.from(JSON.stringify(out)); }
function verifySig(raw, req) { const k = pubKey(raw); if (!k || typeof req.s !== 'string') return false; try { return crypto.verify(null, canon(req), k, unb64u(req.s)); } catch { return false; } }
const fpOf = (u) => crypto.createHash('sha256').update('duckky-acct|' + id32(u)).digest('hex').slice(0, 32);
const plusFp = (u) => crypto.createHash('sha256').update('duckky-plus|' + id32(u)).digest('hex');

function empty() { return { v: 1, acc: {}, nonces: {}, items: {}, sellers: [OWNER], paid: {}, cursor: {}, log: [] }; }
function acct(st, u) {
  return (st.acc[u] ||= { name: '', keys: [], c: 0, xp: 0, frac: 0, lv: 1, day: '', dmin: 0, dday: '', lastXp: 0, own: [], earned: 0, spent: 0, sold: 0, at: 0 });
}
const today = (now) => new Date(now).toISOString().slice(0, 10);
const note = (st, now, t) => { st.log.push({ at: now, t }); if (st.log.length > 300) st.log.splice(0, st.log.length - 300); };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

/** An item anyone can buy: one of Duckky's own (shop.json), or a creator's approved cape. */
function itemOf(st, shop, id) {
  const d = (shop.items || []).find((x) => x.id === id);
  if (d) return { ...d, by: '' };
  const c = st.items[id];
  return c && c.status === 'live' ? c : null;
}
function priceFor(item, plus) { return plus ? Math.max(1, Math.round(item.price * (1 - RULES.PLUS_OFF))) : item.price; }

/** A new key (the launcher's), already proven with Mojang by the caller. */
function register(st, { u, name, pub }, now) {
  u = id32(u);
  if (!okId(u) || !pubKey(pub)) return { ok: false, err: 'bad' };
  const a = acct(st, u);
  if (name) a.name = clean(name, 16);
  if (!a.keys.some((k) => k.k === pub)) {
    a.keys.push({ k: pub, t: 'app', label: 'Duckky Client', at: now });
    while (a.keys.length > RULES.MAX_KEYS) a.keys.splice(a.keys.findIndex((k) => k.t === 'app'), 1); // (the oldest launcher key goes first)
  }
  if (!a.at) a.at = now;
  return { ok: true };
}

/**
 * One signed request. ctx: { now, shop, plus: Set of Plus fingerprints }. Returns { ok, err?, msg?, who: [uuids whose
 * wallets changed] }. Nothing is changed when it fails.
 */
function apply(st, req, ctx) {
  const now = ctx.now;
  const u = id32(req && req.u);
  if (!req || typeof req !== 'object' || !okId(u)) return { ok: false, err: 'bad' };
  const a = st.acc[u];
  if (!a || !a.keys.length) return { ok: false, err: 'unknown', who: [] }; // (not registered yet: the launcher proves it first)
  if (typeof req.n !== 'string' || !/^[0-9a-f]{16,40}$/.test(req.n)) return { ok: false, err: 'bad' };
  if (st.nonces[req.n]) return { ok: false, err: 'dup', who: [] };
  const ts = Number(req.ts) || 0;
  if (Math.abs(now - ts) > RULES.REQ_AGE) return { ok: false, err: 'old', who: [] };
  const key = a.keys.find((k) => verifySig(k.k, req));
  if (!key) return { ok: false, err: 'sig', who: [] };
  st.nonces[req.n] = now;
  const plus = ctx.plus && ctx.plus.has(plusFp(u));
  const r = run(st, u, a, key, req, { ...ctx, plus });
  if (r.ok) note(st, now, `${a.name || u.slice(0, 8)} ${req.k}${r.msg ? ': ' + r.msg : ''}`);
  return { ...r, who: [...new Set([u, ...(r.who || [])])] };
}

function run(st, u, a, key, req, ctx) {
  const now = ctx.now;
  switch (req.k) {
    case 'hello': return { ok: true };
    case 'xp': {
      // (minutes played since the last report - never more than the time that really went by)
      let min = Math.floor(Number(req.min) || 0), fr = Math.floor(Number(req.fr) || 0);
      const since = a.lastXp ? Math.floor((now - a.lastXp) / 60_000) + 1 : RULES.REPORT_MAX;
      min = Math.max(0, Math.min(min, RULES.REPORT_MAX, since));
      const d = today(now);
      if (a.dday !== d) { a.dday = d; a.dmin = 0; }
      min = Math.min(min, RULES.DAY_MAX - a.dmin);
      fr = Math.max(0, Math.min(fr, min));
      if (min <= 0) return { ok: true, msg: 'nothing new' };
      a.dmin += min; a.lastXp = now;
      let base = min + fr;
      if (a.day !== d) { a.day = d; base += RULES.DAILY; }
      const add = base * (ctx.plus ? RULES.PLUS_BOOST : 1) + (a.frac || 0);
      const whole = Math.floor(add);
      a.frac = add - whole;
      a.xp += whole;
      const lv = levelOf(a.xp).level;
      let coins = 0;
      for (let l = (a.lv || 1) + 1; l <= lv; l++) coins += reward(l);
      const up = lv > (a.lv || 1);
      a.lv = lv; a.c += coins; a.earned += coins;
      return { ok: true, msg: `+${whole} XP` + (up ? `, level ${lv}, +${coins} coins` : ''), up: up ? lv : 0, coins };
    }
    case 'buy': {
      const it = itemOf(st, ctx.shop, String(req.item || ''));
      if (!it) return { ok: false, err: 'gone', msg: "That isn't for sale" };
      if (a.own.includes(it.id)) return { ok: false, err: 'owned', msg: 'You already have it' };
      if (it.by === u) return { ok: false, err: 'yours', msg: "It's yours already - you made it" };
      const pay = priceFor(it, ctx.plus);
      if (Number(req.max) && pay > Number(req.max)) return { ok: false, err: 'price', msg: 'The price changed - look again' };
      if (a.c < pay) return { ok: false, err: 'coins', msg: `You need ${pay - a.c} more coins` };
      a.c -= pay; a.spent += pay; a.own.push(it.id);
      const who = [];
      if (it.by && okId(it.by)) {
        const s = acct(st, it.by), cut = Math.floor(pay * RULES.SELLER_CUT);
        s.c += cut; s.sold += cut; who.push(it.by);
        if (st.items[it.id]) st.items[it.id].sales = (st.items[it.id].sales || 0) + 1;
      }
      return { ok: true, msg: `bought ${it.name} for ${pay}`, who, paid: pay };
    }
    case 'sell': {
      if (!st.sellers.includes(u)) return { ok: false, err: 'seller', msg: 'Only verified creators can sell capes' };
      const name = clean(req.name, 32), cat = String(req.cat || '');
      if (name.length < 2) return { ok: false, err: 'name', msg: 'Give it a name' };
      if (!CATS.includes(cat)) return { ok: false, err: 'cat', msg: 'Pick a category' };
      const price = Math.round(Number(req.price) || 0);
      if (price < RULES.PRICE_MIN || price > RULES.PRICE_MAX) return { ok: false, err: 'price', msg: `A price from ${RULES.PRICE_MIN} to ${RULES.PRICE_MAX} coins` };
      if (typeof req.ref !== 'string' || req.ref.length > 600 || !/^[0-9a-f]{64}$/.test(String(req.sha || ''))) return { ok: false, err: 'file', msg: "The cape's picture is missing" };
      const waiting = Object.values(st.items).filter((x) => x.by === u && x.status === 'pending').length;
      if (waiting >= RULES.MAX_PENDING) return { ok: false, err: 'many', msg: `${RULES.MAX_PENDING} capes are already waiting for a look` };
      const id = 'c_' + crypto.createHash('sha256').update(u + '|' + req.n).digest('hex').slice(0, 12);
      st.items[id] = { id, kind: 'cape', name, cat, price, by: u, byName: a.name, ref: req.ref, sha: req.sha, color: /^[0-9a-f]{6}$/.test(String(req.color || '')) ? req.color : '', frames: Math.max(1, Math.min(100, Math.floor(Number(req.frames) || 1))), at: now, status: 'pending', sales: 0 };
      return { ok: true, msg: `put up ${name} - waiting for a look`, item: id };
    }
    case 'unsell': {
      const it = st.items[String(req.item || '')];
      if (!it || it.by !== u) return { ok: false, err: 'gone' };
      it.status = 'off'; // (people who bought it keep it)
      return { ok: true, msg: `took ${it.name} off the shop` };
    }
    case 'link': { // (a website login: its key, added from the launcher with the code the website showed)
      if (key.t !== 'app') return { ok: false, err: 'perm', msg: 'Link the website from the launcher' };
      if (!pubKey(req.web)) return { ok: false, err: 'bad' };
      if (!a.keys.some((k) => k.k === req.web)) {
        a.keys.push({ k: req.web, t: 'web', label: clean(req.label, 40) || 'Website', at: now });
        const webs = a.keys.filter((k) => k.t === 'web');
        if (webs.length > 3) a.keys.splice(a.keys.indexOf(webs[0]), 1); // (3 website logins at most - the oldest goes)
      }
      return { ok: true, msg: 'website linked', web: req.web };
    }
    case 'unlink': {
      const i = a.keys.findIndex((k) => k.k === req.web && k.t === 'web');
      if (i < 0) return { ok: true };
      a.keys.splice(i, 1);
      return { ok: true, msg: 'website logged out' };
    }
    case 'mod': { // (the owner only)
      if (u !== OWNER) return { ok: false, err: 'perm' };
      const t = id32(req.target);
      const it = st.items[String(req.item || '')];
      switch (req.act) {
        case 'verify': if (!okId(t)) return { ok: false, err: 'bad' }; if (!st.sellers.includes(t)) st.sellers.push(t); acct(st, t); return { ok: true, msg: 'verified a creator', who: [t] };
        case 'unverify': st.sellers = st.sellers.filter((x) => x !== t || x === OWNER); return { ok: true, msg: 'took a creator off', who: [t] };
        case 'approve': if (!it) return { ok: false, err: 'gone' }; it.status = 'live'; it.at = now; return { ok: true, msg: `approved ${it.name}`, who: [it.by] };
        case 'reject': if (!it) return { ok: false, err: 'gone' }; it.status = 'rejected'; it.why = clean(req.why, 120); return { ok: true, msg: `rejected ${it.name}`, who: [it.by] };
        case 'grant': { if (!okId(t)) return { ok: false, err: 'bad' }; const n = Math.round(Number(req.amount) || 0); if (!n || Math.abs(n) > 1e6) return { ok: false, err: 'bad' }; const b = acct(st, t); b.c += n; return { ok: true, msg: `gave ${n} coins`, who: [t] }; }
        default: return { ok: false, err: 'bad' };
      }
    }
    default: return { ok: false, err: 'bad' };
  }
}

/** Coins bought on Tebex: "500 Duckky Coins" (x quantity). A refund or chargeback takes them back. */
function tebex(st, payments, now) {
  const who = new Set();
  for (const p of payments) {
    const txn = String(p.id || p.txn_id || ''); const u = id32(p.player && p.player.uuid);
    if (!txn || !okId(u)) continue;
    let coins = 0;
    for (const k of p.packages || []) { const m = /(\d[\d,]*)\s*(?:duckky\s*)?coins?/i.exec(String(k.name || '')); if (m) coins += parseInt(m[1].replace(/,/g, ''), 10) * Math.max(1, Number(k.quantity) || 1); }
    if (!coins) continue;
    const st8 = String(p.status || '').toLowerCase();
    const had = st.paid[txn];
    if (st8 === 'complete' && !had) { const a = acct(st, u); a.c += coins; st.paid[txn] = coins; who.add(u); note(st, now, `${a.name || u.slice(0, 8)} bought ${coins} coins`); }
    else if (/refund|chargeback/.test(st8) && had > 0) { const a = acct(st, u); a.c -= had; st.paid[txn] = -had; who.add(u); }
  }
  return [...who];
}

function prune(st, now) { for (const [n, t] of Object.entries(st.nonces)) if (now - t > RULES.NONCE_KEEP) delete st.nonces[n]; }

/** What one account's launcher / website sees of its wallet (sent to it, signed). */
function wallet(st, u, shop) {
  const a = st.acc[u]; if (!a) return null;
  const L = levelOf(a.xp);
  const mine = Object.values(st.items).filter((x) => x.by === u).map((x) => ({ id: x.id, name: x.name, cat: x.cat, price: x.price, status: x.status, sales: x.sales || 0, why: x.why || '' }));
  const w = { u, name: a.name, c: a.c, xp: a.xp, lv: L.level, into: L.into, next: L.next, own: a.own, earned: a.earned, spent: a.spent, sold: a.sold, seller: st.sellers.includes(u), mine, webs: a.keys.filter((k) => k.t === 'web').map((k) => ({ k: k.k, label: k.label, at: k.at })), dmin: a.dday === today(Date.now()) ? a.dmin : 0 };
  if (u === OWNER) w.pending = Object.values(st.items).filter((x) => x.status === 'pending');
  return w;
}

/** The public file every launcher reads: levels, who owns what, and the creators' capes for sale. No coins in it. */
function publicLedger(st, extra) {
  const acc = {};
  for (const [u, a] of Object.entries(st.acc)) if (a.xp || a.own.length) acc[fpOf(u)] = { lv: levelOf(a.xp).level, xp: a.xp, own: a.own };
  const items = Object.values(st.items).filter((x) => x.status === 'live' || x.status === 'off').map(({ id, kind, name, cat, price, by, byName, ref, sha, color, frames, at, sales, status }) => ({ id, kind, name, cat, price, by: fpOf(by), byName, ref, sha, color, frames, at, sales, off: status === 'off' || undefined }));
  return { v: 1, at: Date.now(), ...extra, cats: CATS, rules: { plusOff: RULES.PLUS_OFF, sellerCut: RULES.SELLER_CUT, priceMin: RULES.PRICE_MIN, priceMax: RULES.PRICE_MAX }, acc, items };
}

module.exports = { RULES, CATS, OWNER, levelOf, reward, need, canon, verifySig, pubKey, fpOf, plusFp, id32, b64u, unb64u, empty, register, apply, tebex, prune, wallet, publicLedger, priceFor, itemOf };
