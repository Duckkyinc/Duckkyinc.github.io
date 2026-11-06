// A small Nostr client for the ledger job: reads the requests topic live from several public relays, and sends the
// signed answers back (each account has its own answers topic). Node 22's built-in WebSocket.
'use strict';
const crypto = require('crypto');
const { schnorr } = require('@noble/curves/secp256k1');

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://relay.nostr.net'];
const KIND = 4210; // (the launchers' own kind of message)

class Nostr {
  constructor(sk, { relays = RELAYS, log = () => {} } = {}) {
    this.sk = sk; this.pub = Buffer.from(schnorr.getPublicKey(sk)).toString('hex');
    this.relays = relays; this.log = log; this.conns = new Map(); this.subs = []; this.closed = false;
  }
  start() { for (const u of this.relays) this.open(u); }
  open(url) {
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(url); } catch { return; }
    const c = { ws, url, up: false };
    this.conns.set(url, c);
    ws.onopen = () => { c.up = true; for (const s of this.subs) this.req(c, s); };
    ws.onmessage = (m) => { let a; try { a = JSON.parse(String(m.data)); } catch { return; } if (a[0] === 'EVENT') { const s = this.subs.find((x) => x.id === a[1]); if (s) this.got(s, a[2]); } };
    ws.onclose = () => { c.up = false; if (!this.closed) setTimeout(() => this.open(url), 3000 + Math.random() * 4000); };
    ws.onerror = () => {};
  }
  req(c, s) { try { c.ws.send(JSON.stringify(['REQ', s.id, { kinds: [KIND], '#t': s.topics, since: s.since }])); } catch {} }
  got(s, ev) {
    if (!ev || ev.kind !== KIND || typeof ev.content !== 'string' || s.seen.has(ev.id)) return;
    // (the event really is what it says: its id is its hash, and the signature is good)
    const id = crypto.createHash('sha256').update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content])).digest('hex');
    if (id !== ev.id) return;
    try { if (!schnorr.verify(ev.sig, ev.id, ev.pubkey)) return; } catch { return; }
    s.seen.add(ev.id); if (s.seen.size > 20000) s.seen = new Set([...s.seen].slice(-10000));
    s.on(ev.content, ev.created_at);
  }
  /** Calls on(content, createdAt) for every message on these topics from `since` (unix seconds) on - live after that. */
  subscribe(topics, since, on) { const s = { id: 'l' + crypto.randomBytes(4).toString('hex'), topics, since, on, seen: new Set() }; this.subs.push(s); for (const c of this.conns.values()) if (c.up) this.req(c, s); return s; }
  connected() { return [...this.conns.values()].filter((c) => c.up).length; }
  publish(topic, content, ttlSec = 2 * 86400) {
    const created_at = Math.floor(Date.now() / 1000);
    const tags = [['t', topic], ['expiration', String(created_at + ttlSec)]];
    const id = crypto.createHash('sha256').update(JSON.stringify([0, this.pub, created_at, KIND, tags, content])).digest('hex');
    const sig = Buffer.from(schnorr.sign(id, this.sk)).toString('hex');
    const msg = JSON.stringify(['EVENT', { id, pubkey: this.pub, created_at, kind: KIND, tags, content, sig }]);
    let sent = 0;
    for (const c of this.conns.values()) if (c.up) { try { c.ws.send(msg); sent++; } catch {} }
    return sent;
  }
  close() { this.closed = true; for (const c of this.conns.values()) { try { c.ws.close(); } catch {} } }
}
module.exports = { Nostr, RELAYS, KIND };
