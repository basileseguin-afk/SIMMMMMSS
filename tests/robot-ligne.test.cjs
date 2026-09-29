/* La ligne robot (retour d'usage du 29/09) : « une seule ligne physique,
 * partagée par l'équipe robot du matin et celle de l'après-midi, avec une
 * pause entre 12:15 et 13:00 ». Deux cases Robot du même service ne font pas
 * deux robots : un lot à la fois sur la ligne. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const VOLS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: h('20:00'), bc: 0, pc: 0, yc: 120 },
  { id: 'TX1', cie: 'TX', sens: 'DEP', std: h('21:00'), bc: 0, pc: 0, yc: 60 }
];
// 60 plateaux/h : AF (120) prend 120 min, TX (60) prend 60 min.
const robot = (id, debut, lots, p) => ({ id, nom: id, service: 'robot', type: 'robot', debut, jour: 0, personnes: 4, personnesMin: 1,
  debit: 60, lots, pauses: [], regime: { actif: false }, ...p });
const jouer = ateliers => P.simuler({ vols: VOLS, liaisons: [], bareme: {}, rendement: 1, ateliers });
const lot = (r, at) => r.lots.find(l => l.atelier === at);

test('deux équipes robot, une seule ligne : la seconde attend que la ligne se libère', () => {
  const r = jouer([robot('matin', '06:00', [['AF/YC']]), robot('apm', '07:00', [['TX/YC']])]);
  assert.equal(P.hhmm(lot(r, 'matin').debut), '06:00');
  assert.equal(P.hhmm(lot(r, 'matin').fin), '08:00');
  assert.equal(P.hhmm(lot(r, 'apm').debut), '08:00', 'l’après-midi attend la fin du matin');
  assert.equal(P.hhmm(lot(r, 'apm').fin), '09:00');
  assert.equal(lot(r, 'apm').attenteLigne, 60, 'l’attente de la ligne est dite');
});

test('un second robot (sa propre ligne) tourne en même temps', () => {
  const r = jouer([robot('matin', '06:00', [['AF/YC']]), robot('apm', '07:00', [['TX/YC']], { lignePropre: true })]);
  assert.equal(P.hhmm(lot(r, 'apm').debut), '07:00');
  assert.equal(lot(r, 'apm').attenteLigne, undefined);
});

test('la ligne s’arrête de 12:15 à 13:00, pour toutes les équipes qui y travaillent', () => {
  // L'arrêt est saisi sur la case du matin ; il arrête aussi l'équipe de l'après-midi.
  const r = jouer([robot('matin', '11:30', [['AF/YC']], { arretsLigne: [{ de: '12:15', a: '13:00' }] }),
    robot('apm', '12:00', [['TX/YC']])]);
  assert.equal(P.hhmm(lot(r, 'matin').fin), '14:15', '120 min de travail + 45 min d’arrêt');
  assert.equal(lot(r, 'matin').arret, 45);
  assert.equal(P.hhmm(lot(r, 'apm').debut), '14:15');
  // Seule sur la ligne à midi, l'équipe de l'après-midi s'arrête aussi.
  const r2 = jouer([robot('matin', '06:00', [['AF/YC']], { arretsLigne: [{ de: '12:15', a: '13:00' }] }), robot('apm', '12:00', [['TX/YC']])]);
  assert.equal(P.hhmm(lot(r2, 'apm').fin), '13:45', '15 min, arrêt, puis 45 min');
});

test('les arrêts de ligne : chaque jour, fusionnés avec les pauses', () => {
  const a = P.arretsDeLigne([{ arretsLigne: [{ de: '12:15', a: '13:00' }, { de: 'xx', a: '1' }] }]);
  assert.equal(a.length, 4, 'J-3 à J, l’arrêt illisible ignoré');
  assert.deepEqual(a[3], { de: h('12:15'), a: h('13:00') });
  assert.deepEqual(P.fusionnerPauses([[{ de: 10, a: 20 }], [{ de: 15, a: 30 }, { de: 40, a: 50 }]]), [{ de: 10, a: 30 }, { de: 40, a: 50 }]);
});
