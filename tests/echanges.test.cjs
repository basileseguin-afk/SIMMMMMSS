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

test('ateliers : un handling fait l’aller-retour par Excel, durées par compagnie comprises', async () => {
  const etat = ETAT_ATELIERS();
  SERVICES.push({ id: 'handling', nom: 'CF DÉPART FOOD' });
  try {
    etat.ateliers.push({ id: 'h1', nom: 'Handling', service: 'handling', type: 'handling', debut: '04:00', jour: 0, personnes: 6, pauses: [], lots: [],
      regime: { actif: true }, durees: { '*': 30, AF: 45 }, simultanes: 3, avance: 150, compagnies: ['AF', 'TX'] });
    let f = E.ateliersVersClasseur(etat, ctxAteliers());
    const fH = f.find(x => x.nom === 'Handling');
    assert.deepEqual(fH.lignes.slice(1), [['Handling', 'toutes', null, 30, null, null, null], ['Handling', 'AF', null, 45, null, 'court', null]]);
    // Dans Excel, on change la durée d'AF et on en donne une à TX.
    f = modifier(f, 'Handling', l => l.map(r => (r[1] === 'AF' ? [r[0], r[1], null, 50] : r)).concat([['Handling', 'TX', null, 20]]));
    const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
    const h = lu.ateliers.find(a => a.nom === 'Handling');
    assert.equal(h.type, 'handling');
    assert.deepEqual(h.durees, { '*': 30, AF: 50, TX: 20 });
    assert.equal(h.simultanes, 3);
    assert.equal(h.avance, 150);
    assert.deepEqual(h.compagnies, ['AF', 'TX']);
    assert.deepEqual(h.lots, []);
    // Le handling travaille le jour J : un J-1 dans « Horaires » est refusé, et dit.
    const veille = modifier(E.ateliersVersClasseur(etat, ctxAteliers()), 'Horaires', l => l.map(r => (r[0] === 'Handling' ? [r[0], 'J-1', ...r.slice(2)] : r)));
    assert.throws(() => E.classeurVersAteliers(veille, etat, ctxAteliers()), /Handling : le handling travaille le jour J des vols, pas J-1/);
    // Sans la feuille Handling, les durées du site restent.
    const sans = E.ateliersVersClasseur(etat, ctxAteliers()).filter(x => x.nom !== 'Handling');
    assert.deepEqual(E.classeurVersAteliers(await parFichier(sans), etat, ctxAteliers()).etat.ateliers.find(a => a.nom === 'Handling').durees, { '*': 30, AF: 45 });
  } finally { SERVICES.pop(); }
});

test('ateliers : les vagues d’une mise à disposition font l’aller-retour par Excel', async () => {
  const etat = ETAT_ATELIERS();
  const m = etat.ateliers.find(a => a.nom === 'Magasin');
  m.vagues = [{ debut: '14:00', jour: -1 }, { debut: '04:00', jour: 0 }]; m.debut = '14:00'; m.jour = -1;
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  const fa = f.find(x => x.nom === 'Ateliers'), col = fa.lignes[0].indexOf('Vagues');
  assert.equal(fa.lignes.find(l => l[0] === 'Magasin')[col], 'J-1 14:00; J 04:00');
  f = modifier(f, 'Ateliers', l => l.map(r => (r[0] === 'Magasin' ? r.map((v, i) => (i === col ? 'J-1 13:30; J 05:00; J 11:00' : v)) : r)));
  const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  assert.deepEqual(lu.ateliers.find(a => a.nom === 'Magasin').vagues, [{ debut: '13:30', jour: -1 }, { debut: '05:00', jour: 0 }, { debut: '11:00', jour: 0 }]);
  const faux = modifier(E.ateliersVersClasseur(etat, ctxAteliers()), 'Ateliers', l => l.map(r => (r[0] === 'Magasin' ? r.map((v, i) => (i === col ? 'demain matin' : v)) : r)));
  assert.throws(() => E.classeurVersAteliers(faux, etat, ctxAteliers()), /vague illisible « demain matin »/);
});

test('ateliers : les débits d’un robot, commande par commande, font l’aller-retour par Excel', async () => {
  const etat = ETAT_ATELIERS();
  const r = etat.ateliers.find(a => a.nom === 'Robot');
  r.debits = { 'AF/YC': 450 };
  let f = E.ateliersVersClasseur(etat, ctxAteliers());
  assert.deepEqual(f.find(x => x.nom === 'Débits robot').lignes.slice(1), [['Robot', 'AF/YC', 450]]);
  f = modifier(f, 'Débits robot', l => l.map(x => (x[1] === 'AF/YC' ? ['Robot', 'AF/YC', 500] : x)));
  const { etat: lu } = E.classeurVersAteliers(await parFichier(f), etat, ctxAteliers());
  assert.deepEqual(lu.ateliers.find(a => a.nom === 'Robot').debits, { 'AF/YC': 500 });
  // Sans la feuille, ceux du site restent.
  const sans = E.ateliersVersClasseur(etat, ctxAteliers()).filter(x => x.nom !== 'Débits robot');
  assert.deepEqual(E.classeurVersAteliers(await parFichier(sans), etat, ctxAteliers()).etat.ateliers.find(a => a.nom === 'Robot').debits, { 'AF/YC': 450 });
});

/* ---- récap des cases ------------------------------------------------- */

test('récap des cases : le fichier de paramétrage fait l’aller-retour, ordre et « ensemble » compris', async () => {
  const etat = ETAT_ATELIERS();
  const ctx = { services: SERVICES, classes: ctxAteliers().classes };
  let f = E.recapCasesVersClasseur(etat, ctx);
  const g = f.find(x => x.nom === 'Cases').lignes;
  const ligne = nom => g.find(l => l[0] === nom);
  assert.deepEqual(ligne('Cuisine matin').slice(3, 8), ['J', '04:30', 6, 'AF/BC → DL/BC + DL/PC', null]);
  assert.deepEqual(ligne('Magasin').slice(3, 8), [null, null, null, null, 'J 06:00'], 'une mise à disposition : ses vagues');
  const sans = E.classeurVersRecapCases(await parFichier(f), etat, ctx);
  assert.deepEqual(sans.changes, [], 'rien ne change');
  // Dans Excel : la cuisine part à 04:00 la veille, à 7, et prépare DL BC d'abord, puis AF BC et DL PC ensemble.
  const l = ligne('Cuisine matin'); l[3] = 'J-1'; l[4] = '04:00'; l[5] = 7; l[6] = 'DL/BC → AF/BC + DL/PC';
  ligne('Magasin')[7] = 'J-1 14:00; J 04:00';
  const r = E.classeurVersRecapCases(await parFichier(f), etat, ctx);
  assert.deepEqual(r.changes.sort(), ['Cuisine matin', 'Magasin']);
  const cu = r.etat.ateliers.find(a => a.nom === 'Cuisine matin');
  assert.deepEqual([cu.jour, cu.debut, cu.personnes, cu.lots], [-1, '04:00', 7, [['DL/BC'], ['AF/BC', 'DL/PC']]]);
  const ma = r.etat.ateliers.find(a => a.nom === 'Magasin');
  assert.deepEqual([ma.permanent, ma.vagues], [false, [{ debut: '14:00', jour: -1 }, { debut: '04:00', jour: 0 }]]);
});

test('récap des cases : une commande ajoutée quitte les autres cases du service ; les erreurs sont toutes dites', async () => {
  const etat = ETAT_ATELIERS();
  etat.ateliers.push({ id: 'a5', nom: 'Cuisine soir', service: 'cuisine', type: 'manuel', debut: '14:00', jour: -1, personnes: 3, pauses: [], lots: [['TX/BC']], regime: { actif: true } });
  const ctx = { services: SERVICES, classes: ctxAteliers().classes };
  const f = E.recapCasesVersClasseur(etat, ctx);
  const g = f.find(x => x.nom === 'Cases').lignes;
  g.find(l => l[0] === 'Cuisine soir')[6] = 'TX/BC → AF/BC';
  const r = E.classeurVersRecapCases(await parFichier(f), etat, ctx);
  assert.deepEqual(r.etat.ateliers.find(a => a.nom === 'Cuisine matin').lots, [['DL/BC', 'DL/PC']], 'AF BC a quitté la cuisine du matin');
  // Erreurs.
  g.find(l => l[0] === 'Cuisine soir')[4] = '25:99';
  g.find(l => l[0] === 'Cuisine matin')[6] = 'AF/XX';
  g.push(['Case fantôme', null, null, 'J', '05:00', 1, null, null, null]);
  g.find(l => l[0] === 'Plonge')[3] = 'J';
  assert.throws(() => E.classeurVersRecapCases(f, etat, ctx), e => /25:99/.test(e.message)
    && /commande illisible « AF\/XX »/.test(e.message) && /case inconnue « Case fantôme »/.test(e.message) && /Rien n’a été importé/.test(e.message));
});

/* Une mise à disposition ouverte comme une boutique : « ouvert 07:00-18:00 »,
 * dans le fichier des cases comme dans le classeur complet. */
test('boutique : ses heures d’ouverture font l’aller-retour par Excel', async () => {
  const boutique = { id: 'lg', nom: 'Légumerie', service: 'decontam', type: 'dispo', debut: '07:00', jour: 0, personnes: 0, pauses: [], lots: [],
    regime: { actif: true }, permanent: true, ouverture: { de: '07:00', a: '18:00' } };
  const etat = { ...ETAT_ATELIERS() };
  etat.ateliers = etat.ateliers.filter(a => a.service !== 'decontam').concat([boutique]);
  // Le classeur complet : Permanent = oui, Vagues = « ouvert 07:00-18:00 ».
  const { etat: lu } = E.classeurVersAteliers(await parFichier(E.ateliersVersClasseur(etat, ctxAteliers())), etat, ctxAteliers());
  assert.deepEqual(lu.ateliers.find(a => a.nom === 'Légumerie').ouverture, { de: '07:00', a: '18:00' });
  // Le fichier des cases : la colonne Vagues le dit, et se modifie.
  const ctx = { services: SERVICES, classes: ctxAteliers().classes };
  const f = await parFichier(E.recapCasesVersClasseur(etat, ctx));
  const ligne = f.find(x => x.nom === 'Cases').lignes.find(l => l[0] === 'Légumerie');
  assert.equal(ligne[7], 'ouvert 07:00-18:00');
  const r = E.classeurVersRecapCases(modifier(f, 'Cases', l => l.map(x => (x[0] === 'Légumerie' ? Object.assign(x, { 7: 'ouverte de 6h30 à 17:00' }) : x))), etat, ctx);
  assert.deepEqual(r.changes, ['Légumerie']);
  assert.deepEqual(r.etat.ateliers.find(a => a.id === 'lg').ouverture, { de: '06:30', a: '17:00' });
  const r2 = E.classeurVersRecapCases(modifier(f, 'Cases', l => l.map(x => (x[0] === 'Légumerie' ? Object.assign(x, { 7: 'permanente' }) : x))), etat, ctx);
  assert.equal(r2.etat.ateliers.find(a => a.id === 'lg').ouverture, undefined, '« permanente » : toujours ouverte');
});

/* Les chauffeurs du handling et la plonge par vol font l'aller-retour par Excel. */
test('handling par chauffeurs et plonge par vol : l’aller-retour par Excel ne perd rien', async () => {
  const etat = ETAT_ATELIERS();
  etat.ateliers.push(
    { id: 'hx', nom: 'Handling', service: 'prepa', type: 'handling', debut: '04:00', jour: 0, personnes: 0, pauses: [], lots: [], regime: { actif: true },
      durees: { '*': 30, AF: 50 }, simultanes: 1, avance: 180, compagnies: [], longs: ['AF', 'DL'], chauffeurs: { long: 2, court: 1 },
      creneaux: [{ de: '03:00', a: '11:00', n: 6 }, { de: '11:00', a: '20:00', n: 3 }] },
    { id: 'px', nom: 'Plonge vol', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true },
      plafond: 0, parVol: true, durees: { '*': 30, DL: 45 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] });
  const f = await parFichier(E.ateliersVersClasseur(etat, ctxAteliers()));
  assert.deepEqual(f.find(x => x.nom === 'Chauffeurs').lignes.slice(1), [['Handling', '03:00', '11:00', 6], ['Handling', '11:00', '20:00', 3]]);
  const { etat: lu } = E.classeurVersAteliers(f, etat, ctxAteliers());
  const h = lu.ateliers.find(a => a.nom === 'Handling'), p = lu.ateliers.find(a => a.nom === 'Plonge vol');
  assert.deepEqual([h.longs.sort(), h.chauffeurs, h.creneaux, h.durees], [['AF', 'DL'], { long: 2, court: 1 },
    [{ de: '03:00', a: '11:00', n: 6 }, { de: '11:00', a: '20:00', n: 3 }], { '*': 30, AF: 50 }]);
  assert.deepEqual([p.parVol, p.durees], [true, { '*': 30, DL: 45 }]);
  // Modifié dans Excel : DL passe court, 3 chauffeurs par long courrier, un créneau de moins, DL lavé en 60 min.
  const g = modifier(modifier(modifier(modifier(f, 'Handling', l => l.map(x => (x[1] === 'DL' ? [x[0], x[1], x[2], x[3], x[4], 'court'] : x))),
    'Ateliers', l => { const i = l[0].indexOf('Chauffeurs long courrier'); return l.map(x => (x[0] === 'Handling' ? Object.assign(x, { [i]: 3 }) : x)); }),
    'Chauffeurs', l => l.slice(0, 2)), 'Plonge par vol', l => l.map(x => (x[1] === 'DL' ? [x[0], x[1], 60] : x)));
  const { etat: lu2 } = E.classeurVersAteliers(g, etat, ctxAteliers());
  const h2 = lu2.ateliers.find(a => a.nom === 'Handling');
  assert.deepEqual([h2.longs, h2.chauffeurs.long, h2.creneaux.length], [['AF'], 3, 1]);
  assert.equal(lu2.ateliers.find(a => a.nom === 'Plonge vol').durees.DL, 60);
});

test('handling : le trajet du camion (aller, charger, retour) et les vols par camion font l’aller-retour par Excel', async () => {
  const etat = ETAT_ATELIERS();
  etat.ateliers.push({ id: 'hx', nom: 'Handling', service: 'prepa', type: 'handling', debut: '04:00', jour: 0, personnes: 0, pauses: [], lots: [],
    regime: { actif: true }, durees: { '*': 30, AF: 50 }, allers: { '*': 10, AF: 15 }, retours: { '*': 12 }, simultanes: 1, avance: 180, compagnies: [],
    longs: ['AF'], chauffeurs: { long: 2, court: 1 }, creneaux: [{ de: '03:00', a: '11:00', n: 6 }], volsParCamion: 2, camions: 4 });
  const f = await parFichier(E.ateliersVersClasseur(etat, ctxAteliers()));
  const complet = l => [...l, ...Array(Math.max(0, 7 - l.length)).fill(null)];   // une cellule vide en fin de ligne ne s'écrit pas
  assert.deepEqual(f.find(x => x.nom === 'Handling').lignes.slice(1).map(complet), [['Handling', 'toutes', 10, 30, 12, null, null], ['Handling', 'AF', 15, 50, null, 'long', null]]);
  const { etat: lu } = E.classeurVersAteliers(f, etat, ctxAteliers());
  const h = lu.ateliers.find(a => a.nom === 'Handling');
  assert.deepEqual([h.allers, h.retours, h.durees, h.volsParCamion, h.camions], [{ '*': 10, AF: 15 }, { '*': 12 }, { '*': 30, AF: 50 }, 2, 4]);
  // Dans Excel : TX a son trajet, AF perd son aller propre.
  const g = modifier(f, 'Handling', l => l.map(x => (x[1] === 'AF' ? [x[0], x[1], null, 50, null, 'long'] : x)).concat([['Handling', 'TX', 20, 25, 20, 'court', 2]]));
  const h2 = E.classeurVersAteliers(await parFichier(g), etat, ctxAteliers()).etat.ateliers.find(a => a.nom === 'Handling');
  assert.deepEqual([h2.allers, h2.retours, h2.durees.TX, h2.volsCamion], [{ '*': 10, TX: 20 }, { '*': 12, TX: 20 }, 25, { TX: 2 }]);
});

test('plonge : la vitesse d’un tunnel fait l’aller-retour par Excel', async () => {
  const etat = ETAT_ATELIERS();
  etat.ateliers.push({ id: 'pv', nom: 'Plonge rapide', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [],
    regime: { actif: true }, plafond: 0, parVol: true, durees: { '*': 30 },
    tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }, { nom: 'T2', debit: 300, personnes: 1, actif: true, vitesse: 2 }] });
  const f = await parFichier(E.ateliersVersClasseur(etat, ctxAteliers()));
  const t = E.classeurVersAteliers(f, etat, ctxAteliers()).etat.ateliers.find(a => a.nom === 'Plonge rapide').tunnels;
  assert.deepEqual(t.map(x => x.vitesse ?? 1), [1, 2]);
});

/* ---- planche retour --------------------------------------------------- */

test('planche retour : l’aller-retour par Excel ne perd rien, classes facultatives comprises', async () => {
  const planche = [{ vol: 'AF1234', cie: 'AF', heure: '09:40', jour: 0, bc: 12, yc: 150 },
    { vol: 'TO3000', cie: 'TO', heure: '22:15', jour: -1 }];
  const f = await parFichier(E.plancheVersClasseur(planche));
  assert.deepEqual(f.map(x => x.nom), ['Planche retour', 'Lisez-moi']);
  assert.deepEqual(E.classeurVersPlanche(f), planche);
  // Vide, le classeur est un modèle à remplir : il se relit sans ligne.
  assert.deepEqual(E.classeurVersPlanche(await parFichier(E.plancheVersClasseur([]))), []);
});

test('planche retour : une heure Excel et une colonne « Arrivée » sont comprises ; les erreurs sont dites ensemble', () => {
  const f = [{ nom: 'Retours', lignes: [['Vol', 'Cie', 'Arrivée', 'Jour', 'YC'], ['AF1', 'af', 10 / 24 + 5 / 1440, 'J-1', 0]] }];
  assert.deepEqual(E.classeurVersPlanche(f), [{ vol: 'AF1', cie: 'AF', heure: '10:05', jour: -1 }], 'une classe à 0 est tue');
  const mauvais = [{ nom: 'Planche retour', lignes: [['Vol', 'Compagnie', 'Arrivée à l’unité', 'Jour'],
    ['AF1', 'AF', '', 'J'], [null, null, '08:00', 'J'], ['AF2', 'AF', '08:00', 'demain']] }];
  assert.throws(() => E.classeurVersPlanche(mauvais), e => /manquante/.test(e.message) && /ni vol ni compagnie/.test(e.message) && /illisible/.test(e.message));
});

test('matériel : la source des retours à la plonge fait l’aller-retour par Excel, sans toucher à la planche', async () => {
  const etat = { ...ETAT_ATELIERS(), materiel: { actif: true, retours: 'j1', planche: [{ vol: 'AF1', cie: 'AF', heure: '09:00', jour: 0 }] } };
  const f = await parFichier(E.ateliersVersClasseur(etat, ctxAteliers()));
  assert.deepEqual(T.feuille(f, 'Matériel').lignes.find(l => l[0] === 'Retours à la plonge'), ['Retours à la plonge', 'J+1']);
  const lu = E.classeurVersAteliers(f, etat, ctxAteliers()).etat.materiel;
  assert.equal(lu.retours, 'j1');
  assert.deepEqual(lu.planche, etat.materiel.planche, 'la planche vit dans son propre fichier');
  for (const [ecrit, src] of [['J+2', 'j1'], ['lendemain', 'j1'], ['planche', 'planche'], ['Programme', 'programme'], ['', 'programme']]) {
    const g = modifier(f, 'Matériel', l => l.map(x => (x[0] === 'Retours à la plonge' ? [x[0], ecrit] : x)));
    assert.equal(E.classeurVersAteliers(g, etat, ctxAteliers()).etat.materiel.retours, src, ecrit);
  }
  const g = modifier(f, 'Matériel', l => l.map(x => (x[0] === 'Retours à la plonge' ? [x[0], 'demain'] : x)));
  assert.throws(() => E.classeurVersAteliers(g, etat, ctxAteliers()), /programme », « J\+1 » ou « planche/);
});
