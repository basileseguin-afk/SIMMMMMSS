/* Évolution 14 (c) — le planning des équipes, sans navigateur (planning-vue.js) :
 * l'échelle fixe des trois zooms, les bornes de la chaîne, le jour où le plus
 * de lots tournent, l'ordre des services le long du chemin, les groupes, une
 * pause prise qui troue la barre, la limite de chaque commande au bout de son
 * dernier lot, le retard et la marge, la période visible, les repères de l'axe
 * à deux niveaux, la commande mise en évidence. Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PV = require('../planning-vue.js');

/* Une journée fictive : une cuisine la veille, un montage, un robot, un handling, une plonge. */
const R = {
  ok: true,
  parClasse: {
    'A/BC': { id: 'A/BC', echeance: 600, fin: 540, services: ['cuisine', 'montage'] },
    'A/YC': { id: 'A/YC', echeance: 600, fin: 660, services: ['cuisine', 'montage'] },
    'B/BC': { id: 'B/BC', echeance: 900, fin: 700, services: ['montage'] },
    'Z/XX': { id: 'Z/XX', echeance: 100, absente: true, services: [] }
  },
  ateliers: [
    { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', pausesPrises: [], lots: [{ service: 'plonge', nom: 'Vol A1 (J-1)', vol: 'A1 (J-1)', classes: [], debut: 700, fin: 730, duree: 30, attente: 0 }] },
    { id: 'mo', nom: 'Montage', service: 'montage', type: 'manuel', pausesPrises: [{ de: 480, a: 495 }], lots: [
      { service: 'montage', nom: 'A/BC', classes: ['A/BC'], debut: 420, fin: 540, duree: 105, attente: 30, arret: 15 },
      { service: 'montage', nom: 'A/YC', classes: ['A/YC'], debut: 540, fin: 660, duree: 120, attente: 0 },
      { service: 'montage', nom: 'B/BC', classes: ['B/BC'], debut: 660, fin: 700, duree: 40, attente: 0, fusion: 'cuisine' }] },
    { id: 'rb', nom: 'Robot', service: 'montage', type: 'robot', pausesPrises: [], lots: [] },
    { id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', jour: -1, pausesPrises: [], lots: [
      { service: 'cuisine', nom: 'A/BC + A/YC', classes: ['A/BC', 'A/YC'], debut: -200, fin: -80, duree: 120, attente: 0 }] },
    { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', pausesPrises: [], lots: [
      { service: 'quais', nom: 'Vol A1', vol: 'A1', handling: true, classes: ['A/BC', 'A/YC'], debut: 665, fin: 705, duree: 40, attente: 0, depart: 645, retard: 60, aHeure: false },
      { service: 'quais', nom: 'Vol B1', vol: 'B1', handling: true, classes: ['B/BC'], debut: 705, fin: 745, duree: 40, attente: 0, depart: 945, retard: 0, aHeure: true }] },
    { id: 'mg', nom: 'Magasin', service: 'magasin', type: 'dispo', pausesPrises: [], lots: [{ service: 'magasin', nom: 'A/BC', classes: ['A/BC'], dispo: true, debut: -240 }] }
  ]
};
R.lots = R.ateliers.flatMap(a => a.lots);
const lot = (at, i) => R.ateliers.find(a => a.id === at).lots[i];

test('l’échelle : « Un jour » 40 px par heure, « 6 h » 160, « Toute la chaîne » tient dans la largeur visible', () => {
  assert.equal(PV.pxParHeure('jour', 800, 0, 1440), 40);
  assert.equal(PV.pxParHeure('jour', 1600, 0, 1440), 40, 'la largeur de la fenêtre n’y change rien');
  assert.equal(PV.pxParHeure('six', 800, 0, 1440), 160);
  assert.equal(PV.pxParHeure('six', 1600, 0, 1440), 160);
  assert.equal(PV.pxParHeure('chaine', 800, 0, 1200), 40, '20 h dans 800 px');
  assert.equal(PV.pxParHeure('chaine', 1600, 0, 1200), 80);
  assert.ok(PV.pxParHeure('chaine', 10, 0, 6000) >= 4, 'jamais illisible');
  assert.equal(PV.HAUT_LIGNE, 28);
  assert.deepEqual(PV.ZOOMS.map(z => z.id), ['chaine', 'jour', 'six']);
  assert.equal(PV.zoomVoisin('jour', 1), 'six');
  assert.equal(PV.zoomVoisin('jour', -1), 'chaine');
  assert.equal(PV.zoomVoisin('six', 1), 'six');
  assert.equal(PV.zoomVoisin('chaine', -1), 'chaine');
});

test('les bornes : de la première à la dernière minute, à l’heure ronde, limites des commandes comprises', () => {
  assert.deepEqual(PV.bornes(R), { t0: -240, t1: 900 });
  assert.equal(PV.bornes({ lots: [] }), null);
  assert.deepEqual(PV.bornes({ lots: [{ debut: 10, fin: 20 }], ateliers: [], parClasse: {} }), { t0: 0, t1: 60 });
});

test('le jour où le plus de lots tournent', () => {
  assert.equal(PV.jourLePlusCharge(R), 0);
  assert.equal(PV.jourLePlusCharge({ lots: [{ debut: -100, fin: -50 }, { debut: -90, fin: -40 }, { debut: 30, fin: 60 }] }), -1);
  assert.equal(PV.jourLePlusCharge({ lots: [{ debut: -100, fin: -50 }, { debut: 30, fin: 60 }] }), -1, 'à égalité, le premier');
  assert.equal(PV.jourLePlusCharge({ lots: [] }), 0);
});

test('l’ordre des services : le long du chemin, de l’amont vers l’aval ; le handling après ce qu’il charge, la plonge à la fin', () => {
  assert.deepEqual(PV.ordreDesServices(R), ['magasin', 'cuisine', 'montage', 'quais', 'plonge']);
  const g = PV.groupes(R, id => id.toUpperCase());
  assert.deepEqual(g.map(x => [x.service, x.nom, x.equipes.map(a => a.id)]), [
    ['magasin', 'MAGASIN', ['mg']], ['cuisine', 'CUISINE', ['cu']], ['montage', 'MONTAGE', ['mo']], ['quais', 'QUAIS', ['h']], ['plonge', 'PLONGE', ['pl']]
  ], 'une équipe sans lot n’a pas de ligne');
  // Un service sans lot mais avec une courbe de charge (une équipe d'appui) garde son groupe, ses équipes en lignes vides.
  const appui = { ...R, ateliers: R.ateliers.concat({ id: 'ap', nom: 'Appui', service: 'appui', type: 'appui', pausesPrises: [], lots: [] }) };
  assert.deepEqual(PV.groupes(appui, null, new Set(['appui', 'montage'])).map(x => [x.service, x.equipes.map(a => a.id)]).slice(-2),
    [['appui', ['ap']], ['plonge', ['pl']]], 'le lavage reste à la fin');
  assert.deepEqual(PV.groupes(appui, null, new Set(['montage'])).find(x => x.service === 'montage').equipes.map(a => a.id), ['mo'], 'le robot sans lot reste caché');
  assert.equal(PV.groupes(appui, null).some(x => x.service === 'appui'), false);
  // Un cycle dans les chemins ne fige rien : chaque service sort une fois.
  const boucle = { ateliers: [{ id: 'a', service: 'x', lots: [{}] }, { id: 'b', service: 'y', lots: [{}] }], lots: [], parClasse: { c: { services: ['x', 'y'] }, d: { services: ['y', 'x'] } } };
  assert.deepEqual(PV.ordreDesServices(boucle).sort(), ['x', 'y']);
});

test('une pause prise troue la barre', () => {
  assert.deepEqual(PV.segments(420, 540, [{ de: 480, a: 495 }]), [[420, 480], [495, 540]]);
  assert.deepEqual(PV.segments(420, 540, []), [[420, 540]]);
  assert.deepEqual(PV.segments(420, 540, [{ de: 400, a: 430 }, { de: 530, a: 600 }, { de: 700, a: 710 }]), [[430, 530]]);
  assert.deepEqual(PV.segments(420, 540, [{ de: 400, a: 600 }]), [], 'tout en pause : rien');
});

test('la limite de chaque commande, au bout de la barre de son dernier lot ; le retard ; la marge', () => {
  const L = PV.limites(R);
  assert.deepEqual(L.get(lot('mo', 0)), [600], 'A/BC finit au montage : sa limite sur ce lot');
  assert.deepEqual(L.get(lot('mo', 1)), [600]);
  assert.deepEqual(L.get(lot('mo', 2)), [900]);
  assert.equal(L.get(lot('cu', 0)), undefined, 'pas sur un lot d’avant');
  assert.equal(L.get(lot('h', 0)), undefined, 'le handling a son départ, pas la limite de la commande');
  assert.equal(PV.enRetard(lot('mo', 0), R.parClasse), false);
  assert.equal(PV.enRetard(lot('mo', 1), R.parClasse), true, 'fini à 11:00 pour 10:00');
  assert.equal(PV.enRetard(lot('h', 0), R.parClasse), true, 'un vol chargé en retard');
  assert.equal(PV.enRetard(lot('h', 1), R.parClasse), false);
  assert.equal(PV.enRetard(lot('pl', 0), R.parClasse), false, 'sans commande, pas de retard');
  assert.equal(PV.marge(lot('mo', 0), R.parClasse), 60);
  assert.equal(PV.marge(lot('mo', 1), R.parClasse), -60);
  assert.equal(PV.marge(lot('cu', 0), R.parClasse), -60, 'la plus petite de ses commandes');
  assert.equal(PV.marge(lot('h', 0), R.parClasse), -60, 'le handling : son départ');
  assert.equal(PV.marge(lot('pl', 0), R.parClasse), null);
});

test('l’infobulle : la commande, le début, la fin, la durée, l’attente et la marge', () => {
  const info = PV.info(lot('mo', 0), R.ateliers[1], { parClasse: R.parClasse, nomService: id => id });
  // Une seule écriture du temps (évolution 15 c) : au-delà d'une heure, en heures.
  assert.equal(info, 'A · Business\n07:00 → 09:00 (1 h 45, dont 15 min d’arrêt)\nAttente : 30 min\nMarge : 1 h 00');
  assert.match(PV.info(lot('mo', 1), R.ateliers[1], { parClasse: R.parClasse, nomService: id => id }), /\nAttente : aucune\nRetard : 1 h 00$/);
  assert.match(PV.info(lot('mo', 2), R.ateliers[1], { parClasse: R.parClasse, nomService: id => id }), /À la chaîne : cuisine/);
  assert.match(PV.info(lot('pl', 0), R.ateliers[0], { parClasse: R.parClasse, nomService: id => id }), /\nAttente : aucune$/, 'sans limite, pas de marge');
});

test('la période visible : « J-1 06:00 → J 06:00 »', () => {
  assert.equal(PV.periode(-1080, 360), 'J-1 06:00 → J 06:00');
  assert.equal(PV.periode(0, 1320), 'J 00:00 → J 22:00');
  assert.equal(PV.periode(1380, 1500), 'J 23:00 → J+1 01:00');
  assert.deepEqual(PV.visible({ t0: -240, pxh: 40, gauche: 240, largeur: 800 }), { de: 120, a: 1320 });
});

test('l’axe : deux niveaux, le jour puis les heures ; des heures toujours lisibles', () => {
  const r = PV.reperes(-240, 900, 40);
  assert.deepEqual(r.jours.map(j => [j.nom, j.de, j.a]), [['J-1', -240, 0], ['J', 0, 900]]);
  assert.equal(r.pas, 60, 'à 40 px par heure, chaque heure');
  assert.deepEqual(r.heures.slice(0, 3).map(h => [h.t, h.texte]), [[-240, '20:00'], [-180, '21:00'], [-120, '22:00']]);
  assert.equal(r.heures.length, 19, 'de 20:00 à 14:00 ; le bord droit, 15:00, sans étiquette qui déborderait');
  assert.equal(PV.reperes(-240, 900, 12).pas, 240, 'serré : une heure sur quatre');
  assert.equal(PV.reperes(0, 360, 160).pas, 30, 'large : la demi-heure');
  for (const pxh of [4, 12, 40, 160]) { const x = PV.reperes(-240, 3000, pxh); assert.ok(x.pas / 60 * pxh >= 40, 'deux repères à 40 px au moins : ' + pxh); }
});

test('la commande mise en évidence : les lots qui la portent', () => {
  const cle = PV.commandeDe(lot('mo', 0));
  assert.deepEqual(cle, ['A/BC']);
  assert.equal(PV.porte(lot('cu', 0), cle), true, 'la cuisine a préparé la même commande');
  assert.equal(PV.porte(lot('h', 0), cle), true, 'le handling la charge');
  assert.equal(PV.porte(lot('mo', 2), cle), false);
  // Un lot sans commande (un retour à laver) : son vol.
  assert.deepEqual(PV.commandeDe(lot('pl', 0)), ['vol:A1 (J-1)']);
  assert.equal(PV.porte(lot('pl', 0), PV.commandeDe(lot('pl', 0))), true);
  assert.equal(PV.porte(lot('mo', 0), PV.commandeDe(lot('pl', 0))), false);
});
