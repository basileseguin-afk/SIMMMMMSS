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
 *    1. le BARÈME    — homme-minutes par service et par cabine ;
 *    2. le RENDEMENT — part du temps de présence réellement produite ;
 *    3. le POSTE     — seuils de pause et durée de présence par défaut ;
 *    4. l'IMPORT/EXPORT du barème, pour recevoir une étude en bloc.
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
    const b = brut || {};
    return {
      bareme: validerBareme(b.bareme),
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

  /** Un barème : service → cabine → { parPax, parVol }. */
  function validerBareme(brut) {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return clone(P.BAREME_DEMO);
    const out = {};
    for (const [service, table] of Object.entries(brut).slice(0, 200)) {
      if (!service || service.length > 160 || !table || typeof table !== 'object') continue;
      const ligne = {};
      for (const cabine of P.CABINES) {
        const c = table[cabine] || {};
        ligne[cabine] = { parPax: min(c.parPax, 0), parVol: min(c.parVol, 0) };
      }
      out[service] = ligne;
    }
    return Object.keys(out).length ? out : clone(P.BAREME_DEMO);
  }

  /** Une ligne vide, pour un service que le barème ne connaît pas encore. */
  const ligneVide = () => Object.fromEntries(P.CABINES.map(c => [c, { parPax: 0, parVol: 0 }]));

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
      let alerte = '';
      try {
        const garde = localStorage.getItem(CLE);
        if (garde) this.etat = valider(JSON.parse(garde));
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
        <h2 class="reglages-titre">Le modèle de production</h2>
        <p class="mini-note rg-intro">Ce qui pilote les <b>ateliers de travail</b> : le temps que coûte
          une compagnie × classe dans chaque service, et les règles de poste. Le reste de cette page
          décrit l’ancien moteur de démonstration, celui de la vue Simulation.</p>
        <p id="rg-status" role="status" aria-live="polite"></p>
        <div class="panneau" id="rg-bareme-panneau">
          <h3>Barème — homme-minutes</h3>
          <p class="mini-note">Pour un service et une cabine : les minutes de travail d’<b>un passager</b>,
            plus celles que coûte <b>un vol</b> quel que soit son remplissage.
            <span class="rg-formule">durée = homme-minutes ÷ personnes ÷ rendement</span></p>
          <div id="rg-alerte"></div>
          <div id="rg-bareme"></div>
          <div class="rg-actions">
            <button class="btn btn-sm" id="rg-undo">Annuler</button>
            <button class="btn btn-sm" id="rg-redo">Rétablir</button>
            <button class="btn btn-sm" id="rg-export">Exporter le barème</button>
            <button class="btn btn-sm" id="rg-import-btn">Importer</button>
            <button class="btn btn-sm" id="rg-reset">Valeurs de démonstration</button>
            <input id="rg-import" type="file" accept=".json" hidden>
          </div>
        </div>
        <div class="panneau">
          <h3>Rendement</h3>
          <div class="slider-ligne">
            <label for="rg-rendement">Part du temps réellement produite <b id="rg-rendement-val"></b></label>
            <input id="rg-rendement" type="range" min="0.5" max="1.2" step="0.01">
          </div>
          <p class="mini-note">Un coefficient unique, appliqué à tous les services. Au-dessous de 1,
            la journée s’allonge d’autant. S’il doit varier par service ou par heure, c’est le barème
            qu’il faut enrichir, pas ce curseur.</p>
        </div>
        <div class="panneau">
          <h3>Poste de travail</h3>
          <p class="mini-note">Les seuils comptent le travail <b>cumulé</b>, pas l’heure qu’il est :
            une équipe qui attend ses amonts ne consomme pas son crédit, donc ne prend pas sa pause.</p>
          <div id="rg-seuils"></div>
          <div class="rg-actions">
            <button class="btn btn-sm" id="rg-seuil-ajouter">+ Seuil</button>
          </div>
          <div class="champ">
            <span>Présence sur le site (min)</span>
            <input id="rg-presence" type="number" min="30" max="1440" step="5">
          </div>
          <p class="mini-note" id="rg-presence-note"></p>
        </div>
        <p class="rg-version" id="rg-version"></p>
        <p class="mini-note rg-ailleurs">Deux réglages du modèle ne sont pas ici, parce qu’ils se
          décrivent atelier par atelier : les <b>tunnels de la plonge</b> — leur somme fait son débit —
          et la <b>boucle du matériel</b>. Ils sont dans l’onglet <b>Ateliers de travail</b>.</p>`;
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
      sur('rg-import-btn', 'click', () => document.getElementById('rg-import').click());
      sur('rg-import', 'change', e => this.importer(e));
      sur('rg-seuil-ajouter', 'click', () => this.changer(() => {
        const dernier = this.etat.regime.seuils[this.etat.regime.seuils.length - 1];
        this.etat.regime.seuils.push({ apres: (dernier ? dernier.apres : 0) + 180, duree: 15 });
      }, 'Seuil ajouté.'));
      sur('rg-rendement', 'input', e => {
        document.getElementById('rg-rendement-val').textContent = (+e.target.value).toFixed(2).replace('.', ',');
      });
      sur('rg-rendement', 'change', e =>
        this.changer(() => { this.etat.rendement = +e.target.value; }, 'Rendement enregistré.'));
      sur('rg-presence', 'change', e =>
        this.changer(() => { this.etat.regime.presence = +e.target.value; }, 'Présence enregistrée.'));

      const section = document.getElementById('rg-modele');
      section.addEventListener('change', e => {
        const champ = e.target.dataset.rgChamp; if (!champ) return;
        const { service, cabine, index } = e.target.dataset;
        const v = e.target.value;
        // Le rendu remplace le tableau : le faire PENDANT le `change` arrache
        // le champ qu'on vient de quitter, et le navigateur refuse. On laisse
        // l'événement se terminer d'abord.
        setTimeout(() => this.changer(() => {
          if (champ === 'parPax' || champ === 'parVol') {
            const ligne = this.etat.bareme[service] || (this.etat.bareme[service] = ligneVide());
            ligne[cabine][champ] = min(v, 0);
          } else if (champ === 'seuil-apres') this.etat.regime.seuils[+index].apres = min(v, 0);
          else if (champ === 'seuil-duree') this.etat.regime.seuils[+index].duree = min(v, 0);
        }, 'Enregistré.'), 0);
      });
      section.addEventListener('click', e => {
        const b = e.target.closest('[data-rg-action="seuil-retirer"]'); if (!b) return;
        this.changer(() => { this.etat.regime.seuils.splice(+b.dataset.index, 1); }, 'Seuil retiré.');
      });
    }

    /* ---- rendu ---------------------------------------------------------- */

    rendre(message) {
      if (message !== undefined) {
        const s = document.getElementById('rg-status'); if (s) s.textContent = message || '';
      }
      this.rendreBareme();
      this.rendreRendement();
      this.rendreRegime();
      const u = document.getElementById('rg-undo'), r = document.getElementById('rg-redo');
      if (u) u.disabled = !this.undo.length;
      if (r) r.disabled = !this.redo.length;
    }

    rendreBareme() {
      const box = document.getElementById('rg-bareme'); if (!box) return;
      const services = (this.a.services ? this.a.services() : []);
      const complet = this.baremeComplet();
      // Remplacer le tableau détruit ses champs. Si rien n'a bougé, on n'y
      // touche pas : sinon un rendu déclenché par la sortie d'un champ
      // arrache le bouton qu'on était en train de cliquer, et le clic se perd.
      const signature = JSON.stringify([services.map(s => [s.id, s.nom]), complet, this.etat.bareme]);
      if (box._signature === signature) return;
      box._signature = signature;
      // Un `input[type=number]` n'accepte que le point décimal : « 0,6 » le
      // laisse vide, et le barème semble ne rien contenir.
      const nombre = n => String(n);

      box.innerHTML = `<table class="rg-table"><thead>
        <tr><th scope="col" rowspan="2">Service</th>${P.CABINES.map(c =>
          `<th scope="col" colspan="2">${c}</th>`).join('')}</tr>
        <tr>${P.CABINES.map(() => '<th scope="col">min/pax</th><th scope="col">min/vol</th>').join('')}</tr>
        </thead><tbody>` + services.map(s => {
          const propre = this.etat.bareme[s.id];
          const pere = this.a.parent ? this.a.parent(s.id) : null;
          const herite = !propre && pere && complet[s.id];
          const ligne = propre || complet[s.id] || ligneVide();
          const marque = herite
            ? '<span class="rg-herite" title="Même travail que l’atelier dont elle dépend">hérité</span>'
            : propre ? '' : '<span class="rg-zero">non renseigné</span>';
          return `<tr${propre ? '' : ' class="rg-pale"'}><th scope="row">${esc(s.nom)} ${marque}</th>`
            + P.CABINES.map(c => ['parPax', 'parVol'].map(k =>
              `<td><input type="number" min="0" step="0.01" value="${nombre(ligne[c][k])}"
                 data-rg-champ="${k}" data-service="${esc(s.id)}" data-cabine="${c}"
                 aria-label="${esc(s.nom)} ${c} ${k === 'parPax' ? 'minutes par passager' : 'minutes par vol'}"></td>`
            ).join('')).join('') + '</tr>';
        }).join('') + '</tbody></table>';

      // Le barème n'est pas calibré : le dire ici, là où on le modifie.
      const alerte = document.getElementById('rg-alerte');
      const memeQueDemo = JSON.stringify(this.etat.bareme) === JSON.stringify(P.BAREME_DEMO);
      alerte.innerHTML = memeQueDemo
        ? `<p class="rg-avertissement"><b>Valeurs de démonstration, non calibrées.</b> Elles n’existent
           que pour que le modèle tourne. Tant qu’elles ne sont pas remplacées par une étude réelle,
           aucune durée affichée ne permet de dimensionner une équipe.</p>`
        : '';
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
      </div>`).join('') || '<p class="mini-note">Aucun seuil : les équipes travaillent sans pause.</p>';
      }

      const p = document.getElementById('rg-presence');
      if (document.activeElement !== p) p.value = s.presence;
      const arret = s.seuils.reduce((n, x) => n + x.duree, 0);
      const travail = Math.max(0, s.presence - arret);
      document.getElementById('rg-presence-note').innerHTML =
        `Soit <b>${String(Math.round(travail / 6) / 10).replace('.', ',')} h de travail effectif</b>
         (${s.presence} min de présence − ${arret} min de pause).
         Elle s’applique à tout atelier qui n’a pas fixé la sienne.`;
    }

    /* ---- échange de fichiers -------------------------------------------- */

    exporter() {
      const contenu = { schema: 'ory-bareme', version: 1, bareme: this.etat.bareme,
        rendement: this.etat.rendement, regime: this.etat.regime };
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }));
      lien.download = 'bareme-' + new Date().toISOString().slice(0, 10) + '.json';
      lien.click();
      setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
      this.rendre('Barème exporté. Les services sont désignés par leur identifiant du plan.');
    }

    async importer(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        if (f.size > 1024 * 1024) throw new Error('Fichier trop volumineux (1 Mo maximum).');
        const brut = JSON.parse(await f.text());
        if (!brut || brut.schema !== 'ory-bareme') throw new Error('Fichier de barème attendu (schema « ory-bareme »).');
        const lu = valider(brut);
        if (!confirm('Remplacer le barème et les règles de poste ? L’action est annulable.')) return;
        this.changer(() => { this.etat = lu; }, 'Barème importé.');
      } catch (err) {
        this.rendre('Import refusé : ' + err.message + ' Le barème en place est conservé.');
      } finally { e.target.value = ''; }
    }
  }

  const api = { CLE, valider, validerBareme, CentreReglages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyReglages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
