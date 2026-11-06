// Connection to the live temple. Two transports behind one interface:
//  - 'ws':   a WebSocket to the realtime server (VPS), 10 binary updates per second;
//  - 'poll': no server process, the page checks in through api/live.php about once a second
//            (shared hosting such as Hostinger).
// It knows the wire format, keeps the clock in sync and buffers remote positions for
// smooth movement. Rendering stays in temple.js.

export const POSES = ['stand', 'pray', 'bow', 'kneel', 'prostrate', 'sit', 'preach', 'walk'];

const SCALE = 50;

export class Net {
  constructor(handlers) {
    this.h = handlers;           // { welcome, join, leave, chat, act, stats, candle, wish, error, reported, status }
    this.ws = null;
    this.mode = 'ws';
    this.id = 0;
    this.shard = '';
    this.offset = 0;             // server ms - local ms
    this.remote = new Map();     // id -> { profile, samples: [{t,x,z,h,pose}], visible }
    this.state = 'off';          // off | connecting | live | closed
    this.retry = 0;
    this.hello = null;
    this.interp = 120;           // ms of delay used to smooth remote movement
    this.outbox = [];            // poll mode: messages waiting for the next check-in
    this.mine = null;            // poll mode: my latest position
    this.missing = new Map();    // poll mode: check-ins in a row a visitor was absent
    this.failures = 0;
  }

  async start(hello) {
    this.hello = hello;
    let info;
    try {
      const r = await fetch(`api/shard.php?invite=${encodeURIComponent(hello.invite || '')}`, { cache: 'no-store' });
      info = await r.json();
    } catch (e) { info = { enabled: false }; }
    if (!info.enabled) { this.setState('off'); return false; }
    if (info.mode === 'poll') {
      this.mode = 'poll';
      this.pollMs = Math.max(400, info.poll || 1000);
      this.interp = this.pollMs + 250;
      addEventListener('pagehide', () => this.leavePoll());
      this.joinPoll();
      return true;
    }
    this.url = info.url;
    this.connect();
    return true;
  }

  // ---------------- WebSocket transport ----------------
  connect() {
    this.setState('connecting');
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', ...this.hello })); this.ping(); };
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.onText(e.data) : this.onBinary(e.data));
    ws.onclose = () => {
      this.remote.clear();
      if (this.state === 'closed') return;
      this.setState('connecting');
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  // ---------------- polling transport ----------------
  async api(body) {
    const r = await fetch('api/live.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    return r.json();
  }

  async joinPoll() {
    if (this.state === 'closed') return;
    this.setState('connecting');
    let m = null;
    try { m = await this.api({ a: 'join', ...this.hello }); } catch (e) { m = null; }
    if (!m || m.t === 'error') {
      if (m) this.onText(JSON.stringify(m));
      if (this.state === 'closed') return;
      setTimeout(() => this.joinPoll(), Math.min(15000, 1000 * 2 ** this.retry++));
      return;
    }
    this.sid = m.sid; this.since = m.since; this.retry = 0;
    this.onText(JSON.stringify({ ...m, t: 'welcome' }));
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.syncPoll(), this.pollMs);
  }

  async syncPoll() {
    if (this.state === 'closed') return;
    const t0 = Date.now();
    const out = this.outbox.splice(0, 5);
    let m = null;
    try { m = await this.api({ a: 'sync', sid: this.sid, since: this.since, ...(this.mine || {}), out }); } catch (e) { m = null; }
    if (!m) {
      this.outbox.unshift(...out);
      if (++this.failures > 3 && this.state === 'live') this.setState('connecting');
    } else if (m.t === 'error' && m.code === 'gone') {
      this.dropAll(); this.joinPoll(); return;
    } else if (m.t === 'sync') {
      this.failures = 0;
      if (this.state !== 'live') this.setState('live');
      this.applySync(m, Date.now() - t0);
    }
    // check in less often while nobody else is around, to spare the host
    const alone = !this.remote.size;
    this.pollTimer = setTimeout(() => this.syncPoll(), Math.max(200, (alone ? this.pollMs * 2 : this.pollMs) - (Date.now() - t0)));
  }

  applySync(m, rtt) {
    this.offset = m.s + rtt / 2 - Date.now();
    const t = performance.now(), seen = new Set();
    for (const [id, x, z, h, pose, name, look] of m.players) {
      seen.add(id);
      if (!this.remote.has(id)) { const p = { id, name, look, x, z, h, pose }; this.addRemote(p); this.h.join?.(p); }
      const r = this.remote.get(id);
      r.samples.push({ t, x, z, h, pose }); if (r.samples.length > 6) r.samples.shift();
      this.missing.delete(id);
    }
    for (const [id, r] of this.remote) {
      r.visible = seen.has(id);
      if (r.visible) continue;
      const n = (this.missing.get(id) || 0) + 1;
      this.missing.set(id, n);
      if (n >= 4) { this.remote.delete(id); this.missing.delete(id); this.h.leave?.(id); }
    }
    for (const e of m.events) {
      if (e.type === 'chat') this.h.chat?.({ id: e.actor, text: e.data.text });
      else if (e.type === 'act') this.h.act?.({ id: e.actor, a: e.data.a });
      else if (e.type === 'candle') this.h.candle?.(e.data);
      else if (e.type === 'wish') this.h.wish?.(e.data);
    }
    this.since = m.since;
    this.h.stats?.({ online: m.online, here: m.here, incense: m.incense });
    for (const err of m.errors || []) this.h.error?.(err);
    if (m.reported) this.h.reported?.({});
  }

  leavePoll() {
    if (this.mode !== 'poll' || !this.sid) return;
    const body = JSON.stringify({ a: 'leave', sid: this.sid });
    if (navigator.sendBeacon) navigator.sendBeacon('api/live.php', new Blob([body], { type: 'application/json' }));
  }

  dropAll() { for (const id of [...this.remote.keys()]) { this.remote.delete(id); this.h.leave?.(id); } this.missing.clear(); }

  // ---------------- shared ----------------
  stop() { this.setState('closed'); clearTimeout(this.pollTimer); this.leavePoll(); try { this.ws?.close(); } catch (e) { /* already closed */ } }

  setState(s) { this.state = s; this.h.status?.(s); }

  now() { return Date.now() + this.offset; }

  ping() { if (this.mode === 'ws' && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); }

  onText(text) {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.shard = m.shard; this.retry = 0;
        this.offset = m.s - Date.now();
        this.remote.clear();
        for (const p of m.players) this.addRemote(p);
        this.setState('live');
        this.h.welcome?.(m);
        break;
      case 'pong': {
        const rtt = Date.now() - m.c;
        this.offset = m.s + rtt / 2 - Date.now();
        break;
      }
      case 'join': this.addRemote(m.p); this.h.join?.(m.p); break;
      case 'leave': this.remote.delete(m.id); this.h.leave?.(m.id); break;
      case 'error':
        if (m.code === 'name' || m.code === 'banned' || m.code === 'too_many') this.setState('closed');
        this.h.error?.(m);
        break;
      default: this.h[m.t]?.(m);
    }
  }

  addRemote(p) {
    this.remote.set(p.id, { profile: p, samples: [{ t: performance.now(), x: p.x, z: p.z, h: p.h, pose: p.pose }], visible: true });
  }

  onBinary(buf) {
    const v = new DataView(buf);
    if (v.getUint8(0) !== 2) return;
    const n = v.getUint16(1, true);
    const t = performance.now();
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const o = 3 + i * 8;
      const id = v.getUint16(o, true);
      const r = this.remote.get(id);
      if (!r) continue;
      seen.add(id);
      r.samples.push({ t, x: v.getInt16(o + 2, true) / SCALE, z: v.getInt16(o + 4, true) / SCALE, h: v.getUint8(o + 6), pose: v.getUint8(o + 7) });
      if (r.samples.length > 6) r.samples.shift();
    }
    for (const [id, r] of this.remote) r.visible = seen.has(id);
  }

  /** Interpolated state of a remote visitor, `interp` ms in the past. */
  sample(r) {
    const t = performance.now() - this.interp, s = r.samples;
    if (s.length === 1 || t <= s[0].t) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].t <= t) {
        const a = s[i - 1], b = s[i], k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
        let dh = b.h - a.h; if (dh > 128) dh -= 256; if (dh < -128) dh += 256;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: (a.h + dh * k + 256) % 256, pose: b.pose };
      }
    }
    return s[s.length - 1];
  }

  sendMove(x, z, heading, pose) {
    const hb = Math.round((((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256) & 255;
    const pi = Math.max(0, POSES.indexOf(pose));
    if (this.mode === 'poll') { this.mine = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, h: hb, pose: pi }; return; }
    if (this.ws?.readyState !== 1 || this.state !== 'live') return;
    const buf = new ArrayBuffer(7), v = new DataView(buf);
    v.setUint8(0, 1);
    v.setInt16(1, Math.round(Math.max(-650, Math.min(650, x)) * SCALE), true);
    v.setInt16(3, Math.round(Math.max(-650, Math.min(650, z)) * SCALE), true);
    v.setUint8(5, hb);
    v.setUint8(6, pi);
    this.ws.send(buf);
  }

  send(obj) {
    if (this.mode === 'poll') {
      if (this.state === 'live' && obj.t !== 'ping') { this.outbox.push(obj); if (this.outbox.length > 10) this.outbox.shift(); }
      return;
    }
    if (this.ws?.readyState === 1 && this.state === 'live') this.ws.send(JSON.stringify(obj));
  }
}

export const headingFromByte = (b) => b / 256 * Math.PI * 2;
