/* ==========================================================================
 *  L'ACCUEIL — le menu principal, et l'état de chaque partie
 *
 *  Quelqu'un qui n'est pas du métier de l'informatique doit comprendre, d'un
 *  coup d'œil, ce que fait ce site et où il en est. L'accueil montre quatre
 *  tuiles, une par partie du travail :
 *
 *      Données        ce qu'on importe : les vols, les temps de travail
 *      Organisation   ce qu'on décrit : chemins, cases, liens de l'unité
 *      Réglages       ce qu'on essaie : horaires, rythme, pauses
 *      Résultats      ce que la journée donne
 *
 *  Chaque tuile porte son état en clair (fait, exemple, à faire) et ses pages.
 *  L'histoire « Comment ça marche » y est racontée en quatre images ; elle
 *  n'encombre plus le haut de chaque page.
 *
 *  Les « étapes » calculées ici (etapes, suite) restent la mesure de ce qui
 *  est fait : les tuiles les regroupent par partie.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // « provisoire » : ça marche, mais avec des valeurs d'exemple ou à confirmer.
  // Ce n'est pas une alerte : pas de « ! » orange pour un site qu'on découvre.
  const ETATS = { fait: '✓', verifier: '!', afaire: '·', provisoire: '~' };
  const MOTS = { fait: 'fait', verifier: 'à vérifier', afaire: 'à faire', provisoire: 'provisoire' };

  /** Le titre et la phrase d'accueil de chaque vue, en mots de tous les jours. */
  const VUES = {
    vols: { titre: 'Les vols',
      intro: 'Les avions qui partent aujourd’hui, et si leurs repas sont prêts à temps.' },
    ateliers: { titre: 'Qui prépare quoi',
      intro: 'Une commande par compagnie et par classe : par où elle passe, et quelle équipe la prépare.' },
    reglages: { titre: 'Les temps de travail',
      intro: 'Combien de minutes chaque service passe sur un vol : c’est ce qui fait durer chaque préparation.' },
    plan: { titre: 'La journée',
      intro: 'Rejouez la journée sur le plan de l’unité : qui travaille, qui attend, ce qui est prêt.' },
    flux: { titre: 'L’unité : qui livre qui',
      intro: 'Les liens entre les services de l’unité. Ils ne servent qu’aux commandes qui n’ont pas de chemin.' }
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
      etat: !vols.total ? 'afaire' : vols.source === 'importe' ? 'fait' : 'provisoire',
      detail: !vols.total ? 'aucun vol'
        : pluriel(vols.departs, 'départ') + (vols.source === 'importe' ? ' · les vôtres' : ' · exemple'),
      geste: !vols.total ? 'Importer vos vols'
        : vols.source === 'importe' ? null : 'Remplacer l’exemple par vos vols'
    });

    out.push({
      cle: 'ateliers', onglet: 'ateliers', num: 2, titre: VUES.ateliers.titre,
      etat: !at.fabriquent || at.absentes ? 'afaire' : 'fait',
      detail: !at.fabriquent ? 'aucune équipe'
        : at.absentes ? pluriel(at.absentes, 'commande') + ' sans équipe'
          : pluriel(at.fabriquent, 'équipe') + ' · tout est couvert',
      geste: !at.fabriquent ? 'Décrire une première équipe'
        : at.absentes ? 'Donner une équipe aux commandes qui n’en ont pas' : null
    });

    out.push({
      cle: 'bareme', onglet: 'reglages', num: 3, titre: VUES.reglages.titre,
      etat: bar.calibre ? 'fait' : 'provisoire',
      detail: bar.calibre ? 'vos chiffres' : 'chiffres d’exemple',
      geste: bar.calibre ? null : 'Remplacer les chiffres d’exemple par votre étude'
    });

    const retard = (j.suivies || 0) - (j.aHeure || 0);
    out.push({
      cle: 'journee', onglet: 'plan', num: 4, titre: VUES.plan.titre,
      etat: !j.calculee ? 'afaire' : retard > 0 ? 'verifier' : 'fait',
      detail: !j.calculee ? 'rien à calculer encore'
        : retard > 0 ? pluriel(retard, 'commande') + ' en retard'
        : 'tout est à l’heure' + (j.fin ? ' · fini à ' + j.fin : ''),
      geste: null
    });

    out.push({
      cle: 'unite', onglet: 'flux', num: null, annexe: true, titre: 'L’unité',
      etat: flux.alertes ? 'verifier' : plan.approx ? 'provisoire' : 'fait',
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
    const provisoire = liste.find(s => s.etat === 'provisoire' && s.geste);
    if (provisoire) return { etape: provisoire, texte: provisoire.geste };
    return { etape: null, texte: null };
  }

  /** La page où l'on fait le geste d'une étape. */
  const PAGE_DE_VUE = { vols: 'v-programme', ateliers: 'at-chemins', reglages: 'rg-minutes', plan: 'j-chiffres', flux: 'u-lecture' };

  const PIRE = ['afaire', 'verifier', 'provisoire', 'fait'];
  const pire = etats => PIRE.find(x => etats.includes(x)) || 'fait';

  /**
   * L'état de chaque partie du menu, pour les tuiles de l'accueil.
   * @param {object} e comme `etapes()`, plus
   *   reglages — { delai, decalage, rendement, pauses }
   * @returns {Array} [{ partie, etat, lignes:[{ texte, etat }] }]
   */
  function tuiles(e) {
    const par = Object.fromEntries(etapes(e).map(x => [x.cle, x]));
    const ligne = (cle, nom) => ({ texte: nom + ' : ' + par[cle].detail, etat: par[cle].etat });
    const r = e.reglages || {};
    const donnees = [ligne('vols', 'Vols'), ligne('bareme', 'Temps de travail')];
    const organisation = [ligne('ateliers', 'Équipes'), ligne('unite', 'Unité')];
    const reglages = [
      { texte: 'Repas prêts ' + (r.delai ?? 45) + ' min avant le départ'
        + (r.decalage ? ' · vols décalés de ' + (r.decalage > 0 ? '+' : '') + r.decalage + ' min' : ''), etat: 'fait' },
      { texte: 'Rythme ' + String(r.rendement ?? 1).replace('.', ',')
        + ' · ' + pluriel(r.pauses ?? 0, 'pause') + ' par poste', etat: 'fait' }];
    const resultats = [ligne('journee', 'Journée')];
    return [
      { partie: 'donnees', etat: pire(donnees.map(l => l.etat)), lignes: donnees },
      { partie: 'organisation', etat: pire(organisation.map(l => l.etat)), lignes: organisation },
      { partie: 'reglages', etat: 'fait', lignes: reglages },
      { partie: 'resultats', etat: pire(resultats.map(l => l.etat)), lignes: resultats }
    ];
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
    { picto: 'avion', ico: 'avion', couleur: 'var(--c-vols)', titre: 'Des avions partent',
      texte: 'à heure fixe, pleins de passagers' },
    { picto: 'plateau', ico: 'plateau', couleur: 'var(--cab-BC)', titre: 'Chaque vol commande ses repas',
      texte: 'une commande par compagnie et par classe' },
    { picto: 'equipe', ico: 'equipe', couleur: 'var(--c-equipes)', titre: 'Des équipes les préparent',
      texte: 'de service en service' },
    { picto: 'horloge', ico: 'chrono', couleur: 'var(--c-journee)', titre: 'Le site calcule la journée',
      texte: 'chaque commande prête à l’heure, ou en retard ?' }
  ];
  const I = () => root.OrlyIcones;
  const icone = (nom, classe) => I() ? I().ico(nom, classe) : '';

  const O = () => root.OrlyOnglets;

  class Accueil {
    /**
     * @param {object} a adaptateur :
     *   menu()          — le <nav> de l'en-tête où dessiner les parties
     *   accueil()       — l'élément où dessiner la page d'accueil
     *   etat()          — l'objet attendu par `tuiles()`
     *   partie()        — la partie ouverte ('accueil' sur l'accueil)
     * Les boutons portent `data-vers-partie` ou `data-page` : c'est la page
     * qui écoute les clics, pour l'en-tête comme pour l'accueil.
     */
    constructor(a) {
      this.a = a;
      this.rendre();
    }

    rendre() { this.rendreMenu(); this.rendreAccueil(); }

    /* L'en-tête : l'accueil, puis les quatre parties ; celle qui est ouverte est marquée. */
    rendreMenu() {
      const m = this.a.menu && this.a.menu(); if (!m || !O()) return;
      const ouverte = this.a.partie ? this.a.partie() : null;
      const bouton = (id, nom, ico, couleur) => {
        const on = id === ouverte;
        return `<button type="button" class="menu-partie${on ? ' actif' : ''}" data-vers-partie="${id}" style="--c:${couleur}"
          ${on ? 'aria-current="page"' : ''}>${icone(ico)}<span>${esc(nom)}</span></button>`;
      };
      const html = bouton('accueil', 'Accueil', 'unite', 'var(--accent)')
        + O().PARTIES.filter(p => !p.cache).map(p => bouton(p.id, p.nom, p.ico, p.couleur)).join('');
      if (m.innerHTML !== html) m.innerHTML = html;
    }

    /* La page d'accueil : l'histoire en quatre images, ce qu'il y a à faire
     * ensuite, puis une tuile par partie avec son état et ses pages. */
    rendreAccueil() {
      const h = this.a.accueil && this.a.accueil(); if (!h || !O()) return;
      const e = this.a.etat(), etat = Object.fromEntries(tuiles(e).map(t => [t.partie, t]));
      const s = suite(etapes(e));
      const suiteHtml = s.etape
        ? `<p class="acc-suite">${icone('ampoule')}<span>À faire ensuite :</span>
            <button type="button" class="lien-fort" data-page="${PAGE_DE_VUE[s.etape.onglet]}">${esc(s.texte)} →</button></p>`
        : `<p class="acc-suite fait">${icone('check')}<span>Tout est en place : regardez les <button type="button" class="lien-fort" data-page="j-chiffres">résultats →</button></span></p>`;
      const tuile = p => {
        const t = etat[p.id];
        const pages = O().pagesDe(p.id).map(x => `<button type="button" class="acc-page" data-page="${x.id}">${esc(x.nom)}</button>`).join('');
        return `<article class="acc-tuile ${t.etat}" style="--c:${p.couleur}">
          <button type="button" class="acc-tuile-tete" data-vers-partie="${p.id}">
            <span class="acc-ico" aria-hidden="true">${icone(p.ico)}</span>
            <span class="acc-titre"><b>${esc(p.nom)}</b><em>${esc(p.resume)}</em></span>
            <span class="acc-etat ${t.etat}">${esc(MOTS[t.etat])}</span>
          </button>
          <ul class="acc-lignes">${t.lignes.map(l => `<li class="${l.etat}"><span class="etape-etat ${l.etat}" aria-hidden="true">${ETATS[l.etat]}</span>${esc(l.texte)}</li>`).join('')}</ul>
          <nav class="acc-pages" aria-label="Les pages de ${esc(p.nom)}">${pages}</nav>
        </article>`;
      };
      const html = `<div class="acc">
        <section class="acc-histoire" aria-label="Comment ça marche">
          <h1>Simuler une journée de repas à bord</h1>
          <ol class="cm-liste">${COMMENT.map((x, i) => `<li style="--c:${x.couleur}">
            <span class="cm-rond">${I() ? I().ico(x.ico, 'cm-picto') : picto(x.picto)}<span class="cm-num">${i + 1}</span></span>
            <b>${esc(x.titre)}</b><p>${esc(x.texte)}</p></li>`).join('')}</ol>
        </section>
        ${suiteHtml}
        <div class="acc-tuiles">${O().PARTIES.filter(p => !p.cache).map(tuile).join('')}</div>
        <p class="acc-pied"><button type="button" class="btn btn-sm" data-page="u-sauvegarde">${icone('boite')} Sauvegarde et limites du calcul</button></p>
      </div>`;
      if (h.innerHTML !== html) h.innerHTML = html;
    }
  }

  const api = { ETATS, MOTS, VUES, COMMENT, PAGE_DE_VUE, etapes, suite, tuiles, Accueil };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemarrage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
