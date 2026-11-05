/* Banc d'essai, évolution 13 (b) — les règles d'import Winrest, réglables et
 * sauvegardées (moteur/import-flights.js ; docs/BANC_ESSAI.md § 14). La clé de
 * stockage « ory-import-winrest-v1 », son enveloppe (schéma, version), sa
 * validation à la lecture, et sa place dans « Tout sauvegarder » (sim.js).
 * Règles fictives ; aucune valeur réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../moteur/import-flights.js');

const REGLES = {
  statutsExclus: ['Cancelled', 'Planned'], icaoExclus: ['XXA'], flightNoExclus: ['NR 999'],
  compagnies: { NRD: 'NORD', SDX: 'SUDEX' },
  types: { ...W.REGLES_DEFAUT.types, 'BÉBÉ': 'ignoré', PREMIUM: 'YC' },
  motReserve: 'SPARE',
  fictifs: [{ flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY', 'CREW'] },
    { flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'PROD1C', heure: '10:05', types: ['CREW'], classe: 'CREW' }]
};

test('la clé de stockage de la version 1 et l’enveloppe : un schéma, une version, les règles complètes', () => {
  assert.equal(W.CLE_STOCKAGE, 'ory-import-winrest-v1');
  const e = W.enveloppe(REGLES);
  assert.deepEqual(Object.keys(e), ['schema', 'version', 'regles']);
  assert.deepEqual([e.schema, e.version], ['ory-import-winrest', 1]);
  assert.deepEqual(e.regles, W.reglesCompletes(REGLES));
  assert.equal(e.regles.fictifs[0].classe, 'YC', 'la classe par défaut est écrite');
});

test('aller-retour : l’enveloppe écrite, relue (JSON), rend les mêmes règles', () => {
  const e = JSON.parse(JSON.stringify(W.enveloppe(REGLES)));
  assert.deepEqual(W.lireEnveloppe(e), W.reglesCompletes(REGLES));
  assert.deepEqual(W.enveloppe(W.lireEnveloppe(e)), e, 'réécrite, identique');
  // Les défauts, eux aussi.
  assert.deepEqual(W.lireEnveloppe(JSON.parse(JSON.stringify(W.enveloppe()))), W.reglesCompletes());
});

test('une enveloppe ou une règle invalide est refusée, en disant laquelle', () => {
  const e = W.enveloppe(REGLES);
  const cas = [
    [null, /ce n’est pas un réglage « ory-import-winrest »/], [[], /ce n’est pas un réglage/], [{ ...e, schema: 'autre' }, /ce n’est pas un réglage/],
    [{ ...e, version: 2 }, /version 2 inconnue/], [{ schema: e.schema, version: 1 }, /les règles manquent/],
    [{ ...e, regles: [] }, /les règles manquent/], [{ ...e, plus: 1 }, /champ inconnu « plus »/],
    [{ ...e, regles: { ...e.regles, motReserve: '' } }, /mot des réserves/],
    [{ ...e, regles: { ...e.regles, fictifs: [{ ...e.regles.fictifs[0], heure: '25:00' }] } }, /vol fictif 1 : l’heure/],
    [{ ...e, regles: { ...e.regles, types: { ECONOMY: 'Z' } } }, /Guest types : « ECONOMY » → « Z », classe inconnue/]
  ];
  for (const [x, attendu] of cas) assert.throws(() => W.lireEnveloppe(x), attendu, JSON.stringify(x));
});

test('« Tout sauvegarder » et « Restaurer » connaissent la clé ; absente d’une sauvegarde, elle est retirée (les défauts)', () => {
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim.js'), 'utf8');
  const parties = sim.slice(sim.indexOf('const PARTIES = ['), sim.indexOf('];', sim.indexOf('const PARTIES = [')));
  // La partie et sa règle de retrait (le comportement lui-même : tests/import-flights-sauvegarde-browser.cjs).
  const entree = parties.slice(parties.indexOf("'ory-import-winrest-v1'"));
  assert.ok(parties.includes("'ory-import-winrest-v1'") && /OrlyWinrest\.lireEnveloppe/.test(entree) && /siAbsente\s*:\s*'retirer'/.test(entree));
  // La page charge le module avant sim.js.
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(index.indexOf('moteur/import-flights.js') > 0 && index.indexOf('moteur/import-flights.js') < index.indexOf('sim.js'));
});
