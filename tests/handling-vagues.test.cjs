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

test('le banc force « VL à partir de » par « equipes », comme une saisie', () => {
  const s = require('./non-regression.attendu.json').scenarios.find(x => x.nom === 'unite-vol');
  const jouerAvec = force => J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, { ...s.options, equipes: { h: { handling24h: true, ...force } } }));
  const cies = [...new Set(jouerAvec({}).vols.map(v => v.cie))];
  const r = jouerAvec({ vlDes: Object.fromEntries(cies.map(c => [c, '12:00'])) });
  assert.equal(r.ok, true);
  assert.ok(r.vols.length > 0 && r.vols.every(v => v.vehicule === ((v.depart % 1440 + 1440) % 1440 >= 720 ? 'vl' : 'camion')));
  assert.throws(() => jouerAvec({ vlDes: { [cies[0]]: 'midi' } }), /HH:MM/);
});
