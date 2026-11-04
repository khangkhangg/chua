// Connection to the realtime server. Pure transport: it knows the wire format,
// keeps the clock in sync and buffers remote positions for smooth movement.
// Rendering stays in temple.js.

export const POSES = ['stand', 'pray', 'bow', 'kneel', 'prostrate', 'sit', 'preach', 'walk'];

const SCALE = 50;
const INTERP_MS = 120;

export class Net {
  constructor(handlers) {
    this.h = handlers;           // { welcome, join, leave, chat, act, stats, candle, wish, error, reported, status }
    this.ws = null;
    this.id = 0;
    this.shard = '';
    this.offset = 0;             // server ms - local ms
    this.remote = new Map();     // id -> { profile, samples: [{t,x,z,h,pose}] }
    this.state = 'off';          // off | connecting | live | closed
    this.retry = 0;
    this.hello = null;
  }

  async start(hello) {
    this.hello = hello;
    let info;
    try {
      const r = await fetch(`api/shard.php?invite=${encodeURIComponent(hello.invite || '')}`, { cache: 'no-store' });
      info = await r.json();
    } catch (e) { info = { enabled: false }; }
    if (!info.enabled) { this.setState('off'); return false; }
    this.url = info.url;
    this.connect();
    return true;
  }

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

  stop() { this.setState('closed'); try { this.ws?.close(); } catch (e) { /* already closed */ } }

  setState(s) { this.state = s; this.h.status?.(s); }

  now() { return Date.now() + this.offset; }

  ping() { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); }

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

  /** Interpolated state of a remote visitor about INTERP_MS in the past. */
  sample(r) {
    const t = performance.now() - INTERP_MS, s = r.samples;
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
    if (this.ws?.readyState !== 1 || this.state !== 'live') return;
    const buf = new ArrayBuffer(7), v = new DataView(buf);
    v.setUint8(0, 1);
    v.setInt16(1, Math.round(Math.max(-650, Math.min(650, x)) * SCALE), true);
    v.setInt16(3, Math.round(Math.max(-650, Math.min(650, z)) * SCALE), true);
    const h = (((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256;
    v.setUint8(5, Math.round(h) & 255);
    v.setUint8(6, Math.max(0, POSES.indexOf(pose)));
    this.ws.send(buf);
  }

  send(obj) { if (this.ws?.readyState === 1 && this.state === 'live') this.ws.send(JSON.stringify(obj)); }
}

export const headingFromByte = (b) => b / 256 * Math.PI * 2;
