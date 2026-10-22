/* ==========================================================================
 *  LA PÉRIODE — un programme de vols daté, joué jour après jour
 *  (banc d'essai de la version 1, évolution 10 — docs/BANC_ESSAI.md § 9)
 *  ------------------------------------------------------------------------
 *  Le site simulait une seule journée. Un programme de vols daté (colonne
 *  `date`) couvre une période : du premier au dernier jour, chaque jour se
 *  joue avec ses seuls vols, dans l'ordre, et ce qui reste le soir passe au
 *  lendemain. Ce module, sans navigateur, sert à l'outil
 *  (outils/simuler-periode.cjs) comme à la page : un seul chemin de calcul.
 *
 *  Les dates sont des jours du calendrier, « AAAA-MM-JJ » ; les heures d'une
 *  journée restent des minutes depuis son 00:00 (négatives : la veille).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const JOUR = 86400000;
  const versUTC = d => { const [a, m, j] = String(d).split('-').map(Number); return Date.UTC(a, m - 1, j); };
  const enIso = t => new Date(t).toISOString().slice(0, 10);
  /** Le jour `d` décalé de `k` jours. */
  const jourDecale = (d, k) => enIso(versUTC(d) + k * JOUR);
  /** Le nombre de jours de `a` à `b`. */
  const ecart = (a, b) => Math.round((versUTC(b) - versUTC(a)) / JOUR);
  /** Les jours de `debut` à `fin`, les deux compris. */
  function joursEntre(debut, fin) {
    const out = [];
    for (let d = debut; d <= fin; d = jourDecale(d, 1)) out.push(d);
    return out;
  }
  /** « 12/08 », « 12/08/2026 ». */
  const dateCourte = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const dateLongue = d => dateCourte(d) + '/' + d.slice(0, 4);

  /* ----------------------------------------------------------------------
   *  Le programme daté (partie a)
   * --------------------------------------------------------------------*/

  /** Le programme est-il daté ? Ses vols portent alors tous une date (l'import le garantit). */
  const estDate = vols => (vols || []).some(v => v && v.date);
  /** Les jours où le programme a des vols, dans l'ordre. */
  const datesDu = vols => [...new Set((vols || []).filter(v => v && v.date).map(v => v.date))].sort();
  /** Les vols d'un jour, sans leur date : ce qu'une journée reçoit, comme un programme d'un seul jour. */
  const volsDuJour = (vols, d) => (vols || []).filter(v => v.date === d).map(({ date, ...v }) => v);

  /**
   * Ce que couvre un programme daté : son premier et son dernier jour, tous les
   * jours entre les deux, les vols de chacun, et les jours sans aucun vol au
   * milieu (un jour sans vol, ou un oubli). Null pour un programme sans date.
   */
  function decrire(vols) {
    if (!estDate(vols)) return null;
    const dates = datesDu(vols), debut = dates[0], fin = dates[dates.length - 1];
    const parJour = joursEntre(debut, fin).map(date => {
      const l = vols.filter(v => v.date === date);
      return { date, departs: l.filter(v => v.sens === 'DEP').length, retours: l.filter(v => v.sens === 'RET').length };
    });
    return { debut, fin, jours: parJour.length, parJour, sansVol: parJour.filter(j => !j.departs && !j.retours).map(j => j.date) };
  }

  /** Le rapport d'import d'un programme daté, en lignes de texte (la page, l'outil). */
  function texteDuProgramme(d) {
    if (!d) return [];
    const n = j => j.departs + j.retours, avec = d.parJour.filter(j => n(j) > 0);
    const min = Math.min(...avec.map(n)), max = Math.max(...avec.map(n));
    const lignes = ['Programme daté : du ' + dateLongue(d.debut) + ' au ' + dateLongue(d.fin) + ', ' + d.jours + (d.jours > 1 ? ' jours.' : ' jour.'),
      'Vols par jour : ' + (min === max ? min : 'de ' + min + ' à ' + max) + ' (' + Math.round(avec.reduce((k, j) => k + n(j), 0) / Math.max(1, avec.length) * 10) / 10
        + ' en moyenne) — ' + d.parJour.map(j => dateCourte(j.date) + ' : ' + n(j)).join(' · ') + '.'];
    for (const s of d.sansVol) lignes.push('Aucun vol le ' + dateCourte(s) + ' : jour sans vol ou oubli ?');
    return lignes;
  }

  const api = { JOUR, jourDecale, ecart, joursEntre, dateCourte, dateLongue, estDate, datesDu, volsDuJour, decrire, texteDuProgramme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPeriode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
