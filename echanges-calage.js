/* ==========================================================================
 *  LE CLASSEUR DU CALAGE SUR LE RÉEL (banc d'essai de la version 1,
 *  évolution 11 — docs/BANC_ESSAI.md § 10, docs/FORMATS_EXCEL.md § 5)
 *  ------------------------------------------------------------------------
 *  Le même classeur depuis la page (« Réel et calage ») et depuis l'outil
 *  (outils/caler-periode.cjs --xlsx) : le Lisez-moi, le réel tel qu'il a été
 *  lu et contrôlé, la comparaison par ligne de la correspondance. Ce module
 *  écrit des feuilles ; tableur.js en fait le fichier.
 *
 *  ⚠ Le classeur contient les heures réelles de l'unité : il ne va jamais
 *  dans le dépôt (`.gitignore` refuse les classeurs).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const T = () => (enNode ? require('./tableur.js') : root.OrlyTableur);
  const R = () => (enNode ? require('./moteur/reel.js') : root.OrlyReel);
  const n2 = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 100) / 100);
  const n3 = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 1000) / 1000);
  const dateFr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const deux = n => String(n).padStart(2, '0');
  const liste = l => (l && l.length ? l.join(', ') : 'aucun');
  const feuille = (nom, lignes, figer) => ({ nom, lignes, filtres: true, figerColonnes: figer });

  /** Le Lisez-moi : la période, les fichiers, les bases, les jours, les définitions. */
  function lisezMoi(c, ctx) {
    const p = ctx.periode || {}, le = ctx.calculeLe, b = (c.bases && c.bases.defaut) || {};
    const autres = Object.entries(c.bases || {}).filter(([k]) => k !== 'defaut');
    const a = c.anomalies || {};
    return { nom: 'Lisez-moi', largeurs: [110], lignes: [
      ['Comparaison au réel' + (p.debut ? ' — période du ' + dateFr(p.debut) + ' au ' + dateFr(p.fin) : '') + ' (prototype)'],
      ['Période simulée : ' + (ctx.sauvegarde || p.sauvegarde || '—') + ', ' + (p.vols || '—') + ' ; réel : ' + (ctx.reel || '—') + ' ; correspondance : ' + (ctx.correspondance || '—') + '.'],
      ['Calculée le ' + (le && !isNaN(le) ? deux(le.getDate()) + '/' + deux(le.getMonth() + 1) + '/' + le.getFullYear() + ' à ' + deux(le.getHours()) + ':' + deux(le.getMinutes()) : '—') + '.'],
      ['Base d’un ETP : ' + n2(b.titulaires) + ' h de titulaire, ' + n2(b.interim) + ' h d’intérim' + (autres.length ? ' ; par rôle : '
        + autres.map(([r, x]) => r + ' ' + n2(x.titulaires) + ' h / ' + n2(x.interim) + ' h').join(', ') : '') + '.'],
      ['Jours comparés (jours de travail complets avec du réel) : ' + (c.jours || []).length + ' ; jours de travail incomplets écartés : ' + liste((c.joursIncomplets || []).map(dateFr)) + '.'],
      ['Rôles sans ligne (listés, pas comptés) : ' + liste(c.rolesSansLigne) + '.'],
      ['Cellules écartées : ' + (a.ecartees || []).length + ' ; à vérifier : ' + (a.signalees || []).length + ' ; jours écartés par vous : ' + liste((a.joursEcartes || []).map(dateFr)) + '.'],
      [''],
      ['Les feuilles :'],
      ['   Réel — chaque jour × rôle, tel que lu : ses heures, ses bases, ses ETP, sa ligne, et s’il est compté, écarté (et pourquoi) ou sans ligne.'],
      ['   Comparaison — chaque ligne de la correspondance : réel, simulé et écart par jour ; erreur, biais et corrélation par mois et sur la période ;'],
      ['   toute l’unité (toutes les lignes, hors simulation comprise) ; les heures supp par mois, réelles et simulées.'],
      ['   Calage (s’il est fait) — par ligne, le modèle retenu, puis les références et les candidats : leurs paramètres, leurs erreurs hors échantillon,'],
      ['   le verdict de chaque règle ; σ et la bande P10–P90 ; le total de l’unité avant (le moteur) et après (les modèles retenus).'],
      [''],
      ['Définitions :'],
      ['   ETP : heures de titulaires ÷ leur base + heures d’intérim ÷ la leur. Les heures supp ne comptent pas dans les ETP.'],
      ['   Simulé : la charge des services de la ligne (ETP, non arrondie), l’encadrement saisi de son service, ses chauffeurs, ou 0 hors simulation.'],
      ['   Écart : simulé − réel. Erreur : la moyenne des écarts en valeur absolue. Biais : la moyenne des écarts (positif : la simulation surestime).'],
      ['   Corrélation : de Pearson, entre réel et simulé, jour par jour (vide sans variation).'],
      [''],
      ['PROTOTYPE — à lire comme un ordre de grandeur. Ce classeur contient des heures réelles : il ne va jamais dans le dépôt.']
    ] };
  }

  /** Réel : chaque jour × rôle, compté, écarté ou sans ligne. */
  function feuilleReel(c, reel) {
    const T_ = T(), lignes = [['Date', 'Rôle', 'Heures titulaires', 'Heures intérim', 'Heures supp', 'Base titulaires', 'Base intérim', 'ETP', 'Ligne', 'État']];
    const ligneDe = new Map((c.lignes || []).flatMap(l => l.roles.map(r => [r, l.nom])));
    const base = r => (c.bases ? R().baseDe(c.bases, r) : R().BASE_DEFAUT);
    const compares = new Set(c.jours || []), incomplets = new Set(c.joursIncomplets || []);
    const etat = (date, role) => (!ligneDe.has(role) ? 'sans ligne' : compares.has(date) ? 'compté' : incomplets.has(date) ? 'jour de travail incomplet' : 'hors période');
    const rangs = [];
    const rang = (x, etatDe) => {
      const b = base(x.role), e = R().etpDe(x, b);
      rangs.push({ cle: [x.date, x.role], l: [T_.celluleDate(x.date), x.role, n2(x.titulaires), n2(x.interim), n2(x.supp), b.titulaires, b.interim,
        n3(e), ligneDe.get(x.role) || null, e === null ? 'heures écartées' : etatDe] });
    };
    for (const x of (reel && reel.cellules ? reel.cellules.values() : [])) rang(x, etat(x.date, x.role));
    for (const x of (reel && reel.dansJoursEcartes) || []) rang(x, 'jour écarté par vous');
    for (const e of (reel && reel.ecartees) || []) {
      if (e.code === 'negatif') continue;   // la cellule est dans la liste, ses heures négatives écartées
      rangs.push({ cle: [e.date, e.role], l: [T_.celluleDate(e.date), e.role, null, null, null, null, null, null, ligneDe.get(e.role) || null, 'écartée : ' + e.raison] });
    }
    rangs.sort((x, y) => x.cle[0].localeCompare(y.cle[0]) || x.cle[1].localeCompare(y.cle[1]));
    return feuille('Réel', lignes.concat(rangs.map(r => r.l)), 2);
  }

  /**
   * Comparaison : par ligne, ses jours, ses mois, la période ; toute l'unité ; les heures supp par mois. Un
   * rejeu (évolution 11 f ; `rejeu`, sa comparaison, ou `c` elle-même quand la période est un rejeu) ajoute,
   * par ligne, ses heures supp de chaque jour et de la période, et ses lots en retard ; pour l'unité, les
   * nuits de plonge ouvertes.
   */
  function feuilleComparaison(c, rejeu) {
    const T_ = T(), lignes = [['Ligne', 'Couvre', 'Niveau', 'Jour', 'Mois', 'Unité', 'Réel', 'Simulé', 'Écart', 'Jours', 'Erreur', 'Biais', 'Corrélation']];
    const bloc = (nom, couvre, x, avecCorrelation) => {
      for (const j of x.jours) lignes.push([nom, couvre, 'jour', T_.celluleDate(j.date), j.date.slice(0, 7), 'ETP', n3(j.reel), n3(j.simule), n3(j.ecart), null, null, null, null]);
      const m = (niveau, mois, s) => lignes.push([nom, couvre, niveau, null, mois, 'ETP', null, null, null, s.jours, n3(s.mae), n3(s.biais), avecCorrelation ? n3(s.correlation) : null]);
      for (const mo of x.mois) m('mois', mo.mois, mo);
      m('période', null, x.periode);
    };
    for (const l of c.lignes || []) bloc(l.nom, l.couvre, l, true);
    if (c.unite) bloc('Toute l’unité', 'toutes les lignes', c.unite, false);
    for (const l of c.lignes || []) for (const h of l.heuresSupp || [])
      lignes.push([l.nom, l.couvre, 'heures supp du mois', null, h.mois, 'h', n2(h.reel), n2(h.simule), n2(h.simule - h.reel), h.jours, null, null, null]);
    const r = rejeu || ((c.lignes || []).some(l => l.rejeu) ? c : null);
    if (r) {
      for (const l of r.lignes || []) if (l.rejeu) {
        for (const j of l.jours) lignes.push([l.nom, l.couvre, 'rejeu : heures supp du jour', T_.celluleDate(j.date), j.date.slice(0, 7), 'h', n2(j.heuresSuppReelles), n2(j.heuresSuppSimulees),
          j.heuresSuppReelles === null ? null : n2(j.heuresSuppSimulees - j.heuresSuppReelles), null, null, null, null]);
        const h = l.rejeu.heuresSupp;
        lignes.push([l.nom, l.couvre, 'rejeu : heures supp, période', null, null, 'h', null, null, null, h.jours, n2(h.mae), n2(h.biais), null]);
        if (l.rejeu.lotsEnRetard !== undefined) lignes.push([l.nom, l.couvre, 'rejeu : lots en retard', null, null, 'lots', null, l.rejeu.lotsEnRetard, null, l.jours.length, null, null, null]);
      }
      for (const w of (r.unite && r.unite.rejeu && r.unite.rejeu.jours) || [])
        lignes.push(['Toute l’unité', 'toutes les lignes', 'rejeu : nuits de plonge ouvertes', T_.celluleDate(w.date), w.date.slice(0, 7), 'nuits', null, w.nuitsOuvertes, null, null, null, null, null]);
    }
    return feuille('Comparaison', lignes, 3);
  }

  /**
   * Calage : par ligne, le modèle retenu, puis chaque référence et chaque
   * candidat (paramètres sur tous les jours et leur plage sur les découpages,
   * erreurs, verdict de chaque règle), « b + a × » quand il se confond avec
   * « × a », l'erreur de chaque découpage laissé de côté ; l'unité avant / après.
   */
  function feuilleCalage(rapport, travail) {
    const REGLES = [['battreReferences', 'Plus juste que les références'], ['stabilite', 'Stable'], ['bornes', 'Bornes'], ['wilcoxon', 'Wilcoxon'], ['placebo', 'Placebo']];
    const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'], fr = x => (n3(x) === null ? '—' : String(n3(x)).replace('.', ','));
    const lignes = [['Ligne', 'Couvre', 'Rang', 'Modèle', 'Accepté', 'a', 'a min', 'a max', 'b', 'b min', 'b max', 'Constante', 'Constante min', 'Constante max',
      'Facteurs du jour (lun. → dim.)', 'Erreur par semaine (ETP)', 'Erreur par mois (ETP)', ...REGLES.map(r => r[1]), 'σ (ETP)', 'Bande P10–P90 (± ETP)', 'Jours', 'Validation', 'Laissé de côté']];
    const vide = n => new Array(n).fill(null);
    // Une ligne de la feuille : les colonnes nommées, les autres vides.
    const rangee = x => [x.ligne, x.couvre, x.rang, x.modele == null ? null : x.modele, x.accepte == null ? null : x.accepte, ...(x.parametres || vide(9)),
      x.jours == null ? null : x.jours, x.semaines == null ? null : x.semaines, x.mois == null ? null : x.mois, ...(x.regles || vide(REGLES.length)),
      x.sigma == null ? null : x.sigma, x.bande == null ? null : x.bande, x.n == null ? null : x.n, x.validation == null ? null : x.validation, x.part == null ? null : x.part];
    const plage = (m, k) => { const q = (m.parametres && m.parametres[k]) || {}; return [n3(q.tous), n3(q.min), n3(q.max)]; };
    const facteurs = m => (m.parametres && m.parametres.jours ? m.parametres.jours.map((f, k) => JOURS[k] + ' ' + fr(f.tous)
      + (f.min === null ? '' : ' (' + fr(f.min) + ' – ' + fr(f.max) + ')')).join(' ; ') : null);
    for (const l of rapport.lignes || []) {
      const id = { ligne: l.nom, couvre: l.couvre };
      if (!l.cale) { lignes.push(rangee({ ...id, rang: 'pas de calage', n: l.jours, validation: l.raison })); continue; }
      const r = l.retenu, pr = r.parametres;
      lignes.push(rangee({ ...id, rang: 'retenu', modele: r.nom, parametres: [n3(pr.a), null, null, n3(pr.b), null, null, n3(pr.c), null, null],
        jours: pr.jours ? pr.jours.map(x => fr(x)).join(' ; ') : null, sigma: n3(r.sigma), bande: n3(r.bande), n: l.jours,
        validation: l.validation + (l.unSeulMois ? ' (un seul mois)' : '') + (l.raison ? ' — ' + l.raison : '') }));
      const modeles = [...['moteur', 'constante'].map(n => [l.references[n], 'référence']), ...l.candidats.map(c => [c, 'candidat'])];
      for (const [m, rang] of modeles) lignes.push(rangee({ ...id, rang, modele: m.nom, accepte: rang === 'candidat' ? (m.accepte ? 'oui' : 'non') : null,
        parametres: [...plage(m, 'a'), ...plage(m, 'b'), ...plage(m, 'c')], jours: facteurs(m), semaines: n3(m.erreurs.semaines), mois: n3(m.erreurs.mois),
        regles: REGLES.map(([k]) => (m.regles && m.regles[k] ? m.regles[k].raison : null)) }));
      for (const x of l.confondus || []) lignes.push(rangee({ ...id, rang: 'candidat', modele: x.nom, accepte: 'non : ' + x.raison,
        parametres: [n3(x.a), null, null, n3(x.b), null, null, null, null, null] }));
      // L'erreur de chaque découpage : la semaine ou le mois laissé de côté, pour chaque modèle.
      for (const [m, rang] of modeles) {
        for (const x of m.erreurs.parSemaine) lignes.push(rangee({ ...id, rang: rang + ', une semaine laissée de côté', modele: m.nom, semaines: n3(x.erreur), part: x.semaine }));
        for (const x of m.erreurs.parMois) lignes.push(rangee({ ...id, rang: rang + ', un mois laissé de côté', modele: m.nom, mois: n3(x.erreur), part: x.mois }));
      }
    }
    // Le calage du travail (évolution 11 f) : le facteur des homme-minutes de chaque ligne de services, ses règles 1 à 4.
    for (const l of (travail && travail.lignes) || []) {
      const id = { ligne: l.nom, couvre: (l.services || []).join(', ') };
      if (!l.cale) { lignes.push(rangee({ ...id, rang: 'calage du travail', modele: 'facteur de travail', n: l.jours, validation: l.raison })); continue; }
      lignes.push(rangee({ ...id, rang: 'calage du travail', modele: 'facteur de travail', accepte: l.accepte ? 'oui' : 'non',
        parametres: [n3(l.facteur), n3(Math.min(...l.semaines.map(s => s.k))), n3(Math.max(...l.semaines.map(s => s.k))), null, null, null, null, null, null],
        semaines: n3(l.erreur), regles: REGLES.map(([k]) => (l.regles[k] ? l.regles[k].raison : null)), n: l.jours,
        validation: l.validation + ' — heures supp : ' + fr(l.erreurMoteur) + ' h par jour avec le barème, ' + fr(l.erreur) + ' h avec le facteur' }));
    }
    const u = rapport.unite || {};
    for (const [rang, x] of [['avant (moteur)', u.avant], ['après (modèles retenus)', u.apres]]) if (x)
      lignes.push(rangee({ ligne: 'Toute l’unité', couvre: 'le total de chaque jour', rang, semaines: n3(x.mae), n: x.jours, validation: 'biais ' + fr(x.biais) }));
    return feuille('Calage', lignes, 3);
  }

  /**
   * Le classeur. `x` : { comparaison (moteur/reel.js, comparer), reel (controler), rapport (moteur/calage-periode.js, caler ; facultatif),
   *   rejeu (la comparaison d'un rejeu ; facultatif), travail (moteur/calage-travail.js ; facultatif) } ;
   * `ctx` : { periode: { debut, fin, sauvegarde, vols }, reel, correspondance (noms des fichiers), calculeLe }.
   */
  function calageVersClasseur(x, ctx = {}) {
    const c = x.comparaison;
    return [lisezMoi(c, ctx), feuilleReel(c, x.reel), feuilleComparaison(c, x.rejeu || null)].concat(x.rapport || x.travail ? [feuilleCalage(x.rapport || { lignes: [] }, x.travail || null)] : []);
  }

  const api = { calageVersClasseur };
  if (enNode) module.exports = api;
  else root.OrlyEchangesCalage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
