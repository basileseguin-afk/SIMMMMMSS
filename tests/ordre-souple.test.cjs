/* Banc d'essai, correction 6 — l'option « ordre souple » (v1) : quand le lot
 * suivant d'une équipe n'est pas prêt (son amont, une mise à disposition), elle
 * prend le premier lot prêt de sa liste, puis revient aux autres quand ils le
 * sont ; aucun lot prêt, elle attend le premier qui le devient. Une règle de
 * calcul (ory-modele-v1), désactivée par défaut, que chaque équipe peut changer
 * pour elle (docs/BANC_ESSAI.md § 8). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');
const R = require('../reglages.js');

const h = s => P.minutes(s);
const vol = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const VOLS = ['NORD', 'SUD', 'EST', 'OUEST'].map((c, i) => vol(c.slice(0, 2) + '1', c, P.hhmm(h('20:00') + i * 10)));
// Une heure par vol. NORD et SUD : la prépa seulement. EST et OUEST : la cuisine d'abord.
const BAREME = { prepa: { '*/YC': 60 }, cuisine: { '*/YC': 60 } };
const CHEMINS = { parcours: [{ id: 'c1', nom: 'Prépa', noeuds: ['prepa'], liens: [] },
  { id: 'c2', nom: 'Cuisine puis prépa', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }],
  parcoursCabine: { YC: 'c1' }, parcoursClasse: { 'EST/YC': 'c2', 'OUEST/YC': 'c2' } };
const equipe = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, pauses: [], lots,
  regime: { actif: false }, ...p });
const cuisine = (debut, lots) => equipe('cu', 'cuisine', debut, lots);
const SOUPLE = { ordreSouple: { actif: true } };
const jouer = (ateliers, plus = {}) => P.simuler({ vols: VOLS, liaisons: [{ from: 'cuisine', to: 'prepa' }], bareme: BAREME, rendement: 1, ateliers, ...CHEMINS, ...plus });
const ordre = (r, id = 'pr') => r.lots.filter(l => l.atelier === id && !l.impossible).map(l => [l.nom, P.hhmm(l.debut), P.hhmm(l.fin)]);
const json = x => JSON.parse(JSON.stringify(x));

test('lot 1 pas prêt, lot 2 prêt : le lot 2 d’abord, le lot 1 ensuite', () => {
  // La cuisine livre EST à 10:00. La prépa commence à 08:00 : EST, puis NORD.
  const unite = [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC']]), cuisine('09:00', [['EST/YC']])];
  assert.deepEqual(ordre(jouer(unite)), [['EST/YC', '10:00', '11:00'], ['NORD/YC', '11:00', '12:00']], 'strict : NORD attend EST');
  const r = jouer(unite, SOUPLE);
  assert.deepEqual(ordre(r), [['NORD/YC', '08:00', '09:00'], ['EST/YC', '10:00', '11:00']]);
  assert.equal(r.lots.find(l => l.atelier === 'pr' && l.nom === 'EST/YC').attente, 60, 'il attend sa livraison après NORD');
  assert.equal(r.parClasse['NORD/YC'].fin, h('09:00'), 'NORD est prête à 09:00 au lieu de 12:00');
});

test('l’ordre de la liste reste la priorité entre lots prêts ; les commandes réunies par « + » restent ensemble', () => {
  // EST livré à 08:30, pendant NORD : à 09:00, EST et SUD sont prêts — EST d'abord, il est avant dans la liste.
  const r = jouer([equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC'], ['SUD/YC']]), cuisine('07:30', [['EST/YC']])], SOUPLE);
  assert.deepEqual(ordre(r), [['NORD/YC', '08:00', '09:00'], ['EST/YC', '09:00', '10:00'], ['SUD/YC', '10:00', '11:00']]);
  // EST + NORD, un seul lot : NORD n'est pas fait seul, il attend EST avec lui.
  const plus = jouer([equipe('pr', 'prepa', '08:00', [['EST/YC', 'NORD/YC'], ['SUD/YC']]), cuisine('09:00', [['EST/YC']])], SOUPLE);
  assert.deepEqual(ordre(plus), [['SUD/YC', '08:00', '09:00'], ['EST/YC + NORD/YC', '10:00', '12:00']]);
});

test('aucun lot prêt : elle attend le premier qui le devient', () => {
  // La cuisine livre OUEST à 10:00, puis EST à 11:00 ; la prépa a EST avant OUEST.
  const unite = [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['OUEST/YC']]), cuisine('09:00', [['OUEST/YC'], ['EST/YC']])];
  assert.deepEqual(ordre(jouer(unite, SOUPLE)), [['OUEST/YC', '10:00', '11:00'], ['EST/YC', '11:00', '12:00']]);
  assert.deepEqual(ordre(jouer(unite)), [['EST/YC', '11:00', '12:00'], ['OUEST/YC', '12:00', '13:00']], 'strict');
});

test('désactivée, la journée est la même qu’avant ; une équipe peut avoir sa règle à elle', () => {
  const unite = (p = {}) => [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC']], p), equipe('p2', 'prepa', '08:00', [['OUEST/YC'], ['SUD/YC']]),
    cuisine('09:00', [['EST/YC'], ['OUEST/YC']])];
  const avant = json(jouer(unite()));
  assert.deepEqual(json(jouer(unite(), { ordreSouple: { actif: false } })), avant);
  assert.deepEqual(json(jouer(unite({ ordreSouple: false }))), avant, 'strict pour elle : comme avant');
  // Rien n'attend : l'ordre souple ne change rien.
  const prete = [equipe('pr', 'prepa', '08:00', [['NORD/YC'], ['SUD/YC']])];
  assert.deepEqual(json(jouer(prete, SOUPLE)), json(jouer(prete)));
  // Souple pour elle seule (la règle générale désactivée) ; ou strict pour elle seule (la règle active).
  const seule = jouer(unite({ ordreSouple: true }));
  assert.deepEqual(ordre(seule).map(x => x[0]), ['NORD/YC', 'EST/YC']);
  assert.deepEqual(ordre(seule, 'p2').map(x => x[0]), ['OUEST/YC', 'SUD/YC'], 'l’autre équipe reste stricte');
  const sauf = jouer(unite({ ordreSouple: false }), SOUPLE);
  assert.deepEqual([ordre(sauf).map(x => x[0]), ordre(sauf, 'p2').map(x => x[0])], [['EST/YC', 'NORD/YC'], ['SUD/YC', 'OUEST/YC']]);
});

test('avec les heures sup : en heures sup, aucun lot prêt, elle part (correction 4)', () => {
  // De 08:00 à 09:00, NORD ; EST et OUEST ne sont livrés qu'après : elle ne les attend pas en heures sup.
  const unite = [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC'], ['OUEST/YC']], { regime: { actif: true, seuils: [], presence: 60 } }),
    cuisine('09:30', [['EST/YC'], ['OUEST/YC']])];
  const r = jouer(unite, { ...SOUPLE, heuresSup: { actif: true, plafond: 180 } });
  assert.deepEqual(ordre(r), [['NORD/YC', '08:00', '09:00']]);
  assert.deepEqual([r.ateliers.find(a => a.id === 'pr').heuresSup, r.lots.filter(l => l.atelier === 'pr' && l.horsPoste).map(l => l.nom)], [0, ['EST/YC']]);
});

test('déterministe, renforts compris', () => {
  const unite = [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC'], ['SUD/YC']], { regime: { actif: true, seuils: [], presence: 300 } }),
    equipe('p2', 'prepa', '08:00', [['OUEST/YC']], { regime: { actif: true, seuils: [], presence: 300 } }), cuisine('07:00', [['OUEST/YC'], ['EST/YC']])];
  const une = () => json(jouer(unite, { ...SOUPLE, renforts: { actif: true }, heuresSup: { actif: true, plafond: 120 } }));
  assert.deepEqual(une(), une());
});

test('réglages : la règle générale (ory-modele-v1) et celle d’une équipe, gardées une fois réglées', () => {
  assert.equal('ordreSouple' in R.valider({}), false, 'un modèle d’avant se relit sans elle');
  assert.deepEqual(R.valider({ ordreSouple: { actif: true } }).ordreSouple, { actif: true });
  assert.deepEqual(R.valider({ ordreSouple: { actif: 'oui' } }).ordreSouple, { actif: false });
  const base = { schema: 'ory-ateliers', version: 1 };
  const lu = A.valider({ ...base, ateliers: [equipe('pr', 'prepa', '08:00', [['NORD/YC']], { ordreSouple: true }), equipe('p2', 'prepa', '08:00', [], { ordreSouple: 'oui' })] });
  assert.deepEqual([lu.ateliers[0].ordreSouple, 'ordreSouple' in lu.ateliers[1]], [true, false]);
  const plonge = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], ordreSouple: true };
  assert.equal('ordreSouple' in A.valider({ ...base, ateliers: [plonge] }).ateliers[0], false, 'une équipe qui prépare seulement');
  assert.deepEqual(A.valider(json(lu)), lu, 'relu tel quel');
});

test('le banc d’essai : la règle se force comme les heures sup, celle d’une équipe par `equipes`', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [equipe('pr', 'prepa', '08:00', [['EST/YC'], ['NORD/YC']]), cuisine('09:00', [['EST/YC']])], ...CHEMINS };
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': etat, 'ory-modele-v1': { bareme: BAREME, rendement: 1 } } };
  assert.equal('ordreSouple' in J.argumentsDeLaJournee(sauvegarde, VOLS), false);
  const args = J.argumentsDeLaJournee(sauvegarde, VOLS, { ordreSouple: { actif: true } });
  assert.deepEqual(args.ordreSouple, { actif: true });
  assert.deepEqual(ordre(J.jouer(args)).map(x => x[0]), ['NORD/YC', 'EST/YC']);
  const eq = J.argumentsDeLaJournee(sauvegarde, VOLS, { equipes: { pr: { ordreSouple: true } } });
  assert.equal(eq.ateliers.find(a => a.id === 'pr').ordreSouple, true);
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, VOLS, { ordreSouple: { actf: true } }), /modele\.ordreSouple\.actf/);
});

/* ---- Excel ---------------------------------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const CTX = { services: [{ id: 'prepa', nom: 'PRÉPA' }, { id: 'cuisine', nom: 'CUISINE' }], programme: [], classes: [] };
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));

test('Excel : la colonne « Ordre des lots », seulement quand une équipe a le sien', async () => {
  const etatDe = ateliers => ({ schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers }), parcours: [] });
  const sans = await parFichier(E.ateliersVersClasseur(etatDe([equipe('pr', 'prepa', '08:00', [])]), CTX));
  assert.ok(!sans.find(x => x.nom === 'Ateliers').lignes[0].includes('Ordre des lots'), 'le classeur d’avant');
  const etat = etatDe([equipe('pr', 'prepa', '08:00', [], { ordreSouple: true }), equipe('p2', 'prepa', '08:00', [], { ordreSouple: false }), equipe('p3', 'prepa', '08:00', [])]);
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const lignes = f.find(x => x.nom === 'Ateliers').lignes, col = lignes[0].indexOf('Ordre des lots');
  assert.deepEqual(lignes.slice(1).map(l => l[col] ?? null), ['souple', 'strict', null]);
  const relu = A.valider(E.classeurVersAteliers(f, etat, CTX).etat);
  assert.deepEqual(relu.ateliers.map(a => a.ordreSouple), [true, false, undefined]);
  // Sans la colonne : celui du site reste. Illisible : refusé.
  const sansCol = modifier(f, 'Ateliers', l => l.map(x => x.filter((_, i) => i !== col)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(sansCol, etat, CTX).etat).ateliers.map(a => a.ordreSouple), [true, false, undefined]);
  const faux = modifier(f, 'Ateliers', l => l.map((x, i) => (i === 1 ? Object.assign(x, { [col]: 'vite' }) : x)));
  assert.throws(() => E.classeurVersAteliers(faux, etat, CTX), /ordre des lots illisible « vite »/);
});
