/* ==========================================================================
 *  VERSION 2 — SES PROPRES DONNÉES
 *
 *  La version 2 vit sur le même site que la version 1 (…/v2/) : elle partage
 *  donc le même stockage du navigateur. Sans précaution, elle écrirait dans
 *  les données de la version 1 (le plan, les équipes, les réglages…).
 *
 *  Ce script, chargé AVANT tous les autres, donne à la version 2 son propre
 *  tiroir : chaque clé y est rangée sous le préfixe « ory-v2: ». Le reste du
 *  code lit et écrit `localStorage` comme d'habitude, sans rien savoir.
 *
 *  À la toute première ouverture, la version 2 part d'une COPIE du travail
 *  de la version 1 (les clés « ory-… » et « orly-… ») : on continue là où
 *  l'on en était. Ensuite, les deux versions ne se touchent plus.
 * ==========================================================================*/
(function () {
  'use strict';
  var PREFIXE = 'ory-v2:';
  var MARQUE = PREFIXE + '__copie-de-la-v1';
  var vrai;
  try { vrai = window.localStorage; if (!vrai) return; } catch (e) { return; } // stockage indisponible : le site fait déjà sans

  // Les noms de la version 1 : ceux de ce site, pas ceux d'autres sites du même domaine.
  // Le témoin de démarrage reste propre à chaque version.
  var DE_LA_V1 = /^(ory|orly)-/, PROPRE = { 'ory-demarrage-en-cours': true };

  function toutes() {
    var out = [];
    for (var i = 0; i < vrai.length; i++) out.push(vrai.key(i));
    return out;
  }
  function cles() {
    return toutes().filter(function (k) { return k && k.indexOf(PREFIXE) === 0 && k !== MARQUE; })
      .map(function (k) { return k.slice(PREFIXE.length); });
  }

  /** Recopie le travail de la v1 dans la v2 (en écrasant le même nom) ; ce qui n'existe que dans la v2 reste. */
  function copier() {
    toutes().forEach(function (k) {
      if (k && k.indexOf(PREFIXE) !== 0 && DE_LA_V1.test(k) && !PROPRE[k]) vrai.setItem(PREFIXE + k, vrai.getItem(k));
    });
    vrai.setItem(MARQUE, new Date().toISOString());
  }
  try { if (vrai.getItem(MARQUE) === null) copier(); } catch (e) { /* stockage plein ou refusé : la version 2 part de zéro */ }

  // Plus tard, on peut reprendre le travail fait entre-temps dans la v1 (Sauvegarde de la v2).
  window.OrlyV2 = {
    derniereCopie: function () { try { return vrai.getItem(MARQUE); } catch (e) { return null; } },
    reprendreV1: copier
  };

  var tiroir = {
    getItem: function (k) { return vrai.getItem(PREFIXE + k); },
    setItem: function (k, v) { vrai.setItem(PREFIXE + k, String(v)); },
    removeItem: function (k) { vrai.removeItem(PREFIXE + k); },
    key: function (i) { var l = cles(); return i >= 0 && i < l.length ? l[i] : null; },
    clear: function () { cles().forEach(function (k) { vrai.removeItem(PREFIXE + k); }); }
  };
  Object.defineProperty(tiroir, 'length', { get: function () { return cles().length; } });

  try { Object.defineProperty(window, 'localStorage', { value: tiroir, configurable: true }); } catch (e) { /* navigateur trop ancien */ }
})();
