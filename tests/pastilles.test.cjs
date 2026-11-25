/* Évolution 25 (d) — pastilles.js, sans navigateur : la compagnie et la classe ont une allure, partout la même.
 *   - les compagnies de l'unité : celles du programme chargé et celles des réglages, rangées par ordre alphabétique ;
 *   - sans choix, elles prennent les douze couleurs dans l'ordre, puis recommencent ; un choix porte un rang (1 à 12) ;
 *   - un nom de quatre caractères au plus tient dans la pastille, un nom plus long y laisse ses deux premières lettres ;
 *   - un texte n'est habillé que s'il nomme, à lui seul, une compagnie ou une commande : jamais une phrase ;
 *   - les choix se gardent dans une entrée à part, validée ; le calcul ne la lit pas.
 * Des compagnies fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PA = require('../pastilles.js');
const F = require('./plan-rejoue-fictif.cjs');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('les compagnies de l’unité : celles du programme chargé et celles des réglages, par ordre alphabétique', () => {
  const noms = PA.compagnies({
    vols: [{ cie: 'SUD' }, { cie: 'nord' }, { cie: ' SUD ' }, { cie: '' }, {}],
    classes: [{ cie: 'EST', cabine: 'BC' }],
    etat: {
      ajoutees: [{ cie: 'zen', cabine: 'YC' }], exclues: ['OUEST/SPML', 'NORD/@ARM'],
      ateliers: [{ lots: ['LAC/BC', ['LAC/PC', 'MER/YC']], compagnies: ['pic'], escale: { '*': 60, ILE: 45 }, quaiDepart: { VAL: 5 } }, { lots: [] }, {}],
      categories: { armement: [{ id: 'ARM', minutes: { '*': 10, CAP: 15 } }] }
    },
    bareme: { cuisine: { '*/BC': 35, 'BAIE/YC': 80 } }
  });
  assert.deepEqual(noms, ['BAIE', 'CAP', 'EST', 'ILE', 'LAC', 'MER', 'NORD', 'OUEST', 'PIC', 'SUD', 'VAL', 'ZEN']);
  assert.deepEqual(PA.compagnies({}), [], 'une unité sans vol ni réglage : aucune compagnie');
  assert.deepEqual(PA.compagnies({ vols: [{ cie: 'Éole Air' }, { cie: 'Zéphyr' }, { cie: 'Ciel Charter' }, { cie: 'éole air' }] }),
    ['CIEL CHARTER', 'ÉOLE AIR', 'ZÉPHYR'], 'un accent se range à sa lettre, une compagnie ne compte qu’une fois');
});

test('sans choix : les douze couleurs dans l’ordre alphabétique des compagnies, puis elles recommencent', () => {
  const noms = Array.from({ length: 14 }, (_, i) => 'C' + String(i + 1).padStart(2, '0'));
  const r = PA.rangs(noms, {});
  assert.deepEqual(noms.map(n => r.get(n)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]);
  assert.equal(PA.NOMBRE, 12);
  // Une compagnie qui s'ajoute décale celles qui la suivent : c'est ce que « Garder ces couleurs » arrête.
  const avant = PA.rangs(['NORD', 'SUD'], {}), apres = PA.rangs(['EST', 'NORD', 'SUD'], {});
  assert.deepEqual([avant.get('NORD'), avant.get('SUD'), apres.get('EST'), apres.get('NORD'), apres.get('SUD')], [1, 2, 1, 2, 3]);
});

test('un choix porte un rang, de 1 à 12 ; les autres compagnies gardent leur couleur automatique', () => {
  const r = PA.rangs(['EST', 'NORD', 'SUD'], { NORD: 9 });
  assert.deepEqual([r.get('EST'), r.get('NORD'), r.get('SUD')], [1, 9, 3]);
  assert.deepEqual(PA.choisir({ NORD: 9 }, 'sud', 4), { NORD: 9, SUD: 4 }, 'le choix se range sous le nom de la compagnie, en capitales');
  assert.deepEqual(PA.choisir({ NORD: 9 }, 'NORD', 2), { NORD: 2 });
  for (const mauvais of [0, 13, 1.5, '3', null, undefined, NaN]) assert.throws(() => PA.choisir({}, 'NORD', mauvais), /couleur/, String(mauvais));
  assert.throws(() => PA.choisir({}, '  ', 3), /compagnie/);
});

test('« Garder ces couleurs » : chaque compagnie de l’unité reçoit sa couleur du moment, et ne bouge plus', () => {
  const garde = PA.garder(['NORD', 'SUD', 'ZEN'], { SUD: 7, PARTIE: 4 });
  assert.deepEqual(garde, { NORD: 1, SUD: 7, ZEN: 3, PARTIE: 4 }, 'une compagnie qui n’est plus dans l’unité garde son choix');
  const apres = PA.rangs(['EST', 'NORD', 'SUD', 'ZEN'], garde);
  assert.deepEqual([apres.get('NORD'), apres.get('SUD'), apres.get('ZEN')], [1, 7, 3], 'une compagnie s’ajoute : les autres ne bougent pas');
  assert.equal(apres.get('EST'), 1, 'la nouvelle prend sa couleur automatique');
});

test('la pastille porte le nom jusqu’à quatre caractères ; au-delà, ses deux premières lettres en capitales', () => {
  assert.equal(PA.court('NORD'), '', 'quatre caractères : le nom lui-même');
  assert.equal(PA.court('ZEN'), '');
  assert.equal(PA.court('Éole'), '');
  assert.equal(PA.court('OUEST'), 'OU');
  assert.equal(PA.court('Ciel Charter'), 'CI');
  assert.equal(PA.court('éole air'), 'ÉO');
  assert.equal(PA.court('  a2 fret  '), 'A2', 'un chiffre compte comme une lettre ; les espaces autour ne comptent pas');
  assert.equal(PA.court('L’Envol'), 'LE', 'une apostrophe n’est pas une lettre');
});

const connu = PA.connu(['NORD', 'SUD', 'CIEL CHARTER'], [
  { cabine: 'BC', nom: 'Business' }, { cabine: 'CREW', nom: 'Équipage' }, { cabine: 'SPML', nom: 'Repas spéciaux' }
]);
const formes = t => { const p = PA.lire(t, connu); return p && p.map(x => x.genre + ':' + x.texte); };

test('un texte qui nomme une compagnie ou une commande, à lui seul, se découpe sans perdre un caractère', () => {
  assert.deepEqual(formes('NORD'), ['cie:NORD']);
  assert.deepEqual(formes('  nord '), ['texte:  ', 'cie:nord', 'texte: '], 'les espaces autour restent, la casse du texte aussi');
  assert.deepEqual(formes('Ciel Charter'), ['cie:Ciel Charter']);
  assert.deepEqual(formes('NORD · Business'), ['cie:NORD', 'lien: · ', 'classe:Business']);
  assert.deepEqual(formes('CIEL CHARTER · Repas spéciaux'), ['cie:CIEL CHARTER', 'lien: · ', 'classe:Repas spéciaux']);
  assert.deepEqual(formes('NORD BC'), ['cie:NORD', 'lien: ', 'classe:BC'], 'la forme courte d’une fiche d’équipe');
  assert.deepEqual(formes('SUD/SPML'), ['cie:SUD', 'lien:/', 'classe:SPML'], 'l’identifiant d’une commande retirée');
  assert.deepEqual(formes('SUD · Équipage →'), ['cie:SUD', 'lien: · ', 'classe:Équipage', 'texte: →'], 'une flèche de lien suit la commande');
  assert.deepEqual(formes('SUD →'), ['cie:SUD', 'texte: →'], 'la flèche suit aussi une compagnie seule');
  assert.deepEqual(formes(' NORD BC ↺ '), ['texte: ', 'cie:NORD', 'lien: ', 'classe:BC', 'texte: ↺ ']);
  assert.deepEqual(formes('NORD · 6 classes'), ['cie:NORD', 'texte: · 6 classes'], 'ce qui suit la compagnie sans être une classe reste du texte');
  assert.deepEqual(formes('NORD · Armement'), ['cie:NORD', 'texte: · Armement']);
  for (const t of ['NORD', 'NORD · Business', 'SUD · Équipage →', '  nord ', 'NORD · 6 classes', 'SUD/SPML', 'SUD →', ' NORD BC ↺ '])
    assert.equal(PA.lire(t, connu).map(x => x.texte).join(''), t, 'le texte lu ne change pas : « ' + t + ' »');
  const p = PA.lire('nord · Business', connu);
  assert.deepEqual([p[0].cle, p[2].cabine], ['NORD', 'BC'], 'la compagnie se reconnaît sans la casse, la classe donne sa cabine');
});

test('une phrase, une énumération, une compagnie inconnue : rien n’est habillé', () => {
  for (const t of ['', '   ', 'NORD et SUD', 'NORD · Business, NORD · Équipage', 'NORD · Business + SUD · Business', 'EST', 'EST · Business',
    'NORDIQUE', 'Business', 'BC', 'ZEN · Économie n’est préparée par aucune équipe.', 'Le chemin de NORD · Business', 'NORD BC, NORD PC, SUD BC… (5)'])
    assert.equal(PA.lire(t, connu), null, '« ' + t + ' »');
});

test('le nom d’une classe, seul, ne se lit que là où la page nomme une commande sous sa compagnie', () => {
  const p = PA.lire('Business', connu, { classeSeule: true });
  assert.deepEqual(p.map(x => x.genre + ':' + x.texte), ['classe:Business']);
  assert.equal(p[0].cabine, 'BC');
  assert.equal(PA.lire('Affaires', connu, { classeSeule: true }), null, 'un mot qui n’est pas une classe de l’unité');
  assert.equal(PA.lire('NORD', connu, { classeSeule: true })[0].genre, 'cie');
});

test('les choix se gardent dans une entrée à part, validée avant d’être lue', () => {
  assert.equal(PA.CLE, 'ory-couleurs-compagnies-v1');
  const env = PA.enveloppe({ NORD: 3, PARTIE: 12 });
  assert.deepEqual(env, { schema: 'ory-couleurs-compagnies', version: 1, couleurs: { NORD: 3, PARTIE: 12 } });
  assert.deepEqual(PA.lireEnveloppe(JSON.parse(JSON.stringify(env))), { NORD: 3, PARTIE: 12 });
  assert.deepEqual(PA.lireEnveloppe({ schema: 'ory-couleurs-compagnies', version: 1, couleurs: {} }), {});
  const refus = [
    [null, /couleurs des compagnies/], [[], /couleurs des compagnies/], [{ schema: 'autre', version: 1, couleurs: {} }, /ory-couleurs-compagnies/],
    [{ schema: 'ory-couleurs-compagnies', version: 2, couleurs: {} }, /version 2/],
    [{ schema: 'ory-couleurs-compagnies', version: 1 }, /manquent/],
    [{ schema: 'ory-couleurs-compagnies', version: 1, couleurs: [] }, /manquent/],
    [{ schema: 'ory-couleurs-compagnies', version: 1, couleurs: {}, teinte: '#fff' }, /champ inconnu « teinte »/],
    [{ schema: 'ory-couleurs-compagnies', version: 1, couleurs: { NORD: 13 } }, /NORD.*1 à 12/],
    [{ schema: 'ory-couleurs-compagnies', version: 1, couleurs: { NORD: '#39778B' } }, /NORD.*1 à 12/],
    [{ schema: 'ory-couleurs-compagnies', version: 1, couleurs: { ' ': 2 } }, /sans nom/]
  ];
  for (const [x, attendu] of refus) assert.throws(() => PA.lireEnveloppe(x), attendu, JSON.stringify(x));
  assert.throws(() => PA.enveloppe({ NORD: 0 }), /1 à 12/, 'un rang invalide ne s’enregistre pas');
});

test('le calcul ne lit pas les couleurs : une sauvegarde qui les porte rend le même résultat, champ par champ', () => {
  const sans = F.sauvegardeFictive(), avec = F.sauvegardeFictive();
  avec.contenu[PA.CLE] = PA.enveloppe({ NORD: 9, SUD: 2, PARTIE: 5 });
  const a = F.heureDuPicAttendue(sans, F.volsCsv()), b = F.heureDuPicAttendue(avec, F.volsCsv());
  // Le résultat porte des fonctions : il se compare écrit, comme une page le lit.
  const ecrit = x => JSON.stringify(x);
  assert.equal(ecrit(b.args), ecrit(a.args), 'les mêmes arguments de calcul');
  assert.equal(ecrit(b.resultat), ecrit(a.resultat), 'le même résultat');
  assert.equal(ecrit(b.k), ecrit(a.k), 'les mêmes indicateurs');
  assert.ok(ecrit(a.resultat).length > 1000, 'un vrai résultat');
});

test('aucune teinte dans le module : la couleur d’une compagnie est un rang, la feuille seule connaît les teintes', () => {
  const source = lire('pastilles.js');
  assert.equal(/#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/.test(source), false);
  const css = lire('visuel.css');
  for (let i = 1; i <= PA.NOMBRE; i++) assert.ok(css.includes('--pa-' + i + ':'), 'visuel.css : --pa-' + i);
});

test('pastilles.js n’est chargé que par la version 1, avant sim.js', () => {
  const scripts = f => [...lire(f).matchAll(/<script[^>]*\bsrc="([^"?]+)/g)].map(m => m[1]);
  const index = scripts('index.html');
  assert.equal(index.filter(f => f === 'pastilles.js').length, 1, 'index.html le charge une fois');
  assert.ok(index.indexOf('pastilles.js') < index.indexOf('sim.js'), 'avant sim.js, qui le branche');
  for (const page of ['v2/index.html', 'accueil.html', 'secours.html', 'v2/secours.html']) assert.equal(scripts(page).includes('pastilles.js'), false, page);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'v2', 'pastilles.js')), false, 'pas de jumeau en v2');
});
