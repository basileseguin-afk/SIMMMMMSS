/* ==========================================================================
 *  LES CINQ RÉPONSES, À CÔTÉ DE LA SCÈNE (évolution 16 f, v1)
 *  ------------------------------------------------------------------------
 *  Le panneau de la vue en direct répond aux cinq questions de l'évolution 15,
 *  dans leur ordre, à l'heure rejouée :
 *    1. les personnes par service à cette heure (au travail, en pause, sans
 *       travail, présents) ;
 *    2. où ça coince à cette heure, et sur la journée ;
 *    3. la fin de chaque service et ses heures sup ;
 *    4. ce qui part en retard, avec la cause ;
 *    5. ce que change l'essai, s'il y en a deux, avec le choix « Référence /
 *       Essai » qui rejoue l'un ou l'autre à la même heure.
 *
 *  Ce module ne calcule rien : les réponses sont celles du module des
 *  réponses (moteur/reponses.js), dans les mots de la Synthèse
 *  (synthese-vue.js) ; les personnes à l'heure rejouée sont celles des
 *  indicateurs de charge (direct-etat.js) ; ce qui coince à cette heure, la
 *  lecture de direct-lire.js. Tout texte venu de l'unité est échappé.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const SY = () => (enNode ? require('./synthese-vue.js') : root.OrlySyntheseVue);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const LIRE = () => (enNode ? require('./direct-lire.js') : root.OrlyDirectLire);
  const fini = x => Number.isFinite(x), EPS = 1e-9;
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heure = t => SY().heure(t), duree = m => SY().duree(Math.max(0, m));
  const MOT_DU_TON = { critique: 'coince', avertissement: 'à surveiller' };
  /**
   * Les colonnes du tableau des personnes : au travail ; en pause, en appui ou en chemin (les mots de la légende : tous
   * les présents qui ne sont ni au travail ni sans travail — des chauffeurs sur la route en sont) ; sans travail ; présents.
   * Pour chaque service, les trois premières font les présents.
   */
  const ETATS = ['auTravail', 'ailleurs', 'sansTravail', 'presents'];
  const TITRES = { auTravail: 'Au travail', ailleurs: 'En pause, en appui ou en chemin', sansTravail: 'Sans travail', presents: 'Présents' };
  /** Les personnes d'un service (direct-etat.js) dans ces colonnes. */
  const colonnes = p => {
    const presents = (p && p.presents) || 0, auTravail = (p && p.auTravail) || 0, sansTravail = (p && p.sansTravail) || 0;
    return { auTravail, ailleurs: Math.max(0, presents - auTravail - sansTravail), sansTravail, presents };
  };

  /** Les services de la scène, dans l'ordre des zones du site : [{ id, nom }]. */
  const servicesDe = (site, noms) => ((site && site.zones) || []).flatMap(z => z.services).map(id => ({ id, nom: (noms && noms[id]) || id }));

  /**
   * 1. Les personnes par service à l'heure rejouée : au travail ; en pause, en appui ou en chemin ; sans travail ; présents
   * — celles des indicateurs de charge, entières (direct-etat.js) ; les trois premières colonnes font les présents. Le nom de chaque service est un bouton : il ouvre son détail. La dernière ligne
   * est l'unité ; dessous, la réponse de la journée (« Il faut … personnes, … sont présentes »).
   */
  function personnes(x) {
    const services = servicesDe(x.site, x.noms), total = Object.fromEntries(ETATS.map(m => [m, 0]));
    const lignes = services.map(s => {
      const p = colonnes(x.etat && x.etat.services[s.id]), ton = (x.tons && x.tons[s.id]) || { ton: 'neutre' }, mot = MOT_DU_TON[ton.ton];
      for (const m of ETATS) total[m] += p[m] || 0;
      return '<tr' + (mot ? ' class="dq-' + ton.ton + '"' : '') + '><th scope="row"><button type="button" class="dq-service" data-direct-service="' + esc(s.id) + '" aria-pressed="' + (s.id === x.selection) + '"'
        + (ton.pourquoi ? ' title="' + esc(ton.pourquoi) + '"' : '') + '>' + esc(s.nom) + '</button>' + (mot ? ' <span class="dq-ton">' + esc(mot) + '</span>' : '') + '</th>'
        + ETATS.map(m => '<td class="num" data-etat="' + m + '">' + (p[m] || 0) + '</td>').join('') + '</tr>';
    });
    const phrase = x.reponses ? SY().phrases(x.reponses)[0] : '';
    return '<section class="dq-question" data-question="1" aria-labelledby="dq-titre-1"><h3 id="dq-titre-1">1. Les personnes <small>à ' + esc(heure(x.t)) + '</small></h3>'
      + '<table class="dq-table dq-personnes"><thead><tr><th scope="col">Service</th>' + ETATS.map(m => '<th scope="col" class="num" data-etat="' + m + '">' + esc(TITRES[m]) + '</th>').join('') + '</tr></thead>'
      + '<tbody>' + lignes.join('') + '</tbody><tfoot><tr><th scope="row">Unité</th>' + ETATS.map(m => '<td class="num" data-etat="' + m + '">' + total[m] + '</td>').join('') + '</tr></tfoot></table>'
      + (phrase ? '<p class="mini-note dq-jour">Sur la journée : ' + esc(phrase) + '</p>' : '') + '</section>';
  }

  /**
   * 2. Où ça coince : à cette heure — les goulots du jour qui coincent maintenant, avec la phrase de la Synthèse ; les
   * services à surveiller et pourquoi (direct-lire.js) — puis sur la journée : la carte « Où ça coince » de la Synthèse.
   */
  function coince(x) {
    const maintenant = x.lu ? LIRE().goulotsA(x.lu, x.t) : [], noms = x.noms || {};
    const surveiller = Object.entries(x.tons || {}).filter(([, v]) => v.ton === 'avertissement');
    const ici = maintenant.length
      ? '<ul class="dq-liste dq-critique">' + maintenant.map(g => '<li><button type="button" class="dq-service" data-direct-service="' + esc(g.service) + '" aria-pressed="' + (g.service === x.selection) + '">' + esc(g.phrase) + '</button></li>').join('') + '</ul>'
      : '<p class="dq-rien">Rien ne coince à cette heure.</p>';
    const aussi = surveiller.length ? '<ul class="dq-liste dq-avertissement">' + surveiller.map(([id, v]) => '<li><b>' + esc(noms[id] || id) + '</b> — à surveiller : ' + esc(v.pourquoi) + '.</li>').join('') + '</ul>' : '';
    const carte = x.reponses ? SY().carteCoince(x.reponses) : null;
    return '<section class="dq-question" data-question="2" aria-labelledby="dq-titre-2"><h3 id="dq-titre-2">2. Où ça coince</h3>'
      + '<h4>À ' + esc(heure(x.t)) + '</h4>' + ici + aussi + '<h4>Sur la journée</h4><div class="dq-carte">' + (carte ? carte.corps : '') + '</div></section>';
  }

  /** 3. La fin de chaque service et ses heures sup : les lignes du module (un service par jour de travail), sa fin contre son horaire. */
  function fins(x) {
    const l = (x.reponses && x.reponses.fins.services) || [], lignes = (x.reponses && x.reponses.coince.services) || [], QUART = REP().DEPASSEMENT_MIN;
    const corps = l.map(s => {
      const mot = REP().motDeLaLigne({ service: s.service, jour: s.jour || 0 }, lignes), depasse = fini(s.depasse) && s.depasse >= QUART - EPS, sup = s.heuresSup ? s.heuresSup.total : 0;
      return '<tr' + (depasse ? ' class="dq-depasse"' : '') + '><th scope="row">' + esc(s.nom) + (mot ? ' <span class="sy-jour">' + esc(mot) + '</span>' : '') + '</th>'
        + '<td class="num">' + esc(heure(s.fin)) + (depasse ? ' <span class="dq-apres">+' + esc(duree(s.depasse)) + '</span>' : '') + '</td><td class="num">' + esc(heure(s.finHoraire)) + '</td>'
        + '<td class="num">' + (sup > EPS ? esc(duree(sup)) : '—') + '</td></tr>';
    });
    return '<section class="dq-question" data-question="3" aria-labelledby="dq-titre-3"><h3 id="dq-titre-3">3. La fin de chaque service</h3>'
      + '<table class="dq-table dq-fins"><thead><tr><th scope="col">Service</th><th scope="col" class="num">Finit à</th><th scope="col" class="num">Horaire</th><th scope="col" class="num">Heures sup</th></tr></thead><tbody>'
      + corps.join('') + '</tbody></table><p class="mini-note">Heures sup : personnes × heures.</p></section>';
  }

  /** 4. Ce qui part en retard, avec la cause : la carte de la Synthèse (les seules exceptions, les cinq premières, et les comptes). */
  function retards(x) {
    const carte = x.reponses ? SY().carteRetard(x.reponses) : null;
    return '<section class="dq-question" data-question="4" aria-labelledby="dq-titre-4"><h3 id="dq-titre-4">4. Ce qui part en retard</h3><div class="dq-carte">' + (carte ? carte.corps : '') + '</div></section>';
  }

  /**
   * 5. Ce que change l'essai, s'il y en a deux : la carte de la Synthèse (essai A → essai B), et le choix « Référence /
   * Essai » — la scène rejoue l'un ou l'autre à la même heure. `essais` : { A, B } (leurs réponses), ou null ; `montre` :
   * « A », « B », ou null (la journée en cours).
   */
  function essai(x) {
    const carte = x.essais ? SY().carteEssai(x.essais) : null;
    const corps = carte
      ? '<div class="dq-essais" role="group" aria-label="La journée que rejoue la scène">'
        + [['A', 'Référence'], ['B', 'Essai']].map(([cle, nom]) => '<button type="button" class="btn btn-mini" data-direct-essai="' + cle + '" aria-pressed="' + (x.montre === cle) + '">' + nom + '</button>').join('') + '</div>'
        + '<p class="mini-note dq-montre" role="status">' + esc(x.montre === 'A' ? 'La scène rejoue la référence (l’essai A), à la même heure.' : x.montre === 'B' ? 'La scène rejoue l’essai (l’essai B), à la même heure.'
          : 'La scène rejoue la journée en cours. Choisissez « Référence » ou « Essai » pour rejouer l’un des deux, à la même heure.') + '</p>'
        + '<div class="dq-carte">' + carte.corps + '</div>'
      : '<p class="mini-note">Retenez deux essais (Lire › Comparer) : la scène rejouera l’un ou l’autre à la même heure.</p>';
    return '<section class="dq-question" data-question="5" aria-labelledby="dq-titre-5"><h3 id="dq-titre-5">5. Ce que change l’essai</h3>' + corps + '</section>';
  }

  /**
   * Les cinq réponses, dans l'ordre. `x` : { site, noms, etat, tons, selection, t, lu, reponses, essais, montre } — le
   * site, les noms des services, la journée à l'heure rejouée (direct-etat.js), les teintes et la lecture (direct-lire.js),
   * les réponses de la journée rejouée, celles des deux essais retenus (ou null), l'essai que rejoue la scène.
   */
  function rendu(x) { return personnes(x) + coince(x) + fins(x) + retards(x) + essai(x); }

  const api = { ETATS, TITRES, colonnes, personnes, coince, fins, retards, essai, rendu };
  if (enNode) module.exports = api;
  else root.OrlyDirectQuestions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
