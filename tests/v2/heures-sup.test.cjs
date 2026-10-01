/* Version 2 — les heures supplémentaires : une équipe dont le travail n'est
 * pas fini à la fin de sa présence reste, jusqu'à un plafond, plutôt que de
 * partir en laissant des commandes en retard. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../v2/moteur/production.js');

const h = s => P.minutes(s);
const VOLS = ['AF', 'TX', 'DL'].map((cie, i) => ({ id: cie + '1', cie, sens: 'DEP', std: h('12:00') + i * 10, bc: 0, pc: 0, yc: 100 }));
// Une heure de montage par vol : trois heures de travail pour une personne.
const BAREME = { prepa: { '*/YC': 60 } };
const CHEMIN = { id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] };
const equipe = p => ({ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1,
  lots: [['AF/YC'], ['TX/YC'], ['DL/YC']], regime: { actif: true, seuils: [], presence: 120 }, ...p });
const jouer = (heuresSup, p) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [equipe(p)],
  parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup });
const vue = r => r.ateliers.find(a => a.id === 'mo');

test('sans heures sup : l’équipe part à la fin de sa présence, le travail reste', () => {
  const r = jouer(null);
  assert.equal(vue(r).presence, 120);
  assert.equal(vue(r).heuresSup, 0);
  assert.equal(r.indicateurs.pasFinies, 1, 'la troisième commande n’est pas faite');
});

test('avec heures sup : elle reste le temps qu’il faut, dans le plafond', () => {
  const r = jouer({ actif: true, plafond: 90 });
  assert.equal(vue(r).heuresSup, 60, 'trois heures de travail pour deux de présence');
  assert.equal(r.indicateurs.pasFinies, 0, 'tout est fait');
  assert.equal(vue(r).fin, h('08:00'));
});

test('le plafond borne les heures sup : au-delà, le travail reste', () => {
  const r = jouer({ actif: true, plafond: 30 });
  assert.equal(vue(r).heuresSup, 30);
  assert.equal(r.indicateurs.pasFinies, 1);
});

test('une équipe qui finit dans sa présence ne fait pas d’heures sup', () => {
  const r = jouer({ actif: true, plafond: 90 }, { personnes: 2 });
  assert.equal(vue(r).heuresSup, 0);
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('heures sup désactivées : comme sans l’option', () => {
  assert.equal(vue(jouer({ actif: false, plafond: 90 })).heuresSup, 0);
});
