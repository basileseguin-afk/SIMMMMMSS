/* ==========================================================================
 *  LES SEUILS D'ALERTE (version 1, évolution 15 a)
 *  ------------------------------------------------------------------------
 *  Dans « Réglages de la simulation » : les cinq seuils qui décident de ce
 *  que les résultats signalent (moteur/reponses.js) — un écart de personnes,
 *  l'attente d'un arrivage, l'occupation, la durée maximale d'un stock, le
 *  retard. Gardés dans « ory-seuils-v1 » (sim.js) ; sans eux, les défauts.
 *  Ce module écrit le panneau et lit un champ ; il ne garde rien lui-même.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Un nombre à la française : la virgule décimale. */
  const fr = x => String(x).replace('.', ',');

  /** Ce que chaque seuil déclenche, en une ligne sous son champ. */
  const EFFET = Object.freeze({
    ecartPersonnes: 'Un service est signalé s’il lui manque au moins ce nombre de personnes (un surplus n’est pas une alerte).',
    attenteLot: 'Un arrivage (les lots livrés ensemble) qui attend plus longtemps avant son premier lot se signale ; la plonge est alors en « Bouchon ».',
    occupation: 'Au-delà, l’occupation se signale, et l’attente d’un arrivage est due au manque de personnel.',
    dureeStockMax: 'Vide : aucune alerte de stock.',
    retard: 'Un vol ou une commande en retard d’au moins autant est une exception.'
  });

  /**
   * La valeur d'un champ, telle que le seuil la reçoit : un nombre (la virgule acceptée), null pour un champ vide, sinon
   * le texte tel quel — refusé ensuite par la validation, qui nomme le seuil.
   */
  function lire(texte) {
    const t = String(texte ?? '').trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : t;
  }

  /** Les seuils réglés, un champ par seuil ; `erreur` : la sauvegarde illisible, dite au-dessus (les défauts s'appliquent). */
  function html(seuils, erreur) {
    const S = REP().SEUILS, D = REP().SEUILS_DEFAUT;
    // « 1 personne », « 2 personnes » : l'unité s'accorde au défaut.
    const defaut = s => (D[s.cle] === null ? 'vide' : fr(D[s.cle]) + '\u00a0' + (s.unite === 'personnes' && D[s.cle] <= 1 ? 'personne' : s.unite));
    const champ = s => '<div class="seuil"><label class="at-inline-champ">' + esc(s.nom) + ' <span class="champ-unite"><input type="text" inputmode="decimal"'
      + ' value="' + esc(seuils[s.cle] === null ? '' : fr(seuils[s.cle])) + '" placeholder="' + esc(D[s.cle] === null ? 'vide' : fr(D[s.cle])) + '"'
      + ' data-seuil="' + esc(s.cle) + '" aria-label="' + esc(s.nom + ', en ' + (s.unite === 'min' ? 'minutes' : s.unite)) + '"'
      + ' aria-describedby="seuil-effet-' + esc(s.cle) + '"><span class="unite">' + esc(s.unite) + '</span></span></label>'
      + '<p class="mini-note" id="seuil-effet-' + esc(s.cle) + '">' + esc(EFFET[s.cle]) + ' Défaut : ' + esc(defaut(s)) + '.</p></div>';
    const change = S.some(s => seuils[s.cle] !== D[s.cle]);
    return '<div class="titre-aide"><h3>Seuils d’alerte</h3><details class="aide">'
      + '<summary aria-label="À quoi servent les seuils d’alerte">?</summary>'
      + '<span class="aide-corps">Les résultats répondent à cinq questions : combien de personnes il faut, où ça coince, à quelle heure chaque service '
      + 'finit, ce qui part en retard, ce que change un essai. Une couleur ou une alerte ne s’affiche que si l’un de ces seuils est dépassé. '
      + 'Ils sont gardés avec la sauvegarde complète.</span></details></div>'
      + (erreur ? '<p class="mini-note erreur" role="alert">Seuils enregistrés illisibles (' + esc(erreur) + ') : les défauts s’appliquent.</p>' : '')
      + '<div class="seuils-champs">' + S.map(champ).join('') + '</div>'
      + (change ? '<button type="button" class="btn btn-sm" data-seuils-defaut>Revenir aux défauts</button>' : '');
  }

  const api = { EFFET, lire, html };
  if (enNode) module.exports = api;
  else root.OrlySeuilsVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
