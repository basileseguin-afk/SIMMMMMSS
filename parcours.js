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
   * Une classe dans le temps, branche par branche : pour chaque étape, le lot
   * qui la travaille (début, fin, attente). La jonction apparaît sur chaque
   * branche qui y mène, au même instant : c'est là qu'on voit laquelle arrive
   * la dernière.
   */
  function chronogramme(resultat, parcours, classeId) {
    const lots = (resultat && resultat.lots) || [];
    const lot = s => lots.find(l => l.service === s && (l.classes || []).includes(classeId)) || null;
    const lanes = parcours.branches.map(b => ({ nom: b.nom, etapes: b.services.map(s => {
      const l = lot(s);
      return { service: s, debut: l ? l.debut : null, fin: l ? l.fin : null, attente: l ? (l.attente || 0) : 0,
        atelier: l ? l.atelier : null, dispo: !!(l && l.dispo), absent: !l };
    }) }));
    const temps = lanes.flatMap(x => x.etapes).flatMap(e => [e.debut == null ? null : e.debut - e.attente, e.fin]).filter(Number.isFinite);
    return { lanes, debut: temps.length ? Math.min(...temps) : null, fin: temps.length ? Math.max(...temps) : null };
  }

  /* ======================================================================
   *  L'ÉDITEUR
   * ====================================================================*/

  class EditeurParcours {
    /**
     * @param {object} a adaptateur :
     *   boite()          — l'élément où se dessiner
     *   etat()           — { parcours, parcoursCabine, parcoursClasse } (lecture)
     *   changer(fn, msg) — applique `fn(etat)` sur l'état et enregistre
     *   services()       — [{id, nom}]
     *   classes()        — les compagnies × classes du moment
     *   resultat()       — la journée calculée, pour les heures
     *   ouvrirAtelier(id) — déplie la fiche d'une équipe
     */
    constructor(a) {
      this.a = a;
      this.ouvert = null;
      this.chrono = {};     // classe montée dans le temps, par parcours
      const boite = a.boite();
      boite.addEventListener('click', e => this.cliquer(e));
      boite.addEventListener('change', e => this.saisir(e));
    }

    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }

    rendre() {
      const boite = this.a.boite(), etat = this.a.etat();
      const services = this.a.services();
      const classes = this.a.classes();
      const optionsService = choisi => services.map(s =>
        `<option value="${esc(s.id)}" ${s.id === choisi ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')
        + (choisi && !services.some(s => s.id === choisi) ? `<option value="${esc(choisi)}" selected>${esc(choisi)} (absent du plan)</option>` : '');
      const optionsParcours = (choisi, vide) => `<option value="">${esc(vide)}</option>`
        + etat.parcours.map(p => `<option value="${esc(p.id)}" ${p.id === choisi ? 'selected' : ''}>${esc(p.nom)}</option>`).join('');

      const qui = p => {
        const cab = P.CABINES.filter(c => etat.parcoursCabine[c] === p.id);
        const cls = Object.entries(etat.parcoursClasse).filter(([, v]) => v === p.id).map(([k]) => k);
        const n = classes.filter(c => (parcoursDe(etat, c) || {}).id === p.id).length;
        return (cab.length ? 'classes ' + cab.join(', ') : '')
          + (cls.length ? (cab.length ? ' · ' : '') + cls.join(', ') : '')
          + (n ? ' — ' + n + ' compagnie(s) × classe(s)' : '') || 'aucune classe';
      };

      const couv = couverture(etat, classes);
      const cartes = etat.parcours.map((p, ip) => {
        const ouvert = this.ouvert === p.id;
        const cv = couv.find(x => x.parcours.id === p.id);
        const aConfier = cv.etapes.reduce((n, e) => n + e.manquantes.length, 0);
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
            <span class="pc-qui">${esc(qui(p))}${aConfier ? ` · <b class="pc-a-confier">${aConfier} fabrication(s) sans équipe</b>` : ''}</span>
            ${ouvert ? '' : `<button class="btn btn-sm" data-pc-action="ouvrir">Modifier les branches</button>`}
          </header>
          ${ouvert ? '' : this.flux(p, cv, classes) + this.temps(p, cv, classes)}
          ${edition}
        </article>`;
      }).join('');

      boite.innerHTML = `
        <div class="pc-defauts">
          <span class="pc-defauts-lab">Par défaut</span>
          ${P.CABINES.map(c => `<label>${c}<select data-pc-champ="cabine" data-cabine="${c}">${optionsParcours(etat.parcoursCabine[c], 'graphe des flux')}</select></label>`).join('')}
        </div>
        ${couv.some(c => c.etapes.some(e => e.manquantes.length && e.fabriquent.length === 1))
          ? `<div class="pc-completer"><button class="btn btn-play btn-sm" data-pc-action="completer">Confier les classes sans équipe</button>
             <span class="mini-note">à l’équipe de leur étape, là où il n’y en a qu’une.</span></div>` : ''}
        ${cartes || '<p class="mini-note">Aucun parcours : chaque classe suit le graphe du Centre des flux.</p>'}
        <div class="pc-actions">
          <button class="btn btn-sm" data-pc-action="parcours-ajouter">+ Parcours</button>
          ${etat.parcours.length ? '' : '<button class="btn btn-sm" data-pc-action="types">Créer les parcours types</button>'}
        </div>`;
    }

    /* Les heures d'une équipe pour les classes d'un parcours. */
    plage(atelierId, ids) {
      const r = this.a.resultat ? this.a.resultat() : null;
      const lots = ((r && r.lots) || []).filter(l => l.atelier === atelierId && (l.classes || []).some(c => ids.includes(c)));
      const d = lots.map(l => l.debut).filter(Number.isFinite), f = lots.map(l => l.fin).filter(Number.isFinite);
      if (!d.length) return '';
      return P.hhmm(Math.min(...d)) + (f.length ? '–' + P.hhmm(Math.max(...f)) : '');
    }

    /* Une étape : le service, ses équipes et leurs heures, ce qui manque. */
    boiteEtape(pid, e, n) {
      const etat = this.a.etat();
      const nomAt = id => ((etat.ateliers || []).find(a => a.id === id) || {}).nom || id;
      const couvre = n - e.manquantes.length;
      const statut = e.lavage ? 'lave les retours' : e.dispo ? 'mise à disposition' : n ? couvre + ' / ' + n + ' classes' : 'aucune classe';
      const classe = e.lavage || e.dispo ? 'neutre' : !n ? 'vide' : e.manquantes.length ? 'manque' : 'ok';
      const ids = e.classes.map(x => x.id);
      const chips = e.equipes.map(id => {
        const a = (etat.ateliers || []).find(x => x.id === id) || {};
        const h = this.plage(id, ids);
        return `<button class="pc-chip" data-pc-action="equipe" data-atelier="${esc(id)}" title="Ouvrir la fiche de ${esc(a.nom)}">
          ${esc(a.nom)}${h ? ` <span>${h}</span>` : ''}</button>`;
      }).join('');
      let action = '';
      if (e.manquantes.length) {
        const liste = esc(e.manquantes.slice(0, 4).join(', ') + (e.manquantes.length > 4 ? '…' : ''));
        action = e.fabriquent.length === 1
          ? `<button class="btn btn-sm" data-pc-action="confier" data-service="${esc(e.service)}" data-atelier="${esc(e.fabriquent[0])}"
              title="${liste}">Confier ${e.manquantes.length === 1 ? 'la classe' : 'les ' + e.manquantes.length} à ${esc(nomAt(e.fabriquent[0]))}</button>`
          : e.fabriquent.length > 1
            ? `<select data-pc-champ="confier" data-service="${esc(e.service)}" aria-label="Confier les classes sans équipe de ${esc(this.nom(e.service))}">
                <option value="">Confier les ${e.manquantes.length} à…</option>
                ${e.fabriquent.map(id => `<option value="${esc(id)}">${esc(nomAt(id))}</option>`).join('')}</select>`
            : `<select data-pc-champ="equipe-creer" data-service="${esc(e.service)}" title="${liste}"
                aria-label="Poser une équipe à l’étape ${esc(this.nom(e.service))}">
                <option value="">+ Équipe ici…</option>
                <option value="manuel">qui fabrique ses ${e.manquantes.length} classe${e.manquantes.length > 1 ? 's' : ''}</option>
                <option value="lavage">une plonge (lave les retours)</option>
                <option value="dispo">une mise à disposition (sert tout)</option></select>`;
      }
      return `<div class="pc-box ${classe}" data-service="${esc(e.service)}">
        <div class="pc-box-tete"><b>${esc(this.nom(e.service))}</b><span>${esc(statut)}</span></div>
        ${chips ? `<div class="pc-chips">${chips}</div>` : ''}
        ${action ? `<div class="pc-box-action">${action}</div>` : ''}
      </div>`;
    }

    /* Le parcours en branches : une ligne par branche, la jonction à droite. */
    flux(p, cv, classes) {
      if (!p.branches.length) return '<p class="mini-note">Ce parcours n’a pas encore de branche.</p>';
      const n = cv.classes.length;
      const etape = s => cv.etapes.find(e => e.service === s);
      const derniers = p.branches.map(b => b.services[b.services.length - 1]);
      const jonction = p.branches.length > 1 && derniers.every(x => x && x === derniers[0]) ? derniers[0] : null;
      const fleche = '<span class="pc-fleche" aria-hidden="true">→</span>';
      const lanes = p.branches.map(b => {
        const pas = jonction ? b.services.slice(0, -1) : b.services;
        return `<div class="pc-lane"><span class="pc-lane-nom">${esc(b.nom)}</span>
          <div class="pc-lane-etapes">${pas.map(s => this.boiteEtape(p.id, etape(s), n)).join(fleche)}${jonction ? fleche : ''}</div></div>`;
      }).join('');
      return `<div class="pc-flux${jonction ? ' avec-jonction' : ''}">
        <div class="pc-lanes">${lanes}</div>
        ${jonction ? `<div class="pc-jonction-col">${this.boiteEtape(p.id, etape(jonction), n)}</div>` : ''}
      </div>`;
    }

    /* Une classe du parcours dans le temps : ses branches, et où elles se rejoignent. */
    temps(p, cv, classes) {
      const r = this.a.resultat ? this.a.resultat() : null;
      const siennes = classes.filter(c => cv.classes.includes(c.id)).sort((x, y) => x.echeance - y.echeance);
      if (!siennes.length || !r || !r.lots) return '';
      const choisie = siennes.find(c => c.id === this.chrono[p.id]) || siennes[0];
      const g = chronogramme(r, p, choisie.id);
      const select = `<label class="pc-chrono-choix">Dans le temps
        <select data-pc-champ="chrono" data-parcours="${esc(p.id)}">${siennes.map(c =>
          `<option value="${esc(c.id)}" ${c.id === choisie.id ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select></label>`;
      if (g.debut == null) return `<div class="pc-chrono">${select}<p class="mini-note">${esc(choisie.id)} n’est encore travaillée nulle part.</p></div>`;
      const t0 = Math.floor(g.debut / 60) * 60, t1 = Math.ceil(Math.max(g.fin, choisie.echeance || 0) / 60) * 60;
      const L = 1000, G = 90, H = 24, W = L - G - 36, x = t => G + (t - t0) / Math.max(1, t1 - t0) * W;
      const heures = []; for (let t = t0; t <= t1; t += 60) heures.push(t);
      const haut = 22 + g.lanes.length * (H + 6);
      const barres = g.lanes.map((lane, i) => {
        const y = 22 + i * (H + 6);
        return `<text class="pc-ch-lane" x="4" y="${y + 16}">${esc(lane.nom)}</text>` + lane.etapes.map(e => {
          if (e.absent || e.debut == null) return '';
          if (e.dispo) return `<rect class="pc-ch-dispo" x="${x(e.debut) - 2}" y="${y + 3}" width="4" height="${H - 6}"><title>${esc(this.nom(e.service))} : disponible</title></rect>`;
          const fin = e.fin == null ? t1 : e.fin, w = Math.max(3, x(fin) - x(e.debut));
          return (e.attente ? `<rect class="pc-ch-attente" x="${x(e.debut - e.attente)}" y="${y + 9}" width="${Math.max(1, x(e.debut) - x(e.debut - e.attente))}" height="6"><title>Attente des amonts : ${Math.round(e.attente)} min</title></rect>` : '')
            + `<rect class="pc-ch-lot${e.fin == null ? ' inacheve' : ''}" x="${x(e.debut)}" y="${y + 2}" width="${w}" height="${H - 4}" rx="4"><title>${esc(this.nom(e.service))} : ${P.hhmm(e.debut)} → ${e.fin == null ? 'inachevé' : P.hhmm(e.fin)}</title></rect>`
            + (w > 46 ? `<text class="pc-ch-txt" x="${x(e.debut) + 5}" y="${y + 16}">${esc(this.nom(e.service).slice(0, Math.floor(w / 7)))}</text>` : '');
        }).join('');
      }).join('');
      const ech = choisie.echeance != null ? `<line class="pc-ch-echeance" x1="${x(choisie.echeance)}" y1="14" x2="${x(choisie.echeance)}" y2="${haut}"/>
        <text class="pc-ch-echeance-txt" x="${x(choisie.echeance) - 3}" y="11" text-anchor="end">échéance ${P.hhmm(choisie.echeance)}</text>` : '';
      return `<div class="pc-chrono">${select}
        <svg viewBox="0 0 ${L} ${haut + 4}" role="img" aria-label="${esc(choisie.id)} dans le temps, branche par branche">
          ${heures.map(t => `<line class="pc-ch-grille" x1="${x(t)}" y1="16" x2="${x(t)}" y2="${haut}"/><text class="pc-ch-heure" x="${x(t) + 2}" y="11">${P.hhmm(t)}</text>`).join('')}
          ${barres}${ech}
        </svg></div>`;
    }

    cliquer(e) {
      const b = e.target.closest('[data-pc-action]'); if (!b) return;
      const carte = b.closest('[data-parcours]'), pid = carte && carte.dataset.parcours;
      const br = b.closest('[data-branche]'), ib = br ? +br.dataset.branche : -1;
      const action = b.dataset.pcAction;
      if (action === 'ouvrir') { this.ouvert = pid; return this.rendre(); }
      if (action === 'equipe') return this.a.ouvrirAtelier && this.a.ouvrirAtelier(b.dataset.atelier);
      if (action === 'completer') {
        return this.a.changer(etat => { completer(etat, this.a.classes()); },
          'Classes confiées aux équipes de leur étape. Là où il y a plusieurs équipes, ou aucune, choisissez à l’étape.');
      }
      if (action === 'confier') {
        const service = b.dataset.service;
        this.nouvelle = null;
        this.a.changer(etat => {
          const cv = couverture(etat, this.a.classes()).find(x => x.parcours.id === pid);
          const e = cv && cv.etapes.find(x => x.service === service);
          if (!e || !e.manquantes.length) return;
          confier(etat, b.dataset.atelier, e.manquantes, this.a.classes());
        }, 'Classes confiées.');
        return;
      }
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

    saisir(e) {
      const el = e.target, champ = el.dataset.pcChamp; if (!champ) return;
      const carte = el.closest('[data-parcours]'), pid = carte && carte.dataset.parcours;
      const br = el.closest('[data-branche]'), ib = br ? +br.dataset.branche : -1;
      const v = el.value;
      if (champ === 'chrono') { this.chrono[el.dataset.parcours] = v; return this.rendre(); }
      if (champ === 'equipe-creer') {
        if (!v) return;
        const service = el.dataset.service;
        return setTimeout(() => {
          this.nouvelle = null;
          this.a.changer(etat => {
            const cv = couverture(etat, this.a.classes()).find(x => x.parcours.id === pid);
            const e = cv && cv.etapes.find(x => x.service === service);
            if (!e) return;
            const a = nouvelleEquipe(etat, service, this.nom(service), v === 'manuel' ? e.manquantes : [], this.a.classes());
            // Une plonge lave, une mise à disposition sert : ni lots ni effectif à fabriquer.
            if (v === 'lavage') Object.assign(a, { type: 'lavage', lots: [], plafond: 0,
              tunnels: [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }] });
            if (v === 'dispo') Object.assign(a, { type: 'dispo', lots: [], personnes: 0, pauses: [], permanent: true });
            this.nouvelle = a.id;
          }, 'Équipe posée à cette étape : réglez son heure et son effectif.');
          // Elle s'ouvre aussitôt : il reste son heure et son effectif.
          if (this.nouvelle && this.a.ouvrirAtelier) this.a.ouvrirAtelier(this.nouvelle);
        }, 0);
      }
      if (champ === 'confier') {
        if (!v) return;
        const service = el.dataset.service;
        return setTimeout(() => this.a.changer(etat => {
          const cv = couverture(etat, this.a.classes()).find(x => x.parcours.id === pid);
          const e = cv && cv.etapes.find(x => x.service === service);
          if (e && e.manquantes.length) confier(etat, v, e.manquantes, this.a.classes());
        }, 'Classes confiées.'), 0);
      }
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
    completer, chronogramme, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
