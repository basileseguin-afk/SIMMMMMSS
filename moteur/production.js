/* ==========================================================================
 *  PRODUCTION PAR ATELIERS DE TRAVAIL — cœur du modèle
 *  ------------------------------------------------------------------------
 *  Ce module remplace l'ancien modèle par postes et files d'attente. Il repose
 *  sur trois objets, et trois seulement.
 *
 *  1. La COMPAGNIE × CLASSE. Déduite du programme de vols : CRL/BC, AF/YC…
 *     C'est l'unité de fabrication. Elle porte un nombre de passagers, les vols
 *     qui la composent et l'échéance la plus serrée d'entre eux.
 *
 *  2. L'ATELIER DE TRAVAIL. Une équipe dans un service : une heure de début,
 *     un effectif, et une liste ORDONNÉE de lots à fabriquer. Le premier lot
 *     commence à l'heure de début ; chacun des suivants quand le précédent est
 *     fini. L'atelier n'occupe aucune place dans l'espace : ce qu'il faut
 *     savoir de lui, c'est ce qu'il fait, quand, et à combien.
 *
 *  3. LE PARCOURS. Une compagnie × classe n'est pas une ligne mais un
 *     assemblage : sa part food vient des appros, son matériel du magasin et
 *     des retours de dotation, son armement de l'armement — et tout cela
 *     converge. Ce parcours n'est PAS inventé ici : il se lit dans le graphe
 *     des liaisons que l'utilisateur entretient dans le Centre des flux. Un
 *     service ne peut travailler un lot que lorsque TOUS ses fournisseurs dans
 *     ce graphe ont livré les classes de ce lot.
 *
 *  Ce que le modèle NE fait pas, et c'est délibéré : il ne choisit pas les
 *  heures de début, il ne répartit pas le travail, il n'invente pas de file
 *  d'attente. L'utilisateur décide ; le modèle calcule les conséquences et
 *  nomme ce qui ne tient pas.
 *
 *  BARÈME : des homme-minutes PAR VOL, par service et par compagnie × classe.
 *  Les valeurs ci-dessous sont des valeurs d'attente, NON CALIBRÉES, en place
 *  pour que le modèle tourne. Elles sont isolées dans une table unique afin
 *  d'être remplacées en bloc par l'étude à venir (import Excel).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const Noyau = (typeof module !== 'undefined' && module.exports)
    ? require('./noyau.js') : root.MoteurNoyau;

  const { Environnement } = Noyau;

  /* ======================================================================
   *  1. TEMPS
   * ====================================================================*/

  const MINUTES_PAR_JOUR = 1440;

  /** « 06:30 » → 390. Accepte déjà un nombre de minutes. */
  function minutes(valeur) {
    if (typeof valeur === 'number' && Number.isFinite(valeur)) return valeur;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(valeur || '').trim());
    if (!m) throw new Error('Heure attendue au format HH:MM, reçu : ' + valeur);
    const h = +m[1], mn = +m[2];
    if (h > 47 || mn > 59) throw new Error('Heure hors limites : ' + valeur);
    return h * 60 + mn;
  }

  /** 390 → « 06:30 ». Les heures au-delà de 24:00 restent lisibles. */
  function hhmm(t) {
    if (t == null || !Number.isFinite(t)) return '—';
    // On arrondit à la minute AVANT de découper : sinon 03:59,6 s'écrirait « 03:60 ».
    const u = Math.round(t);
    const j = Math.floor(u / MINUTES_PAR_JOUR), reste = u - j * MINUTES_PAR_JOUR;
    const h = String(Math.floor(reste / 60)).padStart(2, '0');
    const m = String(reste % 60).padStart(2, '0');
    return (j ? (j > 0 ? 'J+' + j + ' ' : 'J' + j + ' ') : '') + h + ':' + m;
  }

  /* ======================================================================
   *  2. COMPAGNIES × CLASSES
   * ====================================================================*/

  /*
   * Les classes fabriquées. Les trois premières sont des cabines ; les deux
   * dernières n'en sont pas, mais se fabriquent exactement comme elles :
   *
   *   CREW — les plateaux de l'équipage, sur le même vol que les passagers ;
   *   SPML — les repas spéciaux, toutes cabines confondues.
   *
   * Les compter à part, c'est pouvoir leur donner leur propre barème : un
   * repas spécial ne coûte pas le temps d'un plateau de masse, et le noyer
   * dans l'économie reviendrait à sous-estimer la cuisine.
   */
  const CABINES = ['BC', 'PC', 'YC', 'CREW', 'SPML'];
  const CHAMP_PAX = { BC: 'bc', PC: 'pc', YC: 'yc', CREW: 'crew', SPML: 'spml' };
  const NOM_CABINE = { BC: 'Business', PC: 'Premium', YC: 'Économie',
    CREW: 'Équipage', SPML: 'Repas spéciaux' };

  const idClasse = (cie, cabine) => String(cie).trim().toUpperCase() + '/' + cabine;
  /* Les catégories propres à un service (« AF/@TB » : AF, Trolleys bar) : leurs
   * noms, déclarés par l'interface, pour les écrire en clair. */
  const NOMS_CATEGORIES = new Map();
  function declarerCategories(categories) {
    NOMS_CATEGORIES.clear();
    for (const liste of Object.values(categories || {})) for (const k of (liste || [])) if (k && k.id) NOMS_CATEGORIES.set(String(k.id), String(k.nom || k.id));
  }
  const nomCabine = cab => (String(cab).startsWith('@') ? NOMS_CATEGORIES.get(cab.slice(1)) || cab.slice(1) : NOM_CABINE[cab] || cab);
  /** « AF/BC » en toutes lettres : « AF · Business » ; « AF/@TB » : « AF · Trolleys bar ». */
  const libelleClasse = id => {
    const i = String(id).lastIndexOf('/');
    if (i < 0) return String(id);
    const cab = String(id).slice(i + 1);
    return String(id).slice(0, i) + ' · ' + nomCabine(cab);
  };
  /** Un texte où chaque « AF/BC » est écrit en clair. */
  const enClair = texte => String(texte ?? '').replace(/[A-Z0-9]{1,40}\/(BC|PC|YC|CREW|SPML|@[A-Z0-9_-]{1,40})(?![A-Z0-9_-])/g, libelleClasse);

  /**
   * Les compagnies × classes présentes dans un programme de vols.
   * Seuls les départs fabriquent : un retour ne crée pas de classe à produire.
   * `delaiChargement` recule l'échéance par rapport à l'heure de départ.
   */
  function classesDeVols(vols, options) {
    const o = options || {};
    const delai = o.delaiChargement === undefined ? 45 : o.delaiChargement;
    const parId = new Map();
    for (const v of vols || []) {
      if (v.sens && v.sens !== 'DEP') continue;
      const depart = v.std === undefined ? v.heure : v.std;
      if (!Number.isFinite(depart)) continue;
      for (const cabine of CABINES) {
        const pax = v[CHAMP_PAX[cabine]] || 0;
        if (pax <= 0) continue;
        const id = idClasse(v.cie, cabine);
        let c = parId.get(id);
        if (!c) {
          c = { id, cie: String(v.cie).trim().toUpperCase(), cabine, pax: 0, vols: [], echeance: Infinity };
          parId.set(id, c);
        }
        c.pax += pax;
        // Les repas spéciaux de chaque cabine, quand le programme les donne (banc d'essai, évolution 7).
        c.vols.push({ id: v.id, pax, depart, echeance: depart - delai, ...(cabine === 'SPML' && v.spmlParCabine ? { cabines: { ...v.spmlParCabine } } : {}) });
        c.echeance = Math.min(c.echeance, depart - delai);
      }
    }
    return [...parId.values()].sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
  }

  /*
   * UN SERVICE QUI TRAVAILLE PAR COMPAGNIE (retour d'usage du 01/10 :
   * « l'armement ne travaille pas en fonction de BC, PC, Éco, SPML » ; puis
   * « une seule case par compagnie, oui ou non » ; puis, le 02/10 : « l'armement
   * est toujours lié au handling »).
   *
   * On arme un vol, pas une classe (un vol AF en Business et en Éco s'arme une
   * fois), en parallèle des repas : dans chaque chemin, l'armement est une
   * branche à part, reliée seulement au handling, qui charge le vol quand repas
   * et armement sont prêts.
   *
   *   categories: { [service]: [{ id, nom, minutes: { '*': 10, AF: 15 } }] }
   *
   * QUI A SA CASE (retour d'usage du 02/10 : « dans le chemin EZY, l'armement
   * est bien présent, et je ne peux pas faire apparaître sa case ») : chaque
   * compagnie dont un chemin passe par le service — comme une commande a sa
   * case dans chaque service de son chemin —, et chaque compagnie qu'une de ses
   * équipes a cochée. Avec ou sans vol au programme : une compagnie ajoutée à
   * la main a sa case, à 0 vol tant que le programme n'en porte pas. Ni la
   * liste « Compagnies chargées » d'un handling (elle dit qui charge), ni le
   * fait qu'une équipe prépare déjà ses repas n'entrent en jeu.
   *
   * UNE COMPAGNIE SANS ARMEMENT (retour d'usage du 08/10 : « si aucune classe
   * de la compagnie, qu'elle n'est dans aucun chemin et qu'aucun atelier de
   * l'armement ne l'a, pas besoin que le handling attende ») : ni chemin par le
   * service, ni équipe du service qui l'a cochée — pas de case, et le handling
   * charge ses vols sans l'attendre. Rien à régler pour le dire.
   *
   * La case « AF/@ARM » : minutes par vol (les siennes, sinon celles de « * »)
   * × départs de la compagnie, échéance du premier. Ses équipes la cochent ;
   * le handling l'attend pour charger le vol. `compagnies(service)` donne les
   * compagnies qui ont leur case (voir `compagniesParService`) ; sans elle,
   * chaque compagnie qui a un départ.
   */
  function classesCategories(vols, categories, options) {
    const o = options || {};
    const delai = o.delaiChargement === undefined ? 45 : o.delaiChargement;
    const lire = (min, k) => (min[k] !== '' && min[k] !== null && min[k] !== undefined && Number.isFinite(+min[k]) ? +min[k] : null);
    // Les départs de chaque compagnie.
    const departs = new Map();
    for (const v of vols || []) {
      if ((v.sens && v.sens !== 'DEP') || !v.cie) continue;
      const depart = v.std === undefined ? v.heure : v.std;
      if (!Number.isFinite(depart)) continue;
      const cie = String(v.cie).trim().toUpperCase();
      if (!departs.has(cie)) departs.set(cie, []);
      departs.get(cie).push({ id: v.id, pax: 0, depart, echeance: depart - delai });
    }
    const out = [];
    for (const [service, liste] of Object.entries(categories || {})) {
      const cies = typeof o.compagnies === 'function' ? o.compagnies(service) : departs.keys();
      for (const k of (Array.isArray(liste) ? liste : [])) {
        if (!k || !k.id) continue;
        const min = k.minutes || {};
        for (const cie of cies || []) {
          const vs = departs.get(cie) || [];
          out.push({ id: cie + '/@' + k.id, cie, cabine: '@' + k.id, categorie: k.id, service, minutes: lire(min, cie) ?? lire(min, TOUTES), pax: 0,
            vols: vs, echeance: vs.length ? Math.min(...vs.map(x => x.echeance)) : MINUTES_PAR_JOUR });
        }
      }
    }
    return out.sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
  }

  /** Les compagnies qui ont leur case dans chaque service : `service → Set`.
   *  Celles dont un chemin passe par lui, et celles qu'une de ses équipes a
   *  cochées (« AF/@ARM », 08/10) ; les autres n'en ont pas.
   *  `classes` : les commandes des repas ; `routes` : `routesDesClasses` ;
   *  `ateliers` : les équipes. */
  function compagniesParService(classes, routes, ateliers) {
    const m = new Map();
    const ajouter = (s, cie) => { if (!m.has(s)) m.set(s, new Set()); m.get(s).add(String(cie).trim().toUpperCase()); };
    for (const c of classes || []) {
      const r = !c.categorie && routes.get(c.id);
      if (!r) continue;
      for (const s of r.services) ajouter(s, c.cie);
    }
    for (const a of ateliers || []) {
      for (const lot of (a && Array.isArray(a.lots) ? a.lots : [])) {
        for (const id of (Array.isArray(lot) ? lot : (lot && lot.classes) || [])) {
          const i = String(id).indexOf('/@');
          if (i > 0) ajouter(a.service, String(id).slice(0, i));
        }
      }
    }
    return service => [...(m.get(service) || [])].sort();
  }

  /* ======================================================================
   *  3. BARÈME — table unique, remplaçable en bloc
   * ====================================================================*/

  /*
   * L'UNITÉ DE COMPTE : LE VOL.
   *
   * Le barème comptait des minutes « par passager ». Cela ne décrit rien de
   * réel : on ne dresse pas un passager, on monte les trolleys d'un vol, on
   * dresse les plateaux d'une classe de ce vol. Une étude de temps donne des
   * minutes pour une compagnie × classe sur un vol — c'est donc l'unité.
   *
   *   bareme[service]['AF/BC'] — minutes par vol pour AF en BC, dans ce service
   *   bareme[service]['*\/BC']  — la valeur de toutes les compagnies qui n'en
   *                              ont pas de propre
   *
   * Le travail d'une compagnie × classe dans la journée est cette valeur fois
   * le nombre de ses vols. Le nombre de passagers ne sert plus qu'au robot, qui
   * compte bien des plateaux.
   */

  /* Passagers types d'un vol, par classe. Ils ne servent QU'À convertir un
   * barème ou une table de matériel enregistrés dans l'ancienne unité : une
   * sauvegarde d'hier doit continuer de s'ouvrir, et le dire. */
  const PAX_TYPE = { BC: 25, PC: 40, YC: 190, CREW: 7, SPML: 10 };

  const TOUTES = '*';
  const cleBareme = (cie, cabine) => (cie === TOUTES ? TOUTES : String(cie).trim().toUpperCase()) + '/' + cabine;

  /** Homme-minutes par vol, VALEURS D'ATTENTE (conversion de l'ancien barème). */
  const BAREME_DEMO = (() => {
    const ancien = {
      appros:   { BC: [0.60, 0], PC: [0.35, 0], YC: [0.12, 0], CREW: [0.90, 0], SPML: [0.30, 0] },
      decontam: { BC: [0.05, 0], PC: [0.05, 0], YC: [0.05, 0], CREW: [0.05, 0], SPML: [0.10, 0] },
      cuisine:  { BC: [1.40, 0], PC: [0.70, 0], YC: [0.28, 0], CREW: [1.40, 0], SPML: [2.20, 0] },
      prepa:    { BC: [2.20, 5], PC: [1.10, 5], YC: [0.35, 5], CREW: [2.20, 5], SPML: [2.60, 5] },
      preparation: { BC: [0.80, 0], PC: [0.40, 0], YC: [0.10, 0], CREW: [0.80, 0], SPML: [1.00, 0] },
      dotation: { BC: [0.50, 0], PC: [0.30, 0], YC: [0.12, 0], CREW: [0.50, 0], SPML: [0.50, 0] },
      armement: { BC: [0.08, 5], PC: [0.08, 5], YC: [0.08, 5], CREW: [0.08, 5], SPML: [0.08, 5] },
      magasin:  { BC: [0.10, 0], PC: [0.08, 0], YC: [0.04, 0], CREW: [0.10, 0], SPML: [0.10, 0] }
    };
    // Pas de ligne pour la plonge : elle travaille au débit de ses tunnels.
    const out = {};
    for (const [service, t] of Object.entries(ancien)) {
      out[service] = {};
      for (const c of CABINES) out[service][cleBareme(TOUTES, c)] = Math.round((t[c][0] * PAX_TYPE[c] + t[c][1]) * 10) / 10;
    }
    return out;
  })();

  /**
   * Un barème, quelle que soit la forme où il arrive.
   *
   *   • forme actuelle — { service: { 'AF/BC': 12, '*\/YC': 40 } }
   *   • ancienne forme — { service: { BC: { parPax, parVol } } }, convertie en
   *     minutes par vol sur la base de passagers types (PAX_TYPE)
   *
   * @returns {{ bareme, converti }} `converti` dit qu'une ancienne saisie a été
   *   transformée : à l'interface de le signaler.
   */
  function normaliserBareme(brut) {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { bareme: clone(BAREME_DEMO), converti: false };
    const out = {}; let converti = false;
    for (const [service, table] of Object.entries(brut).slice(0, 300)) {
      if (!service || service.length > 160 || !table || typeof table !== 'object') continue;
      const ligne = {};
      for (const [k, v] of Object.entries(table).slice(0, 2000)) {
        if (CABINES.includes(k) && v && typeof v === 'object') {
          // Ancienne forme : minutes par passager et fixe par vol.
          converti = true;
          const n = (+v.parPax || 0) * PAX_TYPE[k] + (+v.parVol || 0);
          ligne[cleBareme(TOUTES, k)] = Math.max(0, Math.round(n * 10) / 10);
          continue;
        }
        const i = k.lastIndexOf('/');
        if (i <= 0) continue;
        const cie = k.slice(0, i).trim(), cabine = k.slice(i + 1).trim().toUpperCase();
        if (!CABINES.includes(cabine) || !cie || cie.length > 40) continue;
        const n = +v;
        if (!Number.isFinite(n) || n < 0) continue;
        ligne[cleBareme(cie, cabine)] = Math.round(n * 100) / 100;
      }
      out[service] = ligne;
    }
    return { bareme: out, converti };
  }

  /** Minutes par vol d'une compagnie × classe dans un service, ou null. */
  function minutesParVol(table, classe) {
    // Une catégorie propre à un service porte ses minutes par vol.
    if (classe && classe.categorie) return Number.isFinite(classe.minutes) ? classe.minutes : null;
    if (!table) return null;
    const propre = table[cleBareme(classe.cie, classe.cabine)];
    if (Number.isFinite(propre)) return propre;
    const commune = table[cleBareme(TOUTES, classe.cabine)];
    return Number.isFinite(commune) ? commune : null;
  }

  /* Le travail par vol se lit et se saisit en HEURES (retour d'usage du 08/10 :
   * « remplace les min par vol en h par vol ») ; le calcul, l'état et les
   * sauvegardes restent en minutes. Ces conversions servent l'écran et les
   * classeurs : au millième d'heure (3,6 s) à l'écran, au dix-millième dans
   * Excel — un aller-retour par le classeur retrouve alors les minutes au
   * centième près, sans dériver —, au centième de minute dans l'autre sens.
   * Vide ou illisible : null. */
  function versHeures(minutes, decimales = 3) {
    if (minutes === null || minutes === undefined || minutes === '') return null;
    const n = +minutes, k = 10 ** decimales;
    return Number.isFinite(n) ? Math.round(n / 60 * k) / k : null;
  }
  function versMinutes(heures) {
    if (heures === null || heures === undefined) return null;
    const t = typeof heures === 'string' ? heures.trim().replace(',', '.') : heures;
    if (t === '') return null;
    const n = +t;
    return Number.isFinite(n) ? Math.round(n * 60 * 100) / 100 : null;
  }
  /** Des minutes de travail dites en heures, à la française : « 0,117 », « 1,5 » ; '' sans valeur. */
  function heuresFr(minutes, decimales = 3) {
    const h = versHeures(minutes);
    if (h === null) return '';
    const k = 10 ** decimales;
    return String(Math.round(h * k) / k).replace('.', ',');
  }

  /** Rendement : part du temps de présence réellement produite. 1 = idéal. */
  const RENDEMENT_DEMO = 1;

  /** Homme-minutes d'une classe dans un service : minutes par vol × vols. */
  function travailClasse(service, classe, bareme, spml) {
    const b = bareme || BAREME_DEMO;
    const m = minutesParVol(b[service], classe);
    return (m || 0) * volsPrepares(service, classe, spml);
  }

  /**
   * Les vols d'une commande qu'un service prépare (banc d'essai, évolution 7) :
   * tous ; mais la commande « repas spéciaux » (X/SPML) d'un service réglé sur
   * certaines cabines (`spml` : { service: ['BC', 'PC'] }) ne compte que les vols
   * qui ont un SPML de l'une d'elles. Un vol dont le programme ne détaille pas
   * les cabines (nb_SPML seul), ou pas toutes, compte pour tout service qui en
   * prépare ; une liste vide n'en prépare aucun.
   */
  function volsPrepares(service, classe, spml) {
    const vols = (classe && classe.vols) || [];
    const cab = classe && classe.cabine === 'SPML' && spml ? spml[service] : null;
    if (!Array.isArray(cab)) return vols.length;
    if (!cab.length) return 0;      // il n'en prépare aucun
    return vols.filter(v => {
      if (!v.cabines) return true;
      const detail = Object.values(v.cabines).reduce((n, x) => n + (+x || 0), 0);
      return cab.some(c => +v.cabines[c] > 0) || (+v.pax || 0) > detail;
    }).length;
  }

  /**
   * Les homme-minutes d'une classe DANS un atelier : celles que l'atelier fixe
   * pour elle (`a.minutes[classe]`, saisies dans sa case), sinon celles du
   * barème importé. La valeur fixée ne vaut que pour cet atelier.
   */
  function travailDans(a, classe, bareme, spml) {
    const propre = a && a.minutes ? a.minutes[classe.id] : undefined;
    return Number.isFinite(propre) ? propre : travailClasse(a.service, classe, bareme, spml);
  }

  /*
   * DEUX ÉTAPES FUSIONNÉES, À LA CHAÎNE (retour d'usage du 29/09) : « une
   * personne dresse un plat puis le passe, l'autre fait le montage
   * directement ». Une case de Montage peut faire AUSSI l'étape d'avant
   * (`fusion` : la Prépa) pour ses commandes — seulement celles-là : les
   * autres compagnies gardent leurs deux cases.
   *
   * Sa durée, pour `avant` et `ici` minutes de travail et `n` personnes :
   *   - seule, une personne fait tout : avant + ici ;
   *   - à plusieurs, les personnes se répartissent entre les deux postes (au
   *     moins une à chacun) et le plat passe de l'un à l'autre : c'est le poste
   *     le plus lent qui donne le rythme, max(avant ÷ k, ici ÷ (n − k)), avec la
   *     meilleure répartition k.
   */
  function dureeFusion(avant, ici, n) {
    const p = Math.max(0, +avant || 0), m = Math.max(0, +ici || 0), k0 = Math.floor(+n || 0);
    if (k0 < 1) return Infinity;
    if (k0 === 1 || !p || !m) return (p + m) / k0;
    let mieux = Infinity;
    for (let k = 1; k < k0; k++) mieux = Math.min(mieux, Math.max(p / k, m / (k0 - k)));
    return mieux;
  }
  /** Le service d'avant qu'une case fait aussi, s'il y en a un. */
  const fusionDe = a => (a && (a.type === 'manuel' || !a.type) && typeof a.fusion === 'string' && a.fusion && a.fusion !== a.service ? a.fusion : null);

  /*
   * L'EFFECTIF CALCULÉ (retour d'usage du 05/10) : « le nombre de personnes
   * sur les ateliers dépend du nombre de vols, il n'est pas constant, à part
   * sur certains ateliers ». Dans un service dont l'effectif est calculé, une
   * équipe qui prépare à la main ne lit plus ses personnes : on les déduit de
   * son travail.
   *
   *   personnes = homme-minutes de ses commandes (minutes par vol × vols de
   *               chaque compagnie) ÷ (minutes qu'une personne travaille
   *               pendant le poste × rendement), arrondi au-dessus.
   *
   * Le poste se lit comme dans la journée : de l'heure de début à la fin de la
   * présence, moins les pauses fixes et les pauses du régime. La journée est
   * ensuite jouée avec cet effectif. Les attentes entre services ne sont pas
   * dans le calcul : c'est la simulation qui dit si ça tient.
   *
   * Une plonge (ses tunnels), un handling (ses durées par vol, ses chauffeurs)
   * et une mise à disposition ne travaillent pas en homme-minutes : leur
   * effectif reste celui qu'on saisit. Un robot va à son débit, mais le travail
   * autour de sa ligne se budgète par vol (banc d'essai, évolution 9) : avec des
   * minutes au barème de son service, il se calcule comme une équipe à la main,
   * au moins son minimum ; sans elles, il garde son effectif saisi.
   */
  const PLAFOND_EFFECTIF = 999;

  /** Les minutes qu'une personne travaille pendant le poste de cette équipe. */
  function minutesDuPoste(a, regimeDefaut) {
    const debut = minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR;
    let regime = normaliserRegime(a.regime, regimeDefaut);
    // Sans fin de poste, on compte une présence ordinaire : sinon une seule
    // personne suffirait toujours, puisqu'elle aurait tout son temps.
    if (!regime.actif) regime = normaliserRegime(null, regimeDefaut);
    return executerTache({ depart: debut, duree: 1e7, pauses: pausesDe(a), regime, finPoste: debut + regime.presence }).fait;
  }

  /**
   * Le plus petit effectif qui fait `ici` homme-minutes (et `avant`, l'étape
   * fusionnée) en `poste` minutes. 0 sans travail ; null sans poste.
   */
  function effectifPour(ici, avant, poste, rendement) {
    const m = Math.max(0, +ici || 0), p = Math.max(0, +avant || 0), r = rendement > 0 ? rendement : 1;
    if (!(m + p > 0)) return 0;
    if (!(poste > 0)) return null;
    let n = Math.max(1, Math.ceil((m + p) / (poste * r) - 1e-9));
    // À la chaîne, le poste le plus lent donne le rythme : il en faut parfois un de plus.
    if (p > 0 && m > 0) while (n < PLAFOND_EFFECTIF && dureeFusion(p, m, n) / r > poste + 1e-9) n++;
    return Math.min(n, PLAFOND_EFFECTIF);
  }

  /* ======================================================================
   *  4. PARCOURS — lu dans le graphe des liaisons
   * ====================================================================*/

  /**
   * Fournisseurs directs de chaque service, d'après les liaisons.
   * `liaisons` : [{from, to}] entre identifiants de service. Les liaisons de
   * retour (quais → plonge) font partie du graphe : c'est à l'appelant de ne
   * transmettre que ce qui alimente la fabrication.
   */
  function fournisseurs(liaisons) {
    const par = {};
    for (const l of liaisons || []) {
      if (!l || !l.from || !l.to || l.from === l.to) continue;
      (par[l.to] || (par[l.to] = [])).push(l.from);
    }
    for (const k of Object.keys(par)) par[k] = [...new Set(par[k])];
    return par;
  }

  /**
   * Un cycle dans le graphe bloquerait la fabrication sans jamais rien dire.
   * On le détecte une fois pour toutes, en ne gardant que les services qui
   * portent réellement du travail.
   */
  function cycles(fourn, services) {
    const vus = new Map(), chemin = [], trouves = [];
    const visiter = s => {
      if (vus.get(s) === 'fini') return;
      if (vus.get(s) === 'encours') {
        trouves.push(chemin.slice(chemin.indexOf(s)).concat(s));
        return;
      }
      vus.set(s, 'encours'); chemin.push(s);
      for (const p of (fourn[s] || [])) if (services.has(p)) visiter(p);
      chemin.pop(); vus.set(s, 'fini');
    };
    for (const s of services) visiter(s);
    return trouves;
  }

  /* ----------------------------------------------------------------------
   *  PARCOURS EXPLICITES
   *
   *  Toutes les compagnies × classes ne passent pas par les mêmes services :
   *  un plateau d'économie ne voit ni la cuisine ni la légumerie. Le graphe du
   *  Centre des flux décrit l'unité ; il ne dit pas le chemin de CHAQUE classe.
   *
   *  Un parcours est un GRAPHE ORIENTÉ : des nœuds (les services) et des liens
   *  « A livre B ». Il se dessine comme un diagramme de nœuds ; plusieurs
   *  chemins partent en parallèle et se rejoignent là où un service a
   *  plusieurs liens entrants :
   *
   *      Agro      appros → légumerie → cuisine → montage
   *      Matériel  plonge → dotation ─────────→ montage
   *      Magasin   magasin ───────────────────→ montage
   *
   *  Le montage attend donc les trois branches. Chaque compagnie × classe
   *  reçoit un parcours : le sien, sinon celui de sa classe (BC, YC…). Sans
   *  aucun parcours, le modèle retombe sur le graphe des flux.
   * --------------------------------------------------------------------*/

  /** Les arcs d'un parcours : ses liens. L'ancienne écriture en branches
   *  (chaque paire consécutive de chaque branche) reste lue. */
  function arcsDuParcours(parcours) {
    const arcs = [], vus = new Set();
    if (parcours && Array.isArray(parcours.liens)) {
      for (const l of parcours.liens) {
        const de = l && (l.de ?? l.from ?? l[0]), vers = l && (l.vers ?? l.to ?? l[1]);
        if (!de || !vers || de === vers) continue;
        const k = de + '>' + vers;
        if (vus.has(k)) continue; vus.add(k);
        arcs.push({ from: de, to: vers });
      }
      return arcs;
    }
    for (const b of ((parcours && parcours.branches) || [])) {
      const etapes = (b && b.services) || b || [];
      for (let i = 1; i < etapes.length; i++) {
        const de = etapes[i - 1], vers = etapes[i];
        if (!de || !vers || de === vers) continue;
        const k = de + '>' + vers;
        if (vus.has(k)) continue; vus.add(k);
        arcs.push({ from: de, to: vers });
      }
    }
    return arcs;
  }

  /** Les services d'un parcours, dans l'ordre où ils apparaissent : ses
   *  nœuds, puis ceux que ses liens nomment. */
  function servicesDuParcours(parcours) {
    const out = [];
    if (parcours && (Array.isArray(parcours.noeuds) || Array.isArray(parcours.liens))) {
      for (const s of (parcours.noeuds || [])) if (s && !out.includes(s)) out.push(s);
      for (const a of arcsDuParcours(parcours)) for (const s of [a.from, a.to]) if (!out.includes(s)) out.push(s);
      return out;
    }
    for (const b of ((parcours && parcours.branches) || [])) {
      for (const s of ((b && b.services) || b || [])) if (s && !out.includes(s)) out.push(s);
    }
    return out;
  }

  /**
   * Le parcours de chaque classe.
   * @param classes  [{id, cabine}]
   * @param o        { parcours: [{id, nom, branches}], parcoursCabine: {BC: id},
   *                   parcoursClasse: {'AF/YC': id} }
   * @returns Map id de classe → { parcours, services:Set, amonts:{service:[…]} }
   *   Une classe sans parcours n'y figure pas.
   */
  function routesDesClasses(classes, o) {
    const opts = o || {};
    const liste = Array.isArray(opts.parcours) ? opts.parcours : [];
    const parId = new Map(liste.map(p => [p.id, p]));
    const prepares = new Map();
    const preparer = p => {
      if (prepares.has(p.id)) return prepares.get(p.id);
      const amonts = {};
      for (const a of arcsDuParcours(p)) (amonts[a.to] || (amonts[a.to] = [])).push(a.from);
      const r = { parcours: p, services: new Set(servicesDuParcours(p)), amonts };
      prepares.set(p.id, r);
      return r;
    };
    const out = new Map();
    for (const c of classes || []) {
      const id = (opts.parcoursClasse || {})[c.id] || (opts.parcoursCabine || {})[c.cabine];
      const p = id && parId.get(id);
      if (p) out.set(c.id, preparer(p));
      // Une catégorie d'un service ne passe que par lui.
      else if (c.categorie && c.service) out.set(c.id, preparer({ id: '@' + c.service, nom: c.service, noeuds: [c.service], liens: [] }));
    }
    return out;
  }

  /* ======================================================================
   *  5. ATELIERS — validation
   * ====================================================================*/

  /*
   * Cinq natures d'atelier, et cinq seulement.
   *
   *   manuel   — une équipe, un barème d'homme-minutes
   *   robot    — une machine, un débit
   *   lavage   — la plonge : son travail vient des retours, pas d'une liste
   *   dispo    — une mise à disposition : magasin, appros…
   *   handling — le chargement : il travaille PAR VOL, pas par commande
   *
   * Le dernier ne fabrique rien. Un service qui se contente de **sortir du
   * matériel ou des matières premières** ne consomme ni homme-minutes ni
   * temps de production : il a préparé à l'avance, ou il sert dans l'instant.
   * Lui demander un effectif et une durée serait inventer du travail.
   */
  const TYPES = ['manuel', 'robot', 'lavage', 'dispo', 'handling', 'appui'];

  /*
   * L'ÉQUIPE D'APPUI (retour d'usage du 06/10 : « pouvoir rajouter des équipes
   * qui ne dépendent pas du tunnel, comme pour les autres, avec le choix si cela
   * dépend des vols ou non »). Elle est là, à ses heures, et ne fait attendre
   * personne : ni commandes, ni tunnel. Son effectif est saisi (service à
   * effectif constant), ou calculé d'après ses minutes par vol :
   *
   *   minutesVol — minutes de travail par vol, par compagnie ({ AF: 6, '*': 4 })
   *
   * Les vols comptés : ceux qui reviennent à la plonge quand elle est dans un
   * service qui lave, sinon les départs du jour.
   */
  function minutesVolAppui(a, cie) {
    const d = (a && a.minutesVol) || {};
    const lire = k => (d[k] === undefined || d[k] === null || d[k] === '' || !Number.isFinite(+d[k]) ? null : Math.max(0, +d[k]));
    return lire(String(cie || '').trim().toUpperCase()) ?? lire(TOUTES);
  }

  /*
   * LE HANDLING, OU LE VOL REDEVIENT L'UNITÉ.
   *
   * Tous les autres services préparent une compagnie × classe une fois pour
   * tous ses vols de la journée. Le handling, lui, réunit les classes d'UN
   * vol (AF1234 : sa Business, son Économie, ses plateaux équipage) et le
   * charge. Il ne suit donc pas de liste de commandes : il prend les vols
   * STRICTEMENT dans l'ordre des départs ; si celui de 08:00 n'est pas
   * complet, il l'attend, même si celui de 08:30 l'est déjà.
   *
   *   durees      — minutes par vol, par compagnie ({ AF: 40, '*': 30 }) :
   *                 une durée, pas des man-minutes, l'effectif ne la raccourcit pas
   *   simultanes  — combien de vols il prépare en même temps (quais, camions)
   *   avance      — il ne commence pas un vol plus de `avance` minutes avant
   *                 son départ (froid, place au quai)
   *
   * Il travaille le JOUR J des vols, jamais la veille : sa case est au jour J,
   * et il ne commence aucun vol avant 00:00 de ce jour.
   *   compagnies  — facultatif : les compagnies qu'il charge ; vide = toutes
   *
   * Les classes doivent être au handling à leur échéance (départ − délai de
   * chargement) ; le vol, lui, doit être chargé à son heure de départ.
   */
  const AVANCE_HANDLING = 180;

  /** Minutes de handling d'un vol de cette compagnie, ou null s'il n'en a pas. */
  function dureeHandling(atelier, cie) {
    const d = (atelier && atelier.durees) || {};
    const lire = k => (d[k] === undefined || d[k] === null || d[k] === '' || !Number.isFinite(+d[k]) ? null : Math.max(0, +d[k]));
    return lire(String(cie).trim().toUpperCase()) ?? lire(TOUTES);
  }

  /** Les départs de la journée, chacun avec ses classes, dans l'ordre des départs. */
  function volsDesClasses(classes) {
    const par = new Map();
    for (const c of classes || []) for (const v of (c.vols || [])) {
      let x = par.get(v.id);
      if (!x) { x = { id: v.id, cie: c.cie, depart: v.depart, classes: [], pax: {} }; par.set(v.id, x); }
      x.depart = Math.min(x.depart, v.depart);
      if (!x.classes.includes(c.id)) x.classes.push(c.id);
      x.pax[c.id] = (x.pax[c.id] || 0) + (v.pax || 0);
    }
    return [...par.values()].sort((a, b) => a.depart - b.depart || String(a.id).localeCompare(String(b.id)));
  }

  /*
   * LES CHAUFFEURS DU HANDLING (retour d'usage du 28/09).
   *
   * « Le handling récupère les trolleys prêts dans la CF départ et charge les
   * vols : 2 chauffeurs pour les compagnies long courrier, 1 pour les court
   * courrier. » Un handling qui a des créneaux de chauffeurs (`creneaux` :
   * [{ de: '03:00', a: '11:00', n: 6 }], le jour J) ne charge plus « N vols à
   * la fois » : chaque vol prend ses chauffeurs (`chauffeurs.long` pour une
   * compagnie de `longs`, sinon `chauffeurs.court`) pour sa durée, et attend
   * qu'il y en ait assez de libres. Sans créneau : l'ancien réglage.
   */
  const up = x => String(x ?? '').trim().toUpperCase();
  /** 'long' ou 'court' : une compagnie est long courrier si elle est dans la liste du handling. */
  function categorieVol(atelier, cie) {
    return ((atelier && atelier.longs) || []).map(up).includes(up(cie)) ? 'long' : 'court';
  }
  /** Les chauffeurs qu'un vol de cette compagnie occupe. */
  function chauffeursDe(atelier, cie) {
    const cat = categorieVol(atelier, cie), n = +(((atelier && atelier.chauffeurs) || {})[cat]);
    return Number.isInteger(n) && n > 0 ? n : (cat === 'long' ? 2 : 1);
  }
  /** Les créneaux de chauffeurs, en minutes du jour J ; un créneau qui passe minuit finit le lendemain. */
  function creneauxDe(atelier) {
    return ((atelier && atelier.creneaux) || []).map(c => {
      const de = minutes(c.de); let a = minutes(c.a); if (a <= de) a += MINUTES_PAR_JOUR;
      return { de, a, n: Math.max(0, Math.floor(+c.n) || 0) };
    }).filter(c => c.n > 0);
  }
  /** Les chauffeurs présents à l'instant `t`. */
  function chauffeursPresents(creneaux, t) {
    return creneaux.reduce((n, c) => n + (t >= c.de && t < c.a ? c.n : 0), 0);
  }

  /** Combien de vols d'une compagnie un camion charge en un trajet : le sien, sinon celui de toutes, sinon 1. */
  function volsParCamionDe(atelier, cie) {
    const m = (atelier && atelier.volsCamion) || {};
    const lire = k => { const v = Math.floor(+m[k]); return m[k] !== undefined && m[k] !== null && m[k] !== '' && v >= 1 ? v : null; };
    return lire(up(cie)) ?? lire(TOUTES) ?? Math.max(1, Math.floor(+(atelier && atelier.volsParCamion)) || 1);
  }

  /**
   * Combien de vols d'une compagnie une tournée du handling 24 h/24 sert au plus,
   * selon son véhicule (évolution 8) : en VL, `volsVL` (le sien, sinon « * ») ;
   * sans valeur, et en gros camion, celui du camion (`volsParCamionDe`).
   */
  function volsParTourneeDe(atelier, cie, vehicule) {
    if (vehicule === 'vl') {
      const m = (atelier && atelier.volsVL) || {};
      const lire = k => { const v = Math.floor(+m[k]); return m[k] !== undefined && m[k] !== null && m[k] !== '' && v >= 1 ? v : null; };
      const n = lire(up(cie)) ?? lire(TOUTES);
      if (n != null) return n;
    }
    return volsParCamionDe(atelier, cie);
  }

  /** Un trajet de camion pour une compagnie : aller jusqu'à l'avion, retour à l'unité (minutes). */
  function trajetHandling(atelier, cie) {
    const lire = (m, k) => { const d = (atelier && atelier[m]) || {}; const v = d[k]; return v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : Math.max(0, +v); };
    const c = up(cie);
    return { aller: lire('allers', c) ?? lire('allers', TOUTES) ?? 0, retour: lire('retours', c) ?? lire('retours', TOUTES) ?? 0 };
  }
  /**
   * Le premier instant, à partir de `t0`, où un camion peut partir : `besoin`
   * chauffeurs libres (quand il y a des créneaux) et moins de `camionsMax`
   * camions déjà sortis, pendant tout le trajet.
   */
  function debutTrajet(creneaux, occupes, t0, besoin, finDe, camionsMax) {
    const cr = creneaux || [];
    const bornes = [...new Set(cr.flatMap(c => [c.de, c.a]).concat(occupes.flatMap(o => [o.de, o.a])))].sort((x, y) => x - y);
    const dehors = t => occupes.reduce((n, o) => n + (t >= o.de && t < o.a ? 1 : 0), 0);
    const libres = t => chauffeursPresents(cr, t) - occupes.reduce((n, o) => n + (t >= o.de && t < o.a ? o.n : 0), 0);
    for (const s of [t0, ...bornes.filter(b => b > t0)]) {
      const f = finDe(s);
      if (!Number.isFinite(f)) continue;
      if ([s, ...bornes.filter(b => b > s && b < f)].every(t => dehors(t) < camionsMax && (!creneaux || libres(t) >= besoin))) return s;
    }
    return Infinity;
  }

  /*
   * LE HANDLING 24 H/24 : DES TOURNÉES QUI CHARGENT PUIS DÉCHARGENT
   * (banc d'essai, évolution 3 — docs/BANC_ESSAI.md).
   *
   * Une équipe de handling `handling24h` ne charge plus un vol après l'autre :
   * elle mène des tournées en parallèle. Une tournée, c'est un véhicule et ses
   * chauffeurs, du quai de l'unité au quai de l'unité : préparation au quai
   * (`quaiDepart`) si elle charge, aller, un ou plusieurs chargements, un avion
   * arrivé à décharger (`entreAvions`, `dechargement`), retour, vidage du sale
   * au quai (`quaiRetour`) si elle en rapporte. L'avion d'un départ arrive à
   * départ − `escale` (par compagnie, « * » pour les autres), ou à son ETA.
   * Toutes les durées sont par compagnie, avec « * » pour les autres.
   */
  /** Une valeur par compagnie (« * » : les autres), ou null si elle n'en a pas. */
  function parCompagnie(atelier, champ, cie) {
    const d = (atelier && atelier[champ]) || {};
    const lire = k => (d[k] === undefined || d[k] === null || d[k] === '' || !Number.isFinite(+d[k]) ? null : Math.max(0, +d[k]));
    return lire(up(cie)) ?? lire(TOUTES);
  }
  /** L'escale d'une compagnie (minutes entre l'arrivée de l'avion et son départ), ou null : pas de déchargement. */
  const escaleDe = (atelier, cie) => parCompagnie(atelier, 'escale', cie);
  /** Préparer le camion au quai (chargement dans la CF départ, contrôle), et le vider du sale au retour. */
  const quaiDepartDe = (atelier, cie) => parCompagnie(atelier, 'quaiDepart', cie) ?? 0;
  const quaiRetourDe = (atelier, cie) => parCompagnie(atelier, 'quaiRetour', cie) ?? 0;
  /** Une tournée qui sert plusieurs vols (évolution 8) : tant de minutes de quai en plus par vol de plus (0 par défaut, à confirmer). */
  const quaiParVolDe = (atelier, cie) => parCompagnie(atelier, 'quaiParVol', cie) ?? 0;
  /** Décharger un avion : 30 min pour un long courrier, 10 pour les autres, sauf durée saisie. */
  const dechargementDe = (atelier, cie) => parCompagnie(atelier, 'dechargement', cie) ?? (categorieVol(atelier, cie) === 'long' ? 30 : 10);
  /**
   * L'échange sur le même avion, par compagnie (évolution 8) : chaque avion d'une
   * compagnie de la liste `echange` est déchargé puis chargé dans la même visite,
   * quelle que soit son escale, sans tournée de déchargement à part.
   */
  const echangeDe = (atelier, cie) => ((atelier && atelier.echange) || []).map(up).includes(up(cie));
  /** L'heure du jour (minutes) à partir de laquelle une compagnie part en VL (`vlDes`, HH:MM), ou null. */
  function vlDesDe(atelier, cie) {
    const v = ((atelier && atelier.vlDes) || {})[up(cie)];
    if (v === undefined || v === null || v === '') return null;
    try { return minutes(v); } catch (e) { return null; }
  }
  /**
   * Le véhicule d'un départ : un petit camion (« vl ») pour une compagnie de la
   * liste `vl`, toute la journée ; pour une compagnie de `vlDes`, à partir de
   * son heure (l'heure du départ, sur l'horloge), un gros camion avant ; un
   * gros camion sinon.
   */
  const vehiculeDe = (atelier, cie, depart) => {
    if (((atelier && atelier.vl) || []).map(up).includes(up(cie))) return 'vl';
    const des = vlDesDe(atelier, cie);
    return des != null && Number.isFinite(depart) && modJour(depart) >= des ? 'vl' : 'camion';
  };
  /** Les réglages d'un handling 24 h/24, avec leurs valeurs par défaut (provisoires, à caler). */
  function reglages24h(atelier) {
    const a = atelier || {};
    const n = (v, d) => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? d : Math.max(0, +v));
    const flotte = v => { const k = Math.floor(n(v, 0)); return k > 0 ? k : Infinity; };
    return {
      entreAvions: n(a.entreAvions, 10),
      dechargementsParTournee: Math.max(1, Math.floor(n(a.dechargementsParTournee, 1)) || 1),
      margeDepart: n(a.margeDepart, 60),
      margeEscaleCourte: n(a.margeEscaleCourte, 0),
      delaiArrivee: n(a.delaiArrivee, 0),
      // La flotte, par type de véhicule (0 ou rien : sans limite).
      flotte: { camion: flotte(a.camions), vl: flotte(a.camionsVL) }
    };
  }
  /** L'arrivée de l'avion d'un départ : son ETA, sinon départ − escale ; null sans l'une ni l'autre. */
  function arriveeDe(atelier, vol) {
    if (vol && Number.isFinite(vol.eta)) return vol.eta;
    const depart = vol && (vol.std === undefined ? vol.heure : vol.std);
    const e = escaleDe(atelier, vol && vol.cie);
    return e == null || !Number.isFinite(depart) ? null : depart - e;
  }
  /**
   * Ce qu'un départ demande au handling 24 h/24 : son chargement, son
   * déchargement (s'il a une arrivée), l'escale courte, l'heure limite du
   * chargement et l'échéance de ses commandes, qui se déduit de sa tournée :
   * départ − marge − chargement − aller − préparation au quai. En escale
   * courte, la même tournée décharge puis charge le même avion, et le vol doit
   * seulement être chargé `margeEscaleCourte` minutes avant son départ. De même
   * pour chaque avion d'une compagnie de la liste `echange` (évolution 8). En VL,
   * le chargement et le déchargement prennent les durées VL de la compagnie
   * (`dureesVL`, `dechargementVL`, « * » : les autres) quand elle en a.
   */
  function besoin24h(atelier, vol) {
    const r = reglages24h(atelier), cie = vol.cie;
    const depart = vol.std === undefined ? vol.heure : vol.std;
    const vehicule = vehiculeDe(atelier, cie, depart);
    // En VL, les durées VL de la compagnie (évolution 8 : un réajustement d'armoire), sinon les siennes.
    const enVL = champ => (vehicule === 'vl' ? parCompagnie(atelier, champ, cie) : null);
    const charge = enVL('dureesVL') ?? dureeHandling(atelier, cie) ?? 0, t = trajetHandling(atelier, cie), quai = quaiDepartDe(atelier, cie);
    const arrivee = arriveeDe(atelier, vol), dech = enVL('dechargementVL') ?? dechargementDe(atelier, cie);
    const dispo = arrivee == null ? null : arrivee + r.delaiArrivee;
    // L'échange sur le même avion : en escale courte, ou toujours pour une compagnie de la liste `echange`.
    const courte = dispo != null && (echangeDe(atelier, cie) || dispo + dech + charge > depart - r.margeDepart);
    const limite = courte ? depart - r.margeEscaleCourte : depart - r.margeDepart;
    return { depart, arrivee, dispo, courte, limite, charge, dechargement: dech, aller: t.aller, retour: t.retour, quaiDepart: quai,
      quaiRetour: quaiRetourDe(atelier, cie), vehicule, long: categorieVol(atelier, cie) === 'long',
      // Les vagues (évolution 8) : sa compagnie, les vols qu'une tournée de son véhicule sert au plus, le quai par vol de plus.
      cie: up(cie), parTournee: volsParTourneeDe(atelier, cie, vehicule), quaiParVol: quaiParVolDe(atelier, cie),
      echeance: limite - charge - (courte ? dech : 0) - t.aller - quai };
  }
  /** Le handling qui charge une compagnie : le premier qui la nomme, sinon le premier qui les charge toutes. */
  function handlingDeCompagnie(handlings, cie) {
    return handlings.find(a => { const s = compagniesDe(a); return s && s.has(up(cie)); }) || handlings.find(a => !compagniesDe(a)) || null;
  }
  /** L'échéance des commandes des vols d'un handling 24 h/24 : celle de leur tournée de chargement. */
  function echeances24h(classes, ateliers, vols) {
    const handlings = (ateliers || []).filter(a => a && a.type === 'handling');
    if (!handlings.some(a => a.handling24h === true)) return classes;
    const brut = new Map((vols || []).filter(v => (v.sens || 'DEP') === 'DEP').map(v => [v.id, v]));
    return classes.map(c => {
      const a = handlingDeCompagnie(handlings, c.cie);
      if (!a || a.handling24h !== true || !(c.vols || []).length) return c;
      const vs = c.vols.map(v => { const b = brut.get(v.id); return b ? { ...v, echeance: besoin24h(a, { ...b, cie: c.cie, std: v.depart }).echeance } : v; });
      return { ...c, vols: vs, echeance: Math.min(...vs.map(v => v.echeance)) };
    }).sort((x, y) => x.echeance - y.echeance || x.id.localeCompare(y.id));
  }
  /**
   * Les créneaux de chauffeurs d'un handling 24 h/24, chacun avec son véhicule
   * (« camion » par défaut, « vl »). La journée se répète : un créneau de 22:00
   * à 06:00 couvre aussi la nuit d'avant (de la veille 22:00 à 06:00), où
   * partent les premières tournées.
   */
  function creneaux24h(atelier) {
    const out = [];
    ((atelier && atelier.creneaux) || []).forEach((c, i) => {
      const de = minutes(c.de); let a = minutes(c.a); if (a <= de) a += MINUTES_PAR_JOUR;
      const n = Math.max(0, Math.floor(+c.n) || 0), vehicule = c.type === 'vl' ? 'vl' : 'camion';
      // Une vacation d'un plan calculé (§ 4) porte ses pauses : { du (minutes après son début), duree }, à
      // prendre entre deux tournées, au plus tard `retardPause` minutes après.
      const pauses = Array.isArray(c.pauses) ? c.pauses : [], retardPause = Math.max(0, +c.retardPause || 0);
      if (n > 0) for (const k of [-1, 0]) out.push({ creneau: i, de: de + k * MINUTES_PAR_JOUR, a: a + k * MINUTES_PAR_JOUR, n, vehicule, veille: k < 0, pauses, retardPause });
    });
    return out;
  }

  /*
   * LES CHAUFFEURS CALCULÉS AU PLUS JUSTE (banc d'essai, évolution 4 —
   * docs/BANC_ESSAI.md § 4). Le nombre de chauffeurs d'un handling 24 h/24 ne
   * se saisit pas : il dépend des avions à charger et à décharger. Le moteur
   * calcule le plus petit effectif qui sert toutes les tournées à l'heure, en
   * trois étapes : le besoin (les tournées placées dans leurs fenêtres pour
   * que le moins de chauffeurs soient occupés en même temps), les vacations
   * (le moins possible pour couvrir ce besoin), la vérification (la journée
   * jouée avec ce plan ; une vacation de plus là où un vol manque de
   * chauffeur). La journée y est circulaire : l'heure se lit modulo 24 h.
   */
  const VEHICULES = ['camion', 'vl'];
  const modJour = t => ((Math.floor(t) % MINUTES_PAR_JOUR) + MINUTES_PAR_JOUR) % MINUTES_PAR_JOUR;

  /** Les réglages du calcul des chauffeurs d'un handling, avec leurs valeurs par défaut (provisoires, à caler). */
  function reglagesChauffeurs(atelier, regimeGeneral) {
    const ch = (atelier && atelier.chauffeurs) || {};
    const n = (v, d, min) => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? d : Math.max(min, +v));
    // Une vacation dure la présence du régime (celle de l'équipe, si elle en a une) et porte ses pauses ;
    // le seuil d'une pause se compte en temps de service, les pauses d'avant comprises.
    const reg = normaliserRegime(atelier && atelier.regime && atelier.regime.actif !== false ? atelier.regime : undefined, regimeGeneral);
    const presence = Math.max(30, Math.min(MINUTES_PAR_JOUR, Math.round(reg.presence)));
    let avant = 0;
    const pauses = [];
    for (const x of reg.seuils) { const du = Math.round(x.apres + avant); if (du + x.duree <= presence) pauses.push({ du, duree: Math.round(x.duree) }); avant += x.duree; }
    const pas = Math.round(n(ch.pasDebut, 30, 5));
    const debuts = Array.isArray(ch.debutsPossibles) && ch.debutsPossibles.length
      ? [...new Set(ch.debutsPossibles.map(x => modJour(minutes(x))))].sort((x, y) => x - y)
      : Array.from({ length: Math.ceil(MINUTES_PAR_JOUR / pas) }, (_, i) => i * pas);
    return { presence, pauses, utile: presence - pauses.reduce((k, x) => k + x.duree, 0), debuts,
      retardPauseMax: Math.round(n(ch.retardPauseMax, 60, 0)), iterationsMax: Math.floor(n(ch.iterationsMax, 5, 0)),
      selonPreparation: ch.selonPreparation === true, sup: 0 };
  }

  /**
   * Étape 1, le besoin. Chaque départ a son chargement (un échange en escale
   * courte), chaque avion arrivé son déchargement, dans leurs fenêtres (§ 3) :
   *   — les vagues (évolution 8) : les départs d'une même compagnie et d'un
   *     même véhicule, dans l'ordre des départs, se regroupent jusqu'à
   *     `parTournee` vols par tournée (`volsCamion`, `volsVL`), si chacun reste
   *     dans sa fenêtre et si cela ne coûte pas de minutes-chauffeur de plus que
   *     des tournées séparées ; un vol qui ne tiendrait pas part dans une autre ;
   *   — les enchaînements : chaque déchargement, le plus pressé d'abord, suit
   *     le chargement compatible (même véhicule, fenêtres qui se rejoignent)
   *     qui ferme le plus tôt, si cela ne coûte pas de minutes-chauffeur de
   *     plus que deux tournées séparées ;
   *   — le placement : chaque tournée, la plus contrainte d'abord, prend dans
   *     sa fenêtre l'heure où elle fait le moins monter le nombre de chauffeurs
   *     occupés en même temps (puis la moins chargée, puis la plus tôt), dans
   *     la limite de la flotte, sur la journée circulaire, par véhicule. Un
   *     avion se décharge avant d'être rechargé : chaque tournée placée resserre
   *     la fenêtre de celle qui sert le même avion.
   * @param vols [{ id, b: besoin24h, pret }] (pret : null, jamais prêt ; absent : sans en tenir compte)
   * @param o { avance, entreAvions, dechargementsParTournee, flotte, chLong, chCourt, dureeMax }
   */
  function besoinDesTournees(vols, o) {
    const J = MINUTES_PAR_JOUR, entre = o.entreAvions, N = o.dechargementsParTournee;
    const kDe = b => (b.long ? o.chLong : o.chCourt);
    // Les vols à servir (un vol jamais prêt n'est pas chargé ; son avion se décharge quand même, sauf en escale courte),
    // et les avions à décharger à part.
    const servis = [], dechargements = [];
    vols.forEach((x, rang) => {
      const b = x.b;
      if (x.pret !== null) servis.push({ x, b, k: kDe(b), rang, pret: Number.isFinite(x.pret) ? x.pret : -Infinity, ouverture: b.depart - o.avance });
      if (!b.courte && b.arrivee != null) dechargements.push({ x, b, k: kDe(b), finMax: b.limite - b.charge });
    });
    // La forme d'une tournée qui sert la vague `v` (dans l'ordre des départs : un échange décharge puis charge le même
    // avion), puis décharge `suite` : ses chargements et déchargements, sa durée, ses chauffeurs, sa fenêtre de départ.
    // La préparation au quai et le vidage se comptent une fois, plus `quaiParVol` par vol de plus au quai de départ.
    const forme = (v, suite) => {
      const p = v[0].b, charges = [], decharges = [], fins = [];
      let h = p.quaiDepart + (v.length - 1) * p.quaiParVol + p.aller, es = -Infinity, ls = Infinity, k = 0, vidage = 0;
      v.forEach((c, i) => {
        if (i) h += entre;
        es = Math.max(es, c.pret);
        if (c.b.courte) {
          es = Math.max(es, Math.max(c.b.dispo, c.ouverture - c.b.dechargement) - h);
          h += c.b.dechargement; decharges.push({ x: c.x, fin: h });
          if (!vidage) vidage = c.b.quaiRetour;
          charges.push({ x: c.x, debut: h });
        } else if (v.length > 1 && c.b.arrivee != null) {
          // Dans une vague, l'avion déchargé à part l'est avant que la tournée parte (`avant` : 0), comme dans la journée jouée.
          es = Math.max(es, c.ouverture - h, c.b.dispo + c.b.dechargement);
          charges.push({ x: c.x, debut: h, avant: 0 });
        } else {
          es = Math.max(es, Math.max(c.ouverture, c.b.arrivee != null ? c.b.dispo + c.b.dechargement : -Infinity) - h);
          charges.push({ x: c.x, debut: h });
        }
        h += c.b.charge; ls = Math.min(ls, c.b.limite - h); k = Math.max(k, c.k);
      });
      for (const u of suite) {
        h += entre; es = Math.max(es, u.b.dispo - h);
        h += u.b.dechargement; ls = Math.min(ls, u.finMax - h); fins.push(h); k = Math.max(k, u.k);
      }
      const d = h + (suite.length ? suite[suite.length - 1].b.retour + vidage + suite.reduce((n, u) => n + u.b.quaiRetour, 0) : v[v.length - 1].b.retour + vidage);
      return { charges, decharges: decharges.concat(suite.map((u, i) => ({ x: u.x, fin: fins[i] }))), d, k, es, ls };
    };
    const seul = u => ({ d: u.b.aller + u.b.dechargement + u.b.retour + u.b.quaiRetour, k: u.k });
    const cle = x => String(x.id);
    // Les vagues : par compagnie et véhicule, dans l'ordre des départs, chaque vague prend les vols suivants qui tiennent.
    const parGroupe = new Map();
    for (const c of servis) { const g = c.b.cie + '|' + c.b.vehicule; if (!parGroupe.has(g)) parGroupe.set(g, []); parGroupe.get(g).push(c); }
    const vagues = [];
    for (const l of parGroupe.values()) {
      const libres = l.slice().sort((p, q) => p.b.depart - q.b.depart || cle(p.x).localeCompare(cle(q.x)));
      while (libres.length) {
        const v = [libres.shift()], n = v[0].b.parTournee;
        let f = forme(v, []);
        // Une vague tient dans sa fenêtre, se mène d'une traite (`dureeMax` : entre deux pauses d'une vacation), et ne coûte
        // pas plus de minutes-chauffeur que des tournées séparées.
        for (let i = 0; n > 1 && i < libres.length && v.length < n;) {
          const g = forme(v.concat([libres[i]]), []), s = forme([libres[i]], []);
          if (g.es <= g.ls + 1e-9 && g.d <= (o.dureeMax ?? Infinity) + 1e-9 && g.k * g.d <= f.k * f.d + s.k * s.d + 1e-9) { v.push(libres.splice(i, 1)[0]); f = g; } else i++;
        }
        vagues.push({ v, x: v[0].x, b: v[0].b, rang: v[0].rang, echange: v.some(c => c.b.courte), suite: [] });
      }
    }
    vagues.sort((p, q) => p.rang - q.rang);
    // Les enchaînements : derrière une vague sans échange.
    const chargements = vagues.filter(c => !c.echange);
    dechargements.sort((p, q) => p.finMax - q.finMax || p.b.dispo - q.b.dispo || cle(p.x).localeCompare(cle(q.x)));
    const enchaine = new Set();
    for (const u of dechargements) {
      let mieux = null;
      for (const c of chargements) {
        if (c.v.some(m => m.x === u.x) || c.b.vehicule !== u.b.vehicule || c.suite.length >= N) continue;
        const f = forme(c.v, c.suite.concat([u]));
        if (f.es > f.ls + 1e-9) continue;
        const avant = forme(c.v, c.suite), s = seul(u);
        if (f.k * f.d > avant.k * avant.d + s.k * s.d + 1e-9) continue;
        if (!mieux || f.ls < mieux.f.ls - 1e-9 || (Math.abs(f.ls - mieux.f.ls) <= 1e-9 && cle(c.x).localeCompare(cle(mieux.c.x)) < 0)) mieux = { c, f };
      }
      if (mieux) { mieux.c.suite.push(u); enchaine.add(u); }
    }
    // Un déchargement seul : il part à vide, pour arriver à l'avion quand il est là.
    const tourneeSeule = u => { const s = seul(u);
      return { quoi: 'decharge', v: u.b.vehicule, k: s.k, d: s.d, es: u.b.dispo - u.b.aller, ls: u.finMax - u.b.dechargement - u.b.aller,
        charges: [], decharges: [{ x: u.x, fin: u.b.aller + u.b.dechargement }] }; };
    const tournees = [];
    for (const c of vagues.filter(w => w.echange).concat(chargements)) {
      const f = forme(c.v, c.suite);
      const T = { quoi: c.echange ? 'echange' : c.suite.length ? 'enchainee' : 'charge', v: c.b.vehicule, k: f.k, d: f.d, es: f.es, ls: f.ls,
        charges: f.charges, decharges: f.decharges };
      // Si l'enchaînement ne tient plus une fois les autres tournées placées : les chargements seuls, et chaque déchargement à part.
      if (c.suite.length) { const g = forme(c.v, []); T.scinder = () => ({ charge: { quoi: 'charge', v: T.v, k: g.k, d: g.d, es: g.es, ls: g.ls, charges: T.charges, decharges: [] },
        seuls: c.suite.map(tourneeSeule) }); }
      tournees.push(T);
    }
    for (const u of dechargements) if (!enchaine.has(u)) tournees.push(tourneeSeule(u));
    // Le placement.
    const D = {}, V = {};
    for (const t of VEHICULES) { D[t] = new Float64Array(J); V[t] = new Float64Array(J); }
    const cleT = T => (T.charges[0] || T.decharges[0]).x.id;
    tournees.sort((p, q) => p.ls - q.ls || p.es - q.es || String(cleT(p)).localeCompare(String(cleT(q))));
    const debutCharge = new Map(), finDecharge = new Map();
    for (const T of tournees) {
      let es = T.es, ls = T.ls;
      for (const c of T.charges) if (finDecharge.has(c.x.id)) es = Math.max(es, finDecharge.get(c.x.id) - (c.avant ?? c.debut));
      for (const u of T.decharges) if (debutCharge.has(u.x.id)) ls = Math.min(ls, debutCharge.get(u.x.id) - u.fin);
      const lo = Math.ceil(es - 1e-9), hi = Math.max(lo, Math.floor(ls + 1e-9)), pas = hi - lo > 360 ? 5 : 1;
      const len = Math.max(1, Math.ceil(T.d - 1e-9)), d = D[T.v], v = V[T.v], flotte = o.flotte[T.v];
      let m = null;
      for (let s = lo; s <= hi; s += pas) {
        let pic = 0, aire = 0, sortis = 0;
        for (let i = 0; i < len; i++) { const j = modJour(s + i); if (d[j] > pic) pic = d[j]; aire += d[j]; if (v[j] > sortis) sortis = v[j]; }
        const ok = sortis + 1 <= flotte;
        // « au plus tôt » (o.placement === 'tot') : la première heure qui tient dans la flotte.
        if (o.placement === 'tot') { if (!m || (ok && !m.ok)) m = { s, ok, pic, aire }; if (ok) break; continue; }
        if (!m || (ok && !m.ok) || (ok === m.ok && (pic < m.pic || (pic === m.pic && aire < m.aire - 1e-9)))) m = { s, ok, pic, aire };
      }
      T.depart = m.s; T.retour = m.s + T.d;
      for (let i = 0; i < len; i++) { const j = modJour(m.s + i); d[j] += T.k; v[j] += 1; }
      for (const c of T.charges) debutCharge.set(c.x.id, m.s + (c.avant ?? c.debut));
      for (const u of T.decharges) finDecharge.set(u.x.id, m.s + u.fin);
    }
    return { tournees, D, V };
  }

  /**
   * La plus longue tournée qu'une vacation peut mener d'une traite : un chauffeur ne quitte pas une tournée en cours, et
   * prend chaque pause au plus tard `retardPauseMax` minutes après son seuil (évolution 8 : la durée d'une vague).
   */
  function dureeMenable(R) {
    let debut = 0, m = 0;
    for (const x of R.pauses) { m = Math.max(m, x.du + R.retardPauseMax - debut); debut = x.du + x.duree; }
    return Math.max(m, R.presence - debut);
  }

  /**
   * Étape 2, les vacations : couvrir le besoin avec le moins de vacations
   * possible. Une tournée ne se partage pas : chacun de ses chauffeurs la
   * mène d'un bout à l'autre, et une vacation porte ses pauses, prises entre
   * deux tournées dès qu'elles sont dues (au plus tard `retardPauseMax` après
   * leur seuil). Les tournées se donnent, dans l'ordre où l'étape 1 les a
   * placées, à des chauffeurs déjà en poste : chacune peut glisser dans sa
   * fenêtre jusqu'à l'heure où assez d'entre eux sont libres pour la mener et
   * la finir dans leur vacation (à heure égale, ceux dont la vacation finit le
   * plus tôt — la règle de la journée jouée). Seulement s'il n'y en a pas
   * assez avant la fin de sa fenêtre, on ouvre une vacation : celle qui
   * commence le plus tard possible avant elle. La journée est circulaire : on
   * la coupe là où il y a le moins de tournées, et une vacation qui passe la
   * coupure couvre aussi le début du tour suivant (on refait le tour jusqu'à
   * ce que ces vacations-là ne changent plus).
   * @param tournees [{ depart, d, k, es, ls, charges, decharges }] d'un type de véhicule
   * @returns { vacations: [{ s, pauses }], departs: Map tournée → heure de départ retenue }
   */
  function vacationsPourTournees(tournees, R, flotte = Infinity) {
    const J = MINUTES_PAR_JOUR;
    if (!tournees.length) return { vacations: [], departs: new Map(), chauffeurs: new Map(), horsVacations: new Set(), scindees: [], attendVehicule: new Set() };
    const occupe = new Float64Array(J);
    for (const T of tournees) for (let i = 0; i < Math.ceil(T.d - 1e-9); i++) occupe[modJour(T.depart + i)] += T.k;
    const coupes = R.debuts.slice().sort((x, y) => occupe[x] - occupe[y] || x - y).slice(0, 4);
    let mieux = null;
    for (const c of coupes) {
      const v = affecterTournees(tournees, R, c, flotte);
      if (!mieux || v.horsVacations.size < mieux.horsVacations.size || (v.horsVacations.size === mieux.horsVacations.size && v.vacations.length < mieux.vacations.length)) mieux = v;
    }
    return { vacations: mieux.vacations.map(v => ({ s: v.s, pauses: R.pauses.map(x => ({ ...x })) })).sort((x, y) => x.s - y.s), departs: mieux.departs,
      chauffeurs: mieux.chauffeurs, horsVacations: mieux.horsVacations, scindees: mieux.scindees, attendVehicule: mieux.attendVehicule };
  }
  function affecterTournees(tournees, R, c, flotte = Infinity) {
    const J = MINUTES_PAR_JOUR, P = R.presence;
    // Chaque tournée sur la journée coupée en c : `dec` ramène à l'heure réelle.
    const items = tournees.map((T, i) => { const u = modJour(T.depart - c), dec = T.depart - u; return { T, i, u, dec }; })
      .sort((x, y) => x.u - y.u || x.T.ls - y.T.ls || x.i - y.i);
    const debuts = [...new Set(R.debuts.map(x => modJour(x - c)))].sort((x, y) => x - y);
    const chauffeur = (sigma, rang) => ({ sigma, fin: sigma + P, libre: sigma, rang,
      pauses: R.pauses.map(x => ({ du: sigma + x.du, duree: x.duree, max: sigma + x.du + R.retardPauseMax, prise: null })) });
    // Ses pauses dues à l'heure t, prises dès qu'il est libre ; `essai` : sans rien changer.
    const prendre = (d, t, essai) => {
      let libre = d.libre;
      for (const x of d.pauses) { if (x.prise != null) continue; if (x.du > Math.max(libre, t) + 1e-9) break; const pr = Math.max(libre, x.du); libre = pr + x.duree; if (!essai) x.prise = pr; }
      if (!essai) d.libre = libre;
      return libre;
    };
    // Peut-il mener une tournée de t à f ? En poste, libre (pauses prises), fini dans sa vacation (ou dans
    // `sup` minutes d'heures sup), sa prochaine pause encore à temps. Le plan ne compte pas sur les heures sup.
    let sup = 0;
    const peut = (d, t, f) => {
      if (d.sigma > t + 1e-9 || t >= d.fin - 1e-9 || f > d.fin + sup + 1e-9) return false;
      let libre = d.libre, prochaine = null;
      for (const x of d.pauses) { if (x.prise != null) continue; if (x.du > Math.max(libre, t) + 1e-9) { prochaine = x; break; } libre = Math.max(libre, x.du) + x.duree; }
      return libre <= t + 1e-9 && (!prochaine || f <= prochaine.max + 1e-9);
    };
    const ordre = f => (x, y) => ((f > x.fin + 1e-9) - (f > y.fin + 1e-9)) || x.fin - y.fin || x.rang - y.rang;
    const tour = fantomes => {
      const tous = fantomes.map((g, i) => ({ ...g, pauses: g.pauses.map(x => ({ ...x })), rang: -1 - i }));
      const nouvelles = [], departs = new Map(), menees = new Map(), horsVacations = new Set(), debutCharge = new Map(), finDecharge = new Map();
      // Les véhicules sortis, minute par minute (journée circulaire) : une tournée ne part que s'il en reste un.
      const sortis = new Float64Array(J);
      const vehiculeLibre = (t, d) => { if (!Number.isFinite(flotte)) return true; for (let i = 0; i < Math.max(1, Math.ceil(d - 1e-9)); i++) if (sortis[modJour(t + c + i)] + 1 > flotte) return false; return true; };
      // Les enchaînements scindés dans ce tour : la tournée garde son chargement seul, ses déchargements partent à part.
      const scindees = [], formeDe = new Map(), attendVehicule = new Set();
      const placer = it => {
        const T = formeDe.get(it.T) || it.T, dec = it.dec;
        let es = T.es - dec, ls = T.ls - dec;
        for (const x of T.charges) if (finDecharge.has(x.x.id)) es = Math.max(es, finDecharge.get(x.x.id) - (x.avant ?? x.debut) - dec);
        for (const x of T.decharges) if (debutCharge.has(x.x.id)) ls = Math.min(ls, debutCharge.get(x.x.id) - x.fin - dec);
        // Un enchaînement qui ne tient plus (son déchargement finirait trop tard) : le chargement seul, et le
        // déchargement à part, placé tout de suite.
        if (ls < es - 1e-9 && T.scinder) {
          const { charge, seuls } = T.scinder();
          formeDe.set(it.T, charge); scindees.push({ T: it.T, charge, seuls });
          for (const u of seuls) placer({ T: u, i: -1, u: it.u, dec });
          return placer(it);
        }
        if (ls < es) ls = es;
        // La flotte : si tous les véhicules sont dehors pendant toute la fenêtre, la tournée attend qu'un rentre.
        if (Number.isFinite(flotte) && ![es, ls].some(h => vehiculeLibre(h, T.d))) {
          let h = es; for (let n = 0; n < J && !vehiculeLibre(h, T.d); n++) h++;
          if (h > ls + 1e-9) attendVehicule.add(it.T);
          es = ls = h;
        }
        // Les heures où un chauffeur se libère dans la fenêtre (après sa tournée, ou sa pause) : la plus tôt où il y en a assez.
        const heures = [es];
        for (const d of tous) {
          const l = prendre(d, es, true); if (l > es && l <= ls + 1e-9) heures.push(l);
          if (d.sigma > es && d.sigma <= ls + 1e-9) heures.push(d.sigma);
          for (const x of d.pauses) if (x.prise == null) { const apres = Math.max(l, x.du) + x.duree; if (apres > es && apres <= ls + 1e-9) heures.push(apres); }
        }
        heures.sort((x, y) => x - y);
        let t = null, pris = null, meilleur = null;
        for (const h of heures) {
          if (!vehiculeLibre(h, T.d)) continue;
          const ok = tous.filter(d => peut(d, h, h + T.d));
          if (ok.length >= T.k) { t = h; pris = ok.sort(ordre(h + T.d)).slice(0, T.k); break; }
          if (ok.length && (!meilleur || ok.length > meilleur.ok.length)) meilleur = { h, ok };
        }
        if (t == null) {
          // Pas assez de chauffeurs en poste : des vacations nouvelles, qui commencent le plus tard possible
          // avant la tournée et peuvent la mener (finie dans la vacation, pauses comprises). La tournée glisse
          // dans sa fenêtre, au plus près de l'heure prévue, jusqu'à une heure où c'est possible ; les chauffeurs
          // déjà en poste qui le peuvent à cette heure-là en sont.
          const voulu = Math.min(Math.max(it.u, es), ls);
          const tous3 = debuts.concat(debuts.map(x => x - J), debuts.map(x => x + J)).sort((x, y) => x - y);
          const sigmaPour = h => { for (let i = tous3.length - 1; i >= 0; i--) { const sg = tous3[i]; if (sg <= h + 1e-9 && peut(chauffeur(sg, 0), h, h + T.d)) return sg; } return null; };
          const essais = [voulu, es, ls, ...(meilleur ? [meilleur.h] : []), ...tous3.flatMap(sg => [sg, sg + P - T.d, ...R.pauses.flatMap(x => [sg + x.du + x.duree, sg + x.du + R.retardPauseMax - T.d])])]
            .filter(h => h >= es - 1e-9 && h <= ls + 1e-9);
          // La flotte : pas une heure où tous les véhicules sont dehors, s'il y en a une autre.
          if (Number.isFinite(flotte) && essais.some(h => vehiculeLibre(h, T.d))) for (let i = essais.length - 1; i >= 0; i--) if (!vehiculeLibre(essais[i], T.d)) essais.splice(i, 1);
          const parProximite = [...new Set(essais)].sort((x, y) => Math.abs(x - voulu) - Math.abs(y - voulu) || x - y);
          let choix = null;
          const chercher = () => {
            for (const h of parProximite) {
              const ok = tous.filter(d => peut(d, h, h + T.d)).sort(ordre(h + T.d));
              if (ok.length >= T.k) return { h, ok };
              const sg = sigmaPour(h); if (sg == null) continue;
              if (!choix || ok.length > choix.ok.length) choix = { h, sg, ok };
              if (ok.length >= T.k - 1) break;
            }
            return choix;
          };
          choix = chercher();
          // Aucune vacation ne la contient : seulement alors, un chauffeur la finit en heures sup, si elles sont permises.
          if (!choix && R.sup > 0) { sup = R.sup; choix = chercher(); sup = 0; }
          // Aucune vacation ne peut la mener dans sa fenêtre (elle chevauche la fin de toutes, et sa fenêtre est
          // trop courte pour glisser) : elle part en retard, dès qu'un chauffeur le peut — la journée jouée fera
          // de même, sans prendre les chauffeurs prévus pour d'autres. Elle est comptée « hors vacations ».
          if (!choix) {
            horsVacations.add(it.T);
            const apres = new Set(tous3.flatMap(sg => [sg, ...R.pauses.map(x => sg + x.du + x.duree)]));
            for (const d of tous) { const l = prendre(d, ls, true); apres.add(l); for (const x of d.pauses) if (x.prise == null) apres.add(Math.max(l, x.du) + x.duree); }
            for (const h of [...apres].filter(h => h > ls + 1e-9 && h <= ls + J).sort((x, y) => x - y)) {
              if (!vehiculeLibre(h, T.d)) continue;
              const ok = tous.filter(d => peut(d, h, h + T.d)).sort(ordre(h + T.d));
              if (ok.length >= T.k) { choix = { h, ok }; break; }
              const sg = sigmaPour(h); if (sg != null) { choix = { h, sg, ok }; break; }
            }
            if (!choix) { departs.set(it.T, voulu + dec); return; }
          }
          t = choix.h; pris = choix.ok.slice(0, T.k);
          while (pris.length < T.k) { const d = chauffeur(choix.sg, nouvelles.length); tous.push(d); nouvelles.push(d); pris.push(d); }
          sup = 0;
        }
        for (const d of pris) { prendre(d, t); d.libre = t + T.d; }
        for (let i = 0; i < Math.max(1, Math.ceil(T.d - 1e-9)); i++) sortis[modJour(t + c + i)]++;
        departs.set(it.T, t + dec); menees.set(it.T, pris.map(d => ({ d, dec })));
        for (const x of T.charges) debutCharge.set(x.x.id, t + dec + (x.avant ?? x.debut));
        for (const x of T.decharges) finDecharge.set(x.x.id, t + dec + x.fin);
      };
      for (const it of items) placer(it);
      return { nouvelles, departs, menees, horsVacations, scindees, attendVehicule, fantomes: tous.filter(d => d.rang < 0) };
    };
    // Le premier tour, sans rien de la veille ; puis ce qui passe la coupure couvre le début du tour suivant.
    let avant = tour([]), retenu = avant;
    const cle = l => l.nouvelles.filter(d => d.fin > J + 1e-9).map(d => d.sigma).sort((x, y) => x - y).join(',');
    for (let k = 0; k < 4; k++) {
      const fantomes = avant.nouvelles.filter(d => d.fin > J + 1e-9).map(d => ({ sigma: d.sigma - J, fin: d.fin - J, libre: d.libre - J,
        pauses: d.pauses.map(x => ({ du: x.du - J, duree: x.duree, max: x.max - J, prise: x.prise == null ? null : x.prise - J })) }));
      const n = tour(fantomes);
      // Un tour juste : les vacations qui passent la coupure sont celles qu'il a supposées.
      if (cle(n) === cle(avant)) { if (n.nouvelles.length <= retenu.nouvelles.length) retenu = n; break; }
      avant = n;
    }
    // Qui mène chaque tournée : la vacation (son heure de début, son rang parmi celles de la même heure, son
    // jour : 0, ou −1 pour celle de la veille). Un fantôme est une vacation de ce tour qui passe la coupure.
    const rangDe = new Map(), parDebut = new Map();
    for (const d of retenu.nouvelles) { const sDeb = modJour(d.sigma + c); const n = parDebut.get(sDeb) || 0; rangDe.set(d, n); parDebut.set(sDeb, n + 1); }
    const fantomeVers = new Map(), passent = retenu.nouvelles.filter(d => d.fin > J + 1e-9);
    for (const g of (retenu.fantomes || [])) { const i = passent.findIndex(d => Math.abs(d.sigma - J - g.sigma) < 1e-9 && ![...fantomeVers.values()].includes(d)); if (i >= 0) fantomeVers.set(g, passent[i]); }
    const chauffeurs = new Map();
    for (const [T, l] of retenu.menees) chauffeurs.set(T, l.map(({ d, dec }) => {
      const v = d.rang < 0 ? fantomeVers.get(d) : d; if (!v) return null;
      const abs = d.sigma + dec, sDeb = modJour(abs);
      return { s: sDeb, rang: rangDe.get(v), jour: Math.round((abs - sDeb) / J) };
    }));
    return { vacations: retenu.nouvelles.map(d => ({ s: modJour(d.sigma + c) })), departs: retenu.departs, chauffeurs, horsVacations: retenu.horsVacations,
      scindees: retenu.scindees, attendVehicule: retenu.attendVehicule };
  }

  /**
   * La borne basse d'un besoin (des chauffeurs, minute par minute, sur la journée circulaire) : son pic ; ses
   * minutes-chauffeur ÷ les minutes utiles d'une vacation ; et, une vacation ne pouvant contenir deux instants
   * distants d'une présence entière, le plus grand besoin cumulé en ⌊24 h ÷ présence⌋ instants ainsi espacés.
   */
  function borneBasse(D, R) {
    let pic = 0, minutesBesoin = 0;
    for (const x of D) { if (x > pic) pic = x; minutesBesoin += x; }
    pic = Math.ceil(pic - 1e-9);
    const parHeures = R.utile > 0 ? Math.ceil(minutesBesoin / R.utile - 1e-9) : 0;
    const m = Math.max(1, Math.floor(MINUTES_PAR_JOUR / R.presence));
    let instants = 0;
    for (let x = 0; x < MINUTES_PAR_JOUR; x++) { let n = 0; for (let i = 0; i < m; i++) n += D[modJour(x + i * R.presence)]; if (n > instants) instants = n; }
    instants = Math.ceil(instants - 1e-9);
    return { pic, minutes: minutesBesoin, parHeures, instants, chauffeurs: Math.max(pic, parHeures, instants) };
  }

  /*
   * LA PLONGE PAR VOL (retour d'usage du 28/09).
   *
   * « Le débit d'un tunnel se parle en vol : un tunnel lave un vol en tant de
   * temps. » Une plonge `parVol` lave les vols qui reviennent (sens RET), dans
   * l'ordre de leur retour ; chaque tunnel qui tourne en prend un, pour la
   * durée de sa compagnie (`durees`, « * » pour toutes). Le matériel du vol
   * est propre quand il sort du tunnel.
   */
  function dureeLavageVol(atelier, cie) { return dureeHandling(atelier, cie); }
  /** La vitesse d'un tunnel par rapport à un tunnel normal (1) : 2 lave deux fois plus vite. */
  function vitesseTunnel(tunnel) { const v = +(tunnel && tunnel.vitesse); return Number.isFinite(v) && v > 0 ? v : 1; }

  /*
   * LES TUNNELS SONT DES MACHINES (retour d'usage du 15/10 : « l'équipe de plonge
   * fait l'après-midi, j'ajoute celle du matin »). Deux équipes d'une même plonge
   * qui ont un tunnel du même nom parlent de la même machine : quand leurs postes
   * se chevauchent, il ne lave qu'un vol à la fois, pour l'une ou pour l'autre.
   * Dans une même équipe, deux tunnels du même nom restent deux machines ; une
   * équipe sans liste de tunnels a le sien, à elle seule. Une seule équipe, ou des
   * noms différents : rien ne change.
   *
   * Rend la clé de machine de chaque tunnel de `tournent` (ceux qui tournent).
   */
  function machinesDesTunnels(equipe, tournent) {
    const liste = equipe && Array.isArray(equipe.tunnels) && equipe.tunnels.length ? equipe.tunnels : null;
    const vus = new Map();
    return tournent.map((t, i) => {
      if (!liste) return 'equipe:' + (equipe && equipe.id) + '#' + i;
      const nom = String((t && t.nom) || '').trim().toLowerCase().replace(/\s+/g, ' ') || 'tunnel ' + (liste.indexOf(t) + 1);
      const k = vus.get(nom) || 0; vus.set(nom, k + 1);
      return 'tunnel:' + nom + '#' + k;
    });
  }

  /** Les compagnies qu'un handling charge, ou null pour toutes. */
  function compagniesDe(atelier) {
    const l = Array.isArray(atelier && atelier.compagnies) ? atelier.compagnies.map(x => String(x).trim().toUpperCase()).filter(Boolean) : [];
    return l.length ? new Set(l) : null;
  }

  /*
   * LES VAGUES D'UNE MISE À DISPOSITION (retour d'usage du 28/09).
   *
   * La légumerie, le magasin, la réception travaillent POUR TOUTES LES
   * COMMANDES À LA FOIS, en plusieurs vagues dans la journée (ex. J-1 14:00,
   * puis J 04:00). Chaque commande prend la vague qui précède son besoin —
   * l'heure où l'étape d'après commence à l'attendre ; faute de vague avant,
   * la première, et l'étape d'après l'attend.
   *
   *   vagues — [{ debut: 'HH:MM', jour: 0 | -1 … }] ; sans elles, `debut`/`jour`
   */
  function vaguesDe(atelier) {
    if (!atelier || atelier.permanent !== false) return [];
    const liste = Array.isArray(atelier.vagues) && atelier.vagues.length ? atelier.vagues : [{ debut: atelier.debut, jour: atelier.jour }];
    return [...new Set(liste.map(v => minutes(v.debut) + (v.jour || 0) * MINUTES_PAR_JOUR))].sort((a, b) => a - b);
  }

  /**
   * Le débit d'un robot pour une compagnie × classe, en plateaux par heure :
   * le sien (`debits['TX/YC']`), sinon celui du robot (`debit`). Comme les
   * man-minutes d'une équipe, chaque commande peut avoir le sien.
   */
  function debitRobot(atelier, classeId) {
    const propre = atelier && atelier.debits ? +atelier.debits[classeId] : NaN;
    return Number.isFinite(propre) && propre > 0 ? propre : +((atelier && atelier.debit) || 0);
  }

  /*
   * UNE MISE À DISPOSITION OUVERTE COMME UNE BOUTIQUE (retour d'usage du 28/09).
   *
   * « La légumerie, les appros et le magasin sont libres en permanence entre
   * une heure et une heure : ce sont comme des boutiques. » Chaque jour, de
   * `ouverture.de` à `ouverture.a` (ex. 07:00–18:00), on y est servi à l'instant
   * où on vient ; en dehors, l'étape qui en a besoin attend l'ouverture. Une
   * plage qui passe minuit (22:00–06:00) est permise.
   */
  function ouvertureDe(atelier) {
    const o = atelier && atelier.type === 'dispo' && atelier.permanent !== false && atelier.ouverture;
    if (!o) return null;
    const de = minutes(o.de), a = minutes(o.a);
    return de === a ? null : { de, a };
  }

  /** L'instant où une boutique sert, à partir de `t` : `t` si elle est ouverte, sinon son ouverture suivante. */
  function prochaineOuverture(atelier, t) {
    const o = ouvertureDe(atelier); if (!o) return t;
    const d = Math.floor(t / MINUTES_PAR_JOUR);
    let mieux = Infinity;
    for (let k = d - 1; k <= d + 1; k++) {
      const debut = k * MINUTES_PAR_JOUR + o.de;
      const fin = k * MINUTES_PAR_JOUR + o.a + (o.a < o.de ? MINUTES_PAR_JOUR : 0);
      if (t >= debut && t < fin) return t;
      if (debut > t) mieux = Math.min(mieux, debut);
    }
    return mieux;
  }

  /** Heure à partir de laquelle une mise à disposition sert, en minutes : sa première vague. */
  function disponibleDes(atelier) {
    if (atelier.permanent !== false) return -Infinity;   // toujours servi
    return vaguesDe(atelier)[0];
  }

  /**
   * Débit d'un atelier de lavage : la SOMME des débits de ses tunnels actifs.
   * Un tunnel à l'arrêt ne lave rien — c'est ce qui permet d'essayer une panne
   * sans effacer sa description. Un atelier sans liste de tunnels retombe sur
   * son débit global, pour les saisies antérieures.
   */
  /**
   * Deux débits, et il faut les deux.
   *
   *   • celui de CHAQUE TUNNEL — une ligne vaut ce qu'elle vaut ;
   *   • celui de L'ENSEMBLE — un plafond, facultatif, que la plonge ne dépasse
   *     pas quoi qu'on ajoute : ce qui est partagé entre les lignes (le côté
   *     sale, le séchage, le retour des paniers) les bride toutes ensemble.
   *
   * Sans le plafond, ajouter un quatrième tunnel augmentait le débit sans fin,
   * ce qu'aucune plonge ne fait. Sans les débits par tunnel, on ne saurait pas
   * ce que coûte l'arrêt d'une ligne. Le débit retenu est le plus petit des deux.
   */
  function tunnelsQuiTournent(atelier) {
    const plafond = Number.isFinite(+(atelier || {}).plafond) && +atelier.plafond > 0
      ? +atelier.plafond : Infinity;
    const t = atelier && atelier.tunnels;
    if (!Array.isArray(t) || !t.length) {
      const seul = (atelier && atelier.debit) || 0;
      return { tournent: [], sansPersonne: [], reste: 0, somme: seul, plafond,
        debit: Math.min(seul, plafond), bride: seul > plafond };
    }
    // Les tunnels sont servis dans l'ordre où ils sont décrits. Ce n'est pas
    // arbitraire : c'est à vous de mettre en tête ceux qu'on allume d'abord.
    let reste = Number.isFinite(+atelier.personnes) ? Math.max(0, +atelier.personnes) : 0;
    const tournent = [], sansPersonne = [];
    for (const x of t) {
      if (!x || x.actif === false) continue;
      const n = Number.isFinite(+x.personnes) ? Math.max(0, +x.personnes) : 0;
      if (n > reste) { sansPersonne.push(x); continue; }
      reste -= n; tournent.push(x);
    }
    const somme = tournent.reduce((n, x) => n + (+x.debit || 0), 0);
    return { tournent, sansPersonne, reste, somme, plafond,
      debit: Math.min(somme, plafond), bride: somme > plafond };
  }

  function debitLavage(atelier) {
    return tunnelsQuiTournent(atelier).debit;
  }

  /**
   * Relit une liste d'ateliers et rassemble TOUTES les anomalies, plutôt que
   * de s'arrêter à la première : on veut pouvoir tout corriger d'un coup.
   */
  function validerAteliers(ateliers, contexte) {
    const c = contexte || {};
    const services = new Set(c.services || []);
    const classes = new Set((c.classes || []).map(x => (typeof x === 'string' ? x : x.id)));
    // Un service se dit par son nom, pas par son identifiant.
    const nomSvc = id => (c.noms && c.noms[id]) || id;
    const anomalies = [], ids = new Set();

    if (!Array.isArray(ateliers)) return [{ code: 'liste', message: 'Liste d’ateliers attendue.' }];

    for (const a of ateliers) {
      const ou = (a && a.nom) || (a && a.id) || 'atelier sans nom';
      const dire = (code, message) => anomalies.push({ code, atelier: a && a.id, message: ou + ' : ' + message });

      if (!a || typeof a !== 'object') { anomalies.push({ code: 'atelier', message: 'Atelier invalide.' }); continue; }
      if (typeof a.id !== 'string' || !a.id) dire('id', 'identifiant manquant.');
      else if (ids.has(a.id)) dire('id', 'identifiant en double.'); else ids.add(a.id);
      if (typeof a.nom !== 'string' || !a.nom.trim()) dire('nom', 'nommez-le : c’est ce qui le rend lisible.');
      if (services.size && !services.has(a.service)) dire('service', 'service inconnu « ' + nomSvc(a.service) + ' ».');
      if (a.type !== undefined && !TYPES.includes(a.type)) dire('type', 'type inconnu « ' + a.type + ' ».');

      const robot = a.type === 'robot', lavage = a.type === 'lavage', dispo = a.type === 'dispo', handling = a.type === 'handling', appui = a.type === 'appui';
      // Une mise à disposition permanente n'a pas d'heure : lui en réclamer une
      // serait inventer une contrainte qu'elle n'a pas.
      if (!(dispo && a.permanent !== false)) {
        try { minutes(a.debut); } catch (e) { dire('debut', e.message); }
      }
      if (dispo && a.permanent === false && Array.isArray(a.vagues)) {
        for (const v of a.vagues) { try { minutes(v && v.debut); } catch (e) { dire('vague', 'vague : ' + e.message); } }
      }
      if (dispo && a.permanent !== false && a.ouverture) {
        try { if (minutes(a.ouverture.de) === minutes(a.ouverture.a)) dire('ouverture', 'l’ouverture et la fermeture sont à la même heure.'); }
        catch (e) { dire('ouverture', 'heures d’ouverture : ' + e.message); }
      }
      const gens = a.personnes;
      // Une mise à disposition n'a pas d'effectif : elle ne fabrique pas.
      if (dispo) { /* ni personnes, ni lots, ni barème */ }
      else if (!Number.isInteger(gens) || gens < 0) dire('personnes', 'nombre de personnes entier attendu.');
      // Le handling a une durée par vol, pas des man-minutes : son effectif ne compte pas.
      else if (!robot && !handling && !appui && gens === 0) dire('sans-personne', 'sans personne, rien n’est fabriqué.');

      if (lavage) {
        const tunnels = Array.isArray(a.tunnels) ? a.tunnels : null;
        if (!a.parVol && tunnels && tunnels.some(t => !(+t.debit > 0)))
          dire('tunnel', 'chaque tunnel attend un débit, en unités par heure.');
        // Un tunnel sans personne pour le tenir ne tourne pas. Additionner
        // les débits sans se demander s'il y a les gens donnerait une plonge
        // deux fois trop rapide, et on ne saurait pas pourquoi.
        const etat = tunnelsQuiTournent(a);
        if (etat.sansPersonne.length) {
          dire('tunnel-personnes', etat.sansPersonne.length + (etat.sansPersonne.length > 1 ? ' tunnels' : ' tunnel') + ' sans personne pour les tenir — '
            + etat.sansPersonne.map(t => t.nom || 'sans nom').join(', ')
            + '. Ils ne tournent pas. Ajoutez du monde ou arrêtez-les.');
        }
        if (a.parVol) { if (tunnels && tunnels.length && !etat.tournent.length) dire('plonge-arret', 'aucun tunnel ne tourne : rien n’est lavé.'); }
        else if (!(etat.debit > 0)) dire(tunnels && tunnels.length ? 'plonge-arret' : 'debit', tunnels && tunnels.length
          ? 'aucun tunnel ne tourne : rien n’est lavé.'
          : 'débit attendu, en unités de matériel par heure.');
      }
      if (robot) {
        // Un débit pour le robot, ou un pour chacune de ses commandes.
        const siennes = (a.lots || []).flatMap(l => (Array.isArray(l) ? l : (l && l.classes) || []));
        if (!(a.debit > 0) && !(siennes.length && siennes.every(id => debitRobot(a, id) > 0)))
          dire('debit', 'débit attendu, en plateaux par heure.');
        const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
        if (!Number.isInteger(mini) || mini < 0) dire('personnesMin', 'effectif minimum entier attendu.');
        else if (Number.isInteger(gens) && gens < mini)
          dire('robot-arret', gens + (gens > 1 ? ' personnes' : ' personne') + ' pour un minimum de ' + mini + ' : le robot ne tourne pas.');
      }

      for (const p of (a.pauses || [])) {
        try {
          if (minutes(p.de) >= minutes(p.a)) dire('pause', 'une pause doit finir après avoir commencé.');
        } catch (e) { dire('pause', e.message); }
      }

      // Un atelier sans lot, ou un lot encore vide, c'est une saisie en cours :
      // on le signale sans empêcher le reste de la journée d'être calculé. Un
      // atelier de lavage, lui, n'a pas de lots : son travail vient des retours.
      if (lavage || dispo || handling || appui) { /* rien à exiger : aucun ne suit une liste de commandes */ }
      else if (!Array.isArray(a.lots) || !a.lots.length) { if (!a.sansVolCeJour) dire('lots', 'ne fabrique rien pour l’instant.'); }
      else for (const lot of (a.lots || [])) {
        const liste = Array.isArray(lot) ? lot : (lot && lot.classes);
        if (!Array.isArray(liste) || !liste.length) { dire('lot-vide', 'une ligne de fabrication est encore vide.'); continue; }
        for (const id of liste) if (classes.size && !classes.has(id)) dire('lot', 'compagnie × classe inconnue : ' + id + '.');
      }
    }

    // Une mise à disposition sert TOUTES les classes de son service, et tout de
    // suite. Un autre atelier dans le même service ne serait donc jamais
    // attendu : son travail ne compterait pour personne.
    const avecDispo = new Set(ateliers.filter(a => a && a.type === 'dispo').map(a => a.service));
    for (const a of ateliers) {
      if (!a || a.type === 'dispo' || !avecDispo.has(a.service)) continue;
      anomalies.push({ code: 'dispo', atelier: a.id,
        message: (a.nom || a.id) + ' : « ' + nomSvc(a.service) + ' » est déjà une mise à disposition. '
          + 'Elle sert tout, tout de suite : ce que fabrique cet atelier ne serait attendu par personne.' });
    }

    // Une même classe fabriquée deux fois dans le même service : sans règle de
    // répartition, le modèle ne peut pas trancher. On le dit plutôt que de choisir.
    const vu = new Map();
    for (const a of ateliers) {
      if (!a || !a.service) continue;
      for (const lot of (a.lots || [])) {
        for (const id of (Array.isArray(lot) ? lot : (lot && lot.classes) || [])) {
          const cle = a.service + '|' + id, premier = vu.get(cle);
          if (premier && premier !== a.id) {
            anomalies.push({ code: 'doublon', atelier: a.id,
              message: enClair(id) + ' est préparée deux fois dans « ' + nomSvc(a.service) + ' ». Un service, une commande, une case.' });
          } else vu.set(cle, a.id);
        }
      }
    }

    // Une plonge lave d'une seule façon, par vol ou au débit (15/10) : des équipes
    // mêlées laveraient deux fois le même matériel.
    const plonges = new Map();
    for (const a of ateliers) if (a && a.type === 'lavage') (plonges.get(a.service) || plonges.set(a.service, []).get(a.service)).push(a);
    for (const [s, eq] of plonges) {
      const parVol = eq.filter(a => a.parVol), debit = eq.filter(a => !a.parVol);
      if (!parVol.length || !debit.length) continue;
      const noms = l => l.map(a => '« ' + (a.nom || a.id) + ' »').join(', ');
      anomalies.push({ code: 'plonge-mixte', atelier: debit[0].id, service: s,
        message: '« ' + nomSvc(s) + ' » ne lave pas d’une seule façon : ' + noms(parVol) + ' par vol, ' + noms(debit) + ' au débit. '
          + 'Le même matériel serait lavé deux fois : choisissez la même façon pour toutes ses équipes (« Comment se compte le lavage ? »).' });
    }
    return anomalies;
  }

  /* ======================================================================
   *  6. TRAVAIL DANS LE TEMPS — pauses
   * ====================================================================*/

  /** Pauses triées et fusionnées, en minutes absolues du jour de l'atelier. */
  function pausesDe(atelier) {
    const j = (atelier.jour || 0) * MINUTES_PAR_JOUR;
    const brutes = (atelier.pauses || [])
      .map(p => ({ de: minutes(p.de) + j, a: minutes(p.a) + j }))
      .filter(p => p.a > p.de)
      .sort((x, y) => x.de - y.de);
    const out = [];
    for (const p of brutes) {
      const dernier = out[out.length - 1];
      if (dernier && p.de <= dernier.a) dernier.a = Math.max(dernier.a, p.a);
      else out.push({ ...p });
    }
    return out;
  }

  /*
   * LA LIGNE ROBOT (retour d'usage du 29/09) : « le robot est une seule ligne
   * physique, partagée par l'équipe du matin et celle de l'après-midi, avec
   * une pause entre 12:15 et 13:00 ». Les cases Robot d'un même service
   * tournent sur UNE ligne : un lot à la fois, quelle que soit l'équipe. Une
   * case `lignePropre` a sa propre machine (un second robot).
   * `arretsLigne` : les arrêts de la machine ([{de, a}], chaque jour) ; ceux
   * de toutes les cases de la ligne s'appliquent à toutes.
   */
  const cleLigne = a => (a.lignePropre ? 'robot:' + a.id : 'robot:' + a.service);
  function arretsDeLigne(robots) {
    const out = [];
    for (const r of robots) for (const x of (Array.isArray(r.arretsLigne) ? r.arretsLigne : [])) {
      let de, fin;
      try { de = minutes(x.de); fin = minutes(x.a); } catch (e) { continue; }
      if (!(fin > de)) continue;
      // Chaque jour où une équipe peut travailler (J-3 … J).
      for (let j = -3; j <= 0; j++) out.push({ de: de + j * MINUTES_PAR_JOUR, a: fin + j * MINUTES_PAR_JOUR });
    }
    return out;
  }
  /** Des pauses triées et fusionnées, quelle que soit leur provenance. */
  function fusionnerPauses(listes) {
    const out = [];
    for (const p of listes.flat().filter(p => p.a > p.de).sort((x, y) => x.de - y.de)) {
      const d = out[out.length - 1];
      if (d && p.de <= d.a) d.a = Math.max(d.a, p.a); else out.push({ ...p });
    }
    return out;
  }

  /**
   * Instant d'achèvement d'une tâche de `duree` minutes de travail effectif
   * commencée à `depart`, en sautant les pauses. Retourne aussi le temps passé
   * à l'arrêt : c'est ce qui explique un écart entre durée et temps écoulé.
   */
  function finAvecPauses(depart, duree, pauses) {
    let t = depart, reste = duree, arret = 0;
    if (reste <= 0) return { fin: t, arret: 0 };
    for (let garde = 0; garde < 1000; garde++) {
      const p = pauses.find(p => t >= p.de && t < p.a);
      if (p) { arret += p.a - t; t = p.a; continue; }
      const suivante = pauses.find(p => p.de > t);
      const dispo = suivante ? suivante.de - t : Infinity;
      if (reste <= dispo) return { fin: t + reste, arret };
      reste -= dispo; t = suivante.a; arret += suivante.a - suivante.de;
    }
    throw new Error('Trop de pauses pour achever une tâche.');
  }

  /* ----------------------------------------------------------------------
   *  RÉGIME DE POSTE
   *  Une équipe ne travaille pas huit heures d'affilée. Elle prend une pause
   *  après un certain temps de TRAVAIL cumulé — pas après une heure fixe —
   *  et son poste a une durée de présence totale au bout de laquelle elle
   *  s'en va, que le travail soit fini ou non. C'est cette dernière règle qui
   *  fait apparaître ce qui ne rentre pas dans la journée.
   * --------------------------------------------------------------------*/

  /** 8 h de présence, dont 1 h de pause : 3 h de travail, 15 min de pause, 3 h,
   *  45 min de pause, puis la dernière heure — 7 h de travail (retour d'usage du
   *  06/10 ; c'était 8 h 15, avec 15 min après 3 h et 30 min après 6 h). */
  const REGIME_DEFAUT = {
    actif: true,
    seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 45 }],
    presence: 480
  };
  /** Les règles par défaut d'avant : une sauvegarde qui en porte une telle quelle
   *  passe à la nouvelle (8 h 15 jusqu'au 05/10 ; 8 h avec 1 h d'un bloc, le 06/10). */
  const REGIMES_AVANT = [
    { seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }], presence: 495 },
    { seuils: [{ apres: 240, duree: 60 }], presence: 480 }
  ];


  /**
   * @param regime le régime propre à un atelier ; `false` ou `{actif:false}`
   *   le désactive complètement.
   * @param defaut le régime de la maison, réglé une fois pour toutes. Un
   *   atelier qui ne fixe ni seuils ni présence le suit — c'est ce qui permet
   *   de changer la règle commune sans rouvrir chaque fiche.
   */
  function normaliserRegime(regime, defaut) {
    if (regime === false || (regime && regime.actif === false)) return { actif: false, seuils: [], presence: Infinity };
    const d = { ...REGIME_DEFAUT, ...(defaut || {}) };
    const r = regime || {};
    const seuils = (Array.isArray(r.seuils) ? r.seuils : d.seuils)
      .map(s => ({ apres: +s.apres, duree: +s.duree }))
      .filter(s => Number.isFinite(s.apres) && s.apres >= 0 && Number.isFinite(s.duree) && s.duree > 0)
      .sort((a, b) => a.apres - b.apres);
    const presence = Number.isFinite(+r.presence) ? +r.presence
      : Number.isFinite(+d.presence) ? +d.presence : REGIME_DEFAUT.presence;
    return { actif: true, seuils, presence };
  }

  /**
   * Exécute `duree` minutes de travail à partir de `depart`, en respectant
   * les pauses fixes, les pauses de régime et la fin du poste.
   *
   * @returns {object} fin, arret (temps immobile), cumul (travail total du
   *   poste après la tâche), fait (minutes réellement travaillées ici) et
   *   `tronque` quand le poste s'est terminé avant la tâche.
   */
  function executerTache(o) {
    const pauses = o.pauses || [];
    const regime = normaliserRegime(o.regime);
    // La fin du poste se déduit de son début et de la présence, sauf si
    // l'appelant l'impose : c'est lui qui sait quand l'équipe est arrivée.
    const finPoste = Number.isFinite(o.finPoste) ? o.finPoste
      : (regime.actif && Number.isFinite(o.debutPoste)) ? o.debutPoste + regime.presence
      : Infinity;
    const prises = o.prises || new Set();   // seuils de pause déjà honorés dans ce poste
    let t = o.depart, reste = o.duree, cumul = o.cumul || 0, arret = 0, fait = 0;

    if (reste <= 0) return { fin: t, arret: 0, cumul, fait: 0, tronque: false };

    for (let garde = 0; garde < 5000; garde++) {
      if (t >= finPoste) return { fin: finPoste, arret, cumul, fait, tronque: true };

      // Une pause fixe en cours : on attend sa fin.
      const fixe = pauses.find(p => t >= p.de && t < p.a);
      if (fixe) { arret += Math.min(fixe.a, finPoste) - t; t = Math.min(fixe.a, finPoste); continue; }

      // Une pause de régime due : le seuil de travail cumulé est atteint.
      const due = regime.seuils.find(s => cumul >= s.apres && !prises.has(s.apres));
      if (due) { prises.add(due.apres); arret += due.duree; t += due.duree; continue; }

      // Jusqu'où peut-on travailler sans être interrompu ?
      const prochainSeuil = regime.seuils.find(s => s.apres > cumul);
      const versSeuil = prochainSeuil ? prochainSeuil.apres - cumul : Infinity;
      const prochaineFixe = pauses.find(p => p.de > t);
      const versFixe = prochaineFixe ? prochaineFixe.de - t : Infinity;
      const versFin = finPoste - t;
      const creneau = Math.min(reste, versSeuil, versFixe, versFin);

      t += creneau; cumul += creneau; fait += creneau; reste -= creneau;
      if (reste <= 1e-9) return { fin: t, arret, cumul, fait, tronque: false };
      if (creneau === versFin) return { fin: finPoste, arret, cumul, fait, tronque: true };
    }
    throw new Error('Trop d’interruptions pour achever une tâche.');
  }

  /**
   * Comme `executerTache`, mais arrêtée à l'instant `jusqua` (banc d'essai,
   * renforts : l'effectif change en cours de tâche). Rend ce qui a été
   * travaillé jusque-là, les pauses dues prises (ajoutées à `prises`), et,
   * si l'équipe est en pleine pause de régime à cet instant, l'heure où elle
   * reprend (`reprise`).
   */
  function executerJusqua(o, jusqua) {
    const pauses = o.pauses || [];
    const regime = normaliserRegime(o.regime);
    const finPoste = Number.isFinite(o.finPoste) ? o.finPoste : Infinity;
    const prises = o.prises;
    let t = o.depart, reste = o.duree, cumul = o.cumul || 0, arret = 0, fait = 0;
    for (let garde = 0; garde < 5000; garde++) {
      if (t >= jusqua - 1e-9 || t >= finPoste || reste <= 1e-9) return { t, arret, cumul, fait, reprise: t };
      const fixe = pauses.find(p => t >= p.de && t < p.a);
      if (fixe) { const f = Math.min(fixe.a, finPoste, jusqua); arret += f - t; t = f; continue; }
      const due = regime.seuils.find(s => cumul >= s.apres && !prises.has(s.apres));
      if (due) {
        prises.add(due.apres);
        if (t + due.duree > jusqua) { arret += jusqua - t; return { t: jusqua, arret, cumul, fait, reprise: t + due.duree }; }
        arret += due.duree; t += due.duree; continue;
      }
      const prochainSeuil = regime.seuils.find(s => s.apres > cumul);
      const versSeuil = prochainSeuil ? prochainSeuil.apres - cumul : Infinity;
      const prochaineFixe = pauses.find(p => p.de > t);
      const versFixe = prochaineFixe ? prochaineFixe.de - t : Infinity;
      const creneau = Math.min(reste, versSeuil, versFixe, finPoste - t, jusqua - t);
      t += creneau; cumul += creneau; fait += creneau; reste -= creneau;
    }
    throw new Error('Trop d’interruptions pour achever une tâche.');
  }

  /* ----------------------------------------------------------------------
   *  BOUCLE DU MATÉRIEL
   *  Les trolleys, la porcelaine, les couverts ne s'achètent pas : ils
   *  reviennent. Un départ les emporte, un retour les ramène sales, la plonge
   *  les rend propres, un départ les remporte. En théorie il n'y a pas de
   *  stock : si les retours égalent les départs, tout ce qui part vient de
   *  revenir. Un excédent de retours se stocke et sert d'amortisseur — quand
   *  la plonge prend du retard, ou le jour où les retours manquent.
   *
   *  On tient donc UN compte unique, en unités. C'est une simplification
   *  assumée : un trolley de CRL n'est pas un trolley d'AF.
   * --------------------------------------------------------------------*/

  /*
   * Ce qu'un vol emporte de matériel, classé comme le barème : **par vol**,
   * pour chaque classe présente à bord. Le compte au passager ne décrivait
   * rien : un trolley part avec le vol, et sa quantité ne bouge pas parce que
   * l'avion est à moitié vide.
   */
  const UNITES_DEFAUT = Object.fromEntries(CABINES.map(c => [c, { parVol: PAX_TYPE[c] }]));

  const MATERIEL_DEFAUT = {
    actif: false,
    unites: UNITES_DEFAUT,   // par classe : unités par vol — NON CALIBRÉ
    stockInitial: 0,         // propre disponible à l'ouverture
    delaiRetour: 30          // minutes entre l'arrivée d'un vol et sa mise à disposition
  };

  /**
   * La table des unités d'un réglage, quelle que soit la forme où il arrive.
   * Les anciennes saisies comptaient aussi « par passager » — un `parPax`
   * scalaire, ou un par classe. Elles sont converties en unités par vol sur
   * la base de passagers types : une sauvegarde d'hier s'ouvre toujours.
   */
  function unitesDe(materiel) {
    const m = materiel || {};
    // On lit le réglage TEL QU'IL ARRIVE. Le fusionner avec le défaut d'abord
    // masquerait un `parPax` hérité derrière la table par défaut.
    if (Number.isFinite(+m.parPax) && !m.unites) {
      const legacy = +m.parPax;
      return Object.fromEntries(CABINES.map(c => [c, { parVol: Math.round(legacy * PAX_TYPE[c] * 10) / 10 }]));
    }
    if (m.unites && typeof m.unites === 'object') {
      return Object.fromEntries(CABINES.map(c => {
        const u = m.unites[c] || {};
        const n = (+u.parVol || 0) + (+u.parPax || 0) * PAX_TYPE[c];
        return [c, { parVol: Math.max(0, Math.round(n * 10) / 10) }];
      }));
    }
    return clone(UNITES_DEFAUT);
  }
  const clone = x => JSON.parse(JSON.stringify(x));

  /** Ce qu'un vol emporte, ou ramène : une quantité par classe présente à bord. */
  function unitesDuVol(vol, unites) {
    let n = 0;
    for (const c of CABINES) {
      if ((vol[CHAMP_PAX[c]] || 0) <= 0) continue;
      n += unites[c].parVol;
    }
    return n;
  }

  /*
   * D'OÙ VIENNENT LES RETOURS À LA PLONGE (retour d'usage du 29/09).
   *
   *   programme — les lignes « RET » du programme de vols (arrivée + délai) ;
   *   j1        — « le retour des vols se fait le lendemain de leur départ » :
   *               le programme se répète, donc le matériel des vols partis la
   *               veille revient le jour J à l'heure de leur départ (+ 24 h),
   *               plus le délai. (« j2 », 48 h, a vécu un jour : lu comme j1.) ;
   *   planche   — la planche retour du handling (saisie ou importée) : chaque
   *               ligne dit quand le vol revient à l'unité — pas de délai à
   *               ajouter. Sans détail des classes, celles que la compagnie
   *               emporte au départ.
   */
  const SOURCES_RETOURS = ['programme', 'j1', 'planche'];
  function sourceRetours(materiel) {
    const s = materiel && materiel.retours;
    if (s === 'j2') return 'j1';
    return SOURCES_RETOURS.includes(s) ? s : 'programme';
  }

  /** Ce que les vols retour ramènent de sale, et quand, selon la source choisie. En « J+1 », `departsVeille`
   *  (une période, évolution 10 du banc d'essai) : les départs réels de la veille, au lieu de ceux du jour. */
  function retoursDeVols(vols, materiel, tous, departsVeille) {
    const m = { ...MATERIEL_DEFAUT, ...(materiel || {}) };
    const unites = unitesDe(materiel);
    const out = [];
    const source = sourceRetours(m);
    const pousser = (vol, cie, t, n) => { if (Number.isFinite(t) && (n > 0 || tous)) out.push({ vol, cie, t, unites: n }); };
    if (source === 'programme') {
      for (const v of vols || []) {
        if (v.sens !== 'RET') continue;
        const arrivee = v.sta === undefined ? v.heure : v.sta;
        pousser(v.id, v.cie, arrivee + m.delaiRetour, unitesDuVol(v, unites));
      }
    } else if (source === 'j1') {
      for (const v of departsVeille || vols || []) {
        if (v.sens !== 'DEP') continue;
        const depart = v.std === undefined ? v.heure : v.std;
        pousser(v.id + ' (J-1)', v.cie, depart + m.delaiRetour, unitesDuVol(v, unites));
      }
    } else {
      // Les classes qu'une compagnie emporte au départ : celles qu'elle ramène.
      const cabinesDe = new Map();
      for (const v of vols || []) {
        if (v.sens !== 'DEP') continue;
        const k = String(v.cie || '').toUpperCase(), set = cabinesDe.get(k) || new Set();
        for (const c of CABINES) if ((v[CHAMP_PAX[c]] || 0) > 0) set.add(c);
        cabinesDe.set(k, set);
      }
      for (const l of (Array.isArray(m.planche) ? m.planche : [])) {
        let t;
        try { t = minutes(l.heure) + (Number.isFinite(+l.jour) ? +l.jour : 0) * MINUTES_PAR_JOUR; } catch (e) { continue; }
        const cie = String(l.cie || '').toUpperCase();
        const detail = CABINES.some(c => Number.isFinite(+l[CHAMP_PAX[c]]) && +l[CHAMP_PAX[c]] > 0);
        const n = detail ? unitesDuVol(l, unites)
          : [...(cabinesDe.get(cie) || new Set(['YC']))].reduce((x, c) => x + (unites[c] ? unites[c].parVol : 0), 0);
        pousser(String(l.vol || cie || 'retour'), cie, t, n);
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /**
   * Le sale de la veille (banc d'essai, évolution 6), présent au début de la
   * journée (`t`) : la liste des vols que la journée d'avant n'a pas lavés
   * ({ vol, cie, unites }, ce que rend `saleFinal`), chacun lavé à la durée de
   * sa compagnie ; ou un nombre d'unités, lavé comme des vols « toutes
   * compagnies » de la taille d'un vol moyen des retours du jour.
   */
  function saleDeLaVeille(saisi, retours, t) {
    if (Array.isArray(saisi)) return saisi.filter(x => x && +x.unites > 0).map(x => ({
      vol: String(x.vol ?? 'veille').replace(/ \(veille\)$/, '') + ' (veille)', cie: String(x.cie || TOUTES).trim().toUpperCase() || TOUTES, t, unites: +x.unites }));
    const n = +saisi;
    if (!(n > 0)) return [];
    const pleins = (retours || []).filter(r => r.unites > 0);
    const moyen = pleins.length ? pleins.reduce((m, r) => m + r.unites, 0) / pleins.length : n;
    const k = Math.max(1, Math.ceil(n / moyen - 1e-9));
    return Array.from({ length: k }, (_, i) => ({ vol: 'veille ' + (i + 1), cie: TOUTES, t, unites: i < k - 1 ? moyen : n - moyen * (k - 1) }));
  }

  /** Ce qu'un lot emporte : par vol, classe par classe. */
  function besoinMateriel(classes, materiel) {
    const unites = unitesDe(materiel);
    return classes.reduce((n, c) => {
      const u = unites[c.cabine] || { parVol: 0 };
      return n + ((c.vols && c.vols.length) || 0) * u.parVol;
    }, 0);
  }

  /* ======================================================================
   *  7. SIMULATION
   * ====================================================================*/

  const classesDuLot = lot => (Array.isArray(lot) ? lot : (lot && lot.classes) || []);

  /* ÉQUIPE CONDITIONNELLE (retour d'usage du 01/10) : « s'il y a tant de vols
   * Air France, une personne est consacrée au montage AF ; sinon elle est
   * rattachée à un autre atelier ». Une équipe peut porter
   *   condition: { cie, seuil, mesure, sinon, renfort }
   * — elle ne travaille que si la compagnie `cie` (« * » : toutes) a au moins
   * `seuil` vols (ou repas, `mesure: 'repas'`) ce jour-là. Sinon, ses commandes
   * passent à l'équipe `sinon` (même service) et ses personnes à `renfort`
   * (par défaut la même) — ou nulle part (`absorbe` : l'équipe qui reprend
   * absorbe la charge avec ses propres personnes). La règle se joue ici, dans le moteur, sur les vols
   * du jour : toute journée rejouée la respecte. */

  /** Ce que compte la règle, ce jour-là : les vols au départ, ou leurs repas. */
  function compteDuJour(classes, cie, mesure) {
    const toutes = !cie || cie === '*', c = String(cie || '').trim().toUpperCase();
    const siennes = (classes || []).filter(x => toutes || x.cie === c);
    if (mesure === 'repas') return siennes.reduce((n, x) => n + (x.pax || 0), 0);
    const vols = new Set();
    for (const x of siennes) for (const v of (x.vols || [])) vols.add(v.id != null ? v.id : x.id + '@' + v.depart);
    return vols.size;
  }

  /** Les équipes qui travaillent ce jour-là, avec les commandes et les personnes de celles qui ne travaillent pas. */
  function appliquerConditions(ateliers, classes) {
    const liste = (ateliers || []).map(a => ({ ...a }));
    const parId = new Map(liste.map(a => [a.id, a]));
    const conditions = [];
    const inactives = new Set();
    for (const a of liste) {
      const k = a.condition;
      // La condition d'une plonge sur son sale (évolution 6) ou sur le retard se décide en jouant la journée, pas au volume.
      if (!k || typeof k !== 'object' || !(+k.seuil > 0) || k.mesure === 'sale' || k.mesure === 'absorbable') continue;
      const mesure = k.mesure === 'repas' ? 'repas' : 'vols';
      const compte = compteDuJour(classes, k.cie, mesure);
      const remplie = compte >= +k.seuil;
      if (!remplie) inactives.add(a.id);
      // `absorbe` : ses personnes ne viennent pas, l'équipe qui reprend absorbe la charge avec les siennes.
      conditions.push({ atelier: a.id, nom: a.nom, cie: k.cie || '*', mesure, seuil: +k.seuil, compte, remplie,
        sinon: k.sinon || null, renfort: k.absorbe ? null : k.renfort || k.sinon || null, absorbe: !!k.absorbe, vers: null, renforce: null });
    }
    // La première équipe qui travaille, en suivant les « sinon » (sans tourner en rond).
    const suivre = (id, champ) => {
      const vus = new Set();
      let x = parId.get(id);
      while (x && inactives.has(x.id) && !vus.has(x.id)) {
        vus.add(x.id);
        const k = x.condition || {};
        x = parId.get(champ === 'renfort' ? (k.renfort || k.sinon) : k.sinon);
      }
      return x && !inactives.has(x.id) ? x : null;
    };
    const echeance = lot => Math.min(...classesDuLot(lot).map(id => {
      const c = classes.find(y => y.id === id); return c ? c.echeance : Infinity;
    }), Infinity);
    // Nulle part où aller (aucune équipe du service ne travaille au bout des
    // « sinon ») : l'équipe garde ses commandes plutôt que de les perdre.
    for (let change = true; change;) {
      change = false;
      for (const r of conditions) {
        if (r.remplie || r.sansIssue) continue;
        const a = parId.get(r.atelier), vers = suivre(a.condition.sinon, 'sinon');
        if (!vers || vers.service !== a.service) { inactives.delete(a.id); r.sansIssue = true; change = true; }
      }
    }
    for (const r of conditions) {
      if (r.remplie || r.sansIssue) continue;
      const a = parId.get(r.atelier);
      const vers = suivre(a.condition.sinon, 'sinon');
      r.vers = vers.id;
      // Ses commandes s'insèrent par échéance, sans déranger l'ordre de celles déjà là.
      const lots = (vers.lots || []).slice();
      for (const lot of (a.lots || [])) {
        const e = echeance(lot);
        const i = lots.findIndex(l => echeance(l) > e);
        lots.splice(i < 0 ? lots.length : i, 0, lot);
      }
      vers.lots = lots;
      if (a.minutes) vers.minutes = { ...a.minutes, ...(vers.minutes || {}) };
      const renfort = a.condition.absorbe ? null : suivre(a.condition.renfort || a.condition.sinon, 'renfort');
      if (renfort && +a.personnes > 0) {
        renfort.personnes = (+renfort.personnes || 0) + (+a.personnes);
        r.renforce = renfort.id;
        r.personnes = +a.personnes;
      }
    }
    return { ateliers: liste.filter(a => !inactives.has(a.id)), conditions };
  }

  /*
   * LES COMMANDES QUI NE VOLENT PAS CE JOUR-LÀ (correction du banc d'essai).
   * Une équipe a dans ses lots les commandes de toutes les compagnies qu'elle
   * sert ; un jour où l'une ne vole pas, sa commande n'existe pas ce jour-là.
   * Bien écrite (« XX/CREW », « XX/@TB » d'une catégorie déclarée), elle est
   * absente de la journée : écartée des lots, l'équipe passe ce lot et fait
   * les autres, et on le dit (une information). Si sa compagnie n'apparaît
   * nulle part ailleurs — ni dans les vols du jour, ni dans le barème, ni dans
   * les commandes ajoutées, ni dans une autre commande des lots —, un
   * avertissement le dit aussi : une faute de frappe ? Aucun des deux ne
   * bloque. Mal écrite (une cabine inconnue, une forme fausse), elle reste
   * refusée, comme avant (« lot »).
   */
  function commandesSansVol(ateliers, parClasse, opts, bareme) {
    const categories = new Set(Object.values(opts.categories || {}).flatMap(l => (Array.isArray(l) ? l : []).map(k => k && k.id).filter(Boolean)));
    const ecrite = id => {
      const m = /^([^/\s]+)\/([^/\s]+)$/.exec(String(id));
      if (!m || m[1] !== m[1].toUpperCase()) return null;
      return CABINES.includes(m[2]) || (m[2][0] === '@' && categories.has(m[2].slice(1))) ? m[1] : null;
    };
    const absentes = new Map();     // atelier → commandes sans vol
    for (const a of ateliers) {
      if (!Array.isArray(a.lots) || !(a.type === 'manuel' || a.type === 'robot')) continue;
      const ids = [...new Set(a.lots.flatMap(classesDuLot).filter(id => !parClasse.has(id) && ecrite(id)))];
      if (ids.length) absentes.set(a, ids);
    }
    if (!absentes.size) return [];
    // Les compagnies que l'unité connaît : celles des vols du jour et des commandes (ajoutées comprises), du barème
    // (et des minutes par compagnie de l'armement), et de chaque commande des lots.
    const cieDe = id => String(id).slice(0, String(id).indexOf('/'));
    const connues = new Set([...(opts.vols || []).map(v => String(v.cie || '').trim().toUpperCase()), ...[...parClasse.keys()].map(cieDe)]);
    for (const service of Object.values(bareme || {})) for (const k of Object.keys(service || {})) if (k.includes('/')) connues.add(cieDe(k));
    for (const l of Object.values(opts.categories || {})) for (const k of (Array.isArray(l) ? l : [])) for (const c of Object.keys((k && k.minutes) || {})) connues.add(String(c).toUpperCase());
    const parCie = new Map();       // compagnie → les commandes des lots qui la citent
    for (const a of ateliers) for (const id of (a.lots || []).flatMap(classesDuLot)) {
      const c = ecrite(id); if (!c) continue;
      if (!parCie.has(c)) parCie.set(c, new Set());
      parCie.get(c).add(id);
    }
    const anomalies = [], inconnues = new Map();
    for (const [a, ids] of absentes) {
      const ecartees = new Set(ids);
      a.lots = a.lots.map(lot => (Array.isArray(lot) ? lot.filter(id => !ecartees.has(id)) : { ...lot, classes: classesDuLot(lot).filter(id => !ecartees.has(id)) }))
        .filter(lot => classesDuLot(lot).length);
      // Plus rien à préparer ce jour-là : ce n'est pas une équipe « qui ne fabrique rien pour l'instant ».
      if (!a.lots.length) a.sansVolCeJour = true;
      anomalies.push({ code: 'commande-absente', atelier: a.id, classes: ids,
        message: (a.nom || a.id) + ' : ' + ids.slice(0, 6).join(', ') + (ids.length > 6 ? '…' : '') + (ids.length > 1
          ? ' n’ont aucun vol ce jour-là : elles ne sont pas dans la journée.' : ' n’a aucun vol ce jour-là : elle n’est pas dans la journée.') });
      for (const id of ids) {
        const c = ecrite(id);
        // Vue ailleurs : dans les vols, le barème, ou une autre commande des lots.
        if (connues.has(c) || [...parCie.get(c)].some(x => x !== id)) continue;
        if (!inconnues.has(c)) inconnues.set(c, { ateliers: [], classes: new Set() });
        inconnues.get(c).ateliers.push(a); inconnues.get(c).classes.add(id);
      }
    }
    for (const [c, x] of inconnues) anomalies.push({ code: 'compagnie-inconnue', cie: c, atelier: x.ateliers[0].id, classes: [...x.classes],
      message: 'compagnie jamais vue : ' + c + ' — faute de frappe ? (' + [...x.classes].join(', ') + ', dans ' + [...new Set(x.ateliers.map(a => a.nom || a.id))].join(', ') + ')' });
    return anomalies;
  }

  /**
   * Joue la journée.
   *
   * @param {object} p
   *   vols      — programme de vols
   *   ateliers  — ateliers de travail
   *   liaisons  — [{from,to}] entre services, lues du Centre des flux
   *   bareme    — table des minutes (défaut : BAREME_DEMO)
   *   rendement — part du temps réellement produite (défaut : 1)
   *   delaiChargement — minutes entre échéance et départ (défaut : 45)
   */
  function simuler(p) {
    const opts = p || {};
    // Un handling 24 h/24 aux chauffeurs calculés (§ 4) : son plan de vacations d'abord, puis la journée avec lui.
    const calcules = (opts.ateliers || []).filter(a => a && a.type === 'handling' && a.handling24h === true && a.chauffeurs && a.chauffeurs.mode === 'calcules');
    return calcules.length ? simulerAvecChauffeursCalcules(opts, calcules) : simulerJournee(opts);
  }

  /* ----------------------------------------------------------------------
   *  LA PLONGE QUI NE S'OUVRE QUE S'IL RESTE DU SALE (banc d'essai, évolution 6)
   *  Une équipe de lavage ordinaire — un shift de nuit — peut ne travailler
   *  que certains jours : `condition: { mesure: 'sale', a: 'HH:MM', seuil }`.
   *  Elle vient si, à l'heure `a` (par défaut son début), le sale en attente
   *  — revenu, pas encore entré dans un tunnel — atteint `seuil` unités (1 par
   *  défaut, provisoire : dès qu'il en reste). Sinon ses personnes ne viennent
   *  pas et ne comptent pas. La journée se joue d'abord sans elle, pour mesurer
   *  le sale à son heure ; puis avec elle, ou sans.
   *
   *  OU QUE SI LE MATIN NE PEUT PAS ABSORBER LE RETARD (correction du banc
   *  d'essai) : `condition: { mesure: 'absorbable', equipe }`. La journée se
   *  joue sans elle : le sale non lavé à la fin (`saleFinal`) est le retard.
   *  L'équipe `equipe` (par défaut, la plonge du même service qui commence le
   *  plus tôt) l'absorbe si, seule, elle lave avant la fin de sa présence,
   *  sans heures sup, ce retard (présent dès le début de la journée : le matin
   *  du lendemain ressemble à celui du jour, comme la journée circulaire du
   *  handling) et ses propres retours, ceux qu'elle lave dans la journée sans
   *  la nuit : si son dépassement vaut 0. La nuit ne vient pas, le retard
   *  passe au lendemain par `saleFinal`. Sinon, elle vient. Les deux mesures
   *  ne se cumulent pas : une seule `mesure`.
   * --------------------------------------------------------------------*/
  const SEUIL_SALE = 1;
  const MESURES_PLONGE = new Set(['sale', 'absorbable']);
  const plongeConditionnelle = a => !!(a && a.type === 'lavage' && a.condition && MESURES_PLONGE.has(a.condition.mesure));
  const surLeRetard = a => a.condition.mesure === 'absorbable';
  /** L'heure où elle décide : où elle mesure le sale (`a`, le jour où elle commence ; sans `a`, son début) ; sur le retard, son début. */
  function heureMesureSale(a) {
    let t = null;
    try { t = a.condition.a && !surLeRetard(a) ? minutes(a.condition.a) : null; } catch (e) { t = null; }
    return (t == null ? minutes(a.debut) : t) + (a.jour || 0) * MINUTES_PAR_JOUR;
  }
  function seuilSale(a) {
    const v = a.condition.seuil, s = +v;
    return v !== undefined && v !== null && v !== '' && Number.isFinite(s) && s >= 0 ? s : SEUIL_SALE;
  }

  function simulerJournee(p) {
    const opts = p || {};
    const conditionnelles = (opts.ateliers || []).filter(plongeConditionnelle);
    if (!conditionnelles.length) return jouerJournee(opts);
    // Chacune décide à son heure, dans l'ordre : la journée jouée sans elle ni les suivantes, avec celles déjà ouvertes.
    const ordre = conditionnelles.map(a => ({ a, t: heureMesureSale(a) })).sort((x, y) => x.t - y.t || String(x.a.id).localeCompare(String(y.a.id)));
    const ouvertes = new Set(), mesures = new Map();
    const sauf = () => opts.ateliers.filter(a => !plongeConditionnelle(a) || ouvertes.has(a.id));
    // Les plonges qui ne viennent pas restent des plonges : leur service, et leur façon de laver.
    const fermees = () => conditionnelles.filter(a => !ouvertes.has(a.id)).map(a => ({ service: a.service, parVol: !!a.parVol }));
    // La journée sans la dernière, quand elle reste fermée sur le retard : c'est déjà la journée jouée.
    let sansElle = null;
    for (const { a, t } of ordre) {
      if (surLeRetard(a)) {
        const d = decisionSurLeRetard(a, opts, sauf(), fermees());
        if (!d.m) return d.r;
        mesures.set(a.id, d.m);
        if (!d.m.absorbe) ouvertes.add(a.id);
        sansElle = d.m.absorbe ? { id: a.id, r: d.r } : null;
        continue;
      }
      sansElle = null;
      const sonde = { id: a.id, service: a.service, parVol: !!a.parVol, t, sale: 0 };
      const r0 = jouerJournee({ ...opts, ateliers: sauf(), _sondesSale: [sonde], _plongesFermees: fermees() });
      if (!r0.ok) return r0;
      const seuil = seuilSale(a);
      mesures.set(a.id, { t, seuil, sale: sonde.sale });
      if (sonde.sale >= seuil - 1e-9) ouvertes.add(a.id);
    }
    const r = sansElle && sansElle.id === ordre[ordre.length - 1].a.id ? sansElle.r : jouerJournee({ ...opts, ateliers: sauf(), _plongesFermees: fermees() });
    if (!r.ok) return r;
    // Une équipe qui ne s'ouvre pas reste dans la liste des équipes, sans personne.
    const presentes = new Set(r.ateliers.map(v => v.id)), regimeDe = a => normaliserRegime(a.regime, opts.regime);
    const avecRenforts = r.ateliers.some(v => 'renfortsPretes' in v);
    opts.ateliers.forEach((a, i) => {
      if (!plongeConditionnelle(a) || presentes.has(a.id)) return;
      const debut = minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR, reg = regimeDe(a);
      const v = { id: a.id, nom: a.nom, service: a.service, type: a.type, debut, personnes: 0, fin: null, travail: 0, attente: 0, arret: 0, lots: [],
        debutPoste: debut, presence: reg.actif ? reg.presence : null, jour: a.jour || 0, finPoste: null, heuresSup: 0, heuresSupPersonnes: 0,
        ...(avecRenforts ? { renfortsPretes: 0, renfortsRecus: 0, renfortsHeuresSup: 0, renforts: { vers: [], de: [] } } : {}) };
      const apres = opts.ateliers.slice(i + 1).map(x => r.ateliers.findIndex(y => y.id === x.id)).find(k => k >= 0);
      r.ateliers.splice(apres === undefined ? r.ateliers.length : apres, 0, v);
    });
    // Ce qu'elle rend : ouverte ou non, le sale mesuré, ce qu'elle a lavé, et le sale qui reste à sa fin.
    for (const { a } of ordre) {
      const v = r.ateliers.find(x => x.id === a.id), m = mesures.get(a.id), ouverte = ouvertes.has(a.id), reg = regimeDe(a);
      const finPresence = reg.actif ? v.debutPoste + reg.presence : null;
      const fin = Math.max(finPresence ?? -Infinity, ouverte && v.fin != null ? v.fin : -Infinity);
      const lavees = ouverte ? v.lots.filter(l => !l.impossible).reduce((n, l) => n + (l.unites || 0), 0) : 0;
      const apres = { lavees, reste: Number.isFinite(fin) ? saleRestant(r, a, fin) : null, fin: Number.isFinite(fin) ? fin : null };
      v.conditionSale = surLeRetard(a)
        ? { mesure: 'absorbable', ouverte, equipe: m.equipe, retard: m.retard, absorbe: m.absorbe, depassement: m.depassement, ...apres }
        : { mesure: 'sale', ouverte, a: a.condition.a || a.debut, heure: m.t, seuil: m.seuil, sale: m.sale, ...apres };
    }
    return r;
  }

  /** L'équipe qui doit absorber le retard : `equipe`, si elle lave ce jour-là ; sans elle, la plonge du même service
   *  qui commence le plus tôt dans la journée (à l'heure, puis au jour ; à égalité, la première de la liste). */
  function equipeQuiAbsorbe(a, ateliers) {
    const plonges = ateliers.filter(x => x && x.type === 'lavage' && x.id !== a.id && x.service === a.service);
    if (a.condition.equipe) return plonges.find(x => x.id === a.condition.equipe) || null;
    return plonges.reduce((m, x) => (!m || plusTot(x, m) ? x : m), null);
  }
  const plusTot = (x, y) => minutes(x.debut) - minutes(y.debut) + ((x.jour || 0) - (y.jour || 0)) / 10 < 0;

  /**
   * La décision d'une plonge sur le retard (voir plus haut), dans la journée
   * jouée sans elle (`ateliers`, `fermees`). Rend `r`, cette journée, et `m` :
   * l'équipe qui doit absorber, le retard (vols et unités), si elle l'absorbe
   * et, sinon, de combien de minutes elle dépasserait sa présence. Sans `m`,
   * la journée est refusée (`r`).
   */
  function decisionSurLeRetard(a, opts, ateliers, fermees) {
    const suivi = { laves: [], veille: [], debutSale: 0 };
    const rA = jouerJournee({ ...opts, ateliers, _plongesFermees: fermees, _suiviLavage: suivi });
    if (!rA.ok) return { r: rA };
    const retard = (rA.saleFinal || []).filter(x => +x.unites > 1e-9);
    const unites = retard.reduce((n, x) => n + x.unites, 0);
    const d = equipeQuiAbsorbe(a, ateliers);
    const m = { equipe: d ? d.id : a.condition.equipe || null, retard: { vols: retard.length, unites }, absorbe: true, depassement: 0 };
    if (!retard.length) return { r: rA, m };
    if (!d) return { r: rA, m: { ...m, absorbe: false, depassement: null } };
    // Seule, sans limite de fin : le retard, présent dès le début de la journée (comme le sale de la veille), et ses
    // propres retours — ceux qu'elle lave dans la journée sans la nuit — à leur heure. Elle l'absorbe si elle a fini
    // avant la fin de sa présence, sans heures sup : la façon dont la journée répartit les vols entre deux équipes
    // qui se chevauchent n'y entre pas (correction du banc d'essai).
    const vA = rA.ateliers.find(x => x.id === d.id), reg = normaliserRegime(d.regime, opts.regime);
    const debut = vA ? vA.debutPoste : minutes(d.debut) + (d.jour || 0) * MINUTES_PAR_JOUR;
    const finPresence = reg.actif ? debut + reg.presence : Infinity;
    const depassement = depassementSeule(d, opts, saleDeLaVeille(retard, [], suivi.debutSale),
      suivi.laves.filter(x => x.atelier === d.id && !x.veille), debut, finPresence);
    const absorbe = depassement != null && depassement <= 1e-9;
    return { r: rA, m: { ...m, absorbe, depassement: absorbe ? 0 : depassement } };
  }

  /**
   * De combien de minutes l'équipe `d` dépasserait la fin de sa présence pour
   * laver seule, sans limite de fin, le retard (présent dès le début de la
   * journée) et ses propres retours (à leur heure) : par vol, ses tunnels qui
   * tournent, chacun prenant le vol suivant ; au débit, son débit, d'un bloc ce
   * qui est là. Ses pauses comprises. null si elle ne lave rien.
   */
  function depassementSeule(d, opts, retard, siens, debut, finPresence) {
    if (!Number.isFinite(finPresence)) return 0;
    const pauses = pausesDe(d);
    let fin = debut;
    if (d.parVol) {
      const tournent = Array.isArray(d.tunnels) && d.tunnels.length ? tunnelsQuiTournent(d).tournent : (d.personnes > 0 ? [{ nom: 'Tunnel' }] : []);
      if (!tournent.length) return null;
      const pistes = tournent.map(t => ({ libre: debut, vitesse: vitesseTunnel(t) }));
      const vols = retard.map(x => ({ t: x.t, cie: x.cie })).concat(siens.map(x => ({ t: x.t, cie: x.cie }))).sort((x, y) => x.t - y.t);
      for (const v of vols) {
        let p = null, f = Infinity;
        for (const q of pistes) {
          const x = finAvecPauses(Math.max(v.t, q.libre), (dureeLavageVol(d, v.cie) ?? 0) / q.vitesse, pauses).fin;
          if (x < f - 1e-9) { p = q; f = x; }
        }
        p.libre = f; fin = Math.max(fin, f);
      }
    } else {
      const debit = debitLavage(d);
      if (!(debit > 0)) return null;
      const arrivees = retard.map(x => ({ t: x.t, u: x.unites })).concat(siens.map(x => ({ t: x.t, u: x.u }))).sort((x, y) => x.t - y.t);
      const regime = normaliserRegime(d.regime, opts.regime), prises = new Set();
      let cumul = 0;
      for (let i = 0; i < arrivees.length;) {
        let u = 0;
        while (i < arrivees.length && arrivees[i].t <= fin + 1e-9) u += arrivees[i++].u;
        if (u <= 1e-9) { if (i < arrivees.length) fin = Math.max(fin, arrivees[i].t); continue; }
        const x = executerTache({ depart: fin, duree: u / debit * 60, cumul, prises, pauses, regime, finPoste: Infinity });
        fin = x.fin; cumul = x.cumul;
      }
    }
    return Math.max(0, fin - finPresence);
  }

  /** Les heures sup d'une plonge à tunnels, en minutes × personnes : pour chaque tunnel qui finit un vol après la fin de
   *  sa présence, (fin de son dernier vol − fin de présence) × ses personnes, plafonné comme ses heures sup. */
  function heuresSupDesTunnels(a, v, plafond) {
    const tournent = tunnelsQuiTournent(a).tournent, finPresence = v.debutPoste + v.presence, derniere = new Map();
    for (const l of v.lots) if (!l.impossible && Number.isFinite(l.fin) && l.tunnel) derniere.set(l.tunnel, Math.max(derniere.get(l.tunnel) ?? -Infinity, l.fin));
    let n = 0;
    for (const [i, fin] of derniere) n += Math.max(0, Math.min(plafond, fin - finPresence)) * (+(tournent[i - 1] || {}).personnes || 0);
    return n;
  }

  /** Le sale pas encore propre à l'instant t : par vol, les vols revenus qui ne sont pas sortis du tunnel ; au débit, le niveau de la file. */
  function saleRestant(r, a, t) {
    if (a.parVol) return r.lots.filter(l => l.retourVol && l.service === a.service && l.arrivee <= t + 1e-9 && (l.impossible || l.fin == null || l.fin > t + 1e-9))
      .reduce((n, l) => n + (l.unites || 0), 0);
    const serie = (r.plonge && r.plonge.serie) || [];
    let niveau = 0;
    for (const [u, n] of serie) { if (u > t + 1e-9) break; niveau = n; }
    return niveau;
  }

  function jouerJournee(p) {
    const opts = p || {};
    const bareme = opts.bareme ? normaliserBareme(opts.bareme).bareme : BAREME_DEMO;
    const rendement = opts.rendement === undefined ? RENDEMENT_DEMO : opts.rendement;
    if (!(rendement > 0)) throw new Error('Le rendement doit être strictement positif.');
    // Heures supplémentaires (la règle de la version 2, docs/BANC_ESSAI.md) : une
    // équipe dont le travail n'est pas fini à la fin de sa présence reste, jusqu'à
    // `plafond` minutes de plus par personne, plutôt que de partir en laissant ses
    // commandes hors poste. Sans l'option, rien ne change : elle part à la fin de
    // sa présence.
    const SUP = opts.heuresSup && opts.heuresSup.actif !== false && +opts.heuresSup.plafond > 0 ? +opts.heuresSup.plafond : 0;
    // L'ordre souple (correction du banc d'essai, option) : un lot prêt n'attend pas un lot en retard. La règle
    // du modèle ; une équipe peut la changer pour elle (`ordreSouple` : true ou false). Sans elle, l'ordre strict.
    const SOUPLE = !!(opts.ordreSouple && opts.ordreSouple.actif === true);
    // Les cabines dont chaque service prépare les repas spéciaux (banc d'essai, évolution 7) ; sans réglage, toutes.
    const SPML = opts.spmlCabines && typeof opts.spmlCabines === 'object' && !Array.isArray(opts.spmlCabines) ? opts.spmlCabines : null;
    // Les renforts (banc d'essai, évolution 5) : une équipe qui a fini tous ses lots
    // avant la fin de sa présence prête ses personnes à une équipe encore au travail.
    // `polyvalence` : pour chaque service, les services qu'il peut aider (saisis) ;
    // `familles` : sans saisie, son service et ses annexes.
    const REN = (() => {
      const r = opts.renforts;
      if (!r || r.actif !== true) return null;
      const n = (v, d, min, max) => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? d : Math.max(min, Math.min(max, +v)));
      const liste = m => new Map(Object.entries(m && typeof m === 'object' && !Array.isArray(m) ? m : {})
        .map(([k, v]) => [k, new Set(Array.isArray(v) ? v.map(String) : [])]));
      return { efficacite: n(r.efficacite, 0.8, 0, 2), autre: n(r.efficaciteAutreService, 0.6, 0, 2), delai: n(r.delai, 10, 0, 240),
        versHeuresSup: r.versHeuresSup === true, polyvalence: liste(r.polyvalence), familles: liste(r.familles) };
    })();

    // Les compagnies × classes viennent du programme de vols, sauf quand
    // l'appelant en fournit une liste : l'utilisateur peut en retirer qu'il ne
    // fabrique pas, et en ajouter que le programme ne porte pas encore.
    // Un service par compagnie (l'armement) : une commande par compagnie dont un chemin passe par
    // lui, ou qu'une de ses équipes a cochée ; les autres n'ont pas d'armement (08/10).
    const base = (opts.classes || classesDeVols(opts.vols, { delaiChargement: opts.delaiChargement })).filter(c => !c.categorie);
    // Avec un handling 24 h/24, l'échéance des commandes d'un vol est celle de sa tournée de chargement.
    const classes = echeances24h(base.concat(classesCategories(opts.vols, opts.categories, { delaiChargement: opts.delaiChargement, compagnies: compagniesParService(base, routesDesClasses(base, opts), opts.ateliers) }))
      .sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id)), opts.ateliers, opts.vols);
    const servicesCategories = new Set(Object.keys(opts.categories || {}));
    const parClasse = new Map(classes.map(c => [c.id, c]));
    // Le handling travaille le jour J des vols : jamais la veille.
    // Les équipes qui ne travaillent que selon le volume du jour (règle ⚡) : celles
    // dont la condition n'est pas remplie passent leurs commandes et leurs personnes.
    const regles = appliquerConditions((opts.ateliers || []).map(a => ({ ...a, type: a.type || 'manuel', ...(a.type === 'handling' ? { jour: 0 } : {}) })), classes);
    const ateliers = regles.ateliers;
    // Les commandes des équipes qui ne volent pas ce jour-là (correction du banc d'essai) : écartées avant de jouer.
    const sansVol = commandesSansVol(ateliers, parClasse, opts, bareme);

    const services = new Set(ateliers.map(a => a.service));
    const anomalies = validerAteliers(ateliers, { services: opts.services || [...services], classes, noms: opts.noms }).concat(sansVol);
    const fourn = fournisseurs(opts.liaisons);
    const routes = routesDesClasses(classes, opts);
    // Le chemin décide par où passe une commande (retours d'usage du 01/10 et du
    // 02/10) : cochée dans un service que son chemin ne traverse pas, elle n'y est
    // pas préparée. On l'écarte avant de jouer la journée, et on le dit.
    const horsChemin = new Map();         // atelier → commandes écartées
    for (const a of ateliers) {
      if (!Array.isArray(a.lots) || !(a.type === 'manuel' || a.type === 'robot')) continue;
      const hors = new Set(a.lots.flatMap(classesDuLot).filter(id => { const r = routes.get(id); return r && !r.services.has(a.service); }));
      if (!hors.size) continue;
      horsChemin.set(a.id, [...hors]);
      a.lots = a.lots.map(lot => (Array.isArray(lot) ? lot.filter(id => !hors.has(id)) : { ...lot, classes: classesDuLot(lot).filter(id => !hors.has(id)) }))
        .filter(lot => classesDuLot(lot).length);
    }
    const nom = id => (opts.noms && opts.noms[id]) || id;
    // Les services dont l'effectif se calcule d'après les homme-minutes. Une
    // équipe peut faire autrement que son service (retour d'usage du 06/10 : « le
    // poste ne dépend pas forcément des vols ») : `effectif` 'fixe' ou 'calcule'.
    const calcules = new Set(Array.isArray(opts.effectifCalcule) ? opts.effectifCalcule : []);
    // Effectif imposé (essai) : le travail dépend des vols (les minutes par vol
    // s'appliquent), mais l'effectif est celui saisi — « et avec 2 personnes ? ».
    const imposes = new Set(Array.isArray(opts.effectifImpose) ? opts.effectifImpose : []);
    // Les services dont le barème est repris du service dont ils dépendent : un robot n'y lit pas de minutes (évolution 9).
    const repris = new Set(Array.isArray(opts.baremeRepris) ? opts.baremeRepris : []);
    const modeEffectif = a => (['fixe', 'calcule', 'impose'].includes(a.effectif) ? a.effectif
      : imposes.has(a.service) ? 'impose' : calcules.has(a.service) ? 'calcule' : 'fixe');
    const dependDesVols = a => modeEffectif(a) !== 'fixe';
    const calculee = a => !a.effectifFixe && modeEffectif(a) === 'calcule';
    // Un poste qui ne dépend pas des vols n'a pas de minutes par vol (retour d'usage
    // du 06/10 : « tous les postes qui ne dépendent pas des vols n'ont forcément
    // aucun man-hours par vol ») : ses commandes passent dans ses heures de
    // présence, en temps nul. Seulement quand l'appelant dit quels services se
    // calculent : sans ce réglage (calage, anciens appels), le barème s'applique.
    const reglesEffectif = Array.isArray(opts.effectifCalcule) || Array.isArray(opts.effectifImpose);
    const sansMinutes = a => reglesEffectif && a.type === 'manuel' && !dependDesVols(a);

    // Quels services fabriquent quelle classe. C'est ce qui définit le parcours
    // réel, et c'est sur lui seul qu'un cycle est bloquant : le graphe des flux
    // contient des retours (quais → plonge → dotation → quais) qui bouclent
    // sans jamais empêcher une classe d'avancer. Refuser ces boucles-là serait
    // refuser une unité correctement décrite.
    const producteurs = new Map();
    for (const a of ateliers) for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) {
      if (!producteurs.has(id)) producteurs.set(id, new Set());
      producteurs.get(id).add(a.service);
    }
    const vus = new Set();
    // Un parcours qui boucle ne laisserait jamais avancer ses classes.
    for (const p of (Array.isArray(opts.parcours) ? opts.parcours : [])) {
      const f = fournisseurs(arcsDuParcours(p));
      for (const c of cycles(f, new Set(servicesDuParcours(p)))) {
        const cle = 'p:' + p.id + ':' + c.join('>');
        if (vus.has(cle)) continue; vus.add(cle);
        anomalies.push({ code: 'cycle',
          message: 'Le parcours « ' + (p.nom || p.id) + ' » boucle : ' + c.map(nom).join(' → ') + '.' });
      }
    }
    for (const [id, svc] of producteurs) {
      if (routes.has(id)) continue;    // son parcours explicite a été vérifié ci-dessus
      for (const c of cycles(fourn, svc)) {
        const cle = c.join('>');
        if (vus.has(cle)) continue; vus.add(cle);
        anomalies.push({ code: 'cycle',
          message: 'Les liaisons bouclent sur ' + id + ' : ' + c.join(' → ') + '. Cette classe ne pourrait jamais avancer.' });
      }
    }
    // Un service absent du barème produit des durées nulles. Ce n'est pas une
    // erreur de saisie, mais un zéro muet trompe : on le nomme.
    for (const a of ateliers) {
      // Un robot va à son débit, une plonge à celui de ses tunnels, une mise à
      // disposition ne travaille pas : aucun n'a besoin de barème.
      if (a.type === 'robot' || a.type === 'lavage' || a.type === 'dispo' || a.type === 'handling' || a.type === 'appui') continue;
      if (servicesCategories.has(a.service)) continue;   // ses minutes sont dans sa fiche, par compagnie
      if (sansMinutes(a)) continue;                       // effectif constant : pas de minutes par vol
      if (!bareme[a.service]) anomalies.push({ code: 'bareme', atelier: a.id,
        message: a.nom + ' : aucun barème pour « ' + nom(a.service) + ' », sa durée est nulle tant qu’il n’est pas renseigné.' });
    }

    // Une compagnie × classe fabriquée dans un service qui n'a de minutes ni
    // pour elle ni pour sa classe y travaillerait en temps nul. On la nomme :
    // c'est le cas courant d'un service chiffré compagnie par compagnie.
    for (const a of ateliers) {
      if (a.type !== 'manuel' || !bareme[a.service] || servicesCategories.has(a.service) || sansMinutes(a)) continue;
      const sans = [];
      for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) {
        const c = parClasse.get(id);
        if (c && c.vols.length && minutesParVol(bareme[a.service], c) == null && !sans.includes(id)) sans.push(id);
      }
      if (sans.length) anomalies.push({ code: 'bareme-classe', atelier: a.id, classes: sans,
        message: '« ' + nom(a.service) + ' » n’a pas de minutes pour ' + sans.slice(0, 5).join(', ')
          + (sans.length > 5 ? '…' : '') + ' : ' + (sans.length > 1 ? 'elles y travaillent' : 'elle y travaille')
          + ' en temps nul. Renseignez le barème.' });
    }
    // Un service par compagnie (l'armement) sans minutes pour une compagnie qu'il prépare.
    for (const a of ateliers) {
      if (!servicesCategories.has(a.service) || sansMinutes(a)) continue;
      const sans = [...new Set((a.lots || []).flatMap(classesDuLot).filter(id => { const c = parClasse.get(id); return c && c.categorie && c.minutes == null; }))];
      if (sans.length) anomalies.push({ code: 'bareme-classe', atelier: a.id, classes: sans,
        message: '« ' + nom(a.service) + ' » n’a pas de minutes par vol pour ' + sans.map(id => id.slice(0, id.indexOf('/'))).slice(0, 6).join(', ')
          + (sans.length > 6 ? '…' : '') + ' : temps nul. Renseignez-les dans sa fiche (Équipes › Services et équipes).' });
    }

    // Ce qui n'empêche pas de jouer la journée ne doit pas l'empêcher.
    const NON_BLOQUANTES = new Set(['doublon', 'bareme', 'lots', 'lot-vide', 'poste', 'materiel', 'dispo', 'bouchon', 'inacheve', 'plonge-fermee',
      // Une commande sans vol ce jour-là, une compagnie qu'on ne voit nulle part ailleurs : on le dit, la journée se joue.
      'commande-absente', 'compagnie-inconnue',
      'tunnel-personnes', 'parcours-trou', 'hors-parcours', 'bareme-classe',
      'handling-duree', 'handling-sans', 'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs',
      'plonge-duree', 'plonge-vol', 'plonge-mixte',
      // Une case sans personne, un robot sous son effectif, une plonge dont aucun
      // tunnel ne tourne : cette case ne produit rien, et on le dit — mais le reste
      // de la journée se calcule. Mettre une case à 0 effaçait tous les résultats.
      'sans-personne', 'robot-arret', 'plonge-arret']);
    const bloquant = anomalies.some(a => !NON_BLOQUANTES.has(a.code));
    if (bloquant) return { ok: false, anomalies, classes, lots: [], ateliers: [], conditions: regles.conditions };

    /* ---- le handling 24 h/24 : ses départs, leurs avions, leurs retours ---- */
    // Les départs qu'il charge (ceux dont un repas est préparé, comme pour tout
    // handling) ; l'avion de chacun, s'il a une arrivée, est à décharger. Le sale
    // qu'une tournée rapporte remplace, pour ces avions, la règle des retours :
    // une ligne retour de la même compagnie, à l'heure la plus proche, en donne
    // les quantités ; sans elle, ce sont celles du vol de départ.
    const plan24 = (() => {
      const hs = ateliers.filter(a => a.type === 'handling');
      if (!hs.some(a => a.handling24h === true)) return null;
      const repas = new Set(volsDesClasses(classes.filter(c => producteurs.has(c.id) && !c.categorie)).map(v => v.id));
      const brut = new Map((opts.vols || []).filter(v => (v.sens || 'DEP') === 'DEP').map(v => [v.id, v]));
      const unites = unitesDe(opts.materiel);
      const parVol = new Map();
      for (const v of volsDesClasses(classes.filter(c => producteurs.has(c.id))).filter(v => repas.has(v.id))) {
        const a = handlingDeCompagnie(hs, v.cie);
        if (!a || a.handling24h !== true) continue;
        const b0 = brut.get(v.id) || { id: v.id, cie: v.cie, std: v.depart };
        parVol.set(v.id, { v, a, brut: b0, b: besoin24h(a, { ...b0, cie: v.cie, std: v.depart }) });
      }
      // Les avions à décharger, dans l'ordre de leur arrivée.
      const avions = [...parVol.values()].filter(x => x.b.arrivee != null)
        .sort((x, y) => x.b.arrivee - y.b.arrivee || String(x.v.id).localeCompare(String(y.v.id)));
      // Chaque avion prend la ligne de sa compagnie à l'heure la plus proche ; une ligne ne sert qu'une fois.
      const apparier = (lignes, heureDe) => {
        const libres = lignes.map((l, i) => ({ l, i, t: heureDe(l) })).filter(x => Number.isFinite(x.t)), pris = new Map();
        for (const x of avions) {
          let m = null;
          for (const y of libres) if (!y.pris && up(y.l.cie) === up(x.v.cie)
            && (!m || Math.abs(y.t - x.b.arrivee) < Math.abs(m.t - x.b.arrivee) - 1e-9 || (Math.abs(Math.abs(y.t - x.b.arrivee) - Math.abs(m.t - x.b.arrivee)) <= 1e-9 && y.t < m.t))) m = y;
          if (m) { m.pris = true; pris.set(x.v.id, m); }
        }
        return pris;
      };
      const lignesRet = (opts.vols || []).filter(v => v.sens === 'RET');
      const parRet = apparier(lignesRet, l => (l.sta === undefined ? l.heure : l.sta));
      for (const x of avions) {
        const r = parRet.get(x.v.id);
        x.unites = unitesDuVol(r ? r.l : x.brut, unites);
        x.libelle = r ? String(r.l.id) : String(x.v.id);
      }
      // Ce que la règle des retours ne compte plus : ces avions-là, d'où qu'ils reviennent.
      const m = { ...MATERIEL_DEFAUT, ...(opts.materiel || {}) }, source = sourceRetours(m);
      const decharges = new Set(avions.map(x => x.v.id));
      let volsRetours = opts.vols || [], planche = null;
      if (source === 'programme') { const exclus = new Set([...parRet.values()].map(y => y.l)); volsRetours = volsRetours.filter(v => !exclus.has(v)); }
      else if (source === 'j1') volsRetours = volsRetours.filter(v => v.sens !== 'DEP' || !decharges.has(v.id));
      else {
        const lignes = Array.isArray(m.planche) ? m.planche : [];
        const exclus = new Set([...apparier(lignes, l => { try { return minutes(l.heure) + (Number.isFinite(+l.jour) ? +l.jour : 0) * MINUTES_PAR_JOUR; } catch (e) { return NaN; } }).values()].map(y => y.l));
        planche = lignes.filter(l => !exclus.has(l));
      }
      return { parVol, avions, volsRetours, planche };
    })();
    /** Les retours à la plonge selon la règle choisie, sans les avions qu'un handling 24 h/24 décharge. */
    // Une période (évolution 10), source « J+1 » : le sale du jour vient des départs réels de la veille, leur heure
    // + 24 h + le délai ; sans eux (le premier jour, une journée seule), des départs du jour, comme avant.
    // Correction 11 : un départ de la veille dont un handling 24 h/24 décharge l'avion (il charge sa compagnie, et le
    // vol a une ETA ou sa compagnie une escale) a rendu son sale au déchargement : il ne revient pas une seconde fois.
    // On le juge d'après le vol de la veille lui-même, pas d'après les identifiants du jour (un numéro de vol change
    // d'un jour à l'autre). Les autres gardent la règle « J+1 ».
    const handlings24 = plan24 ? ateliers.filter(a => a.type === 'handling') : [];
    const decharge24 = v => { const a = handlingDeCompagnie(handlings24, v.cie); return !!a && a.handling24h === true && arriveeDe(a, v) != null; };
    const departsVeille = Array.isArray(opts.departsVeille)
      ? opts.departsVeille.filter(v => (v.sens || 'DEP') === 'DEP' && !(plan24 && decharge24(v))) : null;
    const retoursStatiques = (materiel, tous) => (plan24
      ? retoursDeVols(plan24.volsRetours, plan24.planche ? { ...(materiel || {}), planche: plan24.planche } : materiel, tous, departsVeille)
      : retoursDeVols(opts.vols, materiel, tous, departsVeille));

    // Une mise à disposition permanente n'a pas d'heure : elle ne doit pas
    // tirer le début de la journée en arrière.
    const debuts = ateliers.filter(a => a.type !== 'dispo' || a.permanent === false)
      .map(a => (a.type === 'dispo' ? disponibleDes(a) : minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR));
    // Le handling 24 h/24 n'attend pas 00:00 : sa première tournée peut partir la veille au soir.
    if (plan24) for (const x of plan24.parVol.values()) {
      const avance = Number.isFinite(+x.a.avance) && x.a.avance !== null && x.a.avance !== '' ? Math.max(0, +x.a.avance) : AVANCE_HANDLING;
      debuts.push(Math.min(x.b.depart - avance - x.b.quaiDepart - x.b.aller, x.b.dispo != null ? x.b.dispo - x.b.aller : Infinity));
    }
    const env = new Environnement(debuts.length ? Math.min(...debuts) : 0);

    // Livraisons : un événement par (service, classe), créé à la demande, et
    // l'heure où il a eu lieu (le handling dit quand un vol a été complet).
    const livraisons = new Map(), livreA = new Map();
    const cle = (service, classe) => service + '|' + classe;
    const livraison = (service, classe) => {
      const k = cle(service, classe);
      let ev = livraisons.get(k);
      if (!ev) { ev = env.evenement('livre ' + k); livraisons.set(k, ev); }
      return ev;
    };
    const livrer = (service, classe) => {
      const ev = livraison(service, classe);
      if (ev.declenche) return;
      livreA.set(cle(service, classe), env.maintenant);
      ev.reussir(env.maintenant);
    };

    // Un service ne produit une classe que si un atelier la lui a confiée :
    // sinon il ne fait pas partie du parcours de cette classe et n'est pas
    // attendu. C'est ce qui permet à un parcours d'être différent par classe.
    const produit = new Set();
    for (const a of ateliers) for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) produit.add(cle(a.service, id));
    // Une étape fusionnée : la case d'aval la fait pour ses commandes. Elle n'est
    // pas un trou, et qui l'attendrait attend la case qui la fait.
    const fusionPar = new Map();       // « service|classe » → service de la case qui la fait
    for (const a of ateliers) {
      const f = fusionDe(a); if (!f) continue;
      // Seulement les commandes dont le chemin passe par cette étape : une équipe
      // qui fait Prépa + Montage pour CRL et TX PC peut faire le Montage seul pour
      // RAM et AH YC, dont le flux n'a pas de Prépa (retour d'usage du 01/10).
      for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) {
        const r = routes.get(id);
        if (r && !r.services.has(f)) continue;
        if (!produit.has(cle(f, id))) fusionPar.set(cle(f, id), a.service);
      }
    }
    // L'effectif calculé : homme-minutes des commandes de l'équipe ÷ son poste.
    // Les commandes écartées (hors chemin, équipe ⚡ qui ne travaille pas) sont
    // déjà parties : on ne compte que ce qu'elle fera vraiment.
    const effectifs = {};
    // Un robot (évolution 9) : le travail autour de sa ligne (chargement, montage, runner), budgété par vol au barème propre
    // de son service — par défaut dans un service de robots (`servicesRobot`, que donne moteur/journee.js), ailleurs s'il le
    // demande (`effectif: 'calcule'`) ; jamais au barème repris du service dont il dépend (`baremeRepris`). Sans minutes
    // pour ses commandes — celles du jour, ou celles qui ne volent pas ce jour-là —, il garde son effectif saisi.
    const servicesRobot = new Set(Array.isArray(opts.servicesRobot) ? opts.servicesRobot : []);
    const absentesDe = new Map(sansVol.filter(x => x.code === 'commande-absente').map(x => [x.atelier, x.classes]));
    const classeDe = id => ({ cie: id.slice(0, id.lastIndexOf('/')), cabine: id.slice(id.lastIndexOf('/') + 1) });
    const robotSuitLeBareme = (a, lots) => {
      if (repris.has(a.service) || !(servicesRobot.has(a.service) || a.effectif === 'calcule')) return false;
      const t = bareme[a.service];
      return lots.some(c => (minutesParVol(t, c) || 0) > 0) || (absentesDe.get(a.id) || []).some(id => (minutesParVol(t, classeDe(id)) || 0) > 0);
    };
    for (const a of ateliers) {
      // `effectifFixe` : une équipe dont on essaie un autre effectif (« et avec une personne de plus ? »).
      if (!(a.type === 'manuel' || a.type === 'robot') || !calculee(a)) continue;
      let poste;
      try { poste = minutesDuPoste(a, opts.regime); } catch (e) { continue; }   // heure invalide : déjà signalée
      const lots = (a.lots || []).flatMap(classesDuLot).map(id => parClasse.get(id)).filter(Boolean);
      if (a.type === 'robot' && !robotSuitLeBareme(a, lots)) continue;
      const ici = lots.reduce((n, c) => n + travailDans(a, c, bareme, SPML), 0);
      const f = fusionDe(a);
      const avant = f ? lots.filter(c => fusionPar.get(cle(f, c.id)) === a.service).reduce((n, c) => n + travailClasse(f, c, bareme, SPML), 0) : 0;
      let n = effectifPour(ici, avant, poste, rendement);
      if (n == null) continue;
      // Des commandes qui volent ce jour-là sans minutes au barème (barème à renseigner) : quelqu'un est là, en
      // temps nul. Sans aucun vol ce jour-là (une commande ajoutée à la main, l'armement d'une compagnie qui ne
      // vole pas), personne (correction 10 du banc d'essai).
      if (n === 0 && lots.some(c => (c.vols || []).length > 0 && !(travailDans(a, c, bareme, SPML) > 0))) n = 1;
      // Un robot ne tourne qu'à partir de son minimum : au moins `personnesMin` dès qu'il a du travail. Sa ligne
      // va toujours à son débit : des personnes en plus ne l'accélèrent pas.
      if (a.type === 'robot' && n > 0) n = Math.max(n, a.personnesMin === undefined ? 1 : a.personnesMin);
      effectifs[a.id] = { personnes: n, saisi: a.personnes, hommeMinutes: ici + avant, poste, rendement };
      a.personnes = n;
    }
    // L'équipe d'appui calculée : ses minutes par vol × les vols de chaque compagnie.
    // Sans minutes renseignées, son effectif saisi reste.
    const servicesLavage = new Set(ateliers.filter(a => a.type === 'lavage').map(a => a.service).concat((opts._plongesFermees || []).map(x => x.service)));
    let volsParCie = null;
    const compter = lavage => {
      const n = new Map();
      const liste = lavage ? retoursStatiques(opts.materiel, true).map(r => r.cie).concat(plan24 ? plan24.avions.map(x => x.v.cie) : [])
        : (opts.vols || []).filter(x => (x.sens || 'DEP') === 'DEP').map(x => x.cie);
      for (const c of liste) { const k = String(c || '').toUpperCase(); n.set(k, (n.get(k) || 0) + 1); }
      return n;
    };
    for (const a of ateliers) {
      if (a.type !== 'appui' || !calculee(a)) continue;
      const lave = servicesLavage.has(a.service);
      volsParCie = volsParCie || {};
      const n = volsParCie[lave ? 'l' : 'd'] = volsParCie[lave ? 'l' : 'd'] || compter(lave);
      let ici = 0, vols = 0;
      for (const [cie, k] of n) { const m = minutesVolAppui(a, cie); if (m != null) { ici += m * k; vols += k; } }
      if (!(ici > 0)) continue;
      let poste;
      try { poste = minutesDuPoste(a, opts.regime); } catch (e) { continue; }
      const p = effectifPour(ici, 0, poste, rendement);
      if (p == null) continue;
      effectifs[a.id] = { personnes: p, saisi: a.personnes, hommeMinutes: ici, poste, rendement, vols, retours: lave };
      a.personnes = p;
    }
    // Ses personnes saisies ne comptent plus : ce qu'on en disait non plus.
    for (let i = anomalies.length - 1; i >= 0; i--) {
      const x = anomalies[i];
      if (effectifs[x.atelier] && (x.code === 'personnes' || x.code === 'sans-personne' || x.code === 'robot-arret')) anomalies.splice(i, 1);
    }

    // Une mise à disposition sert TOUT : on ne lui fait pas énumérer les
    // classes. Le magasin sort du matériel pour qui en demande.
    for (const a of ateliers) if (a.type === 'dispo') for (const c of classes) produit.add(cle(a.service, c.id));
    // Une plonge ne fabrique pas de classe : elle lave ce qui revient, et la
    // boucle du matériel porte cette contrainte. Sur un parcours, elle est une
    // étape franchie, jamais un trou.
    // Une plonge dont l'équipe conditionnelle ne vient pas ce jour (évolution 6) reste une plonge.
    const lavages = new Set(ateliers.filter(a => a.type === 'lavage').map(a => a.service).concat((opts._plongesFermees || []).map(x => x.service)));
    // Le handling charge des vols : il n'a pas de commande à se voir confier,
    // et il n'est pas un trou sur le chemin d'une commande.
    const handlings = ateliers.filter(a => a.type === 'handling');
    const servicesHandling = new Set(handlings.map(a => a.service));
    // Un service à atelier unique (BOB, checkeurs, 07/10) ne fait que certaines
    // compagnies : les autres passent par lui sans y être préparées, c'est voulu.
    const servicesAtelier = new Set(ateliers.filter(a => a.parCompagnie).map(a => a.service));
    // Les boutiques (légumerie, magasin… ouverts de telle à telle heure) : une
    // équipe y prend ses fournitures en début de poste, ou à leur ouverture.
    const boutiques = new Map(ateliers.filter(a => ouvertureDe(a)).map(a => [a.service, a]));

    /**
     * Les livraisons qu'un lot doit attendre, pour une classe, dans un service.
     * Avec un parcours : les services qui le précèdent sur ce parcours. Un
     * service du parcours où personne ne travaille cette classe est un TROU :
     * on l'enjambe pour attendre ceux d'avant — sinon l'aval attendrait une
     * livraison qui ne viendra jamais. Sans parcours : le graphe des flux.
     */
    function amontsDe(service, id) {
      const route = routes.get(id);
      if (!route) {
        return (fourn[service] || []).filter(amont => produit.has(cle(amont, id)));
      }
      const out = new Set(), vus = new Set();
      const remonter = s => {
        for (const amont of (route.amonts[s] || [])) {
          if (vus.has(amont)) continue; vus.add(amont);
          const fait = fusionPar.get(cle(amont, id));
          if (produit.has(cle(amont, id))) out.add(amont);
          // Fusionnée : la case qui la fait est l'amont — sauf pour elle-même,
          // qui attend ce qui précède l'étape qu'elle absorbe.
          else if (fait && fait !== service) out.add(fait);
          else remonter(amont);
        }
      };
      remonter(service);
      return [...out];
    }

    /**
     * Ce que le handling attend d'une commande avant de charger un vol : les
     * services qui la précèdent sur son chemin ; si le chemin ne passe pas par
     * le handling, tous ceux qui la préparent. Une commande que personne ne
     * prépare n'est pas attendue : le vol part sans elle, et on le dit.
     */
    function amontsHandling(service, id) {
      const avant = amontsDe(service, id);
      if (avant.length) return avant;
      const out = [];
      for (const a of ateliers) {
        if (a.service === service || a.type === 'lavage' || a.type === 'handling' || out.includes(a.service)) continue;
        if (produit.has(cle(a.service, id))) out.push(a.service);
      }
      return out;
    }

    // Chaque départ va au premier handling qui charge sa compagnie, sinon au
    // premier qui les charge toutes.
    // Seulement les vols dont une commande DES REPAS est préparée : rien de construit, rien
    // à charger — un vol ne part pas avec son seul armement (audit du 02/10).
    const avecRepas = new Set(volsDesClasses(classes.filter(c => producteurs.has(c.id) && !c.categorie)).map(v => v.id));
    // Ce que chaque vol attend : ses repas ET son armement préparés.
    const volsJour = volsDesClasses(classes.filter(c => producteurs.has(c.id))).filter(v => avecRepas.has(v.id));
    const volsDe = new Map(handlings.map(a => [a.id, []]));
    if (handlings.length) {
      const sans = new Map();
      for (const v of volsJour) {
        const h = handlings.find(a => { const s = compagniesDe(a); return s && s.has(v.cie); })
          || handlings.find(a => !compagniesDe(a));
        if (h) volsDe.get(h.id).push(v);
        else sans.set(v.cie, (sans.get(v.cie) || 0) + 1);
      }
      for (const [cie, n] of sans) anomalies.push({ code: 'handling-sans', compagnie: cie,
        message: n + (n > 1 ? ' vols ' : ' vol ') + cie + ' : aucun handling ne charge cette compagnie. Ajoutez-la à un handling, ou videz sa liste de compagnies.' });
      for (const a of handlings) {
        const manque = [...new Set((volsDe.get(a.id) || []).filter(v => dureeHandling(a, v.cie) == null).map(v => v.cie))];
        if (manque.length) anomalies.push({ code: 'handling-duree', atelier: a.id,
          message: (a.nom || a.id) + ' : aucune durée par vol pour ' + manque.slice(0, 6).join(', ') + (manque.length > 6 ? '…' : '')
            + ' : ces vols sont chargés en temps nul. Donnez une durée à la compagnie, ou une durée pour toutes.' });
      }
    }

    // Ce que les parcours disent et que les ateliers ne font pas — dans les
    // deux sens. On le nomme sans bloquer : c'est une saisie en cours.
    if (routes.size) {
      const trous = new Map();          // service → classes non travaillées
      for (const [id] of producteurs) {
        const route = routes.get(id); if (!route) continue;
        for (const s of route.services) {
          // Un service par catégories ne prépare pas les commandes : il n'est pas un trou sur leur chemin.
          if (produit.has(cle(s, id)) || fusionPar.has(cle(s, id)) || lavages.has(s) || servicesHandling.has(s) || servicesCategories.has(s) || servicesAtelier.has(s)) continue;
          if (!trous.has(s)) trous.set(s, []);
          trous.get(s).push(id);
        }
      }
      for (const [s, ids] of trous) {
        anomalies.push({ code: 'parcours-trou', service: s, classes: ids,
          // Seulement les commandes préparées ailleurs : une commande que personne ne prépare est
          // déjà dite « sans équipe » (Pas à pas, étape 4), et la fiche du service compte toutes celles qui passent.
          message: '« ' + nom(s) + ' » est sur le chemin de ' + ids.length + (ids.length > 1 ? ' commandes préparées' : ' commande préparée') + ' dans d’autres services ('
            + ids.slice(0, 4).join(', ') + (ids.length > 4 ? '…' : '') + '), mais aucune équipe ne l’y prépare : cette étape est sautée pour ' + (ids.length > 1 ? 'elles.' : 'elle.') });
      }
      for (const a of ateliers) {
        const hors = horsChemin.get(a.id); if (!hors) continue;
        anomalies.push({ code: 'hors-parcours', atelier: a.id, classes: hors,
          message: (a.nom || a.id) + ' : ' + hors.slice(0, 4).join(', ') + (hors.length > 4 ? '…' : '')
            + (hors.length > 1 ? ' sont cochées' : ' est cochée') + ' ici, mais ' + (hors.length > 1 ? 'leur chemin ne passe' : 'son chemin ne passe') + ' pas par « ' + nom(a.service)
            + ' » : ' + (hors.length > 1 ? 'elles ne sont pas préparées' : 'elle n’est pas préparée') + ' ici. Décochez-la, ou ajoutez « ' + nom(a.service) + ' » à son chemin (Chemins).' });
      }
    }

    /* ---- boucle du matériel ------------------------------------------ */

    // La table des unités se lit sur le réglage BRUT et voyage avec lui : la
    // fusion avec le défaut masquerait un réglage hérité.
    const mat = { ...MATERIEL_DEFAUT, ...(opts.materiel || {}), unites: unitesDe(opts.materiel) };
    const stock = {
      propre: mat.stockInitial, sale: 0,
      minPropre: mat.stockInitial, entrees: 0, lavees: 0, consommees: 0, attente: 0
    };
    const attenteurs = [];      // lots en attente de matériel propre, dans l'ordre
    const reveilsSale = [];     // processus de lavage en attente d'un retour
    // La file de sale devant la plonge, pour la montrer dans le temps : son
    // niveau à chaque changement, et chaque arrivée dans l'ordre (premier
    // revenu, premier lavé), pour dire combien de temps elle a attendu.
    // Le sale PAS ENCORE LAVÉ : ce qui attend, plus ce qui est dans un tunnel
    // et n'en est pas encore sorti (un tunnel lave en continu, à son débit).
    const file = { serie: [], arrivees: [], attentes: [], retours: [], tunnels: new Set() };
    const resteAuTunnel = t => [...file.tunnels].reduce((n, b) =>
      n + b.unites * Math.max(0, Math.min(1, b.fin > b.debut ? (b.fin - t) / (b.fin - b.debut) : 0)), 0);
    const noterFile = () => file.serie.push([env.maintenant, stock.sale + resteAuTunnel(env.maintenant)]);

    function servir() {
      // Premier arrivé, premier servi : sans cela un petit lot passerait devant
      // un gros indéfiniment, et l'attente mesurée ne voudrait plus rien dire.
      while (attenteurs.length && stock.propre >= attenteurs[0].besoin) {
        const a = attenteurs.shift();
        stock.propre -= a.besoin; stock.consommees += a.besoin;
        stock.minPropre = Math.min(stock.minPropre, stock.propre);
        a.ev.reussir(env.maintenant);
      }
    }
    function crediter(n) { stock.propre += n; stock.lavees += n; servir(); }

    /** Prend `besoin` unités propres, en attendant s'il le faut — pas au-delà de `limite` : rend alors null, sans rien prendre. */
    function* prendreMateriel(besoin, contexte, limite = Infinity) {
      if (besoin <= 0) return 0;
      if (!attenteurs.length && stock.propre >= besoin) {
        stock.propre -= besoin; stock.consommees += besoin;
        stock.minPropre = Math.min(stock.minPropre, stock.propre);
        return 0;
      }
      if (env.maintenant >= limite - 1e-9) return null;
      const ev = env.evenement('materiel'), w = { besoin, ev, ...contexte, depuis: env.maintenant };
      attenteurs.push(w);
      const t0 = env.maintenant;
      yield Number.isFinite(limite) ? env.unDe([ev, env.delai(limite - env.maintenant)]) : ev;
      const attendu = env.maintenant - t0;
      stock.attente += attendu;
      if (!ev.declenche) { attenteurs.splice(attenteurs.indexOf(w), 1); servir(); return null; }
      return attendu;
    }

    if (mat.actif) {
      for (const r of retoursStatiques(mat)) {
        env.processus(function* () {
          if (env.maintenant < r.t) yield env.delai(r.t - env.maintenant);
          noterFile();
          stock.sale += r.unites; stock.entrees += r.unites;
          file.arrivees.push({ t: env.maintenant, u: r.unites, vol: r.vol, cie: r.cie });
          file.retours.push({ t: env.maintenant, u: r.unites, vol: r.vol });
          noterFile();
          while (reveilsSale.length) { const ev = reveilsSale.shift(); if (!ev.declenche) ev.reussir(env.maintenant); }
        }, 'retour ' + r.vol);
      }
    }
    // Le sale de la veille (évolution 6) : présent au début de la journée (00:00 du jour J, ou le début
    // de la journée jouée s'il est plus tard), vol par vol. La plonge par vol le lave comme un retour.
    const debutSale = Math.max(0, env.maintenant);
    const veille = saleDeLaVeille(mat.saleInitial, retoursStatiques({ ...mat, unites: mat.unites }, true), debutSale);
    if (mat.actif && veille.length) env.processus(function* () {
      if (env.maintenant < debutSale) yield env.delai(debutSale - env.maintenant);
      noterFile();
      for (const r of veille) { stock.sale += r.unites; file.arrivees.push({ t: env.maintenant, u: r.unites, vol: r.vol, cie: r.cie }); }
      noterFile();
      while (reveilsSale.length) { const ev = reveilsSale.shift(); if (!ev.declenche) ev.reussir(env.maintenant); }
    }, 'sale de la veille');
    // Tout le sale qui arrive à la plonge, pour le mesurer (évolution 6).
    const arriveesSale = veille.concat(retoursStatiques({ ...mat, unites: mat.unites }, true));
    // Ce que lave chaque équipe de plonge, vol par vol, pour la décision sur le retard (correction du
    // banc d'essai) : une simple écoute, la journée n'en change pas.
    const suiviLavage = opts._suiviLavage || null, nomsVeille = new Set(veille.map(r => r.vol));
    if (suiviLavage) { suiviLavage.veille = veille.map(r => ({ ...r })); suiviLavage.debutSale = debutSale; }

    const journal = [];   // une ligne par lot : ce que l'on affichera
    const suspendus = new Map();   // handling → le vol qu'il attend encore
    const suivi = ateliers.map(a => ({ id: a.id, nom: a.nom, service: a.service, type: a.type,
      debut: a.type === 'dispo' ? (a.permanent !== false ? env.maintenant : disponibleDes(a)) : minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR,
      personnes: a.personnes,
      fin: null, travail: 0, attente: 0, arret: 0, lots: [] }));
    const parId = new Map(suivi.map(s => [s.id, s]));

    // Les équipes d'une plonge par vol, service par service : elles se partagent les retours.
    const plongesParVol = new Map();
    for (const a of ateliers) if (a.type === 'lavage' && a.parVol) {
      if (!plongesParVol.has(a.service)) plongesParVol.set(a.service, []);
      plongesParVol.get(a.service).push(a);
    }

    // Les lignes robot : un lot à la fois sur chaque machine, dans l'ordre des demandes.
    const lignes = new Map();
    for (const a of ateliers) if (a.type === 'robot') {
      const k = cleLigne(a);
      if (!lignes.has(k)) lignes.set(k, { libre: true, file: [], robots: [] });
      lignes.get(k).robots.push(a);
    }
    for (const l of lignes.values()) l.arrets = arretsDeLigne(l.robots);
    /** Prend la ligne, en attendant qu'elle se libère — pas au-delà de `limite` : rend alors false. */
    function* prendreLigne(k, limite = Infinity) {
      const l = lignes.get(k);
      if (l.libre) { l.libre = false; return true; }
      if (env.maintenant >= limite - 1e-9) return false;
      const ev = env.evenement('ligne ' + k); l.file.push(ev);
      yield Number.isFinite(limite) ? env.unDe([ev, env.delai(limite - env.maintenant)]) : ev;
      if (!ev.declenche) { l.file.splice(l.file.indexOf(ev), 1); return false; }
      return true;
    }
    function rendreLigne(k) {
      const l = lignes.get(k);
      const ev = l.file.shift();
      if (ev) ev.reussir(env.maintenant); else l.libre = true;
    }

    /* ---- le handling 24 h/24 : les tournées (évolution 3) --------------- */
    // Le sale qu'une tournée rapporte arrive à la plonge à la fin du vidage au
    // quai : dans la file du sale (boucle du matériel), et à chaque plonge par
    // vol, qui le lave comme un retour.
    const plongesDynamiques = [];
    function deposerSale(r) {
      arriveesSale.push({ vol: r.vol, cie: r.cie, t: env.maintenant, unites: r.unites });
      if (mat.actif && r.unites > 0) {
        noterFile();
        stock.sale += r.unites; stock.entrees += r.unites;
        file.arrivees.push({ t: env.maintenant, u: r.unites, vol: r.vol, cie: r.cie });
        file.retours.push({ t: env.maintenant, u: r.unites, vol: r.vol });
        noterFile();
        while (reveilsSale.length) { const ev = reveilsSale.shift(); if (!ev.declenche) ev.reussir(env.maintenant); }
      }
      for (const laver of plongesDynamiques) laver(r);
    }
    const suivis24h = new Map();   // handling → l'état de ses vols, pour le bilan
    /**
     * Les tournées d'un handling 24 h/24. Une tournée part dès que ses
     * commandes sont prêtes (et pas plus de `avance` avant le départ), qu'un
     * véhicule de son type et assez de chauffeurs sont libres ; entre deux
     * tournées prêtes, la plus urgente (fin de fenêtre la plus proche) d'abord.
     * Après ses chargements, elle va décharger l'avion arrivé le plus urgent de
     * son type de véhicule, s'il y en a un ; sinon elle rentre. Un vol pas prêt
     * ne retient plus les suivants.
     */
    function lancerHandling24h(a, vue) {
      const R = reglages24h(a);
      const avance = Number.isFinite(+a.avance) && a.avance !== null && a.avance !== '' ? Math.max(0, +a.avance) : AVANCE_HANDLING;
      const cr = creneaux24h(a), parChauffeurs = cr.length > 0;
      // Sans créneau : « N tournées à la fois », sans compter les chauffeurs.
      const simultanes = Math.max(1, Math.floor(+a.simultanes) || 1);
      const conducteurs = [];
      cr.forEach(c => { for (let j = 0; j < c.n; j++) conducteurs.push({ id: (c.veille ? 'v' : '') + (c.creneau + 1) + '.' + (j + 1), creneau: c.creneau, veille: c.veille,
        vehicule: c.vehicule, de: c.de, a: c.a, libre: c.de, heuresSup: 0, rang: conducteurs.length,
        pauses: c.pauses.map(x => ({ du: c.de + x.du, duree: x.duree, max: c.de + x.du + c.retardPause, prise: null })) }); });
      // Les pauses d'une vacation calculée (§ 4) : prises dès qu'elles sont dues, entre deux tournées.
      const prendrePauses = (d, t) => {
        for (const x of d.pauses) { if (x.prise != null) continue; if (x.du > Math.max(d.libre, t) + 1e-9) break; x.prise = Math.max(d.libre, x.du); d.libre = x.prise + x.duree; }
      };
      // Une tournée qui l'empêcherait de prendre sa prochaine pause à temps n'est pas pour lui.
      const tientPause = (d, fin) => { const x = d.pauses.find(y => y.prise == null); return !x || fin <= x.max + 1e-9; };
      const plan = plan24.parVol;
      const mesVols = (volsDe.get(a.id) || []).map(v => {
        const x = plan.get(v.id) || { b: besoin24h(a, { id: v.id, cie: v.cie, std: v.depart }) };
        const attendus = [];
        for (const id of v.classes) for (const s of amontsHandling(a.service, id)) attendus.push({ service: s, classe: id, ev: livraison(s, id) });
        return { v, b: x.b, unites: x.unites || 0, libelle: x.libelle || String(v.id), attendus, pret: null,
          etat: 'attente', dech: x.b.arrivee == null ? null : 'attente', finDech: null, blocage: null };
      });
      // Un renfort (évolution 5) : un chauffeur de plus, de n'importe quel véhicule, jusqu'à la fin de sa présence ;
      // ses pauses restent les siennes. Le répartiteur se réveille quand il arrive.
      let reveil = null;
      const reveiller = () => { if (reveil && !reveil.declenche) reveil.reussir(env.maintenant); };
      const ajouterChauffeur = h => {
        const d = { id: 'renfort ' + h.id, vehicule: '*', de: h.debut, a: h.fin, libre: h.debut, heuresSup: 0, rang: conducteurs.length, renfort: true,
          pauses: h.pauses.filter(p => p.a > h.debut).map(p => ({ du: Math.max(p.de, h.debut), duree: p.a - Math.max(p.de, h.debut), max: Math.max(p.de, h.debut), prise: null })) };
        conducteurs.push(d); conducteurParId.set(d.id, d);
        env.processus(function* () { if (env.maintenant < h.debut) yield env.delai(h.debut - env.maintenant); reveiller(); }, 'renfort ' + h.id);
      };
      suivis24h.set(a.id, { mesVols, conducteurs, parChauffeurs, R, avance, ajouterChauffeur, finir: () => { for (const d of conducteurs) if (d.pauses.length) prendrePauses(d, d.a); } });
      const tournees = vue.tournees = [];
      const dehors = [];             // les tournées sorties : { fin, vehicule }
      // Les chauffeurs d'une tournée : « long courrier » si elle sert un vol long courrier.
      const ch = a.chauffeurs || {}, nb = (v, d) => { const k = +v; return Number.isInteger(k) && k > 0 ? k : d; };
      const chLong = nb(ch.long, 2), chCourt = nb(ch.court, 1);
      suivis24h.get(a.id).chauffeurs = { long: chLong, court: chCourt };
      // Un chargement ne commence pas plus de `avance` minutes avant le départ.
      const ouverture = x => x.b.depart - avance;
      // Les fenêtres de départ d'une tournée : elle part pour arriver à l'avion
      // quand elle peut y travailler, pas avant. Pour charger : à l'ouverture, et
      // son avion déchargé (un avion se décharge avant d'être rechargé).
      // Un plan de chauffeurs calculé (§ 4) : ses tournées partent à l'heure où il les a placées, pas
      // avant, et n'enchaînent que les déchargements qu'il a prévus.
      const prevu = a._plan || null;
      const prevue = (m, x) => (prevu && prevu[m].has(x.v.id) ? prevu[m].get(x.v.id) : -Infinity);
      // (`sansPlan` : sans l'heure du plan.)
      const departCharge = (x, sansPlan) => Math.max(Math.max(ouverture(x), x.finDech ?? -Infinity) - x.b.quaiDepart - x.b.aller, sansPlan ? -Infinity : prevue('charge', x));
      // Un échange (escale courte) : quand l'avion est là, décharger puis charger.
      const departEchange = (x, sansPlan) => Math.max(Math.max(x.b.dispo, ouverture(x) - x.b.dechargement) - x.b.quaiDepart - x.b.aller, sansPlan ? -Infinity : prevue('charge', x));
      // Un déchargement seul attend qu'une tournée passe après un chargement, sauf
      // s'il presse : son départ est prêt et sa fenêtre ouvre, ou il ne reste que
      // le temps d'y aller pour que le vol soit encore chargé à l'heure. Avec un
      // plan : à l'heure prévue, ou, s'il devait suivre un chargement, s'il presse.
      const finDechargement = x => x.b.limite - x.b.charge;
      const presseA = x => finDechargement(x) - x.b.dechargement - x.b.aller;
      const departSeul = x => Math.max(x.b.dispo - x.b.aller, prevu ? (prevu.seul.has(x.v.id) ? prevu.seul.get(x.v.id) : presseA(x))
        : x.pret != null ? Math.min(presseA(x), ouverture(x) - x.b.dechargement - x.b.aller) : presseA(x));
      // Les vagues d'un plan (évolution 8) : une tournée sert les vols que le plan a regroupés quand ils sont tous prêts,
      // sans attendre au point qu'un vol prêt passerait sa limite ; un vol qui manque alors part dans une autre tournée.
      const parVolId = new Map(mesVols.map(x => [x.v.id, x]));
      const vagueDe = x => (prevu && prevu.vague && !x.horsVague && prevu.vague.get(x.v.id)) || null;
      const servable = x => x.etat === 'attente' && x.pret != null && (x.b.courte || x.dech !== 'attente');
      let reveilsVague = [];
      /** La tournée d'une vague du plan, si elle peut partir à `t` : ses vols prêts (ou null). */
      function candidatVague(ids, t) {
        const membres = ids.map(id => parVolId.get(id)).filter(m => m && m.etat === 'attente' && !m.horsVague);
        const prets = membres.filter(servable);
        if (!prets.length) return null;
        // Elle part à l'heure du plan, ou plus tard pour arriver au premier avion quand elle peut y travailler, sa préparation
        // au quai comprise (`quaiParVol` par vol de plus).
        const y = prets[0], depart = Math.max(prevue('charge', y), (y.b.courte ? departEchange(y, true) : departCharge(y, true)) - (prets.length - 1) * y.b.quaiParVol);
        if (t < depart - 1e-9) { reveilsVague.push(depart); return null; }
        const c = { quoi: y.b.courte ? 'echange' : 'charge', x: y, groupe: prets, membres, premier: ids[0], urgence: y.b.limite,
          auPlusTot: Math.max(depart, ...prets.map(m => m.pret)) };
        if (prets.length < membres.length) {
          // Pas tous prêts : la vague les attend, tant que ceux qui le sont restent à l'heure.
          const p = composer(c, t, false);
          const marge = Math.min(...p.charges.map(g => g.b.limite - p.etapes.find(e => e.etape === 'chargement' && e.vol === g.v.id).a));
          if (marge > 1e-9) { reveilsVague.push(t + marge); return null; }
        }
        return c;
      }
      function candidats(t) {
        const out = [], vues = new Set();
        reveilsVague = [];
        for (const x of mesVols) {
          if (x.etat !== 'attente') continue;
          const ids = vagueDe(x);
          if (ids) { if (!vues.has(ids)) { vues.add(ids); const c = candidatVague(ids, t); if (c) out.push(c); } continue; }
          if (x.pret == null) continue;
          if (x.b.courte) { if (t >= departEchange(x) - 1e-9) out.push({ quoi: 'echange', x, urgence: x.b.limite, auPlusTot: Math.max(x.pret, departEchange(x)) }); continue; }
          if (x.dech === 'attente' || t < departCharge(x) - 1e-9) continue;
          out.push({ quoi: 'charge', x, urgence: x.b.limite, auPlusTot: Math.max(x.pret, departCharge(x)) });
        }
        for (const x of mesVols) {
          if (x.dech !== 'attente' || x.b.courte || t < departSeul(x) - 1e-9) continue;
          out.push({ quoi: 'decharge', x, urgence: finDechargement(x), auPlusTot: departSeul(x) });
        }
        return out.sort((p, q) => p.urgence - q.urgence || p.x.b.depart - q.x.b.depart || String(p.x.v.id).localeCompare(String(q.x.v.id))
          || (p.quoi === 'decharge') - (q.quoi === 'decharge'));
      }
      /** La tournée d'un candidat : ses étapes, de son départ à son retour au quai. */
      function composer(c, t, sansLong) {
        const x = c.x, vehicule = x.b.vehicule;
        let etapes = [], charges = [], decharges = [], h = t, dernier = x;
        const pas = (etape, d, vol) => { if (!(d > 0) && etape !== 'chargement' && etape !== 'dechargement') return; const de = h; h += Math.max(0, d); etapes.push({ etape, de, a: h, ...(vol != null ? { vol } : {}) }); };
        const attendre = jusqua => { if (jusqua > h + 1e-9) { etapes.push({ etape: 'attente', de: h, a: jusqua }); h = jusqua; } };
        // Un avion arrivé, du même type de véhicule, à décharger : le plus urgent (avec un plan : un de ceux qu'il a prévus).
        const prevus = prevu ? new Set(c.quoi === 'charge' ? prevu.suite.get(c.premier ?? x.v.id) || [] : []) : null;
        const autresDecharges = () => {
          while (decharges.length < R.dechargementsParTournee) {
            const arrivee = h + R.entreAvions;
            // Pas un avion qu'elle déchargerait trop tard pour que son départ soit encore chargé à l'heure, sauf
            // s'il aurait déjà dû partir seul : mieux vaut tard que jamais.
            const y = mesVols.filter(z => z.dech === 'attente' && !z.b.courte && z.b.vehicule === vehicule && !decharges.includes(z)
              && z.b.dispo <= arrivee + 1e-9 && !(sansLong && z.b.long) && (!prevus || prevus.has(z.v.id))
              && (arrivee + z.b.dechargement <= finDechargement(z) + 1e-9 || t >= departSeul(z) - 1e-9))
              .sort((p, q) => finDechargement(p) - finDechargement(q) || p.b.depart - q.b.depart || String(p.v.id).localeCompare(String(q.v.id)))[0];
            if (!y) return;
            pas('trajet', R.entreAvions);
            pas('dechargement', y.b.dechargement, y.v.id); decharges.push(y); dernier = y;
          }
        };
        // Servir des vols, dans l'ordre des départs (évolution 8) : la préparation au quai une fois (plus `quaiParVol` par
        // vol de plus), l'aller, puis, d'un avion à l'autre en `entreAvions`, décharger l'avion d'un échange, puis le charger.
        const servir = membres => {
          etapes = []; charges = []; decharges = []; h = t;
          const arrivees = [], fins = [];
          pas('quai-depart', x.b.quaiDepart + (membres.length - 1) * x.b.quaiParVol);
          pas('aller', x.b.aller);
          membres.forEach((g, i) => {
            if (i) pas('trajet', R.entreAvions);
            arrivees.push(h);
            if (g.b.courte) { attendre(g.b.dispo); pas('dechargement', g.b.dechargement, g.v.id); decharges.push(g); }
            // Son avion déchargé par une autre tournée : on attend qu'elle ait fini ; et pas avant `avance`.
            attendre(Math.max(g.finDech != null ? g.finDech : -Infinity, ouverture(g)));
            pas('chargement', g.b.charge, g.v.id); charges.push(g); fins.push(h); dernier = g;
          });
          return { arrivees, fins, h };
        };
        // La durée d'une tournée qui ne servirait que ces vols : jusqu'au retour, et au vidage s'il y a un échange.
        const duree = (r, l) => { const e = l.find(g => g.b.courte); return r.h - t + l[l.length - 1].b.retour + (e ? e.b.quaiRetour : 0); };
        if (c.quoi === 'decharge') {
          pas('aller', x.b.aller); attendre(x.b.dispo);
          pas('dechargement', x.b.dechargement, x.v.id); decharges.push(x);
          autresDecharges();
        } else {
          // Les vols de la tournée : ce vol, puis — ceux de sa vague, avec un plan ; sans plan, les suivants de la même
          // compagnie et du même véhicule, prêts — jusqu'à `parTournee`. Chacun chargé avant sa limite, sans mettre en
          // retard ceux d'avant ; sinon il part dans une autre tournée.
          let membres = [x];
          const n = x.b.parTournee;
          const liste = c.seul ? [] : c.groupe ? c.groupe.slice(1) : prevu || n < 2 ? []
            : mesVols.filter(w => w !== x && w.etat === 'attente' && w.pret != null && (w.b.courte || w.dech !== 'attente')
              && w.b.cie === x.b.cie && w.b.vehicule === vehicule && w.b.depart >= x.b.depart);
          if (liste.length) {
            const aHeure = (r, i, g) => r.fins[i] <= g.b.limite + 1e-9;
            let r0 = servir(membres);
            for (const w of liste) {
              if (membres.length >= n) break;
              const essai = membres.concat([w]), r = servir(essai), i = essai.length - 1;
              if (!aHeure(r, i, w) || membres.some((g, j) => aHeure(r0, j, g) && !aHeure(r, j, g))) continue;
              if (!c.groupe) {
                // Sans plan : sans attendre à son avion, et sans plus de minutes-chauffeur que deux tournées.
                if (ouverture(w) > r.arrivees[i] + (w.b.courte ? w.b.dechargement : 0) + 1e-9 || (w.b.courte && w.b.dispo > r.arrivees[i] + 1e-9)) continue;
                const seule = w.b.quaiDepart + w.b.aller + (w.b.courte ? w.b.dechargement + w.b.quaiRetour : 0) + w.b.charge + w.b.retour;
                if (duree(r, essai) - duree(r0, membres) > seule + 1e-9) continue;
              }
              membres = essai; r0 = r;
            }
          }
          servir(membres);
          autresDecharges();
        }
        pas('retour', dernier.b.retour);
        // Le vidage au quai : une fois pour les échanges de la tournée, et pour chaque autre avion déchargé.
        const echanges = decharges.filter(g => charges.includes(g)), autres = decharges.filter(g => !charges.includes(g));
        if (decharges.length) pas('quai-retour', (echanges.length ? echanges[0].b.quaiRetour : 0) + autres.reduce((k, g) => k + g.b.quaiRetour, 0));
        const long = charges.concat(decharges).some(g => g.b.long);
        return { etapes, fin: h, charges, decharges, long, vehicule, echange: echanges.length > 0, chauffeurs: long ? chLong : chCourt };
      }
      /** Les chauffeurs d'une tournée : de son véhicule, à leur poste à son départ, libres, qui la finissent dans leurs heures (ou leurs heures sup). */
      const conducteurParId = new Map(conducteurs.map(d => [d.id, d]));
      function choisir(p, t, c) {
        for (const d of conducteurs) if (d.pauses.length) prendrePauses(d, t);
        const peutMener = d => (d.vehicule === p.vehicule || d.vehicule === '*') && d.de <= t + 1e-9 && t < d.a - 1e-9 && d.libre <= t + 1e-9
          && p.fin <= d.a + (d.renfort ? 0 : SUP) + 1e-9 && tientPause(d, p.fin);
        // Le plan dit qui la mène : eux, s'ils le peuvent.
        const voulus = prevu && c ? prevu.chauffeurs.get((c.quoi === 'decharge' ? 'd:' : 'c:') + (c.premier ?? c.x.v.id)) : null;
        if (voulus) { const l = voulus.map(id => conducteurParId.get(id)).filter(d => d && peutMener(d)); if (l.length >= p.chauffeurs) return l.slice(0, p.chauffeurs); }
        const ok = conducteurs.filter(peutMener);
        if (ok.length < p.chauffeurs) return null;
        ok.sort((u, w) => ((p.fin > u.a + 1e-9) - (p.fin > w.a + 1e-9)) || u.a - w.a || u.rang - w.rang);
        return ok.slice(0, p.chauffeurs);
      }
      /** Lancer une tournée si son véhicule et ses chauffeurs sont là ; sinon dire ce qui manque. */
      function essayer(c, t) {
        const vehicule = c.x.b.vehicule;
        // Un vol qui attend un chauffeur peut appeler un renfort (évolution 5).
        const noter = raison => { for (const g of c.groupe || [c.x]) g.blocage = raison; if (raison === 'chauffeur' && REN) repartir(); return false; };
        if (dehors.filter(o => o.vehicule === vehicule).length >= R.flotte[vehicule]) return noter('vehicule');
        if (!parChauffeurs && dehors.length >= simultanes) return noter('chauffeur');
        let p = composer(c, t, false), pris = parChauffeurs ? choisir(p, t, c) : [];
        // Une tournée qui sert plusieurs vols et ne trouve pas ses chauffeurs : le premier seul, s'il les trouve (évolution 8).
        if (!pris && p.charges.length > 1) { const q = composer({ ...c, seul: true }, t, false), l = choisir(q, t, c); if (l) { p = q; pris = l; } }
        // Un long courrier à décharger demanderait plus de chauffeurs : la tournée s'en passe.
        if (!pris && p.long && !c.x.b.long && c.quoi !== 'decharge') { p = composer(c, t, true); pris = choisir(p, t, c); }
        if (!pris) return noter('chauffeur');
        lancer(p, pris, t, c);
        return true;
      }
      function lancer(p, pris, t, c) {
        const n = tournees.length + 1;
        const tournee = { n, vehicule: p.vehicule, chauffeurs: p.chauffeurs, conducteurs: pris.map(d => d.id), depart: t, retour: p.fin,
          etapes: p.etapes, charges: p.charges.map(g => g.v.id), decharges: p.decharges.map(g => g.v.id), ...(p.echange ? { echange: true } : {}), heuresSup: 0 };
        for (const d of pris) { d.libre = p.fin; const sup = Math.max(0, p.fin - d.a); d.heuresSup += sup; tournee.heuresSup += sup; }
        tournees.push(tournee);
        dehors.push({ fin: p.fin, vehicule: p.vehicule });
        for (const g of p.decharges) {
          const e = p.etapes.find(z => z.etape === 'dechargement' && z.vol === g.v.id);
          g.dech = 'fait'; g.finDech = e.a; g.debutDech = e.de; g.tourneeDech = n;
        }
        for (const g of p.charges) {
          const e = p.etapes.find(z => z.etape === 'chargement' && z.vol === g.v.id);
          g.etat = 'fait'; g.debutCharge = e.de; g.finCharge = e.a; g.tournee = n;
          // L'attente d'un véhicule ou de chauffeurs : entre l'heure où la tournée pouvait partir et son départ.
          const w = g.v, attente = g === c.x ? Math.max(0, t - c.auPlusTot) : 0;
          g.attente = attente;
          const ligne = { atelier: a.id, service: a.service, nom: 'Vol ' + w.id, vol: w.id, cie: w.cie, classes: w.classes.slice(), pax: { ...w.pax },
            depart: w.depart, handling: true, debut: e.de, fin: e.a, duree: g.b.charge, attente, arret: 0, pret: g.pret, impossible: false,
            trajet: { depart: t, retour: p.fin, vols: tournee.charges, aller: g.b.aller, dureeRetour: g.b.retour }, camion: n, tournee: n,
            vehicule: p.vehicule, chauffeurs: p.chauffeurs, categorie: g.b.long ? 'long' : 'court', attenteChauffeurs: attente,
            limite: g.b.limite, retard: Math.max(0, e.a - g.b.limite), aHeure: e.a <= g.b.limite + 1e-9 };
          journal.push(ligne); vue.lots.push(ligne);
        }
        // Les vols de sa vague qu'elle n'a pas pris partent dans une autre tournée.
        for (const m of c.membres || []) if (m.etat === 'attente') m.horsVague = true;
        vue.travail += p.fin - t; vue.fin = Math.max(vue.fin ?? -Infinity, p.fin);
        // Le sale rapporté arrive à la plonge à la fin du vidage au quai.
        if (p.decharges.length) env.processus(function* () {
          if (env.maintenant < p.fin) yield env.delai(p.fin - env.maintenant);
          for (const g of p.decharges) deposerSale({ vol: g.libelle, cie: g.v.cie, t: env.maintenant, unites: g.unites });
        }, 'sale ' + a.nom + ' ' + n);
      }
      /** Le prochain instant où quelque chose peut changer. */
      function prochain(t) {
        let m = Infinity;
        const voir = u => { if (Number.isFinite(u) && u > t + 1e-9 && u < m) m = u; };
        for (const o of dehors) voir(o.fin);
        for (const x of mesVols) {
          if (x.etat === 'attente' && x.pret != null) { if (x.b.courte) voir(departEchange(x)); else if (x.dech !== 'attente') voir(departCharge(x)); }
          if (x.dech === 'attente' && !x.b.courte) voir(departSeul(x));
        }
        for (const d of conducteurs) { voir(d.de); voir(d.libre); }
        for (const u of reveilsVague) voir(u);
        return m;
      }
      const repartiteur = env.processus(function* () {
        for (let garde = 0; garde < 100000; garde++) {
          const t = env.maintenant;
          for (const x of mesVols) if (x.pret == null && x.attendus.every(e => e.ev.declenche))
            x.pret = x.attendus.length ? Math.max(...x.attendus.map(e => livreA.get(cle(e.service, e.classe)) ?? t)) : t;
          for (let i = dehors.length - 1; i >= 0; i--) if (dehors[i].fin <= t + 1e-9) dehors.splice(i, 1);
          // Autant de tournées que les véhicules et les chauffeurs le permettent, la plus urgente d'abord.
          for (let parti = true; parti;) { parti = false; for (const c of candidats(t)) if (essayer(c, t)) { parti = true; break; } }
          const reste = mesVols.some(x => x.etat === 'attente' || x.dech === 'attente');
          if (!reste) break;
          const u = prochain(t);
          const commandes = mesVols.filter(x => x.etat === 'attente' && x.pret == null).flatMap(x => x.attendus.filter(e => !e.ev.declenche).map(e => e.ev));
          if (!Number.isFinite(u) && !commandes.length && !(REN && receveurs.has(a.id))) break;
          if (REN && receveurs.has(a.id)) reveil = env.evenement('renfort');
          yield env.unDe([...commandes, ...(Number.isFinite(u) ? [env.delai(u - t)] : []), ...(reveil && !reveil.declenche ? [reveil] : [])]);
        }
      }, a.nom);
      // Tous ses vols partis, le handling libère ses renforts, chacun au retour de sa dernière tournée.
      const Rh = REN ? receveurs.get(a.id) : null;
      if (Rh) repartiteur.surResolution(() => {
        Rh.fini = true;
        for (const h of Rh.aides.slice()) {
          const d = conducteurParId.get('renfort ' + h.id), libre = d ? d.libre : env.maintenant;
          env.processus(function* () {
            if (env.maintenant < libre) yield env.delai(libre - env.maintenant);
            if (h.aide === Rh) { liberer(h, env.maintenant, false); repartir(); }
          }, 'retour ' + h.id);
        }
      });
    }

    /**
     * Le travail d'un lot (ses commandes `ids`) pour une équipe : sa durée avec
     * son effectif, son détail, et `base` — la même durée pour une seule
     * personne (à la main) ou pour un robot armé, qui sert quand un renfort
     * change l'effectif (évolution 5).
     */
    function travailDuLot(a, ids) {
      const lots = ids.map(id => parClasse.get(id)).filter(Boolean);
      let duree, detail, base;
      if (a.type === 'robot') {
        // Chaque commande à son débit : ses plateaux ÷ son débit.
        const plateaux = lots.reduce((n, c) => n + c.pax, 0);
        const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
        const heures = lots.reduce((n, c) => n + c.pax / Math.max(1e-9, debitRobot(a, c.id)), 0);
        // Calculé à 0 personne, sans plateau ce jour-là (correction 10) : sa commande se fait en temps nul.
        duree = a.personnes >= mini ? heures * 60 : effectifs[a.id] && !(heures > 0) ? 0 : Infinity;
        detail = { plateaux, debit: plateaux && heures ? Math.round(plateaux / heures) : a.debit };
        base = heures * 60;
      } else {
        // Chaque ligne ne compte que ses classes : dans une case « TX BC puis
        // TX PC », TX BC sort après ses seules minutes, sans attendre TX PC.
        const hommeMinutes = sansMinutes(a) ? 0 : lots.reduce((n, c) => n + travailDans(a, c, bareme, SPML), 0);
        const f = fusionDe(a);
        if (sansMinutes(a)) {
          // Effectif constant : ni minutes par vol, ni durée. La commande passe
          // dans ses heures de présence (06/10).
          duree = 0;
          detail = { hommeMinutes: 0, constant: true };
          base = 0;
        } else if (f) {
          // L'étape d'avant, faite à la chaîne par la même case.
          // Seules les commandes dont elle fait vraiment l'étape d'avant : une
          // commande qu'une case de la Prépa fait encore n'est pas comptée deux fois.
          const avant = lots.filter(c => fusionPar.get(cle(f, c.id)) === a.service).reduce((n, c) => n + travailClasse(f, c, bareme, SPML), 0);
          duree = dureeFusion(avant, hommeMinutes, a.personnes) / rendement;
          detail = { hommeMinutes: hommeMinutes + avant, fusion: f, minutesFusion: avant, minutesIci: hommeMinutes };
          base = Number.isFinite(duree) && a.personnes > 0 ? duree * a.personnes : (hommeMinutes + avant) / rendement;
        } else {
          duree = hommeMinutes / a.personnes / rendement;
          detail = { hommeMinutes };
          base = hommeMinutes / rendement;
        }
        // Une équipe calculée à 0 personne n'a rien à faire ce jour-là (correction 10) : ses commandes sans vol
        // se font en temps nul, comme avec la personne « en temps nul » d'avant, et l'aval est servi.
        if (effectifs[a.id] && !(a.personnes > 0) && !(detail.hommeMinutes > 0)) { duree = 0; base = 0; }
      }
      return { lots, duree, detail, base };
    }

    /* ---- les renforts (évolution 5) ------------------------------------ */
    // Qui peut aider qui : son propre service et ses annexes, toujours, pour leurs équipes à la main ; la liste
    // saisie en ajoute d'autres (correction du banc d'essai : elle ne remplace plus le défaut). Jamais une mise à
    // disposition ; vers un robot ou le handling, seulement si la liste saisie le dit (et c'est elle aussi qui
    // envoie une personne de la plonge vers une zone alimentaire).
    const peutAider = (de, vers) => {
      if (!(vers.type === 'manuel' || vers.type === 'robot' || (vers.type === 'handling' && vers.handling24h === true))) return false;
      if (vers.type === 'manuel' && memeService(de, vers.service)) return true;
      const saisie = REN.polyvalence.get(de);
      return !!saisie && saisie.has(vers.service);
    };
    // « Du même service » : le sien, ou une salle de la même famille.
    const memeService = (de, vers) => de === vers || (REN.familles.get(de) || new Set()).has(vers);
    // Qui prête : une équipe qui a un vrai travail (pas une mise à disposition, ni une équipe sans minutes par vol).
    const pretable = a => ((a.type === 'manuel' && !sansMinutes(a)) || a.type === 'robot') && a.personnes > 0
      && (a.lots || []).some(l => classesDuLot(l).length);
    const aidants = [], receveurs = new Map();
    if (REN) {
      const preteurs = ateliers.filter(pretable);
      for (const a of ateliers) {
        // Un handling dont le moteur calcule les chauffeurs (§ 4) n'en reçoit pas : son plan les compte déjà au plus juste.
        if (a.type === 'handling' ? !(a.handling24h === true && plan24 && creneauxDe(a).length && !(a.chauffeurs && a.chauffeurs.mode === 'calcules'))
          : !((a.type === 'manuel' || a.type === 'robot') && (a.lots || []).some(l => classesDuLot(l).length))) continue;
        if (!preteurs.some(x => x !== a && peutAider(x.service, a))) continue;
        const v = parId.get(a.id), reg = normaliserRegime(a.regime, opts.regime);
        const lotsIds = (a.lots || []).map(classesDuLot).filter(ids => ids.length);
        // Le handling 24 h/24 n'a pas de poste d'équipe : ses chauffeurs ont leurs créneaux.
        const h24 = a.type === 'handling';
        receveurs.set(a.id, { id: a.id, a, service: a.service, aides: [], proc: null, enTache: false, attend: false, fini: false, segment: null, lireEtat: null,
          debutPoste: h24 ? -Infinity : v.debut, finPresence: reg.actif && !h24 ? v.debut + reg.presence : Infinity, finPoste: reg.actif && !h24 ? v.debut + reg.presence + SUP : Infinity,
          regime: reg, pauses: a.type === 'robot' ? fusionnerPauses([pausesDe(a), lignes.get(cleLigne(a)).arrets]) : pausesDe(a),
          mini: a.personnesMin === undefined ? 1 : a.personnesMin,
          // Pour chaque lot : son travail en minutes-personne (un robot : ses minutes de ligne), et l'échéance de ses commandes.
          bases: a.type === 'handling' ? [] : lotsIds.map(ids => travailDuLot(a, ids).base),
          echeances: a.type === 'handling' ? [] : lotsIds.map(ids => Math.min(...ids.map(id => (parClasse.get(id) || {}).echeance).filter(Number.isFinite), Infinity)) });
      }
    }
    /** Une personne prêtée est-elle en pause à l'instant t ? Ses pauses sont celles de son équipe. */
    const enPause = (h, t) => h.pauses.some(p => t >= p.de - 1e-9 && t < p.a - 1e-9);
    /** L'effectif qu'apportent les renforts arrivés, hors de leurs pauses : en personnes, et en personnes « efficaces ». */
    function apport(R, t) {
      let efficace = 0, personnes = 0;
      for (const h of R.aides) if (t >= h.debut - 1e-9 && t < h.fin - 1e-9 && !enPause(h, t)) { efficace += h.efficacite; personnes++; }
      return { efficace, personnes };
    }
    /** Le prochain instant où l'effectif d'une équipe aidée change : un renfort arrive, part, ou prend sa pause. */
    function prochainChangement(R, t) {
      let m = Infinity;
      const voir = u => { if (u > t + 1e-9 && u < m) m = u; };
      for (const h of R.aides) { voir(h.debut); voir(h.fin); for (const p of h.pauses) { voir(p.de); voir(p.a); } }
      return m;
    }
    const robotArme = (R, t) => R.a.personnes + apport(R, t).personnes >= R.mini;
    /**
     * Où en est une équipe à l'instant t : son lot, le travail qui lui reste (en
     * minutes-personne ; un robot : en minutes de ligne), son travail du poste
     * et ses pauses prises — au milieu d'une tâche aussi —, et l'heure où elle
     * reprend si elle est en pause.
     */
    function avancement(R, t) {
      const e = R.lireEtat ? R.lireEtat() : null; if (!e) return null;
      const g = R.segment;
      let rho = 1, cumul = e.cumul, prises = new Set(e.prises), reprise = t;
      if (g) {
        rho = g.rho; cumul = g.cumul; prises = new Set(g.prises); reprise = Math.max(t, g.t0);
        if (Number.isFinite(g.dRest) && t > g.t0) {
          const p = executerJusqua({ depart: g.t0, duree: g.dRest, cumul: g.cumul, prises, pauses: R.pauses, regime: R.regime, finPoste: R.finPoste }, t);
          rho = g.rho * Math.max(0, 1 - p.fait / g.dRest); cumul = p.cumul; reprise = p.reprise;
        }
      }
      let reste = 0;
      for (const j of e.restants) reste += (j === e.lot ? rho : 1) * R.bases[j];
      return { lot: e.lot, restants: e.restants, reste, cumul, prises, reprise };
    }
    /** Le travail qui reste à une équipe, en minutes-personne (un robot : en minutes de ligne). */
    function resteDe(R, t) {
      if (R.a.type === 'handling') { const s = suivis24h.get(R.id); return s ? s.mesVols.filter(x => x.etat === 'attente').length : 0; }
      const e = avancement(R, t);
      return e ? e.reste : 0;
    }
    /** L'échéance la plus proche des commandes qui restent à une équipe. */
    function echeanceDe(R, t) {
      if (R.a.type === 'handling') { const s = suivis24h.get(R.id); return s ? Math.min(...s.mesVols.filter(x => x.etat === 'attente' && x.blocage === 'chauffeur').map(x => x.b.limite), Infinity) : Infinity; }
      const e = R.lireEtat ? R.lireEtat() : null; if (!e) return Infinity;
      return Math.min(...e.restants.map(j => R.echeances[j]), Infinity);
    }
    /**
     * Une équipe risque-t-elle de dépasser sa présence ? À la main : ce qui lui
     * reste, au rythme de son effectif du moment, finit après. Un robot : il
     * n'a pas assez de monde pour tourner. Le handling : des vols attendent un
     * chauffeur.
     */
    function aRisque(R, t) {
      if (R.fini) return false;
      if (R.a.type === 'handling') { const s = suivis24h.get(R.id); return !!s && s.mesVols.some(x => x.etat === 'attente' && x.pret != null && x.blocage === 'chauffeur'); }
      const e = avancement(R, t); if (!e || !e.restants.length) return false;
      if (R.a.type === 'robot') return R.a.personnes + R.aides.filter(h => h.fin > t + 1e-9).length < R.mini;
      return finProjetee(R, e) > R.finPresence + 1e-9;
    }
    /**
     * L'heure où une équipe à la main finirait ce qui lui reste (en minutes-
     * personne), avec son effectif et les renforts qu'elle a déjà : chacun
     * compte de son arrivée à son départ, hors de ses pauses ; les pauses de
     * l'équipe arrêtent tout le monde.
     */
    function finProjetee(R, e) {
      const prises = new Set(e.prises);
      let tau = e.reprise, w = e.reste, cumul = e.cumul;
      for (let garde = 0; garde < 10000; garde++) {
        if (w <= 1e-9) return tau;
        const vitesse = R.a.personnes + apport(R, tau).efficace, suivant = prochainChangement(R, tau);
        if (!(vitesse > 1e-9)) { if (!Number.isFinite(suivant)) return Infinity; tau = suivant; continue; }
        const o = { depart: tau, duree: w / vitesse, cumul, prises, pauses: R.pauses, regime: R.regime, finPoste: Infinity };
        const p = executerJusqua(o, suivant);
        if (p.fait >= o.duree - 1e-9) return p.t;
        w -= p.fait * vitesse; cumul = p.cumul; tau = Math.max(suivant, p.reprise);
      }
      return Infinity;
    }
    /** Une équipe ne reçoit pas plus de renforts que ses postes de travail (`personnesMax`) ; sans lui, pas de limite. */
    const placeLibre = (R, t) => R.a.type === 'handling' || !(Number.isInteger(R.a.personnesMax) && R.a.personnesMax > 0)
      || R.a.personnes + R.aides.filter(h => h.fin > t + 1e-9).length < R.a.personnesMax;
    /** Les minutes qu'une personne a passées à aider, entre deux instants, hors de ses pauses. */
    function minutesAidees(h, de, a) {
      if (!(a > de)) return 0;
      let m = a - de;
      for (const p of h.pauses) m -= Math.max(0, Math.min(a, p.a) - Math.max(de, p.de));
      return Math.max(0, m);
    }
    /** Une personne quitte l'équipe qu'elle aidait : ce qu'elle lui a donné est compté. */
    function liberer(h, t, part) {
      const R = h.aide; if (!R) return;
      const a = Math.min(t, h.fin), m = minutesAidees(h, h.depuis, a);
      if (m > 0) {
        h.parts.set(R.id, (h.parts.get(R.id) || 0) + m);
        h.sup += minutesAidees(h, Math.max(h.depuis, h.finPresence), a);
      }
      R.aides.splice(R.aides.indexOf(h), 1);
      h.aide = null; h.libre = part ? Infinity : t;
    }
    /** Une personne rejoint une équipe : elle y travaille après le délai (déplacement, lavage des mains, tenue). */
    function affecter(h, R, t) {
      h.aide = R; h.depuis = t; h.debut = t + REN.delai;
      h.efficacite = memeService(h.service, R.service) ? REN.efficacite : REN.autre;
      R.aides.push(h);
      // Vers le handling : un chauffeur de plus, de n'importe quel véhicule, jusqu'à la fin de sa présence.
      if (R.a.type === 'handling') { const s = suivis24h.get(R.id); if (s && s.ajouterChauffeur) s.ajouterChauffeur(h); }
      else if ((R.enTache || R.attend) && R.proc && !R.proc.declenche && env.processusActif !== R.proc) R.proc.interrompre('renfort');
      // Elle repart à la fin de sa propre présence.
      if (Number.isFinite(h.fin)) env.processus(function* () {
        if (env.maintenant < h.fin) yield env.delai(h.fin - env.maintenant);
        if (h.aide === R) { liberer(h, env.maintenant, true); repartir(); }
      }, 'renfort ' + h.id);
      // Restée en heures sup (versHeuresSup), elle n'attend pas avec l'équipe : si, à la fin de sa présence,
      // l'équipe aidée n'est pas en train de travailler, elle part.
      if (Number.isFinite(h.finPresence) && h.fin > h.finPresence + 1e-9) env.processus(function* () {
        if (env.maintenant < h.finPresence) yield env.delai(h.finPresence - env.maintenant);
        if (h.aide === R && !R.enTache) { liberer(h, env.maintenant, true); repartir(); }
      }, 'renfort ' + h.id + ' (fin de présence)');
    }
    /** L'équipe aidée va attendre : ses renforts en heures sup s'en vont (correction du banc d'essai). */
    function congedier(R) {
      if (!R) return;
      const t = env.maintenant;
      for (const h of R.aides.slice()) if (t >= h.finPresence - 1e-9) liberer(h, t, true);
    }
    /**
     * Les personnes libres vont aux équipes qui risquent de dépasser leur
     * présence : celle dont les commandes partent le plus tôt d'abord ; à
     * égalité, celle à qui il reste le plus de travail. Chacune prend d'abord
     * une personne de son service (elle y compte davantage).
     */
    function repartir() {
      if (!REN) return;
      const t = env.maintenant;
      for (let garde = 0; garde < 10000; garde++) {
        // En heures sup, un renfort n'en commence pas d'autre (correction du banc d'essai : on ne paie personne à attendre).
        const libres = aidants.filter(h => !h.aide && h.libre <= t + 1e-9 && t + REN.delai < h.fin - 1e-9 && t < h.finPresence - 1e-9);
        if (!libres.length) return;
        const cands = [...receveurs.values()].filter(R => !R.fini && t >= R.debutPoste - 1e-9 && t + REN.delai < R.finPoste - 1e-9 && placeLibre(R, t) && aRisque(R, t))
          .map(R => ({ R, e: echeanceDe(R, t), r: resteDe(R, t) }))
          .sort((x, y) => x.e - y.e || y.r - x.r || String(x.R.id).localeCompare(String(y.R.id)));
        let choix = null;
        for (const { R } of cands) {
          const h = libres.filter(x => x.de !== R.a && peutAider(x.service, R.a))
            .sort((x, y) => (memeService(y.service, R.service) - memeService(x.service, R.service)) || x.libre - y.libre || x.rang - y.rang)[0];
          if (h) { choix = { R, h }; break; }
        }
        if (!choix) return;
        affecter(choix.h, choix.R, t);
      }
    }
    /** Une équipe a fini ses lots avant la fin de sa présence : ses personnes deviennent des renforts. */
    function preter(a, t, prises) {
      if (!REN || !pretable(a)) return;
      const v = parId.get(a.id), reg = normaliserRegime(a.regime, opts.regime);
      const finPresence = reg.actif ? v.debut + reg.presence : Infinity;
      if (!(t + REN.delai < finPresence - 1e-9)) return;
      // Pas d'heures sup en renfort, sauf si on les permet (et seulement si les heures sup le sont).
      const fin = REN.versHeuresSup && SUP > 0 && Number.isFinite(finPresence) ? finPresence + SUP : finPresence;
      // Ses pauses restent les siennes : les arrêts de son équipe, et ses pauses de régime pas encore prises, à leur heure.
      const pauses = pausesDe(a).map(p => ({ de: p.de, a: p.a }));
      let avant = 0;
      for (const x of reg.seuils) { if (!prises.has(x.apres)) { const de = v.debut + x.apres + avant; pauses.push({ de, a: de + x.duree }); } avant += x.duree; }
      pauses.sort((x, y) => x.de - y.de || x.a - y.a);
      for (let i = 0; i < a.personnes; i++) aidants.push({ id: a.id + '#' + (i + 1), de: a, service: a.service, libre: t, fin, finPresence, pauses,
        aide: null, depuis: null, debut: null, efficacite: 0, rang: aidants.length, parts: new Map(), sup: 0 });
      repartir();
    }
    /**
     * Une tâche dont l'effectif peut changer en cours de route (une équipe qui
     * peut recevoir des renforts). Sans renfort, exactement `executerTache`.
     * Quand l'effectif change, le temps qui reste se recalcule : travail
     * restant ÷ (personnes + somme des efficacités des renforts) ÷ rendement.
     * Un robot, lui, tourne à son débit quand il a son minimum de personnes.
     * @param o { duree, base, cumul, prises, pauses, regime, finPoste, robot }
     */
    function* tacheAvecRenforts(R, o) {
      const n = R.a.personnes;
      let rho = 1, cumul = o.cumul, arret = 0, fait = 0, aide = false, reprise = -Infinity, attenteRenfort = 0;
      R.enTache = true;
      try {
        for (let garde = 0; garde < 100000; garde++) {
          const t0 = env.maintenant;
          if (t0 >= o.finPoste - 1e-9) return { fin: o.finPoste, arret, cumul, fait, tronque: true, aide, attenteRenfort };
          const ap = apport(R, t0);
          let dRest;
          // Calculée à 0 personne, sans travail (correction 10) : sa commande se fait en temps nul, sans attendre de renfort.
          const vide = !!effectifs[R.a.id] && !(o.base > 0);
          if (o.robot) dRest = n + ap.personnes >= R.mini || vide ? rho * o.base : Infinity;
          else if (!ap.personnes) dRest = n > 0 || vide ? rho * o.duree : Infinity;     // son effectif seul : la durée d'avant, telle quelle
          else dRest = rho * o.base / (n + ap.efficace);
          if (ap.personnes && Number.isFinite(dRest)) aide = true;
          const debut = Math.max(t0, reprise), prochain = prochainChangement(R, t0);
          const copie = new Set(o.prises);
          const res = Number.isFinite(dRest) ? executerTache({ depart: debut, duree: dRest, cumul, prises: copie, pauses: o.pauses, regime: o.regime, finPoste: o.finPoste }) : null;
          const fin = res ? Math.min(res.fin, prochain) : Math.min(prochain, o.finPoste);
          R.segment = { t0: debut, dRest, rho, cumul, prises: new Set(o.prises) };
          let interrompu = false;
          try { yield Number.isFinite(fin) ? env.delai(Math.max(0, fin - t0)) : env.evenement('attente d’un renfort'); }
          catch (e) { if (!(e instanceof Noyau.Interruption)) throw e; interrompu = true; }
          const t1 = env.maintenant;
          if (res && !interrompu && t1 >= res.fin - 1e-9) {
            for (const x of copie) o.prises.add(x);
            return { fin: res.fin, arret: arret + (debut - t0) + res.arret, cumul: res.cumul, fait: fait + res.fait, tronque: res.tronque, aide, attenteRenfort };
          }
          if (!res) { attenteRenfort += t1 - t0; continue; }
          if (t1 <= debut + 1e-9) { arret += t1 - t0; continue; }   // encore en pause
          const p = executerJusqua({ depart: debut, duree: dRest, cumul, prises: o.prises, pauses: o.pauses, regime: o.regime, finPoste: o.finPoste }, t1);
          arret += (debut - t0) + p.arret; cumul = p.cumul; fait += p.fait;
          rho *= Math.max(0, 1 - p.fait / dRest);
          reprise = p.reprise > t1 + 1e-9 ? p.reprise : -Infinity;
          if (rho <= 1e-9) return { fin: t1, arret, cumul, fait, tronque: false, aide, attenteRenfort };
        }
        throw new Error('Trop de changements d’effectif pour achever une tâche.');
      } finally { R.enTache = false; R.segment = null; }
    }

    for (const a of ateliers) {
      const vue = parId.get(a.id);
      // Un robot s'arrête aussi quand sa ligne s'arrête.
      const pauses = a.type === 'robot' ? fusionnerPauses([pausesDe(a), lignes.get(cleLigne(a)).arrets]) : pausesDe(a);
      const depart = vue.debut;
      const regime = normaliserRegime(a.regime, opts.regime);
      // La présence payée, puis les heures sup permises : l'équipe s'en va au plus
      // tard à la fin des deux. L'effectif calculé, lui, ne compte que la présence.
      const finPresence = regime.actif ? depart + regime.presence : Infinity;
      const finPoste = regime.actif ? finPresence + SUP : Infinity;
      // Le début du poste et sa présence (les noms de la version 2), et son jour :
      // ce qu'un banc d'essai compare aux heures pointées (docs/BANC_ESSAI.md).
      vue.debutPoste = depart;
      vue.presence = regime.actif ? regime.presence : null;
      vue.jour = a.jour || 0;
      const prises = new Set();   // pauses de régime déjà prises dans ce poste
      let cumul = 0;              // travail effectif depuis le début du poste
      vue.finPoste = Number.isFinite(finPoste) ? finPoste : null;
      // Une équipe d'appui est présente à ses heures ; elle ne fait rien attendre.
      if (a.type === 'appui') {
        vue.appui = true;
        // Elle part à la fin de sa présence : pas d'heures sup, rien ne la retient.
        if (regime.actif) vue.finPoste = vue.fin = depart + regime.presence;
        continue;
      }

      // Une mise à disposition ne travaille pas : elle ouvre. Une seule ligne
      // de journal, portée par toutes les classes, pour que le parcours la
      // montre sans encombrer le planning de vingt barres de largeur nulle.
      if (a.type === 'dispo') {
        const des = disponibleDes(a);
        const ouverture = Math.max(env.maintenant, Number.isFinite(des) ? des : env.maintenant);
        vue.debut = ouverture; vue.finPoste = null;
        env.processus(function* () {
          if (env.maintenant < ouverture) yield env.delai(ouverture - env.maintenant);
          const ids = classes.map(c => c.id);
          for (const id of ids) livrer(a.service, id);
          const ligne = { atelier: a.id, service: a.service, nom: 'mise à disposition',
            classes: ids, debut: env.maintenant, fin: env.maintenant, duree: 0,
            attente: 0, arret: 0, impossible: false, dispo: true };
          journal.push(ligne); vue.lots.push(ligne); vue.fin = env.maintenant;
        }, a.nom);
        continue;
      }

      // Le handling 24 h/24 : des tournées menées en parallèle (évolution 3).
      if (a.type === 'handling' && a.handling24h === true && plan24) { lancerHandling24h(a, vue); continue; }

      if (a.type === 'handling') {
        const mesVols = volsDe.get(a.id) || [];
        const k = Math.max(1, Math.floor(+a.simultanes) || 1);
        const avance = Number.isFinite(+a.avance) && a.avance !== null && a.avance !== '' ? Math.max(0, +a.avance) : AVANCE_HANDLING;
        const suspendu = { vol: null, attendus: [] };
        suspendus.set(a.id, suspendu);
        // Des créneaux de chauffeurs : chaque camion prend les siens (2 long courrier, 1 court).
        // Sans créneau : « N vols à la fois », N camions sans compter les chauffeurs.
        const creneaux = creneauxDe(a), parChauffeurs = creneaux.length > 0, occupes = [];
        const camionsMax = parChauffeurs ? (Math.floor(+a.camions) > 0 ? Math.floor(+a.camions) : Infinity) : k;
        // Combien de vols un camion charge : propre à la compagnie (retour d'usage : « cela dépend de la compagnie »).
        const parCamionDe = cie => volsParCamionDe(a, cie);
        const auPlusTotDe = v => Math.max(0, v.depart - avance);
        const attendusDe = v => {
          const out = [];
          for (const id of v.classes) for (const s of amontsHandling(a.service, id)) out.push({ service: s, classe: id, ev: livraison(s, id) });
          return out;
        };
        env.processus(function* () {
          if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
          let parti = false;
          const faits = new Set();
          for (let i = 0; i < mesVols.length; i++) {
            const v = mesVols[i];
            if (faits.has(v.id)) continue;
            const base = w => ({ atelier: a.id, service: a.service, nom: 'Vol ' + w.id, vol: w.id, cie: w.cie,
              classes: w.classes.slice(), pax: { ...w.pax }, depart: w.depart, handling: true, attente: 0, arret: 0 });
            if (parti) {
              // L'équipe est partie : ce vol-ci n'est pas chargé non plus.
              const ligne = { ...base(v), debut: finPoste, fin: null, duree: null, impossible: true, horsPoste: true };
              journal.push(ligne); vue.lots.push(ligne);
              continue;
            }
            const t0 = env.maintenant;
            // Strictement dans l'ordre des départs : on attend ce vol-ci, complet.
            const attendus = attendusDe(v);
            suspendu.vol = v; suspendu.attendus = attendus;
            if (attendus.some(x => !x.ev.declenche)) yield env.tousDe(attendus.map(x => x.ev));
            suspendu.vol = null; suspendu.attendus = [];
            const pret = attendus.length ? Math.max(...attendus.map(x => livreA.get(cle(x.service, x.classe)) ?? env.maintenant)) : null;
            // Pas plus de `avance` avant le départ, et jamais avant 00:00 du jour J.
            const tPret = Math.max(env.maintenant, auPlusTotDe(v));
            const attente = Math.max(0, env.maintenant - Math.max(t0, auPlusTotDe(v)));
            const categorie = categorieVol(a, v.cie), besoin = parChauffeurs ? chauffeursDe(a, v.cie) : 0;
            // Un camion peut charger plusieurs vols : les suivants dans l'ordre des
            // départs, de la même catégorie, déjà complets et qu'on a le droit de charger.
            // « Pas avant » vaut pour le chargement de chaque vol : le camion y arrive
            // après l'aller et les vols chargés avant lui.
            const groupe = [v];
            let arrivee = tPret + trajetHandling(a, v.cie).aller + (dureeHandling(a, v.cie) ?? 0);
            const parCamion = parCamionDe(v.cie);
            for (let j = i + 1; j < mesVols.length && groupe.length < parCamion; j++) {
              const w = mesVols[j];
              if (up(w.cie) !== up(v.cie) || auPlusTotDe(w) > arrivee || attendusDe(w).some(x => !x.ev.declenche)) break;
              groupe.push(w);
              arrivee += dureeHandling(a, w.cie) ?? 0;
            }
            // Le trajet : aller jusqu'à l'avion, charger chaque vol, revenir à l'unité.
            const aller = trajetHandling(a, v.cie).aller, retour = trajetHandling(a, groupe[groupe.length - 1].cie).retour;
            const charges = groupe.map(w => dureeHandling(a, w.cie) ?? 0);
            const total = aller + charges.reduce((x, y) => x + y, 0) + retour;
            const finDe = x => finAvecPauses(x, total, pauses).fin;
            const debutV = debutTrajet(parChauffeurs ? creneaux : null, occupes, tPret, besoin, finDe, camionsMax);
            if (!Number.isFinite(debutV) || (!parChauffeurs && (debutV >= finPoste || finDe(debutV) > finPoste))) {
              if (!parChauffeurs) parti = true;
              const ligne = { ...base(v), debut: Number.isFinite(debutV) ? Math.min(debutV, finPoste) : tPret, fin: null, duree: charges[0], attente, pret,
                impossible: true, ...(parChauffeurs ? { sansChauffeur: true, chauffeurs: besoin, categorie } : { horsPoste: true }) };
              journal.push(ligne); vue.lots.push(ligne);
              continue;
            }
            if (env.maintenant < debutV) yield env.delai(debutV - env.maintenant);
            const f = finAvecPauses(debutV, total, pauses);
            occupes.push({ de: debutV, a: f.fin, n: besoin });
            const trajet = { depart: debutV, retour: f.fin, vols: groupe.map(w => w.id), aller, dureeRetour: retour };
            let cumul = aller;
            groupe.forEach((w, g) => {
              cumul += charges[g];
              const charge = finAvecPauses(debutV, cumul, pauses).fin;
              faits.add(w.id);
              const ligne = { ...base(w), debut: debutV, fin: charge, duree: charges[g], attente: g ? 0 : attente, arret: g ? 0 : f.arret,
                pret: g ? null : pret, impossible: false, trajet, camion: occupes.length,
                ...(parChauffeurs ? { chauffeurs: besoin, categorie, attenteChauffeurs: g ? 0 : Math.max(0, debutV - tPret) } : {}),
                retard: Math.max(0, charge - w.depart), aHeure: charge <= w.depart };
              journal.push(ligne); vue.lots.push(ligne);
            });
            vue.travail += total; vue.attente += attente + Math.max(0, debutV - tPret); vue.arret += f.arret;
            vue.fin = Math.max(vue.fin ?? -Infinity, f.fin);
          }
        }, a.nom);
        continue;
      }

      // La plonge par vol : chaque tunnel qui tourne lave un vol revenu, dans
      // l'ordre des retours, en la durée de sa compagnie.
      if (a.type === 'lavage' && a.parVol) {
        // Les équipes d'une même plonge (matin, après-midi…) se partagent les vols
        // revenus : un vol n'est lavé qu'UNE fois, par le tunnel — de n'importe
        // quelle équipe au travail — qui le rend propre le plus tôt. Chaque équipe
        // lavait tous les vols : le travail et le propre étaient comptés deux fois
        // (trouvé avec le jeu d'essai, 29/09). La première équipe mène le groupe.
        const groupe = plongesParVol.get(a.service) || [a];
        if (groupe[0] !== a) continue;
        // Une piste : un tunnel d'une équipe. Sa machine peut être celle d'une
        // autre équipe (même nom de tunnel) : elles se la passent.
        const pistes = [], machines = new Map();
        for (const x of groupe) {
          const vx = parId.get(x.id), rx = normaliserRegime(x.regime, opts.regime);
          // La fin de sa présence payée, puis celle de ses heures sup.
          const dx = vx.debut, fp = rx.actif ? dx + rx.presence : Infinity, fx = rx.actif ? fp + SUP : Infinity, px = pausesDe(x);
          // Sans liste de tunnels : un seul, s'il y a quelqu'un pour le tenir.
          const tournent = Array.isArray(x.tunnels) && x.tunnels.length ? tunnelsQuiTournent(x).tournent : (x.personnes > 0 ? [{ nom: 'Tunnel' }] : []);
          const cles = machinesDesTunnels(x, tournent);
          // Les temps saisis sont ceux d'un tunnel normal ; un tunnel « ×2 » lave
          // en deux fois moins de temps (retour d'usage du 29/09).
          tournent.forEach((t, i) => {
            if (!machines.has(cles[i])) machines.set(cles[i], { libre: -Infinity });
            pistes.push({ a: x, vue: vx, depart: dx, finPoste: fx, finPresence: fp, pauses: px, vitesse: vitesseTunnel(t),
              machine: machines.get(cles[i]), numero: i + 1, nom: (t && t.nom) || 'Tunnel ' + (i + 1) });
          });
        }
        // Libre pour cette équipe : quand sa machine l'est, et pas avant son arrivée.
        const libre = q => Math.max(q.machine.libre, q.depart);
        // Le sale de la veille d'abord, puis les retours, dans l'ordre de leur arrivée.
        const retours = veille.concat(retoursStatiques({ ...mat, unites: mat.unites }, true)).sort((x, y) => x.t - y.t);
        const laver = r => {
          const base = { service: a.service, nom: 'Vol ' + r.vol, vol: r.vol, cie: r.cie, classes: [], retourVol: true,
            arrivee: r.t, unites: r.unites, arret: 0 };
          // Le tunnel qui rend ce vol propre le plus tôt : le premier libre, ou
          // un plus rapide qui se libère un peu plus tard. À égalité, une équipe
          // dans ses heures plutôt qu'une autre en heures sup, puis celui qui est
          // libre depuis le plus longtemps : le travail se répartit.
          let p = null, fin = Infinity, supP = false;
          for (const q of pistes) {
            // Passé la fin de sa présence, une équipe finit les vols déjà dans un tunnel
            // (en heures sup, jusqu'au plafond) et n'en commence aucun autre : ce qui
            // attend va à l'équipe suivante, ou reste sale (correction du banc d'essai :
            // elle lavait tout ce qui l'attendait, et la nuit n'avait plus rien à faire).
            if (r.t >= q.finPresence) continue;
            const d0 = Math.max(r.t, libre(q));
            if (d0 >= q.finPresence) continue;
            const f = finAvecPauses(d0, (dureeLavageVol(q.a, r.cie) ?? 0) / q.vitesse, q.pauses).fin;
            if (f > q.finPoste) continue;
            const sup = f > q.finPresence + 1e-9;
            if (f < fin - 1e-9 || (Math.abs(f - fin) <= 1e-9 && ((supP && !sup) || (sup === supP && libre(q) < libre(p))))) { p = q; fin = f; supP = sup; }
          }
          if (!p) {
            // Aucune équipe au travail ne peut le laver avant la fin de son poste :
            // on le dit à celle qui finit le plus tard (le soir), pas à celle du matin.
            const der = groupe.map(x => pistes.find(q => q.a === x) || { a: x, vue: parId.get(x.id), depart: parId.get(x.id).debut, finPoste: parId.get(x.id).finPoste ?? Infinity })
              .reduce((m, q) => ((q.finPoste ?? Infinity) >= (m.finPoste ?? Infinity) ? q : m));
            const debut = Math.min(Math.max(r.t, der.depart), der.finPoste ?? Infinity);
            const ligne = { ...base, atelier: der.a.id, debut, fin: null, duree: dureeLavageVol(der.a, r.cie) ?? 0, attente: 0, impossible: true, horsPoste: true };
            journal.push(ligne); der.vue.lots.push(ligne);
            return;
          }
          const duree = (dureeLavageVol(p.a, r.cie) ?? 0) / p.vitesse;
          const debutV = Math.max(r.t, libre(p));
          const f = finAvecPauses(debutV, duree, p.pauses);
          p.machine.libre = f.fin;
          const ligne = { ...base, atelier: p.a.id, debut: debutV, fin: f.fin, duree, attente: debutV - r.t, arret: f.arret, impossible: false,
            tunnel: p.numero, nomTunnel: p.nom, vitesse: p.vitesse };
          journal.push(ligne); p.vue.lots.push(ligne);
          if (suiviLavage) suiviLavage.laves.push({ atelier: p.a.id, vol: r.vol, cie: r.cie, t: r.t, u: r.unites || 0, fin: f.fin, veille: nomsVeille.has(r.vol) });
          p.vue.travail += duree; p.vue.attente += ligne.attente; p.vue.arret += f.arret;
          p.vue.fin = Math.max(p.vue.fin ?? -Infinity, f.fin);
          // Le matériel du vol est propre à sa sortie du tunnel.
          if (mat.actif && r.unites > 0) env.processus(function* () {
            if (env.maintenant < f.fin) yield env.delai(f.fin - env.maintenant);
            noterFile();
            stock.sale = Math.max(0, stock.sale - r.unites);
            const i = file.arrivees.findIndex(x => x.vol === r.vol);
            if (i >= 0) file.arrivees.splice(i, 1);
            file.attentes.push({ u: r.unites, attente: f.fin - r.t, pire: f.fin - r.t });
            noterFile();
            crediter(r.unites);
          }, 'lavage ' + r.vol);
        };
        // Les retours connus d'avance, dans l'ordre de leur arrivée. Avec un
        // handling 24 h/24, ceux de ses tournées arrivent pendant la journée :
        // chacun se lave à son heure, comme les autres.
        if (!plan24) for (const r of retours) laver(r);
        else {
          for (const r of retours) env.processus(function* () { if (env.maintenant < r.t) yield env.delai(r.t - env.maintenant); laver(r); }, 'retour ' + r.vol);
          plongesDynamiques.push(laver);
        }
        continue;
      }

      if (a.type === 'lavage') {
        // Aucun tunnel ne tourne (personne pour les tenir) : cette plonge ne lave
        // rien, et on le dit (« plonge-arret »). Laver « en un temps infini »
        // faisait planter toute la journée (trouvé par tirage au hasard, 29/09).
        if (!(debitLavage(a) > 0)) continue;
        // Au débit, la plonge s'arrête à la fin de sa présence, heures sup ou non : le sale qui
        // reste va à l'équipe suivante, ou à la fin de la journée (correction du banc d'essai).
        vue.finPoste = Number.isFinite(finPresence) ? finPresence : null;
        env.processus(function* () {
          if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
          const prisesL = new Set(); let cumulL = 0;
          for (let garde = 0; garde < 5000; garde++) {
            if (env.maintenant >= finPresence) break;
            const reste = stock.sale;
            if (reste <= 1e-9) {
              // Rien \u00e0 laver : on attend le prochain retour, ou la fin de la présence.
              const ev = env.evenement('retour'); reveilsSale.push(ev);
              // Un poste sans fin (pauses décochées) n'attend que le retour.
              yield Number.isFinite(finPresence) ? env.unDe([ev, env.delai(Math.max(0, finPresence - env.maintenant))]) : ev;
              continue;
            }
            // On lave tout ce qui est l\u00e0 ; ce qui arrive pendant sera le tour suivant.
            const unites = reste; stock.sale -= unites;
            // Ce qui entre au tunnel, dans l'ordre des retours (premier revenu, premier lavé).
            const pris = [];
            for (let pos = 0; pos < unites - 1e-9 && file.arrivees.length;) {
              const a0 = file.arrivees[0], u = Math.min(a0.u, unites - pos);
              pris.push({ t: a0.t, u, pos, vol: a0.vol, cie: a0.cie }); pos += u;
              a0.u -= u; if (a0.u <= 1e-9) file.arrivees.shift();
            }
            const duree = unites / debitLavage(a) * 60;
            const t = executerTache({ depart: env.maintenant, duree, cumul: cumulL,
              prises: prisesL, pauses, regime, finPoste: finPresence });
            const debutLot = env.maintenant;
            const passe = { debut: debutLot, fin: t.fin, unites };
            file.tunnels.add(passe);
            yield env.delai(t.fin - env.maintenant);
            file.tunnels.delete(passe);
            cumulL = t.cumul;
            const lavees = t.tronque ? unites * (t.fait / duree) : unites;
            stock.sale += unites - lavees;      // ce qui n'a pas \u00e9t\u00e9 lav\u00e9 reste sale
            // Chaque unité a attendu depuis son retour jusqu'à sa sortie du tunnel ;
            // ce qui n'en est pas sorti retourne en tête de file, avec son heure de retour.
            const rendus = [];
            for (const c of pris) {
              const w = Math.max(0, Math.min(c.u, lavees - c.pos));
              // En moyenne, le milieu du paquet ; au pire, sa dernière unité.
              const sortie = k => debutLot + k / Math.max(lavees, 1e-9) * (env.maintenant - debutLot) - c.t;
              if (w > 1e-9) file.attentes.push({ u: w, attente: sortie(c.pos + w / 2), pire: sortie(c.pos + w) });
              if (suiviLavage && w > 1e-9) suiviLavage.laves.push({ atelier: a.id, vol: c.vol, cie: c.cie, t: c.t, u: w, fin: env.maintenant, veille: nomsVeille.has(c.vol) });
              if (c.u - w > 1e-9) rendus.push({ t: c.t, u: c.u - w, vol: c.vol, cie: c.cie });
            }
            file.arrivees.unshift(...rendus);
            noterFile();
            crediter(lavees);
            const ligne = { atelier: a.id, service: a.service, nom: Math.round(lavees) + ' u lav\u00e9es',
              classes: [], debut: debutLot, fin: env.maintenant, duree: t.fait, attente: 0,
              arret: t.arret, impossible: false, horsPoste: t.tronque, unites: lavees };
            journal.push(ligne); vue.lots.push(ligne);
            vue.travail += t.fait; vue.arret += t.arret; vue.fin = env.maintenant;
            if (t.tronque) break;
          }
        }, a.nom);
        continue;
      }

      // Une équipe qui peut recevoir des renforts (évolution 5) : son état se lit pendant la journée.
      const R = REN ? receveurs.get(a.id) || null : null;
      // Heures sup (correction du banc d'essai) : on ne paie personne à attendre. Passé la fin de sa présence,
      // une équipe finit le lot commencé, puis n'enchaîne que les lots déjà prêts ; dès qu'elle devrait
      // attendre (son amont, une mise à disposition, du matériel, sa ligne, un renfort), elle part. Pendant
      // la présence, l'attente reste normale, jusqu'à sa fin. Sans heures sup, rien ne change.
      const sansAttente = SUP > 0 && Number.isFinite(finPresence);
      const limiteAttente = sansAttente ? finPresence : Infinity;
      // Ses fournitures (correction du banc d'essai) : une équipe les prend en début de poste, ou dès qu'une mise à
      // disposition à heures fixes ouvre. Celle-ci ne fait attendre que son premier lot qui en a besoin, et seulement si
      // elle n'a pas encore ouvert depuis le début de son poste ; une fois servie, ses fermetures ne la bloquent plus.
      const fournieA = svcs => Math.max(-Infinity, ...[...new Set(svcs)].filter(x => boutiques.has(x)).map(x => prochaineOuverture(boutiques.get(x), depart)));
      // Ses lots, dans l'ordre de sa liste (un lot en cours de saisie, vide, ne compte pas), et ceux qui restent.
      const aFaire = (a.lots || []).map(classesDuLot).filter(ids => ids.length);
      const restants = aFaire.map((ids, k) => k);
      // L'ordre souple : quand le lot suivant n'est pas prêt (son amont, une mise à disposition), l'équipe prend le
      // premier lot prêt de sa liste, et revient aux autres quand ils le sont ; aucun prêt, elle attend le premier qui
      // le devient. Les commandes réunies par « + » restent un seul lot.
      const souple = a.ordreSouple === true || (a.ordreSouple !== false && SOUPLE);
      const attendusDe = ids => ids.flatMap(id => amontsDe(a.service, id).map(amont => livraison(amont, id)));
      const servieA = ids => (boutiques.size ? fournieA(ids.flatMap(id => amontsDe(a.service, id))) : -Infinity);
      const pret = ids => attendusDe(ids).every(ev => ev.declenche) && servieA(ids) <= env.maintenant + 1e-9;
      let j = 0;   // le rang du lot en cours, parmi les lots non vides
      const processus = env.processus(function* () {
        if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
        let horloge = depart;
        if (R) R.lireEtat = () => ({ cumul, prises, lot: j, restants: restants.slice() });

        while (restants.length) {
          const debutAttente = env.maintenant;
          let rang = restants[0];
          if (souple && restants.length > 1 && !pret(aFaire[rang])) {
            for (let garde = 0; garde < 10000; garde++) {
              const prets = restants.filter(x => pret(aFaire[x]));
              if (prets.length) { rang = prets[0]; break; }
              // Aucun lot prêt : le premier qui le devient. En heures sup, elle n'attend pas (voir plus haut).
              if (sansAttente && env.maintenant >= finPresence - 1e-9) break;
              const evs = [];
              for (const x of restants) {
                const att = attendusDe(aFaire[x]);
                if (!att.every(ev => ev.declenche)) evs.push(env.tousDe(att));
                else { const o = servieA(aFaire[x]); if (Number.isFinite(o) && o > env.maintenant) evs.push(env.delai(o - env.maintenant)); }
              }
              if (sansAttente) evs.push(env.delai(finPresence - env.maintenant));
              if (!evs.length) break;
              if (sansAttente && R) congedier(R);
              yield env.unDe(evs);
            }
          }
          j = rang;
          const ids = aFaire[rang];
          const nom = ids.join(' + ');

          // Attendre que TOUS les fournisseurs aient livré TOUTES les classes
          // du lot. C'est ici que les branches food, matériel et armement se
          // rejoignent : on ne choisit pas laquelle, on les attend toutes.
          const attendus = attendusDe(ids);
          if (!sansAttente) {
            if (attendus.length) yield env.tousDe(attendus);
            // Une boutique qui n'a pas encore ouvert depuis son début de poste : on attend qu'elle ouvre.
            if (boutiques.size) {
              const ouvert = fournieA(ids.flatMap(id => amontsDe(a.service, id)));
              if (ouvert > env.maintenant && Number.isFinite(ouvert)) yield env.delai(ouvert - env.maintenant);
            }
          } else {
            // L'amont livré et les boutiques ouvertes, pas plus tard que la fin de sa présence.
            const ouvertA = () => (boutiques.size ? Math.max(env.maintenant, fournieA(ids.flatMap(id => amontsDe(a.service, id)))) : env.maintenant);
            for (let garde = 0; garde < 1000; garde++) {
              const livre = attendus.every(ev => ev.declenche), ouvert = livre ? ouvertA() : Infinity;
              if (livre && ouvert <= env.maintenant + 1e-9) break;
              if (env.maintenant >= finPresence - 1e-9) break;
              if (R) congedier(R);
              yield livre ? env.delai(Math.min(ouvert, finPresence) - env.maintenant)
                : env.unDe([env.tousDe(attendus), env.delai(finPresence - env.maintenant)]);
            }
            if (!attendus.every(ev => ev.declenche) || ouvertA() > env.maintenant + 1e-9) {
              if (R) congedier(R);
              const ligne = { atelier: a.id, service: a.service, nom, classes: ids, debut: env.maintenant, fin: null, duree: null,
                attente: env.maintenant - debutAttente, arret: 0, impossible: true, horsPoste: true };
              journal.push(ligne); vue.lots.push(ligne);
              return;   // elle part : les lots suivants non plus
            }
          }
          let attente = env.maintenant - debutAttente;
          horloge = Math.max(horloge, env.maintenant);
          if (env.maintenant < horloge) yield env.delai(horloge - env.maintenant);

          // Contenu de travail du lot.
          const { lots, duree, detail, base } = travailDuLot(a, ids);
          // Pas assez de monde (un robot sous son minimum, une équipe sans personne) : une équipe qui
          // peut recevoir des renforts les attend, avant de prendre du matériel ou sa ligne.
          if (!Number.isFinite(duree) && R) {
            const t0 = env.maintenant, arme = () => (a.type === 'robot' ? robotArme(R, env.maintenant) : apport(R, env.maintenant).personnes > 0);
            R.attend = true; congedier(sansAttente ? R : null); repartir();
            const finAttente = sansAttente ? finPresence : finPoste;
            try {
              while (!arme() && env.maintenant < finAttente - 1e-9) {
                const u = Math.min(prochainChangement(R, env.maintenant), finAttente);
                try { yield Number.isFinite(u) ? env.delai(Math.max(0, u - env.maintenant)) : env.evenement('attente d’un renfort'); }
                catch (e) { if (!(e instanceof Noyau.Interruption)) throw e; }
              }
            } finally { R.attend = false; }
            if (!arme()) {
              journal.push({ atelier: a.id, service: a.service, nom, classes: ids, debut: t0,
                fin: null, duree: null, attente, arret: 0, impossible: true, ...detail });
              vue.lots.push(journal[journal.length - 1]);
              return;
            }
            attente += env.maintenant - t0;
          } else if (!Number.isFinite(duree)) {
            journal.push({ atelier: a.id, service: a.service, nom, classes: ids, debut: env.maintenant,
              fin: null, duree: null, attente, arret: 0, impossible: true, ...detail });
            vue.lots.push(journal[journal.length - 1]);
            return;   // rien ne sortira de cet atelier : inutile d'enchaîner
          }

          // Le matériel propre : un lot ne part pas sans ce qu'il emporte.
          // C'est ici que la boucle des retours touche la production.
          let attenteMat = 0, parti = false;
          if (mat.actif && a.materiel === 'consomme') {
            const besoin = besoinMateriel(lots, mat);
            if (sansAttente && R && !(!attenteurs.length && stock.propre >= besoin)) congedier(R);
            attenteMat = yield* prendreMateriel(besoin,
              { atelier: a.id, service: a.service, nom, classes: ids }, limiteAttente);
            if (attenteMat === null) { parti = true; attenteMat = 0; }
            horloge = Math.max(horloge, env.maintenant);
          }

          // Un robot attend que SA LIGNE soit libre : l'autre équipe peut y être.
          const k = a.type === 'robot' ? cleLigne(a) : null;
          let attenteLigne = 0, tient = false;
          if (k && !parti && env.maintenant < finPoste) {
            const t0 = env.maintenant;
            if (sansAttente && R && !lignes.get(k).libre) congedier(R);
            tient = yield* prendreLigne(k, limiteAttente); parti = !tient;
            attenteLigne = env.maintenant - t0;
            if (attenteLigne > 0) detail.attenteLigne = attenteLigne;
          }

          // Le poste s'arrête : ce qui reste ne sera pas fait aujourd'hui. Ou, en heures sup, elle
          // devrait attendre (son matériel, sa ligne) : elle part.
          if (parti || env.maintenant >= finPoste) {
            if (tient) rendreLigne(k);
            const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
              debut: env.maintenant, fin: null, duree: null, attente: attente + attenteLigne, arret: 0,
              impossible: true, horsPoste: true, ...detail };
            journal.push(ligne); vue.lots.push(ligne);
            return;
          }

          const debutLot = env.maintenant;
          let t;
          // Une équipe qui peut recevoir des renforts : une tâche dont l'effectif peut changer en route.
          if (R) { repartir(); t = yield* tacheAvecRenforts(R, { duree, base, cumul, prises, pauses, regime, finPoste, robot: a.type === 'robot' }); }
          else { t = executerTache({ depart: env.maintenant, duree, cumul, prises, pauses, regime, finPoste }); yield env.delai(t.fin - env.maintenant); }
          if (tient) rendreLigne(k);
          cumul = t.cumul;
          const { arret } = t;
          attente += attenteLigne + (t.attenteRenfort || 0);

          if (t.tronque) {
            const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
              debut: debutLot, fin: null, duree: Number.isFinite(duree) ? duree : null, attente, arret,
              fait: t.fait, impossible: true, horsPoste: true, ...detail };
            journal.push(ligne); vue.lots.push(ligne);
            vue.attente += attente; vue.arret += arret; vue.travail += t.fait;
            return;   // l'équipe est partie : les lots suivants non plus
          }

          // Si deux ateliers du même service fabriquent la même classe — une
          // anomalie déjà signalée — c'est la première livraison qui fait foi.
          // Le modèle ne se bloque pas sur une saisie que l'utilisateur corrigera.
          for (const id of ids) livrer(a.service, id);
          const fl = fusionDe(a);
          if (fl) for (const id of ids) if (fusionPar.get(cle(fl, id)) === a.service) livrer(fl, id);

          // Aidée par des renforts : son travail est le temps qu'elle y a passé, plus court.
          const aidee = t.aide || !Number.isFinite(duree);
          const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
            debut: debutLot, fin: env.maintenant, duree: Number.isFinite(duree) ? duree : t.fait, attente, attenteMateriel: attenteMat,
            arret, impossible: false, ...detail, ...(t.aide ? { renfort: true, fait: t.fait } : {}) };
          journal.push(ligne); vue.lots.push(ligne);
          vue.travail += aidee ? t.fait : duree; vue.attente += attente; vue.arret += arret;
          vue.fin = env.maintenant;
          horloge = env.maintenant;
          restants.splice(restants.indexOf(rang), 1);
        }
        // Tous ses lots sont faits avant la fin de sa présence : ses personnes vont aider (évolution 5).
        if (REN) preter(a, env.maintenant, prises);
      }, a.nom);
      // Une équipe aidée qui s'arrête (ses lots faits, ou son poste fini) libère ses renforts.
      if (R) {
        R.proc = processus;
        processus.surResolution(() => { R.fini = true; for (const h of R.aides.slice()) liberer(h, env.maintenant, false); repartir(); });
      }
    }

    // Les mesures du sale (évolution 6) : à leur heure, après ce qui arrive au même instant (une
    // équipe qui part et rend ce qu'elle n'a pas lavé, un retour). Le sale en attente : revenu, pas
    // encore entré dans un tunnel. Par vol : les vols revenus qu'aucun tunnel n'a commencés ; au
    // débit : le sale qui attend devant les tunnels.
    for (const sonde of (opts._sondesSale || [])) env.processus(function* () {
      if (env.maintenant < sonde.t) yield env.delai(sonde.t - env.maintenant);
      yield env.delai(0);
      const t = env.maintenant;
      sonde.sale = sonde.parVol
        ? Math.max(0, arriveesSale.filter(r => r.t <= t + 1e-9).reduce((n, r) => n + (r.unites || 0), 0)
          - journal.filter(l => l.retourVol && l.service === sonde.service && !l.impossible && l.arrivee <= t + 1e-9 && l.debut <= t + 1e-9).reduce((n, l) => n + (l.unites || 0), 0))
        : (mat.actif ? stock.sale : 0);
    }, 'mesure du sale');

    env.executer();

    // Le sale qui reste à la fin de la journée (évolution 6), vol par vol : ce que le banc rend à la
    // journée suivante (son `saleInitial`). Par vol : les vols qu'aucune équipe n'a lavés ; au débit :
    // ce qui attend encore devant les tunnels.
    const saleFinal = [];
    if (lavages.size) {
      const ajouter = (vol, cie, unites) => {
        const k = String(vol).replace(/ \(veille\)$/, ''), x = saleFinal.find(y => y.vol === k && y.cie === cie);
        if (x) x.unites += unites; else saleFinal.push({ vol: k, cie, unites });
      };
      if (ateliers.some(a => a.type === 'lavage' && a.parVol) || (opts._plongesFermees || []).some(x => x.parVol)) {
        const laves = new Set(journal.filter(l => l.retourVol && !l.impossible).map(l => l.vol)), vus = new Set();
        for (const r of arriveesSale.slice().sort((x, y) => x.t - y.t)) if (r.unites > 0 && !laves.has(r.vol) && !vus.has(r.vol)) { vus.add(r.vol); ajouter(r.vol, r.cie, r.unites); }
      } else if (mat.actif) for (const x of file.arrivees) if (x.u > 1e-9) ajouter(x.vol, x.cie || TOUTES, x.u);
    }

    // Les renforts (évolution 5) : ce que chaque équipe a prêté et reçu, en minutes-personne
    // (le délai de déplacement compris, les pauses du renfort non), vers qui et de qui.
    const renforts = [];
    if (REN) {
      for (const h of aidants) if (h.aide) liberer(h, env.maintenant, true);
      const paires = new Map();
      for (const h of aidants) for (const [vers, minutes] of h.parts) {
        const k = h.de.id + '\u0000' + vers;
        if (!paires.has(k)) paires.set(k, { de: h.de.id, vers, minutes: 0 });
        paires.get(k).minutes += minutes;
      }
      renforts.push(...[...paires.values()].sort((x, y) => String(x.de).localeCompare(String(y.de)) || String(x.vers).localeCompare(String(y.vers))));
      for (const v of suivi) {
        const vers = renforts.filter(p => p.de === v.id), de = renforts.filter(p => p.vers === v.id);
        v.renfortsPretes = vers.reduce((n, p) => n + p.minutes, 0);
        v.renfortsRecus = de.reduce((n, p) => n + p.minutes, 0);
        v.renfortsHeuresSup = aidants.filter(h => h.de.id === v.id).reduce((n, h) => n + h.sup, 0);
        v.renforts = { vers: vers.map(p => ({ id: p.vers, nom: parId.get(p.vers).nom, minutes: p.minutes })),
          de: de.map(p => ({ id: p.de, nom: parId.get(p.de).nom, minutes: p.minutes })) };
      }
    }

    // Les vagues : chaque commande servie par une mise à disposition prend la
    // vague qui précède son besoin. Une ligne de journal par vague, avec ses
    // commandes : c'est ce que montrent le chemin, le planning et le tableau.
    for (const a of ateliers) {
      if (a.type !== 'dispo' || a.permanent !== false) continue;
      const vs = vaguesDe(a), ligne = journal.find(l => l.dispo && l.atelier === a.id);
      if (!ligne || !vs.length) continue;
      const parVague = new Map(vs.map(t => [t, []]));
      for (const id of ligne.classes) {
        const suites = journal.filter(l => !l.dispo && !l.handling && Number.isFinite(l.debut) && (l.classes || []).includes(id)
          && amontsDe(l.service, id).includes(a.service));
        const besoin = suites.length ? Math.min(...suites.map(l => l.debut - (l.attente || 0))) : null;
        let v = vs[0];
        if (besoin != null) for (const t of vs) if (t <= besoin + 1e-9) v = t;
        parVague.get(v).push(id);
      }
      const lignes = vs.map((t, i) => ({ ...ligne, classes: parVague.get(t), debut: t, fin: t, vague: i + 1, vagues: vs.length }))
        .filter(l => l.classes.length);
      const vue = parId.get(a.id);
      journal.splice(journal.indexOf(ligne), 1, ...lignes);
      if (vue) { vue.lots.splice(vue.lots.indexOf(ligne), 1, ...lignes); vue.vagues = vs; }
    }

    // Un lot encore en attente de matériel à la fin de la journée ne produit
    // aucune ligne de journal : son processus est resté suspendu. Sans cette
    // trace, sa classe paraîtrait fabriquée par ses autres étapes.
    for (const a of attenteurs) {
      const ligne = { atelier: a.atelier, service: a.service, nom: a.nom, classes: a.classes || [],
        debut: a.depuis, fin: null, duree: null, attente: 0, arret: 0,
        impossible: true, sansMateriel: true, besoin: a.besoin };
      journal.push(ligne);
      const vue = parId.get(a.atelier); if (vue) vue.lots.push(ligne);
      anomalies.push({ code: 'materiel', atelier: a.atelier, classes: a.classes || [], cause: 'materiel',
        case: (ateliers.find(x => x.id === a.atelier) || {}).nom,
        message: a.nom + ' dans « ' + nom(a.service) + ' » : ' + Math.round(a.besoin)
          + ' unités de matériel propre manquent et ne sont jamais arrivées.' });
    }

    // Un lot que le poste n'a pas pu finir n'est pas une erreur de saisie :
    // c'est le résultat, et le plus utile. On le nomme sans bloquer.
    for (const l of journal.filter(l => l.horsPoste && !l.handling)) {
      anomalies.push({ code: 'poste', atelier: l.atelier, classes: l.classes || [], cause: 'poste', case: (ateliers.find(a => a.id === l.atelier) || {}).nom,
        message: l.nom + ' dans « ' + nom(l.service) + ' » : le poste se termine avant la fin. '
          + 'Commencez plus tôt, ajoutez du monde, ou confiez-le à une autre équipe.' });
    }

    /* ---- ce qu'il faut en retenir ------------------------------------ */

    const finDe = (service, id) => {
      const l = journal.find(x => x.service === service && x.classes.includes(id));
      return l ? l.fin : null;
    };
    // Ce que chaque classe attend d'être faite : chaque service où une équipe
    // l'a dans sa liste. Une équipe restée bloquée avant (matériel jamais venu,
    // poste fini) ne la prépare jamais : la classe n'est PAS prête, même si
    // ses étapes d'avant ont fini — sinon elle paraîtrait « prête à l'heure »
    // sans être passée au montage.
    const confiees = new Map();
    for (const a of ateliers) {
      if (!a || (a.type !== 'manuel' && a.type !== 'robot')) continue;
      for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) {
        if (!confiees.has(id)) confiees.set(id, []);
        confiees.get(id).push(a);
      }
    }
    const jamais = new Map();   // atelier → classes qu'il n'a jamais préparées
    for (const [id, ats] of confiees) for (const a of ats) {
      if (journal.some(l => l.atelier === a.id && (l.classes || []).includes(id))) continue;
      if (!jamais.has(a)) jamais.set(a, []);
      jamais.get(a).push(id);
    }
    for (const [a, ids] of jamais) {
      const vue = parId.get(a.id), bloque = vue && vue.lots.find(l => l.fin == null);
      // Sinon, l'équipe attend encore la première : quel service d'avant ne la livre jamais ?
      const premiere = ids[0], attendus = bloque ? [] : amontsDe(a.service, premiere)
        .filter(s => !journal.some(l => l.service === s && (l.classes || []).includes(premiere) && l.fin != null));
      // La cause en bref, pour la dire à côté de chaque commande (audit du 29/09).
      const cause = bloque ? (bloque.sansMateriel ? 'materiel' : bloque.horsPoste ? 'poste' : 'bloque') : attendus.length ? 'amont' : 'poste';
      anomalies.push({ code: 'inacheve', atelier: a.id, classes: ids, cause, case: a.nom || a.id,
        ...(bloque ? { bloquePar: enClair(bloque.nom) } : {}), ...(attendus.length ? { attend: attendus.map(nom) } : {}),
        message: (a.nom || a.id) + ' ne prépare jamais ' + ids.slice(0, 6).map(enClair).join(', ') + (ids.length > 6 ? '… (' + ids.length + ')' : '') + ' : '
          + (bloque ? 'l’équipe reste bloquée sur ' + enClair(bloque.nom) + (bloque.sansMateriel ? ', faute de matériel propre' : bloque.horsPoste ? ', son poste finit avant' : '') + '.'
            : attendus.length ? 'l’équipe attend toujours ' + enClair(premiere) + ' de « ' + attendus.map(nom).join(' », « ') + ' », qui ne la livre jamais.'
            : 'son poste finit avant qu’elle y arrive.') + ' Ces commandes ne sont pas prêtes.' });
    }

    const derniers = {};   // dernier service du parcours de chaque classe
    for (const c of classes) {
      // Le handling charge des vols : une commande est prête quand elle est au
      // handling, c'est-à-dire quand ses étapes à elle sont finies.
      const etapes = journal.filter(l => !l.handling && l.classes.includes(c.id));
      // Une mise à disposition figure au parcours mais ne fabrique rien : si
      // c'est la seule étape d'une classe, cette classe n'est pas faite. Sans
      // cette distinction, un magasin ouvert suffirait à dire « 100 % à l'heure ».
      const reels = etapes.filter(l => !l.dispo);
      const manque = (confiees.get(c.id) || []).some(a => (jamais.get(a) || []).includes(c.id));
      const fin = reels.length && !manque && reels.every(l => l.fin != null)
        ? Math.max(...reels.map(l => l.fin)) : null;
      derniers[c.id] = {
        id: c.id, cie: c.cie, cabine: c.cabine, pax: c.pax, vols: c.vols.length,
        echeance: c.echeance, fin,
        services: etapes.map(l => l.service),
        retard: fin == null ? null : Math.max(0, fin - c.echeance),
        aHeure: fin != null && fin <= c.echeance,
        absente: !reels.length
      };
    }

    const stocks = stocksEntreAteliers(journal, classes, derniers,
      (s, id) => (servicesHandling.has(s) ? amontsHandling(s, id) : amontsDe(s, id)));

    /* ---- les vols, au handling ----------------------------------------- */
    const vols = [];
    /**
     * Le bilan d'un handling 24 h/24 : chaque vol chargé à l'heure (avant sa
     * limite : départ − marge) ou non, et, s'il est en retard ou pas chargé, la
     * cause — commande pas prête (après son échéance), pas de chauffeur, pas de
     * véhicule ; « fenetre » si rien de cela, mais les durées ne tiennent pas.
     */
    function bilan24h(a) {
      const { mesVols, conducteurs, avance, chauffeurs, finir } = suivis24h.get(a.id), vue = parId.get(a.id);
      finir();
      // Un plan calculé qui a fait attendre un véhicule à la tournée : la flotte en est la cause.
      const parVehicule = (a._plan && a._plan.parVehicule) || new Set(), parChauffeur = (a._plan && a._plan.parChauffeur) || new Set();
      const causeDe = x => (x.pret == null || x.pret > x.b.echeance + 1e-9 ? 'commande'
        : x.blocage || (parVehicule.has(x.v.id) ? 'vehicule' : parChauffeur.has(x.v.id) ? 'chauffeur' : 'fenetre'));
      const ETAT = { commande: 'bloque', chauffeur: 'chauffeurs', vehicule: 'vehicule', fenetre: 'fenetre' };
      const tard = [], non = [];
      for (const x of mesVols) {
        const v = x.v, charge = x.etat === 'fait', enRetard = !charge || x.finCharge > x.b.limite + 1e-9, cause = enRetard ? causeDe(x) : null;
        if (!charge) {
          const ligne = { atelier: a.id, service: a.service, nom: 'Vol ' + v.id, vol: v.id, cie: v.cie, classes: v.classes.slice(), pax: { ...v.pax },
            depart: v.depart, handling: true, debut: x.pret ?? (v.depart - avance), fin: null, duree: x.b.charge, attente: 0, arret: 0, pret: x.pret,
            impossible: true, limite: x.b.limite, cause, vehicule: x.b.vehicule,
            ...(cause === 'chauffeur' ? { sansChauffeur: true, chauffeurs: x.b.long ? chauffeurs.long : chauffeurs.court, categorie: x.b.long ? 'long' : 'court' } : {}) };
          journal.push(ligne); vue.lots.push(ligne); non.push({ x, cause });
        } else if (enRetard) tard.push({ x, cause });
        vols.push({ id: v.id, cie: v.cie, depart: v.depart, classes: v.classes, pax: v.pax, atelier: a.id, service: a.service,
          debut: charge ? x.debutCharge : null, fin: charge ? x.finCharge : null, pret: x.pret,
          attente: charge ? x.attente : 0,
          retard: charge ? Math.max(0, x.finCharge - x.b.limite) : null, aHeure: charge && x.finCharge <= x.b.limite + 1e-9,
          etat: charge ? (enRetard ? 'retard' : 'ok') : ETAT[cause], ...(cause ? { cause } : {}),
          limite: x.b.limite, echeanceCommandes: x.b.echeance, vehicule: x.b.vehicule, tournee: charge ? x.tournee : null,
          chauffeurs: x.b.long ? chauffeurs.long : chauffeurs.court, categorie: x.b.long ? 'long' : 'court',
          ...(x.b.arrivee != null ? { arrivee: x.b.arrivee,
            dechargement: x.dech === 'fait' ? { debut: x.debutDech, fin: x.finDech, tournee: x.tourneeDech } : null } : {}),
          ...(x.b.courte ? { escaleCourte: true } : {}),
          attendu: x.pret == null ? x.attendus.filter(e => !e.ev.declenche).map(e => ({ service: e.service, classe: e.classe })) : null });
      }
      // Les chauffeurs, leurs heures sup, et le pic de véhicules sortis par type.
      vue.conducteurs = conducteurs.map(d => ({ id: d.id, vehicule: d.vehicule, de: d.de, a: d.a, ...(d.veille ? { veille: true } : {}), heuresSup: d.heuresSup,
        ...(d.pauses.length ? { pauses: d.pauses.filter(x => x.prise != null).map(x => ({ debut: x.prise, duree: x.duree })) } : {}) }));
      vue.heuresSupChauffeurs = conducteurs.reduce((n, d) => n + d.heuresSup, 0);
      const pic = type => { let m = 0; for (const t of vue.tournees) if (t.vehicule === type) m = Math.max(m, vue.tournees.filter(u => u.vehicule === type && u.depart <= t.depart + 1e-9 && u.retour > t.depart + 1e-9).length); return m; };
      vue.vehiculesMax = { camion: pic('camion'), vl: pic('vl') };
      const dire = l => { const n = {}; for (const { cause } of l) n[cause] = (n[cause] || 0) + 1;
        return Object.entries(n).map(([c, k]) => k + ' ' + { commande: 'commande pas prête', chauffeur: 'faute de chauffeur', vehicule: 'faute de véhicule', fenetre: 'durées trop longues pour la fenêtre' }[c]).join(', '); };
      if (non.length) anomalies.push({ code: 'handling-chauffeurs', atelier: a.id,
        message: (a.nom || a.id) + ' : ' + non.length + (non.length > 1 ? ' vols ne sont pas chargés' : ' vol n’est pas chargé') + ' (' + dire(non) + ' ; premier : '
          + non[0].x.v.id + ' de ' + hhmm(non[0].x.v.depart) + ').' });
      if (tard.length) {
        const pire = tard.reduce((p, q) => (q.x.finCharge - q.x.b.limite > p.x.finCharge - p.x.b.limite ? q : p));
        anomalies.push({ code: 'handling-retard', atelier: a.id,
          message: (a.nom || a.id) + ' : ' + tard.length + (tard.length > 1 ? ' vols chargés' : ' vol chargé') + ' après leur heure limite (' + dire(tard)
            + ' ; le plus en retard : ' + pire.x.v.id + ', +' + Math.round(pire.x.finCharge - pire.x.b.limite) + ' min).' });
      }
    }
    for (const a of handlings) {
      // Le handling 24 h/24 a son bilan : ses vols, à l'heure ou non, et pourquoi.
      if (a.handling24h === true && suivis24h.has(a.id)) { bilan24h(a); continue; }
      const s = suspendus.get(a.id) || {};
      const lignes = journal.filter(l => l.handling && l.atelier === a.id);
      const mesVols = volsDe.get(a.id) || [];
      let bloque = null;
      for (const v of mesVols) {
        const l = lignes.find(x => x.vol === v.id);
        if (!l && s.vol && s.vol.id === v.id) bloque = v;
        const etat = l ? (l.fin == null ? (l.sansChauffeur ? 'chauffeurs' : 'poste') : l.fin <= v.depart ? 'ok' : 'retard') : 'bloque';
        vols.push({ id: v.id, cie: v.cie, depart: v.depart, classes: v.classes, pax: v.pax, atelier: a.id, service: a.service,
          debut: l && l.fin != null ? l.debut : null, fin: l ? l.fin : null, pret: l ? (l.pret ?? null) : null,
          attente: l ? l.attente : 0, retard: l && l.fin != null ? Math.max(0, l.fin - v.depart) : null,
          aHeure: !!(l && l.fin != null && l.fin <= v.depart), etat,
          ...(l && l.chauffeurs ? { chauffeurs: l.chauffeurs, categorie: l.categorie, attenteChauffeurs: l.attenteChauffeurs || 0 } : {}),
          attendu: bloque === v ? (s.attendus || []).filter(x => !x.ev.declenche).map(x => ({ service: x.service, classe: x.classe })) : null });
      }
      if (bloque) {
        const manque = (s.attendus || []).filter(x => !x.ev.declenche);
        const derriere = mesVols.length - mesVols.indexOf(bloque) - 1;
        anomalies.push({ code: 'handling-bloque', atelier: a.id, vol: bloque.id,
          message: (a.nom || a.id) + ' attend toujours le vol ' + bloque.id + ' (' + hhmm(bloque.depart) + ') : '
            + manque.slice(0, 3).map(x => enClair(x.classe) + ' n’arrive jamais de « ' + nom(x.service) + ' »').join(', ')
            + (manque.length > 3 ? '…' : '') + '. Il charge dans l’ordre des départs : '
            + (derriere ? derriere + (derriere > 1 ? ' vols suivants ne sont pas chargés.' : ' vol suivant n’est pas chargé.') : 'c’était le dernier vol.') });
      }
      const sansChauffeur = lignes.filter(l => l.sansChauffeur);
      if (sansChauffeur.length) {
        anomalies.push({ code: 'handling-chauffeurs', atelier: a.id,
          message: (a.nom || a.id) + ' : ' + sansChauffeur.length + (sansChauffeur.length > 1 ? ' vols ne sont pas chargés' : ' vol n’est pas chargé')
            + ' faute de chauffeurs (premier : ' + sansChauffeur[0].vol + ' de ' + hhmm(sansChauffeur[0].depart) + ', ' + sansChauffeur[0].chauffeurs
            + (sansChauffeur[0].chauffeurs > 1 ? ' chauffeurs' : ' chauffeur') + ' pour ' + (sansChauffeur[0].categorie === 'long' ? 'un long' : 'un court') + ' courrier). '
            + 'Ajoutez des chauffeurs dans un créneau qui couvre ces départs.' });
      }
      const nonCharges = lignes.filter(l => l.horsPoste);
      if (nonCharges.length) {
        const vue = parId.get(a.id);
        anomalies.push({ code: 'handling-poste', atelier: a.id,
          message: (a.nom || a.id) + ' : ' + nonCharges.length + (nonCharges.length > 1 ? ' vols ne sont pas chargés' : ' vol n’est pas chargé')
            + ', le poste finit' + (vue && vue.finPoste != null ? ' à ' + hhmm(vue.finPoste) : '') + ' (premier : ' + nonCharges[0].vol + ' de ' + hhmm(nonCharges[0].depart)
            + '). Ajoutez une équipe de handling plus tard, ou allongez sa présence.' });
      }
      const tard = lignes.filter(l => l.fin != null && l.fin > l.depart);
      if (tard.length) {
        const pire = tard.reduce((x, y) => (y.fin - y.depart > x.fin - x.depart ? y : x));
        anomalies.push({ code: 'handling-retard', atelier: a.id,
          message: (a.nom || a.id) + ' : ' + tard.length + (tard.length > 1 ? ' vols chargés' : ' vol chargé') + ' après leur départ (le plus en retard : '
            + pire.vol + ', +' + Math.round(pire.fin - pire.depart) + ' min).' });
      }
    }
    vols.sort((x, y) => x.depart - y.depart || String(x.id).localeCompare(String(y.id)));
    // La plonge par vol : les compagnies sans durée, les vols non lavés, l'attente.
    for (const a of ateliers.filter(x => x.type === 'lavage' && x.parVol)) {
      const lignes = journal.filter(l => l.retourVol && l.atelier === a.id);
      const sansDuree = [...new Set(lignes.filter(l => dureeLavageVol(a, l.cie) == null).map(l => l.cie))];
      if (sansDuree.length) anomalies.push({ code: 'plonge-duree', atelier: a.id,
        message: (a.nom || a.id) + ' : aucun temps de lavage pour ' + sansDuree.slice(0, 6).join(', ') + (sansDuree.length > 6 ? '…' : '')
          + ' : ces vols sont lavés en temps nul. Donnez un temps à la compagnie, ou un temps pour toutes.' });
      const non = lignes.filter(l => l.impossible);
      const pire = lignes.filter(l => !l.impossible).reduce((m, l) => (l.attente > (m ? m.attente : 0) ? l : m), null);
      if (non.length || (pire && pire.attente >= 60)) anomalies.push({ code: 'plonge-vol', atelier: a.id,
        message: (a.nom || a.id) + ' : ' + (non.length ? non.length + (non.length > 1 ? ' vols revenus ne sont pas lavés' : ' vol revenu n’est pas lavé')
          + ' (le poste finit, ou aucun tunnel ne tourne)' + (pire && pire.attente >= 60 ? ' ; ' : '.') : '')
          + (pire && pire.attente >= 60 ? 'le vol ' + pire.vol + ' attend ' + dureeLisible(pire.attente) + ' avant d’entrer au tunnel. Ajoutez un tunnel ou du monde.' : '') });
    }
    const plongeurs = ateliers.filter(a => a.type === 'lavage');
    const plonge = mat.actif ? bilanPlonge(file, stock, plongeurs, env.maintenant,
      plongeurs.map(a => (parId.get(a.id) || {}).finPoste).filter(Number.isFinite)) : null;
    if (plonge && plonge.apresFermeture > 0) {
      anomalies.push({ code: 'plonge-fermee', service: plonge.services[0] || 'plonge',
        message: Math.round(plonge.apresFermeture) + ' u reviennent après la fin du poste de la plonge (' + hhmm(plonge.fermeture)
          + ') et ne sont pas lavées ce jour : ouvrez-la plus tard, ou ajoutez une équipe de plonge du soir.' });
    }
    if (plonge && plonge.attenteMax >= 60) {
      anomalies.push({ code: 'bouchon', service: plonge.services[0] || 'plonge',
        message: 'Bouchon à la plonge : jusqu’à ' + Math.round(plonge.max) + ' u sales en attente (à ' + hhmm(plonge.maxA) + ') ; '
          + 'du matériel attend jusqu’à ' + dureeLisible(plonge.attenteMax) + ' avant d’être lavé.'
          + (plonge.depassements.length ? ' Les retours dépassent son débit (' + Math.round(plonge.capacite) + ' u/h) de '
            + plonge.depassements.map(d => hhmm(d.de) + ' à ' + hhmm(d.a)).join(', ') + '.' : '') });
    }

    // Les heures sup de chaque équipe : ce qu'elle a travaillé après sa présence,
    // plafonné. Une tâche coupée par le plafond l'a fait travailler jusqu'à lui.
    // Ni une mise à disposition ni une équipe d'appui n'en font ; un handling à
    // créneaux non plus : ses chauffeurs viennent à leurs créneaux.
    const atelierDe = new Map(ateliers.map(a => [a.id, a]));
    for (const v of suivi) {
      const a = atelierDe.get(v.id);
      if (v.presence == null || !Number.isFinite(v.debutPoste) || a.type === 'dispo' || a.type === 'appui'
        || (a.type === 'handling' && (creneauxDe(a).length || a.handling24h === true))) { v.heuresSup = 0; continue; }
      const coupee = v.lots.some(l => l.horsPoste && l.fait > 0) ? v.debutPoste + v.presence + SUP : -Infinity;
      const fin = Math.max(v.fin ?? -Infinity, coupee);
      v.heuresSup = Number.isFinite(fin) ? Math.max(0, Math.min(SUP, fin - (v.debutPoste + v.presence))) : 0;
    }
    // Les heures sup en minutes × personnes (correction du banc d'essai), le seul champ qu'un banc additionne.
    // `heuresSup` reste, par personne, l'heure où l'équipe part. Une plonge à tunnels : seules les personnes des
    // tunnels qui finissent un vol après sa présence restent, chacun jusqu'à la fin de son dernier vol ; les autres
    // partent à la fin de leur présence. Toute autre équipe (une plonge sans liste de tunnels aussi) : heures sup × personnes.
    for (const v of suivi) {
      const a = atelierDe.get(v.id);
      v.heuresSupPersonnes = a.type === 'lavage' && Array.isArray(a.tunnels) && a.tunnels.length && v.heuresSup > 0
        ? heuresSupDesTunnels(a, v, SUP) : v.heuresSup * (+v.personnes || 0);
    }

    const suivies = Object.values(derniers).filter(c => !c.absente);
    const aHeure = suivies.filter(c => c.aHeure).length;
    const retards = suivies.filter(c => c.retard != null).map(c => c.retard);

    return {
      ok: true,
      anomalies,
      classes,
      ateliers: suivi,
      conditions: regles.conditions,
      // L'effectif de chaque équipe calculée : { personnes, saisi, hommeMinutes, poste, rendement }.
      effectifs,
      lots: journal.sort((a, b) => a.debut - b.debut),
      parClasse: derniers,
      indicateurs: {
        classesSuivies: suivies.length,
        classesAbsentes: Object.values(derniers).filter(c => c.absente).length,
        aHeure,
        // En retard = prête, mais après son échéance ; pas finie = jamais prête.
        // Les confondre faisait dire « 3 en retard » avec « retard le plus long : aucun ».
        enRetard: suivies.filter(c => c.fin != null && !c.aHeure).length,
        pasFinies: suivies.filter(c => c.fin == null).length,
        partAHeure: suivies.length ? Math.round(aHeure / suivies.length * 100) : null,
        retardMoyen: retards.length ? retards.reduce((a, b) => a + b, 0) / retards.length : null,
        retardMax: retards.length ? Math.max(...retards) : null,
        // La dernière COMMANDE prête : la plonge qui lave les retours du soir,
        // ou un magasin ouvert, ne sont pas des commandes.
        finDerniere: suivies.some(c => c.fin != null) ? Math.max(...suivies.filter(c => c.fin != null).map(c => c.fin)) : null,
        attenteTotale: journal.reduce((n, l) => n + l.attente, 0),
        attenteMateriel: journal.reduce((n, l) => n + (l.attenteMateriel || 0), 0),
        hommeHeures: journal.reduce((n, l) => n + (l.hommeMinutes || 0), 0) / 60,
        // Les vols, quand un handling les charge.
        volsSuivis: vols.length,
        volsCharges: vols.filter(v => v.fin != null).length,
        volsAHeure: vols.filter(v => v.aHeure).length,
        partVolsAHeure: vols.length ? Math.round(vols.filter(v => v.aHeure).length / vols.length * 100) : null,
        retardVolMax: vols.some(v => v.retard != null) ? Math.max(...vols.filter(v => v.retard != null).map(v => v.retard)) : null
      },
      vols,
      materiel: mat.actif ? {
        unites: unitesDe(mat), stockInitial: mat.stockInitial,
        entrees: stock.entrees, lavees: Math.round(stock.lavees), consommees: stock.consommees,
        restePropre: Math.round(stock.propre), resteSale: Math.round(stock.sale),
        minPropre: Math.round(stock.minPropre), attente: stock.attente,
        enAttente: attenteurs.length
      } : null,
      stocks,
      plonge,
      // Les renforts de la journée (évolution 5), équipe par équipe : { de, vers, minutes }.
      ...(REN ? { renforts } : {}),
      // Le sale non lavé à la fin de la journée (évolution 6), quand l'unité a une plonge.
      ...(lavages.size ? { saleFinal } : {}),
      finDe
    };
  }

  /**
   * Les chauffeurs calculés au plus juste (§ 4) : un premier passage, sans
   * limite de chauffeurs ni de véhicules, donne les vols du handling et l'heure
   * où chacun est prêt ; le besoin et les vacations s'en déduisent (étapes 1 et
   * 2) ; puis la journée se joue avec ce plan comme avec des créneaux saisis.
   * Un vol en retard faute de chauffeur ajoute une vacation là où elle manque,
   * et la journée se rejoue, au plus `iterationsMax` fois (étape 3). Un retard
   * dû à la production reste un retard : il n'ajoute pas de chauffeur.
   */
  function simulerAvecChauffeursCalcules(opts, calcules) {
    const ids = new Set(calcules.map(a => a.id));
    const jouerAvec = f => simulerJournee({ ...opts, ateliers: opts.ateliers.map(a => (ids.has(a.id) ? f(a) : a)) });
    const r0 = jouerAvec(a => ({ ...a, creneaux: [], simultanes: 100000, camions: 0, camionsVL: 0 }));
    if (!r0.ok) return r0;
    const brut = new Map((opts.vols || []).filter(v => (v.sens || 'DEP') === 'DEP').map(v => [v.id, v]));
    const nb = (v, d) => { const k = +v; return Number.isInteger(k) && k > 0 ? k : d; };
    const plans = calcules.map(a => {
      const R = { ...reglagesChauffeurs(a, opts.regime), sup: opts.heuresSup && opts.heuresSup.actif !== false && +opts.heuresSup.plafond > 0 ? +opts.heuresSup.plafond : 0 };
      const H = reglages24h(a), ch = a.chauffeurs || {};
      const avance = Number.isFinite(+a.avance) && a.avance !== null && a.avance !== '' ? Math.max(0, +a.avance) : AVANCE_HANDLING;
      // Les fenêtres se lisent sur les heures de vol ; « selon la préparation », pas avant que le vol soit prêt.
      const vols = r0.vols.filter(v => v.atelier === a.id).map(v => ({ id: v.id, b: besoin24h(a, { ...(brut.get(v.id) || { id: v.id }), cie: v.cie, std: v.depart }),
        ...(R.selonPreparation ? { pret: v.pret } : {}) }));
      // Deux placements à l'étape 1 — étalé (le pic le plus bas), et au plus tôt —, chacun couvert de vacations :
      // on garde celui qui en demande le moins (à égalité, l'étalé). Le besoin étalé sert à la borne basse.
      const essai = placement => {
        const besoin = besoinDesTournees(vols, { avance, entreAvions: H.entreAvions, dechargementsParTournee: H.dechargementsParTournee, flotte: H.flotte,
          chLong: nb(ch.long, 2), chCourt: nb(ch.court, 1), placement, dureeMax: dureeMenable(R) });
        const vacations = {}, affectation = {};
        for (const t of VEHICULES) { affectation[t] = vacationsPourTournees(besoin.tournees.filter(T => T.v === t), R, H.flotte[t]); vacations[t] = affectation[t].vacations; }
        const hors = VEHICULES.reduce((n, t) => n + affectation[t].horsVacations.size, 0), total = VEHICULES.reduce((n, t) => n + vacations[t].length, 0);
        return { besoin, vacations, affectation, hors, total };
      };
      const etale = essai('nivele'), tot = essai('tot');
      const retenu = tot.hors < etale.hors || (tot.hors === etale.hors && tot.total < etale.total) ? tot : etale;
      const besoin = retenu.besoin, vacations = retenu.vacations, besoinEtale = etale.besoin.D;
      for (const t of VEHICULES) {
        const v = retenu.affectation[t];
        // Les enchaînements que l'étape 2 a dû scinder.
        for (const x of v.scindees) { Object.assign(x.T, x.charge); delete x.T.scinder; besoin.tournees.push(...x.seuls); }
        // Les tournées partent à l'heure que les vacations leur ont trouvée : le besoin se relit.
        for (const [T, depart] of v.departs) { T.depart = depart; T.retour = depart + T.d; T.menee = v.chauffeurs.get(T) || [];
          if (v.horsVacations.has(T)) T.horsVacations = true; if (v.attendVehicule.has(T)) T.attendVehicule = true; }
      }
      besoin.D = {}; besoin.V = {};
      for (const t of VEHICULES) { besoin.D[t] = new Float64Array(MINUTES_PAR_JOUR); besoin.V[t] = new Float64Array(MINUTES_PAR_JOUR); }
      for (const T of besoin.tournees) for (let i = 0; i < Math.max(1, Math.ceil(T.d - 1e-9)); i++) { const j = modJour(T.depart + i); besoin.D[T.v][j] += T.k; besoin.V[T.v][j] += 1; }
      return { a, R, besoin, besoinEtale, vacations, iterations: 0, ajoutees: { camion: 0, vl: 0 } };
    });
    // Le plan, lisible comme des créneaux : une ligne par véhicule et par heure de début.
    const groupes = pl => VEHICULES.flatMap(t => {
      const n = new Map(); for (const v of pl.vacations[t]) n.set(v.s, (n.get(v.s) || 0) + 1);
      return [...n].sort((x, y) => x[0] - y[0]).map(([s, k]) => ({ vehicule: t, s, n: k }));
    });
    const creneauxDu = pl => groupes(pl).map(g => ({ de: hhmm(g.s), a: hhmm(modJour(g.s + pl.R.presence)), n: g.n, ...(g.vehicule === 'vl' ? { type: 'vl' } : {}),
      pauses: pl.R.pauses, retardPause: pl.R.retardPauseMax }));
    // Les tournées du plan, pour la journée qui le joue : l'heure de chacune, et ses enchaînements.
    // Et qui les mène : l'identifiant des chauffeurs dans la journée jouée (créneau.rang ; « v » : la veille).
    const prevuDu = pl => {
      const charge = new Map(), seul = new Map(), suite = new Map(), chauffeurs = new Map(), parVehicule = new Set(), parChauffeur = new Set();
      // Les vagues (évolution 8) : chaque vol d'une tournée qui en sert plusieurs → les vols de sa tournée, dans l'ordre.
      const vague = new Map();
      const index = new Map(groupes(pl).map((g, i) => [g.vehicule + '|' + g.s, i]));
      for (const T of pl.besoin.tournees) {
        for (const c of T.charges) charge.set(c.x.id, T.depart);
        if (T.charges.length > 1) { const ids = T.charges.map(c => c.x.id); for (const id of ids) vague.set(id, ids); }
        if (T.quoi === 'decharge') seul.set(T.decharges[0].x.id, T.depart);
        if (T.quoi === 'enchainee') suite.set(T.charges[0].x.id, T.decharges.map(u => u.x.id));
        // Une tournée que le plan fait attendre un véhicule : son retard est dû à la flotte ; une tournée
        // qu'aucune vacation possible ne mène dans sa fenêtre : il l'est au manque de chauffeur.
        if (T.attendVehicule) for (const x of T.charges.concat(T.decharges)) parVehicule.add(x.x.id);
        if (T.horsVacations) for (const x of T.charges.concat(T.decharges)) parChauffeur.add(x.x.id);
        const ids = (T.menee || []).map(m => (m && index.has(T.v + '|' + m.s) && (m.jour === 0 || m.jour === -1)
          ? (m.jour < 0 ? 'v' : '') + (index.get(T.v + '|' + m.s) + 1) + '.' + (m.rang + 1) : null));
        if (ids.length && ids.every(Boolean)) chauffeurs.set((T.charges.length ? 'c:' + T.charges[0].x.id : 'd:' + T.decharges[0].x.id), ids);
      }
      return { charge, seul, suite, chauffeurs, parVehicule, parChauffeur, vague };
    };
    const manquentDe = (res, pl) => res.vols.filter(v => v.atelier === pl.a.id && v.cause === 'chauffeur')
      .sort((x, y) => x.limite - y.limite || String(x.id).localeCompare(String(y.id)));
    let r, avant = null;
    for (let garde = 0; garde < 100; garde++) {
      const cr = new Map(plans.map(pl => [pl.a.id, creneauxDu(pl)])), prevus = new Map(plans.map(pl => [pl.a.id, prevuDu(pl)]));
      r = jouerAvec(a => ({ ...a, creneaux: cr.get(a.id), _plan: prevus.get(a.id) }));
      if (!r.ok) return r;
      // Une vacation ajoutée qui n'ôte aucun retard faute de chauffeur ne sert à rien : retirée, et la
      // vérification de ce plan s'arrête là (on rejoue la journée sans elle).
      let retiree = false;
      if (avant) for (const [pl, copie] of avant.ajouts) if (manquentDe(r, pl).length >= manquentDe(avant.r, pl).length) {
        pl.vacations = copie.vacations; pl.ajoutees = copie.ajoutees; pl.iterations = copie.iterations; pl.fini = true; retiree = true;
      }
      avant = null;
      if (retiree) continue;
      const ajouts = new Map();
      for (const pl of plans) {
        if (pl.fini || pl.iterations >= pl.R.iterationsMax) continue;
        const manquent = manquentDe(r, pl);
        if (!manquent.length) continue;
        const copie = { vacations: { camion: pl.vacations.camion.slice(), vl: pl.vacations.vl.slice() }, ajoutees: { ...pl.ajoutees }, iterations: pl.iterations };
        let ajoute = false;
        for (const t of VEHICULES) { const l = manquent.filter(v => v.vehicule === t), n = l.length ? ajouterVacation(pl, t, l) : 0; if (n) { pl.ajoutees[t] += n; ajoute = true; } }
        if (ajoute) { pl.iterations++; ajouts.set(pl, copie); }
      }
      if (!ajouts.size) break;
      avant = { r, ajouts };
    }
    for (const pl of plans) {
      const vue = r.ateliers.find(x => x.id === pl.a.id); if (!vue) continue;
      const P = pl.R.presence, chauffeurs = {}, borne = {}, vehicules = {};
      for (const t of VEHICULES) {
        chauffeurs[t] = pl.vacations[t].length;
        // Le plus bas des deux placements : celui de l'étape 1 (étalé) et celui que les vacations ont retenu.
        const b = borneBasse(pl.besoin.D[t], pl.R), e = borneBasse(pl.besoinEtale[t], pl.R);
        const pic = Math.min(b.pic, e.pic), instants = Math.min(b.instants, e.instants);
        borne[t] = { pic, minutes: b.minutes, parHeures: b.parHeures, instants, chauffeurs: Math.max(pic, b.parHeures, instants) };
        vehicules[t] = Math.max(0, ...pl.besoin.V[t]);
      }
      const payees = (chauffeurs.camion + chauffeurs.vl) * P;
      const conduites = (vue.tournees || []).reduce((n, T) => n + (T.retour - T.depart) * T.conducteurs.length, 0);
      vue.planChauffeurs = {
        mode: 'calcules', selonPreparation: pl.R.selonPreparation, presence: P, pauses: pl.R.pauses,
        vacations: groupes(pl).map(g => ({ vehicule: g.vehicule, debut: hhmm(g.s), de: g.s, a: g.s + P, n: g.n })),
        chauffeurs, total: chauffeurs.camion + chauffeurs.vl, heuresPayees: payees,
        borneBasse: { ...borne, total: borne.camion.chauffeurs + borne.vl.chauffeurs },
        occupation: payees > 0 ? conduites / payees : null, minutesTournees: conduites,
        vehiculesMax: vue.vehiculesMax, vehiculesPlan: vehicules, heuresSupChauffeurs: vue.heuresSupChauffeurs,
        iterations: pl.iterations, ajoutees: pl.ajoutees,
        retardsChauffeur: r.vols.filter(v => v.atelier === pl.a.id && v.cause === 'chauffeur').length,
        // Les tournées qu'aucune vacation possible ne peut mener (sans heures sup) : les heures de début le disent.
        horsVacations: pl.besoin.tournees.filter(T => T.horsVacations).length,
        // Les tournées telles que le plan les place (la journée jouée part de là).
        tournees: pl.besoin.tournees.slice().sort((x, y) => x.depart - y.depart || String((x.charges[0] || x.decharges[0]).x.id).localeCompare(String((y.charges[0] || y.decharges[0]).x.id)))
          .map(T => ({ vehicule: T.v, chauffeurs: T.k, depart: T.depart, retour: T.depart + T.d, charges: T.charges.map(x => x.x.id), decharges: T.decharges.map(x => x.x.id) }))
      };
    }
    return r;
  }

  /** Étape 3 : la vacation qui manque — celle qui couvre le plus des tournées restées sans chauffeur, à l'heure où le plan les plaçait. */
  function ajouterVacation(pl, type, manquent) {
    const prevue = new Map(), dechargee = new Map();
    for (const T of pl.besoin.tournees) { for (const c of T.charges) prevue.set(c.x.id, T); for (const u of T.decharges) dechargee.set(u.x.id, T); }
    // Une tournée qu'aucune vacation ne peut mener — la sienne, ou celle qui décharge son avion — n'en fait pas
    // ajouter : ce serait pour rien.
    // Une tournée qui sert plusieurs vols (évolution 8) ne compte qu'une fois.
    const vues = new Set();
    const voulues = manquent.map(v => { const T = prevue.get(v.id), U = dechargee.get(v.id);
      if (T && vues.has(T)) return null; if (T) vues.add(T);
      return (T && T.horsVacations) || (U && U.horsVacations) ? null : T ? { de: T.depart, d: T.d, k: T.k } : { de: v.limite - 60, d: 60, k: v.chauffeurs || 1 }; }).filter(Boolean);
    if (!voulues.length) return false;
    let m = null;
    for (const s of pl.R.debuts) {
      let n = 0;
      for (const x of voulues) if (modJour(x.de - s) + x.d <= pl.R.presence) n++;
      const avant = modJour(voulues[0].de - s);
      if (!m || n > m.n || (n === m.n && avant < m.avant)) m = { s, n, avant };
    }
    // Autant de vacations que la première de ces tournées a de chauffeurs : un long courrier en demande deux.
    for (let i = 0; i < voulues[0].k; i++) pl.vacations[type].push({ s: m.s, pauses: pl.R.pauses.map(x => ({ ...x })) });
    pl.vacations[type].sort((x, y) => x.s - y.s);
    return voulues[0].k;
  }

  /* ======================================================================
   *  7 bis. LE TEMPS ENTRE DEUX ATELIERS
   *
   *  Un atelier qui finit TX BC à 07:10 et une prépa qui ne la prend qu'à
   *  09:10 : pendant deux heures, TX BC est en STOCK entre les deux. Le
   *  calcul ne l'invente pas, il le lit dans le journal : pour chaque lot et
   *  chaque classe, la fin du lot de chaque service d'avant, et le début de
   *  celui-ci. De même entre la dernière étape et le chargement de l'avion.
   *
   *  À la plonge, c'est l'inverse : les retours arrivent à leur rythme, les
   *  tunnels lavent au leur. Quand il en arrive plus qu'ils n'en lavent, une
   *  FILE de sale se forme : on la suit dans le temps.
   * ====================================================================*/

  /** « 2 h 05 », « 45 min ». */
  function dureeLisible(m) {
    const n = Math.round(m);
    return n < 60 ? n + ' min' : Math.floor(n / 60) + ' h ' + String(n % 60).padStart(2, '0');
  }

  /** Le niveau d'une série de points [[t, niveau]…] reliés en ligne droite
   *  (le sale qui baisse pendant qu'un tunnel lave), à l'instant `t`. */
  function niveauLineaire(serie, t) {
    let avant = null;
    for (const pt of serie || []) {
      if (pt[0] <= t) { avant = pt; continue; }
      if (!avant) return 0;
      return avant[1] + (pt[1] - avant[1]) * (t - avant[0]) / (pt[0] - avant[0]);
    }
    return avant ? avant[1] : 0;
  }

  /** Le niveau d'une série en escalier [[t, niveau]…] à l'instant `t`. */
  function niveauA(serie, t) {
    let v = 0;
    for (const [u, n] of serie || []) { if (u > t) break; v = n; }
    return v;
  }

  /** Des séjours [{entree, sortie, repas}] vers une série en escalier. */
  function serieDe(sejours) {
    const ev = [];
    for (const s of sejours) { ev.push([s.entree, s.repas]); ev.push([s.sortie, -s.repas]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const serie = []; let n = 0;
    for (const [t, d] of ev) {
      n += d;
      if (serie.length && serie[serie.length - 1][0] === t) serie[serie.length - 1][1] = n;
      else serie.push([t, n]);
    }
    return serie;
  }

  /** Le plus haut d'une série, et quand. */
  function sommet(serie) {
    let max = 0, a = null;
    for (const [t, n] of serie || []) if (n > max) { max = n; a = t; }
    return { max, a };
  }

  /**
   * Les séjours en stock : entre deux services du chemin d'une classe, et
   * entre sa dernière étape et le chargement. Une mise à disposition (le
   * magasin ouvert) n'est pas un stock produit : elle ne compte pas.
   */
  function stocksEntreAteliers(journal, classes, derniers, amontsDe) {
    const parClasse = new Map(classes.map(c => [c.id, c]));
    const lotDe = new Map();
    for (const l of journal) if (!l.dispo && !l.handling) for (const c of l.classes || []) lotDe.set(l.service + '|' + c, l);
    // Au handling, une commande ne séjourne que pour un vol : ses repas à bord de ce vol.
    const auHandling = new Set(journal.filter(l => l.handling).flatMap(l => l.classes || []));
    const sejours = [];
    for (const l of journal) {
      if (l.dispo || !Number.isFinite(l.debut)) continue;
      for (const c of l.classes || []) {
        const k = parClasse.get(c); if (!k) continue;
        for (const amont of amontsDe(l.service, c)) {
          const a = lotDe.get(amont + '|' + c);
          if (!a || a.fin == null || l.debut - a.fin < 1) continue;
          sejours.push({ de: amont, vers: l.service, classe: c, entree: a.fin, sortie: l.debut,
            duree: l.debut - a.fin, repas: (l.handling && l.pax ? l.pax[c] : k.pax) || 0, ...(l.vol ? { vol: l.vol } : {}) });
        }
      }
    }
    // Prête avant le chargement : elle attend l'avion.
    for (const d of Object.values(derniers)) {
      if (d.fin == null || d.absente || auHandling.has(d.id) || !Number.isFinite(d.echeance) || d.echeance - d.fin < 1) continue;
      const derniere = journal.find(l => !l.dispo && (l.classes || []).includes(d.id) && l.fin === d.fin);
      sejours.push({ de: derniere ? derniere.service : null, vers: 'chargement', classe: d.id, entree: d.fin,
        sortie: d.echeance, duree: d.echeance - d.fin, repas: d.pax || 0 });
    }
    const grouper = cle => {
      const m = new Map();
      for (const s of sejours) { const k = cle(s); if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
      return m;
    };
    const parLien = [...grouper(s => s.de + '>' + s.vers)].map(([k, ss]) => {
      const serie = serieDe(ss), h = sommet(serie);
      const long = ss.reduce((x, y) => (y.duree > x.duree ? y : x));
      const poids = ss.reduce((n, s) => n + (s.repas || 1), 0);
      return { id: k, de: ss[0].de, vers: ss[0].vers, sejours: ss.length, repasMax: h.max, a: h.a,
        dureeMax: long.duree, classeMax: long.classe,
        dureeMoy: ss.reduce((n, s) => n + s.duree * (s.repas || 1), 0) / poids, serie };
    }).sort((x, y) => y.dureeMax - x.dureeMax);
    // Devant un service, une commande compte une fois, même livrée par deux
    // services (le matériel par la dotation, les produits par le magasin) :
    // en stock dès la première livraison, jusqu'à ce qu'il la prenne.
    const parService = {};
    for (const [v, ss] of grouper(s => s.vers)) {
      const parCmd = new Map();
      for (const x of ss) {
        const y = parCmd.get(x.classe);
        if (!y) parCmd.set(x.classe, { ...x }); else y.entree = Math.min(y.entree, x.entree);
      }
      parService[v] = serieDe([...parCmd.values()]);
    }
    return { sejours, parLien, parService };
  }

  /**
   * La file de sale devant la plonge : son niveau dans le temps, le temps
   * qu'une unité y attend, et les heures où les retours dépassent ce que les
   * tunnels lavent en une heure.
   */
  function bilanPlonge(file, stock, lavages, finJournee, finsDePoste) {
    // Une plonge par vol n'a pas de débit en unités par heure : pas de dépassement
    // à calculer, et surtout pas de débit « infini », qu'un graphique mettrait à l'échelle.
    const parVol = !!lavages.length && lavages.every(a => a.parVol);
    const capacite = parVol ? null : lavages.reduce((n, a) => n + debitLavage(a), 0);
    // Les tunnels qui tournent, machine par machine : deux équipes qui se relaient
    // sur les mêmes tunnels n'en font pas deux fois plus (15/10).
    const machines = new Set();
    for (const a of lavages) {
      const tournent = Array.isArray(a.tunnels) && a.tunnels.length ? tunnelsQuiTournent(a).tournent : (a.personnes > 0 ? [{ nom: 'Tunnel' }] : []);
      for (const k of machinesDesTunnels(a, tournent)) machines.add(a.service + '|' + k);
    }
    const tunnels = machines.size;
    // La plonge ferme à la dernière fin de poste de ses équipes (sans fin : jamais).
    const fins = finsDePoste || [];
    const fermeture = lavages.length && fins.length === lavages.length ? Math.max(...fins) : null;
    const apresFermeture = fermeture == null ? 0 : file.retours.filter(x => x.t >= fermeture).reduce((n, x) => n + x.u, 0);
    const h = sommet(file.serie);
    const lavees = file.attentes.reduce((n, a) => n + a.u, 0);
    const parHeure = new Map();
    for (const r of file.retours) { const k = Math.floor(r.t / 60) * 60; parHeure.set(k, (parHeure.get(k) || 0) + r.u); }
    const heures = [...parHeure].sort((a, b) => a[0] - b[0]).map(([t, u]) => ({ t, u }));
    // Les heures où il revient plus que la plonge ne lave, regroupées en plages.
    const depassements = [];
    for (const x of parVol ? [] : heures) {
      if (x.u <= capacite) continue;
      const d = depassements[depassements.length - 1];
      if (d && d.a === x.t) d.a = x.t + 60; else depassements.push({ de: x.t, a: x.t + 60 });
    }
    return {
      services: [...new Set(lavages.map(a => a.service))],
      capacite, parVol, tunnels, serie: file.serie, max: h.max, maxA: h.a,
      // Le bouchon se mesure sur ce qui a été lavé : ce qui revient une fois
      // la plonge fermée n'attend pas dans une file, il n'est pas lavé du tout.
      attenteMax: file.attentes.reduce((n, a) => Math.max(n, a.pire), 0),
      fermeture: fermeture, apresFermeture,
      attenteMoy: lavees ? file.attentes.reduce((n, a) => n + a.attente * a.u, 0) / lavees : 0,
      retours: file.retours, heures, depassements,
      resteSale: Math.round(stock.sale), fin: finJournee
    };
  }

  /* ======================================================================
   *  8. EXPORT
   * ====================================================================*/

  const api = {
    MINUTES_PAR_JOUR, CABINES, TYPES,
    minutes, hhmm, idClasse, libelleClasse, nomCabine, enClair,
    REGIME_DEFAUT, REGIMES_AVANT, normaliserRegime, executerTache,
    classesDeVols, classesCategories, compagniesParService, declarerCategories, volsDesClasses, compteDuJour, appliquerConditions, dureeHandling, compagniesDe, AVANCE_HANDLING, BAREME_DEMO, RENDEMENT_DEMO, travailClasse, travailDans, volsPrepares, dureeFusion, minutesVolAppui,
    minutesDuPoste, effectifPour, PLAFOND_EFFECTIF,
    PAX_TYPE, TOUTES, cleBareme, normaliserBareme, minutesParVol, versHeures, versMinutes, heuresFr,
    arcsDuParcours, servicesDuParcours, routesDesClasses,
    fournisseurs, cycles, validerAteliers, debitLavage, tunnelsQuiTournent, NOM_CABINE,
    pausesDe, fusionnerPauses, arretsDeLigne, finAvecPauses, vaguesDe, disponibleDes, debitRobot, ouvertureDe, prochaineOuverture,
    categorieVol, chauffeursDe, creneauxDe, chauffeursPresents, dureeLavageVol, trajetHandling, debutTrajet, volsParCamionDe, volsParTourneeDe, quaiParVolDe, vitesseTunnel, machinesDesTunnels,
    parCompagnie, escaleDe, quaiDepartDe, quaiRetourDe, dechargementDe, vehiculeDe, vlDesDe, echangeDe, reglages24h, arriveeDe, besoin24h,
    reglagesChauffeurs, besoinDesTournees, vacationsPourTournees, borneBasse,
    UNITES_DEFAUT, unitesDe, retoursDeVols, besoinMateriel, sourceRetours, SOURCES_RETOURS,
    simuler, niveauA, niveauLineaire, dureeLisible
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
