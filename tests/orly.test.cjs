/* Régressions du modèle Orly (moteur/orly.js), rejoué sans interface. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { construireModele, simulerJournee, JEU_DEMO, CFG_DEFAUT, chargeVol, capacitePlonge, ATELIERS } = require('../moteur/orly.js');
const { serviceMetrics } = require('../ui-model.js');

const cfg = (patch) => {
  const c = JSON.parse(JSON.stringify(CFG_DEFAUT));
  if (patch) patch(c);
  return c;
};
const journee = (c, donnees) => simulerJournee(donnees || JEU_DEMO, c, serviceMetrics);

test('la journée de démonstration se termine : tous les départs finissent par être prêts', () => {
  const r = journee(cfg());
  assert.equal(r.kpis.total, 12);
  assert.equal(r.kpis.prets, 12);
  assert.equal(r.kpis.overdue, 0);
  // Avec la règle du robot, la démo passe à l'heure par défaut : la tension du
  // matin était un artefact de l'ancien modèle qui envoyait tous les YC au robot.
  assert.equal(r.kpis.ontime, 100);
  assert.ok(journee(cfg(c => { c.robotCadence = 200; })).kpis.ontime < 100, 'ralentir le robot doit créer des retards');
  assert.ok(journee(cfg(c => { c.staff.cuisine = 2; })).kpis.ontime < 100, 'réduire la cuisine doit créer des retards');
  // Toutes les grandeurs du bilan sont mesurées, jamais NaN.
  Object.values(r.bilan.ateliers).forEach(a => {
    assert.ok(a.occupationJour >= 0 && a.occupationJour <= 1);
    assert.ok(Number.isFinite(a.ofMoyens));
  });
});

test('la même journée rejouée donne exactement le même résultat', () => {
  const a = journee(cfg()), b = journee(cfg());
  assert.deepEqual(a.kpis, b.kpis);
  assert.deepEqual(a.bilan, b.bilan);
  assert.deepEqual(a.modele.flights.map(f => f.readyTime), b.modele.flights.map(f => f.readyTime));
});

test('un atelier sans personne ne finit jamais : les départs restent non prêts', () => {
  const r = journee(cfg(c => { c.staff.appros = 0; }));
  assert.equal(r.kpis.prets, 0);
  assert.equal(r.kpis.overdue, 12);
  // Les OF food sont libérés et attendent bien en appros, l'interface doit le voir.
  const st = r.modele.stations.appros;
  assert.equal(st.capacite, 0);
  assert.equal(st.qlen, 12);
  const g = r.modele.goulot();
  assert.equal(g.id, 'appros');
  assert.equal(g.cause, 'aucune personne');
});

test('la cadence du robot agit sur la ponctualité et sur l’attente, dans le bon sens', () => {
  const lent = journee(cfg(c => { c.robotCadence = 200; }));
  const ref = journee(cfg());
  const rapide = journee(cfg(c => { c.robotCadence = 560; }));
  assert.ok(lent.kpis.ontime < ref.kpis.ontime, 'ralentir le robot doit dégrader : ' + lent.kpis.ontime + ' vs ' + ref.kpis.ontime);
  assert.ok(rapide.kpis.ontime >= ref.kpis.ontime);
  assert.ok(lent.bilan.robot.attenteP90 > ref.bilan.robot.attenteP90 && ref.bilan.robot.attenteP90 > rapide.bilan.robot.attenteP90,
    'l’attente du robot doit décroître avec la cadence : ' + [lent, ref, rapide].map(r => r.bilan.robot.attenteP90).join(' > '));
  assert.ok(ref.bilan.robot.attenteP90 > 10, 'des vols attendent le robot : p90 = ' + ref.bilan.robot.attenteP90);
});

test('ajouter des personnes au montage ne peut pas dégrader la ponctualité', () => {
  const ref = journee(cfg());
  const plus = journee(cfg(c => { c.staff.prepa = 30; }));
  assert.ok(plus.kpis.retardMoy <= ref.kpis.retardMoy);
});

test('un tampon fini crée le blocage amont, mesuré et visible', () => {
  const serre = journee(cfg(c => { c.tampons = { prepa: 1 }; }));
  const large = journee(cfg());
  assert.ok(serre.bilan.ateliers.prepa.partBloquante > 0, 'le tampon du montage doit bloquer');
  assert.equal(large.bilan.ateliers.prepa.partBloquante, 0);
  // Les OF finis en cuisine y restent tant que le montage est plein.
  assert.ok(serre.bilan.ateliers.cuisine.ofMoyens > large.bilan.ateliers.cuisine.ofMoyens);
  assert.ok(serre.kpis.retardMoy >= large.kpis.retardMoy);
});

test('l’avancée par pas expose une vue cohérente pour le rendu', () => {
  const c = cfg();
  const jetons = [];
  const m = construireModele(JEU_DEMO, c, { surToken: (edge, col) => jetons.push(edge) });
  assert.equal(m.maintenant, c.jour.debut);
  ATELIERS.forEach(id => { assert.equal(m.stations[id].util, 0); assert.equal(m.stations[id].qlen, 0); });
  m.avancerA(c.jour.debut + 0.5);
  // À 05:00 les OF du matin sont déjà libérés : ils entrent, et l'animation le voit.
  assert.ok(jetons.includes('appros_decontam'));
  assert.ok(m.stations.appros.qlen > 0);
  for (let t = c.jour.debut + 1; t <= c.jour.debut + 60; t += 0.5) m.avancerA(t);
  assert.ok(m.stations.appros.util > 0 && m.stations.appros.util <= 1);
  assert.ok(m.debitRobot() > 0, 'le robot doit tourner à 06:00');
  const g = m.goulot();
  assert.ok(g === null || (ATELIERS.includes(g.id) && g.attente >= 0));
  assert.ok(m.jobs.some(j => j.released && !j.done && ATELIERS.includes(j.stationId)));
});

test('le barème et la plonge gardent leurs définitions', () => {
  const c = chargeVol({ cie: 'TX', bc: 10, pc: 0, yc: 100 });   // compagnie servie par le robot
  assert.equal(c.food.robot, 100);
  assert.equal(chargeVol({ cie: 'AF', bc: 10, pc: 0, yc: 100 }).food.robot, 0);
  assert.equal(c.armement, 110 * 0.08 + 15);
  assert.equal(capacitePlonge({ tunnels: 3, tunnelDouble: true }), 4);
  assert.equal(capacitePlonge({ tunnels: 2, tunnelDouble: false }), 2);
});

test('un vol importé dont l’échéance est déjà passée reste comptabilisé en retard', () => {
  const data = [{ id: 'X', cie: 'TX', avion: 'A350', sens: 'DEP', std: 5 * 60, sta: null, bc: 1, pc: 2, yc: 100 }];
  const r = journee(cfg(c => { c.staff.appros = 0; }), data);
  assert.equal(r.kpis.overdue, 1);
  assert.equal(r.kpis.ontime, 0);
  assert.equal(r.modele.flights[0].readyTime, null);
});

test('des vols qui attendent le robot sont désignés comme goulot, avec leur cause', () => {
  const c = cfg();
  const m = construireModele(JEU_DEMO, c);
  let vu = null;
  for (let t = c.jour.debut + 0.5; t <= c.jour.debut + 300 && !vu; t += 0.5) {   // jusqu'à 10:00
    m.avancerA(t);
    const g = m.goulot();
    if (g && /robot occupé/.test(g.cause)) vu = { t, g, robotUtil: m.stations.prepa.robotUtil, attente: m.stations.prepa.robotAttente };
  }
  assert.ok(vu, 'au cours du matin, au moins un vol doit attendre le robot');
  assert.equal(vu.g.id, 'prepa');
  assert.ok(vu.attente >= 1);
  assert.ok(vu.robotUtil > 0);
});

test('le robot ne sert que les compagnies de la liste ; les autres YC sont dressés à la main', () => {
  const { robotServi } = require('../moteur/orly.js');
  const c = cfg();
  const tx = chargeVol({ cie: 'tx', bc: 0, pc: 0, yc: 100 }, c);     // insensible à la casse
  const af = chargeVol({ cie: 'AF', bc: 0, pc: 0, yc: 100 }, c);
  assert.equal(tx.robotServi, true);  assert.equal(tx.food.robot, 100);
  assert.equal(af.robotServi, false); assert.equal(af.food.robot, 0);
  assert.equal(af.food.prepa - tx.food.prepa, 100 * c.ycManuel);   // le manuel coûte des homme-minutes au montage
  assert.equal(robotServi({ cie: 'CRL' }, cfg(x => { x.robotCompagnies = []; })), false);
});

test('la liste des compagnies servies est un levier : sans robot, le montage porte tout', () => {
  const ref = journee(cfg());
  const sans = journee(cfg(c => { c.robotCompagnies = []; }));
  assert.ok(ref.bilan.robot.plateauxRobot > 0 && ref.bilan.robot.plateauxManuel > 0, 'la démo doit exercer les deux voies');
  assert.equal(sans.bilan.robot.plateauxRobot, 0);
  assert.equal(sans.bilan.robot.occupationJour, 0);
  assert.ok(sans.bilan.ateliers.prepa.occupationJour > ref.bilan.ateliers.prepa.occupationJour);
  assert.equal(sans.bilan.robot.plateauxManuel, ref.bilan.robot.plateauxRobot + ref.bilan.robot.plateauxManuel);
});

test('la relève d’équipe change l’effectif à l’heure dite, et le soir se joue avec l’équipe du soir', () => {
  // Cuisine : 10 le matin, personne le soir → la vague du soir reste bloquée en cuisine.
  const soirVide = journee(cfg(c => { c.equipes = { bascule: 14 * 60, soir: { cuisine: 0 } }; }));
  const matin = soirVide.modele.flights.filter(f => f.sens === 'DEP' && f.std < 14 * 60);
  const soir = soirVide.modele.flights.filter(f => f.sens === 'DEP' && f.std >= 14 * 60);
  assert.ok(matin.every(f => f.readyTime != null), 'la vague du matin est faite par l’équipe du matin');
  assert.ok(soir.every(f => f.readyTime == null), 'sans équipe du soir en cuisine, rien ne sort le soir');
  assert.equal(soirVide.modele.stations.cuisine.capacite, 0);
  assert.equal(soirVide.modele.goulot().cause, 'aucune personne');
  // Personnes moyennes sur la journée : 10 pendant 9 h puis 0 pendant 9 h = 5.
  assert.ok(Math.abs(soirVide.bilan.ateliers.cuisine.personnes - 5) < 1e-9);

  // Renfort du soir : identique au matin en ponctualité, occupation plus basse le soir.
  const ref = journee(cfg());
  const renfort = journee(cfg(c => { c.equipes = { bascule: 14 * 60, soir: { prepa: 30 } }; }));
  assert.ok(renfort.kpis.retardMoy <= ref.kpis.retardMoy);
  assert.ok(renfort.bilan.ateliers.prepa.occupationJour < ref.bilan.ateliers.prepa.occupationJour);
  // Une bascule avant l'ouverture s'applique d'emblée, sans processus.
  const tot = journee(cfg(c => { c.equipes = { bascule: 4 * 60, soir: { prepa: 0 } }; }));
  assert.equal(tot.kpis.prets, 0);
});

test('un retard s’explique : l’OF qui fixe l’heure dit où il a attendu', () => {
  const r = journee(cfg(c => { c.robotCadence = 200; }));
  const m = r.modele;
  const enRetard = m.flights.filter(f => f.sens === 'DEP' && f.retard > 0);
  assert.ok(enRetard.length > 0, 'à 200 pl/h la démo doit produire des retards');
  const robotEnRetard = enRetard.filter(f => f.robot);
  assert.ok(robotEnRetard.length > 0);
  // Tous les retards ne viennent pas d'une attente : un vol peut être en retard
  // parce que son seul dressage robot dure plus que sa fenêtre. L'explication
  // doit alors le dire par le travail, sans inventer une attente.
  robotEnRetard.forEach(f => {
    const x = m.expliquer(f);
    assert.equal(x.of, 'food');
    assert.match(x.phrase, /le dernier fini/);
    assert.match(x.phrase, /travail \d+ min/);
    if (x.attenteRobot > 0.5) assert.match(x.phrase, /attente du robot \d+ min/);
    else assert.doesNotMatch(x.phrase, /attente du robot/);
  });
  assert.ok(robotEnRetard.some(f => m.expliquer(f).attenteRobot > 0), 'au moins un vol du matin doit avoir attendu le robot');
  // Cohérence : chaque composante est bornée par le séjour de l'OF, et le
  // travail au montage inclut le dressage robot (qui dure, lui aussi).
  m.jobs.filter(j => j.done && j.kind === 'food').forEach(j => {
    const d = m.decomposer(j);
    const sejour = j.finT - j.liberationT;
    for (const k of ['attenteEntree', 'attentePersonnes', 'attenteRobot', 'attenteAval', 'travail']) {
      assert.ok(d[k] >= 0 && d[k] <= sejour + 1e-9, j.flight.id + ' ' + k + '=' + d[k] + ' séjour=' + sejour);
    }
    assert.equal(d.parAtelier.length, j.route.length);
    assert.deepEqual(d.parAtelier.map(x => x.atelier), j.route);
  });
});

test('l’état d’un OF dit ce qu’il attend, en direct', () => {
  const c = cfg(x => { x.staff.appros = 0; });
  const m = construireModele(JEU_DEMO, c);
  const food = m.jobs.find(j => j.kind === 'food');
  assert.equal(m.etatOF(food), 'a_liberer');
  m.avancerA(c.jour.debut + 1);
  assert.equal(m.etatOF(food), 'attente_personne');
  assert.equal(m.ETATS[m.etatOF(food)], 'attend une personne');
  const x = m.expliquer(food.flight);
  assert.equal(x.etat, 'attente_personne');
  assert.match(x.phrase, /^OF food attend une personne — appros/);
});

test('le journal donne une ligne par atelier traversé, dans l’ordre du temps', () => {
  const r = journee(cfg());
  const j = r.modele.journal();
  const finis = r.modele.jobs.filter(x => x.done);
  assert.equal(j.length, finis.reduce((n, x) => n + x.route.length, 0));
  for (let i = 1; i < j.length; i++) assert.ok(j[i].entree >= j[i - 1].entree);
  j.forEach(l => { assert.ok(l.entree <= l.debut && l.debut <= l.fin && l.fin <= l.sortie, JSON.stringify(l)); });
  assert.ok(j.some(l => l.atelier === 'prepa' && l.robotDebut != null && l.robotFin > l.robotDebut));
});

/* ======================================================================
 *  MATÉRIEL PROPRE — la plonge réalimente ce que la dotation consomme
 * ====================================================================*/

test('le matériel propre se conserve : initial + lavé − consommé = stock final', () => {
  const r = journee(cfg(c => { c.materiel.initial = 8000; }));
  const m = r.bilan.materiel;
  assert.ok(r.modele.jobs.every(j => j.done), 'avec un stock large, tout doit finir');
  assert.equal(m.initial + m.lave - m.consomme, m.niveau);
  assert.equal(m.lave, 1772);          // somme des passagers des six retours
  assert.equal(m.consomme, 3220);      // somme des passagers des douze départs
  assert.equal(m.partEnRupture, 0);
});

test('un stock insuffisant arrête la dotation, et la ponctualité suit le stock', () => {
  const large = journee(cfg(c => { c.materiel.initial = 8000; }));
  const juste = journee(cfg(c => { c.materiel.initial = 1400; }));
  const vide  = journee(cfg(c => { c.materiel.initial = 0; }));

  assert.equal(large.kpis.ontime, 100);
  assert.ok(juste.kpis.ontime < large.kpis.ontime, 'stock serré : ' + juste.kpis.ontime);
  assert.ok(vide.kpis.ontime < juste.kpis.ontime, 'stock vide : ' + vide.kpis.ontime);
  assert.ok(vide.bilan.materiel.partEnRupture > 0.9);
  assert.equal(large.bilan.materiel.partEnRupture, 0);

  // Le personnel n'y est pour rien : la dotation n'est pas plus occupée.
  assert.ok(vide.bilan.ateliers.dotation.occupationJour <= large.bilan.ateliers.dotation.occupationJour + 1e-9,
    'un stock vide ne doit pas occuper davantage la dotation');
  // Sans retours lavés, rien ne repart : c'est la plonge qui réalimente.
  assert.equal(vide.bilan.materiel.lave, large.bilan.materiel.lave);
});

test('le réglage par défaut ne contraint pas la démonstration', () => {
  const avec = journee(cfg());
  const sans = journee(cfg(c => { c.materiel.actif = false; }));
  assert.equal(sans.bilan.materiel, null);
  assert.deepEqual(avec.kpis, sans.kpis);   // même journée : le stock par défaut suffit
  assert.ok(avec.bilan.materiel.niveauMin > 0, 'le stock ne doit pas tomber à zéro par défaut');
});

test('un dossier qui attend du matériel le dit, sans occuper personne', () => {
  const c = cfg(x => { x.materiel.initial = 0; });
  const m = construireModele(JEU_DEMO, c);
  m.avancerA(c.jour.debut + 60);                       // 06:00, aucun retour encore lavé
  const dot = m.jobs.find(j => j.kind === 'dot' && j.released && !j.done);
  assert.ok(dot, 'un OF dotation doit être libéré');
  assert.equal(m.etatOF(dot), 'attente_materiel');
  assert.equal(m.ETATS.attente_materiel, 'attend du matériel propre');
  assert.equal(m.stations.dotation.ressource.occupees, 0, 'personne ne doit être mobilisé devant un stock vide');
  assert.ok(m.stations.dotation.qlen > 0, 'l’OF reste visible dans l’atelier');

  const g = m.goulot();
  assert.equal(g.id, 'dotation');
  assert.match(g.cause, /matériel propre en rupture/);

  const x = m.expliquer(dot.flight);
  assert.equal(x.etat, 'attente_materiel');
  assert.match(x.phrase, /attend du matériel propre/);
});

test('l’attente de matériel n’est pas recomptée comme attente de personnes', () => {
  const r = journee(cfg(c => { c.materiel.initial = 1000; }));
  const m = r.modele;
  const dots = m.jobs.filter(j => j.kind === 'dot' && j.done);
  assert.ok(dots.some(j => m.decomposer(j).attenteMateriel > 1), 'la démo doit produire des attentes matériel');
  dots.forEach(j => {
    const d = m.decomposer(j);
    const sejour = j.finT - j.liberationT;
    assert.ok(d.attenteMateriel >= 0);
    assert.ok(d.attentePersonnes >= 0, 'l’attente de personnes ne doit pas devenir négative');
    assert.ok(d.attenteMateriel + d.attentePersonnes + d.travail <= sejour + 1e-9,
      j.flight.id + ' : ' + JSON.stringify(d) + ' séjour ' + sejour);
    assert.equal(d.parAtelier[0].atelier, 'dotation');
  });
});

/* ======================================================================
 *  CALENDRIER MULTIJOUR — cuisine J−2, prépa J−1, heures d'ouverture
 * ====================================================================*/

const calendrier = (patch) => cfg(c => { c.calendrier.actif = true; if (patch) patch(c); });
/** Jour d'un instant, relatif au premier jour de départs : −2, −1, 0, +1… */
const jourDe = (m, t) => Math.floor(t / 1440) - m.decalage;
const etapeDe = (j, atelier) => j.etapes.find(e => e.atelier === atelier);

test('l’arithmétique des jours est cohérente et le calendrier est inactif par défaut', () => {
  assert.equal(CFG_DEFAUT.calendrier.actif, false);
  const sans = construireModele(JEU_DEMO, cfg());
  assert.equal(sans.decalage, 0);
  assert.equal(sans.joursProduction, 1);
  assert.equal(sans.horizon, CFG_DEFAUT.jour.fin);
  assert.equal(sans.flights.length, JEU_DEMO.length);

  const avec = construireModele(JEU_DEMO, calendrier());
  assert.equal(avec.decalage, 2);                 // cuisine J−2
  assert.equal(avec.joursDeparts, 3);
  assert.equal(avec.joursProduction, 5);          // J−2 … J+2
  assert.equal(avec.horizon, 4 * 1440 + CFG_DEFAUT.jour.fin);
  assert.equal(avec.flights.length, JEU_DEMO.length * 3);
  assert.equal(avec.etiquetteJour(avec.debut), 'J−2');
  assert.equal(avec.etiquetteJour(2 * 1440 + 600), 'J');
  assert.equal(avec.etiquetteJour(avec.horizon), 'J+2');
  // Les copies des jours suivants portent un identifiant distinct.
  assert.equal(avec.flights.filter(f => f.id === 'AF1080').length, 1);
  assert.ok(avec.flights.some(f => f.id === 'AF1080·J+1'));
});

test('la cuisine se fait bien J−2 et la prépa J−1', () => {
  const m = construireModele(JEU_DEMO, calendrier());
  m.avancerA(m.horizon);
  const food = m.jobs.filter(j => j.kind === 'food' && j.done);
  assert.ok(food.length > 30);
  food.forEach(j => {
    const d = j.flight.jour;
    assert.equal(jourDe(m, etapeDe(j, 'appros').entree), d - 2, j.flight.id + ' appros');
    assert.equal(jourDe(m, etapeDe(j, 'cuisine').entree), d - 2, j.flight.id + ' cuisine');
    assert.equal(jourDe(m, etapeDe(j, 'prepa').entree), d - 1, j.flight.id + ' prépa');
  });
  // Dotation et armement restent le jour du départ.
  m.jobs.filter(j => (j.kind === 'dot' || j.kind === 'arm') && j.done)
    .forEach(j => assert.equal(jourDe(m, j.etapes[0].entree), j.flight.jour));
});

test('l’exception CRL du soir ramène la prépa au matin du départ', () => {
  const soir = [
    { id: 'CRL900', cie: 'CRL', avion: 'A350', sens: 'DEP', std: 21 * 60 + 30, bc: 10, pc: 10, yc: 100 },
    { id: 'CRL700', cie: 'CRL', avion: 'A350', sens: 'DEP', std: 7 * 60, bc: 10, pc: 10, yc: 100 },
    { id: 'AF900', cie: 'AF', avion: 'A350', sens: 'DEP', std: 21 * 60 + 30, bc: 10, pc: 10, yc: 100 }
  ];
  const m = construireModele(soir, calendrier(c => { c.calendrier.jours = 1; }));
  m.avancerA(m.horizon);
  const prepaDe = id => jourDe(m, etapeDe(m.jobs.find(j => j.flight.id === id && j.kind === 'food'), 'prepa').entree);
  assert.equal(prepaDe('CRL900'), 0, 'CRL du soir : prépa le matin de J');
  assert.equal(prepaDe('CRL700'), -1, 'CRL du matin : prépa J−1, l’exception ne s’applique pas');
  assert.equal(prepaDe('AF900'), -1, 'autre compagnie le soir : prépa J−1');
  // La règle est réglable : liste vide, plus personne n'est excepté.
  const sans = construireModele(soir, calendrier(c => { c.calendrier.jours = 1; c.calendrier.exception.compagnies = []; }));
  sans.avancerA(sans.horizon);
  const j = sans.jobs.find(x => x.flight.id === 'CRL900' && x.kind === 'food');
  assert.equal(jourDe(sans, etapeDe(j, 'prepa').entree), -1);
});

test('la nuit, plus personne n’est là, et le travail reprend à l’ouverture', () => {
  const c = calendrier();
  const m = construireModele(JEU_DEMO, c);
  m.avancerA(1440 + 2 * 60);                      // 02:00, deuxième nuit
  m.ATELIERS.forEach(id => assert.equal(m.stations[id].capacite, 0, id + ' doit être fermé la nuit'));
  m.avancerA(1440 + c.jour.debut + 30);           // 05:30 le lendemain
  assert.equal(m.stations.cuisine.capacite, c.staff.cuisine);
  assert.equal(m.stations.plonge.capacite, 4);
  // Aucun lot ne DÉMARRE hors de la fenêtre d'ouverture — un lot commencé
  // avant la fermeture peut en revanche se terminer après, personne n'est interrompu.
  m.avancerA(m.horizon);
  m.jobs.filter(j => j.etapes.length).forEach(j => j.etapes.forEach(et => {
    if (et.debut == null || et.debut === et.entree) return;
    const minute = ((et.debut % 1440) + 1440) % 1440;
    assert.ok(minute >= c.jour.debut && minute <= c.jour.fin,
      j.flight.id + ' ' + et.atelier + ' démarre à ' + minute);
  }));
});

test('un ordre qui attend la nuit quitte son atelier au lieu de le bloquer', () => {
  const m = construireModele(JEU_DEMO, calendrier());
  m.avancerA(1440 + 2 * 60);                       // 02:00 de la première nuit
  const dormants = m.jobs.filter(j => m.etatOF(j) === 'attente_calendrier');
  assert.ok(dormants.length > 0, 'des OF doivent attendre l’ouverture du montage');
  assert.equal(m.ETATS.attente_calendrier, 'en stock, attend l’ouverture de son atelier');
  // Ils ne sont dans le tampon d'aucun atelier : ils attendent en stock.
  const dansUnTampon = m.ATELIERS.reduce((n, id) => n + m.stations[id].tampon.remplissageCourant, 0);
  assert.equal(dansUnTampon, 0, 'aucun OF ne doit occuper un atelier pendant la nuit');
  // Et le goulot ne désigne rien : attendre l'ouverture n'est pas un goulot.
  assert.equal(m.goulot(), null);
});

test('le calendrier lève la pression d’échéance sur la cuisine et la prépa', () => {
  // Matériel neutralisé pour isoler l'effet du calendrier.
  const sansCal = journee(cfg(c => { c.materiel.actif = false; }));
  const avecCal = (() => {
    const c = calendrier(x => { x.materiel.actif = false; });
    const m = construireModele(JEU_DEMO, c);
    m.avancerA(m.horizon);
    return { modele: m, kpis: serviceMetrics(m.flights, m.horizon), bilan: m.bilan() };
  })();
  assert.equal(avecCal.kpis.total, 36);
  assert.equal(avecCal.kpis.ontime, 100);
  assert.equal(avecCal.kpis.overdue, 0);
  assert.equal(sansCal.kpis.ontime, 100);
  // Le volume de travail est inchangé : trois fois la journée, même barème.
  const heures = b => Object.values(b.ateliers).reduce((n, a) => n + a.occupationJour * a.personnes, 0);
  assert.ok(heures(avecCal.bilan) > 0 && heures(sansCal.bilan) > 0);
  // L'explication nomme l'attente planifiée, sans la confondre avec un retard.
  const f = avecCal.modele.flights.find(x => x.sens === 'DEP' && x.jour === 1);
  const food = avecCal.modele.jobs.find(j => j.flight === f && j.kind === 'food');
  const d = avecCal.modele.decomposer(food);
  assert.ok(d.attenteCalendrier > 600, 'la nuit entre cuisine et prépa doit être comptée : ' + d.attenteCalendrier);
  assert.ok(d.attentePersonnes < d.attenteCalendrier);
});

test('le calendrier ne change rien quand il est inactif', () => {
  const a = journee(cfg());
  const b = journee(cfg(c => { c.calendrier.actif = false; c.calendrier.jours = 7; }));
  assert.deepEqual(a.kpis, b.kpis);
  assert.deepEqual(a.bilan.ateliers, b.bilan.ateliers);
});

/* ======================================================================
 *  VIVIERS — des personnes polyvalentes partagées entre ateliers
 * ====================================================================*/

const vivier = (effectif, ateliers, nom) => [{ nom: nom || 'Polyvalents', effectif, ateliers }];

test('sans vivier déclaré, rien ne change', () => {
  const a = journee(cfg());
  const b = journee(cfg(c => { c.viviers = []; }));
  assert.deepEqual(a.kpis, b.kpis);
  assert.deepEqual(a.bilan.viviers, []);
});

test('un vivier rattrape un atelier sous-doté, et l’on sait à quoi il a servi', () => {
  const sans = journee(cfg(c => { c.staff.cuisine = 2; }));
  const avec = journee(cfg(c => { c.staff.cuisine = 2; c.viviers = vivier(8, ['cuisine', 'prepa', 'dotation']); }));

  assert.ok(sans.kpis.ontime < 40, 'cuisine à 2 doit dégrader : ' + sans.kpis.ontime);
  assert.ok(avec.kpis.ontime > sans.kpis.ontime + 40, 'le vivier doit rattraper : ' + avec.kpis.ontime);
  assert.equal(avec.kpis.retardMoy, 0);

  const v = avec.bilan.viviers[0];
  assert.equal(v.effectif, 8);
  assert.deepEqual(v.ateliers, ['cuisine', 'prepa', 'dotation']);
  assert.ok(v.minutesPretees > 1000, 'le vivier doit avoir travaillé : ' + v.minutesPretees);
  // C'est bien la cuisine, l'atelier en peine, qui a le plus reçu.
  const plusServi = Object.entries(v.pretsPar).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(plusServi, 'cuisine');
  // Les minutes prêtées ne peuvent pas dépasser ce que huit personnes peuvent faire.
  assert.ok(v.minutesPretees <= 8 * (CFG_DEFAUT.jour.fin - CFG_DEFAUT.jour.debut) + 1e-6);
  // L'occupation propre de la cuisine baisse : le travail est fait par le vivier.
  assert.ok(avec.bilan.ateliers.cuisine.occupationJour < sans.bilan.ateliers.cuisine.occupationJour);
});

test('les gens de l’atelier passent avant un prêt', () => {
  const dote = journee(cfg(c => { c.viviers = vivier(5, ['dotation']); }));
  const sousDote = journee(cfg(c => { c.staff.dotation = 1; c.viviers = vivier(5, ['dotation']); }));
  // Mieux doté, l'atelier se débrouille seul plus souvent : il emprunte moins.
  assert.ok(dote.bilan.viviers[0].minutesPretees < sousDote.bilan.viviers[0].minutesPretees,
    dote.bilan.viviers[0].minutesPretees + ' devrait être inférieur à ' + sousDote.bilan.viviers[0].minutesPretees);
  // Un atelier sans personne à lui fait tout faire par le vivier.
  const zero = journee(cfg(c => { c.staff.cuisine = 0; c.viviers = vivier(6, ['cuisine']); }));
  assert.equal(zero.kpis.prets, 12);
  assert.ok(zero.bilan.viviers[0].pretsPar.cuisine > 1000);
  // Pas de taux d'occupation pour un atelier sans personne à lui : la question
  // n'a pas de sens, et `null` le dit mieux que zéro.
  assert.equal(zero.bilan.ateliers.cuisine.occupationJour, null);
  assert.equal(zero.bilan.ateliers.cuisine.personnes, 0);
  assert.ok(zero.bilan.viviers[0].occupationJour > 0, 'c’est le vivier qui porte l’occupation');
});

test('un vivier ne sert que les ateliers qu’il couvre, et jamais la plonge', () => {
  // La plonge compte des tunnels, pas des personnes : la couvrir n’aurait pas de sens.
  const surPlonge = journee(cfg(c => { c.viviers = vivier(5, ['plonge']); }));
  assert.deepEqual(surPlonge.bilan.viviers, [], 'un vivier réduit à la plonge est écarté');
  const mixte = journee(cfg(c => { c.staff.cuisine = 2; c.viviers = vivier(5, ['plonge', 'cuisine', 'inconnu']); }));
  assert.deepEqual(mixte.bilan.viviers[0].ateliers, ['cuisine'], 'plonge et atelier inconnu sont retirés');

  // Un vivier qui ne couvre pas la cuisine ne la sauve pas.
  const ailleurs = journee(cfg(c => { c.staff.cuisine = 2; c.viviers = vivier(8, ['armement']); }));
  const cible = journee(cfg(c => { c.staff.cuisine = 2; c.viviers = vivier(8, ['cuisine']); }));
  assert.ok(ailleurs.kpis.ontime < cible.kpis.ontime);
  assert.equal(ailleurs.bilan.viviers[0].pretsPar.cuisine, undefined);
});

test('un atelier sans personne mais couvert par un vivier n’est pas « aucune personne »', () => {
  const c = cfg(x => { x.staff.cuisine = 0; x.viviers = vivier(1, ['cuisine']); });
  const m = construireModele(JEU_DEMO, c);
  let cause = null;
  for (let t = c.jour.debut + 1; t <= c.jour.fin && !cause; t += 1) {
    m.avancerA(t);
    const g = m.goulot();
    if (g && g.id === 'cuisine') cause = g.cause;
  }
  assert.equal(cause, 'personnes occupées', 'quelqu’un peut venir, il est occupé');

  // Sans vivier, le même atelier vide dit bien qu’il n’y a personne.
  const seul = construireModele(JEU_DEMO, cfg(x => { x.staff.cuisine = 0; }));
  let cause2 = null;
  for (let t = CFG_DEFAUT.jour.debut + 1; t <= CFG_DEFAUT.jour.fin && !cause2; t += 1) {
    seul.avancerA(t);
    const g = seul.goulot();
    if (g && g.id === 'cuisine') cause2 = g.cause;
  }
  assert.equal(cause2, 'aucune personne');
});

test('les personnes prêtées sont visibles en direct sur l’atelier', () => {
  const c = cfg(x => { x.staff.cuisine = 0; x.viviers = vivier(4, ['cuisine']); });
  const m = construireModele(JEU_DEMO, c);
  let vu = 0;
  for (let t = c.jour.debut + 1; t <= c.jour.fin; t += 5) { m.avancerA(t); vu = Math.max(vu, m.stations.cuisine.pretes); }
  assert.ok(vu > 0 && vu <= 4, 'la cuisine doit afficher des personnes prêtées : ' + vu);
  m.avancerA(c.jour.fin);
  assert.equal(m.stations.cuisine.pretes, 0, 'tout le monde est rendu à la fin');
  assert.equal(m.viviers[0].ressource.occupees, 0);
});

test('le vivier respecte les heures d’ouverture avec le calendrier', () => {
  const c = calendrier(x => { x.staff.cuisine = 0; x.viviers = vivier(6, ['cuisine']); });
  const m = construireModele(JEU_DEMO, c);
  m.avancerA(1440 + 2 * 60);                       // 02:00
  assert.equal(m.viviers[0].ressource.capacite, 0, 'le vivier ferme la nuit');
  m.avancerA(1440 + c.jour.debut + 30);
  assert.equal(m.viviers[0].ressource.capacite, 6);
});
