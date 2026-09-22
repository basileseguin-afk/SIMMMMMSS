/* ==========================================================================
 *  PAR OÙ COMMENCER — le fil de la mise en route
 *
 *  Le reproche est juste : on arrive sur cinq onglets, trois bandeaux et un
 *  gros bouton « Lancer », et rien ne dit ni par quoi commencer, ni où l'on
 *  en est. L'application a pourtant un ordre d'opérations — elle le cachait.
 *
 *  Ce module ne calcule rien de neuf. Il relit ce que les autres savent déjà
 *  et en fait cinq étapes, chacune avec son état et son geste suivant :
 *
 *      1. le programme de vols      2. le plan des services
 *      3. les liaisons entre eux    4. les ateliers de travail
 *      5. le barème
 *
 *  Trois états, et trois seulement : **fait**, **à vérifier**, **à faire**.
 *  Un quatrième aurait demandé une légende ; trois se lisent sans.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ETATS = { fait: '✓', verifier: '!', afaire: '·' };

  /**
   * Les cinq étapes, d'après l'état de l'application.
   *
   * @param {object} e
   *   vols       — { total, departs, source } ('demo' ou 'importe')
   *   plan       — { services, approx }  approx : zones encore « à confirmer »
   *   flux       — { liaisons, alertes } alertes graves de la lecture du graphe
   *   ateliers   — { total, fabriquent, absentes, classes }
   *   bareme     — { calibre }
   * @returns {Array} [{ cle, titre, etat, detail, onglet, geste }]
   */
  function etapes(e) {
    const vols = e.vols || {}, plan = e.plan || {}, flux = e.flux || {},
          at = e.ateliers || {}, bar = e.bareme || {};
    const out = [];

    out.push({
      cle: 'vols', onglet: 'vols', titre: 'Programme de vols',
      etat: !vols.total ? 'afaire' : vols.source === 'importe' ? 'fait' : 'verifier',
      detail: !vols.total ? 'aucun vol chargé'
        : vols.departs + ' départ' + (vols.departs > 1 ? 's' : '')
          + (vols.source === 'importe' ? ' · importés' : ' · jeu de démonstration'),
      geste: !vols.total ? 'Importer un programme de vols'
        : vols.source === 'importe' ? null : 'Remplacer la démonstration par vos vols'
    });

    out.push({
      cle: 'plan', onglet: 'plan', titre: 'Plan des services',
      etat: plan.approx ? 'verifier' : 'fait',
      detail: (plan.services || 0) + ' service' + ((plan.services || 0) > 1 ? 's' : '')
        + (plan.approx ? ' · ' + plan.approx + ' à confirmer' : ''),
      geste: plan.approx ? 'Confirmer les zones approximatives' : null
    });

    // Les ateliers AVANT les flux : c'est l'atelier qui met un service sur le
    // chemin d'une classe, donc tant qu'aucune équipe n'est décrite le graphe
    // ne porte aucun parcours et rien ne peut être jugé de lui.
    out.push({
      cle: 'ateliers', onglet: 'ateliers', titre: 'Ateliers de travail',
      etat: !at.fabriquent ? 'afaire' : at.absentes ? 'verifier' : 'fait',
      detail: !at.total ? 'aucune équipe décrite'
        : at.fabriquent + ' équipe' + (at.fabriquent > 1 ? 's' : '')
          + (at.absentes ? ' · ' + at.absentes + ' classe' + (at.absentes > 1 ? 's' : '')
             + ' que personne ne fabrique' : ''),
      geste: !at.fabriquent ? 'Décrire une première équipe'
        : at.absentes ? 'Dire qui fabrique les classes restantes' : null
    });

    out.push({
      cle: 'flux', onglet: 'flux', titre: 'Liaisons entre services',
      etat: !flux.liaisons ? 'afaire'
        : !at.fabriquent ? 'afaire'
        : flux.alertes ? 'verifier' : 'fait',
      detail: !flux.liaisons ? 'aucune liaison'
        : !at.fabriquent ? flux.liaisons + ' liaison' + (flux.liaisons > 1 ? 's' : '')
            + ' · rien à vérifier sans équipe'
        : flux.liaisons + ' liaison' + (flux.liaisons > 1 ? 's' : '')
          + (flux.alertes ? ' · ' + flux.alertes + ' à corriger' : ''),
      geste: !flux.liaisons ? 'Dire qui fournit qui'
        : !at.fabriquent ? null
        : flux.alertes ? 'Corriger ce que le modèle ne peut pas lire' : null
    });

    out.push({
      cle: 'bareme', onglet: 'reglages', titre: 'Barème',
      etat: bar.calibre ? 'fait' : 'verifier',
      detail: bar.calibre ? 'renseigné' : 'valeurs de démonstration',
      geste: bar.calibre ? null : 'Remplacer le barème par votre étude'
    });

    return out;
  }

  /** La phrase qui dit quoi faire maintenant, et l'étape qu'elle vise. */
  function suite(liste) {
    const afaire = liste.find(s => s.etat === 'afaire');
    if (afaire) return { etape: afaire, texte: afaire.geste };
    const verifier = liste.find(s => s.etat === 'verifier' && s.geste);
    if (verifier) return { etape: verifier, texte: verifier.geste };
    return { etape: null, texte: null };
  }

  class Demarrage {
    /**
     * @param {object} a adaptateur :
     *   hote()    — l'élément où s'installer
     *   etat()    — l'objet attendu par `etapes()`
     *   aller(onglet) — changer de vue
     */
    constructor(a) {
      this.a = a;
      this.replie = false;
      try { this.replie = localStorage.getItem('ory-guide-replie') === '1'; } catch (e) { /* sans mémoire */ }
      this.construire();
      this.rendre();
    }

    construire() {
      const hote = this.a.hote(); if (!hote) return;
      this.el = document.createElement('nav');
      this.el.className = 'guide';
      this.el.id = 'guide';
      this.el.setAttribute('aria-label', 'Par où commencer');
      hote.appendChild(this.el);
      this.el.addEventListener('click', ev => {
        const repli = ev.target.closest('[data-guide-repli]');
        if (repli) {
          this.replie = !this.replie;
          try { localStorage.setItem('ory-guide-replie', this.replie ? '1' : '0'); } catch (e) { /* sans mémoire */ }
          return this.rendre();
        }
        const b = ev.target.closest('[data-guide]');
        if (b && this.a.aller) this.a.aller(b.dataset.guide);
      });
    }

    rendre() {
      if (!this.el) return;
      const liste = etapes(this.a.etat());
      const reste = liste.filter(s => s.etat !== 'fait').length;
      const prochain = suite(liste);

      // Tout est au vert : une ligne suffit. Un fil de mise en route qui
      // reste large une fois la mise en route finie devient du décor.
      if (!reste) {
        this.el.className = 'guide fini';
        this.el.innerHTML = `<p class="guide-fini"><span class="pastille fait">${ETATS.fait}</span>
          Tout est prêt. La journée se lit dans l’onglet
          <button class="lien" data-guide="ateliers">Ateliers de travail</button>.</p>`;
        return;
      }

      this.el.className = 'guide' + (this.replie ? ' replie' : '');
      const etapesHtml = liste.map((s, i) => `
        <li class="guide-etape ${s.etat}">
          <button data-guide="${s.onglet}" aria-label="${esc(s.titre)} — ${esc(s.detail)}">
            <span class="pastille ${s.etat}" aria-hidden="true">${ETATS[s.etat]}</span>
            <span class="guide-txt"><b>${i + 1}. ${esc(s.titre)}</b><em>${esc(s.detail)}</em></span>
          </button>
        </li>`).join('');

      this.el.innerHTML = `
        <div class="guide-tete">
          <h2>Par où commencer</h2>
          <p class="guide-suite">${prochain.texte
            ? '<b>Prochaine étape :</b> ' + esc(prochain.texte)
            : 'Il reste ' + reste + ' point(s) à vérifier.'}</p>
          ${prochain.etape ? `<button class="btn btn-play btn-sm" data-guide="${prochain.etape.onglet}">
            ${esc(prochain.texte)}</button>` : ''}
          <button class="text-button" data-guide-repli aria-expanded="${!this.replie}">
            ${this.replie ? 'Voir les étapes' : 'Masquer'}</button>
        </div>
        <ol class="guide-etapes">${etapesHtml}</ol>`;
    }
  }

  const api = { ETATS, etapes, suite, Demarrage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemarrage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
