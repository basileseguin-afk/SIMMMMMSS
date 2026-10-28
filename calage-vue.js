/* ==========================================================================
 *  RÉEL ET CALAGE — dans la page Période (banc d'essai de la version 1,
 *  évolution 11 — docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Le réel par jour et par rôle s'importe ici (CSV ou classeur) ; une
 *  correspondance range les rôles en lignes, chacune couvrant des services,
 *  l'encadrement d'un service, des chauffeurs, ou rien ; la comparaison
 *  montre, ligne par ligne et mois par mois, le réel, le simulé et l'écart.
 *  Le calcul est celui de l'outil (moteur/reel.js) ; le classeur aussi
 *  (echanges-calage.js).
 *
 *  ⚠ Les heures réelles restent en mémoire, le temps de la page. La
 *  sauvegarde ne garde que des réglages (« ory-calage-v1 ») : la
 *  correspondance, les jours et les cellules écartés, les cellules
 *  réintégrées.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const R = () => root.OrlyReel, T = () => root.OrlyTableur, C = () => root.OrlyCalagePeriode;
  const PE = () => root.OrlyPeriode, PL = () => root.OrlyPlanning, CT = () => root.OrlyCalageTravail;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // « + 0 » : un −0 (un biais négatif arrondi) s'écrit 0.
  const nombre = (x, k = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.round(x * 10 ** k) / 10 ** k + 0).toLocaleString('fr-FR', { maximumFractionDigits: k }));
  const dateFr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const MAX_REEL = 50 * 1024 * 1024;
  const COUVRE = [['services', 'Des services'], ['encadrement', 'L’encadrement d’un service'], ['camion', 'Les chauffeurs camion'], ['vl', 'Les chauffeurs VL'], ['hors', 'Hors simulation']];

  class VueCalage {
    /* a = {
     *   bilan()         — le bilan de la période simulée et à jour, ou null
     *   periode()       — { debut, fin } de cette période, ou null
     *   services()      — [{ id, nom }] : les services de l'unité
     *   reglages()      — les réglages gardés (ory-calage-v1), ou null ; enregistrer(r) — les garder
     *   notifier(texte)
     *   signature(correspondance) — l'empreinte de ce que suppose un calage (barème, équipes, correspondance)
     *   appliquerTravail(services, k) → avant ; annulerTravail(avant) — le travail des services × k au barème, et le retour
     *   journee()       — la journée affichée en jour de travail (moteur/calage-periode.js, jourDeLaJournee), ou null
     *   ateliers()      — les équipes de l'unité (pour lire un planning)
     *   periodeDuRejeu() — { unite, vols, options } : la période à rejouer avec le planning ; signaturePeriode() — ce qui la rend « à relancer »
     * } */
    constructor(a) {
      this.a = a; this.lu = null; this.fichier = null; this.erreur = null; this.erreurCorrespondance = null; this.rapport = null;
      const r = this.relire();
      this.correspondance = r.correspondance; this.decisions = r.decisions;
      this.politique = r.politique || null; this.applications = r.applications || [];
      // Le planning, le rejeu et le calage du travail (évolution 11 f) : en mémoire, le temps de la page.
      this.planning = null; this.fichierPlanning = null; this.erreurPlanning = null; this.rejeu = null; this.travail = null; this.calcul = null;
      this.box = null;
    }
    /** Les réglages gardés, relus ; vides s'ils sont illisibles. */
    relire() {
      try { return R().validerReglages(this.a.reglages ? this.a.reglages() : null); }
      catch (e) { return R().validerReglages(null); }
    }
    enregistrer() {
      if (this.a.enregistrer) this.a.enregistrer({ correspondance: this.correspondance, decisions: this.decisions,
        ...(this.politique ? { politique: this.politique } : {}), ...(this.applications.length ? { applications: this.applications } : {}) });
    }
    /** Redessiner seulement si la période a changé (un autre calcul, ou « à relancer ») : ses propres gestes redessinent d'eux-mêmes. */
    rafraichir() {
      const b = this.a.bilan();
      if (b === this.dernierBilan && this.box) return;
      this.dernierBilan = b; this.rendre();
    }
    attacher(box) {
      if (!box || box === this.box) return;
      this.box = box;
      box.addEventListener('click', e => this.clic(e));
      box.addEventListener('change', e => this.choix(e));
    }

    /* ---- le réel --------------------------------------------------------- */

    async importer(fichier) {
      if (!fichier) return;
      try {
        this.lu = R().lireReel(await T().lireFichier(fichier, MAX_REEL));
        this.fichier = fichier.name; this.erreur = null; this.erreurCorrespondance = null;
        const jours = [...new Set(this.lu.lignes.map(l => l.date))].sort();
        this.a.notifier('Réel importé : ' + this.lu.lignes.length + ' lignes, du ' + dateFr(jours[0]) + ' au ' + dateFr(jours[jours.length - 1]) + '.');
      } catch (e) { this.erreur = 'Réel refusé — ' + e.message.replace(/[.\s]*$/, '') + '. Rien n’a été remplacé.'; }
      this.rendre();
    }
    /* ---- le planning, le rejeu, le calage du travail (évolution 11 f) ---- */

    async importerPlanning(fichier) {
      if (!fichier) return;
      try {
        const p = PL().lirePlanning(await T().lireFichier(fichier, MAX_REEL), { services: this.a.services(), ateliers: this.a.ateliers ? this.a.ateliers() : [] });
        this.planning = p; this.fichierPlanning = fichier.name; this.erreurPlanning = null; this.rejeu = null; this.travail = null;
        this.a.notifier('Planning importé : ' + p.lignes + ' lignes, ' + p.dates.length + ' jours de vols, du ' + dateFr(p.dates[0]) + ' au ' + dateFr(p.dates[p.dates.length - 1]) + '.');
      } catch (e) { this.erreurPlanning = 'Planning refusé — ' + e.message.replace(/[.\s]*$/, '') + '. Rien n’a été remplacé.'; }
      this.rendre();
    }
    /** Ce qu'un rejeu suppose : la période (sa signature) et le planning. */
    cleDuRejeu() {
      return (this.a.signaturePeriode ? this.a.signaturePeriode() : '') + '|' + (this.planning ? C().empreinte(JSON.stringify(this.planning.jours)) : '');
    }
    /** Ce qu'un calage du travail suppose de plus : le réel, ses décisions, la correspondance. */
    cleDuTravail() {
      return this.cleDuRejeu() + '|' + C().empreinte(JSON.stringify([this.lu ? this.lu.lignes : null, this.decisions, this.correspondance]));
    }
    /**
     * Lance un calcul jour par jour, avec sa progression et « Annuler » : le rejeu de la période avec le planning
     * (moteur/periode.js), ou le calage du travail (moteur/calage-travail.js), qui la rejoue facteur après facteur.
     */
    lancerCalcul(type) {
      if (this.calcul || !this.planning) return;
      const x = this.a.periodeDuRejeu ? this.a.periodeDuRejeu() : null;
      if (!x || !x.vols) { this.erreurPlanning = 'Importez un programme de vols daté : le rejeu joue une période.'; this.rendre(); return; }
      let p;
      try {
        p = type === 'rejeu' ? PE().creerPeriode(x.unite, x.vols, { ...x.options, planning: this.planning })
          : CT().creerCalageTravail({ unite: x.unite, vols: x.vols, planning: this.planning, controle: this.controle(), correspondance: this.correspondance, options: x.options,
            services: this.a.services().map(s => s.id) });
      } catch (e) { this.erreurPlanning = (type === 'rejeu' ? 'Rejeu impossible — ' : 'Calage du travail impossible — ') + e.message.replace(/[.\s]*$/, '') + '.'; this.rendre(); return; }
      const c = this.calcul = { type, p, cle: type === 'rejeu' ? this.cleDuRejeu() : this.cleDuTravail() };
      this.erreurPlanning = null;
      // Chaque pas joue quelques journées, puis rend la main : la page reste vivante, Annuler répond.
      const pas = () => {
        if (this.calcul !== c) return;
        try { for (let k = 0; k < 3 && !p.fini; k++) p.suivant(); }
        catch (e) { this.calcul = null; this.erreurPlanning = 'Calcul arrêté — ' + e.message; this.rendre(); return; }
        if (!p.fini) { this.rendreProgression(); setTimeout(pas, 0); return; }
        this.calcul = null;
        if (type === 'rejeu') {
          this.rejeu = { resultat: p.resultat(), cle: c.cle };
          this.a.notifier('Rejeu fait : ' + this.rejeu.resultat.periode.rejeu.joursAvecPlanning + ' jours de vols avec leur planning.');
        } else {
          this.travail = { ...p.resultat(), cle: c.cle };
          const n = this.travail.lignes.filter(l => l.cale && l.accepte).length;
          this.a.notifier('Calage du travail fait : ' + n + ' ligne' + (n > 1 ? 's' : '') + ' avec un facteur accepté.');
        }
        this.rendre();
      };
      this.rendre(); setTimeout(pas, 0);
    }
    annulerCalcul() {
      if (!this.calcul) return;
      const t = this.calcul.type; this.calcul = null; this.rendre();
      this.a.notifier(t === 'rejeu' ? 'Rejeu annulé.' : 'Calage du travail annulé.');
    }
    /** La progression du calcul, sans tout redessiner. */
    rendreProgression() {
      const el = this.box && this.box.querySelector('[data-cal-progression]'), c = this.calcul;
      if (!el || !c) return;
      el.max = c.p.total; el.value = c.p.fait;
      const t = this.box.querySelector('[data-cal-progression-texte]');
      if (t) t.textContent = c.p.fait + ' / ' + c.p.total + ' journées jouées';
    }
    /** La comparaison du rejeu au réel (les heures supp jour par jour, les nuits de plonge, les lots en retard), ou null. */
    comparaisonRejeu() {
      const c = this.controle();
      if (!this.rejeu || !c) return null;
      try { return R().comparer(this.rejeu.resultat.bilan, c, this.correspondance, { rejeu: true, services: this.a.services().map(s => s.id) }); }
      catch (e) { return null; }
    }
    /** « Appliquer au barème » le facteur de travail d'une ligne (accepté) : ses services × k, comme un × a de la politique. */
    appliquerFacteurDeTravail(nom) {
      const t = this.travail && this.travail.cle === this.cleDuTravail() && this.travail.lignes.find(x => x.nom === nom && x.cale && x.accepte && !x.applique);
      const l = this.correspondance.lignes.find(x => x.nom === nom);
      if (!t || !l || !l.services) return;
      const refus = this.refusAppliquer({ services: t.services, parametres: { a: t.facteur } }, l);
      const comp = refus ? null : this.comparaison();
      const erreursAvant = comp ? Object.fromEntries(comp.lignes.map(x => [x.nom, x.periode.mae]).filter(([, e]) => Number.isFinite(e))) : {};
      const r = refus ? null : this.a.appliquerTravail(l.services, t.facteur);
      if (refus || r.refus) { this.a.notifier(nom + ' : pas appliqué — ' + (refus || r.refus) + '.'); this.rendre(); return; }
      this.applications.push({ ligne: nom, services: l.services.slice(), a: t.facteur, date: new Date().toISOString(), avant: r.avant, erreursAvant, source: 'travail' });
      t.applique = true; this.enregistrer();
      this.a.notifier(nom + ' : travail × ' + nombre(t.facteur, 2) + ' au barème (calage du travail). La période est à relancer.');
      this.rendre();
    }

    /** Le réel contrôlé, avec les décisions ; null sans réel. */
    controle() { return this.lu ? R().controler(this.lu, this.decisions) : null; }
    /** La comparaison, ou null (sans réel, sans période à jour, ou une correspondance refusée). */
    comparaison() {
      const b = this.a.bilan(), c = this.controle();
      if (!b || !c) return null;
      try { const x = R().comparer(b, c, this.correspondance, { services: this.a.services().map(s => s.id) }); this.erreurComparaison = null; return x; }
      catch (e) { this.erreurComparaison = e.message; return null; }
    }

    /* ---- la correspondance ------------------------------------------------- */

    /** Un changement de la correspondance : relu par le validateur, gardé ; refusé, l'état reste et le refus se lit. */
    changerCorrespondance(f) {
      const brouillon = JSON.parse(JSON.stringify(this.correspondance));
      f(brouillon);
      try {
        this.correspondance = R().validerCorrespondance(brouillon, { services: this.a.services().map(s => s.id) });
        this.erreurCorrespondance = null; this.enregistrer();
      } catch (e) { this.erreurCorrespondance = 'Refusé — ' + e.message.replace(/^correspondance : /, ''); }
      this.rendre();
    }
    changerDecisions(f) {
      const d = JSON.parse(JSON.stringify(this.decisions));
      f(d);
      this.decisions = R().validerDecisions(d); this.enregistrer(); this.rendre();
    }
    /** Ce qu'une ligne couvre, depuis le choix de la page. */
    static couvrir(l, quoi, services) {
      for (const k of ['services', 'encadrement', 'chauffeurs', 'hors']) delete l[k];
      if (quoi === 'services') l.services = services && services.length ? services : [];
      else if (quoi === 'encadrement') l.encadrement = services && services[0];
      else if (quoi === 'camion' || quoi === 'vl') l.chauffeurs = quoi;
      else l.hors = true;
    }
    nouveauNom(base) {
      const noms = new Set(this.correspondance.lignes.map(l => l.nom));
      let n = base, k = 2;
      while (noms.has(n)) n = base + ' ' + k++;
      return n;
    }
    exporterCorrespondance() {
      const json = JSON.stringify({ ...this.correspondance, decisions: this.decisions }, null, 2);
      T().telecharger('ory-correspondance.json', json, 'application/json');
    }
    async importerCorrespondance(fichier) {
      if (!fichier) return;
      try {
        if (fichier.size > 1024 * 1024) throw new Error('fichier trop volumineux (1 Mo au plus).');
        let brut;
        try { brut = JSON.parse(await fichier.text()); } catch (e) { throw new Error('ce n’est pas un fichier JSON lisible.'); }
        const c = R().validerCorrespondance(brut, { services: this.a.services().map(s => s.id) });
        const d = brut && brut.decisions !== undefined ? R().validerDecisions(brut.decisions) : this.decisions;
        this.correspondance = c; this.decisions = d; this.erreurCorrespondance = null; this.enregistrer();
        this.a.notifier('Correspondance importée : ' + c.lignes.length + ' ligne' + (c.lignes.length > 1 ? 's' : '') + '.');
      } catch (e) { this.erreurCorrespondance = 'Correspondance refusée — ' + e.message.replace(/^correspondance : /, ''); }
      this.rendre();
    }
    exporterClasseur() {
      const c = this.comparaison(); if (!c) return;
      const p = this.a.periode ? this.a.periode() : null;
      // Le rejeu et le calage du travail (évolution 11 f), s'ils sont faits.
      const octets = T().ecrireClasseur(root.OrlyEchangesCalage.calageVersClasseur({ comparaison: c, reel: this.controle(), rapport: this.rapport,
        ...(this.rejeu && this.rejeu.cle === this.cleDuRejeu() ? { rejeu: this.comparaisonRejeu() } : {}),
        ...(this.travail && this.travail.cle === this.cleDuTravail() ? { travail: this.travail } : {}) },
        { periode: p || {}, reel: this.fichier, correspondance: 'la page', calculeLe: new Date() }));
      T().telecharger('ory-calage' + (p ? '-' + p.debut + '-au-' + p.fin : '') + '.xlsx', octets);
    }

    /** Le calage de chaque ligne (moteur/calage-periode.js) : le même que l'outil. */
    caler() {
      const c = this.comparaison(); if (!c) return;
      this.rapport = { cle: this.cleComparaison, ...C().caler(c) };
      const n = this.rapport.lignes.filter(l => l.cale && !['moteur', 'constante'].includes(l.retenu.modele)).length;
      this.a.notifier('Calage fait : ' + n + ' ligne' + (n > 1 ? 's' : '') + ' sur ' + this.rapport.lignes.length + ' avec un modèle accepté.');
      this.rendre();
    }

    /* ---- la politique d'effectif (évolution 11 d) ------------------------- */

    /** Garder le calage comme politique d'effectif : par ligne, le modèle, ses paramètres et σ ; aucune heure réelle. */
    garder() {
      if (!this.rapport) return;
      // La période apprise : du premier au dernier jour comparé (ceux qui ont du réel), sinon la période simulée.
      const comp = this.comparaison(), jours = comp ? comp.jours : [];
      const p = jours.length ? { debut: jours[0], fin: jours[jours.length - 1] } : this.a.periode ? this.a.periode() : null;
      this.politique = C().politiqueDe(this.rapport, { date: new Date().toISOString(), periode: p, signature: this.a.signature(this.correspondance),
        correspondance: this.correspondance });
      this.enregistrer();
      this.a.notifier('Politique d’effectif gardée : ' + this.politique.lignes.length + ' ligne' + (this.politique.lignes.length > 1 ? 's' : '') + '.');
      this.rendre();
    }
    /** Le prévu calé des jours de travail de la période (le bilan à jour), ou null. */
    prevuPeriode() {
      const b = this.a.bilan();
      return b && this.politique ? C().prevuDesJours(this.politique, this.correspondance, b.joursTravail, R().simuleDe) : null;
    }
    /**
     * Pourquoi le × a d'une ligne ne s'applique pas au barème (null : il
     * s'applique) : il faut une comparaison à jour (pour voir ensuite si une
     * autre ligne se dégrade), les services du calage, et un travail qui suit
     * le barème tout entier.
     */
    refusAppliquer(m, l) {
      if (!this.comparaison()) return 'il faut le réel importé et la période à jour : sans comparaison, rien ne dirait ensuite si une autre ligne se dégrade';
      if (m.services && [...m.services].sort().join('|') !== [...l.services].sort().join('|')) return 'la ligne ne couvre plus les services du calage : calez-la à nouveau';
      return this.a.verifierTravail ? this.a.verifierTravail(l.services, m.parametres.a) : null;
    }
    /** « Appliquer au barème » le × a d'une ligne : ses services × a ; la période devient « à relancer ». */
    appliquer(nom) {
      const m = this.politique && this.politique.lignes.find(x => x.nom === nom), l = this.correspondance.lignes.find(x => x.nom === nom);
      if (!m || m.modele !== 'x-a' || m.applique || !l || !l.services) return;
      const refus = this.refusAppliquer(m, l);
      // Les erreurs d'avant, prises avant que le barème change (la comparaison ne vaut plus ensuite).
      const comp = refus ? null : this.comparaison();
      const erreursAvant = comp ? Object.fromEntries(comp.lignes.map(x => [x.nom, x.periode.mae]).filter(([, e]) => Number.isFinite(e))) : {};
      const r = refus ? null : this.a.appliquerTravail(l.services, m.parametres.a);
      if (refus || r.refus) { this.a.notifier(nom + ' : pas appliqué — ' + (refus || r.refus) + '.'); return this.rendre(); }
      this.applications.push({ ligne: nom, services: l.services.slice(), a: m.parametres.a, date: new Date().toISOString(), avant: r.avant, erreursAvant, modele: m });
      // Le facteur est maintenant dans le barème : le prévu calé de la ligne ne le compte pas deux fois (a = 1 jusqu'au prochain calage).
      this.politique = { ...this.politique, lignes: this.politique.lignes.map(x => (x === m ? { ...m, parametres: { a: 1 }, applique: true } : x)) };
      this.enregistrer();
      this.a.notifier(nom + ' : travail × ' + nombre(m.parametres.a, 3) + ' au barème. La période est à relancer, puis un nouveau calage doit trouver a ≈ 1.');
      this.rendre();
    }
    /** « Annuler » une application : la plus récente d'abord, quand deux touchent un même service. */
    annulerApplication(i) {
      const x = this.applications[i]; if (!x || !C().annulable(this.applications, i)) return;
      this.a.annulerTravail(x.avant);
      // Le modèle de la ligne revient, s'il est encore celui que l'application a laissé.
      if (this.politique && x.modele) this.politique = { ...this.politique,
        lignes: this.politique.lignes.map(m => (m.nom === x.ligne && m.applique ? x.modele : m)) };
      // Un facteur du calage du travail annulé : il peut s'appliquer de nouveau.
      if (x.source === 'travail' && this.travail) for (const l of this.travail.lignes) if (l.nom === x.ligne) delete l.applique;
      this.applications.splice(i, 1); this.enregistrer();
      this.a.notifier(x.ligne + ' : le barème d’avant est rétabli.');
      this.rendre();
    }

    /* ---- les gestes ------------------------------------------------------ */

    clic(e) {
      const b = e.target.closest('[data-cal]'); if (!b) return;
      const f = b.dataset.cal, i = +b.dataset.ligne;
      if (f === 'choisir') { const x = document.getElementById(b.dataset.pour); if (x) x.click(); }
      else if (f === 'modele') T().telecharger('reel-modele.csv', R().modeleCsv(), 'text/csv;charset=utf-8');
      else if (f === 'ajouter') this.changerCorrespondance(c => c.lignes.push({ nom: this.nouveauNom('Nouvelle ligne'), roles: [], hors: true }));
      else if (f === 'ligne-role') this.changerCorrespondance(c => c.lignes.push({ nom: this.nouveauNom(b.dataset.role), roles: [b.dataset.role], hors: true }));
      else if (f === 'supprimer') this.changerCorrespondance(c => c.lignes.splice(i, 1));
      else if (f === 'retirer-role') this.changerCorrespondance(c => { c.lignes[i].roles = c.lignes[i].roles.filter(r => r !== b.dataset.role); });
      else if (f === 'exporter-correspondance') this.exporterCorrespondance();
      else if (f === 'exporter') this.exporterClasseur();
      else if (f === 'caler') this.caler();
      else if (f === 'garder') this.garder();
      else if (f === 'oublier') { this.politique = null; this.enregistrer(); this.rendre(); }
      else if (f === 'appliquer') this.appliquer(b.dataset.nom);
      else if (f === 'annuler-application') this.annulerApplication(+b.dataset.i);
      else if (f === 'modele-planning') T().telecharger('planning-modele.csv', PL().modeleCsv({ services: this.a.services(), ateliers: this.a.ateliers ? this.a.ateliers() : [] }), 'text/csv;charset=utf-8');
      else if (f === 'rejouer') this.lancerCalcul('rejeu');
      else if (f === 'caler-travail') this.lancerCalcul('travail');
      else if (f === 'annuler-calcul') this.annulerCalcul();
      else if (f === 'appliquer-travail') this.appliquerFacteurDeTravail(b.dataset.nom);
      else if (f === 'reintegrer') this.changerDecisions(d => { d.reintegres.push(b.dataset.cle); });
      else if (f === 'retablir') this.changerDecisions(d => { d.ecartes.cellules = d.ecartes.cellules.filter(k => k !== b.dataset.cle); });
      else if (f === 'retablir-jour') this.changerDecisions(d => { d.ecartes.jours = d.ecartes.jours.filter(k => k !== b.dataset.date); });
      else if (f === 'ecarter-jour') this.changerDecisions(d => { d.ecartes.jours.push(b.dataset.date); });
      else if (f === 'ecarter-mois') this.changerDecisions(d => {
        for (const x of new Set(this.lu.lignes.filter(l => l.date.startsWith(b.dataset.mois)).map(l => l.date))) d.ecartes.jours.push(x);
      });
    }
    choix(e) {
      const t = e.target, i = +t.dataset.ligne;
      if (t.id === 'calage-reel') { this.importer(t.files[0]); t.value = ''; return; }
      if (t.id === 'calage-correspondance') { this.importerCorrespondance(t.files[0]); t.value = ''; return; }
      if (t.id === 'calage-planning') { this.importerPlanning(t.files[0]); t.value = ''; return; }
      const f = t.dataset.calChamp; if (!f) return;
      if (f === 'nom') this.changerCorrespondance(c => { c.lignes[i].nom = t.value; });
      else if (f === 'ajout-role' && t.value) this.changerCorrespondance(c => { c.lignes[i].roles.push(t.value); });
      else if (f === 'couvre') {
        const premier = (this.a.services()[0] || {}).id;
        if ((t.value === 'services' || t.value === 'encadrement') && !premier) { this.erreurCorrespondance = 'Aucun service dans l’unité : rien à couvrir.'; this.rendre(); return; }
        this.changerCorrespondance(c => VueCalage.couvrir(c.lignes[i], t.value, t.value === 'services' || t.value === 'encadrement' ? [premier] : null));
      }
      else if (f === 'service') this.changerCorrespondance(c => {
        const l = c.lignes[i];
        if (l.encadrement !== undefined) l.encadrement = t.value;
        else l.services = t.checked ? [...new Set(l.services.concat([t.value]))] : l.services.filter(s => s !== t.value);
      });
      else if (f === 'base-titulaires' || f === 'base-interim') this.changerCorrespondance(c => {
        const role = t.dataset.role || 'defaut', b = c.bases[role] = c.bases[role] || { ...c.bases.defaut };
        b[f === 'base-titulaires' ? 'titulaires' : 'interim'] = +String(t.value).replace(',', '.');
      });
      else if (f === 'base-role' && t.value) this.changerCorrespondance(c => { c.bases[t.value] = { ...c.bases.defaut }; });
    }

    /* ---- le rendu ---------------------------------------------------------- */

    /** Redessiner la vue. Retirer le champ qui a le focus déclenche son « change » pendant le rendu : le rendu qu'il demande se fait juste après. */
    rendre() {
      if (this.enRendu) { this.aRefaire = true; return; }
      this.enRendu = true;
      try { this.rendreMaintenant(); } finally { this.enRendu = false; }
      if (this.aRefaire) { this.aRefaire = false; this.rendre(); }
    }
    rendreMaintenant() {
      const box = this.box || document.getElementById('pv-reel'); if (!box) return;
      this.attacher(box);
      const b = this.a.bilan(), ctrl = this.controle(), comp = this.comparaison();
      // Le rapport ne vaut que pour la comparaison d'où il vient : elle change, il s'efface.
      const cle = comp ? JSON.stringify([comp.lignes.map(l => [l.nom, l.jours]), comp.unite.jours]) : null;
      if (this.rapport && this.rapport.cle !== cle) this.rapport = null;
      this.cleComparaison = cle;
      const focus = VueCalage.cleDuFocus(box);
      box.innerHTML = `<div class="panneau pc-reel">
        <h2 class="pc-titre">Réel et calage</h2>
        <p class="mini-note">Comparez la période simulée aux heures réelles, rôle par rôle. Les heures réelles restent dans cette page, le temps de la page ;
          la sauvegarde ne garde que la correspondance et vos choix (jours écartés, cellules réintégrées).</p>
        <div class="pc-actions">
          <button type="button" class="btn btn-sm" data-cal="choisir" data-pour="calage-reel">Importer le réel (CSV, Excel)</button>
          <input type="file" id="calage-reel" accept=".csv,.txt,.xlsx" hidden aria-label="Le fichier du réel">
          <button type="button" class="btn btn-sm" data-cal="modele" title="Un réel fictif : trois jours, deux rôles">Modèle CSV</button>
          <button type="button" class="btn btn-sm" data-cal="choisir" data-pour="calage-planning">Importer le planning (CSV, Excel)</button>
          <input type="file" id="calage-planning" accept=".csv,.txt,.xlsx" hidden aria-label="Le fichier du planning">
          <button type="button" class="btn btn-sm" data-cal="modele-planning" title="Un planning fictif : deux jours, une équipe, une nuit">Modèle de planning</button>
          <span class="pc-etat" role="status">${this.erreur ? '<span class="pj-erreur">' + esc(this.erreur) + '</span>'
            : this.lu ? esc(this.fichier) + ' : ' + this.lu.lignes.length + ' lignes, ' + ctrl.roles.length + ' rôles, ' + ctrl.jours.length + ' jours.' : 'Aucun réel importé.'}</span>
        </div>
        ${this.rendreCorrespondance(ctrl)}
        ${ctrl ? this.rendreAnomalies(ctrl) : ''}
        ${!this.lu ? '' : !b ? '<p class="mini-note pc-attente">Simulez la période (à jour) pour comparer.</p>'
          : !this.correspondance.lignes.length ? '<p class="mini-note pc-attente">Ajoutez une ligne à la correspondance pour comparer.</p>'
          : comp ? this.rendreComparaison(comp) + this.rendreRapport() : this.erreurComparaison ? `<p class="pj-erreur" role="alert">Comparaison impossible — ${esc(this.erreurComparaison)}</p>` : ''}
        ${this.rendrePolitique(b, comp)}
        ${this.rendreApplications(comp)}
        ${this.rendreRejeu()}
      </div>`;
      VueCalage.rendreFocus(box, focus);
      this.rendreJour();
    }

    /** Le geste qui a le focus, pour le retrouver après le rendu. */
    static cleDuFocus(box) {
      const a = document.activeElement;
      if (!a || !box.contains(a) || a === box) return null;
      if (a.id) return '#' + a.id;
      const attrs = ['data-cal', 'data-cal-champ', 'data-ligne', 'data-role', 'data-cle', 'data-date', 'data-mois', 'data-nom', 'data-i'].filter(k => a.hasAttribute(k));
      const val = a.type === 'checkbox' ? '[value="' + CSS.escape(a.value) + '"]' : '';
      return attrs.length ? attrs.map(k => '[' + k + '="' + CSS.escape(a.getAttribute(k)) + '"]').join('') + val : null;
    }
    static rendreFocus(box, cle) {
      if (!cle) return;
      let n = null;
      try { n = box.querySelector(cle); } catch (e) { n = null; }
      if (n) n.focus();
    }

    rendreCorrespondance(ctrl) {
      const services = this.a.services(), c = this.correspondance;
      const dansUneLigne = new Set(c.lignes.flatMap(l => l.roles)), roles = ctrl ? ctrl.roles : [];
      const libres = roles.filter(r => !dansUneLigne.has(r));
      const couvre = l => (l.services ? 'services' : l.encadrement !== undefined ? 'encadrement' : l.chauffeurs || 'hors');
      const detail = (l, i) => {
        if (l.services) return `<div class="pc-services">${services.map(s => `<label><input type="checkbox" data-cal-champ="service" data-ligne="${i}" value="${esc(s.id)}"${l.services.includes(s.id) ? ' checked' : ''}>${esc(s.nom)}</label>`).join('')}</div>`;
        if (l.encadrement !== undefined) return `<select data-cal-champ="service" data-ligne="${i}" aria-label="Le service de cet encadrement">${services.map(s => `<option value="${esc(s.id)}"${s.id === l.encadrement ? ' selected' : ''}>${esc(s.nom)}</option>`).join('')}</select>`;
        return '';
      };
      const ligne = (l, i) => `<tr data-cal-ligne="${i}"><td><input value="${esc(l.nom)}" data-cal-champ="nom" data-ligne="${i}" maxlength="160" aria-label="Nom de la ligne"></td>
          <td>${l.roles.map(r => `<span class="pc-role">${esc(r)}<button type="button" class="pc-retirer" data-cal="retirer-role" data-ligne="${i}" data-role="${esc(r)}" aria-label="Retirer ${esc(r)}">×</button></span>`).join('')}
            ${libres.length ? `<select data-cal-champ="ajout-role" data-ligne="${i}" aria-label="Ajouter un rôle à ${esc(l.nom)}"><option value="">+ un rôle</option>${libres.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>` : ''}</td>
          <td><select data-cal-champ="couvre" data-ligne="${i}" aria-label="Ce que couvre ${esc(l.nom)}">${COUVRE.map(([k, t]) => `<option value="${k}"${k === couvre(l) ? ' selected' : ''}>${t}</option>`).join('')}</select>${detail(l, i)}</td>
          <td><button type="button" class="btn btn-sm" data-cal="supprimer" data-ligne="${i}" aria-label="Supprimer la ligne ${esc(l.nom)}">Supprimer</button></td></tr>`;
      const bases = Object.entries(c.bases).map(([role, b]) => `<label class="pc-base">${role === 'defaut' ? 'Par défaut' : esc(role)}
          <input type="number" min="0.5" max="24" step="0.25" value="${b.titulaires}" data-cal-champ="base-titulaires"${role === 'defaut' ? '' : ` data-role="${esc(role)}"`} aria-label="Heures d’un ETP titulaire${role === 'defaut' ? '' : ', ' + esc(role)}"> h titulaire,
          <input type="number" min="0.5" max="24" step="0.25" value="${b.interim}" data-cal-champ="base-interim"${role === 'defaut' ? '' : ` data-role="${esc(role)}"`} aria-label="Heures d’un ETP intérimaire${role === 'defaut' ? '' : ', ' + esc(role)}"> h intérim</label>`).join('');
      const sansBase = roles.filter(r => !c.bases[r]);
      return `<section class="pc-correspondance" aria-label="La correspondance">
        <h3>La correspondance</h3>
        <div class="pc-bases"><span>Un ETP :</span>${bases}${sansBase.length ? `<select data-cal-champ="base-role" aria-label="Une base pour un rôle"><option value="">+ une base pour un rôle</option>${sansBase.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>` : ''}</div>
        ${c.lignes.length ? `<div class="table-scroll"><table class="svc-table pc-table"><thead><tr><th scope="col">Ligne</th><th scope="col">Rôles du réel</th><th scope="col">Couvre</th><th scope="col"></th></tr></thead>
          <tbody>${c.lignes.map(ligne).join('')}</tbody></table></div>` : '<p class="mini-note">Aucune ligne : ajoutez-en une, ou partez d’un rôle du réel.</p>'}
        ${this.erreurCorrespondance ? `<p class="pj-erreur pc-refus" role="alert">${esc(this.erreurCorrespondance)}</p>` : ''}
        <div class="pc-actions"><button type="button" class="btn btn-sm" data-cal="ajouter">+ Ajouter une ligne</button>
          <button type="button" class="btn btn-sm" data-cal="choisir" data-pour="calage-correspondance">Importer (JSON)</button>
          <input type="file" id="calage-correspondance" accept=".json" hidden aria-label="Le fichier de la correspondance">
          <button type="button" class="btn btn-sm" data-cal="exporter-correspondance">Exporter (JSON)</button></div>
        ${libres.length ? `<p class="pc-libres"><b>Rôles sans ligne</b> (pas comptés) : ${libres.map(r => `<button type="button" class="pc-role pc-libre" data-cal="ligne-role" data-role="${esc(r)}" title="Une ligne pour ce rôle">${esc(r)} +</button>`).join(' ')}</p>` : ''}
      </section>`;
    }

    rendreAnomalies(ctrl) {
      const d = this.decisions;
      const ecartees = ctrl.ecartees.map(x => `<li data-cal-cle="${esc(x.cle)}">${dateFr(x.date)} · ${esc(x.role)} — ${esc(x.raison)}
          ${x.code === 'choix' ? `<button type="button" class="btn btn-sm" data-cal="retablir" data-cle="${esc(x.cle)}">Rétablir</button>`
            : `<button type="button" class="btn btn-sm" data-cal="reintegrer" data-cle="${esc(x.cle)}">Réintégrer</button>`}</li>`);
      const jours = ctrl.joursEcartes.map(x => `<li>${dateFr(x)} — jour écarté par vous <button type="button" class="btn btn-sm" data-cal="retablir-jour" data-date="${x}">Rétablir</button></li>`);
      const signalees = ctrl.signalees.map(x => `<li>${esc(x.raison)} ${x.code === 'jour-absent'
        ? `<button type="button" class="btn btn-sm" data-cal="ecarter-jour" data-date="${x.date}">Écarter ce jour</button>`
        : `<button type="button" class="btn btn-sm" data-cal="ecarter-mois" data-mois="${x.mois}">Écarter les jours de ce mois</button>`}</li>`);
      if (!ecartees.length && !jours.length && !signalees.length && !d.reintegres.length) return '<p class="mini-note pc-propre">Le réel ne montre aucune anomalie.</p>';
      return `<section class="pc-anomalies" aria-label="Les anomalies du réel"><h3>Les anomalies du réel</h3>
        ${ecartees.length || jours.length ? `<p class="mini-note">Écartées (rien d’autre ne bloque) :</p><ul class="pc-liste pc-ecartees">${ecartees.concat(jours).join('')}</ul>` : ''}
        ${signalees.length ? `<p class="mini-note">À vérifier (rien n’est écarté : à vous de décider) :</p><ul class="pc-liste pc-signalees">${signalees.join('')}</ul>` : ''}
        ${d.reintegres.length ? `<p class="mini-note">Réintégrées par vous : ${d.reintegres.map(esc).join(', ')}.</p>` : ''}</section>`;
    }

    rendreComparaison(c) {
      const hs = h => (h ? nombre(h.reel, 1) + ' h réelles, ' + nombre(h.simule, 1) + ' h simulées' : '');
      // Jour par jour : le réel, le simulé, l'écart ; un jour s'écarte d'ici.
      const jours = x => `<tr class="pc-jours"><td colspan="6"><details><summary>Jour par jour (${x.jours.length})</summary>
          <table class="svc-table pc-table"><thead><tr><th scope="col">Jour</th><th scope="col">Réel (ETP)</th><th scope="col">Simulé (ETP)</th><th scope="col">Écart</th><th scope="col"></th></tr></thead>
          <tbody>${x.jours.map(j => `<tr data-cal-jour="${j.date}"><th scope="row">${dateFr(j.date)}</th><td class="pv-n">${nombre(j.reel)}</td><td class="pv-n">${nombre(j.simule)}</td><td class="pv-n">${nombre(j.ecart)}</td>
            <td><button type="button" class="btn btn-sm" data-cal="ecarter-jour" data-date="${j.date}">Écarter ce jour</button></td></tr>`).join('')}</tbody></table></details></td></tr>`;
      const ligne = (nom, couvre, x, corr) => `<tbody data-cal-comparaison="${esc(nom)}"><tr class="pc-tete-ligne"><th scope="rowgroup" colspan="6">${esc(nom)} <small>${esc(couvre)}</small></th></tr>
          ${x.mois.map(m => `<tr><th scope="row">${esc(m.mois)}</th><td class="pv-n">${m.jours}</td><td class="pv-n">${nombre(m.mae)}</td><td class="pv-n">${nombre(m.biais)}</td><td class="pv-n">${corr ? nombre(m.correlation) : ''}</td>
            <td class="pv-n">${hs((x.heuresSupp || []).find(h => h.mois === m.mois))}</td></tr>`).join('')}
          <tr class="pv-cumul"><th scope="row">Période</th><td class="pv-n">${x.periode.jours}</td><td class="pv-n" data-cal-mae>${nombre(x.periode.mae)}</td><td class="pv-n">${nombre(x.periode.biais)}</td><td class="pv-n">${corr ? nombre(x.periode.correlation) : ''}</td>
            <td class="pv-n">${(x.heuresSupp || []).length ? 'heures supp : ' + hs(x.heuresSupp.reduce((n, h) => ({ reel: n.reel + h.reel, simule: n.simule + h.simule }), { reel: 0, simule: 0 })) : ''}</td></tr>
          ${x.jours.length ? jours(x) : ''}</tbody>`;
      return `<section class="pc-comparaison" aria-label="La comparaison"><h3>La comparaison</h3>
        <p class="mini-note">${c.jours.length} jour${c.jours.length > 1 ? 's' : ''} de travail complet${c.jours.length > 1 ? 's' : ''} avec du réel${c.joursIncomplets.length ? ' ; jours incomplets laissés de côté : ' + c.joursIncomplets.map(dateFr).join(', ') : ''}.
          Erreur : l’écart moyen (simulé − réel) en valeur absolue, en ETP ; biais : l’écart moyen (positif : la simulation surestime).</p>
        <div class="table-scroll"><table class="svc-table pc-table pc-mesures">
          <thead><tr><th scope="col">Mois</th><th scope="col">Jours</th><th scope="col">Erreur (ETP)</th><th scope="col">Biais (ETP)</th><th scope="col">Corrélation</th><th scope="col">Heures supp</th></tr></thead>
          ${c.lignes.map(l => ligne(l.nom, l.couvre, l, true)).join('')}
          ${ligne('Toute l’unité', 'toutes les lignes, hors simulation comprise', c.unite, false)}</table></div>
        <div class="pc-actions"><button type="button" class="btn btn-sm btn-play" data-cal="caler" title="Un modèle par ligne, validé sur des jours qu’il n’a pas appris">Caler</button>
          <button type="button" class="btn btn-sm" data-cal="exporter">Exporter la comparaison (Excel)</button></div></section>`;
    }
  }

  /** Les paramètres d'un modèle, en mots : « a = 0,8 », « b = 1,2 ; a = 0,9 », « 15,3 », « a = 0,8 ; lun. 1,1 … ». */
  const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  function parametresEnMots(m) {
    const p = m.parametres || {};
    if (m.modele === 'moteur') return 'réel = simulé';
    if (m.modele === 'constante') return nombre(p.c);
    return (p.b !== undefined ? 'b = ' + nombre(p.b) + ' ; ' : '') + 'a = ' + nombre(p.a, 3)
      + (p.jours ? ' ; ' + p.jours.map((x, i) => JOURS[i] + ' ' + nombre(x, 2)).join(', ') : '');
  }
  /** L'erreur de chaque découpage laissé de côté (une semaine, un mois), pour chaque modèle ; le retenu est marqué. */
  function rendreDecoupages(l) {
    const modeles = [l.references.moteur, l.references.constante, ...l.candidats];
    const parts = l.references.moteur.erreurs.parSemaine.map(x => ['semaine', x.semaine]).concat(l.references.moteur.erreurs.parMois.map(x => ['mois', x.mois]));
    const erreur = (m, [k, part]) => { const x = (k === 'semaine' ? m.erreurs.parSemaine : m.erreurs.parMois).find(y => y[k] === part); return x ? nombre(x.erreur) : '—'; };
    return `<div class="table-scroll"><table class="svc-table pc-table" data-cal-decoupages><caption>Erreur de chaque découpage, sur les jours laissés de côté (ETP)</caption>
      <thead><tr><th scope="col">Laissé de côté</th>${modeles.map(m => `<th scope="col">${esc(m.nom)}${m.modele === l.retenu.modele ? ' <small>retenu</small>' : ''}</th>`).join('')}</tr></thead>
      <tbody>${parts.map(pt => `<tr><th scope="row">${pt[0]} ${esc(pt[1])}</th>${modeles.map(m => `<td class="pv-n">${erreur(m, pt)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  VueCalage.prototype.rendreRapport = function () {
    const r = this.rapport; if (!r) return '';
    const plage = (x, k = 3) => (x && x.min !== null ? ' (' + nombre(x.min, k) + ' – ' + nombre(x.max, k) + ')' : '');
    const parametres = p => [p.b ? 'b : ' + nombre(p.b.tous) + plage(p.b, 2) : '', p.a ? 'a : ' + nombre(p.a.tous, 3) + plage(p.a) : '',
      p.c ? nombre(p.c.tous) + plage(p.c, 2) : '', p.jours ? p.jours.map((x, i) => JOURS[i] + ' ' + nombre(x.tous) + plage(x, 2)).join(', ') : ''].filter(Boolean).join(' ; ');
    const modele = (m, rang) => `<tr data-cal-modele="${esc(m.modele)}"><th scope="row">${esc(m.nom)} <small>${rang}</small></th>
        <td class="pv-n">${nombre(m.erreurs.semaines)}</td><td class="pv-n">${m.erreurs.mois === null ? '—' : nombre(m.erreurs.mois)}</td>
        <td>${esc(parametres(m.parametres))}</td>
        <td>${m.regles ? Object.values(m.regles).map(x => `<span class="pc-regle ${x.ok ? 'ok' : 'non'}">${esc(x.raison)}</span>`).join('') : ''}</td></tr>`;
    const confondus = l => (l.confondus || []).map(x => `<p class="mini-note" data-cal-confondu="${esc(x.modele)}">« ${esc(x.nom)} » ${esc(x.raison)}.</p>`).join('');
    const ligne = l => (!l.cale ? `<li data-cal-rapport="${esc(l.nom)}"><b>${esc(l.nom)}</b> — pas de calage : ${esc(l.raison)}.</li>`
      : `<li data-cal-rapport="${esc(l.nom)}"><details><summary><b>${esc(l.nom)}</b> — <span data-cal-retenu>${esc(l.retenu.nom)}</span> (${esc(parametresEnMots(l.retenu))}),
          σ ${nombre(l.retenu.sigma)} ETP, bande P10–P90 ± ${nombre(l.retenu.bande)} ; ${l.jours} jours, validation par ${esc(l.validation)}${l.unSeulMois ? ' (un seul mois)' : ''}${l.raison ? ' — ' + esc(l.raison) : ''}</summary>
          <div class="table-scroll"><table class="svc-table pc-table"><thead><tr><th scope="col">Modèle</th><th scope="col">Erreur par semaine (ETP)</th><th scope="col">Erreur par mois (ETP)</th>
            <th scope="col">Paramètres, sur tous les jours (min – max sur les découpages)</th><th scope="col">Règles</th></tr></thead>
          <tbody>${['moteur', 'constante'].map(n => modele(l.references[n], 'référence')).join('')}${l.candidats.map(c => modele(c, c.accepte ? 'accepté' : 'refusé')).join('')}</tbody></table></div>
          ${confondus(l)}${rendreDecoupages(l)}</details></li>`);
    const u = r.unite;
    return `<section class="pc-rapport" aria-label="Le calage"><h3>Le calage</h3>
      <p class="mini-note">Un modèle par ligne, retenu seulement s’il prédit mieux que le moteur et qu’une constante sur des jours qu’il n’a pas appris,
        stable, dans ses bornes, confirmé par Wilcoxon et par un placebo. Toute l’unité, le total de chaque jour hors échantillon :
        erreur <b data-cal-avant>${nombre(u.avant.mae)}</b> ETP avec le moteur, <b data-cal-apres>${nombre(u.apres.mae)}</b> ETP avec les modèles retenus
        (biais ${nombre(u.avant.biais)} puis ${nombre(u.apres.biais)}).</p>
      <ul class="pc-liste pc-lignes">${r.lignes.map(ligne).join('')}</ul>
      <div class="pc-actions"><button type="button" class="btn btn-sm btn-play" data-cal="garder">Garder comme politique d’effectif</button></div></section>`;
  };

  /**
   * La politique d'effectif : sa date, la période apprise, « à refaire » ; le
   * prévu calé de chaque jour de la période (`b`, le bilan à jour, ou null :
   * la période est à relancer) ; appliquer un × a au barème, l'annuler.
   */
  VueCalage.prototype.rendrePolitique = function (b, comp) {
    const p = this.politique; if (!p) return '';
    const refaire = this.a.signature && this.a.signature(this.correspondance) !== p.signature;
    const x = b ? this.prevuPeriode() : null, lignes = x ? x.lignes : [];
    const bande = j => nombre(j.prevu) + ' <small>[' + nombre(j.p10) + ' – ' + nombre(j.p90) + ']</small>';
    // « Appliquer au barème » : un × a de services ; refusé, le bouton dit pourquoi.
    const ligneDe = nom => this.correspondance.lignes.find(l => l.nom === nom) || {};
    const appliquer = p.lignes.filter(m => m.modele === 'x-a' && !m.applique && ligneDe(m.nom).services).map((m, k) => {
      const refus = this.refusAppliquer(m, ligneDe(m.nom));
      return `<div class="pc-appliquer"><button type="button" class="btn btn-sm" data-cal="appliquer" data-nom="${esc(m.nom)}"${refus ? ' disabled aria-describedby="pc-refus-' + k + '"' : ''}>Appliquer au barème : ${esc(m.nom)} × ${nombre(m.parametres.a, 3)}</button>
        ${refus ? `<small class="pc-refus-appliquer" id="pc-refus-${k}" data-cal-refus-appliquer="${esc(m.nom)}">Pas maintenant : ${esc(refus)}.</small>` : ''}</div>`;
    }).join('');
    const jours = !b ? '' : b.joursTravail.map((w, i) => `<tr data-cal-prevu="${w.date}"${w.complet ? '' : ' class="pv-incomplet"'}><th scope="row">${dateFr(w.date)}</th>
        ${lignes.map(l => `<td class="pv-n">${nombre(l.jours[i].simule)}</td><td class="pv-n">${bande(l.jours[i])}</td>`).join('')}
        <td class="pv-n" data-cal-prevu-total>${x ? bande(x.unite[i]) : '—'}</td></tr>`).join('');
    return `<section class="pc-politique" aria-label="La politique d’effectif"><h3>La politique d’effectif</h3>
      <p class="mini-note">Calage du ${esc((p.date || '').slice(0, 10))}${p.periode ? ', appris du ' + dateFr(p.periode.debut) + ' au ' + dateFr(p.periode.fin) : ''}.
        ${refaire ? '<b class="pj-relancer" data-cal-refaire>À refaire</b> : le barème, les équipes ou la correspondance ont changé depuis.' : ''}
        Le prévu calé : le modèle de chaque ligne appliqué au simulé du jour, entre crochets sa bande P10–P90 ; il vaut aussi pour un programme sans réel.</p>
      ${!b ? '<p class="mini-note pc-attente">Simulez la période (à jour) pour voir le prévu calé de chaque jour.</p>'
        : `<div class="table-scroll"><table class="svc-table pc-table pc-prevu"><thead><tr><th scope="col">Jour de travail</th>
        ${lignes.map(l => `<th scope="col">${esc(l.nom)}<br><small>simulé</small></th><th scope="col">${esc(l.nom)}<br><small>prévu calé (${esc(l.nomModele)}${l.applique ? ', a = 1 : appliqué au barème' : l.nonCalee ? ' : pas de calage' : ''})</small></th>`).join('')}
        <th scope="col">Toute l’unité<br><small>prévu calé</small></th></tr></thead><tbody>${jours}</tbody></table></div>`}
      ${appliquer ? `<div class="pc-actions">${appliquer}</div>` : ''}
      <div class="pc-actions"><button type="button" class="btn btn-sm" data-cal="oublier">Oublier la politique</button></div></section>`;
  };

  /**
   * Le rejeu à effectif imposé (évolution 11 f) : le planning importé, « Rejouer », « Caler le travail », leur
   * progression et « Annuler » ; la comparaison du rejeu au réel ; le rapport du calage du travail.
   */
  VueCalage.prototype.rendreRejeu = function () {
    if (!this.planning && !this.erreurPlanning) return '';
    const c = this.calcul, p = this.planning;
    const etat = this.erreurPlanning ? `<p class="pj-erreur" role="alert" data-cal-erreur-planning>${esc(this.erreurPlanning)}</p>` : '';
    if (!p) return `<section class="pc-rejeu" aria-label="Le rejeu à effectif imposé"><h3>Le rejeu à effectif imposé</h3>${etat}</section>`;
    // « Annuler » d'abord : le texte de la progression grandit, le bouton ne bouge pas.
    const enCours = c ? `<div class="pc-actions" data-cal-calcul="${c.type}"><button type="button" class="btn btn-sm" data-cal="annuler-calcul">Annuler</button>
        <progress data-cal-progression max="${c.p.total}" value="${c.p.fait}" aria-label="${c.type === 'rejeu' ? 'Le rejeu' : 'Le calage du travail'}"></progress>
        <span data-cal-progression-texte>${c.p.fait} / ${c.p.total} journées jouées</span></div>` : '';
    const rejeuAJour = this.rejeu && this.rejeu.cle === this.cleDuRejeu(), travailAJour = this.travail && this.travail.cle === this.cleDuTravail();
    return `<section class="pc-rejeu" aria-label="Le rejeu à effectif imposé"><h3>Le rejeu à effectif imposé</h3>
      <p class="mini-note">Le planning <b>${esc(this.fichierPlanning)}</b> : ${p.lignes} lignes, ${p.dates.length} jours de vols, du ${dateFr(p.dates[0])} au ${dateFr(p.dates[p.dates.length - 1])}.
        Un jour qui a des lignes se rejoue avec les équipes, les horaires et les personnes du planning (une équipe absente de son service ne travaille pas ;
        des heures sup jusqu’à 12 h) ; les heures supp, les nuits de plonge et les retards se comparent alors au réel, et le travail se cale.
        Le planning reste dans cette page, le temps de la page.</p>
      ${etat}
      <div class="pc-actions"><button type="button" class="btn btn-sm" data-cal="rejouer"${c ? ' disabled' : ''}>Rejouer la période avec le planning</button>
        <button type="button" class="btn btn-sm" data-cal="caler-travail"${c ? ' disabled' : ''}>Caler le travail</button></div>
      ${enCours}
      ${this.rejeu ? this.rendreComparaisonRejeu(rejeuAJour) : ''}
      ${this.travail ? this.rendreTravail(travailAJour) : ''}</section>`;
  };

  /** La comparaison du rejeu : par ligne, ses heures supp simulées et réelles jour par jour, ses lots en retard ; les nuits de plonge ouvertes. */
  VueCalage.prototype.rendreComparaisonRejeu = function (aJour) {
    const comp = this.comparaisonRejeu();
    const tete = `<h4>Le rejeu${aJour ? '' : ' <b class="pj-relancer" data-cal-rejeu-relancer>à relancer</b>'}</h4>`;
    if (!comp) return `<div class="pc-rejeu-comparaison" data-cal-rejeu>${tete}<p class="mini-note pc-attente">Importez le réel pour comparer le rejeu.</p></div>`;
    const ligne = l => `<li data-cal-rejeu-ligne="${esc(l.nom)}"><details><summary><b>${esc(l.nom)}</b> — heures supp : erreur <span data-cal-rejeu-mae>${nombre(l.rejeu.heuresSupp.mae)}</span> h par jour,
        biais ${nombre(l.rejeu.heuresSupp.biais)} h, sur ${l.rejeu.heuresSupp.jours} jours (${l.rejeu.joursAvecPlanning} rejoués avec leur planning sur ${l.jours.length})${l.rejeu.lotsEnRetard !== undefined ? ' ; ' + l.rejeu.lotsEnRetard + ' lots en retard' : ''}</summary>
        <div class="table-scroll"><table class="svc-table pc-table"><thead><tr><th scope="col">Jour de travail</th><th scope="col">Heures supp simulées (h)</th>
          <th scope="col">Heures supp réelles (h)</th>${l.services ? '<th scope="col">Lots en retard</th>' : ''}</tr></thead>
        <tbody>${l.jours.map(j => `<tr${j.planning ? '' : ' class="pv-incomplet" title="sans planning : joué comme d’ordinaire, non compté"'}><th scope="row">${dateFr(j.date)}${j.planning ? '' : ' <small>sans planning</small>'}</th><td class="pv-n">${nombre(j.heuresSuppSimulees)}</td><td class="pv-n">${nombre(j.heuresSuppReelles)}</td>
          ${l.services ? `<td class="pv-n">${j.lotsEnRetard}</td>` : ''}</tr>`).join('')}</tbody></table></div></details></li>`;
    const nuits = comp.unite.rejeu.jours.filter(w => w.nuitsOuvertes > 0);
    return `<div class="pc-rejeu-comparaison" data-cal-rejeu>${tete}
      <ul class="pc-liste pc-lignes">${comp.lignes.map(ligne).join('')}</ul>
      <p class="mini-note" data-cal-rejeu-nuits>Toute l’unité : ${nuits.length ? 'nuits de plonge ouvertes ' + nuits.map(w => dateFr(w.date) + (w.nuitsOuvertes > 1 ? ' (' + w.nuitsOuvertes + ')' : '')).join(', ') : 'aucune nuit de plonge ouverte'} ;
        ${comp.unite.rejeu.jours.reduce((n, w) => n + w.lotsEnRetard, 0)} lots en retard sur la période.</p></div>`;
  };

  /** « Appliquer au barème » un facteur de travail : refusé, le bouton dit pourquoi (comme la politique d'effectif). */
  VueCalage.prototype.boutonTravail = function (l) {
    const ligne = this.correspondance.lignes.find(x => x.nom === l.nom) || {};
    const refus = ligne.services ? this.refusAppliquer({ services: l.services, parametres: { a: l.facteur } }, ligne) : 'la ligne n’a plus de services';
    const id = 'pc-refus-travail-' + C().empreinte(l.nom);
    return `<div class="pc-appliquer"><button type="button" class="btn btn-sm" data-cal="appliquer-travail" data-nom="${esc(l.nom)}"${refus ? ' disabled aria-describedby="' + id + '"' : ''}>Appliquer au barème : ${esc(l.nom)} × ${nombre(l.facteur, 2)}</button>
      ${refus ? `<small class="pc-refus-appliquer" id="${id}">Pas maintenant : ${esc(refus)}.</small>` : ''}</div>`;
  };

  /** Le calage du travail : par ligne, le facteur, ses règles, l'erreur avant et après ; « Appliquer au barème » un facteur accepté. */
  VueCalage.prototype.rendreTravail = function (aJour) {
    const t = this.travail;
    const ligne = l => (!l.cale ? `<li data-cal-travail="${esc(l.nom)}"><b>${esc(l.nom)}</b> — pas de calage du travail : ${esc(l.raison)}.</li>`
      : `<li data-cal-travail="${esc(l.nom)}"><details><summary><b>${esc(l.nom)}</b> — travail <span data-cal-facteur>× ${nombre(l.facteur, 2)}</span>
          (${l.accepte ? 'accepté' : 'refusé'}) ; heures supp : erreur ${nombre(l.erreurMoteur)} h par jour avec le barème, ${nombre(l.erreur)} h avec le facteur ;
          ${l.jours} jours rejoués avec leur planning (sur ${l.joursCompares} comparés), validation par ${esc(l.validation)}${l.unSeulMois ? ' (un seul mois)' : ''}</summary>
          <p>${Object.values(l.regles).map(x => `<span class="pc-regle ${x.ok ? 'ok' : 'non'}">${esc(x.raison)}</span>`).join('')}</p>
          <p class="mini-note">Les facteurs essayés : ${l.essais.map(e => '× ' + nombre(e.k, 2) + ' : ' + nombre(e.erreur) + ' h').join(' · ')}.</p></details>
          ${l.accepte && !l.applique && aJour ? this.boutonTravail(l) : ''}
          ${l.applique ? '<small>appliqué au barème</small>' : ''}</li>`);
    return `<div class="pc-travail" data-cal-travail-rapport><h4>Le calage du travail${aJour ? '' : ' <b class="pj-relancer" data-cal-travail-refaire>à refaire</b>'}</h4>
      <p class="mini-note">Un facteur par ligne de services sur ses homme-minutes (barème, minutes propres des cases) : une grille de 0,5 à 2, puis ±4 % et ±8 %,
        qui fait déborder le rejeu comme le réel, jour par jour ; retenu seulement s’il bat le barème et une constante sur des jours qu’il n’a pas appris,
        stable, dans ses bornes, et confirmé par Wilcoxon.</p>
      <ul class="pc-liste pc-lignes">${t.lignes.map(ligne).join('')}</ul></div>`;
  };

  /**
   * Les facteurs appliqués au barème, avec ou sans politique : chacun s'annule
   * (le plus récent d'abord quand deux touchent un même service) ; une autre
   * ligne dont l'erreur a monté de plus de 0,3 ETP depuis se signale.
   */
  VueCalage.prototype.rendreApplications = function (comp) {
    if (!this.applications.length) return '';
    const l = this.applications.map((a, i) => `<li data-cal-application="${esc(a.ligne)}">${esc(a.ligne)} : travail × ${nombre(a.a, 3)} au barème${a.source === 'travail' ? ' (calage du travail)' : ''} (${esc((a.date || '').slice(0, 10))})
        ${C().annulable(this.applications, i) ? `<button type="button" class="btn btn-sm" data-cal="annuler-application" data-i="${i}">Annuler</button>`
          : '<small>annulez d’abord le facteur plus récent sur un même service</small>'}</li>`).join('');
    const degradees = comp ? this.applications.flatMap(a => C().lignesDegradees(a, comp).map(d => ({ ...d, par: a.ligne }))) : [];
    return `<section class="pc-applications" aria-label="Les facteurs appliqués au barème"><h3>Les facteurs appliqués au barème</h3>
      ${degradees.map(d => `<p class="pj-erreur" role="alert" data-cal-degradee>${esc(d.nom)} : erreur passée de ${nombre(d.avant)} à ${nombre(d.apres)} ETP depuis le facteur appliqué à ${esc(d.par)}.</p>`).join('')}
      <ul class="pc-liste">${l}</ul></section>`;
  };

  /** Dans la Synthèse de la journée : le prévu calé de chaque ligne, sa bande, le total de l'unité. */
  VueCalage.prototype.rendreJour = function () {
    const box = document.getElementById('bilan-cale'); if (!box) return;
    const j = this.politique && this.a.journee ? this.a.journee() : null;
    if (!j) { box.innerHTML = ''; return; }
    const x = C().prevuDesJours(this.politique, this.correspondance, [j], R().simuleDe);
    if (!x || !x.lignes.length) { box.innerHTML = ''; return; }
    const ligne = (nom, s, v) => `<tr data-cal-jour-ligne="${esc(nom)}"><th scope="row">${esc(nom)}</th><td class="pv-n">${nombre(s)}</td><td class="pv-n">${nombre(v.prevu)}</td>
        <td class="pv-n">${nombre(v.p10)} – ${nombre(v.p90)}</td></tr>`;
    box.innerHTML = `<section class="bilan-groupe pc-jour" aria-label="Politique d’effectif"><h4>Politique d’effectif (calage du ${esc((this.politique.date || '').slice(0, 10))})</h4>
      <table class="svc-table pc-table"><thead><tr><th scope="col">Ligne</th><th scope="col">Simulé (ETP)</th><th scope="col">Prévu calé</th><th scope="col">P10 – P90</th></tr></thead>
      <tbody>${x.lignes.map(l => ligne(l.nom, l.jours[0].simule, l.jours[0])).join('')}${ligne('Toute l’unité', x.unite[0].simule, x.unite[0])}</tbody></table>
      ${x.lignes.some(l => l.jours[0].sansJour) ? '<p class="mini-note">Une journée sans date : « × a × jour » y prend le facteur moyen, 1.</p>' : ''}</section>`;
  };

  const api = { VueCalage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalageVue = api;
})(typeof window !== 'undefined' ? window : globalThis);
