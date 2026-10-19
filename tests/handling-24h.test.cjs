/* Banc d'essai, évolution 3 — le handling 24 h/24 (v1) : des tournées menées
 * en parallèle, qui chargent les départs puis déchargent les avions arrivés
 * (docs/BANC_ESSAI.md § 3). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, p) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...p });
const ret = (id, cie, sta, p) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100, ...p });
// Une prépa nombreuse : les commandes sont prêtes dès la nuit, sauf mention contraire.
const BAREME = { prepa: { '*/YC': 10 } };
const prepa = (vols, p) => ({ id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '00:00', jour: -1, personnes: 10, pauses: [],
  lots: [...new Set(vols.filter(v => v.sens === 'DEP').map(v => v.cie + '/YC'))].map(id => [id]), regime: { actif: false }, ...p });
const handling = p => ({ id: 'ha', nom: 'Handling', service: 'handling', type: 'handling', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [],
  regime: { actif: false }, durees: { '*': 20 }, allers: { '*': 10 }, retours: { '*': 10 }, simultanes: 5, avance: 180, handling24h: true, ...p });
const jouer = (ha, vols, o = {}) => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
  ateliers: [o.prepa || prepa(vols)].concat(o.autres || [], ha ? [ha] : []), ...(o.args || {}) });
const vue = (r, id = 'ha') => r.ateliers.find(a => a.id === id);
const vol = (r, id) => r.vols.find(v => v.id === id);
const etapes = t => t.etapes.map(e => e.etape + (e.vol ? ' ' + e.vol : ''));
/** Les invariants de toute journée : un avion se décharge avant d'être rechargé, une tournée est d'un seul tenant. */
function invariants(r) {
  for (const v of r.vols) if (v.dechargement && v.fin != null) assert.ok(v.dechargement.fin <= v.debut + 1e-9, v.id + ' : rechargé avant d’être déchargé');
  for (const t of vue(r).tournees || []) {
    assert.equal(t.etapes[0].de, t.depart); assert.equal(t.etapes[t.etapes.length - 1].a, t.retour);
    t.etapes.forEach((e, i) => { if (i) assert.equal(e.de, t.etapes[i - 1].a, 'tournée ' + t.n + ' : étapes d’un seul tenant'); });
  }
}

test('une tournée charge A, puis va décharger B, arrivé entre-temps, avant de rentrer', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('SU1', 'SUD', '12:00')];
  // L'avion de SU1 arrive 4 h 30 avant son départ : 07:30. NORD n'a pas d'escale saisie.
  const r = jouer(handling({ escale: { SUD: 270 } }), vols);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const [t1, t2] = vue(r).tournees;
  assert.deepEqual([t1.charges, t1.decharges], [['NO1'], ['SU1']]);
  assert.deepEqual(etapes(t1), ['aller', 'chargement NO1', 'trajet', 'dechargement SU1', 'retour']);
  // Elle part pour charger dès l'ouverture (départ − 3 h), après l'aller.
  assert.deepEqual([t1.depart, t1.retour], [h('06:50'), h('07:50')]);
  assert.deepEqual(vol(r, 'SU1').dechargement, { debut: h('07:30'), fin: h('07:40'), tournee: 1 }, '10 min pour un court courrier');
  assert.equal(vol(r, 'SU1').arrivee, h('07:30'));
  // SU1 se charge ensuite, dans sa propre fenêtre.
  assert.deepEqual([t2.charges, t2.decharges], [['SU1'], []]);
  assert.deepEqual([vol(r, 'SU1').debut, vol(r, 'SU1').fin], [h('09:00'), h('09:20')]);
  assert.equal(vol(r, 'NO1').arrivee, undefined, 'sans escale ni ETA : pas d’arrivée');
  assert.deepEqual(r.vols.map(v => [v.id, v.etat, v.aHeure]), [['NO1', 'ok', true], ['SU1', 'ok', true]]);
  invariants(r);
});

test('une tournée n’enchaîne pas un déchargement qui mettrait en retard le départ de cet avion', () => {
  // L'avion de SU1 arrive à 07:20 ; il doit être déchargé à 07:40 pour que SU1 soit chargé avant 08:00.
  // La tournée de NO1 n'y serait qu'à 07:45 : elle rentre, et l'avion de SU1 est déchargé à part.
  const vols = [dep('NO1', 'NORD', '10:15'), dep('SU1', 'SUD', '09:00')];
  const r = jouer(handling({ escale: { SUD: 100 } }), vols);
  const t1 = vue(r).tournees.find(t => t.charges.includes('NO1'));
  assert.deepEqual(t1.decharges, []);
  assert.deepEqual(vol(r, 'SU1').dechargement, { debut: h('07:20'), fin: h('07:30'), tournee: vue(r).tournees.find(t => t.decharges.includes('SU1')).n });
  assert.deepEqual([vol(r, 'SU1').aHeure, vol(r, 'NO1').aHeure], [true, true]);
  invariants(r);
});

test('un avion n’est pas rechargé avant d’être déchargé', () => {
  // Commande prête dès la nuit, fenêtre ouverte à 07:00 ; l'avion arrive à 08:00.
  const vols = [dep('NO1', 'NORD', '10:00')];
  const r = jouer(handling({ escale: { NORD: 120 } }), vols);
  const v = vol(r, 'NO1');
  assert.deepEqual(v.dechargement, { debut: h('08:00'), fin: h('08:10'), tournee: 1 });
  assert.equal(v.debut, h('08:10'), 'chargé dès son avion déchargé, pas à 07:00');
  assert.equal(v.aHeure, true);
  const [t1, t2] = vue(r).tournees;
  assert.deepEqual([t1.charges, t1.decharges, t1.depart], [[], ['NO1'], h('07:50')], 'un déchargement seul : il part à vide');
  assert.deepEqual(etapes(t1), ['aller', 'dechargement NO1', 'retour']);
  assert.equal(t2.depart, h('08:00'), 'le chargement part pour arriver quand l’avion est déchargé');
  // Sans escale : le même vol se charge dès l'ouverture.
  assert.equal(vol(jouer(handling(), vols), 'NO1').debut, h('07:00'));
  invariants(r);
});

test('une escale courte : une seule tournée décharge puis charge le même avion', () => {
  // L'avion arrive 30 min avant le départ : trop tard pour décharger puis charger avant départ − 60.
  const vols = [dep('ES1', 'EST', '10:00')];
  const r = jouer(handling({ escale: { EST: 30 } }), vols);
  const [t] = vue(r).tournees;
  assert.equal(vue(r).tournees.length, 1);
  assert.equal(t.echange, true);
  assert.deepEqual(etapes(t), ['aller', 'dechargement ES1', 'chargement ES1', 'retour']);
  assert.deepEqual([t.depart, t.retour], [h('09:20'), h('10:10')]);
  const v = vol(r, 'ES1');
  assert.equal(v.escaleCourte, true);
  assert.equal(v.limite, h('10:00'), 'chargé seulement avant son départ (marge d’escale courte : 0)');
  assert.deepEqual([v.fin, v.aHeure, v.etat], [h('10:00'), true, 'ok']);
  // La marge d'escale courte se règle : 15 min, et ce vol est en retard, faute de temps.
  const r2 = jouer(handling({ escale: { EST: 30 }, margeEscaleCourte: 15 }), vols);
  assert.deepEqual([vol(r2, 'ES1').aHeure, vol(r2, 'ES1').retard, vol(r2, 'ES1').cause], [false, 15, 'fenetre']);
  invariants(r);
});

test('une compagnie sans escale n’est pas déchargée : la règle des retours s’applique', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('OU1', 'OUEST', '10:30'), ret('NO9', 'NORD', '08:05'), ret('OU9', 'OUEST', '14:00')];
  const plonge = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '00:00', jour: 0, personnes: 2, pauses: [], lots: [],
    regime: { actif: false }, parVol: true, durees: { '*': 20 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] };
  const r = jouer(handling({ escale: { NORD: 120 } }), vols, { autres: [plonge] });
  assert.equal(vol(r, 'OU1').arrivee, undefined);
  assert.ok(!vue(r).tournees.some(t => t.decharges.includes('OU1')));
  const laves = r.lots.filter(l => l.retourVol).map(l => [l.vol, l.arrivee]);
  // OUEST : sa ligne retour, à son heure + le délai de la boucle (30 min). NORD : l'avion de NO1, rapporté par sa tournée.
  assert.deepEqual(laves.find(x => x[0] === 'OU9'), ['OU9', h('14:30')]);
  const t = vue(r).tournees.find(x => x.decharges.includes('NO1'));
  assert.deepEqual(laves.find(x => x[0] === 'NO9'), ['NO9', t.retour], 'la ligne retour la plus proche de son arrivée donne le vol');
  assert.equal(laves.length, 2, 'NO9 n’est pas lavé deux fois');
});

test('un vol pas prêt ne bloque plus le suivant', () => {
  const vols = [dep('NO1', 'NORD', '09:00'), dep('SU1', 'SUD', '10:00')];
  // La commande de NO1 ne sort qu'à 11:00, après son départ.
  const pr = prepa(vols, { lots: [['SUD/YC']] });
  const tard = { id: 'pr2', nom: 'Prépa tard', service: 'prepa', type: 'manuel', debut: '11:00', jour: 0, personnes: 10, pauses: [], lots: [['NORD/YC']], regime: { actif: false } };
  const r = jouer(handling(), vols, { prepa: pr, autres: [tard] });
  assert.deepEqual([vol(r, 'SU1').aHeure, vol(r, 'SU1').fin], [true, h('07:20')], 'SU1 part à son heure');
  const n = vol(r, 'NO1');
  assert.deepEqual([n.etat, n.cause, n.aHeure], ['retard', 'commande', false], 'NO1 est chargé quand sa commande sort, en retard');
  assert.ok(r.anomalies.some(a => a.code === 'handling-retard' && /commande pas prête/.test(a.message)));
  // Sans le mode 24 h/24, l'ordre strict des départs retient SU1 derrière NO1.
  const avant = jouer(handling({ handling24h: undefined, simultanes: 1 }), vols, { prepa: pr, autres: [tard] });
  assert.equal(vol(avant, 'SU1').aHeure, false);
});

test('VL et gros camions se comptent à part', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('NO2', 'NORD', '10:00'), dep('SU1', 'SUD', '10:00')];
  // Un gros camion et un petit : SUD est servi en VL.
  const r = jouer(handling({ vl: ['SUD'], camions: 1, camionsVL: 1 }), vols);
  const t = vue(r).tournees.map(x => [x.vehicule, x.charges.join(), x.depart]);
  assert.deepEqual(t, [['camion', 'NO1', h('06:50')], ['vl', 'SU1', h('06:50')], ['camion', 'NO2', h('07:30')]],
    'NO2 attend le retour du seul gros camion ; SU1 part en même temps que NO1');
  assert.deepEqual(vue(r).vehiculesMax, { camion: 1, vl: 1 });
  assert.deepEqual(r.vols.map(v => v.vehicule), ['camion', 'camion', 'vl']);
  // Avec des créneaux : un chauffeur de gros camion et un de VL, chacun le sien.
  const cr = [{ de: '06:00', a: '14:00', n: 1 }, { de: '06:00', a: '14:00', n: 1, type: 'vl' }];
  const r2 = jouer(handling({ vl: ['SUD'], creneaux: cr }), vols);
  assert.deepEqual(vue(r2).tournees.map(x => [x.vehicule, x.charges.join(), x.conducteurs.join()]),
    [['camion', 'NO1', '1.1'], ['vl', 'SU1', '2.1'], ['camion', 'NO2', '1.1']]);
  // Sans chauffeur de VL, SU1 n'est pas chargé : faute de chauffeur.
  const r3 = jouer(handling({ vl: ['SUD'], creneaux: cr.slice(0, 1) }), vols);
  assert.deepEqual([vol(r3, 'SU1').etat, vol(r3, 'SU1').cause], ['chauffeurs', 'chauffeur']);
  assert.ok(r3.anomalies.some(a => a.code === 'handling-chauffeurs' && /faute de chauffeur/.test(a.message)));
});

test('l’échéance des commandes suit la tournée de chargement', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('ES1', 'EST', '10:00')];
  const ha = handling({ quaiDepart: { NORD: 15 }, escale: { EST: 30 } });
  const r = jouer(ha, vols);
  // départ − marge (60) − chargement (20) − aller (10) − préparation au quai (15).
  assert.equal(r.parClasse['NORD/YC'].echeance, h('08:15'));
  assert.equal(vol(r, 'NO1').echeanceCommandes, h('08:15'));
  // En escale courte : départ − marge d'escale courte − chargement − déchargement − aller.
  assert.equal(r.parClasse['EST/YC'].echeance, h('09:20'));
  // Sans le mode 24 h/24 : départ − délai de chargement (45 min).
  assert.equal(jouer(handling({ handling24h: undefined }), vols).parClasse['NORD/YC'].echeance, h('09:15'));
  // La marge avant le départ se règle.
  assert.equal(jouer(handling({ margeDepart: 30 }), vols).parClasse['NORD/YC'].echeance, h('09:00'));
});

test('le sale arrive à la plonge à la fin du vidage au quai, avec les quantités du vol', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('SU1', 'SUD', '12:00', { yc: 150 })];
  const plonge = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '00:00', jour: 0, personnes: 2, pauses: [], lots: [],
    regime: { actif: false }, parVol: true, durees: { '*': 20 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] };
  const materiel = { actif: true, unites: { YC: { parVol: 4 } } };
  const r = jouer(handling({ escale: { SUD: 270 }, quaiRetour: { '*': 15 } }), vols, { autres: [plonge], args: { materiel } });
  const t1 = vue(r).tournees[0];
  assert.deepEqual(etapes(t1), ['aller', 'chargement NO1', 'trajet', 'dechargement SU1', 'retour', 'quai-retour']);
  const l = r.lots.find(x => x.retourVol && x.vol === 'SU1');
  assert.equal(l.arrivee, h('08:05'), 'vidé au quai à 08:05, pas à l’arrivée + 30 min');
  assert.equal(l.arrivee, t1.retour);
  assert.equal(l.unites, 4, 'les unités du vol de départ');
  assert.equal(r.materiel.entrees, 4);
  // Une feuille « Retours » donne les quantités, et son nom de vol.
  const r2 = jouer(handling({ escale: { SUD: 270 }, quaiRetour: { '*': 15 } }), vols.concat([ret('SU8', 'SUD', '07:20', { yc: 50 })]),
    { autres: [plonge], args: { materiel: { actif: true, unites: { YC: { parVol: 4 } } } } });
  assert.deepEqual(r2.lots.filter(x => x.retourVol).map(x => [x.vol, x.arrivee]), [['SU8', h('08:05')]]);
});

test('un chauffeur finit sa tournée en heures sup', () => {
  const vols = [dep('NO1', 'NORD', '10:00')];
  // Aller 30 min : la tournée part à 06:30 et rentre à 07:30. Le premier chauffeur finit à 07:15.
  const ha = handling({ allers: { '*': 30 }, creneaux: [{ de: '06:00', a: '07:15', n: 1 }, { de: '07:15', a: '15:00', n: 1 }] });
  const avec = jouer(ha, vols, { args: { heuresSup: { actif: true, plafond: 180 } } });
  const [t] = vue(avec).tournees;
  assert.deepEqual([t.depart, t.retour, t.conducteurs, t.heuresSup], [h('06:30'), h('07:30'), ['1.1'], 15]);
  assert.deepEqual(vue(avec).conducteurs.filter(d => !d.veille).map(d => [d.id, d.heuresSup]), [['1.1', 15], ['2.1', 0]]);
  assert.equal(vue(avec).heuresSupChauffeurs, 15);
  assert.equal(vue(avec).heuresSup, 0, 'l’équipe de handling n’en fait pas : ses chauffeurs, si');
  // Sans heures sup : le premier chauffeur ne part pas pour une tournée qu'il ne finirait pas ; le second la prend.
  const sans = jouer(ha, vols);
  assert.deepEqual([vue(sans).tournees[0].depart, vue(sans).tournees[0].conducteurs], [h('07:15'), ['2.1']]);
  assert.equal(vue(sans).heuresSupChauffeurs, 0);
  assert.equal(vol(sans, 'NO1').aHeure, true);
});

test('24 h/24 : une tournée peut partir la veille au soir', () => {
  const vols = [dep('NO1', 'NORD', '01:00'), dep('SU1', 'SUD', '05:00')];
  const r = jouer(handling({ escale: { SUD: 400 } }), vols);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const [t1] = vue(r).tournees;
  assert.equal(t1.depart, h('01:00') - 180 - 10, 'à 21:50 la veille');
  // L'avion de SU1 arrive à 22:20 la veille : déchargé par la première tournée, après son chargement (21:40).
  assert.deepEqual(t1.decharges, ['SU1']);
  assert.ok(r.vols.every(v => v.aHeure));
  invariants(r);
});

test('un vol long courrier prend ses chauffeurs ; un déchargement long courrier se fait à part s’ils manquent', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('SU1', 'SUD', '12:00')];
  // SUD est long courrier : 30 min de déchargement, 2 chauffeurs. Un seul chauffeur de 06:00 à 08:00, deux ensuite.
  const ha = handling({ longs: ['SUD'], escale: { SUD: 270 }, creneaux: [{ de: '06:00', a: '08:00', n: 1 }, { de: '08:00', a: '16:00', n: 2 }] });
  const r = jouer(ha, vols);
  const [t1, t2] = vue(r).tournees;
  assert.deepEqual([t1.charges, t1.decharges, t1.chauffeurs], [['NO1'], [], 1], 'pas assez de chauffeurs pour décharger SU1 avec NO1');
  assert.deepEqual([t2.charges, t2.decharges, t2.chauffeurs], [[], ['SU1'], 2]);
  assert.equal(vol(r, 'SU1').dechargement.fin - vol(r, 'SU1').dechargement.debut, 30);
  assert.ok(r.vols.every(v => v.aHeure));
  invariants(r);
});

test('les mêmes entrées donnent la même journée', () => {
  const vols = [dep('NO1', 'NORD', '10:00'), dep('NO2', 'NORD', '10:20'), dep('SU1', 'SUD', '12:00'), dep('ES1', 'EST', '10:00')];
  const ha = handling({ escale: { '*': 90, EST: 30 }, vl: ['EST'], camions: 1 });
  const json = x => JSON.stringify(x, (k, v) => (typeof v === 'function' ? undefined : v));
  assert.equal(json(jouer(ha, vols)), json(jouer(ha, vols)));
});

test('les réglages du handling 24 h/24 se gardent quand ils sont saisis, et seulement alors', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [handling({ handling24h: undefined })] };
  const lu = A.valider(base).ateliers[0];
  for (const k of ['handling24h', 'escale', 'quaiDepart', 'dechargement', 'quaiRetour', 'vl', 'entreAvions', 'dechargementsParTournee',
    'margeDepart', 'margeEscaleCourte', 'delaiArrivee', 'camionsVL']) assert.equal(k in lu, false, k + ' : rien d’enregistré sans saisie');
  const saisi = A.valider({ ...base, ateliers: [handling({ escale: { sud: 90, '*': '' }, quaiDepart: { '*': 12.5 }, vl: ['sud', 'SUD', ''], entreAvions: '15',
    dechargementsParTournee: 0, margeDepart: 5000, camionsVL: 0, creneaux: [{ de: '06:00', a: '14:00', n: 2, type: 'vl' }, { de: '06:00', a: '14:00', n: 1, type: 'x' }] })] }).ateliers[0];
  assert.deepEqual([saisi.handling24h, saisi.escale, saisi.quaiDepart, saisi.vl, saisi.entreAvions, saisi.dechargementsParTournee, saisi.margeDepart, saisi.camionsVL],
    [true, { SUD: 90 }, { '*': 12.5 }, ['SUD'], 15, 1, 720, undefined]);
  assert.deepEqual(saisi.creneaux, [{ de: '06:00', a: '14:00', n: 2, type: 'vl' }, { de: '06:00', a: '14:00', n: 1 }]);
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify({ ...base, ateliers: [saisi] }))).ateliers[0], saisi, 'relu tel quel');
});

/* ---- Excel et import des vols ----------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const UI = require('../ui-model.js');
const J = require('../moteur/journee.js');
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));
const CTX = { services: [{ id: 'prepa', nom: 'MONTAGE' }, { id: 'handling', nom: 'HANDLING' }], programme: [], classes: [] };
const etatAvec = ha => ({ schema: 'ory-ateliers', version: 1, ateliers: [A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [ha] }).ateliers[0]] });

test('Excel : un handling d’avant s’exporte comme avant, sans colonne nouvelle', () => {
  const f = E.ateliersVersClasseur(etatAvec(handling({ handling24h: undefined, creneaux: [{ de: '06:00', a: '14:00', n: 2 }] })), CTX);
  assert.deepEqual(f.find(x => x.nom === 'Handling').lignes[0], ['Atelier', 'Compagnie', 'Aller (min)', 'Minutes par vol', 'Retour (min)', 'Courrier', 'Vols par camion']);
  assert.deepEqual(f.find(x => x.nom === 'Chauffeurs').lignes, [['Atelier', 'Début', 'Fin', 'Chauffeurs'], ['Handling', '06:00', '14:00', 2]]);
  assert.ok(!f.find(x => x.nom === 'Lisez-moi').lignes.flat().join(' ').includes('24 h/24'));
});

test('Excel : les réglages du handling 24 h/24 font l’aller-retour, et se modifient', async () => {
  const etat = etatAvec(handling({ escale: { '*': 90, SUD: 270 }, quaiDepart: { '*': 10 }, dechargement: { NORD: 25 }, quaiRetour: { '*': 15 }, vl: ['SUD'],
    margeDepart: 50, entreAvions: 12, camionsVL: 2, creneaux: [{ de: '06:00', a: '14:00', n: 2 }, { de: '06:00', a: '14:00', n: 1, type: 'vl' }] }));
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const lignes = f.find(x => x.nom === 'Handling').lignes;
  assert.deepEqual(lignes[0].slice(7), ['Escale (min)', 'Préparation au quai (min)', 'Déchargement (min)', 'Vidage au quai (min)', 'Véhicule']);
  assert.deepEqual(f.find(x => x.nom === 'Chauffeurs').lignes.slice(1), [['Handling', '06:00', '14:00', 2, 'camion'], ['Handling', '06:00', '14:00', 1, 'VL']]);
  const relu = A.valider(E.classeurVersAteliers(f, etat, CTX).etat).ateliers[0];
  assert.deepEqual(relu, etat.ateliers[0], 'rien de perdu, réglages d’équipe compris (gardés du site)');
  // Dans Excel : NORD passe en VL, avec une escale de 60 min ; le créneau VL devient un créneau de gros camion.
  const g = modifier(modifier(f, 'Handling', l => l.concat([['Handling', 'NORD', null, null, null, 'court', null, 60, null, null, null, 'VL']])),
    'Chauffeurs', l => l.map(x => (x[4] === 'VL' ? [x[0], x[1], x[2], x[3], 'camion'] : x)));
  const h2 = A.valider(E.classeurVersAteliers(await parFichier(g), etat, CTX).etat).ateliers[0];
  assert.deepEqual([h2.escale, h2.vl, h2.creneaux.map(c => c.type || 'camion')], [{ '*': 90, NORD: 60, SUD: 270 }, ['SUD', 'NORD'], ['camion', 'camion']]);
  assert.throws(() => E.classeurVersAteliers(modifier(f, 'Handling', l => l.map((x, i) => (i === 2 ? Object.assign(x, { 11: 'vélo' }) : x))), etat, CTX), /véhicule/);
});

test('import des vols : heure_eta, l’arrivée estimée de l’avion d’un départ (version 1)', async () => {
  const csv = 'vol_id,compagnie,sens,heure_std,heure_sta,heure_eta,nb_BC,nb_PC,nb_YC\n'
    + 'NO1,NORD,DEP,10:00,,08:30,0,0,100\nNO2,NORD,DEP,06:00,,22:40,0,0,100\nNO3,NORD,DEP,12:00,,,0,0,100\nNO9,NORD,RET,,09:00,,0,0,100\n';
  const v = UI.parseFlights(csv, { eta: true });
  assert.deepEqual(v.map(x => x.eta), [h('08:30'), h('22:40') - 1440, undefined, undefined], 'plus tard que le départ sur l’horloge : la veille');
  assert.ok(UI.parseFlights(csv).every(x => !('eta' in x)), 'sans l’option (version 2) : la colonne est ignorée, comme avant');
  assert.throws(() => UI.parseFlights(csv.replace('08:30', '8h3'), { eta: true }), /heure_eta/);
  // Par le banc (et la page) : un fichier, lu par l'import de la version 1.
  const fichier = { name: 'vols.csv', size: csv.length, text: async () => csv };
  assert.deepEqual((await J.volsDuFichier(fichier)).map(x => x.eta), [h('08:30'), h('22:40') - 1440, undefined, undefined]);
  assert.equal(J.volsDecales(v, 15)[0].eta, h('08:45'), 'décalée avec le programme');
  // Le classeur : une colonne heure_eta dans « Départs », seulement si un départ en a une.
  const f = await parFichier(E.volsVersClasseur(v));
  assert.deepEqual(f.find(x => x.nom === 'Départs').lignes[0].slice(0, 5), ['vol_id', 'compagnie', 'type_avion', 'heure_std', 'heure_eta']);
  assert.deepEqual(E.classeurVersVols(f, { eta: true }), v);
  assert.equal(E.volsVersClasseur(UI.parseFlights(csv)).find(x => x.nom === 'Départs').lignes[0][4], 'nb_BC', 'sans ETA : le classeur d’avant');
  // Au handling 24 h/24 : l'ETA remplace l'escale.
  const r = jouer(handling({ escale: { '*': 60 } }), v.filter(x => x.id !== 'NO2'));
  assert.deepEqual([vol(r, 'NO1').arrivee, vol(r, 'NO3').arrivee], [h('08:30'), h('11:00')]);
});

test('le banc force le mode et ses réglages par « equipes », comme une saisie', () => {
  const s = require('./non-regression.attendu.json').scenarios.find(x => x.nom === 'unite-vol');
  const jouerAvec = equipes => J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, { ...s.options, equipes }));
  const r = jouerAvec({ h: { handling24h: true, escale: { '*': 90 }, margeDepart: 45 } });
  assert.equal(r.ok, true);
  const v = r.ateliers.find(a => a.id === 'h');
  assert.ok(v.tournees.length > 0, 'des tournées');
  assert.ok(r.vols.every(x => x.limite === (x.escaleCourte ? x.depart : x.depart - 45)), 'la marge forcée ; en escale courte, le départ');
  assert.ok(r.vols.some(x => x.escaleCourte) && r.vols.some(x => !x.escaleCourte));
  assert.ok(r.vols.some(x => x.dechargement), 'des avions déchargés');
  assert.throws(() => jouerAvec({ h: { handling24h: 'oui' } }), /handling24h/, 'une valeur que le validateur ne garde pas est refusée');
});
