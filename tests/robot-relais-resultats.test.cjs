/* Évolution 21 (c) — le relais sur la ligne du robot, dans les résultats.
 *
 * L'unité fictive de tests/robot-relais-fictif.cjs : le robot du matin finit sa commande à 05:50, puis avance trois vols
 * de SUD/YC pour l'équipe du soir (27 min par vol à 300 plateaux par heure, une pause de 15 min prise entre deux vols),
 * de 05:50 à 07:26. Le soir, arrivé à 07:00, attend la ligne, fait le dernier vol de 07:26 à 07:54, puis NORD/YC.
 * Les indicateurs de charge, les réponses, le planning, la vue en direct et les classeurs lisent les parts : chaque
 * équipe est au travail pendant la sienne. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const PV = require('../planning-vue.js');
const DE = require('../direct-etat.js');
const ER = require('../echanges-reponses.js');
const EC = require('../echanges-charge.js');
const X = require('./robot-relais-fictif.cjs');
const F = require('./plan-rejoue-fictif.cjs');

const h = s => P.minutes(s), DATE = '2026-01-05';
const jouer = sauvegarde => { const vols = UI.parseFlights(X.volsCsv(), { eta: true, spmlParCabine: true, date: true }), args = J.argumentsDeLaJournee(sauvegarde, vols),
  r = P.simuler(args), k = I.journee(r, args); return { r, args, k, rep: R.reponses(r, args, { k }) }; };
const SUFFIT = jouer(X.suffit()), INSUFFISANT = jouer(X.insuffisant()), SANS = jouer(F.sauvegardeFictive());
const equipe = (x, id) => x.k.equipes.find(e => e.id === id), montage = x => x.rep.fins.services.find(s => s.service === 'prepa');
const sud = x => x.r.lots.find(l => l.nom === 'SUD/YC');

test('l’unité fictive : le matin avance trois vols du soir, qui reprend au quatrième', () => {
  assert.deepEqual(sud(SUFFIT).parts, [
    { atelier: 'rb', debut: h('05:50'), fin: h('07:26'), travail: 81, arret: 15, plateaux: 405, vols: ['SU201', 'SU203', 'SU205'], avance: true },
    { atelier: 'rb2', debut: h('07:26'), fin: 473.6, travail: 27.6, arret: 0, plateaux: 138, vols: ['SU207'] }]);
  assert.equal(sud(SUFFIT).atelier, 'rb2');
});

test('les indicateurs de charge lisent les parts : chaque équipe est au travail pendant la sienne, et finit ses plateaux', () => {
  // Le matin : sa commande (750 plateaux, 150 min) et sa part (405 plateaux, 81 min). Le soir : sa part (138) et NORD/YC (750).
  assert.deepEqual([equipe(SUFFIT, 'rb').termines, equipe(SUFFIT, 'rb').minutesAuTravail, equipe(SUFFIT, 'rb2').termines], [1155, 231, 888]);
  assert.ok(Math.abs(equipe(SUFFIT, 'rb2').minutesAuTravail - 177.6) < 1e-9);
  assert.equal(equipe(SUFFIT, 'rb').termines + equipe(SUFFIT, 'rb2').termines, 750 + 543 + 750, 'aucun plateau compté deux fois');
  // La commande en relais attend l'équipe qui l'a dans sa liste, pas celle qui l'avance.
  assert.deepEqual([equipe(SUFFIT, 'rb').fileMax, equipe(SUFFIT, 'rb2').fileMax], [{ lots: 0, a: null }, { lots: 2, a: h('07:00') }]);
  // L'avance de chaque équipe, seulement s'il y en a.
  assert.deepEqual([equipe(SUFFIT, 'rb').avance, equipe(SUFFIT, 'rb2').avance], [{ avances: 3, deja: 0, minutes: 81 }, { avances: 0, deja: 3, minutes: 0 }]);
  assert.ok(SANS.k.equipes.every(e => !('avance' in e)), 'sans relais : aucun champ de plus');
});

test('les réponses : la fin d’une équipe de robot est la fin de sa dernière part ; les commandes avancées se lisent', () => {
  const f = montage(SUFFIT);
  assert.deepEqual(f.equipes.filter(e => /Robot/.test(e.nom)), [
    { id: 'rb', nom: 'Robot matin', fin: h('07:26'), finHoraire: h('10:30'), depasse: 0 },
    { id: 'rb2', nom: 'Robot soir', fin: 623.6, finHoraire: h('10:30'), depasse: 0 }]);
  assert.deepEqual(f.avances, [{ commande: 'SUD/YC', equipe: { id: 'rb2', nom: 'Robot soir' }, fin: 473.6, parts: [
    { id: 'rb', nom: 'Robot matin', debut: h('05:50'), fin: h('07:26'), travail: 81, vols: 3, plateaux: 405, avance: true },
    { id: 'rb2', nom: 'Robot soir', debut: h('07:26'), fin: 473.6, travail: 27.6, vols: 1, plateaux: 138 }] }]);
  assert.ok(SANS.rep.fins.services.every(s => !('avances' in s)), 'sans relais : aucun champ de plus');
});

test('« Où ça coince » ne cite plus le robot quand le relais suffit à tenir les deux postes, et le cite encore quand il ne suffit pas', () => {
  // Le relais suffit : le soir finit à 10:24 pour 10:30 ; personne ne dépasse sur la ligne.
  assert.deepEqual([montage(SUFFIT).depasse, montage(SUFFIT).equipeQuiDepasse], [0, null]);
  assert.equal(SUFFIT.rep.coince.goulots.some(g => g.equipe && /Robot/.test(g.equipe.nom)), false);
  // Il ne suffit pas : le soir, arrivé plus tôt pour moins longtemps, finit 1 h 54 après son horaire ; la ligne est citée.
  const g = INSUFFISANT.rep.coince.goulot;
  assert.deepEqual([g.service, g.equipe, g.cause.code], ['prepa', { id: 'rb2', nom: 'Robot soir', fin: 623.6, finHoraire: h('08:30'), depasse: 113.6 }, 'charge']);
  assert.deepEqual(sud(INSUFFISANT).parts.map(p => [p.atelier, p.vols.length]), [['rb', 2], ['rb2', 2]], 'le matin a pourtant avancé deux vols');
});

test('le planning des équipes : la commande en relais sur les deux lignes, chacune pour sa part ; l’infobulle dit qui avance et qui reprend', () => {
  const nom = id => SUFFIT.r.ateliers.find(a => a.id === id).nom, robot = { type: 'robot', service: 'prepa' };
  const matin = PV.lotTenu(sud(SUFFIT), { id: 'rb' }, nom), soir = PV.lotTenu(sud(SUFFIT), { id: 'rb2' }, nom);
  assert.deepEqual([matin.debut, matin.fin, matin.duree, matin.attente], [h('05:50'), h('07:26'), 81, 0]);
  assert.deepEqual([soir.debut, soir.fin, soir.duree, soir.attente], [h('07:26'), 473.6, 27.6, 26]);
  // Le repère de relais, comme à la plonge : au bout de la part de l'équipe qui avance, au début de celle qui reprend.
  assert.deepEqual([matin.relais.vers, matin.relais.de, soir.relais.de, soir.relais.vers], [{ nom: 'Robot soir', a: h('07:26') }, null, { nom: 'Robot matin' }, null]);
  assert.equal(PV.info(matin, robot, {}), 'SUD · Économie\n05:50 → 07:26 (1 h 21, dont 15 min d’arrêt)\nAttente : aucune\nAvance pour Robot soir : 3 vols\nRepris par Robot soir à 07:26');
  assert.equal(PV.info(soir, robot, {}), 'SUD · Économie\n07:26 → 07:54 (28 min)\nAttente : 26 min\nAvancé par Robot matin : 3 vols, de 05:50 à 07:26');
  // Une commande que personne n'a avancée : l'infobulle d'avant.
  const nord = SUFFIT.r.lots.find(l => l.nom === 'NORD/YC');
  assert.equal(PV.lotTenu(nord, { id: 'rb2' }, nom), nord);
  // Deux équipes arrivées à la même heure avancent la même suivante : chacune « avance pour », aucune n'est « avancée par » l'autre.
  const deux = { ...sud(SUFFIT), parts: [{ atelier: 'a', debut: 300, fin: 330, travail: 30, arret: 0, plateaux: 100, vols: ['V1'], avance: true },
    { atelier: 'b', debut: 330, fin: 360, travail: 30, arret: 0, plateaux: 100, vols: ['V2'], avance: true }, { atelier: 'c', debut: 400, fin: 430, travail: 30, arret: 0, plateaux: 100, vols: ['V3'] }] };
  const b = PV.lotTenu(deux, { id: 'b' }, id => id), c = PV.lotTenu(deux, { id: 'c' }, id => id);
  assert.deepEqual([b.relais.de, b.relais.robot.de, b.relais.vers], [null, [], { nom: 'rb2', a: 400 }]);
  assert.deepEqual(c.relais.robot.de.map(d => d.nom), ['a', 'b']);
});

test('le plan rejoué et la vue en direct : la ligne tourne pendant l’avance, avec l’équipe qui avance ; ses plateaux sortent à la fin de sa part', () => {
  const ligne = t => DE.lotsEnCours(SUFFIT.r, h(t)).filter(l => /^rb/.test(l.atelier)).map(l => [l.atelier, l.nom, l.repas, l.debut, l.fin]);
  assert.deepEqual(ligne('06:30'), [['rb', 'SUD/YC', 405, h('05:50'), h('07:26')]]);
  assert.deepEqual(ligne('07:30'), [['rb2', 'SUD/YC', 138, h('07:26'), 473.6]]);
  assert.deepEqual(DE.robotsA(SUFFIT.r, h('06:30')), [{ atelier: 'rb', debit: 300, lot: 'SUD/YC' }]);
  assert.deepEqual(DE.robotsA(SUFFIT.r, h('07:30')), [{ atelier: 'rb2', debit: 300, lot: 'SUD/YC' }]);
  // À 06:30, le matin est au travail (ses deux personnes), le soir n'est pas arrivé.
  const e = DE.etatA({ r: SUFFIT.r, k: SUFFIT.k }, h('06:30'));
  assert.deepEqual([e.equipes.rb.auTravail, e.equipes.rb2.presents], [2, 0]);
});

test('la feuille « Réponses » : les parts d’une commande avancée', () => {
  const f = ER.feuilleDesReponses(SUFFIT.rep, { date: DATE }), col = n => f.lignes[0].indexOf(n);
  const l = f.lignes.filter(x => x[col('Mesure')] === 'Commande avancée');
  assert.deepEqual(l.map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Détail')]]), [['Montage', 81, 'min',
    'SUD/YC (Robot soir) : avancée par Robot matin 05:50 → 07:26 (3 vols, 81 min), reprise par Robot soir 07:26 → 07:54 (1 vol, 28 min) ; finie à 07:54']]);
  const sans = ER.feuilleDesReponses(SANS.rep, { date: DATE });
  assert.equal(sans.lignes.some(x => x.includes('Commande avancée')), false);
});

test('la feuille « Charge » : les vols avancés, en colonnes de plus, seulement s’il y en a', () => {
  const charge = x => EC.journeeVersClasseur({ resultat: x.r, args: x.args }, { date: DATE, calculeLe: '2026-01-06T00:00:00Z' }).find(f => f.nom === 'Charge').lignes;
  const n = EC.TETE_CHARGE.length, de_ = (lignes, nom) => lignes.find(l => l[3] === nom).slice(-3);
  const c = charge(SUFFIT);
  assert.deepEqual(c[0].slice(-3), ['Vols avancés pour l’équipe suivante', 'Travail en avance (min)', 'Vols déjà faits par l’équipe d’avant']);
  assert.deepEqual(c[0].slice(-3), EC.TETE_AVANCE);
  assert.deepEqual([de_(c, 'Robot matin'), de_(c, 'Robot soir'), de_(c, 'Montage')], [[3, 81, 0], [0, 0, 3], [null, null, null]]);
  assert.equal(charge(SANS)[0].includes('Vols avancés pour l’équipe suivante'), false, 'sans relais : la feuille d’avant');
  assert.ok(n > 0);
});
