/* ==========================================================================
 *  REDESSINER SANS PERDRE CE QU'ON TAPE
 *
 *  Retour d'usage du 05/10 : « des fois, en dotation, j'écris dans un champ
 *  ou des heures, et le champ ne retient pas ce que j'ai écrit ».
 *
 *  Chaque modification relance le calcul, puis l'écran se redessine. Quand le
 *  calcul prend un peu de temps (un vrai programme de vols), on a déjà cliqué
 *  dans le champ suivant et commencé à taper : le rendu remplaçait ce champ
 *  par un neuf, avec l'ancienne valeur — une heure à moitié tapée ne se
 *  récupère même pas (le navigateur ne la donne qu'entière, et remet le
 *  curseur sur les heures).
 *
 *  Ici : tant qu'on tape dans un champ (depuis sa dernière validation), la
 *  zone qui le contient n'est pas redessinée ; le rendu attend. Dès que le
 *  champ est validé — Entrée, Tab, un clic ailleurs —, le rendu se fait, et
 *  le focus revient au même champ dans le nouveau dessin.
 *
 *  La garde est posée une fois, à la source : le remplacement du contenu d'un
 *  élément (`innerHTML`). Une vingtaine d'écrans redessinent des champs (fiche
 *  d'un service, cartes des équipes, horaires, barème, fenêtre d'une case…) :
 *  aucun n'est oublié, et aucun n'a à y penser. Sans champ en cours de saisie
 *  dans l'élément redessiné, le rendu se fait tout de suite, comme avant.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Un champ où l'on écrit (pas une case à cocher, ni un bouton). */
  const SAISIE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=file]):not([type=color]), textarea';
  const estSaisie = el => !!(el && el.matches && el.matches(SAISIE));

  let enCours = null;                 // le champ où l'on tape, depuis sa dernière validation
  const enAttente = new Map();        // élément → le dernier HTML qu'on voulait y mettre

  /** De quoi retrouver le même champ dans le nouveau HTML : ses attributs data-*,
   *  son id ou son nom, sous la case (data-at) qui le porte, et son rang parmi
   *  les champs pareils. */
  function cle(el, box) {
    const attrs = Object.keys(el.dataset || {}).map(k => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`).join('')
      + (el.id ? '#' + CSS.escape(el.id) : '') + (el.name ? `[name="${CSS.escape(el.name)}"]` : '');
    if (!attrs) return null;
    const at = el.closest('[data-at]');
    const sel = (at && at !== el && box.contains(at) ? `[data-at="${CSS.escape(at.dataset.at)}"] ` : '') + el.tagName.toLowerCase() + attrs;
    return { sel, rang: [...box.querySelectorAll(sel)].indexOf(el) };
  }

  let natif = null;

  /* Les zones qui défilent à l'intérieur (le tableau des Minutes de travail, une
   * liste…) gardent leur place quand on redessine (retour d'usage du 07/10 :
   * « dès que je valide un temps dans les man-hours, la page remonte »). Chaque
   * zone défilée se retrouve dans le nouveau dessin par son id, ou sa balise et
   * ses classes, et son rang parmi les pareilles. */
  const signe = el => (el.id ? '#' + el.id : el.tagName + '.' + [...el.classList].sort().join('.'));
  function defilees(box) {
    const out = [];
    for (const el of box.querySelectorAll('*')) {
      if (!el.scrollTop && !el.scrollLeft) continue;
      const k = signe(el);
      out.push({ k, rang: out.filter(x => x.k === k).length, haut: el.scrollTop, gauche: el.scrollLeft });
    }
    return out;
  }
  function remettre(box, places) {
    if (!places.length) return;
    const par = new Map();
    for (const el of box.querySelectorAll('*')) { const k = signe(el); if (!par.has(k)) par.set(k, []); par.get(k).push(el); }
    for (const p of places) {
      const el = (par.get(p.k) || [])[p.rang]; if (!el) continue;
      el.scrollTop = p.haut; el.scrollLeft = p.gauche;
    }
  }
  const remplacer = (box, html) => {
    const places = box.isConnected ? defilees(box) : [];
    natif ? natif.set.call(box, html) : (box.innerHTML = html);
    remettre(box, places);
  };
  const ecrire = remplacer;

  /** Écrire le HTML ; le champ (ou la liste) où l'on était retrouve le focus. */
  function poser(box, html) {
    const d = root.document, actif = d && d.activeElement;
    const garder = actif && actif !== box && box.contains(actif) && (estSaisie(actif) || actif.tagName === 'SELECT') ? actif : null;
    const k = garder ? cle(garder, box) : null;
    let sel = null;
    if (garder) { try { sel = [garder.selectionStart, garder.selectionEnd]; } catch (e) { sel = null; } }
    ecrire(box, html);
    if (!k || garder.isConnected) return;
    const pareils = [...box.querySelectorAll(k.sel)], neuf = pareils[k.rang] || pareils[0];
    if (!neuf) return;
    neuf.focus({ preventScroll: true });
    if (sel && sel[0] != null) { try { neuf.setSelectionRange(sel[0], sel[1]); } catch (e) { /* type sans sélection */ } }
  }

  /** Un rendu demandé pendant qu'on tape dans `box` : il attend la validation. */
  const enSaisieDans = box => !!(enCours && enCours.isConnected && box !== enCours && box.contains(enCours)
    && root.document.activeElement === enCours);

  /** Les rendus en attente se font : le champ vient d'être validé, ou quitté. */
  function liberer() {
    for (const [box, html] of [...enAttente]) {
      if (enSaisieDans(box)) continue;
      enAttente.delete(box);
      if (box.isConnected) poser(box, html);
    }
  }

  if (root.document && root.Element) {
    const d = root.document;
    const fini = () => { enCours = null; setTimeout(liberer, 0); };
    d.addEventListener('keydown', e => {
      if (estSaisie(e.target) && !['Tab', 'Enter', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) enCours = e.target;
      else if (e.key === 'Enter' && e.target === enCours) fini();
    }, true);
    d.addEventListener('input', e => { if (estSaisie(e.target)) enCours = e.target; }, true);
    // Validé (change) ou quitté (focusout) : les rendus en attente se font,
    // après les gestionnaires de la page (qui enregistrent la valeur).
    // Une heure (ou une date) annonce « change » dès que les heures sont tapées,
    // avant les minutes : elle n'est finie qu'en la quittant, ou sur Entrée.
    const morceaux = el => /^(time|date|datetime-local|month|week)$/.test(el.type);
    // (Entre les heures et les minutes, le navigateur fait même croire un instant
    // que le champ n'a plus le focus : on ne s'y fie pas.)
    // Une saisie par programme (un import, un test) n'a pas ces morceaux : elle
    // est finie tout de suite — comme l'enregistrement des heures (ateliers.js).
    d.addEventListener('change', e => { if (e.target === enCours && !(e.isTrusted && morceaux(e.target))) fini(); }, true);
    d.addEventListener('focusout', e => { if (e.target === enCours) fini(); }, true);

    // La garde, à la source : tout remplacement de contenu passe par elle.
    const Elt = root.Element.prototype, desc = Object.getOwnPropertyDescriptor(Elt, 'innerHTML');
    if (desc && desc.set && desc.configurable) {
      natif = desc;
      Object.defineProperty(Elt, 'innerHTML', {
        configurable: true, enumerable: desc.enumerable, get: desc.get,
        set(html) {
          if (enSaisieDans(this)) { enAttente.set(this, String(html)); return; }
          enAttente.delete(this);
          if (root.document.activeElement && this.contains(root.document.activeElement)) poser(this, html);
          else remplacer(this, html);
        }
      });
    }
  }

  /** Le champ en cours de saisie, s'il y en a un ; les rendus en attente (tests). */
  const enSaisie = () => enCours;
  const attentes = () => enAttente.size;

  const api = { enSaisie, attentes, estSaisie, liberer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyRendu = api;
})(typeof window !== 'undefined' ? window : globalThis);
