/* ==========================================================================
 *  LES AUTRES PAGES DES RÉSULTATS (version 1, évolution 14 d — README)
 *  ------------------------------------------------------------------------
 *  — Synthèse : la couleur suit l'état, pas la case (un retard nul n'est
 *    jamais en rouge) ; les libellés disent de quoi il s'agit (« commande la
 *    plus en retard », « vol le plus en retard ») ; une phrase de résumé en
 *    tête. La page est celle de simulation.js (commun aux deux versions) : la
 *    version 1 lui donne ce dessin-ci, sans le toucher.
 *  — Heure de chaque commande : la marge (prête avant − prête à), sa barre, le
 *    tri de la plus petite marge à la plus grande (ateliers.js dessine).
 *  — Vols prêts au départ : des points de 10 px, en couloirs ; le numéro au
 *    survol, et toujours pour un vol en retard (sim.js dessine).
 *  — Stocks et retours : le plus en stock d'abord, l'échelle des petites
 *    courbes dite une fois, une attente de plus de 24 h signalée ; la page est
 *    celle de temps.js (commun) : la version 1 la complète après coup.
 *  Rien n'est calculé ici qui ne le soit déjà : on lit les indicateurs.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pluriel = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);

  /* ---- la Synthèse ----------------------------------------------------------------- */

  /**
   * Les cartes et les listes de la Synthèse, depuis les indicateurs de la journée (`k`) : les mêmes nombres, écrits de
   * même ; leur couleur (`ton`) dit l'état de ce qu'ils comptent — ok, retard, attente, ou neutre quand il n'y a rien.
   */
  function synthese(k) {
    const pc = (n, part) => 'sur ' + n + (part != null ? ' · ' + part + ' %' : '');
    const suivies = k.classesSuivies || 0, enRetard = k.enRetard ?? (suivies - (k.aHeure || 0));
    const cles = [];
    if (k.volsSuivis) cles.push({ q: 'Vols chargés à l’heure', v: String(k.volsAHeure), sur: pc(k.volsSuivis, k.partVolsAHeure),
      ton: k.volsAHeure === k.volsSuivis ? 'ok' : 'retard', compte: true, page: 'v-departs' });
    cles.push({ q: 'Commandes prêtes à l’heure', v: suivies ? String(k.aHeure) : '—', sur: suivies ? pc(suivies, k.partAHeure) : 'aucune commande suivie',
      ton: !suivies ? 'neutre' : k.aHeure === suivies ? 'ok' : 'retard', compte: true, page: 'at-repas' });
    cles.push({ q: 'Commande la plus en retard', v: k.retardMax ? P().dureeLisible(k.retardMax) : suivies ? 'aucune' : '—',
      sur: k.retardMax ? 'après l’heure de son chargement' : '', ton: k.retardMax > 0 ? 'retard' : suivies ? 'ok' : 'neutre', page: 'at-repas' });
    cles.push({ q: 'Travail fourni', v: (k.hommeHeures || 0).toFixed(1).replace('.', ','), sur: 'heures de travail', ton: 'travail', page: 'at-planning' });
    const groupes = [];
    if (k.volsSuivis) {
      const non = k.volsSuivis - k.volsCharges;
      groupes.push({ titre: 'Vols', page: 'v-departs', lignes: [
        ['Vols non chargés', String(non), non > 0 ? 'retard' : 'neutre'],
        ['Vol le plus en retard', k.retardVolMax ? '+' + P().dureeLisible(k.retardVolMax) + ' après son départ' : k.volsCharges ? 'aucun' : '— aucun vol chargé',
          k.retardVolMax > 0 ? 'retard' : 'neutre']] });
    }
    groupes.push({ titre: 'Commandes', page: 'at-repas', lignes: [
      ['Commandes en retard', String(enRetard), enRetard > 0 ? 'retard' : 'neutre'],
      ...(k.pasFinies ? [['Commandes pas finies', String(k.pasFinies), 'retard']] : []),
      ['Dernière commande prête à', k.finDerniere != null && Number.isFinite(k.finDerniere) ? P().hhmm(k.finDerniere) : '—', 'heure']] });
    groupes.push({ titre: 'Équipes', page: 'j-stocks', lignes: [
      ['Temps passé à attendre', (k.attenteTotale >= 1 ? P().dureeLisible(k.attenteTotale) : 'aucun') + ', tous services', k.attenteTotale >= 1 ? 'attente' : 'neutre']] });
    return { cles, groupes };
  }

  /** La phrase en tête de la Synthèse : « 30 commandes à l’heure sur 32 ; 1 vol chargé en retard, de 8 min. » */
  function resume(k) {
    const suivies = k.classesSuivies || 0;
    if (!suivies && !k.volsSuivis) return 'Aucune commande suivie.';
    const bouts = [suivies ? pluriel(k.aHeure || 0, 'commande', 'commandes') + ' à l’heure sur ' + suivies + (k.pasFinies ? ', ' + pluriel(k.pasFinies, 'pas finie', 'pas finies') : '')
      : 'aucune commande suivie'];
    if (k.volsSuivis) {
      const tard = (k.volsCharges || 0) - (k.volsAHeure || 0), non = k.volsSuivis - (k.volsCharges || 0), v = [];
      if (tard > 0) v.push(pluriel(tard, 'vol chargé', 'vols chargés') + ' en retard, ' + (tard > 1 ? 'jusqu’à ' : 'de ') + P().dureeLisible(k.retardVolMax || 0));
      if (non > 0) v.push(pluriel(non, 'vol pas chargé', 'vols pas chargés'));
      if (!v.length) v.push(k.volsSuivis > 1 ? 'les ' + k.volsSuivis + ' vols chargés à l’heure' : 'le vol chargé à l’heure');
      bouts.push(v.join(', '));
    }
    return bouts.join(' ; ') + '.';
  }

  /** La Synthèse dans `box` (le même dessin que simulation.js, ses couleurs et ses mots revus). */
  function rendreSynthese(box, k, o) {
    if (!box) return;
    if (!k) { box.innerHTML = '<p class="mini-note">Rien à résumer : aucune équipe ne prépare encore de commande.</p>'; return; }
    const { cles, groupes } = synthese(k), I = root.OrlyIcones, fleche = I ? I.ico('droite') : '→';
    const titreDe = id => (o && o.titreDe ? o.titreDe(id) : '') || 'le détail';
    const carte = c => '<button type="button" class="bilan-cle' + (c.compte ? ' bilan-compte' : '') + '" data-ton="' + c.ton + '" data-page="' + c.page + '" title="Voir ' + esc(titreDe(c.page)) + '">'
      + '<span class="bilan-q">' + esc(c.q) + '</span>'
      + '<span class="bilan-chiffre"><b class="bilan-v">' + esc(c.v) + '</b>' + (c.sur ? ' <span class="bilan-sur">' + esc(c.sur) + '</span>' : '') + '</span>'
      + '<span class="bilan-vers" aria-hidden="true">' + fleche + '</span></button>';
    const groupe = g => '<section class="bilan-groupe" aria-label="' + esc(g.titre) + '"><h4>' + esc(g.titre) + '</h4><dl class="bilan">'
      + g.lignes.map(([q, v, ton]) => '<div data-ton="' + ton + '"><dt><button type="button" class="bilan-lien" data-page="' + g.page + '">' + esc(q) + '</button></dt><dd>' + esc(v) + '</dd></div>').join('')
      + '</dl></section>';
    const sans = k.classesAbsentes ? '<p class="bilan-probleme" role="note">' + (I ? I.ico('alerte') : '')
      + '<span><b>' + esc(pluriel(k.classesAbsentes, 'commande que personne ne prépare', 'commandes que personne ne prépare')) + '</b>'
      + ' — un problème à compléter : elles ne sont pas parmi les commandes comptées ici.</span>'
      + '<button type="button" class="btn btn-sm" data-page="mu-services">Cocher dans un service ' + fleche + '</button></p>' : '';
    box.innerHTML = '<p class="bilan-resume">' + esc(resume(k)) + '</p><div class="bilan-cles">' + cles.map(carte).join('') + '</div>' + sans
      + '<div class="bilan-groupes">' + groupes.map(groupe).join('') + '</div>';
  }

  /* ---- Heure de chaque commande : la marge ------------------------------------------- */

  /** La marge d'une commande, en minutes : prête avant − prête à ; null si elle n'est pas prête ou n'a pas d'équipe. */
  function marge(v) {
    if (!v || v.absente || v.fin == null || !Number.isFinite(v.echeance)) return null;
    return Math.round((v.echeance - v.fin) * 10) / 10;
  }
  // Une seule écriture du temps (évolution 15 c) : « 45 min » sous une heure, « 2 h 05 » au-delà.
  const ecrireMarge = m => (m == null ? '—' : Math.abs(m) < 0.5 ? '0 min' : (m > 0 ? '+' : '−') + P().dureeLisible(Math.abs(m)));
  /** La barre d'une marge : sa largeur (en % de la plus grande marge, en valeur absolue), et son signe. */
  function barreMarge(m, max) {
    if (m == null) return null;
    const largeur = max > 0 ? Math.round(Math.min(1, Math.abs(m) / max) * 100) : 0;
    return { largeur, signe: Math.abs(m) < 0.5 ? 'nulle' : m > 0 ? 'positive' : 'negative' };
  }

  /** Les commandes triées : `cle` 'marge' (le défaut), 'avant', 'a', 'nom' ; `sens` 1 ou −1. Sans valeur : à la fin. */
  function trier(classes, par, cle = 'marge', sens = 1) {
    const val = c => {
      const v = par[c.id] || {};
      if (cle === 'marge') return marge(v);
      if (cle === 'avant') return Number.isFinite(c.echeance) ? c.echeance : Number.isFinite(v.echeance) ? v.echeance : null;
      if (cle === 'a') return v.fin == null ? null : v.fin;
      return null;
    };
    return classes.map((c, i) => ({ c, i, v: val(c) })).sort((x, y) => {
      if (cle === 'nom') return sens * String(x.c.id).localeCompare(String(y.c.id)) || x.i - y.i;
      if (x.v == null || y.v == null) return (x.v == null) - (y.v == null) || x.i - y.i;
      return sens * (x.v - y.v) || x.i - y.i;
    }).map(x => x.c);
  }

  /* ---- Vols prêts au départ : les points de la frise ----------------------------------- */

  const EN_RETARD = new Set(['late', 'overdue']);
  const RAYON = 5, ECART = 3, LARGEUR_CHIFFRE = 7.4;
  /**
   * Les points de la frise, en couloirs pour que deux points ne se couvrent pas : { d, e, x, c, ecrit, fin }. Le numéro
   * d'un vol en retard est toujours écrit, à droite de son point : sa place compte dans le couloir.
   */
  function couloirs(vols, etatDe, x) {
    const fins = [];
    return vols.slice().sort((a, b) => a.depart - b.depart || String(a.id).localeCompare(String(b.id))).map(d => {
      const e = etatDe(d), ecrit = EN_RETARD.has(e), px = x(d.depart);
      const fin = px + RAYON + (ecrit ? 4 + String(d.id).length * LARGEUR_CHIFFRE : 0) + ECART;
      let c = fins.findIndex(f => px - RAYON >= f);
      if (c < 0) { c = fins.length; fins.push(0); }
      fins[c] = fin;
      return { d, e, x: px, c, ecrit, fin };
    });
  }

  /* ---- Stocks et retours ----------------------------------------------------------------- */

  /** L'ordre des lignes des stocks : 'stock' (le plus en stock, le défaut) ou 'long' (le plus long) ; à égalité, celui du moteur. */
  function ordreStocks(liens, cle = 'stock') {
    const v = l => (cle === 'long' ? l.dureeMax : l.repasMax) || 0;
    return liens.map((l, i) => i).sort((a, b) => v(liens[b]) - v(liens[a]) || a - b);
  }
  const echelleStocks = liens => 'hauteur : de 0 à ' + Math.round(Math.max(1, ...liens.map(l => l.repasMax || 0))).toLocaleString('fr-FR') + ' repas';
  const plusDe24h = l => (l.dureeMax || 0) > 1440;
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);

  /**
   * Le bouchon de la plonge (évolution 15 c) : seulement s'il reste du sale le soir, ou si l'attente la plus longue passe
   * le seuil d'attente. temps.js (commun aux deux versions) le dit dès une heure d'attente : la version 1 le corrige
   * d'après ce seuil — l'étiquette, et la couleur des deux tuiles qui le portent, retirées ou ajoutées. Correction 18 (a) :
   * l'attente est celle d'un arrivage (`plonge` : celle des réponses — à une plonge par vol, un vol revenu qui attend son
   * tunnel) ; au débit, sans arrivage, celle du moteur, par unité. Évolution 18, correction 19 (b) : pour une plonge par
   * vol, le sale du soir se lit dans `plonge.lendemain` — elle n'est en bouchon pour lui que si la première équipe du
   * lendemain ne peut pas l'absorber pendant sa présence (`absorbe`), comme elle coince dans la Synthèse ; un reste absorbé
   * est le fonctionnement ordinaire.
   */
  const bouchon = (p, seuils, plonge) => {
    if (!p) return false;
    const attente = plonge && Number.isFinite(plonge.attenteMax) ? plonge.attenteMax : (p.attenteMax || 0);
    const reste = plonge && plonge.lendemain ? plonge.lendemain.vols > 0 && !plonge.lendemain.absorbe : (p.resteSale || 0) > 0;
    return reste || attente > seuils.attenteLot + 1e-9;
  };
  function corrigerBouchon(box, p, seuils, plonge) {
    if (!box || !p) return;
    const oui = bouchon(p, seuils, plonge), etiquette = [...box.querySelectorAll('.tp-etiquette.alerte')].find(b => /Bouchon/.test(b.textContent));
    if (!oui && etiquette) {
      const apres = etiquette.nextSibling;
      if (apres && apres.nodeType === 3) apres.textContent = apres.textContent.replace(/^ /, '');
      etiquette.remove();
    }
    const phrase = box.querySelector('.tp-phrase');
    if (oui && !etiquette && phrase) phrase.insertAdjacentHTML('afterbegin', '<b class="tp-etiquette alerte">▲ Bouchon</b> ');
    for (const t of box.querySelectorAll('.tp-tuile')) {
      const lab = (t.querySelector('span') || {}).textContent;
      if (lab === 'Le plus de sale pas encore lavé' || lab === 'Attente la plus longue') t.classList.toggle('alerte', oui);
      // Le sale du soir d'une plonge par vol (correction 19 b) : il se lave le lendemain — temps.js, commun, le dit « jamais
      // lavé ». Une alerte seulement si la première équipe du lendemain ne peut pas l'absorber pendant sa présence.
      if (lab === 'Reste sale le soir' && plonge && plonge.lendemain) {
        t.classList.toggle('alerte', !plonge.lendemain.absorbe);
        const note = t.querySelector('em');
        if (note) note.textContent = plonge.lendemain.absorbe ? 'lavé le lendemain matin' : 'plus que le matin du lendemain ne peut en laver';
      }
    }
  }

  /**
   * La page des stocks, complétée (temps.js l'a dessinée) : les lignes triées (le plus en stock d'abord, ou le plus
   * long), les en-têtes qui trient, l'échelle des petites courbes dite une fois. Une alerte ne s'affiche que si un seuil
   * est dépassé (évolution 15 c) : un stock plus long que la durée maximale réglée (aucune tant qu'elle ne l'est pas) ;
   * le bouchon de la plonge. `seuils` : les seuils d'alerte (sans eux, les défauts) ; `plonge` : la plonge des réponses
   * (l'attente d'un arrivage), si on l'a.
   */
  const triStocks = { cle: 'stock' };
  function completerStocks(box, r, seuils, plonge) {
    const S = seuils || REP().SEUILS_DEFAUT;
    corrigerBouchon(box, r && r.plonge, S, plonge);
    const table = box && box.querySelector('.tp-table'), liens = (r && r.stocks && r.stocks.parLien) || [];
    if (!table || !liens.length) return;
    const corps = table.tBodies[0], lignes = [...corps.rows], ths = table.tHead.rows[0].cells;
    lignes.forEach((tr, i) => {
      tr.dataset.lien = i;
      // Une quantité porte son unité (évolution 15 c) : un lien qui ne porte que de l'équipement (armement, dotation) ne
      // s'écrit pas « 0 repas », mais ses commandes d'équipement.
      const q = tr.cells[1];
      if (q && !(liens[i].repasMax > 0) && !q.dataset.equipement) {
        const n = liens[i].sejours || 0, petit = q.querySelector('small');
        q.dataset.equipement = '1';
        q.innerHTML = '<b>' + n + '</b> ' + (n > 1 ? 'commandes' : 'commande') + ' d’équipement' + (petit ? petit.outerHTML : '');
      }
      if (!REP().stockTropLong(liens[i].dureeMax, S)) return;
      tr.classList.add('tp-24h');
      const td = tr.cells[2];
      if (td && !td.querySelector('.tp-plus24')) td.insertAdjacentHTML('beforeend', '<span class="tp-plus24">' + (root.OrlyIcones ? root.OrlyIcones.ico('alerte') : '')
        + 'plus de ' + esc(P().dureeLisible(S.dureeStockMax)) + '</span>');
    });
    const ranger = () => {
      for (const i of ordreStocks(liens, triStocks.cle)) corps.appendChild(lignes[i]);
      for (const [n, cle] of [[1, 'stock'], [2, 'long']]) {
        ths[n].setAttribute('aria-sort', triStocks.cle === cle ? 'descending' : 'none');
        const b = ths[n].querySelector('button'); if (b) b.setAttribute('aria-pressed', String(triStocks.cle === cle));
      }
    };
    for (const [n, cle] of [[1, 'stock'], [2, 'long']]) {
      if (ths[n].querySelector('button')) continue;
      const mot = ths[n].textContent;
      ths[n].innerHTML = '<button type="button" class="tp-tri" data-tp-tri="' + cle + '" title="Trier : ' + esc(mot.toLowerCase()) + ' d’abord">' + esc(mot) + '</button>';
      ths[n].querySelector('button').addEventListener('click', () => { triStocks.cle = cle; ranger(); });
    }
    const fig = ths[4];
    if (fig && !fig.querySelector('.tp-echelle')) fig.insertAdjacentHTML('beforeend', ' <small class="tp-echelle">· ' + esc(echelleStocks(liens)) + '</small>');
    ranger();
  }

  const api = { synthese, resume, rendreSynthese, marge, ecrireMarge, barreMarge, trier, EN_RETARD, RAYON, couloirs, ordreStocks, echelleStocks, plusDe24h, bouchon, completerStocks };
  if (enNode) module.exports = api;
  else root.OrlyResultatsVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
