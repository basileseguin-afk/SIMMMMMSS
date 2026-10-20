/* Banc d'essai, correction 7 — une plonge en heures sup finit le vol en
 * cours, mais n'en commence pas d'autre (v1) : passé la fin de sa présence,
 * par vol, elle finit les vols déjà dans un tunnel ; ce qui attend va à la
 * plonge suivante, sinon au sale de fin de journée (`saleFinal`) ; au débit,
 * elle s'arrête à la fin de sa présence. Ses heures sup : la fin du dernier
 * vol commencé moins la fin de sa présence (docs/BANC_ESSAI.md § 2). Vols,
 * compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
// Un retour arrive à la plonge 30 min après son atterrissage ; 190 u (les unités par défaut d'un vol éco).
const ret = (id, sta) => ({ id, cie: id.endsWith('2') ? 'SUD' : 'NORD', sens: 'RET', sta, bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Une équipe de plonge par vol, un tunnel, 90 min par vol.
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 90 }, tunnels: [{ nom: 'Tunnel ' + id, debit: 300, personnes: 1, actif: true }], plafond: 0, ...p });
// Le matin : 08:00 à 16:00 ; l'après-midi : 13:45 à 21:45 ; la nuit : 23:00 à 06:45.
const MATIN = (p = {}) => plonge('matin', '08:00', 480, p);
const APM = (p = {}) => plonge('apm', '13:45', 480, p);
const NUIT = (p = {}) => plonge('nuit', '23:00', 465, p);
const SUP = { heuresSup: { actif: true, plafond: 120 } };
const jouer = (vols, ateliers, plus = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  materiel: { actif: false, delaiRetour: 30 }, ...plus });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const laves = (r, id) => r.lots.filter(l => l.retourVol && l.atelier === id && !l.impossible).map(l => [l.vol, P.hhmm(l.debut), P.hhmm(l.fin)]);
// V1 arrive à la plonge à 20:45 : à 21:45, il est dans le tunnel de l'après-midi. V2 arrive à 21:00 : il attend.
const SOIR = [ret('V1', h('20:15')), ret('V2', h('20:30'))];

test('à la fin de sa présence, l’après-midi finit le vol dans son tunnel et ne commence pas celui qui attend', () => {
  const r = jouer(SOIR, [APM()], SUP);
  assert.deepEqual(laves(r, 'apm'), [['V1', '20:45', '22:15']]);
  assert.equal(vue(r, 'apm').heuresSup, 30, 'le reste de V1 : 21:45 → 22:15');
  assert.deepEqual(r.saleFinal.map(x => x.vol), ['V2'], 'pas de plonge après elle : V2 reste sale, il va au retard');
  // La nuit ouverte le lave à son arrivée.
  const nuit = jouer(SOIR, [APM(), NUIT()], SUP);
  assert.deepEqual(laves(nuit, 'apm'), [['V1', '20:45', '22:15']]);
  assert.deepEqual(laves(nuit, 'nuit'), [['V2', '23:00', 'J+1 00:30']]);
  assert.deepEqual([vue(nuit, 'apm').heuresSup, nuit.saleFinal], [30, []]);
  // Une nuit fermée (sur le sale, sous son seuil) : V2 va au sale de fin de journée.
  const fermee = jouer(SOIR, [APM(), NUIT({ condition: { mesure: 'sale', seuil: 1000 } })], SUP);
  assert.deepEqual([vue(fermee, 'nuit').personnes, fermee.saleFinal.map(x => x.vol)], [0, ['V2']]);
});

test('une nuit qui commence à 23:00 ne commence aucun vol après 06:45', () => {
  // Quatre retours entre 04:00 et 06:00 (J+1) : T1 de 04:00 à 05:30, T2 de 05:30 à 07:00 (en heures sup) ; T3 et T4 attendent.
  const vols = [0, 1, 2, 3].map(i => ret('T' + (i + 1), h('03:30') + 1440 + i * 40));
  const r = jouer(vols, [NUIT()], SUP);
  assert.deepEqual(laves(r, 'nuit'), [['T1', 'J+1 04:00', 'J+1 05:30'], ['T2', 'J+1 05:30', 'J+1 07:00']]);
  assert.ok(r.lots.filter(l => l.atelier === 'nuit' && !l.impossible).every(l => l.debut < h('06:45') + 1440));
  assert.equal(vue(r, 'nuit').heuresSup, 15, 'la fin du dernier vol commencé moins 06:45');
  assert.deepEqual(r.saleFinal.map(x => x.vol), ['T3', 'T4']);
  // Le matin qui arrive à 08:00 les lave, s'il travaille ce jour-là (une plonge de J+1).
  const matin = jouer(vols, [NUIT(), MATIN({ jour: 1 })], SUP);
  assert.deepEqual(laves(matin, 'matin').map(x => x[0]), ['T3', 'T4']);
});

test('avec la condition « absorbable », le retard compte ce que l’après-midi n’a pas commencé', () => {
  // Le matin a deux retours ; l'après-midi laisse V2, qu'il n'a pas commencé avant 21:45.
  const vols = [ret('M1', h('08:30')), ret('M2', h('10:00'))].concat(SOIR);
  const r = jouer(vols, [MATIN(), APM(), NUIT({ condition: { mesure: 'absorbable' } })], SUP);
  const cs = vue(r, 'nuit').conditionSale;
  assert.deepEqual(cs.retard, { vols: 1, unites: 190 }, 'V2 : les heures sup ne l’avalent plus');
  assert.deepEqual([cs.equipe, cs.absorbe, cs.ouverte], ['matin', true, false], 'le matin du lendemain le lave avec ses deux retours');
  assert.deepEqual(r.saleFinal.map(x => x.vol), ['V2'], 'il passe au lendemain');
});

test('sans l’option des heures sup, rien ne change : une plonge ne commence pas un vol qu’elle ne finirait pas dans sa présence', () => {
  const r = jouer(SOIR, [APM()]);
  assert.deepEqual([laves(r, 'apm'), vue(r, 'apm').heuresSup, r.saleFinal.map(x => x.vol)], [[], 0, ['V1', 'V2']]);
  const nuit = jouer(SOIR, [APM(), NUIT()]);
  assert.deepEqual(laves(nuit, 'nuit'), [['V1', '23:00', 'J+1 00:30'], ['V2', 'J+1 00:30', 'J+1 02:00']]);
  // Une plonge dont la présence n'a pas de fin (règle de poste décochée) lave tout, comme avant.
  const libre = jouer(SOIR, [APM({ regime: { actif: false } })], SUP);
  assert.deepEqual(laves(libre, 'apm').map(x => x[0]), ['V1', 'V2']);
});

test('déterministe : la même journée, deux fois', () => {
  const vols = [ret('M1', h('08:30')), ret('M2', h('10:00'))].concat(SOIR, [0, 1, 2, 3].map(i => ret('T' + (i + 1), h('03:30') + 1440 + i * 40)));
  const une = () => JSON.parse(JSON.stringify(jouer(vols, [MATIN(), APM(), NUIT({ condition: { mesure: 'absorbable' } })], SUP)));
  assert.deepEqual(une(), une());
});
