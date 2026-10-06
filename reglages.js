/* ==========================================================================
 *  LE MODÈLE DE PRODUCTION — ce qui pilote les ateliers de travail
 *
 *  Le Centre des réglages décrivait jusqu'ici le seul moteur de démonstration :
 *  effectifs par curseur, contenances, vivier, scénarios A/B. Depuis les
 *  ateliers de travail, ce n'est plus là que se joue la production — et un
 *  réglage qui ne règle rien est pire qu'un réglage absent.
 *
 *  Ce module tient les quatre entrées du modèle par ateliers :
 *
 *    1. le BARÈME    — homme-minutes PAR VOL, par service et par compagnie ×
 *                      classe (une valeur commune, et des valeurs propres) ;
 *    2. le RENDEMENT — part du temps de présence réellement produite ;
 *    3. le POSTE     — seuils de pause et durée de présence par défaut ;
 *    4. l'IMPORT/EXPORT Excel du barème, pour recevoir une étude en bloc.
 *
 *  Le délai de chargement reste tenu par le panneau « Horaires de vols » :
 *  il sert aux deux moteurs, et deux champs pour une seule valeur finiraient
 *  par diverger.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./moteur/production.js') : root.MoteurProduction;

  const CLE = 'ory-modele-v1';
  const clone = x => JSON.parse(JSON.stringify(x));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Un nombre de minutes : positif, fini, arrondi au centième. */
  const min = (v, defaut) => {
    const n = +v;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : defaut;
  };

  /**
   * Relit un état enregistré. Tout ce qui manque retombe sur la valeur de
   * démonstration : un fichier tronqué ne doit pas vider le barème.
   */
  function valider(brut) {
    let b = brut || {};
    // Une règle de poste par défaut d'avant (8 h 15, pauses de 15 et 30 min ; puis
    // 8 h avec 1 h d'un bloc), restée telle quelle dans une sauvegarde : elle passe
    // à la règle du 06/10 (3 h, 15 min, 3 h, 45 min, 1 h), une fois. Une règle
    // modifiée à la main ne bouge pas.
    const lue = b.regime && JSON.stringify({ seuils: (b.regime.seuils || []).map(s => ({ apres: +s.apres, duree: +s.duree })), presence: +b.regime.presence });
    if (b.regimeV !== 3 && lue && (P.REGIMES_AVANT || []).some(r => JSON.stringify(r) === lue))
      b = { ...b, regime: { seuils: P.REGIME_DEFAUT.seuils, presence: P.REGIME_DEFAUT.presence } };
    return {
      regimeV: 3,
      bareme: validerBareme(b.bareme),
      // Certains services se chiffrent par compagnie × classe, d'autres par
      // classe seulement. Le mode ne change pas le calcul — une valeur propre
      // l'emporte toujours sur la commune — il change ce qu'on saisit.
      detail: Object.fromEntries(Object.entries((b.detail && typeof b.detail === 'object') ? b.detail : {})
        .filter(([k, v]) => v === 'compagnie' && typeof k === 'string' && k.length <= 160).slice(0, 300)),
      rendement: (() => {
        const n = +b.rendement;
        return Number.isFinite(n) && n > 0 && n <= 2 ? Math.round(n * 100) / 100 : P.RENDEMENT_DEMO;
      })(),
      regime: {
        seuils: (Array.isArray(b.regime && b.regime.seuils) ? b.regime.seuils : P.REGIME_DEFAUT.seuils)
          .slice(0, 6)
          .map(s => ({ apres: min(s.apres, 0), duree: min(s.duree, 0) }))
          .filter(s => s.duree > 0)
          .sort((x, y) => x.apres - y.apres),
        presence: (() => {
          const n = +(b.regime || {}).presence;
          return Number.isFinite(n) && n >= 30 && n <= 1440 ? Math.round(n) : P.REGIME_DEFAUT.presence;
        })()
      }
    };
  }

  /**
   * Un barème : service → { 'AF/BC': minutes par vol, '*\/BC': valeur commune }.
   * L'ancienne forme, par passager, est convertie par le moteur.
   */
  function validerBareme(brut) {
    return P.normaliserBareme(brut).bareme;
  }

  class CentreReglages {
    /**
     * @param {object} a adaptateur :
     *   hote()            — l'élément où s'installer
     *   services()        — [{id, nom}] : les services du plan, annexes comprises
     *   parent(id)        — l'atelier dont une annexe dépend, ou null
     *   delaiChargement() — la valeur tenue par « Horaires de vols »
     *   change()          — appelé après chaque modification
     *   notify(msg)       — message passager
     */
    constructor(a) {
      this.a = a;
      this.etat = valider(null);
      this.undo = []; this.redo = [];
      this.serviceOuvert = null;   // un seul service déplié à la fois
      this.converti = false;
      let alerte = '';
      try {
        const garde = localStorage.getItem(CLE);
        if (garde) {
          const lu = JSON.parse(garde);
          this.etat = valider(lu);
          // Un barème d'hier comptait par passager : il est converti, et on le dit.
          if (lu && P.normaliserBareme(lu.bareme).converti) { this.converti = true; this.enregistrer(); }
        }
      } catch (e) { alerte = 'Réglages du modèle non relus : ' + e.message; }
      this.construire();
      this.rendre(alerte);
    }

    /* ---- ce que le moteur reçoit -------------------------------------- */

    /**
     * Le barème complété : une annexe — « Armement 2 » — fait le même travail
     * que l'atelier dont elle dépend. Sans ce report, un atelier posé dans une
     * annexe travaillerait en temps nul, sans que rien ne le dise.
     */
    baremeComplet() {
      const out = clone(this.etat.bareme);
      for (const s of (this.a.services ? this.a.services() : [])) {
        if (out[s.id]) continue;
        const pere = this.a.parent ? this.a.parent(s.id) : null;
        if (pere && out[pere]) out[s.id] = clone(out[pere]);
      }
      return out;
    }

    pourMoteur() {
      return {
        bareme: this.baremeComplet(),
        rendement: this.etat.rendement,
        regime: this.etat.regime,
        delaiChargement: this.a.delaiChargement ? this.a.delaiChargement() : 45
      };
    }

    /* ---- modification ------------------------------------------------- */

    changer(fn, message) {
      const avant = clone(this.etat);
      try { fn(); this.etat = valider(this.etat); }
      catch (e) { this.etat = avant; return this.rendre('Refusé : ' + e.message); }
      if (JSON.stringify(avant) !== JSON.stringify(this.etat)) {
        this.undo.push(avant); if (this.undo.length > 60) this.undo.shift(); this.redo = [];
      }
      this.enregistrer();
      this.rendre(message);
      if (this.a.change) this.a.change();
    }

    enregistrer() {
      try { localStorage.setItem(CLE, JSON.stringify(this.etat)); }
      catch { if (this.a.notify) this.a.notify('Enregistrement impossible : exportez le barème.'); }
    }

    histoire(refaire) {
      const source = refaire ? this.redo : this.undo, cible = refaire ? this.undo : this.redo;
      if (!source.length) return;
      cible.push(clone(this.etat)); this.etat = source.pop();
      this.enregistrer(); this.rendre(refaire ? 'Rétabli.' : 'Annulé.');
      if (this.a.change) this.a.change();
    }

    /* ---- construction -------------------------------------------------- */

    construire() {
      const hote = this.a.hote();
      const section = document.createElement('section');
      section.className = 'rg-modele'; section.id = 'rg-modele';
      section.innerHTML = `
        <div class="titre-aide" data-sous="rg-minutes">
          <h2 class="reglages-titre">Minutes de travail par vol</h2><details class="aide">
          <summary aria-label="À quoi sert cette page ?">?</summary>
          <span class="aide-corps">Ces chiffres disent combien de temps prend chaque préparation. Ils
            servent au calcul de la journée, dont on lit le résultat dans « Résultats ».</span></details></div>
        <p id="rg-status" role="status" aria-live="polite"></p>
        <div class="panneau" id="rg-bareme-panneau" data-sous="rg-minutes">
          <div class="titre-aide"><h3>Service par service</h3><details class="aide">
            <summary aria-label="Comment lire ces chiffres ?">?</summary>
            <span class="aide-corps">
              <p>Pour chaque service : les minutes de travail que demande <b>un vol</b> d’une compagnie
                dans une classe. Pour la journée, on multiplie par le <b>nombre de vols</b> ; le nombre
                de passagers n’y change rien.</p>
              <p>Une valeur <b>commune</b> par classe vaut pour toutes les compagnies ; une compagnie
                peut avoir la sienne.</p>
              <p>Un service marqué « à remplir » travaillerait en zéro minute. Une salle annexe reprend
                les chiffres du service dont elle dépend.</p>
              <p><b>⇩ Excel</b> donne le tableau à remplir, une ligne par repas et par service de son
                chemin ; <b>Importer</b> reprend l’étude entière d’un coup.</p>
            </span></details></div>
          <p class="rg-exemple" aria-label="Exemple : 60 minutes de travail pour un vol, à 2 personnes, prennent 30 minutes.">
            <span class="rg-eq">${root.OrlyIcones ? root.OrlyIcones.ico('chrono') : ''}<b>60 min</b><small>de travail pour un vol</small></span>
            <span class="rg-op">÷</span>
            <span class="rg-eq">${root.OrlyIcones ? root.OrlyIcones.ico('equipe') : ''}<b>2</b><small>personnes</small></span>
            <span class="rg-op">=</span>
            <span class="rg-eq res">${root.OrlyIcones ? root.OrlyIcones.ico('journee') : ''}<b>30 min</b><small>de préparation</small></span></p>
          <p class="rg-codes">${P.CABINES.map(c => `<span><span class="puce-classe" data-cab="${c}"></span>${esc((P.NOM_CABINE || {})[c] || c)}</span>`).join('')}<em>minutes de travail pour un vol</em></p>
          <div id="rg-alerte"></div>
          <div class="rg-actions">
            <button class="btn btn-sm" id="rg-undo" title="Annuler la dernière modification">↶ Annuler</button>
            <button class="btn btn-sm" id="rg-redo" title="Rétablir ce qui a été annulé">↷ Rétablir</button>
            <button class="btn btn-sm" id="rg-export" title="Les temps de travail (minutes par vol) et les réglages du rythme, dans un classeur Excel prêt à remplir">⇩ Temps de travail</button>
            <button class="btn btn-sm" id="rg-import-btn" title="Réimporter un classeur (ou un CSV) de temps de travail modifié">⇧ Importer</button>
            <input id="rg-import" type="file" accept=".xlsx,.csv,.json" hidden>
          </div>
          <div id="rg-bareme"></div>
          <p class="rg-reset-ligne"><button class="lien-discret danger" id="rg-reset">Remettre les chiffres d’exemple</button></p>
        </div>
        <div class="panneau" id="rg-recap-panneau" data-sous="rg-recap">
          <div class="titre-aide"><h3>Toutes les man-minutes, d’un coup d’œil</h3><details class="aide">
            <summary aria-label="Comment lire ce tableau ?">?</summary>
            <span class="aide-corps">
              <p>Un bloc par compagnie : sa ligne en tête est son total (la somme de ses classes, et son armement) ;
                un clic la déplie sur ses classes (compagnie × classe). Une colonne par service. <b>Par vol</b> : les
                man-minutes d’un vol de cette commande dans ce service — c’est le barème, modifiable ici.
                <b>Sur la journée</b> : par vol × nombre de vols, pour voir où part le travail.</p>
              <p>Changer une case donne à cette compagnie × classe sa valeur propre ; la vider la ramène à la
                valeur « toutes compagnies » de sa classe. Une valeur fixée dans une case d’équipe prime pour
                cette équipe : elle se change dans la case.</p>
              <p><b>⇩ Man-minutes</b> donne ce même tableau dans Excel, pour les grosses modifications ;
                <b>⇧ Importer</b> le reprend.</p>
            </span></details></div>
          <div class="rg-actions rg-recap-outils">
            <div class="rg-mode" role="group" aria-label="Valeurs montrées">
              <button class="btn btn-sm" data-rg-action="recap-vue" data-vue="vol" aria-pressed="true">Par vol</button>
              <button class="btn btn-sm" data-rg-action="recap-vue" data-vue="jour" aria-pressed="false">Sur la journée</button>
            </div>
            <label class="rg-recap-cherche">Chercher <input id="rg-recap-filtre" type="search" placeholder="Compagnie : AF, TX…"></label>
            <span class="rg-recap-fin"></span>
            <button class="btn btn-sm" id="rg-recap-undo" title="Annuler la dernière modification">↶ Annuler</button>
            <button class="btn btn-sm" id="rg-recap-redo" title="Rétablir ce qui a été annulé">↷ Rétablir</button>
            <button class="btn btn-sm" id="rg-recap-export" title="Le tableau des man-minutes dans un classeur Excel, à modifier puis réimporter">⇩ Man-minutes</button>
            <button class="btn btn-sm" id="rg-recap-import-btn" title="Réimporter le classeur des man-minutes modifié">⇧ Importer</button>
            <input id="rg-recap-import" type="file" accept=".xlsx,.csv" hidden>
          </div>
          <p class="rg-recap-legende" aria-hidden="true"><span class="rgr propre">valeur propre</span><span class="rgr commun">toutes compagnies</span>
            <span class="rgr case">fixée dans une case</span><span class="rgr robot">robot : plateaux / h</span><span class="rgr manque">à renseigner</span><span class="rgr somme">total de la compagnie</span></p>
          <div id="rg-recap" class="rg-recap"></div>
        </div>
        <div class="rg-sim-horaires" id="rg-sim-horaires" data-sous="rg-simulation"></div>
        <div class="panneau rg-sim-materiel" id="rg-sim-materiel" data-sous="rg-simulation"></div>
        <div class="panneau" data-sous="rg-simulation">
          <div class="titre-aide"><h3>Rythme de travail</h3><details class="aide">
            <summary aria-label="À quoi sert le rythme ?">?</summary>
            <span class="aide-corps">Un seul chiffre pour tous les services. À 1, les équipes tiennent
              exactement les minutes ci-dessus ; à 0,8, tout prend un quart de temps en plus. S’il doit
              varier d’un service à l’autre, ce sont les minutes du service qu’il faut changer.</span></details></div>
          <div class="slider-ligne">
            <label for="rg-rendement">Rythme (1 = les minutes de travail de chaque service) <b id="rg-rendement-val"></b></label>
            <input id="rg-rendement" type="range" min="0.5" max="1.2" step="0.01">
          </div>
        </div>
        <div class="panneau" data-sous="rg-simulation">
          <div class="titre-aide"><h3>Pauses et présence</h3><details class="aide">
            <summary aria-label="Comment sont comptées les pauses ?">?</summary>
            <span class="aide-corps">Une pause vient après un temps de <b>travail</b>, pas à une heure
              fixe : une équipe qui attend le service d’avant ne travaille pas, donc ne prend pas encore
              sa pause. La présence réglée ici vaut pour toute équipe qui n’a pas fixé la sienne.</span></details></div>
          <div id="rg-seuils"></div>
          <div class="rg-actions">
            <button class="btn btn-sm" id="rg-seuil-ajouter">+ Pause</button>
          </div>
          <div class="champ">
            <span>Temps de présence d’une équipe (min)</span>
            <input id="rg-presence" type="number" min="30" max="1440" step="5">
          </div>
          <p class="mini-note" id="rg-presence-note"></p>
        </div>
        <p class="rg-version" id="rg-version" data-sous="rg-simulation"></p>
        <p class="mini-note rg-ailleurs" data-sous="rg-simulation">Ce qui est propre à une équipe (ses tunnels, ses chauffeurs, ses horaires)
          se règle dans la fiche de son service, <b>Équipes › Services et équipes</b>. Les vols et la planche retour sont dans <b>Vols</b>.</p>`;
      hote.appendChild(section);
      // Quelle version le navigateur sert-il ? La question revient dès qu'un
      // doute s'installe, et un cache périmé ne se voit autrement pas.
      const v = document.querySelector('meta[name="ory-version"]');
      const boite = section.querySelector('#rg-version');
      boite.textContent = v && v.content && /^[0-9a-f]{4,}$/.test(v.content)
        ? 'Version servie : ' + v.content
        : 'Version servie : inconnue (page ouverte hors du site).';
      this.lier();
    }

    lier() {
      const sur = (id, ev, fn) => { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
      sur('rg-undo', 'click', () => this.histoire(false));
      sur('rg-redo', 'click', () => this.histoire(true));
      sur('rg-reset', 'click', () => {
        if (!confirm('Revenir au barème de démonstration ? Vos valeurs seront perdues.')) return;
        this.changer(() => { this.etat.bareme = clone(P.BAREME_DEMO); }, 'Barème de démonstration rétabli.');
      });
      sur('rg-export', 'click', () => this.exporter());
      // Le récap touche deux choses : le barème et l'effectif des cases.
      // « Annuler » y défait la dernière, quelle qu'elle soit.
      sur('rg-recap-undo', 'click', () => this.annulerRecap(false));
      sur('rg-recap-redo', 'click', () => this.annulerRecap(true));
      sur('rg-recap-export', 'click', () => this.exporterRecap());
      sur('rg-recap-import-btn', 'click', () => document.getElementById('rg-recap-import').click());
      sur('rg-recap-import', 'change', e => this.importerRecap(e));
      sur('rg-recap-filtre', 'input', e => { this.recapFiltre = e.target.value.trim().toUpperCase(); this.rendreRecap(); });
      sur('rg-import-btn', 'click', () => document.getElementById('rg-import').click());
      sur('rg-import', 'change', e => this.importer(e));
      sur('rg-seuil-ajouter', 'click', () => this.changer(() => {
        const dernier = this.etat.regime.seuils[this.etat.regime.seuils.length - 1];
        this.etat.regime.seuils.push({ apres: (dernier ? dernier.apres : 0) + 180, duree: 15 });
      }, 'Pause ajoutée.'));
      sur('rg-rendement', 'input', e => {
        document.getElementById('rg-rendement-val').textContent = (+e.target.value).toFixed(2).replace('.', ',');
      });
      sur('rg-rendement', 'change', e =>
        this.changer(() => { this.etat.rendement = +e.target.value; }, 'Rendement enregistré.'));
      sur('rg-presence', 'change', e =>
        this.changer(() => { this.etat.regime.presence = +e.target.value; }, 'Présence enregistrée.'));

      const section = document.getElementById('rg-modele');
      // Les mêmes écouteurs servent la fiche d'un service (Équipes ›
      // Services), où le temps de travail se règle aussi : `ecouter(el)`.
      /* Le champ « personnes » d'une équipe : à saisir, ou calculé d'après ses
       * homme-minutes (retour d'usage du 05/10), en lecture. */
      this.persEquipe = eq => {
        const e = this.a.effectifCalcule ? this.a.effectifCalcule(eq.id) : null;
        return e ? `<output class="rgr-calc" data-rg-calcule="${esc(eq.id)}" title="Calculé : homme-minutes de l’équipe ÷ minutes de son poste. Pour le saisir, cochez « Effectif constant » dans la fiche du service.">${e.personnes}</output>`
          : `<input type="number" min="0" max="999" step="1" value="${eq.personnes}" data-rg-champ="recap-pers" data-atelier="${esc(eq.id)}" aria-label="Personnes de ${esc(eq.nom)}">`;
      };
      this.surChange = e => {
        const champ = e.target.dataset.rgChamp; if (!champ) return;
        const { service, cle, index } = e.target.dataset;
        const v = e.target.value;
        // L'effectif d'une équipe : il vit dans ses cases, pas dans le barème.
        if (champ === 'recap-pers') {
          const n = parseInt(v, 10), id = e.target.dataset.atelier;
          if (!Number.isInteger(n) || n < 0) { this.rendre('Nombre de personnes entier attendu.'); return; }
          setTimeout(() => { if (this.a.personnes && this.a.personnes(id, Math.min(999, n))) this.pile('cases'); }, 0);
          return;
        }
        // Les minutes par vol d'une compagnie dans un service par compagnie (l'armement) :
        // elles vivent dans son réglage (Équipes › le service), pas dans le barème.
        if (champ === 'recap-cie') {
          const n = v === '' ? null : +String(v).replace(',', '.');
          if (n !== null && !(n >= 0)) { this.rendre('Nombre de minutes positif attendu.'); return; }
          setTimeout(() => { if (this.a.minutesCompagnie && this.a.minutesCompagnie(service, e.target.dataset.cie, n)) this.pile('cases'); }, 0);
          return;
        }
        if (champ === 'recap-debit') {
          const id = e.target.dataset.atelier, cls = e.target.dataset.classe;
          const n = v === '' ? null : +String(v).replace(',', '.');
          if (n !== null && !(n > 0)) { this.rendre('Débit positif attendu, en plateaux par heure.'); return; }
          setTimeout(() => { if (this.a.debitRobot && this.a.debitRobot(id, cls, n)) this.pile('cases'); }, 0);
          return;
        }
        if (champ === 'recap') this.pile('bareme');
        // Le rendu remplace le tableau : le faire PENDANT le `change` arrache
        // le champ qu'on vient de quitter, et le navigateur refuse. On laisse
        // l'événement se terminer d'abord.
        setTimeout(() => this.changer(() => {
          if (champ === 'minutes') {
            const ligne = this.etat.bareme[service] || (this.etat.bareme[service] = {});
            // Une case vidée : la valeur disparaît. Commune, le service devient
            // « non renseigné » pour cette classe ; propre, la commune reprend.
            if (v === '') delete ligne[cle];
            else ligne[cle] = min(v.replace(',', '.'), 0);
          } else if (champ === 'propre-ajout' && v) {
            const ligne = this.etat.bareme[service] || (this.etat.bareme[service] = {});
            const cabine = v.slice(v.lastIndexOf('/') + 1);
            // Elle naît à la valeur commune : on part de ce qui s'appliquait.
            ligne[v] = ligne[P.cleBareme(P.TOUTES, cabine)] || 0;
          } else if (champ === 'recap') {
            // Une case du récap : la valeur de cette compagnie × classe dans ce
            // service. Égale à la valeur commune, ou vidée : elle suit la commune.
            const { classe } = e.target.dataset, i = classe.lastIndexOf('/');
            const cab = classe.slice(i + 1), cle2 = P.cleBareme(classe.slice(0, i), cab);
            const ligne = this.etat.bareme[service] || (this.etat.bareme[service] = clone(this.baremeComplet()[service] || {}));
            const commun = ligne[P.cleBareme(P.TOUTES, cab)];
            if (v === '') delete ligne[cle2];
            else { const n = min(v.replace(',', '.'), 0); if (Number.isFinite(commun) && n === commun) delete ligne[cle2]; else ligne[cle2] = n; }
            if (Object.keys(ligne).some(k => !k.startsWith(P.TOUTES + '/'))) this.etat.detail[service] = 'compagnie';
          } else if (champ === 'seuil-apres') this.etat.regime.seuils[+index].apres = min(v, 0);
          else if (champ === 'seuil-duree') this.etat.regime.seuils[+index].duree = min(v, 0);
        }, 'Enregistré.'), 0);
      };
      this.surClic = e => {
        const tete = e.target.closest('.rg-service > summary');
        if (tete) {
          const d = tete.parentElement;
          this.serviceOuvert = d.open ? null : d.dataset.service;
          return;   // le navigateur fait le reste : on ne redessine pas
        }
        // Déplier / replier une compagnie, ou toutes : sans redessiner le tableau.
        const pl = e.target.closest('[data-rg-action="recap-cie"], [data-rg-action="recap-tout"]');
        if (pl) {
          const ouverts = this.recapOuverts || (this.recapOuverts = new Set());
          const blocs = pl.dataset.rgAction === 'recap-tout' ? [...document.querySelectorAll('#rg-recap .rg-recap-bloc')]
            : [pl.closest('.rg-recap-bloc')];
          const ouvrir = pl.dataset.rgAction === 'recap-tout' ? pl.dataset.ouvrir === '1' : !blocs[0].classList.contains('ouvert');
          for (const b of blocs) {
            b.classList.toggle('ouvert', ouvrir);
            const bt = b.querySelector('.rg-cie-btn'); if (bt) bt.setAttribute('aria-expanded', String(ouvrir));
            if (ouvrir) ouverts.add(b.dataset.compagnie); else ouverts.delete(b.dataset.compagnie);
          }
          return;
        }
        const rv = e.target.closest('[data-rg-action="recap-vue"]');
        if (rv) { this.recapVue = rv.dataset.vue; return this.rendreRecap(); }
        const m = e.target.closest('[data-rg-action="mode"]');
        if (m) return this.changer(() => {
          if (m.dataset.mode === 'compagnie') this.etat.detail[m.dataset.service] = 'compagnie';
          else delete this.etat.detail[m.dataset.service];
        }, m.dataset.mode === 'compagnie'
          ? 'Saisie par compagnie × classe : une ligne par compagnie, une colonne par classe.'
          : 'Saisie par classe : les valeurs propres à une compagnie sont conservées.');
        const p = e.target.closest('[data-rg-action="propre-retirer"]');
        if (p) return this.changer(() => { delete this.etat.bareme[p.dataset.service][p.dataset.cle]; },
          p.dataset.cle + ' : retour à la valeur commune.');
        const b = e.target.closest('[data-rg-action="seuil-retirer"]'); if (!b) return;
        this.changer(() => { this.etat.regime.seuils.splice(+b.dataset.index, 1); }, 'Pause retirée.');
      };
      this.ecouter(section);
    }

    /** Les champs du temps de travail posés ailleurs (la fiche d'un service) s'écoutent comme ici. */
    ecouter(el) {
      if (!el || el._rgEcoute) return;
      el._rgEcoute = true;
      el.addEventListener('change', this.surChange);
      el.addEventListener('click', this.surClic);
    }

    /* ---- rendu ---------------------------------------------------------- */

    rendre(message) {
      if (message !== undefined) {
        const s = document.getElementById('rg-status'); if (s) s.textContent = message || '';
      }
      this.rendreBareme();
      this.rendreRecap();
      this.rendreRendement();
      this.rendreRegime();
      const b1 = document.getElementById('rg-undo'), b2 = document.getElementById('rg-redo');
      if (b1) b1.disabled = !this.undo.length;
      if (b2) b2.disabled = !this.redo.length;
      const r1 = document.getElementById('rg-recap-undo'), r2 = document.getElementById('rg-recap-redo');
      if (r1) r1.disabled = !this.undo.length && !(this.pileRecap || []).includes('cases');
      if (r2) r2.disabled = !this.redo.length && !(this.pileRedo || []).includes('cases');
    }

    /*
     * Onze services × cinq classes × deux colonnes faisaient **cent dix champs
     * numériques d'un bloc**. Personne ne lit ça : on cherche sa ligne, on se
     * trompe de colonne, on renonce.
     *
     * Un service à la fois, donc. Replié, chacun tient en une ligne qui dit
     * l'essentiel ; ouvert, il montre ses dix champs et rien d'autre. Le
     * navigateur n'en garde qu'un ouvert (`name` sur le `<details>`).
     */
    rendreBareme() {
      const box = document.getElementById('rg-bareme'); if (!box) return;
      const services = (this.a.services ? this.a.services() : []);
      const complet = this.baremeComplet();
      const occupes = new Set(this.a.occupes ? this.a.occupes() : []);
      // Les services dont une case lit le barème : une équipe qui prépare, ou
      // l'étape qu'une case fait à la chaîne. Le handling, une plonge, une mise
      // à disposition ne le lisent pas : « à remplir » y était une fausse alerte.
      const cases = this.a.ateliers ? this.a.ateliers() : [];
      const lisent = new Set(cases.filter(a => a.type === 'manuel' || !a.type).flatMap(a => [a.service].concat(a.fusion ? [a.fusion] : [])));
      // Remplacer la liste détruit ses champs. Si rien n'a bougé, on n'y
      // touche pas : sinon un rendu déclenché par la sortie d'un champ
      // arrache le bouton qu'on était en train de cliquer, et le clic se perd.
      const signature = JSON.stringify([services.map(s => [s.id, s.nom]), complet,
        this.etat.bareme, this.etat.detail, [...occupes], [...lisent], (this.a.classes ? this.a.classes() : []).map(c => c.id),
        this.a.routesSignature ? this.a.routesSignature() : '']);
      if (box._signature !== signature) {
        box._signature = signature;
        // Un `input[type=number]` n'accepte que le point décimal : « 0,6 » le
        // laisse vide, et le barème semble ne rien contenir.
        const fr = n => String(n).replace('.', ',');

        const I = root.OrlyIcones;
        box.innerHTML = services.map(s => {
          const { etat, marque, digest, mode, corps, manquent, parCompagnie } = this.blocService(s, { complet, cases, lisent, fr, services });
          return `<details class="rg-service ${etat}${manquent.length && parCompagnie ? ' manque' : ''}" name="rg-bareme" data-service="${esc(s.id)}">
            <summary>
              <span class="rg-svc-nom">${I ? `<span class="rg-svc-ico">${I.ico(I.icoService(s.id, s.nom))}</span>` : ''}${esc(s.nom)}${occupes.has(s.id)
                ? '<span class="rg-occupe" title="Une équipe travaille dans ce service">a une équipe</span>' : ''}${marque}</span>
              <span class="rg-svc-digest">${digest}</span>
            </summary>
            ${mode}
            ${corps}
          </details>`;
        }).join('');
      }
      // Le service ouvert survit à un rendu : sans cela, saisir une valeur
      // refermait la fiche qu'on était en train de remplir.
      for (const d of box.querySelectorAll('.rg-service')) {
        d.open = d.dataset.service === this.serviceOuvert;
      }

      // Le barème n'est pas calibré : le dire ici, là où on le modifie.
      const alerte = document.getElementById('rg-alerte');
      const memeQueDemo = JSON.stringify(this.etat.bareme) === JSON.stringify(P.BAREME_DEMO);
      const conversion = this.converti ? `<div class="rg-avertissement"><b>Barème converti en minutes par vol.</b>
           Il comptait par passager ; chaque valeur a été multipliée par un nombre de passagers types
           (BC ${P.PAX_TYPE.BC}, PC ${P.PAX_TYPE.PC}, YC ${P.PAX_TYPE.YC}, CREW ${P.PAX_TYPE.CREW}, SPML ${P.PAX_TYPE.SPML}).
           Vérifiez-le, ou importez votre étude.</div>` : '';
      alerte.innerHTML = conversion + (memeQueDemo
        ? `<div class="rg-avertissement"><b>Ce sont des chiffres d’exemple.</b>
           Ils montrent comment le calcul fonctionne, pas la réalité de l’unité.<details class="aide">
           <summary aria-label="Pourquoi des chiffres d’exemple ?">?</summary>
           <span class="aide-corps">Ils seront remplacés d’un coup par l’étude de temps de l’unité —
             bouton <b>Importer</b>. D’ici là, les durées montrent comment les services s’enchaînent,
             pas combien de personnes il faut.</span></details></div>`
        : '');
    }

    /* Un service du barème : son état, son résumé, et ses champs. Sert la
     * liste des services (Temps de travail) et la fiche d'un service. */
    blocService(s, ctx = {}) {
      const services = ctx.services || (this.a.services ? this.a.services() : []);
      const complet = ctx.complet || this.baremeComplet();
      const cases = ctx.cases || (this.a.ateliers ? this.a.ateliers() : []);
      const lisent = ctx.lisent || new Set(cases.filter(a => a.type === 'manuel' || !a.type).flatMap(a => [a.service].concat(a.fusion ? [a.fusion] : [])));
      const fr = n => String(n).replace('.', ',');
      const classes = this.a.classes ? this.a.classes() : [];
      const routes = this.a.routes ? this.a.routes(classes) : new Map();
      // Une même échelle pour tous les services : on compare d'un coup d'œil.
      const maxi = Math.max(1, ...services.flatMap(x => {
        const l = this.etat.bareme[x.id] || complet[x.id] || {};
        return P.CABINES.map(c => l[P.cleBareme(P.TOUTES, c)]).filter(Number.isFinite);
      }));
          const propre = this.etat.bareme[s.id];
          const pere = this.a.parent ? this.a.parent(s.id) : null;
          const herite = !propre && pere && complet[s.id];
          const ligne = propre || complet[s.id] || {};
          const communes = P.CABINES.map(c => ligne[P.cleBareme(P.TOUTES, c)]);
          const renseigne = communes.some(Number.isFinite) || Object.keys(ligne).length;
          const etat = herite ? 'herite' : renseigne ? 'ok' : !cases.length || lisent.has(s.id) ? 'vide' : 'inutile';
          const marque = herite
            ? '<span class="rg-herite" title="Mêmes chiffres que le service dont elle dépend">repris</span>'
            : renseigne ? '' : !cases.length || lisent.has(s.id) ? '<span class="rg-zero">à remplir</span>' : '';
          const propres = Object.entries(ligne).filter(([k]) => !k.startsWith(P.TOUTES + '/'))
            .sort(([x], [y]) => x.localeCompare(y));
          const parCompagnie = this.etat.detail[s.id] === 'compagnie';
          // Les compagnies × classes qui passent par ce service : celles dont le
          // parcours le traverse, ou toutes quand une classe n'a pas de parcours.
          const ici = classes.filter(c => { const r = routes.get(c.id); return !r || r.services.has(s.id); });
          const manquent = ici.filter(c => P.minutesParVol(ligne, c) == null);
          const champ = (cle, val, label, attrs) => `<input type="number" min="0" step="0.1" value="${Number.isFinite(val) ? val : ''}"
            placeholder="${esc((attrs && attrs.placeholder) || '—')}" data-rg-champ="minutes" data-service="${esc(s.id)}"
            data-cle="${esc(cle)}" aria-label="${esc(label)}"${attrs && attrs.manque ? ' class="rg-manque"' : ''}>`;

          const digest = parCompagnie
            ? `<em>par compagnie × classe</em> · ${propres.length} ${propres.length > 1 ? 'valeurs' : 'valeur'}`
              + (manquent.length ? ` · <b class="rg-manque-txt">${manquent.length} à renseigner</b>` : '')
            : `<span class="rg-barres" aria-hidden="true">${P.CABINES.map((c, i) => {
                const v = communes[i], ok = Number.isFinite(v);
                return `<span class="rg-barre" title="${esc((P.NOM_CABINE || {})[c] || c)} : ${ok ? fr(v) + ' min par vol' : 'à remplir'}">
                  <i data-cab="${c}" style="height:${ok ? Math.max(3, Math.round(v / maxi * 30)) : 0}px"></i><em>${ok ? fr(v) : '—'}</em></span>`;
              }).join('')}</span>`
              + `<span class="sr-only">${P.CABINES.map((c, i) => `${c} ${Number.isFinite(communes[i]) ? fr(communes[i]) : '—'}`).join(' · ')} min/vol</span>`
              + (propres.length ? `<em class="rg-plus">+ ${propres.length} par compagnie</em>` : '');

          const mode = `<div class="rg-mode" role="group" aria-label="Saisie des minutes de ${esc(s.nom)}">
            <button class="btn btn-sm" data-rg-action="mode" data-mode="classe" data-service="${esc(s.id)}"
              aria-pressed="${!parCompagnie}">Une valeur par classe</button>
            <button class="btn btn-sm" data-rg-action="mode" data-mode="compagnie" data-service="${esc(s.id)}"
              aria-pressed="${parCompagnie}">Une valeur par compagnie et par classe</button>
          </div>`;

          let corps;
          if (parCompagnie) {
            // Une ligne par compagnie, une colonne par classe. Une case vide
            // prend la valeur « autres compagnies » ; sans elle, elle manque.
            const cies = [...new Set(ici.map(c => c.cie).concat(propres.map(([k]) => k.slice(0, k.lastIndexOf('/')))))]
              .sort((x, y) => x.localeCompare(y));
            const passe = new Set(ici.map(c => c.id));
            corps = `<div class="rg-grille-scroll"><table class="rg-table rg-grille"><thead><tr><th scope="col">Compagnie</th>
              ${P.CABINES.map(c => `<th scope="col" title="${esc((P.NOM_CABINE || {})[c] || c)}">${c}</th>`).join('')}</tr></thead><tbody>
              ${cies.map(cie => `<tr><th scope="row">${esc(cie)}</th>${P.CABINES.map((c, i) => {
                const cle = P.cleBareme(cie, c), val = ligne[cle];
                if (!passe.has(P.idClasse(cie, c)) && !Number.isFinite(val))
                  return '<td class="rg-hors" title="Cette compagnie × classe ne passe pas par ce service">·</td>';
                const manque = !Number.isFinite(val) && !Number.isFinite(communes[i]);
                return `<td>${champ(cle, val, s.nom + ' ' + cie + '/' + c + ' minutes par vol',
                  { placeholder: Number.isFinite(communes[i]) ? fr(communes[i]) : 'à saisir', manque })}</td>`;
              }).join('')}</tr>`).join('')}
              <tr class="rg-autres"><th scope="row" title="Valeur de toute compagnie qui n’a pas la sienne">Autres compagnies</th>
                ${P.CABINES.map((c, i) => `<td>${champ(P.cleBareme(P.TOUTES, c), communes[i], s.nom + ' ' + c + ' minutes par vol, autres compagnies')}</td>`).join('')}</tr>
            </tbody></table></div>
            <p class="mini-note">Minutes par vol. Une case vide prend la valeur « autres compagnies » ;
              encadrée de rouge, il n’y en a pas.${cies.length ? '' : ' Aucune compagnie ne passe par ce service.'}</p>`;
          } else {
            const dispo = classes.filter(c => !(P.cleBareme(c.cie, c.cabine) in ligne));
            corps = `<table class="rg-table"><thead><tr><th scope="col">Classe</th>
              <th scope="col">Toutes compagnies — min / vol</th></tr></thead><tbody>
              ${P.CABINES.map((c, i) => `<tr>
                <th scope="row" title="${esc((P.NOM_CABINE || {})[c] || c)}">${c}</th>
                <td>${champ(P.cleBareme(P.TOUTES, c), communes[i], s.nom + ' ' + c + ' minutes par vol, toutes compagnies')}</td>
              </tr>`).join('')}
            </tbody></table>
            <div class="rg-propres">
              ${propres.length ? `<table class="rg-table"><thead><tr><th scope="col">Compagnie × classe</th>
                <th scope="col">min / vol</th><th scope="col"><span class="sr-only">Retirer</span></th></tr></thead><tbody>
                ${propres.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th>
                  <td>${champ(k, v, s.nom + ' ' + k + ' minutes par vol')}</td>
                  <td><button class="btn btn-sm" data-rg-action="propre-retirer" data-service="${esc(s.id)}" data-cle="${esc(k)}"
                    title="Revenir à la valeur commune">Retirer</button></td></tr>`).join('')}
              </tbody></table>` : ''}
              ${dispo.length ? `<select data-rg-champ="propre-ajout" data-service="${esc(s.id)}"
                aria-label="Donner à une compagnie × classe sa propre valeur dans ${esc(s.nom)}">
                <option value="">+ Valeur propre à une compagnie × classe…</option>
                ${dispo.map(c => `<option value="${esc(P.cleBareme(c.cie, c.cabine))}">${esc(c.id)}</option>`).join('')}
              </select>` : ''}
            </div>`;
          }

      return { etat, marque, digest, mode, corps, manquent, parCompagnie };
    }

    /** Le temps de travail d'un service, pour sa fiche (Équipes › Services et équipes). */
    ficheTemps(id) {
      const s = (this.a.services ? this.a.services() : []).find(x => x.id === id); if (!s) return '';
      const b = this.blocService(s);
      return `<div class="rg-fiche" data-service="${esc(s.id)}">${b.mode}${b.corps}</div>`;
    }

    /* Le contexte du récap : le barème complet, les commandes, leurs chemins, les cases. */
    contexteRecap() {
      const classes = this.a.classes ? this.a.classes() : [];
      return { bareme: this.baremeComplet(), services: this.a.services ? this.a.services() : [], classes,
        routes: this.a.routes ? this.a.routes(classes) : new Map(), ateliers: this.a.ateliers ? this.a.ateliers() : [],
        sansBareme: new Set(this.a.sansBareme ? this.a.sansBareme() : []),
        // Les services par compagnie (l'armement) : une ligne récap par compagnie.
        parCompagnie: this.a.parCompagnie ? this.a.parCompagnie() : [], categories: this.a.categories ? this.a.categories() : {} };
    }

    /*
     * Le récap : tout le barème d'un coup d'œil. Une ligne par commande, une
     * colonne par service ; par vol (modifiable) ou sur la journée.
     */
    rendreRecap() {
      const box = document.getElementById('rg-recap'); if (!box || !root.OrlyEchanges) return;
      const vue = this.recapVue === 'jour' ? 'jour' : 'vol';
      for (const b of document.querySelectorAll('[data-rg-action="recap-vue"]')) b.setAttribute('aria-pressed', String(b.dataset.vue === vue));
      const r = root.OrlyEchanges.recapManMinutes(this.contexteRecap());
      const filtre = this.recapFiltre || '';
      const lignes = r.lignes.filter(l => !filtre || l.classe.id.includes(filtre));
      const lignesCie = (r.lignesCie || []).filter(l => !filtre || l.compagnie.includes(filtre) || filtre.startsWith(l.compagnie + '/'));
      // Redessiner le tableau arrache le champ qu'on quitte : seulement s'il a changé.
      const signature = JSON.stringify([vue, filtre, r.colonnes.map(c => [c.id, c.nom]), lignes.map(l => [l.classe.id, l.vols, l.cellules]),
        lignesCie.map(l => [l.compagnie, l.vols, l.cellules])]);
      if (box._signature === signature) return;
      box._signature = signature;
      if (!r.colonnes.length || !r.lignes.length) {
        box.innerHTML = '<p class="mini-note">Rien à montrer : importez des vols et le barème, ou décrivez les chemins des commandes.</p>';
        return;
      }
      const fr = n => String(Math.round(n * 10) / 10).replace('.', ',');
      const heures = n => (n >= 60 ? fr(n / 60) + ' h' : fr(n) + ' min');
      const I = root.OrlyIcones;
      // Trois sous-colonnes par service, alignées d'une ligne à l'autre :
      // la valeur (man-min, ou débit du robot), l'effectif, la durée.
      const cellule = (l, sv) => {
        const c = l.cellules[sv.id], lib = P.libelleClasse(l.classe.id) + ' · ' + sv.nom;
        if (c.source === 'compagnie') return `<td class="rgr parcie g" colspan="3" title="${esc(sv.nom)} travaille par compagnie : ses minutes sont sur la ligne de ${esc(l.classe.cie)}, en tête du bloc"></td>`;
        if (c.source === 'hors') return `<td class="rgr hors g" colspan="3" title="${esc(P.libelleClasse(l.classe.id))} ne passe pas par ${esc(sv.nom)}"></td>`;
        const eq = c.equipe;
        const duree = c.duree != null ? (vue === 'jour' ? c.duree * l.vols : c.duree) : null;
        const tdDuree = `<td class="rgr-d"${duree != null ? ` title="${c.source === 'robot' ? 'Plateaux ÷ débit' : 'Man-minutes ÷ personnes'}${vue === 'jour' ? ', sur la journée' : ', pour un vol'}"` : ''}>${duree != null ? heures(duree) : ''}</td>`;
        const partage = eq && eq.commandes > 1;
        const tdPers = !eq
          ? `<td class="rgr-p sans" title="Aucune case ne prépare ${esc(P.libelleClasse(l.classe.id))} dans ${esc(sv.nom)}">—</td>`
          : `<td class="rgr-p${partage ? ' partage' : ''}${eq.chaine ? ' chaine' : ''}" title="${c.source === 'robot' ? 'Robot' : 'Case'} « ${esc(eq.nom)} »${eq.chaine ? ' — à la chaîne : elle fait aussi cette étape' : ''}${c.source === 'robot' ? ' — tourne à partir de ' + (c.personnesMin ?? 1) : ''}${partage ? ' — partagée par ' + eq.commandes + ' commandes : son effectif vaut pour toutes' : ''}">`
            + `${this.persEquipe(eq)}</td>`;
        let tdVal;
        if (c.source === 'robot') {
          tdVal = vue === 'jour'
            ? `<td class="rgr robot g" title="${esc(lib)} : ${c.pax} plateaux sur la journée">${fr(c.debit)}</td>`
            : `<td class="rgr robot g${c.debitPropre ? ' propre' : ''}"><input type="number" min="1" step="10" value="${c.debitPropre ? c.debit : ''}" placeholder="${c.debitRobot}"
                data-rg-champ="recap-debit" data-atelier="${esc(eq.id)}" data-classe="${esc(l.classe.id)}"
                aria-label="Débit de ${esc(lib)} sur le robot, en plateaux par heure (robot : ${c.debitRobot})"
                title="${esc(lib)} — ${c.debitPropre ? 'débit propre' : 'débit du robot'} ; vide : celui du robot (${c.debitRobot} pl/h)"></td>`;
        } else if (vue === 'jour') {
          tdVal = `<td class="rgr ${c.source} g" title="${esc(lib)} : ${c.parVol == null ? 'à renseigner' : fr(c.parVol) + ' man-min par vol × ' + l.vols + ' vol' + (l.vols > 1 ? 's' : '')}">${c.jour == null ? '—' : fr(c.jour)}</td>`;
        } else if (c.source === 'case') {
          tdVal = `<td class="rgr case g" title="Fixée dans la case « ${esc(c.atelier)} » : ${fr(c.jour)} man-min pour la journée, soit ${fr(c.parVol)} par vol (barème : ${c.bareme == null ? 'rien' : fr(c.bareme)}). Elle se change dans la case.">${fr(c.parVol)}</td>`;
        } else {
          tdVal = `<td class="rgr ${c.source} g"><input type="number" min="0" step="0.1" value="${c.parVol == null ? '' : c.parVol}"
            placeholder="${c.source === 'manque' ? 'à saisir' : ''}" data-rg-champ="recap" data-service="${esc(sv.id)}" data-classe="${esc(l.classe.id)}"
            aria-label="Man-minutes par vol : ${esc(lib)}" title="${esc(lib)} — ${c.source === 'propre' ? 'valeur propre' : c.source === 'commun' ? 'valeur toutes compagnies' : 'à renseigner'}"></td>`;
        }
        return tdVal + tdPers + tdDuree;
      };
      // La ligne récap d'une compagnie : ses services par compagnie (l'armement), le
      // reste vide. Minutes par vol (les siennes, sinon « toutes les compagnies »),
      // l'effectif de l'équipe qui la coche, la durée d'un vol.
      const celluleCie = (l, sv) => {
        const c = l.cellules[sv.id];
        if (c.source === 'hors') return '<td class="rgr vide g" colspan="3"></td>';
        if (c.source === 'robot') return `<td class="rgr vide g" colspan="3" title="Robot : des plateaux à un débit, pas des man-minutes"></td>`;
        if (c.source === 'somme') {
          const val = vue === 'jour' ? c.jour : c.parVol;
          // Sous la colonne des minutes, comme les valeurs de ses classes.
          return `<td class="rgr somme g" title="${esc(l.compagnie + ' · ' + sv.nom)} : somme de ${c.classes} ${c.classes > 1 ? 'classes' : 'classe'}${vue === 'jour' ? ' sur la journée' : ', pour un vol de chacune'}${c.manque ? ' — ' + c.manque + ' à renseigner' : ''}">${val ? (vue === 'jour' ? heures(val) : fr(val)) : '—'}${c.manque ? '<i class="rgr-manque-pt" aria-label="valeurs à renseigner"></i>' : ''}</td><td></td><td></td>`;
        }
        const lib = l.compagnie + ' · ' + sv.nom, eq = c.equipe;
        const duree = c.duree != null ? (vue === 'jour' ? c.duree * c.vols : c.duree) : null;
        const tdVal = vue === 'jour'
          ? `<td class="rgr ${c.source} g" title="${esc(lib)} : ${c.parVol == null ? 'à renseigner' : fr(c.parVol) + ' man-min par vol × ' + c.vols + ' vol' + (c.vols > 1 ? 's' : '')}">${c.jour == null ? '—' : fr(c.jour)}</td>`
          : `<td class="rgr ${c.source} g"><input type="number" min="0" step="0.1" value="${c.source === 'propre' ? c.parVol : ''}" placeholder="${c.commun != null ? fr(c.commun) : 'à saisir'}"
              data-rg-champ="recap-cie" data-service="${esc(sv.id)}" data-cie="${esc(l.compagnie)}"
              aria-label="Man-minutes par vol : ${esc(lib)}" title="${esc(lib)} — ${c.source === 'propre' ? 'valeur propre à la compagnie' : c.source === 'commun' ? 'valeur toutes compagnies' : 'à renseigner'} ; vide : celle de toutes les compagnies"></td>`;
        const tdPers = !eq ? `<td class="rgr-p sans" title="Aucune équipe de ${esc(sv.nom)} ne coche ${esc(l.compagnie)}">—</td>`
          : `<td class="rgr-p${eq.commandes > 1 ? ' partage' : ''}" title="Équipe « ${esc(eq.nom)} »${eq.commandes > 1 ? ' — partagée : son effectif vaut pour toutes ses compagnies' : ''}">${this.persEquipe(eq)}</td>`;
        return tdVal + tdPers + `<td class="rgr-d">${duree != null ? heures(duree) : ''}</td>`;
      };
      // Un bloc par compagnie (retour d'usage du 02/10 : « utilise cette ligne comme
      // ligne récap / total, et rends le tableau plus digeste ») : sa ligne total en
      // tête — la somme de ses classes, service par service, et ses services par
      // compagnie (l'armement) —, ses classes dessous, repliées tant qu'on ne les ouvre pas.
      const ordre = [], vues = new Set();
      for (const l of lignes) if (!vues.has(l.classe.cie)) { vues.add(l.classe.cie); ordre.push(l.classe.cie); }
      for (const l of lignesCie) if (!vues.has(l.compagnie)) { vues.add(l.compagnie); ordre.push(l.compagnie); }
      const ouverts = this.recapOuverts || (this.recapOuverts = new Set());
      const nomCab = c => (P.NOM_CABINE || {})[c.cabine] || c.cabine;
      const ligneClasse = l => `<tr class="rg-recap-classe" data-classe="${esc(l.classe.id)}"><th scope="row"><span class="puce-classe" data-cab="${esc(l.classe.cabine)}"></span>${esc(nomCab(l.classe))}<span class="sr-only"> ${esc(l.classe.cie)}</span></th>
          <td class="rg-recap-vols">${l.vols}</td>${r.colonnes.map(sv => cellule(l, sv)).join('')}<td class="rg-recap-total g">${vue === 'jour' ? heures(l.jour) : fr(l.parVol)}</td></tr>`;
      const ligneCie = (l, ouvert, n) => `<tr class="rg-recap-cie" data-compagnie="${esc(l.compagnie)}"><th scope="row">
          <button type="button" class="rg-cie-btn" data-rg-action="recap-cie" data-compagnie="${esc(l.compagnie)}" aria-expanded="${ouvert}" title="${ouvert ? 'Replier' : 'Déplier'} les classes de ${esc(l.compagnie)}">
            <span class="rg-cie-chevron" aria-hidden="true"></span><span class="rg-cie-code">${esc(l.compagnie)}</span>
            <small>${n ? n + (n > 1 ? ' classes' : ' classe') : 'par compagnie'}</small></button></th>
          <td class="rg-recap-vols" title="Départs de la compagnie">${l.vols}</td>${r.colonnes.map(sv => celluleCie(l, sv)).join('')}<td class="rg-recap-total g">${vue === 'jour' ? heures(l.jour) : fr(l.parVol)}</td></tr>`;
      const corps = ordre.map(cie => {
        const siennes = lignes.filter(l => l.classe.cie === cie), tot = lignesCie.find(l => l.compagnie === cie);
        // Une recherche ouvre ce qu'elle trouve.
        const ouvert = !tot || !!filtre || ouverts.has(cie);
        return `<tbody class="rg-recap-bloc${ouvert ? ' ouvert' : ''}" data-compagnie="${esc(cie)}">${tot ? ligneCie(tot, ouvert, siennes.length) : ''}${siennes.map(ligneClasse).join('')}</tbody>`;
      }).join('');
      const manque = r.lignes.concat(r.lignesCie || []).reduce((n, l) => n + Object.values(l.cellules).filter(c => c.source === 'manque').length, 0);
      box.innerHTML = `<p class="rg-recap-resume">${r.lignes.length} commandes${(r.lignesCie || []).length ? ' · ' + r.lignesCie.length + ' compagnies' : ''} · ${r.colonnes.length} services · <b>${heures(r.totaux.jourTotal)}</b> de travail demandé par les chemins sur la journée${
        r.totaux.sansEquipe ? `, dont <b>${heures(r.totaux.avecEquipe)}</b> dans les cases d’une équipe (le travail fourni des Résultats) et ${heures(r.totaux.sansEquipe)} que personne ne prépare encore` : ''}${
        manque ? ` · <b class="rg-manque-txt">${manque} ${manque > 1 ? 'valeurs' : 'valeur'} à renseigner</b>` : ''}</p>
        <p class="rg-recap-plier"><button type="button" class="lien-discret" data-rg-action="recap-tout" data-ouvrir="1">Tout déplier</button> ·
          <button type="button" class="lien-discret" data-rg-action="recap-tout" data-ouvrir="0">Tout replier</button></p>
        <div class="rg-recap-scroll"><table class="rg-recap-table">
        <thead><tr class="rg-recap-t1"><th scope="col" rowspan="2">Compagnie · classe</th><th scope="col" rowspan="2" title="Nombre de vols de la journée">Vols</th>
          ${r.colonnes.map(sv => `<th scope="colgroup" colspan="3" class="g"><span class="rg-recap-svc">${I ? I.ico(I.icoService(sv.id, sv.nom)) : ''}${esc(sv.nom)}</span></th>`).join('')}
          <th scope="col" rowspan="2" class="g">${vue === 'jour' ? 'Total journée' : 'Total par vol'}<small>man-min</small></th></tr>
          <tr class="rg-recap-t2">${r.colonnes.map(sv => `<th scope="col" class="g" title="${sv.robot ? 'Débit en plateaux par heure' : vue === 'jour' ? 'Man-minutes sur la journée' : 'Man-minutes pour un vol'}">${sv.robot ? 'pl/h' : vue === 'jour' ? 'min/jour' : 'min/vol'}</th>
            <th scope="col" title="Personnes de l’équipe qui prépare">pers.</th><th scope="col" title="${vue === 'jour' ? 'Durée sur la journée' : 'Durée d’un vol'}">durée</th>`).join('')}</tr></thead>
        ${corps}
        ${lignes.length || lignesCie.length ? '' : `<tbody><tr><td colspan="${r.colonnes.length * 3 + 3}" class="mini-note">Aucune commande ne correspond à « ${esc(filtre)} ».</td></tr></tbody>`}
        <tfoot><tr><th scope="row">Total journée</th><td></td>${r.colonnes.map(sv => `<td class="g">${sv.robot ? '' : heures(r.totaux.jour[sv.id])}</td><td></td><td></td>`).join('')}<td class="rg-recap-total g">${heures(r.totaux.jourTotal)}</td></tr></tfoot>
        </table></div>
        <p class="mini-note">${vue === 'jour' ? 'Man-minutes sur la journée : par vol × nombre de vols. Totaux en heures de travail.'
          : 'Man-minutes pour un vol. Changer une case la rend propre à cette compagnie × classe ; la vider la ramène à la valeur « toutes compagnies ».'}
          Pour chaque service : la valeur, l’effectif de l’équipe qui prépare (modifiable) et la durée = man-minutes ÷ personnes
          (robot : plateaux ÷ débit). Un effectif <span class="rgr-p partage"><span>souligné en pointillé</span></span> est celui d’une case partagée par
          plusieurs commandes : il vaut pour toutes. La ligne d’une compagnie est son total : la somme de ses classes, service par
          service ; un service qui travaille par compagnie (l’armement) s’y règle — minutes par vol × départs de la compagnie ;
          vide, la valeur de toutes les compagnies.</p>`;
    }

    /* Ce que le récap a changé, dans l'ordre : 'bareme' ou 'cases'. */
    pile(quoi) { (this.pileRecap || (this.pileRecap = [])).push(quoi); this.pileRedo = []; }
    annulerRecap(refaire) {
      const de = refaire ? (this.pileRedo || []) : (this.pileRecap || []);
      const vers = refaire ? (this.pileRecap || (this.pileRecap = [])) : (this.pileRedo || (this.pileRedo = []));
      const quoi = de.pop() || 'bareme';
      if (quoi === 'cases' && this.a.histoireCases) this.a.histoireCases(refaire); else this.histoire(refaire);
      vers.push(quoi);
    }

    exporterRecap() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      T.telecharger('ory-man-minutes-' + new Date().toISOString().slice(0, 10) + '.xlsx', T.ecrireClasseur(E.recapVersClasseur(this.contexteRecap())));
      this.rendre('Man-minutes exportées : modifiez-les dans Excel, puis « ⇧ Importer ».');
    }

    async importerRecap(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        const E = root.OrlyEchanges, T = root.OrlyTableur, ctx = this.contexteRecap();
        const r = E.classeurVersRecap(await T.lireFichier(f, 4 * 1024 * 1024), ctx.bareme, ctx);
        if (!r.changes) return this.rendre('Man-minutes lues : aucune valeur ne change.');
        const np = Object.keys(r.personnes || {}).length, nr = Object.keys(r.debits || {}).length, nb = r.changes - np - nr;
        if (!confirm('Changer ' + r.changes + (r.changes > 1 ? ' valeurs' : ' valeur') + ' d’après le fichier ('
          + [nb ? nb + ' man-minutes' : '', np ? np + (np > 1 ? ' effectifs de case' : ' effectif de case') : '',
            nr ? nr + (nr > 1 ? ' robots (débits)' : ' robot (débits)') : ''].filter(Boolean).join(', ') + ') ? L’action est annulable.')) return;
        const nd = Object.keys(r.debits || {}).length;
        if ((np || nd) && this.a.casesImportees && this.a.casesImportees(r.personnes || {}, r.debits || {})) this.pile('cases');
        if (nb) {
          const detail = { ...this.etat.detail };
          for (const [sid, t] of Object.entries(r.bareme)) if (Object.keys(t).some(k => !k.startsWith(P.TOUTES + '/'))) detail[sid] = 'compagnie';
          this.changer(() => { this.etat.bareme = r.bareme; this.etat.detail = detail; }, '');
          this.pile('bareme');
        }
        this.rendre('Man-minutes importées : ' + r.changes + (r.changes > 1 ? ' valeurs changées.' : ' valeur changée.'));
      } catch (err) {
        this.rendre('Import refusé — ' + err.message + '\nLes man-minutes en place sont conservées.');
      } finally { e.target.value = ''; }
    }

    rendreRendement() {
      const r = document.getElementById('rg-rendement'); if (!r) return;
      r.value = this.etat.rendement;
      document.getElementById('rg-rendement-val').textContent =
        this.etat.rendement.toFixed(2).replace('.', ',');
    }

    rendreRegime() {
      const box = document.getElementById('rg-seuils'); if (!box) return;
      const s = this.etat.regime;
      // Même précaution : changer la présence ne doit pas redessiner les seuils.
      const signature = JSON.stringify(s.seuils);
      if (box._signature !== signature) {
      box._signature = signature;
      box.innerHTML = s.seuils.map((x, i) => `<div class="rg-seuil">
        <span>Après</span>
        <input type="number" min="0" max="1440" step="5" value="${x.apres}"
          data-rg-champ="seuil-apres" data-index="${i}" aria-label="Travail cumulé avant la pause ${i + 1}">
        <span>min de travail, pause de</span>
        <input type="number" min="1" max="240" step="5" value="${x.duree}"
          data-rg-champ="seuil-duree" data-index="${i}" aria-label="Durée de la pause ${i + 1}">
        <span>min</span>
        <button class="btn btn-sm" data-rg-action="seuil-retirer" data-index="${i}">Retirer</button>
      </div>`).join('') || '<p class="mini-note">Aucune pause : les équipes travaillent sans s’arrêter.</p>';
      }

      const p = document.getElementById('rg-presence');
      if (document.activeElement !== p) p.value = s.presence;
      const arret = s.seuils.reduce((n, x) => n + x.duree, 0);
      const travail = Math.max(0, s.presence - arret);
      document.getElementById('rg-presence-note').innerHTML =
        `Soit <b>${String(Math.round(travail / 6) / 10).replace('.', ',')} h de travail effectif</b>
         — ${s.presence} min moins ${arret} min de pause.`;
    }

    /* ---- échange de fichiers -------------------------------------------- */

    /* Le classeur du barème : une ligne par compagnie × classe et par service
     * de son parcours. C'est la trame de l'étude de temps. */
    exporter() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      const classes = this.a.classes ? this.a.classes() : [];
      const octets = T.ecrireClasseur(E.baremeVersClasseur(
        { bareme: this.etat.bareme, rendement: this.etat.rendement, regime: this.etat.regime },
        { services: this.a.services ? this.a.services() : [], classes,
          routes: this.a.routes ? this.a.routes(classes) : new Map(),
          sansBareme: new Set(this.a.sansBareme ? this.a.sansBareme() : []) }));
      T.telecharger('ory-bareme-' + new Date().toISOString().slice(0, 10) + '.xlsx', octets);
      this.rendre('Barème exporté : remplissez la colonne « Minutes par vol », puis « Importer ».');
    }

    async importer(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        let lu;
        if (/\.json$/i.test(f.name)) {
          // L'ancien échange, en JSON : toujours lu, et converti s'il comptait par passager.
          if (f.size > 1024 * 1024) throw new Error('Fichier trop volumineux (1 Mo maximum).');
          const brut = JSON.parse(await f.text());
          if (!brut || brut.schema !== 'ory-bareme') throw new Error('Fichier de barème attendu (schema « ory-bareme »).');
          lu = valider(brut);
        } else {
          const E = root.OrlyEchanges, T = root.OrlyTableur;
          const r = E.classeurVersBareme(await T.lireFichier(f, 4 * 1024 * 1024),
            { services: this.a.services ? this.a.services() : [] });
          // Un service chiffré compagnie par compagnie dans le classeur se saisit
          // de même sur le site.
          const detail = { ...this.etat.detail };
          for (const [sid, t] of Object.entries(r.bareme))
            if (Object.keys(t).some(k => !k.startsWith(P.TOUTES + '/'))) detail[sid] = 'compagnie';
          lu = valider({ ...this.etat, ...r, detail, regime: { ...this.etat.regime, ...(r.regime || {}) } });
        }
        const n = Object.values(lu.bareme).reduce((k, t) => k + Object.keys(t).length, 0);
        if (!confirm('Remplacer le barème entier par celui du fichier (' + n + (n > 1 ? ' valeurs' : ' valeur') + ') ? L’action est annulable.')) return;
        this.converti = false;
        this.changer(() => { this.etat = lu; }, 'Barème importé : ' + n + (n > 1 ? ' valeurs.' : ' valeur.'));
      } catch (err) {
        this.rendre('Import refusé — ' + err.message + '\nLe barème en place est conservé.');
      } finally { e.target.value = ''; }
    }
  }

  const api = { CLE, valider, CentreReglages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyReglages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
