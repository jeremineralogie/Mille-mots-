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

const ICON={
  coin:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffc928" stroke="#a86a00" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#a86a00" stroke-width="1.6"/></svg>',
  cup:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v4a5 5 0 0 1-10 0z" fill="#8fd3ff" stroke="#1b4f8a" stroke-width="1.8"/><path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3" fill="none" stroke="#1b4f8a" stroke-width="1.8"/><path d="M12 12v4M8 20h8l-1-4H9z" fill="#8fd3ff" stroke="#1b4f8a" stroke-width="1.8"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  list:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="5" cy="7" r="1.6" fill="#fff"/><circle cx="5" cy="12" r="1.6" fill="#fff"/><circle cx="5" cy="17" r="1.6" fill="#fff"/></svg>',
  prev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#ffd84a" stroke="#a86a00" stroke-width="1.4" stroke-linejoin="round"/></svg>'
};
const DECO='<svg class="deco" viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="338" cy="34" r="20" fill="rgba(255,244,190,.6)"/><g fill="rgba(255,255,255,.32)"><ellipse cx="66" cy="30" rx="26" ry="8"/><ellipse cx="88" cy="24" rx="15" ry="8"/><ellipse cx="226" cy="46" rx="19" ry="6"/><ellipse cx="240" cy="41" rx="11" ry="6"/></g><path d="M0 104 Q60 72 130 96 T260 90 T400 82 V140 H0Z" fill="rgba(255,255,255,.2)"/><path d="M0 122 Q90 96 190 116 T400 108 V140 H0Z" fill="rgba(20,10,60,.22)"/><g fill="rgba(20,10,60,.22)"><path d="M300 108 l8 -26 l8 26z"/><path d="M318 110 l6 -18 l6 18z"/><path d="M40 118 l7 -22 l7 22z"/></g></svg>';

const isDailyPick=(mode,tid,n)=>{const d=daily(todayStr());return d.mode===mode&&d.tid===tid&&d.n===n};
const pills=()=>{const n=Object.keys(solvedMap()).filter(k=>!k.startsWith('daily-')).length;return `<span class="pill">${ICON.cup}<b>${fmtN(n)}</b></span><span class="pill">${ICON.coin}<b id="coin-n">${fmtN(coins())}</b></span>`};

/* ------------------ Accueil ------------------ */
function renderHome(){
  leave();
  const mode=getMode(),sol=solvedMap(),st=streak(sol);
  const dl=daily(todayStr()),dT=themeById(dl.tid),dDone=!!sol[dl.key];
  const counts={};for(const k in sol){const p=k.split('-');if(p[0]===mode)counts[p[1]]=(counts[p[1]]||0)+1}
  const dateLbl=new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  app.innerHTML=`
  <header class="home-top"><div class="pills">${pills()}</div>
    <h1 class="logo"><span>Mille</span><span>Cases</span></h1>
    <p class="tag">${fmtN(TOTAL)} grilles · ${fmtN(WORDS_TOTAL)} mots · ${THEMES.length} thèmes · 5 façons de jouer</p></header>
  <button class="daily${dDone?' done':''}" id="daily" style="--c:${dT.color}">${DECO}
    <span class="d-k">Défi du jour · ${esc(dateLbl)}</span>
    <span class="d-t">${esc(dT.name)}</span>
    <span class="d-m">${MODES[dl.mode]} · gains doublés${st?` · série de ${st} jour${st>1?'s':''}`:''}</span>
    <span class="d-go">${dDone?'Réussi':'Jouer'}</span></button>
  <div class="modes" role="tablist" aria-label="Façon de jouer">${MODE_IDS.map(m=>`<button role="tab" aria-selected="${m===mode}" data-m="${m}"><b>${MODES[m]}</b><span>${MODE_DESC[m]}</span></button>`).join('')}</div>
  <div class="row-h"><h2>Thèmes</h2><button class="chip" id="rand">Au hasard</button></div>
  <div class="themes">${ALLTHEMES.map(t=>{const L=levelsOf(t.id,mode),c=counts[t.id]||0;return `<button class="th${t.id==='mix'?' mix':''}" data-t="${t.id}" style="--c:${colorOf(t)}"${L?'':' disabled'}>${DECO}
      <span class="th-n">${esc(t.name)}</span>
      <span class="th-bar"><span style="width:${L?(100*c/L).toFixed(1):0}%"></span><em>${c} / ${L}</em></span></button>`}).join('')}</div>
  <details class="install"><summary>Installer sur l'écran d'accueil</summary>
    <div class="inst-g">
      <div><h3>iPhone</h3><ol><li>Ouvrez cette page dans Safari.</li><li>Touchez le bouton Partager (carré avec une flèche).</li><li>Choisissez « Sur l'écran d'accueil ».</li></ol></div>
      <div><h3>Android</h3><ol><li>Ouvrez cette page dans Chrome.</li><li>Touchez le menu ⋮ en haut à droite.</li><li>Choisissez « Ajouter à l'écran d'accueil ».</li></ol></div></div>
    <p class="fine">Une fois installée, l'application fonctionne sans connexion. Pièces et progression restent enregistrées sur cet appareil.</p></details>
  <p class="fine foot">Chaque mot n'apparaît qu'une seule fois dans tout le jeu : jamais deux fois le même. Chaque grille gagnée rapporte des pièces, à dépenser en indices. Réponses sans accents ni traits d'union.</p>
  <p class="fine foot">Définitions issues du <a href="https://fr.wiktionary.org/" target="_blank" rel="noopener">Wiktionnaire</a> (CC BY-SA 4.0), via le jeu de données libre verbarium/french-dictionary ; fréquences Lexique 3.83 et wordfreq.</p>`;
  app.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{store.set(P+'mode',b.dataset.m);renderHome()});
  app.querySelectorAll('.th').forEach(b=>b.onclick=()=>renderTheme(b.dataset.t));
  app.querySelector('#daily').onclick=()=>openLevel(dl.mode,dT,dl.n,true);
  app.querySelector('#rand').onclick=()=>{
    const free=[];ALLTHEMES.forEach(t=>{for(let i=1;i<=levelsOf(t.id,mode);i++)if(!sol[lvKey(mode,t.id,i)]&&!store.get(P+'g:'+lvKey(mode,t.id,i),null))free.push([t,i])});
    if(!free.length){app.querySelector('#rand').textContent='Tout est déjà ouvert !';return}
    const [t,i]=free[Math.floor(Math.random()*free.length)];openLevel(mode,t,i)};
  window.scrollTo(0,0);
}

/* ------------------ Thème ------------------ */
function openLevel(mode,t,n,fromDaily){const L=levels(t.id,mode);if(!L[n-1])return;
  play({mode,theme:t,n,diff:L[n-1].d,key:lvKey(mode,t.id,n),label:fromDaily?'Défi du jour':'Grille '+n,fromDaily})}
const PAGE=60;
function renderTheme(id){
  leave();
  const t=themeById(id),mode=getMode(),sol=solvedMap(),L=levels(id,mode),col=colorOf(t);
  let next=1;while(next<=L.length&&sol[lvKey(mode,id,next)])next++;if(next>L.length)next=1;
  const sec=[0,1,2,3].map(d=>({d,items:L.map((x,i)=>x.d===d?i+1:0).filter(Boolean)})).filter(s=>s.items.length);
  const c=L.filter((x,i)=>sol[lvKey(mode,id,i+1)]).length;
  app.innerHTML=`
  <header class="banner big" style="--c:${col}">${DECO}
    <button class="round green" id="back" aria-label="Accueil">${ICON.back}</button>
    <div class="pills">${pills()}</div>
    <h1 class="title">${esc(t.name)}</h1>
    <p class="sub">${MODES[mode]} · ${c} / ${L.length} résolues</p></header>
  <div class="modes mini" role="tablist" aria-label="Façon de jouer">${MODE_IDS.map(m=>`<button role="tab" aria-selected="${m===mode}" data-m="${m}"><b>${MODES[m]}</b><span>${levelsOf(id,m)} grilles</span></button>`).join('')}</div>
  ${L.length?`<button class="cta" id="go">${c?'Continuer':'Commencer'} · grille ${next}</button>`:'<p class="fine">Pas encore de grille dans ce mode pour ce thème.</p>'}
  ${sec.map(s=>`<section class="lv"><h2>${DIFF[s.d]} <span>${s.items[0]} à ${s.items[s.items.length-1]}</span></h2>
    <div class="lv-g" data-d="${s.d}">${s.items.map((n,j)=>{const k=lvKey(mode,id,n),done=sol[k],started=!done&&store.get(P+'g:'+k,null);
      return `<button data-n="${n}" class="${done?'ok':started?'st':''}"${j>=PAGE?' hidden':''} aria-label="Grille ${n}${done?', résolue':''}">${n}${done?ICON.star:''}</button>`}).join('')}</div>${s.items.length>PAGE?`<button class="chip more" data-more="${s.d}">Afficher les ${s.items.length-PAGE} autres grilles</button>`:''}</section>`).join('')}`;
  app.querySelector('#back').onclick=renderHome;
  app.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{store.set(P+'mode',b.dataset.m);renderTheme(id)});
  const go=app.querySelector('#go');if(go)go.onclick=()=>openLevel(mode,t,next);
  app.querySelectorAll('.lv-g button').forEach(b=>b.onclick=()=>openLevel(mode,t,+b.dataset.n));
  app.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{app.querySelectorAll(`.lv-g[data-d="${b.dataset.more}"] button[hidden]`).forEach(x=>x.hidden=false);b.remove()});
  window.scrollTo(0,0);
}

/* ------------------ Cadre de jeu ------------------ */
function play(ctx){
  leave();
  const back=()=>ctx.fromDaily?renderHome():renderTheme(ctx.theme.id);
  if(!(window.MC_LV&&window.MC_LV[ctx.theme.id])){
    app.innerHTML='<p class="loading">Chargement des grilles…</p>';
    loadTheme(ctx.theme.id).then(()=>play(ctx),()=>{app.innerHTML='<div class="loading"><p>Impossible de charger les grilles. Vérifiez la connexion.</p><button class="btn" id="re">Réessayer</button></div>';app.querySelector('#re').onclick=()=>play(ctx)});
    return}
  const data=decode(ctx.mode,rawLevel(ctx.theme.id,ctx.mode,ctx.n),window.MC_LV[ctx.theme.id]);
  if(ctx.mode==='meles')return playMeles(ctx,data,back);
  if(ctx.mode==='cache')return playCache(ctx,data,back);
  if(ctx.mode==='ana')return playAna(ctx,data,back);
  playGrid(ctx,data,back);
}
function shell(ctx,list){
  document.body.classList.add('playing');
  const col=colorOf(ctx.theme);
  app.innerHTML=`<div class="play">
    <header class="banner" style="--c:${col}">${DECO}
      <button class="round green" id="pb-back" aria-label="Retour">${ICON.back}</button>
      <div class="pills">${pills()}</div>
      <div class="rbtns">${list?`<button class="round blue" id="pb-list" aria-label="Liste des définitions">${ICON.list}</button>`:''}<button class="round green" id="pb-help" aria-label="Indices et options">${ICON.menu}</button></div>
      <h1 class="title">${esc(ctx.theme.name)}</h1>
      <p class="sub">${MODES[ctx.mode]} · ${esc(ctx.label)} · ${DIFF[ctx.diff]} · <span id="timer">0:00</span></p></header>
    <div id="pbody" class="pbody"></div>
    <div class="sheet" id="sheet" hidden><div class="sheet-bg" data-close></div><div class="sheet-c" id="sheet-c" role="dialog" aria-modal="true"></div></div></div>`;
  const sheet=app.querySelector('#sheet'),sc=app.querySelector('#sheet-c');
  sheet.addEventListener('click',e=>{if(e.target.closest('[data-close]'))sheet.hidden=true});
  const onEsc=e=>{if(e.key==='Escape'&&!sheet.hidden){sheet.hidden=true}};document.addEventListener('keydown',onEsc);
  return{body:app.querySelector('#pbody'),open(html){sc.innerHTML=html;sheet.hidden=false;sc.scrollTop=0;return sc},close(){sheet.hidden=true},isOpen:()=>!sheet.hidden,off:()=>document.removeEventListener('keydown',onEsc)};
}
const KBD=`<div class="kbd" id="kbd">${['AZERTYUIOP','QSDFGHJKLM','WXCVBN⌫'].map(r=>`<div class="kr">${[...r].map(k=>`<button data-k="${k}" class="${k==='⌫'?'wide del':''}" aria-label="${k==='⌫'?'Effacer':k}">${k}</button>`).join('')}</div>`).join('')}</div>`;
function startTimer(S,save,isDone){const el=app.querySelector('#timer');el.textContent=fmtT(S.t);
  const id=setInterval(()=>{if(document.hidden||isDone())return;S.t++;el.textContent=fmtT(S.t);if(S.t%5===0)save()},1000);return()=>clearInterval(id)}
function refreshCoins(){const e=app.querySelector('#coin-n');if(e)e.textContent=fmtN(coins())}
function spend(n,ui){if(coins()<n){ui.toast(`Il vous faut ${n} pièces. Gagnez-en en terminant des grilles.`);return false}setCoins(coins()-n);refreshCoins();return true}
function helpSheet(ui,items,note,onAct,onReset){
  const c=ui.open(`<h2 class="sh-t">Indices</h2><p class="sh-c">${ICON.coin}<b>${fmtN(coins())}</b> pièces</p><div class="hg">${items.map(i=>`<button class="btn${i.cost?' gold':''}" data-a="${i.a}">${i.label}${i.cost?`<span>${ICON.coin}${i.cost}</span>`:'<span>gratuit</span>'}</button>`).join('')}</div>
    <p class="fine" id="h-note">${note}</p><div class="sheet-a"><button class="btn red" data-a="re">Recommencer la grille</button><button class="btn ghost" data-close>Fermer</button></div>`);
  c.addEventListener('click',ev=>{const b=ev.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='re'){c.querySelector('#h-note').innerHTML=`Effacer toutes les lettres et le chrono ? <button class="btn red sm" id="h-yes">Effacer</button>`;c.querySelector('#h-yes').onclick=onReset;return}
    onAct(a)});
}
function resetGame(ctx,SK){store.del(SK);const sol=solvedMap();delete sol[ctx.key];store.set(P+'solved',sol);play(ctx)}
function winSheet(ui,ctx,S,back,extra){
  const sol=solvedMap();let gain=0,dailyWin=false;
  if(!sol[ctx.key]){gain=[10,15,20,25][ctx.diff]+(S.help?0:5);sol[ctx.key]={t:S.t,h:S.help||0}}
  const dk='daily-'+todayStr();
  if(isDailyPick(ctx.mode,ctx.theme.id,ctx.n)&&!sol[dk]){sol[dk]=1;dailyWin=true;gain=gain*2||10}
  if(gain){store.set(P+'solved',sol);setCoins(coins()+gain);refreshCoins()}
  const L=levelsOf(ctx.theme.id,ctx.mode),hasNext=!ctx.fromDaily&&ctx.n<L;
  const c=ui.open(`<div class="win-stars">${ICON.star}${ICON.star}${ICON.star}</div><h2 class="sh-t win">Bravo !</h2>${dailyWin?'<p class="win-s">Défi du jour réussi</p>':''}${extra||''}
    <p class="win-s">${fmtT(S.t)} · ${S.help?S.help+' indice'+(S.help>1?'s':''):'sans indice'}${gain?` · <b>+${gain}</b> ${ICON.coin}`:''}</p>
    <div class="sheet-a">${hasNext?`<button class="cta" id="w-next">Grille suivante</button>`:''}<button class="btn" id="w-back">${ctx.fromDaily?'Accueil':'Toutes les grilles'}</button><button class="btn ghost" data-close>Revoir la grille</button></div>`);
  if(hasNext)c.querySelector('#w-next').onclick=()=>openLevel(ctx.mode,ctx.theme,ctx.n+1);
  c.querySelector('#w-back').onclick=back;
}
function addToast(ui){const el=document.createElement('div');el.className='toast';el.hidden=true;el.setAttribute('role','status');app.querySelector('.play').appendChild(el);let tm;
  ui.toast=t=>{el.textContent=t;el.hidden=false;clearTimeout(tm);tm=setTimeout(()=>el.hidden=true,2600)}}
function physKeys(ui,h){const f=ev=>{if(ui.isOpen()||ev.metaKey||ev.ctrlKey||ev.altKey)return;
  if(/^Arrow/.test(ev.key)){ev.preventDefault();h.arrow(ev.key)}
  else if(ev.key==='Tab'){ev.preventDefault();h.tab(ev.shiftKey)}
  else if(ev.key===' '){ev.preventDefault();h.space&&h.space()}
  else if(ev.key==='Backspace'||ev.key==='Delete'){ev.preventDefault();h.erase()}
  else if(ev.key.length===1){const ch=norm(ev.key);if(ch.length===1){ev.preventDefault();h.type(ch)}}};
  document.addEventListener('keydown',f);return()=>document.removeEventListener('keydown',f)}
function newState(ctx,init){const SK=P+'g:'+ctx.key;const S=store.get(SK,null)||init();return{SK,S,save:()=>store.set(SK,S)}}
function bindKbd(ui,type,erase){ui.body.querySelector('#kbd').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;b.dataset.k==='⌫'?erase():type(b.dataset.k)})}

/* ------------------ Mot caché ------------------ */
function playCache(ctx,C,back){
  const ui=shell(ctx,true);addToast(ui);
  const {SK,S,save}=newState(ctx,()=>({fill:{},rev:{},t:0,done:false,help:0}));
  const R=C.rows.length,W=C.W;
  ui.body.innerHTML=`
    <div class="cluebar"><button class="nav" id="cb-prev" aria-label="Ligne précédente">${ICON.prev}</button><div class="cb-t" id="cb-t" aria-live="polite"></div><button class="nav" id="cb-next" aria-label="Ligne suivante">${ICON.next}</button></div>
    <div class="stage" id="stage"><div class="board cache-b" id="board">${C.rows.map((w,r)=>`<div class="crow" data-r="${r}"><div class="cq">${esc(w.clue)}</div><div class="tiles">${[...w.a].map((ch,c)=>`<div class="t${c===w.p?' hid':''}" data-k="${r},${c}"><span></span></div>`).join('')}</div></div>`).join('')}</div></div>
    <div class="mystery" id="mys"></div>
    ${KBD}`;
  const board=ui.body.querySelector('#board'),els={};board.querySelectorAll('.t').forEach(e=>els[e.dataset.k]=e);
  const ks=r=>[...C.rows[r].a].map((_,c)=>r+','+c);
  const rowOk=r=>ks(r).every(k=>S.fill[k]===C.rows[r].a[+k.split(',')[1]]);
  let sr=0,sc=0;{const r=C.rows.findIndex((_,i)=>ks(i).some(k=>!S.fill[k]));sr=r<0?0:r;const k=ks(sr).find(k=>!S.fill[k]);sc=k?+k.split(',')[1]:0}
  const ch=k=>{const[r,c]=k.split(',').map(Number);return C.rows[r].a[c]};
  function paint(){
    board.querySelectorAll('.crow').forEach(row=>{const r=+row.dataset.r;row.classList.toggle('on',r===sr);row.classList.toggle('ok',rowOk(r))});
    for(const k in els){const e=els[k];e.firstChild.textContent=S.fill[k]||'';e.classList.toggle('cur',k===sr+','+sc);e.classList.toggle('rev',!!S.rev[k])}
    const w=C.rows[sr];ui.body.querySelector('#cb-t').innerHTML=`<b>${sr+1}</b><span>${esc(w.clue)}</span><i>${w.a.length} lettres</i>`;
    ui.body.querySelector('#mys').innerHTML=`<span class="m-l">Mot mystère</span><span class="m-w">${C.rows.map((w,r)=>{const v=S.fill[r+','+w.p];return `<i class="${v?'f':''}">${v||''}</i>`}).join('')}</span>`;
    board.classList.toggle('solved',S.done)}
  function fit(){const st=ui.body.querySelector('#stage').getBoundingClientRect();const wide=st.width>=620;const clw=wide?Math.min(300,Math.floor(st.width*.36)):0,gap=4,pad=26;
    const cs=Math.max(20,Math.floor(Math.min((st.width-pad-clw-(clw?8:0)-(W-1)*gap)/W,(st.height-pad-(R-1)*gap)/R,54)));
    board.style.setProperty('--cs',cs+'px');board.style.setProperty('--clw',clw+'px');board.classList.toggle('wide',wide)}
  const firstEmpty=r=>{const k=ks(r).find(k=>!S.fill[k]);return k?+k.split(',')[1]:0};
  function go(r,c){sr=(r+R)%R;sc=c==null?firstEmpty(sr):Math.max(0,Math.min(C.rows[sr].a.length-1,c));paint()}
  function type(L){if(S.done)return;const k=sr+','+sc;if(!S.rev[k])S.fill[k]=L;
    const rest=ks(sr).slice(sc+1).find(k=>!S.fill[k]);
    if(rest)sc=+rest.split(',')[1];
    else if(ks(sr).every(k=>S.fill[k])){if(rowOk(sr)){const nr=[...Array(R).keys()].map(i=>(sr+1+i)%R).find(i=>ks(i).some(k=>!S.fill[k]));if(nr!=null){sr=nr;sc=firstEmpty(nr)}}else if(sc<C.rows[sr].a.length-1)sc++}
    else if(sc<C.rows[sr].a.length-1)sc++;
    save();paint();check()}
  function erase(){if(S.done)return;const k=sr+','+sc;if(S.fill[k]&&!S.rev[k])delete S.fill[k];else if(sc>0){sc--;if(!S.rev[sr+','+sc])delete S.fill[sr+','+sc]}save();paint()}
  const extra=()=>`<div class="reveal"><span>Mot mystère</span><b>${C.hid.a}</b><em>${esc(C.hid.clue)}</em></div>`;
  function check(){const all=Object.keys(els);if(all.every(k=>S.fill[k]===ch(k))){if(!S.done){S.done=true;save();paint();winSheet(ui,ctx,S,back,extra())}}
    else if(all.every(k=>S.fill[k]))ui.toast('Grille pleine, mais il reste des erreurs.')}
  function reveal(keys){keys.forEach(k=>{if(S.fill[k]!==ch(k)){S.fill[k]=ch(k);S.rev[k]=1}});S.help++;save();paint();check()}
  board.addEventListener('click',ev=>{const t=ev.target.closest('.t');if(t){const[r,c]=t.dataset.k.split(',').map(Number);go(r,c);return}
    const row=ev.target.closest('.crow');if(row)go(+row.dataset.r)});
  bindKbd(ui,type,erase);
  ui.body.querySelector('#cb-prev').onclick=()=>go(sr-1);ui.body.querySelector('#cb-next').onclick=()=>go(sr+1);
  const unKeys=physKeys(ui,{type,erase,tab:b=>go(sr+(b?-1:1)),arrow:k=>k==='ArrowUp'?go(sr-1,sc):k==='ArrowDown'?go(sr+1,sc):go(sr,sc+(k==='ArrowLeft'?-1:1))});
  app.querySelector('#pb-back').onclick=()=>{save();back()};
  app.querySelector('#pb-list').onclick=()=>{const c=ui.open(`<h2 class="sh-t">Définitions</h2><ol class="cl">${C.rows.map((w,r)=>`<li data-r="${r}" class="${rowOk(r)?'ok':''}"><b>${r+1}</b><span>${esc(w.clue)} <i>(${w.a.length})</i></span></li>`).join('')}</ol><div class="sheet-a"><button class="btn ghost" data-close>Fermer</button></div>`);
    c.querySelectorAll('li').forEach(l=>l.onclick=()=>{go(+l.dataset.r);ui.close()})};
  app.querySelector('#pb-help').onclick=()=>helpSheet(ui,[{a:'cw',label:'Vérifier la ligne',cost:0},{a:'cg',label:'Vérifier la grille',cost:0},{a:'rl',label:'Révéler la lettre',cost:COST.letter},{a:'rw',label:'Révéler le mot',cost:COST.word}],
    'Les cases roses forment le mot mystère, lié au thème.',a=>{
      if(a==='cw'||a==='cg'){const keys=a==='cw'?ks(sr):Object.keys(els);let b=0;keys.forEach(k=>{if(S.fill[k]&&S.fill[k]!==ch(k)){els[k].classList.add('bad');b++}});ui.close();ui.toast(b?`${b} lettre${b>1?'s':''} fausse${b>1?'s':''}`:'Aucune erreur');setTimeout(()=>Object.values(els).forEach(e=>e.classList.remove('bad')),2600);return}
      if(a==='rl'&&spend(COST.letter,ui)){reveal([sr+','+sc]);ui.close()}
      if(a==='rw'&&spend(COST.word,ui)){reveal(ks(sr));ui.close()}},()=>resetGame(ctx,SK));
  const stopT=startTimer(S,save,()=>S.done),ro=new ResizeObserver(fit);ro.observe(ui.body.querySelector('#stage'));
  cleanup=()=>{save();stopT();ro.disconnect();unKeys();ui.off()};
  fit();paint();if(S.done)setTimeout(()=>winSheet(ui,ctx,S,back,extra()),50);
}

/* ------------------ Croisés & fléchés ------------------ */
function playGrid(ctx,G,back){
  const fl=ctx.mode==='fleches';
  const ui=shell(ctx,true);addToast(ui);
  const {SK,S,save}=newState(ctx,()=>({fill:{},rev:{},t:0,done:false,help:0}));
  const cells={},clues={};
  G.entries.forEach((e,idx)=>{e.i=idx;for(let i=0;i<e.a.length;i++){const k=(e.d==='A'?e.r:e.r+i)+','+(e.d==='A'?e.c+i:e.c);(cells[k]=cells[k]||{ch:e.a[i]})[e.d]=e;if(i===0)cells[k].n=e.n}
    if(fl){const k=(e.d==='A'?e.r:e.r-1)+','+(e.d==='A'?e.c-1:e.c);(clues[k]=clues[k]||[]).push(e)}});
  Object.values(clues).forEach(a=>a.sort((x,y)=>x.d<y.d?-1:1));
  const cellsOf=e=>Array.from({length:e.a.length},(_,i)=>(e.d==='A'?e.r:e.r+i)+','+(e.d==='A'?e.c+i:e.c));
  const ordered=[...G.entries.filter(e=>e.d==='A'),...G.entries.filter(e=>e.d==='D')];
  ui.body.innerHTML=`
    <div class="cluebar"><button class="nav" id="cb-prev" aria-label="Mot précédent">${ICON.prev}</button><button class="cb-t" id="cb-t" aria-live="polite"></button><button class="nav" id="cb-next" aria-label="Mot suivant">${ICON.next}</button></div>
    <div class="stage" id="stage"><div class="board"><div class="grid${fl?' fl':''}" id="grid" style="grid-template-columns:repeat(${G.W},var(--cs));grid-template-rows:repeat(${G.H},var(--cs))"></div></div></div>
    ${KBD}`;
  const grid=ui.body.querySelector('#grid'),els={};
  for(let r=0;r<G.H;r++)for(let c=0;c<G.W;c++){const k=r+','+c,d=document.createElement('div');
    if(cells[k]){d.className='t';d.dataset.k=k;d.innerHTML=(!fl&&cells[k].n?`<span class="n">${cells[k].n}</span>`:'')+'<span class="v"></span>';els[k]=d}
    else if(clues[k]){d.className='q'+(clues[k].length>1?' two':'');d.innerHTML=clues[k].map(e=>`<span class="qq" data-e="${e.i}"><span class="qt">${esc(e.clue)}</span><span class="ar ${e.d}">${e.d==='A'?'▶':'▼'}</span></span>`).join('')}
    else d.className='x';
    grid.appendChild(d)}
  let sel,dir;{const e=ordered.find(e=>cellsOf(e).some(k=>!S.fill[k]))||ordered[0];const ks=cellsOf(e);sel=ks.find(k=>!S.fill[k])||ks[0];dir=e.d}
  const wordAt=(k,d)=>cells[k][d]||cells[k][d==='A'?'D':'A'];
  const isOk=e=>cellsOf(e).every(k=>S.fill[k]===cells[k].ch);
  function paint(){const e=wordAt(sel,dir);dir=e.d;const wc=new Set(cellsOf(e));
    for(const k in els){const el=els[k];el.querySelector('.v').textContent=S.fill[k]||'';el.classList.toggle('cur',k===sel);el.classList.toggle('word',wc.has(k)&&k!==sel);el.classList.toggle('rev',!!S.rev[k]);el.classList.toggle('okw',!S.done&&((cells[k].A&&isOk(cells[k].A))||(cells[k].D&&isOk(cells[k].D))))}
    if(fl)grid.querySelectorAll('.qq').forEach(q=>{const en=G.entries[+q.dataset.e];q.classList.toggle('on',en===e);q.classList.toggle('ok',isOk(en))});
    ui.body.querySelector('#cb-t').innerHTML=`<b>${fl?(e.d==='A'?'▶':'▼'):e.n+(e.d==='A'?' →':' ↓')}</b><span>${esc(e.clue)}</span><i>${e.a.length} lettres</i>`;
    grid.classList.toggle('solved',S.done);if(typeof follow==='function')follow()}
  const stage=ui.body.querySelector('#stage');
  // En mots fléchés, une case-définition doit rester lisible : en dessous de MINQ px, la grille devient défilable.
  const MINQ=38;
  function fit(){const st=stage.getBoundingClientRect();const gap=fl?2:3,pad=26;
    let cs=Math.max(18,Math.floor(Math.min((st.width-pad-(G.W-1)*gap)/G.W,(st.height-pad-(G.H-1)*gap)/G.H,fl?64:56)));
    const scroll=fl&&cs<MINQ;if(scroll)cs=MINQ;
    stage.classList.toggle('scroll',scroll);grid.style.setProperty('--cs',cs+'px');if(scroll)follow()}
  function follow(){if(!stage.classList.contains('scroll'))return;const e=wordAt(sel,dir),ks=cellsOf(e);
    const first=els[ks[0]],last=els[ks[ks.length-1]],cur=els[sel],q=grid.querySelector(`.qq[data-e="${e.i}"]`);
    [q&&q.parentElement,first,last,cur].forEach(el=>{if(el)el.scrollIntoView({block:'nearest',inline:'nearest'})})}
  function selectWord(e){const ks=cellsOf(e);sel=ks.find(k=>!S.fill[k])||ks[0];dir=e.d;paint()}
  function step(delta){const [r,c]=sel.split(',').map(Number);const k=dir==='A'?r+','+(c+delta):(r+delta)+','+c;if(cells[k]){sel=k;return true}return false}
  function nextWord(back){let i=ordered.indexOf(wordAt(sel,dir));for(let t=0;t<ordered.length;t++){i=(i+(back?-1:1)+ordered.length)%ordered.length;if(!isOk(ordered[i])||t===ordered.length-1){selectWord(ordered[i]);return}}}
  function type(ch){if(S.done)return;if(!S.rev[sel])S.fill[sel]=ch;const e=wordAt(sel,dir),ks=cellsOf(e),i=ks.indexOf(sel);
    const nx=ks.slice(i+1).find(k=>!S.fill[k]);if(nx)sel=nx;else if(ks.every(k=>S.fill[k])&&isOk(e)){const inc=ordered.find(w=>cellsOf(w).some(k=>!S.fill[k]));if(inc)selectWord(inc)}else step(1);
    save();paint();check()}
  function erase(){if(S.done)return;if(S.fill[sel]&&!S.rev[sel])delete S.fill[sel];else{step(-1);if(!S.rev[sel])delete S.fill[sel]}save();paint()}
  function toggleDir(){if(cells[sel].A&&cells[sel].D){dir=dir==='A'?'D':'A';paint()}}
  function check(){const keys=Object.keys(cells);if(keys.every(k=>S.fill[k]===cells[k].ch)){if(!S.done){S.done=true;save();paint();winSheet(ui,ctx,S,back)}}
    else if(keys.every(k=>S.fill[k]))ui.toast('Grille pleine, mais il reste des erreurs.')}
  function reveal(keys){keys.forEach(k=>{if(S.fill[k]!==cells[k].ch){S.fill[k]=cells[k].ch;S.rev[k]=1}});S.help++;save();paint();check()}
  grid.addEventListener('click',ev=>{const q=ev.target.closest('.qq');if(q){selectWord(G.entries[+q.dataset.e]);return}
    const t=ev.target.closest('.t');if(!t)return;const k=t.dataset.k;if(k===sel)toggleDir();else{sel=k;if(!cells[k][dir])dir=cells[k].A?'A':'D';paint()}});
  bindKbd(ui,type,erase);
  ui.body.querySelector('#cb-prev').onclick=()=>nextWord(true);ui.body.querySelector('#cb-next').onclick=()=>nextWord(false);ui.body.querySelector('#cb-t').onclick=toggleDir;
  const unKeys=physKeys(ui,{type,erase,space:toggleDir,tab:nextWord,arrow:key=>{const m={ArrowLeft:['A',-1],ArrowRight:['A',1],ArrowUp:['D',-1],ArrowDown:['D',1]}[key];
    if(dir!==m[0]&&cells[sel][m[0]])dir=m[0];else{const d0=dir;dir=m[0];step(m[1]);if(!cells[sel][dir])dir=d0}paint()}});
  app.querySelector('#pb-back').onclick=()=>{save();back()};
  app.querySelector('#pb-list').onclick=()=>{const li=e=>`<li data-e="${e.i}" class="${isOk(e)?'ok':''}"><b>${fl?(e.d==='A'?'▶':'▼'):e.n}</b><span>${esc(e.clue)} <i>(${e.a.length})</i></span></li>`;
    const c=ui.open(`<h2 class="sh-t">Définitions</h2><div class="cl2"><div><h3>Horizontalement</h3><ol class="cl">${ordered.filter(e=>e.d==='A').map(li).join('')}</ol></div><div><h3>Verticalement</h3><ol class="cl">${ordered.filter(e=>e.d==='D').map(li).join('')}</ol></div></div><div class="sheet-a"><button class="btn ghost" data-close>Fermer</button></div>`);
    c.querySelectorAll('li').forEach(l=>l.onclick=()=>{selectWord(G.entries[+l.dataset.e]);ui.close()})};
  app.querySelector('#pb-help').onclick=()=>helpSheet(ui,[{a:'cw',label:'Vérifier le mot',cost:0},{a:'cg',label:'Vérifier la grille',cost:0},{a:'rl',label:'Révéler la lettre',cost:COST.letter},{a:'rw',label:'Révéler le mot',cost:COST.word}],
    fl?'Touchez une case définition pour aller au mot. Touchez deux fois une case pour changer de sens.':'Touchez deux fois une case pour changer de sens.',a=>{const wk=cellsOf(wordAt(sel,dir));
      if(a==='cw'||a==='cg'){const keys=a==='cw'?wk:Object.keys(cells);let b=0;keys.forEach(k=>{if(S.fill[k]&&S.fill[k]!==cells[k].ch){els[k].classList.add('bad');b++}});ui.close();ui.toast(b?`${b} lettre${b>1?'s':''} fausse${b>1?'s':''}`:'Aucune erreur');setTimeout(()=>Object.values(els).forEach(e=>e.classList.remove('bad')),2600);return}
      if(a==='rl'&&spend(COST.letter,ui)){reveal([sel]);ui.close()}
      if(a==='rw'&&spend(COST.word,ui)){reveal(wk);ui.close()}},()=>resetGame(ctx,SK));
  const stopT=startTimer(S,save,()=>S.done),ro=new ResizeObserver(fit);ro.observe(ui.body.querySelector('#stage'));
  cleanup=()=>{save();stopT();ro.disconnect();unKeys();ui.off()};
  fit();paint();if(S.done)setTimeout(()=>winSheet(ui,ctx,S,back),50);
}

/* ------------------ Mots mêlés ------------------ */
function playMeles(ctx,M,back){
  const hard=ctx.diff>=2;
  const ui=shell(ctx,false);addToast(ui);
  const {SK,S,save}=newState(ctx,()=>({found:[],t:0,done:false,help:0}));
  const N=M.N,gap=3;
  ui.body.innerHTML=`<div class="stage" id="stage"><div class="board"><div class="grid mg" id="grid" style="grid-template-columns:repeat(${N},var(--cs));grid-template-rows:repeat(${N},var(--cs))"></div></div></div>
    <div class="wl${hard?' wl-d':''}" id="wl"></div>`;
  const grid=ui.body.querySelector('#grid'),els=[];
  for(let r=0;r<N;r++){els.push([]);for(let c=0;c<N;c++){const d=document.createElement('div');d.className='t m';d.textContent=M.grid[r][c];grid.appendChild(d);els[r].push(d)}}
  const cellsOf=w=>Array.from({length:w.a.length},(_,i)=>[w.r+w.dr*i,w.c+w.dc*i]);
  let cs=30;
  function fit(){const st=ui.body.querySelector('#stage').getBoundingClientRect();cs=Math.max(18,Math.floor(Math.min((st.width-26-(N-1)*gap)/N,(st.height-26-(N-1)*gap)/N,52)));grid.style.setProperty('--cs',cs+'px')}
  function paint(sel){for(let r=0;r<N;r++)for(let c=0;c<N;c++){els[r][c].className='t m';els[r][c].style.removeProperty('--f')}
    S.found.forEach(i=>cellsOf(M.words[i]).forEach(([r,c])=>{els[r][c].classList.add('fd');els[r][c].style.setProperty('--f',`var(--m${i%6+1})`)}));
    (sel||[]).forEach(([r,c])=>els[r][c].classList.add('sel'));
    ui.body.querySelector('#wl').innerHTML=(hard?'<p class="wl-h">Trouvez les mots à partir de leur définition</p>':'')+M.words.map((w,i)=>{const f=S.found.includes(i);
      return hard?`<div class="wc dfn${f?' f':''}" style="--f:var(--m${i%6+1})"><b>${f?w.a:w.a.length+' l.'}</b><span>${esc(w.clue)}</span></div>`:`<span class="wc${f?' f':''}" style="--f:var(--m${i%6+1})">${w.a}</span>`}).join('');
    grid.classList.toggle('solved',S.done)}
  function cellAt(x,y){const rc=grid.getBoundingClientRect();return[Math.min(N-1,Math.max(0,Math.floor((y-rc.top)/(cs+gap)))),Math.min(N-1,Math.max(0,Math.floor((x-rc.left)/(cs+gap))))]}
  function line(a,b){const dr=b[0]-a[0],dc=b[1]-a[1];if(!dr&&!dc)return[a];const ang=Math.round(Math.atan2(dr,dc)/(Math.PI/4))*Math.PI/4;
    const sr=Math.round(Math.sin(ang)),sc=Math.round(Math.cos(ang));let len=Math.max(Math.abs(dr),Math.abs(dc));
    while(len>0&&(a[0]+sr*len<0||a[0]+sr*len>=N||a[1]+sc*len<0||a[1]+sc*len>=N))len--;return Array.from({length:len+1},(_,i)=>[a[0]+sr*i,a[1]+sc*i])}
  function evaluate(cl){if(cl.length<2)return;const s=cl.map(([r,c])=>M.grid[r][c]).join(''),rv=[...s].reverse().join('');
    const i=M.words.findIndex((w,j)=>!S.found.includes(j)&&(w.a===s||w.a===rv));
    if(i>=0){S.found.push(i);save();ui.toast(hard?`Trouvé : ${M.words[i].a}`:`${S.found.length} / ${M.words.length}`);
      if(S.found.length===M.words.length&&!S.done){S.done=true;save();paint();winSheet(ui,ctx,S,back)}}}
  let start=null,pending=null,moved=false;
  grid.addEventListener('pointerdown',ev=>{if(S.done)return;ev.preventDefault();try{grid.setPointerCapture(ev.pointerId)}catch(e){}start=cellAt(ev.clientX,ev.clientY);moved=false;paint(pending?line(pending,start):[start])});
  grid.addEventListener('pointermove',ev=>{if(!start)return;const p=cellAt(ev.clientX,ev.clientY);if(p[0]!==start[0]||p[1]!==start[1])moved=true;if(moved)paint(line(start,p))});
  grid.addEventListener('pointerup',ev=>{if(!start)return;const p=cellAt(ev.clientX,ev.clientY);
    if(moved){evaluate(line(start,p));pending=null}else if(pending){if(pending[0]===p[0]&&pending[1]===p[1])pending=null;else{evaluate(line(pending,p));pending=null}}else pending=start;
    start=null;if(!S.done)paint(pending?[pending]:[])});
  grid.addEventListener('pointercancel',()=>{start=null;paint(pending?[pending]:[])});
  app.querySelector('#pb-back').onclick=()=>{save();back()};
  app.querySelector('#pb-help').onclick=()=>helpSheet(ui,[{a:'hint',label:'Montrer une première lettre',cost:COST.letter},{a:'rw',label:'Révéler un mot',cost:COST.word}],
    `Glissez le doigt sur un mot, ou touchez sa première puis sa dernière lettre. Les mots se lisent ${['de gauche à droite, de haut en bas et en diagonale','dans cinq directions, parfois à l\'envers','dans les huit directions','dans les huit directions'][ctx.diff]}.`,a=>{
      const left=M.words.map((w,i)=>i).filter(i=>!S.found.includes(i));if(!left.length)return;
      if(a==='hint'&&spend(COST.letter,ui)){const w=M.words[left[0]];S.help++;save();ui.close();paint();const e=els[w.r][w.c];e.classList.add('hint');setTimeout(()=>e.classList.remove('hint'),2600)}
      if(a==='rw'&&spend(COST.word,ui)){S.help++;ui.close();evaluate(cellsOf(M.words[left[Math.floor(Math.random()*left.length)]]));if(!S.done)paint()}},()=>resetGame(ctx,SK));
  const stopT=startTimer(S,save,()=>S.done),ro=new ResizeObserver(fit);ro.observe(ui.body.querySelector('#stage'));
  cleanup=()=>{save();stopT();ro.disconnect();ui.off()};
  fit();paint();if(S.done)setTimeout(()=>winSheet(ui,ctx,S,back),50);
}

/* ------------------ Anagrammes ------------------ */
function playAna(ctx,A,back){
  const ui=shell(ctx,true);addToast(ui);
  const R=A.words.length,Wm=Math.max(...A.words.map(w=>w.a.length));
  const {SK,S,save}=newState(ctx,()=>({slots:A.words.map(w=>Array(w.a.length).fill(null)),lock:A.words.map(w=>Array(w.a.length).fill(0)),ord:A.words.map(w=>[...w.s].map((_,i)=>i)),t:0,done:false,help:0}));
  ui.body.innerHTML=`
    <div class="cluebar"><button class="nav" id="cb-prev" aria-label="Mot précédent">${ICON.prev}</button><div class="cb-t" id="cb-t" aria-live="polite"></div><button class="nav" id="cb-next" aria-label="Mot suivant">${ICON.next}</button></div>
    <div class="stage" id="stage"><div class="board cache-b ana-b" id="board">${A.words.map((w,r)=>`<div class="crow" data-r="${r}"><div class="cq">${esc(w.clue)}</div><div class="tiles">${[...w.a].map((_,i)=>`<div class="t" data-r="${r}" data-i="${i}"><span></span></div>`).join('')}</div></div>`).join('')}</div></div>
    <div class="tray" id="tray"></div>
    <div class="tray-a"><button class="btn ghost sm2" id="ta-mix">Mélanger</button><button class="btn ghost sm2" id="ta-clr">Tout retirer</button><button class="btn gold sm2" id="ta-del" aria-label="Retirer la dernière lettre">⌫</button></div>`;
  const board=ui.body.querySelector('#board'),tray=ui.body.querySelector('#tray');
  const letter=(r,i)=>S.slots[r][i]==null?'':A.words[r].s[S.slots[r][i]];
  const rowOk=r=>A.words[r].a.split('').every((ch,i)=>letter(r,i)===ch);
  const rowFull=r=>S.slots[r].every(x=>x!=null);
  let sr=Math.max(0,A.words.findIndex((_,r)=>!rowOk(r)));
  function paint(){
    board.querySelectorAll('.crow').forEach(row=>{const r=+row.dataset.r;row.classList.toggle('on',r===sr);row.classList.toggle('ok',rowOk(r))});
    board.querySelectorAll('.t').forEach(e=>{const r=+e.dataset.r,i=+e.dataset.i;e.firstChild.textContent=letter(r,i);e.classList.toggle('rev',!!S.lock[r][i]);
      e.classList.toggle('cur',r===sr&&!S.done&&i===S.slots[r].findIndex((x,j)=>x==null&&!S.lock[r][j]))});
    const w=A.words[sr],used=new Set(S.slots[sr].filter(x=>x!=null));
    ui.body.querySelector('#cb-t').innerHTML=`<b>${sr+1}</b><span>${esc(w.clue)}</span><i>${w.a.length} lettres</i>`;
    tray.innerHTML=rowOk(sr)?`<p class="tray-ok">Trouvé : <b>${w.a}</b></p>`:S.ord[sr].map(j=>`<button class="lt${used.has(j)?' used':''}" data-j="${j}" ${used.has(j)?'disabled aria-hidden="true"':''}>${w.s[j]}</button>`).join('');
    tray.style.setProperty('--n',w.a.length);
    board.classList.toggle('solved',S.done)}
  function fit(){const st=ui.body.querySelector('#stage').getBoundingClientRect();const wide=st.width>=620;const clw=wide?Math.min(300,Math.floor(st.width*.38)):0,gap=4,pad=26;
    const cs=Math.max(18,Math.floor(Math.min((st.width-pad-clw-(clw?8:0)-(Wm-1)*gap)/Wm,(st.height-pad-(R-1)*gap)/R,48)));
    board.style.setProperty('--cs',cs+'px');board.style.setProperty('--clw',clw+'px');board.classList.toggle('wide',wide)}
  const nextOpen=()=>{for(let i=1;i<=R;i++){const r=(sr+i)%R;if(!rowOk(r))return r}return sr};
  function go(r){sr=(r+R)%R;paint()}
  function afterChange(){
    if(rowFull(sr)){if(rowOk(sr)){ui.toast(`Bravo : ${A.words[sr].a}`);if(A.words.every((_,r)=>rowOk(r))){if(!S.done){S.done=true;save();paint();winSheet(ui,ctx,S,back)}return}sr=nextOpen()}
      else{const row=board.querySelector(`.crow[data-r="${sr}"]`);row.classList.remove('shake');void row.offsetWidth;row.classList.add('shake');ui.toast('Ce n’est pas encore ça…')}}
    save();paint()}
  function place(j){if(S.done||rowOk(sr))return;const sl=S.slots[sr];if(sl.includes(j))return;const i=sl.findIndex((x,k)=>x==null&&!S.lock[sr][k]);if(i<0)return;sl[i]=j;afterChange()}
  function type(ch){const w=A.words[sr],used=new Set(S.slots[sr]);const j=S.ord[sr].find(j=>w.s[j]===ch&&!used.has(j));if(j!=null)place(j)}
  function erase(){if(S.done||rowOk(sr))return;const sl=S.slots[sr];for(let i=sl.length-1;i>=0;i--)if(sl[i]!=null&&!S.lock[sr][i]){sl[i]=null;break}save();paint()}
  function clearRow(){if(S.done||rowOk(sr))return;S.slots[sr]=S.slots[sr].map((x,i)=>S.lock[sr][i]?x:null);save();paint()}
  function remix(){const o=S.ord[sr];shuffle(o,Math.random);save();paint()}
  function revealAt(r,i){const w=A.words[r],sl=S.slots[r];if(S.lock[r][i])return;const want=w.a[i];
    if(sl[i]!=null&&w.s[sl[i]]===want){S.lock[r][i]=1;return}
    const cand=[...w.s].map((c,j)=>j).filter(j=>w.s[j]===want&&!sl.some((x,k)=>x===j&&S.lock[r][k]));
    const j=cand.find(j=>!sl.includes(j))??cand[0];const k=sl.indexOf(j);if(k>=0)sl[k]=null;sl[i]=j;S.lock[r][i]=1}
  function hintLetter(){const w=A.words[sr];const i=[...w.a].findIndex((ch,i)=>letter(sr,i)!==ch||!S.lock[sr][i]);if(i<0)return false;
    const firstWrong=[...w.a].findIndex((ch,i)=>letter(sr,i)!==ch);revealAt(sr,firstWrong>=0?firstWrong:i);S.help++;afterChange();return true}
  function hintWord(){const w=A.words[sr];for(let i=0;i<w.a.length;i++)revealAt(sr,i);S.help++;afterChange()}
  tray.addEventListener('click',ev=>{const b=ev.target.closest('.lt');if(b)place(+b.dataset.j)});
  board.addEventListener('click',ev=>{const t=ev.target.closest('.t');const row=ev.target.closest('.crow');if(!row)return;const r=+row.dataset.r;
    if(t&&r===sr&&!rowOk(r)){const i=+t.dataset.i;if(S.slots[r][i]!=null&&!S.lock[r][i]){S.slots[r][i]=null;save();paint()}return}go(r)});
  ui.body.querySelector('#ta-mix').onclick=remix;ui.body.querySelector('#ta-clr').onclick=clearRow;ui.body.querySelector('#ta-del').onclick=erase;
  ui.body.querySelector('#cb-prev').onclick=()=>go(sr-1);ui.body.querySelector('#cb-next').onclick=()=>go(sr+1);
  const unKeys=physKeys(ui,{type,erase,space:remix,tab:b=>go(sr+(b?-1:1)),arrow:k=>k==='ArrowUp'||k==='ArrowLeft'?go(sr-1):go(sr+1)});
  app.querySelector('#pb-back').onclick=()=>{save();back()};
  app.querySelector('#pb-list').onclick=()=>{const c=ui.open(`<h2 class="sh-t">Définitions</h2><ol class="cl">${A.words.map((w,r)=>`<li data-r="${r}" class="${rowOk(r)?'ok':''}"><b>${r+1}</b><span>${esc(w.clue)} <i>(${w.a.length})</i></span></li>`).join('')}</ol><div class="sheet-a"><button class="btn ghost" data-close>Fermer</button></div>`);
    c.querySelectorAll('li').forEach(l=>l.onclick=()=>{go(+l.dataset.r);ui.close()})};
  app.querySelector('#pb-help').onclick=()=>helpSheet(ui,[{a:'mix',label:'Mélanger les lettres',cost:0},{a:'clr',label:'Vider le mot',cost:0},{a:'rl',label:'Placer une lettre',cost:COST.letter},{a:'rw',label:'Révéler le mot',cost:COST.word}],
    'Touchez les lettres dans l’ordre pour reformer le mot défini. Touchez une case remplie pour la vider.',a=>{
      if(a==='mix'){remix();ui.close()}
      if(a==='clr'){clearRow();ui.close()}
      if(rowOk(sr)&&(a==='rl'||a==='rw')){ui.close();ui.toast('Ce mot est déjà trouvé.');return}
      if(a==='rl'&&spend(COST.letter,ui)){ui.close();hintLetter()}
      if(a==='rw'&&spend(COST.word,ui)){ui.close();hintWord()}},()=>resetGame(ctx,SK));
  const stopT=startTimer(S,save,()=>S.done),ro=new ResizeObserver(fit);ro.observe(ui.body.querySelector('#stage'));
  cleanup=()=>{save();stopT();ro.disconnect();unKeys();ui.off()};
  fit();paint();if(S.done)setTimeout(()=>winSheet(ui,ctx,S,back),50);
}

renderHome();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
