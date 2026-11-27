/* ==========================================================================
 *  « CONTRÔLES » (version 1, évolution 22 d) — deux pages et un panneau en un
 *
 *  « Prêt à simuler ? », « Contrôles détaillés » et le panneau « Problèmes »
 *  disaient la même chose à trois endroits. Ici, une page :
 *    - une ligne d'état : où en est le calcul, le dernier réglage changé et
 *      son heure, un lien vers la Synthèse ;
 *    - trois colonnes, « Bloquant », « À corriger », « Information » : les avis
 *      du registre (avis.js), au même niveau qu'avant. Une colonne vide le dit
 *      en une phrase. Chaque avis a un bouton nommé par sa destination
 *      (« Régler dans Chemins »), qui mène à la page et à l'endroit où il se
 *      règle, et « C'est voulu » quand il en a un. Au-delà de trois, les
 *      informations sont repliées.
 *
 *  Rien n'est calculé de plus : la page lit le registre. `destination`,
 *  `bouton`, `etatDuCalcul`, `direDernier`, `colonnes` et `html` sont purs
 *  (testés en Node) ; `PageControles` dessine la page à la place du pas à pas
 *  de unite.js (commun avec la version 2, non modifié).
 * ==========================================================================*/
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const AV = NODE ? require('./avis.js') : root.OrlyAvis;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pic = (nom, classe) => (root.OrlyIcones ? root.OrlyIcones.ico(nom, classe) : '');
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);

  /** Les informations montrées d'emblée ; les suivantes sont repliées. */
  const INFOS_VISIBLES = 3;
  /** Un service sans temps par vol : il se règle dans la section « Ses temps par vol » de sa fiche. */
  const SANS_TEMPS = new Set(['bareme', 'bareme-classe']);
  /** Le champ de la fiche d'une équipe qui règle un point du calcul (correction 23 c) ; sinon, son premier champ. */
  const CHAMPS = { personnesMax: 'personnesMax', 'tunnel-personnes': 'tunnel-personnes' };

  /**
   * Où un avis se règle : la page, et l'endroit dedans.
   * @param {object} p  un avis du registre (`OrlyAvis.lister`)
   * @returns {{page:string, service?:string, equipe?:string, commande?:string, lieu?:string, compagnie?:string}|null}
   *   service  — la fiche de ce service (« Services et équipes »), ou son étape (« Chemins ») ;
   *   equipe   — la fiche de cette équipe ;
   *   commande — la commande à mettre en évidence dans le tableau de l'étape ;
   *   lieu     — un endroit de la page (`temps` : les temps par vol du service ; `supprimes` : les services supprimés ;
   *              `fournisseurs` : le tableau « Qui se fournit où », dans « Chemins » — évolution 24 a) ;
   *   compagnie — le panneau de cette compagnie, dans « Commandes » (évolution 26 d).
   *   `null` : l'avis ne mène nulle part ailleurs (il se lit ici).
   */
  function destination(p) {
    if (!p) return null;
    // Ce que la journée montre est un résultat : il se lit dans la Synthèse — sur la ligne de son service (correction 23 c).
    if (p.page === 'j-chiffres') return { page: 'j-chiffres', ...(p.vu ? { service: p.vu } : {}) };
    if (p.fantome) return { page: 'mu-services', lieu: 'supprimes' };
    if (p.lien) return { page: 'u-liens' };
    // Un lien de fournisseur se règle une fois, pour toute l'unité : dans « Chemins › Fournisseurs » (évolution 24 a).
    if (p.fournisseur) return { page: 'mu-flux', lieu: 'fournisseurs' };
    // Des commandes sans équipe à plusieurs étapes de leur chemin (correction 23 c) : la première étape en cause.
    if (p.groupe && (p.etapes || []).length) return { page: 'mu-flux', service: p.etapes[0], commande: (p.classes || [])[0] || undefined };
    // Une étape du chemin que personne ne prépare : l'équipe d'une commande à une étape se choisit dans « Chemins ».
    if (p.code === 'parcours-trou' && p.service) return { page: 'mu-flux', service: p.service, commande: (p.classes || [])[0] || undefined };
    // Une commande « à compléter » (évolution 26 c) : ses équipes se choisissent dans « Chemins », à la première étape de
    // son chemin.
    if (p.aCompleter && p.commande) return { page: 'mu-flux', ...(p.service ? { service: p.service } : {}), commande: p.commande };
    // Une compagnie de la liste (évolution 26 d) : son panneau, dans « Commandes ».
    if (p.compagnie && p.page === 'mu-commandes') return { page: 'mu-commandes', compagnie: p.compagnie };
    // Un service sans temps par vol : la section de ses temps — et le champ de la commande, quand le point la nomme.
    if (SANS_TEMPS.has(p.code) && p.service) return { page: 'mu-services', service: p.service, lieu: 'temps', ...((p.classes || []).length ? { commande: p.classes[0] } : {}) };
    // Un point d'une équipe : sa fiche — sur la case de la commande cochée hors de son chemin, ou sur le champ en cause.
    if (p.equipe) return { page: 'mu-services', equipe: p.equipe, ...(p.service ? { service: p.service } : {}),
      ...(p.code === 'hors-parcours' && (p.classes || []).length ? { commande: p.classes[0] } : {}), ...(CHAMPS[p.code] ? { champ: CHAMPS[p.code] } : {}) };
    if (p.service) return { page: 'mu-services', service: p.service };
    // « Vos services et leurs équipes », et le point bloquant quand il sait ses services : le premier service à compléter.
    if (p.etape && (p.services || []).length && p.services[0] != null) return { page: 'mu-services', service: p.services[0] };
    if (!p.page || p.page === 'mu-pas') return null;
    return { page: p.page };
  }

  /** Le bouton d'un avis, nommé par sa destination : « Régler dans Chemins » ; une information se lit (« Voir dans Synthèse »). */
  function bouton(p, nomPage) {
    const d = destination(p); if (!d) return null;
    const nom = typeof nomPage === 'function' ? nomPage(d.page) : d.page;
    return { ...d, texte: (AV.estProbleme(p) ? 'Régler dans ' : 'Voir dans ') + nom + (d.lieu === 'fournisseurs' ? ' › Fournisseurs' : '') };
  }

  /**
   * Les boutons d'un avis (correction 23 c) : le sien, le plus souvent. Un point qui porte sur plusieurs services en a
   * un par service, au nom du service : chacun ouvre la fiche de ce service. Des commandes sans équipe à plusieurs étapes
   * de leur chemin en ont deux : choisir leurs équipes (la première étape en cause), ou leur donner un autre chemin (la
   * section « Qui le suit » du chemin).
   * @returns {Array<{page:string, texte:string, service?:string, equipe?:string, commande?:string, lieu?:string, chemin?:string}>}
   */
  function boutons(p, nomPage) {
    const b = bouton(p, nomPage); if (!b) return [];
    if (p.groupe) {
      const un = (p.classes || []).length < 2;
      return [{ ...destination(p), texte: un ? 'Choisir ses équipes' : 'Choisir leurs équipes' },
        { page: 'mu-flux', chemin: p.chemin, commande: (p.classes || [])[0], lieu: 'suivi', texte: un ? 'Lui donner un autre chemin' : 'Leur donner un autre chemin' }];
    }
    const services = p.etape ? (p.services || []).filter(x => x != null) : [];
    if (services.length > 1) return services.map(id => ({ page: 'mu-services', service: id, texte: String((p.nomsServices || [])[p.services.indexOf(id)] || id) }));
    return [b];
  }

  /** Où en est le calcul : `ok` (à jour), `vide` (rien à calculer), `arret` (un point bloquant l'arrête). */
  function etatDuCalcul(r) { return !r ? 'vide' : r.ok === false ? 'arret' : (r.lots || []).length ? 'ok' : 'vide'; }
  const ETATS = {
    ok: 'Le calcul est à jour',
    vide: 'Rien à calculer : aucune équipe ne prépare encore de commande',
    arret: 'Le calcul est arrêté par un point bloquant'
  };

  /** Ce qu'un historique règle, dit en clair (quand le changement n'a rien annoncé). */
  const DOMAINES = { cases: 'les équipes et les chemins', bareme: 'les temps par vol et les réglages', liens: 'les liens entre services', plan: 'le plan' };
  const deux = n => String(n).padStart(2, '0');
  /**
   * Le dernier réglage changé, et son heure : « Dernier réglage changé à 14:32 : … ». Un autre jour, sa date.
   * @param {{a:number, texte?:string, domaine?:string}|null} d
   * @param {number} maintenant
   */
  function direDernier(d, maintenant) {
    if (!d || !Number.isFinite(d.a)) return 'Aucun réglage changé dans ce navigateur pour l’instant.';
    const t = new Date(d.a), n = new Date(Number.isFinite(maintenant) ? maintenant : d.a);
    const memeJour = t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
    const quand = (memeJour ? '' : 'le ' + deux(t.getDate()) + '/' + deux(t.getMonth() + 1) + ' ') + 'à ' + deux(t.getHours()) + ':' + deux(t.getMinutes());
    const quoi = String(d.texte || '').trim() || DOMAINES[d.domaine] || '';
    return 'Dernier réglage changé ' + quand + (quoi ? ' : ' + (quoi.length > 160 ? quoi.slice(0, 157) + '…' : quoi) : '.');
  }

  const VIDES = {
    bloquant: 'Rien de bloquant : le calcul se fait, et chaque commande a une équipe pour la préparer.',
    corriger: 'Rien à corriger.',
    information: 'Aucune information.'
  };

  /** Les trois colonnes, du bloquant à l'information, chacune avec ses avis (et leur rang dans le registre). */
  function colonnes(liste) {
    return AV.NIVEAUX.map(nv => ({ niveau: nv, avis: (liste || []).map((p, i) => ({ p, i })).filter(x => x.p.niveau === nv.id) }));
  }

  /** L'endroit où une page s'ouvre quand l'avis n'en dit pas plus : la liste des chemins. */
  const LIEUX = { 'mu-flux': 'liste' };
  /** Le premier geste d'une page ou d'un endroit, quand elle n'a pas pris le clavier d'elle-même : dans l'ordre, le premier présent. */
  /** Les endroits où le clavier va sur ce geste même si la page l'a posé ailleurs (sur leur entrée, dans la liste) : le
   *  tableau « Qui se fournit où », le premier geste du panneau des services supprimés. */
  const IMPOSES = new Set(['fournisseurs', 'supprimes']);
  const PREMIERS = {
    supprimes: ['#mu-services .se-supprimes button', '#mu-services .se-supprimes select', '#mu-services .se-vers-supprimes'],
    fournisseurs: ['#mu-flux .fo-table'],
    'u-liens': ['#fc-alertes button', '#fc-alertes'],
    'v-programme': ['#imp-vols', '.vp-importer'],
    'mu-flux': ['#mu-flux .ch-liste .mu-svc.actif', '#mu-flux .ch-liste .mu-svc']
  };

  /** La raison d'un bouton grisé, en lecture seule, quand la page n'en donne pas. */
  const MOT_FERME = 'Paramétrage verrouillé';

  /**
   * La page.
   * @param {Array} liste  le registre (`OrlyAvis.lister`)
   * @param {{etat:string, dernier:object|null, maintenant:number, nomPage:Function, verrou?:boolean, ferme?:Function, motFerme?:string}} o
   *   verrou   — la lecture seule (évolution 23 d) : la page se lit en entier, mais rien ne s'y règle. Un bouton qui mène
   *              à une page fermée (`ferme(page)`) et « C'est voulu » sont grisés ; leur raison (`motFerme`) les suit,
   *              une fois par point. Un bouton qui mène à un résultat marche. Sans `verrou`, la page d'avant.
   */
  function html(liste, o = {}) {
    const etat = ETATS[o.etat] ? o.etat : 'vide';
    const verrou = !!o.verrou, ferme = pg => verrou && typeof o.ferme === 'function' && !!o.ferme(pg);
    const point = ({ p, i }) => {
      const bs = boutons(p, o.nomPage);
      const allerGris = bs.some(b => ferme(b.page)), vouluGris = verrou && !!p.voulu;
      const gris = ` disabled aria-describedby="ct-raison-${i}"`;
      // Le premier bouton d'un point bloquant est plein ; ceux d'un point à corriger ou d'une information, et les suivants
      // (un autre service, un autre geste), sont des boutons de carte (correction 24 d).
      const bloquant = (AV.NIVEAUX.some(n => n.id === p.niveau) ? p.niveau : AV.NIVEAUX[0].id) === 'bloquant';
      const aller = (b, k) => `<button type="button" class="btn btn-sm${bloquant && !k ? ' btn-play' : ''}" data-ct-aller="${i}"${k ? ` data-ct-geste="${k}"` : ''} data-ct-page="${esc(b.page)}"${ferme(b.page) ? gris : ''}>${esc(b.texte)} →</button>`;
      // Un geste qui se fait ici (évolution 26) : il écrit un réglage, grisé en lecture seule. Le premier d'un point
      // bloquant est plein, comme un bouton qui mène ailleurs.
      const gestes = p.gestes || [], gesteGris = verrou && gestes.length > 0;
      const geste = (g, k) => g.choix
        ? `<label class="ct-choix"><span>${esc(g.texte)}</span><select data-ct-action="${esc(g.action)}" data-ct-point="${i}"${verrou ? gris : ''}><option value="">choisir…</option>${
          g.choix.map(c => `<option value="${esc(c.valeur)}">${esc(c.texte)}</option>`).join('')}</select></label>`
        : `<button type="button" class="btn btn-sm${bloquant && !k && !bs.length ? ' btn-play' : ''}" data-ct-action="${esc(g.action)}" data-ct-point="${i}"${g.valeur != null ? ` data-ct-valeur="${esc(g.valeur)}"` : ''}${verrou ? gris : ''}>${esc(g.texte)}</button>`;
      return `<li class="ct-point" data-ct-point="${i}"><div class="ct-corps"><b>${esc(p.titre)}</b>${p.detail ? `<span>${esc(p.detail)}</span>` : ''}</div>
        <div class="ct-gestes">${bs.map(aller).join('')}${gestes.map(geste).join('')}${
          p.voulu ? `<button type="button" class="btn btn-sm" data-ct-voulu="${esc(p.voulu)}"${vouluGris ? gris : ''} aria-label="${esc(AV.VOULU + ' (' + p.voulu + ')')}" title="${esc(AV.VOULU)}">C’est voulu</button>` : ''}${
          allerGris || vouluGris || gesteGris ? `<small class="ct-raison" id="ct-raison-${i}">${esc(o.motFerme || MOT_FERME)}</small>` : ''}</div></li>`;
    };
    const colonne = c => {
      const nv = c.niveau, replier = nv.id === 'information' && c.avis.length > INFOS_VISIBLES;
      const vues = replier ? c.avis.slice(0, INFOS_VISIBLES) : c.avis, reste = replier ? c.avis.slice(INFOS_VISIBLES) : [];
      return `<section class="ct-niveau ${nv.id}${c.avis.length ? '' : ' vide'}" data-ct-niveau="${nv.id}" aria-labelledby="ct-t-${nv.id}">
        <h3 id="ct-t-${nv.id}">${pic(nv.ico)}<span>${esc(nv.nom)}</span><span class="ct-n">${c.avis.length}</span></h3>
        <p class="ct-dit">${esc(nv.dit)}</p>
        <div class="ct-liste">${c.avis.length ? `<ul class="ct-points">${vues.map(point).join('')}</ul>` : `<p class="ct-vide">${pic('check', 'ico-texte')}${esc(VIDES[nv.id])}</p>`}${
          reste.length ? `<details class="ct-plus"><summary>${pl(reste.length, 'autre information', 'autres informations')}</summary><ul class="ct-points">${reste.map(point).join('')}</ul></details>` : ''}</div>
      </section>`;
    };
    // La ligne d'état : trois choses côte à côte (pas un paragraphe).
    return `<div class="ct-etat ${etat}" data-ct-etat="${etat}" role="group" aria-label="État du calcul"><span class="ct-calcul"><span class="ct-voyant" aria-hidden="true"></span>${esc(ETATS[etat])}</span>
        <span class="ct-dernier">${esc(direDernier(o.dernier, o.maintenant))}</span>
        <button type="button" class="lien-discret ct-synthese" data-page="j-chiffres">Voir la Synthèse →</button></div>
      <div class="ct-cadre">${colonnes(liste).map(colonne).join('')}</div>`;
  }

  const api = { INFOS_VISIBLES, destination, bouton, boutons, etatDuCalcul, direDernier, colonnes, html };
  if (NODE) { module.exports = api; return; }
  const Base = (root.OrlyCheminsPage && root.OrlyCheminsPage.PageChemins) || (root.OrlyServicesPage && root.OrlyServicesPage.PageServices) || (root.OrlyUnite && root.OrlyUnite.MonUnite);
  if (!Base) { root.OrlyControlesPage = api; return; }

  /**
   * La page de l'unité, en version 1 : « Contrôles » y remplace le pas à pas. L'adaptateur ajoute :
   *   avis()            — le registre des avis ;
   *   dernierReglage()  — le dernier réglage changé ({a, texte, domaine}), ou rien ;
   *   voulu(compagnie)  — retenir qu'une compagnie n'a pas de chargement, et que c'est voulu ;
   *   nomPage(id)       — le nom d'une page ;
   *   aller(page, lieu) — ouvrir une page, à un endroit ;
   *   compagnie(nom)    — « Commandes », le panneau de cette compagnie ouvert (évolution 26 d) ;
   *   verrou()          — facultatif : vrai en lecture seule (évolution 23 d) — la page se lit, ses gestes sont grisés ;
   *   ferme(page)       — facultatif : la page ne s'ouvre pas ; motFerme : la raison dite sous un bouton grisé.
   */
  class PageControles extends Base {
    constructor(a) {
      super(a);
      this.lierControles();
    }

    /** « Contrôles », à la place du pas à pas (`#mu-pas`). */
    rendrePas() {
      const box = root.document.getElementById('mu-pas'); if (!box) return;
      const liste = this.a.avis ? this.a.avis() : [];
      this.avisMontres = liste;
      const ouvert = box.querySelector('.ct-plus'), deplie = ouvert ? ouvert.open : !!this.infosDepliees;
      this.poser(box, html(liste, { etat: etatDuCalcul(this.at.resultat), dernier: this.a.dernierReglage ? this.a.dernierReglage() : null,
        maintenant: Date.now(), nomPage: this.a.nomPage, verrou: this.verrouille(), ferme: this.a.ferme, motFerme: this.a.motFerme }));
      const plus = box.querySelector('.ct-plus'); if (plus && deplie) plus.open = true;
    }

    /** Un geste d'un point, fait ici : c'est la page qui le fait (`a.geste`). En lecture seule, rien. */
    faireGeste(el, valeur) {
      if (this.verrouille() || !this.a.geste) return;
      const p = (this.avisMontres || [])[+el.dataset.ctPoint];
      this.a.geste(el.dataset.ctAction, valeur, p);
    }

    /** La lecture seule est-elle en marche ? C'est la page qui le sait. */
    verrouille() { return !!(this.a.verrou && this.a.verrou()); }

    /**
     * Mène là où l'avis se règle : la page, puis l'endroit dedans — le clavier sur ce qui le règle (correction 23 c).
     * `k` : le rang du bouton, pour un avis qui en a plusieurs. En lecture seule, une page fermée ne s'ouvre pas.
     */
    allerAvis(p, k = 0) {
      const d = boutons(p, this.a.nomPage)[k] || destination(p); if (!d) return;
      if (this.verrouille() && this.a.ferme && this.a.ferme(d.page)) return;
      this.menerA(d);
      this.clavierDansLaPage(d);
    }

    /** La page et l'endroit d'une destination (`destination`, `boutons`). */
    menerA(d) {
      if (d.page === 'mu-flux' && d.lieu === 'suivi' && this.ouvrirSuivi) return this.ouvrirSuivi(d.chemin, d.commande);
      if (d.page === 'mu-flux' && d.service) return this.commandeOuService(d);
      if (d.page === 'mu-commandes' && d.compagnie && this.a.compagnie) return this.a.compagnie(d.compagnie);
      if (d.page === 'j-chiffres' && d.service && this.a.resultats) return this.a.resultats(d.service);
      if (d.page === 'mu-services' && d.equipe && this.ouvrirEquipe && this.etat.ateliers.some(a => a.id === d.equipe))
        return void (this.viser ? this.viser({ genre: d.commande ? 'cocher' : 'equipe', equipe: d.equipe, commande: d.commande, champ: d.champ }) : this.ouvrirEquipe(d.equipe));
      if (d.page === 'mu-services' && d.service) {
        if (this.viser && d.lieu !== 'supprimes') return void this.viser({ genre: d.lieu === 'temps' ? 'temps' : 'service', service: d.service, commande: d.commande });
        this.ouvrir(d.service); if (d.lieu && this.allerA) this.allerA(d.lieu); return;
      }
      if (this.a.aller) this.a.aller(d.page, d.lieu || LIEUX[d.page]); else this.a.page(d.page);
    }

    /**
     * Après le saut, le clavier est dans la page ouverte : sur ce qui règle le point quand la page l'y a mis ; sinon sur
     * son premier geste (`PREMIERS`), ou sur la page elle-même. Il ne reste jamais sur le bouton qu'on vient de quitter.
     */
    clavierDansLaPage(d) {
      const doc = root.document, a = doc.activeElement;
      if (!IMPOSES.has(d.lieu) && a && a !== doc.body && a.getClientRects().length && !a.closest('#mu-pas')) return;
      const cible = (PREMIERS[d.lieu] || PREMIERS[d.page] || []).map(sel => doc.querySelector(sel)).find(e => e && e.getClientRects().length) || doc.getElementById('workspace');
      if (!cible) return;
      if (!cible.matches('button, a[href], input, select, textarea, summary, [tabindex]')) cible.tabIndex = -1;
      cible.focus({ preventScroll: true });
    }

    /** Une étape du chemin sans équipe : le chemin de la commande, sur cette étape ; sans commande, le premier chemin qui y passe. */
    commandeOuService(d) {
      if (d.commande && this.chemin) return this.chemin(d.commande, d.service);
      const P = root.MoteurProduction, p = (this.etat.parcours || []).find(x => P.servicesDuParcours(x).includes(d.service));
      if (p && this.ouvrirFlux) return this.ouvrirFlux(p.id, d.service);
      this.a.page('mu-flux');
    }

    lierControles() {
      const d = root.document;
      d.addEventListener('click', e => {
        const box = e.target.closest && e.target.closest('#mu-pas'); if (!box) return;
        const v = e.target.closest('[data-ct-voulu]');
        if (v) {
          // En lecture seule, le bouton est grisé ; appelé quand même, il ne retient rien.
          if (this.verrouille()) return;
          // « C'est voulu » : le choix se retient, l'avis part ; le clavier reste dans la page.
          if (this.a.voulu && this.a.voulu(v.dataset.ctVoulu) === true) setTimeout(() => { const b = box.querySelector('.ct-point button, .ct-synthese'); if (b) b.focus(); }, 0);
          return;
        }
        const b = e.target.closest('[data-ct-aller]');
        if (b) return this.allerAvis((this.avisMontres || [])[+b.dataset.ctAller], +b.dataset.ctGeste || 0);
        // Un geste qui se fait ici (évolution 26) : « En faire ma liste », « L'ajouter », « L'ignorer »…
        const g = e.target.closest('button[data-ct-action]');
        if (g) this.faireGeste(g, g.dataset.ctValeur || '');
      });
      // Un geste à choisir dans une liste (« La rattacher à… ») : il se fait au choix.
      d.addEventListener('change', e => {
        const s = e.target.closest && e.target.closest('#mu-pas select[data-ct-action]');
        if (s && s.value) this.faireGeste(s, s.value);
      });
      d.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('ct-plus')) this.infosDepliees = e.target.open; }, true);
    }
  }

  root.OrlyControlesPage = { ...api, PageControles };
})(typeof window !== 'undefined' ? window : globalThis);
