'use strict';
/* ------------------ Données pré-calculées (tools/build.mjs) ------------------ */
const D=window.MC_INDEX;
const norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/Œ/g,'OE').replace(/[^A-Z]/g,'');
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(arr,r){for(let i=arr.length-1;i>0;i--){const j=Math.floor(r()*(i+1));const x=arr[i];arr[i]=arr[j];arr[j]=x}return arr}

const ALLTHEMES=D.T;
const THEMES=ALLTHEMES.filter(t=>t.id!=='mix');
const themeById=id=>ALLTHEMES.find(t=>t.id===id);
const colorOf=t=>t.id==='mix'?'#e0a21a':t.color;
const DIFF=['Facile','Moyen','Difficile','Expert'];
const MODES={cache:'Mot caché',croises:'Mots croisés',fleches:'Mots fléchés',meles:'Mots mêlés',ana:'Anagrammes'};
const MODE_DESC={cache:'Une définition par ligne, un mot mystère en colonne',croises:'La grille classique à numéros',fleches:'Les définitions dans la grille',meles:'Retrouvez les mots cachés',ana:'Remettez les lettres dans l’ordre'};
const MODE_IDS=['cache','croises','fleches','meles','ana'];

// Liste ordonnée des grilles d'un thème pour un mode : Facile, puis Moyen, puis Difficile
const LVL={};
for(const t of ALLTHEMES)for(const m of MODE_IDS){const out=[];((D.counts[t.id]||{})[m]||[]).forEach((n,d)=>{for(let i=0;i<n;i++)out.push({d,i})});LVL[t.id+'/'+m]=out}
const levels=(tid,m)=>LVL[tid+'/'+m];
const levelsOf=(tid,m)=>levels(tid,m).length;
const TOTAL=D.total;
const WORDS_TOTAL=D.words;

// Les grilles d'un thème sont chargées à la demande (docs/levels/<thème>.js)
const loading={};
function loadTheme(tid){
  if(window.MC_LV&&window.MC_LV[tid])return Promise.resolve(window.MC_LV[tid]);
  return loading[tid]||(loading[tid]=new Promise((ok,ko)=>{const s=document.createElement('script');s.src='levels/'+tid+'.js?v='+(window.MC_V||'');
    s.onload=()=>window.MC_LV&&window.MC_LV[tid]?ok(window.MC_LV[tid]):ko(new Error('vide'));s.onerror=()=>{delete loading[tid];ko(new Error('réseau'))};document.head.appendChild(s)}));
}
function rawLevel(tid,m,n){const x=levels(tid,m)[n-1];return window.MC_LV[tid].L[m][x.d][x.i]}
let W_,C_;
function decode(mode,lv,T){W_=i=>T.A[i];C_=i=>i<0?'':T.C[i];
  if(mode==='cache'){const rows=lv[1].map(([w,c,p])=>({a:W_(w),clue:C_(c),p}));return{hid:{a:W_(lv[0][0]),clue:C_(lv[0][1])},rows,W:Math.max(...rows.map(x=>x.a.length))}}
  if(mode==='meles'){const N=lv[0],g=lv[1],grid=[];for(let r=0;r<N;r++)grid.push([...g.slice(r*N,r*N+N)]);
    return{N,grid,words:lv[2].map(([w,c,r,cc,dr,dc])=>({a:W_(w),clue:C_(c),r,c:cc,dr,dc}))}}
  if(mode==='ana')return{words:lv.map(([w,c,s])=>({a:W_(w),clue:C_(c),s}))};
  const entries=lv[2].map(([w,c,r,cc,d])=>({a:W_(w),clue:C_(c),r,c:cc,d:d?'D':'A'}));
  entries.sort((x,y)=>x.r-y.r||x.c-y.c||(x.d<y.d?-1:1));
  let n=0,last='';entries.forEach(e=>{const k=e.r+','+e.c;if(k!==last){n++;last=k}e.n=n});
  return{H:lv[0],W:lv[1],entries};
}

const app=document.getElementById('app');
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const fmtN=n=>n.toLocaleString('fr-FR');
const COST={letter:5,word:15};
const P='mk2:';
const todayStr=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const lvKey=(mode,tid,n)=>mode+'-'+tid+'-'+n;
function getMode(){const m=store.get(P+'mode','cache');return MODES[m]?m:'cache'}
const solvedMap=()=>store.get(P+'solved',{});
const coins=()=>store.get(P+'coins',100);
const setCoins=n=>store.set(P+'coins',Math.max(0,n));

/* Défi du jour : une grille du catalogue que le joueur n'a encore jamais ouverte,
   pour ne jamais lui reproposer des définitions déjà vues. Le choix est mémorisé pour la journée. */
function daily(date){
  const memo=store.get(P+'daily',{});
  if(memo.date===date&&memo.pick)return Object.assign({date,key:'daily-'+date},memo.pick);
  const h=hashStr('daily'+date),dayN=Math.floor(new Date(date+'T12:00:00').getTime()/864e5);
  const sol=solvedMap(),r=rng(h);
  const modes=MODE_IDS.map((_,i)=>MODE_IDS[(dayN+i)%MODE_IDS.length]);
  const themes=shuffle(THEMES.slice(),r);
  let pick=null;
  for(const mode of modes){for(const t of themes){const L=levels(t.id,mode);
      const cand=L.map((x,i)=>i+1).filter(n=>{const k=lvKey(mode,t.id,n);return L[n-1].d===1&&!sol[k]&&!store.get(P+'g:'+k,null)});
      if(cand.length){pick={mode,tid:t.id,n:cand[Math.floor(r()*cand.length)]};break}}
    if(pick)break}
  if(!pick){const t=themes[0],mode=modes[0];pick={mode,tid:t.id,n:1+Math.floor(r()*levelsOf(t.id,mode))}}
  store.set(P+'daily',{date,pick});
  return Object.assign({date,key:'daily-'+date},pick);
}
function streak(sol){let n=0;const d=new Date();if(!sol['daily-'+todayStr(d)])d.setDate(d.getDate()-1);while(sol['daily-'+todayStr(d)]){n++;d.setDate(d.getDate()-1)}return n}
let cleanup=null;
function leave(){if(cleanup){cleanup();cleanup=null}document.body.classList.remove('playing')}
