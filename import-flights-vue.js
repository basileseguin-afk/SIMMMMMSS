/* ==========================================================================
 *  L'EXPORT WINREST DANS LA PAGE (banc d'essai de la version 1, évolution
 *  13 c — docs/BANC_ESSAI.md § 14)
 *  ------------------------------------------------------------------------
 *  Sous l'import des vols (Vols › Programme des vols) : le rapport d'un import
 *  « Export Winrest (Flights) » — les totaux, puis les listes repliées — et la
 *  section repliée « Règles d'import Winrest ». Ce module écrit le HTML et lit
 *  un champ changé ; sim.js branche les gestes, enregistre et importe. Le
 *  calcul est celui de moteur/import-flights.js, comme pour l'outil.
 *  Tout texte venu du fichier ou des règles passe par esc().
 * ==========================================================================*/
(function (root) {
  'use strict';

  const W = () => root.OrlyWinrest;
  const E = () => root.OrlyEchangesWinrest;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateFr = d => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—');
  const nombre = n => Number(n).toLocaleString('fr-FR');
  const REPAS = ['BC', 'PC', 'YC', 'CREW', 'SPML_BC', 'SPML_PC', 'SPML_YC'];
  const TETE_REPAS = ['BC', 'PC', 'YC', 'CREW', 'SPML BC', 'SPML PC', 'SPML YC'];
  /** Au plus tant de lignes par liste dans la page ; toutes sont dans le classeur. */
  const MAX_LIGNES = 300;

  /* ---- le rapport ------------------------------------------------------------ */

  /** Une liste repliée : son titre et son nombre, puis un tableau (au plus MAX_LIGNES lignes). */
  function liste(titre, cle, tete, lignes, numeriques = []) {
    const n = lignes.length;
    const corps = n ? '<div class="table-scroll"><table class="wr-table wr-liste"><thead><tr>' + tete.map((t, i) => '<th scope="col"' + (numeriques.includes(i) ? ' class="wr-n"' : '') + '>' + esc(t) + '</th>').join('') + '</tr></thead><tbody>'
      + lignes.slice(0, MAX_LIGNES).map(l => '<tr>' + l.map((c, i) => '<td' + (numeriques.includes(i) ? ' class="wr-n"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></div>' + (n > MAX_LIGNES ? '<p class="mini-note">Les ' + nombre(n - MAX_LIGNES) + ' lignes suivantes sont dans le classeur du rapport.</p>' : '')
      : '<p class="mini-note">Aucune.</p>';
    return '<details class="wr-bloc" data-wr-liste-rapport="' + cle + '"><summary>' + esc(titre) + ' <span class="wr-compte">(' + nombre(n) + ')</span></summary>' + corps + '</details>';
  }

  /** Le rapport d'un import : les totaux, le bouton du classeur, puis les listes repliées. */
  function rapportHTML(r) {
    const t = E().totaux(r);
    const totaux = '<dl class="wr-totaux">' + t.map(([k, v]) => '<div' + (/^ {2}/.test(k) ? ' class="wr-sous"' : '') + '><dt>' + esc(k.trim()) + '</dt><dd>' + esc(typeof v === 'number' ? nombre(v) : v) + '</dd></div>').join('') + '</dl>';
    const jours = r.parJour.map(x => [dateFr(x.date), x.compagnie, x.vols, ...REPAS.map(c => x[c])]);
    return '<h4 class="wr-titre">Rapport d’import Winrest</h4>' + totaux
      + '<div class="row-btns"><button class="btn" type="button" data-wr-action="rapport-classeur"><span data-ico="telecharger"></span>Télécharger le rapport (Excel)</button></div>'
      + liste('Vols gardés par jour et par compagnie', 'jours', ['Date', 'Compagnie', 'Vols', ...TETE_REPAS], jours, [2, 3, 4, 5, 6, 7, 8, 9])
      + liste('Livraisons écartées', 'ecartees', ['Date', 'Flight No', 'Delivery No', 'Motif'], r.ecartees.map(x => [dateFr(x.date), x.flightNo, x.deliveryNo, x.motif]))
      + liste('Points à vérifier', 'verifier', ['Date', 'Flight No', 'Delivery No', 'À vérifier'], r.aVerifier.map(x => [dateFr(x.date), x.flightNo, x.deliveryNo, x.quoi]))
      + liste('Guest types ignorés', 'types', ['Guest type', 'Quantité', 'Livraisons'], r.typesIgnores.map(x => [x.guestType, x.quantite, x.livraisons]), [1, 2])
      + liste('Réserves fondues', 'reserves', ['Date', 'Flight No', 'Fondue dans', 'Repas'], r.reservesFondues.map(x => [dateFr(x.date), x.flightNo, x.vers,
        REPAS.filter(c => x.repas[c]).map(c => c.replace('_', ' ') + ' ' + x.repas[c]).join(', ') || '0']))
      + liste('vol_id suffixés', 'suffixes', ['Date', 'Flight No', 'vol_id'], r.suffixes.map(x => [dateFr(x.date), x.flightNo, x.volId]))
      + liste('Vols fictifs créés', 'fictifs', ['Date', 'vol_id', 'Flight No', 'Quantité', 'Classe', 'Au programme'],
        r.fictifs.map(x => [dateFr(x.date), x.volId, x.flightNo, x.quantite, x.classe, x.auProgramme ? 'oui' : 'non, à 0']), [3]);
  }

  /* ---- les règles ------------------------------------------------------------- */

  const options = (liste, choisi) => liste.map(c => '<option value="' + esc(c) + '"' + (c === choisi ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  const CLASSES_FICTIF = () => W().CLASSES.filter(c => c !== 'ignoré');
  const zone = (cle, titre, aide, valeur, lignes = 3) => '<label class="wr-champ"><span>' + titre + ' <small>' + aide + '</small></span>'
    + '<textarea rows="' + lignes + '" spellcheck="false" ' + cle + '>' + esc(valeur) + '</textarea></label>';
  const compagniesTexte = c => Object.entries(c).map(([a, b]) => a + ' = ' + b).join('\n');

  /** Une ligne de vol fictif : ses champs, ou ceux d'un nouveau vol (attr = data-wr-nouveau-champ). */
  function ligneFictif(f, attr, quoi) {
    const champ = (k, v, extra = '') => '<td><input type="text" ' + attr + '="' + k + '" value="' + esc(v) + '" aria-label="' + esc(quoi + ' : ' + k) + '"' + extra + '></td>';
    return champ('flightNo', f.flightNo) + champ('compagnie', f.compagnie) + champ('volId', f.volId)
      + champ('heure', f.heure, ' data-heure inputmode="numeric" class="wr-heure"') + champ('types', (f.types || []).join(', '), ' placeholder="ECONOMY, CREW"')
      + '<td><select ' + attr + '="classe" aria-label="' + esc(quoi + ' : classe') + '">' + options(CLASSES_FICTIF(), f.classe || 'YC') + '</select></td>';
  }

  /** La section « Règles d'import Winrest » : les listes, les codes compagnie, la table des Guest types, le mot des réserves, les vols fictifs. */
  function reglesHTML(R, erreur) {
    const types = Object.entries(R.types);
    return (erreur ? '<p class="wr-alerte" role="alert">Les règles gardées sont illisibles (' + esc(erreur) + ') : les règles par défaut s’affichent ; la prochaine modification les remplace.</p>' : '')
      + '<p class="mini-note">Chaque modification se valide et s’enregistre ; elle vaut pour le prochain import. Les listes propres à l’unité restent dans ce navigateur et dans « Tout sauvegarder ».</p>'
      + '<div class="wr-grille">'
      + zone('data-wr-liste="statutsExclus"', 'Statuts exclus', '(un par ligne, sans tenir compte de la casse)', R.statutsExclus.join('\n'))
      + zone('data-wr-liste="icaoExclus"', 'ICAO exclus', '(un par ligne, à l’identique)', R.icaoExclus.join('\n'))
      + zone('data-wr-liste="flightNoExclus"', 'Flight No exclus', '(un par ligne, à l’identique)', R.flightNoExclus.join('\n'))
      + zone('data-wr-compagnies', 'Codes compagnie', '(« ICAO = compagnie », un par ligne)', compagniesTexte(R.compagnies))
      + '<label class="wr-champ"><span>Mot des réserves <small>(un Flight No qui le contient, sans tenir compte de la casse, est une réserve)</small></span>'
      + '<input type="text" data-wr-mot value="' + esc(R.motReserve) + '"></label></div>'
      + '<h4 class="wr-sous-titre">Guest types</h4><p class="mini-note">Un type absent de la table est ignoré et listé au rapport ; « ignoré » l’écarte sans le lister.</p>'
      + '<div class="table-scroll"><table class="wr-table wr-types"><thead><tr><th scope="col">Guest type</th><th scope="col">Classe</th><th scope="col"><span class="sr-only">Retirer</span></th></tr></thead><tbody>'
      + types.map(([t, c]) => '<tr data-wr-type="' + esc(t) + '"><th scope="row">' + esc(t) + '</th><td><select data-wr-type-classe aria-label="' + esc('Classe de ' + t) + '">' + options(W().CLASSES, c) + '</select></td>'
        + '<td><button class="btn btn-mini" type="button" data-wr-action="type-retirer" aria-label="' + esc('Retirer ' + t) + '">Retirer</button></td></tr>').join('')
      + '<tr class="wr-nouveau"><td><input type="text" data-wr-type-nouveau placeholder="Nouveau Guest type" aria-label="Nouveau Guest type"></td>'
      + '<td><select data-wr-type-nouvelle-classe aria-label="Classe du nouveau Guest type">' + options(W().CLASSES, 'YC') + '</select></td>'
      + '<td><button class="btn btn-mini" type="button" data-wr-action="type-ajouter">Ajouter</button></td></tr></tbody></table></div>'
      + '<h4 class="wr-sous-titre">Vols fictifs quotidiens</h4><p class="mini-note">Chaque jour qui a un vol gardé, un vol par règle : la somme des Guest qty de ses types sur les lignes de ce Flight No ce jour-là, quel que soit leur statut. Types séparés par des virgules.</p>'
      + '<div class="table-scroll"><table class="wr-table wr-fictifs"><thead><tr><th scope="col">Flight No</th><th scope="col">Compagnie</th><th scope="col">vol_id</th><th scope="col">Heure</th>'
      + '<th scope="col">Guest types à sommer</th><th scope="col">Classe</th><th scope="col"><span class="sr-only">Retirer</span></th></tr></thead><tbody>'
      + R.fictifs.map((f, i) => '<tr data-wr-fictif="' + i + '">' + ligneFictif(f, 'data-wr-fictif-champ', 'Vol fictif ' + (i + 1))
        + '<td><button class="btn btn-mini" type="button" data-wr-action="fictif-retirer" aria-label="' + esc('Retirer le vol fictif ' + f.volId) + '">Retirer</button></td></tr>').join('')
      + '<tr class="wr-nouveau" data-wr-fictif-nouveau>' + ligneFictif({}, 'data-wr-nouveau-champ', 'Nouveau vol fictif')
      + '<td><button class="btn btn-mini" type="button" data-wr-action="fictif-ajouter">Ajouter</button></td></tr></tbody></table></div>';
  }

  /* ---- un champ changé → les règles candidates ------------------------------------------ */

  const lignes = v => String(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const typesDe = v => String(v).split(',').map(s => s.trim()).filter(Boolean);
  const copie = R => JSON.parse(JSON.stringify(R));

  /** « ICAO = compagnie », un par ligne → la table ; une ligne mal écrite est refusée, nommée. */
  function compagniesDe(texte) {
    const vus = new Set();
    return Object.fromEntries(lignes(texte).map((l, i) => {
      const m = /^([^=]+?)\s*=\s*(.*)$/.exec(l);
      if (!m || !m[2].trim()) throw new Error('codes compagnie, ligne ' + (i + 1) + ' : « ' + l + ' » ; écrivez « ICAO = compagnie ».');
      if (vus.has(m[1])) throw new Error('codes compagnie, ligne ' + (i + 1) + ' : l’ICAO « ' + m[1] + ' » est déjà écrit plus haut.');
      vus.add(m[1]);
      return [m[1], m[2].trim()];
    }));
  }

  const fictifDe = (tr, attr) => {
    const v = k => { const el = tr.querySelector('[' + attr + '="' + k + '"]'); return el ? el.value.trim() : ''; };
    return { flightNo: v('flightNo'), compagnie: v('compagnie'), volId: v('volId'), heure: v('heure'), types: typesDe(v('types')), classe: v('classe') || 'YC' };
  };

  /** Le champ changé → les règles candidates (à valider), ou null si ce n'est pas un champ des règles. */
  function modifier(R, el) {
    const x = copie(R), d = el.dataset;
    if (d.wrListe) x[d.wrListe] = lignes(el.value);
    else if ('wrCompagnies' in d) x.compagnies = compagniesDe(el.value);
    else if ('wrMot' in d) x.motReserve = el.value.trim();
    else if ('wrTypeClasse' in d) x.types[el.closest('[data-wr-type]').dataset.wrType] = el.value;
    else if (d.wrFictifChamp) {
      const i = +el.closest('[data-wr-fictif]').dataset.wrFictif, k = d.wrFictifChamp;
      x.fictifs[i][k] = k === 'types' ? typesDe(el.value) : el.value.trim();
    } else return null;
    return x;
  }

  /** Un bouton des règles → les règles candidates, ou null. */
  function agir(R, bouton) {
    const x = copie(R), a = bouton.dataset.wrAction, tr = bouton.closest('tr');
    if (a === 'type-retirer') { delete x.types[tr.dataset.wrType]; return x; }
    if (a === 'type-ajouter') {
      const t = tr.querySelector('[data-wr-type-nouveau]').value.trim().toUpperCase().replace(/\s+/g, ' ');
      if (!t) throw new Error('écrivez le Guest type à ajouter.');
      if (Object.prototype.hasOwnProperty.call(x.types, t)) throw new Error('« ' + t + ' » est déjà dans la table.');
      x.types = Object.fromEntries([...Object.entries(x.types), [t, tr.querySelector('[data-wr-type-nouvelle-classe]').value]]);
      return x;
    }
    if (a === 'fictif-retirer') { x.fictifs.splice(+tr.dataset.wrFictif, 1); return x; }
    if (a === 'fictif-ajouter') { x.fictifs.push(fictifDe(tr, 'data-wr-nouveau-champ')); return x; }
    return null;
  }

  /** Le champ d'un vol fictif que nomme un refus : le Flight No, la compagnie, le vol_id, l'heure, les types, la classe. */
  const champNomme = message => {
    // Le texte entre guillemets est celui de l'utilisateur : il ne choisit pas le champ.
    const m = String(message).replace(/^.*?vol fictif \d+ : /, '').replace(/«[^»]*»/g, '');
    return /Flight No/.test(m) ? 'flightNo' : /compagnie/.test(m) ? 'compagnie' : /vol_id/.test(m) ? 'volId'
      : /heure/.test(m) ? 'heure' : /Guest type/.test(m) ? 'types' : /classe/.test(m) ? 'classe' : null;
  };
  function champDuRefus(tr, message, attr) {
    return tr.querySelector('[' + attr + '="' + (champNomme(message) || 'flightNo') + '"]');
  }

  /**
   * Le sélecteur d'un champ des règles, pour le retrouver une fois la section redessinée : sa ligne (un Guest type, un vol
   * fictif) et son attribut. `champ` : un autre champ de la même ligne de vol fictif (celui que nomme le refus).
   */
  function selecteur(el, champ) {
    const q = v => '"' + (root.CSS && root.CSS.escape ? root.CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&')) + '"';
    const fictif = el.closest('[data-wr-fictif]'), type = el.closest('[data-wr-type]'), d = el.dataset;
    if (fictif) return '[data-wr-fictif=' + q(fictif.dataset.wrFictif) + '] [data-wr-fictif-champ=' + q(champ || d.wrFictifChamp) + ']';
    if (type) return '[data-wr-type=' + q(type.dataset.wrType) + '] [data-wr-type-classe]';
    if (d.wrListe) return '[data-wr-liste=' + q(d.wrListe) + ']';
    if ('wrCompagnies' in d) return '[data-wr-compagnies]';
    if ('wrMot' in d) return '[data-wr-mot]';
    return null;
  }

  /** Un refus du module, sans son préfixe : la page le dit sous le champ. */
  const raison = m => String(m).replace(/^règles d’import Winrest,?\s*/, '');

  root.OrlyWinrestVue = { rapportHTML, reglesHTML, modifier, agir, champDuRefus, champNomme, selecteur, raison, compagniesDe, MAX_LIGNES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
