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

/* Une boutique : ouverte chaque jour de telle à telle heure ; on y est servi à
 * l'instant où l'on vient, sinon on attend qu'elle ouvre (retour d'usage :
 * « la légumerie, les appros et le magasin sont comme des boutiques »). */
const boutique = (de, a) => leg({ permanent: true, vagues: undefined, ouverture: { de, a } });

test('une boutique : ouverte, on est servi tout de suite ; fermée, on attend l’ouverture', () => {
  const b = boutique('07:00', '18:00');
  assert.equal(P.prochaineOuverture(b, h('10:00')), h('10:00'), 'ouverte');
  assert.equal(P.prochaineOuverture(b, h('04:00')), h('07:00'), 'avant l’ouverture : 07:00');
  assert.equal(P.prochaineOuverture(b, h('19:00') - 1440), h('07:00'), 'la veille au soir : le lendemain 07:00');
  assert.equal(P.prochaineOuverture(b, h('18:00')), h('07:00') + 1440, 'fermée à 18:00 pile');
  const nuit = boutique('22:00', '06:00');
  assert.equal(P.prochaineOuverture(nuit, h('02:00')), h('02:00'), 'une plage qui passe minuit');
  assert.equal(P.prochaineOuverture(nuit, h('12:00')), h('22:00'));
  assert.equal(P.ouvertureDe(leg()), null, 'par vagues : pas une boutique');
});

test('la cuisine attend l’ouverture de la boutique, et seulement elle', () => {
  const r = jouer([boutique('07:00', '18:00'), at('c1', 'cuisine', '04:00', [['AF/BC'], ['TX/BC']]), at('c2', 'cuisine', '16:00', [], { jour: -1 })]);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const c = r.lots.filter(l => l.atelier === 'c1');
  assert.equal(c[0].debut, h('07:00'), 'fermée à 04:00 : la cuisine attend 07:00');
  assert.equal(c[0].attente, 180, 'l’attente se voit');
  assert.equal(c[1].attente, 0, 'ouverte ensuite : servie sans attendre');
  const r2 = jouer([boutique('07:00', '18:00'), at('c1', 'cuisine', '16:00', [['AF/BC']], { jour: -1 })]);
  assert.equal(r2.lots.find(l => l.atelier === 'c1').debut, h('16:00') - 1440, 'la veille à 16:00, elle est ouverte');
  const r3 = jouer([boutique('07:00', '07:00'), at('c1', 'cuisine', '04:00', [['AF/BC']])]);
  assert.ok(r3.anomalies.some(a => a.code === 'ouverture'), 'ouverture = fermeture : refusé');
});

/* La plonge par vol (retour d'usage : « un tunnel lave un vol en tant de temps »). */
test('plonge par vol : chaque tunnel lave un vol revenu, dans l’ordre des retours, au temps de sa compagnie', () => {
  const vols = [{ id: 'AF9', cie: 'AF', sens: 'RET', sta: h('06:00'), bc: 10, yc: 100 }, { id: 'TX9', cie: 'TX', sens: 'RET', sta: h('06:10'), yc: 80 },
    { id: 'DL9', cie: 'DL', sens: 'RET', sta: h('06:20'), yc: 200 }];
  const plonge = p => ({ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 2, lots: [], regime: { actif: false },
    parVol: true, durees: { AF: 40, '*': 30 }, tunnels: [{ nom: 'T1', personnes: 1, actif: true }, { nom: 'T2', personnes: 1, actif: true }], ...p });
  const jouerP = pl => P.simuler({ vols, liaisons: [], rendement: 1, bareme: {}, ateliers: [pl], materiel: { actif: true, delaiRetour: 30 } });
  const r = jouerP(plonge());
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const l = r.lots.filter(x => x.retourVol);
  // Retours : AF 06:30, TX 06:40, DL 06:50. Deux tunnels.
  assert.deepEqual(l.map(x => [x.vol, P.hhmm(x.debut), P.hhmm(x.fin), x.tunnel]), [['AF9', '06:30', '07:10', 1], ['TX9', '06:40', '07:10', 2], ['DL9', '07:10', '07:40', 1]]);
  assert.equal(l[2].attente, 20, 'DL attend qu’un tunnel se libère');
  assert.ok(r.materiel.lavees > 0, 'le matériel lavé revient propre');
  // Un seul tunnel tenu (une personne) : les vols passent l'un après l'autre.
  const r1 = jouerP(plonge({ personnes: 1 }));
  assert.deepEqual(r1.lots.filter(x => x.retourVol).map(x => P.hhmm(x.debut)), ['06:30', '07:10', '07:40']);
  // Une compagnie sans temps : dit.
  const r2 = jouerP(plonge({ durees: { AF: 40 } }));
  assert.ok(r2.anomalies.some(x => x.code === 'plonge-duree' && /TX/.test(x.message)));
});
