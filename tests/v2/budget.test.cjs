/* Version 2 — le budget de la main-d'œuvre : du budget du mois au budget du
 * jour (aux vols, ou au remplissage), et le coût de ce qui est planifié
 * (vacations entières + heures sup ×1,25). Montants fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../v2/budget.js');

const VOLS = [
  { id: 'AF1', cie: 'AF', avion: 'A320', sens: 'DEP', std: 600, bc: 0, pc: 0, yc: 87 },    // 87 / 174 = 50 %
  { id: 'AF2', cie: 'AF', avion: 'A320', sens: 'DEP', std: 700, bc: 0, pc: 0, yc: 174 },   // 100 %
  { id: 'XX1', cie: 'XX', avion: 'Z99', sens: 'DEP', std: 800, bc: 0, pc: 0, yc: 10 },     // capacité inconnue : compté plein
  { id: 'AF3', cie: 'AF', avion: 'A320', sens: 'RET', sta: 500, bc: 0, pc: 0, yc: 100 }    // une arrivée : ne compte pas
];
const presque = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ≠ ' + b);

test('valider : ce qui manque prend les valeurs d’exemple, le reste est borné', () => {
  const f = B.valider(null);
  assert.equal(f.majoration, 1.25);
  assert.equal(f.heuresSup.plafond, 180);
  assert.equal(f.categorieDefaut, 'agent');
  const g = B.valider({ categories: [{ id: 'x', nom: 'X', taux: -5 }], categorieDefaut: 'inconnue', heuresSup: { plafond: 5000 },
    services: { prepa: { budget: '30000', mode: 'remplissage' }, bidon: 'oui' }, compo: { e1: { x: 2, inconnue: 3 } } });
  assert.deepEqual(g.categories, [{ id: 'x', nom: 'X', taux: 0 }]);
  assert.equal(g.categorieDefaut, 'x');
  assert.equal(g.heuresSup.plafond, 720);
  assert.deepEqual(g.services, { prepa: { budget: 30000, mode: 'remplissage' } });
  assert.deepEqual(g.compo, { e1: { x: 2 } });
});

test('la journée : les départs, et leur remplissage (passagers ÷ sièges)', () => {
  const f = B.valider(null);
  const j = B.journee(VOLS, f);
  assert.equal(j.vols, 3);
  presque(j.poids, 0.5 + 1 + 1);
  assert.deepEqual(j.inconnus, ['Z99']);
  assert.equal(B.remplissageVol(VOLS[0], f), 0.5);
  // Une compagnie peut avoir sa propre configuration.
  const g = B.valider({ siegesCie: { 'AF/A320': 87 } });
  assert.equal(B.remplissageVol(VOLS[0], g), 1);
});

test('budget du jour aux vols : budget du mois × vols du jour ÷ vols du mois', () => {
  const f = B.valider({ services: { prepa: { budget: 9000 } }, mois: { vols: 90 } });
  presque(B.budgetJour('prepa', VOLS, f).montant, 9000 * 3 / 90);
  // Sans vols du mois : la journée × les jours du mois.
  const g = B.valider({ services: { prepa: { budget: 9000 } }, mois: { jours: 30 } });
  presque(B.budgetJour('prepa', VOLS, g).montant, 300);
  assert.equal(B.budgetJour('cuisine', VOLS, g), null, 'pas de budget saisi');
});

test('budget du jour au remplissage : les vols pèsent selon leur remplissage', () => {
  const f = B.valider({ services: { prepa: { budget: 9000, mode: 'remplissage' } }, mois: { vols: 90, remplissage: 0.75 } });
  // Le jour pèse 2,5 ; le mois 90 × 0,75 = 67,5.
  presque(B.budgetJour('prepa', VOLS, f).montant, 9000 * 2.5 / 67.5);
});

test('le coût d’une équipe : vacations entières, plus les heures sup majorées', () => {
  const f = B.valider({ compo: { e1: { chef: 1 } } });
  const a = { id: 'e1', personnes: 3 };
  const c = B.coutEquipe(a, { presence: 480, heuresSup: 90 }, f);
  assert.deepEqual(c.parCat, { chef: 1, agent: 2 }, 'le reste dans la catégorie par défaut');
  const horaire = 25 + 2 * 18;
  presque(c.base, horaire * 8);
  presque(c.coutSup, horaire * 1.5 * 1.25);
  presque(c.total, c.base + c.coutSup);
  // Sans règle de poste : la vacation par défaut.
  presque(B.coutEquipe({ id: 'e2', personnes: 1 }, { presence: null }, f).base, 18 * 7);
});

test('trois heures sup peuvent coûter moins qu’une personne de plus', () => {
  const f = B.valider(null);
  const sup = B.coutEquipe({ id: 'e', personnes: 1 }, { presence: 495, heuresSup: 180 }, f);
  const plus = B.coutEquipe({ id: 'e', personnes: 2 }, { presence: 495, heuresSup: 0 }, f);
  assert.ok(sup.total < plus.total, sup.total + ' < ' + plus.total);
});

test('le bilan : service par service, et l’écart au budget', () => {
  const f = B.valider({ services: { prepa: { budget: 30 * 400 } }, mois: { jours: 30 } });
  const ateliers = [{ id: 'm', service: 'prepa', type: 'manuel', personnes: 2 }, { id: 'd', service: 'magasin', type: 'dispo' }];
  const resultat = { ateliers: [{ id: 'm', presence: 480, heuresSup: 60 }], indicateurs: { enRetard: 1, pasFinies: 0 } };
  const b = B.bilan({ services: [{ id: 'prepa', nom: 'Montage' }, { id: 'magasin', nom: 'Magasin' }], ateliers, resultat, vols: VOLS, f });
  assert.equal(b.lignes.length, 1, 'une mise à disposition ne coûte rien ici');
  presque(b.base, 2 * 18 * 8);
  presque(b.sup, 2 * 18 * 1.25);
  presque(b.budget, 400);
  presque(b.ecart, 400 - b.total);
  assert.equal(b.retards, 1);
  assert.equal(b.heuresSup, 120, 'deux personnes, une heure chacune');
});
