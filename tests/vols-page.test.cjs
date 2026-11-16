/* Évolution 19 (e) — la page des vols montre les vols. Le module vols-page.js
 * reconnaît le format d'un fichier de vols (le modèle CSV, le CSV daté,
 * l'export de l'ERP, le classeur des vols) d'après ses en-têtes, dit lequel,
 * et refuse un format inconnu en le disant ; il dresse le tableau des vols du
 * jour (vol, compagnie, heure de départ, passagers par classe), trié par
 * heure, avec une recherche. Il ne lit ni ne change aucun vol : la lecture
 * reste celle de la page et des outils.
 * Aucune donnée de l'unité : des vols et des compagnies fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../vols-page.js');
const UI = require('../ui-model.js');
const W = require('../moteur/import-flights.js');

const MODELE = 'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  + 'SU2,SUD,MOYEN,DEP,14:30,,4,0,90,5,1\nNO1,NORD,MOYEN,DEP,06:15,,0,12,100,4,0\nNO2,NORD,GROS,DEP,14:30,,8,20,180,9,2\n'
  + 'ES1,EST,MOYEN,DEP,09:00,,0,0,80,4,0\nNO-R1,NORD,MOYEN,RET,,08:00,0,0,100,4,0\n';
const DATE = 'date;vol_id;compagnie;type_avion;sens;heure_std;heure_sta;nb_BC;nb_PC;nb_YC;nb_CREW\n'
  + '2031-03-03;NO1;NORD;MOYEN;DEP;06:15;;0;12;100;4\n2031-03-04;NO1;NORD;MOYEN;DEP;06:15;;0;10;90;4\n';
const ERP = [Object.values(W.ENTETES), ['03/03/2031', 'L1', 'NO 101', 'NOR', '06:15', 'Confirmed', 'ECO', 100]];

test('les formats que « Importer des vols » reconnaît, avec leurs mots', () => {
  assert.deepEqual(Object.values(V.FORMATS).map(f => [f.id, f.nom]),
    [['modele', 'modèle CSV'], ['date', 'CSV daté'], ['erp', 'export de l’ERP'], ['classeur', 'classeur des vols']]);
});

test('un CSV se reconnaît à ses en-têtes : le modèle, le CSV daté, l’export de l’ERP', () => {
  assert.equal(V.reconnaitre({ nom: 'vols.csv', texte: MODELE }).format, 'modele');
  assert.equal(V.reconnaitre({ nom: 'programme.csv', texte: DATE }).format, 'date');
  const erp = Object.values(W.ENTETES).join(',') + '\n03/03/2031,L1,NO 101,NOR,06:15,Confirmed,ECO,100\n';
  assert.equal(V.reconnaitre({ nom: 'export.csv', texte: erp }).format, 'erp');
  // Les en-têtes se lisent comme la page les lit : une marque d'ordre en tête, des guillemets, des majuscules, des espaces, un « ; ».
  assert.equal(V.reconnaitre({ nom: 'a.csv', texte: '﻿"Vol_ID" ; "Compagnie";SENS\nX1;NORD;DEP\n' }).format, 'modele');
  assert.equal(V.reconnaitre({ nom: 'a.csv', texte: '\n\nDATE,VOL_ID,sens\n' }).format, 'date');
  assert.equal(V.reconnaitre({ nom: 'a.csv', texte: 'Flight  No,Delivery No\n' }).format, 'erp');
  // Ce que la reconnaissance a lu : les en-têtes, pour le dire dans un refus.
  assert.deepEqual(V.reconnaitre({ nom: 'vols.csv', texte: MODELE }).entetes.slice(0, 4), ['vol_id', 'compagnie', 'type_avion', 'sens']);
});

test('ce que la reconnaissance annonce, le lecteur de la page le lit', () => {
  // Le modèle et le CSV daté reconnus se lisent par le lecteur des vols ; l'export reconnu porte les colonnes que la conversion attend.
  assert.equal(UI.parseFlights(MODELE, { eta: true, spmlParCabine: true, date: true }).length, 5);
  assert.equal(UI.parseFlights(DATE, { eta: true, spmlParCabine: true, date: true }).length, 2);
  assert.equal(V.reconnaitre({ nom: 'export.xlsx', feuilles: [{ nom: 'Flights', lignes: ERP }] }).format, 'erp');
  assert.equal(W.lignesDeLExport([{ nom: 'Flights', lignes: ERP }]), ERP);
});

test('un classeur : l’onglet « Flights » de l’export, les feuilles « Départs » et « Retours », ou une seule table', () => {
  const tete = MODELE.split('\n')[0].split(',');
  assert.equal(V.reconnaitre({ nom: 'export.xlsx', feuilles: [{ nom: 'Lisez-moi', lignes: [['x']] }, { nom: 'FLIGHTS', lignes: ERP }] }).format, 'erp');
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Départs', lignes: [tete] }, { nom: 'Retours', lignes: [tete] }] }).format, 'classeur');
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Departs', lignes: [tete] }] }).format, 'classeur');
  // Une seule table : ses en-têtes décident, comme pour un CSV.
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Feuil1', lignes: [tete, ['NO1']] }] }).format, 'modele');
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Feuil1', lignes: [['date'].concat(tete)] }] }).format, 'date');
  assert.equal(V.reconnaitre({ nom: 'export.xlsx', feuilles: [{ nom: 'Feuil1', lignes: ERP }] }).format, 'erp');
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Vols', lignes: [tete] }, { nom: 'Notes', lignes: [['x']] }] }).format, 'modele');
  assert.equal(V.reconnaitre({ nom: 'vols.xlsx', feuilles: [{ nom: 'Feuil1', lignes: [tete] }] }).excel, true);
  assert.equal(V.reconnaitre({ nom: 'vols.csv', texte: MODELE }).excel, false);
});

test('le format reconnu se dit en une phrase', () => {
  const dit = (o) => V.phrase(V.reconnaitre(o));
  assert.equal(dit({ nom: 'vols.csv', texte: MODELE }), 'Format reconnu : le modèle CSV (les vols d’une journée).');
  assert.equal(dit({ nom: 'programme.csv', texte: DATE }), 'Format reconnu : le CSV daté (un programme sur plusieurs jours).');
  assert.equal(dit({ nom: 'export.xlsx', feuilles: [{ nom: 'Flights', lignes: ERP }] }), 'Format reconnu : l’export de l’ERP (Winrest, onglet « Flights »).');
  assert.equal(dit({ nom: 'export.csv', texte: 'Flight No,Delivery No\n' }), 'Format reconnu : l’export de l’ERP (Winrest), en CSV.');
  assert.equal(dit({ nom: 'vols.xlsx', feuilles: [{ nom: 'Départs', lignes: [['vol_id']] }] }), 'Format reconnu : le classeur des vols (feuilles « Départs » et « Retours »).');
  // Les colonnes du modèle dans un classeur Excel : le même format, dit sans « CSV ».
  assert.equal(dit({ nom: 'vols.xlsx', feuilles: [{ nom: 'Feuil1', lignes: [['vol_id', 'sens']] }] }), 'Format reconnu : les colonnes du modèle, dans un classeur Excel (les vols d’une journée).');
  assert.equal(dit({ nom: 'vols.xlsx', feuilles: [{ nom: 'Feuil1', lignes: [['date', 'vol_id']] }] }), 'Format reconnu : les colonnes du modèle daté, dans un classeur Excel (un programme sur plusieurs jours).');
});

test('un format inconnu est refusé, et le refus dit ce qui a été lu', () => {
  const vu = V.reconnaitre({ nom: 'inventaire.csv', texte: 'article;quantite;date\nplateau;40;2031-03-03\n' });
  assert.equal(vu.format, null);
  assert.equal(V.refus('inventaire.csv', vu), 'Format non reconnu : « inventaire.csv » n’est ni le modèle CSV, ni le CSV daté, ni l’export de l’ERP. '
    + 'Colonnes lues : article, quantite, date. Aucune donnée remplacée.');
  // Un fichier vide, un classeur sans table.
  assert.equal(V.refus('vide.csv', V.reconnaitre({ nom: 'vide.csv', texte: '\n\n' })),
    'Format non reconnu : « vide.csv » n’est ni le modèle CSV, ni le CSV daté, ni l’export de l’ERP. Le fichier est vide. Aucune donnée remplacée.');
  assert.equal(V.reconnaitre({ nom: 'x.xlsx', feuilles: [] }).format, null);
  assert.equal(V.reconnaitre({ nom: 'x.xlsx', feuilles: [{ nom: 'A', lignes: [['article', 'quantite']] }] }).format, null);
  // Beaucoup de colonnes : le refus n'en cite que les premières.
  const large = V.reconnaitre({ nom: 'large.csv', texte: Array.from({ length: 30 }, (_, i) => 'c' + i).join(',') + '\n' });
  assert.match(V.refus('large.csv', large), /Colonnes lues : c0, c1, c2, c3, c4, c5, c6, c7… \(30 colonnes\)\. Aucune donnée remplacée\.$/);
});

const vols = () => UI.parseFlights(MODELE, { eta: true, spmlParCabine: true, date: true });

test('les vols du jour : les départs, triés par heure (puis par vol), avec leurs passagers par classe', () => {
  const r = V.lignes(vols());
  assert.equal(r.total, 4, 'les départs ; un retour n’est pas un vol à préparer');
  assert.deepEqual(r.lignes.map(l => [l.heure, l.id, l.cie]), [['06:15', 'NO1', 'NORD'], ['09:00', 'ES1', 'EST'], ['14:30', 'NO2', 'NORD'], ['14:30', 'SU2', 'SUD']]);
  assert.deepEqual(r.lignes[2], { id: 'NO2', cie: 'NORD', heure: '14:30', minutes: 870, bc: 8, pc: 20, yc: 180, crew: 9 });
  // La liste d'origine n'est pas modifiée.
  const l = vols(), avant = JSON.stringify(l);
  V.lignes(l, 'nord');
  assert.equal(JSON.stringify(l), avant);
});

test('la recherche : un numéro de vol ou une compagnie, sans tenir compte des majuscules ni des accents', () => {
  const de = q => V.lignes(vols(), q).lignes.map(l => l.id);
  assert.deepEqual(de('nord'), ['NO1', 'NO2']);
  assert.deepEqual(de('  SU2 '), ['SU2']);
  assert.deepEqual(de('o'), ['NO1', 'NO2'], 'un morceau du numéro ou de la compagnie');
  assert.deepEqual(de('ouest'), []);
  assert.deepEqual(de(''), ['NO1', 'ES1', 'NO2', 'SU2']);
  assert.equal(V.lignes(vols(), 'nord').total, 4, 'le total reste celui du jour');
  const accent = [{ id: 'ÉT1', cie: 'ÉTOILE', sens: 'DEP', std: 600, bc: 0, pc: 0, yc: 10, crew: 2 }];
  assert.deepEqual(V.lignes(accent, 'etoile').lignes.map(l => l.id), ['ÉT1']);
});

test('le tableau : vol, compagnie, heure de départ, passagers par classe ; le texte importé est échappé', () => {
  const html = V.tableau(V.lignes(vols()));
  assert.match(html, /<table class="flight-table vp-table">/);
  assert.deepEqual([...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]), ['Départ', 'Vol', 'Compagnie', 'Business', 'Premium', 'Économie', 'Équipage']);
  assert.equal((html.match(/<tr data-vol=/g) || []).length, 4);
  assert.match(html, /<tr data-vol="NO2"><td class="vp-heure">14:30<\/td><th scope="row">NO2<\/th><td>NORD<\/td><td class="num">8<\/td><td class="num">20<\/td><td class="num">180<\/td><td class="num">9<\/td><\/tr>/);
  const mechant = V.tableau(V.lignes([{ id: '<img src=x onerror=alert(1)>', cie: 'A&B"', sens: 'DEP', std: 60, bc: 0, pc: 0, yc: 1, crew: 0 }]));
  assert.doesNotMatch(mechant, /<img/);
  assert.match(mechant, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(mechant, /A&amp;B&quot;/);
});

test('le tableau dit quand il n’a rien à montrer', () => {
  assert.match(V.tableau(V.lignes([])), /<p class="vp-vide">Aucun vol : importez votre programme\.<\/p>/);
  assert.match(V.tableau(V.lignes(vols(), 'ouest')), /<p class="vp-vide">Aucun vol ne correspond à « ouest »\.<\/p>/);
  assert.doesNotMatch(V.tableau(V.lignes(vols(), 'ouest')), /<table/);
  // Le compte, au-dessus du tableau.
  assert.equal(V.compte(V.lignes(vols())), '4 départs');
  assert.equal(V.compte(V.lignes(vols(), 'nord')), '2 départs sur 4');
  assert.equal(V.compte(V.lignes(vols().slice(0, 1))), '1 départ');
  assert.equal(V.compte(V.lignes([])), 'aucun départ');
});
