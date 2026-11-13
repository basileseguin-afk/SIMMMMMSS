/* ==========================================================================
 *  L'ORDRE DES SERVICES, DE L'AMONT VERS L'AVAL
 *  (version 1, correction 17 b — docs/CAHIER_DES_CHARGES.md, § 6 bis)
 *  ------------------------------------------------------------------------
 *  Un seul ordre, tiré de tous les chemins à la fois, pour le tableau de la
 *  Synthèse, les groupes du planning des équipes et les colonnes de la page
 *  Période :
 *    — un service vient après tous ceux qui l'alimentent, dans n'importe
 *      quel chemin (chaque lien « de → vers » de chaque chemin) ;
 *    — à égalité, l'ordre du premier chemin où il apparaît (l'ordre de ses
 *      cases) : un amont venu d'un autre chemin se place juste avant lui ;
 *    — les services hors chemin (permanents, appui) à la fin, dans l'ordre
 *      des équipes ;
 *    — une boucle ne bloque pas : ses services forment un bloc, rangés entre
 *      eux dans l'ordre du premier chemin ; ce qui alimente la boucle reste
 *      avant elle, ce qu'elle alimente après.
 *  Ce module, sans navigateur, ne lit que les chemins, comme le moteur les lit
 *  (moteur/production.js : `servicesDuParcours`, `arcsDuParcours`, l'ancienne
 *  écriture en branches comprise), et ne change rien.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./production.js') : root.MoteurProduction);

  /** Les cases de tous les chemins, dans l'ordre du premier chemin où chacune apparaît, et leurs liens : case → ses avals. */
  function graphe(chemins) {
    const aval = new Map();
    for (const c of chemins) for (const n of P().servicesDuParcours(c)) if (!aval.has(n)) aval.set(n, new Set());
    for (const c of chemins) for (const a of P().arcsDuParcours(c)) if (aval.has(a.from) && aval.has(a.to)) aval.get(a.from).add(a.to);
    return aval;
  }

  /** Ce que chaque case atteint en suivant les liens. */
  function atteintes(aval) {
    const out = new Map();
    for (const n of aval.keys()) {
      const vus = new Set(), pile = [...aval.get(n)];
      while (pile.length) { const x = pile.pop(); if (!vus.has(x)) { vus.add(x); pile.push(...aval.get(x)); } }
      out.set(n, vus);
    }
    return out;
  }

  /**
   * Les blocs : une case seule, ou les cases d'une boucle (chacune atteint l'autre). Rend { bloc (case → le premier de son
   * bloc), membres (premier → ses cases, dans l'ordre du premier chemin), amonts (premier → les blocs qui l'alimentent) }.
   */
  function blocs(aval) {
    const cases = [...aval.keys()], atteint = atteintes(aval), bloc = new Map(), membres = new Map(), amonts = new Map();
    for (const n of cases) {
      // Les cases sont parcourues dans l'ordre du premier chemin : la première d'une boucle en devient le repère.
      const premier = cases.find(m => m === n || (atteint.get(n).has(m) && atteint.get(m).has(n)));
      bloc.set(n, premier);
      if (!membres.has(premier)) { membres.set(premier, []); amonts.set(premier, new Set()); }
      membres.get(premier).push(n);
    }
    for (const [de, vers] of aval) for (const v of vers) if (bloc.get(de) !== bloc.get(v)) amonts.get(bloc.get(v)).add(bloc.get(de));
    return { bloc, membres, amonts };
  }

  /**
   * L'ordre des services. `parcours` : les chemins ([{ noeuds, liens: [{ de, vers }] }]) ; `services` (facultatif) : les
   * services à ordonner — ceux des chemins d'abord, dans leur ordre, puis les autres (hors chemin), dans l'ordre donné. Sans
   * `services` : toutes les cases des chemins. Sans chemin : `services`, tel quel.
   */
  function ordreDesServices(parcours, services) {
    const aval = graphe(Array.isArray(parcours) ? parcours : []), cases = [...aval.keys()], b = blocs(aval);
    const rang = new Map(cases.map((n, i) => [n, i])), places = new Set(), ordre = [];
    // Chaque bloc à la place de sa première case dans le premier chemin, ses amonts juste avant lui (entre blocs, plus de boucle).
    const placer = premier => {
      if (places.has(premier)) return;
      places.add(premier);
      for (const a of [...b.amonts.get(premier)].sort((x, y) => rang.get(x) - rang.get(y))) placer(a);
      ordre.push(...b.membres.get(premier));
    };
    for (const n of cases) placer(b.bloc.get(n));
    if (!Array.isArray(services)) return ordre;
    const voulus = new Set(services);
    return ordre.filter(n => voulus.has(n)).concat([...voulus].filter(n => !rang.has(n)));
  }

  /** Des chemins qui disent quelque chose : au moins une case (un chemin vide ou illisible n'ordonne rien). */
  const avecCases = parcours => Array.isArray(parcours) && parcours.some(c => P().servicesDuParcours(c).length > 0);

  const api = { ordreDesServices, avecCases };
  if (enNode) module.exports = api;
  else root.OrlyOrdreServices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
