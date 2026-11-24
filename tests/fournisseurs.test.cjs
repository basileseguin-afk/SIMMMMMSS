/* Évolution 24 (a) — les clients d'un fournisseur : une liste pour toute l'unité (version 1).
 *
 * Un fournisseur est un service de mise à disposition où rien n'arrive : aucun lien n'y entre, dans aucun chemin. Ses
 * clients se cochent une fois pour toute l'unité (« Chemins › Fournisseurs ») : le lien « fournisseur → client » est
 * écrit dans chaque chemin où le client est une étape, et dans aucun autre. Le moteur lit toujours les liens des
 * chemins : aucun calcul n'est réécrit. Ce fichier relit `fournisseurs.js` (pur) :
 *   - qui est un fournisseur, et l'état d'un client : partout, nulle part, en partie (n chemins sur m) ;
 *   - cocher, décocher, « Partout » puis « Nulle part » : les liens attendus ;
 *   - la liste vaut pour la suite : étape ajoutée, chemin créé ou dupliqué ; un service coché hors de tout chemin ;
 *   - une sauvegarde d'avant : rien n'y bouge, le résultat est le même champ par champ ; une sauvegarde d'après,
 *     relue par le code d'avant (la version 2, gelée), donne le même résultat ;
 *   - avec un fournisseur à horaires, un client ajouté attend son ouverture (journée fictive, calculée à la main).
 * Services, équipes, vols et compagnies fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const PC = require('../parcours.js');
const A = require('../ateliers.js');
const F = require('../fournisseurs.js');
// Le code d'avant : la version 2, gelée. Son module des équipes lit le moteur et les chemins dans l'espace global.
globalThis.MoteurProduction = require('../v2/moteur/production.js');
globalThis.OrlyParcours = require('../v2/parcours.js');
const V2 = require('../v2/ateliers.js');

const copie = x => JSON.parse(JSON.stringify(x));
const NOMS = { magasin: 'Magasin', appros: 'Réception', decontam: 'Décontamination', cuisine: 'Cuisine', preparation: 'Préparation froide',
  prepa: 'Montage', dotation: 'Dotation' };
const SERVICES = Object.entries(NOMS).map(([id, nom]) => ({ id, nom }));
const O = { services: SERVICES.map(s => s.id), nom: id => NOMS[id] || id };

const dispo = (id, nom, service, x = {}) => ({ id, nom, service, type: 'dispo', debut: '00:00', jour: 0, personnes: 0, pauses: [], lots: [], permanent: true, regime: { actif: false }, ...x });
const equipe = (id, nom, service, lots, x = {}) => ({ id, nom, service, type: 'manuel', debut: '06:00', jour: 0, personnes: 1, pauses: [], lots, regime: { actif: false }, ...x });
const lien = (de, vers) => ({ de, vers });

/** Une unité fictive : deux fournisseurs (le magasin, la réception), une décontamination qui reçoit de la réception. */
function unite() {
  return {
    schema: 'ory-ateliers', version: 1, exclues: [], ajoutees: [],
    ateliers: [dispo('mg', 'Magasin', 'magasin'), dispo('re', 'Réception', 'appros'), dispo('de', 'Décontamination', 'decontam'),
      equipe('cu', 'Cuisine', 'cuisine', [['NORD/BC']]), equipe('pf', 'Préparation froide', 'preparation', [['NORD/YC']]),
      equipe('mo', 'Montage', 'prepa', [['NORD/BC'], ['NORD/YC']])],
    parcours: [
      { id: 'c1', nom: 'Chaud', type: true, noeuds: ['appros', 'decontam', 'cuisine', 'prepa', 'magasin'],
        liens: [lien('appros', 'decontam'), lien('decontam', 'cuisine'), lien('cuisine', 'prepa'), lien('magasin', 'prepa')] },
      { id: 'c2', nom: 'Froid', type: true, noeuds: ['preparation', 'prepa', 'magasin'], liens: [lien('preparation', 'prepa'), lien('magasin', 'prepa')] },
      { id: 'c3', nom: 'Mixte', type: true, noeuds: ['appros', 'cuisine', 'preparation', 'prepa'],
        liens: [lien('appros', 'cuisine'), lien('cuisine', 'preparation'), lien('preparation', 'prepa')] }
    ],
    parcoursCabine: { BC: 'c1', YC: 'c2' }, parcoursClasse: {}
  };
}
/** Un geste sur l'unité, comme la page le fait (`changer`, ateliers.js) : le geste, puis le suivi des fournisseurs. */
const geste = (e, fn) => { const avant = copie(e); fn(); F.suivre(avant, e, O); };
const chemin = (e, id) => e.parcours.find(p => p.id === id);
const aLien = (e, id, de, vers) => chemin(e, id).liens.some(l => l.de === de && l.vers === vers);
const liensDe = (e, f) => e.parcours.flatMap(p => p.liens.filter(l => l.de === f).map(l => p.id + ':' + l.vers)).sort();

test('un fournisseur : une mise à disposition où rien n’arrive, dans aucun chemin', () => {
  const e = unite();
  assert.equal(F.estFournisseur(e, 'magasin', O), true);
  assert.equal(F.estFournisseur(e, 'appros', O), true);
  // La décontamination reçoit de la réception : une étape comme les autres.
  assert.equal(F.estFournisseur(e, 'decontam', O), false, 'une mise à disposition qui a un amont n’est pas un fournisseur');
  assert.equal(F.estFournisseur(e, 'cuisine', O), false, 'un service qui prépare n’en est pas un');
  assert.equal(F.estFournisseur(e, 'preparation', O), false, 'même sans amont : il prépare');
  assert.deepEqual(F.fournisseurs(e, O), ['magasin', 'appros'], 'dans l’ordre des services');
  // Un lien qui entre, dans un seul chemin, suffit : le magasin devient une étape.
  chemin(e, 'c3').liens.push(lien('appros', 'magasin'));
  assert.equal(F.estFournisseur(e, 'magasin', O), false);
  // Un service de mise à disposition encore sans équipe (deviné à son identifiant) en est un.
  const sans = unite(); sans.ateliers = sans.ateliers.filter(a => a.service !== 'magasin');
  assert.equal(F.estFournisseur(sans, 'magasin', O), true);
});

test('l’état d’un client : partout, nulle part, ou en partie (n chemins sur m)', () => {
  const e = unite(), avant = JSON.stringify(e);
  // Le montage est une étape des trois chemins ; le magasin le fournit dans deux.
  assert.deepEqual(F.etatClient(e, 'magasin', 'prepa'), { etat: 'partie', n: 2, m: 3, avec: ['c1', 'c2'], sans: ['c3'], garde: false });
  assert.deepEqual(F.etatClient(e, 'appros', 'decontam'), { etat: 'oui', n: 1, m: 1, avec: ['c1'], sans: [], garde: false });
  assert.deepEqual(F.etatClient(e, 'appros', 'cuisine'), { etat: 'partie', n: 1, m: 2, avec: ['c3'], sans: ['c1'], garde: false });
  assert.deepEqual(F.etatClient(e, 'appros', 'preparation'), { etat: 'non', n: 0, m: 2, avec: [], sans: ['c2', 'c3'], garde: false });
  // Un service qui n'est dans aucun chemin : décoché, tant que la liste ne le garde pas.
  assert.deepEqual(F.etatClient(e, 'magasin', 'dotation'), { etat: 'non', n: 0, m: 0, avec: [], sans: [], garde: false });
  assert.equal(JSON.stringify(e), avant, 'lire ne change rien');
});

test('le tableau « Qui se fournit où » : une ligne par service, une colonne par fournisseur', () => {
  const e = unite(), avant = JSON.stringify(e);
  const t = F.tableau(e, SERVICES, O);
  assert.deepEqual(t.fournisseurs.map(f => [f.id, f.nom]), [['magasin', 'Magasin'], ['appros', 'Réception']]);
  assert.deepEqual(t.lignes.map(l => l.id), SERVICES.map(s => s.id), 'une ligne par service de l’unité, fournisseurs compris');
  const cellule = (s, f) => t.lignes.find(l => l.id === s).cellules[t.fournisseurs.findIndex(x => x.id === f)];
  assert.equal(cellule('magasin', 'magasin'), null, 'rien entre un fournisseur et lui-même');
  assert.equal(cellule('appros', 'appros'), null);
  assert.equal(cellule('prepa', 'magasin').etat, 'partie');
  assert.deepEqual(cellule('prepa', 'magasin').avec, ['Chaud', 'Froid'], 'les chemins, par leur nom');
  assert.deepEqual(cellule('prepa', 'magasin').sans, ['Mixte']);
  assert.equal(cellule('decontam', 'appros').etat, 'oui');
  assert.equal(cellule('preparation', 'appros').etat, 'non');
  assert.equal(t.enPartie, 2, 'le montage chez le magasin, la cuisine à la réception');
  assert.equal(F.enPartie(e, SERVICES, O), 2);
  assert.equal(t.lignes.find(l => l.id === 'dotation').chemins, 0, 'la dotation n’est dans aucun chemin');
  assert.equal(JSON.stringify(e), avant, 'dresser le tableau ne change rien');
});

test('cocher un service écrit le lien dans tous les chemins où il est une étape, et dans aucun autre', () => {
  const e = unite();
  // La préparation froide est une étape de « Froid » et de « Mixte », pas de « Chaud ».
  F.regler(e, 'magasin', 'preparation', true, O);
  assert.equal(aLien(e, 'c2', 'magasin', 'preparation'), true);
  assert.equal(aLien(e, 'c3', 'magasin', 'preparation'), true);
  assert.equal(aLien(e, 'c1', 'magasin', 'preparation'), false, 'aucun lien là où le service n’est pas une étape');
  assert.equal(chemin(e, 'c3').noeuds.includes('magasin'), true, 'le fournisseur est ajouté au chemin');
  assert.equal(chemin(e, 'c1').noeuds.includes('preparation'), false, 'le client n’entre dans aucun chemin');
  assert.deepEqual(F.etatClient(e, 'magasin', 'preparation').etat, 'oui');
  assert.deepEqual(e.fournisseurs, { magasin: ['preparation'] }, 'la liste garde ce qui est coché');
  // Les autres liens n'ont pas bougé.
  const reference = unite();
  for (const p of reference.parcours) for (const l of p.liens) assert.equal(aLien(e, p.id, l.de, l.vers), true, p.nom + ' garde ' + l.de + ' → ' + l.vers);
  assert.deepEqual(liensDe(e, 'appros'), liensDe(reference, 'appros'));
  // Cocher deux fois ne double rien.
  const une = JSON.stringify(e); F.regler(e, 'magasin', 'preparation', true, O);
  assert.equal(JSON.stringify(e), une);
});

test('décocher enlève le lien partout ; un fournisseur sans client dans un chemin en sort', () => {
  const e = unite();
  F.regler(e, 'appros', 'cuisine', true, O);
  assert.deepEqual(liensDe(e, 'appros'), ['c1:cuisine', 'c1:decontam', 'c3:cuisine']);
  F.regler(e, 'appros', 'cuisine', false, O);
  assert.deepEqual(liensDe(e, 'appros'), ['c1:decontam'], 'le lien est retiré de tous les chemins');
  assert.equal(chemin(e, 'c3').noeuds.includes('appros'), false, 'sans client dans « Mixte », la réception en sort');
  assert.equal(chemin(e, 'c1').noeuds.includes('appros'), true, 'dans « Chaud », elle fournit encore la décontamination');
  assert.equal('fournisseurs' in e, false, 'la liste ne garde rien de décoché');
  // Les étapes et leurs liens entre elles restent.
  assert.deepEqual(chemin(e, 'c3').liens, [lien('cuisine', 'preparation'), lien('preparation', 'prepa')]);
});

test('« Partout » puis « Nulle part » sur un client en partie : les liens attendus', () => {
  const e = unite();
  assert.equal(F.etatClient(e, 'magasin', 'prepa').etat, 'partie');
  F.regler(e, 'magasin', 'prepa', true, O);       // « Partout »
  assert.deepEqual(liensDe(e, 'magasin'), ['c1:prepa', 'c2:prepa', 'c3:prepa']);
  assert.deepEqual(F.etatClient(e, 'magasin', 'prepa'), { etat: 'oui', n: 3, m: 3, avec: ['c1', 'c2', 'c3'], sans: [], garde: true });
  F.regler(e, 'magasin', 'prepa', false, O);      // « Nulle part »
  assert.deepEqual(liensDe(e, 'magasin'), []);
  assert.deepEqual(e.parcours.map(p => p.noeuds.includes('magasin')), [false, false, false], 'le magasin sort des trois chemins');
  assert.equal(F.etatClient(e, 'magasin', 'prepa').etat, 'non');
});

test('la liste vaut pour la suite : une étape ajoutée reçoit aussitôt les liens de ses fournisseurs', () => {
  const e = unite();
  // La décontamination est cliente de la réception partout où elle passe (un chemin) : elle entre dans « Froid ».
  const avant = copie(e);
  PC.insererService(e, chemin(e, 'c2'), 'decontam', {});
  F.suivre(avant, e, O);
  assert.equal(aLien(e, 'c2', 'appros', 'decontam'), true, 'le lien de son fournisseur y est');
  assert.equal(chemin(e, 'c2').noeuds.includes('appros'), true, 'et le fournisseur avec');
  assert.equal(F.etatClient(e, 'appros', 'decontam').etat, 'oui');
});

test('créer ou dupliquer un chemin qui contient un client : le lien y est', () => {
  const e = unite();
  let double;
  geste(e, () => { double = PC.nouveauType(e, 'Chaud (copie)', chemin(e, 'c1')); });
  assert.equal(double.liens.some(l => l.de === 'appros' && l.vers === 'decontam'), true, 'un chemin dupliqué porte le lien de son modèle');
  assert.deepEqual(F.etatClient(e, 'appros', 'decontam').etat, 'oui', 'client dans les deux chemins où il passe');
  // Un chemin créé vide, puis son étape (deux gestes, comme dans la page) : le lien arrive avec elle.
  let neuf;
  geste(e, () => { neuf = PC.nouveauType(e, 'Nouveau', null); });
  assert.deepEqual([neuf.noeuds, neuf.liens], [[], []]);
  geste(e, () => PC.insererService(e, neuf, 'decontam', {}));
  assert.equal(neuf.liens.some(l => l.de === 'appros' && l.vers === 'decontam'), true, 'un chemin créé reçoit le lien');
  assert.equal(neuf.noeuds.includes('appros'), true);
  // Un chemin écrit d'un bloc dans le même geste (une organisation reprise telle quelle) n'est pas retouché.
  geste(e, () => { e.parcours.push({ id: 'bloc', nom: 'D’un bloc', type: true, noeuds: ['decontam', 'cuisine'], liens: [lien('decontam', 'cuisine')] }); });
  assert.deepEqual(chemin(e, 'bloc').liens, [lien('decontam', 'cuisine')]);
  assert.equal(F.etatClient(e, 'appros', 'decontam').etat, 'partie', 'la décontamination y passe sans son fournisseur : en partie, et la page le dit');
});

test('un service coché qui n’est dans aucun chemin reçoit ses liens en y entrant', () => {
  const e = unite();
  geste(e, () => F.regler(e, 'magasin', 'dotation', true, O));
  assert.deepEqual(liensDe(e, 'magasin'), ['c1:prepa', 'c2:prepa'], 'aucun lien encore : la dotation n’est une étape nulle part');
  assert.deepEqual(e.fournisseurs, { magasin: ['dotation'] }, 'la liste le garde');
  assert.deepEqual(F.etatClient(e, 'magasin', 'dotation'), { etat: 'oui', n: 0, m: 0, avec: [], sans: [], garde: true });
  geste(e, () => PC.insererService(e, chemin(e, 'c2'), 'dotation', {}));
  assert.equal(aLien(e, 'c2', 'magasin', 'dotation'), true);
  // Sorti de tous les chemins, il reste coché : la liste s'en souvient.
  geste(e, () => PC.retirerService(chemin(e, 'c2'), 'dotation'));
  assert.equal(F.etatClient(e, 'magasin', 'dotation').etat, 'oui');
  assert.equal(chemin(e, 'c2').noeuds.includes('magasin'), true, 'le magasin y fournit encore le montage');
});

test('un client coché d’après ses seuls liens (une sauvegarde d’avant) le reste quand il sort de tous les chemins', () => {
  const e = unite();
  assert.deepEqual(F.etatClient(e, 'appros', 'decontam'), { etat: 'oui', n: 1, m: 1, avec: ['c1'], sans: [], garde: false });
  geste(e, () => PC.retirerService(chemin(e, 'c1'), 'decontam'));
  assert.deepEqual(e.fournisseurs, { appros: ['decontam'] }, 'la liste le retient à ce moment-là');
  geste(e, () => PC.insererService(e, chemin(e, 'c2'), 'decontam', {}));
  assert.equal(aLien(e, 'c2', 'appros', 'decontam'), true, 'revenu dans un chemin, il y retrouve son fournisseur');
});

test('seul le tableau change un lien de fournisseur : un geste sur un chemin n’en crée ni n’en retire', () => {
  // Un chemin, la réception y fournit la cuisine ; la préparation froide n'est cliente de personne.
  const e = { schema: 'ory-ateliers', version: 1, exclues: [], ajoutees: [], ateliers: [dispo('re', 'Réception', 'appros'), equipe('cu', 'Cuisine', 'cuisine', []),
    equipe('pf', 'Préparation froide', 'preparation', []), equipe('mo', 'Montage', 'prepa', [])],
    parcours: [{ id: 'x', nom: 'Seul', type: true, noeuds: ['appros', 'cuisine', 'prepa'], liens: [lien('appros', 'cuisine'), lien('cuisine', 'prepa')] }],
    parcoursCabine: { YC: 'x' }, parcoursClasse: {} };
  assert.equal(F.etatClient(e, 'appros', 'preparation').etat, 'non');
  // L'insertion devine les voisins d'un service d'après les chemins types : elle relierait la réception à la préparation.
  const devine = copie(e);
  PC.insererService(devine, devine.parcours[0], 'preparation', {});
  assert.equal(devine.parcours[0].liens.some(l => l.de === 'appros' && l.vers === 'preparation'), true, 'le témoin : sans la liste, le lien est deviné');
  const avant = copie(e);
  PC.insererService(e, e.parcours[0], 'preparation', {});
  F.suivre(avant, e, O);
  assert.equal(e.parcours[0].liens.some(l => l.de === 'appros' && l.vers === 'preparation'), false, 'décochée, elle le reste');
  assert.equal(e.parcours[0].liens.some(l => l.de === 'preparation' && l.vers === 'prepa'), true, 'ses liens entre étapes sont gardés');
  // Retirer une étape : ceux qui la livraient livrent ceux qu'elle livrait — pas son fournisseur, qui n'a plus de client ici.
  const puis = copie(e);
  PC.retirerService(e.parcours[0], 'cuisine');
  F.suivre(puis, e, O);
  assert.deepEqual(e.parcours[0].liens.filter(l => l.de === 'appros'), [], 'la réception ne fournit pas le montage à la place');
  assert.equal(e.parcours[0].noeuds.includes('appros'), false, 'sans client dans ce chemin, elle en sort');
});

test('une étape insérée entre un client et son fournisseur ne déplace pas le lien', () => {
  // Les deux chemins de l'unité fictive : la réception fournit la préparation froide dans « Sans cuisine » seulement.
  const e = { schema: 'ory-ateliers', version: 1, exclues: [], ajoutees: [], ateliers: [dispo('re', 'Réception', 'appros'), dispo('de', 'Décontamination', 'decontam'),
    equipe('cu', 'Cuisine', 'cuisine', []), equipe('pf', 'Préparation froide', 'preparation', []), equipe('mo', 'Montage', 'prepa', [])],
    parcours: [
      { id: 'complet', nom: 'Complet', type: true, noeuds: ['appros', 'decontam', 'cuisine', 'preparation', 'prepa'],
        liens: [lien('appros', 'decontam'), lien('decontam', 'cuisine'), lien('cuisine', 'preparation'), lien('preparation', 'prepa')] },
      { id: 'sans', nom: 'Sans cuisine', type: true, noeuds: ['appros', 'preparation', 'prepa'], liens: [lien('appros', 'preparation'), lien('preparation', 'prepa')] }],
    parcoursCabine: { BC: 'complet', YC: 'sans' }, parcoursClasse: {} };
  assert.equal(F.etatClient(e, 'appros', 'preparation').etat, 'partie');
  assert.equal(F.etatClient(e, 'appros', 'cuisine').etat, 'non');
  // Le témoin : sans le suivi, la cuisine s'intercale — la réception la fournit, et ne fournit plus la préparation.
  const devine = copie(e);
  PC.insererService(devine, chemin(devine, 'sans'), 'cuisine', {});
  assert.deepEqual(chemin(devine, 'sans').liens, [lien('preparation', 'prepa'), lien('appros', 'cuisine'), lien('cuisine', 'preparation')]);
  // Avec lui : la préparation garde son fournisseur dans ce chemin, la cuisine (décochée) n'en reçoit pas.
  geste(e, () => PC.insererService(e, chemin(e, 'sans'), 'cuisine', {}));
  assert.deepEqual(chemin(e, 'sans').liens, [lien('preparation', 'prepa'), lien('cuisine', 'preparation'), lien('appros', 'preparation')]);
  assert.deepEqual(chemin(e, 'sans').noeuds, ['appros', 'preparation', 'prepa', 'cuisine']);
  assert.deepEqual(F.etatClient(e, 'appros', 'preparation'), { etat: 'partie', n: 1, m: 2, avec: ['sans'], sans: ['complet'], garde: false }, 'en partie, comme avant');
  assert.equal(F.etatClient(e, 'appros', 'cuisine').etat, 'non');
  // Le lien entre deux étapes, lui, suit le geste : la cuisine livre la préparation.
  assert.equal(aLien(e, 'sans', 'cuisine', 'preparation'), true);
});

test('un client en partie ne bouge pas tant qu’on ne le règle pas', () => {
  const e = unite();
  const avant = copie(e);
  // Un geste sans rapport : la décontamination entre dans « Mixte ».
  PC.insererService(e, chemin(e, 'c3'), 'decontam', {});
  F.suivre(avant, e, O);
  assert.deepEqual(liensDe(e, 'magasin'), liensDe(avant, 'magasin'), 'le magasin fournit le montage dans les deux mêmes chemins');
  assert.deepEqual(F.etatClient(e, 'magasin', 'prepa'), { etat: 'partie', n: 2, m: 3, avec: ['c1', 'c2'], sans: ['c3'], garde: false });
  // Un changement qui ne touche aucun chemin ne touche à rien.
  const fige = copie(e), texte = JSON.stringify(e);
  e.ateliers[3].debut = '07:00';
  F.suivre(fige, e, O);
  e.ateliers[3].debut = '06:00';
  assert.equal(JSON.stringify(e), texte);
});

test('ce que le tableau règle n’est pas défait par le suivi du même geste', () => {
  const e = unite();
  const avant = copie(e);
  F.regler(e, 'appros', 'decontam', false, O);
  F.suivre(avant, e, O);
  assert.equal(F.etatClient(e, 'appros', 'decontam').etat, 'non', 'décoché dans le tableau, il le reste');
  const puis = copie(e);
  F.regler(e, 'appros', 'preparation', true, O);
  F.suivre(puis, e, O);
  assert.equal(F.etatClient(e, 'appros', 'preparation').etat, 'oui');
  assert.deepEqual(liensDe(e, 'appros'), ['c2:preparation', 'c3:cuisine', 'c3:preparation']);
});

test('la liste se garde avec l’unité : relue telle quelle, mise au propre', () => {
  assert.deepEqual(F.lire(undefined), {});
  assert.deepEqual(F.lire({ magasin: ['prepa', 'prepa', '', 'magasin', 7], appros: [], x: 'non' }), { magasin: ['prepa'] },
    'une fois chacun, jamais lui-même, ni liste vide ni valeur qui n’est pas un service');
  const e = unite();
  F.regler(e, 'magasin', 'dotation', true, O);
  const relu = A.valider(copie(e));
  assert.deepEqual(relu.fournisseurs, { magasin: ['dotation'] }, 'la sauvegarde la porte');
  assert.deepEqual(A.valider(copie(relu)), relu, 'relue deux fois, la même');
});

test('une sauvegarde d’avant : rien n’y bouge, ni à la relecture ni en dressant le tableau', () => {
  const ancienne = A.valider(unite());
  assert.equal('fournisseurs' in ancienne, false, 'une sauvegarde d’avant n’a pas de liste, et n’en reçoit pas');
  const texte = JSON.stringify(ancienne);
  F.tableau(ancienne, SERVICES, O); F.enPartie(ancienne, SERVICES, O);
  // Un geste sans rapport avec les chemins, suivi : rien d'autre ne change.
  const avant = copie(ancienne);
  F.suivre(avant, ancienne, O);
  assert.equal(JSON.stringify(ancienne), texte);
  assert.equal(JSON.stringify(A.valider(copie(ancienne))), texte, 'relue, elle est la même');
});

/* ---- le résultat ---------------------------------------------------------------------------------------------- */

const h = s => P.minutes(s);
const vol = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const BAREME = { prepa: { '*/YC': 60 }, cuisine: { '*/YC': 30 } };
/** La journée d'une unité : ses équipes et ses chemins, tels que la sauvegarde les porte. */
const jouer = (e, vols) => P.simuler({ vols, liaisons: [], bareme: BAREME, rendement: 1, ateliers: e.ateliers, parcours: e.parcours,
  parcoursCabine: e.parcoursCabine, parcoursClasse: e.parcoursClasse });
const lots = (r, id) => r.lots.filter(l => l.atelier === id).map(l => [l.nom, P.hhmm(l.debut), P.hhmm(l.fin), l.attente]);
/** Une cuisine puis un montage ; un magasin, fournisseur, que personne ne fréquente encore. */
function petite(magasin) {
  return { schema: 'ory-ateliers', version: 1, exclues: [], ajoutees: [],
    ateliers: [magasin, equipe('cu', 'Cuisine', 'cuisine', [['NORD/YC']], { debut: '05:00' }), equipe('mo', 'Montage', 'prepa', [['NORD/YC']], { debut: '05:00' })],
    parcours: [{ id: 'c', nom: 'Cuisine puis montage', type: true, noeuds: ['cuisine', 'prepa'], liens: [lien('cuisine', 'prepa')] }],
    parcoursCabine: { YC: 'c' }, parcoursClasse: {} };
}

test('avec un fournisseur à horaires, un client ajouté attend son ouverture (journée calculée à la main)', () => {
  // Le magasin ouvre de 07:00 à 18:00. La cuisine commence à 05:00 : 30 min pour le vol NORD → 05:00–05:30. Le montage,
  // à 05:00 aussi, attend la cuisine : 60 min → 05:30–06:30.
  const e = petite(dispo('mg', 'Magasin', 'magasin', { ouverture: { de: '07:00', a: '18:00' } }));
  const vols = [vol('NO1', 'NORD', '12:00')];
  const avant = jouer(e, vols);
  assert.equal(avant.ok, true, JSON.stringify(avant.anomalies));
  assert.deepEqual(lots(avant, 'cu'), [['NORD/YC', '05:00', '05:30', 0]]);
  assert.deepEqual(lots(avant, 'mo'), [['NORD/YC', '05:30', '06:30', 30]]);
  // La cuisine devient cliente du magasin : elle attend 07:00 (2 h), finit à 07:30 ; le montage suit, 07:30–08:30.
  F.regler(e, 'magasin', 'cuisine', true, O);
  assert.deepEqual(e.parcours[0].liens, [lien('cuisine', 'prepa'), lien('magasin', 'cuisine')]);
  const apres = jouer(e, vols);
  assert.equal(apres.ok, true, JSON.stringify(apres.anomalies));
  assert.deepEqual(lots(apres, 'cu'), [['NORD/YC', '07:00', '07:30', 120]], 'un client de plus attend l’ouverture, et c’est voulu');
  assert.deepEqual(lots(apres, 'mo'), [['NORD/YC', '07:30', '08:30', 150]]);
  // Décoché, la journée d'avant, champ par champ.
  F.regler(e, 'magasin', 'cuisine', false, O);
  assert.deepEqual(copie(jouer(e, vols)), copie(avant));
});

test('avec un fournisseur toujours ouvert, un client de plus ne change aucune heure', () => {
  const e = petite(dispo('mg', 'Magasin', 'magasin'));
  const vols = [vol('NO1', 'NORD', '12:00')];
  const avant = jouer(e, vols);
  F.regler(e, 'magasin', 'cuisine', true, O);
  const apres = jouer(e, vols);
  assert.deepEqual(lots(apres, 'cu'), lots(avant, 'cu'));
  assert.deepEqual(lots(apres, 'mo'), lots(avant, 'mo'));
  // Champ par champ : rien ne change, sauf l'instant où le lot du client est prêt — servi dès le début de son poste
  // (05:00), là où, sans fournisseur, il n'attendait personne (aucun instant).
  const sansPret = r => JSON.parse(JSON.stringify(r, (k, v) => (k === 'pret' ? undefined : v)));
  assert.deepEqual(sansPret(apres), sansPret(avant), 'aucune heure, aucune attente, aucun indicateur ne change');
  assert.deepEqual(avant.lots.filter(l => l.atelier === 'cu').map(l => l.pret), [null]);
  assert.deepEqual(apres.lots.filter(l => l.atelier === 'cu').map(l => l.pret), [h('05:00')]);
});

test('une sauvegarde d’après, relue par le code d’avant (la version 2), donne le même résultat', () => {
  const e = A.valider(unite());
  F.regler(e, 'magasin', 'prepa', true, O);
  F.regler(e, 'magasin', 'dotation', true, O);
  const apres = A.valider(copie(e));
  assert.deepEqual(apres.fournisseurs, { magasin: ['prepa', 'dotation'] });
  // La même unité, les mêmes liens, dessinés à la main chemin par chemin comme avant : sans la liste.
  const { fournisseurs, ...aLaMain } = copie(apres);
  assert.ok(fournisseurs);
  // Le code d'avant ne connaît pas la liste : il la laisse, et lit les mêmes chemins, les mêmes liens.
  const relu = V2.valider(copie(apres));
  assert.equal('fournisseurs' in relu, false);
  assert.deepEqual(relu, V2.valider(copie(aLaMain)), 'ce qu’il lit ne dépend pas de la liste');
  assert.deepEqual(relu.parcours, apres.parcours, 'les chemins et leurs liens, tels que la sauvegarde les porte');
  const vols = [{ id: 'NO1', cie: 'NORD', sens: 'DEP', std: h('14:00'), bc: 10, pc: 0, yc: 100 }];
  const bareme = { cuisine: { '*/BC': 20 }, preparation: { '*/YC': 20 }, prepa: { '*/BC': 10, '*/YC': 30 } };
  const calcul = (M, x) => copie(M.simuler({ vols, liaisons: [], bareme, rendement: 1, ateliers: x.ateliers, parcours: x.parcours, parcoursCabine: x.parcoursCabine, parcoursClasse: x.parcoursClasse }));
  // Avec le moteur d'avant : le même résultat que pour les liens dessinés à la main.
  const avant = calcul(globalThis.MoteurProduction, relu);
  assert.equal(avant.ok, true, JSON.stringify(avant.anomalies));
  assert.ok(avant.lots.length > 3);
  assert.deepEqual(avant, calcul(globalThis.MoteurProduction, V2.valider(copie(aLaMain))));
  // Avec le moteur d'aujourd'hui : la liste ne change rien au calcul, qui ne lit que les liens.
  const r = calcul(P, apres);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.deepEqual(r, calcul(P, A.valider(copie(aLaMain))), 'le même résultat, champ par champ');
  // Et les deux moteurs disent les mêmes heures pour chaque lot.
  const heures = x => x.lots.map(l => [l.atelier, l.nom, l.debut, l.fin]);
  assert.deepEqual(heures(avant), heures(r));
});

/* ---- évolution 24 (b) : le schéma sans les fournisseurs -------------------------------------------------------- */

test('un chemin : ses étapes d’un côté, ses fournisseurs de l’autre, et les pastilles de ses étapes clientes', () => {
  const e = unite(), avant = JSON.stringify(e);
  assert.deepEqual(F.duChemin(e, chemin(e, 'c1'), O), { etapes: ['decontam', 'cuisine', 'prepa'], fournisseurs: ['appros', 'magasin'],
    clients: { decontam: ['appros'], prepa: ['magasin'] } });
  // « Mixte » : le montage y passe sans le magasin (client en partie) — pas de pastille là où il n'y a pas de lien.
  assert.deepEqual(F.duChemin(e, chemin(e, 'c3'), O), { etapes: ['cuisine', 'preparation', 'prepa'], fournisseurs: ['appros'], clients: { cuisine: ['appros'] } });
  // Une étape cliente de deux fournisseurs porte les deux.
  F.regler(e, 'appros', 'prepa', true, O);
  assert.deepEqual(F.duChemin(e, chemin(e, 'c1'), O).clients.prepa, ['appros', 'magasin']);
  // Une mise à disposition qui a un amont est une étape : elle se dessine.
  assert.ok(F.duChemin(e, chemin(e, 'c1'), O).etapes.includes('decontam'));
  const lu = unite();
  F.duChemin(lu, chemin(lu, 'c1'), O);
  assert.equal(JSON.stringify(lu), avant, 'lire ne change rien');
});

/* ---- ce que la page en montre -------------------------------------------------------------------------------- */

test('le tableau dit la règle, coche, décoche, et nomme un client en partie', () => {
  const e = unite();
  const html = F.tableauHTML(F.tableau(e, SERVICES, O));
  assert.match(html, /Cochez les clients de chaque fournisseur\. Un client l’est dans tous les chemins où il passe\./);
  assert.match(html, /<caption[^>]*>Qui se fournit où<\/caption>/);
  assert.equal((html.match(/<th scope="col"/g) || []).length, 3, 'la colonne des services, puis une par fournisseur');
  assert.equal((html.match(/<tr data-fo-service=/g) || []).length, SERVICES.length);
  // Cochée : la décontamination à la réception. Décochée : la préparation froide.
  assert.match(html, /<input type="checkbox" data-fo-client="decontam" data-fo-fournisseur="appros"[^>]* checked>/);
  assert.match(html, /<input type="checkbox" data-fo-client="preparation" data-fo-fournisseur="appros"(?![^>]* checked)[^>]*>/);
  // En partie : le nombre de chemins, leur liste au survol, deux boutons.
  assert.match(html, /en partie : 2 chemins sur 3/);
  assert.match(html, /en partie : 1 chemin sur 2/);
  assert.match(html, /title="Client dans : Chaud, Froid\. Pas dans : Mixte\."/);
  assert.match(html, /<button[^>]* data-fo-partout="prepa" data-fo-fournisseur="magasin"[^>]*>Partout<\/button>/);
  assert.match(html, /<button[^>]* data-fo-nulle-part="prepa" data-fo-fournisseur="magasin"[^>]*>Nulle part<\/button>/);
  assert.doesNotMatch(html, /data-fo-client="magasin" data-fo-fournisseur="magasin"/, 'rien entre un fournisseur et lui-même');
  // Un nom venu d'un fichier est échappé.
  const t = F.tableau(e, SERVICES.map(s => (s.id === 'cuisine' ? { id: s.id, nom: '<b>Cuisine</b>' } : s)), { ...O, nom: id => (id === 'cuisine' ? '<b>Cuisine</b>' : O.nom(id)) });
  assert.doesNotMatch(F.tableauHTML(t), /<b>Cuisine<\/b>/);
  assert.match(F.tableauHTML(t), /&lt;b&gt;Cuisine&lt;\/b&gt;/);
  // Une unité sans fournisseur : le tableau le dit.
  const sans = unite(); sans.ateliers = sans.ateliers.filter(a => a.type !== 'dispo'); for (const p of sans.parcours) { p.noeuds = p.noeuds.filter(s => !['magasin', 'appros', 'decontam'].includes(s)); p.liens = p.liens.filter(l => p.noeuds.includes(l.de) && p.noeuds.includes(l.vers)); }
  const vide = F.tableauHTML(F.tableau(sans, SERVICES.filter(s => !['magasin', 'appros', 'decontam'].includes(s.id)), O));
  assert.match(vide, /Aucun fournisseur/);
  assert.doesNotMatch(vide, /<table/);
});

test('la fiche d’un fournisseur : la liste de ses clients, qui se lit', () => {
  const e = unite();
  assert.deepEqual(F.clientsDe(e, 'appros', SERVICES, O).map(c => [c.nom, c.etat]), [['Décontamination', 'oui'], ['Cuisine', 'partie']]);
  const html = F.clientsHTML(F.clientsDe(e, 'appros', SERVICES, O));
  assert.match(html, /Décontamination/);
  assert.match(html, /Cuisine <small[^>]*>\(en partie : 1 chemin sur 2\)<\/small>/);
  assert.match(html, /<button[^>]* data-fo-ouvrir[^>]*>Régler dans Chemins › Fournisseurs →<\/button>/);
  assert.doesNotMatch(html, /<input/, 'rien ne s’y règle');
  assert.match(F.clientsHTML([]), /Aucun client pour l’instant/);
});
