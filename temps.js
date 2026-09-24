/* ==========================================================================
 *  LE TEMPS ENTRE LES ATELIERS — stocks et bouchons, lus dans la journée
 *
 *  Le moteur compte deux choses que le planning ne montre pas :
 *    • les STOCKS : ce qu'un atelier a fini et que le suivant ne prend que
 *      plus tard (et ce qui est prêt avant le chargement de l'avion) ;
 *    • la FILE de la plonge : ce qui revient des vols plus vite que les
 *      tunnels ne le lavent.
 *  Ce module les dessine : un tableau des stocks, deux graphiques pour la
 *  plonge (les retours heure par heure face au débit, puis le sale en
 *  attente), et les petits textes que le chemin et le plan affichent.
 *  Il ne calcule rien : tout vient de `resultat.stocks` et `resultat.plonge`.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./moteur/production.js') : root.MoteurProduction;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nombre = n => Math.round(n).toLocaleString('fr-FR');
  const duree = m => P.dureeLisible(m);

  /* ---- ce que le chemin et le plan en disent -------------------------- */

  /** Le séjour en stock d'une commande entre deux services, ou rien. */
  function sejour(resultat, de, vers, classe) {
    return ((resultat && resultat.stocks && resultat.stocks.sejours) || [])
      .find(s => s.de === de && s.vers === vers && s.classe === classe) || null;
  }

  /** Ce qui attend en stock devant un service à l'instant `t` (en repas). */
  function enStockA(resultat, service, t) {
    const serie = resultat && resultat.stocks && resultat.stocks.parService[service];
    return serie ? P.niveauA(serie, t) : 0;
  }

  /** Le sale pas encore lavé à l'instant `t` (en unités) : ce qui attend, et ce qui est au tunnel. */
  function saleA(resultat, t) {
    const p = resultat && resultat.plonge;
    return p ? P.niveauLineaire(p.serie, t) : 0;
  }

  /* ---- les graphiques ------------------------------------------------- */

  const W = 900, H = 210, G = 56, D = 16, HAUT = 16, BAS = 30;   // marges : gauche, droite, haut, bas

  function echelles(t0, t1, ymax) {
    const x = t => G + (t - t0) / Math.max(1, t1 - t0) * (W - G - D);
    const y = v => H - BAS - (v / Math.max(1, ymax)) * (H - BAS - HAUT);
    return { x, y };
  }

  /** Des graduations rondes pour un axe de 0 à `max`. */
  function graduations(max) {
    const brut = max / 4, p = Math.pow(10, Math.floor(Math.log10(Math.max(1, brut))));
    const pas = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= brut) || p * 10;
    const out = []; for (let v = 0; v <= max + 1e-9; v += pas) out.push(v);
    return out;
  }

  /** Une heure d'axe : « 02:00 », et « 00:00 J+1 » au passage de minuit seulement. */
  function heureAxe(t) {
    const j = Math.floor(t / 1440), m = t - j * 1440;
    return P.hhmm(m) + (j && m === 0 ? (j > 0 ? ' J+' : ' J') + j : '');
  }

  function axes(t0, t1, ymax, sc) {
    const heures = []; for (let t = Math.ceil(t0 / 60) * 60; t <= t1; t += 60) heures.push(t);
    const pasH = heures.length > 14 ? 2 : 1, vues = heures.filter((t, i) => i % pasH === 0);
    // L'heure du bord droit s'aligne sur lui : elle ne déborde pas du cadre.
    return graduations(ymax).map(v => `<line class="tp-grille" x1="${G}" x2="${W - D}" y1="${sc.y(v)}" y2="${sc.y(v)}"/>
        <text class="tp-axe" x="${G - 8}" y="${sc.y(v) + 4}" text-anchor="end">${nombre(v)}</text>`).join('')
      + vues.map(t => `<text class="tp-axe" x="${sc.x(t)}" y="${H - 10}" text-anchor="${sc.x(t) > W - D - 30 ? 'end' : 'middle'}">${heureAxe(t)}</text>`).join('')
      + `<line class="tp-base" x1="${G}" x2="${W - D}" y1="${H - BAS}" y2="${H - BAS}"/>`;
  }

  /** Une barre aux bouts du haut arrondis (4 px), posée sur la ligne de base. */
  function barre(x0, x1, y0, yb) {
    const r = Math.min(4, (x1 - x0) / 2, Math.max(0, yb - y0));
    return `M${x0},${yb} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x1 - r},${y0} Q${x1},${y0} ${x1},${y0 + r} L${x1},${yb} Z`;
  }

  /** Les retours heure par heure, face à ce que la plonge lave en une heure. */
  function graphiqueRetours(p, t0, t1) {
    const ymax = Math.max(p.capacite, ...p.heures.map(h => h.u)) * 1.18 || 1;
    const sc = echelles(t0, t1, ymax), yb = H - BAS;
    const barres = p.heures.map(h => {
      const trop = h.u > p.capacite, x0 = sc.x(h.t) + 1, x1 = sc.x(h.t + 60) - 1, y0 = sc.y(h.u);
      const titre = P.hhmm(h.t) + '–' + P.hhmm(h.t + 60) + ' : ' + nombre(h.u) + ' u revenues'
        + (trop ? ', ' + nombre(h.u - p.capacite) + ' de plus que la plonge n’en lave' : '');
      return `<g class="tp-barre${trop ? ' trop' : ''}" data-info="${esc(titre)}">
          <rect class="tp-cible" x="${x0 - 1}" y="${HAUT}" width="${x1 - x0 + 2}" height="${yb - HAUT}"/>
          <path d="${barre(x0, x1, y0, yb)}"/>
          ${trop ? `<text class="tp-val" x="${(x0 + x1) / 2}" y="${y0 - 6}" text-anchor="middle">▲ ${nombre(h.u)}</text>` : ''}</g>`;
    }).join('');
    const yc = sc.y(p.capacite);
    return `<svg class="tp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Retours des vols heure par heure, face au débit de la plonge (${nombre(p.capacite)} unités par heure)">
      ${axes(t0, t1, ymax, sc)}${barres}
      <line class="tp-seuil" x1="${G}" x2="${W - D}" y1="${yc}" y2="${yc}"/>
      <text class="tp-seuil-txt" x="${W - D}" y="${yc - 6}" text-anchor="end">ce que la plonge lave : ${nombre(p.capacite)} u/h</text></svg>`;
  }

  /** Le sale pas encore lavé : il monte d'un coup à chaque retour, et baisse au rythme du tunnel. */
  function graphiqueFile(p, t0, t1) {
    const ymax = Math.max(1, p.max) * 1.18;
    const sc = echelles(t0, t1, ymax), yb = H - BAS;
    const pts = [[t0, 0], ...p.serie.filter(([t]) => t >= t0 && t <= t1), [t1, P.niveauLineaire(p.serie, t1)]];
    let d = `M${sc.x(pts[0][0])},${sc.y(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += ` L${sc.x(pts[i][0]).toFixed(1)},${sc.y(pts[i][1]).toFixed(1)}`;
    const aire = d + ` V${yb} H${sc.x(t0)} Z`;
    const pic = p.maxA != null ? `<circle class="tp-pic" cx="${sc.x(p.maxA)}" cy="${sc.y(p.max)}" r="5"/>
      <text class="tp-val" x="${Math.min(sc.x(p.maxA) + 10, W - D - 150)}" y="${sc.y(p.max) - 8}">${nombre(p.max)} u à ${P.hhmm(p.maxA)}</text>` : '';
    return `<svg class="tp-svg tp-file" viewBox="0 0 ${W} ${H}" role="img" data-t0="${t0}" data-t1="${t1}"
        aria-label="Sale pas encore lavé au fil de la journée, au plus ${nombre(p.max)} unités">
      ${axes(t0, t1, ymax, sc)}<path class="tp-aire" d="${aire}"/><path class="tp-ligne" d="${d}"/>${pic}
      <line class="tp-curseur" x1="0" x2="0" y1="${HAUT}" y2="${yb}" style="display:none"/>
      <rect class="tp-cible-file" x="${G}" y="${HAUT}" width="${W - G - D}" height="${yb - HAUT}"/></svg>`;
  }

  function tuile(lab, val, note, ton) {
    return `<div class="tp-tuile${ton ? ' ' + ton : ''}"><span>${esc(lab)}</span><b>${val}</b>${note ? `<em>${esc(note)}</em>` : ''}</div>`;
  }

  /* ---- les deux sections ---------------------------------------------- */

  function sectionPlonge(r) {
    const p = r.plonge;
    const titre = '<h3 class="tp-titre">Les retours des vols et la plonge</h3>';
    if (!p) return `<section class="tp-sec">${titre}<div class="vide-carte"><b>La boucle du matériel est coupée</b>
      <p>Sans elle, les retours des vols ne sont pas suivis. Cochez « Matériel en boucle » dans « Qui prépare quoi › Les cases ».</p>
      <button class="btn" data-aller="ateliers" data-onglet="at-equipes">Les cases →</button></div></section>`;
    if (!p.retours.length) return `<section class="tp-sec">${titre}<p class="mini-note">Aucun retour de vol dans le programme : rien ne revient à laver.</p></section>`;
    if (!p.capacite) return `<section class="tp-sec">${titre}<p class="mini-note"><b>Aucune plonge</b> : ${nombre(p.retours.reduce((n, x) => n + x.u, 0))} u reviennent
      et s’entassent. Ajoutez une case de type plonge (« Les cases › + Case hors chemin »).</p></section>`;
    const ts = p.retours.map(x => x.t).concat(p.serie.map(x => x[0]));
    const t0 = Math.floor(Math.min(...ts) / 60) * 60;
    // Jusqu'au bout de la dernière heure de retours : sa barre tient dans le cadre.
    const t1 = Math.max(Math.ceil(Math.max(...ts, p.maxA || 0) / 60) * 60, ...p.heures.map(h => h.t + 60), t0 + 120);
    const bouchon = p.attenteMax >= 60;
    const phrase = p.depassements.length
      ? `Les retours dépassent ce que la plonge lave de <b>${p.depassements.map(d => P.hhmm(d.de) + ' à ' + P.hhmm(d.a)).join(', ')}</b> : le sale s’accumule, et se résorbe ensuite.`
      : 'Heure par heure, la plonge lave au moins autant qu’il ne revient.';
    return `<section class="tp-sec">${titre}
      <div class="tp-tuiles">
        ${tuile('Le plus de sale pas encore lavé', nombre(p.max) + ' u', p.maxA != null ? 'à ' + P.hhmm(p.maxA) : '', bouchon ? 'alerte' : '')}
        ${tuile('Attente la plus longue', duree(p.attenteMax), 'du retour à la sortie du tunnel', bouchon ? 'alerte' : '')}
        ${tuile('Attente moyenne', duree(p.attenteMoy), 'par unité lavée')}
        ${tuile('Débit de la plonge', nombre(p.capacite) + ' u/h', 'tunnels qui tournent')}
        ${tuile('Reste sale le soir', nombre(p.resteSale) + ' u', p.resteSale ? 'jamais lavé' : 'tout est lavé', p.resteSale ? 'alerte' : '')}
      </div>
      <p class="tp-phrase">${bouchon ? '<b class="tp-etiquette alerte">▲ Bouchon</b> ' : ''}${phrase}</p>
      <figure class="tp-fig"><figcaption>Ce qui revient des vols, heure par heure <small>(unités par heure)</small></figcaption>${graphiqueRetours(p, t0, t1)}</figure>
      <figure class="tp-fig"><figcaption>Le sale pas encore lavé : en attente et dans le tunnel <small>(unités)</small></figcaption>${graphiqueFile(p, t0, t1)}</figure>
      <div class="tp-bulle" role="status" hidden></div>
    </section>`;
  }

  function sectionStocks(r, nomDe) {
    const s = r.stocks || { parLien: [] };
    const titre = '<h3 class="tp-titre">Les stocks entre les ateliers</h3>';
    const intro = '<p class="mini-note">Ce qu’un atelier a fini et que le suivant ne prend que plus tard attend en stock, comme ce qui est prêt avant le chargement de l’avion.</p>';
    if (!s.parLien.length) return `<section class="tp-sec">${titre}${intro}<p class="mini-note"><b>Aucun stock</b> : chaque étape prend ce que la précédente livre dès qu’elle l’a fini.</p></section>`;
    const nom = id => id === 'chargement' ? 'Chargement (avion)' : (nomDe(id) || id);
    const tous = s.parLien.flatMap(l => l.serie.map(x => x[0]));
    const t0 = Math.floor(Math.min(...tous) / 60) * 60, t1 = Math.ceil(Math.max(...tous) / 60) * 60 || t0 + 60;
    const vmax = Math.max(...s.parLien.map(l => l.repasMax), 1);
    // Petits multiples : même axe du temps et même hauteur pour tous, pour comparer d'un coup d'œil.
    const spark = l => {
      const w = 180, h = 34, x = t => (t - t0) / Math.max(1, t1 - t0) * w, y = v => h - 2 - v / vmax * (h - 4);
      let d = `M0,${h - 2}`;
      for (const [t, v] of l.serie) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
      d += ` H${w}`;
      return `<svg class="tp-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="tp-aire" d="${d} V${h - 2} H0 Z"/><path class="tp-ligne" d="${d}"/></svg>`;
    };
    // « J-1 14:00–19:00 » se lirait comme une seule soirée : le jour J est nommé
    // dès que la période commence la veille.
    const fin = t0 < 0 && t1 >= 0 ? 'J ' + P.hhmm(t1) : P.hhmm(t1);
    const lignes = s.parLien.map(l => `<tr>
        <th scope="row">${esc(nom(l.de))} <span aria-hidden="true">→</span> ${esc(nom(l.vers))}</th>
        <td><b>${nombre(l.repasMax)}</b> repas<small>à ${l.a != null ? P.hhmm(l.a) : '—'}</small></td>
        <td><b>${duree(l.dureeMax)}</b><small>${esc(P.libelleClasse(l.classeMax))}</small></td>
        <td>${duree(l.dureeMoy)}<small>${l.sejours} ${l.sejours > 1 ? 'commandes' : 'commande'}</small></td>
        <td title="Repas en stock de ${P.hhmm(t0)} à ${fin}">${spark(l)}</td></tr>`).join('');
    return `<section class="tp-sec">${titre}${intro}
      <div class="tp-scroll"><table class="tp-table"><thead><tr><th scope="col">Entre</th><th scope="col">Le plus en stock</th>
        <th scope="col">Le plus long</th><th scope="col">En moyenne</th><th scope="col">Au fil de la journée <small>${P.hhmm(t0)} → ${fin}</small></th></tr></thead>
        <tbody>${lignes}</tbody></table></div></section>`;
  }

  /** L'onglet « Stocks et retours » de la journée. */
  function rendre(box, resultat, nomDe) {
    if (!box) return;
    const r = resultat || {};
    if (!r.ok || !(r.lots || []).length) {
      box.innerHTML = '<div class="vide-carte"><b>Rien à mesurer pour l’instant</b><p>Les stocks et les retours se lisent dans la journée calculée : donnez d’abord une case aux commandes.</p>'
        + '<button class="btn" data-aller="ateliers" data-onglet="at-chemins">Les chemins →</button></div>';
      return;
    }
    box.innerHTML = sectionStocks(r, nomDe) + sectionPlonge(r);
    lierSurvol(box, r);
  }

  /* Survol : une bulle sur chaque barre, un curseur et sa valeur sur la file. */
  function lierSurvol(box, r) {
    const bulle = box.querySelector('.tp-bulle'); if (!bulle) return;
    const montrer = (texte, e) => {
      const b = box.getBoundingClientRect();
      bulle.textContent = texte; bulle.hidden = false;
      bulle.style.left = Math.min(e.clientX - b.left + 14, b.width - 260) + 'px';
      bulle.style.top = (e.clientY - b.top + 14) + 'px';
    };
    const cacher = () => { bulle.hidden = true; };
    for (const g of box.querySelectorAll('.tp-barre')) {
      g.addEventListener('pointermove', e => montrer(g.dataset.info, e));
      g.addEventListener('pointerleave', cacher);
    }
    const svg = box.querySelector('.tp-file'); if (!svg) return;
    const t0 = +svg.dataset.t0, t1 = +svg.dataset.t1, trait = svg.querySelector('.tp-curseur');
    const cible = svg.querySelector('.tp-cible-file');
    cible.addEventListener('pointermove', e => {
      const m = svg.getScreenCTM(); if (!m) return;
      const x = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
      const t = Math.round(t0 + (x - G) / (W - G - D) * (t1 - t0));
      trait.setAttribute('x1', x); trait.setAttribute('x2', x); trait.style.display = '';
      montrer('À ' + P.hhmm(t) + ' : ' + nombre(saleA(r, t)) + ' u pas encore lavées', e);
    });
    cible.addEventListener('pointerleave', () => { trait.style.display = 'none'; cacher(); });
  }

  const api = { sejour, enStockA, saleA, rendre, graduations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyTemps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
