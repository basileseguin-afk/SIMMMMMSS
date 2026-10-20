/* Banc d'essai, correction 5 — une mise à disposition fermée ne bloque pas
 * une équipe qui a déjà ses fournitures (v1) : une équipe les prend en début de
 * poste, ou dès que la mise à disposition à heures fixes ouvre ; celle-ci ne
 * fait attendre que son premier lot qui en a besoin, et seulement si elle n'a
 * pas encore ouvert depuis le début de son poste (docs/BANC_ESSAI.md § 8).
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const vol = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Le magasin, ouvert de 07:00 à 18:00 ; les commandes passent par lui, puis par le robot (ou la cuisine).
const MAGASIN = { id: 'mg', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [],
  permanent: true, ouverture: { de: '07:00', a: '18:00' }, regime: { actif: false } };
const robot = (debut, lots, p) => ({ id: 'ro', nom: 'Robot', service: 'prepa', type: 'robot', debut, jour: 0, personnes: 1, personnesMin: 1,
  debit: 100, pauses: [], lots, regime: { actif: false }, ...p });
const equipe = (debut, lots) => ({ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut, jour: 0, personnes: 1, pauses: [], lots, regime: { actif: false } });
// 60 min par vol à la main ; au robot, 100 plateaux/h.
const BAREME = { prepa: { '*/YC': 60 } };
const CHEMIN = { parcours: [{ id: 'c', nom: 'Magasin puis prépa', noeuds: ['magasin', 'prepa'], liens: [{ de: 'magasin', vers: 'prepa' }] }], parcoursCabine: { YC: 'c' } };
const jouer = (vols, ateliers) => P.simuler({ vols, liaisons: [{ from: 'magasin', to: 'prepa' }], bareme: BAREME, rendement: 1, ateliers: [MAGASIN, ...ateliers], ...CHEMIN });
const lots = (r, id) => r.lots.filter(l => l.atelier === id).map(l => [l.nom, P.hhmm(l.debut), P.hhmm(l.fin), l.attente]);

test('un robot qui enchaîne un lot après la fermeture du magasin ne l’attend plus', () => {
  // Sept vols NORD (700 plateaux : 7 h au robot), de 12:00 à 19:00 ; puis SUD, à 19:00, le magasin fermé depuis 18:00.
  const vols = Array.from({ length: 7 }, (_, i) => vol('NO' + (i + 1), 'NORD', '23:0' + i)).concat([vol('SU1', 'SUD', '23:30')]);
  const r = jouer(vols, [robot('12:00', [['NORD/YC'], ['SUD/YC']])]);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const l = lots(r, 'ro');
  assert.deepEqual(l.map(x => x.slice(0, 2)), [['NORD/YC', '12:00'], ['SUD/YC', '19:00']], 'servi à 12:00, il enchaîne à 19:00');
  assert.equal(l[1][3], 0, 'sans attendre la réouverture du lendemain');
});

test('une équipe qui commence avant l’ouverture attend l’ouverture pour son premier lot, et seulement lui', () => {
  const vols = [vol('NO1', 'NORD', '12:00'), vol('SU1', 'SUD', '12:10')];
  const r = jouer(vols, [equipe('05:00', [['NORD/YC'], ['SUD/YC']])]);
  assert.deepEqual(lots(r, 'mo'), [['NORD/YC', '07:00', '08:00', 120], ['SUD/YC', '08:00', '09:00', 0]]);
  // Le soir, un lot commencé à 18:30 : servie à 07:00, l'équipe ne l'attend pas.
  const soir = jouer([vol('NO1', 'NORD', '23:00'), vol('SU1', 'SUD', '23:10')], [equipe('17:30', [['NORD/YC'], ['SUD/YC']])]);
  assert.deepEqual(lots(soir, 'mo'), [['NORD/YC', '17:30', '18:30', 0], ['SUD/YC', '18:30', '19:30', 0]]);
  // Une équipe qui commence à 19:00, le magasin fermé : elle attend son ouverture, le lendemain.
  const nuit = jouer([vol('NO1', 'NORD', '12:00')].map(v => ({ ...v, std: v.std + 1440 })), [{ ...equipe('19:00', [['NORD/YC']]), jour: 0 }]);
  assert.deepEqual(lots(nuit, 'mo')[0].slice(0, 2), ['NORD/YC', 'J+1 07:00']);
});

test('les journées où rien ne commence pendant une fermeture ne changent pas', () => {
  // Tout se fait entre 07:00 et 18:00 : la même journée qu'avant (ouverte, on est servi à l'instant).
  const vols = [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), vol('ES1', 'EST', '15:20')];
  const r = jouer(vols, [equipe('08:00', [['NORD/YC'], ['SUD/YC'], ['EST/YC']])]);
  assert.deepEqual(lots(r, 'mo'), [['NORD/YC', '08:00', '09:00', 0], ['SUD/YC', '09:00', '10:00', 0], ['EST/YC', '10:00', '11:00', 0]]);
});
