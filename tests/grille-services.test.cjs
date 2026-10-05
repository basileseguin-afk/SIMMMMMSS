/* Chemins et Équipes : les flux de production (un par type, partagé) et la grille des
 * équipes. « Les éco sont pratiquement tous identiques, pareil pour les
 * business ; ce qui change, ce sont les ateliers — mais ce n'est pas une
 * science exacte » (retour d'usage du 30/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const PC = require('../parcours.js');

const classes = [
  { id: 'AF/BC', cie: 'AF', cabine: 'BC', echeance: 600, vols: [{}] },
  { id: 'TX/BC', cie: 'TX', cabine: 'BC', echeance: 300, vols: [{}] },
  { id: 'AF/YC', cie: 'AF', cabine: 'YC', echeance: 700, vols: [{}] },
  { id: 'TX/YC', cie: 'TX', cabine: 'YC', echeance: 900, vols: [{}] },
  { id: 'DL/YC', cie: 'DL', cabine: 'YC', echeance: 950, vols: [{}] }
];
const equipe = (id, service, lots = []) => ({ id, nom: id, service, type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots });
const vide = ateliers => ({ ateliers, parcours: [], parcoursCabine: {}, parcoursClasse: {} });
const arcs = p => P.arcsDuParcours(p).map(a => a.from + '>' + a.to).sort();
const flux = (e, c) => PC.fluxDe(e, c);
const nomDe = s => ({ prepa: 'Montage', preparation: 'Prépa', robot: 'Robot', cuisine: 'Cuisine' })[s] || s;
const o = { classes, nomDe };

test('une commande sans flux : le flux de sa classe naît, avec ce service', () => {
  const e = vide([equipe('m1', 'prepa')]);
  const r = PC.cocher(e, 'm1', 'TX/BC', true, o);
  assert.deepEqual(e.ateliers[0].lots, [['TX/BC']]);
  const t = flux(e, 'TX/BC');
  assert.ok(t && t.type, 'un flux partagé');
  assert.equal(t.nom, 'Business');
  assert.equal(e.parcoursCabine.BC, t.id, 'le flux de la classe');
  assert.equal(flux(e, 'AF/BC'), t, 'toutes les business le suivent');
  assert.deepEqual(r.horsFlux, []);
});

test('cocher ne touche pas au flux : ce qui manque est renvoyé, pour qu’on choisisse', () => {
  const e = vide([equipe('c', 'cuisine'), equipe('m', 'prepa'), equipe('p', 'preparation')]);
  PC.cocher(e, 'c', 'AF/BC', true, o);
  const r = PC.cocher(e, 'm', 'AF/BC', true, o);
  assert.deepEqual(r.horsFlux, ['AF/BC'], 'le flux Business ne passe pas par le Montage');
  const t = flux(e, 'AF/BC');
  assert.deepEqual(P.servicesDuParcours(t), ['cuisine']);
  // « Pour tout le flux » : le service y entre, à sa place.
  PC.changerFlux(e, t.id, 'prepa', true, o);
  assert.deepEqual(arcs(t), ['cuisine>prepa']);
  PC.changerFlux(e, t.id, 'preparation', true, o);
  assert.deepEqual(arcs(t), ['cuisine>preparation', 'preparation>prepa'], 'la prépa s’intercale');
  PC.changerFlux(e, t.id, 'preparation', false, o);
  assert.deepEqual(arcs(t), ['cuisine>prepa'], 'retirée, ceux qui la livraient livrent ceux qu’elle livrait');
  assert.equal(flux(e, 'TX/BC'), t, 'toutes les business ont le même flux');
});

test('décocher la dernière équipe : la commande est signalée, le flux reste', () => {
  const e = { ...vide([equipe('m', 'prepa', [['AF/BC']])]), ...PC.parcoursTypes() };
  const r = PC.cocher(e, 'm', 'AF/BC', false, o);
  assert.deepEqual(r.orphelines, ['AF/BC']);
  assert.ok(P.servicesDuParcours(flux(e, 'AF/BC')).includes('prepa'));
  assert.equal(PC.grille(e, 'prepa', 'm', classes).get('AF/BC').etat, 'attendue');
});

test('une commande, une équipe par service : cocher ailleurs la déplace', () => {
  const e = { ...vide([equipe('matin', 'prepa'), equipe('soir', 'prepa')]), ...PC.parcoursTypes() };
  PC.cocher(e, 'matin', 'TX/BC', true, o);
  PC.cocher(e, 'soir', 'TX/BC', true, o);
  assert.deepEqual(e.ateliers[0].lots, []);
  assert.deepEqual(e.ateliers[1].lots, [['TX/BC']]);
  const g = PC.grille(e, 'prepa', 'matin', classes);
  assert.equal(g.get('TX/BC').etat, 'ailleurs');
  assert.equal(g.get('TX/BC').par.id, 'soir');
});

test('l’ordre suit les départs : la plus pressée d’abord', () => {
  const e = { ...vide([equipe('m', 'prepa')]), ...PC.parcoursTypes() };
  PC.cocher(e, 'm', ['AF/YC', 'AF/BC', 'TX/BC'], true, o);
  assert.deepEqual(e.ateliers[0].lots, [['TX/BC'], ['AF/BC'], ['AF/YC']]);
});

test('seulement pour ces commandes : une variante, partagée par celles qui s’écartent pareil', () => {
  const e = { ...vide([equipe('r', 'robot')]), ...PC.parcoursTypes() };
  const eco = flux(e, 'TX/YC');
  PC.cocher(e, 'r', ['TX/YC', 'DL/YC'], true, o);
  PC.adapter(e, ['TX/YC'], 'robot', true, o);
  const v = flux(e, 'TX/YC');
  assert.notEqual(v, eco);
  assert.ok(v.type && v.auto);
  assert.equal(v.nom, 'Sans cuisine + Robot');
  PC.adapter(e, ['DL/YC'], 'robot', true, o);
  assert.equal(flux(e, 'DL/YC'), v, 'la même variante, pas une deuxième');
  assert.equal(flux(e, 'AF/YC'), eco, 'les autres gardent le flux de leur classe');
  assert.ok(P.servicesDuParcours(eco).every(s => s !== 'robot'), 'le flux de la classe n’a pas bougé');
  // TX laisse aussi le Montage : une autre variante ; DL garde la première.
  PC.adapter(e, ['TX/YC'], 'prepa', false, o);
  assert.equal(flux(e, 'TX/YC').nom, 'Sans cuisine + Robot sans Montage');
  assert.equal(flux(e, 'DL/YC'), v);
  // DL la rejoint : la variante que plus personne ne suit s'en va.
  PC.adapter(e, ['DL/YC'], 'prepa', false, o);
  assert.equal(flux(e, 'DL/YC'), flux(e, 'TX/YC'));
  assert.ok(!e.parcours.includes(v), 'variante vide retirée');
  // Revenir au flux de la classe : elle le retrouve, pas une copie.
  PC.adapter(e, ['TX/YC'], 'robot', false, o);
  PC.adapter(e, ['TX/YC'], 'prepa', true, o);
  assert.equal(flux(e, 'TX/YC'), eco);
  assert.equal(e.parcoursClasse['TX/YC'], undefined, 'plus d’exception à retenir');
});

test('les liens de l’unité placent un service que rien d’autre ne connaît, sans boucle', () => {
  const e = { ...vide([equipe('m', 'prepa')]) };
  PC.cocher(e, 'm', 'TX/BC', true, o);
  const t = flux(e, 'TX/BC');
  const liaisons = [{ from: 'prepa', to: 'handling' }, { from: 'handling', to: 'quais' }, { from: 'quais', to: 'plonge' }, { from: 'plonge', to: 'prepa' }];
  PC.changerFlux(e, t.id, 'handling', true, { ...o, liaisons });
  assert.deepEqual(arcs(t), ['prepa>handling']);
  PC.changerFlux(e, t.id, 'plonge', true, { ...o, liaisons });
  assert.deepEqual(arcs(t), ['plonge>prepa', 'prepa>handling'], 'les retours des vols ne referment pas la boucle');
});

test('une salle annexe se place comme son service de rattachement', () => {
  const e = vide([equipe('c', 'cuisine')]);
  PC.cocher(e, 'c', 'TX/BC', true, o);
  const t = flux(e, 'TX/BC'), liaisons = [{ from: 'cuisine', to: 'prepa' }, { from: 'prepa', to: 'handling' }];
  PC.changerFlux(e, t.id, 'handling', true, { ...o, liaisons });
  PC.changerFlux(e, t.id, 'at-apm', true, { ...o, liaisons, parent: id => (id === 'at-apm' ? 'prepa' : null) });
  assert.deepEqual(arcs(t), ['at-apm>handling', 'cuisine>at-apm']);
});

test('regrouper les chemins propres identiques en flux de production', () => {
  const e = vide([]);
  const ch = (id, noeuds, liens) => ({ id, nom: 'Chemin ' + id, noeuds, liens: liens.map(([de, vers]) => ({ de, vers })) });
  e.parcours.push(ch('a', ['cuisine', 'prepa'], [['cuisine', 'prepa']]), ch('b', ['cuisine', 'prepa'], [['cuisine', 'prepa']]),
    ch('c', ['robot'], []), ch('d', ['cuisine', 'prepa'], [['cuisine', 'prepa']]));
  Object.assign(e.parcoursClasse, { 'AF/YC': 'a', 'TX/YC': 'b', 'DL/YC': 'c', 'AF/BC': 'd' });
  const avant = Object.fromEntries(classes.filter(c => c.id !== 'TX/BC').map(c => [c.id, signatureRoute(e, c)]));
  const r = PC.regrouper(e, classes, nomDe);
  assert.equal(r.commandes, 4);
  assert.equal(r.types, 2, 'deux flux différents');
  assert.equal(PC.cheminDe(e, 'AF/YC'), null, 'plus de chemin propre');
  const eco = flux(e, 'AF/YC');
  assert.equal(e.parcoursCabine.YC, eco.id, 'le flux le plus suivi devient celui de la classe');
  assert.equal(flux(e, 'TX/YC'), eco);
  assert.equal(flux(e, 'AF/BC'), eco, 'identique à l’éco : le même flux');
  assert.match(eco.nom, /Économie/);
  assert.match(flux(e, 'DL/YC').nom, /\+ Robot sans Cuisine, Montage/);
  for (const [id, sig] of Object.entries(avant)) assert.equal(signatureRoute(e, classes.find(c => c.id === id)), sig, id + ' : le calcul voit le même chemin');
});
function signatureRoute(e, c) { const r = P.routesDesClasses([c], e).get(c.id); return r ? PC.signature(r.parcours) : null; }

test('un chemin désigné par plusieurs commandes, ou par une classe, est un flux partagé', () => {
  const v = PC.validerParcours({ parcours: [{ id: 'x', nom: 'X', noeuds: ['prepa'], liens: [] }, { id: 'y', nom: 'Y', noeuds: ['prepa'], liens: [] }],
    parcoursCabine: {}, parcoursClasse: { 'AF/YC': 'x', 'TX/YC': 'x', 'DL/YC': 'y' } });
  assert.equal(v.parcours.find(p => p.id === 'x').type, true);
  assert.equal(v.parcours.find(p => p.id === 'y').type, undefined, 'le chemin d’une seule commande reste le sien');
  const e = { ...v, ateliers: [] };
  assert.equal(PC.cheminDe(e, 'AF/YC'), null);
  assert.equal(PC.cheminDe(e, 'DL/YC').id, 'y');
});

test('le moteur lit ce que les flux et la grille ont construit', () => {
  const e = vide([equipe('c', 'cuisine'), equipe('m', 'prepa')]);
  const vols = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 600, bc: 10, pc: 0, yc: 0 }];
  const cls = P.classesDeVols(vols, { delaiChargement: 45 });
  PC.cocher(e, 'c', 'TX/BC', true, { classes: cls });
  const r1 = PC.cocher(e, 'm', 'TX/BC', true, { classes: cls });
  PC.changerFlux(e, flux(e, 'TX/BC').id, 'prepa', true, { classes: cls });
  assert.deepEqual(r1.horsFlux, ['TX/BC']);
  const r = P.simuler({ vols, classes: cls, ateliers: e.ateliers, liaisons: [], parcours: e.parcours, parcoursClasse: e.parcoursClasse,
    parcoursCabine: e.parcoursCabine, bareme: { cuisine: { '*/BC': 30 }, prepa: { '*/BC': 30 } } });
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
