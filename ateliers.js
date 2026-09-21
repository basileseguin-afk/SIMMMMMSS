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
      const type = a.type === 'robot' ? 'robot' : 'manuel';
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
        ...(type === 'robot' ? {
          debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 320,
          personnesMin: Number.isInteger(a.personnesMin) ? Math.max(0, a.personnesMin) : 1
        } : {})
      };
    });
    return { schema: 'ory-ateliers', version: 1, ateliers };
  }

  const vide = () => ({ schema: 'ory-ateliers', version: 1, ateliers: [] });

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

    get classes() { return this.a.classes() || []; }

    calculer() {
      const r = this.a.reglages ? this.a.reglages() : {};
      try {
        this.resultat = P.simuler({
          vols: this.a.vols(), ateliers: this.state.ateliers, liaisons: this.a.liaisons(),
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
      }
    }

    /* Un champ qui déclenche `change` est encore en train de perdre le focus :
     * remplacer tout de suite le HTML qui le contient fait échouer le rendu.
     * On laisse le navigateur finir, puis on redessine. */
    saisir(champ, id, el) {
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return;
      const v = el.value;
      setTimeout(() => this.appliquerSaisie(champ, a, el, v), 0);
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
            else { delete a.debit; delete a.personnesMin; }
            break;
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
            <option value="robot" ${a.type === 'robot' ? 'selected' : ''}>Robot</option></select></label>
          <label>Début<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          <label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
          <label>Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>
          ${a.type === 'robot' ? `
          <label>Débit (plateaux/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"></label>
          <label>Personnes minimum<input type="number" min="0" value="${a.personnesMin}" data-at-champ="personnesMin"></label>` : ''}
        </div>

        <div class="at-sous-titre">Lots, dans l’ordre de fabrication
          <span class="mini-note">le premier part à l’heure de début, les suivants quand le précédent est fini</span></div>
        ${lots || '<p class="mini-note">Aucun lot : cet atelier ne fabrique rien.</p>'}
        <div class="at-actions-lot">
          <button class="btn btn-sm" data-at-action="lot-ajouter">+ Lot</button>
          <button class="btn btn-sm" data-at-action="lot-separer">Une classe par lot</button>
          <button class="btn btn-sm" data-at-action="lot-tout">Tout en un seul lot</button>
        </div>

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
      const classes = this.classes;
      if (!classes.length) { box.innerHTML = '<p class="mini-note">Aucun départ dans le programme courant.</p>'; return; }
      const par = (r && r.parClasse) || {};
      box.innerHTML = `<table class="at-table"><thead><tr>
        <th scope="col">Compagnie × classe</th><th scope="col">Passagers</th><th scope="col">Vols</th>
        <th scope="col">Échéance</th><th scope="col">Fin</th><th scope="col">État</th><th scope="col">Services</th>
        </tr></thead><tbody>` +
        classes.map(c => {
          const v = par[c.id] || {};
          const etat = v.absente ? '<span class="at-etat manque">jamais fabriquée</span>'
            : v.fin == null ? '<span class="at-etat manque">inachevée</span>'
            : v.aHeure ? '<span class="at-etat ok">à l’heure</span>'
            : '<span class="at-etat retard">+' + Math.round(v.retard) + ' min</span>';
          return `<tr><th scope="row">${esc(c.id)}</th><td>${c.pax}</td><td>${c.vols.length}</td>
            <td>${P.hhmm(c.echeance)}</td><td>${v.fin == null ? '—' : P.hhmm(v.fin)}</td><td>${etat}</td>
            <td class="at-parcours">${esc((v.services || []).join(' → ')) || '—'}</td></tr>`;
        }).join('') + '</tbody></table>';
    }
  }

  const api = { CentreAteliers, valider, vide, CLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAteliers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
