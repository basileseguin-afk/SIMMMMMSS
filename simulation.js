/* ==========================================================================
 *  LA VUE SIMULATION — la journée du modèle par ateliers, relue sur le plan
 *
 *  Elle tournait sur le moteur précédent : effectifs par curseur, files
 *  d'attente, contenances, vivier. On regardait donc un modèle qui n'était
 *  plus celui qu'on décrivait dans « Ateliers de travail ». Deux vérités sur
 *  le même écran, et des réglages qui se verrouillaient « pendant l'essai ».
 *
 *  Ici, rien n'est calculé : `moteur/production.js` a déjà calculé la journée,
 *  `replay.js` dit où l'on en est à un instant donné, et ce module le montre.
 *
 *  Conséquences, toutes bonnes :
 *   • changer un réglage **recalcule dans l'instant** — plus de verrou ;
 *   • le curseur de temps **va dans les deux sens** ;
 *   • ce qu'on voit sur le plan est ce qu'on a décrit dans l'onglet Ateliers.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const R = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./replay.js') : root.OrlyReplay;
  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./moteur/production.js') : root.MoteurProduction;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Ce que chaque état dit sur le plan, et le mot qui va avec. */
  const LIBELLE = {
    travail: 'au travail',
    attente: 'attend un amont',
    fini:    'a fini',
    avenir:  'pas commencé'
  };

  class VueSimulation {
    /**
     * @param {object} a adaptateur :
     *   resultat()      — le retour de `simuler()`
     *   services()      — [{id, nom}] pour nommer les zones
     *   selection()     — le service mis en avant, ou ''
     *   selectionner(id)
     *   surInstant(i)   — appelé à chaque pas, pour colorer le plan
     */
    constructor(a) {
      this.a = a;
      this.t = 0;
      this.enMarche = false;
      this.vitesse = 30;          // minutes simulées par seconde
      this.frame = null;
      this.dernier = 0;
      this.lier();
      this.recalculer();
    }

    /* ---- la journée -------------------------------------------------- */

    get resultat() { return this.a.resultat() || { lots: [], parClasse: {}, ateliers: [] }; }

    /**
     * La journée a changé (un atelier, un réglage, un vol) : on garde l'heure
     * qu'on regardait si elle existe encore, sinon on revient au début. Sauter
     * au début à chaque frappe rendrait la saisie insupportable.
     */
    recalculer() {
      const avant = this.debut;
      const b = R.bornes(this.resultat);
      this.debut = b.debut; this.fin = b.fin; this.vide = b.vide;
      // Tant qu'on n'a pas bougé le curseur, on suit le début de la journée :
      // décrire un atelier plus matinal ne doit pas laisser la lecture en plein
      // milieu. Dès qu'on a choisi une heure, elle est respectée.
      if (avant !== undefined && this.t === avant) this.t = this.debut;
      if (!Number.isFinite(this.t) || this.t < this.debut || this.t > this.fin) this.t = this.debut;
      if (this.vide) this.pause();
      this.rendreBilan();
      this.rendre();
    }

    /* ---- lecture ------------------------------------------------------ */

    lancer() {
      if (this.enMarche || this.vide) return;
      if (this.t >= this.fin) this.t = this.debut;
      this.enMarche = true;
      this.dernier = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.boucle(this.dernier);
      this.rendreTransport();
    }

    pause() {
      this.enMarche = false;
      if (this.frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
      this.frame = null;
      this.rendreTransport();
    }

    basculer() { this.enMarche ? this.pause() : this.lancer(); }

    auDebut() { this.pause(); this.t = this.debut; this.rendre(); }

    allerA(t) {
      this.t = Math.max(this.debut, Math.min(this.fin, +t || 0));
      this.rendre();
    }

    /** Le prochain instant où quelque chose change : un pas utile, pas une minute. */
    pasSuivant() {
      this.pause();
      const s = R.prochainChangement(this.resultat, this.t);
      this.t = s == null ? this.fin : Math.min(this.fin, s);
      this.rendre();
    }

    boucle(ts) {
      if (!this.enMarche) return;
      const dt = Math.min(0.1, (ts - this.dernier) / 1000);
      this.dernier = ts;
      this.t = Math.min(this.fin, this.t + dt * this.vitesse);
      this.rendre();
      if (this.t >= this.fin) { this.pause(); return; }
      if (typeof requestAnimationFrame === 'function') {
        this.frame = requestAnimationFrame(t => this.boucle(t));
      }
    }

    /* ---- rendu -------------------------------------------------------- */

    rendre() {
      const i = R.instant(this.resultat, this.t);
      this.rendreHorloge();
      this.rendreChiffres(i.chiffres);
      this.rendreServices(i);
      this.rendreTransport();
      if (this.a.surInstant) this.a.surInstant(i);
    }

    rendreHorloge() {
      const h = document.getElementById('horloge');
      if (h) h.textContent = this.vide ? '—' : P.hhmm(this.t);
      const j = document.querySelector('.jour');
      if (j) {
        j.textContent = this.vide
          ? 'Aucune journée à relire'
          : 'Journée calculée · ' + P.hhmm(this.debut) + '–' + P.hhmm(this.fin);
      }
      const c = document.getElementById('sim-curseur');
      if (c) {
        c.min = this.debut; c.max = this.fin; c.disabled = this.vide;
        if (document.activeElement !== c) c.value = this.t;
      }
    }

    rendreTransport() {
      const b = document.getElementById('btn-play');
      if (b) {
        b.textContent = this.vide ? '▶ Lire' : this.enMarche ? '⏸ Pause' : this.t >= this.fin ? '▶ Revoir' : '▶ Lire';
        b.className = this.enMarche ? 'btn btn-pause' : 'btn btn-play';
        b.disabled = this.vide;
      }
      const e = document.getElementById('run-state');
      if (e) {
        e.textContent = this.vide ? 'Rien à relire : décrivez des ateliers'
          : this.enMarche ? 'Lecture en cours'
          : this.t >= this.fin ? 'Fin de journée'
          : this.t <= this.debut ? 'Prêt à lire' : 'En pause';
      }
    }

    rendreChiffres(c) {
      const mettre = (id, valeur, classe, noteId, note) => {
        const v = document.getElementById(id); if (!v) return;
        v.innerHTML = valeur;
        v.className = 'val ' + (classe || '');
        const n = document.getElementById(noteId);
        if (n) n.textContent = note;
      };
      // La ponctualité ne juge que les échéances déjà passées : à l'aube, il
      // n'y a encore rien à juger, et « 0 % » serait une fausse alarme.
      const part = c.exigibles ? c.tenues / c.exigibles : null;
      mettre('kpi-ontime', part == null ? '—' : Math.round(part * 100) + ' %',
        part == null ? '' : part >= 0.9 ? 'bon' : part >= 0.7 ? 'moyen' : 'mauvais',
        'kpi-denom', c.exigibles ? c.tenues + ' / ' + c.exigibles + ' échéances passées tenues'
          : c.suivies ? 'aucune échéance encore passée' : 'aucune classe fabriquée');
      mettre('kpi-overdue', String(c.enRetard), c.enRetard ? 'mauvais' : '',
        'kpi-ready', c.enRetard ? 'classes pas encore sorties' : 'aucune échéance manquée à cet instant');
      mettre('kpi-wip', c.auTravail + ' <small>services</small>', '', 'kpi-wip-note', 'qui fabriquent à cet instant');
      mettre('kpi-debit', c.enAttente + ' <small>services</small>', c.enAttente ? 'moyen' : '',
        'kpi-debit-note', 'postes ouverts, amont pas encore livré');
    }

    /**
     * Le bilan de la journée entière. Il ne dépend pas de l'instant relu :
     * c'est la réponse à « et au bout du compte ? », qu'on veut sous les yeux
     * pendant qu'on regarde comment on y arrive.
     */
    rendreBilan() {
      const box = document.getElementById('bilan-journee'); if (!box) return;
      const r = this.resultat, k = r.indicateurs;
      if (this.vide || !k) {
        box.innerHTML = '<p class="mini-note">Rien à résumer : aucun atelier ne fabrique encore.</p>';
        return;
      }
      const lignes = [
        ['À l’heure', k.classesSuivies ? k.aHeure + ' / ' + k.classesSuivies + ' classes' + (k.partAHeure != null ? ' · ' + k.partAHeure + ' %' : '') : '—'],
        ['Retard le plus long', k.retardMax ? Math.round(k.retardMax) + ' min' : 'aucun'],
        ['Dernière sortie', k.finDerniere != null && Number.isFinite(k.finDerniere) ? P.hhmm(k.finDerniere) : '—'],
        ['Attente cumulée', Math.round(k.attenteTotale || 0) + ' min'],
        ['Travail', (k.hommeHeures || 0).toFixed(1).replace('.', ',') + ' homme-heures']
      ];
      if (k.classesAbsentes) lignes.push(['Sans atelier', k.classesAbsentes + ' classe(s) que personne ne fabrique']);
      box.innerHTML = '<dl class="bilan">' + lignes.map(([q, v]) =>
        '<div><dt>' + esc(q) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>';
    }

    /** La liste de droite : un service, son état, ce qu'il fait. */
    rendreServices(i) {
      const box = document.getElementById('stats-ateliers'); if (!box) return;
      const services = this.a.services();
      const vus = services.filter(s => i.services[s.id]);
      if (!vus.length) {
        box.innerHTML = '<p class="mini-note">Aucun service ne travaille : décrivez des ateliers.</p>';
        return;
      }
      const selection = this.a.selection ? this.a.selection() : '';
      const rang = { travail: 0, attente: 1, avenir: 2, fini: 3 };
      vus.sort((x, y) => rang[i.services[x.id].etat] - rang[i.services[y.id].etat]
        || x.nom.localeCompare(y.nom));
      box.innerHTML = vus.map(s => {
        const e = i.services[s.id];
        return `<button class="stat-atelier etat-${e.etat}${s.id === selection ? ' active' : ''}"
          data-station="${esc(s.id)}" aria-pressed="${s.id === selection}">
          <div class="haut"><span>${esc(s.nom)}</span><b>${esc(LIBELLE[e.etat])}</b></div>
          <div class="stat-quoi">${e.etat === 'avenir' ? '' : esc(e.nom || '')}</div>
        </button>`;
      }).join('');
      for (const b of box.querySelectorAll('[data-station]')) {
        b.addEventListener('click', () => this.a.selectionner && this.a.selectionner(b.dataset.station));
      }
    }

    /* ---- commandes ---------------------------------------------------- */

    lier() {
      const sur = (id, ev, fn) => { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
      sur('btn-play', 'click', () => this.basculer());
      sur('btn-reset', 'click', () => this.auDebut());
      sur('sim-pas', 'click', () => this.pasSuivant());
      sur('sim-curseur', 'input', e => { this.pause(); this.allerA(e.target.value); });
      sur('vitesse', 'input', e => {
        this.vitesse = +e.target.value || 30;
        const v = document.getElementById('vitesse-val');
        if (v) v.textContent = this.vitesse + '×';
      });
    }
  }

  const api = { LIBELLE, VueSimulation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlySimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
