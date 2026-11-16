/* Évolution 20 (b) — la scène d'un site disposé par l'utilisateur (v1), sans
 * navigateur : des allées fines séparent les colonnes et les rangées, les
 * personnes et les chariots les suivent ; les avions se rangent le long du
 * bord extérieur de la zone du quai ; l'entrée et l'aire de pause sont au bord
 * du site. Sans disposition, la scène est celle d'avant.
 * Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../direct-scene.js');
const AL = require('../direct-allees.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = x => (typeof x === 'string' ? JSON.parse(x) : x);
// La journée fictive, calculée une fois ; puis la même scène, dans le site automatique et dans un site disposé.
const SAUVE = F.sauvegardeFictive(), VOLS = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const ARGS = J.argumentsDeLaJournee(SAUVE, VOLS), R = P.simuler(ARGS), K = I.journee(R, ARGS), ETAT = lire(SAUVE.contenu['ory-ateliers-v1']);
const PLAN = SAUVE.contenu['orly-plan-v3'].zones, PARENTS = S.parentsDuPlan(PLAN, Object.fromEntries(PLAN.filter(z => z.kind === 'service').map(z => [z.id, z])));
// Quatre colonnes et deux rangées du bas : la plonge sous les deux premières colonnes, le quai sous les quatre.
const QUATRE = { colonnes: [['magasin', 'decontam'], ['cuisine', 'dotation'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] };
function sceneDe(disposition) {
  const site = S.generer({ ateliers: ETAT.ateliers, parcours: ETAT.parcours, regime: ARGS.regime, parents: PARENTS, disposition });
  const personnes = new Map(R.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, ETAT.ateliers, id => personnes.get(id));
  const places = E.placesDesVols(R), aire = D.aireDe(site, places.nombre);
  return { site, ilots, places, aire };
}
const AUTO = sceneDe(null), DISPOSE = sceneDe(QUATRE), JOURNEE = { r: R, k: K };
const BORNES = (() => { const ts = R.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite); return { de: Math.floor(Math.min(...ts) / 15) * 15 - 30, a: Math.ceil(Math.max(...ts) / 15) * 15 + 60 }; })();
const HEURES = (() => { const l = []; for (let t = BORNES.de; t <= BORNES.a; t += 15) l.push(t, t + 1, t + 7.5, t + 14); return l; })();
const dansRect = (p, r, jeu = 1e-6) => p.x >= r.x - jeu && p.x <= r.x + r.w + jeu && p.y >= r.y - jeu && p.y <= r.y + r.h + jeu;
const zoneDe = (site, id) => site.zones.find(z => z.id === id);

test('le site fictif disposé : ses zones, ses allées, l’entrée et la pause au bord', () => {
  const s = DISPOSE.site;
  assert.deepEqual(s.zones.map(z => z.id).sort(), ['armement', 'cuisine', 'decontam', 'dotation', 'food', 'magasin', 'plonge', 'quais']);
  assert.equal('notes' in s, false);
  assert.deepEqual([s.allees.length, s.avions, s.entree], [7, 'bas', { x: 0, y: 0.75 }]);
  // Un îlot par équipe, dans la zone de son service, comme dans le site automatique.
  assert.deepEqual(DISPOSE.ilots.map(i => [i.atelier, i.zone]), AUTO.ilots.map(i => [i.atelier, i.zone]));
  for (const i of DISPOSE.ilots) { const z = zoneDe(s, i.zone); assert.ok(i.places.every(p => dansRect(p, z)), i.atelier + ' : ses places dans sa zone'); }
});

test('le décor : une allée au sol pour chacune ; une zone n’a pas de mur du côté où elle ouvre', () => {
  const d = D.decor(DISPOSE.site, DISPOSE.ilots, DISPOSE.aire), s = DISPOSE.site;
  const allees = d.sols.filter(x => x.ton === 'couloir');
  assert.deepEqual(allees.map(x => x.id), ['couloir', 'allee-1', 'allee-2', 'allee-3', 'allee-4', 'allee-5', 'allee-6']);
  allees.forEach((x, i) => assert.deepEqual([x.x, x.y, x.w, x.d], [s.allees[i].x, s.allees[i].y, s.allees[i].w, s.allees[i].h]));
  // Les murs : trois côtés par zone ; une zone d'une colonne ouvre à gauche, une rangée du bas en haut.
  const cotes = id => d.murs.filter(m => m.zone === id).map(m => m.cote).sort();
  assert.deepEqual([cotes('cuisine'), cotes('food'), cotes('plonge'), cotes('quais')], [['x1', 'y0', 'y1'], ['x1', 'y0', 'y1'], ['x0', 'x1', 'y1'], ['x0', 'x1', 'y1']]);
  // L'aire de pause ouvre du côté du site.
  assert.deepEqual(cotes('pause'), ['x0', 'y0', 'y1']);
  // La route et l'aire des avions : sous le site, le long du quai.
  const route = d.sols.find(x => x.id === 'route'), aire = d.sols.find(x => x.id === 'aire');
  assert.ok(Math.abs(route.y - s.profondeur) < 1e-9 && aire.y >= s.profondeur + D.ROUTE - 1e-9, 'sous le site');
  // Sans disposition : le couloir seul, et les murs d'avant.
  const avant = D.decor(AUTO.site, AUTO.ilots, AUTO.aire);
  assert.deepEqual(avant.sols.filter(x => x.ton === 'couloir').map(x => x.id), ['couloir']);
  assert.deepEqual(avant.murs.filter(m => m.zone === 'cuisine').map(m => m.cote).sort(), ['x0', 'x1', zoneDe(AUTO.site, 'cuisine').bande === 0 ? 'y0' : 'y1']);
});

test('le chemin par les allées : de porte en porte, par leur milieu, au plus court', () => {
  const s = DISPOSE.site, portes = s.zones.map(z => z.porte);
  for (const de of portes) for (const vers of portes) {
    const c = AL.chemin(s, de, vers), tout = [de, ...c, vers];
    assert.ok(c.length >= 1, 'au moins un point');
    for (const p of c) assert.ok(AL.dansUneAllee(s, p), 'chaque point est dans une allée : ' + JSON.stringify(p));
    // De point en point : tout droit, le long d'une allée (jamais en biais).
    for (let i = 1; i < c.length; i++) assert.ok(Math.abs(c[i].x - c[i - 1].x) < 1e-9 || Math.abs(c[i].y - c[i - 1].y) < 1e-9, 'sans biais');
    // Le milieu de chaque tronçon est dans une allée aussi : le chemin ne traverse aucune zone.
    for (let i = 1; i < c.length; i++) assert.ok(AL.dansUneAllee(s, { x: (c[i].x + c[i - 1].x) / 2, y: (c[i].y + c[i - 1].y) / 2 }), 'un tronçon dans une allée');
    // Chaque porte est au bord de l'allée qu'on rejoint : à une demi-allée de son milieu.
    assert.ok(Math.hypot(tout[1].x - de.x, tout[1].y - de.y) <= 0.75 + 1e-6 && Math.hypot(c[c.length - 1].x - vers.x, c[c.length - 1].y - vers.y) <= 0.75 + 1e-6);
  }
  // Le même chemin à chaque fois ; l'aller et le retour ont la même longueur.
  const lg = c => c.slice(1).reduce((n, p, i) => n + Math.abs(p.x - c[i].x) + Math.abs(p.y - c[i].y), 0);
  const a = zoneDe(s, 'magasin').porte, b = zoneDe(s, 'armement').porte;
  assert.deepEqual(AL.chemin(s, a, b), AL.chemin(s, a, b));
  assert.ok(Math.abs(lg(AL.chemin(s, a, b)) - lg(AL.chemin(s, b, a))) < 1e-9);
  // Du magasin (première colonne) à l'armement (dernière) : par l'allée du haut ou par celle du quai — la plus courte des deux.
  const haut = lg([{ x: a.x - 0.75, y: a.y }, { x: a.x - 0.75, y: 0.75 }, { x: b.x - 0.75, y: 0.75 }, { x: b.x - 0.75, y: b.y }]);
  assert.ok(lg(AL.chemin(s, a, b)) <= haut + 1e-9);
  // Jusqu'à l'entrée : le chemin finit à l'entrée, au bout de l'allée du haut.
  const fin = AL.chemin(s, zoneDe(s, 'cuisine').porte, s.entree).pop();
  assert.ok(Math.abs(fin.x - s.entree.x) < 1e-9 && Math.abs(fin.y - s.entree.y) < 1e-9);
  // Un chemin redemandé est le même, sans être le même objet : qui le reçoit peut le changer sans toucher au suivant.
  const premier = AL.chemin(s, a, b); premier.push({ x: -1, y: -1 }); premier[0].x = -9;
  assert.deepEqual(AL.chemin(s, a, b), AL.chemin(s, a, b));
  assert.ok(AL.chemin(s, a, b).every(p => p.x >= 0));
  // Sans allées (le site automatique) : aucun point — tout droit, comme avant.
  assert.deepEqual(AL.chemin(AUTO.site, AUTO.site.zones[0].porte, AUTO.site.zones[1].porte), []);
  assert.deepEqual(AL.chemin(null, a, b), []);
});

test('les personnes et les chariots suivent les allées : à chaque heure, chacun est dans sa zone, dans une allée, dans la pause ou sur la route', () => {
  const s = DISPOSE.site, aire = DISPOSE.aire;
  const dehors = { x: aire.x, y: s.profondeur, w: aire.w, h: aire.y + aire.h - s.profondeur };   // la route et l'aire des avions
  const permis = (p, zone) => (zone && dansRect(p, zone, 0.6)) || AL.dansUneAllee(s, p, 0.05) || dansRect(p, s.pause, 0.6) || dansRect(p, dehors, 0.6);
  let enChemin = 0, pousses = 0;
  for (const t of HEURES) {
    // Les personnes : à leur poste (dans leur zone), en pause, ou en chemin par les allées.
    for (const p of D.personnages(DISPOSE, JOURNEE, t)) {
      assert.ok(permis(p, zoneDe(s, p.zone)), 'à ' + P.hhmm(t) + ', une personne de ' + p.atelier + ' (' + p.etat + ') hors des allées : ' + p.x.toFixed(2) + ', ' + p.y.toFixed(2));
      if (p.enChemin) enChemin++;
    }
    // Les chariots : dans une file ou un îlot (une zone), ou en chemin par les allées ; les retours, depuis le bord du quai.
    const c = D.circulation(DISPOSE, JOURNEE, t);
    for (const x of c.chariots) {
      const ici = s.zones.find(z => dansRect(x, z, 0.6));
      assert.ok(ici || AL.dansUneAllee(s, x, 0.05) || dansRect(x, dehors, 0.6), 'à ' + P.hhmm(t) + ', un chariot (' + x.etat + ', ' + x.service + ') hors des zones et des allées : ' + x.x.toFixed(2) + ', ' + x.y.toFixed(2));
      if (x.enChemin) pousses++;
    }
    // Les véhicules et les avions : dehors, sous le site.
    for (const v of c.vehicules) assert.ok(dansRect(v, dehors, 0.6), 'un véhicule sur la route ou sur l’aire');
    for (const a of c.avions) assert.ok(a.y > s.profondeur + D.ROUTE - 1e-6, 'un avion sous le site');
  }
  assert.ok(enChemin > 0 && pousses > 0, 'des personnes et des chariots en chemin dans la journée (' + enChemin + ', ' + pousses + ')');
});

test('ce qui est compté ne change pas : les mêmes personnes, les mêmes chariots, les mêmes véhicules que dans le site automatique', () => {
  for (const t of HEURES.filter((_, i) => i % 3 === 0)) {
    const a = D.circulation(AUTO, JOURNEE, t), d = D.circulation(DISPOSE, JOURNEE, t);
    const compte = c => [c.chariots.length, c.pousseurs.length, c.vehicules.length, c.avions.length, c.tunnels, c.lignes.map(l => [l.atelier, l.debit])];
    assert.deepEqual(compte(d), compte(a), 'à ' + P.hhmm(t));
    assert.deepEqual(d.chariots.map(x => [x.etat, x.service, x.ton]), a.chariots.map(x => [x.etat, x.service, x.ton]), 'à ' + P.hhmm(t));
    const pa = D.personnages(AUTO, JOURNEE, t), pd = D.personnages(DISPOSE, JOURNEE, t);
    assert.deepEqual(pd.map(p => [p.atelier, p.i, p.etat]), pa.map(p => [p.atelier, p.i, p.etat]), 'à ' + P.hhmm(t));
  }
});

test('les avions le long du bord extérieur du quai : en bas sous une rangée, à droite dans la dernière colonne', () => {
  // En bas : la route longe le bas du site, les places sont dessous, en rangs centrés ; la boîte à cadrer les contient.
  const s = DISPOSE.site, aire = DISPOSE.aire, quai = zoneDe(s, 'quais');
  assert.deepEqual([aire.route.y, aire.route.h, aire.y], [s.profondeur, D.ROUTE, s.profondeur + D.ROUTE]);
  assert.equal(aire.places.length, DISPOSE.places.nombre);
  assert.ok(aire.places.every(p => p.y > aire.y && p.y < aire.y + aire.h && p.x > aire.x && p.x < aire.x + aire.w));
  const b = D.boite(s, aire);
  assert.ok(b.y1 >= aire.y + aire.h && b.x0 <= Math.min(s.emprise.x0, aire.x) && b.x1 >= Math.max(s.largeur, aire.x + aire.w));
  // Un véhicule part du milieu du bord du quai, prend la route, rejoint son avion.
  const camions = HEURES.flatMap(t => D.circulation(DISPOSE, JOURNEE, t).vehicules);
  assert.ok(camions.length > 0);
  assert.ok(camions.every(v => v.y >= s.profondeur - 1e-6));
  // Au départ d'une tournée (son avance est nulle), le véhicule est au milieu du bord du quai, du côté des avions.
  const depart = { x: quai.x + quai.w / 2, y: s.profondeur };
  let vus = 0;
  for (let t = BORNES.de; t <= BORNES.a; t += 1) {
    const partant = E.vehiculesA(R, t).find(c => c.avance < 0.02); if (!partant) continue;
    const v = D.circulation(DISPOSE, JOURNEE, t).vehicules.find(x => x.cle === partant.cle);
    assert.ok(Math.hypot(v.x - depart.x, v.y - depart.y) < 3, 'à ' + P.hhmm(t) + ', un véhicule qui part est au bord du quai : ' + v.x.toFixed(1) + ', ' + v.y.toFixed(1)); vus++;
  }
  assert.ok(vus > 0, 'des départs de tournée dans la journée');
  // À droite : le quai dans la dernière colonne — l'aire d'avant, à droite du site.
  const droite = sceneDe({ colonnes: [['magasin', 'decontam'], ['cuisine', 'dotation', 'plonge'], ['food'], ['quais', 'armement']], rangees: [] });
  assert.equal(droite.site.avions, 'droite');
  assert.ok(droite.aire.x >= droite.site.largeur + D.ROUTE - 1e-9 && Math.abs(droite.aire.route.x - droite.site.largeur) < 1e-9);
  for (const t of HEURES.filter((_, i) => i % 5 === 0)) for (const v of D.circulation(droite, JOURNEE, t).vehicules) assert.ok(v.x >= droite.site.largeur - 1e-6, 'un véhicule à droite du site');
  // Le quai au milieu du site (aucun bord extérieur) : les avions à droite ; les véhicules partent du bout de l'allée du haut,
  // au bord du site — ils ne traversent aucune zone ; les retours sales en reviennent par les allées.
  const milieu = sceneDe({ colonnes: [['magasin', 'decontam'], ['cuisine', 'quais', 'dotation'], ['food', 'plonge'], ['armement']], rangees: [] }), sm = milieu.site;
  assert.equal(sm.avions, 'droite');
  for (let t = BORNES.de; t <= BORNES.a; t += 7) {
    const c = D.circulation(milieu, JOURNEE, t);
    for (const v of c.vehicules) assert.ok(v.x >= sm.largeur - 1e-6, 'à ' + P.hhmm(t) + ', un véhicule hors du site');
    for (const x of c.chariots.filter(k => k.etat === 'arrive')) assert.ok(sm.zones.some(z => dansRect(x, z, 0.6)) || AL.dansUneAllee(sm, x, 0.05) || x.x >= sm.largeur - 1e-6, 'à ' + P.hhmm(t) + ', un retour hors des allées');
  }
  let departs = 0;
  for (let t = BORNES.de; t <= BORNES.a; t += 1) {
    const partant = E.vehiculesA(R, t).find(c => c.avance < 0.02); if (!partant) continue;
    const v = D.circulation(milieu, JOURNEE, t).vehicules.find(x => x.cle === partant.cle);
    assert.ok(Math.hypot(v.x - sm.largeur, v.y - (sm.couloir.y + sm.couloir.h / 2)) < 3, 'un véhicule qui part est au bout de l’allée du haut'); departs++;
  }
  assert.ok(departs > 0);
  // Sans avion : pas d'aire.
  assert.equal(D.aireDe(s, 0), null);
});

test('sans disposition, la scène est celle d’avant : mêmes positions, à chaque heure', () => {
  // Le site automatique n'a ni allées ni côté ouvert : rien de ce module ne joue.
  assert.equal('allees' in AUTO.site, false);
  const sansModule = sceneDe(undefined);
  for (const t of HEURES.filter((_, i) => i % 4 === 0)) {
    assert.deepEqual(D.circulation(sansModule, JOURNEE, t), D.circulation(AUTO, JOURNEE, t));
    assert.deepEqual(D.personnages(sansModule, JOURNEE, t), D.personnages(AUTO, JOURNEE, t));
  }
  // L'aire des avions : à droite, comme avant.
  assert.ok(AUTO.aire.x >= AUTO.site.largeur + D.ROUTE - 1e-9);
});
