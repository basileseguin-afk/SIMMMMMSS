/* « Lecture seule » (version 1, évolution 22 f) : lire les résultats sans pouvoir toucher au paramétrage.
 *
 * Un interrupteur, en bas du menu. En marche :
 *   - le bloc « Régler » du menu se replie en « Paramétrage verrouillé », et ses pages ne s'ouvrent pas (onglets.js
 *     demande à la page si une page est fermée : `fermee`) ;
 *   - un lien d'un résultat vers un réglage dit « Paramétrage verrouillé » (`regles`) ;
 *   - dans « Fichiers », « Restaurer » et « Importer » sont grisés, avec la raison ; les exports marchent ;
 *   - les gestes qui changent un réglage depuis une page de résultats ne se montrent plus, et, s'ils étaient appelés
 *     quand même, ne font rien (`garder`).
 * Les pages de résultats restent intactes.
 *
 * C'est une préférence de ce navigateur, gardée comme le thème (une clé `ory-ui-…`) : hors des données, hors de la
 * sauvegarde. Ce module ne dessine rien : il dit ce qui est fermé, et la page (sim.js) l'applique.
 */
(function (root) {
  'use strict';

  const CLE = 'ory-ui-lecture-seule';
  const MOT = 'Paramétrage verrouillé';
  /** La raison d'un geste grisé, dite sous lui. */
  const RAISON = 'Lecture seule : paramétrage verrouillé.';
  /** Le bloc du menu que la lecture seule ferme. */
  const BLOC = 'regler';

  /** Le choix gardé dans ce navigateur : la lecture seule est-elle en marche ? Un stockage indisponible : non. */
  function lire(stockage) {
    try { return !!stockage && stockage.getItem(CLE) === '1'; } catch (e) { return false; }
  }
  /** Garde le choix, comme le thème : la clé n'existe que si la lecture seule est en marche. */
  function ecrire(stockage, oui) {
    try { if (oui) stockage.setItem(CLE, '1'); else stockage.removeItem(CLE); } catch (e) { /* stockage indisponible : le choix vaut pour la visite */ }
  }

  /**
   * La page est-elle de celles que la lecture seule ferme ? Celles du bloc « Régler », et les pages d'avant qu'elles ont
   * reprises (`O` : OrlyOnglets).
   */
  function fermee(O, id) {
    const o = O && O.page(id), p = o && O.PARTIES.find(x => x.id === o.partie);
    return !!p && p.bloc === BLOC;
  }
  /** Tous les identifiants qui mènent à une page fermée : les pages, et les pages d'avant (un lien les porte encore). */
  function identifiants(O) {
    const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
    return [...pages, ...Object.keys(O.ANCIENNES || {})].filter(id => fermee(O, id));
  }

  /**
   * Les règles de style de la lecture seule : un lien vers une page fermée, où qu'il soit dans la page, le dit — il est
   * grisé, et « Paramétrage verrouillé » se lit à sa suite. Sans effet tant que `body` ne porte pas `data-lecture`.
   */
  function regles(O) {
    const liens = identifiants(O).map(id => `body[data-lecture="seule"] [data-page="${id}"]`);
    if (!liens.length) return '';
    return `${liens.join(',\n')}{opacity:.62;cursor:not-allowed}\n`
      + `${liens.map(s => s + '::after').join(',\n')}{content:" · ${MOT}";font-weight:400;font-style:normal}`;
  }

  /**
   * Garde une méthode qui change un réglage : en lecture seule (`verrou()` vrai), elle ne fait rien, le dit (`dire`), et
   * rend `false`, comme un changement refusé. Hors de la lecture seule, c'est la méthode d'avant, avec ses arguments et
   * son résultat.
   */
  function garder(objet, methode, verrou, dire) {
    const vraie = objet && objet[methode];
    if (typeof vraie !== 'function' || vraie.gardee) return;
    const garde = function () {
      if (verrou()) { if (dire) dire(); return false; }
      return vraie.apply(this, arguments);
    };
    garde.gardee = true;
    objet[methode] = garde;
  }

  /** Le nom et l'infobulle de l'interrupteur, selon son état. */
  function interrupteur(oui) {
    return oui
      ? { nom: 'Lecture seule', coche: true, ico: 'cadenas', titre: 'Lecture seule en marche : le paramétrage est verrouillé. Cliquez pour le déverrouiller.' }
      : { nom: 'Lecture seule', coche: false, ico: 'cadenasOuvert', titre: 'Passer en lecture seule : les résultats se lisent, le paramétrage est verrouillé.' };
  }

  const api = { CLE, MOT, RAISON, BLOC, lire, ecrire, fermee, identifiants, regles, garder, interrupteur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyLectureSeule = api;
})(typeof window !== 'undefined' ? window : globalThis);
