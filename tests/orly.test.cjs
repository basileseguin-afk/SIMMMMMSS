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
  assert.ok(r.kpis.ontime > 0 && r.kpis.ontime < 100, 'la démo doit montrer des retards ET des vols à l’heure : ' + r.kpis.ontime);
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

test('le robot est le goulot du matin : sa cadence change la ponctualité, dans le bon sens', () => {
  const lent = journee(cfg(c => { c.robotCadence = 200; }));
  const ref = journee(cfg());
  const rapide = journee(cfg(c => { c.robotCadence = 560; }));
  assert.ok(lent.kpis.ontime < ref.kpis.ontime, 'ralentir le robot doit dégrader : ' + lent.kpis.ontime + ' vs ' + ref.kpis.ontime);
  assert.ok(rapide.kpis.ontime > ref.kpis.ontime, 'accélérer le robot doit améliorer : ' + rapide.kpis.ontime + ' vs ' + ref.kpis.ontime);
  assert.ok(ref.bilan.robot.attenteP90 > 30, 'des vols attendent le robot : p90 = ' + ref.bilan.robot.attenteP90);
  // L'occupation des ateliers est basse : ce sont les personnes qui attendent le robot, pas l'inverse.
  assert.ok(ref.bilan.ateliers.prepa.occupationJour < 0.3);
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
  const c = chargeVol({ bc: 10, pc: 0, yc: 100 });
  assert.equal(c.food.robot, 100);
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
  for (let t = c.jour.debut + 0.5; t <= c.jour.debut + 150; t += 0.5) m.avancerA(t);   // 07:30
  const g = m.goulot();
  assert.ok(g, 'à 07:30 le robot a une file');
  assert.equal(g.id, 'prepa');
  assert.match(g.cause, /robot occupé/);
  assert.ok(m.stations.prepa.robotUtil > 0.9);
  assert.ok(m.stations.prepa.robotAttente >= 1);
});
