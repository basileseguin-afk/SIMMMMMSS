/* ==========================================================================
 *  LE CALAGE DU TRAVAIL — en rejeu, un facteur par ligne de services
 *  (banc d'essai de la version 1, évolution 11 f — docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  La période se rejoue avec son planning (moteur/planning.js) : l'effectif
 *  est celui qui était là, seules les heures sup disent que le travail a
 *  débordé. Pour chaque ligne de services de la correspondance qui a des
 *  heures supp au réel, on cherche le facteur de ses homme-minutes (barème,
 *  minutes propres des cases) qui fait déborder la simulation comme le réel,
 *  jour par jour :
 *    — une grille de 0,5 à 2 : tous les services au même facteur, chacun lit
 *      sa propre erreur (comme la version 2, v2/calage.js) ;
 *    — un affinage à ±4 % et ±8 % autour du meilleur, chacun à son facteur ;
 *    — validé hors échantillon comme le calage de l'effectif
 *      (moteur/calage-periode.js) : une semaine ISO, un mois laissés de côté,
 *      et les règles 1 à 4 (plus juste que le moteur et une constante, stable,
 *      dans ses bornes, Wilcoxon).
 *  Le calcul avance jour par jour (`suivant()`), comme la période : la page
 *  montre sa progression et peut l'annuler. Sans navigateur : la page et
 *  l'outil appellent ce module.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const module_ = (nom, chemin) => (enNode ? require(chemin) : root[nom]);
  const PE = () => module_('OrlyPeriode', './periode.js');
  const R = () => module_('OrlyReel', './reel.js');
  const C = () => module_('OrlyCalagePeriode', './calage-periode.js');

  /** La grille de la version 2, puis l'affinage autour du meilleur (sans 1 : le meilleur de la grille est déjà joué). */
  const GRILLE = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
  const AFFINAGE = [0.92, 0.96, 1.04, 1.08];
  const K_MIN = 0.5, K_MAX = 2, STABILITE = 0.15, SEUIL_P = 0.05, JOURS_MIN = 20;
  const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const fr = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d + 0).replace('.', ',');
  const pct = x => Math.round(x * 100) + ' %';

  /* ----------------------------------------------------------------------
   *  Le choix et la validation d'un facteur (sans simulation : les essais
   *  sont joués)
   * --------------------------------------------------------------------*/

  /** Le meilleur facteur sur ces jours : la plus petite erreur absolue moyenne ; à égalité, le plus proche de 1. */
  function meilleur(essais, dates) {
    let m = null;
    for (const e of essais) {
      const x = moyenne(dates.map(d => Math.abs(e.erreurs.get(d))));
      if (x === null) continue;
      if (!m || x < m.erreur - 1e-9 || (Math.abs(x - m.erreur) <= 1e-9 && Math.abs(Math.log(e.k)) < Math.abs(Math.log(m.k)))) m = { k: e.k, erreur: x, essai: e };
    }
    return m;
  }

  /**
   * Valide le facteur d'une ligne. `essais` : [{ k, erreurs: Map(date → simulé − réel, h) }],
   * le facteur 1 compris (le moteur) ; `reel` : Map(date → heures supp réelles).
   * Les découpages et les règles 1 à 4 du calage de l'effectif.
   */
  function validerFacteur(essais, reel) {
    const dates = [...reel.keys()].sort(), jours = dates.map(date => ({ date, _s: C().semaineIso(date), _m: date.slice(0, 7) }));
    if (dates.length < JOURS_MIN) return { cale: false, raison: 'moins de ' + JOURS_MIN + ' jours avec le réel des heures supp (' + dates.length + ')', jours: dates.length };
    const v = C().decoupages(jours), moteur = essais.find(e => e.k === 1);
    const tous = meilleur(essais, dates);
    // Un découpage : le facteur appris sans la part, ses erreurs sur la part ; celles du moteur et d'une constante.
    const valider = (parts, quelle) => parts.map(part => {
      const test = jours.filter(j => quelle(j) === part).map(j => j.date), appris = dates.filter(d => !test.includes(d));
      const m = meilleur(essais, appris), c = moyenne(appris.map(d => reel.get(d)));
      const e = d => ({ facteur: m.essai.erreurs.get(d), moteur: moteur.erreurs.get(d), constante: c - reel.get(d) });
      const err = test.map(e);
      return { part, k: m.k, erreurs: err.map((x, i) => ({ date: test[i], ...x })),
        mae: Object.fromEntries(['facteur', 'moteur', 'constante'].map(n => [n, moyenne(err.map(x => Math.abs(x[n])))])) };
    });
    const semaines = valider(v.semaines, j => j._s), mois = valider(v.mois, j => j._m);
    const moy = (l, n) => moyenne(l.map(s => s.mae[n]));
    const ok = (oui, raison) => ({ ok: !!oui, raison });
    // 1. Plus juste que le moteur et la constante, en moyenne sur les semaines et sur chaque mois.
    const r1 = semaines.length > 0 && moy(semaines, 'facteur') < Math.min(moy(semaines, 'moteur'), moy(semaines, 'constante'))
      && mois.every(s => s.mae.facteur < Math.min(s.mae.moteur, s.mae.constante));
    // 2. Stable : appris sans une semaine, le facteur reste à ±15 % de celui de tous les jours.
    const instable = Math.max(0, ...semaines.map(s => Math.abs(s.k / tous.k - 1)));
    // 3. Dans ses bornes : [0,5 ; 2].
    const bornes = tous.k >= K_MIN && tous.k <= K_MAX;
    // 4. Wilcoxon contre la meilleure référence, sur la validation par mois s'il y en a deux, sinon par semaine.
    const cle = mois.length ? mois : semaines, ref = moy(cle, 'moteur') <= moy(cle, 'constante') ? 'moteur' : 'constante';
    const paires = cle.flatMap(s => s.erreurs);
    const w = C().wilcoxon(paires.map(x => Math.abs(x[ref])), paires.map(x => Math.abs(x.facteur)));
    const r4 = w.p < SEUIL_P && w.wPlus > w.n * (w.n + 1) / 4;
    const regles = {
      battreReferences: ok(r1, (r1 ? 'accepté : plus juste que le moteur et la constante' : 'refusé : pas plus juste que le moteur et la constante') + (mois.length ? ', sur chaque mois' : '')),
      stabilite: ok(instable <= STABILITE, (instable <= STABILITE ? 'accepté : stable, ±' : 'refusé : instable, ±') + pct(instable)),
      bornes: ok(bornes, bornes ? 'accepté : dans [0,5 ; 2]' : 'refusé : hors bornes (' + fr(tous.k) + ')'),
      wilcoxon: ok(r4, (r4 ? 'accepté' : 'refusé') + ' : Wilcoxon contre « ' + ref + ' », ' + (w.p < 0.001 ? 'p < 0,001' : 'p = ' + fr(w.p, 3))
        + ' (' + (mois.length ? 'par mois' : 'par semaine') + ')')
    };
    const resume = l => l.map(s => ({ part: s.part, k: s.k, ...s.mae }));
    return { cale: true, jours: dates.length, unSeulMois: v.unSeulMois, validation: mois.length ? 'semaines et mois' : 'semaines',
      facteur: Math.round(tous.k * 100) / 100, erreur: tous.erreur, erreurMoteur: moyenne(dates.map(d => Math.abs(moteur.erreurs.get(d)))),
      accepte: Object.values(regles).every(r => r.ok), regles, semaines: resume(semaines), mois: resume(mois),
      essais: essais.map(e => ({ k: e.k, erreur: moyenne(dates.map(d => Math.abs(e.erreurs.get(d)))) })).sort((a, b) => a.k - b.k) };
  }

  /* ----------------------------------------------------------------------
   *  Les essais : la période rejouée, facteur par facteur
   * --------------------------------------------------------------------*/

  /**
   * Le calage du travail, à avancer jour par jour : `suivant()` joue une
   * journée d'un essai (rend false quand tout est joué), `resultat()` le
   * rapport. `x` : { unite, vols, planning (moteur/planning.js), controle
   * (moteur/reel.js, controler : le réel, avec ses heures supp),
   * correspondance, options: { delaiChargement, decalage } }.
   */
  function creerCalageTravail(x) {
    if (!x.planning || !x.planning.dates || !x.planning.dates.length) throw new Error('le calage du travail se fait en rejeu : importez un planning.');
    if (!x.controle || !x.controle.avecSupp) throw new Error('le calage du travail lit les heures supp : le réel n’en a pas (colonne heures_supp).');
    // La correspondance relue d'abord (avec les services de l'unité, comme la comparaison de la page) : refusée, rien ne se joue.
    const correspondance = x.services ? R().validerCorrespondance(x.correspondance, { services: x.services }) : x.correspondance;
    const lignes = ((correspondance && correspondance.lignes) || []).filter(l => Array.isArray(l.services) && l.services.length);
    if (!lignes.length) throw new Error('aucune ligne de services dans la correspondance : rien à caler.');
    const vus = new Set(PE().datesDu(x.vols));
    if (!x.planning.dates.some(d => vus.has(d))) throw new Error('le planning ne couvre aucun jour de vols du programme.');
    const essais = new Map(lignes.map(l => [l.nom, []])), reels = new Map(), jours = new Map();
    const nJours = PE().creerPeriode(x.unite, x.vols, x.options || {}).total, essaisPrevus = GRILLE.length + AFFINAGE.length;
    const plan = GRILLE.map(k => ({ k, parLigne: Object.fromEntries(lignes.map(l => [l.nom, k])) }));
    let courant = null, etape = 0;
    const facteurs = p => Object.fromEntries(lignes.flatMap(l => l.services.map(s => [s, p.parLigne[l.nom]])));
    const lire = (p, res) => {
      const comp = R().comparer(res.bilan, x.controle, correspondance, { rejeu: true, ...(x.services ? { services: x.services } : {}) });
      for (const l of comp.lignes.filter(y => essais.has(y.nom))) {
        const m = new Map();
        jours.set(l.nom, { compares: l.jours.length, avecPlanning: l.jours.filter(j => j.planning).length });
        // Seuls les jours rejoués avec leur planning : les autres ne disent rien du travail à effectif imposé.
        for (const j of l.jours) if (j.planning && Number.isFinite(j.heuresSuppReelles)) { m.set(j.date, j.heuresSuppSimulees - j.heuresSuppReelles); if (!p.k || p.k === 1) reels.set(l.nom + '|' + j.date, j.heuresSuppReelles); }
        essais.get(l.nom).push({ k: p.parLigne[l.nom], erreurs: m });
      }
    };
    const ouvrir = () => {
      const p = plan[etape];
      courant = { p, periode: PE().creerPeriode(x.unite, x.vols, { ...(x.options || {}), planning: x.planning, facteurs: facteurs(p) }) };
    };
    return {
      lignes: lignes.map(l => l.nom),
      /** Les journées à jouer (chaque essai joue toute la période), celles qui le sont. */
      get total() { return essaisPrevus * nJours; },
      get fait() { return etape * nJours + (courant ? courant.periode.fait : 0); },
      get fini() { return etape >= essaisPrevus; },
      /** Joue une journée de l'essai en cours ; false quand tout est joué. */
      suivant() {
        if (this.fini) return false;
        if (!courant) ouvrir();
        courant.periode.suivant();
        if (!courant.periode.fini) return true;
        lire(courant.p, courant.periode.resultat());
        etape++; courant = null;
        // La grille finie : l'affinage, autour du meilleur de chaque ligne.
        if (etape === GRILLE.length) {
          const best = Object.fromEntries(lignes.map(l => {
            const r = new Map([...reels].filter(([k]) => k.startsWith(l.nom + '|')).map(([k, v]) => [k.slice(l.nom.length + 1), v]));
            const m = meilleur(essais.get(l.nom), [...r.keys()]);
            return [l.nom, m ? m.k : 1];
          }));
          for (const r of AFFINAGE) plan.push({ k: null, parLigne: Object.fromEntries(lignes.map(l => [l.nom, Math.round(best[l.nom] * r * 10000) / 10000])) });
        }
        return !this.fini;
      },
      /** Le rapport : par ligne, le facteur de travail, ses essais, sa validation et ses règles. */
      resultat() {
        return { schema: 'ory-calage-travail', version: 1, grille: GRILLE.slice(), affinage: AFFINAGE.slice(),
          lignes: lignes.map(l => {
            const r = new Map([...reels].filter(([k]) => k.startsWith(l.nom + '|')).map(([k, v]) => [k.slice(l.nom.length + 1), v]));
            const e = essais.get(l.nom);
            // Les jours de la ligne : comparés, et rejoués avec leur planning (les seuls qui comptent).
            const n = jours.get(l.nom) || { compares: 0, avecPlanning: 0 }, base = { nom: l.nom, services: l.services.slice(), joursCompares: n.compares, joursAvecPlanning: n.avecPlanning };
            if (!e.length || !r.size) return { ...base, cale: false, raison: 'pas de jour rejoué avec son planning et le réel des heures supp', jours: 0 };
            return { ...base, ...validerFacteur(e, r) };
          }) };
      }
    };
  }

  /** Le calage du travail d'une traite (l'outil). */
  function calerTravail(x) {
    const c = creerCalageTravail(x);
    while (c.suivant()) { /* essai après essai, jour après jour */ }
    return c.resultat();
  }

  const api = { GRILLE, AFFINAGE, meilleur, validerFacteur, creerCalageTravail, calerTravail };
  if (enNode) module.exports = api;
  else root.OrlyCalageTravail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
