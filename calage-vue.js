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
     * } */
    constructor(a) {
      this.a = a; this.lu = null; this.fichier = null; this.erreur = null; this.erreurCorrespondance = null; this.rapport = null;
      const r = this.relire();
      this.correspondance = r.correspondance; this.decisions = r.decisions;
      this.box = null;
    }
    /** Les réglages gardés, relus ; vides s'ils sont illisibles. */
    relire() {
      try { return R().validerReglages(this.a.reglages ? this.a.reglages() : null); }
      catch (e) { return R().validerReglages(null); }
    }
    enregistrer() {
      if (this.a.enregistrer) this.a.enregistrer({ correspondance: this.correspondance, decisions: this.decisions });
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
      const octets = T().ecrireClasseur(root.OrlyEchangesCalage.calageVersClasseur({ comparaison: c, reel: this.controle(), rapport: this.rapport },
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
          <span class="pc-etat" role="status">${this.erreur ? '<span class="pj-erreur">' + esc(this.erreur) + '</span>'
            : this.lu ? esc(this.fichier) + ' : ' + this.lu.lignes.length + ' lignes, ' + ctrl.roles.length + ' rôles, ' + ctrl.jours.length + ' jours.' : 'Aucun réel importé.'}</span>
        </div>
        ${this.rendreCorrespondance(ctrl)}
        ${ctrl ? this.rendreAnomalies(ctrl) : ''}
        ${!this.lu ? '' : !b ? '<p class="mini-note pc-attente">Simulez la période (à jour) pour comparer.</p>'
          : !this.correspondance.lignes.length ? '<p class="mini-note pc-attente">Ajoutez une ligne à la correspondance pour comparer.</p>'
          : comp ? this.rendreComparaison(comp) + this.rendreRapport() : this.erreurComparaison ? `<p class="pj-erreur" role="alert">Comparaison impossible — ${esc(this.erreurComparaison)}</p>` : ''}
      </div>`;
      VueCalage.rendreFocus(box, focus);
    }

    /** Le geste qui a le focus, pour le retrouver après le rendu. */
    static cleDuFocus(box) {
      const a = document.activeElement;
      if (!a || !box.contains(a) || a === box) return null;
      if (a.id) return '#' + a.id;
      const attrs = ['data-cal', 'data-cal-champ', 'data-ligne', 'data-role', 'data-cle', 'data-date', 'data-mois'].filter(k => a.hasAttribute(k));
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
      <ul class="pc-liste pc-lignes">${r.lignes.map(ligne).join('')}</ul></section>`;
  };

  const api = { VueCalage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalageVue = api;
})(typeof window !== 'undefined' ? window : globalThis);
