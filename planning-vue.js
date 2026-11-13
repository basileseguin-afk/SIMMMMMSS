/* ==========================================================================
 *  LE PLANNING DES ÉQUIPES (version 1, évolution 14 c — README, « Le planning
 *  des équipes »)
 *  ------------------------------------------------------------------------
 *  Une échelle fixe en pixels : le planning ne s'étire plus avec la fenêtre.
 *  — trois zooms : « Toute la chaîne » (de la première à la dernière minute,
 *    dans la largeur visible), « Un jour » (40 px par heure) et « 6 h »
 *    (160 px par heure) ; par boutons et par Ctrl + molette ; on se déplace en
 *    glissant ou par la barre de défilement ; la période visible s'affiche ;
 *  — l'axe des heures reste en haut, sur deux niveaux (le jour, les heures),
 *    et les noms des équipes à gauche, pendant les défilements ;
 *  — les équipes sont groupées par service, dans l'ordre du chemin ; chaque
 *    groupe se replie ; en tête, la courbe de charge du service, en petit
 *    (charge-vue.js), sur le même axe ;
 *  — les barres : le travail plein, l'attente des amonts en bande fine devant,
 *    une pause prise en trou, le robot et le lavage avec un motif, le travail
 *    à la chaîne avec une encoche, un lot fini après la limite de sa commande
 *    avec un contour critique et une icône ; la limite de chaque commande, un
 *    petit trait au bout de la barre de son dernier lot ;
 *  — un clic sur une barre met sa commande en évidence ; Échap annule.
 *  Rien n'est calculé ici : on lit le résultat du moteur et ses indicateurs.
 *  Les fonctions sans navigateur se testent sous Node.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const ORDRE = () => (enNode ? require('./moteur/ordre-services.js') : root.OrlyOrdreServices);

  const JOUR = 1440;
  /** Les trois zooms ; les deux derniers ont une heure de largeur fixe, en pixels. */
  const ZOOMS = [{ id: 'chaine', nom: 'Toute la chaîne' }, { id: 'jour', nom: 'Un jour' }, { id: 'six', nom: '6 h' }];
  const PX_HEURE = { jour: 40, six: 160 }, PX_HEURE_MIN = 4;
  /** Les hauteurs, en pixels : une ligne d'équipe, l'en-tête d'un groupe, l'axe (le jour, puis les heures). */
  const HAUT_LIGNE = 28, HAUT_GROUPE = 44, HAUT_AXE = 40, NOMS = 184;
  /** Deux repères de l'axe à 40 px au moins : « 06:00 » s'y lit. */
  const PAS = [30, 60, 120, 180, 240, 360, 720, 1440], ECART_REPERES = 40;

  const jourEcrit = j => (j > 0 ? 'J+' + j : j < 0 ? 'J' + j : 'J');
  const jourDe = t => Math.floor(t / JOUR);
  const heureDe = t => P().hhmm(t - jourDe(t) * JOUR);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- l'échelle ---------------------------------------------------------------- */

  /** La largeur d'une heure, en pixels : fixe pour « Un jour » et « 6 h » ; « Toute la chaîne » tient dans `largeur`. */
  function pxParHeure(zoom, largeur, t0, t1) {
    if (PX_HEURE[zoom]) return PX_HEURE[zoom];
    const heures = Math.max(1, (t1 - t0) / 60);
    return Math.max(PX_HEURE_MIN, largeur / heures);
  }
  /** Le zoom d'à côté : `sens` > 0 pour s'approcher. Aux bouts, on reste. */
  function zoomVoisin(zoom, sens) {
    const i = ZOOMS.findIndex(z => z.id === zoom), j = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 1 : i) + (sens > 0 ? 1 : -1)));
    return ZOOMS[j].id;
  }

  /* ---- ce que le résultat dit ----------------------------------------------------- */

  const tourne = l => !l.dispo && l.fin != null && Number.isFinite(l.debut);

  /** Le dernier lot de fabrication de chaque commande : celui qui finit quand elle est prête. */
  function dernierLots(r) {
    const par = (r && r.parClasse) || {}, out = new Map();
    for (const l of (r && r.lots) || []) {
      if (!tourne(l) || l.handling) continue;
      for (const c of l.classes || []) {
        const k = par[c]; if (!k || k.absente || k.fin == null) continue;
        const d = out.get(c);
        if (!d || Math.abs(l.fin - k.fin) < Math.abs(d.fin - k.fin) || (Math.abs(l.fin - k.fin) === Math.abs(d.fin - k.fin) && l.fin > d.fin)) out.set(c, l);
      }
    }
    return out;
  }

  /** La limite (« prête avant ») de chaque commande, sur son dernier lot : Map lot → heures, croissantes. */
  function limites(r) {
    const par = (r && r.parClasse) || {}, out = new Map();
    for (const [c, l] of dernierLots(r)) {
      const e = par[c].echeance; if (!Number.isFinite(e)) continue;
      if (!out.has(l)) out.set(l, []);
      if (!out.get(l).includes(e)) out.get(l).push(e);
    }
    for (const v of out.values()) v.sort((a, b) => a - b);
    return out;
  }

  /** De la première à la dernière minute de la chaîne, à l'heure ronde, limites des commandes comprises ; null sans lot. */
  function bornes(r) {
    const lots = ((r && r.lots) || []).filter(l => Number.isFinite(l.debut));
    if (!lots.length) return null;
    let a = Math.min(...lots.map(l => l.debut)), b = Math.max(...lots.map(l => (l.fin == null ? l.debut : l.fin)));
    for (const v of limites(r).values()) b = Math.max(b, v[v.length - 1]);
    const t0 = Math.floor(a / 60) * 60;
    return { t0, t1: Math.max(t0 + 60, Math.ceil(b / 60) * 60) };
  }

  /** Le jour de travail où le plus de lots tournent (0 : le jour J) ; à égalité, le premier. */
  function jourLePlusCharge(r) {
    const n = new Map();
    for (const l of (r && r.lots) || []) if (tourne(l)) n.set(jourDe(l.debut), (n.get(jourDe(l.debut)) || 0) + 1);
    let mieux = 0, max = 0;
    for (const j of [...n.keys()].sort((a, b) => a - b)) if (n.get(j) > max) { max = n.get(j); mieux = j; }
    return mieux;
  }

  /**
   * Les services de l'amont vers l'aval. Avec des chemins (`parcours`, correction 17 b) : l'ordre tiré de tous les chemins à
   * la fois (moteur/ordre-services.js) — un service après tous ceux qui l'alimentent, à égalité l'ordre du premier chemin,
   * les services hors chemin à la fin ; le même ordre pour la Synthèse, le planning et la page Période. Sans chemin : l'ordre
   * d'avant, tiré de la journée (`ordreDeLaJournee`).
   */
  function ordreDesServices(r, parcours) {
    if (!ORDRE() || !ORDRE().avecCases(parcours)) return ordreDeLaJournee(r);
    return ORDRE().ordreDesServices(parcours, [...new Set(((r && r.ateliers) || []).map(a => a.service))]);
  }

  /**
   * Les services dans l'ordre de la journée, sans chemin : les étapes de chaque commande (parClasse.services),
   * le handling après ce qu'il charge ; à rang égal, les mises à disposition d'abord, le lavage à la fin, puis l'ordre
   * des équipes. Un cycle ne fige rien.
   */
  function ordreDeLaJournee(r) {
    const ateliers = (r && r.ateliers) || [], par = (r && r.parClasse) || {};
    const rang = new Map(), types = new Map();
    ateliers.forEach((a, i) => {
      if (!rang.has(a.service)) { rang.set(a.service, i); types.set(a.service, new Set()); }
      types.get(a.service).add(a.type);
    });
    const seul = (s, t) => types.get(s).size === 1 && types.get(s).has(t);
    const cle = s => [seul(s, 'dispo') ? 0 : seul(s, 'lavage') ? 2 : 1, rang.get(s)];
    const avant = new Map([...rang.keys()].map(s => [s, new Set()]));
    const lier = (de, vers) => { if (de !== vers && avant.has(de) && avant.has(vers)) avant.get(vers).add(de); };
    for (const k of Object.values(par)) (k.services || []).forEach((s, i, l) => { if (i) lier(l[i - 1], s); });
    for (const l of (r && r.lots) || []) if (l.handling) for (const c of l.classes || []) {
      const ss = (par[c] && par[c].services) || [];
      if (ss.length) lier(ss[ss.length - 1], l.service);
    }
    const reste = new Set(rang.keys()), ordre = [];
    const plusPetit = l => l.sort((x, y) => cle(x)[0] - cle(y)[0] || cle(x)[1] - cle(y)[1])[0];
    while (reste.size) {
      const libres = [...reste].filter(s => ![...avant.get(s)].some(d => reste.has(d)));
      const s = plusPetit(libres.length ? libres : [...reste]);
      ordre.push(s); reste.delete(s);
    }
    return ordre;
  }

  /**
   * Les groupes du planning : un par service, dans l'ordre des chemins (`parcours`), ses équipes qui ont des lots. Un service dont
   * aucune équipe n'a de lot garde son groupe s'il a une courbe de charge (`avecCharge`, un Set) : une équipe d'appui
   * est là, sa charge se lit ; ses équipes ont alors une ligne vide.
   */
  function groupes(r, nomService, avecCharge, parcours) {
    const nom = id => (nomService ? nomService(id) : id) || id;
    return ordreDesServices(r, parcours).map(s => {
      const toutes = r.ateliers.filter(a => a.service === s), avec = toutes.filter(a => (a.lots || []).length);
      return { service: s, nom: nom(s), equipes: avec.length ? avec : avecCharge && avecCharge.has(s) ? toutes : [] };
    }).filter(g => g.equipes.length);
  }

  /** Les morceaux d'une barre, de `debut` à `fin`, sans les pauses prises ([{ de, a }]). */
  function segments(debut, fin, pauses) {
    let morceaux = [[debut, fin]];
    for (const p of pauses || []) {
      morceaux = morceaux.flatMap(([a, b]) => (p.a <= a || p.de >= b ? [[a, b]] : [[a, Math.min(b, p.de)], [Math.max(a, p.a), b]]));
    }
    return morceaux.filter(([a, b]) => b - a > 1e-9);
  }

  /** Les limites des commandes d'un lot : les « prête avant » de ses commandes. */
  const echeancesDe = (l, par) => (l.classes || []).map(c => par[c]).filter(k => k && !k.absente && Number.isFinite(k.echeance));

  /** Un lot fini après la limite de sa commande ; au handling, un vol chargé en retard. */
  function enRetard(l, par) {
    if (!tourne(l)) return false;
    if (l.handling) return l.aHeure === false;
    return echeancesDe(l, par || {}).some(k => l.fin > k.echeance + 1e-9);
  }

  /** La marge d'un lot, en minutes : « prête avant » − « prête à » de sa commande la plus juste ; au handling, son départ. */
  function marge(l, par) {
    if (!tourne(l)) return null;
    if (l.handling) return Number.isFinite(l.depart) ? l.depart - l.fin : null;
    const m = echeancesDe(l, par || {}).map(k => k.echeance - (k.fin == null ? l.fin : k.fin));
    return m.length ? Math.min(...m) : null;
  }

  /** L'infobulle d'une barre : la commande, le début, la fin, la durée, l'attente et la marge. */
  function info(l, a, o) {
    const nomSvc = id => ((o && o.nomService) ? o.nomService(id) : id) || id, m = marge(l, (o && o.parClasse) || {});
    // Une seule écriture du temps (évolution 15 c) : « 45 min » sous une heure, « 2 h 05 » au-delà.
    const dl = x => P().dureeLisible(x);
    return P().enClair(l.nom) + '\n' + P().hhmm(l.debut) + ' → ' + P().hhmm(l.fin) + ' (' + dl(l.duree)
      + (l.arret ? ', dont ' + dl(l.arret) + ' d’arrêt' : '') + ')'
      + (l.fusion ? '\nÀ la chaîne : ' + nomSvc(l.fusion) + ' ' + dl(l.minutesFusion || 0) + ' + ' + nomSvc(a.service) + ' ' + dl(l.minutesIci || 0) + ' de travail' : '')
      + '\nAttente : ' + (l.attente >= 0.5 ? dl(l.attente) : 'aucune')
      + (m == null ? '' : m < -0.5 ? '\nRetard : ' + dl(-m) : '\nMarge : ' + dl(Math.max(0, m)));
  }

  /* ---- l'axe ---------------------------------------------------------------------- */

  /** « J-1 06:00 → J 06:00 ». */
  const instant = t => jourEcrit(jourDe(t)) + ' ' + heureDe(t);
  const periode = (de, a) => instant(de) + ' → ' + instant(a);
  /** La période visible : `gauche` pixels défilés, `largeur` pixels d'heures visibles. */
  function visible({ t0, pxh, gauche, largeur }) {
    const de = t0 + gauche / pxh * 60;
    return { de, a: de + largeur / pxh * 60 };
  }

  /** Les deux niveaux de l'axe : les jours ({ nom, de, a }), les heures ({ t, texte }) au pas lisible. */
  function reperes(t0, t1, pxh) {
    const pas = PAS.find(k => k / 60 * pxh >= ECART_REPERES) || JOUR, jours = [], heures = [];
    for (let j = jourDe(t0); j * JOUR < t1 && jours.length < 60; j++) jours.push({ j, nom: jourEcrit(j), de: Math.max(t0, j * JOUR), a: Math.min(t1, (j + 1) * JOUR) });
    for (let t = Math.ceil(t0 / pas) * pas; t < t1 && heures.length < 2000; t += pas) heures.push({ t, texte: heureDe(t) });
    return { jours, heures, pas };
  }

  /* ---- la commande mise en évidence -------------------------------------------------- */

  /** Ce qu'un clic sur un lot met en évidence : ses commandes ; sans commande (un retour à laver), son vol. */
  const commandeDe = l => ((l.classes || []).length ? l.classes.slice() : l.vol != null ? ['vol:' + l.vol] : []);
  const porte = (l, cle) => commandeDe(l).some(c => cle.includes(c));

  /* ==== le dessin (navigateur) ======================================================== */

  /** Ce que la page garde d'un dessin à l'autre : le zoom, les groupes repliés, l'heure à gauche, la commande choisie. */
  const etat = { zoom: 'jour', replis: new Set(), gauche: null, choix: null, vue: null, vise: null, amener: false };

  const ico = nom => (root.OrlyIcones ? root.OrlyIcones.TRAITS[nom] || '' : '');

  function legende() {
    const cle = (cls, mot, titre) => `<span class="pg-cle" title="${esc(titre)}"><i class="pg-ex ${cls}" aria-hidden="true"></i>${esc(mot)}</span>`;
    return `<p class="pg-legende" aria-label="Ce que disent les barres">
      ${cle('travail', 'travail', 'Barre pleine : l’équipe prépare.')}
      ${cle('attente', 'attente', 'Bande fine devant la barre : l’équipe attend le service d’avant.')}
      ${cle('pause', 'pause', 'Un trou dans la barre : une pause prise.')}
      ${cle('motif', 'robot, lavage', 'Un motif : le robot, ou le lavage.')}
      ${cle('chaine', 'à la chaîne', 'Une encoche : deux étapes faites d’un bloc, à la chaîne.')}
      ${cle('retard', 'en retard', 'Contour et alerte : le lot finit après la limite de sa commande.')}
      ${cle('limite', 'prête avant', 'Le petit trait après la barre : la limite de la commande. L’écart, c’est la marge.')}
      ${cle('presents', 'présents', 'En tête de chaque service : les personnes présentes, par créneau de 15 min.')}
      ${cle('autravail', 'au travail', 'En tête de chaque service : les personnes au travail.')}
      ${cle('appui', 'en appui', 'En tête de chaque service, en pointillé : les personnes en appui ou à disposition.')}
      ${cle('file', 'en file', 'En tête de chaque service : ce qui attend son équipe.')}
      <span class="pg-cle pg-cle-maintenant" title="Le trait vertical : l’heure où en est le rejeu."><i class="pg-ex maintenant" aria-hidden="true"></i>heure rejouée</span>
    </p>`;
  }

  /** Une barre : ses morceaux (les pauses prises y font des trous), son attente devant, son étiquette, sa limite. */
  function barre(l, i, a, v) {
    const { x, par, lim, nomSvc } = v, y = 5, h = HAUT_LIGNE - 10;
    if (l.dispo) return `<rect class="at-pl-dispo" x="${(x(l.debut) - 3).toFixed(1)}" y="${y - 1}" width="6" height="${h + 2}" rx="2" data-info="Disponible à partir de ${P().hhmm(l.debut)}"/>`;
    if (l.fin == null) return `<rect class="at-pl-bloque" x="${x(l.debut).toFixed(1)}" y="${y}" width="10" height="${h}" rx="3" data-info="${esc(P().enClair(l.nom))} : ne tourne pas"/>`;
    const motif = a.type === 'robot' || a.type === 'lavage', retard = enRetard(l, par), x0 = x(l.debut), x1 = Math.max(x0 + 2, x(l.fin));
    const pauses = (a.pausesPrises || []).filter(p => p.a > l.debut && p.de < l.fin);
    const morceaux = segments(l.debut, l.fin, x1 - x0 >= 6 ? pauses : []).map(([d, f]) => [x(d), Math.max(x(d) + 1, x(f))]);
    if (!morceaux.length) morceaux.push([x0, x1]);
    morceaux[morceaux.length - 1][1] = Math.max(morceaux[morceaux.length - 1][1], x1);
    // L'encoche du travail à la chaîne : un coin ouvert, en haut du premier morceau.
    const forme = ([d, f], k) => (l.fusion && k === 0 && f - d >= 8
      ? `<path class="pg-seg" d="M${d.toFixed(1)} ${y + h}V${y + 3}q0-3 3-3h1l3 5 3-5H${(f - 3).toFixed(1)}q3 0 3 3v${h - 6}q0 3-3 3H${(d + 3).toFixed(1)}q-3 0-3-3z"/>`
      : `<rect class="pg-seg" x="${d.toFixed(1)}" y="${y}" width="${(f - d).toFixed(1)}" height="${h}" rx="${Math.min(3, (f - d) / 2).toFixed(1)}"/>`)
      + (motif ? `<rect class="pg-motif" x="${d.toFixed(1)}" y="${y}" width="${(f - d).toFixed(1)}" height="${h}" rx="${Math.min(3, (f - d) / 2).toFixed(1)}"/>` : '');
    const att = l.attente >= 0.5 ? `<rect class="at-pl-attente" x="${x(l.debut - l.attente).toFixed(1)}" y="${y + 6}" width="${Math.max(1, x0 - x(l.debut - l.attente)).toFixed(1)}" height="${h - 12}" rx="2"/>` : '';
    // L'étiquette, dans le plus large morceau, si elle y tient : la commande en clair, sinon son code.
    const large = morceaux.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p)), place = large[1] - large[0] - (retard ? 16 : 0);
    const DS = root.OrlyDS, mot = DS ? [P().enClair(l.nom), String(l.nom).replace(/^Vol /, '')].find(s => s && DS.largeurTexte(s, 12) + 10 <= place) || '' : '';
    const contour = retard ? `<rect class="pg-contour" x="${(x0 - 1).toFixed(1)}" y="${y - 1}" width="${(x1 - x0 + 2).toFixed(1)}" height="${h + 2}" rx="4"/>`
      + (x1 - x0 >= 16 ? `<g class="pg-alerte" transform="translate(${(x1 - 15).toFixed(1)} ${y + 2}) scale(.58)">${ico('alerte')}</g>` : '') : '';
    // La limite de la commande : un petit trait, relié au bout de la barre — l'écart, c'est la marge.
    const traits = (lim.get(l) || []).map(e => `<line class="pg-marge" x1="${Math.min(x1, x(e)).toFixed(1)}" y1="${y + h / 2}" x2="${Math.max(x1, x(e)).toFixed(1)}" y2="${y + h / 2}"/>`
      + `<line class="pg-limite${e < l.fin ? ' depassee' : ''}" data-limite="${e}" x1="${x(e).toFixed(1)}" y1="${y - 3}" x2="${x(e).toFixed(1)}" y2="${y + h + 3}"/>`).join('');
    const dit = info(l, a, { parClasse: par, nomService: nomSvc });
    return `<g class="at-pl-lot pg-lot${a.type === 'robot' ? ' robot' : ''}${a.type === 'lavage' ? ' lavage' : ''}${l.fusion ? ' chaine' : ''}${retard ? ' retard' : ''}" tabindex="0" role="button"
      data-lot="${i}" data-debut="${l.debut}" data-fin="${l.fin}" data-x="${x0.toFixed(2)}" data-x1="${x1.toFixed(2)}" data-info="${esc(dit)}" aria-label="${esc(dit.replace(/\n/g, ', '))}">${att}${morceaux.map(forme).join('')}${contour}${
      mot ? `<text class="at-pl-etiq" x="${(large[0] + 5).toFixed(1)}" y="${y + 13}">${esc(mot)}</text>` : ''}${traits}</g>`;
  }

  /** L'axe, sur deux niveaux : le jour, puis les heures. */
  function axe(v) {
    const { x, t0, t1, pxh, L } = v, R = reperes(t0, t1, pxh);
    return `<svg class="pg-axe-svg" width="${L}" height="${HAUT_AXE}" style="width:${L}px;height:${HAUT_AXE}px" viewBox="0 0 ${L} ${HAUT_AXE}" aria-hidden="true">
      ${R.jours.map(j => `<g class="pg-jour" data-jour="${j.j}"><rect x="${x(j.de).toFixed(1)}" y="0" width="${(x(j.a) - x(j.de)).toFixed(1)}" height="18"/>
        <text x="${(x(j.de) + 6).toFixed(1)}" y="13">${esc(j.nom)}</text></g>`).join('')}
      ${R.heures.map(h => `<line class="pg-tic${h.t % JOUR === 0 ? ' minuit' : ''}" x1="${x(h.t).toFixed(1)}" y1="${h.t % JOUR === 0 ? 0 : 20}" x2="${x(h.t).toFixed(1)}" y2="${HAUT_AXE}"/>
        <text class="at-pl-heure" data-t="${h.t}" x="${(x(h.t) + 4).toFixed(1)}" y="34">${esc(h.texte)}</text>`).join('')}
    </svg>`;
  }

  /** Le planning entier, à l'échelle `pxh` (pixels par heure). */
  function toile(o, v) {
    const r = o.resultat, C = root.OrlyChargeVue, k = v.k, courbes = v.courbes;
    const R = reperes(v.t0, v.t1, v.pxh);
    const corps = v.groupes.map((g, n) => {
      const replie = etat.replis.has(g.service), s = courbes.get(g.service), m = s && C.mini ? C.mini(s, { t0: v.t0, t1: v.t1, pxm: v.pxh / 60, haut: HAUT_GROUPE }, k.pas) : null;
      const lignes = g.equipes.map(a => {
        const fu = (a.lots.find(l => l.fusion) || {}).fusion, nom = a.nom + (fu ? ' +' + v.nomSvc(fu) : '');
        return `<div class="pg-ligne" data-equipe="${esc(a.id)}"><div class="pg-nom" title="${esc(a.nom + (fu ? ' — fait aussi ' + v.nomSvc(fu) + ', à la chaîne' : ''))}"><span>${esc(nom)}</span></div>
          <svg class="ds-graphique pg-barres" width="${v.L}" height="${HAUT_LIGNE}" style="width:${v.L}px;height:${HAUT_LIGNE}px" viewBox="0 0 ${v.L} ${HAUT_LIGNE}" role="group" aria-label="${esc(a.nom)}">${a.lots.map((l, i) => barre(l, r.lots.indexOf(l) >= 0 ? r.lots.indexOf(l) : 'x' + i, a, v)).join('')}</svg></div>`;
      }).join('');
      return `<section class="pg-groupe${replie ? ' replie' : ''}" data-service="${esc(g.service)}">
        <div class="pg-groupe-tete"><div class="pg-groupe-nom"><button type="button" class="pg-replier" aria-expanded="${!replie}" aria-controls="pg-lignes-${n}" title="${replie ? 'Déplier' : 'Replier'} ce service">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ico('bas')}</svg><span class="pg-service">${esc(g.nom)}</span><span class="pg-compte">${g.equipes.length}</span></button>
          <span class="pg-note ch-note" title="${esc(m ? m.note : '')}">${esc(m ? m.note : '')}</span></div>${m ? m.html : `<div class="pg-sans-courbe" style="width:${v.L}px"></div>`}</div>
        <div class="pg-lignes" id="pg-lignes-${n}"${replie ? ' hidden' : ''}>${lignes}</div></section>`;
    }).join('');
    const minuits = R.jours.filter(j => j.de === j.j * JOUR && j.de > v.t0).map(j => `<i class="pg-minuit" style="left:${(NOMS + v.x(j.de)).toFixed(1)}px"></i>`).join('');
    return `<div class="pg-toile" style="width:${NOMS + v.L}px;--pg-pas:${(R.pas / 60 * v.pxh).toFixed(2)}px;--pg-decalage:${v.x(Math.ceil(v.t0 / R.pas) * R.pas).toFixed(2)}px">
      <svg class="pg-defs" width="0" height="0" aria-hidden="true"><defs><pattern id="pg-motif" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6"/></pattern></defs></svg>
      <div class="pg-axe"><div class="pg-coin">Équipes</div>${axe(v)}<span class="pg-maintenant-heure" hidden></span></div>
      ${corps}${minuits}<i class="pg-maintenant" hidden></i></div>`;
  }

  /** La vue courante : l'échelle, la largeur, la position des heures. */
  function vueDe(box, o) {
    const r = o.resultat, b = bornes(r), cadre = box.querySelector('.pg-cadre');
    const largeur = Math.max(120, (cadre ? cadre.clientWidth : 0) - NOMS - 2), pxh = pxParHeure(etat.zoom, largeur, b.t0, b.t1);
    const nomSvc = id => ((o.nomService ? o.nomService(id) : id) || id);
    const x = t => (t - b.t0) / 60 * pxh;
    // La charge de chaque service (moteur/indicateurs.js, comme partout) : sa courbe en tête de son groupe.
    const C = root.OrlyChargeVue, I = root.OrlyIndicateurs, k = C && I && C.servicesDe ? I.journee(r, o.args || {}) : null;
    const courbes = new Map((k ? C.servicesDe(k, nomSvc) : []).map(s => [s.id, s]));
    return { t0: b.t0, t1: b.t1, pxh, largeur, L: Math.ceil((b.t1 - b.t0) / 60 * pxh), x, par: r.parClasse || {}, lim: limites(r), nomSvc, k, courbes,
      groupes: groupes(r, nomSvc, new Set(courbes.keys()), (o.args || {}).parcours) };
  }

  function direPeriode(box) {
    const v = etat.vue, cadre = box.querySelector('.pg-cadre'), p = box.querySelector('.pg-periode');
    // Caché (une autre page), le cadre n'a pas de largeur : l'heure à gauche reste celle d'avant.
    if (!v || !cadre || !p || !(cadre.clientWidth > 0)) return;
    const vis = visible({ t0: v.t0, pxh: v.pxh, gauche: cadre.scrollLeft, largeur: Math.max(0, cadre.clientWidth - NOMS) });
    const de = Math.max(v.t0, vis.de), a = Math.min(v.t1, vis.a);
    p.textContent = periode(Math.round(de), Math.round(a));
    p.dataset.de = Math.round(de); p.dataset.a = Math.round(a);
    etat.gauche = de;
    // Le nom du jour reste à la vue tant qu'on est dans ce jour : il suit le bord gauche, sans sortir de son jour.
    for (const g of box.querySelectorAll('.pg-jour')) {
      const r = g.querySelector('rect'), t = g.querySelector('text'), x0 = +r.getAttribute('x'), w = +r.getAttribute('width');
      t.setAttribute('x', Math.max(x0 + 6, Math.min(x0 + w - 34, cadre.scrollLeft + 6)).toFixed(1));
    }
  }

  /** Redessine la toile à l'échelle courante ; `ancre` : { t, px } garde cette heure à ce pixel de la zone visible. */
  function tracer(box, o, ancre) {
    const cadre = box.querySelector('.pg-cadre'); if (!cadre) return;
    const v = etat.vue = vueDe(box, o);
    cadre.innerHTML = toile(o, v);
    for (const b of box.querySelectorAll('[data-pg-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.pgZoom === etat.zoom));
    const t = ancre ? ancre.t : etat.gauche != null ? etat.gauche : Math.max(v.t0, jourLePlusCharge(o.resultat) * JOUR);
    cadre.scrollLeft = Math.max(0, v.x(t) - (ancre ? ancre.px : 0));
    appliquerChoix(box);
    direPeriode(box);
    maintenant();
    appliquerVise(box);
  }

  function appliquerChoix(box) {
    const t = box.querySelector('.pg-toile'), r = etat.o && etat.o.resultat; if (!t || !r) return;
    t.classList.toggle('choix', !!etat.choix);
    for (const g of t.querySelectorAll('.pg-lot')) {
      const l = r.lots[+g.dataset.lot];
      g.classList.toggle('net', !!(etat.choix && l && porte(l, etat.choix)));
    }
  }

  /** L'infobulle au focus clavier (au survol, c'est celle du design system). */
  let bulle = null;
  function bulleAuFocus(g) {
    if (!g) { if (bulle) bulle.hidden = true; return; }
    if (!bulle) { bulle = document.createElement('div'); bulle.className = 'pg-bulle'; bulle.setAttribute('role', 'tooltip'); document.body.appendChild(bulle); }
    const b = g.getBoundingClientRect();
    bulle.textContent = g.getAttribute('data-info'); bulle.hidden = false;
    const w = bulle.offsetWidth, h = bulle.offsetHeight, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    bulle.style.left = Math.round(Math.max(8, Math.min(vw - w - 8, b.left))) + 'px';
    bulle.style.top = Math.round(b.bottom + 8 + h > vh ? Math.max(8, b.top - h - 8) : b.bottom + 8) + 'px';
  }

  /** Les gestes : les zooms (boutons, Ctrl + molette), replier, glisser, choisir une commande, Échap. Une fois par boîte. */
  function brancher(box) {
    if (box.__pg) return;
    box.__pg = true;
    const cadreDe = () => box.querySelector('.pg-cadre');
    const zoomer = (zoom, ancre) => { if (zoom === etat.zoom) return; etat.zoom = zoom; tracer(box, etat.o, ancre); };
    box.addEventListener('click', e => {
      const z = e.target.closest('[data-pg-zoom]');
      if (z) { const c = cadreDe(), v = etat.vue; zoomer(z.dataset.pgZoom, v && c ? { t: v.t0 + (c.scrollLeft + (c.clientWidth - NOMS) / 2) / v.pxh * 60, px: (c.clientWidth - NOMS) / 2 } : null); return; }
      const rp = e.target.closest('.pg-replier');
      if (rp) {
        const g = rp.closest('.pg-groupe'), replie = !g.classList.contains('replie');
        g.classList.toggle('replie', replie); rp.setAttribute('aria-expanded', String(!replie)); rp.title = (replie ? 'Déplier' : 'Replier') + ' ce service';
        g.querySelector('.pg-lignes').hidden = replie;
        if (replie) etat.replis.add(g.dataset.service); else etat.replis.delete(g.dataset.service);
        maintenant();
        return;
      }
      if (box.__glisse) { box.__glisse = false; return; }
      const lot = e.target.closest('.pg-lot'), r = etat.o && etat.o.resultat;
      if (lot && r && r.lots[+lot.dataset.lot]) { etat.choix = commandeDe(r.lots[+lot.dataset.lot]); if (!etat.choix.length) etat.choix = null; appliquerChoix(box); }
      else if (e.target.closest('.pg-cadre') && etat.choix) { etat.choix = null; appliquerChoix(box); }
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape' && etat.choix) { etat.choix = null; appliquerChoix(box); return; }
      const lot = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.pg-lot');
      if (lot) { e.preventDefault(); lot.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
    box.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('.pg-lot'); bulleAuFocus(g && g.matches(':focus-visible') ? g : null); });
    box.addEventListener('focusout', () => bulleAuFocus(null));
    // Ctrl + molette : le zoom d'à côté, l'heure sous le pointeur reste à sa place.
    box.addEventListener('wheel', e => {
      const c = e.target.closest && e.target.closest('.pg-cadre'), v = etat.vue;
      if (!c || !e.ctrlKey || !v) return;
      e.preventDefault();
      const px = Math.max(0, e.clientX - c.getBoundingClientRect().left - NOMS);
      zoomer(zoomVoisin(etat.zoom, e.deltaY < 0 ? 1 : -1), { t: v.t0 + (c.scrollLeft + px) / v.pxh * 60, px });
    }, { passive: false });
    // Glisser pour se déplacer ; un simple clic reste un clic.
    let depart = null;
    box.addEventListener('pointerdown', e => {
      const c = e.target.closest && e.target.closest('.pg-cadre');
      if (!c || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('button')) return;
      depart = { x: e.clientX, y: e.clientY, gauche: c.scrollLeft, haut: c.scrollTop, c, bouge: false };
    });
    root.addEventListener('pointermove', e => {
      if (!depart) return;
      const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
      if (!depart.bouge && Math.hypot(dx, dy) < 4) return;
      depart.bouge = true; depart.c.classList.add('glisse');
      depart.c.scrollLeft = depart.gauche - dx; depart.c.scrollTop = depart.haut - dy;
    });
    root.addEventListener('pointerup', () => {
      if (!depart) return;
      if (depart.bouge) { box.__glisse = true; depart.c.classList.remove('glisse'); setTimeout(() => { box.__glisse = false; }, 0); }
      depart = null;
    });
    box.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('pg-cadre')) direPeriode(box); }, true);
    if (typeof ResizeObserver === 'function') {
      let largeur = 0;
      new ResizeObserver(() => {
        const c = cadreDe(); if (!c || !etat.o || !etat.vue) return;
        if (c.clientWidth === largeur) return;
        const montre = !largeur && c.clientWidth > 0;
        largeur = c.clientWidth;
        // Montré après avoir été dessiné caché, ou « Toute la chaîne » dans une autre largeur : on redessine.
        if (c.clientWidth > 0 && (montre || etat.zoom === 'chaine')) tracer(box, etat.o); else direPeriode(box);
      }).observe(box);
    }
  }

  /**
   * Le planning dans `box`. `o` : { resultat, args, nomService(id) }. Sans lot, une phrase.
   */
  function rendre(box, o) {
    if (!box) return;
    const r = o.resultat;
    etat.o = o;
    if (!r || !r.ok || !(r.lots || []).length || !bornes(r)) {
      etat.vue = null;
      box.classList.remove('pg');
      box.innerHTML = '<p class="mini-note">Le planning apparaîtra dès qu’une équipe aura quelque chose à fabriquer.</p>';
      return;
    }
    box.classList.add('pg');
    // Une autre journée (un autre programme, un autre jour) : le planning revient au jour où le plus de lots tournent.
    const b = bornes(r), cle = b.t0 + '|' + b.t1 + '|' + jourLePlusCharge(r);
    if (etat.cle !== cle) { etat.cle = cle; etat.gauche = null; }
    // Une commande choisie qui n'existe plus ne reste pas en évidence.
    if (etat.choix && !r.lots.some(l => porte(l, etat.choix))) etat.choix = null;
    box.innerHTML = `<div class="pg-barre"><div class="pg-zooms" role="group" aria-label="Le zoom du planning">${ZOOMS.map(z =>
      `<button type="button" class="btn btn-sm" data-pg-zoom="${z.id}" aria-pressed="${z.id === etat.zoom}">${esc(z.nom)}</button>`).join('')}</div>
      <span class="pg-periode" role="status" aria-label="La période visible"></span>
      <span class="pg-aide mini-note">Ctrl + molette : zoomer · glisser : se déplacer · un clic sur une barre : sa commande</span></div>
      ${legende()}
      <div class="pg-cadre" tabindex="0" role="region" aria-label="La journée des équipes"></div>`;
    brancher(box);
    tracer(box, o);
  }

  /**
   * Montrer un service (un clic dans la Synthèse, évolution 15 b) : déplié, amené à la vue une fois, marqué ; son bouton
   * reçoit le focus. Appliqué après la navigation vers la page, et à chaque tracé tant qu'il reste visé.
   */
  function viser(service) {
    etat.vise = service == null || service === '' ? null : String(service);
    etat.amener = !!etat.vise;
    if (etat.vise) etat.replis.delete(etat.vise);
    if (typeof document !== 'undefined') setTimeout(() => appliquerVise(document.getElementById('at-planning')), 0);
  }
  function appliquerVise(box) {
    if (!box) return;
    for (const g of box.querySelectorAll('.pg-groupe.pg-vise')) g.classList.remove('pg-vise');
    const g = etat.vise ? [...box.querySelectorAll('.pg-groupe')].find(x => x.dataset.service === etat.vise) : null;
    if (!g) return;
    const b = g.querySelector('.pg-replier');
    if (g.classList.contains('replie') && b) b.click();
    g.classList.add('pg-vise');
    if (!etat.amener || !g.offsetParent) return;
    etat.amener = false;
    g.scrollIntoView({ block: 'start' });
    if (b) b.focus({ preventScroll: true });
  }

  /** L'heure rejouée : un trait sur toute la hauteur, son heure dans l'axe. `t` : minutes, ou null avant le rejeu. */
  let heure = null;
  function maintenant(t) {
    if (arguments.length) heure = t != null && Number.isFinite(+t) ? +t : null;
    if (typeof document === 'undefined') return;
    const box = document.getElementById('at-planning'), v = etat.vue;
    const trait = box && box.querySelector('.pg-maintenant'), mot = box && box.querySelector('.pg-maintenant-heure');
    if (!trait || !mot || !v) return;
    const dedans = heure != null && heure >= v.t0 && heure <= v.t1;
    trait.hidden = mot.hidden = !dedans;
    if (!dedans) { for (const h of box.querySelectorAll('.pg-sous-maintenant')) h.classList.remove('pg-sous-maintenant'); return; }
    const gauche = NOMS + v.x(heure);
    trait.style.left = gauche.toFixed(1) + 'px'; mot.style.left = gauche.toFixed(1) + 'px';
    mot.textContent = P().hhmm(heure); mot.dataset.t = heure;
    // L'heure de l'axe que l'étiquette du trait recouvre s'efface : on lit l'une ou l'autre, pas les deux mêlées.
    const x = v.x(heure);
    for (const h of box.querySelectorAll('.pg-axe-svg .at-pl-heure')) {
      const hx = +h.getAttribute('x');
      h.classList.toggle('pg-sous-maintenant', hx < x + 26 && hx + 36 > x - 26);
    }
  }

  const api = { ZOOMS, PX_HEURE, HAUT_LIGNE, HAUT_GROUPE, NOMS, pxParHeure, zoomVoisin, bornes, jourLePlusCharge, ordreDesServices, groupes, segments, limites, enRetard,
    marge, info, periode, visible, reperes, commandeDe, porte, rendre, maintenant, viser, etat };
  if (enNode) module.exports = api;
  else root.OrlyPlanningVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
