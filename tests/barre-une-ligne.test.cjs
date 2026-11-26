/* Correction 24 (e) — la barre « Journée de vols » sur une ligne (version 1) : le mot court de son étiquette d'état,
 * sans navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../periode-vue.js');

test('l’étiquette de la barre dit l’état de la période en deux ou trois mots', () => {
  assert.equal(P.motDeLaBarre('jamais'), 'période non simulée');
  assert.equal(P.motDeLaBarre('a-jour'), 'période simulée');
  assert.equal(P.motDeLaBarre('a-relancer'), 'période à relancer');
  assert.equal(P.motDeLaBarre('erreur'), 'période non simulée', 'un calcul refusé : la période n’est pas simulée');
  assert.equal(P.motDeLaBarre('en-cours', { fait: 11, total: 30 }), 'simulation en cours, 12 sur 30', 'la journée en cours de calcul');
  assert.equal(P.motDeLaBarre('en-cours', { fait: 0, total: 30 }), 'simulation en cours, 1 sur 30');
  assert.equal(P.motDeLaBarre('en-cours', { fait: 30, total: 30 }), 'simulation en cours, 30 sur 30', 'jamais plus que le total');
  assert.equal(P.motDeLaBarre('en-cours'), 'simulation en cours');
  for (const e of ['jamais', 'a-jour', 'a-relancer', 'erreur']) assert.ok(P.motDeLaBarre(e).length <= 22, e + ' : un mot court');
});

test('la barre n’a plus de bouton « Simuler la période » : il est dans la page « Période », et il y est plein', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'periode-vue.js'), 'utf8');
  const debut = s.indexOf('rendreBandeau() {'), barre = s.slice(debut, s.indexOf('if (change && this.a.mesurer) this.a.mesurer();', debut));
  assert.ok(debut > 0 && barre.length > 400 && barre.length < 3000, 'le dessin de la barre');
  assert.equal(/data-pv="(lancer|annuler)"/.test(barre), false, 'ni « Simuler », ni « Annuler » dans la barre');
  assert.match(barre, /data-pv="voir">La période →/);
  assert.equal((s.match(/data-pv="lancer"/g) || []).length, 1, 'un seul bouton pour simuler : dans la page');
  assert.match(s, /btn btn-sm\$\{e === 'a-jour' \? '' : ' btn-play'\}" data-pv="lancer"/);
});
