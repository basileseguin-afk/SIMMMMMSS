/* Évolution 16 (g) — la non-régression de l'évolution 16 (la vue en direct) :
 * la vue lit la journée, elle ne calcule rien. Les résultats d'une journée et
 * d'une période, leurs indicateurs, leurs réponses et leurs classeurs restent
 * ceux d'avant, champ par champ. Les empreintes attendues ont été calculées par
 * tests/empreintes-resultats.cjs sur le commit d'avant l'évolution 16 (7c14e87,
 * « correction 19, retouche »), avec les mêmes unités fictives, les mêmes vols
 * fictifs et la même date de calcul :
 *   — le JSON des outils d'une journée et d'une période, et chaque feuille de
 *     leurs classeurs (la feuille « Réponses » comprise) ;
 *   — sur la journée fictive du plan rejoué (des goulots, des vols chargés en
 *     retard) et sur la même sans retard : le résultat du moteur, les
 *     indicateurs de charge, et les réponses du module à deux jeux de seuils
 *     (la partie e a remanié moteur/reponses.js sans en changer une réponse).
 * Depuis l'évolution 19 (a), les classeurs écrivent les nouveaux mots (« temps
 * par vol », « cellule », « mise à disposition ») : quatre phrases, aucun
 * chiffre ; chaque feuille est comparée à son empreinte d'avant avec ses mots
 * d'avant remis (`avecLesMotsDAvant`) ; tests/vocabulaire.test.cjs vérifie
 * les nouveaux mots.
 * Aucune donnée de l'unité : tout est fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { empreintes, empreintesDuDirect, avecLesMotsDAvant } = require('./empreintes-resultats.cjs');

const AVANT = {
  journee: '6c61da23e4dcd9ffdf36116c10fe531360240c3d5bc6087a93caf10ef04ae67f',
  classeurJournee: {
    'Lisez-moi': '6f03382e7e39ffe8a299d74e40d8a0e1e20edbff98bd7e4d2d589fab2ebb8ba7',
    Charge: '7caf2c55dcbd309e724fcb90b36479f3e053de995f660074e0091cfcfcda751d',
    'Créneaux': 'ea8d9c7602483c625e04c113da45b807e7a638c72ae0d6b42abdfdbe3815fcaa',
    'Réponses': 'a3d3c10e330124bb66e350f0ebae73db7422f19b47abec67d26794f6942a4339'
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
  },
  direct: {
    retards: {
      resultat: 'b1aea444ef207a9d00c974b9f440328e802f3a6e76e75beecade446a58286d43',
      indicateurs: '43c0903e3e930321266511e3c37accaffddcbf18574a07651d777f87a916aa3a',
      reponses: '71487bbaf5fb19eba83aee020ea7a5df03ca542679e644c070ba50bcc1c8d708',
      reponsesAutresSeuils: '00ac6e91868428880ee20aebaccc576f3d9b0b9472cf611c2e45eedc45e105c3'
    },
    sansRetard: {
      resultat: 'f1bdb0fbb6113746653f04a7f73062bc96aac503a0d0dd89800f0c1c22605f45',
      indicateurs: 'b211b3810c6180e1b0dc7638662c96ed22288f98d7e3bc2f986e4d72209e67ba',
      reponses: 'b67afda63604fcd1bca614519487160cd944c6b825fae930c37c2092720c98d8',
      reponsesAutresSeuils: 'fe9b34c79ffd72f60caa3be5e5762147f262ded208c51c75a91389cf553846aa'
    }
  }
};
const RACINE = path.join(__dirname, '..');

test('le JSON des outils d’une journée et d’une période, et leurs classeurs feuille par feuille : ceux d’avant l’évolution 16', async () => {
  const e = await empreintes(RACINE, avecLesMotsDAvant);
  assert.equal(e.journee, AVANT.journee, 'simuler-journee');
  assert.equal(e.periode, AVANT.periode, 'simuler-periode');
  // Les mêmes feuilles, dans le même ordre, chacune identique — la feuille « Réponses » comprise.
  assert.deepEqual(Object.keys(e.classeurJournee), Object.keys(AVANT.classeurJournee));
  assert.deepEqual(e.classeurJournee, AVANT.classeurJournee);
  assert.deepEqual(Object.keys(e.classeurPeriode), Object.keys(AVANT.classeurPeriode));
  assert.deepEqual(e.classeurPeriode, AVANT.classeurPeriode);
});

test('la journée fictive que la vue en direct rejoue : son résultat, ses indicateurs et ses réponses, ceux d’avant l’évolution 16', () => {
  const e = empreintesDuDirect(RACINE);
  assert.deepEqual(Object.keys(e), ['retards', 'sansRetard']);
  for (const nom of Object.keys(AVANT.direct)) {
    for (const quoi of ['resultat', 'indicateurs', 'reponses', 'reponsesAutresSeuils']) {
      assert.equal(e[nom][quoi], AVANT.direct[nom][quoi], nom + ' : ' + quoi);
    }
  }
});

test('lire la journée pour la vue en direct ne la change pas : la même empreinte avant et après', () => {
  const crypto = require('node:crypto'), F = require('./plan-rejoue-fictif.cjs');
  const L = require('../direct-lire.js'), E = require('../direct-etat.js'), D = require('../direct-scene.js'), Q = require('../direct-questions.js');
  const S = require('../moteur/site.js'), R = require('../moteur/reponses.js');
  const empreinte = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const sauvegarde = F.sauvegardeFictive(), p = F.heureDuPicAttendue(sauvegarde, F.volsCsv()), r = p.resultat, args = p.args, k = p.k;
  const journee = { r, args, k, reponses: R.reponses(r, args, { k }) };
  const de = () => ({ resultat: empreinte(r), indicateurs: empreinte(k), reponses: empreinte(journee.reponses), args: empreinte(args) });
  const avant = de();
  assert.equal(avant.resultat, AVANT.direct.retards.resultat);
  assert.equal(avant.indicateurs, AVANT.direct.retards.indicateurs);
  assert.equal(avant.reponses, AVANT.direct.retards.reponses);

  // Tout ce que la vue lit, toutes les demi-heures de la journée : la lecture, la barre du temps, les personnes, ce qui
  // circule, les cinq réponses, le détail de chaque service, le suivi de chaque vol.
  const etat = typeof sauvegarde.contenu['ory-ateliers-v1'] === 'string' ? JSON.parse(sauvegarde.contenu['ory-ateliers-v1']) : sauvegarde.contenu['ory-ateliers-v1'];
  const site = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, regime: args.regime });
  const personnes = new Map(r.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, etat.ateliers, id => personnes.get(id));
  const places = E.placesDesVols(r), scene = { site, ilots, aire: D.aireDe(site, places.nombre), places };
  const heures = r.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite), bornes = { de: Math.floor(Math.min(...heures) / 30) * 30, a: Math.max(1440, Math.ceil(Math.max(...heures) / 30) * 30) };
  const lu = L.lire(journee, bornes), services = site.zones.flatMap(z => z.services), noms = Object.fromEntries(services.map(id => [id, 'Service ' + id]));
  let vus = 0;
  L.frise(journee, lu, bornes.de, bornes.a);
  for (let t = bornes.de; t <= bornes.a; t += 30) {
    const tons = L.tonsA(lu, journee, t), c = D.circulation(scene, journee, t);
    vus += c.chariots.length + c.vehicules.length + c.avions.length;
    Q.rendu({ site, noms, etat: E.etatA(journee, t), tons, selection: null, t, lu, reponses: journee.reponses, essais: null, montre: null });
    for (const id of services) L.detail(lu, journee, id, t);
    L.goulotsA(lu, t);L.pointSuivant(lu, t);
  }
  for (const v of E.volsDe(r)) L.suivi(journee, v.id);
  assert.ok(lu.goulots.length >= 3 && vus > 1000, 'une journée qui coince et où il circule quelque chose (' + vus + ')');
  assert.deepEqual(de(), avant);
});
