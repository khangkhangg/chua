// Painted statues: each deity is drawn on a canvas in an illustration style (outlined shapes, soft gradients,
// cloth folds) and shown in its hall as a sprite. Drawing units are 1/100 of the canvas width.
const OUT = '#4a2208', LINE = '#6b3410';
const SKIN = ['#fde7b5', '#e2a95f'], BLUE_HAIR = ['#4d67a6', '#1f2a57'];
const LOOK = {
  thichca: { pose: 'seated', robe: ['#f8ab45', '#c45f17'], skin: SKIN, hair: ['#b6602a', '#5c2a0d'], trim: '#a8470f' },
  duocsu: { pose: 'seated', robe: ['#dc5c3c', '#8c2615'], skin: SKIN, hair: BLUE_HAIR, trim: '#e9b949', bowl: true },
  adida: { pose: 'standing', robe: ['#e2603a', '#8f2a14'], skin: SKIN, hair: BLUE_HAIR, trim: '#e9b949', arms: 'welcome' },
  quanam: { pose: 'standing', robe: ['#fffdf6', '#d3c3ac'], skin: ['#fde6c8', '#dfa877'], veil: true, trim: '#e2b24a', arms: 'vase' },
  diatang: { pose: 'standing', robe: ['#d64434', '#7a1b14'], skin: SKIN, bald: true, trim: '#f0c454', arms: 'staff', kasaya: true },
  dilac: { pose: 'laughing', robe: ['#f7a541', '#c15f17'], skin: SKIN, bald: true, smile: true },
  dansanh: { pose: 'baby', robe: ['#e2553a', '#93281a'], skin: ['#fde39a', '#d9a245'], hair: BLUE_HAIR, trim: '#f0c454' },
  adida_s: { pose: 'seated', robe: ['#e2603a', '#8f2a14'], skin: SKIN, hair: BLUE_HAIR, trim: '#e9b949' },
  // Hộ Pháp: Khuyến Thiện (calm, white face, sword) and Trừng Ác (red face, mace).
  hophap1: { pose: 'guardian', robe: ['#3f7a4a', '#1f4a2a'], skin: ['#f6e6cf', '#d8b58e'], weapon: 'sword' },
  hophap2: { pose: 'guardian', robe: ['#b8302a', '#701812'], skin: ['#de6a52', '#9a3020'], weapon: 'mace' },
};
const SIZE = { seated: 112, standing: 190, laughing: 112, baby: 150, guardian: 190 };   // height in units; width is always 100

export const paintDeity = name => paintFigure(LOOK[name]);
export function paintFigure(o, W = 512) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Math.round(W * SIZE[o.pose] / 100);
  const c = cv.getContext('2d'); c.scale(W / 100, W / 100); c.lineJoin = c.lineCap = 'round';
  ({ seated, standing, laughing, baby, guardian })[o.pose](c, o);
  return cv;
}

// The eighteen La Hán: seated monks, each with his own robe, face and object, so no two look alike.
const ARHAT_ROBES = [['#f2a640', '#b8601a'], ['#c9503a', '#7f2414'], ['#8a6a3e', '#4e3820'], ['#d9b65a', '#94701e'], ['#a0563a', '#5e2a16'], ['#e07b39', '#9a4316']];
const ARHAT_SKIN = [['#f6d7ad', '#c9905a'], ['#e8c08e', '#a8703e'], ['#d9a878', '#94603a']];
const ARHAT_ATTR = ['bowl', 'beads', 'scroll', 'pagoda', 'fan', 'staff', 'beads', 'bowl', 'none'];
export const arhatLook = i => ({ pose: 'seated', bald: true, robe: ARHAT_ROBES[i % 6], skin: ARHAT_SKIN[(i * 7) % 3],
  trim: ARHAT_ROBES[(i + 3) % 6][1], attr: ARHAT_ATTR[i % 9], longBrows: i % 3 !== 1, beard: i % 4 === 0 });

// Thousand-Buddha wall: rows of small gilded Buddhas in arched niches on a lacquer-red ground.
export function paintMural(cols = 18, rows = 6) {
  const W = 1024, H = 400, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'), cw = W / cols, ch = H / rows;
  c.fillStyle = lin(c, 0, 0, 0, H, '#7a1c12', '#4a0e08'); c.fillRect(0, 0, W, H);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw + cw / 2, y = j * ch, r = cw * .2;
    c.beginPath(); c.moveTo(x - cw * .4, y + ch * .95); c.lineTo(x - cw * .4, y + ch * .35); c.arc(x, y + ch * .35, cw * .4, Math.PI, 0); c.lineTo(x + cw * .4, y + ch * .95); c.closePath();
    c.fillStyle = '#2c0804'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#c9963a'; c.stroke();
    c.fillStyle = 'rgba(255,214,120,.35)'; c.beginPath(); c.arc(x, y + ch * .36, r * 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = lin(c, x - r, 0, x + r, 0, '#b8801f', '#f6d478', '#b8801f');
    c.beginPath(); c.ellipse(x, y + ch * .86, r * 1.6, r * .5, 0, 0, Math.PI * 2); c.fill();   // lap
    c.beginPath(); c.moveTo(x - r * .8, y + ch * .84); c.quadraticCurveTo(x - r * .9, y + ch * .52, x, y + ch * .5); c.quadraticCurveTo(x + r * .9, y + ch * .52, x + r * .8, y + ch * .84); c.fill();
    c.beginPath(); c.arc(x, y + ch * .42, r * .55, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x, y + ch * .33, r * .28, 0, Math.PI * 2); c.fill();
  }
  return cv;
}

/* ---------- drawing helpers ---------- */
function lin(c, x0, y0, x1, y1, ...cols) { const g = c.createLinearGradient(x0, y0, x1, y1); cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col)); return g; }
function rad(c, x, y, r, a, b) { const g = c.createRadialGradient(x, y, r * .1, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function shape(c, fill, draw, lw = .7) { c.beginPath(); draw(); c.closePath(); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); } }
function oval(c, fill, x, y, rx, ry, rot = 0, lw = .7) { shape(c, fill, () => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), lw); }
// Open strokes: each entry is [x, y, then control-x, control-y, x, y pairs for quadratic curves].
function lines(c, col, lw, list) { c.strokeStyle = col; c.lineWidth = lw; for (const p of list) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 4) c.quadraticCurveTo(p[i], p[i + 1], p[i + 2], p[i + 3]); c.stroke(); } }
// An outlined tube, used for forearms in sleeves and the baby's arms.
function tube(c, col, w, pts) { lines(c, OUT, w + 1.2, [pts]); lines(c, col, w, [pts]); }

// Hand with fingers pointing along -y before rotation; kind is 'open', 'fist' or 'point'.
function hand(c, x, y, ang, S, kind = 'open', flip = 1) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(flip, 1); const f = lin(c, -3, 0, 3, 0, S[0], S[1]);
  if (kind === 'open') for (let i = 0; i < 4; i++) shape(c, f, () => c.roundRect(-3.3 + i * 1.65, -7.2 + [.7, 0, .2, .9][i], 1.6, 5.6, .8), .35);
  if (kind === 'point') shape(c, f, () => c.roundRect(-1.9, -8, 1.7, 6.4, .85), .35);
  shape(c, f, () => c.roundRect(-3.4, -2.6, 6.8, 5.8, 2.2), .45);
  if (kind !== 'open') lines(c, S[1], .3, [[-2.6, -1, -.6, -1.8, 2.6, -1], [-2.6, .8, -.6, 0, 2.6, .8]]);
  shape(c, f, () => c.ellipse(3.5, -.2, 1.1, 2.6, -.5, 0, Math.PI * 2), .35);
  c.restore();
}

/* ---------- head ---------- */
function head(c, x, y, r, o) {
  const S = o.skin, face = rad(c, x - r * .3, y - r * .3, r * 1.6, S[0], S[1]);
  shape(c, lin(c, x - r * .5, 0, x + r * .5, 0, S[1], S[0], S[1]), () => { c.moveTo(x - r * .42, y + r * .7); c.lineTo(x - r * .48, y + r * 1.72); c.lineTo(x + r * .48, y + r * 1.72); c.lineTo(x + r * .42, y + r * .7); });
  lines(c, S[1], r * .05, [[x - r * .36, y + r * 1.18, x, y + r * 1.3, x + r * .36, y + r * 1.18], [x - r * .4, y + r * 1.42, x, y + r * 1.55, x + r * .4, y + r * 1.42]]);   // neck folds
  if (o.veil) shape(c, lin(c, x - r * 1.8, 0, x + r * 1.8, 0, o.robe[1], o.robe[0], o.robe[1]), () => { c.moveTo(x, y - r * 1.6); c.bezierCurveTo(x + r * 1.55, y - r * 1.55, x + r * 1.45, y + r * .6, x + r * 1.8, y + r * 2.9); c.lineTo(x - r * 1.8, y + r * 2.9); c.bezierCurveTo(x - r * 1.45, y + r * .6, x - r * 1.55, y - r * 1.55, x, y - r * 1.6); });
  for (const s of [-1, 1]) shape(c, face, () => { c.moveTo(x + s * r * .9, y - r * .3); c.bezierCurveTo(x + s * r * 1.32, y - r * .42, x + s * r * 1.34, y + r * .45, x + s * r * 1.16, y + r * 1.05); c.bezierCurveTo(x + s * r * 1.1, y + r * 1.3, x + s * r * .92, y + r * 1.2, x + s * r * .93, y + r * .75); });   // long earlobes
  shape(c, face, () => { c.moveTo(x - r, y - r * .15); c.bezierCurveTo(x - r * 1.02, y - r * 1.32, x + r * 1.02, y - r * 1.32, x + r, y - r * .15); c.bezierCurveTo(x + r, y + r * .65, x + r * .5, y + r * 1.18, x, y + r * 1.22); c.bezierCurveTo(x - r * .5, y + r * 1.18, x - r, y + r * .65, x - r, y - r * .15); });
  if (o.helmet) {
    shape(c, lin(c, 0, y - r * 2.7, 0, y - r * 1.4, '#e8402a', '#8a1810'), () => { c.moveTo(x, y - r * 1.4); c.bezierCurveTo(x - r * .9, y - r * 2.2, x - r * .2, y - r * 2.8, x + r * .5, y - r * 2.6); c.bezierCurveTo(x, y - r * 2.3, x + r * .3, y - r * 1.8, x, y - r * 1.4); });   // plume
    const hg = lin(c, x - r * 1.2, 0, x + r * 1.2, 0, '#b07a1c', '#f6d478', '#b07a1c');
    for (const s of [-1, 1]) shape(c, hg, () => { c.moveTo(x + s * r * 1.08, y - r * .4); c.lineTo(x + s * r * 1.5, y + r * .25); c.lineTo(x + s * r * 1.02, y + r * .4); });   // cheek guards
    shape(c, hg, () => { c.moveTo(x - r * 1.14, y - r * .32); c.bezierCurveTo(x - r * 1.22, y - r * 1.75, x + r * 1.22, y - r * 1.75, x + r * 1.14, y - r * .32); c.quadraticCurveTo(x, y - r * .64, x - r * 1.14, y - r * .32); });
    oval(c, '#c8322a', x, y - r * .98, r * .18, r * .22, 0, .4);
  } else if (o.bald) lines(c, 'rgba(255,255,255,.4)', r * .12, [[x - r * .55, y - r * .78, x - r * .15, y - r * 1.02, x + r * .2, y - r * .96]]);   // shine on the shaved head
  else if (o.veil) {
    shape(c, '#2c2a35', () => { c.moveTo(x - r * 1.02, y - r * .2); c.bezierCurveTo(x - r * 1.05, y - r * 1.25, x + r * 1.05, y - r * 1.25, x + r * 1.02, y - r * .2); c.bezierCurveTo(x + r * .6, y - r * .5, x - r * .6, y - r * .5, x - r * 1.02, y - r * .2); }, .4);
    shape(c, lin(c, x - r * 1.2, 0, x + r * 1.2, 0, o.robe[1], o.robe[0], o.robe[1]), () => { c.moveTo(x - r * 1.1, y - r * .05); c.bezierCurveTo(x - r * 1.15, y - r * 1.6, x + r * 1.15, y - r * 1.6, x + r * 1.1, y - r * .05); c.bezierCurveTo(x + r * 1.0, y - r * .95, x - r * 1.0, y - r * .95, x - r * 1.1, y - r * .05); });
    shape(c, lin(c, 0, y - r * 1.25, 0, y - r * .7, '#f8dc7a', '#b8801f'), () => { c.moveTo(x - r * .3, y - r * .78); c.lineTo(x - r * .22, y - r * 1.12); c.lineTo(x, y - r * 1.32); c.lineTo(x + r * .22, y - r * 1.12); c.lineTo(x + r * .3, y - r * .78); }, .4);   // small crown
    oval(c, '#c8323a', x, y - r * 1.0, r * .1, r * .12, 0, .3);
  } else curls(c, x, y, r, o.hair);
  features(c, x, y, r, o);
}
// Snail-shell curls over the scalp and the raised crown (ushnisha); lower rows overlap the ones above.
function curls(c, x, y, r, h) {
  const dome = (px, py) => ((px - x) / (r * .58)) ** 2 + ((py - (y - r * 1.25)) / (r * .5)) ** 2 < 1;
  const cap = (px, py) => ((px - x) / (r * 1.04)) ** 2 + ((py - (y - r * .2)) / (r * 1.12)) ** 2 < 1 && py < y - r * .56 + r * .46 * ((px - x) / r) ** 2;
  oval(c, h[1], x, y - r * 1.25, r * .58, r * .5, 0, 0);
  shape(c, h[1], () => { c.moveTo(x - r * 1.03, y - r * .12); c.bezierCurveTo(x - r * 1.06, y - r * 1.4, x + r * 1.06, y - r * 1.4, x + r * 1.03, y - r * .12); c.bezierCurveTo(x + r * .7, y - r * .4, x + r * .3, y - r * .58, x, y - r * .58); c.bezierCurveTo(x - r * .3, y - r * .58, x - r * .7, y - r * .4, x - r * 1.03, y - r * .12); }, 0);
  const st = r * .19;
  for (let j = 0, py = y - r * 1.72; py < y - r * .1; j++, py += st * .85)
    for (let px = x - r * 1.1 + (j % 2) * st / 2; px < x + r * 1.1; px += st)
      if (dome(px, py) || cap(px, py)) oval(c, rad(c, px - st * .18, py - st * .18, st * .62, h[0], h[1]), px, py, st * .52, st * .52, 0, .25);
  shape(c, lin(c, 0, y - r * 1.95, 0, y - r * 1.65, '#ffe08a', '#c07a1a'), () => { c.moveTo(x, y - r * 2.05); c.quadraticCurveTo(x + r * .2, y - r * 1.85, x, y - r * 1.68); c.quadraticCurveTo(x - r * .2, y - r * 1.85, x, y - r * 2.05); }, .3);   // jewel on the crown
}
function features(c, x, y, r, o) {
  const d = o.skin[1];
  if (o.fierce) {   // guardian: thick angry brows, open eyes, beard
    lines(c, LINE, r * .15, [[x - r * .82, y - r * .36, x - r * .45, y - r * .34, x - r * .12, y - r * .1], [x + r * .82, y - r * .36, x + r * .45, y - r * .34, x + r * .12, y - r * .1]]);
    for (const s of [-1, 1]) { oval(c, '#fffaf0', x + s * r * .42, y + r * .06, r * .21, r * .12, 0, r * .04); oval(c, '#1a120c', x + s * r * .4, y + r * .07, r * .08, r * .08, 0, 0); }
    lines(c, d, r * .07, [[x - r * .04, y - r * .1, x - r * .16, y + r * .3, x - r * .14, y + r * .46], [x - r * .24, y + r * .5, x, y + r * .62, x + r * .24, y + r * .5]]);
    shape(c, '#2a1a12', () => { c.moveTo(x - r * .62, y + r * .58); c.quadraticCurveTo(x, y + r * .48, x + r * .62, y + r * .58); c.quadraticCurveTo(x + r * .45, y + r * 1.55, x, y + r * 1.8); c.quadraticCurveTo(x - r * .45, y + r * 1.55, x - r * .62, y + r * .58); }, r * .04);
    oval(c, '#7a1a12', x, y + r * .78, r * .2, r * .1, 0, 0);
    return;
  }
  lines(c, LINE, r * .07, [[x - r * .78, y - r * .12, x - r * .46, y - r * .36, x - r * .14, y - r * .2], [x + r * .78, y - r * .12, x + r * .46, y - r * .36, x + r * .14, y - r * .2]]);   // brows
  const eye = o.smile ? -.1 : .24;   // closed eyes: curved down in calm, up when laughing
  lines(c, LINE, r * .08, [[x - r * .66, y + r * .08, x - r * .42, y + r * eye, x - r * .16, y + r * .08], [x + r * .66, y + r * .08, x + r * .42, y + r * eye, x + r * .16, y + r * .08]]);
  if (!o.smile) lines(c, d, r * .05, [[x - r * .64, y - r * .02, x - r * .42, y + r * .06, x - r * .2, y - r * .02], [x + r * .64, y - r * .02, x + r * .42, y + r * .06, x + r * .2, y - r * .02]]);
  lines(c, d, r * .06, [[x - r * .04, y - r * .1, x - r * .13, y + r * .3, x - r * .12, y + r * .46], [x - r * .2, y + r * .5, x, y + r * .6, x + r * .2, y + r * .5]]);   // nose
  if (o.smile) {
    shape(c, '#8a2a1a', () => { c.moveTo(x - r * .48, y + r * .66); c.quadraticCurveTo(x, y + r * 1.14, x + r * .48, y + r * .66); c.quadraticCurveTo(x, y + r * .8, x - r * .48, y + r * .66); }, r * .05);
    for (const s of [-1, 1]) oval(c, 'rgba(230,110,80,.3)', x + s * r * .62, y + r * .42, r * .26, r * .17, 0, 0);
  } else {
    shape(c, '#cf6b45', () => { c.moveTo(x - r * .3, y + r * .8); c.quadraticCurveTo(x - r * .12, y + r * .7, x, y + r * .76); c.quadraticCurveTo(x + r * .12, y + r * .7, x + r * .3, y + r * .8); c.quadraticCurveTo(x, y + r * .98, x - r * .3, y + r * .8); }, r * .04);
    lines(c, '#8a3518', r * .04, [[x - r * .28, y + r * .8, x, y + r * .84, x + r * .28, y + r * .8]]);
    for (const s of [-1, 1]) oval(c, 'rgba(230,120,90,.16)', x + s * r * .55, y + r * .45, r * .25, r * .16, 0, 0);
  }
  if (o.beard) shape(c, '#efe9df', () => { c.moveTo(x - r * .5, y + r * .9); c.quadraticCurveTo(x, y + r * 1.05, x + r * .5, y + r * .9); c.quadraticCurveTo(x + r * .35, y + r * 1.7, x, y + r * 1.95); c.quadraticCurveTo(x - r * .35, y + r * 1.7, x - r * .5, y + r * .9); }, r * .04);   // an old monk's white beard
  if (o.longBrows) lines(c, '#efe9df', r * .1, [[x - r * .2, y - r * .26, x - r * .8, y - r * .4, x - r * 1.25, y + r * .35], [x + r * .2, y - r * .26, x + r * .8, y - r * .4, x + r * 1.25, y + r * .35]]);   // long white brows
  if (!o.bald) oval(c, '#9a4a18', x, y - r * .3, r * .07, r * .07, 0, 0);   // urna
}

/* ---------- seated, in meditation (Thích Ca) or holding the medicine bowl (Dược Sư) ---------- */
function lap(c, R) {
  shape(c, lin(c, 0, 74, 0, 108, R[0], R[1]), () => { c.moveTo(6, 99); c.bezierCurveTo(6, 84, 22, 76, 50, 77); c.bezierCurveTo(78, 76, 94, 84, 94, 99); c.bezierCurveTo(94, 108, 70, 109, 50, 106); c.bezierCurveTo(30, 109, 6, 108, 6, 99); });
  lines(c, R[1], .5, [[12, 96, 30, 88, 48, 92], [88, 96, 70, 88, 52, 92], [20, 104, 35, 98, 50, 101], [80, 104, 65, 98, 50, 101]]);
}
function seated(c, o) {
  const R = o.robe, S = o.skin;
  lap(c, R);
  oval(c, lin(c, 0, 84, 0, 92, S[0], S[1]), 68, 88, 9, 3.4, -.12);   // sole of the foot resting on the thigh
  shape(c, lin(c, 25, 0, 75, 0, S[1], S[0], S[1]), () => { c.moveTo(42, 40); c.bezierCurveTo(32, 41, 25, 44, 24, 52); c.lineTo(27, 80); c.lineTo(73, 80); c.lineTo(76, 52); c.bezierCurveTo(75, 44, 68, 41, 58, 40); });
  shape(c, lin(c, 14, 0, 34, 0, S[1], S[0]), () => { c.moveTo(25, 47); c.bezierCurveTo(16, 52, 15, 66, 17, 74); c.bezierCurveTo(19, 82, 30, 86, 45, 87); c.lineTo(46, 81); c.bezierCurveTo(36, 80, 29, 77, 27, 72); c.bezierCurveTo(26, 64, 29, 56, 31, 52); });   // bare right arm
  shape(c, lin(c, 30, 42, 80, 86, R[0], R[1]), () => { c.moveTo(52, 40); c.bezierCurveTo(63, 38, 76, 42, 79, 52); c.bezierCurveTo(83, 62, 85, 76, 76, 85); c.lineTo(56, 87); c.bezierCurveTo(44, 85, 34, 83, 31, 77); c.lineTo(32, 62); c.bezierCurveTo(38, 55, 46, 47, 52, 40); });   // robe over the left shoulder
  lines(c, o.trim, 1.6, [[52, 40.6, 42, 51, 32, 62]]);
  lines(c, R[1], .5, [[62, 46, 58, 58, 56, 70], [68, 48, 66, 62, 64, 78], [74, 54, 74, 68, 70, 82], [40, 68, 48, 74, 58, 80], [36, 74, 46, 79, 54, 84]]);
  shape(c, lin(c, 0, 80, 0, 89, S[0], S[1]), () => c.ellipse(50, 84.5, 12, 4.2, 0, 0, Math.PI * 2));   // hands resting in the lap
  lines(c, S[1], .4, [[41, 84, 45, 82.5, 49, 84], [51, 84, 55, 82.5, 59, 84], [44, 86.5, 50, 87.5, 56, 86.5]]);
  const attr = o.bowl ? 'bowl' : o.attr;
  if (attr === 'bowl') {
    shape(c, lin(c, 0, 74, 0, 85, '#6c9be0', '#1d3f86'), () => { c.moveTo(39, 78); c.bezierCurveTo(40, 87, 60, 87, 61, 78); });
    oval(c, '#a9c8f2', 50, 78, 11, 2.4, 0, .5);
  } else if (attr === 'beads') {
    for (let i = 0; i <= 14; i++) { const t = i / 14 * Math.PI; oval(c, '#6a2e10', 50 - Math.cos(t) * 13, 84 + Math.sin(t) * 6, 1.3, 1.3, 0, .2); }
  } else if (attr === 'scroll') {
    shape(c, lin(c, 0, 74, 0, 84, '#fbf3dc', '#d8c69c'), () => c.roundRect(41, 74, 18, 9, 1.5), .5);
    for (const x of [41, 59]) oval(c, '#8a5a24', x, 78.5, 1.4, 5, 0, .4);
    lines(c, '#8a6a3a', .35, [[45, 77, 50, 77, 55, 77], [45, 80, 50, 80, 55, 80]]);
  } else if (attr === 'pagoda') {
    const g = lin(c, 44, 0, 56, 0, '#b8801f', '#f6d478', '#b8801f');
    for (let k = 0; k < 3; k++) shape(c, g, () => { const y = 82 - k * 4.5, w = 6 - k * 1.4; c.moveTo(50 - w, y); c.lineTo(50 + w, y); c.lineTo(50 + w * .7, y - 3.6); c.lineTo(50 - w * .7, y - 3.6); }, .4);
    lines(c, '#b8801f', .8, [[50, 68.5, 50, 66.5, 50, 64.5]]);
  } else if (attr === 'fan') {
    lines(c, '#6b3410', .9, [[56, 86, 60, 76, 64, 68]]);
    shape(c, lin(c, 58, 56, 74, 72, '#f3e3b4', '#c9a463'), () => { c.moveTo(64, 68); c.bezierCurveTo(56, 60, 62, 50, 70, 52); c.bezierCurveTo(78, 56, 74, 66, 64, 68); }, .5);   // palm-leaf fan
  } else if (attr === 'staff') {
    lines(c, OUT, 2, [[84, 22, 84, 64, 84, 106]]); lines(c, '#e0b54a', 1.3, [[84, 22, 84, 64, 84, 106]]);
    c.lineWidth = 1.1; c.strokeStyle = '#e8c25a'; c.beginPath(); c.ellipse(84, 19, 4, 5, 0, 0, Math.PI * 2); c.stroke();
  }
  head(c, 50, 25, 9.5, o);
}

/* ---------- standing: A Di Đà welcoming, Quan Âm with vase and willow, Địa Tạng with staff and pearl ---------- */
function standing(c, o) {
  const R = o.robe, S = o.skin;
  const robe = () => { c.moveTo(42, 35); c.bezierCurveTo(33, 36, 28, 39, 27, 47); c.bezierCurveTo(26, 90, 23, 140, 19, 177); c.bezierCurveTo(30, 181, 40, 178, 50, 180); c.bezierCurveTo(60, 178, 70, 181, 81, 177); c.bezierCurveTo(77, 140, 74, 90, 73, 47); c.bezierCurveTo(72, 39, 67, 36, 58, 35); };
  for (const x of [44, 56]) oval(c, lin(c, 0, 179, 0, 184, S[0], S[1]), x, 181.5, 4.6, 2.6, 0, .5);   // toes under the hem
  shape(c, lin(c, 19, 0, 81, 0, R[1], R[0], R[0], R[1]), robe);
  if (o.kasaya) { c.save(); c.beginPath(); robe(); c.clip(); lines(c, o.trim, .8, [[35, 40, 34, 110, 32, 180], [44, 40, 44, 110, 43, 180], [56, 40, 56, 110, 57, 180], [65, 40, 66, 110, 68, 180], [20, 75, 50, 78, 80, 75], [20, 110, 50, 113, 80, 110], [20, 145, 50, 148, 80, 145]]); c.restore(); }   // patchwork robe
  lines(c, R[1], .5, [[37, 64, 36, 120, 32, 176], [45, 66, 44, 120, 43, 178], [55, 66, 56, 120, 57, 178], [63, 64, 64, 120, 68, 176]]);
  lines(c, R[1], .5, [[38, 46, 50, 54, 62, 46], [37, 52, 50, 63, 63, 52], [38, 59, 50, 71, 62, 59]]);   // folds hanging across the chest
  lines(c, o.trim, 1.3, [[19.5, 177, 35, 182, 50, 180], [50, 180, 65, 182, 80.5, 177], [42, 35.5, 46, 44, 50, 50], [58, 35.5, 54, 44, 50, 50]]);
  const sleeve = s => shape(c, lin(c, 50 + s * 16, 0, 50 + s * 32, 0, R[0], R[1]), () => { c.moveTo(50 + s * 20, 40); c.bezierCurveTo(50 + s * 30, 46, 50 + s * 32, 84, 50 + s * 31, 108); c.bezierCurveTo(50 + s * 26, 113, 50 + s * 20, 111, 50 + s * 16, 104); c.bezierCurveTo(50 + s * 15, 88, 50 + s * 17, 70, 50 + s * 20, 60); });
  const forearm = (s, hx, hy) => { tube(c, R[0], 8, [50 + s * 25, 76, (50 + s * 25 + hx) / 2, (76 + hy) / 2 + 4, hx, hy + 6]); oval(c, R[1], hx, hy + 5, 4.6, 2, 0, .4); };
  sleeve(-1); sleeve(1);
  if (o.arms === 'welcome') {
    hand(c, 24, 114, Math.PI, S, 'open', -1);
    forearm(1, 60, 60); hand(c, 60, 60, 0, S, 'open', -1);
  } else if (o.arms === 'vase') {
    lines(c, '#5e7a2c', .7, [[40, 60, 37, 44, 33, 26]]);
    for (let i = 0; i < 7; i++) oval(c, i % 2 ? '#8fbf55' : '#6fa83c', 33.5 + (i % 2 ? 2.6 : -2.6), 30 + i * 4, 1.4, 3.6, i % 2 ? .5 : -.5, .3);   // willow sprig
    forearm(-1, 40, 62); hand(c, 40, 62, 0, S, 'fist');
    forearm(1, 60, 74); hand(c, 60, 74, 0, S, 'open', -1);
    shape(c, lin(c, 54, 0, 66, 0, '#ffffff', '#cfd8e6'), () => { c.moveTo(58, 52); c.lineTo(58, 56); c.bezierCurveTo(52, 58, 53, 70, 57, 71); c.lineTo(63, 71); c.bezierCurveTo(67, 70, 68, 58, 62, 56); c.lineTo(62, 52); });   // vase of pure water
    lines(c, '#3f6fb8', .7, [[55.5, 63, 60, 64.5, 64.5, 63]]);
  } else if (o.arms === 'staff') {
    lines(c, OUT, 2.4, [[30, 14, 30, 100, 30, 187]]); lines(c, '#e0b54a', 1.6, [[30, 14, 30, 100, 30, 187]]);
    for (const [rx, ry] of [[5.5, 6.5], [3.6, 4.4]]) { lines(c, OUT, 1.6, [[30 - rx, 12, 30 - rx, 12 - ry * 1.5, 30, 12 - ry * 1.6]]); }
    c.lineWidth = 1.4; c.strokeStyle = '#e8c25a'; c.beginPath(); c.ellipse(30, 9, 5.5, 6.5, 0, 0, Math.PI * 2); c.stroke();
    for (const k of [-1, 1]) { c.beginPath(); c.ellipse(30 + k * 5.5, 13, 1.6, 1.6, 0, 0, Math.PI * 2); c.stroke(); }   // rings on the staff head
    forearm(-1, 30, 88); hand(c, 30, 88, 0, S, 'fist');
    forearm(1, 60, 72); hand(c, 60, 72, 0, S, 'open', -1);
    oval(c, rad(c, 59, 64, 5, '#ffffff', '#d9e6f2'), 60, 65.5, 3.6, 3.6, 0, .5);   // wish-granting pearl
  }
  head(c, 50, 20, 8.5, o);
}

/* ---------- Di Lặc: laughing, round belly, beads and cloth bag ---------- */
function laughing(c, o) {
  const R = o.robe, S = o.skin;
  lap(c, R);
  shape(c, lin(c, 25, 0, 75, 0, S[1], S[0], S[1]), () => { c.moveTo(40, 42); c.bezierCurveTo(28, 43, 22, 48, 22, 58); c.lineTo(26, 86); c.lineTo(74, 86); c.lineTo(78, 58); c.bezierCurveTo(78, 48, 72, 43, 60, 42); });
  oval(c, rad(c, 45, 64, 24, S[0], S[1]), 50, 72, 21, 17, 0, .6);   // round belly
  oval(c, S[1], 50, 76, 1.2, 1.6, 0, 0);
  for (const s of [-1, 1]) shape(c, lin(c, 50 + s * 18, 0, 50 + s * 34, 0, R[0], R[1]), () => { c.moveTo(50 + s * 10, 42); c.bezierCurveTo(50 + s * 26, 42, 50 + s * 33, 52, 50 + s * 34, 70); c.bezierCurveTo(50 + s * 36, 84, 50 + s * 32, 92, 50 + s * 26, 94); c.bezierCurveTo(50 + s * 22, 84, 50 + s * 21, 66, 50 + s * 16, 50); });   // open robe and sleeves
  for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI; oval(c, '#7a3b16', 50 - Math.cos(t) * 12, 44 + Math.sin(t) * 9, 1.3, 1.3, 0, .25); }   // bead necklace
  shape(c, lin(c, 76, 0, 96, 0, '#f0e2c4', '#bfa577'), () => { c.moveTo(80, 72); c.bezierCurveTo(74, 80, 76, 98, 88, 99); c.bezierCurveTo(99, 98, 99, 80, 90, 72); c.lineTo(86, 66); c.lineTo(83, 66); });   // cloth bag
  lines(c, '#8c6a3a', .6, [[81, 70, 85, 72, 89, 70]]);
  hand(c, 83, 68, .3, S, 'fist');
  hand(c, 20, 92, 2.6, S, 'open');
  for (let i = 0; i < 6; i++) oval(c, '#7a3b16', 16 + i * 1.2, 98 + i * 1.4, 1.1, 1.1, 0, .2);   // prayer beads in the hand
  head(c, 50, 26, 11, o);
}

/* ---------- Hộ Pháp: armoured temple guardian, sword or mace ---------- */
function guardian(c, o) {
  const R = o.robe, S = o.skin, gold = lin(c, 26, 0, 74, 0, '#b07a1c', '#f6d478', '#b07a1c');
  shape(c, lin(c, 12, 0, 88, 0, R[1], R[0], R[1]), () => { c.moveTo(34, 40); c.bezierCurveTo(18, 60, 14, 130, 10, 178); c.lineTo(90, 178); c.bezierCurveTo(86, 130, 82, 60, 66, 40); });   // cloak
  for (const x of [41, 59]) shape(c, lin(c, x - 6, 0, x + 6, 0, '#3a2a1e', '#140c08'), () => { c.moveTo(x - 5, 150); c.lineTo(x - 6, 180); c.quadraticCurveTo(x, 187, x + 7, 182); c.lineTo(x + 5, 150); });   // boots
  const skirt = () => { c.moveTo(30, 98); c.lineTo(70, 98); c.lineTo(76, 156); c.quadraticCurveTo(50, 162, 24, 156); };
  shape(c, gold, skirt);
  c.save(); c.beginPath(); skirt(); c.closePath(); c.clip(); c.strokeStyle = 'rgba(90,50,10,.7)'; c.lineWidth = .45;
  for (let y = 102, row = 0; y < 160; y += 5, row++) for (let x = 24 + (row % 2) * 2.5; x < 78; x += 5) { c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI); c.stroke(); }   // scale armour
  c.restore();
  shape(c, lin(c, 0, 100, 0, 166, R[0], R[1]), () => { c.moveTo(43, 100); c.lineTo(57, 100); c.lineTo(61, 166); c.lineTo(39, 166); });   // front apron
  shape(c, gold, () => { c.moveTo(34, 40); c.bezierCurveTo(28, 46, 28, 70, 31, 100); c.lineTo(69, 100); c.bezierCurveTo(72, 70, 72, 46, 66, 40); });   // breastplate
  oval(c, rad(c, 48, 60, 9, '#fff6d8', '#9fb4c8'), 50, 62, 7.5, 7.5, 0, .6);   // chest mirror
  lines(c, 'rgba(90,50,10,.6)', .5, [[34, 76, 50, 80, 66, 76], [33, 86, 50, 90, 67, 86]]);
  shape(c, lin(c, 0, 93, 0, 101, '#c8322a', '#7a1810'), () => c.roundRect(29, 93, 42, 7, 2));
  oval(c, gold, 50, 96.5, 4, 4, 0, .5);
  if (o.weapon === 'sword') {   // both hands resting on the pommel of a sword planted in front
    lines(c, OUT, 4.4, [[50, 104, 50, 140, 50, 176]]); lines(c, lin(c, 47, 0, 53, 0, '#9aa4ae', '#f2f6fa', '#9aa4ae'), 3.4, [[50, 104, 50, 140, 50, 176]]);
    shape(c, gold, () => c.roundRect(42, 99, 16, 3.4, 1.5), .5);
    for (const s of [-1, 1]) tube(c, R[0], 7, [50 + s * 17, 48, 50 + s * 16, 72, 50 + s * 4, 90]);
    hand(c, 47, 92, Math.PI / 2, S, 'fist'); hand(c, 53, 92, -Math.PI / 2, S, 'fist', -1);
  } else {   // mace raised over the shoulder, other fist on the hip
    lines(c, OUT, 3.4, [[27, 56, 24, 30, 21, 4]]); lines(c, gold, 2.4, [[27, 56, 24, 30, 21, 4]]);
    oval(c, gold, 21, 6, 4.5, 6, -.1, .6);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; lines(c, OUT, .7, [[21 + Math.cos(a) * 4.5, 6 + Math.sin(a) * 6, 21 + Math.cos(a) * 5.5, 6 + Math.sin(a) * 7.2, 21 + Math.cos(a) * 6.6, 6 + Math.sin(a) * 8.4]]); }
    tube(c, R[0], 7, [33, 48, 22, 46, 24, 34]); hand(c, 24, 32, 0, S, 'fist');
    tube(c, R[0], 7, [67, 48, 76, 70, 66, 92]); hand(c, 64, 92, -2.2, S, 'fist', -1);
  }
  for (const s of [-1, 1]) oval(c, gold, 50 + s * 17, 44, 7.5, 5.5, s * .3, .6);   // shoulder guards
  head(c, 50, 24, 9, { ...o, helmet: true, bald: true, fierce: o.weapon === 'mace' });   // bald: no urna on a guardian
}

/* ---------- Đản Sanh: the newborn Buddha, right hand to the sky, left hand to the earth ---------- */
function baby(c, o) {
  const R = o.robe, S = o.skin;
  for (const x of [44, 56]) oval(c, lin(c, 0, 136, 0, 142, S[0], S[1]), x, 139, 4.4, 2.6, 0, .5);
  tube(c, S[0], 6, [37, 54, 34, 34, 32, 14]); hand(c, 32, 13, 0, S, 'point');            // arm raised to the sky
  tube(c, S[0], 6, [63, 54, 68, 76, 70, 96]); hand(c, 70, 99, Math.PI, S, 'point', -1);  // arm lowered to the earth
  shape(c, lin(c, 32, 0, 68, 0, R[1], R[0], R[1]), () => { c.moveTo(43, 47); c.bezierCurveTo(36, 48, 33, 52, 33, 60); c.bezierCurveTo(33, 90, 30, 115, 29, 136); c.bezierCurveTo(40, 139, 60, 139, 71, 136); c.bezierCurveTo(70, 115, 67, 90, 67, 60); c.bezierCurveTo(67, 52, 64, 48, 57, 47); });   // robe to the ankles
  lines(c, R[1], .5, [[40, 90, 39, 112, 37, 135], [47, 92, 47, 114, 46, 137], [54, 92, 54, 114, 55, 137], [61, 90, 62, 112, 63, 135]]);
  lines(c, o.trim, 1.8, [[33.5, 84, 50, 87, 66.5, 84]]);   // gold sash
  lines(c, o.trim, 1.1, [[43, 47.5, 46, 53, 50, 57], [57, 47.5, 54, 53, 50, 57], [29.5, 135.5, 50, 140, 70.5, 135.5]]);
  head(c, 50, 30, 11, o);
}
