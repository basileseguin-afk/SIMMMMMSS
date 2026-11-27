/* Évolution 26 (e) — l'import rattache, il ne crée plus. Avec une liste, chaque ligne du programme est rattachée à une
 * compagnie de la liste par les règles de tri de l'import (compagnies.js, `rattacher`) ; une ligne qui ne se rattache à
 * rien n'est pas comptée, et son code est dit, avec ses vols et ses classes. « La rattacher à… » écrit une règle des
 * codes compagnie ; « L'ignorer », un ICAO exclu. Sans liste, l'import d'avant. Un seul chemin de calcul : les outils
 * lisent les règles dans la sauvegarde. Unité, vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../compagnies.js');
const A = require('../ateliers.js');
const J = require('../moteur/journee.js');
const W = require('../moteur/import-flights.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');
const { simulerJournee } = require('../outils/simuler-journee.cjs');
const { simulerPeriode } = require('../outils/simuler-periode.cjs');

/** Les vols de l'unité fictive, plus deux vols d'une compagnie que la liste ne connaît pas (ECO). */
const ECO = 'EC101,ECO,PETIT,DEP,09:40,,0,0,90,3,0\nEC100,ECO,PETIT,RET,,08:20,0,0,90,3,0\n';
const avecEco = csv => csv.replace(/\n?$/, '\n') + ECO;
const lire = csv => UI.parseFlights(csv, { eta: true, spmlParCabine: true, date: true });
const VOLS = () => lire(F.volsCsv());
const VOLS_ECO = () => lire(avecEco(F.volsCsv()));
const etatDe = s => A.valider(s.contenu['ory-ateliers-v1']);
/** L'unité fictive (avec sa liste), ses règles d'import `regles` gardées dans la sauvegarde. */
function unite(regles, o) {
  const s = F.sauvegardeFictive(o);
  if (regles) s.contenu[W.CLE_STOCKAGE] = W.enveloppe(regles);
  return s;
}
/** Le résultat d'une journée, par le chemin des outils : préparer, puis le moteur. */
function journee(sauvegarde, vols) {
  const p = C.preparerSauvegarde(sauvegarde, vols);
  return J.jouer(J.argumentsDeLaJournee(p.sauvegarde, p.vols));
}
const memes = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const pax = (r, id) => (r.parClasse[id] || { pax: 0 }).pax;

test('avec une liste, une compagnie inconnue n’est pas comptée : aucune commande, son code dit avec ses vols et ses classes', () => {
  const vols = VOLS_ECO(), etat = etatDe(unite());
  const ra = C.rattacher(vols, etat.compagnies, null);
  assert.deepEqual(ra.nonRattaches, [{ code: 'ECO', vols: 2, classes: ['YC', 'CREW'] }]);
  assert.equal(ra.rattaches, vols.length - 2, 'toutes les autres lignes sont rattachées');
  assert.equal(ra.ignores, 0);
  const prepares = C.preparerVols(vols, etat, null);
  assert.ok(!prepares.some(v => v.cie === 'ECO'), 'ses lignes ne sont pas comptées, départs et retours');
  assert.ok(![...C.idsDuProgramme(prepares)].some(id => id.startsWith('ECO/')), 'aucune commande ECO');
  // Le résultat est celui du programme sans ECO, champ par champ.
  memes(journee(unite(), vols), journee(unite(), VOLS()), 'le calcul ne voit pas ECO');
  assert.ok(!Object.keys(journee(unite(), vols).parClasse).some(id => id.startsWith('ECO/')));
});

test('« La rattacher à… » : la règle des codes compagnie mène ECO à NORD, ses vols comptent pour NORD', () => {
  const vols = VOLS_ECO(), regles = W.reglesCompletes({ compagnies: { ECO: 'NORD' } }), etat = etatDe(unite());
  const ra = C.rattacher(vols, etat.compagnies, regles);
  assert.deepEqual(ra.nonRattaches, [], 'plus rien à rattacher');
  assert.equal(ra.rattaches, vols.length);
  const prepares = C.preparerVols(vols, etat, regles);
  assert.deepEqual(prepares.filter(v => v.id === 'EC101' || v.id === 'EC100').map(v => v.cie), ['NORD', 'NORD'], 'ses lignes portent NORD');
  assert.equal(vols.find(v => v.id === 'EC101').cie, 'ECO', 'le programme importé reste tel quel');
  const avant = journee(unite(), VOLS()), apres = journee(unite(regles), vols);
  assert.equal(pax(apres, 'NORD/YC'), pax(avant, 'NORD/YC') + 90, 'NORD · Économie compte les 90 repas d’ECO');
  assert.equal(pax(apres, 'NORD/CREW'), pax(avant, 'NORD/CREW') + 3);
  assert.ok(apres.lots.some(l => l.vol === 'EC101' && (l.classes || []).some(id => id.startsWith('NORD/'))), 'le vol EC101 est préparé pour NORD');
  // Le nom de la liste passe avant la table : une règle qui mènerait NORD ailleurs ne déplace pas ses vols.
  const detour = W.reglesCompletes({ compagnies: { NORD: 'SUD' } });
  const v = VOLS();
  assert.equal(C.preparerVols(v, etat, detour), v, 'NORD reste NORD : le même programme (le même objet)');
  // Une règle vers une compagnie hors de la liste ne rattache pas.
  assert.deepEqual(C.rattacher(vols, etat.compagnies, W.reglesCompletes({ compagnies: { ECO: 'AILLEURS' } })).nonRattaches.map(n => n.code), ['ECO']);
});

test('« L’ignorer » : ECO parmi les ICAO exclus, ses vols ne comptent pas et ne sont plus à rattacher', () => {
  const vols = VOLS_ECO(), regles = W.reglesCompletes({ icaoExclus: ['ECO'] }), etat = etatDe(unite());
  const ra = C.rattacher(vols, etat.compagnies, regles);
  assert.deepEqual(ra.nonRattaches, []);
  assert.equal(ra.ignores, 2);
  memes(journee(unite(regles), vols), journee(unite(), VOLS()), 'le calcul ne voit pas ECO');
});

test('sans liste, l’import d’avant : le même programme, la même sauvegarde, le même résultat', () => {
  const vols = VOLS_ECO(), s = unite(null, { liste: false }), etat = etatDe(s);
  assert.equal(C.preparerVols(vols, etat, W.reglesCompletes({ compagnies: { ECO: 'NORD' } })), vols, 'le même objet');
  const p = C.preparerSauvegarde(s, vols);
  assert.equal(p.sauvegarde, s); assert.equal(p.vols, vols);
  memes(journee(s, vols), J.jouer(J.argumentsDeLaJournee(s, vols)), 'le moteur, sans rien préparer');
  assert.ok(Object.keys(journee(s, vols).parClasse).some(id => id.startsWith('ECO/')), 'sans liste, ECO a ses commandes, comme avant');
  // Avec la liste d'aujourd'hui (toutes les compagnies du programme y sont), rien ne change non plus.
  const liste = etatDe(unite()), v = VOLS();
  assert.equal(C.preparerVols(v, liste, null), v, 'la liste d’aujourd’hui : le même objet');
  assert.equal(C.preparerVols(v, liste, W.reglesCompletes({ icaoExclus: ['NORD'] })), v, 'un nom de la liste passe avant les codes exclus : le même objet');
});

test('les outils lisent les règles dans la sauvegarde : le même résultat que la page ; des règles fausses sont refusées', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-rattache-'));
  try {
    const ecrire = (nom, x) => { const f = path.join(dossier, nom); fs.writeFileSync(f, typeof x === 'string' ? x : JSON.stringify(x)); return f; };
    const regles = W.reglesCompletes({ compagnies: { ECO: 'NORD' } });
    const s = unite(regles), vols = VOLS_ECO();
    const jour = await simulerJournee(ecrire('s.json', s), ecrire('vols.csv', avecEco(F.volsCsv())), null);
    // La page : les vols préparés avec les règles gardées, puis le moteur (l'état effectif comme les outils).
    const page = C.preparerVols(vols, etatDe(s), regles);
    memes(jour.resultat, J.jouer(J.argumentsDeLaJournee(C.preparerSauvegarde(s, vols).sauvegarde, page)), 'la page et l’outil : le même calcul');
    assert.equal(pax(jour.resultat, 'NORD/YC'), pax(journee(unite(), VOLS()), 'NORD/YC') + 90);
    // Une période : chaque jour, ECO rattachée à NORD.
    const dates = F.volsDatesCsv(2, '2031-03-03').replace(/\n?$/, '\n') + '2031-03-03,EC101,ECO,PETIT,DEP,09:40,,0,0,90,3,0\n';
    const p = await simulerPeriode(ecrire('s2.json', s), ecrire('dates.csv', dates), null);
    assert.ok(!p.journees.some(j => Object.keys(j.resultat.parClasse).some(id => id.startsWith('ECO/'))), 'aucune commande ECO dans la période');
    // Des règles fausses dans la sauvegarde : refusées, en disant laquelle.
    const faux = F.sauvegardeFictive(); faux.contenu[W.CLE_STOCKAGE] = { schema: 'ory-import-winrest', version: 1, regles: { inconnue: 1 } };
    assert.throws(() => C.preparerSauvegarde(faux, vols), /règle inconnue « inconnue »/);
    // Une sauvegarde d'avant (sans liste) aux règles fausses : rien n'est lu, comme avant.
    const avant = F.sauvegardeFictive({ liste: false }); avant.contenu[W.CLE_STOCKAGE] = faux.contenu[W.CLE_STOCKAGE];
    assert.equal(C.preparerSauvegarde(avant, vols).sauvegarde, avant);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
