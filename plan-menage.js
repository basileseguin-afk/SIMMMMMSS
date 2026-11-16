/* ==========================================================================
 *  LES STOCKAGES VIDES DU PLAN (version 1, évolution 19 c — ce qui se supprime)
 *  ------------------------------------------------------------------------
 *  Le plan garde d'anciens stockages « à rattacher » (`unassignedStorages`).
 *  Ceux qui ne sont rattachés à aucune zone ET dont le contenu est vide ne
 *  disent rien : aucun calcul ne les lit. Le panneau ne les liste plus ; ils
 *  sont retirés à la prochaine sauvegarde, et la restauration d'une sauvegarde
 *  qui en porte le dit en une ligne (« n stockages vides retirés du plan »).
 *  Un stockage rattaché à une zone, ou qui dit ce qu'il contient, ne change
 *  pas. Ce module ne touche ni aux zones ni à leurs stockages.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Un stockage à rattacher est vide quand il ne dit pas ce qu'il contient. */
  const estVide = s => !s || typeof s.contenu !== 'string' || !s.contenu.trim();

  /**
   * Le plan sans ses stockages vides non rattachés : { plan, retires }. `plan` est le même objet quand il n'y a rien à
   * retirer ; sinon une copie dont seule la liste `unassignedStorages` change. Un plan illisible est rendu tel quel.
   */
  function sansStockagesVides(plan) {
    const liste = plan && Array.isArray(plan.unassignedStorages) ? plan.unassignedStorages : null;
    if (!liste) return { plan, retires: 0 };
    const gardes = liste.filter(s => !estVide(s)), retires = liste.length - gardes.length;
    return retires ? { plan: { ...plan, unassignedStorages: gardes }, retires } : { plan, retires: 0 };
  }

  /** La phrase de l'avis : « 3 stockages vides retirés du plan » ; vide quand rien n'est retiré. */
  const phrase = n => (n > 0 ? n + (n > 1 ? ' stockages vides retirés du plan' : ' stockage vide retiré du plan') : '');

  const api = { estVide, sansStockagesVides, phrase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPlanMenage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
