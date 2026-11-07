// Vérification indépendante de docs/levels.js : plafond de définitions et validité de chaque grille.
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const window={};const load=f=>new Function('window',fs.readFileSync(path.join(ROOT,'docs/levels',f),'utf8'))(window);
load('index.js');const IDX=window.MC_INDEX;
IDX.T.forEach(t=>load(t.id+'.js'));
const wordSeen=new Map();let A,C;
const key=c=>c.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const use=new Map(),errs=[];let grids=0,shown=0;
const count=c=>{if(c<0)return;shown++;const k=key(C[c]);use.set(k,(use.get(k)||0)+1)};
for(const tid in window.MC_LV){const T=window.MC_LV[tid];A=T.A;C=T.C;
 for(const m in T.L){T.L[m].forEach((arr,d)=>{if(arr.length!==IDX.counts[tid][m][d])errs.push(`${tid}/${m}/${d} compte faux`)});
 T.L[m].forEach((arr,d)=>arr.forEach((lv,i)=>{
  grids++;const id=`${tid}/${m}/${d}/${i}`;const seen=new Set();
  const once=(w,c)=>{if(seen.has(w))errs.push(id+' mot répété '+A[w]);seen.add(w);const a=A[w];const k=(tid==='cg'||tid==='mix')?a:m+':'+a;if(wordSeen.has(k))errs.push(`mot répété : ${a} (${wordSeen.get(k)} et ${id})`);else wordSeen.set(k,id);if(tid!=='cg'&&tid!=='mix'){if(wordSeen.has(a)&&!wordSeen.get(a).includes(tid+'/'))errs.push(`mot de thème hors de son thème : ${a}`);else if(!wordSeen.has(a))wordSeen.set(a,id)}count(c)};
  if(m==='cache'){once(lv[0][0],lv[0][1]);const h=A[lv[0][0]];if(lv[1].length!==h.length)errs.push(id+' lignes');
    lv[1].forEach(([w,c,p],r)=>{once(w,c);if(A[w][p]!==h[r])errs.push(id+' lettre mystère')})}
  else if(m==='ana')lv.forEach(([w,c,s])=>{once(w,c);if([...s].sort().join('')!==[...A[w]].sort().join('')||s===A[w])errs.push(id+' anagramme '+A[w])});
  else if(m==='meles'){const [N,g,ws]=lv;if(g.length!==N*N)errs.push(id+' taille');
    ws.forEach(([w,c,r,cc,dr,dc])=>{once(w,c);const a=A[w];for(let k=0;k<a.length;k++)if(g[(r+dr*k)*N+cc+dc*k]!==a[k]){errs.push(id+' placement '+a);break}})}
  else{const [H,W,es]=lv,L={};
    es.forEach(([w,c,r,cc,dd])=>{once(w,c);const a=A[w];for(let k=0;k<a.length;k++){const R=dd?r+k:r,Cc=dd?cc:cc+k;if(R>=H||Cc>=W)errs.push(id+' hors grille');const kk=R+','+Cc;if(L[kk]&&L[kk]!==a[k])errs.push(id+' croisement '+a);L[kk]=a[k]}});
    // aucune suite de lettres non définie
    const runs=new Set();for(let R=0;R<H;R++){let s=-1;for(let Cc=0;Cc<=W;Cc++){if(L[R+','+Cc]){if(s<0)s=Cc}else{if(s>=0&&Cc-s>1)runs.add('A'+R+','+s);s=-1}}}
    for(let Cc=0;Cc<W;Cc++){let s=-1;for(let R=0;R<=H;R++){if(L[R+','+Cc]){if(s<0)s=R}else{if(s>=0&&R-s>1)runs.add('D'+s+','+Cc);s=-1}}}
    const want=new Set(es.map(([w,c,r,cc,dd])=>(dd?'D':'A')+r+','+cc));if(runs.size!==want.size||[...runs].some(x=>!want.has(x)))errs.push(id+' mot parasite');
    if(m==='fleches')es.forEach(([w,c,r,cc,dd])=>{const R=dd?r-1:r,Cc=dd?cc:cc-1;if(R<0||Cc<0||L[R+','+Cc])errs.push(id+' case définition')})}
}))}}
const max=Math.max(...use.values());
const dist=[1,2,3].map(n=>[...use.values()].filter(v=>v===n).length);
console.log(`${grids} grilles · ${new Set([...wordSeen.keys()].map(k=>k.replace(/^.*:/,''))).size} mots distincts, jamais deux fois dans un même mode (une seule fois en tout pour le vocabulaire général) · total cohérent : ${grids===IDX.total?'oui':'NON'} · ${shown} définitions affichées · ${use.size} définitions distinctes utilisées sur ${C.length}`);
console.log(`Utilisations par définition : 1× ${dist[0]} · 2× ${dist[1]} · 3× ${dist[2]} · maximum ${max}`);
console.log(errs.length?`ERREURS (${errs.length}) :\n`+errs.slice(0,30).join('\n'):'Toutes les grilles sont valides.');
if(max>IDX.cap||errs.length||grids!==IDX.total)process.exit(1);
