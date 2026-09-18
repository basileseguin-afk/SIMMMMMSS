/* Régressions des ressources, tampons et niveaux (moteur/ressources.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Environnement } = require('../moteur/noyau.js');
const { Ressource, Tampon, Niveau } = require('../moteur/ressources.js');

/* ======================================================================
 *  RESSOURCE
 * ====================================================================*/

test('une place occupée n’est à personne d’autre', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 2, { nom: 'dotation' });
  const debuts = [];
  for (let i = 0; i < 3; i++) {
    env.processus(function* (e) {
      const p = poste.demander();
      yield p;
      debuts.push(e.maintenant);
      try { yield e.delai(10); } finally { poste.liberer(p); }
    });
  }
  env.executer();
  assert.deepEqual(debuts, [0, 0, 10]);   // le troisième attend une libération
  assert.equal(poste.occupees, 0);
  assert.equal(env.maintenant, 20);
});

test('la file est servie par priorité, puis par ordre d’arrivée', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 1, { nom: 'four' });
  const ordre = [];
  const tenir = (nom, priorite, arrivee) => env.processus(function* (e) {
    yield e.delai(arrivee);
    const p = poste.demander({ priorite });
    yield p;
    ordre.push(nom);
    try { yield e.delai(5); } finally { poste.liberer(p); }
  });
  tenir('bloqueur', 0, 0);
  tenir('tardif', 5, 1);
  tenir('urgent', 1, 2);        // arrive en dernier mais passe avant
  tenir('urgent bis', 1, 3);    // même priorité : l’arrivée départage
  env.executer();
  assert.deepEqual(ordre, ['bloqueur', 'urgent', 'urgent bis', 'tardif']);
});

test('le taux d’occupation est mesuré, pas lissé', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 1, { nom: 'plonge' });
  env.processus(function* (e) {
    const p = poste.demander();
    yield p;
    yield e.delai(30);
    poste.liberer(p);
  });
  env.avancerA(100);
  assert.equal(poste.tauxOccupation(), 0.3);        // 30 minutes sur 100, exactement
  assert.equal(poste.attente.moyenne(), 0);
});

test('liberer est sûr dans un finally : abandon, double appel, demande inconnue', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 1, { nom: 'poste' });
  const tenu = poste.demander();
  env.executer();
  assert.equal(poste.liberer(tenu), true);
  assert.equal(poste.liberer(tenu), false);          // second appel sans effet
  const autre = new Ressource(env, 1, { nom: 'autre' });
  assert.throws(() => autre.liberer(tenu), TypeError);
});

test('une demande abandonnée ne bloque pas la file (schéma unDe + abandon)', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 1, { nom: 'saturé' });
  const journal = [];
  env.processus(function* (e) {                        // occupe longtemps
    const p = poste.demander();
    yield p;
    try { yield e.delai(100); } finally { poste.liberer(p); }
  });
  env.processus(function* (e) {                        // renonce au bout de 10
    const p = poste.demander();
    yield e.unDe([p, e.delai(10)]);
    if (!p.accordee) { poste.liberer(p); journal.push('renoncé @' + e.maintenant); }
  });
  env.processus(function* (e) {                        // doit être servi à 100
    yield e.delai(20);
    const p = poste.demander();
    yield p;
    journal.push('servi @' + e.maintenant);
    poste.liberer(p);
  });
  env.executer();
  assert.deepEqual(journal, ['renoncé @10', 'servi @100']);
  assert.equal(poste.enAttente, 0);
});

/* ======================================================================
 *  TAMPON — le blocage amont
 * ====================================================================*/

/**
 * Deux postes en série, le second cinq fois plus lent. Le seul paramètre qui
 * change entre les deux exécutions est la contenance du tampon intermédiaire.
 * C'est la démonstration que `sim.js` ne sait pas produire.
 */
function chaine(contenanceMilieu) {
  const env = new Environnement();
  const entree = new Tampon(env, { nom: 'entrée', articles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  const milieu = new Tampon(env, { nom: 'milieu', capacite: contenanceMilieu });
  const sortie = new Tampon(env, { nom: 'sortie' });
  const A = new Ressource(env, 1, { nom: 'A' });
  const B = new Ressource(env, 1, { nom: 'B' });
  const finis = [];

  const poste = (res, amont, aval, duree, marque) => env.processus(function* (e) {
    for (;;) {
      const article = yield amont.prendre();
      const place = res.demander();
      yield place;
      try {
        yield e.delai(duree);
        yield aval.deposer(article);      // BLOQUE si l'aval est plein
        if (marque) finis.push(e.maintenant);
      } finally {
        res.liberer(place);               // après le dépôt, jamais avant
      }
    }
  });
  poste(A, entree, milieu, 1, false);
  poste(B, milieu, sortie, 5, true);

  env.avancerA(200);
  // Intégrale des places occupées : indépendante de l'horizon une fois fini.
  const minutesA = A.occupation.moyenne() * A.occupation.duree;
  return { env, A, B, milieu, finis, minutesA };
}

test('un tampon plein bloque l’amont : le poste rapide reste occupé sans travailler', () => {
  const serre = chaine(1);
  const large = chaine(Infinity);

  // Même travail produit, même débit : c'est le poste lent qui commande.
  assert.equal(serre.finis.length, 10);
  assert.equal(large.finis.length, 10);
  assert.equal(serre.finis[9], 51);
  assert.equal(large.finis[9], 51);

  // Le poste A ne travaille que 10 minutes (10 articles × 1 minute)…
  assert.equal(large.minutesA, 10);
  // …mais il tient sa place 41 minutes quand le tampon est serré : les 31
  // minutes d'écart sont exactement le blocage amont.
  assert.equal(serre.minutesA, 41);

  assert.ok(serre.milieu.partBloquante() > 0.15, 'le tampon serré doit bloquer');
  assert.equal(large.milieu.partBloquante(), 0);
  assert.ok(serre.milieu.attenteDepot.moyenne() > 3);
  assert.equal(large.milieu.attenteDepot.moyenne(), 0);
});

test('un tampon rend le contenu par copie et refuse un contenu initial trop grand', () => {
  const env = new Environnement();
  const t = new Tampon(env, { capacite: 3, articles: ['a', 'b'] });
  t.articles.push('intrus');
  assert.deepEqual(t.articles, ['a', 'b']);
  assert.equal(t.place, 1);
  assert.throws(() => new Tampon(env, { capacite: 1, articles: [1, 2] }), RangeError);
  assert.throws(() => t.deposer(undefined), TypeError);
  assert.throws(() => t.prendre('pas une fonction'), TypeError);
});

test('une prise filtrée n’empêche pas la suivante d’être servie', () => {
  const env = new Environnement();
  const t = new Tampon(env, { nom: 'chambre froide' });
  const servis = [];
  env.processus(function* () {                       // attend un article absent
    const a = yield t.prendre(x => x.type === 'chaud');
    servis.push('chaud @' + env.maintenant + ' ' + a.id);
  });
  env.processus(function* () {                       // doit passer devant
    const a = yield t.prendre(x => x.type === 'froid');
    servis.push('froid @' + env.maintenant + ' ' + a.id);
  });
  env.processus(function* (e) {
    yield e.delai(5); yield t.deposer({ type: 'froid', id: 1 });
    yield e.delai(5); yield t.deposer({ type: 'chaud', id: 2 });
  });
  env.executer();
  assert.deepEqual(servis, ['froid @5 1', 'chaud @10 2']);
});

test('sans filtre, le tampon sert dans l’ordre d’arrivée', () => {
  const env = new Environnement();
  const t = new Tampon(env, { articles: ['x', 'y'] });
  const vus = [];
  for (const nom of ['premier', 'second']) {
    env.processus(function* () { vus.push(nom + ':' + (yield t.prendre())); });
  }
  env.executer();
  assert.deepEqual(vus, ['premier:x', 'second:y']);
});

/* ======================================================================
 *  NIVEAU
 * ====================================================================*/

test('un retrait attend que le stock suffise, et bloque la file derrière lui', () => {
  const env = new Environnement();
  const stock = new Niveau(env, { nom: 'plateaux', initial: 0, capacite: 100 });
  const journal = [];
  env.processus(function* () { yield stock.retirer(50); journal.push('gros @' + env.maintenant); });
  env.processus(function* () { yield stock.retirer(1); journal.push('petit @' + env.maintenant); });
  env.processus(function* (e) {
    yield e.delai(10); yield stock.ajouter(20);
    yield e.delai(10); yield stock.ajouter(40);
  });
  env.executer();
  // Le petit retrait aurait pu être servi à 10 ; la file est FIFO, il attend.
  assert.deepEqual(journal, ['gros @20', 'petit @20']);
  assert.equal(stock.niveau, 9);
  assert.equal(stock.partEnRupture(), 1);   // un retrait a attendu tout du long
});

test('un ajout attend que la place se libère sous le plafond', () => {
  const env = new Environnement();
  const cuve = new Niveau(env, { capacite: 10, initial: 8 });
  let pose = null;
  env.processus(function* () { yield cuve.ajouter(5); pose = env.maintenant; });
  env.processus(function* (e) { yield e.delai(7); yield cuve.retirer(3); });
  env.executer();
  assert.equal(pose, 7);
  assert.equal(cuve.niveau, 10);
});

test('les quantités impossibles sont refusées à la source', () => {
  const env = new Environnement();
  const n = new Niveau(env, { capacite: 10 });
  assert.throws(() => n.retirer(0), RangeError);
  assert.throws(() => n.ajouter(-1), RangeError);
  assert.throws(() => n.retirer(11), /jamais être satisfaite/);
  assert.throws(() => new Niveau(env, { capacite: 5, initial: 6 }), RangeError);
  assert.throws(() => new Ressource(env, 1.5), RangeError);
  assert.throws(() => new Ressource(env, -1), RangeError);
  assert.equal(new Ressource(env, 0).capacite, 0);   // permis : personne pour l'instant
});

test('une relève d’équipe change la capacité sans interrompre personne, et l’occupation reste juste', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 2, { nom: 'montage' });
  const debuts = [];
  const of = arrivee => env.processus(function* (e) {
    if (arrivee) yield e.delai(arrivee);
    const p = poste.demander();
    yield p;
    debuts.push(e.maintenant);
    try { yield e.delai(10); } finally { poste.liberer(p); }
  });
  of(0); of(0); of(0); of(25); of(31);
  env.processus(function* (e) { yield e.delai(5); poste.modifierCapacite(1); });   // relève : 2 → 1
  env.processus(function* (e) { yield e.delai(30); poste.modifierCapacite(3); });  // renfort : 1 → 3
  env.avancerA(30);
  // À 5 la capacité tombe à 1 mais les deux premiers finissent leur lot (pas
  // d'interruption) ; le 3e n'entre qu'à 10, seul ; le 4e arrive à 25 et passe.
  assert.deepEqual(debuts, [0, 0, 10, 25]);
  assert.equal(poste.occupees, 1);
  env.executer();
  assert.deepEqual(debuts, [0, 0, 10, 25, 31]);       // le renfort sert le 5e aussitôt
  assert.equal(env.maintenant, 41);
  // Capacité EFFECTIVE : 2 jusqu'à 10 (les deux présents finissent), 1 de 10 à
  // 30, 3 de 30 à 41 → ∫cap = 20 + 20 + 33 = 73 ; ∫occupées = 20 + 10 + 10 + 10 = 50.
  assert.ok(Math.abs(poste.capaciteMesuree.moyenne() - 73 / 41) < 1e-9);
  assert.ok(Math.abs(poste.tauxOccupation() - 50 / 73) < 1e-9, String(poste.tauxOccupation()));
  assert.ok(poste.tauxOccupation() <= 1);
  assert.throws(() => poste.modifierCapacite(-1), RangeError);
});

test('une ressource à zéro place fait attendre sans erreur, jusqu’à ce qu’on l’ouvre', () => {
  const env = new Environnement();
  const poste = new Ressource(env, 0, { nom: 'fermé' });
  let servi = null;
  env.processus(function* () { const p = poste.demander(); yield p; servi = env.maintenant; poste.liberer(p); });
  env.avancerA(100);
  assert.equal(servi, null);
  assert.equal(poste.enAttente, 1);
  assert.equal(poste.tauxOccupation(), null);   // aucune capacité : le taux n'a pas de sens
  poste.modifierCapacite(1);
  env.executer();
  assert.equal(servi, 100);
});
