/* ==========================================================================
 *  LA CHARGE DANS LA PAGE PLANNING (banc d'essai de la version 1, évolution
 *  12 c — docs/BANC_ESSAI.md § 13 ; évolution 14 c)
 *  ------------------------------------------------------------------------
 *    — par service, la courbe de la journée, en petit, en tête de son groupe
 *      dans le planning des équipes (planning-vue.js), sur son échelle :
 *      présents (un trait), au travail (une aire), et sous elle les lots en
 *      file (des barres), le pic des personnes au travail marqué ;
 *    — sous le planning, le tableau des équipes, replié : occupation,
 *      consommé sur disponible, débit, file la plus longue, attente ; et le
 *      classeur de la charge.
 *  Les nombres viennent de moteur/indicateurs.js, comme pour les outils et
 *  les exports : un seul chemin. Un cas sans objet est dit, pas mis à 0.
 *  Survoler un créneau ouvre sa bulle (ds.js) : toutes ses mesures.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const I = () => root.OrlyIndicateurs, P = () => root.MoteurProduction, PE = () => root.OrlyPeriode;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nombre = (x, k = 1) => (Math.round(x * 10 ** k) / 10 ** k + 0).toLocaleString('fr-FR', { maximumFractionDigits: k });
  const JOUR = 1440;
  const MESURES = { presents: 'présents', auTravail: 'au travail', enPause: 'en pause', sansTravail: 'sans travail', enAppui: 'en appui ou à disposition',
    enFile: 'en file', termines: 'terminés' };

  /** Les créneaux d'un service sur l'horloge du jour J : ceux de chacun de ses jours de travail, décalés de leur jour, additionnés. */
  function creneauxDuService(groupes) {
    const decale = g => {
      const c = g.creneaux; if (c.debut === null) return c;
      const d = g.jour * JOUR, out = { debut: c.debut + d };
      for (const m of I().MESURES) out[m] = c[m] ? { debut: c[m].debut + d, valeurs: c[m].valeurs } : null;
      return out;
    };
    return PE().sommeDesCreneaux(groupes.map(decale));
  }

  /** Le plus haut d'une série et son créneau, sur l'horloge du jour J. */
  function picDe(c, m) { return c[m] ? I().pic(c[m]) : null; }

  /** Les services à montrer : ceux qui ont des présents ou du travail, dans l'ordre de leur nom. */
  function servicesDe(k, nom) {
    const parId = new Map();
    for (const s of k.services) {
      if (!s.creneaux.presents && !s.creneaux.auTravail) continue;
      if (!parId.has(s.service)) parId.set(s.service, []);
      parId.get(s.service).push(s);
    }
    return [...parId.entries()].map(([id, groupes]) => ({ id, nom: nom(id), c: creneauxDuService(groupes) }))
      .sort((p, q) => p.nom.localeCompare(q.nom) || p.id.localeCompare(q.id));
  }

  /** Un chemin en escalier : chaque créneau à plat, de son début à sa fin, `y` de sa valeur. */
  function escalier(serie, x, y, t0, t1, pas) {
    const pts = [];
    serie.valeurs.forEach((v, i) => {
      const a = Math.max(t0, serie.debut + i * pas), b = Math.min(t1, serie.debut + (i + 1) * pas);
      if (b > a) pts.push([x(a), y(v)], [x(b), y(v)]);
    });
    return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  }

  /** La bulle d'un créneau : toutes ses mesures. */
  function infoCreneau(nomSvc, c, i, pas) {
    const t = c.debut + i * pas, val = m => (c[m] ? c[m].valeurs[i] : null);
    const lignes = Object.entries(MESURES).filter(([m]) => c[m]).map(([m, lib]) => lib + ' ' + nombre(val(m), m === 'termines' ? 0 : 1));
    return nomSvc + ' · ' + P().hhmm(t) + '–' + P().hhmm(t + pas) + '\n' + lignes.join(' · ');
  }

  /**
   * La courbe d'un service en petit, en tête de son groupe dans le planning (évolution 14 c) : sur l'échelle fixe du
   * planning (`pxm` pixels par minute, de `t0` à `t1`), `haut` pixels de haut. Présents (un trait), au travail (une
   * aire), en file (des barres, en bas), le pic marqué ; la bulle de chaque créneau. { html, note }.
   */
  function mini(s, ax, pas) {
    const { t0, t1, pxm, haut } = ax, c = s.c, L = Math.ceil((t1 - t0) * pxm), x = t => (t - t0) * pxm;
    const bas = 7, hc = haut - bas - 6, max = Math.max(1, ...['presents', 'auTravail'].flatMap(m => (c[m] ? c[m].valeurs : [0])));
    const y = v => 3 + hc - v / max * hc, base = y(0).toFixed(1), yF = haut - bas - 1;
    const maxFile = c.enFile ? Math.max(0, ...c.enFile.valeurs) : 0, pic = picDe(c, 'auTravail'), picP = picDe(c, 'presents');
    const aire = c.auTravail ? escalier(c.auTravail, x, y, t0, t1, pas) : '';
    const debutAire = c.auTravail ? x(Math.max(t0, c.auTravail.debut)).toFixed(1) : 0;
    const finAire = c.auTravail ? x(Math.min(t1, c.auTravail.debut + c.auTravail.valeurs.length * pas)).toFixed(1) : 0;
    const files = c.enFile && maxFile > 0 ? c.enFile.valeurs.map((v, i) => {
      const a = Math.max(t0, c.enFile.debut + i * pas), b = Math.min(t1, c.enFile.debut + (i + 1) * pas), h = v / maxFile * bas;
      return b > a && v > 0 ? `<rect class="ch-file" x="${x(a).toFixed(1)}" y="${(yF + bas - h).toFixed(1)}" width="${Math.max(1, x(b) - x(a) - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>` : '';
    }).join('') : '';
    const cibles = c.presents || c.auTravail;
    const bulles = cibles ? cibles.valeurs.map((v, i) => {
      const a = Math.max(t0, cibles.debut + i * pas), b = Math.min(t1, cibles.debut + (i + 1) * pas);
      return b > a ? `<rect class="ch-cible" x="${x(a).toFixed(1)}" y="0" width="${(x(b) - x(a)).toFixed(1)}" height="${haut}" data-info="${esc(infoCreneau(s.nom, c, i, pas))}"/>` : '';
    }).join('') : '';
    const marque = pic && pic.personnes > 0 && pic.debut + pas > t0 && pic.debut < t1
      ? `<circle class="ch-pic" cx="${x(Math.min(t1, Math.max(t0, pic.debut + pas / 2))).toFixed(1)}" cy="${y(pic.personnes).toFixed(1)}" r="3.5"/>` : '';
    const texte = [!pic ? 'travail sans objet' : pic.personnes > 0 ? 'pic ' + nombre(pic.personnes) + ' au travail à ' + P().hhmm(pic.debut) : 'personne au travail',
      picP ? 'présents jusqu’à ' + nombre(picP.personnes) : null, !c.enFile ? null : maxFile > 0 ? 'en file jusqu’à ' + nombre(maxFile) : 'rien en file'].filter(Boolean);
    const html = `<div class="ch-service" data-service="${esc(s.id)}" data-pic="${pic ? pic.personnes + '|' + pic.debut : ''}" data-max="${max}">
      <svg class="ds-graphique ch-courbe ch-mini" width="${L}" height="${haut}" style="width:${L}px;height:${haut}px" viewBox="0 0 ${L} ${haut}" role="img" aria-label="${esc(s.nom + ' : ' + texte.join(', '))}">
        <line class="ch-base" x1="0" y1="${base}" x2="${L}" y2="${base}"/>
        ${aire ? `<path class="ch-travail" d="${aire}L${finAire} ${base}L${debutAire} ${base}Z"/>` : ''}
        ${c.presents ? `<path class="ch-presents" d="${escalier(c.presents, x, y, t0, t1, pas)}"/>` : ''}
        ${c.enAppui && c.enAppui.valeurs.some(v => v > 0) ? `<path class="ch-appui" d="${escalier(c.enAppui, x, y, t0, t1, pas)}"/>` : ''}
        ${files}${marque}${bulles}
      </svg></div>`;
    return { html, note: texte.join(' · ') + ' · échelle : ' + nombre(max) + (max >= 2 ? ' personnes' : ' personne') };
  }

  const pourcent = x => nombre(x * 100, 0) + ' %';
  /** Une case du tableau : la valeur, ou « sans objet » et sa raison. */
  function caseDe(e, champ, ecrire) {
    const v = e[champ], raison = (e.sansObjet || {})[champ === 'fileMax' ? 'enFile' : champ];
    if (v === null || v === undefined) return `<td class="ch-n"><span class="ch-sans-objet" title="${esc(raison || 'sans objet')}">sans objet</span></td>`;
    return `<td class="ch-n">${ecrire(v)}</td>`;
  }

  /** Le tableau des équipes : une ligne par équipe, dans l'ordre des services. */
  /*
   * Le tableau des équipes, replié par défaut (correction 16 d) : avec une unité réelle, il ferait plusieurs écrans
   * et le planning serait loin dessous. Ce navigateur se souvient du choix (une préférence d'affichage, `ory-ui-…`,
   * que le garde des onglets laisse passer) ; sans stockage, il reste replié.
   */
  const CLE_TABLEAU = 'ory-ui-charge-tableau';
  function tableauOuvert() { try { return root.localStorage.getItem(CLE_TABLEAU) === 'ouvert'; } catch (e) { return false; } }
  function retenirTableau(ouvert) { try { root.localStorage.setItem(CLE_TABLEAU, ouvert ? 'ouvert' : 'replie'); } catch (e) { /* sans stockage : le choix vaut pour la page */ } }

  function tableau(k, nom, noms) {
    const lignes = k.equipes.slice().sort((p, q) => nom(p.service).localeCompare(nom(q.service)) || (p.jour - q.jour) || String(p.nom).localeCompare(String(q.nom)));
    const file = f => (f.lots ? nombre(f.lots, 0) + ' lot' + (f.lots >= 2 ? 's' : '') + ' à ' + P().hhmm(f.a) : 'aucune');
    return `<details class="ch-tableau"${tableauOuvert() ? ' open' : ''}><summary>Le tableau des équipes (${lignes.length})</summary>
      <div class="table-scroll"><table class="svc-table ch-equipes">
      <caption class="mini-note">Chaque équipe, sur sa journée : disponible = personnes × (présence − pauses prises) + heures sup ;
        occupation = minutes au travail ÷ disponible ; consommé = homme-minutes de ses lots ÷ (disponible + renforts reçus) ;
        débit = unités finies ÷ heures au travail.</caption>
      <thead><tr><th scope="col">Équipe</th><th scope="col">Service</th><th scope="col">Personnes</th><th scope="col">Occupation</th>
        <th scope="col">Consommé sur disponible</th><th scope="col">Débit</th><th scope="col">File la plus longue</th><th scope="col">Attente</th></tr></thead>
      <tbody>${lignes.map(e => `<tr data-equipe="${esc(e.id)}"><th scope="row">${esc(noms.get(e.id) || e.nom)}${e.jour ? ' <small>J' + (e.jour > 0 ? '+' : '−') + Math.abs(e.jour) + '</small>' : ''}</th>
        <td>${esc(nom(e.service))}</td><td class="ch-n">${nombre(e.personnes, 1)}</td>
        ${caseDe(e, 'occupation', pourcent)}${caseDe(e, 'consommeSurDisponible', pourcent)}
        ${caseDe(e, 'debit', x => nombre(x, 1) + ' ' + esc(e.unite) + '/h')}
        ${caseDe(e, 'fileMax', file)}<td class="ch-n">${nombre(e.attente || 0, 0)} min</td></tr>`).join('')}</tbody></table></div></details>`;
  }

  /**
   * Sous le planning (évolution 14 c) : le classeur de la charge et le tableau des équipes, replié. Les courbes de
   * chaque service vivent en tête de son groupe, dans le planning (`mini`). `o` : { resultat, args, nomService(id),
   * exporter() (le bouton du classeur, facultatif) }. Sans résultat, la boîte se cache.
   */
  function rendre(box, o) {
    const r = o.resultat;
    if (!box) return;
    if (!r || !r.ok || !(r.ateliers || []).length || !I()) { box.innerHTML = ''; box.hidden = true; return; }
    const k = I().journee(r, o.args || {}), nom = id => (o.nomService ? o.nomService(id) : id) || id;
    const noms = new Map((r.ateliers || []).map(a => [a.id, a.nom]));
    box.hidden = false;
    // Le classeur de la charge de la journée (évolution 12 d) : echanges-charge.js, comme l'outil.
    box.onclick = e => { if (e.target.closest('[data-ch="exporter"]') && o.exporter) o.exporter(); };
    box.innerHTML = `<div class="ch-tete"><h4 class="at-sous-titre ch-titre">La charge, équipe par équipe <span class="mini-note">la courbe de chaque service est en tête de son groupe, dans le planning</span></h4>
      ${o.exporter ? '<button type="button" class="btn btn-sm" data-ch="exporter">Exporter la charge (Excel)</button>' : ''}</div>
      ${tableau(k, nom, noms)}`;
    const d = box.querySelector('details.ch-tableau');
    if (d) d.addEventListener('toggle', () => retenirTableau(d.open));
  }

  const api = { rendre, creneauxDuService, servicesDe, mini };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyChargeVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
