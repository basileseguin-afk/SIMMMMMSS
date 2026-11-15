/* Évolution 16 (d) — ce qui circule dans la vue en direct (v1), sans navigateur.
 * Les lots deviennent des chariots (un par tranche de repas, un au moins par
 * lot) : en file devant le service qui va les prendre, ou dans l'îlot de
 * l'atelier qui y travaille ; les tournées du handling, des véhicules ; les
 * vols, des avions ; les retours sales rejoignent la plonge. Tout est lu dans
 * le résultat de la journée : rien n'est inventé, rien ne circule quand rien
 * n'attend. Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../direct-scene.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = x => (typeof x === 'string' ? JSON.parse(x) : x);
/** La journée fictive : son résultat, ses indicateurs, son site, ses îlots, l'aire de ses avions. */
function journeeFictive(sauvegarde = F.sauvegardeFictive()) {
  const vols = UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
  const args = J.argumentsDeLaJournee(sauvegarde, vols), r = P.simuler(args), k = I.journee(r, args), etat = lire(sauvegarde.contenu['ory-ateliers-v1']);
  const site = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, regime: args.regime });
  const personnes = new Map(r.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(site, etat.ateliers, id => personnes.get(id));
  const places = E.placesDesVols(r), aire = D.aireDe(site, places.nombre);
  return { r, k, etat, site, ilots, places, aire, scene: { site, ilots, aire, places }, journee: { r, k } };
}
const U = journeeFictive();
const N = E.tranche(U.r);
const zoneDe = service => U.site.zones.find(z => z.services.includes(service));
const dans = (p, b, jeu = 1e-9) => p.x >= b.x - jeu && p.x <= b.x + b.w + jeu && p.y >= b.y - jeu && p.y <= b.y + b.h + jeu;
const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);
const circule = t => D.circulation(U.scene, U.journee, t);
/** Les heures de contrôle : toute la journée fictive, de la veille au soir, tous les quarts d'heure et entre deux. */
const BORNES = (() => { const ts = U.r.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite); return { de: Math.floor(Math.min(...ts) / 15) * 15 - 30, a: Math.ceil(Math.max(...ts) / 15) * 15 + 60 }; })();
const HEURES = (() => { const l = []; for (let t = BORNES.de; t <= BORNES.a; t += 15) l.push(t, t + 7.5); return l; })();
/** Un résultat fictif fait à la main : seulement ce que la lecture regarde. */
const resultat = x => ({ lots: [], vols: [], classes: [], ateliers: [], stocks: { sejours: [], parService: {} }, ...x });
const sceneDe = r => { const places = E.placesDesVols(r); return { site: U.site, ilots: U.ilots, places, aire: D.aireDe(U.site, places.nombre) }; };

test('un chariot par tranche de repas, un au moins par lot ; la tranche est celle de la légende', () => {
  assert.equal(E.TRANCHE, 50);
  assert.equal(N, 50, 'la journée fictive : un chariot = 50 repas');
  assert.equal(circule(600).tranche, 50, 'la scène dit sa tranche');
  assert.deepEqual([0, 1, 49, 50, 51, 100, 101, 272].map(q => E.chariotsPour(q, 50)), [1, 1, 1, 1, 2, 2, 3, 6]);
  // Une journée qui compterait plus de 500 chariots en stock double sa tranche, autant de fois qu'il faut.
  const gros = resultat({ stocks: { sejours: [], parService: { a: [[0, 0], [10, 30000]], b: [[0, 0], [10, 9000]] } } });
  const n = E.tranche(gros);
  assert.equal(n, 100, '39 000 repas en stock : 780 chariots de 50, 390 de 100');
  assert.ok(Math.ceil(30000 / n) + Math.ceil(9000 / n) <= 500);
  assert.equal(E.tranche(resultat({})), 50, 'sans stock, la tranche ordinaire');
});

test('une couleur par nature : les repas, l’équipement (une catégorie d’équipement), le retour sale', () => {
  const classes = U.r.classes, equipement = classes.find(c => c.categorie), repas = classes.find(c => !c.categorie);
  assert.ok(equipement && repas, 'la journée fictive a des repas et de l’équipement');
  assert.equal(E.natureDe(U.r, equipement.id), 'equipement');
  assert.equal(E.natureDe(U.r, repas.id), 'repas');
  const tons = new Set(HEURES.flatMap(t => circule(t).chariots.map(c => c.ton)));
  assert.deepEqual([...tons].sort(), ['equipement', 'repas', 'sale'], 'trois couleurs, pas une de plus');
  for (const t of [400, 560, 700]) for (const c of circule(t).chariots) {
    if (c.etat === 'file' && c.classe != null) assert.equal(c.ton, E.natureDe(U.r, c.classe), 'un chariot a la couleur de sa commande');
    if (['arrive', 'lave', 'arrete'].includes(c.etat)) assert.equal(c.ton, 'sale');
  }
});

test('à chaque heure de la journée fictive, les chariots en file devant un service égalent les stocks du résultat', () => {
  const services = Object.keys(U.r.stocks.parService), sejours = U.r.stocks.sejours;
  assert.ok(services.length >= 3 && sejours.length > 20, 'la journée fictive a des stocks devant plusieurs services');
  let vus = 0;
  for (const t of HEURES) {
    const files = E.filesA(U.r, t, N), c = circule(t);
    for (const service of services) {
      const lots = files[service] || [], niveau = P.niveauA(U.r.stocks.parService[service], t);
      // Les repas des lots en file sont le stock du résultat devant ce service, à cette heure.
      const enStock = new Map();
      for (const s of sejours) if (s.vers === service && t >= s.entree && t < s.sortie) enStock.set(s.classe + '|' + (s.vol ?? ''), s.repas);
      assert.equal(lots.length, enStock.size, service + ' à ' + P.hhmm(t) + ' : autant de lots en file que de commandes en stock');
      assert.ok(Math.abs(somme(lots, l => l.repas) - somme([...enStock.values()], x => x)) < 1e-6, service + ' à ' + P.hhmm(t) + ' : les repas en file');
      if (!sejours.some(s => s.vers === service && s.vol)) assert.ok(Math.abs(somme(lots, l => l.repas) - niveau) < 1e-6, service + ' à ' + P.hhmm(t) + ' : le niveau du stock');
      // Un chariot par tranche de repas, un au moins par lot : la scène en pose exactement autant, dans la zone du service.
      const attendus = somme(lots, l => Math.max(1, Math.ceil(l.repas / N)));
      const poses = c.chariots.filter(x => x.etat === 'file' && x.ton !== 'sale' && x.service === service);
      assert.equal(poses.length, attendus, service + ' à ' + P.hhmm(t) + ' : les chariots en file');
      const z = zoneDe(service);
      for (const x of poses) if (!x.enChemin) assert.ok(dans(x, z), service + ' à ' + P.hhmm(t) + ' : un chariot en file est dans la zone du service');
      if (niveau < 1e-6 && !lots.length) assert.equal(poses.length, 0, service + ' à ' + P.hhmm(t) + ' : rien n’attend, aucun chariot');
      vus += poses.length;
    }
    // Aucune file devant un service qui n'a pas de stock.
    for (const x of c.chariots) if (x.etat === 'file' && x.ton !== 'sale') assert.ok(services.includes(x.service), 'une file sans stock : ' + x.service);
  }
  assert.ok(vus > 500, 'le contrôle a vu des chariots (' + vus + ')');
});

test('la file se voit : des rangs depuis le couloir, dans la zone ; une longue file s’étale, puis s’entasse sans déborder', () => {
  const z = zoneDe('prepa'), b = D.bandeDeFile(z, U.ilots), court = D.bandeDeFile(z);
  assert.ok(dans({ x: b.x, y: b.y }, z) && dans({ x: b.x + b.w, y: b.y + b.h }, z), 'la bande de la file est dans la zone');
  assert.ok(b.h >= court.h - 1e-9, 'devant les îlots, la file a au moins la bande gardée libre');
  for (const i of U.ilots.filter(i => i.zone === z.id)) assert.ok(i.y >= b.y + b.h - 1e-6 || i.y + i.h <= b.y + 1e-6, 'la bande ne recouvre aucun îlot : ' + i.atelier);
  for (const n of [0, 1, 2, 3, 7, 40, 200, 600]) {
    const places = D.placesDeFile(b, n);
    assert.equal(places.length, n);
    for (const p of places) assert.ok(dans(p, b, 1e-6), n + ' chariots : chacun dans la bande');
  }
  // Une courte file : trois rangs, des places distinctes, à un pas de chariot au moins.
  const six = D.placesDeFile(b, 6);
  assert.equal(new Set(six.map(p => p.y.toFixed(3))).size, 3, 'trois rangs');
  for (const [i, p] of six.entries()) for (const q of six.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 0.69, 'deux chariots ne se recouvrent pas');
  // Le premier rang est du côté du couloir.
  const couloir = U.site.couloir, versCouloir = p => Math.min(Math.abs(p.y - couloir.y), Math.abs(p.y - couloir.y - couloir.h));
  assert.ok(versCouloir(six[0]) < versCouloir(six[2]), 'la file part du couloir');
  assert.deepEqual(D.placesDeFile(b, 40), D.placesDeFile(b, 40), 'toujours les mêmes places');
});

test('un lot en cours est dans l’îlot de son atelier : près d’une table, ou sur le trolley où l’on travaille', () => {
  let vus = 0;
  const ateliers = new Set();
  for (const t of HEURES) {
    const c = circule(t), enCours = U.r.lots.filter(l => !l.dispo && !l.handling && !l.retourVol && Number.isFinite(l.debut) && Number.isFinite(l.fin) && t >= l.debut && t < l.fin);
    const lus = E.lotsEnCours(U.r, t, N);
    assert.equal(lus.length, enCours.length, 'à ' + P.hhmm(t) + ' : les lots en cours du journal');
    for (const l of lus) {
      const ilot = U.ilots.find(i => i.atelier === l.atelier);
      assert.ok(ilot, 'l’atelier ' + l.atelier + ' a son îlot');
      const siens = c.chariots.filter(x => x.etat === 'en cours' && x.atelier === l.atelier);
      const attendus = somme(lus.filter(x => x.atelier === l.atelier), x => x.chariots);
      assert.equal(siens.length, attendus, 'à ' + P.hhmm(t) + ', ' + l.atelier + ' : un chariot par tranche, un au moins');
      for (const x of siens) assert.ok(dans(x, { x: ilot.x, y: ilot.y, w: ilot.w, h: ilot.h }, 0.31), 'à ' + P.hhmm(t) + ', ' + l.atelier + ' : le chariot est dans l’îlot');
      vus += siens.length; ateliers.add(l.atelier);
    }
    assert.equal(c.chariots.filter(x => x.etat === 'en cours').length, somme(lus.filter(l => U.ilots.some(i => i.atelier === l.atelier)), l => l.chariots), 'à ' + P.hhmm(t) + ' : aucun chariot en cours de trop');
  }
  assert.ok(vus > 100 && ateliers.size >= 4, 'le contrôle a vu des lots en cours dans plusieurs ateliers (' + vus + ', ' + [...ateliers].join(' ') + ')');
  // Un atelier « trolleys » : le chariot du lot est le trolley d'une personne ; un atelier « tables » : au bout d'une table.
  const trolleys = U.ilots.find(i => i.poste === 'trolleys' && i.trolleys.length), tables = U.ilots.find(i => i.poste === 'tables' && i.tables.length);
  assert.ok(trolleys && tables, 'la journée fictive a un atelier à trolleys et un atelier à tables');
  assert.deepEqual(D.placesDansIlot(trolleys, 1, 0, 1)[0], { x: trolleys.trolleys[0].x, y: trolleys.trolleys[0].y });
  const p = D.placesDansIlot(tables, 1, 0, 1)[0], table = tables.tables[0];
  assert.ok(Math.abs(p.y - (table.y + table.d / 2)) < 1e-9 && p.x > table.x + table.w - 1e-9 && p.x < table.x + table.w + 0.5, 'posé au bout de la table');
  // Plus de chariots que de places : tous restent dans l'îlot.
  for (const x of D.placesDansIlot(tables, 60, 0, 1)) assert.ok(dans(x, { x: tables.x, y: tables.y, w: tables.w, h: tables.h }, 1e-6));
});

test('au moment où il change de service, un lot roule deux minutes rejouées, poussé par un personnage', () => {
  assert.equal(E.MARCHE, 2);
  const s = U.r.stocks.sejours.find(x => x.de && zoneDe(x.vers) && zoneDe(x.de) && zoneDe(x.de) !== zoneDe(x.vers) && x.sortie - x.entree > 10);
  assert.ok(s, 'un lot passe d’une zone à une autre');
  const siens = t => circule(t).chariots.filter(x => x.etat === 'file' && x.service === s.vers && x.classe === s.classe && (x.vol ?? null) === (s.vol ?? null));
  const debut = siens(s.entree + 0.2), milieu = siens(s.entree + 1), fin = siens(s.entree + E.MARCHE), apres = siens(s.entree + 5);
  assert.ok(debut.length >= 1 && debut.every(x => x.enChemin), 'il roule dès qu’il entre en stock');
  assert.ok(milieu.every(x => x.enChemin), 'il roule encore une minute après');
  assert.ok(fin.every(x => !x.enChemin) && apres.every(x => !x.enChemin), 'deux minutes après, il est dans la file');
  assert.equal(fin.length, debut.length, 'le même nombre de chariots, en chemin puis en file');
  assert.ok(dans(apres[0], zoneDe(s.vers)), 'dans la zone du service qui va le prendre');
  // Il part de l'îlot de l'atelier qui vient de le finir, et avance vers sa place.
  const amont = U.r.lots.find(l => l.service === s.de && (l.classes || []).includes(s.classe) && Math.abs(l.fin - s.entree) < 1e-6), ilot = U.ilots.find(i => i.atelier === amont.atelier);
  const depart = siens(s.entree + 1e-6)[0], centre = { x: ilot.x + ilot.w / 2, y: ilot.y + ilot.h / 2 };
  assert.ok(Math.hypot(depart.x - centre.x, depart.y - centre.y) < 0.2, 'il part de l’îlot de l’atelier d’amont');
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y), enRoute = [0.4, 0.8, 1.2, 1.6].map(m => siens(s.entree + m)[0]);
  for (const [i, p] of enRoute.entries()) if (i) assert.ok(d(p, enRoute[i - 1]) > 0.05, 'il avance');
  assert.ok(d(siens(s.entree + 1.999)[0], apres[0]) < 0.3, 'il arrive à sa place');
  // Un personnage le pousse pendant le trajet, et seulement là ; il n'est compté dans aucune équipe.
  const pousse = t => circule(t).pousseurs;
  assert.ok(pousse(s.entree + 1).length >= 1, 'un personnage pousse le lot qui roule');
  for (const q of pousse(s.entree + 1)) { assert.equal(q.hors, true); assert.equal(q.ton, 'neutre'); assert.equal(q.atelier, undefined); }
  // À une heure où aucun lot n'entre en stock ni n'arrive, personne ne pousse.
  const calme = HEURES.find(t => !U.r.stocks.sejours.some(x => t >= x.entree && t < x.entree + E.MARCHE) && !U.r.lots.some(l => l.retourVol && t >= l.arrivee - E.MARCHE && t < l.arrivee) && circule(t).chariots.length > 0);
  assert.equal(pousse(calme).length, 0, 'à ' + P.hhmm(calme) + ', rien ne roule : personne ne pousse');
  // Un convoi : les chariots partent l'un après l'autre et arrivent tous.
  assert.deepEqual([0, 1, 2].map(i => D.avanceDuConvoi(0, i, 3)), [0, 0, 0]);
  assert.deepEqual([0, 1, 2].map(i => D.avanceDuConvoi(1, i, 3)), [1, 1, 1]);
  assert.ok(D.avanceDuConvoi(0.5, 0, 3) > D.avanceDuConvoi(0.5, 2, 3), 'le premier est devant');
});

test('un véhicule est en route pendant son trajet, et seulement là : du quai aux avions, puis retour', () => {
  const tournees = U.r.lots.filter(l => l.trajet && Number.isFinite(l.trajet.depart) && Number.isFinite(l.trajet.retour));
  assert.ok(tournees.length >= 10, 'la journée fictive a des tournées');
  const cle = l => l.camion + '|' + l.trajet.depart, quai = U.site.zones.find(z => z.role === 'quai');
  for (const l of tournees) {
    const tr = l.trajet, a = t => E.vehiculesA(U.r, t).find(v => v.cle === cle(l));
    assert.equal(a(tr.depart - 0.5), undefined, l.vol + ' : pas de véhicule avant le départ');
    assert.equal(a(tr.retour + 0.5), undefined, l.vol + ' : plus de véhicule après le retour');
    for (const t of [tr.depart, tr.depart + 1, (tr.depart + tr.retour) / 2, tr.retour - 1, tr.retour]) assert.ok(a(t), l.vol + ' à ' + P.hhmm(t) + ' : le véhicule est en route');
    assert.equal(a(tr.depart + tr.aller / 2).phase, 'aller');
    assert.equal(a(tr.retour - tr.dureeRetour / 2).phase, 'retour');
    assert.ok(Math.abs(a(tr.depart + tr.aller / 2).avance - 0.5) < 1e-9, 'à mi-chemin de l’aller');
    assert.equal(a(tr.depart + tr.aller + 0.01).avance, 1, 'aux avions');
    // Dans la scène : il part du quai, roule sur la route, rejoint la place de son vol, et revient.
    const pose = t => circule(t).vehicules.find(v => v.cle === cle(l)), depart = pose(tr.depart), auxAvions = pose(tr.depart + tr.aller + 0.01), retour = pose(tr.retour);
    assert.ok(Math.abs(depart.x - U.site.largeur) < 1e-6 && depart.y >= quai.y && depart.y <= quai.y + quai.h, l.vol + ' : il part du quai');
    assert.ok(Math.abs(retour.x - depart.x) < 1e-6 && Math.abs(retour.y - depart.y) < 1e-6, l.vol + ' : il revient au quai');
    const place = U.aire.places[U.places.places.get(tr.vols[0])];
    assert.ok(Math.hypot(auxAvions.x - place.x, auxAvions.y - place.y) < D.AVION.long, l.vol + ' : il est à l’avion de son vol');
    assert.ok(dans(auxAvions, { x: U.aire.route.x, y: U.aire.y, w: U.aire.route.w + U.aire.w, h: U.aire.h }), l.vol + ' : du côté des avions');
    assert.equal(pose(tr.depart - 0.5), undefined);
    assert.equal(pose(tr.retour + 0.5), undefined);
  }
  // À chaque heure, autant de véhicules que de tournées en route — ni plus, ni moins.
  for (const t of HEURES) {
    const enRoute = new Set(tournees.filter(l => t >= l.trajet.depart && t <= l.trajet.retour).map(cle));
    assert.deepEqual(circule(t).vehicules.map(v => v.cle).sort(), [...enRoute].sort(), 'à ' + P.hhmm(t));
  }
  // Un camion ou un véhicule léger : celui du résultat.
  const leger = resultat({ lots: [{ handling: true, vol: 'ZZ900', camion: 4, vehicule: 'vl', service: 'quais', trajet: { depart: 100, retour: 160, aller: 20, dureeRetour: 20, vols: ['ZZ900'] } }],
    vols: [{ id: 'ZZ900', cie: 'ZZ', depart: 150, fin: 130, retard: 0 }] });
  assert.equal(E.vehiculesA(leger, 110)[0].vehicule, 'vl');
  assert.equal(D.circulation(sceneDe(leger), { r: leger }, 110).vehicules[0].type, 'vl');
  assert.equal(E.vehiculesA(U.r, tournees[0].trajet.depart + 1)[0].vehicule, 'camion');
});

test('chaque vol est un avion au bord de la scène, avec son numéro et son heure ; il décolle à son départ', () => {
  const vols = U.r.vols, aLHeure = vols.find(v => !(v.retard > 0) && Number.isFinite(v.fin));
  assert.ok(aLHeure, 'la journée fictive a un vol chargé à l’heure');
  const avion = (id, t) => circule(t).avions.find(a => a.id === id);
  assert.equal(avion(aLHeure.id, aLHeure.depart - E.AVANT_DEPART - 1), undefined, 'pas encore là plus de 3 h avant');
  assert.ok(avion(aLHeure.id, aLHeure.depart - E.AVANT_DEPART + 1), 'là 3 h avant son départ');
  assert.equal(avion(aLHeure.id, aLHeure.depart - 1).decolle, 0, 'au sol jusqu’à son départ');
  assert.ok(avion(aLHeure.id, aLHeure.depart + 1).decolle > 0, 'il décolle à son départ');
  assert.equal(avion(aLHeure.id, aLHeure.depart + E.DECOLLAGE + 0.1), undefined, 'parti');
  // Au bord de la scène, du côté des avions : hors du site, sur l'aire ; la scène à cadrer la contient.
  const b = D.boite(U.site, U.aire);
  for (const t of HEURES) for (const a of circule(t).avions) {
    if (a.decolle > 0) continue;
    assert.ok(a.x > U.site.largeur + D.ROUTE - 1e-9 && dans(a, U.aire), a.id + ' à ' + P.hhmm(t) + ' : sur l’aire des avions');
    assert.ok(a.x <= b.x1 && a.y >= b.y0 && a.y <= b.y1, 'dans la boîte de la scène');
  }
  // Deux avions là en même temps n'ont jamais la même place ; il y a autant de places que le plus grand nombre d'avions ensemble.
  let plus = 0;
  for (const t of HEURES) { const la = E.volsA(U.r, t, U.places); assert.equal(new Set(la.map(a => a.place)).size, la.length, 'à ' + P.hhmm(t)); plus = Math.max(plus, la.length); }
  assert.ok(U.places.nombre >= plus && U.places.nombre <= plus + 1 && U.aire.places.length === U.places.nombre);
  // Son étiquette : son numéro et son heure.
  const e = D.etiquettesDesVols([avion(aLHeure.id, aLHeure.depart - 30)])[0];
  assert.equal(e.titre, aLHeure.id + ' · ' + P.hhmm(aLHeure.depart));
  assert.equal(e.ton, undefined, 'à l’heure : pas de couleur critique');
  assert.equal(e.vol, aLHeure.id);
  // Sans vol, pas d'aire : la scène à cadrer est le site.
  assert.equal(D.aireDe(U.site, 0), null);
  assert.deepEqual(D.boite(U.site, null), D.boite(U.site));
});

test('sans handling : ce qui est prêt attend au bout du couloir, du côté des avions ; les vols restent des avions', () => {
  // La même unité fictive, sans son équipe de handling : le résultat ne dit plus quand un vol est chargé.
  const sauvegarde = F.sauvegardeFictive(), texte = typeof sauvegarde.contenu['ory-ateliers-v1'] === 'string', etat = lire(sauvegarde.contenu['ory-ateliers-v1']);
  etat.ateliers = etat.ateliers.filter(a => a.type !== 'handling');
  sauvegarde.contenu['ory-ateliers-v1'] = texte ? JSON.stringify(etat) : etat;
  const V = journeeFictive(sauvegarde), a = t => D.circulation(V.scene, V.journee, t);
  assert.equal((V.r.vols || []).length, 0, 'sans handling, le résultat n’a pas de bilan par vol');
  assert.ok(!V.site.zones.some(z => z.role === 'quai'), 'ni de quai');
  // Les vols de la journée sont ceux des commandes : un avion chacun, avec son numéro et son heure ; il décolle à son départ.
  const vols = E.volsDe(V.r);
  assert.ok(vols.length >= 10 && vols.every(v => v.charge === false));
  assert.ok(V.aire && V.aire.places.length === V.places.nombre && V.places.nombre >= 1);
  const v = vols[0], avion = t => a(t).avions.find(x => x.id === v.id);
  assert.equal(D.etiquettesDesVols([avion(v.depart - 30)])[0].titre, v.id + ' · ' + P.hhmm(v.depart));
  assert.ok(avion(v.depart + 1).decolle > 0, 'il décolle à son départ');
  assert.equal(avion(v.depart + E.DECOLLAGE + 0.1), undefined);
  for (const t of HEURES) for (const e of D.etiquettesDesVols(a(t).avions)) assert.equal(e.ton, undefined, 'aucun retard à dire : le résultat n’en dit pas');
  // Aucune tournée : aucun véhicule.
  for (const t of HEURES) assert.equal(a(t).vehicules.length, 0);
  // Ce qui est prêt avant le chargement attend au bout du couloir, du côté des avions.
  const sejours = V.r.stocks.sejours.filter(s => s.vers === 'chargement' && s.sortie - s.entree > 5);
  assert.ok(sejours.length, 'des commandes prêtes attendent leur chargement');
  const t = sejours[0].entree + 3, prets = a(t).chariots.filter(c => c.service === 'chargement'), couloir = V.site.couloir;
  const attendus = new Map();
  for (const s of V.r.stocks.sejours) if (s.vers === 'chargement' && t >= s.entree && t < s.sortie) attendus.set(s.classe + '|' + (s.vol ?? ''), Math.max(1, Math.ceil(s.repas / E.tranche(V.r))));
  assert.equal(prets.length, somme([...attendus.values()], x => x), 'un chariot par tranche, un au moins par lot');
  for (const c of prets) assert.ok(dans(c, { x: couloir.x, y: couloir.y, w: couloir.w, h: couloir.h }) && c.x > V.site.largeur - 4.5, 'au bout du couloir, du côté des avions');
});

test('un vol chargé en retard porte la couleur critique et dit son retard', () => {
  const tard = U.r.vols.find(v => v.retard > 30 && Number.isFinite(v.fin));
  assert.ok(tard, 'la journée fictive a un vol chargé en retard');
  const avion = t => circule(t).avions.find(a => a.id === tard.id), etiquette = t => D.etiquettesDesVols(circule(t).avions).find(e => e.vol === tard.id);
  // Avant son heure, il n'est pas encore en retard ; passé son heure, il attend son chargement, en critique.
  assert.equal(avion(tard.depart - 1).enRetard, false);
  assert.equal(etiquette(tard.depart - 1).ton, undefined);
  const apres = avion(tard.depart + 1);
  assert.equal(apres.enRetard, true);
  assert.equal(apres.decolle, 0, 'il ne décolle pas avant d’être chargé');
  const e = etiquette(tard.depart + 1);
  assert.equal(e.ton, 'critique', 'la couleur critique');
  const m = Math.round(tard.retard), dit = m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  assert.equal(e.titre, tard.id + ' · ' + P.hhmm(tard.depart) + ' · retard ' + dit, 'le retard du résultat, en clair');
  // Chargé, il décolle ; puis il n'est plus là.
  assert.ok(avion(tard.fin + 1).decolle > 0);
  assert.equal(avion(tard.fin + E.DECOLLAGE + 0.1), undefined);
  // À chaque heure : critique si, et seulement si, le vol a passé son heure sans être chargé à temps.
  for (const t of HEURES) for (const x of D.etiquettesDesVols(circule(t).avions)) {
    const v = U.r.vols.find(y => y.id === x.vol);
    assert.equal(x.ton === 'critique', v.retard > 0 && t >= v.depart, v.id + ' à ' + P.hhmm(t));
  }
  // Un vol jamais chargé reste là, en critique : « pas chargé ».
  const jamais = resultat({ vols: [{ id: 'ZZ901', cie: 'ZZ', depart: 300, fin: null, retard: null, etat: 'impossible' }] });
  const reste = D.etiquettesDesVols(D.circulation(sceneDe(jamais), { r: jamais }, 900).avions)[0];
  assert.equal(reste.ton, 'critique');
  assert.equal(reste.titre, 'ZZ901 · 05:00 · pas chargé');
  // Posée à l'écran, l'étiquette garde sa couleur ; compacte, elle tient sur une ligne.
  const cam = require('../direct-camera.js'), ecran = { w: 1280, h: 700, haut: 44, bas: 48, gauche: 0, droite: 0 };
  const camera = cam.cadrer(cam.camera({ cap: cam.CAP_MAQUETTE, site: cam.SITE_MAQUETTE }), ecran, D.boite(U.site, U.aire));
  const poses = D.poserEtiquettes(D.etiquettesDesVols(circule(tard.depart + 1).avions), camera, ecran);
  assert.ok(poses.some(p => p.vol === tard.id && p.ton === 'critique' && p.h === D.COMPACTE.h));
  assert.deepEqual(cam.recouvrements(poses), [], 'les étiquettes des avions ne se recouvrent pas');
});

test('les retours sales rejoignent la file de la plonge ; chaque tunnel s’anime quand il lave, et seulement lui', () => {
  const plonge = U.site.zones.find(z => (z.tunnels || []).length), retours = U.r.lots.filter(l => l.retourVol && Number.isFinite(l.arrivee));
  assert.ok(plonge && retours.length >= 10, 'la journée fictive a une plonge et des retours');
  const lave = retours.find(l => Number.isFinite(l.debut) && Number.isFinite(l.fin) && l.debut - l.arrivee >= 3) || retours.find(l => Number.isFinite(l.fin));
  const sien = (l, t) => circule(t).chariots.filter(c => c.ton === 'sale' && c.vol === l.vol);
  assert.equal(sien(lave, lave.arrivee - E.MARCHE - 0.5).length, 0, 'pas là avant son arrivée');
  const arrive = sien(lave, lave.arrivee - 1);
  assert.ok(arrive.length === E.chariotsPour(lave.unites, N) && arrive.every(c => c.etat === 'arrive' && c.enChemin), 'il arrive : un chariot par tranche d’unités, en chemin');
  if (lave.debut - lave.arrivee >= 3) { const file = sien(lave, lave.arrivee + 1); assert.ok(file.length && file.every(c => c.etat === 'file' && dans(c, plonge)), 'il attend dans la file de la plonge'); }
  const dedans = sien(lave, (lave.debut + lave.fin) / 2);
  assert.ok(dedans.length === 1 && dedans[0].etat === 'lave' && dedans[0].tunnel === lave.nomTunnel, 'il passe dans son tunnel');
  assert.equal(sien(lave, lave.fin + 0.1).length, 0, 'lavé, il n’est plus là');
  // À chaque heure : les tunnels qui s'animent sont ceux qui lavent, et seulement eux.
  let animes = 0;
  for (const t of HEURES) {
    const attendus = new Set(retours.flatMap(l => (l.parts && l.parts.length ? l.parts : [l]).filter(p => Number.isFinite(p.debut) && Number.isFinite(p.fin) && t >= p.debut && t < p.fin).map(p => p.nomTunnel ?? l.nomTunnel)));
    const c = circule(t);
    assert.deepEqual(c.tunnels.slice().sort(), [...attendus].sort(), 'à ' + P.hhmm(t));
    assert.deepEqual(E.tunnelsQuiLavent(U.r, t).sort(), [...attendus].sort());
    for (const nom of c.tunnels) assert.ok(plonge.tunnels.some(m => m.nom === nom), 'un tunnel du site');
    // Le sale en file : ce qui est arrivé et dont le lavage n'a pas commencé (un vol que personne ne lave reste en file).
    const enFile = retours.filter(l => t >= l.arrivee && !(Number.isFinite(l.fin) && t >= l.fin) && !(l.parts && l.parts.length ? l.parts : Number.isFinite(l.debut) && Number.isFinite(l.fin) ? [l] : []).some(p => p.debut <= t));
    assert.equal(c.chariots.filter(x => x.ton === 'sale' && x.etat === 'file').length, somme(enFile, l => E.chariotsPour(l.unites, N)), 'à ' + P.hhmm(t) + ' : le sale en file');
    animes += c.tunnels.length;
  }
  assert.ok(animes > 10, 'des tunnels ont lavé');
  // Ce qui reste le soir reste visible devant la plonge.
  const soir = circule(BORNES.a), restes = retours.filter(l => !Number.isFinite(l.fin));
  assert.equal(soir.chariots.filter(c => c.ton === 'sale').length, somme(restes, l => E.chariotsPour(l.unites, N)), 'le reste du soir');
  for (const c of soir.chariots.filter(x => x.ton === 'sale')) assert.ok(dans(c, plonge), 'devant la plonge');
});

test('un lavage passé en relais reste dans son tunnel ; arrêté à une fin de présence, il reste devant, marqué « arrêté »', () => {
  const tunnels = U.site.zones.find(z => (z.tunnels || []).length).tunnels.map(t => t.nom);
  assert.ok(tunnels.length >= 2);
  const [T1, T2] = tunnels;
  const r = resultat({ lots: [
    // Un relais : l'équipe du matin lave jusqu'à 130, celle du soir continue dans le même tunnel.
    { retourVol: true, vol: 'ZZ910 (J-1)', cie: 'ZZ', arrivee: 90, unites: 120, debut: 100, fin: 160, nomTunnel: T1, atelier: 'matin',
      parts: [{ atelier: 'matin', debut: 100, fin: 130, nomTunnel: T1 }, { atelier: 'soir', debut: 130, fin: 160, nomTunnel: T1 }] },
    // Un arrêt : arrêté à 130 dans le second tunnel, repris à 200 dans le premier.
    { retourVol: true, vol: 'ZZ911 (J-1)', cie: 'ZZ', arrivee: 95, unites: 60, debut: 105, fin: 230, nomTunnel: T2, atelier: 'matin',
      parts: [{ atelier: 'matin', debut: 105, fin: 130, nomTunnel: T2 }, { atelier: 'soir', debut: 200, fin: 230, nomTunnel: T1 }] },
    // Un reste : commencé, arrêté à 130, jamais repris.
    { retourVol: true, vol: 'ZZ912 (J-1)', cie: 'ZZ', arrivee: 96, unites: 40, debut: 120, fin: null, nomTunnel: T2, atelier: 'matin', reste: 20,
      parts: [{ atelier: 'matin', debut: 120, fin: 130, nomTunnel: T2 }] },
    // Jamais commencé : il reste en file.
    { retourVol: true, vol: 'ZZ913 (J-1)', cie: 'ZZ', arrivee: 97, unites: 30, debut: null, fin: null, impossible: true }
  ] });
  const scene = sceneDe(r), a = t => D.circulation(scene, { r }, t), de = (c, vol) => c.chariots.filter(x => x.vol === vol);
  // Le relais : à 129, à 130 et à 131, le même chariot au même endroit, dans le même tunnel.
  const avant = de(a(129), 'ZZ910 (J-1)'), pendant = de(a(130), 'ZZ910 (J-1)'), apres = de(a(131), 'ZZ910 (J-1)');
  for (const l of [avant, pendant, apres]) assert.deepEqual(l.map(c => [c.etat, c.tunnel]), [['lave', T1]], 'il reste dans son tunnel');
  assert.deepEqual([pendant[0].x, pendant[0].y], [avant[0].x, avant[0].y], 'il ne bouge pas quand l’équipe change');
  assert.deepEqual(E.lavagesA(r, 129).find(x => x.vol === 'ZZ910 (J-1)').atelier, 'matin');
  assert.deepEqual(E.lavagesA(r, 131).find(x => x.vol === 'ZZ910 (J-1)').atelier, 'soir', 'seule l’équipe change');
  assert.ok(a(131).tunnels.includes(T1));
  // L'arrêt : de 130 à 200, devant le tunnel où il s'est arrêté, marqué « arrêté » ; à 200, il reprend dans l'autre.
  const arrete = a(150), siens = de(arrete, 'ZZ911 (J-1)');
  assert.ok(siens.length === E.chariotsPour(60, E.tranche(r)) && siens.every(c => c.etat === 'arrete' && c.tunnel === T2), 'arrêté devant son tunnel');
  assert.ok(arrete.marques.some(m => m.texte === 'arrêté' && m.vol === 'ZZ911 (J-1)'), 'marqué « arrêté »');
  assert.ok(!arrete.tunnels.includes(T2), 'un tunnel arrêté ne s’anime pas');
  assert.deepEqual(de(a(210), 'ZZ911 (J-1)').map(c => [c.etat, c.tunnel]), [['lave', T1]], 'repris dans un autre tunnel');
  assert.ok(!a(210).marques.some(m => m.vol === 'ZZ911 (J-1)'), 'repris : plus de marque');
  assert.equal(de(a(231), 'ZZ911 (J-1)').length, 0);
  // Le reste et ce qui n'a pas commencé restent visibles jusqu'au soir.
  const soir = a(1300);
  assert.ok(de(soir, 'ZZ912 (J-1)').every(c => c.etat === 'arrete') && de(soir, 'ZZ912 (J-1)').length === 1);
  assert.ok(soir.marques.some(m => m.texte === 'arrêté' && m.vol === 'ZZ912 (J-1)'));
  assert.deepEqual(de(soir, 'ZZ913 (J-1)').map(c => c.etat), ['file']);
  assert.deepEqual(soir.tunnels, [], 'le soir, aucun tunnel ne lave');
  const plonge = U.site.zones.find(z => (z.tunnels || []).length);
  for (const c of soir.chariots) assert.ok(dans(c, plonge), 'devant la plonge, dans sa zone');
});

test('la ligne robotisée s’anime quand son équipe travaille, avec sa cadence en clair', () => {
  const robot = U.r.ateliers.find(e => e.type === 'robot'), lots = U.r.lots.filter(l => l.atelier === robot.id && Number.isFinite(l.debut) && Number.isFinite(l.fin));
  assert.ok(lots.length, 'la journée fictive a une équipe robot au travail');
  const l = lots[0], au = circule((l.debut + l.fin) / 2);
  assert.equal(au.lignes.length, 1);
  assert.equal(au.lignes[0].atelier, robot.id);
  assert.equal(au.lignes[0].debit, l.debit, 'la cadence du lot en cours');
  assert.deepEqual(au.marques.filter(m => m.ligne != null).map(m => m.texte), [Math.round(l.debit) + ' plateaux par heure']);
  const food = U.site.zones.find(z => (z.lignes || []).length), ligne = food.lignes[au.lignes[0].ligne];
  assert.ok(ligne.ateliers.includes(robot.id), 'sa ligne, dans la zone FOOD');
  // Hors de ses lots, la ligne est au repos : ni animation, ni cadence.
  for (const t of HEURES) {
    const c = circule(t), travaille = lots.some(x => t >= x.debut && t < x.fin);
    assert.equal(c.lignes.length, travaille ? 1 : 0, 'à ' + P.hhmm(t));
    assert.equal(c.marques.filter(m => m.ligne != null).length, travaille ? 1 : 0);
  }
});

test('rien ne circule quand rien n’attend', () => {
  const vide = { chariots: [], pousseurs: [], vehicules: [], avions: [], tunnels: [], lignes: [], marques: [] };
  const sans = ({ tranche, ...c }) => c;
  // Avant la journée, bien avant le premier lot et le premier avion.
  const premier = Math.min(...U.r.vols.map(v => v.depart)) - E.AVANT_DEPART, tot = Math.min(BORNES.de, premier) - 120;
  assert.deepEqual(sans(circule(tot)), vide, 'avant la journée');
  // Sans journée, sans heure, sans site.
  assert.deepEqual(sans(D.circulation(U.scene, null, 600)), vide);
  assert.deepEqual(sans(D.circulation(U.scene, U.journee, null)), vide);
  assert.deepEqual(sans(D.circulation({ site: null, ilots: [] }, U.journee, 600)), vide);
  // Une journée sans stock, sans lot, sans vol : rien, à aucune heure.
  const rien = resultat({});
  for (const t of [0, 400, 800, 1300]) assert.deepEqual(sans(D.circulation(sceneDe(rien), { r: rien }, t)), vide);
  assert.equal(D.aireDe(U.site, E.placesDesVols(rien).nombre), null, 'sans vol, pas d’aire des avions');
  // À une heure où un service n'a rien en stock, sa file est vide.
  let vides = 0;
  for (const t of HEURES) for (const service of Object.keys(U.r.stocks.parService)) {
    if (U.r.stocks.sejours.some(s => s.vers === service && t >= s.entree && t < s.sortie)) continue;
    assert.equal(circule(t).chariots.filter(c => c.etat === 'file' && c.ton !== 'sale' && c.service === service).length, 0, service + ' à ' + P.hhmm(t));
    vides++;
  }
  assert.ok(vides > 20, 'le contrôle a vu des files vides');
});

test('la lecture ne change rien et rend toujours la même scène', () => {
  const avant = JSON.stringify([U.r.lots, U.r.vols, U.r.stocks, U.r.classes, U.site, U.ilots]);
  const a = circule(560), b = circule(560);
  assert.deepEqual(a, b, 'deux lectures identiques');
  for (const t of [190, 400, 700, 1240]) circule(t);
  assert.equal(JSON.stringify([U.r.lots, U.r.vols, U.r.stocks, U.r.classes, U.site, U.ilots]), avant, 'ni le résultat ni le site ne sont touchés');
  // Aucun nombre invalide dans la scène.
  for (const t of HEURES) { const c = circule(t); for (const o of [...c.chariots, ...c.pousseurs, ...c.vehicules, ...c.avions, ...c.marques]) assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y), 'à ' + P.hhmm(t)); }
});

test('les vols qui portent leur étiquette : ceux qu’on charge, puis ceux qui partent dans l’heure ; six au plus', () => {
  const avion = (id, depart, plus = {}) => ({ id, depart, decolle: 0, ...plus });
  assert.equal(D.HEURE_DES_VOLS, 60);
  assert.equal(D.VOLS_ETIQUETES, 6);
  // Dans l'heure qui vient : oui ; plus tard, ou son heure passée sans qu'on le charge : non.
  const avions = [avion('F10', 630), avion('F11', 661), avion('F12', 600), avion('F13', 540, { enRetard: true }), avion('F14', 605, { decolle: 0.4 })];
  assert.deepEqual(D.volsEtiquetes(avions, [], 600), ['F12', 'F10'], 'les plus proches d’abord ; ni celui d’après l’heure, ni celui en retard, ni celui qui décolle');
  // Celui qu'on charge passe devant, même en retard ; une tournée qui rentre ne charge plus.
  assert.deepEqual(D.volsEtiquetes(avions, [{ phase: 'aller', vols: ['F13'] }], 600), ['F13', 'F12', 'F10']);
  assert.deepEqual(D.volsEtiquetes(avions, [{ phase: 'charge', vols: ['F13', 'F11'] }], 600), ['F13', 'F11', 'F12', 'F10'], 'ceux qu’on charge d’abord, le plus tôt en tête');
  assert.deepEqual(D.volsEtiquetes(avions, [{ phase: 'retour', vols: ['F13'] }], 600), ['F12', 'F10']);
  // Six au plus, quel que soit le nombre de vols dans l'heure.
  const beaucoup = Array.from({ length: 10 }, (x, i) => avion('G' + i, 600 + i * 5));
  assert.deepEqual(D.volsEtiquetes(beaucoup, [], 600), ['G0', 'G1', 'G2', 'G3', 'G4', 'G5']);
  assert.deepEqual(D.volsEtiquetes(beaucoup, [{ phase: 'aller', vols: ['G9'] }], 600), ['G9', 'G0', 'G1', 'G2', 'G3', 'G4']);
  assert.deepEqual(D.volsEtiquetes(beaucoup, [], 600, 2), ['G0', 'G1']);
  assert.deepEqual(D.volsEtiquetes([], [], 600), []);
  // Sur la journée fictive, à chaque heure de contrôle : six au plus, tous des avions présents, chargés ou dans l'heure.
  let vus = 0;
  for (const t of HEURES) {
    const c = circule(t), ids = D.volsEtiquetes(c.avions, c.vehicules, t), enCharge = new Set(c.vehicules.filter(v => v.phase !== 'retour').flatMap(v => v.vols));
    assert.ok(ids.length <= 6, 'à ' + t + ' : ' + ids.length);
    for (const id of ids) { const a = c.avions.find(o => o.id === id); assert.ok(a && !(a.decolle > 0) && (enCharge.has(id) || (a.depart >= t && a.depart - t <= 60)), id + ' à ' + t); }
    vus += ids.length;
  }
  assert.ok(vus > 20, 'la journée fictive a des vols étiquetés (' + vus + ')');
});
