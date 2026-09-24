/* Sous-onglets : une vue, plusieurs pages courtes.
 *
 * Chaque étape en disait trop à la fois : le tableau, les chemins, les
 * équipes, leur planning et les repas s'empilaient sur une même page, et
 * l'œil ne savait plus où se poser. Ici, chaque vue se découpe en quelques
 * onglets ; un seul est affiché, les autres attendent derrière leur titre.
 *
 * Le découpage ne déplace rien : les éléments d'une vue portent
 * `data-sous="<onglet>"` (ou plusieurs, séparés par des espaces), et une
 * règle de style masque ceux qui n'appartiennent pas à l'onglet ouvert.
 * Un élément sans `data-sous` reste visible dans tous les onglets de sa vue.
 * Le dernier onglet ouvert de chaque vue est retenu d'une visite à l'autre.
 */
(function (root) {
  'use strict';

  const ONGLETS = {
    vols: [
      { id: 'v-departs', nom: 'Les départs', ico: 'depart' },
      { id: 'v-programme', nom: 'Le programme', ico: 'journee' }
    ],
    ateliers: [
      { id: 'at-chemins', nom: 'Les chemins', ico: 'fleche' },
      { id: 'at-grille', nom: 'Qui prépare quoi', ico: 'equipe' },
      { id: 'at-equipes', nom: 'Les cases', ico: 'service' },
      { id: 'at-planning', nom: 'Leur journée', ico: 'journee' },
      { id: 'at-repas', nom: 'Les commandes', ico: 'plateau' }
    ],
    reglages: [
      { id: 'rg-minutes', nom: 'Minutes par vol', ico: 'chrono' },
      { id: 'rg-rythme', nom: 'Rythme et pauses', ico: 'sablier' }
    ],
    plan: [
      { id: 'j-plan', nom: 'Le plan', ico: 'unite' },
      { id: 'j-chiffres', nom: 'Les chiffres', ico: 'check' },
      { id: 'j-stocks', nom: 'Stocks et retours', ico: 'boite' },
      { id: 'j-comparer', nom: 'Comparer deux essais', ico: 'lecture' }
    ],
    flux: [
      { id: 'u-liens', nom: 'Les liens', ico: 'fleche' },
      { id: 'u-lecture', nom: 'Ce que le calcul en retient', ico: 'info' },
      { id: 'u-sauvegarde', nom: 'Sauvegarde et limites', ico: 'boite' }
    ]
  };
  const CLE = 'ory-sous-onglets';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function defaut(vue) { return ((ONGLETS[vue] || [])[0] || {}).id || null; }
  function vueDe(id) { return Object.keys(ONGLETS).find(v => ONGLETS[v].some(o => o.id === id)) || null; }

  /* Une règle par onglet : dans l'onglet X, tout élément découpé qui n'est
   * pas de X disparaît. Les éléments des autres vues sont déjà masqués. */
  function regles() {
    return Object.values(ONGLETS).flat().map(o =>
      `body[data-sous="${o.id}"] [data-sous]:not([data-sous~="${o.id}"]){display:none!important}`).join('\n');
  }

  class SousOnglets {
    /* a = {
     *   hote()        — la barre où dessiner les onglets
     *   vue()         — la vue affichée
     *   badge(id)     — facultatif : { n, ton } à afficher sur l'onglet, ou rien
     *   change(vue,id)— facultatif : appelé quand l'onglet change
     * } */
    constructor(a) {
      this.a = a;
      this.choix = {};
      try { this.choix = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { this.choix = {}; }
      if (root.document && !document.getElementById('sous-onglets-regles')) {
        const st = document.createElement('style'); st.id = 'sous-onglets-regles';
        st.textContent = regles(); document.head.appendChild(st);
      }
      const h = a.hote();
      if (h) {
        h.addEventListener('click', e => {
          const b = e.target.closest('[data-sous-onglet]'); if (!b) return;
          this.choisir(b.dataset.sousOnglet);
        });
        h.addEventListener('keydown', e => this.clavier(e));
      }
    }

    actif(vue = this.a.vue()) {
      const liste = ONGLETS[vue] || [], c = this.choix[vue];
      return liste.some(o => o.id === c) ? c : defaut(vue);
    }

    /* Ouvre un onglet, de la vue affichée ou d'une autre (la vue suivra). */
    choisir(id, focus) {
      const vue = vueDe(id); if (!vue) return;
      this.choix[vue] = id;
      try { localStorage.setItem(CLE, JSON.stringify(this.choix)); } catch (e) { /* stockage indisponible */ }
      if (vue === this.a.vue()) this.rendre();
      if (this.a.change) this.a.change(vue, id);
      if (focus) { const b = this.a.hote()?.querySelector(`[data-sous-onglet="${id}"]`); if (b) b.focus(); }
    }

    rendre() {
      const vue = this.a.vue(), liste = ONGLETS[vue] || [], actif = this.actif(vue);
      if (root.document) {
        if (actif) document.body.dataset.sous = actif; else delete document.body.dataset.sous;
      }
      const h = this.a.hote(); if (!h) return;
      const I = root.OrlyIcones;
      const html = liste.map(o => {
        const on = o.id === actif, b = this.a.badge ? this.a.badge(o.id) : null;
        return `<button type="button" role="tab" class="so-onglet${on ? ' actif' : ''}" data-sous-onglet="${o.id}"
          aria-selected="${on}" tabindex="${on ? 0 : -1}">${I ? I.ico(o.ico) : ''}<span>${esc(o.nom)}</span>${
          b && b.n ? `<b class="so-badge ${esc(b.ton || '')}" title="${esc(b.titre || '')}">${esc(b.n)}</b>` : ''}</button>`;
      }).join('');
      // Redessiner seulement si quelque chose a changé : sinon l'onglet qui a
      // le focus clavier le perdrait à chaque recalcul de la journée.
      const boite = h.querySelector('.so-liste') || h;
      if (this.dessin !== html || !boite.firstChild) { boite.innerHTML = html; this.dessin = html; }
      // Sur téléphone la barre défile : l'onglet ouvert doit y rester visible.
      const on = boite.querySelector('.actif');
      if (on && boite.scrollWidth > boite.clientWidth) {
        const g = on.offsetLeft - boite.offsetLeft, d = g + on.offsetWidth;
        if (g < boite.scrollLeft) boite.scrollLeft = g - 16;
        else if (d > boite.scrollLeft + boite.clientWidth) boite.scrollLeft = d - boite.clientWidth + 16;
      }
      h.hidden = liste.length < 2;
    }

    /* Flèches, Début et Fin : le parcours clavier des onglets. */
    clavier(e) {
      const b = e.target.closest('[data-sous-onglet]'); if (!b) return;
      const tous = [...this.a.hote().querySelectorAll('[data-sous-onglet]')], i = tous.indexOf(b);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tous.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const cible = tous[(j + tous.length) % tous.length];
      this.choisir(cible.dataset.sousOnglet, true);
    }
  }

  const api = { ONGLETS, defaut, vueDe, regles, SousOnglets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyOnglets = api;
})(typeof window !== 'undefined' ? window : globalThis);
