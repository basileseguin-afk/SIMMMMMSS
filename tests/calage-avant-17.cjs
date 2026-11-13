/* Le rapport d'un calage sans ce que l'évolution 17 lui ajoute, pour le
 * comparer aux références figées avant elle (tests/sigma-unite.attendu.json,
 * tests/reel-complet.attendu.json).
 * Partie (a) : les quatre candidats du catalogue (« puissance »,
 * « logarithme », « plancher », « plafond »), la formule en clair de chaque
 * modèle, le choix de chaque candidat accepté, le nombre de candidats essayés
 * et le seuil corrigé. La raison du test de Wilcoxon dit maintenant ce seuil,
 * et sa p-valeur à quatre décimales : on compare son verdict et sa référence,
 * pas ces chiffres.
 * Partie (b) : le statut d'une ligne, ce que dit sa formule (`lecture`) et le
 * rythme des jours chargés, dans le rapport, la politique et le prévu ; les
 * heures et les heures supp de chaque jour d'une ligne, dans la comparaison.
 * Tout le reste doit être égal, champ par champ. */
const { ORDRE } = require('../moteur/calage-formes.js');

/** « accepté : Wilcoxon contre « constante », p … (par mois) » : sans la p-valeur ni le seuil. */
const raisonSansSeuil = r => String(r).replace(/p (=|<) [\d,]+/, 'p …').replace(/ ; seuil [^)]*\)$/, ')');

/** Le rapport (ory-calage-rapport) d'avant l'évolution 17 : une copie, sans ses ajouts. */
function sansEvolution17(rapport) {
  const y = JSON.parse(JSON.stringify(rapport));
  for (const l of y.lignes || []) {
    delete l.essayes; delete l.seuil; delete l.statut; delete l.lecture; delete l.rythmeCharge;
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

/** La comparaison (ory-comparaison) d'avant : sans les heures ni les heures supp de chaque jour d'une ligne. */
function comparaisonSansEvolution17(comparaison) {
  const y = JSON.parse(JSON.stringify(comparaison));
  for (const l of y.lignes || []) for (const j of l.jours || []) { delete j.heures; delete j.heuresSupp; }
  return y;
}

/** La politique d'effectif d'avant : sans le statut ni le rythme des jours chargés de ses lignes. */
function politiqueSansEvolution17(politique) {
  const y = JSON.parse(JSON.stringify(politique));
  for (const l of y.lignes || []) { delete l.statut; delete l.rythmeCharge; }
  return y;
}

/** Le prévu calé d'avant : sans la formule ni le statut de ses lignes, ni le besoin « au plus » de ses jours. */
function prevuSansEvolution17(prevu) {
  const y = JSON.parse(JSON.stringify(prevu));
  for (const l of y.lignes || []) { delete l.formule; delete l.statut; delete l.nomStatut; delete l.lecture; for (const j of l.jours || []) delete j.besoinAuPlus; }
  for (const j of y.unite || []) delete j.besoinAuPlus;
  return y;
}

module.exports = { sansEvolution17, raisonSansSeuil, comparaisonSansEvolution17, politiqueSansEvolution17, prevuSansEvolution17 };
