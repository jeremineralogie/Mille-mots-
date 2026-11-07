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
# Domaine du Wiktionnaire -> thème du jeu (thèmes regroupés pour rester assez fournis)
DOM = {
 'hist': 'history archeology anthropology ethnology paleontology nobility heraldry military numismatics',
 'terre': 'geography geology hydrology cartography meteorology biogeography pedology mineralogy petrography astronomy astronautics',
 'sci': 'chemistry biology biochemistry mathematics geometry metrology electricity science statistics logic topology microbiology virology histology embryology physics computing programming Internet telecommunications telephony technology technical mechanical metallurgy',
 'corps': 'medicine anatomy surgery pharmacology physiology oncology neurology ophthalmology psychiatry dentistry',
 'ani': 'zoology ornithology entomology ichthyology mammalogy malacology herpetology',
 'nat': 'botany agriculture forestry mycology horticulture',
 'cui': 'cuisine cooking beverages oenology',
 'sport': 'sports cycling soccer rugby equestrianism martial-arts fencing games chess',
 'arts': 'art arts architecture literature poetry film theater photography',
 'mus': 'music dance',
 'myth': 'mythology religion Christianity Catholicism Islam theology',
 'lang': 'linguistic grammar rhetoric',
 'voy': 'nautical transport railways aeronautics aviation automobile',
 'soc': 'law politics finance commerce accounting management business',
}
D2T = {d: t for t, ds in DOM.items() for d in ds.split()}
def kw(words):  # mots entiers (pluriel accepté) ; un « * » final autorise une racine
    parts = [w[:-1] + r'\w*' if w.endswith('*') else w + 's?' for w in words.split()]
    return re.compile(r"\b(" + '|'.join(parts) + r")\b", re.I)
# La définition AFFICHÉE doit contenir un de ces mots pour que le mot entre dans le thème
KW = {
 'hist': kw("antique antiquité histoire historique empire empereur romain grec gaulois peuple civilisation préhistori* dynastie médiéval moyen-âge seigneur roi reine royal noble noblesse chevalier blason armoiries héraldi* militaire soldat armée guerre bataille fief féodal légion pharaon tribu monarchie révolution"),
 'terre': kw("roche minéral* terrain relief montagne vallée fleuve rivière côte mer océan île sol climat vent pluie volcan* sédiment* glacier géolog* géograph* désert plateau lac golfe littoral astre étoile planète ciel céleste lune soleil galaxie comète satellite astronom* orbite séisme"),
 'sci': kw("chimi* composé élément atome molécule acide métal physique mathémati* équation géométri* biologi* gène enzyme protéine électri* cristal ion électron laboratoire scientifique formule théorème informatique ordinateur logiciel programme réseau machine appareil mécani* moteur électronique numérique"),
 'corps': kw("corps organe os muscle maladie médecin médical* inflammation douleur sang nerf nerveux peau tumeur infection symptôme médicament chirurgi* lésion glande patient soin cœur poumon foie rein cerveau articulation vertèbre fièvre virus santé"),
 'ani': kw("animal animaux oiseau poisson insecte mammifère reptile amphibien mollusque crustacé araignée rongeur serpent chien cheval bovin félin singe gibier plumage zoologi* larve chenille papillon coléoptère cétacé rapace passereau ruminant lézard"),
 'nat': kw("plante arbre arbuste arbrisseau fleur feuille herbe fruit graine champignon végétal* botani* jardin forêt légume céréale algue mousse fougère tige bourgeon"),
 'cui': kw("plat mets cuisine culinaire sauce gâteau pâtisserie pain viande boisson vin fromage aliment alimentaire recette cuit cuisson potage soupe dessert épice liqueur bière confiserie charcuterie farine beurre sucre cuisiner"),
 'sport': kw("sport sportif joueur équipe match course coureur ballon balle compétition athlète escrime lutte boxe ski vélo cycliste jeu jouer pion échecs cartes"),
 'arts': kw("art artiste peinture peintre sculpt* dessin architect* bâtiment édifice ornement décor style colonne voûte poème poésie poète vers littéraire roman écrivain livre récit film cinéma théâtre scène acteur spectacle photographi*"),
 'mus': kw("musique musical* instrument chant chanson danse danseur rythme orchestre mélodie opéra compositeur note accord"),
 'myth': kw("dieu déesse divin* divinité religi* église prêtre saint culte sacré liturgi* biblique bible mytholog* démon ange prière moine messe rite fabuleux légendaire"),
 'lang': kw("mot langue linguisti* grammaire grammatical* phrase verbe syllabe lettre locution expression figure discours"),
 'voy': kw("navire bateau marin maritime voile mât cordage véhicule voiture train avion aérien voyage transport wagon automobile embarcation"),
 'soc': kw("droit loi juridique tribunal juge contrat impôt taxe argent monnaie banque commerce commercial marché prix vente entreprise politique parti élection vote gouvernement budget crédit dette finance financier économi* social société"),
}
# Définitions qui ouvrent sur une catégorie sans ambiguïté
STRONG = {k: re.compile(v, re.I) for k, v in {
 'ani': r"^(oiseau|poisson|insecte|mammifère|reptile|amphibien|mollusque|crustacé|araignée|serpent|lézard|papillon|coléoptère|rongeur|ruminant|cétacé|rapace|passereau|petit animal|grand animal|animal|espèce d'oiseau|espèce de poisson|genre d'oiseau|genre d'insecte)\b",
 'nat': r"^(plante|arbre|arbuste|arbrisseau|fleur|herbe|champignon|algue|fougère|graminée|conifère|liane|espèce de plante|genre de plantes?)\b",
 'cui': r"^(plat|mets|sauce|gâteau|pâtisserie|potage|soupe|boisson|vin|liqueur|fromage|confiserie|friandise|bonbon|ragoût|charcuterie|biscuit|préparation culinaire)\b",
 'corps': r"^(maladie|inflammation|tumeur|os|muscle|organe|glande|médicament)\b",
 'mus': r"^(instrument de musique|danse|chant|composition musicale|pièce musicale|morceau de musique)\b",
 'myth': r"^(divinité|dieu|déesse|démon|nymphe|monstre fabuleux|être fabuleux|créature fabuleuse)\b",
 'terre': r"^(roche|minéral|vent|cours d'eau|étoile|planète|constellation)\b",
}.items()}
METIER = re.compile(r"^(personne|celui|celle|ouvrier|ouvrière|artisan|artisane|spécialiste|professionnel|professionnelle|employé|employée|marchand|marchande|technicien|technicienne|fabricant|fabricante)\b[^.]*\b(fabrique|fabriquent|vend|vendent|répare|métier|profession|professionnellement|soigne|enseigne|entretient|cultive|élève|construit|confectionne|travaille)\b", re.I)
BAD_WORDS = re.compile(r"\b(sexe|sexuel|sexuelle|érection|pénis|vagin|vulve|coït|masturb|prostitu|pornogra|testicule|anus|fesses|sodom|copul|orgasme|nazi|raciste|injure|insulte)", re.I)
STOP = set('NAZI NAZIE NAZISME HITLERIEN NEGRE NEGRESSE BOUGNOULE YOUPIN PUTE SALOPE CONNARD CONNASSE ENCULE BITE CHATTE NIQUER BAISER BAISE DES LES UNE UNS AUX CES SES MES TES NOS VOS LEUR LEURS QUI QUE QUOI DONT MAIS DONC NOUS VOUS ELLE ELLES ILS EUX LUI MOI TOI SOI CELA CECI CET CETTE AVEC SANS POUR PAR SUR SOUS DANS CHEZ VERS ENTRE TRES PLUS MOINS AUSSI BIEN TOUT TOUS TOUTE TOUTES RIEN'.split())
ANAPH = re.compile(r"\b(cette|cet|ces|ce dernier|cette dernière|celle-ci|celui-ci|ceux-ci|ledit|ladite|ce sens|ce mot|ce terme|cette espèce|cet animal|cette plante)\b", re.I)
LATIN = re.compile(r"\b[A-Z][a-z]{2,} [a-z]{3,}(?:us|um|is|ae|ii|ensis|oides|as|ata|ica|ina)\b")
PRON = re.compile(r"^(Il|Elle|Je|Tu|Nous|Vous|Ils|Elles|J'|C'est|Ce sont) ")
BAN_REG = {'vulgar', 'offensive', 'very-familiar'}
OLD_REG = {'obsolete', 'archaic', 'very rare'}
BAN_DOM = {'sexuality'}
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
        # Thème : il faut que la définition affichée relève du thème (domaine + mot-clé, ou ouverture sans ambiguïté)
        themes = set(); tdef = {}
        cands = {D2T[d] for d in doms if d in D2T}
        for t in cands:
            m = [d for d in good if KW[t].search(d[:40])]
            if m: themes.add(t); tdef[t] = m
        for t, rx in STRONG.items():
            m = [d for d in good if rx.match(d)]
            if m: themes.add(t); tdef[t] = m + [d for d in tdef.get(t, []) if d not in m]
        if pos == 'noun':
            m = [d for d in good if METIER.match(d)]
            if m: themes.add('soc'); tdef['soc'] = m   # métiers : thème Société & métiers
        if len(themes) > 1:   # un seul thème : celui de la définition principale
            first = min(themes, key=lambda t: good.index(tdef[t][0]))
            themes = {first}
        if themes:
            good = tdef[next(iter(themes))][:3]
        if rare:
            # mot rare (niveau Expert) : nom ou adjectif de 4 à 11 lettres, définition courte
            if len(ans) > 11 or len(ans) < 4 or pos not in ('noun', 'adjective'): continue
            good = [d for d in good if len(d) <= 80][:2]
            if not good: continue
            z = 0.5
        w = words.get(ans)
        if w is None:
            words[ans] = w = {'z': z, 't': set(), 'd': [], 'td': None}
        w['z'] = max(w['z'], z)
        if themes and w['td'] is None:          # la première entrée thématique (la plus fréquente) fixe le thème
            w['td'] = (next(iter(themes)), good)
        for d in good:
            if len(w['d']) < 4 and d not in w['d']: w['d'].append(d)

# Un seul thème par mot ; un mot thématique ne garde que ses définitions thématiques
for w in words.values():
    if w['td']: w['t'] = {w['td'][0]}; w['d'] = w['td'][1][:3]
    else: w['t'] = {'cg'}

with gzip.open(OUT, 'wt', encoding='utf-8') as out:
    for a, w in words.items():
        out.write(f"{a}\t{w['z']:.2f}\t{','.join(sorted(w['t']))}\t{'|'.join(x.replace('|', '/') for x in w['d'])}\n")

tc = collections.Counter(t for w in words.values() for t in w['t'])
zc = collections.Counter('facile' if w['z'] >= 3.3 else 'moyen' if w['z'] >= 2.3 else 'difficile' for w in words.values())
print(f"{seen} entrées lues · {len(words)} mots retenus · {sum(len(w['d']) for w in words.values())} définitions")
print('par niveau :', dict(zc))
print('par thème :', dict(tc.most_common()))
