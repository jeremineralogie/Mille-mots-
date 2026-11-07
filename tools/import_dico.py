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
 'hist': 'history archeology anthropology ethnology paleontology nobility heraldry military numismatics feudalism monarchy Egyptology fortification artillery paleography vexillology chronology',
 'terre': 'geography geology hydrology cartography meteorology biogeography pedology mineralogy petrography astronomy astronautics glaciology volcanology oceanography climatology geomorphology topography hydrography petrology astrophysics',
 'sci': 'chemistry biology biochemistry mathematics geometry metrology electricity science statistics logic topology microbiology virology histology embryology physics computing programming Internet telecommunications telephony technology technical mechanical metallurgy algebra arithmetic thermodynamics crystallography electromagnetism robotics nanotechnology cryptography networking machining tools',
 'corps': 'medicine anatomy surgery pharmacology physiology oncology neurology ophthalmology psychiatry dentistry obstetrics dermatology pathology epidemiology immunology psychopathology physiology',
 'ani': 'zoology ornithology entomology ichthyology mammalogy malacology herpetology arachnology conchology beekeeping falconry hunting fishing farriery',
 'nat': 'botany agriculture forestry mycology horticulture phycology bryology phytopathology ecology',
 'cui': 'cuisine cooking beverages oenology food beer ',
 'sport': 'sports cycling soccer rugby equestrianism martial-arts fencing games chess tennis golf basketball billiards boxing swimming baseball mountaineering judo diving wrestling volleyball handball skating bowling archery cricket curling skydiving paintball poker bridge mahjong gambling hobbies juggling bodybuilding motorcycling bullfighting circus',
 'arts': 'art arts architecture literature poetry film theater photography comics engraving calligraphy narratology visual-arts performing-arts typography editing',
 'mus': 'music dance',
 'myth': 'mythology religion Christianity Catholicism Islam theology Buddhism Protestantism Sufism occultism astrology alchemy',
 'lang': 'linguistic grammar rhetoric phonology lexicography dialectology morphology lexicology syntax sociolinguistics',
 'voy': 'nautical transport railways aeronautics aviation automobile tourism',
 'soc': 'law politics finance commerce accounting management business taxation insurance diplomacy marketing money journalism police',
}
D2T = {d: t for t, ds in DOM.items() for d in ds.split()}
def kw(words):  # mots entiers (pluriel accepté) ; un « * » final autorise une racine
    parts = [w[:-1] + r'\w*' if w.endswith('*') else w + 's?' for w in words.split()]
    return re.compile(r"\b(" + '|'.join(parts) + r")\b", re.I)
# La définition AFFICHÉE doit contenir un de ces mots pour que le mot entre dans le thème
KW = {
 'hist': kw("antique antiquité histoire historique empire empereur impératrice romain romaine grec grecque gaulois gauloise civilisation préhistori* dynastie médiéval* moyen-âge seigneur seigneurie roi reine royal royale royaume prince princesse noble noblesse chevalier chevalerie blason armoiries héraldi* militaire soldat armée guerre guerrier bataille fief féodal* vassal légion légionnaire pharaon tribu monarchie monarque révolution révolutionnaire colonie colonial* croisade croisé château forteresse rempart fortification épée canon artillerie cavalerie infanterie régiment officier grade insurrection sénat sénateur consul tribun patricien plébéien esclave servage serf barbare viking celte celtique franc mérovingien carolingien capétien napoléon* bourbon ancien archéologi* vestige fouille égyptien hiéroglyphe sumérien babylonien aztèque inca maya ottoman sultan tsar calife duc duché comte comté marquis baron vicomte écuyer héraut tournoi armure cuirasse"),
 'terre': kw("roche rocher minéral* terrain relief montagne montagneux vallée fleuve rivière ruisseau côte côtier mer marin océan océanique île îlot sol climat climatique vent pluie neige orage volcan* sédiment* glacier géolog* géograph* désert plateau plaine colline lac golfe baie littoral rivage estuaire delta astre étoile planète planétaire ciel céleste lune lunaire soleil solaire galaxie comète satellite astronom* orbite séisme sismique atmosphère atmosphérique météo* nuage cristal gisement minerai calcaire granit* argile sable falaise grotte caverne marais tourbière steppe savane toundra latitude longitude hémisphère pôle polaire équateur tropique continent fuseau altitude cratère météorite nébuleuse constellation univers cosmique cosmos spatial* fusée astronaute éclipse marée courant"),
 'sci': kw("chimi* composé élément atome atomique molécule moléculaire acide métal métallique alliage physique mathémati* équation géométri* algèbre algébrique calcul biologi* cellule cellulaire gène génétique enzyme protéine électri* cristal ion électron proton neutron particule énergie onde fréquence lumière optique laboratoire scientifique formule théorème informatique ordinateur logiciel programme programmation réseau internet donnée données fichier machine appareil instrument outil mécani* moteur électronique numérique technique technologi* dispositif vitesse température pression gaz liquide solide réaction oxyde hydrogène oxygène carbone azote fer cuivre plomb polymère statistique probabilité courbe angle triangle cercle polygone vecteur matrice algorithme processeur circuit transistor câble engin usinage soudure tension fusion radioactivi*"),
 'corps': kw("corps organe organisme os osseux muscle musculaire maladie malade médecin médical* médecine inflammation douleur sang sanguin nerf nerveux peau cutané tumeur infection infectieux symptôme syndrome médicament remède chirurgi* lésion glande patient soin soigner cœur cardiaque poumon pulmonaire foie hépatique rein rénal cerveau cérébral articulation vertèbre fièvre virus bactérie santé dent dentaire œil oculaire oreille nez bouche gorge estomac intestin intestinal ventre abdomen thorax crâne bras jambe main pied doigt genou épaule squelette hormone digestion digestif respiratoire respiration plaie blessure fracture paralysie toux allergie anémie cancer diabète thérapie thérapeutique traitement guérir guérison infirmier hôpital pathologi* chronique aigu sein utérus grossesse accouchement fœtus embryon"),
 'ani': kw("animal animaux oiseau poisson insecte mammifère reptile amphibien mollusque crustacé araignée rongeur serpent chien chienne cheval jument bovin vache taureau mouton chèvre porc cochon félin chat singe gibier plumage zoologi* larve chenille papillon coléoptère cétacé rapace passereau ruminant lézard espèce faune bête fourrure pelage plume aile bec patte sabot corne queue nageoire écaille carapace nid ponte œuf troupeau élevage éleveur chasse chasseur pêche pêcheur proie prédateur ver abeille fourmi mouche guêpe crapaud grenouille tortue baleine dauphin requin poule coq canard oie pigeon aigle hibou loup renard ours cerf lièvre lapin souris rat chauve-souris faucon"),
 'nat': kw("plante arbre arbuste arbrisseau fleur floral* feuille feuillage herbe herbacé fruit graine champignon végétal* végétation botani* jardin jardinage jardinier forêt forestier légume céréale algue mousse fougère tige bourgeon racine écorce pétale branche rameau sève pollen semence semis cultiver agricole agriculture verger vigne vignoble potager prairie pré bosquet haie buisson bulbe tubercule épi gousse baie noyau pépin récolte moisson labour engrais terreau sylvicult* horticult* ombellifère composée rosacée graminée liliacée conifère résineux"),
 'cui': kw(" mets cuisine culinaire sauce gâteau pâtisserie pâtissier pain boulanger boulangerie viande boucher boucherie boisson vin vinicole fromage aliment alimentaire nourriture manger repas recette cuit cuire cuisson potage soupe dessert épice épicé liqueur alcool alcoolisé bière confiserie charcuterie farine beurre sucre sucré salé cuisiner pâte crème lait laitier friture frit rôti grillé casserole poêle marmite ustensile assaisonnement condiment huile vinaigre moutarde fumé apéritif cocktail café thé chocolat bonbon biscuit tarte crêpe ragoût salade garniture farce hachis vigneron cépage cru millésime dégustation gastronomi* traiteur restaurant"),
 'sport': kw("sport sportif sportive joueur joueuse équipe match course coureur ballon balle compétition championnat champion athlète athlétisme escrime escrimeur lutteur boxe boxeur ski skieur vélo cycliste cyclisme jeu échecs échiquier cartes dés football footballeur rugby tennis golf basket-ball basket handball volley-ball natation nageur gymnastique gymnaste judo karaté olympique stade arbitre buteur gardien raquette piste score victoire tournoi entraîneur entraînement équitation cavalier cavalière hippique galop saut sauteur alpinisme alpiniste escalade randonnée plongée surf patin patinage glisse aviron régate billard pétanque boules quilles poker belote tarot bridge loto loterie casino pari jouet devinette puzzle échiquéen haltère musculation relais sprint marathon"),
 'arts': kw("art artiste artistique peinture peintre peint sculpt* dessin dessinateur architect* bâtiment édifice monument ornement ornemental décor décoratif décoration style colonne voûte façade fresque mosaïque vitrail toile tableau gravure graveur estampe poème poésie poète poétique strophe rime littéraire littérature romancier écrivain auteur livre récit conte fable film cinéma cinématographique théâtre théâtral acteur actrice comédien comédie tragédie drame spectacle photographi* chef-d'œuvre musée galerie esthétique baroque gothique renaissance impressionnis* typographi* imprimerie édition éditeur chapitre personnage intrigue réalisateur bande dessinée caricature portrait paysage"),
 'mus': kw("musique musicien musicienne musical* instrument chant chanteur chanteuse chanson danse danseur danseuse rythme rythmique orchestre orchestral mélodie mélodique opéra compositeur composition gamme tonalité harmonie harmonique partition symphonie concerto sonate cantate refrain couplet vocal* soprano ténor baryton alto violon violoncelle piano guitare flûte trompette tambour percussion clavier archet ballet chorégraphi* valse tango bal fanfare chorale chœur jazz rock air"),
 'myth': kw("dieu déesse divin* divinité religi* église prêtre prêtresse saint sainte culte sacré sacrée liturgi* biblique bible mytholog* mythique démon démoniaque ange angélique prière moine moniale messe rite rituel fabuleux fabuleuse légendaire légende mythe héros héroïne monstre créature nymphe titan olympe paradis enfer diable sorcier sorcière magie magique fée elfe dragon spirituel* clergé évêque pape abbé abbaye monastère couvent temple mosquée synagogue chrétien chrétienne christianisme catholique protestant islam islamique musulman juif juive judaïsme bouddhis* hindou* chapelle cathédrale autel sacrement baptême péché croyant croyance prophète apôtre évangile coran talmud théologi* oracle superstition offrande sacrifice païen idole vénération"),
 'lang': kw("mot langue linguisti* grammaire grammatical* phrase verbe verbal* syllabe locution discours adjectif adverbe pronom préposition conjonction suffixe préfixe radical conjugaison accent prononciation orthographe vocabulaire lexique écriture alphabet consonne voyelle phonétique dialecte patois argot rhétorique tournure complément néologisme langage"),
 'voy': kw("navire bateau marin maritime navigation naviguer voile voilier mât cordage véhicule voiture train avion aérien aéroport voyage voyageur transport transporter wagon automobile embarcation port escale quai cale coque proue poupe gouvernail ancre amarre équipage capitaine matelot pilote cockpit hélice locomotive rail ferroviaire gare métro tramway autobus camion routier autoroute chaussée trajet itinéraire passager bagage valise tourisme touriste hôtel excursion croisière carrosse charrette diligence calèche vélo bicyclette moto roue pneu"),
 'soc': kw(" loi légal juridique tribunal juge justice avocat procès contrat impôt taxe fiscal* argent monnaie monétaire banque bancaire commerce commercial commerçant marché prix vente vendre acheter achat entreprise politique parti élection électoral vote gouvernement ministre ministère budget crédit dette finance financier économi* social sociale société salaire salarié travail emploi employeur métier profession professionnel ouvrier syndicat grève administration administratif fonctionnaire citoyen citoyenneté république démocratie assemblée député parlement police policier délit crime criminel peine prison sanction amende assurance bourse investissement profit revenu dépense comptable propriété héritage notaire diplomatie diplomate ambassade journal journaliste presse média publicité école enseignement enseignant élève"),
}
# Définitions qui ouvrent sur une catégorie sans ambiguïté
STRONG = {k: re.compile(v, re.I) for k, v in {
 'ani': r"^(oiseau|poisson|insecte|mammifère|reptile|amphibien|mollusque|crustacé|araignée|serpent|lézard|papillon|coléoptère|rongeur|ruminant|cétacé|rapace|passereau|petit animal|grand animal|animal|espèce d'oiseau|espèce de poisson|genre d'oiseau|genre d'insecte)\b",
 'nat': r"^(plante|arbre|arbuste|arbrisseau|fleur|herbe|champignon|algue|fougère|graminée|conifère|liane|espèce de plante|genre de plantes?)\b",
 'cui': r"^((plat|mets) (de|à|composé|cuisiné|typique|traditionnel|fait|préparé|cuit|réalisé|d'origine|garni|épicé|régional|chaud|froid|national)|sauce|gâteau|pâtisserie|potage|soupe|boisson|vin|liqueur|fromage|confiserie|friandise|bonbon|ragoût|charcuterie|biscuit|préparation culinaire)\b",
 'corps': r"^(maladie|inflammation|tumeur|os|muscle|organe|glande|médicament)\b",
 'mus': r"^(instrument de musique|danse|chant|composition musicale|pièce musicale|morceau de musique)\b",
 'myth': r"^(divinité|dieu|déesse|démon|nymphe|monstre fabuleux|être fabuleux|créature fabuleuse)\b",
 'terre': r"^(roche|minéral|vent|cours d'eau|étoile|planète|constellation)\b",
}.items()}
METIER = re.compile(r"^(personne|celui|celle|ouvrier|ouvrière|artisan|artisane|spécialiste|professionnel|professionnelle|employé|employée|marchand|marchande|technicien|technicienne|fabricant|fabricante)\b[^.]*\b(fabrique|fabriquent|vend|vendent|répare|métier|profession|professionnellement|soigne|enseigne|entretient|cultive|élève|construit|confectionne|travaille)\b", re.I)
BAD_WORDS = re.compile(r"\b(sexe|sexuel|sexuelle|érection|pénis|vagin|vulve|coït|masturb|prostitu|pornogra|testicule|anus|fesses|sodom|copul|orgasme|nazi|raciste|injure|insulte)", re.I)
STOP = set('NAZI NAZIE NAZISME HITLERIEN NEGRE NEGRESSE BOUGNOULE YOUPIN PUTE SALOPE CONNARD CONNASSE ENCULE BITE CHATTE NIQUER BAISER BAISE DES LES UNE UNS AUX CES SES MES TES NOS VOS LEUR LEURS QUI QUE QUOI DONT MAIS DONC NOUS VOUS ELLE ELLES ILS EUX LUI MOI TOI SOI CELA CECI CET CETTE AVEC SANS POUR PAR SUR SOUS DANS CHEZ VERS ENTRE TRES PLUS MOINS AUSSI BIEN TOUT TOUS TOUTE TOUTES RIEN'.split())
ANAPH = re.compile(r"\b(ce cépage|ce nom|de ce nom|même nom|analogue|ci-dessus|précédent|précédente|susdit|cette|cet|ces|ce dernier|cette dernière|celle-ci|celui-ci|ceux-ci|ledit|ladite|ce sens|ce mot|ce terme|cette espèce|cet animal|cette plante)\b", re.I)
LATIN = re.compile(r"\b[A-Z][a-z]{2,} [a-z]{3,}(?:us|um|is|ae|ii|ensis|oides|as|ata|ica|ina)\b")
PRON = re.compile(r"^(Il|Elle|Je|Tu|Nous|Vous|Ils|Elles|J'|C'est|Ce sont) ")
BAN_REG = {'vulgar', 'offensive', 'very-familiar'}
OLD_REG = {'obsolete', 'archaic', 'very rare'}
BAN_DOM = {'sexuality'}
SKIP_DEF = re.compile(r"^(pluriel|féminin|masculin|variante|ancienne orthographe|orthographe|graphie|forme|participe|singulier|abréviation|apocope|aphérèse|diminutif|augmentatif|nom de famille|prénom|nom vernaculaire de plusieurs|ensemble des sens|personne de|habitant|habitante|commune|localité|ville|village|gentilé|relatif à|relative à|qui concerne|qui se rapporte|qui a rapport|qui appartient|qui est relatif|action de|fait de|état de ce qui est|caractère de ce qui est|qualité de ce qui est|première personne|deuxième personne|troisième personne|indicatif|subjonctif|impératif)\b", re.I)

# Contexte affiché devant une définition trop elliptique : « Au tennis, coup frappé violemment vers le sol »
LABEL = {
 'history': 'En histoire', 'archeology': 'En archéologie', 'paleontology': 'En paléontologie', 'nobility': 'Dans la noblesse', 'heraldry': 'En héraldique',
 'military': "Dans l'armée", 'numismatics': 'En numismatique', 'feudalism': 'Sous la féodalité', 'Egyptology': "Dans l'Égypte antique", 'fortification': 'En fortification', 'artillery': "Dans l'artillerie",
 'geography': 'En géographie', 'geology': 'En géologie', 'meteorology': 'En météorologie', 'mineralogy': 'En minéralogie', 'astronomy': 'En astronomie', 'glaciology': 'En glaciologie', 'volcanology': 'En volcanologie', 'oceanography': 'En océanographie', 'climatology': 'En climatologie', 'hydrology': 'En hydrologie', 'pedology': "En science des sols", 'petrography': 'En géologie',
 'chemistry': 'En chimie', 'biology': 'En biologie', 'biochemistry': 'En biochimie', 'mathematics': 'En mathématiques', 'geometry': 'En géométrie', 'algebra': 'En algèbre', 'arithmetic': 'En arithmétique', 'statistics': 'En statistique', 'logic': 'En logique', 'physics': 'En physique', 'electricity': 'En électricité', 'computing': 'En informatique', 'programming': 'En programmation', 'Internet': 'Sur Internet', 'telecommunications': 'En télécommunications', 'mechanical': 'En mécanique', 'metallurgy': 'En métallurgie', 'metrology': 'En métrologie', 'thermodynamics': 'En thermodynamique', 'crystallography': 'En cristallographie', 'microbiology': 'En microbiologie', 'robotics': 'En robotique', 'cryptography': 'En cryptographie', 'machining': 'En usinage',
 'medicine': 'En médecine', 'anatomy': 'En anatomie', 'surgery': 'En chirurgie', 'pharmacology': 'En pharmacie', 'physiology': 'En physiologie', 'oncology': 'En cancérologie', 'neurology': 'En neurologie', 'ophthalmology': 'En ophtalmologie', 'psychiatry': 'En psychiatrie', 'dentistry': 'En dentisterie', 'obstetrics': 'En obstétrique', 'dermatology': 'En dermatologie', 'pathology': 'En pathologie', 'immunology': 'En immunologie', 'epidemiology': 'En épidémiologie',
 'zoology': 'En zoologie', 'ornithology': 'En ornithologie', 'entomology': 'En entomologie', 'ichthyology': 'En ichtyologie', 'malacology': 'En malacologie', 'herpetology': 'En herpétologie', 'beekeeping': 'En apiculture', 'falconry': 'En fauconnerie', 'hunting': 'À la chasse', 'fishing': 'À la pêche', 'farriery': 'En maréchalerie', 'arachnology': 'En arachnologie',
 'botany': 'En botanique', 'agriculture': 'En agriculture', 'forestry': 'En sylviculture', 'mycology': 'En mycologie', 'horticulture': 'En horticulture', 'ecology': 'En écologie',
 'cuisine': 'En cuisine', 'cooking': 'En cuisine', 'beverages': 'Côté boissons', 'oenology': 'En œnologie', 'beer': 'En brasserie',
 'sports': 'En sport', 'cycling': 'En cyclisme', 'soccer': 'Au football', 'rugby': 'Au rugby', 'equestrianism': 'En équitation', 'martial-arts': 'Dans les arts martiaux', 'fencing': 'En escrime', 'games': 'Dans les jeux', 'chess': 'Aux échecs', 'tennis': 'Au tennis', 'golf': 'Au golf', 'basketball': 'Au basket', 'billiards': 'Au billard', 'boxing': 'En boxe', 'swimming': 'En natation', 'baseball': 'Au baseball', 'mountaineering': 'En alpinisme', 'judo': 'Au judo', 'diving': 'En plongée', 'wrestling': 'En lutte', 'volleyball': 'Au volley', 'handball': 'Au handball', 'skating': 'En patinage', 'bowling': 'Au bowling', 'archery': "En tir à l'arc", 'poker': 'Au poker', 'bridge': 'Au bridge', 'gambling': "Dans les jeux d'argent", 'bullfighting': 'En tauromachie', 'circus': 'Au cirque', 'motorcycling': 'En moto', 'juggling': 'En jonglerie', 'bodybuilding': 'En musculation',
 'art': 'En art', 'architecture': 'En architecture', 'literature': 'En littérature', 'poetry': 'En poésie', 'film': 'Au cinéma', 'theater': 'Au théâtre', 'photography': 'En photographie', 'comics': 'En bande dessinée', 'engraving': 'En gravure', 'typography': 'En typographie', 'calligraphy': 'En calligraphie',
 'music': 'En musique', 'dance': 'En danse',
 'mythology': 'Dans la mythologie', 'religion': 'En religion', 'Christianity': 'Chez les chrétiens', 'Catholicism': "Dans l'Église catholique", 'Islam': "Dans l'islam", 'theology': 'En théologie', 'Buddhism': 'Dans le bouddhisme', 'Protestantism': 'Chez les protestants', 'astrology': 'En astrologie', 'alchemy': 'En alchimie', 'occultism': 'En ésotérisme',
 'linguistic': 'En linguistique', 'grammar': 'En grammaire', 'rhetoric': 'En rhétorique', 'phonology': 'En phonologie', 'lexicography': 'En lexicographie',
 'nautical': 'En marine', 'transport': 'Dans les transports', 'railways': 'Dans les chemins de fer', 'aeronautics': 'En aéronautique', 'aviation': 'En aviation', 'automobile': 'En automobile', 'tourism': 'En tourisme',
 'law': 'En droit', 'politics': 'En politique', 'finance': 'En finance', 'commerce': 'Dans le commerce', 'accounting': 'En comptabilité', 'management': 'En gestion', 'business': 'En affaires', 'taxation': 'En fiscalité', 'insurance': 'En assurance', 'diplomacy': 'En diplomatie', 'marketing': 'En marketing', 'journalism': 'Dans la presse', 'police': 'Dans la police',
}
TLABEL = {'hist': 'En histoire', 'terre': 'En sciences de la Terre', 'sci': 'En sciences', 'corps': 'En médecine', 'ani': 'Chez les animaux', 'nat': 'En botanique',
          'cui': 'En cuisine', 'sport': 'En sport', 'arts': 'Dans les arts', 'mus': 'En musique', 'myth': 'En religion', 'lang': 'En linguistique', 'voy': 'Dans les transports', 'soc': 'Dans la société'}
CTX = re.compile(r"^(Au|Aux|En|Dans|Chez|À|Sur|Côté|Sous)\b", re.I)
VAGUE = re.compile(r"^((En|Au|Aux|Dans) [^,]+, )?(jeu|sorte|espèce|genre|type|variété|race|plante|oiseau|poisson|arbre|vin|fromage|danse|monnaie|langue|insecte|fleur|arbuste|instrument|cépage|plat|gâteau|boisson)( d[e'’] ?[\wÀ-ÿ-]+)?$", re.I)
def nwords(d): return len(re.findall(r"[\wÀ-ÿ'’-]+", d))
def add_label(d, lab):
    key = norm(lab.split()[-1])[:5]
    if CTX.match(d) or key in norm(d): return d
    return f"{lab}, {d[0].lower() + d[1:] if not d[1:2].isupper() else d}"

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
    if re.search(r'[^\x00-\u024F\u2019\u2018\u0152\u0153 ]', d): return False
    if re.match(r"^(En parlant d[e'u][^,]*|Se dit d[e'u][^,]{0,12}|[A-Z][a-z]+, etc)$", d): return False
    if not (8 <= len(d) <= 100): return False
    if BAD_WORDS.search(d): return False
    if SKIP_DEF.match(d): return False
    if re.match(r"^(À|Au|Aux|En|Dans|Chez|Pour|Par|Avec|Sans|Sur)\b[^,]{0,28}$", d): return False      # fragment : « À la Réforme »
    if re.match(r"^(Que|Qu'|Et|Ou|Mais|Donc|Car|Ni|Dont)\b", d): return False
    if re.match(r"^(Comparatif|Superlatif|Contraire|Péjoratif|Mélioratif) d", d, re.I): return False
    if re.search(r"\b(lui-même|elle-même|eux-mêmes|elles-mêmes|ci-dessus|susmentionné)\b", d, re.I): return False
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
            raw = re.sub(r'^\s*(\([^()]*\)\s*)+', '', d)
            if raw[:1].islower(): continue                     # suite d'une définition coupée
            d = clean_def(d)
            if pos == 'verb' and re.match(r"^(Un|Une|Le|La|Les|L'|Des|Du|De|Sa|Son|Ses|Quelqu)\b", d): continue
            if z < 2.5 and re.match(r"^(Langue|Dialecte|Peuple|Ethnie)\b.*\b(parlée?|vivant|habitant|établi)", d): continue   # langues et peuples obscurs
            if ok_def(d, ans, lemma) and d not in good: good.append(d)
        if not good: continue
        good.sort(key=lambda x: x.lower().startswith('synonyme de'))   # « Synonyme de … » en dernier recours
        if len(ans) == 3 and (z < 3 or re.match(r'(organisme|sigle|acronyme|abréviation)', good[0], re.I)): continue
        # Thème : il faut que la définition affichée relève du thème (domaine + mot-clé, ou ouverture sans ambiguïté)
        themes = set(); tdef = {}
        cands = {D2T[d] for d in doms if d in D2T}
        for t in cands:
            # domaine du mot + un mot-clé du thème dans la définition
            m = [d for d in good if KW[t].search(d)]
            # mot à sens unique (une seule définition retenue) : le domaine suffit
            if not m and len(good) == 1 and len(cands) == 1 and len(defs) == 1: m = good[:]   # le domaine concerne bien ce sens
            if m: themes.add(t); tdef[t] = m
        if not themes:
            # sans domaine : au moins deux mots-clés différents du même thème dans la définition
            for t, rx in KW.items():
                m = [d for d in good if len({x.group(0).lower().rstrip('s') for x in rx.finditer(d)}) >= 2 and rx.search(d[:45])]
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
            t = next(iter(themes))
            good = tdef[t][:3]
            spec = [x for x in doms if D2T.get(x) == t and x in LABEL]
            # contexte devant la définition : le domaine précis s'il est unique, sinon le thème pour les définitions elliptiques
            lab = LABEL[spec[0]] if len(set(LABEL[x] for x in spec)) == 1 else TLABEL[t]
            generic = lab in TLABEL.values() or lab in ('En cuisine', 'Côté boissons', 'En sport', 'En religion')
            good = [add_label(d, lab) if not KW[t].search(d) or (nwords(d) <= 4 and not generic) else d for d in good]
        # définition trop maigre (1 ou 2 mots) : on l'associe à un autre sens court, sinon elle passe en dernier
        weak = [d for d in good if nwords(d) <= 2 or VAGUE.match(d)]
        if weak:
            strong = [d for d in good if d not in weak]
            if not strong and len(weak) >= 2 and len(weak[0]) + len(weak[1]) < 60 and norm(weak[0]) not in norm(weak[1]) and norm(weak[1]) not in norm(weak[0]): strong = [weak[0] + ' ; ' + weak[1][0].lower() + weak[1][1:]]
            if not strong and (z < 3.5 or nwords(weak[0]) == 1 and z < 4.5): continue      # « Schottisch », « Escroquerie » : trop pauvre
            good = strong + [d for d in weak if strong and d not in strong[0]]
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
