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

  /**
   * Où un avis se règle : la page, et l'endroit dedans.
   * @param {object} p  un avis du registre (`OrlyAvis.lister`)
   * @returns {{page:string, service?:string, equipe?:string, commande?:string, lieu?:string}|null}
   *   service  — la fiche de ce service (« Services et équipes »), ou son étape (« Chemins ») ;
   *   equipe   — la fiche de cette équipe ;
   *   commande — la commande à mettre en évidence dans le tableau de l'étape ;
   *   lieu     — un endroit de la page (`temps` : les temps par vol du service ; `supprimes` : les services supprimés).
   *   `null` : l'avis ne mène nulle part ailleurs (il se lit ici).
   */
  function destination(p) {
    if (!p) return null;
    // Ce que la journée montre est un résultat : il se lit dans la Synthèse.
    if (p.page === 'j-chiffres') return { page: 'j-chiffres' };
    if (p.fantome) return { page: 'mu-services', lieu: 'supprimes' };
    if (p.lien) return { page: 'u-liens' };
    // Une étape du chemin que personne ne prépare : l'équipe d'une commande à une étape se choisit dans « Chemins ».
    if (p.code === 'parcours-trou' && p.service) return { page: 'mu-flux', service: p.service, commande: (p.classes || [])[0] || undefined };
    if (SANS_TEMPS.has(p.code) && p.service) return { page: 'mu-services', service: p.service, lieu: 'temps' };
    if (p.equipe) return { page: 'mu-services', equipe: p.equipe, ...(p.service ? { service: p.service } : {}) };
    if (p.service) return { page: 'mu-services', service: p.service };
    // « Vos services et leurs équipes » : le premier service à compléter.
    if (p.etape === 'services' && (p.services || []).length) return { page: 'mu-services', service: p.services[0] };
    if (!p.page || p.page === 'mu-pas') return null;
    return { page: p.page };
  }

  /** Le bouton d'un avis, nommé par sa destination : « Régler dans Chemins » ; une information se lit (« Voir dans Synthèse »). */
  function bouton(p, nomPage) {
    const d = destination(p); if (!d) return null;
    const nom = typeof nomPage === 'function' ? nomPage(d.page) : d.page;
    return { ...d, texte: (AV.estProbleme(p) ? 'Régler dans ' : 'Voir dans ') + nom };
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

  /**
   * La page.
   * @param {Array} liste  le registre (`OrlyAvis.lister`)
   * @param {{etat:string, dernier:object|null, maintenant:number, nomPage:Function}} o
   */
  function html(liste, o = {}) {
    const etat = ETATS[o.etat] ? o.etat : 'vide';
    const point = ({ p, i }) => {
      const b = bouton(p, o.nomPage);
      return `<li class="ct-point" data-ct-point="${i}"><div class="ct-corps"><b>${esc(p.titre)}</b>${p.detail ? `<span>${esc(p.detail)}</span>` : ''}</div>
        <div class="ct-gestes">${b ? `<button type="button" class="btn btn-sm${AV.estProbleme(p) ? ' btn-play' : ''}" data-ct-aller="${i}" data-ct-page="${esc(b.page)}">${esc(b.texte)} →</button>` : ''}${
          p.voulu ? `<button type="button" class="btn btn-sm" data-ct-voulu="${esc(p.voulu)}" aria-label="${esc(AV.VOULU + ' (' + p.voulu + ')')}" title="${esc(AV.VOULU)}">C’est voulu</button>` : ''}</div></li>`;
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

  const api = { INFOS_VISIBLES, destination, bouton, etatDuCalcul, direDernier, colonnes, html };
  if (NODE) { module.exports = api; return; }
  const Base = (root.OrlyCheminsPage && root.OrlyCheminsPage.PageChemins) || (root.OrlyServicesPage && root.OrlyServicesPage.PageServices) || (root.OrlyUnite && root.OrlyUnite.MonUnite);
  if (!Base) { root.OrlyControlesPage = api; return; }

  /**
   * La page de l'unité, en version 1 : « Contrôles » y remplace le pas à pas. L'adaptateur ajoute :
   *   avis()            — le registre des avis ;
   *   dernierReglage()  — le dernier réglage changé ({a, texte, domaine}), ou rien ;
   *   voulu(compagnie)  — retenir qu'une compagnie n'a pas de chargement, et que c'est voulu ;
   *   nomPage(id)       — le nom d'une page ;
   *   aller(page, lieu) — ouvrir une page, à un endroit.
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
        maintenant: Date.now(), nomPage: this.a.nomPage }));
      const plus = box.querySelector('.ct-plus'); if (plus && deplie) plus.open = true;
    }

    /** Mène là où l'avis se règle : la page, puis l'endroit dedans. */
    allerAvis(p) {
      const d = destination(p); if (!d) return;
      if (d.page === 'mu-flux' && d.service) return this.commandeOuService(d);
      if (d.page === 'mu-services' && d.equipe && this.ouvrirEquipe && this.etat.ateliers.some(a => a.id === d.equipe)) return void this.ouvrirEquipe(d.equipe);
      if (d.page === 'mu-services' && d.service) { this.ouvrir(d.service); if (d.lieu && this.allerA) this.allerA(d.lieu); return; }
      if (this.a.aller) this.a.aller(d.page, d.lieu); else this.a.page(d.page);
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
          // « C'est voulu » : le choix se retient, l'avis part ; le clavier reste dans la page.
          if (this.a.voulu && this.a.voulu(v.dataset.ctVoulu) === true) setTimeout(() => { const b = box.querySelector('.ct-point button, .ct-synthese'); if (b) b.focus(); }, 0);
          return;
        }
        const b = e.target.closest('[data-ct-aller]');
        if (b) return this.allerAvis((this.avisMontres || [])[+b.dataset.ctAller]);
      });
      d.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('ct-plus')) this.infosDepliees = e.target.open; }, true);
    }
  }

  root.OrlyControlesPage = { ...api, PageControles };
})(typeof window !== 'undefined' ? window : globalThis);
