// Assemble docs/index.html et docs/game.js à partir de src/
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const r=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const css=r('src/style.css');
const js=r('src/core.js')+'\n'+r('src/icons.js')+'\n'+r('src/ui.js');
const v=Date.now().toString(36);
const html=`<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ricktionnaire</title>
<meta name="description" content="Mots croisés, mots fléchés, mot caché, mots mêlés et anagrammes : des milliers de grilles en français, aucune définition répétée plus de trois fois.">
<meta name="theme-color" content="#2a1d9c">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/favicon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ricktionnaire">
<style>
${css}</style>
</head><body>
<div id="app"><p style="padding:40px 8px;text-align:center">Chargement…</p></div>
<script>window.MC_V="${v}"</script>
<script src="levels/index.js?v=${v}"></script>
<script src="game.js?v=${v}"></script>
</body></html>
`;
fs.writeFileSync(path.join(ROOT,'docs/index.html'),html);
fs.writeFileSync(path.join(ROOT,'docs/game.js'),js);
// Variante pour l'hébergement en Artifact : sans squelette html/head/body (ajouté à la publication)
const art=`<title>Ricktionnaire</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}</style>
<div id="app"><p style="padding:40px 8px;text-align:center">Chargement…</p></div>
<script>window.MC_V="${v}"</script>
<script src="levels/index.js?v=${v}"></script>
<script src="game.js?v=${v}"></script>
`;
fs.mkdirSync(path.join(ROOT,'build'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'build/artifact.html'),art);
console.log('docs/index.html + docs/game.js + build/artifact.html OK');
