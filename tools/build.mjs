// Génère toutes les grilles du jeu à partir de data/*.txt
// Règle d'or : une même définition n'est jamais proposée plus de CAP fois dans l'ensemble du jeu.
// Usage : node tools/build.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAP = 3;              // utilisations maximales d'une définition, tous jeux confondus
const MELES_WORD_CAP = 3;   // apparitions max d'un mot dans les mots mêlés sans définition
const MAX_PER_SLOT = 80;    // grilles max par thème × mode × difficulté

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE').replace(/[^A-Z]/g, '');
const clueKey = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed) { let a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] } return arr }

/* ---------- Lecture des données ---------- */
const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/themes.json'), 'utf8'));
const byA = new Map();
const warnings = [];
for (const t of THEMES) {
  const txt = fs.readFileSync(path.join(ROOT, 'data', t.id + '.txt'), 'utf8');
  txt.split('\n').forEach((line, ln) => {
    line = line.trim(); if (!line || line.startsWith('#')) return;
    const parts = line.split('|'); const a = norm(parts[0]);
    if (a.length < 3 || a.length > 13) { warnings.push(`${t.id}:${ln + 1} longueur ${a.length} : ${parts[0]}`); return }
    let w = byA.get(a); if (!w) { w = { a, clues: [], themes: new Set() }; byA.set(a, w) }
    w.themes.add(t.id);
    for (let c of parts.slice(1)) {
      c = c.trim().replace(/\s+/g, ' '); if (!c) continue;
      if (w.clues.some(x => clueKey(x) === clueKey(c))) continue;
      const toks = clueKey(c).split(' ').map(norm);
      if (toks.some(t => t === a || (a.length >= 4 && t.startsWith(a) && t.length <= a.length + 3))) { warnings.push(`${t.id}:${ln + 1} la définition contient la réponse : ${a} | ${c}`); continue }
      w.clues.push(c);
    }
  });
}
const WORDS = [...byA.values()].filter(w => w.clues.length);
WORDS.forEach((w, i) => w.id = i);

/* ---------- Compteurs globaux ---------- */
const clueUse = new Map(); // clé normalisée -> nombre d'utilisations
const useOf = c => clueUse.get(clueKey(c)) || 0;
const melesUse = new Map();
const remaining = w => w.clues.reduce((s, c) => s + Math.max(0, CAP - useOf(c)), 0);
const hasClue = w => w.clues.some(c => useOf(c) < CAP);

function pickClue(w, r, opts = {}) {
  const avail = w.clues.filter(c => useOf(c) < CAP && !(opts.taken && opts.taken.has(clueKey(c))));
  if (!avail.length) return null;
  const mu = Math.min(...avail.map(useOf));
  let best = avail.filter(c => useOf(c) === mu);
  if (opts.short) { const ml = Math.min(...best.map(c => c.length)); best = best.filter(c => c.length <= ml + 6); best.sort((x, y) => x.length - y.length); return best[0] }
  return best[Math.floor(r() * best.length)];
}
// Attribue une définition à chaque mot d'une grille (sans doublon dans la grille), ou échoue.
function assignClues(list, r, short) {
  const taken = new Set(), out = [];
  for (const w of list) { const c = pickClue(w, r, { taken, short }); if (!c) return null; taken.add(clueKey(c)); out.push(c) }
  return out;
}
function commit(clues) { for (const c of clues) { const k = clueKey(c); clueUse.set(k, (clueUse.get(k) || 0) + 1) } }

// Sélection d'un vivier de candidats : privilégie les mots qui ont le plus de définitions encore disponibles
function biasedPool(cand, r, n) {
  return cand.map(w => ({ w, k: remaining(w) + r() * 4 })).sort((x, y) => y.k - x.k).slice(0, n).map(x => x.w);
}

/* ---------- Mots croisés / fléchés ---------- */
function buildLayout(words, r, maxSize, target, tries) {
  let best = null;
  const cand = words.filter(w => w.a.length <= maxSize);
  if (cand.length < 4) return null;
  for (let att = 0; att < tries; att++) {
    const pool = shuffle(biasedPool(cand, r, Math.min(cand.length, 110)), r);
    pool.sort((x, y) => (y.a.length - x.a.length) + (r() - .5) * 6);
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
  if (fleche) {
    const qs = new Set();
    entries.forEach(e => { const R = e.d === 'A' ? e.r : e.r - 1, C = e.d === 'A' ? e.c - 1 : e.c; if (R < 0 || C < 0 || L[R][C]) ok = false; qs.add(R + ',' + C) });
  }
  return { H, W, entries, ok };
}

const SIZES = { croises: [[9, 11], [11, 15], [13, 20]], fleches: [[9, 10], [10, 13], [11, 16]], meles: [[9, 8], [11, 11], [12, 14]] };
// nombre minimal de mots pour qu'une grille soit retenue
const MINW = { croises: [8, 10, 12], fleches: [6, 8, 8] };
function genGrid(mode, pool, r, diff) {
  const sz = SIZES[mode][diff], fl = mode === 'fleches';
  const words = pool.filter(hasClue);
  for (let k = 0; k < 6; k++) {
    const best = buildLayout(words, r, fl ? sz[0] - 1 : sz[0], sz[1], 30); if (!best) return null;
    if (best.placed.length < MINW[mode][diff]) continue;
    const g = finalize(best, fl); if (!g.ok) continue;
    const clues = assignClues(g.entries.map(e => e.w), r, fl); if (!clues) continue;
    return { level: { H: g.H, W: g.W, e: g.entries.map((e, i) => [e.w.id, clues[i], e.r, e.c, e.d === 'A' ? 0 : 1]) }, clues };
  }
  return null;
}

/* ---------- Mots mêlés ---------- */
const FILL = 'EEEEEEEEAAAAAIIIIISSSSSNNNNNTTTTTRRRRRUUUULLLLOOOODDDCCCPPMMMVGFBHQXJYZK';
function genMeles(pool, r, diff) {
  const sz = SIZES.meles[diff], N = sz[0], target = sz[1], withClue = diff === 2;
  const dirs = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]].slice(0, [3, 5, 8][diff]);
  for (let att = 0; att < 6; att++) {
    const grid = Array.from({ length: N }, () => Array(N).fill(''));
    let cand = pool.filter(w => w.a.length >= 4 && w.a.length <= N && (withClue ? hasClue(w) : (melesUse.get(w.id) || 0) < MELES_WORD_CAP));
    cand = withClue ? biasedPool(cand, r, 60) : cand.map(w => ({ w, k: -(melesUse.get(w.id) || 0) * 3 + r() * 4 })).sort((x, y) => y.k - x.k).slice(0, 60).map(x => x.w);
    cand = shuffle(cand, r).sort((a, b) => (b.a.length - a.a.length) + (r() - .5) * 8);
    const placed = [];
    for (const w of cand) {
      if (placed.length >= target) break;
      if (placed.some(p => p.w.a.includes(w.a) || w.a.includes(p.w.a))) continue;
      for (let t = 0; t < 200; t++) {
        const d = dirs[Math.floor(r() * dirs.length)], L = w.a.length;
        const R0 = Math.floor(r() * N), C0 = Math.floor(r() * N), Re = R0 + d[0] * (L - 1), Ce = C0 + d[1] * (L - 1);
        if (Re < 0 || Re >= N || Ce < 0 || Ce >= N) continue;
        let ok = true, ov = 0; for (let i = 0; i < L; i++) { const x = grid[R0 + d[0] * i][C0 + d[1] * i]; if (x && x !== w.a[i]) { ok = false; break } if (x) ov++ }
        if (!ok || ov >= L - 1) continue;
        for (let i = 0; i < L; i++)grid[R0 + d[0] * i][C0 + d[1] * i] = w.a[i];
        placed.push({ w, r: R0, c: C0, dr: d[0], dc: d[1] }); break
      }
    }
    if (placed.length < target) continue;
    for (let R = 0; R < N; R++)for (let C = 0; C < N; C++)if (!grid[R][C]) grid[R][C] = FILL[Math.floor(r() * FILL.length)];
    // Un mot ne doit apparaître qu'une fois dans la grille (sinon ambiguïté de sélection)
    const flat = grid.map(x => x.join(''));
    const count = a => { let n = 0; for (let R = 0; R < N; R++)for (let C = 0; C < N; C++)for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1]]) { for (const s of [a, [...a].reverse().join('')]) { let ok = true; for (let i = 0; i < s.length; i++) { const rr = R + dr * i, cc = C + dc * i; if (rr < 0 || rr >= N || cc < 0 || cc >= N || flat[rr][cc] !== s[i]) { ok = false; break } } if (ok) n++ } } return n };
    if (placed.some(p => count(p.w.a) > (p.w.a === [...p.w.a].reverse().join('') ? 2 : 1))) continue;
    placed.sort((a, b) => a.w.a < b.w.a ? -1 : 1);
    let clues = [];
    if (withClue) { clues = assignClues(placed.map(p => p.w), r, false); if (!clues) continue }
    else placed.forEach(p => melesUse.set(p.w.id, (melesUse.get(p.w.id) || 0) + 1));
    return { level: { N, g: flat.join(''), w: placed.map((p, i) => [p.w.id, withClue ? clues[i] : '', p.r, p.c, p.dr, p.dc]) }, clues };
  }
  return null;
}

/* ---------- Mot caché ---------- */
function genCache(pool, all, r, diff) {
  const W = 11, lens = [[5, 6], [7, 8], [9, 10]][diff];
  const fit = w => w.a.length >= lens[0] && w.a.length <= lens[1] && hasClue(w);
  let src = pool.filter(fit); if (src.length < 3) src = all.filter(fit);
  const local = pool.filter(hasClue), global = all.filter(hasClue);
  for (let att = 0; att < 60; att++) {
    const hid = biasedPool(src, r, 12)[Math.floor(r() * Math.min(12, src.length))]; if (!hid) return null;
    const used = new Set([hid.a]), rows = []; let prev = 2 + Math.floor(r() * 3), ok = true;
    for (const L of hid.a) {
      let best = null, bs = -1e9;
      const tryList = (list, bonus) => {
        for (const w of list) {
          const n = w.a.length; if (n < 4 || n > W || used.has(w.a) || hid.a.includes(w.a) || w.a.includes(hid.a)) continue;
          for (let p = 1; p < n - 1; p++) { if (w.a[p] !== L) continue; const s = bonus - Math.abs(p - prev) * 2.2 + remaining(w) * .5 + r() * 3; if (s > bs) { bs = s; best = { w, p } } }
        }
      };
      tryList(local, 8); if (!best || bs < 1) tryList(global, 0);
      if (!best) { ok = false; break }
      used.add(best.w.a); rows.push(best); prev = best.p;
    }
    if (!ok) continue;
    const clues = assignClues([hid, ...rows.map(x => x.w)], r, false); if (!clues) continue;
    return { level: { h: [hid.id, clues[0]], rows: rows.map((x, i) => [x.w.id, clues[i + 1], x.p]) }, clues };
  }
  return null;
}

/* ---------- Anagrammes ---------- */
function genAna(pool, r, diff) {
  const n = [5, 6, 7][diff], lens = [[4, 6], [6, 8], [8, 12]][diff];
  const cand = pool.filter(w => w.a.length >= lens[0] && w.a.length <= lens[1] && hasClue(w) && new Set(w.a).size > 2);
  if (cand.length < n) return null;
  const pick = shuffle(biasedPool(cand, r, n * 3), r).slice(0, n).sort((a, b) => a.a.length - b.a.length || (a.a < b.a ? -1 : 1));
  const clues = assignClues(pick, r, false); if (!clues) return null;
  const scr = pick.map(w => { let s; for (let t = 0; t < 30; t++) { s = shuffle([...w.a], r).join(''); if (s !== w.a) { let same = 0; for (let i = 0; i < s.length; i++)if (s[i] === w.a[i]) same++; if (same <= w.a.length / 3) break } } return s });
  return { level: { w: pick.map((w, i) => [w.id, clues[i], scr[i]]) }, clues };
}

/* ---------- Génération globale, en tourniquet pour répartir équitablement ---------- */
const MODES = ['cache', 'croises', 'fleches', 'meles', 'ana'];
const MIX = { id: 'mix', name: 'Grand mélange', color: '#e0a21a' };
const ALL = [MIX, ...THEMES];
const poolOf = id => id === 'mix' ? WORDS : WORDS.filter(w => w.themes.has(id));
const pools = Object.fromEntries(ALL.map(t => [t.id, poolOf(t.id)]));
const slots = [];
for (const t of ALL) for (const m of MODES) for (let d = 0; d < 3; d++) slots.push({ t: t.id, m, d, fail: 0, out: [], done: false });
// À chaque tour : les grilles les plus exigeantes se servent d'abord, le Grand mélange passe après les thèmes
const PRIO = { croises: 0, fleches: 0, ana: 1, cache: 2, meles: 3 };
slots.sort((x, y) => (x.t === 'mix') - (y.t === 'mix') || PRIO[x.m] - PRIO[y.m] || y.d - x.d);
const t0 = Date.now();
let round = 0;
while (slots.some(s => !s.done)) {
  round++;
  for (const s of slots) {
    if (s.done) continue;
    const r = rng(hashStr(`${s.t}|${s.m}|${s.d}|${s.out.length}|${s.fail}`));
    const pool = pools[s.t];
    const res = s.m === 'cache' ? genCache(pool, WORDS, r, s.d) : s.m === 'meles' ? genMeles(pool, r, s.d) : s.m === 'ana' ? genAna(pool, r, s.d) : genGrid(s.m, pool, r, s.d);
    if (res) { commit(res.clues); s.out.push(res.level); s.fail = 0; if (s.out.length >= MAX_PER_SLOT) s.done = true }
    else if (++s.fail >= (s.m === 'croises' || s.m === 'fleches' ? 5 : 3)) s.done = true;
  }
}

/* ---------- Sérialisation compacte ---------- */
const A = WORDS.map(w => w.a);
const clueIdx = new Map(), C = [];
const ci = c => { if (c === '') return -1; let i = clueIdx.get(c); if (i == null) { i = C.length; C.push(c); clueIdx.set(c, i) } return i };
const L = {};
let total = 0;
for (const s of slots) {
  const T = (L[s.t] = L[s.t] || {}), arr = (T[s.m] = T[s.m] || [[], [], []]);
  arr[s.d] = s.out.map(lv => {
    total++;
    if (s.m === 'cache') return [[lv.h[0], ci(lv.h[1])], lv.rows.map(x => [x[0], ci(x[1]), x[2]])];
    if (s.m === 'meles') return [lv.N, lv.g, lv.w.map(x => [x[0], ci(x[1]), x[2], x[3], x[4], x[5]])];
    if (s.m === 'ana') return lv.w.map(x => [x[0], ci(x[1]), x[2]]);
    return [lv.H, lv.W, lv.e.map(x => [x[0], ci(x[1]), x[2], x[3], x[4]])];
  });
}
const out = { v: 1, cap: CAP, T: ALL.map(t => ({ id: t.id, name: t.name, color: t.color })), A, C, L };
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/levels.js'), 'window.MC_DATA=' + JSON.stringify(out) + ';\n');

/* ---------- Rapport ---------- */
const totalClues = WORDS.reduce((s, w) => s + w.clues.length, 0);
const usedClues = [...clueUse.values()];
const rep = [];
rep.push(`Mots : ${WORDS.length} · définitions : ${totalClues} · grilles : ${total} · tours : ${round} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
rep.push(`Définitions utilisées : ${usedClues.length} · max d'utilisations d'une définition : ${Math.max(...usedClues)} · moyenne : ${(usedClues.reduce((a, b) => a + b, 0) / usedClues.length).toFixed(2)}`);
for (const t of ALL) rep.push(`${t.id.padEnd(6)} ` + MODES.map(m => `${m}:${L[t.id][m].map(a => a.length).join('/')}`).join('  '));
if (warnings.length) rep.push(`\n${warnings.length} avertissement(s) :\n` + warnings.slice(0, 60).join('\n'));
console.log(rep.join('\n'));
console.log(`levels.js : ${(fs.statSync(path.join(ROOT, 'docs/levels.js')).size / 1024).toFixed(0)} Ko`);
