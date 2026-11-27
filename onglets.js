/* Le menu : l'accueil, puis deux blocs, quatorze entrées, toutes visibles (évolution 22 a ; « une chose se règle à un
 * seul endroit » ; évolution 26 f : « Régler » dans l'ordre du travail).
 *
 *   Accueil   le guide, dans l'ordre du travail
 *   Lire      Synthèse, En direct, Planning, Période, Détails, Comparer
 *   Régler    Commandes, Services et équipes, Chemins, Programme des vols, Planche retour, Réglages, Contrôles
 *   en bas    Fichiers
 *
 * « Régler » n'a pas de sous-groupes : ses quatre espaces (`PARTIES`) n'ont ni titre ni écart au menu ; ils restent des
 * espaces pour le reste (la dernière page ouverte de chacun, le fil d'Ariane, le nom d'une partie d'avant).
 *
 * Plus de partie à ouvrir, plus de mention « Plus » : une entrée est une page,
 * ou un groupe de pages (`GROUPES`) qui se suivent en onglets internes, en tête
 * de page. Les pages gardent leurs identifiants, et leurs anciens noms se
 * cherchent toujours (« Aller à… »). Une page qu'une autre a reprise
 * (`ANCIENNES`, évolution 22 b) n'existe plus : son nom, son identifiant et
 * ses liens mènent à la page qui l'a reprise, au bon endroit dedans.
 *
 * Une page EST un sous-onglet d'une vue : les éléments d'une vue portent
 * `data-sous="<page>"` (ou plusieurs, séparés par des espaces), et une règle
 * de style masque ceux qui n'appartiennent pas à la page ouverte. Un élément
 * sans `data-sous` reste visible dans toutes les pages de sa vue. Les espaces
 * (`PARTIES`) ne déplacent rien : ils regroupent des pages de vues différentes.
 * La dernière page ouverte de chaque espace et de chaque groupe est retenue
 * d'une visite à l'autre, sauf une page de passage (`passage: true`) : le plan
 * de l'unité, qu'on ouvre pour le modifier et qu'on quitte par « Terminer »
 * (refonte, étape 5).
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
      // Évolution 26 (f) : son entrée au menu porte son nom ; « Retours », le nom court d'avant, se cherche toujours.
      { id: 'v-planche', nom: 'Planche retour', ancien: 'Retours', ico: 'camion' },
      // Évolution 15 (c) : un onglet de « Détails » ; son ancien nom se cherche toujours (« Aller à… »).
      { id: 'v-departs', nom: 'Vols', ancien: 'Vols prêts au départ', ico: 'depart' }
    ],
    ateliers: [
      // Évolution 22 (d) : « Contrôles » réunit « Prêt à simuler ? » (c'était le nom de cette page), « Contrôles détaillés »
      // et le panneau « Problèmes » (voir ANCIENNES).
      { id: 'mu-pas', nom: 'Contrôles', ico: 'alerte' },
      // Évolution 19 (a) : un seul mot par chose — « chemin », « temps par vol ». Les anciens noms se cherchent toujours (« Aller à… »).
      // Évolution 22 (c) : « Chemins » réunit cinq pages ; « Chemins de production » en était le nom (voir ANCIENNES).
      { id: 'mu-flux', nom: 'Chemins', ancien: 'Flux de production', ico: 'reseau' },
      { id: 'mu-services', nom: 'Services et équipes', ico: 'service' },
      { id: 'at-planning', nom: 'Planning des équipes', ico: 'journee' },
      { id: 'at-repas', nom: 'Commandes', ancien: 'Heure de chaque commande', ico: 'plateau' },
      // Évolution 26 (c) : les compagnies et leurs commandes, la première page de « Régler ».
      { id: 'mu-commandes', nom: 'Commandes', ico: 'plateau' }
    ],
    reglages: [
      { id: 'rg-simulation', nom: 'Réglages de la simulation', ico: 'sablier' }
    ],
    // Arriver « sur le plan » (un lien, « voir sur le plan »), c'est arriver
    // sur la carte ; le menu, lui, ouvre les Résultats par leur synthèse.
    plan: [
      // Évolution 16 (g) : « En direct » remplace « Le plan rejoué » ; son ancien nom se cherche toujours (« Aller à… »).
      { id: 'j-plan', nom: 'En direct', ancien: 'Le plan rejoué', ico: 'unite' },
      { id: 'j-chiffres', nom: 'Synthèse', ico: 'check' },
      // Seulement avec un programme de vols daté (banc d'essai, évolution 10).
      { id: 'j-periode', nom: 'Période', ico: 'journee', si: 'periode' },
      { id: 'j-stocks', nom: 'Stocks et retours', ico: 'boite' },
      // Le détail derrière la Synthèse (évolution 15 b) : les heures sup et les renforts, équipe par équipe.
      { id: 'j-details', nom: 'Heures sup et renforts', ancien: 'Détails', ico: 'sablier' },
      { id: 'j-comparer', nom: 'Comparer deux essais', ico: 'lecture' },
      // La même toile, pour la modifier : une page de passage, jamais retenue. Hors du menu depuis l'évolution 23 (a).
      { id: 'u-plan', nom: 'Plan de l’unité', ico: 'unite', passage: true }
    ],
    flux: [
      { id: 'u-liens', nom: 'Liens entre services', ico: 'fleche' },
      // Évolution 22 (e) : « Fichiers » — la sauvegarde, les limites et tous les classeurs ; son ancien nom se cherche toujours.
      { id: 'u-sauvegarde', nom: 'Fichiers', ancien: 'Sauvegarde et limites', ico: 'boite' }
    ]
  };

  /* Les deux blocs du menu (évolution 22 a) : ce qu'on lit, ce qu'on règle. */
  const BLOCS = [
    { id: 'lire', nom: 'Lire' },
    { id: 'regler', nom: 'Régler' }
  ];

  /* Les espaces du menu, dans son ordre : celui du bloc « Lire », les quatre du
   * bloc « Régler » (Commandes, L'unité, Vols, Simulation : l'ordre du travail,
   * évolution 26 f), puis « Fichiers », en bas (`bas`, hors du guide de
   * l'accueil : `cache`). `intro` : une phrase, pas un paragraphe. `court` : le nom de
   * l'entrée au menu, quand il est plus court que celui de la page ; `ico` :
   * son pictogramme au menu, quand deux entrées porteraient le même ;
   * `ancien` : le nom de la partie d'avant, qui se cherche toujours.
   * `groupe` : la page est un onglet interne de cette entrée (`GROUPES`). */
  const PARTIES = [
    { id: 'resultats', nom: 'Lire', ancien: 'Résultats', bloc: 'lire', ico: 'journee', couleur: 'var(--c-journee)',
      resume: 'Ce que la journée donne',
      pages: [
        { id: 'j-chiffres', intro: 'Combien de personnes il faut, où ça coince, quand chaque service finit, ce qui part en retard, ce que change un essai.' },
        // « En direct » vient juste après la Synthèse (évolution 16 g).
        { id: 'j-plan', intro: 'La journée en direct : qui travaille, qui attend, ce qui circule, où ça coince.' },
        // Le planning occupe sa page (correction 18 b) : sa phrase n'est pas affichée (`sansIntro`).
        { id: 'at-planning', court: 'Planning', sansIntro: true, intro: 'Qui travaille quand : toute l’unité sur un écran, une ligne par service, de l’amont vers l’aval ; un clic déplie ses équipes ; un jour à la fois, trois zooms, l’axe des heures toujours visible.' },
        { id: 'j-periode', intro: 'La période jour après jour : les personnes, le besoin exact, les heures sup et les retards de chaque service.' },
        // « Détails » (évolution 15 c) : quatre pages en onglets internes, une seule entrée au menu (GROUPES).
        { id: 'at-repas', groupe: 'details', intro: 'Chaque commande : les exceptions d’abord ; celles qui sont à l’heure se déplient.' },
        { id: 'v-departs', groupe: 'details', intro: 'Chaque vol : les exceptions d’abord ; ceux qui sont chargés à l’heure se déplient.' },
        { id: 'j-stocks', groupe: 'details', intro: 'Ce qui attend entre deux services, et les retours des vols à la plonge.' },
        { id: 'j-details', groupe: 'details', intro: 'Les heures supplémentaires et les renforts, équipe par équipe.' },
        { id: 'j-comparer', court: 'Comparer', intro: 'Retenez deux essais et voyez ce qui a bougé.' }
      ] },
    // « Régler », dans l'ordre du travail (évolution 26 f) : les compagnies et leurs commandes, les services et leurs équipes,
    // les chemins, puis les vols, les réglages et les contrôles. Ses espaces n'ont plus de titre au menu (`titre: false`,
    // évolution 26 c), ni d'écart entre eux (menu.css) : une seule liste, sans sous-groupes.
    // « Commandes » (évolution 26 c) : la première entrée de « Régler » — les compagnies d'abord.
    { id: 'commandes', nom: 'Commandes', bloc: 'regler', ico: 'plateau', couleur: 'var(--c-equipes)', titre: false,
      resume: 'Vos compagnies et leurs classes',
      pages: [
        { id: 'mu-commandes', intro: 'Les commandes de l’unité, par compagnie : ajoutez une compagnie, réglez-la d’un clic.' }
      ] },
    { id: 'organisation', nom: 'L’unité', ancien: 'Équipes Chemins', bloc: 'regler', ico: 'equipe', couleur: 'var(--c-equipes)', titre: false,
      resume: 'Qui prépare quoi, quand, par où',
      pages: [
        // « Services et équipes » : six pages en une (évolution 22 b) — une liste à gauche, une fiche à droite.
        { id: 'mu-services', intro: 'Chaque service : ce qu’il fait, ses équipes, ce que chacune prépare, ses temps par vol.' },
        // « Chemins » : cinq pages en une (évolution 22 c) — la liste des chemins à gauche, le chemin choisi à droite.
        { id: 'mu-flux', intro: 'Chaque chemin : ses étapes, les commandes qui le suivent, et l’équipe de chacune à chaque étape.' },
        // Évolution 19 (b) : ces liens ne servent qu'aux commandes sans chemin. La page n'est jamais au menu (`sous` : elle
        // s'ouvre depuis « Chemins », qui reste marquée) ; « Aller à… » et ses liens y mènent toujours.
        { id: 'u-liens', sous: 'mu-flux', intro: 'Qui livre qui dans l’unité : ces liens ne servent qu’aux commandes sans chemin.' },
        // Évolution 23 (a) : le plan de l'unité ne sert pas au calcul. Sa page n'est plus au menu (`sous`) : elle s'ouvre
        // par « Aller à… » et par le lien « Placer ce service sur le plan » de la fiche d'un service, qui reste marquée.
        { id: 'u-plan', sous: 'mu-services', court: 'Plan', ico: 'grille', intro: 'La place et la forme de chaque service sur le plan : choisissez une zone, déplacez-la, redimensionnez-la ; « Terminer » ramène où vous étiez.' }
      ] },
    { id: 'donnees', nom: 'Vols', bloc: 'regler', ico: 'avion', couleur: 'var(--c-vols)', titre: false,
      resume: 'Ce qui part et ce qui revient',
      pages: [
        // `jour` (évolution 23 b) : hors du bloc « Lire », une page où le jour d'un programme daté compte — elle porte
        // la barre « Journée de vols ». Évolution 26 (f) : les entrées portent le nom de leur page (« Programme des vols »,
        // « Planche retour ») ; les noms courts d'avant se cherchent toujours (« Aller à… »).
        { id: 'v-programme', jour: true, intro: 'Les vols de la journée : importez les vôtres, le tableau les montre par heure de départ.' },
        { id: 'v-planche', jour: true, intro: 'La planche retour du handling : quand chaque vol revient à l’unité, pour la plonge.' }
      ] },
    { id: 'reglages', nom: 'Simulation', bloc: 'regler', ico: 'sablier', couleur: 'var(--c-temps)', titre: false,
      resume: 'Régler, vérifier',
      pages: [
        // « Réglages » : une liste de sections à gauche, la section choisie à droite (évolution 23 e, reglages-page.js).
        { id: 'rg-simulation', court: 'Réglages', ico: 'curseurs', intro: 'Les réglages de la simulation, une section à la fois : choisissez-la à gauche.' },
        // « Contrôles » : deux pages et un panneau en un (évolution 22 d) — l'état du calcul, puis les avis par niveau.
        // `lisible` (évolution 23 d) : la page se lit ; la lecture seule, qui ferme les autres pages de « Régler », la
        // laisse ouverte, et son entrée passe sous « Lire ».
        { id: 'mu-pas', jour: true, lisible: true, intro: 'Ce qui bloque le calcul, ce qui est à corriger et ce qui se lit : chaque point mène là où il se règle.' }
      ] },
    { id: 'fichier', nom: 'Fichiers', ancien: 'Sauvegarde', ico: 'boite', couleur: 'var(--c-unite)', cache: true, bas: true,
      resume: 'Votre travail dans un fichier',
      pages: [
        { id: 'u-sauvegarde', court: 'Fichiers', intro: 'Tout sauvegarder ou restaurer un fichier ; et, classeur par classeur : importer, exporter, classeur vide à remplir.' }
      ] }
  ];
  const CLE = 'ory-menu-pages';
  /**
   * Les groupes de pages (évolution 15 c) : une seule entrée au menu, ses pages en onglets internes, en tête de page.
   * « Détails » : les commandes, les vols, les stocks et les heures sup, derrière la Synthèse. « Chemins » et
   * « Contrôles » (évolution 22 a) rassemblent les pages d'aujourd'hui que les parties suivantes fusionnent.
   */
  const GROUPES = {
    details: { nom: 'Détails', ico: 'info' }
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /**
   * Les pages qu'une autre a reprises (évolution 22 b : « Services et équipes » en reprend cinq). Elles n'existent plus,
   * mais rien ne casse : leur nom (`nom`, et `ancien`, le nom d'encore avant) se cherche toujours par « Aller à… », et
   * leur identifiant — un lien `data-page`, un avis, un renvoi d'une autre page — mène à la page qui les a reprises
   * (`vers`), au bon endroit dedans (`lieu`, que la page comprend : sa liste, la section de ses équipes, celle de ses temps).
   */
  const ANCIENNES = {
    'at-recap': { vers: 'mu-services', lieu: 'equipes', nom: 'Horaires des équipes' },
    'at-equipes': { vers: 'mu-services', lieu: 'equipes', nom: 'Équipes une par une', ancien: 'Les cases · Ateliers de travail' },
    // Correction 23 (g) : le tableau de tous les temps par vol est revenu — son entrée, dans « Services et équipes ».
    'rg-recap': { vers: 'mu-services', lieu: 'tous', nom: 'Temps par vol', ancien: 'Heures de travail' },
    'rg-minutes': { vers: 'mu-services', lieu: 'temps', nom: 'Temps par vol par service', ancien: 'Barème par service' },
    'u-services': { vers: 'mu-services', lieu: 'liste', nom: 'Liste des services' },
    // Évolution 22 (c) : « Chemins » en reprend trois, et garde l'ancien nom de la sienne (une clé qui n'est pas une page).
    'mu-carte': { vers: 'mu-flux', lieu: 'liste', nom: 'Vue d’ensemble' },
    'mu-flux:avant': { vers: 'mu-flux', lieu: 'liste', nom: 'Chemins de production' },
    'at-chemins': { vers: 'mu-flux', lieu: 'etapes', nom: 'Chemin d’une commande' },
    'at-grille': { vers: 'mu-flux', lieu: 'etapes', nom: 'Étapes de chaque commande' },
    // Évolution 22 (d) : « Contrôles » reprend « Contrôles détaillés », le panneau « Problèmes », et garde l'ancien nom
    // de sa page (deux clés qui ne sont pas des pages).
    'mu-pas:avant': { vers: 'mu-pas', nom: 'Prêt à simuler ?' },
    'u-lecture': { vers: 'mu-pas', nom: 'Contrôles détaillés' },
    'mu-pas:problemes': { vers: 'mu-pas', nom: 'Problèmes' }
  };
  /**
   * Ce qui ne s'ouvre que par son nom (évolution 23 a) : ni une page, ni une entrée du menu, ni une page d'avant — une
   * vue d'une page (`vers`), que « Aller à… » trouve, et que la page comprend (`lieu`). « En direct » s'ouvre toujours
   * en relief ; sa vue à plat, sur le plan dessiné de l'unité, ne s'ouvre plus que d'ici.
   */
  const PAR_NOM = {
    'j-plan:plat': { vers: 'j-plan', lieu: 'plat', nom: 'En direct, à plat', ancien: 'À plat · Le plan dessiné · Le plan rejoué' }
  };
  /** La page qui s'ouvre pour cet identifiant : elle-même, ou celle qui l'a reprise, ou celle dont c'est une vue. */
  const resoudre = id => { const a = ANCIENNES[id] || PAR_NOM[id]; return a ? a.vers : id; };

  function defaut(vue) { return ((ONGLETS[vue] || [])[0] || {}).id || null; }
  /* L'identifiant d'une page d'avant (`ANCIENNES`) vaut celui de la page qui l'a reprise : sa vue, son espace, son nom. */
  function vueDe(id) { id = resoudre(id); return Object.keys(ONGLETS).find(v => ONGLETS[v].some(o => o.id === id)) || null; }
  /** La partie qui contient une page. */
  function partieDe(id) { id = resoudre(id); return PARTIES.find(p => p.pages.some(x => x.id === id)) || null; }
  /** Une page, avec son nom, son pictogramme, sa vue et sa partie. */
  function page(id) {
    id = resoudre(id);
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
  /**
   * La page est-elle au menu ? Une page `menuSi` (évolution 19 b) n'y est que si sa condition est vraie, ou tant qu'elle
   * est la page ouverte (`ouverte`) ; hors du menu, elle se montre toujours : « Aller à… » et ses liens y mènent.
   */
  const auMenu = (id, ouverte) => { const o = page(id); return montree(id) && !o.sous && (!o.menuSi || id === ouverte || !!(conditions[o.menuSi] && conditions[o.menuSi]())); };
  /** Les pages d'un groupe qui se montrent, dans l'ordre du menu. */
  const pagesDuGroupe = g => PARTIES.flatMap(p => pagesDe(p.id)).filter(x => x.groupe === g);
  /**
   * Les entrées du menu d'un espace : ses pages, un groupe une seule fois (à la place de sa première page), avec son
   * nom et son pictogramme ; `cible` : la page qu'il ouvre (la dernière ouverte du groupe, sinon la première).
   * `ouverte` : la page ouverte — une page hors du menu y figure tant qu'on y est.
   */
  function menuDe(partie, choix = {}, ouverte) {
    const vus = new Set(), out = [];
    for (const o of pagesDe(partie).filter(x => auMenu(x.id, ouverte))) {
      if (!o.groupe) { out.push(o); continue; }
      if (vus.has(o.groupe)) continue;
      vus.add(o.groupe);
      const pages = pagesDuGroupe(o.groupe).filter(x => auMenu(x.id, ouverte)), c = choix['groupe:' + o.groupe];
      out.push({ ...GROUPES[o.groupe], groupe: o.groupe, id: pages.some(x => x.id === c) ? c : o.id, pages: pages.map(x => x.id) });
    }
    return out;
  }
  /**
   * La barre « Journée de vols » d'un programme daté s'affiche-t-elle sur cette page (évolution 23 b) ? Sur les pages du
   * bloc « Lire », où l'on lit la journée d'un jour, et sur celles qui le demandent (`jour`) ; pas là où l'on règle
   * l'unité ou la simulation, ni dans « Fichiers ».
   */
  const avecJour = id => { const o = page(id), p = o && PARTIES.find(x => x.id === o.partie); return !!o && (p.bloc === 'lire' || !!o.jour); };
  /** Les pages qui portent la barre du jour, dans l'ordre du menu. */
  const pagesDuJour = () => PARTIES.flatMap(p => p.pages.map(x => x.id)).filter(avecJour);
  /** Le nom d'une entrée au menu : son nom court, sinon celui de sa page ou de son groupe. */
  const libelle = o => o.court || o.nom;
  /**
   * Le menu entier (évolution 22 a) : ses deux blocs, leurs espaces et leurs entrées, puis les entrées du bas.
   * Un espace qui porte le nom de son bloc (« Lire ») n'a pas de titre à lui (`titre: false`).
   * `ferme` (évolution 23 d), facultatif : dit les pages qui ne s'ouvrent pas (la lecture seule). Sans lui, ou s'il ne
   * ferme rien, le menu est celui d'avant.
   * @returns {{blocs: {id, nom, espaces: {id, nom, titre, entrees: object[]}[]}[], bas: object[]}}
   */
  function menu(choix = {}, ouverte, ferme) {
    const blocs = BLOCS.map(b => ({ ...b, espaces: PARTIES.filter(p => p.bloc === b.id)
      .map(p => ({ id: p.id, nom: p.nom, titre: p.nom !== b.nom && p.titre !== false, entrees: menuDe(p.id, choix, ouverte) })) }));
    return { blocs: typeof ferme === 'function' ? sousLire(blocs, ferme) : blocs, bas: PARTIES.filter(p => p.bas).flatMap(p => menuDe(p.id, choix, ouverte)) };
  }
  /**
   * Quand des pages sont fermées (évolution 23 d) : dans un bloc qui en compte, une entrée qui s'ouvre encore
   * (« Contrôles », qui se lit) passe à la suite du premier bloc (« Lire ») ; son bloc ne garde que ses entrées fermées,
   * et se replie. Un bloc ouvert en entier, ou fermé en entier, ne change pas ; le premier bloc ne donne rien.
   * Rien n'est modifié en place.
   */
  function sousLire(blocs, ferme) {
    const lues = [];
    const suite = blocs.slice(1).map(b => {
      const toutes = b.espaces.flatMap(e => e.entrees), fermees = toutes.filter(o => ferme(o.id));
      if (!fermees.length || fermees.length === toutes.length) return b;
      lues.push(...toutes.filter(o => !fermees.includes(o)));
      return { ...b, espaces: b.espaces.map(e => ({ ...e, entrees: e.entrees.filter(o => fermees.includes(o)) })) };
    });
    if (!lues.length) return blocs;
    const premier = blocs[0], dernier = premier.espaces.length - 1;
    return [{ ...premier, espaces: premier.espaces.map((e, i) => (i === dernier ? { ...e, entrees: [...e.entrees, ...lues] } : e)) }, ...suite];
  }
  /** Les entrées du menu à la suite, dans son ordre : celles des blocs, puis celles du bas. */
  function entrees(choix = {}, ouverte) {
    const m = menu(choix, ouverte);
    return [...m.blocs.flatMap(b => b.espaces.flatMap(e => e.entrees)), ...m.bas];
  }
  /** L'entrée du menu qui mène à une page : elle-même, ou son groupe. */
  const entreeDe = (id, choix = {}) => { id = resoudre(id); const o = page(id), cible = o && o.sous ? o.sous : id;
    return o ? entrees(choix, id).find(x => o.groupe ? x.groupe === o.groupe : x.id === cible) || null : null; };

  /* Une règle par onglet : dans l'onglet X, tout élément découpé qui n'est
   * pas de X disparaît. Les éléments des autres vues sont déjà masqués. */
  function regles() {
    return Object.values(ONGLETS).flat().map(o =>
      `body[data-sous="${o.id}"] [data-sous]:not([data-sous~="${o.id}"]){display:none!important}`).join('\n');
  }

  class SousOnglets {
    /* a = {
     *   hote()        — la barre où dessiner le menu
     *   interne()     — facultatif : la barre des onglets internes d'un groupe, en tête de page
     *   vue()         — la vue affichée ('accueil' : aucune page)
     *   badge(cle)    — facultatif : { n, ton, titre } à afficher sur une entrée (son identifiant de page, ou
     *                   « groupe:<groupe> »), ou rien
     *   verrou()      — facultatif : vrai tant que le menu attend (le plan en modification) : ses entrées sont grisées
     *   ferme(id)     — facultatif : vrai pour une page qui ne s'ouvre pas (la lecture seule ferme celles du bloc
     *                   « Régler », évolution 22 f) ; un bloc dont toutes les entrées sont fermées se replie en une
     *                   ligne (`motFerme`, « Paramétrage verrouillé »)
     *   refus(id)     — facultatif : appelé quand on demande une page fermée, pour le dire
     *   change(vue,id)— facultatif : appelé quand la page change (la vue suit)
     *   lieu(id,lieu) — facultatif : appelé une fois la page `id` ouverte, quand on y arrive pour un endroit précis
     *                   (celui d'une page d'avant, `ANCIENNES`, ou celui qu'un lien demande)
     *   apres(id)     — facultatif : appelé une fois la page ouverte et dessinée
     *   accueil       — facultatif : le nom de l'entrée de l'accueil, en tête du menu, au-dessus de « Lire » (évolution
     *                   26 f) ; elle porte `data-vers-partie="accueil"`, que la page écoute, et se marque sur l'accueil
     *                   (`vue()` vaut 'accueil'). Sans lui, le menu d'avant.
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
          // Au clavier (Entrée sur une entrée), le focus reste dans le menu, sur l'entrée ouverte.
          this.choisir(b.dataset.sousOnglet, root.document && document.activeElement === b ? h : undefined);
        });
        h.addEventListener('keydown', e => this.clavier(e));
      }
      const n = a.interne ? a.interne() : null;
      if (n) {
        n.addEventListener('click', e => { const b = e.target.closest('[data-sous-onglet]'); if (b) this.choisir(b.dataset.sousOnglet); });
        n.addEventListener('keydown', e => this.clavier(e, n));
      }
    }

    /** La page ne s'ouvre pas : c'est la page qui le sait (`a.ferme`, la lecture seule). */
    fermee(id) { return !!(id && this.a.ferme && this.a.ferme(resoudre(id))); }

    /** La page à ouvrir dans une partie : la dernière vue, sinon la première. */
    actifDe(partie) {
      // La dernière page ouverte de la partie, si elle est encore au menu ; sinon sa première page au menu.
      // (Une page d'avant retenue par ce navigateur vaut la page qui l'a reprise.)
      const pages = pagesDe(partie).filter(x => auMenu(x.id)), c = this.choix[partie] ? resoudre(this.choix[partie]) : null;
      return pages.some(x => x.id === c) ? c : (pages[0] || {}).id || null;
    }

    /** La page ouverte, recalée sur la vue affichée si l'on est arrivé autrement. */
    actif(vue = this.a.vue()) {
      if (this.page && vueDe(this.page) === vue) {
        if (montree(this.page) && !this.fermee(this.page)) return this.page;
        // Une page qui ne se montre plus (la période, sans programme daté) : la première de sa partie, dans la même vue.
        const p = partieDe(this.page), autre = p && pagesDe(p.id).find(x => x.vue === vue && !this.fermee(x.id));
        if (autre) return autre.id;
      }
      // Arrivé par un lien vers la vue : la dernière page choisie de cette vue.
      return this.retenue(vue);
    }

    /** La dernière page choisie d'une vue (une vue porte des pages de plusieurs espaces), si elle se montre encore ; sinon sa première. */
    retenue(vue) {
      if (!ONGLETS[vue]) return null;
      const pv = (this.parVue || {})[vue], ouvrable = id => montree(id) && !this.fermee(id);
      const deja = (pv && vueDe(pv) === vue && ouvrable(pv) ? pv : null) || Object.values(this.choix).find(id => vueDe(id) === vue && ouvrable(id));
      if (deja) return deja;
      // Une page fermée (la lecture seule) ne s'ouvre pas non plus par sa vue : sa première page qui s'ouvre.
      const premiere = defaut(vue);
      return this.fermee(premiere) ? (ONGLETS[vue].find(o => ouvrable(o.id)) || {}).id || null : premiere;
    }

    /** Ouvre une partie, sur sa dernière page. */
    ouvrir(partie) { const id = this.actifDe(partie); if (id) this.choisir(id); }

    /* Ouvre une page, de la vue affichée ou d'une autre (la vue suivra). `ouverture` : la page que l'application ouvre
     * d'elle-même à son démarrage (la Synthèse, évolution 22 a) — ce n'est pas un choix, elle n'est pas retenue.
     * `lieu` : un endroit de la page, que la page comprend (`a.lieu`). */
    choisir(id, focus, ouverture, lieu) {
      // Une page d'avant, reprise par une autre (évolution 22 b) : celle-ci s'ouvre, au bon endroit dedans.
      // De même une vue qui ne s'ouvre que par son nom (évolution 23 a) : sa page s'ouvre, et apprend laquelle on veut.
      const reprise = ANCIENNES[id] || PAR_NOM[id];
      if (reprise) return this.choisir(reprise.vers, focus, ouverture, lieu || reprise.lieu);
      const vue = vueDe(id), p = partieDe(id); if (!vue || !p || !montree(id)) return;
      // Une page fermée (la lecture seule, évolution 22 f) ne s'ouvre pas : la page le dit.
      if (this.fermee(id)) { if (this.a.refus) this.a.refus(id); return; }
      this.page = id;
      this.ouverture = !!ouverture;
      // Une page de passage n'est pas retenue : son espace et sa vue rouvrent la page d'avant. Une page qui s'ouvre
      // depuis une autre (`sous`, évolution 22 c) non plus.
      if (!ouverture && !ONGLETS[vue].find(o => o.id === id).passage && !page(id).sous) {
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
      // Un endroit de la page (`lieu`) : celui d'une page d'avant, ou celui qu'un lien demande.
      if (lieu && this.a.lieu) this.a.lieu(id, lieu);
      // Le focus reste dans la barre d'où vient le geste : le menu, ou les onglets internes d'un groupe.
      if (focus) { const h = typeof focus === 'object' ? focus : this.a.hote(), b = h?.querySelector(`[data-sous-onglet="${id}"]`); if (b) b.focus(); }
    }

    rendre() {
      const vue = this.a.vue(), actif = this.actif(vue);
      // La page ouverte ne se montre plus : celle qui la remplace s'ouvre, comme d'un clic.
      if (actif && this.page && actif !== this.page && (!montree(this.page) || this.fermee(this.page))) { this.choisir(actif); return; }
      this.page = actif;
      const p = actif ? partieDe(actif) : null;
      if (root.document) {
        if (actif) document.body.dataset.sous = actif; else delete document.body.dataset.sous;
        if (p) document.body.dataset.partie = p.id; else delete document.body.dataset.partie;
      }
      this.rendreInterne(actif);
      const h = this.a.hote(); if (!h) return;
      // Le menu entier, toujours : deux blocs, leurs espaces, leurs entrées (évolution 22 a). L'entrée « Fichiers », en
      // bas de la barre, est un bouton de la page : elle ne se dessine pas ici.
      // En lecture seule, une entrée de « Régler » qui se lit encore (« Contrôles ») passe sous « Lire » (évolution 23 d).
      const m = menu(this.choix, actif, this.a.ferme ? id => this.fermee(id) : null), dans = actif ? (page(actif) || {}).groupe : null;
      // Un bloc dont aucune entrée ne s'ouvre (« Régler », en lecture seule) se replie en une ligne.
      const plie = b => !!this.a.ferme && b.espaces.some(e => e.entrees.length) && b.espaces.every(e => e.entrees.every(o => this.fermee(o.id)));
      const toutes = m.blocs.filter(b => !plie(b)).flatMap(b => b.espaces.flatMap(e => e.entrees));
      // Une page rangée sous une autre (« Liens entre services », sous « Chemins ») n'a pas d'entrée : la sienne est marquée.
      const cible = (actif && (page(actif) || {}).sous) || actif;
      const ouverte = o => o.groupe ? o.groupe === dans : o.id === cible;
      // Une seule entrée prend le focus au clavier (les flèches mènent aux autres) : celle qui est ouverte, sinon la première.
      const prise = toutes.find(ouverte) || toutes[0];
      const I = root.OrlyIcones, verrou = !!(this.a.verrou && this.a.verrou());
      const bouton = o => {
        const on = ouverte(o), cle = o.groupe ? 'groupe:' + o.groupe : o.id, b = this.a.badge ? this.a.badge(cle) : null;
        return `<button type="button" role="tab" class="menu-entree${on ? ' actif' : ''}" data-sous-onglet="${o.id}" data-entree="${cle}"
          aria-selected="${on}" tabindex="${o === prise ? 0 : -1}"${verrou ? ' disabled' : ''}>${I ? I.ico(o.ico) : ''}<span>${esc(libelle(o))}</span>${
          b && b.n ? `<b class="so-badge ${esc(b.ton || '')}" title="${esc(b.titre || '')}">${esc(b.n)}</b>` : ''}</button>`;
      };
      const motFerme = this.a.motFerme || 'Paramétrage verrouillé';
      // L'accueil, en tête du menu (évolution 26 f) : une entrée à part, hors des onglets — elle ouvre le guide.
      const surAccueil = vue === 'accueil';
      const accueil = this.a.accueil ? `<div class="menu-bloc menu-accueil" data-bloc="accueil"><button type="button" class="menu-entree${surAccueil ? ' actif' : ''}" data-vers-partie="accueil" data-entree="accueil"${
        surAccueil ? ' aria-current="page"' : ''}${verrou ? ' disabled' : ''}>${I ? I.ico('maison') : ''}<span>${esc(this.a.accueil)}</span></button></div>` : '';
      const html = accueil + m.blocs.map(b => plie(b)
        ? `<div class="menu-bloc menu-bloc-ferme" data-bloc="${b.id}" data-ferme><p class="menu-bloc-titre" aria-hidden="true">${esc(b.nom)}</p>`
          + `<p class="menu-ferme">${I ? I.ico('cadenas') : ''}<span>${esc(motFerme)}</span></p></div>`
        : `<div class="menu-bloc" data-bloc="${b.id}"><p class="menu-bloc-titre" aria-hidden="true">${esc(b.nom)}</p>${
        b.espaces.map(e => `<div class="menu-espace" data-espace="${e.id}" role="tablist" aria-orientation="vertical" aria-label="${esc(e.titre ? b.nom + ' : ' + e.nom : b.nom)}">${
          e.titre ? `<p class="menu-espace-titre" aria-hidden="true">${esc(e.nom)}</p>` : ''}${e.entrees.map(bouton).join('')}</div>`).join('')}</div>`).join('');
      // Redessiner seulement si quelque chose a changé : sinon l'entrée qui a
      // le focus clavier le perdrait à chaque recalcul de la journée.
      const boite = h.querySelector('.so-liste') || h;
      const redessine = this.dessin !== html || (html && !boite.firstChild);
      if (redessine) { boite.innerHTML = html; this.dessin = html; }
      // Rien n'a bougé (un recalcul de la journée) : rien à mesurer. Lire les
      // tailles forcerait une mise en page au milieu du calcul (étape 10).
      if (!redessine && this.vu === actif) return;
      // Si la barre défile en hauteur (un écran très bas), l'entrée ouverte y reste visible,
      // une fois, quand elle change (on ne reprend pas la main à qui fait défiler).
      const on = boite.querySelector('.actif'), zone = on && on.closest('.barre-defile');
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
      // Une page hors du menu (« Liens entre services » quand toutes les commandes ont un chemin) n'a son onglet que tant qu'on y est.
      const g = actif ? (page(actif) || {}).groupe : null, pages = g ? pagesDuGroupe(g).filter(x => auMenu(x.id, actif)) : [];
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

  const api = { ONGLETS, BLOCS, PARTIES, GROUPES, ANCIENNES, PAR_NOM, resoudre, conditions, montree, auMenu, defaut, vueDe, partieDe, page, pagesDe, pagesDuGroupe, menuDe, menu, entrees, entreeDe, libelle, avecJour, pagesDuJour, regles, SousOnglets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyOnglets = api;
})(typeof window !== 'undefined' ? window : globalThis);
