/* ==========================================================================
 *  PARCOURS DES COMPAGNIES × CLASSES — le chemin de chaque classe
 *
 *  Toutes les classes ne passent pas par les mêmes services : un plateau
 *  d'économie ne voit ni la cuisine ni la légumerie. Un parcours dit, pour
 *  une classe, par où elle passe. C'est un DIAGRAMME DE NŒUDS : les services
 *  sont les nœuds, un lien « A → B » dit que A livre B. Des chemins partent en
 *  parallèle et se rejoignent là où un nœud reçoit plusieurs liens :
 *
 *      appros → légumerie → cuisine ─┐
 *      plonge → dotation ────────────┼→ montage
 *      magasin ──────────────────────┘
 *
 *  Écrit ainsi : { id, nom, noeuds:[service], liens:[{de, vers}] }. L'ancienne
 *  écriture en branches est relue et convertie.
 *
 *  Chaque classe (BC, YC…) a un parcours par défaut ; une compagnie × classe
 *  peut avoir le sien. Le calcul est dans moteur/production.js ; ce module
 *  valide, propose des parcours types et les fait éditer.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./moteur/production.js') : root.MoteurProduction;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'pc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const texte = (v, max) => String(v ?? '').trim().slice(0, max);

  /** Des branches (chaînes de services) vers un graphe : nœuds et liens. */
  function depuisBranches(branches) {
    const noeuds = [], liens = [], vus = new Set();
    for (const b of branches || []) {
      const etapes = (Array.isArray(b) ? b : (b && b.services) || []).filter(Boolean);
      etapes.forEach((s, i) => {
        if (!noeuds.includes(s)) noeuds.push(s);
        const de = etapes[i - 1];
        if (i && de !== s && !vus.has(de + '>' + s)) { vus.add(de + '>' + s); liens.push({ de, vers: s }); }
      });
    }
    return { noeuds, liens };
  }

  /**
   * La prépa, ajoutée le 24/09, précède le montage. Dans un chemin déjà dessiné,
   * un lien « cuisine → montage » devient « cuisine → prépa → montage », une
   * fois pour toutes : le chemin garde la trace (`prepa`) pour ne pas la
   * réinsérer si on l'a retirée. Modifie `etat` ; renvoie le nombre de chemins touchés.
   */
  function insererPrepa(etat) {
    let n = 0;
    for (const p of (etat && etat.parcours) || []) {
      if (p.prepa || !Array.isArray(p.liens)) continue;
      p.prepa = true;
      if ((p.noeuds || []).includes('preparation')) continue;
      const i = p.liens.findIndex(l => l.de === 'cuisine' && l.vers === 'prepa');
      if (i < 0) continue;
      p.liens.splice(i, 1, { de: 'cuisine', vers: 'preparation' }, { de: 'preparation', vers: 'prepa' });
      const j = p.noeuds.indexOf('prepa');
      p.noeuds.splice(j < 0 ? p.noeuds.length : j, 0, 'preparation');
      n++;
    }
    return n;
  }

  /** Relier `de` à `vers` fermerait-il une boucle ? Un repas n'y avancerait jamais. */
  function creeBoucle(p, de, vers) {
    if (de === vers) return true;
    const arcs = P.arcsDuParcours(p), vus = new Set(), pile = [vers];
    while (pile.length) {
      const s = pile.pop();
      if (s === de) return true;
      if (vus.has(s)) continue; vus.add(s);
      for (const a of arcs) if (a.from === s) pile.push(a.to);
    }
    return false;
  }

  /**
   * Les parcours types de l'unité, d'après les services du plan de base.
   * « Montage » est le service `prepa`. Rien n'empêche d'insérer une
   * préparation distincte : c'est une annexe à tracer, puis une étape à ajouter.
   */
  function parcoursTypes(servicesConnus) {
    const connus = servicesConnus ? new Set(servicesConnus) : null;
    const garder = liste => (connus ? liste.filter(s => connus.has(s)) : liste);
    const branche = (nom, services) => ({ nom, services: garder(services) });
    // Écrits en chaînes, lus en graphe : un service absent du plan est enjambé.
    const nettoyer = ({ branches, ...p }) => ({ ...p, ...depuisBranches(branches.filter(b => b.services.length >= 2)), prepa: true });
    const parcours = [
      nettoyer({ id: 'complet', nom: 'Complet', branches: [
        branche('Agro', ['appros', 'decontam', 'cuisine', 'preparation', 'prepa']),
        branche('Matériel', ['plonge', 'dotation', 'prepa']),
        branche('Magasin', ['magasin', 'prepa'])
      ] }),
      nettoyer({ id: 'sans-cuisine', nom: 'Sans cuisine', branches: [
        branche('Agro', ['appros', 'preparation', 'prepa']),
        branche('Matériel', ['plonge', 'dotation', 'prepa']),
        branche('Magasin', ['magasin', 'prepa'])
      ] })
    ];
    return {
      parcours,
      parcoursCabine: { BC: 'complet', PC: 'complet', YC: 'sans-cuisine', CREW: 'complet', SPML: 'complet' },
      parcoursClasse: {}
    };
  }

  /**
   * Relit des parcours enregistrés. `undefined` — une sauvegarde d'avant les
   * parcours — reçoit les parcours types ; une liste vide reste vide : c'est
   * un choix, celui de s'en remettre au graphe des flux.
   *
   * @returns {{ parcours, parcoursCabine, parcoursClasse, crees:boolean }}
   */
  function validerParcours(brut, servicesConnus) {
    const b = brut || {};
    if (b.parcours === undefined) return { ...parcoursTypes(servicesConnus), crees: true };
    if (!Array.isArray(b.parcours)) throw new Error('Liste de parcours attendue.');
    // Un chemin par commande : une unité en porte des centaines (avec de la marge).
    if (b.parcours.length > 2000) throw new Error('Maximum 2000 chemins.');
    const ids = new Set();
    const parcours = b.parcours.map(p => {
      if (!p || typeof p !== 'object') throw new Error('Parcours invalide.');
      const id = typeof p.id === 'string' && p.id ? p.id.slice(0, 80) : uid();
      if (ids.has(id)) throw new Error('Identifiant de parcours en double : ' + id);
      ids.add(id);
      // Un parcours d'avant les diagrammes arrive en branches : on le convertit.
      const g = Array.isArray(p.liens) || Array.isArray(p.noeuds) ? p
        : depuisBranches((Array.isArray(p.branches) ? p.branches : []).slice(0, 20)
            .map(br => (Array.isArray(br) ? br : (br && br.services) || []).map(s => texte(s, 160)).slice(0, 30)));
      const noeuds = [], liens = [], vus = new Set();
      const noeud = s => { s = texte(s, 160); if (s && !noeuds.includes(s) && noeuds.length < 60) noeuds.push(s); return noeuds.includes(s) ? s : null; };
      for (const s of (Array.isArray(g.noeuds) ? g.noeuds : [])) noeud(s);
      for (const l of (Array.isArray(g.liens) ? g.liens : []).slice(0, 300)) {
        const de = noeud(l && (l.de ?? l[0])), vers = noeud(l && (l.vers ?? l[1]));
        if (!de || !vers || de === vers || vus.has(de + '>' + vers)) continue;
        vus.add(de + '>' + vers); liens.push({ de, vers });
      }
      return { id, nom: texte(p.nom, 80) || 'Parcours', noeuds, liens, ...(p.prepa ? { prepa: true } : {}), ...(p.cases ? { cases: true } : {}) };
    });
    const parcoursCabine = {};
    for (const c of P.CABINES) {
      const v = (b.parcoursCabine || {})[c];
      if (typeof v === 'string' && ids.has(v)) parcoursCabine[c] = v;
    }
    const parcoursClasse = {};
    for (const [k, v] of Object.entries(b.parcoursClasse || {}).slice(0, 2000)) {
      if (typeof v === 'string' && ids.has(v) && /^[^/]{1,40}\/[A-Z]+$/.test(k)) parcoursClasse[k] = v;
    }
    return { parcours, parcoursCabine, parcoursClasse, crees: false };
  }

  /** Le parcours d'une classe : le sien, sinon celui de sa cabine. */
  function parcoursDe(etat, classe) {
    const id = (etat.parcoursClasse || {})[classe.id] || (etat.parcoursCabine || {})[classe.cabine];
    return (etat.parcours || []).find(p => p.id === id) || null;
  }



  /* ======================================================================
   *  PARCOURS × ÉQUIPES — le flux et le temps, au même endroit
   *
   *  Un parcours dit PAR OÙ passe une classe ; un atelier dit QUI la
   *  travaille, QUAND et À COMBIEN. Les deux se complètent exactement : à
   *  chaque étape d'un parcours, il faut une équipe pour chaque classe. Les
   *  fonctions ci-dessous lisent cette correspondance et la complètent.
   * ====================================================================*/

  const fabrique = a => a.type === 'manuel' || a.type === 'robot';

  /** Les services d'un parcours dans l'ordre du flux : sources d'abord, jonction à la fin. */
  function etapesOrdonnees(p) {
    const arcs = P.arcsDuParcours(p), services = P.servicesDuParcours(p);
    const entrants = new Map(services.map(s => [s, 0]));
    for (const a of arcs) entrants.set(a.to, (entrants.get(a.to) || 0) + 1);
    const out = [], file = services.filter(s => !entrants.get(s));
    while (file.length) {
      const s = file.shift(); out.push(s);
      for (const a of arcs) if (a.from === s) {
        entrants.set(a.to, entrants.get(a.to) - 1);
        if (!entrants.get(a.to)) file.push(a.to);
      }
    }
    // Un parcours qui boucle garde ses services restants dans l'ordre de saisie.
    for (const s of services) if (!out.includes(s)) out.push(s);
    return out;
  }

  /**
   * Pour chaque parcours : ses classes, et à chaque étape qui les travaille.
   *
   * @returns [{ parcours, classes:[id], etapes:[{ service, equipes:[id],
   *   fabriquent:[id], lavage, dispo, classes:[{id, atelier}], manquantes:[id] }] }]
   */
  function couverture(etat, classes) {
    const routes = P.routesDesClasses(classes, etat);
    const ateliers = etat.ateliers || [];
    return (etat.parcours || []).map(p => {
      const cls = classes.filter(c => { const r = routes.get(c.id); return r && r.parcours.id === p.id; });
      const etapes = etapesOrdonnees(p).map(service => {
        const equipes = ateliers.filter(a => a.service === service);
        const fab = equipes.filter(fabrique);
        const lavage = equipes.some(a => a.type === 'lavage'), dispo = equipes.some(a => a.type === 'dispo');
        const parClasse = cls.map(c => ({ id: c.id,
          atelier: (fab.find(a => (a.lots || []).some(l => l.includes(c.id))) || {}).id || null }));
        // Une plonge lave les retours, une mise à disposition sert tout le
        // monde : ni l'une ni l'autre n'a de classe à se voir confier.
        const manquantes = lavage || dispo ? [] : parClasse.filter(x => !x.atelier).map(x => x.id);
        return { service, equipes: equipes.map(a => a.id), fabriquent: fab.map(a => a.id),
          lavage, dispo, classes: parClasse, manquantes };
      });
      return { parcours: p, classes: cls.map(c => c.id), etapes };
    });
  }

  const parEcheance = (ids, classes) => {
    const ech = new Map(classes.map(c => [c.id, c.echeance]));
    return ids.slice().sort((x, y) => (ech.get(x) ?? Infinity) - (ech.get(y) ?? Infinity) || x.localeCompare(y));
  };

  /**
   * Confie des classes à une équipe : une fabrication par classe, ajoutées à
   * la fin de sa liste dans l'ordre des échéances. Celles qu'elle fait déjà
   * ne sont pas dupliquées. Modifie `etat` ; renvoie le nombre ajouté.
   */
  function confier(etat, atelierId, ids, classes) {
    const a = (etat.ateliers || []).find(x => x.id === atelierId);
    if (!a || !fabrique(a)) throw new Error('Cette équipe ne fabrique pas : une plonge ou une mise à disposition n’a pas de lot.');
    let n = 0;
    for (const id of parEcheance(ids, classes || [])) {
      if (a.lots.some(l => l.includes(id))) continue;
      a.lots.push([id]); n++;
    }
    return n;
  }

  /** Une équipe posée sur une étape, qui fabrique d'emblée les classes données. */
  function nouvelleEquipe(etat, service, nomService, ids, classes) {
    const n = (etat.ateliers || []).filter(a => a.service === service).length + 1;
    const a = { id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      nom: (nomService || service) + (n > 1 ? ' ' + n : ''), service, type: 'manuel',
      debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: parEcheance(ids, classes || []).map(id => [id]),
      regime: { actif: true } };
    etat.ateliers.push(a);
    return a;
  }

  /**
   * Complète tous les parcours d'un coup : à chaque étape où une seule équipe
   * fabrique, les classes manquantes lui sont confiées. Là où il n'y a
   * personne, ou plusieurs équipes, on ne choisit pas à la place de
   * l'utilisateur : ces étapes sont renvoyées pour qu'il décide.
   */
  function completer(etat, classes) {
    const faits = [], restent = [];
    for (const c of couverture(etat, classes)) for (const e of c.etapes) {
      if (!e.manquantes.length) continue;
      if (e.fabriquent.length === 1) {
        const n = confier(etat, e.fabriquent[0], e.manquantes, classes);
        if (n) faits.push({ service: e.service, atelier: e.fabriquent[0], n });
      } else restent.push({ parcours: c.parcours.id, service: e.service, manquantes: e.manquantes,
        raison: e.fabriquent.length ? 'plusieurs équipes' : 'aucune équipe' });
    }
    return { faits, restent };
  }

  /**
   * Les colonnes du tableau « Qui fabrique quoi » : les services de tous les
   * parcours, dans l'ordre du flux. Les groupes se lisent sur le graphe :
   *
   *   • la JONCTION — un nœud qui reçoit plusieurs liens dans un parcours, et
   *     tout ce qui vient après lui ;
   *   • avant elle, un groupe par nœud de DÉPART (sans lien entrant) : les
   *     services qui en descendent, dans l'ordre.
   *
   * @returns [{ service, groupe }] — `groupe` est le service de départ, ou « Jonction ».
   */
  function colonnes(parcours) {
    const liste = parcours || [];
    const apres = new Set();
    for (const p of liste) {
      const arcs = P.arcsDuParcours(p), entrants = new Map();
      for (const x of arcs) entrants.set(x.to, (entrants.get(x.to) || 0) + 1);
      const pile = [...entrants].filter(([, n]) => n > 1).map(([s]) => s);
      while (pile.length) {
        const s = pile.pop(); if (apres.has(s)) continue; apres.add(s);
        for (const x of arcs) if (x.from === s) pile.push(x.to);
      }
    }
    const union = { noeuds: liste.flatMap(p => P.servicesDuParcours(p)),
      liens: liste.flatMap(p => P.arcsDuParcours(p).map(x => ({ de: x.from, vers: x.to }))) };
    const ordre = etapesOrdonnees(union), arcs = P.arcsDuParcours(union);
    // Le départ d'un service : on remonte ses liens entrants jusqu'à un nœud sans amont.
    const depart = new Map();
    for (const s of ordre) {
      if (apres.has(s)) continue;
      const amont = arcs.find(x => x.to === s && !apres.has(x.from) && depart.has(x.from));
      depart.set(s, amont ? depart.get(amont.from) : s);
    }
    const groupes = [...new Set(ordre.filter(s => !apres.has(s)).map(s => depart.get(s)))];
    return groupes.flatMap(g => ordre.filter(s => !apres.has(s) && depart.get(s) === g).map(s => ({ service: s, groupe: g })))
      .concat(ordre.filter(s => apres.has(s)).map(s => ({ service: s, groupe: 'Jonction' })));
  }

  /**
   * Le tableau « Qui fabrique quoi » : pour chaque compagnie × classe et
   * chaque service, qui la fabrique.
   *
   *   equipe    — une ou plusieurs équipes la fabriquent
   *   libre     — sur son parcours, personne ne la fabrique encore
   *   auto      — une plonge ou une mise à disposition sert tout le monde
   *   hors      — son parcours ne passe pas par là
   *   hors-fait — une équipe la fabrique alors que son parcours n'y passe pas
   *
   * Une classe sans parcours suit le graphe des flux : on n'en sait pas plus
   * que les équipes qui la fabriquent.
   *
   * @returns {{ colonnes:[{service, groupe, fabriquent, auto, libres}],
   *             lignes:[{ classe, parcours, cases:{service:{etat, ateliers}} }] }}
   */
  function tableau(etat, classes) {
    const routes = P.routesDesClasses(classes, etat);
    const parService = new Map();
    for (const a of etat.ateliers || []) {
      if (!parService.has(a.service)) parService.set(a.service, []);
      parService.get(a.service).push(a);
    }
    const cols = colonnes(etat.parcours);
    const lignes = (classes || []).map(c => {
      const r = routes.get(c.id) || null;
      const cases = {};
      for (const { service: s } of cols) {
        const equipes = parService.get(s) || [];
        const font = equipes.filter(a => fabrique(a) && (a.lots || []).some(l => l.includes(c.id))).map(a => a.id);
        const auto = equipes.find(a => !fabrique(a));
        const passe = r ? r.services.has(s) : font.length > 0;
        cases[s] = !passe ? { etat: font.length ? 'hors-fait' : 'hors', ateliers: font }
          : font.length ? { etat: 'equipe', ateliers: font }
          : auto ? { etat: 'auto', ateliers: [auto.id] }
          : { etat: 'libre', ateliers: [] };
      }
      return { classe: c, parcours: r ? r.parcours : null, cases };
    });
    return {
      colonnes: cols.map(col => {
        const equipes = parService.get(col.service) || [];
        return { ...col, fabriquent: equipes.filter(fabrique).map(a => a.id),
          auto: equipes.filter(a => !fabrique(a)).map(a => a.id),
          libres: lignes.filter(l => l.cases[col.service].etat === 'libre').map(l => l.classe.id) };
      }),
      lignes
    };
  }

  /**
   * Choisit l'équipe d'un service pour des classes : elles quittent les autres
   * équipes de ce service et rejoignent celle-ci (en fin de liste, par
   * échéance). Sans équipe, la case se vide. Modifie `etat`.
   */
  function affecter(etat, service, ids, atelierId, classes) {
    const retirer = new Set(ids);
    for (const a of etat.ateliers || []) {
      if (a.service !== service || !fabrique(a) || a.id === atelierId) continue;
      a.lots = (a.lots || []).map(l => l.filter(id => !retirer.has(id))).filter(l => l.length);
    }
    return atelierId ? confier(etat, atelierId, ids, classes) : 0;
  }

  /**
   * Une classe dans le temps, étape par étape dans l'ordre du flux : le lot qui
   * la travaille (début, fin, attente), et pour une étape qui a attendu, celle
   * qui l'a fait attendre — l'amont présent qui a livré le dernier.
   *
   * @returns {{ etapes:[{ service, branche, debut, fin, attente, atelier,
   *   dispo, absent, commun, attendu }], debut, fin }}
   */
  function chronogramme(resultat, parcours, classeId) {
    const lots = (resultat && resultat.lots) || [];
    const arcs = P.arcsDuParcours(parcours);
    // Le même ordre que les colonnes du tableau : branche par branche, puis la jonction.
    // La plonge lave les retours de tous les vols : elle ne tient pas de lot par
    // commande, mais elle n'est pas « sautée » pour autant.
    const lavage = new Set(((resultat && resultat.ateliers) || []).filter(a => a.type === 'lavage').map(a => a.service));
    const etapes = colonnes([parcours]).map(({ service: s, groupe }) => {
      const l = lots.find(x => x.service === s && (x.classes || []).includes(classeId));
      return { service: s, branche: groupe,
        debut: l ? l.debut : null, fin: l ? l.fin : null, attente: l ? (l.attente || 0) : 0,
        atelier: l ? l.atelier : null, dispo: !!(l && l.dispo), absent: !l && !lavage.has(s),
        commun: !l && lavage.has(s), attendu: null };
    });
    const par = new Map(etapes.map(e => [e.service, e]));
    // Une étape sans équipe est enjambée : on remonte jusqu'à ce qui a vraiment livré.
    const amonts = (s, vus = new Set()) => arcs.filter(a => a.to === s && !vus.has(a.from)).flatMap(a => {
      vus.add(a.from);
      const e = par.get(a.from);
      return e && !e.absent && !e.commun ? [e] : amonts(a.from, vus);
    });
    for (const e of etapes) {
      if (e.absent || !(e.attente > 0)) continue;
      const d = amonts(e.service).filter(x => Number.isFinite(x.fin)).sort((a, b) => b.fin - a.fin)[0];
      if (d) e.attendu = d.service;
    }
    const temps = etapes.flatMap(e => [e.debut == null ? null : e.debut - e.attente, e.fin]).filter(Number.isFinite);
    return { etapes, debut: temps.length ? Math.min(...temps) : null, fin: temps.length ? Math.max(...temps) : null };
  }

  /* ======================================================================
   *  UN CHEMIN PAR COMMANDE, DES CASES PARTAGÉES
   *
   *  Chaque commande (TX/BC) a son chemin, rangé dans `parcoursClasse`. Sur
   *  ce chemin, chaque service porte une CASE : l'équipe (un atelier) qui y
   *  prépare la commande. Une case se partage : « TX BC/PC » en cuisine
   *  prépare TX BC puis TX PC, sur deux lignes ; le chemin de TX BC n'en
   *  attend que la première. Une commande sans chemin à elle suit le chemin
   *  de sa classe (`parcoursCabine`) : un MODÈLE.
   * ====================================================================*/

  /** « TX/BC » → « TX BC » : le nom court d'une commande, pour nommer ses chemins et ses cases. */
  function etiquette(id) {
    const i = String(id).lastIndexOf('/');
    return i < 0 ? String(id) : id.slice(0, i) + ' ' + id.slice(i + 1);
  }

  /** Le chemin propre d'une commande, ou rien. */
  function cheminDe(etat, cmd) {
    const id = (etat.parcoursClasse || {})[cmd];
    return id ? (etat.parcours || []).find(p => p.id === id) || null : null;
  }

  /** La commande dont ce chemin est le chemin propre, ou rien. */
  function commandeDu(etat, pid) {
    return Object.keys(etat.parcoursClasse || {}).find(k => etat.parcoursClasse[k] === pid) || null;
  }

  /** Les modèles : les chemins d'une classe, ou ceux qui ne sont le chemin d'aucune commande. */
  function modeles(etat) {
    const pris = new Set(Object.values(etat.parcoursClasse || {}));
    const classe = new Set(Object.values(etat.parcoursCabine || {}));
    return (etat.parcours || []).filter(p => classe.has(p.id) || !pris.has(p.id));
  }

  /** La case d'une commande dans un service : l'équipe qui l'y prépare, sinon celle qui y sert tout le monde. */
  function caseDe(etat, service, cmd) {
    const ats = (etat.ateliers || []).filter(a => a.service === service);
    return ats.find(a => fabrique(a) && (a.lots || []).some(l => l.includes(cmd)))
      || ats.find(a => !fabrique(a)) || null;
  }

  /**
   * Le chemin de `cible`, copié d'un chemin existant (ou vide). Avec
   * `memesCases`, la cible entre dans les cases du chemin copié, sur sa propre
   * ligne, juste après la dernière des commandes `apres` (par défaut, celle
   * du chemin copié) : « TX BC » puis « TX PC ».
   * @returns {{ chemin, cases }} le chemin créé, et combien de cases l'ont reçue
   */
  function creerChemin(etat, cible, sourceId, memesCases, apres, o = {}) {
    const src = (etat.parcours || []).find(p => p.id === sourceId) || null;
    const srcCmd = src ? commandeDu(etat, src.id) : null;
    let base = src ? src.nom.trim() : 'Chemin';
    const fin = srcCmd ? etiquette(srcCmd) : '';
    if (fin && base.toUpperCase().endsWith(fin.toUpperCase())) base = base.slice(0, -fin.length).trim();
    // Le nom d'un chemin est sa clé dans le classeur Excel : il reste unique.
    const chemin = { id: uid(), nom: nomDeChemin(etat, ((base ? base + ' ' : '') + etiquette(cible)).slice(0, 76)),
      noeuds: src ? P.servicesDuParcours(src).slice() : [],
      liens: src ? P.arcsDuParcours(src).map(a => ({ de: a.from, vers: a.to })) : [], prepa: true };
    etat.parcours.push(chemin);
    etat.parcoursClasse[cible] = chemin.id;
    let cases = 0;
    if (memesCases && srcCmd) {
      const avant = new Set(apres && apres.length ? apres : [srcCmd]);
      for (const s of chemin.noeuds) {
        const a = caseDe(etat, s, srcCmd);
        if (!a || !fabrique(a)) continue;
        if ((etat.ateliers || []).some(x => x.service === s && fabrique(x) && x.lots.some(l => l.includes(cible)))) continue;
        let i = -1;
        a.lots.forEach((l, k) => { if (l.some(id => avant.has(id))) i = k; });
        a.lots.splice(i + 1, 0, [cible]); cases++;
      }
    }
    // Chaque service du chemin a sa case, dès la création : là où elle n'est
    // pas reprise d'un autre chemin, une case neuve, à régler.
    const creees = donnerCases(etat, cible, chemin, chemin.noeuds, o.nomDe, o.classes);
    return { chemin, cases, creees };
  }

  /**
   * Une case pour chaque service donné du chemin où la commande n'en a pas :
   * une équipe neuve (« Cuisine AF CREW ») qui la prépare ; pour la plonge,
   * qui lave pour tout le monde, une plonge s'il n'y en a aucune. Le chemin
   * est marqué `cases` : une case qu'on retire ensuite ne revient pas.
   * @returns {number} le nombre de cases créées
   */
  function donnerCases(etat, cmd, chemin, services, nomDe, classes) {
    const nom = s => (nomDe ? nomDe(s) : s);
    let n = 0;
    for (const s of services || []) {
      if (caseDe(etat, s, cmd)) continue;
      if (s === 'plonge') {
        etat.ateliers.push({ id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          nom: nomLibre(etat, nom(s)), service: s, type: 'lavage', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [],
          regime: { actif: true }, plafond: 0, tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }] });
      } else {
        const a = nouvelleEquipe(etat, s, nom(s), [], classes);
        a.nom = nomLibre(etat, nom(s) + ' ' + etiquette(cmd));
        affecter(etat, s, [cmd], a.id, classes);
      }
      n++;
    }
    chemin.cases = true;
    return n;
  }

  /**
   * Les chemins de commande dessinés avant que les cases naissent d'office
   * (24/09) : chacun reçoit, une fois, les cases qui lui manquent.
   * @returns {number} le nombre de cases créées
   */
  function completerCases(etat, nomDe, classes) {
    let n = 0;
    // Une commande retirée du programme garde son chemin, mais n'a pas à recevoir de case.
    const presentes = classes ? new Set(classes.map(c => c.id)) : null;
    for (const [cmd, pid] of Object.entries(etat.parcoursClasse || {})) {
      const p = (etat.parcours || []).find(x => x.id === pid);
      if (!p || p.cases || commandeDu(etat, pid) !== cmd || (presentes && !presentes.has(cmd))) continue;
      n += donnerCases(etat, cmd, p, P.servicesDuParcours(p), nomDe, classes);
    }
    return n;
  }

  /** Un nom de chemin libre, pour la même raison. */
  function nomDeChemin(etat, nom) {
    const pris = new Set((etat.parcours || []).map(p => String(p.nom).trim().toUpperCase()));
    let n = nom, i = 2;
    while (pris.has(n.toUpperCase())) n = nom + ' ' + i++;
    return n;
  }

  /** Un nom de case libre : le nom est la clé des classeurs Excel. */
  function nomLibre(etat, nom) {
    const pris = new Set((etat.ateliers || []).map(a => String(a.nom).toUpperCase()));
    let n = nom, i = 2;
    while (pris.has(n.toUpperCase())) n = nom + ' ' + i++;
    return n;
  }

  /* ======================================================================
   *  L'ÉDITEUR
   *
   *  « Les chemins » : à gauche les commandes, au centre le chemin de celle
   *  qu'on a choisie, dessous la case du service qu'on y clique. Tout se
   *  règle là ; le tableau « Qui prépare quoi », la liste des cases et leur
   *  journée s'en déduisent.
   * ====================================================================*/

  const AIDE_PARCOURS = `<p>Chaque <b>commande</b> (une compagnie dans une classe, ex. TX · Business) a son
    <b>chemin</b> : un diagramme où chaque service est un nœud, et un lien « A → B » veut dire que A livre B.
    Pour relier deux services, tirez le <b>+</b> du premier jusqu’au second, ou cliquez-le puis cliquez l’autre.
    Un lien qui ferait tourner une commande en rond est refusé.</p>
    <p>Sur chaque nœud, une <b>case</b> : l’équipe qui y fait ce travail — son nom, ses personnes, son heure et
    ses man-minutes (celles de l’import, modifiables pour cette case). Une case se <b>partage</b> entre chemins :
    la case « TX BC/PC » de la cuisine prépare TX BC puis TX PC, sur deux lignes, et le chemin de TX BC n’attend
    que la ligne de TX BC.</p>
    <p>Une commande qui n’a pas encore son chemin suit le <b>modèle</b> de sa classe (en bas de la liste).</p>`;
  const AIDE_TABLEAU = `<p>Ce tableau se <b>calcule</b> à partir des chemins : une <b>ligne</b> par commande,
    une <b>colonne</b> par service, et dans chaque case le nom de la case qui la prépare, avec ses heures.
    Cliquez une case pour ouvrir le chemin de cette commande sur ce service, et la régler.</p>
    <p>« à faire » : cette commande passe par ce service mais n’y a pas encore de case ; l’étape est sautée.
    Une case hachurée : la commande ne passe pas par là.</p>
    <p>La dernière colonne dit quand la commande est prête ; cliquez-la pour la suivre dans le temps.</p>`;

  class EditeurParcours {
    /**
     * @param {object} a adaptateur :
     *   boite()          — l'élément où se dessiner
     *   etat()           — { ateliers, parcours, parcoursCabine, parcoursClasse } (lecture)
     *   changer(fn, msg) — applique `fn(etat)` sur l'état et enregistre
     *   services()       — [{id, nom}]
     *   classes()        — les commandes (compagnies × classes) du moment
     *   resultat()       — la journée calculée, pour les heures
     *   fiche(id, cmd)   — facultatif : le HTML de la fiche d'une case, ouverte
     *   onglet(id)       — facultatif : ouvrir un sous-onglet
     */
    constructor(a) {
      this.a = a;
      this.cmd = null;             // la commande dont on montre le chemin
      this.actif = null;           // un modèle, quand aucune commande n'est choisie
      this.sel = null;             // le lien choisi dans le diagramme
      this.svc = '';               // le service choisi : sa case s'ouvre dessous
      this.depuis = undefined;     // « partir de » : le chemin à copier pour en créer un
      this.graphe = null;
      this.suivies = new Set();    // lignes du tableau dépliées dans le temps
      this.recherche = '';         // dans le tableau
      this.chercheCmd = '';        // dans la liste des commandes
      this.incompletes = false;
      const boite = a.boite();
      boite.addEventListener('click', e => this.cliquer(e));
      boite.addEventListener('change', e => this.saisir(e));
      document.addEventListener('keydown', e => {
        // Échap dans un champ de la case ne ferme pas la fenêtre : on y tapait.
        if (e.key !== 'Escape' || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (this.a.boite().querySelector('.pc-tiroir') && !(this.graphe && this.graphe.depuis)) this.fermer();
      });
      root.addEventListener('resize', () => this.placeTiroir());
      boite.addEventListener('input', e => {
        if (e.target.dataset.qf === 'recherche') { this.recherche = e.target.value; this.filtrer(); }
        if (e.target.dataset.pc === 'cmd-recherche') { this.chercheCmd = e.target.value; this.filtrerCmd(); }
      });
    }

    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }
    /** Le nom d'un groupe de colonnes : la jonction, ou le service d'où part le chemin. */
    groupe(g) { return g === 'Jonction' ? 'Jonction' : 'Depuis ' + this.nom(g); }
    atelier(id) { return (this.a.etat().ateliers || []).find(a => a.id === id) || null; }
    lib(cmd) { return P.libelleClasse(cmd); }

    /** Ouvrir le chemin d'une commande sur un service (depuis le tableau, les cases…). */
    ouvrir(cmd, service) {
      this.cmd = cmd; this.actif = null; this.sel = null; this.svc = service || ''; this.depuis = undefined;
      if (this.a.onglet) this.a.onglet('at-chemins');
      this.rendre();
      const vue = this.a.boite().closest('[id^="view-"]'); if (vue) vue.scrollTop = 0;
      if (this.graphe && this.svc) this.graphe.montrer(this.svc);
    }

    parcoursActif(etat) {
      if (this.cmd) return cheminDe(etat, this.cmd);
      return (etat.parcours || []).find(p => p.id === this.actif) || null;
    }

    /** Ce que le diagramme montre choisi : le lien, sinon le service dont la case est ouverte. */
    selection() {
      if (this.sel && this.sel.type === 'lien') return this.sel;
      const p = this.parcoursActif(this.a.etat());
      return p && this.svc && P.servicesDuParcours(p).includes(this.svc) ? { type: 'noeud', id: this.svc } : null;
    }

    rendre() {
      const etat = this.a.etat(), classes = this.a.classes();
      if (this.cmd && !classes.some(c => c.id === this.cmd)) this.cmd = null;
      if (this.actif && !(etat.parcours || []).some(p => p.id === this.actif)) this.actif = null;
      if (!this.cmd && !this.actif && classes.length) this.cmd = this.ordreCommandes(classes)[0].id;
      const t = this.a.boite().querySelector('.pc-tiroir'), haut = t ? t.scrollTop : 0;
      // Le tableau ne se construit que s'il est affiché (ou hors navigateur).
      const tableau = !root.document || root.document.body.dataset.sous === 'at-grille';
      this.a.boite().innerHTML = this.sectionParcours(etat, classes)
        + (tableau ? this.sectionTableau(etat, classes) : '<section class="qf" data-sous="at-grille" data-a-dessiner></section>');
      const t2 = this.a.boite().querySelector('.pc-tiroir'); if (t2 && haut) t2.scrollTop = haut;
      this.placeTiroir();
      const g = this.diagramme(); if (g) { g.selection = this.selection(); g.rendre(); }
      const statut = document.getElementById('at-status'), m = this.a.boite().querySelector('.pc-message');
      if (m && statut) m.textContent = statut.textContent;
      this.filtrer(); this.filtrerCmd();
    }

    /* ---- 1. les chemins ---------------------------------------------- */

    /** Les commandes par compagnie (la plus pressée d'abord), puis par classe. */
    ordreCommandes(classes) {
      const cies = [];
      for (const c of classes) if (!cies.includes(c.cie)) cies.push(c.cie);
      return cies.flatMap(cie => classes.filter(c => c.cie === cie)
        .sort((x, y) => P.CABINES.indexOf(x.cabine) - P.CABINES.indexOf(y.cabine)));
    }

    sectionParcours(etat, classes) {
      return `<section class="pc-sec" aria-labelledby="pc-t1" data-sous="at-chemins">
        <div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t1">Le chemin de chaque commande</h3>
          <details class="aide"><summary aria-label="Qu’est-ce qu’un chemin, qu’est-ce qu’une case ?">?</summary><span class="aide-corps">${AIDE_PARCOURS}</span></details></div>
        <div class="pc-cadre">${this.listeCommandes(etat, classes)}
          <div class="pc-principal">${this.cmd ? this.corpsCommande(etat, classes) : this.corpsModele(etat, classes)}</div></div>
      </section>`;
    }

    listeCommandes(etat, classes) {
      const r = this.a.resultat ? this.a.resultat() : null, par = (r && r.parClasse) || {};
      const avec = classes.filter(c => cheminDe(etat, c.id)).length;
      let cie = null;
      const items = this.ordreCommandes(classes).map(c => {
        const tete = c.cie !== cie ? `<li class="pc-cie" data-cie="${esc(c.cie)}">${esc(c.cie)}</li>` : '';
        cie = c.cie;
        const p = cheminDe(etat, c.id), on = this.cmd === c.id, v = par[c.id] || {};
        const modele = !p && (etat.parcours || []).find(x => x.id === (etat.parcoursCabine || {})[c.cabine]);
        const marque = !p ? '' : v.fin == null ? '<span class="pc-cmd-etat afaire" title="Pas encore prête">·</span>'
          : v.aHeure ? '<span class="pc-cmd-etat ok" title="Prête à l’heure">✓</span>'
          : `<span class="pc-cmd-etat retard" title="${Math.round(v.retard)} min de retard">!</span>`;
        return tete + `<li data-cmd="${esc(c.id)}" data-cie="${esc(c.cie)}"><button class="pc-cmd${on ? ' actif' : ''}${p ? '' : ' sans'}" data-pc-action="cmd"
          data-classe="${esc(c.id)}"${on ? ' aria-current="true"' : ''}>
          <span class="puce-classe" data-cab="${esc(c.cabine)}"></span>
          <span class="pc-cmd-nom">${esc((P.NOM_CABINE || {})[c.cabine] || c.cabine)}<small>${p ? esc(p.nom) : modele ? 'modèle ' + esc(modele.nom) : 'pas de chemin'}</small></span>
          ${marque}</button></li>`;
      }).join('');
      return `<aside class="pc-cmds" aria-label="Les commandes">
        <div class="pc-cmds-tete"><b>Les commandes</b><span>${avec} sur ${classes.length} avec leur chemin</span></div>
        <input type="search" class="pc-cmds-cherche" data-pc="cmd-recherche" placeholder="Chercher (TX, BC…)" value="${esc(this.chercheCmd)}" aria-label="Chercher une commande">
        <ul class="pc-cmds-liste">${items || '<li class="mini-note">Aucune commande : importez un programme de vols (étape 1).</li>'}</ul>
        ${this.blocModeles(etat)}
      </aside>`;
    }

    blocModeles(etat) {
      const mods = modeles(etat);
      const options = choisi => '<option value="">aucun (liens de l’unité)</option>'
        + mods.map(p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`).join('');
      return `<details class="pc-modeles"${this.cmd ? '' : ' open'}><summary>Modèles <small>pour les commandes sans chemin</small></summary>
        <div class="pc-modeles-corps">
          <div class="pc-puces">${mods.map(p => `<button class="pc-puce${!this.cmd && this.actif === p.id ? ' actif' : ''}" data-pc-action="modele"
            data-parcours="${esc(p.id)}">${esc(p.nom)}</button>`).join('')}
            <button class="btn btn-sm" data-pc-action="modele-ajouter">+ Modèle</button>
            ${(etat.parcours || []).length ? '' : '<button class="btn btn-sm" data-pc-action="types">Créer les modèles types</button>'}</div>
          <div class="pc-defauts">${P.CABINES.map(c => `<label><span class="pc-lab-cab"><span class="puce-classe" data-cab="${c}"></span>${esc((P.NOM_CABINE || {})[c] || c)}</span>
            <select data-pc-champ="cabine" data-cabine="${c}">${options((etat.parcoursCabine || {})[c])}</select></label>`).join('')}</div>
        </div></details>`;
    }

    /** L'en-tête d'une commande : qui elle est, quand elle part, quand elle est prête. */
    teteCommande(c, avecChemin) {
      const r = this.a.resultat ? this.a.resultat() : null, v = ((r && r.parClasse) || {})[c.id] || {};
      const departs = (c.vols || []).map(x => x.depart).filter(Number.isFinite);
      const bits = [c.pax ? c.pax + ' passagers' : '', departs.length ? 'premier départ ' + P.hhmm(Math.min(...departs)) : 'hors programme'];
      if (avecChemin && v.fin != null) bits.push('prête à ' + P.hhmm(v.fin) + (v.aHeure ? ' · à l’heure' : ' · ' + Math.round(v.retard) + ' min de retard'));
      return `<div class="pc-cmd-tete"><span class="puce-classe" data-cab="${esc(c.cabine)}"></span><b>${esc(this.lib(c.id))}</b>
        <span>${bits.filter(Boolean).map(esc).join(' · ')}</span></div>`;
    }

    corpsCommande(etat, classes) {
      const c = classes.find(x => x.id === this.cmd), p = cheminDe(etat, this.cmd);
      if (!p) return this.teteCommande(c, false) + this.creation(etat, classes, c);
      return this.teteCommande(c, true) + this.outils(etat, p, this.duplication(etat, classes, c))
        + `<p class="pc-message" role="status" aria-live="polite"></p>
        <div class="pc-graphe" data-parcours="${esc(p.id)}"></div>
        <div class="pc-bas">${this.blocPanneau(etat, classes, p)}</div>`;
    }

    corpsModele(etat, classes) {
      const p = this.parcoursActif(etat);
      if (!p) return '<p class="mini-note">Choisissez une commande à gauche.</p>';
      const suivi = P.CABINES.filter(c => (etat.parcoursCabine || {})[c] === p.id).map(c => (P.NOM_CABINE || {})[c] || c);
      const sans = classes.filter(c => !cheminDe(etat, c.id) && (etat.parcoursCabine || {})[c.cabine] === p.id).length;
      return `<div class="pc-cmd-tete"><b>Modèle « ${esc(p.nom)} »</b><span>${suivi.length ? 'classe' + (suivi.length > 1 ? 's ' : ' ') + esc(suivi.join(', ')) : 'suivi par aucune classe'}
          · ${sans} ${sans > 1 ? 'commandes le suivent' : 'commande le suit'} faute de chemin à elles</span></div>`
        + this.outils(etat, p, '')
        + `<p class="pc-message" role="status" aria-live="polite"></p>
        <div class="pc-graphe" data-parcours="${esc(p.id)}"></div>
        <div class="pc-bas">${this.blocPanneau(etat, classes, p)}</div>`;
    }

    outils(etat, p, dup) {
      const dedans = new Set(P.servicesDuParcours(p));
      const hors = this.a.services().filter(s => !dedans.has(s.id));
      return `<div class="pc-outils" data-parcours="${esc(p.id)}">
        <label class="pc-nom-champ">Nom du chemin <input class="pc-nom" value="${esc(p.nom)}" data-pc-champ="nom" aria-label="Nom du chemin"></label>
        <label>Ajouter un service <select data-pc-champ="noeud-ajout" aria-label="Ajouter un service à ce chemin">
          <option value="">Choisir…</option>${hors.map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('')}</select></label>
        <span class="pc-outils-fin"></span>
        ${dup}
        <button class="btn btn-sm" data-pc-action="reorganiser" title="Ranger les services d’eux-mêmes, de gauche à droite dans le sens du flux">Réorganiser</button>
        <button class="lien-discret danger" data-pc-action="parcours-retirer">Supprimer ce chemin</button>
      </div>`;
    }

    /** Une commande sans chemin : on lui en crée un, vide ou copié d'un autre. */
    creation(etat, classes, c) {
      const mods = modeles(etat), autres = (etat.parcours || []).filter(p => !mods.includes(p));
      const modele = (etat.parcours || []).find(x => x.id === (etat.parcoursCabine || {})[c.cabine]);
      const choisi = this.depuis !== undefined ? this.depuis : (modele ? modele.id : '');
      const src = (etat.parcours || []).find(p => p.id === choisi), srcCmd = src ? commandeDu(etat, src.id) : null;
      const opt = p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`;
      const I = root.OrlyIcones, lib = this.lib(c.id);
      return `<div class="vide-carte pc-creer">${I ? I.ico('fleche') : ''}<b>${esc(lib)} n’a pas encore son chemin</b>
        <p>${modele ? `En attendant, elle suit le modèle « ${esc(modele.nom)} » de sa classe.` : 'En attendant, elle suit les liens de l’unité.'}</p>
        <div class="pc-creer-choix">
          <label>Partir de <select data-pc-champ="creer-depuis" aria-label="Chemin à copier">
            <option value="" ${choisi ? '' : 'selected'}>un chemin vide</option>
            ${autres.length ? `<optgroup label="Le chemin d’une autre commande">${autres.map(opt).join('')}</optgroup>` : ''}
            ${mods.length ? `<optgroup label="Un modèle">${mods.map(opt).join('')}</optgroup>` : ''}</select></label>
          ${srcCmd ? `<label class="chk chk-mini"><input type="checkbox" data-pc="memes-cases" checked>
            Dans les mêmes cases : ${esc(lib)} s’y ajoute juste après ${esc(this.lib(srcCmd))}</label>` : ''}
          <button class="btn btn-play" data-pc-action="creer" data-classe="${esc(c.id)}">Créer le chemin de ${esc(lib)}</button>
        </div></div>`;
    }

    /** « Dupliquer pour… » : le même chemin pour d'autres commandes, chacune le sien. */
    duplication(etat, classes, c) {
      const libres = this.ordreCommandes(classes).filter(x => !cheminDe(etat, x.id));
      if (!libres.length) return '';
      return `<details class="pc-dup"><summary class="btn btn-sm">Dupliquer pour…</summary><div class="pc-dup-corps">
        <p>Le même chemin pour d’autres commandes : chacune reçoit le sien, modifiable ensuite.</p>
        <div class="pc-dup-liste">${libres.map(x => `<label class="chk chk-mini"><input type="checkbox" data-pc="dup-cible" value="${esc(x.id)}">
          <span class="puce-classe" data-cab="${esc(x.cabine)}"></span>${esc(this.lib(x.id))}</label>`).join('')}</div>
        <label class="chk chk-mini"><input type="checkbox" data-pc="memes-cases" checked> Dans les mêmes cases, à la suite de ${esc(this.lib(c.id))}</label>
        <button class="btn btn-play btn-sm" data-pc-action="dupliquer">Créer ces chemins</button></div></details>`;
    }

    /* Les nœuds du diagramme : un par service, avec la case de la commande. */
    noeudsDiagramme() {
      const etat = this.a.etat(), p = this.parcoursActif(etat); if (!p) return [];
      const I = root.OrlyIcones;
      const ico = s => I ? I.icoService(s, this.nom(s)) : 'service';
      if (!this.cmd) return P.servicesDuParcours(p).map(s => ({ id: s, nom: this.nom(s), ico: ico(s), sous: 'modèle', ton: 'neutre' }));
      return P.servicesDuParcours(p).map(s => {
        const a = caseDe(etat, s, this.cmd);
        // « Cuisine TX BC » dans le nœud Cuisine : le service s'y lit déjà.
        const court = a ? (a.nom.toUpperCase().startsWith(this.nom(s).toUpperCase() + ' ') ? a.nom.slice(this.nom(s).length + 1) : a.nom) : '';
        const sous = !a ? 'aucune case'
          : a.type === 'dispo' ? court + ' · à disposition'
          : a.type === 'lavage' ? court + ' · plonge'
          : court + ' · ' + a.personnes + ' p. · ' + a.debut;
        return { id: s, nom: this.nom(s), ico: ico(s), sous, ton: a ? 'ok' : 'neutre' };
      });
    }

    liensDiagramme() {
      const p = this.parcoursActif(this.a.etat()); if (!p) return [];
      // Sur le chemin d'une commande : le temps qu'elle passe en stock sur chaque lien.
      const r = this.cmd && this.a.resultat ? this.a.resultat() : null, T = root.OrlyTemps;
      return P.arcsDuParcours(p).map(a => {
        const s = r && T ? T.sejour(r, a.from, a.to, this.cmd) : null;
        return { id: a.from + '>' + a.to, de: a.from, vers: a.to,
          titre: this.nom(a.from) + ' livre ' + this.nom(a.to) + (s ? ' — ' + P.dureeLisible(s.duree) + ' en stock' : ''),
          etiquette: s ? P.dureeLisible(s.duree) : '' };
      });
    }

    diagramme() {
      if (this.graphe || !root.OrlyGraphe) return this.graphe;
      const ed = this;
      this.graphe = new root.OrlyGraphe.Diagramme({
        hote: () => ed.a.boite().querySelector('.pc-graphe'),
        get cle() { const p = ed.parcoursActif(ed.a.etat()); return 'chemin:' + (p ? p.id : ''); },
        titre: 'Le chemin : un nœud par service, avec sa case ; un lien par livraison',
        noeuds: () => ed.noeudsDiagramme(),
        liens: () => ed.liensDiagramme(),
        relier: (de, vers) => ed.relier(de, vers),
        retirerLien: id => ed.retirerLien(id),
        choisir: sel => {
          ed.sel = sel && sel.type === 'lien' ? sel : null;
          ed.svc = sel && sel.type === 'noeud' ? sel.id : '';
          ed.rendrePanneau();
        },
        // Relier : la fenêtre de la case se referme, le service visé doit se voir.
        relierDebut: () => { if (ed.svc) { ed.svc = ''; ed.rendrePanneau(); } },
        message: t => ed.dire(t)
      });
      return this.graphe;
    }

    relier(de, vers) {
      const p = this.parcoursActif(this.a.etat()); if (!p) return 'Aucun chemin choisi.';
      if (P.arcsDuParcours(p).some(a => a.from === de && a.to === vers)) return this.nom(de) + ' livre déjà ' + this.nom(vers) + '.';
      if (creeBoucle(p, de, vers)) return 'Impossible : ' + this.nom(vers) + ' livre déjà ' + this.nom(de)
        + ' (directement ou par d’autres services). Une commande tournerait en rond.';
      this.a.changer(etat => {
        const q = etat.parcours.find(x => x.id === p.id);
        for (const s of [de, vers]) if (!q.noeuds.includes(s)) q.noeuds.push(s);
        q.liens.push({ de, vers });
      }, this.nom(de) + ' livre maintenant ' + this.nom(vers) + (this.cmd ? ', sur le chemin de ' + this.lib(this.cmd) + ' seulement.' : '.'));
      return '';
    }

    retirerLien(id) {
      const p = this.parcoursActif(this.a.etat()); if (!p) return;
      const [de, vers] = id.split('>');
      this.sel = null;
      this.a.changer(etat => {
        const q = etat.parcours.find(x => x.id === p.id);
        q.liens = q.liens.filter(l => !(l.de === de && l.vers === vers));
      }, 'Lien retiré : ' + this.nom(de) + ' ne livre plus ' + this.nom(vers) + '. Vous pouvez annuler.');
    }

    /* Ce qui vient de se passer se dit deux fois : dans la ligne d'état de la
     * vue, et juste au-dessus du diagramme, là où l'on regarde. */
    dire(t) {
      const s = document.getElementById('at-status'); if (s) s.textContent = t || '';
      const m = this.a.boite().querySelector('.pc-message'); if (m) m.textContent = t || '';
    }

    /** Les commandes d'une case, en bref : « TX BC, TX PC ». */
    resumeCase(a) {
      const ids = [...new Set((a.lots || []).flat())];
      return ids.length ? ids.slice(0, 3).map(etiquette).join(', ') + (ids.length > 3 ? '…' : '') : 'aucune commande';
    }

    /* Sous le diagramme : ce qu'on peut faire du service ou du lien choisi. */
    panneau(etat, classes, p) {
      const sel = this.selection(), I = root.OrlyIcones;
      if (sel && sel.type === 'lien') {
        const [de, vers] = sel.id.split('>');
        return `<p><b>${esc(this.nom(de))}</b> livre <b>${esc(this.nom(vers))}</b> : ${esc(this.nom(vers))} attend que ${esc(this.nom(de))} ait fini.</p>
          <div class="row-btns"><button class="btn btn-sm at-danger" data-pc-action="lien-retirer" data-lien="${esc(sel.id)}">Retirer ce lien</button></div>`;
      }
      if (sel && sel.type === 'noeud') {
        const s = sel.id, ico = I ? I.ico(I.icoService(s, this.nom(s))) : '';
        const gestes = `<button class="btn btn-sm" data-pc-action="relier-depuis" data-service="${esc(s)}">Relier à…</button>
          <button class="lien-discret danger" data-pc-action="noeud-retirer" data-service="${esc(s)}">Retirer du chemin</button>`;
        if (!this.cmd) return `<p class="pc-pan-tete">${ico}<b>${esc(this.nom(s))}</b><span>dans un modèle, un nœud n’a pas de case :
          chaque commande a la sienne, sur son propre chemin.</span></p><div class="row-btns">${gestes}</div>`;
        const lib = this.lib(this.cmd), a = caseDe(etat, s, this.cmd);
        const cases = (etat.ateliers || []).filter(x => x.service === s && fabrique(x));
        const autres = a && fabrique(a) ? [...new Set(a.lots.flat())].filter(id => id !== this.cmd) : [];
        const dit = !a ? `aucune case : ${esc(lib)} saute cette étape`
          : a.type === 'dispo' ? `« ${esc(a.nom)} » est une mise à disposition : elle sert toutes les commandes`
          : a.type === 'lavage' ? `« ${esc(a.nom)} » lave pour toutes les commandes`
          : `case « ${esc(a.nom)} »${autres.length ? ' — partagée avec ' + esc(autres.map(etiquette).join(', ')) : ''}`;
        const choix = !a || fabrique(a) ? `<label class="pc-case-choix">Case de ${esc(lib)} ici
          <select data-pc-champ="case" data-service="${esc(s)}" aria-label="Case de ${esc(lib)} dans ${esc(this.nom(s))}">
            <option value="" ${a ? '' : 'selected'}>— aucune —</option>
            ${cases.map(x => `<option value="${esc(x.id)}" ${a && a.id === x.id ? 'selected' : ''}>${esc(x.nom)} · ${esc(this.resumeCase(x))}</option>`).join('')}
            <option value="+">+ Nouvelle case « ${esc(this.nom(s) + ' ' + etiquette(this.cmd))} »</option></select></label>` : '';
        const fiche = a && this.a.fiche ? this.a.fiche(a.id, this.cmd) : '';
        return `<p class="pc-pan-tete">${ico}<b>${esc(this.nom(s))}</b><span>${dit}</span></p>
          ${this.dansLeTemps(s)}
          <div class="row-btns pc-case-outils">${choix}<span class="pc-outils-fin"></span>${gestes}</div>
          ${fiche || (a ? '' : `<p class="mini-note">Choisissez une case existante de ${esc(this.nom(s))} (elle prépare déjà d’autres commandes :
            ${esc(lib)} s’y ajoute à la suite), ou créez-en une.</p>`)}`;
      }
      return `<div class="pc-geste">${I ? I.ico('info') : ''}<span>Cliquez un service pour choisir ou régler sa case.
        Tirez le <b class="pc-rond">+</b> d’un service jusqu’à un autre, ou cliquez-le puis cliquez l’autre, pour les relier ; un service peut en livrer plusieurs.
        Cliquez un lien pour le retirer. <span class="pc-bleu">En bleu sur un lien</span> : le temps que la commande y passe en stock.</span></div>`;
    }

    /* Un service choisi ouvre sa case dans une fenêtre à droite de l'écran :
     * dessous le diagramme, elle tombait hors de vue. Un lien choisi, ou rien,
     * se dit sous le diagramme. */
    blocPanneau(etat, classes, p) {
      const sel = this.selection();
      if (!sel || sel.type !== 'noeud') return `<div class="pc-panneau" aria-live="polite">${this.panneau(etat, classes, p)}</div>`;
      const I = root.OrlyIcones, s = sel.id;
      return `<div class="pc-panneau pc-renvoi">${I ? I.ico('info') : ''}<span>La case de <b>${esc(this.nom(s))}</b> est ouverte à droite. Fermez-la (× ou Échap) pour revenir à la liste des commandes.</span></div>
        <aside class="pc-tiroir" role="dialog" aria-label="${esc(this.nom(s))} : sa case">
          <div class="pc-tiroir-tete"><span>${this.cmd ? `<span class="puce-classe" data-cab="${esc(this.cmd.split('/').pop())}"></span>${esc(this.lib(this.cmd))}` : 'Modèle'}</span>
            <button class="pc-tiroir-fermer" data-pc-action="fermer" aria-label="Fermer la case" title="Fermer (Échap)">×</button></div>
          ${this.panneau(etat, classes, p)}
        </aside>`;
    }

    /* Ce que la commande vit dans ce service, dans le temps : ce qui l'attendait
     * en stock, son travail, et le temps qu'elle attend ensuite. */
    dansLeTemps(s) {
      const r = this.a.resultat ? this.a.resultat() : null, cmd = this.cmd;
      if (!r || !r.ok || !cmd) return '';
      const hh = P.hhmm, d = P.dureeLisible, sej = (r.stocks && r.stocks.sejours) || [];
      const lot = (r.lots || []).find(l => l.service === s && !l.dispo && (l.classes || []).includes(cmd));
      const lignes = [];
      for (const x of sej.filter(x => x.vers === s && x.classe === cmd))
        lignes.push(`<li class="stock">Livrée par <b>${esc(this.nom(x.de))}</b> à ${hh(x.entree)}, prise à ${hh(x.sortie)} :
          <b>${d(x.duree)} en stock</b> (${x.repas} repas).</li>`);
      if (lot) lignes.push(`<li>${lot.fin == null ? 'Commence à ' + hh(lot.debut) + ', ne finit pas dans le poste'
        : 'Travaillée de <b>' + hh(lot.debut) + ' à ' + hh(lot.fin) + '</b>'}${lot.attente >= 1 ? ` après ${d(lot.attente)} à attendre le service d’avant` : ''}.</li>`);
      for (const x of sej.filter(x => x.de === s && x.classe === cmd))
        lignes.push(`<li class="stock">Puis <b>${d(x.duree)} en stock</b> avant ${x.vers === 'chargement'
          ? 'le chargement de l’avion (' + hh(x.sortie) + ')' : `que <b>${esc(this.nom(x.vers))}</b> la prenne (${hh(x.sortie)})`}.</li>`);
      return lignes.length ? `<ul class="pc-temps" aria-label="Dans le temps">${lignes.join('')}</ul>` : '';
    }

    rendrePanneau() {
      const etat = this.a.etat(), p = this.parcoursActif(etat), box = this.a.boite().querySelector('.pc-bas');
      if (box && p) box.innerHTML = this.blocPanneau(etat, this.a.classes(), p);
      this.placeTiroir();
    }

    /** Fenêtre ouverte : la page lui fait place à droite, rien ne passe dessous. */
    placeTiroir() {
      if (!root.document) return;
      const ouvert = !!this.a.boite().querySelector('.pc-tiroir');
      document.body.classList.toggle('pc-tiroir-ouvert', ouvert);
      // Elle commence sous la barre des onglets : le bandeau, les étapes et les
      // outils de la vue (Annuler, Excel, Importer) restent à portée.
      if (ouvert) {
        const barre = document.getElementById('sous-onglets');
        const bas = barre && !barre.hidden ? barre.getBoundingClientRect().bottom : 0;
        // Vue cachée : la barre ne se mesure pas ; on garde la dernière mesure.
        if (bas > 0) document.documentElement.style.setProperty('--tiroir-haut', Math.round(bas) + 'px');
      }
      // Le service choisi reste en vue, à gauche de la fenêtre.
      if (ouvert && this.graphe && this.svc) this.graphe.montrer(this.svc);
    }

    /** Refermer la fenêtre de la case : le service n'est plus choisi. */
    fermer() {
      this.svc = ''; this.sel = null;
      const g = this.graphe;
      if (g && g.a.hote()) { g.selection = null; g.rendre(); }
      this.rendrePanneau();
    }

    filtrerCmd() {
      const q = this.chercheCmd.trim().toUpperCase(), liste = this.a.boite().querySelector('.pc-cmds-liste');
      if (!liste) return;
      const vues = new Set();
      for (const li of liste.querySelectorAll('li[data-cmd]')) {
        const cache = !!q && !(li.dataset.cmd + ' ' + li.textContent).toUpperCase().includes(q);
        li.hidden = cache; if (!cache) vues.add(li.dataset.cie);
      }
      for (const li of liste.querySelectorAll('li.pc-cie')) li.hidden = !vues.has(li.dataset.cie);
    }

    /* ---- 2. qui prépare quoi : calculé ------------------------------ */

    sectionTableau(etat, classes) {
      const t = tableau(etat, classes);
      const r = this.a.resultat ? this.a.resultat() : null;
      const titre = `<div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t2">Qui prépare quoi <span class="pc-sous">calculé à partir des chemins</span></h3>
        <details class="aide"><summary aria-label="Comment lire le tableau ?">?</summary><span class="aide-corps">${AIDE_TABLEAU}</span></details></div>`;
      if (!t.lignes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucune commande à préparer : importez un programme de vols (étape 1).</p></section>`;
      // Sans aucune case, deux cents cases vides ne disent rien : on dit par où commencer.
      if (!(etat.ateliers || []).length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <div class="vide-carte qf-vide">${root.OrlyIcones ? root.OrlyIcones.ico('equipe') : ''}<b>Aucune case pour l’instant</b>
          <p>Ce tableau se remplit tout seul, à partir des chemins : quelle case prépare chaque commande, service par service.</p>
          <p>Pour commencer : dans « Les chemins », choisissez une commande, créez son chemin, puis cliquez un service pour lui donner sa case.</p>
          <div class="row-btns"><button class="btn btn-play" data-aller="ateliers" data-onglet="at-chemins">Ouvrir « Les chemins »</button></div></div></section>`;
      if (!t.colonnes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucun chemin : créez celui d’une commande dans « Les chemins » pour que le tableau ait des colonnes.</p></section>`;

      // Les heures d'un lot, pour lire le tableau comme un planning.
      const lots = new Map();
      for (const l of (r && r.lots) || []) for (const c of l.classes || []) lots.set(l.atelier + '|' + c, l);
      const nomAt = id => (this.atelier(id) || {}).nom || id;

      let remplies = 0, aRemplir = 0;
      for (const l of t.lignes) for (const col of t.colonnes) {
        const e = l.cases[col.service].etat;
        if (e === 'equipe' || e === 'auto') remplies++;
        if (e === 'libre') aRemplir++;
      }
      const total = remplies + aRemplir, pct = total ? Math.round(remplies / total * 100) : 100;

      const barre = `<div class="qf-barre">
        <div class="qf-progres" title="${remplies} ${remplies > 1 ? 'étapes ont leur' : 'étape a sa'} case, ${aRemplir} à faire">
          <div class="qf-jauge" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span><b>${remplies} sur ${total}</b> étapes ont leur case${aRemplir ? '' : ' — tout est couvert'}</span></div>
        <span class="qf-barre-fin"></span>
        <input type="search" class="qf-recherche" data-qf="recherche" placeholder="Chercher une compagnie (AF, DL…)" value="${esc(this.recherche)}" aria-label="Chercher une commande par sa compagnie">
        <label class="chk chk-mini"><input type="checkbox" data-qf="incompletes" ${this.incompletes ? 'checked' : ''}> Seulement les commandes à compléter</label>
      </div>
      <div class="qf-legende" aria-hidden="true"><span class="qf-l ok">case choisie</span><span class="qf-l libre">à faire</span><span class="qf-l auto">sert tout le monde</span><span class="qf-l hors">ne passe pas par là</span></div>`;

      // En-têtes : un groupe par service de départ (« depuis la plonge »), puis la jonction.
      const groupes = [];
      for (const c of t.colonnes) {
        const g = groupes[groupes.length - 1];
        if (g && g.nom === c.groupe) g.n++; else groupes.push({ nom: c.groupe, n: 1 });
      }
      const tete = `<thead>
        <tr class="qf-groupes"><th></th>${groupes.map((g, i) => `<th colspan="${g.n}" class="qf-g${g.nom === 'Jonction' ? ' jonction' : ''}" data-g="${i % 4}">${esc(this.groupe(g.nom))}</th>`).join('')}<th></th></tr>
        <tr><th scope="col" class="qf-coin">Commande</th>
        ${t.colonnes.map(c => {
          const n = c.fabriquent.length, libres = c.libres.length;
          // Une information par en-tête : ce qui reste à faire, sinon qui travaille.
          const sous = c.auto.length && !n ? 'sert tout le monde'
            : libres ? libres + ' à faire' : n + ' case' + (n > 1 ? 's' : '');
          return `<th scope="col"><span class="qf-col${libres ? ' a-remplir' : ''}"><span class="qf-col-nom">${root.OrlyIcones ? root.OrlyIcones.ico(root.OrlyIcones.icoService(c.service, this.nom(c.service))) : ''}${esc(this.nom(c.service))}</span><small>${esc(sous)}</small></span></th>`;
        }).join('')}
        <th scope="col" class="qf-fin-tete">Prête à</th></tr></thead>`;

      const par = (r && r.parClasse) || {};
      const nbCol = t.colonnes.length + 2;
      const corps = t.lignes.map(l => {
        const c = l.classe;
        const incomplete = t.colonnes.some(col => l.cases[col.service].etat === 'libre');
        const depart = (c.vols || []).map(v => v.depart).filter(Number.isFinite);
        const defaut = (etat.parcours.find(p => p.id === etat.parcoursCabine[c.cabine]) || {}).nom;
        const propre = cheminDe(etat, c.id);
        const choix = `<button class="qf-parcours${propre ? ' propre' : ''}" data-qf="aller" data-classe="${esc(c.id)}" title="Ouvrir le chemin de ${esc(P.libelleClasse(c.id))}">${
          esc(propre ? propre.nom : defaut ? 'modèle ' + defaut : 'liens de l’unité')}</button>`;
        const cases = t.colonnes.map(col => {
          const k = l.cases[col.service], s = col.service;
          const attrs = `data-qf="aller" data-classe="${esc(c.id)}" data-service="${esc(s)}"`;
          if (k.etat === 'hors') return `<td class="qf-c hors" title="${esc(P.libelleClasse(c.id))} ne passe pas par ${esc(this.nom(s))}"></td>`;
          if (k.etat === 'auto') return `<td class="qf-c auto" title="${esc(nomAt(k.ateliers[0]))} sert tout le monde">${esc(nomAt(k.ateliers[0]))}</td>`;
          if (k.etat === 'libre') return `<td class="qf-c"><button class="qf-case libre" ${attrs}
            title="Ouvrir le chemin de ${esc(P.libelleClasse(c.id))} sur ${esc(this.nom(s))}">à faire</button></td>`;
          const lot = lots.get(k.ateliers[0] + '|' + c.id);
          const h = lot && Number.isFinite(lot.debut) ? P.hhmm(lot.debut) + (Number.isFinite(lot.fin) ? '–' + P.hhmm(lot.fin) : '') : '';
          const plus = k.ateliers.length > 1 ? ' +' + (k.ateliers.length - 1) : '';
          const hors = k.etat === 'hors-fait';
          return `<td class="qf-c${hors ? ' hors' : ''}"><button class="qf-case ${hors ? 'alerte' : 'ok'}" ${attrs}
            title="${hors ? esc(P.libelleClasse(c.id)) + ' ne passe pas par ' + esc(this.nom(s)) + ' selon son chemin : ce travail n’est attendu par personne' : esc(nomAt(k.ateliers[0])) + (h ? ' · ' + h : '')}">
            <span class="qf-nom">${hors ? '⚠ ' : ''}${esc(nomAt(k.ateliers[0]))}${plus}</span>${h ? `<small>${h}</small>` : ''}</button></td>`;
        }).join('');
        const v = par[c.id] || {};
        const fin = v.absente || v.fin == null ? '<span class="qf-etat manque">pas encore prête</span>'
          : `<b>${P.hhmm(v.fin)}</b> ${v.aHeure ? '<span class="qf-etat ok">à l’heure</span>' : `<span class="qf-etat retard">+${Math.round(v.retard)} min</span>`}`;
        const suivie = this.suivies.has(c.id);
        return `<tr data-classe="${esc(c.id)}" data-incomplete="${incomplete ? 1 : 0}">
          <th scope="row"><div class="qf-id"><b><span class="puce-classe" data-cab="${esc(c.cabine)}"></span>${esc(P.libelleClasse(c.id))}</b><small>${depart.length ? 'départ ' + P.hhmm(Math.min(...depart)) + (c.pax ? ' · ' + c.pax + ' passagers' : '') : 'hors programme'}</small></div>${choix}</th>
          ${cases}
          <td class="qf-fin"><button class="qf-suivre" data-qf="suivre" data-classe="${esc(c.id)}" aria-expanded="${suivie}"
            title="${suivie ? 'Replier' : 'Suivre ' + esc(P.libelleClasse(c.id)) + ' dans le temps, étape par étape'}">${fin}<span class="qf-chevron" aria-hidden="true">${suivie ? '▾' : '▸'}</span></button></td>
        </tr>${suivie ? `<tr class="qf-temps" data-pour="${esc(c.id)}"><td colspan="${nbCol}">${this.temps(l, r)}</td></tr>` : ''}`;
      }).join('');

      return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}${barre}
        <div class="qf-scroll"><table class="qf-table">${tete}<tbody>${corps}</tbody></table></div>
        <p class="mini-note qf-vide-note" hidden>Aucune ligne ne correspond.</p>
      </section>`;
    }

    /* Une ligne dans le temps : une barre par étape, et la phrase qui l'explique. */
    temps(ligne, r) {
      const c = ligne.classe, p = ligne.parcours;
      if (!p) return '<p class="mini-note">Cette commande n’a pas de chemin : elle suit les liens de l’unité.</p>';
      const g = chronogramme(r, p, c.id);
      const v = ((r && r.parClasse) || {})[c.id] || {};
      const sautees = g.etapes.filter(e => e.absent).map(e => this.nom(e.service));
      const goulot = g.etapes.filter(e => e.attendu).sort((a, b) => b.attente - a.attente)[0];
      const phrases = [];
      if (v.fin == null) phrases.push(`<b>${esc(P.libelleClasse(c.id))}</b> n’est pas encore prête : aucune étape de son chemin n’a d’équipe.`);
      else phrases.push(`<b>${esc(P.libelleClasse(c.id))}</b> est prête à <b>${P.hhmm(v.fin)}</b>`
        + (Number.isFinite(c.echeance) ? ` pour un chargement avant <b>${P.hhmm(c.echeance)}</b>` : '')
        + (v.aHeure ? ' : <span class="qf-etat ok">à l’heure</span>.' : ` : <span class="qf-etat retard">${Math.round(v.retard)} min de retard</span>.`));
      if (goulot) phrases.push(`Le plus long à attendre : <b>${esc(this.nom(goulot.service))}</b> a attendu ${Math.round(goulot.attente)} min que <b>${esc(this.nom(goulot.attendu))}</b> finisse.`);
      // Le temps en stock : entre deux étapes, et avant le chargement.
      const sej = ((r && r.stocks && r.stocks.sejours) || []).filter(x => x.classe === c.id);
      const entre = sej.filter(x => x.vers !== 'chargement').sort((a, b) => b.duree - a.duree)[0];
      const avion = sej.find(x => x.vers === 'chargement');
      if (entre) phrases.push(`Le plus long en stock : <b>${P.dureeLisible(entre.duree)}</b> entre ${esc(this.nom(entre.de))} et ${esc(this.nom(entre.vers))}.`);
      if (avion) phrases.push(`Prête, elle attend <b>${P.dureeLisible(avion.duree)}</b> en stock avant le chargement.`);
      if (sautees.length) phrases.push(`Sans équipe, donc sautée${sautees.length > 1 ? 's' : ''} : ${sautees.map(esc).join(', ')}.`);
      const texte = `<p class="qf-phrase">${phrases.join(' ')}</p>`;
      if (g.debut == null) return texte;

      const t0 = Math.floor(Math.min(g.debut, Number.isFinite(c.echeance) ? c.echeance : g.debut) / 60) * 60;
      const t1 = Math.ceil(Math.max(g.fin, Number.isFinite(c.echeance) ? c.echeance : 0) / 60) * 60 || t0 + 60;
      const L = 1000, G = 150, H = 26, W = L - G - 44, x = t => G + (t - t0) / Math.max(1, t1 - t0) * W;
      // Repères horaires espacés d'au moins 70 px : sur une commande qui part
      // de J-1, une étiquette par heure se chevauchait. Le jour n'est écrit
      // qu'au premier repère et au changement de jour.
      const pas = [60, 120, 180, 240, 360, 720].find(p => W * p / Math.max(1, t1 - t0) >= 70) || 720;
      const heures = []; for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas) heures.push(t);
      const jourDe = t => Math.floor(t / 1440);
      const repere = (t, i) => i === 0 || jourDe(t) !== jourDe(heures[i - 1]) ? P.hhmm(t) : P.hhmm(t - jourDe(t) * 1440);
      const lignes = g.etapes.map((e, i) => {
        const y = 24 + i * (H + 4);
        const saute = e.absent || e.debut == null;
        const note = e.commun ? ' · sert tout le monde' : saute ? ' · sautée, sans équipe' : '';
        const lab = `<text class="qf-t-svc${saute ? ' saute' : ''}" x="4" y="${y + 13}">${esc(this.nom(e.service))}</text>
          <text class="qf-t-br" x="4" y="${y + 24}">${esc(this.groupe(e.branche))}${note}</text>`;
        if (saute) return lab + `<line class="qf-t-vide" x1="${G}" y1="${y + H / 2}" x2="${G + W}" y2="${y + H / 2}"/>`;
        // Ce qui l'attendait en stock, livré par les étapes d'avant, jusqu'à son début.
        const stock = sej.filter(x => x.vers === e.service);
        const depuis = stock.length ? Math.min(...stock.map(x => x.entree)) : null;
        const barreStock = depuis != null && e.debut > depuis
          ? `<rect class="qf-t-stock" x="${x(depuis)}" y="${y + H - 7}" width="${Math.max(2, x(e.debut) - x(depuis))}" height="5" rx="2"><title>En stock depuis ${P.hhmm(depuis)} (${stock.map(k => esc(this.nom(k.de))).join(', ')}) : ${P.dureeLisible(e.debut - depuis)}</title></rect>` : '';
        if (e.dispo) return lab + `<rect class="qf-t-dispo" x="${x(e.debut) - 2}" y="${y + 4}" width="4" height="${H - 8}"><title>${esc(this.nom(e.service))} : disponible</title></rect>`;
        const fin = e.fin == null ? t1 : e.fin, w = Math.max(3, x(fin) - x(e.debut));
        const nomAt = (this.atelier(e.atelier) || {}).nom || '';
        const etiquette = nomAt + ' · ' + P.hhmm(e.debut) + '–' + (e.fin == null ? '…' : P.hhmm(e.fin));
        return lab + barreStock
          + (e.attente > 0 ? `<rect class="qf-t-attente" x="${x(e.debut - e.attente)}" y="${y + 8}" width="${Math.max(1, x(e.debut) - x(e.debut - e.attente))}" height="${H - 16}"><title>Attend ${e.attendu ? esc(this.nom(e.attendu)) : 'ses amonts'} : ${Math.round(e.attente)} min</title></rect>` : '')
          + `<rect class="qf-t-lot${e.fin == null ? ' inacheve' : ''}" x="${x(e.debut)}" y="${y + 2}" width="${w}" height="${H - 4}" rx="4"><title>${esc(this.nom(e.service))} — ${esc(etiquette)}</title></rect>`
          // L'étiquette entière dans la barre si elle y tient, sinon juste après.
          + (etiquette.length * 6 + 12 < w ? `<text class="qf-t-txt" x="${x(e.debut) + 6}" y="${y + 17}">${esc(etiquette)}</text>`
            : `<text class="qf-t-txt dehors" x="${x(e.debut) + w + 4}" y="${y + 17}">${esc(etiquette)}</text>`);
      }).join('');
      const haut = 24 + g.etapes.length * (H + 4);
      const ech = Number.isFinite(c.echeance) ? `<line class="qf-t-echeance" x1="${x(c.echeance)}" y1="16" x2="${x(c.echeance)}" y2="${haut + 4}"/>
        <text class="qf-t-echeance-txt" x="${x(c.echeance)}" y="${haut + 16}" text-anchor="middle">chargement ${P.hhmm(c.echeance)}</text>` : '';
      return texte + `<svg class="qf-t" viewBox="0 0 ${L} ${haut + 20}" role="img" aria-label="${esc(P.libelleClasse(c.id))} dans le temps, étape par étape">
        ${heures.map((t, i) => `<line class="qf-t-grille" x1="${x(t)}" y1="16" x2="${x(t)}" y2="${haut}"/><text class="qf-t-heure" x="${x(t) + 2}" y="12">${repere(t, i)}</text>`).join('')}
        ${lignes}${ech}</svg>
        <p class="qf-t-legende"><span class="qf-l ok">travail</span><span class="qf-l attente">attente de l’étape d’avant</span><span class="qf-l stock">en stock</span><span class="qf-l echeance">heure de chargement</span></p>`;
    }

    filtrer() {
      const boite = this.a.boite(), q = this.recherche.trim().toUpperCase();
      let visibles = 0;
      for (const tr of boite.querySelectorAll('.qf-table tbody tr[data-classe]')) {
        const cache = (q && !tr.dataset.classe.toUpperCase().includes(q)) || (this.incompletes && tr.dataset.incomplete !== '1');
        tr.hidden = !!cache; if (!cache) visibles++;
        const t = tr.nextElementSibling;
        if (t && t.classList.contains('qf-temps')) t.hidden = !!cache;
      }
      const note = boite.querySelector('.qf-vide-note');
      if (note) note.hidden = visibles > 0;
    }

    /* ---- gestes ------------------------------------------------------ */

    cliquer(e) {
      const q = e.target.closest('[data-qf]');
      if (q && q.tagName !== 'INPUT') return this.geste(q);
      const b = e.target.closest('[data-pc-action]'); if (!b) return;
      const action = b.dataset.pcAction, s = b.dataset.service;
      const etat = this.a.etat(), classes = this.a.classes();
      const p = this.parcoursActif(etat), pid = p && p.id;
      const trouver = x => x.parcours.find(y => y.id === pid);
      if (action === 'cmd') { this.cmd = b.dataset.classe; this.actif = null; this.sel = null; this.svc = ''; this.depuis = undefined; return this.rendre(); }
      if (action === 'modele') { this.cmd = null; this.actif = b.dataset.parcours; this.sel = null; this.svc = ''; return this.rendre(); }
      if (action === 'fermer') return this.fermer();
      if (action === 'reorganiser') return this.diagramme() && this.diagramme().reorganiser();
      if (action === 'relier-depuis') return this.diagramme() && this.diagramme().relierDepuis(s);
      if (action === 'lien-retirer') return this.retirerLien(b.dataset.lien);
      if (action === 'modele-ajouter') {
        const id = uid();
        this.cmd = null; this.actif = id; this.sel = null; this.svc = '';
        return this.a.changer(x => { x.parcours.push({ id, nom: 'Nouveau modèle', noeuds: [], liens: [], prepa: true }); },
          'Modèle créé : ajoutez ses services, puis reliez-les. Il sert aux commandes sans chemin des classes qui le choisissent.');
      }
      if (action === 'types') {
        const t = parcoursTypes(this.a.services().map(x => x.id));
        return this.a.changer(x => { Object.assign(x, t); }, 'Modèles types créés.');
      }
      if (action === 'creer') {
        const cible = b.dataset.classe, modele = (etat.parcours || []).find(x => x.id === (etat.parcoursCabine || {})[cible.split('/').pop()]);
        const source = this.depuis !== undefined ? this.depuis : (modele ? modele.id : '');
        const memes = !!(this.a.boite().querySelector('[data-pc="memes-cases"]') || {}).checked;
        let res = null;
        this.depuis = undefined; this.svc = '';
        this.a.changer(x => { res = creerChemin(x, cible, source, memes, null, { nomDe: s => this.nom(s), classes }); },
          'Chemin de ' + this.lib(cible) + ' créé : chaque service a sa case. Cliquez un service pour régler la sienne (personnes, heure, man-minutes).');
        if (res) this.copierDisposition(source, res.chemin.id);
        if (res && res.cases) this.dire('Chemin de ' + this.lib(cible) + ' créé, dans les mêmes cases que ' + this.lib(commandeDu(this.a.etat(), source) || '')
          + ' (' + res.cases + (res.cases > 1 ? ' cases' : ' case') + ', à la suite). Réglez-les en cliquant les services.');
        return;
      }
      if (action === 'dupliquer') {
        const boite = b.closest('.pc-dup');
        const cibles = [...boite.querySelectorAll('[data-pc="dup-cible"]:checked')].map(x => x.value);
        if (!cibles.length) return this.dire('Cochez au moins une commande.');
        const memes = !!(boite.querySelector('[data-pc="memes-cases"]') || {}).checked;
        const faits = [], source = this.cmd;
        this.a.changer(x => {
          for (const c of cibles) {
            const r = creerChemin(x, c, pid, memes, [source, ...faits], { nomDe: y => this.nom(y), classes });
            this.copierDisposition(pid, r.chemin.id);
            faits.push(c);
          }
        }, (cibles.length > 1 ? cibles.length + ' chemins créés' : 'Chemin créé') + ' : ' + cibles.map(etiquette).join(', ')
          + (memes ? ', dans les mêmes cases, à la suite de ' + etiquette(source) : '') + '.');
        return;
      }
      if (action === 'parcours-retirer') {
        if (this.cmd) {
          if (!confirm('Supprimer le chemin de ' + this.lib(this.cmd) + ' ? Les cases qui ne préparent qu’elle disparaissent avec lui ; elle suit de nouveau le modèle de sa classe. L’action est annulable.')) return;
        } else if (!confirm('Supprimer le modèle « ' + (p ? p.nom : '') + ' » ? Les commandes sans chemin qui le suivaient retomberont sur les liens de l’unité. L’action est annulable.')) return;
        this.sel = null; this.svc = ''; if (!this.cmd) this.actif = null;
        const cmd = this.cmd;
        return this.a.changer(x => {
          // Les cases propres du chemin (qui ne préparent que cette commande)
          // partent avec lui ; une case partagée reste telle quelle.
          if (cmd && p) {
            const dedans = new Set(P.servicesDuParcours(p));
            x.ateliers = x.ateliers.filter(a => !(fabrique(a) && dedans.has(a.service) && a.lots.length
              && a.lots.every(l => l.every(id => id === cmd))));
          }
          x.parcours = x.parcours.filter(y => y.id !== pid);
          for (const c of Object.keys(x.parcoursCabine)) if (x.parcoursCabine[c] === pid) delete x.parcoursCabine[c];
          for (const c of Object.keys(x.parcoursClasse)) if (x.parcoursClasse[c] === pid) delete x.parcoursClasse[c];
        }, this.cmd ? 'Chemin de ' + this.lib(this.cmd) + ' supprimé.' : 'Modèle supprimé.');
      }
      if (action === 'noeud-retirer') {
        this.sel = null; if (this.svc === s) this.svc = '';
        const cmd = this.cmd;
        return this.a.changer(x => {
          const q = trouver(x);
          q.noeuds = q.noeuds.filter(y => y !== s);
          q.liens = q.liens.filter(l => l.de !== s && l.vers !== s);
          // Sur le chemin d'une commande, elle quitte aussi sa case dans ce service :
          // sinon ce travail serait compté sans que personne ne l'attende. Une case
          // qui ne préparait qu'elle s'en va ; une case partagée reste.
          if (cmd) {
            const seule = a => a.service === s && fabrique(a) && a.lots.length && a.lots.every(l => l.every(id => id === cmd));
            x.ateliers = x.ateliers.filter(a => !seule(a));
            affecter(x, s, [cmd], null);
          }
        }, this.nom(s) + ' quitte ce chemin, avec ses liens' + (cmd ? ' et la case de ' + this.lib(cmd) + ' dans ce service' : '') + '. Vous pouvez annuler.');
      }
    }

    /** Un chemin copié garde la disposition de son modèle : on s'y retrouve. */
    copierDisposition(de, vers) {
      const G = root.OrlyGraphe; if (!G || !de) return;
      const pos = G.lirePositions()['chemin:' + de];
      if (pos) G.ecrirePositions('chemin:' + vers, pos);
    }

    geste(q) {
      const quoi = q.dataset.qf;
      if (quoi === 'aller') return this.ouvrir(q.dataset.classe, q.dataset.service);
      if (quoi === 'suivre') {
        const id = q.dataset.classe;
        if (this.suivies.has(id)) this.suivies.delete(id); else this.suivies.add(id);
        return this.rendre();
      }
    }

    saisir(e) {
      const el = e.target;
      if (el.dataset.qf === 'incompletes') { this.incompletes = el.checked; return this.filtrer(); }
      const champ = el.dataset.pcChamp; if (!champ) return;
      const p = this.parcoursActif(this.a.etat()), pid = p && p.id;
      const v = el.value;
      if (champ === 'creer-depuis') { this.depuis = v; return setTimeout(() => this.rendre(), 0); }
      if (champ === 'noeud-ajout' && !v) return;
      if (champ === 'case') return setTimeout(() => this.choisirCase(el.dataset.service, v), 0);
      // Laisser le `change` se terminer avant de redessiner : sinon le champ
      // qu'on quitte est arraché pendant son propre événement.
      setTimeout(() => this.a.changer(etat => {
        const q = etat.parcours.find(x => x.id === pid);
        if (champ === 'cabine') { if (v) etat.parcoursCabine[el.dataset.cabine] = v; else delete etat.parcoursCabine[el.dataset.cabine]; }
        else if (champ === 'nom') {
          // Le nom d'un chemin est sa clé dans Excel : deux chemins ne le partagent pas.
          if (etat.parcours.some(x => x.id !== pid && String(x.nom).trim().toUpperCase() === String(v).trim().toUpperCase()))
            throw new Error('le nom « ' + v + ' » est déjà celui d’un autre chemin (le nom sert de clé dans Excel).');
          q.nom = v;
        }
        else if (champ === 'noeud-ajout' && !q.noeuds.includes(v)) {
          q.noeuds.push(v); this.sel = null; this.svc = '';
          if (this.cmd) donnerCases(etat, this.cmd, q, [v], y => this.nom(y), this.a.classes());
        }
      }, champ === 'noeud-ajout' ? this.nom(v) + ' ajouté au chemin, avec sa case : tirez un trait depuis ou vers lui, cliquez-le pour régler sa case.' : 'Chemin enregistré.'), 0);
    }

    /** La case de la commande dans ce service : aucune, une existante (à la suite), ou une nouvelle. */
    choisirCase(s, v) {
      const cmd = this.cmd, classes = this.a.classes(), lib = this.lib(cmd);
      if (!cmd) return;
      this.svc = s;
      if (!v) return this.a.changer(etat => { affecter(etat, s, [cmd], null, classes); },
        lib + ' n’a plus de case en ' + this.nom(s) + ' : l’étape sera sautée.');
      if (v === '+') {
        let cree = null;
        return this.a.changer(etat => {
          cree = nouvelleEquipe(etat, s, this.nom(s), [], classes);
          cree.nom = nomLibre(etat, this.nom(s) + ' ' + etiquette(cmd));
          affecter(etat, s, [cmd], cree.id, classes);
        }, 'Case créée pour ' + lib + ' : réglez ses personnes et son heure ci-dessous.');
      }
      const a = this.atelier(v);
      return this.a.changer(etat => { affecter(etat, s, [cmd], v, classes); },
        lib + ' rejoint la case « ' + (a ? a.nom : '') + ' », à la suite de ses commandes. Changez l’ordre dans la case si besoin.');
    }
  }


  const api = { insererPrepa, depuisBranches, creeBoucle, parcoursTypes, validerParcours, etapesOrdonnees, couverture, confier, nouvelleEquipe,
    completer, colonnes, tableau, affecter, chronogramme, etiquette, cheminDe, commandeDu, modeles, caseDe, creerChemin, donnerCases, completerCases, nomLibre, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
