/* Le récap des man-minutes : tout le barème d'un coup d'œil, et un fichier de
 * paramétrage pour les grosses modifications (retour d'usage du 28/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tableur.js');
const E = require('../echanges.js');
const P = require('../moteur/production.js');

const SERVICES = [{ id: 'cuisine', nom: 'CUISINE' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' }];
const CLASSES = [
  { id: 'AF/BC', cie: 'AF', cabine: 'BC', vols: [{}, {}] },
  { id: 'TX/BC', cie: 'TX', cabine: 'BC', vols: [{}] },
  { id: 'AF/YC', cie: 'AF', cabine: 'YC', vols: [{}, {}, {}] }
];
const route = s => ({ services: new Set(s) });
const ROUTES = new Map([['AF/BC', route(['cuisine', 'prepa'])], ['TX/BC', route(['cuisine', 'prepa'])], ['AF/YC', route(['prepa'])]]);
const BAREME = { cuisine: { '*/BC': 30, 'TX/BC': 45 }, prepa: { '*/BC': 20, '*/YC': 10 } };
const ctx = () => ({ bareme: JSON.parse(JSON.stringify(BAREME)), services: SERVICES, classes: CLASSES, routes: ROUTES,
  sansBareme: new Set(['plonge']),
  ateliers: [{ id: 'm', nom: 'Montage AF YC', service: 'prepa', type: 'manuel', lots: [['AF/YC']], minutes: { 'AF/YC': 12 } }] });
const parFichier = async f => T.lireClasseur(T.ecrireClasseur(f));

test('une ligne par commande, une colonne par service, d’où vient chaque valeur', () => {
  const r = E.recapManMinutes(ctx());
  assert.deepEqual(r.colonnes.map(c => c.id), ['cuisine', 'prepa'], 'la plonge ne lit pas le barème');
  const [afbc, txbc, afyc] = r.lignes;
  assert.deepEqual([afbc.cellules.cuisine.source, afbc.cellules.cuisine.parVol, afbc.cellules.cuisine.jour], ['commun', 30, 60]);
  assert.deepEqual([txbc.cellules.cuisine.source, txbc.cellules.cuisine.parVol], ['propre', 45]);
  assert.equal(afyc.cellules.cuisine.source, 'hors', 'AF YC ne passe pas par la cuisine');
  assert.deepEqual([afyc.cellules.prepa.source, afyc.cellules.prepa.parVol, afyc.cellules.prepa.atelier, afyc.cellules.prepa.bareme], ['case', 12, 'Montage AF YC', 10]);
  assert.equal(afbc.parVol, 50); assert.equal(afbc.jour, 100);
  assert.equal(r.totaux.jour.cuisine, 60 + 45);
  assert.equal(r.totaux.jourTotal, 60 + 45 + 40 + 20 + 36);
});

test('le fichier de paramétrage fait l’aller-retour sans rien changer', async () => {
  const c = ctx();
  const f = await parFichier(E.recapVersClasseur(c));
  const r = E.classeurVersRecap(f, c.bareme, c);
  assert.equal(r.changes, 0);
  assert.deepEqual(r.bareme, BAREME, 'une valeur égale à la commune la suit : pas de valeur propre inventée');
});

test('grosses modifications dans Excel : commune, propre, retour à la commune', async () => {
  const c = ctx();
  const f = E.recapVersClasseur(c);
  const g = f.find(x => x.nom === 'Man-minutes par vol').lignes, h = f.find(x => x.nom === 'Toutes compagnies').lignes;
  const col = nom => g[0].indexOf(nom);
  // TX BC en cuisine : vidée → revient à la commune. AF BC au montage : 25, propre.
  g.find(l => l[0] === 'TX' && l[1] === 'BC')[col('CUISINE')] = null;
  g.find(l => l[0] === 'AF' && l[1] === 'BC')[col('MONTAGE')] = 25;
  // La commune BC du montage passe à 22 ; TX BC y reste à 20 : elle devient propre.
  h.find(l => l[0] === 'BC')[h[0].indexOf('MONTAGE')] = 22;
  const r = E.classeurVersRecap(await parFichier(f), c.bareme, c);
  assert.deepEqual(r.bareme.cuisine, { '*/BC': 30 });
  assert.deepEqual(r.bareme.prepa, { '*/BC': 22, '*/YC': 10, 'AF/BC': 25, 'TX/BC': 20 });
  assert.equal(r.changes, 4);
});

test('les erreurs sont toutes dites, et rien n’est importé', async () => {
  const c = ctx();
  const f = E.recapVersClasseur(c);
  const g = f.find(x => x.nom === 'Man-minutes par vol').lignes;
  g[0].push('LA LUNE'); g[1][3] = 'beaucoup'; g.push(['ZZ', 'XX', null, 1]);
  assert.throws(() => E.classeurVersRecap(f, c.bareme, c), e => /service inconnu en colonne : « LA LUNE »/.test(e.message)
    && /pas « beaucoup »/.test(e.message) && /classe inconnue « XX »/.test(e.message) && /Rien n’a été importé/.test(e.message));
  assert.throws(() => E.classeurVersRecap([{ nom: 'Autre', lignes: [['x']] }], c.bareme, c), /Feuille « Man-minutes par vol » introuvable/);
});
