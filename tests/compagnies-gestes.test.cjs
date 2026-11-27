/* Évolution 26 (c) — les gestes sur une compagnie (compagnies-gestes.js) : « comme une autre » copie, classe par classe,
 * le chemin, l'équipe de chaque étape, les heures propres et les temps par vol ; une classe absente du modèle est « à
 * compléter » ; renommer garde les réglages ; les classes retirées et ajoutées d'avant suivent la liste.
 * Unité, vols et compagnies fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../compagnies-gestes.js');
const C = require('../compagnies.js');
const A = require('../ateliers.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const VOLS = () => UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const unite = () => { const c = F.sauvegardeFictive().contenu; return { etat: A.valider(c['ory-ateliers-v1']), bareme: c['ory-modele-v1'].bareme }; };
const prepare = (etat, id) => etat.ateliers.filter(a => (a.lots || []).some(l => [].concat(l).includes(id))).map(a => a.id);

test('un nom de compagnie neuf : refusé vide, avec « / », « * », ou déjà dans la liste', () => {
  assert.equal(G.nomNeuf(' neuve ', ['NORD']), 'NEUVE');
  assert.throws(() => G.nomNeuf('  ', []), /Nommez/);
  assert.throws(() => G.nomNeuf('A/B', []), /« \/ »/);
  assert.throws(() => G.nomNeuf('*', []), /toutes les compagnies/);
  assert.throws(() => G.nomNeuf('nord', ['NORD']), /déjà dans la liste/);
  assert.equal(G.nomNeuf('nord', ['NORD'], 'NORD'), 'NORD', 'renommer une compagnie en son propre nom');
});

test('« comme une autre » : pour chaque classe commune, le même chemin, les mêmes équipes, les mêmes temps', () => {
  const { etat, bareme } = unite();
  etat.parcoursClasse = { 'SUD/BC': 'complet' };
  bareme.prepa['SUD/YC'] = 7;
  const avant = JSON.stringify(etat) + JSON.stringify(bareme);
  const r = G.copier(etat, bareme, { modele: 'SUD', nom: 'neuve', cabines: ['BC', 'PC', 'YC', 'CREW'], classesModele: ['BC', 'YC', 'CREW', 'SPML'] });
  assert.deepEqual(r.communes, ['BC', 'YC', 'CREW']);
  assert.deepEqual(r.aCompleter, ['PC'], 'le modèle n’a pas de Premium');
  for (const cab of r.communes) {
    assert.deepEqual(prepare(r.etat, 'NEUVE/' + cab), prepare(r.etat, 'SUD/' + cab), cab + ' : les mêmes équipes');
    assert.equal(r.etat.parcoursClasse['NEUVE/' + cab], r.etat.parcoursClasse['SUD/' + cab], cab + ' : le même chemin');
    for (const s of Object.keys(r.bareme)) assert.equal(r.bareme[s]['NEUVE/' + cab], r.bareme[s]['SUD/' + cab], cab + ' : le même temps par vol en ' + s);
  }
  assert.deepEqual(prepare(r.etat, 'NEUVE/PC'), [], 'la classe absente du modèle : aucune équipe');
  assert.equal(r.etat.parcoursClasse['NEUVE/PC'], undefined, 'elle suit le chemin habituel de sa classe');
  // Un lot à part, juste après celui du modèle : « SUD/YC + SUD/BC », puis « NEUVE/YC + NEUVE/BC ».
  const mo = r.etat.ateliers.find(a => a.id === 'mo').lots.map(l => l.join('+'));
  assert.equal(mo[mo.indexOf('SUD/YC+SUD/BC') + 1], 'NEUVE/YC+NEUVE/BC');
  assert.deepEqual(prepare(r.etat, 'NEUVE/@ARM'), prepare(r.etat, 'SUD/@ARM'), 'la case de l’armement aussi');
  assert.equal(JSON.stringify(etat) + JSON.stringify(bareme), avant, 'rien n’est modifié en place');
});

test('« comme une autre » : les réglages par compagnie du modèle (handling, plonge, appui, catégories, chargement)', () => {
  const { etat, bareme } = unite();
  etat.sansChargement = ['NORD'];
  const r = G.copier(etat, bareme, { modele: 'NORD', nom: 'NEUVE', cabines: ['YC'], classesModele: ['BC', 'YC'] });
  const eq = id => r.etat.ateliers.find(a => a.id === id);
  assert.equal(eq('h').durees.NEUVE, eq('h').durees.NORD);
  assert.equal(eq('h').allers.NEUVE, eq('h').allers.NORD);
  assert.ok(eq('h').longs.includes('NEUVE'), 'long-courrier comme son modèle');
  assert.equal(eq('pl1').durees.NEUVE, 45);
  assert.equal(eq('do').minutesVol.NEUVE, 10);
  assert.equal(r.etat.categories.armement[0].minutes.NEUVE, 18);
  assert.deepEqual(r.etat.sansChargement, ['NORD', 'NEUVE']);
  assert.equal(r.bareme.prepa['NEUVE/YC'], r.bareme.prepa['NORD/YC']);
  // Sans classe commune, rien n'est copié.
  const rien = G.copier(etat, bareme, { modele: 'NORD', nom: 'NEUVE', cabines: ['PC'], classesModele: ['YC'] });
  assert.equal(JSON.stringify(rien.etat), JSON.stringify(etat));
  assert.deepEqual(rien.aCompleter, ['PC']);
});

test('renommer : partout où la compagnie est nommée ; renommée en retour, l’état d’avant', () => {
  const { etat, bareme } = unite();
  const e0 = { ...etat, compagnies: C.listeDesVols(VOLS(), etat) };
  const r = G.renommer(e0, bareme, 'NORD', 'NORDIQUE');
  assert.doesNotMatch(JSON.stringify(r.etat) + JSON.stringify(r.bareme), /"NORD"|"NORD\//, 'plus aucun « NORD »');
  assert.ok(r.etat.compagnies.some(c => c.nom === 'NORDIQUE'));
  assert.equal(r.etat.ateliers.find(a => a.id === 'h').durees.NORDIQUE, 40);
  assert.equal(r.bareme.prepa['NORDIQUE/YC'], bareme.prepa['NORD/YC']);
  const retour = G.renommer(r.etat, r.bareme, 'NORDIQUE', 'NORD');
  assert.equal(JSON.stringify(A.valider(retour.etat)), JSON.stringify(A.valider(e0)));
  assert.equal(JSON.stringify(retour.bareme), JSON.stringify(bareme));
});

test('la liste : ajouter, ôter une classe, « c’est complet », retirer ; les classes retirées et ajoutées d’avant la suivent', () => {
  const { etat } = unite(), vols = VOLS(), ids = C.idsDuProgramme(vols);
  // Une unité d'avant reçoit d'abord sa liste d'aujourd'hui.
  const sans = { ...etat }; delete sans.compagnies;
  const e1 = G.aligner(G.ajouterALaListe(sans, vols, { nom: 'neuve', cabines: ['YC', 'PC'], aCompleter: ['PC'] }), ids);
  assert.deepEqual(e1.compagnies.map(c => c.nom), ['EST', 'NORD', 'OUEST', 'SUD', 'ZEN', 'NEUVE']);
  assert.deepEqual(e1.compagnies.at(-1), { nom: 'NEUVE', classes: ['PC', 'YC'], aCompleter: ['PC'] });
  assert.deepEqual(e1.ajoutees.slice(-2), [{ cie: 'NEUVE', cabine: 'PC' }, { cie: 'NEUVE', cabine: 'YC' }]);
  assert.equal(C.etatEffectif(e1, ids), e1, 'alignées : l’état que le calcul lit est l’état lui-même');
  const e2 = G.complete(e1, 'NEUVE', 'PC');
  assert.deepEqual(e2.compagnies.at(-1), { nom: 'NEUVE', classes: ['PC', 'YC'] });
  // Ôter une classe du programme : elle est retirée ; la remettre : elle revient.
  const e3 = G.aligner(G.classe(e2, vols, 'SUD', 'BC', false), ids);
  assert.ok(e3.exclues.includes('SUD/BC'));
  assert.ok(!G.aligner(G.classe(e3, vols, 'SUD', 'BC', true), ids).exclues.includes('SUD/BC'));
  // Retirer une compagnie : ses commandes ne sont plus dans la journée.
  const e4 = G.aligner(G.retirerDeLaListe(e2, vols, 'SUD'), ids);
  const cmd = J.classesDuProgramme(require('../moteur/production.js').classesDeVols(vols), e4).map(c => c.id);
  assert.ok(!cmd.some(id => /^SUD\/(BC|PC|YC|CREW|SPML)$/.test(id)));
  assert.ok(cmd.includes('NEUVE/YC'));
});
