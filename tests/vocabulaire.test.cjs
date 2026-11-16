/* Évolution 19 (a) — un seul mot par chose. Les modules communs avec la
 * version 2 (gelée) ne changent pas : la version 1 charge, à leur place, une
 * copie rangée dans mots/, où seuls les mots affichés changent
 * (outils/vocabulaire.cjs, outils/vocabulaire-regles.cjs). Ce test garde :
 *   — l'outil : il découpe une source sans la changer, ne réécrit que le
 *     texte d'une chaîne, jamais un identifiant, un commentaire, une
 *     expression régulière, le nom d'une classe ou la valeur d'une donnée ;
 *   — les copies : à jour, sans règle inutile, au même code que le module
 *     commun, sans mot banni, chargées par la page et par Node ;
 *   — les classeurs : ils écrivent les nouveaux mots ; un classeur d'avant et
 *     un classeur d'aujourd'hui se relisent pareil, modifiés ou non.
 * Aucune donnée de l'unité : des vols, des compagnies et des équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../outils/vocabulaire.cjs');
const REGLES = require('../outils/vocabulaire-regles.cjs');
const T = require('../tableur.js');
const lireBrut = T.lireClasseur;                       // la lecture d'avant, pour le module commun
const CA = require('../classeurs-anciens.js');
CA.envelopper(T);                                      // comme dans la page de la version 1
const E0 = require('../echanges.js'), E1 = require('../mots/echanges.js');
const P = require('../moteur/production.js'), PC = require('../parcours.js');
const { VOLS } = require('./vols-fixture.cjs');
const { empreintes } = require('./empreintes-resultats.cjs');

const RACINE = path.join(__dirname, '..');
const lireSource = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const chaines = source => V.decouper(source).filter(m => m.genre === 'chaine');
const IDENTIFIANT = /^[\w\-:.#$/=\[\]()>+~*|^,]*$/;
/** Les mots bannis de ce qui s'affiche (« flux » : sauf pour ce qui circule sur le plan, dans « Liens entre services »). */
const BANNIS = /(?<![\wÀ-ÿ\-_.#=/\["'])(cases?|ateliers?|barèmes?|boutiques?|flux)(?![\wÀ-ÿ\-_=(\]"'])|ser(?:t|vent) tout le monde|heures? de travail|temps de travail|disponibles? en permanence/gi;

/* ---- l'outil ---------------------------------------------------------- */

test('le découpage redonne la source, et sépare le code, les commentaires, les chaînes et les expressions régulières', () => {
  const source = "const a = 'un' + \"deux\"; // trois\n/* quatre */ const r = /ci'nq/g, t = `six ${a + `sept ${r}`} huit`;\n";
  const m = V.decouper(source);
  assert.equal(V.recoller(m), source);
  assert.deepEqual(m.filter(x => x.genre === 'chaine').map(x => x.texte), ['un', 'deux', 'six ', 'sept ', ' huit']);
  assert.deepEqual(m.filter(x => x.genre === 'commentaire').map(x => x.texte), ['// trois', '/* quatre */']);
  assert.deepEqual(m.filter(x => x.genre === 'regex').map(x => x.texte), ["/ci'nq/g"]);
  // Les morceaux d'un même gabarit portent son numéro : « six » et « huit » se suivent, par-dessus le `${…}`.
  const [six, sept, huit] = m.filter(x => x.gabarit);
  assert.equal(six.gabarit, huit.gabarit); assert.notEqual(six.gabarit, sept.gabarit);
  for (const f of REGLES.communs) assert.equal(V.recoller(V.decouper(lireSource(f))), lireSource(f), f);
  assert.equal(V.squelette("x = 'case'; // case\ny = `la ${z} case`;"), "x = ''; // case\ny = `${z}`;");
});

test('une règle ne touche que ce qui s’affiche : ni un identifiant, ni un commentaire, ni une expression régulière, ni une classe', () => {
  const source = [
    "const flux = 'flux'; // la case du barème",
    "el.title = 'Le flux de la case';",
    "if (/case/.test(x)) y = `Le barème ${a.case} de cet atelier, ${b['flux']} flux`;",
    "h = `<td class=\"rgr case g\" data-champ=\"case\" title=\"Fixée dans la case\">la case ${n}</td><i class=\"${k} case\" aria-label=\"Cet atelier\">`;",
    ''].join('\n');
  assert.equal(V.reecrire(source, 'x.js').source, [
    "const flux = 'flux'; // la case du barème",
    "el.title = 'Le chemin de l’équipe';",
    "if (/case/.test(x)) y = `Les temps par vol ${a.case} de cette équipe, ${b['flux']} chemin`;",
    "h = `<td class=\"rgr case g\" data-champ=\"case\" title=\"Fixée dans l’équipe\">l’équipe ${n}</td><i class=\"${k} case\" aria-label=\"Cette équipe\">`;",
    ''].join('\n'));
  // Une balise : son nom, ses attributs, la valeur d'une classe sont protégés ; le texte et une bulle sont libres.
  const etat = { lieu: 'texte' };
  assert.deepEqual(V.morceauxAffiches('la case <b class="case" title="une case">case</b>', etat), [
    { texte: 'la case ', libre: true }, { texte: '<b class="', libre: false }, { texte: 'case', libre: false },
    { texte: '" title="', libre: false }, { texte: 'une case', libre: true }, { texte: '">', libre: false },
    { texte: 'case', libre: true }, { texte: '</b>', libre: false }]);
  assert.equal(etat.lieu, 'texte');
  // L'état se poursuit : une classe coupée par un `${…}` reste une classe.
  const suite = { lieu: 'texte' };
  V.morceauxAffiches('<td class="rgr ', suite);
  assert.deepEqual(V.morceauxAffiches(' case">la case', suite), [{ texte: ' case', libre: false }, { texte: '">', libre: false }, { texte: 'la case', libre: true }]);
});

/* ---- les copies -------------------------------------------------------- */

test('chaque copie est à jour, aucune règle n’est inutile : node outils/vocabulaire.cjs n’a rien à faire', () => {
  assert.deepEqual(fs.readdirSync(path.join(RACINE, V.DOSSIER)).sort(), [...REGLES.communs].sort(), 'une copie par module commun, et rien d’autre');
  for (const f of REGLES.communs) {
    const c = V.copieDe(f);
    assert.deepEqual(c.inutiles, [], f + ' : des règles ne servent pas');
    assert.equal(fs.readFileSync(V.cheminDe(f), 'utf8'), c.texte, V.DOSSIER + '/' + f + ' a vieilli : node outils/vocabulaire.cjs');
  }
});

test('le code d’une copie est celui du module commun : seul le texte de ses chaînes change', () => {
  // Les chaînes d'un seul mot qui changent : des mots affichés (un titre de colonne, un pluriel), pas des clés.
  const UN_MOT = {
    'unite.js': ['Flux → Chemin', 'flux → chemin', 'flux → chemins'], 'parcours.js': ['Flux → Chemin', 'Flux → Chemins de production'],
    'reglages.js': ['Case → Équipe'], 'echanges.js': ['Atelier → Équipe', 'Ateliers → Équipes', 'Case → Équipe', 'Cases → Récap des équipes']
  };
  for (const f of REGLES.communs) {
    const commun = lireSource(f), copie = lireSource(V.DOSSIER + '/' + f);
    assert.ok(copie.startsWith(V.entete(f)), f + ' : l’en-tête dit d’où vient la copie');
    assert.equal(V.squelette(copie.slice(V.entete(f).length)), V.squelette(commun), f + ' : le code a changé');
    const a = chaines(commun), b = chaines(copie.slice(V.entete(f).length));
    assert.equal(a.length, b.length, f);
    const unMot = new Set();
    a.forEach((m, i) => {
      if (m.texte === b[i].texte) return;
      // Le chemin d'un module voisin : la copie est rangée un dossier plus bas.
      if (/^\.\/[\w./-]+\.js$/.test(m.texte)) { assert.equal(b[i].texte, '.' + m.texte, f); return; }
      if (IDENTIFIANT.test(m.texte)) unMot.add(m.texte + ' → ' + b[i].texte);
    });
    assert.deepEqual([...unMot].sort(), (UN_MOT[f] || []).slice().sort(), f + ' : les chaînes d’un seul mot qui changent');
  }
});

test('aucun mot banni ne reste dans le texte des copies ; « flux » reste pour ce qui circule, dans « Liens entre services »', () => {
  for (const f of REGLES.communs) {
    const etats = new Map(), restes = [];
    for (const m of chaines(lireSource(V.DOSSIER + '/' + f))) {
      const etat = (m.gabarit && etats.get(m.gabarit)) || { lieu: 'texte' };
      if (m.gabarit) etats.set(m.gabarit, etat);
      const parties = V.morceauxAffiches(m.texte, etat);
      if (IDENTIFIANT.test(m.texte)) continue;
      for (const p of parties) if (p.libre) for (const x of p.texte.matchAll(BANNIS)) restes.push(x[0].toLowerCase() + ' : ' + p.texte.slice(Math.max(0, x.index - 30), x.index + 40));
    }
    if (f === 'flow-center.js') { assert.ok(restes.length > 0 && restes.every(r => r.startsWith('flux')), 'flow-center.js : « flux » seulement — ' + restes.filter(r => !r.startsWith('flux')).join(' | ')); continue; }
    assert.deepEqual(restes, [], f);
  }
});

test('la page de la version 1 charge les copies ; Node les charge aussi, avec ce qu’expose le module commun', () => {
  const page = lireSource('index.html'), v2 = lireSource('v2/index.html');
  for (const f of REGLES.communs) {
    assert.match(page, new RegExp('<script src="' + V.DOSSIER + '/' + f.replace('.', '\\.') + '\\?v=[0-9a-f]+"'), f + ' : la page charge la copie');
    assert.doesNotMatch(page, new RegExp('<script src="' + f.replace('.', '\\.') + '[?"]'), f + ' : et non le module commun');
    assert.deepEqual(Object.keys(require('../' + V.DOSSIER + '/' + f)), Object.keys(require('../' + f)), f);
  }
  assert.match(page, /<script src="classeurs-anciens\.js\?v=[0-9a-f]+"/);
  assert.ok(page.indexOf('classeurs-anciens.js') > page.indexOf('<script src="tableur.js'), 'après tableur.js, qu’il enveloppe');
  assert.doesNotMatch(v2, /mots\/|classeurs-anciens/, 'la version 2 n’y touche pas');
  // Les modules de la version 1 que Node charge prennent la copie, comme la page.
  assert.match(lireSource('comparer-vue.js'), /require\('\.\/mots\/comparaison\.js'\)/);
  assert.match(lireSource('ateliers.js'), /require\('\.\/mots\/parcours\.js'\)/);
  assert.match(lireSource('outils/simuler-periode.cjs'), /require\('\.\.\/mots\/echanges\.js'\)/);
});

test('aucun mot banni dans le texte des modules propres à la version 1, ni dans un pluriel écrit à la main', () => {
  // Les modules de la page que la version 2 ne partage pas : tous les .js de la racine, moins les fichiers communs.
  const liste = /const COMMUNS = \[([^\]]*)\]/.exec(lireSource('tests/parite.test.cjs'));
  const communs = new Set([...liste[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  assert.ok(communs.has('unite.js') && communs.has('moteur/noyau.js'), 'la liste des fichiers communs (tests/parite.test.cjs)');
  const v1 = fs.readdirSync(RACINE).filter(f => f.endsWith('.js') && !communs.has(f)).sort();
  assert.ok(v1.length > 30 && v1.includes('ateliers.js') && v1.includes('sim.js') && !v1.includes('unite.js'), 'les modules de la version 1 (' + v1.length + ')');
  // Ce qui garde un ancien mot, et pourquoi.
  const PERMIS = {
    // Les anciens noms des pages, pour « Aller à… ».
    'onglets.js': ['Flux de production', 'Les cases · Ateliers de travail', 'Barème par service', 'Heures de travail'],
    // Les anciens noms des feuilles et des en-têtes, pour relire un classeur d'avant.
    'classeurs-anciens.js': ['Barème', 'Cases', 'Ateliers', 'Case', 'Atelier', 'Heures de travail'],
    // L'avis de l'export JSON de la journée : l'export ne change pas, champ par champ.
    'sim.js': ['PROTOTYPE — barème non calibré : résultats à lire comme un ordre de grandeur.']
  };
  for (const f of v1) {
    const restes = [];
    for (const m of chaines(lireSource(f))) if (!IDENTIFIANT.test(m.texte) && m.texte.match(BANNIS)) restes.push(m.texte);
    assert.deepEqual(restes.filter(t => !(PERMIS[f] || []).includes(t)), [], f);
  }
  // Un mot seul, donné à la main à un pluriel (« 2 cases ») : il s'affiche aussi.
  const PLURIEL = /\bpl\([^()]*(?:\([^()]*\)[^()]*)*,\s*'(cases?|ateliers?|flux|barèmes?|boutiques?)'/;
  for (const f of v1.concat(REGLES.communs.map(x => V.DOSSIER + '/' + x))) assert.doesNotMatch(lireSource(f), PLURIEL, f);
  // Les modules communs que la page charge tels quels, sans copie, ne portent aucun mot banni : sinon, il leur en faut une.
  // Le registre commun des problèmes n'est plus chargé par la version 1 : le sien est avis.js (évolution 19 d).
  const page = lireSource('index.html'), charge = f => page.includes('<script src="' + f + '?v=');
  assert.ok(charge('ds.js') && charge('avis.js') && !charge('problemes.js') && !charge(V.DOSSIER + '/problemes.js'), 'ce que la page charge');
  for (const f of [...communs].filter(x => x.endsWith('.js') && !REGLES.communs.includes(x) && charge(x))) {
    for (const m of chaines(lireSource(f))) if (!IDENTIFIANT.test(m.texte)) assert.doesNotMatch(m.texte, BANNIS, f);
    assert.doesNotMatch(lireSource(f), PLURIEL, f);
  }
});

/* ---- les classeurs ----------------------------------------------------- */

const SERVICES = [
  { id: 'appros', nom: 'RÉCEPTION / APPROS' }, { id: 'decontam', nom: 'LÉGUMERIE' },
  { id: 'cuisine', nom: 'CUISINE' }, { id: 'preparation', nom: 'PRÉPA' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' },
  { id: 'dotation', nom: 'DOTATION' }, { id: 'magasin', nom: 'MAGASIN' }
];
const PROGRAMME = P.classesDeVols(VOLS, { delaiChargement: 45 });
const ETAT = () => ({
  schema: 'ory-ateliers', version: 1,
  ateliers: [
    { id: 'a1', nom: 'Cuisine matin', service: 'cuisine', type: 'manuel', debut: '04:30', jour: 0, personnes: 6, minutes: { 'DL/PC': 75 },
      pauses: [{ de: '09:00', a: '09:15' }], lots: [['AF/BC'], ['DL/BC', 'DL/PC']], regime: { actif: true } },
    { id: 'a2', nom: 'Robot', service: 'prepa', type: 'robot', debut: '05:00', jour: 0, personnes: 2, debit: 400, debits: { 'AF/YC': 450 },
      personnesMin: 2, pauses: [], lots: [['AF/YC']], regime: { actif: false } },
    { id: 'a3', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: -1, personnes: 3, plafond: 500,
      pauses: [], lots: [], regime: { actif: true, presence: 420 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 2, actif: true }, { nom: 'T2', debit: 200, personnes: 1, actif: false }] },
    { id: 'a4', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '06:00', jour: 0, personnes: 0, pauses: [], lots: [],
      regime: { actif: true }, permanent: false },
    { id: 'lg', nom: 'Légumerie', service: 'decontam', type: 'dispo', debut: '07:00', jour: 0, personnes: 0, pauses: [], lots: [],
      regime: { actif: true }, permanent: true, ouverture: { de: '07:00', a: '18:00' } },
    { id: 'hx', nom: 'Handling', service: 'dotation', type: 'handling', debut: '04:00', jour: 0, personnes: 0, pauses: [], lots: [], regime: { actif: true },
      durees: { '*': 30, AF: 50 }, simultanes: 1, avance: 180, compagnies: [], longs: ['AF', 'DL'], chauffeurs: { long: 2, court: 1 },
      creneaux: [{ de: '03:00', a: '11:00', n: 6 }, { de: '11:00', a: '20:00', n: 3 }] },
    { id: 'px', nom: 'Plonge vol', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true },
      plafond: 0, parVol: true, durees: { '*': 30, DL: 45 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] }
  ],
  exclues: ['TX/SPML'], ajoutees: [{ cie: 'ZZ', cabine: 'BC' }],
  materiel: { actif: true, unites: P.unitesDe({ unites: { YC: { parVol: 12 } } }), stockInitial: 400, delaiRetour: 20 },
  ...PC.parcoursTypes(), parcoursClasse: { 'AF/YC': 'complet' }
});
const ctxAteliers = () => ({ services: SERVICES, programme: PROGRAMME,
  classes: PROGRAMME.map(c => ({ ...c, origine: 'programme' })).concat([{ id: 'ZZ/BC', cie: 'ZZ', cabine: 'BC', vols: [], pax: 0, origine: 'ajoutee' }]) });
const ctxCases = () => ({ services: SERVICES, classes: ctxAteliers().classes });
const BAREME = { bareme: { cuisine: { '*/BC': 35, '*/YC': 50, 'AF/BC': 42 }, prepa: { '*/YC': 71 } }, rendement: 0.9, regime: { seuils: [{ apres: 180, duree: 15 }], presence: 480 } };
const ctxBareme = () => ({ services: SERVICES, classes: PROGRAMME, routes: P.routesDesClasses(PROGRAMME, PC.parcoursTypes()) });
const route = s => ({ services: new Set(s) });
const ctxRecap = () => ({ bareme: { cuisine: { '*/BC': 30, 'TX/BC': 45 }, prepa: { '*/BC': 20, '*/YC': 10 } },
  services: [{ id: 'cuisine', nom: 'CUISINE' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' }],
  classes: [{ id: 'AF/BC', cie: 'AF', cabine: 'BC', vols: [{}, {}] }, { id: 'TX/BC', cie: 'TX', cabine: 'BC', vols: [{}] }, { id: 'AF/YC', cie: 'AF', cabine: 'YC', vols: [{}, {}, {}] }],
  routes: new Map([['AF/BC', route(['cuisine', 'prepa'])], ['TX/BC', route(['cuisine', 'prepa'])], ['AF/YC', route(['prepa'])]]), sansBareme: new Set(['plonge']),
  ateliers: [{ id: 'm', nom: 'Montage AF YC', service: 'prepa', type: 'manuel', lots: [['AF/YC']], minutes: { 'AF/YC': 12 } }] });
const PLANCHE = [{ vol: 'NO1234', cie: 'AF', heure: '09:40', jour: 0, bc: 12, yc: 150 }, { vol: 'NO3000', cie: 'TO', heure: '22:15', jour: -1 }];

/** Dans la feuille n° `i`, la ligne dont la première cellule est `cle` : sa colonne n° `c` prend `valeur`. */
const changer = (i, cle, c, valeur) => feuilles => feuilles.map((f, k) => (k !== i ? f : { ...f, lignes: f.lignes.map(l => (l[0] === cle ? Object.assign(l.slice(), { [c]: valeur }) : l)) }));
const colonne = (feuilles, i, ...noms) => { const c = feuilles[i].lignes[0].findIndex(x => noms.includes(x)); assert.ok(c >= 0, noms.join(' / ')); return c; };

/** Chaque classeur : ce qui l'écrit, ce qui le relit, et une modification faite dans Excel (la même, quels que soient les mots). */
const CLASSEURS = {
  'temps par vol': { ecrire: E => E.baremeVersClasseur(BAREME, ctxBareme()), lire: (E, f) => E.classeurVersBareme(f, { services: SERVICES }) },
  'récap des temps par vol': { ecrire: E => E.recapVersClasseur(ctxRecap()), lire: (E, f) => { const c = ctxRecap(); return E.classeurVersRecap(f, c.bareme, c); } },
  'récap des équipes': { ecrire: E => E.recapCasesVersClasseur(ETAT(), ctxCases()), lire: (E, f) => E.classeurVersRecapCases(f, ETAT(), ctxCases()),
    modifier: f => changer(0, 'Cuisine matin', colonne(f, 0, 'Personnes'), 9)(f), change: r => r.etat.ateliers.find(a => a.id === 'a1').personnes === 9 },
  'équipes': { ecrire: E => E.ateliersVersClasseur(ETAT(), ctxAteliers()), lire: (E, f) => E.classeurVersAteliers(f, ETAT(), ctxAteliers()),
    modifier: f => { const i = f.findIndex(x => x.nom === 'Heures propres'); return changer(i, 'Cuisine matin', colonne(f, i, 'Heures de travail', 'Heures pour la journée'), 2)(f); },
    change: r => r.etat.ateliers.find(a => a.id === 'a1').minutes['DL/PC'] === 120 },
  'horaires': { ecrire: E => E.horairesVersClasseur(ETAT(), { services: SERVICES }), lire: (E, f) => E.classeurVersHoraires(f, ETAT(), { services: SERVICES }),
    modifier: f => changer(0, 'Cuisine matin', colonne(f, 0, 'Début'), '05:15')(f), change: r => r.etat.ateliers.find(a => a.id === 'a1').debut === '05:15' },
  'planche retour': { ecrire: E => E.plancheVersClasseur(PLANCHE), lire: (E, f) => E.classeurVersPlanche(f) },
  'vols': { ecrire: E => E.volsVersClasseur(VOLS), lire: (E, f) => E.classeurVersVols(f) }
};
const texte = x => JSON.stringify(x, (k, v) => (v instanceof Set || v instanceof Map ? [...v] : v));
const parFichier = (lire, feuilles) => lire(T.ecrireClasseur(feuilles));

test('les classeurs écrivent les nouveaux mots : les feuilles, les en-têtes, le Lisez-moi ; les données ne changent pas', () => {
  const renommees = new Set(), enTetes = new Set();
  for (const [nom, c] of Object.entries(CLASSEURS)) {
    const avant = c.ecrire(E0), apres = c.ecrire(E1);
    assert.equal(apres.length, avant.length, nom);
    apres.forEach((f, i) => {
      const a = avant[i];
      if (f.nom !== a.nom) { renommees.add(a.nom + ' → ' + f.nom); assert.equal(CA.FEUILLES[a.nom], f.nom, nom + ' : ' + a.nom); }
      assert.doesNotMatch(f.nom, BANNIS, nom + ' : la feuille « ' + f.nom + ' »');
      for (const l of f.lignes) for (const x of l) if (typeof x === 'string' && (f.nom === 'Lisez-moi' || l === f.lignes[0])) assert.doesNotMatch(x, BANNIS, nom + ' · ' + f.nom + ' : ' + x);
      if (f.nom === 'Lisez-moi') return;
      // Les en-têtes : ceux d'avant, sauf les mots retenus ; les données : celles d'avant, cellule par cellule.
      (a.lignes[0] || []).forEach((x, k) => { if (x !== f.lignes[0][k]) { enTetes.add(x + ' → ' + f.lignes[0][k]); assert.equal(CA.EN_TETES[x], f.lignes[0][k], nom + ' · ' + f.nom + ' : ' + x); } });
      assert.deepEqual(f.lignes.slice(1), a.lignes.slice(1), nom + ' · ' + f.nom + ' : les données');
    });
  }
  assert.deepEqual([...renommees].sort(), ['Ateliers → Équipes', 'Barème → Temps par vol', 'Cases → Récap des équipes']);
  assert.deepEqual([...enTetes].sort(), ['Atelier → Équipe', 'Case → Équipe', 'Heures de travail → Heures pour la journée']);
});

test('un classeur d’aujourd’hui et un classeur d’avant se relisent pareil, tels quels puis modifiés dans Excel', async () => {
  for (const [nom, c] of Object.entries(CLASSEURS)) {
    const avant = c.ecrire(E0), apres = c.ecrire(E1);
    // La référence : le module commun relit son propre classeur, sans l'enveloppe de la version 1.
    const ref = texte(c.lire(E0, await parFichier(lireBrut, avant)));
    assert.equal(texte(c.lire(E1, await parFichier(T.lireClasseur, apres))), ref, nom + ' : le classeur d’aujourd’hui');
    assert.equal(texte(c.lire(E1, await parFichier(T.lireClasseur, avant))), ref, nom + ' : le classeur d’avant');
    if (!c.modifier) continue;
    const refModifie = c.lire(E0, await parFichier(lireBrut, c.modifier(avant)));
    assert.ok(c.change(refModifie), nom + ' : la modification est lue');
    const neuf = c.lire(E1, await parFichier(T.lireClasseur, c.modifier(apres)));
    assert.ok(c.change(neuf), nom + ' : lue aussi sous le nouvel en-tête');
    assert.equal(texte(neuf.etat), texte(refModifie.etat), nom + ' : le même état, modifié');
    assert.equal(texte(c.lire(E1, await parFichier(T.lireClasseur, c.modifier(avant))).etat), texte(refModifie.etat), nom + ' : et sous l’ancien');
  }
});

test('l’enveloppe de lecture : une feuille d’avant prend son nouveau nom, un nouvel en-tête se lit sous ses clés d’avant', () => {
  const f = [{ nom: 'Cases', lignes: [['Case', 'Jour'], ['Atelier', 'J']] }, { nom: 'Lisez-moi', lignes: [['Barème']] }];
  const lu = CA.versNouveauxMots(f);
  assert.deepEqual(lu.map(x => x.nom), ['Récap des équipes', 'Lisez-moi']);
  assert.deepEqual(lu[0].lignes, f[0].lignes, 'les lignes ne changent pas : une équipe nommée « Atelier » garde son nom');
  assert.equal(lu[1], f[1], 'une feuille qui ne change pas est rendue telle quelle');
  // Le nouveau nom déjà pris : la feuille d'avant garde le sien.
  const pris = [{ nom: 'Ateliers', lignes: [] }, { nom: 'Équipes', lignes: [] }];
  assert.deepEqual(CA.versNouveauxMots(pris).map(x => x.nom), ['Ateliers', 'Équipes']);
  assert.equal(CA.versNouveauxMots(null), null);
  // Les clés : « Équipe » se lit comme « Case » et comme « Atelier » ; une colonne d'avant, présente, garde la main.
  const o = CA.avecLesClesDAvant({ entetes: ['equipe', 'jour'], objets: [{ _ligne: 2, equipe: 'Cuisine matin', jour: 'J' }] });
  assert.deepEqual(o.entetes, ['equipe', 'jour', 'case', 'atelier']);
  assert.deepEqual(o.objets, [{ _ligne: 2, equipe: 'Cuisine matin', jour: 'J', case: 'Cuisine matin', atelier: 'Cuisine matin' }]);
  const mixte = { entetes: ['atelier', 'equipe'], objets: [{ atelier: 'A', equipe: 'B' }] };
  assert.deepEqual(CA.avecLesClesDAvant(mixte).objets, [{ atelier: 'A', equipe: 'B', case: 'B' }]);
  const sans = { entetes: ['case'], objets: [{ case: 'A' }] };
  assert.equal(CA.avecLesClesDAvant(sans), sans, 'rien à ajouter : le même objet');
  // Seule la colonne « Équipe » d'un classeur d'aujourd'hui : la colonne « equipe » d'un fichier CSV (un planning) reste telle quelle.
  const csv = { entetes: ['date', 'equipe'], objets: [{ date: '2026-11-02', equipe: 'Nuit' }] };
  assert.equal(CA.avecLesClesDAvant(csv, [['date', 'equipe'], ['2026-11-02', 'Nuit']]), csv);
  assert.deepEqual(CA.avecLesClesDAvant({ entetes: ['equipe'], objets: [{ equipe: 'Nuit' }] }, [[null], [' Équipe '], ['Nuit']]).objets, [{ equipe: 'Nuit', case: 'Nuit', atelier: 'Nuit' }]);
  // Enveloppé une seule fois.
  const faux = { lireClasseur: () => f, enObjets: () => ({ entetes: ['equipe'], objets: [{ equipe: 'A' }] }) };
  const feuilleNeuve = [['Équipe'], ['A']];
  CA.envelopper(faux); const une = faux.lireClasseur; CA.envelopper(faux);
  assert.equal(faux.lireClasseur, une);
  assert.deepEqual(faux.lireClasseur().map(x => x.nom), ['Récap des équipes', 'Lisez-moi']);
  assert.deepEqual(faux.enObjets(feuilleNeuve).objets, [{ equipe: 'A', case: 'A', atelier: 'A' }]);
  assert.deepEqual(faux.enObjets([['equipe'], ['A']]).objets, [{ equipe: 'A' }], 'un en-tête de CSV n’est pas celui d’un classeur');
});

test('les classeurs d’une journée et d’une période (les outils) n’écrivent plus aucun mot banni', async () => {
  const cellules = [];
  await empreintes(RACINE, lignes => { for (const l of lignes) for (const x of l) if (typeof x === 'string') cellules.push(x); return lignes; });
  assert.ok(cellules.length > 200, 'des feuilles lues (' + cellules.length + ' cellules de texte)');
  assert.deepEqual(cellules.filter(x => x.match(BANNIS)), []);
  assert.ok(cellules.some(x => /PROTOTYPE — temps par vol non calibrés/.test(x)), 'l’avis du Lisez-moi, avec les nouveaux mots');
});

/* ---- les messages du moteur --------------------------------------------- */

const MM = require('../mots-moteur.js');

test('les messages du moteur s’affichent avec les mots de la page ; le moteur et l’export de la journée ne changent pas', () => {
  const duMoteur = [
    'Liste d’ateliers attendue.', 'Atelier invalide.',
    'Montage nuit : « Magasin » est déjà une mise à disposition. Elle sert tout, tout de suite : ce que fabrique cet atelier ne serait attendu par personne.',
    'NORD Business est préparée deux fois dans « Montage ». Un service, une commande, une case.',
    // Le moteur met une espace insécable dans ses guillemets : elle reste.
    'Montage nuit : aucun barème pour «\u00a0Montage\u00a0», sa durée est nulle tant qu’il n’est pas renseigné.',
    '« Montage » n’a pas de minutes pour NORD Business, SUD Éco : elles y travaillent en temps nul. Renseignez le barème.'
  ];
  assert.deepEqual(duMoteur.map(MM.dire), [
    'Liste d’équipes attendue.', 'Équipe invalide.',
    'Montage nuit : « Magasin » est déjà une mise à disposition. Elle sert tout, tout de suite : ce que fabrique cette équipe ne serait attendu par personne.',
    'NORD Business est préparée deux fois dans « Montage ». Un service, une commande, une équipe.',
    'Montage nuit : aucun temps par vol pour «\u00a0Montage\u00a0», sa durée est nulle tant qu’ils ne sont pas renseignés.',
    '« Montage » n’a pas de minutes pour NORD Business, SUD Éco : elles y travaillent en temps nul. Renseignez les temps par vol.'
  ]);
  for (const m of duMoteur.map(MM.dire)) assert.doesNotMatch(m, BANNIS, m);
  assert.equal(MM.dire('Montage nuit finit à 14:10.'), 'Montage nuit finit à 14:10.', 'un message sans ancien mot ne change pas');
  assert.equal(MM.dire(null), null);
  // Le résultat à afficher : le même objet sans ancien mot ; sinon une copie, qui garde le message du moteur.
  const net = { ok: true, anomalies: [{ code: 'inacheve', message: 'NORD Business n’est pas finie.' }], lots: [] };
  assert.equal(MM.avecLesMotsDeLaPage(net), net);
  assert.equal(MM.avecLesMotsDeLaPage(null), null);
  const r = { ok: true, anomalies: [{ code: 'bareme', atelier: 'm', message: duMoteur[4] }, net.anomalies[0]], lots: [] };
  const fige = JSON.stringify(r), affiche = MM.avecLesMotsDeLaPage(r);
  assert.equal(JSON.stringify(r), fige, 'le résultat du moteur n’est pas modifié');
  assert.equal(affiche.lots, r.lots, 'le reste du résultat est le même');
  assert.equal(affiche.anomalies[0].message, 'Montage nuit : aucun temps par vol pour «\u00a0Montage\u00a0», sa durée est nulle tant qu’ils ne sont pas renseignés.');
  assert.equal(affiche.anomalies[1], r.anomalies[1], 'une anomalie sans ancien mot est la même');
  // L'export de la journée : les anomalies telles que le moteur les rend, champ par champ, dans le même ordre de champs.
  assert.equal(JSON.stringify(affiche.anomalies.map(MM.duMoteur)), JSON.stringify(r.anomalies));
  assert.equal(MM.duMoteur(r.anomalies[1]), r.anomalies[1]);
});

test('les phrases du moteur qui portent un ancien mot sont toutes connues de mots-moteur.js', () => {
  // Chaque morceau de texte d'un module du moteur qui porte un mot banni : mots-moteur.js le réécrit. Une phrase de plus
  // demande sa règle (le moteur, lui, ne change pas : ses résultats restent identiques).
  // Les messages que seuls les outils en ligne de commande rendent (la lecture d'une sauvegarde, ses options) gardent leurs mots.
  const DES_OUTILS = ['option « ateliers » : un objet, sans la liste des équipes (voir « equipes »).', 'ateliers de travail', 'centre des flux', 'barème et règles de poste'];
  const restes = {}, inconnus = [];
  for (const f of fs.readdirSync(path.join(RACINE, 'moteur')).filter(x => x.endsWith('.js')).sort()) {
    for (const m of chaines(lireSource('moteur/' + f))) {
      if (IDENTIFIANT.test(m.texte) || !m.texte.match(BANNIS)) continue;
      (restes[f] = restes[f] || []).push(m.texte);
      if (f === 'journee.js' && DES_OUTILS.includes(m.texte)) continue;
      if (MM.dire(m.texte).match(BANNIS)) inconnus.push(f + ' : ' + m.texte);
    }
  }
  assert.deepEqual(inconnus, [], 'des phrases du moteur sans règle dans mots-moteur.js');
  assert.deepEqual(Object.keys(restes), ['calage-formes.js', 'calage-periode.js', 'calage-statut.js', 'journee.js', 'production.js']);
  assert.deepEqual(restes['journee.js'], DES_OUTILS);
  assert.deepEqual(restes['production.js'], ['Liste d’ateliers attendue.', 'atelier sans nom', 'Atelier invalide.',
    'Elle sert tout, tout de suite : ce que fabrique cet atelier ne serait attendu par personne.',
    ' ». Un service, une commande, une case.', ' : aucun barème pour «\u00a0', ' en temps nul. Renseignez le barème.']);
  // Le calage : ses formules et ses statuts.
  assert.equal(MM.dire('besoin = 0,42 × (travail au barème) puissance 0,8'), 'besoin = 0,42 × (travail compté aux temps par vol) puissance 0,8');
  assert.equal(MM.dire('les heures réelles ne suivent pas le travail au barème (corrélation de rang 0,1, sous 0,3)'), 'les heures réelles ne suivent pas le travail compté aux temps par vol (corrélation de rang 0,1, sous 0,3)');
  assert.equal(MM.dire('Plonge ne suit pas le barème (effectif saisi, lavage, handling)'), 'Plonge ne suit pas les temps par vol (effectif saisi, lavage, handling)');
  assert.equal(MM.dire('une constante (12 ETP au barème)'), 'une constante (12 ETP aux temps par vol)');
  // La page charge ce module avant celui des équipes, qui s'en sert à chaque calcul ; l'export rend le message du moteur.
  const page = lireSource('index.html');
  assert.ok(page.indexOf('<script src="mots-moteur.js') > 0 && page.indexOf('<script src="mots-moteur.js') < page.indexOf('<script src="ateliers.js'));
  assert.match(lireSource('ateliers.js'), /this\.resultat = MM\(\)\.avecLesMotsDeLaPage\(this\.resultat\);/);
  assert.match(lireSource('sim.js'), /anomalies: r \? \(r\.anomalies \|\| \[\]\)\.map\(OrlyMotsMoteur\.duMoteur\) : \[\],/);
  // Le calage : tout ce que sa page affiche passe par l'échappement, qui réécrit ; son classeur aussi.
  assert.match(lireSource('calage-vue.js'), /const esc = s => String\(s == null \? '' : root\.OrlyMotsMoteur\.dire\(s\)\)/);
  assert.match(lireSource('echanges-calage.js'), /typeof v === 'string' \? dire\(v\) : v/);
  assert.doesNotMatch(lireSource('v2/index.html'), /mots-moteur/);
});
