/* Évolution 19 (b) — un réglage qui ne joue pas ne s'affiche pas. Le module
 * jouent.js dit, pour une équipe, les réglages qui portent une valeur et que
 * le calcul ne lit pas, chacun avec sa raison en une phrase ; pour un service,
 * s'il travaille par compagnie (ses minutes par compagnie) ; pour l'unité, si
 * une commande au moins n'a pas de chemin (la page « Liens entre services »).
 * Il ne change aucune valeur : il lit. Aucune donnée de l'unité : des équipes,
 * des compagnies et des vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../jouent.js');
const P = require('../moteur/production.js');

const plonge = x => ({ id: 'pl', nom: 'Plonge matin', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 3, pauses: [], lots: [],
  regime: { actif: true }, plafond: 500, tunnels: [{ nom: 'T1', debit: 300, personnes: 2, actif: true }, { nom: 'T2', debit: 200, personnes: 1, actif: true, vitesse: 2 }],
  durees: { '*': 30, NORD: 45 }, ...x });
const robot = x => ({ id: 'rb', nom: 'Robot', service: 'prepa', type: 'robot', debut: '03:00', jour: 0, personnes: 2, debit: 300, personnesMin: 2, pauses: [],
  lots: [['NORD/YC'], ['SUD/YC']], regime: { actif: false }, ...x });
const dispo = x => ({ id: 'lg', nom: 'Légumerie', service: 'decontam', type: 'dispo', debut: '18:00', jour: -1, personnes: 2, pauses: [], lots: [],
  regime: { actif: true }, permanent: true, vagues: [{ debut: '18:00', jour: -1 }, { debut: '04:00', jour: 0 }], ...x });
const handling = x => ({ id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '04:00', jour: 0, personnes: 4, pauses: [], lots: [], regime: { actif: true },
  durees: { '*': 25, NORD: 40 }, simultanes: 3, chauffeurs: { long: 2, court: 1 }, creneaux: [{ de: '03:00', a: '11:00', n: 6 }, { de: '11:00', a: '20:00', n: 3 }], ...x });
const cles = l => l.map(x => x.cle);

test('la plonge : par vol, le débit de chaque tunnel et le plafond ne jouent pas ; au débit, ce sont les durées par compagnie', () => {
  const parVol = J.nonJoues(plonge({ parVol: true }));
  assert.deepEqual(cles(parVol), ['tunnel-debit:0', 'tunnel-debit:1', 'plafond']);
  assert.deepEqual(parVol.map(x => [x.libelle, x.valeur]), [['Débit de « T1 »', '300 u/h'], ['Débit de « T2 »', '200 u/h'], ['Débit maximum de l’ensemble', '500 u/h']]);
  for (const x of parVol) assert.equal(x.raison, 'La plonge lave par vol : un tunnel lave un vol en un temps donné, compagnie par compagnie ; son débit ne compte pas.');
  // Ce qu'il faut masquer dans la fiche, si c'est affiché.
  assert.deepEqual(parVol[1].champs, [{ champ: 'tunnel-debit', index: 1 }]);
  assert.deepEqual(parVol[2].champs, [{ champ: 'plafond' }]);
  // Au débit : les durées par compagnie et la vitesse d'un tunnel (× 2) ne jouent pas ; les débits jouent.
  const auDebit = J.nonJoues(plonge({ parVol: false }));
  assert.deepEqual(cles(auDebit), ['durees', 'tunnel-vitesse:1']);
  assert.deepEqual(auDebit.map(x => [x.libelle, x.valeur]), [['Temps pour laver un vol, par compagnie', 'toutes compagnies : 30 min ; NORD : 45 min'], ['Vitesse de « T2 »', '× 2']]);
  for (const x of auDebit) assert.equal(x.raison, 'La plonge lave au débit : ce sont les débits des tunnels et le plafond de l’ensemble qui comptent.');
  // Rien de réglé, rien à dire : un tunnel sans débit, pas de plafond, pas de durée.
  assert.deepEqual(J.nonJoues(plonge({ parVol: true, plafond: 0, tunnels: [{ nom: 'T1', debit: 0, personnes: 1, actif: true }] })), []);
  assert.deepEqual(J.nonJoues(plonge({ parVol: false, durees: {}, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true, vitesse: 1 }] })), []);
});

test('le robot : son débit général ne joue pas quand chacune de ses commandes a le sien', () => {
  assert.deepEqual(J.nonJoues(robot()), [], 'aucune commande n’a son débit : le débit général joue');
  assert.deepEqual(J.nonJoues(robot({ debits: { 'NORD/YC': 450 } })), [], 'une commande sur deux : il joue pour l’autre');
  const tous = J.nonJoues(robot({ debits: { 'NORD/YC': 450, 'SUD/YC': 380 } }));
  assert.deepEqual(tous, [{ cle: 'debit', champs: [{ champ: 'debit' }], libelle: 'Débit du robot', valeur: '300 pl/h',
    raison: 'Chaque commande de ce robot a son propre débit : le débit général ne sert à aucune.' }]);
  assert.deepEqual(J.nonJoues(robot({ lots: [], debits: {} })), [], 'un robot sans commande : rien ne le remplace');
  // Le débit propre d'une commande vaut comme le moteur le lit (MoteurProduction.debitRobot).
  const a = robot({ debits: { 'NORD/YC': 450, 'SUD/YC': 0 } });
  assert.equal(P.debitRobot(a, 'SUD/YC'), 300, 'un débit propre à zéro ne compte pas : le général joue');
  assert.deepEqual(J.nonJoues(a), []);
});

test('la mise à disposition : toujours ouverte ou ouverte de … à …, son heure de début, son jour et ses vagues ne jouent pas', () => {
  const toujours = J.nonJoues(dispo());
  assert.deepEqual(toujours.map(x => [x.cle, x.libelle, x.valeur]), [['debut', 'Heure de début', '18:00'], ['jour', 'Jour', 'J-1'], ['vagues', 'Vagues', 'J-1 18:00 ; J 04:00']]);
  for (const x of toujours) assert.equal(x.raison, 'Toujours ouverte : on s’y sert à tout moment, personne ne l’attend.');
  const ouverte = J.nonJoues(dispo({ ouverture: { de: '07:00', a: '18:00' } }));
  assert.deepEqual(cles(ouverte), ['debut', 'jour', 'vagues']);
  for (const x of ouverte) assert.equal(x.raison, 'Ouverte de 07:00 à 18:00, chaque jour : ce sont ses heures d’ouverture qui comptent.');
  // À heures fixes : ses vagues jouent, rien n'est masqué.
  assert.deepEqual(J.nonJoues(dispo({ permanent: false })), []);
  // Sans vague gardée : l'heure et le jour seulement.
  assert.deepEqual(cles(J.nonJoues(dispo({ vagues: [] }))), ['debut', 'jour']);
  assert.deepEqual(P.vaguesDe(dispo()), [], 'comme le moteur : toujours ouverte, aucune vague');
  assert.equal(P.vaguesDe(dispo({ permanent: false })).length, 2);
});

test('le handling : « vols à la fois » ne joue que sans chauffeurs comptés ; les créneaux, que s’ils sont saisis et non calculés', () => {
  // Des créneaux saisis : les chauffeurs sont comptés.
  assert.deepEqual(J.nonJoues(handling()), [{ cle: 'simultanes', champs: [{ champ: 'simultanes' }], libelle: 'Vols en même temps', valeur: '3',
    raison: 'Les chauffeurs sont comptés : c’est leur nombre qui limite les vols menés en même temps.' }]);
  // Aucun créneau : « vols à la fois » joue.
  assert.deepEqual(J.nonJoues(handling({ creneaux: [] })), []);
  // Calculés au plus juste (24 h/24) : ni « vols à la fois », ni les créneaux saisis.
  const calcules = J.nonJoues(handling({ handling24h: true, chauffeurs: { long: 2, court: 1, mode: 'calcules' } }));
  assert.deepEqual(calcules.map(x => [x.cle, x.libelle, x.valeur]), [['simultanes', 'Tournées en même temps', '3'], ['creneaux', 'Créneaux de chauffeurs', '03:00–11:00 : 6 ; 11:00–20:00 : 3']]);
  assert.equal(calcules[1].raison, 'Les chauffeurs sont calculés au plus juste : les créneaux saisis ne comptent pas.');
  assert.equal(calcules[0].raison, 'Les chauffeurs sont comptés : c’est leur nombre qui limite les tournées menées en même temps.');
  // « Calculés » ne vaut qu'en 24 h/24 : sinon les créneaux saisis jouent.
  assert.deepEqual(cles(J.nonJoues(handling({ chauffeurs: { long: 2, court: 1, mode: 'calcules' } }))), ['simultanes']);
  // Jamais réglé : rien à dire.
  assert.deepEqual(J.nonJoues(handling({ simultanes: undefined })), []);
});

test('une équipe qui prépare, une équipe d’appui, une équipe inconnue : rien ne se masque ; la lecture ne change rien', () => {
  assert.deepEqual(J.nonJoues({ id: 'm', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '03:00', jour: 0, personnes: 8, lots: [['NORD/BC']] }), []);
  assert.deepEqual(J.nonJoues({ id: 'x', type: 'appui' }), []);
  assert.deepEqual(J.nonJoues(null), []);
  for (const a of [plonge({ parVol: true }), robot({ debits: { 'NORD/YC': 450, 'SUD/YC': 380 } }), dispo(), handling()]) {
    const avant = JSON.stringify(a); J.nonJoues(a);
    assert.equal(JSON.stringify(a), avant, a.nom + ' : la valeur masquée est gardée');
  }
});

test('la ligne sous la fiche : « n réglages ne jouent pas ici », dépliée en champs grisés avec leur raison ; rien quand tout joue', () => {
  assert.equal(J.ligne([]), '');
  const un = J.ligne(J.nonJoues(handling()));
  assert.match(un, /^<details class="nj" data-nj="1"><summary>1 réglage ne joue pas ici<\/summary>/);
  assert.match(un, /<label class="nj-champ">Vols en même temps<input value="3" disabled aria-describedby="[^"]+"><\/label>/);
  assert.match(un, /<span class="nj-raison" id="[^"]+">Les chauffeurs sont comptés/);
  const trois = J.ligne(J.nonJoues(plonge({ parVol: true })));
  assert.match(trois, /<summary>3 réglages ne jouent pas ici<\/summary>/);
  assert.equal((trois.match(/<li /g) || []).length, 3);
  assert.equal((trois.match(/ disabled /g) || []).length, 3, 'des champs grisés : on les lit, on ne les change pas');
  // Un nom venu d'un fichier est échappé.
  const mechant = J.ligne(J.nonJoues(plonge({ parVol: true, plafond: 0, tunnels: [{ nom: '<img src=x onerror=alert(1)>"', debit: 300, personnes: 1, actif: true }] })));
  assert.doesNotMatch(mechant, /<img/);
  assert.match(mechant, /&lt;img src=x onerror=alert\(1\)&gt;&quot;/);
  // Deux fiches de la même équipe sur la page : des identifiants distincts.
  const a = J.ligne(J.nonJoues(handling()), 'h'), b = J.ligne(J.nonJoues(handling()), 'h');
  assert.notEqual(/id="([^"]+)"/.exec(a)[1], /id="([^"]+)"/.exec(b)[1]);
});

test('un service travaille-t-il par compagnie ? Le handling, la plonge par vol, un service à une équipe par compagnie : ses minutes par compagnie', () => {
  const etat = { ateliers: [handling(), plonge({ parVol: true }), plonge({ id: 'pl2', nom: 'Plonge soir', parVol: true, durees: { '*': 30, NORD: 45 } }),
    robot(), { id: 'm', nom: 'Montage', service: 'prepa', type: 'manuel', lots: [['NORD/BC']] }, dispo(),
    { id: 'ad', nom: 'Appui quais', service: 'quais', type: 'appui' }],
    categories: { armement: [{ id: 'ARM', nom: 'Armement', minutes: { '*': 12, SUD: 18 } }] } };
  assert.deepEqual(J.parCompagnie('quais', etat), { genre: 'handling', equipe: 'h', nom: 'Quais', unite: 'min par vol',
    raison: 'Le handling travaille par vol : son temps se règle par compagnie, dans sa fiche.',
    lignes: [{ cie: '*', minutes: 25 }, { cie: 'NORD', minutes: 40 }] });
  const pl = J.parCompagnie('plonge', etat);
  assert.deepEqual([pl.genre, pl.equipe, pl.unite, pl.lignes], ['plonge', 'pl', 'min par vol et par tunnel', [{ cie: '*', minutes: 30 }, { cie: 'NORD', minutes: 45 }]]);
  assert.equal(pl.raison, 'La plonge lave par vol : son temps se règle par compagnie, dans sa fiche.');
  const ar = J.parCompagnie('armement', etat);
  assert.deepEqual([ar.genre, ar.equipe, ar.nom, ar.lignes], ['categories', null, 'Armement', [{ cie: '*', minutes: 12 }, { cie: 'SUD', minutes: 18 }]]);
  assert.equal(ar.raison, 'Ce service a une équipe par compagnie : son temps se règle par compagnie, dans sa fiche.');
  // Un service qui prépare par classe, un robot, une mise à disposition, un service sans équipe : non.
  for (const s of ['prepa', 'decontam', 'inconnu']) assert.equal(J.parCompagnie(s, etat), null, s);
  // Une plonge au débit ne travaille pas par compagnie ; un service mêlé (une équipe qui prépare et un handling) non plus.
  assert.equal(J.parCompagnie('plonge', { ateliers: [plonge({ parVol: false })] }), null);
  assert.equal(J.parCompagnie('quais', { ateliers: [handling(), { id: 'm', service: 'quais', type: 'manuel', lots: [] }] }), null);
  assert.equal(J.parCompagnie('quais', null), null);
});

test('« Liens entre services » ne sert qu’aux commandes sans chemin : au menu si une commande au moins n’en a pas', () => {
  const classes = [{ id: 'NORD/BC' }, { id: 'SUD/YC' }];
  const avec = new Map([['NORD/BC', { services: new Set(['cuisine']) }], ['SUD/YC', { services: new Set(['prepa']) }]]);
  assert.equal(J.liensUtiles(classes, avec), false, 'toutes les commandes ont un chemin');
  assert.equal(J.liensUtiles(classes, new Map([['NORD/BC', { services: new Set(['cuisine']) }]])), true, 'SUD/YC n’a pas de chemin');
  assert.equal(J.liensUtiles(classes, new Map()), true);
  assert.equal(J.liensUtiles([], new Map()), false, 'aucune commande : la page ne sert à personne');
  assert.equal(J.liensUtiles(null, null), false);
  // Comme le moteur le lit : routesDesClasses ne rend une route qu'aux commandes qui ont un chemin.
  const st = { parcours: [{ id: 'p', nom: 'Complet', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }], parcoursClasse: { 'NORD/BC': 'p' } };
  const routes = P.routesDesClasses(classes, st);
  assert.equal(routes.has('NORD/BC'), true); assert.equal(routes.has('SUD/YC'), false);
  assert.equal(J.liensUtiles(classes, routes), true);
});

test('une valeur masquée est gardée par la validation, et ne change pas la journée : une plonge au débit avec ses durées par compagnie', () => {
  const A = require('../ateliers.js'), F = require('./plan-rejoue-fictif.cjs');
  const unite = durees => { const s = F.sauvegardeFictive();
    for (const a of s.contenu['ory-ateliers-v1'].ateliers) if (a.type === 'lavage') { delete a.parVol; if (durees) a.durees = { '*': 30, NORD: 45 }; else delete a.durees; }
    return s; };
  // La validation (celle de la page et des outils) garde les durées d'une plonge au débit ; sans durée, elle n'en invente pas.
  const plonges = s => A.valider(s.contenu['ory-ateliers-v1']).ateliers.filter(a => a.type === 'lavage');
  for (const a of plonges(unite(true))) { assert.equal(a.parVol, undefined, a.nom); assert.deepEqual(a.durees, { '*': 30, NORD: 45 }, a.nom + ' : ses durées sont gardées'); }
  for (const a of plonges(unite(false))) assert.equal('durees' in a, false, a.nom + ' : rien à garder');
  // Par vol, comme avant : ses durées, 30 minutes pour toutes à défaut.
  const parVol = F.sauvegardeFictive(); for (const a of parVol.contenu['ory-ateliers-v1'].ateliers) if (a.type === 'lavage') delete a.durees;
  for (const a of plonges(parVol)) assert.deepEqual([a.parVol, a.durees], [true, { '*': 30 }], a.nom);
  // Le calcul ne lit pas ces durées quand la plonge lave au débit : la journée est la même, champ par champ.
  const avec = F.heureDuPicAttendue(unite(true), F.volsCsv()), sans = F.heureDuPicAttendue(unite(false), F.volsCsv());
  assert.equal(JSON.stringify(avec.resultat), JSON.stringify(sans.resultat), 'le résultat de la journée');
  assert.equal(JSON.stringify(avec.k), JSON.stringify(sans.k), 'ses indicateurs');
  assert.ok(avec.resultat.ok && avec.resultat.lots.length > 0, 'une vraie journée');
  // Et l'équipe le dit : ses durées ne jouent pas.
  assert.deepEqual(J.nonJoues(plonges(unite(true))[0]).map(x => x.cle), ['durees', 'tunnel-vitesse:1']);
});

test('un service est une mise à disposition quand toutes ses équipes en sont : il n’a pas de temps par vol (évolution 19 c)', () => {
  const etat = { ateliers: [dispo(), dispo({ id: 'lg2', nom: 'Légumerie soir' }), { id: 'ap', nom: 'Appui légumerie', service: 'decontam', type: 'appui' },
    { id: 'mg', nom: 'Magasin', service: 'magasin', type: 'dispo', permanent: true }, { id: 'mgp', nom: 'Magasin prépare', service: 'magasin', type: 'manuel', lots: [] },
    robot(), handling(), { id: 'seul', nom: 'Appui seul', service: 'dotation', type: 'appui' }] };
  assert.equal(J.miseADisposition('decontam', etat), true, 'deux mises à disposition et une équipe d’appui');
  assert.equal(J.miseADisposition('magasin', etat), false, 'une équipe y prépare : il a des temps par vol');
  for (const s of ['prepa', 'quais', 'dotation', 'inconnu']) assert.equal(J.miseADisposition(s, etat), false, s);
  assert.equal(J.miseADisposition('decontam', null), false);
  // Ni l'un ni l'autre à la fois : une mise à disposition ne « travaille pas par compagnie ».
  assert.equal(J.parCompagnie('decontam', etat), null);
});
