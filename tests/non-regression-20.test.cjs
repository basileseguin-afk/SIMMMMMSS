/* Évolution 20 (e) — la non-régression de l'évolution 20 (la disposition du
 * site, dans la vue en direct) : ses quatre réglages — qui partage la zone de
 * qui, la disposition des zones, où attend ce qui est prêt, des rayonnages
 * dans une zone — ne sont lus que par le dessin. Aucun calcul ne change :
 *   — le JSON des outils d'une journée et d'une période, et chaque feuille de
 *     leurs classeurs (la feuille « Réponses » comprise), sont les mêmes avec
 *     et sans ces réglages — et tests/non-regression-16.test.cjs garde ceux
 *     d'avant ;
 *   — sur la journée fictive du plan rejoué (des goulots, des vols chargés en
 *     retard) : le résultat du moteur, les indicateurs de charge et les
 *     réponses, les mêmes avec et sans ;
 *   — une sauvegarde d'avant se relit : elle ne gagne aucun de ces réglages,
 *     et donne le site d'aujourd'hui (tests/site-avant-20.attendu.json) ;
 *   — les réglages jouent bien : avec eux, le site est un autre site.
 * Aucune donnée de l'unité : tout est fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { empreintes, SAUVEGARDE } = require('./empreintes-resultats.cjs');
const F = require('./plan-rejoue-fictif.cjs');
const A = require('../ateliers.js');
const S = require('../moteur/site.js');
const R = require('../moteur/reponses.js');
const J = require('../moteur/journee.js');
const { reglagesDe, reference } = require('./site-unites.cjs');

const RACINE = path.join(__dirname, '..');
const empreinte = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
/** Les quatre réglages de l'évolution 20, sur les services de l'unité fictive. */
const REGLAGES = {
  partages: { dotation: 'cuisine' },
  disposition: { colonnes: [['magasin', 'decontam'], ['cuisine'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] },
  attentes: { quais: 'cuisine' },
  rayonnages: { cuisine: true, armement: true }
};
const CLES = Object.keys(REGLAGES);
/** Une sauvegarde, ses équipes réglées par `f` (une copie : l'originale n'est pas touchée). */
function avec(sauvegarde, f) {
  const s = JSON.parse(JSON.stringify(sauvegarde)), brut = s.contenu['ory-ateliers-v1'], e = typeof brut === 'string' ? JSON.parse(brut) : brut;
  f(e);
  s.contenu['ory-ateliers-v1'] = typeof brut === 'string' ? JSON.stringify(e) : e;
  return s;
}
const reglee = s => avec(s, e => Object.assign(e, REGLAGES));
const etatDe = s => { const x = s.contenu['ory-ateliers-v1']; return typeof x === 'string' ? JSON.parse(x) : x; };

test('les outils d’une journée et d’une période, et leurs classeurs feuille par feuille : les mêmes avec les réglages de l’évolution 20', async () => {
  const sans = await empreintes(RACINE), avecEux = await empreintes(RACINE, l => l, reglee(SAUVEGARDE));
  assert.equal(avecEux.journee, sans.journee, 'simuler-journee');
  assert.equal(avecEux.periode, sans.periode, 'simuler-periode');
  assert.deepEqual(Object.keys(avecEux.classeurJournee), Object.keys(sans.classeurJournee));
  assert.deepEqual(avecEux.classeurJournee, sans.classeurJournee, 'le classeur de la journée, feuille par feuille');
  assert.deepEqual(Object.keys(avecEux.classeurPeriode), Object.keys(sans.classeurPeriode));
  assert.deepEqual(avecEux.classeurPeriode, sans.classeurPeriode, 'le classeur de la période, feuille par feuille');
  assert.ok(Object.keys(sans.classeurJournee).includes('Réponses') && Object.keys(sans.classeurPeriode).length >= 8, 'des classeurs entiers comparés');
});

test('la journée fictive que la vue en direct rejoue : le même résultat, les mêmes indicateurs, les mêmes réponses', () => {
  for (const csv of [F.volsCsv(), F.volsSansRetardCsv()]) {
    const sans = F.heureDuPicAttendue(F.sauvegardeFictive(), csv), avecEux = F.heureDuPicAttendue(reglee(F.sauvegardeFictive()), csv);
    assert.equal(empreinte(avecEux.args), empreinte(sans.args), 'ce que le moteur lit');
    assert.equal(empreinte(avecEux.resultat), empreinte(sans.resultat), 'le résultat');
    assert.equal(empreinte(avecEux.k), empreinte(sans.k), 'les indicateurs');
    assert.equal(empreinte(R.reponses(avecEux.resultat, avecEux.args, { k: avecEux.k })), empreinte(R.reponses(sans.resultat, sans.args, { k: sans.k })), 'les réponses');
    assert.ok(JSON.stringify(sans.resultat).length > 10000, 'une journée entière comparée');
  }
});

test('une sauvegarde d’avant se relit : aucun de ces réglages, et le site d’aujourd’hui', () => {
  for (const sauvegarde of [SAUVEGARDE, F.sauvegardeFictive()]) {
    const brut = etatDe(sauvegarde), lu = A.valider(brut);
    for (const k of CLES) { assert.equal(k in brut, false, 'la sauvegarde fictive est d’avant : pas de « ' + k + ' »'); assert.equal(k in lu, false, 'relue : pas de « ' + k + ' »'); }
    // Relue puis réécrite, elle se relit pareil.
    assert.deepEqual(A.valider(JSON.parse(JSON.stringify(lu))), lu);
  }
  // Le site que rendait le commit d'avant l'évolution 20, champ par champ, pour les unités de la référence.
  const attendu = JSON.parse(fs.readFileSync(path.join(__dirname, 'site-avant-20.attendu.json'), 'utf8')), r = reference(S);
  assert.deepEqual(r.sites, attendu.sites);
  assert.deepEqual(r.empreintes, attendu.empreintes);
});

test('les réglages jouent : gardés par la sauvegarde, ils donnent un autre site — et rien d’autre', () => {
  const sauvegarde = reglee(F.sauvegardeFictive()), lu = A.valider(etatDe(sauvegarde)), avant = A.valider(etatDe(F.sauvegardeFictive()));
  for (const k of CLES) assert.deepEqual(lu[k], REGLAGES[k], k);
  // Tout le reste de l'état des équipes est le même.
  const reste = e => Object.fromEntries(Object.entries(e).filter(([k]) => !CLES.includes(k)));
  assert.deepEqual(reste(lu), reste(avant));
  // Ce que le calcul lit de la sauvegarde ne change pas.
  const UI = require('../ui-model.js'), vols = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
  assert.equal(empreinte(J.argumentsDeLaJournee(sauvegarde, vols)), empreinte(J.argumentsDeLaJournee(F.sauvegardeFictive(), vols)));
  // Le site, lui, suit les réglages : une zone de moins (partagée), des allées, la zone d'attente, des rayonnages au fond.
  // (Les annexes rattachées viennent du plan, comme dans la page : l'annexe du montage est dans la zone de production.)
  const plan = sauvegarde.contenu['orly-plan-v3'].zones, parents = S.parentsDuPlan(plan, Object.fromEntries(plan.filter(z => z.kind === 'service').map(z => [z.id, z])));
  const site = S.generer(reglagesDe(sauvegarde, { ...REGLAGES, parents })), sans = S.generer(reglagesDe(F.sauvegardeFictive(), { parents }));
  assert.equal(site.zones.length, sans.zones.length - 1);
  assert.ok(site.allees.length > 0 && !('allees' in sans));
  assert.deepEqual(site.attentes, { quais: 'cuisine' });
  assert.deepEqual(site.zones.filter(z => z.rayonnagesAuFond).map(z => z.id).sort(), ['armement', 'cuisine']);
  assert.deepEqual(site.zones.find(z => z.id === 'cuisine').services, ['cuisine', 'dotation']);
  assert.equal('notes' in site, false, 'rien à signaler');
});
