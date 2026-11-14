/* Banc d'essai, correction 19 (a) — la reprise à l'arrivée, à la plonge par
 * vol (v1). Un lavage arrêté à la fin d'une présence, personne n'étant là pour
 * le continuer, est repris par la première équipe de la plonge qui arrive
 * ensuite sur la même machine (le même nom de tunnel) : d'abord, pour sa seule
 * durée restante, à la vitesse de son tunnel. C'est le même lot : une part de
 * plus, avec son trou. Le reste ne passe au lendemain que si aucune équipe ne
 * peut le reprendre ce jour-là (docs/BANC_ESSAI.md § 2). Journées fictives,
 * calculées à la main : vols, compagnies et équipes inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');

const h = s => P.minutes(s);
// Un retour arrive à la plonge 30 min après son atterrissage ; 190 u (les unités par défaut d'un vol éco).
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const T = (nom, p) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
// Une équipe de plonge par vol, un tunnel « Tunnel 1 » : 90 min par vol, 180 min pour la compagnie LONG.
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 90, LONG: 180 }, tunnels: [T('Tunnel 1')], plafond: 0, ...p });
// Le matin : 06:00 à 14:00 ; l'après-midi : 13:00 à 21:00 ; la nuit : 22:00 à 06:00, une heure après le départ de l'après-midi.
const MATIN = (p = {}) => plonge('matin', '06:00', 480, p);
const APM = (p = {}) => plonge('apm', '13:00', 480, p);
const NUIT = (p = {}) => plonge('nuit', '22:00', 480, p);
const jouer = (vols, ateliers, plus = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  ...plus, materiel: { actif: false, delaiRetour: 30, ...(plus.materiel || {}) } });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const lot = (r, vol) => r.lots.find(l => l.retourVol && l.vol === vol);
const json = x => JSON.parse(JSON.stringify(x));
const part = (atelier, debut, fin, travail, p = {}) => ({ atelier, debut: h(debut), fin: h(fin), travail, arret: 0, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1, ...p });
const reprise = (atelier, debut, fin, travail, p = {}) => part(atelier, debut, fin, travail, { reprise: true, ...p });
// W1 (90 min) arrive à la plonge à 20:00 : l'après-midi en lave 60 min, jusqu'à son départ à 21:00. W2 arrive à 20:30 : le tunnel est pris.
const SOIR = [ret('W1', 'NORD', '19:30'), ret('W2', 'SUD', '20:00')];

test('la nuit arrive une heure après le départ de l’après-midi : elle reprend d’abord le vol arrêté, pour sa durée restante', () => {
  // W1 : l'après-midi de 20:00 à 21:00 (60 min) ; personne à 21:00 ; la nuit le reprend à 22:00, pour ses 30 min : propre à 22:30.
  // W2, arrivé à 20:30, vient ensuite : de 22:30 à 00:00.
  const r = jouer(SOIR, [MATIN(), APM(), NUIT()]);
  assert.deepEqual(json(lot(r, 'W1')), { service: 'plonge', nom: 'Vol W1', vol: 'W1', cie: 'NORD', classes: [], retourVol: true, arrivee: h('20:00'), unites: 190, arret: 0,
    atelier: 'apm', debut: h('20:00'), fin: h('22:30'), duree: 90, attente: 0, impossible: false, tunnel: 1, nomTunnel: 'Tunnel 1', vitesse: 1,
    parts: [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:30', 30)] });
  assert.deepEqual([lot(r, 'W2').atelier, lot(r, 'W2').debut, lot(r, 'W2').fin, lot(r, 'W2').attente, 'parts' in lot(r, 'W2')], ['nuit', h('22:30'), h('24:00'), 120, false]);
  assert.deepEqual(r.saleFinal, [], 'le vol repris est propre : il sort du sale du soir');
  // Chaque équipe est créditée de sa part, et finit avec elle ; aucune heure sup. Le lot est dans la liste des deux équipes.
  assert.deepEqual([vue(r, 'apm').fin, vue(r, 'apm').travail, vue(r, 'apm').heuresSup], [h('21:00'), 60, 0]);
  assert.deepEqual([vue(r, 'nuit').fin, vue(r, 'nuit').travail, vue(r, 'nuit').heuresSup], [h('24:00'), 30 + 90, 0]);
  assert.deepEqual(vue(r, 'nuit').lots.map(l => l.vol), ['W1', 'W2'], 'la reprise d’abord');
  assert.equal(vue(r, 'apm').lots[0], vue(r, 'nuit').lots[0]);
  // La somme du travail des parts égale la durée du lavage ; le trou n'est pas un arrêt.
  assert.equal(lot(r, 'W1').parts.reduce((n, p) => n + p.travail, 0), lot(r, 'W1').duree);
  assert.equal(lot(r, 'W1').arret, 0);
  // Le matériel est propre à la fin de la reprise : 190 u sales de 20:00 à 20:30, 380 jusqu'à 22:30, 190 jusqu'à 00:00.
  const m = jouer(SOIR, [MATIN(), APM(), NUIT()], { materiel: { actif: true, stockInitial: 0 } });
  const niveau = t => { let n = 0; for (const [u, x] of m.plonge.serie) { if (u > t + 1e-9) break; n = x; } return n; };
  assert.deepEqual(['20:15', '21:30', '22:29', '22:30', '23:59', '24:00'].map(x => niveau(h(x))), [190, 380, 380, 190, 190, 0]);
  // Les indicateurs lisent les parts : l'après-midi 60 min au travail, la nuit de 22:00 à 00:00 ; les deux vols finis par la nuit.
  const args = { vols: [dep('NO1', 'NORD', '12:00'), ...SOIR], liaisons: [], rendement: 1, ateliers: [MATIN(), APM(), NUIT()], materiel: { actif: false, delaiRetour: 30 } };
  const k = I.journee(P.simuler(args), args), e = id => k.equipes.find(x => x.id === id);
  assert.deepEqual([e('apm').minutesAuTravail, e('apm').termines, e('nuit').minutesAuTravail, e('nuit').termines], [60, 0, 120, 2]);
});

test('la même journée sans équipe de nuit : le reste passe au lendemain', () => {
  const r = jouer(SOIR, [MATIN(), APM()]);
  assert.deepEqual([lot(r, 'W1').fin, lot(r, 'W1').impossible, lot(r, 'W1').fait, lot(r, 'W1').reste], [null, true, 60, 30]);
  assert.deepEqual(json(lot(r, 'W1').parts), [part('apm', '20:00', '21:00', 60)]);
  assert.deepEqual(r.saleFinal, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'W2', cie: 'SUD', unites: 190 }]);
});

test('une équipe qui arrive sans tunnel du même nom ne reprend pas', () => {
  // La nuit n'a qu'un « Tunnel 2 » : W1 reste arrêté ; W2, lui, entre dans son tunnel à son arrivée (22:00 → 23:30).
  const r = jouer(SOIR, [MATIN(), APM(), NUIT({ tunnels: [T('Tunnel 2')] })]);
  assert.deepEqual([lot(r, 'W1').fin, lot(r, 'W1').reste], [null, 30]);
  assert.deepEqual([lot(r, 'W2').atelier, lot(r, 'W2').debut, lot(r, 'W2').fin], ['nuit', h('22:00'), h('23:30')]);
  assert.deepEqual(r.saleFinal, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 30 }]);
  // Avec le « Tunnel 1 » en second tunnel : elle reprend W1 sur cette machine, son tunnel n° 2 ; W2 va à son « Tunnel 2 », libre.
  const avec = jouer(SOIR, [MATIN(), APM(), NUIT({ tunnels: [T('Tunnel 2'), T('Tunnel 1')] })]);
  assert.deepEqual(json(lot(avec, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:30', 30, { tunnel: 2 })]);
  assert.deepEqual([lot(avec, 'W2').tunnel, lot(avec, 'W2').debut, lot(avec, 'W2').fin, avec.saleFinal], [1, h('22:00'), h('23:30'), []]);
});

test('deux vols arrêtés sont repris dans l’ordre de leur arrêt', () => {
  // Deux équipes du matin, chacune son tunnel : la première part à 12:00, la seconde à 12:30. L'équipe qui arrive à 14:00 tient
  // les deux tunnels. V1 (180 min) entre à 10:30 dans le « Tunnel 1 » : 90 min lavées à 12:00, 90 restent. V2 entre à 11:00 dans
  // le « Tunnel 2 » : 90 min lavées à 12:30, 90 restent. À 14:00, elle reprend les deux, chacun sur sa machine ; V3, arrivé à
  // 14:10, attend la fin d'une reprise : 15:30 → 17:00.
  const a1 = plonge('a1', '06:00', 360), a2 = plonge('a2', '06:30', 360, { tunnels: [T('Tunnel 2')] });
  const x = plonge('x', '14:00', 480, { tunnels: [T('Tunnel 1'), T('Tunnel 2')] });
  const vols = [ret('V1', 'LONG', '10:00'), ret('V2', 'LONG', '10:30'), ret('V3', 'NORD', '13:40')];
  const r = jouer(vols, [a1, a2, x]);
  assert.deepEqual(json(lot(r, 'V1').parts), [part('a1', '10:30', '12:00', 90), reprise('x', '14:00', '15:30', 90)]);
  assert.deepEqual(json(lot(r, 'V2').parts), [part('a2', '11:00', '12:30', 90, { nomTunnel: 'Tunnel 2' }), reprise('x', '14:00', '15:30', 90, { tunnel: 2, nomTunnel: 'Tunnel 2' })]);
  assert.deepEqual([lot(r, 'V1').fin, lot(r, 'V2').fin, lot(r, 'V1').duree, lot(r, 'V2').duree], [h('15:30'), h('15:30'), 180, 180]);
  assert.deepEqual([lot(r, 'V3').atelier, lot(r, 'V3').debut, lot(r, 'V3').fin], ['x', h('15:30'), h('17:00')]);
  // Dans la liste de l'équipe : les reprises d'abord, dans l'ordre de leur arrêt (12:00, puis 12:30), puis le vol du jour.
  assert.deepEqual(vue(r, 'x').lots.map(l => [l.vol, l.parts ? l.parts[0].fin : null]), [['V1', h('12:00')], ['V2', h('12:30')], ['V3', null]]);
  assert.deepEqual([vue(r, 'x').travail, vue(r, 'x').fin, r.saleFinal], [270, h('17:00'), []]);
  // Elle ne tient que le « Tunnel 2 » : elle reprend V2 ; V1, sur une machine qu'elle ne tient pas, passe au lendemain.
  const un = jouer(vols.slice(0, 2), [a1, a2, plonge('x', '14:00', 480, { tunnels: [T('Tunnel 2')] })]);
  assert.deepEqual([lot(un, 'V1').fin, lot(un, 'V2').fin, un.saleFinal], [null, h('15:30'), [{ vol: 'V1', cie: 'LONG', unites: 190, reste: 90 }]]);
  // L'ordre des arrêts n'est pas celui des arrivées : le « Tunnel 1 » jusqu'à 12:30, le « Tunnel 2 » jusqu'à 12:00. V1, arrivé
  // le premier, s'arrête à 12:30 (120 min lavées, 60 restent) ; V2 s'arrête à 12:00 (60 min lavées, 120 restent). À 14:00,
  // chacun est repris sur sa machine ; la liste de l'équipe les donne dans l'ordre de leur arrêt : V2, puis V1.
  const b1 = plonge('b1', '06:00', 390), b2 = plonge('b2', '06:00', 360, { tunnels: [T('Tunnel 2')] });
  const inverse = jouer(vols.slice(0, 2), [b1, b2, x]);
  assert.deepEqual(json(lot(inverse, 'V1').parts), [part('b1', '10:30', '12:30', 120), reprise('x', '14:00', '15:00', 60)]);
  assert.deepEqual(json(lot(inverse, 'V2').parts), [part('b2', '11:00', '12:00', 60, { nomTunnel: 'Tunnel 2' }), reprise('x', '14:00', '16:00', 120, { tunnel: 2, nomTunnel: 'Tunnel 2' })]);
  assert.deepEqual(vue(inverse, 'x').lots.map(l => l.vol), ['V2', 'V1']);
  assert.deepEqual(inverse.lots.filter(l => l.retourVol).map(l => l.vol), ['V1', 'V2'], 'le journal reste dans l’ordre des arrivées');
});

test('la reprise va à la vitesse et aux pauses de l’équipe qui reprend ; trop courte, elle s’arrête à son tour', () => {
  // Un tunnel deux fois plus rapide : les 30 min restantes en 15 min ; le lot dure 75 min de tunnel.
  const vite = jouer(SOIR.slice(0, 1), [MATIN(), APM(), NUIT({ tunnels: [T('Tunnel 1', { vitesse: 2 })] })]);
  assert.deepEqual(json(lot(vite, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:15', 15, { vitesse: 2 })]);
  assert.deepEqual([lot(vite, 'W1').fin, lot(vite, 'W1').duree], [h('22:15'), 75]);
  // En pause de 22:00 à 22:15 : elle le reprend à son arrivée, le lave de 22:15 à 22:45.
  const pause = jouer(SOIR.slice(0, 1), [MATIN(), APM(), NUIT({ pauses: [{ de: '22:00', a: '22:15' }] })]);
  assert.deepEqual(json(lot(pause, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:45', 30, { arret: 15 })]);
  assert.deepEqual([lot(pause, 'W1').fin, lot(pause, 'W1').arret, vue(pause, 'nuit').arret], [h('22:45'), 15, 15]);
  // Une nuit de 20 min : 20 min lavées, 10 restent ; personne après elle : le reste passe au lendemain. W2 n'est pas commencé.
  const court = jouer(SOIR, [MATIN(), APM(), NUIT({ regime: { actif: true, seuils: [], presence: 20 } })]);
  assert.deepEqual([lot(court, 'W1').fin, lot(court, 'W1').fait, lot(court, 'W1').reste, lot(court, 'W1').impossible], [null, 80, 10, true]);
  assert.deepEqual(json(lot(court, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:20', 20)]);
  assert.deepEqual(court.saleFinal, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 10 }, { vol: 'W2', cie: 'SUD', unites: 190 }]);
  // Deux équipes qui se suivent sans se toucher, le matin jusqu'à 12:00, l'après-midi dès 13:00 : elle reprend à 13:00.
  const jour = jouer([ret('L1', 'LONG', '10:30')], [MATIN({ regime: { actif: true, seuils: [], presence: 360 } }), APM()]);
  assert.deepEqual(json(lot(jour, 'L1').parts), [part('matin', '11:00', '12:00', 60), reprise('apm', '13:00', '15:00', 120)]);
});

test('une nuit sous condition qui s’ouvre lave ce qui l’a fait venir : le lavage arrêté sur une de ses machines', () => {
  // Le matin : trois longs vols, de 06:00 à 15:00 (le dernier passe en relais à 14:00 : 60 min après sa présence, chaque jour).
  // Le soir, W1 s'arrête à 21:00, 30 min restent : c'est tout le retard. Seul, le matin le laverait d'abord (06:00 → 06:30), et
  // ses trois vols finiraient à 15:30 : 90 min après sa présence, 30 de plus que sans retard. Il ne l'absorbe pas : la nuit vient.
  const plein = [ret('A1', 'LONG', '05:30'), ret('A2', 'LONG', '08:30'), ret('A3', 'LONG', '11:30'), ret('W1', 'NORD', '19:30')];
  const r = jouer(plein, [MATIN(), APM(), NUIT({ condition: { mesure: 'absorbable' } })]);
  assert.deepEqual(vue(r, 'nuit').conditionSale, { mesure: 'absorbable', ouverte: true, equipe: 'matin', retard: { vols: 1, unites: 190 },
    absorbe: false, depassement: 30, lavees: 190, reste: 0, fin: h('22:00') + 480 });
  // Elle reprend W1 à son arrivée : elle n'est pas venue pour rien (avant la correction 19 : aucun lavage, W1 attendait le matin).
  assert.deepEqual(json(lot(r, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:30', 30)]);
  assert.deepEqual([vue(r, 'nuit').lots.length, vue(r, 'nuit').travail, r.saleFinal], [1, 30, []]);
  // Sur le sale aussi : W2 attend à 22:00, elle vient ; W1 d'abord, puis W2.
  const sale = jouer(SOIR, [MATIN(), APM(), NUIT({ condition: { mesure: 'sale' } })]);
  assert.deepEqual([vue(sale, 'nuit').conditionSale.ouverte, vue(sale, 'nuit').lots.map(l => l.vol), sale.saleFinal], [true, ['W1', 'W2'], []]);
  // Fermée (le matin absorbe le retard) : personne pour reprendre, le reste passe au lendemain.
  const calme = jouer(SOIR.slice(0, 1), [MATIN(), APM(), NUIT({ condition: { mesure: 'absorbable' } })]);
  assert.deepEqual([vue(calme, 'nuit').conditionSale.ouverte, vue(calme, 'nuit').personnes, calme.saleFinal], [false, 0, [{ vol: 'W1', cie: 'NORD', unites: 190, reste: 30 }]]);
});

test('des chaînes : relais, arrêt, reprise, relais ; une reprise arrêtée et reprise encore', () => {
  // L (180 min) arrive à 13:00. Le matin en lave 60 min et le passe en relais à 14:00 à l'après-midi (13:00 → 15:00), qui en
  // lave 60 ; à 15:00, personne : arrêt, 60 restent. Le soir (16:00 → 16:30) le reprend à son arrivée et en lave 30 ; à 16:30,
  // l'équipe « fin » (arrivée à 16:15) est là : relais, de 16:30 à 17:00. Un seul lot, quatre parts.
  const L = ret('L', 'LONG', '12:30');
  const r = jouer([L], [MATIN(), plonge('apm', '13:00', 120), plonge('soir', '16:00', 30), plonge('fin', '16:15', 240)]);
  assert.deepEqual(json(lot(r, 'L').parts), [part('matin', '13:00', '14:00', 60), part('apm', '14:00', '15:00', 60), reprise('soir', '16:00', '16:30', 30), part('fin', '16:30', '17:00', 30)]);
  assert.deepEqual([lot(r, 'L').fin, lot(r, 'L').duree, lot(r, 'L').impossible, r.saleFinal], [h('17:00'), 180, false, []]);
  // W1 : l'après-midi jusqu'à 21:00 (60 min), la nuit de 22:00 à 22:20 (20 min), puis l'aube, arrivée à 23:00, pour les 10 min
  // qui restent : deux reprises, propre à 23:10.
  const deux = jouer(SOIR.slice(0, 1), [MATIN(), APM(), NUIT({ regime: { actif: true, seuils: [], presence: 20 } }), plonge('aube', '23:00', 240)]);
  assert.deepEqual(json(lot(deux, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:20', 20), reprise('aube', '23:00', '23:10', 10)]);
  assert.deepEqual([lot(deux, 'W1').fin, lot(deux, 'W1').duree, deux.saleFinal], [h('23:10'), 90, []]);
});

test('qui reprend : la première arrivée ; à la même heure, celle qui part le plus tard ; jamais une équipe qui ne laverait rien', () => {
  const W1 = SOIR.slice(0, 1);
  // Deux équipes arrivent à 22:00 : la courte (30 min) et la longue. La longue reprend.
  const ensemble = jouer(W1, [MATIN(), APM(), plonge('courte', '22:00', 30), plonge('longue', '22:00', 240)]);
  assert.deepEqual(json(lot(ensemble, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('longue', '22:00', '22:30', 30)]);
  // La première arrivée reprend, même si une autre, arrivée après, part plus tard.
  const premiere = jouer(W1, [MATIN(), APM(), plonge('tard', '22:15', 480), plonge('tot', '22:00', 60)]);
  assert.deepEqual(json(lot(premiere, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('tot', '22:00', '22:30', 30)]);
  // Une équipe en pause pendant toute sa présence (22:00 → 22:20) ne reprend pas : c'est la suivante, à 23:00. Elle n'a aucun lot.
  const pause = jouer(W1, [MATIN(), APM(), NUIT({ regime: { actif: true, seuils: [], presence: 20 }, pauses: [{ de: '22:00', a: '22:30' }] }), plonge('aube', '23:00', 240)]);
  assert.deepEqual(json(lot(pause, 'W1').parts), [part('apm', '20:00', '21:00', 60), reprise('aube', '23:00', '23:30', 30)]);
  assert.deepEqual([vue(pause, 'nuit').lots.length, vue(pause, 'nuit').travail], [0, 0]);
  // Une équipe sans fin de présence (sans régime) finit la reprise.
  const sansFin = jouer(W1, [MATIN(), APM(), NUIT({ regime: { actif: false } })]);
  assert.deepEqual([json(lot(sansFin, 'W1').parts), lot(sansFin, 'W1').fin], [[part('apm', '20:00', '21:00', 60), reprise('nuit', '22:00', '22:30', 30)], h('22:30')]);
  // Une équipe du matin réglée sur J+1 fait partie de la journée jouée : elle reprend à son arrivée, à 06:00 le lendemain
  // (comme elle lavait déjà, avant, les vols que personne n'avait commencés).
  const demain = jouer(W1, [MATIN(), APM(), plonge('demain', '06:00', 480, { jour: 1 })]);
  assert.deepEqual(json(lot(demain, 'W1').parts), [part('apm', '20:00', '21:00', 60), { ...reprise('demain', '06:00', '06:30', 30), debut: h('06:00') + 1440, fin: h('06:30') + 1440 }]);
  assert.deepEqual(demain.saleFinal, []);
});

test('le planning des équipes lit l’heure de la reprise : « repris par … à » l’arrivée de l’équipe, pas à l’arrêt', () => {
  const PV = require('../planning-vue.js');
  const r = jouer(SOIR.slice(0, 1), [MATIN(), APM(), NUIT()]), w1 = lot(r, 'W1');
  const apm = PV.lotTenu(w1, { id: 'apm' }), nuit = PV.lotTenu(w1, { id: 'nuit' });
  assert.deepEqual([apm.debut, apm.fin, apm.relais.vers, apm.relais.propre], [h('20:00'), h('21:00'), { nom: 'nuit', a: h('22:00') }, h('22:30')]);
  assert.deepEqual([nuit.debut, nuit.fin, nuit.relais.de, nuit.relais.propre], [h('22:00'), h('22:30'), { nom: 'apm' }, h('22:30')]);
  // Un relais : l'équipe suivante le prend à la fin de la part, comme avant.
  const relais = jouer([ret('L1', 'LONG', '11:30')], [MATIN(), APM()]);
  assert.deepEqual(PV.lotTenu(lot(relais, 'L1'), { id: 'matin' }).relais.vers, { nom: 'apm', a: h('14:00') });
});

/* ---- non-régression : sans lavage arrêté qu'une équipe puisse reprendre, rien ne change ------------- */
// Les empreintes des résultats, relevées avec le moteur d'avant la correction 19 (commit a8d0952).
const empreinte = r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
const AVANT = { relais: 'c7a746551cc08aab', sansEquipeApres: '2e8498c92bc9491f', autreTunnel: '6e87363ce51c3f33', calme: 'af1a441b7d884f9f' };
const M = { materiel: { actif: true, stockInitial: 0 } };
const RELAIS = [ret('L1', 'LONG', '11:30'), ret('V2', 'NORD', '14:00')];

test('non-régression : une journée sans lavage arrêté est celle d’avant, champ par champ', () => {
  // Un relais, une nuit présente mais aucun lavage arrêté ; puis une journée où rien n'atteint une fin de présence.
  const r = jouer(RELAIS, [MATIN(), APM(), NUIT()], M);
  assert.ok(r.lots.filter(l => l.retourVol).every(l => !l.impossible && !(l.parts || []).some(p => p.reprise)));
  assert.equal(empreinte(r), AVANT.relais);
  const calme = [ret('C1', 'NORD', '06:30'), ret('C2', 'LONG', '08:00'), ret('C3', 'SUD', '13:30'), ret('C4', 'NORD', '15:00')];
  assert.equal(empreinte(jouer(calme, [MATIN(), APM(), NUIT()], M)), AVANT.calme);
});

test('non-régression : un lavage arrêté que personne ne peut reprendre reste celui d’avant', () => {
  // Aucune équipe après l'après-midi ; puis une nuit sans tunnel du même nom.
  assert.equal(empreinte(jouer([...RELAIS, ...SOIR], [MATIN(), APM()], M)), AVANT.sansEquipeApres);
  assert.equal(empreinte(jouer([...RELAIS, ...SOIR], [MATIN(), APM(), NUIT({ tunnels: [T('Tunnel 2')] })], M)), AVANT.autreTunnel);
});

test('déterministe : la même journée, deux fois', () => {
  const une = () => JSON.stringify(jouer([...RELAIS, ...SOIR], [MATIN(), APM(), NUIT({ condition: { mesure: 'absorbable' } })]));
  assert.equal(une(), une());
});
