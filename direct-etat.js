/* ==========================================================================
 *  CE QUE LA VUE EN DIRECT LIT DE LA JOURNÉE (évolution 16, v1)
 *  ------------------------------------------------------------------------
 *  La vue en direct ne calcule rien : elle LIT le résultat de la journée
 *  (moteur/production.js), ses indicateurs de charge (moteur/indicateurs.js)
 *  et ses réponses (moteur/reponses.js), à l'heure rejouée. Ce module, sans
 *  navigateur, range ce qu'elle y lit :
 *    — les personnes de chaque équipe, par état, en nombres entiers : celles
 *      des créneaux de 15 minutes des indicateurs (au travail, en pause, sans
 *      travail, en appui) ;
 *    — les lots qui attendent devant chaque service : les séjours en stock du
 *      résultat (de, vers, entrée, sortie).
 *  Aucune règle, aucun seuil n'est ajouté ici.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const PAS = 15, JOUR = 1440;
  /** Les états d'une personne, dans l'ordre où ils se partagent les présents. */
  const ETATS = ['auTravail', 'enPause', 'sansTravail', 'enAppui'];

  /** La valeur d'une série de créneaux ({ debut, valeurs }) à la minute `t` de son horloge ; 0 hors de la série. */
  function valeurA(serie, t) {
    if (!serie || !Array.isArray(serie.valeurs)) return 0;
    const i = Math.floor((t - serie.debut) / PAS);
    return i >= 0 && i < serie.valeurs.length ? serie.valeurs[i] || 0 : 0;
  }

  /**
   * `total` personnes entières réparties selon des parts (des nombres ≥ 0) : chacune reçoit sa part entière, et les
   * personnes qui restent vont aux plus grands restes (à égalité, la première). La somme rendue est toujours `total`.
   */
  function repartir(total, parts) {
    const n = Math.max(0, Math.round(total)), somme = parts.reduce((s, x) => s + Math.max(0, x || 0), 0);
    if (!n) return parts.map(() => 0);
    if (!(somme > 0)) return parts.map((_, i) => (i === 0 ? n : 0));
    const voulu = parts.map(x => Math.max(0, x || 0) * n / somme), out = voulu.map(Math.floor);
    const restes = voulu.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((p, q) => q.r - p.r || p.i - q.i);
    for (let k = 0, reste = n - out.reduce((s, x) => s + x, 0); k < reste; k++) out[restes[k % restes.length].i]++;
    return out;
  }

  /**
   * Les personnes d'une équipe à l'heure `t` (minutes du jour J, l'horloge du rejeu), par état, en nombres entiers :
   * { presents, auTravail, enPause, sansTravail, enAppui }. `equipe` : une équipe des indicateurs (ses créneaux sont sur
   * l'horloge de son jour de travail). Les présents sont ceux du créneau, arrondis ; ils se partagent entre les états
   * selon le créneau. Une équipe sans mesure d'occupation (un appui, une mise à disposition, un handling) est « en appui ».
   */
  function personnesDe(equipe, t) {
    const c = (equipe && equipe.creneaux) || {}, local = t - ((equipe && equipe.jour) || 0) * JOUR;
    const presents = Math.round(valeurA(c.presents, local));
    const vide = { presents, auTravail: 0, enPause: 0, sansTravail: 0, enAppui: 0 };
    if (!presents) return vide;
    if (!c.auTravail) return { ...vide, enAppui: presents };
    const auTravail = valeurA(c.auTravail, local), enPause = valeurA(c.enPause, local);
    const sans = Math.max(0, valeurA(c.presents, local) - auTravail - enPause);
    const [a, p, s] = repartir(presents, [auTravail, enPause, sans]);
    // Rien de mesuré dans ce créneau (une présence sans travail ni pause) : sans travail.
    return auTravail + enPause + sans > 0 ? { ...vide, auTravail: a, enPause: p, sansTravail: s } : { ...vide, sansTravail: presents };
  }

  /**
   * Les lots qui attendent devant chaque service à `t` : { service: { lots, repas } }, d'après les séjours en stock du
   * résultat. Une commande compte une fois, même livrée par deux services ; `chargement` : ce qui est prêt avant d'être chargé.
   */
  function lotsEnAttente(resultat, t) {
    const out = {}, vus = new Map();
    for (const s of ((resultat && resultat.stocks && resultat.stocks.sejours) || [])) {
      if (!(t >= s.entree && t < s.sortie)) continue;
      const k = s.vers + '|' + s.classe + '|' + (s.vol ?? '');
      if (vus.has(k)) continue;
      vus.set(k, s);
      const o = out[s.vers] || (out[s.vers] = { lots: 0, repas: 0 });
      o.lots++; o.repas += s.repas || 0;
    }
    return out;
  }

  /**
   * La journée à l'heure `t` : { t, equipes: { id: personnes }, services: { id: personnes + lots + repas } }.
   * `journee` : { r, k } — le résultat et ses indicateurs.
   */
  function etatA(journee, t) {
    const k = journee && journee.k, r = journee && journee.r, equipes = {}, services = {};
    const service = id => services[id] || (services[id] = { presents: 0, auTravail: 0, enPause: 0, sansTravail: 0, enAppui: 0, lots: 0, repas: 0 });
    for (const e of (k && k.equipes) || []) {
      const p = personnesDe(e, t), s = service(e.service);
      equipes[e.id] = p;
      for (const m of ['presents', ...ETATS]) s[m] += p[m];
    }
    for (const [id, x] of Object.entries(lotsEnAttente(r, t))) { const s = service(id); s.lots = x.lots; s.repas = x.repas; }
    return { t, equipes, services };
  }

  const api = { PAS, ETATS, valeurA, repartir, personnesDe, lotsEnAttente, etatA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectEtat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
