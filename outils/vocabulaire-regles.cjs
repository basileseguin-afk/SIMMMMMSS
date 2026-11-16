'use strict';
/* ==========================================================================
 *  LES RÈGLES DU VOCABULAIRE DE LA VERSION 1 (évolution 19 a)
 *  Un seul mot par chose, dans tout ce qui s'affiche :
 *    — « équipe », jamais « case » ni « atelier » (une case d'un tableau est
 *      une « cellule », une case à cocher une « option ») ;
 *    — « chemin », jamais « flux » pour le chemin d'une commande ;
 *    — « temps par vol », jamais « barème », « heures de travail » ni « temps
 *      de travail » pour cette notion ;
 *    — « mise à disposition », jamais « boutique » ni « sert tout le monde ».
 *  outils/vocabulaire.cjs les applique au texte des chaînes des modules communs
 *  avec la version 2 (`communs`), pour écrire leur copie dans mots/ : d'abord
 *  les règles du fichier (`parFichier` : un extrait exact, remplacé tel quel),
 *  puis les règles générales (`generales` : des expressions régulières, qui ne
 *  touchent ni un identifiant, ni un nom de classe, ni un attribut).
 * ==========================================================================*/

// Un mot du texte, pas un morceau de code : ni lettre, ni tiret, ni point, ni guillemet droit collés à lui.
const AVANT = '(?<![\\wÀ-ÿ\\-_.#=/"\'\\[])', APRES = '(?![\\wÀ-ÿ\\-_=("\'\\]])';
const mot = (source, drapeaux = 'g') => new RegExp(AVANT + source + APRES, drapeaux);
// Un groupe de mots (un déterminant, puis le mot) : un guillemet droit peut le précéder — le début d'un `title="…"`.
const groupe = (source, drapeaux = 'g') => new RegExp('(?<![\\wÀ-ÿ\\-_])' + source + APRES, drapeaux);

const generales = [
  // ---- « flux » → « chemin » (le chemin que suivent les commandes) ----
  [groupe('(les|des|ces|aux|leurs|ses|vos|tous les|plusieurs|quels|deux|trois|en) flux'), '$1 chemins'],
  [groupe('(Les|Des|Ces|Aux|Leurs|Ses|Vos|Tous les|Plusieurs|Quels|Deux|Trois) flux'), '$1 chemins'],
  [groupe('Flux qui passent'), 'Chemins qui passent'],
  [groupe('flux différents'), 'chemins différents'],
  [groupe('(Aucun|aucun|Un|un|Le|le|Ce|ce|Du|du|Son|son|Nouveau|nouveau) flux'), '$1 chemin'],
  [mot('flux (créés|importés|exportés|partagés)'), 'chemins $1'],
  [mot('Flux (créés|importés|exportés|partagés)'), 'Chemins $1'],
  [mot('flux'), 'chemin'],
  [mot('Flux'), 'Chemin'],
  // ---- « atelier » → « équipe » ----
  [mot('(un|Un) seul atelier'), '$1e seule équipe'],
  [mot('(un|Un) nouvel atelier'), '$1e nouvelle équipe'],
  [mot('(un|Un) atelier'), '$1e équipe'],
  [mot('(aucun|Aucun) atelier'), '$1e équipe'],
  [mot('(cet|Cet) atelier'), '$1te équipe'],
  [mot('(son|Son) atelier'), '$1 équipe'],
  [mot('(l’|L’|d’|D’)ateliers?'), (x, a) => a + (x.endsWith('s') ? 'équipes' : 'équipe')],
  [mot('(le|du|au) même atelier'), (x, a) => ({ le: 'la', du: 'de la', au: 'à la' }[a]) + ' même équipe'],
  [mot('ateliers'), 'équipes'],
  [mot('Ateliers'), 'Équipes'],
  [mot('atelier'), 'équipe'],
  [mot('Atelier'), 'Équipe'],
  // ---- « barème » → « temps par vol » ----
  [groupe('(Heures|heures) de travail par vol'), (x, a) => (a === 'Heures' ? 'Temps' : 'temps') + ' par vol'],
  [mot('(le|Le) barème'), (x, a) => (a === 'Le' ? 'Les' : 'les') + ' temps par vol'],
  [mot('du barème'), 'des temps par vol'],
  [mot('au barème'), 'aux temps par vol'],
  [mot('(un|aucun) barème'), (x, a) => (a === 'un' ? 'des' : 'aucun') + ' temps par vol'],
  [mot('barème'), 'temps par vol'],
  [mot('Barème'), 'Temps par vol'],
  // ---- « heures de travail », « temps de travail » → « temps par vol » ----
  [groupe('(Heures|heures) de travail pour un vol'), (x, a) => (a === 'Heures' ? 'Temps' : 'temps') + ' par vol'],
  [groupe('(les|Les|ses|Ses|leurs|des|Toutes les|toutes les) heures de travail'), (x, a) => ({ 'Toutes les': 'Tous les', 'toutes les': 'tous les' }[a] || a) + ' temps par vol'],
  [groupe('heures de travail'), 'temps par vol'],
  [groupe('Heures de travail'), 'Temps par vol'],
  [groupe('temps de travail'), 'temps par vol'],
  [groupe('Temps de travail'), 'Temps par vol'],
  // ---- « boutique », « sert tout le monde » → « mise à disposition » ----
  [mot('boutiques'), 'mises à disposition'],
  [mot('boutique'), 'mise à disposition'],
  [mot('Boutique'), 'Mise à disposition'],
  [groupe('servent tout le monde'), 'sont des mises à disposition'],
  [groupe('sert tout le monde'), 'mise à disposition'],
  // ---- « case » → « équipe » (la case d'un tableau, devenue « cellule », et la case à cocher, devenue « option »,
  //      sont réglées avant, fichier par fichier) ----
  [groupe('(la|La) case'), (x, a) => (a === 'La' ? 'L’' : 'l’') + 'équipe'],
  [groupe('(sa|Sa) case'), (x, a) => (a === 'Sa' ? 'Son' : 'son') + ' équipe'],
  [groupe('de case'), 'd’équipe'],
  [mot('cases'), 'équipes'],
  [mot('Cases'), 'Équipes'],
  [mot('case'), 'équipe'],
  [mot('Case'), 'Équipe']
];

/* Les règles propres à un module : [extrait exact du texte d'une chaîne, son remplacement]. Elles passent avant les règles
 * générales ; chacune doit servir. « =Mot » : une chaîne qui est ce mot, en entier (un en-tête, un nom de feuille). */
const parFichier = {
  'unite.js': [
    ['Il sert tout le monde : légumerie, magasin, réception…', 'Une mise à disposition : légumerie, magasin, réception…'],
    ['(case « Effectif constant »)', '(option « Effectif constant »)'],
    ['une case vide prend la valeur de « Toutes les compagnies »', 'une cellule vide prend la valeur de « Toutes les compagnies »'],
    ['Ses équipes : une case par compagnie', 'Ses équipes : une par compagnie'],
    ['une case vide (+) l’y fait passer', 'une cellule vide (+) l’y fait passer'],
    ['ex. Atelier APM', 'ex. Découpe'],
    ['Chemins › Flux de production', 'Chemins › Chemins de production'],
    ['Ouvrir les flux de production', 'Ouvrir les chemins de production']
  ],
  'parcours.js': [
    ['une <b>case</b> : l’équipe qui y fait ce travail', 'une <b>équipe</b> : celle qui y fait ce travail'],
    ['(celles du barème, modifiables pour cette case)', '(modifiables pour cette équipe)'],
    ['et dans chaque case le nom de la case qui la prépare', 'et dans chaque cellule le nom de l’équipe qui la prépare'],
    ['Cliquez une case pour ouvrir le chemin', 'Cliquez une cellule pour ouvrir le chemin'],
    ['Une case hachurée : la commande', 'Une cellule hachurée : la commande'],
    ['une seule case par poste, qui sert toutes les commandes à la fois, comme une boutique', 'une mise à disposition : une seule équipe par poste, pour toutes les commandes à la fois'],
    ['aria-label="Case de ', 'aria-label="Équipe de '],
    [' : sa case">', ' : son équipe">'],
    ['aria-label="Fermer la case"', 'aria-label="Fermer"']
  ],
  'reglages.js': [
    ['Changer une case donne à cette compagnie × classe sa valeur propre', 'Changer une cellule donne à cette compagnie × classe sa valeur propre'],
    ['Une valeur fixée dans une case d’équipe prime', 'Une valeur fixée dans la fiche d’une équipe prime'],
    ['elle se change dans la case.</p>', 'elle se change dans sa fiche.</p>'],
    ['fixée dans une case</span>', 'fixée dans une équipe</span>'],
    ['Une case vide prend la valeur « autres compagnies »', 'Une cellule vide prend la valeur « autres compagnies »'],
    ['). Elle se change dans la case.', '). Elle se change dans sa fiche.'],
    ['dans les cases d’une équipe', 'dans la fiche d’une équipe'],
    ['Changer une case la rend propre', 'Changer une cellule la rend propre'],
    ['effectifs de case', 'effectifs d’équipe'],
    ['effectif de case', 'effectif d’équipe'],
    ['c’est le barème, modifiable ici', 'modifiable ici'],
    ['Enregistrement impossible : exportez le barème.', 'Enregistrement impossible : exportez les temps par vol.'],
    ['Barème de démonstration rétabli, à la place de vos valeurs.', 'Temps par vol de démonstration rétablis, à la place de vos valeurs.'],
    ['Barème converti en temps par vol.', 'Valeurs converties en temps par vol.'],
    ['importez des vols et le barème', 'importez des vols et les temps par vol'],
    ['Barème exporté : remplissez', 'Temps par vol exportés : remplissez'],
    ['Fichier de barème attendu', 'Fichier de temps par vol attendu'],
    ['Barème importé :', 'Temps par vol importés :'],
    [', à la place du barème en place.', ', à la place des temps par vol en place.'],
    ['Le barème en place est conservé.', 'Les temps par vol en place sont conservés.'],
    ['Heures de travail exportées', 'Temps par vol exportés'],
    ['Heures de travail lues', 'Temps par vol lus'],
    ['Heures de travail importées', 'Temps par vol importés'],
    ['Les heures de travail en place sont conservées.', 'Les temps par vol en place sont conservés.'],
    ['Toutes les heures de travail, d’un coup d’œil', 'Tous les temps par vol, d’un coup d’œil'],
    ['Robot : des plateaux à un débit, pas des heures de travail', 'Robot : des plateaux à un débit, pas des temps par vol']
  ],
  'temps.js': [
    ['« Les cases › + Case hors chemin »', '« Équipes une par une › + Équipe hors chemin »'],
    ['Ce qu’un atelier a fini et que le suivant ne prend que plus tard', 'Ce qu’une équipe a fini et que la suivante ne prend que plus tard']
  ],
  'plan-editor.js': [
    ['doit indiquer l’atelier dont elle dépend.', 'doit indiquer le service dont elle dépend.'],
    ['Les ateliers du moteur ne peuvent pas', 'Les services du calcul ne peuvent pas'],
    ['dépend d’un atelier inconnu', 'dépend d’un service inconnu'],
    ['rattachée à un atelier.', 'rattachée à un service.'],
    ['Atelier dont elle dépend', 'Service dont elle dépend'],
    ['Atelier de rattachement enregistré.', 'Service de rattachement enregistré.'],
    ['une seconde salle d’atelier', 'une seconde salle d’un service'],
    ['dans l’onglet « Ateliers »', 'dans « Équipes »'],
    ['Elle apparaît dans les chemins, les cases et Équipes', 'Elle apparaît dans les chemins et dans Équipes'],
    ['ni dans les chemins ni dans les cases', 'ni dans les chemins ni dans Équipes']
  ],
  'flow-center.js': [
    ['Créez des ateliers de travail', 'Créez des équipes'],
    ['le graphe ne porte donc aucun parcours', 'le graphe ne porte donc aucun chemin']
  ],
  // « Comparer deux essais » : le total des heures travaillées dans la journée n'est pas un temps par vol.
  'comparaison.js': [
    ['=Heures de travail', 'Heures travaillées']
  ],
  'simulation.js': [
    ['=heures de travail', 'heures travaillées'],
    // Une commande que personne ne prépare : un avis « bloquant » (évolution 19 d).
    ['un problème à compléter', 'un problème bloquant']
  ],
  // Les classeurs : leurs feuilles, leurs en-têtes et leurs « Lisez-moi » disent les nouveaux mots. Les classeurs d'avant
  // se relisent : classeurs-anciens.js ramène leurs anciens noms de feuilles et leurs anciens en-têtes à ceux-ci.
  'echanges.js': [
    ['=Case', 'Équipe'],
    ['=Atelier', 'Équipe'],
    ['=Cases', 'Récap des équipes'],
    ['=Ateliers', 'Équipes'],
    ['=Heures de travail', 'Heures pour la journée'],
    ['Feuille « Cases » introuvable : exportez le fichier depuis le récap des cases.', 'Feuille « Récap des équipes » introuvable : exportez le fichier depuis le récap des équipes.'],
    ['Barème — heures de travail par vol', 'Temps par vol'],
    ['et les heures de travail que coûte UN VOL', 'et le temps que coûte UN VOL'],
    ['Temps de travail d’une classe dans la journée = heures par vol × nombre de ses vols.', 'Travail d’une commande dans la journée = temps par vol × nombre de ses vols.'],
    ['Durée d’un lot = heures de travail ÷ personnes ÷ rendement.', 'Durée d’un lot = travail ÷ personnes ÷ rendement.'],
    ['L’import REMPLACE le barème entier.', 'L’import REMPLACE tous les temps par vol.'],
    ['Chaque case : les heures de travail d’UN vol', 'Chaque cellule : le temps d’UN vol'],
    ['Une case égale à la valeur', 'Une cellule égale à la valeur'],
    ['Une case vidée revient à la valeur « Toutes compagnies ». Une case vide d’un service', 'Une cellule vidée revient à la valeur « Toutes compagnies ». Une cellule vide d’un service'],
    ['l’effectif de chaque case (équipe) qui prépare', 'l’effectif de chaque équipe qui prépare'],
    ['Les heures fixées dans une case d’équipe ne sont pas ici : elles se règlent dans la case (ou dans le classeur des cases).', 'Les heures fixées dans une équipe ne sont pas ici : elles se règlent dans sa fiche (ou dans le classeur des équipes).'],
    ['un handling servent tout le monde.', 'un handling n’en ont pas.'],
    ['(ouverte chaque jour, comme une boutique)', '(ouverte chaque jour à ces heures)'],
    ['Une ligne par atelier (une case).', 'Une ligne par équipe.'],
    ['atelier inconnu « ', 'équipe inconnue « '],
    ['Ateliers de travail — à modifier', 'Équipes — à modifier'],
    ['les heures de travail qu’un atelier fixe pour une compagnie × classe', 'les heures qu’une équipe fixe pour une compagnie × classe'],
    ['à la place du barème. Absente = le barème.', 'à la place de ses temps par vol. Absente = ses temps par vol.'],
    ['Ouverte comme une boutique : Permanent = oui', 'Ouverte de … à … : Permanent = oui'],
    ['PROTOTYPE — barème non calibré', 'PROTOTYPE — temps par vol non calibrés']
  ]
};

/* Les modules communs dont la version 1 charge la copie (mots/). « Liens entre services » (flow-center.js) garde « flux » :
 * c'est ce qui circule entre les services ; seules ses règles propres s'y appliquent. */
/* Les règles « brutes » : [extrait exact de la source, son remplacement], présent une seule fois dans le module. Pour une
 * chaîne d'un seul mot (« flux », « Case ») qui s'affiche à cet endroit et sert d'identifiant ailleurs. */
const brutes = {
  'unite.js': [
    ["f.elements.nom.value.trim() || 'Flux'", "f.elements.nom.value.trim() || 'Chemin'"],
    ["pl(principaux.length, 'flux', 'flux')", "pl(principaux.length, 'chemin', 'chemins')"],
    ["pl(nbPropres, 'flux', 'flux')", "pl(nbPropres, 'chemin', 'chemins')"],
    ["pl(nb('flux'), 'flux', 'flux')", "pl(nb('flux'), 'chemin', 'chemins')"],
    ['dans le sens du flux">Réorganiser', 'dans le sens du chemin">Réorganiser']
  ],
  'parcours.js': [
    ["texte(nom, 76) || 'Flux')", "texte(nom, 76) || 'Chemin')"],
    ["groupe('flux', 'Flux')", "groupe('flux', 'Chemins de production')"],
    ['dans le sens du flux">Réorganiser', 'dans le sens du chemin">Réorganiser']
  ],
  // Les alertes des liens (« Contrôles détaillés ») : ce qui n'est pas « à corriger » est une « information », repliée sous le reste (évolution 19 d).
  'flow-center.js': [
    ['`<div class="fc-alerte"><ul>${notes.map(', '`<details class="fc-alerte avis-information"><summary><b>Information</b> — rien à faire</summary><ul>${notes.map('],
    ["</li>`).join('')}</ul></div>`:'')", "</li>`).join('')}</ul></details>`:'')"]
  ],
  'reglages.js': [
    ["'Robot' : 'Case'}", "'Robot' : 'Équipe'}"],
    ['aria-label="Exemple : 1 heure de travail pour un vol,', 'aria-label="Exemple : 1 heure par vol,'],
    // L'exemple en tête de la page : « 1 h par vol ÷ 2 personnes = 30 min de préparation » (évolution 19 b, retouche de la partie a).
    ['<b>1 h</b><small>de travail pour un vol</small>', '<b>1 h</b><small>par vol, pour une personne</small>']
  ]
};

// Le registre des problèmes (problemes.js) n'en est plus : la version 1 a le sien, avis.js, en trois niveaux (évolution 19 d).
const communs = ['unite.js', 'parcours.js', 'reglages.js', 'echanges.js', 'flow-center.js', 'plan-editor.js', 'temps.js', 'comparaison.js', 'simulation.js'];
const sansGenerales = ['flow-center.js'];

module.exports = { communs, sansGenerales, brutes, parFichier, generales, mot, groupe };
