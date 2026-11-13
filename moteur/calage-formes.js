/* ==========================================================================
 *  LE CATALOGUE DE FORMES DU CALAGE — comment les heures réelles suivent le
 *  travail au barème (banc d'essai de la version 1, évolution 17 a —
 *  docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Les temps par vol du barème ne changent pas : x, le travail au barème d'une
 *  ligne (ses ETP simulés), reste une entrée. Une forme dit comment le réel
 *  (en ETP lui aussi) le suit. Aux trois formes de l'évolution 11 c (« × a »,
 *  « b + a × », « × a × jour », dans moteur/calage-periode.js) s'ajoutent :
 *    — « puissance »  : a × x^p, p sur une grille de 0,2 à 1 ;
 *    — « logarithme » : b + a × ln(1 + x) ;
 *    — « plancher »   : le plus grand de c et a × x ;
 *    — « plafond »    : le plus petit de c et a × x.
 *  Chaque forme est une fiche :
 *    id, nom       son nom dans les rapports ;
 *    variables     ce qu'elle lit dans un jour — aujourd'hui le seul simulé ;
 *                  une seconde variable (le remplissage des vols) s'ajoutera
 *                  par une fiche de plus, qui la nomme ici et la lit dans le jour ;
 *    bornes        ses bornes, en mots (la doc et le rapport les citent) ;
 *    apprendre     ses paramètres sur des jours ({ reel, simule }) : moindres
 *                  carrés, une grille pour ce qui n'est pas linéaire ; null si
 *                  elle ne s'applique pas ;
 *    predire       sa prédiction pour un jour ;
 *    verdict       ses bornes tenues ou non ({ ok, raison }) : un paramètre en
 *                  butée écarte le candidat ;
 *    garder        les paramètres que garde la politique d'effectif ;
 *    relire        ces paramètres relus d'une sauvegarde (refusés hors bornes) ;
 *    formule       la forme en clair, avec ses paramètres.
 *  Déterministe, sans navigateur.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Les bornes du facteur a de l'évolution 11 c : le réel reste entre la moitié et le double du travail au barème. */
  const A_MIN = 0.5, A_MAX = 2;
  /** La grille de l'exposant : 0,20 ; 0,25 ; … ; 1. Ses deux bouts sont des butées (à 1, c'est « × a »). */
  const P_MIN = 0.2, P_MAX = 1, P_PAS = 0.05;
  const GRILLE_P = Array.from({ length: Math.round((P_MAX - P_MIN) / P_PAS) + 1 }, (_, i) => Math.round((P_MIN + i * P_PAS) * 100) / 100);
  /**
   * La grille du plancher et du plafond : c = a × s, le seuil s parcourant 41 valeurs régulières du plus petit au
   * plus grand travail au barème des jours appris. Ses deux bouts sont des butées : le plancher (le plafond) n'y
   * joue aucun jour — c'est « × a » — ou les joue tous — c'est « constante ».
   */
  const SEUILS = 41;
  /** Deux points de grille se valent à 1e-9 près sur la somme des carrés des écarts : le premier l'emporte. */
  const PARAMETRE_MAX = 1e6, EPS = 1e-12, EGALITE = 1e-9;

  const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  /** Un nombre à la française, arrondi à `d` décimales : « 0,8 », « 3,25 ». */
  const fr = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d + 0).replace('.', ',');
  const fini = x => typeof x === 'number' && Number.isFinite(x);
  /** Le travail au barème d'un jour, jamais négatif. */
  const travail = j => Math.max(0, j.simule);

  /** Moindres carrés de y ≈ a × z : a et la somme des carrés des écarts ; null si z est nul partout. */
  function proportion(z, y) {
    let zz = 0, zy = 0, sse = 0;
    for (let i = 0; i < z.length; i++) { zz += z[i] * z[i]; zy += z[i] * y[i]; }
    if (!(zz > 0)) return null;
    const a = zy / zz;
    for (let i = 0; i < z.length; i++) sse += (y[i] - a * z[i]) ** 2;
    return { a, sse };
  }

  /** y ≈ a × z par moindres carrés, d'après Σz², Σzy et Σy² : a, et la somme des carrés des écarts (Σy² − (Σzy)² ÷ Σz²). */
  const ajuste = (zz, zy, yy) => (zz > 0 ? { a: zy / zz, sse: yy - zy * zy / zz } : null);
  /** Le meilleur point d'une grille, gardé au fil de l'eau : à égalité, le premier. */
  const garde = (mieux, m, g, k) => (m && (!mieux || m.sse < mieux.sse - EGALITE) ? { a: m.a, sse: m.sse, g, k } : mieux);
  const carres = y => y.reduce((n, v) => n + v * v, 0);

  /** Le niveau d'une forme : sa prédiction au travail moyen ÷ ce travail. Entre 0,5 et 2, comme a. */
  const niveau = (f, q, m) => (m > 0 ? f.predire(q, { simule: m }) / m : null);
  const dansLesBornesDeA = x => fini(x) && x >= A_MIN && x <= A_MAX;

  /** Un paramètre relu d'une sauvegarde : un nombre entre ses bornes (`strict` : plus grand que le minimum). */
  function relu(q, k, min, max, ou, strict) {
    const v = q[k];
    if (!fini(v) || v > max || (strict ? v <= min : v < min))
      throw new Error(ou + ' : ' + k + ' hors de ses bornes (' + (strict ? 'plus de ' + fr(min) : fr(min)) + ' à ' + fr(max) + ').');
    return v;
  }

  /* ----------------------------------------------------------------------
   *  « puissance » : a × x^p
   * --------------------------------------------------------------------*/

  const puissance = {
    id: 'puissance', nom: 'puissance', variables: ['simule'],
    bornes: 'p sur la grille 0,20 ; 0,25 ; … ; 1, hors de ses deux bouts (à 1, c’est « × a ») ; a positif ; le niveau (la prédiction au travail moyen ÷ ce travail) entre 0,5 et 2',
    apprendre(jours) {
      const x = jours.map(travail), y = jours.map(j => j.reel), yy = carres(y);
      // x^p le long de la grille : x^0,2, puis × x^0,05 à chaque pas (une multiplication par jour, pas une puissance).
      const z = x.map(v => Math.pow(v, P_MIN)), pas = x.map(v => Math.pow(v, P_PAS));
      let mieux = null;
      GRILLE_P.forEach((p, k) => {
        let zz = 0, zy = 0;
        for (let i = 0; i < z.length; i++) { zz += z[i] * z[i]; zy += z[i] * y[i]; z[i] *= pas[i]; }
        mieux = garde(mieux, ajuste(zz, zy, yy), p, k);
      });
      return mieux && mieux.a > 0 ? { a: mieux.a, p: mieux.g } : null;
    },
    predire: (q, j) => q.a * Math.pow(travail(j), q.p),
    verdict(q, o) {
      if (q.p <= P_MIN + EPS || q.p >= P_MAX - EPS) return { ok: false, raison: 'refusé : p en butée (' + fr(q.p) + (q.p >= P_MAX - EPS ? ' : c’est « × a »)' : ')') };
      const n = niveau(this, q, o.moyenne);
      return dansLesBornesDeA(n) ? { ok: true, raison: 'accepté : p = ' + fr(q.p) + ' et le niveau (' + fr(n) + ') dans leurs bornes' }
        : { ok: false, raison: 'refusé : hors bornes (niveau = ' + (n === null ? '—' : fr(n)) + ')' };
    },
    garder: q => ({ a: q.a, p: q.p }),
    relire: (q, ou) => ({ a: relu(q, 'a', 0, PARAMETRE_MAX, ou, true), p: relu(q, 'p', P_MIN, P_MAX, ou) }),
    formule: q => fr(q.a) + ' × (travail au barème) puissance ' + fr(q.p)
  };

  /* ----------------------------------------------------------------------
   *  « logarithme » : b + a × ln(1 + x)
   * --------------------------------------------------------------------*/

  const ln1 = j => Math.log(1 + travail(j));
  const logarithme = {
    id: 'logarithme', nom: 'logarithme', variables: ['simule'],
    bornes: 'a positif et b positif ou nul : des moindres carrés libres hors de là mettent b en butée (b = 0) ; le niveau (la prédiction au travail moyen ÷ ce travail) entre 0,5 et 2',
    apprendre(jours) {
      const z = jours.map(ln1), y = jours.map(j => j.reel), mz = moyenne(z), my = moyenne(y);
      const v = z.reduce((n, x) => n + (x - mz) ** 2, 0);
      if (!(v > EPS)) return null;
      const a = z.reduce((n, x, i) => n + (x - mz) * (y[i] - my), 0) / v, b = my - a * mz;
      if (a > 0 && b >= 0) return { a, b };
      // Hors bornes : la courbe passe par zéro (b = 0), et le candidat est en butée.
      const m = proportion(z, y);
      return m && m.a > 0 ? { a: m.a, b: 0, butee: true, aLibre: a, bLibre: b } : null;
    },
    predire: (q, j) => (q.b || 0) + q.a * ln1(j),
    verdict(q, o) {
      if (q.butee) return { ok: false, raison: 'refusé : b en butée (moindres carrés libres : a = ' + fr(q.aLibre) + ' ; b = ' + fr(q.bLibre) + ')' };
      const n = niveau(this, q, o.moyenne);
      return dansLesBornesDeA(n) ? { ok: true, raison: 'accepté : a, b et le niveau (' + fr(n) + ') dans leurs bornes' }
        : { ok: false, raison: 'refusé : hors bornes (niveau = ' + (n === null ? '—' : fr(n)) + ')' };
    },
    garder: q => ({ a: q.a, b: q.b }),
    relire: (q, ou) => ({ a: relu(q, 'a', 0, PARAMETRE_MAX, ou, true), b: relu(q, 'b', 0, PARAMETRE_MAX, ou) }),
    formule: q => (q.b ? fr(q.b) + ' + ' : '') + fr(q.a) + ' × ln(1 + travail au barème)'
  };

  /* ----------------------------------------------------------------------
   *  « plancher » et « plafond » : le plus grand, le plus petit, de c et a × x
   * --------------------------------------------------------------------*/

  /** La fiche d'un seuil : `extreme` = Math.max (le plancher) ou Math.min (le plafond). */
  function seuil(id, extreme, mots) {
    return {
      id, nom: id, variables: ['simule'],
      bornes: 'a entre 0,5 et 2 ; c = a × s, le seuil s sur une grille de ' + SEUILS + ' valeurs du plus petit au plus grand travail au barème des jours appris, hors de ses deux bouts (le '
        + id + ' n’y joue aucun jour — c’est « × a » — ou les joue tous — c’est « constante »)',
      apprendre(jours) {
        const x = jours.map(travail), y = jours.map(j => j.reel), n = x.length, bas = Math.min(...x), haut = Math.max(...x);
        if (!(haut - bas > 1e-9)) return null;
        // Les jours rangés par travail croissant, et les cumuls Σy, Σx², Σxy des premiers : chaque seuil se juge sans reparcourir les jours.
        const ordre = x.map((_, i) => i).sort((i, j) => x[i] - x[j]), sy = [0], sxx = [0], sxy = [0];
        ordre.forEach((i, r) => { sy.push(sy[r] + y[i]); sxx.push(sxx[r] + x[i] * x[i]); sxy.push(sxy[r] + x[i] * y[i]); });
        const yy = carres(y), plancher = extreme(bas, haut) === haut;
        let sous = 0, m = null;
        for (let k = 0; k < SEUILS; k++) {
          const s = k === SEUILS - 1 ? haut : bas + (haut - bas) * k / (SEUILS - 1);
          while (sous < n && x[ordre[sous]] <= s) sous++;
          // Sous le seuil (les `sous` premiers jours), le plancher tient le seuil et le plafond suit x ; au-dessus, l'inverse.
          const zz = plancher ? sous * s * s + sxx[n] - sxx[sous] : sxx[sous] + (n - sous) * s * s;
          const zy = plancher ? s * sy[sous] + sxy[n] - sxy[sous] : sxy[sous] + s * (sy[n] - sy[sous]);
          m = garde(m, ajuste(zz, zy, yy), s, k);
        }
        if (!m || !(m.a > 0)) return null;
        // Au bout de la grille où a × x l'emporte partout, le seuil ne joue aucun jour ; à l'autre, il les joue tous.
        const aucun = plancher ? 0 : SEUILS - 1, tous = SEUILS - 1 - aucun;
        return { a: m.a, c: m.a * m.g, seuil: m.g, ...(m.k === aucun ? { butee: 'aucun' } : m.k === tous ? { butee: 'tous' } : {}) };
      },
      predire: (q, j) => extreme(q.c, q.a * travail(j)),
      verdict(q) {
        if (q.butee) return { ok: false, raison: 'refusé : c en butée (le ' + id + ' ' + (q.butee === 'aucun' ? 'ne joue aucun jour : c’est « × a »)' : 'joue tous les jours : c’est « constante »)') };
        return dansLesBornesDeA(q.a) ? { ok: true, raison: 'accepté : a et c dans leurs bornes (le ' + id + ' joue ' + mots + ' ' + fr(q.seuil) + ' ETP au barème)' }
          : { ok: false, raison: 'refusé : hors bornes (a = ' + fr(q.a) + ')' };
      },
      garder: q => ({ a: q.a, c: q.c }),
      relire: (q, ou) => ({ a: relu(q, 'a', A_MIN, A_MAX, ou), c: relu(q, 'c', 0, PARAMETRE_MAX, ou) }),
      formule: q => 'le plus ' + (id === 'plancher' ? 'grand' : 'petit') + ' de ' + fr(q.c) + ' et ' + fr(q.a) + ' × (travail au barème)'
    };
  }
  const plancher = seuil('plancher', Math.max, 'sous'), plafond = seuil('plafond', Math.min, 'au-dessus de');

  /* ----------------------------------------------------------------------
   *  Le catalogue, et la formule en clair de tout modèle
   * --------------------------------------------------------------------*/

  /** Les formes ajoutées, de la plus simple à la plus riche (après « × a », « b + a × », « × a × jour »). */
  const ORDRE = ['puissance', 'logarithme', 'plancher', 'plafond'];
  const FORMES = { puissance, logarithme, plancher, plafond };

  const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  /** Les références et les trois formes de l'évolution 11 c, en clair. */
  const EN_CLAIR = {
    'moteur': () => 'le travail au barème',
    'constante': q => fr(q.c) + ', quel que soit le travail au barème',
    'x-a': q => fr(q.a) + ' × (travail au barème)',
    'b-x-a': q => fr(q.b) + ' + ' + fr(q.a) + ' × (travail au barème)',
    'x-a-jour': q => fr(q.a) + ' × (travail au barème) × le facteur du jour (' + (q.jours || []).map((f, k) => JOURS[k] + ' ' + fr(f)).join(' ; ') + ')'
  };

  /**
   * La formule d'un modèle en clair, avec ses paramètres gardés : « heures réelles ≈ 3,2 × (travail au barème)
   * puissance 0,6 ». Les deux côtés se comptent en ETP par jour. Un modèle inconnu : une chaîne vide.
   */
  function formule(modele, parametres) {
    const f = FORMES[modele], q = parametres || {};
    const droite = f ? f.formule(q) : EN_CLAIR[modele] ? EN_CLAIR[modele](q) : '';
    return droite ? 'heures réelles ≈ ' + droite : '';
  }

  const api = { A_MIN, A_MAX, P_MIN, P_MAX, P_PAS, GRILLE_P, SEUILS, ORDRE, FORMES, formule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalageFormes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
