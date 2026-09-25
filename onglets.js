/* Le menu : quatre parties, et dans chacune quelques pages.
 *
 * Données (ce qu'on importe), Organisation (ce qu'on décrit), Réglages (ce
 * qu'on essaie), Résultats (ce qu'on observe). Avant, chaque étape mélangeait
 * les quatre : un réglage dans les vols, un résultat dans les équipes. Une
 * page ne change pas de nature selon l'endroit d'où l'on vient.
 *
 * Une page EST un sous-onglet d'une vue : les éléments d'une vue portent
 * `data-sous="<page>"` (ou plusieurs, séparés par des espaces), et une règle
 * de style masque ceux qui n'appartiennent pas à la page ouverte. Un élément
 * sans `data-sous` reste visible dans toutes les pages de sa vue. Les parties
 * ne déplacent rien : elles regroupent des pages de vues différentes.
 * La dernière page ouverte de chaque partie est retenue d'une visite à l'autre.
 */
(function (root) {
  'use strict';

  /* Les pages de chaque vue : c'est la vue qui porte les éléments. */
  const ONGLETS = {
    vols: [
      { id: 'v-programme', nom: 'Vols', ico: 'avion' },
      { id: 'v-horaires', nom: 'Horaires des vols', ico: 'depart' },
      { id: 'v-departs', nom: 'Départs', ico: 'depart' }
    ],
    ateliers: [
      { id: 'at-chemins', nom: 'Chemins', ico: 'fleche' },
      { id: 'at-equipes', nom: 'Cases', ico: 'service' },
      { id: 'at-grille', nom: 'Qui prépare quoi', ico: 'equipe' },
      { id: 'at-planning', nom: 'Planning des équipes', ico: 'journee' },
      { id: 'at-repas', nom: 'Commandes', ico: 'plateau' }
    ],
    reglages: [
      { id: 'rg-minutes', nom: 'Temps de travail', ico: 'chrono' },
      { id: 'rg-rythme', nom: 'Rythme et pauses', ico: 'sablier' }
    ],
    // Arriver « sur le plan » (un lien, « voir sur le plan »), c'est arriver
    // sur la carte ; le menu, lui, ouvre les Résultats par leur synthèse.
    plan: [
      { id: 'j-plan', nom: 'Le plan rejoué', ico: 'unite' },
      { id: 'j-chiffres', nom: 'Synthèse', ico: 'check' },
      { id: 'j-stocks', nom: 'Stocks et retours', ico: 'boite' },
      { id: 'j-comparer', nom: 'Comparer deux essais', ico: 'lecture' }
    ],
    flux: [
      { id: 'u-liens', nom: 'Liens entre services', ico: 'fleche' },
      { id: 'u-lecture', nom: 'Contrôles', ico: 'info' },
      { id: 'u-sauvegarde', nom: 'Sauvegarde et limites', ico: 'boite' }
    ]
  };

  /* Les parties du menu, dans l'ordre du travail. `intro` : une phrase, pas
   * un paragraphe. `cache` : une partie qu'on ouvre depuis l'en-tête ou
   * l'accueil, sans tuile. */
  const PARTIES = [
    { id: 'donnees', nom: 'Données', ico: 'boite', couleur: 'var(--c-vols)',
      resume: 'Ce que vous importez',
      pages: [
        { id: 'v-programme', intro: 'Le programme de vols de la journée : importez le vôtre, en Excel ou en CSV.' },
        { id: 'rg-minutes', intro: 'Les minutes de travail d’un vol, service par service : l’étude de temps.' }
      ] },
    { id: 'organisation', nom: 'Organisation', ico: 'equipe', couleur: 'var(--c-equipes)',
      resume: 'Ce que vous décrivez',
      pages: [
        { id: 'at-chemins', intro: 'Une commande par compagnie et par classe : les services par où elle passe.' },
        { id: 'at-equipes', intro: 'Les cases : une équipe, une heure, des personnes, et les commandes qu’elle prépare dans l’ordre.' },
        { id: 'at-grille', intro: 'Pour chaque commande, la case qui la prépare dans chaque service.' },
        { id: 'u-liens', intro: 'Qui livre qui dans l’unité : ces liens ne servent qu’aux commandes sans chemin.' },
        { id: 'u-lecture', intro: 'Ce que le calcul comprend de votre organisation, et ce qu’il faut corriger.' }
      ] },
    { id: 'reglages', nom: 'Réglages', ico: 'sablier', couleur: 'var(--c-temps)',
      resume: 'Ce que vous essayez',
      pages: [
        { id: 'v-horaires', intro: 'Décaler tous les vols, et combien de minutes avant le départ les repas doivent être prêts.' },
        { id: 'rg-rythme', intro: 'Le rythme de travail, les pauses et le temps de présence d’une équipe.' }
      ] },
    { id: 'resultats', nom: 'Résultats', ico: 'journee', couleur: 'var(--c-journee)',
      resume: 'Ce que la journée donne',
      pages: [
        { id: 'j-chiffres', intro: 'La journée en chiffres : commandes à l’heure, retards, attentes, travail fourni.' },
        { id: 'j-plan', intro: 'Rejouez la journée sur le plan de l’unité : qui travaille, qui attend, ce qui est prêt.' },
        { id: 'at-planning', intro: 'Qui travaille quand : chaque case, ses préparations et ses attentes.' },
        { id: 'at-repas', intro: 'Chaque commande : à quelle heure elle est prête, et avant quand elle devait l’être.' },
        { id: 'v-departs', intro: 'Chaque vol : ses repas sont-ils prêts avant son départ ?' },
        { id: 'j-stocks', intro: 'Ce qui attend entre deux services, et les retours des vols à la plonge.' },
        { id: 'j-comparer', intro: 'Retenez deux essais et voyez ce qui a bougé.' }
      ] },
    { id: 'fichier', nom: 'Sauvegarde', ico: 'boite', couleur: 'var(--c-unite)', cache: true,
      resume: 'Votre travail dans un fichier',
      pages: [
        { id: 'u-sauvegarde', intro: 'Enregistrez tout votre travail dans un fichier, et relisez-le plus tard.' }
      ] }
  ];
  const CLE = 'ory-menu-pages';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function defaut(vue) { return ((ONGLETS[vue] || [])[0] || {}).id || null; }
  function vueDe(id) { return Object.keys(ONGLETS).find(v => ONGLETS[v].some(o => o.id === id)) || null; }
  /** La partie qui contient une page. */
  function partieDe(id) { return PARTIES.find(p => p.pages.some(x => x.id === id)) || null; }
  /** Une page, avec son nom, son pictogramme, sa vue et sa partie. */
  function page(id) {
    const vue = vueDe(id), o = vue && ONGLETS[vue].find(x => x.id === id), p = partieDe(id);
    if (!o || !p) return null;
    return { ...o, ...p.pages.find(x => x.id === id), vue, partie: p.id };
  }
  /** Les pages d'une partie, dans l'ordre du menu. */
  const pagesDe = partie => ((PARTIES.find(p => p.id === partie) || {}).pages || []).map(x => page(x.id));

  /* Une règle par onglet : dans l'onglet X, tout élément découpé qui n'est
   * pas de X disparaît. Les éléments des autres vues sont déjà masqués. */
  function regles() {
    return Object.values(ONGLETS).flat().map(o =>
      `body[data-sous="${o.id}"] [data-sous]:not([data-sous~="${o.id}"]){display:none!important}`).join('\n');
  }

  class SousOnglets {
    /* a = {
     *   hote()        — la barre où dessiner les onglets
     *   vue()         — la vue affichée ('accueil' : aucune page)
     *   badge(id)     — facultatif : { n, ton } à afficher sur l'onglet, ou rien
     *   change(vue,id)— facultatif : appelé quand la page change (la vue suit)
     *   apres(id)     — facultatif : appelé une fois la page ouverte et dessinée
     * } */
    constructor(a) {
      this.a = a;
      this.choix = {};   // partie → dernière page ouverte
      try { this.choix = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { this.choix = {}; }
      if (root.document && !document.getElementById('sous-onglets-regles')) {
        const st = document.createElement('style'); st.id = 'sous-onglets-regles';
        st.textContent = regles(); document.head.appendChild(st);
      }
      this.page = null;
      const h = a.hote();
      if (h) {
        h.addEventListener('click', e => {
          const b = e.target.closest('[data-sous-onglet]'); if (!b) return;
          this.choisir(b.dataset.sousOnglet);
        });
        h.addEventListener('keydown', e => this.clavier(e));
      }
    }

    /** La page à ouvrir dans une partie : la dernière vue, sinon la première. */
    actifDe(partie) {
      const pages = pagesDe(partie), c = this.choix[partie];
      return pages.some(x => x.id === c) ? c : (pages[0] || {}).id || null;
    }

    /** La page ouverte, recalée sur la vue affichée si l'on est arrivé autrement. */
    actif(vue = this.a.vue()) {
      if (this.page && vueDe(this.page) === vue) return this.page;
      if (!ONGLETS[vue]) return null;
      // Arrivé par un lien vers la vue : la dernière page ouverte de cette vue.
      const deja = Object.values(this.choix).find(id => vueDe(id) === vue);
      return deja || defaut(vue);
    }

    /** Ouvre une partie, sur sa dernière page. */
    ouvrir(partie) { const id = this.actifDe(partie); if (id) this.choisir(id); }

    /* Ouvre une page, de la vue affichée ou d'une autre (la vue suivra). */
    choisir(id, focus) {
      const vue = vueDe(id), p = partieDe(id); if (!vue || !p) return;
      this.page = id;
      this.choix[p.id] = id;
      try { localStorage.setItem(CLE, JSON.stringify(this.choix)); } catch (e) { /* stockage indisponible */ }
      // La page est connue AVANT qu'on prévienne : ce qui se dessine à
      // l'ouverture (le tableau, le planning) regarde quelle page est affichée.
      if (root.document) { document.body.dataset.sous = id; document.body.dataset.partie = p.id; }
      if (this.a.change) this.a.change(vue, id);
      this.rendre();
      if (this.a.apres) this.a.apres(id);
      if (focus) { const b = this.a.hote()?.querySelector(`[data-sous-onglet="${id}"]`); if (b) b.focus(); }
    }

    rendre() {
      const vue = this.a.vue(), actif = this.actif(vue);
      this.page = actif;
      const p = actif ? partieDe(actif) : null;
      if (root.document) {
        if (actif) document.body.dataset.sous = actif; else delete document.body.dataset.sous;
        if (p) document.body.dataset.partie = p.id; else delete document.body.dataset.partie;
      }
      const h = this.a.hote(); if (!h) return;
      const liste = p ? pagesDe(p.id) : [];
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
      if (this.dessin !== html || (html && !boite.firstChild)) { boite.innerHTML = html; this.dessin = html; }
      // Sur téléphone la barre défile : l'onglet ouvert doit y rester visible.
      const on = boite.querySelector('.actif');
      if (on && boite.scrollWidth > boite.clientWidth) {
        const g = on.offsetLeft - boite.offsetLeft, d = g + on.offsetWidth;
        if (g < boite.scrollLeft) boite.scrollLeft = g - 16;
        else if (d > boite.scrollLeft + boite.clientWidth) boite.scrollLeft = d - boite.clientWidth + 16;
      }
      h.hidden = !liste.length;
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

  const api = { ONGLETS, PARTIES, defaut, vueDe, partieDe, page, pagesDe, regles, SousOnglets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyOnglets = api;
})(typeof window !== 'undefined' ? window : globalThis);
