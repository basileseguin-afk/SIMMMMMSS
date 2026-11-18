/* Les sous-onglets : chaque vue se découpe en quelques pages courtes. Ce qui
 * compte ici, c'est la carte des onglets et la règle qui masque les autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../onglets.js');

test('chaque vue a ses pages, la première par défaut ; un espace du menu, six entrées au plus', () => {
  // Ce qu'on voit, ce sont les entrées d'un ESPACE du menu, pas les onglets d'une vue ni les pages d'un groupe :
  // c'est sur elles que porte la limite (évolution 22 a : toutes les entrées sont visibles, sans défilement).
  O.conditions.periode = () => true;
  try { for (const p of O.PARTIES) assert.ok(O.menuDe(p.id).length <= 6, p.id + ' : ' + O.menuDe(p.id).length + ' entrées'); }
  finally { delete O.conditions.periode; }
  for (const vue of ['vols', 'ateliers', 'reglages', 'plan', 'flux']) {
    const l = O.ONGLETS[vue];
    // La vue des réglages n'a plus qu'une page : « Services et équipes » a repris ses deux pages de temps par vol (évolution 22 b).
    assert.ok(l && l.length >= (vue === 'reglages' ? 1 : 2), vue + ' : ' + (l || []).length + ' pages');
    assert.equal(O.defaut(vue), l[0].id);
    for (const o of l) assert.ok(o.nom && o.ico, o.id + ' a un nom et un pictogramme');
  }
  assert.equal(O.defaut('inconnue'), null);
});

test('les identifiants sont uniques et désignent leur vue', () => {
  const ids = Object.values(O.ONGLETS).flat().map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(O.vueDe('mu-services'), 'ateliers');
  assert.equal(O.vueDe('j-comparer'), 'plan');
  assert.equal(O.vueDe('u-sauvegarde'), 'flux');
  assert.equal(O.vueDe('rien'), null);
});

test('la règle masque, dans un onglet, ce qui appartient aux autres', () => {
  const r = O.regles();
  for (const o of Object.values(O.ONGLETS).flat())
    assert.ok(r.includes(`body[data-sous="${o.id}"] [data-sous]:not([data-sous~="${o.id}"]){display:none!important}`), o.id);
});

test('les pictogrammes des onglets existent', () => {
  const I = require('../icones.js');
  for (const o of Object.values(O.ONGLETS).flat()) assert.ok(I.TRAITS[o.ico], o.id + ' : ' + o.ico);
});

/* Le menu (évolution 22 a) : deux blocs, quatorze entrées, toutes visibles ; chaque page dans un seul espace. */
test('le menu a quatorze entrées, dans cet ordre : « Lire », puis « Régler » en trois espaces, puis « Fichiers »', () => {
  const noms = () => O.entrees().map(O.libelle);
  // « Période » ne se montre qu'avec un programme daté : treize entrées sans lui, quatorze avec.
  assert.deepEqual(noms(), ['Synthèse', 'En direct', 'Planning', 'Détails', 'Comparer',
    'Programme', 'Retours', 'Services et équipes', 'Chemins', 'Plan', 'Réglages', 'Contrôles', 'Fichiers']);
  O.conditions.periode = () => true;
  try {
    assert.deepEqual(noms(), ['Synthèse', 'En direct', 'Planning', 'Période', 'Détails', 'Comparer',
      'Programme', 'Retours', 'Services et équipes', 'Chemins', 'Plan', 'Réglages', 'Contrôles', 'Fichiers']);
    assert.equal(O.entrees().length, 14);
    const m = O.menu();
    assert.deepEqual(m.blocs.map(b => [b.nom, b.espaces.map(e => [e.nom, e.titre, e.entrees.map(O.libelle)])]), [
      ['Lire', [['Lire', false, ['Synthèse', 'En direct', 'Planning', 'Période', 'Détails', 'Comparer']]]],
      ['Régler', [['Vols', true, ['Programme', 'Retours']], ['L’unité', true, ['Services et équipes', 'Chemins', 'Plan']], ['Simulation', true, ['Réglages', 'Contrôles']]]]
    ]);
    assert.deepEqual(m.bas.map(O.libelle), ['Fichiers']);
  } finally { delete O.conditions.periode; }
  // Une entrée est une page, ou un groupe de pages qui se suivent en onglets internes : aucune mention « Plus ».
  assert.deepEqual(O.entrees().filter(o => o.groupe).map(o => [o.nom, o.pages]), [
    ['Détails', ['at-repas', 'v-departs', 'j-stocks', 'j-details']],
    ['Chemins', ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille']],
    ['Contrôles', ['mu-pas', 'u-lecture']]
  ]);
  assert.ok(!O.PARTIES.flatMap(p => p.pages).some(x => x.plus), 'plus de page « Plus »');
  for (const o of O.entrees()) assert.ok(require('../icones.js').TRAITS[o.ico], O.libelle(o) + ' : ' + o.ico);
  // Deux entrées voisines ne portent pas le même pictogramme.
  const icos = O.entrees().map(o => o.ico);
  icos.forEach((x, i) => assert.notEqual(x, icos[i + 1], O.libelle(O.entrees()[i]) + ' et la suivante : ' + x));
  // L'entrée qui mène à une page : elle-même, ou son groupe ; une page hors du menu a encore la sienne.
  assert.equal(O.entreeDe('mu-services').nom, 'Services et équipes');
  assert.equal(O.entreeDe('at-grille').nom, 'Chemins');
  assert.equal(O.entreeDe('u-liens').nom, 'Chemins');
  assert.equal(O.entreeDe('u-lecture').nom, 'Contrôles');
  assert.equal(O.libelle(O.entreeDe('v-planche')), 'Retours');
  assert.equal(O.libelle(O.entreeDe('u-sauvegarde')), 'Fichiers');
  assert.equal(O.entreeDe('rien'), null);
});

test('chaque page est dans un seul espace, et garde son nom et ses anciens noms', () => {
  const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.equal(new Set(pages).size, pages.length, 'aucune page en double');
  assert.deepEqual([...pages].sort(), Object.values(O.ONGLETS).flat().map(o => o.id).sort(), 'aucune page oubliée');
  assert.deepEqual(O.BLOCS.map(b => b.nom), ['Lire', 'Régler']);
  assert.deepEqual(O.PARTIES.map(p => [p.nom, p.bloc || (p.bas ? 'bas' : '')]), [['Lire', 'lire'], ['Vols', 'regler'], ['L’unité', 'regler'], ['Simulation', 'regler'], ['Fichiers', 'bas']]);
  for (const p of O.PARTIES) for (const x of O.pagesDe(p.id)) {
    assert.ok(x.nom && x.ico && x.vue, x.id);
    assert.ok(x.intro && x.intro.length > 20, x.id + ' : une phrase');
  }
  // Les noms des pages d'avant l'évolution 22 : ils se cherchent toujours (« Aller à… » les propose par leur nom).
  const noms = Object.fromEntries(Object.values(O.ONGLETS).flat().map(o => [o.id, o.nom]));
  assert.deepEqual(noms, { 'v-programme': 'Programme des vols', 'v-planche': 'Planche retour', 'v-departs': 'Vols', 'mu-pas': 'Prêt à simuler ?',
    'mu-carte': 'Vue d’ensemble', 'mu-flux': 'Chemins de production', 'mu-services': 'Services et équipes', 'at-chemins': 'Chemin d’une commande',
    'at-grille': 'Étapes de chaque commande', 'at-planning': 'Planning des équipes', 'at-repas': 'Commandes', 'rg-simulation': 'Réglages de la simulation',
    'j-plan': 'En direct', 'j-chiffres': 'Synthèse', 'j-periode': 'Période', 'j-stocks': 'Stocks et retours', 'j-details': 'Heures sup et renforts',
    'j-comparer': 'Comparer deux essais', 'u-plan': 'Plan de l’unité', 'u-liens': 'Liens entre services',
    'u-lecture': 'Contrôles détaillés', 'u-sauvegarde': 'Sauvegarde et limites' });
});

/* Évolution 22 (b) : « Services et équipes » reprend cinq pages. Elles n'existent plus, mais leur nom, leur identifiant
 * et leurs liens mènent à elle, au bon endroit dedans. */
test('les cinq pages reprises par « Services et équipes » : leur nom et leur identifiant y mènent, au bon endroit', () => {
  assert.deepEqual(Object.entries(O.ANCIENNES).map(([id, a]) => [id, a.nom, a.ancien || '', a.vers, a.lieu]), [
    ['at-recap', 'Horaires des équipes', '', 'mu-services', 'equipes'],
    ['at-equipes', 'Équipes une par une', 'Les cases · Ateliers de travail', 'mu-services', 'equipes'],
    ['rg-recap', 'Temps par vol', 'Heures de travail', 'mu-services', 'temps'],
    ['rg-minutes', 'Temps par vol par service', 'Barème par service', 'mu-services', 'temps'],
    ['u-services', 'Liste des services', '', 'mu-services', 'liste']]);
  const pages = Object.values(O.ONGLETS).flat().map(o => o.id);
  for (const [id, a] of Object.entries(O.ANCIENNES)) {
    assert.ok(!pages.includes(id), id + ' n’est plus une page');
    assert.ok(pages.includes(a.vers), id + ' mène à une page qui existe');
    assert.ok(!O.regles().includes('"' + id + '"'), id + ' : plus de règle d’affichage — ce qui porte encore son nom reste caché');
    // Son identifiant vaut celui de la page qui l'a reprise : sa vue, son espace, son nom, son entrée au menu.
    assert.equal(O.resoudre(id), 'mu-services');
    assert.deepEqual([O.vueDe(id), O.partieDe(id).id, O.page(id).id, O.page(id).nom, O.entreeDe(id).id], ['ateliers', 'organisation', 'mu-services', 'Services et équipes', 'mu-services']);
    assert.equal(O.montree(id), true);
  }
  assert.equal(O.resoudre('j-chiffres'), 'j-chiffres');
  assert.equal(O.resoudre('rien'), 'rien');
  // L'ouvrir ouvre la page qui l'a reprise, puis l'endroit ; un lien peut demander un autre endroit.
  const vus = [];
  const s = new O.SousOnglets({ hote: () => null, vue: () => 'ateliers', lieu: (id, lieu) => vus.push([id, lieu]) });
  s.choisir('rg-recap');
  assert.equal(s.page, 'mu-services');
  assert.deepEqual([s.choix.organisation, s.parVue.ateliers], ['mu-services', 'mu-services'], 'c’est la page nouvelle qui est retenue');
  s.choisir('u-services');
  s.choisir('at-equipes');
  s.choisir('mu-services', undefined, false, 'supprimes');
  s.choisir('u-services', undefined, false, 'supprimes');
  s.choisir('mu-services');
  assert.deepEqual(vus, [['mu-services', 'temps'], ['mu-services', 'liste'], ['mu-services', 'equipes'], ['mu-services', 'supprimes'], ['mu-services', 'supprimes']]);
});

test('une page se range selon sa nature, pas selon l’écran qui la porte', () => {
  const partie = id => O.partieDe(id).id;
  // Ce qu'on importe.
  assert.equal(partie('v-programme'), 'donnees');
  assert.equal(partie('v-planche'), 'donnees');
  // L'unité (évolution 22 a) : ses services et ses équipes, ses chemins, son plan.
  assert.deepEqual([partie('mu-services'), O.page('mu-services').groupe], ['organisation', undefined], '« Services et équipes » : une page, plus un groupe (évolution 22 b)');
  for (const id of ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille', 'u-liens']) assert.deepEqual([partie(id), O.page(id).groupe], ['organisation', 'chemins'], id);
  assert.deepEqual(O.pagesDuGroupe('services'), [], 'plus de groupe « Services et équipes »');
  assert.equal(O.pagesDuGroupe('chemins')[0].id, 'mu-carte', '« Chemins » commence par la vue d’ensemble');
  // Le plan de l'unité a son entrée (refonte, étape 5) : la même toile que le plan rejoué.
  assert.deepEqual([partie('u-plan'), O.page('u-plan').groupe], ['organisation', undefined]);
  assert.equal(O.vueDe('u-plan'), 'plan');
  assert.equal(O.pagesDe('organisation')[0].id, 'mu-services', 'l’unité commence par les services');
  // Plus de partie cachée « Outils avancés », plus de partie « Chemins » à part.
  assert.equal(O.PARTIES.find(p => p.id === 'avance'), undefined);
  assert.equal(O.PARTIES.find(p => p.id === 'chemins'), undefined);
  // Régler, vérifier : la simulation — ses réglages, puis ses contrôles, qui commencent par « Prêt à simuler ? ».
  assert.deepEqual([partie('rg-simulation'), O.page('rg-simulation').groupe], ['reglages', undefined]);
  for (const id of ['mu-pas', 'u-lecture']) assert.deepEqual([partie(id), O.page(id).groupe], ['reglages', 'controles'], id);
  assert.equal(O.pagesDe('reglages')[0].id, 'rg-simulation');
  assert.equal(O.pagesDuGroupe('controles')[0].id, 'mu-pas');
  // Ce qu'on lit : même quand l'écran vit dans la vue des vols ou des équipes.
  for (const id of ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'v-departs', 'j-stocks', 'j-details', 'j-comparer'])
    assert.equal(partie(id), 'resultats', id);
  assert.equal(O.pagesDe('resultats')[0].id, 'j-chiffres', 'on lit d’abord la synthèse');
  assert.equal(O.defaut('plan'), 'j-plan', 'arriver « sur le plan », c’est arriver sur la carte');
  // « Fichiers », en bas du menu.
  assert.deepEqual([partie('u-sauvegarde'), O.partieDe('u-sauvegarde').bas], ['fichier', true]);
  assert.equal(O.partieDe('rien'), null);
  assert.equal(O.page('rien'), null);
});

/* La version 2 (gelée) garde l'organisation d'avant l'évolution 22, avec le calage et le budget en plus. */
test('v2 : l’organisation d’avant, chaque page dans une seule partie', () => {
  delete require.cache[require.resolve('../v2/onglets.js')];
  const V = require('../v2/onglets.js');
  const pages = V.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.equal(new Set(pages).size, pages.length, 'aucune page en double');
  assert.deepEqual([...pages].sort(), Object.values(V.ONGLETS).flat().map(o => o.id).sort(), 'aucune page oubliée');
  assert.deepEqual(V.PARTIES.filter(p => !p.cache).map(p => p.nom), ['Vols', 'Chemins', 'Équipes', 'Simulation', 'Résultats', 'Budget']);
  for (const id of ['mu-pas', 'rg-simulation', 'rg-calage', 'u-lecture']) assert.equal(V.partieDe(id).id, 'reglages', id);
  for (const id of ['mu-carte', 'mu-flux', 'at-chemins', 'u-liens']) assert.equal(V.partieDe(id).id, 'chemins', id);
  // La version 2 est gelée : elle garde ses six parties et ses mentions « Plus » ; la version 1 a son menu en deux blocs
  // (évolution 22 a). Une page commune garde le même identifiant et la même vue dans les deux.
  // (Une page que « Services et équipes » a reprise en version 1 — évolution 22 b — n'y est plus une page : elle mène à elle.)
  const v1 = new Set(Object.values(O.ONGLETS).flat().map(o => o.id));
  for (const id of V.PARTIES.flatMap(p => p.pages.map(x => x.id)).filter(id => v1.has(id))) assert.equal(O.vueDe(id), V.vueDe(id), id + ' : la même vue en v1 et v2');
  for (const id of Object.keys(O.ANCIENNES)) assert.ok(V.page(id), id + ' : toujours une page en version 2');
});

/* Le plan de l'unité est une page de passage (refonte, étape 5) : on l'ouvre
 * pour le modifier, on le quitte par « Terminer ». Ni sa partie ni sa vue ne
 * le rouvrent ensuite d'elles-mêmes. */
test('une page de passage n’est pas retenue', () => {
  const s = new O.SousOnglets({ hote: () => null, vue: () => 'plan' });
  s.choisir('mu-services');
  s.choisir('j-plan');
  s.choisir('u-plan');
  assert.equal(s.page, 'u-plan', 'elle est ouverte');
  assert.equal(s.actifDe('organisation'), 'mu-services', 'l’unité rouvre la page d’avant');
  assert.equal(s.parVue.plan, 'j-plan', 'arriver « sur le plan » rouvre le plan rejoué');
  assert.equal(O.page('u-plan').passage, true);
  for (const o of Object.values(O.ONGLETS).flat().filter(o => o.id !== 'u-plan')) assert.ok(!o.passage, o.id);
});

/* L'application s'ouvre d'elle-même sur la Synthèse quand une journée se calcule (évolution 22 a) : ce n'est pas un
 * choix, la dernière page choisie de l'espace et de la vue reste la même. */
test('la page ouverte au démarrage n’est pas retenue comme un choix', () => {
  const s = new O.SousOnglets({ hote: () => null, vue: () => 'plan' });
  s.choisir('j-comparer');
  assert.deepEqual([s.choix.resultats, s.parVue.plan, s.ouverture], ['j-comparer', 'j-comparer', false]);
  s.choisir('j-chiffres', null, true);
  assert.equal(s.page, 'j-chiffres', 'elle est ouverte');
  assert.equal(s.ouverture, true);
  assert.deepEqual([s.choix.resultats, s.parVue.plan], ['j-comparer', 'j-comparer'], 'le dernier choix reste');
  assert.equal(s.retenue('plan'), 'j-comparer', 'la dernière page choisie de la vue');
  assert.equal(s.actif('plan'), 'j-chiffres', 'la page ouverte, elle, est bien la Synthèse');
  // Le premier vrai choix efface la marque.
  s.choisir('j-plan');
  assert.deepEqual([s.ouverture, s.choix.resultats, s.retenue('plan')], [false, 'j-plan', 'j-plan']);
  assert.equal(new O.SousOnglets({ hote: () => null, vue: () => 'vols' }).retenue('inconnue'), null);
});

test('la page Période ne se montre qu’avec un programme daté (évolution 10)', () => {
  assert.equal(O.page('j-periode').si, 'periode');
  assert.equal(O.partieDe('j-periode').id, 'resultats');
  // Sans condition posée (aucun programme daté) : absente des pages de sa partie.
  assert.equal(O.montree('j-periode'), false);
  assert.ok(!O.pagesDe('resultats').some(x => x.id === 'j-periode'));
  assert.deepEqual(O.pagesDe('resultats').map(x => x.id), ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'v-departs', 'j-stocks', 'j-details', 'j-comparer']);
  O.conditions.periode = () => true;
  try {
    assert.equal(O.montree('j-periode'), true);
    // « En direct » vient juste après la Synthèse (évolution 16 g) ; la période, après le planning (évolution 22 a).
    assert.deepEqual(O.pagesDe('resultats').slice(0, 4).map(x => x.id), ['j-chiffres', 'j-plan', 'at-planning', 'j-periode']);
  } finally { delete O.conditions.periode; }

  assert.equal(O.montree('j-chiffres'), true);
  assert.equal(O.montree('rien'), false);
});

test('le bloc « Lire » (évolution 15 c) : six entrées ; « Détails » en quatre onglets internes ; les anciennes pages restent', () => {
  assert.deepEqual(O.menuDe('resultats').map(o => o.groupe ? 'Détails' : o.id), ['j-chiffres', 'j-plan', 'at-planning', 'Détails', 'j-comparer']);
  O.conditions.periode = () => true;
  try { assert.deepEqual(O.menuDe('resultats').map(o => o.groupe ? 'Détails' : o.id), ['j-chiffres', 'j-plan', 'at-planning', 'j-periode', 'Détails', 'j-comparer']); }
  finally { delete O.conditions.periode; }
  // « En direct » remplace « Le plan rejoué », juste après la Synthèse (évolution 16 g) ; l'ancien nom se cherche toujours.
  const direct = O.ONGLETS.plan.find(x => x.id === 'j-plan');
  assert.deepEqual([direct.nom, direct.ancien], ['En direct', 'Le plan rejoué']);
  assert.deepEqual(O.menuDe('resultats').slice(0, 2).map(o => o.id), ['j-chiffres', 'j-plan']);
  assert.ok(!O.PARTIES.flatMap(p => p.pages).some(x => /plan rejoué/i.test(x.intro || '')));
  // L'ordre des onglets internes : Commandes, Vols, Stocks et retours, Heures sup et renforts.
  assert.deepEqual(O.pagesDuGroupe('details').map(x => [x.id, x.nom]),
    [['at-repas', 'Commandes'], ['v-departs', 'Vols'], ['j-stocks', 'Stocks et retours'], ['j-details', 'Heures sup et renforts']]);
  // « Détails » ouvre la dernière page ouverte du groupe, sinon la première.
  assert.equal(O.menuDe('resultats').find(o => o.groupe).id, 'at-repas');
  assert.equal(O.menuDe('resultats', { 'groupe:details': 'j-stocks' }).find(o => o.groupe).id, 'j-stocks');
  // Les anciens identifiants mènent toujours à leur page ; leur ancien nom se cherche encore.
  for (const id of ['at-repas', 'v-departs', 'j-stocks', 'j-details']) assert.equal(O.partieDe(id).id, 'resultats', id);
  assert.equal(O.page('at-repas').ancien, 'Heure de chaque commande');
  assert.equal(O.page('v-departs').ancien, 'Vols prêts au départ');
  // « Étapes de chaque commande » : un réglage, parmi les onglets de « Chemins ».
  assert.equal(O.page('at-grille').groupe, 'chemins');
  assert.ok(O.menuDe('organisation').find(o => o.groupe === 'chemins').pages.includes('at-grille'));
});

test('« Liens entre services » n’est parmi les onglets de « Chemins » que si une commande n’a pas de chemin ; sinon, la page s’ouvre encore (évolution 19 b)', () => {
  assert.equal(O.page('u-liens').menuSi, 'liens');
  // Les onglets de « Chemins », tels que le menu les donne à son entrée.
  const onglets = ouverte => O.menuDe('organisation', {}, ouverte).find(o => o.groupe === 'chemins').pages;
  try {
    // Toutes les commandes ont un chemin : la page n'a pas son onglet, mais elle se montre — « Aller à… » et ses liens y mènent.
    O.conditions.liens = () => false;
    assert.equal(O.montree('u-liens'), true, 'elle s’ouvre toujours');
    assert.equal(O.auMenu('u-liens'), false);
    assert.deepEqual(onglets(), ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille']);
    assert.ok(O.pagesDe('organisation').some(x => x.id === 'u-liens'), 'la recherche la liste encore');
    // Tant qu'on y est, son onglet est là : on sait où l'on est.
    assert.equal(O.auMenu('u-liens', 'u-liens'), true);
    assert.deepEqual(onglets('u-liens'), ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille', 'u-liens']);
    // Rouvrir « Chemins » ne ramène pas sur une page hors du menu, même si c'était la dernière ouverte.
    const s = new O.SousOnglets({ hote: () => null, vue: () => 'flux' });
    s.choisir('u-liens');
    assert.equal(s.page, 'u-liens', 'elle s’ouvre');
    assert.equal(s.choix['groupe:chemins'], 'u-liens');
    assert.equal(O.menuDe('organisation', s.choix).find(o => o.groupe === 'chemins').id, 'mu-carte', '« Chemins » rouvre sa première page');
    assert.equal(O.menuDe('organisation', s.choix, 'u-liens').find(o => o.groupe === 'chemins').id, 'u-liens', 'tant qu’on y est, l’entrée y mène');
    // Une commande sans chemin : son onglet revient, comme avant.
    O.conditions.liens = () => true;
    assert.equal(O.auMenu('u-liens'), true);
    assert.deepEqual(onglets(), ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille', 'u-liens']);
    assert.equal(O.menuDe('organisation', s.choix).find(o => o.groupe === 'chemins').id, 'u-liens');
    // Sans condition posée (une page qui n'a pas encore branché la sienne) : hors du menu, jamais fermée.
    delete O.conditions.liens;
    assert.equal(O.auMenu('u-liens'), false); assert.equal(O.montree('u-liens'), true);
    // Les autres pages ne changent pas : au menu dès qu'elles se montrent.
    for (const id of ['mu-carte', 'mu-flux', 'at-chemins', 'j-chiffres', 'u-services']) assert.equal(O.auMenu(id), true, id);
    assert.equal(O.auMenu('j-periode'), false, 'une page conditionnelle fermée n’est pas au menu');
  } finally { delete O.conditions.liens; }
});
