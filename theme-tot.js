/* ==========================================================================
 *  LE THÈME, AVANT TOUT DESSIN — ET LE PREMIER ACCÈS AU STOCKAGE (correction 22, v1)
 *
 *  Le thème choisi (une préférence d'affichage, `ory-ui-theme`) se pose avant
 *  le premier dessin : pas d'éclair clair au chargement. Ce script, appelé en
 *  tête de page, est donc le premier à toucher `localStorage`.
 *
 *  Or un document qui touche son stockage TROP TÔT — avant que le navigateur
 *  ait fini de l'installer — peut se retrouver avec un stockage détaché : il
 *  ne lit rien de ce qui est enregistré, rien de ce qu'il écrit n'est gardé,
 *  et il ne s'en remet pas (docs/BANC_ESSAI.md, § 11 ; `node
 *  outils/banc-stockage.cjs` le mesure). Le site s'ouvrirait vide, et les
 *  réglages de la visite seraient perdus.
 *
 *  Deux précautions, ici :
 *    — ce code est dans un fichier, pas en ligne dans la page : il ne
 *      s'exécute qu'après un aller-retour pour le charger ;
 *    — il lit d'abord `document.cookie`. Cette lecture attend la réponse du
 *      navigateur par la voie du document lui-même : quand elle revient, le
 *      document est installé, et le stockage se raccorde. Elle ne lit ni
 *      n'écrit aucune donnée (le site ne pose aucun témoin).
 *
 *  Règle : aucune page de la version 1 ne touche `localStorage` dans un
 *  script en ligne sans cette lecture juste avant
 *  (tests/stockage-tot.test.cjs).
 * ==========================================================================*/
(function (doc) {
  'use strict';
  try { void doc.cookie; } catch (e) { /* un document sans témoins (bac à sable) : rien à attendre */ }
  try { if (localStorage.getItem('ory-ui-theme') === 'sombre') doc.documentElement.dataset.theme = 'sombre'; }
  catch (e) { /* stockage indisponible : le thème clair */ }
})(document);
