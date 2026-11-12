/* Évolution 15 (c) — « Comparer deux essais », rangé selon les cinq questions
 * (comparer-vue.js) : le scénario d'abord, puis combien de personnes, où ça
 * coince, quand les services finissent, ce qui part en retard ; une seule
 * écriture du temps. Deux essais de l'unité fictive. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CV = require('../comparer-vue.js');
const C = require('../comparaison.js');
const R = require('../moteur/reponses.js');
const F = require('./plan-rejoue-fictif.cjs');

/** Un essai retenu, comme la page le retient : la photo de comparaison.js, et ses réponses. */
const essai = csv => {
  const p = F.heureDuPicAttendue(F.sauvegardeFictive(), csv);
  return { ...C.capturer(p.resultat, { source: 'fictif', ateliers: p.args.ateliers, etat: {}, vols: [], reglages: {}, liaisons: [], decalage: 0 }), reponses: R.reponses(p.resultat, p.args) };
};

test('une seule écriture du temps : « 3 h 47 », jamais « 227 min » ; un total d’heures de travail en heures entières', () => {
  assert.equal(CV.ecrireTemps('227 min'), '3 h 47');
  assert.equal(CV.ecrireTemps('▼ −90 min'), '▼ −1 h 30');
  assert.equal(CV.ecrireTemps('45 min'), '45 min');
  assert.equal(CV.ecrireTemps('1 423 min'), '23 h 43');
  assert.equal(CV.ecrireTemps('68,9 h', true), '69 h');
  assert.equal(CV.ecrireTemps('68,9 h'), '68,9 h', 'seulement pour un total d’heures de travail');
});

test('les rubriques, dans l’ordre du contrat ; chaque ligne de comparaison.js trouve sa place', () => {
  const A = essai(F.volsCsv()), B = essai(F.volsSansRetardCsv()), g = CV.rubriques(A, B);
  assert.deepEqual(g.map(x => x.titre), CV.RUBRIQUES);
  const toutes = g.flatMap(x => x.lignes.map(l => l.lib));
  for (const l of C.lignes(A, B)) assert.ok(toutes.includes(l.lib), l.lib);
  // Les réponses : en tête de leurs rubriques.
  assert.equal(g[1].lignes[0].lib, 'Il faut (personnes)');
  assert.equal(g[2].lignes[0].lib, 'Goulot');
  assert.equal(g[3].lignes[0].lib, 'Heures sup (personnes × heures)');
  assert.equal(g[4].lignes[0].lib, 'Exceptions (en retard, pas prêtes, sans équipe)');
  const ex = g[4].lignes[0];
  assert.equal(+ex.b, 0, 'B n’a pas d’exception');
  assert.match(ex.ecart.texte, /^−\d+$/); assert.equal(ex.verdict, 'mieux');
  // Aucune durée en minutes au-delà de 60, aucune heure décimale de travail.
  for (const l of g.flatMap(x => x.lignes)) for (const t of [l.a, l.b, l.ecart && l.ecart.texte]) {
    for (const m of String(t ?? '').matchAll(/(\d+) min\b/g)) assert.ok(+m[1] < 60, l.lib + ' : ' + t);
  }
  assert.doesNotMatch(g[3].lignes.find(l => l.lib === 'Heures de travail').a, /,\d h/);
});

test('sans les réponses des essais : les lignes de comparaison.js seules, rangées', () => {
  const A = essai(F.volsCsv()), B = essai(F.volsCsv());
  delete A.reponses; delete B.reponses;
  const g = CV.rubriques(A, B);
  assert.ok(!g.flatMap(x => x.lignes).some(l => l.lib === 'Goulot'));
  assert.equal(g[0].titre, CV.RUBRIQUES[0]);
});

test('les heures de travail, en heures entières : l’écart et le verdict se lisent sur les nombres affichés', () => {
  const l = (a, b, verdict, texte) => ({ groupe: 'Ce que ça donne', lib: 'Heures de travail', a, b, diff: a !== b, verdict, ecart: { fleche: '▲', texte } });
  const pareil = CV.reecrire(l('68,9 h', '69,2 h', 'moins bien', '+0,3 h'));
  assert.deepEqual([pareil.a, pareil.b, pareil.diff, pareil.verdict, pareil.ecart], ['69 h', '69 h', false, '', null], '69 h des deux côtés : pas d’écart');
  const plus = CV.reecrire(l('68,4 h', '69,6 h', 'moins bien', '+1,2 h'));
  assert.deepEqual([plus.a, plus.b, plus.diff, plus.verdict, plus.ecart.texte], ['68 h', '70 h', true, 'moins bien', '+2 h'], 'l’écart des nombres affichés');
  const moins = CV.reecrire({ ...l('70 h', '65,5 h', 'mieux', '−4,5 h'), ecart: { fleche: '▼', texte: '−4,5 h' } });
  assert.deepEqual([moins.b, moins.ecart.fleche, moins.ecart.texte], ['66 h', '▼', '−4 h']);
});

test('seules les durées se réécrivent : un nom de fichier, un nombre d’unités restent tels quels', () => {
  const vols = CV.reecrire({ groupe: 'Ce qui a changé', lib: 'Vols', a: 'vols 90 min.csv', b: 'autre.csv', diff: true, verdict: '', ecart: null });
  assert.equal(vols.a, 'vols 90 min.csv');
  const attente = CV.reecrire({ groupe: 'Ce que ça donne', lib: 'Temps passé à attendre', a: '227 min', b: '45 min', diff: true, verdict: 'mieux', ecart: { fleche: '▼', texte: '−182 min' } });
  assert.deepEqual([attente.a, attente.b, attente.ecart.texte], ['3 h 47', '45 min', '−3 h 02']);
  const fin = CV.reecrire({ groupe: 'Ce que ça donne', lib: 'Dernière commande prête', a: '18:10', b: '19:15', diff: true, verdict: 'moins bien', ecart: { fleche: '▲', texte: '+65 min' } });
  assert.equal(fin.ecart.texte, '+1 h 05', 'un écart calculé se réécrit sur toutes les lignes');
});
