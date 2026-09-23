/* ==========================================================================
 *  PARCOURS DES COMPAGNIES × CLASSES — le chemin de chaque classe
 *
 *  Toutes les classes ne passent pas par les mêmes services : un plateau
 *  d'économie ne voit ni la cuisine ni la légumerie. Un parcours dit, pour
 *  une classe, par où elle passe — en BRANCHES qui partent en parallèle et se
 *  rejoignent :
 *
 *      Agro      appros → légumerie → cuisine → montage
 *      Matériel  plonge → dotation ─────────→ montage
 *      Magasin   magasin ───────────────────→ montage
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

  /**
   * Les parcours types de l'unité, d'après les services du plan de base.
   * « Montage » est le service `prepa`. Rien n'empêche d'insérer une
   * préparation distincte : c'est une annexe à tracer, puis une étape à ajouter.
   */
  function parcoursTypes(servicesConnus) {
    const connus = servicesConnus ? new Set(servicesConnus) : null;
    const garder = liste => (connus ? liste.filter(s => connus.has(s)) : liste);
    const branche = (nom, services) => ({ nom, services: garder(services) });
    const nettoyer = p => ({ ...p, branches: p.branches.filter(b => b.services.length >= 2) });
    const parcours = [
      nettoyer({ id: 'complet', nom: 'Complet', branches: [
        branche('Agro', ['appros', 'decontam', 'cuisine', 'prepa']),
        branche('Matériel', ['plonge', 'dotation', 'prepa']),
        branche('Magasin', ['magasin', 'prepa'])
      ] }),
      nettoyer({ id: 'sans-cuisine', nom: 'Sans cuisine', branches: [
        branche('Agro', ['appros', 'prepa']),
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
      const branches = (Array.isArray(p.branches) ? p.branches : []).slice(0, 20).map((br, i) => {
        const services = (Array.isArray(br) ? br : (br && br.services) || [])
          .map(s => texte(s, 160)).filter(Boolean).slice(0, 30);
        return { nom: texte(br && br.nom, 80) || 'Branche ' + (i + 1), services };
      });
      return { id, nom: texte(p.nom, 80) || 'Parcours', branches };
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
   * parcours, rangés par branche (Agro, Matériel…), puis ce qui vient à partir
   * de la jonction, dans l'ordre du flux.
   *
   * @returns [{ service, groupe }]
   */
  function colonnes(parcours) {
    const liste = parcours || [];
    const apres = new Set();
    for (const p of liste) {
      const compte = new Map();
      for (const b of p.branches) for (const s of new Set(b.services)) compte.set(s, (compte.get(s) || 0) + 1);
      if (p.branches.length < 2) continue;
      for (const b of p.branches) {
        const i = b.services.findIndex(s => compte.get(s) > 1);
        if (i >= 0) for (const s of b.services.slice(i)) apres.add(s);
      }
    }
    const avant = [], vus = new Set();
    for (const p of liste) for (const b of p.branches) for (const s of b.services) {
      if (apres.has(s) || vus.has(s)) continue;
      vus.add(s); avant.push({ service: s, groupe: b.nom });
    }
    const groupes = [...new Set(avant.map(c => c.groupe))];
    const fin = etapesOrdonnees({ branches: liste.flatMap(p => p.branches) })
      .filter(s => apres.has(s)).map(s => ({ service: s, groupe: 'Jonction' }));
    return groupes.flatMap(g => avant.filter(c => c.groupe === g)).concat(fin);
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

  const AIDE_PARCOURS = `<p>Un <b>parcours</b> dit par où passe une compagnie × classe, en
    <b>branches</b> qui démarrent en même temps et se rejoignent : l’agro par les appros et la cuisine,
    le matériel par la plonge et la dotation, le produit compagnie par le magasin, tout se retrouvant
    au montage.</p><p>Chaque classe (BC, YC…) suit un parcours par défaut ; une compagnie × classe
    peut en suivre un autre, dans le tableau « Qui fabrique quoi ».</p>`;
  const AIDE_TABLEAU = `<p>Chaque <b>case</b> dit quelle équipe fabrique cette compagnie × classe dans
    ce service. Cliquez-la pour choisir l’équipe, en créer une, ou vider la case. Cliquez le
    <b>nom d’un service</b> pour remplir d’un coup toutes ses cases vides.</p>
    <p>Une case vide n’arrête rien : l’étape est simplement sautée, et la simulation le signale.
    Une case grisée : le parcours de la ligne ne passe pas par ce service.</p>
    <p>La dernière colonne dit quand la ligne est prête ; cliquez-la pour la suivre dans le temps,
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
     */
    constructor(a) {
      this.a = a;
      this.ouvert = null;          // parcours dont on modifie les branches
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

    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }
    atelier(id) { return (this.a.etat().ateliers || []).find(a => a.id === id) || null; }

    rendre() {
      this.fermerMenu();
      const etat = this.a.etat(), classes = this.a.classes();
      this.a.boite().innerHTML = this.sectionParcours(etat, classes) + this.sectionTableau(etat, classes);
      this.filtrer();
    }

    /* ---- 1. les parcours --------------------------------------------- */

    sectionParcours(etat, classes) {
      const services = this.a.services();
      const optionsService = choisi => services.map(s =>
        `<option value="${esc(s.id)}" ${s.id === choisi ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')
        + (choisi && !services.some(s => s.id === choisi) ? `<option value="${esc(choisi)}" selected>${esc(choisi)} (absent du plan)</option>` : '');
      const optionsParcours = choisi => '<option value="">aucun (graphe des flux)</option>'
        + etat.parcours.map(p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`).join('');

      const cartes = etat.parcours.map(p => {
        const ouvert = this.ouvert === p.id;
        const cabines = P.CABINES.filter(c => etat.parcoursCabine[c] === p.id);
        const propres = Object.entries(etat.parcoursClasse).filter(([, v]) => v === p.id).map(([k]) => k);
        const n = classes.filter(c => (parcoursDe(etat, c) || {}).id === p.id).length;
        const qui = `<span class="pc-qui">${cabines.length || propres.length ? 'suivi par ' : 'suivi par personne'}
          ${cabines.map(c => `<b class="pc-cab">${c}</b>`).join(' ')}
          ${propres.length ? ` + ${propres.slice(0, 3).map(esc).join(', ')}${propres.length > 3 ? '…' : ''}` : ''}
          ${n ? `<span class="pc-n">· ${n} ligne${n > 1 ? 's' : ''}</span>` : ''}</span>`;
        const edition = ouvert ? `<div class="pc-branches">${p.branches.map((b, ib) => `
          <div class="pc-branche" data-branche="${ib}">
            <input class="pc-branche-nom" value="${esc(b.nom)}" data-pc-champ="branche-nom" aria-label="Nom de la branche ${ib + 1}">
            <div class="pc-chaine">${b.services.map((s, is) => `${is ? '<span class="pc-fleche" aria-hidden="true">→</span>' : ''}
              <span class="pc-etape"><select data-pc-champ="etape" data-etape="${is}" aria-label="Étape ${is + 1} de ${esc(b.nom)}">${optionsService(s)}</select>
              <button class="pc-x" data-pc-action="etape-retirer" data-etape="${is}" title="Retirer cette étape" aria-label="Retirer l’étape ${is + 1}">×</button></span>`).join('')}
              <span class="pc-fleche" aria-hidden="true">→</span>
              <select data-pc-champ="etape-ajout" aria-label="Ajouter une étape à ${esc(b.nom)}"><option value="">+ étape</option>${optionsService('')}</select>
            </div>
            <button class="btn btn-sm at-danger" data-pc-action="branche-retirer">Retirer la branche</button>
          </div>`).join('')}
          <div class="pc-actions">
            <button class="btn btn-sm" data-pc-action="branche-ajouter">+ Branche</button>
            <button class="btn btn-sm at-danger" data-pc-action="parcours-retirer">Supprimer le parcours</button>
            <button class="btn btn-play btn-sm" data-pc-action="fermer">Terminé</button>
          </div></div>` : '';
        return `<article class="pc-carte${ouvert ? ' ouvert' : ''}" data-parcours="${esc(p.id)}">
          <header class="pc-tete">
            ${ouvert ? `<input class="pc-nom" value="${esc(p.nom)}" data-pc-champ="nom" aria-label="Nom du parcours">`
              : `<h4>${esc(p.nom)}</h4>`}
            ${ouvert ? '' : qui}
            ${ouvert ? '' : `<button class="btn btn-sm" data-pc-action="ouvrir">Modifier</button>`}
          </header>
          ${ouvert ? edition : this.schema(p)}
        </article>`;
      }).join('');

      return `<section class="pc-sec" aria-labelledby="pc-t1">
        <div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t1">1. Les parcours <span class="pc-sous">par où passe chaque classe</span></h3>
          <details class="aide"><summary aria-label="Qu’est-ce qu’un parcours ?">?</summary><span class="aide-corps">${AIDE_PARCOURS}</span></details></div>
        <div class="pc-defauts">
          <span class="pc-defauts-lab">Parcours par défaut</span>
          ${P.CABINES.map(c => `<label>${c}<select data-pc-champ="cabine" data-cabine="${c}">${optionsParcours(etat.parcoursCabine[c])}</select></label>`).join('')}
        </div>
        <div class="pc-cartes">${cartes || '<p class="mini-note">Aucun parcours : chaque classe suit le graphe du Centre des flux.</p>'}</div>
        <div class="pc-actions">
          <button class="btn btn-sm" data-pc-action="parcours-ajouter">+ Parcours</button>
          ${etat.parcours.length ? '' : '<button class="btn btn-sm" data-pc-action="types">Créer les parcours types</button>'}
        </div>
      </section>`;
    }

    /* Le schéma d'un parcours : une ligne par branche, la jonction à droite. */
    schema(p) {
      if (!p.branches.length) return '<p class="mini-note">Ce parcours n’a pas encore de branche : « Modifier » pour en ajouter.</p>';
      const derniers = p.branches.map(b => b.services[b.services.length - 1]);
      const jonction = p.branches.length > 1 && derniers.every(x => x && x === derniers[0]) ? derniers[0] : null;
      const boite = s => `<span class="pc-box" data-service="${esc(s)}">${esc(this.nom(s))}</span>`;
      const fleche = '<span class="pc-fleche" aria-hidden="true">→</span>';
      const lanes = p.branches.map(b => {
        const pas = jonction ? b.services.slice(0, -1) : b.services;
        return `<div class="pc-lane"><span class="pc-lane-nom">${esc(b.nom)}</span>
          <div class="pc-lane-etapes">${pas.map(boite).join(fleche)}${jonction ? '<span class="pc-vers" aria-hidden="true"></span>' : ''}</div></div>`;
      }).join('');
      return `<div class="pc-flux${jonction ? ' avec-jonction' : ''}">
        <div class="pc-lanes">${lanes}</div>
        ${jonction ? `<div class="pc-jonction-col">${boite(jonction)}</div>` : ''}
      </div>`;
    }

    /* ---- 2. qui fabrique quoi ---------------------------------------- */

    sectionTableau(etat, classes) {
      const t = tableau(etat, classes);
      const r = this.a.resultat ? this.a.resultat() : null;
      const titre = `<div class="titre-aide at-titre-aide"><h3 class="at-titre" id="pc-t2">2. Qui fabrique quoi <span class="pc-sous">une équipe par case</span></h3>
        <details class="aide"><summary aria-label="Comment remplir le tableau ?">?</summary><span class="aide-corps">${AIDE_TABLEAU}</span></details></div>`;
      if (!t.lignes.length) return `<section class="qf" aria-labelledby="pc-t2">${titre}
        <p class="mini-note">Aucune compagnie × classe à fabriquer : importez un programme de vols.</p></section>`;
      if (!t.colonnes.length) return `<section class="qf" aria-labelledby="pc-t2">${titre}
        <p class="mini-note">Aucun parcours : décrivez-en un ci-dessus pour que le tableau ait des colonnes.</p></section>`;

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
        <div class="qf-progres" title="${remplies} case(s) ont leur équipe, ${aRemplir} sont à choisir">
          <div class="qf-jauge" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span><b>${remplies} / ${total}</b> cases remplies${aRemplir ? '' : ' — tout a son équipe'}</span></div>
        ${auto ? `<button class="btn btn-play btn-sm" data-qf="remplir" title="Là où un service n’a qu’une équipe, elle prend toutes ses cases vides">Remplir automatiquement · ${auto} case${auto > 1 ? 's' : ''}</button>` : ''}
        <span class="qf-barre-fin"></span>
        <input type="search" class="qf-recherche" data-qf="recherche" placeholder="Chercher une compagnie…" value="${esc(this.recherche)}" aria-label="Chercher une compagnie × classe">
        <label class="chk chk-mini"><input type="checkbox" data-qf="incompletes" ${this.incompletes ? 'checked' : ''}> Lignes à compléter</label>
      </div>
      <div class="qf-legende" aria-hidden="true"><span class="qf-l ok">équipe choisie</span><span class="qf-l libre">à choisir</span><span class="qf-l auto">sert tout le monde</span><span class="qf-l hors">ne passe pas par là</span></div>`;

      // En-têtes : les branches, puis les services.
      const groupes = [];
      for (const c of t.colonnes) {
        const g = groupes[groupes.length - 1];
        if (g && g.nom === c.groupe) g.n++; else groupes.push({ nom: c.groupe, n: 1 });
      }
      const tete = `<thead>
        <tr class="qf-groupes"><th></th>${groupes.map((g, i) => `<th colspan="${g.n}" class="qf-g${g.nom === 'Jonction' ? ' jonction' : ''}" data-g="${i % 4}">${esc(g.nom)}</th>`).join('')}<th></th></tr>
        <tr><th scope="col" class="qf-coin">Compagnie × classe</th>
        ${t.colonnes.map(c => {
          const n = c.fabriquent.length, libres = c.libres.length;
          const sous = c.auto.length && !n ? 'sert tout le monde'
            : (n ? n + ' équipe' + (n > 1 ? 's' : '') : 'aucune équipe') + (libres ? ' · ' + libres + ' à choisir' : '');
          return `<th scope="col"><button class="qf-col${libres ? ' a-remplir' : ''}" data-qf="col" data-service="${esc(c.service)}"
            title="${libres ? 'Remplir les ' + libres + ' cases vides de ' + esc(this.nom(c.service)) : esc(this.nom(c.service))}">${esc(this.nom(c.service))}<small>${esc(sous)}</small></button></th>`;
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
        const choix = `<select class="qf-parcours${propre ? ' propre' : ''}" data-at-champ="classe-parcours" data-classe="${esc(c.id)}" aria-label="Parcours de ${esc(c.id)}">
          <option value="">${esc(defaut ? defaut + ' (défaut)' : 'graphe des flux')}</option>
          ${etat.parcours.map(p => `<option value="${esc(p.id)}" ${propre === p.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select>`;
        const cases = t.colonnes.map(col => {
          const k = l.cases[col.service], s = col.service;
          const attrs = `data-qf="case" data-classe="${esc(c.id)}" data-service="${esc(s)}"`;
          if (k.etat === 'hors') return `<td class="qf-c hors" title="${esc(c.id)} ne passe pas par ${esc(this.nom(s))}"></td>`;
          if (k.etat === 'auto') return `<td class="qf-c auto" title="${esc(nomAt(k.ateliers[0]))} sert tout le monde">${esc(nomAt(k.ateliers[0]))}</td>`;
          if (k.etat === 'libre') return `<td class="qf-c"><button class="qf-case libre" ${attrs} aria-haspopup="dialog"
            aria-label="${esc(this.nom(s))} pour ${esc(c.id)} : à choisir">à choisir</button></td>`;
          const lot = lots.get(k.ateliers[0] + '|' + c.id);
          const h = lot && Number.isFinite(lot.debut) ? P.hhmm(lot.debut) + (Number.isFinite(lot.fin) ? '–' + P.hhmm(lot.fin) : '') : '';
          const plus = k.ateliers.length > 1 ? ' +' + (k.ateliers.length - 1) : '';
          const hors = k.etat === 'hors-fait';
          return `<td class="qf-c${hors ? ' hors' : ''}"><button class="qf-case ${hors ? 'alerte' : 'ok'}" ${attrs} aria-haspopup="dialog"
            title="${hors ? esc(c.id) + ' ne passe pas par ' + esc(this.nom(s)) + ' selon son parcours : ce travail n’est attendu par personne' : esc(nomAt(k.ateliers[0])) + (h ? ' · ' + h : '')}">
            <span class="qf-nom">${hors ? '⚠ ' : ''}${esc(nomAt(k.ateliers[0]))}${plus}</span>${h ? `<small>${h}</small>` : ''}</button></td>`;
        }).join('');
        const v = par[c.id] || {};
        const fin = v.absente || v.fin == null ? '<span class="qf-etat manque">pas encore fabriquée</span>'
          : `<b>${P.hhmm(v.fin)}</b> ${v.aHeure ? '<span class="qf-etat ok">à l’heure</span>' : `<span class="qf-etat retard">+${Math.round(v.retard)} min</span>`}`;
        const suivie = this.suivies.has(c.id);
        return `<tr data-classe="${esc(c.id)}" data-incomplete="${incomplete ? 1 : 0}">
          <th scope="row"><div class="qf-id"><b>${esc(c.id)}</b><small>${depart.length ? 'départ ' + P.hhmm(Math.min(...depart)) : 'hors programme'}</small></div>${choix}</th>
          ${cases}
          <td class="qf-fin"><button class="qf-suivre" data-qf="suivre" data-classe="${esc(c.id)}" aria-expanded="${suivie}"
            title="${suivie ? 'Replier' : 'Suivre ' + esc(c.id) + ' dans le temps, étape par étape'}">${fin}<span class="qf-chevron" aria-hidden="true">${suivie ? '▾' : '▸'}</span></button></td>
        </tr>${suivie ? `<tr class="qf-temps" data-pour="${esc(c.id)}"><td colspan="${nbCol}">${this.temps(l, r)}</td></tr>` : ''}`;
      }).join('');

      return `<section class="qf" aria-labelledby="pc-t2">${titre}${barre}
        <div class="qf-scroll"><table class="qf-table">${tete}<tbody>${corps}</tbody></table></div>
        <p class="mini-note qf-vide-note" hidden>Aucune ligne ne correspond.</p>
      </section>`;
    }

    /* Une ligne dans le temps : une barre par étape, et la phrase qui l'explique. */
    temps(ligne, r) {
      const c = ligne.classe, p = ligne.parcours;
      if (!p) return '<p class="mini-note">Cette ligne n’a pas de parcours : elle suit le graphe du Centre des flux.</p>';
      const g = chronogramme(r, p, c.id);
      const v = ((r && r.parClasse) || {})[c.id] || {};
      const sautees = g.etapes.filter(e => e.absent).map(e => this.nom(e.service));
      const goulot = g.etapes.filter(e => e.attendu).sort((a, b) => b.attente - a.attente)[0];
      const phrases = [];
      if (v.fin == null) phrases.push(`<b>${esc(c.id)}</b> n’est pas encore fabriquée : aucune étape de son parcours n’a d’équipe.`);
      else phrases.push(`<b>${esc(c.id)}</b> est prête à <b>${P.hhmm(v.fin)}</b>`
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
          <text class="qf-t-br" x="4" y="${y + 24}">${esc(e.branche)}${saute ? ' · sautée, sans équipe' : ''}</text>`;
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
      return texte + `<svg class="qf-t" viewBox="0 0 ${L} ${haut + 20}" role="img" aria-label="${esc(c.id)} dans le temps, étape par étape">
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
        <p class="qf-menu-titre">${esc(this.nom(service))} <span>pour</span> ${esc(classe)}</p>
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
          <span><b>Une plonge</b><small>lave les retours, pour toutes les lignes</small></span></button>` : ''}
        ${!equipes.length && sert ? `<button class="qf-choix nouveau" data-qf="nouvelle" data-type="dispo"><span class="qf-coche" aria-hidden="true">+</span>
          <span><b>Une mise à disposition</b><small>sert toutes les lignes sans les fabriquer</small></span></button>` : ''}
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
      const carte = b.closest('[data-parcours]'), pid = carte && carte.dataset.parcours;
      const br = b.closest('[data-branche]'), ib = br ? +br.dataset.branche : -1;
      const action = b.dataset.pcAction;
      if (action === 'ouvrir') { this.ouvert = pid; return this.rendre(); }
      if (action === 'fermer') { this.ouvert = null; return this.rendre(); }
      const trouver = etat => etat.parcours.find(p => p.id === pid);
      if (action === 'parcours-ajouter') {
        const id = uid();
        this.ouvert = id;
        return this.a.changer(etat => {
          etat.parcours.push({ id, nom: 'Nouveau parcours', branches: [{ nom: 'Branche 1', services: [] }] });
        }, 'Parcours créé : ajoutez ses étapes, branche par branche.');
      }
      if (action === 'types') {
        const t = parcoursTypes(this.a.services().map(s => s.id));
        return this.a.changer(etat => { Object.assign(etat, t); }, 'Parcours types créés.');
      }
      if (action === 'parcours-retirer') {
        const p = trouver(this.a.etat());
        if (!confirm('Supprimer le parcours « ' + (p ? p.nom : '') + ' » ? Les classes qui le suivaient retomberont sur le graphe des flux. L’action est annulable.')) return;
        this.ouvert = null;
        return this.a.changer(etat => {
          etat.parcours = etat.parcours.filter(x => x.id !== pid);
          for (const c of Object.keys(etat.parcoursCabine)) if (etat.parcoursCabine[c] === pid) delete etat.parcoursCabine[c];
          for (const c of Object.keys(etat.parcoursClasse)) if (etat.parcoursClasse[c] === pid) delete etat.parcoursClasse[c];
        }, 'Parcours supprimé.');
      }
      if (action === 'branche-ajouter') return this.a.changer(etat => {
        const p = trouver(etat); p.branches.push({ nom: 'Branche ' + (p.branches.length + 1), services: [] });
      }, 'Branche ajoutée.');
      if (action === 'branche-retirer') return this.a.changer(etat => { trouver(etat).branches.splice(ib, 1); }, 'Branche retirée.');
      if (action === 'etape-retirer') return this.a.changer(etat => {
        trouver(etat).branches[ib].services.splice(+b.dataset.etape, 1);
      }, 'Étape retirée.');
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
          (a ? a.nom : '') + ' fabrique ' + (ids.length > 3 ? ids.length + ' lignes de plus' : ids.join(', ')) + '.');
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
        // Sa fiche s'ouvre plus bas, sans quitter le tableau : il reste son heure et son effectif.
        return this.a.ouvrirAtelier(cree.id, false, 'Équipe « ' + cree.nom + ' » créée'
          + (type === 'manuel' ? ' pour ' + (ids.length > 3 ? ids.length + ' lignes' : ids.join(', ')) : '')
          + '. Réglez son heure et son effectif dans « 3. Les équipes », plus bas : sa fiche est ouverte.');
      }
    }

    saisir(e) {
      const el = e.target;
      if (el.dataset.qf === 'incompletes') { this.incompletes = el.checked; return this.filtrer(); }
      const champ = el.dataset.pcChamp; if (!champ) return;
      const carte = el.closest('[data-parcours]'), pid = carte && carte.dataset.parcours;
      const br = el.closest('[data-branche]'), ib = br ? +br.dataset.branche : -1;
      const v = el.value;
      // Laisser le `change` se terminer avant de redessiner : sinon le champ
      // qu'on quitte est arraché pendant son propre événement.
      setTimeout(() => this.a.changer(etat => {
        const p = etat.parcours.find(x => x.id === pid);
        if (champ === 'cabine') { if (v) etat.parcoursCabine[el.dataset.cabine] = v; else delete etat.parcoursCabine[el.dataset.cabine]; }
        else if (champ === 'nom') p.nom = v;
        else if (champ === 'branche-nom') p.branches[ib].nom = v;
        else if (champ === 'etape') p.branches[ib].services[+el.dataset.etape] = v;
        else if (champ === 'etape-ajout' && v) p.branches[ib].services.push(v);
      }, 'Parcours enregistré.'), 0);
    }
  }

  const api = { parcoursTypes, validerParcours, etapesOrdonnees, couverture, confier, nouvelleEquipe,
    completer, colonnes, tableau, affecter, chronogramme, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
