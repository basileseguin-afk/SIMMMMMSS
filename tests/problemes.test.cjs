/* Le registre des problèmes (problemes.js, refonte du 08/10, étape 4) : un seul
 * registre, bâti sur ce que le site sait déjà, et les nombres des onglets qui
 * en dérivent. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lister, pages, compte } = require('../problemes.js');

const sources = () => ({
  corriger: [
    { code: 'cycle', message: 'Le chemin « Complet » tourne en rond.' },
    { code: 'liste', message: 'Montage : 2 commandes sans équipe.', service: 'montage' },
    { code: 'liste', message: 'Montage : 1 commande sans équipe.', service: 'montage' },
    { code: 'liste', message: 'Prépa : 1 commande sans équipe.', service: 'prepa' }
  ],
  fantomes: [{ id: 'vieux', nom: 'Vieux service', cases: 2, chemins: 1 }],
  liens: [{ texte: 'Magasin fournit sans avoir d’équipe.' }],
  etapes: [
    { id: 'flux', titre: 'Les flux de production', texte: '3 commandes n’ont pas de flux.', page: 'mu-flux' },
    { id: 'services', titre: 'Vos services et leurs équipes', texte: '…', page: 'mu-services',
      services: ['Cuisine', 'Prépa', 'Plonge', 'Dotation', 'Magasin'].map(nom => ({ nom })) }
  ],
  journee: [
    { code: 'poste', message: 'Montage : le poste finit avant le travail.', service: 'montage' },
    { code: 'poste', message: 'Montage : encore 2 commandes à 11:10.', service: 'montage' },
    { code: 'materiel', message: 'Le stock de matériel propre s’épuise à 09:40.' }
  ]
});

test('un registre, trois niveaux, du plus pressant au moins pressant', () => {
  const l = lister(sources());
  assert.deepEqual(l.map(p => p.niveau), ['corriger', 'corriger', 'corriger', 'corriger', 'corriger', 'corriger',
    'completer', 'completer', 'resultat', 'resultat', 'resultat']);
  // Le service supprimé encore cité, d'abord ; il se règle dans la liste des services.
  assert.equal(l[0].titre, '« Vieux service » n’existe plus dans l’unité');
  assert.match(l[0].detail, /^2 cases et 1 chemin le citent encore/);
  assert.equal(l[0].page, 'u-services');
});

test('un point du calcul, un problème, réglé là où il se règle', () => {
  const l = lister(sources()).filter(p => p.niveau === 'corriger');
  // Ses messages disent déjà, service par service, combien de commandes il
  // touche : les pages qui les listent en disent le même nombre.
  const montage = l.filter(p => p.service === 'montage');
  assert.deepEqual(montage.map(p => p.titre), ['Montage : 2 commandes sans équipe.', 'Montage : 1 commande sans équipe.']);
  assert.equal(montage[0].page, 'mu-services', 'il se règle dans la fiche du service');
  const cycle = l.find(p => /tourne en rond/.test(p.titre));
  assert.equal(cycle.page, 'at-chemins', 'sans service, le chemin');
  assert.equal(cycle.service, undefined);
});

test('une étape à compléter nomme ses services, quatre au plus', () => {
  const s = lister(sources()).find(p => p.titre === 'Vos services et leurs équipes');
  assert.equal(s.detail, 'Cuisine, Prépa, Plonge, Dotation et 1 autre : à compléter.');
  assert.equal(lister(sources()).find(p => p.titre === 'Les flux de production').detail, '3 commandes n’ont pas de flux.');
});

test('le nombre d’un onglet compte ce qui s’y règle ; la journée ne compte que dans le registre', () => {
  const l = lister(sources());
  assert.equal(compte(l, 'u-lecture'), 6, 'Contrôles détaillés : tout ce qui est à corriger');
  assert.equal(compte(l, 'mu-pas'), 6, 'Prêt à simuler ? : les points du calcul et les étapes à faire');
  assert.equal(compte(l, 'mu-services'), 4, 'les points des services, et l’étape des services');
  assert.equal(compte(l, 'at-chemins'), 1);
  assert.equal(compte(l, 'j-chiffres'), 0, 'un résultat n’est pas à corriger');
  for (const p of l.filter(x => x.niveau === 'resultat')) assert.deepEqual(pages(p), []);
});

test('le texte en clair, quand le site le donne ; rien à dire, rien de listé', () => {
  const l = lister({ ...sources(), enClair: t => t.replace('tourne en rond', 'boucle') });
  assert.ok(l.some(p => /boucle/.test(p.titre)));
  assert.deepEqual(lister({}), []);
  assert.deepEqual(lister(), []);
});
