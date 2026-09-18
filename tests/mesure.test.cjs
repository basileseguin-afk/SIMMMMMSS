/* Régressions des moniteurs (moteur/mesure.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Environnement } = require('../moteur/noyau.js');
const { Moniteur } = require('../moteur/mesure.js');

test('un moniteur de niveau pondère par le temps, pas par le nombre', () => {
  const env = new Environnement();
  const m = new Moniteur(env, { nom: 'file', niveau: true, valeurInitiale: 0 });
  env.processus(function* (e) {
    yield e.delai(1);  m.noter(10);   // file à 10 pendant 1 minute
    yield e.delai(1);  m.noter(0);    // puis à 0 pendant 98
    yield e.delai(98);
  });
  env.executer();
  // Moyenne arithmétique des trois valeurs notées : 3,33. Moyenne réelle : 10/100.
  assert.equal(m.moyenne(), 0.1);
  assert.equal(m.maximum, 10);
  assert.equal(m.derniere, 0);
});

test('un moniteur de comptage fait une moyenne arithmétique', () => {
  const env = new Environnement();
  const m = new Moniteur(env, { nom: 'attente' });
  [4, 8, 30].forEach(v => m.noter(v));
  assert.equal(m.moyenne(), 14);
  assert.equal(m.nombre, 3);
  assert.equal(m.minimum, 4);
  assert.equal(m.maximum, 30);
});

test('le percentile d’un niveau est pondéré par la durée', () => {
  const env = new Environnement();
  const m = new Moniteur(env, { niveau: true, valeurInitiale: 0 });
  env.processus(function* (e) {
    yield e.delai(90); m.noter(100);   // 0 pendant 90, 100 pendant 10
    yield e.delai(10);
  });
  env.executer();
  assert.equal(m.percentile(50), 0);
  assert.equal(m.percentile(95), 100);
});

test('un moniteur est interrogeable en cours de simulation, intervalle ouvert compris', () => {
  const env = new Environnement();
  const m = new Moniteur(env, { niveau: true, valeurInitiale: 4 });
  env.avancerA(10);
  assert.equal(m.moyenne(), 4);        // aucune note : l’intervalle ouvert compte
  m.noter(0);
  env.avancerA(30);
  assert.equal(m.moyenne(), 40 / 30);  // 4 pendant 10, 0 pendant 20
  assert.equal(m.duree, 30);
});

test('les cas vides répondent sans produire NaN', () => {
  const env = new Environnement();
  assert.equal(new Moniteur(env, {}).moyenne(), null);
  assert.equal(new Moniteur(env, {}).percentile(50), null);
  assert.equal(new Moniteur(env, { niveau: true, valeurInitiale: 7 }).moyenne(), 7);
});

test('les observations non numériques sont refusées', () => {
  const env = new Environnement();
  const m = new Moniteur(env, {});
  assert.throws(() => m.noter('12'), TypeError);
  assert.throws(() => m.noter(NaN), TypeError);
  assert.throws(() => m.percentile(120), RangeError);
});
