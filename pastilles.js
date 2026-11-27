/* ==========================================================================
 *  LA COMPAGNIE ET LA CLASSE : UNE PASTILLE ET UNE ÉTIQUETTE (évolution 25 d)
 *
 *  Chargé par la version 1 seule. Les pages écrivent le nom d'une compagnie
 *  ou d'une commande comme avant ; ce module l'habille, là où ce nom se lit
 *  seul (la tête d'une rangée, une liste, une légende, le titre d'une fiche) :
 *    - la compagnie : une pastille pleine, à sa couleur. Un nom de quatre
 *      caractères au plus tient dedans ; un nom plus long y laisse ses deux
 *      premières lettres, et suit en entier ;
 *    - la classe : une étiquette arrondie, avec le point de sa couleur.
 *  Le texte de la page ne change pas : les nœuds de texte sont enveloppés,
 *  jamais réécrits ; les deux lettres et le point sont des pseudo-éléments.
 *
 *  La couleur d'une compagnie est un rang, de 1 à 12 : la feuille (visuel.css)
 *  seule connaît les teintes, une par thème. Sans choix, les compagnies de
 *  l'unité, rangées par ordre alphabétique, prennent les douze couleurs dans
 *  l'ordre, puis recommencent : rien n'est écrit. Un choix se garde dans une
 *  entrée à part (« ory-couleurs-compagnies-v1 »), que le calcul ne lit pas.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';

  /** Douze couleurs au choix. */
  const NOMBRE = 12;
  const CLE = 'ory-couleurs-compagnies-v1', SCHEMA = 'ory-couleurs-compagnies', VERSION = 1, PREFIXE = 'couleurs des compagnies';
  /** « Les autres compagnies », dans un réglage par compagnie : pas une compagnie. */
  const TOUTES = '*';
  /** Les réglages d'une équipe qui se donnent par compagnie (moteur/production.js, `parCompagnie`). */
  const PAR_COMPAGNIE = ['escale', 'quaiDepart', 'quaiRetour', 'quaiParVol', 'dechargement'];
  /** Au-delà, la pastille ne porte plus le nom : ses deux premières lettres. */
  const LONGUEUR_PASTILLE = 4;
  /** Ce qui suit une compagnie sans être une classe (« 6 classes », le nom d'un service) : court, et pas une phrase. */
  const SUITE_MAX = 40, PHRASE = /[,;:.!?…+]/;
  /** La flèche d'un bouton qui mène ailleurs, à la fin d'un nom. */
  const FLECHE = / [→↺]$/u;

  /** Le nom sous lequel une compagnie se reconnaît, comme dans le calcul : sans espaces autour, en capitales. */
  const cle = nom => String(nom ?? '').trim().toUpperCase();
  const collateur = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  /** L'ordre alphabétique, le même partout : un accent se range à sa lettre ; à égalité, l'ordre des caractères. */
  const ordre = (a, b) => collateur.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  const estRang = n => Number.isInteger(n) && n >= 1 && n <= NOMBRE;

  /** La compagnie d'une commande (« NORD/BC », « NORD/@ARM ») : ce qui précède sa dernière barre. */
  function compagnieDe(id) {
    const t = String(id ?? ''), i = t.lastIndexOf('/');
    return i > 0 ? t.slice(0, i) : '';
  }

  /** Les compagnies qu'une équipe nomme : ses commandes, les compagnies qu'elle sert, ses réglages par compagnie. */
  function compagniesDeLEquipe(a, noter) {
    for (const lot of a.lots || []) for (const id of [].concat(lot)) noter(compagnieDe(id));
    for (const c of Array.isArray(a.compagnies) ? a.compagnies : []) noter(c);
    for (const champ of PAR_COMPAGNIE) for (const c of Object.keys((a[champ] && typeof a[champ] === 'object' && a[champ]) || {})) noter(c);
  }

  /**
   * Les compagnies de l'unité : celles du programme chargé et celles des réglages, rangées par ordre alphabétique.
   * @param {{vols?:object[], classes?:object[], etat?:object, bareme?:object}} sources
   *   vols : le programme chargé ; classes : les commandes de la journée ; etat : les équipes (commandes ajoutées,
   *   retirées, préparées, réglages par compagnie, services par compagnie) ; bareme : les temps par vol.
   * @returns {string[]} les noms, en capitales, chacun une fois
   */
  function compagnies(sources) {
    const s = sources || {}, etat = s.etat || {}, vues = new Set();
    const noter = nom => { const k = cle(nom); if (k && k !== TOUTES) vues.add(k); };
    for (const v of s.vols || []) noter(v && v.cie);
    for (const c of s.classes || []) noter(c && c.cie);
    // La liste des compagnies (évolution 26) : une compagnie y existe même sans vol ni réglage.
    for (const c of Array.isArray(etat.compagnies) ? etat.compagnies : []) noter(c && c.nom);
    for (const c of etat.ajoutees || []) noter(c && c.cie);
    for (const id of etat.exclues || []) noter(compagnieDe(id));
    for (const a of etat.ateliers || []) compagniesDeLEquipe(a || {}, noter);
    for (const liste of Object.values(etat.categories || {})) for (const k of liste || []) Object.keys((k && k.minutes) || {}).forEach(noter);
    for (const temps of Object.values(s.bareme || {})) for (const id of Object.keys(temps || {})) noter(compagnieDe(id));
    return [...vues].sort(ordre);
  }

  /**
   * Le rang de couleur de chaque compagnie : son choix, sinon sa place dans l'ordre alphabétique (les douze couleurs dans
   * l'ordre, puis elles recommencent).
   * @returns {Map<string, number>} le nom (en capitales) → un rang de 1 à 12
   */
  function rangs(noms, choix) {
    const tries = [...new Set((noms || []).map(cle).filter(Boolean))].sort(ordre), c = choix || {};
    return new Map(tries.map((nom, i) => [nom, estRang(c[nom]) ? c[nom] : (i % NOMBRE) + 1]));
  }

  /** Un choix de plus : la compagnie prend ce rang. Rend des choix neufs ; refuse un rang hors de 1 à 12. */
  function choisir(choix, nom, rang) {
    const k = cle(nom);
    if (!k || k === TOUTES) throw new Error(PREFIXE + ' : une compagnie sans nom.');
    if (!estRang(rang)) throw new Error(PREFIXE + ' : la couleur de ' + k + ' se choisit de 1 à ' + NOMBRE + '.');
    return { ...choix, [k]: rang };
  }

  /** « Garder ces couleurs » : chaque compagnie de l'unité reçoit sa couleur du moment ; les autres choix restent. */
  function garder(noms, choix) {
    return { ...Object.fromEntries(rangs(noms, choix)), ...choix };
  }

  /** Les deux premières lettres d'un nom trop long pour sa pastille, en capitales ; vide si le nom y tient. */
  function court(nom) {
    const t = String(nom ?? '').trim();
    if ([...t].length <= LONGUEUR_PASTILLE) return '';
    return (t.match(/[\p{L}\p{N}]/gu) || []).slice(0, 2).join('').toLocaleUpperCase('fr');
  }

  /**
   * Ce que la page sait nommer : les compagnies de l'unité, et ses classes telles qu'elle les écrit.
   * @param {string[]} noms  les compagnies
   * @param {{cabine:string, nom:string}[]} classes  chaque classe : son code (« BC ») et son nom (« Business »)
   */
  function connu(noms, classes) {
    const parNom = new Map(), codes = new Set();
    for (const c of classes || []) { if (!c || !c.cabine) continue; codes.add(String(c.cabine)); if (c.nom) parNom.set(String(c.nom), String(c.cabine)); }
    return { cies: new Set((noms || []).map(cle).filter(Boolean)), parNom, codes };
  }

  const partCie = texte => ({ genre: 'cie', texte, cle: cle(texte) });
  const partClasse = (texte, cabine) => ({ genre: 'classe', texte, cabine });
  /** La cabine d'une classe écrite par son nom ou par son code, ou null. */
  const cabineDe = (texte, k) => k.parNom.get(texte) || (k.codes.has(texte) ? texte : null);

  /** « NORD · Business », « NORD · 6 classes » : la compagnie, puis sa classe ou un court texte. */
  function lireAvecPoint(coeur, k) {
    const i = coeur.indexOf(' · ');
    if (i <= 0 || !k.cies.has(cle(coeur.slice(0, i)))) return null;
    const cie = partCie(coeur.slice(0, i)), suite = coeur.slice(i + 3), cabine = cabineDe(suite, k);
    if (cabine) return [cie, { genre: 'lien', texte: ' · ' }, partClasse(suite, cabine)];
    if (!suite || suite.length > SUITE_MAX || PHRASE.test(suite) || suite.includes(' · ')) return null;
    return [cie, { genre: 'texte', texte: ' · ' + suite }];
  }

  /** « NORD BC », « NORD/SPML » : la compagnie, puis le code de la classe. */
  function lireAvecCode(coeur, k) {
    const i = Math.max(coeur.lastIndexOf(' '), coeur.lastIndexOf('/'));
    if (i <= 0) return null;
    const nom = coeur.slice(0, i), code = coeur.slice(i + 1);
    if (!k.cies.has(cle(nom)) || nom !== nom.trim() || !k.codes.has(code)) return null;
    return [partCie(nom), { genre: 'lien', texte: coeur[i] }, partClasse(code, code)];
  }

  /**
   * Un texte qui, à lui seul, nomme une compagnie ou une commande, découpé sans perdre un caractère : la compagnie
   * (`cie`), ce qui la lie à sa classe (`lien`), la classe (`classe`), et le reste (`texte`). Null pour tout autre texte :
   * une phrase, une énumération, une compagnie que l'unité n'a pas.
   * @param {string} texte
   * @param {{cies:Set<string>, parNom:Map<string,string>, codes:Set<string>}} k  ce que la page sait nommer (`connu`)
   * @param {{classeSeule?:boolean}} [options]  le nom d'une classe, seul, nomme une commande (sous sa compagnie)
   */
  function lire(texte, k, options) {
    const brut = String(texte ?? ''), plein = brut.trim();
    if (!plein || !k) return null;
    // La flèche d'un lien (« → », « ↺ ») suit le nom sans en faire partie.
    const coeur = plein.replace(FLECHE, '');
    const seule = options && options.classeSeule && k.parNom.has(coeur) ? [partClasse(coeur, k.parNom.get(coeur))] : null;
    const parts = k.cies.has(cle(coeur)) ? [partCie(coeur)] : seule || lireAvecPoint(coeur, k) || lireAvecCode(coeur, k);
    if (!parts) return null;
    const debut = brut.indexOf(plein), avant = brut.slice(0, debut), apres = brut.slice(debut + coeur.length);
    return [...(avant ? [{ genre: 'texte', texte: avant }] : []), ...parts, ...(apres ? [{ genre: 'texte', texte: apres }] : [])];
  }

  /** Les choix à garder, validés, dans leur enveloppe (un schéma, une version) ; les compagnies par ordre alphabétique. */
  function enveloppe(choix) {
    const couleurs = {};
    for (const nom of Object.keys(choix || {}).sort(ordre)) Object.assign(couleurs, choisir({}, nom, choix[nom]));
    return { schema: SCHEMA, version: VERSION, couleurs };
  }

  /** Une enveloppe relue (le navigateur, une sauvegarde) → les choix ; refusée en disant pourquoi. */
  function lireEnveloppe(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.schema !== SCHEMA) throw new Error(PREFIXE + ' : ce n’est pas un réglage « ' + SCHEMA + ' ».');
    if (x.version !== VERSION) throw new Error(PREFIXE + ' : version ' + x.version + ' inconnue (' + VERSION + ' attendue).');
    for (const k of Object.keys(x)) if (!['schema', 'version', 'couleurs'].includes(k)) throw new Error(PREFIXE + ' : champ inconnu « ' + k + ' ».');
    if (!x.couleurs || typeof x.couleurs !== 'object' || Array.isArray(x.couleurs)) throw new Error(PREFIXE + ' : les couleurs manquent.');
    let choix = {};
    for (const [nom, rang] of Object.entries(x.couleurs)) choix = choisir(choix, nom, rang);
    return choix;
  }

  const api = { NOMBRE, CLE, SCHEMA, compagnies, rangs, choisir, garder, court, connu, lire, enveloppe, lireEnveloppe };
  if (NODE) { module.exports = api; return; }
  root.OrlyPastilles = api;

  /* ---- dans la page : habiller les noms -------------------------------------------------------------------------- */

  const d = root.document;
  /**
   * Où une compagnie ou une commande se lit seule : la tête d'une rangée, une liste, une légende, le titre d'une fiche.
   * Seuls les textes posés directement dans ces éléments sont lus ; une phrase n'y est jamais habillée (`lire`).
   */
  const LIEUX = [
    '#at-classes tbody th[data-classe]', '.at-exclues .at-chip',                 // « Commandes » : la rangée, les commandes retirées
    '.qf-id > b',                                                                 // les étapes de chaque commande
    '.vp-table tbody th[scope="row"] + td', '#flight-rows td small',              // les vols : la compagnie d'un vol, au programme et aux départs
    '.tp-table td small',                                                         // les stocks : la commande qui attend
    '.mu-grille tbody th .mu-tout', '.mu-ordre-cmd button',                       // la fiche d'une équipe : ce qu'elle prépare, dans l'ordre
    '.se-afaire-nom', '.mu-cat-table tbody th[scope="row"]',                      // la fiche d'un service : ce qui reste à faire, ses compagnies
    '.rg-cie-code',                                                               // le tableau de tous les temps par vol
    '.ch-suit > span', '.ch-table th[scope="row"]',                               // les chemins : qui suit le chemin, qui passe par l'étape
    '.pa-nom',                                                                    // la carte « Couleurs des compagnies »
    '.co-nom',                                                                    // « Commandes » : la compagnie, sa rangée et son panneau (évolution 26 c)
    '.mu-atelier-cies label > b'                                                  // les compagnies à cocher d'un service à un seul atelier (correction 24 g)
  ];
  /** Où le nom d'une classe, seul, nomme une commande : sous la rangée de sa compagnie. */
  const LIEUX_CLASSE = ['.rg-recap-classe > th[scope="row"]', '.co-classe'];
  const TOUS_LES_LIEUX = LIEUX.concat(LIEUX_CLASSE).join(','), CLASSE_SEULE = LIEUX_CLASSE.join(',');

  let source = null;      // ce que la page branche : { signature(), compagnies(), classes() }
  let choix = {};         // les choix gardés, relus au départ et à chaque geste
  let vu = null;          // la dernière lecture : { signature, noms, rangs, connu }

  /** Les choix gardés dans ce navigateur ; une entrée abîmée se lit comme « aucun choix ». */
  function relire() {
    let brut = null;
    try { brut = root.localStorage.getItem(CLE); } catch (e) { /* stockage indisponible : les couleurs automatiques */ }
    try { choix = brut ? lireEnveloppe(JSON.parse(brut)) : {}; } catch (e) { choix = {}; }
    vu = null;
  }

  /** L'unité telle qu'elle est : ses compagnies, leur rang, ce que la page sait nommer. Relue quand sa signature change. */
  function unite() {
    const signature = source ? String(source.signature()) : '';
    if (vu && vu.signature === signature) return vu;
    const noms = source ? source.compagnies() : [];
    vu = { signature, noms, rangs: rangs(noms, choix), connu: connu(noms, source ? source.classes() : []) };
    return vu;
  }

  function element(classe, texte, attributs) {
    const e = d.createElement('span');
    e.className = classe; e.textContent = texte;
    for (const [k, v] of Object.entries(attributs || {})) if (v !== '' && v != null) e.setAttribute(k, v);
    return e;
  }

  /** La pastille d'une compagnie : son rang de couleur ; trop longue, ses deux lettres (un décor, que la feuille pose). */
  function pastille(part, u) {
    const lettres = court(part.texte);
    return element('pa-cie' + (lettres ? ' pa-long' : ''), part.texte, { 'data-pa-cle': part.cle, 'data-pa-rang': u.rangs.get(part.cle), 'data-pa-court': lettres });
  }

  /** Un nœud de texte qui nomme une compagnie ou une commande : enveloppé, sans qu'un caractère change. */
  function habillerTexte(noeud, u, classeSeule) {
    const parts = lire(noeud.nodeValue, u.connu, { classeSeule });
    if (!parts) return;
    const fragment = d.createDocumentFragment(), nom = element('pa', '');
    for (const p of parts) {
      if (p.genre === 'texte') fragment.appendChild(d.createTextNode(p.texte));
      else {
        nom.appendChild(p.genre === 'cie' ? pastille(p, u) : element(p.genre === 'lien' ? 'pa-lien' : 'pa-classe', p.texte, { 'data-cab': p.cabine }));
        if (!nom.parentNode) fragment.appendChild(nom);
      }
    }
    // Le point de couleur que la page posait devant la commande : l'étiquette porte le sien.
    const avant = noeud.previousElementSibling;
    if (avant && avant.classList.contains('puce-classe') && nom.querySelector('.pa-classe')) avant.classList.add('pa-remplacee');
    noeud.replaceWith(fragment);
  }

  /** Les textes posés directement dans un lieu. */
  function habillerLieu(lieu, u) {
    const classeSeule = lieu.matches(CLASSE_SEULE);
    for (const n of [...lieu.childNodes]) if (n.nodeType === 3 && n.nodeValue.trim()) habillerTexte(n, u, classeSeule);
  }

  /** Habille les lieux d'une partie de la page (elle-même, ce qu'elle contient). */
  function habiller(racine) {
    const u = unite();
    if (!u.connu.cies.size || !racine) return;
    if (racine.nodeType === 3) { const p = racine.parentElement; if (p && p.matches(TOUS_LES_LIEUX)) habillerLieu(p, u); return; }
    if (racine.nodeType !== 1 && racine.nodeType !== 9) return;
    if (racine.matches && racine.matches(TOUS_LES_LIEUX)) habillerLieu(racine, u);
    for (const lieu of racine.querySelectorAll(TOUS_LES_LIEUX)) habillerLieu(lieu, u);
  }

  /** L'unité a changé (une compagnie de plus, un choix) : les pastilles déjà posées prennent leur rang, le reste s'habille. */
  function rafraichir() {
    const u = unite();
    for (const p of d.querySelectorAll('.pa-cie')) {
      const r = u.rangs.get(p.getAttribute('data-pa-cle'));
      if (r) p.setAttribute('data-pa-rang', r); else p.removeAttribute('data-pa-rang');
    }
    // La carte d'abord : ses pastilles s'habillent avec le reste de la page.
    dessinerCarte();
    habiller(d.body);
    ajusterApercu(); placerPanneau();
  }

  let observateur = null;
  /** Chaque rendu ajoute des nœuds : ceux-là seuls sont relus. Nos propres enveloppes ne le sont pas. */
  function observer() {
    if (!root.MutationObserver || observateur) return;
    observateur = new root.MutationObserver(liste => {
      const avant = vu && vu.signature;
      if (unite().signature !== avant) rafraichir();
      else for (const m of liste) for (const n of m.addedNodes) {
        const e = n.nodeType === 1 ? n : n.parentElement;
        if (e && !e.closest('.pa')) habiller(n);
      }
      observateur.takeRecords();
    });
    observateur.observe(d.body, { childList: true, subtree: true });
  }

  /**
   * La page se branche : elle dit ses compagnies, ses classes, et quand elles changent.
   * @param {{signature:()=>string, compagnies:()=>string[], classes:()=>{cabine:string,nom:string}[]}} s
   */
  function brancher(s) {
    source = s; relire(); rafraichir(); observer();
    if (root.OrlyNotif) root.OrlyNotif.inscrire('couleurs', { version: () => version, defaire });
  }

  /* ---- les choix : les garder, les défaire ------------------------------------------------------------------------- */

  let version = 0;
  const histoire = [];   // les choix d'avant chaque geste, pour « Annuler »

  /** Écrit les choix (aucun : l'entrée disparaît, la sauvegarde redevient celle d'avant) ; les pastilles suivent. */
  function ecrire(nouveaux) {
    if (Object.keys(nouveaux).length) root.localStorage.setItem(CLE, JSON.stringify(enveloppe(nouveaux)));
    else root.localStorage.removeItem(CLE);
    choix = nouveaux; vu = null;
    rafraichir();
  }
  /** Un geste sur les couleurs : écrit, puis dit (la notification propose « Annuler »). Un refus du stockage se dit. */
  function changer(nouveaux, phrase) {
    const avant = choix;
    try { ecrire(nouveaux); } catch (e) { if (root.OrlyNotif) root.OrlyNotif.notifier('Couleurs non enregistrées : ' + e.message, { cle: 'couleurs', ton: 'retard' }); return; }
    histoire.push(avant); version++;
    if (root.OrlyNotif) { root.OrlyNotif.marquer('couleurs'); root.OrlyNotif.notifier(phrase, { cle: 'couleurs' }); }
  }
  function defaire() {
    if (!histoire.length) return;
    const avant = histoire.pop(); version++;
    try { ecrire(avant); } catch (e) { /* stockage indisponible : les choix restent ceux de la page */ }
  }

  const verrouille = () => d.body.dataset.lecture === 'seule';
  /** La couleur d'une compagnie, choisie parmi les douze. */
  function choisirCouleur(nom, rang) {
    if (verrouille()) return;
    changer(choisir(choix, nom, rang), nom + ' : couleur ' + rang + '.');
  }
  /** « Garder ces couleurs » : la couleur du moment de chaque compagnie de l'unité est écrite. */
  function garderCouleurs() {
    if (verrouille()) return;
    const noms = unite().noms;
    if (!noms.length) return;
    changer(garder(noms, choix), 'Couleurs gardées : elles ne bougeront plus quand une compagnie s’ajoute.');
  }
  /** « Revenir aux couleurs automatiques » : les choix s'effacent. */
  function revenirAuxAutomatiques() {
    if (verrouille() || !Object.keys(choix).length) return;
    changer({}, 'Couleurs automatiques : les compagnies reprennent les douze couleurs dans l’ordre alphabétique.');
  }

  /* ---- la carte « Couleurs des compagnies » ------------------------------------------------------------------------ */

  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let carte = null;

  /** La compagnie dont le petit panneau des douze teintes est ouvert (une seule à la fois). */
  let ouvert = null;

  /** Une rangée : la pastille de la compagnie — un bouton, qui ouvre le panneau de ses douze teintes — et son état. */
  function rangee(nom, u) {
    const rang = u.rangs.get(nom), etat = estRang(choix[nom]) ? 'gardée' : 'automatique';
    return `<li class="pa-rangee" data-pa-compagnie="${esc(nom)}"><button type="button" class="pa-choisir" data-pa-ouvrir aria-haspopup="true" aria-expanded="${nom === ouvert}"`
      + ` aria-label="${esc(nom)} : couleur ${rang}, ${etat}. Choisir sa couleur" title="Choisir la couleur de ${esc(nom)}"><span class="pa-nom">${esc(nom)}</span></button>`
      + `<small class="pa-etat">${etat}</small></li>`;
  }

  /** Le panneau d'une compagnie : douze teintes, un groupe de boutons radio ; celle du moment est cochée. */
  function panneau(nom, u) {
    const rang = u.rangs.get(nom);
    const teintes = Array.from({ length: NOMBRE }, (_, i) => i + 1).map(r =>
      `<button type="button" class="pa-teinte" role="radio" data-pa-teinte="${r}" data-pa-rang="${r}" aria-checked="${r === rang}"`
      + ` tabindex="${r === rang ? 0 : -1}" aria-label="${esc(nom)} : couleur ${r}" title="Couleur ${r}"></button>`).join('');
    return `<div class="pa-panneau" data-pa-panneau="${esc(nom)}"><span class="pa-teintes" role="radiogroup" aria-label="Couleur de ${esc(nom)}">${teintes}</span></div>`;
  }

  /** Ce que la carte dit d'un mot, dans son en-tête : combien de compagnies, et si leurs couleurs sont gardées. */
  function etatDesCouleurs(noms) {
    const n = noms.length, gardees = noms.filter(nom => estRang(choix[nom])).length;
    if (!n) return 'aucune compagnie';
    const combien = n + (n > 1 ? ' compagnies' : ' compagnie');
    if (!gardees) return combien + ' · couleurs automatiques';
    return combien + ' · ' + (gardees === n ? 'couleurs gardées' : gardees + (gardees > 1 ? ' gardées' : ' gardée'));
  }

  function carteHTML(u) {
    const n = u.noms.length;
    return `<summary class="pa-carte-tete"><h2 class="pa-carte-titre">Couleurs des compagnies</h2><span class="pa-carte-etat">${esc(etatDesCouleurs(u.noms))}</span>`
      + `<span class="pa-apercu" aria-hidden="true">${u.noms.map(nom => `<span class="pa-nom">${esc(nom)}</span>`).join('')}<span class="pa-plus" hidden></span></span></summary>`
      + (n ? `<ul class="pa-liste">${u.noms.map(nom => rangee(nom, u)).join('')}</ul>` : '<p class="mini-note pa-vide">Les compagnies de vos vols et de vos réglages viendront ici.</p>')
      + (ouvert && u.noms.includes(ouvert) ? panneau(ouvert, u) : '')
      + `<p class="pa-actions"><button type="button" class="btn btn-sm" data-pa-action="garder"${n ? '' : ' disabled'}>Garder ces couleurs</button>`
      + `<button type="button" class="btn btn-sm" data-pa-action="automatiques"${Object.keys(choix).length ? '' : ' disabled'}>Revenir aux couleurs automatiques</button>`
      + '<span class="mini-note">Sans choix, les compagnies prennent les douze couleurs dans l’ordre alphabétique.</span></p>';
  }

  let dessinee = '';
  const rangeeDe = nom => (carte ? [...carte.querySelectorAll('[data-pa-compagnie]')].find(e => e.dataset.paCompagnie === nom) : null);
  const pastilleDe = nom => { const li = rangeeDe(nom); return li ? li.querySelector('[data-pa-ouvrir]') : null; };
  /** La carte, redessinée quand elle change ; ouverte ou repliée, elle le reste, et le focus revient où il était. */
  function dessinerCarte() {
    if (!carte) return;
    const u = unite();
    if (ouvert && !u.noms.includes(ouvert)) ouvert = null;
    const html = carteHTML(u);
    if (html === dessinee) return;
    const actif = carte.contains(d.activeElement) ? d.activeElement : null;
    const teinte = actif && actif.matches('[data-pa-teinte]') ? [actif.closest('[data-pa-panneau]').dataset.paPanneau, actif.dataset.paTeinte] : null;
    const surPastille = actif && actif.matches('[data-pa-ouvrir]') ? actif.closest('[data-pa-compagnie]').dataset.paCompagnie : null;
    const action = actif && actif.dataset.paAction;
    carte.innerHTML = dessinee = html;
    const p = carte.querySelector('.pa-panneau');
    const cible = teinte ? (p && p.dataset.paPanneau === teinte[0] ? p.querySelector(`[data-pa-teinte="${teinte[1]}"]`) : pastilleDe(teinte[0]))
      : surPastille ? pastilleDe(surPastille) : action ? carte.querySelector(`[data-pa-action="${action}"]:not(:disabled)`) : null;
    if (cible) cible.focus({ preventScroll: true });
  }

  /** Le panneau, ancré sous sa pastille ; faute de place en bas, au-dessus ; jamais hors de la fenêtre. */
  function placerPanneau() {
    const p = carte && carte.querySelector('.pa-panneau'), b = p && pastilleDe(p.dataset.paPanneau);
    if (!p || !b) return;
    const q = b.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight, marge = 4;
    const haut = q.bottom + marge + h <= root.innerHeight - marge ? q.bottom + marge : Math.max(marge, q.top - marge - h);
    p.style.left = Math.round(Math.max(marge, Math.min(q.left, root.innerWidth - w - marge))) + 'px';
    p.style.top = Math.round(haut) + 'px';
  }

  /** Ouvrir le panneau d'une compagnie : le focus va à sa teinte cochée. */
  function ouvrirPanneau(nom) {
    if (verrouille()) return;
    ouvert = nom; dessinerCarte(); habiller(carte); placerPanneau();
    const coche = carte.querySelector('.pa-panneau [aria-checked="true"]') || carte.querySelector('.pa-panneau [data-pa-teinte]');
    if (coche) coche.focus({ preventScroll: true });
  }
  /**
   * Le fermer ; `rendre` : le focus revient à sa pastille. La carte n'est pas redessinée : le panneau s'en va, rien
   * d'autre ne bouge — un clic en cours (sur le titre de la carte, sur un de ses boutons) garde sa cible.
   */
  function fermerPanneau(rendre) {
    if (!ouvert) return;
    const p = carte.querySelector('.pa-panneau'), b = pastilleDe(ouvert);
    ouvert = null;
    if (p) p.remove();
    if (b) b.setAttribute('aria-expanded', 'false');
    dessinee = carteHTML(unite());
    if (rendre && b) b.focus({ preventScroll: true });
  }

  /** Repliée, la carte montre les pastilles qui tiennent en entier, depuis la gauche ; les autres se disent « + 3 ». */
  function ajusterApercu() {
    const ap = carte && carte.querySelector('.pa-apercu'), plus = ap && ap.querySelector('.pa-plus');
    if (!ap || !plus) return;
    const noms = [...ap.querySelectorAll(':scope > .pa-nom')];
    for (const n of noms) n.hidden = false;
    plus.hidden = true; plus.textContent = '';
    if (carte.open || !noms.length || !ap.clientWidth) return;
    let vus = noms.length;
    while (vus > 0 && ap.scrollWidth > ap.clientWidth + 1) {
      noms[--vus].hidden = true;
      plus.hidden = false; plus.textContent = '+ ' + (noms.length - vus);
    }
  }

  /** Au clavier, les douze teintes sont un seul arrêt : les flèches vont de l'une à l'autre ; Échap ferme le panneau. */
  function auClavier(e) {
    if (e.key === 'Escape' && ouvert) { e.preventDefault(); e.stopPropagation(); fermerPanneau(true); return; }
    const t = e.target.closest && e.target.closest('[data-pa-teinte]');
    const pas = { ArrowRight: 1, ArrowDown: 6, ArrowLeft: -1, ArrowUp: -6 }[e.key];
    if (!t || (!pas && e.key !== 'Home' && e.key !== 'End')) return;
    const toutes = [...t.parentElement.querySelectorAll('[data-pa-teinte]')], i = toutes.indexOf(t);
    const vers = e.key === 'Home' ? 0 : e.key === 'End' ? toutes.length - 1 : (i + pas + toutes.length) % toutes.length;
    e.preventDefault();
    toutes[vers].focus();
  }

  /** La page donne l'élément de la carte (un `<details>`) ; les clics et les flèches y sont écoutés une fois. */
  function poserCarte(hote) {
    if (!hote || carte === hote) return;
    carte = hote;
    carte.addEventListener('click', e => {
      const t = e.target.closest('[data-pa-teinte]'), a = e.target.closest('[data-pa-action]'), o = e.target.closest('[data-pa-ouvrir]');
      if (o) { const nom = o.closest('[data-pa-compagnie]').dataset.paCompagnie; if (ouvert === nom) fermerPanneau(true); else ouvrirPanneau(nom); }
      else if (t) {
        // Choisir ferme le panneau, et rend le focus à la pastille.
        const nom = t.closest('[data-pa-panneau]').dataset.paPanneau, rang = +t.dataset.paTeinte;
        ouvert = null; choisirCouleur(nom, rang); dessinerCarte(); habiller(carte);
        const b = pastilleDe(nom);
        if (b) b.focus({ preventScroll: true });
      }
      else if (a) (a.dataset.paAction === 'garder' ? garderCouleurs : revenirAuxAutomatiques)();
    });
    carte.addEventListener('keydown', auClavier);
    // Le panneau se ferme quand on clique ailleurs, quand le focus quitte la carte, quand la carte se replie.
    d.addEventListener('pointerdown', e => { if (ouvert && !(e.target.closest && e.target.closest('.pa-panneau,[data-pa-ouvrir]'))) fermerPanneau(false); }, true);
    carte.addEventListener('focusout', e => { if (ouvert && e.relatedTarget && !carte.contains(e.relatedTarget)) fermerPanneau(false); });
    carte.addEventListener('toggle', () => { if (!carte.open) fermerPanneau(false); ajusterApercu(); });
    carte.addEventListener('scroll', placerPanneau);
    root.addEventListener('resize', () => { placerPanneau(); ajusterApercu(); });
    if (root.ResizeObserver) new root.ResizeObserver(() => ajusterApercu()).observe(carte);
    dessinerCarte();
  }

  /**
   * Les douze teintes d'une compagnie, à poser dans un panneau de la page (« Commandes », évolution 26 c) : un groupe de
   * boutons radio, celle du moment cochée. Un clic sur une teinte (`data-pa-teinte`) se donne à `choisirCouleur`.
   */
  function teintesHTML(nomBrut, verrou) {
    const nom = cle(nomBrut), rang = unite().rangs.get(nom) || rangs([...unite().noms, nom], choix).get(nom);
    return `<span class="pa-teintes" role="radiogroup" aria-label="Couleur de ${esc(nom)}">` + Array.from({ length: NOMBRE }, (_, i) => i + 1).map(r =>
      `<button type="button" class="pa-teinte" role="radio" data-pa-teinte="${r}" data-pa-rang="${r}" aria-checked="${r === rang}"`
      + ` tabindex="${r === rang ? 0 : -1}" aria-label="${esc(nom)} : couleur ${r}" title="Couleur ${r}"${verrou ? ' disabled' : ''}></button>`).join('') + '</span>';
  }
  /** Au clavier, dans des teintes posées par `teintesHTML` : les flèches vont de l'une à l'autre. */
  function clavierTeintes(e) { if (e.key !== 'Escape') auClavier(e); }
  /**
   * Un geste sur les couleurs que la page compose (« Commandes ») : `f(choix, noms)` rend les choix neufs. Rien en
   * lecture seule ; la notification dit `phrase` et propose « Annuler ».
   */
  function reecrire(f, phrase) {
    if (verrouille()) return;
    const u = unite(), neufs = f({ ...choix }, u.noms.slice());
    if (JSON.stringify(neufs) !== JSON.stringify(choix)) changer(neufs, phrase);
  }

  Object.assign(api, {
    teintesHTML, clavierTeintes, reecrire,
    brancher, poserCarte, relire: () => { relire(); rafraichir(); },
    choix: () => ({ ...choix }), rang: nom => unite().rangs.get(cle(nom)) || null,
    choisirCouleur, garderCouleurs, revenirAuxAutomatiques
  });
})(typeof window !== 'undefined' ? window : globalThis);
