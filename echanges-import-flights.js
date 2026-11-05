/* ==========================================================================
 *  LE CLASSEUR DU RAPPORT D'IMPORT WINREST (banc d'essai de la version 1,
 *  évolution 13 — docs/BANC_ESSAI.md § 14, docs/FORMATS_EXCEL.md § 7)
 *  ------------------------------------------------------------------------
 *  Le même classeur depuis la page (Vols › Programme des vols, « Export
 *  Winrest (Flights) ») et depuis l'outil (outils/importer-flights.cjs
 *  --xlsx) : le Lisez-moi (le fichier, la période, les totaux, les
 *  définitions), puis une feuille par liste du rapport. Ce module écrit des
 *  feuilles ; tableur.js en fait le fichier ; classeur-compresse.js le
 *  compresse. Aucun prix : le rapport n'en a pas.
 *
 *  ⚠ Le rapport d'un export réel contient les vols réels de l'unité : il ne
 *  va jamais dans le dépôt (`.gitignore` refuse les classeurs).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const T = () => (enNode ? require('./tableur.js') : root.OrlyTableur);
  const dateFr = d => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  const date = d => (d ? T().celluleDate(d) : '');
  const feuille = (nom, lignes, figer) => ({ nom, lignes, filtres: lignes.length > 1, figerColonnes: figer });
  const REPAS = ['BC', 'PC', 'YC', 'CREW', 'SPML_BC', 'SPML_PC', 'SPML_YC'];
  const TETE_REPAS = ['BC', 'PC', 'YC', 'CREW', 'SPML BC', 'SPML PC', 'SPML YC'];

  /** Les totaux du rapport, en lignes « libellé, valeur » : la page et le Lisez-moi disent les mêmes. */
  function totaux(r) {
    const p = r.periode, ecartees = r.ecartees.length;
    return [
      ['Fichier', r.fichier || ''],
      ['Période couverte', p ? 'du ' + dateFr(p.debut) + ' au ' + dateFr(p.fin) + ' (' + p.jours + (p.jours > 1 ? ' jours)' : ' jour)') : 'aucune date'],
      ['Lignes lues', r.lignes],
      ['Livraisons', r.livraisons],
      ...Object.entries(r.parStatut).map(([s, n]) => ['  au statut « ' + s + ' »', n]),
      ['Vols gardés (acceptés)', r.vols],
      ['Livraisons écartées (rejetées)', ecartees],
      ...Object.entries(r.parMotif).map(([m, n]) => ['  ' + m, n]),
      ['Points à vérifier (ambigus)', r.aVerifier.length],
      ['Guest types ignorés', r.typesIgnores.length],
      ['Réserves fondues', r.reservesFondues.length],
      ['vol_id suffixés', r.suffixes.length],
      ['Vols fictifs créés', r.fictifs.length],
      ...(r.fictifs.some(x => !x.auProgramme) ? [['  à 0, hors du programme', r.fictifs.filter(x => !x.auProgramme).length]] : [])
    ];
  }

  /** Les feuilles du classeur : le Lisez-moi, puis une feuille par liste. */
  function feuillesDuRapport(r) {
    const lisez = [['Rapport d’import de l’export Winrest (Flights)', ''], ...totaux(r), ['', ''],
      ['Acceptées', 'les vols gardés : feuille « Par jour », par jour et par compagnie, avec leurs repas par classe.'],
      ['Ambiguës', 'les points à vérifier (une valeur qui change d’une ligne à l’autre d’une livraison : la première ligne compte), et à côté les Guest types ignorés, les réserves fondues, les vol_id suffixés.'],
      ['Rejetées', 'les livraisons écartées, avec leur motif : statut exclu, ICAO exclu, Flight No exclu, sans repas, réserve sans vol.'],
      ['Prix', 'aucun : les prix et montants de l’export ne sont ni lus, ni gardés.']];
    return [
      feuille('Lisez-moi', lisez),
      feuille('Par jour', [['Date', 'Compagnie', 'Vols', ...TETE_REPAS], ...r.parJour.map(x => [date(x.date), x.compagnie, x.vols, ...REPAS.map(c => x[c])])], 2),
      feuille('Écartées', [['Date', 'Flight No', 'Delivery No', 'Motif'], ...r.ecartees.map(x => [date(x.date), x.flightNo, x.deliveryNo, x.motif])], 2),
      feuille('À vérifier', [['Date', 'Flight No', 'Delivery No', 'À vérifier'], ...r.aVerifier.map(x => [date(x.date), x.flightNo, x.deliveryNo, x.quoi])], 2),
      feuille('Types ignorés', [['Guest type', 'Quantité', 'Livraisons'], ...r.typesIgnores.map(x => [x.guestType, x.quantite, x.livraisons])], 1),
      feuille('Réserves fondues', [['Date', 'Flight No', 'Delivery No', 'Fondue dans', ...TETE_REPAS],
        ...r.reservesFondues.map(x => [date(x.date), x.flightNo, x.deliveryNo, x.vers, ...REPAS.map(c => x.repas[c])])], 2),
      feuille('vol_id suffixés', [['Date', 'Flight No', 'Delivery No', 'vol_id'], ...r.suffixes.map(x => [date(x.date), x.flightNo, x.deliveryNo, x.volId])], 2),
      feuille('Vols fictifs', [['Date', 'vol_id', 'Flight No', 'Quantité', 'Classe', 'Au programme'],
        ...r.fictifs.map(x => [date(x.date), x.volId, x.flightNo, x.quantite, x.classe, x.auProgramme ? 'oui' : 'non, à 0'])], 2)
    ];
  }

  /** Le classeur du rapport, en octets (non compressé ; classeur-compresse.js le compresse). */
  function classeurDuRapport(r) { return T().ecrireClasseur(feuillesDuRapport(r)); }

  const api = { totaux, feuillesDuRapport, classeurDuRapport };
  if (enNode) module.exports = api;
  else root.OrlyEchangesWinrest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
