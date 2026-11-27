/* ==========================================================================
 *  L'ACCUEIL — le guide, dans l'ordre du travail (évolution 26 f)
 *
 *  Quelqu'un qui n'est pas du métier de l'informatique doit comprendre, d'un
 *  coup d'œil, ce que fait ce site, où il en est et quoi faire ensuite.
 *  L'accueil est une entrée du menu, au-dessus de « Lire ». Il guide dans
 *  l'ordre du travail : on décrit son site, puis on importe les vols.
 *
 *      1  Commandes            les compagnies et leurs commandes
 *      2  Services et équipes  qui prépare quoi, en combien de temps
 *      3  Chemins              par où passe chaque commande
 *      4  Contrôles            ce qui manque encore
 *      5  Programme des vols   les vols de la journée
 *      6  Lire le résultat     la Synthèse
 *
 *  Chaque étape dit son état en clair (fait, provisoire, à vérifier, à faire)
 *  et mène à sa page. L'histoire « Comment ça marche » se raconte en quatre
 *  images, dans le même ordre. Le menu lui-même est dessiné par onglets.js.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // « provisoire » : ça marche, mais avec des valeurs d'exemple ou à confirmer.
  // Ce n'est pas une alerte : pas de « ! » orange pour un site qu'on découvre.
  const ETATS = { fait: '✓', verifier: '!', afaire: '·', provisoire: '~' };
  const MOTS = { fait: 'fait', verifier: 'à vérifier', afaire: 'à faire', provisoire: 'provisoire' };

  const pluriel = (n, mot, pl) => n + ' ' + (n > 1 ? (pl || mot + 's') : mot);

  /**
   * Les six étapes du guide, dans l'ordre du travail, d'après l'état de l'application.
   *
   * @param {object} e
   *   compagnies — { liste, n, commandes }  liste : l'unité a sa liste ; sinon, ses compagnies viennent des vols
   *   ateliers   — { total, fabriquent, absentes }
   *   bareme     — { calibre }  les temps par vol ne sont plus ceux de l'exemple
   *   chemins    — { flux, variantes, sansChemin }
   *   controles  — { bloquants, corriger, pret }  pret : « il ne manque que les vols »
   *   vols       — { total, departs, source } ('demo' ou 'importe')
   *   journee    — { calculee, suivies, aHeure, fin }
   * @returns {Array} [{ cle, page, lieu?, num, titre, ico, etat, detail, geste }]
   */
  function etapes(e) {
    const cies = e.compagnies || {}, at = e.ateliers || {}, bar = e.bareme || {}, ch = e.chemins || {},
          ct = e.controles || {}, vols = e.vols || {}, j = e.journee || {};
    const out = [];
    const etape = (cle, page, titre, ico, o) => out.push({ cle, page, num: out.length + 1, titre, ico, ...o });

    // 1. Les compagnies et leurs commandes. Sans liste, elles viennent des vols : provisoire.
    etape('commandes', 'mu-commandes', 'Commandes', 'plateau', !cies.n
      ? { lieu: 'ajout', etat: 'afaire', detail: 'aucune compagnie', geste: 'Ajouter une première compagnie' }
      : { etat: cies.liste ? 'fait' : 'provisoire',
          detail: pluriel(cies.n, 'compagnie') + ' · ' + pluriel(cies.commandes || 0, 'commande') + (cies.liste ? '' : ' · tirées des vols'),
          geste: cies.liste ? null : 'Faire votre liste de compagnies' });

    // 2. Les services et leurs équipes, et leurs temps par vol.
    etape('services', 'mu-services', 'Services et équipes', 'service', {
      etat: !at.fabriquent || at.absentes ? 'afaire' : bar.calibre ? 'fait' : 'provisoire',
      detail: !at.fabriquent ? 'aucune équipe'
        : at.absentes ? pluriel(at.absentes, 'commande') + ' sans équipe'
          : pluriel(at.fabriquent, 'équipe') + (bar.calibre ? ' · vos temps' : ' · temps d’exemple'),
      geste: !at.fabriquent ? 'Décrire une première équipe'
        : at.absentes ? 'Donner une équipe aux commandes qui n’en ont pas'
          : bar.calibre ? null : 'Remplacer les temps d’exemple par les vôtres' });

    // 3. Les chemins.
    etape('chemins', 'mu-flux', 'Chemins', 'reseau', {
      etat: ch.flux && !ch.sansChemin ? 'fait' : 'afaire',
      detail: !ch.flux ? 'aucun chemin'
        : pluriel(ch.flux, 'chemin') + (ch.sansChemin ? ' · ' + pluriel(ch.sansChemin, 'commande') + ' sans chemin' : ''),
      geste: !ch.flux ? 'Dessiner un premier chemin' : ch.sansChemin ? 'Donner un chemin aux commandes qui n’en ont pas' : null });

    // 4. Les contrôles : ce qui bloque, ce qui est à corriger ; ou « il ne manque que les vols ».
    etape('controles', 'mu-pas', 'Contrôles', 'alerte', {
      etat: ct.bloquants ? 'afaire' : ct.corriger ? 'verifier' : 'fait',
      detail: ct.bloquants || ct.corriger
        ? [ct.bloquants ? pluriel(ct.bloquants, 'point bloquant', 'points bloquants') : '', ct.corriger ? ct.corriger + ' à corriger' : ''].filter(Boolean).join(' · ')
        : ct.pret ? 'il ne manque que les vols' : 'rien à corriger',
      geste: ct.bloquants || ct.corriger ? 'Régler les points de « Contrôles »' : null });

    // 5. Le programme des vols : les vôtres, ou ceux de l'exemple.
    etape('vols', 'v-programme', 'Programme des vols', 'avion', {
      etat: !vols.total ? 'afaire' : vols.source === 'importe' ? 'fait' : 'provisoire',
      detail: !vols.total ? 'aucun vol'
        : pluriel(vols.departs || 0, 'départ') + (vols.source === 'importe' ? ' · les vôtres' : ' · exemple'),
      geste: vols.source === 'importe' && vols.total ? null : 'Importer vos vols' });

    // 6. Lire le résultat. Sans aucune commande (une liste vide), rien à lire : ce que le calcul suit encore (un service
    // par compagnie) ne dit pas qu'une commande est à l'heure.
    const retard = (j.suivies || 0) - (j.aHeure || 0), rien = !j.calculee || !j.suivies || (cies.liste && !cies.commandes);
    etape('journee', 'j-chiffres', 'Lire le résultat', 'journee', {
      etat: rien ? 'afaire' : retard > 0 ? 'verifier' : 'fait',
      detail: rien ? 'rien à calculer encore'
        : retard > 0 ? pluriel(retard, 'commande') + ' en retard'
          : 'tout est à l’heure' + (j.fin ? ' · fini à ' + j.fin : ''),
      geste: null });

    return out;
  }

  /** Ce qu'il y a à faire maintenant : la première étape à faire, sinon à vérifier, sinon provisoire — dans l'ordre du travail. */
  function suite(liste) {
    for (const etat of ['afaire', 'verifier', 'provisoire']) {
      const s = liste.find(x => x.etat === etat && x.geste);
      if (s) return { etape: s, texte: s.geste };
    }
    return { etape: null, texte: null };
  }

  /* Quatre images simples, dessinées au trait : elles portent l'histoire mieux
   * qu'un paragraphe. Dans l'ordre du travail (évolution 26 f) : les commandes,
   * les équipes et leurs chemins, les vols, puis le calcul. */
  const PICTOS = {
    avion: '<path d="M26 5 C28.5 5 29.5 8.5 29.5 12 L29.5 21 L47 30 L47 34.5 L29.5 29 L29.5 39 L35 43.5 L35 47 L26 44.5 L17 47 L17 43.5 L22.5 39 L22.5 29 L5 34.5 L5 30 L22.5 21 L22.5 12 C22.5 8.5 23.5 5 26 5 Z"/>',
    plateau: '<rect x="6" y="14" width="40" height="26" rx="4"/><circle cx="20" cy="27" r="7"/><path d="M34 20 L34 34 M38 20 L38 34 M31 20 L31 25 Q34 28 37 25"/>',
    equipe: '<circle cx="16" cy="16" r="6"/><circle cx="34" cy="16" r="6"/><path d="M6 40 Q6 26 16 26 Q26 26 26 40 M24 40 Q24 26 34 26 Q44 26 44 40"/>',
    horloge: '<circle cx="26" cy="26" r="18"/><path d="M26 14 L26 26 L34 31"/>'
  };
  const picto = nom => `<svg viewBox="0 0 52 52" aria-hidden="true" class="cm-picto">${PICTOS[nom]}</svg>`;

  const COMMENT = [
    { picto: 'plateau', ico: 'plateau', couleur: 'var(--cab-BC)', titre: 'Vos compagnies commandent',
      texte: 'une commande par compagnie et par classe' },
    { picto: 'equipe', ico: 'equipe', couleur: 'var(--c-equipes)', titre: 'Des équipes les préparent',
      texte: 'de service en service, sur leur chemin' },
    { picto: 'avion', ico: 'avion', couleur: 'var(--c-vols)', titre: 'Les vols donnent l’heure',
      texte: 'chaque commande part avec son vol' },
    { picto: 'horloge', ico: 'chrono', couleur: 'var(--c-journee)', titre: 'Le site calcule la journée',
      texte: 'chaque commande prête à l’heure, ou en retard ?' }
  ];
  const I = () => root.OrlyIcones;
  const icone = (nom, classe) => I() ? I().ico(nom, classe) : '';

  const O = () => root.OrlyOnglets;

  /** Le rond d'une étape : son numéro, ou une coche quand elle est faite. */
  const rond = x => `<span class="etape-etat ${x.etat}" aria-hidden="true">${x.etat === 'fait' ? icone('check') : x.num}</span>`;

  class Accueil {
    /**
     * @param {object} a adaptateur :
     *   accueil()       — l'élément où dessiner la page d'accueil
     *   etat()          — l'objet attendu par `etapes()`
     *   ferme(id)       — facultatif : vrai pour une page qui ne s'ouvre pas (la lecture seule, évolution 22 f) ; les
     *                     étapes dont la page ne s'ouvre pas se replient en une ligne (`motFerme`, « Paramétrage verrouillé »)
     * Les boutons portent `data-page` (et `data-lieu`) : c'est la page qui écoute les clics.
     */
    constructor(a) {
      this.a = a;
      this.rendre();
    }

    rendre() { this.rendreAccueil(); }

    /* La page d'accueil : l'histoire en quatre images, ce qu'il y a à faire ensuite, puis le guide — les six étapes du
     * travail, dans l'ordre, chacune avec son état et sa page ; « Fichiers », en bas, comme au menu. */
    rendreAccueil() {
      const h = this.a.accueil && this.a.accueil(); if (!h || !O()) return;
      const liste = etapes(this.a.etat()), s = suite(liste);
      const lieu = x => (x.lieu ? ` data-lieu="${esc(x.lieu)}"` : '');
      const suiteHtml = s.etape
        ? `<p class="acc-suite">${icone('ampoule')}<span>À faire ensuite :</span>
            <button type="button" class="lien-fort" data-page="${esc(s.etape.page)}"${lieu(s.etape)}>${esc(s.texte)} →</button></p>`
        : `<p class="acc-suite fait">${icone('check')}<span>Tout est en place : <button type="button" class="lien-fort" data-page="j-chiffres">lisez le résultat →</button></span></p>`;
      const ferme = x => !!(this.a.ferme && this.a.ferme(x.page));
      // En lecture seule (évolution 23 d), les étapes dont la page ne s'ouvre pas se replient en une ligne, à la place de
      // la première ; « Contrôles », qui se lit, et le résultat restent.
      const rangees = [];
      let replie = false;
      for (const x of liste) {
        if (!ferme(x)) { rangees.push(`<li class="acc-etape ${x.etat}" data-etape="${x.cle}">
          <button type="button" class="acc-etape-tete" data-page="${esc(x.page)}"${x.etat === 'afaire' ? lieu(x) : ''}>${rond(x)}
            <span class="acc-etape-ico" aria-hidden="true">${icone(x.ico)}</span>
            <span class="acc-etape-nom">${esc(x.titre)}</span>
            <span class="acc-etape-dit">${esc(x.detail)}</span>
            <span class="acc-etat ${x.etat}">${esc(MOTS[x.etat])}</span></button></li>`); continue; }
        if (!replie) rangees.push(`<li class="acc-etape acc-ferme" data-ferme>${icone('cadenas')}<span>${esc(this.a.motFerme || 'Paramétrage verrouillé')}</span></li>`);
        replie = true;
      }
      const bas = O().menu().bas.map(x => `<button type="button" class="btn btn-sm" data-page="${x.id}">${icone(x.ico)} ${esc(O().libelle(x))} : sauvegarde et limites du calcul</button>`).join('');
      const html = `<div class="acc">
        <section class="acc-histoire" aria-label="Comment ça marche">
          <h1>Simuler une journée de repas à bord</h1>
          <ol class="cm-liste">${COMMENT.map((x, i) => `<li style="--c:${x.couleur}">
            <span class="cm-rond">${I() ? I().ico(x.ico, 'cm-picto') : picto(x.picto)}<span class="cm-num">${i + 1}</span></span>
            <b>${esc(x.titre)}</b><p>${esc(x.texte)}</p></li>`).join('')}</ol>
        </section>
        ${suiteHtml}
        <ol class="acc-guide" aria-label="Le travail, dans l’ordre">${rangees.join('')}</ol>
        <p class="acc-pied">${bas}</p>
      </div>`;
      if (h.innerHTML !== html) h.innerHTML = html;
    }
  }

  const api = { ETATS, MOTS, COMMENT, etapes, suite, Accueil };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemarrage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
