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
      const type = ['robot', 'lavage', 'dispo'].includes(a.type) ? a.type : 'manuel';
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
        // pour une équipe qui ne suit pas la règle commune. La présence n'est
        // retenue QUE si on l'a fixée : sans elle, l'atelier suit le réglage
        // général, et changer la règle commune déplace tout le monde.
        regime: { actif: a.regime ? a.regime.actif !== false : true,
                  ...(Number.isFinite(+(a.regime || {}).presence) ? { presence: +a.regime.presence } : {}) },
        ...(a.materiel === 'consomme' ? { materiel: 'consomme' } : {}),
        ...(type === 'robot' ? {
          debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 320,
          personnesMin: Number.isInteger(a.personnesMin) ? Math.max(0, a.personnesMin) : 1
        } : {}),
        ...(type === 'lavage' ? {
          // Le débit de l'ENSEMBLE : ce qui est partagé entre les lignes les
          // bride toutes. Zéro ou absent = aucun plafond.
          plafond: Number.isFinite(+a.plafond) ? Math.max(0, +a.plafond) : 0,
          // Le débit d'une plonge est la somme de ses tunnels : on garde la
          // liste, pas le total, sinon on ne saurait plus d'où il vient.
          tunnels: (Array.isArray(a.tunnels) ? a.tunnels : [{ nom: 'Tunnel 1', debit: 300 }])
            .slice(0, 20).map((t, i) => ({
              nom: String(t.nom ?? ('Tunnel ' + (i + 1))).slice(0, 80),
              debit: Number.isFinite(+t.debit) ? Math.max(0, +t.debit) : 300,
              // Un tunnel que personne ne tient ne tourne pas : l'effectif de
              // l'équipe décide combien tournent vraiment.
              personnes: Number.isInteger(+t.personnes) ? Math.max(0, Math.min(99, +t.personnes)) : 1,
              actif: t.actif !== false
            }))
        } : {}),
        // Une mise à disposition est permanente sauf si on lui donne une heure.
        ...(type === 'dispo' ? { permanent: a.permanent !== false } : {})
      };
    });
    // Ce que l'utilisateur retire du programme, et ce qu'il y ajoute. Le
    // programme de vols reste la source ; ces deux listes le corrigent.
    const exclues = [...new Set((Array.isArray(brut.exclues) ? brut.exclues : []).map(String))].slice(0, 500);
    // Une compagnie × classe déclarée à la main ne porte QUE son identité.
    // Les passagers, le nombre de vols et l'échéance viennent du programme de
    // vols importé : les ressaisir serait ouvrir la porte à deux vérités.
    const ajoutees = (Array.isArray(brut.ajoutees) ? brut.ajoutees : []).slice(0, 500).map(c => {
      const cie = String(c.cie ?? '').trim().toUpperCase().slice(0, 40);
      const cabine = P.CABINES.includes(c.cabine) ? c.cabine : 'YC';
      if (!cie) throw new Error('Une compagnie × classe ajoutée doit nommer sa compagnie.');
      return { cie, cabine };
    });
    const m = brut.materiel || {};
    const materiel = {
      actif: m.actif === true,
      // Par classe, par passager ET par vol : un trolley part avec le vol, la
      // porcelaine avec le passager. `unitesDe` relit aussi l'ancienne saisie.
      unites: P.unitesDe(m),
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
        // Le programme fait foi : une classe qu'il porte déjà garde SES chiffres.
        // Une déclaration ne sert qu'à nommer ce que l'import ne nomme pas — et
        // ce qu'il ne nomme pas n'a, aujourd'hui, ni passager ni vol.
        if (par.has(id)) { par.get(id).declaree = true; continue; }
        par.set(id, { id, cie: c.cie, cabine: c.cabine, pax: 0, vols: [],
          echeance: P.MINUTES_PAR_JOUR, origine: 'ajoutee' });
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
          bareme: r.bareme, rendement: r.rendement, regime: r.regime, delaiChargement: r.delaiChargement
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
      this.changer(() => this.state.ateliers.push(atelier),
        'Atelier créé et déjà enregistré. Dites ce qu’il fabrique, puis « Terminé ».');
      this.ouvert = atelier.id; this.rendre();
    }

    action(quoi, id, data) {
      const a = this.state.ateliers.find(x => x.id === id);
      switch (quoi) {
        case 'ouvrir': this.ouvert = this.ouvert === id ? null : id; return this.rendre();
        // Rien à valider : la saisie est enregistrée à chaque frappe. Le bouton
        // referme la fiche et le dit — sans lui, on cherche un « créer »
        // qui n'existe pas et on doute que l'atelier existe.
        case 'fermer':
          this.ouvert = null;
          return this.rendre('« ' + a.nom + ' » enregistré.');
        case 'supprimer':
          if (!confirm('Supprimer « ' + a.nom + ' » ?')) return;
          return this.changer(() => { this.state.ateliers = this.state.ateliers.filter(x => x.id !== id); }, 'Atelier supprimé.');
        case 'dupliquer':
          return this.changer(() => {
            const c = clone(a); c.id = uid(); c.nom = (a.nom + ' (2)').slice(0, 160);
            this.state.ateliers.splice(this.state.ateliers.indexOf(a) + 1, 0, c);
          }, 'Atelier dupliqué.');
        case 'lot-ajouter':
          return this.changer(() => a.lots.push([]), 'Ligne ajoutée : choisissez ce qu’elle fabrique.');
        case 'lot-retirer':
          return this.changer(() => a.lots.splice(+data.index, 1), 'Fabrication retirée.');
        case 'lot-monter':
          return this.changer(() => { const i = +data.index; if (i > 0) a.lots.splice(i - 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'lot-descendre':
          return this.changer(() => { const i = +data.index; if (i < a.lots.length - 1) a.lots.splice(i + 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'classe-retirer':
          return this.changer(() => { a.lots[+data.index] = a.lots[+data.index].filter(c => c !== data.classe); }, 'Classe retirée.');
        case 'lot-tout':
          return this.changer(() => { a.lots = [this.classes.map(c => c.id)]; },
            'Tout sur une seule ligne : ces classes sortiront ensemble.');
        case 'lot-separer':
          return this.changer(() => { a.lots = this.classes.map(c => [c.id]); },
            'Une ligne par classe, dans l’ordre des échéances.');
        case 'pause-ajouter':
          return this.changer(() => a.pauses.push({ de: '12:00', a: '12:45' }), 'Arrêt ajouté.');
        case 'pause-retirer':
          return this.changer(() => a.pauses.splice(+data.index, 1), 'Arrêt retiré.');
        case 'tunnel-ajouter':
          return this.changer(() => a.tunnels.push({ nom: 'Tunnel ' + (a.tunnels.length + 1), debit: 300, personnes: 1, actif: true }),
            'Tunnel ajouté. Le débit de la plonge est la somme des tunnels qui tournent.');
        case 'tunnel-retirer':
          return this.changer(() => a.tunnels.splice(+data.index, 1), 'Tunnel retiré.');
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
        const data = { cabine: el.dataset.cabine, part: el.dataset.part };
        setTimeout(() => this.appliquerMateriel(champ, v, data), 0);
        return;
      }
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return;
      const v = el.value;
      setTimeout(() => this.appliquerSaisie(champ, a, el, v), 0);
    }

    appliquerMateriel(champ, v, data) {
      this.changer(() => {
        const m = this.state.materiel;
        if (champ === 'mat-actif') m.actif = !!v;
        if (champ === 'mat-unite') {
          const { cabine, part } = data || {};
          if (m.unites[cabine] && (part === 'parPax' || part === 'parVol')) {
            m.unites[cabine][part] = Math.max(0, parseFloat(v) || 0);
          }
        }
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
            else if (v === 'lavage') { delete a.debit; delete a.personnesMin; a.lots = []; }
            // Une mise à disposition ne fabrique rien : ses lignes, son
            // effectif et ses arrêts n'ont plus de sens, on les efface.
            else if (v === 'dispo') {
              delete a.debit; delete a.personnesMin; delete a.tunnels;
              a.lots = []; a.pauses = []; a.personnes = 0;
              if (a.permanent === undefined) a.permanent = true;
            }
            else { delete a.debit; delete a.personnesMin; }
            break;
          case 'consomme': a.materiel = el.checked ? 'consomme' : undefined; break;
          case 'tunnel-nom': a.tunnels[+el.dataset.index].nom = v; break;
          case 'tunnel-debit': a.tunnels[+el.dataset.index].debit = Math.max(0, parseFloat(v) || 0); break;
          case 'tunnel-actif': a.tunnels[+el.dataset.index].actif = el.checked; break;
          case 'tunnel-personnes': a.tunnels[+el.dataset.index].personnes = Math.max(0, parseInt(v, 10) || 0); break;
          case 'plafond': a.plafond = Math.max(0, parseFloat(v) || 0); break;
          case 'permanent': a.permanent = el.checked; break;
          case 'regime': a.regime = { ...a.regime, actif: el.checked }; break;
          case 'presence': {
            // Vider le champ, c'est revenir au réglage général.
            const n = parseInt(v, 10);
            const suite = { ...a.regime }; delete suite.presence;
            if (Number.isFinite(n)) suite.presence = Math.max(30, n);
            a.regime = suite;
            break;
          }

          case 'lot-ajout': {
            const i = +el.dataset.index;
            if (v && !a.lots[i].includes(v)) a.lots[i].push(v);
            break;
          }
          // Ajouter une fabrication en un seul geste : la ligne naît remplie.
          // En deux temps — créer une ligne vide, puis la garnir — on ne
          // comprenait pas à quoi servait la ligne.
          case 'lot-nouveau':
            if (v && !a.lots.some(l => l.includes(v))) a.lots.push([v]);
            el.value = '';
            break;
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
        ? id + ' retirée — ' + lots + ' fabrication(s) dans ' + touches.map(a => a.nom).join(', ')
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

    ouvrirAjout() { this.ajout = { cie: '', cabine: 'YC' }; this.rendre(''); }

    validerAjout() {
      const lire = id => (document.getElementById(id) || {}).value;
      const brouillon = { cie: lire('at-cls-cie'), cabine: lire('at-cls-cabine') };
      if (!String(brouillon.cie || '').trim()) return this.rendre('Nommez la compagnie.');
      const id = P.idClasse(brouillon.cie, brouillon.cabine);
      if ((this.state.ajoutees || []).some(c => P.idClasse(c.cie, c.cabine) === id))
        return this.rendre(id + ' est déjà déclarée.');
      const connue = this.classes.some(c => c.id === id && c.origine === 'programme');
      this.ajout = null;
      this.changer(() => {
        this.state.exclues = (this.state.exclues || []).filter(x => x !== id);
        this.state.ajoutees = [...(this.state.ajoutees || []), brouillon];
      }, id + (connue
        ? ' était déjà au programme : ce sont ses chiffres qui comptent.'
        : ' déclarée. Ses passagers viendront de l’import des vols.'));
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
        tuile('Dernière sortie', P.hhmm(i.finDerniere), 'fin de la dernière fabrication'),
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
    <label>Propre à l'ouverture<input type="number" min="0" value="${m.stockInitial}" data-at-champ="mat-stock"></label>
    <label>Délai après atterrissage (min)<input type="number" min="0" value="${m.delaiRetour}" data-at-champ="mat-delai"></label>
  </div>
  <p class="mini-note">Combien d'unités partent, classe par classe. <b>Par vol</b> pour ce qui part
    avec l'avion — un trolley ne se multiplie pas parce que la cabine est pleine. <b>Par passager</b>
    pour ce qui suit les gens, la porcelaine par exemple. Laissez une colonne à zéro si elle ne
    veut rien dire chez vous : c'est le cas le plus courant pour « par passager ».</p>
  <table class="at-mat-table"><thead><tr><th scope="col">Classe</th>
    <th scope="col">u / passager</th><th scope="col">u / vol</th></tr></thead><tbody>
    ${P.CABINES.map(c => `<tr><th scope="row" title="${esc((P.NOM_CABINE || {})[c] || c)}">${c}</th>
      ${['parPax', 'parVol'].map(part => `<td><input type="number" min="0" step="0.1"
        value="${(m.unites[c] || {})[part] || 0}" data-at-champ="mat-unite"
        data-cabine="${c}" data-part="${part}"
        aria-label="${c} : unités par ${part === 'parPax' ? 'passager' : 'vol'}"></td>`).join('')}
    </tr>`).join('')}
  </tbody></table>` : ''}
  ${m.actif && bilan ? `<div class="at-mat-bilan">
    ${chiffre('Revenu des vols', bilan.entrees + ' u')}
    ${chiffre('Lavé', bilan.lavees + ' u', bilan.resteSale ? bilan.resteSale + ' u sales non lavées' : '')}
    ${chiffre('Emporté', bilan.consommees + ' u')}
    ${chiffre('Reste propre', bilan.restePropre + ' u', bilan.restePropre ? 'disponible demain' : 'aucun amortisseur')}
    ${chiffre('Plus bas niveau', bilan.minPropre + ' u', bilan.minPropre === 0 ? 'passé par zéro' : '')}
    ${chiffre('Attente de matériel', Math.round(bilan.attente) + ' min', bilan.enAttente ? bilan.enAttente + ' fabrication(s) jamais servie(s)' : '')}
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
      const dispo = a.type === 'dispo';
      const fin = calcul && calcul.fin != null ? P.hhmm(calcul.fin) : '—';
      const attente = calcul && calcul.attente ? ' · ' + Math.round(calcul.attente) + ' min d’attente' : '';
      const jour = a.jour ? ' (J' + a.jour + ')' : '';
      const noms = a.lots.map(l => l.join(' + '));
      const resume = dispo ? 'sert toutes les classes'
        : !noms.length ? 'ne fabrique rien'
        : noms.length <= 3 ? noms.join(' → ')
        : noms.slice(0, 3).join(' → ') + ' → … (' + noms.length + ' fabrications)';
      // Une mise à disposition n'a ni effectif ni heure de fin : son en-tête
      // dirait trois fois « — ». Elle dit ce qu'elle est.
      const sous = dispo
        ? (a.permanent === false ? 'disponible à partir de ' + esc(a.debut) + jour : 'disponible en permanence')
        : esc(a.debut) + jour + ' · ' + a.personnes + ' pers.'
          + (a.type === 'robot' ? ' · robot ' + a.debit + ' pl/h' : a.type === 'lavage' ? ' · ' + P.debitLavage(a) + ' u/h' : '')
          + ' → fin ' + esc(fin) + esc(attente);

      const entete = `<div class="at-carte-tete">
        <button class="at-carte-nom" data-at-action="ouvrir" aria-expanded="${ouvert}">
          <strong>${esc(a.nom)}</strong>
          <span>${sous}</span>
        </button>
        <span class="at-resume">${esc(resume)}</span>
      </div>`;

      if (!ouvert) return `<article class="at-carte" data-at="${esc(a.id)}">${entete}</article>`;

      const services = this.a.services();
      // Le régime de la maison, pour dire ce que suit un atelier qui ne fixe rien.
      const etatTunnels = P.tunnelsQuiTournent(a);
      const reg = P.normaliserRegime(undefined, (this.a.reglages ? this.a.reglages() : {}).regime);
      const defaut = { presence: reg.presence, arret: reg.seuils.reduce((n, x) => n + x.duree, 0) };
      const restantes = i => this.classes.filter(c => !a.lots[i].includes(c.id));

      const libres = this.classes.filter(c => !a.lots.some(l => l.includes(c.id)));
      const optionsDe = liste => liste
        .map(c => `<option value="${esc(c.id)}">${esc(c.id)} · ${c.pax} pax · ${c.vols.length} vol(s)</option>`).join('');

      const lots = a.lots.map((l, i) => `
        <div class="at-lot">
          <div class="at-lot-tete">
            <b>${i + 1}.</b>
            <span class="at-chips">${l.map(c => `<button class="at-chip" data-at-action="classe-retirer" data-index="${i}" data-classe="${esc(c)}"
              title="Retirer ${esc(c)} de cette fabrication">${esc(c)} ×</button>`).join('') || '<em>à renseigner</em>'}</span>
            <span class="at-lot-fin">${esc(this.finLot(a.id, i))}</span>
            <button class="btn btn-sm" data-at-action="lot-monter" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Plus tôt">↑</button>
            <button class="btn btn-sm" data-at-action="lot-descendre" data-index="${i}" ${i === a.lots.length - 1 ? 'disabled' : ''} aria-label="Plus tard">↓</button>
            <button class="btn btn-sm" data-at-action="lot-retirer" data-index="${i}" aria-label="Retirer cette fabrication">×</button>
          </div>
          <select class="at-lot-plus" data-at-champ="lot-ajout" data-index="${i}" aria-label="Fabriquer autre chose en même temps que la ligne ${i + 1}">
            <option value="">+ fabriquer en même temps…</option>
            ${optionsDe(restantes(i))}
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
            <option value="lavage" ${a.type === 'lavage' ? 'selected' : ''}>Lavage (plonge)</option>
            <option value="dispo" ${dispo ? 'selected' : ''}>Mise à disposition</option></select></label>
          ${dispo ? '' : `
          <label>Début<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          <label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
          <label>Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>`}
          ${a.type === 'robot' ? `
          <label>Débit (plateaux/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"></label>
          <label>Personnes minimum<input type="number" min="0" value="${a.personnesMin}" data-at-champ="personnesMin"></label>` : ''}
        </div>
        ${dispo ? `
        <p class="mini-note at-regle">Ce service <b>ne fabrique pas</b> : il sort du matériel ou des matières
          premières, préparés à l’avance. Ni effectif, ni homme-minutes, ni durée — et il sert
          <b>toutes</b> les compagnies × classes, sans qu’on les énumère.</p>
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="permanent" ${a.permanent !== false ? 'checked' : ''}>
            Disponible en permanence — personne ne l’attend</label>
          ${a.permanent === false ? `<div class="at-pause">
            <label>À partir de<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
            <label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
          </div>` : ''}
        </div>` : `
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="regime" ${a.regime.actif ? 'checked' : ''}>
            Poste avec pauses — 15 min après 3 h, 30 min après 6 h</label>
          ${a.regime.actif ? `<label class="at-presence">Présence (min)<input type="number" min="30" max="1440"
            value="${a.regime.presence ?? ''}" placeholder="${defaut.presence}" data-at-champ="presence"></label>
            <span class="mini-note">${a.regime.presence === undefined
              ? 'réglage général · ' + defaut.presence + ' min' : 'propre à cette équipe'}
              — soit ${String(Math.round(((a.regime.presence ?? defaut.presence) - defaut.arret) / 6) / 10).replace('.', ',')} h de travail</span>` : ''}
          ${a.type !== 'lavage' && this.state.materiel.actif ? `<label class="chk chk-mini"><input type="checkbox" data-at-champ="consomme"
            ${a.materiel === 'consomme' ? 'checked' : ''}>
            Emporte du matériel propre (trolleys, porcelaine)</label>` : ''}
        </div>`}

        ${dispo ? '' : a.type === 'lavage' ? `
        <div class="at-sous-titre">Tunnels de lavage
          <span class="mini-note">un débit par ligne, un plafond pour l’ensemble</span></div>
        ${a.tunnels.map((t, i) => `<div class="at-tunnel ${t.actif ? '' : 'arret'}${
          etatTunnels.sansPersonne.includes(t) ? ' sans-personne' : ''}">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="tunnel-actif" data-index="${i}" ${t.actif ? 'checked' : ''}>
            <span class="sr-only">${esc(t.nom)} en service</span></label>
          <input value="${esc(t.nom)}" data-at-champ="tunnel-nom" data-index="${i}" maxlength="80" aria-label="Nom du tunnel">
          <input type="number" min="0" step="10" value="${t.debit}" data-at-champ="tunnel-debit" data-index="${i}" aria-label="Débit en unités par heure">
          <span class="at-tunnel-unite">u/h</span>
          <input type="number" min="0" max="99" value="${t.personnes}" data-at-champ="tunnel-personnes" data-index="${i}" aria-label="Personnes pour tenir ${esc(t.nom)}">
          <span class="at-tunnel-unite">pers.</span>
          <span class="at-tunnel-etat">${!t.actif ? 'à l’arrêt'
            : etatTunnels.sansPersonne.includes(t) ? 'personne pour le tenir' : 'tourne'}</span>
          <button class="btn btn-sm" data-at-action="tunnel-retirer" data-index="${i}">Retirer</button>
        </div>`).join('')}
        <div class="at-actions-lot">
          <button class="btn btn-sm" data-at-action="tunnel-ajouter">+ Tunnel</button>
          <label class="at-plafond">Débit maximum de l’ensemble
            <input type="number" min="0" step="50" value="${a.plafond || ''}" placeholder="aucun plafond"
              data-at-champ="plafond" aria-label="Débit maximum de la plonge, toutes lignes confondues">
            <span class="at-tunnel-unite">u/h</span></label>
        </div>
        <div class="at-bilan-debit${etatTunnels.bride ? ' bride' : ''}">
          <span><em>Somme des tunnels qui tournent</em><b>${etatTunnels.somme}</b> u/h</span>
          <span><em>Plafond de l’ensemble</em><b>${a.plafond ? a.plafond : '—'}</b>${a.plafond ? ' u/h' : ''}</span>
          <span class="retenu"><em>Débit retenu</em><b>${etatTunnels.debit}</b> u/h</span>
          <span class="at-tunnel-total">${etatTunnels.tournent.length} tunnel(s) sur ${a.tunnels.length}${
            etatTunnels.sansPersonne.length ? ' · ' + etatTunnels.sansPersonne.length + ' sans personnel' : ''}${
            etatTunnels.reste ? ' · ' + etatTunnels.reste + ' personne(s) disponible(s)' : ''}</span>
        </div>
        <p class="mini-note at-tunnel-note">Deux limites, et c’est la plus basse qui compte.
          Un tunnel ne tourne que si l’équipe a les gens pour le tenir — ils sont servis
          <b>dans l’ordre de la liste</b>. Et l’ensemble ne dépasse pas son plafond, quoi qu’on
          ajoute : ce qui est partagé entre les lignes les bride toutes.${
          etatTunnels.bride ? ' <b class="at-danger">Ici, le plafond bride la plonge.</b>' : ''}</p>
        <p class="mini-note at-lavage-note">Cet atelier ne fabrique rien : son travail vient des retours de vols, à mesure qu’ils arrivent.</p>` : `
        <div class="at-sous-titre">Ce que cette équipe fabrique, dans l’ordre</div>
        <p class="mini-note at-regle">Une ligne = une fabrication. Plusieurs sur la même ligne sortent <b>ensemble</b> ;
          sur deux lignes, <b>l’une après l’autre</b>. La première part à l’heure de début.</p>
        ${lots || '<p class="mini-note at-rien">Rien pour l’instant : cette équipe ne produit pas.</p>'}
        <div class="at-actions-lot">
          <select class="at-ajout-lot" data-at-champ="lot-nouveau" aria-label="Ajouter une fabrication">
            <option value="">+ Ajouter une fabrication…</option>
            ${optionsDe(libres)}
          </select>
          ${a.lots.length ? '' : `<button class="btn btn-sm" data-at-action="lot-separer">Tout, une ligne par classe</button>
          <button class="btn btn-sm" data-at-action="lot-tout">Tout sur une seule ligne</button>`}
        </div>`}

        ${dispo ? '' : `
        <details class="at-arrets" ${a.pauses.length ? 'open' : ''}>
          <summary>Arrêt programmé${a.pauses.length ? ' (' + a.pauses.length + ')' : ''}</summary>
          <p class="mini-note">Les pauses de l’équipe sont déjà prises en compte plus haut. Ici, c’est autre chose :
            une plage où <b>rien ne tourne</b> — machine à l’arrêt, local fermé, créneau de nettoyage.
            À une heure fixe, pas après un temps de travail.</p>
          ${pauses}
          <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="pause-ajouter">+ Arrêt</button></div>
        </details>`}

        <div class="at-actions-lot at-bas">
          <button class="btn btn-play btn-sm" data-at-action="fermer">Terminé</button>
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
        box.innerHTML = '<p class="mini-note">Le planning apparaîtra dès qu’une équipe aura quelque chose à fabriquer.</p>';
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
          // Une mise à disposition n'a pas de durée : une barre de deux pixels
          // se lirait comme une fabrication minuscule. C'est un repère.
          if (l.dispo) return `<rect class="at-pl-dispo" x="${x(l.debut) - 3}" y="${y + 2}" width="6" height="16" rx="2"><title>Disponible à partir de ${P.hhmm(l.debut)}</title></rect>`;
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
        <div class="at-ajout-actions">
          <button class="btn btn-play btn-sm" data-at-action="classe-valider">Déclarer</button>
          <button class="btn btn-sm" data-at-action="classe-annuler">Annuler</button>
        </div>
        <p class="mini-note at-ajout-note">Passagers, nombre de vols et échéance viennent de
          l’<b>import du programme de vols</b> — on ne les saisit pas deux fois. Une classe que
          l’import ne porte pas reste déclarée, à volume nul, jusqu’au prochain import.</p>
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
          // Une classe déclarée que l'import ne porte pas n'a ni volume ni
          // échéance : afficher zéro et une heure ferait croire à une donnée.
          const horsImport = c.origine === 'ajoutee' && !c.vols.length;
          const source = c.origine === 'ajoutee'
            ? '<span class="at-source">' + (horsImport ? 'hors import' : 'déclarée') + '</span>' : '';
          return `<tr><th scope="row">${esc(c.id)} ${source}</th>
            <td>${horsImport ? '—' : c.pax}</td><td>${horsImport ? '—' : c.vols.length}</td>
            <td>${horsImport ? '—' : P.hhmm(c.echeance)}</td><td>${v.fin == null ? '—' : P.hhmm(v.fin)}</td><td>${etat}</td>
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
