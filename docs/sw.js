// Hors-ligne : la page et les données sont servies depuis le cache, puis rafraîchies en arrière-plan.
const CACHE='mille-cases-v2';
const CORE=['./','index.html','game.js','levels.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/favicon.png','icons/apple-touch-icon.png',
  'fonts/fredoka-500.woff2','fonts/fredoka-600.woff2','fonts/fredoka-700.woff2','fonts/nunito-600.woff2','fonts/nunito-700.woff2','fonts/nunito-800.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(e.request,{ignoreSearch:true});
    const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
    return hit||net;
  }));
});
