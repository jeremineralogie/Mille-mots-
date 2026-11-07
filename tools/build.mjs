// Génère toutes les grilles du jeu.
// Sources : data/<theme>.txt (définitions écrites à la main) + data/dico.tsv.gz (Wiktionnaire, CC BY-SA 4.0).
// Règles :
//   - un MOT n'apparaît jamais deux fois dans le même mode de jeu ; les mots de vocabulaire général
//     (Culture générale, Grand mélange) n'apparaissent qu'une fois dans tout le jeu (WORD_CAP) ;
//   - une DÉFINITION n'est jamais affichée plus de CLUE_CAP fois ;
//   - la difficulté suit la fréquence d'usage réelle du mot (Facile = mots courants).
// Usage : node tools/build.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORD_CAP = 1;
const CLUE_CAP = 3;
const MAX_PER_SLOT = 6000;
const FLECHE_MAXLEN = 70;     // définition affichable dans une case de mots fléchés

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE').replace(/[^A-Z]/g, '');
const clueKey = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed) { let a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }

/* ---------- Lecture des données ---------- */
const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/themes.json'), 'utf8'));
const byA = new Map();
const warnings = [];
const getW = a => { let w = byA.get(a); if (!w) { w = { a, clues: [], themes: new Set(), z: null, hand: false }; byA.set(a, w) } return w };
const addClue = (w, c, where) => {
  c = c.trim().replace(/\s+/g, ' '); if (!c) return;
  if (w.clues.some(x => clueKey(x) === clueKey(c))) return;
  const toks = clueKey(c).split(' ').map(norm);
  if (toks.some(t => t === w.a || (w.a.length >= 4 && t.startsWith(w.a) && t.length <= w.a.length + 3))) { if (where) warnings.push(`${where} la définition contient la réponse : ${w.a} | ${c}`); return }
  w.clues.push(c);
};
// 1. définitions écrites à la main (prioritaires)
for (const t of THEMES) {
  const txt = fs.readFileSync(path.join(ROOT, 'data', t.id + '.txt'), 'utf8');
  txt.split('\n').forEach((line, ln) => {
    line = line.trim(); if (!line || line.startsWith('#')) return;
    const parts = line.split('|'); const a = norm(parts[0]);
    if (a.length < 3 || a.length > 13) { warnings.push(`${t.id}:${ln + 1} longueur ${a.length} : ${parts[0]}`); return }
    const w = getW(a); w.themes.add(t.id); w.hand = true;
    parts.slice(1).forEach(c => addClue(w, c, `${t.id}:${ln + 1}`));
  });
}
// 2. dictionnaire importé (tools/import_dico.py)
let dicoN = 0;
const dicoPath = path.join(ROOT, 'data/dico.tsv.gz');
if (fs.existsSync(dicoPath)) {
  for (const line of zlib.gunzipSync(fs.readFileSync(dicoPath)).toString('utf8').split('\n')) {
    if (!line) continue;
    const [a, z, th, defs] = line.split('\t');
    const w = getW(a); dicoN++;
    w.z = Math.max(w.z ?? 0, +z);
    if (!w.hand) th.split(',').forEach(x => w.themes.add(x));
    else th.split(',').forEach(x => { if (x !== 'cg') w.themes.add(x) });
    defs.split('|').forEach(c => addClue(w, c, null));
  }
}
// un seul thème par mot : le premier thème spécialisé rencontré (sinon la Culture générale)
for (const w of byA.values()) { const t = [...w.themes].find(x => x !== 'cg') || (w.themes.size ? 'cg' : null); w.themes = new Set(t ? [t] : []) }
const WORDS = [...byA.values()].filter(w => w.clues.length && w.themes.size);
WORDS.forEach((w, i) => { w.id = i; if (w.z == null) w.z = 3.6; w.tier = w.z >= 3.3 ? 0 : w.z >= 2.3 ? 1 : w.z >= 1 ? 2 : 3; w.short = Math.min(...w.clues.map(c => c.length)) });

/* ---------- Compteurs globaux ---------- */
const clueUse = new Map();
const wordUse = new Uint8Array(WORDS.length);
const MODE_USE = {};            // un mot de thème peut revenir, mais dans un autre mode de jeu
let CUR_MODE = 'cache';
const modeUse = () => MODE_USE[CUR_MODE] || (MODE_USE[CUR_MODE] = new Uint8Array(WORDS.length));
const useOf = c => clueUse.get(clueKey(c)) || 0;
const free = w => (w.themes.has('cg') ? wordUse[w.id] < WORD_CAP : modeUse()[w.id] < 1) && w.clues.some(c => useOf(c) < CLUE_CAP);

function pickClue(w, r, taken, short) {
  let avail = w.clues.filter(c => useOf(c) < CLUE_CAP && !taken.has(clueKey(c)));
  if (short) avail = avail.filter(c => c.length <= FLECHE_MAXLEN);
  if (!avail.length) return null;
  const mu = Math.min(...avail.map(useOf));
  const best = avail.filter(c => useOf(c) === mu);
  if (short) { best.sort((x, y) => x.length - y.length); return best[0] }
  return w.hand ? best[0] : best[Math.floor(r() * Math.min(2, best.length))]; // les premières définitions sont les sens principaux
}
function assignClues(list, r, short) {
  const taken = new Set(), out = [];
  for (const w of list) { const c = pickClue(w, r, taken, short); if (!c) return null; taken.add(clueKey(c)); out.push(c) }
  return out;
}
function commit(words, clues) {
  const mu = modeUse();
  for (const w of words) { wordUse[w.id]++; mu[w.id]++ }
  for (const c of clues) { if (!c) continue; const k = clueKey(c); clueUse.set(k, (clueUse.get(k) || 0) + 1) }
}

/* ---------- Viviers : par thème et par niveau, échantillonnés au hasard ---------- */
const MIXT = { id: 'mix', name: 'Grand mélange', color: '#e0a21a' };
const ALL = [MIXT, ...THEMES];
const POOLS = {};
for (const t of ALL) {
  // les mots d'un thème lui sont réservés ; le Grand mélange et la Culture générale partagent le vocabulaire général
  const ws = t.id === 'mix' ? WORDS.filter(w => w.themes.has('cg')) : WORDS.filter(w => w.themes.has(t.id));
  POOLS[t.id] = [0, 1, 2, 3].map(d => ws.filter(w => w.tier === d));
}
// Pour un thème trop petit à un niveau, on complète avec le niveau voisin
const POOLCACHE = new Map();
function poolFor(tid, d) {
  const k = tid + d; if (POOLCACHE.has(k)) return POOLCACHE.get(k);
  const P = POOLS[tid]; let out = P[d];
  if (out.length < 150) out = out.concat(...[d - 1, d + 1].filter(x => x >= 0 && x < 4).map(x => P[x]));
  if (out.length < 150) out = P.flat();
  POOLCACHE.set(k, out); return out;
}
// tire jusqu'à n mots libres satisfaisant le filtre, sans parcourir tout le vivier
function sample(arr, n, r, ok) {
  const out = [], seen = new Set(); let tries = 0;
  const lim = Math.min(arr.length * 2, n * 30);
  while (out.length < n && tries < lim) {
    tries++; const w = arr[Math.floor(r() * arr.length)];
    if (seen.has(w.id)) continue; seen.add(w.id);
    if (free(w) && (!ok || ok(w))) out.push(w);
  }
  if (out.length < n && arr.length < 4000) { for (const w of arr) if (out.length < n && !seen.has(w.id) && free(w) && (!ok || ok(w))) out.push(w) }
  return out;
}

// Candidats d'une grille thématique : d'abord les mots du thème, complétés par du vocabulaire général
// Une grille thématique ne contient QUE des mots du thème (pas de remplissage par du vocabulaire général)
const FILLER = id => false;
function candidates(tid, d, n, r, ok, thMax = n) {
  const th = sample(poolFor(tid, d), FILLER(tid) ? Math.min(n, thMax) : n, r, ok);
  th.forEach(w => w._th = true);
  if (!FILLER(tid) || th.length >= n) return th;
  const fill = sample(POOLS.cg[d], n - th.length, r, ok); fill.forEach(w => w._th = false);
  return th.concat(fill);
}
const THEMED = id => id !== 'mix' && id !== 'cg';
const themedEnough = (tid, words) => !FILLER(tid) || (() => { const k = words.filter(w => w._th).length; return k >= 3 && k >= words.length * .3 })();

/* ---------- Mots croisés / fléchés ---------- */
function buildLayout(cand, r, maxSize, target, tries) {
  let best = null;
  if (cand.length < 4) return null;
  for (let att = 0; att < tries; att++) {
    const pool = shuffle(cand.slice(), r);
    pool.sort((x, y) => ((y._th ? 1 : 0) - (x._th ? 1 : 0)) * 100 + (y.a.length - x.a.length) + (r() - .5) * 6);
    const g = new Map(), byL = {}, placed = [], used = new Set();
    let b = { r0: 0, r1: 0, c0: 0, c1: 0 };
    const put = (w, rr, cc, d) => {
      const dr = d === 'A' ? 0 : 1, dc = d === 'A' ? 1 : 0;
      for (let i = 0; i < w.a.length; i++) {
        const R = rr + dr * i, C = cc + dc * i, k = R + ',' + C; let o = g.get(k);
        if (!o) { o = { ch: w.a[i], r: R, c: C, A: false, D: false }; g.set(k, o); (byL[o.ch] = byL[o.ch] || []).push(o) }
        o[d] = true
      }
      placed.push({ w, r: rr, c: cc, d }); used.add(w.a);
      if (placed.length === 1) b = { r0: rr, c0: cc, r1: rr + dr * (w.a.length - 1), c1: cc + dc * (w.a.length - 1) };
      else b = { r0: Math.min(b.r0, rr), c0: Math.min(b.c0, cc), r1: Math.max(b.r1, rr + dr * (w.a.length - 1)), c1: Math.max(b.c1, cc + dc * (w.a.length - 1)) }
    };
    const test = (a, rr, cc, d) => {
      const dr = d === 'A' ? 0 : 1, dc = d === 'A' ? 1 : 0, L = a.length;
      if (g.has((rr - dr) + ',' + (cc - dc)) || g.has((rr + dr * L) + ',' + (cc + dc * L))) return -1;
      const nr0 = Math.min(b.r0, rr), nc0 = Math.min(b.c0, cc), nr1 = Math.max(b.r1, rr + dr * (L - 1)), nc1 = Math.max(b.c1, cc + dc * (L - 1));
      if (nr1 - nr0 + 1 > maxSize || nc1 - nc0 + 1 > maxSize) return -1;
      let inter = 0;
      for (let i = 0; i < L; i++) {
        const R = rr + dr * i, C = cc + dc * i, o = g.get(R + ',' + C);
        if (o) { if (o.ch !== a[i] || o[d]) return -1; inter++ }
        else if (d === 'A') { if (g.has((R - 1) + ',' + C) || g.has((R + 1) + ',' + C)) return -1 }
        else if (g.has(R + ',' + (C - 1)) || g.has(R + ',' + (C + 1))) return -1
      }
      if (!inter) return -1;
      const growth = (nr1 - nr0 + nc1 - nc0) - (b.r1 - b.r0 + b.c1 - b.c0);
      return inter * 3 - growth * .45 + r() * .9
    };
    put(pool[0], 0, 0, r() < .5 ? 'A' : 'D');
    for (let pass = 0; pass < 4 && placed.length < target; pass++) {
      for (const w of pool) {
        if (placed.length >= target) break; if (used.has(w.a)) continue;
        let bs = -1, bp = null;
        for (let i = 0; i < w.a.length; i++) {
          const L = byL[w.a[i]]; if (!L) continue;
          for (const o of L) for (const d of ['A', 'D']) {
            if (o[d]) continue;
            const rr = d === 'A' ? o.r : o.r - i, cc = d === 'A' ? o.c - i : o.c; const s = test(w.a, rr, cc, d); if (s > bs) { bs = s; bp = [rr, cc, d] }
          }
        }
        if (bp) put(w, bp[0], bp[1], bp[2])
      }
    }
    const h = b.r1 - b.r0 + 1, wd = b.c1 - b.c0 + 1;
    const score = Math.min(placed.length, target) * 4 + g.size / (h * wd) * 6 - Math.abs(h - wd) * .15;
    if (!best || score > best.score) best = { score, placed };
  }
  return best;
}
function finalize(best, fleche) {
  const entries = best.placed.map(p => ({ w: p.w, a: p.w.a, r: p.r, c: p.c, d: p.d }));
  let r0 = 1e9, c0 = 1e9, r1 = -1e9, c1 = -1e9;
  const pt = (R, C) => { r0 = Math.min(r0, R); c0 = Math.min(c0, C); r1 = Math.max(r1, R); c1 = Math.max(c1, C) };
  entries.forEach(e => { for (let i = 0; i < e.a.length; i++)pt(e.d === 'A' ? e.r : e.r + i, e.d === 'A' ? e.c + i : e.c); if (fleche) { if (e.d === 'A') pt(e.r, e.c - 1); else pt(e.r - 1, e.c) } });
  entries.forEach(e => { e.r -= r0; e.c -= c0 });
  const H = r1 - r0 + 1, W = c1 - c0 + 1;
  entries.sort((x, y) => x.r - y.r || x.c - y.c || (x.d < y.d ? -1 : 1));
  const L = Array.from({ length: H }, () => Array(W).fill(null)); let ok = true;
  entries.forEach(e => { for (let i = 0; i < e.a.length; i++) { const R = e.d === 'A' ? e.r : e.r + i, C = e.d === 'A' ? e.c + i : e.c; if (L[R][C] && L[R][C] !== e.a[i]) ok = false; L[R][C] = e.a[i] } });
  const runs = new Set();
  for (let R = 0; R < H; R++) { let C = 0; while (C < W) { if (L[R][C]) { const s = C; while (C < W && L[R][C]) C++; if (C - s > 1) runs.add('A' + R + ',' + s) } else C++ } }
  for (let C = 0; C < W; C++) { let R = 0; while (R < H) { if (L[R][C]) { const s = R; while (R < H && L[R][C]) R++; if (R - s > 1) runs.add('D' + s + ',' + C) } else R++ } }
  const want = new Set(entries.map(e => e.d + e.r + ',' + e.c));
  if (runs.size !== want.size || [...runs].some(x => !want.has(x))) ok = false;
  if (fleche) entries.forEach(e => { const R = e.d === 'A' ? e.r : e.r - 1, C = e.d === 'A' ? e.c - 1 : e.c; if (R < 0 || C < 0 || L[R][C]) ok = false });
  return { H, W, entries, ok };
}
const SIZES = { croises: [[9, 11], [11, 15], [13, 20], [11, 15]], fleches: [[9, 10], [10, 13], [11, 16], [10, 13]], meles: [[9, 8], [11, 11], [12, 14], [11, 11]] };
const MINW = { croises: [8, 10, 12, 9], fleches: [7, 8, 9, 7] };
function genGrid(mode, tid, r, d) {
  const sz = SIZES[mode][d], fl = mode === 'fleches', max = fl ? sz[0] - 1 : sz[0];
  const P = poolFor(tid, d);
  for (let k = 0; k < 5; k++) {
    const cand = candidates(tid, d, 140, r, w => w.a.length <= max && (!fl || w.short <= FLECHE_MAXLEN), Math.ceil(sz[1] * .6));
    const best = buildLayout(cand, r, max, sz[1], 16); if (!best) return null;
    if (best.placed.length < MINW[mode][d]) continue;
    const g = finalize(best, fl); if (!g.ok) continue;
    const words = g.entries.map(e => e.w); if (!themedEnough(tid, words)) continue;
    const clues = assignClues(words, r, fl); if (!clues) continue;
    return { words, clues, level: { H: g.H, W: g.W, e: g.entries.map((e, i) => [e.w, clues[i], e.r, e.c, e.d === 'A' ? 0 : 1]) } };
  }
  return null;
}

/* ---------- Mots mêlés ---------- */
const FILL = 'EEEEEEEEAAAAAIIIIISSSSSNNNNNTTTTTRRRRRUUUULLLLOOOODDDCCCPPMMMVGFBHQXJYZK';
function genMeles(tid, r, d) {
  const sz = SIZES.meles[d], N = sz[0], target = sz[1], withClue = d >= 2;
  const dirs = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]].slice(0, [3, 5, 8, 8][d]);
  const P = poolFor(tid, d);
  for (let att = 0; att < 5; att++) {
    const grid = Array.from({ length: N }, () => Array(N).fill(''));
    const cand = candidates(tid, d, 60, r, w => w.a.length >= 4 && w.a.length <= N, Math.ceil(target * .6)).sort((a, b) => ((b._th ? 1 : 0) - (a._th ? 1 : 0)) * 100 + (b.a.length - a.a.length) + (r() - .5) * 8);
    const placed = [];
    for (const w of cand) {
      if (placed.length >= target) break;
      if (placed.some(p => p.w.a.includes(w.a) || w.a.includes(p.w.a))) continue;
      for (let t = 0; t < 200; t++) {
        const dd = dirs[Math.floor(r() * dirs.length)], L = w.a.length;
        const R0 = Math.floor(r() * N), C0 = Math.floor(r() * N), Re = R0 + dd[0] * (L - 1), Ce = C0 + dd[1] * (L - 1);
        if (Re < 0 || Re >= N || Ce < 0 || Ce >= N) continue;
        let ok = true, ov = 0; for (let i = 0; i < L; i++) { const x = grid[R0 + dd[0] * i][C0 + dd[1] * i]; if (x && x !== w.a[i]) { ok = false; break } if (x) ov++ }
        if (!ok || ov >= L - 1) continue;
        for (let i = 0; i < L; i++)grid[R0 + dd[0] * i][C0 + dd[1] * i] = w.a[i];
        placed.push({ w, r: R0, c: C0, dr: dd[0], dc: dd[1] }); break
      }
    }
    if (placed.length < target) continue;
    for (let R = 0; R < N; R++)for (let C = 0; C < N; C++)if (!grid[R][C]) grid[R][C] = FILL[Math.floor(r() * FILL.length)];
    const flat = grid.map(x => x.join(''));
    const count = a => { let n = 0; for (let R = 0; R < N; R++)for (let C = 0; C < N; C++)for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1]]) { for (const s of [a, [...a].reverse().join('')]) { let ok = true; for (let i = 0; i < s.length; i++) { const rr = R + dr * i, cc = C + dc * i; if (rr < 0 || rr >= N || cc < 0 || cc >= N || flat[rr][cc] !== s[i]) { ok = false; break } } if (ok) n++ } } return n };
    if (placed.some(p => count(p.w.a) > (p.w.a === [...p.w.a].reverse().join('') ? 2 : 1))) continue;
    placed.sort((a, b) => a.w.a < b.w.a ? -1 : 1);
    const words = placed.map(p => p.w); if (!themedEnough(tid, words)) continue;
    let clues = words.map(() => '');
    if (withClue) { clues = assignClues(words, r, false); if (!clues) continue }
    return { words, clues, level: { N, g: flat.join(''), w: placed.map((p, i) => [p.w, clues[i], p.r, p.c, p.dr, p.dc]) } };
  }
  return null;
}

/* ---------- Mot caché ---------- */
function genCache(tid, r, d) {
  const lens = [[5, 6], [7, 8], [9, 10], [6, 9]][d];
  const P = poolFor(tid, d), G = POOLS.mix[d];
  for (let att = 0; att < 12; att++) {
    const hid = sample(P, 1, r, w => w.a.length >= lens[0] && w.a.length <= lens[1])[0]; if (!hid) return null;
    const local = sample(P, 900, r, w => w.a.length >= 4 && w.a.length <= 11 && w !== hid);
    let global = null;
    const used = new Set([hid.a]), rows = []; let prev = 2 + Math.floor(r() * 3), ok = true;
    for (const L of hid.a) {
      let best = null, bs = -1e9;
      const tryList = (list, bonus) => {
        for (const w of list) {
          const n = w.a.length; if (used.has(w.a) || hid.a.includes(w.a) || w.a.includes(hid.a)) continue;
          for (let p = 1; p < n - 1; p++) { if (w.a[p] !== L) continue; const s = bonus - Math.abs(p - prev) * 2.2 + r() * 3; if (s > bs) { bs = s; best = { w, p } } }
        }
      };
      tryList(local, FILLER(tid) ? 3 : 8);
      if (THEMED(tid) && !best) { ok = false; break }
      if (!THEMED(tid) && (!best || bs < 1) || (FILLER(tid) && rows.filter(x => x.th).length >= Math.ceil(hid.a.length * .6))) { if (FILLER(tid) && best && rows.filter(x => x.th).length >= Math.ceil(hid.a.length * .6)) best = null, bs = -1e9; global = global || sample(POOLS.cg[d].length > 500 ? POOLS.cg[d] : G, 1500, r, w => w.a.length >= 4 && w.a.length <= 11 && w !== hid); tryList(global, 0) }
      if (!best) { ok = false; break }
      best.th = local.includes(best.w); used.add(best.w.a); rows.push(best); prev = best.p;
    }
    if (!ok) continue;
    const words = [hid, ...rows.map(x => x.w)];
    const clues = assignClues(words, r, false); if (!clues) continue;
    return { words, clues, level: { h: [hid, clues[0]], rows: rows.map((x, i) => [x.w, clues[i + 1], x.p]) } };
  }
  return null;
}

/* ---------- Anagrammes ---------- */
function genAna(tid, r, d) {
  const n = [5, 6, 7, 6][d], lens = [[4, 6], [6, 8], [8, 12], [5, 10]][d];
  const pick = candidates(tid, d, n, r, w => w.a.length >= lens[0] && w.a.length <= lens[1] && new Set(w.a).size > 2, Math.ceil(n * .6))
    .sort((a, b) => a.a.length - b.a.length || (a.a < b.a ? -1 : 1));
  if (pick.length < n || !themedEnough(tid, pick)) return null;
  const clues = assignClues(pick, r, false); if (!clues) return null;
  const scr = pick.map(w => { let s; for (let t = 0; t < 30; t++) { s = shuffle([...w.a], r).join(''); if (s !== w.a) { let same = 0; for (let i = 0; i < s.length; i++)if (s[i] === w.a[i]) same++; if (same <= w.a.length / 3) break } } return s });
  return { words: pick, clues, level: { w: pick.map((w, i) => [w, clues[i], scr[i]]) } };
}

/* ---------- Génération en tourniquet ---------- */
const MODES = ['cache', 'croises', 'fleches', 'meles', 'ana'];
const PRIO = { croises: 0, fleches: 0, ana: 1, cache: 2, meles: 3 };
const slots = [];
for (const t of ALL) for (const m of MODES) for (let d = 0; d < 4; d++) slots.push({ t: t.id, m, d, fail: 0, out: [], done: false });
slots.sort((x, y) => (x.t === 'mix') - (y.t === 'mix') || PRIO[x.m] - PRIO[y.m] || y.d - x.d);
const t0 = Date.now(); let round = 0, total = 0;
while (slots.some(s => !s.done)) {
  round++;
  for (const s of slots) {
    if (s.done) continue;
    const r = rng(hashStr(`${s.t}|${s.m}|${s.d}|${s.out.length}|${s.fail}`));
    CUR_MODE = s.m;
    const res = s.m === 'cache' ? genCache(s.t, r, s.d) : s.m === 'meles' ? genMeles(s.t, r, s.d) : s.m === 'ana' ? genAna(s.t, r, s.d) : genGrid(s.m, s.t, r, s.d);
    if (res) { commit(res.words, res.clues); s.out.push(res.level); total++; s.fail = 0; if (s.out.length >= MAX_PER_SLOT) s.done = true }
    else if (++s.fail >= 4) { s.done = true; s.doneAt = round }
  }
  if (round % 20 === 0) process.stderr.write(`tour ${round} · ${total} grilles · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
}

if (process.env.DEBUG) for (const t of ALL) { const P = POOLS[t.id]; console.log('reste', t.id, P.map(x => x.length + ':' + x.filter(free).length).join(' '), 'fin au tour', Math.max(...slots.filter(x => x.t === t.id).map(x => x.doneAt || 0))) }
/* ---------- Sérialisation : un fichier par thème, plus un index ---------- */
const OUT = path.join(ROOT, 'docs/levels');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const counts = {};
let size = 0;
for (const t of ALL) {
  const A = [], C = [], ai = new Map(), cm = new Map();
  const wi = w => { let i = ai.get(w.id); if (i == null) { i = A.length; A.push(w.a); ai.set(w.id, i) } return i };
  const ci = c => { if (!c) return -1; let i = cm.get(c); if (i == null) { i = C.length; C.push(c); cm.set(c, i) } return i };
  const L = {}; counts[t.id] = {};
  for (const m of MODES) {
    L[m] = [0, 1, 2, 3].map(d => {
      const s = slots.find(x => x.t === t.id && x.m === m && x.d === d);
      return s.out.map(lv => {
        if (m === 'cache') return [[wi(lv.h[0]), ci(lv.h[1])], lv.rows.map(x => [wi(x[0]), ci(x[1]), x[2]])];
        if (m === 'meles') return [lv.N, lv.g, lv.w.map(x => [wi(x[0]), ci(x[1]), x[2], x[3], x[4], x[5]])];
        if (m === 'ana') return lv.w.map(x => [wi(x[0]), ci(x[1]), x[2]]);
        return [lv.H, lv.W, lv.e.map(x => [wi(x[0]), ci(x[1]), x[2], x[3], x[4]])];
      });
    });
    counts[t.id][m] = L[m].map(a => a.length);
  }
  const f = path.join(OUT, t.id + '.js');
  fs.writeFileSync(f, `(window.MC_LV=window.MC_LV||{})[${JSON.stringify(t.id)}]=` + JSON.stringify({ A, C, L }) + ';\n');
  size += fs.statSync(f).size;
}
const usedWords = [...wordUse].filter(x => x).length;
const index = { v: 2, cap: CLUE_CAP, wordCap: WORD_CAP, T: ALL.map(t => ({ id: t.id, name: t.name, color: t.color })), counts, words: usedWords, clues: clueUse.size, total };
fs.writeFileSync(path.join(OUT, 'index.js'), 'window.MC_INDEX=' + JSON.stringify(index) + ';\n');

/* ---------- Rapport ---------- */
const rep = [];
rep.push(`Mots disponibles : ${WORDS.length} (dont ${dicoN} issus du dictionnaire) · définitions : ${WORDS.reduce((s, w) => s + w.clues.length, 0)}`);
rep.push(`Grilles : ${total} · mots utilisés : ${usedWords} · définitions affichées : ${clueUse.size} · tours : ${round} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
rep.push(`Max utilisations d'un mot : ${Math.max(...wordUse)} · d'une définition : ${Math.max(...clueUse.values())}`);
for (const t of ALL) rep.push(`${t.id.padEnd(6)} ` + MODES.map(m => `${m}:${counts[t.id][m].join('/')}`).join('  '));
if (warnings.length) rep.push(`\n${warnings.length} avertissement(s) :\n` + warnings.slice(0, 40).join('\n'));
rep.push(`docs/levels : ${(size / 1024 / 1024).toFixed(1)} Mo`);
console.log(rep.join('\n'));
