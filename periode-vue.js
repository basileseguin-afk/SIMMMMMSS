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
 *      détail par équipe et par compagnie se déplie. Évolution 15 (d) : la
 *      colonne « Unité » (le total des services, chaque jour), la courbe de
 *      l'unité au-dessus du tableau (et le réel s'il est importé), la première
 *      colonne qui reste quand le tableau défile, les personnes en moyenne par
 *      jour seulement, les jours complets comptés d'abord ; une durée s'écrit
 *      « 45 min » ou « 2 h 05 », des heures de travail en heures entières.
 *  La période ne se recalcule pas à chaque frappe : un réglage ou des vols
 *  modifiés la marquent « à relancer ». Tant qu'elle est à jour, la journée
 *  affichée part de ce que la veille lui laisse dans la période (son sale, son
 *  stock propre, ses départs en « J+1 ») ; sinon, du sale de la veille saisi.
 *  Sans programme daté, rien de tout cela ne se montre.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const PE = () => (enNode ? require('./moteur/periode.js') : root.OrlyPeriode);
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const PC = () => (enNode ? require('./periode-courbe.js') : root.OrlyPeriodeCourbe);
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
  /** Une durée (évolution 15 d) : « 45 min » sous une heure, « 2 h 05 » au-delà ; un total d'heures de travail en heures entières. */
  const duree = x => (x == null || !Number.isFinite(x) ? '—' : P().dureeLisible(x));
  // Moins d'une demi-heure de travail ne s'écrit pas « 0 h » : « < 1 h ».
  const heuresEntieres = x => (x == null || !Number.isFinite(x) ? '—' : x > 0 && x < 30 ? '< 1 h' : nombre(x / 60, 0) + ' h');

  /** Les mesures du tableau : ce qu'une case montre, et comment l'écrire. */
  // `personnes` (évolution 15 d) : une mesure en personnes ; ses lignes de cumul ne donnent que la moyenne par jour
  // (des personnes de jours différents ne s'additionnent pas). `reel` : une mesure qui se compare au réel en ETP par jour
  // (« Réel et calage ») ; la courbe y montre le réel s'il est importé — pas sur un surplus d'arrondi ni sur un pic de 15 min.
  const MESURES = [
    { id: 'personnes', nom: 'Personnes', ecrire: x => nombre(x, 0), personnes: true, reel: true },
    { id: 'besoin', nom: 'Besoin exact (pers.)', ecrire: x => nombre(x, 1), personnes: true, reel: true },
    // L'arrondi au service (banc d'essai, évolution 11 a).
    { id: 'charge', nom: 'Charge (ETP)', ecrire: x => nombre(x, 2), personnes: true, reel: true },
    { id: 'personnesService', nom: 'Personnes du service (⌈charge⌉)', ecrire: x => nombre(x, 0), personnes: true, reel: true },
    { id: 'surplusArrondi', nom: 'Surplus d’arrondi (pers.)', ecrire: x => nombre(x, 0), personnes: true },
    { id: 'heuresSup', nom: 'Heures sup (heures × personnes)', ecrire: duree },
    { id: 'commandesEnRetard', nom: 'Commandes en retard', ecrire: x => nombre(x, 0) },
    { id: 'retardMax', nom: 'Retard max', ecrire: duree },
    { id: 'hommeMinutes', nom: 'Homme-heures', ecrire: heuresEntieres },
    // Les vacations longues (banc d'essai, évolution 11 e) : seulement quand la période en a.
    { id: 'heuresSupOffice', nom: 'Heures sup d’office (heures × personnes)', ecrire: duree, office: true },
    { id: 'heuresSupOfficeEncadrement', nom: 'Heures sup d’office de l’encadrement (heures × personnes)', ecrire: duree, office: true },
    // Les indicateurs de charge (banc d'essai, évolution 12 c) : par jour de travail et par service ; dans la colonne
    // « Unité » (évolution 15 d), tous les services réunis (moteur/periode.js, chargeDeLUnite).
    // Un jour s'ouvre alors dans la page Planning, où est sa vue « Charge ».
    { id: 'picAuTravail', nom: 'Pic au travail (pers.)', ecrire: x => nombre(x, 1), page: 'at-planning', personnes: true,
      jour: k => (k.picAuTravail ? k.picAuTravail.personnes : null), cumul: (k, moyenne) => (moyenne ? k.picAuTravailMoyen : k.picAuTravail ? k.picAuTravail.personnes : null),
      unite: (k, moyenne) => (moyenne ? k.picAuTravailMoyen : k.picAuTravail ? k.picAuTravail.personnes : null),
      note: 'Pic au travail : le plus haut créneau de 15 min du jour ; sur une ligne Moyenne, la moyenne des pics des jours complets ; dans la colonne Unité, tous les services réunis, créneau par créneau.' },
    { id: 'occupation', nom: 'Occupation (%)', ecrire: x => nombre(x * 100, 0) + ' %', page: 'at-planning',
      jour: k => k.occupation, cumul: k => k.occupation, unite: k => k.occupation,
      note: 'Occupation : minutes au travail ÷ minutes de présence hors pauses, pondérée par les personnes des équipes ; sur un Total ou une Moyenne, celle de tous les jours complets ; dans la colonne Unité, toutes les équipes.' }
  ];
  const chargeDe = s => (s && s.indicateursCharge) || null;
  /** Le débordement (en pixels) à partir duquel le tableau se dit « défiler » sur le côté. */
  const DEFILE_MIN = 8;
  const avecOffice = b => (b.joursTravail || []).some(w => w.total && (w.total.heuresSupOffice > 0 || w.total.heuresSupOfficeEncadrement > 0));

  /**
   * Les colonnes des services : ceux qui ont travaillé un jour de la période, dans l'ordre des chemins (`ordonner(ids)` rend
   * les identifiants de l'amont vers l'aval : correction 17 b, moteur/ordre-services.js) ; sans lui, l'ordre du bilan.
   */
  function servicesOrdonnes(b, ordonner) {
    const avec = b.services.filter(s => b.joursTravail.some(w => w.services[s.id]));
    if (!ordonner) return avec;
    const rang = new Map(ordonner(avec.map(s => s.id)).map((id, i) => [id, i])), place = s => (rang.has(s.id) ? rang.get(s.id) : Infinity);
    return avec.map((s, i) => ({ s, i })).sort((x, y) => place(x.s) - place(y.s) || x.i - y.i).map(x => x.s);
  }

  /**
   * La valeur d'un service : un jour (`w`), ou sur une ligne de cumul (`cumul` : { bloc, moyenne }, le bloc d'un mois ou de
   * la période du bilan).
   */
  function valeurService(m, id, cumul, w) {
    if (cumul) {
      if (m.cumul) { const k = cumul.bloc.indicateursCharge && cumul.bloc.indicateursCharge.services[id]; return k ? m.cumul(k, cumul.moyenne) : null; }
      const x = (cumul.moyenne ? cumul.bloc.moyenne : cumul.bloc.total).services[id];
      return x ? x[m.id] : null;
    }
    const s = w.services[id];
    return m.jour ? (chargeDe(s) ? m.jour(chargeDe(s)) : null) : s ? s[m.id] : null;
  }

  /**
   * La colonne « Unité » (évolution 15 d) : le total des services d'un jour (`jours` = [w]) ou d'une ligne de cumul (`jours` :
   * ses jours complets ; `cumul` : { bloc, moyenne }). Une mesure de charge : tous les services réunis (moteur/periode.js).
   */
  function valeurUnite(m, jours, cumul) {
    if (m.unite) return m.unite(PE().chargeDeLUnite(jours), cumul ? cumul.moyenne : false);
    if (cumul) return (cumul.moyenne ? cumul.bloc.moyenne : cumul.bloc.total)[m.id];
    return jours[0] && jours[0].total ? jours[0].total[m.id] : null;
  }

  /**
   * Les lignes de cumul du tableau, dans l'ordre : par mois (seulement les mois qui ont des jours complets, et seulement s'il
   * y en a plusieurs), puis sur la période. Une mesure en personnes : la moyenne par jour seule, qui dit sur combien de jours ;
   * les autres : le total et la moyenne. [{ lib, mois (null : la période), bloc, moyenne, jours }]
   */
  function lignesDeCumul(b, m) {
    const complets = b.joursTravail.filter(w => w.complet), nb = n => n + (n > 1 ? ' jours complets' : ' jour complet');
    const bloc = (mois, total, moyenne, x, jours) => [
      ...(m.personnes ? [] : [{ lib: total + ' (' + nb(x.jours) + ')', mois, bloc: x, moyenne: false, jours }]),
      { lib: moyenne + (m.personnes ? ' (' + nb(x.jours) + ')' : ''), mois, bloc: x, moyenne: true, jours }];
    const mois = b.mois.filter(mo => mo.jours > 0);
    return (mois.length > 1 ? mois.flatMap(mo => bloc(mo.mois, 'Total ' + nomDuMois(mo.mois), 'Moyenne par jour, ' + nomDuMois(mo.mois), mo,
      complets.filter(w => w.date.startsWith(mo.mois)))) : [])
      .concat(bloc(null, 'Total de la période', 'Moyenne par jour sur la période', b.periode, complets));
  }

  /** Les jours de travail comptés, les complets d'abord (« 4 jours complets, 6 incomplets »), et ce qu'est un jour incomplet. */
  function comptesDesJours(b) {
    const n = b.joursTravail.filter(w => w.complet).length, i = b.joursTravail.length - n;
    return { complets: n, incomplets: i, texte: n + (n > 1 ? ' jours complets' : ' jour complet') + (i ? ', ' + i + (i > 1 ? ' incomplets' : ' incomplet') : ''),
      explication: 'Un jour incomplet manque des vols d’un jour voisin, hors de la période : il est montré, mais sort des totaux et des moyennes.' };
  }

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
     *   ordre(ids)        — les services de l'amont vers l'aval (facultatif, correction 17 b) : l'ordre des colonnes
     * } */
    constructor(a) {
      this.a = a; this.resultat = null; this.signature = null; this.calcul = null; this.erreur = null;
      this.mesure = 'personnes'; this.ouverts = new Set(); this.programme = null; this.desc = null; this.commentOuvert = false;
      const bandeau = document.getElementById('periode-bandeau'), vue = document.getElementById('journee-periode');
      for (const el of [bandeau, vue]) if (el) {
        el.addEventListener('click', e => this.clic(e));
        el.addEventListener('change', e => this.choix(e));
      }
      // « Comment les jours sont comptés » reste déplié d'un rendu à l'autre (`toggle` ne remonte pas : on l'écoute à la capture).
      if (vue) vue.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('pv-comment')) this.commentOuvert = e.target.open; }, true);
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
        this.a.notifier('Période simulée : ' + r.jours + (r.jours > 1 ? ' journées' : ' journée') + ' de vols ; ' + comptesDesJours(this.resultat.bilan).texte + '.');
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
      // Une mesure de charge (évolution 12 c) ouvre la page Planning, où est la vue « Charge » ; les autres, Les chiffres.
      this.a.allerPage((MESURES.find(x => x.id === this.mesure) || {}).page || 'j-chiffres');
    }

    /* ---- le rendu ---------------------------------------------------------- */

    rendre() { this.rendreBandeau(); this.rendreVue(); }

    /**
     * La ligne d'état : où en est la période, et d'où vient le sale de la veille de la journée affichée. Elle compte les jours
     * incomplets sans les expliquer : la page Période le fait, une seule fois (correction 17 d).
     */
    texteEtat(d) {
      const e = this.etat(), jour = this.a.jour();
      if (this.erreur) return '<span class="pj-erreur">Période non simulée : ' + esc(this.erreur) + '</span>';
      if (e === 'en-cours') return this.texteProgression();
      if (e === 'jamais') return 'Période de ' + d.jours + (d.jours > 1 ? ' jours' : ' jour') + ' : pas encore simulée. La journée affichée part du sale de la veille saisi.';
      if (e === 'a-relancer') return '<b class="pj-relancer">À relancer</b> : un réglage ou les vols ont changé depuis le calcul. La journée affichée part du sale de la veille saisi.';
      const r = this.resultat.periode, j = this.resultat.journees.find(x => x.date === jour), c = comptesDesJours(this.resultat.bilan);
      return 'Période simulée : ' + r.jours + (r.jours > 1 ? ' journées' : ' journée') + ' de vols ; ' + c.texte + '.'
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
      // Les jours incomplets s'expliquent une seule fois, en une phrase, seulement s'il y en a ; le détail se déplie (correction 17 d).
      const c = r && e !== 'en-cours' && !this.erreur ? comptesDesJours(r.bilan) : null;
      const tete = `<div class="panneau pv-tete"><p class="pv-etat" role="status">${this.texteEtat(d)}</p>
        ${c && c.incomplets ? `<p class="mini-note pv-explique">${esc(c.explication)}</p>` : ''}
        <details class="aide bloc pv-comment"${this.commentOuvert ? ' open' : ''}><summary>Comment les jours sont comptés</summary><span class="aide-corps">
          <p>Du ${PE().dateLongue(d.debut)} au ${PE().dateLongue(d.fin)}, ${d.jours} ${d.jours > 1 ? 'journées' : 'journée'} de vols. Chaque équipe compte au
          jour des vols + son jour (la cuisine à J−2 des vols du 12 travaille le 10).</p>
          <p>Un jour de travail est <b>incomplet</b> quand une de ses journées de vols manque, avant le premier jour ou en fin de période ; sa ligne le dit, et
          son infobulle nomme les vols qui manquent.</p>
          <p>Passent d’un jour au suivant : le sale non lavé, le stock propre (boucle du matériel), et en « J+1 » les départs de la veille ; pas encore les
          lots non finis ni les retards.</p></span></details>
        <div class="pv-actions">${e === 'en-cours' ? '<button type="button" class="btn btn-sm" data-pv="annuler">Annuler</button>'
          : `<button type="button" class="btn btn-sm${e === 'a-jour' ? '' : ' btn-play'}" data-pv="lancer">${e === 'jamais' ? 'Simuler la période' : 'Relancer la période'}</button>`}
          ${e === 'a-jour' ? '<button type="button" class="btn btn-sm" data-pv="exporter">Exporter la période (Excel)</button>' : ''}</div></div>`;
      if (!r) { dessiner(box, tete); return; }
      const b = r.bilan, mesures = MESURES.filter(x => !x.office || avecOffice(b)), m = this.mesureChoisie();
      const services = servicesOrdonnes(b, this.a.ordre);
      const cellule = (x, extra = '') => `<td class="pv-n"${extra}>${x == null || (m.id !== 'retardMax' && !x) ? '<span class="pv-zero">' + (x == null ? '—' : m.ecrire(x)) + '</span>' : m.ecrire(x)}</td>`;
      const ligneJour = w => {
        const titre = w.complet ? 'Ouvrir la journée de vols du ' + PE().dateLongue(w.date) : 'Incomplet : il manque les vols du ' + w.manque.map(PE().dateLongue).join(', ');
        const ouvert = this.ouverts.has(w.date);
        return `<tr data-pv-jour="${w.date}" class="${w.complet ? '' : 'pv-incomplet'}" title="${esc(titre)}">
            <th scope="row"><button type="button" class="pv-deplier" data-pv="detail" data-date="${w.date}" aria-expanded="${ouvert}" aria-label="Détail du ${PE().dateLongue(w.date)} par équipe et par compagnie">${ouvert ? '▾' : '▸'}</button>
              <button type="button" class="pv-ouvrir" data-pv="ouvrir" data-date="${w.date}">${jourDeSemaine(w.date)} ${PE().dateCourte(w.date)}</button>${w.complet ? '' : ' <span class="pv-badge">incomplet</span>'}</th>
            ${cellule(valeurUnite(m, [w]), ' data-pv-total')}${services.map(s => cellule(valeurService(m, s.id, null, w))).join('')}</tr>`
          + (ouvert ? `<tr class="pv-detail"><td colspan="${services.length + 2}">${this.detail(w, b)}</td></tr>` : '');
      };
      // Le premier rang d'un bloc de cumul porte le trait qui le sépare des jours.
      const ligneCumul = (l, i, tous) => `<tr class="pv-cumul${l.moyenne ? ' pv-moyenne' : ''}${i === 0 || tous[i - 1].mois !== l.mois ? ' pv-tete-bloc' : ''}"><th scope="row">${esc(l.lib)}</th>${
        cellule(valeurUnite(m, l.jours, l), ' data-pv-total')}${services.map(s => cellule(valeurService(m, s.id, l))).join('')}</tr>`;
      const cumuls = lignesDeCumul(b, m), rangs = cumuls.map((l, i) => ({ mois: l.mois, html: ligneCumul(l, i, cumuls) }));
      const corps = b.mois.map(mo => b.joursTravail.filter(w => w.date.startsWith(mo.mois)).map(ligneJour).join('')
        + rangs.filter(x => x.mois === mo.mois).map(x => x.html).join('')).join('') + rangs.filter(x => !x.mois).map(x => x.html).join('');
      dessiner(box, tete + `<div class="panneau pv-tableau">
        <div class="pv-outils"><label>Mesure <select id="periode-mesure">${mesures.map(x => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>
          <span class="mini-note">Un clic sur un jour ouvre sa journée de vols${m.page ? ', dans la page Planning (sa charge, puis le planning des équipes)' : ''} ; ▸ déplie son détail par équipe et par compagnie.</span></div>
        ${m.note ? `<p class="mini-note pv-note-mesure">${esc(m.note)}</p>` : ''}
        <figure class="pv-courbe"><div class="pv-trace" id="pv-trace" tabindex="0" aria-label="La courbe de l’unité : les flèches gauche et droite lisent un jour"></div>
          <figcaption class="pv-bulle mini-note" role="status" aria-live="polite"></figcaption></figure>
        <p class="mini-note pv-defile-aide" aria-hidden="true">Le tableau défile sur le côté ; la colonne des jours reste.</p>
        <div class="pv-defile"><div class="table-scroll"><table class="svc-table pv-table" data-mesure="${m.id}">
          <thead><tr><th scope="col">Jour de travail</th><th scope="col" data-pv-total title="Tous les services réunis">Unité</th>${services.map(s => `<th scope="col">${esc(s.nom)}</th>`).join('')}</tr></thead>
          <tbody>${corps}</tbody></table></div></div></div>`);
      this.rendreCourbe(box);
      this.suivreDefilement(box);
    }

    /** La mesure choisie, parmi celles que la période montre. */
    mesureChoisie() {
      const b = this.resultat.bilan, mesures = MESURES.filter(x => !x.office || avecOffice(b));
      return mesures.find(x => x.id === this.mesure) || mesures[0];
    }

    /** La courbe de l'unité, jour par jour, à la largeur de son cadre ; le réel (« Réel et calage ») pour une mesure en personnes. */
    rendreCourbe(box = document.getElementById('pv-periode') || document.getElementById('journee-periode')) {
      const trace = box && box.querySelector('.pv-trace'); if (!trace || !this.resultat) return;
      const m = this.mesureChoisie(), reel = m.reel && this.a.reel ? this.a.reel() : null;
      PC().peindre(trace, box.querySelector('.pv-bulle'), PC().points(this.resultat.bilan, w => valeurUnite(m, [w]), reel),
        { ecrire: m.ecrire, nom: m.nom.replace(/\s*\(.*\)$/, '') });
    }

    /** Le défilement sur le côté se voit : une ombre au bord de la colonne des jours, un fondu du côté où le tableau continue. */
    suivreDefilement(box) {
      const t = box.querySelector('.pv-tableau'), sc = t && t.querySelector('.table-scroll'); if (!sc) return;
      // Quelques pixels cachés ne se signalent pas : le tableau « défile » au-delà de DEFILE_MIN.
      const marquer = () => {
        const max = sc.scrollWidth - sc.clientWidth, x = sc.scrollLeft, defile = max > DEFILE_MIN;
        const d = [defile && x > 1 ? 'gauche' : '', defile && x < max - 1 ? 'droite' : ''].filter(Boolean).join(' ');
        if (t.dataset.defile !== d) t.dataset.defile = d;
      };
      marquer();
      if (sc.__suivi) return;
      sc.__suivi = true;
      sc.addEventListener('scroll', marquer, { passive: true });
      if (root.ResizeObserver) new root.ResizeObserver(marquer).observe(sc);
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
            <th scope="col">Homme-heures</th><th scope="col">Heures sup (heures × personnes)</th><th scope="col">Lots en retard</th><th scope="col">Retard max</th></tr></thead>
          <tbody>${eq.map(x => `<tr data-pv-equipe="${esc(x.id)}"><td>${esc(nomService.get(x.service) || x.service)}</td><td>${esc(x.nom)}${'ouverte' in x ? ' <small>' + (x.ouverte ? 'nuit ouverte' : 'nuit fermée') + '</small>' : ''}</td>
            <td>${PE().dateCourte(x.vols)}</td><td class="pv-n">${nombre(x.personnes, 0)}</td><td class="pv-n">${nombre(x.besoin, 1)}</td><td class="pv-n">${nombre(x.charge, 2)}</td><td class="pv-n">${heuresEntieres(x.hommeMinutes)}</td>
            <td class="pv-n">${duree(x.heuresSup)}</td><td class="pv-n">${nombre(x.lotsEnRetard, 0)}</td><td class="pv-n">${duree(x.retardMax)}</td></tr>`).join('')}</tbody></table>
        <table class="svc-table pv-compagnies"><caption>Par compagnie</caption>
          <thead><tr><th scope="col">Service</th><th scope="col">Compagnie</th><th scope="col">Commandes</th><th scope="col">Vols</th><th scope="col">Passagers</th>
            <th scope="col">Homme-heures</th><th scope="col">Retard max</th></tr></thead>
          <tbody>${cies.map(c => `<tr data-pv-cie="${esc(c.service + '|' + c.cie)}"><td>${esc(nomService.get(c.service) || c.service)}</td><td>${esc(c.cie)}</td><td class="pv-n">${nombre(c.commandes, 0)}</td>
            <td class="pv-n">${nombre(c.vols, 0)}</td><td class="pv-n">${nombre(c.pax, 0)}</td><td class="pv-n">${heuresEntieres(c.hommeMinutes)}</td>
            <td class="pv-n">${duree(c.retardMax)}</td></tr>`).join('')}</tbody></table></div>`;
    }
  }

  const api = { VuePeriode, MESURES, valeurService, valeurUnite, lignesDeCumul, comptesDesJours, servicesOrdonnes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPeriodeVue = api;
})(typeof window !== 'undefined' ? window : globalThis);
