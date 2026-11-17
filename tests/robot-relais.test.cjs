/* Évolution 21 (a) — le relais sur la ligne du robot.
 *
 * La règle de terrain : deux équipes de robot se suivent sur la même ligne.
 * Quand la première a fini ses propres commandes et qu'il lui reste du temps,
 * elle avance le travail de la suivante, vol par vol, autant qu'elle peut.
 * Elle ne s'arrête jamais au milieu d'un vol : sa pause se prend à la fin du
 * vol. L'équipe suivante reprend là où la première s'est arrêtée.
 *
 * Des journées fictives, calculées à la main : la ligne fait 60 plateaux par
 * heure, un plateau prend donc une minute. Les compagnies (XA … XE), les vols
 * et les équipes sont inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const vol = (id, cie, std, yc) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc });
// XA : 120 plateaux ; XB : 90 ; XC : trois vols de 60, 30 et 90 plateaux (dans l'ordre des départs) ; XD : 40 ; XE : 100 et 50.
const VOLS = [vol('XA1', 'XA', '18:00', 120), vol('XB1', 'XB', '19:00', 90),
  vol('XC1', 'XC', '20:00', 60), vol('XC2', 'XC', '21:00', 30), vol('XC3', 'XC', '22:00', 90)];
const VOLS_DE = vol('XD1', 'XD', '23:00', 40), VOLS_E = [vol('XE1', 'XE', '23:10', 100), vol('XE2', 'XE', '23:20', 50)];
const presence = minutes => ({ actif: true, presence: minutes, seuils: [] });
const robot = (id, debut, lots, p) => ({ id, nom: id, service: 'robot', type: 'robot', debut, jour: 0, personnes: 3, personnesMin: 2,
  debit: 60, lots, pauses: [], regime: presence(480), ...p });
const jouer = (ateliers, p) => P.simuler({ vols: VOLS, liaisons: [], bareme: {}, rendement: 1, ateliers, ...p });
const lot = (r, classe) => r.lots.filter(l => (l.classes || []).includes(classe));
const vue = (r, id) => r.ateliers.find(v => v.id === id);
const hm = l => [P.hhmm(l.debut), l.fin == null ? null : P.hhmm(l.fin)];
const part = (l, id) => (l.parts || []).find(x => x.atelier === id);
const empreinte = r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);

// Le matin : sa commande XA (120 min, de 05:00 à 07:00). Le soir : XB, puis XC.
const MATIN = p => robot('matin', '05:00', [['XA/YC']], p);
const SOIR = (debut, p) => robot('soir', debut, [['XB/YC'], ['XC/YC']], p);

test('deux équipes sur une ligne : la première, ses commandes finies, avance les vols de la dernière commande de la suivante, dans l’ordre des départs', () => {
  const r = jouer([MATIN(), SOIR('08:30')]);
  // Le matin : XA de 05:00 à 07:00, puis XC1 (60 min) et XC2 (30 min) ; à 08:30 le soir est là : il ne commence plus rien.
  assert.deepEqual(hm(lot(r, 'XA/YC')[0]), ['05:00', '07:00']);
  const xc = lot(r, 'XC/YC');
  assert.equal(xc.length, 1, 'une seule commande, avec ses parts');
  assert.equal(xc[0].atelier, 'soir', 'la commande reste celle de l’équipe qui l’a dans sa liste');
  assert.deepEqual(xc[0].parts, [
    { atelier: 'matin', debut: h('07:00'), fin: h('08:30'), travail: 90, arret: 0, plateaux: 90, vols: ['XC1', 'XC2'], avance: true },
    { atelier: 'soir', debut: h('10:00'), fin: h('11:30'), travail: 90, arret: 0, plateaux: 90, vols: ['XC3'] }]);
  // Le soir : sa première commande, XB, de 08:30 à 10:00 ; puis le reste de la commande entamée, XC3, de 10:00 à 11:30.
  const xb = lot(r, 'XB/YC');
  assert.equal(xb.length, 1); assert.equal(xb[0].parts, undefined, 'une commande que personne n’a avancée n’a pas de parts');
  assert.deepEqual(hm(xb[0]), ['08:30', '10:00']);
  assert.deepEqual([hm(xc[0]), xc[0].duree, xc[0].impossible, xc[0].plateaux], [['07:00', '11:30'], 180, false, 180]);
  // Aucun vol n'est fait deux fois, aucun n'est oublié ; la somme des plateaux des parts égale ceux de la commande.
  assert.deepEqual(xc[0].parts.flatMap(x => x.vols), ['XC1', 'XC2', 'XC3']);
  assert.equal(xc[0].parts.reduce((n, x) => n + x.plateaux, 0), 180);
  // Chaque équipe est créditée de sa part.
  assert.deepEqual([vue(r, 'matin').travail, P.hhmm(vue(r, 'matin').fin), vue(r, 'matin').lots.length], [210, '08:30', 2]);
  assert.deepEqual([vue(r, 'soir').travail, P.hhmm(vue(r, 'soir').fin), vue(r, 'soir').lots.length], [180, '11:30', 2]);
  assert.ok(vue(r, 'matin').lots.includes(xc[0]) && vue(r, 'soir').lots.includes(xc[0]), 'la commande en relais est dans la liste des deux équipes');
  // La commande est prête pour l'aval à la fin de sa dernière part ; rien n'est signalé.
  assert.equal(r.parClasse['XC/YC'].fin, h('11:30'));
  assert.deepEqual(r.anomalies.filter(x => ['poste', 'inacheve'].includes(x.code)), []);
});

test('la ligne tourne le même temps au total qu’avant ; l’équipe suivante finit plus tôt, de la durée avancée', () => {
  // « Avant » : la présence du matin finit avec sa commande (07:00), il n'avance rien.
  const avant = jouer([MATIN({ regime: presence(120) }), SOIR('08:30')]), apres = jouer([MATIN(), SOIR('08:30')]);
  const ligne = r => r.lots.reduce((n, l) => n + l.duree, 0);
  assert.equal(lot(avant, 'XC/YC')[0].parts, undefined);
  assert.deepEqual(hm(lot(avant, 'XC/YC')[0]), ['10:00', '13:00'], 'sans relais : XB de 08:30 à 10:00, puis XC, 180 min');
  assert.deepEqual([ligne(avant), ligne(apres)], [390, 390]);
  assert.deepEqual([P.hhmm(vue(avant, 'soir').fin), P.hhmm(vue(apres, 'soir').fin)], ['13:00', '11:30'], '90 min avancées : 90 min plus tôt');
});

test('une pause due au milieu d’un vol avancé : le vol se finit, la pause se prend après, pour sa durée entière', () => {
  // Une pause à heure fixe, de 07:30 à 08:00 : XC1 va de 07:00 à 08:00 sans s'arrêter ; la pause, de 08:00 à 08:30 ; XC2, de 08:30 à 09:00.
  const fixe = jouer([MATIN({ pauses: [{ de: '07:30', a: '08:00' }] }), SOIR('09:00')]);
  assert.deepEqual(vue(fixe, 'matin').pausesPrises, [{ de: h('08:00'), a: h('08:30') }]);
  assert.deepEqual(part(lot(fixe, 'XC/YC')[0], 'matin'), { atelier: 'matin', debut: h('07:00'), fin: h('09:00'), travail: 90, arret: 30, plateaux: 90, vols: ['XC1', 'XC2'], avance: true });
  // Une pause de régime, due après 150 min de travail (à 07:30, au milieu de XC1) : 20 min, de 08:00 à 08:20 ; XC2 de 08:20 à 08:50.
  const regime = jouer([MATIN({ regime: { actif: true, presence: 480, seuils: [{ apres: 150, duree: 20 }] } }), SOIR('08:50')]);
  assert.deepEqual(vue(regime, 'matin').pausesPrises, [{ de: h('08:00'), a: h('08:20') }]);
  assert.deepEqual(part(lot(regime, 'XC/YC')[0], 'matin'), { atelier: 'matin', debut: h('07:00'), fin: h('08:50'), travail: 90, arret: 20, plateaux: 90, vols: ['XC1', 'XC2'], avance: true });
  // Les propres commandes d'une équipe gardent les pauses d'aujourd'hui : XA s'arrête à la pause de 06:00.
  const propre = jouer([MATIN({ pauses: [{ de: '06:00', a: '06:30' }] }), SOIR('09:30')]);
  assert.deepEqual(hm(lot(propre, 'XA/YC')[0]), ['05:00', '07:30']);
  assert.equal(lot(propre, 'XA/YC')[0].arret, 30);
});

test('un vol qui ne tient pas avant la fin de la présence n’est pas commencé : aucune heure sup pour la première équipe', () => {
  // Le matin est là jusqu'à 08:20 : XC1 (07:00–08:00) tient ; XC2 (30 min) finirait à 08:30 : il n'est pas commencé.
  const r = jouer([MATIN({ regime: presence(200) }), SOIR('09:00')], { heuresSup: { actif: true, plafond: 120 } });
  const xc = lot(r, 'XC/YC')[0];
  assert.deepEqual(part(xc, 'matin').vols, ['XC1']);
  assert.deepEqual([P.hhmm(vue(r, 'matin').fin), vue(r, 'matin').heuresSup, vue(r, 'matin').heuresSupPersonnes], ['08:00', 0, 0]);
  // Le soir : XB de 09:00 à 10:30, puis XC2 et XC3 (120 min) de 10:30 à 12:30.
  assert.deepEqual(part(xc, 'soir'), { atelier: 'soir', debut: h('10:30'), fin: h('12:30'), travail: 120, arret: 0, plateaux: 120, vols: ['XC2', 'XC3'] });
});

test('l’équipe suivante arrive pendant un vol avancé : le vol se finit, elle attend la ligne, puis commence ; la première ne commence plus rien pour elle', () => {
  const r = jouer([MATIN(), SOIR('08:15')]);
  // XC2 est commencé à 08:00, avant l'arrivée du soir (08:15) : il se finit à 08:30. Le soir attend la ligne 15 min.
  const xb = lot(r, 'XB/YC')[0], xc = lot(r, 'XC/YC')[0];
  assert.deepEqual([hm(xb), xb.attenteLigne], [['08:30', '10:00'], 15]);
  assert.deepEqual(part(xc, 'matin').vols, ['XC1', 'XC2']);
  assert.equal(part(xc, 'matin').fin, h('08:30'));
  assert.deepEqual([part(xc, 'soir').vols, part(xc, 'soir').debut], [['XC3'], h('10:00')]);
  assert.equal(P.hhmm(vue(r, 'matin').fin), '08:30');
});

test('la première équipe sous son minimum de personnes n’avance rien', () => {
  // Une personne pour un minimum de deux, sans commande à elle ce jour-là : elle n'est pas armée.
  const r = jouer([robot('matin', '05:00', [], { personnes: 1 }), SOIR('09:00')]);
  assert.deepEqual(r.lots.filter(l => l.parts), []);
  assert.deepEqual([hm(lot(r, 'XB/YC')[0]), hm(lot(r, 'XC/YC')[0])], [['09:00', '10:30'], ['10:30', '13:30']]);
  assert.equal(vue(r, 'matin').travail, 0);
  // Armée, la même équipe avance dès son arrivée : XC (180 min) de 05:00 à 08:00, puis XB (90 min) jusqu'à 09:30 ; rien ne reste au soir.
  const armee = jouer([robot('matin', '05:00', []), SOIR('09:00')]);
  assert.deepEqual([hm(lot(armee, 'XC/YC')[0]), hm(lot(armee, 'XB/YC')[0])], [['05:00', '08:00'], ['08:00', '09:30']]);
  assert.deepEqual(lot(armee, 'XC/YC')[0].parts.map(x => x.atelier), ['matin'], 'une commande avancée en entier : une seule part');
  assert.deepEqual([vue(armee, 'soir').travail, vue(armee, 'soir').lots.length], [0, 0]);
});

test('un vol dont l’amont n’est pas prêt n’est pas avancé ; le suivant dans l’ordre non plus, sauf en ordre souple', () => {
  // La préparation (une personne) livre XB à 06:00 (60 min pour son vol) et XC à 08:00 (40 min par vol, trois vols).
  const prepa = { id: 'prep', nom: 'prep', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, lots: [['XB/YC'], ['XC/YC']], pauses: [], regime: presence(480) };
  const args = { liaisons: [{ from: 'prepa', to: 'robot' }], bareme: { prepa: { 'XB/YC': 60, 'XC/YC': 40 } } };
  // L'ordre d'aujourd'hui (strict) : la première commande dans l'ordre de l'avance (XC, la dernière de la liste) n'est pas
  // prête à 07:00 ; le matin l'attend, sans prendre XB, pourtant prêt. Le soir arrive à 07:45 : rien n'est avancé.
  const strict = jouer([prepa, MATIN(), SOIR('07:45')], args);
  assert.deepEqual(strict.lots.filter(l => l.parts), []);
  assert.deepEqual([hm(lot(strict, 'XB/YC')[1]), hm(lot(strict, 'XC/YC')[1])], [['07:45', '09:15'], ['09:15', '12:15']]);
  // L'amont livre avant l'arrivée du soir (09:00) : le matin attend 08:00, puis avance XC1, de 08:00 à 09:00.
  const attendu = jouer([prepa, MATIN(), SOIR('09:00')], args), xc = lot(attendu, 'XC/YC').find(l => l.service === 'robot');
  assert.deepEqual(part(xc, 'matin'), { atelier: 'matin', debut: h('08:00'), fin: h('09:00'), travail: 60, arret: 0, plateaux: 60, vols: ['XC1'], avance: true });
  // En ordre souple (l'option du modèle), le matin prend la première commande prête dans l'ordre de l'avance : XB, de 07:00 à 08:30.
  const souple = jouer([prepa, MATIN(), SOIR('07:45')], { ...args, ordreSouple: { actif: true } }), xb = lot(souple, 'XB/YC').find(l => l.service === 'robot');
  assert.deepEqual(xb.parts, [{ atelier: 'matin', debut: h('07:00'), fin: h('08:30'), travail: 90, arret: 0, plateaux: 90, vols: ['XB1'], avance: true }]);
  assert.deepEqual(hm(lot(souple, 'XC/YC').find(l => l.service === 'robot')), ['08:30', '11:30'], 'le soir attend la ligne, puis fait XC en entier');
});

test('la commande au plus petit temps par vol est avancée d’abord, où qu’elle soit dans la liste ; à égalité, la dernière de la liste ; puis la suivante dans cet ordre', () => {
  // Le barème du service du robot : XB et XD à 5 min par vol, XC à 12. L'ordre de l'avance : XD (à égalité, la dernière), XB, puis XC.
  const r = P.simuler({ vols: VOLS.concat(VOLS_DE), liaisons: [], rendement: 1, bareme: { robot: { 'XB/YC': 5, 'XC/YC': 12, 'XD/YC': 5 } },
    ateliers: [MATIN(), robot('soir', '09:30', [['XB/YC'], ['XC/YC'], ['XD/YC']])] });
  // XD1 (40 min) de 07:00 à 07:40 ; XB1 (90 min) jusqu'à 09:10 ; XC1 (60 min), commencé à 09:10, fini à 10:10.
  assert.deepEqual([hm(lot(r, 'XD/YC')[0]), hm(lot(r, 'XB/YC')[0])], [['07:00', '07:40'], ['07:40', '09:10']]);
  assert.deepEqual(r.lots.filter(l => l.parts).map(l => l.classes[0]), ['XD/YC', 'XB/YC', 'XC/YC'], 'dans l’ordre de l’avance');
  const xc = lot(r, 'XC/YC')[0];
  assert.deepEqual([part(xc, 'matin').vols, part(xc, 'soir').vols, hm(xc)], [['XC1'], ['XC2', 'XC3'], ['09:10', '12:10']]);
  // Le soir (09:30) : XB et XD sont faits ; il attend la ligne jusqu'à 10:10, puis fait XC2 et XC3.
  assert.deepEqual([vue(r, 'soir').travail, P.hhmm(vue(r, 'soir').fin)], [120, '12:10']);
  // Les commandes avancées en entier sont livrées à la fin de leur part.
  assert.deepEqual([r.parClasse['XD/YC'].fin, r.parClasse['XB/YC'].fin], [h('07:40'), h('09:10')]);
});

test('trois équipes sur une ligne : chacune avance pour celle qui la suit', () => {
  const r = P.simuler({ vols: VOLS.concat(VOLS_DE, VOLS_E), liaisons: [], bareme: {}, rendement: 1,
    ateliers: [MATIN(), SOIR('09:00'), robot('nuit', '13:00', [['XD/YC'], ['XE/YC']])] });
  // Le matin avance XC pour le soir : XC1, XC2, puis XC3, commencé à 08:30 et fini à 10:00.
  assert.deepEqual(lot(r, 'XC/YC')[0].parts.map(x => [x.atelier, x.vols.join(' ')]), [['matin', 'XC1 XC2 XC3']]);
  // Le soir (09:00) attend la ligne, fait XB de 10:00 à 11:30, puis avance XE pour la nuit : XE1 (100 min), de 11:30 à 13:10.
  assert.deepEqual(hm(lot(r, 'XB/YC')[0]), ['10:00', '11:30']);
  const xe = lot(r, 'XE/YC')[0];
  assert.deepEqual(part(xe, 'soir'), { atelier: 'soir', debut: h('11:30'), fin: h('13:10'), travail: 100, arret: 0, plateaux: 100, vols: ['XE1'], avance: true });
  // La nuit (13:00) attend la ligne : XD de 13:10 à 13:50, puis XE2 de 13:50 à 14:40. Le matin n'avance rien pour elle.
  assert.deepEqual([hm(lot(r, 'XD/YC')[0]), lot(r, 'XD/YC')[0].parts], [['13:10', '13:50'], undefined]);
  assert.deepEqual(part(xe, 'nuit'), { atelier: 'nuit', debut: h('13:50'), fin: h('14:40'), travail: 50, arret: 0, plateaux: 50, vols: ['XE2'] });
});

test('l’équipe suivante est celle du même jour de travail, sur la même ligne ; une équipe sous condition qui ne vient pas n’en est pas une', () => {
  // Un autre jour de travail : pas de relais.
  const veille = jouer([MATIN({ jour: -1 }), SOIR('08:30')]);
  assert.deepEqual(veille.lots.filter(l => l.parts), []);
  // Le soir ne vient qu'à partir de 9 vols (il y en a 5) : ses commandes passent à la nuit, que le matin avance alors.
  const r = jouer([MATIN(), SOIR('08:30', { condition: { mesure: 'vols', seuil: 9, sinon: 'nuit' } }), robot('nuit', '13:00', [])]);
  assert.deepEqual(r.ateliers.map(v => v.id), ['matin', 'nuit']);
  assert.deepEqual(r.lots.filter(l => l.parts).map(l => [l.atelier, l.parts.map(x => x.atelier).join()]), [['nuit', 'matin'], ['nuit', 'matin']]);
});

test('la suivante ne finit pas la commande entamée : elle la tient, la première équipe ne fait pas d’heure sup', () => {
  // Le soir part à 10:40 (présence jusqu'à 10:10, 30 min d'heures sup) : XC3, commencé à 10:00, est coupé après 40 min.
  const r = jouer([MATIN(), SOIR('08:30', { regime: presence(100) })], { heuresSup: { actif: true, plafond: 30 } });
  const xc = lot(r, 'XC/YC')[0];
  assert.deepEqual([xc.fin, xc.impossible, xc.horsPoste, xc.fait, xc.duree], [null, true, true, 130, 180]);
  assert.deepEqual(xc.parts.map(x => [x.atelier, x.travail]), [['matin', 90], ['soir', 40]]);
  assert.deepEqual([vue(r, 'matin').heuresSup, vue(r, 'soir').heuresSup], [0, 30]);
  assert.deepEqual(r.anomalies.filter(x => x.code === 'poste').map(x => x.atelier), ['soir'], 'le poste qui finit avant est celui du soir');
});

test('la suivante part sans avoir repris la commande entamée : aucune heure sup pour elle non plus', () => {
  // 40 unités propres, 10 par vol : XA, XC1 et XC2 (le matin), puis XB (le soir) ; rien pour XC3. Le soir finit XB à
  // 10:00, la fin de sa présence : en heures sup, il n'attend pas son matériel, il part. Il n'a rien fait après sa présence.
  const consomme = { materiel: 'consomme' };
  const r = jouer([MATIN(consomme), SOIR('08:30', { ...consomme, regime: presence(90) })],
    { heuresSup: { actif: true, plafond: 60 }, materiel: { actif: true, unites: { YC: { parVol: 10 } }, stockInitial: 40, delaiRetour: 30 } });
  const xc = lot(r, 'XC/YC')[0];
  assert.deepEqual(xc.parts.map(x => [x.atelier, x.travail, x.vols.join(' ')]), [['matin', 90, 'XC1 XC2'], ['soir', 0, '']]);
  assert.deepEqual([xc.impossible, xc.horsPoste, xc.fait], [true, true, 90], 'le travail fait est celui du matin');
  assert.deepEqual([vue(r, 'soir').travail, vue(r, 'soir').heuresSup, vue(r, 'soir').heuresSupPersonnes, vue(r, 'matin').heuresSup], [90, 0, 0, 0]);
});

test('la ligne s’arrête pendant un vol avancé : le vol s’arrête avec elle, et reprend', () => {
  // Un arrêt de la ligne de 07:30 à 07:45 : XC1 va de 07:00 à 08:15 ; XC2, de 08:15 à 08:45.
  const r = jouer([MATIN({ arretsLigne: [{ de: '07:30', a: '07:45' }] }), SOIR('08:45')]);
  assert.deepEqual(part(lot(r, 'XC/YC')[0], 'matin'), { atelier: 'matin', debut: h('07:00'), fin: h('08:45'), travail: 90, arret: 15, plateaux: 90, vols: ['XC1', 'XC2'], avance: true });
});

test('la suivante arrive pendant le premier vol avancé et ne peut pas travailler : une seule ligne, qu’elle tient sans l’avoir reprise', () => {
  // Le soir (une personne pour un minimum de deux) arrive à 07:30, pendant XC1 : il reste bloqué sur XB, n'arrive jamais à XC.
  const r = jouer([MATIN(), SOIR('07:30', { personnes: 1 })]);
  const xc = lot(r, 'XC/YC');
  assert.equal(xc.length, 1);
  assert.deepEqual([xc[0].fin, xc[0].impossible, xc[0].horsPoste, xc[0].fait], [null, true, undefined, 60]);
  assert.deepEqual(xc[0].parts.map(x => [x.atelier, x.travail, x.vols.join(' ')]), [['matin', 60, 'XC1'], ['soir', 0, '']]);
  assert.ok(vue(r, 'soir').lots.includes(xc[0]));
  // On le dit comme pour une commande que l'équipe n'a jamais préparée ; le matin n'a rien à se reprocher.
  assert.deepEqual(r.anomalies.filter(x => x.code === 'inacheve').map(x => [x.atelier, x.classes]), [['soir', ['XC/YC']]]);
  assert.deepEqual(r.anomalies.filter(x => x.code === 'poste'), []);
  assert.equal(vue(r, 'matin').heuresSup, 0);
});

test('un vol dont le matériel n’est pas là n’est pas avancé', () => {
  // 20 unités propres, 10 par vol : XA en prend 10, XC1 les 10 autres ; rien pour XC2. Le soir attend son matériel pour XB.
  const consomme = { materiel: 'consomme' };
  const r = jouer([MATIN(consomme), SOIR('09:00', consomme)], { materiel: { actif: true, unites: { YC: { parVol: 10 } }, stockInitial: 20, delaiRetour: 30 } });
  const xc = lot(r, 'XC/YC');
  assert.equal(xc.length, 1);
  assert.deepEqual(xc[0].parts.map(x => [x.atelier, x.vols.join(' ')]), [['matin', 'XC1'], ['soir', '']]);
  assert.deepEqual([P.hhmm(vue(r, 'matin').fin), xc[0].impossible], ['08:00', true]);
  assert.deepEqual(r.anomalies.filter(x => x.code === 'materiel').map(x => x.atelier), ['soir']);
  assert.deepEqual([r.materiel.minPropre, r.materiel.consommees], [0, 20], 'le matériel pris pour l’avance est compté');
});

test('une pause due sans vol derrière n’est pas prise : la journée est celle d’avant', () => {
  // La pause du matin va de 07:00 à 07:45 ; le soir arrive à 07:30 : aucun vol ne commencerait avant son arrivée.
  const r = jouer([MATIN({ pauses: [{ de: '07:00', a: '07:45' }] }), SOIR('07:30')]);
  assert.deepEqual([r.lots.filter(l => l.parts), vue(r, 'matin').pausesPrises, vue(r, 'matin').arret], [[], [], 0]);
  // Avec un vol derrière (le soir arrive à 09:00) : la pause, puis XC1 de 07:45 à 08:45…
  const avec = jouer([MATIN({ pauses: [{ de: '07:00', a: '07:45' }] }), SOIR('09:00')]);
  assert.deepEqual(vue(avec, 'matin').pausesPrises, [{ de: h('07:00'), a: h('07:45') }]);
  // … puis XC2, commencé à 08:45, avant l'arrivée du soir.
  assert.deepEqual(hm(part(lot(avec, 'XC/YC')[0], 'matin')), ['07:45', '09:15']);
});

test('avec les renforts : une équipe qui ne peut rien avancer tout de suite prête ses personnes, comme avant', () => {
  // La préparation (une personne, là de 05:00 à 09:00) a 60 min pour XB puis 300 min pour XC : elle dépasse. Elle fournit le robot.
  const prepa = { id: 'prep', nom: 'prep', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, lots: [['XB/YC'], ['XC/YC']], pauses: [], regime: presence(240) };
  const args = { liaisons: [{ from: 'prepa', to: 'robot' }], bareme: { prepa: { 'XB/YC': 60, 'XC/YC': 100 } }, renforts: { actif: true, polyvalence: { robot: ['prepa'] } } };
  // À 07:00, XC (la première dans l'ordre de l'avance) n'est pas prêt : le matin n'attend pas, il va aider la préparation.
  const r = jouer([prepa, MATIN(), SOIR('09:00')], args), seul = jouer([prepa, MATIN(), SOIR('09:00', { lignePropre: true })], args);
  assert.deepEqual(r.lots.filter(l => l.parts && !l.retourVol), []);
  assert.ok(vue(r, 'matin').renfortsPretes > 0);
  assert.equal(JSON.stringify(vue(r, 'matin')), JSON.stringify(vue(seul, 'matin')), 'le matin fait la même journée que s’il n’avait pas d’équipe suivante');
  assert.equal(JSON.stringify(vue(r, 'prep')), JSON.stringify(vue(seul, 'prep')));
});

test('non-régression, champ par champ : sans temps libre, seule sur sa ligne, en « ligne propre », sans robot', () => {
  const manuel = (id, debut, lots) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut, jour: 0, personnes: 2, lots, pauses: [], regime: presence(480) });
  const journees = {
    // La première équipe finit ses commandes (08:30) après l'arrivée de la suivante (08:00).
    sansTempsLibre: jouer([robot('matin', '05:00', [['XA/YC'], ['XB/YC']]), robot('soir', '08:00', [['XC/YC']])]),
    seule: jouer([robot('matin', '05:00', [['XA/YC'], ['XB/YC'], ['XC/YC']])]),
    lignePropre: jouer([MATIN({ lignePropre: true }), SOIR('08:30', { lignePropre: true })]),
    sansRobot: jouer([manuel('m1', '05:00', [['XA/YC'], ['XB/YC']]), manuel('m2', '08:30', [['XC/YC']])], { bareme: { prepa: { 'XA/YC': 30, 'XB/YC': 30, 'XC/YC': 30 } } })
  };
  for (const r of Object.values(journees)) assert.deepEqual(r.lots.filter(l => l.parts), []);
  // Les empreintes du résultat entier, relevées sur le commit d'avant (3d8aca9).
  assert.deepEqual(Object.fromEntries(Object.entries(journees).map(([k, r]) => [k, empreinte(r)])), {
    sansTempsLibre: 'eab593c4aa5511a7', seule: '41ac19e790b445ae', lignePropre: '676eb851ab2b8363', sansRobot: 'cbf62adb5439235a' });
});
