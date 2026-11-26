/* ==========================================================================
 *  NE PAS PERDRE SON TRAVAIL (version 1, correction 24 b)
 *
 *  Tout vit dans le navigateur. L'outil sait s'il reste des changements non
 *  sauvegardés : un réglage de la sauvegarde a été écrit depuis le dernier
 *  « Tout sauvegarder » ou la dernière restauration. Il le dit dans la barre
 *  du haut, par un mot et un point — « Sauvegardé à 14:32 », « Non sauvegardé
 *  depuis 14:32 », « Jamais sauvegardé » —, et un clic sauvegarde tout. S'il
 *  reste des changements, le navigateur pose sa question à la fermeture ou au
 *  rechargement de l'onglet.
 *
 *  Ce qui compte comme un changement : une entrée de la sauvegarde vraiment
 *  écrite ou retirée (stockage.js le signale), une fois la page démarrée. Ce
 *  que le calcul écrit de lui-même dans les équipes en suivant les vols —
 *  l'effectif calculé reporté, les commandes d'une équipe « par compagnie » —
 *  n'est pas un réglage et ne compte pas : importer des vols ou changer de
 *  journée ne fait rien perdre. Une préférence d'affichage ne compte pas non
 *  plus.
 *
 *  La mémoire — quand on a sauvegardé, depuis quand un changement attend — est
 *  elle-même une préférence d'affichage (`ory-ui-…`) : hors de la sauvegarde.
 *
 *  La première partie est pure (les tests la jouent sans navigateur) ; la
 *  seconde la branche sur la page.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const CLE = 'ory-ui-etat-sauvegarde';
  const CLE_EQUIPES = 'ory-ateliers-v1';

  /** Un instant écrit (ISO) ou compté (millisecondes), relu en ISO ; null s'il ne se lit pas. */
  function instant(x) {
    const t = typeof x === 'number' ? x : typeof x === 'string' && x ? Date.parse(x) : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  /** La mémoire relue : { fait, par, change }. Absente ou abîmée : rien n'est su. */
  function lire(texte) {
    let m = null;
    try { m = JSON.parse(texte || 'null'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object') m = {};
    const fait = instant(m.fait);
    return { fait, par: !fait ? null : m.par === 'restauration' ? 'restauration' : 'sauvegarde', change: instant(m.change) };
  }

  /**
   * La mémoire d'un navigateur qui n'en a pas encore : la date de la dernière sauvegarde qu'il gardait déjà, et un
   * changement en attente si le dernier réglage changé est plus récent qu'elle.
   */
  function initiale(o) {
    const fait = instant(o && o.sauvegarde), reglage = instant(o && o.reglage);
    return { fait, par: fait ? 'sauvegarde' : null, change: reglage && (!fait || reglage > fait) ? reglage : null };
  }

  const etat = m => (!m.fait ? 'jamais' : m.change ? 'non-sauvegarde' : 'sauvegarde');
  /** Il reste des changements non sauvegardés. */
  const reste = m => !!m.change;

  /** « 14:32 » le jour même, « le 25/11 à 14:32 » un autre jour, avec l'année si ce n'est pas la même. */
  function quand(iso, maintenant) {
    const t = new Date(iso), n = maintenant || new Date(), deux = x => String(x).padStart(2, '0');
    const heure = deux(t.getHours()) + ':' + deux(t.getMinutes());
    if (t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate()) return { jour: null, heure };
    return { jour: deux(t.getDate()) + '/' + deux(t.getMonth() + 1) + (t.getFullYear() === n.getFullYear() ? '' : '/' + t.getFullYear()), heure };
  }
  const a = q => (q.jour ? 'le ' + q.jour + ' à ' + q.heure : 'à ' + q.heure);
  const depuis = q => (q.jour ? 'le ' + q.jour + ' à ' + q.heure : q.heure);

  /** Ce que la barre du haut dit : l'état, son texte (le mot, puis quand) et son infobulle. */
  function dire(m, maintenant) {
    const e = etat(m), GESTE = ' Cliquer pour tout sauvegarder dans un fichier.';
    const premier = m.change ? ' Premier changement ' + a(quand(m.change, maintenant)) + '.' : '';
    if (e === 'jamais') return { etat: e, mot: 'Jamais sauvegardé', quand: '', texte: 'Jamais sauvegardé',
      titre: 'Votre travail ne vit que dans ce navigateur : aucun fichier de sauvegarde n’a été fait.' + premier + GESTE };
    const q = quand(m.fait, maintenant);
    if (e === 'non-sauvegarde') return { etat: e, mot: 'Non sauvegardé', quand: ' depuis ' + depuis(q), texte: 'Non sauvegardé depuis ' + depuis(q),
      titre: 'Des réglages ont changé depuis ' + (m.par === 'restauration' ? 'la restauration' : 'la sauvegarde') + ' faite ' + a(q) + '.' + premier + GESTE };
    return { etat: e, mot: 'Sauvegardé', quand: ' ' + a(q), texte: 'Sauvegardé ' + a(q),
      titre: (m.par === 'restauration' ? 'Restauré d’un fichier ' + a(q) : 'Tout est dans le fichier téléchargé ' + a(q))
        + ' : rien n’a changé depuis.' + GESTE };
  }

  /** Les réglages des équipes, sans ce que le calcul y écrit de lui-même en suivant les vols : l'effectif calculé
   *  reporté (le nombre tapé reste dans `personnesSaisies`) et les commandes d'une équipe « par compagnie ». */
  function reglagesDesEquipes(texte) {
    const e = JSON.parse(texte);
    if (!e || !Array.isArray(e.ateliers)) return texte;
    return JSON.stringify({ ...e, ateliers: e.ateliers.map(({ personnes, personnesSaisies, lots, ...equipe }) =>
      ({ ...equipe, ...(equipe.parCompagnie ? {} : { lots }), personnes: Number.isInteger(personnesSaisies) ? personnesSaisies : personnes })) });
  }

  /** Cette écriture d'une entrée de la sauvegarde est un changement à sauvegarder. */
  function compte(cle, avant, apres) {
    if (avant === apres) return false;
    if (cle !== CLE_EQUIPES || typeof avant !== 'string' || typeof apres !== 'string') return true;
    try { return reglagesDesEquipes(avant) !== reglagesDesEquipes(apres); } catch (e) { return true; }
  }

  const api = { CLE, lire, initiale, etat, reste, dire, compte };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ---- dans la page ---------------------------------------------------- */

  let options = {}, parties = new Set(), demarree = false, muet = false, ecoute = false, courante = null;

  // Ce que le navigateur savait avant que cette page ne s'ouvre (un navigateur d'avant cette correction n'a pas encore
  // la mémoire) : la date de sa dernière sauvegarde, celle de son dernier réglage changé. Lu tout de suite : le
  // démarrage de la page, qui reprend d'anciennes données, pose lui-même un « dernier réglage ».
  const CLE_DERNIERE = 'ory-ui-derniere-sauvegarde', CLE_REGLAGE = 'ory-ui-dernier-reglage';
  const connu = (() => {
    try {
      const r = JSON.parse(root.localStorage.getItem(CLE_REGLAGE) || 'null');
      return { sauvegarde: root.localStorage.getItem(CLE_DERNIERE), reglage: r && Number.isFinite(r.a) ? r.a : null };
    } catch (e) { return null; }
  })();

  /** La mémoire du moment : celle du navigateur (les autres onglets la partagent) ; sans stockage, celle de la visite. */
  function memoire() {
    let texte = null, lu = false;
    try { texte = root.localStorage.getItem(CLE); lu = true; } catch (e) { lu = false; }
    if (lu && texte !== null) return lire(texte);
    return courante || (courante = initiale(connu));
  }
  function garder(m) {
    courante = m;
    try { root.localStorage.setItem(CLE, JSON.stringify(m)); } catch (e) { /* stockage indisponible : l'état vaut pour la visite */ }
    maj();
  }

  /** Un navigateur piloté par un programme (les tests) : personne ne répondrait à la question. */
  const pilote = () => !!(root.navigator && root.navigator.webdriver);
  /** La question du navigateur, à la fermeture ou au rechargement de l'onglet. */
  function fermeture(e) { e.preventDefault(); e.returnValue = ''; }

  /** La barre du haut dit l'état ; l'écouteur de fermeture n'est posé que s'il reste des changements. */
  function maj() {
    const m = memoire(), d = dire(m, new Date()), b = options.bouton;
    if (b) {
      const mot = b.querySelector('.sauve-mot');
      if (b.dataset.etat !== d.etat) b.dataset.etat = d.etat;
      if (mot && mot.textContent !== d.texte) {
        const quand = root.document.createElement('span');
        quand.className = 'sauve-quand'; quand.textContent = d.quand;
        mot.textContent = d.mot; mot.appendChild(quand);
      }
      if (b.title !== d.titre) b.title = d.titre;
    }
    const poser = reste(m) && !muet && !pilote() && !(options.lectureSeule && options.lectureSeule());
    if (poser !== ecoute) { root[poser ? 'addEventListener' : 'removeEventListener']('beforeunload', fermeture); ecoute = poser; }
  }

  /** Le garde du stockage vient d'écrire une donnée : un changement, si c'est un réglage de la sauvegarde. */
  function auChangement(cle, avant, apres) {
    if (!demarree || !parties.has(cle) || !compte(cle, avant, apres)) return;
    const m = memoire();
    if (!m.change) garder({ ...m, change: new Date().toISOString() });
  }

  /** Sans le garde de stockage.js (il n'a pas pu se poser) : une écriture se voit au stockage lui-même. */
  function ecouterSansGarde() {
    const S = root.Storage && root.Storage.prototype;
    if (!S) return;
    const ecrire = S.setItem, retirer = S.removeItem;
    const suivie = (s, k) => { try { return s === root.localStorage && parties.has(k); } catch (e) { return false; } };
    S.setItem = function (k) {
      const suivi = suivie(this, k), avant = suivi ? this.getItem(k) : null, r = ecrire.apply(this, arguments);
      if (suivi) auChangement(k, avant, this.getItem(k));
      return r;
    };
    S.removeItem = function (k) {
      const suivi = suivie(this, k), avant = suivi ? this.getItem(k) : null, r = retirer.apply(this, arguments);
      if (suivi) auChangement(k, avant, null);
      return r;
    };
  }

  /**
   * Brancher la page : `parties` (les clés de la sauvegarde), `bouton` (dans la barre du haut), `sauvegarder` (ce que
   * fait « Tout sauvegarder ») et `lectureSeule()`.
   */
  function brancher(o) {
    options = o || {}; parties = new Set(options.parties || []);
    if (root.OrlyStockage && root.OrlyStockage.installe && root.OrlyStockage.surEcriture) root.OrlyStockage.surEcriture(auChangement);
    else ecouterSansGarde();
    if (options.bouton) options.bouton.addEventListener('click', () => { if (options.sauvegarder) options.sauvegarder(); });
    // Un autre onglet a sauvegardé ou changé un réglage ; l'onglet revient un autre jour ; la lecture seule change.
    root.addEventListener('storage', e => { if (e.key === CLE || e.key === null) maj(); });
    root.addEventListener('pageshow', maj);
    root.addEventListener('focus', maj);
    if (root.MutationObserver && root.document && root.document.body)
      new root.MutationObserver(maj).observe(root.document.body, { attributes: true, attributeFilter: ['data-lecture'] });
    // Le « Recharger » du bandeau d'un onglet en retard (stockage.js) : un rechargement que l'outil propose lui-même.
    if (root.document) root.document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.donnees-changees button')) sansQuestion(); }, true);
    // La mémoire s'écrit dès la première visite : les suivantes la relisent, sans rien déduire.
    let absente = false;
    try { absente = root.localStorage.getItem(CLE) === null; } catch (e) { absente = false; }
    if (absente) garder(memoire()); else maj();
  }

  /** La page a fini de démarrer : ce qu'elle a écrit en s'ouvrant n'était pas un geste. */
  function pret() { demarree = true; maj(); }
  /** « Tout sauvegarder » vient de rendre son fichier. */
  function sauvegarde() { garder({ fait: new Date().toISOString(), par: 'sauvegarde', change: null }); }
  /** Une sauvegarde vient d'être restaurée : la page va se recharger d'elle-même, sans question. */
  function restauration() { muet = true; garder({ fait: new Date().toISOString(), par: 'restauration', change: null }); }
  /** L'outil recharge la page lui-même : pas de question. */
  function sansQuestion() { muet = true; maj(); }
  /** Pour les tests et le diagnostic : l'état dit, s'il reste des changements, si l'écouteur de fermeture est posé. */
  function lireEtat() { const m = memoire(); return { ...dire(m, new Date()), reste: reste(m), ecoute, memoire: m }; }

  root.OrlyEtatSauvegarde = { ...api, brancher, pret, sauvegarde, restauration, sansQuestion, maj, lire: lire, lireEtat };
})(typeof window !== 'undefined' ? window : globalThis);
