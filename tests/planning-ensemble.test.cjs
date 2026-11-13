/* Correction 18 (b) — le planning, d'abord toute l'unité (planning-ensemble.js) :
 * ce que le planning montre avant de le dessiner, sans navigateur.
 *   — un jour de travail à la fois : les jours qui ont des lots, celui qu'on
 *     ouvre, le cadre d'un jour (30 min avant le premier lot, 30 min après le
 *     dernier), l'échelle qui remplit la largeur (une heure ≥ 40 px) ;
 *   — les lignes : les services qui ont des lots, dans l'ordre des chemins ;
 *     les services et les équipes sans lot, à part ;
 *   — le résumé d'un service, entier ; le temps sans travail avant le premier
 *     lot et ce que l'équipe attendait ; la colonne des noms, jusqu'à 260 px.
 * Des journées fictives calculées à la main, puis l'unité fictive de 15
 * services et 50 équipes (tests/unite-15-services.cjs). Aucune donnée réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const E = require('../planning-ensemble.js');
const PV = require('../planning-vue.js');
const U = require('./unite-15-services.cjs');
const F = require('./plan-rejoue-fictif.cjs');

const h = s => P.minutes(s);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, debut, personnes, lots, x) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes, lots, regime: { actif: true }, ...x });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const NOMS = { cuisine: 'Cuisine', prepa: 'Montage', magasin: 'Magasin' };
const jouer = args => { const a = { liaisons: [], rendement: 1, noms: NOMS, ...args }; return { r: P.simuler(a), args: a }; };

// Une petite journée : la cuisine travaille la veille (20:00–22:00) pour le montage du jour (07:00–08:00 : il attend l'ouverture
// du magasin, là depuis 06:00) ; une équipe du montage sans commande ; le magasin, une mise à disposition ouverte de 07:00 à 18:00.
const PETITE = () => jouer({ vols: [dep('NO1', 'NORD', '20:00', { bc: 10 })], bareme: { cuisine: { '*/BC': 120 }, prepa: { '*/BC': 60, '*/YC': 60 } },
  ateliers: [{ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: true }, permanent: true, ouverture: { de: '07:00', a: '18:00' } },
    eq('cu', 'cuisine', '20:00', 1, [['NORD/BC']], { jour: -1 }), eq('mo', 'prepa', '06:00', 2, [['NORD/YC'], ['NORD/BC']]), eq('vide', 'prepa', '06:00', 3, [])],
  parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['magasin', 'prepa'])], parcoursCabine: { BC: 'c1', YC: 'c2' } });

test('les jours de travail qui ont des lots ; celui qu’on ouvre a le plus de lots', () => {
  const { r } = PETITE();
  assert.deepEqual(r.ateliers.find(a => a.id === 'cu').lots.map(l => [l.debut, l.fin]), [[h('20:00') - 1440, h('22:00') - 1440]], 'la cuisine, la veille');
  assert.deepEqual(E.joursAvecLots(r), [{ jour: -1, lots: 1, equipes: 1 }, { jour: 0, lots: 2, equipes: 1 }], 'ni la mise à disposition ni l’équipe sans commande ne comptent');
  assert.equal(E.jourAOuvrir(r), 0);
  // À égalité, le premier jour ; sans lot, aucun.
  const egal = { ateliers: [{ id: 'a', jour: -1, lots: [{ debut: 0, fin: 10 }] }, { id: 'b', jour: 0, lots: [{ debut: 100, fin: 110 }] }] };
  assert.equal(E.jourAOuvrir(egal), -1);
  assert.equal(E.jourAOuvrir({ ateliers: [{ id: 'a', jour: 0, lots: [{ dispo: true, debut: 0, fin: 0 }] }] }), null);
  assert.deepEqual([-2, -1, 0, 1, 2].map(E.motDuJour), ['J−2', 'veille', 'jour des vols', 'J+1', 'J+2']);
});

test('le cadre d’un jour : 30 min avant le premier lot, 30 min après le dernier ; l’échelle remplit la largeur, une heure fait au moins 40 px', () => {
  const { r } = PETITE();
  // Le jour des vols : le montage, de 07:00 à 08:00 (deux lots d'une demi-heure à deux) — de 06:30 à 08:30.
  const mo = r.ateliers.find(a => a.id === 'mo').lots;
  assert.deepEqual([Math.min(...mo.map(l => l.debut)), Math.max(...mo.map(l => l.fin))], [h('07:00'), h('08:00')]);
  assert.deepEqual(E.cadreDuJour(r, 0), { t0: h('06:30'), t1: h('08:30') });
  // La veille : la cuisine, de 20:00 à 22:00 la veille — de 19:30 à 22:30, la veille.
  assert.deepEqual(E.cadreDuJour(r, -1), { t0: h('19:30') - 1440, t1: h('22:30') - 1440 });
  assert.equal(E.cadreDuJour(r, 1), null, 'un jour sans lot n’a pas de cadre');
  // Un lot pas fini compte à son début.
  assert.deepEqual(E.cadreDuJour({ ateliers: [{ jour: 0, lots: [{ debut: 600, fin: null }, { debut: 480, fin: 540 }] }] }, 0), { t0: 450, t1: 630 });
  // « Un jour » : 2 h dans 1 000 px → 500 px par heure (la fenêtre remplit la largeur) ; 30 h dans 1 000 px → 40 px, on défile.
  assert.equal(E.pxParHeure('jour', 1000, h('06:30'), h('08:30')), 500);
  assert.equal(E.pxParHeure('jour', 1000, 0, 30 * 60), 40);
  assert.equal(E.pxParHeure('jour', 1100, 0, 20 * 60), 55);
  assert.equal(E.pxParHeure('six', 1000, 0, 30 * 60), 160);
  assert.equal(E.pxParHeure('chaine', 1000, 0, 50 * 60), 20, '« Toute la chaîne » tient dans la largeur');
});

test('les lignes d’un jour : les services qui ont des lots, dans l’ordre donné ; les services et les équipes sans lot, à part', () => {
  const { r } = PETITE(), ordre = ['magasin', 'cuisine', 'prepa'], nom = id => NOMS[id];
  const jour = E.lignes(r, 0, ordre, nom);
  assert.deepEqual(jour.services.map(s => [s.service, s.nom, s.equipes.map(a => a.id), s.lots]), [['prepa', 'Montage', ['mo'], 2]]);
  assert.deepEqual(jour.sansLot.map(x => [x.service, x.nom, x.equipe.id]), [['magasin', 'Magasin', 'mag'], ['prepa', 'Montage', 'vide']], 'la mise à disposition, l’équipe sans commande');
  const veille = E.lignes(r, -1, ordre, nom);
  assert.deepEqual([veille.services.map(s => s.service), veille.sansLot], [['cuisine'], []]);
  // Toute la chaîne : tous les jours à la fois, dans l'ordre des services.
  const tout = E.lignes(r, null, ordre, nom);
  assert.deepEqual(tout.services.map(s => [s.service, s.equipes.map(a => a.id)]), [['cuisine', ['cu']], ['prepa', ['mo']]]);
  assert.deepEqual(tout.sansLot.map(x => x.equipe.id), ['mag', 'vide']);
  // Un service absent de l'ordre se range à la fin.
  assert.deepEqual(E.lignes(r, null, ['prepa'], nom).services.map(s => s.service), ['prepa', 'cuisine']);
});

test('le résumé d’un service : le pic, son heure, les présents, l’occupation, les heures sup — en entier', () => {
  const { r, args } = PETITE(), k = I.journee(r, args), rep = R.reponses(r, args, { k });
  // Le montage : 2 personnes au travail de 07:00 à 08:00, 5 présentes (avec l'équipe sans commande).
  const mo = E.resume(k, rep, 'prepa', 0);
  assert.deepEqual([mo.jour, mo.pic, mo.a, mo.presents, mo.heuresSup], [0, 2, h('07:00'), 5, 0]);
  assert.equal(E.motsDuPic(mo), '2 / 5');
  assert.match(E.phraseDuResume(mo, 0), /^pic 2 au travail à 07:00, 5 présents · occupation \d+ % · aucune heure sup$/);
  // La cuisine de la veille : le mot du jour quand ce n'est pas le jour affiché.
  const cu = E.resume(k, rep, 'cuisine', -1);
  assert.deepEqual([cu.pic, cu.a, cu.presents], [1, h('20:00'), 1]);
  assert.match(E.phraseDuResume(cu, 0), /^veille — pic 1 au travail à 20:00, 1 présent · /);
  assert.match(E.phraseDuResume(cu, -1), /^pic 1 au travail à 20:00/);
  // Des heures sup : en personnes × heures.
  assert.match(E.phraseDuResume({ jour: 0, pic: 6, a: h('09:15'), presents: 8, occupation: 0.724, heuresSup: 80 }, 0),
    /^pic 6 au travail à 09:15, 8 présents · occupation 72 % · heures sup 1 h 20 \(personnes × heures\)$/);
  assert.equal(E.motsDuPic({ pic: 1.5, presents: 2.25 }), '1,5 / 2,3');
  // Sans mesure (une mise à disposition) : « — », « travail sans objet ».
  const mag = E.resume(k, rep, 'magasin', 0);
  assert.equal(E.motsDuPic(mag), '—');
  assert.match(E.phraseDuResume(mag, 0), /^travail sans objet/);
  assert.equal(E.resume(k, rep, 'inconnu', 0), null);
});

test('avant le premier lot : de l’arrivée de l’équipe au début de son premier lot, et ce qu’elle attendait', () => {
  const { r, args } = PETITE(), rep = R.reponses(r, args), av = E.avantLePremierLot(r, rep);
  // Le montage arrive à 06:00 et commence à 07:00, à l'ouverture du magasin ; la cuisine commence à son arrivée ; la mise à
  // disposition et l'équipe sans lot n'ont pas de bande.
  assert.deepEqual([...av.keys()], ['mo']);
  assert.deepEqual(av.get('mo'), { de: h('06:00'), a: h('07:00'), minutes: 60, attendait: 'attend l’ouverture de Magasin, à 07:00' });
  assert.equal(E.motsDAvant(av.get('mo')), 'Sans travail avant le premier lot : 1 h 00 (de 06:00 à 07:00)\nL’équipe attend l’ouverture de Magasin, à 07:00.');
  // Sans les réponses : la bande, sans ce qui était attendu.
  assert.deepEqual(E.avantLePremierLot(r, null).get('mo'), { de: h('06:00'), a: h('07:00'), minutes: 60, attendait: null });
});

test('la colonne des noms : la largeur du nom le plus long, de 160 à 260 px', () => {
  const mesurer = (t, taille) => t.length * taille / 2;
  assert.equal(E.largeurDesNoms([{ texte: 'Montage', taille: 13, marge: 60 }], mesurer), 160, 'un nom court : la largeur minimale');
  assert.equal(E.largeurDesNoms([{ texte: 'Montage du matin, équipe A', taille: 13, marge: 60 }], mesurer), 229, '26 lettres × 6,5 px + 60');
  assert.equal(E.largeurDesNoms([{ texte: 'Montage — équipe de renfort du samedi et des jours fériés', taille: 13, marge: 60 }], mesurer), 260, 'jamais plus de 260 px');
  assert.equal(E.largeurDesNoms([], mesurer), 160);
  assert.equal(E.motsDesPersonnes({ personnes: 2 }), '2 pers.');
  assert.equal(E.motsDesPersonnes({ personnes: 1.5 }), '1,5 pers.');
});

test('une courbe en escalier : chaque créneau à plat, décalé au jour de travail, coupé au cadre', () => {
  const x = t => t, y = v => 10 - v;
  assert.equal(E.escalier({ debut: 0, valeurs: [1, 2] }, 0, x, y, 0, 30, 15), 'M0.0 9.0L15.0 9.0L15.0 8.0L30.0 8.0');
  // La veille : décalée de −1 440 min ; hors du cadre : rien.
  assert.equal(E.escalier({ debut: 1200, valeurs: [3] }, -1440, x, y, -300, 0, 15), 'M-240.0 7.0L-225.0 7.0');
  assert.equal(E.escalier({ debut: 1200, valeurs: [3] }, 0, x, y, 0, 600, 15), '');
});

test('l’unité fictive de 15 services et 50 équipes : 15 services ont des lots le jour des vols, 3 mises à disposition n’en ont pas', () => {
  const p = F.heureDuPicAttendue(U.sauvegarde(), U.volsCsv()), r = p.resultat;
  assert.equal(r.ok, true);
  assert.equal(r.ateliers.length, 50, '50 équipes');
  assert.deepEqual(E.joursAvecLots(r).map(x => [x.jour, x.equipes]), [[-1, 2], [0, 35]], 'deux équipes la veille, 35 le jour des vols');
  assert.equal(E.jourAOuvrir(r), 0);
  const ordre = PV.ordreDesServices(r, p.args.parcours), jour = E.lignes(r, 0, ordre, id => id);
  assert.equal(jour.services.length, 15, '15 services avec des lots');
  assert.ok(jour.services.every(s => s.lots > 0 && s.equipes.every(a => E.lotsDe(a).length)));
  assert.equal(jour.sansLot.length, 12);
  assert.deepEqual([...new Set(jour.sansLot.filter(x => x.equipe.type === 'dispo').map(x => x.service))].sort(), ['appros', 'magasin'], 'les mises à disposition du jour');
  // Les services gardent l'ordre des chemins entre eux.
  const rangs = jour.services.map(s => ordre.indexOf(s.service));
  assert.deepEqual(rangs, rangs.slice().sort((a, b) => a - b));
  // La veille : la cuisine ; la décontamination, une mise à disposition, sans lot.
  const veille = E.lignes(r, -1, ordre, id => id);
  assert.deepEqual([veille.services.map(s => s.service), veille.sansLot.map(x => x.equipe.id)], [['cuisine'], ['leg']]);
  // Le cadre du jour des vols commence 30 min avant le premier lot.
  const premier = Math.min(...r.ateliers.filter(a => (a.jour || 0) === 0).flatMap(E.lotsDe).map(l => l.debut));
  assert.equal(E.cadreDuJour(r, 0).t0, premier - 30);
  // À 1 366 px de large (1 110 px moins 260 px de noms), une heure fait au moins 40 px.
  const c = E.cadreDuJour(r, 0);
  assert.ok(E.pxParHeure('jour', 850, c.t0, c.t1) >= 40);
});
