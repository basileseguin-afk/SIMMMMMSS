/* « Lecture seule » (version 1, évolution 22 f), sans navigateur : le choix gardé comme le thème, les pages que la lecture
 * seule ferme (celles du bloc « Régler », et les pages d'avant qu'elles ont reprises), le menu qui replie ce bloc, les
 * liens qui le disent, la porte gardée d'un réglage, « Fichiers » qui grise ses imports. */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lecture-seule.js');
const O = require('../onglets.js');
const F = require('../fichiers-page.js');

/** Un stockage de navigateur, réduit à ce qu'on en lit. */
const stockage = (init = {}) => { const m = new Map(Object.entries(init)); return {
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), cles: () => [...m.keys()] }; };

test('le choix se garde comme le thème : une préférence d’affichage, hors des données et de la sauvegarde', () => {
  // Le garde des onglets (stockage.js) ne compte pas une clé « ory-ui-… » parmi les données.
  assert.match(L.CLE, /^ory-ui-/);
  const s = stockage();
  assert.equal(L.lire(s), false, 'sans choix : la lecture seule est arrêtée');
  L.ecrire(s, true);
  assert.deepEqual([L.lire(s), s.cles()], [true, ['ory-ui-lecture-seule']]);
  L.ecrire(s, false);
  assert.deepEqual([L.lire(s), s.cles()], [false, []], 'arrêtée, la clé s’en va (comme celle du thème clair)');
  // Un stockage indisponible : arrêtée, sans erreur.
  const casse = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); }, removeItem() { throw new Error('refusé'); } };
  assert.equal(L.lire(casse), false);
  assert.doesNotThrow(() => L.ecrire(casse, true));
  assert.equal(L.lire(null), false);
});

test('la lecture seule ferme les pages du bloc « Régler », et elles seules', () => {
  const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.deepEqual(pages.filter(id => L.fermee(O, id)),
    ['v-programme', 'v-planche', 'mu-services', 'mu-flux', 'u-liens', 'u-plan', 'rg-simulation', 'mu-pas']);
  // Les pages de résultats, et « Fichiers », restent ouvertes.
  assert.deepEqual(pages.filter(id => !L.fermee(O, id)),
    ['j-chiffres', 'j-plan', 'at-planning', 'j-periode', 'at-repas', 'v-departs', 'j-stocks', 'j-details', 'j-comparer', 'u-sauvegarde']);
  // Une page d'avant vaut la page qui l'a reprise : son nom, son lien mènent à une page fermée.
  for (const id of ['at-recap', 'rg-minutes', 'u-services', 'mu-carte', 'at-chemins', 'u-lecture']) assert.equal(L.fermee(O, id), true, id);
  assert.equal(L.fermee(O, 'pas-une-page'), false);
  assert.equal(L.fermee(null, 'mu-services'), false);
});

test('un lien vers une page fermée le dit : une règle par page, sans effet hors de la lecture seule', () => {
  const css = L.regles(O);
  for (const id of ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'mu-pas', 'u-plan', 'at-recap', 'u-lecture']) {
    assert.ok(css.includes(`body[data-lecture="seule"] [data-page="${id}"]`), id);
    assert.ok(css.includes(`body[data-lecture="seule"] [data-page="${id}"]::after`), id + ' : le mot à sa suite');
  }
  assert.ok(css.includes('content:" · Paramétrage verrouillé"'));
  for (const id of ['j-chiffres', 'at-planning', 'u-sauvegarde']) assert.equal(css.includes(`[data-page="${id}"]`), false, id + ' reste un lien comme avant');
  // Chaque sélecteur tient à `body[data-lecture="seule"]` : la lecture seule arrêtée, rien ne change.
  assert.equal(css.split('{')[0].split(',').every(s => s.trim().startsWith('body[data-lecture="seule"] ')), true);
});

test('une porte gardée : en lecture seule, le réglage ne change pas et la page le dit ; arrêtée, la méthode d’avant', () => {
  let verrou = false, dit = 0;
  const equipes = { personnes: 3, changer(fn, message) { fn(); this.message = message; return true; } };
  L.garder(equipes, 'changer', () => verrou, () => { dit++; });
  assert.equal(equipes.changer(() => { equipes.personnes = 4; }, 'quatre'), true);
  assert.deepEqual([equipes.personnes, equipes.message, dit], [4, 'quatre', 0], 'arrêtée : la méthode d’avant, ses arguments, son résultat');
  verrou = true;
  assert.equal(equipes.changer(() => { equipes.personnes = 9; }, 'neuf'), false, 'en lecture seule : refusé');
  assert.deepEqual([equipes.personnes, equipes.message, dit], [4, 'quatre', 1]);
  verrou = false;
  equipes.changer(() => { equipes.personnes = 5; }, 'cinq');
  assert.equal(equipes.personnes, 5, 'arrêtée de nouveau : tout revient');
  // Gardée une seule fois ; une méthode absente ne casse rien.
  const garde = equipes.changer;
  L.garder(equipes, 'changer', () => true, null);
  assert.equal(equipes.changer, garde);
  assert.doesNotThrow(() => L.garder(equipes, 'absente', () => true));
  assert.doesNotThrow(() => L.garder(null, 'changer', () => true));
});

test('l’interrupteur dit son état : un cadenas fermé en marche, ouvert à l’arrêt', () => {
  assert.deepEqual([L.interrupteur(true).nom, L.interrupteur(true).coche, L.interrupteur(true).ico], ['Lecture seule', true, 'cadenas']);
  assert.deepEqual([L.interrupteur(false).nom, L.interrupteur(false).coche, L.interrupteur(false).ico], ['Lecture seule', false, 'cadenasOuvert']);
  assert.match(L.interrupteur(true).titre, /verrouillé/);
  assert.notEqual(L.interrupteur(true).titre, L.interrupteur(false).titre);
});

/* ---- le menu (onglets.js) : une page fermée ne s'ouvre pas, son bloc se replie ---------------------------------------- */
function menuAvec(ferme) {
  const hote = { innerHTML: '', firstChild: null, querySelector: () => null, addEventListener() {} };
  const refus = [];
  const so = new O.SousOnglets({ hote: () => hote, vue: () => so.vueCourante, ferme: id => ferme() && L.fermee(O, id), refus: id => refus.push(id),
    change: vue => { so.vueCourante = vue; }, motFerme: L.MOT });
  so.vueCourante = 'plan';
  return { so, hote, refus };
}

test('le menu : en lecture seule, les pages de « Régler » ne s’ouvrent pas, la page le dit ; arrêtée, tout revient', () => {
  let lecture = true;
  const { so, hote, refus } = menuAvec(() => lecture);
  so.choisir('j-chiffres');
  assert.equal(so.page, 'j-chiffres');
  for (const id of ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'mu-pas', 'u-plan', 'u-liens']) so.choisir(id);
  assert.equal(so.page, 'j-chiffres', 'aucune ne s’est ouverte');
  assert.deepEqual(refus, ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'mu-pas', 'u-plan', 'u-liens'], 'chaque refus est dit');
  // Le nom d'une page d'avant mène à une page fermée : refusé de même, au nom de la page qui l'a reprise.
  so.choisir('at-recap');
  assert.deepEqual([so.page, refus.at(-1)], ['j-chiffres', 'mu-services']);
  // Une partie de « Régler », demandée par son nom (une tuile de l'accueil) : refusée aussi.
  so.ouvrir('organisation');
  assert.equal(so.page, 'j-chiffres');
  // « Fichiers » et les pages de résultats s'ouvrent.
  for (const id of ['u-sauvegarde', 'at-planning', 'at-repas', 'j-comparer']) { so.choisir(id); assert.equal(so.page, id); }
  // Le bloc « Régler » est replié en une ligne ; « Lire » garde ses entrées.
  so.choisir('j-chiffres');
  assert.match(hote.innerHTML, /<div class="menu-bloc menu-bloc-ferme" data-bloc="regler" data-ferme>/);
  assert.match(hote.innerHTML, /<p class="menu-ferme">.*<span>Paramétrage verrouillé<\/span><\/p>/);
  assert.equal((hote.innerHTML.match(/data-sous-onglet=/g) || []).length, 5, 'les cinq entrées de « Lire »');
  assert.equal(/data-sous-onglet="(mu-|v-programme|v-planche|rg-|u-plan)/.test(hote.innerHTML), false, 'aucune entrée de « Régler »');
  // Arrêtée : le menu d'avant, et les pages s'ouvrent.
  lecture = false; so.rendre();
  assert.equal(/data-ferme/.test(hote.innerHTML), false);
  assert.equal((hote.innerHTML.match(/data-sous-onglet=/g) || []).length, 12);
  so.choisir('mu-services');
  assert.equal(so.page, 'mu-services');
});

test('le menu : sans page fermée (la version d’avant, la lecture seule arrêtée), rien ne change', () => {
  const a = menuAvec(() => false), hote = { innerHTML: '', firstChild: null, querySelector: () => null, addEventListener() {} };
  const sans = new O.SousOnglets({ hote: () => hote, vue: () => 'plan' });
  a.so.choisir('j-chiffres'); sans.choisir('j-chiffres');
  assert.equal(a.hote.innerHTML, hote.innerHTML, 'le même menu, à l’octet près');
});

test('le menu : une page fermée retenue par ce navigateur ne rouvre pas par sa vue', () => {
  let lecture = false;
  const { so } = menuAvec(() => lecture);
  so.choisir('mu-services');   // retenue pour la vue « ateliers »
  lecture = true;
  assert.equal(so.retenue('ateliers'), 'at-planning', 'la première page de la vue qui s’ouvre');
  assert.equal(so.retenue('reglages'), null, 'une vue dont aucune page ne s’ouvre');
  assert.equal(so.retenue('plan'), 'j-plan', 'une vue de résultats : comme avant');
  lecture = false;
  assert.equal(so.retenue('ateliers'), 'mu-services', 'arrêtée : la page retenue revient');
});

/* ---- « Fichiers » : « Restaurer » et « Importer » grisés, avec la raison ; les exports marchent ------------------------ */
/** Un petit document : des éléments avec identifiant, `after`, `remove`, et ce que `verrouiller` lit. */
function petitDoc() {
  const parId = new Map();
  const el = (tag, id) => { const e = { tagName: tag.toUpperCase(), id: id || '', disabled: false, dataset: {}, attrs: {}, suivants: [], className: '',
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    after(x) { this.suivants = [x]; x.parent = this; if (x.id) parId.set(x.id, x); }, remove() { if (this.parent) this.parent.suivants = []; parId.delete(this.id); } };
    if (id) parId.set(id, e); return e; };
  const doc = { createElement: tag => el(tag), getElementById: id => parId.get(id) || null, querySelector: sel => parId.get(sel.replace(/^#/, '')) || null };
  return { doc, el };
}

test('« Fichiers » en lecture seule : les imports et « Restaurer » grisés, la raison dite ; à l’arrêt, tout revient', () => {
  const { doc, el } = petitDoc();
  const importer = el('button', 'at-import-btn'), champ = el('input', 'at-import'), clic = el('button', 'fi-vols-import'), vols = el('input', 'imp-vols');
  clic.dataset.fiDeclenche = '#imp-vols';
  const dejaGris = el('button', 'rc-import-btn'); dejaGris.disabled = true;
  const cellule = (classeur, controles) => ({ parentElement: { dataset: { classeur } }, querySelectorAll: () => controles });
  const hote = { querySelectorAll: () => [cellule('equipes-chemins', [importer, champ]), cellule('vols', [clic]), cellule('equipes', [dejaGris]), cellule('journee', [])] };
  const rangee = el('div'), restaurer = el('button', 'sauvegarde-import-btn'), fichier = el('input', 'sauvegarde-import'); restaurer.parentElement = rangee;

  F.verrouiller(doc, hote, true, L.RAISON, L.MOT);
  assert.deepEqual([importer, champ, clic, vols, restaurer, fichier].map(e => e.disabled), [true, true, true, true, true, true]);
  // La raison : son mot dans chaque cellule, sa phrase sous « Restaurer » ; le bouton la désigne.
  assert.equal(doc.getElementById('fi-verrou-equipes-chemins').textContent, 'Paramétrage verrouillé');
  assert.equal(doc.getElementById('fi-verrou-vols').textContent, 'Paramétrage verrouillé');
  assert.equal(doc.getElementById('fi-verrou-restaurer').textContent, 'Lecture seule : paramétrage verrouillé.');
  assert.equal(doc.getElementById('fi-verrou-restaurer').className, 'fi-raison fi-verrou');
  assert.equal(importer.attrs['aria-describedby'], 'fi-verrou-equipes-chemins');
  assert.equal(restaurer.attrs['aria-describedby'], 'fi-verrou-restaurer');
  assert.equal(doc.getElementById('fi-verrou-journee'), null, 'une cellule sans import : rien à dire');
  // Rappelé (après chaque calcul) : la même chose, sans doublon.
  F.verrouiller(doc, hote, true, L.RAISON, L.MOT);
  assert.equal(importer.suivants.length + champ.suivants.length, 1);

  F.verrouiller(doc, hote, false, L.RAISON, L.MOT);
  assert.deepEqual([importer, champ, clic, vols, restaurer, fichier].map(e => e.disabled), [false, false, false, false, false, false], 'à l’arrêt, tout revient');
  assert.equal(dejaGris.disabled, true, 'un bouton grisé pour une autre raison le reste');
  assert.deepEqual(['fi-verrou-equipes-chemins', 'fi-verrou-vols', 'fi-verrou-restaurer'].map(id => doc.getElementById(id)), [null, null, null]);
  assert.equal(importer.attrs['aria-describedby'], undefined);
});
