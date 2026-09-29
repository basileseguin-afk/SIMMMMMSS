/* Une plonge par vol à deux équipes (matin, soir) : elles se partagent les vols
 * revenus. Chaque équipe lavait TOUS les vols : le travail et le matériel propre
 * étaient comptés deux fois (trouvé avec le jeu d'essai du 29/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const VOLS = ['06:00', '07:00', '12:00', '16:00', '18:00'].map((t, i) => ({ id: 'AF' + i, cie: 'AF', sens: 'DEP', std: h(t), bc: 0, pc: 0, yc: 100 }));
const equipe = (id, nom, debut, p) => ({ id, nom, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, presence: 480 }, parVol: true, durees: { '*': 60 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 2, actif: true }], ...p });
const jouer = ateliers => P.simuler({ vols: VOLS, liaisons: [], rendement: 1, ateliers,
  materiel: { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } } });
const laves = (r, id) => r.lots.filter(l => l.retourVol && l.atelier === id && l.fin != null);

test('deux équipes de plonge : chaque vol n’est lavé qu’une fois', () => {
  const r = jouer([equipe('m', 'Matin', '05:00'), equipe('s', 'Soir', '13:00')]);
  const tous = r.lots.filter(l => l.retourVol && l.fin != null);
  assert.equal(tous.length, 5, 'cinq vols revenus, cinq lavages');
  assert.equal(new Set(tous.map(l => l.vol)).size, 5, 'aucun vol lavé deux fois');
  assert.equal(r.materiel.lavees, 50, 'le propre n’est pas compté deux fois');
  // Le matin lave ce qu'il a le temps de finir avant son départ (13:00) ; le vol
  // revenu à 12:30 (une heure de tunnel) passe à l'équipe du soir, dès 13:00.
  assert.deepEqual(laves(r, 'm').map(l => l.vol), ['AF0 (J-1)', 'AF1 (J-1)']);
  assert.deepEqual(laves(r, 's').map(l => [l.vol, P.hhmm(l.debut)]), [['AF2 (J-1)', '13:00'], ['AF3 (J-1)', '16:30'], ['AF4 (J-1)', '18:30']]);
});

test('un vol revenu après toutes les équipes est dit à celle du soir', () => {
  const r = jouer([equipe('m', 'Matin', '05:00', { regime: { actif: true, presence: 300 } }), equipe('s', 'Soir', '10:00', { regime: { actif: true, presence: 420 } })]);
  const non = r.lots.filter(l => l.retourVol && l.fin == null);
  assert.ok(non.length >= 1, 'le vol de 18:30 n’est pas lavé (soir fini à 17:00)');
  assert.ok(non.every(l => l.atelier === 's'), 'c’est l’équipe du soir qui le porte, pas celle du matin');
});

test('une seule équipe : rien ne change', () => {
  const r = jouer([equipe('m', 'Matin', '05:00', { regime: { actif: false } })]);
  assert.equal(laves(r, 'm').length, 5);
  assert.equal(r.materiel.lavees, 50);
});
