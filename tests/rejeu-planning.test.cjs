/* Banc d'essai, évolution 11 (f) — le rejeu à effectif imposé : un planning
 * daté (moteur/planning.js) rejoue chaque jour d'une période avec les
 * personnes et les horaires qui étaient là ; la comparaison au réel y ajoute
 * les heures supp jour par jour, les nuits de plonge, les lots en retard ; le
 * calage du travail (moteur/calage-travail.js) cherche, ligne par ligne, le
 * facteur des homme-minutes qui fait déborder la simulation comme le réel
 * (docs/BANC_ESSAI.md § 10). Données fictives : l'unité de la référence de
 * non-régression, un planning et des heures supp inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const PL = require('../moteur/planning.js');
const R = require('../moteur/reel.js');
const CT = require('../moteur/calage-travail.js');
const T = require('../tableur.js');
const EC = require('../echanges-calage.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const UNITE = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
const NOMS = J.argumentsDeLUnite(UNITE, S.args.vols, {}).noms;
const POUR_LIRE = { services: Object.entries(NOMS).map(([id, nom]) => ({ id, nom })), ateliers: UNITE.etat.ateliers };
const OPTIONS = { delaiChargement: J.delaiDe(S.options) };
const vols = jours => jours.flatMap((d, i) => S.args.vols.filter((v, k) => v.sens !== 'DEP' || (k + i) % 4 !== 0 || i % 7 === 0).map(v => ({ ...v, date: d })));
const planning = csv => PL.lireFichier('planning.csv', csv, POUR_LIRE);
const extrait = (p, date, id) => p.journees.find(j => j.date === date).extrait.equipes.find(e => e.id === id);

test('le fichier : les noms sans casse ni accents ; un nom inconnu, une heure illisible : refusés, la ligne nommée', () => {
  const p = planning('date;service;equipe;debut;fin;personnes;jour\n2026-11-02;MONTAGE;montage est;06:00;14:00;3;\n2026-11-02;Cuisine Froide;cuisine froide nuit;22:00;06:00;2;-1\n');
  assert.deepEqual(p.jours['2026-11-02'].map(l => [l.service, l.equipe, l.duree, l.jour]), [['prepa', 'mo2', 480, null], ['cuisine', 'cu1', 480, -1]], 'jour vide : celui de l’équipe');
  assert.equal(planning('date;service;equipe;debut;fin;personnes;jour\n2026-11-02;Plonge;Plonge soir;13:00;21:00;2;1\n').jours['2026-11-02'][0].jour, 1, 'une plonge le lendemain');
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes;jour\n2026-11-02;Plonge;Plonge soir;13:00;21:00;2;2\n'), /ligne 2 : jour :/);
  // Deux équipes d'un service que seuls les accents distinguent : ambigu, refusé.
  const deux = { services: POUR_LIRE.services, ateliers: [{ id: 'e1', nom: 'Équipe A', service: 'prepa', type: 'manuel' }, { id: 'e2', nom: 'Equipe-A', service: 'prepa', type: 'manuel' }] };
  assert.throws(() => PL.lireFichier('p.csv', 'date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;equipe a;06:00;14:00;3\n', deux), /ligne 2 : « equipe a » désigne plusieurs équipes/);
  assert.equal(PL.lireFichier('p.csv', 'date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;e2;06:00;14:00;3\n', deux).jours['2026-11-02'][0].equipe, 'e2', 'par son identifiant');
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes\n2026-11-02;Montagne;Montage;06:00;14:00;3\n'), /^Error: ligne 2 : service inconnu « Montagne »/);
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;Montage;06:00;14:00;3\n2026-11-02;Montage;Inconnue;06:00;14:00;3\n'), /ligne 3 : équipe inconnue « Inconnue »/);
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;Montage;6h;14:00;3\n'), /ligne 2 : debut et fin/);
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;Montage;06:00;14:00;trois\n'), /ligne 2 : personnes/);
  assert.throws(() => planning('date;service;equipe;debut;personnes\n2026-11-02;Montage;Montage;06:00;3\n'), /colonne « fin » manquante/);
  assert.throws(() => planning('date;service;equipe;debut;fin;personnes\n2026-11-02;Montage;Montage;06:00;14:00;3\n02/11/2026;Montage;Montage;07:00;15:00;3\n'), /ligne 3 : l’équipe « Montage » est déjà au planning/);
  // Un classeur : la feuille « Planning ».
  const x = PL.lireFichier('planning.xlsx', [{ nom: 'Lisez-moi', lignes: [['fictif']] }, { nom: 'Planning', lignes: T.lireCsv('date;service;equipe;debut;fin;personnes\n2026-11-02;prepa;mo;03:00;11:00;5\n') }], POUR_LIRE);
  assert.equal(x.jours['2026-11-02'][0].personnes, 5);
  assert.match(PL.modeleCsv(POUR_LIRE), /^date;service;equipe;debut;fin;personnes;jour\r\n/);
});

test('trois jours rejoués : effectifs et horaires imposés ; une équipe absente du planning de son service ne travaille pas ; une vacation qui passe minuit', () => {
  const jours = ['2026-11-02', '2026-11-03', '2026-11-04'];
  const csv = 'date;service;equipe;debut;fin;personnes;jour\n' + jours.flatMap((d, i) => [d + ';Montage;Montage;04:00;12:00;' + (5 + i) + ';0',
    d + ';Cuisine froide;Cuisine froide nuit;22:00;06:00;3;-1']).join('\n') + '\n';
  const p = PE.simulerPeriode(UNITE, vols(jours), { ...OPTIONS, planning: planning(csv) });
  assert.equal(p.periode.rejeu.joursAvecPlanning, 3);
  jours.forEach((d, i) => {
    const mo = extrait(p, d, 'mo');
    assert.deepEqual([mo.personnes, mo.debutPoste, mo.finPresence - mo.debutPoste], [5 + i, 240, 480], d + ' : le Montage du planning');
    // Le Montage EST n'est pas au planning du Montage : il ne travaille pas (sans personne, il ne paraît pas parmi les équipes du jour).
    const absent = extrait(p, d, 'mo2');
    assert.ok(!absent || (absent.personnes === 0 && absent.lots === 0), d + ' : ' + JSON.stringify(absent));
    const nuit = extrait(p, d, 'cu1');
    assert.deepEqual([nuit.personnes, nuit.debutPoste, nuit.finPresence - nuit.debutPoste, nuit.jour], [3, 22 * 60 - 1440, 480, -1], d + ' : 22:00 → 06:00, la veille des vols');
    // Un service sans ligne garde ses équipes.
    assert.equal(extrait(p, d, 'pr').personnes, UNITE.etat.ateliers.find(a => a.id === 'pr').personnes);
  });
  // Une équipe constante (la Prépa : son poste ne suit pas les vols) le reste au planning : ses commandes, en temps nul.
  const prepa = 'date;service;equipe;debut;fin;personnes;jour\n' + jours.map(d => d + ';Prépa;Prépa;00:30;08:30;3;').join('\n') + '\n';
  const constante = PE.simulerPeriode(UNITE, vols(jours), { ...OPTIONS, planning: planning(prepa) });
  const ordinaire = PE.simulerPeriode(UNITE, vols(jours), OPTIONS);
  for (const d of jours) assert.equal(extrait(constante, d, 'pr').hommeMinutes, extrait(ordinaire, d, 'pr').hommeMinutes, d + ' : la Prépa reste constante');
  // Sans planning, rien ne change : la période d'avant, champ par champ.
  const sans = PE.simulerPeriode(UNITE, vols(jours), OPTIONS), avant = PE.simulerPeriode(UNITE, vols(jours), { ...OPTIONS, planning: null });
  assert.deepEqual(JSON.parse(JSON.stringify(avant)), JSON.parse(JSON.stringify(sans)));
  assert.equal('rejeu' in sans.periode, false);
  // Un jour sans planning se joue comme aujourd'hui.
  const un = PE.simulerPeriode(UNITE, vols(jours), { ...OPTIONS, planning: planning(csv.split('\n').filter(l => !l.startsWith('2026-11-03')).join('\n')) });
  assert.deepEqual(JSON.parse(JSON.stringify(un.journees[1].extrait)), JSON.parse(JSON.stringify(sans.journees[1].extrait)));
});

/** Quatre semaines fictives, le Montage au planning chaque jour ; un réel dont le travail vrai du Montage est 1,3 × le barème. */
function quatreSemaines() {
  const jours = PE.joursEntre('2026-09-07', '2026-10-04');
  const csv = 'date;service;equipe;debut;fin;personnes;jour\n' + jours.flatMap((d, i) => [d + ';Montage;Montage;03:00;10:00;' + (6 + (i % 3)) + ';0',
    d + ';Montage;Montage EST;06:00;12:00;2;0', d + ';Montage;Robot;03:00;11:00;2;0']).join('\n') + '\n';
  const pl = planning(csv), v = vols(jours);
  const vrai = PE.simulerPeriode(UNITE, v, { ...OPTIONS, planning: pl, facteurs: { prepa: 1.3 } }).bilan;
  const lignes = vrai.joursTravail.filter(w => w.complet).flatMap(w => [{ date: w.date, role: 'Monteur', titulaires: 7 * 8, interim: 0,
    supp: (((w.services.prepa || {}).heuresSup || 0) + ((w.services.prepa || {}).heuresSupOffice || 0)) / 60 }]);
  const controle = R.controler({ lignes: lignes.map((l, i) => ({ ligne: i + 2, ...l })), avecSupp: true });
  return { jours, pl, v, controle, correspondance: { lignes: [{ nom: 'Montage', roles: ['Monteur'], services: ['prepa'] }] } };
}

test('le rejeu dans la comparaison : les heures supp jour par jour, les nuits de plonge, les lots en retard', () => {
  const x = quatreSemaines();
  const b = PE.simulerPeriode(UNITE, x.v, { ...OPTIONS, planning: x.pl }).bilan;
  const c = R.comparer(b, x.controle, x.correspondance, { rejeu: true });
  const l = c.lignes[0], j = l.jours[3];
  assert.ok(Number.isFinite(j.heuresSuppSimulees) && Number.isFinite(j.heuresSuppReelles) && Number.isInteger(j.lotsEnRetard));
  assert.equal(l.rejeu.heuresSupp.jours, l.jours.length);
  assert.ok(Array.isArray(c.unite.rejeu.jours) && c.unite.rejeu.jours.every(w => Number.isInteger(w.nuitsOuvertes)));
  // Sans rejeu, la comparaison d'avant.
  const avant = R.comparer(b, x.controle, x.correspondance);
  assert.equal('heuresSuppSimulees' in avant.lignes[0].jours[3], false);
  assert.equal('rejeu' in avant.lignes[0], false);
});

test('le calage du travail : un travail vrai de 1,3 × le barème, retrouvé à 4 % près ; accepté, et au pas à pas', () => {
  const x = quatreSemaines();
  const t0 = Date.now();
  const r = CT.calerTravail({ unite: UNITE, vols: x.v, planning: x.pl, controle: x.controle, correspondance: x.correspondance, options: OPTIONS });
  const l = r.lignes[0];
  assert.ok(l.cale, l.raison);
  assert.ok(Math.abs(l.facteur / 1.3 - 1) < 0.04, 'facteur ' + l.facteur);
  assert.ok(l.erreur < l.erreurMoteur, 'plus juste que le barème');
  for (const [k, v] of Object.entries(l.regles)) assert.equal(v.ok, true, k + ' : ' + v.raison);
  assert.equal(l.accepte, true);
  assert.deepEqual(l.essais.map(e => e.k).filter(k => CT.GRILLE.includes(k)), CT.GRILLE);
  // Pas à pas : le même rapport, une progression qui avance jusqu'au total.
  const c = CT.creerCalageTravail({ unite: UNITE, vols: x.v, planning: x.pl, controle: x.controle, correspondance: x.correspondance, options: OPTIONS });
  let n = 0;
  while (c.suivant()) { n++; assert.ok(c.fait <= c.total); }
  assert.equal(n + 1, c.total);
  assert.deepEqual(c.resultat(), r);
  assert.ok(Date.now() - t0 < 60000);
});

test('le calage du travail se refuse sans planning ou sans heures supp au réel ; ne compte que les jours rejoués avec leur planning', () => {
  const x = quatreSemaines();
  // La correspondance se relit d'abord, avec les services de l'unité : une ligne fausse, rien ne se joue.
  assert.throws(() => CT.creerCalageTravail({ unite: UNITE, vols: x.v, planning: x.pl, controle: x.controle, services: Object.keys(NOMS),
    correspondance: { lignes: [{ nom: 'Montage', roles: ['Monteur'], services: ['montagne'] }] } }), /service inconnu « montagne »/);
  assert.throws(() => CT.creerCalageTravail({ unite: UNITE, vols: x.v, planning: { jours: { '2030-01-01': [] }, dates: ['2030-01-01'] }, controle: x.controle, correspondance: x.correspondance }),
    /ne couvre aucun jour de vols/);
  // Un planning sur dix jours seulement : la comparaison du rejeu et le calage ne comptent que ceux-là.
  const dix = { ...x.pl, jours: Object.fromEntries(Object.entries(x.pl.jours).slice(0, 10)), dates: x.pl.dates.slice(0, 10) };
  const b = PE.simulerPeriode(UNITE, x.v, { ...OPTIONS, planning: dix }).bilan, c = R.comparer(b, x.controle, x.correspondance, { rejeu: true });
  assert.ok(c.lignes[0].rejeu.joursAvecPlanning <= 10 && c.lignes[0].rejeu.heuresSupp.jours <= 10, JSON.stringify(c.lignes[0].rejeu));
  assert.ok(c.lignes[0].jours.some(j => !j.planning));
  const r = CT.calerTravail({ unite: UNITE, vols: x.v, planning: dix, controle: x.controle, correspondance: x.correspondance, options: OPTIONS }).lignes[0];
  assert.deepEqual([r.cale, r.joursAvecPlanning <= 10, r.joursCompares > 20], [false, true, true], 'moins de 20 jours rejoués : pas de calage');
  assert.match(r.raison, /moins de 20 jours/);
  assert.throws(() => CT.creerCalageTravail({ unite: UNITE, vols: x.v, planning: null, controle: x.controle, correspondance: x.correspondance }), /importez un planning/);
  assert.throws(() => CT.creerCalageTravail({ unite: UNITE, vols: x.v, planning: x.pl, controle: { ...x.controle, avecSupp: false }, correspondance: x.correspondance }), /heures supp/);
});

test('les outils : simuler-periode --planning, le rejeu de la page ; caler-periode, sa comparaison et --travail', () => {
  const x = quatreSemaines(), dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-rejeu-'));
  const f = nom => path.join(dossier, nom), outil = nom => path.join(__dirname, '..', 'outils', nom);
  const lancer = (o, ...a) => spawnSync(process.execPath, [outil(o), ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
  try {
    const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    fs.writeFileSync(f('sauvegarde.json'), JSON.stringify(S.sauvegarde));
    fs.writeFileSync(f('options.json'), JSON.stringify(S.options));
    fs.writeFileSync(f('vols.csv'), 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
      + x.v.map(v => [v.date, v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n');
    const csv = 'date;service;equipe;debut;fin;personnes;jour\n' + Object.values(x.pl.jours).flat()
      .map(l => [l.date, l.service, l.equipe, hh(l.debut), hh(l.fin), l.personnes, l.jour].join(';')).join('\n') + '\n';
    fs.writeFileSync(f('planning.csv'), csv);
    const r = lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), f('options.json'), '--sans-detail', '--planning', f('planning.csv'));
    assert.equal(r.status, 0, r.stderr);
    const sortie = JSON.parse(r.stdout);
    assert.deepEqual([sortie.periode.planning, sortie.periode.rejeu.joursAvecPlanning], ['planning.csv', 28]);
    // Avec le détail : une journée rejouée avec son planning n'a pas d'options (simuler-journee ne rejoue pas un planning).
    const detail = JSON.parse(lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), f('options.json'), '--planning', f('planning.csv')).stdout);
    assert.ok(detail.journees.every(j => j.rejeu === true && !('options' in j)));
    assert.match(r.stderr, /Rejeu à effectif imposé : 28 jours de vols avec leur planning/);
    const module = PE.depuisSauvegarde(S.sauvegarde, x.v, S.options, { planning: x.pl }).bilan;
    assert.deepEqual(sortie.bilan, JSON.parse(JSON.stringify(module)), 'le bilan du module');
    // Sans --planning, la période d'avant.
    const sans = JSON.parse(lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), f('options.json'), '--sans-detail').stdout);
    assert.equal('rejeu' in sans.periode, false);
    assert.match(lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), '--planning').stderr, /^Usage/);
    fs.writeFileSync(f('planning-faux.csv'), 'date;service;equipe;debut;fin;personnes\n2026-09-07;Montagne;Montage;03:00;10:00;5\n');
    assert.match(lancer('simuler-periode.cjs', f('sauvegarde.json'), f('vols.csv'), '--planning', f('planning-faux.csv')).stderr, /planning : ligne 2 : service inconnu « Montagne »/);
    // caler-periode : la comparaison du rejeu, et le calage du travail.
    fs.writeFileSync(f('periode.json'), r.stdout);
    fs.writeFileSync(f('reel.csv'), 'date;role;heures_titulaires;heures_interim;heures_supp\n' + [...x.controle.cellules.values()]
      .map(c => [c.date, c.role, c.titulaires, c.interim, c.supp].join(';')).join('\n') + '\n');
    fs.writeFileSync(f('correspondance.json'), JSON.stringify(x.correspondance));
    const c = lancer('caler-periode.cjs', f('periode.json'), f('reel.csv'), f('correspondance.json'), '--travail', f('sauvegarde.json'), f('vols.csv'), f('planning.csv'));
    assert.equal(c.status, 0, c.stderr);
    const cal = JSON.parse(c.stdout);
    assert.ok(Number.isFinite(cal.comparaison.lignes[0].rejeu.heuresSupp.mae));
    assert.ok(Math.abs(cal.travail.lignes[0].facteur / 1.3 - 1) < 0.04, 'facteur ' + cal.travail.lignes[0].facteur);
    assert.match(c.stderr, /Travail, Montage : × 1,[23]\d*, accepté/);
    // Le classeur : les heures supp du rejeu dans la Comparaison, le facteur de travail dans le Calage.
    const x2 = lancer('caler-periode.cjs', f('periode.json'), f('reel.csv'), f('correspondance.json'), '--xlsx', f('calage.xlsx'));
    assert.equal(x2.status, 0, x2.stderr);
    const cl = EC.calageVersClasseur({ comparaison: cal.comparaison, reel: null, rapport: cal.rapport, travail: cal.travail });
    const comp = cl.find(s => s.nom === 'Comparaison').lignes, calage = cl.find(s => s.nom === 'Calage').lignes;
    assert.ok(comp.some(l => l[0] === 'Montage' && l[2] === 'rejeu : heures supp du jour' && l[5] === 'h'));
    assert.ok(comp.some(l => l[0] === 'Montage' && l[2] === 'rejeu : heures supp, période'));
    assert.ok(comp.some(l => l[0] === 'Toute l’unité' && l[2] === 'rejeu : nuits de plonge ouvertes'));
    const t = calage.find(l => l[0] === 'Montage' && l[2] === 'calage du travail');
    assert.deepEqual([t[3], t[4], t[5]], ['facteur de travail', 'oui', Math.round(cal.travail.lignes[0].facteur * 1000) / 1000]);
    assert.ok(fs.existsSync(f('calage.xlsx')));
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
