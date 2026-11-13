/* Le menu : Accueil, puis cinq parties, dans l'ordre du travail (refonte du
 * 05/10 : « des onglets qui se ressemblent mais n'ont pas la même utilité ; ce
 * n'est pas intuitif ; mieux catégoriser »).
 *
 *   Vols        ce qui part et ce qui revient
 *   Chemins     par où passe chaque commande
 *   Équipes     qui prépare quoi, quand, en combien de temps
 *   Simulation  vérifier, régler, lancer
 *   Résultats   ce que la journée donne
 *
 * Une partie, un sujet. Les outils fins d'un sujet ne sont plus cachés dans
 * une partie à part (« Outils avancés ») : ils suivent ses pages, après la
 * mention « Plus » (`plus: true`). Aucune page n'a disparu : seuls leur
 * rangement et leur nom ont changé ; leurs identifiants restent les mêmes.
 *
 * Une page EST un sous-onglet d'une vue : les éléments d'une vue portent
 * `data-sous="<page>"` (ou plusieurs, séparés par des espaces), et une règle
 * de style masque ceux qui n'appartiennent pas à la page ouverte. Un élément
 * sans `data-sous` reste visible dans toutes les pages de sa vue. Les parties
 * ne déplacent rien : elles regroupent des pages de vues différentes.
 * La dernière page ouverte de chaque partie est retenue d'une visite à l'autre,
 * sauf une page de passage (`passage: true`) : le plan de l'unité, qu'on ouvre
 * pour le modifier et qu'on quitte par « Terminer » (refonte, étape 5).
 * Une page conditionnelle (`si: '<condition>'`) ne se montre que si sa
 * condition, posée par la page (`conditions`), est vraie : la période ne
 * paraît qu'avec un programme de vols daté (banc d'essai, évolution 10).
 */
(function (root) {
  'use strict';

  /* Les pages de chaque vue : c'est la vue qui porte les éléments. */
  const ONGLETS = {
    vols: [
      { id: 'v-programme', nom: 'Programme des vols', ico: 'avion' },
      { id: 'v-planche', nom: 'Planche retour', ico: 'camion' },
      // Évolution 15 (c) : un onglet de « Détails » ; son ancien nom se cherche toujours (« Aller à… »).
      { id: 'v-departs', nom: 'Vols', ancien: 'Vols prêts au départ', ico: 'depart' }
    ],
    ateliers: [
      { id: 'mu-pas', nom: 'Prêt à simuler ?', ico: 'check' },
      { id: 'mu-carte', nom: 'Vue d’ensemble', ico: 'reseau' },
      { id: 'mu-flux', nom: 'Flux de production', ico: 'fleche' },
      { id: 'mu-services', nom: 'Services et équipes', ico: 'service' },
      { id: 'at-chemins', nom: 'Chemin d’une commande', ico: 'fleche' },
      { id: 'at-equipes', nom: 'Équipes une par une', ico: 'service' },
      { id: 'at-grille', nom: 'Étapes de chaque commande', ico: 'fleche' },
      { id: 'at-planning', nom: 'Planning des équipes', ico: 'journee' },
      { id: 'at-repas', nom: 'Commandes', ancien: 'Heure de chaque commande', ico: 'plateau' },
      { id: 'at-recap', nom: 'Horaires des équipes', ico: 'journee' }
    ],
    reglages: [
      { id: 'rg-minutes', nom: 'Barème par service', ico: 'chrono' },
      { id: 'rg-recap', nom: 'Heures de travail', ico: 'chrono' },
      { id: 'rg-simulation', nom: 'Réglages de la simulation', ico: 'sablier' }
    ],
    // Arriver « sur le plan » (un lien, « voir sur le plan »), c'est arriver
    // sur la carte ; le menu, lui, ouvre les Résultats par leur synthèse.
    plan: [
      { id: 'j-plan', nom: 'Le plan rejoué', ico: 'unite' },
      { id: 'j-chiffres', nom: 'Synthèse', ico: 'check' },
      // Seulement avec un programme de vols daté (banc d'essai, évolution 10).
      { id: 'j-periode', nom: 'Période', ico: 'journee', si: 'periode' },
      { id: 'j-stocks', nom: 'Stocks et retours', ico: 'boite' },
      // Le détail derrière la Synthèse (évolution 15 b) : les heures sup et les renforts, équipe par équipe.
      { id: 'j-details', nom: 'Heures sup et renforts', ancien: 'Détails', ico: 'sablier' },
      { id: 'j-comparer', nom: 'Comparer deux essais', ico: 'lecture' },
      // La même toile, pour la modifier : une page de passage, jamais retenue.
      { id: 'u-plan', nom: 'Plan de l’unité', ico: 'unite', passage: true }
    ],
    flux: [
      { id: 'u-liens', nom: 'Liens entre services', ico: 'fleche' },
      { id: 'u-services', nom: 'Liste des services', ico: 'service' },
      { id: 'u-lecture', nom: 'Contrôles détaillés', ico: 'info' },
      { id: 'u-sauvegarde', nom: 'Sauvegarde et limites', ico: 'boite' }
    ]
  };

  /* Les parties du menu, dans l'ordre du travail. `intro` : une phrase, pas
   * un paragraphe. `plus` : un outil fin, rangé après la mention « Plus ».
   * `cache` : une partie qu'on ouvre depuis l'en-tête, sans tuile. */
  const PARTIES = [
    { id: 'donnees', nom: 'Vols', ico: 'avion', couleur: 'var(--c-vols)',
      resume: 'Ce qui part et ce qui revient',
      pages: [
        { id: 'v-programme', intro: 'Le programme de vols de la journée : importez le vôtre, en Excel ou en CSV.' },
        { id: 'v-planche', intro: 'La planche retour du handling : quand chaque vol revient à l’unité, pour la plonge. À saisir ici ou à importer en Excel.' }
      ] },
    { id: 'chemins', nom: 'Chemins', ico: 'fleche', couleur: 'var(--c-chemins)',
      resume: 'Par où passe chaque commande',
      pages: [
        { id: 'mu-carte', intro: 'Tous les chemins d’un coup d’œil : une colonne par flux, une ligne par service, rangée par étape.' },
        { id: 'mu-flux', intro: 'Les flux de production : par où ils passent, et quelle commande (compagnie × classe) suit quel chemin.' },
        { id: 'at-chemins', intro: 'Le chemin d’une commande, de bout en bout, avec l’équipe qui la prépare sur chaque service.' },
        // Un réglage (évolution 15 c) : elle quitte les Résultats pour les Chemins.
        { id: 'at-grille', intro: 'Chaque commande, étape par étape : cliquez « Prête à » pour la suivre dans le temps.' },
        { id: 'u-liens', plus: true, intro: 'Qui livre qui dans l’unité : ces liens ne servent qu’aux commandes sans chemin.' }
      ] },
    { id: 'organisation', nom: 'Équipes', ico: 'equipe', couleur: 'var(--c-equipes)',
      resume: 'Qui prépare quoi, quand, en combien de temps',
      pages: [
        { id: 'mu-services', intro: 'Chaque service : ce qu’il fait, ses équipes, ce que chacune prépare, ses heures de travail.' },
        { id: 'at-recap', intro: 'Toutes les équipes et leurs horaires d’un coup d’œil : à régler ici ou dans Excel.' },
        { id: 'rg-recap', intro: 'Toutes les heures de travail par vol : une compagnie par bloc, ses classes, un service par colonne ; ici ou dans Excel.' },
        { id: 'u-plan', intro: 'La place et la forme de chaque service sur le plan : choisissez une zone, déplacez-la, redimensionnez-la. « Terminer » ramène où vous étiez.' },
        { id: 'u-services', plus: true, intro: 'Les services de l’unité : nom, rattachement, place sur le plan, services supprimés.' },
        { id: 'at-equipes', plus: true, intro: 'Chaque équipe, une par une, avec tous ses réglages.' },
        { id: 'rg-minutes', plus: true, intro: 'Le barème, service par service, et son classeur Excel (importer, exporter, chiffres d’exemple).' }
      ] },
    { id: 'reglages', nom: 'Simulation', ico: 'sablier', couleur: 'var(--c-temps)',
      resume: 'Vérifier, régler, lancer',
      pages: [
        { id: 'mu-pas', intro: 'Ce qu’il reste à faire avant de simuler, dans l’ordre : chaque point mène là où il se règle.' },
        { id: 'rg-simulation', intro: 'Tous les réglages de la simulation, au même endroit : horaires des vols, retours à la plonge et boucle du matériel, rythme et pauses.' },
        { id: 'u-lecture', plus: true, intro: 'Ce que le calcul comprend de votre organisation, point par point, et ce qu’il faut corriger.' }
      ] },
    { id: 'resultats', nom: 'Résultats', ico: 'journee', couleur: 'var(--c-journee)',
      resume: 'Ce que la journée donne',
      pages: [
        { id: 'j-chiffres', intro: 'Combien de personnes il faut, où ça coince, quand chaque service finit, ce qui part en retard, ce que change un essai.' },
        { id: 'j-periode', intro: 'La période jour après jour : les personnes, le besoin exact, les heures sup et les retards de chaque service.' },
        { id: 'j-plan', intro: 'Rejouez la journée sur le plan de l’unité : qui travaille, qui attend, ce qui est prêt.' },
        // Le planning occupe sa page (correction 18 b) : sa phrase n'est pas affichée (`sansIntro`).
        { id: 'at-planning', sansIntro: true, intro: 'Qui travaille quand : toute l’unité sur un écran, une ligne par service, de l’amont vers l’aval ; un clic déplie ses équipes ; un jour à la fois, trois zooms, l’axe des heures toujours visible ; le tableau des équipes dessous.' },
        // « Détails » (évolution 15 c) : quatre pages en onglets internes, une seule entrée au menu (GROUPES).
        { id: 'at-repas', groupe: 'details', intro: 'Chaque commande : les exceptions d’abord ; celles qui sont à l’heure se déplient.' },
        { id: 'v-departs', groupe: 'details', intro: 'Chaque vol : les exceptions d’abord ; ceux qui sont chargés à l’heure se déplient.' },
        { id: 'j-stocks', groupe: 'details', intro: 'Ce qui attend entre deux services, et les retours des vols à la plonge.' },
        { id: 'j-details', groupe: 'details', intro: 'Les heures supplémentaires et les renforts, équipe par équipe.' },
        { id: 'j-comparer', intro: 'Retenez deux essais et voyez ce qui a bougé.' }
      ] },
    { id: 'fichier', nom: 'Sauvegarde', ico: 'boite', couleur: 'var(--c-unite)', cache: true,
      resume: 'Votre travail dans un fichier',
      pages: [
        { id: 'u-sauvegarde', intro: 'Enregistrez tout votre travail dans un fichier, et relisez-le plus tard.' }
      ] }
  ];
  const CLE = 'ory-menu-pages';
  /**
   * Les groupes de pages (évolution 15 c) : une seule entrée au menu, ses pages en onglets internes, en tête de page.
   * « Détails » : les commandes, les vols, les stocks et les heures sup, derrière la Synthèse.
   */
  const GROUPES = { details: { nom: 'Détails', ico: 'info' } };

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
  /** Les conditions des pages conditionnelles : `conditions.periode = () => …`, posée par la page. */
  const conditions = {};
  /** La page se montre-t-elle ? Toujours, sauf une page conditionnelle dont la condition est fausse. */
  const montree = id => { const o = page(id); return !!o && (!o.si || !!(conditions[o.si] && conditions[o.si]())); };
  /** Les pages d'une partie qui se montrent, dans l'ordre du menu. */
  const pagesDe = partie => ((PARTIES.find(p => p.id === partie) || {}).pages || []).map(x => page(x.id)).filter(x => montree(x.id));
  /** Les pages d'un groupe qui se montrent, dans l'ordre du menu. */
  const pagesDuGroupe = g => PARTIES.flatMap(p => pagesDe(p.id)).filter(x => x.groupe === g);
  /**
   * Les entrées du menu d'une partie : ses pages, un groupe une seule fois (à la place de sa première page), avec son
   * nom et son pictogramme ; `cible` : la page qu'il ouvre (la dernière ouverte du groupe, sinon la première).
   */
  function menuDe(partie, choix = {}) {
    const vus = new Set(), out = [];
    for (const o of pagesDe(partie)) {
      if (!o.groupe) { out.push(o); continue; }
      if (vus.has(o.groupe)) continue;
      vus.add(o.groupe);
      const pages = pagesDuGroupe(o.groupe), c = choix['groupe:' + o.groupe];
      out.push({ ...GROUPES[o.groupe], groupe: o.groupe, id: pages.some(x => x.id === c) ? c : o.id, pages: pages.map(x => x.id) });
    }
    return out;
  }

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
      try { this.parVue = JSON.parse(localStorage.getItem(CLE + '-vues') || '{}') || {}; } catch (e) { this.parVue = {}; }
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
      const n = a.interne ? a.interne() : null;
      if (n) {
        n.addEventListener('click', e => { const b = e.target.closest('[data-sous-onglet]'); if (b) this.choisir(b.dataset.sousOnglet); });
        n.addEventListener('keydown', e => this.clavier(e, n));
      }
    }

    /** La page à ouvrir dans une partie : la dernière vue, sinon la première. */
    actifDe(partie) {
      const pages = pagesDe(partie), c = this.choix[partie];
      return pages.some(x => x.id === c) ? c : (pages[0] || {}).id || null;
    }

    /** La page ouverte, recalée sur la vue affichée si l'on est arrivé autrement. */
    actif(vue = this.a.vue()) {
      if (this.page && vueDe(this.page) === vue) {
        if (montree(this.page)) return this.page;
        // Une page qui ne se montre plus (la période, sans programme daté) : la première de sa partie, dans la même vue.
        const p = partieDe(this.page), autre = p && pagesDe(p.id).find(x => x.vue === vue);
        if (autre) return autre.id;
      }
      if (!ONGLETS[vue]) return null;
      // Arrivé par un lien vers la vue : la dernière page ouverte de cette vue
      // (une vue porte des pages de plusieurs parties : Chemins, Équipes, Simulation).
      const pv = (this.parVue || {})[vue];
      const deja = (pv && vueDe(pv) === vue && montree(pv) ? pv : null) || Object.values(this.choix).find(id => vueDe(id) === vue && montree(id));
      return deja || defaut(vue);
    }

    /** Ouvre une partie, sur sa dernière page. */
    ouvrir(partie) { const id = this.actifDe(partie); if (id) this.choisir(id); }

    /* Ouvre une page, de la vue affichée ou d'une autre (la vue suivra). */
    choisir(id, focus) {
      const vue = vueDe(id), p = partieDe(id); if (!vue || !p || !montree(id)) return;
      this.page = id;
      // Une page de passage n'est pas retenue : sa partie et sa vue rouvrent la page d'avant.
      if (!ONGLETS[vue].find(o => o.id === id).passage) {
        this.choix[p.id] = id;
        const g = page(id).groupe;
        if (g) this.choix['groupe:' + g] = id;
        (this.parVue || (this.parVue = {}))[vue] = id;
        try { localStorage.setItem(CLE, JSON.stringify(this.choix)); localStorage.setItem(CLE + '-vues', JSON.stringify(this.parVue)); } catch (e) { /* stockage indisponible */ }
      }
      // La page est connue AVANT qu'on prévienne : ce qui se dessine à
      // l'ouverture (le tableau, le planning) regarde quelle page est affichée.
      if (root.document) { document.body.dataset.sous = id; document.body.dataset.partie = p.id; }
      if (this.a.change) this.a.change(vue, id);
      this.rendre();
      if (this.a.apres) this.a.apres(id);
      // Le focus reste dans la barre d'où vient le geste : le menu, ou les onglets internes d'un groupe.
      if (focus) { const h = typeof focus === 'object' ? focus : this.a.hote(), b = h?.querySelector(`[data-sous-onglet="${id}"]`); if (b) b.focus(); }
    }

    rendre() {
      const vue = this.a.vue(), actif = this.actif(vue);
      // La page ouverte ne se montre plus : celle qui la remplace s'ouvre, comme d'un clic.
      if (actif && this.page && actif !== this.page && !montree(this.page)) { this.choisir(actif); return; }
      this.page = actif;
      const p = actif ? partieDe(actif) : null;
      if (root.document) {
        if (actif) document.body.dataset.sous = actif; else delete document.body.dataset.sous;
        if (p) document.body.dataset.partie = p.id; else delete document.body.dataset.partie;
      }
      this.rendreInterne(actif);
      const h = this.a.hote(); if (!h) return;
      const liste = p ? menuDe(p.id, this.choix) : [], dans = actif ? (page(actif) || {}).groupe : null;
      const I = root.OrlyIcones;
      const html = liste.map((o, i) => {
        const on = o.groupe ? o.groupe === dans : o.id === actif, b = !o.groupe && this.a.badge ? this.a.badge(o.id) : null;
        // Les outils fins du sujet, après la mention « Plus » (05/10).
        const sep = o.plus && !(liste[i - 1] || {}).plus ? '<span class="so-plus" aria-hidden="true">Plus</span>' : '';
        return sep + `<button type="button" role="tab" class="so-onglet${on ? ' actif' : ''}${o.plus ? ' so-secondaire' : ''}" data-sous-onglet="${o.id}"
          aria-selected="${on}" tabindex="${on ? 0 : -1}">${I ? I.ico(o.ico) : ''}<span>${esc(o.nom)}</span>${
          b && b.n ? `<b class="so-badge ${esc(b.ton || '')}" title="${esc(b.titre || '')}">${esc(b.n)}</b>` : ''}</button>`;
      }).join('');
      // Redessiner seulement si quelque chose a changé : sinon l'onglet qui a
      // le focus clavier le perdrait à chaque recalcul de la journée.
      const boite = h.querySelector('.so-liste') || h;
      const redessine = this.dessin !== html || (html && !boite.firstChild);
      if (redessine) { boite.innerHTML = html; this.dessin = html; }
      h.hidden = !liste.length;
      // Rien n'a bougé (un recalcul de la journée) : rien à mesurer. Lire les
      // tailles forcerait une mise en page au milieu du calcul (étape 10).
      if (!redessine && this.vu === actif) return;
      // Sur téléphone la barre défile : l'onglet ouvert doit y rester visible.
      const on = boite.querySelector('.actif');
      if (on && boite.scrollWidth > boite.clientWidth) {
        const g = on.offsetLeft - boite.offsetLeft, d = g + on.offsetWidth;
        if (g < boite.scrollLeft) boite.scrollLeft = g - 16;
        else if (d > boite.scrollLeft + boite.clientWidth) boite.scrollLeft = d - boite.clientWidth + 16;
      }
      // Dans la barre latérale (refonte du 08/10), les pages se suivent en
      // colonne et la barre défile en hauteur : la page ouverte y reste visible,
      // une fois, quand elle change (on ne reprend pas la main à qui fait défiler).
      const zone = on && on.closest('.barre-defile');
      if (zone && this.vu !== actif && zone.scrollHeight > zone.clientHeight) {
        const r = on.getBoundingClientRect(), z = zone.getBoundingClientRect();
        if (r.top < z.top) zone.scrollTop -= z.top - r.top + 8;
        else if (r.bottom > z.bottom) zone.scrollTop += r.bottom - z.bottom + 8;
      }
      this.vu = actif;
    }

    /** Les onglets internes d'un groupe (« Détails ») : en tête de page, seulement sur une page du groupe. */
    rendreInterne(actif) {
      const n = this.a.interne ? this.a.interne() : null; if (!n) return;
      const g = actif ? (page(actif) || {}).groupe : null, pages = g ? pagesDuGroupe(g) : [];
      n.hidden = !pages.length;
      const html = pages.map(o => `<button type="button" role="tab" class="oi-onglet${o.id === actif ? ' actif' : ''}" data-sous-onglet="${o.id}"
        aria-selected="${o.id === actif}" tabindex="${o.id === actif ? 0 : -1}">${esc(o.nom)}</button>`).join('');
      if (n.__html !== html) { n.innerHTML = html; n.__html = html; }
      if (g) n.setAttribute('aria-label', GROUPES[g].nom);
    }

    /* Flèches, Début et Fin : le parcours clavier des onglets. Les pages se
     * suivent en colonne dans la barre latérale : haut et bas valent gauche et droite. */
    clavier(e, hote = this.a.hote()) {
      const b = e.target.closest('[data-sous-onglet]'); if (!b) return;
      const tous = [...hote.querySelectorAll('[data-sous-onglet]')], i = tous.indexOf(b);
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tous.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const cible = tous[(j + tous.length) % tous.length];
      this.choisir(cible.dataset.sousOnglet, hote);
    }
  }

  const api = { ONGLETS, PARTIES, GROUPES, conditions, montree, defaut, vueDe, partieDe, page, pagesDe, pagesDuGroupe, menuDe, regles, SousOnglets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyOnglets = api;
})(typeof window !== 'undefined' ? window : globalThis);
