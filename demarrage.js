/* ==========================================================================
 *  L'HISTOIRE DU SITE — quatre étapes, dans l'ordre où l'on pense
 *
 *  Quelqu'un qui n'est pas du métier de l'informatique doit comprendre, d'un
 *  coup d'œil, ce que fait ce site et où il en est :
 *
 *      1. Les vols               quels avions partent, et quand
 *      2. Qui prépare quoi       par où passent les repas, quelle équipe
 *      3. Les temps de travail   combien de minutes chaque service y passe
 *      4. La journée             le résultat : à l'heure, ou en retard
 *
 *  et, à part, l'unité elle-même (le plan et qui livre qui), qu'on règle une
 *  fois pour toutes.
 *
 *  Ces étapes SONT la navigation : pas d'onglets d'un côté et d'un fil « par
 *  où commencer » de l'autre, qui disaient deux fois la même chose. Chaque
 *  étape porte son état en clair — fait, à vérifier, à faire.
 *
 *  Un encart « Comment ça marche » raconte l'histoire en quatre images ; il
 *  s'ouvre à la première visite et se rouvre depuis l'en-tête.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ETATS = { fait: '✓', verifier: '!', afaire: '·' };
  const MOTS = { fait: 'fait', verifier: 'à vérifier', afaire: 'à faire' };

  /** Le titre et la phrase d'accueil de chaque vue, en mots de tous les jours. */
  const VUES = {
    vols: { titre: 'Les vols',
      intro: 'Les avions qui partent aujourd’hui, et si leurs repas sont prêts à temps.' },
    ateliers: { titre: 'Qui prépare quoi',
      intro: 'Par où passe chaque repas, et quelle équipe le prépare à chaque étape.' },
    reglages: { titre: 'Les temps de travail',
      intro: 'Combien de minutes chaque service passe sur un vol : c’est ce qui fait durer chaque préparation.' },
    plan: { titre: 'La journée',
      intro: 'Rejouez la journée sur le plan de l’unité : qui travaille, qui attend, ce qui est prêt.' },
    flux: { titre: 'L’unité : qui livre qui',
      intro: 'Les liens entre les services de l’unité. Ils ne servent qu’aux repas qui n’ont pas de chemin.' }
  };

  const pluriel = (n, mot, pl) => n + ' ' + (n > 1 ? (pl || mot + 's') : mot);

  /**
   * Les étapes, d'après l'état de l'application.
   *
   * @param {object} e
   *   vols     — { total, departs, source } ('demo' ou 'importe')
   *   plan     — { services, approx }  approx : zones encore « à confirmer »
   *   flux     — { liaisons, alertes } alertes graves de la lecture du graphe
   *   ateliers — { total, fabriquent, absentes }
   *   bareme   — { calibre }
   *   journee  — { calculee, suivies, aHeure, fin }
   * @returns {Array} [{ cle, onglet, num, titre, etat, detail, geste, annexe }]
   */
  function etapes(e) {
    const vols = e.vols || {}, plan = e.plan || {}, flux = e.flux || {},
          at = e.ateliers || {}, bar = e.bareme || {}, j = e.journee || {};
    const out = [];

    out.push({
      cle: 'vols', onglet: 'vols', num: 1, titre: VUES.vols.titre,
      etat: !vols.total ? 'afaire' : vols.source === 'importe' ? 'fait' : 'verifier',
      detail: !vols.total ? 'aucun vol'
        : pluriel(vols.departs, 'départ') + (vols.source === 'importe' ? ' · les vôtres' : ' · exemple'),
      geste: !vols.total ? 'Importer vos vols'
        : vols.source === 'importe' ? null : 'Remplacer l’exemple par vos vols'
    });

    out.push({
      cle: 'ateliers', onglet: 'ateliers', num: 2, titre: VUES.ateliers.titre,
      etat: !at.fabriquent ? 'afaire' : at.absentes ? 'verifier' : 'fait',
      detail: !at.fabriquent ? 'aucune équipe'
        : pluriel(at.fabriquent, 'équipe')
          + (at.absentes ? ' · ' + pluriel(at.absentes, 'repas', 'repas') + ' sans équipe' : ' · tout est couvert'),
      geste: !at.fabriquent ? 'Décrire une première équipe'
        : at.absentes ? 'Donner une équipe aux repas qui n’en ont pas' : null
    });

    out.push({
      cle: 'bareme', onglet: 'reglages', num: 3, titre: VUES.reglages.titre,
      etat: bar.calibre ? 'fait' : 'verifier',
      detail: bar.calibre ? 'vos chiffres' : 'chiffres d’exemple',
      geste: bar.calibre ? null : 'Remplacer les chiffres d’exemple par votre étude'
    });

    const retard = (j.suivies || 0) - (j.aHeure || 0);
    out.push({
      cle: 'journee', onglet: 'plan', num: 4, titre: VUES.plan.titre,
      etat: !j.calculee ? 'afaire' : retard > 0 ? 'verifier' : 'fait',
      detail: !j.calculee ? 'rien à calculer encore'
        : retard > 0 ? pluriel(retard, 'repas', 'repas') + ' en retard'
        : 'tout est à l’heure' + (j.fin ? ' · fini à ' + j.fin : ''),
      geste: null
    });

    out.push({
      cle: 'unite', onglet: 'flux', num: null, annexe: true, titre: 'L’unité',
      etat: plan.approx || flux.alertes ? 'verifier' : 'fait',
      detail: pluriel(plan.services || 0, 'service') + ' · ' + pluriel(flux.liaisons || 0, 'lien')
        + (plan.approx ? ' · ' + pluriel(plan.approx, 'zone') + ' à confirmer' : '')
        + (flux.alertes ? ' · ' + flux.alertes + ' à corriger' : ''),
      geste: null
    });

    return out;
  }

  /** Ce qu'il y a à faire maintenant : la première étape à faire, sinon à vérifier. */
  function suite(liste) {
    const afaire = liste.find(s => s.etat === 'afaire' && s.geste);
    if (afaire) return { etape: afaire, texte: afaire.geste };
    const verifier = liste.find(s => s.etat === 'verifier' && s.geste);
    if (verifier) return { etape: verifier, texte: verifier.geste };
    return { etape: null, texte: null };
  }

  /* Quatre images simples, dessinées au trait : elles portent l'histoire mieux
   * qu'un paragraphe. */
  const PICTOS = {
    avion: '<path d="M26 5 C28.5 5 29.5 8.5 29.5 12 L29.5 21 L47 30 L47 34.5 L29.5 29 L29.5 39 L35 43.5 L35 47 L26 44.5 L17 47 L17 43.5 L22.5 39 L22.5 29 L5 34.5 L5 30 L22.5 21 L22.5 12 C22.5 8.5 23.5 5 26 5 Z"/>',
    plateau: '<rect x="6" y="14" width="40" height="26" rx="4"/><circle cx="20" cy="27" r="7"/><path d="M34 20 L34 34 M38 20 L38 34 M31 20 L31 25 Q34 28 37 25"/>',
    equipe: '<circle cx="16" cy="16" r="6"/><circle cx="34" cy="16" r="6"/><path d="M6 40 Q6 26 16 26 Q26 26 26 40 M24 40 Q24 26 34 26 Q44 26 44 40"/>',
    horloge: '<circle cx="26" cy="26" r="18"/><path d="M26 14 L26 26 L34 31"/>'
  };
  const picto = nom => `<svg viewBox="0 0 52 52" aria-hidden="true" class="cm-picto">${PICTOS[nom]}</svg>`;

  const COMMENT = [
    { picto: 'avion', titre: 'Des avions partent',
      texte: 'Le programme dit à quelle heure part chaque vol, et combien de passagers il emporte, classe par classe.' },
    { picto: 'plateau', titre: 'Chaque vol emporte ses repas',
      texte: 'On les compte par compagnie et par classe — Air France en Business, par exemple. Ils doivent être prêts avant le chargement.' },
    { picto: 'equipe', titre: 'Des équipes les préparent',
      texte: 'Les repas passent de service en service : réception, cuisine, montage… Chaque service a ses équipes, leurs horaires, leur effectif.' },
    { picto: 'horloge', titre: 'Le site calcule la journée',
      texte: 'Il dit à quelle heure chaque repas est prêt, lequel est en retard, et ce qui l’a fait attendre.' }
  ];

  class Demarrage {
    /**
     * @param {object} a adaptateur :
     *   hote()        — l'élément <nav> où dessiner les étapes
     *   comment()     — l'élément où dessiner « Comment ça marche »
     *   etat()        — l'objet attendu par `etapes()`
     *   vue()         — la vue affichée
     *   aller(onglet) — changer de vue
     */
    constructor(a) {
      this.a = a;
      let vu = false;
      try { vu = localStorage.getItem('ory-comment-vu') === '1'; } catch (e) { /* sans mémoire */ }
      this.ouvert = !vu;
      const hote = a.hote();
      if (hote) hote.addEventListener('click', ev => {
        const b = ev.target.closest('[data-view]');
        if (b && !b.disabled && this.a.aller) this.a.aller(b.dataset.view);
      });
      const c = a.comment && a.comment();
      if (c) c.addEventListener('click', ev => {
        if (ev.target.closest('[data-comment-fermer]')) this.basculer(false);
        const b = ev.target.closest('[data-view]');
        if (b && this.a.aller) { this.basculer(false); this.a.aller(b.dataset.view); }
      });
      this.rendre();
      this.rendreComment();
    }

    /** Ouvre ou referme « Comment ça marche ». Refermé une fois, il le reste. */
    basculer(ouvrir) {
      this.ouvert = ouvrir === undefined ? !this.ouvert : !!ouvrir;
      if (!this.ouvert) { try { localStorage.setItem('ory-comment-vu', '1'); } catch (e) { /* sans mémoire */ } }
      this.rendreComment();
      return this.ouvert;
    }

    rendre() {
      const hote = this.a.hote(); if (!hote) return;
      const liste = etapes(this.a.etat());
      const vue = this.a.vue ? this.a.vue() : null;
      const prochain = suite(liste).etape;
      const bouton = s => {
        const actif = s.onglet === vue;
        return `<button data-view="${s.onglet}" class="etape ${s.etat}${actif ? ' active' : ''}${s.annexe ? ' annexe' : ''}"
          aria-pressed="${actif}" ${actif ? 'aria-current="page"' : ''}
          aria-label="${esc((s.num ? 'Étape ' + s.num + ' : ' : '') + s.titre + ' — ' + s.detail + ' (' + MOTS[s.etat] + ')')}">
          ${s.num ? `<span class="etape-num" aria-hidden="true">${s.num}</span>` : '<span class="etape-num annexe" aria-hidden="true">⚙</span>'}
          <span class="etape-txt"><b>${esc(s.titre)}</b>
            <em><span class="etape-etat ${s.etat}" aria-hidden="true">${ETATS[s.etat]}</span>${esc(s.detail)}</em></span>
          ${prochain && prochain.cle === s.cle && !actif ? '<span class="etape-suite">à faire ensuite</span>' : ''}
        </button>`;
      };
      const principales = liste.filter(s => !s.annexe), annexes = liste.filter(s => s.annexe);
      const html = `<ol class="etapes-liste">${principales.map((s, i) =>
          `<li>${bouton(s)}</li>${i < principales.length - 1 ? '<li class="etape-fleche" aria-hidden="true">›</li>' : ''}`).join('')}</ol>
        <div class="etapes-annexe">${annexes.map(bouton).join('')}</div>`;
      if (hote.innerHTML !== html) hote.innerHTML = html;
    }

    rendreComment() {
      const c = this.a.comment && this.a.comment(); if (!c) return;
      c.hidden = !this.ouvert;
      document.querySelectorAll('[data-comment-bouton]').forEach(b => b.setAttribute('aria-expanded', String(this.ouvert)));
      if (!this.ouvert || c.dataset.rendu) return;
      c.dataset.rendu = '1';
      c.innerHTML = `<div class="cm-tete"><h2>Comment ça marche</h2>
          <button class="btn btn-sm" data-comment-fermer>J’ai compris</button></div>
        <ol class="cm-liste">${COMMENT.map((x, i) => `<li>${picto(x.picto)}
          <b><span class="cm-num">${i + 1}</span>${esc(x.titre)}</b><p>${esc(x.texte)}</p></li>`).join('')}</ol>
        <p class="cm-pied">Pour commencer, suivez les étapes dans l’ordre, de <b>1. Les vols</b> à <b>4. La journée</b>.
          Tant que l’étude de temps de l’unité n’est pas importée, <b>les chiffres sont des exemples</b> : ils montrent le
          fonctionnement, pas la réalité.</p>`;
    }
  }

  const api = { ETATS, MOTS, VUES, COMMENT, etapes, suite, Demarrage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemarrage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
