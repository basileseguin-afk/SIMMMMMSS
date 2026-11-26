/* ==========================================================================
 *  UNE VALEUR INHABITUELLE SE DIT (version 1, correction 24 h)
 *
 *  Un temps par vol de plus de 24 heures pour une personne, une équipe de plus
 *  de 200 personnes : une faute de frappe le plus souvent (un zéro de trop, des
 *  minutes tapées dans un champ en heures). Rien n'est refusé : la valeur est
 *  prise, et la notification de la saisie ajoute « valeur inhabituelle, à
 *  vérifier », avec « Annuler ».
 *
 *  LES DEUX SEUILS sont ici, et nulle part ailleurs (`SEUILS`).
 *
 *  Comment. Les champs sont dessinés et écoutés par des scripts communs avec la
 *  version 2 (unite.js, reglages.js), qui ne sont pas modifiés. Ce module
 *  écoute donc la saisie (`change`) avant eux, retient la valeur inhabituelle,
 *  et attend que le geste entre dans un historique (`OrlyNotif.marquer`) :
 *  une saisie refusée, ou qui ne change rien, ne dit rien. Juste après, dans
 *  la même tâche — le geste est encore celui de la saisie, sa notification
 *  porte donc « Annuler » —, il complète la notification que la saisie vient
 *  de dire, ou dit la sienne quand elle n'en a pas (un enregistrement de
 *  routine ne s'affiche pas).
 * ==========================================================================*/
(function (root) {
  'use strict';

  /**
   * Les deux seuils, à valider : au-delà (strictement), la valeur est dite inhabituelle.
   *   heuresParVol : un temps par vol, pour une personne, en heures ;
   *   personnes    : l'effectif d'une équipe.
   */
  const SEUILS = Object.freeze({ heuresParVol: 24, personnes: 200 });

  const MOT = 'valeur inhabituelle, à vérifier';
  /** Entre la saisie et son entrée dans l'historique : les scripts la reportent à la tâche suivante. */
  const DELAI_MS = 1000;

  /**
   * Les champs lus : un temps par vol, saisi en heures pour une personne (la fiche d'un service, le tableau de tous
   * les temps par vol, un service par compagnie, une équipe d'appui) ; l'effectif d'une équipe (sa fiche, le tableau).
   */
  const CHAMPS = Object.freeze([
    { genre: 'temps', ou: '[data-rg-champ="heures"],[data-rg-champ="recap"],[data-rg-champ="recap-cie"],[data-mu-cat-min],[data-at-champ="appui-h"]' },
    { genre: 'personnes', ou: '[data-at-champ="personnes"],[data-rg-champ="recap-pers"]' }
  ]);

  /** Un nombre saisi, comme les champs le lisent : la virgule vaut le point. Vide ou illisible : null. */
  function nombre(valeur) {
    if (valeur === null || valeur === undefined) return null;
    const t = typeof valeur === 'string' ? valeur.trim().replace(',', '.') : valeur;
    if (t === '') return null;
    const n = +t;
    return Number.isFinite(n) ? n : null;
  }

  /**
   * La valeur est-elle inhabituelle ?
   * @param {'temps'|'personnes'} genre  un temps par vol (en heures), ou l'effectif d'une équipe
   * @param {number|string} valeur       la valeur saisie
   * @returns {boolean} vrai au-delà du seuil ; faux au seuil, en dessous, ou sans valeur lisible
   */
  function inhabituelle(genre, valeur) {
    const n = nombre(valeur);
    if (n === null) return false;
    if (genre === 'temps') return n > SEUILS.heuresParVol;
    if (genre === 'personnes') return n > SEUILS.personnes;
    return false;
  }

  const fr = n => String(Math.round(n * 1000) / 1000).replace('.', ',');

  /** La notification, quand la saisie n'en dit pas d'autre : ce qui a été saisi, puis l'avis. */
  function phrase(genre, valeur) {
    const n = nombre(valeur);
    if (genre === 'temps') return fr(n) + ' h par vol pour une personne : ' + MOT + '.';
    return fr(n) + ' personnes dans une équipe : ' + MOT + '.';
  }

  /** La notification de la saisie, complétée : sa phrase, puis « — valeur inhabituelle, à vérifier. » */
  function ajouter(texte) {
    const t = String(texte ?? '').trim();
    if (!t || t.includes(MOT)) return t;
    return t.replace(/\s*[.…]+$/u, '') + ' — ' + MOT + '.';
  }

  /** Le genre du champ saisi, ou rien. */
  function genreDe(el) {
    if (!el || typeof el.matches !== 'function') return null;
    const c = CHAMPS.find(k => el.matches(k.ou));
    return c ? c.genre : null;
  }

  let branche = false;
  /**
   * Se brancher sur les notifications de la page (une fois). À appeler avant tout autre module qui enveloppe
   * `OrlyNotif.marquer` ou `OrlyNotif.notifier` : la notification dite ici passe par le `notifier` d'origine.
   */
  function brancher() {
    const N = root.OrlyNotif, d = root.document;
    if (branche || !N || !d) return;
    branche = true;
    const marquer = N.marquer, notifier = N.notifier;
    let saisie = null;     // la saisie inhabituelle qui attend son geste : { genre, valeur, a }
    let enCours = null;    // celle dont le geste est en train de se dire : { genre, valeur, dite }

    // En capture : avant les scripts qui prennent la saisie. Une saisie ordinaire efface celle qui attendait.
    d.addEventListener('change', e => {
      const genre = genreDe(e.target);
      saisie = genre && inhabituelle(genre, e.target.value) ? { genre, valeur: e.target.value, a: Date.now() } : null;
    }, true);

    // Ce que la saisie dit elle-même pendant son geste : retenu, pour le compléter.
    N.notifier = (texte, o = {}) => {
      if (enCours && texte && !o.consigne) enCours.dite = { texte: String(texte), o };
      return notifier(texte, o);
    };

    N.marquer = nom => {
      const r = marquer(nom);
      if (saisie && !enCours && Date.now() - saisie.a <= DELAI_MS) {
        const s = enCours = { genre: saisie.genre, valeur: saisie.valeur, dite: null };
        saisie = null;
        // Après le script qui vient de marquer, avant la tâche suivante : le geste est encore le sien.
        Promise.resolve().then(() => {
          enCours = null;
          const dite = s.dite;
          const montree = dite && !N.REFUS.test(dite.texte) && !(dite.o.discret ?? N.ROUTINE.test(dite.texte));
          if (dite && N.REFUS.test(dite.texte)) return;
          if (montree) notifier(ajouter(dite.texte), dite.o);
          else notifier(phrase(s.genre, s.valeur), { cle: 'inhabituel' });
        });
      }
      return r;
    };
  }

  const api = { SEUILS, MOT, CHAMPS, nombre, inhabituelle, phrase, ajouter, brancher };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyInhabituel = api;
})(typeof window !== 'undefined' ? window : globalThis);
