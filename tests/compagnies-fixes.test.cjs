/* Évolution 26 (d) — les commandes fixes : une commande qui ne dépend d'aucun vol (une cantine, par exemple). Chaque jour
 * coché, elle donne au calcul un départ, à son heure, avec sa quantité, comme une ligne du programme ; cela se prépare
 * avant le calcul (compagnies.js, `preparerVols`), sans toucher moteur/. Si le programme porte aussi une ligne de cette
 * compagnie ce jour-là : la quantité du programme, l'heure de la commande fixe ; un jour non coché, la ligne compte, à
 * l'heure de la commande fixe. Unité, vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../compagnies.js');
const G = require('../compagnies-gestes.js');
const A = require('../ateliers.js');
const J = require('../moteur/journee.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');
const { simulerPeriode } = require('../outils/simuler-periode.cjs');

const VOLS = () => UI.parseFlights(F.volsCsv(), { eta: true, spmlParCabine: true, date: true });
const VOLS_DATES = () => UI.parseFlights(F.volsDatesCsv(3, '2031-03-03'), { eta: true, spmlParCabine: true, date: true });
const LUNDI = '2031-03-03', MARDI = '2031-03-04', MERCREDI = '2031-03-05';
/** L'unité fictive, sa liste changée par `f`. */
const unite = f => { const s = F.sauvegardeFictive(); const e = s.contenu['ory-ateliers-v1']; e.compagnies = f(e.compagnies); return s; };
/** EST, aux commandes fixes `fixe` ({ YC: { quantite, jours, heure } }). */
const estFixe = fixe => unite(l => l.map(c => (c.nom === 'EST' ? { ...c, fixe } : c)));
const etatDe = s => A.valider(s.contenu['ory-ateliers-v1']);
/** Le résultat d'une journée, par le chemin des outils : préparer, puis le moteur. */
function journee(sauvegarde, vols) {
  const p = C.preparerSauvegarde(sauvegarde, vols);
  return J.jouer(J.argumentsDeLaJournee(p.sauvegarde, p.vols));
}
/** Deux résultats du moteur, champ par champ (sous leur forme écrite). */
const memes = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const departsDe = (vols, cie) => vols.filter(v => v.cie === cie && v.sens === 'DEP');
/** Un lot se reconnaît à son service, son équipe et son nom (« Vol ES301 »). */
const cleDuLot = l => [l.service, l.atelier, l.nom].join('|');
const estDe = cie => l => l.cie === cie || (l.classes || []).some(id => id.startsWith(cie + '/'));

test('sans commande fixe, rien ne change : le même programme (le même objet), le même résultat', () => {
  const vols = VOLS(), dates = VOLS_DATES(), s = F.sauvegardeFictive(), sans = F.sauvegardeFictive({ liste: false });
  for (const v of [vols, dates]) {
    assert.equal(C.preparerVols(v, etatDe(s)), v, 'avec une liste sans commande fixe');
    assert.equal(C.preparerVols(v, etatDe(sans)), v, 'sans liste');
  }
  memes(journee(s, vols), J.jouer(J.argumentsDeLaJournee(C.preparerSauvegarde(s, vols).sauvegarde, vols)));
  // Une compagnie aux commandes fixes, réglée mais sans quantité ni ligne au programme : aucun départ.
  const zen = unite(l => l.map(c => (c.nom === 'ZEN' ? { ...c, fixe: {} } : c)));
  assert.deepEqual(departsDe(C.preparerVols(vols, etatDe(zen)), 'ZEN'), [], 'une commande fixe sans quantité ne donne aucun départ');
  memes(journee(zen, vols), journee(s, vols), 'ni aucun lot : le résultat d’avant');
});

test('une commande fixe réglée à l’heure et à la quantité de la ligne qu’elle remplace : le même résultat que cette ligne', () => {
  // Un programme où EST n'a qu'une ligne de départ, ES301 (06:50, 150 en éco, 4 équipages) ; le même, sans elle.
  const avecLigne = VOLS().filter(v => v.cie !== 'EST' || v.sens !== 'DEP' || v.id === 'ES301'), sansLigne = avecLigne.filter(v => v.id !== 'ES301');
  const ligne = avecLigne.find(v => v.id === 'ES301');
  assert.deepEqual([ligne.std, ligne.yc, ligne.crew, ligne.spml], [410, 150, 4, 0]);
  const fixe = estFixe({ YC: { quantite: 150, heure: '06:50' }, CREW: { quantite: 4, heure: '06:50' } });
  const prepare = departsDe(C.preparerVols(sansLigne, etatDe(fixe)), 'EST');
  assert.deepEqual(prepare, [{ id: 'EST-FIXE', cie: 'EST', sens: 'DEP', avion: '', std: 410, sta: null, bc: 0, pc: 0, yc: 150, crew: 4, spml: 0 }],
    'un départ, à son heure, avec sa quantité');
  // Le vol se nomme autrement (« EST-FIXE ») et n'a pas de type d'avion, que le calcul ne lit pas : au nom près, le même.
  const nom = r => JSON.stringify(r).replace(/EST-FIXE/g, 'ES301').replace(/"avion":"PETIT"/g, '"avion":""');
  const attendu = nom(journee(F.sauvegardeFictive(), avecLigne));
  assert.equal(nom(journee(fixe, sansLigne)), attendu, 'la ligne retirée du programme, la commande fixe à sa place');
  assert.equal(nom(journee(fixe, avecLigne)), attendu, 'la ligne gardée au programme : sa quantité, l’heure de la commande fixe');
});

test('changer l’heure d’une commande fixe ne change que ses propres lots', () => {
  const vols = VOLS().filter(v => v.cie !== 'EST' || v.sens !== 'DEP');
  const a = h => journee(estFixe({ YC: { quantite: 150, heure: h }, CREW: { quantite: 4, heure: h } }), vols);
  const tot = a('06:50'), tard = a('07:20');
  const avant = new Map(tot.lots.map(l => [cleDuLot(l), l])), apres = new Map(tard.lots.map(l => [cleDuLot(l), l]));
  assert.deepEqual([...apres.keys()].sort(), [...avant.keys()].sort(), 'les mêmes lots');
  const changes = [...avant].filter(([k, l]) => JSON.stringify(apres.get(k)) !== JSON.stringify(l)).map(([, l]) => l);
  assert.ok(changes.some(l => l.vol === 'EST-FIXE'), 'son départ a bougé');
  assert.deepEqual(changes.filter(l => !estDe('EST')(l)).map(l => l.nom), [], 'aucun lot d’une autre compagnie ne change');
  for (const id of Object.keys(tot.parClasse).filter(id => !id.startsWith('EST/'))) memes(tard.parClasse[id], tot.parClasse[id], id + ' : la même réponse');
  assert.equal(apres.get(cleDuLot(changes.find(l => l.vol === 'EST-FIXE'))).depart, 440, 'son départ : 07:20');
  // (Comme une ligne du programme : si sa nouvelle heure lui fait partager un camion ou un tunnel avec un autre vol, les lots
  // de ce vol suivent.)
});

test('un jour décoché, sans ligne au programme, ne donne aucun lot ; tous les jours cochés au départ', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-fixes-'));
  try {
    const ecrire = (nom, x) => { const f = path.join(dossier, nom); fs.writeFileSync(f, typeof x === 'string' ? x : JSON.stringify(x)); return f; };
    // Le programme daté sans les départs d'EST ; EST n'existe que le lundi.
    const lignes = F.volsDatesCsv(3, '2031-03-03').split('\n'), sansEst = lignes.filter((l, i) => !i || !/(^|[;,])ES3\d[13579]([;,]|$)/.test(l)).join('\n');
    assert.deepEqual(departsDe(UI.parseFlights(sansEst, { eta: true, spmlParCabine: true, date: true }), 'EST'), [], 'plus aucun départ d’EST au programme');
    const s = estFixe({ YC: { quantite: 120, jours: [1], heure: '09:00' }, CREW: { quantite: 3, jours: [1], heure: '09:00' } });
    const prepares = departsDe(C.preparerVols(UI.parseFlights(sansEst, { eta: true, spmlParCabine: true, date: true }), etatDe(s)), 'EST');
    assert.deepEqual(prepares.map(v => [v.date, v.std, v.yc, v.crew]), [[LUNDI, 540, 120, 3]], 'un départ le lundi, aucun le mardi ni le mercredi');
    const r = await simulerPeriode(ecrire('fixe.json', s), ecrire('vols.csv', sansEst), null);
    const parJour = Object.fromEntries(r.journees.map(j => [j.date, j.resultat]));
    assert.deepEqual(Object.keys(parJour), [LUNDI, MARDI, MERCREDI]);
    const propres = d => parJour[d].lots.filter(l => l.vol === 'EST-FIXE');
    assert.ok(propres(LUNDI).length, 'le lundi : ses lots');
    assert.deepEqual([propres(MARDI).length, propres(MERCREDI).length], [0, 0], 'le mardi et le mercredi : aucun lot de son départ');
    // (Une commande qui ne part pas ce jour-là n'est pas dans sa journée : comme une classe qui ne vole pas ce jour-là.)
    assert.deepEqual([MARDI, MERCREDI].map(d => (parJour[d].parClasse['EST/YC'] || { pax: 0 }).pax), [0, 0], 'ni aucune quantité');
    // Sans jours réglés, tous sont cochés : un départ chaque jour.
    const tous = C.preparerVols(UI.parseFlights(sansEst, { eta: true, spmlParCabine: true, date: true }), etatDe(estFixe({ YC: { quantite: 120 } })));
    assert.deepEqual(departsDe(tous, 'EST').map(v => [v.date, v.std, v.yc]), [[LUNDI, 720, 120], [MARDI, 720, 120], [MERCREDI, 720, 120]], 'tous les jours, à 12:00');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('avec une ligne au programme : la quantité du programme, l’heure de la commande fixe — même un jour décoché', () => {
  const dates = VOLS_DATES();
  const s = estFixe({ YC: { quantite: 999, jours: [1], heure: '08:00' }, CREW: { quantite: 99, jours: [1], heure: '08:00' } });
  const prepares = C.preparerVols(dates, etatDe(s)), est = departsDe(prepares, 'EST');
  const du = (d, champ) => departsDe(dates, 'EST').filter(v => v.date === d).reduce((k, v) => k + v[champ], 0);
  assert.deepEqual(est.map(v => [v.id, v.date, v.std, v.yc, v.crew, v.spml]),
    [LUNDI, MARDI, MERCREDI].map(d => ['EST-FIXE', d, 480, du(d, 'yc'), du(d, 'crew'), 0]),
    'chaque jour, un départ à 08:00 avec les quantités du programme (le mardi et le mercredi, décochés, aussi)');
  assert.equal(du(LUNDI, 'yc'), 750);
  // Ses retours restent tels quels ; les autres compagnies aussi, à leur place.
  assert.deepEqual(prepares.filter(v => v.cie === 'EST' && v.sens === 'RET'), dates.filter(v => v.cie === 'EST' && v.sens === 'RET'));
  assert.deepEqual(prepares.filter(v => v.cie !== 'EST'), dates.filter(v => v.cie !== 'EST'));
  // Deux heures : deux départs, nommés par leur heure.
  const deux = departsDe(C.preparerVols(VOLS(), etatDe(estFixe({ YC: { heure: '08:00' }, CREW: { heure: '05:30' } }))), 'EST');
  assert.deepEqual(deux.map(v => [v.id, v.std, v.yc, v.crew]), [['EST-FIXE-0530', 330, 0, 20], ['EST-FIXE-0800', 480, 750, 0]]);
});

test('la commande fixe se lit et se règle ; une valeur fausse est refusée en disant quoi faire', () => {
  assert.deepEqual(C.lire([{ nom: 'cantine', classes: ['YC', 'BC'], fixe: { YC: { quantite: 80, jours: [5, 1, 9], heure: '11:30' }, PC: { quantite: 3 } } }]),
    [{ nom: 'CANTINE', classes: ['BC', 'YC'], fixe: { YC: { quantite: 80, jours: [1, 5], heure: '11:30' } } }], 'ses classes seulement, ses jours rangés');
  assert.throws(() => C.lire([{ nom: 'X', classes: ['YC'], fixe: { YC: { quantite: -1 } } }]), /entier, de 0 à 99 999/);
  assert.throws(() => C.lire([{ nom: 'X', classes: ['YC'], fixe: { YC: { heure: '25:00' } } }]), /HH:MM/);
  const e0 = etatDe(F.sauvegardeFictive()), vols = VOLS();
  const e1 = G.typeDeCommandes(e0, vols, 'zen', true);
  assert.deepEqual(e1.compagnies.find(c => c.nom === 'ZEN'), { nom: 'ZEN', classes: ['YC'], fixe: {} }, '« Fixe, sans vol »');
  assert.deepEqual(G.fixeDe(e1.compagnies.find(c => c.nom === 'ZEN'), 'YC'), { quantite: 0, jours: [1, 2, 3, 4, 5, 6, 7], heure: '12:00' }, 'au départ : tous les jours, 12:00');
  let e = G.reglerFixe(e1, vols, 'ZEN', 'YC', { quantite: ' 40 ' });
  e = G.reglerFixe(e, vols, 'ZEN', 'YC', { heure: '05:15' });
  e = G.reglerFixe(e, vols, 'ZEN', 'YC', { jour: 7, coche: false });
  assert.deepEqual(e.compagnies.find(c => c.nom === 'ZEN').fixe, { YC: { quantite: 40, jours: [1, 2, 3, 4, 5, 6], heure: '05:15' } });
  assert.deepEqual(A.valider({ ...e }).compagnies.find(c => c.nom === 'ZEN').fixe, { YC: { quantite: 40, jours: [1, 2, 3, 4, 5, 6], heure: '05:15' } }, 'l’état des équipes la garde');
  for (const [o, motif] of [[{ quantite: '2,5' }, /entier/], [{ quantite: '-3' }, /entier/], [{ quantite: '' }, /entier/], [{ quantite: '100000' }, /99 999/],
    [{ heure: '4h' }, /tapez par exemple 0430/], [{ jour: 8, coche: true }, /de 1 \(lundi\) à 7 \(dimanche\)/]])
    assert.throws(() => G.reglerFixe(e, vols, 'ZEN', 'YC', o), motif, JSON.stringify(o));
  assert.throws(() => G.reglerFixe(e0, vols, 'ZEN', 'YC', { quantite: 1 }), /Fixe, sans vol/);
  assert.throws(() => G.reglerFixe(e, vols, 'ZEN', 'BC', { quantite: 1 }), /cochez-la d’abord/);
  // « Avec des vols » : ses réglages fixes partent ; renommée, elle les garde.
  assert.equal('fixe' in G.typeDeCommandes(e, vols, 'ZEN', false).compagnies.find(c => c.nom === 'ZEN'), false);
  assert.deepEqual(G.renommer(e, {}, 'ZEN', 'CANTINE').etat.compagnies.find(c => c.nom === 'CANTINE').fixe, e.compagnies.find(c => c.nom === 'ZEN').fixe);
  // Le code d'avant, qui ne prépare pas les commandes fixes, ne voit aucun vol de ZEN : sa commande lui reste une classe
  // ajoutée (sans quantité), comme avant le réglage.
  const aligne = G.aligner(e, C.idsDuProgramme(C.preparerVols(vols, e)));
  assert.deepEqual(aligne.ajoutees.filter(x => x.cie === 'ZEN'), [{ cie: 'ZEN', cabine: 'YC' }]);
});
