/* Banc d'essai, correction 9 — les heures sup en minutes × personnes (v1) :
 * `heuresSupPersonnes`. D'une plonge à tunnels, seules les personnes des
 * tunnels qui finissent un vol après la fin de sa présence restent, chacun
 * jusqu'à la fin de son dernier vol ; `heuresSup` reste, par personne, l'heure
 * où l'équipe part. Toute autre équipe : heures sup × personnes
 * (docs/BANC_ESSAI.md § 2). Vols, compagnies et équipes fictifs. */
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

test('9 personnes, trois tunnels de 3 : un seul tunnel finit un vol 40 min après la présence', () => {
  // Le vol arrive à 15:10 : lavé de 15:10 à 16:40, dans un seul tunnel. Les 6 autres personnes partent à 16:00.
  const r = jouer([ret('R1', '14:40')], [plonge()]);
  assert.deepEqual(hs(r, 'pl'), [40, 120]);
});

test('deux tunnels qui finissent 40 et 10 min après la présence : 150 min × personnes', () => {
  // R1 à 14:40 (fini à 16:10), R2 à 15:10 (fini à 16:40), chacun dans son tunnel.
  const r = jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge()]);
  assert.deepEqual(r.lots.filter(l => l.retourVol).map(l => [l.vol, l.tunnel, P.hhmm(l.fin)]), [['R1', 1, '16:10'], ['R2', 2, '16:40']]);
  assert.deepEqual(hs(r, 'pl'), [40, 150], 'heuresSup : la dernière personne part 40 min après sa présence');
  // Un tunnel de 2 personnes : (40 × 2) + (10 × 3).
  const deux = jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge({ tunnels: [tunnel('T1'), tunnel('T2', { personnes: 2 }), tunnel('T3')] })]);
  assert.deepEqual(hs(deux, 'pl'), [40, 110]);
});

test('un tunnel à vitesse 2 suit la même règle', () => {
  // T1 lave deux fois plus vite : le vol arrivé à 15:55 en sort à 16:40.
  const r = jouer([ret('R1', '15:25')], [plonge({ tunnels: [tunnel('T1', { vitesse: 2 }), tunnel('T2'), tunnel('T3')] })]);
  assert.deepEqual(r.lots.filter(l => l.retourVol).map(l => [l.tunnel, P.hhmm(l.debut), P.hhmm(l.fin)]), [[1, '15:55', '16:40']]);
  assert.deepEqual(hs(r, 'pl'), [40, 120]);
});

test('une plonge sans liste de tunnels compte toutes ses personnes ; une équipe à la main : heures sup × personnes', () => {
  const sans = jouer([ret('R1', '14:40')], [plonge({ personnes: 4, tunnels: [] })]);
  assert.deepEqual(hs(sans, 'pl'), [40, 160]);
  // Deux personnes, 1 040 minutes-personne de travail : de 08:20 à 17:00, 40 min après la fin de leur présence, chacune.
  const main = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '08:20', jour: 0, personnes: 2, pauses: [], lots: [['NORD/YC']],
    regime: { actif: true, seuils: [], presence: 480 }, minutes: { 'NORD/YC': 1040 } };
  const r = jouer([], [main], { ...SUP, parcours: [{ id: 'c', nom: 'Prépa', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c' } });
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
  const etat = { schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [plonge()] }), parcours: [] };
  const ctx = r => ({ services: [{ id: 'plonge', nom: 'PLONGE' }], classes: [], resultat: r });
  const avec = E.recapCasesVersClasseur(etat, ctx(jouer([ret('R1', '14:10'), ret('R2', '14:40')], [plonge()]))).find(f => f.nom === 'Cases').lignes;
  const col = avec[0].indexOf('Heures sup (h × pers.) (info)');
  assert.ok(col > 0);
  assert.equal(avec[1][col], 2.5, '150 min × personnes');
  const sans = E.recapCasesVersClasseur(etat, ctx(jouer([ret('R1', '10:10')], [plonge()]))).find(f => f.nom === 'Cases').lignes;
  assert.equal(sans[0].includes('Heures sup (h × pers.) (info)'), false, 'le classeur d’avant');
});
