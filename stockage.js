/* ==========================================================================
 *  PLUSIEURS ONGLETS NE S'ÉCRASENT PLUS (banc d'essai, correction 14)
 *
 *  Chaque onglet garde ses données en mémoire et réécrit tout l'enregistrement
 *  à chaque modification (ateliers.js enregistrer(), flow-center.js save()…).
 *  Un onglet resté ouvert sur un état ancien écrasait, à sa première action,
 *  ce qu'un autre onglet venait d'enregistrer, ou une sauvegarde restaurée
 *  ailleurs ; « Tout sauvegarder » exportait ensuite cet état ancien.
 *
 *  Les données du site (les clés « ory-… » et « orly-… », hors préférences
 *  d'affichage et hors tiroir de la version 2) portent un numéro de révision,
 *  augmenté à chaque écriture. Un onglet n'écrit que si la révision
 *  enregistrée est celle qu'il a lue ; sinon il n'écrit rien et le dit, par un
 *  bandeau qui ne se ferme pas. Quand un autre onglet écrit (l'événement
 *  `storage`), le même bandeau paraît tout de suite.
 *
 *  Ce script, chargé AVANT tous les autres, met un garde à la place de
 *  `localStorage` : le reste du code lit et écrit comme d'habitude, sans rien
 *  savoir (comme le tiroir de la version 2, v2/stockage-v2.js). Avec un seul
 *  onglet, les données écrites sont celles d'avant, à l'octet près ; seule
 *  s'ajoute la clé de la révision.
 * ==========================================================================*/
(function (root) {
  'use strict';

  var REVISION = 'ory-revision';
  var DU_SITE = /^(ory|orly)-/, TIROIR_V2 = 'ory-v2:';
  // Les préférences d'affichage (la dernière page ouverte, le service choisi,
  // le sens des diagrammes, le thème…) et le témoin de démarrage, que chaque
  // onglet pose en s'ouvrant : propres à chaque onglet, pas des données.
  var PREFERENCES = /^(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/;
  var TEXTE = 'Les données ont changé dans un autre onglet. Vos dernières modifications ici ne sont pas enregistrées.';

  /** Une clé des données du site, gardée par la révision. */
  function estDonnee(k) {
    return typeof k === 'string' && DU_SITE.test(k) && k.indexOf(TIROIR_V2) !== 0 && !PREFERENCES.test(k) && k !== REVISION;
  }
  /** L'événement `storage` d'un autre onglet nous concerne : une donnée, la révision, ou tout effacé (clé nulle). */
  function concerne(k) { return k === null || k === REVISION || estDonnee(k); }

  /**
   * Le garde d'un onglet sur le stockage `vrai`. Il lit la révision une fois,
   * à l'ouverture de l'onglet ; `surRetard` est appelé à chaque écriture
   * refusée et au signal d'un autre onglet.
   * @returns {{stockage:Storage, enRetard:()=>boolean, signaler:()=>void, revision:()=>string|null}}
   */
  function creerGarde(vrai, o) {
    var lue = vrai.getItem(REVISION), retard = false, surRetard = (o && o.surRetard) || function () {};
    // Tout effacer ôte la révision : la suivante repart au-dessus de la dernière connue, jamais d'un numéro déjà lu ailleurs.
    var plancher = 0;
    function signaler() { retard = true; surRetard(); }
    /** En retard : un autre onglet a écrit depuis notre lecture (son événement, ou la révision enregistrée, relue ici). */
    function enRetard() {
      if (!retard && vrai.getItem(REVISION) !== lue) signaler();
      return retard;
    }
    /** Écrire est permis tant que personne n'a écrit depuis notre lecture. */
    function permis() {
      if (enRetard()) { surRetard(); return false; }
      return true;
    }
    /** Après une écriture : la révision suivante. Si elle ne s'écrit pas (stockage plein), l'événement de la donnée avertit les autres onglets. */
    function suivante() {
      var r = String(Math.max(parseInt(lue, 10) || 0, plancher) + 1);
      try { vrai.setItem(REVISION, r); lue = r; } catch (e) { /* plein : la révision reste celle lue, et enregistrée */ }
    }
    var garde = {
      getItem: function (k) { return vrai.getItem(k); },
      key: function (i) { return vrai.key(i); },
      setItem: function (k, v) {
        if (!estDonnee(k)) return vrai.setItem(k, v);
        if (!permis() || vrai.getItem(k) === String(v)) return undefined;
        vrai.setItem(k, v); suivante(); return undefined;
      },
      removeItem: function (k) {
        if (!estDonnee(k)) return vrai.removeItem(k);
        if (!permis() || vrai.getItem(k) === null) return undefined;
        vrai.removeItem(k); suivante(); return undefined;
      },
      clear: function () {
        if (!permis()) return;
        plancher = Math.max(plancher, parseInt(lue, 10) || 0);
        vrai.clear(); lue = vrai.getItem(REVISION);
      }
    };
    Object.defineProperty(garde, 'length', { get: function () { return vrai.length; } });
    return { stockage: garde, enRetard: enRetard, signaler: signaler, revision: function () { return lue; } };
  }

  /** Le bandeau, en tête de page, sur la rangée des bandeaux (avec celui d'un démarrage incomplet) ; il ne se ferme pas : seul « Recharger » l'ôte. */
  function montrerBandeau(doc) {
    if (!doc || doc.querySelector('.donnees-changees')) return;
    if (!doc.body) { doc.addEventListener('DOMContentLoaded', function () { montrerBandeau(doc); }); return; }
    var b = doc.createElement('div'), p = doc.createElement('p'), bouton = doc.createElement('button');
    b.className = 'donnees-changees'; b.setAttribute('role', 'alert');
    p.textContent = TEXTE;
    bouton.type = 'button'; bouton.className = 'btn btn-sm'; bouton.textContent = 'Recharger';
    bouton.addEventListener('click', function () { doc.defaultView.location.reload(); });
    b.appendChild(p); b.appendChild(bouton);
    bandeaux(doc).prepend(b);
  }
  /** La rangée des bandeaux, en tête de page (sim.js y range aussi celui d'un démarrage incomplet). */
  function bandeaux(doc) {
    var r = doc.querySelector('body > .bandeaux');
    if (!r) { r = doc.createElement('div'); r.className = 'bandeaux'; doc.body.prepend(r); }
    return r;
  }

  /** Dans la page : le garde à la place de `localStorage`, et l'écoute des autres onglets. Faute de pouvoir le poser, la page fait comme avant. */
  function installer(win) {
    var vrai;
    try { vrai = win.localStorage; if (!vrai) return null; } catch (e) { return null; } // stockage indisponible : le site fait déjà sans
    var g = creerGarde(vrai, { surRetard: function () { montrerBandeau(win.document); } });
    try { Object.defineProperty(win, 'localStorage', { value: g.stockage, configurable: true }); } catch (e) { return null; }
    if (win.localStorage !== g.stockage) return null;
    win.addEventListener('storage', function (e) {
      if (e.storageArea && e.storageArea !== vrai) return;
      if (concerne(e.key)) g.signaler();
    });
    // Un onglet qui revient (du cache de navigation, d'un onglet en veille) n'a pas reçu les événements : il relit la révision.
    win.addEventListener('pageshow', function () { g.enRetard(); });
    win.document.addEventListener('visibilitychange', function () { if (!win.document.hidden) g.enRetard(); });
    return g;
  }

  var api = { REVISION: REVISION, TEXTE: TEXTE, estDonnee: estDonnee, concerne: concerne, creerGarde: creerGarde };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  var g = installer(root);
  root.OrlyStockage = {
    /** Un autre onglet a écrit depuis l'ouverture de celui-ci (la révision enregistrée relue) : il n'écrit plus rien. */
    enRetard: function () { return !!g && g.enRetard(); },
    installe: !!g,
    bandeaux: function () { return bandeaux(root.document); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
