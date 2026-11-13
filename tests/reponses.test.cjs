/* Évolution 15 (a) — le module des réponses (moteur/reponses.js) : les
 * résultats d'une journée répondent à cinq questions, dans cet ordre —
 *   1. combien de personnes faut-il, par service ?
 *   2. où et quand ça coince ?
 *   3. à quelle heure chaque service finit-il, avec combien d'heures sup ?
 *   4. qu'est-ce qui part en retard ?
 *   5. que change mon scénario ?
 * Le module LIT le résultat de la journée et les indicateurs de charge
 * (moteur/indicateurs.js) ; il ne recalcule rien et ne change rien. Les seuils
 * sont réglables, sauvegardés (ory-seuils-v1), et valent leurs défauts sans
 * sauvegarde. Journées fictives, calculées à la main. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');

const h = s => P.minutes(s);
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, debut, personnes, lots, x) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes, lots, regime: { actif: true }, ...x });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const NOMS = { cuisine: 'Cuisine', prepa: 'Montage', quais: 'Quais' };
const jouer = args => { const a = { liaisons: [], rendement: 1, noms: NOMS, ...args }; return { r: P.simuler(a), args: a }; };
const quais = { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true }, durees: { '*': 20 } };

// Le poste par défaut : 8 h de présence, 15 min de pause après 3 h de travail, 45 min après 6 h → 420 min utiles.
test('le poste par défaut a 420 minutes utiles (le calcul à la main des tests s’y appuie)', () => {
  assert.equal(P.minutesDuPoste(eq('x', 'prepa', '06:00', 1, [])), 420);
});

/* ---- 1. Combien de personnes faut-il, par service ? ------------------------------------------------ */

// La cuisine : 3 personnes pour 420 homme-minutes (un poste) ; le montage : 1 personne pour 600 (600 ÷ 420 = 1,43 poste).
const SOUS_SUR = (montage = 1) => jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { cuisine: { '*/YC': 420 }, prepa: { '*/YC': 600 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 3, [['NORD/YC']]), eq('mo', 'prepa', '06:00', montage, [['NORD/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa'])], parcoursCabine: { YC: 'c1' } });

test('1. un service en sur-effectif, un en sous-effectif : besoin, présents, écart', () => {
  const { r, args } = SOUS_SUR(), rep = R.reponses(r, args, { seuils: { ecartPersonnes: 1 } });
  const cu = rep.personnes.services.find(s => s.service === 'cuisine'), mo = rep.personnes.services.find(s => s.service === 'prepa');
  // La cuisine : 420 ÷ 420 = 1 poste ; 3 présents → 2 de trop. Un surplus n'est pas une alerte (correction 17 c) : pas signalé.
  assert.deepEqual([cu.nom, cu.jour, cu.besoin, cu.presents, cu.ecart, cu.sens, cu.signale], ['Cuisine', 0, 1, 3, 2, 'sur', false]);
  proche(cu.charge, 1);
  // Le montage : 600 ÷ 420 = 1,43 → 2 personnes ; 1 présente → 1 de moins.
  assert.deepEqual([mo.besoin, mo.presents, mo.ecart, mo.sens, mo.signale], [2, 1, -1, 'sous', true]);
  proche(mo.charge, 600 / 420);
  assert.deepEqual(mo.equipes.map(e => [e.id, e.mesure]), [['mo', true]]);
  // L'unité : 3 personnes nécessaires, 4 présentes, aucune en poste fixe.
  assert.deepEqual(rep.personnes.total, { besoin: 3, presents: 4, fixes: 0, nonMesures: 0, ecart: 1 });
  // Un écart sous le seuil ne se signale pas : au seuil par défaut (3 personnes), il manque 1 personne au montage, sans alerte.
  const large = R.reponses(r, args);
  assert.equal(large.seuils.ecartPersonnes, 3);
  assert.ok(large.personnes.services.every(s => !s.signale));
});

test('1. le matin (avant 13:00 du jour de travail) et l’après-midi ; le pic et l’occupation viennent des indicateurs', () => {
  const { r, args } = SOUS_SUR(), k = I.journee(r, args), rep = R.reponses(r, args, { k });
  const mo = rep.personnes.services.find(s => s.service === 'prepa'), cu = rep.personnes.services.find(s => s.service === 'cuisine');
  // Le montage : présent de 06:00 à 14:00 ; il commence à 08:20, quand la cuisine livre (le créneau de 08:30 est le premier plein).
  assert.deepEqual(mo.matin, { presents: 1, auTravail: 1, a: h('08:30') });
  assert.deepEqual(mo.apresMidi, { presents: 1, auTravail: 1, a: h('13:00') });
  // La cuisine : à trois de 06:00 à 08:20, puis sans travail ; l'après-midi, présents, mais personne au travail.
  assert.deepEqual(cu.matin, { presents: 3, auTravail: 3, a: h('06:00') });
  assert.deepEqual(cu.apresMidi, { presents: 3, auTravail: 0, a: null });
  // Le pic de la journée et l'occupation (K3) : ceux des indicateurs de charge, tels quels.
  const ks = k.services.find(s => s.service === 'prepa');
  assert.deepEqual(mo.pic, { personnes: ks.picAuTravail.personnes, a: ks.picAuTravail.debut });
  assert.equal(mo.occupation, ks.occupation);
  assert.equal(mo.presents, ks.etp, 'les présents : les ETP présents (K8)');
});

test('1. l’arrondi au service : deux équipes calculées à 0,4 poste chacune font 1 personne, pas 2', () => {
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00'), dep('SU1', 'SUD', '20:00')], bareme: { prepa: { '*/YC': 168 } }, effectifCalcule: ['prepa'],
    ateliers: [eq('a', 'prepa', '06:00', 1, [['NORD/YC']]), eq('b', 'prepa', '06:00', 1, [['SUD/YC']])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const s = R.reponses(r, args).personnes.services.find(x => x.service === 'prepa');
  assert.deepEqual(s.equipes.map(e => e.id), ['a', 'b']);
  for (const e of s.equipes) proche(e.besoin, 168 / 420, e.id + ' : 168 ÷ 420');
  proche(s.charge, 0.8);
  assert.deepEqual([s.besoin, s.presents, s.ecart, s.sens], [1, 2, 1, 'sur']);
});

test('1. une équipe sans charge mesurée (aucun lot) ne compte plus dans le besoin (correction 18 a) : rangée avec les postes fixes', () => {
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('vide', 'prepa', '06:00', 2, [])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const s = R.reponses(r, args).personnes.services.find(x => x.service === 'prepa');
  assert.deepEqual(s.equipes.map(e => [e.id, e.mesure, e.nonMesure, e.besoin]), [['mo', true, false, 1], ['vide', false, true, 0]]);
  // Il faut 1 personne (l'équipe mesurée) ; 3 présentes, dont 2 au besoin non mesuré ; écart (3 − 2) − 1 = 0.
  assert.deepEqual([s.besoin, s.presents, s.fixes, s.nonMesures, s.ecart, s.sens, s.signale], [1, 3, 2, 2, 0, null, false]);
});

/* ---- 2. Où et quand ça coince ? -------------------------------------------------------------------- */

// Correction 18 (a) : la file et l'attente se comptent en arrivages (les lots d'une équipe prêts au même instant) ; ici, chaque
// lot est son propre arrivage. « Où ça coince » se juge sur les conséquences : un dépassement d'un quart d'heure, ou un lot qui
// fait partir une commande ou un vol en retard — le seuil d'attente n'y joue plus.
// Le montage fait d'abord NORD/BC (3 h, sans fournisseur), puis NORD/YC, que la cuisine livre à 07:00 : YC attend le montage
// de 07:00 à 09:00, pendant que le montage travaille (occupé à 100 %) → « personnel ». Il la finit à 09:45 : à l'heure pour un
// vol de 18:00 ; en retard pour un vol de 10:00 (sa commande est due à 09:15).
const PERSONNEL = (std = '18:00') => jouer({ vols: [dep('NO1', 'NORD', std, { bc: 10 })], bareme: { cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c2' } });
// Le montage attend NORD/BC de la cuisine jusqu'à 08:00 (dans l'ordre de sa liste) ; NORD/YC, sans fournisseur, prête dès
// 06:00, attend jusqu'à 08:30 pendant que ses personnes attendent la cuisine → « amont ». Il la finit à 09:00 : à l'heure pour
// un vol de 18:00 ; en retard pour un vol de 09:30 (sa commande est due à 08:45).
const AMONT = (std = '18:00') => jouer({ vols: [dep('NO1', 'NORD', std, { bc: 10 })], bareme: { cuisine: { '*/BC': 120 }, prepa: { '*/BC': 30, '*/YC': 30 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/BC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa'])], parcoursCabine: { BC: 'c1', YC: 'c2' } });

test('2. un goulot « personnel » : la file, l’attente la plus longue, le cumul, la fenêtre', () => {
  const { r, args } = PERSONNEL('10:00'), c = R.reponses(r, args, { seuils: { attenteLot: 60 } }).coince;
  const mo = c.services.find(s => s.service === 'prepa'), cu = c.services.find(s => s.service === 'cuisine');
  assert.equal(mo.arrivages, 2, 'NORD/BC à 06:00 (l’arrivée de l’équipe), NORD/YC à 07:00');
  assert.deepEqual(mo.file, { arrivages: 1, a: h('07:00') });
  assert.deepEqual(mo.attenteMax, { minutes: 120, lot: 'NORD/YC', lots: 1, equipe: 'mo', de: h('07:00'), a: h('09:00') });
  assert.equal(mo.cumul, 120, '1 arrivage × 120 min');
  assert.deepEqual(mo.parts, { materiel: 0, amont: 0 });
  proche(mo.occupationFile, 1, 'au travail tout le temps de la file');
  assert.equal(mo.cause, 'personnel');
  assert.deepEqual([cu.cumul, cu.cause, cu.attenteMax], [0, null, null], 'la cuisine : rien n’attend');
  // Le goulot : sa commande NORD/YC part en retard (finie à 09:45, due à 09:15) ; il finit dans son horaire, mais son lot
  // finit après la limite. La cuisine, par qui passe cette commande, coince aussi : son lot a fini avant la limite, la
  // commande prend son retard en aval ; le montage, au plus grand cumul d'attente, passe devant.
  assert.deepEqual([mo.enRetard, mo.apresLimite, cu.enRetard, cu.apresLimite], [1, 1, 1, 0]);
  assert.deepEqual(c.goulot, { service: 'prepa', nom: 'Montage', jour: 0, depasse: 0, heuresSup: 0, enRetard: 1, apresLimite: 1, equipe: null, cumul: 120, attenteMax: 120,
    cause: { code: 'limite' } });
  assert.deepEqual(c.goulots.map(g => [g.service, g.enRetard, g.cumul, g.cause.code]), [['prepa', 1, 120, 'limite'], ['cuisine', 1, 0, 'aval']]);
  // Le même arrivage qui attend, tout à l'heure (le vol de 18:00), dans l'horaire : la ligne garde son attente et sa cause, mais rien ne coince.
  const p = PERSONNEL(), d = R.reponses(p.r, p.args, { seuils: { attenteLot: 60 } }).coince, mo2 = d.services.find(s => s.service === 'prepa');
  assert.deepEqual([mo2.attenteMax.minutes, mo2.cumul, mo2.cause, mo2.enRetard], [120, 120, 'personnel', 0]);
  assert.deepEqual([d.goulot, d.goulots], [null, []]);
});

test('2. une équipe inoccupée du même service ne dilue pas l’occupation de celle qui tient la file', () => {
  // La même journée, avec à côté du montage une équipe de 2 personnes sans lot : le montage reste occupé à 100 % pendant sa file.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00', { bc: 10 })], bareme: { cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']]), eq('vide', 'prepa', '06:00', 2, [])],
    parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c2' } });
  const mo = R.reponses(r, args).coince.services.find(s => s.service === 'prepa');
  proche(mo.occupationFile, 1);
  assert.equal(mo.cause, 'personnel');
});

test('2. un goulot « amont » : les personnes attendent le service d’avant pendant que la file monte', () => {
  const { r, args } = AMONT('09:30'), c = R.reponses(r, args, { seuils: { attenteLot: 60 } }).coince, mo = c.services.find(s => s.service === 'prepa');
  assert.deepEqual(mo.attenteMax, { minutes: 150, lot: 'NORD/YC', lots: 1, equipe: 'mo', de: h('06:00'), a: h('08:30') });
  assert.deepEqual(mo.parts, { materiel: 0, amont: 120 }, 'de 06:00 à 08:00, le montage attend la cuisine');
  proche(mo.occupationFile, 0.2, '30 min au travail sur 150 de file');
  assert.equal(mo.cause, 'amont');
  // NORD/YC part en retard (finie à 09:00, due à 08:45 : 15 min) ; avant son premier lot (NORD/BC, à 08:00), le montage
  // attendait la cuisine depuis 06:00 : ces 2 h perdues couvrent le retard, la cause les nomme.
  assert.deepEqual(c.goulot, { service: 'prepa', nom: 'Montage', jour: 0, depasse: 0, heuresSup: 0, enRetard: 1, apresLimite: 1, equipe: null, cumul: 150, attenteMax: 150,
    cause: { code: 'amont', service: 'cuisine', nom: 'Cuisine', a: h('08:00') } });
});

test('2. une journée sans goulot : tout finit dans l’horaire et rien ne part en retard ; le seuil d’attente n’y joue pas', () => {
  // Un arrivage attend 2 h, mais tout finit à l'heure : rien ne coince, au seuil d'attente le plus bas comme au plus haut.
  const p = PERSONNEL();
  for (const attenteLot of [0, 119, 360, 1440]) assert.equal(R.reponses(p.r, p.args, { seuils: { attenteLot } }).coince.goulot, null, 'au seuil de ' + attenteLot + ' min');
  // Avec un départ en retard (le vol de 10:00), le même service coince, à n'importe quel seuil d'attente.
  const q = PERSONNEL('10:00');
  for (const attenteLot of [0, 120, 1440]) assert.equal(R.reponses(q.r, q.args, { seuils: { attenteLot } }).coince.goulot.service, 'prepa');
  // Une commande pas finie (le montage, à 1 personne pour 1,43 poste, est coupé par la fin de son poste) : ses services
  // coincent. Le montage, qui ne finit pas son lot, d'abord ; la cuisine a fini le sien : le retard se prend en aval.
  const { r, args } = SOUS_SUR();
  assert.deepEqual(R.reponses(r, args).coince.goulots.map(g => [g.service, g.enRetard, g.cause.code]), [['prepa', 1, 'limite'], ['cuisine', 1, 'aval']]);
});

/* ---- 3. À quelle heure chaque service finit-il, avec combien d'heures sup ? ------------------------ */

test('3. un service qui finit après son horaire : sa fin, la fin de son horaire, ses heures sup', () => {
  // Une personne, 480 homme-minutes : 06:00–09:00, pause, 09:15–12:15, pause de 45 min, 13:00–15:00 ; son horaire finit à 14:00.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 480 } }, heuresSup: { actif: true, plafond: 120 },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])], parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const f = R.reponses(r, args).fins.services.find(s => s.service === 'prepa');
  // L'équipe qui dépasse est nommée, avec sa propre fin et son propre horaire (correction 18, retouches).
  assert.deepEqual(f, { service: 'prepa', nom: 'Montage', jour: 0, fin: h('15:00'), finHoraire: h('14:00'), depasse: 60,
    equipeQuiDepasse: { id: 'mo', nom: 'mo', fin: h('15:00'), finHoraire: h('14:00'), depasse: 60 },
    heuresSup: { equipes: 60, renforts: 0, chauffeurs: 0, total: 60 }, equipes: [{ id: 'mo', nom: 'mo', fin: h('15:00'), finHoraire: h('14:00'), depasse: 60 }] });
  // Une seconde équipe dont l'horaire finit plus tard ne cache pas le dépassement de la première.
  const deux = jouer({ vols: [dep('NO1', 'NORD', '20:00'), dep('SU1', 'SUD', '22:00')], bareme: { prepa: { '*/YC': 480 } }, heuresSup: { actif: true, plafond: 120 },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('soir', 'prepa', '12:00', 2, [['SUD/YC']])], parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const f2 = R.reponses(deux.r, deux.args).fins.services.find(s => s.service === 'prepa');
  assert.deepEqual([f2.finHoraire, f2.depasse], [h('20:00'), 60], 'le soir finit dans son horaire (20:00) ; le matin dépasse le sien de 60 min');
  assert.deepEqual([f2.equipeQuiDepasse.id, f2.equipeQuiDepasse.fin, f2.equipeQuiDepasse.finHoraire], ['mo', h('15:00'), h('14:00')], 'c’est le matin qui est nommé');
  // Dans son horaire : rien ne dépasse, aucune heure sup.
  const p = PERSONNEL(), g = R.reponses(p.r, p.args).fins.services.find(s => s.service === 'prepa');
  assert.deepEqual([g.fin, g.finHoraire, g.depasse, g.heuresSup.total], [h('09:45'), h('14:00'), 0, 0]);
  // Pas fini (un lot coupé par la fin du poste) : pas d'heure de fin.
  const s = SOUS_SUR(), m = R.reponses(s.r, s.args).fins.services.find(x => x.service === 'prepa');
  assert.deepEqual([m.fin, m.depasse], [null, null]);
});

/* ---- 4. Qu'est-ce qui part en retard ? ------------------------------------------------------------- */

test('4. une journée sans retard : la liste des exceptions est vide', () => {
  const { r, args } = PERSONNEL();
  assert.deepEqual(R.reponses(r, args).exceptions, []);
});

test('4. un vol chargé en retard, sa commande prête en retard : le retard, et la cause dite par l’étape qui a attendu', () => {
  // La cuisine livre NORD/YC à 08:00 ; le montage l'attend depuis 06:00 et la finit à 08:30 ; le vol part à 08:15.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '08:15')], bareme: { cuisine: { '*/YC': 120 }, prepa: { '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), quais],
    parcours: [chemin('c1', ['cuisine', 'prepa', 'quais'])], parcoursCabine: { YC: 'c1' } });
  const ex = R.reponses(r, args).exceptions;
  const phrase = 'Le plus long à attendre : Montage a attendu 2 h 00 que Cuisine finisse.';
  assert.deepEqual(ex.map(x => [x.type, x.id]), [['vol-en-retard', 'NO1'], ['commande-en-retard', 'NORD/YC']]);
  const vol = ex[0], cmd = ex[1];
  assert.deepEqual([vol.limite, vol.fin, vol.retard], [h('08:15'), h('08:50'), 35]);
  assert.deepEqual(vol.cause, { code: 'commande', mot: 'commande pas prête', phrase });
  assert.deepEqual([cmd.libelle, cmd.limite, cmd.fin, cmd.retard], ['NORD · Économie', h('07:30'), h('08:30'), 60]);
  assert.deepEqual(cmd.cause, { code: 'attente', mot: 'attente de l’amont', phrase });
  // Un retard sous le seuil n'est pas une exception.
  assert.deepEqual(R.reponses(r, args, { seuils: { retard: 61 } }).exceptions, []);
});

test('4. un vol pas chargé, un vol sans équipe : en tête de la liste, avec leur cause', () => {
  // NORD/YC finie à 09:00 (le vol partait à 09:00) ; SUD/YC à 12:15, mais le poste des quais finit à 14:00, avant son chargement ;
  // EST/YC : aucune équipe ne la prépare.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '09:00'), dep('SU1', 'SUD', '20:00'), dep('ES1', 'EST', '21:00')], bareme: { prepa: { '*/YC': 180 } },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC'], ['SUD/YC']]), quais],
    parcours: [chemin('c1', ['prepa', 'quais'])], parcoursCabine: { YC: 'c1' } });
  const ex = R.reponses(r, args).exceptions;
  assert.deepEqual(ex.map(x => [x.type, x.id]), [['sans-equipe', 'ES1'], ['vol-pas-charge', 'SU1'], ['vol-en-retard', 'NO1'], ['commande-en-retard', 'NORD/YC']]);
  assert.deepEqual(ex[0].cause, { code: 'sans-equipe', mot: 'commandes sans équipe', phrase: 'pas encore d’équipe : EST · Économie' });
  assert.deepEqual([ex[1].retard, ex[1].cause], [null, { code: 'poste', mot: 'pas chargé', phrase: 'poste du handling fini' }]);
  assert.deepEqual([ex[2].retard, ex[2].cause.code], [20, 'commande']);
  assert.deepEqual(ex[3].cause, { code: 'travail', mot: 'finie trop tard', phrase: 'Montage la finit à 09:00, sans attendre l’amont.' });
});

/* ---- 5. Que change mon scénario ? ------------------------------------------------------------------ */

test('5. deux essais : la différence sur chacune des quatre réponses (B − A)', () => {
  const A = SOUS_SUR(1), B = SOUS_SUR(2);
  const d = R.comparer(R.reponses(A.r, A.args), R.reponses(B.r, B.args));
  assert.deepEqual(d.personnes.total, { besoin: { a: 3, b: 3, d: 0 }, presents: { a: 4, b: 5, d: 1 }, ecart: { a: 1, b: 2, d: 1 } });
  const mo = d.personnes.services.find(s => s.service === 'prepa');
  assert.deepEqual([mo.presents, mo.ecart], [{ a: 1, b: 2, d: 1 }, { a: -1, b: 0, d: 1 }]);
  // A : la commande n'est pas finie, ses services coincent (à égalité, celui qui ne finit pas son lot d'abord) ; B : rien ne coince.
  assert.deepEqual(d.coince.goulot, { a: 'prepa', b: null, jourA: 0, jourB: null, change: true });
  // Avec deux personnes, le montage finit (A : pas fini) ; la commande devient prête.
  const fin = d.fins.services.find(s => s.service === 'prepa').fin;
  assert.equal(fin.a, null); assert.ok(fin.b > h('08:20'));
  assert.deepEqual(d.exceptions.nombre, { a: 1, b: 0, d: -1 });
  assert.deepEqual(d.exceptions.reglees.map(x => [x.type, x.id]), [['vol-pas-pret', 'NO1']]);
  assert.deepEqual(d.exceptions.nouvelles, []);
  assert.equal(R.comparer(null, R.reponses(B.r, B.args)), null, 'un essai qui n’a pas pu se jouer : rien à comparer');
  // Un essai comparé à lui-même : aucune différence.
  const meme = R.comparer(R.reponses(A.r, A.args), R.reponses(A.r, A.args));
  assert.ok(meme.personnes.services.every(s => s.besoin.d === 0 && s.presents.d === 0));
  assert.deepEqual([meme.exceptions.nouvelles, meme.exceptions.reglees], [[], []]);
});

/* ---- Les comptes (évolution 15 c) ------------------------------------------------------------------- */

test('les comptes disent leur périmètre : les vols que le handling charge, à part les commandes sans avion ; les repas, à part l’équipement', () => {
  // NO1 (08:15) chargé en retard ; SU1 (20:00) à l'heure ; PR1, un vol que le handling ne charge pas (une compagnie qu'il ne sert pas).
  const h = { ...quais, compagnies: ['NORD', 'SUD'] };
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '08:15'), dep('SU1', 'SUD', '20:00'), dep('PR1', 'PROD', '12:00')],
    bareme: { cuisine: { '*/YC': 120 }, prepa: { '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC'], ['SUD/YC'], ['PROD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC'], ['SUD/YC'], ['PROD/YC']]), h],
    parcours: [chemin('c1', ['cuisine', 'prepa', 'quais'])], parcoursCabine: { YC: 'c1' } });
  const c = R.reponses(r, args).comptes, par = Object.values(r.parClasse).filter(x => !x.absente);
  assert.deepEqual(c.vols, { suivis: r.vols.length, charges: r.vols.filter(v => v.fin != null).length, aHeure: r.vols.filter(v => v.aHeure).length });
  assert.ok(!r.vols.some(v => v.id === 'PR1'), 'PR1 n’est pas chargé par le handling');
  assert.equal(c.sansAvion, 1, 'PROD/YC : une commande sans avion');
  const repas = par.filter(x => !x.id.includes('/@')), equip = par.filter(x => x.id.includes('/@'));
  assert.deepEqual(c.repas, { suivies: repas.length, aHeure: repas.filter(x => x.aHeure).length, enRetard: repas.filter(x => x.fin != null && !x.aHeure).length,
    pasFinies: repas.filter(x => x.fin == null).length });
  assert.deepEqual(c.equipement, { suivies: 0, aHeure: 0, enRetard: 0, pasFinies: 0 }); assert.equal(equip.length, 0);
  // L'unité fictive : l'armement de chaque compagnie (« CIE/@ARM ») est une commande d'équipement, compté à part.
  const F = require('./plan-rejoue-fictif.cjs'), f = F.heureDuPicAttendue(F.sauvegardeFictive(), F.volsCsv()), cf = R.reponses(f.resultat, f.args).comptes;
  const arm = Object.values(f.resultat.parClasse).filter(x => !x.absente && x.id.includes('/@ARM'));
  assert.ok(arm.length >= 1); assert.equal(cf.equipement.suivies, arm.length);
  assert.equal(cf.repas.suivies + cf.equipement.suivies, f.resultat.indicateurs.classesSuivies);
  // Les mêmes nombres que les indicateurs de la journée, réunis.
  const k = r.indicateurs;
  assert.equal(c.repas.suivies + c.equipement.suivies, k.classesSuivies);
  assert.equal(c.repas.aHeure + c.equipement.aHeure, k.aHeure);
  assert.equal(c.repas.enRetard + c.equipement.enRetard, k.enRetard);
  assert.equal(c.sansEquipe, k.classesAbsentes);
  // Sans handling : pas de vols chargés, pas de commande « sans avion ».
  const p = PERSONNEL(), c2 = R.reponses(p.r, p.args).comptes;
  assert.deepEqual([c2.vols.suivis, c2.sansAvion], [0, 0]);
});

/* ---- Les seuils ------------------------------------------------------------------------------------ */

test('les seuils : les défauts quand la sauvegarde ne les a pas', () => {
  // Correction 17 (c) : l'attente d'un lot à 6 h (un lot attend normalement son tour plusieurs heures), l'écart à 3 personnes.
  assert.deepEqual(R.SEUILS_DEFAUT, { ecartPersonnes: 3, attenteLot: 360, occupation: 95, dureeStockMax: null, retard: 1 });
  assert.deepEqual(R.seuilsComplets(), R.SEUILS_DEFAUT);
  assert.deepEqual(R.seuilsComplets({ attenteLot: 30 }), { ...R.SEUILS_DEFAUT, attenteLot: 30 });
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: {} };
  assert.deepEqual(R.seuilsDeLaSauvegarde(sauvegarde), R.SEUILS_DEFAUT);
  const env = R.enveloppe({ dureeStockMax: 1440, occupation: 90 });
  assert.deepEqual(env, { schema: 'ory-seuils', version: 1, seuils: { ...R.SEUILS_DEFAUT, dureeStockMax: 1440, occupation: 90 } });
  assert.deepEqual(R.lireEnveloppe(JSON.parse(JSON.stringify(env))), env.seuils);
  assert.deepEqual(R.seuilsDeLaSauvegarde({ ...sauvegarde, contenu: { [R.CLE_STOCKAGE]: env } }), env.seuils);
  assert.equal(R.CLE_STOCKAGE, 'ory-seuils-v1');
  // Sans seuils donnés, les réponses prennent les défauts.
  const { r, args } = PERSONNEL();
  assert.deepEqual(R.reponses(r, args).seuils, R.SEUILS_DEFAUT);
});

test('les seuils : une valeur invalide est refusée, en la nommant', () => {
  assert.throws(() => R.seuilsComplets({ occupation: 120 }), /Occupation/);
  assert.throws(() => R.seuilsComplets({ attenteLot: -5 }), /Attente d’un arrivage/);
  assert.throws(() => R.seuilsComplets({ retard: 'vite' }), /Retard/);
  assert.throws(() => R.seuilsComplets({ ecartPersonnes: null }), /Écart de personnes/);
  assert.throws(() => R.seuilsComplets({ dureeStockMax: 0 }), /Durée maximale d’un stock/);
  assert.throws(() => R.seuilsComplets({ inconnu: 1 }), /inconnu/);
  assert.throws(() => R.lireEnveloppe({ schema: 'ory-seuils', version: 2, seuils: {} }), /version/);
  assert.throws(() => R.lireEnveloppe({ schema: 'autre', version: 1, seuils: {} }), /ory-seuils/);
  assert.throws(() => R.reponses(PERSONNEL().r, PERSONNEL().args, { seuils: { occupation: 0 } }), /Occupation/);
  // Vide : la durée d'un stock seulement (pas d'alerte).
  assert.equal(R.seuilsComplets({ dureeStockMax: null }).dureeStockMax, null);
  assert.equal(R.stockTropLong(2000, R.SEUILS_DEFAUT), false, 'sans durée maximale réglée, aucune alerte de stock');
  assert.equal(R.stockTropLong(2000, { ...R.SEUILS_DEFAUT, dureeStockMax: 1440 }), true);
  assert.equal(R.stockTropLong(1440, { ...R.SEUILS_DEFAUT, dureeStockMax: 1440 }), false);
});

/* ---- L'outil ---------------------------------------------------------------------------------------- */

test('l’outil simuler-journee : --reponses ajoute les réponses, aux seuils de la sauvegarde ; sans l’option, rien ne change', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
  const F = require('./plan-rejoue-fictif.cjs'), J = require('../moteur/journee.js');
  const OUTIL = path.join(__dirname, '..', 'outils', 'simuler-journee.cjs'), dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-reponses-'));
  try {
    const sauvegarde = F.sauvegardeFictive(), avecSeuils = { ...sauvegarde, contenu: { ...sauvegarde.contenu, [R.CLE_STOCKAGE]: R.enveloppe({ attenteLot: 60 }) } };
    const fichier = (nom, x) => { const f = path.join(dossier, nom); fs.writeFileSync(f, x); return f; };
    const s1 = fichier('s1.json', JSON.stringify(sauvegarde)), s2 = fichier('s2.json', JSON.stringify(avecSeuils)), vols = fichier('vols.csv', F.volsCsv());
    const lancer = (...a) => JSON.parse(execFileSync(process.execPath, [OUTIL, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const sans = lancer(s1, vols), avec = lancer('--reponses', s1, vols), seuils = lancer('--reponses', s2, vols);
    assert.deepEqual(Object.keys(sans), ['journee', 'resultat', 'indicateursCharge'], 'sans l’option : la sortie d’avant');
    assert.deepStrictEqual(avec.resultat, sans.resultat);
    assert.deepStrictEqual(avec.indicateursCharge, sans.indicateursCharge);
    // Les mêmes réponses que la page : le même module, sur la même journée.
    const args = J.argumentsDeLaJournee(sauvegarde, await J.volsDuFichier(new File([F.volsCsv()], 'vols.csv')), {});
    assert.deepStrictEqual(avec.reponses, JSON.parse(JSON.stringify(R.reponses(J.jouer(args), args))));
    assert.deepEqual(avec.reponses.seuils, R.SEUILS_DEFAUT, 'sans seuils dans la sauvegarde : les défauts');
    const g = avec.reponses.coince.goulot;
    assert.ok(g && (g.depasse >= R.DEPASSEMENT_MIN || g.enRetard > 0), 'l’unité fictive coince : des départs en retard');
    assert.deepEqual(seuils.reponses.seuils, { ...R.SEUILS_DEFAUT, attenteLot: 60 }, 'les seuils de la sauvegarde');
    // « Où ça coince » se juge sur les conséquences (correction 18 a) : le seuil d'attente réglé n'y change rien.
    assert.deepEqual(seuils.reponses.coince.goulots, avec.reponses.coince.goulots);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

/* ---- Non-régression -------------------------------------------------------------------------------- */

test('non-régression : le résultat de la journée et les indicateurs sont identiques, avant et après les réponses', () => {
  for (const jeu of [SOUS_SUR, PERSONNEL, AMONT]) {
    const { r, args } = jeu(), avantR = JSON.stringify(r), k = I.journee(r, args), avantK = JSON.stringify(k);
    R.reponses(r, args, { k }); R.reponses(r, args);
    assert.equal(JSON.stringify(r), avantR, 'le résultat de la journée');
    assert.equal(JSON.stringify(k), avantK, 'les indicateurs donnés');
    assert.equal(JSON.stringify(I.journee(r, args)), avantK, 'les indicateurs recalculés');
    assert.equal(JSON.stringify(P.simuler(args)), avantR, 'la journée rejouée');
  }
  assert.equal(R.reponses({ ok: false }, {}), null, 'une journée qui n’a pas pu se jouer : pas de réponses');
});
