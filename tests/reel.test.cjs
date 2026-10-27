/* Banc d'essai, évolution 11 (b) — le réel (moteur/reel.js) : le fichier « Réel
 * par jour », ses contrôles (rien ne bloque : une anomalie écarte sa seule
 * cellule, ou se signale), la correspondance des rôles avec la simulation, et
 * la comparaison sur les jours de travail complets (docs/BANC_ESSAI.md § 10).
 * Rôles, services et heures fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/reel.js');
const T = require('../tableur.js');
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const lire = csv => R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(csv) }]);
const csv = (...l) => ['date;role;heures_titulaires;heures_interim;heures_supp'].concat(l).join('\n');
const proche = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-9, (msg || '') + ' : ' + x + ' ≠ ' + y);
/** Un bilan de période réduit à ce que la comparaison lit : la charge et l'encadrement par service, les chauffeurs. */
function bilan(jours) {
  return { services: [{ id: 'prepa', nom: 'Préparation' }, { id: 'cuisine', nom: 'Cuisine' }, { id: 'quais', nom: 'Quais' }],
    joursTravail: jours.map(([date, prepa, cuisine, complet = true, plus = {}]) => ({ date, complet,
      services: { prepa: { charge: prepa, chargeEncadrement: 1, heuresSup: 120 }, cuisine: { charge: cuisine, heuresSup: 0 } },
      total: { chauffeursCamion: 2, chauffeursVL: 1, heuresSupChauffeurs: 90, ...plus } })) };
}
const CORR = { lignes: [{ nom: 'Prépa', roles: ['Préparateur'], services: ['prepa'] }, { nom: 'Bureau', roles: ['Agent'], hors: true }] };

test('le fichier : heures décimales ou HH:MM, en-têtes sans casse ni accents, une seule colonne « heures », le service devant le rôle', () => {
  const lu = R.lireReel([{ nom: 'Réel', lignes: [['Date', 'Rôle', 'Heures Titulaires', 'HEURES_INTÉRIM', 'Service'],
    ['02/11/2026', 'Préparateur', '7:30', '3,5', 'Prépa'], ['2026-11-03', 'Préparateur', 15, null, 'Prépa']] }]);
  assert.deepEqual(lu.lignes.map(l => [l.date, l.role, l.titulaires, l.interim, l.supp]),
    [['2026-11-02', 'Prépa / Préparateur', 7.5, 3.5, null], ['2026-11-03', 'Prépa / Préparateur', 15, 0, null]]);
  assert.equal(lu.avecSupp, false);
  const seule = R.lireReel([{ nom: 'x.csv', lignes: T.lireCsv('date;role;heures\n2026-11-02;Agent;8') }]);
  assert.deepEqual([seule.lignes[0].titulaires, seule.lignes[0].interim], [8, 0], 'une seule colonne : des titulaires');
  // Un classeur : sa feuille « Réel ».
  assert.equal(R.lireReel([{ nom: 'Lisez-moi', lignes: [['x']] }, { nom: 'REEL', lignes: [['date', 'role', 'heures'], ['2026-11-02', 'A', 1]] }]).lignes.length, 1);
});

test('un fichier mal formé est refusé entier, la ligne nommée', () => {
  assert.throws(() => lire(csv('2026-11-02;Préparateur;7;0;0', '2026-13-02;Préparateur;7;0;0')), /ligne 3 : date illisible/);
  assert.throws(() => lire(csv('2026-11-02;Préparateur;sept;0;0')), /ligne 2 : heures attendues/);
  assert.throws(() => lire(csv('2026-11-02;;7;0;0')), /ligne 2 : rôle manquant/);
  assert.throws(() => lire('date;role;heures_titulaires\n2026-11-02;A;7'), /heures_interim/);
  assert.throws(() => lire('jour;role;heures\n2026-11-02;A;7'), /colonne « date »/);
  assert.throws(() => R.lireReel([{ nom: 'A', lignes: [] }, { nom: 'B', lignes: [] }]), /feuille « Réel » introuvable/);
});

test('les ETP : titulaires ÷ leur base + intérim ÷ la sienne, base par rôle ; écart, erreur, biais, corrélation', () => {
  const reel = lire(csv('2026-11-02;Préparateur;56;14;0', '2026-11-03;Préparateur;35;7;0', '2026-11-04;Préparateur;70;0;0',
    '2026-11-02;Agent;8;0;0', '2026-11-03;Agent;8;0;0', '2026-11-04;Agent;8;0;0'));
  const c = R.comparer(bilan([['2026-11-02', 9, 1], ['2026-11-03', 6, 1], ['2026-11-04', 11, 1]]), reel,
    { ...CORR, bases: { Préparateur: { titulaires: 7, interim: 3.5 } } });
  const prepa = c.lignes.find(l => l.nom === 'Prépa');
  // 56 ÷ 7 + 14 ÷ 3,5 = 12 ; 35 ÷ 7 + 7 ÷ 3,5 = 7 ; 70 ÷ 7 = 10.
  assert.deepEqual(prepa.jours.map(j => [j.date, j.reel, j.simule, j.ecart]), [['2026-11-02', 12, 9, -3], ['2026-11-03', 7, 6, -1], ['2026-11-04', 10, 11, 1]]);
  proche(prepa.periode.mae, 5 / 3, 'erreur moyenne'); proche(prepa.periode.biais, -1, 'biais');
  proche(prepa.periode.correlation, 26 / 38, 'corrélation');
  assert.deepEqual(prepa.mois.map(m => [m.mois, m.jours]), [['2026-11', 3]]);
  // Le bureau, hors simulation (base par défaut, 7 h) : simulé 0, et il compte dans le total de l'unité.
  const bureau = c.lignes.find(l => l.nom === 'Bureau');
  assert.deepEqual(bureau.jours.map(j => [j.reel, j.simule]), [[8 / 7, 0], [8 / 7, 0], [8 / 7, 0]]);
  assert.equal(bureau.couvre, 'hors simulation');
  proche(c.unite.jours[0].reel, 12 + 8 / 7, 'l’unité : toutes les lignes'); proche(c.unite.jours[0].simule, 9);
  proche(c.unite.periode.mae, (3 + 8 / 7 + 1 + 8 / 7 + Math.abs(1 - 8 / 7)) / 3, 'erreur du total');
  proche(c.unite.periode.biais, (-3 - 1 + 1) / 3 - 8 / 7, 'biais du total');
});

test('une ligne de deux rôles additionne leurs ETP, chacun à sa base ; encadrement et chauffeurs', () => {
  const reel = lire(csv('2026-11-02;Préparateur;14;0;1', '2026-11-02;Chef;10;0;0', '2026-11-02;Conducteur;14;7;2', '2026-11-02;Superviseur;7;0;0'));
  const c = R.comparer(bilan([['2026-11-02', 3, 1]]), reel, { bases: { Chef: { titulaires: 10, interim: 7 } }, lignes: [
    { nom: 'Prépa', roles: ['Préparateur', 'Chef'], services: ['prepa'] },
    { nom: 'Encadrement prépa', roles: ['Superviseur'], encadrement: 'prepa' },
    { nom: 'Chauffeurs', roles: ['Conducteur'], chauffeurs: 'camion' }] });
  const l = nom => c.lignes.find(x => x.nom === nom).jours[0];
  assert.deepEqual([l('Prépa').reel, l('Prépa').simule], [14 / 7 + 10 / 10, 3]);
  assert.deepEqual([l('Encadrement prépa').reel, l('Encadrement prépa').simule], [1, 1]);
  assert.deepEqual([l('Chauffeurs').reel, l('Chauffeurs').simule], [3, 2]);
  // Les heures supp, par ligne et par mois : réelles, et simulées (les chauffeurs camion : 2 sur 3 de leurs heures sup).
  assert.deepEqual(c.lignes.find(x => x.nom === 'Prépa').heuresSupp, [{ mois: '2026-11', jours: 1, reel: 1, simule: 2 }]);
  assert.deepEqual(c.lignes.find(x => x.nom === 'Chauffeurs').heuresSupp, [{ mois: '2026-11', jours: 1, reel: 2, simule: 1 }]);
});

test('un jour de travail incomplet sort de la comparaison ; les rôles sans ligne sont listés, pas comptés', () => {
  const reel = lire(csv('2026-11-01;Préparateur;7;0;0', '2026-11-02;Préparateur;7;0;0', '2026-11-02;Plongeur;7;0;0'));
  const c = R.comparer(bilan([['2026-11-01', 1, 0, false], ['2026-11-02', 1, 0]]), reel, CORR);
  assert.deepEqual(c.jours, ['2026-11-02']);
  assert.deepEqual(c.joursIncomplets, ['2026-11-01']);
  assert.deepEqual(c.rolesSansLigne, ['Plongeur']);
  assert.equal(c.unite.jours[0].reel, 1 + 0, 'le plongeur ne compte pas ; le bureau, sans réel ce jour-là, vaut 0');
});

test('chaque anomalie est écartée ou signalée, avec sa raison ; l’utilisateur réintègre ou écarte', () => {
  const jours = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-11-02', '2026-11-03', '2026-11-04'];
  const lignes = jours.flatMap(d => [d + ';Préparateur;7;' + (d.startsWith('2026-11') ? 0 : 7) + ';0'])
    .concat(jours.filter(d => d !== '2026-11-03').map(d => d + ';Agent;8;0;0'))
    .concat(['2026-11-04;Magasinier;-2;3;0', '2026-10-02;Préparateur;1;0;0']);
  const reel = lire(csv(...lignes));
  const c = R.controler(reel);
  const raison = (code, k) => (c.ecartees.find(x => x.code === code && x.cle === k) || {}).raison;
  assert.equal(raison('double', '2026-10-02|Préparateur'), 'en double (lignes 3, 14)');
  assert.equal(raison('negatif', '2026-11-04|Magasinier|titulaires'), 'titulaires négatives (-2 h)');
  assert.ok(!c.cellules.has('2026-10-02|Préparateur'), 'la cellule en double est écartée');
  assert.equal(c.cellules.get('2026-11-04|Magasinier').titulaires, undefined, 'seule la catégorie négative est écartée');
  assert.equal(c.cellules.get('2026-11-04|Magasinier').interim, 3);
  const signal = code => c.signalees.filter(x => x.code === code).map(x => x.raison);
  assert.deepEqual(signal('mois-a-zero'), ['Préparateur : intérim à zéro tout le mois 2026-11, présentes les autres mois']);
  assert.deepEqual(signal('jour-absent'), ['Agent : absent le 2026-11-03, présent tous les autres jours']);
  assert.ok(c.cellules.has('2026-11-02|Préparateur'), 'signalé, rien n’est écarté');
  // Réintégrer : les lignes en double s'additionnent ; écarter un jour ou une cellule.
  const d = R.controler(reel, { reintegres: ['2026-10-02|Préparateur'], ecartes: { jours: ['2026-10-01'], cellules: ['2026-11-02|Agent'] } });
  assert.equal(d.cellules.get('2026-10-02|Préparateur').titulaires, 8);
  assert.ok(![...d.cellules.keys()].some(k => k.startsWith('2026-10-01')));
  assert.deepEqual(d.joursEcartes, ['2026-10-01']);
  assert.equal(d.ecartees.find(x => x.cle === '2026-11-02|Agent').raison, 'écartée par vous');
  // La comparaison laisse de côté le jour où l'une des heures de la ligne est écartée.
  const b = bilan(jours.map(x => [x, 1, 0]));
  const comp = R.comparer(b, d, { lignes: [{ nom: 'Magasin', roles: ['Magasinier'], hors: true }] });
  assert.deepEqual(comp.lignes[0].joursSansReel, ['2026-11-04']);
  assert.ok(comp.lignes[0].jours.length > 0, 'les autres jours comptent (le magasinier à 0)');
});

test('la correspondance : un rôle dans une seule ligne, une seule chose couverte, des services connus', () => {
  const v = c => () => R.validerCorrespondance(c, { services: ['prepa', 'cuisine'] });
  assert.throws(v({ lignes: [{ nom: 'A', roles: ['X'], hors: true }, { nom: 'B', roles: ['X'], hors: true }] }), /le rôle « X » est dans deux lignes/);
  assert.throws(v({ lignes: [{ nom: 'A', roles: ['X'], services: ['prepa'], hors: true }] }), /une seule chose couverte/);
  assert.throws(v({ lignes: [{ nom: 'A', roles: ['X'], services: ['montage'] }] }), /service inconnu « montage »/);
  assert.throws(v({ lignes: [{ nom: 'A', roles: ['X'], chauffeurs: 'bus' }] }), /camion ou vl/);
  assert.throws(v({ bases: { defaut: { titulaires: 0 } }, lignes: [] }), /de plus de 0 à 24/);
  assert.deepEqual(R.validerCorrespondance({ lignes: [] }).bases.defaut, { titulaires: 7, interim: 7 }, 'la base par défaut : 7 h et 7 h');
});

test('avec la vraie charge d’une période fictive : le simulé est la charge des services couverts', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const vols = ['2026-11-02', '2026-11-03'].flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
  const b = PE.depuisSauvegarde(S.sauvegarde, vols, S.options).bilan;
  const w = b.joursTravail.find(x => x.complet);
  const reel = lire(csv(w.date + ';Cuisinier;21;0;0'));
  const c = R.comparer(b, reel, { lignes: [{ nom: 'Cuisine', roles: ['Cuisinier'], services: ['cuisine'] }] });
  assert.deepEqual(c.lignes[0].jours.map(j => [j.date, j.reel, j.simule]), [[w.date, 3, w.services.cuisine.charge]]);
});

test('la sauvegarde garde la correspondance et les jours écartés, sans aucune heure', () => {
  const reglages = R.validerReglages({ correspondance: CORR, decisions: { ecartes: { jours: ['2026-11-02'], cellules: ['2026-11-03|Agent'] }, reintegres: [] } });
  assert.deepEqual(reglages.decisions.ecartes.jours, ['2026-11-02']);
  assert.equal(reglages.correspondance.lignes.length, 2);
  const texte = JSON.stringify(reglages);
  assert.ok(!/titulaires"\s*:\s*\d|heures/.test(texte.replace(/"titulaires":7,"interim":7/g, '')), 'pas d’heures : ' + texte);
  assert.throws(() => R.validerReglages({ decisions: { ecartes: { jours: ['2026-11-02|56'] } } }), /clés valides/);
  // Le modèle CSV : fictif, trois jours, deux rôles, et il se relit.
  const m = lire(R.modeleCsv());
  assert.deepEqual([[...new Set(m.lignes.map(l => l.date))].length, [...new Set(m.lignes.map(l => l.role))].length], [3, 2]);
});

test('une cellule écartée entière (en double, ou par vous) sort de la comparaison de sa ligne, ce jour-là : jamais 0 h réelle', () => {
  const reel = lire(csv('2026-11-02;Préparateur;56;0;0', '2026-11-03;Préparateur;35;0;0', '2026-11-03;Préparateur;7;0;0', '2026-11-04;Préparateur;70;0;0',
    '2026-11-02;Agent;8;0;0', '2026-11-03;Agent;8;0;0', '2026-11-04;Agent;8;0;0'));
  const b = bilan([['2026-11-02', 9, 1], ['2026-11-03', 6, 1], ['2026-11-04', 11, 1]]);
  const c = R.comparer(b, reel, CORR), prepa = c.lignes.find(l => l.nom === 'Prépa');
  assert.deepEqual(prepa.joursSansReel, ['2026-11-03']);
  assert.deepEqual(prepa.jours.map(j => j.date), ['2026-11-02', '2026-11-04']);
  assert.deepEqual(c.unite.jours.map(j => j.date), ['2026-11-02', '2026-11-04'], 'ni dans le total de l’unité');
  proche(prepa.periode.mae, (1 + 1) / 2);
  // Écartée par vous : de même ; le bureau, lui, compte encore ce jour-là.
  const d = R.comparer(b, R.controler(reel, { reintegres: ['2026-11-03|Préparateur'], ecartes: { cellules: ['2026-11-02|Préparateur'] } }), CORR);
  assert.deepEqual(d.lignes.find(l => l.nom === 'Prépa').joursSansReel, ['2026-11-02']);
  assert.equal(d.lignes.find(l => l.nom === 'Bureau').jours.length, 3);
  // Sans aucune ligne, pas de total de l'unité (pas une erreur de 0).
  const vide = R.comparer(b, reel, { lignes: [] });
  assert.deepEqual([vide.unite.jours, vide.unite.periode.jours, vide.unite.periode.mae], [[], 0, null]);
});

test('les pièges du fichier : des heures au format heure d’Excel, « heures » avec « heures_interim », un « | » dans un rôle', () => {
  // Une cellule Excel au format heure : 07:30 arrive en 0,3125 (une fraction de jour).
  assert.throws(() => R.lireReel([{ nom: 'Réel', lignes: [['date', 'role', 'heures_titulaires', 'heures_interim'], ['2026-11-02', 'A', 0.3125, 0], ['2026-11-03', 'A', 0.25, 0]] }]),
    /colonne « heures_titulaires » : des heures au format heure d’Excel \(7:30 lu 0,3125\)/);
  assert.equal(R.lireReel([{ nom: 'Réel', lignes: [['date', 'role', 'heures_titulaires', 'heures_interim'], ['2026-11-02', 'A', 7.5, 0.5]] }]).lignes[0].interim, 0.5,
    'une demi-heure d’intérim, à côté de vraies heures : lue');
  assert.throws(() => lire('date;role;heures;heures_interim\n2026-11-02;A;7;7'), /colonne « heures_titulaires » \(ou « heures »\) manquante/);
  assert.throws(() => lire(csv('2026-11-02;A|B;7;0;0')), /ligne 2 : rôle « A\|B » : le caractère « \| » n’y est pas permis/);
});

test('la correspondance : une même chose couverte par une seule ligne ; une base partielle complète par la base par défaut ; un rôle nommé comme une propriété', () => {
  assert.throws(() => R.validerCorrespondance({ lignes: [{ nom: 'A', roles: ['X'], services: ['prepa'] }, { nom: 'B', roles: ['Y'], services: ['prepa', 'cuisine'] }] }),
    /deux lignes couvrent le service « prepa » \(« A » et « B »\)/);
  assert.throws(() => R.validerCorrespondance({ lignes: [{ nom: 'A', roles: ['X'], chauffeurs: 'vl' }, { nom: 'B', roles: ['Y'], chauffeurs: 'vl' }] }), /les chauffeurs VL/);
  assert.equal(R.validerCorrespondance({ lignes: [{ nom: 'A', roles: ['X'], hors: true }, { nom: 'B', roles: ['Y'], hors: true }] }).lignes.length, 2, 'hors simulation : autant qu’on veut');
  const b = R.validerCorrespondance({ bases: { defaut: { titulaires: 8, interim: 8 }, Chef: { titulaires: 10 } }, lignes: [] }).bases;
  assert.deepEqual(b.Chef, { titulaires: 10, interim: 8 });
  const reel = lire(csv('2026-11-02;constructor;7;0;0', '2026-11-02;toString;14;0;0'));
  const c = R.comparer(bilan([['2026-11-02', 1, 0]]), reel, { lignes: [{ nom: 'P', roles: ['constructor', 'toString'], hors: true }] });
  assert.equal(c.lignes[0].jours[0].reel, 3, 'leurs ETP, à la base par défaut');
});

test('écarter le jour qu’un rôle manque : le signal s’en va', () => {
  const jours = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
  const reel = lire(csv(...jours.map(d => d + ';A;7;0;0'), ...jours.filter(d => d !== '2026-11-04').map(d => d + ';B;7;0;0')));
  assert.equal(R.controler(reel).signalees.filter(x => x.code === 'jour-absent').length, 1);
  assert.equal(R.controler(reel, { ecartes: { jours: ['2026-11-04'] } }).signalees.filter(x => x.code === 'jour-absent').length, 0);
});

