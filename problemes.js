/* ==========================================================================
 *  LES PROBLÈMES — un seul registre (refonte du 08/10, étape 4)
 *
 *  L'audit comptait six façons de dire « il reste à faire », avec six chiffres
 *  (« Prêt à simuler ? 2 », « Contrôles détaillés 4 », « 8 points à
 *  regarder »…) : on ne savait pas lequel croire. Ici, un seul registre, bâti
 *  sur ce que le site sait déjà — rien n'est calculé de plus :
 *    - À CORRIGER : l'organisation se contredit (un point que le calcul
 *      refuse, un service supprimé encore cité, un service qui fournit sans
 *      équipe quand des commandes suivent encore les liens de l'unité) ;
 *    - À COMPLÉTER : ce qui manque avant de simuler (les étapes à faire de
 *      « Prêt à simuler ? ») ;
 *    - CE QUE LA JOURNÉE MONTRE : retards, postes trop courts, attentes. Ce
 *      sont des résultats, pas des erreurs de saisie.
 *  Chaque problème mène à la page où il se règle. Le pied de la barre
 *  latérale en dit le nombre ; le nombre d'un onglet compte ce qui s'y règle.
 *
 *  `lister(sources)` et `compte(liste, page)` sont purs (testés en Node) ;
 *  `Registre` est le panneau.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const NIVEAUX = [
    { id: 'corriger', nom: 'À corriger', ico: 'alerte' },
    { id: 'completer', nom: 'À compléter', ico: 'curseurs' },
    { id: 'resultat', nom: 'Ce que la journée montre', ico: 'chrono' }
  ];
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);

  /**
   * Le registre, du plus pressant au moins pressant. Un point du calcul fait un
   * problème : ses messages disent déjà, service par service, combien de
   * commandes il touche — et chaque page qui les liste en dit le même nombre.
   * @param {object} s  les sources, telles que le site les a déjà :
   *   corriger : anomalies du calcul à corriger ({code, message, service?}) ;
   *   fantomes : services supprimés encore cités ({id, nom, cases, chemins}) ;
   *   liens    : alertes graves des liens de l'unité, quand ils servent ({texte}) ;
   *   etapes   : étapes à faire de « Prêt à simuler ? » ({id, titre, texte, page, services?}) ;
   *   journee  : ce que la journée montre ({code, message, service?}) ;
   *   enClair  : le texte d'une anomalie, en clair (facultatif).
   * @returns {Array<{niveau:string, titre:string, detail:string, page:string, aussi:string[], service?:string}>}
   *   page  : où il se règle ; aussi : les pages qui le montrent aussi (et le comptent).
   */
  function lister(s = {}) {
    const clair = typeof s.enClair === 'function' ? s.enClair : (t => t);
    const out = [];
    // 1. À corriger.
    for (const f of s.fantomes || []) {
      const cite = [f.cases ? pl(f.cases, 'case') : '', f.chemins ? pl(f.chemins, 'chemin') : ''].filter(Boolean).join(' et ');
      out.push({ niveau: 'corriger', titre: '« ' + f.nom + ' » n’existe plus dans l’unité',
        detail: (cite ? cite + ' le citent encore. ' : '') + 'Effacez-le partout, ou faites passer son travail dans un autre service.',
        page: 'u-services', aussi: ['u-lecture'] });
    }
    for (const a of s.corriger || [])
      out.push({ niveau: 'corriger', titre: clair(a.message || a.code || ''), detail: '',
        page: a.service ? 'mu-services' : 'at-chemins', aussi: ['u-lecture', 'mu-pas'], service: a.service || undefined });
    for (const a of s.liens || []) out.push({ niveau: 'corriger', titre: a.texte, detail: '', page: 'u-lecture', aussi: [] });
    // 2. À compléter.
    for (const e of s.etapes || []) {
      const noms = (e.services || []).map(x => x.nom);
      out.push({ niveau: 'completer', titre: e.titre,
        detail: noms.length ? (noms.length > 4 ? noms.slice(0, 4).join(', ') + ' et ' + pl(noms.length - 4, 'autre') : noms.join(', ')) + ' : à compléter.' : (e.texte || ''),
        page: e.page || 'mu-pas', aussi: ['mu-pas'] });
    }
    // 3. Ce que la journée montre.
    for (const a of s.journee || [])
      out.push({ niveau: 'resultat', titre: clair(a.message || a.code || ''), detail: '', page: 'j-chiffres', aussi: [] });
    return out;
  }

  /** Les pages où un problème compte : la sienne, et celles qui le montrent aussi.
   *  Un résultat ne compte que dans le registre : la journée n'est pas à corriger. */
  function pages(p) {
    if (p.niveau === 'resultat') return [];
    return [...new Set([p.page].concat(p.aussi || []))];
  }
  /** Le nombre d'un onglet : ce qui se règle sur sa page. */
  function compte(liste, page) { return liste.filter(p => pages(p).includes(page)).length; }

  /* ---- le panneau ----------------------------------------------------------- */

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');

  /**
   * Le panneau des problèmes, ouvert depuis le pied de la barre latérale.
   * @param {{sources:Function, aller:Function, nomPage:Function, bouton:HTMLElement, panneau:HTMLElement}} a
   *   sources()            — les sources de `lister` ;
   *   aller(page, service) — ouvrir la page où le problème se règle ;
   *   nomPage(page)        — le nom d'une page, pour le lien.
   */
  class Registre {
    constructor(a) {
      this.a = a; this.liste = [];
      a.panneau.addEventListener('click', e => {
        const b = e.target.closest('[data-pb-page]'); if (!b) return;
        if (a.panneau.hidePopover) a.panneau.hidePopover();
        a.aller(b.dataset.pbPage, b.dataset.pbService || null);
      });
    }

    /** Après chaque changement : le nombre, au pied de la barre, et la liste (refaite seulement si elle change). */
    maj() {
      this.liste = lister(this.a.sources());
      const n = this.liste.length, c = this.a.bouton.querySelector('.pb-compte');
      if (c) { c.hidden = !n; c.textContent = n; }
      this.a.bouton.title = n ? pl(n, 'problème') + ' : ce qui reste à corriger, à compléter, et ce que la journée montre' : 'Aucun problème : tout est en place';
      const sig = JSON.stringify(this.liste);
      if (sig !== this.sig) { this.sig = sig; this.rendre(); }
    }

    /** Le nombre d'un onglet (badge de onglets.js). */
    badge(page) {
      const n = compte(this.liste, page);
      if (!n) return null;
      const grave = this.liste.some(p => p.niveau === 'corriger' && pages(p).includes(page));
      return { n, ton: grave ? 'attente' : 'neutre', titre: pl(n, 'problème') + ' à régler ici' };
    }

    rendre() {
      const l = this.liste, total = l.length;
      const item = p => `<li><button type="button" class="pb" data-pb-page="${esc(p.page)}"${p.service ? ` data-pb-service="${esc(p.service)}"` : ''}>
          <span class="pb-corps"><b>${esc(p.titre)}</b>${p.detail ? `<span>${esc(p.detail)}</span>` : ''}
          <span class="pb-lien">Ouvrir « ${esc(this.a.nomPage(p.page))} »${pic('droite')}</span></span></button></li>`;
      this.a.panneau.innerHTML = `<div class="pb-tete"><h2 id="problemes-titre">Problèmes</h2>
          <span class="pb-total">${total ? pl(total, 'problème') : 'aucun'}</span></div>`
        + (total ? NIVEAUX.map(nv => {
          const d = l.filter(p => p.niveau === nv.id);
          return d.length ? `<section class="pb-groupe ${nv.id}"><h3>${pic(nv.ico)}${esc(nv.nom)}<span>${d.length}</span></h3><ul>${d.map(item).join('')}</ul></section>` : '';
        }).join('')
        : `<p class="pb-vide">${pic('check')}Rien à corriger ni à compléter : la journée se calcule sur une organisation complète.</p>`);
    }
  }

  const api = { NIVEAUX, lister, pages, compte, Registre };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyProblemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
