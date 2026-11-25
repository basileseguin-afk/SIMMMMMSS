/* « Chemins » (version 1, évolution 22 c) — ce que disent la liste des chemins et le tableau d'une étape, sans
 * navigateur. Chemins, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../chemins-page.js');

const classes = ['NO/BC', 'NO/PC', 'SU/BC', 'SU/YC', 'NO/YC'].map(id => ({ id, cie: id.split('/')[0], cabine: id.split('/')[1] }));
const equipe = x => ({ type: 'manuel', debut: '05:00', jour: 0, personnes: 2, lots: [], pauses: [], ...x });
const etat = (ateliers = []) => ({
  ateliers,
  parcours: [
    { id: 'p3', nom: 'Chemin de SU YC', noeuds: ['dotation', 'montage'], liens: [{ de: 'dotation', vers: 'montage' }] },
    { id: 'p1', nom: 'Complet', type: true, noeuds: ['cuisine', 'montage', 'magasin'], liens: [{ de: 'cuisine', vers: 'montage' }] },
    { id: 'p2', nom: 'Complet · NO PC', type: true, auto: true, noeuds: ['montage'], liens: [] }],
  parcoursCabine: { BC: 'p1', PC: 'p1' },
  parcoursClasse: { 'NO/PC': 'p2', 'SU/YC': 'p3' }
});

test('la liste des chemins : ceux que suivent des classes, leurs variantes, puis les chemins à part — avec leurs commandes et leurs étapes', () => {
  const l = C.chemins(etat(), classes);
  // Évolution 24 (b) : le compte distingue les étapes des fournisseurs. Le magasin de « Complet », une mise à disposition
  // où rien n'arrive, est un fournisseur : deux étapes et un fournisseur (avant : « 3 étapes »).
  assert.deepEqual(l.map(x => [x.p.id, x.genre, x.commandes.map(c => c.id), x.etapes, x.fournisseurs]), [
    ['p1', 'chemin', ['NO/BC', 'SU/BC'], 2, 1],
    ['p2', 'variante', ['NO/PC'], 1, 0],
    ['p3', 'apart', ['SU/YC'], 2, 0]]);
  assert.deepEqual(l.map(C.compte), ['2 commandes · 2 étapes · 1 fournisseur', '1 commande · 1 étape', '1 commande · 2 étapes']);
  assert.equal(C.compte({ commandes: [], etapes: 4, fournisseurs: 2 }), '0 commande · 4 étapes · 2 fournisseurs');
  // Sans chemin ni commande : la liste est vide, rien ne casse.
  assert.deepEqual(C.chemins({}, classes), []);
  assert.deepEqual(C.chemins(etat(), []).map(x => x.commandes.length), [0, 0, 0]);
});

test('les commandes sans chemin : ni le leur, ni celui de leur classe', () => {
  assert.deepEqual(C.sansChemin(etat(), classes).map(c => c.id), ['NO/YC']);
  // Sa classe reçoit un chemin : elle en a un.
  const e = etat(); e.parcoursCabine.YC = 'p1';
  assert.deepEqual(C.sansChemin(e, classes), []);
  // Une classe sans chemin : toutes ses commandes sans chemin propre.
  const f = etat(); delete f.parcoursCabine.BC;
  assert.deepEqual(C.sansChemin(f, classes).map(c => c.id), ['NO/BC', 'SU/BC', 'NO/YC']);
});

test('le tableau d’une étape : l’équipe qui prépare la commande ici, ou « à corriger »', () => {
  const e = etat([equipe({ id: 'm1', nom: 'Montage matin', service: 'montage', lots: [['NO/BC']] }),
    equipe({ id: 'm2', nom: 'Montage soir', service: 'montage', lots: [] }),
    equipe({ id: 'd1', nom: 'Magasin', service: 'magasin', type: 'dispo' })]);
  // Une équipe la prépare : elle se choisit parmi celles du service qui préparent.
  const l = C.ligneEtape(e, 'montage', 'NO/BC');
  assert.deepEqual([l.genre, l.equipe.id, l.choix.map(a => a.id)], ['equipe', 'm1', ['m1', 'm2']]);
  // Aucune équipe du service ne la prépare : l'étape serait sautée.
  const s = C.ligneEtape(e, 'montage', 'SU/BC');
  assert.deepEqual([s.genre, s.equipe, s.choix.length], ['aucune', null, 2]);
  // Une mise à disposition sert toutes les commandes : rien à choisir.
  const d = C.ligneEtape(e, 'magasin', 'NO/BC');
  assert.deepEqual([d.genre, d.equipe.id, d.choix], ['commune', 'd1', []]);
  // Un service sans équipe : à corriger, et aucune équipe à choisir.
  assert.deepEqual(C.ligneEtape(e, 'cuisine', 'NO/BC'), { genre: 'aucune', equipe: null, choix: [] });
  // Une équipe d'appui (hors chemin) ne prépare aucune commande : seule dans son service, l'étape reste « à corriger »,
  // comme le calcul le dit ; une plonge ou un chargement servent toutes les commandes.
  const f = etat([equipe({ id: 'ap', nom: 'Dotation hors chemin', service: 'dotation', type: 'appui' }), equipe({ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage' }),
    equipe({ id: 'h', nom: 'Quais', service: 'quais', type: 'handling' })]);
  assert.deepEqual(C.ligneEtape(f, 'dotation', 'NO/BC'), { genre: 'aucune', equipe: null, choix: [] });
  assert.deepEqual([C.ligneEtape(f, 'plonge', 'NO/BC').genre, C.ligneEtape(f, 'quais', 'NO/BC').genre], ['commune', 'commune']);
});

test('une étape faite à la chaîne par l’équipe du service d’avant : elle le dit, ce n’est pas « à corriger »', () => {
  const e = etat([equipe({ id: 'c1', nom: 'Cuisine', service: 'cuisine', fusion: 'montage', lots: [['SU/BC']] }),
    equipe({ id: 'm1', nom: 'Montage matin', service: 'montage', lots: [['NO/BC']] })]);
  const l = C.ligneEtape(e, 'montage', 'SU/BC');
  assert.deepEqual([l.genre, l.equipe.id], ['chaine', 'c1']);
  // La commande que l'équipe du service prépare elle-même garde son équipe.
  assert.equal(C.ligneEtape(e, 'montage', 'NO/BC').genre, 'equipe');
});

/* Évolution 23 (c) : le schéma d'un chemin ne se réduit jamais sous la taille où ses textes font 12 px à l'écran ; au-delà,
 * il défile dans son cadre. « Tout voir » le réduit à la demande, pour qu'il tienne entier ; « Taille lisible » y revient. */
test('le schéma : jamais sous la taille où son plus petit texte fait 12 px ; « Tout voir » le fait tenir dans son cadre', () => {
  assert.equal(C.TEXTE_MIN, 12);
  const cadre = { largeur: 760, hauteur: 480 };
  // Un texte de 11 unités : il faut grossir le dessin de 12/11 pour qu'il fasse 12 px.
  const petit = C.echelleSchema({ w: 400, h: 300 }, cadre, 11, false);
  assert.ok(Math.abs(petit.k - 12 / 11) < 1e-9 && 11 * petit.k >= 12 - 1e-9, 'un petit schéma : grossi à la taille lisible');
  assert.equal(petit.deborde, false, 'il tient dans son cadre : rien à réduire');
  // Un grand schéma, plus large et plus haut que son cadre : la même taille lisible — il défile, il ne rétrécit pas.
  const grand = C.echelleSchema({ w: 843, h: 1452 }, cadre, 11, false);
  assert.ok(Math.abs(grand.k - 12 / 11) < 1e-9, 'un grand schéma : jamais réduit');
  assert.equal(grand.deborde, true, 'il déborde de son cadre : « Tout voir » se propose');
  // « Tout voir » : il tient entier, en largeur et en hauteur ; jamais plus gros que la taille lisible.
  const tout = C.echelleSchema({ w: 843, h: 1452 }, cadre, 11, true);
  assert.ok(843 * tout.k <= 760 + 1e-6 && 1452 * tout.k <= 480 + 1e-6, 'tout tient dans le cadre');
  assert.ok(Math.abs(tout.k - 480 / 1452) < 1e-9, 'au plus grand qui tient : ici, la hauteur commande');
  assert.equal(C.echelleSchema({ w: 400, h: 300 }, cadre, 11, true).k, petit.k, '« Tout voir » ne grossit pas un schéma qui tient déjà');
  // Des textes déjà à 12 unités ou plus : la taille du dessin, sans le réduire ni le grossir.
  assert.equal(C.echelleSchema({ w: 400, h: 300 }, cadre, 13, false).k, 1);
  assert.equal(C.echelleSchema({ w: 2000, h: 300 }, cadre, 12, false).k, 1);
  // Sans mesure (un schéma vide, un cadre pas encore à l'écran) : la taille du dessin, sans erreur.
  assert.equal(C.echelleSchema({ w: 0, h: 0 }, { largeur: 0, hauteur: 0 }, NaN, false).k, 1);
  assert.equal(C.echelleSchema({ w: 843, h: 1452 }, { largeur: 0, hauteur: 0 }, 11, true).k, 12 / 11);
});

test('le nom d’un fournisseur sur sa pastille : entier, coupé entre deux mots quand il ne tient pas sur une ligne (correction 23 j)', () => {
  // Une largeur de 7 par caractère : la mesure du dessin, sans navigateur.
  const mesure = s => s.length * 7, lignes = (nom, max) => C.lignesDuNom(nom, max, mesure);
  // Un nom qui tient : une ligne, le nom tel quel.
  assert.deepEqual(lignes('Magasin', 174), ['Magasin']);
  assert.deepEqual(lignes('Réception / Appros', 174), ['Réception / Appros']);
  // Un nom trop long : coupé entre deux mots ; l'espace reste en fin de ligne, rien n'est retiré.
  const long = 'Magasin central des produits secs et des emballages', deux = lignes(long, 174);
  assert.deepEqual(deux, ['Magasin central des ', 'produits secs et des ', 'emballages']);
  assert.equal(deux.join(''), long, 'les lignes mises bout à bout font le nom entier');
  assert.ok(deux.every(l => mesure(l.trimEnd()) <= 174), 'aucune ligne ne dépasse');
  assert.deepEqual(lignes('Magasin central des produits secs', 174), ['Magasin central des ', 'produits secs']);
  // Jamais de « … », quelle que soit la longueur.
  for (const nom of [long, 'A'.repeat(120), 'Un nom avec des mots ' + 'trèslongsanscoupure'.repeat(4)]) {
    const l = lignes(nom, 174);
    assert.equal(l.join(''), nom); assert.ok(!l.join('').includes('…')); assert.ok(l.every(x => mesure(x.trimEnd()) <= 174), nom);
  }
  // Un mot plus large que la ligne : coupé où il faut.
  assert.deepEqual(lignes('A'.repeat(30), 70), ['A'.repeat(10), 'A'.repeat(10), 'A'.repeat(10)]);
  // Une largeur trop petite pour un caractère : une lettre par ligne, sans boucle sans fin.
  assert.equal(lignes('Abc', 1).join(''), 'Abc');
  assert.deepEqual(lignes('', 174), []);
});
