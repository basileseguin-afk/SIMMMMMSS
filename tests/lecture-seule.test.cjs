/* « Lecture seule » (version 1, évolution 22 f), sans navigateur : le choix gardé comme le thème, les pages que la lecture
 * seule ferme (celles du bloc « Régler », et les pages d'avant qu'elles ont reprises), le menu qui replie ce bloc, les
 * liens qui le disent, la porte gardée d'un réglage, « Fichiers » qui grise ses imports.
 * Évolution 23 (d) : « Contrôles » se lit — la page reste ouverte, et son entrée passe sous « Lire ». */
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

test('la lecture seule ferme les pages du bloc « Régler », sauf « Contrôles », qui se lit', () => {
  const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.deepEqual(pages.filter(id => L.fermee(O, id)),
    // (Évolution 26 f : dans l'ordre du travail — les commandes, l'unité, puis les vols.)
    ['mu-commandes', 'mu-services', 'mu-flux', 'u-liens', 'u-plan', 'v-programme', 'v-planche', 'rg-simulation']);
  // Les pages de résultats, « Fichiers », et « Contrôles » (évolution 23 d : celui qui lit les résultats doit savoir
  // s'il reste des points à corriger) restent ouvertes.
  assert.deepEqual(pages.filter(id => !L.fermee(O, id)),
    ['j-chiffres', 'j-plan', 'at-planning', 'j-periode', 'at-repas', 'v-departs', 'j-stocks', 'j-details', 'j-comparer', 'mu-pas', 'u-sauvegarde']);
  // Une seule page du bloc « Régler » se lit : c'est écrit sur elle (`lisible`), pas déduit.
  assert.deepEqual(pages.filter(id => O.page(id).lisible), ['mu-pas']);
  // Une page d'avant vaut la page qui l'a reprise : son nom, son lien mènent à une page fermée — ou à « Contrôles ».
  for (const id of ['at-recap', 'rg-minutes', 'u-services', 'mu-carte', 'at-chemins']) assert.equal(L.fermee(O, id), true, id);
  for (const id of ['u-lecture', 'mu-pas:avant', 'mu-pas:problemes']) assert.equal(L.fermee(O, id), false, id + ' : repris par « Contrôles », qui se lit');
  assert.equal(L.fermee(O, 'pas-une-page'), false);
  assert.equal(L.fermee(null, 'mu-services'), false);
});

test('un lien vers une page fermée le dit : une règle par page, sans effet hors de la lecture seule', () => {
  const css = L.regles(O);
  for (const id of ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'u-plan', 'at-recap']) {
    assert.ok(css.includes(`body[data-lecture="seule"] [data-page="${id}"]`), id);
    assert.ok(css.includes(`body[data-lecture="seule"] [data-page="${id}"]::after`), id + ' : le mot à sa suite');
  }
  assert.ok(css.includes('content:" · Paramétrage verrouillé"'));
  for (const id of ['j-chiffres', 'at-planning', 'u-sauvegarde', 'mu-pas', 'u-lecture']) assert.equal(css.includes(`[data-page="${id}"]`), false, id + ' reste un lien comme avant');
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
  for (const id of ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'u-plan', 'u-liens']) so.choisir(id);
  assert.equal(so.page, 'j-chiffres', 'aucune ne s’est ouverte');
  assert.deepEqual(refus, ['mu-services', 'mu-flux', 'v-programme', 'rg-simulation', 'u-plan', 'u-liens'], 'chaque refus est dit');
  // Le nom d'une page d'avant mène à une page fermée : refusé de même, au nom de la page qui l'a reprise.
  so.choisir('at-recap');
  assert.deepEqual([so.page, refus.at(-1)], ['j-chiffres', 'mu-services']);
  // Une partie de « Régler », demandée par son nom (une tuile de l'accueil) : refusée aussi.
  so.ouvrir('organisation');
  assert.equal(so.page, 'j-chiffres');
  // « Fichiers », les pages de résultats et « Contrôles » (évolution 23 d) s'ouvrent.
  for (const id of ['u-sauvegarde', 'at-planning', 'at-repas', 'j-comparer', 'mu-pas']) { so.choisir(id); assert.equal(so.page, id); }
  // Le bloc « Régler » est replié en une ligne ; « Lire » garde ses entrées, et reçoit « Contrôles » à leur suite.
  so.choisir('j-chiffres');
  assert.match(hote.innerHTML, /<div class="menu-bloc menu-bloc-ferme" data-bloc="regler" data-ferme>/);
  assert.match(hote.innerHTML, /<p class="menu-ferme">.*<span>Paramétrage verrouillé<\/span><\/p>/);
  assert.equal((hote.innerHTML.match(/data-sous-onglet=/g) || []).length, 6, 'les cinq entrées de « Lire », puis « Contrôles »');
  assert.equal(/data-sous-onglet="(mu-commandes|mu-services|mu-flux|v-programme|v-planche|rg-|u-plan)/.test(hote.innerHTML), false, 'aucune entrée qui règle');
  // Arrêtée : le menu d'avant, et les pages s'ouvrent.
  lecture = false; so.rendre();
  assert.equal(/data-ferme/.test(hote.innerHTML), false);
  assert.equal((hote.innerHTML.match(/data-sous-onglet=/g) || []).length, 12);   // (évolution 23 a : « Plan » n'est plus au menu ; 26 c : « Commandes » y est)
  so.choisir('mu-services');
  assert.equal(so.page, 'mu-services');
});

test('le menu en lecture seule : « Contrôles » reste, sous « Lire », avec sa pastille ; ouverte, son entrée est marquée (évolution 23 d)', () => {
  let lecture = true;
  const hote = { innerHTML: '', firstChild: null, querySelector: () => null, addEventListener() {} };
  const so = new O.SousOnglets({ hote: () => hote, vue: () => so.vueCourante, ferme: id => lecture && L.fermee(O, id), change: vue => { so.vueCourante = vue; },
    motFerme: L.MOT, badge: cle => (cle === 'mu-pas' ? { n: 4, ton: 'rouge', titre: '4 points à corriger' } : null) });
  so.vueCourante = 'plan';
  so.choisir('j-chiffres');
  const blocLire = () => hote.innerHTML.slice(hote.innerHTML.indexOf('data-bloc="lire"'), hote.innerHTML.indexOf('data-bloc="regler"'));
  const entrees = h => [...h.matchAll(/data-sous-onglet="([^"]+)"/g)].map(m => m[1]);
  // Sous « Lire », à la suite de ses entrées ; le bloc « Régler » replié n'en garde aucune.
  assert.deepEqual(entrees(blocLire()), ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'j-comparer', 'mu-pas']);
  assert.deepEqual(entrees(hote.innerHTML.slice(hote.innerHTML.indexOf('data-bloc="regler"'))), []);
  assert.match(hote.innerHTML, /data-bloc="regler" data-ferme>/);
  // Sa pastille : le nombre de points, comme hors de la lecture seule.
  assert.match(blocLire(), /data-sous-onglet="mu-pas" data-entree="mu-pas"[^]*?<span>Contrôles<\/span><b class="so-badge rouge" title="4 points à corriger">4<\/b><\/button>/);
  // La page s'ouvre, et son entrée est marquée.
  so.choisir('mu-pas');
  assert.equal(so.page, 'mu-pas');
  assert.match(blocLire(), /class="menu-entree actif" data-sous-onglet="mu-pas"[^>]*aria-selected="true" tabindex="0"/);
  // Le nom d'une page d'avant que « Contrôles » a reprise l'ouvre aussi.
  so.choisir('j-chiffres'); so.choisir('u-lecture');
  assert.equal(so.page, 'mu-pas');
  // Arrêtée : « Contrôles » revient à sa place, dans « Régler », sous « Simulation ».
  lecture = false; so.rendre();
  assert.deepEqual(entrees(blocLire()), ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'j-comparer']);
  assert.match(hote.innerHTML, /data-espace="reglages"[^]*?data-sous-onglet="rg-simulation"[^]*?data-sous-onglet="mu-pas"/);
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
  // (évolution 23 d : « Contrôles », la première page de cette vue, se lit — c'est elle qui s'ouvre, avant « Planning ».)
  assert.equal(so.retenue('ateliers'), 'mu-pas', 'la première page de la vue qui s’ouvre');
  assert.equal(so.retenue('reglages'), null, 'une vue dont aucune page ne s’ouvre');
  assert.equal(so.retenue('plan'), 'j-plan', 'une vue de résultats : comme avant');
  lecture = false;
  assert.equal(so.retenue('ateliers'), 'mu-services', 'arrêtée : la page retenue revient');
});

/* ---- l'accueil suit le menu ------------------------------------------------------------------------------------------ */
test('l’accueil en lecture seule : les étapes de « Régler » repliées en une ligne ; « Contrôles » et le résultat se lisent (évolutions 23 d, 26 f)', () => {
  const D = require('../demarrage.js');
  const etat = { compagnies: { liste: true, n: 3, commandes: 7 }, ateliers: { total: 5, fabriquent: 5, absentes: 0 }, bareme: { calibre: true },
    chemins: { flux: 2, variantes: 0, sansChemin: 0 }, controles: { bloquants: 0, corriger: 1, pret: false },
    vols: { total: 12, departs: 6, source: 'importe' }, journee: { calculee: true, suivies: 6, aHeure: 6, fin: '15:00' } };
  const dessiner = lecture => { const hote = { innerHTML: '' };
    globalThis.OrlyOnglets = O;
    try { new D.Accueil({ accueil: () => hote, etat: () => etat, ...(lecture === null ? {} : { ferme: id => lecture && L.fermee(O, id), motFerme: L.MOT }) }); }
    finally { delete globalThis.OrlyOnglets; }
    return hote.innerHTML; };
  const pages = h => [...h.matchAll(/class="acc-etape-tete" data-page="([^"]+)"/g)].map(m => m[1]);
  // Arrêtée, ou sans lecture seule du tout (la version d'avant) : la même page, les six étapes.
  const avant = dessiner(null);
  assert.equal(dessiner(false), avant, 'arrêtée : l’accueil d’avant, au caractère près');
  assert.deepEqual(pages(avant), ['mu-commandes', 'mu-services', 'mu-flux', 'mu-pas', 'v-programme', 'j-chiffres']);
  assert.equal((avant.match(/data-ferme/g) || []).length, 0);
  // En marche : les étapes dont la page ne s'ouvre pas, repliées en une ligne à la place de la première ; « Contrôles »,
  // qui se lit, et le résultat restent.
  const seule = dessiner(true);
  assert.deepEqual(pages(seule), ['mu-pas', 'j-chiffres']);
  assert.match(seule, /<ol class="acc-guide"[^>]*><li class="acc-etape acc-ferme" data-ferme>[^]*?<span>Paramétrage verrouillé<\/span><\/li><li class="acc-etape verifier" data-etape="controles">/);
  assert.equal((seule.match(/data-ferme/g) || []).length, 1, 'une seule ligne repliée');
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
