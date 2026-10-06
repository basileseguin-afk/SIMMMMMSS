/* La règle de poste (retour d'usage du 06/10) : « 8 h de présence avec 1 h de
 * pause ». Le défaut est 8 h dont 1 h de pause après 4 h de travail ; une
 * sauvegarde restée sur la règle d'avant (8 h 15, pauses de 15 et 30 min) y
 * passe d'elle-même, une règle modifiée à la main ne bouge pas. v1 et v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [version, dossier] of [['v1', '..'], ['v2', '../v2']]) {
  const P = require(dossier + '/moteur/production.js');
  globalThis.MoteurProduction = P;
  const R = require(dossier + '/reglages.js');

  test(version + ' : par défaut, 8 h de présence dont 1 h de pause', () => {
    assert.deepEqual(R.valider(null).regime, { seuils: [{ apres: 240, duree: 60 }], presence: 480 });
  });

  test(version + ' : l’ancienne règle restée telle quelle passe à la nouvelle', () => {
    const vieux = { regime: { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }], presence: 495 } };
    assert.deepEqual(R.valider(vieux).regime, { seuils: [{ apres: 240, duree: 60 }], presence: 480 });
  });

  test(version + ' : une règle réglée à la main reste, même identique à l’ancienne après le passage', () => {
    const mien = { regime: { seuils: [{ apres: 120, duree: 20 }], presence: 450 } };
    assert.deepEqual(R.valider(mien).regime, mien.regime);
    const remise = { regimeV: 2, regime: { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }], presence: 495 } };
    assert.equal(R.valider(remise).regime.presence, 495, 'choisie après le passage : on n’y touche plus');
  });
}
