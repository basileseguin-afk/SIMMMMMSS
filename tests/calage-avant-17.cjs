/* Le rapport d'un calage sans ce que l'évolution 17 (a) lui ajoute, pour le
 * comparer aux références figées avant elle (tests/sigma-unite.attendu.json,
 * tests/reel-complet.attendu.json) : les quatre candidats du catalogue
 * (« puissance », « logarithme », « plancher », « plafond »), la formule en
 * clair de chaque modèle, le choix de chaque candidat accepté, le nombre de
 * candidats essayés et le seuil corrigé. La raison du test de Wilcoxon dit
 * maintenant ce seuil, et sa p-valeur à quatre décimales : on compare son
 * verdict et sa référence, pas ces chiffres. Tout le reste doit être égal,
 * champ par champ. */
const { ORDRE } = require('../moteur/calage-formes.js');

/** « accepté : Wilcoxon contre « constante », p … (par mois) » : sans la p-valeur ni le seuil. */
const raisonSansSeuil = r => String(r).replace(/p (=|<) [\d,]+/, 'p …').replace(/ ; seuil [^)]*\)$/, ')');

/** Le rapport (ory-calage-rapport) d'avant l'évolution 17 : une copie, sans ses ajouts. */
function sansEvolution17(rapport) {
  const y = JSON.parse(JSON.stringify(rapport));
  for (const l of y.lignes || []) {
    delete l.essayes; delete l.seuil;
    if (l.retenu) delete l.retenu.formule;
    for (const m of Object.values(l.references || {})) delete m.formule;
    if (!l.candidats) continue;
    l.candidats = l.candidats.filter(c => !ORDRE.includes(c.modele));
    for (const c of l.candidats) {
      delete c.formule; delete c.choix;
      if (c.regles && c.regles.wilcoxon) c.regles.wilcoxon.raison = raisonSansSeuil(c.regles.wilcoxon.raison);
    }
  }
  return y;
}

module.exports = { sansEvolution17, raisonSansSeuil };
