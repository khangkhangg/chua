// Load test for the realtime server at scale (k6 is not PHP; install it from k6.io).
//   k6 run -e URL=wss://chua.vietnamcos.com/ws -e VUS=10000 -e SECONDS=120 tests/load/k6_walkers.js
// Each virtual visitor says hello, walks in a circle at 10 updates per second and
// counts the position frames it receives. Pass: p95 time to welcome under 1 s and
// state frames arriving at about 10 per second per visitor.
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const URL = __ENV.URL || 'ws://127.0.0.1:9502';
const SECONDS = Number(__ENV.SECONDS || 60);
export const options = {
  scenarios: { walkers: { executor: 'ramping-vus', startVUs: 0, stages: [
    { duration: '60s', target: Number(__ENV.VUS || 1000) },
    { duration: `${SECONDS}s`, target: Number(__ENV.VUS || 1000) },
  ], gracefulRampDown: '10s' } },
  thresholds: { welcome_ms: ['p(95)<1000'], state_frames: ['count>0'] },
};
const welcomeMs = new Trend('welcome_ms');
const stateFrames = new Counter('state_frames');

export default function () {
  const res = ws.connect(URL, {}, (socket) => {
    const t0 = Date.now();
    let a = Math.random() * 6.28;
    const r = 3 + Math.random() * 20;
    socket.on('open', () => {
      socket.send(JSON.stringify({ t: 'hello', name: `Load ${__VU}`, look: { outfit: 'modern', color: '#3d6aa0' } }));
      socket.setInterval(() => {
        a += 0.05;
        const buf = new ArrayBuffer(7); const v = new DataView(buf);
        v.setUint8(0, 1); v.setInt16(1, Math.round(Math.cos(a) * r * 50), true); v.setInt16(3, Math.round((5 + Math.sin(a) * r) * 50), true);
        v.setUint8(5, 0); v.setUint8(6, 0);
        socket.sendBinary(buf);
      }, 100);
    });
    socket.on('message', (m) => { if (m.indexOf('"welcome"') > 0) welcomeMs.add(Date.now() - t0); });
    socket.on('binaryMessage', () => stateFrames.add(1));
    socket.setTimeout(() => socket.close(), SECONDS * 1000);
  });
  check(res, { 'upgraded': (r) => r && r.status === 101 });
}
