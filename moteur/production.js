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
        c.vols.push({ id: v.id, pax, depart, echeance: depart - delai });
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
  function travailClasse(service, classe, bareme) {
    const b = bareme || BAREME_DEMO;
    const m = minutesParVol(b[service], classe);
    return (m || 0) * ((classe.vols && classe.vols.length) || 0);
  }

  /**
   * Les homme-minutes d'une classe DANS un atelier : celles que l'atelier fixe
   * pour elle (`a.minutes[classe]`, saisies dans sa case), sinon celles du
   * barème importé. La valeur fixée ne vaut que pour cet atelier.
   */
  function travailDans(a, classe, bareme) {
    const propre = a && a.minutes ? a.minutes[classe.id] : undefined;
    return Number.isFinite(propre) ? propre : travailClasse(a.service, classe, bareme);
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
   * Un robot (sa ligne), une plonge (ses tunnels), un handling (ses durées par
   * vol, ses chauffeurs) et une mise à disposition ne travaillent pas en
   * homme-minutes : leur effectif reste celui qu'on saisit.
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
      else if (!Array.isArray(a.lots) || !a.lots.length) dire('lots', 'ne fabrique rien pour l’instant.');
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

  /** Ce que les vols retour ramènent de sale, et quand, selon la source choisie. */
  function retoursDeVols(vols, materiel, tous) {
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
      for (const v of vols || []) {
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
      if (!k || typeof k !== 'object' || !(+k.seuil > 0)) continue;
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
    const bareme = opts.bareme ? normaliserBareme(opts.bareme).bareme : BAREME_DEMO;
    const rendement = opts.rendement === undefined ? RENDEMENT_DEMO : opts.rendement;
    if (!(rendement > 0)) throw new Error('Le rendement doit être strictement positif.');

    // Les compagnies × classes viennent du programme de vols, sauf quand
    // l'appelant en fournit une liste : l'utilisateur peut en retirer qu'il ne
    // fabrique pas, et en ajouter que le programme ne porte pas encore.
    // Un service par compagnie (l'armement) : une commande par compagnie dont un chemin passe par
    // lui, ou qu'une de ses équipes a cochée ; les autres n'ont pas d'armement (08/10).
    const base = (opts.classes || classesDeVols(opts.vols, { delaiChargement: opts.delaiChargement })).filter(c => !c.categorie);
    const classes = base.concat(classesCategories(opts.vols, opts.categories, { delaiChargement: opts.delaiChargement, compagnies: compagniesParService(base, routesDesClasses(base, opts), opts.ateliers) }))
      .sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
    const servicesCategories = new Set(Object.keys(opts.categories || {}));
    const parClasse = new Map(classes.map(c => [c.id, c]));
    // Le handling travaille le jour J des vols : jamais la veille.
    // Les équipes qui ne travaillent que selon le volume du jour (règle ⚡) : celles
    // dont la condition n'est pas remplie passent leurs commandes et leurs personnes.
    const regles = appliquerConditions((opts.ateliers || []).map(a => ({ ...a, type: a.type || 'manuel', ...(a.type === 'handling' ? { jour: 0 } : {}) })), classes);
    const ateliers = regles.ateliers;

    const services = new Set(ateliers.map(a => a.service));
    const anomalies = validerAteliers(ateliers, { services: opts.services || [...services], classes, noms: opts.noms });
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
      'tunnel-personnes', 'parcours-trou', 'hors-parcours', 'bareme-classe',
      'handling-duree', 'handling-sans', 'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs',
      'plonge-duree', 'plonge-vol',
      // Une case sans personne, un robot sous son effectif, une plonge dont aucun
      // tunnel ne tourne : cette case ne produit rien, et on le dit — mais le reste
      // de la journée se calcule. Mettre une case à 0 effaçait tous les résultats.
      'sans-personne', 'robot-arret', 'plonge-arret']);
    const bloquant = anomalies.some(a => !NON_BLOQUANTES.has(a.code));
    if (bloquant) return { ok: false, anomalies, classes, lots: [], ateliers: [], conditions: regles.conditions };

    // Une mise à disposition permanente n'a pas d'heure : elle ne doit pas
    // tirer le début de la journée en arrière.
    const debuts = ateliers.filter(a => a.type !== 'dispo' || a.permanent === false)
      .map(a => (a.type === 'dispo' ? disponibleDes(a) : minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR));
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
    for (const a of ateliers) {
      // `effectifFixe` : une équipe dont on essaie un autre effectif (« et avec une personne de plus ? »).
      if (a.type !== 'manuel' || !calculee(a)) continue;
      let poste;
      try { poste = minutesDuPoste(a, opts.regime); } catch (e) { continue; }   // heure invalide : déjà signalée
      const lots = (a.lots || []).flatMap(classesDuLot).map(id => parClasse.get(id)).filter(Boolean);
      const ici = lots.reduce((n, c) => n + travailDans(a, c, bareme), 0);
      const f = fusionDe(a);
      const avant = f ? lots.filter(c => fusionPar.get(cle(f, c.id)) === a.service).reduce((n, c) => n + travailClasse(f, c, bareme), 0) : 0;
      let n = effectifPour(ici, avant, poste, rendement);
      if (n == null) continue;
      // Des commandes sans minutes (barème à renseigner) : quelqu'un est là, en temps nul.
      if (n === 0 && lots.length) n = 1;
      effectifs[a.id] = { personnes: n, saisi: a.personnes, hommeMinutes: ici + avant, poste, rendement };
      a.personnes = n;
    }
    // L'équipe d'appui calculée : ses minutes par vol × les vols de chaque compagnie.
    // Sans minutes renseignées, son effectif saisi reste.
    const servicesLavage = new Set(ateliers.filter(a => a.type === 'lavage').map(a => a.service));
    let volsParCie = null;
    const compter = lavage => {
      const n = new Map();
      const liste = lavage ? retoursDeVols(opts.vols, opts.materiel, true).map(r => r.cie)
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
      if (effectifs[x.atelier] && (x.code === 'personnes' || x.code === 'sans-personne')) anomalies.splice(i, 1);
    }

    // Une mise à disposition sert TOUT : on ne lui fait pas énumérer les
    // classes. Le magasin sort du matériel pour qui en demande.
    for (const a of ateliers) if (a.type === 'dispo') for (const c of classes) produit.add(cle(a.service, c.id));
    // Une plonge ne fabrique pas de classe : elle lave ce qui revient, et la
    // boucle du matériel porte cette contrainte. Sur un parcours, elle est une
    // étape franchie, jamais un trou.
    const lavages = new Set(ateliers.filter(a => a.type === 'lavage').map(a => a.service));
    // Le handling charge des vols : il n'a pas de commande à se voir confier,
    // et il n'est pas un trou sur le chemin d'une commande.
    const handlings = ateliers.filter(a => a.type === 'handling');
    const servicesHandling = new Set(handlings.map(a => a.service));
    // Un service à atelier unique (BOB, checkeurs, 07/10) ne fait que certaines
    // compagnies : les autres passent par lui sans y être préparées, c'est voulu.
    const servicesAtelier = new Set(ateliers.filter(a => a.parCompagnie).map(a => a.service));
    // Les boutiques (légumerie, magasin… ouverts de telle à telle heure) : on
    // n'y est servi qu'aux heures d'ouverture.
    const boutiques = new Map(ateliers.filter(a => ouvertureDe(a)).map(a => [a.service, a]));
    /** L'instant où toutes les boutiques dont on a besoin sont ouvertes ensemble, à partir de `t`. */
    const servi = (services, t) => {
      const b = [...new Set(services)].map(s => boutiques.get(s)).filter(Boolean);
      for (let k = 0; k < 8 && b.length; k++) {
        const u = Math.max(...b.map(x => prochaineOuverture(x, t)));
        if (u === t) return t;
        t = u;
      }
      return t;
    };

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

    /** Prend `besoin` unités propres, en attendant s'il le faut. */
    function* prendreMateriel(besoin, contexte) {
      if (besoin <= 0) return 0;
      if (!attenteurs.length && stock.propre >= besoin) {
        stock.propre -= besoin; stock.consommees += besoin;
        stock.minPropre = Math.min(stock.minPropre, stock.propre);
        return 0;
      }
      const ev = env.evenement('materiel');
      attenteurs.push({ besoin, ev, ...contexte, depuis: env.maintenant });
      const t0 = env.maintenant;
      yield ev;
      const attendu = env.maintenant - t0;
      stock.attente += attendu;
      return attendu;
    }

    if (mat.actif) {
      for (const r of retoursDeVols(opts.vols, mat)) {
        env.processus(function* () {
          if (env.maintenant < r.t) yield env.delai(r.t - env.maintenant);
          noterFile();
          stock.sale += r.unites; stock.entrees += r.unites;
          file.arrivees.push({ t: env.maintenant, u: r.unites, vol: r.vol });
          file.retours.push({ t: env.maintenant, u: r.unites, vol: r.vol });
          noterFile();
          while (reveilsSale.length) { const ev = reveilsSale.shift(); if (!ev.declenche) ev.reussir(env.maintenant); }
        }, 'retour ' + r.vol);
      }
    }

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
    function* prendreLigne(k) {
      const l = lignes.get(k);
      if (l.libre) { l.libre = false; return; }
      const ev = env.evenement('ligne ' + k); l.file.push(ev);
      yield ev;
    }
    function rendreLigne(k) {
      const l = lignes.get(k);
      const ev = l.file.shift();
      if (ev) ev.reussir(env.maintenant); else l.libre = true;
    }

    for (const a of ateliers) {
      const vue = parId.get(a.id);
      // Un robot s'arrête aussi quand sa ligne s'arrête.
      const pauses = a.type === 'robot' ? fusionnerPauses([pausesDe(a), lignes.get(cleLigne(a)).arrets]) : pausesDe(a);
      const depart = vue.debut;
      const regime = normaliserRegime(a.regime, opts.regime);
      const finPoste = regime.actif ? depart + regime.presence : Infinity;
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
        const pistes = [];
        for (const x of groupe) {
          const vx = parId.get(x.id), rx = normaliserRegime(x.regime, opts.regime);
          const dx = vx.debut, fx = rx.actif ? dx + rx.presence : Infinity, px = pausesDe(x);
          // Sans liste de tunnels : un seul, s'il y a quelqu'un pour le tenir.
          const tournent = Array.isArray(x.tunnels) && x.tunnels.length ? tunnelsQuiTournent(x).tournent : (x.personnes > 0 ? [{ nom: 'Tunnel' }] : []);
          // Les temps saisis sont ceux d'un tunnel normal ; un tunnel « ×2 » lave
          // en deux fois moins de temps (retour d'usage du 29/09).
          tournent.forEach((t, i) => pistes.push({ a: x, vue: vx, depart: dx, finPoste: fx, pauses: px, vitesse: vitesseTunnel(t),
            libre: dx, numero: i + 1, nom: (t && t.nom) || 'Tunnel ' + (i + 1) }));
        }
        const retours = retoursDeVols(opts.vols, { ...mat, unites: mat.unites }, true);
        for (const r of retours) {
          const base = { service: a.service, nom: 'Vol ' + r.vol, vol: r.vol, cie: r.cie, classes: [], retourVol: true,
            arrivee: r.t, unites: r.unites, arret: 0 };
          // Le tunnel qui rend ce vol propre le plus tôt : le premier libre, ou
          // un plus rapide qui se libère un peu plus tard. À égalité, celui qui
          // est libre depuis le plus longtemps : le travail se répartit.
          let p = null, fin = Infinity;
          for (const q of pistes) {
            const d0 = Math.max(r.t, q.libre, q.depart);
            if (d0 >= q.finPoste) continue;
            const f = finAvecPauses(d0, (dureeLavageVol(q.a, r.cie) ?? 0) / q.vitesse, q.pauses).fin;
            if (f > q.finPoste) continue;
            if (f < fin - 1e-9 || (Math.abs(f - fin) <= 1e-9 && q.libre < p.libre)) { p = q; fin = f; }
          }
          if (!p) {
            // Aucune équipe au travail ne peut le laver avant la fin de son poste :
            // on le dit à celle qui finit le plus tard (le soir), pas à celle du matin.
            const der = groupe.map(x => pistes.find(q => q.a === x) || { a: x, vue: parId.get(x.id), depart: parId.get(x.id).debut, finPoste: parId.get(x.id).finPoste ?? Infinity })
              .reduce((m, q) => ((q.finPoste ?? Infinity) >= (m.finPoste ?? Infinity) ? q : m));
            const debut = Math.min(Math.max(r.t, der.depart), der.finPoste ?? Infinity);
            const ligne = { ...base, atelier: der.a.id, debut, fin: null, duree: dureeLavageVol(der.a, r.cie) ?? 0, attente: 0, impossible: true, horsPoste: true };
            journal.push(ligne); der.vue.lots.push(ligne);
            continue;
          }
          const duree = (dureeLavageVol(p.a, r.cie) ?? 0) / p.vitesse;
          const debutV = Math.max(r.t, p.libre, p.depart);
          const f = finAvecPauses(debutV, duree, p.pauses);
          p.libre = f.fin;
          const ligne = { ...base, atelier: p.a.id, debut: debutV, fin: f.fin, duree, attente: debutV - r.t, arret: f.arret, impossible: false,
            tunnel: p.numero, nomTunnel: p.nom, vitesse: p.vitesse };
          journal.push(ligne); p.vue.lots.push(ligne);
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
        }
        continue;
      }

      if (a.type === 'lavage') {
        // Aucun tunnel ne tourne (personne pour les tenir) : cette plonge ne lave
        // rien, et on le dit (« plonge-arret »). Laver « en un temps infini »
        // faisait planter toute la journée (trouvé par tirage au hasard, 29/09).
        if (!(debitLavage(a) > 0)) continue;
        env.processus(function* () {
          if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
          const prisesL = new Set(); let cumulL = 0;
          for (let garde = 0; garde < 5000; garde++) {
            if (env.maintenant >= finPoste) break;
            if (stock.sale <= 0) {
              // Rien \u00e0 laver : on attend le prochain retour, ou la fin du poste.
              const ev = env.evenement('retour'); reveilsSale.push(ev);
              // Un poste sans fin (pauses décochées) n'attend que le retour.
              yield Number.isFinite(finPoste) ? env.unDe([ev, env.delai(Math.max(0, finPoste - env.maintenant))]) : ev;
              continue;
            }
            // On lave tout ce qui est l\u00e0 ; ce qui arrive pendant sera le tour suivant.
            const unites = stock.sale; stock.sale = 0;
            // Ce qui entre au tunnel, dans l'ordre des retours (premier revenu, premier lavé).
            const pris = [];
            for (let pos = 0; pos < unites - 1e-9 && file.arrivees.length;) {
              const a0 = file.arrivees[0], u = Math.min(a0.u, unites - pos);
              pris.push({ t: a0.t, u, pos }); pos += u;
              a0.u -= u; if (a0.u <= 1e-9) file.arrivees.shift();
            }
            const duree = unites / debitLavage(a) * 60;
            const t = executerTache({ depart: env.maintenant, duree, cumul: cumulL,
              prises: prisesL, pauses, regime, finPoste });
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
              if (c.u - w > 1e-9) rendus.push({ t: c.t, u: c.u - w });
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

      env.processus(function* () {
        if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
        let horloge = depart;

        for (const lot of a.lots) {
          const ids = classesDuLot(lot);
          if (!ids.length) continue;          // lot en cours de saisie
          const nom = ids.join(' + ');

          // Attendre que TOUS les fournisseurs aient livré TOUTES les classes
          // du lot. C'est ici que les branches food, matériel et armement se
          // rejoignent : on ne choisit pas laquelle, on les attend toutes.
          const attendus = [];
          for (const id of ids) {
            for (const amont of amontsDe(a.service, id)) attendus.push(livraison(amont, id));
          }
          const debutAttente = env.maintenant;
          if (attendus.length) yield env.tousDe(attendus);
          // Une boutique fermée : on attend qu'elle ouvre.
          if (boutiques.size) {
            const ouvert = servi(ids.flatMap(id => amontsDe(a.service, id)), env.maintenant);
            if (ouvert > env.maintenant && Number.isFinite(ouvert)) yield env.delai(ouvert - env.maintenant);
          }
          let attente = env.maintenant - debutAttente;
          horloge = Math.max(horloge, env.maintenant);
          if (env.maintenant < horloge) yield env.delai(horloge - env.maintenant);

          // Contenu de travail du lot.
          const lots = ids.map(id => parClasse.get(id)).filter(Boolean);
          let duree, detail;
          if (a.type === 'robot') {
            // Chaque commande à son débit : ses plateaux ÷ son débit.
            const plateaux = lots.reduce((n, c) => n + c.pax, 0);
            const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
            const heures = lots.reduce((n, c) => n + c.pax / Math.max(1e-9, debitRobot(a, c.id)), 0);
            duree = a.personnes >= mini ? heures * 60 : Infinity;
            detail = { plateaux, debit: plateaux && heures ? Math.round(plateaux / heures) : a.debit };
          } else {
            // Chaque ligne ne compte que ses classes : dans une case « TX BC puis
            // TX PC », TX BC sort après ses seules minutes, sans attendre TX PC.
            const hommeMinutes = sansMinutes(a) ? 0 : lots.reduce((n, c) => n + travailDans(a, c, bareme), 0);
            const f = fusionDe(a);
            if (sansMinutes(a)) {
              // Effectif constant : ni minutes par vol, ni durée. La commande passe
              // dans ses heures de présence (06/10).
              duree = 0;
              detail = { hommeMinutes: 0, constant: true };
            } else if (f) {
              // L'étape d'avant, faite à la chaîne par la même case.
              // Seules les commandes dont elle fait vraiment l'étape d'avant : une
              // commande qu'une case de la Prépa fait encore n'est pas comptée deux fois.
              const avant = lots.filter(c => fusionPar.get(cle(f, c.id)) === a.service).reduce((n, c) => n + travailClasse(f, c, bareme), 0);
              duree = dureeFusion(avant, hommeMinutes, a.personnes) / rendement;
              detail = { hommeMinutes: hommeMinutes + avant, fusion: f, minutesFusion: avant, minutesIci: hommeMinutes };
            } else {
              duree = hommeMinutes / a.personnes / rendement;
              detail = { hommeMinutes };
            }
          }
          if (!Number.isFinite(duree)) {
            journal.push({ atelier: a.id, service: a.service, nom, classes: ids, debut: env.maintenant,
              fin: null, duree: null, attente, arret: 0, impossible: true, ...detail });
            vue.lots.push(journal[journal.length - 1]);
            return;   // rien ne sortira de cet atelier : inutile d'enchaîner
          }

          // Le matériel propre : un lot ne part pas sans ce qu'il emporte.
          // C'est ici que la boucle des retours touche la production.
          let attenteMat = 0;
          if (mat.actif && a.materiel === 'consomme') {
            const besoin = besoinMateriel(lots, mat);
            attenteMat = yield* prendreMateriel(besoin,
              { atelier: a.id, service: a.service, nom, classes: ids });
            horloge = Math.max(horloge, env.maintenant);
          }

          // Un robot attend que SA LIGNE soit libre : l'autre équipe peut y être.
          const k = a.type === 'robot' ? cleLigne(a) : null;
          let attenteLigne = 0, tient = false;
          if (k && env.maintenant < finPoste) {
            const t0 = env.maintenant;
            yield* prendreLigne(k); tient = true;
            attenteLigne = env.maintenant - t0;
            if (attenteLigne > 0) detail.attenteLigne = attenteLigne;
          }

          // Le poste s'arrête : ce qui reste ne sera pas fait aujourd'hui.
          if (env.maintenant >= finPoste) {
            if (tient) rendreLigne(k);
            const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
              debut: env.maintenant, fin: null, duree: null, attente: attente + attenteLigne, arret: 0,
              impossible: true, horsPoste: true, ...detail };
            journal.push(ligne); vue.lots.push(ligne);
            return;
          }

          const t = executerTache({ depart: env.maintenant, duree, cumul, prises, pauses, regime, finPoste });
          const debutLot = env.maintenant;
          yield env.delai(t.fin - env.maintenant);
          if (tient) rendreLigne(k);
          cumul = t.cumul;
          const { arret } = t;
          attente += attenteLigne;

          if (t.tronque) {
            const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
              debut: debutLot, fin: null, duree, attente, arret,
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

          const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
            debut: debutLot, fin: env.maintenant, duree, attente, attenteMateriel: attenteMat,
            arret, impossible: false, ...detail };
          journal.push(ligne); vue.lots.push(ligne);
          vue.travail += duree; vue.attente += attente; vue.arret += arret;
          vue.fin = env.maintenant;
          horloge = env.maintenant;
        }
      }, a.nom);
    }

    env.executer();

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
    for (const a of handlings) {
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
      finDe
    };
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
    const tunnels = lavages.reduce((n, a) => n + (Array.isArray(a.tunnels) && a.tunnels.length ? tunnelsQuiTournent(a).tournent.length : (a.personnes > 0 ? 1 : 0)), 0);
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
    classesDeVols, classesCategories, compagniesParService, declarerCategories, volsDesClasses, compteDuJour, appliquerConditions, dureeHandling, compagniesDe, AVANCE_HANDLING, BAREME_DEMO, RENDEMENT_DEMO, travailClasse, travailDans, dureeFusion, minutesVolAppui,
    minutesDuPoste, effectifPour, PLAFOND_EFFECTIF,
    PAX_TYPE, TOUTES, cleBareme, normaliserBareme, minutesParVol, versHeures, versMinutes, heuresFr,
    arcsDuParcours, servicesDuParcours, routesDesClasses,
    fournisseurs, cycles, validerAteliers, debitLavage, tunnelsQuiTournent, NOM_CABINE,
    pausesDe, fusionnerPauses, arretsDeLigne, finAvecPauses, vaguesDe, disponibleDes, debitRobot, ouvertureDe, prochaineOuverture,
    categorieVol, chauffeursDe, creneauxDe, chauffeursPresents, dureeLavageVol, trajetHandling, debutTrajet, volsParCamionDe, vitesseTunnel,
    UNITES_DEFAUT, unitesDe, retoursDeVols, besoinMateriel, sourceRetours, SOURCES_RETOURS,
    simuler, niveauA, niveauLineaire, dureeLisible
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
