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

/* Une plonge par vol à deux équipes qui se relaient sur le même tunnel (15/10) :
 * à heure de fin égale, le vol revient à l'équipe dans ses heures, pas à
 * celle qui partirait en heures sup. */
test('plonge : à égalité, l’équipe dans ses heures plutôt que celle en heures sup', () => {
  const plongeur = (id, debut) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 1, pauses: [], lots: [],
    regime: { actif: true, seuils: [], presence: 480 }, parVol: true, durees: { '*': 30 }, tunnels: [{ nom: 'T1', personnes: 1, actif: true }] });
  // Un départ à 12:30 la veille, de retour à 13:00 : le matin finit sa présence à 13:00.
  const r = P.simuler({ vols: [{ id: 'AF9', cie: 'AF', sens: 'DEP', std: h('12:30'), bc: 0, pc: 0, yc: 100 }], liaisons: [], rendement: 1,
    ateliers: [plongeur('matin', '05:00'), plongeur('soir', '13:00')], heuresSup: { actif: true, plafond: 60 },
    materiel: { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } } });
  const l = r.lots.find(x => x.retourVol);
  assert.equal(l.atelier, 'soir');
  assert.equal(P.hhmm(l.debut), '13:00');
  assert.equal(r.ateliers.find(a => a.id === 'matin').heuresSup, 0, 'le matin ne reste pas');
});
