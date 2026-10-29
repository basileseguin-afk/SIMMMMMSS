/* Banc d'essai, correction 12 — une cellule absente du réel n'est pas un zéro
 * (moteur/reel.js, moteur/calage-periode.js ; docs/BANC_ESSAI.md § 10). Une
 * cellule jour × rôle sans ligne dans le fichier, ou écartée, n'a pas de réel ;
 * une ligne présente à 0 h reste un vrai zéro. Un jour où l'un des rôles d'une
 * ligne n'a pas de réel sort de sa comparaison et de son calage, avec sa
 * raison ; le total de l'unité ne compte que les jours où toutes les lignes ont
 * leur réel, et liste ceux qu'il retire. L'anomalie « rôle absent » regroupe
 * les jours d'absence en périodes. Avec un réel complet, rien ne change. Rôles,
 * services et heures fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/reel.js');
const C = require('../moteur/calage-periode.js');
const T = require('../tableur.js');
const REF = require('./reel-complet.attendu.json');

const lire = lignes => R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(['date;role;heures_titulaires;heures_interim;heures_supp'].concat(lignes).join('\n')) }]);
const jours = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
/** Un bilan réduit à ce que la comparaison lit : la charge de chaque service, chaque jour. */
const bilan = (dates, charge = () => 2) => ({ services: [{ id: 'prepa', nom: 'Préparation' }, { id: 'cuisine', nom: 'Cuisine' }],
  joursTravail: dates.map((date, i) => ({ date, complet: true, services: { prepa: { charge: charge(i), heuresSup: 60 }, cuisine: { charge: 1, heuresSup: 0 } }, total: {} })) });
const CORR = { lignes: [{ nom: 'Prépa', roles: ['Préparateur'], services: ['prepa'] }, { nom: 'Bureau', roles: ['Agent'], hors: true }] };

test('un rôle sans ligne pendant 10 jours : ces jours sortent de sa ligne, ils ne comptent pas 0', () => {
  const d = jours(30), absents = d.slice(10, 20);
  const reel = lire(d.flatMap(x => [x + ';Agent;7;0;0'].concat(absents.includes(x) ? [] : [x + ';Préparateur;14;0;0'])));
  const c = R.comparer(bilan(d), reel, CORR), prepa = c.lignes.find(l => l.nom === 'Prépa');
  assert.equal(prepa.jours.length, 20);
  assert.ok(!prepa.jours.some(j => absents.includes(j.date)), 'aucun jour à 0 h');
  assert.deepEqual(prepa.joursSansReel, absents.map(date => ({ date, raison: 'rôle Préparateur sans ligne ce jour-là' })));
  assert.equal(prepa.periode.mae, 0, 'réel 2 ETP, simulé 2 : aucune erreur ; avec des zéros, elle vaudrait 2 un jour sur trois');
  // Son calage ne voit pas ces jours : 20 jours, pas 30.
  assert.equal(C.caler(c).lignes.find(l => l.nom === 'Prépa').jours, 20);
});

test('une ligne présente à 0 heure reste un vrai zéro', () => {
  const d = jours(3), reel = lire(d.flatMap(x => [x + ';Préparateur;0;0;0', x + ';Agent;7;0;0']));
  const prepa = R.comparer(bilan(d), reel, CORR).lignes.find(l => l.nom === 'Prépa');
  assert.deepEqual(prepa.jours.map(j => j.reel), [0, 0, 0]);
  assert.deepEqual(prepa.joursSansReel, []);
});

test('une ligne de deux rôles dont l’un manque un jour : ce jour sort de la ligne, avec sa raison ; une cellule aux heures négatives aussi', () => {
  const d = jours(4), corr = { lignes: [{ nom: 'Prépa', roles: ['Préparateur', 'Chef'], services: ['prepa'] }, { nom: 'Bureau', roles: ['Agent'], hors: true }] };
  const reel = lire(d.flatMap((x, i) => [x + ';Préparateur;7;0;0', x + ';Agent;7;0;0'].concat(i === 1 ? [] : [x + ';Chef;' + (i === 3 ? -2 : 7) + ';0;0'])));
  const c = R.comparer(bilan(d), reel, corr), prepa = c.lignes[0];
  assert.deepEqual(prepa.jours.map(j => j.date), [d[0], d[2]]);
  assert.deepEqual(prepa.joursSansReel, [{ date: d[1], raison: 'rôle Chef sans ligne ce jour-là' },
    { date: d[3], raison: 'cellule écartée (Chef) : titulaires négatives (-2 h)' }]);
  assert.equal(prepa.jours[0].reel, 2, 'le jour complet : ses deux rôles');
  // La feuille « Réel » du classeur : la cellule du préparateur ce jour-là ne compte pas, et le dit.
  const EC = require('../echanges-calage.js'), feuille = EC.calageVersClasseur({ comparaison: c, reel: R.controler(reel) }).find(f => f.nom === 'Réel').lignes;
  assert.equal(feuille.find(l => l[1] === 'Préparateur' && l[0].excel === T.dateExcel(d[1]))[9], 'jour sans réel pour sa ligne : rôle Chef sans ligne ce jour-là');
  assert.equal(feuille.find(l => l[1] === 'Préparateur' && l[0].excel === T.dateExcel(d[0]))[9], 'compté');
});

test('le total de l’unité saute les jours où une ligne manque, et les liste avec la ligne qui manque', () => {
  const d = jours(5);
  const reel = lire(d.flatMap((x, i) => (i === 2 ? [x + ';Agent;7;0;0'] : i === 4 ? [x + ';Préparateur;14;0;0'] : [x + ';Préparateur;14;0;0', x + ';Agent;7;0;0'])));
  const c = R.comparer(bilan(d), reel, CORR);
  assert.deepEqual(c.unite.jours.map(j => j.date), [d[0], d[1], d[3]]);
  assert.deepEqual(c.unite.joursRetires, [{ date: d[2], lignes: ['Prépa'] }, { date: d[4], lignes: ['Bureau'] }]);
  // Sans jour retiré, pas de liste (la comparaison d'avant).
  assert.equal('joursRetires' in R.comparer(bilan(d), lire(d.flatMap(x => [x + ';Préparateur;14;0;0', x + ';Agent;7;0;0'])), CORR).unite, false);
});

test('l’anomalie « rôle absent » regroupe dix jours d’absence de suite en une seule période, et signale sans écarter', () => {
  const d = jours(31), absents = d.slice(4, 14);
  const reel = lire(d.flatMap(x => [x + ';Agent;7;0;0'].concat(absents.includes(x) || x === d[20] ? [] : [x + ';Préparateur;14;0;0'])));
  const s = R.controler(reel).signalees.filter(x => x.code === 'role-absent');
  assert.deepEqual(s.map(x => [x.role, x.du, x.au, x.jours]), [['Préparateur', d[4], d[13], 10], ['Préparateur', d[20], d[20], 1]]);
  assert.deepEqual(s.map(x => x.raison), ['Préparateur : absent du 05/10 au 14/10 (10 jours), présent les autres jours',
    'Préparateur : absent le 21/10, présent les autres jours']);
  assert.equal(R.controler(reel).ecartees.length, 0, 'rien n’est écarté : l’absence retire déjà ces jours');
  // Un rôle présent tous les jours ne se signale pas ; un jour écarté par vous n'est pas une absence.
  assert.equal(R.controler(lire(d.map(x => x + ';Agent;7;0;0'))).signalees.length, 0);
  assert.equal(R.controler(reel, { ecartes: { jours: [d[20]] } }).signalees.filter(x => x.code === 'role-absent').length, 1);
});

test('le total de l’unité, avant et après calage, aussi en validation par semaines quand la validation est par mois', () => {
  const comparaison = R.comparer(REF.bilan, lire(REF.csv), REF.correspondance), r = C.caler(comparaison);
  assert.equal(r.unite.validation, 'mois');
  assert.deepEqual(Object.keys(r.unite.semaines), ['avant', 'apres']);
  assert.deepEqual(r.unite.semaines.avant, r.unite.avant, 'avant : le moteur, qui n’apprend rien');
  assert.equal(r.unite.semaines.apres.jours, r.unite.apres.jours);
  assert.ok(Number.isFinite(r.unite.semaines.apres.mae) && r.unite.semaines.apres.mae !== r.unite.apres.mae);
  // Une seule validation par semaines : le total d'avant, sans rien de plus.
  const un = C.caler({ ...comparaison, lignes: comparaison.lignes.map(l => ({ ...l, jours: l.jours.filter(j => j.date >= '2026-10-01') })),
    unite: { ...comparaison.unite, jours: comparaison.unite.jours.filter(j => j.date >= '2026-10-01') } });
  assert.deepEqual(Object.keys(un.unite), ['avant', 'apres']);
});

test('non-régression : un réel complet donne la même comparaison et le même calage, champ par champ', () => {
  const comparaison = R.comparer(REF.bilan, lire(REF.csv), REF.correspondance);
  assert.deepEqual(JSON.parse(JSON.stringify(comparaison)), REF.comparaison);
  const { validation, semaines, ...unite } = C.caler(comparaison).unite;
  assert.deepEqual(JSON.parse(JSON.stringify({ ...C.caler(comparaison), unite })), REF.calage, 'seul le total par semaines s’ajoute');
  assert.ok(validation && semaines);
});

test('un rôle d’une ligne que le fichier n’a pas du tout : la ligne n’a aucun jour, et on le signale', () => {
  const d = jours(5), corr = { lignes: [{ nom: 'Prépa', roles: ['Préparateur', 'Prepateur'], services: ['prepa'] }, { nom: 'Bureau', roles: ['Agent'], hors: true }] };
  const c = R.comparer(bilan(d), lire(d.flatMap(x => [x + ';Préparateur;14;0;0', x + ';Agent;7;0;0'])), corr);
  assert.deepEqual([c.lignes[0].jours.length, c.unite.jours.length], [0, 0]);
  assert.deepEqual(c.anomalies.signalees.filter(x => x.code === 'role-introuvable').map(x => x.raison),
    ['rôle Prepateur de la ligne « Prépa » absent du fichier : la ligne n’a aucun jour avec du réel, ni le total de l’unité']);
  // Tous les rôles des lignes dans le fichier : pas de signal.
  assert.equal(R.comparer(bilan(d), lire(d.flatMap(x => [x + ';Préparateur;14;0;0', x + ';Agent;7;0;0'])), CORR).anomalies.signalees.length, 0);
});

test('les heures supp d’une ligne et son rejeu ne comptent pas un jour où l’un de ses rôles manque', () => {
  const d = jours(3), corr = { lignes: [{ nom: 'Prépa', roles: ['Préparateur', 'Chef'], services: ['prepa'] }] };
  const reel = lire(d.flatMap((x, i) => [x + ';Préparateur;7;0;2'].concat(i === 1 ? [] : [x + ';Chef;7;0;1'])));
  const c = R.comparer(bilan(d), reel, corr, { rejeu: true }), l = c.lignes[0];
  assert.deepEqual(l.heuresSupp, [{ mois: '2026-10', jours: 2, reel: 6, simule: 2 }], 'deux jours, 3 h réelles chacun ; 1 h simulée chacun');
  assert.deepEqual(l.jours.map(j => [j.date, j.heuresSuppReelles]), [[d[0], 3], [d[2], 3]]);
  assert.equal(l.rejeu.heuresSupp.jours, 2);
});
