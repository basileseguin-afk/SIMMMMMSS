/* ==========================================================================
 *  LA PAGE DES VOLS MONTRE LES VOLS (version 1, évolution 19 e)
 *
 *  « Vols › Programme des vols » avait deux boutons d'import (les vols, en
 *  Excel ou en CSV ; l'export de l'ERP) et ne montrait aucun vol. Ici :
 *    - un seul bouton, « Importer des vols » : le format du fichier se
 *      reconnaît à ses en-têtes (le modèle CSV, le CSV daté, l'export de
 *      l'ERP, le classeur des vols), la page dit lequel, et refuse un format
 *      inconnu en disant ce qu'elle a lu ;
 *    - le tableau des vols du jour : vol, compagnie, heure de départ,
 *      passagers par classe, trié par heure, avec une recherche.
 *
 *  Ce module ne lit aucun vol : il reconnaît, et il affiche. La lecture reste
 *  celle de la page et des outils (moteur/journee.js pour le programme,
 *  moteur/import-flights.js pour l'export de l'ERP), qui disent eux-mêmes une
 *  colonne manquante ou une valeur illisible.
 *
 *  Tout est pur (testé en Node) ; la page pose le résultat.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Les formats reconnus, avec leurs mots. */
  const FORMATS = {
    modele: { id: 'modele', nom: 'modèle CSV', dit: 'le modèle CSV (les vols d’une journée)',
      excel: 'les colonnes du modèle, dans un classeur Excel (les vols d’une journée)' },
    date: { id: 'date', nom: 'CSV daté', dit: 'le CSV daté (un programme sur plusieurs jours)',
      excel: 'les colonnes du modèle daté, dans un classeur Excel (un programme sur plusieurs jours)' },
    erp: { id: 'erp', nom: 'export de l’ERP', dit: 'l’export de l’ERP (Winrest), en CSV', excel: 'l’export de l’ERP (Winrest, onglet « Flights »)' },
    classeur: { id: 'classeur', nom: 'classeur des vols', dit: 'le classeur des vols (feuilles « Départs » et « Retours »)',
      excel: 'le classeur des vols (feuilles « Départs » et « Retours »)' }
  };

  /** Un en-tête ou un nom de feuille, comme les lecteurs le comparent : sans accent, en minuscules, les espaces réunis. */
  const cle = v => String(v ?? '').replace(/^﻿/, '').trim().replace(/^"(.*)"$/, '$1').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

  /** Les en-têtes d'un CSV : sa première ligne non vide, découpée au séparateur que la page lit (« ; » s'il domine, sinon « , »). */
  function entetesDuCsv(texte) {
    const ligne = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/).find(l => l.trim()) || '';
    const separateur = (ligne.match(/;/g) || []).length > (ligne.match(/,/g) || []).length ? ';' : ',';
    return ligne.split(separateur).map(cle).filter(Boolean);
  }
  /** Les en-têtes d'une feuille : sa première ligne non vide. */
  function entetesDeLaFeuille(f) {
    const ligne = ((f && f.lignes) || []).find(l => (l || []).some(c => String(c ?? '').trim())) || [];
    return ligne.map(cle).filter(Boolean);
  }
  /** Le format d'une table d'après ses en-têtes : « Flight No » signe l'export de l'ERP ; « vol_id », le programme — daté s'il a une date. */
  function formatDesEntetes(entetes) {
    const e = new Set(entetes);
    if (e.has('flight no')) return 'erp';
    if (e.has('vol_id')) return e.has('date') ? 'date' : 'modele';
    return null;
  }

  /**
   * Le format d'un fichier de vols.
   * @param {{nom:string, texte?:string, feuilles?:Array<{nom:string, lignes:Array}>}} fichier
   *   `texte` pour un CSV, `feuilles` pour un classeur (telles que tableur.js les lit).
   * @returns {{format:string|null, entetes:string[], excel:boolean}}
   *   format : `modele`, `date`, `erp`, `classeur`, ou null s'il n'est pas reconnu ; entetes : ce qui a été lu.
   */
  function reconnaitre(fichier) {
    const f = fichier || {};
    if (!Array.isArray(f.feuilles)) {
      const entetes = entetesDuCsv(f.texte);
      return { format: formatDesEntetes(entetes), entetes, excel: false };
    }
    const nom = x => cle(x && x.nom);
    // L'export de l'ERP : son onglet « Flights ». Le classeur des vols : ses feuilles « Départs » et « Retours ».
    const flights = f.feuilles.find(x => nom(x) === 'flights');
    if (flights) return { format: 'erp', entetes: entetesDeLaFeuille(flights), excel: true };
    const programme = f.feuilles.find(x => ['departs', 'retours'].includes(nom(x)));
    if (programme) return { format: 'classeur', entetes: entetesDeLaFeuille(programme), excel: true };
    // Sinon une seule table, lue comme un CSV : la feuille « Vols », ou la première.
    const table = f.feuilles.find(x => nom(x) === 'vols') || f.feuilles[0];
    const entetes = entetesDeLaFeuille(table);
    return { format: formatDesEntetes(entetes), entetes, excel: true };
  }

  /** Le format reconnu, en une phrase. */
  function phrase(vu) {
    const f = FORMATS[vu && vu.format];
    return f ? 'Format reconnu : ' + (vu.excel ? f.excel : f.dit) + '.' : '';
  }
  const MAX_CITES = 8;
  /** Le refus d'un format inconnu : ce que le fichier n'est pas, et ce qu'on y a lu. */
  function refus(nom, vu) {
    const e = (vu && vu.entetes) || [];
    const lu = !e.length ? 'Le fichier est vide.'
      : 'Colonnes lues : ' + e.slice(0, MAX_CITES).join(', ') + (e.length > MAX_CITES ? '… (' + e.length + ' colonnes)' : '') + '.';
    return 'Format non reconnu : « ' + nom + ' » n’est ni le ' + FORMATS.modele.nom + ', ni le ' + FORMATS.date.nom + ', ni l’' + FORMATS.erp.nom
      + '. ' + lu + ' Aucune donnée remplacée.';
  }

  /* ---- le compte rendu d'un import (évolution 23 f) --------------------------- */

  const dateCourte = d => String(d).slice(8, 10) + '/' + String(d).slice(5, 7);
  const dateLongue = d => dateCourte(d) + '/' + String(d).slice(0, 4);
  const pl = (n, un, plusieurs) => n + ' ' + (n > 1 ? (plusieurs || un + 's') : un);
  /** Au-delà, les jours sans vol sont comptés, plus nommés. */
  const MAX_JOURS_CITES = 3;

  /**
   * Le compte rendu d'un import, en deux lignes : le fichier et son format ; puis ce qu'il porte. Pour un programme daté :
   * la période, le nombre de jours et de vols, la fourchette par jour — une ligne qui ne grandit pas avec la période. Le
   * jour par jour (`detail` : les phrases du compte rendu d'avant) est à part : la page le replie.
   * @param {{fichier:string, reconnu?:string, lignes:number, departs:number, retours:number, periode:?object, detail?:string[]}} o
   *   periode — ce que `OrlyPeriode.decrire` rend d'un programme daté ({debut, fin, jours, parJour, sansVol}), ou rien.
   *   rattachement — avec une liste des compagnies (évolution 26 e) : { rattaches, nonRattaches } (des vols). Quand des
   *   vols ne sont pas rattachés, le compte rendu le dit sur une ligne de plus (`rattachement`), qui mène à « Contrôles ».
   *   Sinon (tout est rattaché, ou sans liste), le compte rendu d'avant, en deux lignes.
   * @returns {{lignes:string[], alerte:string, detail:string[]}}  `alerte` : les jours sans vol, dits sans rien déplier.
   */
  function compteRendu(o) {
    const r = o.rattachement && o.rattachement.nonRattaches > 0 ? { rattachement: phraseRattachement(o.rattachement) + '.' } : {};
    return { ...compteRenduDAvant(o), ...r };
  }
  /** L'import qui rattache (évolution 26 e) : « 960 vols rattachés à votre liste, 12 non rattachés ». */
  function phraseRattachement(x) {
    return pl(x.rattaches, 'vol rattaché', 'vols rattachés') + ' à votre liste' + (x.nonRattaches ? ', ' + pl(x.nonRattaches, 'non rattaché', 'non rattachés') : '');
  }
  function compteRenduDAvant(o) {
    const d = o.periode, premiere = '« ' + o.fichier + ' ».' + (o.reconnu ? ' ' + o.reconnu : '');
    if (!d) return { lignes: [premiere, o.lignes + ' lignes importées. ' + o.departs + ' départs et ' + o.retours + ' retours.'], alerte: '', detail: [] };
    const n = j => j.departs + j.retours, avec = d.parJour.filter(j => n(j) > 0);
    const min = Math.min(...avec.map(n)), max = Math.max(...avec.map(n));
    const quand = d.debut === d.fin ? 'Le ' + dateLongue(d.debut) : 'Du ' + dateLongue(d.debut) + ' au ' + dateLongue(d.fin);
    const sans = d.sansVol || [], cites = sans.slice(0, MAX_JOURS_CITES).map(dateCourte).join(', ');
    return {
      lignes: [premiere, quand + ' : ' + pl(d.jours, 'jour') + ', ' + pl(o.departs + o.retours, 'vol') + ' (' + pl(o.departs, 'départ') + ', ' + pl(o.retours, 'retour') + '), '
        + (min === max ? min : 'de ' + min + ' à ' + max) + ' par jour.'],
      alerte: sans.length ? pl(sans.length, 'jour') + ' sans vol : ' + cites + (sans.length > MAX_JOURS_CITES ? ' et ' + pl(sans.length - MAX_JOURS_CITES, 'autre') : '') + '.' : '',
      detail: (o.detail || []).slice()
    };
  }

  /** Ce compte rendu, pour la page : deux lignes, puis le détail jour par jour, replié. Tout texte est échappé. */
  function compteRenduHTML(cr) {
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const [une, deux] = cr.lignes;
    return '<p class="vp-cr-ligne">' + e(une) + '</p><p class="vp-cr-ligne">' + e(deux) + (cr.alerte ? ' <span class="vp-cr-alerte">' + e(cr.alerte) + '</span>' : '') + '</p>'
      // L'import qui rattache (évolution 26 e) : une ligne de plus, et ce qui n'est pas rattaché mène à « Contrôles ».
      + (cr.rattachement ? '<p class="vp-cr-ligne">' + e(cr.rattachement)
        + ' <button type="button" class="lien-discret" data-page="mu-pas">Voir dans « Contrôles » →</button></p>' : '')
      + (cr.detail && cr.detail.length ? '<details class="vp-cr-detail"><summary>Le détail jour par jour</summary>' + cr.detail.map(l => '<p>' + e(l) + '</p>').join('') + '</details>' : '');
  }

  /* ---- le tableau des vols du jour ------------------------------------------- */

  const chercher = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hhmm = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  const nombre = v => (Number.isFinite(+v) ? +v : 0);

  /**
   * Les vols du jour à montrer : les départs, triés par heure de départ puis par numéro de vol ; `recherche` garde ceux
   * dont le numéro ou la compagnie contient ce texte.
   * @param {Array} vols  les vols du jour, tels que la page les tient ({id, cie, sens, std, bc, pc, yc, crew})
   * @returns {{total:number, recherche:string, lignes:Array<{id, cie, heure, minutes, bc, pc, yc, crew}>}}
   */
  function lignes(vols, recherche) {
    const q = chercher(recherche).trim();
    const departs = (vols || []).filter(v => v && v.sens === 'DEP');
    const liste = departs.filter(v => !q || chercher(v.id).includes(q) || chercher(v.cie).includes(q))
      .map(v => ({ id: String(v.id ?? ''), cie: String(v.cie ?? ''), heure: hhmm(v.std), minutes: v.std, bc: nombre(v.bc), pc: nombre(v.pc), yc: nombre(v.yc), crew: nombre(v.crew) }))
      .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
    return { total: departs.length, recherche: String(recherche ?? '').trim(), lignes: liste };
  }

  /** Le compte, au-dessus du tableau : « 12 départs », « 3 départs sur 12 » quand on cherche. */
  function compte(r) {
    const departs = n => n + (n > 1 ? ' départs' : ' départ');
    if (!r.total) return 'aucun départ';
    return r.recherche ? departs(r.lignes.length) + ' sur ' + r.total : departs(r.total);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLASSES = [['bc', 'Business'], ['pc', 'Premium'], ['yc', 'Économie'], ['crew', 'Équipage']];

  /** Le tableau des vols du jour ; une phrase quand il n'a rien à montrer. Le texte venu du fichier est échappé. */
  function tableau(r) {
    if (!r.total) return '<p class="vp-vide">Aucun vol : importez votre programme.</p>';
    if (!r.lignes.length) return '<p class="vp-vide">Aucun vol ne correspond à « ' + esc(r.recherche) + ' ».</p>';
    return '<div class="table-scroll vp-cadre"><table class="flight-table vp-table"><caption class="sr-only">Les vols du jour, par heure de départ : le vol, sa compagnie, ses passagers par classe</caption>'
      + '<thead><tr><th scope="col">Départ</th><th scope="col">Vol</th><th scope="col">Compagnie</th>'
      + CLASSES.map(([, nom]) => '<th scope="col" class="num">' + nom + '</th>').join('') + '</tr></thead><tbody>'
      + r.lignes.map(l => '<tr data-vol="' + esc(l.id) + '"><td class="vp-heure">' + l.heure + '</td><th scope="row">' + esc(l.id) + '</th><td>' + esc(l.cie) + '</td>'
        + CLASSES.map(([k]) => '<td class="num">' + l[k] + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>';
  }

  const api = { FORMATS, reconnaitre, phrase, refus, compteRendu, phraseRattachement, compteRenduHTML, lignes, compte, tableau };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyVolsPage = api;
})(typeof window !== 'undefined' ? window : globalThis);
