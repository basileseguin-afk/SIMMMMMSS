/* « Services et équipes » (version 1, évolution 22 b) — ce que disent la liste des services et le tableau « Ses équipes »,
 * sans navigateur : ce qu'on a réglé, jamais un résultat. Équipes et compagnies fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../services-page.js');

const equipe = x => ({ id: 'e1', nom: 'Montage matin', service: 'montage', type: 'manuel', debut: '05:00', jour: 0, personnes: 4, lots: [], pauses: [], ...x });

test('une équipe qui prépare : son nom, son début, son jour, ses personnes, ce qu’elle prépare', () => {
  const e = S.resumeEquipe(equipe({ lots: [['NO/BC'], ['NO/YC', 'SU/YC']] }), { etiquette: c => c.replace('/', ' ') });
  assert.deepEqual(e, { nom: 'Montage matin', debut: '05:00', jour: 'J', personnes: '4 pers.', prepare: 'NO BC, NO YC, SU YC' });
  // La veille, l'avant-veille : dits par leur jour.
  assert.equal(S.resumeEquipe(equipe({ jour: -1 })).jour, 'J-1');
  assert.equal(S.resumeEquipe(equipe({ jour: -2 })).jour, 'J-2');
  // Rien de coché encore : le tableau le dit.
  assert.equal(S.resumeEquipe(equipe()).prepare, 'rien pour l’instant');
  // Au-delà de trois commandes : les trois premières, et leur nombre ; une commande cochée deux fois ne compte qu'une fois.
  const beaucoup = S.resumeEquipe(equipe({ lots: [['A/BC', 'A/YC'], ['B/BC'], ['B/YC', 'A/BC'], ['C/YC']] }));
  assert.equal(beaucoup.prepare, 'A/BC, A/YC, B/BC… (5)');
});

test('un effectif qui se calcule : le tableau dit « calculé », jamais un nombre — ce serait un résultat', () => {
  assert.equal(S.resumeEquipe(equipe({ personnes: 7 }), { calcule: true }).personnes, 'calculé');
  assert.equal(S.resumeEquipe(equipe({ personnes: 7 }), { calcule: false }).personnes, '7 pers.');
  assert.equal(S.resumeEquipe(equipe({ type: 'robot', debit: 400, personnes: 2 }), { calcule: true }).personnes, 'calculé');
  assert.equal(S.resumeEquipe(equipe({ type: 'appui', personnes: 3 }), { calcule: true }).personnes, 'calculé');
  // Une équipe sans nombre de personnes : zéro, pas « undefined ».
  assert.equal(S.resumeEquipe(equipe({ personnes: undefined })).personnes, '0 pers.');
});

test('une plonge, un handling, une équipe hors tunnel, un atelier par compagnie : ce qu’ils font, en clair', () => {
  const plonge = S.resumeEquipe(equipe({ type: 'lavage', parVol: true, debut: '13:00', personnes: 2 }));
  assert.deepEqual([plonge.jour, plonge.personnes, plonge.prepare], ['J de l’arrivée', '2 pers.', 'lave les retours, vol par vol']);
  assert.equal(S.resumeEquipe(equipe({ type: 'lavage', parVol: false })).prepare, 'lave les retours, au débit');
  const handling = S.resumeEquipe(equipe({ type: 'handling', personnes: 6, jour: -1 }));
  assert.deepEqual([handling.jour, handling.personnes, handling.prepare], ['J', '6 pers.', 'charge les vols, dans l’ordre des départs']);
  assert.equal(S.resumeEquipe(equipe({ type: 'handling', creneaux: [{ de: '00:00', a: '24:00' }] })).personnes, 'par camion');
  assert.equal(S.resumeEquipe(equipe({ type: 'appui' })).prepare, 'hors tunnel : présente à ses heures');
  assert.equal(S.resumeEquipe(equipe({ parCompagnie: true, compagnies: ['NO', 'SU'] })).prepare, 'NO, SU');
  assert.equal(S.resumeEquipe(equipe({ parCompagnie: true, compagnies: [] })).prepare, 'aucune compagnie pour l’instant');
});

test('une mise à disposition : toujours ouverte, à ses heures, ou par vagues', () => {
  const toujours = equipe({ type: 'dispo', personnes: 0 }), boutique = equipe({ type: 'dispo', personnes: 2, ouverture: { de: '02:30', a: '14:00' } });
  const vagues = equipe({ type: 'dispo', permanent: false, vagues: [{ debut: '04:00' }, { debut: '11:00' }] });
  assert.equal(S.ouvertureLue(toujours), 'toujours ouvert');
  assert.equal(S.ouvertureLue(boutique), 'de 02:30 à 14:00');
  assert.equal(S.ouvertureLue(vagues), '2 vagues');
  assert.deepEqual(S.resumeEquipe(toujours), { nom: 'Montage matin', debut: 'toujours ouvert', jour: 'chaque jour', personnes: '—', prepare: 'sert toutes les commandes' });
  assert.equal(S.resumeEquipe(boutique).personnes, '2 pers. sur la journée');
});

test('la liste des services : le nombre d’équipes, ou « toujours ouvert »', () => {
  assert.equal(S.sousTitre('manuel', []), 'aucune équipe');
  assert.equal(S.sousTitre('manuel', [equipe()]), '1 équipe');
  assert.equal(S.sousTitre('lavage', [equipe(), equipe(), equipe()]), '3 équipes');
  assert.equal(S.sousTitre('dispo', [equipe({ type: 'dispo' })]), 'toujours ouvert');
  assert.equal(S.sousTitre('dispo', [equipe({ type: 'dispo', ouverture: { de: '05:00', a: '13:00' } })]), 'de 05:00 à 13:00');
  assert.equal(S.sousTitre('dispo', []), 'aucune équipe');
  assert.equal(S.sousTitre('dispo', undefined), 'aucune équipe');
});

test('la section des temps porte le nom de ce qui joue pour le service', () => {
  assert.deepEqual(S.TITRES_TEMPS, { manuel: 'Ses temps par vol', categories: 'Ses minutes par compagnie', robot: 'Ses temps par vol et ses débits',
    lavage: 'Ses durées de lavage', handling: 'Son temps par vol' });
});
