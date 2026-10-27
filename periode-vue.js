/* ==========================================================================
 *  LA PÉRIODE DANS LA PAGE (banc d'essai de la version 1, évolution 10 —
 *  docs/BANC_ESSAI.md, § 9)
 *  ------------------------------------------------------------------------
 *  Avec un programme de vols daté :
 *    — le bandeau, en tête de chaque page : la journée de vols affichée, et
 *      « Simuler la période », qui avance jour par jour sans figer la page
 *      (« journée 12 sur 61 », Annuler) ;
 *    — la page Résultats › Période : le tableau jour de travail × service,
 *      les totaux et moyennes par mois et sur la période, les jours
 *      incomplets marqués ; un clic sur un jour ouvre sa journée de vols ; le
 *      détail par équipe et par compagnie se déplie.
 *  La période ne se recalcule pas à chaque frappe : un réglage ou des vols
 *  modifiés la marquent « à relancer ». Tant qu'elle est à jour, la journée
 *  affichée part de ce que la veille lui laisse dans la période (son sale, son
 *  stock propre, ses départs en « J+1 ») ; sinon, du sale de la veille saisi.
 *  Sans programme daté, rien de tout cela ne se montre.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const PE = () => root.OrlyPeriode;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const jourDeSemaine = d => JOURS[new Date(d + 'T12:00:00Z').getUTCDay()];
  const nomDuMois = m => MOIS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  /** 1 234,5 : un nombre à la française, `k` décimales au plus. */
  /** Redessiner une boîte seulement si son contenu change, en gardant le focus clavier sur le même geste. */
  const dessins = new WeakMap();
  function dessiner(box, html) {
    if (dessins.get(box) === html) return false;
    const a = document.activeElement, dedans = a && box.contains(a) && a !== box;
    const cle = !dedans ? null : a.id ? '#' + a.id : a.dataset.pv ? '[data-pv="' + a.dataset.pv + '"]' + (a.dataset.date ? '[data-date="' + a.dataset.date + '"]' : '') : null;
    box.innerHTML = html; dessins.set(box, html);
    const n = cle && box.querySelector(cle);
    if (n) n.focus();
    return true;
  }
  // « + 0 » : un −0 (une moyenne négative arrondie) s'écrit 0.
  const nombre = (x, k = 1) => (x == null || !Number.isFinite(x) ? '—'
    : (Math.round(x * 10 ** k) / 10 ** k + 0).toLocaleString('fr-FR', { maximumFractionDigits: k }));

  /** Les mesures du tableau : ce qu'une case montre, et comment l'écrire. */
  const MESURES = [
    { id: 'personnes', nom: 'Personnes', ecrire: x => nombre(x, 0) },
    { id: 'besoin', nom: 'Besoin exact (pers.)', ecrire: x => nombre(x, 1) },
    // L'arrondi au service (banc d'essai, évolution 11 a).
    { id: 'charge', nom: 'Charge (ETP)', ecrire: x => nombre(x, 2) },
    { id: 'personnesService', nom: 'Personnes du service (⌈charge⌉)', ecrire: x => nombre(x, 0) },
    { id: 'surplusArrondi', nom: 'Surplus d’arrondi (pers.)', ecrire: x => nombre(x, 0) },
    { id: 'heuresSup', nom: 'Heures sup (h × pers.)', ecrire: x => nombre(x / 60, 1) },
    { id: 'commandesEnRetard', nom: 'Commandes en retard', ecrire: x => nombre(x, 0) },
    { id: 'retardMax', nom: 'Retard max (min)', ecrire: x => (x == null ? '—' : nombre(x, 0)) },
    { id: 'hommeMinutes', nom: 'Homme-heures', ecrire: x => nombre(x / 60, 1) }
  ];

  class VuePeriode {
    /* a = {
     *   programme()       — le programme daté, décalé comme la page le joue, ou null
     *   unite()           — l'unité ({ etat, zones, base, flux, modele }), comme la page la calcule (une copie)
     *   options()         — { delaiChargement, decalage } : ceux des Horaires de vols
     *   signature()       — ce qui, s'il change, rend la période « à relancer »
     *   jour()            — la journée de vols affichée ; choisirJour(d) — en afficher une autre
     *   recalculer()      — recalculer la journée affichée (son sale de la veille a pu changer)
     *   allerPage(id), notifier(texte)
     *   mesurer()         — la hauteur de l'en-tête a changé (le bandeau paraît, s'en va, s'agrandit)
     *   exporter()        — le classeur Excel de la période simulée
     *   rendu()           — après chaque rendu de la vue (facultatif) : « Réel et calage » se met à jour
     * } */
    constructor(a) {
      this.a = a; this.resultat = null; this.signature = null; this.calcul = null; this.erreur = null;
      this.mesure = 'personnes'; this.ouverts = new Set(); this.programme = null; this.desc = null;
      const bandeau = document.getElementById('periode-bandeau'), vue = document.getElementById('journee-periode');
      for (const el of [bandeau, vue]) if (el) {
        el.addEventListener('click', e => this.clic(e));
        el.addEventListener('change', e => this.choix(e));
      }
    }

    /** La période qu'on regarde : celle du programme daté. Un autre programme arrête le calcul en cours ;
     *  la période calculée reste, « à relancer » (la signature compte les programmes importés). */
    description() {
      const p = this.a.programme();
      if (p !== this.programme) { this.programme = p; this.desc = p ? PE().decrire(p) : null; this.calcul = null; this.erreur = null; }
      return this.desc;
    }
    /** Calculée, et rien n'a changé depuis. */
    aJour() { return !!this.resultat && this.signature === this.a.signature(); }
    /** absente (pas de programme daté), en-cours, a-jour, a-relancer, jamais. */
    etat() {
      if (!this.description()) return 'absente';
      if (this.calcul) return 'en-cours';
      if (this.resultat) return this.aJour() ? 'a-jour' : 'a-relancer';
      return 'jamais';
    }
    /** Ce que la veille laisse à une journée dans la période, quand elle est à jour ; sinon null. */
    entreeDuJour(d) {
      if (!d || !this.aJour()) return null;
      const j = this.resultat.journees.find(x => x.date === d);
      return j ? j.entree : null;
    }

    /* ---- le calcul, jour par jour --------------------------------------- */

    lancer() {
      if (this.calcul) return;
      if (!this.description()) return;
      let p;
      try { p = PE().creerPeriode(this.a.unite(), this.programme, this.a.options()); }
      catch (e) { this.erreur = e.message; this.rendre(); return; }
      const c = this.calcul = { p, signature: this.a.signature(), reglages: this.a.options() };
      this.erreur = null;
      // Chaque pas joue une journée, puis rend la main : la page reste vivante, Annuler répond.
      const pas = () => {
        this.description();   // un autre programme importé entre-temps : ce calcul s'arrête
        if (this.calcul !== c) return;
        try { p.suivant(); }
        catch (e) { this.calcul = null; this.erreur = e.message; this.rendre(); return; }
        if (!p.fini) { this.rendreProgression(); setTimeout(pas, 0); return; }
        this.resultat = p.resultat(); this.signature = c.signature; this.calcul = null; this.ouverts.clear();
        // Pour le Lisez-moi du classeur : les réglages du calcul, et quand il a été fait.
        this.reglages = c.reglages; this.calculeLe = new Date();
        this.rendre(); this.a.recalculer();
        const r = this.resultat.periode;
        this.a.notifier('Période simulée : ' + r.jours + (r.jours > 1 ? ' journées' : ' journée') + ' de vols, ' + r.joursIncomplets.length
          + (r.joursIncomplets.length > 1 ? ' jours de travail incomplets.' : ' jour de travail incomplet.'));
      };
      this.rendre(); setTimeout(pas, 0);
    }
    annuler() {
      if (!this.calcul) return;
      this.calcul = null; this.rendre();
      this.a.notifier('Calcul de la période annulé.');
    }

    /* ---- les gestes ------------------------------------------------------ */

    clic(e) {
      const b = e.target.closest('[data-pv]');
      if (!b) {
        // Un clic sur un jour de travail ouvre sa journée de vols.
        const tr = e.target.closest('tr[data-pv-jour]');
        if (tr) this.ouvrirJour(tr.dataset.pvJour);
        return;
      }
      const f = b.dataset.pv;
      if (f === 'lancer') this.lancer();
      else if (f === 'ouvrir') this.ouvrirJour(b.dataset.date);
      else if (f === 'exporter') { if (this.a.exporter) this.a.exporter(); }
      else if (f === 'annuler') this.annuler();
      else if (f === 'voir') this.a.allerPage('j-periode');
      else if (f === 'precedent' || f === 'suivant') this.decaler(f === 'precedent' ? -1 : 1);
      else if (f === 'detail') {
        e.stopPropagation();
        const d = b.dataset.date;
        if (this.ouverts.has(d)) this.ouverts.delete(d); else this.ouverts.add(d);
        this.rendreVue();
      }
    }
    choix(e) {
      const t = e.target;
      if (t.id === 'periode-jour') this.a.choisirJour(t.value);
      else if (t.id === 'periode-mesure') { this.mesure = t.value; this.rendreVue(); }
    }
    decaler(k) {
      const d = this.description(); if (!d) return;
      const jours = PE().joursEntre(d.debut, d.fin), i = jours.indexOf(this.a.jour());
      const j = jours[Math.max(0, Math.min(jours.length - 1, i + k))];
      if (j && j !== this.a.jour()) this.a.choisirJour(j);
    }
    /** La journée de vols d'un jour de travail : le même jour, ramené dans la période. */
    ouvrirJour(w) {
      const d = this.description(); if (!d) return;
      this.a.choisirJour(w < d.debut ? d.debut : w > d.fin ? d.fin : w);
      this.a.allerPage('j-chiffres');
    }

    /* ---- le rendu ---------------------------------------------------------- */

    rendre() { this.rendreBandeau(); this.rendreVue(); }

    /** La ligne d'état : où en est la période, et d'où vient le sale de la veille de la journée affichée. */
    texteEtat(d) {
      const e = this.etat(), jour = this.a.jour();
      if (this.erreur) return '<span class="pj-erreur">Période non simulée : ' + esc(this.erreur) + '</span>';
      if (e === 'en-cours') return this.texteProgression();
      if (e === 'jamais') return 'Période de ' + d.jours + (d.jours > 1 ? ' jours' : ' jour') + ' : pas encore simulée. La journée affichée part du sale de la veille saisi.';
      if (e === 'a-relancer') return '<b class="pj-relancer">À relancer</b> : un réglage ou les vols ont changé depuis le calcul. La journée affichée part du sale de la veille saisi.';
      const r = this.resultat.periode, j = this.resultat.journees.find(x => x.date === jour);
      return 'Période simulée : ' + r.jours + (r.jours > 1 ? ' journées' : ' journée') + ', ' + r.joursIncomplets.length
        + (r.joursIncomplets.length > 1 ? ' jours de travail incomplets' : ' jour de travail incomplet') + '.'
        + (j && j.date !== r.debut ? ' Cette journée part du sale laissé la veille dans la période (' + nombre(j.extrait.saleInitial, 0) + ' u).' : '');
    }
    texteProgression() {
      const c = this.calcul; if (!c) return '';
      return '<span class="pj-progression">Journée ' + Math.min(c.p.fait + 1, c.p.total) + ' sur ' + c.p.total + '…</span>'
        + '<progress max="' + c.p.total + '" value="' + c.p.fait + '"></progress>';
    }
    rendreProgression() {
      const vue = document.getElementById('pv-periode') ? 'pv-periode' : 'journee-periode';
      for (const [boite, sel] of [['periode-bandeau', '.pj-etat'], [vue, '.pv-etat']]) {
        const box = document.getElementById(boite), el = box && box.querySelector(sel);
        if (el) { el.innerHTML = this.texteProgression(); dessins.delete(box); }
      }
    }

    rendreBandeau() {
      const box = document.getElementById('periode-bandeau'); if (!box) return;
      const d = this.description(), cache = !d;
      if (box.hidden !== cache) { box.hidden = cache; if (cache) dessiner(box, ''); if (this.a.mesurer) this.a.mesurer(); }
      if (!d) return;
      const jour = this.a.jour(), e = this.etat();
      const options = d.parJour.map(j => `<option value="${j.date}"${j.date === jour ? ' selected' : ''}>${jourDeSemaine(j.date)} ${PE().dateLongue(j.date)} — ${
        j.departs + j.retours ? j.departs + ' départ' + (j.departs > 1 ? 's' : '') + ', ' + j.retours + ' retour' + (j.retours > 1 ? 's' : '') : 'aucun vol'}</option>`).join('');
      const change = dessiner(box, `<div class="pj-jour"><label for="periode-jour">Journée de vols</label>
          <button type="button" class="btn btn-sm" data-pv="precedent" aria-label="Journée précédente"${jour === d.debut ? ' disabled' : ''}>‹</button>
          <select id="periode-jour">${options}</select>
          <button type="button" class="btn btn-sm" data-pv="suivant" aria-label="Journée suivante"${jour === d.fin ? ' disabled' : ''}>›</button></div>
        <p class="pj-etat" role="status" aria-live="polite">${this.texteEtat(d)}</p>
        <div class="pj-actions">${e === 'en-cours' ? '<button type="button" class="btn btn-sm" data-pv="annuler">Annuler</button>'
          : `<button type="button" class="btn btn-sm${e === 'a-jour' ? '' : ' btn-play'}" data-pv="lancer">${e === 'jamais' ? 'Simuler la période' : 'Relancer la période'}</button>`}
          <button type="button" class="lien-fort" data-pv="voir">La période →</button></div>`);
      if (change && this.a.mesurer) this.a.mesurer();
    }

    rendreVue() {
      // La période dans sa boîte ; « Réel et calage » a la sienne, à côté (banc d'essai, évolution 11), que `rendu` rafraîchit.
      const box = document.getElementById('pv-periode') || document.getElementById('journee-periode'); if (!box) return;
      this.rendreVueSeule(box);
      if (this.a.rendu) this.a.rendu();
    }
    rendreVueSeule(box) {
      const d = this.description();
      if (!d) { dessiner(box, '<p class="mini-note">Importez un programme de vols daté (colonne date) pour simuler une période.</p>'); return; }
      const e = this.etat(), r = this.resultat;
      const tete = `<div class="panneau pv-tete"><p class="pv-etat" role="status">${this.texteEtat(d)}</p>
        <p class="mini-note">Du ${PE().dateLongue(d.debut)} au ${PE().dateLongue(d.fin)}, ${d.jours} ${d.jours > 1 ? 'journées' : 'journée'} de vols. Chaque équipe compte au
          jour des vols + son jour (la cuisine à J−2 des vols du 12 travaille le 10). Un jour de travail <b>incomplet</b> — une de ses journées de vols manque, avant
          le premier jour ou en fin de période — est montré, et sort des totaux et des moyennes. Passent d’un jour au suivant : le sale non lavé, le stock propre
          (boucle du matériel), et en « J+1 » les départs de la veille ; pas encore les lots non finis ni les retards.</p>
        <div class="pv-actions">${e === 'en-cours' ? '<button type="button" class="btn btn-sm" data-pv="annuler">Annuler</button>'
          : `<button type="button" class="btn btn-sm${e === 'a-jour' ? '' : ' btn-play'}" data-pv="lancer">${e === 'jamais' ? 'Simuler la période' : 'Relancer la période'}</button>`}
          ${e === 'a-jour' ? '<button type="button" class="btn btn-sm" data-pv="exporter">Exporter la période (Excel)</button>' : ''}</div></div>`;
      if (!r) { dessiner(box, tete); return; }
      const b = r.bilan, m = MESURES.find(x => x.id === this.mesure) || MESURES[0];
      const services = b.services.filter(s => b.joursTravail.some(w => w.services[s.id]));
      const valeur = s => (s ? s[m.id] : null);
      const cellule = (x, extra = '') => `<td class="pv-n"${extra}>${x == null || (m.id !== 'retardMax' && !x) ? '<span class="pv-zero">' + (x == null ? '—' : m.ecrire(x)) + '</span>' : m.ecrire(x)}</td>`;
      const ligneJour = w => {
        const titre = w.complet ? 'Ouvrir la journée de vols du ' + PE().dateLongue(w.date) : 'Incomplet : il manque les vols du ' + w.manque.map(PE().dateLongue).join(', ');
        const ouvert = this.ouverts.has(w.date);
        return `<tr data-pv-jour="${w.date}" class="${w.complet ? '' : 'pv-incomplet'}" title="${esc(titre)}">
            <th scope="row"><button type="button" class="pv-deplier" data-pv="detail" data-date="${w.date}" aria-expanded="${ouvert}" aria-label="Détail du ${PE().dateLongue(w.date)} par équipe et par compagnie">${ouvert ? '▾' : '▸'}</button>
              <button type="button" class="pv-ouvrir" data-pv="ouvrir" data-date="${w.date}">${jourDeSemaine(w.date)} ${PE().dateCourte(w.date)}</button>${w.complet ? '' : ' <span class="pv-badge">incomplet</span>'}</th>
            ${services.map(s => cellule(valeur(w.services[s.id]))).join('')}${cellule(valeur(w.total), ' data-pv-total')}</tr>`
          + (ouvert ? `<tr class="pv-detail"><td colspan="${services.length + 2}">${this.detail(w, b)}</td></tr>` : '');
      };
      const ligneCumul = (lib, cumul, moyenne) => `<tr class="pv-cumul${moyenne ? ' pv-moyenne' : ''}"><th scope="row">${esc(lib)}</th>${services.map(s => {
        const x = (moyenne ? cumul.moyenne : cumul.total).services[s.id];
        return cellule(x ? x[m.id] : null); }).join('')}${cellule((moyenne ? cumul.moyenne : cumul.total)[m.id], ' data-pv-total')}</tr>`;
      const corps = b.mois.map(mo => b.joursTravail.filter(w => w.date.startsWith(mo.mois)).map(ligneJour).join('')
        + ligneCumul('Total ' + nomDuMois(mo.mois) + ' (' + mo.jours + ' jour' + (mo.jours > 1 ? 's' : '') + ' complet' + (mo.jours > 1 ? 's' : '') + ')', mo, false)
        + ligneCumul('Moyenne par jour, ' + nomDuMois(mo.mois), mo, true)).join('')
        + ligneCumul('Total de la période (' + b.periode.jours + ' jour' + (b.periode.jours > 1 ? 's' : '') + ' complet' + (b.periode.jours > 1 ? 's' : '') + ')', b.periode, false)
        + ligneCumul('Moyenne par jour sur la période', b.periode, true);
      dessiner(box, tete + `<div class="panneau pv-tableau">
        <div class="pv-outils"><label>Mesure <select id="periode-mesure">${MESURES.map(x => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>
          <span class="mini-note">Un clic sur un jour ouvre sa journée de vols ; ▸ déplie son détail par équipe et par compagnie.</span></div>
        <div class="table-scroll"><table class="svc-table pv-table" data-mesure="${m.id}">
          <thead><tr><th scope="col">Jour de travail</th>${services.map(s => `<th scope="col">${esc(s.nom)}</th>`).join('')}<th scope="col">Total</th></tr></thead>
          <tbody>${corps}</tbody></table></div></div>`);
    }

    /** Le détail d'un jour de travail : ses équipes, et ses compagnies par service. */
    detail(w, b) {
      const nomEquipe = new Map(b.equipes.map(e => [e.id, e])), nomService = new Map(b.services.map(s => [s.id, s.nom]));
      const eq = Object.entries(w.equipes).map(([id, x]) => ({ id, ...x, nom: (nomEquipe.get(id) || {}).nom || id }))
        .sort((x, y) => (nomService.get(x.service) || '').localeCompare(nomService.get(y.service) || '') || x.nom.localeCompare(y.nom));
      const cies = Object.entries(w.services).flatMap(([s, x]) => Object.entries(x.compagnies || {}).map(([cie, c]) => ({ service: s, cie, ...c })))
        .sort((x, y) => (nomService.get(x.service) || '').localeCompare(nomService.get(y.service) || '') || x.cie.localeCompare(y.cie));
      return `<div class="pv-detail-corps"><table class="svc-table pv-equipes"><caption>Par équipe</caption>
          <thead><tr><th scope="col">Service</th><th scope="col">Équipe</th><th scope="col">Vols du</th><th scope="col">Personnes</th><th scope="col">Besoin exact</th><th scope="col">Charge (ETP)</th>
            <th scope="col">Homme-heures</th><th scope="col">Heures sup (h × pers.)</th><th scope="col">Lots en retard</th><th scope="col">Retard max</th></tr></thead>
          <tbody>${eq.map(x => `<tr data-pv-equipe="${esc(x.id)}"><td>${esc(nomService.get(x.service) || x.service)}</td><td>${esc(x.nom)}${'ouverte' in x ? ' <small>' + (x.ouverte ? 'nuit ouverte' : 'nuit fermée') + '</small>' : ''}</td>
            <td>${PE().dateCourte(x.vols)}</td><td class="pv-n">${nombre(x.personnes, 0)}</td><td class="pv-n">${nombre(x.besoin, 1)}</td><td class="pv-n">${nombre(x.charge, 2)}</td><td class="pv-n">${nombre(x.hommeMinutes / 60, 1)}</td>
            <td class="pv-n">${nombre(x.heuresSup / 60, 1)}</td><td class="pv-n">${nombre(x.lotsEnRetard, 0)}</td><td class="pv-n">${x.retardMax == null ? '—' : nombre(x.retardMax, 0) + ' min'}</td></tr>`).join('')}</tbody></table>
        <table class="svc-table pv-compagnies"><caption>Par compagnie</caption>
          <thead><tr><th scope="col">Service</th><th scope="col">Compagnie</th><th scope="col">Commandes</th><th scope="col">Vols</th><th scope="col">Passagers</th>
            <th scope="col">Homme-heures</th><th scope="col">Retard max</th></tr></thead>
          <tbody>${cies.map(c => `<tr data-pv-cie="${esc(c.service + '|' + c.cie)}"><td>${esc(nomService.get(c.service) || c.service)}</td><td>${esc(c.cie)}</td><td class="pv-n">${nombre(c.commandes, 0)}</td>
            <td class="pv-n">${nombre(c.vols, 0)}</td><td class="pv-n">${nombre(c.pax, 0)}</td><td class="pv-n">${nombre(c.hommeMinutes / 60, 1)}</td>
            <td class="pv-n">${c.retardMax == null ? '—' : nombre(c.retardMax, 0) + ' min'}</td></tr>`).join('')}</tbody></table></div>`;
    }
  }

  const api = { VuePeriode, MESURES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPeriodeVue = api;
})(typeof window !== 'undefined' ? window : globalThis);
