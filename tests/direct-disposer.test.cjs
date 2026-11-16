/* Évolution 20 (b) — le panneau « Disposer les zones » (direct-disposer.js, v1),
 * sans navigateur : ce qu'il écrit (les colonnes, les rangées du bas, les
 * boutons de chaque zone, ce que le site a à dire), et ce que fait chaque
 * geste sur la disposition (moteur/disposition.js). Zones fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../direct-disposer.js');

const NOMS = { cuisine: 'Cuisine', food: 'FOOD', quais: 'Quais', plonge: 'Plonge', magasin: 'Magasin', mechant: '<b>Méchant</b> & "Cie"' };
const nom = id => NOMS[id] || id;
const D0 = { colonnes: [['magasin', 'cuisine'], ['food'], []], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 3 }] };
const etat = (plus = {}) => ({ disposition: D0, reglee: true, notes: [], nom, ...plus });
const compte = (html, motif) => (html.match(motif) || []).length;

test('le panneau liste les colonnes, de gauche à droite, et les rangées du bas, de haut en bas', () => {
  const h = P.html(etat());
  assert.match(h, /Les zones sont là où vous les avez mises : 3 colonnes, 2 rangées du bas\./);
  assert.deepEqual([...h.matchAll(/<h4>(Colonne \d+)<\/h4>/g)].map(m => m[1]), ['Colonne 1', 'Colonne 2', 'Colonne 3']);
  // Les zones, dans l'ordre : celles des colonnes, puis les rangées.
  assert.deepEqual([...h.matchAll(/<li class="dd-zone[^"]*" draggable="true" tabindex="0" data-dd-zone="([^"]+)"/g)].map(m => m[1]), ['magasin', 'cuisine', 'food', 'plonge', 'quais']);
  // Chaque zone d'une colonne a ses cinq gestes ; au bout, un geste impossible est désactivé.
  const zone = id => h.slice(h.indexOf('data-dd-zone="' + id + '" aria-label'), h.indexOf('</li>', h.indexOf('data-dd-zone="' + id + '" aria-label')));
  const inactifs = id => [...zone(id).matchAll(/data-dd="(\w+)" data-dd-zone="[^"]+" aria-label="[^"]*" title="[^"]*" disabled/g)].map(m => m[1]);
  assert.deepEqual([...zone('cuisine').matchAll(/data-dd="(\w+)"/g)].map(m => m[1]), ['monter', 'descendre', 'gauche', 'droite', 'rangee']);
  assert.deepEqual([inactifs('magasin'), inactifs('cuisine'), inactifs('food')], [['monter', 'gauche'], ['descendre', 'gauche'], ['monter', 'descendre']]);
  assert.match(zone('cuisine'), /aria-label="Cuisine, colonne 1, rang 2"/);
  assert.match(zone('cuisine'), /aria-label="Cuisine : colonne suivante"/);
  assert.match(zone('cuisine'), />En rangée du bas<\/button>/);
  // Une rangée du bas : de quelle colonne à quelle colonne, monter, descendre, « En colonne ».
  assert.deepEqual([...zone('plonge').matchAll(/data-dd="(\w+)"/g)].map(m => m[1]), ['de', 'a', 'monter', 'descendre', 'colonne']);
  assert.match(zone('plonge'), /aria-label="Plonge, rangée du bas 1, de la colonne 1 à la colonne 2"/);
  assert.match(zone('plonge'), /de la colonne <select data-dd="de" data-dd-zone="plonge"><option value="1" selected>1<\/option><option value="2">2<\/option><option value="3">3<\/option><\/select>/);
  assert.match(zone('plonge'), /à la colonne <select data-dd="a" data-dd-zone="plonge"><option value="1">1<\/option><option value="2" selected>2<\/option>/);
  // Ici la colonne 3 est vide : Plonge (1–2) et Quais (1–3) longent les mêmes colonnes pleines, elles peuvent changer de place.
  assert.deepEqual([inactifs('plonge'), inactifs('quais')], [['monter'], ['descendre']]);
  assert.match(h, /La plus large est toujours la plus basse : deux rangées ne changent de place que si elles longent les mêmes colonnes\./);
  // Avec une zone dans la colonne 3, Quais est plus large : la plus large reste la plus basse, leurs boutons sont désactivés.
  const large = P.html(etat({ disposition: { colonnes: [['magasin', 'cuisine'], ['food'], ['mechant']], rangees: D0.rangees } }));
  const de = (page, id) => page.slice(page.indexOf('data-dd-zone="' + id + '" aria-label'), page.indexOf('</li>', page.indexOf('data-dd-zone="' + id + '" aria-label')));
  const eteints = (page, id) => [...de(page, id).matchAll(/data-dd="(monter|descendre)" data-dd-zone="[^"]+" aria-label="[^"]*" title="[^"]*" disabled/g)].map(m => m[1]);
  assert.deepEqual([eteints(large, 'plonge'), eteints(large, 'quais')], [['monter', 'descendre'], ['monter', 'descendre']]);
  // Une colonne vide se retire ; une colonne qui a une zone, non. « Ajouter une colonne », « Revenir à la disposition automatique ».
  assert.equal(compte(h, /data-dd="retirer"/g), 1);
  assert.match(h, /Vide\. <button type="button" class="btn btn-mini" data-dd="retirer" data-dd-colonne="2">Retirer cette colonne vide<\/button>/);
  assert.match(h, /<button type="button" class="btn btn-sm" data-dd="ajouter">Ajouter une colonne<\/button>/);
  assert.match(h, /<button type="button" class="btn btn-sm" data-dd="automatique">Revenir à la disposition automatique<\/button>/);
  // Les dépôts du glisser-déposer : un par colonne, un pour les rangées.
  assert.deepEqual([...h.matchAll(/data-dd-depot="(\w+)"/g)].map(m => m[1]), ['0', '1', '2', 'rangees']);
});

test('automatique : le panneau le dit, montre d’où l’on part, et « Revenir à l’automatique » n’a rien à faire', () => {
  const h = P.html(etat({ reglee: false, disposition: { colonnes: [['magasin'], ['cuisine', 'food']], rangees: [] } }));
  assert.match(h, /Disposition automatique : deux bandes, dans l’ordre du chemin\. Déplacez une zone pour la régler/);
  assert.match(h, /data-dd="automatique" disabled>/);
  assert.match(h, /Aucune : chaque colonne descend jusqu’en bas du site\./);
});

test('ce que le site a à dire, en phrases ; un nom venu d’un fichier est échappé', () => {
  const notes = [{ code: 'absente', zone: 'cuisine' }, { code: 'double', zone: 'food' }, { code: 'inconnue', zone: 'disparu' }, { code: 'reduite', zone: 'plonge', de: 2, a: 3 },
    { code: 'reduite', zone: 'quais', de: 2, a: 2 }, { code: 'boucle', services: ['cuisine', 'magasin'] }, { code: 'inconnu', service: 'cuisine', hote: 'disparu' }, { code: 'autre' },
    { code: 'niveaux', zone: 'plonge' }];
  assert.deepEqual(P.phrases(notes, nom), [
    'Cuisine n’était pas dans la disposition : rangée à la fin de la dernière colonne.',
    'FOOD est citée deux fois : sa première place est gardée, l’autre ignorée.',
    'La disposition cite « disparu », qui n’est plus une zone du site : ignoré.',
    'La rangée de Plonge croise une autre rangée du bas : elle ne longe que les colonnes 2 à 3.',
    'La rangée de Quais croise une autre rangée du bas : elle ne longe que la colonne 2.',
    'Des zones partagées font une boucle (Cuisine → Magasin → Cuisine) : ces réglages ne jouent pas.',
    'Cuisine partage la zone d’un service qui n’existe plus : ce réglage ne joue pas.',
    'La rangée de Plonge ferait un cinquième niveau de rangées emboîtées : elle est rangée à la fin de la dernière colonne.']);
  assert.deepEqual(P.phrases(null, nom), []);
  const h = P.html(etat({ notes: P.phrases(notes.slice(0, 2), nom) }));
  assert.match(h, /<ul class="dd-notes" role="status"><li>Cuisine n’était pas dans la disposition[^<]*<\/li><li>FOOD est citée deux fois[^<]*<\/li><\/ul>/);
  // L'échappement : le nom d'une zone n'entre jamais tel quel dans la page.
  const m = P.html(etat({ disposition: { colonnes: [['mechant']], rangees: [] }, notes: ['<script>x</script>'] }));
  assert.equal(m.includes('<b>Méchant</b>'), false);
  assert.match(m, /&lt;b&gt;Méchant&lt;\/b&gt; &amp; &quot;Cie&quot;/);
  assert.match(m, /<li>&lt;script&gt;x&lt;\/script&gt;<\/li>/);
});

test('chaque geste règle la disposition, et dit ce qu’il a fait ; un geste sans effet ne règle rien', () => {
  const faire = (g, d = D0) => P.appliquer(d, g, nom);
  // Monter, descendre.
  assert.deepEqual(faire({ quoi: 'monter', zone: 'cuisine' }), { disposition: { colonnes: [['cuisine', 'magasin'], ['food'], []], rangees: D0.rangees }, dit: 'Cuisine monte d’un rang.' });
  assert.equal(faire({ quoi: 'monter', zone: 'magasin' }), null);
  assert.equal(faire({ quoi: 'descendre', zone: 'magasin' }).dit, 'Magasin descend d’un rang.');
  // Colonne précédente, colonne suivante.
  assert.deepEqual(faire({ quoi: 'droite', zone: 'cuisine' }), { disposition: { colonnes: [['magasin'], ['food', 'cuisine'], []], rangees: D0.rangees }, dit: 'Cuisine : dans la colonne 2.' });
  assert.equal(faire({ quoi: 'gauche', zone: 'cuisine' }), null);
  assert.equal(faire({ quoi: 'gauche', zone: 'food' }).dit, 'FOOD : dans la colonne 1.');
  // En rangée du bas ; de quelle colonne à quelle colonne ; de nouveau en colonne (la première qu'elle longeait).
  const r = faire({ quoi: 'rangee', zone: 'food' });
  assert.deepEqual([r.disposition.colonnes, r.dit], [[['magasin', 'cuisine'], [], []], 'FOOD : en rangée du bas.']);
  assert.ok(r.disposition.rangees.some(x => x.zone === 'food'));
  assert.deepEqual(faire({ quoi: 'a', zone: 'plonge', valeur: 1 }).disposition.rangees.find(x => x.zone === 'plonge'), { zone: 'plonge', de: 1, a: 1 });
  assert.equal(faire({ quoi: 'a', zone: 'plonge', valeur: 1 }).dit, 'Plonge longe la colonne 1.');
  assert.equal(faire({ quoi: 'de', zone: 'quais', valeur: 2 }).dit, 'Quais longe les colonnes 2 à 3.');
  assert.equal(faire({ quoi: 'a', zone: 'plonge', valeur: 2 }), null, 'la même valeur : rien');
  const c = faire({ quoi: 'colonne', zone: 'quais' });
  assert.deepEqual([c.disposition.colonnes[0], c.disposition.rangees.map(x => x.zone), c.dit], [['magasin', 'cuisine', 'quais'], ['plonge'], 'Quais : dans la colonne 1.']);
  // Ajouter une colonne ; retirer une colonne vide (pas une colonne qui a une zone).
  assert.deepEqual([faire({ quoi: 'ajouter' }).disposition.colonnes.length, faire({ quoi: 'ajouter' }).dit], [4, 'Une colonne de plus : la colonne 4.']);
  assert.deepEqual([faire({ quoi: 'retirer', colonne: '2' }).disposition.colonnes, faire({ quoi: 'retirer', colonne: '2' }).dit], [[['magasin', 'cuisine'], ['food']], 'La colonne vide 3 est retirée.']);
  assert.equal(faire({ quoi: 'retirer', colonne: '0' }), null);
  // Un glisser-déposer : dans une colonne, à un rang ; parmi les rangées du bas.
  assert.deepEqual(faire({ quoi: 'poser', zone: 'food', colonne: '0', rang: 1 }).disposition.colonnes, [['magasin', 'food', 'cuisine'], [], []]);
  assert.deepEqual(faire({ quoi: 'poser', zone: 'cuisine', colonne: '2' }).disposition.colonnes, [['magasin'], ['food'], ['cuisine']]);
  assert.equal(faire({ quoi: 'poser', zone: 'cuisine', colonne: '2' }).dit, 'Cuisine : dans la colonne 3.');
  assert.equal(faire({ quoi: 'poser', zone: 'cuisine', colonne: 'rangees' }).dit, 'Cuisine : en rangée du bas.');
  assert.equal(faire({ quoi: 'poser', zone: 'quais', colonne: 'rangees' }), null, 'une rangée lâchée parmi les rangées : rien');
  assert.equal(faire({ quoi: 'poser', zone: 'magasin', colonne: '0', rang: 0 }), null, 'à sa propre place : rien');
  // Une zone inconnue, un geste inconnu : rien.
  assert.equal(faire({ quoi: 'monter', zone: 'inconnue' }), null);
  assert.equal(faire({ quoi: 'danser', zone: 'cuisine' }), null);
  // La disposition donnée n'est pas touchée.
  assert.deepEqual(D0, { colonnes: [['magasin', 'cuisine'], ['food'], []], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 3 }] });
});
