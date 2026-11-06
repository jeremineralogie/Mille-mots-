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

## Les règles du générateur

Toutes les grilles sont **pré-calculées** par `tools/build.mjs` :

- **chaque mot n'apparaît qu'une seule fois dans tout le jeu**, tous modes, thèmes et niveaux confondus : on ne retombe jamais sur un mot déjà vu ;
- une définition n'est jamais affichée plus de 3 fois ;
- la **difficulté suit la fréquence d'usage réelle** du mot (wordfreq) : Facile = mots courants, Moyen, Difficile, puis **Expert** pour les mots rares absents des corpus de fréquence ;
- les mots d'un thème lui sont réservés ; une grille thématique contient au moins 30 % de mots du thème, complétée par du vocabulaire général ;
- le défi du jour propose une grille que le joueur n'a jamais ouverte.

Le nombre de grilles découle du nombre de mots : **ajouter des mots agrandit le jeu automatiquement.**

## Sources du vocabulaire

- `data/<thème>.txt` : environ 2 000 mots aux définitions écrites à la main (prioritaires) ;
- `data/dico.tsv.gz` : environ 37 000 mots importés du **Wiktionnaire** par `tools/import_dico.py`, depuis le jeu de données libre [verbarium/french-dictionary](https://github.com/verbarium/french-dictionary) (Wiktionnaire via kaikki.org, Lexique 3.83, wordfreq). Ces données sont sous licence **CC BY-SA 4.0** : le fichier `data/dico.tsv.gz` reste sous cette licence et la source est créditée dans le jeu.

L'import filtre et nettoie : mots vulgaires ou injurieux exclus, définitions qui contiennent la réponse ou sa racine rejetées, noms latins et renvois (« cette dignité ») retirés, classement par thème selon le domaine (botanique → Nature…).

Pour réimporter : `python3 -I tools/import_dico.py <chemin>/lemmas.csv.gz data/dico.tsv.gz`

## Structure

```
data/themes.json     liste des thèmes (id, nom, couleur)
data/<theme>.txt     MOT|définition 1|définition 2|…  (une ligne peut être répétée : les définitions sont fusionnées)
src/                 code du jeu (core.js, icons.js, ui.js, style.css)
tools/import_dico.py importe le dictionnaire (Wiktionnaire) dans data/dico.tsv.gz
tools/build.mjs      génère docs/levels/ (un fichier par thème + index.js) et affiche un rapport
tools/page.mjs       assemble docs/index.html et docs/game.js
tools/verify.mjs     vérifie qu'aucun mot n'est répété et que chaque grille est valide
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
