/* Évolution 19 (d) — un problème est un problème. Le module avis.js range ce
 * que le site sait déjà en trois niveaux, avec les mêmes mots partout :
 * « bloquant » (le calcul ne se fait pas, ou une commande n'est préparée par
 * personne), « à corriger » (le calcul se fait, mais il est faux pour une
 * part), « information » (rien à faire). Le compteur ne compte que les deux
 * premiers ; les informations se lisent repliées, sous les autres.
 * Aucune donnée de l'unité : des services, des équipes et des vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../avis.js');

const sources = () => ({
  anomalies: [
    { code: 'commande-absente', message: 'Montage : SUD/YC n’a aucun vol ce jour-là : elle n’est pas dans la journée.', service: 'montage' },
    { code: 'handling-sans', message: '2 vols EST : aucun handling ne charge cette compagnie.' },
    { code: 'cycle', message: 'Le chemin « Complet » tourne en rond.' },
    { code: 'poste', message: 'Montage : le poste finit avant le travail.', service: 'montage' },
    { code: 'bareme', message: 'Dressage : aucun temps par vol pour « Dressage ».', service: 'dressage' }
  ],
  fantomes: [{ id: 'vieux', nom: 'Vieux service', cases: 2, chemins: 1 }],
  liens: [
    { texte: 'Quais ne livre à personne. Normal en bout de chaîne.', grave: false },
    { texte: 'Magasin fournit sans avoir d’équipe.', grave: true }
  ],
  etapes: [
    { id: 'flux', titre: 'Les chemins de production', texte: '3 commandes n’ont pas de chemin.', page: 'mu-flux' },
    { id: 'services', titre: 'Vos services et leurs équipes', texte: '…', page: 'mu-services',
      services: ['Cuisine', 'Prépa', 'Plonge', 'Dotation', 'Magasin'].map(nom => ({ nom })) },
    { id: 'commandes', titre: 'Chaque commande a quelqu’un pour la préparer', texte: '2 commandes ne sont préparées par aucune équipe : cochez-les dans l’équipe qui les prépare.', page: 'mu-services' }
  ]
});
const niveaux = l => l.map(p => p.niveau);

test('trois niveaux, les mêmes mots : « Bloquant », « À corriger », « Information »', () => {
  assert.deepEqual(A.NIVEAUX.map(n => [n.id, n.nom, n.probleme]), [['bloquant', 'Bloquant', true], ['corriger', 'À corriger', true], ['information', 'Information', false]]);
  // Chaque niveau se dit en une phrase : celle de sa définition.
  assert.match(A.NIVEAUX[0].dit, /^Le calcul ne se fait pas, ou une commande n’est préparée par personne\.$/);
  assert.match(A.NIVEAUX[1].dit, /^Le calcul se fait, mais il est faux pour une part\.$/);
  assert.match(A.NIVEAUX[2].dit, /^Rien à faire\.$/);
});

test('un point du calcul prend son niveau de son code', () => {
  // Une compagnie qu'aucun handling ne charge : le calcul se fait, faux pour une part.
  assert.equal(A.niveauDuCode('handling-sans'), 'corriger');
  assert.equal(A.niveauDuCode('bareme'), 'corriger');
  assert.equal(A.niveauDuCode('parcours-trou'), 'corriger');
  // Une commande sans vol ce jour-là, et ce que la journée montre : rien à faire.
  assert.equal(A.niveauDuCode('commande-absente'), 'information');
  for (const c of A.JOURNEE) assert.equal(A.niveauDuCode(c), 'information', c);
  assert.deepEqual(A.JOURNEE, ['poste', 'materiel', 'bouchon', 'inacheve', 'plonge-fermee', 'plonge-vol', 'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs']);
  // Ce qui arrête le calcul, et un code qu'on ne connaît pas : bloquant.
  assert.equal(A.niveauDuCode('cycle'), 'bloquant');
  assert.equal(A.niveauDuCode('debit'), 'bloquant');
  assert.equal(A.niveauDuCode('un-code-de-demain'), 'bloquant');
  assert.equal(A.niveauDuCode(undefined), 'bloquant');
});

test('« bloquant » est ce que le moteur refuse : les codes qu’il laisse passer sont « à corriger » ou « information », ni plus ni moins', () => {
  // Le moteur garde pour lui la liste des points qui n'arrêtent pas le calcul : on la relit dans sa source.
  const source = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'production.js'), 'utf8');
  const m = source.match(/const NON_BLOQUANTES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'la liste du moteur se lit');
  const duMoteur = [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
  assert.ok(duMoteur.length > 20, 'la liste du moteur est lue en entier');
  assert.deepEqual([...A.A_CORRIGER, ...A.INFORMATIONS].sort(), duMoteur);
  // Aucun code dans deux niveaux.
  assert.equal(new Set([...A.A_CORRIGER, ...A.INFORMATIONS]).size, A.A_CORRIGER.length + A.INFORMATIONS.length);
});

test('le registre : du bloquant à l’information, chacun à son niveau', () => {
  const l = A.lister(sources());
  assert.deepEqual(niveaux(l), ['bloquant', 'bloquant', 'corriger', 'corriger', 'corriger', 'corriger', 'corriger', 'corriger',
    'information', 'information', 'information']);
  const de = n => l.filter(p => p.niveau === n).map(p => p.titre);
  // Bloquant : ce que le calcul refuse, une commande que personne ne prépare.
  assert.deepEqual(de('bloquant'), ['Le chemin « Complet » tourne en rond.', 'Chaque commande a quelqu’un pour la préparer']);
  assert.match(l[1].detail, /^2 commandes ne sont préparées par aucune équipe/);
  // À corriger : le service supprimé encore cité, les points du calcul, les liens, les étapes à faire.
  assert.deepEqual(de('corriger'), ['« Vieux service » n’existe plus dans l’unité', '2 vols EST : aucun handling ne charge cette compagnie.',
    'Dressage : aucun temps par vol pour « Dressage ».', 'Magasin fournit sans avoir d’équipe.', 'Les chemins de production', 'Vos services et leurs équipes']);
  assert.match(l[2].detail, /^2 équipes et 1 chemin le citent encore/);
  assert.equal(l[7].detail, 'Cuisine, Prépa, Plonge, Dotation et 1 autre : à corriger.');
  // Information : une commande sans vol ce jour-là, ce que la journée montre, un service en bout de chaîne.
  assert.deepEqual(de('information'), ['Montage : SUD/YC n’a aucun vol ce jour-là : elle n’est pas dans la journée.', 'Montage : le poste finit avant le travail.',
    'Quais ne livre à personne. Normal en bout de chaîne.']);
});

test('sans vol, rien ne se calcule : l’étape des vols est bloquante', () => {
  const l = A.lister({ etapes: [{ id: 'vols', titre: 'Les vols de la journée', texte: 'Aucun vol : importez votre programme.', page: 'v-programme' }] });
  assert.deepEqual(l.map(p => [p.niveau, p.titre, p.detail, p.page]), [['bloquant', 'Les vols de la journée', 'Aucun vol : importez votre programme.', 'v-programme']]);
});

test('chaque avis mène à la page où il se règle ; le texte du moteur passe par les mots de la page', () => {
  const l = A.lister({ ...sources(), enClair: t => t.replace('SUD/YC', 'Sud · Éco') });
  const par = t => l.find(p => p.titre.startsWith(t));
  assert.deepEqual([par('Le chemin').page, par('Le chemin').service], ['at-chemins', undefined]);
  assert.deepEqual([par('Dressage').page, par('Dressage').service], ['mu-services', 'dressage']);
  assert.equal(par('« Vieux service »').page, 'u-services');
  assert.equal(par('Magasin').page, 'u-lecture');
  assert.equal(par('Les chemins').page, 'mu-flux');
  // Ce que la journée montre se lit dans les résultats ; une commande sans vol, dans son service.
  assert.equal(par('Montage : le poste').page, 'j-chiffres');
  assert.deepEqual([par('Montage : Sud · Éco').page, par('Montage : Sud · Éco').service], ['mu-services', 'montage']);
});

test('le compteur ne compte que « bloquant » et « à corriger » : une commande sans vol n’est pas comptée', () => {
  const l = A.lister(sources());
  assert.equal(l.length, 11);
  assert.equal(A.compte(l), 8);
  assert.deepEqual(A.parNiveau(l), { bloquant: 2, corriger: 6, information: 3 });
  // Une unité où il n'y a que des informations : aucun problème.
  const infos = A.lister({ anomalies: sources().anomalies.filter(a => a.code === 'commande-absente' || a.code === 'poste') });
  assert.deepEqual(niveaux(infos), ['information', 'information']);
  assert.equal(A.compte(infos), 0);
  // Le nombre d'un onglet : ce qui se règle sur sa page ; une information n'y compte jamais.
  assert.equal(A.compte(l, 'mu-services'), 3);      // la commande sans équipe, Dressage, l'étape des services ; la commande sans vol n'y est pas
  assert.equal(A.compte(l, 'j-chiffres'), 0);
  assert.equal(A.compte(l, 'u-lecture'), 5);
  for (const p of l.filter(x => x.niveau === 'information')) assert.deepEqual(A.pages(p), []);
});

test('les nombres se disent avec les mots des niveaux', () => {
  assert.equal(A.dire(1, 'bloquant'), '1 bloquant');
  assert.equal(A.dire(2, 'bloquant'), '2 bloquants');
  assert.equal(A.dire(1, 'corriger'), '1 à corriger');
  assert.equal(A.dire(4, 'corriger'), '4 à corriger');
  assert.equal(A.dire(1, 'information'), '1 information');
  assert.equal(A.dire(3, 'information'), '3 informations');
  const l = A.lister(sources());
  assert.equal(A.resume(l), '2 bloquants · 6 à corriger');
  assert.equal(A.resume(l.filter(p => p.niveau !== 'bloquant')), '6 à corriger');
  assert.equal(A.resume(l.filter(p => p.niveau === 'information')), '');
  // Le ton d'un nombre : rouge s'il y a un bloquant, ambre sinon.
  assert.equal(A.ton(l), 'retard');
  assert.equal(A.ton(l.filter(p => p.niveau !== 'bloquant')), 'attente');
  assert.equal(A.ton(l.filter(p => p.niveau === 'information')), '');
});

test('le panneau : les deux premiers niveaux, puis les informations repliées, dessous', () => {
  const l = A.lister(sources());
  const html = A.panneau(l, id => 'Page ' + id);
  assert.match(html, /<h2 id="problemes-titre">Problèmes<\/h2>\s*<span class="pb-total">2 bloquants · 6 à corriger<\/span>/);
  const iB = html.indexOf('pb-groupe bloquant'), iC = html.indexOf('pb-groupe corriger'), iI = html.indexOf('pb-groupe information');
  assert.ok(iB > 0 && iB < iC && iC < iI, 'bloquant, à corriger, puis information');
  assert.match(html, /<section class="pb-groupe bloquant"><h3>[^]*?Bloquant<span>2<\/span><\/h3>/);
  assert.match(html, /<section class="pb-groupe corriger"><h3>[^]*?À corriger<span>6<\/span><\/h3>/);
  // Les informations : un bloc replié (pas d'attribut open), avec son nombre et « rien à faire ».
  const infos = html.slice(html.indexOf('<details class="pb-groupe information"'));
  assert.match(infos, /^<details class="pb-groupe information"><summary>[^]*?Information[^]*?rien à faire[^]*?<span class="pb-n">3<\/span><\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.equal((infos.match(/class="pb"/g) || []).length, 3);
  assert.equal((html.match(/class="pb"/g) || []).length, 11);
  // Chaque avis mène à sa page ; celui d'un service, à sa fiche.
  assert.match(html, /data-pb-page="mu-services" data-pb-service="dressage"/);
  assert.match(html, /Ouvrir « Page u-lecture »/);
});

test('le panneau, sans problème : il le dit, et les informations restent lisibles dessous', () => {
  const infos = A.lister({ anomalies: [{ code: 'commande-absente', message: 'Montage : SUD/YC n’a aucun vol ce jour-là.', service: 'montage' }] });
  const html = A.panneau(infos, id => id);
  assert.match(html, /<span class="pb-total">aucun<\/span>/);
  assert.match(html, /<p class="pb-vide">[^]*?Rien de bloquant, rien à corriger/);
  assert.match(html, /<details class="pb-groupe information">/);
  assert.doesNotMatch(html, /<section class="pb-groupe/);
  const vide = A.panneau([], id => id);
  assert.match(vide, /Rien de bloquant, rien à corriger/);
  assert.doesNotMatch(vide, /<details/);
});

test('le texte venu d’un fichier est échappé avant d’entrer dans le panneau', () => {
  const l = A.lister({ anomalies: [{ code: 'bareme', message: '<img src=x onerror=alert(1)> : aucun temps par vol', service: 'a"b' }],
    fantomes: [{ id: 'f', nom: '<b>Faux</b>', cases: 1, chemins: 0 }] });
  const html = A.panneau(l, id => '<i>' + id + '</i>');
  assert.doesNotMatch(html, /<img|<b>Faux|<i>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /data-pb-service="a&quot;b"/);
});

test('dans une page : les mêmes niveaux, les mêmes mots, les informations repliées dessous', () => {
  const html = A.blocs([
    { niveau: 'information', html: 'Montage : SUD/YC n’a aucun vol ce jour-là.' },
    { niveau: 'corriger', html: '<b>« Vieux »</b> n’existe plus. <button>Effacer partout</button>' },
    { niveau: 'bloquant', html: 'Le chemin tourne en rond.' },
    { niveau: 'corriger', html: 'Dressage : aucun temps par vol.' }
  ]);
  const iB = html.indexOf('avis-niveau bloquant'), iC = html.indexOf('avis-niveau corriger'), iI = html.indexOf('avis-niveau information');
  assert.ok(iB >= 0 && iB < iC && iC < iI);
  assert.match(html, /<section class="avis-niveau bloquant"><h4>[^]*?Bloquant<\/h4><ul><li>Le chemin tourne en rond\.<\/li><\/ul><\/section>/);
  assert.match(html, /<section class="avis-niveau corriger"><h4>[^]*?À corriger<\/h4><ul><li><b>« Vieux »<\/b>[^]*?<\/li><li>Dressage : aucun temps par vol\.<\/li><\/ul><\/section>/);
  assert.match(html, /<details class="avis-niveau information"><summary>[^]*?Information[^]*?rien à faire[^]*?<\/summary><ul><li>Montage[^]*?<\/li><\/ul><\/details>/);
  // Rien que des informations : le bloc replié, seul. Rien du tout : rien.
  assert.match(A.blocs([{ niveau: 'information', html: 'x' }]), /^<details class="avis-niveau information">/);
  assert.equal(A.blocs([]), '');
});
