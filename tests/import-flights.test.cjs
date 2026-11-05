/* Banc d'essai, évolution 13 (a) — lire l'export « Flights » de Winrest
 * (moteur/import-flights.js ; docs/FORMATS_EXCEL.md, docs/BANC_ESSAI.md). Les lignes
 * de l'onglet et les règles d'import donnent le programme de vols daté
 * (évolution 10) et un rapport d'import. Chaque règle, de 1 à 12, a son cas.
 * Exports fictifs, calculés à la main : compagnies, vols et livraisons
 * inventés ; aucune valeur réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../moteur/import-flights.js');
const UI = require('../ui-model.js');

// L'en-tête d'un export : les colonnes lues, et d'autres (article, prix, montant) qui ne doivent jamais ressortir.
const TETE = ['Date', 'Delivery No', 'Flight No', 'ICAO', 'ETD', 'Statut', 'Guest type', 'Guest qty', 'Article', 'Unit price', 'Amount'];
const PRIX = 987.65;
/** Une ligne de prestation : [date, livraison, vol, ICAO, ETD, statut, type, qté], un article et des prix reconnaissables. */
const L = (date, liv, vol, icao, etd, statut, type, qte, article = 'Plateau') => [date, liv, vol, icao, etd, statut, type, qte, article, PRIX, 4321.09];
const exp = (...lignes) => [TETE, ...lignes];
const conv = (lignes, regles, o) => W.convertir(lignes, regles, { fichier: 'export-fictif.xlsx', ...o });
const vol = (r, id, date) => r.vols.find(v => v.vol_id === id && (!date || v.date === date));

test('règle 1 : les colonnes par leur en-tête ; les autres ignorées ; une colonne manquante refuse le fichier en la nommant', () => {
  // Dans un autre ordre, avec une casse et des espaces différents : les mêmes colonnes.
  const t = ['guest QTY', ' Flight No ', 'Statut', 'ETD', 'ICAO', 'Delivery No', 'Guest type', 'date', 'Prix'];
  const r = conv([t, [10, 'NR 101', 'Delivered', '07:30', 'NRD', 'L1', 'ECONOMY', '02/03/2026', 12.5]]);
  assert.deepEqual([r.vols.length, r.vols[0].nb_YC, r.vols[0].heure_std], [1, 10, '07:30']);
  for (const manque of ['Date', 'Delivery No', 'Flight No', 'ICAO', 'ETD', 'Statut', 'Guest type', 'Guest qty']) {
    const sans = TETE.filter(c => c !== manque);
    assert.throws(() => conv([sans, sans.map(() => 'x')]), new RegExp('colonne « ' + manque + ' »'), manque);
  }
});

test('aucun prix ni montant dans le programme ni dans le rapport', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10)));
  const tout = JSON.stringify(r) + W.versCsv(r.vols);
  assert.ok(!tout.includes('987') && !tout.includes('4321') && !/price|amount|prix|montant/i.test(tout), tout.slice(0, 300));
});

test('règle 2 : une livraison = un vol ; sa date, son Flight No, son ICAO de sa première ligne ; son heure, le plus tôt de ses ETD', () => {
  const r = conv(exp(
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '08:15', 'Delivered', 'ECONOMY', 20),
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:40', 'Delivered', 'ECONOMY', 20, 'Boisson'),
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '', 'Delivered', 'ECONOMY', 20, 'Pain'),
    L('02/03/2026', 'L2', 'SU 200', 'SDX', '12:00', 'Delivered', 'BUSINESS', 4)));
  assert.deepEqual(r.vols.map(v => [v.date, v.vol_id, v.compagnie, v.heure_std]), [['2026-03-02', 'NR 101', 'NRD', '07:40'], ['2026-03-02', 'SU 200', 'SDX', '12:00']]);
  assert.equal(r.rapport.lignes, 4);
  assert.equal(r.rapport.livraisons, 2);
});

test('règle 3 : un même Guest qty répété sur dix lignes de prestation compte une fois, par livraison et par Guest type', () => {
  const dix = Array.from({ length: 10 }, (_, i) => L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 150, 'Article ' + i));
  const r = conv(exp(...dix, L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'BUSINESS', 12), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'BUSINESS', 12, 'Vin')));
  assert.deepEqual([r.vols[0].nb_YC, r.vols[0].nb_BC], [150, 12]);
  // Une quantité qui change d'une ligne à l'autre : la première compte, et le rapport la signale.
  const d = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 150), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 149, 'Pain')));
  assert.equal(d.vols[0].nb_YC, 150);
  assert.match(d.rapport.aVerifier.map(x => x.quoi).join(' | '), /Guest qty différente pour ECONOMY : 150, 149/);
});

test('règle 4 : la table des Guest types ; un type inconnu ou vide, ignoré et au rapport avec ses quantités', () => {
  const types = [['ECONOMY', 100], ['BUSINESS', 10], ['FIRST', 2], ['PREMIUM', 20], ['CREW', 3], ['PNC', 4], ['PNT', 2], ['CDB', 1],
    ['ECO SPML', 5], ['BUSINESS SPML', 1], ['PREMIUM SPML', 2], ['BÉBÉ', 7], ['', 9]];
  const r = conv(exp(...types.map(([t, q]) => L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', t, q))));
  const v = r.vols[0];
  assert.deepEqual([v.nb_YC, v.nb_BC, v.nb_PC, v.nb_CREW, v.nb_SPML_YC, v.nb_SPML_BC, v.nb_SPML_PC, v.nb_SPML], [100, 12, 20, 10, 5, 1, 2, 8]);
  assert.deepEqual(r.rapport.typesIgnores.map(x => [x.guestType, x.quantite]), [['(vide)', 9], ['BÉBÉ', 7]]);
  // Une table réglée : PREMIUM en YC, BÉBÉ ignoré explicitement (pas au rapport des inconnus), la casse et les espaces sans effet.
  const t = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', ' premium ', 20), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'BÉBÉ', 7)),
    { types: { ...W.REGLES_DEFAUT.types, PREMIUM: 'YC', 'BÉBÉ': 'ignoré' } });
  assert.deepEqual([t.vols[0].nb_YC, t.vols[0].nb_PC, t.rapport.typesIgnores.length], [20, 0, 0]);
});

test('règle 5 : les statuts exclus (par défaut Cancelled) ; le rapport compte les livraisons par statut', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'NR 103', 'NRD', '09:30', 'Cancelled', 'ECONOMY', 10),
    L('02/03/2026', 'L3', 'NR 105', 'NRD', '11:30', 'Planned', 'ECONOMY', 10)));
  assert.deepEqual(r.vols.map(v => v.vol_id), ['NR 101', 'NR 105']);
  assert.deepEqual(r.rapport.parStatut, { Cancelled: 1, Delivered: 1, Planned: 1 });
  assert.deepEqual(r.rapport.ecartees.map(x => [x.date, x.flightNo, x.motif]), [['2026-03-02', 'NR 103', 'statut « Cancelled »']]);
  const s = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Planned', 'ECONOMY', 10)), { statutsExclus: ['Planned'] });
  assert.equal(s.vols.length, 0);
});

test('règle 6 : ICAO exclus et Flight No exclus, en égalité exacte', () => {
  const lignes = exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'NR 1010', 'NRD', '08:30', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L3', 'XX 1', 'XXA', '09:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L4', 'XX 2', 'XXAB', '10:30', 'Delivered', 'ECONOMY', 10));
  const r = conv(lignes, { icaoExclus: ['XXA'], flightNoExclus: ['NR 101'] });
  // « NR 101 » n'exclut pas « NR 1010 » ; « XXA » n'exclut pas « XXAB » ; la casse compte.
  assert.deepEqual(r.vols.map(v => v.vol_id), ['NR 1010', 'XX 2']);
  assert.deepEqual(r.rapport.ecartees.map(x => [x.flightNo, x.motif]), [['NR 101', 'Flight No exclu'], ['XX 1', 'ICAO exclu']]);
  assert.equal(conv(lignes, { icaoExclus: ['xxa'] }).vols.length, 4);
});

test('règle 7 : les codes compagnie (ICAO → compagnie du programme) ; sans entrée, l’ICAO tel quel', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'SU 200', 'SDX', '08:30', 'Delivered', 'ECONOMY', 10)),
    { compagnies: { NRD: 'NORD' } });
  assert.deepEqual(r.vols.map(v => [v.vol_id, v.compagnie]), [['NR 101', 'NORD'], ['SU 200', 'SDX']]);
});

test('règle 8 : le vol_id (espaces réduits, sans suffixe d’équipage) ; deux livraisons du même vol le même jour, « X » et « X-2 »', () => {
  const r = conv(exp(
    L('02/03/2026', 'L1', '  NR   101 ', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L2', 'NR 202 CREW', 'NRD', '08:30', 'Delivered', 'CREW', 4),
    L('02/03/2026', 'L3', 'NR 303.CEW', 'NRD', '09:30', 'Delivered', 'CREW', 4),
    L('02/03/2026', 'L4', 'NR 404..crew', 'NRD', '10:30', 'Delivered', 'CREW', 4),
    // Le même vol deux fois le même jour : dans l'ordre des heures, la plus tardive prend « -2 », puis « -3 ».
    L('02/03/2026', 'L6', 'SU 500', 'SDX', '18:00', 'Delivered', 'ECONOMY', 30),
    L('02/03/2026', 'L5', 'SU 500', 'SDX', '06:00', 'Delivered', 'ECONOMY', 20),
    L('02/03/2026', 'L7', 'SU 500 CREW', 'SDX', '20:00', 'Delivered', 'CREW', 5),
    // Le lendemain, le même vol : pas de suffixe.
    L('03/03/2026', 'L8', 'SU 500', 'SDX', '06:00', 'Delivered', 'ECONOMY', 20)));
  assert.deepEqual(r.vols.filter(v => v.date === '2026-03-02').map(v => v.vol_id), ['SU 500', 'NR 101', 'NR 202', 'NR 303', 'NR 404', 'SU 500-2', 'SU 500-3']);
  assert.deepEqual([vol(r, 'SU 500', '2026-03-02').nb_YC, vol(r, 'SU 500-2').nb_YC, vol(r, 'SU 500-3').nb_CREW], [20, 30, 5]);
  assert.equal(vol(r, 'SU 500', '2026-03-03').nb_YC, 20);
  assert.deepEqual(r.rapport.suffixes.map(x => [x.flightNo, x.volId]), [['SU 500', 'SU 500-2'], ['SU 500 CREW', 'SU 500-3']]);
  // La numérotation vient après les vols sans repas (règle 9) : un doublon sans repas ne prend pas de numéro.
  const n = conv(exp(L('02/03/2026', 'L1', 'SU 500', 'SDX', '06:00', 'Delivered', 'ECONOMY', 0), L('02/03/2026', 'L2', 'SU 500', 'SDX', '18:00', 'Delivered', 'ECONOMY', 30)));
  assert.deepEqual(n.vols.map(v => v.vol_id), ['SU 500']);
});

test('règle 9 : un vol sans repas (toutes classes à 0, SPML compris) est écarté et listé', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 0), L('02/03/2026', 'L2', 'NR 103', 'NRD', '09:30', 'Delivered', 'ECO SPML', 1),
    L('02/03/2026', 'L3', 'NR 105', 'NRD', '11:30', 'Delivered', 'BÉBÉ', 4)));
  assert.deepEqual(r.vols.map(v => v.vol_id), ['NR 103']);
  assert.deepEqual(r.rapport.ecartees.map(x => [x.flightNo, x.motif]), [['NR 101', 'sans repas'], ['NR 105', 'sans repas']]);
});

test('règle 10 : une réserve rejoint le premier vol de sa compagnie ce jour-là ; sans vol, elle est écartée', () => {
  const r = conv(exp(
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '09:00', 'Delivered', 'ECONOMY', 100),
    L('02/03/2026', 'L2', 'NR 099', 'NRD', '06:00', 'Delivered', 'ECONOMY', 50),
    L('02/03/2026', 'L3', 'NRD reserve', 'NRD', '05:00', 'Delivered', 'ECONOMY', 6),
    L('02/03/2026', 'L3', 'NRD reserve', 'NRD', '05:00', 'Delivered', 'BUSINESS', 2),
    // Une réserve d'une compagnie sans vol ce jour-là : écartée, au rapport.
    L('02/03/2026', 'L4', 'RESERVE SUD', 'SDX', '05:00', 'Delivered', 'ECONOMY', 8),
    // Le mot réglé, sans tenir compte de la casse.
    L('03/03/2026', 'L5', 'NR 101', 'NRD', '09:00', 'Delivered', 'ECONOMY', 100),
    L('03/03/2026', 'L6', 'NR SPARE', 'NRD', '05:00', 'Delivered', 'ECONOMY', 3)), { motReserve: 'spare' });
  assert.deepEqual([vol(r, 'NR 099').nb_YC, vol(r, 'NR 099').nb_BC, vol(r, 'NR 101', '2026-03-02').nb_YC, vol(r, 'NR 101', '2026-03-03').nb_YC], [50, 0, 100, 103]);
  assert.ok(r.vols.some(v => v.vol_id === 'NRD reserve') && !r.vols.some(v => v.vol_id === 'NR SPARE'), 'avec le mot « spare », « reserve » est un vol ordinaire');
  // Avec le mot par défaut, « reserve » rejoint NR 099, le premier vol de NRD par heure.
  const d = conv(exp(
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '09:00', 'Delivered', 'ECONOMY', 100),
    L('02/03/2026', 'L2', 'NR 099', 'NRD', '06:00', 'Delivered', 'ECONOMY', 50),
    L('02/03/2026', 'L3', 'NRD reserve', 'NRD', '05:00', 'Delivered', 'ECONOMY', 6),
    L('02/03/2026', 'L3', 'NRD reserve', 'NRD', '05:00', 'Delivered', 'BUSINESS', 2),
    L('02/03/2026', 'L4', 'RESERVE SUD', 'SDX', '05:00', 'Delivered', 'ECONOMY', 8)));
  assert.deepEqual([vol(d, 'NR 099').nb_YC, vol(d, 'NR 099').nb_BC, vol(d, 'NR 101').nb_YC, d.vols.length], [56, 2, 100, 2]);
  assert.deepEqual(d.rapport.reservesFondues.map(x => [x.date, x.flightNo, x.vers]), [['2026-03-02', 'NRD reserve', 'NR 099']]);
  assert.deepEqual(d.rapport.ecartees.map(x => [x.flightNo, x.motif]), [['RESERVE SUD', 'réserve sans vol']]);
});

test('règle 11 : un vol fictif chaque jour qui a un vol gardé ; ses lignes comptent quel que soit leur statut ; un jour sans ligne, 0 (au rapport, hors du programme)', () => {
  const fictif = { flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY', 'CREW'], classe: 'YC' };
  const r = conv(exp(
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    // Ses lignes, toutes annulées : elles comptent, une fois par livraison et par type.
    L('02/03/2026', 'P1', 'PROD JOUR', 'PRD', '01:00', 'Cancelled', 'ECONOMY', 40),
    L('02/03/2026', 'P1', 'PROD JOUR', 'PRD', '01:00', 'Cancelled', 'ECONOMY', 40, 'Pain'),
    L('02/03/2026', 'P1', 'PROD JOUR', 'PRD', '01:00', 'Cancelled', 'CREW', 5),
    L('02/03/2026', 'P2', 'PROD JOUR', 'PRD', '02:00', 'Cancelled', 'ECONOMY', 7),
    L('02/03/2026', 'P2', 'PROD JOUR', 'PRD', '02:00', 'Cancelled', 'BUSINESS', 99),
    // Le 03 : un vol gardé, aucune ligne de production → un vol fictif à 0, au rapport ; le programme daté refuse un vol sans repas.
    L('03/03/2026', 'L2', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    // Le 04 : des lignes de production, mais aucun vol gardé → pas de vol fictif.
    L('04/03/2026', 'P3', 'PROD JOUR', 'PRD', '01:00', 'Cancelled', 'ECONOMY', 12)), { fictifs: [fictif] });
  const f = r.vols.filter(v => v.vol_id === 'PROD1');
  assert.deepEqual(f.map(v => [v.date, v.compagnie, v.heure_std, v.nb_YC, v.nb_BC]), [['2026-03-02', 'PROD', '10:00', 52, 0]]);
  // Ces Flight No ne donnent aucun autre vol ; le rapport liste les vols fictifs.
  assert.equal(r.vols.filter(v => /PROD JOUR/.test(v.vol_id)).length, 0);
  assert.deepEqual(r.rapport.fictifs.map(x => [x.date, x.volId, x.quantite, x.auProgramme]), [['2026-03-02', 'PROD1', 52, true], ['2026-03-03', 'PROD1', 0, false]]);
  // Le programme se relit comme un CSV daté : aucun vol sans repas.
  assert.equal(UI.parseFlights(W.versCsv(r.vols), { eta: true, spmlParCabine: true, date: true }).length, r.vols.length);
  // Une autre classe.
  const c = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'P1', 'PROD NUIT', 'PRD', '01:00', 'Cancelled', 'CREW', 6)),
    { fictifs: [{ ...fictif, flightNo: 'PROD NUIT', volId: 'PROD2', types: ['CREW'], classe: 'CREW' }] });
  assert.deepEqual([vol(c, 'PROD2').nb_CREW, vol(c, 'PROD2').nb_YC], [6, 0]);
});

test('règles 8, 9 et 10 ensemble : une réserve rejoint le vol sans suffixe, jamais un vol sans repas', () => {
  const r = conv(exp(
    L('02/03/2026', 'L1', 'SU 500', 'SDX', '06:00', 'Delivered', 'ECONOMY', 20),
    L('02/03/2026', 'L2', 'SU 500', 'SDX', '18:00', 'Delivered', 'ECONOMY', 30),
    L('02/03/2026', 'L3', 'SDX RESERVE', 'SDX', '04:00', 'Delivered', 'ECONOMY', 4),
    // Le premier vol de NRD n'a pas de repas : écarté (règle 9), la réserve rejoint le suivant.
    L('02/03/2026', 'L4', 'NR 090', 'NRD', '06:00', 'Delivered', 'ECONOMY', 0),
    L('02/03/2026', 'L5', 'NR 101', 'NRD', '09:00', 'Delivered', 'ECONOMY', 100),
    L('02/03/2026', 'L6', 'NRD RESERVE', 'NRD', '04:00', 'Delivered', 'ECONOMY', 5),
    // Le 03, NRD n'a qu'un vol sans repas : la réserve est orpheline.
    L('03/03/2026', 'L7', 'NR 090', 'NRD', '06:00', 'Delivered', 'ECONOMY', 0),
    L('03/03/2026', 'L8', 'NRD RESERVE', 'NRD', '04:00', 'Delivered', 'ECONOMY', 5),
    L('03/03/2026', 'L9', 'SU 500', 'SDX', '06:00', 'Delivered', 'ECONOMY', 20)));
  assert.deepEqual([vol(r, 'SU 500', '2026-03-02').nb_YC, vol(r, 'SU 500-2').nb_YC, vol(r, 'NR 101').nb_YC], [24, 30, 105]);
  assert.deepEqual(r.rapport.reservesFondues.map(x => [x.flightNo, x.vers]), [['SDX RESERVE', 'SU 500'], ['NRD RESERVE', 'NR 101']]);
  assert.deepEqual(r.rapport.ecartees.map(x => [x.date, x.flightNo, x.motif]),
    [['2026-03-02', 'NR 090', 'sans repas'], ['2026-03-03', 'NR 090', 'sans repas'], ['2026-03-03', 'NRD RESERVE', 'réserve sans vol']]);
});

test('règle 11 : un vol fictif n’est pas numéroté ; au vol_id d’un vol gardé ce jour-là, il refuse le fichier', () => {
  const f = { flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'NR 101', heure: '10:00', types: ['ECONOMY'] };
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10)), { fictifs: [f] }),
    /vol fictif « NR 101 » : ce vol_id existe déjà le 02\/03\/2026/);
  // Une ligne de production sans date ne compte pour aucun jour : elle se signale.
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('', 'P1', 'PROD JOUR', 'PRD', '', 'Cancelled', 'ECONOMY', 9)),
    { fictifs: [{ ...f, volId: 'PROD1' }] });
  assert.deepEqual([vol(r, 'PROD1'), r.rapport.fictifs.map(x => [x.quantite, x.auProgramme]), r.rapport.aVerifier.map(x => [x.deliveryNo, x.quoi])],
    [undefined, [[0, false]], [['P1', 'ligne de production sans date : non comptée']]]);
});

test('règle 12 : le programme trié par date, heure, vol_id, aux colonnes du programme daté ; le CSV se relit comme un CSV daté', () => {
  const r = conv(exp(
    L('03/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L2', 'SU 200', 'SDX', '09:00', 'Delivered', 'BUSINESS SPML', 1),
    L('02/03/2026', 'L2', 'SU 200', 'SDX', '09:00', 'Delivered', 'ECO SPML', 2),
    L('02/03/2026', 'L3', 'NR 101', 'NRD', '09:00', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L4', 'AA 9', 'AAA', '23:50', 'Delivered', 'ECONOMY', 10)));
  assert.deepEqual(r.vols.map(v => [v.date, v.heure_std, v.vol_id]), [['2026-03-02', '09:00', 'NR 101'], ['2026-03-02', '09:00', 'SU 200'], ['2026-03-02', '23:50', 'AA 9'], ['2026-03-03', '07:30', 'NR 101']]);
  assert.deepEqual(Object.keys(r.vols[0]), W.COLONNES);
  assert.deepEqual(W.COLONNES, ['date', 'vol_id', 'compagnie', 'type_avion', 'sens', 'heure_std', 'heure_sta', 'nb_BC', 'nb_PC', 'nb_YC', 'nb_CREW', 'nb_SPML',
    'nb_SPML_BC', 'nb_SPML_PC', 'nb_SPML_YC']);
  const su = vol(r, 'SU 200');
  assert.deepEqual([su.type_avion, su.sens, su.heure_sta, su.nb_SPML, su.nb_SPML_BC, su.nb_SPML_YC], ['', 'DEP', '', 3, 1, 2]);
  // Le CSV : le programme daté de l'évolution 10, lu par le même code que l'import de la page.
  const lus = UI.parseFlights(W.versCsv(r.vols), { eta: true, spmlParCabine: true, date: true });
  assert.deepEqual(lus.map(v => [v.date, v.id, v.cie, v.sens, v.std, v.yc, v.spml]), r.vols.map(v => [v.date, v.vol_id, v.compagnie, 'DEP',
    Number(v.heure_std.slice(0, 2)) * 60 + Number(v.heure_std.slice(3)), v.nb_YC, v.nb_SPML]));
  assert.deepEqual(lus.find(v => v.id === 'SU 200').spmlParCabine, { BC: 1, PC: 0, YC: 2 });
});

test('le rapport : fichier, période, lignes, livraisons, vols gardés par jour et compagnie avec leurs repas, écartées par motif', () => {
  const r = conv(exp(
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'CREW', 2),
    L('02/03/2026', 'L2', 'NR 103', 'NRD', '09:30', 'Delivered', 'BUSINESS', 3),
    L('02/03/2026', 'L3', 'NR 105', 'NRD', '11:30', 'Cancelled', 'ECONOMY', 10),
    L('04/03/2026', 'L4', 'SU 200', 'SDX', '06:00', 'Delivered', 'ECONOMY', 5)), { compagnies: { NRD: 'NORD' } });
  const p = r.rapport;
  assert.deepEqual([p.fichier, p.periode], ['export-fictif.xlsx', { debut: '2026-03-02', fin: '2026-03-04', jours: 3 }]);
  assert.deepEqual([p.lignes, p.livraisons, p.vols], [5, 4, 3]);
  assert.deepEqual(p.parJour, [{ date: '2026-03-02', compagnie: 'NORD', vols: 2, BC: 3, PC: 0, YC: 10, CREW: 2, SPML_BC: 0, SPML_PC: 0, SPML_YC: 0 },
    { date: '2026-03-04', compagnie: 'SDX', vols: 1, BC: 0, PC: 0, YC: 5, CREW: 0, SPML_BC: 0, SPML_PC: 0, SPML_YC: 0 }]);
  assert.deepEqual(p.parMotif, { 'statut « Cancelled »': 1 });
  // Acceptées, ambiguës, rejetées (D11) : les vols gardés, les points à vérifier, les livraisons écartées.
  assert.deepEqual([p.vols, p.aVerifier.length, p.ecartees.length], [3, 0, 1]);
  // La période couverte est celle du fichier, même si rien n'est gardé.
  const a = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Cancelled', 'ECONOMY', 10), L('05/03/2026', 'L2', 'NR 101', 'NRD', '07:30', 'Cancelled', 'ECONOMY', 10)));
  assert.deepEqual([a.rapport.periode, a.vols.length], [{ debut: '2026-03-02', fin: '2026-03-05', jours: 4 }, 0]);
});

test('une valeur illisible refuse le fichier en nommant la ligne ; les dates et les heures d’Excel se lisent', () => {
  assert.throws(() => conv(exp(L('31/02/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10))), /ligne 2 : date illisible « 31\/02\/2026 »/);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '7h30', 'Delivered', 'ECONOMY', 10))), /ligne 2 : ETD illisible « 7h30 »/);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 'dix'))), /ligne 2 : Guest qty illisible « dix »/);
  assert.throws(() => conv(exp(L('02/03/2026', '', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10))), /ligne 2 : Delivery No vide/);
  // Une livraison gardée sans aucune heure : refusée, nommée.
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '', 'Delivered', 'ECONOMY', 10))), /livraison L1 \(NR 101, 02\/03\/2026\) : aucune ETD/);
  // Les cellules d'Excel : une date en nombre de jours, une heure en fraction de jour.
  const r = conv(exp(L(46083, 'L1', 'NR 101', 'NRD', 0.3125, 'Delivered', 'ECONOMY', 10), L('2026-03-03', 'L2', 'NR 101', 'NRD', '07:30:00', 'Delivered', 'ECONOMY', 10)));
  assert.deepEqual(r.vols.map(v => [v.date, v.heure_std]), [['2026-03-02', '07:30'], ['2026-03-03', '07:30']]);
  // Les lignes vides sont sautées.
  assert.equal(conv([...exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10)), ['', null, '', ''], []]).rapport.lignes, 1);
});

test('les points à vérifier : un écart se signale une fois par livraison ; ICAO et statut de la première ligne', () => {
  const cinq = ['Pain', 'Vin', 'Sel', 'Thé', 'Eau'].map(a => L('02/03/2026', 'L1', 'NR 101', 'NRX', '07:30', 'Planned', 'ECONOMY', 10, a));
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), ...cinq));
  assert.deepEqual(r.rapport.aVerifier.map(x => [x.deliveryNo, x.quoi]), [['L1', 'ICAO différent : « NRD », « NRX »'], ['L1', 'statut différent : « Delivered », « Planned »']]);
  assert.deepEqual([r.vols[0].compagnie, r.rapport.parStatut], ['NRD', { Delivered: 1 }]);
});

test('une Guest qty entière ; un vol sans repas n’a pas besoin d’heure ; deux vols fictifs au même vol_id refusés', () => {
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', '1,5'))), /ligne 2 : Guest qty illisible « 1,5 »/);
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'NR 102', 'NRD', '', 'Delivered', 'ECONOMY', 0)));
  assert.deepEqual(r.rapport.ecartees.map(x => [x.deliveryNo, x.motif]), [['L2', 'sans repas']]);
  const f = { flightNo: 'PROD JOUR', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY'] };
  assert.throws(() => W.reglesCompletes({ fictifs: [f, { ...f, flightNo: 'PROD NUIT' }] }), /vol fictif 2 : le vol_id « PROD1 » est déjà celui du vol fictif 1/);
  // Un même Flight No peut nourrir deux vols fictifs (deux classes).
  assert.equal(W.reglesCompletes({ fictifs: [f, { ...f, volId: 'PROD1C', types: ['CREW'], classe: 'CREW' }] }).fictifs.length, 2);
});

test('le tri ne dépend pas de la langue du navigateur : les vol_id se comparent caractère par caractère', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'ab 1', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'AB 2', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L3', 'Éa 3', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10)));
  assert.deepEqual(r.vols.map(v => v.vol_id), ['AB 2', 'ab 1', 'Éa 3']);
});

test('un vol gardé incomplet refuse le fichier ; une ligne illisible aussi, même annulée ; un vol_id en double après la numérotation', () => {
  assert.throws(() => conv(exp(L('', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10))), /livraison L1 \(NR 101\) : aucune date/);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', ' ', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10))), /livraison L1 \(02\/03\/2026\) : Flight No vide/);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', '', '07:30', 'Delivered', 'ECONOMY', 10))), /livraison L1 \(NR 101, 02\/03\/2026\) : ICAO vide/);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '7h30', 'Cancelled', 'ECONOMY', 10))), /ligne 2 : ETD illisible/);
  // Écartés, ils n'ont besoin de rien.
  assert.equal(conv(exp(L('', 'L1', '', '', '', 'Cancelled', 'ECONOMY', 10), L('02/03/2026', 'L2', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10))).vols.length, 1);
  assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'AB1', 'NRD', '08:00', 'Delivered', 'ECONOMY', 10), L('02/03/2026', 'L2', 'AB1', 'NRD', '09:00', 'Delivered', 'ECONOMY', 10),
    L('02/03/2026', 'L3', 'AB1-2', 'NRD', '10:00', 'Delivered', 'ECONOMY', 10))), /vol_id « AB1-2 » en double le 02\/03\/2026/);
});

test('une Guest qty vide ne compte pas : la première valeur écrite compte ; une quantité se lit en chiffres seulement', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', ''), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 7, 'Pain'),
    L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', '', 'Vin'), L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'BUSINESS', ' 12 ')));
  assert.deepEqual([r.vols[0].nb_YC, r.vols[0].nb_BC, r.rapport.aVerifier.length], [7, 12, 0]);
  for (const q of ['1,000', '1.5', '1e2', '0x10', '-3', 12.5])
    assert.throws(() => conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', q))), /ligne 2 : Guest qty illisible/, String(q));
  // Une ETD d'Excel à 23:59:51 reste à 23:59, le même jour.
  assert.equal(conv(exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', 0.99999, 'Delivered', 'ECONOMY', 1))).vols[0].heure_std, '23:59');
});

test('un texte du fichier ou des règles qui porte le nom d’une propriété d’objet reste un texte', () => {
  const r = conv(exp(L('02/03/2026', 'L1', 'NR 101', 'constructor', '07:30', '__proto__', 'ECONOMY', 10), L('02/03/2026', 'L2', 'NR 102', 'toString', '08:30', 'constructor', 'ECONOMY', 10),
    L('02/03/2026', 'L3', 'NR 103', '__proto__', '09:30', 'Delivered', 'ECONOMY', 10)), JSON.parse('{"compagnies":{"__proto__":"ZZ"}}'));
  assert.deepEqual(r.vols.map(v => v.compagnie), ['constructor', 'toString', 'ZZ']);
  assert.deepEqual(Object.entries(r.rapport.parStatut), [['__proto__', 1], ['constructor', 1], ['Delivered', 1]]);
  assert.ok(W.versCsv(r.vols).indexOf('function') < 0);
  const f = { flightNo: 'PROD', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY'] };
  for (const classe of ['constructor', 'toString', ['BC']]) assert.throws(() => W.reglesCompletes({ fictifs: [{ ...f, classe }] }), /vol fictif 1 : classe inconnue/);
});

test('des règles forgées (une sauvegarde, un réglage de l’outil) sont refusées en nommant la règle', () => {
  const f = { flightNo: 'PROD', compagnie: 'PROD', volId: 'PROD1', heure: '10:00', types: ['ECONOMY'] };
  const cas = [
    [[], /un objet est attendu/], ['texte', /un objet est attendu/],
    [{ flightNoExclu: ['X'] }, /règle inconnue « flightNoExclu »/],
    [{ statutsExclus: 'Cancelled' }, /statuts exclus : une liste/], [{ icaoExclus: [''] }, /ICAO exclus : une liste/],
    [{ flightNoExclus: ['x'.repeat(121)] }, /Flight No exclus : une liste/],
    [{ types: { ECONOMY: 'XX' } }, /Guest types : « ECONOMY » → « XX », classe inconnue/],
    [{ types: { eco: 'YC', 'ECO ': 'PC' } }, /Guest types : « ECO » en double/],
    [{ compagnies: { NRD: 'A;B' } }, /codes compagnie : « NRD »/], [{ compagnies: { NRD: 'A\rB' } }, /codes compagnie : « NRD »/],
    [{ motReserve: '' }, /mot des réserves/], [{ motReserve: 7 }, /mot des réserves/],
    [{ fictifs: Array.from({ length: 51 }, (_, i) => ({ ...f, volId: 'P' + i })) }, /vols fictifs : une liste/],
    [{ fictifs: [{ ...f, heure: 0.5 }] }, /vol fictif 1 : l’heure/], [{ fictifs: [{ ...f, heure: '25:00' }] }, /vol fictif 1 : l’heure/],
    [{ fictifs: [{ ...f, types: [] }] }, /vol fictif 1 : au moins un Guest type/], [{ fictifs: [{ ...f, flightNo: '' }] }, /vol fictif 1 : le Flight No/],
    [{ fictifs: [{ ...f, volid: 'X' }] }, /vol fictif 1 : champ inconnu « volid »/], [{ fictifs: [null] }, /vol fictif 1 : un objet/]
  ];
  for (const [regles, attendu] of cas) assert.throws(() => W.reglesCompletes(regles), attendu, JSON.stringify(regles));
  // Les défauts ne se changent pas par mégarde.
  assert.throws(() => W.REGLES_DEFAUT.statutsExclus.push('Delivered'));
  assert.ok(Object.isFrozen(W.REGLES_DEFAUT.types) && Object.isFrozen(W.REGLES_DEFAUT.fictifs));
  // Les règles complètes se relisent à l'identique.
  const R = W.reglesCompletes({ fictifs: [f], compagnies: { NRD: 'NORD' } });
  assert.deepEqual(W.reglesCompletes(JSON.parse(JSON.stringify(R))), R);
});

test('l’onglet « Flights » d’un classeur ; une seule feuille, ou un CSV : la table elle-même', () => {
  const t = exp(L('02/03/2026', 'L1', 'NR 101', 'NRD', '07:30', 'Delivered', 'ECONOMY', 10));
  assert.equal(W.lignesDeLExport([{ nom: 'Summary', lignes: [['x']] }, { nom: 'flights', lignes: t }]), t);
  assert.equal(W.lignesDeLExport([{ nom: 'export.csv', lignes: t }]), t);
  assert.throws(() => W.lignesDeLExport([{ nom: 'A', lignes: t }, { nom: 'B', lignes: t }]), /onglet « Flights » absent/);
});

test('50 000 lignes fictives se convertissent en moins de 10 s', () => {
  const lignes = [TETE];
  for (let j = 1; j <= 30; j++) for (let v = 0; v < 60; v++) for (let k = 0; k < 28; k++)
    lignes.push(L(String(j).padStart(2, '0') + '/03/2026', 'D' + j + '-' + v, 'NR ' + (100 + v), 'NRD', String(5 + (v % 18)).padStart(2, '0') + ':' + String((v * 7) % 60).padStart(2, '0'),
      'Delivered', ['ECONOMY', 'BUSINESS', 'CREW', 'ECO SPML'][k % 4], 10 + (v % 5), 'Article ' + k));
  assert.ok(lignes.length > 50000);
  const t = Date.now(), r = conv(lignes), ms = Date.now() - t;
  assert.ok(ms < 10000, ms + ' ms');
  assert.equal(r.vols.length, 30 * 60);
});

test('un an d’export, avec des réserves et des vols fictifs chaque jour, en moins de 3 s', () => {
  const lignes = [TETE], fictifs = Array.from({ length: 10 }, (_, i) => ({ flightNo: 'PROD ' + i, compagnie: 'PROD', volId: 'PROD' + i, heure: '10:00', types: ['ECONOMY'] }));
  const jour = j => { const d = new Date(Date.UTC(2026, 0, 1 + j)); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  for (let j = 0; j < 365; j++) {
    for (let v = 0; v < 60; v++) for (const t of ['ECONOMY', 'BUSINESS', 'CREW'])
      lignes.push(L(jour(j), 'D' + j + '-' + v, 'NR ' + (100 + v), 'NR' + (v % 6), String(5 + (v % 18)).padStart(2, '0') + ':00', 'Delivered', t, 10));
    for (let c = 0; c < 6; c++) lignes.push(L(jour(j), 'R' + j + '-' + c, 'NR' + c + ' RESERVE', 'NR' + c, '04:00', 'Delivered', 'ECONOMY', 2));
    for (let i = 0; i < 10; i++) lignes.push(L(jour(j), 'P' + j + '-' + i, 'PROD ' + i, 'PRD', '01:00', 'Cancelled', 'ECONOMY', 3));
  }
  const t = Date.now(), r = conv(lignes, { fictifs }), ms = Date.now() - t;
  assert.ok(ms < 3000, ms + ' ms');
  assert.deepEqual([r.vols.length, r.rapport.reservesFondues.length, r.rapport.fictifs.length], [365 * 70, 365 * 6, 3650]);
});
