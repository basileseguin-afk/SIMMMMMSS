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
  // D'où viennent les retours à la plonge (retour d'usage du 29/09) : un réglage
  // qu'on veut pouvoir comparer, J+1 contre planche retour.
  const RETOURS = { programme: 'Programme de vols', j1: 'J+1 (lendemain du départ)', j2: 'J+1 (lendemain du départ)', planche: 'Planche retour' };

  /**
   * Fige un scénario.
   * @param {object} resultat le retour de `simuler()`
   * @param {object} c contexte : { source, ateliers, reglages, liaisons, decalage }
   */
  function capturer(resultat, c) {
    const ctx = c || {};
    const k = (resultat && resultat.indicateurs) || {};
    const mat = (resultat && resultat.materiel) || null, plonge = (resultat && resultat.plonge) || null;
    const ateliers = ctx.ateliers || [];
    const reglages = ctx.reglages || {};
    return {
      source: ctx.source || '',
      // Ce qui a produit le résultat, en entier : deux empreintes égales
      // garantissent deux journées égales.
      // Les chemins, la boucle du matériel, les commandes retirées ou ajoutées et
      // le programme de vols en font partie : sans eux, deux essais qui ne
      // diffèrent que par un chemin seraient déclarés identiques.
      empreinte: JSON.stringify({ ateliers, reglages, liaisons: ctx.liaisons || [], decalage: ctx.decalage || 0,
        etat: ctx.etat || null, vols: ctx.vols || null }),
      ateliers: ateliers.length,
      // Les mises à disposition comptent aussi : des gens y travaillent toute la journée (06/10).
      personnes: ateliers.reduce((n, a) => n + (+a.personnes || 0), 0),
      rendement: reglages.rendement == null ? null : Math.round(reglages.rendement * 100),
      delai: reglages.delaiChargement == null ? null : reglages.delaiChargement,
      decalage: ctx.decalage || 0,
      retours: RETOURS[((ctx.etat || {}).materiel || {}).retours] || RETOURS.programme,
      suivies: k.classesSuivies || 0,
      aHeure: k.aHeure || 0,
      part: k.partAHeure == null ? null : k.partAHeure,
      retardMoyen: arrondi(k.retardMoyen),
      retardMax: arrondi(k.retardMax),
      finDerniere: Number.isFinite(k.finDerniere) ? k.finDerniere : null,
      attente: arrondi(k.attenteTotale),
      attenteMateriel: arrondi(k.attenteMateriel),
      hommeHeures: k.hommeHeures == null ? null : Math.round(k.hommeHeures * 10) / 10,
      absentes: k.classesAbsentes || 0,
      // La plonge : ce qui est revenu, l'attente la plus longue avant d'être lavé,
      // et le sale qui reste en fin de journée (la boucle du matériel tenue).
      revenu: mat ? Math.round(mat.entrees) : null,
      attentePlonge: plonge ? arrondi(plonge.attenteMax) : null,
      resteSale: mat ? mat.resteSale : null,
      // Avec un handling : les vols chargés à leur départ.
      vols: k.volsSuivis || 0,
      volsAHeure: k.volsAHeure || 0,
      partVols: k.partVolsAHeure == null ? null : k.partVolsAHeure
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
    { groupe: 'Ce qui a changé', lib: 'Commandes prêtes avant le départ', val: s => s.delai == null ? '—' : s.delai + ' min', sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Retours à la plonge', val: s => s.retours || RETOURS.programme, sens: 0 },
    { groupe: 'Ce qui a changé', lib: 'Décalage des vols', val: s => (s.decalage > 0 ? '+' : '') + s.decalage + ' min', sens: 0 },
    { groupe: 'Ce que ça donne', lib: 'Vols chargés à l’heure (handling)',
      val: s => s.vols ? s.volsAHeure + ' / ' + s.vols + (s.partVols != null ? ' · ' + s.partVols + ' %' : '') : '—',
      num: s => s.partVols, unite: 'pts', sens: 1 },
    { groupe: 'Ce que ça donne', lib: 'Commandes prêtes à l’heure',
      val: s => s.suivies ? s.aHeure + ' / ' + s.suivies + (s.part != null ? ' · ' + s.part + ' %' : '') : '—',
      num: s => s.part, unite: 'pts', sens: 1 },
    { groupe: 'Ce que ça donne', lib: 'Retard moyen', val: s => s.retardMoyen == null ? '—' : s.retardMoyen + ' min',
      num: s => s.retardMoyen, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Retard le plus long', val: s => s.retardMax == null ? '—' : s.retardMax + ' min',
      num: s => s.retardMax, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Dernière commande prête', val: s => hhmm(s.finDerniere), num: s => s.finDerniere, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Temps passé à attendre', val: s => s.attente == null ? '—' : s.attente + ' min',
      num: s => s.attente, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Attente de matériel propre', val: s => s.attenteMateriel == null ? '—' : s.attenteMateriel + ' min',
      num: s => s.attenteMateriel, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Matériel revenu des vols', val: s => s.revenu == null ? '—' : s.revenu + ' u', sens: 0 },
    { groupe: 'Ce que ça donne', lib: 'Plus longue attente à la plonge', val: s => s.attentePlonge == null ? '—' : s.attentePlonge + ' min',
      num: s => s.attentePlonge, unite: 'min', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Sale non lavé en fin de journée', val: s => s.resteSale == null ? '—' : s.resteSale + ' u',
      num: s => s.resteSale, unite: 'u', sens: -1 },
    { groupe: 'Ce que ça donne', lib: 'Heures de travail', val: s => s.hommeHeures == null ? '—' : String(s.hommeHeures).replace('.', ',') + ' h',
      num: s => s.hommeHeures, unite: 'h', sens: 0 },
    { groupe: 'Ce que ça donne', lib: 'Commandes sans équipe', val: s => String(s.absentes), num: s => s.absentes, unite: '', sens: -1 }
  ];

  /**
   * L'écart de B sur A (refonte du 08/10, étape 9), signé : « ▲ +12 min »,
   * « ▼ −5 pts ». La flèche dit le sens du chiffre ; le verdict, si c'est mieux.
   * Seulement pour les résultats chiffrés : un réglage n'a pas d'écart.
   */
  function ecart(l, A, B) {
    if (!A || !B || !l.num || l.unite == null) return null;
    const x = l.num(A), y = l.num(B);
    if (x == null || y == null || x === y) return null;
    const d = y - x, n = Math.abs(d);
    const val = l.unite === 'h' ? String(Math.round(n * 10) / 10).replace('.', ',') : n < 1 ? '<1' : String(Math.round(n));
    return { fleche: d > 0 ? '▲' : '▼', texte: (d > 0 ? '+' : '−') + val + (l.unite ? ' ' + l.unite : '') };
  }

  /**
   * Le tableau A / B. `verdict` dit si B fait mieux ou moins bien que A sur
   * cette ligne — jamais par la couleur seule : le mot est écrit aussi.
   * `ecart` : l'écart signé de B sur A, ou null.
   */
  function lignes(A, B) {
    return LIGNES.map(l => {
      const a = A ? l.val(A) : '—', b = B ? l.val(B) : '—';
      let verdict = '';
      if (A && B && l.sens && l.num) {
        const x = l.num(A), y = l.num(B);
        if (x != null && y != null && x !== y) verdict = (y - x) * l.sens > 0 ? 'mieux' : 'moins bien';
      }
      return { groupe: l.groupe, lib: l.lib, a, b, diff: !!(A && B && a !== b), verdict, ecart: ecart(l, A, B) };
    });
  }

  /** Ce qu'il faut savoir avant de lire le tableau. */
  function note(A, B) {
    if (!A) return 'Retenez la journée telle qu’elle est : ce sera l’essai A.';
    if (!B) return 'Changez une équipe, un temps de travail ou un horaire, puis retenez l’essai B.';
    if (A.source !== B.source) return 'Attention : A et B ne portent pas sur les mêmes vols ('
      + A.source + ' / ' + B.source + ').';
    if (A.empreinte === B.empreinte) return 'Rien n’a changé : les deux journées sont identiques.';
    return 'Mêmes vols, aucun hasard : seul ce que vous avez changé fait la différence.';
  }

  const api = { capturer, lignes, note, ecart, LIGNES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyComparaison = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
