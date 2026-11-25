/* Évolution 25 (b) — visuel.js, sans navigateur : l'ombre de la barre du haut n'apparaît que quand un contenu défile
 * dessous. Une zone qui a défilé et qui commence au bord bas de la barre a fait passer son contenu dessous ; une zone
 * plus bas dans la page (une liste, une fiche, un tableau sous le titre) défile sous ce qui la précède. */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../visuel.js');

test('l’ombre de la barre du haut : seulement quand un contenu défile dessous', () => {
  const barre = { bas: 48 };
  assert.equal(V.defileSousLaBarre(barre, []), false, 'rien ne défile');
  assert.equal(V.defileSousLaBarre(barre, [{ haut: 48, defile: 0 }]), false, 'une zone sous la barre, en haut de son contenu');
  assert.equal(V.defileSousLaBarre(barre, [{ haut: 48, defile: 30 }]), true, 'elle a défilé : son contenu est passé sous la barre');
  assert.equal(V.defileSousLaBarre(barre, [{ haut: 48.4, defile: 1 }]), true, 'au pixel près');
  assert.equal(V.defileSousLaBarre(barre, [{ haut: 190, defile: 300 }]), false, 'une zone sous le titre de la page défile : pas sous la barre');
  assert.equal(V.defileSousLaBarre(barre, [{ haut: 190, defile: 300 }, { haut: 48, defile: 12 }]), true, 'une seule suffit');
});

test('visuel.js ne lit ni n’écrit aucune donnée', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'visuel.js'), 'utf8');
  assert.equal(/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest/.test(source), false);
});
