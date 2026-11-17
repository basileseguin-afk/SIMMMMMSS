/* Correction 21 (a) — les files d'une même zone ne se superposent plus.
 * Dans une zone qui réunit plusieurs services (la préparation et le montage,
 * ou deux services qui partagent une zone), les chariots qui attendent se
 * rangent à la suite, service après service — comme dans la zone choisie pour
 * le chargement : aucun chariot n'en recouvre un autre. Le compte des chariots
 * dessinés ne change pas ; une zone à un seul service ne bouge pas.
 * Les valeurs « d'avant » (comptes, empreintes des places) ont été relevées
 * sur le commit d'avant la correction 21 (85c1c6a), avec la même unité et les
 * mêmes vols fictifs. Sans navigateur. Aucune donnée de l'unité. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const D = require('../direct-scene.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = x => (typeof x === 'string' ? JSON.parse(x) : x), empreinte = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const SAUVE = F.sauvegardeFictive(), VOLS = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const ARGS = J.argumentsDeLaJournee(SAUVE, VOLS), R = P.simuler(ARGS), K = I.journee(R, ARGS), ETAT = lire(SAUVE.contenu['ory-ateliers-v1']);
const PLAN = SAUVE.contenu['orly-plan-v3'].zones, PARENTS = S.parentsDuPlan(PLAN, Object.fromEntries(PLAN.filter(z => z.kind === 'service').map(z => [z.id, z])));
function sceneDe(plus = {}) {
  const site = S.generer({ ateliers: ETAT.ateliers, parcours: ETAT.parcours, regime: ARGS.regime, parents: PARENTS, ...plus });
  const personnes = new Map(R.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, ETAT.ateliers, id => personnes.get(id)), places = E.placesDesVols(R);
  return { site, ilots, places, aire: D.aireDe(site, places.nombre) };
}
const JOURNEE = { r: R, k: K }, SCENE = sceneDe();
const BORNES = (() => { const ts = R.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite); return { de: Math.floor(Math.min(...ts) / 15) * 15 - 30, a: Math.ceil(Math.max(...ts) / 15) * 15 + 60 }; })();
const HEURES = (() => { const l = []; for (let t = BORNES.de; t <= BORNES.a; t += 7.5) l.push(t); return l; })();
const zone = (site, id) => site.zones.find(z => z.id === id);
const dans = (p, z, jeu = 1e-6) => p.x >= z.x - jeu && p.x <= z.x + z.w + jeu && p.y >= z.y - jeu && p.y <= z.y + z.h + jeu;
const arr = x => Math.round(x * 1e6) / 1e6;
/** L'emprise d'un chariot : 0,6 m sur 0,48 (direct-dessin.js), autour de sa place. Deux emprises se recouvrent-elles ? */
const CHARIOT = { w: 0.6, d: 0.48 };
const seRecouvrent = (a, b) => Math.abs(a.x - b.x) < CHARIOT.w - 1e-6 && Math.abs(a.y - b.y) < CHARIOT.d - 1e-6;
const sansRecouvrement = (l, mot) => { for (let i = 0; i < l.length; i++) for (let k = i + 1; k < l.length; k++) assert.ok(!seRecouvrent(l[i], l[k]), mot + ' : deux chariots se recouvrent (' + l[i].service + ' et ' + l[k].service + ', ' + l[i].x.toFixed(2) + ' ; ' + l[i].y.toFixed(2) + ')'); };
/** Les chariots qui attendent, arrivés (un lot qui vient de finir roule encore deux minutes). */
const enFile = c => c.chariots.filter(x => x.etat === 'file' && !x.enChemin);
/** Des séjours de plus, à la main : `n` lots qui attendent `service` autour de `t0` (des commandes de la journée fictive). */
const sejours = (service, t0, n, de = 'magasin') => R.classes.slice(0, n).map((k, i) => ({ de, vers: service, classe: k.id, entree: t0 - 20 - i, sortie: t0 + 30.5 + i, duree: 50.5 + 2 * i, repas: 150 }));
const journeeAvec = plus => ({ r: { ...R, stocks: { ...R.stocks, sejours: [...R.stocks.sejours, ...plus] } }, k: K });

/** Ce que rendait le commit d'avant la correction 21, sur la journée fictive, toutes les 7,5 min. */
const AVANT = {
  bornes: { de: -270, a: 1440 }, chariots: 11781, enFile: 10566, deuxFiles: 12,
  identites: 'd8ef40525f23ca97d973f0d1fa132ff4ee56cc9615356a00a7ecded425a40ea9',
  horsProduction: '415a3c8c24a3286eb0c23a3fa575df027a00e7943c333a3bb1bad7ed3b8ffd46',
  productionUneFile: '616bbb16a6d63d92a390bca8ad287e58c26b95a88f96fbe5dd44f6eca3961bb4'
};

test('la préparation et le montage, des lots en attente devant chacun : à la suite, aucune emprise ne se recouvre', () => {
  const food = zone(SCENE.site, 'food');
  assert.deepEqual(food.services.slice(0, 2), ['preparation', 'prepa']);
  let instants = 0;
  for (const t of HEURES) {
    const c = D.circulation(SCENE, JOURNEE, t), file = enFile(c).filter(x => food.services.includes(x.service));
    // (Un lot qui vient de finir roule encore deux minutes vers la file : il compte déjà dans celle de son service.)
    const services = [...new Set(c.chariots.filter(x => x.etat === 'file' && food.services.includes(x.service)).map(x => x.service))];
    for (const x of file) assert.ok(dans(x, food), 'à ' + P.hhmm(t) + ' : dans la zone de production');
    if (services.length < 2) continue;
    instants++;
    sansRecouvrement(file, 'à ' + P.hhmm(t));
    if (new Set(file.map(x => x.service)).size < 2) continue;
    // Service après service, dans l'ordre de la zone : la préparation, puis le montage — aucun chariot du montage avant le dernier de la préparation.
    const debut = Math.min(...file.map(x => x.x)), colonne = x => Math.round((x.x - debut) * 1000);
    const prep = file.filter(x => x.service === 'preparation'), montage = file.filter(x => x.service === 'prepa');
    assert.ok(Math.max(...prep.map(colonne)) <= Math.min(...montage.map(colonne)), 'à ' + P.hhmm(t) + ' : la préparation d’abord, le montage à la suite');
  }
  assert.equal(instants, AVANT.deuxFiles, 'les instants où les deux services ont une file');
});

test('le compte des chariots dessinés est celui d’avant ; ce sont les mêmes chariots, dans le même ordre', () => {
  assert.deepEqual(BORNES, AVANT.bornes);
  let total = 0, file = 0; const identites = [];
  for (const t of HEURES) {
    const c = D.circulation(SCENE, JOURNEE, t);
    total += c.chariots.length; file += enFile(c).length;
    identites.push(c.chariots.map(x => [x.etat, x.service, x.ton, x.classe ?? null, x.vol ?? null]));
    // Les chariots en file devant un service sont exactement ses lots en stock.
    for (const [service, lots] of Object.entries(E.filesA(R, t))) assert.equal(c.chariots.filter(x => x.etat === 'file' && x.service === service && x.ton !== 'sale').length, lots.reduce((n, l) => n + l.chariots, 0), 'à ' + P.hhmm(t) + ', ' + service);
  }
  assert.equal(total, AVANT.chariots, 'tous les chariots de la journée');
  assert.equal(file, AVANT.enFile, 'les chariots en file');
  assert.equal(empreinte(identites), AVANT.identites, 'les mêmes chariots, dans le même ordre');
});

test('une zone à un seul service ne bouge pas ; la production non plus quand un seul de ses services a une file', () => {
  const food = zone(SCENE.site, 'food'), horsProduction = [], productionUneFile = [];
  for (const t of HEURES) {
    const c = D.circulation(SCENE, JOURNEE, t);
    horsProduction.push(c.chariots.filter(x => !food.services.includes(x.service)).map(x => [x.etat, x.service, arr(x.x), arr(x.y)]));
    const services = new Set(c.chariots.filter(x => x.etat === 'file' && food.services.includes(x.service)).map(x => x.service));
    if (services.size <= 1) productionUneFile.push(c.chariots.filter(x => food.services.includes(x.service)).map(x => [x.etat, x.service, arr(x.x), arr(x.y)]));
  }
  assert.equal(empreinte(horsProduction), AVANT.horsProduction, 'les chariots des autres zones : à la même place, au millionième de mètre');
  assert.equal(empreinte(productionUneFile), AVANT.productionUneFile, 'la production, une seule file : à la même place');
});

test('deux services qui partagent une zone, des lots devant chacun : à la suite, sans recouvrement, autant de chariots', () => {
  const t0 = 600, plus = [...sejours('cuisine', t0, 3), ...sejours('dotation', t0, 3, 'armement')], journee = journeeAvec(plus);
  const PARTAGE = sceneDe({ partages: { dotation: 'cuisine' } }), cuisine = zone(PARTAGE.site, 'cuisine');
  assert.deepEqual(cuisine.services, ['cuisine', 'dotation']);
  const seuls = D.circulation(SCENE, journee, t0), ensemble = D.circulation(PARTAGE, journee, t0);
  const file = enFile(ensemble).filter(x => cuisine.services.includes(x.service));
  assert.ok(file.filter(x => x.service === 'cuisine').length >= 6 && file.filter(x => x.service === 'dotation').length >= 6, 'des lots devant chacun des deux services');
  for (const x of file) assert.ok(dans(x, cuisine), 'tous dans la zone partagée');
  sansRecouvrement(file, 'la zone partagée');
  // Le service de la zone d'abord, celui qui la partage à la suite.
  const debut = Math.min(...file.map(x => x.x)), colonne = x => Math.round((x.x - debut) * 1000);
  assert.ok(Math.max(...file.filter(x => x.service === 'cuisine').map(colonne)) <= Math.min(...file.filter(x => x.service === 'dotation').map(colonne)), 'service après service');
  // Autant de chariots que si chacun avait sa zone ; les mêmes, dans le même ordre.
  assert.equal(ensemble.chariots.length, seuls.chariots.length);
  const identite = c => c.chariots.map(x => [x.etat, x.service, x.ton, x.classe ?? null, x.vol ?? null]);
  assert.deepEqual(identite(ensemble), identite(seuls));
  // Chacun dans sa zone, sans partage : les deux files sont celles d'une zone à un seul service.
  sansRecouvrement(enFile(seuls).filter(x => x.service === 'cuisine'), 'la cuisine seule');
});

test('la plonge partagée avec un autre service : les retours sales à la suite de ce qui attend ce service', () => {
  // Une heure où des retours sales attendent devant la plonge.
  const t0 = HEURES.find(t => E.lavagesA(R, t).filter(x => x.etat === 'file').length >= 2);
  assert.ok(Number.isFinite(t0), 'des retours sales attendent dans la journée fictive');
  const journee = journeeAvec(sejours('dotation', t0, 3, 'armement')), PARTAGE = sceneDe({ partages: { dotation: 'plonge' } }), plonge = zone(PARTAGE.site, 'plonge');
  assert.deepEqual(plonge.services, ['plonge', 'dotation']);
  const seuls = D.circulation(SCENE, journee, t0), ensemble = D.circulation(PARTAGE, journee, t0);
  const file = enFile(ensemble).filter(x => dans(x, plonge)), sales = file.filter(x => x.ton === 'sale'), propres = file.filter(x => x.service === 'dotation');
  assert.ok(sales.length >= 2 && propres.length >= 6, 'des retours sales et des lots de la dotation (' + sales.length + ' et ' + propres.length + ')');
  sansRecouvrement(file, 'la plonge partagée');
  const debut = Math.min(...file.map(x => x.x)), colonne = x => Math.round((x.x - debut) * 1000);
  assert.ok(Math.max(...propres.map(colonne)) <= Math.min(...sales.map(colonne)), 'ce qui attend le service d’abord, les retours sales à la suite');
  assert.equal(ensemble.chariots.length, seuls.chariots.length, 'autant de chariots');
  // Sans partage, la plonge seule : ses retours sales à la place d'avant.
  const avant = D.circulation(SCENE, JOURNEE, t0), salesDe = c => c.chariots.filter(x => x.ton === 'sale').map(x => [x.etat, arr(x.x), arr(x.y)]);
  assert.deepEqual(salesDe(seuls), salesDe(avant), 'la plonge seule ne bouge pas');
});

test('au quai : une commande sans handling qui attend son vol se range à la suite de ce que le handling va charger', () => {
  // Une heure où la file du quai est courte (une file longue se resserre : ses chariots se touchent, c'est voulu).
  const t0 = HEURES.find(t => { const n = (E.filesA(R, t).quais || []).reduce((k, l) => k + l.chariots, 0); return n >= 2 && n <= 8 && (E.filesA(R, t).quais || []).every(l => l.arrive >= 1); });
  assert.ok(Number.isFinite(t0), 'une file courte au quai dans la journée fictive');
  const sans = R.classes.slice(0, 2).map((k, i) => ({ de: 'armement', vers: 'chargement', classe: k.id, entree: t0 - 12 - i, sortie: t0 + 44.5 + i, duree: 56.5 + 2 * i, repas: 150 }));
  const c = D.circulation(SCENE, journeeAvec(sans), t0), quai = zone(SCENE.site, 'quais'), file = enFile(c).filter(x => x.service === 'quais' || x.service === 'chargement');
  const duHandling = file.filter(x => x.service === 'quais'), sansHandling = file.filter(x => x.service === 'chargement');
  assert.ok(duHandling.length >= 2 && sansHandling.length >= 6, duHandling.length + ' et ' + sansHandling.length + ' chariots');
  for (const x of file) assert.ok(dans(x, quai), 'au quai');
  sansRecouvrement(file, 'le quai');
  const debut = Math.min(...file.map(x => x.x)), colonne = x => Math.round((x.x - debut) * 1000);
  assert.ok(Math.max(...duHandling.map(colonne)) <= Math.min(...sansHandling.map(colonne)), 'ce que le handling va charger d’abord');
  assert.equal(c.chariots.length, D.circulation(SCENE, JOURNEE, t0).chariots.length + sansHandling.length);
});
