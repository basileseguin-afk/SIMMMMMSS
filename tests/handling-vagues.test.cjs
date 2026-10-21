/* Banc d'essai, évolution 8 — le handling 24 h/24 par vagues (v1) : le
 * véhicule selon l'heure de départ, plusieurs vols par tournée (y compris dans
 * le plan des chauffeurs), l'échange sur le même avion par compagnie, des
 * durées par type de véhicule (docs/BANC_ESSAI.md § 3 et § 4). Tout se règle
 * dans la fiche du handling ; sans ces réglages, la journée d'avant. Vols,
 * compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, p) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...p });
// Une prépa nombreuse : les commandes sont prêtes dès la nuit.
const BAREME = { prepa: { '*/YC': 10 } };
const prepa = vols => ({ id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '00:00', jour: -1, personnes: 20, pauses: [],
  lots: [...new Set(vols.filter(v => v.sens === 'DEP').map(v => v.cie + '/YC'))].map(id => [id]), regime: { actif: false } });
const handling = p => ({ id: 'ha', nom: 'Handling', service: 'handling', type: 'handling', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [],
  regime: { actif: true }, durees: { '*': 20 }, allers: { '*': 10 }, retours: { '*': 10 }, simultanes: 20, avance: 180, handling24h: true, ...p });
const calcules = (p, ch) => handling({ chauffeurs: { long: 2, court: 1, mode: 'calcules', ...ch }, ...p });
const jouer = (ha, vols, args = {}) => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
  ateliers: [prepa(vols), ha], ...args });
const vue = r => r.ateliers.find(a => a.id === 'ha');
const vol = (r, id) => r.vols.find(v => v.id === id);
const json = x => JSON.stringify(x, (k, v) => (typeof v === 'function' ? undefined : v));
const etapes = t => t.etapes.map(e => e.etape + (e.vol ? ' ' + e.vol : ''));

/* ---- a. Le véhicule selon l'heure de départ ------------------------------ */

test('VL à partir de 10:00 : le départ de 08:00 part en gros camion, celui de 14:00 en VL', () => {
  const vols = [dep('SU1', 'SUD', '08:00'), dep('SU2', 'SUD', '14:00'), dep('NO1', 'NORD', '14:00')];
  const r = jouer(handling({ vlDes: { SUD: '10:00' } }), vols);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.deepEqual(r.vols.map(v => [v.id, v.vehicule, v.aHeure]), [['SU1', 'camion', true], ['NO1', 'camion', true], ['SU2', 'vl', true]]);
  assert.deepEqual(vue(r).tournees.map(t => [t.charges.join(), t.vehicule]), [['SU1', 'camion'], ['NO1', 'camion'], ['SU2', 'vl']]);
  // L'heure du départ, sur l'horloge : 10:00 pile en VL, 09:59 en camion ; la nuit, après minuit, en camion.
  assert.deepEqual(['09:59', '10:00', '23:30', '00:30'].map(t => P.vehiculeDe({ vlDes: { SUD: '10:00' } }, 'sud', h(t))), ['camion', 'vl', 'vl', 'camion']);
  assert.equal(P.vehiculeDe({ vlDes: { SUD: '10:00' } }, 'SUD', h('09:00') - 1440), 'camion', 'un départ de la veille : son heure sur l’horloge');
  // La liste `vl` garde son sens : VL toute la journée (elle l'emporte).
  assert.deepEqual(['08:00', '14:00'].map(t => P.vehiculeDe({ vl: ['SUD'], vlDes: { SUD: '10:00' } }, 'SUD', h(t))), ['vl', 'vl']);
  assert.deepEqual(r.vols.map(v => v.id), jouer(handling({ vl: ['SUD'] }), vols).vols.map(v => v.id));
  assert.ok(jouer(handling({ vl: ['SUD'] }), vols).vols.filter(v => v.cie === 'SUD').every(v => v.vehicule === 'vl'));
});

test('VL à partir d’une heure : chaque départ prend les chauffeurs et la flotte de son véhicule', () => {
  const vols = [dep('SU1', 'SUD', '08:00'), dep('SU2', 'SUD', '14:00')];
  // Des créneaux saisis : un chauffeur de gros camion le matin, un de VL l'après-midi.
  const cr = [{ de: '04:00', a: '10:00', n: 1 }, { de: '10:00', a: '16:00', n: 1, type: 'vl' }];
  const r = jouer(handling({ vlDes: { SUD: '10:00' }, creneaux: cr }), vols);
  assert.deepEqual(r.vols.map(v => [v.id, v.vehicule, v.aHeure]), [['SU1', 'camion', true], ['SU2', 'vl', true]]);
  // Tout en VL : le départ de 08:00 n'a pas de chauffeur de VL.
  assert.equal(vol(jouer(handling({ vl: ['SUD'], creneaux: cr }), vols), 'SU1').cause, 'chauffeur');
  // Le plan calculé compte une vacation de chaque véhicule.
  const pl = vue(jouer(calcules({ vlDes: { SUD: '10:00' } }), vols)).planChauffeurs;
  assert.deepEqual(pl.chauffeurs, { camion: 1, vl: 1 });
  assert.deepEqual(pl.tournees.map(t => [t.charges.join(), t.vehicule]), [['SU1', 'camion'], ['SU2', 'vl']]);
});

test('VL à partir d’une heure : gardé seulement saisi, une heure par compagnie', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [handling({})] };
  assert.equal('vlDes' in A.valider(base).ateliers[0], false, 'rien d’enregistré sans saisie');
  const lu = A.valider({ ...base, ateliers: [handling({ vlDes: { sud: '9:30', '*': '10:00', EST: '' } })] }).ateliers[0];
  assert.deepEqual(lu.vlDes, { SUD: '09:30' }, 'en majuscules, HH:MM, ni « toutes », ni vide');
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify({ ...base, ateliers: [lu] }))).ateliers[0], lu, 'relu tel quel');
  assert.throws(() => A.valider({ ...base, ateliers: [handling({ vlDes: { SUD: 'midi' } })] }), /HH:MM/);
  assert.throws(() => A.valider({ ...base, ateliers: [handling({ vlDes: { SUD: '25:00' } })] }), /23:59/);
});

/* ---- b. Plusieurs vols par tournée ------------------------------------- */
const tournees = r => vue(r).tournees.map(t => [t.vehicule, t.charges.join('+')]);
const plan = r => vue(r).planChauffeurs;
const MATIN = ['06:00', '06:12', '06:24', '06:36', '06:48', '07:00'];

test('6 départs d’une compagnie entre 06:00 et 07:00, 3 vols par camion : 2 tournées au lieu de 6, et le plan compte leurs chauffeurs', () => {
  const vols = MATIN.map((t, i) => dep('NO' + (i + 1), 'NORD', t));
  // Sans le réglage : une tournée par vol, dans la journée jouée comme dans le plan.
  const avant = jouer(calcules({}), vols);
  assert.equal(vue(avant).tournees.length, 6);
  assert.equal(plan(avant).tournees.length, 6);
  const r = jouer(calcules({ volsCamion: { NORD: 3 } }), vols);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.deepEqual(tournees(r), [['camion', 'NO1+NO2+NO3'], ['camion', 'NO4+NO5+NO6']]);
  assert.deepEqual(plan(r).tournees.map(t => t.charges.join('+')), ['NO1+NO2+NO3', 'NO4+NO5+NO6']);
  // Une tournée : 10 min d'aller, trois chargements de 20 min, 10 min d'un avion à l'autre, 10 min de retour.
  assert.deepEqual(plan(r).tournees.map(t => t.retour - t.depart), [100, 100]);
  assert.deepEqual(etapes(vue(r).tournees[0]), ['aller', 'chargement NO1', 'trajet', 'chargement NO2', 'trajet', 'chargement NO3', 'retour']);
  // Le plan compte leurs chauffeurs : 200 minutes de tournée au lieu de 240, un chauffeur au lieu de deux.
  assert.deepEqual([plan(avant).borneBasse.camion.minutes, plan(r).borneBasse.camion.minutes], [240, 200]);
  assert.deepEqual([plan(avant).chauffeurs.camion, plan(r).chauffeurs.camion], [2, 1]);
  assert.ok(r.vols.every(v => v.aHeure), 'tous à l’heure');
  // Créneaux saisis : la journée jouée regroupe de même ; « jamais plus de 4 » : 4 par camion, 4 + 2.
  assert.deepEqual(tournees(jouer(handling({ volsCamion: { NORD: 3 } }), vols)), [['camion', 'NO1+NO2+NO3'], ['camion', 'NO4+NO5+NO6']]);
  assert.deepEqual(tournees(jouer(calcules({ volsParCamion: 4 }), vols)).map(t => t[1]), ['NO1+NO2+NO3+NO4', 'NO5+NO6']);
});

const APRES_MIDI = ['14:00', '14:10', '14:20', '14:30', '14:40', '14:50', '15:00', '15:10', '15:20'];
const vl9 = p => ({ vl: ['EQUI'], volsVL: { EQUI: 9 }, durees: { '*': 20, EQUI: 5 }, ...p });

test('9 départs l’après-midi en une vague, 9 vols par VL : une seule tournée si toutes les limites tiennent', () => {
  const vols = APRES_MIDI.map((t, i) => dep('EQ' + (i + 1), 'EQUI', t));
  const r = jouer(calcules(vl9()), vols);
  assert.deepEqual(tournees(r), [['vl', 'EQ1+EQ2+EQ3+EQ4+EQ5+EQ6+EQ7+EQ8+EQ9']]);
  assert.deepEqual(plan(r).tournees.map(t => [t.vehicule, t.charges.length]), [['vl', 9]]);
  assert.deepEqual(plan(r).chauffeurs, { camion: 0, vl: 1 });
  assert.ok(r.vols.every(v => v.aHeure && v.tournee === 1));
  // La tournée sert les départs dans leur ordre, de l'un à l'autre en `entreAvions`.
  assert.deepEqual(vue(r).tournees[0].etapes.filter(e => e.etape === 'chargement').map(e => e.vol), vols.map(v => v.id));
  assert.ok(vue(r).tournees[0].etapes.filter(e => e.etape === 'trajet').every(e => e.a - e.de === 10));
  // Sans plan (créneaux saisis) : la même tournée.
  assert.deepEqual(tournees(jouer(handling(vl9()), vols)), tournees(r));
  // `volsVL` vaut pour le VL, `volsCamion` pour le gros camion ; sans `volsVL`, le VL sert autant de vols que le camion.
  assert.equal(vue(jouer(calcules(vl9({ volsVL: undefined })), vols)).tournees.length, 9);
  assert.equal(vue(jouer(calcules(vl9({ volsVL: undefined, volsCamion: { EQUI: 3 } })), vols)).tournees.length, 3);
  assert.equal(vue(jouer(calcules(vl9({ volsCamion: { EQUI: 2 } })), vols)).tournees.length, 1);
});

test('un vol qui ne tiendrait pas sa limite part dans une autre tournée', () => {
  // EQ9 part à 18:30 : servi avec les autres, il le serait trop tôt (avant `avance`) ou eux trop tard.
  const vols = APRES_MIDI.slice(0, 8).map((t, i) => dep('EQ' + (i + 1), 'EQUI', t)).concat([dep('EQ9', 'EQUI', '18:30')]);
  const r = jouer(calcules(vl9()), vols);
  assert.deepEqual(tournees(r), [['vl', 'EQ1+EQ2+EQ3+EQ4+EQ5+EQ6+EQ7+EQ8'], ['vl', 'EQ9']]);
  assert.deepEqual(plan(r).tournees.map(t => t.charges.length), [8, 1]);
  assert.ok(r.vols.every(v => v.aHeure));
  // Dans la journée jouée sans plan : un vol que la tournée chargerait après sa limite n'en est pas. Les commandes sont prêtes
  // à 04:40 : NO1 (06:00) est déjà en retard ; NO2 (06:20), servi après lui, le serait aussi ; seul, il est à l'heure.
  const deux = [dep('NO1', 'NORD', '06:00'), dep('NO2', 'NORD', '06:20')];
  const tard = P.simuler({ vols: deux, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
    ateliers: [{ ...prepa(deux), debut: '04:30', jour: 0 }, handling({ volsCamion: { NORD: 2 } })] });
  assert.deepEqual(tournees(tard), [['camion', 'NO1'], ['camion', 'NO2']]);
  assert.deepEqual(tard.vols.map(v => [v.id, v.aHeure]), [['NO1', false], ['NO2', true]]);
});

test('une vague du plan attend ses vols pas encore prêts, tant que les autres restent à l’heure ; sinon elle part sans eux', () => {
  // EQ5 a aussi une cabine BC, que la prépa BC ne finit qu'à 13:30 : le plan (qui ne regarde que les heures de vol) le met
  // dans la vague ; la journée jouée l'attend tant qu'elle peut, puis part sans lui.
  const vols = APRES_MIDI.map((t, i) => dep('EQ' + (i + 1), 'EQUI', t, i === 4 ? { bc: 10 } : {}));
  const pb = { id: 'pb', nom: 'Prépa BC', service: 'prepa', type: 'manuel', debut: '12:30', jour: 0, personnes: 1, pauses: [], lots: [['EQUI/BC']], regime: { actif: false } };
  const r = P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: { prepa: { '*/YC': 10, '*/BC': 60 } }, rendement: 1,
    ateliers: [{ ...prepa(vols), lots: [['EQUI/YC']] }, pb, calcules(vl9())] });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.deepEqual(plan(r).tournees.map(t => t.charges.length), [9]);
  const [t1, t2] = vue(r).tournees;
  assert.equal(t1.charges.join('+'), 'EQ1+EQ2+EQ3+EQ4+EQ6+EQ7+EQ8+EQ9');
  assert.ok(t1.depart > plan(r).tournees[0].depart, 'elle a attendu EQ5');
  assert.ok(r.vols.filter(v => v.id !== 'EQ5').every(v => v.aHeure), 'sans mettre les autres en retard');
  assert.deepEqual(t2.charges, ['EQ5']);
  assert.ok(t2.depart >= vol(r, 'EQ5').pret - 1e-9);
  // Tous prêts à temps : la vague part à l'heure du plan, avec tous ses vols.
  const tot = P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: { prepa: { '*/YC': 10, '*/BC': 60 } }, rendement: 1,
    ateliers: [{ ...prepa(vols), lots: [['EQUI/YC']] }, { ...pb, debut: '08:00' }, calcules(vl9())] });
  assert.deepEqual(vue(tot).tournees.map(t => [t.depart, t.charges.length]), [[plan(tot).tournees[0].depart, 9]]);
});

test('on ne regroupe pas si cela fait monter les minutes-chauffeur', () => {
  // D'un avion à l'autre en 60 min, pour 10 min d'aller et 10 de retour : trois tournées de 40 min coûtent moins.
  const vols = MATIN.slice(0, 3).map((t, i) => dep('NO' + (i + 1), 'NORD', t));
  for (const ha of [calcules({ volsCamion: { NORD: 3 }, entreAvions: 60 }), handling({ volsCamion: { NORD: 3 }, entreAvions: 60 })]) {
    const r = jouer(ha, vols);
    assert.deepEqual(tournees(r).map(t => t[1]), ['NO1', 'NO2', 'NO3']);
  }
  // La préparation au quai se compte une fois par tournée, plus `quaiParVol` par vol de plus.
  const quai = jouer(calcules({ volsCamion: { NORD: 3 }, quaiDepart: { '*': 15 }, quaiParVol: { NORD: 4 } }), vols);
  assert.deepEqual(tournees(quai).map(t => t[1]), ['NO1+NO2+NO3']);
  assert.deepEqual(vue(quai).tournees[0].etapes.filter(e => e.etape === 'quai-depart').map(e => e.a - e.de), [15 + 2 * 4]);
  assert.equal(plan(quai).tournees[0].retour - plan(quai).tournees[0].depart, 23 + 10 + 3 * 20 + 2 * 10 + 10);
  // Un quai par vol trop long : chacun sa tournée.
  assert.equal(vue(jouer(calcules({ volsCamion: { NORD: 3 }, quaiParVol: { '*': 40 } }), vols)).tournees.length, 3);
});

test('une vague ne mélange ni les compagnies, ni les véhicules', () => {
  // NORD part en VL à partir de 06:30 : NO1 à NO3 en gros camion, NO4 à NO6 en VL ; SUD a sa propre tournée.
  const vols = MATIN.map((t, i) => dep('NO' + (i + 1), 'NORD', t)).concat([dep('SU1', 'SUD', '06:10')]);
  const r = jouer(calcules({ volsParCamion: 6, volsVL: { '*': 6 }, vlDes: { NORD: '06:30' } }), vols);
  assert.deepEqual(tournees(r).sort(), [['camion', 'NO1+NO2+NO3'], ['camion', 'SU1'], ['vl', 'NO4+NO5+NO6']]);
});

test('en escale courte : pour chaque avion, décharger puis charger, puis passer au suivant', () => {
  // Deux avions qui n'ont que 30 min d'escale : un échange chacun. Une tournée les sert tous les deux.
  const vols = [dep('NO1', 'NORD', '10:00'), dep('NO2', 'NORD', '10:40')];
  const r = jouer(calcules({ escale: { NORD: 30 }, volsCamion: { NORD: 2 }, dechargement: { '*': 10 }, quaiRetour: { '*': 15 } }), vols);
  assert.deepEqual(tournees(r), [['camion', 'NO1+NO2']]);
  const t = vue(r).tournees[0];
  assert.deepEqual(etapes(t), ['aller', 'dechargement NO1', 'chargement NO1', 'trajet', 'dechargement NO2', 'chargement NO2', 'retour', 'quai-retour']);
  assert.equal(t.echange, true);
  assert.equal(t.etapes.find(e => e.etape === 'quai-retour').a - t.etapes.find(e => e.etape === 'quai-retour').de, 15, 'le vidage, une fois');
  assert.ok(r.vols.every(v => v.aHeure && v.escaleCourte && v.dechargement.tournee === 1));
});

test('la borne basse ne dépasse jamais le résultat ; les mêmes entrées donnent la même journée, et vite', () => {
  let x = 7;
  const alea = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const cies = ['NORD', 'SUD', 'EST', 'OUEST'];
  const journee = n => Array.from({ length: n }, (_, i) => dep('V' + i, cies[Math.floor(alea() * 4)], P.hhmm(300 + Math.floor(alea() * 1080))));
  const ha = () => calcules({ longs: ['NORD'], vlDes: { SUD: '12:00' }, vl: ['EST'], escale: { '*': 90, NORD: 150 }, durees: { '*': 25, EST: 8 },
    allers: { '*': 15 }, retours: { '*': 15 }, volsCamion: { '*': 3, NORD: 2 }, volsVL: { '*': 6 }, quaiDepart: { '*': 10 }, quaiParVol: { '*': 3 } });
  for (const n of [40, 80, 120]) {
    const r = jouer(ha(), journee(n)), pl = plan(r);
    assert.ok(vue(r).tournees.some(t => t.charges.length > 1), 'des vagues');
    for (const t of ['camion', 'vl']) assert.ok(pl.borneBasse[t].chauffeurs <= pl.chauffeurs[t], n + ' vols, ' + t + ' : borne ' + pl.borneBasse[t].chauffeurs + ' > ' + pl.chauffeurs[t]);
    assert.deepEqual(r.vols.filter(v => v.cause === 'chauffeur').map(v => v.id), [], n + ' vols : aucun retard faute de chauffeur');
  }
  const vols = journee(200);
  const t0 = Date.now();
  const a = jouer(ha(), vols);
  const ms = Date.now() - t0;
  assert.equal(json(a), json(jouer(ha(), vols)));
  assert.ok(ms < 1500, '200 vols en ' + ms + ' ms');
});

test('vols par VL et quai par vol : gardés seulement saisis', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [handling({})] };
  const lu0 = A.valider(base).ateliers[0];
  for (const k of ['volsVL', 'quaiParVol']) assert.equal(k in lu0, false, k + ' : rien d’enregistré sans saisie');
  const lu = A.valider({ ...base, ateliers: [handling({ volsVL: { equi: 9, '*': 50, SUD: 0, EST: '' }, quaiParVol: { '*': 2.5, NORD: 2000 } })] }).ateliers[0];
  assert.deepEqual([lu.volsVL, lu.quaiParVol], [{ EQUI: 9, '*': 20, SUD: 1 }, { '*': 2.5, NORD: 1440 }]);
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify({ ...base, ateliers: [lu] }))).ateliers[0], lu, 'relu tel quel');
  assert.deepEqual([P.volsParTourneeDe(lu, 'equi', 'vl'), P.volsParTourneeDe(lu, 'NORD', 'vl'), P.volsParTourneeDe(lu, 'NORD', 'camion')], [9, 20, 1]);
});

/* ---- Excel et options du banc ------------------------------------------ */
const T = require('../tableur.js');
const E = require('../echanges.js');
const J = require('../moteur/journee.js');
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));
const CTX = { services: [{ id: 'prepa', nom: 'MONTAGE' }, { id: 'handling', nom: 'HANDLING' }], programme: [], classes: [] };
const etatAvec = ha => ({ schema: 'ory-ateliers', version: 1, ateliers: [A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [ha] }).ateliers[0]] });
const entetes = f => f.find(x => x.nom === 'Handling').lignes[0];

test('Excel : sans ces réglages, le classeur d’avant', () => {
  const f = E.ateliersVersClasseur(etatAvec(handling({ escale: { '*': 90 }, vl: ['SUD'] })), CTX);
  assert.deepEqual(entetes(f).slice(7), ['Escale (min)', 'Préparation au quai (min)', 'Déchargement (min)', 'Vidage au quai (min)', 'Véhicule']);
  assert.ok(!f.find(x => x.nom === 'Lisez-moi').lignes.flat().join(' ').includes('VL à partir de'));
});

test('Excel : « VL à partir de » fait l’aller-retour, et se modifie', async () => {
  const etat = etatAvec(handling({ escale: { '*': 90 }, vlDes: { SUD: '10:00' } }));
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const col = entetes(f).indexOf('VL à partir de');
  assert.ok(col > 0);
  assert.deepEqual(f.find(x => x.nom === 'Handling').lignes.find(l => l[1] === 'SUD')[col], '10:00');
  assert.match(f.find(x => x.nom === 'Lisez-moi').lignes.flat().join(' '), /VL à partir de/);
  assert.deepEqual(A.valider(E.classeurVersAteliers(f, etat, CTX).etat).ateliers[0], etat.ateliers[0], 'rien de perdu');
  // Dans Excel : SUD à partir de 11:30, NORD à partir de 15:00 (une heure Excel : une fraction de jour).
  const g = modifier(f, 'Handling', l => l.map((x, i) => (x[1] === 'SUD' ? Object.assign(x, { [col]: '11:30' }) : x))
    .concat([Object.assign(Array(l[0].length).fill(null), { 0: 'Handling', 1: 'NORD', [col]: 15 / 24 })]));
  assert.deepEqual(A.valider(E.classeurVersAteliers(await parFichier(g), etat, CTX).etat).ateliers[0].vlDes, { SUD: '11:30', NORD: '15:00' });
  // Colonne vidée : plus de VL à partir d'une heure ; sur la ligne « toutes » : refusé.
  const vide = modifier(f, 'Handling', l => l.map((x, i) => (i ? Object.assign(x, { [col]: null }) : x)));
  assert.equal('vlDes' in A.valider(E.classeurVersAteliers(await parFichier(vide), etat, CTX).etat).ateliers[0], false);
  const toutes = modifier(f, 'Handling', l => l.map((x, i) => (x[1] === 'toutes' ? Object.assign(x, { [col]: '10:00' }) : x)));
  assert.throws(() => E.classeurVersAteliers(toutes, etat, CTX), /propre à une compagnie/);
  // Sans la colonne : la valeur du site reste.
  const sans = modifier(f, 'Handling', l => l.map(x => x.filter((_, i) => i !== col)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(await parFichier(sans), etat, CTX).etat).ateliers[0].vlDes, { SUD: '10:00' });
});

test('Excel : « Vols par VL » et « Quai par vol en plus » font l’aller-retour, et se modifient', async () => {
  const etat = etatAvec(handling({ vl: ['EQUI'], volsVL: { EQUI: 9 }, quaiParVol: { '*': 2 }, volsCamion: { NORD: 3 } }));
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const cv = entetes(f).indexOf('Vols par VL'), cq = entetes(f).indexOf('Quai par vol en plus (min)');
  assert.ok(cv > 0 && cq > 0);
  const lignes = f.find(x => x.nom === 'Handling').lignes;
  assert.deepEqual([lignes.find(l => l[1] === 'EQUI')[cv], lignes.find(l => l[1] === 'toutes')[cq]], [9, 2]);
  assert.deepEqual(A.valider(E.classeurVersAteliers(f, etat, CTX).etat).ateliers[0], etat.ateliers[0], 'rien de perdu');
  const g = modifier(f, 'Handling', l => l.map(x => (x[1] === 'EQUI' ? Object.assign(x, { [cv]: 6, [cq]: 1.5 }) : x)));
  const relu = A.valider(E.classeurVersAteliers(await parFichier(g), etat, CTX).etat).ateliers[0];
  assert.deepEqual([relu.volsVL, relu.quaiParVol], [{ EQUI: 6 }, { '*': 2, EQUI: 1.5 }]);
  assert.throws(() => E.classeurVersAteliers(modifier(f, 'Handling', l => l.map(x => (x[1] === 'EQUI' ? Object.assign(x, { [cv]: 0 }) : x))), etat, CTX), /Vols par VL : 1 ou plus/);
  assert.throws(() => E.classeurVersAteliers(modifier(f, 'Handling', l => l.map(x => (x[1] === 'EQUI' ? Object.assign(x, { [cq]: -1 }) : x))), etat, CTX), /Quai par vol en plus/);
});

test('le banc force « VL à partir de » par « equipes », comme une saisie', () => {
  const s = require('./non-regression.attendu.json').scenarios.find(x => x.nom === 'unite-vol');
  const jouerAvec = force => J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, { ...s.options, equipes: { h: { handling24h: true, ...force } } }));
  const cies = [...new Set(jouerAvec({}).vols.map(v => v.cie))];
  const r = jouerAvec({ vlDes: Object.fromEntries(cies.map(c => [c, '12:00'])) });
  assert.equal(r.ok, true);
  assert.ok(r.vols.length > 0 && r.vols.every(v => v.vehicule === ((v.depart % 1440 + 1440) % 1440 >= 720 ? 'vl' : 'camion')));
  assert.throws(() => jouerAvec({ vlDes: { [cies[0]]: 'midi' } }), /HH:MM/);
  // Les vagues : plusieurs vols par tournée, aussi dans le plan des chauffeurs.
  const avant = jouerAvec({ escale: { '*': 90 }, chauffeurs: { mode: 'calcules' }, volsParCamion: 1 });
  const v = jouerAvec({ escale: { '*': 90 }, chauffeurs: { mode: 'calcules' }, volsCamion: { '*': 3 }, volsVL: { '*': 3 }, quaiParVol: { '*': 2 } });
  const t = r => r.ateliers.find(a => a.id === 'h').planChauffeurs.tournees;
  assert.ok(t(avant).every(x => x.charges.length === 1));
  assert.ok(t(v).some(x => x.charges.length > 1) && t(v).length < t(avant).length);
  assert.throws(() => jouerAvec({ volsVL: { [cies[0]]: 'neuf' } }), /volsVL/);
});
