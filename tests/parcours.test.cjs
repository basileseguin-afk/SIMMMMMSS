/* Le parcours d'une compagnie × classe : des branches parallèles qui se
 * rejoignent. L'exemple est celui de l'unité : le matériel lavable entre par
 * la plonge puis la dotation, l'agro par les appros puis la cuisine, le
 * produit compagnie arrive du magasin — et tout se retrouve au montage. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const VOLS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: 12 * 60, bc: 10, pc: 0, yc: 150 },
  { id: 'TX1', cie: 'TX', sens: 'DEP', std: 13 * 60, bc: 0, pc: 0, yc: 120 }
];
const COMPLET = { id: 'complet', nom: 'Complet', branches: [
  { nom: 'Agro', services: ['appros', 'cuisine', 'prepa'] },
  { nom: 'Matériel', services: ['plonge', 'dotation', 'prepa'] },
  { nom: 'Magasin', services: ['magasin', 'prepa'] }
] };
const SANS_CUISINE = { id: 'sans-cuisine', nom: 'Sans cuisine', branches: [
  { nom: 'Matériel', services: ['plonge', 'dotation', 'prepa'] },
  { nom: 'Magasin', services: ['magasin', 'prepa'] }
] };
const PARCOURS = { parcours: [COMPLET, SANS_CUISINE],
  parcoursCabine: { BC: 'complet', PC: 'complet', YC: 'sans-cuisine', CREW: 'complet', SPML: 'complet' } };
const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, ...p });
const BAREME = { appros: { '*/BC': 30, '*/YC': 30 }, cuisine: { '*/BC': 60, '*/YC': 60 }, dotation: { '*/BC': 20, '*/YC': 20 },
  magasin: { '*/BC': 10, '*/YC': 10 }, prepa: { '*/BC': 40, '*/YC': 40 } };
const jouer = (ateliers, extra) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, ateliers, ...PARCOURS, ...extra });
const lot = (r, service, classe) => r.lots.find(l => l.service === service && l.classes.includes(classe));

test('les branches partent en parallèle et le montage attend la plus lente', () => {
  const r = jouer([
    at('ap', 'appros', '05:00', [['AF/BC']]),
    at('cu', 'cuisine', '05:00', [['AF/BC']]),
    at('do', 'dotation', '05:00', [['AF/BC']]),
    at('ma', 'magasin', '05:00', [['AF/BC']]),
    at('mo', 'prepa', '05:00', [['AF/BC']])
  ]);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  // Agro : appros 05:00–05:30, cuisine 05:30–06:30. Matériel : dotation 05:00–05:20.
  // Magasin : 05:00–05:10. Le montage part avec la plus lente : 06:30.
  assert.equal(lot(r, 'cuisine', 'AF/BC').debut, 5 * 60 + 30, 'la cuisine attend les appros');
  assert.equal(lot(r, 'dotation', 'AF/BC').debut, 5 * 60, 'la dotation n’attend pas l’agro');
  assert.equal(lot(r, 'prepa', 'AF/BC').debut, 6 * 60 + 30, 'le montage attend la branche agro, la plus lente');
});

test('une classe d’économie ne passe ni par la cuisine ni par ses appros', () => {
  const r = jouer([
    at('cu', 'cuisine', '05:00', [['AF/BC']], { personnes: 1 }),
    at('do', 'dotation', '05:00', [['AF/YC'], ['AF/BC']]),
    at('mo', 'prepa', '05:00', [['AF/YC'], ['AF/BC']])
  ]);
  assert.equal(r.ok, true);
  assert.equal(lot(r, 'prepa', 'AF/YC').debut, lot(r, 'dotation', 'AF/YC').fin,
    'le montage YC attend la dotation seulement, pas la cuisine');
  assert.ok(lot(r, 'prepa', 'AF/BC').debut >= lot(r, 'cuisine', 'AF/BC').fin, 'le BC, lui, attend la cuisine');
  assert.deepEqual(r.parClasse['AF/YC'].services.sort(), ['dotation', 'prepa']);
});

test('une étape du parcours sans atelier est enjambée, et signalée', () => {
  // Personne à la cuisine : le montage BC attend directement les appros.
  const r = jouer([
    at('ap', 'appros', '05:00', [['AF/BC']]),
    at('mo', 'prepa', '05:00', [['AF/BC']])
  ]);
  assert.equal(r.ok, true, 'ce n’est pas bloquant : la saisie est en cours');
  assert.equal(lot(r, 'prepa', 'AF/BC').debut, lot(r, 'appros', 'AF/BC').fin, 'le trou est enjambé');
  const trous = r.anomalies.filter(a => a.code === 'parcours-trou').map(a => a.service).sort();
  assert.deepEqual(trous, ['cuisine', 'dotation', 'magasin', 'plonge']);
});

test('une plonge sur le parcours n’est pas un trou : elle lave, elle ne fabrique pas', () => {
  const r = jouer([
    { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1,
      tunnels: [{ nom: 'T1', debit: 300, personnes: 1 }], lots: [] },
    at('do', 'dotation', '05:00', [['AF/YC']]),
    at('mo', 'prepa', '05:00', [['AF/YC']]),
    at('ma', 'magasin', '05:00', [['AF/YC']])
  ]);
  assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou' && a.service === 'plonge'));
});

test('un atelier qui fabrique une classe hors de son parcours est signalé', () => {
  const r = jouer([at('cu', 'cuisine', '05:00', [['AF/YC'], ['TX/YC']])]);
  const hors = r.anomalies.find(a => a.code === 'hors-parcours');
  assert.ok(hors, 'la cuisine ne devrait pas voir de YC');
  assert.deepEqual(hors.classes, ['AF/YC', 'TX/YC']);
  assert.equal(r.ok, true);
});

test('une compagnie × classe peut avoir son propre parcours', () => {
  // TX/YC passe exceptionnellement par la cuisine.
  const r = jouer([
    at('cu', 'cuisine', '05:00', [['TX/YC']], { personnes: 1 }),
    at('mo', 'prepa', '05:00', [['AF/YC'], ['TX/YC']], { personnes: 10 })
  ], { parcoursClasse: { 'TX/YC': 'complet' } });
  assert.ok(lot(r, 'prepa', 'TX/YC').debut >= lot(r, 'cuisine', 'TX/YC').fin, 'TX/YC attend la cuisine');
  assert.equal(lot(r, 'prepa', 'AF/YC').debut, 5 * 60, 'AF/YC garde le parcours de sa classe');
  assert.ok(!r.anomalies.some(a => a.code === 'hors-parcours'));
});

test('un parcours qui boucle est refusé avant de jouer', () => {
  const boucle = { id: 'b', nom: 'Boucle', branches: [{ services: ['cuisine', 'prepa', 'cuisine'] }] };
  const r = P.simuler({ vols: VOLS, liaisons: [], ateliers: [at('mo', 'prepa', '05:00', [['AF/BC']])],
    parcours: [boucle], parcoursCabine: { BC: 'b' } });
  assert.equal(r.ok, false);
  assert.match(r.anomalies.find(a => a.code === 'cycle').message, /Boucle/);
});

test('sans parcours, le graphe des flux fait foi comme avant', () => {
  const r = P.simuler({ vols: VOLS, bareme: BAREME, liaisons: [{ from: 'cuisine', to: 'prepa' }], ateliers: [
    at('cu', 'cuisine', '05:00', [['AF/YC']]),
    at('mo', 'prepa', '05:00', [['AF/YC']])
  ] });
  assert.equal(lot(r, 'prepa', 'AF/YC').debut, lot(r, 'cuisine', 'AF/YC').fin);
  assert.ok(!r.anomalies.some(a => /parcours/.test(a.code)));
});

test('arcs et services se lisent dans les branches', () => {
  assert.deepEqual(P.arcsDuParcours(COMPLET).map(a => a.from + '>' + a.to),
    ['appros>cuisine', 'cuisine>prepa', 'plonge>dotation', 'dotation>prepa', 'magasin>prepa']);
  assert.deepEqual(P.servicesDuParcours(COMPLET), ['appros', 'cuisine', 'prepa', 'plonge', 'dotation', 'magasin']);
  const routes = P.routesDesClasses([{ id: 'AF/YC', cabine: 'YC' }, { id: 'AF/XX', cabine: 'XX' }], PARCOURS);
  assert.equal(routes.get('AF/YC').parcours.id, 'sans-cuisine');
  assert.equal(routes.has('AF/XX'), false, 'une classe sans parcours n’en reçoit pas');
});

/* ---- le parcours en diagramme de nœuds --------------------------------- */
test('un parcours est un graphe : des nœuds et des liens « A livre B »', () => {
  const g = { id: 'g', nom: 'G', noeuds: ['appros', 'cuisine', 'prepa', 'magasin', 'dotation'],
    liens: [{ de: 'appros', vers: 'cuisine' }, { de: 'cuisine', vers: 'prepa' }, { de: 'magasin', vers: 'prepa' }] };
  assert.deepEqual(P.arcsDuParcours(g).map(a => a.from + '>' + a.to), ['appros>cuisine', 'cuisine>prepa', 'magasin>prepa']);
  assert.deepEqual(P.servicesDuParcours(g), ['appros', 'cuisine', 'prepa', 'magasin', 'dotation'], 'un nœud sans lien en fait partie');
  // Et le calcul le lit comme il lisait les branches : le montage attend ses deux amonts.
  const r = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, parcours: [g], parcoursCabine: { YC: 'g' }, ateliers: [
    at('ap', 'appros', '05:00', [['AF/YC']]), at('cu', 'cuisine', '05:00', [['AF/YC']]),
    at('ma', 'magasin', '09:00', [['AF/YC']]), at('mo', 'prepa', '05:00', [['AF/YC']])] });
  assert.equal(lot(r, 'prepa', 'AF/YC').debut, Math.max(lot(r, 'cuisine', 'AF/YC').fin, lot(r, 'magasin', 'AF/YC').fin));
});

test('un parcours en branches est converti en graphe à la lecture', () => {
  const v = PC.validerParcours({ parcours: [COMPLET], parcoursCabine: { BC: 'complet' } });
  assert.deepEqual(Object.keys(v.parcours[0]).sort(), ['id', 'liens', 'noeuds', 'nom']);
  assert.deepEqual(v.parcours[0].liens.map(l => l.de + '>' + l.vers), P.arcsDuParcours(COMPLET).map(a => a.from + '>' + a.to));
  // Les liens en double, les boucles sur soi et les champs vides sont écartés.
  const w = PC.validerParcours({ parcours: [{ id: 'x', nom: 'X', noeuds: ['a'], liens: [{ de: 'a', vers: 'b' }, { de: 'a', vers: 'b' }, { de: 'b', vers: 'b' }, { de: '', vers: 'a' }] }] });
  assert.deepEqual(w.parcours[0].liens, [{ de: 'a', vers: 'b' }]);
  assert.deepEqual(w.parcours[0].noeuds, ['a', 'b'], 'un lien ajoute ses deux bouts aux nœuds');
  // Les parcours types naissent en graphe.
  assert.ok(PC.parcoursTypes().parcours.every(p => Array.isArray(p.liens) && !p.branches));
});

test('relier deux nœuds ne doit pas fermer de boucle', () => {
  const g = { noeuds: ['a', 'b', 'c'], liens: [{ de: 'a', vers: 'b' }, { de: 'b', vers: 'c' }] };
  assert.equal(PC.creeBoucle(g, 'c', 'a'), true, 'c → a ferait tourner a → b → c → a');
  assert.equal(PC.creeBoucle(g, 'a', 'c'), false, 'un raccourci n’est pas une boucle');
  assert.equal(PC.creeBoucle(g, 'b', 'b'), true);
});

/* ---- parcours × équipes : la fusion ----------------------------------- */
const PC = require('../parcours.js');
const CLASSES = P.classesDeVols(VOLS, { delaiChargement: 45 });
const etatAvec = ateliers => ({ ateliers, ...PARCOURS, parcoursClasse: {} });

test('les étapes se lisent dans l’ordre du flux : sources d’abord, jonction à la fin', () => {
  assert.deepEqual(PC.etapesOrdonnees(COMPLET), ['appros', 'plonge', 'magasin', 'cuisine', 'dotation', 'prepa']);
});

test('la couverture dit, étape par étape, quelle équipe travaille quelle classe', () => {
  const etat = etatAvec([at('cu', 'cuisine', '05:00', [['AF/BC']]),
    { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', lots: [] }]);
  const c = PC.couverture(etat, CLASSES);
  const complet = c.find(x => x.parcours.id === 'complet');
  assert.deepEqual(complet.classes, ['AF/BC'], 'seule AF/BC suit le parcours complet dans ce programme');
  const e = s => complet.etapes.find(x => x.service === s);
  assert.deepEqual(e('cuisine').manquantes, [], 'la cuisine fait AF/BC');
  assert.equal(e('cuisine').classes[0].atelier, 'cu');
  assert.deepEqual(e('prepa').manquantes, ['AF/BC'], 'personne au montage');
  assert.deepEqual(e('plonge').manquantes, [], 'une plonge n’a rien à se voir confier');
  const sans = c.find(x => x.parcours.id === 'sans-cuisine');
  assert.deepEqual(sans.classes.sort(), ['AF/YC', 'TX/YC']);
});

test('confier ajoute une fabrication par classe, dans l’ordre des échéances, sans doublon', () => {
  const etat = etatAvec([at('mo', 'prepa', '05:00', [['AF/YC']])]);
  const n = PC.confier(etat, 'mo', ['TX/YC', 'AF/BC', 'AF/YC'], CLASSES);
  assert.equal(n, 2, 'AF/YC y était déjà');
  assert.deepEqual(etat.ateliers[0].lots, [['AF/YC'], ['AF/BC'], ['TX/YC']], 'AF (12:00) avant TX (13:00)');
  assert.throws(() => PC.confier(etatAvec([{ id: 'pl', type: 'lavage', service: 'plonge', lots: [] }]), 'pl', ['AF/BC'], CLASSES), /ne fabrique pas/);
});

test('une équipe se pose sur une étape avec ce qu’elle a à faire', () => {
  const etat = etatAvec([]);
  const a = PC.nouvelleEquipe(etat, 'dotation', 'DOTATION', ['TX/YC', 'AF/YC'], CLASSES);
  assert.equal(a.service, 'dotation'); assert.equal(a.nom, 'DOTATION');
  assert.deepEqual(a.lots, [['AF/YC'], ['TX/YC']]);
  assert.equal(PC.nouvelleEquipe(etat, 'dotation', 'DOTATION', [], CLASSES).nom, 'DOTATION 2');
});

test('compléter confie là où une seule équipe travaille, et rend la main ailleurs', () => {
  const etat = etatAvec([at('mo', 'prepa', '05:00', []), at('d1', 'dotation', '05:00', []), at('d2', 'dotation', '05:00', [])]);
  const { faits, restent } = PC.completer(etat, CLASSES);
  const auMontage = faits.filter(f => f.service === 'prepa').reduce((n, f) => n + f.n, 0);
  assert.equal(auMontage, 3, 'le montage reçoit ses trois classes, des deux parcours qui y passent');
  assert.ok(restent.some(r => r.service === 'dotation' && r.raison === 'plusieurs équipes'), 'deux dotations : on ne choisit pas');
  assert.ok(restent.some(r => r.service === 'cuisine' && r.raison === 'aucune équipe'));
  // Et la journée tourne sur ce qui a été confié.
  const r = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, ateliers: etat.ateliers, ...PARCOURS });
  assert.equal(r.ok, true);
  assert.ok(r.lots.some(l => l.service === 'prepa' && l.classes.includes('TX/YC')));
});

test('les colonnes du tableau se groupent par nœud de départ, puis la jonction', () => {
  assert.deepEqual(PC.colonnes(PARCOURS.parcours).map(c => c.groupe + ':' + c.service),
    ['appros:appros', 'appros:cuisine', 'plonge:plonge', 'plonge:dotation', 'magasin:magasin', 'Jonction:prepa']);
  // Ce qui suit la jonction reste après elle, dans l'ordre du flux.
  const long = { id: 'l', nom: 'L', branches: [{ nom: 'A', services: ['cuisine', 'prepa', 'armement'] },
    { nom: 'B', services: ['dotation', 'prepa'] }] };
  assert.deepEqual(PC.colonnes([long]).map(c => c.service), ['cuisine', 'dotation', 'prepa', 'armement']);
});

test('le tableau dit, case par case, qui fabrique quoi', () => {
  const etat = etatAvec([at('cu', 'cuisine', '05:00', [['AF/BC'], ['AF/YC']]),
    { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', lots: [] }]);
  const t = PC.tableau(etat, CLASSES);
  const k = (c, s) => t.lignes.find(l => l.classe.id === c).cases[s];
  assert.equal(k('AF/BC', 'cuisine').etat, 'equipe');
  assert.deepEqual(k('AF/BC', 'cuisine').ateliers, ['cu']);
  assert.equal(k('AF/BC', 'prepa').etat, 'libre', 'personne au montage');
  assert.equal(k('AF/BC', 'plonge').etat, 'auto', 'la plonge lave pour tout le monde');
  assert.equal(k('TX/YC', 'cuisine').etat, 'hors', 'YC ne passe pas en cuisine');
  assert.equal(k('AF/YC', 'cuisine').etat, 'hors-fait', 'fabriquée hors de son parcours : on le voit');
  const col = t.colonnes.find(c => c.service === 'prepa');
  assert.deepEqual(col.libres.sort(), ['AF/BC', 'AF/YC', 'TX/YC']);
});

test('choisir une équipe déplace la classe ; vider la case la retire', () => {
  const etat = etatAvec([at('d1', 'dotation', '05:00', [['AF/BC', 'AF/YC']]), at('d2', 'dotation', '06:00', [])]);
  PC.affecter(etat, 'dotation', ['AF/BC'], 'd2', CLASSES);
  assert.deepEqual(etat.ateliers[0].lots, [['AF/YC']], 'elle quitte l’autre équipe, sa voisine de lot reste');
  assert.deepEqual(etat.ateliers[1].lots, [['AF/BC']]);
  PC.affecter(etat, 'dotation', ['AF/BC'], null, CLASSES);
  assert.deepEqual(etat.ateliers[1].lots, [], 'case vidée');
});

test('le chronogramme suit une classe étape par étape et dit qui l’a fait attendre', () => {
  const ateliers = [at('ap', 'appros', '05:00', [['AF/BC']]), at('cu', 'cuisine', '05:00', [['AF/BC']]),
    at('do', 'dotation', '05:00', [['AF/BC']]), at('mo', 'prepa', '05:00', [['AF/BC']])];
  const r = jouer(ateliers);
  const g = PC.chronogramme(r, COMPLET, 'AF/BC');
  assert.deepEqual(g.etapes.map(e => e.service), ['appros', 'cuisine', 'plonge', 'dotation', 'magasin', 'prepa'],
    'dans l’ordre des colonnes du tableau');
  const e = s => g.etapes.find(x => x.service === s);
  assert.equal(e('plonge').absent, true, 'pas de plonge décrite : l’étape est vide');
  assert.equal(e('prepa').branche, 'Jonction');
  assert.ok(e('cuisine').fin <= e('prepa').debut, 'la cuisine finit avant que le montage commence');
  const dernier = ['cuisine', 'dotation'].sort((a, b) => e(b).fin - e(a).fin)[0];
  assert.ok(e('prepa').attente > 0, 'le montage, arrivé à 05:00, attend ses amonts');
  assert.equal(e('prepa').attendu, dernier, 'le montage a attendu la branche la plus lente');
  assert.equal(g.debut, 5 * 60);
});
