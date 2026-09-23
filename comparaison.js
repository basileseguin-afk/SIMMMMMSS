/* ==========================================================================
 *  COMPARER DEUX SCÉNARIOS — A et B, sur le modèle par ateliers
 *
 *  La journée est déjà calculée à chaque frappe : capturer un scénario ne
 *  relance donc rien, cela FIGE ce qu'on a sous les yeux — les réglages qui
 *  l'ont produit et ce qu'ils ont donné. On change un atelier, un barème, un
 *  délai, on capture B, et le tableau dit ce qui a bougé.
 *
 *  Le calcul n'a aucun aléa : deux captures aux réglages identiques donnent
 *  exactement les mêmes chiffres. Toute différence vient donc des réglages.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const hhmm = t => {
    if (t == null || !Number.isFinite(t)) return '—';
    const m = ((Math.round(t) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const arrondi = v => (v == null || !Number.isFinite(v) ? null : Math.round(v));

  /**
   * Fige un scénario.
   * @param {object} resultat le retour de `simuler()`
   * @param {object} c contexte : { source, ateliers, reglages, liaisons, decalage }
   */
  function capturer(resultat, c) {
    const ctx = c || {};
    const k = (resultat && resultat.indicateurs) || {};
    const ateliers = ctx.ateliers || [];
    const reglages = ctx.reglages || {};
    return {
      source: ctx.source || '',
      // Ce qui a produit le résultat, en entier : deux empreintes égales
      // garantissent deux journées égales.
      empreinte: JSON.stringify({ ateliers, reglages, liaisons: ctx.liaisons || [], decalage: ctx.decalage || 0 }),
      ateliers: ateliers.length,
      personnes: ateliers.filter(a => a.type !== 'dispo').reduce((n, a) => n + (+a.personnes || 0), 0),
      rendement: reglages.rendement == null ? null : Math.round(reglages.rendement * 100),
      delai: reglages.delaiChargement == null ? null : reglages.delaiChargement,
      decalage: ctx.decalage || 0,
      suivies: k.classesSuivies || 0,
      aHeure: k.aHeure || 0,
      part: k.partAHeure == null ? null : k.partAHeure,
      retardMoyen: arrondi(k.retardMoyen),
      retardMax: arrondi(k.retardMax),
      finDerniere: Number.isFinite(k.finDerniere) ? k.finDerniere : null,
      attente: arrondi(k.attenteTotale),
      attenteMateriel: arrondi(k.attenteMateriel),
      hommeHeures: k.hommeHeures == null ? null : Math.round(k.hommeHeures * 10) / 10,
      absentes: k.classesAbsentes || 0
    };
  }

  /* Chaque ligne : un libellé, comment lire la valeur, et — pour les
   * résultats — dans quel sens c'est mieux. `sens` +1 : plus haut est mieux ;
   * −1 : plus bas est mieux ; 0 : ni l'un ni l'autre, c'est un réglage. */
  const LIGNES = [
    { groupe: 'Ce qui a changé', lib: 'Vols', val: s => s.source || '—', sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Équipes', val: s => String(s.ateliers), sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Personnes au travail', val: s => String(s.personnes), sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Rythme de travail', val: s => s.rendement == null ? '—' : s.rendement + ' %', sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Repas prêts avant le départ', val: s => s.delai == null ? '—' : s.delai + ' min', sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Décalage des vols', val: s => (s.decalage > 0 ? '+' : '') + s.decalage + ' min', sens: 0 },
    { groupe: 'Ce que ça donne', lib: 'Repas prêts à l’heure',
      val: s => s.suivies ? s.aHeure + ' / ' + s.suivies + (s.part != null ? ' · ' + s.part + ' %' : '') : '—',
      num: s => s.part, sens: 1 },
    { groupe: 'Ce que ça donne', lib: 'Retard moyen', val: s => s.retardMoyen == null ? '—' : s.retardMoyen + ' min',
      num: s => s.retardMoyen, sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Retard le plus long', val: s => s.retardMax == null ? '—' : s.retardMax + ' min',
      num: s => s.retardMax, sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Dernier repas prêt', val: s => hhmm(s.finDerniere), num: s => s.finDerniere, sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Temps passé à attendre', val: s => s.attente == null ? '—' : s.attente + ' min',
      num: s => s.attente, sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Attente de matériel propre', val: s => s.attenteMateriel == null ? '—' : s.attenteMateriel + ' min',
      num: s => s.attenteMateriel, sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Heures de travail', val: s => s.hommeHeures == null ? '—' : String(s.hommeHeures).replace('.', ',') + ' h',
      num: s => s.hommeHeures, sens: 0 },
    { groupe: 'Ce que ça donne', lib: 'Repas sans équipe', val: s => String(s.absentes), num: s => s.absentes, sens: -1 }
  ];

  /**
   * Le tableau A / B. `verdict` dit si B fait mieux ou moins bien que A sur
   * cette ligne — jamais par la couleur seule : le mot est écrit aussi.
   */
  function lignes(A, B) {
    return LIGNES.map(l => {
      const a = A ? l.val(A) : '—', b = B ? l.val(B) : '—';
      let verdict = '';
      if (A && B && l.sens && l.num) {
        const x = l.num(A), y = l.num(B);
        if (x != null && y != null && x !== y) verdict = (y - x) * l.sens > 0 ? 'mieux' : 'moins bien';
      }
      return { groupe: l.groupe, lib: l.lib, a, b, diff: !!(A && B && a !== b), verdict };
    });
  }

  /** Ce qu'il faut savoir avant de lire le tableau. */
  function note(A, B) {
    if (!A || !B) return 'Photographiez A, changez quelque chose, photographiez B.';
    if (A.source !== B.source) return 'Attention : A et B ne portent pas sur les mêmes vols ('
      + A.source + ' / ' + B.source + ').';
    if (A.empreinte === B.empreinte) return 'Rien n’a changé : les deux journées sont identiques.';
    return 'Mêmes vols, aucun hasard : seul ce que vous avez changé fait la différence.';
  }

  const api = { capturer, lignes, note, LIGNES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyComparaison = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
