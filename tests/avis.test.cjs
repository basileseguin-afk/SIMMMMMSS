/* Évolution 19 (d) — un problème est un problème. Le module avis.js range ce
 * que le site sait déjà en trois niveaux, avec les mêmes mots partout :
 * « bloquant » (le calcul ne se fait pas, ou une commande n'est préparée par
 * personne), « à corriger » (le calcul se fait, mais il est faux pour une
 * part), « information » (à lire : rien n'est demandé). Le compteur ne compte
 * que les deux premiers ; les informations se lisent repliées, sous les autres,
 * dans un repli qui s'appelle « Information » ; un geste qu'une information
 * propose dit « Facultatif » (évolution 19, retouche).
 * Évolution 22 (d) : le panneau « Problèmes » a rejoint la page « Contrôles » (tests/controles-page.test.cjs) ; chaque
 * avis porte de quoi mener à l'endroit où il se règle.
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
  assert.equal(A.NIVEAUX[2].dit, 'À lire : rien n’est demandé. Un geste proposé est facultatif.');
});

test('un point du calcul prend son niveau de son code', () => {
  // Une compagnie qu'aucun handling ne charge : le calcul se fait, faux pour une part.
  assert.equal(A.niveauDuCode('handling-sans'), 'corriger');
  assert.equal(A.niveauDuCode('bareme'), 'corriger');
  assert.equal(A.niveauDuCode('parcours-trou'), 'corriger');
  // Une commande sans vol ce jour-là, et ce que la journée montre : une information.
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
  // Les vols d'exemple (évolution 22 d) : l'étape se lit, rien n'est demandé — une information, qui ne compte pas.
  const ex = A.lister({ etapes: [{ id: 'vols', titre: 'Les vols de la journée', texte: '13 départs — ce sont les vols d’exemple : importez les vôtres.', page: 'v-programme', information: true }] });
  assert.deepEqual(ex.map(p => [p.niveau, p.titre, p.page, p.etape]), [['information', 'Les vols de la journée', 'v-programme', 'vols']]);
  assert.equal(A.compte(ex), 0);
});

test('chaque avis mène à la page où il se règle ; le texte du moteur passe par les mots de la page', () => {
  const l = A.lister({ ...sources(), enClair: t => t.replace('SUD/YC', 'Sud · Éco') });
  const par = t => l.find(p => p.titre.startsWith(t));
  // (Évolution 22 d : les pages d'aujourd'hui — « Chemins », « Services et équipes », « Liens entre services ».)
  assert.deepEqual([par('Le chemin').page, par('Le chemin').service, par('Le chemin').code], ['mu-flux', undefined, 'cycle']);
  assert.deepEqual([par('Dressage').page, par('Dressage').service, par('Dressage').code], ['mu-services', 'dressage', 'bareme']);
  assert.deepEqual([par('« Vieux service »').page, par('« Vieux service »').fantome], ['mu-services', 'vieux']);
  assert.deepEqual([par('Magasin').page, par('Magasin').lien], ['u-liens', true]);
  assert.deepEqual([par('Les chemins').page, par('Les chemins').etape], ['mu-flux', 'flux']);
  // Une étape du chemin que personne ne prépare se règle dans « Chemins » : son service, ses commandes ; un point
  // d'une équipe porte son équipe.
  const trou = A.lister({ anomalies: [{ code: 'parcours-trou', message: '« Dotation » est sur le chemin de 2 commandes…', service: 'dotation', classes: ['NO/BC', 'SU/BC'] },
    { code: 'hors-parcours', message: 'Montage bis : ZEN/YC est cochée ici…', service: 'montage', atelier: 'mob', classes: ['ZEN/YC'] }] });
  assert.deepEqual(trou.map(p => [p.page, p.service, p.code, p.equipe, p.classes]),
    [['mu-flux', 'dotation', 'parcours-trou', undefined, ['NO/BC', 'SU/BC']], ['mu-services', 'montage', 'hors-parcours', 'mob', ['ZEN/YC']]]);
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
  assert.equal(A.compte(l, 'mu-services'), 4);      // la commande sans équipe, Dressage, l'étape des services, le service supprimé ; la commande sans vol n'y est pas
  assert.equal(A.compte(l, 'j-chiffres'), 0);
  assert.equal(A.compte(l, 'mu-pas'), 8);           // « Contrôles » les montre tous
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
  assert.match(html, /<details class="avis-niveau information"><summary>[^<]*(<svg[^]*?<\/svg>)?<span class="avis-nom">Information<\/span><\/summary><ul><li>Montage[^]*?<\/li><\/ul><\/details>/);
  assert.doesNotMatch(html, /rien à faire/i);
  // Rien que des informations : le bloc replié, seul. Rien du tout : rien.
  assert.match(A.blocs([{ niveau: 'information', html: 'x' }]), /^<details class="avis-niveau information">/);
  assert.equal(A.blocs([]), '');
});

test('une information qui propose un geste le dit : « Facultatif »', () => {
  assert.equal(A.FACULTATIF, 'Facultatif');
  assert.equal(A.facultatif(), '<span class="avis-facultatif">Facultatif</span>');
  // Dans une page : le mot, devant le geste.
  const html = A.blocs([{ niveau: 'information', html: 'Légumerie sert par vagues. ' + A.facultatif() + ' <button>Les ouvrir de 07:00 à 18:00</button>' }]);
  assert.match(html, /sert par vagues\. <span class="avis-facultatif">Facultatif<\/span> <button>/);
  // Dans une page qu'un autre module écrit : chaque groupe de gestes d'une information est marqué, une seule fois.
  const groupe = () => { const g = { enfants: [], marque: false,
    querySelector: sel => (sel === ':scope > .avis-facultatif' && g.marque ? {} : null),
    insertAdjacentHTML: (ou, h) => { assert.equal(ou, 'afterbegin'); assert.equal(h, A.facultatif() + ' '); g.marque = true; } }; return g; };
  const g1 = groupe(), g2 = groupe(), racine = { querySelectorAll: sel => { assert.equal(sel, 'details.info .gestes'); return [g1, g2]; } };
  assert.equal(A.marquerFacultatifs(racine, 'details.info .gestes'), 2);
  assert.equal(A.marquerFacultatifs(racine, 'details.info .gestes'), 0, 'déjà marqués');
  assert.equal(A.marquerFacultatifs(null, 'x'), 0);
});
