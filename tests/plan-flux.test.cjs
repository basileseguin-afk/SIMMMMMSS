/* Évolution 14 (b) — ce qui se passe à l'heure rejouée, sans navigateur
 * (plan-flux.js) : les paires de services qui ont des repas en stock entre eux
 * (les séjours du moteur), l'épaisseur en racine de la quantité, au plus 8
 * traits, les trois étiquettes, rien quand rien n'attend ; les points d'une
 * tranche ; le tracé de bord à bord qui contourne une zone ; « au travail /
 * présents » d'un créneau ; les véhicules du handling. Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PF = require('../plan-flux.js');

const SEJOURS = [
  { de: 'cuisine', vers: 'montage', entree: 100, sortie: 300, repas: 50 },
  { de: 'cuisine', vers: 'montage', entree: 200, sortie: 400, repas: 30 },
  { de: 'montage', vers: 'dotation', entree: 250, sortie: 500, repas: 120 },
  { de: 'cuisine', vers: 'montage', entree: 0, sortie: 50, repas: 60 },      // fini avant
  { de: 'inconnu', vers: 'montage', entree: 0, sortie: 900, repas: 70 },     // un service qui n'est pas sur le plan
  { de: 'montage', vers: 'montage', entree: 0, sortie: 900, repas: 70 }      // pas un trait
];
const CONNUS = new Set(['cuisine', 'montage', 'dotation']);

test('ce qui circule : une paire par trait, la somme de ses séjours à l’heure rejouée, les plus grosses d’abord', () => {
  assert.deepEqual(PF.circulation(SEJOURS, 260, CONNUS), [{ de: 'montage', vers: 'dotation', repas: 120 }, { de: 'cuisine', vers: 'montage', repas: 80 }]);
  assert.deepEqual(PF.circulation(SEJOURS, 150, CONNUS), [{ de: 'cuisine', vers: 'montage', repas: 50 }]);
  assert.deepEqual(PF.circulation(SEJOURS, 600, CONNUS), [], 'rien n’attend : rien ne circule');
  assert.deepEqual(PF.circulation([], 100, CONNUS), []);
  assert.equal(PF.reference(SEJOURS, CONNUS), 120, 'la plus grosse paire de la journée');
  assert.equal(PF.reference([{ de: 'a', vers: 'b', entree: 0, sortie: 10, repas: 5 }, { de: 'a', vers: 'b', entree: 5, sortie: 20, repas: 7 }], null), 12, 'au même instant, les séjours s’ajoutent');
});

test('l’épaisseur : de 1 à 8 px, proportionnelle à la racine de la quantité', () => {
  assert.equal(PF.epaisseur(120, 120), 8);
  assert.ok(Math.abs(PF.epaisseur(30, 120) - 4) < 1e-9, 'un quart de la quantité, la moitié de l’épaisseur');
  assert.equal(PF.epaisseur(0.01, 120), 1, 'jamais sous 1 px');
  assert.equal(PF.epaisseur(500, 120), 8, 'jamais au-dessus de 8 px');
  assert.equal(PF.epaisseur(0, 120), 0);
  // L'épaisseur suit la quantité.
  const e = [10, 40, 90].map(q => PF.epaisseur(q, 90));
  assert.ok(e[0] < e[1] && e[1] < e[2]);
});

test('au plus 8 traits ; les plus petits se replient dans « + n liens » ; les trois plus épais portent leur quantité', () => {
  const paires = Array.from({ length: 11 }, (_, i) => ({ de: 's' + i, vers: 't' + i, repas: 110 - i * 10 }));
  const t = PF.traits(paires, 110);
  assert.equal(t.traits.length, 8);
  assert.equal(t.autres, 3);
  assert.deepEqual(t.traits.map(x => x.etiquette), [true, true, true, false, false, false, false, false]);
  assert.deepEqual(t.traits.map(x => x.repas), [110, 100, 90, 80, 70, 60, 50, 40]);
  assert.deepEqual(PF.traits([], 110), { traits: [], autres: 0 });
});

test('les points : un par tranche de repas, une tranche ronde ; ils avancent avec l’heure rejouée', () => {
  assert.equal(PF.tranche(120), 20, 'au plus 6 points sur le plus gros trait');
  assert.equal(PF.tranche(6), 1);
  assert.equal(PF.tranche(0), null);
  assert.equal(PF.points(120, 20, 0).length, 6);
  assert.equal(PF.points(110, 20, 0).length, 6, 'une tranche entamée fait un point');
  assert.equal(PF.points(10, 25, 0).length, 1, 'au moins un point');
  const a = PF.points(50, 25, 0), b = PF.points(50, 25, 7.5);
  assert.deepEqual(a, [0, 0.5]);
  assert.deepEqual(b, [0.25, 0.75], 'un quart de traversée en 7,5 min');
  assert.deepEqual(PF.points(0, 25, 0), []);
});

test('le tracé : d’un bord à l’autre, au point le plus proche ; il contourne une zone entre les deux', () => {
  const A = { x: 0, y: 0, w: 100, h: 100 }, B = { x: 400, y: 0, w: 100, h: 100 }, C = { x: 0, y: 300, w: 100, h: 100 }, M = { x: 200, y: 20, w: 100, h: 60 };
  assert.deepEqual(PF.bords(A, B), [{ x: 100, y: 50 }, { x: 400, y: 50 }], 'côte à côte : bord droit, bord gauche');
  assert.deepEqual(PF.bords(A, C), [{ x: 50, y: 100 }, { x: 50, y: 300 }], 'l’une sous l’autre');
  const libre = PF.trace(A, B, [A, B]), gene = PF.trace(A, B, [A, B, M]);
  assert.equal(libre.croise, 0);
  assert.equal(gene.croise, 0, 'la zone du milieu est contournée');
  assert.ok(Math.abs(gene.c.y - 50) > Math.abs(libre.c.y - 50), 'en courbant davantage');
  const c = PF.chemin(gene, 10);
  assert.match(c.d, /^M100\.0 50\.0 Q/);
  assert.match(c.pointe, /L400\.0 50\.0 L/, 'une pointe, à l’arrivée');
  const fin = c.d.split(' ').slice(-2).map(Number);
  assert.ok(fin[0] < 400 && fin[0] > 400 - 10, 'le trait s’arrête à la base de la pointe : ' + fin);
});

test('« au travail / présents » d’un service : les créneaux de 15 min, arrondis', () => {
  const c = { presents: { debut: 300, valeurs: [2, 6, 5.6] }, auTravail: { debut: 300, valeurs: [1, 3.6, 4] }, enFile: { debut: 300, valeurs: [0, 2.4, 0] } };
  assert.deepEqual(PF.chargeA(c, 320, 15), { auTravail: 4, presents: 6, enFile: 2 });
  assert.deepEqual(PF.chargeA(c, 300, 15), { auTravail: 1, presents: 2, enFile: 0 });
  assert.deepEqual(PF.chargeA(c, 999, 15), { auTravail: 0, presents: 0, enFile: 0 }, 'hors des créneaux : personne');
});

test('le handling : un véhicule par tournée, du quai au bord du plan, puis retour', () => {
  const lots = [
    { service: 'quais', camion: 1, vehicule: 'camion', trajet: { depart: 100, retour: 160, aller: 20, dureeRetour: 15 } },
    { service: 'quais', camion: 1, vehicule: 'camion', trajet: { depart: 100, retour: 160, aller: 20, dureeRetour: 15 } },  // le même trajet, un autre vol
    { service: 'quais', camion: 2, vehicule: 'vl', trajet: { depart: 130, retour: 170, aller: 10, dureeRetour: 10 } },
    { service: 'cuisine', debut: 0, fin: 10 }
  ];
  assert.deepEqual(PF.vehiculesA(lots, 110).map(v => [v.camion, v.vehicule, v.avance]), [[1, 'camion', 0.5]]);
  assert.deepEqual(PF.vehiculesA(lots, 135).map(v => [v.camion, v.vehicule, v.avance]), [[1, 'camion', 1], [2, 'vl', 0.5]]);
  assert.deepEqual(PF.vehiculesA(lots, 155).map(v => [v.camion, +v.avance.toFixed(3)]), [[1, 0.333], [2, 1]]);
  assert.deepEqual(PF.vehiculesA(lots, 200), []);
  const plan = { x: 0, y: 0, w: 1000, h: 600 }, quai = { x: 850, y: 250, w: 100, h: 100 };
  assert.deepEqual(PF.versLesAvions(quai, plan), { cote: 'droite', depart: { x: 950, y: 300 }, arrivee: { x: 1000, y: 300 } });
  // Un quai au bord du plan : le véhicule part de son centre, sinon il ne bougerait pas.
  const auBord = { x: 900, y: 250, w: 100, h: 100 };
  assert.deepEqual(PF.versLesAvions(auBord, plan, 30), { cote: 'droite', depart: { x: 950, y: 300 }, arrivee: { x: 1000, y: 300 } });
  assert.deepEqual(PF.versLesAvions(quai, plan, 30).depart, { x: 950, y: 300 }, 'assez loin du bord : il part du bord du quai');
});
