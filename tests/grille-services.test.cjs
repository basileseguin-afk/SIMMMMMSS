/* Mon unité › Services : on coche ce qu'une équipe prépare, le chemin de la
 * commande suit tout seul (retour d'usage du 29/09 : « que quelqu'un qui
 * connaît uniquement l'unité puisse paramétrer entièrement la simulation »). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const PC = require('../parcours.js');

const classes = [
  { id: 'AF/BC', cie: 'AF', cabine: 'BC', echeance: 600, vols: [{}] },
  { id: 'TX/BC', cie: 'TX', cabine: 'BC', echeance: 300, vols: [{}] },
  { id: 'TX/YC', cie: 'TX', cabine: 'YC', echeance: 900, vols: [{}] }
];
const equipe = (id, service, lots = []) => ({ id, nom: id, service, type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots });
const vide = ateliers => ({ ateliers, parcours: [], parcoursCabine: {}, parcoursClasse: {} });
const arcs = p => P.arcsDuParcours(p).map(a => a.from + '>' + a.to).sort();

test('cocher : la commande rejoint l’équipe et le service entre dans son chemin', () => {
  const e = vide([equipe('m1', 'prepa')]);
  PC.cocher(e, 'm1', 'TX/BC', true, { classes });
  assert.deepEqual(e.ateliers[0].lots, [['TX/BC']]);
  const p = PC.cheminDe(e, 'TX/BC');
  assert.ok(p, 'un chemin propre est créé');
  assert.deepEqual(P.servicesDuParcours(p), ['prepa']);
});

test('le service se place entre ceux qui le livrent et ceux qu’il livre', () => {
  const e = vide([equipe('c', 'cuisine'), equipe('m', 'prepa'), equipe('p', 'preparation')]);
  PC.cocher(e, 'c', 'AF/BC', true, { classes });
  PC.cocher(e, 'm', 'AF/BC', true, { classes });
  assert.deepEqual(arcs(PC.cheminDe(e, 'AF/BC')), ['cuisine>prepa']);
  // La prépa s'intercale : cuisine → prépa → montage, sans raccourci.
  PC.cocher(e, 'p', 'AF/BC', true, { classes });
  assert.deepEqual(arcs(PC.cheminDe(e, 'AF/BC')), ['cuisine>preparation', 'preparation>prepa']);
  // Décocher : ceux qui la livraient livrent ceux qu'elle livrait.
  PC.cocher(e, 'p', 'AF/BC', false, { classes });
  assert.deepEqual(arcs(PC.cheminDe(e, 'AF/BC')), ['cuisine>prepa']);
});

test('une commande, une équipe par service : cocher ailleurs la déplace', () => {
  const e = vide([equipe('matin', 'prepa'), equipe('soir', 'prepa')]);
  PC.cocher(e, 'matin', 'TX/BC', true, { classes });
  PC.cocher(e, 'soir', 'TX/BC', true, { classes });
  assert.deepEqual(e.ateliers[0].lots, []);
  assert.deepEqual(e.ateliers[1].lots, [['TX/BC']]);
  // Le service reste dans le chemin : une équipe l'y prépare encore.
  PC.cocher(e, 'matin', 'TX/BC', false, { classes });
  assert.ok(P.servicesDuParcours(PC.cheminDe(e, 'TX/BC')).includes('prepa'));
  const g = PC.grille(e, 'prepa', 'matin', classes);
  assert.equal(g.get('TX/BC').etat, 'ailleurs');
  assert.equal(g.get('TX/BC').par.id, 'soir');
  assert.equal(g.get('AF/BC').etat, 'hors');
});

test('l’ordre suit les départs : la plus pressée d’abord', () => {
  const e = vide([equipe('m', 'prepa')]);
  PC.cocher(e, 'm', ['TX/YC', 'AF/BC', 'TX/BC'], true, { classes });
  assert.deepEqual(e.ateliers[0].lots, [['TX/BC'], ['AF/BC'], ['TX/YC']]);
});

test('une commande qui suivait un modèle garde les autres étapes du modèle', () => {
  const e = { ...vide([equipe('m', 'prepa')]), ...PC.parcoursTypes() };
  PC.cocher(e, 'm', 'AF/BC', true, { classes });
  const p = PC.cheminDe(e, 'AF/BC');
  assert.ok(p.cases, 'aucune case n’est créée d’office');
  assert.equal(e.ateliers.length, 1);
  assert.deepEqual(P.servicesDuParcours(p).sort(), P.servicesDuParcours(e.parcours.find(x => x.id === 'complet')).sort());
  // Les étapes du modèle sans équipe sont « attendues » dans leur service.
  assert.equal(PC.grille(e, 'cuisine', null, classes).get('AF/BC').etat, 'passe');
  assert.equal(PC.grille(e, 'cuisine', 'x', classes).get('AF/BC').etat, 'attendue');
});

test('les liens de l’unité placent un service que rien d’autre ne connaît, sans boucle', () => {
  const e = vide([equipe('m', 'prepa'), { id: 'h', nom: 'H', service: 'handling', type: 'handling', lots: [], pauses: [] }]);
  PC.cocher(e, 'm', 'TX/BC', true, { classes });
  const liaisons = [{ from: 'prepa', to: 'handling' }, { from: 'handling', to: 'quais' }, { from: 'quais', to: 'plonge' }, { from: 'plonge', to: 'prepa' }];
  PC.passerPar(e, 'handling', ['TX/BC'], true, { classes, liaisons });
  assert.deepEqual(arcs(PC.cheminDe(e, 'TX/BC')), ['prepa>handling']);
  // La plonge : amont du montage d'après les modèles types ; les retours
  // (handling → quais → plonge) ne referment pas la boucle.
  PC.passerPar(e, 'plonge', ['TX/BC'], true, { classes, liaisons });
  assert.deepEqual(arcs(PC.cheminDe(e, 'TX/BC')), ['plonge>prepa', 'prepa>handling']);
  assert.equal(PC.grille(e, 'plonge', null, classes).get('TX/BC').etat, 'passe');
  PC.passerPar(e, 'plonge', ['TX/BC'], false, { classes });
  assert.deepEqual(arcs(PC.cheminDe(e, 'TX/BC')), ['prepa>handling']);
});

test('une salle annexe se place comme son service de rattachement', () => {
  const e = vide([equipe('c', 'cuisine'), equipe('apm', 'at-apm'), { id: 'h', nom: 'H', service: 'handling', type: 'handling', lots: [], pauses: [] }]);
  PC.cocher(e, 'c', 'TX/BC', true, { classes });
  PC.passerPar(e, 'handling', ['TX/BC'], true, { classes, liaisons: [{ from: 'cuisine', to: 'prepa' }, { from: 'prepa', to: 'handling' }] });
  PC.cocher(e, 'apm', 'TX/BC', true, { classes, parent: id => (id === 'at-apm' ? 'prepa' : null), liaisons: [{ from: 'cuisine', to: 'prepa' }, { from: 'prepa', to: 'handling' }] });
  assert.deepEqual(arcs(PC.cheminDe(e, 'TX/BC')), ['at-apm>handling', 'cuisine>at-apm']);
});

test('le moteur lit ce que la grille a construit', () => {
  const e = vide([equipe('c', 'cuisine'), equipe('m', 'prepa')]);
  const vols = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 600, bc: 10, pc: 0, yc: 0 }];
  const cls = P.classesDeVols(vols, { delaiChargement: 45 });
  PC.cocher(e, 'c', 'TX/BC', true, { classes: cls });
  PC.cocher(e, 'm', 'TX/BC', true, { classes: cls });
  const r = P.simuler({ vols, classes: cls, ateliers: e.ateliers, liaisons: [], parcours: e.parcours, parcoursClasse: e.parcoursClasse,
    bareme: { cuisine: { '*/BC': 30 }, prepa: { '*/BC': 30 } } });
  assert.ok(r.ok, JSON.stringify(r.anomalies));
  const lc = r.lots.find(l => l.service === 'cuisine'), lm = r.lots.find(l => l.service === 'prepa');
  assert.ok(lm.debut >= lc.fin, 'le montage attend la cuisine');
});

test('nature d’un service et équipe neuve', () => {
  const e = vide([]);
  assert.equal(PC.natureService(e, 'plonge', 'Plonge'), 'lavage');
  assert.equal(PC.natureService(e, 'handling', 'CF départ'), 'handling');
  assert.equal(PC.natureService(e, 'decontam', 'Légumerie'), 'dispo');
  assert.equal(PC.natureService(e, 'x', 'Robot APM'), 'robot');
  assert.equal(PC.natureService(e, 'cuisine', 'Cuisine'), 'manuel');
  const a = PC.equipeNeuve(e, 'cuisine', 'Cuisine', 'manuel'); e.ateliers.push(a);
  const b = PC.equipeNeuve(e, 'cuisine', 'Cuisine', 'manuel');
  assert.equal(a.nom, 'Cuisine'); assert.equal(b.nom, 'Cuisine 2');
  assert.equal(PC.equipeNeuve(e, 'plonge', 'Plonge', 'lavage').type, 'lavage');
});
