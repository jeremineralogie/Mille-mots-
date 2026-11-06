// Génère les icônes PNG de l'application (Playwright)
const {chromium}=require('playwright');const path=require('path');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b43e0"/><stop offset="1" stop-color="#1e1470"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="700" font-size="120" text-anchor="middle" fill="#2a2390">
${[['R',170,170],['I',342,170],['C',170,342],['K',342,342]].map(([c,x,y],i)=>`<rect x="${x-78}" y="${y-78}" width="156" height="156" rx="28" fill="${i===0?'#ffc21f':'#fff6e4'}"/><rect x="${x-78}" y="${y+64}" width="156" height="14" rx="7" fill="#d4bd94" opacity=".8"/><text x="${x}" y="${y+42}">${c}</text>`).join('')}
</g></svg>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage();
for(const [name,size] of [['icon-512.png',512],['icon-192.png',192],['apple-touch-icon.png',180],['favicon.png',64]]){
  await p.setViewportSize({width:size,height:size});
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ',`<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({path:path.join(__dirname,'../docs/icons/'+name)});}
await b.close();console.log('icônes OK')})();
