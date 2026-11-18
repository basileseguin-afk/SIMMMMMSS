/* « Fichiers » : les classeurs Excel, au même endroit (version 1, évolution 22).
 *
 * Un tableau, une ligne par classeur, une colonne par sens : « Importer »,
 * « Exporter », « Classeur vide à remplir ». Un sens qui n'existe pas se dit
 * « sans objet ».
 *
 * Rien n'est réécrit : chaque classeur a déjà ses boutons, construits par le
 * module qui sait l'écrire et le relire (ateliers.js, reglages.js et
 * flow-center.js — ces deux-là communs avec la version 2, et laissés tels
 * quels). Le tableau les reprend par leur identifiant, avec leurs gestes : le
 * même clic donne le même fichier, le même import le même état. Seul leur mot
 * change, pour dire le sens de la colonne ; leur infobulle dit toujours ce que
 * le classeur contient.
 *
 * Évolution 22 (b) : les classeurs des pages que « Services et équipes » a
 * reprises. Évolution 22 (e) : tous les classeurs — le programme des vols,
 * les retours, les équipes et les chemins, les horaires, les temps par vol,
 * les résultats de la journée et de la période, les liens. Trois façons de
 * remplir une cellule :
 *   - un identifiant : l'élément qui existe déjà dans la page y est rangé ;
 *   - `declenche` : un bouton neuf, qui clique un élément resté à sa place
 *     (l'import des vols reste aussi sur « Programme ») ;
 *   - `geste` : un bouton neuf, qui appelle un geste que la page fournit
 *     (`gestes`), avec son état : un geste qui ne peut pas se faire est grisé,
 *     et dit pourquoi.
 */
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Les sens, dans l'ordre des colonnes. */
  const SENS = [
    { id: 'importer', nom: 'Importer' },
    { id: 'exporter', nom: 'Exporter' },
    { id: 'vide', nom: 'Classeur vide à remplir', mot: 'Classeur vide' }
  ];

  /* Les classeurs, dans l'ordre des lignes. `importer`, `exporter`, `vide` : ce qui remplit la cellule (voir l'en-tête). */
  const CLASSEURS = [
    { id: 'vols', nom: 'Programme des vols', note: 'Les départs et les retours d’un jour, ou un programme daté. L’import se fait aussi sur la page « Programme ».',
      importer: [{ declenche: '#imp-vols', id: 'fi-vols-import' }], exporter: ['exp-vols'],
      vide: [{ id: 'csv-template', nom: 'Un jour (CSV)' }, { id: 'csv-template-date', nom: 'Programme daté (CSV)' }] },
    { id: 'retours', nom: 'Retours', note: 'La planche retour : quand chaque vol revient à l’unité, pour la plonge.',
      importer: [{ geste: 'planche-importer', id: 'fi-planche-import' }], exporter: [{ geste: 'planche-exporter', id: 'fi-planche-export' }],
      vide: [{ geste: 'planche-vide', id: 'fi-planche-vide' }] },
    { id: 'equipes-chemins', nom: 'Équipes et chemins', note: 'Les équipes, ce qu’elles préparent et les chemins, feuille par feuille.',
      importer: ['at-import-btn', 'at-import'], exporter: ['at-export'] },
    { id: 'horaires', nom: 'Horaires des équipes', note: 'L’heure de début de chaque équipe, dans un petit classeur à modifier puis réimporter.',
      importer: [{ declenche: '#at-import', id: 'fi-horaires-import' }], exporter: ['at-export-horaires'] },
    { id: 'equipes', nom: 'Équipes et horaires', note: 'Toutes les équipes d’un coup : jour, heure de début, personnes, commandes dans l’ordre.',
      importer: ['rc-import-btn', 'rc-import'], exporter: ['rc-export'] },
    { id: 'temps', nom: 'Temps par vol, vue d’ensemble', note: 'Tous les temps par vol d’un coup : une compagnie par bloc, ses classes, un service par colonne.',
      importer: ['rg-recap-import-btn', 'rg-recap-import'], exporter: ['rg-recap-export'] },
    { id: 'etude', nom: 'Temps par vol, service par service', note: 'L’étude de temps de l’unité, prête à remplir : une ligne par service, compagnie et classe, et les réglages du rythme.',
      importer: ['rg-import-btn', 'rg-import'], exporter: ['rg-export'] },
    { id: 'journee', nom: 'Résultats de la journée', note: 'La journée calculée : son classeur Excel (la charge des équipes, les vols, les réponses), ou son fichier JSON (les départs, les commandes, le journal).',
      exporter: [{ geste: 'journee-classeur', id: 'fi-journee-classeur', nom: 'Exporter (Excel)' }, { geste: 'journee-json', id: 'fi-journee-json', nom: 'Exporter (JSON)' }] },
    { id: 'periode', nom: 'Résultats de la période', note: 'La période simulée : chaque jour de travail, chaque équipe, chaque vol.',
      exporter: [{ geste: 'periode', id: 'fi-periode' }] },
    { id: 'liens', nom: 'Liens entre services', note: 'Qui livre qui dans l’unité (un fichier JSON).',
      importer: ['fc-import-button', 'fc-import'], exporter: ['fc-export'] }
  ];

  const SANS_OBJET = '<span class="fi-sans">sans objet</span>';
  const normal = x => (typeof x === 'string' ? { id: x } : x || {});

  /**
   * Le tableau des classeurs, ses cellules vides : `poser` y range les boutons. Un sens qu'un classeur n'a pas dit
   * « sans objet ».
   * @param {{id: string, nom: string, note?: string, importer?: Array, exporter?: Array, vide?: Array}[]} classeurs
   * @returns {string} du HTML
   */
  function tableau(classeurs = CLASSEURS) {
    return `<div class="table-scroll"><table class="svc-table fi-classeurs"><caption class="sr-only">Les classeurs Excel</caption>
      <thead><tr><th scope="col">Classeur</th>${SENS.map(s => `<th scope="col">${esc(s.nom)}</th>`).join('')}</tr></thead>
      <tbody>${classeurs.map(c => `<tr data-classeur="${esc(c.id)}"><th scope="row">${esc(c.nom)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</th>${
        SENS.map(s => `<td data-fi-sens="${s.id}">${(c[s.id] || []).length ? '' : SANS_OBJET}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /** Un bouton prend le mot de sa colonne (ou le sien) et nomme son classeur ; son pictogramme reste. */
  function nommer(e, doc, mot, classeur) {
    const ico = e.querySelector && e.querySelector('svg');
    e.textContent = '';
    if (ico) e.appendChild(ico);
    e.appendChild(doc.createTextNode(mot));
    e.setAttribute('aria-label', mot + ' : ' + classeur.nom);
    // Dans le tableau, tous les boutons ont la même taille (un lien discret, un grand bouton y deviennent un petit bouton).
    if (e.classList) { e.classList.remove('lien-discret', 'btn-play'); e.classList.add('btn', 'btn-sm'); }
  }

  /**
   * Dessine le tableau dans `hote` et y range les boutons de chaque classeur. Un bouton dit le sens de sa colonne et
   * nomme son classeur ; un sens dont le bouton manque dit « sans objet ».
   * @param {HTMLElement} hote
   * @param {Document} doc
   * @param {object[]} classeurs
   * @param {Object<string, {faire: Function, etat?: Function}>} gestes  les gestes que la page fournit ; `etat()` rend
   *   `{ ok: boolean, raison?: string }` : un geste qui ne peut pas se faire est grisé, et dit pourquoi
   */
  function poser(hote, doc, classeurs = CLASSEURS, gestes = {}) {
    if (!hote || !doc) return;
    hote.innerHTML = tableau(classeurs);
    for (const c of classeurs) for (const s of SENS) {
      const cellule = hote.querySelector(`tr[data-classeur="${c.id}"] td[data-fi-sens="${s.id}"]`);
      if (!cellule) continue;
      let pose = 0;
      for (const x of (c[s.id] || []).map(normal)) {
        const mot = x.nom || s.mot || s.nom;
        if (x.declenche || x.geste) {
          // Un bouton neuf : il clique un élément resté à sa place, ou appelle un geste de la page.
          if (x.declenche && !doc.querySelector(x.declenche)) continue;
          if (x.geste && !(gestes[x.geste] && typeof gestes[x.geste].faire === 'function')) continue;
          const b = doc.createElement('button');
          b.type = 'button'; b.className = 'btn btn-sm'; if (x.id) b.id = x.id;
          if (x.declenche) b.dataset.fiDeclenche = x.declenche; else b.dataset.fiGeste = x.geste;
          nommer(b, doc, mot, c);
          cellule.appendChild(b); pose++;
          continue;
        }
        const e = doc.getElementById(x.id);
        if (!e) continue;
        if (e.tagName === 'BUTTON') nommer(e, doc, mot, c);
        cellule.appendChild(e); pose++;
      }
      if (!pose) cellule.innerHTML = SANS_OBJET;
    }
    if (!hote._fiLie) {
      hote._fiLie = true;
      hote.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-fi-declenche],[data-fi-geste]');
        if (!b || b.disabled) return;
        if (b.dataset.fiDeclenche) { const cible = doc.querySelector(b.dataset.fiDeclenche); if (cible) cible.click(); return; }
        const g = gestes[b.dataset.fiGeste]; if (g) g.faire();
      });
    }
    maj(hote, gestes);
  }

  /** L'état des gestes : un geste qui ne peut pas se faire maintenant est grisé, et sa raison se lit dessous. */
  function maj(hote, gestes = {}) {
    if (!hote || !hote.querySelectorAll) return;
    for (const b of hote.querySelectorAll('[data-fi-geste]')) {
      const g = gestes[b.dataset.fiGeste], e = g && typeof g.etat === 'function' ? g.etat() : { ok: true };
      b.disabled = !e.ok;
      const suivant = b.nextElementSibling;
      let r = suivant && suivant.classList.contains('fi-raison') && !suivant.classList.contains('fi-verrou') ? suivant : null;
      if (e.ok || !e.raison) { if (r) r.remove(); b.removeAttribute('aria-describedby'); continue; }
      if (!r) { r = b.ownerDocument.createElement('small'); r.className = 'fi-raison'; r.id = (b.id || 'fi-' + b.dataset.fiGeste) + '-raison'; b.after(r); }
      r.textContent = e.raison; b.setAttribute('aria-describedby', r.id);
    }
  }

  /**
   * La lecture seule (évolution 22 f) : « Restaurer » et tous les « Importer » sont grisés, avec la raison — sa phrase
   * sous « Restaurer » (`raison`), son mot dans chaque cellule du tableau (`mot`, « Paramétrage verrouillé ») ; les
   * exports et les classeurs vides marchent. À rappeler après `maj` ; `oui` faux rend tout.
   * @param {Document} doc
   * @param {HTMLElement} hote  le tableau des classeurs
   */
  function verrouiller(doc, hote, oui, raison, mot) {
    if (!doc) return;
    const dire = (apres, id, texte) => {
      let r = doc.getElementById(id);
      if (!oui) { if (r) r.remove(); return null; }
      if (!r) { r = doc.createElement('small'); r.className = 'fi-raison fi-verrou'; r.id = id; }
      r.textContent = texte; apres.after(r); return r;
    };
    const griser = (e, r) => {
      if (oui) { if (!e.disabled) e.dataset.fiVerrou = '1'; e.disabled = true; if (r && e.tagName === 'BUTTON') e.setAttribute('aria-describedby', r.id); }
      else if (e.dataset.fiVerrou) { e.disabled = false; delete e.dataset.fiVerrou; if (e.tagName === 'BUTTON') e.removeAttribute('aria-describedby'); }
    };
    for (const cellule of (hote && hote.querySelectorAll ? hote.querySelectorAll('td[data-fi-sens="importer"]') : [])) {
      const controles = [...cellule.querySelectorAll('button,input')]; if (!controles.length) continue;
      const r = dire(controles[controles.length - 1], 'fi-verrou-' + cellule.parentElement.dataset.classeur, mot || raison);
      for (const e of controles) {
        griser(e, r);
        // Le champ resté à sa place (l'import des vols, sur « Programme ») se ferme avec le bouton qui le clique.
        const cible = e.dataset.fiDeclenche ? doc.querySelector(e.dataset.fiDeclenche) : null; if (cible) griser(cible, null);
      }
    }
    const restaurer = doc.getElementById('sauvegarde-import-btn'), champ = doc.getElementById('sauvegarde-import');
    if (restaurer) { const r = dire(restaurer.parentElement, 'fi-verrou-restaurer', raison); griser(restaurer, r); }
    if (champ) griser(champ, null);
  }

  /** La date de la dernière sauvegarde, dite en clair ; sans sauvegarde, la page le dit. */
  function direSauvegarde(iso) {
    const t = iso ? new Date(iso) : null, deux = n => String(n).padStart(2, '0');
    if (!t || !Number.isFinite(t.getTime())) return 'Aucune sauvegarde faite depuis ce navigateur.';
    return 'Dernière sauvegarde faite depuis ce navigateur : le ' + deux(t.getDate()) + '/' + deux(t.getMonth() + 1) + '/' + t.getFullYear()
      + ' à ' + deux(t.getHours()) + ':' + deux(t.getMinutes()) + '.';
  }

  const api = { SENS, CLASSEURS, tableau, poser, maj, verrouiller, direSauvegarde };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyFichiers = api;
})(typeof window !== 'undefined' ? window : globalThis);
