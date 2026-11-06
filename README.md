# Mille Cases

Jeu de lettres en français, jouable sur téléphone et installable comme une application (fonctionne hors connexion).

**5 façons de jouer** · **25 thèmes** (dont le Grand mélange) · **3 niveaux de difficulté**

| Mode | Principe |
|---|---|
| Mot caché | Une définition par ligne ; les cases roses forment un mot mystère lié au thème |
| Mots croisés | La grille classique à numéros |
| Mots fléchés | Les définitions sont dans la grille |
| Mots mêlés | Glisser le doigt sur les mots cachés (en difficile : on cherche à partir des définitions) |
| Anagrammes | Remettre les lettres dans l'ordre à partir d'une définition |

## La règle d'or : jamais plus de 3 fois la même définition

Toutes les grilles sont **pré-calculées** par `tools/build.mjs`, qui tient un compteur global :

- chaque définition (comparée sans tenir compte des accents ni de la ponctuation) apparaît **au maximum 3 fois dans l'ensemble du jeu**, tous modes et thèmes confondus ;
- quand un mot revient dans une nouvelle grille, le générateur choisit **sa définition la moins utilisée** : un mot qui a 4 définitions les montre toutes avant d'en répéter une ;
- les grilles sont générées « en tourniquet » (thème après thème, mode après mode) pour que tous les thèmes aient leur part ;
- dans les mots mêlés sans définitions, un même mot n'apparaît pas dans plus de 3 grilles ;
- le **défi du jour** propose toujours une grille du catalogue que le joueur n'a jamais ouverte : il ne crée aucune utilisation supplémentaire.

Le nombre de grilles découle donc directement de la quantité de définitions : **ajouter des définitions agrandit le jeu automatiquement.**

## Structure

```
data/themes.json     liste des thèmes (id, nom, couleur)
data/<theme>.txt     MOT|définition 1|définition 2|…  (une ligne peut être répétée : les définitions sont fusionnées)
src/                 code du jeu (core.js, icons.js, ui.js, style.css)
tools/build.mjs      génère docs/levels.js (toutes les grilles) et affiche un rapport
tools/page.mjs       assemble docs/index.html et docs/game.js
tools/verify.mjs     vérifie le plafond de 3 et la validité de chaque grille
tools/test.cjs       test de jouabilité : un iPhone simulé résout une grille de chaque mode
tools/icons.cjs      génère les icônes
docs/                le site prêt à publier (GitHub Pages : dossier /docs)
```

## Construire

```sh
node tools/build.mjs     # quelques minutes
node tools/page.mjs
node tools/verify.mjs
node tools/test.cjs      # nécessite Playwright
```

Règles d'écriture des définitions : réponses de 3 à 13 lettres (accents, espaces et traits d'union sont retirés), définitions courtes (elles s'affichent dans les cases des mots fléchés), et jamais la réponse elle-même dans la définition (le build les rejette).
