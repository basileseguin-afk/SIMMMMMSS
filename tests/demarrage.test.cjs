/* Les étapes du site : elles sont la navigation, et chacune dit son état en
 * clair. Quelqu'un qui n'est pas du métier doit savoir, d'un coup d'œil, où
 * il en est et quoi faire ensuite — elles doivent donc dire vrai. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../demarrage.js');

const neuf = () => ({
  vols: { total: 0, departs: 0, source: 'demo' },
  plan: { services: 11, approx: 0 },
  flux: { liaisons: 0, alertes: 0 },
  ateliers: { total: 0, fabriquent: 0, absentes: 0 },
  bareme: { calibre: false },
  journee: { calculee: false, suivies: 0, aHeure: 0, fin: null }
});
const par = (e) => Object.fromEntries(D.etapes(e).map(s => [s.cle, s]));

test('quatre étapes numérotées, dans l’ordre où l’on pense, puis l’unité à part', () => {
  const l = D.etapes(neuf());
  assert.deepEqual(l.map(s => s.cle), ['vols', 'ateliers', 'bareme', 'journee', 'unite']);
  assert.deepEqual(l.map(s => s.num), [1, 2, 3, 4, null]);
  assert.deepEqual(l.map(s => s.onglet), ['vols', 'ateliers', 'reglages', 'plan', 'flux'],
    'chaque étape ouvre sa vue');
  assert.equal(par(neuf()).unite.annexe, true);
});

test('chaque vue a un titre et une phrase en mots de tous les jours', () => {
  for (const v of ['vols', 'ateliers', 'reglages', 'plan', 'flux']) {
    assert.ok(D.VUES[v].titre, v);
    assert.ok(D.VUES[v].intro.length > 20, v);
    assert.doesNotMatch(D.VUES[v].intro, /atelier|barème|homme-minutes|échéance|compagnie × classe/i,
      'pas de jargon dans la phrase d’accueil de ' + v);
  }
});

test('les vols d’exemple sont « provisoires » (pas une alerte), les vôtres « fait »', () => {
  const e = neuf(); e.vols = { total: 12, departs: 12, source: 'demo' };
  assert.equal(par(e).vols.etat, 'provisoire');
  assert.match(par(e).vols.detail, /12 départs · exemple/);
  e.vols.source = 'importe';
  assert.equal(par(e).vols.etat, 'fait');
  assert.equal(par(e).vols.geste, null, 'rien à proposer quand c’est fait');
});

test('des commandes sans équipe laissent « Qui prépare quoi » à faire', () => {
  const e = neuf();
  assert.equal(par(e).ateliers.etat, 'afaire');
  e.ateliers = { total: 2, fabriquent: 2, absentes: 5 };
  assert.equal(par(e).ateliers.etat, 'afaire', 'ce n’est pas une alerte : c’est ce qui reste à faire');
  assert.equal(par(e).ateliers.detail, '5 commandes sans équipe');
  assert.match(par(e).ateliers.geste, /commandes qui n’en ont pas/);
  e.ateliers.absentes = 0;
  assert.equal(par(e).ateliers.etat, 'fait');
});

test('les temps de travail restent « provisoires » tant que ce sont des chiffres d’exemple', () => {
  assert.equal(par(neuf()).bareme.etat, 'provisoire');
  assert.match(par(neuf()).bareme.detail, /exemple/);
  const e = neuf(); e.bareme.calibre = true;
  assert.equal(par(e).bareme.etat, 'fait');
});

test('la journée dit combien de commandes sont en retard, ou que tout est à l’heure', () => {
  const e = neuf();
  assert.equal(par(e).journee.etat, 'afaire');
  e.journee = { calculee: true, suivies: 10, aHeure: 7, fin: '10:24' };
  assert.equal(par(e).journee.etat, 'verifier');
  assert.equal(par(e).journee.detail, '3 commandes en retard');
  e.journee.aHeure = 10;
  assert.equal(par(e).journee.etat, 'fait');
  assert.match(par(e).journee.detail, /tout est à l’heure · fini à 10:24/);
});

test('l’unité signale les zones à confirmer et les liens à corriger', () => {
  const e = neuf(); e.flux = { liaisons: 16, alertes: 0 };
  assert.equal(par(e).unite.etat, 'fait');
  e.plan.approx = 3;
  assert.equal(par(e).unite.etat, 'provisoire', 'une zone à confirmer n’est pas une alerte');
  e.flux.alertes = 1;
  assert.equal(par(e).unite.etat, 'verifier');
  assert.match(par(e).unite.detail, /3 zones à confirmer · 1 à corriger/);
});

test('la prochaine étape est la première à faire, sinon la première à vérifier', () => {
  const e = neuf();
  e.vols = { total: 12, departs: 12, source: 'demo' };
  // Rien n'est décrit : c'est par les équipes qu'on commence.
  assert.equal(D.suite(D.etapes(e)).etape.cle, 'ateliers');
  assert.match(D.suite(D.etapes(e)).texte, /première équipe/);
  // Une fois les équipes là, restent les vols d'exemple.
  e.ateliers = { total: 1, fabriquent: 1, absentes: 0 };
  assert.equal(D.suite(D.etapes(e)).etape.cle, 'vols');
});

test('tout au vert : plus aucune étape à faire', () => {
  const e = {
    vols: { total: 12, departs: 12, source: 'importe' },
    plan: { services: 11, approx: 0 },
    flux: { liaisons: 16, alertes: 0 },
    ateliers: { total: 3, fabriquent: 3, absentes: 0 },
    bareme: { calibre: true },
    journee: { calculee: true, suivies: 4, aHeure: 4, fin: '09:00' }
  };
  assert.deepEqual(D.etapes(e).map(s => s.etat), ['fait', 'fait', 'fait', 'fait', 'fait']);
  assert.equal(D.suite(D.etapes(e)).etape, null);
});

test('« Comment ça marche » raconte l’histoire en quatre images', () => {
  assert.equal(D.COMMENT.length, 4);
  assert.deepEqual(D.COMMENT.map(c => c.picto), ['avion', 'plateau', 'equipe', 'horloge']);
});

test('les tuiles de l’accueil suivent le rangement du menu : ce qu’on lit, puis ce qu’on règle, avec leur état', () => {
  const t = D.tuiles({ vols: { total: 18, departs: 12, source: 'demo' }, ateliers: { total: 0, fabriquent: 0 },
    bareme: { calibre: false }, journee: {}, plan: { services: 12, approx: 0 }, flux: { liaisons: 16, alertes: 0 },
    chemins: { flux: 2, variantes: 1, sansChemin: 3 },
    reglages: { delai: 50, decalage: -10, rendement: 0.9, pauses: 2 } });
  const par = Object.fromEntries(t.map(x => [x.partie, x]));
  // Une tuile par espace du menu, dans son ordre (évolution 22 a) : Lire ; Vols, L'unité, Simulation.
  assert.deepEqual(t.map(x => x.partie), ['resultats', 'donnees', 'organisation', 'reglages']);
  assert.deepEqual(t.map(x => x.partie), require('../onglets.js').PARTIES.filter(p => !p.cache).map(p => p.id));
  assert.equal(par.donnees.etat, 'provisoire', 'des exemples, pas une alerte');
  assert.match(par.donnees.lignes.map(l => l.texte).join(' | '), /Vols : 12 départs · exemple/);
  // « L'unité » : ses équipes, ses temps par vol, ses chemins (ils en font partie), ses services.
  assert.deepEqual(par.organisation.lignes.map(l => l.texte.split(' : ')[0]), ['Équipes', 'Temps par vol', 'Chemins', '3 commandes sans chemin', 'Unité']);
  assert.match(par.organisation.lignes.map(l => l.texte).join(' | '), /Temps par vol : chiffres d’exemple/);
  assert.match(par.organisation.lignes.map(l => l.texte).join(' | '), /Chemins : 2 chemins · 1 variante/);
  assert.equal(par.organisation.etat, 'afaire', 'la pire de ses lignes');
  assert.match(par.reglages.lignes[0].texte, /Repas prêts 50 min avant le départ · vols décalés de -10 min/);
  assert.match(par.reglages.lignes[1].texte, /Rythme 0,9 · 2 pauses par poste/);
  assert.equal(par.resultats.etat, 'afaire');
});

test('ce qu’il y a à faire ensuite mène à une page qui existe', () => {
  const O = require('../onglets.js');
  for (const page of Object.values(D.PAGE_DE_VUE)) assert.ok(O.page(page), page);
  // Ce qu'on décrit mène à « Services et équipes » (une seule page depuis l'évolution 22 b) ;
  // les alertes de l'unité, à la liste de ce qu'il reste à faire avant de simuler (la première de « Contrôles »).
  for (const v of ['ateliers', 'reglages']) assert.equal(D.PAGE_DE_VUE[v], 'mu-services', v);
  assert.equal(O.page('mu-services').groupe, undefined, '« Services et équipes » est une page, plus un groupe');
  assert.equal(D.PAGE_DE_VUE.flux, 'mu-pas');
  assert.equal(D.PAGE_DE_VUE.flux, O.pagesDuGroupe('controles')[0].id);
});
