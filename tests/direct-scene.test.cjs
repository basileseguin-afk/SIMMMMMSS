/* Évolution 16 (b) — la scène de la vue en direct et ce qu'elle lit de la
 * journée (v1), sans navigateur. Le décor vient du site généré : des sols, des
 * murs bas (ceux du fond seulement), les machines des réglages. Les étiquettes
 * des services disent « n au travail / n présents » et « n lots à faire », lus
 * dans les indicateurs et les stocks de la journée ; elles gardent leur taille
 * et ne se recouvrent pas à « Tout voir ». Unité et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../direct-camera.js');
const E = require('../direct-etat.js');
const D = require('../direct-scene.js');
const S = require('../moteur/site.js');
const P = require('../moteur/production.js');
const F = require('./plan-rejoue-fictif.cjs');

// La journée de l'unité fictive des tests : son résultat, ses arguments, ses indicateurs.
const J = F.heureDuPicAttendue(F.sauvegardeFictive(), F.volsCsv());
const ETAT = (() => { const s = F.sauvegardeFictive().contenu['ory-ateliers-v1']; return typeof s === 'string' ? JSON.parse(s) : s; })();
const NOMS = Object.fromEntries(F.sauvegardeFictive().contenu['orly-plan-v3'].zones.map(z => [z.id, z.nom]));
const SITE = S.generer({ ateliers: ETAT.ateliers, parcours: ETAT.parcours, noms: NOMS, regime: J.args.regime });
const journee = { r: J.resultat, k: J.k };
const entier = x => Math.abs(x - Math.round(x)) < 1e-9;

test('des personnes entières : chacune sa part, les restes aux plus grands, la somme toujours juste', () => {
  assert.deepEqual(E.repartir(5, [3, 1, 1]), [3, 1, 1]);
  assert.deepEqual(E.repartir(3, [2.6, 0.2, 0.2]), [3, 0, 0]);
  assert.deepEqual(E.repartir(4, [1.5, 1.5, 1]), [2, 1, 1], 'à égalité de reste, la première');
  assert.deepEqual(E.repartir(2, [0, 0, 0]), [2, 0, 0], 'sans part : tout à la première');
  assert.deepEqual(E.repartir(0, [3, 1]), [0, 0]);
  for (const [n, parts] of [[7, [2.2, 2.2, 2.6]], [10, [0.1, 9.7, 0.2]], [3, [1, 1, 1, 1]], [1, [0.4, 0.3, 0.3]]]) {
    const r = E.repartir(n, parts);
    assert.equal(r.reduce((s, x) => s + x, 0), n); assert.ok(r.every(x => Number.isInteger(x) && x >= 0));
  }
});

test('les personnes d’une équipe à une heure : celles du créneau des indicateurs, par état', () => {
  // Une équipe fictive, de 06:00 à 08:00 : 6 présents ; 4 au travail puis 6 ; 2 en pause au deuxième quart d'heure.
  const serie = valeurs => ({ debut: 360, valeurs });
  const equipe = { id: 'e', service: 's', jour: 0, creneaux: { presents: serie([6, 6, 6, 6, 6, 6, 6, 6]), auTravail: serie([4, 4, 6, 6, 6, 6, 3, 0]), enPause: serie([0, 2, 0, 0, 0, 0, 0, 0]) } };
  assert.deepEqual(E.personnesDe(equipe, 360), { presents: 6, auTravail: 4, enPause: 0, sansTravail: 2, enAppui: 0 });
  assert.deepEqual(E.personnesDe(equipe, 380), { presents: 6, auTravail: 4, enPause: 2, sansTravail: 0, enAppui: 0 });
  assert.deepEqual(E.personnesDe(equipe, 449), { presents: 6, auTravail: 6, enPause: 0, sansTravail: 0, enAppui: 0 });
  assert.deepEqual(E.personnesDe(equipe, 465), { presents: 6, auTravail: 0, enPause: 0, sansTravail: 6, enAppui: 0 });
  // Avant et après sa présence : personne.
  assert.deepEqual([E.personnesDe(equipe, 359).presents, E.personnesDe(equipe, 480).presents], [0, 0]);
  // Une équipe de la veille (J−1) : ses créneaux sont sur l'horloge de son jour ; 06:00 de la veille, c'est −1 080 au rejeu.
  assert.deepEqual(E.personnesDe({ ...equipe, jour: -1 }, 360 - 1440), { presents: 6, auTravail: 4, enPause: 0, sansTravail: 2, enAppui: 0 });
  assert.equal(E.personnesDe({ ...equipe, jour: -1 }, 360).presents, 0);
  // Une équipe d'appui, une mise à disposition, un handling : présents sans mesure d'occupation — « en appui ».
  assert.deepEqual(E.personnesDe({ id: 'a', jour: 0, creneaux: { presents: serie([3]), auTravail: null, enAppui: serie([3]) } }, 365), { presents: 3, auTravail: 0, enPause: 0, sansTravail: 0, enAppui: 3 });
  // Un créneau entamé (une arrivée à 06:10 : 2 personnes × 5 min sur 15) : des personnes entières, la somme égale aux présents.
  const entame = E.personnesDe({ id: 'f', jour: 0, creneaux: { presents: serie([2 / 3 * 4]), auTravail: serie([1.9]), enPause: serie([0]) } }, 362);
  assert.deepEqual(entame, { presents: 3, auTravail: 2, enPause: 0, sansTravail: 1, enAppui: 0 });
});

test('sur la journée fictive : à chaque créneau, les personnes de chaque équipe sont celles des indicateurs', () => {
  let compares = 0;
  for (const e of J.k.equipes) {
    const c = e.creneaux; if (!c.presents) continue;
    c.presents.valeurs.forEach((n, i) => {
      const local = c.presents.debut + i * 15, t = local + e.jour * 1440, p = E.personnesDe(e, t + 7);
      const lu = m => (c[m] ? E.valeurA(c[m], local) : 0);
      assert.equal(p.presents, Math.round(n), e.id + ' à ' + P.hhmm(t));
      assert.equal(p.auTravail + p.enPause + p.sansTravail + p.enAppui, p.presents, e.id + ' : la somme des états');
      // Quand le créneau est entier (l'équipe ne le coupe pas), chaque état est exactement celui des indicateurs.
      if (c.auTravail && [n, lu('auTravail'), lu('enPause')].every(entier)) {
        assert.deepEqual([p.auTravail, p.enPause, p.sansTravail], [lu('auTravail'), lu('enPause'), n - lu('auTravail') - lu('enPause')], e.id + ' à ' + P.hhmm(t));
        compares++;
      }
    });
  }
  assert.ok(compares > 50, compares + ' créneaux comparés');
  // Le service : la somme de ses équipes.
  const etat = E.etatA(journee, J.t);
  for (const [id, s] of Object.entries(etat.services)) {
    const siennes = J.k.equipes.filter(e => e.service === id).map(e => etat.equipes[e.id]);
    assert.equal(s.presents, siennes.reduce((n, p) => n + p.presents, 0), id);
    assert.equal(s.auTravail, siennes.reduce((n, p) => n + p.auTravail, 0), id);
  }
  // À l'heure du pic, les personnes au travail de l'unité sont celles du pic.
  assert.equal(Object.values(etat.services).reduce((n, s) => n + s.auTravail, 0), Math.round(J.personnes));
});

test('les lots qui attendent devant un service : les séjours en stock du résultat', () => {
  const sejours = J.resultat.stocks.sejours;
  assert.ok(sejours.length > 5, 'la journée fictive a des stocks');
  let avec = 0;
  for (let t = -720; t <= 1500; t += 15) {
    const lus = E.lotsEnAttente(J.resultat, t);
    for (const [service, x] of Object.entries(lus)) {
      // Les repas en stock devant le service sont ceux de la série du résultat (une commande compte une fois).
      const cles = new Set(sejours.filter(s => s.vers === service && t >= s.entree && t < s.sortie).map(s => s.classe + '|' + (s.vol ?? '')));
      assert.equal(x.lots, cles.size, service + ' à ' + P.hhmm(t));
      if (service !== 'chargement' && !sejours.some(s => s.vers === service && s.vol)) assert.ok(Math.abs(x.repas - P.niveauA(J.resultat.stocks.parService[service], t)) < 1e-6, service + ' à ' + P.hhmm(t) + ' : les repas');
      avec++;
    }
    for (const service of Object.keys(J.resultat.stocks.parService)) if (!lus[service]) assert.ok(P.niveauA(J.resultat.stocks.parService[service], t) < 1e-6, service + ' à ' + P.hhmm(t) + ' : rien n’attend');
  }
  assert.ok(avec > 20);
  // Rien n'attend avant le premier séjour ni après le dernier ; sans résultat, rien.
  assert.deepEqual(E.lotsEnAttente(J.resultat, Math.min(...sejours.map(s => s.entree)) - 1), {});
  assert.deepEqual(E.lotsEnAttente(null, 600), {});
  assert.deepEqual(E.etatA(null, 600), { t: 600, equipes: {}, services: {} });
});

test('le décor : le sol, le couloir, la pause, une zone par service ; des murs bas, pas du côté du couloir ; les machines des réglages', () => {
  const d = D.decor(SITE), dans = (o, z) => o.x >= z.x - 1e-9 && o.y >= z.y - 1e-9 && o.x + o.w <= z.x + z.w + 1e-9 && o.y + o.d <= z.y + z.h + 1e-9;
  assert.deepEqual(d.sols.map(s => s.id), ['site', 'couloir', 'pause', ...SITE.zones.map(z => z.id)]);
  assert.deepEqual(d.boite, { ...SITE.emprise, h: D.H.etiquette });
  for (const z of SITE.zones) {
    const murs = d.murs.filter(m => m.zone === z.id);
    assert.deepEqual(murs.map(m => m.cote).sort(), ['x0', 'x1', z.bande === 0 ? 'y0' : 'y1'], z.id + ' : trois murs, la zone s’ouvre sur le couloir');
    assert.ok(murs.every(m => dans(m, z) && m.h === D.H.mur && m.h <= 0.5), z.id + ' : des murs bas, dans la zone');
  }
  // Les machines : une ligne (et son bras) par ligne robotisée, un tunnel par tunnel, les rayonnages du magasin.
  const compte = quoi => d.objets.filter(o => o.quoi === quoi).length, zone = id => SITE.zones.find(z => z.id === id);
  assert.equal(compte('ligne'), zone('food').lignes.length); assert.equal(compte('bras'), zone('food').lignes.length);
  assert.equal(compte('tunnel'), zone('plonge').tunnels.length);
  assert.equal(compte('rayonnage'), (zone('magasin') || { rayonnages: [] }).rayonnages.length);
  assert.ok(compte('ligne') >= 1 && compte('tunnel') >= 1, 'l’unité fictive a un robot et une plonge');
  for (const o of d.objets) assert.ok(dans(o, zone(o.zone)), o.quoi + ' dans ' + o.zone);
  // Rien d'autre : chaque objet vient d'un réglage.
  assert.deepEqual([...new Set(d.objets.map(o => o.quoi))].sort(), ['bras', 'ligne', 'rayonnage', 'tunnel'].filter(q => compte(q)).sort());
  // Deux fois le même décor ; un site vide n'a rien.
  assert.equal(JSON.stringify(D.decor(SITE)), JSON.stringify(d));
  const vide = D.decor(S.generer({ ateliers: [] }));
  assert.deepEqual([vide.sols, vide.murs, vide.objets], [[], [], []]);
});

test('les boîtes à dessiner pour un angle : les murs du fond seulement, les boîtes longues en tronçons', () => {
  const d = D.decor(SITE);
  for (const cap of [45, 0, 135, 200, 315]) {
    const cam = C.camera({ cap }), fond = C.mursDuFond(cam), boites = D.boitesDe(d, fond, C.decouper), p = C.projecteur(cam, { w: 1280, h: 620 });
    const murs = boites.filter(b => b.quoi === 'mur');
    assert.ok(murs.length > 0 && murs.every(m => fond[m.cote]), 'cap ' + cap + ' : seulement les murs du fond');
    assert.deepEqual([...new Set(murs.map(m => m.cote))].sort(), Object.keys(fond).filter(k => fond[k] && d.murs.some(m => m.cote === k)).sort());
    // Un mur dessiné est derrière ce qu'il borde : le point de la zone juste devant lui (un mètre en dedans) est plus près de l'œil.
    const dedans = { x0: [1, 0], x1: [-1, 0], y0: [0, 1], y1: [0, -1] };
    for (const m of murs) assert.ok(p.profondeur(m.x, m.y) < p.profondeur(m.x + dedans[m.cote][0], m.y + dedans[m.cote][1]), 'cap ' + cap + ' : ' + m.zone + ' ' + m.cote);
    // Les tronçons : aucun de plus de 2 m, chacun avec son point d'appui ; la surface des machines est gardée.
    assert.ok(boites.every(b => b.w <= D.TRONCON + 1e-9 && b.d <= D.TRONCON + 1e-9 && b.couche === 1 && Math.abs(b.x - (b.bx + b.w / 2)) < 1e-9 && Math.abs(b.y - (b.by + b.d / 2)) < 1e-9));
    const surface = l => l.reduce((s, b) => s + b.w * b.d, 0);
    assert.ok(Math.abs(surface(boites.filter(b => b.quoi !== 'mur')) - surface(d.objets)) < 1e-6);
  }
});

test('les étiquettes : le nom, « n au travail / n présents », « n lots à faire » s’il y en a', () => {
  const etat = E.etatA(journee, J.t), l = D.etiquettes(SITE, etat);
  assert.deepEqual(l.map(e => e.id), SITE.zones.map(z => z.id));
  for (const [i, z] of SITE.zones.entries()) {
    const n = z.services.reduce((s, id) => { const x = etat.services[id] || { auTravail: 0, presents: 0, lots: 0 }; return { a: s.a + x.auTravail, p: s.p + x.presents, l: s.l + x.lots }; }, { a: 0, p: 0, l: 0 });
    assert.equal(l[i].titre, z.nom);
    assert.equal(l[i].lignes[0], n.a + ' au travail / ' + n.p + (n.p > 1 ? ' présents' : ' présent'));
    assert.deepEqual(l[i].lignes.slice(1), n.l ? [n.l + (n.l > 1 ? ' lots à faire' : ' lot à faire')] : []);
    assert.deepEqual([l[i].x, l[i].y, l[i].z], [z.x + z.w / 2, z.y + z.h / 2, D.H.etiquette], 'au-dessus de sa zone');
  }
  assert.ok(l.some(e => e.lignes.length === 2) || Object.values(etat.services).every(s => !s.lots));
  // Le singulier ; sans journée : le nom seul.
  assert.deepEqual([D.pluriel(1, 'lot à faire', 'lots à faire'), D.pluriel(0, 'présent', 'présents'), D.pluriel(2, 'présent', 'présents')], ['1 lot à faire', '0 présent', '2 présents']);
  assert.deepEqual(D.etiquettes(SITE, null).map(e => e.lignes), SITE.zones.map(() => []));
  // À une heure où des lots attendent : la ligne y est.
  const s = J.resultat.stocks.sejours.find(x => SITE.zones.some(z => z.services.includes(x.vers))), quand = E.etatA(journee, s.entree + 1);
  const e = D.etiquettes(SITE, quand).find(x => x.id === SITE.zones.find(z => z.services.includes(s.vers)).id);
  assert.match(e.lignes[1], /^\d+ lots? à faire$/);
});

test('à « Tout voir », les étiquettes gardent leur taille et aucune n’en recouvre une autre, à 1 280 et 1 920 px, à quatre angles', () => {
  const liste = D.etiquettes(SITE, E.etatA(journee, J.t)), boite = D.boite(SITE);
  const tailles = liste.map(e => D.tailleEtiquette(e));
  for (const ecran of [{ w: 1280, h: 560, haut: 44, bas: 12 }, { w: 1920, h: 820, haut: 44, bas: 12 }]) {
    for (const cap of [C.CAP_MAQUETTE, 135, 225, 315]) {
      const cam = C.cadrer(C.camera({ cap }), ecran, boite), poses = D.poserEtiquettes(liste, cam, ecran), mot = ecran.w + ' px, cap ' + cap + '°';
      assert.deepEqual(C.recouvrements(poses), [], mot);
      assert.deepEqual(poses.map(p => ({ w: p.w, h: p.h })), tailles, mot + ' : la même taille à tout angle');
      const v = C.visible(ecran);
      for (const p of poses) assert.ok(p.x >= v.x0 && p.y >= v.y0 && p.x + p.w <= v.x1 && p.y + p.h <= v.y1, mot + ' : ' + p.id + ' dans la zone visible');
    }
    // À un autre zoom, la même taille : seule la place change. Une zone sortie de l'écran n'a plus d'étiquette.
    const taille = Object.fromEntries(liste.map((e, i) => [e.id, tailles[i]]));
    const pres = D.poserEtiquettes(liste, C.zoomer(C.cadrer(C.camera(), ecran, boite), ecran, 3), ecran);
    assert.ok(pres.length >= 1 && pres.length < liste.length, 'de près, des zones sont hors de l’écran (' + pres.length + ' étiquettes sur ' + liste.length + ')');
    for (const p of pres) { assert.deepEqual({ w: p.w, h: p.h }, taille[p.id]); assert.ok(p.ax >= 0 && p.ax <= ecran.w && p.ay >= 0 && p.ay <= ecran.h, p.id + ' : son ancre est à l’écran'); }
    assert.deepEqual(C.recouvrements(pres), []);
  }
  // La taille suit le texte : le titre, une ou deux lignes.
  assert.deepEqual(D.tailleEtiquette({ titre: 'Cuisine', lignes: [] }, t => t.length * 10), { w: 84, h: 26 });
  assert.deepEqual(D.tailleEtiquette({ titre: 'Cuisine', lignes: ['4 au travail / 6 présents', '2 lots à faire'] }, t => t.length * 10), { w: 264, h: 56 });
});
