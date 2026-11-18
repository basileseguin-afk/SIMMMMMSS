/* ==========================================================================
 *  LES AVIS — trois niveaux, les mêmes mots partout (évolution 19 d)
 *
 *  Un problème est un problème. Le registre d'avant rangeait ce qui reste à
 *  faire sous « à corriger », « à compléter » et « ce que la journée montre »,
 *  et son compteur comptait tout : une commande sans vol ce jour-là, à
 *  laquelle il n'y a rien à faire, pesait autant qu'une commande que personne
 *  ne prépare. Ici, trois niveaux, dits pareil dans le panneau, sur les
 *  onglets et dans les pages :
 *    - BLOQUANT : le calcul ne se fait pas, ou une commande n'est préparée
 *      par personne ;
 *    - À CORRIGER : le calcul se fait, mais il est faux pour une part (une
 *      compagnie qu'aucun handling ne charge, un service sans temps par vol) ;
 *    - INFORMATION : à lire, rien n'est demandé (une commande sans vol ce
 *      jour-là, un service en bout de chaîne, ce que la journée montre) ;
 *      quand une information propose un geste, elle le dit : « facultatif ».
 *  Le compteur du menu et le nombre d'un onglet ne comptent que les deux
 *  premiers. Les informations se lisent repliées, sous les autres.
 *
 *  Rien n'est calculé de plus : le niveau d'un point du calcul se lit dans son
 *  code. Le moteur dit lui-même ce qui arrête le calcul ; les codes qu'il
 *  laisse passer sont rangés ici en « à corriger » ou « information »
 *  (tests/avis.test.cjs relit sa liste : ni plus, ni moins).
 *
 *  Module de la version 1 : problemes.js, commun avec la version 2, n'est pas
 *  touché. `lister`, `compte` et `blocs` sont purs (testés en Node) ;
 *  `Registre` tient la liste à jour. Depuis l'évolution 22 (d), le panneau
 *  « Problèmes » n'existe plus : la page « Contrôles » (controles-page.js) lit
 *  le registre, et chaque avis porte de quoi mener là où il se règle (son code,
 *  son équipe, ses commandes, son service).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const NIVEAUX = [
    { id: 'bloquant', nom: 'Bloquant', un: 'bloquant', plusieurs: 'bloquants', ico: 'alerte', ton: 'retard', probleme: true,
      dit: 'Le calcul ne se fait pas, ou une commande n’est préparée par personne.' },
    { id: 'corriger', nom: 'À corriger', un: 'à corriger', plusieurs: 'à corriger', ico: 'curseurs', ton: 'attente', probleme: true,
      dit: 'Le calcul se fait, mais il est faux pour une part.' },
    { id: 'information', nom: 'Information', un: 'information', plusieurs: 'informations', ico: 'info', ton: '', probleme: false,
      dit: 'À lire : rien n’est demandé. Un geste proposé est facultatif.' }
  ];
  const RANG = Object.fromEntries(NIVEAUX.map((n, i) => [n.id, i]));
  const niveau = id => NIVEAUX[RANG[id]] || NIVEAUX[0];

  /* Ce que la journée montre : des résultats (un retard, un poste trop court,
   * une attente), pas des erreurs de saisie. La Synthèse les raconte. */
  const JOURNEE = ['poste', 'materiel', 'bouchon', 'inacheve', 'plonge-fermee', 'plonge-vol',
    'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs'];
  /* Rien à faire : une commande sans vol ce jour-là, et ce que la journée montre. */
  const INFORMATIONS = ['commande-absente'].concat(JOURNEE);
  /* Le calcul se fait, mais il est faux pour une part. */
  const A_CORRIGER = ['doublon', 'bareme', 'bareme-classe', 'lots', 'lot-vide', 'dispo', 'compagnie-inconnue',
    'tunnel-personnes', 'parcours-trou', 'hors-parcours', 'handling-duree', 'handling-sans',
    'plonge-duree', 'plonge-mixte', 'sans-personne', 'robot-arret', 'plonge-arret',
    // Des postes de travail sous le minimum d'un robot calculé (évolution 21 b) : le plafond ne s'applique pas.
    'personnesMax'];
  const PAR_CODE = new Map(INFORMATIONS.map(c => [c, 'information']).concat(A_CORRIGER.map(c => [c, 'corriger'])));

  /** Le niveau d'un point du calcul. Un code que le moteur ne laisse pas passer,
   *  ou qu'on ne connaît pas, arrête le calcul : bloquant. */
  function niveauDuCode(code) { return PAR_CODE.get(code) || 'bloquant'; }

  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  /** Un nombre, dit avec le mot de son niveau : « 2 bloquants », « 3 à corriger », « 1 information ». */
  function dire(n, id) { const nv = niveau(id); return n + ' ' + (n > 1 ? nv.plusieurs : nv.un); }

  /* Les étapes de « Prêt à simuler ? » qui bloquent : sans vol, rien ne se
   * calcule ; une commande que personne ne prépare n'est pas dans la journée. */
  const ETAPES_BLOQUANTES = new Set(['vols', 'commandes']);

  /**
   * Le registre, du bloquant à l'information.
   * @param {object} s  les sources, telles que le site les a déjà :
   *   anomalies : ce que le calcul dit ({code, message, service?}) ;
   *   fantomes  : services supprimés encore cités ({id, nom, cases, chemins}) ;
   *   liens     : alertes des liens de l'unité, quand ils servent ({texte, grave}) ;
   *   etapes    : étapes à faire ({id, titre, texte, page, services?}) ; `information` : elle se lit, rien n'est demandé ;
   *   enClair   : le texte d'une anomalie, avec les mots de la page (facultatif).
   * @returns {Array<{niveau:string, titre:string, detail:string, page:string, aussi:string[], service?:string, voulu?:string,
   *   code?:string, equipe?:string, classes?:string[], etape?:string, services?:string[], fantome?:string, lien?:boolean}>}
   *   page : où il se règle ; aussi : les pages qui le montrent aussi (et le comptent) ; voulu : la compagnie d'un
   *   avis « aucun handling ne charge cette compagnie », qui propose de dire que c'est voulu (évolution 21 e).
   *   Évolution 22 (d) : de quoi mener à l'endroit précis — le code du point, son équipe, ses commandes ; l'étape et ses
   *   services à compléter ; le service supprimé ; un avis des liens entre services.
   */
  function lister(s = {}) {
    const clair = typeof s.enClair === 'function' ? s.enClair : (t => t);
    const out = [];
    // Un service supprimé que des équipes ou des chemins citent encore : l'étape est sautée.
    for (const f of s.fantomes || []) {
      const cite = [f.cases ? pl(f.cases, 'équipe') : '', f.chemins ? pl(f.chemins, 'chemin') : ''].filter(Boolean).join(' et ');
      out.push({ niveau: 'corriger', titre: '« ' + f.nom + ' » n’existe plus dans l’unité',
        detail: (cite ? cite + ' le citent encore. ' : '') + 'Effacez-le partout, ou faites passer son travail dans un autre service.',
        page: 'mu-services', aussi: ['mu-pas'], fantome: f.id });
    }
    // Ce que le calcul dit : son code donne le niveau. Ce que la journée montre se lit dans les résultats.
    for (const a of s.anomalies || []) {
      const resultat = JOURNEE.includes(a.code);
      out.push({ niveau: niveauDuCode(a.code), titre: clair(a.message || a.code || ''), detail: '',
        // Une étape du chemin que personne ne prépare se règle dans « Chemins » (le tableau de l'étape) ; ce qui touche
        // un service ou une équipe, dans « Services et équipes » ; le reste, dans « Chemins ».
        page: resultat ? 'j-chiffres' : a.code === 'parcours-trou' || !a.service ? 'mu-flux' : 'mu-services', aussi: resultat ? [] : ['mu-pas'],
        service: !resultat && a.service ? a.service : undefined,
        ...(resultat ? {} : { code: a.code, ...(a.atelier ? { equipe: a.atelier } : {}), ...(Array.isArray(a.classes) && a.classes.length ? { classes: a.classes.slice() } : {}) }),
        // Une compagnie qu'aucun handling ne charge (évolution 21 e) : l'avis propose de dire que c'est voulu.
        ...(a.code === 'handling-sans' && a.compagnie ? { voulu: String(a.compagnie) } : {}) });
    }
    // Les liens de l'unité : ce qui est grave est « à corriger » ; un service en bout de chaîne ne demande rien.
    // (Une boucle qui arrête le calcul, c'est le calcul qui la dit : bloquant.) Ils se règlent dans « Liens entre services ».
    for (const a of s.liens || [])
      out.push({ niveau: a.grave ? 'corriger' : 'information', titre: a.texte, detail: '', page: 'u-liens', aussi: ['mu-pas'], lien: true });
    // Les étapes à faire.
    for (const e of s.etapes || []) {
      const noms = (e.services || []).map(x => x.nom);
      // Une étape qui se lit sans rien demander (les vols d'exemple, évolution 22 d) : une information.
      out.push({ niveau: e.information ? 'information' : ETAPES_BLOQUANTES.has(e.id) ? 'bloquant' : 'corriger', titre: e.titre,
        detail: noms.length ? (noms.length > 4 ? noms.slice(0, 4).join(', ') + ' et ' + pl(noms.length - 4, 'autre') : noms.join(', ')) + ' : à corriger.' : (e.texte || ''),
        page: e.page || 'mu-pas', aussi: ['mu-pas'], etape: e.id, ...(e.services && e.services.length ? { services: e.services.map(x => x.id) } : {}) });
    }
    // Du bloquant à l'information ; dans un niveau, l'ordre des sources.
    return out.map((p, i) => [p, i]).sort((a, b) => RANG[a[0].niveau] - RANG[b[0].niveau] || a[1] - b[1]).map(x => x[0]);
  }

  const estProbleme = p => niveau(p.niveau).probleme;
  /** Les pages où un avis compte : la sienne, et celles qui le montrent aussi.
   *  Une information ne compte nulle part : il n'y a rien à y faire. */
  function pages(p) { return estProbleme(p) ? [...new Set([p.page].concat(p.aussi || []))] : []; }
  /** Le nombre de problèmes (bloquants et à corriger) ; avec une page, ceux qui s'y règlent. */
  function compte(liste, page) { return liste.filter(p => estProbleme(p) && (page == null || pages(p).includes(page))).length; }
  /** Combien d'avis à chaque niveau. */
  function parNiveau(liste) {
    const n = Object.fromEntries(NIVEAUX.map(nv => [nv.id, 0]));
    for (const p of liste) n[niveau(p.niveau).id]++;
    return n;
  }
  /** « 1 bloquant · 2 à corriger » ; rien s'il n'y a pas de problème. */
  function resume(liste) {
    const n = parNiveau(liste);
    return NIVEAUX.filter(nv => nv.probleme && n[nv.id]).map(nv => dire(n[nv.id], nv.id)).join(' · ');
  }
  /** Le ton d'un nombre : celui du niveau le plus pressant qu'il compte. */
  function ton(liste) {
    const nv = NIVEAUX.find(x => x.probleme && liste.some(p => p.niveau === x.id));
    return nv ? nv.ton : '';
  }

  /* ---- le rendu -------------------------------------------------------------- */

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');
  /** Le mot qui précède un geste proposé par une information : rien n'oblige à le faire. */
  const FACULTATIF = 'Facultatif';
  const facultatif = () => '<span class="avis-facultatif">' + FACULTATIF + '</span>';
  /**
   * Dans une page que ce module n'écrit pas (les alertes des liens, d'un module commun) : chaque groupe de gestes d'une
   * information reçoit le mot « Facultatif ». `selecteur` : les groupes de gestes à marquer, sous `racine`.
   */
  function marquerFacultatifs(racine, selecteur) {
    if (!racine || !racine.querySelectorAll) return 0;
    let n = 0;
    for (const g of racine.querySelectorAll(selecteur)) {
      if (g.querySelector(':scope > .avis-facultatif')) continue;
      g.insertAdjacentHTML('afterbegin', facultatif() + ' '); n++;
    }
    return n;
  }

  /** Le bouton d'un avis « aucun handling ne charge cette compagnie » (évolution 21 e). */
  const VOULU = 'C’est voulu : pas de chargement pour cette compagnie';
  /**
   * Les avis d'une page, rangés par niveau avec les mêmes mots : les bloquants,
   * les points à corriger, puis les informations repliées.
   * @param {Array<{niveau:string, html:string}>} items  `html` est déjà échappé par celui qui l'écrit
   */
  function blocs(items) {
    const de = id => items.filter(x => x.niveau === id).map(x => '<li>' + x.html + '</li>').join('');
    return NIVEAUX.map(nv => {
      const l = de(nv.id);
      if (!l) return '';
      return nv.probleme
        ? `<section class="avis-niveau ${nv.id}"><h4>${pic(nv.ico)}${esc(nv.nom)}</h4><ul>${l}</ul></section>`
        : `<details class="avis-niveau ${nv.id}"><summary>${pic(nv.ico)}<span class="avis-nom">${esc(nv.nom)}</span></summary><ul>${l}</ul></details>`;
    }).join('');
  }

  /**
   * Le registre des avis, tenu à jour. (Le panneau « Problèmes », ouvert depuis le pied de la barre latérale, a rejoint
   * la page « Contrôles » — évolution 22 d.)
   * @param {{sources:Function, change?:Function}} a
   *   sources() — les sources de `lister` ;
   *   change()  — appelé quand la liste a changé.
   */
  class Registre {
    constructor(a) { this.a = a; this.liste = []; this.sig = ''; }

    /** Après chaque changement : la liste, refaite. Une source en panne ne bloque pas la page : on garde la liste
     *  d'avant, et on le dit dans la console. */
    maj() {
      try { this.liste = lister(this.a.sources()); }
      catch (e) { if (root.console) root.console.error('Avis : liste non mise à jour', e); }
      const sig = JSON.stringify(this.liste);
      if (sig !== this.sig) { this.sig = sig; if (typeof this.a.change === 'function') this.a.change(); }
    }
  }

  const api = { NIVEAUX, JOURNEE, INFORMATIONS, A_CORRIGER, FACULTATIF, VOULU, niveauDuCode, dire, lister, estProbleme, pages, compte, parNiveau, resume, ton, blocs, facultatif, marquerFacultatifs, Registre };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAvis = api;
})(typeof window !== 'undefined' ? window : globalThis);
