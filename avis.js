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

  /** Quatre noms au plus, puis leur nombre : « A, B, C, D et 3 autres » ; « A et B » (correction 23 c). */
  function nommer(noms, max = 4) {
    const l = (noms || []).map(String);
    if (l.length > max) return l.slice(0, max).join(', ') + ' et ' + pl(l.length - max, 'autre');
    return l.length > 1 ? l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : (l[0] || '');
  }

  /**
   * Le plus grand nombre de paires (étape, groupe) sans élément commun : chaque étape essaie de prendre un de ses
   * groupes, quitte à faire changer d'étape celui qui le tenait.
   * @param {number[][]} voisins  pour chaque étape, les rangs de ses groupes
   * @param {number} n  le nombre de groupes
   * @returns {{tenu:number[], libres:number[]}}  tenu[g] : l'étape qui tient le groupe g (−1 : aucune) ; libres : les étapes sans groupe
   */
  function apparier(voisins, n) {
    const tenu = new Array(n).fill(-1), libres = [];
    const prendre = (i, vus) => voisins[i].some(g => {
      if (vus.has(g)) return false;
      vus.add(g);
      if (tenu[g] >= 0 && !prendre(tenu[g], vus)) return false;
      tenu[g] = i; return true;
    });
    voisins.forEach((_, i) => { if (!prendre(i, new Set())) libres.push(i); });
    return { tenu, libres };
  }

  /**
   * Les étapes sans équipe, regroupées (correction 23 c). Le calcul en dit une par étape. Quand une même commande n'a
   * d'équipe à aucune de plusieurs étapes de son chemin, la cause est la commande — elle suit un chemin qui n'est pas le
   * sien —, pas ces étapes : un seul point la nomme. On cherche le plus petit nombre de points qui dise tout, un par
   * étape ou un par groupe de commandes (même chemin, mêmes étapes) ; à égalité, par étape, comme avant : un groupe ne
   * prend la place de ses étapes que s'il le faut (théorème de König : la plus petite couverture d'un graphe biparti).
   * Il n'y a donc jamais plus de points qu'avant.
   * @param {Array<{service:string, classes:string[]}>} trous  les étapes sans équipe, dans l'ordre du calcul
   * @param {(classe:string)=>({id:string, nom:string}|null)} cheminDe  le chemin que suit une commande
   * @returns {{etapes:Set<string>, groupes:Array<{chemin:object|null, classes:string[], etapes:string[]}>}}
   *   etapes : celles qui gardent leur point ; groupes : les commandes qui en font un à elles, avec toutes leurs étapes.
   */
  function regrouperTrous(trous, cheminDe) {
    const parClasse = new Map();
    trous.forEach((t, i) => { for (const c of t.classes || []) { if (!parClasse.has(c)) parClasse.set(c, []); parClasse.get(c).push(i); } });
    // Un groupe : les commandes d'un même chemin, sans équipe aux mêmes étapes.
    const groupes = new Map();
    for (const [c, rangs] of parClasse) {
      const chemin = (typeof cheminDe === 'function' && cheminDe(c)) || null;
      const cle = (chemin ? 'chemin ' + chemin.id : 'commande ' + c) + ' | ' + rangs.join(',');
      if (!groupes.has(cle)) groupes.set(cle, { chemin, classes: [], rangs });
      groupes.get(cle).classes.push(c);
    }
    const liste = [...groupes.values()];
    const voisins = trous.map((_, i) => liste.map((g, k) => (g.rangs.includes(i) ? k : -1)).filter(k => k >= 0));
    const { tenu, libres } = apparier(voisins, liste.length);
    // Depuis les étapes restées sans groupe : leurs groupes sont en cause, et les étapes qui tenaient ces groupes suivent.
    const sansPoint = new Set(libres), enCause = new Set(), file = libres.slice();
    while (file.length) {
      const i = file.pop();
      for (const g of voisins[i]) {
        if (tenu[g] === i || enCause.has(g)) continue;
        enCause.add(g);
        if (tenu[g] >= 0 && !sansPoint.has(tenu[g])) { sansPoint.add(tenu[g]); file.push(tenu[g]); }
      }
    }
    return { etapes: new Set(trous.filter((_, i) => !sansPoint.has(i)).map(t => t.service)),
      groupes: liste.filter((_, k) => enCause.has(k)).map(g => ({ chemin: g.chemin, classes: g.classes, etapes: g.rangs.map(i => trous[i].service) })) };
  }

  /** Le point d'un groupe : « <commande> n'a pas d'équipe à n étapes du chemin <nom> », et ce qu'il y a à faire. */
  function pointDuGroupe(g, s) {
    const lib = typeof s.libelle === 'function' ? s.libelle : (c => c), nomDe = typeof s.nomService === 'function' ? s.nomService : (x => x);
    const un = g.classes.length === 1, defaut = g.classes.every(c => (s.cheminDe(c) || {}).defaut);
    const faire = defaut
      ? (un ? 'Elle suit ce chemin par défaut, celui de sa classe : si ce n’est pas le sien, donnez-lui un autre chemin ; sinon, choisissez son équipe à chaque étape.'
        : 'Elles suivent ce chemin par défaut, celui de leur classe : si ce n’est pas le leur, donnez-leur un autre chemin ; sinon, choisissez leur équipe à chaque étape.')
      : (un ? 'Choisissez son équipe à chaque étape, ou donnez-lui un autre chemin.' : 'Choisissez leur équipe à chaque étape, ou donnez-leur un autre chemin.');
    return { niveau: niveauDuCode('parcours-trou'),
      titre: nommer(g.classes.map(lib)) + (un ? ' n’a' : ' n’ont') + ' pas d’équipe à ' + g.etapes.length + ' étapes du chemin « ' + (g.chemin ? g.chemin.nom : '') + ' »',
      detail: 'Étapes sans équipe : ' + nommer(g.etapes.map(nomDe), ETAPES_NOMMEES) + '. ' + faire,
      page: 'mu-flux', aussi: ['mu-pas'], code: 'parcours-trou', classes: g.classes.slice(), etapes: g.etapes.slice(), chemin: g.chemin ? g.chemin.id : undefined, groupe: true };
  }
  /** Les étapes qu'un point regroupé nomme, avant « et n autres ». */
  const ETAPES_NOMMEES = 6;

  /** Le point bloquant « chaque commande a quelqu'un pour la préparer », qui nomme ce qui manque (correction 23 c). */
  function direAbsentes(ab) {
    const c = ab.commandes || [], par = (ab.parService || []).filter(x => (x.compagnies || []).length);
    const phrases = c.length ? [nommer(c) + (c.length > 1 ? ' ne sont préparées' : ' n’est préparée') + ' par aucune équipe.'] : [];
    for (const x of par) phrases.push(nommer(x.compagnies) + (x.compagnies.length > 1 ? ' n’ont' : ' n’a') + ' personne à « ' + x.nom + ' ».');
    const n = c.length + par.reduce((k, x) => k + x.compagnies.length, 0);
    return phrases.concat(n > 1 ? 'Cochez-les dans l’équipe qui les prépare.' : 'Cochez-la dans l’équipe qui la prépare.').join(' ');
  }

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
   *   clientsEnPartie : le nombre de clients d'un fournisseur réglés en partie (évolution 24 a) ;
   *   enClair   : le texte d'une anomalie, avec les mots de la page (facultatif).
   *   Correction 23 (c), facultatifs — sans eux, le registre d'avant :
   *   cheminDe(classe) : le chemin que suit une commande ({id, nom, defaut}) — les étapes sans équipe se regroupent ;
   *   libelle(classe), nomService(id) : de quoi nommer une commande et un service ;
   *   une étape `commandes` peut porter `absentes` ({commandes:[noms], parService:[{nom, compagnies}]}) : son point les nomme.
   *   Une anomalie marquée `fournisseur` parle d'un lien de fournisseur : elle se règle dans « Chemins › Fournisseurs ».
   *   Évolution 26, facultatif — sans lui, le registre d'avant :
   *   points : des points déjà formés ({niveau, titre, detail?, page, cle, gestes:[{action, texte, valeur?, choix?}]}), la
   *   liste des compagnies et ce que l'import n'a pas rattaché ; ils viennent en tête de leur niveau. Un geste se fait
   *   dans « Contrôles » même (`action`) ; `choix` : une liste où choisir sa valeur.
   * @returns {Array<{niveau:string, titre:string, detail:string, page:string, aussi:string[], service?:string, voulu?:string,
   *   code?:string, equipe?:string, classes?:string[], etape?:string, services?:string[], fantome?:string, lien?:boolean}>}
   *   page : où il se règle ; aussi : les pages qui le montrent aussi (et le comptent) ; voulu : la compagnie d'un
   *   avis « aucun handling ne charge cette compagnie », qui propose de dire que c'est voulu (évolution 21 e).
   *   Évolution 22 (d) : de quoi mener à l'endroit précis — le code du point, son équipe, ses commandes ; l'étape et ses
   *   services à compléter ; le service supprimé ; un avis des liens entre services.
   *   Évolution 24 (a) : `fournisseur` — l'avis parle d'un lien de fournisseur, il mène au tableau « Qui se fournit où ».
   *   Correction 23 (c) : `groupe` — des commandes sans équipe à plusieurs `etapes` de leur `chemin` ; `nomsServices` — les
   *   noms des `services` d'une étape (un bouton par service) ; `vu` — le service où se lit ce que la journée montre.
   */
  function lister(s = {}) {
    const clair = typeof s.enClair === 'function' ? s.enClair : (t => t);
    const out = [];
    // Les points de la liste des compagnies (évolution 26) : en tête de leur niveau.
    for (const p of s.points || []) if (p && p.titre && NIVEAUX.some(n => n.id === p.niveau))
      out.push({ detail: '', page: 'mu-pas', aussi: p.niveau === 'information' ? [] : ['mu-pas'], ...p, gestes: (p.gestes || []).slice() });
    // Un service supprimé que des équipes ou des chemins citent encore : l'étape est sautée.
    for (const f of s.fantomes || []) {
      const cite = [f.cases ? pl(f.cases, 'équipe') : '', f.chemins ? pl(f.chemins, 'chemin') : ''].filter(Boolean).join(' et ');
      out.push({ niveau: 'corriger', titre: '« ' + f.nom + ' » n’existe plus dans l’unité',
        detail: (cite ? cite + ' le citent encore. ' : '') + 'Effacez-le partout, ou faites passer son travail dans un autre service.',
        page: 'mu-services', aussi: ['mu-pas'], fantome: f.id });
    }
    // Ce que le calcul dit : son code donne le niveau. Ce que la journée montre se lit dans les résultats.
    // Les étapes sans équipe se regroupent quand on sait nommer le chemin d'une commande (correction 23 c) ; un
    // fournisseur sans équipe garde son point : ses liens se règlent pour toute l'unité.
    const trous = typeof s.cheminDe === 'function' ? (s.anomalies || []).filter(a => a.code === 'parcours-trou' && !a.fournisseur && a.service && Array.isArray(a.classes)) : [];
    const regroupes = trous.length ? regrouperTrous(trous, s.cheminDe) : null;
    for (const a of s.anomalies || []) {
      const resultat = JOURNEE.includes(a.code);
      // Un groupe vient à la place de sa première étape ; une étape dont toutes les commandes sont dans un groupe n'a plus de point.
      const groupes = regroupes && trous.includes(a) ? regroupes.groupes.filter(g => g.etapes[0] === a.service).map(g => pointDuGroupe(g, s)) : [];
      if (regroupes && trous.includes(a) && !regroupes.etapes.has(a.service)) { out.push(...groupes); continue; }
      out.push({ niveau: niveauDuCode(a.code), titre: clair(a.message || a.code || ''), detail: '',
        // Une étape du chemin que personne ne prépare se règle dans « Chemins » (le tableau de l'étape) ; ce qui touche
        // un service ou une équipe, dans « Services et équipes » ; le reste, dans « Chemins ».
        page: resultat ? 'j-chiffres' : a.code === 'parcours-trou' || !a.service ? 'mu-flux' : 'mu-services', aussi: resultat ? [] : ['mu-pas'],
        service: !resultat && a.service ? a.service : undefined,
        ...(resultat ? {} : { code: a.code, ...(a.atelier ? { equipe: a.atelier } : {}), ...(Array.isArray(a.classes) && a.classes.length ? { classes: a.classes.slice() } : {}) }),
        // Une compagnie qu'aucun handling ne charge (évolution 21 e) : l'avis propose de dire que c'est voulu.
        ...(a.code === 'handling-sans' && a.compagnie ? { voulu: String(a.compagnie) } : {}),
        // Un fournisseur sans équipe sur le chemin de ses clients (évolution 24 a) : ses liens se règlent pour toute l'unité.
        ...(!resultat && a.fournisseur ? { fournisseur: true } : {}),
        // Ce que la journée montre dans un service : la Synthèse s'ouvre sur sa ligne (correction 23 c).
        ...(resultat && a.service ? { vu: a.service } : {}) });
      out.push(...groupes);
    }
    // Les liens de l'unité : ce qui est grave est « à corriger » ; un service en bout de chaîne ne demande rien.
    // (Une boucle qui arrête le calcul, c'est le calcul qui la dit : bloquant.) Ils se règlent dans « Liens entre services ».
    for (const a of s.liens || [])
      out.push({ niveau: a.grave ? 'corriger' : 'information', titre: a.texte, detail: '', page: 'u-liens', aussi: ['mu-pas'], lien: true });
    // Les étapes à faire.
    for (const e of s.etapes || []) {
      const noms = (e.services || []).map(x => x.nom);
      // Une étape qui se lit sans rien demander (les vols d'exemple, évolution 22 d) : une information.
      // Le point bloquant nomme les commandes et les compagnies que personne ne prépare (correction 23 c).
      const nomme = e.id === 'commandes' && e.absentes ? direAbsentes(e.absentes) : '';
      out.push({ niveau: e.information ? 'information' : ETAPES_BLOQUANTES.has(e.id) ? 'bloquant' : 'corriger', titre: e.titre,
        detail: nomme || (noms.length ? (noms.length > 4 ? noms.slice(0, 4).join(', ') + ' et ' + pl(noms.length - 4, 'autre') : noms.join(', ')) + ' : à corriger.' : (e.texte || '')),
        page: e.page || 'mu-pas', aussi: ['mu-pas'], etape: e.id,
        ...(e.services && e.services.length ? { services: e.services.map(x => x.id), nomsServices: noms } : {}) });
    }
    // « Vos services et leurs équipes » ne se répète pas : quand un autre point à régler cite déjà chacun de ses
    // services (son étape, son équipe, le point bloquant, un groupe de commandes), il ne s'affiche pas (correction 23 c).
    const cites = new Set(out.filter(p => p.etape !== 'services' && estProbleme(p)).flatMap(p => [p.service].concat(p.services || [], p.etapes || [])).filter(x => x != null));
    const repete = p => p.etape === 'services' && (p.services || []).length > 0 && p.services.every(x => x != null && cites.has(x));
    for (let i = out.length - 1; i >= 0; i--) if (repete(out[i])) out.splice(i, 1);
    // Les clients d'un fournisseur réglés en partie (évolution 24 a) : une sauvegarde d'avant les porte tels qu'ils
    // étaient dessinés, chemin par chemin. Rien n'est demandé, et rien ne bouge tant qu'on ne choisit pas.
    const partiels = Number.isInteger(s.clientsEnPartie) && s.clientsEnPartie > 0 ? s.clientsEnPartie : 0;
    if (partiels) out.push({ niveau: 'information', titre: pl(partiels, 'client réglé', 'clients réglés') + ' en partie',
      detail: (partiels > 1 ? 'Ils se fournissent' : 'Il se fournit') + ' chez un fournisseur dans une partie seulement des chemins où '
        + (partiels > 1 ? 'ils passent' : 'il passe') + '. Choisissez « Partout » ou « Nulle part » ; d’ici là, aucun lien ne bouge.',
      page: 'mu-flux', aussi: [], fournisseur: true });
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

  const api = { NIVEAUX, JOURNEE, INFORMATIONS, A_CORRIGER, FACULTATIF, VOULU, niveauDuCode, dire, nommer, regrouperTrous, lister, estProbleme, pages, compte, parNiveau, resume, ton, blocs, facultatif, marquerFacultatifs, Registre };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAvis = api;
})(typeof window !== 'undefined' ? window : globalThis);
