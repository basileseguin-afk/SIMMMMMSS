/* Régressions du procédé en données (moteur/procede.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Procede, chargerProcede, validerProcede, Aleas } = require('../moteur/procede.js');

const EXEMPLE = path.join(__dirname, '..', 'moteur', 'procede-exemple.json');

/** Procédé minimal valide, que chaque test déforme à sa guise. */
const base = () => ({
  nom: 'essai', horizon: 100, graine: 7,
  postes: [{ nom: 'p1', capacite: 1, tampon: 10 }],
  produits: [{
    nom: 'article',
    source: { loi: ['f', 2], fin: 20 },
    poste: ['p1'], operation: [['f', 1]], quantite: [1], composants: [[]]
  }]
});

/* ======================================================================
 *  TIRAGES
 * ====================================================================*/

test('les tirages sont reproductibles et respectent leurs bornes', () => {
  const a = new Aleas(42), b = new Aleas(42);
  const suite = al => Array.from({ length: 200 }, () => al.tirer(['u', 2, 5]));
  const s = suite(a);
  assert.deepEqual(s, suite(b));
  assert.ok(Math.min(...s) >= 2 && Math.max(...s) <= 5);
  assert.notDeepEqual(s, suite(new Aleas(43)));
});

test('un tirage normal ne rend jamais de durée négative', () => {
  const a = new Aleas(1);
  for (let i = 0; i < 2000; i++) assert.ok(a.tirer(['n', 1, 0.6]) >= 0);
  assert.equal(a.tirer(['f', 3.5]), 3.5);
});

/* ======================================================================
 *  VALIDATION — toutes les anomalies d'un coup
 * ====================================================================*/

test('les listes de la gamme doivent avoir la même longueur', () => {
  const d = base();
  d.produits[0].operation = [['f', 1], ['f', 2]];
  const { erreurs } = validerProcede(d);
  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /`operation` a 2 case\(s\) pour 1 étape\(s\)/);
});

test('un fichier fautif est refusé avec TOUTES ses anomalies, pas la première', () => {
  const d = base();
  d.postes.push({ nom: 'p1', capacite: 0 });                       // doublon + capacité
  d.produits[0].poste = ['inconnu'];                               // poste inexistant
  d.produits[0].operation = [['z', 1]];                            // loi inconnue
  d.produits.push({ nom: 'orphelin' });                            // ni source ni gamme
  const { erreurs } = validerProcede(d);
  assert.ok(erreurs.length >= 4, 'attendu au moins 4 anomalies, reçu ' + erreurs.length);
  assert.ok(erreurs.some(e => /nom en double/.test(e)));
  assert.ok(erreurs.some(e => /poste « inconnu » inconnu/.test(e)));
  assert.ok(erreurs.some(e => /loi « z » inconnue/.test(e)));
  assert.ok(erreurs.some(e => /sans gamme ni source/.test(e)));
  assert.throws(() => new Procede(d), /Procédé refusé, \d+ anomalie/);
});

test('un lot plus grand que le tampon du poste est refusé avant de bloquer', () => {
  const d = base();
  d.postes[0].tampon = 4;
  d.produits[0].quantite = [6];
  const { erreurs } = validerProcede(d);
  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /lot de 6 impossible.*ne contient que 4.*Blocage garanti/);
});

test('un composant doit pouvoir exister, et nul ne se consomme soi-même', () => {
  const d = base();
  d.produits.push({ nom: 'fantome' });
  d.produits[0].composants = [[{ produit: 'fantome', quantite: 1 }]];
  let erreurs = validerProcede(d).erreurs;
  assert.ok(erreurs.some(e => /« fantome ».*ni source ni gamme ne le produit/.test(e)));

  const d2 = base();
  d2.produits[0].composants = [[{ produit: 'article', quantite: 1 }]];
  erreurs = validerProcede(d2).erreurs;
  assert.ok(erreurs.some(e => /ne peut pas se consommer lui-même/.test(e)));
});

test('un écart-type large est signalé sans refuser le fichier', () => {
  const d = base();
  d.produits[0].operation = [['n', 1, 0.9]];
  const { erreurs, avertissements } = validerProcede(d);
  assert.deepEqual(erreurs, []);
  assert.equal(avertissements.length, 1);
  assert.match(avertissements[0], /ramenés à zéro/);
});

test('les sources mal formées sont refusées', () => {
  const sans = base(); sans.produits[0].source = {};
  assert.match(validerProcede(sans).erreurs.join(), /`loi`.*ou `calendrier`/);
  const cal = base(); cal.produits[0].source = { calendrier: [{ instant: -1, quantite: 0 }] };
  const e = validerProcede(cal).erreurs;
  assert.ok(e.some(x => /`instant` doit être un nombre ≥ 0/.test(x)));
  assert.ok(e.some(x => /`quantite` doit être un entier ≥ 1/.test(x)));
});

test('un JSON illisible donne un message utile', () => {
  assert.throws(() => chargerProcede('{ pas du json'), /JSON illisible/);
});

/* ======================================================================
 *  EXÉCUTION
 * ====================================================================*/

test('une gamme simple produit ce qu’on attend, et le résultat est reproductible', () => {
  const p = new Procede(base());
  const r1 = p.simuler();
  const r2 = p.simuler();
  assert.deepEqual(r1, r2);                       // même graine, même résultat

  const article = r1.produits.find(x => x.nom === 'article');
  assert.equal(article.fini, true);
  assert.equal(article.crees, 11);                // une arrivée toutes les 2 min jusqu'à 20
  assert.equal(article.termines, 11);
  assert.equal(article.traverseeMoyenne, 1);      // une opération d'une minute, sans attente
  assert.equal(r1.postes[0].tauxOccupation, 0.11);// 11 minutes de travail sur 100
});

test('le calendrier d’une source place les unités aux instants demandés', () => {
  const d = base();
  d.produits[0].source = { calendrier: [{ instant: 10, quantite: 3 }, { instant: 5, quantite: 2 }] };
  const r = new Procede(d).simuler();
  assert.equal(r.produits[0].crees, 5);           // l'ordre du fichier n'a pas d'importance
  assert.equal(r.produits[0].termines, 5);
});

test('un lot n’est lancé que lorsqu’il est complet', () => {
  const d = base();
  d.produits[0].quantite = [4];
  d.produits[0].source = { calendrier: [{ instant: 0, quantite: 6 }] };
  const r = new Procede(d).simuler();
  // 6 unités, lot de 4 : un lot part, les 2 restantes attendent indéfiniment.
  assert.equal(r.produits[0].crees, 6);
  assert.equal(r.produits[0].termines, 4);
  assert.equal(r.postes[0].tampon.remplissage, 2);
});

test('le goulot est désigné par la mesure, pas par un seuil choisi à la main', () => {
  const d = {
    nom: 'deux postes', horizon: 200, graine: 3,
    postes: [{ nom: 'rapide', capacite: 1, tampon: 50 }, { nom: 'lent', capacite: 1, tampon: 2 }],
    produits: [{
      nom: 'piece', source: { loi: ['f', 1], fin: 100 },
      poste: ['rapide', 'lent'], operation: [['f', 0.2], ['f', 3]], quantite: [1, 1], composants: [[], []]
    }]
  };
  const r = new Procede(d).simuler();
  assert.equal(r.goulot.poste, 'lent');
  assert.ok(r.goulot.tauxOccupation > 0.9);
  const rapide = r.postes.find(p => p.nom === 'rapide');
  // Le poste rapide ne travaille que 0,2 min par pièce, mais il tient sa place
  // bien plus longtemps : le tampon du poste lent le bloque.
  assert.ok(rapide.tauxOccupation > 0.2, 'le blocage amont doit gonfler l’occupation du poste rapide');
  assert.ok(r.postes.find(p => p.nom === 'lent').tampon.partBloquante > 0.5);
});

/* ======================================================================
 *  L'EXEMPLE PUBLIÉ
 * ====================================================================*/

test('l’exemple fourni est valide, s’exécute et ne contient aucune donnée réelle', () => {
  const texte = fs.readFileSync(EXEMPLE, 'utf8');
  assert.match(texte, /fictif/i);
  const p = chargerProcede(texte);
  assert.deepEqual(p.avertissements, []);
  assert.deepEqual(p.produitsFinis, ['plateau']);

  const r = p.simuler();
  const plateau = r.produits.find(x => x.nom === 'plateau');
  assert.ok(plateau.termines > 250, 'trop peu de plateaux terminés : ' + plateau.termines);
  // Sans gamme, « terminé » n'a pas de sens : null plutôt que zéro.
  assert.equal(r.produits.find(x => x.nom === 'sachet_couverts').termines, null);

  assert.equal(r.goulot.poste, 'dressage');
  assert.ok(r.goulot.tauxOccupation > 0.95);
  const dressage = r.postes.find(x => x.nom === 'dressage');
  assert.ok(dressage.tampon.partBloquante > 0.1, 'le dressage doit bloquer son amont');
  // La traversée dépasse largement la somme des opérations (~5,8 min) : le
  // reste est de l'attente, et c'est bien ce qu'on cherche à voir.
  assert.ok(plateau.traverseeMoyenne > 20, 'traversée mesurée : ' + plateau.traverseeMoyenne);
});
