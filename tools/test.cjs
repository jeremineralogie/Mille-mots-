// Test de jouabilité : résout une grille de chaque mode dans un navigateur mobile, en jouant comme un humain.
const {chromium,devices}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const DOCS=path.join(__dirname,'../docs');const SHOT=process.env.SHOTS||'';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let f=path.join(DOCS,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});s.end(d)})}).listen(0);
const port=srv.address().port;
(async()=>{
  const b=await chromium.launch();const ctx=await b.newContext({...devices['iPhone 13']});const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto(`http://localhost:${port}/`);await p.waitForSelector('.logo');
  if(SHOT)await p.screenshot({path:SHOT+'/home.png',fullPage:true});
  const results=[];
  const theme=process.env.THEME||'geo';
  for(const [mode,diff] of [['cache',0],['croises',1],['fleches',0],['meles',0],['meles',2],['ana',1],['croises',2],['fleches',2]]){
    const n=await p.evaluate(([t,m,d])=>{const L=levels(t,m);const i=L.findIndex(x=>x.d===d);return i+1},[theme,mode,diff]);
    if(!n){results.push(`${mode}/${diff} : aucune grille`);continue}
    await p.evaluate(([m,t,n])=>{store.set(P+'mode',m);openLevel(m,themeById(t),n)},[mode,theme,n]);
    await p.waitForSelector('.play');await p.waitForTimeout(150);
    if(SHOT)await p.screenshot({path:`${SHOT}/${mode}-${diff}.png`});
    const lv=await p.evaluate(([t,m,n])=>decode(m,levels(t,m)[n-1].lv),[theme,mode,n]);
    const t0=Date.now();
    if(mode==='cache'){for(let r=0;r<lv.rows.length;r++){await p.click(`.crow[data-r="${r}"] .t[data-k="${r},0"]`);for(const ch of lv.rows[r].a)await p.click(`#kbd button[data-k="${ch}"]`)}}
    else if(mode==='croises'||mode==='fleches'){for(const e of lv.entries){const k=e.r+','+e.c;
        if(mode==='fleches'){await p.click(`.qq[data-e="${lv.entries.indexOf(e)}"]`)}else{await p.click(`.t[data-k="${k}"]`);const d=await p.evaluate(()=>document.querySelector('#cb-t b').textContent);if((e.d==='A')!==d.includes('→'))await p.click(`.t[data-k="${k}"]`)}
        // tape tout le mot (les cases déjà remplies sont sautées automatiquement, on retape donc lettre par lettre depuis le début)
        for(let i=0;i<e.a.length;i++){const kk=(e.d==='A'?e.r:e.r+i)+','+(e.d==='A'?e.c+i:e.c);await p.click(`.t[data-k="${kk}"]`);
          const d=await p.evaluate(()=>document.querySelector('#cb-t b').textContent);const isA=mode==='fleches'?d.includes('▶'):d.includes('→');if(isA!==(e.d==='A'))await p.click(`.t[data-k="${kk}"]`);
          await p.click(`#kbd button[data-k="${e.a[i]}"]`);if(await p.$('.sheet:not([hidden]) .win'))break}
        if(await p.$('.sheet:not([hidden]) .win'))break}}
    else if(mode==='meles'){const box=await p.$eval('#grid',g=>{const r=g.getBoundingClientRect();return{x:r.left,y:r.top}});const cs=await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#grid')).getPropertyValue('--cs')));
      for(const w of lv.words){const c=(r,cc)=>({x:box.x+cc*(cs+3)+cs/2,y:box.y+r*(cs+3)+cs/2});const a=c(w.r,w.c),z=c(w.r+w.dr*(w.a.length-1),w.c+w.dc*(w.a.length-1));
        await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move((a.x+z.x)/2,(a.y+z.y)/2,{steps:3});await p.mouse.move(z.x,z.y,{steps:3});await p.mouse.up()}}
    else if(mode==='ana'){for(let r=0;r<lv.words.length;r++){await p.click(`.crow[data-r="${r}"] .tiles`);const w=lv.words[r];const used=new Set();
        for(const ch of w.a){const j=[...w.s].findIndex((c,j)=>c===ch&&!used.has(j));used.add(j);await p.click(`.lt[data-j="${j}"]`)}}}
    const win=await p.waitForSelector('.sheet:not([hidden]) .win',{timeout:3000}).then(()=>true).catch(()=>false);
    if(SHOT&&win)await p.screenshot({path:`${SHOT}/${mode}-${diff}-win.png`});
    results.push(`${mode.padEnd(8)} ${['facile','moyen','difficile'][diff].padEnd(9)} grille ${n} : ${win?'GAGNÉE':'ÉCHEC'} (${Date.now()-t0} ms)`);
    await p.evaluate(()=>renderHome());
  }
  // défi du jour
  await p.click('#daily');await p.waitForSelector('.play');results.push('défi du jour : '+(await p.$eval('.sub',e=>e.textContent)));
  console.log(results.join('\n'));console.log(errs.length?'ERREURS JS :\n'+errs.join('\n'):'Aucune erreur JavaScript');
  await b.close();srv.close();
})();
