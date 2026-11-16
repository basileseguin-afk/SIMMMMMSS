/* Évolution 20 (b) — le site de la vue en direct, disposé par l'utilisateur
 * (moteur/site.js avec une `disposition`, tracée par moteur/disposition.js).
 *   — sans disposition : le site d'aujourd'hui, champ par champ ;
 *   — avec : les zones là où la disposition les met ; leurs tailles viennent
 *     toujours des parts de surface ; un rectangle sans trou ; des allées ;
 *     l'entrée et l'aire de pause au bord ; les avions le long du bord
 *     extérieur de la zone du quai ;
 *   — une zone oubliée, en double, disparue : le site le dit.
 * Sans navigateur. Unités fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/site.js');
const D = require('../moteur/disposition.js');
const A = require('../ateliers.js');
const F = require('./plan-rejoue-fictif.cjs');
const { REGIME, atelier, NOMS, CHEMIN, UNITE, unitesDeReference, etatDe } = require('./site-unites.cjs');
const AVANT = require('./site-avant-20.attendu.json');

const PLUS = [atelier('pa', 'patisserie', 'manuel', '04:00', 4), atelier('co', 'controle', 'manuel', '06:00', 3), atelier('rb', 'prepa', 'robot', '03:00', 2)];
const generer = (plus = {}) => S.generer({ ateliers: UNITE(PLUS), noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const zone = (site, id) => site.zones.find(z => z.id === id);
const somme = (l, f) => l.reduce((n, x) => n + f(x), 0);
const proche = (a, b, mot) => assert.ok(Math.abs(a - b) < 1e-6, (mot || '') + ' : ' + a + ' ≠ ' + b);
const dans = (m, z) => m.x >= z.x - 1e-6 && m.y >= z.y - 1e-6 && m.x + m.w <= z.x + z.w + 1e-6 && m.y + m.h <= z.y + z.h + 1e-6;
const disjoints = l => l.every((a, i) => l.every((b, j) => j <= i || a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6));
// Quatre colonnes et deux rangées du bas : la plonge sous les deux premières colonnes, le quai sous les quatre.
const QUATRE = { colonnes: [['magasin', 'cuisine'], ['food'], ['patisserie', 'controle'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] };

test('sans disposition : le site d’aujourd’hui, champ par champ', () => {
  for (const u of unitesDeReference().filter(x => !x.nom.startsWith('tirée '))) {
    for (const vide of [undefined, null, {}, { colonnes: [], rangees: [] }, { colonnes: [[], []], rangees: [] }, 'x'])
      assert.deepEqual(JSON.parse(JSON.stringify(S.generer({ ...u.reglages, disposition: vide }))), AVANT.sites[u.nom], u.nom + ' : ' + JSON.stringify(vide));
  }
  const auto = generer();
  assert.equal('allees' in auto || 'disposition' in auto, false);
  assert.ok(auto.zones.every(z => !('ouvert' in z)));
});

test('une disposition de quatre colonnes et deux rangées du bas : les zones où on les a mises, à la taille de leur part', () => {
  const auto = generer(), site = generer({ disposition: QUATRE });
  // Les mêmes zones, les mêmes parts, les mêmes surfaces, les mêmes équipes : seule leur place change.
  const pareil = z => ({ id: z.id, nom: z.nom, role: z.role, services: z.services, ateliers: z.ateliers, personnes: z.personnes, part: z.part, surface: z.surface, minimum: z.minimum });
  assert.deepEqual(site.zones.map(pareil), auto.zones.map(pareil));
  assert.equal(site.surface, auto.surface);
  // Le tracé est celui de la disposition, pour ces surfaces et cette largeur : une allée par colonne en plus de la largeur d'avant.
  proche(site.largeur, auto.largeur + 4 * D.ALLEE, 'la largeur');
  const trace = D.tracer(QUATRE, new Map(site.zones.map(z => [z.id, z.surface])), site.largeur);
  for (const z of site.zones) { const r = trace.zones.get(z.id); for (const k of ['x', 'y', 'w', 'h']) proche(z[k], r[k], z.id + '.' + k); proche(z.w * z.h, z.surface, 'la surface de ' + z.id); }
  proche(site.profondeur, trace.profondeur, 'la profondeur');
  // Un rectangle sans trou ni chevauchement : les zones et les allées le remplissent ; la somme des surfaces égale celle du site.
  const tout = [...site.zones, ...site.allees];
  assert.ok(disjoints(tout) && tout.every(r => r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= site.largeur + 1e-6 && r.y + r.h <= site.profondeur + 1e-6));
  proche(somme(tout, r => r.w * r.h), site.largeur * site.profondeur, 'pas de trou');
  proche(somme(site.zones, z => z.surface), site.surface, 'la somme des surfaces');
  proche(somme(site.zones, z => z.part), 1, 'la somme des parts');
  // Où sont les zones : les colonnes de gauche à droite, leurs zones de haut en bas ; les rangées en bas.
  const x = id => zone(site, id).x, y = id => zone(site, id).y;
  assert.ok(x('magasin') < x('food') && x('food') < x('patisserie') && x('patisserie') < x('armement'));
  assert.ok(y('magasin') < y('cuisine') && y('patisserie') < y('controle') && Math.abs(x('magasin') - x('cuisine')) < 1e-9);
  assert.ok(y('plonge') > y('cuisine') && y('quais') > y('plonge'));
  proche(zone(site, 'quais').w, site.largeur, 'le quai longe les quatre colonnes');
  proche(zone(site, 'plonge').x + zone(site, 'plonge').w, zone(site, 'patisserie').x - D.ALLEE, 'la plonge longe les deux premières');
  // Une colonne qu'aucune rangée ne longe au-delà du quai descend jusqu'à lui : l'armement plus bas que la cuisine.
  assert.ok(zone(site, 'armement').y + zone(site, 'armement').h > zone(site, 'cuisine').y + zone(site, 'cuisine').h + 1);
  // Aucune zone ne descend sous la place de ses équipes et de ses machines.
  for (const z of site.zones) assert.ok(z.surface + 1e-6 >= z.minimum, z.id);
  // Chaque zone ouvre sur une allée : sa porte est au bord de l'une d'elles ; une zone d'une colonne à gauche, une rangée en haut.
  for (const z of site.zones) assert.ok(site.allees.some(a => z.porte.x >= a.x - 1e-6 && z.porte.x <= a.x + a.w + 1e-6 && z.porte.y >= a.y - 1e-6 && z.porte.y <= a.y + a.h + 1e-6), z.id + ' : sa porte sur une allée');
  assert.deepEqual([zone(site, 'cuisine').ouvert, zone(site, 'cuisine').bande, zone(site, 'quais').ouvert, zone(site, 'quais').bande], ['gauche', 0, 'haut', 1]);
  // Les machines dans leur zone, sans recouvrement : la ligne de la production, les tunnels de la plonge, les rayonnages du magasin.
  for (const z of site.zones) { const m = [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])]; assert.ok(m.every(q => dans(q, z)) && disjoints(m), z.id); }
  assert.deepEqual([zone(site, 'food').lignes.length, zone(site, 'plonge').tunnels.length, zone(site, 'magasin').rayonnages.length >= 1], [1, 2, true]);
  // L'allée de l'entrée, en haut, tient lieu de couloir ; l'entrée est à son bout gauche, l'aire de pause à côté, au bord du site.
  assert.deepEqual(site.couloir, { x: 0, y: 0, w: site.largeur, h: D.ALLEE });
  assert.deepEqual(site.entree, { x: 0, y: D.ALLEE / 2 });
  assert.deepEqual([site.pause.x + site.pause.w, site.pause.y, site.pause.w > 0 && site.pause.h > 0], [0, 0, true]);
  assert.deepEqual(site.emprise, { x0: site.pause.x, y0: 0, x1: site.largeur, y1: site.profondeur });
  // La disposition tracée, et rien à dire.
  assert.deepEqual(site.disposition, QUATRE);
  assert.equal('notes' in site, false);
  // Les zones dans l'ordre du chemin, comme sans disposition ; deux générations identiques.
  assert.deepEqual(site.zones.map(z => z.id), auto.zones.map(z => z.id));
  assert.equal(JSON.stringify(generer({ disposition: JSON.parse(JSON.stringify(QUATRE)) })), JSON.stringify(site));
});

test('les avions : le long du bord extérieur de la zone du quai, où qu’elle soit', () => {
  // Le quai en rangée du bas, sur toute la largeur : son bord extérieur est en bas.
  assert.equal(generer({ disposition: QUATRE }).avions, 'bas');
  // Le quai dans la dernière colonne, au milieu : son bord extérieur est à droite.
  const droite = generer({ disposition: { colonnes: [['magasin', 'cuisine'], ['food', 'plonge'], ['patisserie', 'quais', 'controle', 'armement']], rangees: [] } });
  assert.equal(droite.avions, 'droite');
  // Le quai en bas de la dernière colonne : deux bords au bord du site — le plus long l'emporte.
  const coin = generer({ disposition: { colonnes: [['magasin', 'cuisine'], ['food', 'plonge'], ['patisserie', 'controle', 'armement', 'quais']], rangees: [] } }), q = zone(coin, 'quais');
  assert.equal(coin.avions, q.w > q.h ? 'bas' : 'droite');
  // Le quai en bas d'une colonne du milieu : en bas.
  assert.equal(generer({ disposition: { colonnes: [['magasin', 'cuisine'], ['food', 'quais'], ['patisserie', 'controle', 'armement', 'plonge']], rangees: [] } }).avions, 'bas');
  // Le quai au milieu du site (aucun bord extérieur), ou pas de quai : à droite, comme sans disposition.
  assert.equal(generer({ disposition: { colonnes: [['magasin', 'quais', 'cuisine'], ['food', 'plonge'], ['patisserie', 'controle', 'armement']], rangees: [] } }).avions, 'droite');
  assert.equal(S.generer({ ateliers: [atelier('cu', 'cuisine', 'manuel', '04:00', 3), atelier('ar', 'armement', 'manuel', '04:00', 3)], noms: NOMS, regime: REGIME, disposition: { colonnes: [['cuisine'], ['armement']], rangees: [] } }).avions, 'droite');
  assert.equal(generer().avions, 'droite');
});

test('une zone oubliée, une zone en double, un service qui n’existe plus : la disposition s’accorde, et le site le dit', () => {
  // La disposition ne cite ni le contrôle ni l'armement (des services ajoutés après) : à la fin de la dernière colonne.
  const oubli = generer({ disposition: { colonnes: [['magasin', 'cuisine'], ['food'], ['patisserie']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 3 }] } });
  assert.deepEqual(oubli.disposition.colonnes[2], ['patisserie', 'armement', 'controle'], 'dans l’ordre du chemin');
  assert.deepEqual(oubli.notes, [{ code: 'absente', zone: 'armement' }, { code: 'absente', zone: 'controle' }]);
  assert.ok(zone(oubli, 'controle').y > zone(oubli, 'patisserie').y && Math.abs(zone(oubli, 'controle').x - zone(oubli, 'patisserie').x) < 1e-9);
  // Une zone citée deux fois, un service qui n'existe plus : ignorés, en le disant.
  const double = generer({ disposition: { colonnes: [['magasin', 'cuisine', 'magasin'], ['food', 'disparu'], ['patisserie', 'controle'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }, { zone: 'food', de: 1, a: 4 }] } });
  assert.deepEqual(double.disposition, QUATRE);
  assert.deepEqual(double.notes, [{ code: 'double', zone: 'magasin' }, { code: 'inconnue', zone: 'disparu' }, { code: 'double', zone: 'food' }]);
  const net = generer({ disposition: QUATRE });
  assert.deepEqual(double.zones, net.zones);
  // Avec une zone partagée (évolution 20 a) : la pâtisserie rejoint la cuisine — sa zone n'existe plus, la disposition le dit.
  const partage = generer({ disposition: QUATRE, partages: { patisserie: 'cuisine' } });
  assert.deepEqual(partage.notes, [{ code: 'inconnue', zone: 'patisserie' }]);
  assert.deepEqual(partage.disposition.colonnes, [['magasin', 'cuisine'], ['food'], ['controle'], ['armement']]);
  // Les notes d'une boucle de zones partagées restent, devant celles de la disposition.
  const boucle = generer({ disposition: { colonnes: [['magasin']], rangees: [] }, partages: { cuisine: 'controle', controle: 'cuisine' } });
  assert.deepEqual(boucle.notes[0], { code: 'boucle', services: ['controle', 'cuisine'] });
  assert.ok(boucle.notes.slice(1).every(n => n.code === 'absente') && boucle.notes.length === boucle.zones.length);
});

test('sur 200 unités tirées d’une graine fixe, disposées au hasard : les règles tiennent toutes', () => {
  let graine = 20261119;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; }, entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const SERVICES = ['magasin', 'cuisine', 'preparation', 'prepa', 'armement', 'plonge', 'quais', 'dotation', 'patisserie', 'controle'];
  const TYPES = { magasin: ['dispo'], plonge: ['lavage'], quais: ['handling'] }, T = nom => ({ nom, debit: 300, personnes: 1, actif: true });
  for (let i = 0; i < 200; i++) {
    const ateliers = [];
    for (const s of SERVICES) if (alea() < 0.75) for (let k = 0, n = entier(1, 3); k < n; k++) {
      const choix = TYPES[s] || ['manuel', 'manuel', 'robot', 'appui'], type = choix[entier(0, choix.length - 1)];
      ateliers.push(atelier(s + k, s, type, String(entier(0, 23)).padStart(2, '0') + ':00', entier(0, 20), type === 'lavage' ? { parVol: true, tunnels: Array.from({ length: entier(1, 3) }, (_, j) => T('Tunnel ' + (j + 1))) } : {}));
    }
    const base = { ateliers, noms: NOMS, parcours: alea() < 0.5 ? CHEMIN : undefined, regime: REGIME, partages: alea() < 0.3 ? { patisserie: 'cuisine' } : {} };
    const auto = S.generer(base), ids = auto.zones.map(z => z.id), n = entier(1, 5), d = { colonnes: Array.from({ length: n }, () => []), rangees: [] };
    // Des zones dans des colonnes, d'autres en rangées du bas ; certaines oubliées, certaines en double, une inconnue.
    for (const id of ids) { const r = alea(); if (r < 0.1) continue; if (r < 0.3) { const de = entier(1, n); d.rangees.push({ zone: id, de, a: entier(de, n) }); } else d.colonnes[entier(0, n - 1)].push(id); if (alea() < 0.1) d.colonnes[entier(0, n - 1)].push(id); }
    if (alea() < 0.2) d.colonnes[0].push('inconnue');
    const site = S.generer({ ...base, disposition: d }), mot = 'unité ' + i;
    if (!ids.length) { assert.equal(site.zones.length, 0, mot); continue; }
    if (D.vide(D.lire(d))) { assert.deepEqual(site, auto, mot + ' : une disposition vide'); continue; }
    assert.deepEqual(site.zones.map(z => z.id), ids, mot + ' : les mêmes zones');
    for (const z of site.zones) {
      const a = auto.zones.find(q => q.id === z.id);
      assert.deepEqual([z.part, z.surface, z.minimum, z.ateliers], [a.part, a.surface, a.minimum, a.ateliers], mot + ' : ' + z.id);
      proche(z.w * z.h, z.surface, mot + ' : la surface de ' + z.id);
      const m = [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])];
      assert.ok(m.every(q => q.w > 0 && q.h > 0 && dans(q, z)) && disjoints(m), mot + ' : les machines de ' + z.id);
      assert.ok(site.allees.some(q => z.porte.x >= q.x - 1e-6 && z.porte.x <= q.x + q.w + 1e-6 && z.porte.y >= q.y - 1e-6 && z.porte.y <= q.y + q.h + 1e-6), mot + ' : la porte de ' + z.id);
    }
    const tout = [...site.zones, ...site.allees];
    assert.ok(disjoints(tout), mot + ' : sans chevauchement');
    proche(somme(tout, r => r.w * r.h), site.largeur * site.profondeur, mot + ' : sans trou');
    assert.ok(['droite', 'bas'].includes(site.avions), mot);
    assert.equal(JSON.stringify(S.generer({ ...base, disposition: JSON.parse(JSON.stringify(d)) })), JSON.stringify(site), mot + ' : deux générations identiques');
    // La disposition tracée cite chaque zone une fois.
    assert.deepEqual([...site.disposition.colonnes.flat(), ...site.disposition.rangees.map(r => r.zone)].sort(), ids.slice().sort(), mot);
  }
});

test('la disposition se sauvegarde avec les équipes ; une sauvegarde d’avant se relit sans elle', () => {
  const etat = etatDe(F.sauvegardeFictive());
  assert.equal('disposition' in A.valider(etat), false);
  const avec = A.valider({ ...etat, disposition: { colonnes: [['cuisine', 7, ''], [], ['food']], rangees: [{ zone: 'quais', de: 0, a: 9 }, { zone: '' }], autre: 1 } });
  assert.deepEqual(avec.disposition, { colonnes: [['cuisine'], [], ['food']], rangees: [{ zone: 'quais', de: 1, a: 3 }] });
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).disposition, avec.disposition);
  for (const vide of [{}, { colonnes: [], rangees: [] }, { colonnes: [[]], rangees: [] }, null, 'x', []]) assert.equal('disposition' in A.valider({ ...etat, disposition: vide }), false, JSON.stringify(vide));
});
