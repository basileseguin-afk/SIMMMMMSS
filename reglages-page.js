/* ==========================================================================
 *  « RÉGLAGES » (version 1, évolution 23 e) — une liste à gauche, une fiche à droite
 *
 *  La page alignait tous les réglages de la simulation dans une seule colonne,
 *  sur plusieurs écrans. Elle prend le rangement de « Services et équipes » :
 *    - à gauche, la liste de ses sections, par leur titre d'aujourd'hui ;
 *    - à droite, la section choisie, seule, sur toute la largeur ;
 *    - les réglages rares d'une section, repliés sous « Réglages avancés » ;
 *    - aucun résultat : le bilan du matériel se lit dans « Détails ».
 *
 *  Les panneaux restent ceux d'avant, dessinés par qui les dessinait
 *  (reglages.js, commun avec la version 2 et non modifié ; sim.js ; ateliers.js) :
 *  ce module pose la liste à côté d'eux, et une règle de style ne montre que le
 *  panneau de la section choisie. Aucun champ ne change, aucun n'est déplacé
 *  d'un panneau à l'autre. Celui qui dessine un panneau demande à ce module
 *  comment replier ses réglages rares (`avance`) ; sans ce module, il écrit le
 *  panneau d'avant.
 *
 *  `SECTIONS`, `regles`, `liste`, `choix`, `avance`, `versDetails`, `lire` et
 *  `ecrire` sont purs (testés en Node) ; `PageReglages` range la page.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');

  /** La section choisie se retient dans ce navigateur, comme le thème : une préférence d'affichage, hors des données. */
  const CLE = 'ory-ui-reglages-section';
  const HOTE = '#view-reglages', FICHE = '#rg-modele';

  /**
   * Les sections, dans l'ordre de la liste : leur titre d'aujourd'hui, le panneau de la page qu'elles montrent
   * (`panneau`) et, quand deux sections se partagent un panneau, leur part (`dedans`).
   */
  const SECTIONS = Object.freeze([
    { id: 'horaires', nom: 'Horaires des vols', ico: 'avion', panneau: '#rg-sim-horaires' },
    { id: 'retours', nom: 'Retours des vols à la plonge', ico: 'camion', panneau: '#rg-sim-materiel', dedans: '.at-retours' },
    { id: 'materiel', nom: 'Matériel en boucle', ico: 'trolley', panneau: '#rg-sim-materiel', dedans: '.at-mat' },
    { id: 'rythme', nom: 'Rythme de travail', ico: 'chrono', panneau: '#rg-sim-rythme' },
    { id: 'pauses', nom: 'Pauses et présence', ico: 'pause', panneau: '#rg-sim-pauses' },
    { id: 'heures-sup', nom: 'Heures supplémentaires', ico: 'sablier', panneau: '#rg-sim-heures-sup' },
    { id: 'renforts', nom: 'Renforts', ico: 'equipe', panneau: '#rg-sim-renforts' },
    { id: 'ordre', nom: 'Ordre des lots', ico: 'pas', panneau: '#rg-sim-ordre' },
    { id: 'spml', nom: 'Repas spéciaux par cabine', ico: 'couverts', panneau: '#rg-sim-spml' },
    { id: 'seuils', nom: 'Seuils d’alerte', ico: 'alerte', panneau: '#rg-sim-seuils' }
  ].map(Object.freeze));

  /**
   * Les réglages rares de chaque section, repliés sous « Réglages avancés » : des valeurs qu'on laisse le plus souvent
   * à leur défaut. Pour les seuils : leurs clés ; pour les autres, celui qui dessine le panneau sait lesquels.
   */
  const RARES = Object.freeze({
    retours: Object.freeze(['mat-delai', 'mat-sale']),
    renforts: Object.freeze(['efficacite', 'efficaciteAutreService', 'delai', 'versHeuresSup']),
    seuils: Object.freeze(['occupation', 'dureeStockMax'])
  });

  const section = id => SECTIONS.find(s => s.id === id) || null;

  /**
   * Les règles de style : la section choisie (`data-rs`, sur la page) se montre seule dans la fiche ; d'un panneau
   * partagé, seule sa part. Sans section choisie — la page d'avant —, aucune règle ne joue.
   */
  function regles() {
    return SECTIONS.map(s => `${HOTE}[data-rs="${s.id}"] ${FICHE}>:not(${s.panneau}){display:none}`
      + (s.dedans ? `\n${HOTE}[data-rs="${s.id}"] ${s.panneau}>:not(${s.dedans}){display:none}` : '')).join('\n');
  }

  /** La liste, à gauche : une entrée par section qui se montre (`visibles` : leurs identifiants), la choisie marquée. */
  function liste(visibles, choisie) {
    const vues = new Set(visibles || []);
    return `<nav class="rs-liste" aria-label="Les sections des réglages">${SECTIONS.filter(s => vues.has(s.id)).map(s =>
      `<button type="button" class="mu-svc rs-entree${s.id === choisie ? ' actif' : ''}" data-rs-choisir="${s.id}" aria-current="${s.id === choisie}">`
      + `<span class="mu-svc-ico" aria-hidden="true">${pic(s.ico)}</span><span class="mu-svc-txt"><b>${esc(s.nom)}</b></span></button>`).join('')}</nav>`;
  }

  /** La section à montrer : celle qu'on a choisie si elle se montre encore ; sinon la première de la liste ; sinon rien. */
  function choix(voulue, visibles) {
    const vues = new Set(visibles || []);
    if (voulue && vues.has(voulue) && section(voulue)) return voulue;
    const premiere = SECTIONS.find(s => vues.has(s.id));
    return premiere ? premiere.id : null;
  }

  /** La section choisie, retenue dans ce navigateur ; une valeur inconnue, ou un stockage indisponible : rien. */
  function lire(stockage) {
    try { const v = stockage && stockage.getItem(CLE); return section(v) ? v : null; } catch (e) { return null; }
  }
  function ecrire(stockage, id) {
    try { if (stockage && section(id)) stockage.setItem(CLE, id); } catch (e) { /* stockage indisponible : le choix vaut pour la visite */ }
  }

  /** Les « Réglages avancés » dépliés par la personne : ils le restent quand leur panneau se redessine. */
  const depliees = new Set();
  function retenirAvance(id, ouvert) { if (ouvert) depliees.add(id); else depliees.delete(id); }

  /**
   * Les réglages rares d'une section, repliés sous « Réglages avancés ». `contenu` : leurs champs, tels que le panneau
   * les écrivait. Rien à replier : rien n'est écrit.
   */
  function avance(id, contenu) {
    if (!String(contenu || '').trim()) return '';
    return `<details class="rs-avance" data-rs-avance="${esc(id)}"${depliees.has(id) ? ' open' : ''}><summary>Réglages avancés</summary>`
      + `<div class="rs-avance-corps">${contenu}</div></details>`;
  }

  /** Aucun résultat sur la page : ce qui s'y lisait du matériel devient un lien vers « Détails ». */
  function versDetails() {
    return '<p class="mini-note rs-vers-details">Ce que la journée en fait (revenu des vols, lavé, reste propre) se lit dans '
      + '<button type="button" class="lien-discret" data-page="j-stocks">Détails › Stocks et retours →</button></p>';
  }

  const api = { CLE, SECTIONS, RARES, regles, liste, choix, lire, ecrire, avance, retenirAvance, versDetails };
  if (NODE) { module.exports = api; return; }

  /**
   * La page. L'adaptateur :
   *   hote()     — l'élément de la page (`#view-reglages`) ;
   *   stockage() — où retenir la section choisie (facultatif).
   */
  class PageReglages {
    constructor(a) {
      this.a = a;
      this.choisie = lire(this.stockage());
      this.poser();
    }

    stockage() { try { return this.a.stockage ? this.a.stockage() : null; } catch (e) { return null; } }

    /** Pose la liste à côté des panneaux, et la règle qui ne montre que la section choisie. Une fois. */
    poser() {
      const d = root.document, hote = this.a.hote(), fiche = hote && hote.querySelector(FICHE);
      if (!hote || !fiche || hote.querySelector('.rs-colonne')) return;
      if (!d.getElementById('rs-regles')) { const st = d.createElement('style'); st.id = 'rs-regles'; st.textContent = regles(); d.head.appendChild(st); }
      // Les deux panneaux que la page écrit sans nom (reglages.js) en reçoivent un : celui de leur section.
      for (const [champ, id] of [['#rg-rendement', 'rg-sim-rythme'], ['#rg-seuils', 'rg-sim-pauses']]) {
        const p = fiche.querySelector(champ), panneau = p && p.closest('.panneau');
        if (panneau && !panneau.id) panneau.id = id;
      }
      const colonne = d.createElement('div');
      colonne.className = 'rs-colonne';
      colonne.innerHTML = '<div class="rs-liste-hote"></div><div class="rs-pied"></div>';
      hote.insertBefore(colonne, fiche);
      // Ce qui vaut pour toute la page — où se règle le reste, « Remettre les chiffres d'exemple » — vient sous la liste.
      const pied = colonne.querySelector('.rs-pied');
      for (const sel of ['.rg-ailleurs', '.rg-reset-ligne']) { const e = fiche.querySelector(':scope>' + sel); if (e) pied.appendChild(e); }
      hote.classList.add('rs');
      colonne.addEventListener('click', e => { const b = e.target.closest('[data-rs-choisir]'); if (b) this.choisir(b.dataset.rsChoisir, true); });
      // Flèches, Début et Fin : d'une section à l'autre, comme dans le menu.
      colonne.addEventListener('keydown', e => {
        const b = e.target.closest('[data-rs-choisir]'); if (!b) return;
        const tous = [...colonne.querySelectorAll('[data-rs-choisir]')], i = tous.indexOf(b);
        const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: tous.length - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault();
        this.choisir(tous[(j + tous.length) % tous.length].dataset.rsChoisir, true);
      });
      // « Réglages avancés » dépliés : ils le restent quand leur panneau se redessine.
      fiche.addEventListener('toggle', e => { const t = e.target; if (t.classList && t.classList.contains('rs-avance')) retenirAvance(t.dataset.rsAvance, t.open); }, true);
      // Un panneau arrive, part ou se vide (un réglage qui ne joue pas) : la liste suit.
      if (typeof root.MutationObserver === 'function') new root.MutationObserver(() => this.rendre()).observe(fiche, { childList: true });
      this.rendre();
    }

    /** La section a-t-elle quelque chose à régler ? Son panneau est là, n'est pas caché, et porte sa part. */
    seMontre(s) {
      const hote = this.a.hote(), p = hote && hote.querySelector(s.panneau);
      if (!p || p.hidden || p.hasAttribute('data-nj-masque') || !p.firstElementChild) return false;
      return !s.dedans || !!p.querySelector(':scope>' + s.dedans);
    }

    visibles() { return SECTIONS.filter(s => this.seMontre(s)).map(s => s.id); }

    /** Redessine la liste, et montre la section choisie (ou, si elle ne se montre plus, la première). */
    rendre() {
      const hote = this.a.hote(), boite = hote && hote.querySelector('.rs-liste-hote'); if (!boite) return;
      const visibles = this.visibles(), id = choix(this.choisie, visibles);
      if (id) hote.dataset.rs = id; else delete hote.dataset.rs;
      const html = liste(visibles, id);
      if (this.dessin === html) return;
      const focus = boite.contains(root.document.activeElement);
      boite.innerHTML = html; this.dessin = html;
      if (focus) { const b = boite.querySelector('.actif'); if (b) b.focus(); }
    }

    /** Montre une section. `focus` : le geste vient de la liste, le clavier y reste. */
    choisir(id, focus) {
      if (!section(id)) return;
      this.choisie = id;
      ecrire(this.stockage(), id);
      this.rendre();
      const hote = this.a.hote(), fiche = hote && hote.querySelector(FICHE);
      if (fiche) fiche.scrollTop = 0;
      if (focus) { const b = hote && hote.querySelector('.rs-liste [data-rs-choisir="' + id + '"]'); if (b) b.focus(); }
    }

    /** La section qui porte un élément de la page, ou rien. */
    sectionDe(el) {
      const hote = this.a.hote(); if (!el || !hote || !hote.contains(el)) return null;
      const s = SECTIONS.find(x => { const p = hote.querySelector(x.panneau); return !!p && p.contains(el) && (!x.dedans || !!el.closest(x.panneau + '>' + x.dedans)); });
      return s ? s.id : null;
    }

    /** Montre un élément de la page : sa section, et ses « Réglages avancés » s'il y est rangé. */
    montrer(el) {
      const id = this.sectionDe(el); if (!id) return false;
      this.choisir(id);
      for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
      return true;
    }
  }

  root.OrlyReglagesPage = { ...api, PageReglages };
})(typeof window !== 'undefined' ? window : globalThis);
