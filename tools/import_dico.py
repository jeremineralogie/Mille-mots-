#!/usr/bin/env python3
"""Importe le dictionnaire libre verbarium/french-dictionary (Wiktionnaire, CC BY-SA 4.0)
et produit data/dico.tsv.gz : RÉPONSE \t zipf \t thèmes \t déf1|déf2|déf3

Usage : python3 -I tools/import_dico.py <chemin vers lemmas.csv.gz> <sortie.tsv.gz>
"""
import csv, gzip, json, re, sys, unicodedata, collections

csv.field_size_limit(10**9)
SRC, OUT = sys.argv[1], sys.argv[2]

def norm(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').upper()
    s = s.replace('Œ', 'OE').replace('Æ', 'AE')
    return re.sub(r'[^A-Z]', '', s)

# Domaine du Wiktionnaire -> thème du jeu
DOM = {
 'hm': 'history archeology anthropology ethnology paleontology',
 'hf': 'nobility heraldry military numismatics',
 'geo': 'geography geology hydrology cartography meteorology biogeography pedology mineralogy petrography',
 'sci': 'chemistry biology biochemistry mathematics geometry metrology electricity science statistics logic topology microbiology virology histology embryology alchemy physics',
 'corps': 'medicine anatomy surgery pharmacology physiology oncology neurology ophthalmology psychiatry dentistry psychology psychoanalysis',
 'ani': 'zoology ornithology entomology ichthyology mammalogy malacology herpetology hunting falconry fishing',
 'nat': 'botany agriculture ecology forestry mycology horticulture',
 'cui': 'cuisine cooking beverages oenology',
 'spo': 'sports cycling soccer rugby equestrianism martial-arts fencing bullfighting',
 'cin': 'film theater photography circus',
 'mus': 'music dance',
 'lit': 'literature poetry typography editing',
 'art': 'art arts architecture masonry carpentry furniture jewelry colorimetry construction',
 'myth': 'mythology religion Christianity Catholicism Islam theology occultism astrology',
 'actu': 'media journalism feminism sociology',
 'tech': 'computing programming Internet telecommunications telephony technology technical mechanical metallurgy',
 'lang': 'linguistic grammar rhetoric',
 'esp': 'astronomy astronautics',
 'voy': 'nautical transport railways aeronautics aviation automobile tourism',
 'vie': 'clothing sewing weaving hairdressing plumbing textiles',
 'jeux': 'games chess',
 'eco': 'law politics finance commerce accounting management marketing business education',
}
D2T = {d: t for t, ds in DOM.items() for d in ds.split()}
KW = {k: re.compile(v, re.I) for k, v in {
 'ani': r"\b(animal|animaux|oiseau|poisson|insecte|mammifère|reptile|amphibien|mollusque|crustacé|espèce|ver|araignée|rongeur|serpent|chien|cheval|bovin|félin|singe|gibier|chasse|pêche|plumage|zoologie)",
 'nat': r"\b(plante|arbre|arbuste|fleur|feuille|herbe|fruit|graine|champignon|végétal|racine|botanique|culture|jardin|forêt|bois|légume|céréale|algue|mousse)",
 'cui': r"\b(plat|mets|cuisine|sauce|gâteau|pâtisserie|pain|viande|boisson|vin|fromage|aliment|recette|cuit|cuisson|potage|soupe|dessert|épice|liqueur|bière)",
 'corps': r"\b(corps|organe|os|muscle|maladie|médecin|médical|inflammation|douleur|sang|nerf|peau|tumeur|infection|symptôme|médicament|chirurgi|lésion|cellule|tissu|glande|trouble|patient|soin)",
 'sci': r"\b(chimi|composé|élément|atome|molécule|acide|sel|métal|physique|mathémati|nombre|fonction|équation|géométri|figure|unité|mesure|biologi|cellule|gène|enzyme|protéine|courant|électri|cristal)",
 'geo': r"\b(roche|minéral|terrain|relief|montagne|vallée|fleuve|rivière|côte|mer|océan|île|sol|région|pays|climat|vent|pluie|nuage|carte|volcan|sédiment|glacier)",
 'mus': r"\b(musique|musical|instrument|note|chant|chanson|danse|rythme|orchestre|accord|mélodie|ton|son|voix|air|opéra|compositeur)",
 'myth': r"\b(dieu|déesse|divin|religi|église|prêtre|saint|culte|sacré|liturgi|biblique|mytholog|démon|ange|prière|âme|islam|chrétien|moine|messe|rite)",
 'eco': r"\b(droit|loi|juridique|tribunal|juge|contrat|impôt|taxe|argent|monnaie|banque|commerce|marché|prix|vente|entreprise|politique|parti|élection|vote|état|gouvernement|budget|crédit|dette|finance)",
 'tech': r"\b(informatique|ordinateur|logiciel|programme|réseau|machine|appareil|outil|pièce|mécani|moteur|métal|technique|électronique|données|internet|fichier|signal)",
 'voy': r"\b(navire|bateau|marin|mer|voile|mât|cordage|port|véhicule|voiture|train|avion|aérien|route|voyage|transport|wagon|chemin de fer)",
 'art': r"\b(art|peinture|peintre|sculpt|dessin|architect|bâtiment|édifice|construction|ornement|décor|style|mur|toit|voûte|colonne|meuble|bijou|couleur|pierre)",
 'hm': r"\b(antique|antiquité|ancien|histoire|historique|empire|romain|grec|peuple|civilisation|préhistori|siècle|dynastie|médiéval|tribu)",
 'hf': r"\b(noble|seigneur|roi|royal|chevalier|blason|héraldi|armoiries|militaire|soldat|armée|troupe|guerre|fief|féodal|monnaie|régiment)",
 'spo': r"\b(sport|joueur|équipe|match|course|coureur|cheval|ballon|balle|terrain|compétition|athlète|escrime|lutte|boxe|ski|vélo|cycliste|cavalier)",
 'cin': r"\b(film|cinéma|théâtre|scène|acteur|spectacle|photographi|caméra|cirque|décor|rôle|représentation)",
 'lit': r"\b(poème|poésie|poète|vers|littéraire|roman|écrivain|livre|texte|récit|imprim|typograph|caractère|page|édition)",
 'lang': r"\b(mot|langue|linguisti|grammaire|grammatical|phrase|verbe|nom|lettre|syllabe|son|figure de style|discours|sens)",
 'esp': r"\b(astre|étoile|planète|ciel|céleste|lune|soleil|espace|spatial|orbite|galaxie|comète|satellite|astronom)",
 'jeux': r"\b(jeu|jouer|joueur|carte|pion|échecs|dé|partie|jouet|enfant)",
 'actu': r"\b(société|social|média|journal|presse|information|féminis|militant|actualité)",
 'vie': r"\b(vêtement|tissu|étoffe|couture|coudre|tissage|fil|cheveux|coiffure|plomberie|tuyau)",
}.items()}
STRONG = {k: re.compile(v, re.I) for k, v in {
 'ani': r"^(oiseau|poisson|insecte|mammifère|reptile|amphibien|mollusque|crustacé|araignée|serpent|lézard|papillon|coléoptère|rongeur|ruminant|cétacé|rapace|passereau|petit animal|grand animal|animal)\b",
 'nat': r"^(plante|arbre|arbuste|arbrisseau|fleur|herbe|champignon|algue|fougère|graminée|conifère|liane|variété de)\b",
 'cui': r"^(plat|mets|sauce|gâteau|pâtisserie|potage|soupe|boisson|vin|liqueur|fromage|confiserie|friandise|bonbon|ragoût|charcuterie|pain|biscuit)\b",
 'corps': r"^(maladie|inflammation|affection|tumeur|os|muscle|organe|glande|médicament|trouble|lésion|douleur)\b",
 'mus': r"^(instrument de musique|instrument|danse|chant|air|morceau|composition musicale|pièce musicale)\b",
 'myth': r"^(divinité|dieu|déesse|démon|génie|nymphe|monstre fabuleux|être fabuleux|créature)\b",
 'geo': r"^(roche|minéral|vent|relief|cours d'eau)\b",
 'spo': r"^(sport|joueur|joueuse|athlète)\b",
 'jeux': r"^(jeu|jouet)\b",
}.items()}
BAD_WORDS = re.compile(r"\b(sexe|sexuel|sexuelle|érection|pénis|vagin|vulve|coït|masturb|prostitu|pornogra|testicule|anus|fesses|sodom|copul|orgasme|nazi|raciste|injure|insulte)", re.I)
STOP = set('NAZI NAZIE NAZISME HITLERIEN NEGRE NEGRESSE BOUGNOULE YOUPIN PUTE SALOPE CONNARD CONNASSE ENCULE BITE CHATTE NIQUER BAISER BAISE DES LES UNE UNS AUX CES SES MES TES NOS VOS LEUR LEURS QUI QUE QUOI DONT MAIS DONC NOUS VOUS ELLE ELLES ILS EUX LUI MOI TOI SOI CELA CECI CET CETTE AVEC SANS POUR PAR SUR SOUS DANS CHEZ VERS ENTRE TRES PLUS MOINS AUSSI BIEN TOUT TOUS TOUTE TOUTES RIEN'.split())
ANAPH = re.compile(r"\b(cette|cet|ces|ce dernier|cette dernière|celle-ci|celui-ci|ceux-ci|ledit|ladite|ce sens|ce mot|ce terme|cette espèce|cet animal|cette plante)\b", re.I)
LATIN = re.compile(r"\b[A-Z][a-z]{2,} [a-z]{3,}(?:us|um|is|ae|ii|ensis|oides|as|ata|ica|ina)\b")
PRON = re.compile(r"^(Il|Elle|Je|Tu|Nous|Vous|Ils|Elles|J'|C'est|Ce sont) ")
BAN_REG = {'vulgar', 'offensive', 'very-familiar'}
OLD_REG = {'obsolete', 'archaic', 'very rare'}
BAN_DOM = {'sexuality'}
METIER = re.compile(r"^(personne|celui|celle|homme|femme|ouvrier|ouvrière|artisan|spécialiste|professionnel|professionnelle|employé|employée|marchand|marchande|technicien|technicienne|fabricant|fabricante|médecin|ingénieur)\b.*\b(qui|chargée?|dont le métier|de métier|exerce|fabrique|vend|répare|travaille|soigne|enseigne)\b", re.I)
SKIP_DEF = re.compile(r"^(pluriel|féminin|masculin|variante|ancienne orthographe|orthographe|graphie|forme|participe|singulier|abréviation|apocope|aphérèse|diminutif|augmentatif|nom de famille|prénom|nom vernaculaire de plusieurs|ensemble des sens|personne de|habitant|habitante|commune|localité|ville|village|gentilé|relatif à|relative à|qui concerne|qui se rapporte|qui a rapport|qui appartient|qui est relatif|action de|fait de|état de ce qui est|caractère de ce qui est|qualité de ce qui est|première personne|deuxième personne|troisième personne|indicatif|subjonctif|impératif)\b", re.I)

def clean_def(d):
    d = re.sub(r'\{\{[^}]*\}\}|\[\[|\]\]|<[^>]+>', '', d)
    d = re.sub(r"\s*Note d['’]usage.*$", '', d)
    d = re.sub(r'\s*\([^()]*\)', '', d)              # parenthèses (étiquettes, noms latins)
    d = re.sub(r'^[A-Z][a-z]+ [a-z]+(?: [a-z]+)?,\s*', '', d)  # nom latin en tête : Allium cepa, …
    d = re.sub(r'\s*\((?:sens|par extension|par analogie|figuré|familier|vieilli|rare|désuet|soutenu|populaire|argot|ironique)[^)]*\)', '', d, flags=re.I)
    d = re.sub(r'\s+', ' ', d).strip(' ;:,.')
    # une seule phrase : coupe au premier point suivi d'une majuscule si trop long
    if len(d) > 90:
        m = re.search(r'[.;] [A-ZÉÈÀ]', d)
        if m and m.start() >= 12: d = d[:m.start()]
        else:
            m = re.search(r' ; ', d)
            if m and m.start() >= 12: d = d[:m.start()]
    d = d.strip(' ;:,.')
    if d: d = d[0].upper() + d[1:]
    return d

def ok_def(d, ans, lemma):
    if not (8 <= len(d) <= 100): return False
    if BAD_WORDS.search(d): return False
    if SKIP_DEF.match(d): return False
    if re.search(r'[0-9]{3,}|[→=⁰¹²³⁴⁵⁶⁷⁸⁹]|https?:|\bvoir\b|\bvoyez\b|\bcf\b', d, re.I): return False
    if ANAPH.search(d) or LATIN.search(d) or PRON.match(d) or re.search(r'nom vernaculaire|[«»—]', d, re.I): return False
    toks = [norm(t) for t in re.split(r"[\s'’\-,;:.()«»\"/]+", d) if t]
    for t in toks:
        if len(t) < 4: continue
        cp = 0
        while cp < min(len(t), len(ans)) and t[cp] == ans[cp]: cp += 1
        if cp >= 4 and cp >= .7 * len(t): return False      # même racine : poivre / poivrier
        if len(t) >= 5 and t in ans: return False            # compiler / recompiler
    stem = ans[:max(4, min(len(ans) - 1, 6))] if len(ans) > 4 else ans
    for t in toks:
        if not t: continue
        if t == ans or (len(t) >= 4 and (t.startswith(stem) or ans.startswith(t) and len(t) >= len(ans) - 2)): return False
    return True

words = collections.OrderedDict()
seen = 0
with gzip.open(SRC, 'rt', encoding='utf-8') as fh:
    for row in csv.DictReader(fh):
        seen += 1
        lemma, pos = row['lemma'], row['pos']
        if pos not in ('noun', 'adjective', 'verb', 'adverb'): continue
        if not lemma or not lemma[0].islower() or re.search(r"[\s'’\-.0-9]", lemma): continue
        try: z = float(row['zipf_frequency'] or 0)
        except ValueError: z = 0.0
        rare = z < 1.0          # mot hors des corpus de fréquence : accepté seulement s'il est clairement thématique
        if rare and row['scrabble_valid'] != '1': continue
        if not rare and row['scrabble_valid'] != '1' and z < 2: continue
        reg = set(filter(None, row['register'].split('|')))
        doms = list(filter(None, row['domain'].split('|')))
        if reg & BAN_REG or set(doms) & BAN_DOM: continue
        if reg & OLD_REG and z < 2.5: continue
        if row['region'] and z < 2.0: continue
        ans = norm(lemma)
        if ans in STOP: continue
        if z >= 5.8 and len(ans) <= 4: continue      # mots grammaticaux très fréquents
        if not (3 <= len(ans) <= 13): continue
        try: defs = json.loads(row['definitions'] or '[]')
        except ValueError: defs = [row['definition']]
        good = []
        for d in defs[:8]:
            d = clean_def(d)
            if ok_def(d, ans, lemma) and d not in good: good.append(d)
        if not good: continue
        good.sort(key=lambda x: x.lower().startswith('synonyme de'))   # « Synonyme de … » en dernier recours
        if len(ans) == 3 and (z < 3 or re.match(r'(organisme|sigle|acronyme|abréviation)', good[0], re.I)): continue
        themes = set()
        sc = int(row['sense_count'] or 1)
        for dm in doms:
            t = D2T.get(dm)
            if not t: continue
            if (sc <= 2 and len(doms) <= 2) or (t in KW and KW[t].search(good[0])): themes.add(t)
        for t, rx in STRONG.items():
            if rx.match(good[0]): themes.add(t)
        if pos == 'noun' and METIER.match(good[0]): themes.add('vie')
        if rare:
            # mot rare (niveau Expert) : nom ou adjectif de 4 à 11 lettres, définition courte
            if len(ans) > 11 or len(ans) < 4 or pos not in ('noun', 'adjective'): continue
            sc = int(row['sense_count'] or 1)
            themes = {D2T[d] for d in doms if d in D2T} if len(doms) <= 2 else themes
            good = [d for d in good if len(d) <= 80][:2]
            if not good: continue
            z = 0.5
        if not themes: themes.add('cg')  # vocabulaire général : Culture générale
        w = words.get(ans)
        if w is None:
            words[ans] = w = {'z': z, 't': set(), 'd': []}
        w['z'] = max(w['z'], z); w['t'] |= themes
        for d in good:
            if len(w['d']) < 4 and d not in w['d']: w['d'].append(d)

with gzip.open(OUT, 'wt', encoding='utf-8') as out:
    for a, w in words.items():
        out.write(f"{a}\t{w['z']:.2f}\t{','.join(sorted(w['t']))}\t{'|'.join(x.replace('|', '/') for x in w['d'])}\n")

tc = collections.Counter(t for w in words.values() for t in w['t'])
zc = collections.Counter('facile' if w['z'] >= 3.3 else 'moyen' if w['z'] >= 2.3 else 'difficile' for w in words.values())
print(f"{seen} entrées lues · {len(words)} mots retenus · {sum(len(w['d']) for w in words.values())} définitions")
print('par niveau :', dict(zc))
print('par thème :', dict(tc.most_common()))
