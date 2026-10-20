/* Banc d'essai, correction 4 — en heures sup, on ne paie personne à attendre
 * (v1) : passé la fin de sa présence, une équipe finit le lot commencé, puis
 * n'enchaîne que les lots déjà prêts ; dès qu'elle devrait attendre, elle
 * part, et les lots restants sont hors poste. Pendant la présence, l'attente
 * reste normale. La même règle vaut pour un robot et pour un renfort en heures
 * sup (docs/BANC_ESSAI.md § 2). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const vol = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Une heure de travail par vol, pour une personne, en prépa comme en cuisine.
const BAREME = { prepa: { '*/YC': 60 }, cuisine: { '*/YC': 60 } };
const VOLS = ['NORD', 'SUD', 'EST', 'OUEST'].map((c, i) => vol(c.slice(0, 2) + '1', c, P.hhmm(h('20:00') + i * 10)));
// NORD et SUD : la prépa seulement. EST et OUEST : la cuisine d'abord, puis la prépa.
const CHEMINS = { parcours: [{ id: 'c1', nom: 'Prépa', noeuds: ['prepa'], liens: [] },
  { id: 'c2', nom: 'Cuisine puis prépa', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }],
  parcoursCabine: { YC: 'c1' }, parcoursClasse: { 'EST/YC': 'c2', 'OUEST/YC': 'c2' } };
const equipe = (id, service, debut, presence, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, pauses: [], lots,
  regime: { actif: true, seuils: [], presence }, ...p });
// La cuisine livre EST à 14:00 (elle commence à 13:00).
const CUISINE = (debut = '13:00') => equipe('cu', 'cuisine', debut, 480, [['EST/YC'], ['OUEST/YC']]);
const SUP = { heuresSup: { actif: true, plafond: 180 } };
const jouer = (ateliers, plus = {}) => P.simuler({ vols: VOLS, liaisons: [{ from: 'cuisine', to: 'prepa' }], bareme: BAREME, rendement: 1, ateliers, ...CHEMINS, ...plus });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const lignes = (r, id) => vue(r, id).lots.map(l => [l.nom, P.hhmm(l.debut), l.fin == null ? null : P.hhmm(l.fin), !!l.horsPoste]);

test('une équipe dont le dernier lot n’est prêt que 2 h après sa présence part à la fin de sa présence, sans heure sup', () => {
  // La prépa : de 08:00 à 12:00 ; NORD, puis EST, que la cuisine livre à 14:00.
  const r = jouer([equipe('pr', 'prepa', '08:00', 240, [['NORD/YC'], ['EST/YC']]), CUISINE()], SUP);
  assert.deepEqual(lignes(r, 'pr'), [['NORD/YC', '08:00', '09:00', false], ['EST/YC', '12:00', null, true]], 'EST est hors poste');
  assert.equal(vue(r, 'pr').heuresSup, 0);
  assert.equal(vue(r, 'pr').lots[1].attente, h('12:00') - h('09:00'), 'son attente pendant la présence');
  assert.equal(r.parClasse['EST/YC'].aHeure, false);
  // Sans heures sup, comme avant : elle attend la livraison, puis le lot est hors poste.
  const sans = jouer([equipe('pr', 'prepa', '08:00', 240, [['NORD/YC'], ['EST/YC']]), CUISINE()]);
  assert.deepEqual(lignes(sans, 'pr'), [['NORD/YC', '08:00', '09:00', false], ['EST/YC', '14:00', null, true]]);
  assert.equal(vue(sans, 'pr').heuresSup, 0);
});

test('une équipe qui finit un lot commencé, 40 min après la fin de sa présence, a 40 min d’heures sup', () => {
  // De 08:00 à 09:20 : NORD jusqu'à 09:00, puis SUD, commencé à 09:00, fini à 10:00.
  const r = jouer([equipe('pr', 'prepa', '08:00', 80, [['NORD/YC'], ['SUD/YC']])], SUP);
  assert.deepEqual(lignes(r, 'pr'), [['NORD/YC', '08:00', '09:00', false], ['SUD/YC', '09:00', '10:00', false]]);
  assert.equal(vue(r, 'pr').heuresSup, 40);
});

test('une équipe qui a un lot prêt à la fin de sa présence le fait en heures sup, puis part au premier lot pas prêt', () => {
  // De 08:00 à 09:00 : NORD ; SUD est prêt à 09:00 (fait jusqu'à 10:00) ; EST, livré à 14:00, ne l'est pas.
  const r = jouer([equipe('pr', 'prepa', '08:00', 60, [['NORD/YC'], ['SUD/YC'], ['EST/YC']]), CUISINE()], SUP);
  assert.deepEqual(lignes(r, 'pr'), [['NORD/YC', '08:00', '09:00', false], ['SUD/YC', '09:00', '10:00', false], ['EST/YC', '10:00', null, true]]);
  assert.equal(vue(r, 'pr').heuresSup, 60, 'du travail seulement');
  // Livré à 09:30, pendant SUD : prêt quand SUD finit, il est fait à la suite.
  const tot = jouer([equipe('pr', 'prepa', '08:00', 60, [['NORD/YC'], ['SUD/YC'], ['EST/YC']]), CUISINE('08:30')], SUP);
  assert.deepEqual(lignes(tot, 'pr').map(l => l[0] + ' ' + l[2]), ['NORD/YC 09:00', 'SUD/YC 10:00', 'EST/YC 11:00']);
  assert.equal(vue(tot, 'pr').heuresSup, 120);
});

test('un robot suit la même règle : il ne garde pas sa ligne à attendre', () => {
  const robot = (presence, lots) => ({ id: 'ro', nom: 'Robot', service: 'prepa', type: 'robot', debut: '08:00', jour: 0, personnes: 1, personnesMin: 1, debit: 100,
    pauses: [], lots, regime: { actif: true, seuils: [], presence } });
  const r = jouer([robot(240, [['NORD/YC'], ['EST/YC']]), CUISINE()], SUP);
  const ro = vue(r, 'ro');
  assert.deepEqual([ro.lots[1].nom, P.hhmm(ro.lots[1].debut), ro.lots[1].horsPoste, ro.heuresSup], ['EST/YC', '12:00', true, 0]);
  // Un lot prêt à la fin de sa présence : il le fait en heures sup.
  const pret = jouer([robot(30, [['NORD/YC'], ['SUD/YC']])], SUP);
  assert.ok(vue(pret, 'ro').heuresSup > 0);
  assert.ok(vue(pret, 'ro').lots.every(l => !l.impossible));
});

test('un renfort en heures sup n’attend pas avec l’équipe qu’il aide', () => {
  // A : NORD et SUD (08:00 → 10:00), présente jusqu'à 11:00, puis aide B. B : EST (trois vols), que la cuisine ne livre qu'à
  // 17:00 (OUEST de 13:00 à 14:00, puis EST), puis OUEST ; présente jusqu'à 13:00. A peut rester en heures sup (versHeuresSup).
  const vols = VOLS.concat([vol('ES2', 'EST', '20:40'), vol('ES3', 'EST', '20:50')]);
  const r = P.simuler({ vols, liaisons: [{ from: 'cuisine', to: 'prepa' }], bareme: BAREME, rendement: 1, ...CHEMINS, ...SUP,
    ateliers: [equipe('ma', 'prepa', '08:00', 180, [['NORD/YC'], ['SUD/YC']]), equipe('mb', 'prepa', '08:00', 300, [['EST/YC'], ['OUEST/YC']]),
      equipe('cu', 'cuisine', '13:00', 480, [['OUEST/YC'], ['EST/YC']])],
    renforts: { actif: true, versHeuresSup: true, delai: 10, efficacite: 0.8 } });
  // B attend EST jusqu'à la fin de sa présence, et part. A, venu à 10:00, attend avec B jusqu'à 11:00, la fin de sa présence,
  // puis part : pas une minute d'heures sup à attendre (avant : il restait jusqu'à 14:00, au bout de son plafond).
  assert.equal(vue(r, 'ma').renfortsHeuresSup, 0);
  assert.equal(vue(r, 'ma').renfortsPretes, 60);
  assert.deepEqual([vue(r, 'mb').heuresSup, vue(r, 'mb').lots[0].horsPoste], [0, true]);
});
