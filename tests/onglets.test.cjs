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

/* Le menu (évolution 22 a) : deux blocs, toutes les entrées visibles ; chaque page dans un seul espace. Évolution 23 (a) :
 * « Plan » en sort — treize entrées, contre quatorze. */
test('le menu a treize entrées, dans cet ordre : « Lire », puis « Régler » en trois espaces, puis « Fichiers »', () => {
  const noms = () => O.entrees().map(O.libelle);
  // « Période » ne se montre qu'avec un programme daté : douze entrées sans lui, treize avec.
  assert.deepEqual(noms(), ['Synthèse', 'En direct', 'Planning', 'Détails', 'Comparer',
    'Programme', 'Retours', 'Services et équipes', 'Chemins', 'Réglages', 'Contrôles', 'Fichiers']);
  O.conditions.periode = () => true;
  try {
    assert.deepEqual(noms(), ['Synthèse', 'En direct', 'Planning', 'Période', 'Détails', 'Comparer',
      'Programme', 'Retours', 'Services et équipes', 'Chemins', 'Réglages', 'Contrôles', 'Fichiers']);
    assert.equal(O.entrees().length, 13);
    const m = O.menu();
    assert.deepEqual(m.blocs.map(b => [b.nom, b.espaces.map(e => [e.nom, e.titre, e.entrees.map(O.libelle)])]), [
      ['Lire', [['Lire', false, ['Synthèse', 'En direct', 'Planning', 'Période', 'Détails', 'Comparer']]]],
      ['Régler', [['Vols', true, ['Programme', 'Retours']], ['L’unité', true, ['Services et équipes', 'Chemins']], ['Simulation', true, ['Réglages', 'Contrôles']]]]
    ]);
    assert.deepEqual(m.bas.map(O.libelle), ['Fichiers']);
  } finally { delete O.conditions.periode; }
  // Une entrée est une page, ou un groupe de pages qui se suivent en onglets internes : aucune mention « Plus ».
  // (« Contrôles » est une page depuis l'évolution 22 d : il ne reste qu'un groupe, « Détails ».)
  assert.deepEqual(O.entrees().filter(o => o.groupe).map(o => [o.nom, o.pages]), [
    ['Détails', ['at-repas', 'v-departs', 'j-stocks', 'j-details']]
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
  assert.deepEqual(noms, { 'v-programme': 'Programme des vols', 'v-planche': 'Planche retour', 'v-departs': 'Vols', 'mu-pas': 'Contrôles',
    'mu-flux': 'Chemins', 'mu-services': 'Services et équipes', 'at-planning': 'Planning des équipes', 'at-repas': 'Commandes', 'rg-simulation': 'Réglages de la simulation',
    'j-plan': 'En direct', 'j-chiffres': 'Synthèse', 'j-periode': 'Période', 'j-stocks': 'Stocks et retours', 'j-details': 'Heures sup et renforts',
    'j-comparer': 'Comparer deux essais', 'u-plan': 'Plan de l’unité', 'u-liens': 'Liens entre services',
    'u-sauvegarde': 'Fichiers' });
});

/* Évolution 22 (b) : « Services et équipes » reprend cinq pages. Elles n'existent plus, mais leur nom, leur identifiant
 * et leurs liens mènent à elle, au bon endroit dedans. Évolution 22 (c) : « Chemins » en reprend trois, et garde le nom
 * d'avant de la sienne (« Chemins de production », sous une clé qui n'est pas une page). Évolution 22 (d) : « Contrôles »
 * reprend « Contrôles détaillés », et garde le nom d'avant de sa page (« Prêt à simuler ? ») et celui du panneau
 * « Problèmes », sous deux clés qui ne sont pas des pages. */
test('les pages reprises par « Services et équipes », « Chemins » et « Contrôles » : leur nom et leur identifiant y mènent, au bon endroit', () => {
  const REPRISES = { 'mu-services': ['organisation', 'Services et équipes'], 'mu-flux': ['organisation', 'Chemins'], 'mu-pas': ['reglages', 'Contrôles'] };
  assert.deepEqual(Object.entries(O.ANCIENNES).map(([id, a]) => [id, a.nom, a.ancien || '', a.vers, a.lieu]), [
    ['at-recap', 'Horaires des équipes', '', 'mu-services', 'equipes'],
    ['at-equipes', 'Équipes une par une', 'Les cases · Ateliers de travail', 'mu-services', 'equipes'],
    ['rg-recap', 'Temps par vol', 'Heures de travail', 'mu-services', 'temps'],
    ['rg-minutes', 'Temps par vol par service', 'Barème par service', 'mu-services', 'temps'],
    ['u-services', 'Liste des services', '', 'mu-services', 'liste'],
    ['mu-carte', 'Vue d’ensemble', '', 'mu-flux', 'liste'],
    ['mu-flux:avant', 'Chemins de production', '', 'mu-flux', 'liste'],
    ['at-chemins', 'Chemin d’une commande', '', 'mu-flux', 'etapes'],
    ['at-grille', 'Étapes de chaque commande', '', 'mu-flux', 'etapes'],
    ['mu-pas:avant', 'Prêt à simuler ?', '', 'mu-pas', undefined],
    ['u-lecture', 'Contrôles détaillés', '', 'mu-pas', undefined],
    ['mu-pas:problemes', 'Problèmes', '', 'mu-pas', undefined]]);
  const pages = Object.values(O.ONGLETS).flat().map(o => o.id);
  for (const [id, a] of Object.entries(O.ANCIENNES)) {
    assert.ok(!pages.includes(id), id + ' n’est plus une page');
    assert.ok(pages.includes(a.vers), id + ' mène à une page qui existe');
    assert.ok(!O.regles().includes('"' + id + '"'), id + ' : plus de règle d’affichage — ce qui porte encore son nom reste caché');
    // Son identifiant vaut celui de la page qui l'a reprise : sa vue, son espace, son nom, son entrée au menu.
    assert.equal(O.resoudre(id), a.vers);
    assert.deepEqual([O.vueDe(id), O.partieDe(id).id, O.page(id).id, O.page(id).nom, O.entreeDe(id).id], ['ateliers', REPRISES[a.vers][0], a.vers, REPRISES[a.vers][1], a.vers]);
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
  // Les pages que « Chemins » a reprises : la liste des chemins, ou le tableau d'une étape.
  vus.length = 0;
  for (const id of ['mu-carte', 'at-chemins', 'at-grille', 'mu-flux:avant', 'mu-flux']) { s.choisir(id); assert.equal(s.page, 'mu-flux', id); }
  assert.deepEqual(vus, [['mu-flux', 'liste'], ['mu-flux', 'etapes'], ['mu-flux', 'etapes'], ['mu-flux', 'liste']]);
  assert.equal(s.choix.organisation, 'mu-flux');
  // Celles de « Contrôles » : la page, sans endroit.
  vus.length = 0;
  for (const id of ['u-lecture', 'mu-pas:avant', 'mu-pas:problemes', 'mu-pas']) { s.choisir(id); assert.equal(s.page, 'mu-pas', id); }
  assert.deepEqual(vus, []);
  assert.equal(s.choix.reglages, 'mu-pas');
});

test('une page se range selon sa nature, pas selon l’écran qui la porte', () => {
  const partie = id => O.partieDe(id).id;
  // Ce qu'on importe.
  assert.equal(partie('v-programme'), 'donnees');
  assert.equal(partie('v-planche'), 'donnees');
  // L'unité (évolution 22 a) : ses services et ses équipes, ses chemins, son plan.
  assert.deepEqual([partie('mu-services'), O.page('mu-services').groupe], ['organisation', undefined], '« Services et équipes » : une page, plus un groupe (évolution 22 b)');
  // « Chemins » : une page, plus un groupe (évolution 22 c) ; les pages qu'elle a reprises y mènent ; « Liens entre services » s'ouvre depuis elle.
  for (const id of ['mu-carte', 'mu-flux', 'at-chemins', 'at-grille']) assert.deepEqual([partie(id), O.page(id).id, O.page(id).groupe], ['organisation', 'mu-flux', undefined], id);
  assert.deepEqual([partie('u-liens'), O.page('u-liens').groupe, O.page('u-liens').sous], ['organisation', undefined, 'mu-flux']);
  assert.deepEqual(O.pagesDuGroupe('services'), [], 'plus de groupe « Services et équipes »');
  assert.deepEqual(O.pagesDuGroupe('chemins'), [], 'plus de groupe « Chemins »');
  assert.equal(O.GROUPES.chemins, undefined);
  // Le plan de l'unité a son entrée (refonte, étape 5) : la même toile que le plan rejoué.
  assert.deepEqual([partie('u-plan'), O.page('u-plan').groupe], ['organisation', undefined]);
  assert.equal(O.vueDe('u-plan'), 'plan');
  assert.equal(O.pagesDe('organisation')[0].id, 'mu-services', 'l’unité commence par les services');
  // Plus de partie cachée « Outils avancés », plus de partie « Chemins » à part.
  assert.equal(O.PARTIES.find(p => p.id === 'avance'), undefined);
  assert.equal(O.PARTIES.find(p => p.id === 'chemins'), undefined);
  // Régler, vérifier : la simulation — ses réglages, puis « Contrôles », une page (évolution 22 d) ; « Contrôles
  // détaillés » y mène.
  assert.deepEqual([partie('rg-simulation'), O.page('rg-simulation').groupe], ['reglages', undefined]);
  for (const id of ['mu-pas', 'u-lecture']) assert.deepEqual([partie(id), O.page(id).id, O.page(id).groupe], ['reglages', 'mu-pas', undefined], id);
  assert.equal(O.pagesDe('reglages')[0].id, 'rg-simulation');
  assert.deepEqual(O.pagesDuGroupe('controles'), [], 'plus de groupe « Contrôles »');
  assert.equal(O.GROUPES.controles, undefined);
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
  for (const id of Object.keys(O.ANCIENNES).filter(id => !id.includes(':'))) assert.ok(V.page(id), id + ' : toujours une page en version 2');
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
  // « Étapes de chaque commande » n'est plus une page (évolution 22 c) : son identifiant mène à « Chemins ».
  assert.equal(O.page('at-grille').id, 'mu-flux');
  assert.deepEqual(O.menuDe('organisation').map(o => o.id), ['mu-services', 'mu-flux']);
});

test('« Liens entre services » n’est jamais au menu : la page s’ouvre depuis « Chemins », qui reste marquée (évolutions 19 b et 22 c)', () => {
  assert.deepEqual([O.page('u-liens').sous, O.page('u-liens').menuSi], ['mu-flux', undefined]);
  const entrees = ouverte => O.menuDe('organisation', {}, ouverte).map(o => o.id);
  try {
    // Avec ou sans commande sans chemin, et même ouverte : jamais une entrée du menu — quatorze entrées, pas une de plus.
    for (const liens of [() => false, () => true, undefined]) {
      if (liens) O.conditions.liens = liens; else delete O.conditions.liens;
      assert.equal(O.montree('u-liens'), true, 'elle s’ouvre toujours : « Aller à… » et le lien de « Chemins » y mènent');
      assert.equal(O.auMenu('u-liens'), false);
      assert.equal(O.auMenu('u-liens', 'u-liens'), false);
      assert.deepEqual(entrees(), ['mu-services', 'mu-flux']);
      assert.deepEqual(entrees('u-liens'), ['mu-services', 'mu-flux']);
    }
    assert.ok(O.pagesDe('organisation').some(x => x.id === 'u-liens'), 'la recherche la liste encore');
    // Tant qu'on y est, « Chemins » est l'entrée marquée : on sait où l'on est.
    assert.equal(O.entreeDe('u-liens').id, 'mu-flux');
    // Elle s'ouvre, mais n'est pas retenue : l'espace et la vue rouvrent la page d'avant.
    const s = new O.SousOnglets({ hote: () => null, vue: () => 'flux' });
    s.choisir('mu-flux');
    s.choisir('u-liens');
    assert.equal(s.page, 'u-liens', 'elle s’ouvre');
    assert.equal(s.choix.organisation, 'mu-flux', 'l’espace rouvre « Chemins »');
    assert.equal((s.parVue || {}).flux, undefined);
    // Les autres pages ne changent pas : au menu dès qu'elles se montrent.
    for (const id of ['mu-flux', 'mu-services', 'j-chiffres', 'u-services', 'at-chemins']) assert.equal(O.auMenu(id), true, id);
    assert.equal(O.auMenu('j-periode'), false, 'une page conditionnelle fermée n’est pas au menu');
  } finally { delete O.conditions.liens; }
});

/* Évolution 23 (a) : le plan de l'unité ne sert pas — ni la page qui le dessine, ni la vue qui rejoue la journée dessus.
 * Ils quittent l'écran, pas l'application : la page du plan s'ouvre par « Aller à… » et depuis la fiche d'un service ; la
 * vue à plat, par « Aller à… » seulement. */
test('« Plan » n’est plus au menu : la page s’ouvre toujours, depuis « Services et équipes », qui reste marquée (évolution 23 a)', () => {
  assert.equal(O.page('u-plan').sous, 'mu-services');
  assert.equal(O.montree('u-plan'), true, 'elle s’ouvre : « Aller à… » et le lien d’un service y mènent');
  assert.equal(O.auMenu('u-plan'), false);
  assert.equal(O.auMenu('u-plan', 'u-plan'), false, 'même ouverte, elle n’est pas une entrée');
  assert.ok(O.pagesDe('organisation').some(x => x.id === 'u-plan'), 'la recherche la liste encore');
  assert.deepEqual([O.page('u-plan').nom, O.page('u-plan').court, O.partieDe('u-plan').id, O.vueDe('u-plan')], ['Plan de l’unité', 'Plan', 'organisation', 'plan']);
  assert.equal(O.entreeDe('u-plan').id, 'mu-services', 'tant qu’on y est, « Services et équipes » est l’entrée marquée');
  const s = new O.SousOnglets({ hote: () => null, vue: () => 'plan' });
  s.choisir('mu-flux');
  s.choisir('u-plan');
  assert.equal(s.page, 'u-plan', 'elle s’ouvre');
  assert.equal(s.choix.organisation, 'mu-flux', 'elle n’est pas retenue : l’espace rouvre la page d’avant');
});

test('la vue à plat de « En direct » ne s’ouvre que par son nom, et mène à « En direct », à plat (évolution 23 a)', () => {
  assert.deepEqual(Object.entries(O.PAR_NOM).map(([id, a]) => [id, a.nom, a.vers, a.lieu]), [['j-plan:plat', 'En direct, à plat', 'j-plan', 'plat']]);
  // Ce n'est ni une page, ni une entrée du menu, ni une page d'avant : seulement un nom que « Aller à… » trouve.
  assert.ok(!Object.values(O.ONGLETS).flat().some(o => o.id === 'j-plan:plat'));
  assert.ok(!O.ANCIENNES['j-plan:plat']);
  assert.ok(!O.regles().includes('j-plan:plat'));
  assert.equal(O.resoudre('j-plan:plat'), 'j-plan');
  assert.equal(O.entreeDe('j-plan:plat').id, 'j-plan');
  const lieux = [], changements = [];
  const s = new O.SousOnglets({ hote: () => null, vue: () => 'plan', change: (vue, id) => changements.push(id), lieu: (id, lieu) => lieux.push([id, lieu]) });
  s.choisir('j-plan:plat');
  assert.deepEqual([s.page, lieux, changements], ['j-plan', [['j-plan', 'plat']], ['j-plan']], '« En direct » s’ouvre, et la page apprend qu’on la veut à plat');
  // Par le menu, « En direct » s'ouvre sans endroit : en relief (c'est la page qui le fait, à chaque ouverture).
  s.choisir('j-plan');
  assert.deepEqual(lieux, [['j-plan', 'plat']], 'aucun endroit demandé');
  assert.deepEqual(changements, ['j-plan', 'j-plan'], 'la page est prévenue à chaque ouverture, même si elle était déjà ouverte');
});

/* Évolution 23 (b) : la barre « Journée de vols » d'un programme daté ne s'affiche que là où le jour compte — les pages
 * du bloc « Lire », « Programme », « Retours » et « Contrôles » ; pas là où l'on règle l'unité, ni dans « Fichiers ». */
test('la barre du jour : sur les pages où le jour compte, et elles seules (évolution 23 b)', () => {
  assert.deepEqual(O.pagesDuJour(), ['j-chiffres', 'j-plan', 'at-planning', 'j-periode', 'at-repas', 'v-departs', 'j-stocks', 'j-details', 'j-comparer',
    'v-programme', 'v-planche', 'mu-pas']);
  for (const id of ['mu-services', 'mu-flux', 'u-liens', 'u-plan', 'rg-simulation', 'u-sauvegarde']) assert.equal(O.avecJour(id), false, id + ' : pas de barre du jour');
  for (const id of O.pagesDuJour()) assert.equal(O.avecJour(id), true, id);
  // Une page d'avant vaut la page qui l'a reprise ; la vue à plat, « En direct ».
  assert.deepEqual([O.avecJour('at-recap'), O.avecJour('u-lecture'), O.avecJour('j-plan:plat'), O.avecJour('rien')], [false, true, true, false]);
  // Toutes les pages du bloc « Lire » y sont : ce qu'on y lit est la journée d'un jour.
  const lire = O.PARTIES.filter(p => p.bloc === 'lire').flatMap(p => p.pages.map(x => x.id));
  assert.deepEqual(lire.filter(id => !O.avecJour(id)), []);
});

test('le menu, quand des pages sont fermées : une entrée qui se lit encore passe sous « Lire » (évolution 23 d)', () => {
  const noms = m => m.blocs.map(b => [b.nom, b.espaces.map(e => [e.nom, e.entrees.map(O.libelle)])]);
  const avant = O.menu();
  // Sans page fermée — pas de fonction, ou une fonction qui ne ferme rien : le menu d'avant, champ par champ.
  assert.deepEqual(O.menu({}, undefined, null), avant);
  assert.deepEqual(O.menu({}, undefined, () => false), avant);
  // Le bloc « Régler » fermé, sauf « Contrôles » : elle passe à la suite de « Lire » ; son bloc ne garde que ses entrées fermées.
  const regler = new Set(O.PARTIES.filter(p => p.bloc === 'regler').flatMap(p => p.pages.map(x => x.id)));
  const m = O.menu({}, undefined, id => regler.has(id) && id !== 'mu-pas');
  assert.deepEqual(noms(m), [
    ['Lire', [['Lire', ['Synthèse', 'En direct', 'Planning', 'Détails', 'Comparer', 'Contrôles']]]],
    ['Régler', [['Vols', ['Programme', 'Retours']], ['L’unité', ['Services et équipes', 'Chemins']], ['Simulation', ['Réglages']]]]
  ]);
  assert.deepEqual(m.bas.map(O.libelle), ['Fichiers']);
  // L'entrée est la même : son identifiant, son pictogramme, son nom.
  assert.deepEqual(m.blocs[0].espaces[0].entrees.at(-1), avant.blocs[1].espaces[2].entrees[1]);
  // Rien n'est modifié en place : le menu d'après est celui d'avant.
  assert.deepEqual(O.menu(), avant);
  // Un bloc fermé en entier, ou ouvert en entier, ne perd ni ne donne rien.
  assert.deepEqual(noms(O.menu({}, undefined, id => regler.has(id))), noms(avant));
  // Le premier bloc ne donne jamais ses entrées : une page fermée y reste (c'est à la page de dire qu'elle l'est).
  assert.deepEqual(noms(O.menu({}, undefined, id => id === 'j-plan')), noms(avant));
});
