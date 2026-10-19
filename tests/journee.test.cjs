/* Jouer une journée hors du navigateur (évolution 1 du banc d'essai) : la
 * sauvegarde relue comme « Restaurer » la relit, les réglages forcés par les
 * options, les vols lus par le code de l'import, l'outil en ligne de commande.
 * Données fictives : la référence de non-régression (NORD, SUD, EST, OUEST). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const J = require('../moteur/journee.js');
const P = require('../moteur/production.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const REF = require('./non-regression.attendu.json');

const scenario = nom => REF.scenarios.find(s => s.nom === nom);
const VOL = scenario('unite-vol'), DEBIT = scenario('unite-debit');
const json = x => JSON.parse(JSON.stringify(x));
const OUTIL = path.join(__dirname, '..', 'outils', 'simuler-journee.cjs');

test('une sauvegarde qui n’en est pas une est refusée', () => {
  assert.throws(() => J.argumentsDeLaJournee({ schema: 'ory-plan' }, []), /sauvegarde complète/);
  assert.throws(() => J.argumentsDeLaJournee(null, []), /sauvegarde complète/);
  // Une partie invalide nomme la partie, comme « Restaurer ».
  const casse = json(VOL.sauvegarde); casse.contenu['ory-ateliers-v1'].version = 99;
  assert.throws(() => J.argumentsDeLaJournee(casse, VOL.args.vols), /ateliers de travail — /);
});

test('une sauvegarde sans aucune partie : ce que la page a sans elles', () => {
  const args = J.argumentsDeLaJournee({ schema: 'ory-sauvegarde', version: 1, contenu: {} }, VOL.args.vols);
  assert.deepEqual(args.ateliers, []);
  assert.equal(args.liaisons.length, 16, 'les liens du plan de base');
  assert.equal(args.rendement, P.RENDEMENT_DEMO);
  assert.ok(P.simuler(args).ok);
});

test('les options : inconnues refusées, délai et décalage bornés comme dans la page', () => {
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { plafond: 3 }), /option inconnue : « plafond »/);
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { delaiChargement: 5 }), /10 à 120/);
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { decalage: 90 }), /-60 à 60/);
  const a = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { delaiChargement: 60, decalage: 15 });
  assert.equal(a.delaiChargement, 60);
  const no101 = a.vols.find(v => v.id === 'NO101');
  assert.equal(no101.std, P.minutes('06:25'), 'le décalage avance ou retarde tous les vols');
  const c = a.classes.find(x => x.id === 'NORD/BC');
  assert.equal(c.vols[0].echeance, P.minutes('06:25') - 60, 'l’échéance suit le délai de chargement');
});

test('un réglage forcé passe par le validateur ; une faute de frappe est refusée', () => {
  const a = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { modele: { rendement: 0.8, regime: { presence: 420 } } });
  assert.equal(a.rendement, 0.8);
  assert.equal(a.regime.presence, 420);
  assert.deepEqual(a.regime.seuils, VOL.args.regime.seuils, 'le reste de la règle de poste est gardé');
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { modele: { rendemant: 0.8 } }), /réglage inconnu ou refusé : modele\.rendemant/);
  // L'état des cases : le matériel, sans la liste des équipes.
  const m = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { ateliers: { materiel: { delaiRetour: 45 } } });
  assert.equal(m.materiel.delaiRetour, 45);
  assert.equal(m.materiel.actif, true, 'les autres réglages du matériel restent');
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { ateliers: { ateliers: [] } }), /sans la liste des équipes/);
});

test('une équipe se règle par son identifiant ou par son nom', () => {
  const a = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { equipes: { mo: { personnes: 12 }, 'Plonge soir': { debut: '14:00' } } });
  assert.equal(a.ateliers.find(x => x.id === 'mo').personnes, 12);
  assert.equal(a.ateliers.find(x => x.id === 'pl2').debut, '14:00');
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { equipes: { Personne: { personnes: 1 } } }), /aucune équipe « Personne »/);
  assert.throws(() => J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, { equipes: { mo: { personnez: 1 } } }), /equipes\.mo\.personnez/);
  const deux = json(VOL.sauvegarde); deux.contenu['ory-ateliers-v1'].ateliers.find(x => x.id === 'pl1').nom = 'Plonge soir';
  assert.throws(() => J.argumentsDeLaJournee(deux, VOL.args.vols, { equipes: { 'Plonge soir': { personnes: 1 } } }), /plusieurs équipes/);
});

test('le plan et les liens : salle annexe, service retiré ou renommé, service supprimé encore cité', () => {
  const v = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, VOL.options);
  const annexe = Object.keys(v.noms).find(id => v.noms[id] === 'Montage bis');
  assert.ok(annexe, 'une annexe est un service');
  assert.deepEqual(v.bareme[annexe], v.bareme.prepa, 'avec le barème de son atelier');
  assert.ok(v.liaisons.some(l => l.from === 'cuisine' && l.to === annexe) && v.liaisons.some(l => l.from === annexe && l.to === 'handling'), 'et ses liens');
  assert.ok(!v.liaisons.some(l => l.from === 'magasin' && l.to === 'prepa'), 'un lien désactivé ne compte pas');
  assert.ok(v.liaisons.some(l => l.from === 'magasin' && l.to === 'dotation'), 'un lien ajouté compte');
  assert.equal(v.noms.cuisine, 'Cuisine froide', 'le nom du plan');
  const d = J.argumentsDeLaJournee(DEBIT.sauvegarde, DEBIT.args.vols, DEBIT.options);
  assert.equal(d.noms.bobduty, 'Duty free (supprimé)', 'une équipe dans un service retiré');
  assert.ok(!d.liaisons.some(l => l.from === 'bobduty' || l.to === 'bobduty'), 'ses liens ne comptent plus');
});

test('les vols se lisent comme dans la page : CSV, classeur Excel', async () => {
  const UI = require('../ui-model.js');
  const csv = 'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\nNO1,NORD,GROS,DEP,06:10,,10,0,100\nNO0,NORD,GROS,RET,,05:40,10,0,100\n';
  const lus = await J.volsDuFichier(new File([csv], 'vols.csv'));
  assert.deepEqual(lus, UI.parseFlights(csv));
  const classeur = T.ecrireClasseur(E.volsVersClasseur(lus));
  assert.deepEqual(await J.volsDuFichier(new File([classeur], 'vols.xlsx')), lus, 'Départs et Retours');
  await assert.rejects(J.volsDuFichier({ name: 'gros.csv', size: 5 * 1024 * 1024 }), /trop volumineux/);
});

test('les mêmes entrées donnent la même journée', () => {
  const a = J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, VOL.options);
  assert.equal(JSON.stringify(J.jouer(a)), JSON.stringify(J.jouer(J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, VOL.options))));
});

test('chaque équipe dit son service, son jour, son poste, ses personnes et ses minutes', () => {
  const r = J.jouer(J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, VOL.options));
  const cu = r.ateliers.find(a => a.id === 'cu1'), mo = r.ateliers.find(a => a.id === 'mo'), pr = r.ateliers.find(a => a.id === 'pr');
  assert.deepEqual([cu.service, cu.jour, cu.debutPoste, cu.presence], ['cuisine', -1, P.minutes('20:00') - 1440, 450]);
  assert.equal(mo.presence, 600, 'sa présence à elle');
  assert.equal(pr.presence, null, 'sans règle de poste, pas de présence');
  for (const a of r.ateliers) for (const k of ['personnes', 'travail', 'attente', 'arret']) assert.ok(Number.isFinite(a[k]), a.id + ' ' + k);
});

test('l’outil en ligne de commande rend la journée de la page', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-journee-'));
  try {
    const sauvegarde = path.join(dossier, 'sauvegarde.json'), vols = path.join(dossier, 'vols.xlsx'), options = path.join(dossier, 'options.json');
    fs.writeFileSync(sauvegarde, JSON.stringify(VOL.sauvegarde));
    fs.writeFileSync(vols, T.ecrireClasseur(E.volsVersClasseur(VOL.args.vols)));
    fs.writeFileSync(options, JSON.stringify(VOL.options));
    const sortie = JSON.parse(execFileSync(process.execPath, [OUTIL, sauvegarde, vols, options], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    assert.deepEqual([sortie.journee.schema, sortie.journee.departs, sortie.journee.retours], ['ory-journee', 16, 6]);
    assert.deepStrictEqual(sortie.resultat, json(J.jouer(J.argumentsDeLaJournee(VOL.sauvegarde, VOL.args.vols, VOL.options))));
    const args = JSON.parse(execFileSync(process.execPath, [OUTIL, '--arguments', sauvegarde, vols], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    assert.deepStrictEqual(args.noms, VOL.args.noms, '--arguments : ce que reçoit le moteur');
    const usage = spawnSync(process.execPath, [OUTIL, sauvegarde], { encoding: 'utf8' });
    assert.equal(usage.status, 2); assert.match(usage.stderr, /Usage/);
    const faux = spawnSync(process.execPath, [OUTIL, vols, vols], { encoding: 'utf8' });
    assert.equal(faux.status, 1); assert.match(faux.stderr, /Journée non jouée : sauvegarde : JSON illisible/);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
