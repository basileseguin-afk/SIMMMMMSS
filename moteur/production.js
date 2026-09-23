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
    const j = Math.floor(t / MINUTES_PAR_JOUR), reste = t - j * MINUTES_PAR_JOUR;
    const h = String(Math.floor(reste / 60)).padStart(2, '0');
    const m = String(Math.round(reste % 60)).padStart(2, '0');
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
  /** « AF/BC » en toutes lettres : « AF · Business ». */
  const libelleClasse = id => {
    const i = String(id).lastIndexOf('/');
    if (i < 0) return String(id);
    const cab = String(id).slice(i + 1);
    return String(id).slice(0, i) + ' · ' + (NOM_CABINE[cab] || cab);
  };
  /** Un texte où chaque « AF/BC » est écrit en clair. */
  const enClair = texte => String(texte ?? '').replace(/[A-Z0-9]{1,40}\/(BC|PC|YC|CREW|SPML)\b/g, libelleClasse);

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
    if (!table) return null;
    const propre = table[cleBareme(classe.cie, classe.cabine)];
    if (Number.isFinite(propre)) return propre;
    const commune = table[cleBareme(TOUTES, classe.cabine)];
    return Number.isFinite(commune) ? commune : null;
  }

  /** Rendement : part du temps de présence réellement produite. 1 = idéal. */
  const RENDEMENT_DEMO = 1;

  /** Homme-minutes d'une classe dans un service : minutes par vol × vols. */
  function travailClasse(service, classe, bareme) {
    const b = bareme || BAREME_DEMO;
    const m = minutesParVol(b[service], classe);
    return (m || 0) * ((classe.vols && classe.vols.length) || 0);
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
    }
    return out;
  }

  /* ======================================================================
   *  5. ATELIERS — validation
   * ====================================================================*/

  /*
   * Quatre natures d'atelier, et quatre seulement.
   *
   *   manuel  — une équipe, un barème d'homme-minutes
   *   robot   — une machine, un débit
   *   lavage  — la plonge : son travail vient des retours, pas d'une liste
   *   dispo   — une mise à disposition : magasin, appros…
   *
   * Le dernier ne fabrique rien. Un service qui se contente de **sortir du
   * matériel ou des matières premières** ne consomme ni homme-minutes ni
   * temps de production : il a préparé à l'avance, ou il sert dans l'instant.
   * Lui demander un effectif et une durée serait inventer du travail.
   */
  const TYPES = ['manuel', 'robot', 'lavage', 'dispo'];

  /** Heure à partir de laquelle une mise à disposition sert, en minutes. */
  function disponibleDes(atelier) {
    if (atelier.permanent !== false) return -Infinity;   // toujours servi
    return minutes(atelier.debut) + (atelier.jour || 0) * MINUTES_PAR_JOUR;
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
    const anomalies = [], ids = new Set();

    if (!Array.isArray(ateliers)) return [{ code: 'liste', message: 'Liste d’ateliers attendue.' }];

    for (const a of ateliers) {
      const ou = (a && a.nom) || (a && a.id) || 'atelier sans nom';
      const dire = (code, message) => anomalies.push({ code, atelier: a && a.id, message: ou + ' : ' + message });

      if (!a || typeof a !== 'object') { anomalies.push({ code: 'atelier', message: 'Atelier invalide.' }); continue; }
      if (typeof a.id !== 'string' || !a.id) dire('id', 'identifiant manquant.');
      else if (ids.has(a.id)) dire('id', 'identifiant en double.'); else ids.add(a.id);
      if (typeof a.nom !== 'string' || !a.nom.trim()) dire('nom', 'nommez-le : c’est ce qui le rend lisible.');
      if (services.size && !services.has(a.service)) dire('service', 'service inconnu « ' + a.service + ' ».');
      if (a.type !== undefined && !TYPES.includes(a.type)) dire('type', 'type inconnu « ' + a.type + ' ».');

      const robot = a.type === 'robot', lavage = a.type === 'lavage', dispo = a.type === 'dispo';
      // Une mise à disposition permanente n'a pas d'heure : lui en réclamer une
      // serait inventer une contrainte qu'elle n'a pas.
      if (!(dispo && a.permanent !== false)) {
        try { minutes(a.debut); } catch (e) { dire('debut', e.message); }
      }
      const gens = a.personnes;
      // Une mise à disposition n'a pas d'effectif : elle ne fabrique pas.
      if (dispo) { /* ni personnes, ni lots, ni barème */ }
      else if (!Number.isInteger(gens) || gens < 0) dire('personnes', 'nombre de personnes entier attendu.');
      else if (!robot && gens === 0) dire('personnes', 'sans personne, rien n’est fabriqué.');

      if (lavage) {
        const tunnels = Array.isArray(a.tunnels) ? a.tunnels : null;
        if (tunnels && tunnels.some(t => !(+t.debit > 0)))
          dire('tunnel', 'chaque tunnel attend un débit, en unités par heure.');
        // Un tunnel sans personne pour le tenir ne tourne pas. Additionner
        // les débits sans se demander s'il y a les gens donnerait une plonge
        // deux fois trop rapide, et on ne saurait pas pourquoi.
        const etat = tunnelsQuiTournent(a);
        if (etat.sansPersonne.length) {
          dire('tunnel-personnes', etat.sansPersonne.length + ' tunnel(s) sans personne pour les tenir — '
            + etat.sansPersonne.map(t => t.nom || 'sans nom').join(', ')
            + '. Ils ne tournent pas. Ajoutez du monde ou arrêtez-les.');
        }
        if (!(etat.debit > 0)) dire('debit', tunnels && tunnels.length
          ? 'aucun tunnel ne tourne : rien n’est lavé.'
          : 'débit attendu, en unités de matériel par heure.');
      }
      if (robot) {
        if (!(a.debit > 0)) dire('debit', 'débit attendu, en plateaux par heure.');
        const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
        if (!Number.isInteger(mini) || mini < 0) dire('personnesMin', 'effectif minimum entier attendu.');
        else if (Number.isInteger(gens) && gens < mini)
          dire('personnesMin', gens + ' personne(s) pour un minimum de ' + mini + ' : le robot ne tourne pas.');
      }

      for (const p of (a.pauses || [])) {
        try {
          if (minutes(p.de) >= minutes(p.a)) dire('pause', 'une pause doit finir après avoir commencé.');
        } catch (e) { dire('pause', e.message); }
      }

      // Un atelier sans lot, ou un lot encore vide, c'est une saisie en cours :
      // on le signale sans empêcher le reste de la journée d'être calculé. Un
      // atelier de lavage, lui, n'a pas de lots : son travail vient des retours.
      if (lavage || dispo) { /* rien à exiger : ni l'un ni l'autre ne suit une liste */ }
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
        message: (a.nom || a.id) + ' : « ' + a.service + ' » est déjà une mise à disposition. '
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
              message: id + ' est fabriqué deux fois dans « ' + a.service + ' ». Un service, une classe, un atelier.' });
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

  /** 15 min après 3 h de travail, 30 min après 6 h, 8 h 15 de présence. */
  const REGIME_DEFAUT = {
    actif: true,
    seuils: [{ apres: 180, duree: 15 }, { apres: 360, duree: 30 }],
    presence: 495
  };

  /** Travail effectif d'un poste : la présence moins les pauses qu'il contient. */
  function travailDuPoste(regime) {
    const r = normaliserRegime(regime);
    if (!r.actif) return Infinity;
    return r.presence - r.seuils.reduce((n, s) => n + s.duree, 0);
  }

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

  /** Ce que les vols retour ramènent de sale, et quand. */
  function retoursDeVols(vols, materiel) {
    const m = { ...MATERIEL_DEFAUT, ...(materiel || {}) };
    const unites = unitesDe(materiel);
    const out = [];
    for (const v of vols || []) {
      if (v.sens !== 'RET') continue;
      const arrivee = v.sta === undefined ? v.heure : v.sta;
      if (!Number.isFinite(arrivee)) continue;
      const n = unitesDuVol(v, unites);
      if (n <= 0) continue;
      out.push({ vol: v.id, t: arrivee + m.delaiRetour, unites: n });
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
    const classes = opts.classes || classesDeVols(opts.vols, { delaiChargement: opts.delaiChargement });
    const parClasse = new Map(classes.map(c => [c.id, c]));
    const ateliers = (opts.ateliers || []).map(a => ({ ...a, type: a.type || 'manuel' }));

    const services = new Set(ateliers.map(a => a.service));
    const anomalies = validerAteliers(ateliers, { services: opts.services || [...services], classes });
    const fourn = fournisseurs(opts.liaisons);
    const routes = routesDesClasses(classes, opts);
    const nom = id => (opts.noms && opts.noms[id]) || id;

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
      if (a.type === 'robot') continue;
      if (!bareme[a.service]) anomalies.push({ code: 'bareme', atelier: a.id,
        message: a.nom + ' : aucun barème pour « ' + nom(a.service) + ' », sa durée est nulle tant qu’il n’est pas renseigné.' });
    }

    // Une compagnie × classe fabriquée dans un service qui n'a de minutes ni
    // pour elle ni pour sa classe y travaillerait en temps nul. On la nomme :
    // c'est le cas courant d'un service chiffré compagnie par compagnie.
    for (const a of ateliers) {
      if (a.type !== 'manuel' || !bareme[a.service]) continue;
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

    // Ce qui n'empêche pas de jouer la journée ne doit pas l'empêcher.
    const NON_BLOQUANTES = new Set(['doublon', 'bareme', 'lots', 'lot-vide', 'poste', 'materiel', 'dispo',
      'tunnel-personnes', 'parcours-trou', 'hors-parcours', 'bareme-classe']);
    const bloquant = anomalies.some(a => !NON_BLOQUANTES.has(a.code));
    if (bloquant) return { ok: false, anomalies, classes, lots: [], ateliers: [] };

    // Une mise à disposition permanente n'a pas d'heure : elle ne doit pas
    // tirer le début de la journée en arrière.
    const debuts = ateliers.filter(a => a.type !== 'dispo' || a.permanent === false)
      .map(a => minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR);
    const env = new Environnement(debuts.length ? Math.min(...debuts) : 0);

    // Livraisons : un événement par (service, classe), créé à la demande.
    const livraisons = new Map();
    const cle = (service, classe) => service + '|' + classe;
    const livraison = (service, classe) => {
      const k = cle(service, classe);
      let ev = livraisons.get(k);
      if (!ev) { ev = env.evenement('livre ' + k); livraisons.set(k, ev); }
      return ev;
    };

    // Un service ne produit une classe que si un atelier la lui a confiée :
    // sinon il ne fait pas partie du parcours de cette classe et n'est pas
    // attendu. C'est ce qui permet à un parcours d'être différent par classe.
    const produit = new Set();
    for (const a of ateliers) for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) produit.add(cle(a.service, id));
    // Une mise à disposition sert TOUT : on ne lui fait pas énumérer les
    // classes. Le magasin sort du matériel pour qui en demande.
    for (const a of ateliers) if (a.type === 'dispo') for (const c of classes) produit.add(cle(a.service, c.id));
    // Une plonge ne fabrique pas de classe : elle lave ce qui revient, et la
    // boucle du matériel porte cette contrainte. Sur un parcours, elle est une
    // étape franchie, jamais un trou.
    const lavages = new Set(ateliers.filter(a => a.type === 'lavage').map(a => a.service));

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
          if (produit.has(cle(amont, id))) out.add(amont);
          else remonter(amont);
        }
      };
      remonter(service);
      return [...out];
    }

    // Ce que les parcours disent et que les ateliers ne font pas — dans les
    // deux sens. On le nomme sans bloquer : c'est une saisie en cours.
    if (routes.size) {
      const trous = new Map();          // service → classes non travaillées
      for (const [id] of producteurs) {
        const route = routes.get(id); if (!route) continue;
        for (const s of route.services) {
          if (produit.has(cle(s, id)) || lavages.has(s)) continue;
          if (!trous.has(s)) trous.set(s, []);
          trous.get(s).push(id);
        }
      }
      for (const [s, ids] of trous) {
        anomalies.push({ code: 'parcours-trou', service: s, classes: ids,
          message: '« ' + nom(s) + ' » est sur le parcours de ' + ids.length + ' classe(s) sans qu’aucun atelier ne l’y travaille ('
            + ids.slice(0, 4).join(', ') + (ids.length > 4 ? '…' : '') + ') : l’étape est sautée.' });
      }
      for (const a of ateliers) {
        const hors = [];
        for (const lot of (a.lots || [])) for (const id of classesDuLot(lot)) {
          const route = routes.get(id);
          if (route && !route.services.has(a.service) && !hors.includes(id)) hors.push(id);
        }
        if (hors.length) anomalies.push({ code: 'hors-parcours', atelier: a.id, classes: hors,
          message: (a.nom || a.id) + ' : ' + hors.slice(0, 4).join(', ') + (hors.length > 4 ? '…' : '')
            + ' ne passe(nt) pas par « ' + nom(a.service) + ' » selon leur parcours. Le travail est compté, mais personne ne l’attend.' });
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
          stock.sale += r.unites; stock.entrees += r.unites;
          while (reveilsSale.length) { const ev = reveilsSale.shift(); if (!ev.declenche) ev.reussir(env.maintenant); }
        }, 'retour ' + r.vol);
      }
    }

    const journal = [];   // une ligne par lot : ce que l'on affichera
    const suivi = ateliers.map(a => ({ id: a.id, nom: a.nom, service: a.service, type: a.type,
      debut: a.type === 'dispo' && a.permanent !== false
        ? env.maintenant : minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR,
      personnes: a.personnes,
      fin: null, travail: 0, attente: 0, arret: 0, lots: [] }));
    const parId = new Map(suivi.map(s => [s.id, s]));

    for (const a of ateliers) {
      const vue = parId.get(a.id);
      const pauses = pausesDe(a);
      const depart = vue.debut;
      const regime = normaliserRegime(a.regime, opts.regime);
      const finPoste = regime.actif ? depart + regime.presence : Infinity;
      const prises = new Set();   // pauses de régime déjà prises dans ce poste
      let cumul = 0;              // travail effectif depuis le début du poste
      vue.finPoste = Number.isFinite(finPoste) ? finPoste : null;

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
          for (const id of ids) {
            const ev = livraison(a.service, id);
            if (!ev.declenche) ev.reussir(env.maintenant);
          }
          const ligne = { atelier: a.id, service: a.service, nom: 'mise à disposition',
            classes: ids, debut: env.maintenant, fin: env.maintenant, duree: 0,
            attente: 0, arret: 0, impossible: false, dispo: true };
          journal.push(ligne); vue.lots.push(ligne); vue.fin = env.maintenant;
        }, a.nom);
        continue;
      }

      if (a.type === 'lavage') {
        env.processus(function* () {
          if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
          const prisesL = new Set(); let cumulL = 0;
          for (let garde = 0; garde < 5000; garde++) {
            if (env.maintenant >= finPoste) break;
            if (stock.sale <= 0) {
              // Rien \u00e0 laver : on attend le prochain retour, ou la fin du poste.
              const ev = env.evenement('retour'); reveilsSale.push(ev);
              yield env.unDe([ev, env.delai(Math.max(0, finPoste - env.maintenant))]);
              continue;
            }
            // On lave tout ce qui est l\u00e0 ; ce qui arrive pendant sera le tour suivant.
            const unites = stock.sale; stock.sale = 0;
            const duree = unites / debitLavage(a) * 60;
            const t = executerTache({ depart: env.maintenant, duree, cumul: cumulL,
              prises: prisesL, pauses, regime, finPoste });
            const debutLot = env.maintenant;
            yield env.delai(t.fin - env.maintenant);
            cumulL = t.cumul;
            const lavees = t.tronque ? unites * (t.fait / duree) : unites;
            stock.sale += unites - lavees;      // ce qui n'a pas \u00e9t\u00e9 lav\u00e9 reste sale
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
          const attente = env.maintenant - debutAttente;
          horloge = Math.max(horloge, env.maintenant);
          if (env.maintenant < horloge) yield env.delai(horloge - env.maintenant);

          // Contenu de travail du lot.
          const lots = ids.map(id => parClasse.get(id)).filter(Boolean);
          let duree, detail;
          if (a.type === 'robot') {
            const plateaux = lots.reduce((n, c) => n + c.pax, 0);
            const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
            duree = a.personnes >= mini ? (plateaux / a.debit) * 60 : Infinity;
            detail = { plateaux, debit: a.debit };
          } else {
            const hommeMinutes = lots.reduce((n, c) => n + travailClasse(a.service, c, bareme), 0);
            duree = hommeMinutes / a.personnes / rendement;
            detail = { hommeMinutes };
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

          // Le poste s'arrête : ce qui reste ne sera pas fait aujourd'hui.
          if (env.maintenant >= finPoste) {
            const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
              debut: env.maintenant, fin: null, duree: null, attente, arret: 0,
              impossible: true, horsPoste: true, ...detail };
            journal.push(ligne); vue.lots.push(ligne);
            return;
          }

          const t = executerTache({ depart: env.maintenant, duree, cumul, prises, pauses, regime, finPoste });
          const debutLot = env.maintenant;
          yield env.delai(t.fin - env.maintenant);
          cumul = t.cumul;
          const { arret } = t;

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
          for (const id of ids) {
            const ev = livraison(a.service, id);
            if (!ev.declenche) ev.reussir(env.maintenant);
          }

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

    // Un lot encore en attente de matériel à la fin de la journée ne produit
    // aucune ligne de journal : son processus est resté suspendu. Sans cette
    // trace, sa classe paraîtrait fabriquée par ses autres étapes.
    for (const a of attenteurs) {
      const ligne = { atelier: a.atelier, service: a.service, nom: a.nom, classes: a.classes || [],
        debut: a.depuis, fin: null, duree: null, attente: 0, arret: 0,
        impossible: true, sansMateriel: true, besoin: a.besoin };
      journal.push(ligne);
      const vue = parId.get(a.atelier); if (vue) vue.lots.push(ligne);
      anomalies.push({ code: 'materiel', atelier: a.atelier,
        message: a.nom + ' dans « ' + nom(a.service) + ' » : ' + Math.round(a.besoin)
          + ' unités de matériel propre manquent et ne sont jamais arrivées.' });
    }

    // Un lot que le poste n'a pas pu finir n'est pas une erreur de saisie :
    // c'est le résultat, et le plus utile. On le nomme sans bloquer.
    for (const l of journal.filter(l => l.horsPoste)) {
      anomalies.push({ code: 'poste', atelier: l.atelier,
        message: l.nom + ' dans « ' + nom(l.service) + ' » : le poste se termine avant la fin. '
          + 'Commencez plus tôt, ajoutez du monde, ou confiez-le à une autre équipe.' });
    }

    /* ---- ce qu'il faut en retenir ------------------------------------ */

    const finDe = (service, id) => {
      const l = journal.find(x => x.service === service && x.classes.includes(id));
      return l ? l.fin : null;
    };
    const derniers = {};   // dernier service du parcours de chaque classe
    for (const c of classes) {
      const etapes = journal.filter(l => l.classes.includes(c.id));
      // Une mise à disposition figure au parcours mais ne fabrique rien : si
      // c'est la seule étape d'une classe, cette classe n'est pas faite. Sans
      // cette distinction, un magasin ouvert suffirait à dire « 100 % à l'heure ».
      const reels = etapes.filter(l => !l.dispo);
      const fin = reels.length && reels.every(l => l.fin != null)
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

    const suivies = Object.values(derniers).filter(c => !c.absente);
    const aHeure = suivies.filter(c => c.aHeure).length;
    const retards = suivies.filter(c => c.retard != null).map(c => c.retard);

    return {
      ok: true,
      anomalies,
      classes,
      ateliers: suivi,
      lots: journal.sort((a, b) => a.debut - b.debut),
      parClasse: derniers,
      indicateurs: {
        classesSuivies: suivies.length,
        classesAbsentes: Object.values(derniers).filter(c => c.absente).length,
        aHeure,
        partAHeure: suivies.length ? Math.round(aHeure / suivies.length * 100) : null,
        retardMoyen: retards.length ? retards.reduce((a, b) => a + b, 0) / retards.length : null,
        retardMax: retards.length ? Math.max(...retards) : null,
        finDerniere: journal.length ? Math.max(...journal.map(l => l.fin == null ? -Infinity : l.fin)) : null,
        attenteTotale: journal.reduce((n, l) => n + l.attente, 0),
        attenteMateriel: journal.reduce((n, l) => n + (l.attenteMateriel || 0), 0),
        hommeHeures: journal.reduce((n, l) => n + (l.hommeMinutes || 0), 0) / 60
      },
      materiel: mat.actif ? {
        unites: unitesDe(mat), stockInitial: mat.stockInitial,
        entrees: stock.entrees, lavees: Math.round(stock.lavees), consommees: stock.consommees,
        restePropre: Math.round(stock.propre), resteSale: Math.round(stock.sale),
        minPropre: Math.round(stock.minPropre), attente: stock.attente,
        enAttente: attenteurs.length
      } : null,
      finDe
    };
  }

  /* ======================================================================
   *  8. EXPORT
   * ====================================================================*/

  const api = {
    MINUTES_PAR_JOUR, CABINES, TYPES,
    minutes, hhmm, idClasse, libelleClasse, enClair,
    REGIME_DEFAUT, normaliserRegime, travailDuPoste, executerTache,
    classesDeVols, BAREME_DEMO, RENDEMENT_DEMO, travailClasse,
    PAX_TYPE, TOUTES, cleBareme, normaliserBareme, minutesParVol,
    arcsDuParcours, servicesDuParcours, routesDesClasses,
    fournisseurs, cycles, validerAteliers, debitLavage, tunnelsQuiTournent, NOM_CABINE,
    pausesDe, finAvecPauses,
    UNITES_DEFAUT, unitesDe, retoursDeVols, besoinMateriel,
    simuler
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
