/* ==========================================================================
 *  LE PANNEAU DE LA VUE EN DIRECT (évolution 16 e, v1)
 *  ------------------------------------------------------------------------
 *  À côté de la scène : la liste des services — une liste de boutons —, le
 *  détail du service choisi (ses équipes, ses personnes par état, ses lots à
 *  faire, ses arrivages en attente, ses personnes sans travail et ce qu'elles
 *  attendent, sa courbe de charge), et le vol suivi avec la phrase qui
 *  explique son retard.
 *
 *  Ce module ne calcule rien : il met en page ce que direct-lire.js a lu dans
 *  la journée. Tout texte venu de l'unité (un nom de service, d'équipe, de
 *  vol, de commande) est échappé avant d'entrer dans la page.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const SY = () => (enNode ? require('./synthese-vue.js') : root.OrlySyntheseVue);
  const fini = x => Number.isFinite(x);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heure = t => SY().heure(t), duree = m => SY().duree(Math.max(0, m));
  const pluriel = (n, un, plusieurs) => n + ' ' + (n >= 2 ? plusieurs : un);
  /** Ce que dit la teinte d'un service, en un mot — jamais la couleur seule. */
  const MOT_DU_TON = { critique: 'coince', avertissement: 'à surveiller' };

  /**
   * La liste des services : un bouton par service, dans l'ordre des zones du site. `site` : le site généré ; `etat` : la
   * journée à l'heure rejouée (direct-etat.js) ; `tons` : la teinte de chaque service (direct-lire.js) ; `noms` : le nom
   * de chaque service ; `selection` : le service choisi.
   */
  function services(site, etat, tons, noms, selection) {
    const ids = ((site && site.zones) || []).flatMap(z => z.services), l = [];
    for (const id of ids) {
      const x = (etat && etat.services[id]) || { auTravail: 0, presents: 0, lots: 0 }, ton = (tons && tons[id]) || { ton: 'neutre' }, mot = MOT_DU_TON[ton.ton];
      l.push('<li><button type="button" class="dp-service' + (mot ? ' dp-' + ton.ton : '') + '" data-direct-service="' + esc(id) + '" aria-pressed="' + (id === selection) + '"'
        + (ton.pourquoi ? ' title="' + esc(ton.pourquoi) + '"' : '') + '><span class="dp-nom">' + esc((noms && noms[id]) || id) + '</span>'
        + (mot ? '<span class="dp-ton">' + esc(mot) + '</span>' : '')
        + '<span class="dp-chiffres">' + x.auTravail + ' au travail / ' + pluriel(x.presents, 'présent', 'présents') + (x.lots > 0 ? ' · ' + pluriel(x.lots, 'lot à faire', 'lots à faire') : '') + '</span></button></li>');
    }
    return '<h3 id="dp-titre-services">Les services</h3><ul class="dp-services" aria-labelledby="dp-titre-services">' + l.join('') + '</ul>';
  }

  /**
   * La courbe de charge d'un service, en SVG : les présents (un trait fin) et, dessous, les personnes au travail (une
   * aire), sur le même axe ; un trait marque l'heure rejouée. `c` : { de, pas, auTravail, presents }.
   */
  function courbe(c, t) {
    const W = 300, H = 84, g = { x0: 4, x1: W - 4, y0: 8, y1: H - 18 }, n = c.auTravail.length, max = Math.max(1, ...c.presents, ...c.auTravail), fin = c.de + n * c.pas;
    const x = h => g.x0 + (h - c.de) / (fin - c.de) * (g.x1 - g.x0), y = v => g.y1 - v / max * (g.y1 - g.y0), net = v => Math.round(v * 10) / 10;
    const marches = serie => serie.map((v, i) => (i ? ' L' : 'M') + net(x(c.de + i * c.pas)) + ' ' + net(y(v)) + ' L' + net(x(c.de + (i + 1) * c.pas)) + ' ' + net(y(v))).join('');
    const aire = 'M' + net(x(c.de)) + ' ' + g.y1 + marches(c.auTravail).replace(/^M/, ' L') + ' L' + net(x(fin)) + ' ' + g.y1 + ' Z';
    const dans = fini(t) && t >= c.de && t <= fin;
    return '<figure class="dp-courbe"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('La charge du service de ' + heure(c.de) + ' à ' + heure(fin) + ' : jusqu’à ' + Math.round(Math.max(0, ...c.auTravail)) + ' au travail pour ' + Math.round(Math.max(0, ...c.presents)) + ' présents') + '"'
      + ' data-de="' + c.de + '" data-pas="' + c.pas + '" data-x0="' + g.x0 + '" data-x1="' + g.x1 + '" data-largeur="' + W + '" data-travail="' + esc(c.auTravail.map(v => Math.round(v)).join(',')) + '" data-presents="' + esc(c.presents.map(v => Math.round(v)).join(',')) + '">'
      + '<line class="dp-axe" x1="' + g.x0 + '" y1="' + g.y1 + '" x2="' + g.x1 + '" y2="' + g.y1 + '"/>'
      + '<path class="dp-aire" d="' + aire + '"/><path class="dp-presents" d="' + marches(c.presents) + '"/>'
      + (dans ? '<line class="dp-maintenant" x1="' + net(x(t)) + '" y1="' + (g.y0 - 4) + '" x2="' + net(x(t)) + '" y2="' + g.y1 + '"/>' : '')
      + '<text class="dp-graduation" x="' + g.x0 + '" y="' + (H - 5) + '">' + esc(heure(c.de)) + '</text><text class="dp-graduation dp-fin" x="' + g.x1 + '" y="' + (H - 5) + '">' + esc(heure(fin)) + '</text>'
      + '</svg><figcaption><span class="dp-cle dp-cle-travail"></span>au travail <span class="dp-cle dp-cle-presents"></span>présents<span class="dp-lu" aria-live="off"></span></figcaption></figure>';
  }

  /** Le détail d'un service (direct-lire.js, `detail`) : ses équipes, ses personnes par état, ses lots, ses arrivages, sa courbe. */
  function detail(d) {
    if (!d) return '';
    const p = d.personnes, l = [];
    l.push('<p class="dp-retour"><button type="button" class="btn btn-mini" data-direct-retour>← Tous les services</button></p>');
    l.push('<h3 class="dp-titre" tabindex="-1">' + esc(d.nom) + ' <small>à ' + esc(heure(d.t)) + '</small></h3>');
    if (d.pourquoi) l.push('<p class="dp-raison dp-' + esc(d.ton) + '"><b>' + esc(MOT_DU_TON[d.ton] === 'coince' ? 'Coince' : 'À surveiller') + '</b> — ' + esc(d.pourquoi) + '.</p>');
    l.push('<h4>Ses personnes</h4><p class="dp-etats"><b>' + p.auTravail + '</b> au travail · <b>' + p.enPause + '</b> en pause · <b>' + p.sansTravail + '</b> sans travail' + (p.enAppui ? ' · <b>' + p.enAppui + '</b> en appui' : '')
      + ' — ' + pluriel(p.presents, 'présent', 'présents') + '</p>');
    l.push('<h4>Ses équipes</h4><table class="dp-table"><thead><tr><th scope="col">Équipe</th><th scope="col">Horaire</th><th scope="col" class="num">Au travail</th><th scope="col" class="num">Présents</th></tr></thead><tbody>'
      + d.equipes.map(e => '<tr><th scope="row">' + esc(e.nom) + '</th><td>' + (fini(e.debut) && fini(e.finHoraire) ? esc(heure(e.debut) + ' – ' + heure(e.finHoraire)) : '—')
        + (e.apresHoraire ? ' <span class="dp-apres">après son horaire</span>' : '') + '</td><td class="num">' + e.personnes.auTravail + '</td><td class="num">' + e.personnes.presents + '</td></tr>').join('') + '</tbody></table>');
    l.push('<h4>Ses lots à faire</h4>' + (d.lots.length
      ? '<ul class="dp-liste">' + d.lots.map(x => '<li><b>' + esc(x.libelle) + '</b>' + (x.vol != null ? ' · vol ' + esc(x.vol) : '') + ' · ' + pluriel(Math.round(x.repas), 'repas', 'repas') + '<small>attend depuis ' + esc(heure(x.depuis)) + ' (' + esc(duree(x.attente)) + ')</small></li>').join('') + '</ul>'
      : '<p class="mini-note">Rien n’attend devant ce service.</p>'));
    l.push('<h4>Ses arrivages en attente</h4>' + (d.arrivages.length
      ? '<ul class="dp-liste">' + d.arrivages.map(a => '<li' + (a.auDela ? ' class="dp-au-dela"' : '') + '><b>' + esc(a.lot) + '</b>' + (a.lots > 1 ? ' · ' + a.lots + ' lots' : '') + '<small>attend depuis ' + esc(duree(a.attente))
        + ', jusqu’à ' + esc(heure(a.jusqua)) + (a.auDela ? ' — au-delà du seuil d’attente' : '') + '</small></li>').join('') + '</ul>'
      : '<p class="mini-note">Aucun arrivage n’attend.</p>'));
    l.push('<h4>Ses personnes sans travail</h4><p class="dp-sans">' + (d.sansTravail.personnes ? pluriel(d.sansTravail.personnes, 'personne est', 'personnes sont') + ' sans travail à cette heure.' : 'Personne n’est sans travail à cette heure.')
      + (d.sansTravail.attendait.length ? ' Avant son premier lot, le service ' + esc(d.sansTravail.attendait.join(' ; ')) + '.' : '') + '</p>');
    l.push('<h4>Sa courbe de charge</h4>' + courbe(d.courbe, d.t));
    return '<div class="dp-detail" data-service="' + esc(d.service) + '">' + l.join('') + '</div>';
  }

  /**
   * Un service choisi qui n'a aucune équipe ({ service, nom }) : il n'est pas dans la scène (une zone par service qui a un
   * atelier). Le panneau le dit et propose, comme celui du plan dessiné, d'ajouter une équipe ou d'ouvrir le service.
   */
  const sansEquipe = s => '<div class="dp-detail dp-sans-equipe" data-service="' + esc(s.service) + '">'
    + '<p class="dp-retour"><button type="button" class="btn btn-mini" data-direct-retour>← Tous les services</button></p>'
    + '<h3 class="dp-titre" tabindex="-1">' + esc(s.nom) + '</h3><p>Aucune équipe ici : ce service n’est pas dans la scène.</p>'
    + '<p class="row-btns"><button type="button" class="btn btn-play" data-svc-action="equipe" data-svc="' + esc(s.service) + '">+ Ajouter une équipe</button>'
    + '<button type="button" class="btn" data-mu-ouvrir="' + esc(s.service) + '">Le service →</button></p></div>';

  /** Sans journée à rejouer : le panneau le dit et mène, comme celui du plan dessiné, à la description de l'unité. */
  const VIDE = '<div class="vide-carte dp-vide"><b>Pas encore de journée à rejouer</b><p>Donnez une équipe aux commandes : la journée se calcule toute seule.</p>'
    + '<button type="button" class="btn btn-play" data-page="mu-pas">Décrire votre unité →</button></div>';

  /** Le vol suivi : la phrase qui explique son retard, et de quoi ne plus le suivre. */
  function suivi(s) {
    if (!s) return '';
    return '<div class="dp-suivi' + (s.enRetard ? ' dp-critique' : '') + '" role="status"><h3>Vol suivi : ' + esc(s.vol) + '</h3><p>' + esc(s.phrase) + '</p>'
      + '<p class="mini-note">Ses lots, sa tournée et son avion restent nets ; le reste pâlit.</p><button type="button" class="btn btn-mini" data-direct-nesuivre>Ne plus suivre (Échap)</button></div>';
  }

  /** Le corps du panneau : le détail du service choisi, sinon la liste des services ; sans journée à rejouer (`x` nul), de quoi décrire l'unité. */
  const corps = x => (!x ? VIDE : x.detail ? detail(x.detail) : x.sansEquipe ? sansEquipe(x.sansEquipe) : services(x.site, x.etat, x.tons, x.noms, x.selection));
  /** Le panneau : le vol suivi s'il y en a un, puis son corps. `x` : { site, etat, tons, noms, selection, detail, suivi }. */
  function rendu(x) { return suivi(x.suivi) + corps(x); }

  /** Pendant la lecture, le panneau se réécrit au plus toutes les 250 ms : un bouton reste là le temps d'un clic. */
  const CADENCE = 250;

  /**
   * Branche le panneau dans `hote`. `a` : { lire, choisir, retour, neSuivrePlus, enLecture } — `lire()` rend ce que `rendu`
   * attend ; `enLecture()` dit si la journée se rejoue. Le vol suivi et le corps du panneau se réécrivent chacun seulement
   * quand leur contenu change ; pendant la lecture, quatre fois par seconde au plus, et jamais sous un doigt ou un bouton
   * de souris appuyé (le clic aboutit) ; le bouton qui avait le clavier le garde.
   */
  function creer(hote, a) {
    hote.innerHTML = '<div class="dp-zone-suivi"></div><div class="dp-zone-corps"></div>';
    const zoneSuivi = hote.firstChild, zoneCorps = hote.lastChild, vu = { suivi: '', corps: null };
    let dernierService = null, dernier = -Infinity, plusTard = 0, appui = false;
    const maintenant = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
    function rendre() {
      if (hote.offsetParent === null) return;
      // Sous un appui, ou trop tôt pendant la lecture : plus tard (une seule fois), pour ne pas défaire ce qu'on est en train de cliquer.
      const attente = appui ? CADENCE : a.enLecture && a.enLecture() ? dernier + CADENCE - maintenant() : 0;
      if (attente > 0) { if (!plusTard) plusTard = root.setTimeout(() => { plusTard = 0; rendre(); }, Math.min(CADENCE, attente)); return; }
      dernier = maintenant();
      const x = a.lire(), suiviNeuf = x ? suivi(x.suivi) : '', corpsNeuf = corps(x);
      if (suiviNeuf !== vu.suivi) { vu.suivi = suiviNeuf; zoneSuivi.innerHTML = suiviNeuf; }
      if (corpsNeuf === vu.corps) return;
      const actif = zoneCorps.contains(root.document.activeElement) ? root.document.activeElement : null;
      const cle = actif ? (actif.dataset.directService ? '[data-direct-service="' + root.CSS.escape(actif.dataset.directService) + '"]' : actif.hasAttribute('data-direct-retour') ? '[data-direct-retour]' : null) : null;
      const service = x && x.detail ? x.detail.service : null, ouvre = service !== dernierService;
      vu.corps = corpsNeuf; zoneCorps.innerHTML = corpsNeuf;
      // Le clavier suit : le détail qui s'ouvre prend le focus s'il venait du panneau ; revenu à la liste, le bouton du service le reprend.
      const cible = (!ouvre && cle && zoneCorps.querySelector(cle)) || (actif && ouvre ? (service ? zoneCorps.querySelector('[data-direct-retour]') : zoneCorps.querySelector('[data-direct-service="' + root.CSS.escape(String(dernierService)) + '"]')) : null);
      if (cible) cible.focus({ preventScroll: true });
      dernierService = service;
    }
    hote.addEventListener('pointerdown', () => { appui = true; });
    // Relâché : le clic part d'abord (il suit le relâchement), le panneau se relit ensuite.
    const relache = () => { if (appui) { appui = false; root.setTimeout(rendre, 0); } };
    root.addEventListener('pointerup', relache); root.addEventListener('pointercancel', relache);
    hote.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button'); if (!b || !hote.contains(b)) return;
      if (b.dataset.directService) a.choisir(b.dataset.directService);
      else if (b.hasAttribute('data-direct-retour')) a.retour();
      else if (b.hasAttribute('data-direct-nesuivre')) a.neSuivrePlus();
    });
    // Sur la courbe de charge : ce que valent ses deux séries sous le pointeur.
    hote.addEventListener('pointermove', e => {
      const svg = e.target.closest && e.target.closest('.dp-courbe svg'); if (!svg) return;
      const b = svg.getBoundingClientRect(), d = svg.dataset, X = (e.clientX - b.left) / b.width * +d.largeur, travail = d.travail.split(','), presents = d.presents.split(',');
      const i = Math.max(0, Math.min(travail.length - 1, Math.floor((X - +d.x0) / (+d.x1 - +d.x0) * travail.length))), lu = svg.parentNode.querySelector('.dp-lu');
      if (lu) lu.textContent = ' — ' + heure(+d.de + i * +d.pas) + ' : ' + travail[i] + ' au travail, ' + pluriel(+presents[i], 'présent', 'présents');
    });
    hote.addEventListener('pointerleave', () => { const lu = hote.querySelector('.dp-lu'); if (lu) lu.textContent = ''; });
    // Caché, le panneau ne se réécrit pas : il se relit dès qu'il reprend sa place (sa taille change).
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => rendre()).observe(hote);
    return { rendre, html: () => vu.suivi + (vu.corps || '') };
  }

  const api = { MOT_DU_TON, CADENCE, services, courbe, detail, sansEquipe, suivi, corps, rendu, creer };
  if (enNode) module.exports = api;
  else root.OrlyDirectPanneau = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
