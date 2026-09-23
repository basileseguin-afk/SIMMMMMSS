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

  /** Les services où au moins deux branches se retrouvent. */
  function jonctions(p) {
    const vus = new Map();
    for (const b of p.branches) for (const s of new Set(b.services)) vus.set(s, (vus.get(s) || 0) + 1);
    return [...vus].filter(([, n]) => n > 1).map(([s]) => s);
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
     */
    constructor(a) {
      this.a = a;
      this.ouvert = null;
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

      const cartes = etat.parcours.map((p, ip) => {
        const j = jonctions(p);
        const ouvert = this.ouvert === p.id;
        const resume = p.branches.map(b => `<li><b>${esc(b.nom)}</b> ${b.services.map(s => esc(this.nom(s))).join(' → ') || '<em>vide</em>'}</li>`).join('');
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
            <span class="pc-qui">${esc(qui(p))}</span>
            ${ouvert ? '' : `<button class="btn btn-sm" data-pc-action="ouvrir">Modifier</button>`}
          </header>
          ${ouvert ? '' : `<ul class="pc-resume">${resume}</ul>`}
          ${!ouvert && j.length ? `<p class="pc-jonction">Les branches se rejoignent à <b>${j.map(s => esc(this.nom(s))).join(', ')}</b>.</p>` : ''}
          ${edition}
        </article>`;
      }).join('');

      boite.innerHTML = `
        <div class="pc-defauts">
          <span class="pc-defauts-lab">Par défaut</span>
          ${P.CABINES.map(c => `<label>${c}<select data-pc-champ="cabine" data-cabine="${c}">${optionsParcours(etat.parcoursCabine[c], 'graphe des flux')}</select></label>`).join('')}
        </div>
        ${cartes || '<p class="mini-note">Aucun parcours : chaque classe suit le graphe du Centre des flux.</p>'}
        <div class="pc-actions">
          <button class="btn btn-sm" data-pc-action="parcours-ajouter">+ Parcours</button>
          ${etat.parcours.length ? '' : '<button class="btn btn-sm" data-pc-action="types">Créer les parcours types</button>'}
        </div>`;
    }

    cliquer(e) {
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

    saisir(e) {
      const el = e.target, champ = el.dataset.pcChamp; if (!champ) return;
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

  const api = { parcoursTypes, validerParcours, EditeurParcours };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyParcours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
