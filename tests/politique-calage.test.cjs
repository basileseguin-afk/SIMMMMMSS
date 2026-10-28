/* Banc d'essai, évolution 11 (d) — se servir du calage (moteur/calage-periode.js) :
 * la politique d'effectif (les modèles gardés, sans aucune heure réelle), le
 * prévu calé et sa bande P10–P90 pour chaque jour d'une période, même sans
 * réel ; « Appliquer au barème » un « × a » (les minutes × a), « Annuler »
 * exactement ; après l'application et une nouvelle période, le calage trouve
 * a ≈ 1 (docs/BANC_ESSAI.md § 10). Données fictives : l'unité de la référence
 * de non-régression, un réel fabriqué. */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const R = require('../moteur/reel.js');
const C = require('../moteur/calage-periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
// Six semaines fictives : chaque jour, quelques vols de moins, selon le jour (le simulé varie).
const JOURS = PE.joursEntre('2026-09-28', '2026-11-08');
const VOLS = JOURS.flatMap((d, i) => S.args.vols.filter((v, k) => (k + i) % 5 !== 0 || v.sens !== 'DEP').map(v => ({ ...v, date: d })));
const CORR = { lignes: [{ nom: 'Cuisine', roles: ['Cuisinier'], services: ['cuisine'] }] };
/** La période d'une sauvegarde, et un réel fictif : 0,8 × la charge de la cuisine, chaque jour complet. */
const periode = sv => PE.depuisSauvegarde(sv, VOLS, S.options).bilan;
const reelDe = (b, k = 0.8) => ({ lignes: b.joursTravail.filter(w => w.complet).map((w, i) => ({ ligne: i + 2, date: w.date, role: 'Cuisinier',
  titulaires: 7 * k * w.services.cuisine.charge, interim: 0, supp: null })), avecSupp: false, avecService: false });
const caler = (b, reel) => C.caler(R.comparer(b, R.controler(reel), CORR));

let B0, rapport0;
test.before(() => { B0 = periode(S.sauvegarde); rapport0 = caler(B0, reelDe(B0)); });

test('la politique garde le modèle, ses paramètres et σ, la date et la période apprise ; aucune heure réelle', () => {
  const l = rapport0.lignes[0];
  assert.equal(l.retenu.modele, 'x-a');
  assert.ok(Math.abs(l.retenu.parametres.a - 0.8) < 0.01, 'a ' + l.retenu.parametres.a);
  const p = C.politiqueDe(rapport0, { date: '2026-11-10', periode: { debut: B0.debut, fin: B0.fin }, signature: 'abc' });
  assert.deepEqual(Object.keys(p).sort(), ['date', 'lignes', 'periode', 'signature']);
  assert.deepEqual(p.lignes.map(x => [x.nom, x.modele]), [['Cuisine', 'x-a']]);
  assert.deepEqual(C.validerPolitique(JSON.parse(JSON.stringify(p))), p, 'relue telle quelle');
  assert.throws(() => C.validerPolitique({ lignes: [{ nom: 'X', modele: 'x-a', parametres: {} }] }), /a manque/);
  assert.throws(() => C.validerPolitique({ lignes: [{ nom: 'X', modele: 'magie' }] }), /modèle inconnu/);
  // Les réglages de la sauvegarde la gardent, avec la correspondance et les décisions.
  const r = R.validerReglages({ correspondance: CORR, decisions: {}, politique: p });
  assert.deepEqual(r.politique, p);
});

test('le prévu calé de chaque jour, avec sa bande P10–P90, même pour un programme sans réel ; le total de l’unité', () => {
  const p = C.politiqueDe(rapport0, { date: '2026-11-10' });
  const futur = PE.depuisSauvegarde(S.sauvegarde, VOLS.map(v => ({ ...v, date: v.date.replace('2026-', '2027-') })), S.options).bilan;
  const jours = futur.joursTravail.filter(w => w.complet);
  const x = C.prevuDesJours(p, CORR, jours, R.simuleDe);
  const m = p.lignes[0], j = x.lignes[0].jours[3];
  assert.equal(j.simule, jours[3].services.cuisine.charge);
  assert.equal(j.prevu, m.parametres.a * j.simule);
  assert.ok(Math.abs(j.p90 - j.prevu - 1.2816 * m.sigma) < 1e-12 && Math.abs(j.prevu - j.p10 - 1.2816 * m.sigma) < 1e-12);
  assert.equal(x.unite[3].prevu, j.prevu);
  // Sans politique : rien.
  assert.equal(C.prevuDesJours(null, CORR, jours, R.simuleDe), null);
  // Une journée seule, sans date : « × a × jour » prend le facteur moyen, 1, et le dit.
  const parJour = { modele: 'x-a-jour', parametres: { a: 0.8, jours: [1.2, 1, 1, 1, 1, 0.9, 0.9] }, sigma: 0.5 };
  assert.deepEqual(C.prevuCale(parJour, { date: 'jour', simule: 10 }), { prevu: 8, p10: 8 - 1.2816 * 0.5, p90: 8 + 1.2816 * 0.5, sansJour: true });
  assert.ok(Math.abs(C.prevuCale(parJour, { date: '2026-11-02', simule: 10 }).prevu - 9.6) < 1e-12, 'un lundi : 0,8 × 1,2 × 10');
});

test('« Appliquer au barème » un × 0,8 : les minutes × 0,8 ; « Annuler » revient exactement', () => {
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  const x = { bareme: u.modele.bareme, complet: u.modele.bareme, ateliers: u.etat.ateliers, categories: u.etat.categories };
  const a = C.appliquerFacteur(x, ['cuisine'], 0.8);
  const fois = v => Math.round(v * 0.8 * 100) / 100;     // au centième de minute, comme une saisie
  for (const [c, v] of Object.entries(u.modele.bareme.cuisine)) assert.equal(a.bareme.cuisine[c], fois(v), c);
  assert.deepEqual(a.bareme.prepa, u.modele.bareme.prepa, 'les autres services ne bougent pas');
  for (const e of u.etat.ateliers.filter(e => e.service === 'cuisine' && e.minutes))
    for (const [c, v] of Object.entries(e.minutes)) assert.equal(a.ateliers.find(y => y.id === e.id).minutes[c], Math.round(v * 0.8 * 10) / 10, 'au dixième, comme une case');
  const retour = C.annulerFacteur({ bareme: a.bareme, ateliers: a.ateliers, categories: a.categories }, a.avant);
  assert.deepEqual(retour.bareme, u.modele.bareme);
  assert.deepEqual(retour.ateliers, u.etat.ateliers);
  assert.deepEqual(retour.categories, u.etat.categories);
});

test('après l’application et une nouvelle période, le calage trouve a = 1 à 2 % près', () => {
  const sv = JSON.parse(JSON.stringify(S.sauvegarde)), c = sv.contenu;
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  const a = C.appliquerFacteur({ bareme: c['ory-modele-v1'].bareme, complet: u.modele.bareme, ateliers: c['ory-ateliers-v1'].ateliers,
    categories: c['ory-ateliers-v1'].categories }, ['cuisine'], rapport0.lignes[0].retenu.parametres.a);
  c['ory-modele-v1'].bareme = a.bareme; c['ory-ateliers-v1'].ateliers = a.ateliers;
  if (a.categories && Object.keys(a.categories).length) c['ory-ateliers-v1'].categories = a.categories;
  const b1 = periode(sv), l = caler(b1, reelDe(B0)).lignes[0];
  const a1 = l.retenu.modele === 'x-a' ? l.retenu.parametres.a : l.candidats.find(x => x.modele === 'x-a').parametres.a.tous;
  assert.ok(Math.abs(a1 - 1) < 0.02, 'a = ' + a1 + ' (' + l.retenu.modele + ')');
  // Une ligne dont l'erreur monte de plus de 0,3 ETP se signale.
  const comp = { lignes: [{ nom: 'Cuisine', periode: { mae: 0.1 } }, { nom: 'Prépa', periode: { mae: 0.9 } }] };
  assert.deepEqual(C.lignesDegradees({ ligne: 'Cuisine', erreursAvant: { Cuisine: 2, 'Prépa': 0.5 } }, comp), [{ nom: 'Prépa', avant: 0.5, apres: 0.9 }]);
});

test('le classeur de la période : avec une politique, le prévu calé de chaque ligne et de l’unité ; sans, le classeur d’avant', () => {
  const E = require('../echanges.js');
  const vols = VOLS.filter(v => v.date <= '2026-10-04');
  const p = PE.depuisSauvegarde(S.sauvegarde, vols, S.options);
  const ctx = { sauvegarde: 'unite-fictive.json', vols: 'vols.csv', reglages: {}, calculeLe: new Date(2026, 9, 5) };
  const sans = E.periodeVersClasseur(p, ctx);
  const prevu = C.prevuDesJours(C.politiqueDe(rapport0, { date: '2026-11-10' }), CORR, p.bilan.joursTravail, R.simuleDe);
  const avec = E.periodeVersClasseur(p, { ...ctx, prevu });
  const per = f => f.find(x => x.nom === 'Période').lignes;
  assert.deepEqual(per(avec)[0].slice(-4), ['Simulé de la ligne (ETP)', 'Prévu calé (ETP)', 'P10 (ETP)', 'P90 (ETP)']);
  assert.ok(!per(sans)[0].includes('Prévu calé (ETP)'));
  // Sans politique, rien ne change : les mêmes feuilles, les mêmes lignes.
  const sansPrevu = per(avec).filter(l => !String(l[7]).startsWith('Ligne : ') && l[7] !== 'Toute l’unité (prévu calé)').map(l => l.slice(0, per(sans)[0].length));
  assert.deepEqual(sansPrevu, per(sans));
  const i = p.bilan.joursTravail.findIndex(w => w.complet), l = per(avec).filter(x => x[7] === 'Ligne : Cuisine')[i];
  assert.equal(l[per(avec)[0].indexOf('Prévu calé (ETP)')], Math.round(prevu.lignes[0].jours[i].prevu * 100) / 100);
});

test('l’outil simuler-periode : une sauvegarde avec une politique rend le prévu calé de chaque jour, même sans réel ; sans, le JSON d’avant', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-politique-'));
  try {
    const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    const csv = 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n' + VOLS.filter(v => v.date <= '2026-10-02')
      .map(v => [v.date.replace('2026', '2027'), v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n';
    fs.writeFileSync(path.join(dossier, 'vols-futurs.csv'), csv);
    const sv = JSON.parse(JSON.stringify(S.sauvegarde));
    fs.writeFileSync(path.join(dossier, 'sans.json'), JSON.stringify(sv));
    sv.contenu['ory-calage-v1'] = { correspondance: CORR, decisions: {}, politique: C.politiqueDe(rapport0, { date: '2026-11-10' }) };
    fs.writeFileSync(path.join(dossier, 'avec.json'), JSON.stringify(sv));
    const lancer = f => spawnSync(process.execPath, [path.join(__dirname, '..', 'outils', 'simuler-periode.cjs'), path.join(dossier, f), path.join(dossier, 'vols-futurs.csv'), '--sans-detail'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const a = lancer('avec.json'), s = lancer('sans.json');
    assert.equal(a.status, 0, a.stderr); assert.equal(s.status, 0, s.stderr);
    const ja = JSON.parse(a.stdout), js = JSON.parse(s.stdout);
    assert.ok(!('prevuCale' in js), 'sans politique : pas de prévu calé');
    assert.deepEqual(Object.keys(ja).filter(k => k !== 'prevuCale'), Object.keys(js));
    assert.deepEqual(ja.bilan, js.bilan, 'le bilan ne change pas');
    assert.equal(ja.prevuCale.lignes[0].jours.length, ja.bilan.joursTravail.length);
    assert.equal(ja.prevuCale.lignes[0].jours[1].simule, ja.bilan.joursTravail[1].services.cuisine.charge);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('« Appliquer au barème » ne vaut que pour un travail qui suit le barème ; une équipe d’appui suit ses minutes par vol', () => {
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  const x = { bareme: u.modele.bareme, complet: u.modele.bareme, ateliers: u.etat.ateliers, categories: u.etat.categories };
  // Le lavage et le handling : rien au barème, refusé ; un service avec un robot saisi : une part seulement, refusé.
  assert.match(C.appliquerFacteur(x, ['plonge'], 1.25).refus, /^aucune minute à multiplier/);
  assert.match(C.appliquerFacteur(x, ['quais'], 1.25).refus, /^aucune minute à multiplier/);
  assert.match(C.appliquerFacteur(x, ['prepa'], 1.25).refus, /« Robot » ne suit pas le barème/);
  // La dotation (une équipe d'appui calculée) : son barème et ses minutes par vol × 1,25, et sa charge suit.
  const a = C.appliquerFacteur(x, ['dotation'], 1.25), d0 = u.etat.ateliers.find(e => e.id === 'do');
  assert.equal(a.refus, null);
  assert.deepEqual(a.ateliers.find(e => e.id === 'do').minutesVol, Object.fromEntries(Object.entries(d0.minutesVol).map(([c, v]) => [c, v * 1.25])));
  const sv = JSON.parse(JSON.stringify(S.sauvegarde)), c = sv.contenu;
  c['ory-modele-v1'].bareme = a.bareme; c['ory-ateliers-v1'].ateliers = a.ateliers;
  const charge = b => b.joursTravail.filter(w => w.complet).map(w => w.services.dotation.charge);
  const avant = charge(B0), apres = charge(periode(sv));
  apres.forEach((v, i) => assert.ok(Math.abs(v / avant[i] - 1.25) < 0.01, 'dotation : ' + avant[i] + ' → ' + v));
  // Annuler : les minutes par vol d'avant.
  assert.deepEqual(C.annulerFacteur({ bareme: a.bareme, ateliers: a.ateliers, categories: a.categories }, a.avant).ateliers, u.etat.ateliers);
});

test('une annexe qui reprenait le barème garde celui d’avant ; deux facteurs sur un même service s’annulent du plus récent au plus ancien', () => {
  const x = { bareme: { cuisine: { 'NO/YC': 10 } }, complet: { cuisine: { 'NO/YC': 10 }, 'cuisine-2': { 'NO/YC': 10 } }, ateliers: [], categories: {} };
  const a = C.appliquerFacteur(x, ['cuisine'], 0.8, { parents: { 'cuisine-2': 'cuisine' } });
  assert.deepEqual(a.bareme, { cuisine: { 'NO/YC': 8 }, 'cuisine-2': { 'NO/YC': 10 } });
  assert.deepEqual(C.annulerFacteur({ ...x, bareme: a.bareme }, a.avant).bareme, x.bareme, 'annulé : l’annexe reprend à nouveau');
  const l = [{ ligne: 'A', services: ['cuisine', 'prepa'] }, { ligne: 'B', services: ['prepa', 'dotation'] }, { ligne: 'C', services: ['armement'] }];
  assert.deepEqual(l.map((_, i) => C.annulable(l, i)), [false, true, true]);
});

test('le total de l’unité compte toutes les lignes : une ligne sans calage, son simulé ; une journée seule prend le jour de travail de ses équipes', () => {
  const p = C.politiqueDe(rapport0, { date: '2026-11-10', correspondance: CORR });
  assert.deepEqual(p.lignes[0].services, ['cuisine']);
  const corr = { lignes: CORR.lignes.concat([{ nom: 'Plonge', roles: ['Plongeur'], services: ['plonge'] }]) };
  const jours = B0.joursTravail.filter(w => w.complet).slice(0, 3), x = C.prevuDesJours(p, corr, jours, R.simuleDe);
  const plonge = x.lignes.find(l => l.nom === 'Plonge');
  assert.deepEqual([plonge.modele, plonge.nonCalee], ['moteur', true]);
  jours.forEach((w, i) => {
    assert.equal(plonge.jours[i].prevu, w.services.plonge.charge);
    assert.ok(Math.abs(x.unite[i].prevu - (x.lignes[0].jours[i].prevu + w.services.plonge.charge)) < 1e-12);
    assert.ok(Math.abs(x.unite[i].simule - (w.services.cuisine.charge + w.services.plonge.charge)) < 1e-12);
  });
  assert.equal(x.sigmaUnite, p.lignes[0].sigma, 'une ligne sans calage n’ajoute pas de σ');
  // Une journée seule : la cuisine travaille la veille des vols (jour −1) ; son facteur du jour est celui de la veille.
  const j = C.jourDeLaJournee({ date: '2026-11-03', equipes: [{ service: 'cuisine', jour: -1, charge: 2 }, { service: 'prepa', jour: 0, charge: 1 }, { service: 'prepa', jour: -1, charge: 1 }] }, {});
  assert.deepEqual(j.decalages, { cuisine: [-1], prepa: [0, -1] });
  const parJour = { lignes: [{ nom: 'Cuisine', modele: 'x-a-jour', parametres: { a: 1, jours: [2, 1, 1, 1, 1, 1, 1] }, sigma: 0 },
    { nom: 'Prépa', modele: 'x-a-jour', parametres: { a: 1, jours: [2, 1, 1, 1, 1, 1, 1] }, sigma: 0 }] };
  const y = C.prevuDesJours(parJour, { lignes: [{ nom: 'Cuisine', services: ['cuisine'] }, { nom: 'Prépa', services: ['prepa'] }] }, [j], R.simuleDe);
  assert.equal(y.lignes[0].jours[0].prevu, 4, 'les vols du mardi : la cuisine travaille le lundi, facteur 2');
  assert.deepEqual([y.lignes[1].jours[0].prevu, y.lignes[1].jours[0].sansJour], [2, true], 'deux jours de travail mêlés : le facteur moyen');
});

test('une sauvegarde forgée est refusée : une politique hors bornes ou en double, une application mal formée', () => {
  const ligne = { nom: 'X', modele: 'x-a', parametres: { a: 0.8 }, sigma: 0.2 };
  assert.throws(() => C.validerPolitique({ lignes: [{ ...ligne, parametres: { a: -3 } }] }), /a hors de ses bornes/);
  assert.throws(() => C.validerPolitique({ lignes: [{ ...ligne, parametres: { a: 1e308 } }] }), /a hors de ses bornes/);
  assert.throws(() => C.validerPolitique({ lignes: [ligne, ligne] }), /deux lignes s’appellent « X »/);
  assert.throws(() => C.validerPolitique({ lignes: [{ ...ligne, modele: 'x-a-jour', parametres: { a: 1, jours: [1, 1, 1, 1, 1, 1, -1] } }] }), /sept facteurs du jour/);
  const app = { ligne: 'X', services: ['cuisine'], a: 0.8, date: '2026-11-10', avant: { bareme: { cuisine: { 'NO/YC': 10 } }, minutes: {}, categories: {} } };
  assert.deepEqual(R.validerReglages({ correspondance: CORR, applications: [app] }).applications[0].avant.bareme, app.avant.bareme);
  assert.throws(() => R.validerReglages({ correspondance: CORR, applications: [{ ...app, avant: undefined }] }), /« avant » manque/);
  assert.throws(() => R.validerReglages({ correspondance: CORR, applications: [{ ...app, avant: { bareme: { cuisine: { 'NO/YC': 'beaucoup' } } } }] }), /des minutes par vol/);
  assert.throws(() => R.validerReglages({ correspondance: CORR, applications: [{ ...app, avant: { categories: { armement: [{ nom: 'sans id' }] } } }] }), /des catégories/);
  // L'outil ne lit la partie du calage que si elle a une politique : sans, il rend ce qu'il rendait.
  assert.equal(R.validerReglages({ correspondance: CORR }).politique, undefined);
});
