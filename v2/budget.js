/* ==========================================================================
 *  VERSION 2 — LE BUDGET DE LA MAIN-D'ŒUVRE (labor cost)
 *
 *  Comment l'unité planifie (retour d'usage du 01/10) :
 *   · le siège donne un budget mensuel de labor cost, en euros ;
 *   · le contrôleur de gestion le partage par service, puis par jour, selon
 *     le nombre de vols — et, pour certains services, selon le taux de
 *     remplissage des vols (passagers ÷ capacité de l'avion) ;
 *   · le chef de service planifie sa journée face à ce budget du jour ;
 *   · une personne planifiée est payée sa vacation entière ; les heures
 *     supplémentaires valent ×1,25, dans un plafond par jour. Trois heures
 *     sup coûtent donc parfois moins qu'une personne de plus.
 *
 *  Ce module calcule le budget du jour de chaque service et le coût de ce
 *  qui est planifié (vacations + heures sup), et compare « une personne de
 *  plus » et « des heures sup » en rejouant la journée.
 *
 *  ⚠ Le dépôt est public : TOUS les montants par défaut sont FICTIFS.
 *  Les vrais taux et budgets se saisissent dans le site et restent dans le
 *  navigateur et la sauvegarde locale.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const CLE = 'ory-budget-v1';

  /** Valeurs d'exemple, FICTIVES. */
  const DEFAUT = {
    categories: [
      { id: 'agent', nom: 'Agent de production', taux: 18 },
      { id: 'cuisinier', nom: 'Cuisinier', taux: 21 },
      { id: 'chef', nom: 'Chef d’équipe', taux: 25 },
      { id: 'interim', nom: 'Intérimaire', taux: 27 }
    ],
    categorieDefaut: 'agent',
    majoration: 1.25,
    heuresSup: { actif: true, plafond: 180 },
    vacationDefaut: 420,           // une équipe sans règle de poste (minutes)
    mois: { vols: null, remplissage: null, jours: 30 },
    services: {},                  // id → { budget: €/mois, mode: 'vols' | 'remplissage' }
    sieges: { A319: 140, A320: 174, A321: 210, A330: 290, A350: 320, B737: 180, B777: 360, B787: 290, A380: 500 },
    siegesCie: {},                 // « AF/A350 » → sièges
    compo: {}                      // id d'équipe → { catégorie: personnes }
  };

  const nombre = (v, def) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? def : +v);
  const positif = (v, def) => { const n = nombre(v, def); return n === null || n === undefined ? n : Math.max(0, n); };
  const clone = o => JSON.parse(JSON.stringify(o));
  /** Un pictogramme de icones.js (le chevron d'un service qui se déplie), au lieu d'un caractère. */
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');

  /** Relit des réglages (navigateur, sauvegarde) : ce qui manque prend la valeur d'exemple. */
  function valider(r) {
    const x = r && typeof r === 'object' ? r : {};
    const d = clone(DEFAUT);
    const categories = Array.isArray(x.categories) && x.categories.length
      ? x.categories.filter(c => c && typeof c.id === 'string' && c.id).map(c => ({ id: c.id.slice(0, 40), nom: String(c.nom || c.id).slice(0, 80), taux: positif(c.taux, 0) }))
      : d.categories;
    const ids = new Set(categories.map(c => c.id));
    const services = {};
    for (const [k, v] of Object.entries(x.services || {})) {
      if (!v || typeof v !== 'object') continue;
      services[k] = { budget: positif(v.budget, null), mode: v.mode === 'remplissage' ? 'remplissage' : 'vols' };
    }
    const sieges = {};
    for (const [k, v] of Object.entries({ ...d.sieges, ...(x.sieges || {}) })) { const n = positif(v, null); if (n) sieges[k] = n; }
    const siegesCie = {};
    for (const [k, v] of Object.entries(x.siegesCie || {})) { const n = positif(v, null); if (n) siegesCie[k] = n; }
    const compo = {};
    for (const [k, v] of Object.entries(x.compo || {})) {
      if (!v || typeof v !== 'object') continue;
      const c = {};
      for (const [cat, n] of Object.entries(v)) if (ids.has(cat) && positif(n, 0) > 0) c[cat] = Math.round(positif(n, 0));
      if (Object.keys(c).length) compo[k] = c;
    }
    const hs = x.heuresSup || {};
    const m = x.mois || {};
    return {
      categories,
      categorieDefaut: ids.has(x.categorieDefaut) ? x.categorieDefaut : categories[0].id,
      majoration: positif(x.majoration, d.majoration) || d.majoration,
      heuresSup: { actif: hs.actif !== false, plafond: Math.min(720, positif(hs.plafond, d.heuresSup.plafond)) },
      vacationDefaut: positif(x.vacationDefaut, d.vacationDefaut) || d.vacationDefaut,
      mois: { vols: positif(m.vols, null) || null, remplissage: m.remplissage == null || m.remplissage === '' ? null : Math.min(1, positif(m.remplissage, 0)),
        jours: Math.max(1, Math.round(positif(m.jours, d.mois.jours) || d.mois.jours)) },
      services, sieges, siegesCie, compo
    };
  }

  /* ---- les vols du jour ------------------------------------------------ */

  const departs = vols => (vols || []).filter(v => !v.sens || v.sens === 'DEP');
  const paxVol = v => (+v.bc || 0) + (+v.pc || 0) + (+v.yc || 0);
  const cleAvion = v => String(v.avion || '').trim().toUpperCase();
  /** La capacité d'un vol : celle de la compagnie pour cet avion, sinon celle de l'avion. */
  function siegesVol(v, f) {
    const av = cleAvion(v);
    return f.siegesCie[String(v.cie).toUpperCase() + '/' + av] || f.sieges[av] || null;
  }
  /** Passagers ÷ capacité, au plus 100 %. Sans capacité connue : null. */
  function remplissageVol(v, f) {
    const s = siegesVol(v, f);
    return s ? Math.min(1, paxVol(v) / s) : null;
  }

  /** La journée : ses départs, et leur remplissage (les avions sans capacité comptent pleins). */
  function journee(vols, f) {
    const d = departs(vols), inconnus = new Set();
    let somme = 0;
    for (const v of d) {
      const t = remplissageVol(v, f);
      if (t === null) { inconnus.add(cleAvion(v) || '?'); somme += 1; } else somme += t;
    }
    return { vols: d.length, remplissage: d.length ? somme / d.length : 0, poids: somme, inconnus: [...inconnus] };
  }

  /** Le mois de référence : saisi, sinon déduit de la journée (× jours). */
  function mois(vols, f) {
    const j = journee(vols, f);
    return {
      vols: f.mois.vols || j.vols * f.mois.jours,
      remplissage: f.mois.remplissage ?? j.remplissage,
      jours: f.mois.jours,
      deduit: { vols: !f.mois.vols, remplissage: f.mois.remplissage == null }
    };
  }

  /**
   * Le budget du jour d'un service : son budget du mois, au prorata des vols
   * (ou des vols pondérés par leur remplissage).
   */
  function budgetJour(serviceId, vols, f) {
    const s = f.services[serviceId];
    if (!s || !(s.budget > 0)) return null;
    const j = journee(vols, f), m = mois(vols, f);
    const jour = s.mode === 'remplissage' ? j.poids : j.vols;
    const ref = s.mode === 'remplissage' ? m.vols * m.remplissage : m.vols;
    return { montant: ref > 0 ? s.budget * jour / ref : 0, mode: s.mode, jour, ref, budgetMois: s.budget };
  }

  /* ---- le coût d'une équipe -------------------------------------------- */

  /** Les personnes d'une équipe par catégorie : la composition saisie, le reste dans la catégorie par défaut. */
  function parCategorie(a, f) {
    const total = Math.max(0, Math.round(+a.personnes || 0));
    const compo = f.compo[a.id] || {};
    const out = {};
    let compte = 0;
    for (const c of f.categories) if (compo[c.id]) { out[c.id] = compo[c.id]; compte += compo[c.id]; }
    if (total > compte) out[f.categorieDefaut] = (out[f.categorieDefaut] || 0) + total - compte;
    return { parCat: out, personnes: Math.max(total, compte), ecart: compte > total ? compte - total : 0 };
  }

  /**
   * Ce que coûte une équipe ce jour-là : chaque personne est payée sa
   * vacation entière (sa présence), plus ses heures sup majorées.
   * @param vue l'équipe telle que le calcul l'a jouée (présence, heures sup)
   */
  function coutEquipe(a, vue, f) {
    const { parCat, personnes, ecart } = parCategorie(a, f);
    const taux = new Map(f.categories.map(c => [c.id, c.taux]));
    const horaire = Object.entries(parCat).reduce((n, [c, k]) => n + k * (taux.get(c) || 0), 0);   // €/h pour toute l'équipe
    const presence = vue && vue.presence != null ? vue.presence : f.vacationDefaut;
    const sup = vue ? vue.heuresSup || 0 : 0;
    const base = horaire * presence / 60;
    const coutSup = horaire * sup / 60 * f.majoration;
    return { personnes, parCat, ecart, horaire, presence, sup, base, coutSup, total: base + coutSup,
      plafondAtteint: f.heuresSup.actif && sup > 0 && sup >= f.heuresSup.plafond - 1e-6 };
  }

  /**
   * La journée en euros, service par service.
   * @param o { services:[{id, nom}], ateliers, resultat, vols, f }
   */
  function bilan(o) {
    const f = o.f, vues = new Map(((o.resultat && o.resultat.ateliers) || []).map(v => [v.id, v]));
    // Une équipe au repos ce jour-là (règle ⚡) : ses personnes sont payées là où
    // elles travaillent (la vacation et les heures sup de l'équipe qu'elles renforcent) ;
    // quand l'équipe qui reprend absorbe la charge, elles ne sont pas planifiées : rien.
    const repos = new Map(((o.resultat && o.resultat.conditions) || []).filter(c => !c.remplie && !c.sansIssue).map(c => [c.atelier, c]));
    const lignes = (o.services || []).map(s => {
      // Une mise à disposition se paie aussi : ses personnes, une vacation chacune (06/10).
      const equipes = (o.ateliers || []).filter(a => a.service === s.id && (a.type !== 'dispo' || +a.personnes > 0))
        .map(a => {
          const c = repos.get(a.id);
          if (!c) return { a, ...coutEquipe(a, vues.get(a.id), f) };
          const e = c.renforce ? coutEquipe(a, vues.get(c.renforce), f) : coutEquipe({ ...a, personnes: 0 }, null, f);
          return { a, ...e, repos: c };
        });
      const b = budgetJour(s.id, o.vols, f);
      const base = equipes.reduce((n, e) => n + e.base, 0), sup = equipes.reduce((n, e) => n + e.coutSup, 0);
      return { id: s.id, nom: s.nom, budget: b, equipes, base, sup, total: base + sup,
        ecart: b ? b.montant - (base + sup) : null, mode: (f.services[s.id] || {}).mode || 'vols' };
    }).filter(l => l.equipes.length || l.budget);
    const somme = k => lignes.reduce((n, l) => n + (l[k] || 0), 0);
    const avecBudget = lignes.filter(l => l.budget);
    const budget = avecBudget.reduce((n, l) => n + l.budget.montant, 0);
    const ind = (o.resultat && o.resultat.indicateurs) || {};
    return { lignes, base: somme('base'), sup: somme('sup'), total: somme('base') + somme('sup'),
      budget, ecart: avecBudget.length ? budget - avecBudget.reduce((n, l) => n + l.total, 0) : null,
      sansBudget: lignes.filter(l => !l.budget).map(l => l.nom),
      retards: (ind.enRetard || 0) + (ind.pasFinies || 0), heuresSup: lignes.reduce((n, l) => n + l.equipes.reduce((m, e) => m + e.sup * e.personnes, 0), 0) };
  }

  /* ======================================================================
   *  LES PAGES : Budget › Budget du jour, Budget › Paramètres financiers
   * ====================================================================*/

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EUR = typeof Intl !== 'undefined' ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null;
  const eur = n => (n == null || !Number.isFinite(n) ? '—' : EUR ? EUR.format(n) : Math.round(n) + ' €');
  const duree = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; };
  const hhmm = m => { if (m == null || !Number.isFinite(m)) return '—'; const j = Math.floor(m / 1440), x = ((m % 1440) + 1440) % 1440;
    return (j < 0 ? 'J' + j + ' ' : j > 0 ? 'J+' + j + ' ' : '') + String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(Math.round(x % 60)).padStart(2, '0'); };
  const pct = x => Math.round(x * 100) + ' %';

  class Budget {
    /** a : { at() (le centre des équipes), services(), vols(), recalculer(), notify() } */
    constructor(a) {
      this.a = a;
      this.f = Budget.lire();
      this.ouverts = new Set();
      this.essais = {};
      this.construire();
      this.lier();
    }

    static lire() {
      try { const t = root.localStorage && root.localStorage.getItem(CLE); return valider(t ? JSON.parse(t) : null); }
      catch (e) { return valider(null); }
    }
    /** Ce que le moteur doit savoir : les heures sup permises. Lu à chaque calcul. */
    static heuresSup() { const f = Budget.lire(); return { actif: f.heuresSup.actif, plafond: f.heuresSup.plafond }; }

    enregistrer() { try { root.localStorage.setItem(CLE, JSON.stringify(this.f)); } catch (e) { /* stockage indisponible */ } }

    /** Modifier les réglages ; `recalcul` : la journée doit être rejouée (heures sup). */
    changer(fn, recalcul) {
      const avant = JSON.stringify(this.f);
      fn(this.f); this.f = valider(this.f);
      if (JSON.stringify(this.f) === avant) return this.rendre();
      this.enregistrer(); this.essais = {};
      if (recalcul && this.a.recalculer) this.a.recalculer(); else this.rendre();
    }

    construire() {
      const v = root.document.getElementById('view-ateliers'); if (!v) return;
      for (const [id, label] of [['bu-jour', 'Le budget du jour'], ['bu-param', 'Les paramètres financiers']]) {
        if (root.document.getElementById(id)) continue;
        const s = root.document.createElement('section');
        s.id = id; s.className = 'bu'; s.dataset.sous = id; s.setAttribute('aria-label', label);
        v.appendChild(s);
      }
    }

    vues() { const r = this.a.at().resultat; return new Map(((r && r.ateliers) || []).map(x => [x.id, x])); }
    bilan(resultat, ateliers) {
      const at = this.a.at();
      return bilan({ services: this.a.services(), ateliers: ateliers || at.state.ateliers, resultat: resultat || at.resultat, vols: this.a.vols(), f: this.f });
    }

    rendre() { this.rendreJour(); this.rendreParam(); }

    /* ---- Budget du jour ------------------------------------------------ */

    rendreJour() {
      const box = root.document.getElementById('bu-jour'); if (!box) return;
      const b = this.bilan(), j = journee(this.a.vols(), this.f), m = mois(this.a.vols(), this.f);
      const ton = x => (x == null ? 'neutre' : x >= 0 ? 'ok' : 'retard');
      const tuiles = `<div class="bu-tuiles">
        <div class="bu-tuile"><span>Budget du jour</span><b>${b.budget ? eur(b.budget) : '—'}</b><small>${b.sansBudget.length && b.budget ? 'hors ' + b.sansBudget.length + ' service(s) sans budget' : b.budget ? 'services avec budget' : 'aucun budget saisi'}</small></div>
        <div class="bu-tuile"><span>Vacations planifiées</span><b>${eur(b.base)}</b><small>chaque personne payée sa vacation</small></div>
        <div class="bu-tuile"><span>Heures sup</span><b>${eur(b.sup)}</b><small>${duree(b.heuresSup)} × ${String(this.f.majoration).replace('.', ',')}</small></div>
        <div class="bu-tuile"><span>Coût de la journée</span><b>${eur(b.total)}</b><small>${b.retards ? b.retards + ' commande(s) en retard ou pas faites' : 'tout est à l’heure'}</small></div>
        <div class="bu-tuile ${ton(b.ecart)}"><span>${b.ecart == null ? 'Écart' : b.ecart >= 0 ? 'Sous le budget' : 'Au-dessus du budget'}</span><b>${b.ecart == null ? '—' : eur(Math.abs(b.ecart))}</b><small>${b.ecart == null ? 'saisissez les budgets' : 'services avec budget'}</small></div>
      </div>`;
      const base = `<p class="bu-note">Budget du jour = budget du mois × ${j.vols} vol(s) du jour ÷ ${Math.round(m.vols)} vols du mois${m.deduit.vols ? ' (déduit : ' + j.vols + ' × ' + m.jours + ' jours)' : ''} ;
        au remplissage : × ${pct(j.remplissage)} ÷ ${pct(m.remplissage)}${m.deduit.remplissage ? ' (le mois comme ce jour)' : ''}.
        ${j.inconnus.length ? `<b>Capacité inconnue pour ${esc(j.inconnus.join(', '))}</b> : comptés pleins.` : ''}
        <span class="bu-fictif">Montants d’exemple, fictifs.</span>
        <button type="button" class="lien-discret" data-page="bu-param">Paramètres financiers →</button></p>`;
      const ligne = l => {
        const ouvert = this.ouverts.has(l.id), max = Math.max(l.total, l.budget ? l.budget.montant : 0, 1);
        const jauge = `<span class="bu-jauge" title="${esc(eur(l.total))} sur ${esc(l.budget ? eur(l.budget.montant) : 'pas de budget')}">
          <i class="base" style="width:${(l.base / max * 100).toFixed(1)}%"></i><i class="sup" style="width:${(l.sup / max * 100).toFixed(1)}%"></i>
          ${l.budget ? `<i class="repere" style="left:${(l.budget.montant / max * 100).toFixed(1)}%"></i>` : ''}</span>`;
        return `<tr class="bu-svc${ouvert ? ' ouvert' : ''}" data-bu-svc="${esc(l.id)}">
            <th scope="row"><button type="button" class="bu-ouvrir" data-bu-ouvrir="${esc(l.id)}" aria-expanded="${ouvert}">${pic(ouvert ? 'bas' : 'droite')}${esc(l.nom)}</button>
              <small>${pl(l.equipes.length, 'équipe')} · ${pl(l.equipes.reduce((n, e) => n + e.personnes, 0), 'personne')}</small></th>
            <td>${l.budget ? eur(l.budget.montant) + `<small>${l.mode === 'remplissage' ? 'au remplissage' : 'aux vols'}</small>` : '<small>pas de budget</small>'}</td>
            <td>${eur(l.base)}</td><td>${l.sup ? eur(l.sup) : '—'}</td><td><b>${eur(l.total)}</b></td>
            <td class="${ton(l.ecart)}">${l.ecart == null ? '—' : (l.ecart >= 0 ? '−' : '+') + eur(Math.abs(l.ecart))}</td>
            <td>${jauge}</td></tr>`
          + (ouvert ? `<tr class="bu-detail"><td colspan="7">${this.detail(l)}</td></tr>` : '');
      };
      box.innerHTML = tuiles + base + (b.lignes.length ? `<table class="bu-table">
        <thead><tr><th>Service</th><th>Budget du jour</th><th>Vacations</th><th>Heures sup</th><th>Coût</th><th>Écart</th><th class="bu-col-jauge">Coût / budget</th></tr></thead>
        <tbody>${b.lignes.map(ligne).join('')}</tbody></table>`
        : '<p class="mini-note">Aucune équipe pour l’instant : décrivez-les dans Équipes › Services et équipes.</p>');
    }

    /** Les équipes d'un service : composition, vacation, heures sup, et l'arbitrage. */
    detail(l) {
      const vues = this.vues(), cats = this.f.categories;
      return `<table class="bu-equipes"><thead><tr><th>Équipe</th>${cats.map(c => `<th title="${esc(eur(c.taux))} / h">${esc(c.nom)}</th>`).join('')}
        <th>Vacation</th><th>Finit à</th><th>Heures sup</th><th>Coût</th><th></th></tr></thead><tbody>
        ${l.equipes.map(e => {
          const v = vues.get(e.repos ? e.repos.renforce : e.a.id) || {}, essai = this.essais[e.a.id];
          const nomEq = id => ((this.a.at().state.ateliers || []).find(x => x.id === id) || {}).nom || id;
          const repos = e.repos ? ` · <span class="bu-repos">⚡ au repos aujourd’hui${e.repos.renforce ? ' : ses personnes renforcent « ' + esc(nomEq(e.repos.renforce)) + ' »'
            : e.repos.absorbe ? ' : pas planifiée, « ' + esc(nomEq(e.repos.vers)) + ' » absorbe la charge' : ''}</span>` : '';
          return `<tr data-bu-equipe="${esc(e.a.id)}"><th scope="row">${esc(e.a.nom)}<small>${e.personnes} pers.${repos}${e.ecart ? ` · <span class="bu-alerte">la composition compte ${e.ecart} de plus que l’équipe</span>` : ''}</small></th>
            ${cats.map(c => `<td><input type="number" min="0" max="99" class="bu-n" value="${e.parCat[c.id] || 0}" data-bu-compo="${esc(c.id)}" aria-label="${esc(c.nom)} dans ${esc(e.a.nom)}"></td>`).join('')}
            <td>${duree(e.presence)}</td><td>${hhmm(v.fin)}</td>
            <td>${e.sup ? duree(e.sup) + (e.plafondAtteint ? ' <span class="bu-alerte" title="Le plafond est atteint : le travail restant n’est pas fait">plafond</span>' : '') : '—'}</td>
            <td><b>${eur(e.total)}</b>${e.coutSup ? `<small>dont ${eur(e.coutSup)} sup</small>` : ''}</td>
            <td>${e.personnes ? `<button type="button" class="btn btn-sm" data-bu-essai="${esc(e.a.id)}" title="Rejouer la journée avec une personne de plus dans cette équipe">Et avec une personne de plus ?</button>` : ''}</td></tr>
            ${essai ? `<tr class="bu-essai-l"><td colspan="${cats.length + 6}">${this.essaiHTML(e, essai)}</td></tr>` : ''}`;
        }).join('')}</tbody></table>`;
    }

    /* « Et avec une personne de plus ? » : la journée rejouée, comparée en euros et en retards. */
    essayer(id) {
      const at = this.a.at(), a = at.state.ateliers.find(x => x.id === id); if (!a) return;
      // Une personne de plus, même dans un service à l'effectif calculé : on l'impose à cette équipe.
      const autres = at.state.ateliers.map(x => (x.id === id ? { ...x, personnes: (+x.personnes || 0) + 1, effectifFixe: true } : x));
      const r = at.simulerAvec ? at.simulerAvec(autres) : null;
      if (!r || !r.ok) { this.essais[id] = { erreur: true }; return this.rendreJour(); }
      // La personne de plus est de la catégorie par défaut : la composition saisie reste.
      const avant = this.bilan(), apres = this.bilan(r, autres);
      this.essais[id] = { avant, apres, cat: (this.f.categories.find(c => c.id === this.f.categorieDefaut) || {}).nom };
      this.rendreJour();
    }

    essaiHTML(e, s) {
      if (s.erreur) return '<p class="bu-alerte">La journée n’a pas pu être rejouée.</p>';
      const d = s.apres.total - s.avant.total, dr = s.apres.retards - s.avant.retards;
      const verdict = dr < 0 && d <= 0 ? 'Une personne de plus coûte moins cher et livre mieux.'
        : dr < 0 ? `Une personne de plus coûte ${eur(d)} de plus, et rattrape ${-dr} commande(s) en retard.`
        : d < 0 ? `Une personne de plus coûte ${eur(-d)} de moins (moins d’heures sup).`
        : `Les heures sup restent moins chères : une personne de plus coûterait ${eur(d)} de plus, sans gagner de commande à l’heure.`;
      return `<div class="bu-essai"><p><b>Avec ${esc(e.a.nom)} telle qu’elle est</b> : ${eur(s.avant.total)} pour la journée, ${duree(s.avant.heuresSup)} d’heures sup, ${s.avant.retards} commande(s) en retard.</p>
        <p><b>Avec une personne de plus</b> (${esc(s.cat || 'catégorie par défaut')}) : ${eur(s.apres.total)}, ${duree(s.apres.heuresSup)} d’heures sup, ${s.apres.retards} en retard.</p>
        <p class="bu-verdict ${d <= 0 || dr < 0 ? 'ok' : 'neutre'}">${esc(verdict)}</p>
        <button type="button" class="lien-discret" data-bu-essai-fermer="${esc(e.a.id)}">Fermer</button></div>`;
    }

    /* ---- Paramètres financiers ----------------------------------------- */

    rendreParam() {
      const box = root.document.getElementById('bu-param'); if (!box) return;
      const actif = root.document.activeElement;
      if (box.contains(actif) && /^(INPUT|SELECT|TEXTAREA)$/.test(actif.tagName)) return;   // ne pas arracher le champ qu'on remplit
      const f = this.f, vols = this.a.vols(), j = journee(vols, f), m = mois(vols, f);
      const services = this.a.services().filter(s => this.a.at().state.ateliers.some(a => a.service === s.id && (a.type !== 'dispo' || +a.personnes > 0)) || f.services[s.id]);
      const avions = [...new Set(departs(vols).map(cleAvion).filter(Boolean))].sort();
      const couples = [...new Set(departs(vols).map(v => String(v.cie).toUpperCase() + '/' + cleAvion(v)))].sort();
      const fr = n => (n == null ? '' : String(n).replace('.', ','));
      box.innerHTML = `<p class="bu-note"><span class="bu-fictif">Toutes les valeurs proposées sont fictives.</span> Les vraies restent dans votre navigateur et votre sauvegarde : elles ne partent jamais dans le dépôt public.</p>
        <div class="bu-grille">
        <section class="bu-carte"><h3>Les catégories de poste</h3><p class="mini-note">Taux horaire chargé, en euros. Chaque équipe dit combien de personnes de chaque catégorie (Budget du jour) ; les autres sont de la catégorie par défaut.</p>
          <table class="bu-mini"><thead><tr><th>Catégorie</th><th>€ / h</th><th>Par défaut</th><th></th></tr></thead><tbody>
          ${f.categories.map(c => `<tr data-bu-cat="${esc(c.id)}"><td><input value="${esc(c.nom)}" data-bu-cat-nom maxlength="80"></td>
            <td><input type="number" min="0" step="0.5" value="${c.taux}" data-bu-cat-taux class="bu-n"></td>
            <td><input type="radio" name="bu-defaut" value="${esc(c.id)}" data-bu-defaut ${c.id === f.categorieDefaut ? 'checked' : ''} aria-label="Catégorie par défaut"></td>
            <td>${f.categories.length > 1 ? `<button type="button" class="lien-discret danger" data-bu-cat-retirer="${esc(c.id)}">Retirer</button>` : ''}</td></tr>`).join('')}
          </tbody></table><button type="button" class="btn btn-sm" data-bu-cat-ajouter>+ Une catégorie</button></section>

        <section class="bu-carte"><h3>Vacations et heures sup</h3>
          <label class="chk"><input type="checkbox" data-bu-sup-actif ${f.heuresSup.actif ? 'checked' : ''}> Une équipe en retard reste en heures sup</label>
          <label>Plafond par personne et par jour <span class="bu-champ"><input type="number" min="0" max="12" step="0.25" value="${fr(f.heuresSup.plafond / 60)}" data-bu-sup-plafond class="bu-n"> h</span></label>
          <label>Majoration des heures sup <span class="bu-champ">× <input type="number" min="1" max="3" step="0.05" value="${f.majoration}" data-bu-majoration class="bu-n"></span></label>
          <label>Vacation d’une équipe sans règle de poste <span class="bu-champ"><input type="number" min="1" max="16" step="0.25" value="${fr(f.vacationDefaut / 60)}" data-bu-vacation class="bu-n"> h</span></label>
          <p class="mini-note">Une personne planifiée est payée sa vacation entière : la présence de son poste (Simulation › Réglages de la simulation, ou la fiche de l’équipe). Au-delà, les heures sup, dans le plafond ; ce qui dépasse le plafond n’est pas fait.</p></section>

        <section class="bu-carte"><h3>Le mois</h3><p class="mini-note">Pour passer du budget du mois au budget du jour.</p>
          <label>Vols du mois <input type="number" min="1" value="${f.mois.vols ?? ''}" placeholder="${j.vols * m.jours}" data-bu-mois-vols class="bu-n"></label>
          <label>Remplissage moyen du mois <span class="bu-champ"><input type="number" min="1" max="100" value="${f.mois.remplissage == null ? '' : Math.round(f.mois.remplissage * 100)}" placeholder="${Math.round(j.remplissage * 100)}" data-bu-mois-rempl class="bu-n"> %</span></label>
          <label>Jours dans le mois <input type="number" min="1" max="31" value="${f.mois.jours}" data-bu-mois-jours class="bu-n"></label>
          <p class="mini-note">Vide : déduit de la journée (${j.vols} vols × ${m.jours} jours, remplissage ${pct(j.remplissage)}).</p></section>
        </div>

        <section class="bu-carte"><h3>Le budget mensuel de chaque service</h3>
          <p class="mini-note">En euros, tel que le contrôleur de gestion le donne. « Au remplissage » : les vols comptent selon leur remplissage (passagers ÷ capacité).</p>
          <table class="bu-mini"><thead><tr><th>Service</th><th>Budget du mois</th><th>Réparti</th><th>Soit aujourd’hui</th></tr></thead><tbody>
          ${services.map(s => { const c = f.services[s.id] || {}, b = budgetJour(s.id, vols, f);
            return `<tr data-bu-service="${esc(s.id)}"><th scope="row">${esc(s.nom)}</th>
              <td><span class="bu-champ"><input type="number" min="0" step="100" value="${c.budget ?? ''}" placeholder="—" data-bu-budget class="bu-n"> €</span></td>
              <td><select data-bu-mode><option value="vols"${c.mode !== 'remplissage' ? ' selected' : ''}>aux vols</option><option value="remplissage"${c.mode === 'remplissage' ? ' selected' : ''}>au remplissage</option></select></td>
              <td>${b ? eur(b.montant) : '—'}</td></tr>`; }).join('')}
          </tbody></table>
          <button type="button" class="btn btn-sm" data-bu-exemple title="Un budget égal au coût de la journée actuelle × jours du mois : pour voir comment ça marche">Remplir avec des budgets d’exemple</button></section>

        <section class="bu-carte"><h3>La capacité des avions</h3><p class="mini-note">Pour le taux de remplissage : passagers ÷ sièges. Une compagnie peut avoir sa propre configuration.</p>
          <div class="bu-grille">
          <table class="bu-mini"><thead><tr><th>Avion</th><th>Sièges</th></tr></thead><tbody>
          ${[...new Set(avions.concat(Object.keys(f.sieges)))].sort().map(av => `<tr data-bu-avion="${esc(av)}"><th scope="row">${esc(av)}${avions.includes(av) ? '' : ' <small>pas aujourd’hui</small>'}</th>
            <td><input type="number" min="1" value="${f.sieges[av] ?? ''}" data-bu-sieges class="bu-n"></td></tr>`).join('')}</tbody></table>
          <table class="bu-mini"><thead><tr><th>Compagnie / avion</th><th>Sièges</th></tr></thead><tbody>
          ${couples.map(k => `<tr data-bu-couple="${esc(k)}"><th scope="row">${esc(k)}</th>
            <td><input type="number" min="1" value="${f.siegesCie[k] ?? ''}" placeholder="${f.sieges[k.split('/')[1]] ?? '?'}" data-bu-sieges-cie class="bu-n"></td></tr>`).join('')}</tbody></table>
          </div></section>`;
    }

    /* ---- gestes -------------------------------------------------------- */

    lier() {
      const d = root.document;
      d.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('#bu-jour [data-bu-ouvrir], #bu-jour [data-bu-essai], #bu-jour [data-bu-essai-fermer], #bu-param [data-bu-cat-ajouter], #bu-param [data-bu-cat-retirer], #bu-param [data-bu-exemple]');
        if (!t) return;
        if (t.dataset.buOuvrir) { const id = t.dataset.buOuvrir; if (this.ouverts.has(id)) this.ouverts.delete(id); else this.ouverts.add(id); return this.rendreJour(); }
        if (t.dataset.buEssai) return this.essayer(t.dataset.buEssai);
        if (t.dataset.buEssaiFermer) { delete this.essais[t.dataset.buEssaiFermer]; return this.rendreJour(); }
        if (t.dataset.buCatAjouter !== undefined) return this.changer(f => { f.categories.push({ id: 'cat-' + Date.now().toString(36), nom: 'Nouvelle catégorie', taux: 20 }); });
        if (t.dataset.buCatRetirer) { const id = t.dataset.buCatRetirer; t.blur(); return this.changer(f => { f.categories = f.categories.filter(c => c.id !== id); }); }
        if (t.dataset.buExemple !== undefined) {
          const b = this.bilan(), jours = this.f.mois.jours;
          return this.changer(f => { for (const l of b.lignes) f.services[l.id] = { ...(f.services[l.id] || {}), budget: Math.round(l.total * jours / 100) * 100 }; });
        }
      });
      d.addEventListener('change', e => {
        const el = e.target; if (!el.closest) return;
        const enJour = el.closest('#bu-jour'), enParam = el.closest('#bu-param');
        if (!enJour && !enParam) return;
        const n = v => (v === '' ? null : +String(v).replace(',', '.'));
        if (enJour && el.dataset.buCompo) {
          const id = el.closest('[data-bu-equipe]').dataset.buEquipe, cat = el.dataset.buCompo;
          return this.changer(f => { f.compo[id] = { ...(f.compo[id] || {}), [cat]: Math.max(0, n(el.value) || 0) }; });
        }
        if (!enParam) return;
        el.blur();
        const cat = el.closest('[data-bu-cat]'), svc = el.closest('[data-bu-service]');
        if (el.dataset.buCatNom !== undefined && cat) return this.changer(f => { const c = f.categories.find(x => x.id === cat.dataset.buCat); if (c && el.value.trim()) c.nom = el.value.trim(); });
        if (el.dataset.buCatTaux !== undefined && cat) return this.changer(f => { const c = f.categories.find(x => x.id === cat.dataset.buCat); if (c) c.taux = n(el.value) ?? c.taux; });
        if (el.dataset.buDefaut !== undefined) return this.changer(f => { f.categorieDefaut = el.value; });
        if (el.dataset.buSupActif !== undefined) return this.changer(f => { f.heuresSup.actif = el.checked; }, true);
        if (el.dataset.buSupPlafond !== undefined) return this.changer(f => { f.heuresSup.plafond = Math.round((n(el.value) ?? 0) * 60); }, true);
        if (el.dataset.buMajoration !== undefined) return this.changer(f => { f.majoration = n(el.value) ?? f.majoration; });
        if (el.dataset.buVacation !== undefined) return this.changer(f => { f.vacationDefaut = Math.round((n(el.value) ?? 7) * 60); });
        if (el.dataset.buMoisVols !== undefined) return this.changer(f => { f.mois.vols = n(el.value); });
        if (el.dataset.buMoisRempl !== undefined) return this.changer(f => { const v = n(el.value); f.mois.remplissage = v == null ? null : v / 100; });
        if (el.dataset.buMoisJours !== undefined) return this.changer(f => { f.mois.jours = n(el.value) ?? 30; });
        if (el.dataset.buBudget !== undefined && svc) return this.changer(f => { f.services[svc.dataset.buService] = { ...(f.services[svc.dataset.buService] || { mode: 'vols' }), budget: n(el.value) }; });
        if (el.dataset.buMode !== undefined && svc) return this.changer(f => { f.services[svc.dataset.buService] = { ...(f.services[svc.dataset.buService] || {}), mode: el.value }; });
        if (el.dataset.buSieges !== undefined) { const av = el.closest('[data-bu-avion]').dataset.buAvion; return this.changer(f => { if (n(el.value)) f.sieges[av] = n(el.value); else delete f.sieges[av]; }); }
        if (el.dataset.buSiegesCie !== undefined) { const k = el.closest('[data-bu-couple]').dataset.buCouple; return this.changer(f => { if (n(el.value)) f.siegesCie[k] = n(el.value); else delete f.siegesCie[k]; }); }
      });
    }
  }

  const pl = (n, s) => n + ' ' + s + (n > 1 ? 's' : '');

  const api = { CLE, DEFAUT, valider, departs, paxVol, siegesVol, remplissageVol, journee, mois, budgetJour, parCategorie, coutEquipe, bilan, Budget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
