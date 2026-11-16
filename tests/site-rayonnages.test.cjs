/* Évolution 20 (d) — des rayonnages et des postes dans la même zone.
 * Un réglage de plus dans la fiche d'un service : « Des rayonnages dans sa
 * zone » (non par défaut ; le magasin en a toujours). Les rayonnages se
 * rangent au fond de la zone ; les îlots des équipes (tables, chariots,
 * machine) gardent leur poste de travail et se placent devant, sans
 * chevauchement. La zone garde la place des deux. Sans le réglage, le site
 * et ses îlots sont ceux d'avant.
 * Sans navigateur. Unités, équipes et services fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../moteur/site.js');
const D = require('../direct-scene.js');
const A = require('../ateliers.js');
const { REGIME, atelier, T, NOMS, CHEMIN, UNITE, unitesDeReference, reference, unitesTirees } = require('./site-unites.cjs');

const generer = (ateliers, plus = {}) => S.generer({ ateliers, noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const zone = (site, id) => site.zones.find(z => z.id === id);
const dans = (m, z, jeu = 1e-6) => m.x >= z.x - jeu && m.y >= z.y - jeu && m.x + m.w <= z.x + z.w + jeu && m.y + m.h <= z.y + z.h + jeu;
const seTouchent = (p, q, jeu = 1e-6) => p.x < q.x + q.w - jeu && q.x < p.x + p.w - jeu && p.y < q.y + q.h - jeu && q.y < p.y + p.h - jeu;
const disjoints = l => l.every((p, i) => l.slice(i + 1).every(q => !seTouchent(p, q)));
/** Les îlots posés devant les machines (tables, chariots, sans poste) d'une zone, et ses meubles : des rectangles { x, y, w, h }. */
const ilotsLibres = (ilots, id) => ilots.filter(i => i.zone === id && !i.machines && !i.allee || (i.zone === id && i.rangs.length));
const meubles = i => [...i.tables.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.d })), ...i.rangs.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.d })), ...i.trolleys.map(p => ({ x: p.x - 0.2, y: p.y - 0.3, w: 0.4, h: 0.6 }))];
/** Le fond d'une zone : le côté opposé au couloir. La distance d'un rectangle à ce fond. */
const duFond = (m, z) => (z.bande === 0 ? m.y - z.y : z.y + z.h - (m.y + m.h));
/** Contrôle une zone qui a des rayonnages au fond et des îlots devant : tout est dans la zone, rien ne se chevauche, les îlots sont devant. */
function controler(site, ilots, id, mot) {
  const z = zone(site, id), rayons = z.rayonnages || [], libres = ilotsLibres(ilots, id);
  assert.ok(rayons.length > 0, mot + ' : des rayonnages');
  assert.ok(rayons.every(r => r.w > 0 && r.h > 0 && dans(r, z)), mot + ' : les rayonnages dans la zone');
  assert.ok(disjoints([...rayons, ...(z.lignes || []), ...(z.tunnels || [])]), mot + ' : les machines sans recouvrement');
  const profondeur = Math.max(...rayons.map(r => duFond(r, z) + r.h));
  for (const i of libres) {
    assert.ok(dans(i, z, 1e-6), mot + ' : l’îlot de ' + i.atelier + ' dans la zone');
    for (const r of rayons) assert.ok(!seTouchent(i, r), mot + ' : l’îlot de ' + i.atelier + ' ne chevauche aucun rayonnage');
    for (const m of meubles(i)) for (const r of rayons) assert.ok(!seTouchent(m, r), mot + ' : un meuble de ' + i.atelier + ' sur un rayonnage');
    for (const p of i.places) for (const r of rayons) assert.ok(!(p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h), mot + ' : une personne de ' + i.atelier + ' dans un rayonnage');
    assert.ok(duFond(i, z) >= profondeur - 1e-6, mot + ' : l’îlot de ' + i.atelier + ' est devant les rayonnages');
  }
  assert.ok(disjoints(libres), mot + ' : les îlots ne se chevauchent pas');
  return { z, rayons, libres };
}
const scene = (ateliers, plus) => { const site = generer(ateliers, plus); return { site, ilots: D.ilots(site, ateliers) }; };

test('sans le réglage, le site et ses îlots sont ceux d’aujourd’hui, champ par champ', () => {
  const attendu = JSON.parse(fs.readFileSync(path.join(__dirname, 'site-avant-20.attendu.json'), 'utf8')), r = reference(S);
  // (La référence est celle d'avant l'évolution 20 : les unités nommées n'ont rien que les parties a, b et c changent.)
  assert.deepEqual(r.empreintes, attendu.empreintes);
  assert.deepEqual(r.sites, attendu.sites);
  // Un réglage vide, illisible, faux, ou pour un service sans équipe : le même site, sans un champ de plus.
  const base = generer(UNITE());
  for (const vide of [undefined, null, {}, [], 'cuisine', 7, { cuisine: false }, { cuisine: 'oui' }, { cuisine: 1 }, { inconnu: true }, JSON.parse('{"__proto__":true,"constructor":true}')]) {
    assert.deepEqual(generer(UNITE(), { rayonnages: vide }), base, JSON.stringify(vide));
  }
  // Seul le magasin a des rayonnages ; ses équipes y travaillent : un entrepôt, sur toute sa profondeur.
  assert.deepEqual(base.zones.filter(z => z.rayonnages).map(z => z.id), ['magasin']);
  const mag = zone(base, 'magasin'), fond = Math.max(...mag.rayonnages.map(r => duFond(r, mag) + r.h));
  assert.ok(fond > mag.h * 0.7, 'l’entrepôt : des rangées jusque devant');
  // Les îlots d'avant, pour chaque unité de la référence : une zone sans rayonnages n'a pas bougé.
  for (const u of unitesDeReference().slice(0, 12)) {
    const site = S.generer(u.reglages), avec = S.generer({ ...u.reglages, rayonnages: {} });
    assert.deepEqual(D.ilots(avec, u.reglages.ateliers), D.ilots(site, u.reglages.ateliers), u.nom);
  }
});

test('une zone avec rayonnages et tables : les deux sont dessinés, les rayonnages au fond, les tables devant, sans chevauchement', () => {
  const sans = scene(UNITE()), avec = scene(UNITE(), { rayonnages: { cuisine: true } });
  assert.equal('rayonnages' in zone(sans.site, 'cuisine'), false);
  const { z, rayons, libres } = controler(avec.site, avec.ilots, 'cuisine', 'la cuisine');
  // Les rayonnages sont au fond : contre le mur du fond, sur toute la largeur.
  assert.ok(Math.min(...rayons.map(r => duFond(r, z))) < 1, 'contre le fond');
  assert.ok(rayons.every(r => r.w > z.w * 0.5), 'en rangs sur la largeur');
  assert.ok(Math.max(...rayons.map(r => duFond(r, z) + r.h)) <= z.h * 0.5 + 1e-6, 'la moitié de la profondeur au plus');
  // L'équipe garde son poste de travail : ses tables, une pour deux personnes, comme sans le réglage.
  const cu = libres.find(i => i.atelier === 'cu'), avant = sans.ilots.find(i => i.atelier === 'cu');
  assert.deepEqual([cu.poste, cu.tables.length, cu.places.length, cu.echelle], [avant.poste, avant.tables.length, avant.places.length, 1]);
  assert.deepEqual([cu.poste, cu.tables.length], ['tables', 3]);
  // Les deux sont dessinés : chaque rangée, chaque table — aucune rangée ne s'efface.
  const decor = D.decor(avec.site, avec.ilots, null), objets = decor.objets.filter(o => o.zone === 'cuisine');
  assert.equal(objets.filter(o => o.quoi === 'rayonnage').length, rayons.length);
  assert.equal(objets.filter(o => o.quoi === 'table').length, 3);
  // La zone garde la place des deux : sa place minimale est celle de ses équipes, plus celle des rayonnages (20 m²) — vu
  // sur une cuisine assez grande pour que sa place soit celle de ses équipes (une petite a un minimum de largeur).
  const grande = UNITE([atelier('cu2', 'cuisine', 'manuel', '05:00', 30)]);
  const place = plus => zone(generer(grande, plus), 'cuisine').minimum;
  assert.ok(Math.abs(place({ rayonnages: { cuisine: true } }) - place() - 20) < 1e-9, 'la place des équipes, plus celle des rayonnages : ' + place() + ' → ' + place({ rayonnages: { cuisine: true } }));
  assert.ok(zone(avec.site, 'cuisine').minimum > zone(sans.site, 'cuisine').minimum, 'une place minimale plus grande');
  assert.ok(z.surface >= z.minimum - 1e-9, 'la zone a au moins sa place');
  // Les autres zones gardent leurs équipes et leurs machines.
  assert.deepEqual(avec.site.zones.map(q => [q.id, q.ateliers, (q.tunnels || []).length, (q.lignes || []).length]), sans.site.zones.map(q => [q.id, q.ateliers, (q.tunnels || []).length, (q.lignes || []).length]));
});

test('des chariots, une machine : chaque équipe garde son poste, devant les rayonnages', () => {
  // L'armement travaille sur des trolleys ; la plonge à ses tunnels ; une équipe sans poste.
  const ateliers = UNITE([atelier('ar2', 'armement', 'manuel', '13:00', 8), atelier('libre', 'armement', 'appui', '05:00', 3, { poste: 'aucun' })]);
  const { site, ilots } = scene(ateliers, { rayonnages: { armement: true, plonge: true } });
  const a = controler(site, ilots, 'armement', 'l’armement');
  assert.deepEqual(a.libres.map(i => [i.atelier, i.poste, i.trolleys.length > 0]), [['ar', 'trolleys', true], ['ar2', 'trolleys', true], ['libre', 'aucun', false]]);
  // La plonge : ses tunnels devant les rayonnages, sans recouvrement ; son équipe est à ses tunnels.
  const p = controler(site, ilots, 'plonge', 'la plonge'), pl = ilots.find(i => i.atelier === 'pl');
  assert.equal(p.z.tunnels.length, 2);
  assert.ok(p.z.tunnels.every(t => dans(t, p.z)));
  assert.ok(Math.min(...p.z.tunnels.map(t => duFond(t, p.z))) >= Math.max(...p.rayons.map(r => duFond(r, p.z) + r.h)) - 1e-6, 'les tunnels devant les rayonnages');
  assert.equal(pl.machines, 2);
  // Une équipe réglée sur « rayonnages » travaille entre eux, comme au magasin.
  const entre = scene(UNITE([atelier('cu2', 'cuisine', 'manuel', '05:00', 2, { poste: 'rayonnages' })]), { rayonnages: { cuisine: true } });
  controler(entre.site, entre.ilots, 'cuisine', 'la cuisine, une équipe aux rayonnages');
  const cu2 = entre.ilots.find(i => i.atelier === 'cu2');
  assert.equal(cu2.rangs.length, 0, 'pas de rangs à elle : elle travaille à ceux de la zone');
  assert.ok(cu2.places.every(q => dans({ x: q.x, y: q.y, w: 0, h: 0 }, zone(entre.site, 'cuisine'))));
});

test('le magasin en a toujours : seul, l’entrepôt d’aujourd’hui ; au fond dès qu’il partage sa zone', () => {
  // Seul avec ses équipes : un entrepôt, comme aujourd'hui — le site ne dépend pas du poste de ses équipes.
  const ateliers = UNITE([atelier('colis', 'magasin', 'manuel', '06:00', 4, { poste: 'tables' })]), site = generer(ateliers);
  assert.deepEqual(site, generer(ateliers.map(a => (a.id === 'colis' ? { ...a, poste: 'rayonnages' } : a))), 'le même site, quel que soit le poste');
  assert.equal('rayonnagesAuFond' in zone(site, 'magasin'), false);
  // Le réglage n'ajoute rien au magasin.
  assert.deepEqual(generer(ateliers, { rayonnages: { magasin: true } }), site);
  // Un service qui partage la zone du magasin (évolution 20 a) : les rayonnages au fond, les postes devant.
  const partage = scene(UNITE(), { partages: { cuisine: 'magasin' } });
  assert.equal(zone(partage.site, 'magasin').rayonnagesAuFond, true);
  controler(partage.site, partage.ilots, 'magasin', 'le magasin et la cuisine');
  // Un service qui a le réglage et partage la zone d'un autre : c'est cette zone qui a les rayonnages.
  const chezLAutre = scene(UNITE(), { partages: { cuisine: 'armement' }, rayonnages: { cuisine: true } });
  controler(chezLAutre.site, chezLAutre.ilots, 'armement', 'l’armement et la cuisine');
  assert.equal(zone(chezLAutre.site, 'cuisine'), undefined);
  // Une zone avec le réglage le dit : `rayonnagesAuFond` ; sans lui, pas de champ de plus.
  assert.equal(zone(generer(UNITE(), { rayonnages: { cuisine: true } }), 'cuisine').rayonnagesAuFond, true);
  assert.equal(generer(UNITE()).zones.some(z => 'rayonnagesAuFond' in z), false);
});

test('la production : des rayonnages derrière la ligne robotisée ; dans un site disposé ; une zone étroite', () => {
  const ateliers = UNITE([atelier('rb', 'prepa', 'robot', '03:00', 2)]);
  const { site, ilots } = scene(ateliers, { rayonnages: { prepa: true } }), f = controler(site, ilots, 'food', 'la production');
  assert.equal(f.z.lignes.length, 1);
  assert.ok(duFond(f.z.lignes[0], f.z) >= Math.max(...f.rayons.map(r => duFond(r, f.z) + r.h)) - 1e-6, 'la ligne devant les rayonnages');
  // Un site disposé (évolution 20 b) : des colonnes, une rangée du bas — la cuisine en tranche fine.
  const disposition = { colonnes: [['magasin', 'cuisine'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 3 }] };
  for (const reglees of [{ cuisine: true }, { cuisine: true, plonge: true, quais: true, armement: true, prepa: true }]) {
    const d = scene(UNITE(), { disposition, rayonnages: reglees });
    assert.ok(d.site.allees.length > 0);
    for (const z of d.site.zones.filter(q => q.rayonnagesAuFond)) controler(d.site, d.ilots, z.id, 'site disposé, ' + z.id);
  }
  // Une zone de moins d'un mètre de profondeur (une colonne très large, une part minuscule) : les îlots restent devant les machines.
  const plate = scene(UNITE(), { disposition: { colonnes: [['magasin', 'cuisine', 'food', 'armement', 'quais', 'plonge']], rangees: [] }, rayonnages: { plonge: true, cuisine: true }, surfaces: { plonge: 0.05, cuisine: 0.05 } });
  for (const id of ['plonge', 'cuisine']) {
    const zp = zone(plate.site, id), machines = [...zp.rayonnages, ...(zp.tunnels || [])];
    assert.ok(machines.every(m => m.w > 0 && m.h > 0 && dans(m, zp)) && disjoints(machines), id + ' plate : ses machines');
    for (const i of ilotsLibres(plate.ilots, id)) { assert.ok(i.w > 0 && i.h > 0 && dans(i, zp), id + ' plate : îlot dans la zone'); for (const m of machines) assert.ok(!seTouchent(i, m), id + ' plate : îlot de ' + i.atelier + ' sur une machine'); }
  }
  // Une part de surface minuscule : la zone garde quand même la place des deux.
  const petit = scene(UNITE([atelier('cu2', 'cuisine', 'manuel', '05:00', 12)]), { rayonnages: { cuisine: true }, surfaces: { cuisine: 0.1 } });
  const c = controler(petit.site, petit.ilots, 'cuisine', 'une petite part');
  assert.ok(c.z.surface >= c.z.minimum - 1e-9);
});

test('200 unités tirées, des rayonnages au hasard : jamais un îlot sur un rayonnage, jamais hors de sa zone', () => {
  let graine = 4242;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };
  const POSTES = ['tables', 'trolleys', 'aucun', 'rayonnages', undefined, undefined];
  let vues = 0;
  for (const u of unitesTirees(200)) {
    const ateliers = u.reglages.ateliers.map(a => { const p = POSTES[Math.floor(alea() * POSTES.length)]; return p && a.type !== 'robot' && a.type !== 'lavage' && a.type !== 'handling' ? { ...a, poste: p } : a; });
    const services = [...new Set(ateliers.map(a => a.service))], rayonnages = Object.fromEntries(services.filter(() => alea() < 0.5).map(s => [s, true]));
    const disposition = alea() < 0.3 ? { colonnes: [services.filter((_, i) => i % 2 === 0), services.filter((_, i) => i % 2 === 1)], rangees: [] } : null;
    const site = S.generer({ ...u.reglages, ateliers, rayonnages, ...(disposition ? { disposition } : {}) }), ilots = D.ilots(site, ateliers);
    assert.equal(ilots.length, ateliers.filter(a => site.zones.some(z => z.services.includes(a.service) || (z.lignes || []).some(l => l.ateliers.includes(a.id)))).length, u.nom + ' : un îlot par équipe');
    // Un entrepôt (le magasin seul) reste celui d'aujourd'hui : seules les zones aux rayonnages rangés au fond sont contrôlées.
    for (const z of site.zones.filter(q => q.rayonnagesAuFond)) {
      // Avec des lignes ou des tunnels dans la même zone aussi : les îlots sont devant toutes ses machines.
      const z2 = zone(site, z.id), rayons = z2.rayonnages, machines = [...rayons, ...(z2.lignes || []), ...(z2.tunnels || [])];
      assert.ok(machines.every(r => r.w > 0 && r.h > 0 && dans(r, z2)) && disjoints(machines), u.nom + ' ' + z.id + ' : machines');
      for (const i of ilotsLibres(ilots, z.id)) {
        assert.ok(i.w > 0 && i.h > 0 && dans(i, z2, 1e-6), u.nom + ' ' + z.id + ' : îlot de ' + i.atelier + ' dans la zone');
        for (const m of machines) assert.ok(!seTouchent(i, m), u.nom + ' ' + z.id + ' : îlot de ' + i.atelier + ' sur une machine');
      }
      assert.ok(disjoints(ilotsLibres(ilots, z.id)), u.nom + ' ' + z.id + ' : deux îlots l’un sur l’autre');
      vues++;
    }
  }
  assert.ok(vues > 300, vues + ' zones avec rayonnages contrôlées');
});

test('le réglage se sauvegarde avec les équipes ; une sauvegarde d’avant se relit sans lui', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: UNITE(), parcours: CHEMIN };
  assert.equal('rayonnages' in A.valider(etat), false);
  const avec = A.valider({ ...etat, rayonnages: { cuisine: true, plonge: true, armement: false, quais: 'oui', dotation: 1, magasin: true } });
  assert.deepEqual(avec.rayonnages, { cuisine: true, plonge: true }, 'seulement « vrai » ; le magasin en a toujours : rien à garder');
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).rayonnages, { cuisine: true, plonge: true });
  for (const vide of [{}, null, 'x', [], 3, { cuisine: false }]) assert.equal('rayonnages' in A.valider({ ...etat, rayonnages: vide }), false, JSON.stringify(vide));
  assert.deepEqual(avec.ateliers, A.valider(etat).ateliers, 'les équipes ne portent rien de plus');
});
