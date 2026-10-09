/* ==========================================================================
 *  NOTIFICATIONS ET QUESTIONS — le retour des gestes (refonte du 08/10, étape 4)
 *
 *  Une NOTIFICATION dit ce qui vient de se passer, quelques secondes, en bas
 *  à droite : « Case « Montage » supprimée. », avec « Annuler » quand le geste
 *  se défait. Elle remplace :
 *    - la ligne d'état collée en haut des pages, qui se lisait encore des
 *      pages plus loin, comme si elle parlait d'elles (audit du 08/10, point 4) ;
 *    - les confirm() des gestes annulables : on fait, puis l'on revient en
 *      arrière d'un clic, ici ou avec Annuler en haut (Ctrl Z).
 *  Elle se ferme d'elle-même (plus tard quand elle porte « Annuler » ou dit un
 *  refus), attend tant que la souris ou le focus est dessus, et Échap la ferme.
 *  Une CONSIGNE (« Relier Prépa à… : cliquez le service qui le reçoit ») reste
 *  là tant que dure le geste qu'elle explique.
 *
 *  Une QUESTION (demander) reste pour ce qui ne se défait pas d'un clic :
 *  restaurer une sauvegarde, recharger la démo, supprimer un service et ses
 *  équipes. C'est une fenêtre du site, qui dit le geste en toutes lettres sur
 *  son bouton, et dont Échap ou « Ne rien changer » sortent sans rien faire.
 *
 *  LE GESTE. Les modules qui gardent un historique (les cases, le barème, le
 *  plan, les liens) s'inscrivent ici, et signalent chaque entrée qu'ils y
 *  ajoutent. Tout ce qui change pendant une même tâche du navigateur — un
 *  clic, une saisie, la fin d'un import, la réponse à une question, et les
 *  promesses qu'ils résolvent — forme un geste, même s'il touche deux
 *  historiques (le calage change le barème et les cases). La notification de ce tour
 *  porte « Annuler », qui défait le geste entier ; une notification par geste
 *  (la dernière dite remplace les précédentes). Quand l'un de ses historiques
 *  bouge ensuite, autrement, « Annuler » ne défairait plus ce qu'elle dit :
 *  elle se ferme.
 *
 *  Un enregistrement de routine (« Enregistré. », « Présence enregistrée. »)
 *  ne s'affiche pas : la valeur se lit dans son champ. Les refus, si.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const MAX = 3;                       // au-delà, la plus ancienne s'en va
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** La typographie française : pas de retour à la ligne avant « : ; ! ? » », ni après « « ». */
  const insecables = s => String(s).replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');

  /** Un refus se voit : il porte la couleur du retard et dure plus longtemps. */
  const REFUS = /^(Refusé|Import refusé|Impossible|Enregistrement impossible|Sauvegarde locale impossible)/;
  /** Une phrase courte qui finit par « enregistré(e)(s). » : la routine d'un champ. */
  const ROUTINE = /^[^.:;!?\n]{0,48}enregistrée?s?\.$/i;

  /** Combien de temps la lire : 5 s, plus le temps de la phrase ; 8 s avec « Annuler ». */
  function duree(texte, o) {
    if (o.consigne) return 0;
    if (o.duree !== undefined) return o.duree;
    const lecture = Math.min(10000, 5000 + texte.length * 20);
    return Math.max(lecture, o.annuler ? 8000 : 0, o.ton === 'retard' ? 10000 : 0);
  }
  /** Ce que dit un message, en bref : sa première phrase, jusqu'aux deux-points
   *  s'ils viennent après un vrai début (« Case « Montage » supprimée. »). */
  const premiere = t => {
    const m = String(t).match(/^[\s\S]*?[.!?](?=\s|$)/), p = (m ? m[0] : String(t)).trim();
    const i = p.indexOf(' : ');
    return i >= 20 ? p.slice(0, i) + '.' : p;
  };

  /* ---- les historiques et le geste en cours -------------------------------- */

  const histoires = new Map();         // nom → { version(), defaire() }
  let geste = null;                    // { parts: Map(nom → { n, fin }) } de la tâche en cours
  let silence = 0;                     // pendant « Annuler » : les modules se taisent

  /** Un module qui garde un historique : `version()` change à chaque état, `defaire()` revient d'une entrée. */
  function inscrire(nom, h) { if (nom && h && typeof h.version === 'function' && typeof h.defaire === 'function') histoires.set(nom, h); }

  /** Une entrée vient d'entrer dans l'historique `nom` (après son changement de version). */
  function marquer(nom) {
    const h = histoires.get(nom); if (!h) return;
    if (!geste) {
      // Il se clôt à la tâche suivante : ses promesses (une question, un fichier lu) en font partie.
      const g = geste = { parts: new Map() };
      setTimeout(() => { if (geste === g) geste = null; }, 0);
    }
    const p = geste.parts.get(nom) || { n: 0, fin: 0 };
    p.n++; p.fin = h.version(); geste.parts.set(nom, p);
    revalider();
  }

  /** L'historique a changé autrement (Annuler, Rétablir) : les notifications qu'il rend fausses se ferment. */
  function bouger() { revalider(); }

  function valide(g) {
    if (!g || !g.parts.size) return false;
    for (const [nom, p] of g.parts) { const h = histoires.get(nom); if (!h || h.version() !== p.fin) return false; }
    return true;
  }

  function defaire(g, texte, propre) {
    if (!valide(g)) { notifier('Plus rien à annuler ici : d’autres modifications ont suivi. Annuler, en haut, les reprend une à une.', { cle: 'annule' }); return; }
    silence++;
    try {
      if (propre) propre();
      else for (const [nom, p] of [...g.parts].reverse()) { const h = histoires.get(nom); for (let i = 0; i < p.n; i++) h.defaire(); }
    } finally { silence--; }
    notifier('Annulé : ' + premiere(texte), { cle: 'annule', annulable: false });
  }

  /* ---- les notifications ----------------------------------------------------- */

  function pile() {
    let z = root.document.getElementById('notifs');
    if (!z) {
      z = root.document.createElement('section');
      z.id = 'notifs'; z.className = 'notifs'; z.setAttribute('aria-label', 'Notifications');
      z.innerHTML = '<div class="notifs-pile" aria-live="polite"></div>';
      root.document.body.appendChild(z);
    }
    return z.firstElementChild;
  }

  /** Retire tout de suite (une autre prend sa place) ; le focus revient d'où il venait. */
  function retirer(n) {
    if (!n || !n.isConnected) return;
    clearTimeout(n._minuterie);
    const avaitFocus = n.contains(root.document.activeElement);
    n.remove();
    if (avaitFocus && n._retour && n._retour.isConnected) n._retour.focus({ preventScroll: true });
  }
  /** Ferme en douceur. */
  function sortir(n) {
    if (!n || !n.isConnected || n.classList.contains('sort')) return;
    clearTimeout(n._minuterie);
    if (n.contains(root.document.activeElement) && n._retour && n._retour.isConnected) n._retour.focus({ preventScroll: true });
    n.classList.add('sort');
    setTimeout(() => n.remove(), 160);
  }

  function revalider() {
    if (typeof root.document === 'undefined') return;
    const z = root.document.getElementById('notifs'); if (!z) return;
    for (const n of z.querySelectorAll('.notif')) if (n._geste && n._geste !== geste && !valide(n._geste)) sortir(n);
  }

  /**
   * Dire ce qui vient de se passer.
   * @param {string} texte  une phrase ; vide, elle ferme la notification de la même clé
   * @param {{cle?:string, ton?:'ok'|'attente'|'retard', duree?:number, consigne?:boolean,
   *          annulable?:boolean, discret?:boolean, parDefaut?:boolean, defaire?:Function}} o
   *   cle       : la source (les cases, le barème…) ; son message suivant remplace celui-ci
   *   consigne  : reste jusqu'à ce qu'on la remplace ou la ferme
   *   annulable : false si la phrase ne parle pas du geste en cours
   *   discret   : rien à l'écran (par défaut, un enregistrement de routine)
   *   parDefaut : ne rien dire si le geste a déjà sa notification (plus précise)
   *   defaire   : comment défaire le geste, quand ce n'est pas entrée par entrée
   * @returns {{fermer:Function}}
   */
  function notifier(texte, o = {}) {
    const rien = { fermer() {} };
    if (silence || typeof root.document === 'undefined' || !root.document.body) return rien;
    texte = String(texte ?? '').trim();
    const p = pile();
    if (o.cle) for (const n of p.querySelectorAll('.notif')) if (n.dataset.cle === o.cle) retirer(n);
    if (!texte || (o.discret ?? ROUTINE.test(texte))) return rien;
    const g = o.annulable !== false && valide(geste) ? geste : null;
    if (g && o.parDefaut && [...p.children].some(n => n._geste === g)) return rien;
    if (g) for (const n of p.querySelectorAll('.notif')) if (n._geste === g) retirer(n);   // un geste, une notification
    const ton = o.ton || (REFUS.test(texte) ? 'retard' : '');
    const n = root.document.createElement('div');
    n.className = 'notif' + (ton ? ' ' + ton : '') + (o.consigne ? ' consigne' : '');
    if (o.cle) n.dataset.cle = o.cle;
    if (ton === 'retard') n.setAttribute('role', 'alert');
    n.innerHTML = (ton === 'retard' ? pic('alerte') : '')
      + `<p class="notif-texte">${esc(insecables(texte))}</p>`
      + (g ? '<button type="button" class="notif-annuler">Annuler</button>' : '')
      + `<button type="button" class="notif-fermer" aria-label="Fermer la notification" title="Fermer">${pic('croix')}</button>`;
    n._geste = g;
    const ms = duree(texte, { ...o, ton, annuler: !!g });
    let fige = 0;
    const armer = () => { clearTimeout(n._minuterie); if (ms && !fige) n._minuterie = setTimeout(() => sortir(n), ms); };
    n.addEventListener('pointerenter', () => { fige |= 1; clearTimeout(n._minuterie); });
    n.addEventListener('pointerleave', () => { fige &= ~1; armer(); });
    n.addEventListener('focusin', e => {
      if (!n.contains(e.relatedTarget)) n._retour = e.relatedTarget || n._retour;
      fige |= 2; clearTimeout(n._minuterie);
    });
    n.addEventListener('focusout', e => { if (!n.contains(e.relatedTarget)) { fige &= ~2; armer(); } });
    n.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); sortir(n); } });
    n.querySelector('.notif-fermer').addEventListener('click', () => sortir(n));
    const b = n.querySelector('.notif-annuler');
    if (b) b.addEventListener('click', () => { sortir(n); defaire(g, texte, o.defaire); });
    p.appendChild(n);
    while (p.children.length > MAX) retirer(p.firstElementChild);
    armer();
    return { fermer: () => sortir(n) };
  }

  /** Fermer la notification d'une source (la fin d'une consigne, par exemple). */
  function fermer(cle) {
    if (typeof root.document === 'undefined') return;
    const z = root.document.getElementById('notifs'); if (!z) return;
    for (const n of z.querySelectorAll('.notif')) if (n.dataset.cle === cle) sortir(n);
  }

  /* ---- les questions ---------------------------------------------------------- */

  let file = Promise.resolve();
  /**
   * Poser une question, avant un geste qui ne se défait pas d'un clic.
   * @param {string} texte  ce qui va se passer, et ce qui sera perdu
   * @param {{titre?:string, oui?:string, non?:string, danger?:boolean}} o
   *   oui : le geste en toutes lettres (« Supprimer le service ») ; danger : il détruit
   * @returns {Promise<boolean>} vrai si l'on a choisi de faire
   */
  function demander(texte, o = {}) {
    if (typeof root.document === 'undefined' || !root.document.body || typeof root.HTMLDialogElement === 'undefined')
      return Promise.resolve(typeof root.confirm === 'function' ? root.confirm(texte) : false);
    const suite = file.then(() => new Promise(resolve => {
      const retour = root.document.activeElement;
      const d = root.document.createElement('dialog');
      d.className = 'question'; d.id = 'question';
      d.setAttribute('aria-labelledby', 'question-titre'); d.setAttribute('aria-describedby', 'question-texte');
      d.innerHTML = `<form method="dialog">
        <h2 id="question-titre">${esc(insecables(o.titre || 'Avant de continuer'))}</h2>
        <p id="question-texte">${esc(insecables(texte))}</p>
        <div class="question-boutons">
          <button type="submit" class="btn" value="non">${esc(o.non || 'Ne rien changer')}</button>
          <button type="submit" class="btn ${o.danger ? 'btn-danger' : 'btn-play'}" value="oui">${esc(o.oui || 'Continuer')}</button>
        </div></form>`;
      root.document.body.appendChild(d);
      d.addEventListener('close', () => {
        const oui = d.returnValue === 'oui';
        d.remove();
        if (retour && retour.isConnected && typeof retour.focus === 'function') retour.focus({ preventScroll: true });
        resolve(oui);
      }, { once: true });
      d.showModal();
      // Un geste qui détruit : le focus va sur la sortie, pas sur le geste.
      d.querySelector(o.danger ? '[value=non]' : '[value=oui]').focus();
    }));
    file = suite.catch(() => {});
    return suite;
  }

  const api = { notifier, fermer, demander, inscrire, marquer, bouger, ROUTINE, REFUS, premiere };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyNotif = api;
})(typeof window !== 'undefined' ? window : globalThis);
