/* Les composants scriptés du système de dessin (refonte du 08/10, étape 9) :
 * la largeur estimée d'une étiquette, et l'heure du trait « maintenant ».
 * Le reste (infobulle, trait posé sur les graphiques) se vérifie dans le
 * navigateur : tests/graphiques-browser.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DS = require('../ds.js');

test('v1 et v2 portent le même ds.js', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '../v2/ds.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../ds.js'), 'utf8'));
});

test('la largeur d’une étiquette croît avec le texte, et avec la taille', () => {
  const l = DS.largeurTexte;
  assert.equal(l(''), 0);
  assert.ok(l('AF · Business') > l('AF/BC'));
  assert.ok(l('MMM') > l('iii'), 'une lettre large compte plus qu’une étroite');
  assert.ok(l('AF/BC', 12) > l('AF/BC', 11));
  // Assez large pour ne jamais déborder : 11 px de « 0 » font au moins 6 px chacun.
  assert.ok(l('0000') >= 4 * 6);
});

test('l’heure du trait : un nombre de minutes, ou rien', () => {
  DS.maintenant(485);
  assert.equal(DS.heure, 485);
  DS.maintenant('-600');
  assert.equal(DS.heure, -600, 'la veille se compte en minutes négatives');
  for (const rien of [null, undefined, NaN, Infinity, 'x']) {
    DS.maintenant(rien);
    assert.equal(DS.heure, null, String(rien));
  }
  // Sans argument, on repose le trait sans changer l'heure (et sans page, rien ne casse).
  DS.maintenant(60);
  DS.maintenant();
  assert.equal(DS.heure, 60);
});
