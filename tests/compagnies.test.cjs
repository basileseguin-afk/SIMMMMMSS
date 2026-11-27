/* Évolution 26 (b) — la liste des compagnies (compagnies.js) : sa lecture, sa traduction pour le calcul, « En faire ma
 * liste », et le chemin unique de calcul (la page et les outils préparent la sauvegarde et les vols au même endroit).
 * Sans liste, rien ne change ; « En faire ma liste » ne change pas le résultat. Unité, vols et compagnies fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../compagnies.js');
const A = require('../ateliers.js');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');
const { simulerPeriode } = require('../outils/simuler-periode.cjs');
const { simulerJournee } = require('../outils/simuler-journee.cjs');

const VOLS = () => UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const VOLS_DATES = () => UI.parseFlights(F.volsDatesCsv(3, '2031-03-03'), { eta: true, spmlParCabine: true, date: true });
const sansListe = () => F.sauvegardeFictive({ liste: false });
const avecListe = liste => { const s = sansListe(); s.contenu['ory-ateliers-v1'].compagnies = liste; return s; };
const etatDe = s => A.valider(s.contenu['ory-ateliers-v1']);
/** Deux résultats du moteur, champ par champ (sous leur forme écrite : le moteur rend des objets à prototypes à lui). */
const memes = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
/** Le résultat d'une journée, par le chemin des outils : préparer, puis le moteur. */
function journee(sauvegarde, vols) {
  const p = C.preparerSauvegarde(sauvegarde, vols);
  return J.jouer(J.argumentsDeLaJournee(p.sauvegarde, p.vols));
}
const LISTE_FICTIVE = [
  { nom: 'EST', classes: ['YC', 'CREW'] },
  { nom: 'NORD', classes: ['BC', 'PC', 'YC', 'CREW', 'SPML'] },
  { nom: 'OUEST', classes: ['BC', 'PC', 'YC', 'CREW', 'SPML'] },
  { nom: 'SUD', classes: ['BC', 'YC', 'CREW', 'SPML'] },
  { nom: 'ZEN', classes: ['YC'] }
];

test('la liste se lit et se met au propre ; une liste fausse est refusée en disant quoi corriger', () => {
  assert.equal(C.lire(undefined), null, 'une unité d’avant n’a pas de liste');
  assert.deepEqual(C.lire([]), [], 'une liste vide est une liste');
  assert.deepEqual(C.lire([{ nom: ' nord ', classes: ['YC', 'BC', 'XX', 'YC'] }]), [{ nom: 'NORD', classes: ['BC', 'YC'] }]);
  assert.deepEqual(C.lire([{ nom: 'SANS' }]), [{ nom: 'SANS', classes: [] }], 'une compagnie sans classe existe');
  assert.throws(() => C.lire({}), /une liste/);
  assert.throws(() => C.lire([{ nom: '  ' }]), /pas de nom/);
  assert.throws(() => C.lire([{ nom: 'A/B' }]), /« \/ »/);
  assert.throws(() => C.lire([{ nom: 'NORD' }, { nom: 'nord' }]), /deux fois/);
});

test('« En faire ma liste » : les compagnies du programme et des ajouts, avec leurs commandes d’aujourd’hui', () => {
  const s = sansListe(), etat = etatDe(s);
  assert.deepEqual(etat.exclues, ['EST/SPML'], 'l’unité fictive retire EST · Repas spéciaux');
  assert.deepEqual(etat.ajoutees, [{ cie: 'ZEN', cabine: 'YC' }], 'et ajoute ZEN · Économie, sans vol');
  assert.deepEqual(C.listeDesVols(VOLS(), etat), LISTE_FICTIVE, 'classes ajoutées comprises, classes retirées exclues');
  assert.deepEqual(C.listeDesVols(VOLS_DATES(), etat), LISTE_FICTIVE, 'un programme daté : tous ses jours');
  // Une compagnie dont toutes les classes sont retirées, ou qui n'a que des retours, est dans la liste, sans classe.
  const tout = { ...etat, exclues: ['EST/SPML', 'EST/YC', 'EST/CREW'] };
  assert.deepEqual(C.listeDesVols(VOLS(), tout).find(c => c.nom === 'EST'), { nom: 'EST', classes: [] });
  // L'unité d'exemple (tests/plan-rejoue-fictif.cjs) porte cette liste.
  assert.deepEqual(F.sauvegardeFictive().contenu['ory-ateliers-v1'].compagnies, LISTE_FICTIVE);
});

test('l’état que le calcul lit : sans liste l’état lui-même ; juste après « En faire ma liste », l’état lui-même aussi', () => {
  const ids = C.idsDuProgramme(VOLS());
  const etat = etatDe(sansListe());
  assert.equal(C.etatEffectif(etat, ids), etat, 'sans liste : le même objet');
  const liste = etatDe(avecListe(C.listeDesVols(VOLS(), etat)));
  assert.equal(C.etatEffectif(liste, ids), liste, 'la liste d’aujourd’hui : le même objet, rien ne change');
  // Une compagnie sans vol entre dans la liste : sa commande est ajoutée, sans vol.
  const neuve = etatDe(avecListe([...LISTE_FICTIVE, { nom: 'NEUVE', classes: ['YC', 'BC'] }]));
  const eff = C.etatEffectif(neuve, ids);
  assert.deepEqual(eff.ajoutees, [{ cie: 'ZEN', cabine: 'YC' }, { cie: 'NEUVE', cabine: 'BC' }, { cie: 'NEUVE', cabine: 'YC' }]);
  assert.deepEqual(eff.exclues, ['EST/SPML']);
  // Une classe du programme hors de la liste est retirée ; une compagnie entière aussi.
  const moins = etatDe(avecListe(LISTE_FICTIVE.filter(c => c.nom !== 'SUD').map(c => (c.nom === 'OUEST' ? { ...c, classes: ['YC'] } : c))));
  const e2 = C.etatEffectif(moins, ids);
  assert.deepEqual(e2.exclues, ['EST/SPML', 'OUEST/BC', 'OUEST/CREW', 'OUEST/PC', 'OUEST/SPML', 'SUD/BC', 'SUD/CREW', 'SUD/SPML', 'SUD/YC']);
  assert.deepEqual(e2.ajoutees, [{ cie: 'ZEN', cabine: 'YC' }]);
  // Une classe remise dans la liste n'est plus retirée, même si elle l'était avant la liste.
  const remise = etatDe(avecListe(LISTE_FICTIVE.map(c => (c.nom === 'EST' ? { ...c, classes: ['YC', 'CREW', 'SPML'] } : c))));
  assert.deepEqual(C.etatEffectif(remise, ids).exclues, []);
  // Les commandes du calcul : celles de la liste, ni plus ni moins.
  const cmd = (e, vols) => J.classesDuProgramme(require('../moteur/production.js').classesDeVols(vols), C.etatEffectif(e, ids)).map(c => c.id).sort();
  assert.deepEqual(cmd(neuve, VOLS()), [...C.idsDeLaListe(neuve.compagnies)].sort());
  assert.deepEqual(cmd(moins, VOLS()), [...C.idsDeLaListe(moins.compagnies)].sort());
});

test('le résultat d’une journée : sans liste comme avant ; avec la liste d’aujourd’hui, le même, champ par champ', () => {
  const vols = VOLS(), s = sansListe();
  const avant = J.jouer(J.argumentsDeLaJournee(s, vols));
  const p = C.preparerSauvegarde(s, vols);
  assert.equal(p.sauvegarde, s, 'sans liste : la même sauvegarde');
  assert.equal(p.vols, vols, 'sans liste : les mêmes vols');
  memes(journee(s, vols), avant);
  const liste = avecListe(C.listeDesVols(vols, etatDe(s)));
  assert.equal(C.preparerSauvegarde(liste, vols).sauvegarde, liste, 'la liste d’aujourd’hui : rien à traduire');
  memes(journee(liste, vols), avant, '« En faire ma liste » ne change pas le résultat');
  // Une liste qui retire une compagnie : ses commandes ne sont plus dans la journée.
  const moins = journee(avecListe(LISTE_FICTIVE.filter(c => c.nom !== 'SUD')), vols);
  assert.ok(Object.keys(avant.parClasse).some(id => id.startsWith('SUD/')));
  // Ses vols ne se rattachent plus à la liste (évolution 26 e) : ils ne comptent pas. La case de son armement, que ses
  // équipes ont cochée, reste, sans vol (moteur/production.js, `classesCategories`).
  assert.ok(!Object.keys(moins.parClasse).some(id => id.startsWith('SUD/') && !id.includes('/@')), 'ses commandes ne sont plus dans la journée');
  assert.equal(moins.parClasse['SUD/@ARM'].vols, 0, 'son armement : aucun vol');
});

test('les outils lisent la liste par le même chemin : une sauvegarde d’avant rend le même résultat ; la liste d’aujourd’hui aussi', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-compagnies-'));
  try {
    const ecrire = (nom, x) => { const f = path.join(dossier, nom); fs.writeFileSync(f, typeof x === 'string' ? x : JSON.stringify(x)); return f; };
    const date = ecrire('vols-dates.csv', F.volsDatesCsv(3, '2031-03-03')), jour = ecrire('vols.csv', F.volsCsv());
    const s = sansListe(), liste = avecListe(LISTE_FICTIVE);
    const avant = await simulerPeriode(ecrire('sans.json', s), date, null);
    // La période d'avant : le moteur, sans rien préparer.
    const direct = PE.depuisSauvegarde(s, VOLS_DATES(), {}, { detail: true });
    memes(avant.journees.map(j => j.resultat), direct.journees.map(j => j.resultat), 'une sauvegarde d’avant : la période d’avant');
    const apres = await simulerPeriode(ecrire('liste.json', liste), date, null);
    memes(apres.journees.map(j => j.resultat), avant.journees.map(j => j.resultat), 'la liste d’aujourd’hui : la même période');
    memes(apres.bilan, avant.bilan);
    const j1 = await simulerJournee(ecrire('sans-jour.json', s), jour, null), j2 = await simulerJournee(ecrire('liste-jour.json', liste), jour, null);
    memes(j2.resultat, j1.resultat, 'outils/simuler-journee.cjs : le même résultat');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('le classeur des équipes : sa feuille « Classes » mène la liste (ce qu’elle retire et ajoute) ; sans changement, la même liste', () => {
  const ids = C.idsDuProgramme(VOLS());
  const etat = etatDe(avecListe(LISTE_FICTIVE));
  // Exporté puis réimporté sans changement : la feuille porte l'état que le calcul lit, la liste ne bouge pas.
  assert.deepEqual(C.listeApresClasseur(LISTE_FICTIVE, ids, C.etatEffectif(etat, ids)), LISTE_FICTIVE);
  // La feuille retire SUD · Affaires et ajoute NEUVE · Premium ; une compagnie dont la feuille retire tout reste, sans classe.
  const feuille = { exclues: ['EST/SPML', 'SUD/BC', 'EST/YC', 'EST/CREW'], ajoutees: [{ cie: 'ZEN', cabine: 'YC' }, { cie: 'neuve', cabine: 'PC' }] };
  assert.deepEqual(C.listeApresClasseur(LISTE_FICTIVE, ids, feuille), [
    { nom: 'EST', classes: [] }, LISTE_FICTIVE[1], LISTE_FICTIVE[2], { nom: 'SUD', classes: ['YC', 'CREW', 'SPML'] }, LISTE_FICTIVE[4],
    { nom: 'NEUVE', classes: ['PC'] }
  ], 'la liste dans son ordre, la nouvelle à la suite');
});

test('la liste se garde dans l’état des équipes ; une sauvegarde d’avant n’en gagne pas', () => {
  const brut = sansListe().contenu['ory-ateliers-v1'];
  assert.ok(!('compagnies' in A.valider(brut)), 'sans liste, l’état d’avant, champ par champ');
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(A.valider(brut)))), A.valider(brut));
  const avec = A.valider({ ...brut, compagnies: LISTE_FICTIVE });
  assert.deepEqual(avec.compagnies, LISTE_FICTIVE);
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))), avec, 'l’aller-retour garde la liste');
  assert.throws(() => A.valider({ ...brut, compagnies: [{ nom: 'X' }, { nom: 'X' }] }), /deux fois/);
});
