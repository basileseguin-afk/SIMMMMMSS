/* Évolution 16 (a) — le site de la vue en direct, généré par des règles (v1).
 * La vue en relief ne recopie pas le plan dessiné : `moteur/site.js` génère un
 * site schématique à partir des réglages de la simulation — les ateliers, les
 * chemins, les parts de surface des services —, toujours de la même façon.
 * Un module sans navigateur : il ne lit que des réglages, et ne calcule rien de
 * la journée. Unités fictives : services, ateliers et équipes inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/site.js');
const A = require('../ateliers.js');
const F = require('./plan-rejoue-fictif.cjs');

const REGIME = { seuils: [], presence: 480 };
const atelier = (id, service, type, debut, personnes, p = {}) => ({ id, nom: id, service, type, debut, jour: 0, personnes, lots: [], ...p });
const T = (nom, p = {}) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
const NOMS = { magasin: 'Magasin', preparation: 'Prépa', prepa: 'Montage', armement: 'Armement', cuisine: 'Cuisine', plonge: 'Plonge', quais: 'Quais' };
// Un chemin, de l'amont vers l'aval : le magasin, la cuisine, la prépa, le montage, le quai ; l'armement rejoint le quai.
const CHEMIN = [{ id: 'c', nom: 'c', noeuds: ['magasin', 'cuisine', 'preparation', 'prepa', 'quais', 'armement', 'plonge'],
  liens: [{ de: 'magasin', vers: 'cuisine' }, { de: 'cuisine', vers: 'preparation' }, { de: 'preparation', vers: 'prepa' }, { de: 'prepa', vers: 'quais' }, { de: 'armement', vers: 'quais' }] }];
// L'unité : un magasin, la cuisine (6 personnes), la prépa et le montage, l'armement, la plonge (4), le quai (2).
const UNITE = (plus = []) => [
  atelier('mag', 'magasin', 'dispo', '02:00', 2),
  atelier('cu', 'cuisine', 'manuel', '04:00', 6),
  atelier('pr', 'preparation', 'manuel', '04:00', 4),
  atelier('mo', 'prepa', 'manuel', '05:00', 10),
  atelier('ar', 'armement', 'manuel', '05:00', 5),
  atelier('pl', 'plonge', 'lavage', '06:00', 4, { parVol: true, tunnels: [T('Tunnel 1'), T('Tunnel 2')] }),
  atelier('h', 'quais', 'handling', '04:00', 2),
  ...plus];
const generer = (ateliers, plus = {}) => S.generer({ ateliers, noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const zone = (site, id) => site.zones.find(z => z.id === id);
const somme = (l, f) => l.reduce((n, x) => n + f(x), 0);
const proche = (a, b, mot) => assert.ok(Math.abs(a - b) < 1e-6, (mot || '') + ' : ' + a + ' ≠ ' + b);

test('les parts par défaut : le magasin 1/5, la production 1/5, l’armement 1/5, les autres 2/5 au prorata de leurs personnes', () => {
  const site = generer(UNITE());
  assert.deepEqual(site.zones.map(z => z.id).sort(), ['armement', 'cuisine', 'food', 'magasin', 'plonge', 'quais']);
  proche(zone(site, 'magasin').part, 0.2); proche(zone(site, 'food').part, 0.2); proche(zone(site, 'armement').part, 0.2);
  // Les autres : la cuisine (6 personnes), la plonge (4), le quai (2) se partagent 2/5.
  proche(zone(site, 'cuisine').part, 0.4 * 6 / 12); proche(zone(site, 'plonge').part, 0.4 * 4 / 12); proche(zone(site, 'quais').part, 0.4 * 2 / 12);
  proche(somme(site.zones, z => z.part), 1, 'les parts se ramènent à 1');
});

test('des parts réglées : elles remplacent les défauts, et le tout se ramène à 1', () => {
  // La cuisine réglée à 30 %, le magasin à 10 % : avec la production (20), l'armement (20) et les autres (40, entre la plonge
  // et le quai), le total fait 120 : chaque part est divisée par 1,2.
  const site = generer(UNITE(), { surfaces: { cuisine: 30, magasin: 10 } });
  proche(zone(site, 'cuisine').part, 0.30 / 1.2); proche(zone(site, 'magasin').part, 0.10 / 1.2);
  proche(zone(site, 'food').part, 0.20 / 1.2); proche(zone(site, 'armement').part, 0.20 / 1.2);
  proche(zone(site, 'plonge').part, 0.4 * 4 / 6 / 1.2); proche(zone(site, 'quais').part, 0.4 * 2 / 6 / 1.2);
  proche(somme(site.zones, z => z.part), 1);
  // La production réglée par ses services : la prépa à 10 %, le montage à 30 % → la zone FOOD pèse 40 sur 120 (avec le
  // magasin 20, l'armement 20 et les autres 40).
  const food = generer(UNITE(), { surfaces: { preparation: 10, prepa: 30 } });
  proche(zone(food, 'food').part, 0.40 / 1.2);
  // Un seul de ses services réglé : l'autre garde sa part du 1/5 (la prépa a 4 personnes sur 14).
  proche(zone(generer(UNITE(), { surfaces: { prepa: 30 } }), 'food').part, (0.30 + 0.2 * 4 / 14) / (0.30 + 0.2 * 4 / 14 + 0.8));
  // Une part illisible, nulle ou d'un service sans atelier : ignorée.
  assert.deepEqual(generer(UNITE(), { surfaces: { cuisine: 'abc', magasin: 0, fantome: 50 } }).zones.map(z => [z.id, z.part]), generer(UNITE()).zones.map(z => [z.id, z.part]));
});

test('la somme des surfaces égale le site ; les zones remplissent les deux bandes, sans trou ni recouvrement', () => {
  const site = generer(UNITE());
  proche(somme(site.zones, z => z.surface), site.surface, 'la somme des surfaces');
  for (const z of site.zones) { proche(z.surface, z.part * site.surface, z.id); proche(z.w * z.h, z.surface, z.id + ' : largeur × profondeur'); }
  // Deux bandes de part et d'autre du couloir : dans chacune, les zones se touchent, de x = 0 à la largeur du site.
  for (const bande of [0, 1]) {
    const l = site.zones.filter(z => z.bande === bande).sort((a, b) => a.x - b.x);
    assert.ok(l.length > 0, 'la bande ' + bande + ' a des zones');
    proche(l[0].x, 0, 'la bande commence à 0'); proche(l[l.length - 1].x + l[l.length - 1].w, site.largeur, 'la bande finit à la largeur du site');
    for (let i = 1; i < l.length; i++) proche(l[i].x, l[i - 1].x + l[i - 1].w, 'les zones se touchent');
    for (const z of l) { proche(z.y, l[0].y); proche(z.h, l[0].h); }
  }
  // Le couloir est entre les deux bandes ; le site est un rectangle.
  const haut = site.zones.find(z => z.bande === 0), bas = site.zones.find(z => z.bande === 1);
  proche(site.couloir.y, haut.y + haut.h); proche(site.couloir.y + site.couloir.h, bas.y); proche(site.couloir.w, site.largeur);
  proche(site.profondeur, bas.y + bas.h);
  // Chaque zone ouvre sur le couloir.
  for (const z of site.zones) assert.ok(z.porte.x > z.x && z.porte.x < z.x + z.w && (Math.abs(z.porte.y - site.couloir.y) < 1e-9 || Math.abs(z.porte.y - (site.couloir.y + site.couloir.h)) < 1e-9), z.id);
});

test('un service sans atelier n’a pas de zone ; les parts des autres se ramènent à 1', () => {
  const sans = generer(UNITE().filter(a => a.service !== 'magasin'));
  assert.equal(zone(sans, 'magasin'), undefined);
  // La production 20, l'armement 20, les autres 40 : le total fait 80.
  proche(zone(sans, 'food').part, 0.25); proche(zone(sans, 'armement').part, 0.25); proche(somme(sans.zones, z => z.part), 1);
  // Une unité d'un seul service : une zone, tout le site.
  const un = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 3)]);
  assert.deepEqual(un.zones.map(z => [z.id, z.part]), [['cuisine', 1]]);
  proche(un.zones[0].surface, un.surface);
  // Aucun atelier : un site vide, sans zone.
  assert.deepEqual(generer([]).zones, []);
});

test('la préparation et le montage sont dans la même zone, « FOOD », avec leurs ateliers', () => {
  const site = generer(UNITE([atelier('mo2', 'prepa', 'manuel', '13:00', 3)])), food = zone(site, 'food');
  assert.deepEqual([food.nom, food.role, food.services, food.ateliers], ['FOOD', 'food', ['preparation', 'prepa'], ['pr', 'mo', 'mo2']]);
  assert.ok(!zone(site, 'preparation') && !zone(site, 'prepa'));
  // Le montage seul : la zone FOOD quand même.
  const seul = generer(UNITE().filter(a => a.service !== 'preparation'));
  assert.deepEqual([zone(seul, 'food').services, zone(seul, 'food').ateliers], [['prepa'], ['mo']]);
  // Chaque autre zone porte son service et ses ateliers.
  assert.deepEqual([zone(site, 'cuisine').services, zone(site, 'cuisine').ateliers, zone(site, 'cuisine').nom, zone(site, 'cuisine').role], [['cuisine'], ['cu'], 'Cuisine', 'autre']);
  assert.deepEqual(['magasin', 'armement', 'plonge', 'quais'].map(id => zone(site, id).role), ['magasin', 'armement', 'plonge', 'quai']);
});

test('la ligne robotisée : aucune sans atelier robot ; une par service robot, que ses équipes se succèdent ou soient là en même temps ; dans la zone FOOD', () => {
  assert.deepEqual(zone(generer(UNITE()), 'food').lignes, []);
  // Deux équipes robot qui se succèdent (03:00 → 11:00, 11:00 → 19:00) : la même ligne.
  const suite = generer(UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rb2', 'prepa', 'robot', '11:00', 2)]));
  assert.deepEqual(zone(suite, 'food').lignes.map(l => l.ateliers), [['rb1', 'rb2']]);
  // En même temps (03:00 → 11:00 et 06:00 → 14:00) : la même ligne encore — il n'y a qu'un robot (évolution 20 a).
  const ensemble = generer(UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rb2', 'prepa', 'robot', '06:00', 2)]));
  assert.deepEqual(zone(ensemble, 'food').lignes.map(l => l.ateliers), [['rb1', 'rb2']]);
  // Trois équipes du même robot, dont deux en même temps : une ligne, ses équipes dans l'ordre de leur arrivée.
  const trois = generer(UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rb2', 'prepa', 'robot', '06:00', 2), atelier('rb3', 'prepa', 'robot', '11:00', 2)]));
  assert.deepEqual(zone(trois, 'food').lignes.map(l => l.ateliers), [['rb1', 'rb2', 'rb3']]);
  // Deux services robot : chacun sa ligne.
  const deux = generer(UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rbc', 'cuisine', 'robot', '11:00', 2)]));
  assert.deepEqual(zone(deux, 'food').lignes.map(l => l.ateliers), [['rb1'], ['rbc']]);
  // Dans une zone étroite et profonde, une machine se pose dans le sens de la profondeur, à sa taille.
  {
    const etroite = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 60), atelier('pl', 'plonge', 'lavage', '06:00', 2, { parVol: true, tunnels: [T('Tunnel 1')] }), atelier('mag', 'magasin', 'dispo', '02:00', 1)]);
    const p = zone(etroite, 'plonge'), t = p.tunnels[0];
    assert.ok(p.w < 6.5 + 2 && p.h > 6.5 + 1.2, 'une plonge étroite et profonde (' + p.w.toFixed(1) + ' × ' + p.h.toFixed(1) + ')');
    assert.deepEqual([Math.round(t.w * 10) / 10, Math.round(t.h * 10) / 10], [1.3, 6.5], 'le tunnel en long, à sa taille');
    assert.ok(t.x >= p.x && t.y >= p.y && t.x + t.w <= p.x + p.w && t.y + t.h <= p.y + p.h);
  }
  // Un robot rattaché à un autre service (la cuisine) : sa ligne est quand même dans la zone FOOD, pas dans celle de la cuisine.
  const ailleurs = generer(UNITE([atelier('rbc', 'cuisine', 'robot', '03:00', 2)])), food = zone(ailleurs, 'food');
  assert.deepEqual(food.lignes.map(l => l.ateliers), [['rbc']]);
  assert.equal('lignes' in zone(ailleurs, 'cuisine'), false);
  for (const l of food.lignes) assert.ok(l.x >= food.x && l.y >= food.y && l.x + l.w <= food.x + food.w + 1e-9 && l.y + l.h <= food.y + food.h + 1e-9, 'la ligne est dans la zone FOOD');
  // Sans préparation ni montage, mais avec un robot : la zone FOOD existe, pour sa ligne.
  const que = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 3), atelier('rbc', 'cuisine', 'robot', '03:00', 2)]);
  assert.deepEqual([zone(que, 'food').lignes.length, zone(que, 'food').ateliers, zone(que, 'cuisine').ateliers], [1, [], ['cu', 'rbc']]);
});

test('la plonge montre le nombre de tunnels des réglages : le plus grand nombre tenu en même temps', () => {
  const tunnels = ateliers => zone(generer(ateliers), 'plonge').tunnels.map(t => t.nom);
  const sansPlonge = UNITE().filter(a => a.service !== 'plonge'), pl = (id, debut, t, p = {}) => atelier(id, 'plonge', 'lavage', debut, 3, { parVol: true, tunnels: t, ...p });
  assert.deepEqual(tunnels(UNITE()), ['Tunnel 1', 'Tunnel 2']);
  // Deux équipes qui se succèdent (06:00 → 14:00, 14:00 → 22:00), un tunnel chacune, de noms différents : un seul à la fois.
  assert.equal(tunnels([...sansPlonge, pl('m', '06:00', [T('Tunnel A')]), pl('s', '14:00', [T('Tunnel B')])]).length, 1);
  // Qui se chevauchent (06:00 → 14:00, 13:00 → 21:00) : le même tunnel est une seule machine ; deux noms, deux machines.
  assert.deepEqual(tunnels([...sansPlonge, pl('m', '06:00', [T('Tunnel 1')]), pl('s', '13:00', [T('Tunnel 1')])]), ['Tunnel 1']);
  assert.deepEqual(tunnels([...sansPlonge, pl('m', '06:00', [T('Tunnel 1')]), pl('s', '13:00', [T('Tunnel 2')])]), ['Tunnel 1', 'Tunnel 2']);
  // Un tunnel à l'arrêt, ou que personne ne tient, ne se dessine pas.
  assert.deepEqual(tunnels([...sansPlonge, pl('m', '06:00', [T('Tunnel 1'), T('Tunnel 2', { actif: false })])]), ['Tunnel 1']);
  // Sans liste de tunnels : un tunnel, s'il y a quelqu'un pour le tenir.
  assert.deepEqual(tunnels([...sansPlonge, atelier('m', 'plonge', 'lavage', '06:00', 2)]), ['Tunnel']);
  const site = generer(UNITE()), p = zone(site, 'plonge');
  for (const t of p.tunnels) assert.ok(t.x >= p.x && t.y >= p.y && t.x + t.w <= p.x + p.w + 1e-9 && t.y + t.h <= p.y + p.h + 1e-9, 'le tunnel est dans la plonge');
});

test('le magasin est un entrepôt ; l’aire de pause est près de l’entrée ; l’ordre des zones suit le chemin', () => {
  const site = generer(UNITE()), mag = zone(site, 'magasin');
  assert.ok(mag.rayonnages.length >= 1);
  for (const r of mag.rayonnages) assert.ok(r.x >= mag.x && r.y >= mag.y && r.x + r.w <= mag.x + mag.w + 1e-9 && r.y + r.h <= mag.y + mag.h + 1e-9);
  assert.equal('rayonnages' in zone(site, 'cuisine'), false);
  // Le magasin du côté des arrivées (à gauche), le quai du handling du côté des avions (à droite), la plonge près du quai.
  proche(mag.x, 0, 'le magasin commence le site');
  proche(zone(site, 'quais').x + zone(site, 'quais').w, site.largeur, 'le quai finit le site, côté avions');
  proche(zone(site, 'plonge').x + zone(site, 'plonge').w, site.largeur, 'la plonge est au bout, près du quai');
  assert.notEqual(zone(site, 'plonge').bande, zone(site, 'quais').bande);
  assert.equal(site.avions, 'droite');
  // De l'amont vers l'aval, dans chaque bande : la cuisine avant la production.
  assert.ok(zone(site, 'cuisine').x < zone(site, 'food').x || zone(site, 'cuisine').bande !== zone(site, 'food').bande);
  // L'entrée est au bout gauche du couloir ; l'aire de pause la jouxte, hors des zones.
  proche(site.entree.x, 0); assert.ok(site.entree.y > site.couloir.y && site.entree.y < site.couloir.y + site.couloir.h);
  assert.ok(site.pause.x + site.pause.w <= 1e-9 && site.pause.w > 0 && site.pause.h > 0, 'la pause est à gauche de l’entrée');
  // L'emprise : le rectangle qui contient tout.
  assert.deepEqual([site.emprise.x1, site.emprise.y0, site.emprise.y1], [site.largeur, 0, site.profondeur]);
  proche(site.emprise.x0, site.pause.x);
});

test('chaque zone a la place de ses ateliers : un minimum, qui agrandit le site s’il le faut', () => {
  // Un petit service de 40 personnes à côté d'un grand : sa part au prorata, et jamais moins que la place de ses ateliers.
  const grosse = generer(UNITE([atelier('cu2', 'cuisine', 'manuel', '04:00', 200)]));
  for (const z of grosse.zones) assert.ok(z.surface + 1e-6 >= z.minimum, z.id + ' : ' + z.surface + ' < ' + z.minimum);
  assert.ok(grosse.surface > generer(UNITE()).surface, 'le site grandit avec l’unité');
  proche(somme(grosse.zones, z => z.part), 1);
});

/** Un rectangle est dans un autre ; deux rectangles ne se touchent pas. */
const dans = (r, z) => r.x >= z.x - 1e-9 && r.y >= z.y - 1e-9 && r.x + r.w <= z.x + z.w + 1e-9 && r.y + r.h <= z.y + z.h + 1e-9;
const disjoints = l => l.every((p, i) => l.every((q, j) => j <= i || p.x + p.w <= q.x + 1e-9 || q.x + q.w <= p.x + 1e-9 || p.y + p.h <= q.y + 1e-9 || q.y + q.h <= p.y + 1e-9));
const machines = z => [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])];

test('quatre lignes, quatre tunnels, six tunnels : chaque machine dans sa zone, aucune sur une autre', () => {
  // Quatre services robot (une équipe chacun) : quatre lignes.
  const robots = [3, 4, 5, 6].map(h => atelier('rb' + h, 'robot' + h, 'robot', '0' + h + ':00', 2));
  const food = zone(generer(UNITE(robots)), 'food');
  assert.equal(food.lignes.length, 4);
  assert.ok(food.lignes.every(l => dans(l, food)) && disjoints(food.lignes), 'les quatre lignes tiennent dans la zone FOOD, sans se recouvrir');
  // Quatre, puis six tunnels tenus en même temps.
  for (const n of [4, 6]) {
    const tunnels = Array.from({ length: n }, (_, i) => T('Tunnel ' + (i + 1)));
    const p = zone(generer([...UNITE().filter(a => a.service !== 'plonge'), atelier('pl', 'plonge', 'lavage', '06:00', n, { parVol: true, tunnels })]), 'plonge');
    assert.equal(p.tunnels.length, n);
    assert.ok(p.tunnels.every(t => dans(t, p)) && disjoints(p.tunnels), n + ' tunnels tiennent dans la plonge, sans se recouvrir');
    // À leur taille, ou presque (la zone a reçu la place qu'il leur faut ; sa forme est celle de sa bande) : tous de la même
    // taille, en travers ou en long, jamais moins des quatre cinquièmes d'un tunnel de 6,5 m sur 1,3 m.
    const long = t => Math.max(t.w, t.h), court = t => Math.min(t.w, t.h);
    assert.ok(p.tunnels.every(t => long(t) <= 6.5 + 1e-9 && long(t) >= 0.8 * 6.5 && Math.abs(court(t) / long(t) - 1.3 / 6.5) < 1e-9 && Math.abs(t.w - p.tunnels[0].w) < 1e-9), 'à leur taille, ou presque');
  }
  // Une zone trop petite pour ses machines (une part réglée énorme ailleurs ne la rétrécit pas sous sa place) : elles
  // rétrécissent au besoin, sans jamais sortir ni se recouvrir.
  const serre = generer(UNITE(robots), { surfaces: { cuisine: 100, armement: 100, magasin: 100 } });
  for (const z of serre.zones) assert.ok(machines(z).every(m => dans(m, z)) && disjoints(z.lignes || []) && disjoints(z.tunnels || []) && disjoints(z.rayonnages || []), z.id);
});

test('un quai qui a sa propre équipe de lavage montre ses tunnels', () => {
  const site = generer([...UNITE().filter(a => a.service !== 'plonge'), atelier('lq', 'quais', 'lavage', '06:00', 2, { parVol: true, tunnels: [T('Tunnel Q')] })]);
  const quai = zone(site, 'quais');
  assert.deepEqual([quai.role, quai.tunnels.map(t => t.nom)], ['quai', ['Tunnel Q']]);
  assert.ok(quai.tunnels.every(t => dans(t, quai)));
});

test('une part réglée minuscule n’agrandit pas tout le site ; aucune part ne descend sous la place de ses ateliers', () => {
  const defaut = generer(UNITE());
  for (const part of [5, 1, 0.1]) {
    const site = generer(UNITE(), { surfaces: { cuisine: part } }), cu = zone(site, 'cuisine');
    assert.ok(site.surface <= defaut.surface * 1.1, 'cuisine à ' + part + ' % : le site reste de sa taille (' + Math.round(site.surface) + ' m²)');
    assert.ok(cu.surface + 1e-6 >= cu.minimum, 'la cuisine garde la place de ses ateliers');
    proche(somme(site.zones, z => z.part), 1);
  }
  // Une part énorme se ramène : la cuisine à 100 %, avec les 100 % des autres, pèse la moitié.
  proche(zone(generer(UNITE(), { surfaces: { cuisine: 100 } }), 'cuisine').part, 0.5);
});

test('des équipes à cheval sur minuit, à J−1 ou J+1, sans règle de présence', () => {
  const lignes = robots => zone(generer(UNITE(robots)), 'food').lignes.map(l => l.ateliers);
  const rb = (id, debut, jour, p = {}) => atelier(id, 'prepa', 'robot', debut, 2, { jour, ...p });
  // Les équipes d'un même robot partagent sa ligne, qu'elles se croisent ou se suivent (évolution 20 a) — dans l'ordre de
  // leur arrivée, le jour compris : 22:00 → 06:00 le lendemain, puis une équipe de J+1 à 05:00 ou à 06:00.
  assert.deepEqual(lignes([rb('matin', '05:00', 1), rb('soir', '22:00', 0)]), [['soir', 'matin']]);
  assert.deepEqual(lignes([rb('soir', '22:00', 0), rb('matin', '06:00', 1)]), [['soir', 'matin']]);
  // Une équipe de la veille (J−1, 22:00 → 06:00) arrive avant une du jour, à 06:00 comme à 04:00.
  assert.deepEqual(lignes([rb('jour', '06:00', 0), rb('veille', '22:00', -1)]), [['veille', 'jour']]);
  assert.deepEqual(lignes([rb('veille', '22:00', -1), rb('jour', '04:00', 0)]), [['veille', 'jour']]);
  // Une équipe sans règle de présence (son régime coupé) est là 24 h : la même ligne.
  const libre = { regime: { actif: false } };
  assert.deepEqual(lignes([rb('a', '03:00', 0, libre), rb('b', '11:00', 0, libre)]), [['a', 'b']]);
  // Sans règle générale donnée, celle du moteur vaut : huit heures, les deux équipes se suivent.
  const sans = S.generer({ ateliers: UNITE([rb('a', '03:00', 0), rb('b', '11:00', 0)]), noms: NOMS, parcours: CHEMIN });
  assert.deepEqual(zone(sans, 'food').lignes.map(l => l.ateliers), [['a', 'b']]);
  // Les tunnels aussi : une nuit (22:00 → 06:00) et un matin de J+1 à 05:00, deux tunnels de noms différents, en même temps.
  const pl = (id, debut, jour, nom) => atelier(id, 'plonge', 'lavage', debut, 2, { jour, parVol: true, tunnels: [T(nom)] });
  const tunnels = l => zone(generer([...UNITE().filter(a => a.service !== 'plonge'), ...l]), 'plonge').tunnels.map(t => t.nom);
  assert.deepEqual(tunnels([pl('n', '22:00', 0, 'Tunnel N'), pl('m', '05:00', 1, 'Tunnel M')]), ['Tunnel N', 'Tunnel M']);
  assert.deepEqual(tunnels([pl('n', '22:00', 0, 'Tunnel N'), pl('m', '06:00', 1, 'Tunnel M')]), ['Tunnel N']);
});

test('une unité à un seul service : une seule bande, le couloir, la pause', () => {
  const site = generer([atelier('cu', 'cuisine', 'manuel', '04:00', 3)]), z = site.zones[0];
  assert.deepEqual([site.zones.length, z.id, z.bande], [1, 'cuisine', 0]);
  proche(z.part, 1); proche(z.surface, site.surface); proche(z.w, site.largeur);
  proche(site.profondeur, z.h + site.couloir.h);
  assert.ok(site.pause.x + site.pause.w <= 1e-9 && site.pause.h > 0 && site.pause.y >= 0, 'la pause est à gauche de l’entrée');
  assert.ok(JSON.stringify(site).indexOf('null') < 0 && Object.values(site.emprise).every(Number.isFinite));
});

test('sur 300 unités fictives tirées d’une graine fixe : les règles tiennent toutes', () => {
  let graine = 20261114;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; }, entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const SERVICES = ['magasin', 'cuisine', 'preparation', 'prepa', 'armement', 'plonge', 'quais', 'dotation'];
  const TYPES = { magasin: ['dispo'], plonge: ['lavage'], quais: ['handling'] };
  for (let i = 0; i < 300; i++) {
    const ateliers = [];
    for (const s of SERVICES) if (alea() < 0.8) for (let k = 0, n = entier(1, 3); k < n; k++) {
      const type = (TYPES[s] || ['manuel', 'manuel', 'robot', 'appui'])[entier(0, (TYPES[s] || [0, 0, 0, 0]).length - 1)];
      ateliers.push(atelier(s + k, s, type, String(entier(0, 23)).padStart(2, '0') + ':00', entier(0, 20), { jour: entier(-1, 1),
        ...(type === 'lavage' ? { parVol: true, tunnels: Array.from({ length: entier(1, 4) }, (_, j) => T('Tunnel ' + entier(1, 5), { personnes: entier(0, 2) })) } : {}) }));
    }
    const surfaces = Object.fromEntries(SERVICES.filter(() => alea() < 0.25).map(s => [s, entier(5, 50)]));
    const reglages = { ateliers, noms: NOMS, parcours: alea() < 0.5 ? CHEMIN : undefined, regime: REGIME, surfaces }, avant = JSON.stringify(reglages);
    const site = S.generer(reglages), mot = 'unité ' + i;
    assert.equal(JSON.stringify(S.generer(JSON.parse(avant))), JSON.stringify(site), mot + ' : deux générations identiques');
    assert.equal(JSON.stringify(reglages), avant, mot + ' : les réglages ne sont pas touchés');
    if (!site.zones.length) { assert.equal(ateliers.length, 0, mot); continue; }
    proche(somme(site.zones, z => z.part), 1, mot + ' : les parts');
    proche(somme(site.zones, z => z.surface), site.surface, mot + ' : les surfaces');
    assert.deepEqual(site.zones.map(z => z.id).sort(), [...new Set(ateliers.map(a => (S.FOOD.includes(a.service) ? 'food' : a.service)).concat(ateliers.some(a => a.type === 'robot') ? ['food'] : []))].sort(), mot + ' : une zone par service qui a un atelier');
    for (const k of [0, 1]) {
      const bande = site.zones.filter(z => z.bande === k).sort((p, q) => p.x - q.x);
      let x = 0;
      for (const z of bande) { proche(z.x, x, mot + ' : la bande ' + k + ' sans trou'); x += z.w; }
      if (bande.length) proche(x, site.largeur, mot + ' : la bande ' + k + ' remplie');
    }
    for (const z of site.zones) {
      assert.ok(z.w > 0 && z.h > 0 && z.surface + 1e-6 >= z.minimum, mot + ' : ' + z.id + ' a sa place');
      assert.ok(machines(z).every(m => m.w > 0 && m.h > 0 && dans(m, z)), mot + ' : les machines de ' + z.id + ' dans leur zone');
      assert.ok(disjoints(z.lignes || []) && disjoints(z.tunnels || []) && disjoints(z.rayonnages || []), mot + ' : les machines de ' + z.id + ' sans recouvrement');
    }
    assert.equal((site.zones.find(z => z.id === 'food') || { lignes: [] }).lignes.length > 0, ateliers.some(a => a.type === 'robot'), mot + ' : une ligne si un robot');
  }
});

test('deux générations des mêmes réglages sont identiques ; les réglages ne sont pas touchés', () => {
  const reglages = { ateliers: UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2)]), noms: NOMS, parcours: CHEMIN, regime: REGIME, surfaces: { cuisine: 30 } };
  const avant = JSON.stringify(reglages);
  assert.equal(JSON.stringify(S.generer(reglages)), JSON.stringify(S.generer(JSON.parse(avant))));
  assert.equal(JSON.stringify(reglages), avant);
  // L'ordre des clés de `surfaces` ou de `noms` n'y change rien.
  assert.equal(JSON.stringify(S.generer({ ...reglages, surfaces: { magasin: 10, cuisine: 30 } })), JSON.stringify(S.generer({ ...reglages, surfaces: { cuisine: 30, magasin: 10 } })));
  // Sur l'unité fictive des tests : un site, des zones pour ses services qui ont un atelier.
  const sauve = F.sauvegardeFictive().contenu['ory-ateliers-v1'], etat = typeof sauve === 'string' ? JSON.parse(sauve) : sauve;
  const fictif = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, noms: {} });
  assert.deepEqual(fictif.zones.find(z => z.id === 'food').lignes.map(l => l.ateliers), [['rb']]);
  assert.equal(fictif.zones.find(z => z.id === 'plonge').tunnels.length >= 1, true);
});

test('la part de surface se sauvegarde avec les ateliers ; une sauvegarde d’avant se restaure et prend les défauts', () => {
  const sauve = F.sauvegardeFictive().contenu['ory-ateliers-v1'], etat = typeof sauve === 'string' ? JSON.parse(sauve) : sauve;
  // Une sauvegarde d'avant : pas de parts — rien n'est inventé, la génération prend les défauts.
  const avant = A.valider(etat);
  assert.equal('surfaces' in avant, false);
  proche(S.generer({ ateliers: avant.ateliers, parcours: avant.parcours, surfaces: avant.surfaces }).zones.find(z => z.id === 'magasin').part, 0.2);
  // Avec des parts : gardées (en %, au dixième), et relues telles quelles ; une part illisible, nulle ou de plus de 100 est retirée.
  const avec = A.valider({ ...etat, surfaces: { magasin: 12.34, cuisine: '30', prepa: 0, armement: 'x', plonge: 250, quais: -5, dotation: true, decontam: [5], bobduty: ' ' } });
  assert.deepEqual(avec.surfaces, { magasin: 12.3, cuisine: 30 });
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).surfaces, { magasin: 12.3, cuisine: 30 });
  assert.equal('surfaces' in A.valider({ ...etat, surfaces: {} }), false);
});
