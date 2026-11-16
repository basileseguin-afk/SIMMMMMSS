/* Évolution 20 (c) — ce qui attend son vol se rassemble là où l'utilisateur le
 * dit. Les lots finis qui attendent le chargement étaient dessinés dans la
 * zone du quai ; un réglage de l'équipe de handling, « Ce qui attend le
 * chargement se range dans la zone de », les fait dessiner dans la zone
 * choisie : ils en partent au moment du chargement. Le quai ne montre plus que
 * les camions et les chauffeurs. Aucune autre aire de stockage : un lot qui
 * attend un service attend dans la zone de ce service, comme avant.
 * Sans navigateur. Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../direct-scene.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const A = require('../ateliers.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = x => (typeof x === 'string' ? JSON.parse(x) : x);
const SAUVE = F.sauvegardeFictive(), VOLS = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const ARGS = J.argumentsDeLaJournee(SAUVE, VOLS), R = P.simuler(ARGS), K = I.journee(R, ARGS), ETAT = lire(SAUVE.contenu['ory-ateliers-v1']);
const PLAN = SAUVE.contenu['orly-plan-v3'].zones, PARENTS = S.parentsDuPlan(PLAN, Object.fromEntries(PLAN.filter(z => z.kind === 'service').map(z => [z.id, z])));
const HANDLING = ETAT.ateliers.find(a => a.type === 'handling');   // l'équipe « h », du service « quais »
const siteDe = (plus = {}) => S.generer({ ateliers: ETAT.ateliers, parcours: ETAT.parcours, regime: ARGS.regime, parents: PARENTS, ...plus });
function sceneDe(plus) {
  const site = siteDe(plus), personnes = new Map(R.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, ETAT.ateliers, id => personnes.get(id));
  const places = E.placesDesVols(R);
  return { site, ilots, places, aire: D.aireDe(site, places.nombre) };
}
const JOURNEE = { r: R, k: K }, AVANT = sceneDe(), AVEC = sceneDe({ attentes: { quais: 'cuisine' } });
const BORNES = (() => { const ts = R.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite); return { de: Math.floor(Math.min(...ts) / 15) * 15 - 30, a: Math.ceil(Math.max(...ts) / 15) * 15 + 60 }; })();
const HEURES = (() => { const l = []; for (let t = BORNES.de; t <= BORNES.a; t += 15) l.push(t, t + 1, t + 7.5); return l; })();
const dans = (p, z, jeu = 1e-6) => p.x >= z.x - jeu && p.x <= z.x + z.w + jeu && p.y >= z.y - jeu && p.y <= z.y + z.h + jeu;
const zone = (site, id) => site.zones.find(z => z.id === id);
/** Ce qui attend le chargement : les chariots en file devant le handling, arrivés (un lot qui vient de finir roule encore deux minutes). */
const aCharger = c => c.chariots.filter(x => x.service === HANDLING.service && x.etat === 'file' && !x.enChemin);

test('le site dit où se range ce qui attend le chargement : la zone du service choisi ; par défaut, rien — le quai', () => {
  assert.equal(HANDLING.service, 'quais');
  // Sans réglage : pas de champ — le site d'aujourd'hui.
  assert.equal('attentes' in siteDe(), false);
  assert.deepEqual(siteDe({ attentes: {} }), siteDe());
  // Avec : la zone du service choisi, pour le service de l'équipe de handling ; le reste du site ne change pas.
  const avec = siteDe({ attentes: { quais: 'cuisine' } });
  assert.deepEqual(avec.attentes, { quais: 'cuisine' });
  assert.deepEqual({ ...avec, attentes: undefined }, { ...siteDe(), attentes: undefined });
  // Le quai lui-même, un service sans équipe ou qui n'existe pas, une valeur illisible : le défaut, sans rien dire.
  for (const s of ['quais', 'appros', 'disparu', '', 7, null, ['cuisine'], { id: 'cuisine' }]) assert.equal('attentes' in siteDe({ attentes: { quais: s } }), false, String(s));
  // Le réglage d'un service qui n'a pas d'équipe de handling ne compte pas.
  assert.equal('attentes' in siteDe({ attentes: { cuisine: 'dotation', inconnu: 'cuisine', h: 'cuisine' } }), false);
  // La production se désigne par un de ses services, ou par sa zone.
  assert.deepEqual([siteDe({ attentes: { quais: 'prepa' } }).attentes, siteDe({ attentes: { quais: 'food' } }).attentes], [{ quais: 'food' }, { quais: 'food' }]);
  // Un service qui partage la zone d'un autre (évolution 20 a) : c'est cette zone.
  assert.deepEqual(siteDe({ attentes: { quais: 'dotation' }, partages: { dotation: 'cuisine' } }).attentes, { quais: 'cuisine' });
  // Le quai qui partage la zone choisie : c'est sa zone — le défaut.
  assert.equal('attentes' in siteDe({ attentes: { quais: 'armement' }, partages: { quais: 'armement' } }), false);
  // Dans un site disposé (évolution 20 b) aussi.
  const dispose = siteDe({ attentes: { quais: 'cuisine' }, disposition: { colonnes: [['magasin', 'decontam'], ['cuisine', 'dotation'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] } });
  assert.deepEqual([dispose.attentes, 'allees' in dispose], [{ quais: 'cuisine' }, true]);
  // Deux équipes de handling dans deux services : chacun son réglage.
  const deux = S.generer({ ateliers: [...ETAT.ateliers, { ...HANDLING, id: 'h-bis', service: 'dotation' }], parcours: ETAT.parcours, regime: ARGS.regime, parents: PARENTS, attentes: { quais: 'cuisine', dotation: 'armement' } });
  assert.deepEqual(deux.attentes, { quais: 'cuisine', dotation: 'armement' });
  // Des noms de clés d'objet, des valeurs bizarres : rien ne casse.
  for (const etrange of [JSON.parse('{"__proto__":"cuisine","constructor":"cuisine","toString":"cuisine"}'), 'cuisine', ['cuisine'], 12, null]) assert.equal('attentes' in siteDe({ attentes: etrange }), false);
});

test('avec le réglage, ce qui attend le chargement est dans la zone choisie, et non sur le quai ; sans lui, comme aujourd’hui', () => {
  const quai = zone(AVEC.site, 'quais'), cuisine = zone(AVEC.site, 'cuisine');
  let vus = 0;
  for (const t of HEURES) {
    const avant = D.circulation(AVANT, JOURNEE, t), avec = D.circulation(AVEC, JOURNEE, t);
    // Sans le réglage : au quai, comme aujourd'hui.
    for (const x of aCharger(avant)) assert.ok(dans(x, zone(AVANT.site, 'quais')), 'à ' + P.hhmm(t) + ', sans réglage : au quai');
    // Avec : dans la zone choisie, pas sur le quai.
    for (const x of aCharger(avec)) { assert.ok(dans(x, cuisine) && !dans(x, quai), 'à ' + P.hhmm(t) + ', avec le réglage : dans la cuisine (' + x.x.toFixed(1) + ', ' + x.y.toFixed(1) + ')'); vus++; }
    // Le quai ne montre plus aucun chariot qui attend : seulement ce qui y roule encore, les camions, les chauffeurs.
    assert.equal(avec.chariots.filter(x => dans(x, quai) && x.etat === 'file' && !x.enChemin).length, 0, 'à ' + P.hhmm(t) + ', plus de file sur le quai');
  }
  assert.ok(vus > 20, 'des lots attendent le chargement dans la journée (' + vus + ' chariots vus)');
});

test('le compte des chariots dessinés ne change pas ; rien d’autre ne change de place', () => {
  for (const t of HEURES) {
    const avant = D.circulation(AVANT, JOURNEE, t), avec = D.circulation(AVEC, JOURNEE, t);
    assert.equal(avec.chariots.length, avant.chariots.length, 'à ' + P.hhmm(t) + ' : autant de chariots');
    assert.deepEqual(avec.chariots.map(x => [x.etat, x.service, x.ton, x.classe ?? null, x.vol ?? null]), avant.chariots.map(x => [x.etat, x.service, x.ton, x.classe ?? null, x.vol ?? null]), 'à ' + P.hhmm(t) + ' : les mêmes chariots');
    // Les véhicules, les avions, les tunnels, les lignes : les mêmes, à la même place.
    assert.deepEqual([avec.vehicules, avec.avions, avec.tunnels, avec.lignes], [avant.vehicules, avant.avions, avant.tunnels, avant.lignes], 'à ' + P.hhmm(t));
    // Les chariots des lots en cours, des retours sales et des files des autres zones : à la même place.
    const autres = c => c.chariots.filter(x => x.service !== HANDLING.service && x.service !== 'cuisine' && !x.enChemin).map(x => [x.etat, x.service, x.x, x.y]);
    assert.deepEqual(autres(avec), autres(avant), 'à ' + P.hhmm(t) + ' : les autres chariots ne bougent pas');
    // Les personnes : les mêmes, à la même place.
    assert.deepEqual(D.personnages(AVEC, JOURNEE, t), D.personnages(AVANT, JOURNEE, t), 'à ' + P.hhmm(t) + ' : les personnes');
  }
});

test('dans la zone choisie, ce qui attend le chargement se range à la suite de ce qui attend le service : aucun chariot sur un autre', () => {
  const cuisine = zone(AVEC.site, 'cuisine');
  for (const t of HEURES) {
    const c = D.circulation(AVEC, JOURNEE, t), file = c.chariots.filter(x => x.etat === 'file' && !x.enChemin && (x.service === 'cuisine' || x.service === HANDLING.service));
    const cles = file.map(x => Math.round(x.x * 1000) + ',' + Math.round(x.y * 1000));
    assert.equal(new Set(cles).size, cles.length, 'à ' + P.hhmm(t) + ' : deux chariots à la même place');
    // Tous dans la zone, aucun n'en déborde.
    for (const x of file) assert.ok(dans(x, cuisine), 'à ' + P.hhmm(t));
  }
  // Des lots attendent la cuisine elle-même pendant que d'autres attendent le chargement (quatre séjours de plus, à la
  // main) : une seule file — ceux de la cuisine d'abord, à leur rang ; ceux du chargement ensuite ; autant de chariots.
  const t0 = R.stocks.sejours.find(s => s.vers === HANDLING.service && s.sortie - s.entree > 30).entree + 5;
  const pourLaCuisine = R.classes.slice(0, 4).map((k, i) => ({ de: 'magasin', vers: 'cuisine', classe: k.id, entree: t0 - 20 - i, sortie: t0 + 33.5 + i, duree: 53.5 + 2 * i, repas: 180 }));
  const journee = { r: { ...R, stocks: { ...R.stocks, sejours: [...R.stocks.sejours, ...pourLaCuisine] } }, k: K };
  const avant = D.circulation(AVANT, journee, t0), avec = D.circulation(AVEC, journee, t0);
  const enFile = c => c.chariots.filter(x => x.etat === 'file' && !x.enChemin), siens = enFile(avec).filter(x => x.service === 'cuisine'), aCharger2 = enFile(avec).filter(x => x.service === HANDLING.service);
  assert.ok(siens.length >= 8 && aCharger2.length > 0, 'les deux files à la fois (' + siens.length + ' et ' + aCharger2.length + ' chariots)');
  const tous = [...siens, ...aCharger2], cles = tous.map(x => Math.round(x.x * 1000) + ',' + Math.round(x.y * 1000));
  assert.equal(new Set(cles).size, cles.length, 'aucun chariot sur un autre');
  for (const x of tous) assert.ok(dans(x, cuisine), 'tous dans la cuisine');
  // Ses propres lots d'abord, dans le même ordre que si la cuisine était seule.
  const seule = enFile(avant).filter(x => x.service === 'cuisine');
  assert.equal(siens.length, seule.length, 'autant de chariots pour la cuisine');
  const ordre = l => l.map(x => [x.classe, x.vol]);
  assert.deepEqual(ordre(siens), ordre(seule), 'dans le même ordre');
  // Les chariots du chargement sont plus loin dans la file : aucun n'est avant le dernier de la cuisine (colonne par colonne depuis le début de la bande).
  const debut = Math.min(...tous.map(x => x.x)), colonne = x => Math.round((x.x - debut) * 1000);
  assert.ok(Math.max(...siens.map(colonne)) <= Math.min(...aCharger2.map(colonne)), 'ce qui attend le chargement est à la suite');
  assert.equal(avec.chariots.length, avant.chariots.length, 'autant de chariots');
  // Un lot qui vient de finir roule vers la zone choisie : il n'entre pas au quai.
  const sejour = R.stocks.sejours.find(s => s.vers === HANDLING.service && s.sortie - s.entree > 5);
  const roule = D.circulation(AVEC, JOURNEE, sejour.entree + 1.9).chariots.filter(x => x.service === HANDLING.service && x.enChemin);
  assert.ok(roule.length > 0, 'des chariots en chemin');
  for (const x of roule) assert.ok(!dans(x, zone(AVEC.site, 'quais')), 'en chemin vers la zone choisie, pas au quai');
});

test('aucune autre aire de stockage : un lot qui attend un service attend dans la zone de ce service', () => {
  for (const t of HEURES.filter((_, i) => i % 3 === 0)) {
    for (const x of D.circulation(AVEC, JOURNEE, t).chariots.filter(k => k.etat === 'file' && k.service !== HANDLING.service && k.ton !== 'sale')) {
      const z = AVEC.site.zones.find(q => q.services.includes(x.service));
      assert.ok(z && dans(x, z), 'à ' + P.hhmm(t) + ', un lot qui attend ' + x.service + ' est dans sa zone');
    }
  }
});

test('seul ce qui attend le chargement change de zone : un lot qui attend une autre équipe du quai y reste ; une commande sans handling suit le quai', () => {
  // Deux séjours de plus, à la main : un lot qui attend le service du quai sans qu'un chargement le prenne (une autre
  // équipe de ce service), et une commande prête qui attend son vol sans équipe de handling (« chargement »).
  const t0 = R.stocks.sejours.find(s => s.vers === HANDLING.service && s.sortie - s.entree > 30).entree + 5, classe = R.classes[0].id;
  const autre = { de: 'armement', vers: HANDLING.service, classe, entree: t0 - 10, sortie: t0 + 37.5, duree: 47.5, repas: 120 };
  const sansHandling = { de: 'armement', vers: 'chargement', classe, entree: t0 - 10, sortie: t0 + 41.5, duree: 51.5, repas: 120 };
  const journee = { r: { ...R, stocks: { ...R.stocks, sejours: [...R.stocks.sejours, autre, sansHandling] } }, k: K };
  const quai = zone(AVEC.site, 'quais'), cuisine = zone(AVEC.site, 'cuisine');
  const avant = D.circulation(AVANT, journee, t0), avec = D.circulation(AVEC, journee, t0);
  // Sans réglage : tout est au quai.
  for (const x of avant.chariots.filter(k => k.etat === 'file' && !k.enChemin && (k.service === HANDLING.service || k.service === 'chargement'))) assert.ok(dans(x, zone(AVANT.site, 'quais')));
  // Avec : le lot de l'autre équipe du quai y reste ; ce qui attend le chargement, avec ou sans handling, est dans la cuisine.
  const duQuai = avec.chariots.filter(k => k.etat === 'file' && !k.enChemin && k.service === HANDLING.service), sans = avec.chariots.filter(k => k.etat === 'file' && k.service === 'chargement');
  const restes = duQuai.filter(k => dans(k, quai)), partis = duQuai.filter(k => dans(k, cuisine));
  assert.equal(restes.length + partis.length, duQuai.length);
  assert.ok(restes.length > 0 && restes.every(k => k.vol == null && k.classe === classe), 'le lot qui attend une autre équipe du quai reste au quai');
  assert.ok(partis.length > 0 && partis.every(k => k.vol != null), 'ce que le handling va charger est dans la cuisine');
  assert.ok(sans.length > 0 && sans.every(k => dans(k, cuisine)), 'une commande sans handling attend son vol au même endroit');
  // Autant de chariots, aucun sur un autre.
  assert.equal(avec.chariots.length, avant.chariots.length);
  const cles = avec.chariots.filter(k => k.etat === 'file' && !k.enChemin && (dans(k, cuisine) || dans(k, quai))).map(k => Math.round(k.x * 1000) + ',' + Math.round(k.y * 1000));
  assert.equal(new Set(cles).size, cles.length);
  // Sans équipe de handling du tout : pas de quai, pas de réglage qui joue — au bout du couloir, comme avant.
  const sansEquipe = ETAT.ateliers.filter(a => a.type !== 'handling');
  assert.equal('attentes' in S.generer({ ateliers: sansEquipe, parcours: ETAT.parcours, regime: ARGS.regime, parents: PARENTS, attentes: { quais: 'cuisine' } }), false);
});

test('la production comme zone d’accueil, un site disposé, une zone qui a disparu : toujours autant de chariots, aucun sur un autre', () => {
  const enFile = c => c.chariots.filter(x => x.etat === 'file' && !x.enChemin), cle = x => Math.round(x.x * 1000) + ',' + Math.round(x.y * 1000);
  // La production (préparation et montage) reçoit ce qui attend le chargement : ses deux files, puis ces lots, sans recouvrement.
  const FOOD = sceneDe({ attentes: { quais: 'prepa' } }), food = zone(FOOD.site, 'food');
  // Un site disposé (évolution 20 b) : les lots prêts roulent par les allées jusqu'à la cuisine.
  const disposition = { colonnes: [['magasin', 'decontam'], ['cuisine', 'dotation'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] };
  const DISPOSE = sceneDe({ attentes: { quais: 'cuisine' }, disposition }), SANS = sceneDe({ disposition }), cuisine = zone(DISPOSE.site, 'cuisine');
  // Un site dont le réglage désigne une zone qui n'y est pas (un site retouché à la main) : comme sans réglage, au quai.
  const PERDU = { ...AVANT, site: { ...AVANT.site, attentes: { quais: 'disparue', __proto__: 'cuisine' } } };
  let dansFood = 0, dansCuisine = 0;
  for (const t of HEURES) {
    const avant = D.circulation(AVANT, JOURNEE, t), f = D.circulation(FOOD, JOURNEE, t), d = D.circulation(DISPOSE, JOURNEE, t), s = D.circulation(SANS, JOURNEE, t);
    assert.equal(f.chariots.length, avant.chariots.length, 'à ' + P.hhmm(t));
    assert.equal(d.chariots.length, s.chariots.length, 'à ' + P.hhmm(t) + ', site disposé');
    for (const x of aCharger(f)) { assert.ok(dans(x, food), 'à ' + P.hhmm(t) + ' : dans la production'); dansFood++; }
    for (const x of aCharger(d)) { assert.ok(dans(x, cuisine) && !dans(x, zone(DISPOSE.site, 'quais')), 'à ' + P.hhmm(t) + ', site disposé : dans la cuisine'); dansCuisine++; }
    // Quand la production reçoit ces lots, tout y est rangé à la suite : aucun chariot sur un autre.
    if (aCharger(f).length) { const cles = enFile(f).filter(x => dans(x, food)).map(cle); assert.equal(new Set(cles).size, cles.length, 'à ' + P.hhmm(t) + ' : deux chariots à la même place dans la production'); }
    for (const x of [...f.chariots, ...d.chariots]) assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y));
    assert.deepEqual(D.circulation(PERDU, JOURNEE, t), avant, 'à ' + P.hhmm(t) + ' : une zone disparue, comme sans réglage');
  }
  assert.ok(dansFood > 20 && dansCuisine > 20);
  // En chemin dans le site disposé : par les allées, jamais à travers une autre zone que celle d'où il sort et celle où il entre.
  const sejour = R.stocks.sejours.find(q => q.vers === HANDLING.service && q.sortie - q.entree > 5);
  const roule = D.circulation(DISPOSE, JOURNEE, sejour.entree + 1).chariots.filter(x => x.service === HANDLING.service && x.enChemin);
  assert.ok(roule.length > 0);
  for (const x of roule) assert.ok(!dans(x, zone(DISPOSE.site, 'quais')), 'il ne passe pas par le quai');
});

test('le handling 24 h/24, en tournées : ce qui attend le chargement se range aussi dans la zone choisie', () => {
  // Une petite unité fictive : une équipe qui prépare, une équipe de handling ; quatre départs, un retour.
  const h = P.minutes, dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
  const vols = [dep('NO1', 'NORD', '10:00'), dep('NO2', 'NORD', '10:00'), dep('SU1', 'SUD', '12:00'), dep('SU2', 'SUD', '12:30'), { id: 'R1', cie: 'SUD', sens: 'RET', sta: h('11:00'), bc: 0, pc: 0, yc: 100 }];
  const prepa = { id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '00:00', jour: -1, personnes: 10, pauses: [], lots: [['NORD/YC'], ['SUD/YC']], regime: { actif: false } };
  const cuisine = { id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'appui', debut: '00:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: false } };
  for (const h24 of [false, true]) {
    const handling = { id: 'ha', nom: 'Handling', service: 'expedition', type: 'handling', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [], regime: { actif: false },
      durees: { '*': 20 }, allers: { '*': 10 }, retours: { '*': 10 }, simultanes: 5, avance: 180, ...(h24 ? { handling24h: true, escale: { SUD: 270 } } : {}) };
    const ateliers = [prepa, cuisine, handling];
    const r = P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'expedition' }], bareme: { prepa: { '*/YC': 10 } }, rendement: 1, ateliers }), mot = h24 ? '24 h/24' : 'par vol';
    const vers = r.stocks.sejours.filter(q => q.vers === 'expedition');
    assert.ok(vers.length > 0, mot + ' : des lots attendent le handling');
    const scene = plus => { const site = S.generer({ ateliers, regime: ARGS.regime, ...plus }), places = E.placesDesVols(r); return { site, ilots: D.ilots(site, ateliers), places, aire: D.aireDe(site, places.nombre) }; };
    const avant = scene(), avec = scene({ attentes: { expedition: 'cuisine' } });
    assert.deepEqual(avec.site.attentes, { expedition: 'cuisine' });
    let vus = 0;
    for (let t = Math.min(...vers.map(q => q.entree)); t <= Math.max(...vers.map(q => q.sortie)); t += 5) {
      const c0 = D.circulation(avant, { r }, t), c1 = D.circulation(avec, { r }, t), aLExpedition = c => c.chariots.filter(x => x.service === 'expedition' && x.etat === 'file' && !x.enChemin);
      assert.equal(c1.chariots.length, c0.chariots.length, mot + ' à ' + P.hhmm(t));
      for (const x of aLExpedition(c0)) assert.ok(dans(x, zone(avant.site, 'expedition')), mot + ' sans réglage : au quai');
      for (const x of aLExpedition(c1)) { assert.ok(dans(x, zone(avec.site, 'cuisine')) && !dans(x, zone(avec.site, 'expedition')), mot + ' à ' + P.hhmm(t) + ' : dans la cuisine'); vus++; }
    }
    assert.ok(vus > 0, mot + ' : des chariots vus dans la zone choisie');
  }
});

test('le réglage se sauvegarde avec les équipes ; une sauvegarde d’avant se relit sans lui ; il ne change aucun calcul', () => {
  assert.equal('attentes' in A.valider(ETAT), false);
  // Un service → un service, en texte : le reste est écarté. Il se garde même si le service n'a pas d'équipe de handling
  // (le site ne le joue pas) : changer le type d'une équipe, puis revenir, ne le perd pas.
  const avec = A.valider({ ...ETAT, attentes: { quais: 'cuisine', dotation: 'armement', vide: '', nombre: 7, liste: ['cuisine'], meme: 'meme' } });
  assert.deepEqual(avec.attentes, { quais: 'cuisine', dotation: 'armement' });
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).attentes, { quais: 'cuisine', dotation: 'armement' });
  for (const vide of [{}, null, 'x', [], 12, { quais: '' }, { quais: 'quais' }]) assert.equal('attentes' in A.valider({ ...ETAT, attentes: vide }), false, JSON.stringify(vide));
  // Les équipes elles-mêmes ne portent rien de plus : ce que le calcul lit est le même, et son résultat aussi.
  assert.deepEqual(avec.ateliers, A.valider(ETAT).ateliers);
  const sauve = F.sauvegardeFictive(), e = lire(sauve.contenu['ory-ateliers-v1']); e.attentes = { quais: 'cuisine' };
  sauve.contenu['ory-ateliers-v1'] = typeof sauve.contenu['ory-ateliers-v1'] === 'string' ? JSON.stringify(e) : e;
  const args = J.argumentsDeLaJournee(sauve, VOLS);
  assert.equal(JSON.stringify(args), JSON.stringify(ARGS), 'les mêmes arguments');
  assert.equal(JSON.stringify(P.simuler(args)), JSON.stringify(R), 'le même résultat, champ par champ');
  assert.equal(JSON.stringify(I.journee(P.simuler(args), args)), JSON.stringify(K), 'les mêmes indicateurs');
});
