/* Banc d'essai, correction 8 — la plonge de nuit « absorbable » : on juge
 * l'équipe du matin seule (v1). Elle absorbe le retard si, seule, elle lave
 * pendant sa présence le retard (présent dès le début de la journée) et ses
 * propres retours (ceux de la journée jouée sans la nuit, à leur heure). La
 * façon dont la journée répartit les vols entre deux équipes qui se
 * chevauchent ne compte pas. Depuis l'évolution 18, une plonge par vol ne
 * dépasse plus sa présence : le `depassement` est le lavage que le retard
 * pousse au-delà de sa présence (celui d'après sa présence avec le retard,
 * moins celui sans lui) ; elle l'absorbe s'il vaut 0. Ici, chaque équipe a
 * son tunnel : pas de relais (docs/BANC_ESSAI.md § 6). Vols, compagnies et
 * équipes fictifs. */
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
// Huit retours le soir, dès 15:30, toutes les 20 min. R1 va à l'après-midi (15:30 → 17:00). R2, à 15:50, entre dans le tunnel
// du matin, libre : 10 min lavées à 16:00, 80 restent (évolution 18 ; avant, le matin ne le commençait pas). L'après-midi lave
// R3, R4, R5 (17:00 → 21:30) et commence R6 à 21:30 : 15 min lavées à 21:45, 75 restent. R7 et R8 ne sont pas commencés.
// Le retard : quatre vols, 80 + 75 + 90 + 90 = 335 min de lavage (avant : R5 à R8, 360 min).
const SOIR = Array.from({ length: 8 }, (_, i) => ret('R' + (i + 1), 'NORD', h('15:00') + i * 20));
const FIN_NUIT = h('06:45') + 1440;
const RETARD = [{ vol: 'R2', cie: 'NORD', unites: 190, reste: 80 }, { vol: 'R6', cie: 'NORD', unites: 190, reste: 75 }, { vol: 'R7', cie: 'NORD', unites: 190 }, { vol: 'R8', cie: 'NORD', unites: 190 }];

test('le matin seul lave le retard sans rien pousser au-delà de sa présence : la nuit reste fermée', () => {
  // Son retour M1, à la plonge à 13:00 : sans retard, le matin le lave de 13:00 à 14:30.
  const vols = [ret('M1', 'SUD', h('12:30'))].concat(SOIR);
  const sansNuit = jouer(vols, [MATIN(), APM()]);
  assert.deepEqual(sansNuit.saleFinal, RETARD, 'le retard : quatre vols, dont deux commencés');
  assert.equal(qui(sansNuit, 'M1'), 'matin', 'M1 : un de ses propres retours');
  // Au rejeu (le lendemain, le retard pour sale de la veille), le matin lave le retard de 08:00 à 13:35, puis M1 de 13:35 à
  // 15:05 : avant l'après-midi, arrivée à 13:45 (15:15). Avant l'évolution 18, le retard durait jusqu'à 14:00 : l'après-midi prenait M1.
  const rejeu = jouer(vols, [MATIN(), APM()], { saleInitial: sansNuit.saleFinal });
  assert.equal(qui(rejeu, 'M1'), 'matin');
  // Seul, le matin lave le retard de 08:00 à 13:35, M1 de 13:35 à 15:05, et commence R2 à 15:50 : 80 min de lavage après
  // 16:00, comme un jour sans retard. Le retard n'y ajoute rien : il l'absorbe.
  const r = jouer(vols, [MATIN(), APM(), NUIT()]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: false, equipe: 'matin', retard: { vols: 4, unites: 760 },
    absorbe: true, depassement: 0, lavees: 0, reste: 760, fin: FIN_NUIT });
  assert.equal(vue(r, 'nuit').personnes, 0);
  assert.deepEqual(r.saleFinal, sansNuit.saleFinal, 'le retard passe au lendemain');
});

test('un retard qui pousse 5 min de lavage au-delà de la présence du matin : la nuit s’ouvre, `depassement` = 5', () => {
  // M1 (SUD, 140 min) à la plonge à 10:00. Seul, le matin lave le retard de 08:00 à 13:35, M1 de 13:35 à 15:55, puis R2 de
  // 15:55 à 17:25 : 85 min de lavage après 16:00. Sans retard : R2 de 15:50 à 17:20, 80 min. Le retard en pousse 5.
  // (Avant l'évolution 18 : le retard, 360 min, de 08:00 à 14:00, M1 jusqu'à 16:20 — un dépassement de 20 min.)
  const vols = [ret('M1', 'SUD', h('09:30'))].concat(SOIR);
  const r = jouer(vols, [MATIN({ durees: { '*': 90, SUD: 140 } }), APM(), NUIT()]);
  // La nuit, arrivée à 23:00, lave R7 et R8 (380 u). R2 et R6, arrêtés à 16:00 et à 21:45 quand personne n'était là pour
  // les reprendre sur leur tunnel, passent au lendemain avec leur durée restante (avant : elle lavait les quatre, 760 u).
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: true, equipe: 'matin', retard: { vols: 4, unites: 760 },
    absorbe: false, depassement: 5, lavees: 380, reste: 380, fin: FIN_NUIT });
  assert.deepEqual([vue(r, 'nuit').personnes, r.saleFinal], [2, RETARD.slice(0, 2)]);
  // À 90 min, M1 est lavé de 13:35 à 15:05, R2 de 15:50 à 17:20 : 80 min après 16:00, comme sans retard. Il l'absorbe.
  assert.equal(vue(jouer(vols, [MATIN(), APM(), NUIT()]), 'nuit').conditionSale.absorbe, true);
});

test('les autres cas : sans retard, fermée ; sans équipe pour absorber, ouverte ; la condition « sale »', () => {
  const vols = [ret('M1', 'SUD', h('12:30'))].concat(SOIR);
  // M1 et R1 : tout est lavé. (Avec R2 à R4, c'était aussi « sans retard » avant l'évolution 18 ; R2, commencé par le matin
  // à 15:50 et arrêté à 16:00, est maintenant un retard d'un vol, que le matin absorbe.)
  const rien = vue(jouer(vols.slice(0, 2), [MATIN(), APM(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([rien.retard.vols, rien.absorbe, rien.ouverte], [0, true, false]);
  const un = vue(jouer(vols.slice(0, 5), [MATIN(), APM(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([un.retard, un.absorbe, un.depassement, un.ouverte], [{ vols: 1, unites: 190 }, true, 0, false]);
  const seule = vue(jouer(vols, [APM(), NUIT({ mesure: 'absorbable', equipe: 'matin' })]), 'nuit').conditionSale;
  assert.deepEqual([seule.equipe, seule.absorbe, seule.depassement, seule.ouverte], ['matin', false, null, true], 'l’équipe désignée ne travaille pas ce jour-là');
  // Sur le sale, à 23:00 : deux vols attendent (R7, R8 ; R2 et R6 sont entrés dans un tunnel), elle s'ouvre et les lave ; R2
  // et R6, arrêtés, restent sales à sa fin. (Avant l'évolution 18 : quatre vols attendaient, 760 u, tous lavés.)
  assert.deepEqual(vue(jouer(vols, [MATIN(), APM(), NUIT({ mesure: 'sale' })]), 'nuit').conditionSale,
    { mesure: 'sale', ouverte: true, a: '23:00', heure: h('23:00'), seuil: 1, sale: 380, lavees: 380, reste: 380, fin: FIN_NUIT });
});

test('déterministe : la même journée, deux fois', () => {
  const vols = [ret('M1', 'SUD', h('09:30'))].concat(SOIR);
  const une = () => JSON.parse(JSON.stringify(jouer(vols, [MATIN({ durees: { '*': 90, SUD: 140 } }), APM(), NUIT()])));
  assert.deepEqual(une(), une());
});
