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
    if (b.parcours.length > 50) throw new Error('Maximum 50 parcours.');
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
      return { id, nom: texte(p.nom, 80) || 'Parcours', noeuds, liens, ...(p.prepa ? { prepa: true } : {}) };
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
   *   dispo, absent, attendu }], debut, fin }}
   */
  function chronogramme(resultat, parcours, classeId) {
    const lots = (resultat && resultat.lots) || [];
    const arcs = P.arcsDuParcours(parcours);
    // Le même ordre que les colonnes du tableau : branche par branche, puis la jonction.
    const etapes = colonnes([parcours]).map(({ service: s, groupe }) => {
      const l = lots.find(x => x.service === s && (x.classes || []).includes(classeId));
      return { service: s, branche: groupe,
        debut: l ? l.debut : null, fin: l ? l.fin : null, attente: l ? (l.attente || 0) : 0,
        atelier: l ? l.atelier : null, dispo: !!(l && l.dispo), absent: !l, attendu: null };
    });
    const par = new Map(etapes.map(e => [e.service, e]));
    // Une étape sans équipe est enjambée : on remonte jusqu'à ce qui a vraiment livré.
    const amonts = (s, vus = new Set()) => arcs.filter(a => a.to === s && !vus.has(a.from)).flatMap(a => {
      vus.add(a.from);
      const e = par.get(a.from);
      return e && !e.absent ? [e] : amonts(a.from, vus);
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
   *  L'ÉDITEUR
   *
   *  Deux temps, dans l'ordre où l'on pense :
   *    1. Les parcours — par où passe chaque classe (un schéma par parcours).
   *    2. Qui fabrique quoi — un tableau : une ligne par compagnie × classe,
   *       une colonne par service ; chaque case dit l'équipe, un clic la
   *       choisit. Une ligne se déplie pour se lire dans le temps.
   * ====================================================================*/

  const AIDE_PARCOURS = `<p>Un <b>chemin</b> dit par où passe une commande de repas. C’est un <b>diagramme</b> : chaque
    service est un nœud, et un lien « A → B » veut dire que A livre B. Pour relier deux services, tirez
    le <b>+</b> à droite du premier jusqu’au second (ou cliquez-le, « Relier à… », puis l’autre).</p>
    <p>Plusieurs chemins partent en même temps et se rejoignent : les aliments par la réception et la
    cuisine, le matériel par la plonge et la dotation, les produits de la compagnie par le magasin — tout
    se retrouve au montage, qui attend tous ses liens entrants. Un lien qui ferait tourner une commande en
    rond est refusé.</p>
    <p>Chaque classe (Business, Économie…) suit un chemin par défaut ; les commandes d’une compagnie
    peuvent en suivre un autre, dans le tableau « Qui prépare quoi ».</p>`;
  const AIDE_TABLEAU = `<p>Une <b>ligne</b> par commande (les repas d’une compagnie dans une classe, pour la
    journée), une <b>colonne</b> par service. Chaque case dit quelle équipe prépare cette commande dans ce service : cliquez-la pour choisir
    l’équipe, en créer une, ou vider la case. Cliquez le <b>nom d’un service</b> pour remplir d’un coup
    toutes ses cases vides.</p>
    <p>Une case « à choisir » n’arrête rien : l’étape est sautée, et le site le signale. Une case
    hachurée : cette commande ne passe pas par ce service.</p>
    <p>La dernière colonne dit quand la commande est prête ; cliquez-la pour la suivre dans le temps,
    étape par étape.</p>`;

  class EditeurParcours {
    /**
     * @param {object} a adaptateur :
     *   boite()          — l'élément où se dessiner
     *   etat()           — { ateliers, parcours, parcoursCabine, parcoursClasse } (lecture)
     *   changer(fn, msg) — applique `fn(etat)` sur l'état et enregistre
     *   services()       — [{id, nom}]
     *   classes()        — les compagnies × classes du moment
     *   resultat()       — la journée calculée, pour les heures
     *   ouvrirAtelier(id, defiler) — déplie la fiche d'une équipe
     *   service()        — facultatif : le service choisi, partagé avec « Les équipes »
     *   choisirService(id) — facultatif : le choisir ('' : aucun)
     *   voirEquipes(id)  — facultatif : ouvrir « Les équipes » sur ce service
     *
     * « Les chemins » et « Les équipes » montrent le même diagramme et le même
     * service choisi : on relie dans l'un, on règle les équipes dans l'autre,
     * sans jamais perdre de vue où l'on est. Dans « Les équipes », le
     * diagramme sert seulement à choisir (ni +, ni lien à retirer).
     */
    constructor(a) {
      this.a = a;
      this.actif = null;           // le chemin affiché dans le diagramme
      this.sel = null;             // le lien choisi dans le diagramme
      this.svc = '';               // le service choisi, faute d'adaptateur qui le partage
      this.graphe = null;
      this.suivies = new Set();    // lignes dépliées dans le temps
      this.recherche = '';
      this.incompletes = false;
      this.menu = null;
      const boite = a.boite();
      boite.addEventListener('click', e => this.cliquer(e));
      boite.addEventListener('change', e => this.saisir(e));
      boite.addEventListener('input', e => {
        if (e.target.dataset.qf === 'recherche') { this.recherche = e.target.value; this.filtrer(); }
      });
      // Défiler le tableau referme le menu — sauf le défilement que le clic
      // lui-même a provoqué pour montrer la case, qui arrive juste après.
      boite.addEventListener('scroll', () => {
        if (this.menu && performance.now() - this.menu.t > 300) this.fermerMenu();
      }, true);
      document.addEventListener('click', e => {
        if (this.menu && !e.target.closest('.qf-menu, [data-qf="case"], [data-qf="col"]')) this.fermerMenu();
      });
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !this.menu) return;
        const retour = this.menu.retour; this.fermerMenu();
        if (retour && retour.isConnected) retour.focus();
      });
    }

    /** Le service choisi : celui de « Les équipes » quand l'adaptateur le partage. */
    service() { return this.a.service ? this.a.service() || '' : this.svc; }
    choisirService(id) {
      if (this.a.choisirService) this.a.choisirService(id || '');
      else { this.svc = id || ''; this.majSelection(); }
    }
    /** Le diagramme sert-il seulement à choisir ? Oui dans l'onglet « Les équipes ». */
    choixSeul() { return !!root.document && root.document.body.dataset.sous === 'at-equipes'; }

    /** Ce que le diagramme montre choisi : le lien (pour le retirer), sinon le service partagé. */
    selection() {
      if (this.sel && this.sel.type === 'lien' && !this.choixSeul()) return this.sel;
      const p = this.parcoursActif(this.a.etat()), s = this.service();
      return p && s && P.servicesDuParcours(p).includes(s) ? { type: 'noeud', id: s } : null;
    }

    /** Le service choisi a changé ailleurs : le diagramme et son panneau suivent. */
    majSelection() {
      const g = this.graphe, sel = this.selection();
      if (g && g.a.hote()) {
        const avant = g.selection;
        if (!avant !== !sel || (sel && (avant.type !== sel.type || avant.id !== sel.id))) { g.selection = sel; g.rendre(); }
        if (sel && sel.type === 'noeud') g.montrer(sel.id);
      }
      this.rendrePanneau();
    }

    /** Changement d'onglet entre « Les chemins » et « Les équipes » : le diagramme change de mode. */
    surOnglet() {
      if (this.choixSeul()) this.sel = null;
      const g = this.graphe;
      if (g && g.a.hote()) {
        const sel = g.selection = this.selection(); g.rendre();
        if (sel && sel.type === 'noeud') g.montrer(sel.id);
      }
      this.rendrePanneau();
    }

    /** Les services du chemin affiché, dans le sens du flux (sources d'abord). */
    ordre() {
      const p = this.parcoursActif(this.a.etat());
      return p ? etapesOrdonnees(p) : [];
    }

    /** Qui livre ce service, et qui il livre, sur le chemin affiché. */
    voisins(s) {
      const p = this.parcoursActif(this.a.etat()), arcs = p ? P.arcsDuParcours(p) : [];
      return { chemin: p ? p.nom : '', dedans: !!p && P.servicesDuParcours(p).includes(s),
        amont: arcs.filter(a => a.to === s).map(a => a.from), aval: arcs.filter(a => a.from === s).map(a => a.to) };
    }

    /** Une équipe dans ce service, qui prend les commandes du chemin affiché sans personne ici. */
    creerEquipe(s) {
      const classes = this.a.classes(), p = this.parcoursActif(this.a.etat()), pid = p && p.id;
      const c = couverture(this.a.etat(), classes).find(x => x.parcours.id === pid);
      const manquantes = ((((c && c.etapes) || []).find(x => x.service === s)) || {}).manquantes || [];
      let cree = null;
      this.a.changer(etat => { cree = nouvelleEquipe(etat, s, this.nom(s), [], classes); affecter(etat, s, manquantes, cree.id, classes); });
      if (!cree || !this.a.ouvrirAtelier) return cree;
      this.a.ouvrirAtelier(cree.id, false, 'Équipe « ' + cree.nom + ' » créée'
        + (manquantes.length ? ' : elle prépare les ' + manquantes.length + ' commandes de ce chemin qui n’avaient personne ici' : '')
        + (this.choixSeul() ? '. Réglez son heure et son effectif ci-dessous.' : '. Réglez son heure et son effectif dans l’onglet « Les équipes » : sa fiche y est ouverte.'));
      return cree;
    }

    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }
    /** Le nom d'un groupe de colonnes : la jonction, ou le service d'où part le chemin. */
    groupe(g) { return g === 'Jonction' ? 'Jonction' : 'Depuis ' + this.nom(g); }
    atelier(id) { return (this.a.etat().ateliers || []).find(a => a.id === id) || null; }

    rendre() {
      this.fermerMenu();
      const etat = this.a.etat(), classes = this.a.classes();
      this.a.boite().innerHTML = this.sectionParcours(etat, classes) + this.sectionTableau(etat, classes);
      const g = this.diagramme(); if (g) { g.selection = this.selection(); g.rendre(); }
      const statut = document.getElementById('at-status'), m = this.a.boite().querySelector('.pc-message');
      if (m && statut) m.textContent = statut.textContent;
      this.filtrer();
    }

    /* ---- 1. les parcours --------------------------------------------- */

    sectionParcours(etat, classes) {
      const optionsParcours = choisi => '<option value="">aucun (liens de l’unité)</option>'
        + etat.parcours.map(p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`).join('');
      const p = this.parcoursActif(etat);
      const I = root.OrlyIcones;
      const puces = (etat.parcours.length ? '<span class="pc-puces-lab">Chemin</span>' : '') + etat.parcours.map(x => `<button class="pc-puce${x === p ? ' actif' : ''}" data-pc-action="voir" data-parcours="${esc(x.id)}"
        aria-pressed="${x === p}">${esc(x.nom)}</button>`).join('');
      let corps = '<p class="mini-note">Aucun chemin : chaque commande suit les liens de l’unité.'
        + ' <button class="lien-discret" data-sous="at-equipes" data-aller="ateliers" data-onglet="at-chemins">En dessiner un →</button></p>';
      if (p) {
        const cabines = P.CABINES.filter(c => etat.parcoursCabine[c] === p.id);
        const propres = Object.keys(etat.parcoursClasse).filter(k => etat.parcoursClasse[k] === p.id);
        const qui = cabines.length || propres.length
          ? 'Suivi par ' + cabines.map(c => `<b class="pc-cab"><span class="puce-classe" data-cab="${c}"></span>${esc((P.NOM_CABINE || {})[c] || c)}</b>`).join(' ')
            + (propres.length ? ` + ${propres.slice(0, 3).map(x => esc(P.libelleClasse(x))).join(', ')}${propres.length > 3 ? '…' : ''}` : '')
          : 'Suivi par aucune commande pour l’instant';
        const dedans = new Set(P.servicesDuParcours(p));
        const hors = this.a.services().filter(s => !dedans.has(s.id));
        corps = `<div class="pc-outils" data-parcours="${esc(p.id)}" data-sous="at-chemins">
            <label class="pc-nom-champ">Nom <input class="pc-nom" value="${esc(p.nom)}" data-pc-champ="nom" aria-label="Nom du chemin"></label>
            <label>Ajouter un service <select data-pc-champ="noeud-ajout" aria-label="Ajouter un service à ce chemin">
              <option value="">Choisir…</option>${hors.map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('')}</select></label>
            <span class="pc-outils-fin"></span>
            <button class="btn btn-sm" data-pc-action="reorganiser" title="Ranger les services d’eux-mêmes, de gauche à droite dans le sens du flux">Réorganiser</button>
            <button class="lien-discret danger" data-pc-action="parcours-retirer">Supprimer ce chemin</button>
          </div>
          <p class="pc-qui" data-sous="at-chemins">${qui}</p>
          <p class="pc-message" role="status" aria-live="polite" data-sous="at-chemins"></p>
          <div class="pc-graphe" data-parcours="${esc(p.id)}"></div>
          <div class="pc-panneau" data-parcours="${esc(p.id)}" aria-live="polite" data-sous="at-chemins">${this.panneau(etat, classes, p)}</div>`;
      }
      return `<section class="pc-sec" aria-labelledby="pc-t1" data-sous="at-chemins at-equipes">
        <div class="titre-aide at-titre-aide" data-sous="at-chemins"><h3 class="at-titre" id="pc-t1">Le chemin des commandes</h3>
          <details class="aide"><summary aria-label="Qu’est-ce qu’un chemin ?">?</summary><span class="aide-corps">${AIDE_PARCOURS}</span></details></div>
        <div class="pc-defauts" data-sous="at-chemins">
          <span class="pc-defauts-lab">Chemin de chaque classe</span>
          ${P.CABINES.map(c => `<label><span class="pc-lab-cab"><span class="puce-classe" data-cab="${c}"></span>${esc((P.NOM_CABINE || {})[c] || c)}</span><select data-pc-champ="cabine" data-cabine="${c}">${optionsParcours(etat.parcoursCabine[c])}</select></label>`).join('')}
        </div>
        <div class="pc-puces" role="group" aria-label="Les chemins">${puces}
          <button class="btn btn-sm" data-pc-action="parcours-ajouter" data-sous="at-chemins">+ Nouveau chemin</button>
          ${etat.parcours.length ? '' : '<button class="btn btn-sm" data-pc-action="types" data-sous="at-chemins">Créer les chemins types</button>'}</div>
        ${corps}
      </section>`;
    }

    parcoursActif(etat) {
      const liste = etat.parcours || [];
      return liste.find(p => p.id === this.actif) || liste[0] || null;
    }

    /* Les nœuds du diagramme : un par service du chemin, avec ses équipes. */
    noeudsDiagramme() {
      const etat = this.a.etat(), p = this.parcoursActif(etat); if (!p) return [];
      const c = couverture(etat, this.a.classes()).find(x => x.parcours.id === p.id);
      const par = new Map(((c && c.etapes) || []).map(e => [e.service, e]));
      const I = root.OrlyIcones;
      return P.servicesDuParcours(p).map(s => {
        const e = par.get(s) || { equipes: [], fabriquent: [], manquantes: [] };
        const n = e.equipes.length, noms = e.equipes.map(id => (this.atelier(id) || {}).nom || id);
        const sous = e.lavage ? 'plonge' + (n > 1 ? ' · ' + n + ' équipes' : '')
          : e.dispo && !e.fabriquent.length ? 'mise à disposition'
          : !e.fabriquent.length ? 'aucune équipe'
          : e.manquantes.length ? e.manquantes.length + (e.manquantes.length > 1 ? ' commandes' : ' commande') + ' sans équipe'
          : n === 1 ? noms[0] : n + ' équipes';
        // Vert : tout est couvert. Ambre : commencé, il manque des commandes.
        // Neutre : rien encore — ce n'est pas une alerte, c'est à faire.
        const ton = e.lavage || e.dispo || (e.fabriquent.length && !e.manquantes.length) ? 'ok'
          : e.fabriquent.length ? 'attente' : 'neutre';
        return { id: s, nom: this.nom(s), ico: I ? I.icoService(s, this.nom(s)) : 'service', sous, ton };
      });
    }

    liensDiagramme() {
      const p = this.parcoursActif(this.a.etat()); if (!p) return [];
      return P.arcsDuParcours(p).map(a => ({ id: a.from + '>' + a.to, de: a.from, vers: a.to,
        titre: this.nom(a.from) + ' livre ' + this.nom(a.to) }));
    }

    diagramme() {
      if (this.graphe || !root.OrlyGraphe) return this.graphe;
      const ed = this;
      this.graphe = new root.OrlyGraphe.Diagramme({
        hote: () => ed.a.boite().querySelector('.pc-graphe'),
        get cle() { const p = ed.parcoursActif(ed.a.etat()); return 'chemin:' + (p ? p.id : ''); },
        titre: 'Le diagramme du chemin : un nœud par service, un lien par livraison',
        noeuds: () => ed.noeudsDiagramme(),
        liens: () => ed.liensDiagramme(),
        relier: (de, vers) => ed.relier(de, vers),
        retirerLien: id => ed.retirerLien(id),
        // Un lien choisi reste ici ; un service choisi l'est aussi dans « Les équipes ».
        choisir: sel => {
          ed.sel = sel && sel.type === 'lien' ? sel : null;
          if (!sel || sel.type === 'noeud') ed.choisirService(sel ? sel.id : '');
          else ed.rendrePanneau();
        },
        choixSeul: () => ed.choixSeul(),
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
      }, this.nom(de) + ' livre maintenant ' + this.nom(vers) + '.');
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

    /* Ce qu'on peut faire du service ou du lien choisi. */
    panneau(etat, classes, p) {
      const sel = this.selection();
      if (sel && sel.type === 'lien') {
        const [de, vers] = sel.id.split('>');
        return `<p><b>${esc(this.nom(de))}</b> livre <b>${esc(this.nom(vers))}</b> : ${esc(this.nom(vers))} attend que ${esc(this.nom(de))} ait fini.</p>
          <div class="row-btns"><button class="btn btn-sm at-danger" data-pc-action="lien-retirer" data-lien="${esc(sel.id)}">Retirer ce lien</button></div>`;
      }
      if (sel && sel.type === 'noeud' && P.servicesDuParcours(p).includes(sel.id)) {
        const s = sel.id, c = couverture(etat, classes).find(x => x.parcours.id === p.id);
        const e = ((c && c.etapes) || []).find(x => x.service === s) || { equipes: [], manquantes: [] };
        const r = this.a.resultat ? this.a.resultat() : null;
        const equipe = id => {
          const a = this.atelier(id) || {};
          const detail = a.type === 'lavage' ? 'plonge' : a.type === 'dispo' ? 'mise à disposition'
            : (a.debut || '') + ' · ' + (a.personnes || 0) + ' pers. · ' + ((a.lots || []).length) + ((a.lots || []).length > 1 ? ' commandes' : ' commande');
          return `<button class="btn btn-sm pc-equipe" data-pc-action="fiche" data-atelier="${esc(id)}" title="Ouvrir sa fiche">${esc(a.nom || id)} <small>${esc(detail)}</small></button>`;
        };
        const I = root.OrlyIcones;
        return `<p class="pc-pan-tete">${I ? I.ico(I.icoService(s, this.nom(s))) : ''}<b>${esc(this.nom(s))}</b>
            <span>${e.equipes.length ? e.equipes.length + ' équipe' + (e.equipes.length > 1 ? 's' : '') : 'aucune équipe'}${e.manquantes.length ? ' · ' + e.manquantes.length + (e.manquantes.length > 1 ? ' commandes' : ' commande') + ' sans équipe ici' : ''}</span></p>
          ${e.equipes.length ? `<div class="row-btns">${e.equipes.map(equipe).join('')}</div>` : ''}
          <div class="row-btns">
            <button class="btn btn-sm btn-play" data-pc-action="equipe-nouvelle" data-service="${esc(s)}"
              title="Une équipe dans ce service, qui prépare les commandes de ce chemin qui n’en ont pas encore ici">+ Nouvelle équipe ici</button>
            ${e.equipes.length ? `<button class="btn btn-sm" data-pc-action="equipes" data-service="${esc(s)}"
              title="Leurs horaires, effectifs et ce qu’elles préparent, avec ce même diagramme pour passer d’un service à l’autre">Régler ses équipes →</button>` : ''}
            <button class="btn btn-sm" data-pc-action="relier-depuis" data-service="${esc(s)}">Relier à…</button>
            <button class="lien-discret danger" data-pc-action="noeud-retirer" data-service="${esc(s)}">Retirer du chemin</button>
          </div>`;
      }
      const I = root.OrlyIcones;
      return `<div class="pc-geste">${I ? I.ico('info') : ''}<span>Tirez le <b class="pc-rond">+</b> d’un service jusqu’à un autre, ou cliquez-le puis cliquez l’autre, pour les relier ; un service peut en livrer plusieurs.
        Cliquez un service pour voir ses équipes, en créer une ou le relier ; cliquez un lien pour le retirer.</span></div>`;
    }

    rendrePanneau() {
      const etat = this.a.etat(), p = this.parcoursActif(etat), box = this.a.boite().querySelector('.pc-panneau');
      if (box && p) box.innerHTML = this.panneau(etat, this.a.classes(), p);
    }

    /* ---- 2. qui fabrique quoi ---------------------------------------- */

    sectionTableau(etat, classes) {
      const t = tableau(etat, classes);
      const r = this.a.resultat ? this.a.resultat() : null;
      const titre = `<div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t2">Qui prépare quoi <span class="pc-sous">une équipe dans chaque case</span></h3>
        <details class="aide"><summary aria-label="Comment remplir le tableau ?">?</summary><span class="aide-corps">${AIDE_TABLEAU}</span></details></div>`;
      if (!t.lignes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucune commande à préparer : importez un programme de vols (étape 1).</p></section>`;
      // Sans aucune équipe, deux cents cases vides ne disent rien : on dit par où commencer.
      if (!(etat.ateliers || []).length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <div class="vide-carte qf-vide">${root.OrlyIcones ? root.OrlyIcones.ico('equipe') : ''}<b>Aucune équipe pour l’instant</b>
          <p>Ce tableau dira quelle équipe prépare chaque commande, service par service.</p>
          <p>Pour commencer : ouvrez « Les chemins », cliquez un service, puis « + Nouvelle équipe ici ».</p>
          <div class="row-btns"><button class="btn btn-play" data-aller="ateliers" data-onglet="at-chemins">Ouvrir « Les chemins »</button>
            <button class="btn" data-aller="ateliers" data-onglet="at-equipes">Créer une équipe à la main</button></div></div></section>`;
      if (!t.colonnes.length) return `<section class="qf" aria-labelledby="pc-t2" data-sous="at-grille">${titre}
        <p class="mini-note">Aucun chemin : décrivez-en un ci-dessus pour que le tableau ait des colonnes.</p></section>`;

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
      const auto = t.colonnes.filter(c => c.fabriquent.length === 1).reduce((n, c) => n + c.libres.length, 0);
      const total = remplies + aRemplir, pct = total ? Math.round(remplies / total * 100) : 100;

      const barre = `<div class="qf-barre">
        <div class="qf-progres" title="${remplies} ${remplies > 1 ? 'cases ont leur' : 'case a son'} équipe, ${aRemplir} à choisir">
          <div class="qf-jauge" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span><b>${remplies} sur ${total}</b> cases remplies${aRemplir ? '' : ' — tout a son équipe'}</span></div>
        ${auto ? `<button class="btn btn-play btn-sm" data-qf="remplir" title="Là où un service n’a qu’une équipe, elle prend toutes ses cases vides">Remplir automatiquement · ${auto} case${auto > 1 ? 's' : ''}</button>` : ''}
        <span class="qf-barre-fin"></span>
        <input type="search" class="qf-recherche" data-qf="recherche" placeholder="Chercher une compagnie (AF, DL…)" value="${esc(this.recherche)}" aria-label="Chercher une commande par sa compagnie">
        <label class="chk chk-mini"><input type="checkbox" data-qf="incompletes" ${this.incompletes ? 'checked' : ''}> Seulement les commandes à compléter</label>
      </div>
      <div class="qf-legende" aria-hidden="true"><span class="qf-l ok">équipe choisie</span><span class="qf-l libre">à choisir</span><span class="qf-l auto">sert tout le monde</span><span class="qf-l hors">ne passe pas par là</span></div>`;

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
            : libres ? libres + ' à choisir' : n + ' équipe' + (n > 1 ? 's' : '');
          return `<th scope="col"><button class="qf-col${libres ? ' a-remplir' : ''}" data-qf="col" data-service="${esc(c.service)}"
            title="${libres ? 'Remplir les ' + libres + ' cases vides de ' + esc(this.nom(c.service)) : esc(this.nom(c.service))}"><span class="qf-col-nom">${root.OrlyIcones ? root.OrlyIcones.ico(root.OrlyIcones.icoService(c.service, this.nom(c.service))) : ''}${esc(this.nom(c.service))}</span><small>${esc(sous)}</small></button></th>`;
        }).join('')}
        <th scope="col" class="qf-fin-tete">Prête à</th></tr></thead>`;

      const par = (r && r.parClasse) || {};
      const nbCol = t.colonnes.length + 2;
      const corps = t.lignes.map(l => {
        const c = l.classe;
        const incomplete = t.colonnes.some(col => l.cases[col.service].etat === 'libre');
        const depart = (c.vols || []).map(v => v.depart).filter(Number.isFinite);
        const defaut = (etat.parcours.find(p => p.id === etat.parcoursCabine[c.cabine]) || {}).nom;
        const propre = etat.parcoursClasse[c.id];
        const choix = `<select class="qf-parcours${propre ? ' propre' : ''}" data-at-champ="classe-parcours" data-classe="${esc(c.id)}" aria-label="Chemin de ${esc(P.libelleClasse(c.id))}">
          <option value="">${esc(defaut ? defaut + ' (défaut)' : 'graphe des flux')}</option>
          ${etat.parcours.map(p => `<option value="${esc(p.id)}" ${propre === p.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select>`;
        const cases = t.colonnes.map(col => {
          const k = l.cases[col.service], s = col.service;
          const attrs = `data-qf="case" data-classe="${esc(c.id)}" data-service="${esc(s)}"`;
          if (k.etat === 'hors') return `<td class="qf-c hors" title="${esc(P.libelleClasse(c.id))} ne passe pas par ${esc(this.nom(s))}"></td>`;
          if (k.etat === 'auto') return `<td class="qf-c auto" title="${esc(nomAt(k.ateliers[0]))} sert tout le monde">${esc(nomAt(k.ateliers[0]))}</td>`;
          if (k.etat === 'libre') return `<td class="qf-c"><button class="qf-case libre" ${attrs} aria-haspopup="dialog"
            aria-label="${esc(this.nom(s))} pour ${esc(P.libelleClasse(c.id))} : à choisir"><span class="qf-plus" aria-hidden="true">+</span><span class="sr-only">à choisir</span></button></td>`;
          const lot = lots.get(k.ateliers[0] + '|' + c.id);
          const h = lot && Number.isFinite(lot.debut) ? P.hhmm(lot.debut) + (Number.isFinite(lot.fin) ? '–' + P.hhmm(lot.fin) : '') : '';
          const plus = k.ateliers.length > 1 ? ' +' + (k.ateliers.length - 1) : '';
          const hors = k.etat === 'hors-fait';
          return `<td class="qf-c${hors ? ' hors' : ''}"><button class="qf-case ${hors ? 'alerte' : 'ok'}" ${attrs} aria-haspopup="dialog"
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
      if (sautees.length) phrases.push(`Sans équipe, donc sautée${sautees.length > 1 ? 's' : ''} : ${sautees.map(esc).join(', ')}.`);
      const texte = `<p class="qf-phrase">${phrases.join(' ')}</p>`;
      if (g.debut == null) return texte;

      const t0 = Math.floor(Math.min(g.debut, Number.isFinite(c.echeance) ? c.echeance : g.debut) / 60) * 60;
      const t1 = Math.ceil(Math.max(g.fin, Number.isFinite(c.echeance) ? c.echeance : 0) / 60) * 60 || t0 + 60;
      const L = 1000, G = 150, H = 26, W = L - G - 44, x = t => G + (t - t0) / Math.max(1, t1 - t0) * W;
      const heures = []; for (let t = t0; t <= t1; t += 60) heures.push(t);
      const lignes = g.etapes.map((e, i) => {
        const y = 24 + i * (H + 4);
        const saute = e.absent || e.debut == null;
        const lab = `<text class="qf-t-svc${saute ? ' saute' : ''}" x="4" y="${y + 13}">${esc(this.nom(e.service))}</text>
          <text class="qf-t-br" x="4" y="${y + 24}">${esc(this.groupe(e.branche))}${saute ? ' · sautée, sans équipe' : ''}</text>`;
        if (saute) return lab + `<line class="qf-t-vide" x1="${G}" y1="${y + H / 2}" x2="${G + W}" y2="${y + H / 2}"/>`;
        if (e.dispo) return lab + `<rect class="qf-t-dispo" x="${x(e.debut) - 2}" y="${y + 4}" width="4" height="${H - 8}"><title>${esc(this.nom(e.service))} : disponible</title></rect>`;
        const fin = e.fin == null ? t1 : e.fin, w = Math.max(3, x(fin) - x(e.debut));
        const nomAt = (this.atelier(e.atelier) || {}).nom || '';
        const etiquette = nomAt + ' · ' + P.hhmm(e.debut) + '–' + (e.fin == null ? '…' : P.hhmm(e.fin));
        return lab
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
        ${heures.map(t => `<line class="qf-t-grille" x1="${x(t)}" y1="16" x2="${x(t)}" y2="${haut}"/><text class="qf-t-heure" x="${x(t) + 2}" y="12">${P.hhmm(t)}</text>`).join('')}
        ${lignes}${ech}</svg>
        <p class="qf-t-legende"><span class="qf-l ok">travail</span><span class="qf-l attente">attente de l’étape d’avant</span><span class="qf-l echeance">heure de chargement</span></p>`;
    }

    /* ---- le menu d'une case ou d'une colonne ------------------------- */

    menuCase(bouton) {
      const classe = bouton.dataset.classe, service = bouton.dataset.service;
      const t = tableau(this.a.etat(), this.a.classes());
      const col = t.colonnes.find(c => c.service === service);
      const k = t.lignes.find(l => l.classe.id === classe).cases[service];
      const actuelles = k.ateliers;
      const autres = col.libres.filter(id => id !== classe);
      this.ouvrirMenu(bouton, { service, ids: [classe], autres }, `
        <p class="qf-menu-titre">${esc(this.nom(service))} <span>pour</span> ${esc(P.libelleClasse(classe))}</p>
        ${k.etat === 'libre' && autres.length ? `<label class="qf-menu-tout"><input type="checkbox" data-qf="tout">
          <span>et les ${autres.length} autre${autres.length > 1 ? 's' : ''} case${autres.length > 1 ? 's' : ''} « à choisir » de ${esc(this.nom(service))}</span></label>` : ''}
        ${this.choixEquipes(col, actuelles)}
        ${actuelles.length ? `<div class="qf-menu-pied">
          <button class="qf-lien" data-qf="fiche" data-atelier="${esc(actuelles[0])}">Régler ${esc((this.atelier(actuelles[0]) || {}).nom || '')} (heure, effectif)</button>
          <button class="qf-lien danger" data-qf="vider">Vider la case</button></div>` : ''}`);
    }

    menuColonne(bouton) {
      const service = bouton.dataset.service;
      const t = tableau(this.a.etat(), this.a.classes());
      const col = t.colonnes.find(c => c.service === service);
      if (!col.libres.length) {
        return this.ouvrirMenu(bouton, { service, ids: [] }, `<p class="qf-menu-titre">${esc(this.nom(service))}</p>
          <p class="qf-menu-note">Toutes ses cases ont leur équipe.</p>
          ${col.fabriquent.map(id => `<button class="qf-lien" data-qf="fiche" data-atelier="${esc(id)}">Régler ${esc((this.atelier(id) || {}).nom || id)}</button>`).join('')}`);
      }
      this.ouvrirMenu(bouton, { service, ids: col.libres }, `
        <p class="qf-menu-titre">${esc(this.nom(service))} <span>— ${col.libres.length} case${col.libres.length > 1 ? 's' : ''} à choisir</span></p>
        <p class="qf-menu-note">Toutes vont à :</p>
        ${this.choixEquipes(col, [])}`);
    }

    choixEquipes(col, actuelles) {
      const equipes = col.fabriquent.map(id => this.atelier(id)).filter(Boolean);
      const decrit = a => (a.debut || '') + (a.jour ? ' (J' + a.jour + ')' : '') + ' · ' + (a.personnes ?? 0) + ' pers. · '
        + (a.lots || []).length + ' fabrication' + ((a.lots || []).length > 1 ? 's' : '');
      const nom = this.nom(col.service);
      // Une plonge lave, un magasin met à disposition : on ne le propose que là.
      const lave = /plonge|lavage|laverie/i.test(col.service + ' ' + nom);
      const sert = /magasin|stock|dispo/i.test(col.service + ' ' + nom);
      return `<div class="qf-menu-liste" role="group" aria-label="Équipes de ${esc(nom)}">
        ${equipes.map(a => `<button class="qf-choix${actuelles.includes(a.id) ? ' actuel' : ''}" data-qf="choisir" data-atelier="${esc(a.id)}"
          ${actuelles.includes(a.id) ? 'aria-current="true"' : ''}>
          <span class="qf-coche" aria-hidden="true">${actuelles.includes(a.id) ? '✓' : ''}</span>
          <span><b>${esc(a.nom)}</b><small>${esc(decrit(a))}</small></span></button>`).join('')}
        <button class="qf-choix nouveau" data-qf="nouvelle" data-type="manuel"><span class="qf-coche" aria-hidden="true">+</span>
          <span><b>Nouvelle équipe</b><small>de ${esc(nom)}, réglable ensuite</small></span></button>
        ${equipes.length || !(lave || sert) ? '' : `<p class="qf-menu-note">ou, s’il travaille pour tout le monde :</p>`}
        ${!equipes.length && lave ? `<button class="qf-choix nouveau" data-qf="nouvelle" data-type="lavage"><span class="qf-coche" aria-hidden="true">+</span>
          <span><b>Une plonge</b><small>lave les retours, pour toutes les commandes</small></span></button>` : ''}
        ${!equipes.length && sert ? `<button class="qf-choix nouveau" data-qf="nouvelle" data-type="dispo"><span class="qf-coche" aria-hidden="true">+</span>
          <span><b>Une mise à disposition</b><small>sert toutes les commandes sans les préparer</small></span></button>` : ''}
      </div>`;
    }

    ouvrirMenu(bouton, cible, html) {
      this.fermerMenu();
      const boite = this.a.boite();
      const m = document.createElement('div');
      m.className = 'qf-menu'; m.setAttribute('role', 'dialog');
      m.setAttribute('aria-label', 'Choisir l’équipe');
      m.innerHTML = html;
      boite.appendChild(m);
      const rb = boite.getBoundingClientRect(), rc = bouton.getBoundingClientRect();
      const left = Math.max(0, Math.min(rc.left - rb.left, rb.width - m.offsetWidth));
      m.style.left = left + 'px';
      m.style.top = (rc.bottom - rb.top + 4) + 'px';
      this.menu = { el: m, retour: bouton, t: performance.now(), ...cible };
      bouton.setAttribute('aria-expanded', 'true');
      const f = m.querySelector('.qf-choix, button'); if (f) f.focus({ preventScroll: true });
    }

    fermerMenu() {
      if (!this.menu) return;
      this.menu.el.remove();
      if (this.menu.retour) this.menu.retour.removeAttribute('aria-expanded');
      this.menu = null;
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
      const action = b.dataset.pcAction;
      const p = this.parcoursActif(this.a.etat()), pid = p && p.id;
      const trouver = etat => etat.parcours.find(x => x.id === pid);
      const s = b.dataset.service;
      if (action === 'voir') { this.actif = b.dataset.parcours; this.sel = null; return this.rendre(); }
      if (action === 'equipes') return this.a.voirEquipes ? this.a.voirEquipes(s) : null;
      if (action === 'reorganiser') return this.diagramme() && this.diagramme().reorganiser();
      if (action === 'relier-depuis') return this.diagramme() && this.diagramme().relierDepuis(s);
      if (action === 'lien-retirer') return this.retirerLien(b.dataset.lien);
      if (action === 'fiche') return this.a.ouvrirAtelier && this.a.ouvrirAtelier(b.dataset.atelier, true);
      if (action === 'parcours-ajouter') {
        const id = uid();
        this.actif = id; this.sel = null;
        return this.a.changer(etat => {
          etat.parcours.push({ id, nom: 'Nouveau chemin', noeuds: [], liens: [], prepa: true });
        }, 'Chemin créé : ajoutez ses services (« Ajouter un service »), puis reliez-les en tirant un trait.');
      }
      if (action === 'types') {
        const t = parcoursTypes(this.a.services().map(x => x.id));
        return this.a.changer(etat => { Object.assign(etat, t); }, 'Chemins types créés.');
      }
      if (action === 'parcours-retirer') {
        if (!confirm('Supprimer le chemin « ' + (p ? p.nom : '') + ' » ? Les commandes qui le suivaient retomberont sur les liens de l’unité. L’action est annulable.')) return;
        this.actif = null; this.sel = null;
        return this.a.changer(etat => {
          etat.parcours = etat.parcours.filter(x => x.id !== pid);
          for (const c of Object.keys(etat.parcoursCabine)) if (etat.parcoursCabine[c] === pid) delete etat.parcoursCabine[c];
          for (const c of Object.keys(etat.parcoursClasse)) if (etat.parcoursClasse[c] === pid) delete etat.parcoursClasse[c];
        }, 'Chemin supprimé.');
      }
      if (action === 'noeud-retirer') {
        this.sel = null;
        if (this.service() === s) this.choisirService('');
        return this.a.changer(etat => {
          const q = trouver(etat);
          q.noeuds = q.noeuds.filter(x => x !== s);
          q.liens = q.liens.filter(l => l.de !== s && l.vers !== s);
        }, this.nom(s) + ' quitte ce chemin, avec ses liens. Vous pouvez annuler.');
      }
      if (action === 'equipe-nouvelle') { this.creerEquipe(s); return; }
    }

    geste(q) {
      const quoi = q.dataset.qf, classes = this.a.classes();
      if (quoi === 'case') return this.menu && this.menu.retour === q ? this.fermerMenu() : this.menuCase(q);
      if (quoi === 'col') return this.menu && this.menu.retour === q ? this.fermerMenu() : this.menuColonne(q);
      if (quoi === 'suivre') {
        const id = q.dataset.classe;
        if (this.suivies.has(id)) this.suivies.delete(id); else this.suivies.add(id);
        return this.rendre();
      }
      if (quoi === 'remplir') {
        return this.a.changer(etat => { completer(etat, classes); },
          'Cases remplies là où le service n’a qu’une équipe. Les autres attendent votre choix : cliquez-les.');
      }
      const m = this.menu; if (!m) return;
      const tout = m.el.querySelector('[data-qf="tout"]');
      const ids = m.ids.concat(tout && tout.checked ? m.autres : []);
      const service = m.service, nomSvc = this.nom(service);
      if (quoi === 'fiche') { const id = q.dataset.atelier; this.fermerMenu(); return this.a.ouvrirAtelier && this.a.ouvrirAtelier(id, true); }
      if (quoi === 'vider') {
        return this.a.changer(etat => { affecter(etat, service, ids, null, classes); },
          nomSvc + ' : ' + ids.join(', ') + ' n’a plus d’équipe. L’étape sera sautée.');
      }
      if (quoi === 'choisir') {
        const a = this.atelier(q.dataset.atelier);
        return this.a.changer(etat => { affecter(etat, service, ids, q.dataset.atelier, classes); },
          (a ? a.nom : '') + ' prépare ' + (ids.length > 3 ? ids.length + ' commandes de plus' : ids.map(P.libelleClasse).join(', ')) + '.');
      }
      if (quoi === 'nouvelle') {
        const type = q.dataset.type;
        let cree = null;
        this.a.changer(etat => {
          const a = nouvelleEquipe(etat, service, nomSvc, [], classes);
          if (type === 'lavage') Object.assign(a, { type: 'lavage', plafond: 0,
            tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }] });
          else if (type === 'dispo') Object.assign(a, { type: 'dispo', personnes: 0, pauses: [], permanent: true });
          else affecter(etat, service, ids, a.id, classes);
          cree = a;
        });
        if (!cree || !this.a.ouvrirAtelier) return;
        // Sa fiche s'ouvre dans l'onglet « Les équipes » : il reste son heure et son effectif.
        return this.a.ouvrirAtelier(cree.id, false, 'Équipe « ' + cree.nom + ' » créée'
          + (type === 'manuel' ? ' pour ' + (ids.length > 3 ? ids.length + ' commandes' : ids.map(P.libelleClasse).join(', ')) : '')
          + '. Réglez son heure et son effectif dans l’onglet « Les équipes » : sa fiche y est ouverte.');
      }
    }

    saisir(e) {
      const el = e.target;
      if (el.dataset.qf === 'incompletes') { this.incompletes = el.checked; return this.filtrer(); }
      const champ = el.dataset.pcChamp; if (!champ) return;
      const p = this.parcoursActif(this.a.etat()), pid = p && p.id;
      const v = el.value;
      if (champ === 'noeud-ajout' && !v) return;
      // Laisser le `change` se terminer avant de redessiner : sinon le champ
      // qu'on quitte est arraché pendant son propre événement.
      setTimeout(() => this.a.changer(etat => {
        const q = etat.parcours.find(x => x.id === pid);
        if (champ === 'cabine') { if (v) etat.parcoursCabine[el.dataset.cabine] = v; else delete etat.parcoursCabine[el.dataset.cabine]; }
        else if (champ === 'nom') q.nom = v;
        else if (champ === 'noeud-ajout' && !q.noeuds.includes(v)) { q.noeuds.push(v); this.sel = null; this.choisirService(v); }
      }, champ === 'noeud-ajout' ? this.nom(v) + ' ajouté au chemin : tirez un trait depuis ou vers lui.' : 'Chemin enregistré.'), 0);
    }
  }

  const api = { insererPrepa, depuisBranches, creeBoucle, parcoursTypes, validerParcours, etapesOrdonnees, couverture, confier, nouvelleEquipe,
    completer, colonnes, tableau, affecter, chronogramme, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
