/* La journée rejouée. Le modèle par ateliers calcule la journée d'un coup :
 * la vue Simulation ne la calcule plus, elle la relit. Ce fichier tient la
 * seule question que pose la relecture — où en est-on à l'instant t ? */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../replay.js');
const P = require('../moteur/production.js');

/* Une journée minuscule mais complète : la cuisine livre, le montage suit. */
const VOLS = [
  { id: 'C1', cie: 'CRL', sens: 'DEP', std: 12 * 60, bc: 100, pc: 0, yc: 0 },
  { id: 'A1', cie: 'AF', sens: 'DEP', std: 13 * 60, bc: 0, pc: 0, yc: 200 }
];
const journee = () => P.simuler({
  vols: VOLS,
  liaisons: [{ from: 'cuisine', to: 'prepa' }],
  ateliers: [
    { id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '06:00',
      jour: 0, personnes: 10, lots: [['CRL/BC']] },
    { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00',
      jour: 0, personnes: 10, lots: [['CRL/BC']] }
  ]
});

test('les bornes couvrent l’attente, pas seulement le travail', () => {
  const r = journee();
  const b = R.bornes(r);
  // Le montage ouvre à 05:00 et patiente : la journée doit commencer là,
  // sinon on le voit apparaître d'un coup au moment où il se met au travail.
  assert.equal(b.debut, 5 * 60, 'la journée commence quand le premier poste ouvre');
  assert.equal(b.fin, Math.max(...r.lots.map(l => l.fin)));
  assert.equal(b.vide, false);
});

test('une journée vide ne casse pas la relecture', () => {
  const b = R.bornes({ lots: [] });
  assert.equal(b.vide, true);
  assert.deepEqual(R.chiffresA({ lots: [], parClasse: {} }, 0).auTravail, 0);
  assert.equal(R.prochainChangement({ lots: [] }, 0), null);
  assert.deepEqual(R.servicesA(null, 0), {});
});

test('un service traverse ses quatre états dans l’ordre', () => {
  const r = journee();
  const cu = r.lots.find(l => l.service === 'cuisine');
  const etat = t => (R.servicesA(r, t).cuisine || {}).etat || 'avenir';
  assert.equal(etat(cu.debut - 1), 'avenir', 'avant son heure, rien');
  assert.equal(etat(cu.debut), 'travail', 'à son heure, au travail');
  assert.equal(etat(cu.fin - 0.5), 'travail');
  assert.equal(etat(cu.fin), 'fini', 'après, fini');
});

test('un atelier qui attend ses amonts se voit attendre', () => {
  const r = journee();
  const mo = r.lots.find(l => l.service === 'prepa');
  assert.ok(mo.attente > 0, 'le montage attend bien la cuisine');
  const pendant = mo.debut - mo.attente + 1;
  assert.equal(R.servicesA(r, pendant).prepa.etat, 'attente');
  assert.equal(R.servicesA(r, mo.debut).prepa.etat, 'travail');
});

test('le travail l’emporte sur l’attente quand les deux se chevauchent', () => {
  // Deux lots dans le même service : l'un tourne, le suivant patiente déjà.
  const faux = { lots: [
    { service: 's', nom: 'A', debut: 0, fin: 100, attente: 0, classes: ['A'] },
    { service: 's', nom: 'B', debut: 120, fin: 200, attente: 60, classes: ['B'] }
  ], parClasse: {} };
  assert.equal(R.servicesA(faux, 80).s.etat, 'travail', 'ce qui tourne prime');
  assert.equal(R.servicesA(faux, 110).s.etat, 'attente');
  assert.equal(R.servicesA(faux, 250).s.etat, 'fini');
});

test('« en retard » compte ce qui aurait dû être parti, pas ce qui l’est déjà', () => {
  const faux = { lots: [], parClasse: {
    tot:   { fin: 100, echeance: 200, absente: false },   // sortie, à l'heure
    tard:  { fin: 300, echeance: 200, absente: false },   // sortie, en retard
    jamais:{ fin: null, echeance: 150, absente: false },  // jamais sortie
    hors:  { fin: null, echeance: 10,  absente: true }    // personne ne la fabrique
  } };
  const a = R.chiffresA(faux, 120);
  assert.equal(a.suivies, 3, 'une classe que personne ne fabrique ne compte pas');
  assert.equal(a.sorties, 1);
  assert.equal(a.enRetard, 0, 'à 120, aucune échéance n’est encore passée');
  const b = R.chiffresA(faux, 250);
  assert.equal(b.sorties, 1, '« tard » n’est pas encore sortie à 250');
  assert.equal(b.enRetard, 2, '« tard » et « jamais » auraient dû être parties');
  const c = R.chiffresA(faux, 400);
  assert.equal(c.sorties, 2);
  assert.equal(c.sortiesEnRetard, 1);
  assert.equal(c.enRetard, 1, 'il ne reste que celle qui ne sort jamais');
  assert.equal(c.part, 67);
});

test('la ponctualité ne juge que les échéances déjà passées', () => {
  const faux = { lots: [], parClasse: {
    tot:  { fin: 100, echeance: 200, absente: false },
    tard: { fin: 300, echeance: 250, absente: false },
    loin: { fin: 500, echeance: 600, absente: false }
  } };
  const aube = R.chiffresA(faux, 50);
  assert.equal(aube.exigibles, 0, 'à l’aube, aucune échéance n’est passée : rien à juger');
  const midi = R.chiffresA(faux, 260);
  assert.equal(midi.exigibles, 2);
  assert.equal(midi.tenues, 1, '« tard » a manqué la sienne, même sortie ensuite');
  const soir = R.chiffresA(faux, 700);
  assert.equal(soir.exigibles, 3);
  assert.equal(soir.tenues, 2);
});

test('une mise à disposition est « fini » dès son ouverture, jamais « travail »', () => {
  const faux = { lots: [
    { service: 'mag', nom: 'mise à disposition', debut: 60, fin: 60, duree: 0,
      attente: 0, dispo: true, classes: ['X'] }
  ], parClasse: {} };
  assert.equal(R.servicesA(faux, 30).mag.etat, 'avenir', 'avant son heure, elle n’a pas ouvert');
  assert.equal(R.servicesA(faux, 60).mag.etat, 'fini');
  assert.equal(R.chiffresA(faux, 60).auTravail, 0, 'elle n’occupe personne');
});

test('le pas suivant saute au prochain changement, pas à la minute d’après', () => {
  const faux = { lots: [
    { service: 's', debut: 100, fin: 200, attente: 40, classes: [] }
  ], parClasse: {} };
  assert.equal(R.prochainChangement(faux, 0), 60, 'l’ouverture du poste');
  assert.equal(R.prochainChangement(faux, 60), 100, 'la mise au travail');
  assert.equal(R.prochainChangement(faux, 100), 200, 'la fin');
  assert.equal(R.prochainChangement(faux, 200), null, 'et plus rien ensuite');
});

test('un lot que le poste n’a pas fini reste « travail » jusqu’au bout', () => {
  // `fin` vaut null : la classe ne sort pas. Elle ne doit pas paraître finie.
  const faux = { lots: [
    { service: 's', nom: 'X', debut: 100, fin: null, attente: 0, impossible: true, classes: ['X'] }
  ], parClasse: {} };
  assert.equal(R.servicesA(faux, 99).s.etat, 'avenir');
  assert.equal(R.servicesA(faux, 100).s.etat, 'travail');
  assert.equal(R.servicesA(faux, 99999).s.etat, 'travail', 'jamais « fini »');
});

test('instant() rassemble tout en un seul appel', () => {
  const r = journee();
  const i = R.instant(r, 7 * 60);
  assert.equal(i.t, 7 * 60);
  assert.ok(i.services && i.chiffres);
  assert.deepEqual(Object.keys(i.chiffres).sort(),
    ['auTravail', 'enAttente', 'enRetard', 'exigibles', 'part', 'sorties', 'sortiesEnRetard', 'suivies', 'tenues']);
});

test('les quatre états sont nommés, et quatre seulement', () => {
  assert.deepEqual(R.ETATS, ['travail', 'attente', 'fini', 'avenir']);
});
