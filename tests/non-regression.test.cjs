/* Les évolutions du banc d'essai (docs/BANC_ESSAI.md) sont des options
 * désactivées par défaut. Désactivées, rien ne change : la page assemble les
 * mêmes arguments, et le moteur rend la même journée, champ par champ — hors
 * les champs que les évolutions ajoutent, déclarés ci-dessous.
 *
 * La référence (tests/non-regression.attendu.json) a été relevée dans la page
 * de la version d'avant ces évolutions (commit 3702d37) : la démo, et deux
 * unités fictives (compagnies NORD, SUD, EST, OUEST) qui passent par tous les
 * types d'équipe — cuisine la veille, prépa, montage à la chaîne, robot et sa
 * ligne, armement par compagnie, règle ⚡, mise à disposition et boutique,
 * équipe hors tunnel, handling par créneaux et camions ou en deux équipes,
 * plonge par vol à deux équipes ou au débit, matériel en boucle, salle
 * annexe, service retiré ou renommé, barème et règle de poste modifiés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../moteur/journee.js');
const REF = require('./non-regression.attendu.json');

/* Les champs nouveaux, là où chaque évolution les ajoute (« * » : une clé
 * quelconque, « [] » : chaque élément d'une liste). */
const NOUVEAUX = {
  // Évolution 1 : le poste de chaque équipe, pour le banc d'essai.
  'ateliers[]': ['debutPoste', 'presence', 'jour']
};
const nouveau = (motif, cle) => Object.entries(NOUVEAUX).some(([m, cles]) => cles.includes(cle)
  && m.split('.').length === motif.split('.').length && m.split('.').every((x, i) => x === '*' || x === motif.split('.')[i]));

/** Les écarts entre la référence et le calcul : un champ changé, disparu, ou ajouté sans être déclaré. */
function ecarts(attendu, obtenu, chemin = '', motif = '', out = []) {
  if (out.length >= 20 || Object.is(attendu, obtenu)) return out;
  const nature = x => (x === null ? 'null' : Array.isArray(x) ? 'liste' : typeof x);
  if (nature(attendu) !== nature(obtenu) || (nature(attendu) !== 'liste' && nature(attendu) !== 'object')) {
    out.push((chemin || '(racine)') + ' : ' + JSON.stringify(attendu) + ' attendu, ' + JSON.stringify(obtenu) + ' obtenu');
    return out;
  }
  if (Array.isArray(attendu)) {
    if (attendu.length !== obtenu.length) out.push(chemin + ' : ' + attendu.length + ' éléments attendus, ' + obtenu.length + ' obtenus');
    for (let i = 0; i < Math.min(attendu.length, obtenu.length); i++) ecarts(attendu[i], obtenu[i], chemin + '[' + i + ']', motif + '[]', out);
    return out;
  }
  for (const k of Object.keys(attendu)) {
    const ici = motif ? motif + '.' + k : k;
    if (!(k in obtenu)) out.push((chemin ? chemin + '.' : '') + k + ' : a disparu');
    else ecarts(attendu[k], obtenu[k], chemin ? chemin + '.' + k : k, ici, out);
  }
  for (const k of Object.keys(obtenu)) if (!(k in attendu) && !nouveau(motif, k))
    out.push((chemin ? chemin + '.' : '') + k + ' : champ nouveau, non déclaré');
  return out;
}
const json = x => JSON.parse(JSON.stringify(x));

for (const s of REF.scenarios) {
  test(s.nom + ' — la sauvegarde donne les arguments que la page passait au moteur', () => {
    assert.deepStrictEqual(json(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options)), s.args);
  });

  test(s.nom + ' — options désactivées, la même journée, champ par champ', () => {
    const e = ecarts(s.resultat, json(J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options))));
    assert.deepEqual(e, [], e.join('\n'));
  });
}

test('le comparateur voit un champ changé, disparu, ou ajouté sans être déclaré', () => {
  assert.deepEqual(ecarts({ a: 1, b: [{ c: 2 }] }, { a: 1, b: [{ c: 2 }] }), []);
  assert.equal(ecarts({ a: 1 }, { a: 2 }).length, 1);
  assert.equal(ecarts({ a: 1, b: 2 }, { a: 1 }).length, 1);
  assert.equal(ecarts({ a: 1 }, { a: 1, z: 0 }).length, 1, 'un champ nouveau doit être déclaré');
  assert.deepEqual(ecarts({ ateliers: [{ id: 'x' }] }, { ateliers: [{ id: 'x', presence: 480 }] }), [], 'déclaré : admis');
  assert.equal(ecarts({ lots: [{ id: 'x' }] }, { lots: [{ id: 'x', presence: 480 }] }).length, 1, 'déclaré ailleurs : refusé');
});
