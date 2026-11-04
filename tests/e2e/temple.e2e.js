const { chromium } = require('playwright');
// npm i playwright; BASE=http://localhost:8000/ node tests/e2e/temple.e2e.js (site + realtime running, payments.test_mode on, admin password admin-dev)
const BASE=process.env.BASE||'http://127.0.0.1:8800/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const errs=[]; const out=(m)=>console.log(m);
  async function visitor(name, outfit){
    const ctx=await b.newContext({ viewport:{width:1100,height:700} }); const p=await ctx.newPage();
    p.on('pageerror', e=>errs.push(name+' pageerror: '+e.message)); p.on('console', m=>{ if (m.type()==='error') errs.push(name+' console: '+m.text()); });
    await p.goto(BASE+'?debug',{waitUntil:'domcontentloaded',timeout:90000}); await p.waitForFunction(()=>window.__temple, null, {timeout:60000});
    await p.fill('#name', name); await p.click(`#outfits button[data-o="${outfit}"]`); await p.click('#enterBtn');
    await p.waitForFunction(()=>window.__temple.net.state==='live', null, {timeout:20000});
    return p;
  }
  const A=await visitor('Linh','aodai');
  const B=await visitor('Minh','aotrang');
  await A.evaluate(()=>{ const T=window.__temple; T.me.pos.set(2,0,40); });
  await B.evaluate(()=>{ const T=window.__temple; T.me.pos.set(4,0,42); T.me.heading=Math.PI; });
  await A.waitForTimeout(2500);
  out('A sees remotes: '+await A.evaluate(()=>[...window.__temple.remotes.values()].map(r=>r.name).join(',')));
  out('B sees remotes: '+await B.evaluate(()=>[...window.__temple.remotes.values()].map(r=>r.name).join(',')));
  out('A status: '+await A.textContent('#liveStatus')+' | here '+await A.textContent('#here'));
  // B kneels; A should see the pose
  await B.bringToFront(); await B.evaluate(()=>window.__temple.act('Digit4')); await A.waitForTimeout(1500);
  out('A sees Minh pose: '+await A.evaluate(()=>[...window.__temple.remotes.values()][0]?.pose));
  // chat
  await A.bringToFront(); await A.keyboard.press('Enter'); await A.fill('#chatInput','A Di Đà Phật, chào bạn'); await A.keyboard.press('Enter');
  await B.waitForTimeout(1200);
  out('B bubble: '+await B.evaluate(()=>[...window.__temple.remotes.values()][0]?.bubble.textContent));
  await B.screenshot({path:'/tmp/e2e_live.png'});
  // candle: walk A to the stand, order, simulate payment
  await A.bringToFront(); await A.waitForTimeout(8000);
  await A.evaluate(()=>{ const T=window.__temple; T.me.pos.set(T.CANDLE_POS.x,0,T.CANDLE_POS.z+2.2); T.me.heading=Math.PI; });
  await A.waitForTimeout(500);
  await A.evaluate(()=>window.__temple.act('KeyC')); await A.waitForTimeout(600);
  out('candle diag: '+JSON.stringify(await A.evaluate(()=>({modal:!document.querySelector('#modal').hidden,title:document.querySelector('#modalTitle').textContent,body:document.querySelector('#modalBody').textContent.slice(0,120),toast:document.querySelector('#toast').textContent,d:window.__temple.me.pos.distanceTo(window.__temple.CANDLE_POS)}))));
  await A.waitForFunction(()=>{ window.__temple.act('KeyC'); return !!document.querySelector('#cOrder'); },null,{timeout:20000,polling:1000}); await A.fill('#cWish','Bình an cho gia đình'); await A.click('#cOrder');
  await A.waitForSelector('#cSim'); out('QR drawn: '+await A.evaluate(()=>!!document.querySelector('#modal .qr img')));
  await A.screenshot({path:'/tmp/e2e_qr.png'});
  await A.click('#cSim'); await A.waitForFunction(()=>document.querySelector('#cStatus')?.textContent.includes('lit')||document.querySelector('#cStatus')?.textContent.includes('thắp'),null,{timeout:15000});
  out('candle status: '+await A.textContent('#cStatus'));
  await A.click('#modalClose'); await B.bringToFront(); await B.waitForTimeout(2500);
  out('B candles burning: '+await B.evaluate(()=>fetch('api/candles.php').then(r=>r.json()).then(j=>j.candles.length)));
  await A.bringToFront(); await A.evaluate(()=>window.__temple.setHour(20)); await A.waitForTimeout(1500); await A.screenshot({path:'/tmp/e2e_candles_night.png'});
  // wish
  await A.evaluate(()=>{ const T=window.__temple; T.me.pos.set(T.WISH_POS.x+3,0,T.WISH_POS.z+3); }); await A.waitForTimeout(400);
  await A.waitForFunction(()=>{ window.__temple.act('KeyT'); return !!document.querySelector('#wishText'); },null,{timeout:20000,polling:1000}); await A.fill('#wishText','Nguyện cho mọi người bình an'); await A.click('#wishSend');
  await A.waitForTimeout(1500); out('wishes: '+await A.evaluate(()=>fetch('api/wishes.php').then(r=>r.json()).then(j=>j.wishes.map(w=>w.text).join('|'))));
  // fortune inside the main hall
  await A.evaluate(()=>{ const T=window.__temple; T.setHour(11); T.me.pos.set(T.FORTUNE_POS.x+1.2,1.2,T.FORTUNE_POS.z+.6); T.me.heading=-2.2; }); await A.waitForTimeout(800);
  await A.waitForFunction(()=>{ if (!document.querySelector('#modal .verse')&&!window.__x){ window.__x=1; setTimeout(()=>window.__x=0,3000); window.__temple.act('KeyX'); } return !!document.querySelector('#modal .verse'); },null,{timeout:25000,polling:500});
  out('fortune: '+(await A.textContent('#modalBody')).slice(0,80).replace(/\n/g,' / '));
  await A.screenshot({path:'/tmp/e2e_fortune.png'}); await A.click('#modalClose');
  // halls menu
  await A.waitForFunction(()=>{ window.__temple.act('KeyH'); return !!document.querySelector('#modal .halls'); },null,{timeout:20000,polling:1000}); out('halls listed: '+await A.$$eval('#modal .halls button',b=>b.length));
  await A.click('#modal .halls button[data-i="2"]'); await A.waitForTimeout(1500); await A.screenshot({path:'/tmp/e2e_halls.png'});
  // language
  await A.click('#langSeg button[data-v="vi"]'); out('vi title: '+await A.textContent('#settings summary'));
  // report Minh from A
  const rid=await A.evaluate(()=>[...window.__temple.remotes.keys()][0]); await A.evaluate((id)=>{ window.__temple.remotes.get(id).label.click(); },rid);
  await A.fill('#pmWhy','test report'); await A.click('#pmReport'); await A.waitForTimeout(800);
  // leave
  await B.close(); await A.waitForTimeout(1500); out('A remotes after B left: '+await A.evaluate(()=>window.__temple.remotes.size));
  await A.evaluate(()=>{ dispatchEvent(new Event('pagehide')); }); await A.waitForTimeout(500);
  // admin
  const ad=await (await b.newContext()).newPage(); await ad.goto(BASE+'admin/',{waitUntil:'domcontentloaded'}); await ad.fill('input[name=password]','admin-dev'); await ad.click('button');
  await ad.waitForSelector('.tiles'); out('admin tiles: '+(await ad.$$eval('.tile',t=>t.map(x=>x.textContent.trim().replace(/\s+/g,' ')).join(' | '))));
  await ad.goto(BASE+'admin/?tab=reports'); out('admin reports rows: '+await ad.$$eval('tbody tr',r=>r.length)); await ad.screenshot({path:'/tmp/e2e_admin.png'});
  const don=await (await b.newContext()).newPage(); await don.goto(BASE+'donations.php'); out('donations: '+(await don.$$eval('.tile b',t=>t.map(x=>x.textContent).join(' / '))));
  out(errs.length?errs.slice(0,10).join('\n'):'no browser errors');
  await b.close();
})().catch(e=>{ console.error('E2E FAILED', e.message); process.exit(1); });
