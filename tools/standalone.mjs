// Assemble dist/Ricktionnaire.html : le jeu complet en un seul fichier (polices, icône, grilles et code intégrés),
// à ouvrir directement dans un navigateur, sans serveur ni connexion.
// Usage : node tools/standalone.mjs   (après build.mjs et page.mjs)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'docs');
const b64 = f => fs.readFileSync(path.join(D, f)).toString('base64');
const inl = f => '<script>' + fs.readFileSync(path.join(D, f), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>';
let h = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
h = h.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (m, f) => `url(data:font/woff2;base64,${b64(f)})`);
h = h.replace(/<link rel="manifest"[^>]*>\s*/, '').replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '');
h = h.replace(/href="icons\/favicon.png"/, `href="data:image/png;base64,${b64('icons/favicon.png')}"`);
const ids = [...fs.readFileSync(path.join(D, 'levels/index.js'), 'utf8').matchAll(/"id":"(\w+)"/g)].map(m => m[1]);
h = h.replace(/<script src="levels\/index.js[^"]*"><\/script>/, () => inl('levels/index.js') + ids.map(i => inl('levels/' + i + '.js')).join(''));
h = h.replace(/<script src="game.js[^"]*"><\/script>/, () => inl('game.js'));
if (/src="(levels|game)/.test(h)) throw new Error('une ressource externe subsiste');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/Ricktionnaire.html'), h);
console.log(`dist/Ricktionnaire.html : ${ids.length} thèmes · ${(h.length / 1048576).toFixed(1)} Mo`);
