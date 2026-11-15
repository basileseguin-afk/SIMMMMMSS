/* ==========================================================================
 *  LES CLASSEURS, AVEC LES MOTS D'AVANT ET CEUX D'AUJOURD'HUI
 *  (version 1, évolution 19 a)
 *  Les classeurs de paramétrage écrivent les mots de la version 1 : la feuille
 *  « Temps par vol » (« Barème » avant), « Récap des équipes » (« Cases »),
 *  « Équipes » (« Ateliers ») ; la colonne « Équipe » (« Case », « Atelier »),
 *  « Heures pour la journée » (« Heures de travail »). Un classeur exporté
 *  avant porte les anciens mots, et il se relit comme avant :
 *    — le nom d'une feuille d'avant est ramené au nouveau, à la lecture du
 *      fichier (la lecture cherche la feuille par son nouveau nom) ;
 *    — un nouvel en-tête est compris comme l'ancien (la lecture, dont le code
 *      est celui du module commun, connaît les colonnes par leurs clés
 *      d'avant : « case », « atelier », « heures_de_travail »).
 *  Les données ne sont pas touchées : une équipe qui s'appelle « Atelier »
 *  garde son nom. Ce module enveloppe la lecture de tableur.js (commun avec la
 *  version 2, laissé tel quel) : tous les imports de la page passent par elle.
 * ==========================================================================*/
(function (root) {
  'use strict';
  /** L'ancien nom d'une feuille → le nouveau. */
  const FEUILLES = Object.freeze({ 'Barème': 'Temps par vol', 'Cases': 'Récap des équipes', 'Ateliers': 'Équipes' });
  /** L'ancien en-tête d'une colonne → le nouveau (ce que les classeurs écrivent ; pour la doc et les tests). */
  const EN_TETES = Object.freeze({ 'Case': 'Équipe', 'Atelier': 'Équipe', 'Heures de travail': 'Heures pour la journée' });
  /** La clé d'un nouvel en-tête → les clés d'avant, celles que la lecture connaît. */
  const CLES = Object.freeze({ equipe: ['case', 'atelier'], heures_pour_la_journee: ['heures_de_travail'] });
  /** La clé d'un nouvel en-tête → cet en-tête, tel qu'un classeur d'aujourd'hui l'écrit. */
  const NEUFS = Object.freeze({ equipe: 'Équipe', heures_pour_la_journee: 'Heures pour la journée' });
  const aDe = (table, cle) => Object.prototype.hasOwnProperty.call(table, cle);

  /**
   * Les feuilles d'un classeur, sous leurs noms de la version 1 : une copie de la feuille quand son nom change, la même
   * sinon. Une feuille n'est renommée que si son nouveau nom est libre dans le classeur.
   */
  function versNouveauxMots(feuilles) {
    if (!Array.isArray(feuilles)) return feuilles;
    const noms = new Set(feuilles.map(f => f && f.nom));
    return feuilles.map(f => (f && aDe(FEUILLES, f.nom) && !noms.has(FEUILLES[f.nom]) ? { ...f, nom: FEUILLES[f.nom] } : f));
  }

  /**
   * Les lignes d'une feuille lues en objets ({ entetes, objets } de tableur.js), où une colonne au nouvel en-tête se lit
   * aussi sous ses clés d'avant : « Équipe » comme « Case » et comme « Atelier ». Une colonne d'avant, présente, garde la
   * main. `lignes` (facultatif) : les lignes lues — seule une colonne écrite comme un classeur d'aujourd'hui l'écrit
   * (« Équipe », pas la colonne « equipe » d'un fichier CSV) reçoit ses clés d'avant.
   */
  function avecLesClesDAvant(lu, lignes) {
    if (!lu || !Array.isArray(lu.entetes) || !Array.isArray(lu.objets)) return lu;
    const tete = Array.isArray(lignes) ? (lignes.find(l => l && l.some(v => v !== null && v !== '')) || []).map(c => (typeof c === 'string' ? c.trim() : c)) : null;
    const ajouts = [];
    for (const neuve of Object.keys(CLES)) {
      if (!lu.entetes.includes(neuve) || (tete && !tete.includes(NEUFS[neuve]))) continue;
      for (const ancienne of CLES[neuve]) if (!lu.entetes.includes(ancienne)) ajouts.push([neuve, ancienne]);
    }
    if (!ajouts.length) return lu;
    return { ...lu, entetes: lu.entetes.concat(ajouts.map(a => a[1])),
      objets: lu.objets.map(o => { const x = { ...o }; for (const [neuve, ancienne] of ajouts) x[ancienne] = o[neuve]; return x; }) };
  }

  /** Enveloppe la lecture d'un tableur : ses `lireClasseur` et `lireFichier` (les noms des feuilles), son `enObjets` (les clés). */
  function envelopper(tableur) {
    if (!tableur || tableur.__anciensMots) return tableur;
    for (const nom of ['lireClasseur', 'lireFichier']) {
      const lire = tableur[nom];
      if (typeof lire !== 'function') continue;
      tableur[nom] = function () { const r = lire.apply(this, arguments); return r && typeof r.then === 'function' ? r.then(versNouveauxMots) : versNouveauxMots(r); };
    }
    const enObjets = tableur.enObjets;
    if (typeof enObjets === 'function') tableur.enObjets = function (lignes) { return avecLesClesDAvant(enObjets.apply(this, arguments), lignes || []); };
    tableur.__anciensMots = true;
    return tableur;
  }

  const api = { FEUILLES, EN_TETES, CLES, NEUFS, versNouveauxMots, avecLesClesDAvant, envelopper };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.OrlyClasseursAnciens = api; envelopper(root.OrlyTableur); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
