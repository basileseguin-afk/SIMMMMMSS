/* Régressions du noyau à événements discrets (moteur/noyau.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Environnement, Evenement, Interruption, PRIORITE } = require('../moteur/noyau.js');

/* ---- ordre et déterminisme ------------------------------------------- */

test('les événements sortent par instant, puis priorité, puis ordre de création', () => {
  const env = new Environnement();
  const trace = [];
  const marquer = nom => () => trace.push(nom + '@' + env.maintenant);
  env.programmer(new Evenement(env, 'a').surResolution(marquer('tard')), 10);
  const normal = new Evenement(env, 'b').surResolution(marquer('normal'));
  const urgent = new Evenement(env, 'c').surResolution(marquer('urgent'));
  const second = new Evenement(env, 'd').surResolution(marquer('second'));
  env.programmer(normal, 5, PRIORITE.NORMALE);
  env.programmer(urgent, 5, PRIORITE.URGENTE);
  env.programmer(second, 5, PRIORITE.NORMALE);
  env.executer();
  assert.deepEqual(trace, ['urgent@5', 'normal@5', 'second@5', 'tard@10']);
});

test('deux exécutions identiques donnent exactement la même trace', () => {
  const trace = () => {
    const env = new Environnement();
    const vus = [];
    for (let i = 0; i < 60; i++) {
      env.processus(function* (e) {
        yield e.delai((i * 37) % 11);
        vus.push(i + '@' + e.maintenant);
      });
    }
    env.executer();
    return vus;
  };
  assert.deepEqual(trace(), trace());
});

/* ---- horloge et processus -------------------------------------------- */

test('un délai fait avancer l’horloge et rend sa valeur', () => {
  const env = new Environnement(100);
  let recu;
  env.processus(function* (e) { recu = yield e.delai(7, 'charge'); });
  env.executer();
  assert.equal(env.maintenant, 107);
  assert.equal(recu, 'charge');
});

test('un processus est un événement : on peut l’attendre et lire son résultat', () => {
  const env = new Environnement();
  const etapes = [];
  const enfant = env.processus(function* (e) {
    yield e.delai(3);
    etapes.push('enfant fini @' + e.maintenant);
    return 42;
  });
  env.processus(function* () {
    const v = yield enfant;
    etapes.push('parent reprend @' + env.maintenant + ' avec ' + v);
  });
  env.executer();
  assert.deepEqual(etapes, ['enfant fini @3', 'parent reprend @3 avec 42']);
});

test('un événement nu se résout quand un autre processus le déclenche', () => {
  const env = new Environnement();
  const feu = env.evenement('feu vert');
  let passe = null;
  env.processus(function* () { yield feu; passe = env.maintenant; });
  env.processus(function* (e) { yield e.delai(8); feu.reussir(); });
  env.executer();
  assert.equal(passe, 8);
});

/* ---- conditions ------------------------------------------------------- */

test('unDe se résout au premier achevé, tousDe attend le dernier', () => {
  const env = new Environnement();
  let premier = null, dernier = null;
  env.processus(function* (e) {
    const gagnants = yield e.unDe([e.delai(5, 'court'), e.delai(9, 'long')]);
    premier = { t: e.maintenant, valeurs: gagnants.map(ev => ev.valeur) };
  });
  env.processus(function* (e) {
    yield e.tousDe([e.delai(2), e.delai(11)]);
    dernier = e.maintenant;
  });
  env.executer();
  assert.deepEqual(premier, { t: 5, valeurs: ['court'] });
  assert.equal(dernier, 11);
});

test('tousDe sur une liste vide est immédiatement satisfait', () => {
  const env = new Environnement();
  let t = null;
  env.processus(function* (e) { yield e.tousDe([]); t = e.maintenant; });
  env.executer();
  assert.equal(t, 0);
});

/* ---- interruption ----------------------------------------------------- */

test('un processus interrompu reprend au point d’attente et peut continuer', () => {
  const env = new Environnement();
  const journal = [];
  const ouvrier = env.processus(function* (e) {
    try {
      yield e.delai(100);
      journal.push('jamais');
    } catch (err) {
      assert.ok(err instanceof Interruption);
      journal.push('interrompu @' + e.maintenant + ' : ' + err.cause);
    }
    yield e.delai(1);
    journal.push('repris @' + e.maintenant);
  });
  env.processus(function* (e) { yield e.delai(4); ouvrier.interrompre('panne'); });
  env.avancerA(50);
  assert.deepEqual(journal, ['interrompu @4 : panne', 'repris @5']);
  // Le délai de 100 abandonné reste programmé : il ne fait rien, mais il
  // tirerait l'horloge jusqu'à 100 si on vidait la file. Comportement documenté.
  assert.equal(env.enAttente, 1);
  assert.equal(env.executer(), 100);
  assert.deepEqual(journal, ['interrompu @4 : panne', 'repris @5']);
});

test('interrompre un processus déjà terminé est sans effet', () => {
  const env = new Environnement();
  const p = env.processus(function* (e) { yield e.delai(1); });
  env.executer();
  assert.equal(p.interrompre('trop tard'), false);
});

test('interrompre un processus pas encore démarré est refusé explicitement', () => {
  const env = new Environnement();
  const p = env.processus(function* (e) { yield e.delai(1); }, 'plonge');
  assert.throws(() => p.interrompre('immédiat'), /Processus non démarré : plonge/);
  env.executer();          // le processus se déroule normalement ensuite
  assert.equal(p.ok, true);
});

test('un processus ne peut pas s’interrompre lui-même', () => {
  const env = new Environnement();
  let vu = null;
  const p = env.processus(function* (e) {
    try { p.interrompre('moi'); } catch (err) { vu = err.message; }
    yield e.delai(1);
  });
  env.executer();
  assert.match(vu, /ne peut pas s’interrompre|ne peut pas s'interrompre/);
});

/* ---- propagation des erreurs ------------------------------------------ */

test('une erreur de modèle remonte à l’appelant au lieu d’être avalée', () => {
  const env = new Environnement();
  env.processus(function* (e) { yield e.delai(2); throw new Error('recette introuvable'); });
  assert.throws(() => env.executer(), /recette introuvable/);
});

test('un échec attendu est rattrapable par le processus qui l’attend', () => {
  const env = new Environnement();
  let vu = null;
  const fragile = env.processus(function* (e) { yield e.delai(1); throw new Error('casse'); });
  env.processus(function* () {
    try { yield fragile; } catch (err) { vu = err.message; }
  });
  env.executer();
  assert.equal(vu, 'casse');
  assert.equal(env.maintenant, 1);
});

test('rendre autre chose qu’un événement est signalé clairement', () => {
  const env = new Environnement();
  env.processus(function* () { yield 12; });
  assert.throws(() => env.executer(), /que des événements/);
});

/* ---- avancée par pas, telle que le rendu l’utilise --------------------- */

test('avancerA traite l’instant demandé inclus, sans rejouer ni sauter', () => {
  const env = new Environnement();
  const vus = [];
  for (const t of [1, 5, 5, 10, 17]) env.processus(function* (e) { yield e.delai(t); vus.push(t); });

  assert.equal(env.avancerA(5), 5);
  assert.deepEqual(vus, [1, 5, 5]);
  assert.equal(env.avancerA(9), 9);          // aucun événement dans l’intervalle
  assert.deepEqual(vus, [1, 5, 5]);
  assert.equal(env.maintenant, 9);           // l’horloge avance quand même
  env.avancerA(20);
  assert.deepEqual(vus, [1, 5, 5, 10, 17]);
  assert.equal(env.maintenant, 20);
});

test('reculer l’horloge est refusé', () => {
  const env = new Environnement();
  env.avancerA(10);
  assert.throws(() => env.avancerA(9), /antérieur/);
});

test('une boucle de délais nuls est arrêtée par le garde-fou', () => {
  const env = new Environnement();
  env.processus(function* (e) { for (;;) yield e.delai(0); });
  assert.throws(() => env.executer({ maxPas: 500 }), /boucle de délais nuls/);
});

/* ---- annulation -------------------------------------------------------- */

test('un événement annulé n’exécute pas ses rappels', () => {
  const env = new Environnement();
  let appele = false;
  const ev = env.evenement('demande');
  ev.surResolution(() => { appele = true; });
  ev.reussir();
  ev.annuler();
  env.executer();
  assert.equal(appele, false);
});

/* ---- validation des entrées -------------------------------------------- */

test('les durées et instants invalides sont refusés à la source', () => {
  const env = new Environnement();
  assert.throws(() => env.delai(-1), RangeError);
  assert.throws(() => env.delai(NaN), RangeError);
  assert.throws(() => env.delai(Infinity), RangeError);
  assert.throws(() => env.processus({}), TypeError);
  const ev = env.evenement();
  ev.reussir(1);
  assert.throws(() => ev.reussir(2), /déjà déclenché/);
});
