/* Évolution 15 (e) — la non-régression de l'évolution 15 : sans les seuils ni
 * la feuille « Réponses », les résultats d'une journée et d'une période, leurs
 * indicateurs et leurs classeurs restent ceux d'avant, champ par champ. Les
 * empreintes attendues ont été calculées par tests/empreintes-resultats.cjs sur
 * le commit d'avant l'évolution 15 (977109b, « Évolution 14 (e) »), avec la
 * même unité fictive, les mêmes vols fictifs et la même date de calcul. Le
 * classeur de la journée gagne la feuille « Réponses », à la fin, et rien
 * d'autre. Aucune donnée de l'unité : tout est fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { empreintes } = require('./empreintes-resultats.cjs');

const AVANT = {
  journee: '6c61da23e4dcd9ffdf36116c10fe531360240c3d5bc6087a93caf10ef04ae67f',
  classeurJournee: {
    'Lisez-moi': '6f03382e7e39ffe8a299d74e40d8a0e1e20edbff98bd7e4d2d589fab2ebb8ba7',
    Charge: '7caf2c55dcbd309e724fcb90b36479f3e053de995f660074e0091cfcfcda751d',
    'Créneaux': 'ea8d9c7602483c625e04c113da45b807e7a638c72ae0d6b42abdfdbe3815fcaa'
  },
  periode: '9d22b3d487aa0c7f73fac603f62b8bab05b014bd685f0e00f931865efb02f4d6',
  classeurPeriode: {
    'Lisez-moi': 'acf77cef2d4c300018c68a044558e9fcd1012132cd9c4749cb42a9aaa9d74e31',
    'Période': 'fc2cc9ca01c16270ba34d9b8b93339a2a49ebf8f5ed8824bb0b57925b82dabe4',
    'Équipes': '37548a54d1fceab1d56dd74db8e95e525cfe699e1ea3d43ab7bcf2c6fd3aaf96',
    Charge: '434c26ab65babd3a9c917484a9d0cfe6b8600705c35a17dd1bbe31bdd2374165',
    'Créneaux': '8ec0b73cd94f97dc19a24066cb624b817d404c0d65d59925a2f63d74f48229f8',
    Compagnies: 'c6c76351f8471061ab65c997bdfaa8d416254c877016f7e087fa2365f88ced43',
    Lots: 'a4bbb471b60467f4aa90341f6a26ed4be62fc36888fbdead9837bee044ef7471',
    Vols: 'ee3ca5afa4e2e32863a3756f782c1387972816789bca02b0893fe5c0737581d3',
    Plonge: '0eb76496f2d22360d4f6bdb9e753b93abe774e25fb654a27037f71f471e3d124',
    Jours: 'ec3dea54787dea420ba86bc076e6d0fde643466ed505371a94f34c2895381716'
  }
};

test('le JSON des outils d’une journée et d’une période : celui d’avant l’évolution 15', async () => {
  const e = await empreintes(path.join(__dirname, '..'));
  assert.equal(e.journee, AVANT.journee, 'simuler-journee (sans --reponses)');
  assert.equal(e.periode, AVANT.periode, 'simuler-periode');
  // Le classeur de la période : les mêmes feuilles, dans le même ordre, chacune identique.
  assert.deepEqual(Object.keys(e.classeurPeriode), Object.keys(AVANT.classeurPeriode));
  assert.deepEqual(e.classeurPeriode, AVANT.classeurPeriode);
  // Le classeur de la journée : les feuilles d'avant, identiques, et la feuille « Réponses » à la fin.
  assert.deepEqual(Object.keys(e.classeurJournee), [...Object.keys(AVANT.classeurJournee), 'Réponses']);
  const { 'Réponses': reponses, ...autres } = e.classeurJournee;
  assert.deepEqual(autres, AVANT.classeurJournee);
  assert.match(reponses, /^[0-9a-f]{64}$/);
});
