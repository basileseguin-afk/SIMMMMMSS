/* Évolution 20 (a) — les zones de la vue en direct : qui partage la zone de qui.
 *   — une annexe rattachée à un service (dans le plan : une annexe avec un
 *     parent, non autonome) n'a pas de zone à elle : ses équipes et ses
 *     machines sont dans la zone de son parent ; une annexe à part entière
 *     garde la sienne ;
 *   — un réglage, « partage la zone de » : deux services forment une seule
 *     zone, qui porte le nom du service choisi ; leurs équipes y gardent leurs
 *     îlots, leurs parts de surface s'additionnent ; une boucle est refusée en
 *     la nommant ;
 *   — une ligne par robot : les équipes d'un même service robot se partagent
 *     une seule ligne, même si elles sont là en même temps ; deux services
 *     robot ont chacun la leur ;
 *   — sans réglage, le site est celui d'avant, champ par champ
 *     (tests/site-avant-20.attendu.json, calculé sur le commit d'avant).
 * Sans navigateur : moteur/site.js ne lit que des réglages. Unités fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const S = require('../moteur/site.js');
const A = require('../ateliers.js');
const D = require('../direct-scene.js');
const F = require('./plan-rejoue-fictif.cjs');
const { REGIME, atelier, T, NOMS, CHEMIN, UNITE, unitesDeReference, reglagesDe, etatDe } = require('./site-unites.cjs');
const AVANT = require('./site-avant-20.attendu.json');

const generer = (ateliers, plus = {}) => S.generer({ ateliers, noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const zone = (site, id) => site.zones.find(z => z.id === id);
const somme = (l, f) => l.reduce((n, x) => n + f(x), 0);
const proche = (a, b, mot) => assert.ok(Math.abs(a - b) < 1e-9, (mot || '') + ' : ' + a + ' ≠ ' + b);
const dans = (m, z) => m.x >= z.x - 1e-9 && m.y >= z.y - 1e-9 && m.x + m.w <= z.x + z.w + 1e-9 && m.y + m.h <= z.y + z.h + 1e-9;
const disjoints = l => l.every((a, i) => l.every((b, j) => j <= i || a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9));
/** Les règles qui tiennent toujours : les parts font 1, les surfaces le site, les bandes sont pleines, chaque zone a sa place. */
function reglesTenues(site, mot) {
  proche(somme(site.zones, z => z.part), 1, mot + ' : les parts');
  assert.ok(Math.abs(somme(site.zones, z => z.surface) - site.surface) < 1e-6, mot + ' : les surfaces');
  for (const k of [0, 1]) {
    const bande = site.zones.filter(z => z.bande === k).sort((p, q) => p.x - q.x);
    let x = 0;
    for (const z of bande) { assert.ok(Math.abs(z.x - x) < 1e-6, mot + ' : la bande ' + k + ' sans trou'); x += z.w; }
    if (bande.length) assert.ok(Math.abs(x - site.largeur) < 1e-6, mot + ' : la bande ' + k + ' remplie');
  }
  for (const z of site.zones) {
    assert.ok(z.w > 0 && z.h > 0 && z.surface + 1e-6 >= z.minimum, mot + ' : ' + z.id + ' a sa place');
    const machines = [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])];
    assert.ok(machines.every(m => m.w > 0 && m.h > 0 && dans(m, z)), mot + ' : les machines de ' + z.id + ' dans leur zone');
    assert.ok(disjoints(machines), mot + ' : les machines de ' + z.id + ' sans recouvrement');
  }
}

// Une pâtisserie et un contrôle, deux services de plus ; une ligne robotisée, annexe du montage.
const PLUS = [atelier('pa', 'patisserie', 'manuel', '04:00', 4), atelier('co', 'controle', 'manuel', '06:00', 3)];
const ROBOT = [atelier('rb', 'robot', 'robot', '03:00', 2)];

test('une annexe rattachée n’a pas de zone : ses équipes et ses machines sont dans la zone de son parent', () => {
  // Sans rattachement (le site d'avant) : la ligne robotisée a une zone à elle, en plus de sa ligne dans la production.
  const avant = generer(UNITE(ROBOT));
  assert.deepEqual([!!zone(avant, 'robot'), zone(avant, 'food').lignes.map(l => l.ateliers), zone(avant, 'food').services], [true, [['rb']], ['preparation', 'prepa']]);
  // Rattachée au montage : plus de zone à elle ; son équipe et sa ligne sont dans la production, une seule fois.
  const site = generer(UNITE(ROBOT), { parents: { robot: 'prepa' } });
  assert.equal(zone(site, 'robot'), undefined);
  assert.deepEqual(site.zones.map(z => z.id).sort(), ['armement', 'cuisine', 'food', 'magasin', 'plonge', 'quais']);
  const food = zone(site, 'food');
  assert.deepEqual([food.nom, food.role, food.services, food.ateliers], ['FOOD', 'food', ['preparation', 'prepa', 'robot'], ['pr', 'mo', 'rb']]);
  assert.deepEqual(food.lignes.map(l => l.ateliers), [['rb']]);
  assert.equal(somme(site.zones, z => (z.lignes || []).length), 1, 'une seule ligne dans tout le site');
  assert.equal(food.personnes, 4 + 10 + 2);
  reglesTenues(site, 'annexe du montage');
  // Son îlot est à sa ligne, dans la production.
  const ilot = D.ilots(site, UNITE(ROBOT)).find(i => i.atelier === 'rb');
  assert.deepEqual([ilot.zone, ilot.machines], ['food', 1]);

  // Rattachée à un service qui n'est pas la production (la cuisine) : son équipe et sa ligne sont dans la zone de la cuisine.
  const cuisine = generer(UNITE(ROBOT), { parents: { robot: 'cuisine' } }), cu = zone(cuisine, 'cuisine');
  assert.equal(zone(cuisine, 'robot'), undefined);
  assert.deepEqual([cu.nom, cu.services, cu.ateliers, cu.lignes.map(l => l.ateliers)], ['Cuisine', ['cuisine', 'robot'], ['cu', 'rb'], [['rb']]]);
  assert.deepEqual(zone(cuisine, 'food').lignes, [], 'plus de ligne dans la production');
  assert.ok(cu.lignes.every(l => dans(l, cu)));
  assert.equal(D.ilots(cuisine, UNITE(ROBOT)).find(i => i.atelier === 'rb').zone, 'cuisine');
  reglesTenues(cuisine, 'annexe de la cuisine');
  // Sans production du tout : la zone FOOD n'est plus créée pour une ligne qui est ailleurs.
  const sans = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 3), ...ROBOT], { parents: { robot: 'cuisine' } });
  assert.deepEqual(sans.zones.map(z => z.id), ['cuisine']);

  // Une annexe sans machine (une seconde salle) : ses équipes rejoignent celles de son parent, dans l'ordre des réglages.
  const salle = generer(UNITE([atelier('ar2', 'armement2', 'manuel', '05:00', 3)]), { parents: { armement2: 'armement' }, noms: { ...NOMS, armement2: 'Armement 2' } });
  assert.equal(zone(salle, 'armement2'), undefined);
  assert.deepEqual([zone(salle, 'armement').services, zone(salle, 'armement').ateliers, zone(salle, 'armement').personnes], [['armement', 'armement2'], ['ar', 'ar2'], 8]);
  // Un parent sans équipe : la zone porte son nom, avec les équipes de l'annexe.
  const seul = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 3), atelier('ar2', 'armement2', 'manuel', '05:00', 3)], { parents: { armement2: 'armement' } });
  assert.deepEqual(seul.zones.map(z => [z.id, z.nom, z.services, z.ateliers]), [['cuisine', 'Cuisine', ['cuisine'], ['cu']], ['armement', 'Armement', ['armement2'], ['ar2']]]);
});

test('une annexe à part entière garde sa zone ; le plan dit qui est rattaché à qui', () => {
  // Le plan : des services d'origine, une annexe rattachée au montage, une annexe à part entière, une annexe dont le service a été retiré.
  const base = { prepa: { nom: 'Montage' }, cuisine: { nom: 'Cuisine' }, armement: { nom: 'Armement' } };
  const plan = [{ id: 'prepa', kind: 'service' }, { id: 'armement', kind: 'service', retire: true }, { id: 'robot', kind: 'annexe', parent: 'prepa' },
    { id: 'controle', kind: 'annexe', parent: 'prepa', autonome: true }, { id: 'armement2', kind: 'annexe', parent: 'armement' },
    { id: 'perdue', kind: 'annexe', parent: 'disparu' }, { id: 'salle', kind: 'annexe', parent: 'robot' }, { id: 'stock', kind: 'room', parent: 'prepa' }, { id: 'soi', kind: 'annexe', parent: 'soi' }];
  assert.deepEqual(S.parentsDuPlan(plan, base), { robot: 'prepa', salle: 'robot' });
  assert.deepEqual(S.parentsDuPlan(null, base), {});
  assert.deepEqual(S.parentsDuPlan([], null), {});
  // Sur le plan fictif des tests : son annexe est rattachée au montage.
  const fictif = F.sauvegardeFictive().contenu['orly-plan-v3'].zones, annexe = fictif.find(z => z.kind === 'annexe');
  assert.deepEqual(S.parentsDuPlan(fictif, Object.fromEntries(fictif.filter(z => z.kind === 'service').map(z => [z.id, z]))), { [annexe.id]: 'prepa' });

  // À part entière (elle n'est pas dans `parents`) : sa zone, comme avant.
  const site = generer(UNITE([...ROBOT, ...PLUS]), { parents: S.parentsDuPlan(plan, base) });
  assert.deepEqual([zone(site, 'controle').services, zone(site, 'controle').ateliers, zone(site, 'robot')], [['controle'], ['co'], undefined]);
  // Une annexe rattachée à une annexe rattachée : toutes deux chez le service d'origine.
  const chaine = generer(UNITE([...ROBOT, atelier('sa', 'salle', 'manuel', '05:00', 1)]), { parents: { robot: 'prepa', salle: 'robot' } });
  assert.deepEqual(zone(chaine, 'food').services, ['preparation', 'prepa', 'robot', 'salle']);
});

test('deux services partagent une zone : elle porte le nom du service choisi, leurs équipes y sont, leurs parts s’additionnent', () => {
  const equipes = UNITE(PLUS), seuls = generer(equipes), site = generer(equipes, { partages: { patisserie: 'cuisine' } });
  // Sans le réglage : chacun sa zone.
  assert.ok(zone(seuls, 'patisserie') && zone(seuls, 'cuisine'));
  // Avec : une seule zone, « Cuisine », avec les équipes des deux.
  assert.equal(zone(site, 'patisserie'), undefined);
  const cu = zone(site, 'cuisine');
  assert.deepEqual([cu.id, cu.nom, cu.role, cu.services, cu.ateliers, cu.personnes], ['cuisine', 'Cuisine', 'autre', ['cuisine', 'patisserie'], ['cu', 'pa'], 10]);
  assert.equal(site.zones.length, seuls.zones.length - 1);
  // Leurs parts s'additionnent ; celles des autres ne changent pas.
  proche(cu.part, zone(seuls, 'cuisine').part + zone(seuls, 'patisserie').part, 'la part de la zone');
  for (const z of site.zones) if (z.id !== 'cuisine') proche(z.part, zone(seuls, z.id).part, 'la part de ' + z.id);
  // Avec des parts réglées : elles s'additionnent aussi.
  const reglees = generer(equipes, { partages: { patisserie: 'cuisine' }, surfaces: { patisserie: 10, cuisine: 20 } }), chacun = generer(equipes, { surfaces: { patisserie: 10, cuisine: 20 } });
  proche(zone(reglees, 'cuisine').part, zone(chacun, 'cuisine').part + zone(chacun, 'patisserie').part, 'des parts réglées');
  // Chaque équipe y garde son îlot.
  const ilots = D.ilots(site, equipes).filter(i => i.zone === 'cuisine');
  assert.deepEqual(ilots.map(i => [i.atelier, i.service]), [['cu', 'cuisine'], ['pa', 'patisserie']]);
  assert.ok(ilots.every(i => dans(i, cu)) && disjoints(ilots), 'deux îlots dans la zone, l’un à côté de l’autre');
  reglesTenues(site, 'zone partagée');
  // Le service de la zone se retrouve par l'un ou l'autre de ses services.
  assert.deepEqual([D.zoneDuService(site, 'patisserie').id, D.zoneDuService(site, 'cuisine').id], ['cuisine', 'cuisine']);

  // Dans l'autre sens : la zone porte le nom de la pâtisserie, à la place de la première des deux dans le chemin.
  const inverse = generer(equipes, { partages: { cuisine: 'patisserie' } }), pa = zone(inverse, 'patisserie');
  assert.deepEqual([pa.nom, pa.services, zone(inverse, 'cuisine')], ['Pâtisserie', ['cuisine', 'patisserie'], undefined]);
  assert.equal(inverse.zones.findIndex(z => z.id === 'patisserie'), seuls.zones.findIndex(z => z.id === 'cuisine'), 'à la place du premier de ses services dans le chemin');

  // De proche en proche : le contrôle partage la zone de la pâtisserie, qui partage celle de la cuisine — une seule zone, « Cuisine ».
  const trois = generer(equipes, { partages: { controle: 'patisserie', patisserie: 'cuisine' } });
  assert.deepEqual([zone(trois, 'cuisine').services.slice().sort(), zone(trois, 'patisserie'), zone(trois, 'controle')], [['controle', 'cuisine', 'patisserie'], undefined, undefined]);
  reglesTenues(trois, 'trois services');

  // La préparation et le montage restent réunis ; un service qui partage la zone du montage est dans la production.
  const prod = generer(equipes, { partages: { controle: 'prepa' } }), food = zone(prod, 'food');
  assert.deepEqual([food.nom, food.role, food.services, zone(prod, 'controle')], ['FOOD', 'food', ['preparation', 'prepa', 'controle'], undefined]);
  proche(food.part, zone(seuls, 'food').part + zone(seuls, 'controle').part, 'la production et le contrôle');
  // La préparation peut rejoindre un autre service : le montage reste dans la production.
  const ailleurs = generer(equipes, { partages: { preparation: 'cuisine' } });
  assert.deepEqual([zone(ailleurs, 'cuisine').services, zone(ailleurs, 'food').services], [['cuisine', 'preparation'], ['prepa']]);
  proche(zone(ailleurs, 'cuisine').part + zone(ailleurs, 'food').part, zone(seuls, 'cuisine').part + zone(seuls, 'food').part, 'la production partagée');

  // Le quai dans la zone d'un autre : cette zone est le quai (les camions y chargent) ; la plonge chez un autre y garde ses tunnels.
  const quai = generer(equipes, { partages: { quais: 'controle' } });
  assert.deepEqual([zone(quai, 'controle').role, zone(quai, 'controle').services.slice().sort(), zone(quai, 'quais')], ['quai', ['controle', 'quais'], undefined]);
  const plonge = generer(equipes, { partages: { plonge: 'controle' } });
  assert.deepEqual([zone(plonge, 'controle').role, zone(plonge, 'controle').tunnels.map(t => t.nom)], ['plonge', ['Tunnel 1', 'Tunnel 2']]);
  reglesTenues(plonge, 'la plonge chez le contrôle');

  // Un service choisi qui n'a pas d'équipe : la zone porte son nom. Un service qui n'existe plus : le réglage ne joue pas, et le site le dit.
  const sansEquipe = generer(equipes, { partages: { patisserie: 'dotation' } });
  assert.deepEqual([zone(sansEquipe, 'dotation').nom, zone(sansEquipe, 'dotation').services], ['Dotation', ['patisserie']]);
  const inconnu = generer(equipes, { partages: { patisserie: 'disparu', cuisine: 'cuisine', controle: 7 } });
  assert.deepEqual(inconnu.zones.map(z => z.id), seuls.zones.map(z => z.id));
  assert.deepEqual(inconnu.notes, [{ code: 'inconnu', service: 'patisserie', hote: 'disparu' }]);
  // Le réglage d'une annexe rattachée l'emporte sur son rattachement : elle n'a toujours pas de zone à elle.
  const annexe = generer(UNITE([...ROBOT, ...PLUS]), { parents: { robot: 'prepa' }, partages: { robot: 'controle' } });
  assert.deepEqual([zone(annexe, 'controle').services.slice().sort(), zone(annexe, 'controle').lignes.map(l => l.ateliers), zone(annexe, 'food').lignes, zone(annexe, 'robot')], [['controle', 'robot'], [['rb']], [], undefined]);
});

test('une boucle est refusée en la nommant', () => {
  // Régler « la cuisine partage la zone de la pâtisserie » quand la pâtisserie partage déjà celle de la cuisine : la boucle, nommée.
  assert.deepEqual(S.boucle({ partages: { patisserie: 'cuisine' } }, 'cuisine', 'patisserie'), ['cuisine', 'patisserie', 'cuisine']);
  assert.deepEqual(S.boucle({ partages: { patisserie: 'cuisine', controle: 'patisserie' } }, 'cuisine', 'controle'), ['cuisine', 'controle', 'patisserie', 'cuisine']);
  assert.deepEqual(S.boucle({ partages: {} }, 'cuisine', 'cuisine'), ['cuisine', 'cuisine']);
  // Par un rattachement : le montage ne peut pas partager la zone de sa propre annexe.
  assert.deepEqual(S.boucle({ parents: { robot: 'armement' } }, 'armement', 'robot'), ['armement', 'robot', 'armement']);
  // Pas de boucle : un autre service, une chaîne qui s'arrête, la production (la préparation et le montage y restent réunis).
  assert.equal(S.boucle({ partages: { patisserie: 'cuisine' } }, 'controle', 'patisserie'), null);
  assert.equal(S.boucle({ partages: { patisserie: 'cuisine' } }, 'patisserie', 'controle'), null);
  assert.equal(S.boucle({ partages: { cuisine: 'preparation' } }, 'prepa', 'cuisine'), null);
  assert.equal(S.boucle(null, 'a', 'b'), null);
  // Le réglage d'avant du service lui-même ne compte pas : on le remplace.
  assert.equal(S.boucle({ partages: { cuisine: 'patisserie' } }, 'cuisine', 'controle'), null);

  // Une sauvegarde retouchée à la main qui en porterait une : ses réglages ne jouent pas — chacun garde sa zone —, et le site la nomme.
  const equipes = UNITE(PLUS), seuls = generer(equipes), boucle = generer(equipes, { partages: { patisserie: 'cuisine', cuisine: 'patisserie' } });
  assert.deepEqual(boucle.notes, [{ code: 'boucle', services: ['cuisine', 'patisserie'] }]);
  assert.deepEqual({ ...boucle, notes: undefined }, { ...seuls, notes: undefined });
  // Un service hors de la boucle qui partage la zone de l'un d'eux y reste ; une boucle de trois.
  const hors = generer(equipes, { partages: { patisserie: 'cuisine', cuisine: 'patisserie', controle: 'cuisine' } });
  assert.deepEqual([zone(hors, 'cuisine').services.slice().sort(), !!zone(hors, 'patisserie'), hors.notes], [['controle', 'cuisine'], true, [{ code: 'boucle', services: ['cuisine', 'patisserie'] }]]);
  const trois = generer(equipes, { partages: { patisserie: 'cuisine', cuisine: 'controle', controle: 'patisserie' } });
  assert.deepEqual(trois.notes, [{ code: 'boucle', services: ['controle', 'patisserie', 'cuisine'] }]);   // du premier dans l'ordre des identifiants, en suivant les réglages
  assert.deepEqual(trois.zones.map(z => z.id), seuls.zones.map(z => z.id));
  // Avec un rattachement : c'est le réglage qui est refusé, l'annexe reste chez son parent.
  const annexe = generer(UNITE(ROBOT), { parents: { robot: 'armement' }, partages: { armement: 'robot' } });
  assert.deepEqual([zone(annexe, 'armement').services, zone(annexe, 'robot'), annexe.notes], [['armement', 'robot'], undefined, [{ code: 'boucle', services: ['armement', 'robot'] }]]);
  // Sans rien à dire, le site n'a pas de notes.
  assert.equal('notes' in seuls, false);
});

test('une ligne par robot : les équipes d’un même service robot se partagent une ligne, même en même temps ; deux robots, deux lignes', () => {
  const lignes = site => site.zones.flatMap(z => (z.lignes || []).map(l => [z.id, l.ateliers]));
  // Deux équipes du même robot qui se chevauchent (03:00 → 11:00 et 06:00 → 14:00) : une seule ligne, pour les deux.
  const chevauche = generer(UNITE([atelier('rb1', 'robot', 'robot', '03:00', 2), atelier('rb2', 'robot', 'robot', '06:00', 2)]), { parents: { robot: 'prepa' } });
  assert.deepEqual(lignes(chevauche), [['food', ['rb1', 'rb2']]]);
  // Qui se succèdent : une ligne, comme avant ; dans l'ordre de leur arrivée.
  const suite = generer(UNITE([atelier('rb2', 'robot', 'robot', '11:00', 2), atelier('rb1', 'robot', 'robot', '03:00', 2)]), { parents: { robot: 'prepa' } });
  assert.deepEqual(lignes(suite), [['food', ['rb1', 'rb2']]]);
  // Trois équipes du même robot, dont deux en même temps : toujours une ligne.
  const trois = generer(UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rb2', 'prepa', 'robot', '06:00', 2), atelier('rb3', 'prepa', 'robot', '11:00', 2)]));
  assert.deepEqual(lignes(trois), [['food', ['rb1', 'rb2', 'rb3']]]);
  // Deux services robot : chacun sa ligne, même s'ils ne sont jamais là en même temps ; dans l'ordre de leur première équipe.
  const deux = generer(UNITE([atelier('rbB', 'robot2', 'robot', '12:00', 2), atelier('rbA', 'robot', 'robot', '03:00', 2)]), { parents: { robot: 'prepa', robot2: 'prepa' } });
  assert.deepEqual(lignes(deux), [['food', ['rbA']], ['food', ['rbB']]]);
  assert.ok(disjoints(zone(deux, 'food').lignes) && zone(deux, 'food').lignes.every(l => dans(l, zone(deux, 'food'))));
  // Deux robots, deux équipes chacun, toutes en même temps : deux lignes.
  const quatre = generer(UNITE([atelier('a1', 'robot', 'robot', '03:00', 2), atelier('a2', 'robot', 'robot', '04:00', 2), atelier('b1', 'robot2', 'robot', '03:00', 2), atelier('b2', 'robot2', 'robot', '05:00', 2)]));
  assert.deepEqual(lignes(quatre), [['food', ['a1', 'a2']], ['food', ['b1', 'b2']]]);
  // Chaque équipe travaille à la ligne de son robot.
  const ilots = D.ilots(quatre, UNITE([atelier('a1', 'robot', 'robot', '03:00', 2), atelier('a2', 'robot', 'robot', '04:00', 2), atelier('b1', 'robot2', 'robot', '03:00', 2), atelier('b2', 'robot2', 'robot', '05:00', 2)]));
  const ligneDe = id => { const i = ilots.find(x => x.atelier === id); return [i.zone, Math.round(i.y * 1e6)]; };
  assert.deepEqual(ligneDe('a1'), ligneDe('a2'));
  assert.deepEqual(ligneDe('b1'), ligneDe('b2'));
  assert.notDeepEqual(ligneDe('a1'), ligneDe('b1'));
  // Deux robots dans deux zones : chacun sa ligne, dans sa zone.
  const zones = generer(UNITE([atelier('rbA', 'robot', 'robot', '03:00', 2), atelier('rbB', 'robot2', 'robot', '03:00', 2)]), { parents: { robot: 'prepa', robot2: 'armement' } });
  assert.deepEqual(lignes(zones).sort(), [['armement', ['rbB']], ['food', ['rbA']]]);
  reglesTenues(zones, 'deux robots, deux zones');
  // `lignesRobot` : les équipes de chaque ligne.
  assert.deepEqual(S.lignesRobot([atelier('x', 'r1', 'robot', '06:00', 1), atelier('y', 'r2', 'robot', '03:00', 1), atelier('z', 'r1', 'robot', '03:00', 1)], REGIME), [['y'], ['z', 'x']]);
  // Les tunnels de lavage ne changent pas : le plus grand nombre tenu en même temps.
  const plonge = [atelier('p1', 'plonge', 'lavage', '06:00', 4, { parVol: true, tunnels: [T('Tunnel 1'), T('Tunnel 2')] }), atelier('p2', 'plonge', 'lavage', '08:00', 2, { parVol: true, tunnels: [T('Tunnel 3')] })];
  assert.deepEqual(S.tunnelsDe(plonge, REGIME), ['Tunnel 1', 'Tunnel 2', 'Tunnel 3']);
});

test('sans réglage, le site est celui d’avant, champ par champ', () => {
  const unites = unitesDeReference();
  assert.deepEqual(unites.filter(u => !u.nom.startsWith('tirée ')).map(u => u.nom), Object.keys(AVANT.sites));
  assert.equal(Object.keys(AVANT.empreintes).length, 60);
  for (const u of unites) {
    const site = S.generer(u.reglages);
    if (u.nom.startsWith('tirée ')) assert.equal(crypto.createHash('sha256').update(JSON.stringify(site)).digest('hex'), AVANT.empreintes[u.nom], u.nom);
    else assert.deepEqual(JSON.parse(JSON.stringify(site)), AVANT.sites[u.nom], u.nom);
    // Des réglages vides ne changent rien non plus.
    assert.deepEqual(S.generer({ ...u.reglages, parents: {}, partages: {} }), site, u.nom + ' : des réglages vides');
  }
  // Ce qui change sans réglage : la zone d'une annexe rattachée (le plan le dit), et le nombre de lignes de robots.
  const fictif = reglagesDe(F.sauvegardeFictive()), plan = F.sauvegardeFictive().contenu['orly-plan-v3'].zones;
  const parents = S.parentsDuPlan(plan, Object.fromEntries(plan.filter(z => z.kind === 'service').map(z => [z.id, z]))), annexe = Object.keys(parents)[0];
  const avant = S.generer(fictif), apres = S.generer({ ...fictif, parents });
  assert.ok(zone(avant, annexe) && !zone(apres, annexe), 'l’annexe rattachée n’a plus de zone');
  assert.deepEqual(apres.zones.map(z => z.id), avant.zones.map(z => z.id).filter(id => id !== annexe));
  assert.deepEqual(zone(apres, 'food').ateliers, [...zone(avant, 'food').ateliers, ...zone(avant, annexe).ateliers]);
});

test('le réglage se sauvegarde avec les équipes ; une sauvegarde d’avant se relit sans lui', () => {
  const etat = etatDe(F.sauvegardeFictive());
  // Une sauvegarde d'avant : pas de réglage — rien n'est inventé.
  assert.equal('partages' in A.valider(etat), false);
  // Avec : gardé, et relu tel quel ; un réglage illisible ou sur soi-même est retiré.
  const avec = A.valider({ ...etat, partages: { cuisine: 'armement', dotation: 'dotation', plonge: 7, quais: '', magasin: null, decontam: ['x'] } });
  assert.deepEqual(avec.partages, { cuisine: 'armement' });
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).partages, { cuisine: 'armement' });
  assert.equal('partages' in A.valider({ ...etat, partages: {} }), false);
  assert.equal('partages' in A.valider({ ...etat, partages: ['cuisine'] }), false);
  // Une boucle dans une sauvegarde : relue telle quelle — c'est le site qui ne la joue pas, et qui la nomme.
  assert.deepEqual(A.valider({ ...etat, partages: { cuisine: 'armement', armement: 'cuisine' } }).partages, { cuisine: 'armement', armement: 'cuisine' });
});

test('dans la scène : chaque ligne s’anime dans sa zone ; deux équipes du même robot au travail, une seule ligne, leurs cadences ajoutées', () => {
  const E = require('../direct-etat.js');
  // Deux robots dans deux zones (la production, l'armement) ; le premier a deux équipes, là en même temps.
  const equipes = UNITE([atelier('a1', 'robot', 'robot', '03:00', 2), atelier('a2', 'robot', 'robot', '05:00', 2), atelier('b1', 'robot2', 'robot', '03:00', 2)]);
  const site = generer(equipes, { parents: { robot: 'prepa', robot2: 'armement' } }), ilots = D.ilots(site, equipes);
  assert.deepEqual([zone(site, 'food').lignes.map(l => l.ateliers), zone(site, 'armement').lignes.map(l => l.ateliers)], [[['a1', 'a2']], [['b1']]]);
  // Le décor : une ligne et son bras dans chaque zone, chacune sous le nom de sa zone.
  const decor = D.decor(site, ilots, null), lignes = decor.objets.filter(o => o.quoi === 'ligne');
  assert.deepEqual(lignes.map(o => [o.zone, o.ref, o.ateliers]).sort(), [['armement', 0, ['b1']], ['food', 0, ['a1', 'a2']]]);
  assert.equal(decor.objets.filter(o => o.quoi === 'bras').length, 2);
  // Les deux équipes du premier robot travaillent à la même ligne ; celle du second à la sienne.
  const ilot = id => ilots.find(i => i.atelier === id);
  assert.deepEqual([ilot('a1').zone, ilot('a2').zone, ilot('b1').zone], ['food', 'food', 'armement']);
  assert.deepEqual([ilot('a1').x, ilot('a1').y], [ilot('a2').x, ilot('a2').y]);
  // La journée, faite à la main : a1 travaille de 300 à 400 (600 plateaux par heure), a2 de 350 à 450 (300), b1 de 380 à 420 (sans cadence).
  const r = { vols: [], classes: [], stocks: { sejours: [], parService: {} }, ateliers: equipes.map(a => ({ id: a.id, type: a.type, service: a.service, personnes: a.personnes })),
    lots: [{ atelier: 'a1', service: 'robot', nom: 'L1', classes: [], debut: 300, fin: 400, debit: 600 }, { atelier: 'a2', service: 'robot', nom: 'L2', classes: [], debut: 350, fin: 450, debit: 300 },
      { atelier: 'b1', service: 'robot2', nom: 'L3', classes: [], debut: 380, fin: 420 }] };
  const scene = { site, ilots, aire: null, places: E.placesDesVols(r) }, a = t => D.circulation(scene, { r }, t);
  const dit = c => c.lignes.map(l => [l.zone, l.ligne, l.atelier, l.debit ?? null]).sort(), marques = c => c.marques.filter(m => m.ligne != null).map(m => [m.zone, m.texte]).sort();
  assert.deepEqual(dit(a(320)), [['food', 0, 'a1', 600]]);
  assert.deepEqual(marques(a(320)), [['food', '600 plateaux par heure']]);
  // Les deux équipes en même temps : une seule ligne au travail, 900 plateaux par heure.
  assert.deepEqual(dit(a(360)), [['food', 0, 'a1', 900]]);
  assert.deepEqual(marques(a(360)), [['food', '900 plateaux par heure']]);
  // Les trois : la ligne de l'armement s'anime aussi, dans sa zone — au même rang (0) que celle de la production, sans se confondre.
  assert.deepEqual(dit(a(390)), [['armement', 0, 'b1', null], ['food', 0, 'a1', 900]]);
  assert.deepEqual(marques(a(390)), [['armement', 'au travail'], ['food', '900 plateaux par heure']]);
  assert.deepEqual(dit(a(430)), [['food', 0, 'a2', 300]]);
  assert.deepEqual(dit(a(460)), []);
  // La marque est sur sa ligne.
  const m = a(390).marques.find(x => x.zone === 'armement'), l = zone(site, 'armement').lignes[0];
  assert.deepEqual([m.x, m.y], [l.x + l.w / 2, l.y + l.h / 2]);
});

test('des machines de plusieurs sortes dans une zone partagée : l’une devant l’autre, sans recouvrement', () => {
  const machines = z => [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])];
  // La plonge dans la production, qui a une ligne : les tunnels devant la ligne.
  const prod = generer(UNITE(ROBOT), { parents: { robot: 'prepa' }, partages: { plonge: 'prepa' } }), food = zone(prod, 'food');
  assert.deepEqual([food.lignes.length, food.tunnels.map(t => t.nom), zone(prod, 'plonge')], [1, ['Tunnel 1', 'Tunnel 2'], undefined]);
  assert.ok(machines(food).every(m => dans(m, food)) && disjoints(machines(food)));
  // Les lignes au fond, les tunnels devant : plus près du couloir.
  const fond = m => (food.bande === 0 ? m.y - food.y : food.y + food.h - m.y - m.h);
  assert.ok(Math.max(...food.lignes.map(fond)) < Math.min(...food.tunnels.map(fond)), 'les tunnels sont devant la ligne');
  reglesTenues(prod, 'la plonge dans la production');
  // Chaque équipe y a son îlot, sans qu'aucun ne sorte de la zone.
  const ilots = D.ilots(prod, UNITE(ROBOT)).filter(i => i.zone === 'food');
  assert.deepEqual(ilots.map(i => i.atelier).sort(), ['mo', 'pl', 'pr', 'rb']);
  assert.ok(ilots.every(i => i.places.every(p => p.x >= food.x - 1e-9 && p.x <= food.x + food.w + 1e-9 && p.y >= food.y - 1e-9 && p.y <= food.y + food.h + 1e-9)));

  // Le magasin seul : un entrepôt, ses rayonnages sur toute la profondeur (comme avant). Avec un autre service : au fond seulement.
  const seul = zone(generer(UNITE()), 'magasin'), avec = zone(generer(UNITE(PLUS), { partages: { patisserie: 'magasin' } }), 'magasin');
  const profondeur = z => Math.max(...z.rayonnages.map(m => (z.bande === 0 ? m.y + m.h - z.y : z.y + z.h - m.y)));
  assert.ok(profondeur(seul) > 0.6 * seul.h, 'un entrepôt : des rayonnages jusqu’au couloir');
  assert.ok(avec.rayonnages.length >= 1 && profondeur(avec) <= 0.5 * avec.h + 1e-9, 'avec un autre service : au fond, la moitié de la profondeur au plus');
  assert.deepEqual([avec.role, avec.services], ['magasin', ['magasin', 'patisserie']]);
  // La plonge, une ligne et le magasin dans la même zone : les trois sortes, rangées sans se toucher.
  const tout = generer(UNITE(ROBOT), { parents: { robot: 'magasin' }, partages: { plonge: 'magasin' } }), mag = zone(tout, 'magasin');
  assert.deepEqual([mag.lignes.length, mag.tunnels.length, mag.rayonnages.length >= 1], [1, 2, true]);
  assert.ok(machines(mag).every(m => m.w > 0 && m.h > 0 && dans(m, mag)) && disjoints(machines(mag)), 'trois sortes de machines, sans recouvrement');
  reglesTenues(tout, 'trois sortes de machines');
});

test('sur 200 unités tirées d’une graine fixe, avec des annexes et des zones partagées : les règles tiennent toutes', () => {
  let graine = 20261117;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; }, entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const SERVICES = ['magasin', 'cuisine', 'preparation', 'prepa', 'armement', 'plonge', 'quais', 'dotation', 'patisserie', 'controle', 'robot', 'robot2'];
  const TYPES = { magasin: ['dispo'], plonge: ['lavage'], quais: ['handling'], robot: ['robot'], robot2: ['robot'] };
  for (let i = 0; i < 200; i++) {
    const ateliers = [];
    for (const s of SERVICES) if (alea() < 0.7) for (let k = 0, n = entier(1, 3); k < n; k++) {
      const choix = TYPES[s] || ['manuel', 'manuel', 'robot', 'appui'], type = choix[entier(0, choix.length - 1)];
      ateliers.push(atelier(s + k, s, type, String(entier(0, 23)).padStart(2, '0') + ':00', entier(0, 20), { jour: entier(-1, 1),
        ...(type === 'lavage' ? { parVol: true, tunnels: Array.from({ length: entier(1, 4) }, () => T('Tunnel ' + entier(1, 5), { personnes: entier(0, 2) })) } : {}) }));
    }
    // Des annexes rattachées, des zones partagées — des boucles comprises.
    const parents = Object.fromEntries(['robot', 'robot2', 'patisserie'].filter(() => alea() < 0.5).map(s => [s, SERVICES[entier(0, 7)]]));
    const partages = Object.fromEntries(SERVICES.filter(() => alea() < 0.3).map(s => [s, SERVICES[entier(0, SERVICES.length - 1)]]).filter(([s, h]) => s !== h));
    const surfaces = Object.fromEntries(SERVICES.filter(() => alea() < 0.2).map(s => [s, entier(5, 50)]));
    const reglages = { ateliers, noms: NOMS, parcours: alea() < 0.5 ? CHEMIN : undefined, regime: REGIME, surfaces, parents, partages }, avant = JSON.stringify(reglages);
    const site = S.generer(reglages), mot = 'unité ' + i;
    assert.equal(JSON.stringify(S.generer(JSON.parse(avant))), JSON.stringify(site), mot + ' : deux générations identiques');
    assert.equal(JSON.stringify(reglages), avant, mot + ' : les réglages ne sont pas touchés');
    if (!site.zones.length) { assert.equal(ateliers.length, 0, mot); continue; }
    reglesTenues(site, mot);
    // Chaque équipe est dans une zone, et une seule ; chaque service qui a une équipe aussi.
    assert.deepEqual(site.zones.flatMap(z => z.ateliers).sort(), ateliers.map(a => a.id).sort(), mot + ' : chaque équipe dans une zone');
    assert.deepEqual(site.zones.flatMap(z => z.services).sort(), [...new Set(ateliers.map(a => a.service))].sort(), mot + ' : chaque service dans une zone');
    // Une ligne par service robot, ni plus ni moins ; chaque équipe robot a la sienne.
    const lignes = site.zones.flatMap(z => z.lignes || []);
    assert.equal(lignes.length, new Set(ateliers.filter(a => a.type === 'robot').map(a => a.service)).size, mot + ' : une ligne par service robot');
    assert.deepEqual(lignes.flatMap(l => l.ateliers).sort(), ateliers.filter(a => a.type === 'robot').map(a => a.id).sort(), mot);
    // Une annexe rattachée, sans réglage à elle, n'a pas de zone à son nom (sauf boucle de rattachements, qui ne joue pas).
    // Une annexe rattachée qui a une équipe, sans réglage à elle et hors de toute boucle : elle est dans la zone où est son parent.
    const zoneDe = svc => site.zones.find(z => z.services.includes(svc)), enBoucle = svc => (site.notes || []).some(n => n.code === 'boucle' && n.services.includes(svc));
    for (const [annexe, parent] of Object.entries(parents)) {
      if (annexe in partages || annexe === parent || enBoucle(annexe) || !zoneDe(annexe)) continue;
      const chezParent = zoneDe(parent);
      if (chezParent) assert.equal(zoneDe(annexe).id, chezParent.id, mot + ' : ' + annexe + ' est dans la zone de ' + parent);
      else assert.ok(zoneDe(annexe).id !== annexe, mot + ' : ' + annexe + ' n’a pas de zone à son nom');
    }
    // Les îlots : un par équipe, dans la zone de son service ou de sa ligne.
    const ilots = D.ilots(site, ateliers);
    assert.equal(ilots.length, ateliers.length, mot + ' : un îlot par équipe');
  }
});

test('des réglages bizarres, lus d’une sauvegarde retouchée : rien ne casse, rien ne joue', () => {
  const equipes = UNITE(PLUS), seuls = generer(equipes);
  // Des valeurs qui ne sont pas des textes, des clés de l'objet lui-même : ignorées, sans rien dire.
  const memes = (site, mot) => assert.deepEqual(site.zones.map(z => [z.id, z.services, z.part]), seuls.zones.map(z => [z.id, z.services, z.part]), mot);
  for (const etrange of [{ cuisine: 7, patisserie: null, controle: ['cuisine'], plonge: { a: 1 }, quais: '', magasin: true }, { __proto__: 'cuisine', constructor: 'cuisine', toString: 'cuisine' },
    'cuisine', ['cuisine'], 12, null]) {
    memes(generer(equipes, { partages: etrange, parents: etrange }), JSON.stringify(etrange));
    assert.equal(Object.prototype.cuisine, undefined);
  }
  // Un service choisi qui porte le nom d'une clé de tout objet, et qui n'existe pas : le réglage ne joue pas, et c'est dit.
  const cles = generer(equipes, { partages: JSON.parse('{"__proto__":"cuisine","patisserie":"__proto__","controle":"constructor"}') });
  memes(cles, 'des clés d’objet');
  assert.deepEqual(cles.notes, [{ code: 'inconnu', service: 'controle', hote: 'constructor' }, { code: 'inconnu', service: 'patisserie', hote: '__proto__' }]);
  // Un service qui s'appelle comme une clé de tout objet : il se règle comme un autre.
  const drole = [...equipes, atelier('x', 'constructor', 'manuel', '04:00', 2), atelier('y', '__proto__', 'manuel', '04:00', 2)];
  const site = generer(drole, { partages: JSON.parse('{"constructor":"cuisine","__proto__":"cuisine"}') });
  assert.deepEqual(zone(site, 'cuisine').services.slice().sort(), ['__proto__', 'constructor', 'cuisine']);
  reglesTenues(site, 'des services aux noms de clés');
  assert.deepEqual(S.boucle(JSON.parse('{"partages":{"__proto__":"cuisine"}}'), 'cuisine', '__proto__'), ['cuisine', '__proto__', 'cuisine']);
  // Un réglage resté sur un service supprimé ne ferme pas de boucle : le service supprimé ne joue pas (`connu`).
  const reste = { partages: { disparu: 'cuisine' } };
  assert.deepEqual(S.boucle(reste, 'cuisine', 'disparu'), ['cuisine', 'disparu', 'cuisine'], 'sans savoir qui existe : une boucle');
  assert.equal(S.boucle(reste, 'cuisine', 'patisserie', x => x !== 'disparu'), null);
  assert.equal(S.boucle({ partages: { patisserie: 'disparu', disparu: 'cuisine' } }, 'cuisine', 'patisserie', x => x !== 'disparu'), null, 'la pâtisserie ne suit pas un service supprimé');
  const fantome = generer(equipes, { partages: { patisserie: 'disparu', disparu: 'cuisine', cuisine: 'patisserie' } });
  assert.deepEqual([zone(fantome, 'patisserie').services, fantome.notes], [['cuisine', 'patisserie'], [{ code: 'inconnu', service: 'patisserie', hote: 'disparu' }]]);
});

test('la production réduite à sa ligne : la préparation et le montage partis ailleurs, elle garde la place de sa ligne', () => {
  // Un robot de la cuisine (sa ligne est dans la production) ; la préparation et le montage rejoignent la cuisine par le réglage.
  const equipes = UNITE([atelier('rbc', 'cuisine', 'robot', '03:00', 2)]), avant = generer(equipes);
  const site = generer(equipes, { partages: { preparation: 'cuisine', prepa: 'cuisine' } }), food = zone(site, 'food'), cu = zone(site, 'cuisine');
  assert.deepEqual([food.services, food.ateliers, food.lignes.map(l => l.ateliers), food.role], [[], [], [['rbc']], 'food']);
  assert.deepEqual(cu.services.slice().sort(), ['cuisine', 'prepa', 'preparation']);
  // Le cinquième de la production suit ses services : sa zone ne garde que la place de sa ligne.
  proche(food.part, food.minimum / site.surface, 'la production : la place de sa ligne');
  assert.ok(food.part < zone(avant, 'food').part && cu.part > zone(avant, 'cuisine').part);
  assert.ok(food.lignes.every(l => dans(l, food)));
  reglesTenues(site, 'la production réduite à sa ligne');
});
