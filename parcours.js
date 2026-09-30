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
    const nettoyer = ({ branches, ...p }) => ({ ...p, ...depuisBranches(branches.filter(b => b.services.length >= 2)), prepa: true, type: true });
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
      return { id, nom: texte(p.nom, 80) || 'Parcours', noeuds, liens, ...(p.prepa ? { prepa: true } : {}), ...(p.cases ? { cases: true } : {}),
        ...(p.type ? { type: true } : {}), ...(p.auto ? { auto: true } : {}) };
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
    marquerTypes({ parcours, parcoursCabine, parcoursClasse });
    return { parcours, parcoursCabine, parcoursClasse, crees: false };
  }

  /**
   * Un flux de production (« type ») est partagé : c'est le flux d'une classe,
   * celui de plusieurs commandes, ou celui d'aucune (un modèle en réserve). Un
   * chemin désigné par une seule commande est son chemin propre, une exception.
   * Modifie les parcours ; renvoie le nombre de flux.
   */
  function marquerTypes(etat) {
    const par = new Map();
    for (const v of Object.values(etat.parcoursClasse || {})) par.set(v, (par.get(v) || 0) + 1);
    const classe = new Set(Object.values(etat.parcoursCabine || {}));
    let n = 0;
    for (const p of etat.parcours || []) {
      if (classe.has(p.id) || (par.get(p.id) || 0) !== 1) p.type = true;
      if (p.type) n++;
    }
    return n;
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
  /* Ce qui vient de se passer (« Enregistré. », « Case créée… ») : dans la
   * ligne d'état de la vue et au-dessus du diagramme des chemins. Un message
   * s'efface de lui-même : resté affiché, il se lisait encore des pages plus
   * loin, dans les résultats, comme s'il parlait d'eux (audit du 29/09). */
  let minuterie = null;
  function annoncer(t) {
    if (typeof document === 'undefined') return;
    const texte = t || '';
    const s = document.getElementById('at-status'); if (s) s.textContent = texte;
    for (const m of document.querySelectorAll('.pc-message')) m.textContent = texte;
    clearTimeout(minuterie);
    if (texte) minuterie = setTimeout(() => annoncer(''), Math.min(10000, 5000 + texte.length * 20));
  }
  /* Deux étapes fusionnées, à la chaîne (retour d'usage du 29/09) : la case
   * d'un service (le Montage) fait aussi l'étape d'avant (la Prépa) pour ses
   * commandes. Pour ces commandes, l'étape d'avant n'est pas « à faire » :
   * elle est faite, par cette case. */
  function fusionneePar(etat, service, cmd) {
    return (etat.ateliers || []).find(a => (a.type === 'manuel' || !a.type) && a.fusion === service && a.service !== service
      && (a.lots || []).some(l => l.includes(cmd))) || null;
  }

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
        const lavage = equipes.some(a => a.type === 'lavage'), dispo = equipes.some(a => a.type === 'dispo' || a.type === 'handling');
        const parClasse = cls.map(c => ({ id: c.id,
          atelier: (fab.find(a => (a.lots || []).some(l => l.includes(c.id))) || fusionneePar(etat, service, c.id) || {}).id || null }));
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
        const fu = !font.length && passe ? fusionneePar(etat, s, c.id) : null;
        cases[s] = !passe ? { etat: font.length ? 'hors-fait' : 'hors', ateliers: font }
          : font.length ? { etat: 'equipe', ateliers: font }
          : fu ? { etat: 'equipe', ateliers: [fu.id], fusion: fu.service }
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
      // Au handling, la commande part avec son premier vol : c'est lui qu'on montre.
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
    const p = id ? (etat.parcours || []).find(x => x.id === id) || null : null;
    // Un flux partagé n'est le chemin propre de personne : le modifier pour une
    // commande le modifierait pour toutes.
    return p && !p.type ? p : null;
  }

  /** Le flux de production qu'une commande suit : le sien désigné, sinon celui de sa classe. */
  function typeSuivi(etat, c) {
    const id = typeof c === 'string' ? c : c.id;
    const cab = typeof c === 'string' ? c.slice(c.lastIndexOf('/') + 1) : c.cabine;
    const trouve = x => (x ? (etat.parcours || []).find(p => p.id === x) || null : null);
    const propre = trouve((etat.parcoursClasse || {})[id]);
    if (propre && propre.type) return propre;
    return trouve((etat.parcoursCabine || {})[cab]);
  }

  /** Par où passe une commande : son chemin propre s'il en a un, sinon son flux. */
  function fluxDe(etat, c) {
    const id = typeof c === 'string' ? c : c.id;
    return cheminDe(etat, id) || typeSuivi(etat, c);
  }

  /** La commande dont ce chemin est le chemin propre, ou rien. */
  function commandeDu(etat, pid) {
    const p = (etat.parcours || []).find(x => x.id === pid);
    if (p && p.type) return null;
    return Object.keys(etat.parcoursClasse || {}).find(k => etat.parcoursClasse[k] === pid) || null;
  }

  /** Les modèles : les chemins d'une classe, ou ceux qui ne sont le chemin d'aucune commande. */
  function modeles(etat) {
    const pris = new Set(Object.values(etat.parcoursClasse || {}));
    const classe = new Set(Object.values(etat.parcoursCabine || {}));
    return (etat.parcours || []).filter(p => p.type || classe.has(p.id) || !pris.has(p.id));
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
      if (caseDe(etat, s, cmd) || fusionneePar(etat, s, cmd)) continue;
      if (s === 'handling') {
        // Le handling charge les vols de toutes les commandes : un seul, partagé.
        etat.ateliers.push(caseHandling(etat, s, nom(s)));
      } else if (estDispo(etat, s)) {
        // La légumerie, le magasin : une seule case, qui sert toutes les commandes.
        etat.ateliers.push(caseDispo(etat, s, nom(s)));
      } else if (s === 'plonge') {
        etat.ateliers.push({ id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          nom: nomLibre(etat, nom(s)), service: s, type: 'lavage', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [],
          regime: { actif: true }, plafond: 0, tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }] });
      } else if ((etat.ateliers || []).some(a => a.service === s && a.type === 'robot') || /robot/i.test(nom(s))) {
        // Un robot est une machine : les commandes le rejoignent, à la suite.
        let r = (etat.ateliers || []).find(a => a.service === s && a.type === 'robot');
        if (!r) { r = caseRobot(etat, s, nom(s)); etat.ateliers.push(r); }
        affecter(etat, s, [cmd], r.id, classes);
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

  /* ----------------------------------------------------------------------
   *  LES POSTES QUI METTENT À DISPOSITION (retour d'usage du 28/09)
   *  La légumerie, le magasin, la réception travaillent pour TOUTES les
   *  commandes à la fois, par vagues : une seule case, partagée, et sur chaque
   *  chemin une seule question — « besoin de légumerie ? ».
   * --------------------------------------------------------------------*/
  const SERVICES_DISPO = ['decontam', 'magasin', 'appros'];
  // Seuls ces postes-là. La cuisine, la prépa, le montage préparent commande
  // par commande, même si une de leurs cases est réglée en mise à disposition :
  // on ne les fond jamais.
  const estDispo = (etat, s) => SERVICES_DISPO.includes(s);

  /** Une case de mise à disposition neuve : elle sert toutes les commandes. */
  function caseDispo(etat, service, nomService) {
    return { id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      nom: nomLibre(etat, nomService || service), service, type: 'dispo', debut: '06:00', jour: 0, personnes: 0, pauses: [], lots: [],
      regime: { actif: true }, permanent: true };
  }

  /**
   * Ce qu'il reste à fondre, poste par poste : des cases qui préparent
   * commande par commande (« Légumerie AF BC »…), ou plusieurs mises à
   * disposition dans le même poste. Un poste = une case.
   * @returns Map service → [cases]
   */
  function aFondre(etat) {
    const par = new Map();
    for (const a of etat.ateliers || []) {
      if (!estDispo(etat, a.service) || !(fabrique(a) || a.type === 'dispo')) continue;
      if (!par.has(a.service)) par.set(a.service, []);
      par.get(a.service).push(a);
    }
    for (const [s, l] of [...par]) if (!l.some(fabrique) && l.length < 2) par.delete(s);
    return par;
  }

  /** Les cases d'avant dans les postes de mise à disposition. */
  function anciensDispos(etat) { return [...aFondre(etat).values()].flat(); }

  /**
   * Chaque poste de mise à disposition (légumerie, magasin, réception…) n'a
   * plus qu'UNE case, partagée. Les heures de début des cases qui préparaient
   * commande par commande, et les vagues des mises à disposition, deviennent
   * ses vagues ; si toutes étaient permanentes, elle l'est. Les chemins ne
   * changent pas : leur nœud est servi par cette case.
   * @returns {{ converties:number, services:[id] }}
   */
  function partagerDispos(etat, nomDe) {
    const cle = v => (v.jour || 0) * 1440 + P.minutes(v.debut);
    const par = aFondre(etat);
    let converties = 0;
    for (const [s, liste] of par) {
      converties += liste.length;
      const vues = new Map();
      for (const a of liste) {
        const vs = fabrique(a) ? [{ debut: a.debut, jour: a.jour || 0 }]
          : a.permanent === false ? (a.vagues && a.vagues.length ? a.vagues : [{ debut: a.debut, jour: a.jour || 0 }]) : [];
        for (const v of vs) vues.set(cle(v), { debut: v.debut, jour: v.jour || 0 });
      }
      const garde = liste.find(a => a.type === 'dispo');
      etat.ateliers = etat.ateliers.filter(a => !liste.includes(a));
      const d = caseDispo(etat, s, nomDe ? nomDe(s) : s);
      if (garde) d.id = garde.id;
      if (vues.size) {
        d.permanent = false;
        d.vagues = [...vues.values()].sort((x, y) => cle(x) - cle(y));
        d.debut = d.vagues[0].debut; d.jour = d.vagues[0].jour;
      }
      etat.ateliers.push(d);
    }
    return { converties, services: [...par.keys()] };
  }

  /**
   * L'inverse, pour un service qui prépare commande par commande (la cuisine)
   * et qu'une mise à disposition a remplacé : une case par commande dont le
   * chemin passe par lui, à l'heure de sa première vague. Effectif, man-minutes
   * et heures propres sont à reprendre (ou à réimporter : ⇧ Horaires).
   * @returns {number} le nombre de cases créées
   */
  function separerParCommande(etat, service, nomService, classes) {
    const dispos = (etat.ateliers || []).filter(a => a.service === service && a.type === 'dispo');
    if (!dispos.length) return 0;
    const d = dispos[0];
    const v = d.permanent === false && Array.isArray(d.vagues) && d.vagues.length ? d.vagues[0] : { debut: d.debut || '06:00', jour: d.jour || 0 };
    const cheminDeLa = c => fluxDe(etat, c);
    const cmds = (classes || []).filter(c => { const p = cheminDeLa(c); return p && P.servicesDuParcours(p).includes(service); }).map(c => c.id);
    etat.ateliers = etat.ateliers.filter(a => !dispos.includes(a));
    for (const cmd of cmds) {
      const a = nouvelleEquipe(etat, service, nomService, [], classes);
      a.nom = nomLibre(etat, (nomService || service) + ' ' + etiquette(cmd));
      a.debut = v.debut; a.jour = v.jour || 0;
      affecter(etat, service, [cmd], a.id, classes);
    }
    return cmds.length;
  }

  /**
   * « Besoin de légumerie » sur un chemin : le service y entre, relié comme sur
   * les autres chemins qui passent par lui (sinon comme sur les modèles types),
   * et la commande est servie par la case partagée.
   */
  function ajouterBesoin(etat, p, s, cmd, nomDe, classes) {
    if (!Array.isArray(p.noeuds) || p.noeuds.includes(s)) return false;
    const dedans = new Set(P.servicesDuParcours(p));
    // Le graphe de référence : les autres chemins, puis les modèles types. On y
    // cherche, dans chaque sens, les premiers services présents sur CE chemin —
    // en enjambant ceux qui n'y sont pas (la légumerie livre la cuisine ; sans
    // cuisine sur le chemin, elle livre ce qui vient après).
    const tous = (etat.parcours || []).filter(q => q !== p).flatMap(q => P.arcsDuParcours(q))
      .concat(parcoursTypes().parcours.flatMap(q => P.arcsDuParcours(q)));
    const proches = (sens) => {
      const vus = new Set([s]), trouves = new Set();
      let front = [s];
      while (front.length) {
        const suite = [];
        for (const x of front) for (const a of tous) {
          const y = sens > 0 ? (a.from === x ? a.to : null) : (a.to === x ? a.from : null);
          if (!y || vus.has(y)) continue; vus.add(y);
          if (dedans.has(y)) trouves.add(y); else suite.push(y);
        }
        front = suite;
      }
      return [...trouves];
    };
    const arcs = proches(-1).map(x => ({ from: x, to: s })).concat(proches(1).map(x => ({ from: s, to: x })));
    p.noeuds.push(s);
    p.liens = Array.isArray(p.liens) ? p.liens : [];
    for (const a of arcs) if (!p.liens.some(l => l.de === a.from && l.vers === a.to)) p.liens.push({ de: a.from, vers: a.to });
    if (cmd) donnerCases(etat, cmd, p, [s], nomDe, classes);
    return true;
  }

  /** Une case robot neuve : un débit (plateaux/h), un effectif minimum pour tourner. */
  function caseRobot(etat, service, nomService, debut) {
    return { id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      nom: nomLibre(etat, nomService || service), service, type: 'robot', debut: debut || '05:00', jour: 0, personnes: 2,
      personnesMin: 1, debit: 320, pauses: [], lots: [], regime: { actif: true } };
  }

  /**
   * Une étape remplacée par une autre sur le chemin de quelques commandes —
   * le Montage par le Robot pour TX, CRL et FBU Économie (28/09). Les liens
   * suivent ; la commande quitte ses cases de l'ancienne étape (une case qui ne
   * préparait qu'elle s'en va) et rejoint le robot, dans l'ordre des échéances.
   * Une commande qui suivait un modèle reçoit son propre chemin, copié du modèle.
   * @returns {[id]} les commandes changées
   */
  function remplacerEtape(etat, de, vers, cmds, classes, nomVers, nomDe) {
    const faites = [];
    let debut = null;
    for (const cmd of cmds) {
      const c = (classes || []).find(x => x.id === cmd); if (!c) continue;
      const remplacer = p => {
        p.noeuds = [...new Set((p.noeuds || []).map(s => (s === de ? vers : s)))];
        const vus = new Set();
        p.liens = (p.liens || []).map(l => ({ de: l.de === de ? vers : l.de, vers: l.vers === de ? vers : l.vers }))
          .filter(l => l.de !== l.vers && !vus.has(l.de + '>' + l.vers) && vus.add(l.de + '>' + l.vers));
      };
      const p = cheminDe(etat, cmd);
      if (p) {
        if (!P.servicesDuParcours(p).includes(de)) continue;
        remplacer(p);
      } else {
        // Elle suit un flux partagé : elle passe à sa variante (« Sans cuisine
        // + Robot sans Montage »), la même pour toutes celles qui s'écartent pareil.
        marquerTypes(etat);
        const t = typeSuivi(etat, c);
        if (!t || !P.servicesDuParcours(t).includes(de)) continue;
        const essai = { noeuds: P.servicesDuParcours(t).slice(), liens: P.arcsDuParcours(t).map(a => ({ de: a.from, vers: a.to })) };
        remplacer(essai);
        const sig = signature(essai);
        let v = types(etat).find(x => signature(x) === sig);
        if (!v) v = nouveauType(etat, nomVariante(etat, t, essai, s => (s === vers ? (nomVers || s) : nomDe ? nomDe(s) : s)), essai, { auto: true });
        assignerType(etat, cmd, v.id);
      }
      const ancienne = (etat.ateliers || []).find(a => a.service === de && fabrique(a) && a.lots.some(l => l.includes(cmd)));
      if (ancienne && debut == null) debut = ancienne.debut;
      etat.ateliers = etat.ateliers.filter(a => !(a.service === de && fabrique(a) && a.lots.length && a.lots.every(l => l.every(id => id === cmd))));
      affecter(etat, de, [cmd], null);
      // L'ancienne case vers la nouvelle étape, s'il y en avait une par commande, s'efface aussi.
      etat.ateliers = etat.ateliers.filter(a => !(a.service === vers && a.type !== 'robot' && fabrique(a) && a.lots.length && a.lots.every(l => l.every(id => id === cmd))));
      faites.push(cmd);
    }
    if (!faites.length) return faites;
    let r = etat.ateliers.find(a => a.service === vers && a.type === 'robot');
    if (!r) { r = caseRobot(etat, vers, nomVers, debut); etat.ateliers.push(r); }
    affecter(etat, vers, faites, r.id, classes);
    return faites;
  }

  /** Une case handling neuve : elle charge les vols de toutes les commandes. */
  function caseHandling(etat, service, nomService) {
    return { id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      nom: nomLibre(etat, nomService || service), service, type: 'handling', debut: '04:00', jour: 0, personnes: 4, pauses: [], lots: [],
      regime: { actif: true }, durees: { [P.TOUTES]: 30 }, simultanes: 3, avance: P.AVANCE_HANDLING, compagnies: [] };
  }

  /** Les cases de handling d'avant (28/09) : une par commande, qui préparaient
   *  comme n'importe quel service. `services` : les services de handling. */
  function anciensHandlings(etat, services) {
    const s = new Set(services || ['handling']);
    return (etat.ateliers || []).filter(a => s.has(a.service) && (a.type === 'manuel' || a.type === 'robot'));
  }

  /**
   * Le handling en un geste.
   *
   *   1. Les cases de handling d'avant, une par commande, deviennent UNE case
   *      Handling par service : elle arrive à l'heure de la plus matinale
   *      (au plus tôt 00:00 du jour J), avec l'effectif le plus grand. Les
   *      chemins qui passaient par elles n'ont pas à changer.
   *   2. Sans aucun handling : sa case est créée.
   *   3. Chaque chemin qui ne passe par aucun handling le reçoit à son bout,
   *      relié à sa DERNIÈRE étape — celles qui livrent sans être livrées.
   *
   * @param services les services de handling (le service du plan, et ceux que
   *   l'utilisateur a créés sous ce nom) ; `service` d'abord.
   * @returns {{ cree:boolean, converties:number, chemins:number, atelier }}
   */
  function brancherHandling(etat, service, nomService, services) {
    const tous = [...new Set([service].concat(services || []))];
    const debutDe = a => (a.jour || 0) * 1440 + P.minutes(a.debut || '06:00');
    let converties = 0;
    for (const s of tous) {
      const vieilles = anciensHandlings(etat, [s]).sort((x, y) => debutDe(x) - debutDe(y));
      if (!vieilles.length) continue;
      converties += vieilles.length;
      const deja = etat.ateliers.find(a => a.service === s && a.type === 'handling');
      const retirer = new Set((deja ? vieilles : vieilles.slice(1)).map(a => a.id));
      etat.ateliers = etat.ateliers.filter(a => !retirer.has(a.id));
      if (deja) continue;
      const garde = vieilles[0], neuve = caseHandling(etat, s, nomService);
      const personnes = Math.max(...vieilles.map(a => +a.personnes || 0), 1);
      for (const k of ['lots', 'minutes', 'materiel', 'debit', 'personnesMin']) delete garde[k];
      Object.assign(garde, { type: 'handling', lots: [], jour: 0, debut: (garde.jour || 0) < 0 ? '00:00' : garde.debut, personnes,
        durees: neuve.durees, simultanes: neuve.simultanes, avance: neuve.avance, compagnies: [] });
      garde.nom = nomLibre({ ateliers: etat.ateliers.filter(a => a !== garde) }, nomService || s);
    }
    let atelier = (etat.ateliers || []).find(a => a.type === 'handling');
    const cree = !atelier;
    if (cree) { atelier = caseHandling(etat, service, nomService); etat.ateliers.push(atelier); }
    const s = atelier.service;
    let chemins = 0;
    for (const p of (etat.parcours || [])) {
      if (!Array.isArray(p.noeuds) || tous.some(x => p.noeuds.includes(x))) continue;
      const arcs = P.arcsDuParcours(p);
      const fins = p.noeuds.filter(n => arcs.some(a => a.to === n) && !arcs.some(a => a.from === n));
      p.noeuds.push(s);
      p.liens = Array.isArray(p.liens) ? p.liens : [];
      for (const f of fins) p.liens.push({ de: f, vers: s });
      chemins++;
    }
    return { cree, converties, chemins, atelier };
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
   *  LA GRILLE À COCHER (Mon unité › Services, 29/09)
   *
   *  Quelqu'un qui connaît l'unité ne pense pas en « chemins » : il sait
   *  quelle équipe prépare quoi. On coche donc, équipe par équipe, les
   *  commandes qu'elle prépare ; le chemin de chaque commande suit tout seul.
   *  Cocher fait entrer le service dans le chemin, à sa place (entre ceux qui
   *  le livrent et ceux qu'il livre, lus sur les autres chemins, les modèles
   *  types puis les liens de l'unité) ; décocher la dernière équipe l'en fait
   *  sortir, et ceux qui le livraient livrent ceux qu'il livrait.
   * ====================================================================*/

  /** Le chemin propre d'une commande, créé au besoin : une copie de son modèle, sans créer de case. */
  function cheminPropre(etat, cmd, classes) {
    const deja = cheminDe(etat, cmd); if (deja) return deja;
    etat.parcours = etat.parcours || []; etat.parcoursClasse = etat.parcoursClasse || {};
    const c = (classes || []).find(x => x.id === cmd) || { id: cmd, cabine: String(cmd).slice(String(cmd).lastIndexOf('/') + 1) };
    const modele = parcoursDe(etat, c);
    // `cases` : les cases viennent des coches, pas de la création du chemin.
    const p = { id: uid(), nom: nomDeChemin(etat, etiquette(cmd)),
      noeuds: modele ? P.servicesDuParcours(modele).slice() : [],
      liens: modele ? P.arcsDuParcours(modele).map(a => ({ de: a.from, vers: a.to })) : [], prepa: true, cases: true };
    etat.parcours.push(p);
    etat.parcoursClasse[cmd] = p.id;
    return p;
  }

  /* Ceux qui livrent `s` et ceux qu'il livre, parmi les services du chemin,
   * d'après un graphe de référence : on enjambe ceux qui n'y sont pas. */
  function voisinsDans(arcs, s, dedans) {
    const cherche = sens => {
      const vus = new Set([s]), trouves = [];
      let front = [s];
      while (front.length) {
        const suite = [];
        for (const x of front) for (const a of arcs) {
          const y = sens > 0 ? (a.from === x ? a.to : null) : (a.to === x ? a.from : null);
          if (!y || vus.has(y)) continue; vus.add(y);
          if (dedans.has(y)) trouves.push(y); else suite.push(y);
        }
        front = suite;
      }
      return trouves;
    };
    return { avant: cherche(-1), apres: cherche(1) };
  }

  /**
   * Fait entrer un service dans un chemin, à sa place. `o.liaisons` : les liens
   * de l'unité ({from,to}) ; `o.parent(id)` : le service dont une salle annexe
   * dépend (elle se place comme lui). Jamais de boucle.
   * @returns {boolean} le chemin a changé
   */
  function insererService(etat, p, s, o = {}) {
    p.noeuds = Array.isArray(p.noeuds) ? p.noeuds : [];
    p.liens = Array.isArray(p.liens) ? p.liens : [];
    if (P.servicesDuParcours(p).includes(s)) return false;
    const dedans = new Set(P.servicesDuParcours(p));
    const references = [
      (etat.parcours || []).filter(q => q !== p).flatMap(q => P.arcsDuParcours(q)),
      parcoursTypes().parcours.flatMap(q => P.arcsDuParcours(q)),
      (o.liaisons || []).map(l => ({ from: l.from ?? l.de, to: l.to ?? l.vers }))
    ];
    const pere = o.parent ? o.parent(s) : null;
    // Chaque sens a sa première référence qui en sait quelque chose : les
    // modèles types ignorent le handling, les liens de l'unité le connaissent.
    const v = { avant: [], apres: [] }, rang = { avant: 9, apres: 9 };
    for (const sens of ['avant', 'apres']) {
      for (const ref of [s].concat(pere && pere !== s ? [pere] : [])) {
        references.some((arcs, i) => {
          const w = voisinsDans(arcs, ref, new Set([...dedans].filter(x => x !== ref)));
          if (w[sens].length) { v[sens] = w[sens]; rang[sens] = i; }
          return w[sens].length;
        });
        if (v[sens].length) break;
      }
    }
    // Un service dont on ne sait rien : il prépare pour la fin du chemin.
    if (!v.avant.length && !v.apres.length) {
      const arcs = P.arcsDuParcours(p);
      v.apres = [...dedans].filter(x => !arcs.some(a => a.from === x));
    }
    p.noeuds.push(s);
    const ajouter = (de, vers) => {
      if (p.liens.some(l => l.de === de && l.vers === vers) || creeBoucle(p, de, vers)) return;
      p.liens.push({ de, vers });
    };
    // La référence la plus sûre d'abord : sur une boucle (les retours des vols
    // vers la plonge, dans les liens de l'unité), c'est elle qui l'emporte.
    const poser = { avant: () => v.avant.forEach(a => ajouter(a, s)), apres: () => v.apres.forEach(b => ajouter(s, b)) };
    for (const sens of rang.apres < rang.avant ? ['apres', 'avant'] : ['avant', 'apres']) poser[sens]();
    // Il s'intercale : « cuisine → montage » devient « cuisine → prépa → montage ».
    const avant = new Set(v.avant.filter(a => p.liens.some(l => l.de === a && l.vers === s)));
    const apres = new Set(v.apres.filter(b => p.liens.some(l => l.de === s && l.vers === b)));
    p.liens = p.liens.filter(l => !(avant.has(l.de) && apres.has(l.vers)));
    return true;
  }

  /** Fait sortir un service d'un chemin : ceux qui le livraient livrent ceux qu'il livrait. */
  function retirerService(p, s) {
    if (!P.servicesDuParcours(p).includes(s)) return false;
    const arcs = P.arcsDuParcours(p);
    const avant = arcs.filter(a => a.to === s).map(a => a.from), apres = arcs.filter(a => a.from === s).map(a => a.to);
    p.noeuds = (p.noeuds || []).filter(x => x !== s);
    p.liens = (p.liens || []).filter(l => l.de !== s && l.vers !== s);
    for (const a of avant) for (const b of apres) {
      if (!p.liens.some(l => l.de === a && l.vers === b) && !creeBoucle(p, a, b)) p.liens.push({ de: a, vers: b });
    }
    return true;
  }

  /** Une commande rejoint les lignes d'une équipe à sa place dans l'ordre des départs (la plus pressée d'abord). */
  function insererParEcheance(a, cmd, classes) {
    const ech = new Map((classes || []).map(c => [c.id, c.echeance]));
    const e = ech.get(cmd) ?? Infinity;
    const i = a.lots.findIndex(l => Math.min(...l.map(x => ech.get(x) ?? Infinity)) > e);
    a.lots.splice(i < 0 ? a.lots.length : i, 0, [cmd]);
  }

  /* ======================================================================
   *  LES FLUX DE PRODUCTION (30/09)
   *  « Les éco sont pratiquement tous identiques, pareil pour les business ;
   *  ce qui change, ce sont les ateliers qui les font, les man-hours, les
   *  personnes, le matériel — mais ce n'est pas une science exacte. » Un flux
   *  par type de production, partagé ; une commande peut s'en écarter : elle
   *  suit alors une variante (« Économie + Robot sans Montage »), elle aussi
   *  partagée par les commandes qui s'écartent de la même façon.
   * ====================================================================*/

  /** L'empreinte d'un flux : ses services et ses liens, dans un ordre fixe. */
  function signature(p) {
    return JSON.stringify([P.servicesDuParcours(p).slice().sort(), P.arcsDuParcours(p).map(a => a.from + '>' + a.to).sort()]);
  }

  /** Les flux de production. */
  const types = etat => (etat.parcours || []).filter(p => p.type);

  /** Les commandes qui suivent un flux (sans chemin propre). */
  function commandesDuType(etat, typeId, classes) {
    return (classes || []).filter(c => !cheminDe(etat, c.id) && (typeSuivi(etat, c) || {}).id === typeId);
  }

  /** Un flux neuf : vide, ou copie d'un autre. */
  function nouveauType(etat, nom, source, o = {}) {
    etat.parcours = etat.parcours || [];
    const p = { id: uid(), nom: nomDeChemin(etat, texte(nom, 76) || 'Flux'),
      noeuds: source ? P.servicesDuParcours(source).slice() : [],
      liens: source ? P.arcsDuParcours(source).map(a => ({ de: a.from, vers: a.to })) : [],
      prepa: true, cases: true, type: true, ...(o.auto ? { auto: true } : {}) };
    etat.parcours.push(p);
    return p;
  }

  /** Une commande suit ce flux (et quitte son chemin propre, s'il en avait un). */
  function assignerType(etat, cmd, typeId) {
    etat.parcoursClasse = etat.parcoursClasse || {};
    const propre = cheminDe(etat, cmd);
    const cab = String(cmd).slice(String(cmd).lastIndexOf('/') + 1);
    if ((etat.parcoursCabine || {})[cab] === typeId) delete etat.parcoursClasse[cmd];
    else etat.parcoursClasse[cmd] = typeId;
    if (propre && !Object.values(etat.parcoursClasse).includes(propre.id)) etat.parcours = etat.parcours.filter(p => p !== propre);
  }

  /** Les variantes créées d'elles-mêmes, que plus aucune commande ne suit, s'en vont. */
  function nettoyerTypes(etat) {
    const pris = new Set(Object.values(etat.parcoursClasse || {}).concat(Object.values(etat.parcoursCabine || {})));
    const avant = (etat.parcours || []).length;
    etat.parcours = (etat.parcours || []).filter(p => !(p.type && p.auto && !pris.has(p.id)));
    return avant - etat.parcours.length;
  }

  /* Le nom d'une variante : ce qui la distingue du flux de sa classe. */
  function nomVariante(etat, base, p, nomDe) {
    const nom = s => (nomDe ? nomDe(s) : s);
    const a = new Set(P.servicesDuParcours(base)), b = new Set(P.servicesDuParcours(p));
    const plus = [...b].filter(x => !a.has(x)), moins = [...a].filter(x => !b.has(x));
    const nomBase = String(base.nom).replace(/\s*[(+].*$/, '').replace(/ sans .*$/, '').trim() || base.nom;
    const suite = (plus.length ? ' + ' + plus.map(nom).join(' + ') : '') + (moins.length ? ' sans ' + moins.map(nom).join(', ') : '');
    return nomBase + (suite || ' (variante)');
  }

  /**
   * « Seulement pour cette commande » : elle suit le flux de son type, avec
   * ce service en plus (`oui`) ou en moins. Une variante identique existe ?
   * elle la rejoint ; sinon une variante naît. Une commande qui a son propre
   * chemin le voit changer, lui. `o` : { classes, liaisons, parent, nomDe }.
   * @returns {number} le nombre de commandes changées
   */
  function adapter(etat, cmds, service, oui, o = {}) {
    marquerTypes(etat);
    let n = 0;
    for (const cmd of [].concat(cmds)) {
      const propre = cheminDe(etat, cmd);
      if (propre) { if (oui ? insererService(etat, propre, service, o) : retirerService(propre, service)) n++; continue; }
      const t = typeSuivi(etat, cmd);
      if (!t) { if (oui) { const c = baseDeClasse(etat, cmd, service, o); if (c) n++; } continue; }
      const dedans = P.servicesDuParcours(t).includes(service);
      if (oui === dedans) continue;
      const essai = { noeuds: P.servicesDuParcours(t).slice(), liens: P.arcsDuParcours(t).map(a => ({ de: a.from, vers: a.to })) };
      if (oui) insererService(etat, essai, service, o); else retirerService(essai, service);
      const sig = signature(essai);
      let v = types(etat).find(x => signature(x) === sig);
      if (!v) {
        const cab = String(cmd).slice(String(cmd).lastIndexOf('/') + 1);
        const base = (etat.parcours || []).find(x => x.id === (etat.parcoursCabine || {})[cab]) || t;
        v = nouveauType(etat, nomVariante(etat, base, essai, o.nomDe), essai, { auto: true });
      }
      assignerType(etat, cmd, v.id); n++;
    }
    nettoyerTypes(etat);
    return n;
  }

  /* Une commande sans aucun flux : le flux de sa classe naît, avec ce service. */
  function baseDeClasse(etat, cmd, service, o = {}) {
    const cab = String(cmd).slice(String(cmd).lastIndexOf('/') + 1);
    etat.parcoursCabine = etat.parcoursCabine || {};
    let t = (etat.parcours || []).find(x => x.id === etat.parcoursCabine[cab]);
    if (!t) { t = nouveauType(etat, (P.NOM_CABINE || {})[cab] || cab); etat.parcoursCabine[cab] = t.id; }
    insererService(etat, t, service, o);
    return t;
  }

  /** « Pour tout le flux » : le service entre dans (ou sort de) ce flux, pour toutes ses commandes. */
  function changerFlux(etat, typeId, service, oui, o = {}) {
    const t = (etat.parcours || []).find(x => x.id === typeId); if (!t) return false;
    return oui ? insererService(etat, t, service, o) : retirerService(t, service);
  }

  /**
   * Regrouper les chemins propres identiques en flux de production. Pour
   * chaque classe, le flux suivi par le plus de commandes devient son flux ;
   * les autres commandes suivent le leur. Les chemins propres s'en vont.
   * @returns {{ types:number, commandes:number }}
   */
  function regrouper(etat, classes, nomDe) {
    marquerTypes(etat);
    const propres = (classes || []).map(c => ({ c, p: cheminDe(etat, c.id) })).filter(x => x.p);
    if (!propres.length) return { types: 0, commandes: 0 };
    const groupes = new Map();
    for (const x of propres) {
      const k = signature(x.p);
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k).push(x);
    }
    // Le flux de chaque commande : celui de son groupe (un flux identique déjà là est repris).
    const flux = new Map(), crees = [];
    for (const [k, liste] of groupes) {
      let t = types(etat).find(x => signature(x) === k);
      if (!t) { t = nouveauType(etat, 'Flux', liste[0].p); crees.push({ t, liste }); }
      for (const x of liste) flux.set(x.c.id, t);
    }
    // Pour chaque classe : le flux le plus suivi en devient le flux.
    for (const cab of P.CABINES) {
      const ici = (classes || []).filter(c => c.cabine === cab);
      if (!ici.length) continue;
      const compte = new Map();
      for (const c of ici) { const t = flux.get(c.id) || typeSuivi(etat, c); if (t) compte.set(t, (compte.get(t) || 0) + 1); }
      const [premier] = [...compte].sort((a, b) => b[1] - a[1]);
      if (!premier) continue;
      etat.parcoursCabine = etat.parcoursCabine || {};
      etat.parcoursCabine[cab] = premier[0].id;
    }
    // Les noms : le flux d'une classe porte son nom ; les autres, leur écart.
    const nomsDe = t => P.CABINES.filter(c => etat.parcoursCabine[c] === t.id).map(c => (P.NOM_CABINE || {})[c] || c);
    for (const { t, liste } of crees) {
      const noms = nomsDe(t);
      if (noms.length) { t.nom = nomDeChemin({ parcours: etat.parcours.filter(x => x !== t) }, noms.join(' · ')); continue; }
      const cab = liste[0].c.cabine, base = etat.parcours.find(x => x.id === etat.parcoursCabine[cab]);
      t.nom = nomDeChemin({ parcours: etat.parcours.filter(x => x !== t) }, base ? nomVariante(etat, base, t, nomDe) : liste[0].p.nom);
    }
    for (const x of propres) assignerType(etat, x.c.id, flux.get(x.c.id).id);
    return { types: crees.length, commandes: propres.length };
  }

  /**
   * La grille d'une équipe : cocher, c'est « cette équipe prépare cette
   * commande ». Elle quitte les autres équipes du même service (une commande,
   * une équipe par service). Le flux ne change pas ici : ce qui manque est
   * renvoyé, pour qu'on choisisse (tout le flux, ou seulement ces commandes).
   * Une commande sans aucun flux reçoit celui de sa classe, avec ce service.
   * `o` : { classes, liaisons, parent, nomDe }. Modifie `etat`.
   * @returns {{ n, horsFlux:[cmd], orphelines:[cmd] }} horsFlux : cochées alors
   *   que leur flux ne passe pas par ce service ; orphelines : décochées alors
   *   que leur flux y passe et que plus personne ne les y prépare.
   */
  function cocher(etat, atelierId, cmds, oui, o = {}) {
    const a = (etat.ateliers || []).find(x => x.id === atelierId);
    if (!a || !fabrique(a)) throw new Error('Cette équipe ne prépare pas commande par commande.');
    const s = a.service;
    let n = 0;
    const horsFlux = [], orphelines = [];
    for (const cmd of [].concat(cmds)) {
      const chez = a.lots.some(l => l.includes(cmd));
      if (oui) {
        for (const x of etat.ateliers) {
          if (x === a || x.service !== s || !fabrique(x)) continue;
          x.lots = x.lots.map(l => l.filter(id => id !== cmd)).filter(l => l.length);
        }
        if (!chez) { insererParEcheance(a, cmd, o.classes); n++; }
        const f = fluxDe(etat, cmd);
        if (!f) baseDeClasse(etat, cmd, s, o);
        else if (!P.servicesDuParcours(f).includes(s)) horsFlux.push(cmd);
      } else if (chez) {
        a.lots = a.lots.map(l => l.filter(id => id !== cmd)).filter(l => l.length);
        n++;
        const encore = etat.ateliers.some(x => x.service === s && fabrique(x) && x.lots.some(l => l.includes(cmd)));
        const f = fluxDe(etat, cmd);
        if (!encore && !fusionneePar(etat, s, cmd) && f && P.servicesDuParcours(f).includes(s)) orphelines.push(cmd);
      }
    }
    return { n, horsFlux, orphelines };
  }

  /**
   * Un service qui sert tout le monde (légumerie, magasin) : « qui en a
   * besoin ? », flux par flux. Modifie `etat`.
   */
  function passerPar(etat, service, typeIds, oui, o = {}) {
    let n = 0;
    for (const id of [].concat(typeIds)) if (changerFlux(etat, id, service, oui, o)) n++;
    return n;
  }

  /**
   * Ce que la grille d'un service montre, commande par commande :
   *   ici       — cette équipe la prépare (cochée)
   *   ailleurs  — une autre équipe du service la prépare (`par`)
   *   chaine    — une case d'un autre service la fait à la chaîne (`par`)
   *   attendue  — son chemin passe par ce service, et personne ne l'y prépare
   *   passe     — (service qui sert tout le monde) son chemin passe par lui
   *   hors      — elle ne passe pas par ce service
   * @returns Map id de commande → { etat, par }
   */
  function grille(etat, service, atelierId, classes) {
    const routes = P.routesDesClasses(classes, etat);
    const equipes = (etat.ateliers || []).filter(a => a.service === service);
    const out = new Map();
    for (const c of classes || []) {
      const r = routes.get(c.id), passe = !!(r && r.services.has(service));
      const qui = equipes.find(a => fabrique(a) && a.lots.some(l => l.includes(c.id)));
      const fu = fusionneePar(etat, service, c.id);
      out.set(c.id, !atelierId ? { etat: passe ? 'passe' : 'hors', par: null }
        : qui && qui.id === atelierId ? { etat: 'ici', par: qui }
        : qui ? { etat: 'ailleurs', par: qui }
        : fu ? { etat: 'chaine', par: fu }
        : passe ? { etat: 'attendue', par: null } : { etat: 'hors', par: null });
    }
    return out;
  }

  /** La nature d'un service : celle de ses équipes, sinon devinée d'après ce qu'il est. */
  function natureService(etat, service, nomService) {
    const types = (etat.ateliers || []).filter(a => a.service === service).map(a => a.type || 'manuel');
    for (const t of ['handling', 'lavage', 'dispo', 'robot', 'manuel']) if (types.includes(t)) return t;
    if (service === 'handling' || /handling|chargement/i.test(nomService || '')) return 'handling';
    if (service === 'plonge' || /plonge|lavage/i.test(nomService || '')) return 'lavage';
    if (SERVICES_DISPO.includes(service)) return 'dispo';
    if (/robot/i.test(nomService || '')) return 'robot';
    return 'manuel';
  }

  /** Une équipe neuve dans un service, de la nature du service. */
  function equipeNeuve(etat, service, nomService, nature) {
    const nom = nomService || service;
    if (nature === 'handling') return caseHandling(etat, service, nom);
    if (nature === 'dispo') return caseDispo(etat, service, nom);
    if (nature === 'robot') return caseRobot(etat, service, nom);
    const n = (etat.ateliers || []).filter(a => a.service === service).length;
    const base = { id: 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      nom: nomLibre(etat, nom + (n ? ' ' + (n + 1) : '')), service, debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [],
      regime: { actif: true } };
    if (nature === 'lavage') return { ...base, type: 'lavage', plafond: 0, tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }] };
    return { ...base, type: 'manuel' };
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
      // Le chemin d'une commande : le sien, sinon le flux qu'elle suit.
      if (this.cmd) return fluxDe(etat, this.cmd);
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
      const nbFlux = new Set(classes.map(c => (typeSuivi(etat, c) || {}).id).filter(Boolean)).size;
      const propres = classes.filter(c => cheminDe(etat, c.id)).length;
      let cie = null;
      const items = this.ordreCommandes(classes).map(c => {
        const tete = c.cie !== cie ? `<li class="pc-cie" data-cie="${esc(c.cie)}">${esc(c.cie)}</li>` : '';
        cie = c.cie;
        const p = fluxDe(etat, c), on = this.cmd === c.id, v = par[c.id] || {};
        const propre = !!cheminDe(etat, c.id);
        const marque = !p ? '' : v.fin == null ? '<span class="pc-cmd-etat afaire" title="Pas encore prête">·</span>'
          : v.aHeure ? '<span class="pc-cmd-etat ok" title="Prête à l’heure">✓</span>'
          : `<span class="pc-cmd-etat retard" title="${Math.round(v.retard)} min de retard">!</span>`;
        return tete + `<li data-cmd="${esc(c.id)}" data-cie="${esc(c.cie)}"><button class="pc-cmd${on ? ' actif' : ''}${p ? '' : ' sans'}" data-pc-action="cmd"
          data-classe="${esc(c.id)}"${on ? ' aria-current="true"' : ''}>
          <span class="puce-classe" data-cab="${esc(c.cabine)}"></span>
          <span class="pc-cmd-nom">${esc((P.NOM_CABINE || {})[c.cabine] || c.cabine)}<small>${!p ? 'pas de flux' : propre ? 'à elle : ' + esc(p.nom) : 'flux ' + esc(p.nom)}</small></span>
          ${marque}</button></li>`;
      }).join('');
      return `<aside class="pc-cmds" aria-label="Les commandes">
        <div class="pc-cmds-tete"><b>Les commandes</b><span>${classes.length} commandes · ${nbFlux} flux${propres ? ' · ' + propres + (propres > 1 ? ' chemins à part' : ' chemin à part') : ''}</span></div>
        ${this.a.ajout ? '<div class="pc-cmds-ajout">' + this.a.ajout() + '</div>' : ''}
        <input type="search" class="pc-cmds-cherche" data-pc="cmd-recherche" placeholder="Chercher (TX, BC…)" value="${esc(this.chercheCmd)}" aria-label="Chercher une commande">
        <ul class="pc-cmds-liste">${items || '<li class="mini-note">Aucune commande : importez un programme de vols (Vols).</li>'}</ul>
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

    /** Un flux partagé : celui d'une classe, ou suivi par plusieurs commandes. Il se modifie dans Flux de production. */
    partage(etat, p) {
      if (!p || !p.type) return false;
      return Object.values(etat.parcoursCabine || {}).includes(p.id) || commandesDuType(etat, p.id, this.a.classes()).length > 1;
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
      const c = classes.find(x => x.id === this.cmd), p = fluxDe(etat, this.cmd);
      if (!p) return this.teteCommande(c, false) + this.creation(etat, classes, c);
      if (this.partage(etat, p)) {
        // Elle suit un flux partagé : on le montre, avec SES équipes à chaque étape.
        const n = commandesDuType(etat, p.id, classes).length, lib = this.lib(this.cmd), I = root.OrlyIcones;
        return this.teteCommande(c, true)
          + `<div class="pc-flux-bandeau">${I ? I.ico('fleche') : ''}<span><b>${esc(lib)}</b> suit le flux <b>« ${esc(p.nom)} »</b>${n > 1 ? ', comme ' + (n - 1) + (n > 2 ? ' autres commandes' : ' autre commande') : ''}.
            Ci-dessous, ce flux ; sur chaque service, l’équipe qui prépare ${esc(lib)}.</span>
            <span class="pc-flux-gestes"><button class="btn btn-sm" data-pc-action="flux-ouvrir">Modifier ce flux${n > 1 ? ' (ses ' + n + ' commandes)' : ''}</button>
            <button class="btn btn-sm" data-pc-action="flux-variante">Seulement pour ${esc(lib)} : lui faire sa variante</button></span></div>`
          + `<p class="pc-message" role="status" aria-live="polite"></p>
          <div class="pc-graphe" data-parcours="${esc(p.id)}"></div>
          <div class="pc-bas">${this.blocPanneau(etat, classes, p)}</div>
          <details class="pc-creer-plus"${this.depuis !== undefined ? ' open' : ''}><summary>Ou bien : un chemin à elle, avec une case à elle sur chaque service…</summary>
            ${this.creation(etat, classes, c, true)}</details>`;
      }
      return this.teteCommande(c, true) + this.outils(etat, p, this.duplication(etat, classes, c))
        + `<p class="pc-message" role="status" aria-live="polite"></p>
        <div class="pc-graphe" data-parcours="${esc(p.id)}"></div>
        <div class="pc-bas">${this.blocPanneau(etat, classes, p)}</div>`;
    }

    corpsModele(etat, classes) {
      const p = this.parcoursActif(etat);
      if (!p) return '<p class="mini-note">Choisissez une commande à gauche.</p>';
      const suivi = P.CABINES.filter(c => (etat.parcoursCabine || {})[c] === p.id).map(c => (P.NOM_CABINE || {})[c] || c);
      const sans = classes.filter(c => !cheminDe(etat, c.id) && (typeSuivi(etat, c) || {}).id === p.id).length;
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
      </div>${this.besoins(etat, dedans)}`;
    }

    /* Les postes qui mettent à disposition : une question par chemin, oui ou non.
     * Leur case est partagée : elle sert toutes les commandes à la fois, par vagues. */
    besoins(etat, dedans) {
      const dispos = this.a.services().filter(x => estDispo(etat, x.id));
      if (!dispos.length) return '';
      return `<div class="pc-besoins" role="group" aria-label="Ce dont ce chemin a besoin"><span class="pc-besoins-lab">Besoin de</span>
        ${dispos.map(x => { const oui = dedans.has(x.id);
          return `<button class="pc-besoin${oui ? ' oui' : ''}" data-pc-action="besoin" data-service="${esc(x.id)}" aria-pressed="${oui}"
            title="${oui ? 'Oui : ' + esc(x.nom) + ' sert cette commande. Cliquer pour retirer.' : 'Non. Cliquer pour qu’' + esc(x.nom) + ' serve cette commande.'}">${oui ? '✓ ' : ''}${esc(x.nom)}</button>`; }).join('')}
        <span class="mini-note">une seule case par poste, qui sert toutes les commandes à la fois, comme une boutique</span></div>`;
    }

    /** Une commande sans chemin : on lui en crée un, vide ou copié d'un autre. */
    creation(etat, classes, c, court) {
      const mods = modeles(etat), autres = (etat.parcours || []).filter(p => !mods.includes(p));
      const modele = typeSuivi(etat, c);
      const choisi = this.depuis !== undefined ? this.depuis : (modele ? modele.id : '');
      const src = (etat.parcours || []).find(p => p.id === choisi), srcCmd = src ? commandeDu(etat, src.id) : null;
      const opt = p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`;
      const I = root.OrlyIcones, lib = this.lib(c.id);
      const tete = court ? `<p>Copiez un flux ou le chemin d’une autre commande : ${esc(lib)} le quitte, et chaque service lui donne une case à elle, à régler une par une.</p>`
        : `${I ? I.ico('fleche') : ''}<b>${esc(lib)} n’a pas encore son chemin</b>
        <p>${modele ? `En attendant, elle suit le modèle « ${esc(modele.nom)} » de sa classe.` : 'En attendant, elle suit les liens de l’unité.'}</p>`;
      return `<div class="vide-carte pc-creer${court ? ' court' : ''}">${tete}
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
        const fu = !a || !fabrique(a) ? fusionneePar(etat, s, this.cmd) : null;
        if (fu) return { id: s, nom: this.nom(s), ico: ico(s), sous: 'à la chaîne · ' + fu.nom, ton: 'ok' };
        // « Cuisine TX BC » dans le nœud Cuisine : le service s'y lit déjà.
        const court = a ? (a.nom.toUpperCase().startsWith(this.nom(s).toUpperCase() + ' ') ? a.nom.slice(this.nom(s).length + 1) : a.nom) : '';
        const sous = !a ? 'aucune case'
          : a.type === 'dispo' ? court + ' · à disposition'
          : a.type === 'lavage' ? court + ' · plonge'
          : a.type === 'handling' ? court + ' · par vol'
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
        // Un flux garde la même disposition ici et dans Flux de production.
        get cle() { const p = ed.parcoursActif(ed.a.etat()); return (p && p.type ? 'flux:' : 'chemin:') + (p ? p.id : ''); },
        titre: 'Le chemin : un nœud par service, avec sa case ; un lien par livraison',
        noeuds: () => ed.noeudsDiagramme(),
        liens: () => ed.liensDiagramme(),
        relier: (de, vers) => ed.relier(de, vers),
        retirerLien: id => ed.retirerLien(id),
        fige: () => { const e = ed.a.etat(); return !!ed.cmd && ed.partage(e, ed.parcoursActif(e)); },
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
      const etat = this.a.etat(), p = this.parcoursActif(etat); if (!p) return 'Aucun chemin choisi.';
      if (this.cmd && this.partage(etat, p)) return this.refusPartage(p);
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
      const etat = this.a.etat(), p = this.parcoursActif(etat); if (!p) return;
      if (this.cmd && this.partage(etat, p)) return this.dire(this.refusPartage(p));
      const [de, vers] = id.split('>');
      this.sel = null;
      this.a.changer(etat => {
        const q = etat.parcours.find(x => x.id === p.id);
        q.liens = q.liens.filter(l => !(l.de === de && l.vers === vers));
      }, 'Lien retiré : ' + this.nom(de) + ' ne livre plus ' + this.nom(vers) + '. Vous pouvez annuler.');
    }

    refusPartage(p) {
      return 'C’est le flux « ' + p.nom + ' », partagé : « Modifier ce flux » (pour toutes ses commandes) ou « lui faire sa variante ».';
    }

    /* Ce qui vient de se passer se dit deux fois : dans la ligne d'état de la
     * vue, et juste au-dessus du diagramme, là où l'on regarde. */
    dire(t) { annoncer(t); }

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
        const verService = this.a.service ? `<button class="btn btn-sm" data-pc-action="service-ouvrir" data-service="${esc(s)}">Ouvrir le service ${esc(this.nom(s))} →</button>` : '';
        const gestes = this.cmd && this.partage(etat, p) ? verService
          : `<button class="btn btn-sm" data-pc-action="relier-depuis" data-service="${esc(s)}">Relier à…</button>
          <button class="lien-discret danger" data-pc-action="noeud-retirer" data-service="${esc(s)}">Retirer du chemin</button>${verService}`;
        if (!this.cmd) return `<p class="pc-pan-tete">${ico}<b>${esc(this.nom(s))}</b><span>dans un modèle, un nœud n’a pas de case :
          chaque commande a la sienne, sur son propre chemin.</span></p><div class="row-btns">${gestes}</div>`;
        const lib = this.lib(this.cmd), a0 = caseDe(etat, s, this.cmd);
        const fu = !a0 || !fabrique(a0) ? fusionneePar(etat, s, this.cmd) : null;
        if (fu) {
          const fiche = this.a.fiche ? this.a.fiche(fu.id, this.cmd) : '';
          return `<p class="pc-pan-tete">${ico}<b>${esc(this.nom(s))}</b><span>faite <b>à la chaîne</b> par la case « ${esc(fu.nom)} » de ${esc(this.nom(fu.service))} :
            une personne dresse et passe le plat, l’autre monte directement.</span></p>
            ${this.dansLeTemps(s)}
            <div class="row-btns pc-case-outils"><span class="mini-note">Pour la faire à part, décochez « à la chaîne » dans cette case.</span><span class="pc-outils-fin"></span>${gestes}</div>
            ${fiche}`;
        }
        const a = a0;
        const cases = (etat.ateliers || []).filter(x => x.service === s && fabrique(x));
        const autres = a && fabrique(a) ? [...new Set(a.lots.flat())].filter(id => id !== this.cmd) : [];
        const dit = !a ? `aucune case : ${esc(lib)} saute cette étape`
          : a.type === 'dispo' ? `« ${esc(a.nom)} » est une mise à disposition : elle sert toutes les commandes`
          : a.type === 'lavage' ? `« ${esc(a.nom)} » lave pour toutes les commandes`
          : a.type === 'handling' ? `« ${esc(a.nom)} » charge les vols de toutes les commandes, vol par vol dans l’ordre des départs`
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
      // Une case qui se règle compagnie par compagnie (handling, plonge par vol)
      // a besoin d'une fenêtre plus large : ses tableaux ne tiendraient pas.
      document.body.classList.toggle('pc-tiroir-large', ouvert && !!this.a.boite().querySelector('.pc-tiroir .at-cies'));
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
      const titre = `<div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t2">Parcours des commandes <span class="pc-sous">qui prépare chaque commande, service par service, et quand</span></h3>
        <details class="aide"><summary aria-label="Comment lire le tableau ?">?</summary><span class="aide-corps">${AIDE_TABLEAU}</span></details></div>`;
      if (!t.lignes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucune commande à préparer : importez un programme de vols (Vols).</p></section>`;
      // Sans aucune case, deux cents cases vides ne disent rien : on dit par où commencer.
      if (!(etat.ateliers || []).length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <div class="vide-carte qf-vide">${root.OrlyIcones ? root.OrlyIcones.ico('equipe') : ''}<b>Aucune case pour l’instant</b>
          <p>Ce tableau se remplit tout seul : quelle équipe prépare chaque commande, service par service, et à quelle heure.</p>
          <p>Pour commencer : dans Mon unité › Services et équipes, cochez ce que prépare chaque équipe.</p>
          <div class="row-btns"><button class="btn btn-play" data-page="mu-services">Ouvrir Mon unité</button></div></div></section>`;
      if (!t.colonnes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucune commande ne passe encore par un service : cochez ce que prépare chaque équipe dans Mon unité › Services et équipes.</p></section>`;

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
          if (k.etat === 'auto') {
            // Une mise à disposition par vagues : la vague qui sert cette commande.
            const v = ((r && r.lots) || []).find(x => x.dispo && x.atelier === k.ateliers[0] && (x.classes || []).includes(c.id));
            const at = etat.ateliers.find(x => x.id === k.ateliers[0]);
            const dit = at && at.permanent !== false && at.ouverture ? 'ouvert ' + at.ouverture.de + '–' + at.ouverture.a
              : v && v.vagues > 1 ? 'vague ' + v.vague + ' · ' + P.hhmm(v.debut) : v && v.vagues === 1 ? 'dès ' + P.hhmm(v.debut) : '';
            return `<td class="qf-c auto" title="${esc(nomAt(k.ateliers[0]))} sert toutes les commandes à la fois${dit ? ' — ' + esc(dit) : ''}">${esc(nomAt(k.ateliers[0]))}${
              dit ? '<small class="qf-vague">' + esc(dit) + '</small>' : ''}</td>`;
          }
          if (k.etat === 'libre') return `<td class="qf-c"><button class="qf-case libre" ${attrs}
            title="Ouvrir le chemin de ${esc(P.libelleClasse(c.id))} sur ${esc(this.nom(s))}">à faire</button></td>`;
          const lot = lots.get(k.ateliers[0] + '|' + c.id);
          const h = lot && Number.isFinite(lot.debut) ? P.hhmm(lot.debut) + (Number.isFinite(lot.fin) ? '–' + P.hhmm(lot.fin) : '') : '';
          const plus = k.ateliers.length > 1 ? ' +' + (k.ateliers.length - 1) : '';
          const hors = k.etat === 'hors-fait';
          return `<td class="qf-c${hors ? ' hors' : ''}"><button class="qf-case ${hors ? 'alerte' : 'ok'}" ${attrs}
            title="${hors ? esc(P.libelleClasse(c.id)) + ' ne passe pas par ' + esc(this.nom(s)) + ' selon son chemin : ce travail n’est attendu par personne'
              : k.fusion ? 'Faite à la chaîne par ' + esc(nomAt(k.ateliers[0])) + ' (' + esc(this.nom(k.fusion)) + ')' + (h ? ' · ' + h : '') : esc(nomAt(k.ateliers[0])) + (h ? ' · ' + h : '')}">
            <span class="qf-nom">${hors ? '⚠ ' : ''}${esc(nomAt(k.ateliers[0]))}${plus}</span>${k.fusion ? '<small class="qf-chaine">à la chaîne</small>' : h ? `<small>${h}</small>` : ''}</button></td>`;
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
      const heures = []; if (Number.isFinite(t0) && Number.isFinite(t1)) for (let t = Math.ceil(t0 / pas) * pas; t <= t1 && heures.length < 400; t += pas) heures.push(t);
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
      let action = b.dataset.pcAction;
      const s = b.dataset.service;
      const etat = this.a.etat(), classes = this.a.classes();
      const p = this.parcoursActif(etat), pid = p && p.id;
      // « Besoin de légumerie » déjà coché : le décocher, c'est la retirer du chemin.
      if (action === 'besoin' && p && P.servicesDuParcours(p).includes(s)) action = 'noeud-retirer';
      const trouver = x => x.parcours.find(y => y.id === pid);
      if (action === 'flux-ouvrir') return this.a.flux && this.a.flux(pid);
      if (action === 'service-ouvrir') return this.a.service && this.a.service(s);
      if (action === 'flux-variante' && p && this.cmd) {
        const cmd = this.cmd, lib = this.lib(cmd);
        return this.a.changer(x => {
          const v = nouveauType(x, p.nom + ' · ' + etiquette(cmd), p);
          assignerType(x, cmd, v.id);
          this.copierDisposition(pid, v.id);
        }, lib + ' a sa variante du flux « ' + p.nom + ' » : modifiez-la ici, elle ne touche qu’elle.');
      }
      // Un flux partagé ne se modifie pas depuis le chemin d'une commande.
      if (this.cmd && this.partage(etat, p) && ['relier-depuis', 'lien-retirer', 'noeud-retirer', 'besoin', 'parcours-retirer'].includes(action))
        return this.dire(this.refusPartage(p));
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
        const cible = b.dataset.classe, modele = typeSuivi(etat, cible);
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
      if (action === 'besoin') {
        const cmd = this.cmd;
        return this.a.changer(x => { ajouterBesoin(x, trouver(x), s, cmd, y => this.nom(y), classes); },
          this.nom(s) + ' sert ' + (cmd ? this.lib(cmd) : 'ce modèle') + ' : sa case est partagée par toutes les commandes.');
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
      const tout = G.lirePositions(), pos = tout['flux:' + de] || tout['chemin:' + de];
      if (pos) for (const k of ['flux:', 'chemin:']) G.ecrirePositions(k + vers, pos);
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


  const api = { annoncer, fusionneePar, insererPrepa, depuisBranches, creeBoucle, parcoursTypes, validerParcours, etapesOrdonnees, couverture, confier, nouvelleEquipe,
    completer, colonnes, tableau, affecter, chronogramme, etiquette, cheminDe, commandeDu, modeles, caseDe, creerChemin, donnerCases, completerCases, nomLibre, caseHandling, anciensHandlings, brancherHandling, caseRobot, remplacerEtape,
    SERVICES_DISPO, estDispo, caseDispo, anciensDispos, partagerDispos, separerParCommande, ajouterBesoin,
    cheminPropre, insererService, retirerService, insererParEcheance, cocher, passerPar, grille, natureService, equipeNeuve,
    marquerTypes, typeSuivi, fluxDe, signature, types, commandesDuType, nouveauType, assignerType, nettoyerTypes, nomVariante, adapter,
    changerFlux, regrouper, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
