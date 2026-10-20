/* Banc d'essai, évolution 6 — une plonge qui ne s'ouvre que s'il reste du
 * sale (v1) : un shift de nuit, équipe de lavage ordinaire, vient si, à son
 * heure, le sale en attente atteint son seuil ; le sale de la veille, présent
 * au début de la journée ; le sale non lavé, rendu à la journée suivante
 * (docs/BANC_ESSAI.md § 6). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
// Des retours toutes les 20 min à partir de 15:00 (arrivée 14:30 + 30 min) : 190 u chacun (les unités par défaut d'un vol éco).
const retours = n => Array.from({ length: n }, (_, i) => ret('R' + (i + 1), i % 2 ? 'SUD' : 'NORD', P.hhmm(h('14:30') + i * 20)));
const plonge = (id, debut, presence, p) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence }, parVol: true, durees: { '*': 30 }, tunnels: [{ nom: 'Tunnel ' + id, debit: 300, personnes: 1, actif: true }], plafond: 0, ...p });
const auDebit = p => ({ parVol: false, ...p });
// Le soir : de 14:00 à 21:00, un tunnel, 30 min par vol. La nuit : de 22:00 à 06:00, si du sale attend à 22:00.
const SOIR = (p = {}) => plonge('soir', '14:00', 420, p);
const NUIT = (k = {}, p = {}) => plonge('nuit', '22:00', 480, { condition: { mesure: 'sale', ...k }, ...p });
const jouer = (vols, ateliers, materiel = {}) => P.simuler({ vols: [dep('NO1', 'NORD', '12:00'), ...vols], liaisons: [], rendement: 1, ateliers,
  materiel: { actif: false, delaiRetour: 30, ...materiel } });
const vue = (r, id) => r.ateliers.find(a => a.id === id);
const laves = (r, id) => r.lots.filter(l => l.retourVol && l.atelier === id && !l.impossible).map(l => l.vol);
const json = x => JSON.parse(JSON.stringify(x));

test('sous le seuil, le shift ne s’ouvre pas et ne compte aucune personne', () => {
  // Dix retours : le soir les lave tous avant 21:00. À 22:00, rien n'attend.
  const r = jouer(retours(10), [SOIR(), NUIT()]);
  const nuit = vue(r, 'nuit');
  assert.deepEqual([nuit.personnes, nuit.fin, nuit.travail, nuit.lots, nuit.finPoste], [0, null, 0, [], null]);
  assert.deepEqual([nuit.debutPoste, nuit.presence, nuit.jour], [h('22:00'), 480, 0], 'son poste reste lisible');
  assert.deepEqual(nuit.conditionSale, { mesure: 'sale', ouverte: false, a: '22:00', heure: h('22:00'), seuil: 1, sale: 0, lavees: 0, reste: 0, fin: h('22:00') + 480 });
  assert.equal(r.effectifs.nuit, undefined, 'ses personnes ne comptent pas');
  // La journée est celle d'une unité sans elle.
  const sans = jouer(retours(10), [SOIR()]);
  assert.deepEqual(json(r.lots), json(sans.lots));
  assert.deepEqual(json(r.ateliers.filter(a => a.id !== 'nuit')), json(sans.ateliers));
  // Seize retours, mais un seuil de 1 000 u : 4 vols (760 u) attendent, elle ne vient pas.
  const haut = jouer(retours(16), [SOIR(), NUIT({ seuil: 1000 })]);
  assert.deepEqual([vue(haut, 'nuit').personnes, vue(haut, 'nuit').conditionSale.ouverte, vue(haut, 'nuit').conditionSale.sale], [0, false, 760]);
  assert.equal(vue(haut, 'nuit').conditionSale.reste, 760, 'à sa fin, ces 760 u restent sales');
  assert.deepEqual(haut.saleFinal.map(x => x.vol), ['R13', 'R14', 'R15', 'R16'], 'rendus à la journée suivante');
});

test('au-dessus du seuil, il s’ouvre et lave ce qui attend', () => {
  const r = jouer(retours(16), [SOIR(), NUIT()]);
  const nuit = vue(r, 'nuit');
  assert.equal(nuit.personnes, 2);
  assert.deepEqual(laves(r, 'nuit'), ['R13', 'R14', 'R15', 'R16'], 'les vols que le soir n’a pas pu laver');
  assert.deepEqual(r.lots.filter(l => l.atelier === 'nuit').map(l => [l.debut, l.fin]), [[h('22:00'), h('22:30')], [h('22:30'), h('23:00')], [h('23:00'), h('23:30')], [h('23:30'), h('24:00')]]);
  assert.deepEqual(nuit.conditionSale, { mesure: 'sale', ouverte: true, a: '22:00', heure: h('22:00'), seuil: 1, sale: 760, lavees: 760, reste: 0, fin: h('22:00') + 480 });
  assert.deepEqual(r.saleFinal, [], 'plus rien de sale à la fin de la journée');
  assert.equal(r.effectifs.nuit, undefined, 'son effectif est celui saisi');
});

test('un shift qui passe minuit compte le jour où il commence', () => {
  // Vingt retours : la nuit lave jusqu'après minuit.
  const r = jouer(retours(20), [SOIR(), NUIT()]);
  const nuit = vue(r, 'nuit');
  assert.deepEqual([nuit.jour, nuit.debutPoste, nuit.presence], [0, h('22:00'), 480], 'le jour J : celui où il commence');
  assert.ok(nuit.fin > h('24:00'), 'il lave après minuit (' + P.hhmm(nuit.fin) + ')');
  assert.equal(nuit.conditionSale.lavees, 8 * 190);
  assert.equal(nuit.heuresSup, 0);
});

test('l’heure de la mesure : `a`, le jour où elle commence', () => {
  // À 18:00, trois vols attendent (R8, R9, R10, revenus avant 18:00 et pas encore au tunnel) : 570 u.
  const a18 = s => vue(jouer(retours(16), [SOIR(), NUIT({ a: '18:00', seuil: s })]), 'nuit').conditionSale;
  assert.deepEqual([a18(500).heure, a18(500).sale, a18(500).ouverte], [h('18:00'), 570, true]);
  assert.equal(a18(600).ouverte, false);
  // Deux équipes conditionnelles décident l'une après l'autre : la première ouverte lave tout, la seconde ne vient pas.
  const tard = plonge('tard', '21:00', 120, { condition: { mesure: 'sale' } });
  const r = jouer(retours(16), [SOIR(), tard, NUIT({ a: '23:30' })]);
  assert.deepEqual([vue(r, 'tard').conditionSale.ouverte, vue(r, 'tard').conditionSale.sale], [true, 760]);
  assert.deepEqual([vue(r, 'nuit').conditionSale.ouverte, vue(r, 'nuit').conditionSale.sale, vue(r, 'nuit').personnes], [false, 0, 0]);
});

test('au débit : le sale qui attend devant les tunnels', () => {
  const mat = { actif: true, stockInitial: 5000 };
  const soir = SOIR(auDebit()), nuit = k => NUIT(k, auDebit({ regime: { actif: true, seuils: [], presence: 120 } }));
  const r = jouer(retours(16), [soir, nuit()], mat);
  // Le soir lave 300 u/h de 14:00 à 21:00 ; 1 240 u attendent à 22:00. La nuit (2 h) en lave 600.
  assert.deepEqual([vue(r, 'nuit').conditionSale.ouverte, vue(r, 'nuit').conditionSale.sale, vue(r, 'nuit').conditionSale.lavees, vue(r, 'nuit').conditionSale.reste],
    [true, 1240, 600, 640]);
  assert.deepEqual(r.saleFinal, [{ vol: 'R13', cie: 'NORD', unites: 70 }, { vol: 'R14', cie: 'SUD', unites: 190 }, { vol: 'R15', cie: 'NORD', unites: 190 }, { vol: 'R16', cie: 'SUD', unites: 190 }],
    'vol par vol, ce qui reste sale');
  assert.equal(r.plonge.resteSale, 640);
  const ferme = jouer(retours(16), [soir, nuit({ seuil: 2000 })], mat);
  assert.deepEqual([vue(ferme, 'nuit').personnes, vue(ferme, 'nuit').conditionSale.reste], [0, 1240]);
  // Sans boucle du matériel, une plonge au débit n'a rien à laver : elle ne vient jamais.
  assert.equal(vue(jouer(retours(16), [soir, nuit()]), 'nuit').conditionSale.ouverte, false);
});

test('le sale de la veille est lavé : la liste des vols, ou un nombre d’unités', () => {
  const MATIN = (p = {}) => plonge('matin', '05:00', 480, p);
  // La liste : chaque vol à la durée de sa compagnie (SUD : 45 min).
  const r = jouer(retours(2), [MATIN({ durees: { '*': 30, SUD: 45 } })], { saleInitial: [{ vol: 'X1', cie: 'SUD', unites: 120 }, { vol: 'X2', cie: 'nord', unites: 80 }] });
  assert.deepEqual(r.lots.filter(l => l.retourVol).slice(0, 2).map(l => [l.vol, l.cie, l.unites, l.debut, l.fin]),
    [['X1 (veille)', 'SUD', 120, h('05:00'), h('05:45')], ['X2 (veille)', 'NORD', 80, h('05:45'), h('06:15')]]);
  // Un nombre : des vols « toutes compagnies » de la taille d'un vol moyen du jour (190 u) : 250 u, deux vols.
  const n = jouer(retours(2), [MATIN()], { saleInitial: 250 });
  assert.deepEqual(n.lots.filter(l => l.retourVol).slice(0, 2).map(l => [l.vol, l.cie, l.unites, l.debut, l.fin]),
    [['veille 1', '*', 190, h('05:00'), h('05:30')], ['veille 2', '*', 60, h('05:30'), h('06:00')]]);
  // Au débit, avec la boucle du matériel : il attend devant les tunnels dès le début de la journée.
  const d = jouer([], [MATIN(auDebit())], { actif: true, saleInitial: 600 });
  assert.deepEqual(d.lots.map(l => [l.nom, l.debut, l.fin]), [['600 u lavées', h('05:00'), h('07:00')]]);
  assert.deepEqual(d.saleFinal, []);
  // Il fait ouvrir la nuit : rien ne revient aujourd'hui, mais 300 u de la veille attendent.
  const veille = jouer([], [NUIT()], { saleInitial: 300 });
  assert.deepEqual([vue(veille, 'nuit').conditionSale.ouverte, vue(veille, 'nuit').conditionSale.sale], [true, 300]);
  assert.deepEqual(veille.saleFinal, []);
  // Sous son seuil, elle ne vient pas : la seule plonge de l'unité, fermée, rend tout ce sale au lendemain.
  const fermee = jouer([], [NUIT({ seuil: 1000 })], { saleInitial: 300 });
  assert.deepEqual(fermee.saleFinal, [{ vol: 'veille 1', cie: '*', unites: 300 }]);
});

test('le banc enchaîne les jours : ce qu’un jour n’a pas lavé, le suivant le lave', () => {
  const jour1 = jouer(retours(16), [SOIR()]);
  assert.deepEqual(jour1.saleFinal.map(x => [x.vol, x.cie, x.unites]), [['R13', 'NORD', 190], ['R14', 'SUD', 190], ['R15', 'NORD', 190], ['R16', 'SUD', 190]]);
  const jour2 = jouer(retours(16), [plonge('matin', '05:00', 480), SOIR()], { saleInitial: jour1.saleFinal });
  assert.deepEqual(laves(jour2, 'matin').slice(0, 4), ['R13 (veille)', 'R14 (veille)', 'R15 (veille)', 'R16 (veille)']);
  // Encore non lavé le lendemain, un vol de la veille garde son nom (sans « (veille) » répété).
  const jour3 = jouer([], [], { saleInitial: [{ vol: 'R13 (veille)', cie: 'NORD', unites: 190 }] });
  assert.equal(jour3.saleFinal, undefined, 'sans plonge, rien à rendre');
  const sansLavage = jouer([], [plonge('matin', '05:00', 480, { personnes: 0, tunnels: [] })], { saleInitial: [{ vol: 'R13 (veille)', cie: 'NORD', unites: 190 }] });
  assert.deepEqual(sansLavage.saleFinal, [{ vol: 'R13', cie: 'NORD', unites: 190 }]);
});

test('déterministe : la même journée, deux fois', () => {
  const une = () => json(jouer(retours(18), [SOIR(), plonge('tard', '21:00', 120, { condition: { mesure: 'sale', seuil: 100 } }), NUIT({ a: '23:00' })], { saleInitial: 300 }));
  assert.deepEqual(une(), une());
});

test('réglages : la condition d’une plonge et le sale de la veille, gardés une fois saisis', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [SOIR()] };
  const lu = A.valider(base);
  assert.equal('condition' in lu.ateliers[0], false);
  assert.equal('saleInitial' in lu.materiel, false, 'un état d’avant se relit tel quel');
  const nuit = A.valider({ ...base, ateliers: [SOIR(), NUIT({ a: '22:30', seuil: '50' })] }).ateliers[1];
  assert.deepEqual(nuit.condition, { mesure: 'sale', a: '22:30', seuil: 50 });
  assert.deepEqual(A.valider({ ...base, ateliers: [NUIT({ a: 'minuit', seuil: -1 })] }).ateliers[0].condition, { mesure: 'sale' }, 'heure ou seuil illisibles : les défauts');
  // Une équipe qui prépare n'a pas de condition sur le sale ; une plonge n'a pas de règle ⚡.
  const manuel = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, pauses: [], lots: [], condition: { mesure: 'sale', seuil: 1 } };
  assert.equal('condition' in A.valider({ ...base, ateliers: [manuel] }).ateliers[0], false);
  assert.equal('condition' in A.valider({ ...base, ateliers: [SOIR({ condition: { cie: 'NORD', seuil: 3, mesure: 'vols', sinon: 'x' } })] }).ateliers[0], false);
  // Le sale de la veille : un nombre, ou une liste de vols.
  assert.equal(A.valider({ ...base, materiel: { saleInitial: '120.5' } }).materiel.saleInitial, 120.5);
  assert.deepEqual(A.valider({ ...base, materiel: { saleInitial: [{ vol: 'X1', cie: 'sud', unites: 120 }, { vol: 'X2', unites: 0 }, 'x'] } }).materiel.saleInitial,
    [{ vol: 'X1', cie: 'SUD', unites: 120 }]);
  assert.equal('saleInitial' in A.valider({ ...base, materiel: { saleInitial: 'beaucoup' } }).materiel, false);
  const saisi = A.valider({ ...base, ateliers: [SOIR(), NUIT({ a: '22:30' })], materiel: { saleInitial: [{ vol: 'X1', cie: 'SUD', unites: 120 }] } });
  assert.deepEqual(A.valider(json(saisi)), saisi, 'relu tel quel');
});

test('le banc d’essai : `saleInitial` et la condition se forcent ; une saisie illisible est refusée', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [SOIR(), NUIT()], parcours: [], materiel: { actif: false, delaiRetour: 30 } };
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': etat, 'ory-modele-v1': { regime: { seuils: [], presence: 480 } } } };
  const vols = [dep('NO1', 'NORD', '12:00'), ...retours(10)];
  assert.equal('saleInitial' in J.argumentsDeLaJournee(sauvegarde, vols).materiel, false);
  const liste = [{ vol: 'R13', cie: 'NORD', unites: 190 }];
  const args = J.argumentsDeLaJournee(sauvegarde, vols, { saleInitial: liste, equipes: { nuit: { condition: { seuil: 100 } } } });
  assert.deepEqual(args.materiel.saleInitial, liste);
  assert.deepEqual(args.ateliers.find(a => a.id === 'nuit').condition, { mesure: 'sale', seuil: 100 });
  const r = J.jouer(args);
  assert.ok(r.lots.some(l => l.vol === 'R13 (veille)' && !l.impossible));
  assert.deepEqual(J.argumentsDeLaJournee(sauvegarde, vols, { saleInitial: 0 }).materiel.saleInitial, 0, 'zéro : rien à laver');
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, vols, { saleInitial: 'beaucoup' }), /saleInitial/);
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, vols, { equipes: { nuit: { condition: { a: 'minuit' } } } }), /réglage inconnu ou refusé : equipes\.nuit\.condition\.a/);
});

/* ---- Excel ---------------------------------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const CTX = { services: [{ id: 'plonge', nom: 'PLONGE' }], programme: [], classes: [] };
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const modifier = (feuilles, nom, fn) => feuilles.map(f => (f.nom === nom ? { ...f, lignes: fn(f.lignes.map(l => l.slice())) } : f));
const etatDe = (ateliers, materiel) => ({ schema: 'ory-ateliers', version: 1, ...A.valider({ schema: 'ory-ateliers', version: 1, ateliers, materiel }), parcours: [] });

test('Excel : la condition d’une plonge et le sale de la veille font l’aller-retour (version 1)', async () => {
  const etat = etatDe([SOIR(), NUIT({ a: '22:30', seuil: 50 })], { actif: false, saleInitial: 300 });
  const f = await parFichier(E.ateliersVersClasseur(etat, CTX));
  const lignes = f.find(x => x.nom === 'Ateliers').lignes, col = lignes[0].indexOf('Ne travaille que si');
  assert.equal(lignes[2][col], 'sale ≥ 50 à 22:30');
  assert.ok(f.find(x => x.nom === 'Matériel').lignes.some(l => l[0] === 'Sale de la veille (u)' && l[1] === 300));
  const relu = A.valider(E.classeurVersAteliers(f, etat, { ...CTX, banc: true }).etat);
  assert.deepEqual(relu.ateliers[1].condition, { mesure: 'sale', a: '22:30', seuil: 50 });
  assert.equal(relu.materiel.saleInitial, 300);
  // « sale » seul : le seuil et l'heure par défaut.
  const g = modifier(f, 'Ateliers', l => l.map((x, i) => (i === 2 ? Object.assign(x, { [col]: 'sale' }) : x)));
  assert.deepEqual(A.valider(E.classeurVersAteliers(g, etat, { ...CTX, banc: true }).etat).ateliers[1].condition, { mesure: 'sale' });
  // Sans le banc d'essai (la version 2), une plonge n'a pas de condition : refusé, comme avant.
  assert.throws(() => E.classeurVersAteliers(f, etat, CTX), /ne travaille que si/);
  // Une liste de vols de la veille ne s'écrit pas : l'import garde celle du site.
  const avecListe = etatDe([SOIR()], { actif: false, saleInitial: [{ vol: 'X1', cie: 'SUD', unites: 120 }] });
  const h2 = await parFichier(E.ateliersVersClasseur(avecListe, CTX));
  assert.ok(!h2.find(x => x.nom === 'Matériel').lignes.some(l => l[0] === 'Sale de la veille (u)'));
  assert.deepEqual(A.valider(E.classeurVersAteliers(h2, avecListe, { ...CTX, banc: true }).etat).materiel.saleInitial, [{ vol: 'X1', cie: 'SUD', unites: 120 }]);
});
