// node .github/ledger/test.js - checks the coin rules
'use strict';
const crypto = require('crypto');
const C = require('./core');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function keyPair() { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { pub: C.b64u(publicKey.export({ format: 'der', type: 'spki' }).subarray(12)), priv: privateKey }; }
const sign = (kp, req) => ({ ...req, s: C.b64u(crypto.sign(null, C.canon(req), kp.priv)) });
let N = 0, T = Date.parse('2026-11-05T12:00:00Z');
const req = (kp, u, o) => sign(kp, { v: 1, u, ts: T, n: crypto.randomBytes(10).toString('hex') + (N++).toString(16).padStart(4, '0'), ...o });
const shop = { items: [{ id: 'pet_axolotl', kind: 'pet', name: 'Axolotl', cat: 'Animals', price: 600 }, { id: 'cape_frog', kind: 'cape', name: 'Frog', cat: 'Animals', price: 800 }] };
const st = C.empty();
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', O = C.OWNER;
const ka = keyPair(), kb = keyPair(), ko = keyPair(), evil = keyPair();
C.register(st, { u: A, name: 'Alice', pub: ka.pub }, T); C.register(st, { u: B, name: 'Bob', pub: kb.pub }, T); C.register(st, { u: O, name: 'Owner', pub: ko.pub }, T);
const ctx = (o = {}) => ({ now: T, shop, plus: new Set(), ...o });
// signatures
ok(C.apply(st, req(evil, A, { k: 'hello' }), ctx()).err === 'sig', 'someone else\'s key is refused');
const r1 = req(ka, A, { k: 'hello' }); ok(C.apply(st, r1, ctx()).ok, 'own key works'); ok(C.apply(st, r1, ctx()).err === 'dup', 'the same request twice is refused');
const tam = req(ka, A, { k: 'hello' }); tam.k = 'xp'; ok(C.apply(st, tam, ctx()).err === 'sig', 'a changed request is refused');
ok(C.apply(st, req(ka, 'cccccccccccccccccccccccccccccccc', { k: 'hello' }), ctx()).err === 'unknown', 'unregistered account');
ok(C.apply(st, { ...req(ka, A, { k: 'hello' }) }, ctx({ now: T + 3 * 3600_000 })).err === 'old', 'an old request is refused');
// xp + caps
let r = C.apply(st, req(ka, A, { k: 'xp', min: 999, fr: 999 }), ctx()); ok(r.ok && st.acc[A].xp === 15 + 15 + 25, 'first report: capped at 15 min + friend + daily: ' + st.acc[A].xp);
T += 60_000; r = C.apply(st, req(ka, A, { k: 'xp', min: 15 }), ctx()); ok(st.acc[A].xp === 55 + 2, 'only the minutes that really went by count: ' + st.acc[A].xp);
// level up -> coins
for (let i = 0; i < 40; i++) { T += 15 * 60_000; C.apply(st, req(ka, A, { k: 'xp', min: 15, fr: 15 }), ctx()); }
const lvA = st.acc[A].lv; let exp = 0; for (let l = 2; l <= lvA; l++) exp += C.reward(l); ok(lvA > 3 && st.acc[A].c === exp, `level ${lvA}, coins ${st.acc[A].c} = ${exp}`);
// daily cap
const st2 = C.empty(); C.register(st2, { u: A, pub: ka.pub }, T); let t2 = T; for (let i = 0; i < 100; i++) { t2 += 15 * 60_000; C.apply(st2, req(ka, A, { k: 'xp', min: 15, ts: t2 }), { now: t2, shop, plus: new Set() }); }
ok(st2.acc[A].dmin <= C.RULES.DAY_MAX, '16 hours a day at most: ' + st2.acc[A].dmin);
// buy
st.acc[A].c = 1000;
r = C.apply(st, req(ka, A, { k: 'buy', item: 'cape_frog' }), ctx()); ok(r.ok && st.acc[A].c === 200 && st.acc[A].own.includes('cape_frog'), 'bought a Duckky cape');
ok(C.apply(st, req(ka, A, { k: 'buy', item: 'cape_frog' }), ctx()).err === 'owned', "can't buy twice");
ok(C.apply(st, req(ka, A, { k: 'buy', item: 'pet_axolotl' }), ctx()).err === 'coins', 'not enough coins');
// plus discount
st.acc[A].c = 600; r = C.apply(st, req(ka, A, { k: 'buy', item: 'pet_axolotl' }), ctx({ plus: new Set([C.plusFp(A)]) })); ok(r.ok && st.acc[A].c === 90, 'Plus: 15% off (510): ' + st.acc[A].c);
// selling
ok(C.apply(st, req(kb, B, { k: 'sell', name: 'Cat', cat: 'Animals', price: 1000, ref: 'x', sha: 'a'.repeat(64) }), ctx()).err === 'seller', 'only verified creators sell');
C.apply(st, req(ko, O, { k: 'mod', act: 'verify', target: B }), ctx());
ok(C.apply(st, req(kb, B, { k: 'sell', name: 'Cat', cat: 'Kittens', price: 1000, ref: 'x', sha: 'a'.repeat(64) }), ctx()).err === 'cat', 'a category is a must');
r = C.apply(st, req(kb, B, { k: 'sell', name: 'wait im goated', cat: 'Animals', price: 1000, ref: 'x', sha: 'a'.repeat(64) }), ctx()); ok(r.ok && r.item, 'verified creator puts a cape up');
const cid = r.item;
ok(C.apply(st, req(ka, A, { k: 'buy', item: cid }), ctx()).err === 'gone', 'not for sale until approved');
ok(C.apply(st, req(kb, B, { k: 'mod', act: 'approve', item: cid }), ctx()).err === 'perm', 'only the owner approves');
C.apply(st, req(ko, O, { k: 'mod', act: 'approve', item: cid }), ctx());
st.acc[A].c = 1000; const before = st.acc[B].c;
r = C.apply(st, req(ka, A, { k: 'buy', item: cid }), ctx()); ok(r.ok && r.who.includes(B) && st.acc[B].c - before === 800 && st.acc[A].c === 0, 'the creator gets 80%: ' + (st.acc[B].c - before));
st.acc[A].own = st.acc[A].own.filter((x) => x !== cid); st.acc[A].c = 1000; const b2 = st.acc[B].c;
C.apply(st, req(ka, A, { k: 'buy', item: cid }), ctx({ plus: new Set([C.plusFp(A)]) })); ok(st.acc[B].c - b2 === 680 && st.acc[A].c === 150, '80% of the Plus price: ' + (st.acc[B].c - b2));
ok(C.apply(st, req(kb, B, { k: 'buy', item: cid }), ctx()).err === 'yours', "can't buy your own");
// website link
const web = keyPair();
ok(C.apply(st, req(web, A, { k: 'hello' }), ctx()).err === 'sig', 'website key not linked yet');
C.apply(st, req(ka, A, { k: 'link', web: web.pub, label: 'Chrome' }), ctx()); ok(C.apply(st, req(web, A, { k: 'hello' }), ctx()).ok, 'linked website key works');
ok(C.apply(st, req(web, A, { k: 'link', web: keyPair().pub }), ctx()).err === 'perm', "the website can't link more logins itself");
// tebex
const who = C.tebex(st, [{ id: 'tbx-1', status: 'Complete', player: { uuid: B }, packages: [{ name: '1,100 Duckky Coins', quantity: 2 }] }], T); const bc = st.acc[B].c;
C.tebex(st, [{ id: 'tbx-1', status: 'Complete', player: { uuid: B }, packages: [{ name: '1,100 Duckky Coins', quantity: 2 }] }], T); ok(who.includes(B) && st.acc[B].c === bc, 'a payment counts once');
C.tebex(st, [{ id: 'tbx-1', status: 'Refund', player: { uuid: B }, packages: [{ name: '1,100 Duckky Coins' }] }], T); ok(st.acc[B].c === bc - 2200, 'a refund takes them back');
// public file: no coins
const pub = C.publicLedger(st, {}); ok(!JSON.stringify(pub).includes('"c":') && pub.items.length === 1 && pub.acc[C.fpOf(A)].own.length, 'public file: who owns what, no coins');
const w = C.wallet(st, O, shop); ok(Array.isArray(w.pending), 'the owner sees capes waiting');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
