/* Banc d'essai, évolution 17 (c) — une formule par service, dans les sorties :
 * le nuage de points d'une ligne (calage-nuage.js : ses données, son dessin,
 * ses mots), la feuille « Calage » du classeur et les deux colonnes ajoutées à
 * la feuille « Période » (echanges-calage.js), les outils
 * outils/caler-periode.cjs et outils/simuler-periode.cjs. L'unité fictive de
 * tests/calage-17-fictif.cjs : une cuisine en puissance, à la limite ; une
 * plonge à effectif fixe, en sur-effectif ; un bureau hors simulation. Aucune
 * donnée réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const PE = require('../moteur/periode.js');
const R = require('../moteur/reel.js');
const C = require('../moteur/calage-periode.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const EC = require('../echanges-calage.js');
const N = require('../calage-nuage.js');
const F = require('./calage-17-fictif.cjs');

const n2 = x => Math.round(x * 100) / 100, n3 = x => Math.round(x * 1000) / 1000;
let P, CSV, COMP, RAPPORT, POLITIQUE, PREVU, dossier;
const ligne = nom => RAPPORT.lignes.find(l => l.nom === nom);
const f = nom => path.join(dossier, nom);

test.before(() => {
  P = PE.depuisSauvegarde(F.sauvegarde(), F.vols(), F.options);
  CSV = F.reelCsv(P.bilan);
  COMP = R.comparer(P.bilan, R.controler(R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(CSV) }])), F.CORRESPONDANCE);
  RAPPORT = C.caler(COMP);
  POLITIQUE = C.politiqueDe(RAPPORT, { date: '2026-12-01', correspondance: F.CORRESPONDANCE });
  PREVU = C.prevuDesJours(POLITIQUE, F.CORRESPONDANCE, P.bilan.joursTravail, R.simuleDe);
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-calage-sorties-'));
});
test.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

test('l’unité fictive : une cuisine en puissance à la limite, une plonge en sur-effectif avec sa borne, un bureau sans statut', () => {
  const [cuisine, plonge, bureau] = ['Cuisine', 'Plonge', 'Bureau'].map(ligne);
  assert.deepEqual([cuisine.retenu.modele, cuisine.statut.code, cuisine.lecture, cuisine.rythmeCharge], ['puissance', 'limite', 'besoin', null]);
  assert.match(cuisine.retenu.formule, /^heures réelles ≈ 4,\d+ × \(travail au barème\) puissance 0,4$/);
  assert.ok(Math.abs(cuisine.retenu.parametres.a / F.K - 1) < 0.1 && cuisine.retenu.parametres.p === F.EXPOSANT);
  assert.deepEqual([plonge.retenu.modele, plonge.statut.code, plonge.lecture, plonge.rythmeCharge.jours], ['constante', 'sur-effectif', 'effectif mis', 6]);
  assert.ok(Math.abs(plonge.retenu.parametres.c - F.PLONGEURS) < 0.1 && plonge.rythmeCharge.rythme > 1);
  assert.deepEqual([bureau.retenu.modele, bureau.statut, bureau.rythmeCharge], ['constante', null, null]);
});

test('le prévu : la formule de chaque ligne, son statut, son besoin « au plus » ; celui de l’unité', () => {
  assert.deepEqual(PREVU.lignes.map(l => [l.nom, l.formule, l.statut || null, l.lecture || null]),
    [['Cuisine', ligne('Cuisine').retenu.formule, 'limite', 'besoin'], ['Plonge', ligne('Plonge').retenu.formule, 'sur-effectif', 'effectif mis'], ['Bureau', ligne('Bureau').retenu.formule, null, null]]);
  const rythme = ligne('Plonge').rythmeCharge.rythme;
  for (const [i, j] of PREVU.lignes[1].jours.entries()) {
    assert.equal(j.besoinAuPlus, Math.min(j.prevu, j.simule * rythme), j.date);
    assert.equal(PREVU.unite[i].besoinAuPlus, PREVU.lignes[0].jours[i].prevu + j.besoinAuPlus + PREVU.lignes[2].jours[i].prevu);
  }
  assert.ok(PREVU.lignes[1].jours.some(j => j.besoinAuPlus < j.prevu), 'la borne joue certains jours');
});

test('le nuage d’une ligne : un point par jour appris, la courbe retenue et celle de « × a », les jours laissés de côté marqués', () => {
  const jours = COMP.lignes.find(l => l.nom === 'Cuisine').jours, retenu = ligne('Cuisine').retenu;
  // Deux mois de 14 jours : la validation par mois ; les parts à laisser de côté, les mois puis les semaines.
  const parts = N.parts(jours);
  assert.deepEqual(parts.slice(0, 2).map(p => [p.id, p.nom]), [['mois:2026-10', 'le mois de octobre 2026'], ['mois:2026-11', 'le mois de novembre 2026']]);
  assert.ok(parts.slice(2).every(p => /^semaine:2026-W\d\d$/.test(p.id)) && parts.length >= 10);
  // Par défaut, la première part : ses jours marqués, les courbes apprises sans eux — par le module du calage.
  const d = N.donnees(jours, retenu);
  assert.equal(d.points.length, jours.length);
  assert.deepEqual([d.part.id, d.part.jours], ['mois:2026-10', 31]);
  assert.deepEqual(d.points.filter(p => p.cote).map(p => p.date), jours.filter(j => j.date.startsWith('2026-10')).map(j => j.date));
  assert.deepEqual(d.courbes.map(c => [c.id, c.nom]), [['retenue', 'puissance'], ['x-a', '× a']]);
  const appris = jours.filter(j => !j.date.startsWith('2026-10')), p = C.apprendre('puissance', appris), xa = C.apprendre('x-a', appris);
  const milieu = d.courbes[0].points[60];
  assert.equal(milieu[1], p.a * Math.pow(milieu[0], p.p), 'la courbe retenue, apprise sans le mois laissé de côté');
  assert.equal(d.courbes[1].points[60][1], xa.a * milieu[0]);
  assert.deepEqual(d.courbes[0].points[0], [0, 0]);
  // Chaque point dit ce qu'en prévoient les deux courbes.
  assert.equal(d.points[5].retenue, p.a * Math.pow(jours[5].simule, p.p));
  // Aucun jour laissé de côté : les courbes de tous les jours, celles du rapport.
  const tous = N.donnees(jours, retenu, N.AUCUNE);
  assert.deepEqual([tous.part, tous.points.some(x => x.cote)], [null, false]);
  assert.equal(tous.courbes[0].points[60][1], retenu.parametres.a * Math.pow(tous.courbes[0].points[60][0], retenu.parametres.p));
  // Les axes : des maximums ronds, qui couvrent les jours.
  assert.deepEqual([d.x, d.y], [{ pas: 5, max: 25 }, { pas: 5, max: 20 }]);
  assert.deepEqual([N.echelle(0.99), N.echelle(6.1), N.echelle(100), N.echelle(0)], [{ pas: 0.2, max: 1 }, { pas: 2, max: 8 }, { pas: 20, max: 100 }, { pas: 0.2, max: 1 }]);
  // Le dessin : un cercle par jour, ceux laissés de côté marqués, deux tracés, un curseur caché ; les mots de qui ne le voit pas.
  const svg = N.svg(d);
  assert.equal((svg.match(/<circle class="pcn-point/g) || []).length, jours.length);
  assert.equal((svg.match(/class="pcn-point pcn-cote"/g) || []).length, 31);
  assert.ok(svg.includes('<path class="pcn-retenue"') && svg.includes('<path class="pcn-xa"') && svg.includes('<circle class="pcn-curseur" r="8" cx="0" cy="0" hidden/>'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  // « × a » file plus haut que le cadre : son tracé s'arrête au bord du haut, pas un segment avant.
  const xaTrace = svg.match(/<path class="pcn-xa" d="([^"]+)"/)[1].split(/[ML]/).filter(Boolean).map(q => q.split(' ').map(Number));
  assert.ok(d.courbes[1].points.some(q => q[1] > d.y.max), 'la courbe de « × a » dépasse l’ordonnée');
  assert.equal(xaTrace[xaTrace.length - 1][1], +N.py(d, d.y.max).toFixed(1));
  assert.ok(xaTrace.every(q => q[1] >= N.py(d, d.y.max) - 0.05 && q[1] <= N.py(d, 0) + 0.05), 'aucun point hors du cadre');
  // L'ordonnée se règle sur les jours et la courbe retenue, pas sur « × a ».
  assert.equal(N.donnees(jours, { modele: 'constante', nom: 'constante', parametres: { c: 11 } }, N.AUCUNE).y.max, 15);
  assert.match(N.decrire(d), /^62 jours appris : le travail au barème va de 3,5 à 20,3 ETP, les heures réelles de [\d,]+ à [\d,]+ ETP\. La courbe retenue \(« puissance »\) et celle de « × a », apprises sans le mois de octobre 2026 : ses 31 jours, laissés de côté, sont marqués d’un cercle vide\.$/);
  assert.match(N.decrire(tous), /apprises sur tous les jours\.$/);
  assert.ok(svg.includes('aria-label="' + N.decrire(d).replace(/’/g, '’') + '"'));
  // Un point survolé : le plus proche, à 24 px au plus ; ses chiffres.
  const i = d.points.findIndex(x => x.cote), x = N.px(d, d.points[i].x), y = N.py(d, d.points[i].y), proche = N.plusProche(d, x, y);
  assert.ok(Math.abs(N.px(d, d.points[proche].x) - x) < 1e-9 && Math.abs(N.py(d, d.points[proche].y) - y) < 1e-9);
  assert.equal(N.plusProche(d, 5, 5), -1, 'loin de tout point : rien');
  assert.match(N.bulle(d, i), /^\d\d\/10\/2026 : [\d,]+ ETP au barème, [\d,]+ ETP réels ; la formule retenue en prévoit [\d,]+, « × a » [\d,]+ — laissé de côté \(le mois de octobre 2026\) : les courbes sont apprises sans lui\.$/);
  assert.match(N.bulle(tous, i), /« × a » [\d,]+\.$/);
  // Une ligne retenue en « × a » : une seule courbe. Une constante : une droite à plat, et « × a » à côté.
  const plonge = N.donnees(COMP.lignes.find(l => l.nom === 'Plonge').jours, ligne('Plonge').retenu, N.AUCUNE);
  assert.deepEqual(plonge.courbes.map(c => c.id), ['retenue', 'x-a']);
  assert.ok(plonge.courbes[0].points.every(q => q[1] === ligne('Plonge').retenu.parametres.c));
  const droite = N.donnees(COMP.lignes[0].jours, { modele: 'x-a', nom: '× a', parametres: { a: 0.8 } }, N.AUCUNE);
  assert.deepEqual(droite.courbes.map(c => c.id), ['retenue']);
});

test('la feuille « Calage » : les colonnes d’avant à leur place, puis p, la formule, le choix, le statut, le rythme des jours chargés', () => {
  const calage = EC.calageVersClasseur({ comparaison: COMP, reel: R.controler(R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(CSV) }])), rapport: RAPPORT },
    { periode: P.periode, reel: 'reel.csv', correspondance: 'correspondance.json', calculeLe: new Date(2026, 11, 1) }).find(x => x.nom === 'Calage').lignes;
  const t = calage[0], col = nom => t.indexOf(nom);
  assert.deepEqual(t.slice(0, 27), ['Ligne', 'Couvre', 'Rang', 'Modèle', 'Accepté', 'a', 'a min', 'a max', 'b', 'b min', 'b max', 'Constante', 'Constante min', 'Constante max',
    'Facteurs du jour (lun. → dim.)', 'Erreur par semaine (ETP)', 'Erreur par mois (ETP)', 'Plus juste que les références', 'Stable', 'Bornes', 'Wilcoxon', 'Placebo',
    'σ (ETP)', 'Bande P10–P90 (± ETP)', 'Jours', 'Validation', 'Laissé de côté']);
  assert.deepEqual(t.slice(27), ['p', 'p min', 'p max', 'Formule', 'Choix', 'Statut', 'Ce que dit la formule', 'Rythme des jours chargés', 'Raison du statut']);
  assert.ok(calage.every(l => l.length === t.length));
  const rangee = (nom, rang, modele) => calage.find(l => l[0] === nom && l[2] === rang && (!modele || l[3] === modele));
  // Le modèle retenu de la cuisine : a, p, sa formule, son statut ; pas de rythme (à la limite).
  const cuisine = ligne('Cuisine'), r = rangee('Cuisine', 'retenu');
  assert.deepEqual([r[col('Modèle')], r[col('a')], r[col('p')], r[col('Formule')], r[col('Statut')], r[col('Ce que dit la formule')], r[col('Rythme des jours chargés')], r[col('Raison du statut')]],
    ['puissance', n3(cuisine.retenu.parametres.a), 0.4, cuisine.retenu.formule, 'à la limite', 'besoin', null, cuisine.statut.raison]);
  // Le candidat « puissance » : p et sa plage, sa formule, son choix ; un candidat accepté et pas retenu dit pourquoi.
  const c = cuisine.candidats.find(x => x.modele === 'puissance'), rc = rangee('Cuisine', 'candidat', 'puissance');
  assert.deepEqual([rc[col('p')], rc[col('p min')], rc[col('p max')], rc[col('Formule')], rc[col('Choix')]], [c.parametres.p.tous, c.parametres.p.min, c.parametres.p.max, c.formule, 'retenu']);
  for (const x of cuisine.candidats.filter(y => y.accepte && y.choix !== 'retenu')) assert.equal(rangee('Cuisine', 'candidat', x.nom)[col('Choix')], x.choix, x.modele);
  // Un plancher ou un plafond : son c dans la colonne « Constante », sa formule à côté.
  const plancher = cuisine.candidats.find(x => x.modele === 'plancher'), rp = rangee('Cuisine', 'candidat', 'plancher');
  assert.deepEqual([rp[col('Constante')], rp[col('Formule')]], [n3(plancher.parametres.c.tous), plancher.formule]);
  // La plonge : l'effectif mis, son rythme des jours chargés ; le bureau, hors simulation : ni statut ni rythme.
  const plonge = ligne('Plonge'), rpl = rangee('Plonge', 'retenu'), rb = rangee('Bureau', 'retenu');
  assert.deepEqual([rpl[col('Statut')], rpl[col('Ce que dit la formule')], rpl[col('Rythme des jours chargés')], rpl[col('Raison du statut')]],
    ['en sur-effectif', 'effectif mis', n3(plonge.rythmeCharge.rythme), plonge.statut.raison]);
  assert.deepEqual([rb[col('Formule')], rb[col('Statut')], rb[col('Rythme des jours chargés')]], [ligne('Bureau').retenu.formule, null, null]);
  // Sans borne, la raison le dit à la suite de celle du statut.
  const sansBorne = { ...RAPPORT, lignes: RAPPORT.lignes.map(l => (l.nom === 'Plonge' ? { ...l, rythmeCharge: { rythme: null, jours: 4, raison: 'pas de borne : 4 jours dans le dixième des jours les plus chargés, il en faut 5' } } : l)) };
  const f2 = EC.calageVersClasseur({ comparaison: COMP, reel: R.controler(R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(CSV) }])), rapport: sansBorne }, {}).find(x => x.nom === 'Calage').lignes;
  assert.equal(f2.find(l => l[0] === 'Plonge' && l[2] === 'retenu')[col('Raison du statut')], plonge.statut.raison + ' ; pas de borne : 4 jours dans le dixième des jours les plus chargés, il en faut 5');
});

test('la feuille « Période » : « Statut » et « Besoin au plus (ETP) », à droite ; sans statut, le classeur d’avant', () => {
  const ctx = { sauvegarde: 'unite-fictive.json', vols: 'vols.csv', reglages: {}, calculeLe: new Date(2026, 11, 1) };
  const classeur = E.periodeVersClasseur(P, { ...ctx, prevu: PREVU }), avant = classeur.find(x => x.nom === 'Période').lignes;
  const avec = EC.avecPrevuCale(classeur, PREVU), per = avec.find(x => x.nom === 'Période').lignes;
  assert.deepEqual(per[0], avant[0].concat(['Statut', 'Besoin au plus (ETP)']));
  assert.deepEqual(per[0].slice(-6), ['Simulé de la ligne (ETP)', 'Prévu calé (ETP)', 'P10 (ETP)', 'P90 (ETP)', 'Statut', 'Besoin au plus (ETP)']);
  // Les rangées du prévu gagnent deux cases ; toutes les autres sont celles d'avant, et les colonnes d'avant ne bougent pas.
  const duPrevu = l => String(l[7]).startsWith('Ligne : ') || l[7] === 'Toute l’unité (prévu calé)';
  assert.equal(per.length, avant.length);
  per.forEach((l, k) => { if (k) assert.deepEqual(duPrevu(l) ? l.slice(0, avant[0].length) : l, avant[k], 'rangée ' + k); });
  const rangees = nom => per.filter(l => l[7] === nom).map(l => l.slice(-2));
  assert.deepEqual(rangees('Ligne : Cuisine'), PREVU.lignes[0].jours.map(() => ['à la limite', null]));
  assert.deepEqual(rangees('Ligne : Plonge'), PREVU.lignes[1].jours.map(j => ['en sur-effectif', n2(j.besoinAuPlus)]));
  assert.deepEqual(rangees('Ligne : Bureau'), PREVU.lignes[2].jours.map(() => [null, null]));
  assert.deepEqual(rangees('Toute l’unité (prévu calé)'), PREVU.unite.map(j => [null, n2(j.besoinAuPlus)]));
  // Les autres feuilles ne changent pas ; le Lisez-moi dit toujours d'où vient σ du total.
  for (const x of classeur) if (x.nom !== 'Période' && x.nom !== 'Lisez-moi') assert.equal(avec.find(y => y.nom === x.nom), x, x.nom);
  assert.deepEqual(avec.find(x => x.nom === 'Lisez-moi'), EC.avecSigmaUnite(classeur, PREVU).find(x => x.nom === 'Lisez-moi'));
  // Une politique gardée avant (ni statut ni rythme) : le classeur d'avant, feuille par feuille.
  const ancienne = { ...POLITIQUE, lignes: POLITIQUE.lignes.map(({ statut, rythmeCharge, ...l }) => l) };
  const prevuAvant = C.prevuDesJours(ancienne, F.CORRESPONDANCE, P.bilan.joursTravail, R.simuleDe), classeurAvant = E.periodeVersClasseur(P, { ...ctx, prevu: prevuAvant });
  assert.ok(prevuAvant.lignes.every(l => !('formule' in l) && !('statut' in l)), 'une politique d’avant : le prévu d’avant, sans champ de plus');
  assert.deepEqual(EC.avecPrevuCale(classeurAvant, prevuAvant), EC.avecSigmaUnite(classeurAvant, prevuAvant));
  // Un service qui s'appellerait « Ligne : Plonge » n'est pas une rangée du prévu : il n'a pas ses quatre cases, il ne reçoit rien.
  const faux = classeur.map(x => (x.nom !== 'Période' ? x : { ...x, lignes: x.lignes.concat([[...x.lignes.find(l => l[7] === 'Ligne : Plonge').slice(0, 12)]]) }));
  const derniere = EC.avecBesoin(faux, PREVU).find(x => x.nom === 'Période').lignes.pop();
  assert.equal(derniere.length, 12, 'la rangée d’un service de ce nom reste telle quelle');
  assert.deepEqual(EC.avecBesoin(classeurAvant, prevuAvant), classeurAvant);
  assert.deepEqual(EC.avecBesoin(classeur, null), classeur, 'sans prévu : rien');
});

test('les outils : caler-periode rend la formule, le statut et la borne ; simuler-periode le prévu, son statut et son besoin « au plus », et les deux colonnes du classeur', async () => {
  const lancer = (outil, ...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'outils', outil), ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  fs.writeFileSync(f('sauvegarde.json'), JSON.stringify(F.sauvegarde()));
  fs.writeFileSync(f('vols.csv'), F.volsCsv());
  fs.writeFileSync(f('options.json'), JSON.stringify(F.options));
  fs.writeFileSync(f('reel.csv'), CSV);
  fs.writeFileSync(f('correspondance.json'), JSON.stringify(F.CORRESPONDANCE));
  const periode = lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), f('options.json'), '--sans-detail');
  assert.equal(periode.status, 0, periode.stderr);
  fs.writeFileSync(f('periode.json'), periode.stdout);
  // caler-periode : le rapport du module, avec ses nouveaux champs ; sur la sortie d'erreur, une ligne par ligne calée.
  const cale = lancer('caler-periode.cjs', f('periode.json'), f('reel.csv'), f('correspondance.json'), '--xlsx', f('calage.xlsx'));
  assert.equal(cale.status, 0, cale.stderr);
  const sortie = JSON.parse(cale.stdout);
  assert.deepEqual(sortie.rapport, JSON.parse(JSON.stringify(RAPPORT)), 'le rapport du module');
  for (const k of ['statut', 'lecture', 'rythmeCharge', 'essayes', 'seuil']) assert.ok(k in sortie.rapport.lignes[1], k);
  assert.ok(sortie.rapport.lignes[0].retenu.formule && sortie.rapport.lignes[0].candidats.every(c => c.formule));
  assert.ok(cale.stderr.includes('Calage, Cuisine : puissance — ' + ligne('Cuisine').retenu.formule + ' ; à la limite (besoin).'), cale.stderr);
  assert.match(cale.stderr, /Calage, Plonge : constante — heures réelles ≈ 6(,\d+)?, quel que soit le travail au barème ; en sur-effectif \(effectif mis\), besoin au plus [\d,]+ × le travail au barème du jour\./);
  assert.match(cale.stderr, /Calage, Bureau : constante \(hors simulation : la constante\) — heures réelles ≈ 2, quel que soit le travail au barème\./);
  const feuilleCalage = (await T.lireClasseur(new Uint8Array(fs.readFileSync(f('calage.xlsx'))))).find(x => x.nom === 'Calage').lignes;
  assert.deepEqual(feuilleCalage[0].slice(-9), ['p', 'p min', 'p max', 'Formule', 'Choix', 'Statut', 'Ce que dit la formule', 'Rythme des jours chargés', 'Raison du statut']);
  // simuler-periode : une sauvegarde qui garde la politique rend le prévu, avec le statut et le besoin « au plus ».
  const sv = F.sauvegarde();
  sv.contenu['ory-calage-v1'] = { correspondance: F.CORRESPONDANCE, decisions: {}, politique: POLITIQUE };
  fs.writeFileSync(f('avec-politique.json'), JSON.stringify(sv));
  const avec = lancer('simuler-periode.cjs', f('avec-politique.json'), f('vols.csv'), f('options.json'), '--sans-detail', '--xlsx', f('periode.xlsx'));
  assert.equal(avec.status, 0, avec.stderr);
  const ja = JSON.parse(avec.stdout), js = JSON.parse(periode.stdout);
  assert.deepEqual(ja.bilan, js.bilan, 'le bilan de la période ne change pas');
  assert.deepEqual(ja.prevuCale, JSON.parse(JSON.stringify(PREVU)), 'le prévu du module');
  assert.deepEqual(ja.prevuCale.lignes.map(l => [l.nom, l.statut || null]), [['Cuisine', 'limite'], ['Plonge', 'sur-effectif'], ['Bureau', null]]);
  assert.ok(ja.prevuCale.lignes[1].jours.every(j => Number.isFinite(j.besoinAuPlus)) && ja.prevuCale.unite.every(j => Number.isFinite(j.besoinAuPlus)));
  const per = (await T.lireClasseur(new Uint8Array(fs.readFileSync(f('periode.xlsx'))))).find(x => x.nom === 'Période').lignes;
  assert.deepEqual(per[0].slice(-2), ['Statut', 'Besoin au plus (ETP)']);
  const iStatut = per[0].indexOf('Statut');
  assert.deepEqual(per.filter(l => l[7] === 'Ligne : Plonge').map(l => [l[iStatut], l[iStatut + 1]]), PREVU.lignes[1].jours.map(j => ['en sur-effectif', n2(j.besoinAuPlus)]));
});
