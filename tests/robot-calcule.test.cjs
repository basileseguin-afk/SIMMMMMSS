/* Banc d'essai, évolution 9 — l'équipe d'un robot, dans un service de robots à
 * effectif calculé (`servicesRobot` : une annexe où ne travaillent que des
 * robots, moteur/journee.js), prend ses personnes du barème propre de son
 * service, comme une équipe à la main : minutes par vol × vols de ses commandes
 * ÷ minutes du poste ÷ rendement, arrondi au-dessus, au moins `personnesMin`.
 * Ailleurs, s'il le demande (`effectif: 'calcule'`). Effectif « fixe », ou sans
 * minutes au barème pour ses commandes : son effectif saisi. Le débit du robot
 * donne toujours la vitesse de la ligne (docs/BANC_ESSAI.md § 10). Vols,
 * compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const E = require('../echanges.js');
const REF = require('./non-regression.attendu.json');

const h = s => P.minutes(s);
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, crew: 0 });
const vols = n => Array.from({ length: n }, (_, i) => dep('SU' + (i + 1), 'SUD', String(12 + i).padStart(2, '0') + ':00'));
const CHEMIN = { id: 'c', nom: 'Robot', noeuds: ['robot'], liens: [] };
// Un robot à 300 plateaux par heure, 2 personnes saisies, sur un poste de 420 minutes sans pause.
const robot = p => ({ id: 'rb', nom: 'Robot', service: 'robot', type: 'robot', debut: '06:00', jour: 0, personnes: 2, personnesMin: 1, debit: 300, pauses: [],
  lots: [['SUD/YC']], regime: { actif: true, seuils: [], presence: 420 }, ...p });
function jouer({ n = 4, bareme = { 'SUD/YC': 300 }, plus = {}, opts = {} } = {}) {
  const v = vols(n);
  return P.simuler({ vols: v, liaisons: [], bareme: { robot: bareme }, rendement: 1, parcours: [CHEMIN], parcoursCabine: { YC: 'c' },
    ateliers: [robot(plus)], effectifCalcule: ['robot'], servicesRobot: ['robot'], ...opts });
}
const lotDu = r => r.lots.find(l => l.atelier === 'rb');

test('300 min par vol au barème et 4 vols ce jour-là : ⌈1 200 ÷ 420⌉ = 3 personnes', () => {
  const r = jouer();
  assert.equal(r.ok, true);
  assert.deepEqual([r.effectifs.rb.personnes, r.effectifs.rb.hommeMinutes, r.effectifs.rb.poste, r.effectifs.rb.saisi], [3, 1200, 420, 2]);
  assert.equal(r.ateliers.find(a => a.id === 'rb').personnes, 3);
});

test('hors d’un service de robots, il se calcule s’il le demande ; sans rien demander, le résultat d’avant, champ par champ', () => {
  const sans = jouer({ opts: { servicesRobot: undefined } });
  assert.equal(sans.effectifs.rb, undefined, 'pas un service de robots : son effectif saisi');
  assert.equal(JSON.stringify(sans), JSON.stringify(jouer({ bareme: {}, opts: { servicesRobot: undefined } })), 'comme sans barème');
  assert.equal(jouer({ opts: { servicesRobot: undefined }, plus: { effectif: 'calcule' } }).effectifs.rb.personnes, 3, 'il le demande');
});

test('le même robot avec 2 vols : 2 personnes', () => {
  assert.equal(jouer({ n: 2 }).effectifs.rb.personnes, 2);
});

test('sans minutes au barème pour ses commandes, ou à effectif « fixe » : son effectif saisi', () => {
  for (const r of [jouer({ bareme: {} }), jouer({ plus: { effectif: 'fixe' } })]) {
    assert.equal(r.ok, true);
    assert.equal(r.effectifs.rb, undefined);
    assert.equal(r.ateliers.find(a => a.id === 'rb').personnes, 2);
  }
});

test('au moins personnesMin', () => {
  const r = jouer({ plus: { personnesMin: 4 } });
  assert.equal(r.effectifs.rb.personnes, 4);
  assert.ok(!r.anomalies.some(a => a.code === 'robot-arret'), 'calculé, il tourne : pas d’arrêt annoncé');
  // Saisi sous son minimum, mais calculé : l'arrêt d'avant le calcul ne vaut plus.
  assert.ok(!jouer({ plus: { personnes: 0 } }).anomalies.some(a => a.code === 'robot-arret'));
});

test('la ligne va toujours à son débit : des personnes en plus ne l’accélèrent pas', () => {
  const calcule = lotDu(jouer()), saisi = lotDu(jouer({ bareme: {} }));
  // 4 vols × 100 plateaux à 300 plateaux par heure : 80 minutes, avec 3 personnes comme avec 2.
  assert.deepEqual([calcule.debut, calcule.fin], [saisi.debut, saisi.fin]);
  assert.equal(calcule.fin - calcule.debut, 80);
});

test('sans vol ce jour-là (correction 10) : 0 personne, sa commande ajoutée faite en temps nul', () => {
  const classes = [{ id: 'SUD/YC', cie: 'SUD', cabine: 'YC', pax: 0, vols: [], echeance: 1440, origine: 'ajoutee' }];
  const r = P.simuler({ vols: [dep('NO1', 'NORD', '12:00')], classes, liaisons: [], bareme: { robot: { 'SUD/YC': 300 } }, rendement: 1, parcours: [CHEMIN],
    parcoursCabine: { YC: 'c' }, ateliers: [robot()], effectifCalcule: ['robot'], servicesRobot: ['robot'] });
  assert.equal(r.ok, true);
  assert.equal(r.effectifs.rb.personnes, 0);
  assert.deepEqual([!!lotDu(r).impossible, lotDu(r).fin], [false, h('06:00')]);
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('sans vol, avec les renforts : calculé à 0 personne, sa commande en temps nul, sans attendre de renfort (le robot, l’équipe à la main)', () => {
  // Le robot et une équipe de cuisine n'ont que des commandes ajoutées, sans vol ; le montage, qui a un vol, peut les renforcer.
  const sans = (id, cabine) => ({ id, cie: 'SUD', cabine, pax: 0, vols: [], echeance: 1440, origine: 'ajoutee' });
  const poste = { actif: true, seuils: [], presence: 420 };
  const main = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [['NORD/CREW']], regime: poste };
  const zero = { id: 'z', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [['SUD/BC']], regime: poste };
  const r = P.simuler({ vols: [{ ...dep('NO1', 'NORD', '12:00'), crew: 4 }], classes: P.classesDeVols([{ ...dep('NO1', 'NORD', '12:00'), crew: 4 }]).concat([sans('SUD/YC', 'YC'), sans('SUD/BC', 'BC')]),
    liaisons: [], bareme: { robot: { '*/YC': 60 }, prepa: { '*/CREW': 30 }, cuisine: { '*/BC': 30 } }, rendement: 1,
    parcours: [CHEMIN, { id: 'c2', nom: 'Cuisine', noeuds: ['cuisine'], liens: [] }, { id: 'c3', nom: 'Montage', noeuds: ['prepa'], liens: [] }],
    parcoursCabine: { YC: 'c', BC: 'c2', CREW: 'c3' }, ateliers: [robot({ personnesMin: 2 }), main, zero],
    effectifCalcule: ['robot', 'prepa', 'cuisine'], servicesRobot: ['robot'], renforts: { actif: true, polyvalence: { prepa: ['robot', 'cuisine'] } } });
  assert.deepEqual([r.effectifs.rb.personnes, r.effectifs.z.personnes], [0, 0]);
  for (const id of ['rb', 'z']) {
    const l = r.lots.find(x => x.atelier === id);
    assert.ok(l, id + ' : son lot');
    assert.deepEqual([!!l.impossible, l.fin], [false, h('06:00')], id);
  }
  assert.ok(!r.anomalies.some(a => a.code === 'poste' && (a.atelier === 'rb' || a.atelier === 'z')), r.anomalies.map(a => a.code).join(', '));
});

test('sa compagnie ne vole pas ce jour-là (la commande écartée) : 0 personne s’il a des minutes, son effectif saisi sinon', () => {
  const jour = bareme => P.simuler({ vols: [dep('NO1', 'NORD', '12:00')], liaisons: [], bareme: { robot: bareme }, rendement: 1, parcours: [CHEMIN],
    parcoursCabine: { YC: 'c' }, ateliers: [robot()], effectifCalcule: ['robot'], servicesRobot: ['robot'] });
  const avec = jour({ 'SUD/YC': 300 });
  assert.ok(avec.anomalies.some(a => a.code === 'commande-absente' && a.atelier === 'rb'));
  assert.equal(avec.effectifs.rb.personnes, 0);
  assert.equal(jour({ 'NORD/YC': 300 }).effectifs.rb, undefined, 'des minutes pour une autre compagnie seulement : son effectif saisi');
});

test('sans minutes, saisi sous son minimum : à l’arrêt, comme avant', () => {
  const r = jouer({ bareme: {}, plus: { personnes: 1, personnesMin: 2 } });
  assert.equal(r.effectifs.rb, undefined);
  assert.ok(r.anomalies.some(a => a.code === 'robot-arret' && a.atelier === 'rb'));
  assert.equal(lotDu(r).impossible, true);
});

test('la relecture des équipes garde le choix et l’effectif saisi d’un robot', () => {
  const A = require('../ateliers.js');
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [robot({ effectif: 'calcule', personnesSaisies: 5 }), robot({ id: 'rb2', effectif: 'impose' })] };
  const v = A.valider(JSON.parse(JSON.stringify(etat)));
  assert.deepEqual([v.ateliers[0].effectif, v.ateliers[0].personnesSaisies, v.ateliers[1].effectif], ['calcule', 5, undefined]);
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(v))).ateliers, v.ateliers, 'relu deux fois : le même');
});

test('une journée part de l’effectif saisi d’un robot que le calcul avait fait', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  const v = JSON.parse(JSON.stringify(u)), rb = v.etat.ateliers.find(a => a.id === 'rb');
  rb.personnesSaisies = rb.personnes; rb.personnes = 7;      // la valeur calculée d'un autre jour
  const args = J.argumentsDeLUnite(v, S.args.vols, { delaiChargement: 45 });
  assert.equal(args.ateliers.find(a => a.id === 'rb').personnes, rb.personnesSaisies);
  assert.equal(JSON.stringify(J.jouer(args)), JSON.stringify(J.jouer(J.argumentsDeLUnite(u, S.args.vols, { delaiChargement: 45 }))));
});

test('le barème du service robot se lit comme les autres dans le récap (heures par vol), quand son effectif se calcule', () => {
  const classes = P.classesDeVols(vols(4));
  const ctx = robots => ({ bareme: { robot: { 'SUD/YC': 300 } }, services: [{ id: 'robot', nom: 'Robot' }], classes, routes: P.routesDesClasses(classes,
    { parcours: [CHEMIN], parcoursCabine: { YC: 'c' } }), ateliers: [robot()], robotsCalcules: new Set(robots) });
  const avant = E.recapManMinutes(ctx([])), apres = E.recapManMinutes(ctx(['rb']));
  assert.equal(avant.colonnes[0].robot, true, 'sans calcul : la colonne du débit, comme avant');
  assert.equal(avant.lignes[0].cellules.robot.source, 'robot');
  assert.equal(apres.colonnes[0].robot, undefined);
  assert.deepEqual([apres.lignes[0].cellules.robot.source, apres.lignes[0].cellules.robot.parVol, apres.lignes[0].cellules.robot.jour], ['propre', 300, 1200]);
});

test('un robot ne lit que le barème propre de son service, pas celui repris du service dont il dépend', () => {
  // L'unité fictive de la référence : une annexe « Montage bis » sous le Montage, qui en reprend le barème.
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options), annexe = u.zones.find(z => z.kind === 'annexe');
  const args = (bareme, { avecMain = false, effectif } = {}) => {
    const v = JSON.parse(JSON.stringify(u));
    // Le robot dans l'annexe (seul, sans son équipe à la main), et EST Économie y passe.
    if (!avecMain) v.etat.ateliers = v.etat.ateliers.filter(a => !(a.service === annexe.id && a.type === 'manuel'));
    const rb = v.etat.ateliers.find(a => a.id === 'rb');
    rb.service = annexe.id;
    if (effectif) rb.effectif = effectif;
    v.etat.parcours.push({ id: 'par-robot', nom: 'Par le robot', noeuds: [annexe.id], liens: [] });
    v.etat.parcoursClasse = { ...v.etat.parcoursClasse, 'EST/YC': 'par-robot' };
    if (bareme) v.modele.bareme[annexe.id] = bareme;
    return J.argumentsDeLUnite(v, S.args.vols, { delaiChargement: 45 });
  };
  const repris = args(null), propre = args({ '*/YC': 30 });
  assert.deepEqual(repris.baremeRepris, [annexe.id]);
  assert.deepEqual(propre.servicesRobot, [annexe.id], 'une annexe où ne travaillent que des robots : un service de robots');
  assert.ok(repris.effectifCalcule.includes(annexe.id), 'un service calculé');
  assert.equal(J.jouer(repris).effectifs.rb, undefined, 'les minutes du Montage ne sont pas les siennes : son effectif saisi');
  assert.equal(propre.baremeRepris, undefined);
  const vols = S.args.vols.filter(v => v.cie === 'EST' && v.sens === 'DEP').length;
  assert.equal(J.jouer(propre).effectifs.rb.hommeMinutes, 30 * vols, 'son barème à lui : 30 min par vol');
  // Sans robot sous une annexe, l'appel ne change pas.
  const avant = J.argumentsDeLUnite(u, S.args.vols, { delaiChargement: 45 });
  assert.deepEqual(['baremeRepris' in avant, 'servicesRobot' in avant], [false, false]);
  assert.equal(args({ '*/YC': 30 }, { avecMain: true }).servicesRobot, undefined, 'partagé avec une équipe à la main : pas un service de robots');
  // Un service qu'il partage avec une équipe à la main : ses minutes sont celles du travail à la main, sauf s'il le demande.
  assert.equal(J.jouer(args({ '*/YC': 30 }, { avecMain: true })).effectifs.rb, undefined, 'service partagé : son effectif saisi');
  assert.equal(J.jouer(args({ '*/YC': 30 }, { avecMain: true, effectif: 'calcule' })).effectifs.rb.hommeMinutes, 30 * vols, 'il le demande');
});

test('non-régression : les journées enregistrées ne changent pas (aucun robot n’y est calculé)', () => {
  for (const s of REF.scenarios) {
    const r = J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options));
    for (const a of s.args.ateliers.filter(x => x.type === 'robot')) assert.ok(!(s.args.effectifCalcule || []).includes(a.service), s.nom + ' : ' + a.id);
    assert.deepEqual(JSON.parse(JSON.stringify(r.effectifs)), s.resultat.effectifs, s.nom);
    assert.deepEqual(JSON.parse(JSON.stringify(r.lots)), s.resultat.lots, s.nom);
  }
});
