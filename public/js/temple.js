// Full URLs, no import map: Cloudflare injects a module script above any map, and Firefox then ignores the map.
// The +esm build of the utils imports this same three URL, so both share one copy.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/+esm';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';
// ?v must match asset_version in config.php: browsers keep js files for 7 days.
import { Net, POSES as NET_POSES, headingFromByte } from './net.js?v=0.9.0';
import { t as tr, setLang, getLang, applyStatic } from './i18n.js?v=0.9.0';
import { paintDeity, paintFigure, arhatLook, paintMural } from './painted.js?v=0.9.0';
import { XAM } from './xam.js?v=0.9.0';
const CFG=window.CHUA||{realtime:false,payments:false,testMode:false,sizes:{}};

/* ================= utilities ================= */
let seed = 20261104;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const R=(a,b)=>a+rnd()*(b-a);
const pick=a=>a[Math.floor(rnd()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const $=s=>document.querySelector(s);
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const UP=V3(0,1,0);
let reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches||(()=>{ try { return localStorage.getItem('antam-rm')==='1'; } catch(e){ return false; } })();
function hash2(x,z){ const s=Math.sin(x*127.1+z*311.7)*43758.5453; return s-Math.floor(s); }
function vnoise(x,z){ const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi, u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf);
  return lerp(lerp(hash2(xi,zi),hash2(xi+1,zi),u),lerp(hash2(xi,zi+1),hash2(xi+1,zi+1),u),v); }
function fbm(x,z){ let s=0,a=.5,f=1; for (let i=0;i<5;i++){ s+=a*vnoise(x*f,z*f); a*=.5; f*=2.03; } return s; }

/* ================= renderer + pixel pass ================= */
const canvas=$('#scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.5,1500);
let PIX=3;
const rt=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
const postMat=new THREE.ShaderMaterial({
  uniforms:{tDiffuse:{value:rt.texture},uRes:{value:new THREE.Vector2(1,1)},uLevels:{value:14},uExposure:{value:1},uNight:{value:0}},
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader:`
    precision highp float;
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uLevels,uExposure,uNight; varying vec2 vUv;
    float luma(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
    float b2(vec2 a){ a=floor(a); return fract(dot(a,vec2(.5,a.y*.75))); }
    float b4(vec2 a){ return b2(.5*a)*.25+b2(a); }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    void main(){
      vec2 px=1./uRes, cell=(floor(vUv*uRes)+.5)*px;
      vec3 c=texture2D(tDiffuse,cell).rgb; float l=luma(c);
      float e=abs(l-luma(texture2D(tDiffuse,cell+vec2(px.x,0.)).rgb))+abs(l-luma(texture2D(tDiffuse,cell-vec2(px.x,0.)).rgb))
             +abs(l-luma(texture2D(tDiffuse,cell+vec2(0.,px.y)).rgb))+abs(l-luma(texture2D(tDiffuse,cell-vec2(0.,px.y)).rgb));
      e/=(l+.2);
      c=aces(c*uExposure); c=pow(c,vec3(1./2.2));
      float g=luma(c); c=mix(vec3(g),c,1.16);
      c*=1.-smoothstep(.9,2.2,e)*.36;
      float d=b4(floor(vUv*uRes))-.5;
      c=floor(c*uLevels+.5+d*.5)/uLevels;
      vec2 fc=gl_FragCoord.xy; float n=hash(floor(fc*.5)); float fib=hash(vec2(floor(fc.x*.2+fc.y*.07),floor(fc.y*.8)));
      c*=.965+.035*n+.02*fib;
      vec2 q=vUv-.5; c*=1.-dot(q,q)*(.5+.35*uNight);
      gl_FragColor=vec4(clamp(c,0.,1.),1.);
    }`,
  depthTest:false,depthWrite:false});
const postScene=new THREE.Scene(), postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMat));

/* ================= canvas textures ================= */
function canvasTex(w,h,draw,repeat=true){
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  if (repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; } t.anisotropy=4; return t;
}
const brickTex=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#6f2f20'; g.fillRect(0,0,w,h); const bw=32,bh=16;
  for (let r=0;r<h/bh;r++) for (let c=-1;c<w/bw+1;c++){ const x=c*bw+(r%2)*bw/2,y=r*bh,v=rnd(); g.fillStyle=`hsl(${11+v*9},${50+v*12}%,${37+v*11}%)`; g.fillRect(x+1,y+1,bw-2,bh-2); g.fillStyle='rgba(255,210,170,.08)'; g.fillRect(x+1,y+1,bw-2,2); } });
brickTex.repeat.set(22,17);
const slabTex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#9d927c'; g.fillRect(0,0,w,h); for (let r=0;r<4;r++) for (let c=0;c<2;c++){ const v=rnd(); g.fillStyle=`hsl(40,${14+v*8}%,${70+v*8}%)`; g.fillRect(c*64+2,r*32+2,60,28); } });
slabTex.repeat.set(1.5,18);
const grassTex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#d9e6cc'; g.fillRect(0,0,w,h); for (let i=0;i<1100;i++){ const v=rnd(); g.fillStyle=`hsl(${80+v*30},${20+v*25}%,${62+v*30}%)`; g.fillRect(rnd()*w,rnd()*h,2,3); } });
grassTex.repeat.set(160,160);
const tileTex=canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#a8461a'; g.fillRect(0,0,w,h); for (let x=0;x<w;x+=8){ g.fillStyle='#dc742e'; g.fillRect(x+1,0,6,h); g.fillStyle='#f19a55'; g.fillRect(x+2,0,2,h); } for (let y=0;y<h;y+=16){ g.fillStyle='rgba(80,25,8,.38)'; g.fillRect(0,y,w,2); } });
const floorTex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#4e1c12'; g.fillRect(0,0,w,h); for (let r=0;r<4;r++) for (let c=0;c<4;c++){ const v=rnd(); g.fillStyle=`hsl(${12+v*6},${48+v*10}%,${30+v*8}%)`; g.fillRect(c*32+1,r*32+1,30,30); } });
floorTex.repeat.set(5,4);
function plaqueTex(text){
  return canvasTex(640,140,(g,w,h)=>{ g.fillStyle='#5c1610'; g.fillRect(0,0,w,h); g.strokeStyle='#d9aa4a'; g.lineWidth=8; g.strokeRect(6,6,w-12,h-12); g.lineWidth=2; g.strokeRect(18,18,w-36,h-36);
    let fs=64; g.font=`700 ${fs}px "Noto Serif Display",Georgia,serif`; while (g.measureText(text).width>w-90 && fs>20){ fs-=2; g.font=`700 ${fs}px "Noto Serif Display",Georgia,serif`; }
    g.fillStyle='#f0c867'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,w/2,h/2+3); },false);
}
const haloTex=canvasTex(256,256,(g)=>{ g.translate(128,128);
  const gr=g.createRadialGradient(0,0,10,0,0,128); gr.addColorStop(0,'rgba(255,236,170,.55)'); gr.addColorStop(.55,'rgba(255,214,120,.25)'); gr.addColorStop(.72,'rgba(230,170,60,.9)'); gr.addColorStop(.78,'rgba(200,140,40,.95)'); gr.addColorStop(.8,'rgba(255,220,130,0)'); gr.addColorStop(1,'rgba(255,200,90,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(0,0,128,0,7); g.fill();
  g.fillStyle='rgba(235,170,60,.9)'; for (let i=0;i<28;i++){ g.save(); g.rotate(i/28*Math.PI*2); g.beginPath(); g.moveTo(-6,-100); g.quadraticCurveTo(-2,-122,4,-127); g.quadraticCurveTo(2,-112,6,-100); g.fill(); g.restore(); } },false);
function leafPath(g,len,wid){ g.beginPath(); g.moveTo(0,0); g.quadraticCurveTo(wid,-len*.45,0,-len); g.quadraticCurveTo(-wid,-len*.45,0,0); g.fill(); }
function blossom(g,x,y,r,petal,center){ g.fillStyle=petal; for (let i=0;i<5;i++){ const a=i*1.2566; g.beginPath(); g.ellipse(x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55,r*.55,r*.38,a,0,7); g.fill(); } g.fillStyle=center; g.beginPath(); g.arc(x,y,r*.28,0,7); g.fill(); }
const CARDTEX={
  frangi:canvasTex(128,128,(g)=>{ g.translate(64,64); for (let i=0;i<8;i++){ g.save(); g.rotate(i*.785+R(-.2,.2)); const l=R(46,60); g.fillStyle=`hsl(${100+R(-8,10)},${42+R(0,16)}%,${27+R(0,12)}%)`; leafPath(g,l,R(11,15)); g.strokeStyle='rgba(205,235,160,.55)'; g.lineWidth=1.5; g.beginPath(); g.moveTo(0,0); g.lineTo(0,-l*.9); g.stroke(); g.restore(); } },false),
  flower:canvasTex(64,64,(g)=>{ g.translate(32,32); for (let i=0;i<5;i++){ g.save(); g.rotate(i*1.2566); g.fillStyle='#fffaf0'; g.beginPath(); g.ellipse(9,-4,14,8,.5,0,7); g.fill(); g.fillStyle='rgba(250,205,80,.85)'; g.beginPath(); g.ellipse(4,-2,6,3.5,.5,0,7); g.fill(); g.restore(); } },false),
  small:canvasTex(128,128,(g)=>{ for (let i=0;i<80;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*54; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle=`hsl(${95+R(-10,20)},${40+R(0,20)}%,${24+R(0,16)}%)`; leafPath(g,R(10,16),R(4,6)); g.restore(); } },false),
  pine:canvasTex(128,128,(g)=>{ for (let i=0;i<46;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*50, x=64+Math.cos(a)*r, y=64+Math.sin(a)*r*.7; g.strokeStyle=`hsl(${120+R(-10,10)},${35+R(0,15)}%,${18+R(0,14)}%)`; g.lineWidth=2.2; for (let k=0;k<9;k++){ const b=rnd()*6.28; g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(b)*8,y+Math.sin(b)*6); g.stroke(); } } },false),
  bodhi:canvasTex(128,128,(g)=>{ for (let i=0;i<26;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*46; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle=`hsl(${98+R(-8,14)},${45+R(0,15)}%,${24+R(0,14)}%)`;
    g.beginPath(); g.moveTo(0,0); g.bezierCurveTo(-11,-4,-11,-16,0,-14); g.bezierCurveTo(11,-16,11,-4,0,0); g.fill(); g.beginPath(); g.moveTo(-2,-13); g.lineTo(0,-24); g.lineTo(2,-13); g.fill(); g.restore(); } },false),
  pink:canvasTex(128,128,(g)=>{ for (let i=0;i<10;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*48; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle='hsl(100,40%,30%)'; leafPath(g,13,5); g.restore(); }
    for (let i=0;i<34;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*50; blossom(g,64+Math.cos(a)*r,64+Math.sin(a)*r,R(7,10),`hsl(${335+R(-8,8)},${70+R(0,15)}%,${78+R(-6,6)}%)`,'#b8325a'); } },false),
  yellow:canvasTex(128,128,(g)=>{ for (let i=0;i<8;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*48; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle='hsl(95,40%,32%)'; leafPath(g,13,5); g.restore(); }
    for (let i=0;i<34;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*50; blossom(g,64+Math.cos(a)*r,64+Math.sin(a)*r,R(7,10),`hsl(${46+R(-5,5)},95%,${58+R(-6,6)}%)`,'#c46a10'); } },false),
  bougain:canvasTex(128,128,(g)=>{ for (let i=0;i<16;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*48; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle='hsl(105,38%,28%)'; leafPath(g,14,6); g.restore(); }
    for (let i=0;i<40;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*50; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r); g.rotate(rnd()*6.28); g.fillStyle=`hsl(${322+R(-6,8)},${72+R(0,14)}%,${46+R(-6,10)}%)`; for (let k=0;k<3;k++){ g.rotate(2.09); leafPath(g,9,6); } g.restore(); } },false),
  frond:canvasTex(64,256,(g)=>{ g.strokeStyle='#5b6e2e'; g.lineWidth=3; g.beginPath(); g.moveTo(32,256); g.lineTo(32,4); g.stroke();
    for (let y=250;y>8;y-=5){ const t=1-y/256, L=30*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.05)),.55); for (const s of [-1,1]){ g.strokeStyle=`hsl(${92+R(-8,8)},${42+R(0,14)}%,${26+R(0,14)}%)`; g.lineWidth=2.6; g.beginPath(); g.moveTo(32,y); g.lineTo(32+s*L,y-12-L*.25); g.stroke(); } } },false),
  fallen:canvasTex(128,128,(g)=>{ for (let i=0;i<55;i++){ const a=rnd()*6.28, r=Math.sqrt(rnd())*52; g.save(); g.translate(64+Math.cos(a)*r,64+Math.sin(a)*r*.8); g.rotate(rnd()*6.28); g.fillStyle=`hsl(${28+R(-12,18)},${55+R(0,25)}%,${36+R(0,18)}%)`; leafPath(g,R(10,16),R(4,7)); g.restore(); } },false),
};
const mistTex=canvasTex(128,64,(g)=>{ const gr=g.createRadialGradient(64,32,4,64,32,62); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.scale(1,.5); g.beginPath(); g.arc(64,64,62,0,7); g.fill(); },false);

/* ================= materials ================= */
const lam=(color,o={})=>new THREE.MeshLambertMaterial({color,...o});
const phong=(color,o={})=>new THREE.MeshPhongMaterial({color,...o});
const MAT={
  roof:lam('#ffffff',{map:tileTex,side:THREE.DoubleSide}), wall:lam('#eadcb6'), stone:lam('#ab9c82'), stoneDark:lam('#7f7262'), step:lam('#c6b89b'),
  col:lam('#9a2b1b'), gold:lam('#d6a33a',{emissive:'#3a2405'}), goldDark:lam('#9c6e22'), ridge:lam('#d8c9a2'), trim:lam('#f0e4c4'),
  brick:lam('#ffffff',{map:brickTex}), slab:lam('#ffffff',{map:slabTex}), floor:lam('#ffffff',{map:floorTex}), wood:lam('#4a1d10'),
  rim:lam('#d4c9ad'), water:lam('#3c9f92',{emissive:'#0c3a37'}), pad:lam('#4f8f3a'), lotus:lam('#f08fb0',{emissive:'#3a1020'}),
  bronze:lam('#6d6338'), urn:lam('#3e5a49'), trunk:lam('#7a5a3d'), palmTrunk:lam('#8f7a5c'), areca:lam('#9a9686'), shaft:lam('#5f8f3a'),
  pot:lam('#2f5f9e'), potOchre:lam('#b8743a'), soil:lam('#4a3326'), bench:lam('#e8e2d4'), lionStone:lam('#b7b2a6'),
  door:lam('#3d140b'), doorLeaf:lam('#7d1d12'), lantern:lam('#ffffff',{emissive:'#ff6a1e',emissiveIntensity:.5}),
  tip:new THREE.MeshBasicMaterial({color:'#ff3b1a'}), flame:new THREE.MeshBasicMaterial({color:'#ffc35a'}), candle:lam('#f2ead8'),
  blue:lam('#3f6d9b'), cushion:lam('#e08a2a'), dark:lam('#2b1a12'), cap:lam('#8d8576'),
  halo:new THREE.MeshBasicMaterial({map:haloTex,transparent:true,depthWrite:false,side:THREE.DoubleSide,color:'#ffe2a0'}),
};
const shaftTex=canvasTex(64,128,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(255,236,190,.95)'); gr.addColorStop(1,'rgba(255,236,190,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h);
  const gx=g.createLinearGradient(0,0,w,0); gx.addColorStop(0,'#000'); gx.addColorStop(.3,'rgba(0,0,0,0)'); gx.addColorStop(.7,'rgba(0,0,0,0)'); gx.addColorStop(1,'#000'); g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,w,h); },false);
MAT.shaft=new THREE.MeshBasicMaterial({map:shaftTex,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
const SM={
  gold:phong('#d8a23c',{specular:'#ffe2a0',shininess:55,emissive:'#3a2405'}), goldDark:phong('#a3742a',{specular:'#d9b66a',shininess:30}),
  lotus:phong('#e7b85e',{specular:'#fff0b0',shininess:40,emissive:'#2a1804'}), lotusPink:phong('#f1b7c6',{specular:'#ffffff',shininess:40}),
  porcelain:phong('#f4f0e6',{specular:'#ffffff',shininess:80}), robeRed:phong('#8d2a1a',{specular:'#d08060',shininess:25}),
  hair:phong('#25336a',{specular:'#8090ff',shininess:40}), dark:lam('#2a1810'), lip:lam('#9a4a2a'),
  lapis:phong('#2a4fa0',{specular:'#a0c0ff',shininess:70}), pearl:lam('#fff6d0',{emissive:'#ffd66a',emissiveIntensity:.8}), cloth:lam('#c9a36a'), green:lam('#4f8f3a'),
};

/* ================= scene scaffolding ================= */
const WORLD=new THREE.Group(); scene.add(WORLD);
function add(m,parent=WORLD,cast=true,recv=true){ m.castShadow=cast; m.receiveShadow=recv; parent.add(m); return m; }
function box(w,h,d,mat,x,y,z,parent=WORLD){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); return add(m,parent); }
function cyl(rt,rb,h,mat,x,y,z,parent=WORLD,seg=10){ const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat); m.position.set(x,y,z); return add(m,parent); }
function sph(r,mat,x,y,z,parent=WORLD,sx=1,sy=1,sz=1){ const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); return add(m,parent); }
function limb(g,a,b,r,mat){ const d=new THREE.Vector3().subVectors(b,a), L=d.length(); const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.05,L,8),mat);
  m.position.copy(a).addScaledVector(d,.5); m.quaternion.setFromUnitVectors(UP,d.normalize()); add(m,g); const j=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),mat); j.position.copy(b); add(j,g); return m; }

const OB=[], BUILDINGS=[];
const obBox=(x0,x1,z0,z1)=>OB.push({t:0,x0,x1,z0,z1});
const obCirc=(cx,cz,r)=>OB.push({t:1,cx,cz,r});
function blocked(x,z,r){
  if (Math.abs(x)>68 || z>68 || z<-43) return true;
  for (const o of OB){ if (o.t===0){ if (x>o.x0-r&&x<o.x1+r&&z>o.z0-r&&z<o.z1+r) return true; } else if ((x-o.cx)**2+(z-o.cz)**2<(o.r+r)**2) return true; }
  return false;
}
function l2w(b,lx,lz){ const c=Math.cos(b.rot), s=Math.sin(b.rot); return [b.x+lx*c+lz*s, b.z-lx*s+lz*c]; }
function w2l(b,wx,wz){ const dx=wx-b.x, dz=wz-b.z, c=Math.cos(b.rot), s=Math.sin(b.rot); return [dx*c-dz*s, dx*s+dz*c]; }
function obLocal(b,x0,x1,z0,z1){ const pts=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([x,z])=>l2w(b,x,z)); obBox(Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1]))); }
function groundY(x,z){
  for (const b of BUILDINGS){ const [lx,lz]=w2l(b,x,z);
    if (Math.abs(lx)<b.pw/2 && Math.abs(lz)<b.pd/2) return b.platH;
    if (Math.abs(lx)<b.sw/2 && lz>=b.pd/2 && lz<b.pd/2+b.run) return b.platH*(1-(lz-b.pd/2)/b.run); }
  return 0;
}
function insideOf(x,z){ for (const b of BUILDINGS){ const [lx,lz]=w2l(b,x,z); if (Math.abs(lx)<b.iw/2-.05 && lz>b.bz && lz<b.fz-.05) return b; } return null; }

/* ================= curved Vietnamese roof ================= */
function roofY(x,z,w,d,h,curl){ const u=x/(w/2), v=z/(d/2), a=1-Math.abs(v), b=(w/2-Math.abs(x))/(d/2), t=clamp(Math.min(a,b),0,1);
  const cu=Math.max(0,(Math.abs(u)-.6)/.4), cv=Math.max(0,(Math.abs(v)-.5)/.5);
  return h*Math.pow(t,1.45)+curl*Math.pow(cu,2.2)*Math.pow(cv,1.3)+.14*curl*cu*cu*(1-t); }
function roofGeo(w,d,h,curl=1,seg=28){
  const g=new THREE.PlaneGeometry(1,1,seg,seg), p=g.attributes.position, uv=g.attributes.uv;
  for (let i=0;i<p.count;i++){ const x=p.getX(i)*w, z=-p.getY(i)*d; const y=roofY(x,z,w,d,h,curl);
    const t=clamp(Math.min(1-Math.abs(z/(d/2)),(w/2-Math.abs(x))/(d/2)),0,1); p.setXYZ(i,x,y,z); uv.setXY(i,x*.4,t*h*.9); }
  g.computeVertexNormals(); return g;
}
const dragonCurve=L=>new THREE.CatmullRomCurve3([V3(0,0,0),V3(L*.25,.45,0),V3(L*.5,.1,0),V3(L*.75,.55,0),V3(L,.95,0)]);
function tubeAlong(parent,pts,r,mat){ add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.max(8,pts.length*2),r,6),mat),parent); }
function roofDetail(parent,W,D,H,y0,curl,dragons=true){
  const N=20;
  for (const sz of [-1,1]){ const pts=[]; for (let i=0;i<=N;i++){ const x=-W/2+W*i/N; pts.push(V3(x,y0+roofY(x,sz*D/2,W,D,H,curl)-.03,sz*D/2)); } tubeAlong(parent,pts,.09,MAT.trim); }
  for (const sx of [-1,1]){ const pts=[]; for (let i=0;i<=N;i++){ const z=-D/2+D*i/N; pts.push(V3(sx*W/2,y0+roofY(sx*W/2,z,W,D,H,curl)-.03,z)); } tubeAlong(parent,pts,.09,MAT.trim); }
  const len=Math.max(.6,W-D);
  for (const sx of [-1,1]) for (const sz of [-1,1]){ const pts=[]; for (let i=0;i<=10;i++){ const t=i/10, x=lerp(sx*W/2,sx*len/2,t), z=lerp(sz*D/2,0,t); pts.push(V3(x,y0+roofY(x,z,W,D,H,curl)+.1,z)); } tubeAlong(parent,pts,.11,MAT.ridge);
    const c=add(new THREE.Mesh(new THREE.ConeGeometry(.14,1.1,6),MAT.gold),parent); c.position.set(sx*W/2,y0+roofY(sx*W/2,sz*D/2,W,D,H,curl)+.3,sz*D/2); c.rotation.set(sz*-.55,0,sx*-.55); }
  box(len+.6,.34,.36,MAT.ridge,0,y0+H+.12,0,parent);
  if (dragons) for (const s of [-1,1]){ const L=Math.min(3,len*.35); const m=add(new THREE.Mesh(new THREE.TubeGeometry(dragonCurve(L),18,.13,6),MAT.gold),parent); m.position.set(s*(len/2+.3),y0+H+.2,0); m.rotation.y=s>0?Math.PI:0;
    sph(.24,MAT.gold,s*(len/2+.3)-s*L,y0+H+1.15,0,parent); }
  sph(.32,MAT.gold,0,y0+H+.62,0,parent);
  const f=add(new THREE.Mesh(new THREE.ConeGeometry(.22,.75,6),MAT.gold),parent); f.position.set(0,y0+H+1.15,0);
  for (const s of [-1,1]){ const r=add(new THREE.Mesh(new THREE.TorusGeometry(.42,.06,5,14,Math.PI),MAT.gold),parent); r.position.set(0,y0+H+.62,0); r.rotation.y=s>0?0:Math.PI; }
}

/* ================= Buddha statues (each hall gets its own) ================= */
const petalGeo=new THREE.SphereGeometry(1,8,6);
function lotusSeat(g,r,mat=SM.lotus){
  cyl(r*.8,r*.95,r*.25,SM.goldDark,0,r*.125,0,g,16);
  for (let k=0;k<2;k++){ const n=16-k*4, R0=r*(.92-.22*k), y=r*(.3+.14*k);
    for (let i=0;i<n;i++){ const a=i/n*Math.PI*2+k*.2, p=new THREE.Mesh(petalGeo,mat); p.scale.set(r*.2,r*.34,r*.09); p.position.set(Math.sin(a)*R0,y,Math.cos(a)*R0); p.rotation.set(.45,a,0,'YXZ'); add(p,g); } }
  cyl(r*.72,r*.62,r*.12,SM.goldDark,0,r*.5,0,g,16); return r*.56;
}
function haloPlane(g,r,y,z,sy=1){ const m=new THREE.Mesh(new THREE.PlaneGeometry(2*r,2*r*sy),MAT.halo); m.position.set(0,y,z); g.add(m); }
/* Glowing aureole behind each statue: soft rays that turn slowly and a bright arc that runs around the halo. */
const rayTex=canvasTex(256,256,g=>{ g.translate(128,128); const core=g.createRadialGradient(0,0,0,0,0,110); core.addColorStop(0,'rgba(255,240,200,.55)'); core.addColorStop(1,'rgba(255,220,150,0)'); g.fillStyle=core; g.fillRect(-128,-128,256,256);
  for (let i=0;i<72;i++){ const L=[126,96,112][i%3], w=[3.5,2,2.5][i%3], gr=g.createLinearGradient(0,0,0,-L);
  gr.addColorStop(0,'rgba(255,240,200,.5)'); gr.addColorStop(1,'rgba(255,220,150,0)'); g.fillStyle=gr; g.beginPath(); g.moveTo(-1,0); g.lineTo(-w,-L); g.lineTo(w,-L); g.closePath(); g.fill(); g.rotate(Math.PI*2/72); } });
const ringTex=canvasTex(256,256,g=>{ g.translate(128,128); g.lineWidth=4; g.strokeStyle='rgba(255,230,170,.25)'; g.beginPath(); g.arc(0,0,112,0,Math.PI*2); g.stroke();
  for (let i=0;i<48;i++){ const a=i/48*Math.PI*.9; g.strokeStyle=`rgba(255,246,215,${(i/48)**2})`; g.lineWidth=3+5*(i/48); g.beginPath(); g.arc(0,0,112,a,a+.07); g.stroke(); } });
for (const t of [rayTex,ringTex]) t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;   // no bleed from the opposite edge while the disc turns
const glowMat=map=>new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,color:'#ffd98a'});
MAT.rays=glowMat(rayTex); MAT.ring=glowMat(ringTex);
const AURAS=[];
function aureole(g,r,y,z){ for (const [mat,spin,size,dz] of [[MAT.rays,.12,2,0],[MAT.ring,-.9,1.55,.02]]){ const m=new THREE.Mesh(new THREE.PlaneGeometry(size*r,size*r),mat);
  m.position.set(0,y,z+dz); m.userData.noMerge=true; m.userData.spin=spin; g.add(m); AURAS.push(m); } }

const lathe=(pts,mat,y,g,seg=32)=>{ const m=add(new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r,yy])=>new THREE.Vector2(r,yy)),seg),mat),g); m.position.y=y; return m; };
/* Statues are paintings (painted.js) shown as sprites that always face the visitor, standing on a 3D lotus with the aureole behind. */
// A painted figure standing on its bottom edge, always turned to the viewer, h metres tall.
function spriteOf(cv,h){ const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,alphaTest:.5,color:'#f3e9d6'})); sp.center.set(.5,0); sp.scale.set(h*cv.width/cv.height,h,1); return sp; }
function paintedStatue(name,h,seat,lotus=SM.lotus,base){
  const g=new THREE.Group(), lg=new THREE.Group(); if (base){ base(g); lg.position.y=.3; } g.add(lg);
  const y0=lg.position.y+lotusSeat(lg,seat,lotus), sp=spriteOf(paintDeity(name),h);
  sp.position.set(0,y0-.06,seat*.9); g.add(sp);   // in front of the petals so the lotus doesn't hide the lap
  haloPlane(g,h*.3,y0+h*.82,-.25); aureole(g,h*.55,y0+h*.6,-.32);
  g.userData.h=y0+h; return g; }
const STATUE={
  thichca:()=>paintedStatue('thichca',1.3,.78),
  duocsu:()=>paintedStatue('duocsu',1.3,.78),
  adida:()=>paintedStatue('adida',2.3,.55),
  quanam:()=>paintedStatue('quanam',2.3,.55,SM.lotusPink),
  diatang:()=>paintedStatue('diatang',2.3,.55),
  dilac:()=>paintedStatue('dilac',1.35,.78),
  dansanh:()=>paintedStatue('dansanh',1.05,.36,SM.lotus,g=>{ cyl(.72,.62,.36,SM.goldDark,0,.18,0,g,32); const w=add(new THREE.Mesh(new THREE.CircleGeometry(.62,32),MAT.water),g); w.rotation.x=-Math.PI/2; w.position.y=.37; }),
};
const DEITY_NAMES={thichca:'Đức Phật Thích Ca Mâu Ni',adida:'Đức Phật A Di Đà',quanam:'Quan Thế Âm Bồ Tát',diatang:'Địa Tạng Vương Bồ Tát',dilac:'Đức Phật Di Lặc',duocsu:'Đức Phật Dược Sư',dansanh:'Đức Phật Đản Sanh'};
const INVOKE={thichca:'Nam mô Bổn Sư Thích Ca Mâu Ni Phật',adida:'Nam mô A Di Đà Phật',quanam:'Nam mô Đại Từ Đại Bi Quán Thế Âm Bồ Tát',diatang:'Nam mô Đại Nguyện Địa Tạng Vương Bồ Tát',dilac:'Nam mô Đương Lai Hạ Sanh Di Lặc Tôn Phật',duocsu:'Nam mô Dược Sư Lưu Ly Quang Vương Phật',dansanh:'Nam mô Bổn Sư Thích Ca Mâu Ni Phật'};

/* ================= halls with stairs and walk-in interiors ================= */
const interiorLights=[];
const CUSHIONS=[];
function lanternMesh(parent,x,y,z,s=1){ sph(.26*s,MAT.lantern,x,y,z,parent,1,1.25,1).castShadow=false; cyl(.12*s,.12*s,.06*s,MAT.gold,x,y+.33*s,z,parent,8); cyl(.12*s,.12*s,.06*s,MAT.gold,x,y-.33*s,z,parent,8); box(.03,.3*s,.03,MAT.col,x,y-.52*s,z,parent); }
function building(o){
  const {w,d,platH,colH,roofH,curl,x,z,rot=0,doors=3,tier2=false,stack=0,deity,title,plaque,main=false,doorW,doorH,stairW}=o;
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; scene.add(g);
  const cut=new THREE.Group(); cut.userData.cut=true; g.add(cut);
  const pw=w+3, pd=d+3, nSteps=Math.max(2,Math.ceil(platH/.22)), stepH=platH/nSteps, run=nSteps*.45, sw=stairW||Math.min(8,w*.42);
  const b={x,z,rot,g,cut,platH,pw,pd,sw,run,title,deity};
  box(pw+.3,.3,pd+.3,MAT.stoneDark,0,.15,0,g);
  box(pw,platH-.12,pd,MAT.stone,0,(platH-.12)/2,0,g);
  box(pw+.2,.14,pd+.2,MAT.step,0,platH-.07,0,g);
  for (let i=0;i<nSteps;i++){ const h=(i+1)*stepH; box(sw,h,.47,MAT.step,0,h/2,pd/2+run-(i+.5)*.45,g); }
  const slope=Math.hypot(run,platH+.01), ang=Math.atan2(platH,run);
  for (const sx of [-1,1]){
    const rail=box(.42,.5,slope+.2,MAT.stone,sx*(sw/2+.21),platH/2+.3,pd/2+run/2,g); rail.rotation.x=ang;
    box(.6,1.0,.6,MAT.stone,sx*(sw/2+.21),.5,pd/2+run+.15,g); sph(.24,MAT.lionStone,sx*(sw/2+.21),1.15,pd/2+run+.15,g);
    if (main){ const pts=[]; for (let i=0;i<=10;i++){ const t=i/10; pts.push(V3(sx*(sw/2+.21),lerp(platH+.75,.85,t)+Math.sin(t*Math.PI*3)*.14,lerp(pd/2-.2,pd/2+run,t))); } tubeAlong(g,pts,.15,MAT.lionStone); sph(.3,MAT.lionStone,sx*(sw/2+.21),1.25,pd/2+run+.15,g); }
  }
  const iw=w-1.2, idp=d-2.6, wz=-.6, t=.3, fz=wz+idp/2, bz=wz-idp/2, top=platH+colH;
  Object.assign(b,{iw,fz,bz});
  const fl=add(new THREE.Mesh(new THREE.PlaneGeometry(iw-.4,idp-.4),MAT.floor),g,false,true); fl.rotation.x=-Math.PI/2; fl.position.set(0,platH+.012,wz);
  box(iw,colH,t,MAT.wall,0,platH+colH/2,bz+t/2,g);
  for (const sx of [-1,1]) box(t,colH,idp,MAT.wall,sx*(iw/2-t/2),platH+colH/2,wz,g);
  const dw=doorW||(main?2.3:1.9), dh=doorH||Math.min(colH*.72,3.2);
  const doorXs=doors===3?[-iw*.3,0,iw*.3]:[0]; b.doorXs=doorXs;
  const xs=[-iw/2]; for (const dx of doorXs) xs.push(dx-dw/2,dx+dw/2); xs.push(iw/2);
  for (let i=0;i<xs.length;i+=2){ const x0=xs[i], x1=xs[i+1]; if (x1-x0>.05){ box(x1-x0,colH,t,MAT.wall,(x0+x1)/2,platH+colH/2,fz-t/2,g); obLocal(b,x0,x1,fz-t,fz); } }
  for (const dx of doorXs){
    box(dw,colH-dh,t,MAT.wall,dx,platH+dh+(colH-dh)/2,fz-t/2,g);
    box(dw+.3,.2,t+.12,MAT.col,dx,platH+dh+.1,fz-t/2,g);
    for (const sx of [-1,1]){ box(.15,dh,t+.12,MAT.col,dx+sx*(dw/2+.06),platH+dh/2,fz-t/2,g); box(dw/2-.05,dh-.1,.07,MAT.doorLeaf,dx+sx*(dw*.75+.15),platH+dh/2,fz+.05,g); box(dw/2-.35,dh*.3,.08,MAT.gold,dx+sx*(dw*.75+.15),platH+dh*.7,fz+.06,g); }
    box(dw,.08,t+.1,MAT.col,dx,platH+.04,fz-t/2,g);
  }
  const reach=Math.min(idp,10)*.75;   // sunlight falls a few metres in, however deep the hall
  for (const dx of doorXs){ const L=Math.hypot(dh,reach), sh=new THREE.Mesh(new THREE.PlaneGeometry(dw*.95,L),MAT.shaft); sh.position.set(dx,platH+dh/2,fz-reach/2); sh.rotation.x=Math.atan2(reach,dh); add(sh,g,false,false); }
  const panelXs=doors===3?[-iw*.45,-iw*.15,iw*.15,iw*.45]:[-iw*.32,iw*.32];
  for (const px of panelXs){ box(.85,colH*.62,.06,MAT.gold,px,platH+colH*.46,fz+.03,g); box(.55,colH*.5,.07,MAT.col,px,platH+colH*.46,fz+.04,g); }
  box(iw-.4,.5,.06,MAT.goldDark,0,top-.45,fz+.03,g);
  const pq=add(new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.6,iw*.42),Math.min(1,(colH-dh)*.85)),lam('#ffffff',{map:plaqueTex(plaque),emissive:'#2a1206'})),g,false,false);
  pq.position.set(0,platH+dh+(colH-dh)/2+.05,fz+.06);
  const win=(px,pz,ry)=>{ for (const inset of [0,1]){ const off=inset?-t-.02:.02; const m=add(new THREE.Mesh(new THREE.CircleGeometry(.48,16),MAT.dark),g,false,false);
      m.position.set(px+Math.sin(ry)*off,platH+colH*.55,pz+Math.cos(ry)*off); m.rotation.y=inset?ry+Math.PI:ry; }
    const r=add(new THREE.Mesh(new THREE.TorusGeometry(.5,.07,6,18),MAT.col),g); r.position.set(px+Math.sin(ry)*.03,platH+colH*.55,pz+Math.cos(ry)*.03); r.rotation.y=ry;
    for (const a of [0,Math.PI/2,Math.PI/4,-Math.PI/4]){ const bar=box(.9,.05,.05,MAT.gold,px+Math.sin(ry)*.04,platH+colH*.55,pz+Math.cos(ry)*.04,g); bar.rotation.set(0,ry,a); } };
  for (const sx of [-1,1]) for (const k of [-.25,.25]) win(sx*iw/2,wz+idp*k,sx*Math.PI/2);
  for (const k of [-.3,.3]) win(iw*k,bz,Math.PI);
  const colZ=(fz+pd/2)/2-.2, n=Math.max(3,Math.round(w/3.4));
  for (let i=0;i<=n;i++){ const cx=-w/2+.6+i*(w-1.2)/n; if (doorXs.some(dx=>Math.abs(cx-dx)<dw/2+.6)) continue;   // keep doorways clear
    box(.6,.28,.6,MAT.stone,cx,platH+.14,colZ,g); cyl(.2,.23,colH-.28,MAT.col,cx,platH+.28+(colH-.28)/2,colZ,g,10); box(.52,.22,.52,MAT.gold,cx,top-.11,colZ,g);
    if (i>0&&i<n) box(.26,colH*.55,.05,MAT.gold,cx,platH+colH*.5,colZ+.22,g);
    const [wx,wzz]=l2w(b,cx,colZ); obCirc(wx,wzz,.3);
    if (i<n) lanternMesh(g,cx+(w-1.2)/n/2,top-.95,colZ+.1,.9); }
  box(w+.4,.4,.44,MAT.col,0,top+.08,colZ,g); box(w+.2,.14,.46,MAT.gold,0,top-.16,colZ,g);
  if (iw>9) for (const sx of [-1,1]) for (const zz of [bz+idp*.35,fz-1.4]){ cyl(.22,.25,colH,MAT.col,sx*iw*.36,platH+colH/2,zz,g,10); const [wx,wzz]=l2w(b,sx*iw*.36,zz); obCirc(wx,wzz,.3); }
  const ceil=add(new THREE.Mesh(new THREE.PlaneGeometry(iw,idp),MAT.wood),cut,false,false); ceil.rotation.x=Math.PI/2; ceil.position.set(0,top-.02,wz);
  for (let k=-2;k<=2;k++) box(iw,.16,.22,MAT.goldDark,0,top-.12,wz+k*idp/5.2,cut);
  const vc=add(new THREE.Mesh(new THREE.PlaneGeometry(w+1,pd/2-fz+.4),MAT.wood),cut,false,false); vc.rotation.x=Math.PI/2; vc.position.set(0,top+.25,(pd/2+fz)/2);
  const y0=top-.05, W=w+3.6, D=d+3.4;
  add(new THREE.Mesh(roofGeo(W,D,roofH,curl),MAT.roof),cut).position.y=y0;
  roofDetail(cut,W,D,roofH,y0,curl,!tier2&&!stack);
  if (tier2){ const y1=y0+roofH*.62; box(w*.56,1.6,d*.46,MAT.wall,0,y1+.5,0,cut); box(w*.5,.45,.06,MAT.gold,0,y1+.65,d*.23+.01,cut);
    for (let i=0;i<6;i++) box(.18,1.3,.07,MAT.col,-w*.25+i*w*.1,y1+.5,d*.23+.02,cut);
    const W2=w*.74, D2=d*.66, H2=roofH*.95; add(new THREE.Mesh(roofGeo(W2,D2,H2,curl*.9),MAT.roof),cut).position.y=y1+1.25; roofDetail(cut,W2,D2,H2,y1+1.25,curl*.9,true); }
  if (stack){ let y=y0+roofH*.55, s=w*.72;
    for (let k=0;k<stack;k++){ box(s,2,s,MAT.wall,0,y+1,0,cut); for (const sx of [-1,1]) for (const sz of [-1,1]) box(.22,2,.22,MAT.col,sx*s/2,y+1,sz*s/2,cut);
      box(s*.4,.4,.06,MAT.gold,0,y+1.2,s/2+.01,cut);
      const rw=s+2.2; add(new THREE.Mesh(roofGeo(rw,rw,1.5,.8),MAT.roof),cut).position.y=y+1.95; roofDetail(cut,rw,rw,1.5,y+1.95,.8,false); y+=2+1.5*.55; s*=.78; }
    const f=add(new THREE.Mesh(new THREE.ConeGeometry(.35,1.8,6),MAT.gold),cut); f.position.y=y+1; }
  // altar, statue and offerings
  const standing=['adida','quanam','diatang','dansanh'].includes(deity);
  const aw=Math.min(iw*.45,7), az=bz+t+1.15, altarTop=standing?1.1:1.77;
  box(aw+1.2,colH-.45,.1,MAT.col,0,platH+(colH-.45)/2,bz+t+.06,g); box(aw*.85,colH*.6,.12,MAT.goldDark,0,platH+colH*.5,bz+t+.1,g);
  box(aw,1.0,2,MAT.col,0,platH+.5,az,g); box(aw+.12,.1,2.12,MAT.gold,0,platH+1.03,az,g); box(aw+.04,.12,.04,MAT.gold,0,platH+.6,az+1.0,g);
  if (!standing){ box(aw*.7,.62,1.5,MAT.col,0,platH+1.39,az-.15,g); box(aw*.72,.1,1.55,MAT.gold,0,platH+1.72,az-.15,g); }
  const st=STATUE[deity](); const k=(colH-altarTop-.35)/st.userData.h; st.scale.setScalar(k); st.position.set(0,platH+altarTop,az-.2); g.add(st);
  if (o.extra) o.extra(g,{b,platH,iw,bz,fz,colH,altarTop,az});
  const tz=az+1.68, ty=platH+.86;
  box(aw*.76,.84,.76,MAT.col,0,platH+.42,tz,g); box(aw*.78,.06,.8,MAT.gold,0,ty-.01,tz,g);
  for (const sx of [-1,1]){
    cyl(.07,.07,.4,MAT.candle,sx*aw*.32,ty+.2,tz,g,8); add(new THREE.Mesh(new THREE.ConeGeometry(.05,.16,6),MAT.flame),g,false,false).position.set(sx*aw*.32,ty+.5,tz);
    lathe([[0,0],[.08,.02],[.1,.14],[.05,.3],[.07,.4],[0,.4]],MAT.blue,0,g,10).position.set(sx*aw*.2,ty,tz);
    for (let i=0;i<3;i++) add(new THREE.Mesh(new THREE.ConeGeometry(.07,.16,6),MAT.lotus),g).position.set(sx*aw*.2+R(-.06,.06),ty+.5+i*.05,tz+R(-.05,.05));
    cyl(.16,.12,.04,MAT.gold,sx*aw*.09,ty+.02,tz,g,12);
    for (const [c,dx,dy] of [['#f29a2e',0,.08],['#e9cf3a',.08,.07],['#7fb043',-.08,.07],['#c9302a',0,.17]]) sph(.07,lam(c),sx*aw*.09+dx,ty+dy,tz,g);
    cyl(.05,.08,1.6,MAT.gold,sx*(aw/2+.55),platH+.8,az+.7,g,8); cyl(.12,.08,.1,MAT.gold,sx*(aw/2+.55),platH+1.62,az+.7,g,8); add(new THREE.Mesh(new THREE.ConeGeometry(.06,.2,6),MAT.flame),g,false,false).position.set(sx*(aw/2+.55),platH+1.78,az+.7);
  }
  lathe([[0,0],[.14,0],[.18,.1],[.16,.2],[.19,.24],[0,.24]],MAT.bronze,0,g,12).position.set(0,ty,tz);
  for (let i=0;i<5;i++){ const s=box(.015,.4,.015,lam('#c9463a'),R(-.06,.06),ty+.42,tz+R(-.05,.05),g); s.castShadow=false; }
  obLocal(b,-aw/2-.7,aw/2+.7,bz,tz+.45);
  if (main){
    const dx=-iw/2+1.6; box(.15,1.6,.15,MAT.col,dx-.55,platH+.8,az+.6,g); box(.15,1.6,.15,MAT.col,dx+.55,platH+.8,az+.6,g);
    const dr=cyl(.55,.55,.7,MAT.col,dx,platH+1.3,az+.6,g,18); dr.rotation.z=Math.PI/2; for (const sx of [-1,1]){ const sk=add(new THREE.Mesh(new THREE.CircleGeometry(.52,18),lam('#e8d4a8')),g); sk.position.set(dx+sx*.36,platH+1.3,az+.6); sk.rotation.y=sx*Math.PI/2; }
    const bx=iw/2-1.6; box(.12,2.2,.12,MAT.col,bx-.55,platH+1.1,az+.6,g); box(.12,2.2,.12,MAT.col,bx+.55,platH+1.1,az+.6,g); box(1.25,.12,.12,MAT.col,bx,platH+2.2,az+.6,g);
    lathe([[0,0],[.22,-.02],[.26,-.2],[.3,-.6],[.34,-.68],[0,-.68]],MAT.bronze,0,g,14).position.set(bx,platH+2.12,az+.6);
    obLocal(b,dx-.8,dx+.8,az+.2,az+1.0); obLocal(b,bx-.8,bx+.8,az+.2,az+1.0);
    for (const lz of [.2,1.5]) for (const lx of [-6,-4.4,-2.8,-1.2,1.2,2.8,4.4,6]){ const [wx,wzz]=l2w(b,lx,lz); cyl(.42,.46,.16,MAT.cushion,lx,platH+.08,lz,g,12); CUSHIONS.push({x:wx,z:wzz,busy:null}); }
  } else for (const lx of [-1.2,0,1.2]) cyl(.4,.44,.15,MAT.cushion,lx,platH+.075,tz+1.3,g,12);
  for (const sx of [-1,1]) lanternMesh(g,sx*iw*.25,top-1.1,wz,1.1);
  const L=new THREE.PointLight('#ffb36a',0,Math.max(10,iw*1.1),1.5); L.position.set(0,top-1,tz+.6); g.add(L); interiorLights.push(L);
  obLocal(b,-iw/2,iw/2,bz,bz+t); obLocal(b,-iw/2,-iw/2+t,bz,fz); obLocal(b,iw/2-t,iw/2,bz,fz);
  b.spot=()=>[R(-1.3,1.3),tz+1.3+R(0,.6)];
  b.labelAt=l2w(b,0,pd/2+run+.6);
  BUILDINGS.push(b); return b;
}

/* ================= terrain: the temple sits on a mountain terrace ================= */
function terrainH(x,z){ const ax=Math.abs(x), n=fbm(x*.011+3,z*.011+7);
  const north=smooth(-104,-175,z), side=smooth(70,135,ax), south=smooth(72,125,z);   // flat to z -104 for the great hall
  let h=north*((-z-104)*.62+n*40)+side*((ax-70)*.42+n*34);
  h+=(north+side)*Math.pow(fbm(x*.028+11,z*.028),3)*55;
  h-=south*(1-side)*(28+n*8);
  h+=smooth(210,330,z)*(80+n*70);
  return h; }
(function terrain(){
  const g=new THREE.PlaneGeometry(1000,1000,230,230); g.rotateX(-Math.PI/2);
  const p=g.attributes.position, col=new Float32Array(p.count*3), c=new THREE.Color(), tmp=new THREE.Color();
  for (let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i), h=terrainH(x,z); p.setY(i,h);
    const sl=Math.hypot(terrainH(x+2,z)-h,terrainH(x,z+2)-h)/2;
    c.set('#6f9e4c'); c.lerp(tmp.set('#2c5229'),smooth(2,14,Math.abs(h))); c.offsetHSL(0,0,(fbm(x*.05,z*.05)-.5)*.12); c.lerp(tmp.set('#7f7d72'),smooth(.85,1.6,sl)*smooth(25,60,h)); c.lerp(tmp.set('#a7aea8'),smooth(140,210,h));
    col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.computeVertexNormals();
  const m=new THREE.Mesh(g,lam('#ffffff',{map:grassTex,vertexColors:true})); m.receiveShadow=true; scene.add(m);
  const N=6000, ico=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),lam('#ffffff'),N), cone=new THREE.InstancedMesh(new THREE.ConeGeometry(1,2.8,6),lam('#ffffff'),N);
  let a=0,b=0; const o=new THREE.Object3D();
  for (let i=0;i<N*3 && (a<N||b<N);i++){ const x=R(-480,480), z=R(-480,480), h=terrainH(x,z); if (h<8) continue; const sl=Math.hypot(terrainH(x+2,z)-h,terrainH(x,z+2)-h)/2; if (sl>1.3||h>170) continue;
    const s=R(1.3,2.6)*(1+smooth(60,300,Math.hypot(x,z))); o.position.set(x,h+s*.5,z); o.rotation.set(0,rnd()*6,0); o.scale.set(s,s*R(1,1.4),s); o.updateMatrix();
    const cc=new THREE.Color().setHSL(R(.27,.36),R(.35,.5),R(.1,.2));
    if (rnd()<.45 && a<N){ ico.setMatrixAt(a,o.matrix); ico.setColorAt(a,cc); a++; } else if (b<N){ cone.setMatrixAt(b,o.matrix); cone.setColorAt(b,cc); b++; } }
  ico.count=a; cone.count=b; scene.add(ico,cone);
})();
const mists=[];
for (let i=0;i<20;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTex,transparent:true,opacity:R(.35,.6),depthWrite:false}));
  let x,z; if (rnd()<.6){ x=R(-320,320); z=R(-330,-95); } else { x=(rnd()<.5?-1:1)*R(120,330); z=R(-150,160); }
  sp.position.set(x,Math.max(terrainH(x,z),0)+R(8,30),z); sp.scale.set(R(110,200),R(22,38),1); scene.add(sp); mists.push(sp); }

/* ================= courtyard, walls, paths ================= */
const court=add(new THREE.Mesh(new THREE.PlaneGeometry(60,46),MAT.brick),WORLD,false,true); court.rotation.x=-Math.PI/2; court.position.set(0,.02,-1);
const path=add(new THREE.Mesh(new THREE.PlaneGeometry(4,28),MAT.slab),WORLD,false,true); path.rotation.x=-Math.PI/2; path.position.set(0,.035,8);
const outPath=add(new THREE.Mesh(new THREE.PlaneGeometry(9,46),MAT.brick),WORLD,false,true); outPath.rotation.x=-Math.PI/2; outPath.position.set(0,.02,45);
const sideMat=lam('#ffffff',{map:slabTex.clone()}); sideMat.map.repeat.set(1,10); sideMat.map.needsUpdate=true;
for (const sx of [-1,1]){ const p=add(new THREE.Mesh(new THREE.PlaneGeometry(3,50),sideMat),WORLD,false,true); p.rotation.x=-Math.PI/2; p.position.set(sx*34,.03,3); }
function wallSeg(x0,x1,z0,z1){ const w=Math.max(.5,x1-x0), d=Math.max(.5,z1-z0); box(w,1,d,MAT.wall,(x0+x1)/2,.5,(z0+z1)/2); box(w+.15,.15,d+.15,MAT.cap,(x0+x1)/2,1.05,(z0+z1)/2); box(w+.05,.25,d+.05,MAT.stoneDark,(x0+x1)/2,.125,(z0+z1)/2); obBox(x0,x1,z0,z1); }
wallSeg(-30.25,-29.75,-24,22); wallSeg(29.75,30.25,-24,22);   // no north wall: the great hall's steps open onto the courtyard
wallSeg(-30,-6.6,21.75,22.25); wallSeg(6.6,30,21.75,22.25);
for (let x=-66;x<=66;x+=4){ box(4,.7,.3,MAT.stone,x,.35,67.5); box(.4,.95,.4,MAT.stoneDark,x-2,.48,67.5); }

/* ================= halls ================= */
// Chánh điện: about 20 times the floor of the old hall, behind the courtyard; its steps end where the north wall stood (z -24).
function greatHall(g,{b,platH,iw,bz,fz,colH,altarTop,az}){
  const H=colH-altarTop-.35, sprite=(cv,h,x,y,z)=>{ const sp=spriteOf(cv,h); sp.position.set(x,y,z); g.add(sp); return sp; };
  // Tam Thế Phật: A Di Đà (past) and Di Lặc (future) beside Thích Ca (present), each on its own altar.
  for (const [sx,name,h] of [[-1,'adida_s',1.3],[1,'dilac',1.35]]){ const x=sx*10.5;
    box(7,altarTop,5,MAT.col,x,platH+altarTop/2,az,g); box(7.4,.12,5.4,MAT.gold,x,platH+altarTop,az,g);
    const st=paintedStatue(name,h,.78); st.scale.setScalar(H*.82/st.userData.h); st.position.set(x,platH+altarTop,az-.2); g.add(st); obLocal(b,x-3.7,x+3.7,az-2.7,az+2.7); }
  const mt=new THREE.CanvasTexture(paintMural()); mt.colorSpace=THREE.SRGBColorSpace;   // thousand-Buddha wall behind the altars
  const mural=add(new THREE.Mesh(new THREE.PlaneGeometry(iw*.9,colH*.75),new THREE.MeshLambertMaterial({map:mt})),g,false,true); mural.position.set(0,platH+colH*.45,bz+.35);   // just in front of the 0.3 m back wall
  for (let i=0;i<18;i++){ const sx=i<9?-1:1, k=i%9, x=sx*(iw/2-2.4), z=bz+9+k*(fz-bz-17)/8;   // eighteen La Hán along the side walls
    box(2.2,1,2.2,MAT.stone,x,platH+.5,z,g); sprite(paintFigure(arhatLook(i),256),3.6,x,platH+1,z); obLocal(b,x-1.2,x+1.2,z-1.2,z+1.2); }
  for (const [sx,name] of [[-1,'hophap1'],[1,'hophap2']]){ const x=sx*7, z=fz-5;   // Hộ Pháp guarding the main door
    box(2.8,1.2,2.8,MAT.stone,x,platH+.6,z,g); sprite(paintDeity(name),6.8,x,platH+1.2,z); obLocal(b,x-1.5,x+1.5,z-1.5,z+1.5); }
  for (const [sx,name] of [[-1,'quanam'],[1,'diatang']]){ const x=sx*(iw/2-9), z=bz+6;   // Quan Âm and Địa Tạng in the rear corners
    const st=paintedStatue(name,2.3,.55,name==='quanam'?SM.lotusPink:SM.lotus); st.scale.setScalar(7/st.userData.h); st.position.set(x,platH,z); g.add(st); obLocal(b,x-2,x+2,z-2,z+2); }
}
const MAINHALL=building({w:90,d:70,platH:1.2,colH:12,roofH:9,curl:3,tier2:true,x:0,z:-63.2,deity:'thichca',title:'Chánh điện',plaque:'ĐẠI HÙNG BẢO ĐIỆN',main:true,doorW:6,doorH:5.5,stairW:24,extra:greatHall});
building({w:14,d:8,platH:.7,colH:4,roofH:2.6,curl:.95,x:-23,z:-2,rot:Math.PI/2,doors:1,deity:'quanam',title:'Điện Quan Âm',plaque:'QUAN ÂM CÁC'});
building({w:14,d:8,platH:.7,colH:4,roofH:2.6,curl:.95,x:23,z:-2,rot:-Math.PI/2,doors:1,deity:'adida',title:'Điện A Di Đà',plaque:'DI ĐÀ ĐIỆN'});
building({w:10,d:7,platH:.6,colH:3.7,roofH:2.2,curl:.85,x:-23.5,z:14,rot:Math.PI/2,doors:1,deity:'diatang',title:'Điện Địa Tạng',plaque:'ĐỊA TẠNG ĐIỆN'});
building({w:10,d:7,platH:.6,colH:3.7,roofH:2.2,curl:.85,x:23.5,z:14,rot:-Math.PI/2,doors:1,deity:'dilac',title:'Điện Di Lặc',plaque:'DI LẶC ĐIỆN'});
building({w:14,d:8,platH:.7,colH:4,roofH:2.6,curl:1,x:46,z:-8,rot:-Math.PI/2,doors:1,deity:'duocsu',title:'Điện Dược Sư',plaque:'DƯỢC SƯ ĐIỆN'});
building({w:8,d:8,platH:.8,colH:3.8,roofH:2.2,curl:.9,x:-46,z:8,rot:Math.PI/2,doors:1,stack:3,deity:'dansanh',title:'Tháp Đản Sanh',plaque:'ĐẢN SANH'});

/* ================= Tam quan gate ================= */
function archShape(w,h,ow,oh){ const r=ow/2, s=new THREE.Shape();
  s.moveTo(-w/2,0); s.lineTo(-ow/2,0); s.lineTo(-ow/2,oh-r); s.absarc(0,oh-r,r,Math.PI,0,true); s.lineTo(ow/2,0); s.lineTo(w/2,0); s.lineTo(w/2,h); s.lineTo(-w/2,h); s.lineTo(-w/2,0);
  const g=new THREE.ExtrudeGeometry(s,{depth:1.1,bevelEnabled:false,curveSegments:12}); g.translate(0,0,-.55); return g; }
// Kept out of the static merge so it can hide once the visitor is inside and stop blocking the view of the courtyard.
const GATE=new THREE.Group(); GATE.userData.noMerge=true;
(function gate(){
  const g=GATE; g.position.set(0,0,22); WORLD.add(g); const yel=lam('#dcb653');
  add(new THREE.Mesh(archShape(5.6,5.3,2.6,4.0),yel),g);
  for (const sx of [-1,1]){
    add(new THREE.Mesh(archShape(3.4,3.9,1.7,2.9),yel),g).position.x=sx*4.3;
    for (const px of [sx*2.45,sx*6.15]){ const h=Math.abs(px)<3?5.3:3.9; box(.85,h+.2,1.25,yel,px,(h+.2)/2,0,g); box(.45,h*.72,1.3,MAT.blue,px,h*.45,0,g); box(1,.3,1.4,MAT.stoneDark,px,.15,0,g); box(.95,.18,1.35,MAT.gold,px,h+.1,0,g); }
    add(new THREE.Mesh(roofGeo(4.2,2.5,1.1,.45),MAT.roof),g).position.set(sx*4.3,3.95,0);
    const q=new THREE.Group(); q.position.x=sx*4.3; g.add(q); roofDetail(q,4.2,2.5,1.1,3.95,.45,false);
    const lion=new THREE.Group(); lion.position.set(sx*2.45,0,1.7); g.add(lion);
    box(1,.9,1,MAT.lionStone,0,.45,0,lion); sph(.45,MAT.lionStone,0,1.25,-.05,lion,1,1.1,1.2); sph(.36,MAT.lionStone,0,1.85,.18,lion); sph(.16,MAT.lionStone,0,1.78,.48,lion); for (const e of [-1,1]) sph(.1,MAT.lionStone,e*.25,2.1,.1,lion);
    obBox(sx>0?1.95:-2.95,sx>0?2.95:-1.95,22.1,23.3);
  }
  add(new THREE.Mesh(roofGeo(6.8,2.7,1.6,.6),MAT.roof),g).position.y=5.3; roofDetail(g,6.8,2.7,1.6,5.3,.6,true);
  for (const zz of [.62,-.62]){ const p=add(new THREE.Mesh(new THREE.PlaneGeometry(3.2,.72),lam('#ffffff',{map:plaqueTex('AN TÂM NAM CHÙA'),emissive:'#2a1206'})),g,false,false); p.position.set(0,4.65,zz); if (zz<0) p.rotation.y=Math.PI; }
  obBox(1.3,3.45,21.4,22.6); obBox(-3.45,-1.3,21.4,22.6); obBox(5.0,6.6,21.4,22.6); obBox(-6.6,-5.0,21.4,22.6);
})();

/* ================= urn, stone lanterns, bell ================= */
const URN=V3(-3.5,0,-3);
(function urn(){
  const g=new THREE.Group(); g.position.copy(URN); WORLD.add(g);
  box(2.6,.35,2.6,MAT.stone,0,.175,0,g);
  lathe([[0,.9],[.72,.9],[.95,1.15],[1.0,1.55],[.86,1.92],[.98,2.02],[1.02,2.12],[0,2.12]],MAT.urn,0,g,18);
  for (let i=0;i<3;i++){ const a=i*2.094; cyl(.12,.16,.6,MAT.urn,Math.cos(a)*.6,.62,Math.sin(a)*.6,g,6); }
  for (const s of [-1,1]){ const t=add(new THREE.Mesh(new THREE.TorusGeometry(.28,.07,6,12),MAT.urn),g); t.position.set(s*1.08,1.9,0); t.rotation.y=Math.PI/2; }
  const sticks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.015,.015,.9,4),lam('#c9463a'),46), tips=new THREE.InstancedMesh(new THREE.BoxGeometry(.05,.07,.05),MAT.tip,46), o=new THREE.Object3D();
  for (let i=0;i<46;i++){ const r=Math.sqrt(rnd())*.75, a=rnd()*6.28; o.position.set(Math.cos(a)*r,2.5,Math.sin(a)*r); o.rotation.set(R(-.18,.18),0,R(-.18,.18)); o.updateMatrix(); sticks.setMatrixAt(i,o.matrix); o.position.y+=.46; o.updateMatrix(); tips.setMatrixAt(i,o.matrix); }
  g.add(sticks,tips); obCirc(URN.x,URN.z,1.45);
})();
function stoneLantern(x,z){ const g=new THREE.Group(); g.position.set(x,0,z); WORLD.add(g);
  box(.7,.3,.7,MAT.lionStone,0,.15,0,g); cyl(.16,.2,1.2,MAT.lionStone,0,.9,0,g,6); box(.6,.5,.6,MAT.lionStone,0,1.75,0,g);
  box(.36,.3,.62,MAT.lantern,0,1.75,0,g).castShadow=false; const c=add(new THREE.Mesh(new THREE.ConeGeometry(.55,.5,4),MAT.lionStone),g); c.position.y=2.25; c.rotation.y=Math.PI/4; obCirc(x,z,.45); }
stoneLantern(-6.6,-3); stoneLantern(-.4,-3);
const BELLPOS=V3(9,0,-3);
const bellPivot=new THREE.Group(); bellPivot.userData.noMerge=true;
(function bell(){
  const g=new THREE.Group(); g.position.copy(BELLPOS); WORLD.add(g);
  box(3.6,.4,2.6,MAT.stone,0,.2,0,g);
  for (const s of [-1,1]){ box(.32,4.1,.32,MAT.col,s*1.25,2.35,0,g); box(.6,.3,.6,MAT.stone,s*1.25,.55,0,g); }
  box(3.4,.38,.42,MAT.col,0,4.4,0,g);
  add(new THREE.Mesh(roofGeo(4.2,1.8,.7,.35),MAT.roof),g).position.y=4.55;
  bellPivot.position.set(0,4.2,0); g.add(bellPivot);
  add(new THREE.Mesh(new THREE.LatheGeometry([[0,0],[.42,-.04],[.5,-.35],[.54,-1.2],[.68,-1.55],[.7,-1.7],[0,-1.7]].map(([r,y])=>new THREE.Vector2(r,y)),18),MAT.bronze),bellPivot);
  for (const y of [-.5,-1.15]){ const t=add(new THREE.Mesh(new THREE.TorusGeometry(.53,.035,5,18),MAT.bronze),bellPivot); t.position.y=y; t.rotation.x=Math.PI/2; }
  cyl(.13,.13,1.4,MAT.trunk,1.35,2.6,0,g,6).rotation.z=Math.PI/2;
  obBox(BELLPOS.x-1.8,BELLPOS.x+1.8,BELLPOS.z-1.3,BELLPOS.z+1.3);
})();

/* ================= ponds and benches ================= */
const padsI=[], lotusI=[];
function pond(x,z,w,d){ const rh=.45;
  box(w,rh,.4,MAT.rim,x,rh/2,z-d/2); box(w,rh,.4,MAT.rim,x,rh/2,z+d/2); box(.4,rh,d,MAT.rim,x-w/2,rh/2,z); box(.4,rh,d,MAT.rim,x+w/2,rh/2,z);
  const wt=add(new THREE.Mesh(new THREE.PlaneGeometry(w-.4,d-.4),MAT.water),WORLD,false,true); wt.rotation.x=-Math.PI/2; wt.position.set(x,.3,z);
  for (let i=0;i<Math.round(w*d*.7);i++) padsI.push([x+R(-w/2+.6,w/2-.6),.32,z+R(-d/2+.6,d/2-.6),R(.25,.5)]);
  for (let i=0;i<Math.round(w*d*.12);i++) lotusI.push([x+R(-w/2+.8,w/2-.8),.55,z+R(-d/2+.8,d/2-.8)]);
  obBox(x-w/2,x+w/2,z-d/2,z+d/2); }
pond(12,9,7,5); pond(-12,30,8,5); pond(12,30,8,5); pond(-44,-8,5,7);
(function(){ const o=new THREE.Object3D();
  const pads=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,.03,9),MAT.pad,padsI.length); padsI.forEach(([x,y,z,s],i)=>{ o.position.set(x,y,z); o.scale.set(s,1,s); o.rotation.set(0,rnd()*6,0); o.updateMatrix(); pads.setMatrixAt(i,o.matrix); });
  const lot=new THREE.InstancedMesh(new THREE.ConeGeometry(.18,.32,6),MAT.lotus,lotusI.length); lotusI.forEach(([x,y,z],i)=>{ o.position.set(x,y,z); o.scale.set(1,1,1); o.rotation.set(Math.PI,0,0); o.updateMatrix(); lot.setMatrixAt(i,o.matrix); });
  add(pads,scene,false,true); add(lot,scene); })();
function bench(x,z,rot=0){ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot; WORLD.add(g);
  box(2.2,.12,.6,MAT.bench,0,.48,0,g); box(2.2,.5,.08,MAT.bench,0,.8,-.28,g); for (const s of [-1,1]) box(.12,.45,.55,MAT.bench,s*.95,.23,0,g);
  const r=Math.abs(Math.sin(rot))>.5; obBox(x-(r?.4:1.2),x+(r?.4:1.2),z-(r?1.2:.4),z+(r?1.2:.4)); }
bench(12,13.4); bench(-8,26.5); bench(8,26.5); bench(-15.5,4.5,Math.PI/2);

/* ================= vegetation (instanced cards for detail) ================= */
const V={trunk:[],palm:[],areca:[],shaft:[],blob:[],frond:[],coco:[]}, CARDS={};
for (const k in CARDTEX) CARDS[k]=[];
const o3=new THREE.Object3D();
function seg(list,a,b,r){ const d=new THREE.Vector3().subVectors(b,a), L=d.length(); o3.position.copy(a).addScaledVector(d,.5); o3.quaternion.setFromUnitVectors(UP,d.normalize()); o3.scale.set(r,L,r); o3.updateMatrix(); list.push(o3.matrix.clone()); }
function blob(x,y,z,r,sy=.8,h=[.24,.32],l=[.18,.3]){ o3.position.set(x,y,z); o3.quaternion.identity(); o3.rotation.set(rnd()*3,rnd()*3,0); o3.scale.set(r,r*sy,r); o3.updateMatrix(); V.blob.push({m:o3.matrix.clone(),c:new THREE.Color().setHSL(R(h[0],h[1]),R(.45,.6),R(l[0],l[1]))}); }
function card(kind,x,y,z,size,flat=false){ o3.position.set(x,y,z); o3.quaternion.identity();
  if (flat) o3.rotation.set(-Math.PI/2+R(-.4,.4),R(0,6.28),0,'YXZ'); else o3.rotation.set(R(0,3.14),R(0,6.28),R(0,3.14),'XYZ');
  o3.scale.setScalar(size); o3.updateMatrix(); CARDS[kind].push(o3.matrix.clone()); }
function shell(kind,x,y,z,r,n,size,flatBias=.3){ for (let i=0;i<n;i++){ const u=rnd()*6.28, v=Math.acos(R(-.3,1)); card(kind,x+Math.sin(v)*Math.cos(u)*r,y+Math.cos(v)*r*.8,z+Math.sin(v)*Math.sin(u)*r,size*R(.8,1.2),rnd()<flatBias); } }
function frangipani(x,z,s=1){
  const t1=V3(x+R(-.2,.2),1.1*s,z+R(-.2,.2)); seg(V.trunk,V3(x,0,z),t1,.2*s);
  const grow=(p,dir,len,depth)=>{ const e=p.clone().addScaledVector(dir,len); seg(V.trunk,p,e,(.06+.04*depth)*s);
    if (depth===0){ for (let k=0;k<2;k++) card('frangi',e.x+R(-.15,.15)*s,e.y+.1*s,e.z+R(-.15,.15)*s,R(1.3,1.7)*s,true); card('frangi',e.x,e.y+.25*s,e.z,1.1*s);
      for (let k=0;k<4;k++) card('flower',e.x+R(-.35,.35)*s,e.y+R(.2,.45)*s,e.z+R(-.35,.35)*s,R(.32,.45)*s,rnd()<.6); blob(e.x,e.y+.05*s,e.z,.32*s,.6); return; }
    for (let i=0;i<2;i++) grow(e,dir.clone().add(V3(R(-.7,.7),R(.3,.8),R(-.7,.7))).normalize(),len*.75,depth-1); };
  for (let i=0;i<3;i++){ const a=i*2.09+R(-.3,.3); grow(t1,V3(Math.cos(a)*.7,.8,Math.sin(a)*.7).normalize(),1.2*s,2); }
  obCirc(x,z,.4); }
function palm(x,z,h=R(7,10)){
  let p=V3(x,0,z); const lean=V3(R(-.25,.25),1,R(-.25,.25)).normalize();
  for (let i=0;i<7;i++){ const n=p.clone().addScaledVector(lean,h/7); n.x+=Math.sin(i*.6)*.08; seg(V.palm,p,n,.22-.015*i); p=n; }
  for (let i=0;i<14;i++){ o3.position.copy(p); o3.quaternion.identity(); o3.rotation.set(R(-.25,.35),i*.449+R(-.15,.15),0,'YXZ'); o3.scale.setScalar(R(.85,1.15)); o3.updateMatrix(); V.frond.push(o3.matrix.clone()); }
  for (let i=0;i<5;i++){ o3.position.set(p.x+R(-.3,.3),p.y-.35,p.z+R(-.3,.3)); o3.quaternion.identity(); o3.scale.setScalar(.2); o3.updateMatrix(); V.coco.push(o3.matrix.clone()); }
  obCirc(x,z,.35); }
function areca(x,z,h=R(9,12)){
  const top=V3(x+R(-.3,.3),h,z+R(-.3,.3)); seg(V.areca,V3(x,0,z),top,.13);
  const sh=top.clone().add(V3(0,1.2,0)); seg(V.shaft,top,sh,.15);
  for (let i=0;i<8;i++){ o3.position.copy(sh); o3.quaternion.identity(); o3.rotation.set(R(-.5,.1),i*.785,0,'YXZ'); o3.scale.setScalar(R(.55,.7)); o3.updateMatrix(); V.frond.push(o3.matrix.clone()); }
  obCirc(x,z,.25); }
function cloudPine(x,z,s=1){
  const pts=[V3(x,0,z),V3(x+.35*s,1.1*s,z+.1*s),V3(x-.25*s,2.2*s,z-.1*s),V3(x+.2*s,3.2*s,z),V3(x,3.9*s,z)];
  for (let i=0;i<pts.length-1;i++) seg(V.trunk,pts[i],pts[i+1],(.24-.04*i)*s);
  [[1,.9],[1.8,1.2],[2.5,1],[3.1,.9]].forEach(([hy,len],i)=>{ const a=i*2.3+R(-.4,.4), base=V3(x,hy*s,z), e=V3(x+Math.cos(a)*len*1.4*s,(hy+.15)*s,z+Math.sin(a)*len*1.4*s); seg(V.trunk,base,e,.08*s);
    blob(e.x,e.y+.15*s,e.z,R(.7,.95)*s,.36,[.3,.36],[.14,.22]); for (let k=0;k<7;k++) card('pine',e.x+R(-.6,.6)*s,e.y+R(.25,.4)*s,e.z+R(-.6,.6)*s,R(.8,1.1)*s,true); });
  const tp=pts[4]; blob(tp.x,tp.y+.2*s,tp.z,.85*s,.45,[.3,.36],[.14,.22]); for (let k=0;k<6;k++) card('pine',tp.x+R(-.5,.5)*s,tp.y+R(.35,.6)*s,tp.z+R(-.5,.5)*s,R(.8,1.1)*s,true);
  obCirc(x,z,.45*s); }
function bodhi(x,z,s=1){
  seg(V.trunk,V3(x,0,z),V3(x,3*s,z),.6*s);
  for (let i=0;i<6;i++){ const a=i*1.047; seg(V.trunk,V3(x+Math.cos(a)*1.3*s,0,z+Math.sin(a)*1.3*s),V3(x,1.4*s,z),.2*s); }
  const ends=[];
  for (let i=0;i<6;i++){ const a=i*1.047+R(-.3,.3), b0=V3(x,R(2.4,3)*s,z), e=V3(x+Math.cos(a)*R(2.4,3.4)*s,R(4.6,5.8)*s,z+Math.sin(a)*R(2.4,3.4)*s); seg(V.trunk,b0,e,.22*s); ends.push(e); }
  ends.push(V3(x,6.6*s,z));
  for (const e of ends) for (let k=0;k<3;k++){ const p=V3(e.x+R(-1,1)*s,e.y+R(0,1.2)*s,e.z+R(-1,1)*s), r=R(1.3,1.8)*s; blob(p.x,p.y,p.z,r,.75,[.25,.3],[.14,.22]); shell('bodhi',p.x,p.y,p.z,r*.95,14,1.2*s,.2); }
  for (let i=0;i<8;i++){ const a=i*.785; box(1.1,.45,.5,MAT.stone,x+Math.cos(a)*2.1,.23,z+Math.sin(a)*2.1).rotation.y=-a+Math.PI/2; }
  obCirc(x,z,2.3); }
function blossomTree(x,z,kind,s=1){
  const t=V3(x+R(-.2,.2),1.1*s,z); seg(V.trunk,V3(x,0,z),t,.16*s);
  for (let i=0;i<4;i++){ const a=i*1.57+R(-.4,.4), e=V3(t.x+Math.cos(a)*1.1*s,t.y+R(.8,1.4)*s,t.z+Math.sin(a)*1.1*s); seg(V.trunk,t,e,.08*s);
    blob(e.x,e.y+.2*s,e.z,.45*s,.7,[.24,.3],[.2,.3]); shell(kind,e.x,e.y+.2*s,e.z,.7*s,12,.9*s,.25); shell('small',e.x,e.y,e.z,.6*s,3,.8*s); }
  obCirc(x,z,.35); }
function bonsaiPot(x,z,kind='pine',potMat=MAT.pot){
  const pg=new THREE.Group(); pg.position.set(x,0,z); WORLD.add(pg);
  lathe([[0,0],[.42,0],[.5,.08],[.46,.45],[.55,.5],[.53,.58],[0,.58]],potMat,0,pg,14);
  for (const a of [0,2.09,4.19]) box(.12,.08,.12,MAT.dark,x+Math.cos(a)*.38,.04,z+Math.sin(a)*.38);
  const p0=V3(x,.55,z), p1=V3(x+.3,1.1,z+.05), p2=V3(x-.2,1.55,z-.05), p3=V3(x+.1,1.95,z);
  seg(V.trunk,p0,p1,.11); seg(V.trunk,p1,p2,.09); seg(V.trunk,p2,p3,.07);
  for (const [p,r] of [[V3(x+.55,1.2,z),.42],[V3(x-.45,1.6,z+.05),.45],[p3,.4]]){ blob(p.x,p.y+.08,p.z,r,.42,[.28,.34],[.15,.24]); for (let k=0;k<5;k++) card(kind,p.x+R(-.35,.35),p.y+R(.15,.3),p.z+R(-.35,.35),R(.55,.75),kind==='pine'); if (kind!=='pine') shell(kind,p.x,p.y+.1,p.z,.4,5,.6); }
  obCirc(x,z,.6); }
function flowerBed(x,z,w,d,kinds){ box(w,.3,.25,MAT.stone,x,.15,z-d/2); box(w,.3,.25,MAT.stone,x,.15,z+d/2); box(.25,.3,d,MAT.stone,x-w/2,.15,z); box(.25,.3,d,MAT.stone,x+w/2,.15,z);
  const s=add(new THREE.Mesh(new THREE.PlaneGeometry(w-.3,d-.3),MAT.soil),WORLD,false,true); s.rotation.x=-Math.PI/2; s.position.set(x,.26,z);
  for (let i=0;i<w*d*1.6;i++){ const px=x+R(-w/2+.3,w/2-.3), pz=z+R(-d/2+.3,d/2-.3); blob(px,.42,pz,R(.22,.32),.7); card(pick(kinds),px,.62,pz,R(.5,.7),rnd()<.5); }
  obBox(x-w/2,x+w/2,z-d/2,z+d/2); }

bodhi(-13,12,1); cloudPine(-6.4,-6.6,1.05); cloudPine(6.4,-6.6,1.05);
[4,8.5,13,17.5].forEach((zz,i)=>{ for (const sx of [-1,1]){ if (i%2===0) bonsaiPot(sx*3.3,zz,'pine'); else bonsaiPot(sx*3.3,zz,sx<0?'pink':'yellow',MAT.potOchre); } });
frangipani(16.5,16,1.15); frangipani(-27,-20.5,1); frangipani(27,-20.5,1); frangipani(-11,26.5,1.3); frangipani(13,25.5,1.25);
flowerBed(-11,-6.9,6,1.4,['pink','bougain','yellow']); flowerBed(-16.5,19,4,2,['yellow','pink']); flowerBed(16.5,-12.5,4,2,['bougain','pink']);
for (const [x,z] of [[-7.8,19.8],[7.8,19.8],[-4.4,25],[4.4,25]]) bonsaiPot(x,z,'pine');
blossomTree(-17,30,'pink',1.3); blossomTree(17,34,'pink',1.2); blossomTree(-6,32,'yellow',1); blossomTree(7,38,'yellow',1.1); blossomTree(-40,10,'pink',1.3); blossomTree(44,-12,'yellow',1.2);
for (const [x0,x1,zz] of [[8,29,22],[-29,-8,22]]) for (let x=x0;x<=x1;x+=2.2){ blob(x,1.4,zz,.55,.7); shell('bougain',x,1.45,zz,.75,9,.9,.15); for (const sz of [-1,1]) card('bougain',x+R(-.4,.4),.9,zz+sz*.32,.9); }
for (const sx of [-1,1]) for (let z=-22;z<=20;z+=3.1){ blob(sx*30,1.35,z,.5,.7); shell('bougain',sx*30,1.4,z,.7,7,.85,.15); }
for (let i=0;i<120;i++){
  const x=R(-66,66), z=R(-42,66);
  if (Math.abs(x)<31 && z>-25 && z<23) continue;
  if ((Math.abs(x)<50 && z<-22) || (x>-62 && x<-8 && z>31 && z<64)) continue;   // great hall and street market
  if (Math.abs(Math.abs(x)-34)<2.2 && z>-23 && z<29) continue;
  if (Math.abs(x)<5.5 && z>21) continue;
  if (blocked(x,z,1.4) || groundY(x,z)>0) continue;
  const r=rnd(); r<.45?palm(x,z):r<.65?areca(x,z):r<.82?frangipani(x,z,R(1,1.4)):r<.92?cloudPine(x,z,R(1.1,1.5)):blossomTree(x,z,rnd()<.5?'pink':'yellow',R(1,1.3));
}
(function buildVeg(){
  const mk=(geo,mat,list,cast=true)=>{ if (!list.length) return null; const m=new THREE.InstancedMesh(geo,mat,list.length); list.forEach((x,i)=>m.setMatrixAt(i,x)); add(m,scene,cast,true); return m; };
  mk(new THREE.CylinderGeometry(.75,1,1,7),MAT.trunk,V.trunk); mk(new THREE.CylinderGeometry(.85,1,1,7),MAT.palmTrunk,V.palm); mk(new THREE.CylinderGeometry(.9,1,1,6),MAT.areca,V.areca); mk(new THREE.CylinderGeometry(.9,1,1,8),MAT.shaft,V.shaft);
  mk(new THREE.SphereGeometry(1,6,5),lam('#5b3a1e'),V.coco);
  const bl=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),lam('#ffffff'),V.blob.length); V.blob.forEach((b,i)=>{ bl.setMatrixAt(i,b.m); bl.setColorAt(i,b.c); }); add(bl,scene);
  const fg=new THREE.PlaneGeometry(1.1,4.4,1,10), fp=fg.attributes.position;
  for (let i=0;i<fp.count;i++){ const x=fp.getX(i), yy=fp.getY(i)+2.2, t=yy/4.4; fp.setXYZ(i,x,t*1.2-t*t*2.4,yy); }
  fg.computeVertexNormals();
  const fr=mk(fg,lam('#ffffff',{map:CARDTEX.frond,alphaTest:.45,side:THREE.DoubleSide}),V.frond); if (fr) fr.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:CARDTEX.frond,alphaTest:.45});
  const pg=new THREE.PlaneGeometry(1,1);
  for (const k in CARDS){ const m=mk(pg,lam('#ffffff',{map:CARDTEX[k],alphaTest:.45,side:THREE.DoubleSide}),CARDS[k]); if (m) m.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:CARDTEX[k],alphaTest:.45}); }
})();

/* ================= lantern strings ================= */
(function strings(){
  const LP=[];
  for (const [x,z] of [[-26,4],[26,4],[-9,19],[9,19],[-14.5,-8.3],[14.5,-8.3]]) cyl(.08,.1,6.2,MAT.col,x,3.1,z,WORLD,6);
  const runs=[[[-14.5,6.1,-8.3],[-26,6.1,4]],[[14.5,6.1,-8.3],[26,6.1,4]],[[-26,6.1,4],[26,6.1,4]],[[-26,6.1,4],[-9,6.1,19]],[[26,6.1,4],[9,6.1,19]],[[-9,6.1,19],[9,6.1,19]],[[-14.5,6.1,-8.3],[14.5,6.1,-8.3]]];
  const lineMat=new THREE.LineBasicMaterial({color:'#2a1a12'});
  for (const [a,b] of runs){ const A=V3(...a), B=V3(...b), L=A.distanceTo(B), n=Math.max(4,Math.round(L/2.1)), pts=[];
    for (let i=0;i<=n;i++){ const t=i/n, p=A.clone().lerp(B,t); p.y-=L*.06*4*t*(1-t); pts.push(p); if (i>0&&i<n) LP.push(p.clone().add(V3(0,-.35,0))); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat)); }
  const g=new THREE.SphereGeometry(.26,8,6); g.scale(1,1.25,1);
  const im=new THREE.InstancedMesh(g,MAT.lantern,LP.length);
  LP.forEach((p,i)=>{ o3.position.copy(p); o3.quaternion.identity(); o3.scale.setScalar(1); o3.updateMatrix(); im.setMatrixAt(i,o3.matrix); im.setColorAt(i,new THREE.Color(i%3===0?'#f2c14e':'#d8362a')); });
  add(im,scene,false,false);
})();

/* ================= merge static meshes to keep draw calls low ================= */
function mergeStatic(root){
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets=new Map(), victims=[], rel=new THREE.Matrix4();
  (function walk(o){ for (const c of o.children){ if (c.userData.noMerge||c.userData.cut) continue;
    if (c.isMesh && !c.isInstancedMesh){ const key=c.material.uuid+'|'+c.castShadow+'|'+c.receiveShadow;
      if (!buckets.has(key)) buckets.set(key,{mat:c.material,cast:c.castShadow,recv:c.receiveShadow,geos:[]});
      let g=c.geometry.clone(); g.applyMatrix4(rel.multiplyMatrices(inv,c.matrixWorld)); if (g.index) g=g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position','normal','uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      buckets.get(key).geos.push(g); victims.push(c); }
    walk(c); } })(root);
  for (const v of victims) v.parent.remove(v);
  for (const b of buckets.values()){ const m=new THREE.Mesh(mergeGeometries(b.geos,false),b.mat); m.castShadow=b.cast; m.receiveShadow=b.recv; root.add(m); }
}
const CANDLE_POS=V3(-9.5,0,4), CANDLE_SLOTS=[], WISH_POS=V3(-13,0,12), FORTUNE_POS=V3(-7,0,-13);   // xin xăm stall: in the open courtyard where everyone sees it
(function candleStand(){
  const g=new THREE.Group(); g.position.copy(CANDLE_POS); WORLD.add(g);
  box(3.4,.3,1.6,MAT.stone,0,.15,0,g);
  for (let k=0;k<3;k++){
    const y=.55+k*.32, z=.45-k*.4, w=3.2-k*.3;
    box(w,.12,.42,MAT.col,0,y,z,g); box(w+.02,.04,.44,MAT.gold,0,y+.07,z,g);
    for (const sx of [-1,1]) box(.12,y,.12,MAT.col,sx*(w/2-.05),y/2,z,g);
    for (let i=0;i<16;i++) CANDLE_SLOTS.push(V3(CANDLE_POS.x-w/2+.2+i*(w-.4)/15,y+.09,CANDLE_POS.z+z));
  }
  box(3.4,1.7,.08,MAT.col,0,.95,-.75,g); box(2.6,.36,.09,MAT.gold,0,1.55,-.74,g);
  const roofG=new THREE.Group(); roofG.position.y=1.8; g.add(roofG); add(new THREE.Mesh(roofGeo(3.9,1.9,.55,.35),MAT.roof),roofG).position.z=-.1;
  for (const sx of [-1,1]) box(.14,1.85,.14,MAT.col,sx*1.75,.92,.75,g);
  obBox(CANDLE_POS.x-1.8,CANDLE_POS.x+1.8,CANDLE_POS.z-.9,CANDLE_POS.z+.9);
})();
const fortuneCup=new THREE.Group(); fortuneCup.userData.noMerge=true;
(function fortuneTable(){
  // A small roofed stall in the open courtyard: red table, the teller's stool behind it, a sign everyone can read.
  const g=new THREE.Group(); g.position.copy(FORTUNE_POS); WORLD.add(g);
  box(2.2,.78,1,MAT.col,0,.39,0,g); box(2.3,.05,1.1,MAT.gold,0,.8,0,g); box(.5,.45,.5,MAT.col,0,.22,-1.05,g);
  for (const sx of [-1,1]) for (const sz of [-1.4,.6]) cyl(.07,.07,2.7,MAT.col,sx*1.5,1.35,sz,g,8);
  add(new THREE.Mesh(roofGeo(3.8,3,1,.5),MAT.roof),g).position.set(0,2.7,-.4);
  const sign=add(new THREE.Mesh(new THREE.PlaneGeometry(2.2,.55),new THREE.MeshLambertMaterial({map:canvasTex(256,64,(c,w,h)=>{ c.fillStyle='#b8261c'; c.fillRect(0,0,w,h); c.strokeStyle='#e5b53c'; c.lineWidth=4; c.strokeRect(3,3,w-6,h-6);
    c.fillStyle='#ffe8a8'; c.font='bold 34px "Noto Serif Display",serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('XIN XĂM',w/2,h/2+2); },false)})),g); sign.position.set(0,2.32,.64);
  box(.5,.03,.34,lam('#f3e3b4'),-.55,.84,.12,g);   // stack of fortune slips
  fortuneCup.position.set(.5,.82,.15); g.add(fortuneCup);
  cyl(.11,.1,.36,MAT.trunk,0,.18,0,fortuneCup,10);
  for (let i=0;i<14;i++){ const st=box(.015,.42,.015,MAT.gold,R(-.06,.06),.32,R(-.06,.06),fortuneCup); st.rotation.set(R(-.12,.12),0,R(-.12,.12)); }
  obBox(FORTUNE_POS.x-1.6,FORTUNE_POS.x+1.6,FORTUNE_POS.z-1.5,FORTUNE_POS.z+.6);
})();
mergeStatic(WORLD);
for (const b of BUILDINGS){ mergeStatic(b.g); mergeStatic(b.cut); }

/* ================= sky (Canvas 2D: gradient, stars, layered far ridges, clouds) ================= */
const SKY_W=1024, SKY_H=512, SKY_HT=340, SKY_BASE=-70, SKY_R=470;
const yOf=wy=>SKY_H*(1-(wy-SKY_BASE)/SKY_HT);
const skyCanvas=document.createElement('canvas'); skyCanvas.width=SKY_W; skyCanvas.height=SKY_H;
const skyTex=new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace=THREE.SRGBColorSpace; skyTex.wrapS=THREE.RepeatWrapping;
const skyCyl=new THREE.Mesh(new THREE.CylinderGeometry(SKY_R,SKY_R,SKY_HT,48,1,true),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,fog:false,depthWrite:false}));
skyCyl.position.y=SKY_BASE+SKY_HT/2; skyCyl.renderOrder=-2; scene.add(skyCyl);
const cloudCanvas=document.createElement('canvas'); cloudCanvas.width=SKY_W; cloudCanvas.height=SKY_H;
(function(){ const g=cloudCanvas.getContext('2d');
  for (let i=0;i<26;i++){ const cx=rnd()*SKY_W, cy=yOf(R(150,260)), s=R(10,22);
    for (let k=0;k<9;k++){ const x=cx+R(-2.6,2.6)*s, y=cy+R(-.6,.3)*s, r=s*R(.6,1.1);
      for (const dx of [-SKY_W,0,SKY_W]){ g.fillStyle='rgba(176,190,214,.9)'; g.beginPath(); g.arc(x+dx,y+r*.25,r,0,7); g.fill(); g.fillStyle='rgba(255,255,255,.95)'; g.beginPath(); g.arc(x+dx,y,r*.92,0,7); g.fill(); } } } })();
const cloudTex=new THREE.CanvasTexture(cloudCanvas); cloudTex.colorSpace=THREE.SRGBColorSpace; cloudTex.wrapS=THREE.RepeatWrapping;
const cloudMat=new THREE.MeshBasicMaterial({map:cloudTex,side:THREE.BackSide,transparent:true,fog:false,depthWrite:false});
const cloudCyl=new THREE.Mesh(new THREE.CylinderGeometry(SKY_R-8,SKY_R-8,SKY_HT,48,1,true),cloudMat); cloudCyl.position.copy(skyCyl.position); cloudCyl.renderOrder=-1; scene.add(cloudCyl);
const STARS=Array.from({length:460},()=>[rnd()*SKY_W,rnd()*yOf(150),R(.4,1.4),rnd()]);
const ridge=(x,k,ph)=>{ let y=0; for (const [f,a] of k) y+=Math.sin(2*Math.PI*f*x/SKY_W+ph*f)*a; return y; };
function drawSky(day,dusk,fogHex){
  const g=skyCanvas.getContext('2d'), hz=yOf(0), mixc=(a,b,t)=>a.clone().lerp(b,t);
  const N=['#060a1d','#121a3e','#2a3463'].map(c=>new THREE.Color(c)), D=['#3f7fc4','#8cc0ea','#e2eef2'].map(c=>new THREE.Color(c)), K=['#33397a','#d47c6a','#f7c489'].map(c=>new THREE.Color(c));
  const st=[0,1,2].map(i=>mixc(mixc(N[i],D[i],day),K[i],dusk*.85).getStyle());
  scene.background=new THREE.Color(st[0]);   // the sky cylinder is open on top; eye view looks past its rim into this colour
  const gr=g.createLinearGradient(0,0,0,hz); gr.addColorStop(0,st[0]); gr.addColorStop(.62,st[1]); gr.addColorStop(1,st[2]); g.fillStyle=gr; g.fillRect(0,0,SKY_W,hz+1);
  const night=1-day; if (night>.05) for (const [x,y,r,tw] of STARS){ g.globalAlpha=night*(.35+.65*tw); g.fillStyle='#fff7e0'; g.fillRect(x,y,r,r); } g.globalAlpha=1;
  const layers=[{base:130,k:[[2,40],[5,18],[11,8]],ph:1.3,c:'#7b90a3',m:.62},{base:95,k:[[3,30],[7,12],[13,6]],ph:4.1,c:'#5e7a86',m:.5},{base:62,k:[[4,18],[9,8],[21,4]],ph:2.2,c:'#40605a',m:.38}];
  for (const L of layers){ const c=mixc(new THREE.Color(st[2]),new THREE.Color(L.c),1-L.m*.6).multiplyScalar(.35+.65*day).lerp(new THREE.Color('#e8a07a'),dusk*.15);
    g.fillStyle=c.getStyle(); g.beginPath(); g.moveTo(0,SKY_H); for (let x=0;x<=SKY_W;x+=4) g.lineTo(x,yOf(L.base+ridge(x,L.k,L.ph))); g.lineTo(SKY_W,SKY_H); g.closePath(); g.fill(); }
  g.fillStyle=fogHex; g.fillRect(0,hz,SKY_W,SKY_H-hz); skyTex.needsUpdate=true;
}
const discTex=canvasTex(64,64,(g)=>{ const gr=g.createRadialGradient(32,32,10,32,32,32); gr.addColorStop(0,'#fff'); gr.addColorStop(.5,'rgba(255,255,255,.95)'); gr.addColorStop(.56,'rgba(255,255,255,.25)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); },false);
const sunSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:discTex,color:'#fff1c8',fog:false,depthWrite:false})), moonSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:discTex,color:'#e8ecff',fog:false,depthWrite:false}));
sunSprite.scale.setScalar(60); moonSprite.scale.setScalar(30); scene.add(sunSprite,moonSprite);

/* ================= lights ================= */
const hemi=new THREE.HemisphereLight('#cfe3ff','#7a4a2a',1); scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff4e0',3); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-46,right:46,top:46,bottom:-46,near:1,far:240}); sun.shadow.bias=-.0006; sun.shadow.normalBias=.03; scene.add(sun,sun.target);
const moon=new THREE.DirectionalLight('#8fa6ff',0); moon.position.set(-60,80,40); scene.add(moon);
const warmLights=[];
for (const [x,y,z,r] of [[URN.x,3,URN.z,14],[0,4.3,20.5,14],[-15,5,4,18],[15,5,4,18],[0,5.5,-9.6,18]]){ const l=new THREE.PointLight('#ff9a4a',0,r,1.6); l.position.set(x,y,z); scene.add(l); warmLights.push(l); }
scene.fog=new THREE.FogExp2('#cfdbe6',.0022);

/* ================= incense smoke (drifts sideways) + fireflies ================= */
const SMAX=2400, sPos=new Float32Array(SMAX*3), sVel=new Float32Array(SMAX*3), sAge=new Float32Array(SMAX).fill(99), sLife=new Float32Array(SMAX).fill(1), sSize=new Float32Array(SMAX), sAlpha=new Float32Array(SMAX), sSeed=new Float32Array(SMAX);
let sHead=0, smokeLevel=1;
try { const v=localStorage.getItem('antam-smoke'); if (v!==null && ['0','1','2'].includes(v)) smokeLevel=+v; } catch(e){}
const smokeGeo=new THREE.BufferGeometry();
smokeGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3).setUsage(THREE.DynamicDrawUsage));
smokeGeo.setAttribute('aSize',new THREE.BufferAttribute(sSize,1).setUsage(THREE.DynamicDrawUsage));
smokeGeo.setAttribute('aAlpha',new THREE.BufferAttribute(sAlpha,1).setUsage(THREE.DynamicDrawUsage));
const pointShader=addv=>new THREE.ShaderMaterial({uniforms:{uScale:{value:300},uColor:{value:new THREE.Color('#d9d6d0')}},
  vertexShader:`attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(aSize*uScale/-mv.z,256.); gl_Position=projectionMatrix*mv; vA=aAlpha; }`,
  fragmentShader:`uniform vec3 uColor; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float a=smoothstep(.5,.05,length(d))*vA; if(a<.01) discard; gl_FragColor=vec4(uColor,a); }`,
  transparent:true,depthWrite:false,blending:addv?THREE.AdditiveBlending:THREE.NormalBlending});
const smokeMat=pointShader(false), smoke=new THREE.Points(smokeGeo,smokeMat); smoke.frustumCulled=false; smoke.renderOrder=5; scene.add(smoke);
function emit(x,y,z,n=1,spread=.2,up=.4){ if (smokeLevel===0) return; for (let k=0;k<n;k++){ if (smokeLevel===1&&rnd()<.65) continue; const i=sHead; sHead=(sHead+1)%SMAX;
  sPos[i*3]=x+R(-spread,spread); sPos[i*3+1]=y; sPos[i*3+2]=z+R(-spread,spread); sVel[i*3]=R(-.05,.05); sVel[i*3+1]=up*R(.75,1.2); sVel[i*3+2]=R(-.05,.05); sAge[i]=0; sLife[i]=R(11,17); sSeed[i]=rnd()*10; } }
const FF=60, ffPos=new Float32Array(FF*3), ffSize=new Float32Array(FF).fill(.25), ffAlpha=new Float32Array(FF), ffBase=[];
for (let i=0;i<FF;i++){ const p=pick([[12,9,3],[-12,30,4],[12,30,4],[-13,12,4],[0,24,8]]); ffBase.push([p[0]+R(-p[2],p[2]),R(.6,2.4),p[1]+R(-p[2],p[2]),rnd()*6]); }
const ffGeo=new THREE.BufferGeometry(); ffGeo.setAttribute('position',new THREE.BufferAttribute(ffPos,3)); ffGeo.setAttribute('aSize',new THREE.BufferAttribute(ffSize,1)); ffGeo.setAttribute('aAlpha',new THREE.BufferAttribute(ffAlpha,1));
const ffMat=pointShader(true); ffMat.uniforms.uColor.value.set('#ffe27a'); const fireflies=new THREE.Points(ffGeo,ffMat); fireflies.frustumCulled=false; scene.add(fireflies);

/* ================= people: jointed limbs, faces, and real outfit details ================= */
const skins=['#eac39d','#dcaa7f','#c99168','#f1d0ad','#b98059'], hairs=['#1d1612','#2a1f18','#3b2a1e','#151515'];
const MATCACHE=new Map(); const pm=(c,side)=>{ const k=c+(side||''); if (!MATCACHE.has(k)) MATCACHE.set(k,lam(c,side?{side:THREE.DoubleSide}:{})); return MATCACHE.get(k); };
function capsule(r,len,mat){ const g=new THREE.CapsuleGeometry(r,Math.max(.01,len),3,8); g.translate(0,-(len/2+r),0); return new THREE.Mesh(g,mat); }
function buildPerson(o){
  const s=o.h/1.7, root=new THREE.Group(), hips=new THREE.Group(); root.add(hips);
  const TH=.4*s, SH=.4*s, FOOT=.06*s, HIPY=TH+SH+FOOT; hips.position.y=HIPY;
  const skin=pm(o.skin), top=pm(o.top), bot=pm(o.bottom), sleeve=pm(o.sleeve||o.top), shoe=pm(o.shoe||'#2a1f18'), trimM=pm(o.trim||'#2b2420');
  const legs=[1,-1].map(sx=>{ const hip=new THREE.Group(); hip.position.x=sx*.1*s; hips.add(hip);
    const th=capsule((o.wideLeg?.1:.085)*s,TH-.17*s,bot); th.castShadow=true; hip.add(th);
    const knee=new THREE.Group(); knee.position.y=-TH; hip.add(knee);
    const sh=capsule((o.wideLeg?.085:.07)*s,SH-.14*s,bot); sh.castShadow=true; knee.add(sh);
    const ft=new THREE.Mesh(new THREE.BoxGeometry(.11*s,.07*s,.23*s),shoe); ft.position.set(0,-SH-.005*s,.05*s); knee.add(ft);
    if (o.fit==='modern'){ const sole=new THREE.Mesh(new THREE.BoxGeometry(.115*s,.025*s,.235*s),pm('#f2efe8')); sole.position.set(0,-SH-.035*s,.05*s); knee.add(sole); }
    return {hip,knee}; });
  const flaps=[];
  if (o.skirt){ const k=o.skirt, hem=-HIPY*k+.03, hr=(.3+.1*k)*s;
    const m=new THREE.Mesh(new THREE.LatheGeometry([[.21*s,.05*s],[.25*s,-.06*s],[(.27+.06*k)*s,hem*.5],[hr,hem]].map(([r,y])=>new THREE.Vector2(r,y)),16),pm(o.skirtColor||o.top,true)); m.castShadow=true; hips.add(m);
    const band=new THREE.Mesh(new THREE.TorusGeometry(hr,.018*s,4,20),trimM); band.position.y=hem+.02*s; band.rotation.x=Math.PI/2; hips.add(band);
    if (o.fit==='robe'||o.fit==='monk'){ const slit=new THREE.Mesh(new THREE.BoxGeometry(.02*s,-hem*.9,.02*s),trimM); slit.position.set(.12*s,hem*.5,hr*.9); slit.rotation.x=-.1; hips.add(slit); } }
  if (o.flaps){ for (const sz of [1,-1]){ const f=new THREE.Group(); f.position.z=sz*.15*s; hips.add(f);
      const L=HIPY*.82, p=new THREE.Mesh(new THREE.BoxGeometry(.34*s,L,.015*s),top); p.position.y=-L/2+.05*s; f.add(p);
      for (const sx of [-1,1]){ const e=new THREE.Mesh(new THREE.BoxGeometry(.014*s,L,.02*s),trimM); e.position.set(sx*.17*s,-L/2+.05*s,0); f.add(e); }
      if (sz>0) for (let i=0;i<6;i++){ const fl=new THREE.Mesh(new THREE.SphereGeometry(.022*s,6,5),pm(i%2?'#f6c1d0':'#f3e3a8')); fl.position.set(R(-.11,.11)*s,-L*R(.45,.8),.012*s); f.add(fl); }
      flaps.push({f,sz}); } }
  const torso=new THREE.Group(); hips.add(torso);
  const TP=[[0,.19],[.1,.21],[.3,.235],[.44,.25],[.53,.23],[.6,.13],[.61,0]];
  const tm=new THREE.Mesh(new THREE.LatheGeometry([[0,0],...TP.map(([y,r])=>[r,y])].map(([r,y])=>new THREE.Vector2(r*s,y*s)),16),top); tm.castShadow=true; torso.add(tm);
  const fr=y=>{ for (let i=1;i<TP.length;i++) if (y<=TP[i][0]){ const [y0,r0]=TP[i-1],[y1,r1]=TP[i]; return lerp(r0,r1,(y-y0)/(y1-y0)); } return .13; };
  const deco=(w,h,d,mat,x,y,rz=0)=>{ const r=fr(y), zz=Math.sqrt(Math.max(.0004,r*r-x*x)); const m=new THREE.Mesh(new THREE.BoxGeometry(w*s,h*s,d*s),mat); m.position.set(x*s,y*s,(zz+.006)*s); m.rotation.set(0,Math.asin(clamp(x/r,-1,1)),rz); torso.add(m); return m; };
  const ring=(r,y,th,mat)=>{ const m=new THREE.Mesh(new THREE.TorusGeometry(r*s,th*s,4,18),mat); m.position.y=y*s; m.rotation.x=Math.PI/2; torso.add(m); return m; };
  if (o.fit==='robe'||o.fit==='monk'){ deco(.035,.34,.02,trimM,.055,.44,.33); deco(.035,.34,.02,trimM,-.055,.44,-.33); ring(.212,.1,.022,trimM); deco(.045,.15,.02,trimM,.09,.02,.1); deco(.045,.12,.02,trimM,.13,.03,.3); }
  if (o.fit==='aodai'){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.075*s,.085*s,.09*s,10),top); c.position.y=.63*s; torso.add(c);
    for (let i=0;i<5;i++) deco(.022,.022,.02,pm('#e8c15a'),.02+i*.045,.6-i*.04); deco(.2,.012,.02,trimM,.08,.58,-.7); }
  if (o.fit==='baba'){ for (let i=0;i<5;i++) deco(.022,.022,.02,pm('#d9d2c0'),0,.52-i*.1); for (const sx of [-1,1]){ deco(.1,.09,.012,pm(o.top),sx*.1,.14); deco(.1,.014,.02,trimM,sx*.1,.185); }
    const sc=new THREE.Mesh(new THREE.TorusGeometry(.1*s,.028*s,5,14),pm('#e9e2d0')); sc.position.y=.6*s; sc.rotation.x=Math.PI/2; torso.add(sc);
    for (let i=0;i<4;i++){ const d=new THREE.Mesh(new THREE.BoxGeometry(.02*s,.012*s,.06*s),pm('#2a2a2a')); d.position.set(Math.cos(i*1.57)*.1*s,.6*s,Math.sin(i*1.57)*.1*s); torso.add(d); } }
  if (o.fit==='modern'){ deco(.09,.05,.02,top,.05,.58,-.5); deco(.09,.05,.02,top,-.05,.58,.5); for (let i=0;i<4;i++) deco(.018,.018,.02,pm('#f4efe4'),0,.5-i*.11);
    ring(.196,.02,.026,pm('#3a2a1e')); deco(.05,.04,.02,pm('#d9aa4a'),0,.02); deco(.1,.1,.012,top,.1,.4); deco(.1,.014,.02,trimM,.1,.45); }
  if (o.sash){ const sm=pm(o.sash); const a=new THREE.Mesh(new THREE.BoxGeometry(.6*s,.11*s,.54*s),sm); a.position.y=.36*s; a.rotation.z=.62; torso.add(a);
    const d=new THREE.Mesh(new THREE.BoxGeometry(.22*s,.55*s,.03*s),sm); d.position.set(.12*s,.3*s,.24*s); d.rotation.z=.25; torso.add(d);
    for (let i=0;i<4;i++){ const st=new THREE.Mesh(new THREE.BoxGeometry(.23*s,.012*s,.035*s),trimM); st.position.y=(-.2+i*.13)*s; d.add(st); }
    const vs=new THREE.Mesh(new THREE.BoxGeometry(.012*s,.55*s,.035*s),trimM); d.add(vs);
    const hook=new THREE.Mesh(new THREE.TorusGeometry(.03*s,.01*s,4,8),pm('#d9aa4a')); hook.position.set(.1*s,.5*s,.2*s); torso.add(hook); }
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.055*s,.06*s,.1*s,8),skin); neck.position.y=.63*s; torso.add(neck);
  const head=new THREE.Group(); head.position.y=.68*s; torso.add(head);
  const hr=(o.kid?.15:.125)*s;
  const sk=new THREE.Mesh(new THREE.SphereGeometry(hr,14,12),skin); sk.scale.set(1,1.1,1.05); sk.position.y=hr; sk.castShadow=true; head.add(sk);
  const bit=(w,h,d,mat,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); head.add(m); return m; };
  for (const sx of [-1,1]){ bit(hr*.24,hr*.16,hr*.06,pm('#1b1410'),sx*hr*.36,hr*1.08,hr*1.0); bit(hr*.3,hr*.06,hr*.06,pm(o.bald?'#7d6a5c':o.hair),sx*hr*.36,hr*1.32,hr*.98);
    const e=new THREE.Mesh(new THREE.SphereGeometry(hr*.2,6,5),skin); e.scale.set(.6,1,1); e.position.set(sx*hr*1.0,hr*.98,0); head.add(e); }
  bit(hr*.18,hr*.3,hr*.2,skin,0,hr*.86,hr*1.06); bit(hr*.36,hr*.08,hr*.06,pm('#9a4a3a'),0,hr*.56,hr*.98);
  const hairM=pm(o.bald?'#8a7868':o.hair);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(hr*1.07,14,8,0,Math.PI*2,0,Math.PI*(o.bald?.4:.55)),hairM); cap.position.y=hr*1.06; cap.rotation.x=-.3; head.add(cap);
  if (o.style==='long'){ const b=new THREE.Mesh(new THREE.BoxGeometry(hr*1.7,hr*2.8,hr*.35),hairM); b.position.set(0,hr*.25,-hr*.78); head.add(b); }
  if (o.style==='bun'){ const b=new THREE.Mesh(new THREE.SphereGeometry(hr*.45,10,8),hairM); b.position.set(0,hr*1.35,-hr*.85); head.add(b); }
  if (o.hat){ const c=new THREE.Mesh(new THREE.ConeGeometry(hr*2.6,hr*1.4,18),pm('#e6d296')); c.position.y=hr*2.45; c.castShadow=true; head.add(c);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(hr*2.5,hr*.06,4,20),pm('#c9b06c')); rim.position.y=hr*1.8; rim.rotation.x=Math.PI/2; head.add(rim); }
  const arms=[1,-1].map(sx=>{ const sh=new THREE.Group(); sh.position.set(sx*.25*s,.55*s,0); torso.add(sh);
    const up=capsule(.055*s,.27*s-.11*s,sleeve); up.castShadow=true; sh.add(up);
    const el=new THREE.Group(); el.position.y=-.28*s; el.rotation.order='YXZ'; sh.add(el);
    el.add(capsule(.048*s,.25*s-.096*s,o.shortSleeve?skin:sleeve));
    if (o.shortSleeve){ const cuff=new THREE.Mesh(new THREE.TorusGeometry(.058*s,.012*s,4,10),sleeve); cuff.position.y=-.24*s; cuff.rotation.x=Math.PI/2; sh.add(cuff); }
    if (o.wideSleeve){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.06*s,.125*s,.18*s,12,1,true),pm(o.sleeve||o.top,true)); c.position.y=-.19*s; el.add(c);
      const cuff=new THREE.Mesh(new THREE.TorusGeometry(.125*s,.012*s,4,14),trimM); cuff.position.y=-.28*s; cuff.rotation.x=Math.PI/2; el.add(cuff); }
    const hand=new THREE.Mesh(new THREE.BoxGeometry(.06*s,.09*s,.035*s),skin); hand.position.y=-.29*s; el.add(hand); return {sh,el}; });
  if (o.beads){ const b=new THREE.Mesh(new THREE.TorusGeometry(.05*s,.012*s,5,12),pm('#5a2d14')); b.position.y=-.24*s; b.rotation.x=Math.PI/2; arms[0].el.add(b); }
  const inc=new THREE.Group(); inc.position.set(0,-.3*s,.02); arms[1].el.add(inc);
  for (let i=0;i<3;i++){ const st=new THREE.Mesh(new THREE.BoxGeometry(.02,.55*s,.02),pm('#c9463a')); st.position.set((i-1)*.03,.22*s,0); inc.add(st); const tp=new THREE.Mesh(new THREE.BoxGeometry(.04,.05,.04),MAT.tip); tp.position.set((i-1)*.03,.5*s,0); inc.add(tp); }
  inc.rotation.x=1.6; inc.visible=false;
  return {root,hips,torso,legs,arms,inc,flaps,HIPY,s,h:o.h};
}
const ARMS_PRAY={sh:-.32,shz:.1,el:-1.75,ely:.75};
const POSES={
  stand:{hip:1,th:0,kn:0,lz:0,torso:0,sh:.06,shz:.08,el:-.12,ely:0},
  pray:{hip:1,th:0,kn:0,lz:0,torso:.06,...ARMS_PRAY},
  bow:{hip:1,th:0,kn:0,lz:0,torso:.6,...ARMS_PRAY},
  kneel:{hip:.54,th:0,kn:1.57,lz:0,torso:.05,...ARMS_PRAY},
  prostrate:{hip:.54,th:0,kn:1.57,lz:0,torso:.05,...ARMS_PRAY},
  sit:{hip:.16,th:-1.45,kn:2.55,lz:.75,torso:0,sh:-.4,shz:.05,el:-1.0,ely:.55},
  preach:{hip:1,th:0,kn:0,lz:0,torso:0,sh:-.3,shz:.1,el:-1.6,ely:.4},
};
function applyPose(P,cur,walk,phase,dt,pose,t){
  const tgt={...POSES[pose]};
  if (pose==='prostrate'){ const c=.5-.5*Math.cos(t*2.1); tgt.torso=.05+1.3*c; tgt.sh=-.32-2.2*c; tgt.el=-1.75+1.6*c; tgt.ely=.75*(1-c); tgt.hip=.54-.08*c; }
  const k=1-Math.exp(-dt*7); for (const key in tgt) cur[key]=lerp(cur[key]??tgt[key],tgt[key],k);
  const sw=Math.sin(phase)*.5*walk;
  P.hips.position.y=P.HIPY*cur.hip+Math.abs(Math.cos(phase))*.03*walk*P.s;
  const [L,Rg]=P.legs;
  L.hip.rotation.x=cur.th+sw; Rg.hip.rotation.x=cur.th-sw; L.hip.rotation.z=cur.lz; Rg.hip.rotation.z=-cur.lz;
  L.knee.rotation.x=cur.kn+Math.max(0,Math.sin(phase))*.9*walk; Rg.knee.rotation.x=cur.kn+Math.max(0,-Math.sin(phase))*.9*walk;
  P.torso.rotation.x=cur.torso;
  const [A,B]=P.arms;
  A.sh.rotation.x=cur.sh-sw*.7; A.sh.rotation.z=-cur.shz; A.el.rotation.x=cur.el-walk*.2; A.el.rotation.y=-cur.ely;
  B.sh.rotation.x=cur.sh+sw*.7; B.sh.rotation.z=cur.shz; B.el.rotation.x=cur.el-walk*.2; B.el.rotation.y=cur.ely;
  if (pose==='preach'){ B.sh.rotation.x=-.9-.45*Math.max(0,Math.sin(t*1.3)); B.el.rotation.x=-.9; B.el.rotation.y=0; }
  for (const {f,sz} of P.flaps) f.rotation.x=sz*sw*.35;
}
function buildDog(color){
  const root=new THREE.Group(), m=lam(color), dk=lam('#3a2a1e'), body=new THREE.Group(); root.add(body);
  const bx=(w,h,d,mm,x,y,z)=>{ const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mm); q.position.set(x,y,z); q.castShadow=true; body.add(q); return q; };
  bx(.34,.3,.78,m,0,0,0); bx(.3,.3,.3,m,0,.06,.28); bx(.28,.26,.3,m,0,.2,.5); bx(.16,.13,.18,m,0,.13,.7); bx(.06,.05,.04,dk,0,.17,.79);
  for (const s of [-1,1]){ bx(.07,.13,.05,m,s*.1,.37,.45).rotation.z=s*.3; bx(.04,.04,.02,dk,s*.07,.25,.66); }
  const tail=bx(.06,.06,.34,m,0,.15,-.5); tail.rotation.x=-.7;
  const legs=[[.11,.3],[-.11,.3],[.11,-.3],[-.11,-.3]].map(([x,z])=>{ const p=new THREE.Group(); p.position.set(x,-.1,z); body.add(p); const g=new THREE.BoxGeometry(.09,.36,.09); g.translate(0,-.18,0); const q=new THREE.Mesh(g,m); q.castShadow=true; p.add(q); return p; });
  return {root,body,legs,tail};
}

const labelsEl=$('#labels');
function makeLabel(text,cls=''){ const d=document.createElement('div'); d.className='label '+cls; d.textContent=text; d.hidden=true; labelsEl.appendChild(d); return d; }
function makeBubble(cls=''){ const d=document.createElement('div'); d.className='bubble '+cls; d.hidden=true; labelsEl.appendChild(d); return d; }
const agents=[];
function angLerp(a,b,t){ const d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI; return a+d*t; }
function freeSpot(x0,x1,z0,z1){ for (let i=0;i<40;i++){ const x=R(x0,x1), z=R(z0,z1); if (!blocked(x,z,.6) && groundY(x,z)===0) return [x,z]; } return [0,5]; }
let me;
/* ================= street market left of the front path: food, offerings, motorbikes, xích lô ================= */
const MARKET_STALLS=[];   // rentable stalls; slot numbers match the stalls table (docs/STALLS.md)
(function market(){
  const M=new THREE.Group(); WORLD.add(M);
  const wood=pm('#8a5a34'), steel=pm('#c9ccd1'), dark=pm('#26221f'), white=pm('#efeae0'), red=pm('#c8322a'), gold=pm('#e5b53c');
  const place=(o,x,z,rot=0,parent=M)=>{ o.position.set(x,parent===M?groundY(x,z):0,z); o.rotation.y=rot; parent.add(o); return o; };
  const signMat=(text,bg)=>new THREE.MeshLambertMaterial({map:canvasTex(256,64,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h); g.fillStyle='#fff6dc'; g.font='bold 34px "Be Vietnam Pro",sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,w/2,h/2+2); },false)});
  const pile=(g,n,cols,x,y,z,r,spread)=>{ for (let i=0;i<n;i++) sph(r,pm(pick(cols)),x+R(-spread,spread),y+R(0,r),z+R(-spread*.5,spread*.5),g); };
  const person=(outfit,cols,x,z,rot,pose='stand',parent=M,y=0)=>{ const P=buildPerson(lookToBuild({outfit,color:pick(cols)})); applyPose(P,{},0,0,100,pose,0); place(P.root,x,z,rot,parent); P.root.position.y+=y; return P; };
  const BABA=['#7b2d26','#2f4a6d','#4a5a3a','#6b4a7a','#8a6a3a'], MODERN=['#3a6ea5','#c8562e','#2e7d5b','#7a4ea0','#d9a13a','#555b66'];
  // What each stall sells; goods sit on a table 0.8 m high and the vendor stands behind it.
  const KIND={
    pho:{label:'PHỞ',food:true,goods:g=>{ cyl(.28,.25,.45,steel,-.6,1.06,0,g,14); cyl(.29,.29,.03,steel,-.6,1.3,0,g,14); for (let i=0;i<4;i++) cyl(.1,.07,.06,white,.15+i*.24,.87,.2,g,10); pile(g,6,['#4e9a3a','#6cb04a'],.5,.88,-.2,.07,.25); }},
    banhmi:{label:'BÁNH MÌ',food:true,goods:g=>{ box(1.3,.5,.6,pm('#cfe2ea'),.1,1.09,-.05,g); for (let i=0;i<6;i++) sph(1,pm('#d9a05b'),-.4+i*.2,1.38,-.05,g,.05,.05,.24); }},
    che:{label:'CHÈ',food:true,goods:g=>{ const c=['#7cc26b','#b0473c','#f0d35a','#f5f1e6','#8a5a9a','#e98a3a']; for (let i=0;i<12;i++) cyl(.09,.09,.22,pm(c[i%6]),-.9+(i%6)*.36,.95,i<6?-.2:.2,g,10); }},
    nuong:{label:'NƯỚNG',food:true,goods:g=>{ box(1.4,.18,.5,dark,0,.93,0,g); box(1.3,.03,.42,pm('#d8452a'),0,1.03,0,g); for (let i=0;i<9;i++) box(.04,.04,.5,pm('#9a4a22'),-.55+i*.14,1.07,0,g); }},
    fruit:{label:'TRÁI CÂY',goods:g=>{ pile(g,10,['#f2c12e','#e8a020'],-.7,.9,0,.1,.25); pile(g,8,['#e0457b','#c93a6a'],0,.9,0,.11,.22); pile(g,10,['#f08a24','#7cb342'],.7,.9,0,.09,.25); }},
    incense:{label:'NHANG ĐÈN',goods:g=>{ for (let i=0;i<5;i++) cyl(.06,.06,.42,pm(i%2?'#c8322a':'#e0a030'),-.9+i*.2,1.05,-.15,g,8); for (let i=0;i<8;i++) cyl(.04,.04,.18,red,.1+(i%4)*.16,.93,i<4?-.15:.15,g,8); for (let i=0;i<3;i++) box(.32,.1,.22,gold,-.7+i*.36,.89,.25,g); }},
    flowers:{label:'HOA TƯƠI',goods:g=>{ const c=['#f39a1c','#f2d23a','#f2a2b8','#f7f3ea','#d8452a']; for (let i=0;i<5;i++){ cyl(.17,.13,.3,pm('#5a6b7a'),-.9+i*.45,.99,0,g,10); pile(g,7,[c[i]],-.9+i*.45,1.18,0,.08,.13); } for (const sx of [-1,1]){ cyl(.2,.16,.4,pm('#5a6b7a'),sx*.9,.2,.85,g,10); pile(g,8,[pick(c)],sx*.9,.45,.85,.09,.15); } }},
    offerings:{label:'ĐỒ CÚNG',goods:g=>{ for (let i=0;i<3;i++){ cyl(.28,.24,.05,gold,-.7+i*.7,.86,0,g,14); pile(g,7,['#f2c12e','#7cb342','#e0457b','#f08a24'],-.7+i*.7,.92,0,.08,.12); } for (let i=0;i<4;i++) box(.3,.05,.2,pm(i%2?'#e5b53c':'#c8322a'),-.9+i*.6,.87,.32,g); }},
  };
  function stall(x,z,rot,kind){ const g=place(new THREE.Group(),x,z,rot), col=pick(['#c8322a','#2f6db3','#e0a82e','#3d8a4f','#d9572b']);
    box(2.4,.08,1,wood,0,.8,0,g); for (const sx of [-1,1]) for (const sz of [-1,1]){ box(.07,.8,.07,wood,sx*1.12,.4,sz*.44,g); cyl(.03,.03,2.4,steel,sx*1.4,1.2,sz*.8,g,6); }
    const roof=box(3,.06,1.9,pm(col),0,2.4,0,g); roof.rotation.x=-.08; box(3,.25,.03,pm(col),0,2.28,.96,g);
    const s=add(new THREE.Mesh(new THREE.PlaneGeometry(1.6,.4),signMat(KIND[kind].label,col)),g); s.position.set(0,2.0,.98);
    KIND[kind].goods(g);
    person('baba',BABA,0,-.85,0,'stand',g);
    if (KIND[kind].food) for (const sx of [-.7,.7]){ box(.32,.3,.32,pm(pick(['#d33a2c','#2f6db3'])),sx,.15,1.6,g); if (rnd()<.75) person('modern',MODERN,sx,1.6,Math.PI,'sit',g,.18); }
    obBox(x-1.6,x+1.6,z-1.1,z+1.1); }
  function moto(x,z,rot){ const g=place(new THREE.Group(),x,z,rot), c=pm(pick(['#c8322a','#1f1f22','#2f6db3','#e8e4dc','#9aa0a8','#3d8a4f']));
    for (const wx of [-.6,.6]){ const w=add(new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.1,14),dark),g); w.rotation.x=Math.PI/2; w.position.set(wx,.3,0); }
    box(1,.32,.28,c,0,.62,0,g); const nose=box(.25,.6,.3,c,.6,.78,0,g); nose.rotation.z=-.25; box(.62,.1,.3,dark,-.15,.84,0,g);
    box(.05,.05,.62,dark,.7,1.1,0,g); sph(.07,white,.78,.96,0,g); box(.3,.06,.2,steel,-.62,.55,0,g); }
  function xichlo(x,z,rot){ const g=place(new THREE.Group(),x,z,rot), seat=pm('#c42a2a'), fringe=pm('#f2c230');
    for (const sx of [-1,1]){ const w=add(new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.06,16),steel),g); w.rotation.z=Math.PI/2; w.position.set(sx*.5,.32,.45); }
    const rw=add(new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.06,16),steel),g); rw.rotation.z=Math.PI/2; rw.position.set(0,.34,-1.05);
    box(.85,.28,.65,steel,0,.42,.45,g); box(.8,.14,.55,seat,0,.62,.42,g); const back=box(.8,.6,.12,seat,0,.92,.14,g); back.rotation.x=-.2;
    for (const sx of [-1,1]) box(.06,.22,.5,steel,sx*.43,.76,.45,g);
    box(.7,.04,.35,steel,0,.24,.95,g);
    const cnp=box(.95,.04,.8,seat,0,1.5,.42,g); cnp.rotation.x=.1; box(.95,.1,.02,fringe,0,1.42,.83,g);
    for (const sx of [-1,1]){ box(.02,.1,.8,fringe,sx*.48,1.44,.42,g); cyl(.015,.015,.9,steel,sx*.42,1.05,.1,g,6); }
    box(.06,.06,1.1,steel,0,.62,-.5,g); box(.25,.07,.12,dark,0,1.05,-.62,g); cyl(.02,.02,.5,steel,0,.82,-.62,g,6); box(.55,.04,.04,steel,0,1.08,-.1,g); }
  // Paved market street, with a walkway across to the front path.
  const st=add(new THREE.Mesh(new THREE.PlaneGeometry(40,9),MAT.slab),M,false,true); st.rotation.x=-Math.PI/2; st.position.set(-40,.03,48);
  const wk=add(new THREE.Mesh(new THREE.PlaneGeometry(16,3),MAT.slab),M,false,true); wk.rotation.x=-Math.PI/2; wk.position.set(-12.5,.03,48);
  const rowA=['pho','banhmi','incense','che','flowers','nuong'], rowB=['fruit','offerings','pho','incense','flowers','che'];
  for (let i=0;i<6;i++){ stall(-56+i*6,43,0,rowA[i]); stall(-56+i*6,53,Math.PI,rowB[i]); MARKET_STALLS.push({slot:i,x:-56+i*6,z:44.7},{slot:6+i,x:-56+i*6,z:51.3}); }   // x,z: where a customer stands
  for (let i=0;i<9;i++) person(pick(['modern','modern','aodai','baba']),MODERN,R(-57,-23),R(46.3,49.7),R(0,Math.PI*2));   // shoppers in the street
  for (const [z0,z1] of [[38,45.5],[50.5,60]]) for (const x of [-12.5,-16.5]){ for (let z=z0;z<=z1;z+=1.05) moto(x,z,Math.PI+R(-.18,.18)); obBox(x-1,x+1,z0-.5,z1+.5); }
  for (let i=0;i<6;i++){ xichlo(-52+i*2.4,35.5,0); if (i%2===0) person('modern',['#4a5a3a','#2f4a6d','#6b5a3a'],-52+i*2.4,35.9,0,'sit',M,.55); }   // drivers resting in their own seats
  obBox(-53.5,-38.5,34,37);
  person('robe',['#8a5a2a'],FORTUNE_POS.x,FORTUNE_POS.z-1.05,0,'sit',M,.45);   // the fortune teller (thầy giải xăm) at the xin xăm stall
  mergeStatic(M);
})();

/* ================= computer-run visitors on a shared timetable =================
   Every monk, visitor, kid and the dog follows a plan worked out from (world seed, their
   number, time slot). In a live courtyard the seed and clock come from the server, so every
   browser shows the same people in the same places, and nothing extra is sent. */
function h32(a,b,c){ let x=Math.imul(a|0,0x27d4eb2d)^Math.imul(b|0,0x165667b1)^Math.imul((c|0)+0x9e37,0x1b873593); x=Math.imul(x^(x>>>15),0x2c1b3c6d); x=Math.imul(x^(x>>>12),0x297a2d39); x^=x>>>15; return (x>>>0)/4294967296; }
const WORLD_CLOCK={ seed:9101, now(){ return (typeof net!=='undefined'&&net.state==='live')?net.now()/1000:Date.now()/1000; } };

// ---- walking map: courtyard grid plus stairs, doors and spots inside the halls ----
const NAV={pts:[],adj:[],cache:new Map()};
function navAdd(x,z){ NAV.pts.push([x,z]); NAV.adj.push([]); return NAV.pts.length-1; }
function navLink(i,j){ if (i===j||NAV.adj[i].includes(j)) return; NAV.adj[i].push(j); NAV.adj[j].push(i); }
function segFree(a,b,r=.32){ const [x0,z0]=a,[x1,z1]=b, n=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/.4)); for (let i=1;i<n;i++){ const t=i/n, x=x0+(x1-x0)*t, z=z0+(z1-z0)*t; if (blocked(x,z,r)||groundY(x,z)!==0) return false; } return true; }
function navAttach(i,max=3){ const p=NAV.pts[i]; const near=GRID_NODES.map(j=>[Math.hypot(NAV.pts[j][0]-p[0],NAV.pts[j][1]-p[1]),j]).sort((a,b)=>a[0]-b[0]); let n=0; for (const [d,j] of near){ if (d>9) break; if (segFree(p,NAV.pts[j])){ navLink(i,j); if (++n>=max) break; } } }
const GRID_NODES=[];
for (let x=-27.5;x<=27.6;x+=2.5) for (let z=-6;z<=20.1;z+=2.5){ if (!blocked(x,z,.6)&&groundY(x,z)===0) GRID_NODES.push(navAdd(x,z)); }
for (let a=0;a<GRID_NODES.length;a++) for (let b=a+1;b<GRID_NODES.length;b++){ const i=GRID_NODES[a], j=GRID_NODES[b], d=Math.hypot(NAV.pts[i][0]-NAV.pts[j][0],NAV.pts[i][1]-NAV.pts[j][1]); if (d<3.6&&segFree(NAV.pts[i],NAV.pts[j])) navLink(i,j); }
const GATE_NODES=[22,25,29,33,37,41,44].map(z=>navAdd(0,z));
for (let i=1;i<GATE_NODES.length;i++) navLink(GATE_NODES[i-1],GATE_NODES[i]);
navAttach(GATE_NODES[0],3);
const DOG_GATE=GATE_NODES[GATE_NODES.length-1];
const URN_NODES=Array.from({length:8},(_,i)=>{ const a=i/8*Math.PI*2; const n=navAdd(URN.x+Math.cos(a)*2.1,URN.z+Math.sin(a)*2.1); navAttach(n,2); return n; }).filter(n=>NAV.adj[n].length);
const BELL_NODE=navAdd(BELLPOS.x-2.4,BELLPOS.z+.3); navAttach(BELL_NODE,2);
const POND_NODES=[10.5,12,13.5].map(x=>{ const n=navAdd(x,5.9); navAttach(n,2); return n; });
const LISTEN_NODES=[[7.6,-5.2],[9,-5.3],[10.4,-5.2],[11.6,-4.9],[8.2,-4],[10,-3.9]].map(([x,z])=>{ const n=navAdd(x,z); navAttach(n,2); return n; }).filter(n=>NAV.adj[n].length);
const HALL={};  // building index -> {spots:[node], cushions:[node], monk:[node]}
BUILDINGS.slice(0,5).forEach((b,bi)=>{
  const w=(lx,lz)=>l2w(b,lx,lz);
  const bottom=navAdd(...w(0,b.pd/2+b.run+.9)); navAttach(bottom,3);
  const top=navAdd(...w(0,b.pd/2-.5)); navLink(bottom,top);
  const tz=b.bz+3.13, inZ=Math.max(tz+.9,b.fz-.9);
  const ins=b.doorXs.map(dx=>{ const out=navAdd(...w(dx,b.fz+.8)); navLink(top,out); const inn=navAdd(...w(dx,inZ)); navLink(out,inn); return inn; });
  const nearestIn=(lx)=>ins[b.doorXs.reduce((bi2,dx,i)=>Math.abs(dx-lx)<Math.abs(b.doorXs[bi2]-lx)?i:bi2,0)];
  const H={spots:[],cushions:[],monk:[]};
  if (b===MAINHALL){
    for (const c of CUSHIONS){ const [lx,lz]=w2l(b,c.x,c.z); const n=navAdd(...w(lx,lz+.15)); navLink(nearestIn(lx),n); H.cushions.push(n); }
    for (const lx of [-1.5,-.5,.5,1.5]){ const n=navAdd(...w(lx,-.7)); navLink(nearestIn(lx),n); H.monk.push(n); }
  } else {
    for (const lx of [-1.2,0,1.2]){ const n=navAdd(...w(lx,inZ+.02)); navLink(ins[0],n); H.spots.push(n); }
    H.monk=H.spots;
  }
  HALL[bi]=H;
});
function navNearest(x,z){ let best=GRID_NODES[0], bd=1e9; for (const j of GRID_NODES){ const d=Math.hypot(NAV.pts[j][0]-x,NAV.pts[j][1]-z); if (d<bd){ bd=d; best=j; } } return best; }
function navPath(a,b){
  const key=a*4096+b; if (NAV.cache.has(key)) return NAV.cache.get(key);
  const n=NAV.pts.length, dist=new Float64Array(n).fill(Infinity), prev=new Int32Array(n).fill(-1), done=new Uint8Array(n); dist[a]=0;
  for (;;){ let u=-1, ud=Infinity; for (let i=0;i<n;i++) if (!done[i]&&dist[i]<ud){ ud=dist[i]; u=i; } if (u<0||u===b) break; done[u]=1;
    for (const v of NAV.adj[u]){ const d=ud+Math.hypot(NAV.pts[u][0]-NAV.pts[v][0],NAV.pts[u][1]-NAV.pts[v][1]); if (d<dist[v]){ dist[v]=d; prev[v]=u; } } }
  const out=[]; if (dist[b]===Infinity){ out.push(NAV.pts[a],NAV.pts[b]); } else { for (let v=b;v!==-1;v=prev[v]) out.push(NAV.pts[v]); out.reverse(); }
  NAV.cache.set(key,out); if (NAV.cache.size>3000) NAV.cache.delete(NAV.cache.keys().next().value); return out;
}
function polyAt(pts,lens,total,d){ if (d<=0) return [pts[0][0],pts[0][1],pts.length>1?Math.atan2(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1]):0]; let acc=0;
  for (let i=1;i<pts.length;i++){ const L=lens[i-1]; if (acc+L>=d||i===pts.length-1){ const t=L>0?Math.min(1,(d-acc)/L):1, a=pts[i-1], b=pts[i]; return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,Math.atan2(b[0]-a[0],b[1]-a[1])]; } acc+=L; }
  return [pts[pts.length-1][0],pts[pts.length-1][1],0]; }
function route(pts){ const lens=[]; let total=0; for (let i=1;i<pts.length;i++){ const L=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); lens.push(L); total+=L; } return {pts,lens,total}; }

// ---- plans ----
const NPC_SLOT={visitor:40,monk:50,kid:10};
const faceTo=(x,z,tx,tz)=>Math.atan2(tx-x,tz-z);
function npcPlan(a,k){
  if (a.plans.has(k)) return a.plans.get(k);
  const r=n=>h32(WORLD_CLOCK.seed+a.idx*7919,k,n), pickN=(arr,n)=>arr[Math.floor(r(n)*arr.length)%arr.length];
  const at=n=>NAV.pts[n];
  let node, acts=[], jit=.35;
  if (a.kind==='visitor'){
    const c=r(0);
    if (c<.24&&URN_NODES.length){ node=pickN(URN_NODES,1); const [x,z]=at(node), f=faceTo(x,z,URN.x,URN.z); jit=.1;
      acts=[{pose:'stand',dur:.6,face:f,inc:true},{pose:'pray',dur:5,face:f,inc:true},{pose:'bow',dur:.9,face:f,inc:true},{pose:'pray',dur:.7,face:f,inc:true},{pose:'bow',dur:.9,face:f,inc:true},{pose:'pray',dur:.7,face:f,inc:true},{pose:'bow',dur:.9,face:f,inc:true},{pose:'stand',dur:.5,face:f,ev:'burst'}]; }
    else if (c<.48){ const cs=HALL[0].cushions; node=cs[(a.idx+k*7)%cs.length]; const f=MAINHALL.rot+Math.PI; jit=0;
      acts=[{pose:'pray',dur:1.5,face:f},{pose:'kneel',dur:3,face:f},{pose:'prostrate',dur:6+r(2)*4,face:f},{pose:'kneel',dur:3,face:f}]; }
    else if (c<.68){ const bi=1+Math.floor(r(1)*4), b=BUILDINGS[bi]; node=pickN(HALL[bi].spots,2); const f=b.rot+Math.PI; jit=.12;
      acts=[{pose:'pray',dur:3+r(3)*2,face:f},{pose:'bow',dur:1.2,face:f},{pose:r(4)<.5?'kneel':'pray',dur:4+r(5)*3,face:f}]; }
    else if (c<.77&&LISTEN_NODES.length){ node=pickN(LISTEN_NODES,1); const [x,z]=at(node); jit=.2; acts=[{pose:'sit',dur:14+r(2)*10,face:faceTo(x,z,9,-8.8)}]; }
    else if (c<.84){ node=pickN(POND_NODES,1); jit=.3; acts=[{pose:'stand',dur:4+r(2)*4,face:0}]; }
    else { node=pickN(GRID_NODES,1); acts=[{pose:r(2)<.3?'pray':'stand',dur:2+r(3)*4}]; }
  } else if (a.kind==='monk'){
    const c=r(0);
    if (c<.42){ node=pickN(GRID_NODES,1); acts=[{pose:'pray',dur:3+r(2)*3}]; }
    else if (c<.8){ const bi=Math.floor(r(1)*5), b=BUILDINGS[bi]; node=pickN(HALL[bi].monk,2); const f=b.rot+Math.PI; jit=.08; acts=[{pose:'pray',dur:5+r(3)*4,face:f},{pose:'bow',dur:1.3,face:f}]; }
    else { node=BELL_NODE; jit=.05; acts=[{pose:'pray',dur:2,face:Math.PI/2},{pose:'stand',dur:1,face:Math.PI/2,ev:'bell'},{pose:'bow',dur:1.4,face:Math.PI/2}]; }
  } else { // kid running wild
    node=pickN(GRID_NODES,1); jit=.6; if (r(2)<.3) acts=[{pose:'stand',dur:.4+r(3)*1.2}];
  }
  const [nx,nz]=at(node), ang=r(9)*Math.PI*2;
  const end=jit?[nx+Math.cos(ang)*jit*r(8),nz+Math.sin(ang)*jit*r(8)]:[nx,nz];
  const p={node,acts,end};
  a.plans.set(k,p); if (a.plans.size>4) a.plans.delete(a.plans.keys().next().value);
  return p;
}
function npcState(a,t){
  const S=NPC_SLOT[a.kind], k=Math.floor(t/S), tau=t-k*S, prev=npcPlan(a,k-1), cur=npcPlan(a,k);
  if (a.routeKey!==k){ a.routeKey=k; a.route=route([prev.end,...navPath(prev.node,cur.node),cur.end]); }
  const R0=a.route, walkT=Math.min(R0.total/a.speed,S*.85);
  if (tau<walkT){ const [x,z,h]=polyAt(R0.pts,R0.lens,R0.total,R0.total*tau/walkT); return {x,z,h,walking:true,pose:'stand',poseT:0,inc:false,k,actStart:walkT}; }
  let u=tau-walkT, lastH=polyAt(R0.pts,R0.lens,R0.total,R0.total)[2];
  for (const act of cur.acts){ if (u<act.dur) return {x:cur.end[0],z:cur.end[1],h:act.face??lastH,walking:false,pose:act.pose,poseT:u,inc:!!act.inc,k}; u-=act.dur; }
  return {x:cur.end[0],z:cur.end[1],h:lastH,walking:false,pose:'stand',poseT:u,inc:false,k};
}
function npcEvents(a,t){
  const S=NPC_SLOT[a.kind], k=Math.floor(t/S), tau=t-k*S;
  if (a.evK!==k){ a.evK=k; a.evTau=tau; return; }
  const cur=npcPlan(a,k), walkT=Math.min((a.route?.total||0)/a.speed,S*.85); let s=walkT;
  for (const act of cur.acts){ if (act.ev&&s>a.evTau&&s<=tau){ if (act.ev==='burst') urnBurst(); else if (act.ev==='bell') ringBell(false); } s+=act.dur; }
  a.evTau=tau;
}

class Agent{
  constructor(kind,look,name){ this.kind=kind; this.idx=agents.length; this.P=buildPerson(look); scene.add(this.P.root); this.col=new THREE.Color(look.top||'#888888');
    this.pos=new THREE.Vector3(); this.heading=0; this.speed=kind==='kid'?R(2.8,3.6):kind==='monk'?R(.8,1):R(1,1.35);
    this.cur={}; this.phase=rnd()*6; this.walk=0; this.pose='stand'; this.poseT=0; this.active=true; this.chatCool=R(0,10); this.plans=new Map(); this.snap=true;
    this.name=name; this.label=name?makeLabel(name,kind==='monk'?'monk':''):null; this.chatting=false; }
  place(x,z){ this.pos.set(x,groundY(x,z),z); }
  reset(){ this.plans.clear(); this.routeKey=null; this.snap=true; }
  update(dt){
    this.chatCool-=dt;
    if (!this.active) return;
    const t=WORLD_CLOCK.now();
    let s;
    if (this.preacher) s={x:9,z:-8.7,h:0,walking:false,pose:'preach',poseT:t%60,inc:false};
    else if (this.calm&&this.parent){ const p=this.parent, ps=p.lastState||{x:p.pos.x,z:p.pos.z,h:p.heading,walking:false,pose:'stand',poseT:0};
      const ox=Math.cos(ps.h)*.8+Math.sin(ps.h)*.4, oz=-Math.sin(ps.h)*.8+Math.cos(ps.h)*.4;
      s={x:ps.x+ox,z:ps.z+oz,h:ps.h,walking:ps.walking,pose:ps.walking?'stand':(['kneel','prostrate'].includes(ps.pose)?'kneel':ps.pose==='bow'?'bow':ps.pose==='sit'?'sit':'pray'),poseT:ps.poseT,inc:false}; }
    else { s=npcState(this,t); npcEvents(this,t); }
    this.lastState=s;
    if (this.chatting){ this.heading=angLerp(this.heading,Math.atan2(me.pos.x-this.pos.x,me.pos.z-this.pos.z),1-Math.exp(-dt*6)); this.walk=lerp(this.walk,0,1-Math.exp(-dt*8)); }
    else {
      const k=this.snap?1:1-Math.exp(-dt*9); this.snap=false;
      this.pos.x=lerp(this.pos.x,s.x,k); this.pos.z=lerp(this.pos.z,s.z,k);
      this.heading=angLerp(this.heading,s.h,k===1?1:1-Math.exp(-dt*8));
      this.walk=lerp(this.walk,s.walking?1:0,1-Math.exp(-dt*8));
      this.pose=s.pose; this.poseT=s.poseT;
    }
    this.phase+=dt*this.speed*4.2*(this.walk>.5?1:0);
    this.pos.y=lerp(this.pos.y,groundY(this.pos.x,this.pos.z),1-Math.exp(-dt*12));
    this.P.root.position.copy(this.pos); this.P.root.rotation.y=this.heading;
    applyPose(this.P,this.cur,this.walk,this.phase,dt,this.walk>.5?'stand':this.pose,this.poseT);
    const inc=!this.chatting&&s.inc;
    this.P.inc.visible=inc; if (inc&&rnd()<dt*3){ const v=new THREE.Vector3(); this.P.inc.getWorldPosition(v); emit(v.x,v.y+.5,v.z,1,.04,.25); }
  }
}

const VNAMES=['An','Minh','Tuấn','Lan','Hoa','Bảo','Thảo','Long','Mai','Phúc','Hạnh','Dũng','Ngọc','Vy','Hùng','Trang','Quân','Linh','Sơn','Yến'];
const AODAI=['#b8322a','#3a5fa8','#efe8da','#d9a43a','#7b5aa6','#2f8a76','#d46a8a'];
function visitorLook(){
  const kind=pick(['aotrang','aotrang','aodai','modern','modern','elder','baba']), skin=pick(skins), hair=pick(hairs);
  if (kind==='aotrang') return {fit:'robe',h:R(1.55,1.72),skin,hair,top:pick(['#8f918b','#7a6a58']),bottom:'#5b5a55',trim:'#3b3a36',skirt:.92,wideSleeve:true,style:rnd()<.5?'bun':'short',beads:rnd()<.6};
  if (kind==='aodai'){ const c=pick(AODAI); return {fit:'aodai',h:R(1.58,1.7),skin,hair,top:c,bottom:'#f2efe6',trim:'#e8c15a',flaps:true,wideLeg:true,style:rnd()<.6?'long':'bun',hat:rnd()<.25}; }
  if (kind==='elder') return {fit:'robe',h:R(1.5,1.62),skin,hair:'#b9b4ad',top:pick(['#6b4c33','#4a4c5a','#7a2f2a']),bottom:'#2b2a2a',trim:'#1f1a16',skirt:.85,wideSleeve:true,style:'bun',hat:rnd()<.4,beads:true};
  if (kind==='baba') return {fit:'baba',h:R(1.55,1.7),skin,hair,top:pick(['#3a2a22','#5a3d2a','#d8cdb4']),bottom:'#1f1a17',trim:'#1a1612',skirt:.3,wideLeg:true,hat:rnd()<.5,style:'short'};
  return {fit:'modern',h:R(1.6,1.78),skin,hair,top:pick(['#e9e4d8','#3d6aa0','#c44b3b','#2e5e4e','#d9b44a','#6d4a8a']),bottom:pick(['#2d3e5e','#3a3a3a','#7a6a52']),trim:'#2a2420',shortSleeve:true,style:'short',shoe:'#f2efe8'};
}
const MONKS=[
  ['Hòa thượng Tâm Minh',{fit:'monk',h:1.66,skin:'#d9a982',bald:true,top:'#cf8f24',bottom:'#6e4527',trim:'#7a4a14',skirt:.95,skirtColor:'#cf8f24',sash:'#9c4a1c',wideSleeve:true,beads:true}],
  ['Thượng tọa Quảng Huệ',{fit:'monk',h:1.7,skin:'#e0b48c',bald:true,top:'#6e4527',bottom:'#5a3820',trim:'#3a2412',skirt:.95,sash:'#c9862a',wideSleeve:true,beads:true}],
  ['Đại đức Nhuận Tâm',{fit:'monk',h:1.72,skin:'#cf9a70',bald:true,top:'#6b4428',bottom:'#5a3820',trim:'#3a2412',skirt:.95,wideSleeve:true,beads:true}],
  ['Sư cô Diệu Hạnh',{fit:'monk',h:1.6,skin:'#ecc6a2',bald:true,top:'#8a8580',bottom:'#6d6862',trim:'#4a4642',skirt:.95,wideSleeve:true,beads:true}],
  ['Chú tiểu Minh Thiện',{fit:'monk',h:1.25,kid:true,skin:'#e3b48a',bald:true,top:'#7b5a3a',bottom:'#7b5a3a',trim:'#4a3220',skirt:.9}],
];
MONKS.forEach(([name,look],i)=>{ const a=new Agent('monk',look,name); if (i===1){ a.preacher=true; a.place(9,-8.7); a.heading=0; } else { const [x,z]=freeSpot(-20,20,-4,16); a.place(x,z); } agents.push(a); });
const PREACHER=agents[1];
for (let i=0;i<30;i++){ const a=new Agent('visitor',visitorLook(),i<VNAMES.length?VNAMES[i]:null); const [x,z]=freeSpot(-25,25,-4,20); a.place(x,z); a.heading=rnd()*6; agents.push(a); }
const KIDLOOK=()=>({fit:'modern',h:R(1,1.2),kid:true,skin:pick(skins),hair:pick(hairs),top:pick(['#f2b134','#e2523d','#4c9be0','#5cbf79','#f08fb0']),bottom:pick(['#2d3e5e','#e9e4d8','#3a3a3a']),shortSleeve:true,style:'short',shoe:'#f2efe8'});
['Bin','Na','Tí','Bông','Su'].forEach((n,i)=>{ const a=new Agent('kid',KIDLOOK(),n); const [x,z]=freeSpot(-20,20,0,18); a.place(x,z); if (i===4){ a.calm=true; a.speed=1.2; a.parent=agents[8]; } agents.push(a); });
const DOG=(()=>{ const D=buildDog(pick(['#c99a5b','#d8b07a'])); scene.add(D.root); return {D,pos:V3(0,0,44),heading:Math.PI,phase:0,happy:0,snap:true,lastBarkK:-1}; })();
const DOG_SLOT=110;
function dogState(t){
  const k=Math.floor(t/DOG_SLOT), tau=t-k*DOG_SLOT, r=n=>h32(WORLD_CLOCK.seed+4243,k,n), pickG=n=>GRID_NODES[Math.floor(r(n)*GRID_NODES.length)%GRID_NODES.length];
  const A=pickG(1), B=pickG(2), legs=[[DOG_GATE,A,2.4],[A,B,2.0]], lie=16+r(3)*8;
  let tt=tau-12;
  if (tt<0) return {away:true};
  for (const [f,to,sp] of legs){ const rt=route(navPath(f,to)), d=rt.total/sp; if (tt<d){ const [x,z,h]=polyAt(rt.pts,rt.lens,rt.total,tt*sp); return {x,z,h,moving:true,k}; } tt-=d; }
  const [bx,bz]=NAV.pts[B];
  if (tt<lie) return {x:bx,z:bz,h:r(4)*6.28,lie:true,k,barkAt:tt<.05};
  tt-=lie;
  const back=route(navPath(B,DOG_GATE)), d=back.total/2.2;
  if (tt<d){ const [x,z,h]=polyAt(back.pts,back.lens,back.total,tt*2.2); return {x,z,h,moving:true,k}; }
  return {away:true};
}
function updateDog(dt,t){
  const d=DOG, D=d.D; d.happy-=dt;
  const s=dogState(WORLD_CLOCK.now());
  if (s.away){ D.root.visible=false; d.snap=true; return; }
  D.root.visible=true;
  if (d.happy>0){ d.heading=angLerp(d.heading,Math.atan2(me.pos.x-d.pos.x,me.pos.z-d.pos.z),1-Math.exp(-dt*5)); }
  else { const k=d.snap?1:1-Math.exp(-dt*9); d.snap=false; d.pos.x=lerp(d.pos.x,s.x,k); d.pos.z=lerp(d.pos.z,s.z,k); d.heading=angLerp(d.heading,s.h,k===1?1:1-Math.exp(-dt*7)); }
  if (s.lie&&d.lastBarkK!==s.k){ d.lastBarkK=s.k; if (h32(WORLD_CLOCK.seed,s.k,77)<.5) bark(d.pos); }
  const moving=!!s.moving&&d.happy<=0, lie=!!s.lie&&d.happy<=0;
  d.phase+=dt*(moving?11:0);
  D.root.position.copy(d.pos); D.root.rotation.y=d.heading;
  D.body.position.y=lerp(D.body.position.y||.46,lie?.2:.46,1-Math.exp(-dt*5));
  D.legs.forEach((l,i)=>{ l.rotation.x=lie?(i<2?-1.4:1.4):Math.sin(d.phase+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*.6*(moving?1:0); });
  D.tail.rotation.y=Math.sin(t*(d.happy>0?16:lie?2:9))*.5;
}

/* ================= player ================= */
const OUTFIT_COLORS={aotrang:['#8f918b','#6b4c33','#5a5d66','#a59a87'],aodai:['#b8322a','#3a5fa8','#efe8da','#d9a43a','#7b5aa6','#2f8a76'],baba:['#3a2a22','#5a3d2a','#d8cdb4','#2f3a4a'],modern:['#e9e4d8','#3d6aa0','#c44b3b','#2e5e4e','#d9b44a']};
me={name:'',outfit:'aotrang',color:'#8f918b',P:null,pos:V3(0,0,30),heading:Math.PI,cur:{},phase:0,walk:0,pose:'stand',poseT:0,incenseT:0,label:null,entered:false,deedT:0};
function playerLook(){ const c=me.color, base={h:1.68,skin:'#e3b48e',hair:'#1d1612'};
  if (me.outfit==='aotrang') return {...base,fit:'robe',top:c,bottom:'#4b4a46',trim:'#2f2d2a',skirt:.92,wideSleeve:true,style:'bun',beads:true};
  if (me.outfit==='aodai') return {...base,fit:'aodai',top:c,bottom:'#f3efe6',trim:'#e8c15a',flaps:true,wideLeg:true,style:'long'};
  if (me.outfit==='baba') return {...base,fit:'baba',top:c,bottom:'#1f1a17',trim:'#14100d',skirt:.3,wideLeg:true,hat:true,style:'short'};
  return {...base,fit:'modern',top:c,bottom:'#2d3e5e',trim:'#2a2420',shortSleeve:true,style:'short',shoe:'#f2efe8'}; }
function rebuildPlayer(){ if (me.P) scene.remove(me.P.root); me.P=buildPerson(playerLook()); scene.add(me.P.root); me.cur={}; }
rebuildPlayer();

/* ================= blessings: Bodhi leaves and temple gifts ================= */
const GIFTS=[['Tràng hạt gỗ','Wooden prayer beads'],['Bùa bình an','Peace charm'],['Hoa sen hồng','Pink lotus'],['Kinh Bát Nhã','Heart Sutra booklet'],['Chuông gió nhỏ','Little wind chime'],['Đèn hoa đăng','Lotus lantern'],['Trà sen','Lotus tea'],['Thiệp chúc phúc','Blessing card'],['Vòng trầm hương','Agarwood bracelet'],['Hộp nhang trầm','Box of incense']];
let BLESS={leaves:0,gifts:[],seen:[]};
try { const s=JSON.parse(localStorage.getItem('antam-blessings')||'null'); if (s&&typeof s.leaves==='number') BLESS={leaves:s.leaves,gifts:s.gifts||[],seen:s.seen||[]}; } catch(e){}
function saveBless(){ try { localStorage.setItem('antam-blessings',JSON.stringify(BLESS)); } catch(e){} }
const LEAF_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-4 4-7 8-7 12a7 7 0 0 0 6 6.9V23h2v-2.1A7 7 0 0 0 19 14c0-4-3-8-7-12z" fill="#9bd26f"/><path d="M12 6v14" stroke="#2f5a22" stroke-width="1.4"/></svg>';
const GIFT_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="1.5" fill="#c2412b"/><rect x="2" y="6" width="20" height="4" rx="1" fill="#d9aa4a"/><path d="M12 6v15" stroke="#d9aa4a" stroke-width="2"/></svg>';
const rewardEl=$('#reward'); const rewardQ=[]; let rewardBusy=0;
function showReward(html,gift=false){ rewardQ.push([html,gift]); }
function renderBless(){ $('#leaves').textContent=BLESS.leaves; $('#giftCount').textContent=BLESS.gifts.length;
  $('#giftList').innerHTML=BLESS.gifts.length?BLESS.gifts.map(([vi,en])=>`<li><b>${vi}</b><span>${en}</span></li>`).join(''):`<li>${tr('noGifts')}</li>`; }
function award(n,reason,type){ if (type) track(type);
  const before=Math.floor(BLESS.leaves/12); BLESS.leaves+=n; showReward(`${LEAF_SVG}<span>+${n} lá bồ đề · ${reason}</span>`);
  if (Math.floor(BLESS.leaves/12)>before){ const left=GIFTS.filter(g=>!BLESS.gifts.some(h=>h[0]===g[0])); const g=left.length?pick(left):pick(GIFTS); BLESS.gifts.push(g); showReward(`${GIFT_SVG}<span>Nhà chùa tặng bạn: ${g[0]}</span>`,true); bowlSound(.8); }
  saveBless(); renderBless(); }
renderBless();
$('#bagBtn').addEventListener('click',()=>{ const b=$('#bag'); b.hidden=!b.hidden; $('#bagBtn').setAttribute('aria-expanded',String(!b.hidden)); });

/* ================= audio (Web Audio) ================= */
let AC=null, master, natureBus, templeBus, revIn, noiseBuf, cricketG, windG, chantG, chantOsc=[], murmurG, muted=false;
function initAudio(){
  if (AC) return; AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain(); master.gain.value=.85; master.connect(AC.destination); natureBus=AC.createGain(); natureBus.connect(master); templeBus=AC.createGain(); templeBus.connect(master); applyVolumes();
  const conv=AC.createConvolver(), len=AC.sampleRate*3.4, ib=AC.createBuffer(2,len,AC.sampleRate);
  for (let ch=0;ch<2;ch++){ const d=ib.getChannelData(ch); for (let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.4); }
  conv.buffer=ib; revIn=AC.createGain(); revIn.gain.value=.4; revIn.connect(conv); const rg=AC.createGain(); rg.gain.value=.55; conv.connect(rg); rg.connect(master);
  noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate); const nd=noiseBuf.getChannelData(0); for (let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
  const wn=AC.createBufferSource(); wn.buffer=noiseBuf; wn.loop=true; const lp=AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=320; windG=AC.createGain(); windG.gain.value=.05; wn.connect(lp).connect(windG).connect(natureBus); wn.start();
  const mn=AC.createBufferSource(); mn.buffer=noiseBuf; mn.loop=true; mn.playbackRate.value=.7; const bp=AC.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=520; bp.Q.value=.9; murmurG=AC.createGain(); murmurG.gain.value=0; mn.connect(bp).connect(murmurG).connect(natureBus); mn.start();
  const co=AC.createOscillator(); co.frequency.value=4650; const am=AC.createGain(); am.gain.value=.5; const lfo=AC.createOscillator(); lfo.type='square'; lfo.frequency.value=27; const lg=AC.createGain(); lg.gain.value=.5; lfo.connect(lg).connect(am.gain);
  cricketG=AC.createGain(); cricketG.gain.value=0; co.connect(am).connect(cricketG).connect(natureBus); co.start(); lfo.start();
  chantG=AC.createGain(); chantG.gain.value=0; const f1=AC.createBiquadFilter(); f1.type='bandpass'; f1.frequency.value=720; f1.Q.value=6; const f2=AC.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=1150; f2.Q.value=7;
  const cmix=AC.createGain(); cmix.gain.value=.5;
  for (const [fr,dt] of [[98,0],[98,4],[147,-3]]){ const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=fr; o.detune.value=dt; o.connect(cmix); o.start(); chantOsc.push(o); }
  cmix.connect(f1); cmix.connect(f2); f1.connect(chantG); f2.connect(chantG); chantG.connect(templeBus); chantG.connect(revIn);
}
const nowA=()=>AC.currentTime;
function env(g,t0,a,peak,dec){ g.gain.setValueAtTime(.0001,t0); g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t0+a); g.gain.exponentialRampToValueAtTime(.0001,t0+a+dec); }
function volAt(p){ return Math.pow(clamp(1-me.pos.distanceTo(p)/45,.06,1),1.4); }
function noiseHit(type,freq,q,peak,dec,dest=master,t0=nowA()){ const s=AC.createBufferSource(); s.buffer=noiseBuf; const f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q; const g=AC.createGain(); s.connect(f).connect(g).connect(dest); env(g,t0,.004,peak,dec); s.start(t0,Math.random()); s.stop(t0+dec+.1); }
function bellSound(vol){ if (!AC||muted) return; const t0=nowA(), f=84;
  for (const [r,a,dc] of [[1,1,12],[2.02,.55,9],[2.74,.5,7],[4.06,.28,5],[5.39,.2,3.5],[6.8,.12,2.5]]) for (const det of [0,.6]){ const o=AC.createOscillator(); o.frequency.value=f*r+det; const g=AC.createGain(); o.connect(g); g.connect(templeBus); g.connect(revIn); env(g,t0,.006,.13*a*vol,dc); o.start(t0); o.stop(t0+dc+.2); }
  noiseHit('lowpass',1400,.7,.25*vol,.08); }
function moSound(vol,t0=nowA()){ if (!AC||muted) return; const o=AC.createOscillator(); o.frequency.setValueAtTime(860,t0); o.frequency.exponentialRampToValueAtTime(470,t0+.035); const g=AC.createGain(); o.connect(g); g.connect(templeBus); g.connect(revIn); env(g,t0,.002,.32*vol,.13); o.start(t0); o.stop(t0+.25); noiseHit('bandpass',1700,4,.2*vol,.025,master,t0); }
function bowlSound(vol,t0){ if (!AC||muted) return; t0=t0??nowA(); for (const [fr,a] of [[640,1],[1730,.4],[3200,.15]]){ const o=AC.createOscillator(); o.frequency.value=fr; const g=AC.createGain(); o.connect(g); g.connect(templeBus); g.connect(revIn); env(g,t0,.004,.09*a*vol,3.2); o.start(t0); o.stop(t0+3.4); } }
function chirp(vol){ if (!AC||muted) return; const t0=nowA(), n=2+Math.floor(Math.random()*3), base=2600+Math.random()*1800;
  for (let i=0;i<n;i++){ const o=AC.createOscillator(), ts=t0+i*.14; o.frequency.setValueAtTime(base,ts); o.frequency.exponentialRampToValueAtTime(base*(1.25+Math.random()*.3),ts+.06); o.frequency.exponentialRampToValueAtTime(base*.9,ts+.1); const g=AC.createGain(); o.connect(g).connect(natureBus); env(g,ts,.01,.035*vol,.1); o.start(ts); o.stop(ts+.15); } }
function frog(vol){ if (!AC||muted) return; const t0=nowA(); for (let i=0;i<2;i++){ const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=110+Math.random()*30; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=420; const g=AC.createGain(); o.connect(f).connect(g).connect(natureBus); env(g,t0+i*.22,.02,.07*vol,.14); o.start(t0+i*.22); o.stop(t0+i*.22+.2); } }
function bark(p){ if (!AC||muted) return; const v=volAt(p), t0=nowA(); for (let i=0;i<2;i++){ const ts=t0+i*.28, o=AC.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(520,ts); o.frequency.exponentialRampToValueAtTime(260,ts+.09); const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=1.2; const g=AC.createGain(); o.connect(f).connect(g).connect(master); env(g,ts,.008,.18*v,.11); o.start(ts); o.stop(ts+.15); noiseHit('bandpass',1200,1,.08*v,.06,master,ts); } }
function step(surface){ if (!AC||muted) return; noiseHit('bandpass',surface==='grass'?380:surface==='wood'?600:950,1.4,surface==='grass'?.05:.08,.06); }
function matchStrike(){ if (!AC||muted) return; noiseHit('highpass',2400,.7,.18,.28); for (let i=0;i<6;i++) noiseHit('highpass',3000,1,.05,.02,master,nowA()+.25+Math.random()*.9); }
function sweepSound(){ if (!AC||muted) return; for (let i=0;i<4;i++) noiseHit('bandpass',2200+i*300,1.2,.09,.22,master,nowA()+i*.28); }

/* ================= leaf piles to sweep (a good deed) ================= */
const PILES=[]; const pileMat=lam('#ffffff',{map:CARDTEX.fallen,alphaTest:.45,side:THREE.DoubleSide});
function spawnPile(){ const [x,z]=freeSpot(-24,24,-4,19); const m=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.8),pileMat); m.rotation.x=-Math.PI/2; m.rotation.z=rnd()*6; m.position.set(x,.05,z); m.receiveShadow=true; scene.add(m); PILES.push(m); }
for (let i=0;i<3;i++) spawnPile();
let pileT=40;

/* ================= interactions ================= */
let urnLevel=4, incenseToday=0, bellCooldown=0, bellSwing=0, bellReward=0, dogReward=0, chat=null, mode='third';
function noteIncense(){ incenseToday++; $('#incense').textContent=incenseToday.toLocaleString('en-US'); }
function urnBurst(){ urnLevel+=1; emit(URN.x,2.9,URN.z,14,.5,.45); }
function ringBell(fromPlayer){ if (bellCooldown>0&&!fromPlayer) return; bellCooldown=14; bellSwing=1; bellSound(fromPlayer?1:volAt(BELLPOS)); }
const toastEl=$('#toast'); let toastT=0;
function toast(msg,sec=2.8){ toastEl.textContent=msg; toastEl.removeAttribute('data-off'); toastT=sec; }
function act(code){
  if (!me.entered || chat) return;
  if (extraAct(code)) return;
  const map={Digit1:'stand',Digit2:'pray',Digit3:'bow',Digit4:'kneel',Digit5:'prostrate',Digit6:'sit'};
  if (map[code]){ me.pose=map[code]; me.poseT=0; me.deedT=0; me.prayI=0; me.prayT=0; if (code==='Digit5') toast(tr('lay')); return; }
  if (code==='KeyF'){
    if (me.pos.distanceTo(URN)<4.2){ if (me.incenseT>0) return; matchStrike(); me.incenseT=10; me.pose='pray'; me.poseT=0; me.prayI=0; me.prayT=0; noteIncense(); net.send({t:'act',a:'incense'}); toast(tr('incenseLit'));
      setTimeout(()=>{ me.incenseT=0; urnBurst(); award(3,'Thắp nhang','incense'); if (me.pose==='pray') me.pose='bow'; setTimeout(()=>{ if (me.pose==='bow') me.pose='stand'; },1200); },8000); }
    else toast(tr('incenseFar')); }
  if (code==='KeyB'){ if (me.pos.distanceTo(BELLPOS)<4.5){ ringBell(true); net.send({t:'act',a:'bell'}); toast('Thỉnh chuông'); if (bellReward<=0){ award(1,'Thỉnh chuông','bell'); bellReward=20; } } else toast(tr('bellFar')); }
  if (code==='KeyG'){
    const pile=PILES.find(p=>Math.hypot(p.position.x-me.pos.x,p.position.z-me.pos.z)<2.2);
    if (pile){ me.pose='bow'; me.poseT=0; sweepSound(); net.send({t:'act',a:'sweep'}); scene.remove(pile); PILES.splice(PILES.indexOf(pile),1); award(2,'Quét lá sân chùa','sweep'); setTimeout(()=>{ if (me.pose==='bow') me.pose='stand'; },900); return; }
    if (DOG.D.root.visible && me.pos.distanceTo(DOG.pos)<2.4){ DOG.happy=3; DOG.state='wander'; DOG.target=[DOG.pos.x,DOG.pos.z]; if (dogReward<=0){ award(2,'Cho chó chùa uống nước','dog'); dogReward=60; } else toast(tr('dogWag')); return; }
    toast(tr('helpFar')); }
  if (code==='KeyV'){ mode==='pov'?exitPOV():enterPOV(); }
  if (code==='KeyN'){ $('#live').checked=false; setHour((hour>6&&hour<18)?20.5:9.5); }
}

/* ================= input + camera modes ================= */
const keys={};
addEventListener('keydown',e=>{ if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||!$('#modal').hidden) return; keys[e.code]=true; if (!e.repeat) act(e.code); if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup',e=>{ keys[e.code]=false; });
let drag=null, camYaw=0, camDist=26, povPitch=-.05, curDist=54, curPitch=.24;
canvas.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,type:e.pointerType}; canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing'; });
canvas.addEventListener('pointermove',e=>{ if (!drag) return; if (mode==='pov'&&drag.type==='mouse'){ me.heading-=(e.clientX-drag.x)*.005; povPitch=clamp(povPitch-(e.clientY-drag.y)*.004,-1.1,.9); } else if (mode!=='pov'&&IS_TOUCH){ camYaw-=(e.clientX-drag.x)*.006; } drag.x=e.clientX; drag.y=e.clientY; });
const endDrag=()=>{ drag=null; canvas.style.cursor='grab'; }; canvas.addEventListener('pointerup',endDrag); canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('wheel',e=>{ e.preventDefault(); if (mode==='pov'){ if (e.deltaY>0) exitPOV(); return; } camDist=clamp(camDist+e.deltaY*.02,5,60); if (camDist<6.5&&me.entered) enterPOV(); },{passive:false});
function setFov(f,near){ camera.fov=f; camera.near=near; camera.updateProjectionMatrix(); resize(); }
function enterPOV(){ if (!me.entered||mode==='pov') return; me.prevDist=camDist; mode='pov'; povPitch=.1; setFov(64,.08); me.P.root.visible=false; toast(tr('eyeView')); }
// The third-person camera sits behind the way you were facing, so W keeps walking you the same way (out of a hall, not back in).
function exitPOV(){ if (mode!=='pov') return; me.autoPOV=false; mode='third'; camYaw=me.heading+Math.PI; camDist=Math.max(18,me.prevDist||26); setFov(40,.5); me.P.root.visible=true; }
$('#keys').addEventListener('click',e=>{ const b=e.target.closest('button'); if (b) act(b.dataset.k); });

/* ================= UI wiring ================= */
const timeEl=$('#time'), liveEl=$('#live');
const fmt=h=>`${String(Math.floor(h)%24).padStart(2,'0')}:${String(Math.floor((h%1)*60)).padStart(2,'0')}`;
let hour=+timeEl.value;
function setHour(h){ hour=(h+24)%24; timeEl.value=hour; $('#timeOut').textContent=fmt(hour); applyTime(); }
timeEl.addEventListener('input',()=>{ liveEl.checked=false; setHour(+timeEl.value); });
liveEl.addEventListener('change',()=>{ if (liveEl.checked){ const d=new Date(); setHour(d.getHours()+d.getMinutes()/60); } });
$('#pix').addEventListener('input',e=>{ PIX=+e.target.value; $('#pixOut').textContent=PIX; resize(); });
let crowd=18;
function applyCrowd(){ crowd=+$('#crowd').value; $('#crowdOut').textContent=crowd; let n=0;
  for (const a of agents) if (a.kind==='visitor'){ const was=a.active; a.active=n<crowd; a.P.root.visible=a.active; if (was&&!a.active) a.reset(); n++; } }
$('#crowd').addEventListener('input',applyCrowd);
function setSmoke(v){ smokeLevel=v; smoke.visible=v>0; for (const b of $('#smokeSeg').children) b.setAttribute('aria-checked',String(+b.dataset.v===v)); if (v===0){ sAge.fill(99); sAlpha.fill(0); } try { localStorage.setItem('antam-smoke',String(v)); } catch(e){} }
$('#smokeSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if (b) setSmoke(+b.dataset.v); });
setSmoke(smokeLevel);
// Sound is always on: start it on the first touch or key, since browsers block audio until then.
for (const ev of ['pointerdown','keydown']) addEventListener(ev,()=>{ if (!AC){ initAudio(); applyVolumes(); } },{once:true});
const sw=$('#swatches');
function drawSwatches(){ sw.innerHTML=''; for (const c of OUTFIT_COLORS[me.outfit]){ const b=document.createElement('button'); b.type='button'; b.style.background=c; b.setAttribute('aria-label','Colour '+c); b.setAttribute('aria-pressed',String(c===me.color)); b.onclick=()=>{ me.color=c; drawSwatches(); rebuildPlayer(); }; sw.appendChild(b); } }
$('#outfits').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; me.outfit=b.dataset.o; me.color=OUTFIT_COLORS[me.outfit][0]; for (const x of $('#outfits').children) x.setAttribute('aria-pressed',String(x===b)); drawSwatches(); rebuildPlayer(); });
drawSwatches();
$('#entry').addEventListener('submit',async e=>{ e.preventDefault();
  const raw=($('#name').value.trim()||'Khách').slice(0,18);
  $('#enterBtn').disabled=true; $('#nameErr').hidden=true;
  const ses=await startSession(raw);
  $('#enterBtn').disabled=false;
  if (ses.error){ $('#nameErr').textContent=ses.text; $('#nameErr').hidden=false; return; }
  me.name=ses.name||raw; me.token=ses.token; me.entered=true; document.body.classList.add('entered');
  me.label=makeLabel(me.name,'me'); $('#entry').hidden=true; $('#legend').hidden=false; $('#hello').textContent=tr('welcome',{name:me.name});
  initAudio(); muted=false; applyVolumes();
  camYaw=0; camDist=26; toast(tr('enterFirst'),4.5);
  if (innerWidth<720) $('#settings').open=false;
  afterEnter(); });
if (innerWidth<720) $('#settings').open=false;

/* ================= time of day ================= */
let dayF=1, lastSkyKey='';
const tC=new THREE.Color(), tC2=new THREE.Color();
function applyTime(){
  const ang=(hour-6)/12*Math.PI, el=Math.sin(ang), day=smooth(-.1,.28,el), dusk=clamp(1-Math.abs(el+.02)/.3,0,1), night=1-day; dayF=day;
  sun.userData.dir=V3(Math.cos(ang)*.85,Math.max(el,.02),.55).normalize(); sun.intensity=3.1*day;
  sun.color.set('#fff2dc').lerp(tC.set('#ff8a45'),dusk*.8); sun.castShadow=day>.05&&!QUALITY.noShadows; moon.intensity=.55*night;
  hemi.color.set('#26336a').lerp(tC.set('#cfe3ff'),day).lerp(tC2.set('#f0a27a'),dusk*.5); hemi.groundColor.set('#1a1210').lerp(tC.set('#8a5a3a'),day); hemi.intensity=.5+.75*day;
  const fogC=new THREE.Color('#141a35').lerp(tC.set('#d3dee8'),day).lerp(tC2.set('#e6a582'),dusk*.55); scene.fog.color.copy(fogC);
  MAT.lantern.emissiveIntensity=.5+5*night; MAT.door.emissive.set('#ff8a3a'); MAT.door.emissiveIntensity=.2+1.5*night;
  warmLights.forEach(l=>l.intensity=night*38); interiorLights.forEach(l=>l.intensity=10+30*night); MAT.shaft.opacity=.34*smooth(.1,.6,day);
  postMat.uniforms.uExposure.value=1+.75*night; postMat.uniforms.uNight.value=night;
  smokeMat.uniforms.uColor.value.set('#3a3550').lerp(tC.set('#e2ded6'),day).lerp(tC2.set('#f0c09a'),dusk*.4);
  cloudMat.color.set('#2b3354').lerp(tC.set('#ffffff'),day).lerp(tC2.set('#ffb48a'),dusk*.6);
  for (const m of mists) m.material.color.set('#3a4266').lerp(tC.set('#ffffff'),day).lerp(tC2.set('#ffc8a8'),dusk*.5);
  sunSprite.position.copy(V3(Math.cos(ang),el,.35).normalize()).multiplyScalar(430); sunSprite.visible=el>-.05; sunSprite.material.color.set('#fff3d0').lerp(tC.set('#ff9a5a'),dusk);
  moonSprite.position.copy(V3(-Math.cos(ang),-el,.45).normalize()).multiplyScalar(430); moonSprite.visible=-el>-.05;
  const key=(day*40|0)+'-'+(dusk*30|0); if (key!==lastSkyKey){ lastSkyKey=key; drawSky(day,dusk,'#'+fogC.getHexString()); }
}

/* ================= speech and prayer bubbles ================= */
const SAYINGS=['Nam mô A Di Đà Phật.','Tâm an thì cảnh an.','Gieo nhân lành, gặt quả lành.','Một niệm từ bi, muôn nơi an lạc.','Thở vào, tâm tĩnh lặng. Thở ra, mỉm cười.'];
const MONK_LINES=['A Di Đà Phật. Chúc con thân tâm an lạc.','Mô Phật, cầu cho con và gia đình bình an.','Đi chậm thôi con, mỗi bước chân là một bước an.','Nguyện Phật gia hộ, cho con một ngày an lành.','Con nhớ giữ tâm thanh tịnh, mọi sự rồi sẽ ổn.','Trời hôm nay đẹp quá. Con vào lễ Phật rồi uống chén trà nhé.','Cười lên con, nụ cười là đóa hoa của tâm.','Bình an đến với con. Nam mô A Di Đà Phật.'];
const MY_LINES=['A Di Đà Phật, con chào thầy.','Con chào thầy ạ.','Mô Phật, thầy có khỏe không ạ?'];
const WISHES=['Con xin thành tâm đảnh lễ.','Nguyện cho gia đình con được bình an, mạnh khỏe.','Con xin sám hối những lỗi lầm đã qua.','Nguyện cho muôn loài thoát khổ, được an vui.','Nguyện cho cha mẹ con sống lâu, khỏe mạnh.','Con nguyện sống hiền lành, giúp đỡ mọi người.'];
const INCENSE_LINES=['Con xin thắp nén nhang thơm, kính dâng lên chư Phật.','Nguyện cầu cho gia đình con bình an.','Nam mô A Di Đà Phật.'];
function prayerLine(b,i){ if (!b) return INCENSE_LINES[i%INCENSE_LINES.length]; const inv=INVOKE[b.deity]; return i%2===0?inv+'.':WISHES[(i>>1)%WISHES.length]; }
const preachBubble=makeBubble(), monkBubble=makeBubble(), meBubble=makeBubble('me'), myPray=makeBubble('pray'), npcPray=[0,1,2].map(()=>makeBubble('pray small'));
let sayI=0, sayT=0;
function startChat(m){ chat={m,t:Math.round(R(4,7)),total:0,line:pick(MONK_LINES),mine:pick(MY_LINES)}; m.chatting=true; me.pose='stand'; me.walk=0; }

/* ================= resize ================= */
function resize(){ const w=innerWidth, h=innerHeight; renderer.setSize(w,h); rt.setSize(Math.max(1,Math.ceil(w/PIX)),Math.max(1,Math.ceil(h/PIX)));
  postMat.uniforms.uRes.value.set(rt.width,rt.height); camera.aspect=w/h; camera.updateProjectionMatrix();
  const sc=rt.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))); smokeMat.uniforms.uScale.value=sc; ffMat.uniforms.uScale.value=sc; farMat.uniforms.uScale.value=sc; }
addEventListener('resize',resize);


/* ================= live visitors, chat, candles, wishes, fortune, halls, settings ================= */
const LS={ get(k,d){ try { const v=localStorage.getItem(k); return v===null?d:v; } catch(e){ return d; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){ /* storage blocked */ } } };
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VND=n=>Number(n).toLocaleString('vi-VN')+' ₫';
const IS_TOUCH=matchMedia('(pointer:coarse)').matches||('ontouchstart' in window);
const INVITE=(/^#(s[a-f0-9]{6})$/.exec(location.hash)||[])[1]||'';
const tv=new THREE.Vector3();
if (IS_TOUCH) document.body.classList.add('touch');

// ---- usage statistics (daily counts only, nothing personal) ----
const TRACK={};
function track(type,n=1){ TRACK[type]=(TRACK[type]||0)+n; }
function flushTrack(beacon=false){
  if (!Object.keys(TRACK).length) return;
  const body=JSON.stringify({counts:{...TRACK}}); for (const k in TRACK) delete TRACK[k];
  if (beacon&&navigator.sendBeacon){ navigator.sendBeacon('api/event.php',new Blob([body],{type:'application/json'})); return; }
  fetch('api/event.php',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
setInterval(()=>flushTrack(false),30000);
addEventListener('pagehide',()=>flushTrack(true));

// ---- dialog ----
const modal=$('#modal'); let modalOnClose=null;
function openModal(title,html,onClose=null){
  if (modalOnClose){ const f=modalOnClose; modalOnClose=null; f(); }
  for (const k in keys) keys[k]=false;
  $('#modalTitle').textContent=title; $('#modalBody').innerHTML=html; modal.hidden=false; modalOnClose=onClose;
  modal.querySelector('#modalBody input,#modalBody textarea,#modalBody button')?.focus();
}
function closeModal(){ modal.hidden=true; const f=modalOnClose; modalOnClose=null; f?.(); }
function showErr(id,text){ const el=$('#'+id); if (el){ el.textContent=text; el.hidden=false; } }
$('#modalClose').addEventListener('click',closeModal);
addEventListener('keydown',e=>{ if (e.key==='Escape'&&!modal.hidden) closeModal(); });
addEventListener('blur',()=>{ for (const k in keys) keys[k]=false; });
async function postJson(url,data){ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); let j={}; try { j=await r.json(); } catch(e){ /* not json */ } return {ok:r.ok,status:r.status,j}; }

// ---- online numbers ----
let liveHere=0;
function setOnline(n){ const el=$('#online'); if (n===null||n===undefined){ el.parentElement.hidden=true; return; } el.parentElement.hidden=false; el.textContent=Number(n).toLocaleString('en-US'); }
async function refreshStats(){
  try { const r=await fetch('api/stats.php',{cache:'no-store'}); if (!r.ok) throw new Error('stats'); const s=await r.json();
    if (net.state!=='live') setOnline(s.online); if ((s.incense_today|0)>incenseToday){ incenseToday=s.incense_today|0; $('#incense').textContent=incenseToday.toLocaleString('en-US'); }
  } catch(e){ if (net.state!=='live') setOnline(null); }
}

// ---- other visitors ----
const remotes=new Map();
const MUTED=new Set((()=>{ try { return JSON.parse(LS.get('antam-muted','[]')); } catch(e){ return []; } })());
function lookToBuild(look){
  const c=/^#[0-9a-f]{6}$/i.test(look?.color||'')?look.color:'#8f918b', base={h:R(1.58,1.72),skin:pick(skins),hair:pick(hairs)};
  switch (look?.outfit){
    case 'aodai': return {...base,fit:'aodai',top:c,bottom:'#f3efe6',trim:'#e8c15a',flaps:true,wideLeg:true,style:'long'};
    case 'baba': return {...base,fit:'baba',top:c,bottom:'#1f1a17',trim:'#14100d',skirt:.3,wideLeg:true,hat:true,style:'short'};
    case 'modern': return {...base,fit:'modern',top:c,bottom:'#2d3e5e',trim:'#2a2420',shortSleeve:true,style:'short',shoe:'#f2efe8'};
    default: return {...base,fit:'robe',top:c,bottom:'#4b4a46',trim:'#2f2d2a',skirt:.92,wideSleeve:true,style:'bun',beads:true};
  }
}
function addRemote(p){
  if (remotes.has(p.id)) return;
  const LK=lookToBuild(p.look), P=buildPerson(LK); scene.add(P.root);
  const label=makeLabel(p.name,'remote'+(MUTED.has(p.name)?' muted':'')); label.addEventListener('click',()=>openPlayerMenu(p.id));
  remotes.set(p.id,{id:p.id,P,col:new THREE.Color(LK.top),cur:{},phase:0,walk:0,label,bubble:makeBubble(),bubbleT:0,name:p.name,pos:V3(p.x,groundY(p.x,p.z),p.z),heading:0,pose:'stand',poseT:0,lastX:p.x,lastZ:p.z,incenseT:0});
}
function removeRemote(id){ const r=remotes.get(id); if (!r) return; scene.remove(r.P.root); r.label.remove(); r.bubble.remove(); remotes.delete(id); }
const myBubble=makeBubble('me'); let myBubbleT=0;
const net=new Net({
  status(s){
    const el=$('#liveStatus');
    if (!CFG.realtime){ el.hidden=true; return; }
    el.hidden=false; el.textContent=s==='live'?tr('live',{n:liveHere||1}):s==='connecting'?tr('connecting'):tr('alone');
    $('#inviteBtn').hidden=s!=='live'; requestAnimationFrame(layoutHud);
    if (s!=='live'){ for (const id of [...remotes.keys()]) removeRemote(id); if (WORLD_CLOCK.seed!==9101){ WORLD_CLOCK.seed=9101; for (const a of agents) a.reset(); DOG.snap=true; } }
  },
  welcome(m){ { const b=insideOf(me.pos.x,me.pos.z); if (b) setTimeout(()=>net.send({t:'room',h:BUILDINGS.indexOf(b)}),0); }
    WORLD_CLOCK.seed=(m.seed%1000000)|0; for (const a of agents) a.reset(); DOG.snap=true;
    for (const p of m.players) addRemote(p); liveHere=m.players.length+1; setOnline(m.online); if (m.name&&m.name!==me.name){ me.name=m.name; if (me.label) me.label.textContent=m.name; } },
  join(p){ addRemote(p); },
  leave(id){ removeRemote(id); },
  chat(m){
    if (m.id===net.id){ myBubble.textContent=m.text; myBubbleT=6; return; }
    const r=remotes.get(m.id); if (!r||MUTED.has(r.name)) return; r.bubble.textContent=m.text; r.bubbleT=6;
  },
  act(m){ const r=remotes.get(m.id); if (m.a==='bell'){ bellSwing=1; bellSound(volAt(BELLPOS)*.8); } else if (m.a==='incense'&&r) r.incenseT=9; },
  stats(m){ liveHere=m.here; setOnline(m.online); if (m.incense>incenseToday){ incenseToday=m.incense; $('#incense').textContent=incenseToday.toLocaleString('en-US'); } if (net.state==='live') $('#liveStatus').textContent=tr('live',{n:liveHere}); },
  candle(m){ loadCandles(); if (me.entered) toast(`${m.name} · ${tr('candleTitle')}`,3); },
  wish(){ loadWishes(); },
  reported(){ toast(tr('reported')); },
  error(m){ if (m.code==='slow') toast(tr('chatSlow')); else if (m.text) toast(m.text,5); },
});
function openPlayerMenu(id){
  const r=remotes.get(id); if (!r) return;
  openModal(r.name,`<div class="actions"><button type="button" class="btn ghost" id="pmMute">${tr(MUTED.has(r.name)?'unmute':'mute')}</button></div>
    <div class="field" style="margin-top:12px"><label for="pmWhy">${tr('reportWhy')}</label><textarea id="pmWhy" maxlength="200"></textarea></div>
    <button type="button" class="btn" id="pmReport">${tr('report')}</button>`);
  $('#pmMute').onclick=()=>{ if (MUTED.has(r.name)) MUTED.delete(r.name); else MUTED.add(r.name); LS.set('antam-muted',JSON.stringify([...MUTED])); r.label.classList.toggle('muted',MUTED.has(r.name)); closeModal(); };
  $('#pmReport').onclick=()=>{ net.send({t:'report',id,reason:$('#pmWhy').value}); closeModal(); };
}
let sendT=0;
function updateRemotes(dt){
  for (const [id,r] of remotes){
    const rr=net.remote.get(id); if (!rr){ removeRemote(id); continue; }
    r.P.root.visible=rr.visible;
    if (!rr.visible) continue;
    const s=net.sample(rr), sp=Math.hypot(s.x-r.lastX,s.z-r.lastZ)/Math.max(dt,1e-3); r.lastX=s.x; r.lastZ=s.z;
    r.pos.set(s.x,lerp(r.pos.y,groundY(s.x,s.z),1-Math.exp(-dt*12)),s.z); r.heading=headingFromByte(s.h);
    const pn=NET_POSES[s.pose]||'stand', moving=pn==='walk'||sp>.4;
    r.walk=lerp(r.walk,moving?1:0,1-Math.exp(-dt*8)); r.phase+=dt*(moving?10:0);
    const pose=pn==='walk'||!POSES[pn]?'stand':pn; if (pose!==r.pose){ r.pose=pose; r.poseT=0; } r.poseT+=dt;
    r.P.root.position.copy(r.pos); r.P.root.rotation.y=r.heading;
    applyPose(r.P,r.cur,r.walk,r.phase,dt,r.walk>.5?'stand':r.pose,r.poseT);
    if (r.incenseT>0){ r.incenseT-=dt; r.P.inc.visible=true; if (rnd()<dt*3){ r.P.inc.getWorldPosition(tv); emit(tv.x,tv.y+.5,tv.z,1,.04,.25); } } else r.P.inc.visible=false;
    r.bubbleT-=dt;
  }
  sendT-=dt;
  if (me.entered&&sendT<=0){ sendT=.1; net.sendMove(me.pos.x,me.pos.z,me.heading,me.walk>.5?'walk':me.pose); }
}
function featuresLabels(place,lh,dt){
  let n=0;
  for (const r of remotes.values()){
    if (!r.P.root.visible){ r.label.hidden=true; r.bubble.hidden=true; continue; }
    const h=r.P.h*(['kneel','prostrate'].includes(r.pose)?.62:r.pose==='sit'?.55:1)+.35;
    if (n<20&&place(r.label,r.pos,h,mode==='pov'?16:24)) n++; else r.label.hidden=true;
    if (r.bubbleT>0) place(r.bubble,r.pos,h+.55,30); else r.bubble.hidden=true;
  }
  myBubbleT-=dt;
  if (myBubbleT>0&&mode!=='pov') place(myBubble,me.pos,lh(me)+.55,99); else myBubble.hidden=true;
  const nearStand=me.entered&&me.pos.distanceTo(CANDLE_POS)<7;
  candleLabels.forEach((el,i)=>{ const c=CANDLES[i]; if (!nearStand||!c){ el.hidden=true; return; } el.textContent=c.name; place(el,CANDLE_SLOTS[i],(SIZE_H[c.size]||.22)+.25,12); });
}

// ---- distant people as one-piece silhouettes (one draw call for the whole far crowd) ----
const FAR_MAX=400, farPos=new Float32Array(FAR_MAX*3), farCol=new Float32Array(FAR_MAX*3);
const farGeo=new THREE.BufferGeometry();
farGeo.setAttribute('position',new THREE.BufferAttribute(farPos,3).setUsage(THREE.DynamicDrawUsage));
farGeo.setAttribute('color',new THREE.BufferAttribute(farCol,3).setUsage(THREE.DynamicDrawUsage));
const silTex=canvasTex(32,64,(g)=>{ g.fillStyle='#fff'; g.beginPath(); g.arc(16,9,6.5,0,7); g.fill(); g.beginPath(); g.moveTo(9,17); g.lineTo(23,17); g.lineTo(27,60); g.lineTo(5,60); g.closePath(); g.fill(); },false);
const farMat=new THREE.ShaderMaterial({ uniforms:{uMap:{value:silTex},uScale:{value:300}},
  vertexShader:`attribute vec3 color; varying vec3 vC; uniform float uScale; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(1.75*uScale/-mv.z,96.); gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`uniform sampler2D uMap; varying vec3 vC; void main(){ vec2 uv=vec2((gl_PointCoord.x-.25)*2.,1.-gl_PointCoord.y); if(uv.x<0.||uv.x>1.) discard; if(texture2D(uMap,uv).a<.5) discard; gl_FragColor=vec4(vC*.8,1.); }` });
const farCrowd=new THREE.Points(farGeo,farMat); farCrowd.frustumCulled=false; scene.add(farCrowd);
let FAR_D=36;
function updateLOD(){
  FAR_D=QUALITY.noShadows?24:36;
  let n=0;
  const push=(pos,col,h)=>{ if (n>=FAR_MAX) return; farPos[n*3]=pos.x; farPos[n*3+1]=pos.y+h*.5; farPos[n*3+2]=pos.z; farCol[n*3]=col.r; farCol[n*3+1]=col.g; farCol[n*3+2]=col.b; n++; };
  const far=(pos)=>mode!=='pov'&&camera.position.distanceTo(pos)>FAR_D;
  for (const a of agents){ if (!a.active){ a.P.root.visible=false; continue; } const f=far(a.pos); a.P.root.visible=!f; if (f) push(a.pos,a.col,a.P.h); }
  for (const r of remotes.values()){ const rr=net.remote.get(r.id); if (!rr||!rr.visible) continue; const f=far(r.pos); r.P.root.visible=!f; if (f) push(r.pos,r.col,r.P.h); }
  farGeo.setDrawRange(0,n); farGeo.attributes.position.needsUpdate=true; farGeo.attributes.color.needsUpdate=true;
}

// ---- chat ----
function openChat(){
  if (net.state!=='live'){ toast(tr(CFG.realtime?'connecting':'alone')); return; }
  for (const k in keys) keys[k]=false;
  $('#chatbar').hidden=false; $('#chatInput').value=''; $('#chatInput').focus();
}
$('#chatbar').addEventListener('submit',e=>{ e.preventDefault(); const v=$('#chatInput').value.trim(); if (v) net.send({t:'chat',text:v}); $('#chatbar').hidden=true; $('#chatInput').blur(); });
$('#chatInput').addEventListener('keydown',e=>{ if (e.key==='Escape'){ $('#chatbar').hidden=true; e.target.blur(); } });
$('#inviteBtn').addEventListener('click',async()=>{ const url=location.origin+location.pathname+'#'+net.shard; try { await navigator.clipboard.writeText(url); toast(tr('inviteCopied'),4); } catch(e){ toast(url,8); } });

// ---- halls menu ----
function openHalls(){
  openModal(tr('hallsTitle'),`<p>${tr('hallsText')}</p><div class="halls">${BUILDINGS.map((b,i)=>`<button type="button" data-i="${i}">${esc(b.title)}<small>${esc(DEITY_NAMES[b.deity])}</small></button>`).join('')}</div>`);
  $('#modalBody').querySelectorAll('.halls button').forEach(btn=>{ btn.onclick=()=>{ const b=BUILDINGS[+btn.dataset.i]; const [x,z]=l2w(b,0,b.pd/2+b.run+1.2); me.pos.set(x,0,z); me.heading=b.rot+Math.PI; me.pose='stand'; closeModal(); }; });
}

// ---- candles ----
let CANDLES=[], candlePoll=null;
const candleBodies=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.05,1,8),lam('#f4ead6',{emissive:'#3a2a10'}),48);
const candleFlames=new THREE.InstancedMesh(new THREE.ConeGeometry(.035,.11,6),new THREE.MeshBasicMaterial({color:'#ffcf6a'}),48);
candleBodies.count=0; candleFlames.count=0; candleFlames.frustumCulled=false; scene.add(candleBodies,candleFlames);
const candleLight=new THREE.PointLight('#ffb35a',0,9,1.6); candleLight.position.copy(CANDLE_POS).add(V3(0,1.6,.6)); scene.add(candleLight);
const SIZE_H={small:.18,medium:.26,large:.36};
const candleLabels=Array.from({length:6},()=>makeLabel('',''));
async function loadCandles(){ try { const r=await fetch('api/candles.php',{cache:'no-store'}); if (!r.ok) return; CANDLES=((await r.json()).candles||[]).slice(0,48); } catch(e){ return; } layoutCandles(); }
function layoutCandles(){
  const n=CANDLES.length; candleBodies.count=n; candleFlames.count=n;
  for (let i=0;i<n;i++){ const s=CANDLE_SLOTS[i], h=SIZE_H[CANDLES[i].size]||.22; o3.position.set(s.x,s.y+h/2,s.z); o3.quaternion.identity(); o3.scale.set(1,h,1); o3.updateMatrix(); candleBodies.setMatrixAt(i,o3.matrix); CANDLES[i]._top=s.y+h; }
  candleBodies.instanceMatrix.needsUpdate=true;
}
function updateCandles(T){
  const n=candleFlames.count;
  for (let i=0;i<n;i++){ const s=CANDLE_SLOTS[i], f=1+.18*Math.sin(T*13+i*1.7)+.08*Math.sin(T*29+i); o3.position.set(s.x+Math.sin(T*3+i)*.006,CANDLES[i]._top+.05*f,s.z); o3.quaternion.identity(); o3.scale.set(1,f,1); o3.updateMatrix(); candleFlames.setMatrixAt(i,o3.matrix); }
  if (n) candleFlames.instanceMatrix.needsUpdate=true;
  candleLight.intensity=Math.min(1,n/6)*(2+16*(1-dayF));
}
function openCandle(){
  if (!CFG.payments){ openModal(tr('candleTitle'),`<p>${tr('candleOff')}</p><p>${tr('burning',{n:CANDLES.length})}</p>`); return; }
  const sizes=Object.entries(CFG.sizes||{});
  openModal(tr('candleTitle'),`<p>${tr('candleText')}</p>
    <div class="field"><label for="cName">${tr('candleName')}</label><input id="cName" maxlength="18" value="${esc(me.name)}"></div>
    <div class="field"><label for="cWish">${tr('candleWish')}</label><textarea id="cWish" maxlength="140"></textarea></div>
    <div class="field"><label>${tr('candleSize')}</label><div class="seg" id="cSize" role="radiogroup">${sizes.map(([k,v],i)=>`<button type="button" role="radio" data-v="${esc(k)}" aria-checked="${i===1}">${tr(k)}<br>${VND(v)}</button>`).join('')}</div></div>
    <p class="err" id="cErr" hidden></p>
    <div class="actions"><button type="button" class="btn" id="cOrder">${tr('candleOrder')}</button><a href="donations.php" target="_blank" rel="noopener">${tr('candleDonations')}</a></div>`,
    ()=>{ clearInterval(candlePoll); candlePoll=null; });
  $('#cSize').onclick=e=>{ const b=e.target.closest('button'); if (!b) return; for (const x of $('#cSize').children) x.setAttribute('aria-checked',String(x===b)); };
  $('#cOrder').onclick=async()=>{
    const size=$('#cSize').querySelector('[aria-checked=true]')?.dataset.v||'medium';
    try { const {ok,j}=await postJson('api/candle.php',{action:'create',name:$('#cName').value,wish:$('#cWish').value,size}); if (!ok){ showErr('cErr',j.text||tr('needServer')); return; } showCandleQR(j); }
    catch(e){ showErr('cErr',tr('needServer')); }
  };
}
function showCandleQR(o){
  let qr=''; try { if (window.qrcode){ const q=window.qrcode(0,'M'); q.addData(o.qr); q.make(); qr=q.createImgTag(5,8,'VietQR'); } } catch(e){ qr=''; }
  if (!qr) qr=`<img src="${esc(o.qr_image)}" alt="VietQR">`;
  $('#modalBody').innerHTML=`<p>${tr('candleScan')}</p><div class="qr">${qr}</div>
    <dl><dt>${tr('candleBank')}</dt><dd>${esc(o.bank.label)}</dd><dt>${tr('candleAccount')}</dt><dd>${esc(o.bank.account)}</dd><dt>${tr('candleHolder')}</dt><dd>${esc(o.bank.name)}</dd>
    <dt>${tr('candleAmount')}</dt><dd>${VND(o.amount)}</dd><dt>${tr('candleMemo')}</dt><dd>${esc(o.code)}</dd></dl>
    <p id="cStatus">${tr('candleWait')}</p>${o.test_mode?`<button type="button" class="btn ghost" id="cSim">${tr('candleSimulate')}</button>`:''}`;
  if (o.test_mode) $('#cSim').onclick=()=>postJson('api/candle.php',{action:'test_pay',code:o.code}).catch(()=>{});
  clearInterval(candlePoll);
  candlePoll=setInterval(async()=>{
    try { const r=await fetch('api/candle.php?code='+encodeURIComponent(o.code),{cache:'no-store'}); const j=await r.json();
      if (j.status==='paid'){ clearInterval(candlePoll); candlePoll=null; const st=$('#cStatus'); if (st) st.textContent=tr('candlePaid'); $('#cSim')?.remove(); award(5,'Thắp nến','candle_view'); loadCandles(); }
      else if (j.status==='expired'){ clearInterval(candlePoll); candlePoll=null; const st=$('#cStatus'); if (st) st.textContent=tr('candleExpired'); }
    } catch(e){ /* try again next tick */ }
  },3000);
}

// ---- wishing tree ----
let WISHES_LIST=[];
const wishTags=new THREE.InstancedMesh(new THREE.PlaneGeometry(.2,.36),lam('#ffffff',{side:THREE.DoubleSide,emissive:'#2a1206'}),40);
const WISH_SLOTS=Array.from({length:40},(_,i)=>{ const a=i*2.4+R(-.2,.2), r=R(2,4.2); return V3(WISH_POS.x+Math.cos(a)*r,R(3.3,4.3),WISH_POS.z+Math.sin(a)*r); });
for (let i=0;i<40;i++){ o3.position.copy(WISH_SLOTS[i]); o3.quaternion.identity(); o3.rotation.set(0,R(0,6.28),0); o3.scale.setScalar(1); o3.updateMatrix(); wishTags.setMatrixAt(i,o3.matrix); wishTags.setColorAt(i,new THREE.Color(i%3?'#c2412b':'#e8b23a')); }
wishTags.count=0; scene.add(wishTags);
async function loadWishes(){ try { const r=await fetch('api/wishes.php',{cache:'no-store'}); if (!r.ok) return; WISHES_LIST=(await r.json()).wishes||[]; } catch(e){ return; } wishTags.count=Math.min(40,WISHES_LIST.length); }
function openWish(){
  const list=WISHES_LIST.length?WISHES_LIST.slice(0,20).map(w=>`<li><b>${esc(w.name)}</b> · ${esc(w.text)}</li>`).join(''):`<li>${tr('wishEmpty')}</li>`;
  openModal(tr('wishTitle'),`<p>${tr('wishText')}</p><ul class="list">${list}</ul>
    <div class="field"><textarea id="wishText" maxlength="140" placeholder="${esc(tr('wishPlaceholder'))}"></textarea></div><p class="err" id="wishErr" hidden></p>
    <button type="button" class="btn" id="wishSend">${tr('wishSend')}</button>`);
  $('#wishSend').onclick=async()=>{
    const text=$('#wishText').value.trim(); if (text.length<3) return;
    if (!me.token){ showErr('wishErr',tr('needServer')); return; }
    try { const {ok,j}=await postJson('api/wishes.php',{token:me.token,text}); if (!ok){ showErr('wishErr',j.text||tr('needServer')); return; }
      closeModal(); toast(tr(j.status==='visible'?'wishThanks':'wishPending'),4);
      if (!LS.get('antam-wish-'+today(),'')){ LS.set('antam-wish-'+today(),'1'); award(2,'Treo ý nguyện','wish'); }
      loadWishes();
    } catch(e){ showErr('wishErr',tr('needServer')); }
  };
}

// ---- xin xăm: shake the cup, toss the moon blocks (keo), read the slip; the slips live in xam.js ----
let fortuneShake=0;
function shakeSound(){ if (!AC||muted) return; for (let i=0;i<14;i++) noiseHit('bandpass',2600+Math.random()*1400,3,.07,.03,templeBus,nowA()+i*.15+Math.random()*.05); }
let fortuneBusy=false, fortuneNear=false;
function xamCard(x){ const vi=getLang()==='vi';
  return `<p class="xam-lv">${esc(x.lv)}</p><p class="verse">${x.poem.map(esc).join('<br>')}</p>`
    +(vi?`<dl class="xam">${[['fortuneLove',x.love],['fortuneMoney',x.money],['fortuneWork',x.work]].map(([k,t])=>`<dt>${esc(tr(k))}</dt><dd>${esc(t)}</dd>`).join('')}</dl>`:`<p>${esc(x.en)}</p>`)
    +`<p class="xam-note">${esc(tr('fortuneNote'))}</p><div class="actions"><button type="button" class="btn" id="xamAgain">${esc(tr('fortuneAgain'))}</button></div>`; }
// Walking up to the stall: the teller asks; the button (or X) draws.
function fortuneAsk(){ openModal(tr('fortuneTitle'),`<p>${esc(tr('fortuneAsk'))}</p><div class="actions"><button type="button" class="btn" id="xamGo">${esc(tr('fortuneDraw'))}</button><button type="button" class="btn ghost" id="xamNo">${esc(tr('stallNo'))}</button></div>`);
  $('#xamGo').onclick=drawFortune; $('#xamNo').onclick=closeModal; }
// Shake the cup, then toss the moon blocks: one up and one down (thánh keo) means the gods accept the stick.
function drawFortune(){
  if (me.pos.distanceTo(FORTUNE_POS)>3){ toast(tr('fortuneFar'),4); return; }
  if (fortuneBusy) return; fortuneBusy=true; closeModal();
  me.pose='pray'; me.poseT=0; fortuneShake=2.4; shakeSound(); toast(tr('fortuneShake'),2.4); net.send({t:'act',a:'fortune'});
  setTimeout(()=>{ fortuneBusy=false; me.pose='stand';
    const n=1+Math.floor(Math.random()*XAM.length), keo=Math.random();
    if (keo<.3){ openModal(tr('fortuneTitle'),`<p>${esc(tr(keo<.15?'keoUp':'keoDown'))}</p><div class="actions"><button type="button" class="btn" id="xamAgain">${esc(tr('fortuneShakeAgain'))}</button></div>`); $('#xamAgain').onclick=drawFortune; return; }
    const key='antam-xam-'+today(); if (!LS.get(key)){ LS.set(key,String(n)); award(1,'Xin xăm','fortune'); }
    openModal(tr('fortuneStick',{n}),xamCard(XAM[n-1])); $('#xamAgain').onclick=drawFortune; },2400); }
function nearFortune(){ const near=me.pos.distanceTo(FORTUNE_POS)<2.6; if (near===fortuneNear) return; fortuneNear=near; if (near&&modal.hidden&&!fortuneBusy) fortuneAsk(); }
function updateFortuneCup(T,dt){ fortuneShake=Math.max(0,fortuneShake-dt); fortuneCup.rotation.z=Math.sin(T*38)*.22*Math.min(1,fortuneShake); fortuneCup.rotation.x=Math.cos(T*31)*.12*Math.min(1,fortuneShake); }

// ---- the great bell at dawn and dusk, small bells in the halls ----
let prevHour=null, bellSeq=0, bellSeqT=0, smallBellT=20;
function updateBellSchedule(dt,inside){
  if (prevHour!==null){ for (const [h,when] of [[4,'morning'],[18,'evening']]){ if (prevHour<h&&hour>=h&&hour-prevHour<1){ bellSeq=12; bellSeqT=0; if (me.entered) toast(tr('bigBell',{when:tr(when)}),5); } } }
  prevHour=hour;
  if (bellSeq>0){ bellSeqT-=dt; if (bellSeqT<=0){ bellSeqT=5; bellSeq--; bellSwing=1; bellSound(Math.max(.35,volAt(BELLPOS))); } }
  smallBellT-=dt; if (smallBellT<0){ smallBellT=R(25,45); if (inside) bowlSound(.45); }
}

// ---- graphics quality, frame-rate watchdog ----
const QUALITY={mode:LS.get('antam-quality','auto'),lowered:false,noShadows:false};
function applyQuality(){
  const low=QUALITY.mode==='low'||QUALITY.lowered; QUALITY.noShadows=low;
  if (low) PIX=Math.max(PIX,4); else if (QUALITY.mode==='high') PIX=Math.min(PIX,3);
  $('#pix').value=PIX; $('#pixOut').textContent=PIX; resize(); applyTime();
  for (const b of $('#qualitySeg').children) b.setAttribute('aria-checked',String(b.dataset.v===QUALITY.mode));
}
$('#qualitySeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; QUALITY.mode=b.dataset.v; QUALITY.lowered=false; LS.set('antam-quality',QUALITY.mode); applyQuality(); });
let fpsN=0, fpsStart=performance.now();
function watchFps(){
  fpsN++; const el=(performance.now()-fpsStart)/1000; if (el<4) return;
  const fps=fpsN/el; fpsN=0; fpsStart=performance.now();
  if (QUALITY.mode==='auto'&&!QUALITY.lowered&&me.entered&&fps<26&&!document.hidden){ QUALITY.lowered=true; applyQuality(); toast(tr('lowered'),3); }
}

// ---- volume, motion, language ----
const VOL={all:+LS.get('antam-vol-all','0.85'),nature:+LS.get('antam-vol-nature','1'),temple:+LS.get('antam-vol-temple','1')};
function applyVolumes(){ if (!AC) return; master.gain.value=muted?0:VOL.all; natureBus.gain.value=VOL.nature; templeBus.gain.value=VOL.temple; }
for (const [id,k] of [['volAll','all'],['volNature','nature'],['volTemple','temple']]){ const el=$('#'+id); el.value=VOL[k]; el.addEventListener('input',()=>{ VOL[k]=+el.value; LS.set('antam-vol-'+k,el.value); applyVolumes(); }); }
$('#reduceMotion').checked=reduceMotion; document.body.classList.toggle('rm',reduceMotion);
$('#reduceMotion').addEventListener('change',e=>{ reduceMotion=e.target.checked; LS.set('antam-rm',reduceMotion?'1':'0'); document.body.classList.toggle('rm',reduceMotion); });
function refreshLangDynamic(){
  for (const b of $('#langSeg').children) b.setAttribute('aria-checked',String(b.dataset.v===getLang()));
  if (me.entered) $('#hello').textContent=tr('welcome',{name:me.name});
  renderBless(); net.h.status(net.state); layoutHud();
}
$('#langSeg').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return; setLang(b.dataset.v); refreshLangDynamic(); });

// ---- touch joystick ----
const joy={x:0,y:0,active:false}, joyEl=$('#joystick'), knob=$('#knob');
function moveJoy(e){ const r=joyEl.getBoundingClientRect(); let dx=(e.clientX-(r.left+r.width/2))/(r.width/2), dy=(e.clientY-(r.top+r.height/2))/(r.height/2); const l=Math.hypot(dx,dy); if (l>1){ dx/=l; dy/=l; } joy.x=dx; joy.y=dy; knob.style.transform=`translate(${dx*34}px,${dy*34}px)`; }
joyEl.addEventListener('pointerdown',e=>{ joy.active=true; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove',e=>{ if (joy.active) moveJoy(e); });
const endJoy=()=>{ joy.active=false; joy.x=0; joy.y=0; knob.style.transform=''; };
joyEl.addEventListener('pointerup',endJoy); joyEl.addEventListener('pointercancel',endJoy);

// ---- extra keys ----
function extraAct(code){
  switch (code){
    case 'Enter': openChat(); return true;
    case 'KeyH': openHalls(); return true;
    case 'KeyC': if (me.pos.distanceTo(CANDLE_POS)<4) openCandle(); else toast(tr('candleFar'),4); return true;
    case 'KeyT': if (Math.hypot(me.pos.x-WISH_POS.x,me.pos.z-WISH_POS.z)<5.5) openWish(); else toast(tr('wishFar'),4); return true;
    case 'KeyX': drawFortune(); return true;
    default: return false;
  }
}

// ---- entering ----
async function startSession(name){
  try { const {ok,status,j}=await postJson('api/session.php',{name});
    if (ok) return {name:j.name,token:j.token};
    if (status===422||status===403||status===429) return {error:true,text:j.text||tr('nameErr')};
  } catch(e){ /* no server: visit on your own */ }
  return {name,token:null};
}
function afterEnter(){
  track('visit');
  if (IS_TOUCH) joyEl.hidden=false;
  refreshLangDynamic(); layoutHud(); setTimeout(layoutHud,300);
  if (CFG.realtime) net.start({name:me.name,token:me.token,look:{outfit:me.outfit,color:me.color},invite:INVITE});
}
function layoutHud(){ const h=document.querySelector('header.tl').getBoundingClientRect().bottom; document.documentElement.style.setProperty('--hdr',Math.round(h)+'px'); }
addEventListener('resize',layoutHud);
function initFeatures(){
  layoutHud(); setTimeout(layoutHud,600);
  applyStatic(); refreshLangDynamic(); applyQuality(); loadCandles(); loadWishes();
  setInterval(loadCandles,60000); setInterval(loadWishes,120000); setInterval(()=>net.ping(),15000);
  // ?debug exposes a few handles for automated browser tests
  if (new URLSearchParams(location.search).has('debug')) window.__temple={me,act,net,remotes,BUILDINGS,setHour,CANDLE_POS,WISH_POS,FORTUNE_POS,openHalls,agents,npcState,dogState,clockNow:()=>WORLD_CLOCK.now(),farCount:()=>farGeo.drawRange.count,renderInfo:()=>{ renderer.info.autoReset=false; renderer.info.reset(); renderer.setRenderTarget(rt); renderer.render(scene,camera); renderer.setRenderTarget(null); const i=renderer.info; const r={calls:i.render.calls,triangles:i.render.triangles,geometries:i.memory.geometries,textures:i.memory.textures,programs:i.programs.length}; renderer.info.autoReset=true; return r; },enterPOV};
}

/* Arrivals on the entry screen: who came in and how long ago, newest at the bottom pushing older names up. */
const arrivalsEl=$('#arrivals'), arrivalsSeen=new Set();
function ago(s){ const rtf=new Intl.RelativeTimeFormat(getLang(),{numeric:'auto'}); for (const [u,n] of [['day',86400],['hour',3600],['minute',60]]) if (s>=n) return rtf.format(-Math.floor(s/n),u); return rtf.format(0,'second'); }
async function loadArrivals(){ if (me.entered) return;
  try { const r=await fetch('api/arrivals.php',{cache:'no-store'}); if (!r.ok) return; const list=(await r.json()).arrivals.reverse(), first=!arrivalsSeen.size;
    arrivalsEl.replaceChildren(...list.map(a=>{ const key=a.name+'|'+Math.round((Date.now()/1000-a.ago)/30), li=document.createElement('li'), b=document.createElement('b');
      if (!first&&!arrivalsSeen.has(key)) li.className='new'; arrivalsSeen.add(key); b.textContent=a.name; li.append(b,` ${tr('arrived')} · ${ago(a.ago)}`); return li; }));
  } catch(e){ /* the list is a nicety; the page works without it */ } }
loadArrivals(); setInterval(loadArrivals,20000);

/* Market stalls for rent: walking up to one opens its shop card, or offers it when nobody rents it. */
let STALL_INFO=[], STALL_PRICE=50000, stallNear=null;
async function loadStalls(){ try { const r=await fetch('api/stalls.php'); if (!r.ok) return; const j=await r.json(); STALL_INFO=j.stalls||[]; STALL_PRICE=j.price||STALL_PRICE; } catch(e){ /* stalls stay quiet */ } }
loadStalls(); setInterval(loadStalls,60000);
const vnd=n=>new Intl.NumberFormat('vi-VN').format(n)+' đ';
function stallCard(s){ let host=''; try { host=s.url?new URL(s.url).host:''; } catch(e){}
  return `<div class="stall-card">${s.logo?`<img src="${esc(s.logo)}" alt="" width="96" height="96">`:''}${host?`<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow ugc">${esc(tr('stallVisit'))} · ${esc(host)}</a>`:''}</div>`
    +(s.menu&&s.menu.length?`<h4>${esc(tr('stallMenu'))}</h4><ul class="list">${s.menu.map(m=>`<li><span>${esc(m.n)}</span> <b>${vnd(m.p)}</b></li>`).join('')}</ul>`:''); }
function nearStall(){ let near=null; for (const s of MARKET_STALLS) if (Math.hypot(me.pos.x-s.x,me.pos.z-s.z)<2.4) near=s;
  if (near===stallNear) return; stallNear=near; if (!near||!modal.hidden) return;
  const info=STALL_INFO.find(x=>x.slot===near.slot)||{state:'free'};
  if (info.state==='free'){ toast(tr('stallFreeSay'),4);
    openModal(tr('stallFreeTitle'),`<p>${esc(tr('stallFreeText',{price:vnd(STALL_PRICE)}))}</p><div class="actions"><a class="btn" href="vendor/?slot=${near.slot}" target="_blank" rel="noopener">${esc(tr('stallRent'))}</a><button type="button" class="btn ghost" id="stallNo">${esc(tr('stallNo'))}</button></div>`);
    $('#stallNo').onclick=closeModal; }
  else if (info.state==='held') toast(tr('stallHeld'),4);
  else if (info.state==='rented'&&info.name) openModal(info.name,stallCard(info)); }

/* ================= main loop ================= */
const clock=new THREE.Clock(); let T=0, stepT=0, birdT=2, frogT=3, beatT=0, beatI=0, onlineT=0, idleBellT=18, lastInside=null;
const camTarget=V3(0,2,4), v3=new THREE.Vector3(), MELODY=[98,98,110,98,87.3,98,110,123.5];
for (const b of BUILDINGS) b.label=makeLabel(b.title,'place');
const PRAYPOSES=['pray','kneel','prostrate'];
function frame(){
  const dt=Math.min(clock.getDelta(),.05); T+=dt;
  if (!reduceMotion) for (const m of AURAS) m.rotation.z+=dt*m.userData.spin;
  GATE.visible=!(me.entered&&me.pos.z<21);
  if (me.entered){ nearStall(); nearFortune(); }
  MAT.rays.opacity=.55+.2*Math.sin(T*1.2);
  if (liveEl.checked && Math.floor(T*2)!==Math.floor((T-dt)*2)){ const d=new Date(); setHour(d.getHours()+d.getMinutes()/60); }
  bellReward-=dt; dogReward-=dt;
  const inside=me.entered?insideOf(me.pos.x,me.pos.z):null;

  // player
  if (me.entered && !chat){
    let fx=0, fz=0, turn=0;
    const W=keys.KeyW||keys.ArrowUp, S=keys.KeyS||keys.ArrowDown, A=keys.KeyA, D=keys.KeyD;
    if (mode==='pov'){ if (W) fz-=1; if (S) fz+=1; if (A) fx-=1; if (D) fx+=1; if (keys.ArrowLeft||keys.KeyQ) turn+=1; if (keys.ArrowRight||keys.KeyE) turn-=1;
      if (drag&&drag.type!=='mouse'){ const dx=drag.x-drag.x0, dy=drag.y-drag.y0; turn-=clamp(dx/120,-1,1); if (Math.abs(dy)>20) fz+=clamp(dy/90,-1,1); }
      if (joy.active){ turn-=joy.x; fz+=joy.y; }
      me.heading+=turn*dt*.9; }
    else { if (W) fz-=1; if (S) fz+=1; if (A||keys.ArrowLeft) fx-=1; if (D||keys.ArrowRight) fx+=1; if (keys.KeyQ) camYaw+=dt*.7; if (keys.KeyE) camYaw-=dt*.7;
      if (drag&&!IS_TOUCH){ const dx=drag.x-innerWidth/2, dy=drag.y-innerHeight*.58, l=Math.hypot(dx,dy); if (l>30){ fx+=dx/l; fz+=dy/l; } } if (joy.active){ fx+=joy.x; fz+=joy.y; } }
    const l=Math.hypot(fx,fz); let moving=false;
    if (l>.01){
      if (me.pose!=='stand' && me.incenseT<=0) me.pose='stand';
      fx/=l; fz/=l; let wx,wz;
      if (mode==='pov'){ const h=me.heading; wx=-fz*Math.sin(h)-fx*Math.cos(h); wz=-fz*Math.cos(h)+fx*Math.sin(h); }
      else { const cs=Math.cos(camYaw), sn=Math.sin(camYaw); wx=fx*cs+fz*sn; wz=-fx*sn+fz*cs; }
      const spd=(keys.ShiftLeft||keys.ShiftRight)&&!inside?4.6:2.5, stepL=spd*dt, cy=groundY(me.pos.x,me.pos.z);
      const ok=(nx,nz)=>!blocked(nx,nz,.33)&&Math.abs(groundY(nx,nz)-cy)<.45;
      if (ok(me.pos.x+wx*stepL,me.pos.z)) me.pos.x+=wx*stepL;
      if (ok(me.pos.x,me.pos.z+wz*stepL)) me.pos.z+=wz*stepL;
      if (mode!=='pov') me.heading=angLerp(me.heading,Math.atan2(wx,wz),1-Math.exp(-dt*10));
      moving=true; stepT-=dt*spd/2.5;
      if (stepT<0){ stepT=.42; step(me.pos.y>.3?'wood':(Math.abs(me.pos.x)<30&&me.pos.z<22&&me.pos.z>-24)||Math.abs(me.pos.x)<4.5?'brick':'grass'); }
    }
    me.walk=lerp(me.walk,moving?1:0,1-Math.exp(-dt*9)); me.phase+=dt*(moving?10:0); me.poseT+=dt;
    me.deedT+=dt;
    if (me.pose==='prostrate' && me.deedT>9){ me.deedT=0; award(1,'Lạy Phật','prostrate'); }
    if (me.pose==='sit' && me.deedT>20){ me.deedT=0; award(3,'Ngồi thiền','meditate'); }
    if (inside && ['pray','kneel'].includes(me.pose) && me.deedT>6 && !inside.prayed){ inside.prayed=true; award(2,'Lễ Phật ở '+inside.title,'pray_hall'); }
    for (const a of agents){ if (a.kind!=='monk'||a.preacher||!a.active||a.chatCool>0||a.chatting) continue;
      if (Math.hypot(a.pos.x-me.pos.x,a.pos.z-me.pos.z)<1.5 && Math.abs(a.pos.y-me.pos.y)<.5){ startChat(a); break; } }
    if (toastT<=0){ if (me.pos.distanceTo(URN)<4.2) toast(tr('hintIncense'),1); else if (me.pos.distanceTo(BELLPOS)<4.5) toast(tr('hintBell'),1);
      else if (PILES.some(p=>Math.hypot(p.position.x-me.pos.x,p.position.z-me.pos.z)<2.2)) toast(tr('hintSweep'),1);
      else if (DOG.D.root.visible&&me.pos.distanceTo(DOG.pos)<2.4) toast(tr('hintDog'),1);
      else if (me.pos.distanceTo(FORTUNE_POS)<2.6) toast(tr('hintFortune'),1); else if (inside&&me.pose==='stand') toast(tr('hintKneel'),1); else if (me.pos.distanceTo(CANDLE_POS)<4) toast(tr('hintCandle'),1); else if (Math.hypot(me.pos.x-WISH_POS.x,me.pos.z-WISH_POS.z)<5.5) toast(tr('hintWish'),1); }
  }
  if (chat){ const m=chat.m; chat.total+=dt; chat.t-=dt;
    me.heading=angLerp(me.heading,Math.atan2(m.pos.x-me.pos.x,m.pos.z-me.pos.z),1-Math.exp(-dt*6));
    me.pose=chat.total<1.4?'bow':'pray'; m.pose=chat.total<1.2?'bow':'pray'; me.walk=lerp(me.walk,0,.2);
    if (chat.t<=0){ m.chatting=false; m.chatCool=35; award(2,'Trò chuyện với '+m.name.split(' ').slice(-2).join(' '),'monk_chat'); me.pose='stand'; chat=null; } }
  if (inside!==lastInside&&me.entered){ net.send({t:'room',h:inside?BUILDINGS.indexOf(inside):-1}); }
  if (inside!==lastInside){ if (inside&&mode==='third'){ enterPOV(); me.autoPOV=true; } if (!inside&&me.autoPOV){ exitPOV(); me.autoPOV=false; }
    if (inside){ toast(tr('hallEnter',{hall:inside.title,deity:DEITY_NAMES[inside.deity]}),4); inside.prayed=false; if (!BLESS.seen.includes(inside.title)){ BLESS.seen.push(inside.title); award(5,'Viếng '+inside.title,'hall_visit'); if (BLESS.seen.length===BUILDINGS.length) showReward(`${GIFT_SVG}<span>${tr('allHalls')}</span>`,true); } } lastInside=inside; }
  me.pos.y=lerp(me.pos.y,groundY(me.pos.x,me.pos.z),1-Math.exp(-dt*14));
  me.P.root.position.copy(me.pos); me.P.root.rotation.y=me.heading;
  applyPose(me.P,me.cur,me.walk,me.phase,dt,me.walk>.5?'stand':me.pose,me.poseT);
  if (me.incenseT>0){ me.incenseT-=dt; me.P.inc.visible=true; if (rnd()<dt*4){ me.P.inc.getWorldPosition(v3); emit(v3.x,v3.y+.5,v3.z,1,.03,.25); } } else me.P.inc.visible=false;

  for (const a of agents) a.update(dt);
  updateDog(dt,T);
  updateRemotes(dt); updateLOD(); updateCandles(T); updateBellSchedule(dt,inside); updateFortuneCup(T,dt); watchFps();

  bellCooldown-=dt; bellSwing*=Math.exp(-dt*.7); bellPivot.rotation.z=Math.sin(T*2.6)*.09*bellSwing;
  idleBellT-=dt; if (idleBellT<0){ idleBellT=R(40,70); ringBell(false); }
  pileT-=dt; if (pileT<0){ pileT=R(30,50); if (PILES.length<4) spawnPile(); }

  // smoke: thin columns that bend and stream sideways with the breeze
  urnLevel*=Math.exp(-dt/150);
  const rate=1.6+urnLevel*.7+crowd*.26+(net.state==='live'?Math.min(liveHere,150)*.03:0);
  if (rnd()<rate*dt) emit(URN.x+R(-.5,.5),2.95,URN.z+R(-.5,.5),1+Math.floor(rate*dt),.3,.45);
  const wa=.5+Math.sin(T*.05)*.6, gust=.55+.35*Math.sin(T*.31)+.15*Math.sin(T*1.7), wx=Math.cos(wa)*gust, wz=Math.sin(wa)*gust*.6;
  for (let i=0;i<SMAX;i++){ if (sAge[i]>=sLife[i]){ sAlpha[i]=0; continue; }
    sAge[i]+=dt; const k=i*3, a=sAge[i]/sLife[i], lift=smooth(0,.25,a);
    sVel[k]+=((wx*lift)-sVel[k])*dt*.45+Math.sin(T*.9+sPos[k+1]*1.3+sSeed[i])*.08*dt; sVel[k+2]+=((wz*lift)-sVel[k+2])*dt*.45+Math.cos(T*.7+sPos[k+1]+sSeed[i])*.06*dt;
    sVel[k+1]+=(.12-sVel[k+1])*dt*.3;
    sPos[k]+=sVel[k]*dt; sPos[k+1]+=sVel[k+1]*dt; sPos[k+2]+=sVel[k+2]*dt;
    sSize[i]=smokeLevel===1?Math.min(.75,.14+sAge[i]*.14):Math.min(1.8,.22+sAge[i]*.4); sAlpha[i]=smooth(0,.12,a)*Math.pow(1-a,1.2)*(.26+.1*(1-dayF)); }
  smokeGeo.attributes.position.needsUpdate=true; smokeGeo.attributes.aSize.needsUpdate=true; smokeGeo.attributes.aAlpha.needsUpdate=true;
  scene.fog.density=.0019+crowd*.00003+(1-dayF)*.0016;

  for (let i=0;i<FF;i++){ const b=ffBase[i]; ffPos[i*3]=b[0]+Math.sin(T*.7+b[3])*.8; ffPos[i*3+1]=b[1]+Math.sin(T*1.3+b[3]*2)*.3; ffPos[i*3+2]=b[2]+Math.cos(T*.6+b[3])*.8; ffAlpha[i]=(1-dayF)*Math.max(0,Math.sin(T*2+b[3]*3))*.9; }
  ffGeo.attributes.position.needsUpdate=true; ffGeo.attributes.aAlpha.needsUpdate=true;
  cloudCyl.rotation.y+=dt*.003;

  // camera
  for (const b of BUILDINGS) b.cut.visible=!(mode==='third'&&inside===b);
  if (mode==='pov'){
    const eye=me.pose==='sit'?.85:['kneel','prostrate'].includes(me.pose)?1.0:1.55;
    camera.position.set(me.pos.x+Math.sin(me.heading)*.12,me.pos.y+eye*(me.P.h/1.7),me.pos.z+Math.cos(me.heading)*.12);
    camera.lookAt(camera.position.x+Math.sin(me.heading)*Math.cos(povPitch),camera.position.y+Math.sin(povPitch),camera.position.z+Math.cos(me.heading)*Math.cos(povPitch));
    camTarget.copy(me.pos);
  } else {
    let tx,ty,tz,dist,pitch;
    if (me.entered){ tx=me.pos.x; ty=me.pos.y+1.6; tz=me.pos.z; dist=inside?Math.min(camDist,9):camDist; pitch=inside?1.3:clamp(.18+(camDist-6)*.006,.18,.5); if (inside) camYaw=angLerp(camYaw,inside.rot,1-Math.exp(-dt*3)); }
    else { camYaw=reduceMotion?0:Math.sin(T*.08)*.35; tx=0; ty=3; tz=4; dist=54; pitch=.24; }
    curDist=lerp(curDist,dist,1-Math.exp(-dt*4)); curPitch=lerp(curPitch,pitch,1-Math.exp(-dt*4));
    camTarget.lerp(v3.set(tx,ty,tz),1-Math.exp(-dt*4));
    camera.position.set(camTarget.x+Math.sin(camYaw)*Math.cos(curPitch)*curDist,camTarget.y+Math.sin(curPitch)*curDist,camTarget.z+Math.cos(camYaw)*Math.cos(curPitch)*curDist);
    camera.lookAt(camTarget);
  }
  sun.target.position.set(camTarget.x,0,camTarget.z); if (sun.userData.dir) sun.position.copy(sun.userData.dir).multiplyScalar(90).add(sun.target.position);

  // labels and bubbles
  const Wd=innerWidth, Hd=innerHeight; let shown=0, here=me.entered?1:0;
  const pv=new THREE.Vector3();
  const place=(el,pos,h,maxD=30)=>{ pv.copy(pos); pv.y+=h; const d=camTarget.distanceTo(pos); pv.project(camera);
    if (pv.z>1||d>maxD||Math.abs(pv.x)>1.1||Math.abs(pv.y)>1.1){ el.hidden=true; return false; }
    el.hidden=false; el.style.transform=`translate(${(pv.x*.5+.5)*Wd}px,${(-pv.y*.5+.5)*Hd}px) translate(-50%,-100%)`; return true; };
  const lh=a=>a.P.h*(['kneel','prostrate'].includes(a.pose)?.62:a.pose==='sit'?.55:1)+.35;
  for (const a of agents){ if (a.active) here++; if (!a.label) continue; if (!a.active){ a.label.hidden=true; continue; } if (shown<14&&place(a.label,a.pos,lh(a),me.entered?(mode==='pov'?14:18):70)) shown++; else a.label.hidden=true; }
  if (me.label){ if (mode==='pov') me.label.hidden=true; else place(me.label,me.pos,lh(me),99); }
  for (const b of BUILDINGS){ if (inside||!me.entered){ b.label.hidden=true; continue; } place(b.label,V3(b.labelAt[0],0,b.labelAt[1]),3.4,22); }
  $('#here').textContent=net.state==='live'?liveHere:here;
  sayT-=dt; if (sayT<0){ sayT=6; sayI=(sayI+1)%SAYINGS.length; preachBubble.textContent=SAYINGS[sayI]; }
  if ((!me.entered||me.pos.distanceTo(PREACHER.pos)<16)&&sayT>1.2&&!inside) place(preachBubble,PREACHER.pos,2.9,me.entered?40:90); else preachBubble.hidden=true;
  // my prayer bubble: kneeling or praying inside a hall, or holding incense at the urn
  const praying=me.entered&&!chat&&me.walk<.3&&PRAYPOSES.includes(me.pose)&&(inside||me.incenseT>0);
  if (praying){ me.prayT-=dt; if (me.prayT===undefined||me.prayT<0||Number.isNaN(me.prayT)){ me.prayT=4.2; me.prayI=(me.prayI||0)+1; myPray.textContent=prayerLine(inside,me.prayI-1); }
    if (mode==='pov'){ myPray.hidden=false; myPray.style.transform=`translate(${Wd/2}px,${Hd*.8}px) translate(-50%,-100%)`; } else place(myPray,me.pos,lh(me)+.35,99); }
  else myPray.hidden=true;
  // visitors and monks praying in the halls get their own bubbles (nearest three)
  const prayers=agents.filter(a=>a.active&&a.walk<.3&&!a.chatting&&PRAYPOSES.includes(a.pose)).map(a=>({a,b:insideOf(a.pos.x,a.pos.z),d:a.pos.distanceTo(me.entered?me.pos:camTarget)})).filter(x=>x.b&&x.d<16).sort((p,q)=>p.d-q.d).slice(0,3);
  npcPray.forEach((el,i)=>{ const p=prayers[i]; if (!p){ el.hidden=true; return; } const a=p.a; if (!a.prayLine||a.prayFor!==p.b){ a.prayFor=p.b; a.prayLine=rnd()<.6?INVOKE[p.b.deity]+'.':pick(WISHES); } el.textContent=a.prayLine; place(el,a.pos,lh(a)+.3,40); });
  if (chat){ if (chat.total<1.8){ meBubble.textContent=chat.mine; if (mode==='pov') meBubble.hidden=true; else place(meBubble,me.pos,me.P.h+.75,99); } else meBubble.hidden=true;
    if (chat.total>1.3){ monkBubble.innerHTML=`${chat.m.name}: ${chat.line}<small>${Math.max(1,Math.ceil(chat.t))}s</small>`; place(monkBubble,chat.m.pos,chat.m.P.h+.75,99); } else monkBubble.hidden=true; }
  else { meBubble.hidden=true; monkBubble.hidden=true; }
  featuresLabels(place,lh,dt);

  onlineT-=dt; if (onlineT<0){ onlineT=30; if (net.state!=='live') refreshStats(); }
  if (toastT>0){ toastT-=dt; if (toastT<=0) toastEl.setAttribute('data-off',''); }
  rewardBusy-=dt; if (rewardBusy<=0&&rewardQ.length){ const [html,gift]=rewardQ.shift(); rewardEl.innerHTML=html; rewardEl.classList.toggle('gift',gift); rewardEl.classList.remove('go'); void rewardEl.offsetWidth; rewardEl.classList.add('go'); rewardBusy=1.6; }

  if (AC&&!muted){ const t=nowA(), night=1-dayF;
    windG.gain.setTargetAtTime(.035+.02*Math.sin(T*.2),t,.5); murmurG.gain.setTargetAtTime(.0015*crowd*(.4+.6*dayF)*(inside?.4:1),t,.5);
    cricketG.gain.setTargetAtTime(night*.022*(Math.sin(T*7.5)>.1?1:0),t,.012);
    birdT-=dt; if (birdT<0){ birdT=R(1.2,4.5); if (dayF>.4&&!inside) chirp(dayF); }
    frogT-=dt; if (frogT<0){ frogT=R(1.5,5); if (night>.5) frog(night*volAt(V3(12,0,9))); }
    const hallD=Math.hypot(me.pos.x,me.pos.z+16), chantV=clamp(1-hallD/26,0,1);
    chantG.gain.setTargetAtTime(chantV*.05,t,.3);
    const bNow=Math.floor((net.state==='live'?net.now():Date.now())/720); if (bNow!==beatI){ beatI=bNow; const f=MELODY[beatI%MELODY.length]; chantOsc[0].frequency.setTargetAtTime(f,t,.04); chantOsc[1].frequency.setTargetAtTime(f,t,.04); chantOsc[2].frequency.setTargetAtTime(f*1.5,t,.04);
      if (chantV>.02) moSound(chantV*.9); if (beatI%16===0&&chantV>.02) bowlSound(chantV); } }

  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  renderer.setRenderTarget(null); renderer.render(postScene,postCam);
  requestAnimationFrame(frame);
}
applyCrowd(); resize(); setHour(hour); initFeatures();
requestAnimationFrame(frame);
