/* L'accueil guide dans l'ordre du travail (évolution 26 f) : les compagnies et leurs commandes, les services et leurs
 * équipes, les chemins, les contrôles, le programme des vols, puis lire le résultat. Chaque étape dit son état en clair
 * et mène à sa page. Quelqu'un qui n'est pas du métier doit savoir, d'un coup d'œil, où il en est et quoi faire
 * ensuite — elles doivent donc dire vrai. Compagnies, vols et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../demarrage.js');
const O = require('../onglets.js');

/** Une unité vide : une liste de compagnies vide, rien de décrit, les vols d'exemple. */
const vide = () => ({
  compagnies: { liste: true, n: 0, commandes: 0 },
  ateliers: { total: 0, fabriquent: 0, absentes: 0 },
  bareme: { calibre: false },
  chemins: { flux: 0, variantes: 0, sansChemin: 0 },
  controles: { bloquants: 0, corriger: 0, pret: false },
  vols: { total: 0, departs: 0, source: 'demo' },
  journee: { calculee: false, suivies: 0, aHeure: 0, fin: null }
});
/** Une unité décrite (sa liste, ses équipes, ses temps, ses chemins), avant tout import : il ne manque que les vols. */
const sansVols = () => ({ ...vide(),
  compagnies: { liste: true, n: 3, commandes: 7 },
  ateliers: { total: 6, fabriquent: 6, absentes: 0 },
  bareme: { calibre: true },
  chemins: { flux: 2, variantes: 1, sansChemin: 0 },
  controles: { bloquants: 0, corriger: 0, pret: true },
  vols: { total: 12, departs: 6, source: 'demo' },
  journee: { calculee: true, suivies: 7, aHeure: 7, fin: '10:24' } });
/** Une unité complète : ses vols importés. */
const complete = () => ({ ...sansVols(), controles: { bloquants: 0, corriger: 0, pret: false }, vols: { total: 30, departs: 15, source: 'importe' } });
const par = e => Object.fromEntries(D.etapes(e).map(s => [s.cle, s]));

test('six étapes, dans l’ordre du travail, chacune vers sa page', () => {
  const l = D.etapes(vide());
  assert.deepEqual(l.map(s => s.cle), ['commandes', 'services', 'chemins', 'controles', 'vols', 'journee']);
  assert.deepEqual(l.map(s => s.num), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(l.map(s => s.titre), ['Commandes', 'Services et équipes', 'Chemins', 'Contrôles', 'Programme des vols', 'Lire le résultat']);
  assert.deepEqual(l.map(s => s.page), ['mu-commandes', 'mu-services', 'mu-flux', 'mu-pas', 'v-programme', 'j-chiffres']);
  // Chaque page existe, et le nom de l'étape est celui de sa page au menu (le résultat : la Synthèse).
  for (const s of l) assert.ok(O.page(s.page), s.page);
  for (const s of l.slice(0, 5)) assert.equal(O.libelle(O.entreeDe(s.page)), s.titre, s.cle);
  // L'ordre du guide est celui du bloc « Régler » au menu, sans « Planche retour » ni « Réglages » ; « Contrôles » y vient
  // avant les vols : le site se vérifie avant l'import (« il ne manque que les vols »).
  const regler = O.entrees().map(o => o.id).filter(id => O.page(id) && O.partieDe(id).bloc === 'regler');
  assert.deepEqual(l.slice(0, 5).map(s => s.page).filter(id => id !== 'mu-pas'), regler.filter(id => !['v-planche', 'rg-simulation', 'mu-pas'].includes(id)));
  assert.ok(l.findIndex(s => s.page === 'mu-pas') < l.findIndex(s => s.page === 'v-programme'));
  for (const s of l) assert.ok(require('../icones.js').TRAITS[s.ico], s.cle + ' : ' + s.ico);
});

test('une unité vide : « À faire ensuite » propose d’ajouter une première compagnie, le panneau d’ajout ouvert', () => {
  const e = vide(), s = D.suite(D.etapes(e));
  assert.deepEqual([par(e).commandes.etat, par(e).commandes.detail], ['afaire', 'aucune compagnie']);
  assert.equal(s.etape.cle, 'commandes');
  assert.equal(s.texte, 'Ajouter une première compagnie');
  assert.deepEqual([s.etape.page, s.etape.lieu], ['mu-commandes', 'ajout']);
  // Même sans aucun vol, c'est par les compagnies qu'on commence.
  assert.equal(par(e).vols.etat, 'afaire');
});

test('les compagnies : la liste est « faite » ; sans liste, elles viennent des vols — « provisoire », pas une alerte', () => {
  const e = sansVols();
  assert.deepEqual([par(e).commandes.etat, par(e).commandes.detail, par(e).commandes.geste], ['fait', '3 compagnies · 7 commandes', null]);
  e.compagnies = { liste: false, n: 5, commandes: 17 };
  assert.equal(par(e).commandes.etat, 'provisoire');
  assert.equal(par(e).commandes.detail, '5 compagnies · 17 commandes · tirées des vols');
  assert.match(par(e).commandes.geste, /liste de compagnies/);
  e.compagnies = { liste: true, n: 1, commandes: 1 };
  assert.equal(par(e).commandes.detail, '1 compagnie · 1 commande');
});

test('les services et leurs équipes : à faire tant qu’une commande n’a personne ; provisoires avec des temps d’exemple', () => {
  const e = sansVols();
  e.ateliers = { total: 0, fabriquent: 0, absentes: 0 };
  assert.deepEqual([par(e).services.etat, par(e).services.detail], ['afaire', 'aucune équipe']);
  assert.match(par(e).services.geste, /première équipe/);
  e.ateliers = { total: 2, fabriquent: 2, absentes: 5 };
  assert.deepEqual([par(e).services.etat, par(e).services.detail], ['afaire', '5 commandes sans équipe']);
  assert.match(par(e).services.geste, /commandes qui n’en ont pas/);
  e.ateliers.absentes = 0; e.bareme.calibre = false;
  assert.deepEqual([par(e).services.etat, par(e).services.detail], ['provisoire', '2 équipes · temps d’exemple']);
  e.bareme.calibre = true;
  assert.deepEqual([par(e).services.etat, par(e).services.detail, par(e).services.geste], ['fait', '2 équipes · vos temps', null]);
});

test('les chemins : à faire sans chemin, ou tant qu’une commande n’en a pas', () => {
  const e = sansVols();
  assert.deepEqual([par(e).chemins.etat, par(e).chemins.detail], ['fait', '2 chemins']);
  e.chemins.sansChemin = 3;
  assert.deepEqual([par(e).chemins.etat, par(e).chemins.detail], ['afaire', '2 chemins · 3 commandes sans chemin']);
  e.chemins = { flux: 0, variantes: 0, sansChemin: 7 };
  assert.deepEqual([par(e).chemins.etat, par(e).chemins.detail], ['afaire', 'aucun chemin']);
});

test('les contrôles : les points bloquants et à corriger, comptés ; sinon « il ne manque que les vols », ou rien à corriger', () => {
  const e = sansVols();
  assert.deepEqual([par(e).controles.etat, par(e).controles.detail], ['fait', 'il ne manque que les vols']);
  e.controles = { bloquants: 1, corriger: 4, pret: false };
  assert.deepEqual([par(e).controles.etat, par(e).controles.detail], ['afaire', '1 point bloquant · 4 à corriger']);
  e.controles = { bloquants: 0, corriger: 2, pret: false };
  assert.deepEqual([par(e).controles.etat, par(e).controles.detail], ['verifier', '2 à corriger']);
  assert.equal(par(complete()).controles.detail, 'rien à corriger');
});

test('le programme des vols : les vols d’exemple sont « provisoires » (pas une alerte), les vôtres « faits »', () => {
  const e = sansVols();
  assert.deepEqual([par(e).vols.etat, par(e).vols.detail, par(e).vols.geste], ['provisoire', '6 départs · exemple', 'Importer vos vols']);
  assert.deepEqual([par(complete()).vols.etat, par(complete()).vols.detail, par(complete()).vols.geste], ['fait', '15 départs · les vôtres', null]);
});

test('lire le résultat : combien de commandes sont en retard, ou que tout est à l’heure ; sans commande, rien à lire', () => {
  const e = complete();
  assert.equal(par(e).journee.detail, 'tout est à l’heure · fini à 10:24');
  e.journee = { calculee: true, suivies: 10, aHeure: 7, fin: '10:24' };
  assert.deepEqual([par(e).journee.etat, par(e).journee.detail], ['verifier', '3 commandes en retard']);
  assert.deepEqual([par(vide()).journee.etat, par(vide()).journee.detail], ['afaire', 'rien à calculer encore']);
  // Une liste vide : aucune commande. Ce que le calcul suit encore (un service par compagnie) n'est pas un résultat à lire.
  const sansCommande = { ...vide(), journee: { calculee: true, suivies: 4, aHeure: 4, fin: '03:00' } };
  assert.deepEqual([par(sansCommande).journee.etat, par(sansCommande).journee.detail], ['afaire', 'rien à calculer encore']);
  const rienDeSuivi = { ...complete(), journee: { calculee: true, suivies: 0, aHeure: 0, fin: null } };
  assert.equal(par(rienDeSuivi).journee.detail, 'rien à calculer encore');
});

test('à faire ensuite : la première étape à faire dans l’ordre du travail, sinon à vérifier, sinon provisoire', () => {
  // Une unité sans vols, décrite : il ne manque que les vols.
  assert.deepEqual([D.suite(D.etapes(sansVols())).etape.cle, D.suite(D.etapes(sansVols())).texte], ['vols', 'Importer vos vols']);
  // Les équipes manquent : elles passent avant les chemins et les vols.
  const e = sansVols(); e.ateliers = { total: 0, fabriquent: 0, absentes: 0 }; e.chemins.sansChemin = 2;
  assert.equal(D.suite(D.etapes(e)).etape.cle, 'services');
  // Un point à corriger passe avant les vols d'exemple.
  const c = sansVols(); c.controles = { bloquants: 0, corriger: 1, pret: false };
  assert.equal(D.suite(D.etapes(c)).etape.cle, 'controles');
  // Une unité complète : plus rien à faire.
  assert.deepEqual(D.etapes(complete()).map(s => s.etat), ['fait', 'fait', 'fait', 'fait', 'fait', 'fait']);
  assert.equal(D.suite(D.etapes(complete())).etape, null);
});

test('« Comment ça marche » raconte l’histoire en quatre images, dans l’ordre du travail', () => {
  assert.equal(D.COMMENT.length, 4);
  assert.deepEqual(D.COMMENT.map(c => c.picto), ['plateau', 'equipe', 'avion', 'horloge']);
  assert.match(D.COMMENT.map(c => c.titre + ' ' + c.texte).join(' | '), /compagnies[^|]*\| [^|]*équipes[^|]*chemin[^|]*\| [^|]*vols[^|]*\| [^|]*calcule/);
});

test('l’accueil : l’histoire, ce qu’il y a à faire ensuite, le guide en six rangées, « Fichiers » ; sans jargon', () => {
  const dessiner = e => { const hote = { innerHTML: '' };
    globalThis.OrlyOnglets = O;
    try { new D.Accueil({ accueil: () => hote, etat: () => e }); } finally { delete globalThis.OrlyOnglets; }
    return hote.innerHTML; };
  const h = dessiner(vide());
  assert.deepEqual([...h.matchAll(/class="acc-etape-tete" data-page="([^"]+)"/g)].map(m => m[1]), ['mu-commandes', 'mu-services', 'mu-flux', 'mu-pas', 'v-programme', 'j-chiffres']);
  assert.match(h, /<p class="acc-suite">[^]*?<button type="button" class="lien-fort" data-page="mu-commandes" data-lieu="ajout">Ajouter une première compagnie →<\/button>/);
  assert.match(h, /data-page="u-sauvegarde">[^]*?Fichiers/);
  assert.doesNotMatch(h.replace(/<[^>]+>/g, ' '), /atelier|barème|homme-minutes|échéance|compagnie × classe/i, 'pas de jargon');
  // Tout est en place : l'accueil mène au résultat.
  assert.match(dessiner(complete()), /<p class="acc-suite fait">[^]*?data-page="j-chiffres">lisez le résultat →/);
});
