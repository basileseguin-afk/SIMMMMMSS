/* Banc d'essai, évolution 4 — le handling 24 h/24 calcule son nombre de
 * chauffeurs au plus juste (v1) : le besoin (les tournées placées dans leurs
 * fenêtres), les vacations (le moins possible), la vérification (la journée
 * jouée avec ce plan). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, p) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...p });
const BAREME = { prepa: { '*/YC': 10 } };
const prepa = vols => ({ id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '00:00', jour: -1, personnes: 20, pauses: [],
  lots: [...new Set(vols.filter(v => v.sens === 'DEP').map(v => v.cie + '/YC'))].map(id => [id]), regime: { actif: false } });
const handling = (p, ch) => ({ id: 'ha', nom: 'Handling', service: 'handling', type: 'handling', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [],
  regime: { actif: true }, durees: { '*': 20 }, allers: { '*': 10 }, retours: { '*': 10 }, avance: 180, handling24h: true,
  chauffeurs: { long: 2, court: 1, mode: 'calcules', ...ch }, ...p });
const jouer = (ha, vols, args = {}) => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
  ateliers: [prepa(vols), ha], ...args });
const plan = r => r.ateliers.find(a => a.id === 'ha').planChauffeurs;
const vue = r => r.ateliers.find(a => a.id === 'ha');

/** Une journée fictive chargée : n départs de 05:00 à 23:00, quatre compagnies, des escales, un long courrier, des VL. */
function journee(n, graine = 1) {
  let x = graine;
  const alea = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const cies = ['NORD', 'SUD', 'EST', 'OUEST'];
  return Array.from({ length: n }, (_, i) => dep('V' + i, cies[Math.floor(alea() * 4)], P.hhmm(300 + Math.floor(alea() * 1080))));
}
const handlingCharge = (p, ch) => handling({ longs: ['NORD'], vl: ['SUD'], escale: { '*': 90, NORD: 150 }, durees: { '*': 25 }, allers: { '*': 15 },
  retours: { '*': 15 }, ...p }, ch);

test('des tournées qui ne se chevauchent jamais demandent un seul chauffeur', () => {
  const vols = [dep('NO1', 'NORD', '08:00'), dep('NO2', 'NORD', '09:00'), dep('NO3', 'NORD', '10:00'), dep('NO4', 'NORD', '11:00')];
  const r = jouer(handling(), vols);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const pl = plan(r);
  assert.deepEqual([pl.chauffeurs, pl.total], [{ camion: 1, vl: 0 }, 1]);
  assert.equal(pl.vacations.length, 1);
  assert.equal(pl.borneBasse.total, 1);
  assert.ok(r.vols.every(v => v.aHeure), 'tous chargés à l’heure');
  assert.equal(new Set(vue(r).tournees.flatMap(t => t.conducteurs)).size, 1, 'le même chauffeur pour les quatre');
});

test('deux tournées long courrier en même temps en demandent quatre', () => {
  // Fenêtre de chargement réduite à un instant : départ − 80 min au plus tôt, − 60 min au plus tard, 20 min pour charger.
  const vols = [dep('NO1', 'NORD', '10:00'), dep('NO2', 'NORD', '10:00')];
  const r = jouer(handling({ longs: ['NORD'], avance: 80 }), vols);
  const pl = plan(r);
  assert.equal(pl.chauffeurs.camion, 4);
  assert.equal(pl.borneBasse.camion.pic, 4);
  assert.deepEqual(vue(r).tournees.map(t => [t.depart, t.conducteurs.length]), [[h('08:30'), 2], [h('08:30'), 2]]);
  assert.ok(r.vols.every(v => v.aHeure));
});

test('enchaîner un chargement et un déchargement fait baisser le besoin', () => {
  // NO1 se charge de 08:40 à 09:00 ; l'avion de SU1 arrive à 09:05 : la même tournée peut aller le décharger.
  const vols = [dep('NO1', 'NORD', '10:00'), dep('SU1', 'SUD', '12:00')];
  const enchaine = plan(jouer(handling({ avance: 80, escale: { SUD: 175 } }), vols));
  // D'un avion à l'autre en 5 h : impossible d'enchaîner, deux tournées séparées.
  const separe = plan(jouer(handling({ avance: 80, escale: { SUD: 175 }, entreAvions: 300 }), vols));
  assert.ok(enchaine.tournees.some(t => t.charges.includes('NO1') && t.decharges.includes('SU1')));
  assert.ok(!separe.tournees.some(t => t.charges.length && t.decharges.length));
  assert.ok(enchaine.borneBasse.camion.minutes < separe.borneBasse.camion.minutes,
    enchaine.borneBasse.camion.minutes + ' minutes-chauffeur au lieu de ' + separe.borneBasse.camion.minutes);
  assert.ok(enchaine.tournees.length < separe.tournees.length);
});

test('le plan calculé ne laisse aucun vol en retard faute de chauffeur', () => {
  for (const graine of [1, 2, 3]) {
    const vols = journee(80, graine);
    const r = jouer(handlingCharge(), vols);
    assert.equal(r.ok, true);
    const sans = r.vols.filter(v => v.cause === 'chauffeur');
    assert.deepEqual(sans.map(v => v.id), [], 'graine ' + graine);
    assert.equal(plan(r).retardsChauffeur, 0);
    assert.equal(plan(r).horsVacations, 0);
  }
});

test('la borne basse ne dépasse jamais le résultat', () => {
  for (const [graine, n, ch] of [[1, 40, {}], [4, 120, {}], [5, 60, { pasDebut: 60 }], [6, 60, { debutsPossibles: ['05:00', '13:00', '21:00'] }], [7, 30, { selonPreparation: true }]]) {
    const pl = plan(jouer(handlingCharge({}, ch), journee(n, graine)));
    for (const t of ['camion', 'vl']) {
      const b = pl.borneBasse[t];
      assert.ok(b.chauffeurs <= pl.chauffeurs[t], `graine ${graine}, ${t} : borne ${b.chauffeurs} > ${pl.chauffeurs[t]}`);
      assert.equal(b.chauffeurs, Math.max(b.pic, b.parHeures, b.instants));
    }
    assert.ok(pl.borneBasse.total <= pl.total);
  }
});

test('la limite de flotte est respectée', () => {
  const vols = journee(80, 2);
  const r = jouer(handlingCharge({ camions: 6, camionsVL: 2 }), vols);
  const pl = plan(r);
  assert.ok(pl.vehiculesPlan.camion <= 6 && pl.vehiculesPlan.vl <= 2, JSON.stringify(pl.vehiculesPlan));
  assert.ok(vue(r).vehiculesMax.camion <= 6 && vue(r).vehiculesMax.vl <= 2, JSON.stringify(vue(r).vehiculesMax));
  assert.ok(!r.vols.some(v => v.cause === 'chauffeur'), 'les retards dus à la flotte ne sont pas mis sur le compte des chauffeurs');
  // Sans limite, le plan en sort davantage en même temps.
  const libre = plan(jouer(handlingCharge(), vols));
  assert.ok(libre.vehiculesPlan.camion > 6);
});

test('les vacations portent leurs pauses, prises entre deux tournées', () => {
  const r = jouer(handlingCharge(), journee(80, 1));
  const pl = plan(r);
  assert.equal(pl.presence, 480);
  assert.deepEqual(pl.pauses, [{ du: 180, duree: 15 }, { du: 375, duree: 45 }]);
  for (const d of vue(r).conducteurs.filter(c => (c.pauses || []).length)) {
    const miennes = vue(r).tournees.filter(t => t.conducteurs.includes(d.id));
    for (const p of d.pauses) {
      assert.ok(!miennes.some(t => t.depart < p.debut + p.duree - 1e-9 && t.retour > p.debut + 1e-9), d.id + ' : une pause pendant une tournée');
      const seuil = d.de + (p.duree === 15 ? 180 : 375);
      assert.ok(p.debut >= seuil - 1e-9 && p.debut <= seuil + 60 + 1e-9, d.id + ' : pause à ' + P.hhmm(p.debut));
    }
  }
});

test('des heures de début fixes : les vacations ne commencent qu’à elles', () => {
  const pl = plan(jouer(handlingCharge({}, { debutsPossibles: ['05:00', '13:00', '21:00'] }), journee(60, 3), { heuresSup: { actif: true, plafond: 180 } }));
  assert.ok(pl.vacations.every(v => ['05:00', '13:00', '21:00'].includes(v.debut)), pl.vacations.map(v => v.debut).join(' '));
  const pas = plan(jouer(handlingCharge({}, { pasDebut: 120 }), journee(60, 3)));
  assert.ok(pas.vacations.every(v => v.de % 120 === 0));
});

test('la sortie : le plan, les chauffeurs par type, les heures payées, l’occupation, les véhicules, les heures sup', () => {
  const r = jouer(handlingCharge(), journee(60, 2));
  const pl = plan(r);
  assert.equal(pl.mode, 'calcules');
  assert.equal(pl.total, pl.chauffeurs.camion + pl.chauffeurs.vl);
  assert.equal(pl.vacations.reduce((n, v) => n + v.n, 0), pl.total);
  assert.equal(pl.heuresPayees, pl.total * 480, 'les heures d’une vacation comptent le jour où elle commence');
  assert.ok(pl.occupation > 0 && pl.occupation <= 1);
  assert.deepEqual(Object.keys(pl.vehiculesMax).sort(), ['camion', 'vl']);
  assert.equal(pl.heuresSupChauffeurs, 0);
  // La journée jouée suit le plan : ses chauffeurs sont ceux des vacations, veille comprise.
  const parType = t => pl.vacations.filter(v => v.vehicule === t).reduce((n, v) => n + v.n, 0);
  assert.equal(vue(r).conducteurs.filter(d => !d.veille && d.vehicule === 'camion').length, parType('camion'));
});

test('selon la préparation : pas de tournée avant que le vol soit prêt', () => {
  const vols = [dep('NO1', 'NORD', '12:00')];
  // La commande ne sort qu'à 10:30 : la tournée part à 10:30, pas à l'ouverture (09:00 − 10).
  const tard = { id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '10:20', jour: 0, personnes: 1, pauses: [], lots: [['NORD/YC']], regime: { actif: false } };
  const jouerTard = ch => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1, ateliers: [tard, handling({}, ch)] });
  const selon = jouerTard({ selonPreparation: true }), sur = jouerTard({});
  assert.equal(plan(selon).tournees[0].depart, h('10:30'));
  assert.equal(plan(sur).tournees[0].depart, h('08:50'), 'sur les heures de vol : dès l’ouverture');
  assert.ok(selon.vols[0].aHeure && sur.vols[0].aHeure);
});

test('le mode « saisis » garde le comportement actuel ; « calculés » ne vaut qu’en 24 h/24', () => {
  const vols = journee(40, 4), cr = [{ de: '04:00', a: '23:59', n: 6 }, { de: '04:00', a: '23:59', n: 2, type: 'vl' }];
  const json = r => JSON.stringify(r, (k, v) => (typeof v === 'function' ? undefined : v));
  const sans = jouer(handlingCharge({ creneaux: cr, chauffeurs: { long: 2, court: 1 } }), vols);
  const saisis = jouer(handlingCharge({ creneaux: cr }, { mode: 'saisis' }), vols);
  assert.equal(json(saisis), json(sans));
  assert.equal(plan(sans), undefined);
  // Sans le mode 24 h/24, le handling d'avant, réglages de chauffeurs calculés ou non.
  const classique = ch => jouer(handlingCharge({ handling24h: undefined, creneaux: cr }, ch), vols);
  assert.equal(json(classique({ mode: 'calcules', pasDebut: 60 })), json(classique({})));
});

test('les mêmes entrées donnent la même journée, et vite', () => {
  const vols = journee(200, 9);
  const json = r => JSON.stringify(r, (k, v) => (typeof v === 'function' ? undefined : v));
  const t0 = Date.now();
  const a = jouer(handlingCharge(), vols);
  const ms = Date.now() - t0;
  assert.equal(json(a), json(jouer(handlingCharge(), vols)));
  assert.ok(ms < 1000, '200 vols en ' + ms + ' ms');
});

test('les réglages du calcul se gardent quand ils sont saisis, et seulement alors', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [handling({}, { mode: undefined })] };
  assert.deepEqual(A.valider(base).ateliers[0].chauffeurs, { long: 2, court: 1 });
  const lu = A.valider({ ...base, ateliers: [handling({}, { selonPreparation: true, pasDebut: '45', retardPauseMax: 500, iterationsMax: 3,
    debutsPossibles: ['22:00', '06:00', '14:00', '06:00'] })] }).ateliers[0].chauffeurs;
  assert.deepEqual(lu, { long: 2, court: 1, mode: 'calcules', selonPreparation: true, pasDebut: 45, retardPauseMax: 240, iterationsMax: 3,
    debutsPossibles: ['06:00', '14:00', '22:00'] });
  assert.throws(() => A.valider({ ...base, ateliers: [handling({}, { debutsPossibles: ['midi'] })] }));
  assert.deepEqual(A.valider({ ...base, ateliers: [handling({}, { mode: 'autre' })] }).ateliers[0].chauffeurs, { long: 2, court: 1 });
});

test('le banc force le calcul par « equipes », comme une saisie', () => {
  const J = require('../moteur/journee.js');
  const s = require('./non-regression.attendu.json').scenarios.find(x => x.nom === 'unite-vol');
  const r = J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, { ...s.options,
    equipes: { h: { handling24h: true, escale: { '*': 90 }, chauffeurs: { mode: 'calcules', pasDebut: 60 } } } }));
  const pl = r.ateliers.find(a => a.id === 'h').planChauffeurs;
  assert.equal(pl.mode, 'calcules');
  assert.ok(pl.total > 0 && pl.vacations.every(v => v.de % 60 === 0));
  assert.ok(pl.borneBasse.total <= pl.total);
  assert.deepEqual(r.vols.filter(v => v.cause === 'chauffeur').map(v => v.id), []);
});

test('Excel : les réglages du calcul n’ont pas de colonne, l’import les garde', async () => {
  const T = require('../tableur.js'), E = require('../echanges.js');
  const CTX = { services: [{ id: 'prepa', nom: 'MONTAGE' }, { id: 'handling', nom: 'HANDLING' }], programme: [], classes: [] };
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [A.valider({ schema: 'ory-ateliers', version: 1,
    ateliers: [handling({ escale: { '*': 90 } }, { selonPreparation: true, debutsPossibles: ['06:00', '14:00', '22:00'], iterationsMax: 3 })] }).ateliers[0]] };
  const f = await T.lireClasseur(T.ecrireClasseur(E.ateliersVersClasseur(etat, CTX)));
  const relu = A.valider(E.classeurVersAteliers(f, etat, CTX).etat).ateliers[0];
  assert.deepEqual(relu.chauffeurs, etat.ateliers[0].chauffeurs);
  // Les chauffeurs par camion se modifient toujours dans la feuille Ateliers ; le reste est gardé.
  const g = f.map(x => (x.nom === 'Ateliers' ? { ...x, lignes: x.lignes.map((l, i) => (i ? Object.assign(l.slice(), { [x.lignes[0].indexOf('Chauffeurs long courrier')]: 3 }) : l)) } : x));
  assert.deepEqual(A.valider(E.classeurVersAteliers(g, etat, CTX).etat).ateliers[0].chauffeurs, { ...etat.ateliers[0].chauffeurs, long: 3 });
});
