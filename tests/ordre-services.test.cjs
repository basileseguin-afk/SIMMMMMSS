/* Correction 17 (b) — l'ordre des services, tiré de tous les chemins à la fois
 * (moteur/ordre-services.js) : un service vient après tous ceux qui
 * l'alimentent, dans n'importe quel chemin ; à égalité, l'ordre du premier
 * chemin où il apparaît ; les services hors chemin (permanents, appui) à la
 * fin ; une boucle ne bloque pas. Le même ordre sert au tableau de la Synthèse,
 * aux groupes du planning des équipes et aux colonnes de la page Période.
 * Chemins, services et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../moteur/ordre-services.js');
const PV = require('../planning-vue.js');
const SV = require('../synthese-vue.js');
const PEV = require('../periode-vue.js');

const chemin = (id, noeuds, liens) => ({ id, nom: id, noeuds, liens: liens.map(([de, vers]) => ({ de, vers })) });
// Trois chemins fictifs qui se croisent :
//   chaud      : cuisine → montage → quais
//   froid      : légumerie → cuisine → montage, et la dotation → montage
//   équipement : plonge → dotation → armement → quais
const CHAUD = chemin('chaud', ['cuisine', 'montage', 'quais'], [['cuisine', 'montage'], ['montage', 'quais']]);
const FROID = chemin('froid', ['legumerie', 'cuisine', 'dotation', 'montage'], [['legumerie', 'cuisine'], ['cuisine', 'montage'], ['dotation', 'montage']]);
const EQUIPEMENT = chemin('equipement', ['plonge', 'dotation', 'armement', 'quais'], [['plonge', 'dotation'], ['dotation', 'armement'], ['armement', 'quais']]);
const CHEMINS = [CHAUD, FROID, EQUIPEMENT];
const ATTENDU = ['legumerie', 'cuisine', 'plonge', 'dotation', 'montage', 'armement', 'quais'];

test('trois chemins qui se croisent : un service vient après tous ceux qui l’alimentent, dans n’importe quel chemin', () => {
  const ordre = O.ordreDesServices(CHEMINS);
  assert.deepEqual(ordre, ATTENDU);
  // La règle, vérifiée lien par lien : la source avant la cible.
  for (const c of CHEMINS) for (const l of c.liens) assert.ok(ordre.indexOf(l.de) < ordre.indexOf(l.vers), l.de + ' avant ' + l.vers);
  // La cuisine, amont du montage et des quais, ne s'affiche jamais après eux — même si les équipes sont listées à l'envers.
  const aLEnvers = O.ordreDesServices(CHEMINS, ['quais', 'montage', 'cuisine']);
  assert.deepEqual(aLEnvers, ['cuisine', 'montage', 'quais']);
});

test('à égalité, l’ordre du premier chemin où le service apparaît', () => {
  // Un seul chemin sans lien entre b et c : l'ordre de ses cases.
  assert.deepEqual(O.ordreDesServices([chemin('c', ['a', 'b', 'c'], [['a', 'b']])]), ['a', 'b', 'c']);
  // Un second chemin amène un amont à « a » : il passe juste avant lui ; « c » garde sa place du premier chemin.
  assert.deepEqual(O.ordreDesServices([chemin('c1', ['a', 'b', 'c'], [['a', 'b']]), chemin('c2', ['z', 'a'], [['z', 'a']])]), ['z', 'a', 'b', 'c']);
  // Un service qui n'apparaît que dans le second chemin, sans lien : après ceux du premier.
  assert.deepEqual(O.ordreDesServices([chemin('c1', ['a', 'b'], [['a', 'b']]), chemin('c2', ['x', 'b'], [])]), ['a', 'b', 'x']);
});

test('les services hors chemin (permanents, appui) sont en fin de liste, dans l’ordre des équipes', () => {
  const services = ['encadrement', 'quais', 'cuisine', 'appui', 'montage'];
  assert.deepEqual(O.ordreDesServices(CHEMINS, services), ['cuisine', 'montage', 'quais', 'encadrement', 'appui']);
  // Sans la liste des services : toutes les cases des chemins. Sans chemin : l'ordre donné.
  assert.deepEqual(O.ordreDesServices([], services), services);
  assert.deepEqual(O.ordreDesServices(null, ['b', 'a']), ['b', 'a']);
  assert.deepEqual(O.ordreDesServices(undefined, undefined), []);
});

test('une case de chemin sans équipe garde son rôle : ce qu’elle relie reste dans l’ordre', () => {
  // a → fantôme → b : sans équipe au fantôme, b vient toujours après a.
  const c = [chemin('c', ['b', 'fantome', 'a'], [['a', 'fantome'], ['fantome', 'b']])];
  assert.deepEqual(O.ordreDesServices(c, ['b', 'a']), ['a', 'b']);
});

test('une boucle dans les chemins ne bloque pas : le service garde l’ordre du premier chemin', () => {
  assert.deepEqual(O.ordreDesServices([chemin('c', ['x', 'y'], [['x', 'y'], ['y', 'x']])]), ['x', 'y']);
  // Une boucle au milieu d'un chemin : ce qui est hors de la boucle reste ordonné.
  const c = [chemin('c', ['a', 'x', 'y', 'b'], [['a', 'x'], ['x', 'y'], ['y', 'x'], ['y', 'b']])];
  assert.deepEqual(O.ordreDesServices(c), ['a', 'x', 'y', 'b']);
  // Une boucle entre deux chemins, et un lien d'une case vers elle-même.
  const deux = [chemin('c1', ['p', 'q'], [['p', 'q'], ['q', 'q']]), chemin('c2', ['q', 'p'], [['q', 'p']])];
  assert.deepEqual(O.ordreDesServices(deux), ['p', 'q']);
  // Une contrainte qui traverse la boucle tient : a alimente la boucle x ⇄ y, qui alimente b — même si le chemin liste b d'abord.
  // La boucle forme un bloc, ses services dans l'ordre du premier chemin (y, puis x).
  const traverse = [chemin('c', ['b', 'y', 'x', 'a'], [['a', 'x'], ['x', 'y'], ['y', 'x'], ['y', 'b']])];
  assert.deepEqual(O.ordreDesServices(traverse), ['a', 'y', 'x', 'b']);
  // La même, sur trois chemins.
  const trois = [chemin('c1', ['b', 'y'], [['y', 'b']]), chemin('c2', ['x', 'a'], [['a', 'x']]), chemin('c3', ['x', 'y'], [['x', 'y'], ['y', 'x']])];
  const o3 = O.ordreDesServices(trois);
  assert.ok(o3.indexOf('a') < o3.indexOf('x') && o3.indexOf('a') < o3.indexOf('y') && o3.indexOf('y') < o3.indexOf('b') && o3.indexOf('x') < o3.indexOf('b'), o3.join(', '));
  // Des chemins mal formés ne plantent pas : un lien vers une case inconnue, un chemin sans liens ni cases.
  assert.deepEqual(O.ordreDesServices([{ id: 'c', noeuds: ['a'], liens: [{ de: 'a', vers: 'nulle-part' }, null] }, { id: 'vide' }, null]), ['a', 'nulle-part']);
});

test('les chemins se lisent comme le moteur les lit : l’ancienne écriture en branches aussi', () => {
  const ancien = [{ id: 'c', branches: [['cuisine', 'montage', 'quais'], ['dotation', 'montage']] }];
  assert.deepEqual(O.ordreDesServices(ancien), ['cuisine', 'dotation', 'montage', 'quais']);
  assert.equal(O.avecCases(ancien), true);
  // Des chemins sans aucune case n'ordonnent rien : le planning garde alors l'ordre de la journée.
  assert.equal(O.avecCases([{ id: 'vide' }, null]), false);
  assert.equal(O.avecCases([]), false);
  assert.equal(O.avecCases(null), false);
  const r = { ateliers: [{ id: 'a', service: 'x', lots: [{}] }, { id: 'b', service: 'y', lots: [{}] }], lots: [], parClasse: { c: { services: ['y', 'x'] } } };
  assert.deepEqual(PV.ordreDesServices(r, [{ id: 'vide' }]), ['y', 'x']);
});

test('le même ordre pour la Synthèse, le planning des équipes et la page Période', () => {
  // Une journée fictive réduite à ce que les trois vues lisent : des équipes listées à l'envers du chemin, un service hors chemin.
  const equipes = ['encadrement', 'quais', 'montage', 'dotation', 'plonge', 'cuisine', 'legumerie']
    .map(s => ({ id: 'e-' + s, nom: s, service: s, type: 'manuel', lots: [{}], pausesPrises: [] }));
  const r = { ateliers: equipes, lots: [], parClasse: {} };
  const attendu = ['legumerie', 'cuisine', 'plonge', 'dotation', 'montage', 'quais', 'encadrement'];
  // Le planning des équipes : ses groupes.
  assert.deepEqual(PV.ordreDesServices(r, CHEMINS), attendu);
  assert.deepEqual(PV.groupes(r, null, null, CHEMINS).map(g => g.service), attendu);
  // La Synthèse : ses lignes.
  const ligne = s => ({ service: s, nom: s, jour: 0, presents: 1, besoin: 1, ecart: 0 });
  const rep = { personnes: { services: equipes.map(e => ligne(e.service)) }, coince: { services: [] }, fins: { services: [] } };
  assert.deepEqual(SV.lignes(rep, PV.ordreDesServices(r, CHEMINS)).map(l => l.service), attendu);
  // La page Période : ses colonnes de services.
  const bilan = { services: equipes.map(e => ({ id: e.service, nom: e.service })).sort((a, b) => a.nom.localeCompare(b.nom)),
    joursTravail: [{ services: Object.fromEntries(equipes.map(e => [e.service, {}])) }] };
  assert.deepEqual(PEV.servicesOrdonnes(bilan, ids => O.ordreDesServices(CHEMINS, ids)).map(s => s.id), attendu);
  // Sans ordre donné (une unité sans chemin) : l'ordre du bilan, comme avant.
  assert.deepEqual(PEV.servicesOrdonnes(bilan).map(s => s.id), bilan.services.map(s => s.id));
});

test('sans chemin, le planning garde son ordre d’avant, tiré de la journée', () => {
  const r = { ateliers: [{ id: 'a', service: 'x', lots: [{}] }, { id: 'b', service: 'y', lots: [{}] }], lots: [], parClasse: { c: { services: ['y', 'x'] } } };
  assert.deepEqual(PV.ordreDesServices(r), ['y', 'x']);
  assert.deepEqual(PV.ordreDesServices(r, []), ['y', 'x']);
  assert.deepEqual(PV.ordreDesServices(r, [chemin('c', ['x', 'y'], [['x', 'y']])]), ['x', 'y'], 'avec un chemin : celui des chemins');
});
