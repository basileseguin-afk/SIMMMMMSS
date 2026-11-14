/* Banc d'essai, correction 9 — les heures sup en minutes × personnes (v1) :
 * `heuresSupPersonnes` ; `heuresSup` reste, par personne, l'heure où l'équipe
 * part. Toute équipe : heures sup × personnes. Une plonge par vol n'en fait
 * plus (évolution 18) : à la fin de sa présence, elle passe le relais du vol en
 * cours ou l'arrête — avant, les personnes des tunnels qui finissaient un vol
 * restaient, chacun jusqu'à la fin de son dernier vol (docs/BANC_ESSAI.md § 2).
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
// Un retour arrive à la plonge 30 min après son atterrissage.
const ret = (id, sta) => ({ id, cie: 'NORD', sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, std) => ({ id, cie: 'NORD', sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// La plonge : 08:00 à 16:00, 9 personnes, trois tunnels de 3, 90 min par vol.
const tunnel = (nom, p) => ({ nom, debit: 300, personnes: 3, actif: true, ...p });
const plonge = p => ({ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '08:00', jour: 0, personnes: 9, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence: 480 }, parVol: true, durees: { '*': 90 }, tunnels: [tunnel('T1'), tunnel('T2'), tunnel('T3')], plafond: 0, ...p });
const SUP = { heuresSup: { actif: true, plafond: 120 } };
const jouer = (vols, ateliers, plus = SUP) => P.simuler({ vols: [dep('NO1', '12:00'), ...vols], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
  ateliers, materiel: { actif: false, delaiRetour: 30 }, ...plus });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const hs = (r, id) => [vue(r, id).heuresSup, vue(r, id).heuresSupPersonnes];

const coupes = r => r.lots.filter(l => l.retourVol).map(l => [l.vol, l.tunnel, P.hhmm(l.debut), l.fin, l.fait, l.reste]);

test('9 personnes, trois tunnels de 3 : le vol en cours à la fin de la présence s’arrête, personne ne reste', () => {
  // Le vol arrive à 15:10 : lavé de 15:10 à 16:00 dans un seul tunnel, 50 min sur 90. Avant l'évolution 18, les 3 personnes
  // de ce tunnel restaient jusqu'à 16:40 : [40, 120].
  const r = jouer([ret('R1', '14:40')], [plonge()]);
  assert.deepEqual(hs(r, 'pl'), [0, 0]);
  assert.deepEqual(coupes(r), [['R1', 1, '15:10', null, 50, 40]]);
  assert.deepEqual(r.saleFinal, [{ vol: 'R1', cie: 'NORD', unites: 190, reste: 40 }], 'il passe au lendemain, pour 40 min');
});

test('deux tunnels en cours à la fin de la présence : chacun s’arrête, avec sa durée restante', () => {
  // R1 à 14:40 (80 min lavées, 10 restent), R2 à 15:10 (50 min lavées, 40 restent), chacun dans son tunnel. Avant
  // l'évolution 18 : finis à 16:10 et 16:40, [40, 150] ; avec un tunnel de 2 personnes, [40, 110].
  const r = jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge()]);
  assert.deepEqual(coupes(r), [['R1', 1, '14:40', null, 80, 10], ['R2', 2, '15:10', null, 50, 40]]);
  assert.deepEqual(hs(r, 'pl'), [0, 0]);
  const deux = jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge({ tunnels: [tunnel('T1'), tunnel('T2', { personnes: 2 }), tunnel('T3')] })]);
  assert.deepEqual(hs(deux, 'pl'), [0, 0]);
});

test('un tunnel à vitesse 2 suit la même règle', () => {
  // T1 lave deux fois plus vite : le vol arrivé à 15:55 en sortirait à 16:40. À 16:00, 5 min de tunnel sont faites (10 min
  // d'un tunnel normal) : il en reste 80. Avant l'évolution 18 : fini à 16:40, [40, 120].
  const r = jouer([ret('R1', '15:25')], [plonge({ tunnels: [tunnel('T1', { vitesse: 2 }), tunnel('T2'), tunnel('T3')] })]);
  assert.deepEqual(coupes(r), [['R1', 1, '15:55', null, 5, 80]]);
  assert.deepEqual(hs(r, 'pl'), [0, 0]);
});

// Deux personnes à la main, 1 040 minutes-personne de travail : de 08:20 à 17:00, 40 min après la fin de leur présence, chacune.
const MAIN = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '08:20', jour: 0, personnes: 2, pauses: [], lots: [['NORD/YC']],
  regime: { actif: true, seuils: [], presence: 480 }, minutes: { 'NORD/YC': 1040 } };
const CHEMIN = { parcours: [{ id: 'c', nom: 'Prépa', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c' } };

test('une plonge sans liste de tunnels n’en fait pas non plus ; une équipe à la main : heures sup × personnes', () => {
  // Avant l'évolution 18 : ses 4 personnes restaient 40 min, [40, 160].
  const sans = jouer([ret('R1', '14:40')], [plonge({ personnes: 4, tunnels: [] })]);
  assert.deepEqual(hs(sans, 'pl'), [0, 0]);
  const r = jouer([], [MAIN], { ...SUP, ...CHEMIN });
  assert.deepEqual(hs(r, 'mo'), [40, 80]);
  // La plonge au débit s'arrête à la fin de sa présence (correction 7) : 0.
  const debit = jouer([ret('R1', '14:40')], [plonge({ parVol: false })], { ...SUP, materiel: { actif: true, delaiRetour: 30, stockInitial: 5000 } });
  assert.deepEqual(hs(debit, 'pl'), [0, 0]);
});

test('sans l’option des heures sup : 0, pour toutes les équipes', () => {
  const r = jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge()], {});
  assert.ok(r.ateliers.every(a => a.heuresSup === 0 && a.heuresSupPersonnes === 0));
  // Une plonge conditionnelle fermée aussi.
  const nuit = plonge({ id: 'nuit', nom: 'Nuit', debut: '22:00', condition: { mesure: 'sale', seuil: 99999 } });
  assert.deepEqual(hs(jouer([ret('R1', '14:10')], [plonge(), nuit]), 'nuit'), [0, 0]);
});

/* ---- Excel : le récap des cases ------------------------------------------- */
const E = require('../echanges.js');

test('Excel (le récap des cases) : les heures sup en heures × personnes, seulement quand il y en a', () => {
  // L'équipe à la main (une plonge par vol n'en fait plus, évolution 18 : avant, ses 150 min × personnes donnaient 2,5 h).
  const etat = { schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [MAIN] }), parcours: [] };
  const ctx = r => ({ services: [{ id: 'prepa', nom: 'PRÉPA' }], classes: [], resultat: r });
  const avec = E.recapCasesVersClasseur(etat, ctx(jouer([], [MAIN], { ...SUP, ...CHEMIN }))).find(f => f.nom === 'Cases').lignes;
  const col = avec[0].indexOf('Heures sup (h × pers.) (info)');
  assert.ok(col > 0);
  assert.equal(avec[1][col], 1.33, '80 min × personnes');
  // Sans l'option, elle part à la fin de sa présence : la colonne n'y est pas. Une plonge par vol ne la fait plus venir.
  const sans = E.recapCasesVersClasseur(etat, ctx(jouer([], [MAIN], CHEMIN))).find(f => f.nom === 'Cases').lignes;
  assert.equal(sans[0].includes('Heures sup (h × pers.) (info)'), false, 'le classeur d’avant');
  const plongeSeule = { schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [plonge()] }), parcours: [] };
  const lignes = E.recapCasesVersClasseur(plongeSeule, { services: [{ id: 'plonge', nom: 'PLONGE' }], classes: [], resultat: jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge()]) })
    .find(f => f.nom === 'Cases').lignes;
  assert.equal(lignes[0].includes('Heures sup (h × pers.) (info)'), false, 'une plonge par vol : plus d’heures sup');
});
