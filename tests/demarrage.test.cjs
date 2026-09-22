/* Le fil de mise en route : cinq étapes, trois états, et une phrase qui dit
 * quoi faire maintenant. C'est la seule chose de l'interface qui répond à
 * « par où je commence ? » — elle doit dire vrai. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../demarrage.js');

const neuf = () => ({
  vols: { total: 0, departs: 0, source: 'demo' },
  plan: { services: 11, approx: 0 },
  flux: { liaisons: 0, alertes: 0 },
  ateliers: { total: 0, fabriquent: 0, absentes: 0 },
  bareme: { calibre: false }
});
const par = (e) => Object.fromEntries(D.etapes(e).map(s => [s.cle, s]));

test('cinq étapes, dans l’ordre où on les fait', () => {
  const l = D.etapes(neuf());
  assert.deepEqual(l.map(s => s.cle), ['vols', 'plan', 'ateliers', 'flux', 'bareme']);
});

test('les ateliers viennent avant les flux : sans équipe, le graphe ne porte rien', () => {
  const e = neuf();
  e.flux.liaisons = 16;
  assert.equal(par(e).flux.etat, 'afaire', 'des liaisons sans équipe ne sont pas « fait »');
  assert.match(par(e).flux.detail, /sans équipe/);
  // Dès qu'une équipe fabrique, le graphe se juge.
  e.ateliers = { total: 1, fabriquent: 1, absentes: 0 };
  assert.equal(par(e).flux.etat, 'fait');
  e.flux.alertes = 3;
  assert.equal(par(e).flux.etat, 'verifier');
  assert.match(par(e).flux.detail, /3 à corriger/);
});

test('le jeu de démonstration est un état « à vérifier », pas « fait »', () => {
  const e = neuf(); e.vols = { total: 12, departs: 12, source: 'demo' };
  assert.equal(par(e).vols.etat, 'verifier');
  assert.match(par(e).vols.detail, /jeu de démonstration/);
  e.vols.source = 'importe';
  assert.equal(par(e).vols.etat, 'fait');
  assert.equal(par(e).vols.geste, null, 'rien à proposer quand c’est fait');
});

test('une classe que personne ne fabrique met les ateliers « à vérifier »', () => {
  const e = neuf();
  e.ateliers = { total: 2, fabriquent: 2, absentes: 5 };
  assert.equal(par(e).ateliers.etat, 'verifier');
  assert.match(par(e).ateliers.detail, /5 classes que personne ne fabrique/);
  e.ateliers.absentes = 0;
  assert.equal(par(e).ateliers.etat, 'fait');
});

test('le barème reste « à vérifier » tant qu’il n’est pas calibré', () => {
  assert.equal(par(neuf()).bareme.etat, 'verifier');
  const e = neuf(); e.bareme.calibre = true;
  assert.equal(par(e).bareme.etat, 'fait');
});

test('la prochaine étape est la première à faire, sinon la première à vérifier', () => {
  const e = neuf();
  e.vols = { total: 12, departs: 12, source: 'demo' };
  // Rien n'est décrit : c'est par les ateliers qu'on commence.
  assert.equal(D.suite(D.etapes(e)).etape.cle, 'ateliers');
  assert.match(D.suite(D.etapes(e)).texte, /première équipe/);
  // Une fois les équipes là et les flux lus, restent les vols et le barème.
  e.ateliers = { total: 1, fabriquent: 1, absentes: 0 };
  e.flux = { liaisons: 16, alertes: 0 };
  assert.equal(D.suite(D.etapes(e)).etape.cle, 'vols');
});

test('tout au vert : plus aucune étape restante', () => {
  const e = {
    vols: { total: 12, departs: 12, source: 'importe' },
    plan: { services: 11, approx: 0 },
    flux: { liaisons: 16, alertes: 0 },
    ateliers: { total: 3, fabriquent: 3, absentes: 0 },
    bareme: { calibre: true }
  };
  assert.deepEqual(D.etapes(e).map(s => s.etat), ['fait', 'fait', 'fait', 'fait', 'fait']);
  assert.equal(D.suite(D.etapes(e)).etape, null);
});

test('chaque état porte un signe, pas seulement une couleur', () => {
  // Un daltonien doit pouvoir lire le fil.
  assert.equal(Object.keys(D.ETATS).length, 3);
  for (const v of Object.values(D.ETATS)) assert.ok(v && v.length === 1);
  assert.equal(new Set(Object.values(D.ETATS)).size, 3, 'trois signes distincts');
});

test('un état vide ne fait pas tomber le fil', () => {
  const l = D.etapes({});
  assert.equal(l.length, 5);
  assert.ok(l.every(s => s.titre && s.detail !== undefined && s.onglet));
});
