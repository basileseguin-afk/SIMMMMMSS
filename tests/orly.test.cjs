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
  assert.equal(st.ressource, null);
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
