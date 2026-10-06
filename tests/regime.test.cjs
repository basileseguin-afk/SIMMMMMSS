/* La règle de poste (retours d'usage du 06/10) : « 8 h de présence avec 1 h de
 * pause : 3 h de travail puis 15 min de pause, puis 3 h puis 45 min, puis le
 * reste des 7 h ». Une sauvegarde restée sur une règle par défaut d'avant
 * (8 h 15 ; 8 h avec 1 h d'un bloc) y passe d'elle-même, une règle modifiée à la
 * main ne bouge pas. v1 et v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [version, dossier] of [['v1', '..'], ['v2', '../v2']]) {
  const P = require(dossier + '/moteur/production.js');
  globalThis.MoteurProduction = P;
  const R = require(dossier + '/reglages.js');

  test(version + ' : par défaut, 8 h de présence dont 1 h de pause', () => {
    // 3 h de travail, 15 min, 3 h, 45 min, puis 1 h : 7 h de travail, 8 h de présence.
    const t = P.executerTache({ depart: 0, debutPoste: 0, duree: 1e6, prises: new Set() });
    assert.deepEqual([t.fait, t.arret, t.fin], [420, 60, 480]);
    const sixH = P.executerTache({ depart: 0, debutPoste: 0, duree: 360, prises: new Set() });
    assert.equal(sixH.fin, 375, '6 h de travail : la pause de 15 min seulement, celle de 45 min vient après');
    assert.deepEqual(R.valider(null).regime, { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 45 }], presence: 480 });
  });

  test(version + ' : l’ancienne règle restée telle quelle passe à la nouvelle', () => {
    const vieux = { regime: { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }], presence: 495 } };
    assert.deepEqual(R.valider(vieux).regime, { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 45 }], presence: 480 });
    // La règle d'un jour (8 h avec 1 h d'un bloc, après 4 h), restée telle quelle, aussi.
    assert.deepEqual(R.valider({ regimeV: 2, regime: { seuils: [{ apres: 240, duree: 60 }], presence: 480 } }).regime, { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 45 }], presence: 480 });
  });

  test(version + ' : une règle réglée à la main reste, même identique à l’ancienne après le passage', () => {
    const mien = { regime: { seuils: [{ apres: 120, duree: 20 }], presence: 450 } };
    assert.deepEqual(R.valider(mien).regime, mien.regime);
    const remise = { regimeV: 3, regime: { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }], presence: 495 } };
    assert.equal(R.valider(remise).regime.presence, 495, 'choisie après le passage : on n’y touche plus');
  });
}
