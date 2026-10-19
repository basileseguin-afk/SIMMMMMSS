/* Banc d'essai, évolution 5 — les renforts (v1) : une équipe qui a fini tous
 * ses lots avant la fin de sa présence prête ses personnes à une équipe encore
 * au travail, jusqu'à la fin de leur présence (docs/BANC_ESSAI.md § 5).
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');
const R = require('../reglages.js');
const REF = require('./non-regression.attendu.json');

const h = s => P.minutes(s);
const vol = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Une heure de travail par vol, pour une personne.
const BAREME = { prepa: { '*/YC': 60 }, prepa2: { '*/YC': 60 }, cuisine: { '*/YC': 60 } };
const CHEMIN = { id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] };
// Les commandes de A passent par le service où on la met (une cuisine, une annexe) : sinon elles n'y seraient pas préparées.
const par = service => ({ parcours: [CHEMIN, { id: 'c2', nom: service, noeuds: [service], liens: [] }], parcoursClasse: { 'NORD/YC': 'c2', 'SUD/YC': 'c2' } });
const equipe = (id, debut, presence, lots, p) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut, jour: 0, personnes: 1, pauses: [], lots,
  regime: { actif: true, seuils: [], presence }, ...p });
// A : deux vols, de 08:00 à 10:00, présente jusqu'à 11:00. B : six vols, de 08:00 à 14:00, présente jusqu'à 13:00 — 60 min de trop.
const VOLS = [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), vol('ES1', 'EST', '15:20'), vol('ES2', 'EST', '15:30'), vol('ES3', 'EST', '15:40'),
  vol('OU1', 'OUEST', '16:00'), vol('OU2', 'OUEST', '16:10'), vol('OU3', 'OUEST', '16:20')];
const A_ = p => equipe('ma', '08:00', 180, [['NORD/YC'], ['SUD/YC']], p);
const B_ = p => equipe('mb', '08:00', 300, [['EST/YC'], ['OUEST/YC']], p);
const jouer = (renforts, ateliers = [A_(), B_()], plus = {}) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers,
  parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, ...(renforts ? { renforts } : {}), ...plus });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const json = x => JSON.parse(JSON.stringify(x));
/** Le résultat sans les champs que les renforts ajoutent. */
const NOUVEAUX = ['renfortsPretes', 'renfortsRecus', 'renfortsHeuresSup', 'renforts'];
const sansRenforts = r => { const x = json(r); delete x.renforts; for (const a of x.ateliers) for (const k of NOUVEAUX) delete a[k]; return x; };

test('désactivés, ou sans renfort possible : la même journée, champ par champ', () => {
  const sans = json(jouer(undefined));
  assert.deepEqual(json(jouer({ actif: false, efficacite: 1, delai: 0, versHeuresSup: true })), sans, 'désactivés : rien de nouveau');
  // La matrice ne laisse personne aider : la même journée, avec ses champs de renforts à zéro.
  const fermee = jouer({ actif: true, polyvalence: { prepa: [] } });
  assert.deepEqual(sansRenforts(fermee), sans);
  assert.deepEqual(fermee.renforts, []);
  assert.deepEqual([vue(fermee, 'ma').renfortsPretes, vue(fermee, 'mb').renfortsRecus, vue(fermee, 'mb').renforts], [0, 0, { vers: [], de: [] }]);
  // Les journées de référence (la démo, deux unités fictives) : aucun renfort possible n'y change rien.
  for (const s of REF.scenarios) {
    const avant = J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options));
    const args = J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, { ...s.options, renforts: { actif: true } });
    args.renforts.polyvalence = Object.fromEntries([...new Set(args.ateliers.map(a => a.service))].map(x => [x, []]));
    assert.deepEqual(sansRenforts(J.jouer(args)), json(avant), s.nom);
  }
});

test('une équipe qui finit à 10:00 aide une équipe du même service qui aurait débordé de 60 min', () => {
  const sans = jouer(undefined), r = jouer({ actif: true });
  assert.deepEqual([vue(sans, 'mb').fin, vue(sans, 'mb').heuresSup], [h('14:00'), 60], 'seule, B déborde de 60 min');
  assert.equal(vue(r, 'ma').fin, h('10:00'));
  // Le renfort part à 10:00, travaille de 10:10 à 11:00 (fin de SA présence) : 50 min × 0,8 = 40 min de travail en moins.
  proche(vue(r, 'mb').fin, h('13:20'));
  proche(vue(r, 'mb').heuresSup, 20, 'le débordement baisse de 60 à 20 min');
  assert.deepEqual(r.renforts, [{ de: 'ma', vers: 'mb', minutes: 60 }], 'de 10:00 à 11:00, le délai d’arrivée compris');
  assert.deepEqual([vue(r, 'ma').renfortsPretes, vue(r, 'ma').renfortsRecus, vue(r, 'mb').renfortsPretes, vue(r, 'mb').renfortsRecus], [60, 0, 0, 60]);
  assert.deepEqual(vue(r, 'ma').renforts, { vers: [{ id: 'mb', nom: 'mb', minutes: 60 }], de: [] });
  assert.deepEqual(vue(r, 'mb').renforts, { vers: [], de: [{ id: 'ma', nom: 'ma', minutes: 60 }] });
  // Les lots de B aidés le disent, et leur temps passé.
  const lots = r.lots.filter(l => l.atelier === 'mb');
  assert.deepEqual(lots.map(l => l.renfort === true), [true, true]);
  proche(lots[0].fin, h('10:10') + 50 / 1.8, 'EST : les 50 min qui restent à 10:10, à 1,8 personne');
  assert.equal(vue(r, 'ma').heuresSup, 0);
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('le débordement baisse selon l’efficacité : du même service, d’un autre', () => {
  proche(vue(jouer({ actif: true, efficacite: 0.6 }), 'mb').heuresSup, 30, '50 min × 0,6');
  proche(vue(jouer({ actif: true, efficacite: 1 }), 'mb').heuresSup, 10);
  // A en cuisine, autorisée vers le montage : un autre service compte pour 0,6, puis pour ce qu'on règle.
  const cuisine = A_({ service: 'cuisine' }), poly = { cuisine: ['prepa'] };
  const autre = jouer({ actif: true, polyvalence: poly }, [cuisine, B_()], par('cuisine'));
  assert.equal(vue(autre, 'ma').fin, h('10:00'));
  proche(vue(autre, 'mb').heuresSup, 30);
  proche(vue(jouer({ actif: true, polyvalence: poly, efficaciteAutreService: 0.5 }, [cuisine, B_()], par('cuisine')), 'mb').heuresSup, 35);
  // Le délai d'arrivée : 30 min, le renfort travaille de 10:30 à 11:00.
  proche(vue(jouer({ actif: true, delai: 30 }), 'mb').heuresSup, 60 - 30 * 0.8);
});

test('la matrice interdit un passage : pas de renfort', () => {
  // Sans matrice, un service aide le sien et ses annexes : la cuisine n'aide pas le montage.
  const cuisine = A_({ service: 'cuisine' });
  const r = jouer({ actif: true }, [cuisine, B_()], par('cuisine'));
  assert.equal(vue(r, 'ma').fin, h('10:00'), 'A finit bien à 10:00');
  assert.deepEqual([r.renforts, vue(r, 'mb').heuresSup], [[], 60]);
  // Saisie, la matrice remplace le défaut : ici, le montage n'aide plus personne, pas même lui.
  const f = jouer({ actif: true, polyvalence: { prepa: ['cuisine'] } });
  assert.deepEqual([f.renforts, vue(f, 'mb').heuresSup], [[], 60]);
  // Les familles : une annexe et son service s'aident sans matrice, au taux du même service.
  const annexe = jouer({ actif: true, familles: { prepa: ['prepa2'], prepa2: ['prepa'] } }, [A_({ service: 'prepa2' }), B_()], par('prepa2'));
  assert.deepEqual(annexe.renforts, [{ de: 'ma', vers: 'mb', minutes: 60 }]);
  proche(vue(annexe, 'mb').heuresSup, 20, 'une salle de la famille compte comme le même service');
});

test('personnesMax : une équipe ne reçoit pas plus de renforts que ses postes de travail', () => {
  // A a deux personnes, toutes deux libres à 10:00 : avec une seule, B déborderait encore ; la seconde y va aussi.
  const deux = { personnes: 2, lots: [['NORD/YC'], ['SUD/YC']] };
  const vols = VOLS.concat([vol('NO2', 'NORD', '15:00'), vol('SU2', 'SUD', '15:10')]);
  const avec = (pm, ren = { actif: true }) => P.simuler({ vols, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [A_(deux), B_(pm ? { personnesMax: pm } : {})],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, renforts: ren });
  const libre = avec(undefined);
  assert.deepEqual(libre.renforts, [{ de: 'ma', vers: 'mb', minutes: 120 }], 'deux renforts, une heure chacun');
  proche(vue(libre, 'mb').fin, h('12:40'));
  const deuxPostes = avec(2);
  assert.deepEqual(deuxPostes.renforts, [{ de: 'ma', vers: 'mb', minutes: 60 }], 'un poste libre : un seul renfort');
  proche(vue(deuxPostes, 'mb').heuresSup, 20);
  assert.deepEqual(avec(1).renforts, [], 'aucun poste libre : aucun renfort');
  assert.equal(vue(avec(1), 'mb').heuresSup, 60);
});

test('un renfort repart à la fin de sa présence ; en heures sup seulement si on le permet', () => {
  const r = jouer({ actif: true });
  assert.equal(vue(r, 'ma').renfortsPretes, 60, 'de 10:00 à 11:00, la fin de sa présence, même si B n’a pas fini');
  assert.equal(vue(r, 'ma').renfortsHeuresSup, 0);
  // Permis : il reste jusqu'à ce que B ait fini (12:18 : les 230 min qui restent à 10:10, à 1,8 personne), 78 min après sa présence.
  const sup = jouer({ actif: true, versHeuresSup: true });
  proche(vue(sup, 'mb').fin, h('10:10') + 230 / 1.8);
  assert.equal(vue(sup, 'mb').heuresSup, 0, 'B finit dans sa présence');
  proche(vue(sup, 'ma').renfortsHeuresSup, vue(sup, 'mb').fin - h('11:00'));
  proche(vue(sup, 'ma').renfortsPretes, vue(sup, 'mb').fin - h('10:00'), 'il repart quand l’équipe aidée a fini');
  assert.equal(vue(sup, 'ma').heuresSup, 0, 'ses heures sup de renfort se lisent à part');
  // Sans heures sup permises, « vers les heures sup » ne retient personne.
  const sansSup = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [A_(), B_()], parcours: [CHEMIN], parcoursCabine: { YC: 'c1' },
    renforts: { actif: true, versHeuresSup: true } });
  assert.equal(vue(sansSup, 'ma').renfortsPretes, 60);
});

test('une équipe qui attend un lot en amont ne prête personne', () => {
  // A attend SUD de la cuisine jusqu'à 12:00 : elle ne prête qu'après l'avoir fait, de 13:00 à 14:00.
  const vols = [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), ...[1, 2, 3, 4, 5, 6].map(i => vol('ES' + i, 'EST', '17:00'))];
  const cuisine = { id: 'cu', nom: 'cu', service: 'cuisine', type: 'manuel', debut: '08:00', jour: 0, personnes: 1, pauses: [], lots: [['SUD/YC']],
    regime: { actif: true, seuils: [], presence: 600 } };
  const r = P.simuler({ vols, liaisons: [{ from: 'cuisine', to: 'prepa' }], bareme: { prepa: { '*/YC': 60 }, cuisine: { 'SUD/YC': 240 } }, rendement: 1,
    ateliers: [cuisine, equipe('ma', '08:00', 360, [['NORD/YC'], ['SUD/YC']]), equipe('mb', '08:00', 300, [['EST/YC']])],
    parcours: [CHEMIN, { id: 'c2', nom: 'Cuisine', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }],
    parcoursCabine: { YC: 'c1' }, parcoursClasse: { 'SUD/YC': 'c2' }, heuresSup: { actif: true, plafond: 180 }, renforts: { actif: true } });
  assert.deepEqual(r.lots.filter(l => l.atelier === 'ma').map(l => [l.nom, l.debut, l.fin]), [['NORD/YC', h('08:00'), h('09:00')], ['SUD/YC', h('12:00'), h('13:00')]]);
  proche(vue(r, 'mb').fin, h('13:10') + 50 / 1.8, 'B : les 50 min qui restent à 13:10, à 1,8 personne');
  proche(vue(r, 'ma').renfortsPretes, vue(r, 'mb').fin - h('13:00'), 'à partir de 13:00 seulement');
});

test('qui reçoit : l’échéance la plus proche d’abord ; à égalité, le plus de travail restant', () => {
  const trois = (vb, vc) => P.simuler({ vols: [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), ...vb, ...vc], liaisons: [], bareme: BAREME, rendement: 1,
    ateliers: [A_(), equipe('mb', '08:00', 300, [['EST/YC']]), equipe('mc', '08:00', 300, [['OUEST/YC']])],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, renforts: { actif: true } });
  const est = (n, std) => Array.from({ length: n }, (_, i) => vol('ES' + (i + 1), 'EST', std)), ouest = (n, std) => Array.from({ length: n }, (_, i) => vol('OU' + (i + 1), 'OUEST', std));
  assert.deepEqual(trois(est(6, '17:00'), ouest(6, '13:00')).renforts.map(p => p.vers), ['mc'], 'les commandes de C partent à 13:00');
  assert.deepEqual(trois(est(6, '13:00'), ouest(6, '17:00')).renforts.map(p => p.vers), ['mb']);
  assert.deepEqual(trois(est(6, '17:00'), ouest(7, '17:00')).renforts.map(p => p.vers), ['mc'], 'même échéance : C a sept vols, B six');
  assert.deepEqual(trois(est(7, '17:00'), ouest(6, '17:00')).renforts.map(p => p.vers), ['mb']);
});

test('quand l’équipe aidée a fini, le renfort va en aider une autre', () => {
  // B (EST, présente jusqu'à 11:50) finit grâce à A à 11:11 ; A, présente jusqu'à 14:00, va alors aider C, et B aussi.
  const vols = [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), ...[1, 2, 3, 4].map(i => vol('ES' + i, 'EST', '12:00')),
    ...[1, 2, 3, 4, 5, 6, 7].map(i => vol('OU' + i, 'OUEST', '17:00'))];
  const r = P.simuler({ vols, liaisons: [], bareme: BAREME, rendement: 1,
    ateliers: [equipe('ma', '08:00', 360, [['NORD/YC'], ['SUD/YC']]), equipe('mb', '08:00', 230, [['EST/YC']]), equipe('mc', '08:00', 360, [['OUEST/YC']])],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, renforts: { actif: true } });
  assert.deepEqual(r.renforts.map(p => [p.de, p.vers]), [['ma', 'mb'], ['ma', 'mc'], ['mb', 'mc']]);
  const finB = vue(r, 'mb').fin;
  proche(finB, h('10:10') + (240 - 130) / 1.8, 'B : 110 min qui restent à 10:10, à 1,8 personne');
  proche(r.renforts[0].minutes, finB - h('10:00'));
  assert.equal(vue(r, 'mc').heuresSup, 0, 'aidée par deux, C finit dans sa présence');
  proche(vue(r, 'mb').renfortsPretes, h('11:50') - finB, 'B prête sa personne jusqu’à la fin de sa présence');
});

test('les pauses d’un renfort restent les siennes', () => {
  // A a une pause de 10:30 à 10:45 : elle la prend chez B, qui n'avance alors qu'avec son monde.
  const r = jouer({ actif: true }, [A_({ pauses: [{ de: '10:30', a: '10:45' }] }), B_()]);
  assert.equal(vue(r, 'ma').renfortsPretes, 45, 'hors de sa pause');
  proche(vue(r, 'mb').heuresSup, 60 - 35 * 0.8);
  // Une pause de régime pas encore prise se prend à l'heure où elle tomberait sans arrêt depuis le début du poste :
  // due après 2 h 30 de travail, de 10:30 à 10:45.
  const regime = jouer({ actif: true }, [A_({ regime: { actif: true, presence: 180, seuils: [{ apres: 150, duree: 15 }] } }), B_()]);
  assert.equal(vue(regime, 'ma').renfortsPretes, 45, 'sa pause de régime (due à 10:30, après 2 h 30 de poste) se prend chez B');
  // Les pauses de l'équipe aidée arrêtent tout le monde : B s'arrête 15 min après 3 h de travail (11:00).
  const pauseB = { regime: { actif: true, presence: 300, seuils: [{ apres: 180, duree: 15 }] } };
  assert.equal(vue(jouer(undefined, [A_(), B_(pauseB)]), 'mb').heuresSup, 75);
  proche(vue(jouer({ actif: true }, [A_(), B_(pauseB)]), 'mb').fin, h('11:15') + (360 - 130 - 50 * 1.8), 'reprise à 11:15, 140 min-personne restantes');
});

test('vers un robot : un renfort compte pour le minimum qui le fait tourner, si la matrice le permet', () => {
  const vols = [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), vol('ES1', 'EST', '15:20'), vol('ES2', 'EST', '15:30'), vol('ES3', 'EST', '15:40')];
  const robot = { id: 'ro', nom: 'Robot', service: 'prepa', type: 'robot', debut: '08:00', jour: 0, personnes: 1, personnesMin: 2, debit: 100, pauses: [],
    lots: [['EST/YC']], regime: { actif: true, seuils: [], presence: 480 } };
  const avec = ren => P.simuler({ vols, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [A_({ regime: { actif: true, seuils: [], presence: 360 } }), robot],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, renforts: ren });
  const sans = avec(undefined), defaut = avec({ actif: true });
  assert.equal(sans.lots.find(l => l.atelier === 'ro').impossible, true, 'une personne pour deux : le robot ne tourne pas');
  assert.deepEqual(json(defaut.lots), json(sans.lots), 'sans matrice : jamais vers un robot');
  const r = avec({ actif: true, polyvalence: { prepa: ['prepa'] } });
  const l = r.lots.find(x => x.atelier === 'ro');
  assert.deepEqual([l.impossible, l.debut, l.fin, l.duree], [false, h('10:10'), h('13:10'), 180], 'armé à 10:10, il tourne à son débit');
  assert.equal(l.attente, 130, 'il a attendu son renfort');
  assert.deepEqual(r.renforts, [{ de: 'ma', vers: 'ro', minutes: 190 }]);
});

test('vers le handling 24 h/24 : un chauffeur de plus, si la matrice le permet', () => {
  const vols = [vol('NO1', 'NORD', '11:30'), vol('NO2', 'NORD', '11:30'), vol('NO3', 'NORD', '11:30')];
  const montage = { id: 'ma', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '08:00', jour: 0, personnes: 2, pauses: [], lots: [['NORD/YC']],
    regime: { actif: true, seuils: [], presence: 240 } };
  const handling = { id: 'ha', nom: 'Handling', service: 'handling', type: 'handling', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [], regime: { actif: false },
    durees: { '*': 20 }, allers: { '*': 10 }, retours: { '*': 10 }, simultanes: 5, avance: 180, handling24h: true, creneaux: [{ de: '05:00', a: '13:00', n: 1 }] };
  const avec = ren => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1, ateliers: [montage, handling], renforts: ren });
  const retards = r => r.vols.filter(v => v.cause === 'chauffeur').map(v => v.id);
  assert.deepEqual(retards(avec(undefined)), ['NO2', 'NO3'], 'un seul chauffeur pour trois vols prêts à 09:30');
  assert.deepEqual(retards(avec({ actif: true })), ['NO2', 'NO3'], 'sans matrice : jamais vers le handling (permis de conduire)');
  const r = avec({ actif: true, polyvalence: { prepa: ['handling'] } });
  assert.deepEqual(retards(r), []);
  const t = vue(r, 'ha').tournees;
  assert.deepEqual(t.map(x => [x.depart, x.conducteurs]), [[h('09:30'), ['1.1']], [h('09:40'), ['renfort ma#1']], [h('09:40'), ['renfort ma#2']]]);
  assert.ok(vue(r, 'ha').conducteurs.some(d => d.id === 'renfort ma#1' && d.vehicule === '*'), 'n’importe quel véhicule');
  // Tous les vols partis, ils rentrent au retour de leur tournée (10:20).
  assert.deepEqual(r.renforts, [{ de: 'ma', vers: 'ha', minutes: 2 * 50 }]);
  // Un handling dont le moteur calcule les chauffeurs n'en reçoit pas : son plan les compte déjà.
  const calc = P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
    ateliers: [montage, { ...handling, chauffeurs: { mode: 'calcules' } }], renforts: { actif: true, polyvalence: { prepa: ['handling'] } } });
  assert.deepEqual([calc.renforts, retards(calc)], [[], []]);
});

test('déterministe : la même journée, deux fois', () => {
  const une = () => json(jouer({ actif: true, versHeuresSup: true }, [A_({ personnes: 2 }), B_(), equipe('mc', '09:00', 240, [['OUEST/YC']])]));
  assert.deepEqual(une(), une());
});

test('réglages : validés, rangés seulement une fois réglés ; une sauvegarde d’avant se relit sans eux', () => {
  assert.equal('renforts' in R.valider({}), false, 'ory-modele-v1 d’avant : rien de nouveau');
  assert.deepEqual(R.valider({ renforts: { actif: true } }).renforts, { actif: true, efficacite: 0.8, efficaciteAutreService: 0.6, delai: 10, versHeuresSup: false });
  assert.deepEqual(R.valider({ renforts: { actif: 'oui', efficacite: '0.75', efficaciteAutreService: 3, delai: 12.4, versHeuresSup: true } }).renforts,
    { actif: false, efficacite: 0.75, efficaciteAutreService: 0.6, delai: 12, versHeuresSup: true }, 'hors bornes : la valeur par défaut');
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [A_(), B_(), { ...A_(), id: 'pl', type: 'lavage', personnesMax: 3 }] };
  const lu = A.valider(base);
  assert.equal('polyvalence' in lu, false);
  assert.ok(lu.ateliers.every(a => !('personnesMax' in a)), 'aucun poste de travail tant qu’on n’en saisit pas');
  const saisi = A.valider({ ...base, polyvalence: { prepa: ['prepa', 'cuisine', 'prepa', 3], cuisine: [], x: 'non' },
    ateliers: [A_({ personnesMax: 4 }), B_({ personnesMax: 0 }), { ...A_(), id: 'pl', type: 'lavage', personnesMax: 3 }] });
  assert.deepEqual(saisi.polyvalence, { prepa: ['prepa', 'cuisine'], cuisine: [] }, 'une liste vide est un choix : il n’aide personne');
  assert.deepEqual(saisi.ateliers.map(a => a.personnesMax), [4, undefined, undefined], 'à la main ou au robot, un entier positif');
  assert.deepEqual(A.valider(json(saisi)), saisi, 'relu tel quel');
});

test('le banc d’essai : les renforts se forcent comme une règle, la matrice et les postes comme les cases', () => {
  // L'effectif imposé : celui saisi (sinon l'unité calcule le monde qu'il faut, et B ne déborde plus).
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [A_(), B_()], parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, effectifs: { prepa: 'impose' } };
  // La règle de poste de l'unité sans pause, pour lire les minutes ; les équipes gardent leur présence.
  const modele = { bareme: BAREME, rendement: 1, regime: { seuils: [], presence: 480 }, heuresSup: { actif: true, plafond: 180 } };
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': etat, 'ory-modele-v1': modele } };
  assert.equal('renforts' in J.argumentsDeLaJournee(sauvegarde, VOLS), false, 'sans réglage : rien');
  const args = J.argumentsDeLaJournee(sauvegarde, VOLS, { renforts: { actif: true, efficacite: 0.6 }, ateliers: { polyvalence: { prepa: ['prepa'] } }, equipes: { mb: { personnesMax: 3 } } });
  assert.deepEqual(args.renforts, { actif: true, efficacite: 0.6, efficaciteAutreService: 0.6, delai: 10, versHeuresSup: false, polyvalence: { prepa: ['prepa'] }, familles: {} });
  assert.equal(args.ateliers.find(a => a.id === 'mb').personnesMax, 3);
  proche(vue(J.jouer(args), 'mb').heuresSup, 30);
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, VOLS, { renforts: { actif: true, efficacit: 0.6 } }), /réglage inconnu ou refusé : modele\.renforts\.efficacit/);
  // Les familles viennent des annexes du plan : un service et ses annexes, dans les deux sens.
  const services = [{ id: 'prepa' }, { id: 'cuisine' }, { id: 'robot2' }, { id: 'chaude' }, { id: 'seule' }];
  const zones = [{ id: 'robot2', kind: 'annexe', parent: 'prepa' }, { id: 'chaude', kind: 'annexe', parent: 'cuisine' }, { id: 'seule', kind: 'annexe', autonome: true }];
  assert.deepEqual(J.famillesDeLUnite(services, zones), { prepa: ['robot2'], robot2: ['prepa'], cuisine: ['chaude'], chaude: ['cuisine'] });
});

/* ---- Excel : les postes de travail ------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const CTX = { services: [{ id: 'prepa', nom: 'MONTAGE' }], programme: [], classes: [] };
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const etatDe = ateliers => ({ schema: 'ory-ateliers', version: 1, ateliers: A.valider({ schema: 'ory-ateliers', version: 1, ateliers }).ateliers });
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));

test('Excel : les postes de travail ont leur colonne, seulement quand une équipe en a', async () => {
  const sans = etatDe([A_(), B_()]);
  assert.ok(!E.ateliersVersClasseur(sans, CTX).find(f => f.nom === 'Ateliers').lignes[0].includes('Postes de travail'), 'le classeur d’avant');
  const etat = etatDe([A_(), B_({ personnesMax: 3 })]);
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const entetes = f.find(x => x.nom === 'Ateliers').lignes[0], col = entetes.indexOf('Postes de travail');
  assert.ok(col > 0);
  const relu = A.valider(E.classeurVersAteliers(f, etat, CTX).etat);
  assert.deepEqual(relu.ateliers.map(a => a.personnesMax), [undefined, 3], 'aller-retour');
  // Vidée dans Excel : plus de limite ; sans la colonne, ceux du site restent ; illisible, refusée.
  const vide = modifier(f, 'Ateliers', l => l.map((x, i) => (i ? Object.assign(x, { [col]: null }) : x)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(vide, etat, CTX).etat).ateliers.map(a => a.personnesMax), [undefined, undefined]);
  const sansCol = modifier(f, 'Ateliers', l => l.map(x => x.filter((_, i) => i !== col)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(sansCol, etat, CTX).etat).ateliers.map(a => a.personnesMax), [undefined, 3]);
  assert.throws(() => E.classeurVersAteliers(modifier(f, 'Ateliers', l => l.map((x, i) => (i === 2 ? Object.assign(x, { [col]: 1.5 }) : x))), etat, CTX), /postes de travail/);
});
