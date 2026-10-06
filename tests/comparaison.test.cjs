/* Comparer deux scénarios du modèle par ateliers. La journée est déjà
 * calculée : capturer ne relance rien, cela fige réglages et résultats. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../comparaison.js');
const P = require('../moteur/production.js');
const { VOLS } = require('../vols-demo.js');

const atelier = personnes => ({ id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel',
  debut: '04:00', jour: 0, personnes, lots: [['AF/BC'], ['AF/YC']] });
const scenario = (personnes, source) => {
  const ateliers = [atelier(personnes)];
  const reglages = { rendement: 1, delaiChargement: 45 };
  const r = P.simuler({ vols: VOLS, ateliers, liaisons: [], ...reglages });
  return C.capturer(r, { source: source || 'démo', ateliers, reglages, liaisons: [] });
};

test('une capture fige les réglages et ce qu’ils ont donné', () => {
  const a = scenario(4);
  assert.equal(a.ateliers, 1);
  assert.equal(a.personnes, 4);
  assert.equal(a.rendement, 100);
  assert.equal(a.delai, 45);
  assert.ok(a.suivies > 0, 'des classes sont suivies');
  assert.ok(a.absentes > 0, 'le programme porte des classes que personne ne fabrique');
});

test('mêmes réglages, mêmes chiffres : la note le dit', () => {
  const a = scenario(4), b = scenario(4);
  assert.deepEqual(a, b, 'aucun aléa');
  assert.match(C.note(a, b), /identiques/);
  assert.ok(C.lignes(a, b).every(l => !l.diff));
});

test('plus de monde en cuisine : B fait mieux, et le tableau le dit en mots', () => {
  const a = scenario(1), b = scenario(12);
  assert.match(C.note(a, b), /seul ce que vous avez changé/);
  const par = Object.fromEntries(C.lignes(a, b).map(l => [l.lib, l]));
  assert.equal(par['Personnes au travail'].diff, true);
  assert.equal(par['Personnes au travail'].verdict, '', 'un réglage n’est ni mieux ni moins bien');
  assert.equal(par['Dernière commande prête'].verdict, 'mieux', 'on finit plus tôt');
  assert.equal(par['Commandes sans équipe'].diff, false);
});

test('deux programmes de vols différents sont signalés', () => {
  assert.match(C.note(scenario(4, 'a.csv'), scenario(4, 'b.csv')), /pas sur les mêmes vols/);
});

test('une seule capture ne se compare à rien', () => {
  const l = C.lignes(scenario(4), null);
  assert.ok(l.every(x => x.b === '—' && !x.diff && !x.verdict));
  assert.match(C.note(scenario(4), null), /retenez l’essai B/);
  assert.match(C.note(null, null), /essai A/);
});

test('le jeu de démonstration a le format de l’import', () => {
  assert.ok(VOLS.length >= 12);
  for (const v of VOLS) {
    assert.ok(v.id && v.cie && ['DEP', 'RET'].includes(v.sens));
    assert.ok(Number.isFinite(v.sens === 'DEP' ? v.std : v.sta));
  }
  assert.ok(VOLS.some(v => v.crew > 0 && v.spml > 0), 'équipage et repas spéciaux présents');
  assert.ok(Object.isFrozen(VOLS) && Object.isFrozen(VOLS[0]), 'on ne modifie pas la démo par mégarde');
});

test('deux essais qui ne diffèrent que par un chemin ne sont pas « identiques »', () => {
  const ateliers = [atelier(4)], reglages = { rendement: 1, delaiChargement: 45 };
  const r = P.simuler({ vols: VOLS, ateliers, liaisons: [], ...reglages });
  const etat = chemin => ({ parcours: [{ id: 'c', nom: 'C', noeuds: chemin, liens: [] }], parcoursCabine: {}, parcoursClasse: { 'AF/BC': 'c' } });
  const a = C.capturer(r, { ateliers, reglages, liaisons: [], etat: etat(['cuisine']), vols: VOLS });
  const b = C.capturer(r, { ateliers, reglages, liaisons: [], etat: etat(['cuisine', 'prepa']), vols: VOLS });
  assert.doesNotMatch(C.note(a, b), /identiques/, 'le chemin a changé');
  const c = C.capturer(r, { ateliers, reglages, liaisons: [], etat: etat(['cuisine']), vols: VOLS.slice(1) });
  assert.doesNotMatch(C.note(a, c), /identiques/, 'le programme de vols a changé');
});

/* J+1 contre planche retour (retour d'usage du 29/09) : la source des retours
 * est un réglage du tableau, et la plonge dit ce qu'elle en a fait. */
test('retours J+1 contre planche retour : la source et la plonge se comparent', () => {
  const plonge = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '00:00', jour: -1, personnes: 1, lots: [],
    regime: { actif: false }, parVol: true, durees: { '*': 40 }, tunnels: [{ nom: 'T1', personnes: 1, actif: true }] };
  const planche = VOLS.filter(v => v.sens === 'DEP').slice(0, 3).map(v => ({ vol: v.id, cie: v.cie, heure: '23:00', jour: 0 }));
  const essai = retours => {
    const materiel = { actif: true, delaiRetour: 30, retours, planche };
    const r = P.simuler({ vols: VOLS, ateliers: [plonge], liaisons: [], rendement: 1, materiel });
    return C.capturer(r, { source: 'démo', ateliers: [plonge], reglages: {}, liaisons: [], etat: { materiel } });
  };
  const a = essai('j1'), b = essai('planche');
  const par = Object.fromEntries(C.lignes(a, b).map(l => [l.lib, l]));
  assert.deepEqual([par['Retours à la plonge'].a, par['Retours à la plonge'].b], ['J+1 (lendemain du départ)', 'Planche retour']);
  assert.equal(par['Retours à la plonge'].verdict, '', 'un réglage, pas un résultat');
  assert.ok(a.revenu > b.revenu, 'tous les départs reviennent en J+1, trois vols sur la planche');
  assert.notEqual(par['Matériel revenu des vols'].a, '—');
  assert.ok(Number.isFinite(a.attentePlonge) && Number.isFinite(b.attentePlonge));
  assert.match(C.note(a, b), /seul ce que vous avez changé/);
  assert.equal(C.capturer(null, { etat: { materiel: { retours: 'j2' } } }).retours, 'J+1 (lendemain du départ)', 'l’ancien J+2 se lit J+1');
});

test('les personnes d’une mise à disposition comptent dans l’effectif du jour (06/10)', () => {
  const ateliers = [atelier(4), { id: 'ap', nom: 'Appros', service: 'appros', type: 'dispo', debut: '00:00', jour: 0, personnes: 2, lots: [] }];
  const reglages = { rendement: 1, delaiChargement: 45 };
  const r = P.simuler({ vols: VOLS, ateliers, liaisons: [], ...reglages });
  assert.equal(C.capturer(r, { source: 'démo', ateliers, reglages, liaisons: [] }).personnes, 6, '4 en cuisine + 2 aux appros');
});
