/* Banc d'essai, correction 13 — une case vide du réel n'est pas un zéro, sauf
 * pour l'une des deux catégories de présence (moteur/reel.js ;
 * docs/FORMATS_EXCEL.md § 5, docs/BANC_ESSAI.md § 10). Des heures supp vides
 * sont inconnues : elles sortent de la comparaison des heures supp, pas des
 * ETP. Titulaires et intérim vides (ou « heures », seule colonne) : la cellule
 * n'a pas de réel, comme une ligne absente (correction 12), raison « heures
 * vides ». Une seule des deux vide vaut 0 ; une case à 0 reste un vrai zéro.
 * Rôles, services et heures fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/reel.js');
const C = require('../moteur/calage-periode.js');
const T = require('../tableur.js');
const REF = require('./reel-complet.attendu.json');

const ENTETE = 'date;role;heures_titulaires;heures_interim;heures_supp';
const lire = (lignes, entete = ENTETE) => R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv([entete].concat(lignes).join('\n')) }]);
const jours = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
const bilan = dates => ({ services: [{ id: 'prepa', nom: 'Préparation' }],
  joursTravail: dates.map(date => ({ date, complet: true, services: { prepa: { charge: 2, heuresSup: 60 } }, total: {} })) });
const CORR = { lignes: [{ nom: 'Prépa', roles: ['Préparateur'], services: ['prepa'] }] };

test('des heures supp vides dix jours : ces jours sortent des heures supp de la ligne, pas de ses ETP', () => {
  const d = jours(30), vides = new Set(d.slice(5, 15));
  const c = R.comparer(bilan(d), lire(d.map(x => x + ';Préparateur;14;0;' + (vides.has(x) ? '' : '2'))), CORR), l = c.lignes[0];
  assert.equal(l.jours.length, 30, 'les ETP de chaque jour restent');
  assert.deepEqual(l.joursSansReel, []);
  assert.deepEqual(l.heuresSupp, [{ mois: '2026-10', jours: 20, reel: 40, simule: 20 }], 'vingt jours comptés : 2 h réelles et 1 h simulée chacun');
  // Une case à 0 reste un vrai zéro : comptée.
  assert.equal(R.comparer(bilan(d), lire(d.map(x => x + ';Préparateur;14;0;0')), CORR).lignes[0].heuresSupp[0].jours, 30);
});

test('titulaires et intérim vides : la cellule n’a pas de réel, le jour sort de la ligne, raison « heures vides »', () => {
  const d = jours(3), reel = lire(d.map((x, i) => x + ';Préparateur;' + (i === 1 ? ';;' : '14;0;0')));
  assert.equal(reel.lignes[1].vide, true);
  const l = R.comparer(bilan(d), reel, CORR).lignes[0];
  assert.deepEqual(l.jours.map(j => j.date), [d[0], d[2]]);
  assert.deepEqual(l.joursSansReel, [{ date: d[1], raison: 'rôle Préparateur : heures vides' }]);
  // De même, « heures » vide dans un fichier à une seule colonne.
  const seule = lire(d.map((x, i) => x + ';Préparateur;' + (i === 2 ? '' : '14')), 'date;role;heures');
  assert.deepEqual(R.comparer(bilan(d), seule, CORR).lignes[0].joursSansReel, [{ date: d[2], raison: 'rôle Préparateur : heures vides' }]);
  // La feuille « Réel » du classeur le dit.
  const EC = require('../echanges-calage.js'), c = R.comparer(bilan(d), reel, CORR);
  const f = EC.calageVersClasseur({ comparaison: c, reel: R.controler(reel) }).find(x => x.nom === 'Réel').lignes;
  assert.equal(f.find(x => x[0].excel === T.dateExcel(d[1]))[9], 'heures vides : pas de réel');
});

test('l’intérim vide, les titulaires remplies : l’intérim vaut 0 ; et l’inverse', () => {
  const d = jours(2), reel = lire([d[0] + ';Préparateur;14;;1', d[1] + ';Préparateur;;7;1']);
  assert.deepEqual(reel.lignes.map(l => [l.titulaires, l.interim, 'vide' in l]), [[14, 0, false], [0, 7, false]]);
  assert.deepEqual(R.comparer(bilan(d), reel, CORR).lignes[0].jours.map(j => j.reel), [2, 1]);
});

test('non-régression : un réel sans case vide donne la même comparaison et le même calage, champ par champ', () => {
  const comparaison = R.comparer(REF.bilan, lire(REF.csv), REF.correspondance);
  assert.deepEqual(JSON.parse(JSON.stringify(comparaison)), REF.comparaison);
  const { validation, semaines, ...unite } = C.caler(comparaison).unite;
  assert.deepEqual(JSON.parse(JSON.stringify({ ...C.caler(comparaison), unite })), REF.calage);
  assert.ok(lire(REF.csv).lignes.every(l => !('vide' in l)));
});

test('les cas autour : un jour écarté, un double réintégré, le rejeu, un jour tout vide, le signal d’un mois à zéro, des heures supp sur des heures vides', () => {
  const d = jours(4);
  // Un jour écarté par vous : la cellule vide n'est pas « sans réel », elle reste dans la feuille Réel, marquée.
  const reel = lire([d[0] + ';Préparateur;14;0;1', d[1] + ';Préparateur;;;', d[2] + ';Préparateur;14;0;1', d[3] + ';Préparateur;14;0;1']);
  const ctrl = R.controler(reel, { ecartes: { jours: [d[1]] } });
  assert.deepEqual([ctrl.vides.length, ctrl.dansJoursEcartes.length], [0, 1]);
  assert.deepEqual(R.comparer(bilan(d), ctrl, CORR).lignes[0].joursSansReel, []);
  const EC = require('../echanges-calage.js');
  const f = EC.calageVersClasseur({ comparaison: R.comparer(bilan(d), ctrl, CORR), reel: ctrl }).find(x => x.nom === 'Réel').lignes;
  assert.equal(f.find(x => x[0].excel === T.dateExcel(d[1]))[9], 'jour écarté par vous (heures vides)');
  // Un double réintégré dont une ligne a ses heures supp vides : celles de la cellule sont inconnues, ses ETP s'additionnent.
  const double = R.controler(lire([d[0] + ';Préparateur;7;0;1', d[0] + ';Préparateur;7;0;']), { reintegres: [d[0] + '|Préparateur'] });
  assert.deepEqual([double.cellules.get(d[0] + '|Préparateur').titulaires, double.cellules.get(d[0] + '|Préparateur').supp], [14, null]);
  // En rejeu : des heures supp vides sont des heures supp réelles inconnues ce jour-là.
  const r = R.comparer(bilan(d), lire(d.map((x, i) => x + ';Préparateur;14;0;' + (i === 2 ? '' : '1'))), CORR, { rejeu: true }).lignes[0];
  assert.deepEqual(r.jours.map(j => j.heuresSuppReelles), [1, 1, null, 1]);
  assert.equal(r.rejeu.heuresSupp.jours, 3);
  // Un jour du fichier tout vide : listé, avec sa raison, et retiré du total de l'unité.
  const c = R.comparer(bilan(d), lire(d.map((x, i) => x + ';Préparateur;' + (i === 3 ? ';;' : '14;0;1'))), CORR);
  assert.deepEqual([c.jours.length, c.lignes[0].joursSansReel.map(j => j.date), c.unite.joursRetires], [4, [d[3]], [{ date: d[3], lignes: ['Prépa'] }]]);
  // Des heures supp sur une ligne aux heures vides : la cellule n'a pas de réel, et la raison dit qu'elles ne comptent pas.
  assert.deepEqual(R.comparer(bilan(d), lire([d[0] + ';Préparateur;;;3', d[1] + ';Préparateur;14;0;1']), CORR).lignes[0].joursSansReel,
    [{ date: d[0], raison: 'rôle Préparateur : heures vides (ses 3 h supp non comptées)' }]);
  // Le signal d'un mois à zéro ne compte que les jours renseignés, et le dit.
  const sept = Array.from({ length: 5 }, (_, i) => '2026-09-0' + (i + 1));
  const s = R.controler(lire(sept.map(x => x + ';Préparateur;14;0;2').concat(d.map((x, i) => x + ';Préparateur;14;0;' + (i < 2 ? '' : '0'))))).signalees;
  assert.deepEqual(s.filter(x => x.code === 'mois-a-zero').map(x => x.raison), ['Préparateur : heures supp à zéro tout le mois 2026-10 (les jours renseignés ; 2 vides), présentes les autres mois']);
});
