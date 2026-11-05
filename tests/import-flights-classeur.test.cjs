/* Banc d'essai, évolution 13 (c) — le classeur du rapport d'import Winrest
 * (echanges-import-flights.js), le même depuis la page et depuis l'outil :
 * le Lisez-moi (le fichier, la période, les totaux, les définitions), une
 * feuille par liste, de vraies dates Excel, aucun prix. Export fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tableur.js');
const W = require('../moteur/import-flights.js');
const EW = require('../echanges-import-flights.js');

const TETE = ['Date', 'Delivery No', 'Flight No', 'ICAO', 'ETD', 'Statut', 'Guest type', 'Guest qty', 'Unit price', 'Amount'];
const L = (date, liv, vol, icao, etd, statut, type, qte) => [date, liv, vol, icao, etd, statut, type, qte, 987.65, 4321.09];
const { rapport } = W.convertir([TETE,
  L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 9),
  L('02/03/2026', 'L2', 'NR 101', 'NRD', '09:30', 'Delivered', 'BUSINESS', 3), L('02/03/2026', 'L3', 'NRD RESERVE', 'NRD', '05:00', 'Delivered', 'ECONOMY', 2),
  L('02/03/2026', 'L4', 'NR 105', 'NRD', '11:30', 'Cancelled', 'ECONOMY', 10), L('03/03/2026', 'L5', 'SU 200', 'SDX', '06:00', 'Delivered', 'BÉBÉ', 1),
  L('03/03/2026', 'L6', 'SU 201', 'SDX', '06:30', 'Delivered', 'ECONOMY', 5), L('03/03/2026', 'P1', 'PROD JOUR', 'PRD', '01:00', 'Cancelled', 'ECONOMY', 7)],
{ fictifs: [{ flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY'] }] }, { fichier: 'export-fictif.xlsx' });

test('les totaux : ceux de la page et du Lisez-moi', () => {
  const t = Object.fromEntries(EW.totaux(rapport).map(([k, v]) => [k.trim(), v]));
  assert.deepEqual([t.Fichier, t['Période couverte'], t['Lignes lues'], t.Livraisons, t['Vols gardés (acceptés)'], t['Livraisons écartées (rejetées)']],
    ['export-fictif.xlsx', 'du 02/03/2026 au 03/03/2026 (2 jours)', 8, 7, 4, 2]);
  assert.deepEqual([t['au statut « Delivered »'], t['au statut « Cancelled »'], t['statut « Cancelled »'], t['sans repas']], [5, 2, 1, 1]);
  assert.deepEqual([t['Points à vérifier (ambigus)'], t['Guest types ignorés'], t['Réserves fondues'], t['vol_id suffixés'], t['Vols fictifs créés'], t['à 0, hors du programme']],
    [1, 1, 1, 1, 2, 1]);
});

test('les feuilles : le Lisez-moi, puis une feuille par liste, de vraies dates, sans prix', async () => {
  const feuilles = await T.lireClasseur(EW.classeurDuRapport(rapport));
  assert.deepEqual(feuilles.map(f => f.nom), ['Lisez-moi', 'Par jour', 'Écartées', 'À vérifier', 'Types ignorés', 'Réserves fondues', 'vol_id suffixés', 'Vols fictifs']);
  const f = nom => feuilles.find(x => x.nom === nom).lignes;
  assert.match(JSON.stringify(f('Lisez-moi')), /Acceptées.*Ambiguës.*Rejetées/);
  // Une vraie date Excel (le 02/03/2026 = 46083), puis les colonnes de repas.
  assert.deepEqual(f('Par jour'), [['Date', 'Compagnie', 'Vols', 'BC', 'PC', 'YC', 'CREW', 'SPML BC', 'SPML PC', 'SPML YC'],
    [46083, 'NRD', 2, 3, 0, 12, 0, 0, 0, 0], [46084, 'PROD', 1, 0, 0, 7, 0, 0, 0, 0], [46084, 'SDX', 1, 0, 0, 5, 0, 0, 0, 0]]);
  assert.deepEqual(f('Écartées').slice(1).map(l => l.slice(1)), [['NR 105', 'L4', 'statut « Cancelled »'], ['SU 200', 'L5', 'sans repas']]);
  assert.deepEqual(f('À vérifier').slice(1).map(l => l.slice(1)), [['NR 101', 'L1', 'Guest qty différente pour ECONOMY : 10, 9']]);
  assert.deepEqual(f('Types ignorés'), [['Guest type', 'Quantité', 'Livraisons'], ['BÉBÉ', 1, 1]]);
  assert.deepEqual(f('Réserves fondues')[1].slice(1, 6), ['NRD RESERVE', 'L3', 'NR 101', 0, 0]);
  assert.deepEqual(f('vol_id suffixés')[1].slice(1), ['NR 101', 'L2', 'NR 101-2']);
  // Un jour sans ligne de production : le vol fictif à 0, au rapport, hors du programme.
  assert.deepEqual(f('Vols fictifs').slice(1).map(l => l.slice(1)), [['PROD1', 'PROD JOUR', 0, 'YC', 'non, à 0'], ['PROD1', 'PROD JOUR', 7, 'YC', 'oui']]);
  assert.ok(!/987|4321|Unit price|Amount/.test(JSON.stringify(feuilles)), 'aucun prix, aucune colonne de prix');
});

test('un rapport vide : les feuilles et leurs en-têtes, la période absente dite', async () => {
  const vide = W.convertir([TETE]).rapport;
  const feuilles = await T.lireClasseur(EW.classeurDuRapport(vide));
  assert.equal(feuilles.length, 8);
  assert.ok(feuilles.slice(1).every(f => f.lignes.length === 1));
  assert.deepEqual(EW.totaux(vide)[1], ['Période couverte', 'aucune date']);
});
