/* Banc d'essai, évolution 18 (a) — le relais à la plonge par vol (v1).
 * Deux équipes d'une même plonge qui se suivent se passent le relais : celle
 * qui part laisse le vol en cours dans son tunnel à celle qui est là, sur la
 * même machine (le même nom de tunnel). C'est un seul lot, avec ses parts.
 * Sans équipe pour le reprendre, le lavage s'arrête à la fin de la présence :
 * le vol reste sale, et sa durée restante (`reste`) passe au lendemain avec
 * lui (`saleFinal`, le sale de la veille). Une plonge par vol ne fait plus
 * d'heures sup (docs/BANC_ESSAI.md § 2). Une équipe qui arrive après un trou
 * reprend le lavage arrêté (correction 19 : tests/plonge-reprise.test.cjs).
 * Journées fictives, calculées à la main : vols, compagnies et équipes
 * inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../moteur/production.js');
const PE = require('../moteur/periode.js');
const I = require('../moteur/indicateurs.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
// Un retour arrive à la plonge 30 min après son atterrissage ; 190 u (les unités par défaut d'un vol éco).
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const T = (nom, p) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
// Une équipe de plonge par vol, un tunnel « Tunnel 1 » : 90 min par vol, 180 min pour la compagnie LONG.
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 90, LONG: 180 }, tunnels: [T('Tunnel 1')], plafond: 0, ...p });
// Le matin : 06:00 à 14:00 ; l'après-midi : 13:00 à 21:00 ; la nuit : 21:00 à 05:00, sous condition.
const MATIN = (p = {}) => plonge('matin', '06:00', 480, p);
const APM = (p = {}) => plonge('apm', '13:00', 480, p);
const NUIT = (k, p = {}) => plonge('nuit', '21:00', 480, { condition: k, ...p });
const SUP = { heuresSup: { actif: true, plafond: 120 } };
const jouer = (vols, ateliers, plus = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  ...plus, materiel: { actif: false, delaiRetour: 30, ...(plus.materiel || {}) } });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const lot = (r, vol) => r.lots.find(l => l.retourVol && l.vol === vol);
const json = x => JSON.parse(JSON.stringify(x));
const part = (atelier, debut, fin, travail, p = {}) => ({ atelier, debut: h(debut), fin: h(fin), travail, arret: 0, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1, ...p });
const equipe = (r, id) => { const v = vue(r, id); return [v.fin, v.travail, v.heuresSup, v.heuresSupPersonnes]; };
// L1 (LONG, 180 min) arrive à la plonge à 12:00 : le matin le prend, seul présent.
const L1 = ret('L1', 'LONG', '11:30');

test('deux équipes qui se chevauchent : un seul lot, deux parts ; la première finit à la fin de sa présence, sans heures sup', () => {
  // Le matin lave de 12:00 à 14:00 (120 min) ; l'après-midi, là depuis 13:00 sur le même tunnel, continue de 14:00 à 15:00 (60 min).
  const r = jouer([L1], [MATIN(), APM()]);
  const lots = r.lots.filter(l => l.retourVol);
  assert.equal(lots.length, 1, 'un seul lot');
  assert.deepEqual(json(lots[0]), { service: 'plonge', nom: 'Vol L1', vol: 'L1', cie: 'LONG', classes: [], retourVol: true, arrivee: h('12:00'), unites: 190, arret: 0,
    atelier: 'matin', debut: h('12:00'), fin: h('15:00'), duree: 180, attente: 0, impossible: false, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1,
    parts: [part('matin', '12:00', '14:00', 120), part('apm', '14:00', '15:00', 60)] });
  // Chaque équipe est créditée de sa part ; le lot est le même objet sur les deux lignes.
  assert.deepEqual(equipe(r, 'matin'), [h('14:00'), 120, 0, 0], 'le matin finit à 14:00');
  assert.deepEqual(equipe(r, 'apm'), [h('15:00'), 60, 0, 0]);
  assert.equal(vue(r, 'matin').lots[0], lots[0]);
  assert.equal(vue(r, 'apm').lots[0], lots[0]);
  assert.deepEqual(r.saleFinal, [], 'le vol est propre');
  // Avant (les heures sup permises), le matin restait jusqu'à 15:00 : le vol est propre à la même heure.
  const sup = jouer([L1], [MATIN(), APM()], SUP);
  assert.deepEqual(json(sup.lots.filter(l => l.retourVol)), json(lots), 'avec l’option des heures sup : le même lot');
  assert.deepEqual([equipe(sup, 'matin'), equipe(sup, 'apm')], [[h('14:00'), 120, 0, 0], [h('15:00'), 60, 0, 0]], 'aucune heure sup, le plafond ne joue plus');
});

test('le matériel du vol est propre à la fin du lavage, pas au relais ; le vol suivant attend la machine', () => {
  // V2 (90 min) arrive à 14:30 : le tunnel lave L1 jusqu'à 15:00 ; l'après-midi le prend de 15:00 à 16:30.
  const r = jouer([L1, ret('V2', 'NORD', '14:00')], [MATIN(), APM()], { materiel: { actif: true, stockInitial: 0 } });
  assert.deepEqual([lot(r, 'V2').atelier, lot(r, 'V2').debut, lot(r, 'V2').fin, lot(r, 'V2').attente, 'parts' in lot(r, 'V2')], ['apm', h('15:00'), h('16:30'), 30, false]);
  // Le sale en attente : 190 u de 12:00 à 15:00 (L1), 380 de 14:30 à 15:00, 190 jusqu'à 16:30, puis rien.
  const niveau = t => { let n = 0; for (const [u, x] of r.plonge.serie) { if (u > t + 1e-9) break; n = x; } return n; };
  assert.deepEqual(['13:59', '14:01', '14:45', '15:00', '16:29', '16:30'].map(x => niveau(h(x))), [190, 190, 380, 190, 190, 0]);
});

test('la somme du travail des parts égale la durée du lavage ; le travail de la plonge est le même qu’avant', () => {
  const r = jouer([L1, ret('V2', 'NORD', '14:00')], [MATIN(), APM()]);
  for (const l of r.lots.filter(x => x.retourVol && x.parts)) assert.equal(l.parts.reduce((n, p) => n + p.travail, 0), l.duree, l.vol);
  // Avant : le matin 180 min (L1, dont 60 en heures sup), l'après-midi 90 (V2). Maintenant : 120, et 60 + 90.
  assert.deepEqual([vue(r, 'matin').travail, vue(r, 'apm').travail], [120, 150]);
  assert.equal(vue(r, 'matin').travail + vue(r, 'apm').travail, 180 + 90);
  // Un tunnel une fois et demie plus rapide chez l'après-midi : il lave en 40 min les 60 min qui restent ; le lot dure 160 min de tunnel.
  const vite = jouer([L1], [MATIN(), APM({ tunnels: [T('Tunnel 1', { vitesse: 1.5 })] })]);
  assert.deepEqual(json(lot(vite, 'L1').parts), [part('matin', '12:00', '14:00', 120), part('apm', '14:00', '14:40', 40, { vitesse: 1.5 })]);
  assert.deepEqual([lot(vite, 'L1').fin, lot(vite, 'L1').duree], [h('14:40'), 160]);
  // Deux fois plus rapide : seule, l'après-midi le finirait aussi à 14:30 (de 13:00 à 14:30). À égalité, pas de relais : il l'attend.
  const egal = jouer([L1], [MATIN(), APM({ tunnels: [T('Tunnel 1', { vitesse: 2 })] })]);
  assert.deepEqual([lot(egal, 'L1').atelier, lot(egal, 'L1').debut, lot(egal, 'L1').fin, 'parts' in lot(egal, 'L1')], ['apm', h('13:00'), h('14:30'), false]);
  // L'après-midi en pause de 14:00 à 14:20 : elle reprend le vol à 14:00, le lave de 14:20 à 15:20.
  const pause = jouer([L1], [MATIN(), APM({ pauses: [{ de: '14:00', a: '14:20' }] })]);
  assert.deepEqual(json(lot(pause, 'L1').parts), [part('matin', '12:00', '14:00', 120), part('apm', '14:00', '15:20', 60, { arret: 20 })]);
  assert.deepEqual([lot(pause, 'L1').fin, lot(pause, 'L1').duree, lot(pause, 'L1').arret, vue(pause, 'apm').arret], [h('15:20'), 180, 20, 20]);
});

test('deux équipes qui se suivent sans se toucher : pas de relais ; l’après-midi reprend le vol à son arrivée', () => {
  // Le matin de 06:00 à 12:00, l'après-midi de 13:00 à 19:00. L1 arrive à 11:00 : le matin en lave 60 min, puis s'en va.
  const vols = [ret('L1', 'LONG', '10:30'), ret('V2', 'NORD', '13:00')];
  const matin = MATIN({ regime: { actif: true, seuils: [], presence: 360 } });
  // Sans équipe après lui ce jour-là : le lavage s'arrête, le vol reste sale avec sa durée restante. V2 n'est pas commencé.
  const seul = jouer(vols, [matin]);
  assert.deepEqual(json(lot(seul, 'L1')), { service: 'plonge', nom: 'Vol L1', vol: 'L1', cie: 'LONG', classes: [], retourVol: true, arrivee: h('11:00'), unites: 190, arret: 0,
    atelier: 'matin', debut: h('11:00'), fin: null, duree: 180, attente: 0, fait: 60, impossible: true, horsPoste: true, reste: 120, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1,
    parts: [part('matin', '11:00', '12:00', 60)] });
  assert.deepEqual(seul.saleFinal, [{ vol: 'L1', cie: 'LONG', unites: 190, reste: 120 }, { vol: 'V2', cie: 'NORD', unites: 190 }], 'le vol reste sale, avec sa durée restante');
  assert.deepEqual(equipe(seul, 'matin'), [h('12:00'), 60, 0, 0]);
  // Avec l'après-midi (correction 19) : personne à 12:00, ce n'est pas un relais ; elle le reprend à son arrivée, à 13:00,
  // pour ses 120 min : propre à 15:00. Le même lot, une part de plus (`reprise`). V2, arrivé à 13:30, vient ensuite :
  // de 15:00 à 16:30. (Évolution 18 : elle ne le reprenait pas ; L1 passait au lendemain, V2 était lavé de 13:30 à 15:00.)
  const r = jouer(vols, [matin, APM({ regime: { actif: true, seuils: [], presence: 360 } })]);
  assert.deepEqual(json(lot(r, 'L1')), { service: 'plonge', nom: 'Vol L1', vol: 'L1', cie: 'LONG', classes: [], retourVol: true, arrivee: h('11:00'), unites: 190, arret: 0,
    atelier: 'matin', debut: h('11:00'), fin: h('15:00'), duree: 180, attente: 0, impossible: false, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1,
    parts: [part('matin', '11:00', '12:00', 60), part('apm', '13:00', '15:00', 120, { reprise: true })] });
  assert.deepEqual(r.saleFinal, [], 'le vol repris est propre');
  assert.deepEqual(equipe(r, 'matin'), [h('12:00'), 60, 0, 0]);
  assert.deepEqual(vue(r, 'apm').lots.map(l => [l.vol, l.debut, l.fin]), [['L1', h('11:00'), h('15:00')], ['V2', h('15:00'), h('16:30')]]);
  // Qu'elle arrive à 12:00, à l'instant où le matin part : elle est là, c'est un relais (60 + 120 min).
  const touche = jouer(vols, [MATIN({ regime: { actif: true, seuils: [], presence: 360 } }), APM({ debut: '12:00' })]);
  assert.deepEqual(json(lot(touche, 'L1').parts), [part('matin', '11:00', '12:00', 60), part('apm', '12:00', '14:00', 120)]);
  assert.deepEqual([lot(touche, 'L1').fin, touche.saleFinal], [h('14:00'), []]);
});

test('une seule équipe, un vol en cours à la fin de sa présence : le lavage s’arrête, le matériel reste sale, pour sa durée restante', () => {
  // V1 (90 min) arrive à 13:00 : 60 min lavées à 14:00, il en reste 30. V2 arrive à 13:30 : le tunnel est pris, il n'est pas commencé.
  const vols = [ret('V1', 'NORD', '12:30'), ret('V2', 'SUD', '13:00')];
  for (const plus of [{}, SUP]) {
    const r = jouer(vols, [MATIN()], plus);
    assert.deepEqual([lot(r, 'V1').debut, lot(r, 'V1').fin, lot(r, 'V1').impossible, lot(r, 'V1').horsPoste, lot(r, 'V1').fait, lot(r, 'V1').reste, lot(r, 'V1').duree],
      [h('13:00'), null, true, true, 60, 30, 90]);
    assert.deepEqual(json(lot(r, 'V1').parts), [part('matin', '13:00', '14:00', 60)]);
    assert.deepEqual(r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'V2', cie: 'SUD', unites: 190 }], 'V2, pas commencé, n’a pas de durée restante');
    assert.deepEqual(equipe(r, 'matin'), [h('14:00'), 60, 0, 0], 'personne ne reste en heures sup');
    assert.deepEqual([lot(r, 'V2').impossible, lot(r, 'V2').fin, 'fait' in lot(r, 'V2'), 'parts' in lot(r, 'V2')], [true, null, false, false]);
  }
  // Un tunnel deux fois plus rapide : V1, arrivé à 13:30, serait lavé en 45 min ; 30 min de tunnel sont faites (60 min d'un
  // tunnel normal), il reste 30 min d'un tunnel normal.
  const vite = jouer([ret('V1', 'NORD', '13:00')], [MATIN({ tunnels: [T('Tunnel 1', { vitesse: 2 })] })]);
  assert.deepEqual([lot(vite, 'V1').duree, lot(vite, 'V1').fait, lot(vite, 'V1').reste, vite.saleFinal[0].reste], [45, 30, 30, 30]);
  // Une pause de 13:15 à 13:45 : 15 min avant, 15 min après ; il reste 60 min.
  const pause = jouer([ret('V1', 'NORD', '12:30')], [MATIN({ pauses: [{ de: '13:15', a: '13:45' }] })]);
  assert.deepEqual([lot(pause, 'V1').fait, lot(pause, 'V1').reste, lot(pause, 'V1').arret, vue(pause, 'matin').travail, vue(pause, 'matin').arret], [30, 60, 30, 30, 30]);
});

test('une équipe suivante présente, mais sans tunnel du même nom : pas de relais sur cette machine', () => {
  // L'après-midi n'a qu'un « Tunnel 2 » : à 14:00, personne pour continuer sur le « Tunnel 1 ». 120 min faites, 60 restent.
  const r = jouer([L1], [MATIN(), APM({ tunnels: [T('Tunnel 2')] })]);
  assert.deepEqual([lot(r, 'L1').atelier, lot(r, 'L1').fin, lot(r, 'L1').fait, lot(r, 'L1').reste], ['matin', null, 120, 60]);
  assert.deepEqual(json(lot(r, 'L1').parts), [part('matin', '12:00', '14:00', 120)]);
  assert.deepEqual([vue(r, 'apm').lots, vue(r, 'apm').travail], [[], 0]);
  assert.deepEqual(r.saleFinal, [{ vol: 'L1', cie: 'LONG', unites: 190, reste: 60 }]);
  // Avec le « Tunnel 1 » en second tunnel : elle continue sur cette machine, son tunnel n° 2.
  const avec = jouer([L1], [MATIN(), APM({ tunnels: [T('Tunnel 2'), T('Tunnel 1')] })]);
  assert.deepEqual(json(lot(avec, 'L1').parts), [part('matin', '12:00', '14:00', 120), part('apm', '14:00', '15:00', 60, { tunnel: 2 })]);
  assert.deepEqual([lot(avec, 'L1').fin, avec.saleFinal], [h('15:00'), []]);
  // Une équipe sans liste de tunnels a sa machine à elle : pas de relais non plus.
  const sans = jouer([L1], [MATIN(), APM({ tunnels: [] })]);
  assert.deepEqual([lot(sans, 'L1').fin, lot(sans, 'L1').reste, sans.saleFinal.length], [null, 60, 1]);
});

test('trois équipes, dont une nuit sous condition : avec elle, le relais va jusqu’à elle ; sans elle, le reste passe au lendemain', () => {
  // W1 (90 min) arrive à 20:00 : l'après-midi en lave 60 min jusqu'à 21:00. W2 arrive à 20:30 : le tunnel est pris, il attend.
  const vols = [ret('W1', 'NORD', '19:30'), ret('W2', 'SUD', '20:00')];
  // À 21:00, 190 u attendent (W2 ; W1 est dans le tunnel) : la nuit vient, reprend W1 de 21:00 à 21:30, puis lave W2 de 21:30 à 23:00.
  const r = jouer(vols, [MATIN(), APM(), NUIT({ mesure: 'sale' })]);
  assert.deepEqual(json(lot(r, 'W1').parts), [part('apm', '20:00', '21:00', 60), part('nuit', '21:00', '21:30', 30)]);
  assert.deepEqual([lot(r, 'W1').fin, lot(r, 'W2').atelier, lot(r, 'W2').debut, lot(r, 'W2').fin], [h('21:30'), 'nuit', h('21:30'), h('23:00')]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'sale', ouverte: true, a: '21:00', heure: h('21:00'), seuil: 1, sale: 190, lavees: 380, reste: 0, fin: h('21:00') + 480 },
    'le vol repris compte, en unités lavées, pour l’équipe qui le finit');
  assert.deepEqual([equipe(r, 'apm'), vue(r, 'nuit').travail, r.saleFinal], [[h('21:00'), 60, 0, 0], 30 + 90, []]);
  // Un seuil de 1 000 u : elle ne vient pas. W1 s'arrête à 21:00 (30 min restent), W2 n'est pas commencé.
  const sans = jouer(vols, [MATIN(), APM(), NUIT({ mesure: 'sale', seuil: 1000 })]);
  assert.deepEqual([vue(sans, 'nuit').personnes, lot(sans, 'W1').fin, lot(sans, 'W1').reste], [0, null, 30]);
  assert.deepEqual(sans.saleFinal, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'W2', cie: 'SUD', unites: 190 }]);
  assert.deepEqual([vue(sans, 'nuit').conditionSale.sale, vue(sans, 'nuit').conditionSale.reste], [190, 380], 'à sa mesure, W1 est dans un tunnel ; à sa fin, les deux vols sont sales');
});

test('la condition « absorbable » : le matin absorbe le retard s’il ne pousse pas de lavage au-delà de sa présence', () => {
  const SOIR = [ret('W1', 'NORD', '19:30'), ret('W2', 'SUD', '20:00')];
  // Le retard du soir : W1 (30 min restent) et W2 (90 min). Le matin a un long vol, L1, qu'il passe en relais à 14:00
  // (60 min au-delà de sa présence, un jour sans retard comme un jour avec). Seul, il lave le retard de 06:00 à 08:00 : L1 n'en
  // est pas retardé. Il l'absorbe, la nuit ne vient pas.
  const r = jouer([L1, ...SOIR], [MATIN(), APM(), NUIT({ mesure: 'absorbable' })]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: false, equipe: 'matin', retard: { vols: 2, unites: 380 },
    absorbe: true, depassement: 0, lavees: 0, reste: 380, fin: h('21:00') + 480 });
  assert.deepEqual(r.saleFinal, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'W2', cie: 'SUD', unites: 190 }]);
  // Un matin plein : A1 et A2 (180 min) de 06:00 à 12:00, A3 (90 min) de 12:00 à 13:30. Avec le retard d'abord (120 min),
  // A3 serait lavé de 14:00 à 15:30 : 90 min de lavage poussées au-delà de sa présence. La nuit vient.
  const plein = [ret('A1', 'LONG', '05:30'), ret('A2', 'LONG', '08:30'), ret('A3', 'NORD', '11:30')];
  const n = jouer([...plein, ...SOIR], [MATIN(), APM(), NUIT({ mesure: 'absorbable' })]);
  assert.deepEqual(vue(n, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: true, equipe: 'matin', retard: { vols: 2, unites: 380 },
    absorbe: false, depassement: 90, lavees: 380, reste: 0, fin: h('21:00') + 480 });
  assert.deepEqual(json(lot(n, 'W1').parts), [part('apm', '20:00', '21:00', 60), part('nuit', '21:00', '21:30', 30)], 'le relais va jusqu’à la nuit');
  assert.deepEqual(n.saleFinal, []);
});

test('sur deux jours, le reste du premier jour est lavé le lendemain, d’abord, pour sa seule durée restante', () => {
  const j1 = jouer([ret('V1', 'NORD', '12:30'), ret('V2', 'SUD', '13:00')], [MATIN()]);
  assert.deepEqual(j1.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  // Le lendemain : V1 pour ses 30 min restantes, de 06:00 à 06:30 ; V2 en entier, de 06:30 à 08:00 ; puis M1, arrivé à 06:00.
  const j2 = jouer([ret('M1', 'NORD', '05:30')], [MATIN()], { materiel: { saleInitial: j1.saleFinal } });
  assert.deepEqual(j2.lots.filter(l => l.retourVol).map(l => [l.vol, l.debut, l.fin, l.duree]),
    [['V1 (veille)', h('06:00'), h('06:30'), 30], ['V2 (veille)', h('06:30'), h('08:00'), 90], ['M1', h('08:00'), h('09:30'), 90]]);
  assert.deepEqual(j2.saleFinal, []);
  // Un reste qui n'est pas commencé le lendemain garde sa durée restante ; un reste repris et encore coupé rend ce qu'il en reste.
  const court = jouer([], [MATIN({ regime: { actif: true, seuils: [], presence: 20 } })], { materiel: { saleInitial: j1.saleFinal } });
  assert.deepEqual(court.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 10 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  const ferme = jouer([], [MATIN({ tunnels: [T('Tunnel 1', { actif: false })] })], { materiel: { saleInitial: j1.saleFinal } });
  assert.deepEqual(ferme.saleFinal, j1.saleFinal);
  // La sauvegarde garde la durée restante (ce que la période passe d'un jour au suivant).
  // Un reste négatif ou illisible s'efface ; un reste infime ne s'arrondit pas à rien ; un reste démesuré est borné à une journée.
  const douteux = [{ vol: 'X', cie: 'SUD', unites: 10, reste: -5 }, { vol: 'Y', cie: 'SUD', unites: 10, reste: 0.001 }, { vol: 'Z', cie: 'SUD', unites: 10, reste: 1e300 },
    { vol: 'W', cie: 'SUD', unites: 10, reste: 'beaucoup' }];
  const garde = A.valider({ ...A.vide(), materiel: { ...A.vide().materiel, saleInitial: [...j1.saleFinal, ...douteux] } }).materiel.saleInitial;
  assert.deepEqual(garde, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'V2', cie: 'SUD', unites: 190 }, { vol: 'X', cie: 'SUD', unites: 10 },
    { vol: 'Y', cie: 'SUD', unites: 10, reste: 0.01 }, { vol: 'Z', cie: 'SUD', unites: 10, reste: 1440 }, { vol: 'W', cie: 'SUD', unites: 10 }]);
});

test('les parts d’un lot (partsDuLot) : celles du relais, sinon le lot entier', () => {
  const r = jouer([L1, ret('V2', 'NORD', '14:00')], [MATIN(), APM()]);
  assert.equal(P.partsDuLot(lot(r, 'L1')), lot(r, 'L1').parts);
  assert.deepEqual(P.partsDuLot(lot(r, 'V2')), [{ atelier: 'apm', debut: h('15:00'), fin: h('16:30'), travail: 90, arret: 0, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1 }]);
  // Un vol qu'aucune équipe ne commence : aucune part.
  const seul = jouer([ret('V1', 'NORD', '12:30'), ret('V2', 'SUD', '13:00')], [MATIN()]);
  assert.deepEqual(P.partsDuLot(lot(seul, 'V2')), []);
});

test('dans une période, chaque équipe est créditée de sa part ; le vol en relais compte pour l’équipe qui le finit', () => {
  const args = { vols: [dep('NO1', 'NORD', '12:00'), L1, ret('V2', 'NORD', '14:00')], liaisons: [], rendement: 1, ateliers: [MATIN(), APM()],
    materiel: { actif: false, delaiRetour: 30 } };
  const x = PE.extraire(P.simuler(args), args, '2026-11-02'), e = id => x.equipes.find(k => k.id === id);
  // La charge : le travail de sa part × la personne du tunnel ÷ le poste (480 min). Avant : 180 ÷ 480 et 90 ÷ 480.
  assert.deepEqual([e('matin').charge, e('apm').charge], [120 / 480, (60 + 90) / 480]);
  assert.equal(e('matin').charge + e('apm').charge, (180 + 90) / 480, 'la charge de la plonge : la même qu’avant');
  assert.deepEqual([e('matin').travail, e('matin').fin, e('matin').heuresSup, e('apm').travail, e('apm').fin, e('apm').heuresSup], [120, h('14:00'), 0, 150, h('16:30'), 0]);
  assert.deepEqual([e('matin').volsLaves, e('matin').lots, e('apm').volsLaves, e('apm').lots], [0, 0, 2, 2]);
  // Les indicateurs de charge de la période sont ceux de la journée : chaque équipe au travail pendant sa part.
  assert.deepEqual(x.indicateursCharge.equipes.map(k => [k.id, k.minutesAuTravail, k.termines]), [['matin', 120, 0], ['apm', 150, 2]]);
  // La ligne du vol, dans l'export : une seule, de son entrée dans le tunnel à sa sortie.
  assert.deepEqual(x.plonge.map(l => [l.vol, l.equipe, l.tunnel, l.debut, l.fin]), [['L1', 'matin', 'Tunnel 1', h('12:00'), h('15:00')], ['V2', 'apm', 'Tunnel 1', h('15:00'), h('16:30')]]);
  // Un lavage arrêté : sa part faite compte dans la charge ; le sale du soir, en unités, est celui du vol.
  const seul = { ...args, vols: [dep('NO1', 'NORD', '12:00'), ret('V1', 'NORD', '12:30')], ateliers: [MATIN()] };
  const y = PE.extraire(P.simuler(seul), seul, '2026-11-02');
  assert.deepEqual([y.equipes[0].charge, y.equipes[0].heuresSup, y.saleFinal], [60 / 480, 0, 190]);
  assert.equal(y.equipes[0].volsLaves, 0, 'un vol arrêté n’est pas lavé');
});

test('les indicateurs de charge lisent les parts : chaque équipe est au travail pendant sa part, pas au-delà', () => {
  // L'après-midi a deux tunnels, dans l'autre ordre (« Tunnel 1 » est son n° 2, tenu par 2 personnes ; celui du matin, par 1).
  const apm = APM({ personnes: 3, tunnels: [T('Tunnel 2'), T('Tunnel 1', { personnes: 2 })] });
  const args = { vols: [dep('NO1', 'NORD', '12:00'), L1, ret('V2', 'NORD', '14:00')], liaisons: [], rendement: 1, ateliers: [MATIN(), apm], materiel: { actif: false, delaiRetour: 30 } };
  const r = P.simuler(args), k = I.journee(r, args), e = id => k.equipes.find(x => x.id === id);
  // L1 : le matin de 12:00 à 14:00 (1 personne), l'après-midi de 14:00 à 15:00 à son tunnel n° 2 (2 personnes). V2, arrivé à
  // 14:30, entre dans le « Tunnel 2 » de l'après-midi, libre : 14:30 → 16:00 (1 personne).
  assert.deepEqual(json(lot(r, 'L1').parts), [part('matin', '12:00', '14:00', 120), part('apm', '14:00', '15:00', 60, { tunnel: 2 })]);
  assert.deepEqual([lot(r, 'V2').tunnel, lot(r, 'V2').debut, lot(r, 'V2').fin], [1, h('14:30'), h('16:00')]);
  // Le matin : 120 min au travail, 120 minutes × personnes, aucun vol fini (L1 l'est par l'après-midi).
  assert.deepEqual([e('matin').minutesAuTravail, e('matin').auTravail, e('matin').hommeMinutes, e('matin').termines], [120, 120, 120, 0]);
  // L'après-midi : au travail de 14:00 à 16:00 (120 min) ; 60 × 2 + 90 × 1 = 210 minutes × personnes ; deux vols finis.
  assert.deepEqual([e('apm').minutesAuTravail, e('apm').auTravail, e('apm').hommeMinutes, e('apm').termines], [120, 210, 210, 2]);
  // Le vol repris n'attend pas l'équipe qui le reprend : aucune file, ni chez l'une ni chez l'autre.
  assert.deepEqual([e('matin').fileMax.lots, e('apm').fileMax.lots], [0, 0]);
  // La part d'une équipe dans un lot : la sienne, avec son rang ; null sans part ; undefined pour un lot sans parts.
  assert.deepEqual([I.partDe(lot(r, 'L1'), { id: 'apm' }).rang, I.partDe(lot(r, 'L1'), { id: 'apm' }).derniere, I.partDe(lot(r, 'L1'), { id: 'x' }), I.partDe(lot(r, 'V2'), { id: 'apm' })],
    [1, true, null, undefined]);
  // Un lavage arrêté : l'équipe est au travail jusqu'à la fin de sa présence, pour ce qu'elle a fait.
  const seul = { ...args, vols: [dep('NO1', 'NORD', '12:00'), ret('V1', 'NORD', '12:30')], ateliers: [MATIN()] };
  const s = I.journee(P.simuler(seul), seul).equipes[0];
  assert.deepEqual([s.minutesAuTravail, s.auTravail, s.hommeMinutes, s.termines], [60, 60, 60, 0]);
});

/* ---- non-régression : ce qui ne chevauche aucune fin de présence ne change pas -------------------- */
// Les empreintes des résultats, relevées avec le moteur d'avant l'évolution 18 (commit 56ac66b).
const empreinte = r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
const CALME = [ret('C1', 'NORD', '06:30'), ret('C2', 'LONG', '08:00'), ret('C3', 'SUD', '13:30'), ret('C4', 'NORD', '15:00'), ret('C5', 'LONG', '17:00')];
const AVANT = { parVol: 'd45947b12796658d', parVolSup: '555029c32bbcdd0c', debit: 'b0688f0724042544', sansPlonge: 'd638573fe056c680' };

test('non-régression : une journée où aucun lavage ne chevauche une fin de présence est celle d’avant, champ par champ', () => {
  const r = jouer(CALME, [MATIN(), APM()], { materiel: { actif: true, stockInitial: 0 } });
  assert.ok(r.lots.filter(l => l.retourVol).every(l => !l.impossible && !l.parts), 'aucun relais, aucun lavage coupé');
  assert.equal(empreinte(r), AVANT.parVol);
  assert.equal(empreinte(jouer(CALME, [MATIN(), APM()], { ...SUP, materiel: { actif: true, stockInitial: 0 } })), AVANT.parVolSup, 'avec l’option des heures sup');
});

test('non-régression : une journée sans plonge par vol est celle d’avant, champ par champ', () => {
  // La plonge au débit : elle s'arrête à la fin de sa présence, comme avant (un vol revient à 13:45, il n'est pas fini à 14:00).
  const debit = p => ({ ...MATIN(p), parVol: false });
  const soir = [...CALME, ret('C6', 'SUD', '13:15')];
  assert.equal(empreinte(jouer(soir, [debit(), { ...APM(), parVol: false }], { ...SUP, materiel: { actif: true, stockInitial: 0 } })), AVANT.debit);
  assert.equal(empreinte(jouer(soir, [], { ...SUP, materiel: { actif: true, stockInitial: 0 } })), AVANT.sansPlonge);
});

test('déterministe : la même journée, deux fois', () => {
  const vols = [L1, ret('V2', 'NORD', '14:00'), ret('W1', 'NORD', '19:30'), ret('W2', 'SUD', '20:00')];
  const une = () => JSON.stringify(jouer(vols, [MATIN(), APM(), NUIT({ mesure: 'absorbable' })], SUP));
  assert.equal(une(), une());
});
