/* ==========================================================================
 *  LES MESSAGES DU MOTEUR, AVEC LES MOTS DE LA PAGE (version 1, évolution 19 a)
 *  Le moteur (moteur/production.js, le calage sur le réel) ne change pas : ses
 *  résultats restent identiques, champ par champ, et les outils les rendent
 *  tels quels. Mais quelques-uns de ses messages disent encore « atelier »,
 *  « case » ou « barème ». La page et le classeur du calage les écrivent avec
 *  les mots de la version 1 — « équipe », « temps par vol » : ce module
 *  réécrit ces phrases-là, au moment d'afficher, et garde le message du
 *  moteur pour l'export de la journée.
 * ==========================================================================*/
(function (root) {
  'use strict';
  /** Les phrases du moteur qui portent un ancien mot → celles de la page. */
  const PHRASES = Object.freeze([
    [/Liste d’ateliers attendue\./g, 'Liste d’équipes attendue.'],
    [/(?<![\wÀ-ÿ])atelier sans nom(?![\wÀ-ÿ])/g, 'équipe sans nom'],
    [/Atelier invalide\./g, 'Équipe invalide.'],
    [/ce que fabrique cet atelier ne serait attendu par personne/g, 'ce que fabrique cette équipe ne serait attendu par personne'],
    [/Un service, une commande, une case\./g, 'Un service, une commande, une équipe.'],
    [/ : aucun barème pour «/g, ' : aucun temps par vol pour «'],
    [/, sa durée est nulle tant qu’il n’est pas renseigné\./g, ', sa durée est nulle tant qu’ils ne sont pas renseignés.'],
    [/ en temps nul\. Renseignez le barème\./g, ' en temps nul. Renseignez les temps par vol.'],
    // Le calage sur le réel (moteur/calage-formes.js, calage-statut.js, calage-periode.js) : ses formules, ses statuts.
    [/(?<![\wÀ-ÿ])travail au barème(?![\wÀ-ÿ])/g, 'travail compté aux temps par vol'],
    [/ ETP au barème\)/g, ' ETP aux temps par vol)'],
    [/ ne vient pas du barème(?![\wÀ-ÿ])/g, ' ne vient pas des temps par vol'],
    [/ ne suit pas le barème \(/g, ' ne suit pas les temps par vol (']
  ]);

  /** Un message du moteur, avec les mots de la page. Un texte sans ancien mot est rendu tel quel. */
  const dire = texte => (typeof texte === 'string' ? PHRASES.reduce((t, [motif, par]) => t.replace(motif, par), texte) : texte);

  /**
   * Le résultat d'une journée, à afficher : le même objet quand aucun message ne change ; sinon une copie dont les
   * anomalies touchées portent le message de la page, et gardent celui du moteur dans `messageDuMoteur`.
   */
  function avecLesMotsDeLaPage(resultat) {
    if (!resultat || !Array.isArray(resultat.anomalies)) return resultat;
    let change = false;
    const anomalies = resultat.anomalies.map(a => {
      if (!a || typeof a.message !== 'string') return a;
      const message = dire(a.message);
      if (message === a.message) return a;
      change = true;
      return { ...a, message, messageDuMoteur: a.message };
    });
    return change ? { ...resultat, anomalies } : resultat;
  }

  /** Une anomalie telle que le moteur l'a rendue (pour l'export de la journée) : son message d'origine, sans champ de plus. */
  function duMoteur(anomalie) {
    if (!anomalie || anomalie.messageDuMoteur === undefined) return anomalie;
    const { messageDuMoteur, ...reste } = anomalie;
    return { ...reste, message: messageDuMoteur };
  }

  const api = { PHRASES, dire, avecLesMotsDeLaPage, duMoteur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyMotsMoteur = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
