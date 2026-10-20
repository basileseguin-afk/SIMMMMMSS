/* Banc d'essai, correction 8 — la plonge de nuit « absorbable » : on juge
 * l'équipe du matin seule (v1). Elle absorbe le retard si, seule, elle lave
 * avant la fin de sa présence, sans heures sup, le retard (présent dès le
 * début de la journée) et ses propres retours (ceux de la journée jouée sans
 * la nuit, à leur heure) : si son dépassement vaut 0. La façon dont la journée
 * répartit les vols entre deux équipes qui se chevauchent ne compte plus
 * (docs/BANC_ESSAI.md § 6). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
// Un retour arrive à la plonge 30 min après son atterrissage ; 190 u (les unités par défaut d'un vol éco).
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta, bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Une équipe de plonge par vol, un tunnel, 90 min par vol.
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 90 }, tunnels: [{ nom: 'Tunnel ' + id, debit: 300, personnes: 1, actif: true }], plafond: 0, ...p });
// Le matin : 08:00 à 16:00 ; l'après-midi : 13:45 à 21:45 ; la nuit : 23:00 à 06:45, si le matin n'absorbe pas le retard.
const MATIN = (p = {}) => plonge('matin', '08:00', 480, p);
const APM = (p = {}) => plonge('apm', '13:45', 480, p);
const NUIT = (k = { mesure: 'absorbable' }) => plonge('nuit', '23:00', 465, { condition: k });
const jouer = (vols, ateliers, materiel = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  materiel: { actif: false, delaiRetour: 30, ...materiel } });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const qui = (r, vol) => (r.lots.find(l => l.vol === vol && !l.impossible) || {}).atelier;
// Huit retours le soir, dès 15:30, toutes les 20 min : l'après-midi en lave quatre, quatre restent (le retard).
const SOIR = Array.from({ length: 8 }, (_, i) => ret('R' + (i + 1), 'NORD', h('15:00') + i * 20));
const FIN_NUIT = h('06:45') + 1440;

test('le matin seul lave le retard et ses retours avant 16:00 : la nuit reste fermée, même si au rejeu l’après-midi prend un de ses retours', () => {
  // Son retour M1, à la plonge à 13:00 : sans retard, le matin le lave de 13:00 à 14:30.
  const vols = [ret('M1', 'SUD', h('12:30'))].concat(SOIR);
  const sansNuit = jouer(vols, [MATIN(), APM()]);
  assert.deepEqual(sansNuit.saleFinal.map(x => x.vol), ['R5', 'R6', 'R7', 'R8'], 'le retard : quatre vols');
  assert.equal(qui(sansNuit, 'M1'), 'matin', 'M1 : un de ses propres retours');
  // Au rejeu (le lendemain, le retard pour sale de la veille), le matin lave le retard jusqu'à 14:00 ; l'après-midi,
  // arrivé à 13:45 avec un tunnel libre, prend M1.
  const rejeu = jouer(vols, [MATIN(), APM()], { saleInitial: sansNuit.saleFinal });
  assert.equal(qui(rejeu, 'M1'), 'apm');
  // Seul, le matin lave le retard de 08:00 à 14:00 et M1 de 14:00 à 15:30 : avant 16:00. Il l'absorbe.
  const r = jouer(vols, [MATIN(), APM(), NUIT()]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: false, equipe: 'matin', retard: { vols: 4, unites: 760 },
    absorbe: true, depassement: 0, lavees: 0, reste: 760, fin: FIN_NUIT });
  assert.equal(vue(r, 'nuit').personnes, 0);
  assert.deepEqual(r.saleFinal, sansNuit.saleFinal, 'le retard passe au lendemain');
});

test('un retard qui ferait dépasser le matin seul de 20 min : la nuit s’ouvre, `depassement` = 20', () => {
  // M1 (SUD, 140 min) à la plonge à 10:00 : seul, le matin lave le retard de 08:00 à 14:00, puis M1 de 14:00 à 16:20.
  const vols = [ret('M1', 'SUD', h('09:30'))].concat(SOIR);
  const r = jouer(vols, [MATIN({ durees: { '*': 90, SUD: 140 } }), APM(), NUIT()]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: true, equipe: 'matin', retard: { vols: 4, unites: 760 },
    absorbe: false, depassement: 20, lavees: 760, reste: 0, fin: FIN_NUIT });
  assert.deepEqual([vue(r, 'nuit').personnes, r.saleFinal], [2, []]);
  // À 90 min, il finit à 15:30 : il l'absorbe.
  assert.equal(vue(jouer(vols, [MATIN(), APM(), NUIT()]), 'nuit').conditionSale.absorbe, true);
});

test('les autres cas ne changent pas : sans retard, fermée ; sans équipe pour absorber, ouverte ; la condition « sale » non plus', () => {
  const vols = [ret('M1', 'SUD', h('12:30'))].concat(SOIR);
  const rien = vue(jouer(vols.slice(0, 5), [MATIN(), APM(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([rien.retard.vols, rien.absorbe, rien.ouverte], [0, true, false]);
  const seule = vue(jouer(vols, [APM(), NUIT({ mesure: 'absorbable', equipe: 'matin' })]), 'nuit').conditionSale;
  assert.deepEqual([seule.equipe, seule.absorbe, seule.depassement, seule.ouverte], ['matin', false, null, true], 'l’équipe désignée ne travaille pas ce jour-là');
  // Sur le sale, à 23:00 : les quatre vols attendent, elle s'ouvre, comme avant.
  assert.deepEqual(vue(jouer(vols, [MATIN(), APM(), NUIT({ mesure: 'sale' })]), 'nuit').conditionSale,
    { mesure: 'sale', ouverte: true, a: '23:00', heure: h('23:00'), seuil: 1, sale: 760, lavees: 760, reste: 0, fin: FIN_NUIT });
});

test('déterministe : la même journée, deux fois', () => {
  const vols = [ret('M1', 'SUD', h('09:30'))].concat(SOIR);
  const une = () => JSON.parse(JSON.stringify(jouer(vols, [MATIN({ durees: { '*': 90, SUD: 140 } }), APM(), NUIT()])));
  assert.deepEqual(une(), une());
});
