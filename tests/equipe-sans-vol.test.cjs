/* Banc d'essai, correction 10 — une équipe sans aucun vol ce jour-là n'a
 * personne, même si ses commandes ont des minutes au barème (v1). La personne
 * « en temps nul » ne vient que si une commande de l'équipe vole ce jour-là
 * sans minutes au barème (un barème à renseigner). Une équipe à effectif fixe
 * garde son effectif saisi (docs/BANC_ESSAI.md § 1). Vols, compagnies et
 * équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const REF = require('./non-regression.attendu.json');

const h = s => P.minutes(s);
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, crew: 4 });
// La prépa, puis le montage : une équipe en aval, à effectif fixe, attend ce que la prépa lui livre.
const CHEMIN = { id: 'c', nom: 'Prépa puis montage', noeuds: ['prepa', 'mont'], liens: [{ de: 'prepa', vers: 'mont' }] };
const AVAL = { id: 'av', nom: 'Montage', service: 'mont', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [['SUD/YC']],
  regime: { actif: false }, effectif: 'fixe' };
// Une équipe de la prépa, à effectif calculé, sur un poste de 420 minutes sans pause.
const equipe = p => ({ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 3, pauses: [],
  lots: [['SUD/YC']], regime: { actif: true, seuils: [], presence: 420 }, effectif: 'calcule', ...p });
/** La journée de l'équipe : `vols` du jour, `bareme` de la prépa ; `ajoutee` : SUD/YC est une commande ajoutée à la main. */
function jouer({ vols, bareme, ajoutee = false, plus = {}, aval = false, extra = {} }) {
  const classes = P.classesDeVols(vols).concat(ajoutee ? [{ id: 'SUD/YC', cie: 'SUD', cabine: 'YC', pax: 0, vols: [], echeance: 1440, origine: 'ajoutee' }] : []);
  return P.simuler({ vols, classes, liaisons: [], bareme: { prepa: bareme, mont: { '*/YC': 10 } }, rendement: 1, parcours: [CHEMIN], parcoursCabine: { YC: 'c', CREW: 'c' },
    ateliers: [equipe(plus)].concat(aval ? [AVAL] : []), effectifCalcule: ['prepa'], ...extra });
}
const codes = r => r.anomalies.map(a => a.code);
const NORD = [dep('NO1', 'NORD', '12:00')];                       // SUD ne vole pas ce jour-là
const SUD = [dep('SU1', 'SUD', '12:00'), dep('SU2', 'SUD', '14:00')];

test('315 min par vol au barème, 0 vol ce jour-là (une commande ajoutée à la main) : 0 personne, et la journée reste juste', () => {
  const r = jouer({ vols: NORD, bareme: { 'SUD/YC': 315 }, ajoutee: true, aval: true });
  assert.equal(r.ok, true);
  assert.equal(r.parClasse['SUD/YC'] !== undefined, true, 'la commande ajoutée reste dans la journée');
  assert.deepEqual([r.effectifs.mo.personnes, r.effectifs.mo.hommeMinutes], [0, 0]);
  assert.equal(r.ateliers.find(a => a.id === 'mo').personnes, 0);
  // Sans travail, sa commande se fait en temps nul : rien d'impossible, l'équipe en aval est servie.
  const lot = r.lots.find(l => l.atelier === 'mo');
  assert.deepEqual([lot.nom, lot.hommeMinutes, !!lot.impossible, lot.debut, lot.fin], ['SUD/YC', 0, false, h('06:00'), h('06:00')]);
  assert.ok(r.lots.some(l => l.atelier === 'av' && l.fin != null), 'le montage fait sa commande');
  assert.equal(r.indicateurs.pasFinies, 0);
  assert.ok(!codes(r).includes('inacheve') && !codes(r).includes('sans-personne'), codes(r).join(', '));
});

test('l’armement d’une compagnie qui ne vole pas ce jour-là : 0 personne, sa commande en temps nul', () => {
  const r = jouer({ vols: NORD, bareme: {}, plus: { lots: [['SUD/@TB']] },
    extra: { categories: { prepa: [{ id: 'TB', nom: 'Trolleys bar', minutes: { '*': 10 } }] } } });
  assert.equal(r.ok, true);
  assert.equal(r.effectifs.mo.personnes, 0);
  const lot = r.lots.find(l => l.atelier === 'mo');
  assert.deepEqual([lot.nom, lot.hommeMinutes, !!lot.impossible], ['SUD/@TB', 0, false]);
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('la même commande sans minutes au barème, avec 2 vols : 1 personne, en temps nul (comme avant)', () => {
  const r = jouer({ vols: SUD, bareme: {} });
  assert.equal(r.ok, true);
  assert.deepEqual([r.effectifs.mo.personnes, r.effectifs.mo.hommeMinutes], [1, 0]);
});

test('la même commande avec ses minutes et 2 vols : la formule habituelle', () => {
  const r = jouer({ vols: SUD, bareme: { 'SUD/YC': 315 } });
  const e = r.effectifs.mo;
  assert.deepEqual([e.hommeMinutes, e.poste], [630, 420]);
  assert.equal(e.personnes, Math.ceil(630 / 420));
});

test('une équipe à effectif fixe garde son effectif saisi, avec ou sans vol', () => {
  for (const cas of [{ vols: NORD, bareme: { 'SUD/YC': 315 }, ajoutee: true }, { vols: SUD, bareme: { 'SUD/YC': 315 } }]) {
    const r = jouer({ ...cas, plus: { effectif: 'fixe' } });
    assert.equal(r.effectifs.mo, undefined);
    assert.equal(r.ateliers.find(a => a.id === 'mo').personnes, 3);
  }
});

test('non-régression : les journées enregistrées, où chaque équipe calculée a des vols, ne changent pas', () => {
  for (const s of REF.scenarios) {
    const r = J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options));
    for (const [id, e] of Object.entries(s.resultat.effectifs || {})) assert.ok(e.hommeMinutes > 0 || e.personnes === 0, s.nom + ' : ' + id + ' a des vols');
    assert.deepEqual(JSON.parse(JSON.stringify(r.effectifs)), s.resultat.effectifs, s.nom);
  }
});
