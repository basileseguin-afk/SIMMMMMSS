/* Banc d'essai, évolution 10 (a) — le programme de vols daté (v1) : la colonne
 * facultative `date`, en CSV, en feuille unique avec `sens` et dans les
 * feuilles « Départs » et « Retours » ; AAAA-MM-JJ, JJ/MM/AAAA ou une date
 * Excel ; l'export qui l'écrit en première colonne et se relit à l'identique ;
 * le rapport d'import de la période. Vols et compagnies fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const UI = require('../ui-model.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');

const V1 = { eta: true, spmlParCabine: true, date: true };
const ENTETE = 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,heure_eta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
// Trois jours fictifs : le même vol NO1 chaque jour ; le 3, une date en JJ/MM/AAAA ; un ETA de la veille le 2.
const CSV = ENTETE + '\n'
  + '2026-11-02,NO1,NORD,A320,DEP,10:00,,08:30,0,0,100,4,1\n'
  + '2026-11-02,SU1,SUD,A321,DEP,12:00,,,10,0,120,5,0\n'
  + '2026-11-02,NO-R1,NORD,A320,RET,,09:00,,0,0,100,4,0\n'
  + '2026-11-03,NO1,NORD,A320,DEP,06:00,,22:40,0,0,90,4,0\n'
  + '2026-11-03,NO-R1,NORD,A320,RET,,09:00,,0,0,100,4,0\n'
  + '04/11/2026,NO1,NORD,A320,DEP,10:00,,,0,0,100,4,1\n';
const parFichier = async feuilles => T.lireClasseur(T.ecrireClasseur(feuilles));
const sansDate = vols => vols.map(({ date, ...v }) => v);

test('la date : AAAA-MM-JJ, JJ/MM/AAAA, JJ/MM/AA ou une date Excel ; une date qui n’existe pas est refusée', () => {
  assert.deepEqual(['2026-11-02', '2/11/2026', '02.11.26', '2026-11-02T00:00:00', 46328, 46328.75].map(UI.dateDe), Array(6).fill('2026-11-02'));
  assert.equal(UI.dateDe(''), null);
  for (const x of ['31/02/2026', '2026-13-01', 'lundi', 12, '02/11']) assert.throws(() => UI.dateDe(x), /date illisible/, String(x));
});

test('un programme de 3 jours, en CSV, en feuille unique et en Départs / Retours : lu de la même façon', async () => {
  const csv = UI.parseFlights(CSV, V1);
  assert.equal(csv.length, 6);
  assert.deepEqual(csv.map(v => v.date), ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-03', '2026-11-03', '2026-11-04']);
  assert.deepEqual(csv[3], { id: 'NO1', cie: 'NORD', sens: 'DEP', avion: 'A320', std: 360, sta: null, bc: 0, pc: 0, yc: 90, crew: 4, spml: 0,
    eta: 22 * 60 + 40 - 1440, date: '2026-11-03' }, 'heure_eta plus tard que le départ : la veille');
  // Une feuille unique, comme le CSV, avec la date en vraie date Excel.
  const lignes = CSV.trim().split('\n').map(l => l.split(','));
  const unique = lignes.map((l, i) => (i ? [T.celluleDate(UI.dateDe(l[0])), ...l.slice(1)] : l));
  assert.deepEqual(E.classeurVersVols(await parFichier([{ nom: 'Vols', lignes: unique }]), V1), csv);
  // Départs et Retours : la date dans chaque feuille.
  // Exporté puis réimporté : identique, les départs (feuille Départs) puis les retours (feuille Retours), comme sans date.
  const f = await parFichier(E.volsVersClasseur(csv));
  assert.deepEqual(E.classeurVersVols(f, V1), csv.filter(v => v.sens === 'DEP').concat(csv.filter(v => v.sens === 'RET')), 'exporté puis réimporté : identique');
  const relu = E.classeurVersVols(f, V1);
  assert.deepEqual(E.classeurVersVols(await parFichier(E.volsVersClasseur(relu)), V1), relu, 'et de nouveau');
});

test('l’export écrit la date en première colonne, une vraie date Excel, et la décrit dans Lisez-moi', async () => {
  const csv = UI.parseFlights(CSV, V1);
  const ecrites = E.volsVersClasseur(csv);
  for (const nom of ['Départs', 'Retours']) assert.equal(ecrites.find(x => x.nom === nom).lignes[0][0], 'date', nom);
  const lu = await parFichier(ecrites);
  assert.equal(lu.find(x => x.nom === 'Départs').lignes[1][0], 46328, 'le 02/11/2026 : une date Excel');
  assert.match(lu.find(x => x.nom === 'Lisez-moi').lignes.flat().join(' '), /Colonne date \(programme daté/);
  // Sans programme daté : le classeur d'avant, sans colonne date.
  const avant = E.volsVersClasseur(sansDate(csv));
  assert.equal(avant.find(x => x.nom === 'Départs').lignes[0][0], 'vol_id');
  assert.doesNotMatch(avant.find(x => x.nom === 'Lisez-moi').lignes.flat().join(' '), /Colonne date/);
});

test('sans colonne date : une seule journée, comme aujourd’hui', () => {
  // Le premier jour, sans la colonne : les mêmes vols qu'avant l'évolution, sans date.
  const sans = CSV.split('\n').filter((l, i) => !i || l.startsWith('2026-11-02')).map(l => l.split(',').slice(1).join(',')).join('\n');
  const v = UI.parseFlights(sans, V1);
  assert.equal(v.length, 3);
  assert.ok(v.every(x => !('date' in x)));
  assert.deepEqual(v, UI.parseFlights(sans, { eta: true, spmlParCabine: true }), 'l’option date ne change rien sans la colonne');
  // Une colonne date vide partout : pas daté non plus.
  const vide = sans.split('\n').map((l, i) => (l ? (i ? ',' : 'date,') + l : l)).join('\n');
  assert.deepEqual(UI.parseFlights(vide, V1), v);
  // Le même vol deux jours de suite, sans date : un doublon, comme avant.
  assert.throws(() => UI.parseFlights(CSV.split('\n').map(l => l.split(',').slice(1).join(',')).join('\n'), V1), /doublon NO1 \(DEP\)/);
});

test('des lignes datées et d’autres non, ou une date illisible : rien n’est importé, et la ligne est nommée', async () => {
  const melange = CSV.replace('2026-11-03,NO-R1', ',NO-R1');
  assert.throws(() => UI.parseFlights(melange, V1), /Ligne 6 : date manquante : le programme est daté/);
  assert.throws(() => UI.parseFlights(CSV.replace('04/11/2026', '31/11/2026'), V1), /Ligne 7 : date illisible « 31\/11\/2026 »/);
  // Le même vol deux fois le même jour : un doublon ; un autre jour, un autre vol.
  assert.throws(() => UI.parseFlights(CSV.replace('2026-11-03,NO1', '2026-11-02,NO1'), V1), /doublon NO1 \(DEP, 2026-11-02\)/);
  // Dans un classeur, la feuille et la ligne.
  const f = E.volsVersClasseur(UI.parseFlights(CSV, V1)).map(x => (x.nom === 'Retours' ? { ...x, lignes: x.lignes.map((l, i) => (i === 2 ? ['', ...l.slice(1)] : l)) } : x));
  await assert.rejects(async () => E.classeurVersVols(await parFichier(f), V1), /Retours, ligne 3 : date manquante/);
  // La version 2 (sans l'option) ignore la colonne, comme avant.
  const un = CSV.split('\n').filter((l, i) => !i || l.startsWith('2026-11-02')).join('\n');
  assert.ok(UI.parseFlights(un).length === 3 && UI.parseFlights(un).every(v => !('date' in v)));
});

test('le rapport d’import décrit la période ; un jour sans vol au milieu est signalé, sans bloquer', () => {
  const v = UI.parseFlights(CSV.replace(/2026-11-03/g, '2026-11-05').replace('04/11/2026', '06/11/2026'), V1);
  const d = PE.decrire(v);
  assert.deepEqual([d.debut, d.fin, d.jours, d.sansVol], ['2026-11-02', '2026-11-06', 5, ['2026-11-03', '2026-11-04']]);
  assert.deepEqual(d.parJour.map(j => [j.date, j.departs, j.retours]), [['2026-11-02', 2, 1], ['2026-11-03', 0, 0], ['2026-11-04', 0, 0], ['2026-11-05', 1, 1], ['2026-11-06', 1, 0]]);
  const texte = PE.texteDuProgramme(d).join('\n');
  assert.match(texte, /Programme daté : du 02\/11\/2026 au 06\/11\/2026, 5 jours\./);
  assert.match(texte, /Vols par jour : de 1 à 3 \(2 en moyenne\) — 02\/11 : 3 · 03\/11 : 0 · 04\/11 : 0 · 05\/11 : 2 · 06\/11 : 1\./);
  assert.match(texte, /Aucun vol le 03\/11 : jour sans vol ou oubli \?\nAucun vol le 04\/11 : jour sans vol ou oubli \?/);
  assert.equal(PE.decrire(sansDate(v)), null, 'sans date : pas de période');
  assert.deepEqual(PE.volsDuJour(v, '2026-11-05'), sansDate(v.filter(x => x.date === '2026-11-05')));
});

test('un fichier daté se lit par l’import de la page et du banc ; une journée d’un seul jour se joue comme aujourd’hui', async () => {
  const fichier = { name: 'vols-dates.csv', size: CSV.length, text: async () => CSV };
  assert.deepEqual(await J.volsDuFichier(fichier), UI.parseFlights(CSV, V1));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-date-'));
  try {
    const sauvegarde = path.join(dossier, 'sauvegarde.json');
    fs.writeFileSync(sauvegarde, JSON.stringify(require('./non-regression.attendu.json').scenarios.find(s => s.nom === 'unite-vol').sauvegarde));
    const outil = path.join(__dirname, '..', 'outils', 'simuler-journee.cjs');
    fs.writeFileSync(path.join(dossier, 'trois.csv'), CSV);
    const r = spawnSync(process.execPath, [outil, sauvegarde, path.join(dossier, 'trois.csv')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /programme daté sur 3 jours \(du 2026-11-02 au 2026-11-04\).*simuler-periode/);
    // Un seul jour daté : la journée de ces vols, comme sans la colonne.
    const un = CSV.split('\n').filter((l, i) => !i || l.startsWith('2026-11-02')).join('\n') + '\n';
    fs.writeFileSync(path.join(dossier, 'un.csv'), un);
    fs.writeFileSync(path.join(dossier, 'sans.csv'), un.split('\n').map(l => l.split(',').slice(1).join(',')).join('\n'));
    const jouer = f => JSON.parse(spawnSync(process.execPath, [outil, sauvegarde, path.join(dossier, f)], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
    const a = jouer('un.csv'), b = jouer('sans.csv');
    assert.equal(a.journee.date, '2026-11-02');
    assert.deepEqual(a.resultat, b.resultat);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
