/* Évolution 16 (c) — les ateliers et les personnes de la vue en direct (v1),
 * sans navigateur. La scène respecte les réglages de la simulation : un atelier
 * réglé = un îlot dans la zone de son service ; chaque atelier montre exactement
 * ses personnes, à ses horaires, dans l'état que disent les indicateurs de
 * charge (au travail, sans travail, en pause, en appui). Ce sur quoi il
 * travaille est son « poste de travail » (tables, trolleys, machine,
 * rayonnages, aucun), un réglage gardé avec les ateliers, qui ne change aucun
 * calcul. Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../direct-scene.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = x => (typeof x === 'string' ? JSON.parse(x) : x);
/** La journée d'une sauvegarde fictive : son résultat, ses arguments, ses indicateurs, ses réglages, son site, ses îlots. */
function journeeDe(sauvegarde = F.sauvegardeFictive()) {
  const vols = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
  const args = J.argumentsDeLaJournee(sauvegarde, vols), r = P.simuler(args), k = I.journee(r, args), etat = lire(sauvegarde.contenu['ory-ateliers-v1']);
  const site = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, regime: args.regime });
  const personnes = new Map(r.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, etat.ateliers, id => personnes.get(id));
  return { r, args, k, etat, site, ilots, scene: { site, ilots }, journee: { r, k } };
}
/** La sauvegarde fictive, ses ateliers modifiés par `f(ateliers, etat, sauvegarde)`. */
function sauvegardeAvec(f) {
  const s = F.sauvegardeFictive(), texte = typeof s.contenu['ory-ateliers-v1'] === 'string', etat = lire(s.contenu['ory-ateliers-v1']);
  f(etat.ateliers, etat, s);
  s.contenu['ory-ateliers-v1'] = texte ? JSON.stringify(etat) : etat;
  return s;
}
const U = journeeDe();
const zone = (site, id) => site.zones.find(z => z.id === id);
const dans = (p, z, jeu = 1e-9) => p.x >= z.x - jeu && p.x <= z.x + z.w + jeu && p.y >= z.y - jeu && p.y <= z.y + z.h + jeu;
const compter = (l, f) => l.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});

test('un atelier réglé = un îlot : le nombre d’îlots de chaque service égale le nombre de ses ateliers', () => {
  const { etat, ilots, site } = U;
  assert.equal(ilots.length, etat.ateliers.length);
  assert.deepEqual(ilots.map(i => i.atelier), etat.ateliers.map(a => a.id), 'dans l’ordre des réglages');
  assert.deepEqual(compter(ilots, i => i.service), compter(etat.ateliers, a => a.service));
  // Chacun dans la zone de son service ; l'atelier robot à sa ligne, dans la zone FOOD ; la préparation et le montage aussi.
  for (const i of ilots) {
    const z = zone(site, i.zone);
    assert.ok(z.services.includes(i.service) || (i.poste === 'machine' && z.id === 'food'), i.atelier + ' dans la zone de son service');
    assert.ok(i.places.every(p => dans(p, z)) && i.tables.every(t => dans({ x: t.x, y: t.y }, z) && dans({ x: t.x + t.w, y: t.y + t.d }, z)), i.atelier + ' : ses places et ses tables dans sa zone');
    assert.ok(i.places.length >= Math.max(1, i.personnes), i.atelier + ' : une place par personne');
    assert.equal(i.nom, etat.ateliers.find(a => a.id === i.atelier).nom);
  }
  assert.deepEqual([ilots.find(i => i.atelier === 'rb').zone, ilots.find(i => i.atelier === 'pr').zone, ilots.find(i => i.atelier === 'mo').zone], ['food', 'food', 'food']);
  // Les mêmes réglages, les mêmes îlots.
  assert.equal(JSON.stringify(journeeDe().ilots), JSON.stringify(ilots));
});

test('ajouter un atelier dans les réglages ajoute un îlot ; en retirer un le retire', () => {
  const plus = journeeDe(sauvegardeAvec(l => l.push({ ...l.find(a => a.id === 'cu2'), id: 'cu3', nom: 'Cuisine de renfort', lots: [] })));
  assert.equal(plus.ilots.length, U.ilots.length + 1);
  assert.deepEqual(plus.ilots.filter(i => i.service === 'cuisine').map(i => i.atelier), ['cu1', 'cu2', 'cu3']);
  assert.equal(plus.ilots.find(i => i.atelier === 'cu3').zone, 'cuisine');
  const moins = journeeDe(sauvegardeAvec(l => l.splice(l.findIndex(a => a.id === 'cu2'), 1)));
  assert.deepEqual(moins.ilots.filter(i => i.service === 'cuisine').map(i => i.atelier), ['cu1']);
  assert.equal(moins.ilots.length, U.ilots.length - 1);
});

test('à chaque créneau, les personnages de chaque atelier sont ses présents aux indicateurs, et leur répartition par état aussi', () => {
  const { scene, journee, k } = U, ETATS = ['auTravail', 'enPause', 'sansTravail', 'enAppui'];
  let compares = 0, presents = 0;
  // Tous les créneaux de la journée (de la veille au lendemain), au début, au milieu et à la fin de chacun.
  for (let debut = -1440; debut < 2 * 1440; debut += 15) for (const t of [debut, debut + 7, debut + 14.5]) {
    const lus = E.etatA(journee, t), personnes = D.personnages(scene, journee, t).filter(p => !p.hors);
    for (const e of k.equipes) {
      const p = lus.equipes[e.id], siens = personnes.filter(x => x.atelier === e.id), mot = e.id + ' à ' + P.hhmm(t);
      assert.equal(siens.length, p.presents, mot + ' : ses présents');
      assert.deepEqual(ETATS.map(m => siens.filter(x => x.etat === m).length), ETATS.map(m => p[m]), mot + ' : par état');
      // Les présents sont ceux du créneau des indicateurs (des personnes entières).
      if (e.creneaux.presents) assert.equal(p.presents, Math.round(E.valeurA(e.creneaux.presents, t - e.jour * 1440)), mot);
      compares++; presents += p.presents;
    }
  }
  assert.ok(compares > 5000 && presents > 2000, compares + ' comparaisons, ' + presents + ' personnes');
  // Deux personnes dans un atelier de deux personnes : jamais un nombre arrondi ou « représentatif ».
  const cu1 = D.personnages(scene, journee, -120).filter(p => p.atelier === 'cu1' && !p.hors);
  assert.equal(cu1.length, 2); assert.equal(U.r.ateliers.find(a => a.id === 'cu1').personnes, 2);
});

test('la couleur dit l’état ; à son poste, en pause dans l’aire de pause, en chemin entre les deux', () => {
  const { scene, journee, site, ilots } = U, pause = site.pause;
  assert.deepEqual(D.TON_ETAT, { auTravail: 'travail', sansTravail: 'attente', enAppui: 'neutre', enPause: 'neutre', enChemin: 'neutre' });
  const a = (t, id) => D.personnages(scene, journee, t).filter(p => p.atelier === id);
  const mo = ilots.find(i => i.atelier === 'mo'), z = zone(site, mo.zone);
  // Le montage (10 personnes) arrive à 03:00 : au travail à leur poste, à l'accent.
  const travail = a(190, 'mo');
  assert.deepEqual([travail.length, compter(travail, p => p.ton)], [10, { travail: 10 }]);
  travail.forEach((p, i) => assert.deepEqual([p.x, p.y], [D.placeDe(mo, i).x, D.placeDe(mo, i).y], 'à sa place'));
  // Deux minutes avant, il arrive : en chemin depuis le bord de sa zone (la porte, sur le couloir), pas encore compté présent.
  const arrive = a(178.5, 'mo');
  assert.deepEqual([arrive.length, arrive.every(p => p.hors && p.enChemin && p.ton === 'neutre' && p.etat === 'arrive')], [10, true]);
  assert.ok(arrive.every((p, i) => dans(p, z) && Math.hypot(p.x - z.porte.x, p.y - z.porte.y) < Math.hypot(D.placeDe(mo, i).x - z.porte.x, D.placeDe(mo, i).y - z.porte.y) + 1e-9), 'entre la porte et sa place');
  assert.deepEqual(a(178, 'mo').map(p => [p.x, p.y]), Array.from({ length: 10 }, () => [z.porte.x, z.porte.y]), 'au bord de la zone');
  assert.equal(a(177.9, 'mo').length, 0, 'avant : personne');
  // Sa pause de 06:00 à 06:15 : en chemin deux minutes, dans l'aire de pause, en chemin pour revenir ; au neutre.
  const dedans = p => p.x >= pause.x && p.x <= pause.x + pause.w && p.y >= pause.y && p.y <= pause.y + pause.h;
  const depart = a(360.5, 'mo'), enPause = a(367, 'mo'), retour = a(374, 'mo'), apres = a(375, 'mo');
  assert.ok(depart.every(p => p.etat === 'enPause' && p.enChemin && !p.hors && p.ton === 'neutre'), 'elle part en pause : en chemin');
  assert.ok(enPause.every(p => p.etat === 'enPause' && !p.enChemin && dedans(p) && p.ton === 'neutre') && enPause.length === 10, 'dans l’aire de pause');
  assert.equal(new Set(enPause.map(p => p.x + '|' + p.y)).size, 10, 'chacune sa place');
  assert.ok(retour.every(p => p.enChemin && p.etat === 'enPause'), 'elle en revient');
  assert.deepEqual(compter(apres, p => p.ton), { travail: 10 });
  // Sans travail : à son poste, à la couleur d'avertissement.
  const cuisine = a(190, 'cu1');
  assert.deepEqual([cuisine.length, compter(cuisine, p => p.etat + '/' + p.ton)], [2, { 'sansTravail/attente': 2 }]);
  // À son départ, elle regagne le bord de sa zone dans les deux minutes qui suivent, sans être comptée présente.
  const fin = U.k.equipes.find(e => e.id === 'ar'), dernier = fin.creneaux.presents.debut + fin.creneaux.presents.valeurs.length * 15;
  const part = a(dernier + 1, 'ar');
  assert.deepEqual([part.length, part[0].etat, part[0].hors, part[0].enChemin], [1, 'part', true, true]);
  assert.equal(a(dernier + 2.1, 'ar').length, 0);
});

test('une équipe d’appui, une mise à disposition : présentes, au neutre', () => {
  const { scene, journee, etat } = U, appui = etat.ateliers.find(a => a.type === 'appui'), dispo = etat.ateliers.find(a => a.type === 'dispo' && a.id === 'mag');
  const quand = e => { const c = U.k.equipes.find(x => x.id === e.id); return c.creneaux.presents.debut + c.jour * 1440 + 20; };
  for (const e of [appui, dispo]) {
    const l = D.personnages(scene, journee, quand(e)).filter(p => p.atelier === e.id && !p.hors);
    assert.equal(l.length, U.r.ateliers.find(a => a.id === e.id).personnes, e.id + ' : ses personnes');
    assert.deepEqual(compter(l, p => p.etat + '/' + p.ton), { 'enAppui/neutre': l.length }, e.id);
  }
});

test('une équipe en heures sup reste après son horaire', () => {
  // Le montage part à 08:00 (cinq heures de présence) sans avoir fini : avec les heures sup permises, il reste.
  const modele = (s, sup) => { const m = lire(s.contenu['ory-modele-v1']); if (sup) m.heuresSup = { actif: true, plafond: 240 }; s.contenu['ory-modele-v1'] = typeof s.contenu['ory-modele-v1'] === 'string' ? JSON.stringify(m) : m; };
  const court = sup => journeeDe(sauvegardeAvec((l, _e, s) => { l.find(a => a.id === 'mo').regime = { actif: true, presence: 300 }; modele(s, sup); }));
  const sans = court(false), avec = court(true), v = avec.r.ateliers.find(a => a.id === 'mo');
  assert.ok(v.heuresSup > 0 && v.fin > 480, 'il finit après 08:00, en heures sup (' + P.hhmm(v.fin) + ')');
  const a = (u, t) => D.personnages(u.scene, u.journee, t).filter(p => p.atelier === 'mo' && !p.hors);
  // À 08:20, vingt minutes après son horaire : il est encore là, au travail ; sans heures sup, il est parti.
  assert.ok(a(avec, 500).length > 0 && a(avec, 500).every(p => p.etat === 'auTravail'), 'en heures sup : encore là, au travail');
  assert.equal(a(sans, 500).length, 0, 'sans heures sup : parti à son horaire');
  assert.equal(a(avec, 500).length, E.personnesDe(avec.k.equipes.find(e => e.id === 'mo'), 500).presents);
  // Il n'est plus là une fois son dernier lot fini.
  assert.equal(a(avec, Math.ceil(v.fin / 15) * 15 + 16).length, 0);
});

test('le poste de travail : cinq choix ; une table pour deux personnes, une au moins ; aucun trolley n’a de table', () => {
  assert.deepEqual(D.POSTES, ['tables', 'trolleys', 'machine', 'rayonnages', 'aucun']);
  // Un atelier « tables » de cinq personnes a trois tables ; les personnes sont debout autour.
  const cinq = D.formeIlot('tables', 5);
  assert.deepEqual([cinq.tables.length, cinq.places.length, cinq.trolleys.length], [3, 5, 0]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 0].map(D.tablesPour), [1, 1, 2, 2, 3, 3, 1]);
  for (const p of cinq.places) assert.ok(cinq.tables.some(t => p.x >= t.x && p.x <= t.x + t.w && (Math.abs(p.y - t.y) < 0.6 || Math.abs(p.y - (t.y + t.d)) < 0.6)), 'debout contre une table');
  // Un atelier « trolleys » : pas de table ; chaque personne à côté d'un trolley.
  const trolleys = D.formeIlot('trolleys', 5);
  assert.deepEqual([trolleys.tables.length, trolleys.places.length, trolleys.trolleys.length], [0, 5, 5]);
  trolleys.places.forEach((p, i) => assert.ok(Math.hypot(p.x - trolleys.trolleys[i].x, p.y - trolleys.trolleys[i].y) < 0.8, 'à côté de son trolley'));
  // « aucun » : les personnes seules ; « rayonnages » hors du magasin : ses propres rangs, les personnes dans l'allée.
  assert.deepEqual([D.formeIlot('aucun', 4).tables.length, D.formeIlot('aucun', 4).places.length, D.formeIlot('aucun', 4).rangs.length], [0, 4, 0]);
  assert.deepEqual([D.formeIlot('rayonnages', 4).rangs.length, D.formeIlot('rayonnages', 4).places.length, D.formeIlot('rayonnages', 4).tables.length], [2, 4, 0]);
  // Dans la scène : le montage (8 personnes au réglage, 10 calculées) a cinq tables ; l'armement, aux trolleys, aucune.
  const ilot = id => U.ilots.find(i => i.atelier === id);
  assert.deepEqual([ilot('mo').poste, ilot('mo').personnes, ilot('mo').tables.length], ['tables', 10, 5]);
  assert.deepEqual([ilot('ar').poste, ilot('ar').tables.length, ilot('ar').trolleys.length], ['trolleys', 0, 1]);
  // À une machine : le robot à sa ligne, la plonge à ses tunnels, les personnes autour ; au magasin : entre les rangées.
  assert.deepEqual([ilot('rb').poste, ilot('rb').machines, ilot('rb').tables.length], ['machine', 1, 0]);
  assert.deepEqual([ilot('pl1').poste, ilot('pl1').tables.length, ilot('pl1').machines >= 1], ['machine', 0, true]);
  assert.deepEqual([ilot('mag').poste, ilot('mag').tables.length, ilot('mag').rangs.length], ['rayonnages', 0, 0]);
  const ligne = zone(U.site, 'food').lignes[0];
  for (const p of ilot('rb').places) assert.ok(p.x >= ligne.x - 1.5 && p.x <= ligne.x + ligne.w + 1.5 && p.y >= ligne.y - 1.5 && p.y <= ligne.y + ligne.h + 1.5, 'autour de la ligne');
  // Les tables et les rangs à dessiner sont ceux des îlots.
  const meubles = D.meublesDe(U.ilots);
  assert.equal(meubles.filter(m => m.quoi === 'table').length, U.ilots.reduce((n, i) => n + i.tables.length, 0));
  assert.ok(D.decor(U.site, U.ilots).objets.filter(o => o.quoi === 'table').length === meubles.filter(m => m.quoi === 'table').length);
});

test('les défauts : une machine pour un robot ou un lavage, des trolleys à l’armement et à la dotation, des rayonnages au magasin, des tables ailleurs', () => {
  const d = (type, service) => D.posteParDefaut({ type, service });
  assert.deepEqual([d('robot', 'prepa'), d('lavage', 'plonge'), d('robot', 'cuisine'), d('lavage', 'armement')], ['machine', 'machine', 'machine', 'machine']);
  assert.deepEqual([d('manuel', 'armement'), d('manuel', 'dotation'), d('appui', 'dotation')], ['trolleys', 'trolleys', 'trolleys']);
  assert.deepEqual([d('dispo', 'magasin'), d('manuel', 'magasin')], ['rayonnages', 'rayonnages']);
  assert.deepEqual([d('manuel', 'cuisine'), d('manuel', 'preparation'), d('manuel', 'prepa'), d('appui', 'plonge'), d('handling', 'quais'), d('dispo', 'decontam')], ['tables', 'tables', 'tables', 'tables', 'tables', 'tables']);
  // Le réglage l'emporte ; une valeur inconnue ne compte pas.
  assert.deepEqual([D.posteDe({ type: 'manuel', service: 'cuisine', poste: 'trolleys' }), D.posteDe({ type: 'robot', service: 'prepa', poste: 'aucun' }), D.posteDe({ type: 'manuel', service: 'cuisine', poste: 'chaises' })], ['trolleys', 'aucun', 'tables']);
  // Dans la scène fictive, sans réglage : les défauts.
  assert.deepEqual(Object.fromEntries(U.ilots.map(i => [i.atelier, i.poste])), { leg: 'tables', mag: 'rayonnages', cu1: 'tables', cu2: 'tables', pr: 'tables', mo: 'tables', mo2: 'tables', rb: 'machine',
    ar: 'trolleys', do: 'trolleys', h: 'tables', pl1: 'machine', pl2: 'machine', mob: 'tables' });
});

test('le réglage se garde avec les ateliers ; une sauvegarde d’avant, sans lui, se restaure et prend les défauts', () => {
  const etat = lire(F.sauvegardeFictive().contenu['ory-ateliers-v1']);
  // Une sauvegarde d'avant : aucun atelier n'a de poste — rien n'est inventé, la scène prend les défauts.
  const avant = A.valider(etat);
  assert.ok(avant.ateliers.every(a => !('poste' in a)));
  assert.deepEqual(avant.ateliers.map(D.posteDe), etat.ateliers.map(D.posteParDefaut));
  // Avec le réglage : gardé tel quel, relu tel quel ; une valeur inconnue est retirée.
  const regle = A.valider({ ...etat, ateliers: etat.ateliers.map(a => (a.id === 'cu1' ? { ...a, poste: 'trolleys' } : a.id === 'mo' ? { ...a, poste: 'aucun' } : a.id === 'pr' ? { ...a, poste: 'chaises' } : a)) });
  assert.deepEqual(Object.fromEntries(regle.ateliers.filter(a => 'poste' in a).map(a => [a.id, a.poste])), { cu1: 'trolleys', mo: 'aucun' });
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(regle))), regle);
  // La scène suit le réglage : la cuisine aux trolleys n'a plus de table, le montage sans poste non plus.
  const u = journeeDe(sauvegardeAvec(l => { l.find(a => a.id === 'cu1').poste = 'trolleys'; l.find(a => a.id === 'mo').poste = 'aucun'; }));
  const ilot = id => u.ilots.find(i => i.atelier === id);
  assert.deepEqual([ilot('cu1').poste, ilot('cu1').tables.length, ilot('cu1').trolleys.length, ilot('mo').poste, ilot('mo').tables.length], ['trolleys', 0, 2, 'aucun', 0]);
  assert.equal(u.ilots.length, U.ilots.length, 'toujours un îlot par atelier');
});

test('changer le poste de travail ne change ni le résultat de la journée ni les indicateurs', () => {
  const POSTES = ['trolleys', 'aucun', 'rayonnages', 'machine', 'tables'];
  const u = journeeDe(sauvegardeAvec(l => l.forEach((a, i) => { a.poste = POSTES[i % POSTES.length]; })));
  // Le résultat de la journée et ses indicateurs, champ par champ (leur JSON : le résultat porte aussi des fonctions).
  assert.deepEqual(JSON.parse(JSON.stringify(u.r)), JSON.parse(JSON.stringify(U.r)), 'le résultat de la journée, champ par champ');
  assert.deepEqual(JSON.parse(JSON.stringify(u.k)), JSON.parse(JSON.stringify(U.k)), 'les indicateurs, champ par champ');
  assert.equal(JSON.stringify(u.r), JSON.stringify(U.r));
  // Le site généré ne change pas non plus : seuls les îlots suivent le réglage.
  assert.deepEqual(u.site, U.site);
  // Les personnes sont les mêmes, à d'autres postes.
  assert.equal(D.personnages(u.scene, u.journee, 190).length, D.personnages(U.scene, U.journee, 190).length);
  assert.notDeepEqual(u.ilots.map(i => i.poste), U.ilots.map(i => i.poste));
});

test('des îlots qui ne tiennent pas se resserrent : aucun n’est supprimé, aucun ne déborde sur la zone voisine', () => {
  // Douze équipes de plus dans la cuisine : sa zone grandit avec elles (la place de ses ateliers), et ses quatorze îlots y sont.
  const grande = journeeDe(sauvegardeAvec(l => { for (let i = 0; i < 12; i++) l.push({ ...l.find(a => a.id === 'cu1'), id: 'cx' + i, nom: 'Cuisine ' + i, personnes: 6, lots: [] }); }));
  assert.equal(grande.ilots.filter(i => i.service === 'cuisine').length, 14);
  assert.ok(zone(grande.site, 'cuisine').surface > zone(U.site, 'cuisine').surface);
  // La même unité dans un site où la cuisine n'a qu'une petite zone (6 m sur 7) : ses quatorze îlots s'y resserrent.
  const petite = { ...grande.site, zones: grande.site.zones.map(z => (z.id === 'cuisine' ? { ...z, w: 6, h: 7, porte: { x: z.x + 3, y: z.bande === 0 ? z.y + 7 : z.y } } : z)) };
  const personnes = new Map(grande.r.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(petite, grande.etat.ateliers, id => personnes.get(id));
  const u = { ...grande, site: petite, ilots, scene: { site: petite, ilots } };
  const siens = u.ilots.filter(i => i.service === 'cuisine'), z = zone(u.site, 'cuisine');
  assert.equal(siens.length, 14, 'aucun n’est supprimé');
  assert.ok(siens.every(i => i.echelle < 0.6), 'ils se resserrent (' + siens[0].echelle.toFixed(2) + ')');
  assert.equal(new Set(siens.map(i => i.echelle)).size, 1, 'tous ensemble');
  for (const i of siens) {
    assert.ok(i.x >= z.x - 1e-9 && i.y >= z.y - 1e-9 && i.x + i.w <= z.x + z.w + 1e-9 && i.y + i.h <= z.y + z.h + 1e-9, i.atelier + ' reste dans sa zone');
    assert.ok(i.places.every(p => dans(p, z)) && i.places.length >= 1);
  }
  // Les personnes aussi restent dans leur zone (ou dans l'aire de pause, ou en chemin vers elle).
  for (const t of [-120, 190, 400, 700]) for (const p of D.personnages(u.scene, u.journee, t)) {
    if (p.etat === 'enPause') continue;
    assert.ok(dans(p, zone(u.site, p.zone), 1.2), p.atelier + ' à ' + P.hhmm(t));
  }
  // Dans toute l'unité : les places de chaque îlot sont dans sa zone.
  for (const i of U.ilots) assert.ok(i.places.every(p => dans(p, zone(U.site, i.zone))), i.atelier);
});
