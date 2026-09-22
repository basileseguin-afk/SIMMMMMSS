/* ==========================================================================
 *  ATELIERS DE TRAVAIL — saisie et planning
 *  ------------------------------------------------------------------------
 *  Interface du modèle décrit dans docs/MODELE_ATELIERS.md. Ne calcule rien :
 *  tout le calcul est dans moteur/production.js. Ce fichier saisit, affiche,
 *  et enregistre.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const P = root.MoteurProduction;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const uid = () => 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const clone = x => JSON.parse(JSON.stringify(x));

  const CLE = 'ory-ateliers-v1';

  /* ----------------------------------------------------------------------
   *  Validation du fichier enregistré. Refuse en bloc plutôt que de charger
   *  à moitié : une saisie perdue est pire qu'une saisie refusée.
   * --------------------------------------------------------------------*/
  function valider(brut) {
    if (!brut || brut.schema !== 'ory-ateliers' || brut.version !== 1 || !Array.isArray(brut.ateliers))
      throw new Error('Fichier d’ateliers v1 attendu.');
    if (brut.ateliers.length > 500) throw new Error('Maximum 500 ateliers.');
    const ids = new Set();
    const ateliers = brut.ateliers.map(a => {
      if (!a || typeof a !== 'object') throw new Error('Atelier invalide.');
      const id = typeof a.id === 'string' && a.id ? a.id : uid();
      if (ids.has(id)) throw new Error('Identifiant d’atelier en double.');
      ids.add(id);
      const nom = String(a.nom ?? '').slice(0, 160);
      const service = String(a.service ?? '').slice(0, 160);
      const type = ['robot', 'lavage'].includes(a.type) ? a.type : 'manuel';
      P.minutes(a.debut ?? '06:00');
      const jour = Number.isInteger(a.jour) ? Math.max(-7, Math.min(0, a.jour)) : 0;
      const personnes = Number.isInteger(a.personnes) ? Math.max(0, Math.min(999, a.personnes)) : 1;
      const pauses = (Array.isArray(a.pauses) ? a.pauses : []).slice(0, 12).map(p => {
        P.minutes(p.de); P.minutes(p.a); return { de: String(p.de), a: String(p.a) };
      });
      const lots = (Array.isArray(a.lots) ? a.lots : []).slice(0, 200)
        .map(l => (Array.isArray(l) ? l : l && l.classes) || [])
        .map(l => [...new Set(l.map(String))].slice(0, 200));
      return {
        id, nom, service, type, debut: String(a.debut ?? '06:00'), jour, personnes, pauses, lots,
        // Un poste : pauses automatiques et durée de présence. Désactivable
        // pour une équipe qui ne suit pas la règle commune.
        regime: { actif: a.regime ? a.regime.actif !== false : true,
                  presence: Number.isFinite(+(a.regime || {}).presence) ? +a.regime.presence : 495 },
        ...(a.materiel === 'consomme' ? { materiel: 'consomme' } : {}),
        ...(type === 'robot' ? {
          debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 320,
          personnesMin: Number.isInteger(a.personnesMin) ? Math.max(0, a.personnesMin) : 1
        } : {}),
        ...(type === 'lavage' ? { debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 600 } : {})
      };
    });
    // Ce que l'utilisateur retire du programme, et ce qu'il y ajoute. Le
    // programme de vols reste la source ; ces deux listes le corrigent.
    const exclues = [...new Set((Array.isArray(brut.exclues) ? brut.exclues : []).map(String))].slice(0, 500);
    const ajoutees = (Array.isArray(brut.ajoutees) ? brut.ajoutees : []).slice(0, 500).map(c => {
      const cie = String(c.cie ?? '').trim().toUpperCase().slice(0, 40);
      const cabine = P.CABINES.includes(c.cabine) ? c.cabine : 'YC';
      if (!cie) throw new Error('Une compagnie × classe ajoutée doit nommer sa compagnie.');
      const pax = Number.isFinite(+c.pax) ? Math.max(0, Math.round(+c.pax)) : 0;
      const vols = Number.isInteger(c.vols) ? Math.max(1, Math.min(999, c.vols)) : 1;
      P.minutes(c.echeance ?? '12:00');
      return { cie, cabine, pax, vols, echeance: String(c.echeance ?? '12:00') };
    });
    const m = brut.materiel || {};
    const materiel = {
      actif: m.actif === true,
      parPax: Number.isFinite(+m.parPax) ? Math.max(0, +m.parPax) : 1,
      stockInitial: Number.isFinite(+m.stockInitial) ? Math.max(0, Math.round(+m.stockInitial)) : 0,
      delaiRetour: Number.isFinite(+m.delaiRetour) ? Math.max(0, Math.round(+m.delaiRetour)) : 30
    };
    return { schema: 'ory-ateliers', version: 1, ateliers, exclues, ajoutees, materiel };
  }

  const vide = () => ({ schema: 'ory-ateliers', version: 1, ateliers: [], exclues: [], ajoutees: [],
    materiel: { actif: false, parPax: 1, stockInitial: 0, delaiRetour: 30 } });

  /* ======================================================================
   *  Le panneau
   * ====================================================================*/

  class CentreAteliers {
    /**
     * @param {object} a adaptateur
     *   hote()      — élément où vivre
     *   services()  — [{id, nom}] où l'on peut poser un atelier
     *   classes()   — compagnies × classes du programme courant
     *   liaisons()  — [{from,to}] entre services
     *   reglages()  — {rendement, delaiChargement, bareme}
     *   notify(msg) — message passager
     */
    constructor(a) {
      this.a = a;
      this.state = vide();
      this.ouvert = null;         // atelier en cours d'édition
      this.resultat = null;
      this.undo = []; this.redo = [];
      let alerte = '';
      try { const brut = localStorage.getItem(CLE); if (brut) this.state = valider(JSON.parse(brut)); }
      catch (e) { alerte = 'Ateliers enregistrés non chargés : ' + e.message + ' La copie reste en place.'; }
      this.construire();
      this.lier();
      this.rendre(alerte);
    }

    /* ---- données ----------------------------------------------------- */

    /* Le programme de vols reste la source. L'utilisateur en retire ce qu'il ne
     * fabrique pas et y ajoute ce que le programme ne porte pas encore : une
     * compagnie à venir, une prestation hors vol. Un ajout qui porte le même
     * identifiant qu'une classe du programme la remplace — c'est la façon de
     * corriger un volume sans toucher au fichier de vols. */
    get classes() {
      const exclues = new Set(this.state.exclues || []);
      const par = new Map();
      for (const c of (this.a.classes() || [])) {
        if (exclues.has(c.id)) continue;
        par.set(c.id, { ...c, origine: 'programme' });
      }
      for (const c of (this.state.ajoutees || [])) {
        const id = P.idClasse(c.cie, c.cabine);
        if (exclues.has(id)) continue;
        const echeance = P.minutes(c.echeance);
        par.set(id, {
          id, cie: c.cie, cabine: c.cabine, pax: c.pax, echeance, origine: 'ajoutee',
          vols: Array.from({ length: c.vols }, (_, i) => ({
            id: id + '-' + (i + 1), pax: Math.round(c.pax / c.vols), depart: echeance, echeance
          }))
        });
      }
      return [...par.values()].sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
    }

    /* Les classes du programme que l'utilisateur a retirées, pour pouvoir les
     * rétablir : un retrait qu'on ne peut pas défaire est un piège. */
    get retirees() {
      const exclues = new Set(this.state.exclues || []);
      return (this.a.classes() || []).filter(c => exclues.has(c.id));
    }

    calculer() {
      const r = this.a.reglages ? this.a.reglages() : {};
      try {
        this.resultat = P.simuler({
          vols: this.a.vols(), classes: this.classes,
          ateliers: this.state.ateliers, liaisons: this.a.liaisons(), materiel: this.state.materiel,
          bareme: r.bareme, rendement: r.rendement, delaiChargement: r.delaiChargement
        });
      } catch (e) {
        this.resultat = { ok: false, anomalies: [{ code: 'moteur', message: e.message }], lots: [], ateliers: [], classes: [], parClasse: {} };
      }
      return this.resultat;
    }

    changer(fn, message) {
      const avant = clone(this.state);
      try { fn(); this.state = valider(this.state); }
      catch (e) { this.state = avant; this.rendre('Refusé : ' + e.message); return false; }
      if (JSON.stringify(avant) !== JSON.stringify(this.state)) {
        this.undo.push(avant); if (this.undo.length > 80) this.undo.shift(); this.redo = [];
      }
      this.enregistrer(); this.rendre(message); return true;
    }

    enregistrer() {
      try { localStorage.setItem(CLE, JSON.stringify(this.state)); }
      catch { this.a.notify('Enregistrement impossible : exportez vos ateliers.'); }
    }

    histoire(refaire) {
      const de = refaire ? this.redo : this.undo, vers = refaire ? this.undo : this.redo;
      if (!de.length) return;
      vers.push(clone(this.state)); this.state = de.pop(); this.ouvert = null;
      this.enregistrer(); this.rendre(refaire ? 'Action rétablie.' : 'Action annulée.');
    }

    /* ---- structure --------------------------------------------------- */

    construire() {
      this.a.hote().innerHTML = `
<div class="at-tete">
  <p class="scope-badge">Barème non calibré · les durées ne dimensionnent pas une équipe</p>
  <div class="at-actions">
    <button class="btn btn-sm" id="at-undo">↶</button>
    <button class="btn btn-sm" id="at-redo">↷</button>
    <button class="btn btn-sm" id="at-export">Exporter</button>
    <button class="btn btn-sm" id="at-import-btn">Importer</button>
    <input id="at-import" type="file" accept=".json" hidden>
  </div>
</div>
<div id="at-indicateurs" class="at-indicateurs"></div>
<p id="at-status" role="status" aria-live="polite"></p>
<div id="at-anomalies" class="at-anomalies" hidden></div>
<div class="at-barre">
  <label>Service <select id="at-filtre"><option value="">Tous</option></select></label>
  <span class="at-barre-fin"></span>
  <button class="btn btn-play" id="at-new">+ Nouvel atelier</button>
</div>
<div id="at-materiel" class="at-materiel"></div>
<div id="at-liste"></div>
<h3 class="at-titre">Planning</h3>
<div id="at-planning" class="at-planning"></div>
<h3 class="at-titre">Compagnies × classes</h3>
<div id="at-classes"></div>`;
    }

    lier() {
      const hote = this.a.hote();
      const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      on('at-undo', 'click', () => this.histoire(false));
      on('at-redo', 'click', () => this.histoire(true));
      on('at-new', 'click', () => this.creer());
      on('at-filtre', 'change', e => { this.filtre = e.target.value; this.rendre(); });
      on('at-export', 'click', () => this.exporter());
      on('at-import-btn', 'click', () => document.getElementById('at-import').click());
      on('at-import', 'change', e => this.importer(e));

      // Un seul écouteur pour toute la liste : les cartes sont redessinées à
      // chaque changement, des écouteurs par carte fuiraient.
      hote.addEventListener('click', e => {
        const b = e.target.closest('[data-at-action]'); if (!b) return;
        const id = b.closest('[data-at]')?.dataset.at;
        this.action(b.dataset.atAction, id, b.dataset);
      });
      hote.addEventListener('change', e => {
        const champ = e.target.dataset.atChamp; if (!champ) return;
        const id = e.target.closest('[data-at]')?.dataset.at;
        this.saisir(champ, id, e.target);
      });
    }

    /* ---- actions ----------------------------------------------------- */

    creer() {
      // Un service absent du barème donnerait une durée nulle : on propose
      // d'emblée un service qui sait travailler.
      const services = this.a.services();
      const connu = services.find(s => P.BAREME_DEMO[s.id]);
      const service = this.filtre || (connu || services[0] || {}).id;
      const n = this.state.ateliers.filter(a => a.service === service).length + 1;
      const atelier = { id: uid(), nom: 'Atelier ' + n, service, type: 'manuel',
        debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [] };
      this.changer(() => this.state.ateliers.push(atelier), 'Atelier créé. Ajoutez-lui un lot.');
      this.ouvert = atelier.id; this.rendre();
    }

    action(quoi, id, data) {
      const a = this.state.ateliers.find(x => x.id === id);
      switch (quoi) {
        case 'ouvrir': this.ouvert = this.ouvert === id ? null : id; return this.rendre();
        case 'supprimer':
          if (!confirm('Supprimer « ' + a.nom + ' » ?')) return;
          return this.changer(() => { this.state.ateliers = this.state.ateliers.filter(x => x.id !== id); }, 'Atelier supprimé.');
        case 'dupliquer':
          return this.changer(() => {
            const c = clone(a); c.id = uid(); c.nom = (a.nom + ' (2)').slice(0, 160);
            this.state.ateliers.splice(this.state.ateliers.indexOf(a) + 1, 0, c);
          }, 'Atelier dupliqué.');
        case 'lot-ajouter':
          return this.changer(() => a.lots.push([]), 'Lot ajouté : choisissez ses compagnies × classes.');
        case 'lot-retirer':
          return this.changer(() => a.lots.splice(+data.index, 1), 'Lot retiré.');
        case 'lot-monter':
          return this.changer(() => { const i = +data.index; if (i > 0) a.lots.splice(i - 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'lot-descendre':
          return this.changer(() => { const i = +data.index; if (i < a.lots.length - 1) a.lots.splice(i + 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'classe-retirer':
          return this.changer(() => { a.lots[+data.index] = a.lots[+data.index].filter(c => c !== data.classe); }, 'Classe retirée.');
        case 'lot-tout':
          return this.changer(() => { a.lots = [this.classes.map(c => c.id)]; },
            'Toutes les classes dans un seul lot : elles sortiront ensemble.');
        case 'lot-separer':
          return this.changer(() => { a.lots = this.classes.map(c => [c.id]); },
            'Une classe par lot, dans l’ordre des échéances.');
        case 'pause-ajouter':
          return this.changer(() => a.pauses.push({ de: '12:00', a: '12:45' }), 'Pause ajoutée.');
        case 'pause-retirer':
          return this.changer(() => a.pauses.splice(+data.index, 1), 'Pause retirée.');
        case 'classe-supprimer': return this.supprimerClasse(data.classe);
        case 'classe-retablir':  return this.retablirClasse(data.classe);
        case 'classe-nouvelle':  return this.ouvrirAjout();
        case 'classe-annuler':   { this.ajout = null; return this.rendre(''); }
        case 'classe-valider':   return this.validerAjout();
      }
    }

    /* Un champ qui déclenche `change` est encore en train de perdre le focus :
     * remplacer tout de suite le HTML qui le contient fait échouer le rendu.
     * On laisse le navigateur finir, puis on redessine. */
    saisir(champ, id, el) {
      // Les réglages du matériel ne vivent pas dans une carte d'atelier : les
      // chercher par identifiant d'atelier les ferait disparaître en silence.
      if (champ.startsWith('mat-')) {
        const v = el.type === 'checkbox' ? el.checked : el.value;
        setTimeout(() => this.appliquerMateriel(champ, v), 0);
        return;
      }
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return;
      const v = el.value;
      setTimeout(() => this.appliquerSaisie(champ, a, el, v), 0);
    }

    appliquerMateriel(champ, v) {
      this.changer(() => {
        const m = this.state.materiel;
        if (champ === 'mat-actif') m.actif = !!v;
        if (champ === 'mat-parpax') m.parPax = Math.max(0, parseFloat(v) || 0);
        if (champ === 'mat-stock') m.stockInitial = Math.max(0, parseInt(v, 10) || 0);
        if (champ === 'mat-delai') m.delaiRetour = Math.max(0, parseInt(v, 10) || 0);
      }, champ === 'mat-actif'
        ? (v ? 'Le compte du matériel est tenu : déclarez la plonge et les ateliers qui en emportent.'
             : 'Compte du matériel abandonné.')
        : 'Enregistré.');
    }

    appliquerSaisie(champ, a, el, v) {
      this.changer(() => {
        switch (champ) {
          case 'nom': a.nom = v; break;
          case 'service': a.service = v; break;
          case 'debut': a.debut = v; break;
          case 'jour': a.jour = parseInt(v, 10) || 0; break;
          case 'personnes': a.personnes = Math.max(0, parseInt(v, 10) || 0); break;
          case 'debit': a.debit = Math.max(1, parseFloat(v) || 1); break;
          case 'personnesMin': a.personnesMin = Math.max(0, parseInt(v, 10) || 0); break;
          case 'type':
            a.type = v;
            if (v === 'robot') { a.debit = a.debit || 320; a.personnesMin = a.personnesMin === undefined ? 1 : a.personnesMin; }
            else if (v === 'lavage') { a.debit = a.debit || 600; delete a.personnesMin; a.lots = []; }
            else { delete a.debit; delete a.personnesMin; }
            break;
          case 'consomme': a.materiel = el.checked ? 'consomme' : undefined; break;
          case 'regime': a.regime = { ...a.regime, actif: el.checked }; break;
          case 'presence': a.regime = { ...a.regime, presence: Math.max(30, parseInt(v, 10) || 495) }; break;

          case 'lot-ajout': {
            const i = +el.dataset.index;
            if (v && !a.lots[i].includes(v)) a.lots[i].push(v);
            break;
          }
          case 'pause-de': a.pauses[+el.dataset.index].de = v; break;
          case 'pause-a':  a.pauses[+el.dataset.index].a = v; break;
        }
      }, 'Enregistré.');
    }

    /* Retirer une compagnie × classe, c'est aussi couper tous les liens que les
     * ateliers avaient avec elle : sinon ils désigneraient un identifiant qui
     * n'existe plus, et le modèle refuserait de tourner. Un lot vidé de sa
     * dernière classe disparaît avec elle. */
    supprimerClasse(id) {
      const ajoutee = (this.state.ajoutees || []).some(c => P.idClasse(c.cie, c.cabine) === id);
      // Le message se construit AVANT le changement : les arguments d'un appel
      // sont évalués d'abord, compter pendant la modification ne dirait rien.
      const touches = this.state.ateliers.filter(a => a.lots.some(l => l.includes(id)));
      const lots = touches.reduce((n, a) => n + a.lots.filter(l => l.includes(id)).length, 0);
      const vides = touches.reduce((n, a) => n + a.lots.filter(l => l.length === 1 && l[0] === id).length, 0);
      const message = lots
        ? id + ' retirée — ' + lots + ' lot(s) dans ' + touches.map(a => a.nom).join(', ')
            + (vides ? ', dont ' + vides + ' vidé(s) et supprimé(s)' : '') + '.'
        : id + ' retirée : aucun atelier ne la fabriquait.';
      this.changer(() => {
        for (const a of this.state.ateliers) {
          const restants = [];
          for (const l of a.lots) {
            if (!l.includes(id)) { restants.push(l); continue; }
            const reste = l.filter(c => c !== id);
            // Un lot vidé de sa dernière classe disparaît avec elle. Un lot
            // resté vide parce qu'on vient de le créer, lui, est conservé.
            if (reste.length) restants.push(reste);
          }
          a.lots = restants;
        }
        if (ajoutee) this.state.ajoutees = this.state.ajoutees.filter(c => P.idClasse(c.cie, c.cabine) !== id);
        else this.state.exclues = [...new Set([...(this.state.exclues || []), id])];
      }, message);
    }

    retablirClasse(id) {
      this.changer(() => { this.state.exclues = (this.state.exclues || []).filter(x => x !== id); },
        id + ' rétablie. Elle est à fabriquer de nouveau.');
    }

    ouvrirAjout() { this.ajout = { cie: '', cabine: 'YC', pax: 100, vols: 1, echeance: '12:00' }; this.rendre(''); }

    validerAjout() {
      const lire = id => (document.getElementById(id) || {}).value;
      const brouillon = {
        cie: lire('at-cls-cie'), cabine: lire('at-cls-cabine'),
        pax: +lire('at-cls-pax'), vols: parseInt(lire('at-cls-vols'), 10),
        echeance: lire('at-cls-echeance')
      };
      if (!String(brouillon.cie || '').trim()) return this.rendre('Nommez la compagnie.');
      const id = P.idClasse(brouillon.cie, brouillon.cabine);
      if (this.classes.some(c => c.id === id && c.origine === 'ajoutee'))
        return this.rendre(id + ' est déjà ajoutée. Retirez-la d’abord pour la redéfinir.');
      const remplace = this.classes.some(c => c.id === id && c.origine === 'programme');
      this.ajout = null;
      this.changer(() => {
        this.state.exclues = (this.state.exclues || []).filter(x => x !== id);
        this.state.ajoutees = [...(this.state.ajoutees || []), brouillon];
      }, id + (remplace
        ? ' ajoutée : elle remplace celle du programme de vols.'
        : ' ajoutée. Elle est fabricable comme les autres.'));
    }

    exporter() {
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ory-ateliers-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    async importer(e) {
      try {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 4 * 1024 * 1024) throw new Error('Fichier trop grand.');
        const etat = valider(JSON.parse(await f.text()));
        if (!confirm('Remplacer les ateliers enregistrés ? L’action est annulable.')) return;
        this.changer(() => { this.state = etat; }, 'Ateliers importés.');
      } catch (err) { this.rendre('Import refusé : ' + err.message); }
      finally { e.target.value = ''; }
    }

    /* ---- rendu ------------------------------------------------------- */

    rendre(message) {
      if (message !== undefined) document.getElementById('at-status').textContent = message || '';
      const r = this.calculer();
      this.rendreIndicateurs(r);
      this.rendreAnomalies(r);
      this.rendreFiltre();
      this.rendreMateriel(r);
      this.rendreListe(r);
      this.rendrePlanning(r);
      this.rendreClasses(r);
      document.getElementById('at-undo').disabled = !this.undo.length;
      document.getElementById('at-redo').disabled = !this.redo.length;
      if (this.a.change) this.a.change(r);
    }

    rendreIndicateurs(r) {
      const i = r.indicateurs || {};
      const tuile = (lab, val, note) =>
        `<div class="at-kpi"><div class="lab">${esc(lab)}</div><div class="val">${esc(val)}</div><div class="note">${esc(note || '')}</div></div>`;
      document.getElementById('at-indicateurs').innerHTML = !r.ok ? '' : [
        tuile('Classes à l’heure', i.partAHeure == null ? '—' : i.partAHeure + ' %',
          i.aHeure + ' / ' + i.classesSuivies + ' fabriquées'),
        tuile('Retard maximum', i.retardMax == null ? '—' : Math.round(i.retardMax) + ' min',
          i.retardMoyen == null ? '' : 'moyenne ' + Math.round(i.retardMoyen) + ' min'),
        tuile('Dernière sortie', P.hhmm(i.finDerniere), 'fin du dernier lot'),
        tuile('Jamais fabriquées', String(i.classesAbsentes),
          i.classesAbsentes ? 'classes du programme sans atelier' : 'tout le programme est couvert')
      ].join('');
    }

    rendreAnomalies(r) {
      const box = document.getElementById('at-anomalies');
      const list = r.anomalies || [];
      box.hidden = !list.length;
      box.innerHTML = list.length
        ? '<strong>' + list.length + ' point(s) à corriger</strong><ul>' +
          list.map(a => '<li>' + esc(a.message) + '</li>').join('') + '</ul>'
        : '';
    }

    rendreFiltre() {
      const sel = document.getElementById('at-filtre'), garde = sel.value;
      sel.innerHTML = '<option value="">Tous les services</option>' +
        this.a.services().map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('');
      sel.value = garde;
    }

    /* Les trolleys et la porcelaine ne s'achètent pas : ils reviennent. Ce bloc
     * dit ce que la boucle a fait de la journée. */
    rendreMateriel(r) {
      const m = this.state.materiel, bilan = r && r.materiel;
      const chiffre = (lab, val, note) =>
        `<div class="at-mat-chiffre"><span>${esc(lab)}</span><b>${esc(String(val))}</b>${note ? '<em>' + esc(note) + '</em>' : ''}</div>`;
      // La case qui active le compte ne doit pas être enfermée dans le bloc
      // qu'elle ouvre : elle reste visible, le reste suit.
      document.getElementById('at-materiel').innerHTML = `
<section class="at-mat">
  <label class="chk chk-mini at-mat-tete"><input type="checkbox" data-at-champ="mat-actif" ${m.actif ? 'checked' : ''}>
    <span><strong>Matériel en boucle</strong> — ce qui part revient : un départ l'emporte, un retour
    le ramène sale, la plonge le rend propre. Un seul compte, non calibré.</span></label>
  ${m.actif ? `<div class="at-mat-champs">
    <label>Unités par passager<input type="number" min="0" step="0.1" value="${m.parPax}" data-at-champ="mat-parpax"></label>
    <label>Propre à l'ouverture<input type="number" min="0" value="${m.stockInitial}" data-at-champ="mat-stock"></label>
    <label>Délai après atterrissage (min)<input type="number" min="0" value="${m.delaiRetour}" data-at-champ="mat-delai"></label>
  </div>` : ''}
  ${m.actif && bilan ? `<div class="at-mat-bilan">
    ${chiffre('Revenu des vols', bilan.entrees + ' u')}
    ${chiffre('Lavé', bilan.lavees + ' u', bilan.resteSale ? bilan.resteSale + ' u sales non lavées' : '')}
    ${chiffre('Emporté', bilan.consommees + ' u')}
    ${chiffre('Reste propre', bilan.restePropre + ' u', bilan.restePropre ? 'disponible demain' : 'aucun amortisseur')}
    ${chiffre('Plus bas niveau', bilan.minPropre + ' u', bilan.minPropre === 0 ? 'passé par zéro' : '')}
    ${chiffre('Attente de matériel', Math.round(bilan.attente) + ' min', bilan.enAttente ? bilan.enAttente + ' lot(s) jamais servis' : '')}
  </div>` : ''}
</section>`;
    }

    rendreListe(r) {
      const services = this.a.services();
      const nom = id => (services.find(s => s.id === id) || {}).nom || id;
      const parAtelier = new Map((r.ateliers || []).map(a => [a.id, a]));
      const montrer = this.filtre ? this.state.ateliers.filter(a => a.service === this.filtre) : this.state.ateliers;

      if (!montrer.length) {
        document.getElementById('at-liste').innerHTML =
          '<p class="at-vide">Aucun atelier. Un atelier, c’est une équipe : ce qu’elle fait, quand elle commence, et à combien.</p>';
        return;
      }
      const groupes = {};
      for (const a of montrer) (groupes[a.service] || (groupes[a.service] = [])).push(a);

      document.getElementById('at-liste').innerHTML = Object.keys(groupes).map(service => {
        const cartes = groupes[service].map(a => this.carte(a, parAtelier.get(a.id))).join('');
        return `<section class="at-service"><h3>${esc(nom(service))} <span>${groupes[service].length}</span></h3>${cartes}</section>`;
      }).join('');
    }

    carte(a, calcul) {
      const ouvert = this.ouvert === a.id;
      const fin = calcul && calcul.fin != null ? P.hhmm(calcul.fin) : '—';
      const attente = calcul && calcul.attente ? ' · ' + Math.round(calcul.attente) + ' min d’attente' : '';
      const jour = a.jour ? ' (J' + a.jour + ')' : '';
      const noms = a.lots.map(l => l.join(' + '));
      const resume = !noms.length ? 'aucun lot'
        : noms.length <= 3 ? noms.join(' → ')
        : noms.slice(0, 3).join(' → ') + ' → … (' + noms.length + ' lots)';

      const entete = `<div class="at-carte-tete">
        <button class="at-carte-nom" data-at-action="ouvrir" aria-expanded="${ouvert}">
          <strong>${esc(a.nom)}</strong>
          <span>${esc(a.debut)}${jour} · ${a.personnes} pers.${a.type === 'robot' ? ' · robot ' + a.debit + ' pl/h' : ''} → fin ${esc(fin)}${esc(attente)}</span>
        </button>
        <span class="at-resume">${esc(resume)}</span>
      </div>`;

      if (!ouvert) return `<article class="at-carte" data-at="${esc(a.id)}">${entete}</article>`;

      const services = this.a.services();
      const restantes = i => this.classes.filter(c => !a.lots[i].includes(c.id));

      const lots = a.lots.map((l, i) => `
        <div class="at-lot">
          <div class="at-lot-tete">
            <b>Lot ${i + 1}</b>
            <span class="at-lot-fin">${esc(this.finLot(a.id, i))}</span>
            <button class="btn btn-sm" data-at-action="lot-monter" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
            <button class="btn btn-sm" data-at-action="lot-descendre" data-index="${i}" ${i === a.lots.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
            <button class="btn btn-sm" data-at-action="lot-retirer" data-index="${i}">Retirer</button>
          </div>
          <div class="at-chips">${l.map(c => `<button class="at-chip" data-at-action="classe-retirer" data-index="${i}" data-classe="${esc(c)}">${esc(c)} ×</button>`).join('') || '<em>vide</em>'}</div>
          <select data-at-champ="lot-ajout" data-index="${i}" aria-label="Ajouter une compagnie × classe au lot ${i + 1}">
            <option value="">Ajouter une compagnie × classe…</option>
            ${restantes(i).map(c => `<option value="${esc(c.id)}">${esc(c.id)} · ${c.pax} pax · ${c.vols.length} vol(s)</option>`).join('')}
          </select>
        </div>`).join('');

      const pauses = a.pauses.map((p, i) => `
        <div class="at-pause">
          <input type="time" value="${esc(p.de)}" data-at-champ="pause-de" data-index="${i}" aria-label="Début de pause">
          <input type="time" value="${esc(p.a)}" data-at-champ="pause-a" data-index="${i}" aria-label="Fin de pause">
          <button class="btn btn-sm" data-at-action="pause-retirer" data-index="${i}">Retirer</button>
        </div>`).join('');

      return `<article class="at-carte ouverte" data-at="${esc(a.id)}">${entete}
        <div class="at-champs">
          <label>Nom<input value="${esc(a.nom)}" data-at-champ="nom" maxlength="160"></label>
          <label>Service<select data-at-champ="service">${services.map(s => `<option value="${esc(s.id)}" ${s.id === a.service ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
          <label>Type<select data-at-champ="type">
            <option value="manuel" ${a.type === 'manuel' ? 'selected' : ''}>Équipe</option>
            <option value="robot" ${a.type === 'robot' ? 'selected' : ''}>Robot</option>
            <option value="lavage" ${a.type === 'lavage' ? 'selected' : ''}>Lavage (plonge)</option></select></label>
          <label>Début<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          <label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
          <label>Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>
          ${a.type === 'robot' ? `
          <label>Débit (plateaux/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"></label>
          <label>Personnes minimum<input type="number" min="0" value="${a.personnesMin}" data-at-champ="personnesMin"></label>` : ''}
          ${a.type === 'lavage' ? `
          <label>Débit (unités/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"></label>` : ''}
        </div>
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="regime" ${a.regime.actif ? 'checked' : ''}>
            Poste avec pauses — 15 min après 3 h, 30 min après 6 h</label>
          ${a.regime.actif ? `<label class="at-presence">Présence (min)<input type="number" min="30" max="1440"
            value="${a.regime.presence}" data-at-champ="presence"></label>
            <span class="mini-note">soit ${String(Math.round((a.regime.presence - 45) / 6) / 10).replace('.', ',')} h de travail</span>` : ''}
          ${a.type !== 'lavage' && this.state.materiel.actif ? `<label class="chk chk-mini"><input type="checkbox" data-at-champ="consomme"
            ${a.materiel === 'consomme' ? 'checked' : ''}>
            Emporte du matériel propre (trolleys, porcelaine)</label>` : ''}
        </div>

        ${a.type === 'lavage' ? '<p class="mini-note at-lavage-note">Cet atelier n’a pas de lots : son travail vient des retours de vols, à mesure qu’ils arrivent.</p>' : `
        <div class="at-sous-titre">Lots, dans l’ordre de fabrication
          <span class="mini-note">le premier part à l’heure de début, les suivants quand le précédent est fini</span></div>
        ${lots || '<p class="mini-note">Aucun lot : cet atelier ne fabrique rien.</p>'}
        <div class="at-actions-lot">
          <button class="btn btn-sm" data-at-action="lot-ajouter">+ Lot</button>
          <button class="btn btn-sm" data-at-action="lot-separer">Une classe par lot</button>
          <button class="btn btn-sm" data-at-action="lot-tout">Tout en un seul lot</button>
        </div>`}

        <div class="at-sous-titre">Pauses <span class="mini-note">le travail s’arrête et reprend après</span></div>
        ${pauses}
        <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="pause-ajouter">+ Pause</button></div>

        <div class="at-actions-lot at-bas">
          <button class="btn btn-sm" data-at-action="dupliquer">Dupliquer</button>
          <button class="btn btn-sm at-danger" data-at-action="supprimer">Supprimer</button>
        </div>
      </article>`;
    }

    finLot(atelierId, index) {
      const r = this.resultat; if (!r || !r.ok) return '';
      const lots = (r.ateliers.find(a => a.id === atelierId) || {}).lots || [];
      const l = lots[index];
      if (!l) return '';
      if (l.impossible) return 'ne tourne pas';
      return P.hhmm(l.debut) + ' → ' + P.hhmm(l.fin) + (l.attente ? ' (attente ' + Math.round(l.attente) + ')' : '');
    }

    /* ---- planning ---------------------------------------------------- */

    rendrePlanning(r) {
      const box = document.getElementById('at-planning');
      if (!r.ok || !r.lots.length) {
        box.innerHTML = '<p class="mini-note">Le planning apparaîtra dès qu’un atelier aura un lot à fabriquer.</p>';
        return;
      }
      const t0 = Math.min(...r.lots.map(l => l.debut));
      const t1 = Math.max(...r.lots.map(l => (l.fin == null ? l.debut : l.fin)), t0 + 60);
      const lignes = r.ateliers.filter(a => a.lots.length);
      const H = 26, marge = 190, L = 900, haut = lignes.length * H + 34;
      const x = t => marge + (t - t0) / (t1 - t0) * (L - marge - 16);

      // Repères horaires : une heure ronde toutes les heures, deux si c'est trop dense.
      const pas = (t1 - t0) > 12 * 60 ? 120 : 60;
      const reperes = [];
      for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas) reperes.push(t);

      const barres = lignes.map((a, i) => {
        const y = 28 + i * H;
        const nom = `<text class="at-pl-nom" x="8" y="${y + 13}">${esc(a.nom)}</text>`;
        const lots = a.lots.map(l => {
          if (l.fin == null) return `<rect class="at-pl-bloque" x="${x(l.debut)}" y="${y + 3}" width="10" height="14" rx="3"><title>${esc(l.nom)} : ne tourne pas</title></rect>`;
          const att = l.attente ? `<rect class="at-pl-attente" x="${x(l.debut - l.attente)}" y="${y + 6}" width="${Math.max(1, x(l.debut) - x(l.debut - l.attente))}" height="8" rx="2"><title>Attente des amonts : ${Math.round(l.attente)} min</title></rect>` : '';
          const w = Math.max(2, x(l.fin) - x(l.debut));
          return att + `<rect class="at-pl-lot ${a.type === 'robot' ? 'robot' : ''}" x="${x(l.debut)}" y="${y + 3}" width="${w}" height="14" rx="3">
            <title>${esc(l.nom)}\n${P.hhmm(l.debut)} → ${P.hhmm(l.fin)} (${Math.round(l.duree)} min${l.arret ? ', dont ' + Math.round(l.arret) + ' min d’arrêt' : ''})</title></rect>`;
        }).join('');
        return nom + lots;
      }).join('');

      box.innerHTML = `<svg viewBox="0 0 ${L} ${haut}" role="img" aria-label="Planning des ateliers">
        ${reperes.map(t => `<g><line class="at-pl-grille" x1="${x(t)}" y1="20" x2="${x(t)}" y2="${haut}"/><text class="at-pl-heure" x="${x(t)}" y="14">${P.hhmm(t)}</text></g>`).join('')}
        ${barres}
      </svg>
      <p class="mini-note">Barre pleine : fabrication. Barre fine devant : attente des amonts.</p>`;
    }

    /* ---- couverture par classe --------------------------------------- */

    rendreClasses(r) {
      const box = document.getElementById('at-classes');
      const classes = this.classes, retirees = this.retirees;
      const par = (r && r.parClasse) || {};

      const ajout = this.ajout ? `<div class="at-ajout">
        <label>Compagnie<input id="at-cls-cie" maxlength="40" placeholder="Ex. CRL" value="${esc(this.ajout.cie)}"></label>
        <label>Classe<select id="at-cls-cabine">${P.CABINES.map(c => `<option value="${c}" ${c === this.ajout.cabine ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Passagers<input id="at-cls-pax" type="number" min="0" value="${this.ajout.pax}"></label>
        <label>Vols<input id="at-cls-vols" type="number" min="1" value="${this.ajout.vols}"></label>
        <label>Échéance<input id="at-cls-echeance" type="time" value="${esc(this.ajout.echeance)}"></label>
        <div class="at-ajout-actions">
          <button class="btn btn-play btn-sm" data-at-action="classe-valider">Ajouter</button>
          <button class="btn btn-sm" data-at-action="classe-annuler">Annuler</button>
        </div>
      </div>` : '';

      const barre = `<div class="at-barre">
        <span class="at-barre-fin"></span>
        <button class="btn btn-sm" data-at-action="classe-nouvelle" ${this.ajout ? 'disabled' : ''}>+ Compagnie × classe</button>
      </div>`;

      const exclues = retirees.length ? `<p class="at-exclues">Retirées du programme :
        ${retirees.map(c => `<button class="at-chip" data-at-action="classe-retablir" data-classe="${esc(c.id)}">${esc(c.id)} ↺</button>`).join(' ')}</p>` : '';

      if (!classes.length) {
        box.innerHTML = barre + ajout + exclues +
          '<p class="mini-note">Aucune compagnie × classe à fabriquer : ni dans le programme de vols, ni ajoutée ici.</p>';
        return;
      }

      box.innerHTML = barre + ajout + exclues + `<table class="at-table"><thead><tr>
        <th scope="col">Compagnie × classe</th><th scope="col">Passagers</th><th scope="col">Vols</th>
        <th scope="col">Échéance</th><th scope="col">Fin</th><th scope="col">État</th>
        <th scope="col">Services</th><th scope="col"><span class="sr-only">Retirer</span></th>
        </tr></thead><tbody>` +
        classes.map(c => {
          const v = par[c.id] || {};
          const etat = v.absente ? '<span class="at-etat manque">jamais fabriquée</span>'
            : v.fin == null ? '<span class="at-etat manque">inachevée</span>'
            : v.aHeure ? '<span class="at-etat ok">à l’heure</span>'
            : '<span class="at-etat retard">+' + Math.round(v.retard) + ' min</span>';
          const source = c.origine === 'ajoutee' ? '<span class="at-source">ajoutée</span>' : '';
          return `<tr><th scope="row">${esc(c.id)} ${source}</th><td>${c.pax}</td><td>${c.vols.length}</td>
            <td>${P.hhmm(c.echeance)}</td><td>${v.fin == null ? '—' : P.hhmm(v.fin)}</td><td>${etat}</td>
            <td class="at-parcours">${esc((v.services || []).join(' → ')) || '—'}</td>
            <td><button class="btn btn-sm at-danger" data-at-action="classe-supprimer" data-classe="${esc(c.id)}"
              title="Retirer ${esc(c.id)} et couper ses liens avec les ateliers">Retirer</button></td></tr>`;
        }).join('') + '</tbody></table>';
    }
  }

  const api = { CentreAteliers, valider, vide, CLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAteliers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
