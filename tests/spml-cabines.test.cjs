/* Banc d'essai, évolution 7 — les repas spéciaux (SPML) de chaque cabine
 * (v1) : un vol n'entre dans la commande X/SPML d'un service que s'il a au
 * moins un SPML d'une cabine que ce service prépare ; le barème reste par vol
 * (docs/BANC_ESSAI.md § 7). Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');
const UI = require('../ui-model.js');

const h = s => P.minutes(s);
const ENTETE = 'vol_id,compagnie,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_SPML';
// SU1 : des SPML en éco seulement. SU2 : un en business. SU3 : nb_SPML seul, sans le détail.
const CSV = ENTETE + ',nb_SPML_BC,nb_SPML_PC,nb_SPML_YC\n'
  + 'SU1,SUD,DEP,10:00,,10,0,100,,0,0,3\nSU2,SUD,DEP,11:00,,10,0,100,,1,0,2\nSU3,SUD,DEP,12:00,,10,0,100,4,,,\n';
const vols = (texte = CSV) => UI.parseFlights(texte, { spmlParCabine: true });
// Une heure par vol pour la commande SPML, en cuisine comme en prépa.
const BAREME = { cuisine: { '*/SPML': 60, '*/BC': 0, '*/YC': 0 }, prepa: { '*/SPML': 60, '*/BC': 0, '*/YC': 0 } };
const equipe = (id, service) => ({ id, nom: id, service, type: 'manuel', debut: '04:00', jour: 0, personnes: 1, pauses: [], lots: [['SUD/SPML']], regime: { actif: false } });
const CHEMIN = { id: 'c', nom: 'SPML', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] };
const jouer = (v, spmlCabines) => P.simuler({ vols: v, liaisons: [{ from: 'cuisine', to: 'prepa' }], bareme: BAREME, rendement: 1,
  ateliers: [equipe('cu', 'cuisine'), equipe('pr', 'prepa')], parcours: [CHEMIN], parcoursCabine: { SPML: 'c', BC: 'c', YC: 'c' }, ...(spmlCabines ? { spmlCabines } : {}) });
const minutesDe = (r, id) => r.lots.filter(l => l.atelier === id && l.classes.includes('SUD/SPML')).reduce((n, l) => n + l.hommeMinutes, 0);

test('import : les colonnes nb_SPML_BC, nb_SPML_PC, nb_SPML_YC ; nb_SPML vide vaut leur somme', () => {
  const v = vols();
  assert.deepEqual(v.map(x => [x.id, x.spml, x.spmlParCabine]), [['SU1', 3, { BC: 0, PC: 0, YC: 3 }], ['SU2', 3, { BC: 1, PC: 0, YC: 2 }], ['SU3', 4, undefined]]);
  // nb_SPML saisi reste tel quel ; une seule colonne de cabine suffit.
  const une = UI.parseFlights(ENTETE + ',nb_SPML_YC\nSU1,SUD,DEP,10:00,,10,0,100,5,3\n', { spmlParCabine: true });
  assert.deepEqual([une[0].spml, une[0].spmlParCabine], [5, { YC: 3 }]);
  // Sans l'option (la version 2) : les colonnes sont ignorées, comme avant.
  assert.ok(UI.parseFlights(CSV).every(x => !('spmlParCabine' in x)));
  assert.deepEqual(UI.parseFlights(CSV).map(x => x.spml), [0, 0, 4]);
  assert.throws(() => vols(CSV.replace('10:00,,10,0,100,,0,0,3', '10:00,,10,0,100,,0,0,trois')), /nb_spml_yc/);
});

test('un import sans les nouvelles colonnes ne change rien', () => {
  const sans = ENTETE + ',nb_CREW\nSU1,SUD,DEP,10:00,,10,0,100,3,2\nSU2,SUD,DEP,11:00,,10,0,100,0,0\n';
  assert.deepEqual(UI.parseFlights(sans, { spmlParCabine: true }), UI.parseFlights(sans));
  assert.deepEqual(P.classesDeVols(UI.parseFlights(sans, { spmlParCabine: true })), P.classesDeVols(UI.parseFlights(sans)));
});

test('un vol qui n’a que des SPML éco n’entre pas dans la commande SPML d’un service réglé sur BC et PC', () => {
  const v = vols();
  // Sans réglage, chaque service prépare les SPML de toutes les cabines : trois vols, trois heures.
  const sans = jouer(v);
  assert.deepEqual([minutesDe(sans, 'cu'), minutesDe(sans, 'pr')], [180, 180]);
  // La cuisine ne prépare que ceux de la business et de la première : SU1 (éco seulement) n'entre pas dans sa commande.
  const r = jouer(v, { cuisine: ['BC', 'PC'] });
  assert.equal(minutesDe(r, 'cu'), 120, 'SU2 (un SPML business) et SU3 (sans détail : il compte)');
  assert.equal(minutesDe(r, 'pr'), 180, 'la prépa, sans réglage, les prépare toutes');
  assert.equal(r.lots.find(l => l.atelier === 'cu').fin, h('06:00'));
  // Réglée sur l'éco seulement : SU2 entre aussi (il a deux SPML éco).
  assert.equal(minutesDe(jouer(v, { cuisine: ['YC'] }), 'cu'), 180);
  // Aucune cabine : sa commande SPML ne compte plus aucun vol.
  assert.equal(minutesDe(jouer(v, { cuisine: [] }), 'cu'), 0);
  // Les commandes, elles, ne changent pas : le détail voyage avec leurs vols.
  assert.deepEqual(r.classes.find(c => c.id === 'SUD/SPML').vols.map(x => [x.id, x.cabines]), [['SU1', { BC: 0, PC: 0, YC: 3 }], ['SU2', { BC: 1, PC: 0, YC: 2 }], ['SU3', undefined]]);
});

test('un détail incomplet : les SPML dont on ne connaît pas la cabine comptent pour tous', () => {
  // nb_SPML = 5, dont 3 en éco : 2 dans une cabine inconnue.
  const v = UI.parseFlights(ENTETE + ',nb_SPML_YC\nSU1,SUD,DEP,10:00,,10,0,100,5,3\nSU2,SUD,DEP,11:00,,10,0,100,,3\n', { spmlParCabine: true });
  assert.equal(minutesDe(jouer(v, { cuisine: ['BC', 'PC'] }), 'cu'), 60, 'SU1 compte, SU2 (tout en éco) non');
});

test('l’effectif calculé suit les vols que le service prépare', () => {
  const v = vols(), calc = sc => P.simuler({ vols: v, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [{ ...equipe('cu', 'cuisine'), effectif: 'calcule', regime: { actif: true, seuils: [], presence: 60 } }],
    parcours: [{ id: 'c', nom: 'c', noeuds: ['cuisine'], liens: [] }], parcoursCabine: { SPML: 'c', BC: 'c', YC: 'c' }, effectifCalcule: ['cuisine'], ...(sc ? { spmlCabines: sc } : {}) });
  assert.equal(calc().effectifs.cu.personnes, 3);
  assert.equal(calc({ cuisine: ['BC', 'PC'] }).effectifs.cu.personnes, 2);
});

test('réglage : par service, rangé avec les cases seulement une fois réglé ; le banc le force', () => {
  const base = { schema: 'ory-ateliers', version: 1, ateliers: [equipe('cu', 'cuisine')] };
  assert.equal('spmlCabines' in A.valider(base), false, 'un état d’avant se relit tel quel');
  assert.deepEqual(A.valider({ ...base, spmlCabines: { cuisine: ['PC', 'BC', 'XX', 'BC'], chaude: [], x: 'BC' } }).spmlCabines, { cuisine: ['BC', 'PC'], chaude: [] });
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': { ...base, ateliers: [equipe('cu', 'cuisine'), equipe('pr', 'prepa')], parcours: [CHEMIN], parcoursCabine: { SPML: 'c', BC: 'c', YC: 'c' } },
    'ory-modele-v1': { bareme: BAREME, rendement: 1 } } };
  assert.equal('spmlCabines' in J.argumentsDeLaJournee(sauvegarde, vols()), false);
  const args = J.argumentsDeLaJournee(sauvegarde, vols(), { ateliers: { spmlCabines: { cuisine: ['BC', 'PC'] } } });
  assert.deepEqual(args.spmlCabines, { cuisine: ['BC', 'PC'] });
  assert.equal(minutesDe(J.jouer(args), 'cu'), 120);
  assert.throws(() => J.argumentsDeLaJournee(sauvegarde, vols(), { ateliers: { spmlCabines: { cuisine: 'BC' } } }), /réglage inconnu ou refusé/);
});

test('le banc lit les colonnes : un fichier, par le code de l’import de la page', async () => {
  const fichier = { name: 'vols.csv', size: CSV.length, text: async () => CSV };
  assert.deepEqual((await J.volsDuFichier(fichier)).map(x => x.spmlParCabine || null), [{ BC: 0, PC: 0, YC: 3 }, { BC: 1, PC: 0, YC: 2 }, null]);
});

/* ---- Excel ---------------------------------------------------------------- */
const T = require('../tableur.js');
const E = require('../echanges.js');
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));

test('Excel : les colonnes des SPML par cabine, seulement quand un vol les a', async () => {
  const sans = UI.parseFlights(ENTETE + '\nSU1,SUD,DEP,10:00,,10,0,100,3\n');
  assert.deepEqual(E.volsVersClasseur(sans).find(f => f.nom === 'Départs').lignes[0].slice(-1), ['nb_SPML'], 'le classeur d’avant');
  const v = vols(), f = await parFichier(E.volsVersClasseur(v));
  assert.deepEqual(f.find(x => x.nom === 'Départs').lignes[0].slice(-4), ['nb_SPML', 'nb_SPML_BC', 'nb_SPML_PC', 'nb_SPML_YC']);
  assert.deepEqual(E.classeurVersVols(f, { spmlParCabine: true }), v, 'aller-retour');
  assert.ok(E.classeurVersVols(f).every(x => !('spmlParCabine' in x)), 'sans l’option (la version 2) : ignorées');
});
