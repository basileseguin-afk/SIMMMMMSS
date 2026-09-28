/* La légumerie (et le magasin, la réception) sert toutes les commandes à la
 * fois, en plusieurs vagues : chaque commande prend la vague qui précède son
 * besoin (retour d'usage du 28/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, regime: { actif: false }, ...p });
const leg = p => ({ id: 'lg', nom: 'Légumerie', service: 'decontam', type: 'dispo', debut: '14:00', jour: -1, personnes: 0, lots: [],
  permanent: false, vagues: [{ debut: '14:00', jour: -1 }, { debut: '04:00', jour: 0 }], ...p });
const VOLS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: h('10:00'), bc: 10, pc: 0, yc: 0 },
  { id: 'TX1', cie: 'TX', sens: 'DEP', std: h('14:00'), bc: 10, pc: 0, yc: 0 }
];
const jouer = (ateliers) => P.simuler({ vols: VOLS, liaisons: [{ from: 'decontam', to: 'cuisine' }], rendement: 1,
  bareme: { cuisine: { '*/BC': 60 } }, ateliers });

test('les vagues d’une mise à disposition, dans l’ordre ; sans liste, son heure', () => {
  assert.deepEqual(P.vaguesDe(leg()), [h('14:00') - 1440, h('04:00')]);
  assert.deepEqual(P.vaguesDe(leg({ vagues: undefined, debut: '06:00', jour: 0 })), [h('06:00')]);
  assert.deepEqual(P.vaguesDe(leg({ permanent: true })), [], 'permanente : pas de vague');
  assert.equal(P.disponibleDes(leg()), h('14:00') - 1440);
});

test('chaque commande prend la vague qui précède son besoin', () => {
  const r = jouer([leg(), at('c1', 'cuisine', '16:00', [['AF/BC']], { jour: -1 }), at('c2', 'cuisine', '06:00', [['TX/BC']])]);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const lignes = r.lots.filter(l => l.dispo);
  assert.equal(lignes.length, 2, 'une ligne par vague');
  assert.deepEqual(lignes.map(l => [P.hhmm(l.debut), l.classes]), [['J-1 14:00', ['AF/BC']], ['04:00', ['TX/BC']]]);
  assert.equal(lignes[0].vague, 1); assert.equal(lignes[1].vagues, 2);
  // La cuisine n'attend pas : la vague d'avant sert tout le monde à la fois.
  assert.ok(r.lots.filter(l => l.service === 'cuisine').every(l => !l.attente));
});

test('un besoin avant la première vague : on l’attend, et c’est elle qui sert', () => {
  const r = jouer([leg({ vagues: [{ debut: '05:00', jour: 0 }, { debut: '09:00', jour: 0 }] }), at('c1', 'cuisine', '03:00', [['AF/BC'], ['TX/BC']])]);
  const c = r.lots.filter(l => l.service === 'cuisine');
  assert.equal(c[0].debut, h('05:00'), 'la cuisine attend la première vague');
  assert.equal(c[0].attente, 120);
  const lignes = r.lots.filter(l => l.dispo);
  assert.deepEqual(lignes.map(l => [P.hhmm(l.debut), l.classes]), [['05:00', ['AF/BC', 'TX/BC']]], 'TX BC, prise à 06:00, reste sur la vague de 05:00');
});

test('une mise à disposition permanente reste une seule ligne', () => {
  const r = jouer([leg({ permanent: true }), at('c1', 'cuisine', '06:00', [['AF/BC'], ['TX/BC']])]);
  assert.equal(r.lots.filter(l => l.dispo).length, 1);
});
