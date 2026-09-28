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
  const PC = root.OrlyParcours;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const uid = () => 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const clone = x => JSON.parse(JSON.stringify(x));

  const CLE = 'ory-ateliers-v1';

  /* ----------------------------------------------------------------------
   *  Validation du fichier enregistré. Refuse en bloc plutôt que de charger
   *  à moitié : une saisie perdue est pire qu'une saisie refusée.
   * --------------------------------------------------------------------*/
  function minutesPropres(a, lots) {
    const dedans = new Set(lots.flat()), m = {};
    for (const [k, v] of Object.entries((a && a.minutes) || {}))
      if (dedans.has(k) && Number.isFinite(+v) && v !== null && v !== '' && +v >= 0) m[k] = Math.round(+v * 10) / 10;
    return Object.keys(m).length ? { minutes: m } : {};
  }

  /** Les débits propres d'un robot, commande par commande, bornés à ses commandes. */
  function debitsPropres(a, lots) {
    const siennes = new Set(lots.flat()), d = {};
    for (const [k, v] of Object.entries((a && a.debits) || {})) if (siennes.has(k) && Number.isFinite(+v) && +v > 0) d[k] = Math.min(100000, +v);
    return Object.keys(d).length ? { debits: d } : {};
  }

  /** Les vagues d'une mise à disposition, triées ; sans liste, son heure seule. */
  function vaguesDe(a, jour) {
    const brut = Array.isArray(a.vagues) && a.vagues.length ? a.vagues : [{ debut: a.debut ?? '06:00', jour }];
    const vues = new Map();
    for (const v of brut.slice(0, 12)) {
      const debut = String((v && v.debut) ?? '06:00'); P.minutes(debut);
      const j = Number.isInteger(+v.jour) ? Math.max(-7, Math.min(0, +v.jour)) : 0;
      vues.set(j * 1440 + P.minutes(debut), { debut, jour: j });
    }
    return [...vues].sort((x, y) => x[0] - y[0]).map(x => x[1]);
  }

  /** Les réglages d'un handling, bornés. Sans durée saisie : 30 min par vol. */
  function handlingDe(a) {
    const durees = {};
    const brut = a.durees && typeof a.durees === 'object' && !Array.isArray(a.durees) ? a.durees : { [P.TOUTES]: 30 };
    for (const [k, v] of Object.entries(brut).slice(0, 300)) {
      const cie = k === P.TOUTES ? k : String(k).trim().toUpperCase().slice(0, 40);
      if (!cie || v === '' || v === null || !Number.isFinite(+v)) continue;
      durees[cie] = Math.max(0, Math.min(1440, Math.round(+v * 10) / 10));
    }
    const n = parseInt(a.simultanes, 10), av = a.avance === '' || a.avance === null || a.avance === undefined ? NaN : +a.avance;
    return {
      durees,
      simultanes: Number.isInteger(n) && n > 0 ? Math.min(50, n) : 1,
      avance: Number.isFinite(av) ? Math.max(0, Math.min(1440, Math.round(av))) : P.AVANCE_HANDLING,
      compagnies: [...new Set((Array.isArray(a.compagnies) ? a.compagnies : []).map(x => String(x).trim().toUpperCase().slice(0, 40)).filter(Boolean))].slice(0, 100)
    };
  }

  function valider(brut) {
    if (!brut || brut.schema !== 'ory-ateliers' || brut.version !== 1 || !Array.isArray(brut.ateliers))
      throw new Error('Fichier d’ateliers v1 attendu.');
    // Une case par service et par commande : plusieurs milliers pour une grosse unité.
    if (brut.ateliers.length > 5000) throw new Error('Maximum 5000 cases.');
    const ids = new Set();
    const ateliers = brut.ateliers.map(a => {
      if (!a || typeof a !== 'object') throw new Error('Atelier invalide.');
      const id = typeof a.id === 'string' && a.id ? a.id : uid();
      if (ids.has(id)) throw new Error('Identifiant d’atelier en double.');
      ids.add(id);
      const nom = String(a.nom ?? '').slice(0, 160);
      const service = String(a.service ?? '').slice(0, 160);
      const type = ['robot', 'lavage', 'dispo', 'handling'].includes(a.type) ? a.type : 'manuel';
      P.minutes(a.debut ?? '06:00');
      // Le handling travaille le jour J des vols : jamais la veille.
      const jour = type === 'handling' ? 0 : Number.isInteger(a.jour) ? Math.max(-7, Math.min(0, a.jour)) : 0;
      const personnes = Number.isInteger(a.personnes) ? Math.max(0, Math.min(999, a.personnes)) : 1;
      const pauses = (Array.isArray(a.pauses) ? a.pauses : []).slice(0, 12).map(p => {
        P.minutes(p.de); P.minutes(p.a); return { de: String(p.de), a: String(p.a) };
      });
      // Le handling charge des vols : il n'a pas de liste de commandes.
      const lots = (Array.isArray(a.lots) && type !== 'handling' ? a.lots : []).slice(0, 200)
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
        // Les homme-minutes fixées dans la case, commande par commande ; sans
        // elles, celles du barème importé. Seules les commandes qu'elle prépare.
        ...minutesPropres(a, lots),
        ...(type === 'robot' ? {
          debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 320,
          personnesMin: Number.isInteger(a.personnesMin) ? Math.max(0, a.personnesMin) : 1,
          // Le débit de chaque commande sur le robot (plateaux/h) ; sans lui, celui du robot.
          ...debitsPropres(a, lots)
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
        ...(type === 'dispo' ? { permanent: a.permanent !== false, vagues: vaguesDe(a, jour) } : {}),
        // Le handling : une durée par vol et par compagnie, combien de vols à la
        // fois, et pas plus de `avance` minutes avant le départ.
        ...(type === 'handling' ? handlingDe(a) : {})
      };
    }).map(a => (a.type === 'dispo' && a.vagues.length ? { ...a, debut: a.vagues[0].debut, jour: a.vagues[0].jour } : a));
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
      // Par classe, en unités PAR VOL. `unitesDe` convertit aussi l'ancienne
      // saisie, qui comptait par passager.
      unites: P.unitesDe(m),
      stockInitial: Number.isFinite(+m.stockInitial) ? Math.max(0, Math.round(+m.stockInitial)) : 0,
      delaiRetour: Number.isFinite(+m.delaiRetour) ? Math.max(0, Math.round(+m.delaiRetour)) : 30
    };
    // Le chemin de chaque classe. Une sauvegarde d'avant les parcours reçoit
    // les parcours types ; une liste vidée exprès reste vide.
    const { parcours, parcoursCabine, parcoursClasse } = PC.validerParcours(brut);
    // Les changements d'organisation déjà faits une fois (ex. « robot-eco ») :
    // ils ne se refont pas à chaque ouverture.
    const migrations = [...new Set((Array.isArray(brut.migrations) ? brut.migrations : []).map(String))].slice(0, 50);
    return { schema: 'ory-ateliers', version: 1, ateliers, exclues, ajoutees, materiel,
      parcours, parcoursCabine, parcoursClasse, ...(migrations.length ? { migrations } : {}) };
  }

  const vide = () => ({ schema: 'ory-ateliers', version: 1, ateliers: [], exclues: [], ajoutees: [],
    materiel: { actif: false, unites: P.UNITES_DEFAUT, stockInitial: 0, delaiRetour: 30 },
    ...PC.parcoursTypes() });

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
      try {
        const brut = localStorage.getItem(CLE);
        if (brut) {
          const lu = JSON.parse(brut);
          this.state = valider(lu);
          if (lu && lu.parcours === undefined) {
            alerte = 'Parcours types créés : « Complet » pour BC, PC, CREW et SPML, « Sans cuisine » pour YC. '
              + 'Ajustez-les dans l’onglet « Les chemins ».';
            this.enregistrer();
          }
          // La prépa (24/09) s'insère une fois entre la cuisine et le montage
          // des chemins déjà dessinés. Les autres liens vers le montage restent.
          const insere = PC.insererPrepa ? PC.insererPrepa(this.state) : 0;
          if (insere) {
            alerte = 'Nouveau service « Prépa » : il s’insère entre Cuisine et Montage dans '
              + (insere > 1 ? insere + ' chemins' : '1 chemin') + '. Ajoutez-le ailleurs depuis l’onglet « Les chemins ».';
            this.enregistrer();
          }
        }
      }
      catch (e) { alerte = 'Ateliers enregistrés non chargés : ' + e.message + ' La copie reste en place.'; }
      // Un chemin de commande dessiné avant le 24/09 n'avait pas ses cases :
      // chaque service reçoit la sienne, une fois, pour qu'on puisse la régler.
      try {
        const nomDe = id => (this.a.services().find(x => x.id === id) || {}).nom || id;
        const n = PC.completerCases ? PC.completerCases(this.state, nomDe, this.classes) : 0;
        if (n) {
          this.state = valider(this.state); this.enregistrer();
          alerte = (n > 1 ? n + ' cases créées' : '1 case créée') + ' dans les chemins déjà dessinés : chaque service a maintenant la sienne, à régler dans « Les chemins » ou « Les cases ».';
        }
      } catch (e) { /* un état illisible est déjà signalé plus haut */ }
      // La légumerie, le magasin, la réception : une seule case par poste
      // (28/09). Les cases d'avant, une par commande, se fondent d'elles-mêmes à
      // l'ouverture — « Annuler » revient en arrière.
      try {
        const avant = clone(this.state);
        const r = this.fondreDispos(this.state);
        if (r.converties) {
          // Une copie de l'organisation d'avant, gardée dans ce navigateur :
          // « Annuler » ne survit pas à un rechargement de la page.
          try { localStorage.setItem(CLE + '-avant-fonte', JSON.stringify({ le: new Date().toISOString(), etat: avant })); } catch (e) { /* plein */ }
          this.state = valider(this.state); this.undo.push(avant); this.enregistrer();
          alerte = this.messageFonte(r) + ' « Annuler » revient en arrière.';
        }
      } catch (e) { /* un état illisible est déjà signalé plus haut */ }
      this.construire();
      this.lier();
      this.parcours = new PC.EditeurParcours({
        boite: () => document.getElementById('at-parcours'),
        etat: () => this.state,
        changer: (fn, message) => this.changer(() => fn(this.state), message),
        services: () => this.a.services(),
        classes: () => this.classes,
        resultat: () => this.resultat,
        // La fiche d'une case s'ouvre dans le chemin, sous le service choisi.
        fiche: (id, cmd) => this.ficheCase(id, cmd),
        onglet: id => { if (this.a.onglet) this.a.onglet(id); }
      });
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
          bareme: r.bareme, rendement: r.rendement, regime: r.regime, delaiChargement: r.delaiChargement,
          parcours: this.state.parcours, parcoursCabine: this.state.parcoursCabine,
          parcoursClasse: this.state.parcoursClasse,
          noms: Object.fromEntries(this.a.services().map(s => [s.id, s.nom]))
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
  <div class="at-actions">
    <button class="btn btn-sm" id="at-undo" title="Annuler la dernière modification">↶ Annuler</button>
    <button class="btn btn-sm" id="at-redo" title="Rétablir ce qui a été annulé">↷ Rétablir</button>
    <button class="btn btn-sm" id="at-export" title="Les cases, ce qu’elles préparent et les chemins, dans un classeur Excel">⇩ Cases et chemins</button>
    <button class="btn btn-sm" id="at-export-horaires" title="L’heure de début de chaque case, dans un petit classeur Excel à modifier puis réimporter">⇩ Horaires</button>
    <button class="btn btn-sm" id="at-import-btn" title="Réimporter un classeur de cases et chemins, ou d’horaires, modifié dans Excel">⇧ Importer</button>
    <input id="at-import" type="file" accept=".xlsx,.json" hidden>
  </div>
</div>
<p id="at-status" role="status" aria-live="polite"></p>
<details id="at-anomalies" class="at-anomalies" hidden></details>
<div id="at-parcours" class="pc"></div>
<h3 class="at-titre" data-sous="at-equipes">Les cases <span class="pc-sous">calculées à partir des chemins : cliquez une commande pour régler sa case</span></h3>
<div class="at-barre" data-sous="at-equipes">
  <label>Service <select id="at-filtre"><option value="">Tous</option></select></label>
  <span class="at-barre-fin"></span>
  <button class="btn" id="at-new" title="Une case qui ne suit pas une commande : une plonge, une mise à disposition qui sert tout le monde">+ Case hors chemin</button>
</div>
<div id="at-liste" data-sous="at-equipes"></div>
<div id="at-materiel" class="at-materiel" data-sous="at-equipes"></div>
<h3 class="at-titre" data-sous="at-planning">La journée des équipes <span class="pc-sous">qui travaille quand</span></h3>
<div id="at-indicateurs" class="at-indicateurs" data-sous="at-planning"></div>
<div id="at-planning" class="at-planning" data-sous="at-planning"></div>

<section class="recap-cases" data-sous="at-recap" aria-label="Récap des cases">
  <div class="rc-outils">
    <label class="rc-cherche">Chercher <input id="rc-filtre" type="search" placeholder="Case, service ou compagnie"></label>
    <span class="rc-fin"></span>
    <button class="btn btn-sm" id="rc-undo" title="Annuler la dernière modification">↶ Annuler</button>
    <button class="btn btn-sm" id="rc-redo" title="Rétablir ce qui a été annulé">↷ Rétablir</button>
    <button class="btn btn-sm" id="rc-export" title="Toutes les cases dans un classeur Excel de paramétrage : jour, heure de départ, personnes, commandes dans l’ordre">⇩ Cases</button>
    <button class="btn btn-sm" id="rc-import-btn" title="Réimporter le classeur des cases modifié">⇧ Importer</button>
    <input id="rc-import" type="file" accept=".xlsx" hidden>
  </div>
  <p class="rc-legende"><span class="rc-deroule unique">tâche unique</span> une seule préparation, de son départ à sa fin ·
    <span class="rc-deroule suite">à la suite</span> les lignes s’enchaînent, chacune quand la précédente est finie ·
    <span class="rc-ensemble-lab">ensemble</span> plusieurs commandes préparées en même temps, qui sortent ensemble.</p>
  <div id="rc-liste"></div>
</section>
<h3 class="at-titre" data-sous="at-repas">Les commandes à préparer <span class="pc-sous">une par compagnie et par classe, pour la journée</span></h3>
<div id="at-classes" data-sous="at-repas"></div>`;
    }

    lier() {
      const hote = this.a.hote();
      const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      on('at-undo', 'click', () => this.histoire(false));
      on('at-redo', 'click', () => this.histoire(true));
      on('at-filtre', 'change', e => { this.filtre = e.target.value; this.rendreListe(this.resultat || {}); });
      on('at-new', 'click', () => this.creer());
      on('at-export', 'click', () => this.exporter());
      on('at-export-horaires', 'click', () => this.exporterHoraires());
      on('at-import-btn', 'click', () => document.getElementById('at-import').click());
      on('at-import', 'change', e => this.importer(e));
      on('rc-undo', 'click', () => this.histoire(false));
      on('rc-redo', 'click', () => this.histoire(true));
      on('rc-export', 'click', () => this.exporterRecapCases());
      on('rc-import-btn', 'click', () => document.getElementById('rc-import').click());
      on('rc-import', 'change', e => this.importerRecapCases(e));
      on('rc-filtre', 'input', e => { this.rcFiltre = e.target.value.trim().toLowerCase(); this.rendreRecapCases(this.resultat || {}); });

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

    /* Une case hors chemin : une plonge, une mise à disposition, ou une case
     * qu'on rattachera ensuite. Elle s'ouvre ici, dans la liste. */
    creer(dans) {
      const services = this.a.services();
      // Depuis la page d'un service : la case naît dans ce service, et la liste
      // des cases se resserre sur lui.
      if (dans) this.filtre = dans;
      const service = dans || this.filtre || ((services.find(s => P.BAREME_DEMO[s.id]) || services[0] || {}).id);
      const nom = (services.find(s => s.id === service) || {}).nom || 'Case';
      // Dans le handling, la case née est un handling : elle charge des vols.
      // Seulement quand on la crée DANS ce service (page Services) : une case
      // neuve sans service choisi reste une équipe qui prépare.
      const atelier = dans === 'handling' ? PC.caseHandling(this.state, service, nom)
        : dans && PC.SERVICES_DISPO.includes(dans) ? PC.caseDispo(this.state, service, nom)
        : { id: uid(), nom: PC.nomLibre(this.state, nom), service, type: 'manuel',
          debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [] };
      this.changer(() => this.state.ateliers.push(atelier),
        'Case créée, hors chemin. Donnez-lui son type (plonge, mise à disposition…) ; une case qui prépare se rattache à une commande dans son chemin.');
      this.ouvert = atelier.id; this.rendre();
    }

    /* Le handling en un geste : sa case, et au bout de chaque chemin. */
    brancherHandling() {
      const nom = (this.a.services().find(s => s.id === 'handling') || {}).nom || 'Handling';
      let r;
      this.changer(() => { r = PC.brancherHandling(this.state, 'handling', nom, this.servicesHandling()); }, 'Handling en place.');
      return r;
    }

    /* Les services de handling : celui du plan, et ceux créés sous ce nom. */
    servicesHandling() {
      return ['handling'].concat(this.a.services().filter(s => s.id !== 'handling' && /handling/i.test(s.nom)).map(s => s.id));
    }

    /* Les cases de handling d'avant, une par commande. */
    anciensHandlings() { return PC.anciensHandlings(this.state, this.servicesHandling()); }

    /* Un poste de mise à disposition, une case : fond les cases d'avant. */
    fondreDispos(etat) {
      return PC.partagerDispos(etat, id => (this.a.services().find(x => x.id === id) || {}).nom || id);
    }
    messageFonte(r) {
      const noms = r.services.map(id => (this.a.services().find(x => x.id === id) || {}).nom || id).join(', ');
      return noms + ' : ' + r.converties + (r.converties > 1 ? ' cases deviennent ' : ' case devient ')
        + (r.services.length > 1 ? 'une case par poste' : 'une seule case') + ', partagée par toutes les commandes ; leurs heures sont ses vagues.';
    }

    /* Une case se règle dans le chemin d'une de ses commandes, sous son service.
     * Une plonge ou une mise à disposition sert tout le monde : on prend la
     * première commande dont le chemin passe par son service. Sans chemin qui
     * passe par elle, elle se règle sur place. */
    ouvrirFiche(id) {
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return false;
      const passe = c => { const p = PC.cheminDe(this.state, c); return !!p && P.servicesDuParcours(p).includes(a.service); };
      const cmd = [...new Set((a.lots || []).flat())].find(passe) || this.classes.map(c => c.id).find(passe);
      if (!cmd) return false;
      this.parcours.ouvrir(cmd, a.service);
      return true;
    }

    /* La fiche d'une case, ouverte, pour le panneau du chemin. */
    ficheCase(id, cmd) {
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return '';
      const calc = ((this.resultat || {}).ateliers || []).find(x => x.id === id);
      return this.carte(a, calc, { cmd });
    }

    action(quoi, id, data) {
      const a = this.state.ateliers.find(x => x.id === id);
      switch (quoi) {
        case 'handling-convertir': {
          const r = this.brancherHandling();
          if (r) this.rendre(r.converties + (r.converties > 1 ? ' cases de handling deviennent' : ' case de handling devient')
            + ' une seule case Handling, qui charge les vols' + (r.chemins ? ' ; ajoutée à ' + r.chemins + (r.chemins > 1 ? ' autres chemins.' : ' autre chemin.') : '.'));
          return;
        }
        case 'chemin': return this.parcours.ouvrir(data.classe, a ? a.service : '');
        // Dans la liste des cases : aller la régler dans un chemin ; faute de
        // chemin qui passe par elle, elle se déplie sur place.
        case 'ouvrir':
          if (this.ouvert !== id && this.ouvrirFiche(id)) return;
          this.ouvert = this.ouvert === id ? null : id; return this.rendre();
        // Rien à valider : la saisie est enregistrée à chaque frappe. Le bouton
        // referme la fiche et le dit — sans lui, on cherche un « créer »
        // qui n'existe pas et on doute que l'atelier existe.
        case 'fermer':
          this.ouvert = null;
          return this.rendre('« ' + a.nom + ' » enregistré.');
        case 'supprimer':
          if (!confirm('Supprimer la case « ' + a.nom + ' » ? Ses commandes sauteront cette étape jusqu’à ce qu’on leur en donne une autre. L’action est annulable.')) return;
          return this.changer(() => { this.state.ateliers = this.state.ateliers.filter(x => x.id !== id); }, 'Case « ' + a.nom + ' » supprimée.');
        case 'dupliquer':
          return this.changer(() => {
            const c = clone(a); c.id = uid(); c.nom = (a.nom + ' (2)').slice(0, 160);
            this.state.ateliers.splice(this.state.ateliers.indexOf(a) + 1, 0, c);
          }, 'Équipe dupliquée.');
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
        case 'vague-ajouter':
          return this.changer(() => {
            const d = a.vagues[a.vagues.length - 1] || { debut: '06:00', jour: 0 };
            const t = Math.min(23 * 60 + 59, P.minutes(d.debut) + 6 * 60);
            a.vagues.push({ debut: String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), jour: d.jour || 0 });
          }, 'Vague ajoutée : chaque commande prend la vague qui précède son besoin.');
        case 'vague-retirer':
          return this.changer(() => { if (a.vagues.length > 1) a.vagues.splice(+data.index, 1); }, 'Vague retirée.');
        case 'separer': {
          const sv = data.service, nomSv = (this.a.services().find(x => x.id === sv) || {}).nom || sv;
          let n = 0;
          this.changer(() => { n = PC.separerParCommande(this.state, sv, nomSv, this.classes); }, '');
          return this.rendre(nomSv + ' : ' + n + (n > 1 ? ' cases, une par commande' : ' case') + ', à l’heure de sa première vague. '
            + 'Reprenez leurs effectifs et leurs heures (ou réimportez vos horaires : ⇧ Importer). « Annuler » revient en arrière.');
        }
        case 'avant-fonte': {
          let copie = null;
          try { copie = JSON.parse(localStorage.getItem(CLE + '-avant-fonte') || 'null'); } catch (e) { copie = null; }
          if (!copie || !copie.etat) return this.rendre('Aucune copie d’avant la fusion.');
          if (!confirm('Remplacer les cases et les chemins par ceux d’avant la fusion (' + String(copie.le || '').slice(0, 16).replace('T', ' ') + ') ? L’action est annulable.')) return;
          this.changer(() => { this.state = valider(copie.etat); }, 'Organisation d’avant la fusion rétablie. La légumerie et le magasin ne sont plus fondus : '
            + 'utilisez « Passer à une case partagée » dans les points à regarder, si besoin.');
          try { localStorage.removeItem(CLE + '-avant-fonte'); } catch (e) { /* rien */ }
          return this.rendre();
        }
        case 'oublier-copie':
          try { localStorage.removeItem(CLE + '-avant-fonte'); } catch (e) { /* rien */ }
          return this.rendre('Copie d’avant la fusion oubliée.');
        case 'dispo-partager': {
          let r;
          this.changer(() => { r = this.fondreDispos(this.state); }, '');
          if (r) this.rendre(this.messageFonte(r));
          return;
        }
        case 'duree-retirer':
          return this.changer(() => { const d = { ...(a.durees || {}) }; delete d[data.cie]; a.durees = d; },
            'Durée retirée : ' + data.cie + ' prend la durée de toutes les compagnies.');
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
          const { cabine } = data || {};
          if (m.unites[cabine]) m.unites[cabine].parVol = Math.max(0, parseFloat(v) || 0);
        }
        if (champ === 'mat-stock') m.stockInitial = Math.max(0, parseInt(v, 10) || 0);
        if (champ === 'mat-delai') m.delaiRetour = Math.max(0, parseInt(v, 10) || 0);
      }, champ === 'mat-actif'
        ? (v ? 'Le compte du matériel est tenu : déclarez la plonge et les équipes qui en emportent.'
             : 'Compte du matériel abandonné.')
        : 'Enregistré.');
    }

    appliquerSaisie(champ, a, el, v) {
      this.changer(() => {
        switch (champ) {
          case 'nom': {
            // Le nom est la clé des classeurs Excel : deux cases ne le partagent pas.
            const pris = this.state.ateliers.some(x => x !== a && String(x.nom).trim().toUpperCase() === String(v).trim().toUpperCase());
            if (pris) throw new Error('le nom « ' + v + ' » est déjà celui d’une autre case (le nom sert de clé dans Excel).');
            a.nom = v; break;
          }
          // Les man-minutes d'une commande dans cette case ; vide = celles de l'import.
          case 'minutes': {
            const cls = el.dataset.classe, m = { ...(a.minutes || {}) };
            if (v === '' || !Number.isFinite(+v)) delete m[cls]; else m[cls] = Math.max(0, +v);
            if (Object.keys(m).length) a.minutes = m; else delete a.minutes;
            break;
          }
          case 'service': {
            // Un nom par défaut (« Cuisine TX BC ») suit le service ; un nom choisi reste.
            const nomDe = id => (this.a.services().find(x => x.id === id) || {}).nom || id;
            const ancien = nomDe(a.service);
            if (a.nom === ancien || a.nom.startsWith(ancien + ' ')) a.nom = PC.nomLibre(this.state, nomDe(v) + a.nom.slice(ancien.length));
            a.service = v; break;
          }
          case 'debut': a.debut = v; break;
          case 'jour': a.jour = a.type === 'handling' ? 0 : parseInt(v, 10) || 0; break;
          case 'personnes': a.personnes = Math.max(0, parseInt(v, 10) || 0); break;
          case 'debit': a.debit = Math.max(1, parseFloat(v) || 1); break;
          // Le débit d'une commande sur ce robot ; vide = celui du robot.
          case 'debit-cmd': {
            const cls = el.dataset.classe, d = { ...(a.debits || {}) };
            if (v === '' || !(+v > 0)) delete d[cls]; else d[cls] = +v;
            if (Object.keys(d).length) a.debits = d; else delete a.debits;
            break;
          }
          case 'personnesMin': a.personnesMin = Math.max(0, parseInt(v, 10) || 0); break;
          case 'type':
            a.type = v;
            if (v === 'handling') { a.jour = 0; delete a.debit; delete a.personnesMin; delete a.tunnels; delete a.minutes; delete a.materiel; a.lots = []; Object.assign(a, handlingDe(a)); break; }
            delete a.durees; delete a.simultanes; delete a.avance; delete a.compagnies;
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
          // Les vagues d'une mise à disposition : l'heure et le jour de chacune.
          case 'vague-debut': a.vagues[+el.dataset.index].debut = v; break;
          case 'vague-jour': a.vagues[+el.dataset.index].jour = parseInt(v, 10) || 0; break;
          case 'simultanes': a.simultanes = Math.max(1, Math.min(50, parseInt(v, 10) || 1)); break;
          // Saisi en heures, gardé en minutes.
          case 'avance': a.avance = Math.max(0, Math.min(1440, Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 60))); break;
          case 'compagnies': a.compagnies = [...new Set(String(v).split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean))].slice(0, 100); break;
          case 'duree': {
            const cie = el.dataset.cie, d = { ...(a.durees || {}) };
            if (v === '' || !Number.isFinite(+v)) { if (cie !== P.TOUTES) delete d[cie]; } else d[cie] = Math.max(0, Math.min(1440, +v));
            a.durees = d; break;
          }
          case 'duree-nouvelle':
            if (v) a.durees = { ...(a.durees || {}), [v]: (a.durees || {})[P.TOUTES] ?? 30 };
            el.value = '';
            break;
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
        ? id + ' retirée — ' + lots + (lots > 1 ? ' préparations chez ' : ' préparation chez ') + touches.map(a => a.nom).join(', ')
            + (vides ? ', dont ' + vides + (vides > 1 ? ' vidées et supprimées' : ' vidée et supprimée') : '') + '.'
        : id + ' retirée : aucune équipe ne la préparait.';
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
        return this.rendre(P.libelleClasse(id) + ' est déjà ajouté.');
      const connue = this.classes.some(c => c.id === id && c.origine === 'programme');
      this.ajout = null;
      this.changer(() => {
        this.state.exclues = (this.state.exclues || []).filter(x => x !== id);
        this.state.ajoutees = [...(this.state.ajoutees || []), brouillon];
      }, P.libelleClasse(id) + (connue
        ? ' était déjà dans les vols : ce sont leurs chiffres qui comptent.'
        : ' ajouté. Ses passagers viendront de l’import des vols.'));
    }

    /* Le classeur Excel : c'est lui qu'on modifie hors du site, puis qu'on
     * réimporte. Le format est décrit dans sa feuille « Lisez-moi » et dans
     * docs/FORMATS_EXCEL.md. */
    exporter() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      const octets = T.ecrireClasseur(E.ateliersVersClasseur(this.state,
        { services: this.a.services(), classes: this.classes, resultat: this.resultat }));
      T.telecharger('ory-ateliers-' + new Date().toISOString().slice(0, 10) + '.xlsx', octets);
      this.rendre('Classeur exporté : modifiez-le dans Excel, puis « Importer ».');
    }

    /** Juste les heures de début : le fichier qu'on retouche le plus souvent. */
    exporterHoraires() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      if (!this.state.ateliers.length) return this.rendre('Aucune case encore : créez les chemins, les horaires suivront.');
      const octets = T.ecrireClasseur(E.horairesVersClasseur(this.state,
        { services: this.a.services(), resultat: this.resultat }));
      T.telecharger('ory-horaires-' + new Date().toISOString().slice(0, 10) + '.xlsx', octets);
      this.rendre('Horaires exportés : changez les heures dans Excel, puis « Importer ».');
    }

    async importer(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        let etat, ajouts = [];
        if (/\.json$/i.test(f.name)) {
          // L'ancien format d'échange reste lu : une sauvegarde d'hier s'ouvre.
          if (f.size > 4 * 1024 * 1024) throw new Error('Fichier trop grand.');
          etat = valider(JSON.parse(await f.text()));
          this.fondreDispos(etat); etat = valider(etat);
        } else {
          const E = root.OrlyEchanges, T = root.OrlyTableur;
          const feuilles = await T.lireFichier(f, 8 * 1024 * 1024);
          // Un classeur d'horaires seuls ne remplace rien : il décale des équipes.
          if (E.estClasseurHoraires(feuilles)) return this.importerHoraires(E.classeurVersHoraires(feuilles, this.state));
          const r = E.classeurVersAteliers(feuilles, this.state,
            { services: this.a.services(), programme: this.a.classes() || [] });
          etat = valider(r.etat); ajouts = r.ajouteesAuto;
          this.fondreDispos(etat); etat = valider(etat);
        }
        if (!confirm('Remplacer les cases et les chemins par ceux du fichier (' + etat.ateliers.length + (etat.ateliers.length > 1 ? ' cases' : ' case') + ') ? L’action est annulable.')) return;
        this.changer(() => { this.state = etat; }, 'Cases importées : ' + etat.ateliers.length + (etat.ateliers.length > 1 ? ' cases.' : ' case.')
          + (ajouts.length ? (ajouts.length > 1 ? ' Commandes ajoutées : ' : ' Commande ajoutée : ') + ajouts.join(', ') + '.' : ''));
      } catch (err) { this.rendre('Import refusé — ' + err.message); }
      finally { e.target.value = ''; }
    }

    importerHoraires({ etat, changes }) {
      if (!changes.length) return this.rendre('Horaires lus : aucune heure ne change.');
      const liste = changes.slice(0, 6).join(', ') + (changes.length > 6 ? '…' : '');
      if (!confirm('Changer l’heure de début de ' + changes.length + (changes.length > 1 ? ' cases' : ' case') + ' (' + liste + ') ? Rien d’autre ne change. L’action est annulable.')) return;
      this.changer(() => { this.state = valider(etat); },
        'Horaires importés : ' + changes.length + (changes.length > 1 ? ' cases décalées' : ' case décalée') + ' (' + liste + ').');
    }

    /* ---- rendu ------------------------------------------------------- */

    rendre(message) {
      if (message !== undefined) document.getElementById('at-status').textContent = message || '';
      const r = this.calculer();
      this.rendreIndicateurs(r);
      this.rendreAnomalies(r);
      this.rendreFiltre();
      // Seul l'onglet affiché se redessine : à deux cents commandes, la liste
      // des cases, le planning, les commandes et le tableau coûtent cher, et
      // personne ne les regarde. Les autres attendent qu'on les ouvre.
      this.aDessiner = new Set(['at-equipes', 'at-planning', 'at-repas', 'at-grille', 'at-recap']);
      const visible = this.ongletVisible();
      if (visible !== 'at-grille') this.parcours.rendre();
      this.surOnglet(visible);
      for (const id of ['at-undo', 'rc-undo']) document.getElementById(id).disabled = !this.undo.length;
      for (const id of ['at-redo', 'rc-redo']) document.getElementById(id).disabled = !this.redo.length;
      if (this.a.change) this.a.change(r);
    }

    /** L'onglet affiché de la vue, ou rien quand la vue est cachée. */
    ongletVisible() {
      const b = document.body;
      return b.dataset.vue === 'ateliers' ? b.dataset.sous || null : null;
    }

    /** Un onglet s'ouvre : on dessine ce qu'il montre, s'il a changé depuis. */
    surOnglet(id) {
      const r = this.resultat; if (!r || !this.aDessiner) return;
      // Le tableau a pu être remplacé par sa place vide en redessinant les chemins.
      if (id === 'at-grille' && document.querySelector('#at-parcours .qf[data-a-dessiner]')) this.aDessiner.add(id);
      if (!this.aDessiner.has(id)) return;
      this.aDessiner.delete(id);
      if (id === 'at-equipes') { this.rendreMateriel(r); this.rendreListe(r); }
      if (id === 'at-planning') this.rendrePlanning(r);
      if (id === 'at-repas') this.rendreClasses(r);
      if (id === 'at-recap') this.rendreRecapCases(r);
      if (id === 'at-grille') this.parcours.rendre();
    }

    /* Les indicateurs vivent à un seul endroit, « La journée › Les chiffres ».
     * Ici, une phrase les résume, avec les mêmes mots et le même moment
     * (la journée entière), et un lien y mène. */
    rendreIndicateurs(r) {
      const i = r.indicateurs || {};
      const pl = (n, s, p) => n + ' ' + (n > 1 ? p : s);
      const box = document.getElementById('at-indicateurs');
      if (!r.ok || !i.classesSuivies && !i.classesAbsentes) { box.innerHTML = ''; return; }
      const retard = (i.classesSuivies || 0) - (i.aHeure || 0);
      box.innerHTML = '<p class="at-resume"><b>Sur la journée :</b> '
        + pl(i.aHeure || 0, 'commande prête', 'commandes prêtes') + ' à l’heure sur ' + (i.classesSuivies || 0)
        + (retard ? ' · <span class="at-resume-retard">' + pl(retard, 'en retard', 'en retard') + '</span>' : '')
        + (i.classesAbsentes ? ' · ' + pl(i.classesAbsentes, 'commande', 'commandes') + ' sans équipe' : '')
        + (Number.isFinite(i.finDerniere) ? ' · dernière prête à ' + P.hhmm(i.finDerniere) : '')
        + (i.volsSuivis ? ' · <b>' + pl(i.volsAHeure, 'vol chargé', 'vols chargés') + ' à l’heure sur ' + i.volsSuivis + '</b>'
          + (i.volsSuivis - i.volsCharges ? ' · <span class="at-resume-retard">' + pl(i.volsSuivis - i.volsCharges, 'vol non chargé', 'vols non chargés') + '</span>' : '') : '')
        + ' <button class="lien-discret" data-aller="plan" data-onglet="j-chiffres">Les chiffres de la journée →</button></p>';
    }

    rendreAnomalies(r) {
      const box = document.getElementById('at-anomalies');
      // Une étape de parcours sans équipe se lit mieux dans le tableau « Qui
      // fabrique quoi » (ses cases « à choisir ») qu'en une phrase par service.
      const trous = (r.anomalies || []).filter(a => a.code === 'parcours-trou');
      const list = (r.anomalies || []).filter(a => a.code !== 'parcours-trou').map(a => esc(a.message));
      if (trous.length) {
        // Des commandes déjà commencées dont une étape n'a personne : elle est
        // sautée. Ce n'est pas le compte des cases vides du tableau (celles
        // des commandes pas encore commencées) : on le dit autrement.
        const cmd = new Set(trous.flatMap(a => a.classes || [])).size;
        list.push((cmd > 1 ? cmd + ' commandes commencées sautent' : '1 commande commencée saute') + ' une étape sans équipe ('
          + trous.map(a => esc((this.a.services().find(x => x.id === a.service) || {}).nom || a.service)).join(', ') + ') : à compléter dans l’onglet « Qui prépare quoi ».');
      }
      // Des cases de handling d'avant (une par commande) : le handling travaille
      // désormais par vol. On le dit en tête, avec le geste qui convertit.
      const vieilles = this.anciensHandlings();
      if (vieilles.length) list.unshift('<b>Handling : ' + vieilles.length + (vieilles.length > 1 ? ' cases le préparent' : ' case le prépare')
        + ' commande par commande (ancienne logique).</b> Le handling travaille par vol : il réunit les classes de chaque vol et le charge, le jour J. '
        + '<button class="btn btn-sm btn-play" data-at-action="handling-convertir">Passer au handling par vol</button>');
      const dispos = PC.anciensDispos(this.state);
      if (dispos.length) {
        const noms = [...new Set(dispos.map(a => (this.a.services().find(x => x.id === a.service) || {}).nom || a.service))];
        list.unshift('<b>' + esc(noms.join(', ')) + ' : ' + dispos.length + (dispos.length > 1 ? ' cases préparent' : ' case prépare')
          + ' commande par commande.</b> Ces postes travaillent pour toutes les commandes à la fois, par vagues : '
          + (dispos.length > 1 ? 'elles deviennent' : 'elle devient') + ' une seule case par poste, et leurs heures de début deviennent ses vagues. '
          + '<button class="btn btn-sm btn-play" data-at-action="dispo-partager">Passer à une case partagée</button>');
      }
      // Un service qui prépare commande par commande (la cuisine…) remplacé par
      // une mise à disposition : on propose de lui rendre une case par commande.
      const remplaces = [...new Set(this.state.ateliers.filter(a => a.type === 'dispo' && !PC.SERVICES_DISPO.includes(a.service)).map(a => a.service))]
        .filter(sv => (r.classes || []).filter(c => (c.vols || []).length).some(c => {
          const p = PC.cheminDe(this.state, c.id) || (this.state.parcours || []).find(q => q.id === (this.state.parcoursCabine || {})[c.cabine]);
          return p && P.servicesDuParcours(p).includes(sv);
        }));
      for (const sv of remplaces) {
        const nomSv = (this.a.services().find(x => x.id === sv) || {}).nom || sv;
        list.unshift('<b>« ' + esc(nomSv) + ' » est une mise à disposition</b> : elle sert toutes les commandes à la fois, comme la légumerie. '
          + 'Si ce service prépare commande par commande, rendez-lui une case par commande. '
          + '<button class="btn btn-sm btn-play" data-at-action="separer" data-service="' + esc(sv) + '">Une case par commande dans ' + esc(nomSv) + '</button>');
      }
      let copie = null;
      try { copie = JSON.parse(localStorage.getItem(CLE + '-avant-fonte') || 'null'); } catch (e) { copie = null; }
      if (copie && copie.etat) {
        list.push('Une copie de l’organisation d’avant la fusion (légumerie, magasin…) est gardée dans ce navigateur. '
          + '<button class="btn btn-sm" data-at-action="avant-fonte">Revenir à l’organisation d’avant la fusion</button> '
          + '<button class="lien-discret" data-at-action="oublier-copie">Oublier cette copie</button>');
      }
      box.hidden = !list.length;
      if (vieilles.length || dispos.length || remplaces.length) box.open = true;
      // Replié par défaut : le nombre suffit à savoir qu'il y a à faire.
      box.innerHTML = list.length
        ? '<summary><strong>' + list.length + (list.length > 1 ? ' points' : ' point') + ' à regarder</strong></summary><ul>' +
          list.map(m => '<li>' + m + '</li>').join('') + '</ul>'
        : '';
    }

    rendreFiltre() {
      const sel = document.getElementById('at-filtre');
      sel.innerHTML = '<option value="">Tous les services</option>' +
        this.a.services().map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('');
      sel.value = this.filtre || '';
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
    <span><strong>Matériel en boucle</strong> — ce qui part revient.<details class="aide">
      <summary aria-label="Comment la boucle du matériel fonctionne">?</summary>
      <span class="aide-corps">Un départ l’emporte, un retour le ramène sale, la plonge le rend
        propre, un départ le remporte. Un seul compte pour tout le matériel, non calibré : un
        trolley de CRL et un trolley d’AF ne s’y distinguent pas.</span></details></span></label>
  ${m.actif ? `<div class="at-mat-champs">
    <label>Propre à l'ouverture<input type="number" min="0" value="${m.stockInitial}" data-at-champ="mat-stock"></label>
    <label>Délai après atterrissage (min)<input type="number" min="0" value="${m.delaiRetour}" data-at-champ="mat-delai"></label>
  </div>
  <div class="mini-note">Ce qu’un vol emporte, classe par classe présente à bord.<details class="aide">
    <summary aria-label="Pourquoi par vol ?">?</summary>
    <span class="aide-corps">Un trolley part avec l’avion : sa quantité ne bouge pas parce que la
      cabine est à moitié vide. Un vol retour ramène la même quantité, classe par classe.</span></details></div>
  <table class="at-mat-table"><thead><tr><th scope="col">Classe</th>
    <th scope="col">unités / vol</th></tr></thead><tbody>
    ${P.CABINES.map(c => `<tr><th scope="row" title="${esc((P.NOM_CABINE || {})[c] || c)}">${c}</th>
      <td><input type="number" min="0" step="1"
        value="${(m.unites[c] || {}).parVol || 0}" data-at-champ="mat-unite"
        data-cabine="${c}" data-part="parVol" aria-label="${c} : unités par vol"></td>
    </tr>`).join('')}
  </tbody></table>` : ''}
  ${m.actif && bilan ? `<div class="at-mat-bilan">
    ${chiffre('Revenu des vols', bilan.entrees + ' u')}
    ${chiffre('Lavé', bilan.lavees + ' u', bilan.resteSale ? bilan.resteSale + ' u sales non lavées' : '')}
    ${chiffre('Emporté', bilan.consommees + ' u')}
    ${chiffre('Reste propre', bilan.restePropre + ' u', bilan.restePropre ? 'disponible demain' : 'aucun amortisseur')}
    ${chiffre('Plus bas niveau', bilan.minPropre + ' u', bilan.minPropre === 0 ? 'passé par zéro' : '')}
    ${chiffre('Attente de matériel', Math.round(bilan.attente) + ' min', bilan.enAttente ? bilan.enAttente + (bilan.enAttente > 1 ? ' préparations jamais servies' : ' préparation jamais servie') : '')}
  </div>` : ''}
</section>`;
    }

    /* La liste des cases, calculée : chacune dit ses commandes dans l'ordre ;
     * une commande mène à son chemin, où la case se règle. */
    rendreListe(r) {
      const services = this.a.services();
      const nom = id => (services.find(s => s.id === id) || {}).nom || id;
      const parAtelier = new Map(((r && r.ateliers) || []).map(a => [a.id, a]));
      const montrer = this.filtre ? this.state.ateliers.filter(a => a.service === this.filtre) : this.state.ateliers;
      const box = document.getElementById('at-liste');
      if (!montrer.length) {
        box.innerHTML = '<p class="at-vide">Aucune case' + (this.filtre ? ' dans ' + esc(nom(this.filtre)) : '')
          + '. Les cases se créent dans « Les chemins » : choisissez une commande, puis cliquez un service de son chemin.'
          + ' <button class="lien-discret" data-aller="ateliers" data-onglet="at-chemins">Ouvrir « Les chemins » →</button></p>';
        return;
      }
      const groupes = {};
      for (const a of montrer) (groupes[a.service] || (groupes[a.service] = [])).push(a);
      const rang = s => services.findIndex(x => x.id === s);
      const I = root.OrlyIcones;
      box.innerHTML = Object.keys(groupes).sort((x, y) => rang(x) - rang(y)).map(service => {
        const cartes = groupes[service].map(a => this.carte(a, parAtelier.get(a.id))).join('');
        return `<section class="at-service"><h3><span class="at-service-nom">${I ? I.ico(I.icoService(service, nom(service))) : ''}${esc(nom(service))}</span>
          <span>${groupes[service].length}</span></h3>${cartes}</section>`;
      }).join('');
    }

    /* Une case. Dans la liste : son résumé, et ses commandes qui mènent à leur
     * chemin. Dans un chemin (`o.cmd`, la commande qu'on y regarde) : sa fiche
     * complète, ouverte. */
    carte(a, calcul, o = {}) {
      const dansChemin = o.cmd !== undefined;
      const ouvert = dansChemin || this.ouvert === a.id;
      const dispo = a.type === 'dispo';
      const fin = calcul && calcul.fin != null ? P.hhmm(calcul.fin) : '—';
      const attente = calcul && calcul.attente ? ' · ' + Math.round(calcul.attente) + ' min d’attente' : '';
      const jour = a.jour ? ' (J' + a.jour + ')' : '';
      // Ses commandes dans l'ordre ; chacune ouvre son chemin sur cette case.
      const handling = a.type === 'handling';
      const nVols = handling && calcul ? calcul.lots.filter(l => l.vol).length : 0;
      const resume = dispo ? 'sert toutes les commandes à la fois'
        : a.type === 'lavage' ? 'lave pour toutes les commandes'
        : handling ? 'charge les vols dans l’ordre des départs' + (nVols ? ' · ' + nVols + ' vol' + (nVols > 1 ? 's' : '') : '')
        : !a.lots.length ? 'rattachée à aucune commande'
        : a.lots.map(l => l.map(c => `<button class="at-cmd-chip" data-at-action="chemin" data-classe="${esc(c)}"
            title="Ouvrir le chemin de ${esc(P.libelleClasse(c))}">${esc(PC.etiquette(c))}</button>`).join(' + ')).join(' <span aria-hidden="true">→</span> ');
      // Une mise à disposition n'a ni effectif ni heure de fin : son en-tête
      // dirait trois fois « — ». Elle dit ce qu'elle est.
      const sous = dispo
        ? (a.permanent === false ? (a.vagues.length > 1 ? a.vagues.length + ' vagues : ' : 'une vague : ')
            + a.vagues.map(v => (v.jour ? 'J' + v.jour + ' ' : '') + v.debut).map(esc).join(' · ') : 'disponible en permanence')
        : esc(a.debut) + jour + ' · ' + a.personnes + ' pers.'
          + (a.type === 'robot' ? ' · robot ' + a.debit + ' pl/h' : a.type === 'lavage' ? ' · ' + P.debitLavage(a) + ' u/h'
            : handling ? ' · ' + a.simultanes + ' vol' + (a.simultanes > 1 ? 's' : '') + ' à la fois' : '')
          + ' → fin ' + esc(fin) + esc(attente);

      const entete = dansChemin
        ? `<div class="at-carte-tete"><div class="at-carte-nom fixe"><strong>Case « ${esc(a.nom)} »</strong><span>${sous}</span></div></div>`
        : `<div class="at-carte-tete">
        <button class="at-carte-nom" data-at-action="ouvrir" aria-expanded="${ouvert}" title="La régler dans le chemin d’une de ses commandes">
          <strong>${esc(a.nom)}</strong>
          <span>${sous}</span>
        </button>
        <span class="at-resume">${resume}</span>
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
        .map(c => `<option value="${esc(c.id)}">${esc(P.libelleClasse(c.id))} · ${c.vols.length} vol${c.vols.length > 1 ? 's' : ''}</option>`).join('');

      // Les man-minutes de chaque commande : celles de l'import, sauf si la case
      // en fixe d'autres (pour elle seule).
      const bareme = (this.a.reglages ? this.a.reglages() : {}).bareme;
      const importees = c => { const k = this.classes.find(x => x.id === c); return k ? Math.round(P.travailClasse(a.service, k, bareme) * 10) / 10 : 0; };
      const mm = c => {
        const imp = importees(c), propre = (a.minutes || {})[c];
        return `<label class="at-mm" title="Man-minutes de ${esc(P.libelleClasse(c))} dans cette case. Vide : celles de l’import (${imp}).">
          <input type="number" min="0" step="1" value="${propre ?? ''}" placeholder="${imp}" data-at-champ="minutes" data-classe="${esc(c)}"
            aria-label="Man-minutes de ${esc(P.libelleClasse(c))} dans cette case (import : ${imp})"><span>man-min</span>${
          propre != null ? `<small class="at-mm-import">import ${imp}</small>` : ''}</label>`;
      };
      // Un robot : le débit de chaque commande, en plateaux par heure ; vide = celui du robot.
      const db = c => {
        const propre = (a.debits || {})[c];
        return `<label class="at-mm" title="Débit de ${esc(P.libelleClasse(c))} sur ce robot. Vide : celui du robot (${a.debit} pl/h).">
          <input type="number" min="1" step="10" value="${propre ?? ''}" placeholder="${a.debit}" data-at-champ="debit-cmd" data-classe="${esc(c)}"
            aria-label="Débit de ${esc(P.libelleClasse(c))} sur ce robot, en plateaux par heure (robot : ${a.debit})"><span>pl/h</span></label>`;
      };
      const lots = a.lots.map((l, i) => `
        <div class="at-lot${o.cmd && l.includes(o.cmd) ? ' ici' : ''}">
          <div class="at-lot-tete">
            <b>${i + 1}.</b>
            <span class="at-chips">${l.map(c => `<span class="at-lot-cmd"><button class="at-chip" data-at-action="classe-retirer" data-index="${i}" data-classe="${esc(c)}"
              title="Retirer ${esc(P.libelleClasse(c))} de cette case">${esc(P.libelleClasse(c))} ×</button>${a.type === 'manuel' ? mm(c) : a.type === 'robot' ? db(c) : ''}</span>`).join('') || '<em>à renseigner</em>'}</span>
            <span class="at-lot-fin">${esc(this.finLot(a.id, i))}</span>
            <button class="btn btn-sm" data-at-action="lot-monter" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Plus tôt">↑</button>
            <button class="btn btn-sm" data-at-action="lot-descendre" data-index="${i}" ${i === a.lots.length - 1 ? 'disabled' : ''} aria-label="Plus tard">↓</button>
            <button class="btn btn-sm" data-at-action="lot-retirer" data-index="${i}" aria-label="Retirer cette préparation">×</button>
          </div>
          <select class="at-lot-plus" data-at-champ="lot-ajout" data-index="${i}" aria-label="Préparer autre chose en même temps que la ligne ${i + 1}">
            <option value="">+ préparer en même temps…</option>
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
            <option value="manuel" ${a.type === 'manuel' ? 'selected' : ''}>Équipe qui prépare</option>
            <option value="robot" ${a.type === 'robot' ? 'selected' : ''}>Robot</option>
            <option value="lavage" ${a.type === 'lavage' ? 'selected' : ''}>Lavage (plonge)</option>
            <option value="dispo" ${dispo ? 'selected' : ''}>Mise à disposition</option>
            <option value="handling" ${handling ? 'selected' : ''}>Handling (par vol)</option></select></label>
          ${dispo ? '' : `
          <label>Arrive à<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          ${handling ? `<label>Jour<input value="Jour J des vols" disabled title="Le handling travaille le jour des vols, jamais la veille"></label>`
            : `<label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>`}
          <label>Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>`}
          ${a.type === 'robot' ? `
          <label>Débit du robot (plateaux/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"
            title="Le débit des commandes qui n’ont pas le leur (réglable à côté de chaque commande)"></label>
          <label>Personnes minimum<input type="number" min="0" value="${a.personnesMin}" data-at-champ="personnesMin"></label>` : ''}
        </div>
        ${dispo ? `
        <p class="mini-note at-regle">Ce service <b>ne prépare pas une commande après l’autre</b> : il travaille pour
          <b>toutes les commandes à la fois</b> (légumerie, magasin, réception…), <b>par vagues</b>. Chaque commande prend
          la vague qui précède son besoin ; avant la première, on l’attend. Ni effectif, ni man-minutes, ni durée.
          Sur chaque chemin, une seule question : « Besoin de ${esc((services.find(x => x.id === a.service) || {}).nom || a.service)} ? ».</p>
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="permanent" ${a.permanent !== false ? 'checked' : ''}>
            Disponible en permanence — personne ne l’attend</label>
          ${a.permanent === false ? `<div class="at-sous-titre">Vagues</div>
          ${a.vagues.map((v, i) => `<div class="at-pause at-vague">
            <b>${i + 1}.</b>
            <label>À<input type="time" value="${esc(v.debut)}" data-at-champ="vague-debut" data-index="${i}"></label>
            <label>Jour<select data-at-champ="vague-jour" data-index="${i}">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === (v.jour || 0) ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
            <span class="mini-note">${esc(this.servisParVague(a.id, i))}</span>
            ${a.vagues.length > 1 ? `<button class="btn btn-sm" data-at-action="vague-retirer" data-index="${i}">Retirer</button>` : ''}
          </div>`).join('')}
          <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="vague-ajouter">+ Vague</button></div>` : ''}
        </div>` : `
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="regime" ${a.regime.actif ? 'checked' : ''}>
            Poste avec pauses — 15 min après 3 h, 30 min après 6 h</label>
          ${a.regime.actif ? `<label class="at-presence">Présence (min)<input type="number" min="30" max="1440"
            value="${a.regime.presence ?? ''}" placeholder="${defaut.presence}" data-at-champ="presence"></label>
            <span class="mini-note">${a.regime.presence === undefined
              ? 'réglage général · ' + defaut.presence + ' min' : 'propre à cette équipe'}
              — soit ${String(Math.round(((a.regime.presence ?? defaut.presence) - defaut.arret) / 6) / 10).replace('.', ',')} h de travail</span>` : ''}
          ${a.type !== 'lavage' && !handling && this.state.materiel.actif ? `<label class="chk chk-mini"><input type="checkbox" data-at-champ="consomme"
            ${a.materiel === 'consomme' ? 'checked' : ''}>
            Emporte du matériel propre (trolleys, porcelaine)</label>` : ''}
        </div>`}

        ${dispo ? '' : handling ? this.ficheHandling(a) : a.type === 'lavage' ? `
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
          <span class="at-tunnel-total">${etatTunnels.tournent.length} ${etatTunnels.tournent.length > 1 ? 'tunnels' : 'tunnel'} sur ${a.tunnels.length}${
            etatTunnels.sansPersonne.length ? ' · ' + etatTunnels.sansPersonne.length + ' sans personnel' : ''}${
            etatTunnels.reste ? ' · ' + etatTunnels.reste + (etatTunnels.reste > 1 ? ' personnes disponibles' : ' personne disponible') : ''}</span>
        </div>
        <div class="mini-note at-tunnel-note">Deux limites, et c’est la plus basse qui compte.${
          etatTunnels.bride ? ' <b class="at-danger">Ici, c’est le plafond.</b>' : ''}<details class="aide">
          <summary aria-label="Quelles limites et pourquoi">?</summary>
          <span class="aide-corps">
            <p>Un tunnel ne tourne que si l’équipe a les gens pour le tenir. Ils sont servis
              <b>dans l’ordre de la liste</b> : mettez en tête ceux qu’on allume d’abord.</p>
            <p>Et l’ensemble ne dépasse pas son plafond, quoi qu’on ajoute : le côté sale, le
              séchage et le retour des paniers sont partagés entre les lignes et les brident
              toutes.</p>
          </span></details></div>
        <p class="mini-note at-lavage-note">Cette équipe ne prépare pas de commande : son travail vient des retours de vols, à mesure qu’ils arrivent.</p>` : `
        <div class="at-sous-titre">Ce que cette case prépare, dans l’ordre</div>
        <p class="mini-note at-regle">Une ligne = une préparation. Plusieurs sur la même ligne sortent <b>ensemble</b> ;
          sur deux lignes, <b>l’une après l’autre</b>. La première part à l’heure de début.</p>
        ${lots || '<p class="mini-note at-rien">Rien pour l’instant : cette case ne prépare rien.</p>'}
        <div class="at-actions-lot">
          <select class="at-ajout-lot" data-at-champ="lot-nouveau" aria-label="Ajouter une commande à préparer">
            <option value="">+ Ajouter une commande à préparer…</option>
            ${optionsDe(libres)}
          </select>
          ${a.lots.length ? '' : `<button class="btn btn-sm" data-at-action="lot-separer">Toutes les commandes, une par ligne</button>
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

        <div class="at-actions-lot at-bas">${dansChemin
          ? `<button class="btn btn-sm at-danger" data-at-action="supprimer">Supprimer la case</button>`
          : `<button class="btn btn-play btn-sm" data-at-action="fermer">Terminé</button>
          <button class="btn btn-sm at-danger" data-at-action="supprimer">Supprimer</button>`}
        </div>
      </article>`;
    }

    /* Le handling : il ne prépare pas de commande, il charge des vols. */
    ficheHandling(a) {
      const durees = a.durees || {};
      const cies = [...new Set(this.classes.map(c => c.cie))].sort();
      const propres = Object.keys(durees).filter(k => k !== P.TOUTES).sort();
      const libres = cies.filter(c => !propres.includes(c));
      const nb = cie => new Set(this.classes.filter(c => c.cie === cie).flatMap(c => c.vols.map(v => v.id))).size;
      const ligne = (cie, lib) => `<div class="at-duree">
          <span class="at-duree-cie">${esc(lib)}</span>
          <input type="number" min="0" max="1440" step="1" value="${durees[cie] ?? ''}" placeholder="${cie === P.TOUTES ? 'à saisir' : ''}"
            data-at-champ="duree" data-cie="${esc(cie)}" aria-label="Minutes par vol pour ${esc(lib)}"><span class="at-tunnel-unite">min par vol</span>
          ${cie === P.TOUTES ? '' : `<button class="btn btn-sm" data-at-action="duree-retirer" data-cie="${esc(cie)}">Retirer</button>`}
        </div>`;
      const avance = Math.round((a.avance ?? P.AVANCE_HANDLING) / 6) / 10;
      return `
        <div class="at-sous-titre">Chargement des vols</div>
        <p class="mini-note at-regle">Le handling ne prépare pas de commande : il <b>réunit les classes d’un même vol</b>
          et le charge. Il prend les vols <b>strictement dans l’ordre des départs</b> : un vol incomplet retient les suivants.
          Il travaille <b>le jour J des vols</b>, jamais la veille. Les commandes doivent être au handling au départ moins le délai
          de chargement ; le vol doit être chargé à son départ.</p>
        <div class="at-champs at-handling">
          <label>Vols en même temps<input type="number" min="1" max="50" value="${a.simultanes || 1}" data-at-champ="simultanes"
            title="Combien de vols le handling prépare à la fois (quais, camions)"></label>
          <label>Pas avant (heures avant le départ)<input type="number" min="0" max="24" step="0.5" value="${String(avance)}" data-at-champ="avance"
            title="Le handling ne commence pas un vol plus tôt que cela avant son départ"></label>
          <label>Compagnies chargées<input value="${esc((a.compagnies || []).join(', '))}" placeholder="toutes" data-at-champ="compagnies"
            title="Vide : toutes les compagnies. Sinon, par exemple : AF, TX"></label>
        </div>
        <div class="at-sous-titre">Durée d’un vol, par compagnie</div>
        ${ligne(P.TOUTES, 'Toutes les compagnies')}
        ${propres.map(c => ligne(c, c + (nb(c) ? ' · ' + nb(c) + ' vol' + (nb(c) > 1 ? 's' : '') : ''))).join('')}
        ${libres.length ? `<div class="at-actions-lot"><select data-at-champ="duree-nouvelle" aria-label="Donner une durée propre à une compagnie">
          <option value="">+ Durée propre à une compagnie…</option>
          ${libres.map(c => `<option value="${esc(c)}">${esc(c)} · ${nb(c)} vol${nb(c) > 1 ? 's' : ''}</option>`).join('')}</select></div>` : ''}
        <p class="mini-note at-tunnel-note">Une durée, pas des man-minutes : l’effectif ne la raccourcit pas.</p>`;
    }

    /* Les commandes qu'une vague a servies, d'après le dernier calcul. */
    servisParVague(atelierId, i) {
      const r = this.resultat; if (!r || !r.ok) return '';
      const a = this.state.ateliers.find(x => x.id === atelierId);
      const vs = a ? P.vaguesDe(a) : [];
      const l = (r.lots || []).find(x => x.dispo && x.atelier === atelierId && x.debut === vs[i]);
      const n = l ? l.classes.length : 0;
      return n ? 'sert ' + n + (n > 1 ? ' commandes' : ' commande') : 'ne sert aucune commande';
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

      box.innerHTML = `<svg viewBox="0 0 ${L} ${haut}" role="img" aria-label="La journée des équipes">
        ${reperes.map(t => `<g><line class="at-pl-grille" x1="${x(t)}" y1="20" x2="${x(t)}" y2="${haut}"/><text class="at-pl-heure" x="${x(t)}" y="14">${P.hhmm(t)}</text></g>`).join('')}
        ${barres}
      </svg>
      <p class="mini-note">Barre pleine : l’équipe prépare. Barre fine devant : elle attend le service d’avant.</p>`;
    }

    /* ---- couverture par classe --------------------------------------- */

    /* ---- récap des cases ---------------------------------------------- */

    /*
     * Toutes les cases d'un coup d'œil, service par service : ce que chacune
     * traite, dans l'ordre, et son heure de départ (modifiable ici). Trois
     * déroulés : une tâche unique, des lignes à la suite, et plusieurs
     * commandes sur une même ligne, préparées ensemble.
     */
    rendreRecapCases(r) {
      const box = document.getElementById('rc-liste'); if (!box) return;
      const services = this.a.services();
      const nomSvc = id => (services.find(s => s.id === id) || {}).nom || id;
      const ordre = new Map(services.map((s, i) => [s.id, i]));
      const calc = new Map(((r && r.ateliers) || []).map(a => [a.id, a]));
      const minDe = a => (a.jour || 0) * 1440 + (a.type === 'dispo' && a.permanent !== false ? -1e9 : P.minutes(a.debut || '00:00'));
      const filtre = this.rcFiltre || '';
      const cases = this.state.ateliers.slice()
        .filter(a => !filtre || (a.nom + ' ' + nomSvc(a.service) + ' ' + (a.lots || []).flat().map(c => c + ' ' + P.libelleClasse(c)).join(' ')).toLowerCase().includes(filtre))
        .sort((x, y) => (ordre.get(x.service) ?? 999) - (ordre.get(y.service) ?? 999) || minDe(x) - minDe(y) || x.nom.localeCompare(y.nom));
      if (!this.state.ateliers.length) { box.innerHTML = '<p class="mini-note">Aucune case pour l’instant : décrivez les chemins des commandes (Organisation › Chemins).</p>'; return; }
      const I = root.OrlyIcones, hh = P.hhmm;
      const jours = (v, attrs) => `<select ${attrs}>${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === (v || 0) ? 'selected' : ''}>${j === 0 ? 'J' : 'J' + j}</option>`).join('')}</select>`;
      const chip = c => `<span class="rc-cmd" title="${esc(P.libelleClasse(c))}"><span class="puce-classe" data-cab="${esc(c.slice(c.lastIndexOf('/') + 1))}"></span>${esc(PC.etiquette(c))}</span>`;
      const deroule = a => {
        if (a.type === 'dispo') return `<span class="rc-deroule dispo">${a.permanent !== false ? 'en permanence' : (a.vagues || []).length > 1 ? a.vagues.length + ' vagues' : 'une vague'}</span>`;
        if (a.type === 'lavage') return '<span class="rc-deroule autre">plonge</span>';
        if (a.type === 'handling') return '<span class="rc-deroule autre">par vol</span>';
        const lignes = (a.lots || []).filter(l => l.length), ens = lignes.filter(l => l.length > 1).length;
        if (!lignes.length) return '<span class="rc-deroule vide">rien</span>';
        return (lignes.length === 1 ? '<span class="rc-deroule unique">tâche unique</span>' : `<span class="rc-deroule suite">${lignes.length} à la suite</span>`)
          + (ens ? ` <span class="rc-ensemble-lab">${ens > 1 ? ens + ' lignes' : 'dont 1 ligne'} ensemble</span>` : '');
      };
      const traite = a => {
        const vue = calc.get(a.id) || { lots: [] };
        if (a.type === 'dispo') {
          if (a.permanent !== false) return '<span class="mini-note">sert toutes les commandes, à tout moment</span>';
          return `<span class="rc-vagues">${(a.vagues || []).map((v, i) => `<span class="rc-vague"><b>${i + 1}</b>
            ${jours(v.jour, `data-at-champ="vague-jour" data-index="${i}" aria-label="Jour de la vague ${i + 1}"`)}
            <input type="time" value="${esc(v.debut)}" data-at-champ="vague-debut" data-index="${i}" aria-label="Heure de la vague ${i + 1}"></span>`).join('')}</span>
            <span class="mini-note">sert toutes les commandes, chacune à la vague qui précède son besoin</span>`;
        }
        if (a.type === 'lavage') return `<span class="mini-note">lave les retours de vols, à mesure qu’ils arrivent · ${P.debitLavage(a)} u/h</span>`;
        if (a.type === 'handling') {
          const n = vue.lots.filter(l => l.vol).length;
          return `<span class="mini-note">charge ${n} vol${n > 1 ? 's' : ''} dans l’ordre des départs · ${a.simultanes || 1} à la fois · pas avant ${String(Math.round((a.avance ?? 180) / 6) / 10).replace('.', ',')} h avant le départ</span>`;
        }
        const lignes = (a.lots || []).filter(l => l.length);
        if (!lignes.length) return '<span class="mini-note">aucune commande : rattachez-la dans un chemin</span>';
        let k = 0;
        return `<ol class="rc-seq">${(a.lots || []).map(l => {
          if (!l.length) return '';
          const lot = vue.lots[k++];
          const quand = !lot ? '' : lot.impossible ? '<small class="rc-quand ko">ne se fait pas</small>'
            : `<small class="rc-quand">${hh(lot.debut)}–${hh(lot.fin)}${lot.attente >= 1 ? ` <span title="Attente du service d’avant">· attend ${Math.round(lot.attente)} min</span>` : ''}</small>`;
          return `<li class="${l.length > 1 ? 'ens' : ''}">${l.length > 1 ? '<span class="rc-ens-tete">ensemble</span>' : ''}<span class="rc-cmds">${l.map(chip).join('')}</span>${quand}</li>`;
        }).join('<li class="rc-fleche" aria-hidden="true">→</li>')}</ol>`;
      };
      const depart = a => {
        if (a.type === 'dispo') return '<td class="rc-jour">—</td><td class="rc-heure">—</td>';
        const jourFixe = a.type === 'handling';
        return `<td class="rc-jour">${jourFixe ? '<span title="Le handling travaille le jour J des vols">J</span>' : jours(a.jour, `data-at-champ="jour" aria-label="Jour de départ de ${esc(a.nom)}"`)}</td>
          <td class="rc-heure"><input type="time" value="${esc(a.debut)}" data-at-champ="debut" aria-label="Heure de départ de ${esc(a.nom)}"></td>`;
      };
      let service = null;
      const lignes = cases.map(a => {
        const vue = calc.get(a.id) || {};
        const tete = a.service !== service ? (service = a.service, `<tr class="rc-svc"><th colspan="6"><span>${I ? I.ico(I.icoService(a.service, nomSvc(a.service))) : ''}${esc(nomSvc(a.service))}</span>
          <small>${this.state.ateliers.filter(x => x.service === a.service).length} case${this.state.ateliers.filter(x => x.service === a.service).length > 1 ? 's' : ''}</small></th></tr>`) : '';
        return tete + `<tr data-at="${esc(a.id)}" class="rc-case">
          <th scope="row"><button class="lien-discret" data-at-action="ouvrir" title="Régler « ${esc(a.nom)} » dans sa fiche">${esc(a.nom)}</button>
            <small>${a.type === 'dispo' ? 'mise à disposition' : a.type === 'lavage' ? 'plonge' : a.type === 'handling' ? 'handling' : a.type === 'robot' ? 'robot · ' + a.personnes + ' pers.' : a.personnes + ' pers.'}</small></th>
          <td class="rc-type">${deroule(a)}</td>
          ${depart(a)}
          <td class="rc-traite">${traite(a)}</td>
          <td class="rc-fin-h">${vue.fin != null && a.type !== 'dispo' ? hh(vue.fin) : '—'}</td>
        </tr>`;
      }).join('');
      box.innerHTML = `<div class="rc-scroll"><table class="rc-table">
        <thead><tr><th scope="col">Case</th><th scope="col">Déroulé</th><th scope="col">Jour</th><th scope="col">Départ</th>
          <th scope="col">Ce qu’elle traite, dans l’ordre</th><th scope="col">Fin</th></tr></thead>
        <tbody>${lignes || `<tr><td colspan="6" class="mini-note">Aucune case ne correspond à « ${esc(filtre)} ».</td></tr>`}</tbody></table></div>`;
    }

    exporterRecapCases() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      T.telecharger('ory-cases-' + new Date().toISOString().slice(0, 10) + '.xlsx',
        T.ecrireClasseur(E.recapCasesVersClasseur(this.state, { services: this.a.services(), classes: this.classes, resultat: this.resultat })));
      this.rendre('Cases exportées : modifiez jour, heure, personnes ou commandes dans Excel, puis « ⇧ Importer ».');
    }

    async importerRecapCases(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        const E = root.OrlyEchanges, T = root.OrlyTableur;
        const r = E.classeurVersRecapCases(await T.lireFichier(f, 4 * 1024 * 1024), this.state, { services: this.a.services(), classes: this.classes });
        if (!r.changes.length) return this.rendre('Cases lues : rien ne change.');
        const liste = r.changes.slice(0, 6).join(', ') + (r.changes.length > 6 ? '…' : '');
        if (!confirm('Changer ' + r.changes.length + (r.changes.length > 1 ? ' cases' : ' case') + ' (' + liste + ') d’après le fichier ? L’action est annulable.')) return;
        this.changer(() => { this.state = valider(r.etat); }, 'Cases importées : ' + r.changes.length + (r.changes.length > 1 ? ' cases changées' : ' case changée') + ' (' + liste + ').');
      } catch (err) { this.rendre('Import refusé — ' + err.message); }
      finally { e.target.value = ''; }
    }

    rendreClasses(r) {
      const box = document.getElementById('at-classes');
      const classes = this.classes, retirees = this.retirees;
      const par = (r && r.parClasse) || {};

      const ajout = this.ajout ? `<div class="at-ajout">
        <label>Compagnie<input id="at-cls-cie" maxlength="40" placeholder="Ex. CRL" value="${esc(this.ajout.cie)}"></label>
        <label>Classe<select id="at-cls-cabine">${P.CABINES.map(c => `<option value="${c}" ${c === this.ajout.cabine ? 'selected' : ''}>${esc((P.NOM_CABINE || {})[c] || c)}</option>`).join('')}</select></label>
        <div class="at-ajout-actions">
          <button class="btn btn-play btn-sm" data-at-action="classe-valider">Ajouter</button>
          <button class="btn btn-sm" data-at-action="classe-annuler">Annuler</button>
        </div>
        <p class="mini-note at-ajout-note">Passagers, nombre de vols et heure viennent de
          l’<b>import des vols</b> — on ne les saisit pas deux fois. Une commande absente des vols
          reste ajoutée, sans volume, jusqu’au prochain import.</p>
      </div>` : '';

      const barre = `<div class="at-barre">
        <span class="at-barre-fin"></span>
        <button class="btn btn-sm" data-at-action="classe-nouvelle" ${this.ajout ? 'disabled' : ''}>+ Ajouter une commande</button>
      </div>`;

      const exclues = retirees.length ? `<p class="at-exclues">Retirées du programme :
        ${retirees.map(c => `<button class="at-chip" data-at-action="classe-retablir" data-classe="${esc(c.id)}">${esc(c.id)} ↺</button>`).join(' ')}</p>` : '';

      if (!classes.length) {
        box.innerHTML = barre + ajout + exclues +
          '<p class="mini-note">Aucune commande à préparer : ni dans le programme de vols, ni ajoutée ici.</p>';
        return;
      }

      box.innerHTML = barre + ajout + exclues + `<table class="at-table"><thead><tr>
        <th scope="col">Commande</th><th scope="col">Passagers</th><th scope="col">Vols</th>
        <th scope="col">Prête avant</th><th scope="col">Prête à</th><th scope="col">Où elle en est</th>
        <th scope="col"><span class="sr-only">Retirer</span></th>
        </tr></thead><tbody>` +
        classes.map(c => {
          const v = par[c.id] || {};
          const etat = v.absente ? '<span class="at-etat neutre">pas encore d’équipe</span>'
            : v.fin == null ? '<span class="at-etat neutre">pas finie</span>'
            : v.aHeure ? '<span class="at-etat ok">à l’heure</span>'
            : '<span class="at-etat retard">+' + Math.round(v.retard) + ' min</span>';
          // Une classe déclarée que l'import ne porte pas n'a ni volume ni
          // échéance : afficher zéro et une heure ferait croire à une donnée.
          const horsImport = c.origine === 'ajoutee' && !c.vols.length;
          const source = c.origine === 'ajoutee'
            ? '<span class="at-source">' + (horsImport ? 'pas dans les vols' : 'ajoutée') + '</span>' : '';
          return `<tr><th scope="row" data-classe="${esc(c.id)}">${esc(P.libelleClasse(c.id))} ${source}</th>
            <td>${horsImport ? '—' : c.pax}</td><td>${horsImport ? '—' : c.vols.length}</td>
            <td>${horsImport ? '—' : P.hhmm(c.echeance)}</td><td>${v.fin == null ? '—' : P.hhmm(v.fin)}</td><td>${etat}</td>
            <td><button class="lien-discret" data-at-action="classe-supprimer" data-classe="${esc(c.id)}"
              title="Retirer ${esc(P.libelleClasse(c.id))} et couper ses liens avec les équipes">Retirer</button></td></tr>`;
        }).join('') + '</tbody></table>';
    }
  }

  const api = { CentreAteliers, valider, vide, CLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAteliers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
