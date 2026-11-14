/* ==========================================================================
 *  LE PLANNING DES ÉQUIPES (version 1, évolution 14 c, correction 18 b —
 *  README, « Lire le plan rejoué et le planning »)
 *  ------------------------------------------------------------------------
 *  D'abord toute l'unité sur un écran, puis le détail d'un service :
 *  — à l'ouverture, tous les services sont repliés : une ligne de 32 px par
 *    service, dans l'ordre des chemins, avec son nom, le nombre de ses
 *    équipes, « pic au travail / présents », et sur l'axe du temps sa courbe
 *    de charge (présents, au travail) et un trait fin par lot ; un clic sur
 *    un service le déplie (son résumé en entier, puis ses équipes) ; « Tout
 *    déplier », « Tout replier » ; la page se souvient du choix ;
 *  — les services et les équipes sans lot le jour affiché se rangent en bas,
 *    sous une ligne repliée « Sans lot ce jour (n) » ;
 *  — un jour de travail à la fois, par onglets (les jours qui ont des lots) ;
 *    trois zooms : « Toute la chaîne » (tous les jours, dans la largeur
 *    visible), « Un jour » (du premier lot moins 30 min au dernier plus
 *    30 min, dans la largeur : une heure fait au moins 40 px) et « 6 h »
 *    (160 px par heure) ; par boutons et par Ctrl + molette ; on se déplace
 *    en glissant ou par la barre de défilement ; la période visible s'affiche ;
 *  — l'axe des heures reste en haut, sur deux niveaux (le jour, les heures),
 *    et les noms à gauche (jusqu'à 260 px, chaque équipe avec son nombre de
 *    personnes), pendant les défilements ; le cadre prend la hauteur qui
 *    reste ; « Plein écran » recouvre le menu et l'en-tête, Échap en sort ;
 *  — les barres : le travail plein (3 px au moins), l'attente des amonts en
 *    bande fine devant, le temps sans travail avant le premier lot en bande
 *    hachurée, une pause prise en trou, le robot et le lavage avec un motif,
 *    le travail à la chaîne avec une encoche, un lot fini après la limite de
 *    sa commande avec un contour critique et une icône ; la limite de chaque
 *    commande, un petit trait au bout de la barre de son dernier lot — une
 *    flèche au bord droit quand elle est après la fenêtre ;
 *  — la légende ne montre que les signes présents à l'écran, et se replie ;
 *  — un clic sur une barre met sa commande en évidence ; Échap annule.
 *  Rien n'est calculé ici : on lit le résultat du moteur, ses indicateurs et
 *  les réponses ; ce que le planning montre se décide dans
 *  planning-ensemble.js. Les fonctions sans navigateur se testent sous Node.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const ORDRE = () => (enNode ? require('./moteur/ordre-services.js') : root.OrlyOrdreServices);
  const E = () => (enNode ? require('./planning-ensemble.js') : root.OrlyPlanningEnsemble);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const IND = () => (enNode ? require('./moteur/indicateurs.js') : root.OrlyIndicateurs);

  const JOUR = 1440;
  /** Les trois zooms : « Un jour » remplit la largeur (40 px par heure au moins), « 6 h » a une heure de 160 px. */
  const ZOOMS = [{ id: 'chaine', nom: 'Toute la chaîne' }, { id: 'jour', nom: 'Un jour' }, { id: 'six', nom: '6 h' }];
  const PX_HEURE = { jour: 40, six: 160 };
  /** Les hauteurs, en pixels : une ligne d'équipe, la ligne d'un service, l'axe (le jour, puis les heures). */
  const HAUT_LIGNE = 28, HAUT_GROUPE = 32, HAUT_AXE = 40;
  /** Une barre fait au moins 3 px de large. */
  const BARRE_MIN = 3;
  /** Deux repères de l'axe à 40 px au moins : « 06:00 » s'y lit. */
  const PAS = [30, 60, 120, 180, 240, 360, 720, 1440], ECART_REPERES = 40;

  const jourEcrit = j => (j > 0 ? 'J+' + j : j < 0 ? 'J' + j : 'J');
  const jourDe = t => Math.floor(t / JOUR);
  const heureDe = t => P().hhmm(t - jourDe(t) * JOUR);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- l'échelle ---------------------------------------------------------------- */

  /**
   * La largeur d'une heure, en pixels (planning-ensemble.js) : « Un jour » remplit `largeur`, sans descendre sous 40 px ;
   * « 6 h » : 160 px ; « Toute la chaîne » tient dans `largeur`.
   */
  const pxParHeure = (zoom, largeur, t0, t1) => E().pxParHeure(zoom, largeur, t0, t1);
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
    // Un lavage arrêté à une fin de présence (évolution 18) n'a pas de fin : sa dernière part en a une, la fenêtre va jusqu'à elle.
    const finDe = l => Math.max(l.fin == null ? l.debut : l.fin, ...(Array.isArray(l.parts) ? l.parts.map(p => p.fin).filter(Number.isFinite) : []));
    let a = Math.min(...lots.map(l => l.debut)), b = Math.max(...lots.map(finDe));
    for (const v of limites(r).values()) b = Math.max(b, v[v.length - 1]);
    const t0 = Math.floor(a / 60) * 60;
    return { t0, t1: Math.max(t0 + 60, Math.ceil(b / 60) * 60) };
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

  /**
   * Le lot tel qu'une équipe l'a tenu (évolution 18). Un lavage par vol passé en relais, ou arrêté à une fin de présence,
   * porte ses parts : l'équipe le tient pendant la sienne — son début, sa fin, son travail. `relais` dit ce qu'il y a
   * autour : qui l'a commencé (`de`), qui le reprend et quand (`vers`), s'il s'arrête là (`arrete` : l'heure, ce qu'il
   * reste à laver) et, passé en relais, l'heure où il est propre. Tout autre lot : tel quel. Null si elle n'y a pas de part.
   */
  function lotTenu(l, a, nomEquipe) {
    if (!Array.isArray(l.parts)) return l;
    const i = l.parts.findIndex(p => p.atelier === a.id), n = l.parts.length;
    if (i < 0) return null;
    const p = l.parts[i], nom = id => (nomEquipe ? nomEquipe(id) : id) || id, dernier = i === n - 1;
    return { ...l, debut: p.debut, fin: p.fin, duree: p.travail, arret: p.arret, attente: i ? 0 : l.attente,
      // `vers.a` : l'heure où l'équipe suivante le prend — la fin de la part pour un relais ; son arrivée pour une reprise (correction 19).
      relais: { rang: i, n, de: i ? { nom: nom(l.parts[i - 1].atelier) } : null, vers: dernier ? null : { nom: nom(l.parts[i + 1].atelier), a: l.parts[i + 1].debut },
        arrete: dernier && l.fin == null ? { a: p.fin, reste: +l.reste || 0 } : null, propre: n > 1 && Number.isFinite(l.fin) ? l.fin : null } };
  }
  /** Les mots d'un lavage en relais : « commencé par … », « repris par … à hh:mm » ; arrêté, ce qu'il en reste pour le lendemain. */
  function motsDuRelais(x) {
    return (x.de ? '\nEn relais : commencé par ' + x.de.nom : '') + (x.vers ? '\nEn relais : repris par ' + x.vers.nom + ' à ' + P().hhmm(x.vers.a) : '')
      + (x.arrete ? '\nArrêté à ' + P().hhmm(x.arrete.a) + ', à la fin de la présence : reste ' + P().dureeLisible(x.arrete.reste) + ' à laver le lendemain'
        : x.propre !== null ? '\nPropre à ' + P().hhmm(x.propre) : '');
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
      + (m == null ? '' : m < -0.5 ? '\nRetard : ' + dl(-m) : '\nMarge : ' + dl(Math.max(0, m)))
      + (l.relais ? motsDuRelais(l.relais) : '');
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

  /**
   * Ce que la page garde d'un dessin à l'autre : le zoom, le jour affiché, les services dépliés (tous repliés à l'ouverture),
   * l'heure à gauche, la commande choisie, la légende (repliée ou non), le plein écran.
   */
  const etat = { zoom: 'jour', jour: null, deplies: new Set(), gauche: null, choix: null, vue: null, vise: null, amener: false, legende: true, plein: false };

  /*
   * Les services dépliés : ce navigateur s'en souvient (une préférence d'affichage, `ory-ui-…`, que le garde des onglets
   * laisse passer, comme le tableau des équipes de charge-vue.js) ; sans stockage, le choix vaut pour la page. Ce qui est lu
   * est vérifié : une liste de noms de services, rien d'autre.
   */
  const CLE_DEPLIES = 'ory-ui-planning-deplies';
  function lireDeplies() {
    try {
      const l = JSON.parse(root.localStorage.getItem(CLE_DEPLIES) || '[]');
      return new Set(Array.isArray(l) ? l.filter(x => typeof x === 'string' && x.length <= 200).slice(0, 500) : []);
    } catch (e) { return new Set(); }
  }
  /** Avant le premier dessin (ou la première écriture) : les services que ce navigateur avait laissés dépliés — aucun, la première fois. */
  function relire() { if (!etat.relu) { etat.relu = true; for (const x of lireDeplies()) etat.deplies.add(x); } }
  function retenirDeplies() { try { root.localStorage.setItem(CLE_DEPLIES, JSON.stringify([...etat.deplies])); } catch (e) { /* sans stockage : le choix vaut pour la page */ } }

  const ico = nom => (root.OrlyIcones ? root.OrlyIcones.TRAITS[nom] || '' : '');
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /** Les signes de la légende : [classe, mot, ce qu'il dit, ce qui le montre à l'écran]. Seuls ceux qui sont à l'écran s'affichent. */
  const SIGNES = [
    ['presents', 'présents', 'Sur la ligne d’un service : les personnes présentes, par créneau de 15 min.', '.ch-presents'],
    ['autravail', 'au travail', 'Sur la ligne d’un service : les personnes au travail ; le point marque le pic.', '.ch-travail'],
    ['appui', 'en appui', 'Sur la ligne d’un service, en pointillé : les personnes en appui ou à disposition.', '.ch-appui'],
    ['trait', 'un lot', 'Sur la ligne d’un service : un trait fin par lot, de son début à sa fin ; un lot en retard prend la couleur du retard.', '.pg-trait'],
    ['travail', 'travail', 'Barre pleine : l’équipe prépare.', '.pg-lot .pg-seg'],
    ['attente', 'attend l’amont', 'Bande fine devant la barre : le lot attend le service d’avant.', '.at-pl-attente'],
    ['avant', 'sans travail', 'Bande hachurée : l’équipe est là, sans travail, avant son premier lot. Au survol : sa durée, et ce qu’elle attendait.', '.pg-avant'],
    ['pause', 'pause', 'Un trou dans la barre : une pause prise.', '.pg-lot.troue'],
    ['motif', 'robot, lavage', 'Un motif : le robot, ou le lavage.', '.pg-lot .pg-motif'],
    ['chaine', 'à la chaîne', 'Une encoche : deux étapes faites d’un bloc, à la chaîne.', '.pg-lot.chaine'],
    ['retard', 'en retard', 'Contour et alerte : le lot finit après la limite de sa commande.', '.pg-lot.retard'],
    ['limite', 'prête avant', 'Le petit trait après la barre : la limite de la commande. L’écart, c’est la marge.', '.pg-limite'],
    ['fleche', 'limite plus tard', 'Une flèche au bord droit : la limite de la commande est après la fenêtre affichée. Au survol : son heure.', '.pg-fleche'],
    ['relais', 'relais', 'Un petit triangle à la jointure : à la plonge, le lavage passe d’une équipe à la suivante, sur le même tunnel. Au survol : qui l’a commencé, qui le reprend.', '.pg-relais'],
    ['arrete', 'lavage arrêté', 'Un petit carré au bout de la barre : le lavage s’arrête à la fin de la présence ; le reste se lave le lendemain.', '.pg-arrete'],
    ['maintenant', 'heure rejouée', 'Le trait vertical : l’heure où en est le rejeu.', '.pg-maintenant:not([hidden])']
  ];
  /** La légende : les signes présents à l'écran (pas ceux d'un service replié), sur la ligne des boutons ; elle se replie. */
  function direLegende(box) {
    const p = box.querySelector('.pg-legende'), b = box.querySelector('.pg-legende-bouton'), cadre = box.querySelector('.pg-cadre');
    if (!p || !b || !cadre) return;
    const present = sel => [...cadre.querySelectorAll(sel)].some(e => !e.closest('[hidden]'));
    const signes = SIGNES.filter(x => present(x[3]));
    p.innerHTML = signes.map(([cls, mot, titre]) => `<span class="pg-cle" data-signe="${cls}" title="${esc(titre)}"><i class="pg-ex ${cls}" aria-hidden="true"></i>${esc(mot)}</span>`).join('');
    p.hidden = !etat.legende;
    b.setAttribute('aria-expanded', String(!!etat.legende));
    b.title = (etat.legende ? 'Replier' : 'Déplier') + ' la légende : ' + pluriel(signes.length, 'signe', 'signes') + ' à l’écran';
  }

  /** Une barre : ses morceaux (les pauses prises y font des trous), son attente devant, son étiquette, sa limite. */
  function barre(l, i, a, v) {
    const { x, par, lim, nomSvc } = v, y = 5, h = HAUT_LIGNE - 10;
    if (l.dispo) return `<rect class="at-pl-dispo" x="${(x(l.debut) - 3).toFixed(1)}" y="${y - 1}" width="6" height="${h + 2}" rx="2" data-info="Disponible à partir de ${P().hhmm(l.debut)}"/>`;
    if (l.fin == null) return `<rect class="at-pl-bloque" x="${x(l.debut).toFixed(1)}" y="${y}" width="10" height="${h}" rx="3" data-info="${esc(P().enClair(l.nom))} : ne tourne pas"/>`;
    const motif = a.type === 'robot' || a.type === 'lavage', retard = enRetard(l, par), x0 = x(l.debut), x1 = Math.max(x0 + BARRE_MIN, x(l.fin));
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
    // La limite de la commande : un petit trait, relié au bout de la barre — l'écart, c'est la marge. Après la fenêtre : le
    // trait s'arrête au bord droit, où une flèche dit l'heure de la limite au survol.
    const ym = y + h / 2, bord = v.L - 9;
    const traits = (lim.get(l) || []).map(e => (x(e) > v.L - 1
      ? (bord > x1 ? `<line class="pg-marge" x1="${x1.toFixed(1)}" y1="${ym}" x2="${bord.toFixed(1)}" y2="${ym}"/>` : '')
        + `<path class="pg-fleche" data-limite="${e}" d="M${(v.L - 8).toFixed(1)} ${ym - 4}L${(v.L - 2).toFixed(1)} ${ym}L${(v.L - 8).toFixed(1)} ${ym + 4}" data-info="${esc('Prête avant ' + instant(e) + ' : après la fenêtre affichée')}"/>`
      : `<line class="pg-marge" x1="${Math.min(x1, x(e)).toFixed(1)}" y1="${ym}" x2="${Math.max(x1, x(e)).toFixed(1)}" y2="${ym}"/>`
        + `<line class="pg-limite${e < l.fin ? ' depassee' : ''}" data-limite="${e}" x1="${x(e).toFixed(1)}" y1="${y - 3}" x2="${x(e).toFixed(1)}" y2="${y + h + 3}"/>`)).join('');
    const dit = info(l, a, { parClasse: par, nomService: nomSvc });
    // Le relais (évolution 18) : un petit triangle à la jointure — au bout de la part de l'équipe qui passe le lot, au début
    // de celle qui le reprend ; un petit carré au bout d'un lavage arrêté.
    const R = l.relais, triangle = (xa, sens) => `<path class="pg-relais" data-relais="${sens}" d="M${xa.toFixed(1)} ${ym - 4.5}l5.5 4.5-5.5 4.5z"/>`;
    const reperes = !R ? '' : (R.de ? triangle(x0 - 6.5, 'repris') : '') + (R.vers ? triangle(x1 + 1, 'passe') : '')
      + (R.arrete ? `<rect class="pg-arrete" x="${(x1 + 2).toFixed(1)}" y="${ym - 3.5}" width="7" height="7" rx="1"/>` : '');
    return `<g class="at-pl-lot pg-lot${a.type === 'robot' ? ' robot' : ''}${a.type === 'lavage' ? ' lavage' : ''}${l.fusion ? ' chaine' : ''}${retard ? ' retard' : ''}${morceaux.length > 1 ? ' troue' : ''}${R ? ' en-relais' : ''}" tabindex="0" role="button"
      data-lot="${i}" data-debut="${l.debut}" data-fin="${l.fin}" data-x="${x0.toFixed(2)}" data-x1="${x1.toFixed(2)}"${R ? ` data-part="${R.rang + 1}/${R.n}"` : ''} data-info="${esc(dit)}" aria-label="${esc(dit.replace(/\n/g, ', '))}">${att}${morceaux.map(forme).join('')}${contour}${
      mot ? `<text class="at-pl-etiq" x="${(large[0] + 5).toFixed(1)}" y="${y + 13}">${esc(mot)}</text>` : ''}${traits}${reperes}</g>`;
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

  /** La ligne d'une équipe : son nom entier (au survol s'il est coupé), ses personnes ; ses barres, et la bande d'avant son premier lot. */
  function ligne(a, v, r, service) {
    const fu = (a.lots.find(l => l.fusion) || {}).fusion, pers = E().motsDesPersonnes(a), nom = a.nom + (fu ? ' +' + v.nomSvc(fu) : '');
    const titre = a.nom + ' — ' + pers + (service ? ' — ' + service : '') + (fu ? ' — fait aussi ' + v.nomSvc(fu) + ', à la chaîne' : '');
    const av = v.avant.get(a.id), x0 = av ? Math.max(0, v.x(av.de)) : 0, x1 = av ? Math.min(v.L, v.x(av.a)) : 0;
    const bande = av && x1 - x0 >= 2 ? `<rect class="pg-avant" x="${x0.toFixed(1)}" y="7" width="${(x1 - x0).toFixed(1)}" height="${HAUT_LIGNE - 14}" rx="2" data-de="${av.de}" data-a="${av.a}" data-info="${esc(E().motsDAvant(av))}"/>` : '';
    return `<div class="pg-ligne" data-equipe="${esc(a.id)}" data-service="${esc(a.service)}"><div class="pg-nom" title="${esc(titre)}"><span class="pg-nom-texte">${esc(nom)}</span>${
      service ? `<small class="pg-nom-service">${esc(service)}</small>` : ''}<small class="pg-pers">${esc(pers)}</small></div>
      <svg class="ds-graphique pg-barres" width="${v.L}" height="${HAUT_LIGNE}" style="width:${v.L}px;height:${HAUT_LIGNE}px" viewBox="0 0 ${v.L} ${HAUT_LIGNE}" role="group" aria-label="${esc(a.nom)}">${bande}${
      a.lots.map((l, i) => { const t = lotTenu(l, a, v.nomEquipe); return t ? barre(t, r.lots.indexOf(l) >= 0 ? r.lots.indexOf(l) : 'x' + i, a, v) : ''; }).join('')}</svg></div>`;
  }

  /**
   * Sur la ligne d'un service : sa courbe de charge, la même que sur la page de la charge (charge-vue.js : présents, au
   * travail, le pic marqué, la bulle de chaque créneau), sans la file ; et, dessous, un trait fin par lot.
   */
  function courbe(g, v) {
    const C = root.OrlyChargeVue, H = HAUT_GROUPE, EN = E();
    const lus = v.k && C && C.mini ? v.k.services.filter(s => s.service === g.service && (v.jour == null || s.jour === v.jour) && (s.creneaux.presents || s.creneaux.auTravail)) : [];
    const m = lus.length ? C.mini({ id: g.service, nom: g.nom, c: C.creneauxDuService(lus) }, { t0: v.t0, t1: v.t1, pxm: v.pxh / 60, haut: H, sansFile: true }, v.k.pas) : null;
    // Un trait fin par lot, sous la courbe : sur deux rangs, pour que deux lots qui se suivent se distinguent.
    let n = 0;
    // Chaque équipe pour ses lots tels qu'elle les a tenus : d'un lavage en relais, sa part (évolution 18).
    const traits = g.equipes.map(a => EN.lotsDe(a).map(l => {
      const x0 = v.x(l.debut), x1 = Math.max(x0 + BARRE_MIN, v.x(l.fin == null ? l.debut : l.fin)), yt = H - 5 + (n++ % 2) * 3;
      return x1 < 0 || x0 > v.L ? '' : `<line class="pg-trait${enRetard(l, v.par) ? ' retard' : ''}" x1="${x0.toFixed(1)}" y1="${yt}" x2="${x1.toFixed(1)}" y2="${yt}"/>`;
    }).join('')).join('');
    return `<div class="pg-courbe" style="width:${v.L}px">${m ? m.html : ''}<svg class="pg-traits" width="${v.L}" height="${H}" style="width:${v.L}px;height:${H}px" viewBox="0 0 ${v.L} ${H}" aria-hidden="true">${traits}</svg></div>`;
  }

  /** Les résumés d'un service (un par jour de travail affiché), et leur phrase entière. */
  function resumesDe(g, v) {
    const EN = E(), jours = v.jour == null ? [...new Set(g.equipes.map(EN.jourDeLEquipe))].sort((a, b) => a - b) : [v.jour];
    const liste = jours.map(j => EN.resume(v.k, v.rep, g.service, j)).filter(Boolean);
    // Le jour se dit quand ce n'est pas le jour affiché ; pour toute la chaîne : hors du jour des vols, ou si le service a deux jours.
    const affiche = v.jour == null ? (liste.length > 1 ? null : 0) : v.jour;
    return { liste, phrase: liste.map(x => EN.phraseDuResume(x, affiche)).join('\n'),
      principal: liste.reduce((m, x) => (!m || (x.pic || 0) > (m.pic || 0) ? x : m), null) };
  }

  /** Un service : sa ligne de 32 px (repliée à l'ouverture), puis, déplié, son résumé en entier et ses équipes. */
  function groupe(g, n, v, r) {
    const deplie = etat.deplies.has(g.service), R = resumesDe(g, v), pic = E().motsDuPic(R.principal);
    const titre = g.nom + ' — ' + pluriel(g.equipes.length, 'équipe', 'équipes') + (R.phrase ? '\n' + R.phrase : '');
    return `<section class="pg-groupe${deplie ? '' : ' replie'}" data-service="${esc(g.service)}" data-lots="${g.lots}">
      <div class="pg-groupe-tete"><div class="pg-groupe-nom" title="${esc(titre)}"><button type="button" class="pg-replier" aria-expanded="${deplie}" aria-controls="pg-lignes-${n}">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ico('bas')}</svg><span class="pg-service">${esc(g.nom)}</span><span class="pg-compte">${g.equipes.length}</span></button>
        <span class="pg-pic" aria-label="Pic au travail, sur les présents">${esc(pic)}</span></div>${courbe(g, v)}</div>
      <div class="pg-lignes" id="pg-lignes-${n}"${deplie ? '' : ' hidden'}>${R.phrase ? `<div class="pg-detail"><p class="pg-detail-texte">${esc(R.phrase).replace(/\n/g, '<br>')}</p></div>` : ''}${
        g.equipes.map(a => ligne(a, v, r)).join('')}</div></section>`;
  }

  /** Les équipes sans lot le jour affiché (services entiers compris), en bas, sous une ligne repliée « Sans lot ce jour (n) ». */
  function sansLot(liste, n, v, r) {
    const cle = E().SANS_LOT, deplie = etat.deplies.has(cle), mot = (v.jour == null ? 'Sans lot' : 'Sans lot ce jour') + ' (' + liste.length + ')';
    const services = [...new Set(liste.map(x => x.nom))];
    const titre = pluriel(liste.length, 'équipe', 'équipes') + ' sans lot' + (v.jour == null ? '' : ' ce jour') + ' : ' + services.join(', ') + '.';
    return `<section class="pg-groupe pg-sans-lot${deplie ? '' : ' replie'}" data-service="${esc(cle)}" data-lots="0">
      <div class="pg-groupe-tete"><div class="pg-groupe-nom" title="${esc(titre)}"><button type="button" class="pg-replier" aria-expanded="${deplie}" aria-controls="pg-lignes-${n}">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ico('bas')}</svg><span class="pg-service">${esc(mot)}</span></button></div><div class="pg-sans-courbe" style="width:${v.L}px"></div></div>
      <div class="pg-lignes" id="pg-lignes-${n}"${deplie ? '' : ' hidden'}>${liste.map(x => ligne(x.equipe, v, r, x.nom)).join('')}</div></section>`;
  }

  /** Le planning entier, à l'échelle `pxh` (pixels par heure). */
  function toile(o, v) {
    const r = o.resultat, R = reperes(v.t0, v.t1, v.pxh);
    const corps = v.lignes.services.map((g, n) => groupe(g, n, v, r)).join('') + (v.lignes.sansLot.length ? sansLot(v.lignes.sansLot, v.lignes.services.length, v, r) : '');
    const minuits = R.jours.filter(j => j.de === j.j * JOUR && j.de > v.t0).map(j => `<i class="pg-minuit" style="left:${(v.noms + v.x(j.de)).toFixed(1)}px"></i>`).join('');
    return `<div class="pg-toile" style="width:${v.noms + v.L}px;--pg-noms:${v.noms}px;--pg-pas:${(R.pas / 60 * v.pxh).toFixed(2)}px;--pg-decalage:${v.x(Math.ceil(v.t0 / R.pas) * R.pas).toFixed(2)}px">
      <svg class="pg-defs" width="0" height="0" aria-hidden="true"><defs><pattern id="pg-motif" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6"/></pattern>
        <pattern id="pg-hachure" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5"/></pattern></defs></svg>
      <div class="pg-axe"><div class="pg-coin"><span class="pg-coin-mot">Équipes</span><span class="pg-periode" role="status" aria-label="La période visible"></span></div>${axe(v)}<span class="pg-maintenant-heure" hidden></span></div>
      ${corps}${minuits}<i class="pg-maintenant" hidden></i></div>`;
  }

  /** Les indicateurs et les réponses de la journée : ceux que la page a déjà lus (`o.journee`), sinon calculés une fois par résultat. */
  function journeeDe(o) {
    const r = o.resultat, donnee = typeof o.journee === 'function' ? o.journee() : o.journee;
    if (donnee && donnee.r === r && donnee.k) return donnee;
    if (etat.lu && etat.lu.r === r) return etat.lu;
    const k = IND() ? IND().journee(r, o.args || {}) : null;
    return (etat.lu = { r, k, reponses: k && REP() ? REP().reponses(r, o.args || {}, { k }) : null });
  }

  /** La largeur de la colonne des noms pour ce résultat : celle du nom le plus long (services et équipes), jusqu'à 260 px. */
  function largeurDesNoms(r, nomSvc) {
    const DS = root.OrlyDS, mesurer = (t, taille) => (DS && DS.largeurTexte ? DS.largeurTexte(t, taille) : String(t).length * taille * 0.55), EN = E();
    const services = [...new Set(r.ateliers.map(a => a.service))];
    // Un service : le chevron, le nom (en gras), la pastille, « pic / présents ». Une équipe : le retrait, le nom, « n pers. ».
    return EN.largeurDesNoms([
      ...services.map(s => ({ texte: nomSvc(s), taille: 13.8, marge: 118 })),
      ...r.ateliers.map(a => ({ texte: a.nom, taille: 13, marge: 44 + Math.ceil(mesurer(EN.motsDesPersonnes(a), 12)) })),
      { texte: 'Sans lot ce jour (' + r.ateliers.length + ')', taille: 13.8, marge: 40 }], mesurer);
  }

  /** La vue courante : le jour affiché, l'échelle, la largeur, la position des heures, les lignes. */
  function vueDe(box, o) {
    const r = o.resultat, cadre = box.querySelector('.pg-cadre'), EN = E();
    const nomSvc = id => ((o.nomService ? o.nomService(id) : id) || id);
    // « Toute la chaîne » : tous les jours, de la première à la dernière minute ; sinon le cadre du jour affiché.
    const jour = etat.zoom === 'chaine' ? null : etat.jour, b = (jour == null ? null : EN.cadreDuJour(r, jour)) || bornes(r);
    const noms = largeurDesNoms(r, nomSvc), largeur = Math.max(120, (cadre ? cadre.clientWidth : 0) - noms - 2), pxh = pxParHeure(etat.zoom, largeur, b.t0, b.t1);
    const x = t => (t - b.t0) / 60 * pxh, j = journeeDe(o);
    const nomsEquipes = new Map(r.ateliers.map(a => [a.id, a.nom]));
    return { jour, t0: b.t0, t1: b.t1, pxh, largeur, noms, L: Math.ceil((b.t1 - b.t0) / 60 * pxh - 0.01), x, par: r.parClasse || {}, lim: limites(r), nomSvc, k: j.k, rep: j.reponses,
      nomEquipe: id => nomsEquipes.get(id) || id,
      lignes: EN.lignes(r, jour, ordreDesServices(r, (o.args || {}).parcours), nomSvc), avant: EN.avantLePremierLot(r, j.reponses) };
  }

  function direPeriode(box) {
    const v = etat.vue, cadre = box.querySelector('.pg-cadre'), p = box.querySelector('.pg-periode');
    // Caché (une autre page), le cadre n'a pas de largeur : l'heure à gauche reste celle d'avant.
    if (!v || !cadre || !p || !(cadre.clientWidth > 0)) return;
    const vis = visible({ t0: v.t0, pxh: v.pxh, gauche: cadre.scrollLeft, largeur: Math.max(0, cadre.clientWidth - v.noms) });
    const de = Math.max(v.t0, vis.de), a = Math.min(v.t1, vis.a);
    p.textContent = periode(Math.round(de), Math.round(a));
    p.title = 'La période visible : ' + p.textContent;
    p.dataset.de = Math.round(de); p.dataset.a = Math.round(a);
    etat.gauche = de;
    // Le nom du jour reste à la vue tant qu'on est dans ce jour : il suit le bord gauche, sans sortir de son jour.
    for (const g of box.querySelectorAll('.pg-jour')) {
      const r = g.querySelector('rect'), t = g.querySelector('text'), x0 = +r.getAttribute('x'), w = +r.getAttribute('width');
      t.setAttribute('x', Math.max(x0 + 6, Math.min(x0 + w - 34, cadre.scrollLeft + 6)).toFixed(1));
    }
  }

  /** Le cadre prend la hauteur qui reste dans la fenêtre, sous les boutons : il défile seul, l'axe toujours visible. */
  function ajusterHauteur(box) {
    const cadre = box.querySelector('.pg-cadre');
    if (!cadre || !(cadre.clientWidth > 0)) return;
    // La place du cadre quand la page n'a pas défilé : son haut à l'écran, plus ce que ses parents ont défilé.
    let haut = cadre.getBoundingClientRect().top + (root.scrollY || 0);
    if (!etat.plein) for (let p = cadre.parentElement; p; p = p.parentElement) haut += p.scrollTop || 0;
    cadre.style.height = cadre.style.maxHeight = Math.max(260, Math.floor(root.innerHeight - haut - 12)) + 'px';
    cadre.style.setProperty('--pg-vue', Math.max(0, cadre.clientWidth - 2) + 'px');
  }

  /** L'état des boutons : le zoom, le jour affiché (aucun pour « Toute la chaîne »), le plein écran. */
  function direBoutons(box) {
    for (const b of box.querySelectorAll('[data-pg-zoom]')) b.setAttribute('aria-pressed', String(b.dataset.pgZoom === etat.zoom));
    for (const b of box.querySelectorAll('[data-pg-jour]')) b.setAttribute('aria-pressed', String(etat.zoom !== 'chaine' && +b.dataset.pgJour === etat.jour));
    const plein = box.querySelector('[data-pg-plein]');
    if (plein) { plein.setAttribute('aria-pressed', String(!!etat.plein)); plein.title = etat.plein ? 'Échap : quitter le plein écran' : 'Le planning sur tout l’écran, sans le menu ni l’en-tête ; Échap en sort'; }
  }

  /** Redessine la toile à l'échelle courante ; `ancre` : { t, px } garde cette heure à ce pixel de la zone visible. */
  function tracer(box, o, ancre) {
    const cadre = box.querySelector('.pg-cadre'); if (!cadre) return;
    const v = etat.vue = vueDe(box, o);
    cadre.innerHTML = toile(o, v);
    direBoutons(box);
    const t = ancre ? ancre.t : etat.gauche != null ? etat.gauche : v.t0;
    cadre.scrollLeft = Math.max(0, v.x(t) - (ancre ? ancre.px : 0));
    appliquerChoix(box);
    direPeriode(box);
    maintenant();
    appliquerVise(box);
    direLegende(box);
    ajusterHauteur(box);
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

  /** Déplier ou replier un groupe (un service, ou « Sans lot ce jour ») : la page s'en souvient. */
  function plier(box, g, deplie) {
    const b = g.querySelector('.pg-replier'), lignes = g.querySelector('.pg-lignes');
    g.classList.toggle('replie', !deplie);
    if (b) b.setAttribute('aria-expanded', String(deplie));
    if (lignes) lignes.hidden = !deplie;
    if (deplie) etat.deplies.add(g.dataset.service); else etat.deplies.delete(g.dataset.service);
  }
  function apresPli(box) { retenirDeplies(); maintenant(); direLegende(box); }

  /** Le plein écran : le planning recouvre le menu et l'en-tête ; Échap en sort. */
  function pleinEcran(box, oui) {
    etat.plein = !!oui;
    box.classList.toggle('pg-plein', etat.plein);
    direBoutons(box);
    // La largeur change : « Un jour » et « Toute la chaîne » se redessinent dans la nouvelle largeur.
    if (etat.o && etat.vue) tracer(box, etat.o); else ajusterHauteur(box);
  }

  /** Les gestes : les jours, les zooms (boutons, Ctrl + molette), déplier, glisser, choisir une commande, le plein écran, Échap. Une fois par boîte. */
  function brancher(box) {
    if (box.__pg) return;
    box.__pg = true;
    const cadreDe = () => box.querySelector('.pg-cadre');
    const zoomer = (zoom, ancre) => { if (zoom === etat.zoom) return; const chaine = zoom === 'chaine' || etat.zoom === 'chaine'; etat.zoom = zoom; if (chaine) etat.gauche = null; tracer(box, etat.o, chaine ? null : ancre); };
    box.addEventListener('click', e => {
      const z = e.target.closest('[data-pg-zoom]');
      if (z) { const c = cadreDe(), v = etat.vue; zoomer(z.dataset.pgZoom, v && c ? { t: v.t0 + (c.scrollLeft + (c.clientWidth - v.noms) / 2) / v.pxh * 60, px: (c.clientWidth - v.noms) / 2 } : null); return; }
      // Un onglet de jour : ce jour de travail, dans son cadre ; depuis « Toute la chaîne », on passe à « Un jour ».
      const j = e.target.closest('[data-pg-jour]');
      if (j) { etat.jour = +j.dataset.pgJour; if (etat.zoom === 'chaine') etat.zoom = 'jour'; etat.gauche = null; tracer(box, etat.o); return; }
      const tout = e.target.closest('[data-pg-tout]');
      if (tout) { for (const g of box.querySelectorAll('.pg-groupe')) plier(box, g, tout.dataset.pgTout === 'deplier'); if (tout.dataset.pgTout !== 'deplier') etat.deplies.clear(); apresPli(box); return; }
      if (e.target.closest('.pg-legende-bouton')) { etat.legende = !etat.legende; direLegende(box); ajusterHauteur(box); return; }
      if (e.target.closest('[data-pg-plein]')) { pleinEcran(box, !etat.plein); return; }
      if (box.__glisse) { box.__glisse = false; return; }
      // Un clic sur la ligne d'un service (son nom ou sa courbe) le déplie, ou le replie.
      const tete = e.target.closest('.pg-groupe-tete');
      if (tete) { const g = tete.closest('.pg-groupe'); plier(box, g, g.classList.contains('replie')); apresPli(box); return; }
      const lot = e.target.closest('.pg-lot'), r = etat.o && etat.o.resultat;
      if (lot && r && r.lots[+lot.dataset.lot]) { etat.choix = commandeDe(r.lots[+lot.dataset.lot]); if (!etat.choix.length) etat.choix = null; appliquerChoix(box); }
      else if (e.target.closest('.pg-cadre') && etat.choix) { etat.choix = null; appliquerChoix(box); }
    });
    box.addEventListener('keydown', e => {
      // En plein écran, Échap en sort (l'écoute du document) ; sinon elle annule la commande choisie.
      if (e.key === 'Escape' && etat.choix && !etat.plein) { etat.choix = null; appliquerChoix(box); return; }
      const lot = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.pg-lot');
      if (lot) { e.preventDefault(); lot.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
    // Échap sort du plein écran, où que soit le focus — tant que le planning est à l'écran (une boîte fixe n'a pas de parent de position).
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && etat.plein && box.getClientRects().length) { e.preventDefault(); pleinEcran(box, false); } });
    box.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('.pg-lot'); bulleAuFocus(g && g.matches(':focus-visible') ? g : null); });
    box.addEventListener('focusout', () => bulleAuFocus(null));
    // Ctrl + molette : le zoom d'à côté, l'heure sous le pointeur reste à sa place.
    box.addEventListener('wheel', e => {
      const c = e.target.closest && e.target.closest('.pg-cadre'), v = etat.vue;
      if (!c || !e.ctrlKey || !v) return;
      e.preventDefault();
      const px = Math.max(0, e.clientX - c.getBoundingClientRect().left - v.noms);
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
    root.addEventListener('resize', () => ajusterHauteur(box));
    if (typeof ResizeObserver === 'function') {
      let largeur = 0;
      new ResizeObserver(() => {
        const c = cadreDe(); if (!c || !etat.o || !etat.vue) return;
        if (c.clientWidth === largeur) { ajusterHauteur(box); return; }
        const montre = !largeur && c.clientWidth > 0;
        largeur = c.clientWidth;
        // Montré après avoir été dessiné caché, ou une échelle qui remplit la largeur (« Un jour », « Toute la chaîne ») : on redessine.
        if (c.clientWidth > 0 && (montre || etat.zoom !== 'six')) tracer(box, etat.o); else { direPeriode(box); ajusterHauteur(box); }
      }).observe(box);
    }
  }

  /**
   * Le planning dans `box`. `o` : { resultat, args, nomService(id), journee } — `journee` : les indicateurs et les réponses que
   * la page a déjà lus ({ r, k, reponses }, ou une fonction qui les rend). Sans lot, une phrase.
   */
  function rendre(box, o) {
    if (!box) return;
    const r = o.resultat, jours = r && r.ok ? E().joursAvecLots(r) : [];
    etat.o = o;
    if (!r || !r.ok || !(r.lots || []).length || !bornes(r) || !jours.length) {
      etat.vue = null;
      box.classList.remove('pg', 'pg-plein');
      box.innerHTML = '<p class="mini-note">Le planning apparaîtra dès qu’une équipe aura quelque chose à fabriquer.</p>';
      return;
    }
    box.classList.add('pg');
    box.classList.toggle('pg-plein', !!etat.plein);
    relire();
    // Une autre journée (un autre programme, un autre jour) : le planning revient au jour qui a le plus de lots.
    const b = bornes(r), cle = b.t0 + '|' + b.t1 + '|' + jours.map(x => x.jour + ':' + x.lots).join(',');
    if (etat.cle !== cle) { etat.cle = cle; etat.gauche = null; etat.jour = E().jourAOuvrir(r); }
    if (!jours.some(x => x.jour === etat.jour)) { etat.jour = E().jourAOuvrir(r); etat.gauche = null; }
    // Un service visé depuis la Synthèse, pas encore montré : son jour de travail.
    if (etat.vise && etat.amener) { const j = jourDuVise(r); if (j !== etat.jour) { etat.jour = j; etat.gauche = null; } }
    // Une commande choisie qui n'existe plus ne reste pas en évidence.
    if (etat.choix && !r.lots.some(l => porte(l, etat.choix))) etat.choix = null;
    const mot = E().motDuJour, onglet = x => `<button type="button" class="btn btn-sm pg-onglet" data-pg-jour="${x.jour}" aria-pressed="false" title="${esc(mot(x.jour) + ' : ' + pluriel(x.equipes, 'équipe y travaille', 'équipes y travaillent') + ', ' + pluriel(x.lots, 'lot', 'lots'))}">${
      esc(mot(x.jour))}<span class="pg-compte">${x.equipes}</span></button>`;
    box.innerHTML = `<div class="pg-barre">
      <div class="pg-jours" role="group" aria-label="Le jour de travail affiché">${jours.map(onglet).join('')}</div>
      <div class="pg-zooms" role="group" aria-label="Le zoom du planning" title="Ctrl + molette : zoomer · glisser : se déplacer · un clic sur une barre : sa commande">${ZOOMS.map(z =>
      `<button type="button" class="btn btn-sm" data-pg-zoom="${z.id}" aria-pressed="${z.id === etat.zoom}">${esc(z.nom)}</button>`).join('')}</div>
      <div class="pg-plis" role="group" aria-label="Les services"><button type="button" class="btn btn-sm" data-pg-tout="deplier">Tout déplier</button><button type="button" class="btn btn-sm" data-pg-tout="replier">Tout replier</button></div>
      <div class="pg-legende-bloc"><button type="button" class="btn btn-sm pg-legende-bouton" aria-expanded="true" aria-controls="pg-legende"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ico('bas')}</svg>Légende</button>
        <p class="pg-legende" id="pg-legende" aria-label="Ce que disent les signes à l’écran"></p></div>
      <button type="button" class="btn btn-sm pg-plein-bouton" data-pg-plein aria-pressed="false">Plein écran</button></div>
      <div class="pg-cadre" tabindex="0" role="region" aria-label="La journée des équipes"></div>`;
    brancher(box);
    tracer(box, o);
  }

  /**
   * Le jour à afficher pour le service visé : celui qu'on demande s'il y a des lots ; sinon le jour affiché s'il y en a ;
   * sinon le jour des vols, ou son premier jour. Un service sans lot ne change pas de jour.
   */
  function jourDuVise(r) {
    const EN = E(), sesJours = [...new Set(r.ateliers.filter(a => a.service === etat.vise && EN.lotsDe(a).length).map(EN.jourDeLEquipe))].sort((a, b) => a - b);
    if (!sesJours.length) return etat.jour;
    return etat.viseJour != null && sesJours.includes(etat.viseJour) ? etat.viseJour : sesJours.includes(etat.jour) ? etat.jour : sesJours.includes(0) ? 0 : sesJours[0];
  }
  /**
   * Montrer un service (un clic dans la Synthèse, évolution 15 b) : son jour de travail affiché (`jour`, sinon un jour où il a
   * des lots), déplié, amené à la vue une fois, marqué ; son bouton reçoit le focus. Un service sans lot : la ligne « Sans
   * lot ce jour », dépliée. Appliqué après la navigation vers la page, et à chaque tracé tant qu'il reste visé.
   */
  function viser(service, jour) {
    etat.vise = service == null || service === '' ? null : String(service);
    etat.viseJour = etat.vise && jour != null && jour !== '' && Number.isFinite(+jour) ? +jour : null;
    etat.amener = !!etat.vise;
    const r = etat.o && etat.o.resultat;
    if (etat.vise) {
      relire();
      etat.deplies.add(etat.vise);
      retenirDeplies();
      if (r && r.ok) { const j = jourDuVise(r); if (j !== etat.jour) { etat.jour = j; etat.gauche = null; } }
    }
    if (typeof document !== 'undefined') setTimeout(() => {
      const box = document.getElementById('at-planning');
      if (box && etat.o && etat.vue && etat.vue.jour != null && etat.vue.jour !== etat.jour && box.querySelector('.pg-cadre')) tracer(box, etat.o); else appliquerVise(box);
    }, 0);
  }
  function appliquerVise(box) {
    if (!box) return;
    for (const g of box.querySelectorAll('.pg-groupe.pg-vise')) g.classList.remove('pg-vise');
    if (!etat.vise) return;
    // La ligne du service ; sans lot, la ligne « Sans lot ce jour » qui porte ses équipes.
    const groupes = [...box.querySelectorAll('.pg-groupe')];
    const g = groupes.find(x => x.dataset.service === etat.vise) || groupes.find(x => x.classList.contains('pg-sans-lot') && [...x.querySelectorAll('.pg-ligne')].some(l => l.dataset.service === etat.vise));
    if (!g) return;
    const b = g.querySelector('.pg-replier');
    if (g.classList.contains('replie')) { plier(box, g, true); retenirDeplies(); direLegende(box); }
    g.classList.add('pg-vise');
    if (!etat.amener || !g.getClientRects().length) return;
    etat.amener = false;
    g.scrollIntoView({ block: 'nearest' });
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
    const dedans = heure != null && heure >= v.t0 && heure <= v.t1, change = trait.hidden === dedans;
    trait.hidden = mot.hidden = !dedans;
    if (change) direLegende(box);
    if (!dedans) { for (const h of box.querySelectorAll('.pg-sous-maintenant')) h.classList.remove('pg-sous-maintenant'); return; }
    const gauche = v.noms + v.x(heure);
    trait.style.left = gauche.toFixed(1) + 'px'; mot.style.left = gauche.toFixed(1) + 'px';
    mot.textContent = P().hhmm(heure); mot.dataset.t = heure;
    // L'heure de l'axe que l'étiquette du trait recouvre s'efface : on lit l'une ou l'autre, pas les deux mêlées.
    const x = v.x(heure);
    for (const h of box.querySelectorAll('.pg-axe-svg .at-pl-heure')) {
      const hx = +h.getAttribute('x');
      h.classList.toggle('pg-sous-maintenant', hx < x + 26 && hx + 36 > x - 26);
    }
  }

  const api = { ZOOMS, PX_HEURE, HAUT_LIGNE, HAUT_GROUPE, BARRE_MIN, pxParHeure, zoomVoisin, bornes, ordreDesServices, segments, limites, enRetard,
    marge, info, lotTenu, motsDuRelais, periode, visible, reperes, commandeDe, porte, rendre, maintenant, viser, etat };
  if (enNode) module.exports = api;
  else root.OrlyPlanningVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
