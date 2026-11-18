/* « Chemins » (version 1, évolution 22 c) — ce que disent la liste des chemins et le tableau d'une étape, sans
 * navigateur. Chemins, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../chemins-page.js');

const classes = ['NO/BC', 'NO/PC', 'SU/BC', 'SU/YC', 'NO/YC'].map(id => ({ id, cie: id.split('/')[0], cabine: id.split('/')[1] }));
const equipe = x => ({ type: 'manuel', debut: '05:00', jour: 0, personnes: 2, lots: [], pauses: [], ...x });
const etat = (ateliers = []) => ({
  ateliers,
  parcours: [
    { id: 'p3', nom: 'Chemin de SU YC', noeuds: ['dotation', 'montage'], liens: [{ de: 'dotation', vers: 'montage' }] },
    { id: 'p1', nom: 'Complet', type: true, noeuds: ['cuisine', 'montage', 'magasin'], liens: [{ de: 'cuisine', vers: 'montage' }] },
    { id: 'p2', nom: 'Complet · NO PC', type: true, auto: true, noeuds: ['montage'], liens: [] }],
  parcoursCabine: { BC: 'p1', PC: 'p1' },
  parcoursClasse: { 'NO/PC': 'p2', 'SU/YC': 'p3' }
});

test('la liste des chemins : ceux que suivent des classes, leurs variantes, puis les chemins à part — avec leurs commandes et leurs étapes', () => {
  const l = C.chemins(etat(), classes);
  assert.deepEqual(l.map(x => [x.p.id, x.genre, x.commandes.map(c => c.id), x.etapes]), [
    ['p1', 'chemin', ['NO/BC', 'SU/BC'], 3],
    ['p2', 'variante', ['NO/PC'], 1],
    ['p3', 'apart', ['SU/YC'], 2]]);
  assert.deepEqual(l.map(C.compte), ['2 commandes · 3 étapes', '1 commande · 1 étape', '1 commande · 2 étapes']);
  // Sans chemin ni commande : la liste est vide, rien ne casse.
  assert.deepEqual(C.chemins({}, classes), []);
  assert.deepEqual(C.chemins(etat(), []).map(x => x.commandes.length), [0, 0, 0]);
});

test('les commandes sans chemin : ni le leur, ni celui de leur classe', () => {
  assert.deepEqual(C.sansChemin(etat(), classes).map(c => c.id), ['NO/YC']);
  // Sa classe reçoit un chemin : elle en a un.
  const e = etat(); e.parcoursCabine.YC = 'p1';
  assert.deepEqual(C.sansChemin(e, classes), []);
  // Une classe sans chemin : toutes ses commandes sans chemin propre.
  const f = etat(); delete f.parcoursCabine.BC;
  assert.deepEqual(C.sansChemin(f, classes).map(c => c.id), ['NO/BC', 'SU/BC', 'NO/YC']);
});

test('le tableau d’une étape : l’équipe qui prépare la commande ici, ou « à corriger »', () => {
  const e = etat([equipe({ id: 'm1', nom: 'Montage matin', service: 'montage', lots: [['NO/BC']] }),
    equipe({ id: 'm2', nom: 'Montage soir', service: 'montage', lots: [] }),
    equipe({ id: 'd1', nom: 'Magasin', service: 'magasin', type: 'dispo' })]);
  // Une équipe la prépare : elle se choisit parmi celles du service qui préparent.
  const l = C.ligneEtape(e, 'montage', 'NO/BC');
  assert.deepEqual([l.genre, l.equipe.id, l.choix.map(a => a.id)], ['equipe', 'm1', ['m1', 'm2']]);
  // Aucune équipe du service ne la prépare : l'étape serait sautée.
  const s = C.ligneEtape(e, 'montage', 'SU/BC');
  assert.deepEqual([s.genre, s.equipe, s.choix.length], ['aucune', null, 2]);
  // Une mise à disposition sert toutes les commandes : rien à choisir.
  const d = C.ligneEtape(e, 'magasin', 'NO/BC');
  assert.deepEqual([d.genre, d.equipe.id, d.choix], ['commune', 'd1', []]);
  // Un service sans équipe : à corriger, et aucune équipe à choisir.
  assert.deepEqual(C.ligneEtape(e, 'cuisine', 'NO/BC'), { genre: 'aucune', equipe: null, choix: [] });
  // Une équipe d'appui (hors chemin) ne prépare aucune commande : seule dans son service, l'étape reste « à corriger »,
  // comme le calcul le dit ; une plonge ou un chargement servent toutes les commandes.
  const f = etat([equipe({ id: 'ap', nom: 'Dotation hors chemin', service: 'dotation', type: 'appui' }), equipe({ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage' }),
    equipe({ id: 'h', nom: 'Quais', service: 'quais', type: 'handling' })]);
  assert.deepEqual(C.ligneEtape(f, 'dotation', 'NO/BC'), { genre: 'aucune', equipe: null, choix: [] });
  assert.deepEqual([C.ligneEtape(f, 'plonge', 'NO/BC').genre, C.ligneEtape(f, 'quais', 'NO/BC').genre], ['commune', 'commune']);
});

test('une étape faite à la chaîne par l’équipe du service d’avant : elle le dit, ce n’est pas « à corriger »', () => {
  const e = etat([equipe({ id: 'c1', nom: 'Cuisine', service: 'cuisine', fusion: 'montage', lots: [['SU/BC']] }),
    equipe({ id: 'm1', nom: 'Montage matin', service: 'montage', lots: [['NO/BC']] })]);
  const l = C.ligneEtape(e, 'montage', 'SU/BC');
  assert.deepEqual([l.genre, l.equipe.id], ['chaine', 'c1']);
  // La commande que l'équipe du service prépare elle-même garde son équipe.
  assert.equal(C.ligneEtape(e, 'montage', 'NO/BC').genre, 'equipe');
});
