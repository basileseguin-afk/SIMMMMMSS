/* ==========================================================================
 *  LE PLAN REJOUÉ : LE CADRAGE, LES TEXTES, LA BANDE DES CHIFFRES, LE CURSEUR
 *  (version 1, évolution 14 a — README, « Le plan rejoué »)
 *  ------------------------------------------------------------------------
 *  D'abord la vue d'ensemble, puis le zoom, le détail à la demande :
 *    — « Tout voir » (et l'ouverture) fait tenir le plan entier dans la zone
 *      visible, avec une marge de 24 px ; « Cadrer » cadre le service choisi ;
 *    — les noms des services gardent la même taille à l'écran à tout zoom ;
 *      les sous-titres n'apparaissent qu'à partir du zoom où ils se lisent ;
 *    — les chiffres de l'heure rejouée sont une bande d'une ligne au-dessus du
 *      plan, cumulés jusqu'à cette heure : jamais « — » en cours de journée ;
 *    — le curseur du temps marque les jours et les départs des vols ;
 *    — à l'ouverture, l'heure rejouée est le créneau où le plus de personnes
 *      sont au travail (les indicateurs de charge de l'évolution 12).
 *  Rien n'est calculé ici qui ne le soit déjà : replay.js pour l'instant,
 *  moteur/indicateurs.js pour la charge. Les fonctions sans navigateur se
 *  testent sous Node ; sim.js branche le reste.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const R = () => (enNode ? require('./replay.js') : root.OrlyReplay);

  /** La marge autour du plan cadré, en pixels d'écran. */
  const MARGE = 24;
  /** Les noms des services, en pixels d'écran, quel que soit le zoom (12 à 16). */
  const NOM_PX = 13;
  /** Un sous-titre ne se montre qu'à partir de cette taille à l'écran ; au-delà, il ne dépasse pas SOUS_MAX_PX. */
  const SOUS_MIN_PX = 11, SOUS_MAX_PX = 13;
  /** La taille naturelle d'un sous-titre, en unités du plan (celle du dessin d'origine). */
  const SOUS_UNITES = 30;
  /** Le décalage d'un nom depuis le coin de sa zone, en pixels d'écran. */
  const RETRAIT_PX = 8;
  const JOUR = 1440;

  /* ---- le cadrage ------------------------------------------------------------- */

  /** La boîte qui contient toutes les boîtes données ({x, y, w, h}) ; null sans boîte. */
  function bornes(boites) {
    const ok = (boites || []).filter(b => b && [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w >= 0 && b.h >= 0);
    if (!ok.length) return null;
    const x = Math.min(...ok.map(b => b.x)), y = Math.min(...ok.map(b => b.y));
    return { x, y, w: Math.max(...ok.map(b => b.x + b.w)) - x, h: Math.max(...ok.map(b => b.y + b.h)) - y };
  }

  /** Pixels d'écran par unité du plan, au zoom 1 : la `viewBox` `vue` posée dans `ecran` (preserveAspectRatio « meet »). */
  function echelle(vue, ecran) {
    if (!vue || !ecran || !(ecran.w > 0) || !(ecran.h > 0)) return 0;
    return Math.min(ecran.w / vue.w, ecran.h / vue.h);
  }

  /**
   * Le zoom et le déplacement qui font tenir la boîte `b` (unités du plan) dans l'écran, à `marge` pixels des bords :
   * { k, tx, ty }, pour la transformation translate(tx ty) scale(k) d'un plan dont la `viewBox` est `vue`.
   */
  function cadrage(b, vue, ecran, marge = MARGE) {
    const s = echelle(vue, ecran);
    if (!b || !s) return null;
    const lw = Math.max(1, ecran.w - 2 * marge), lh = Math.max(1, ecran.h - 2 * marge);
    const k = Math.min(lw / (Math.max(1, b.w) * s), lh / (Math.max(1, b.h) * s));
    return { k, tx: vue.x + vue.w / 2 - (b.x + b.w / 2) * k, ty: vue.y + vue.h / 2 - (b.y + b.h / 2) * k };
  }

  /* ---- les textes du plan ------------------------------------------------------- */

  /**
   * Les tailles des textes d'une zone, pour `px` pixels d'écran par unité du plan : le nom à NOM_PX à l'écran, les
   * sous-titres à leur taille naturelle bornée à SOUS_MAX_PX, cachés sous SOUS_MIN_PX. En unités du plan.
   */
  function tailles(px) {
    const u = 1 / px, sousEcran = SOUS_UNITES * px;
    return {
      nom: NOM_PX * u, retrait: RETRAIT_PX * u,
      sous: Math.min(SOUS_UNITES, SOUS_MAX_PX * u), sousVisibles: sousEcran >= SOUS_MIN_PX,
      sousEcran: Math.min(sousEcran, SOUS_MAX_PX)
    };
  }

  /* ---- les chiffres de la bande ------------------------------------------------- */

  const pl = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);

  /**
   * Les chiffres de la bande, cumulés jusqu'à `t` : les commandes prêtes jusqu'ici (et combien en retard), celles qui
   * auraient dû l'être, les services au travail et en attente à cet instant (replay.js).
   */
  function chiffresCumules(resultat, t) {
    const c = R().chiffresA(resultat, t);
    return { pretes: c.sorties, total: c.suivies, pretesEnRetard: c.sortiesEnRetard, enRetard: c.enRetard, auTravail: c.auTravail, enAttente: c.enAttente };
  }

  /** La phrase de la bande, en morceaux : jamais « — » ; ce qui est en retard se dit. */
  function morceaux(c) {
    const out = [];
    if (!c.total) out.push({ texte: 'aucune commande à préparer' });
    else {
      out.push({ texte: 'commandes prêtes jusqu’ici : ' + c.pretes + ' sur ' + c.total
        + (!c.pretes ? '' : c.pretesEnRetard ? ', dont ' + c.pretesEnRetard + ' en retard' : (c.pretes > 1 ? ', toutes à l’heure' : ', à l’heure')),
      etat: c.pretesEnRetard ? 'retard' : null });
      if (c.enRetard) out.push({ texte: pl(c.enRetard, 'commande en retard', 'commandes en retard') + ' à cette heure', etat: 'retard' });
    }
    out.push({ texte: pl(c.auTravail, 'service au travail', 'services au travail') + (c.enAttente ? ', ' + c.enAttente + ' ' + (c.enAttente > 1 ? 'attendent' : 'attend') + ' le service d’avant' : ''),
      etat: c.enAttente ? 'attente' : null });
    return out;
  }

  /* ---- l'heure d'ouverture : le pic de travail ------------------------------------ */

  /**
   * Le début du créneau où le plus de personnes sont au travail, sur l'horloge du jour J (celle du rejeu) : la somme
   * des créneaux de tous les services (indicateurs de charge, `k = OrlyIndicateurs.journee(...)`), décalés de leur jour.
   * `somme` : la fonction qui les additionne (OrlyChargeVue.creneauxDuService) ; `pic` : OrlyIndicateurs.pic. Null sans
   * personne au travail.
   */
  function heureDuPic(k, somme, pic) {
    if (!k || !(k.services || []).length) return null;
    const total = somme(k.services);
    const p = total && total.auTravail ? pic(total.auTravail) : null;
    return p && p.personnes > 0 ? p.debut : null;
  }

  /* ---- les repères du curseur ----------------------------------------------------- */

  /** Le nom d'un jour, relatif au jour J. */
  const nomJour = j => (j === 0 ? 'J' : 'J' + (j > 0 ? '+' : '−') + Math.abs(j));

  /**
   * Les repères du curseur du temps, de `debut` à `fin` (minutes) : les jours (à chaque minuit, et le jour du début),
   * et les départs des vols (`departs`, minutes). Chacun avec sa position, de 0 à 1.
   */
  function reperes(debut, fin, departs) {
    const span = fin - debut;
    if (!(span > 0)) return { jours: [], departs: [] };
    const pos = t => (t - debut) / span;
    // Le jour du début se nomme au début du curseur, sauf si le minuit suivant est tout près (leurs noms se chevaucheraient).
    const jours = (Math.ceil(debut / JOUR) * JOUR - debut) / span < 0.2 && debut % JOUR !== 0 ? [] : [{ t: debut, nom: nomJour(Math.floor(debut / JOUR)), pos: 0, minuit: false }];
    for (let t = Math.ceil(debut / JOUR) * JOUR + 0; t <= fin; t += JOUR) {
      if (t === debut && jours.length) { jours[0].minuit = true; continue; }
      jours.push({ t, nom: nomJour(t / JOUR), pos: pos(t), minuit: true });
    }
    const vus = new Set();
    const deps = (departs || []).filter(t => Number.isFinite(t) && t >= debut && t <= fin).sort((a, b) => a - b)
      .filter(t => (vus.has(t) ? false : vus.add(t))).map(t => ({ t, pos: pos(t) }));
    return { jours, departs: deps };
  }

  /* ---- dans la page ---------------------------------------------------------------- */

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** La bande des chiffres : « À 08:15 · commandes prêtes jusqu'ici : … ». `quand` : l'heure écrite. */
  function rendreBande(box, quand, c) {
    if (!box) return;
    const html = '<span class="pr-quand">À ' + esc(quand) + '</span>'
      + morceaux(c).map(m => '<span class="pr-chiffre"' + (m.etat ? ' data-etat="' + m.etat + '"' : '') + '>' + esc(m.texte) + '</span>').join('');
    if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  }

  /** Les repères sous le curseur : les jours (un trait et leur nom), les départs des vols (un trait fin). */
  function rendreReperes(box, r, hh) {
    if (!box) return;
    const html = r.jours.map(j => '<span class="pr-jour' + (j.minuit ? ' minuit' : '') + '" style="left:' + (j.pos * 100).toFixed(3) + '%"><b>' + esc(j.nom) + '</b></span>').join('')
      + r.departs.map(d => '<span class="pr-depart" style="left:' + (d.pos * 100).toFixed(3) + '%" title="' + esc('Départ à ' + hh(d.t)) + '"></span>').join('');
    if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  }

  const api = { MARGE, NOM_PX, SOUS_MIN_PX, SOUS_MAX_PX, bornes, echelle, cadrage, tailles, chiffresCumules, morceaux, heureDuPic, reperes, nomJour,
    rendreBande, rendreReperes };
  if (enNode) module.exports = api;
  else root.OrlyPlanRejoue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
