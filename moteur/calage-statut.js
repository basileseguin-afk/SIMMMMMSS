/* ==========================================================================
 *  À LA LIMITE, OU EN SUR-EFFECTIF — le statut d'une ligne calée, et la borne
 *  de son besoin (banc d'essai de la version 1, évolution 17 b —
 *  docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Une formule apprise sur les heures dit ce que l'unité met, pas toujours ce
 *  qu'il faut : un service en sur-effectif ne montre pas son besoin dans ses
 *  heures. Deux critères, sur les jours appris d'une ligne :
 *    1. les heures réelles suivent le travail au barème : leur corrélation de
 *       rang vaut au moins 0,3 ;
 *    2. les heures supp montent avec la charge : leur part (heures supp ÷
 *       heures) est plus haute dans le tiers des jours les plus chargés que
 *       dans le tiers des moins chargés.
 *  Les deux : « à la limite » — la formule retenue est aussi le besoin. Aucun :
 *  « en sur-effectif ». Un seul : « indéterminé », et l'on dit lequel manque.
 *  Sans heures supp dans le fichier du réel, la corrélation seule décide.
 *  Hors « à la limite », la formule retenue s'appelle « effectif mis », et le
 *  besoin se borne : au plus le travail au barème du jour × le rythme des
 *  jours chargés (la médiane de réel ÷ travail au barème sur le dixième des
 *  jours les plus chargés, cinq jours au moins), sans dépasser le prévu.
 *  Le statut ne mesure pas l'occupation réelle des postes : elle demande une
 *  observation sur place. Déterministe, sans navigateur.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Les heures réelles « suivent » le travail au barème à partir de cette corrélation de rang (Spearman). */
  const CORRELATION_LIMITE = 0.3;
  /** La part des heures supp se compare entre le tiers des jours les plus chargés et le tiers des moins chargés. */
  const PART_DES_TIERS = 1 / 3, JOURS_TIERS_MIN = 3;
  /** Le rythme des jours chargés se lit sur le dixième des jours les plus chargés, s'il en compte au moins cinq. */
  const PART_JOURS_CHARGES = 0.1, JOURS_CHARGES_MIN = 5;
  /** Un rythme gardé dans une politique : réel ÷ travail au barème, positif, sous cette borne de saisie. */
  const RYTHME_MAX = 1000;
  const NOMS = { 'limite': 'à la limite', 'sur-effectif': 'en sur-effectif', 'indetermine': 'indéterminé' };
  const fini = x => typeof x === 'number' && Number.isFinite(x);
  /** Un statut connu : un des trois codes, et rien d'autre (ni un tableau, ni un nom hérité comme « constructor »). */
  const connu = statut => typeof statut === 'string' && Object.prototype.hasOwnProperty.call(NOMS, statut);
  /** Ce que dit la formule retenue : le besoin d'une ligne à la limite ; sinon l'effectif que l'unité met. */
  const lectureDe = statut => (!connu(statut) ? null : statut === 'limite' ? 'besoin' : 'effectif mis');
  /** Un rythme des jours chargés qui se garde : un nombre positif, sous la borne de saisie. */
  const rythmeValide = r => fini(r) && r > 0 && r <= RYTHME_MAX;

  const somme = l => l.reduce((a, b) => a + b, 0);
  const moyenne = l => (l.length ? somme(l) / l.length : null);
  /** Un nombre à la française, arrondi à `d` décimales. */
  const fr = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d + 0).replace('.', ',');
  const pourcent = x => fr(x * 100, 1) + ' %';
  /** Des jours rangés du moins chargé au plus chargé (à travail égal, par date). */
  const parCharge = jours => jours.slice().sort((x, y) => x.simule - y.simule || String(x.date).localeCompare(String(y.date)));

  /** Les rangs d'une série, de 1 à n ; des ex aequo prennent leur rang moyen. */
  function rangs(l) {
    const tri = l.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v), out = new Array(l.length);
    for (let k = 0; k < tri.length;) {
      let m = k;
      while (m + 1 < tri.length && tri[m + 1].v === tri[k].v) m++;
      for (let q = k; q <= m; q++) out[tri[q].i] = (k + m) / 2 + 1;
      k = m + 1;
    }
    return out;
  }

  /** La corrélation de rang (Spearman) de deux séries : celle de leurs rangs ; null si l'une ne varie pas. */
  function correlationDeRang(x, y) {
    const rx = rangs(x), ry = rangs(y), mx = moyenne(rx), my = moyenne(ry);
    const vx = somme(rx.map(v => (v - mx) ** 2)), vy = somme(ry.map(v => (v - my) ** 2));
    if (!(vx > 0) || !(vy > 0)) return null;
    return somme(rx.map((v, i) => (v - mx) * (ry[i] - my))) / Math.sqrt(vx * vy);
  }

  /**
   * La part des heures supp (Σ heures supp ÷ Σ heures) dans le tiers des jours les plus chargés et dans le tiers
   * des moins chargés, sur les jours où elles sont connues. null sans la colonne des heures supp ; si elles ne
   * sont connues que sur moins de `joursMin` jours (trois au moins : un par tiers), `insuffisant` dit combien.
   */
  function heuresSuppParTiers(jours, joursMin = JOURS_TIERS_MIN) {
    if (!jours.some(j => j.heuresSupp !== undefined)) return null;
    const connus = parCharge(jours.filter(j => fini(j.heuresSupp) && fini(j.heures) && j.heures > 0));
    if (connus.length < Math.max(joursMin, JOURS_TIERS_MIN)) return { insuffisant: connus.length };
    const n = Math.floor(connus.length * PART_DES_TIERS + 1e-9);
    const part = l => somme(l.map(j => j.heuresSupp)) / somme(l.map(j => j.heures));
    const partCalme = part(connus.slice(0, n)), partChargee = part(connus.slice(connus.length - n));
    return { jours: connus.length, parTiers: n, partCalme, partChargee, monte: partChargee > partCalme };
  }

  /**
   * Le statut d'une ligne : `jours` = ses jours appris ({ date, reel, simule } ; avec la colonne des heures supp,
   * { heures, heuresSupp } aussi). Rend { code, nom, raison, correlation, suit, supp } et, indéterminé, `manque`
   * (« correlation » ou « supp »). null si le travail au barème ne varie pas (rien à suivre). Des heures réelles
   * qui ne varient pas du tout ne le suivent pas : `correlation` vaut alors null, et la raison le dit.
   */
  function statutDe(jours, o = {}) {
    const l = jours.filter(j => fini(j.reel) && fini(j.simule)), x = l.map(j => j.simule);
    if (!(Math.max(...x) > Math.min(...x))) return null;
    const correlation = correlationDeRang(x, l.map(j => j.reel));
    const joursMin = Math.max(o.joursMin || 0, JOURS_TIERS_MIN);
    const suit = correlation !== null && correlation >= CORRELATION_LIMITE, tiers = heuresSuppParTiers(l, joursMin);
    const supp = tiers && tiers.insuffisant === undefined ? tiers : null;
    const motsSuit = suit ? 'les heures réelles suivent le travail au barème (corrélation de rang ' + fr(correlation) + ')'
      : 'les heures réelles ne suivent pas le travail au barème (' + (correlation === null ? 'elles ne varient pas'
        : 'corrélation de rang ' + fr(correlation) + ', sous ' + fr(CORRELATION_LIMITE)) + ')';
    if (!supp) {
      const code = suit ? 'limite' : 'sur-effectif';
      const pourquoi = tiers ? 'heures supp connues sur ' + tiers.insuffisant + ' jour' + (tiers.insuffisant > 1 ? 's' : '') + ' seulement (moins de ' + joursMin + ')'
        : 'sans heures supp dans le fichier du réel';
      return { code, nom: NOMS[code], raison: NOMS[code] + ' : ' + motsSuit + ' ; ' + pourquoi + ', le statut se juge sur la corrélation seule', correlation, suit, supp: null };
    }
    const motsSupp = 'la part des heures supp ' + (supp.monte ? 'monte' : 'ne monte pas') + ' avec la charge (' + pourcent(supp.partChargee)
      + ' le tiers des jours les plus chargés, ' + pourcent(supp.partCalme) + ' le tiers des moins chargés)';
    const code = suit && supp.monte ? 'limite' : !suit && !supp.monte ? 'sur-effectif' : 'indetermine';
    // Indéterminé : le critère tenu d'abord, puis celui qui manque.
    const raison = code !== 'indetermine' ? motsSuit + ' et ' + motsSupp : suit ? motsSuit + ', mais ' + motsSupp : motsSupp + ', mais ' + motsSuit;
    return { code, nom: NOMS[code], raison: NOMS[code] + ' : ' + raison, correlation, suit, supp, ...(code === 'indetermine' ? { manque: suit ? 'supp' : 'correlation' } : {}) };
  }

  /**
   * Le rythme des jours chargés : la médiane de réel ÷ travail au barème sur le dixième des jours les plus
   * chargés. { rythme, jours } ; moins de cinq jours dans ce dixième (ou un travail nul) : { rythme: null, jours, raison }.
   */
  function rythmeDesJoursCharges(jours) {
    const n = Math.floor(jours.length * PART_JOURS_CHARGES + 1e-9), charges = parCharge(jours).slice(jours.length - n);
    if (n < JOURS_CHARGES_MIN) return { rythme: null, jours: n, raison: 'pas de borne : ' + n + ' jour' + (n > 1 ? 's' : '') + ' dans le dixième des jours les plus chargés, il en faut ' + JOURS_CHARGES_MIN };
    if (charges.some(j => !(j.simule > 0))) return { rythme: null, jours: n, raison: 'pas de borne : un jour chargé sans travail au barème' };
    const r = charges.map(j => j.reel / j.simule).sort((x, y) => x - y), m = r.length >> 1, rythme = r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2;
    // Un rythme nul (aucune heure réelle les jours chargés) ou démesuré ne borne rien : il ne se garde pas.
    if (!rythmeValide(rythme)) return { rythme: null, jours: n, raison: 'pas de borne : le rythme des jours chargés (' + fr(rythme) + ') n’est pas un nombre positif sous ' + RYTHME_MAX };
    return { rythme, jours: n };
  }

  /**
   * Le besoin « au plus » d'un jour, pour une ligne gardée ({ statut, rythmeCharge }) : son travail au barème ×
   * le rythme des jours chargés, sans dépasser le prévu. null à la limite (la formule est le besoin), sans
   * rythme, ou pour une ligne gardée avant l'évolution 17.
   */
  function besoinAuPlus(m, simule, prevu) {
    if (!m || lectureDe(m.statut) !== 'effectif mis' || !rythmeValide(m.rythmeCharge)) return null;
    return Math.min(prevu, simule * m.rythmeCharge);
  }

  /** Le statut et le rythme d'une ligne de politique relue d'une sauvegarde : gardés s'ils sont bien formés, sinon l'erreur dit quoi. */
  function relire(l, ou) {
    const out = {};
    if (l.statut !== undefined && l.statut !== null) {
      if (!connu(l.statut)) throw new Error(ou + ' : statut inconnu « ' + String(l.statut).slice(0, 40) + ' ».');
      out.statut = l.statut;
    }
    if (l.rythmeCharge !== undefined && l.rythmeCharge !== null) {
      if (!rythmeValide(l.rythmeCharge)) throw new Error(ou + ' : le rythme des jours chargés est un nombre positif.');
      out.rythmeCharge = l.rythmeCharge;
    }
    return out;
  }

  const api = { CORRELATION_LIMITE, PART_DES_TIERS, PART_JOURS_CHARGES, JOURS_CHARGES_MIN, NOMS, connu, lectureDe, rythmeValide, rangs, correlationDeRang, heuresSuppParTiers,
    statutDe, rythmeDesJoursCharges, besoinAuPlus, relire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalageStatut = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
