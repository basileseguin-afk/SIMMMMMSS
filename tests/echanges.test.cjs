/* Les trois classeurs Excel : ateliers, barème, vols. Chacun doit faire
 * l'aller-retour sans rien perdre, et refuser en bloc ce qui est faux. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tableur.js');
const E = require('../echanges.js');
const P = require('../moteur/production.js');
const PC = require('../parcours.js');
const { VOLS } = require('../vols-demo.js');

const SERVICES = [
  { id: 'appros', nom: 'RÉCEPTION / APPROS' }, { id: 'decontam', nom: 'LÉGUMERIE' },
  { id: 'cuisine', nom: 'CUISINE' }, { id: 'preparation', nom: 'PRÉPA' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' },
  { id: 'dotation', nom: 'DOTATION' }, { id: 'magasin', nom: 'MAGASIN' }
];
const PROGRAMME = P.classesDeVols(VOLS, { delaiChargement: 45 });
/* Un aller-retour par un vrai fichier : écrire, relire. */
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));

/* ---- barème ---------------------------------------------------------- */

const ETAT_BAREME = { bareme: { cuisine: { '*/BC': 35, '*/YC': 50, 'AF/BC': 42 }, prepa: { '*/YC': 71 } },
  rendement: 0.9, regime: { seuils: [{ apres: 180, duree: 15 }], presence: 480 } };
const ctxBareme = () => ({ services: SERVICES, classes: PROGRAMME,
  routes: P.routesDesClasses(PROGRAMME, PC.parcoursTypes()) });

test('barème : l’aller-retour par Excel ne perd rien', async () => {
  const f = await parFichier(E.baremeVersClasseur(ETAT_BAREME, ctxBareme()));
  const lu = E.classeurVersBareme(f, { services: SERVICES });
  assert.deepEqual(lu.bareme, ETAT_BAREME.bareme);
  assert.equal(lu.rendement, 0.9);
  assert.deepEqual(lu.regime, { presence: 480, seuils: [{ apres: 180, duree: 15 }] });
});

test('barème : une ligne par compagnie × classe, pour chaque service de son parcours', async () => {
  const f = E.baremeVersClasseur(ETAT_BAREME, ctxBareme());
  const lignes = f[0].lignes.slice(1);
  const cuisine = lignes.filter(l => l[0] === 'CUISINE' && l[1] !== '*');
  assert.ok(cuisine.some(l => l[1] === 'AF' && l[2] === 'BC'), 'AF/BC passe par la cuisine');
  assert.ok(!cuisine.some(l => l[2] === 'YC'), 'aucune YC en cuisine : son parcours l’évite');
  const afbc = cuisine.find(l => l[1] === 'AF' && l[2] === 'BC');
  assert.equal(afbc[3], 42, 'la valeur propre est là');
  const dlbc = cuisine.find(l => l[1] === 'DL' && l[2] === 'BC');
  assert.equal(dlbc[3], null, 'vide : pas de valeur propre');
  assert.equal(dlbc[5], 35, 'et la colonne info dit ce qui s’applique');
});

test('barème : on remplit une case dans Excel, elle devient une valeur propre', async () => {
  let f = E.baremeVersClasseur(ETAT_BAREME, ctxBareme());
  f = modifier(f, 'Barème', l => l.map(x => (x[0] === 'CUISINE' && x[1] === 'DL' && x[2] === 'BC' ? [x[0], x[1], x[2], '12,5', x[4], x[5]] : x)));
  const lu = E.classeurVersBareme(await parFichier(f), { services: SERVICES });
  assert.equal(lu.bareme.cuisine['DL/BC'], 12.5, 'la virgule décimale est acceptée');
});

test('barème : les erreurs sont toutes dites, et rien n’est importé', () => {
  const f = [{ nom: 'Barème', lignes: [['Service', 'Compagnie', 'Classe', 'Minutes par vol'],
    ['CUISINE', '*', 'BC', 10], ['GARAGE', '*', 'BC', 4], ['CUISINE', '*', 'XX', 3], ['cuisine', 'toutes', 'BC', 9], ['MONTAGE', '*', 'YC', 'beaucoup']] }];
  assert.throws(() => E.classeurVersBareme(f, { services: SERVICES }), e => {
    assert.match(e.message, /ligne 3 : service inconnu « GARAGE »/);
    assert.match(e.message, /ligne 4 : classe inconnue/);
    assert.match(e.message, /ligne 5 : déjà renseigné ligne 2/, '« cuisine » et « toutes » désignent la même case');
    assert.match(e.message, /ligne 6 : nombre attendu/);
    assert.match(e.message, /Rien n’a été importé/);
    return true;
  });
});

/* ---- vols ------------------------------------------------------------ */

test('vols : départs et retours font l’aller-retour, sur deux feuilles', async () => {
  const f = await parFichier(E.volsVersClasseur(VOLS));
  assert.deepEqual(f.map(x => x.nom).slice(0, 2), ['Départs', 'Retours']);
  const lus = E.classeurVersVols(f);
  assert.equal(lus.length, VOLS.length);
  const af = lus.find(v => v.id === 'AF1080');
  assert.equal(af.std, VOLS.find(v => v.id === 'AF1080').std);
  assert.equal(af.crew, 5);
  const ret = lus.find(v => v.id === 'EK77');
  assert.equal(ret.sens, 'RET'); assert.equal(ret.sta, 16 * 60 + 30); assert.equal(ret.std, null);
});

test('vols : une heure saisie dans Excel (fraction de jour) est comprise', () => {
  const f = [{ nom: 'Départs', lignes: [['vol_id', 'compagnie', 'heure_std', 'nb_BC', 'nb_PC', 'nb_YC'], ['X1', 'AF', 0.5, 2, 0, 100]] }];
  const [v] = E.classeurVersVols(f);
  assert.equal(v.std, 12 * 60);
  assert.equal(v.yc, 100);
});

test('vols : une feuille unique avec une colonne sens (le format CSV) marche aussi', () => {
  const f = [{ nom: 'vols.csv', lignes: T.lireCsv('vol_id;compagnie;type_avion;sens;heure_std;heure_sta;nb_BC;nb_PC;nb_YC\nA;AF;A320;DEP;06:00;;1;0;10\nB;AF;A320;RET;;07:00;1;0;10') }];
  const v = E.classeurVersVols(f);
  assert.deepEqual(v.map(x => x.sens), ['DEP', 'RET']);
});

test('vols : une erreur désigne la feuille et la ligne', () => {
  const f = [{ nom: 'Départs', lignes: [['vol_id', 'compagnie', 'heure_std', 'nb_BC', 'nb_PC', 'nb_YC'], ['X1', 'AF', '25:00', 0, 0, 10]] }];
  assert.throws(() => E.classeurVersVols(f), /Départs, ligne 2/);
});

/* ---- ateliers -------------------------------------------------------- */

const ETAT_ATELIERS = () => ({
  schema: 'ory-ateliers', version: 1,
  ateliers: [
    { id: 'a1', nom: 'Cuisine matin', service: 'cuisine', type: 'manuel', debut: '04:30', jour: 0, personnes: 6, minutes: { 'DL/PC': 75 },
      pauses: [{ de: '09:00', a: '09:15' }], lots: [['AF/BC'], ['DL/BC', 'DL/PC']], regime: { actif: true } },
    { id: 'a2', nom: 'Robot', service: 'prepa', type: 'robot', debut: '05:00', jour: 0, personnes: 2, debit: 400,
      personnesMin: 2, pauses: [], lots: [['AF/YC']], regime: { actif: false } },
    { id: 'a3', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: -1, personnes: 3, plafond: 500,
      pauses: [], lots: [], regime: { actif: true, presence: 420 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 2, actif: true }, { nom: 'T2', debit: 200, personnes: 1, actif: false }] },
    { id: 'a4', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '06:00', jour: 0, personnes: 0, pauses: [], lots: [],
      regime: { actif: true }, permanent: false }
  ],
  exclues: ['TX/SPML'], ajoutees: [{ cie: 'ZZ', cabine: 'BC' }],
  materiel: { actif: true, unites: P.unitesDe({ unites: { YC: { parVol: 12 } } }), stockInitial: 400, delaiRetour: 20 },
  ...PC.parcoursTypes(), parcoursClasse: { 'AF/YC': 'complet' }
});
const ctxAteliers = () => ({ services: SERVICES, programme: PROGRAMME,
  classes: PROGRAMME.map(c => ({ ...c, origine: 'programme' })).concat([{ id: 'ZZ/BC', cie: 'ZZ', cabine: 'BC', vols: [], pax: 0, origine: 'ajoutee' }]) });

test('ateliers : l’aller-retour par Excel ne perd rien', async () => {
  const etat = ETAT_ATELIERS();
  const f = await parFichier(E.ateliersVersClasseur(etat, ctxAteliers()));
  const { etat: lu, ajouteesAuto } = E.classeurVersAteliers(f, etat, ctxAteliers());
  assert.deepEqual(ajouteesAuto, []);
  for (const a of etat.ateliers) {
    const b = lu.ateliers.find(x => x.nom === a.nom);
    assert.ok(b, a.nom);
    for (const k of ['id', 'service', 'type', 'debut', 'jour', 'lots', 'pauses', 'debit', 'personnesMin', 'plafond', 'tunnels', 'permanent', 'minutes'])
      assert.deepEqual(b[k], a[k], a.nom + ' · ' + k);
    assert.equal(b.regime.actif, a.regime.actif);
    assert.equal(b.regime.presence, a.regime.presence);
  }
  assert.deepEqual(lu.exclues, ['TX/SPML']);
  assert.deepEqual(lu.ajoutees, [{ cie: 'ZZ', cabine: 'BC' }]);
  // Un chemin lu dans le classeur est pris tel quel, cases comprises : il porte la marque `cases`.
  assert.ok(lu.parcours.every(p => p.cases === true));
  assert.deepEqual(lu.parcours.map(({ cases, ...p }) => p), etat.parcours);
  assert.deepEqual(lu.parcoursCabine, etat.parcoursCabine);
  assert.deepEqual(lu.parcoursClasse, { 'AF/YC': 'complet' });
  assert.equal(lu.materiel.stockInitial, 400);
  assert.equal(lu.materiel.unites.YC.parVol, 12);
});

test('ateliers : ajouter une compagnie × classe à un atelier, c’est ajouter une ligne', async () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  f = modifier(f, 'Fabrications', l => l.concat([['Cuisine matin', 1.5, 'QR/BC'], ['cuisine matin', 9, 'NEW/SPML']]));
  const { etat: lu, ajouteesAuto } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  assert.deepEqual(lu.ateliers[0].lots, [['AF/BC'], ['QR/BC'], ['DL/BC', 'DL/PC'], ['NEW/SPML']], 'rangé à son ordre');
  assert.deepEqual(ajouteesAuto, ['NEW/SPML'], 'une classe hors programme est déclarée, et dite');
});

test('ateliers : un lien de parcours s’écrit en une ligne, « De » livre « Vers »', async () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  assert.deepEqual(f.find(x => x.nom === 'Parcours').lignes[0], ['Parcours', 'De', 'Vers']);
  f = modifier(f, 'Parcours', l => l.concat([['Magasin direct', 'Magasin', 'montage'], ['Magasin direct', 'dotation', null]]));
  f = modifier(f, 'Parcours par classe', l => l.map(x => (x[0] === 'SPML' ? ['SPML', 'magasin direct'] : x)));
  const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  const p = lu.parcours.find(x => x.nom === 'Magasin direct');
  assert.deepEqual(p.liens, [{ de: 'magasin', vers: 'prepa' }], 'nom ou identifiant, casse indifférente');
  assert.deepEqual(p.noeuds, ['magasin', 'prepa', 'dotation'], 'un nœud sans lien se garde');
  assert.equal(lu.parcoursCabine.SPML, p.id);
});

test('ateliers : l’ancienne écriture en branches est encore lue', async () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  f = modifier(f, 'Parcours', () => [['Parcours', 'Branche', 'Étapes'], ['Ancien', 'Agro', 'appros > cuisine > montage'], ['Ancien', 'Magasin', 'magasin > montage']]);
  f = modifier(f, 'Parcours par classe', l => l.map((x, i) => (i ? [x[0], 'Ancien'] : x)));
  f = modifier(f, 'Classes', l => l.map((x, i) => (i ? [x[0], x[1], null, ...x.slice(3)] : x)));
  const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  const p = lu.parcours.find(x => x.nom === 'Ancien');
  assert.deepEqual(p.liens, [{ de: 'appros', vers: 'cuisine' }, { de: 'cuisine', vers: 'prepa' }, { de: 'magasin', vers: 'prepa' }]);
});

test('ateliers : une feuille absente laisse sa partie telle quelle', async () => {
  const etat = ETAT_ATELIERS();
  const f = E.ateliersVersClasseur(etat, ctxAteliers()).filter(x => ['Ateliers'].includes(x.nom));
  const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  assert.deepEqual(lu.ateliers[0].lots, etat.ateliers[0].lots, 'sans « Fabrications », les lots restent');
  assert.deepEqual(lu.ateliers[2].tunnels, etat.ateliers[2].tunnels, 'sans « Tunnels », les tunnels restent');
  assert.deepEqual(lu.parcours, etat.parcours);
  assert.deepEqual(lu.exclues, etat.exclues);
});

test('ateliers : les erreurs de toutes les feuilles sont dites ensemble', () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  f = modifier(f, 'Ateliers', l => l.concat([['Cuisine matin', 'CUISINE', 'manuel', '05:00'], ['X', 'GARAGE', 'manuel', '05:00'], ['Y', 'CUISINE', 'fusée', '05:00']]));
  f = modifier(f, 'Fabrications', l => l.concat([['Fantôme', 1, 'AF/BC'], ['Robot', 2, 'AF-YC']]));
  f = modifier(f, 'Parcours', l => l.concat([['Faux', 'cuisine', 'garage']]));
  assert.throws(() => E.classeurVersAteliers(f, etat, ctxAteliers()), e => {
    for (const re of [/existe déjà/, /service inconnu « GARAGE »/, /type inconnu « fusée »/, /atelier inconnu « Fantôme »/,
      /illisible « AF-YC »/, /Parcours, ligne \d+ : service inconnu « garage »/, /Rien n’a été importé/]) assert.match(e.message, re);
    return true;
  });
});

test('ateliers : une classe retirée mais encore fabriquée est refusée', () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  f = modifier(f, 'Classes', l => l.map(x => (x[0] === 'AF' && x[1] === 'BC' ? [x[0], x[1], x[2], 'oui'] : x)));
  assert.throws(() => E.classeurVersAteliers(f, etat, ctxAteliers()), /AF\/BC est retirée .* Cuisine matin la fabrique encore/);
});

test('barème : un service qui ne lit pas le barème n’encombre pas le classeur', () => {
  const ctx = { ...ctxBareme(), sansBareme: new Set(['plonge', 'magasin']) };
  const lignes = E.baremeVersClasseur({ ...ETAT_BAREME, bareme: { ...ETAT_BAREME.bareme, magasin: { '*/BC': 2 } } }, ctx)[0].lignes;
  assert.ok(!lignes.some(l => l[0] === 'PLONGE'), 'la plonge travaille au débit de ses tunnels');
  assert.ok(lignes.some(l => l[0] === 'MAGASIN'), 'mais une valeur déjà saisie reste, pour ne rien perdre');
});

/* ---- horaires --------------------------------------------------------- */

test('horaires : le petit classeur porte une ligne par case, dans l’ordre de la journée', () => {
  const f = E.horairesVersClasseur(ETAT_ATELIERS(), { services: SERVICES });
  assert.deepEqual(f.map(x => x.nom), ['Horaires', 'Lisez-moi']);
  const [entete, ...lignes] = f[0].lignes;
  assert.deepEqual(entete.slice(0, 3), ['Atelier', 'Jour', 'Début']);
  assert.deepEqual(lignes.map(l => [l[0], l[1], l[2]]),
    [['Plonge', 'J-1', '05:00'], ['Cuisine matin', 'J', '04:30'], ['Robot', 'J', '05:00'], ['Magasin', 'J', '06:00']],
    'la plonge de la veille d’abord ; « J-1 » écrit en clair');
  assert.equal(E.estClasseurHoraires(f), true);
  assert.equal(E.estClasseurHoraires(E.ateliersVersClasseur(ETAT_ATELIERS(), ctxAteliers())), false, 'le classeur complet n’est pas « horaires seuls »');
});

test('horaires : réimporter ne change que les heures, et dit lesquelles', async () => {
  const etat = ETAT_ATELIERS();
  let f = E.horairesVersClasseur(etat, { services: SERVICES });
  f = modifier(f, 'Horaires', l => l.map(x => (x[0] === 'Cuisine matin' ? ['cuisine MATIN', 'J-1', 22 / 24 + 15 / 1440, ...x.slice(3)]
    : x[0] === 'Robot' ? [x[0], 'j', '5h30'] : x)).filter(x => x[0] !== 'Magasin'));
  const { etat: lu, changes } = E.classeurVersHoraires(await parFichier(f), etat);
  assert.deepEqual(changes, ['Cuisine matin', 'Robot']);
  const par = n => lu.ateliers.find(a => a.nom === n);
  assert.deepEqual([par('Cuisine matin').debut, par('Cuisine matin').jour], ['22:15', -1], 'une heure saisie dans Excel (fraction de jour) est comprise');
  assert.deepEqual([par('Robot').debut, par('Robot').jour], ['05:30', 0]);
  assert.equal(par('Magasin').debut, '06:00', 'une ligne retirée laisse sa case à son heure');
  const sansHeures = e => JSON.stringify(e.ateliers.map(({ debut, jour, ...a }) => a)) + JSON.stringify({ ...e, ateliers: null });
  assert.equal(sansHeures(lu), sansHeures(etat), 'rien d’autre ne bouge');
  assert.equal(etat.ateliers[0].debut, '04:30', 'l’état du site n’est pas touché avant validation');
});

test('horaires : les erreurs sont dites ensemble, et rien n’est importé', () => {
  const etat = ETAT_ATELIERS();
  let f = E.horairesVersClasseur(etat, { services: SERVICES });
  f = modifier(f, 'Horaires', l => l.concat([['Fantôme', 'J', '05:00'], ['Robot', 'J', '06:00']])
    .map(x => (x[0] === 'Cuisine matin' ? [x[0], 'J', '25:00'] : x[0] === 'Magasin' ? [x[0], 'J', null] : x[0] === 'Plonge' ? [x[0], 'J+1', '05:00'] : x)));
  assert.throws(() => E.classeurVersHoraires(f, etat), e => {
    for (const re of [/atelier inconnu « Fantôme »/, /« Robot » a déjà son horaire/, /jour illisible « J\+1 »/,
      /25:00 dépasse 23:59/, /Magasin : heure de début manquante/, /Rien n’a été importé/]) assert.match(e.message, re);
    return true;
  });
});

test('horaires : dans le classeur complet, la feuille « Horaires » règle les heures', async () => {
  const etat = ETAT_ATELIERS();
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  assert.ok(!f.find(x => x.nom === 'Ateliers').lignes[0].includes('Début'), 'les heures ne sont écrites qu’à un endroit');
  f = modifier(f, 'Horaires', l => l.map(x => (x[0] === 'Robot' ? [x[0], 'J-2', '23:00'] : x)));
  let lu = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers()).etat;
  assert.deepEqual([lu.ateliers[1].debut, lu.ateliers[1].jour], ['23:00', -2]);
  // Sans la feuille, chaque case garde son heure du site ; une nouvelle commence à 06:00, jour J.
  f = f.filter(x => x.nom !== 'Horaires');
  f = modifier(f, 'Ateliers', l => l.concat([['Nouvelle', 'cuisine', 'manuel', 2]]));
  lu = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers()).etat;
  assert.deepEqual(lu.ateliers.map(a => a.debut + ' ' + a.jour), ['04:30 0', '05:00 0', '05:00 -1', '06:00 0', '06:00 0']);
});

test('horaires : un ancien classeur, heures dans « Ateliers », est encore lu', async () => {
  const etat = ETAT_ATELIERS();
  const ancien = [{ nom: 'Ateliers', lignes: [['Atelier', 'Service', 'Type', 'Début', 'Jour', 'Personnes'],
    ['Cuisine matin', 'cuisine', 'manuel', '03:45', -1, 6]] }];
  const lu = E.classeurVersAteliers(await parFichier(ancien), etat, ctxAteliers()).etat;
  assert.deepEqual([lu.ateliers[0].debut, lu.ateliers[0].jour], ['03:45', -1]);
});

test('ateliers : une mise à disposition avec travail fixe fait l’aller-retour par Excel', async () => {
  const etat = ETAT_ATELIERS();
  etat.ateliers.push({ id: 'a5', nom: 'Légumerie', service: 'decontam', type: 'dispo', debut: '04:00', jour: -1, personnes: 2,
    travail: 420, pauses: [], lots: [], regime: { actif: true }, permanent: false });
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  const at = f.find(x => x.nom === 'Ateliers').lignes, col = at[0].indexOf('Travail fixe (man-min)');
  assert.ok(col > 0);
  assert.equal(at.find(l => l[0] === 'Légumerie')[col], 420);
  assert.equal(at.find(l => l[0] === 'Légumerie')[at[0].indexOf('Personnes')], 2, 'ses personnes sont écrites');
  assert.equal(at.find(l => l[0] === 'Magasin')[col], null, 'une simple ouverture n’en a pas');
  let lu = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers()).etat;
  const lg = lu.ateliers.find(a => a.nom === 'Légumerie');
  assert.deepEqual([lg.travail, lg.personnes, lg.debut, lg.jour, lg.permanent], [420, 2, '04:00', -1, false]);
  assert.equal(lu.ateliers.find(a => a.nom === 'Magasin').travail, undefined);
  // Un travail fixe sans personne est refusé.
  f = modifier(f, 'Ateliers', l => l.map(x => (x[0] === 'Légumerie' ? x.map((v, i) => (i === l[0].indexOf('Personnes') ? 0 : v)) : x)));
  assert.throws(() => E.classeurVersAteliers(f, etat, ctxAteliers()), /Légumerie : un travail fixe demande au moins une personne/);
});
