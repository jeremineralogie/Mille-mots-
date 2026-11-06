// Génère les icônes PNG de l'application (Playwright)
const {chromium}=require('playwright');const path=require('path');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b43e0"/><stop offset="1" stop-color="#1e1470"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="700" font-size="150" text-anchor="middle" fill="#2a2390">
${[['M',96,96],['I',256,96],['L',96,256],['L',256,256],['E',416,256],['C',256,416]].map(([c,x,y],i)=>`<rect x="${x-70}" y="${y-70}" width="140" height="140" rx="26" fill="${i===3?'#ffc21f':'#fff6e4'}"/><rect x="${x-70}" y="${y+56}" width="140" height="14" rx="7" fill="#d4bd94" opacity=".8"/><text x="${x}" y="${y+52}">${c}</text>`).join('')}
</g></svg>`;
(async()=>{const b=await chromium.launch();const p=await b.newPage();
for(const [name,size] of [['icon-512.png',512],['icon-192.png',192],['apple-touch-icon.png',180],['favicon.png',64]]){
  await p.setViewportSize({width:size,height:size});
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ',`<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({path:path.join(__dirname,'../docs/icons/'+name)});}
await b.close();console.log('icônes OK')})();
