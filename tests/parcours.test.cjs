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
