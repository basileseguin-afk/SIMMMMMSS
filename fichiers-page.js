/* « Fichiers » : les classeurs Excel, au même endroit (version 1, évolution 22).
 *
 * Un tableau, une ligne par classeur, une colonne par sens : « Importer »,
 * « Exporter ». Un sens qui n'existe pas se dit « sans objet ».
 *
 * Rien n'est réécrit : chaque classeur a déjà ses boutons, construits par le
 * module qui sait l'écrire et le relire (ateliers.js, reglages.js — celui-ci
 * commun avec la version 2, et laissé tel quel). Le tableau les reprend par
 * leur identifiant, avec leurs gestes : le même clic donne le même fichier,
 * le même import le même état. Seul leur mot change, pour dire le sens de la
 * colonne ; leur infobulle dit toujours ce que le classeur contient.
 *
 * Évolution 22 (b) : les classeurs des pages que « Services et équipes » a
 * reprises (« Horaires des équipes », « Temps par vol », « Temps par vol par
 * service »).
 */
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Les sens, dans l'ordre des colonnes. */
  const SENS = [
    { id: 'importer', nom: 'Importer' },
    { id: 'exporter', nom: 'Exporter' }
  ];

  /* Les classeurs, dans l'ordre des lignes. `importer`, `exporter` : les identifiants des éléments qui existent déjà
   * dans la page (le bouton, puis son champ de fichier caché). */
  const CLASSEURS = [
    { id: 'equipes', nom: 'Équipes et horaires', note: 'Toutes les équipes d’un coup : jour, heure de début, personnes, commandes dans l’ordre.',
      importer: ['rc-import-btn', 'rc-import'], exporter: ['rc-export'] },
    { id: 'temps', nom: 'Temps par vol, vue d’ensemble', note: 'Tous les temps par vol d’un coup : une compagnie par bloc, ses classes, un service par colonne.',
      importer: ['rg-recap-import-btn', 'rg-recap-import'], exporter: ['rg-recap-export'] },
    { id: 'etude', nom: 'Temps par vol, service par service', note: 'L’étude de temps de l’unité, prête à remplir : une ligne par service, compagnie et classe, et les réglages du rythme.',
      importer: ['rg-import-btn', 'rg-import'], exporter: ['rg-export'] }
  ];

  const SANS_OBJET = '<span class="fi-sans">sans objet</span>';

  /**
   * Le tableau des classeurs, ses cellules vides : `poser` y range les boutons. Un sens qu'un classeur n'a pas dit
   * « sans objet ».
   * @param {{id: string, nom: string, note?: string, importer?: string[], exporter?: string[]}[]} classeurs
   * @returns {string} du HTML
   */
  function tableau(classeurs = CLASSEURS) {
    return `<div class="table-scroll"><table class="svc-table fi-classeurs"><caption class="sr-only">Les classeurs Excel</caption>
      <thead><tr><th scope="col">Classeur</th>${SENS.map(s => `<th scope="col">${esc(s.nom)}</th>`).join('')}</tr></thead>
      <tbody>${classeurs.map(c => `<tr data-classeur="${esc(c.id)}"><th scope="row">${esc(c.nom)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</th>${
        SENS.map(s => `<td data-fi-sens="${s.id}">${(c[s.id] || []).length ? '' : SANS_OBJET}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /**
   * Dessine le tableau dans `hote` et y range les boutons de chaque classeur, pris où ils sont dans la page. Un bouton
   * dit le sens de sa colonne et nomme son classeur ; un sens dont le bouton manque dit « sans objet ».
   * @param {HTMLElement} hote
   * @param {Document} doc
   * @param {object[]} classeurs
   */
  function poser(hote, doc, classeurs = CLASSEURS) {
    if (!hote || !doc) return;
    hote.innerHTML = tableau(classeurs);
    for (const c of classeurs) for (const s of SENS) {
      const cellule = hote.querySelector(`tr[data-classeur="${c.id}"] td[data-fi-sens="${s.id}"]`);
      const elements = (c[s.id] || []).map(id => doc.getElementById(id)).filter(Boolean);
      if (!cellule) continue;
      if (!elements.length) { cellule.innerHTML = SANS_OBJET; continue; }
      for (const e of elements) {
        if (e.tagName === 'BUTTON') {
          const ico = e.querySelector('svg');
          e.textContent = '';
          if (ico) e.appendChild(ico);
          e.appendChild(doc.createTextNode(s.nom));
          e.setAttribute('aria-label', s.nom + ' : ' + c.nom);
        }
        cellule.appendChild(e);
      }
    }
  }

  const api = { SENS, CLASSEURS, tableau, poser };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyFichiers = api;
})(typeof window !== 'undefined' ? window : globalThis);
