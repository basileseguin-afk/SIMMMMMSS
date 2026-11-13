/* Banc d'essai, évolution 17 (d) — non-régression. L'évolution n'ajoute que
 * des champs au calage : le moteur ne change pas. Ici, sur l'unité fictive de
 * tests/calage-17-fictif.cjs :
 *   — une sauvegarde d'avant (une politique d'effectif gardée avant
 *     l'évolution : ni statut, ni rythme des jours chargés, ni forme du
 *     catalogue) se relit champ par champ, et donne le prévu d'avant ;
 *   — le résultat d'une journée, ses indicateurs et le bilan d'une période ne
 *     dépendent pas de la politique gardée, d'avant ou d'après ;
 *   — les feuilles existantes des classeurs : sans politique, et avec une
 *     politique d'avant, le classeur de la période est celui d'avant, par
 *     l'outil comme par le module.
 * Le résultat d'une journée et le bilan d'une période restent par ailleurs
 * comparés à leurs références figées (tests/non-regression.test.cjs,
 * tests/periode.test.cjs, tests/indicateurs-definitions.test.cjs), et le
 * calage aux siennes (tests/reel-absent.test.cjs, tests/reel-vide.test.cjs,
 * tests/sigma-unite.test.cjs). Aucune donnée réelle. */
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
const F = require('./calage-17-fictif.cjs');

const json = x => JSON.parse(JSON.stringify(x));
/** La partie « ory-calage-v1 » d'une sauvegarde d'avant l'évolution 17 : une politique aux modèles d'alors, sans statut. */
const AVANT = { correspondance: F.CORRESPONDANCE, decisions: { ecartes: { jours: ['2026-10-05'], cellules: [] }, reintegres: [] },
  politique: { date: '2026-11-10T08:00:00.000Z', periode: { debut: '2026-09-28', fin: '2026-11-08' }, signature: '0a1b2c3d', sigmaUnite: 1.5, lignes: [
    { nom: 'Cuisine', modele: 'x-a', parametres: { a: 0.9 }, sigma: 0.5, services: ['cuisine'] },
    { nom: 'Plonge', modele: 'b-x-a', parametres: { a: 0.6, b: 5 }, sigma: 0.2, services: ['plonge'] },
    { nom: 'Bureau', modele: 'constante', parametres: { c: 2 }, sigma: 0 }] } };
/** Dix jours du programme fictif : assez pour une période, vite jouée. */
const VOLS = F.vols().filter(v => v.date <= '2026-10-07');
const avec = (sv, part) => { const x = json(sv); x.contenu['ory-calage-v1'] = part; return x; };
let SANS;
// Avec le détail : le résultat de chaque journée (ses équipes, ses lots, ses indicateurs), comme l'outil le rend.
const DETAIL = { detail: true };
test.before(() => { SANS = PE.depuisSauvegarde(F.sauvegarde(), VOLS, F.options, DETAIL); });

test('une sauvegarde d’avant se relit : la politique champ par champ, la correspondance, les décisions', () => {
  const r = R.validerReglages(json(AVANT));
  assert.deepEqual(r.politique, AVANT.politique, 'la politique, telle quelle : ni statut ni rythme ajoutés');
  assert.deepEqual(r.correspondance.lignes, F.CORRESPONDANCE.lignes);
  assert.deepEqual(r.decisions.ecartes.jours, ['2026-10-05']);
  // Relue deux fois, elle ne bouge pas.
  assert.deepEqual(R.validerReglages(json(r)), r);
});

test('une politique d’avant donne le prévu d’avant : chaque modèle appliqué au simulé du jour, sans statut ni besoin « au plus »', () => {
  const b = SANS.bilan, prevu = C.prevuDesJours(R.validerReglages(json(AVANT)).politique, F.CORRESPONDANCE, b.joursTravail, R.simuleDe);
  b.joursTravail.forEach((w, i) => {
    // Un jour incomplet, au bord de la période, peut ne pas avoir tous ses services : leur charge y vaut 0.
    const cuisine = (w.services.cuisine || {}).charge || 0, plonge = (w.services.plonge || {}).charge || 0;
    assert.deepEqual(prevu.lignes.map(l => l.jours[i].prevu), [0.9 * cuisine, 5 + 0.6 * plonge, 2], w.date);
    const total = [0.9 * cuisine, 5 + 0.6 * plonge, 2].reduce((n, x) => n + x, 0);
    assert.deepEqual([prevu.unite[i].prevu, prevu.unite[i].p10, prevu.unite[i].p90], [total, total - 1.2816 * 1.5, total + 1.2816 * 1.5], w.date);
    assert.deepEqual(Object.keys(prevu.unite[i]), ['date', 'simule', 'prevu', 'p10', 'p90']);
  });
  for (const l of prevu.lignes) {
    assert.deepEqual(Object.keys(l), ['nom', 'modele', 'nomModele', 'sigma', 'jours'], l.nom + ' : les champs d’avant');
    assert.ok(!('statut' in l) && !('lecture' in l) && !('nomStatut' in l) && !('formule' in l), l.nom);
    assert.ok(l.jours.every(j => !('besoinAuPlus' in j)), l.nom);
  }
  assert.deepEqual([prevu.sigmaUnite, prevu.sigmaUniteSource], [1.5, 'mesuré']);
});

test('le résultat d’une journée, ses indicateurs et le bilan d’une période ne dépendent pas de la politique gardée', () => {
  // Une politique d'après l'évolution : une forme du catalogue, un statut, un rythme des jours chargés.
  const apres = { ...AVANT, politique: { ...AVANT.politique, lignes: [
    { nom: 'Cuisine', modele: 'puissance', parametres: { a: 4.4, p: 0.4 }, sigma: 0.2, services: ['cuisine'], statut: 'limite' },
    { nom: 'Plonge', modele: 'constante', parametres: { c: 6 }, sigma: 0.1, services: ['plonge'], statut: 'sur-effectif', rythmeCharge: 5.5 },
    { nom: 'Bureau', modele: 'constante', parametres: { c: 2 }, sigma: 0 }] } };
  assert.deepEqual(R.validerReglages(json(apres)).politique, apres.politique, 'elle se relit aussi');
  for (const [nom, part] of [['d’avant', AVANT], ['d’après', apres]]) {
    const p = PE.depuisSauvegarde(avec(F.sauvegarde(), part), VOLS, F.options, DETAIL);
    assert.deepEqual(json(p.bilan), json(SANS.bilan), 'le bilan de la période, champ par champ, avec une politique ' + nom);
    assert.equal(p.journees.length, SANS.journees.length);
    for (const k of [0, 4, p.journees.length - 1]) {
      assert.deepEqual(json(p.journees[k].resultat), json(SANS.journees[k].resultat), 'le résultat de la journée ' + p.journees[k].date + ', avec une politique ' + nom);
      // Ses indicateurs (dans le résultat) et ce que la période en extrait (la charge, les heures sup, les retards de chaque équipe).
      assert.ok(SANS.journees[k].resultat.indicateurs, 'la journée a ses indicateurs');
      assert.deepEqual(json(p.journees[k].extrait), json(SANS.journees[k].extrait), 'ce que la période extrait de la journée');
    }
  }
});

test('les feuilles existantes du classeur de la période : sans politique et avec une politique d’avant, le classeur d’avant', () => {
  const ctx = { sauvegarde: 'unite-fictive.json', vols: 'vols.csv', reglages: {}, calculeLe: new Date(2026, 11, 1) };
  // Sans politique : rien ne s'ajoute, c'est le même classeur.
  const sans = E.periodeVersClasseur(SANS, ctx);
  assert.equal(EC.avecPrevuCale(sans, null), sans);
  assert.ok(!sans.find(x => x.nom === 'Période').lignes[0].includes('Statut'));
  // Une politique d'avant : les quatre colonnes du prévu, et pas une de plus ; les autres feuilles telles quelles.
  const prevu = C.prevuDesJours(AVANT.politique, F.CORRESPONDANCE, SANS.bilan.joursTravail, R.simuleDe), brut = E.periodeVersClasseur(SANS, { ...ctx, prevu });
  const classeur = EC.avecPrevuCale(brut, prevu), periode = classeur.find(x => x.nom === 'Période');
  assert.deepEqual(periode.lignes[0].slice(-4), ['Simulé de la ligne (ETP)', 'Prévu calé (ETP)', 'P10 (ETP)', 'P90 (ETP)']);
  assert.equal(periode, brut.find(x => x.nom === 'Période'), 'la feuille Période d’avant, la même');
  assert.deepEqual(classeur.map(x => x.nom), brut.map(x => x.nom));
  for (const x of brut) if (x.nom !== 'Lisez-moi') assert.equal(classeur.find(y => y.nom === x.nom), x, x.nom);
});

test('l’outil simuler-periode, une sauvegarde d’avant : le prévu d’avant, la feuille Période d’avant', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-17-avant-'));
  try {
    const f = nom => path.join(dossier, nom);
    const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    fs.writeFileSync(f('avant.json'), JSON.stringify(avec(F.sauvegarde(), AVANT)));
    fs.writeFileSync(f('vols.csv'), 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
      + VOLS.map(v => [v.date, v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n');
    fs.writeFileSync(f('options.json'), JSON.stringify(F.options));
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'outils', 'simuler-periode.cjs'), f('avant.json'), f('vols.csv'), f('options.json'), '--sans-detail', '--xlsx', f('periode.xlsx')],
      { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stderr);
    const sortie = JSON.parse(r.stdout);
    assert.deepEqual(sortie.bilan, json(SANS.bilan), 'le bilan du module');
    // Le prévu : celui du module ; par ligne et par jour, les champs d'avant, pas un de plus.
    assert.deepEqual(sortie.prevuCale, json(C.prevuDesJours(AVANT.politique, F.CORRESPONDANCE, SANS.bilan.joursTravail, R.simuleDe)));
    assert.deepEqual(Object.keys(sortie.prevuCale), ['calage', 'lignes', 'unite', 'sigmaUnite', 'sigmaUniteSource']);
    assert.deepEqual(Object.keys(sortie.prevuCale.lignes[0]), ['nom', 'modele', 'nomModele', 'sigma', 'jours']);
    assert.deepEqual(Object.keys(sortie.prevuCale.lignes[0].jours[0]), ['date', 'simule', 'prevu', 'p10', 'p90']);
    const per = (await T.lireClasseur(new Uint8Array(fs.readFileSync(f('periode.xlsx'))))).find(x => x.nom === 'Période').lignes;
    assert.deepEqual(per[0].slice(-4), ['Simulé de la ligne (ETP)', 'Prévu calé (ETP)', 'P10 (ETP)', 'P90 (ETP)']);
    assert.ok(per.every(l => l.length <= per[0].length));
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
