/* Une équipe de plonge en plus (retour d'usage du 15/10 : « l'équipe de plonge
 * actuelle fait l'après-midi, je voudrais ajouter celle du matin »). Elle lave
 * comme la première équipe de la plonge, à ses heures à elle : là où des retours
 * arrivent sans équipe pour les laver. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const PC = require('../parcours.js');

const h = s => P.minutes(s);
const APREM = { id: 'pa', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '13:00', jour: 0, personnes: 3,
  pauses: [{ de: '16:00', a: '16:30' }], lots: [], regime: { actif: true, presence: 480 }, plafond: 0, parVol: true,
  durees: { '*': 30, AF: 40 }, tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }, { nom: 'Tunnel 2', debit: 300, personnes: 2, actif: true, vitesse: 2 }] };
const etat = (...ateliers) => ({ ateliers: [{ id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '04:00', jour: 0, personnes: 2, pauses: [], lots: [] }, ...ateliers] });

test('elle lave comme la première équipe : même façon, mêmes tunnels, mêmes temps, même effectif et même poste', () => {
  const st = etat(APREM);
  const a = PC.equipePlongeEnPlus(st, 'plonge', 'Plonge', { retours: [h('06:40'), h('09:00'), h('14:00')] });
  assert.equal(a.type, 'lavage');
  assert.equal(a.service, 'plonge');
  assert.notEqual(a.id, APREM.id);
  assert.deepEqual([a.parVol, a.durees, a.tunnels, a.plafond, a.personnes, a.regime], [true, APREM.durees, APREM.tunnels, 0, 3, APREM.regime]);
  // Ses arrêts programmés sont à l'heure de l'autre équipe : ils ne la suivent pas.
  assert.deepEqual([a.pauses, a.lots], [[], []]);
  // Une copie : la régler ne touche pas l'équipe de l'après-midi.
  a.tunnels[0].nom = 'Autre'; a.durees.AF = 99;
  assert.equal(APREM.tunnels[0].nom, 'Tunnel 1');
  assert.equal(APREM.durees.AF, 40);
});

test('elle commence au premier retour sans équipe (au quart d’heure), et son nom dit son moment', () => {
  const a = PC.equipePlongeEnPlus(etat(APREM), 'plonge', 'Plonge', { retours: [h('14:00'), h('09:00'), h('06:40')] });
  assert.deepEqual([a.debut, a.jour, a.nom], ['06:30', 0, 'Plonge matin']);
});

test('tous les retours ont leur équipe : la nouvelle se place juste avant la première', () => {
  const a = PC.equipePlongeEnPlus(etat(APREM), 'plonge', 'Plonge', { retours: [h('14:00'), h('20:30')] });
  assert.deepEqual([a.debut, a.jour, a.nom], ['05:00', 0, 'Plonge matin']);
  // Sans retours connus, pareil.
  assert.equal(PC.equipePlongeEnPlus(etat(APREM), 'plonge', 'Plonge').debut, '05:00');
});

test('le poste de la maison compte quand l’équipe n’en fixe pas ; la veille et le lendemain se disent par le jour', () => {
  const soir = { ...APREM, debut: '06:00', regime: { actif: true } };
  // Présence de la maison : 7 h. Les retours tardifs (J 23:20) sont sans équipe.
  const a = PC.equipePlongeEnPlus(etat(soir), 'plonge', 'Plonge', { retours: [h('07:00'), h('23:20')], regime: { presence: 420 } });
  assert.deepEqual([a.debut, a.jour, a.nom], ['23:15', 0, 'Plonge nuit']);
  // Avant la première, quand elle commence tôt : la veille (J-1).
  const b = PC.equipePlongeEnPlus(etat({ ...APREM, debut: '03:00' }), 'plonge', 'Plonge', {});
  assert.deepEqual([b.debut, b.jour, b.nom], ['19:00', -1, 'Plonge soir']);
});

test('un nom libre dans le service, et une équipe sans fin de poste couvre tout ce qui suit', () => {
  const deja = { ...APREM, id: 'pm', nom: 'Plonge matin', debut: '05:00' };
  const a = PC.equipePlongeEnPlus(etat(APREM, deja), 'plonge', 'Plonge', { retours: [h('03:10')] });
  assert.deepEqual([a.debut, a.nom], ['03:00', 'Plonge nuit']);
  // « Plonge matin » est pris : la deuxième du matin s'appelle « Plonge matin 2 ».
  const court = { ...deja, debut: '08:00', regime: { actif: true, presence: 120 } };
  const b = PC.equipePlongeEnPlus(etat(APREM, court), 'plonge', 'Plonge', { retours: [h('09:10'), h('10:40')] });
  assert.deepEqual([b.debut, b.nom], ['10:30', 'Plonge matin 2']);
  // Tout est couvert de 05:00 à 21:00 : elle se place avant la première, la veille au soir.
  assert.deepEqual(['debut', 'jour', 'nom'].map(k => PC.equipePlongeEnPlus(etat(APREM, deja), 'plonge', 'Plonge', { retours: [h('09:10')] })[k]), ['21:00', -1, 'Plonge soir']);
  const sansFin = { ...APREM, debut: '10:00', regime: { actif: false } };
  assert.equal(PC.equipePlongeEnPlus(etat(sansFin), 'plonge', 'Plonge', { retours: [h('23:50')] }).debut, '02:00', 'rien n’est sans équipe après 10:00 : avant elle');
});

test('la plonge au débit : elle reprend le débit de ses tunnels ; une plonge sans équipe en reçoit une neuve', () => {
  const debit = { ...APREM, parVol: undefined, durees: undefined, plafond: 500 };
  delete debit.parVol; delete debit.durees;
  const a = PC.equipePlongeEnPlus(etat(debit), 'plonge', 'Plonge', {});
  assert.equal(a.parVol, undefined);
  assert.equal(a.durees, undefined);
  assert.deepEqual([a.plafond, a.tunnels.map(t => t.debit)], [500, [300, 300]]);
  const neuve = PC.equipePlongeEnPlus(etat(), 'plonge', 'Plonge', {});
  assert.deepEqual([neuve.type, neuve.debut, neuve.tunnels.length], ['lavage', '06:00', 1]);
});

test('le calcul : le matin et l’après-midi se partagent les retours, chaque vol est lavé une fois', () => {
  const VOLS = ['06:00', '07:00', '12:00', '16:00'].map((t, i) => ({ id: 'AF' + i, cie: 'AF', sens: 'DEP', std: h(t), bc: 0, pc: 0, yc: 100 }));
  const materiel = { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } };
  const retours = P.retoursDeVols(VOLS, materiel).map(r => r.t);
  const matin = PC.equipePlongeEnPlus(etat(APREM), 'plonge', 'Plonge', { retours });
  assert.equal(matin.debut, '06:30', 'au premier retour, qui attendait l’après-midi');
  const r = P.simuler({ vols: VOLS, liaisons: [], rendement: 1, ateliers: [APREM, matin], materiel });
  const laves = r.lots.filter(l => l.retourVol && l.fin != null);
  assert.equal(laves.length, 4);
  assert.equal(new Set(laves.map(l => l.vol)).size, 4);
  assert.deepEqual([...new Set(laves.map(l => l.atelier))].sort(), [matin.id, 'pa'].sort(), 'les deux équipes lavent');
  assert.equal(r.plonge.tunnels, 2, 'deux tunnels, partagés par les deux équipes');
});
