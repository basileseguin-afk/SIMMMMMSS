/* Banc d'essai, correction 3 — la plonge de nuit ne s'ouvre que si l'équipe
 * du matin ne peut pas absorber le retard (v1) : la journée jouée sans elle
 * donne le retard (`saleFinal`) ; rejouée avec ce retard pour sale de la
 * veille, l'équipe désignée (par défaut, la plonge qui commence le plus tôt)
 * le lave-t-elle avec ses propres retours avant la fin de sa présence, sans
 * heures sup ? (docs/BANC_ESSAI.md § 6). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const ret = (id, cie, t) => ({ id, cie, sens: 'RET', sta: t, bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Des retours à la plonge 30 min après leur arrivée, 190 u chacun (les unités par défaut d'un vol éco).
const serie = (pref, de, n, pas) => Array.from({ length: n }, (_, i) => ret(pref + (i + 1), i % 2 ? 'SUD' : 'NORD', h(de) + i * pas));
// Le matin lave six retours (06:00 à 08:30) ; le soir, n retours à partir de 15:00, toutes les 20 min.
const jour = n => serie('M', '05:30', 6, 30).concat(serie('R', '14:30', n, 20));
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 30 }, tunnels: [{ nom: 'Tunnel ' + id, debit: 300, personnes: 1, actif: true }], plafond: 0, ...p });
const auDebit = p => ({ parVol: false, ...p });
// Le matin : 05:00 à 13:00 ; le soir : 14:00 à 21:00 ; la nuit : 22:00 à 06:00, si le matin n'absorbe pas le retard. Un tunnel chacun, 30 min par vol.
const MATIN = (p = {}) => plonge('matin', '05:00', 480, p);
const SOIR = (p = {}) => plonge('soir', '14:00', 420, p);
const NUIT = (k = {}, p = {}) => plonge('nuit', '22:00', 480, { condition: { mesure: 'absorbable', ...k }, ...p });
const jouer = (vols, ateliers, materiel = {}, plus = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  materiel: { actif: false, delaiRetour: 30, ...materiel }, ...plus });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const json = x => JSON.parse(JSON.stringify(x));
const FIN_NUIT = h('22:00') + 480;

test('un petit retard que le matin absorbe laisse la nuit fermée : le retard passe au lendemain', () => {
  // Vingt retours : le soir en laisse huit (1 520 u). Le lendemain, le matin les lave (4 h) avec ses six retours (3 h) avant 13:00.
  const r = jouer(jour(20), [MATIN(), SOIR(), NUIT()]);
  const nuit = vue(r, 'nuit');
  assert.deepEqual([nuit.personnes, nuit.fin, nuit.travail, nuit.lots, nuit.finPoste], [0, null, 0, [], null]);
  assert.deepEqual(nuit.conditionSale, { mesure: 'absorbable', ouverte: false, equipe: 'matin', retard: { vols: 8, unites: 1520 }, absorbe: true, depassement: 0,
    lavees: 0, reste: 1520, fin: FIN_NUIT });
  assert.equal(r.effectifs.nuit, undefined, 'ses personnes ne comptent pas');
  assert.deepEqual(r.saleFinal.map(x => x.vol), ['R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20'], 'rendu à la journée suivante, comme aujourd’hui');
  // La journée est celle d'une unité sans elle.
  const sans = jouer(jour(20), [MATIN(), SOIR()]);
  assert.deepEqual(json(r.lots), json(sans.lots));
  assert.deepEqual(json(r.ateliers.filter(a => a.id !== 'nuit')), json(sans.ateliers));
  assert.deepEqual(r.saleFinal, sans.saleFinal);
  // Tout juste : dix vols (5 h) et ses six retours (3 h) finissent à 13:00, la fin de sa présence.
  const juste = vue(jouer(jour(22), [MATIN(), SOIR(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([juste.ouverte, juste.retard.vols, juste.absorbe, juste.depassement], [false, 10, true, 0]);
  // Sans retard : rien à absorber.
  const rien = vue(jouer(jour(4), [MATIN(), SOIR(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([rien.ouverte, rien.retard, rien.absorbe, rien.depassement], [false, { vols: 0, unites: 0 }, true, 0]);
});

test('un gros retard l’ouvre : elle lave le retard, et l’on sait de combien le matin dépasserait sa présence', () => {
  // Vingt-trois retours : onze vols de retard ; le matin finirait à 13:30.
  const r = jouer(jour(23), [MATIN(), SOIR(), NUIT()]);
  const nuit = vue(r, 'nuit');
  assert.equal(nuit.personnes, 2);
  assert.deepEqual(nuit.conditionSale, { mesure: 'absorbable', ouverte: true, equipe: 'matin', retard: { vols: 11, unites: 2090 }, absorbe: false, depassement: 30,
    lavees: 2090, reste: 0, fin: FIN_NUIT });
  assert.deepEqual(r.lots.filter(l => l.atelier === 'nuit').map(l => l.vol), ['R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21', 'R22', 'R23']);
  assert.deepEqual(r.lots.filter(l => l.atelier === 'nuit').map(l => l.fin).slice(-1), [h('03:30') + 1440]);
  assert.deepEqual(r.saleFinal, [], 'plus rien de sale à la fin de la journée');
  // Quatorze vols de retard : 7 h, et ses 3 h : deux heures de trop.
  assert.equal(vue(jouer(jour(26), [MATIN(), SOIR(), NUIT()]), 'nuit').conditionSale.depassement, 120);
  // Une seule plonge dans l'unité : personne pour absorber le retard, elle s'ouvre.
  const seule = vue(jouer(jour(4), [NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([seule.ouverte, seule.equipe, seule.retard.vols, seule.absorbe, seule.depassement], [true, null, 10, false, null]);
});

test('une équipe désignée qui ferait des heures sup pour l’absorber compte comme ne l’absorbant pas', () => {
  // Le matin et la nuit seulement : les onze retours de l'après-midi (après 13:00) restent sales.
  const vols = serie('M', '05:30', 6, 30).concat(serie('E', '14:30', 11, 20));
  const sup = { heuresSup: { actif: true, plafond: 60 } };
  // Le lendemain, avec les heures sup permises, le matin lave tout… en finissant à 13:30 : 30 min d'heures sup.
  const sans = jouer(vols, [MATIN()], {}, sup);
  const demain = jouer(vols, [MATIN()], { saleInitial: sans.saleFinal }, sup);
  assert.equal(vue(demain, 'matin').heuresSup, 30);
  assert.deepEqual(demain.saleFinal, sans.saleFinal, 'il a tout lavé, le retard et ses retours : ne restent que ceux de l’après-midi');
  // Il ne l'absorbe donc pas : la nuit s'ouvre.
  const r = jouer(vols, [MATIN(), NUIT()], {}, sup);
  assert.deepEqual([vue(r, 'nuit').conditionSale.ouverte, vue(r, 'nuit').conditionSale.absorbe, vue(r, 'nuit').conditionSale.depassement], [true, false, 30]);
  assert.equal(vue(jouer(vols, [MATIN(), NUIT()]), 'nuit').conditionSale.ouverte, true, 'sans heures sup non plus');
  // Dix vols : il finit à 13:00, sans heures sup : la nuit reste fermée, heures sup permises ou non.
  const dix = serie('M', '05:30', 6, 30).concat(serie('E', '14:30', 10, 20));
  for (const plus of [{}, sup]) assert.equal(vue(jouer(dix, [MATIN(), NUIT()], {}, plus), 'nuit').conditionSale.absorbe, true);
});

test('l’équipe qui doit absorber : par défaut, la plonge qui commence le plus tôt ; ou celle qu’on désigne', () => {
  // Une équipe d'une heure à l'aube (04:00) avant le matin : seule, elle ne lave pas huit vols avant 05:00 (il lui faudrait 3 h de plus).
  const AUBE = plonge('aube', '04:00', 60);
  const defaut = vue(jouer(jour(20), [MATIN(), AUBE, SOIR(), NUIT()]), 'nuit').conditionSale;
  assert.deepEqual([defaut.equipe, defaut.absorbe, defaut.depassement, defaut.ouverte], ['aube', false, 180, true]);
  // Le matin désigné : le retard est propre avant 13:00 (l'aube en lave une part) et ses retours sont lavés par lui : fermée.
  const matin = vue(jouer(jour(20), [MATIN(), AUBE, SOIR(), NUIT({ equipe: 'matin' })]), 'nuit').conditionSale;
  assert.deepEqual([matin.equipe, matin.absorbe, matin.ouverte], ['matin', true, false]);
  // Une équipe désignée absente ce jour-là (une autre plonge conditionnelle, fermée) n'absorbe rien.
  const tard = plonge('tard', '21:00', 60, { condition: { mesure: 'sale', seuil: 5000 } });
  const r = jouer(jour(20), [MATIN(), SOIR(), tard, NUIT({ equipe: 'tard' })]);
  assert.deepEqual([vue(r, 'tard').conditionSale.ouverte, vue(r, 'nuit').conditionSale.equipe, vue(r, 'nuit').conditionSale.absorbe, vue(r, 'nuit').conditionSale.ouverte],
    [false, 'tard', false, true]);
});

test('au débit : le retard en unités, la part de chaque vol, le débit du matin', () => {
  const mat = { actif: true, stockInitial: 50000 };
  const unite = n => jouer(jour(n), [MATIN(auDebit()), SOIR(auDebit()), NUIT({}, auDebit())], mat);
  // 1 240 u de retard et ses 1 140 u : 2 380 u à 300 u/h, avant 13:00.
  const petit = vue(unite(16), 'nuit').conditionSale;
  assert.deepEqual([petit.retard, petit.absorbe, petit.ouverte], [{ vols: 7, unites: 1240 }, true, false]);
  // 2 000 u et 1 140 u : 10 h 28 de lavage depuis 05:00, 2 h 28 de trop.
  const gros = unite(20);
  assert.deepEqual([vue(gros, 'nuit').conditionSale.retard, vue(gros, 'nuit').conditionSale.absorbe, vue(gros, 'nuit').conditionSale.depassement, vue(gros, 'nuit').personnes],
    [{ vols: 11, unites: 2000 }, false, 148, 2]);
  // Sans boucle du matériel, une plonge au débit n'a rien à laver : pas de retard, elle ne vient pas.
  assert.equal(vue(jouer(jour(20), [MATIN(auDebit()), SOIR(auDebit()), NUIT({}, auDebit())]), 'nuit').conditionSale.ouverte, false);
});

test('la condition « sale » reste là ; les deux décident l’une après l’autre, sans se cumuler', () => {
  // Le sale à 22:00 : 8 vols attendent, la nuit sur le sale s'ouvre ; sur le retard, elle reste fermée.
  assert.deepEqual(vue(jouer(jour(20), [MATIN(), SOIR(), plonge('nuit', '22:00', 480, { condition: { mesure: 'sale' } })]), 'nuit').conditionSale.mesure, 'sale');
  // Une plonge sur le sale à 21:00 (ouverte, elle lave 2 vols) puis la nuit sur le retard, dans la journée où elle est ouverte.
  const tard = plonge('tard', '21:00', 60, { condition: { mesure: 'sale' } });
  const r = jouer(jour(26), [MATIN(), SOIR(), tard, NUIT()]);
  assert.deepEqual([vue(r, 'tard').conditionSale.ouverte, vue(r, 'tard').conditionSale.lavees], [true, 380]);
  assert.deepEqual([vue(r, 'nuit').conditionSale.retard.vols, vue(r, 'nuit').conditionSale.depassement, vue(r, 'nuit').conditionSale.ouverte], [12, 60, true]);
  // Une condition qui porterait les deux : une seule mesure, celle qu'elle nomme.
  const lu = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [MATIN(), NUIT({ a: '22:30', seuil: 50 })] });
  assert.deepEqual(lu.ateliers[1].condition, { mesure: 'absorbable' });
  // Le moteur, lui, ne la lit pas comme une règle ⚡ sur le volume, même avec un seuil.
  assert.equal(P.appliquerConditions([NUIT({ seuil: 5, cie: 'NORD' })], []).conditions.length, 0);
});

test('déterministe : la même journée, deux fois', () => {
  const une = () => json(jouer(jour(24), [MATIN(), SOIR(), plonge('tard', '21:00', 60, { condition: { mesure: 'sale', seuil: 100 } }), NUIT()], { saleInitial: 300 }));
  assert.deepEqual(une(), une());
  const debit = () => json(jouer(jour(20), [MATIN(auDebit()), SOIR(auDebit()), NUIT({}, auDebit())], { actif: true, stockInitial: 50000, saleInitial: 200 }));
  assert.deepEqual(debit(), debit());
});

test('réglages : la mesure et l’équipe désignée, gardées une fois saisies ; une équipe qui n’existe pas s’efface', () => {
  const base = { schema: 'ory-ateliers', version: 1 };
  const lire = (...ateliers) => A.valider({ ...base, ateliers }).ateliers;
  assert.deepEqual(lire(MATIN(), SOIR(), NUIT({ equipe: 'soir' }))[2].condition, { mesure: 'absorbable', equipe: 'soir' });
  // Elle-même, une équipe inconnue, une équipe qui ne lave pas, une plonge d'un autre service : la plonge par défaut.
  const montage = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, pauses: [], lots: [] };
  for (const [equipe, autres] of [['nuit', []], ['zz', []], ['mo', [montage]], ['autre', [plonge('autre', '05:00', 480, { service: 'plonge2' })]]])
    assert.deepEqual(lire(MATIN(), ...autres, NUIT({ equipe })).find(a => a.id === 'nuit').condition, { mesure: 'absorbable' }, equipe);
  // Une équipe qui prépare n'a pas de condition sur le retard ; la case qui change de nature la perd.
  assert.equal('condition' in lire({ ...montage, condition: { mesure: 'absorbable' } })[0], false);
  const saisi = A.valider({ ...base, ateliers: [MATIN(), NUIT({ equipe: 'matin' })] });
  assert.deepEqual(A.valider(json(saisi)), saisi, 'relu tel quel');
  // Un état d'avant se relit tel quel : sans condition, rien d'enregistré.
  assert.equal('condition' in lire(MATIN())[0], false);
});

test('le banc d’essai : la mesure et l’équipe se forcent ; une équipe inconnue est refusée', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [MATIN(), SOIR(), plonge('nuit', '22:00', 480)], parcours: [], materiel: { actif: false, delaiRetour: 30 } };
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': etat, 'ory-modele-v1': { regime: { seuils: [], presence: 480 } } } };
  const vols = [dep('NO1', 'NORD', '12:00'), ...jour(23)];
  const args = J.argumentsDeLaJournee(sauvegarde, vols, { equipes: { nuit: { condition: { mesure: 'absorbable', equipe: 'matin' } } } });
  assert.deepEqual(args.ateliers.find(a => a.id === 'nuit').condition, { mesure: 'absorbable', equipe: 'matin' });
  const r = J.jouer(args);
  assert.deepEqual([vue(r, 'nuit').conditionSale.absorbe, vue(r, 'nuit').conditionSale.depassement, vue(r, 'nuit').personnes], [false, 30, 2],
    'même calcul que la page');
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, vols, { equipes: { nuit: { condition: { mesure: 'absorbable', equipe: 'zz' } } } }),
    /réglage inconnu ou refusé : equipes\.nuit\.condition\.equipe/);
});

/* ---- Excel ---------------------------------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const CTX = { services: [{ id: 'plonge', nom: 'PLONGE' }], programme: [], classes: [] };
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));
const etatDe = ateliers => ({ schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers }), parcours: [] });

test('Excel : « retard non absorbé (par …) » fait l’aller-retour (version 1)', async () => {
  const etat = etatDe([MATIN(), SOIR(), NUIT({ equipe: 'soir' })]);
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const lignes = f.find(x => x.nom === 'Ateliers').lignes, col = lignes[0].indexOf('Ne travaille que si');
  assert.equal(lignes[3][col], 'retard non absorbé (par soir)');
  assert.equal(lignes[3][col + 1] ?? null, null, 'ni « sinon, commandes à »');
  assert.deepEqual(A.valider(E.classeurVersAteliers(f, etat, { ...CTX, banc: true }).etat).ateliers[2].condition, { mesure: 'absorbable', equipe: 'soir' });
  // Sans équipe nommée : la plonge par défaut.
  const g = modifier(f, 'Ateliers', l => l.map((x, i) => (i === 3 ? Object.assign(x, { [col]: 'retard non absorbé' }) : x)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(g, etat, { ...CTX, banc: true }).etat).ateliers[2].condition, { mesure: 'absorbable' });
  // Une équipe qui n'existe pas, ou elle-même : refusé, en le disant.
  const k = modifier(f, 'Ateliers', l => l.map((x, i) => (i === 3 ? Object.assign(x, { [col]: 'retard non absorbé (par midi)' }) : x)));
  assert.throws(() => E.classeurVersAteliers(k, etat, { ...CTX, banc: true }), /atelier inconnu « midi »/);
  const m = modifier(f, 'Ateliers', l => l.map((x, i) => (i === 3 ? Object.assign(x, { [col]: 'retard non absorbé (par nuit)' }) : x)));
  assert.throws(() => E.classeurVersAteliers(m, etat, { ...CTX, banc: true }), /une autre équipe de la même plonge/);
  // Sans le banc d'essai (la version 2), une plonge n'a pas de condition : refusé, comme avant.
  assert.throws(() => E.classeurVersAteliers(f, etat, CTX), /ne travaille que si/);
});
