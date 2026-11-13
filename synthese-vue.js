/* ==========================================================================
 *  LA SYNTHÈSE (version 1, évolution 15 b — README, « Lire la Synthèse »)
 *  ------------------------------------------------------------------------
 *  La page répond aux cinq questions du contrat des résultats
 *  (docs/CAHIER_DES_CHARGES.md, § 6 bis), dans leur ordre :
 *    — en tête, deux phrases au plus, tirées des réponses ;
 *    — « Les services », dans l'ordre du chemin, une ligne par service et
 *      jour de travail, qui dit son jour (correction 17 a) : besoin, présents,
 *      écart, matin et après-midi, pic, occupation, file, fin, heures sup ;
 *    — la courbe de la journée : présents et au travail, lots à faire,
 *      départs des vols, par créneau de 15 min ;
 *    — trois cartes : où ça coince, ce qui part en retard, ce que change
 *      l'essai (seulement avec deux essais).
 *  Rien n'est calculé ici : on lit les réponses (moteur/reponses.js) et les
 *  indicateurs de charge (moteur/indicateurs.js). Une couleur de statut ne
 *  dit qu'un état au-delà de son seuil ; le rouge, seulement un retard.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const PE = () => (enNode ? require('./moteur/periode.js') : root.OrlyPeriode);
  const IND = () => (enNode ? require('./moteur/indicateurs.js') : root.OrlyIndicateurs);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JOUR = 1440, EPS = 1e-9;
  const fini = x => Number.isFinite(x);

  /* ---- les mots et les nombres ------------------------------------------------------ */

  /** Un nombre de personnes : entier tel quel, sinon une décimale, à la française. */
  const nombre = x => (!fini(x) ? '—' : Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','));
  const pluriel = (n, un, plusieurs) => nombre(n) + ' ' + (Math.abs(n) >= 2 ? plusieurs : un);
  const heure = t => (fini(t) ? P().hhmm(t) : '—');
  const duree = m => P().dureeLisible(m);
  const signe = x => (x > EPS ? '+' : x < -EPS ? '−' : '') + nombre(Math.abs(x));
  /** Ce qu'une équipe attendait avant son premier lot, en mots : la mise à disposition nommée, avec son heure ; l'amont nommé. */
  function motsDeLAttendu(a) {
    if (!a) return '';
    if (a.quoi === 'ouverture') return 'attend l’ouverture de ' + (a.nom || 'la mise à disposition') + ', à ' + heure(a.a);
    if (a.quoi === 'amont') return 'attend ' + (a.nom || 'son amont') + ', jusqu’à ' + heure(a.a);
    return 'attend son matériel';
  }
  /** La cause d'un service qui coince, en mots. */
  function motsDeLaCause(c) {
    if (!c) return '';
    if (c.code === 'ouverture' || c.code === 'amont') return motsDeLAttendu({ quoi: c.code, nom: c.nom, a: c.a });
    if (c.code === 'materiel') return 'ses arrivages attendent leur matériel';
    if (c.code === 'limite') return 'finit dans son horaire, mais après la limite d’une commande ou d’un vol';
    if (c.code === 'aval') return 'ses lots finissent avant la limite : la commande ou le vol prend son retard en aval';
    return 'la charge du jour ne tient pas dans l’horaire';
  }
  /** « l'équipe … finit à hh:mm pour hh:mm » : l'équipe qui dépasse, avec sa propre fin et son propre horaire. */
  const motsDeLEquipe = e => 'l’équipe ' + e.nom + ' finit à ' + heure(e.fin) + ' pour ' + heure(e.finHoraire);
  /**
   * Ce qui fait qu'un service coince : son dépassement, ce qu'il fait partir en retard. `sujet` : « il » dans une
   * phrase. `avecEquipe` : nomme aussi l'équipe qui dépasse (la carte « Où ça coince »).
   */
  function consequences(g, sujet, avecEquipe) {
    const QUART = REP().DEPASSEMENT_MIN, l = [];
    if (g.depasse >= QUART - EPS) l.push((sujet ? sujet + ' ' : '') + 'finit ' + duree(g.depasse) + ' après son horaire' + (avecEquipe && g.equipe ? ' : ' + motsDeLEquipe(g.equipe) : ''));
    if (g.enRetard > 0) l.push(l.length ? 'fait partir ' + pluriel(g.enRetard, 'commande ou vol', 'commandes ou vols') + ' en retard'
      : pluriel(g.enRetard, 'commande ou vol part', 'commandes ou vols partent') + ' en retard par ses lots');
    return l.join(' et ');
  }

  /** Les vols et les commandes des exceptions, comptés une fois chacun. */
  function compteRetards(exceptions) {
    const vols = new Set(exceptions.filter(x => x.type !== 'commande-en-retard').map(x => x.id));
    return { vols: vols.size, commandes: exceptions.filter(x => x.type === 'commande-en-retard').length };
  }

  /** En tête : deux phrases au plus — combien de personnes ; où ça coince et ce qui part en retard. */
  function phrases(rep) {
    const t = rep.personnes.total;
    // Les postes fixes (permanents, appui, handling) ne comptent pas dans « il faut » : la phrase dit combien ils sont (correction 17 c).
    // Hors du besoin : les postes fixes, et les équipes dont le besoin ne se mesure pas (correction 18 a).
    const hors = t.fixes > EPS ? ', dont ' + nombre(t.fixes) + ' en ' + motsHorsBesoin(t.fixes, t.nonMesures) : '';
    const un = 'Il faut ' + pluriel(t.besoin, 'personne', 'personnes') + ', ' + nombre(t.presents) + (t.presents >= 2 ? ' sont présentes' : ' est présente') + hors + '.';
    const g = rep.coince.goulot, n = compteRetards(rep.exceptions), autres = ((rep.coince.goulots || []).length || (g ? 1 : 0)) - 1;
    // Le goulot dit son jour de travail comme sa ligne du tableau (correction 17 a), et ce qui en fait un goulot (correction 18 a) :
    // « Cuisine (veille) coince : il finit 40 min après son horaire ».
    const mot = g ? motDuGoulot(rep.coince) : null;
    const coince = g ? g.nom + (mot ? ' (' + mot + ')' : '') + ' coince : ' + consequences(g, 'il')
      + (autres > 0 ? ' (et ' + pluriel(autres, 'autre service', 'autres services') + ')' : '') : 'Rien ne coince';
    const qui = [n.vols ? pluriel(n.vols, 'vol', 'vols') : null, n.commandes ? pluriel(n.commandes, 'commande', 'commandes') : null].filter(Boolean);
    const retard = !qui.length ? 'rien ne part en retard' : qui.join(' et ') + (n.vols + n.commandes >= 2 ? ' partent en retard' : ' part en retard');
    return [un, coince + ' ; ' + retard + '.'];
  }

  /** « postes fixes », « postes non mesurés », ou les deux : ce qui ne compte pas dans le besoin. */
  function motsHorsBesoin(fixes, nonMesures) {
    const nm = nonMesures > EPS, fx = fixes - (nonMesures || 0) > EPS, s = fixes >= 2;
    if (nm && fx) return 'postes fixes ou non mesurés';
    if (nm) return s ? 'postes non mesurés' : 'poste non mesuré';
    return s ? 'postes fixes' : 'poste fixe';
  }

  /* ---- « Les services » ----------------------------------------------------------- */

  /** Le jour de travail, en mots : « J−2 », « veille », « jour des vols », « J+1 » (moteur/reponses.js). */
  const motDuJour = j => REP().motDuJour(j);
  const cleDe = s => s.service + '|' + s.jour;
  /**
   * Le mot du jour du goulot, celui de sa ligne : toujours hors du jour des vols ; « jour des vols » quand son service a
   * d'autres lignes ; sinon rien (une journée où le service ne travaille que le jour des vols se lit comme avant).
   */
  const motDuGoulot = c => (c && c.goulot ? REP().motDeLaLigne({ service: c.goulot.service, jour: c.goulot.jour || 0 }, c.services || []) : null);

  /**
   * Les lignes du tableau, dans l'ordre du chemin (`ordre` : les services de l'amont vers l'aval), une par service et
   * jour de travail ; chacune a sa file, sa fin et ses heures sup (réponses 2 et 3, par service et jour : correction 17 a),
   * et dit son jour (`mot`) : toujours hors du jour des vols ; le jour des vols, quand le service a plusieurs lignes. Une
   * ligne sans personne ni besoin ni travail ne s'affiche pas.
   */
  function lignes(rep, ordre) {
    const rang = id => { const i = (ordre || []).indexOf(id); return i < 0 ? Infinity : i; };
    const coince = new Map(rep.coince.services.map(s => [cleDe(s), s])), fins = new Map(rep.fins.services.map(s => [cleDe(s), s]));
    const sans = new Map(((rep.sansTravail || {}).services || []).map(s => [cleDe(s), s]));
    const vivantes = rep.personnes.services.filter(s => s.presents > EPS || s.besoin > 0 || (fins.get(cleDe(s)) || {}).fin != null)
      .slice().sort((p, q) => rang(p.service) - rang(q.service) || String(p.service).localeCompare(String(q.service)) || p.jour - q.jour);
    return vivantes.map(s => ({ ...s, mot: REP().motDeLaLigne(s, vivantes), coince: coince.get(cleDe(s)) || null, fin: fins.get(cleDe(s)) || null, sans: sans.get(cleDe(s)) || null }));
  }

  /**
   * Les tons de statut d'une ligne : seulement ce qui passe son seuil (l'écart, l'attente d'un arrivage, l'occupation) ; la
   * fin, seulement si le dépassement atteint le quart d'heure (une règle fixe, correction 18 a) ; jamais le rouge.
   */
  function tons(l, seuils) {
    return { ecart: l.signale ? 'attente' : null,
      attente: l.coince && l.coince.attenteMax && l.coince.attenteMax.minutes > seuils.attenteLot + EPS ? 'attente' : null,
      occupation: fini(l.occupation) && l.occupation * 100 > seuils.occupation + EPS ? 'attente' : null,
      fin: l.fin && l.fin.depasse >= REP().DEPASSEMENT_MIN - EPS ? 'attente' : null };
  }

  const ICONE = () => (root.OrlyIcones ? root.OrlyIcones.ico('alerte') : '');
  /** Une case au-delà de son seuil : sa couleur, une icône et des mots, jamais la couleur seule. */
  const marque = (ton, texte) => (ton ? ' data-ton="' + ton + '"' : '') + '>' + (ton ? ICONE() + '<span class="sr-only">au-delà du seuil : </span>' : '') + texte;

  /** L'écart, sa barre centrée sur zéro (`max` : le plus grand écart du tableau, en valeur absolue). */
  function caseEcart(l, ton, max) {
    if (l.fixe || !fini(l.ecart)) return '<td class="num sy-ecart sy-vide">—</td>';
    const part = max > EPS ? Math.min(1, Math.abs(l.ecart) / max) * 50 : 0, cote = l.ecart < 0 ? 'right:50%' : 'left:50%';
    const barre = '<span class="sy-ecart-barre" aria-hidden="true"><i style="' + cote + ';width:' + part.toFixed(1) + '%"></i></span>';
    return '<td class="num sy-ecart"' + marque(ton, '<span class="sy-v">' + esc(signe(l.ecart)) + '</span>' + barre) + '</td>';
  }
  /** L'occupation, sa barre de 0 à 100 %. */
  function caseOccupation(l, ton) {
    if (!fini(l.occupation)) return '<td class="num sy-vide">—</td>';
    const pc = Math.round(l.occupation * 100);
    return '<td class="num sy-occ"' + marque(ton, '<span class="sy-v">' + pc + ' %</span><span class="sy-occ-barre" aria-hidden="true"><i style="width:'
      + Math.min(100, pc) + '%"></i></span>') + '</td>';
  }
  // Au travail au plus / présents ; une équipe sans travail mesuré (une mise à disposition) : « — / présents ».
  const moitie = m => (m && fini(m.presents) ? '<span class="sy-v">' + esc(fini(m.auTravail) ? nombre(m.auTravail) : '—') + '</span><span class="sy-sur"> / ' + esc(nombre(m.presents)) + '</span>' : '—');

  /**
   * Le besoin d'une ligne (correction 17 c) : « fixe » pour un service permanent, d'appui ou un handling, sans besoin calculé
   * depuis une charge ; sinon son besoin, et ce qu'il a de postes fixes à côté.
   */
  function caseBesoin(l) {
    if (l.fixe) return '<td class="num sy-fixe" title="Un poste fixe : pas de besoin calculé depuis une charge, pas d’écart ; il ne compte pas dans « Il faut ».">fixe</td>';
    // Toutes ses équipes ont un besoin qui ne se mesure pas (pas de travail au barème) : « non mesuré », sans écart (correction 18 a).
    if (l.nonMesure) return '<td class="num sy-fixe" title="Un besoin qui ne se mesure pas : aucun travail au barème pour ses équipes ; il ne compte pas dans « Il faut ».">non mesuré</td>';
    const nm = l.nonMesures > EPS, fx = l.fixes - (l.nonMesures || 0) > EPS, s = l.fixes >= 2;
    const mots = nm && fx ? ' fixes ou non mesurés' : nm ? (s ? ' non mesurés' : ' non mesuré') : (s ? ' fixes' : ' fixe');
    return '<td class="num">' + esc(nombre(l.besoin)) + (l.fixes > EPS ? '<small>+ ' + esc(nombre(l.fixes)) + mots + '</small>' : '') + '</td>';
  }
  /** Les présents d'une ligne ; un handling à chauffeurs le dit : ce sont eux que comptent aussi le matin et l'après-midi. */
  const casePresents = l => '<td class="num">' + esc(nombre(l.presents)) + (l.chauffeurs ? '<small>chauffeurs</small>' : '') + '</td>';
  /** Ce qui n'est pas compté, ligne par ligne : les personnes saisies à l'équipe d'un handling à chauffeurs. */
  const horsCompte = ls => ls.filter(l => l.chauffeurs && l.horsCompte > EPS).map(l => l.nom + ' : les présents sont ses chauffeurs ; '
    + (l.horsCompte >= 2 ? 'les ' + nombre(l.horsCompte) + ' personnes saisies à l’équipe ne sont pas comptées.' : 'la personne saisie à l’équipe n’est pas comptée.'));

  /**
   * Les personnes sans travail d'une ligne (correction 18 a) : les heures (personnes × heures) et leur part de la présence,
   * avec une barre, sans couleur d'alerte ; au survol, les trois moments et ce que l'équipe attendait. Une attente de
   * l'ouverture d'une mise à disposition se lit sans survol : c'est un réglage à voir au premier coup d'œil.
   */
  function caseSansTravail(l) {
    const s = l.sans;
    if (!s || !fini(s.minutes)) return '<td class="num sy-vide">—</td>';
    const pc = fini(s.part) ? Math.round(s.part * 100) : null, attendus = (s.attendait || []).map(motsDeLAttendu);
    const moments = 'Des personnes sont sans travail — avant le premier lot : ' + duree(s.avant) + ' ; entre deux lots : ' + duree(s.entre) + ' ; après le dernier lot : ' + duree(s.apres)
      + ' (personnes × heures).' + (attendus.length ? ' Avant le premier lot : ' + attendus.join(' ; ') + '.' : '');
    const ouverture = (s.attendait || []).find(a => a.quoi === 'ouverture');
    return '<td class="num sy-sans" title="' + esc(moments) + '"><span class="sy-v">' + esc(duree(s.minutes)) + '</span>' + (pc === null ? '' : '<span class="sy-sur"> · ' + pc + ' %</span>'
      + '<span class="sy-sans-barre" aria-hidden="true"><i style="width:' + Math.min(100, pc) + '%"></i></span>')
      + (ouverture ? '<small class="sy-attend">' + esc(motsDeLAttendu(ouverture)) + '</small>' : '') + '</td>';
  }
  /**
   * L'attente d'un arrivage (correction 18 a) : le nombre d'arrivages du jour, puis l'attente la plus longue et son heure ;
   * « — » si aucun n'a attendu ; la couleur de statut au-delà du seuil d'attente.
   */
  function caseArrivage(l, ton) {
    const c = l.coince;
    if (!c || !fini(c.arrivages)) return '<td class="sy-arrivage sy-vide">—</td>';
    const a = c.attenteMax, n = '<span class="sy-v">' + esc(pluriel(c.arrivages, 'arrivage', 'arrivages')) + '</span>';
    const titre = a ? 'Un arrivage attend ' + duree(a.minutes) + ', de ' + heure(a.de) + ' à ' + heure(a.a) + ' (' + pluriel(a.lots, 'lot', 'lots') + ', dont ' + P().enClair(a.lot || '') + ')'
      + (c.file ? ' ; jusqu’à ' + pluriel(c.file.arrivages, 'arrivage attend', 'arrivages attendent') + ' en même temps, à ' + heure(c.file.a) : '') + '.' : 'Aucun arrivage n’a attendu.';
    return '<td class="sy-arrivage"' + (ton ? '' : ' title="' + esc(titre) + '"') + marque(ton, n + '<small' + (ton ? ' title="' + esc(titre) + '"' : '') + '>'
      + (a ? esc(duree(a.minutes)) + ' à ' + esc(heure(a.de)) : '—') + '</small>') + '</td>';
  }
  /**
   * La case de la fin d'une ligne : la fin de son service ce jour de travail-là ; dessous, l'horaire de ses équipes qui
   * travaillent — ou, quand une équipe dépasse, cette équipe, avec sa propre fin et son propre horaire — puis ses heures sup
   * (personnes × heures), dans la même case : le tableau tient sur la largeur d'un écran de 1 366 px.
   */
  function caseDeLaFin(l, ton) {
    const f = l.fin, e = f && f.equipeQuiDepasse;
    const sous = !f || f.finHoraire == null ? '' : e ? '<small class="sy-depasse">' + esc(motsDeLEquipe(e)) + '</small>' : '<small>horaire ' + esc(heure(f.finHoraire)) + '</small>';
    const fin = f && f.fin != null ? '<span class="sy-v">' + esc(heure(f.fin)) + '</span>' + sous : f && f.finHoraire != null ? '<span class="sy-sur">pas fini</span>' : '—';
    const hs = f && f.heuresSup.total > EPS ? '<small class="sy-hs" title="Heures sup, en personnes × heures">heures sup ' + esc(duree(f.heuresSup.total)) + '</small>' : '';
    return '<td class="sy-fin"' + marque(ton, fin + hs) + '</td>';
  }

  /** Le tableau « Les services ». Un clic sur une ligne ouvre ce service dans « Planning des équipes ». */
  function tableau(rep, ordre) {
    const ls = lignes(rep, ordre), max = Math.max(0, ...ls.map(l => Math.abs(l.ecart)));
    if (!ls.length) return '<p class="mini-note">Aucun service n’a de personne ni de travail ce jour-là.</p>';
    const jour = mot => (mot ? ' <span class="sy-jour">' + esc(mot) + '</span>' : '');
    const ligne = l => {
      const t = tons(l, rep.seuils), pic = l.pic && l.pic.personnes > 0 ? '<span class="sy-v">' + esc(nombre(l.pic.personnes)) + '</span><span class="sy-sur"> à ' + esc(heure(l.pic.a)) + '</span>' : '—';
      return '<tr data-service="' + esc(l.service) + '" data-jour="' + l.jour + '"><th scope="row"><button type="button" class="sy-service" data-page="at-planning" data-pg-viser="'
        + esc(l.service) + '" data-pg-viser-jour="' + l.jour + '" title="Voir ce service dans le planning des équipes">' + esc(l.nom) + '</button>' + jour(l.mot) + '</th>'
        + caseBesoin(l) + casePresents(l) + caseEcart(l, t.ecart, max)
        + '<td class="num">' + moitie(l.matin) + '</td><td class="num">' + moitie(l.apresMidi) + '</td><td class="num">' + pic + '</td>'
        + caseOccupation(l, t.occupation) + caseSansTravail(l) + caseArrivage(l, t.attente) + caseDeLaFin(l, t.fin) + '</tr>';
    };
    return '<div class="table-scroll sy-cadre"><table class="svc-table sy-table"><caption class="sr-only">Les services, de l’amont vers l’aval</caption><thead><tr>'
      + '<th scope="col">Service</th><th scope="col" class="num">Besoin</th><th scope="col" class="num">Présents</th><th scope="col" class="num">Écart</th>'
      + '<th scope="col" class="num" title="Avant 13:00 du jour de travail : au travail au plus / présents">Matin</th><th scope="col" class="num" title="À partir de 13:00 : au travail au plus / présents">Après-midi</th>'
      + '<th scope="col" class="num">Pic au travail</th><th scope="col" class="num">Occupation</th>'
      + '<th scope="col" class="num" title="Les heures (personnes × heures) sans travail, et leur part de la présence">Personnes sans travail</th>'
      + '<th scope="col" title="Un arrivage : les lots livrés ensemble. Son attente va de sa livraison au début de son premier lot">Attente d’un arrivage</th><th scope="col" title="La fin du dernier lot ; dessous, l’horaire des équipes qui travaillent ce jour-là (ou l’équipe qui le dépasse), puis les heures sup, en personnes × heures">Fin et heures sup</th>'
      + '</tr></thead><tbody>' + ls.map(ligne).join('') + '</tbody></table></div>'
      + '<p class="mini-note sy-legende">Besoin : la charge du jour ÷ un poste, arrondie au service ; « fixe » : un service permanent, d’appui ou un handling, '
      + 'sans besoin calculé (il ne compte pas dans « Il faut »). Présents en équivalents temps plein. Matin et après-midi : au travail au plus / présents. '
      + 'Personnes sans travail : les heures (personnes × heures) et leur part de la présence ; au survol, avant le premier lot, entre deux lots, après le dernier. '
      + 'Un arrivage : les lots livrés ensemble ; il attend de sa livraison au début de son premier lot — les lots suivants sont à faire, dans l’ordre de travail. '
      + 'En couleur : il manque au moins ' + esc(pluriel(rep.seuils.ecartPersonnes, 'personne', 'personnes')) + ' (un surplus n’est pas une alerte), un arrivage qui attend plus de '
      + esc(duree(rep.seuils.attenteLot)) + ', une occupation de plus de ' + esc(nombre(rep.seuils.occupation)) + ' %, une fin au moins un quart d’heure après l’horaire — celui des équipes qui travaillent ce jour-là ; l’équipe qui dépasse est nommée, avec sa fin et son horaire.</p>'
      + '<p class="mini-note sy-explique-occ">Occupation : la part du temps de présence couverte par le travail du barème. Elle dépend des temps par vol et des effectifs réglés.</p>'
      + horsCompte(ls).map(n => '<p class="mini-note sy-note">' + esc(n) + '</p>').join('');
  }

  /* ---- la courbe de la journée ---------------------------------------------------- */

  /** Les créneaux de l'unité : ceux de chaque service, à leur jour (la veille avant 00:00), additionnés. */
  function creneauxDeLUnite(k) {
    const decale = s => {
      const c = s.creneaux; if (c.debut === null) return c;
      const d = s.jour * JOUR, out = { debut: c.debut + d };
      for (const m of IND().MESURES) out[m] = c[m] ? { debut: c[m].debut + d, valeurs: c[m].valeurs } : null;
      return out;
    };
    return PE().sommeDesCreneaux(k.services.map(decale));
  }
  /** Les départs des vols de la journée : { id, t }, dans l'ordre. */
  function departs(r) {
    const vus = new Map();
    for (const c of r.classes || []) for (const v of c.vols || []) if (fini(v.depart) && !vus.has(v.id)) vus.set(v.id, v.depart);
    return [...vus].map(([id, t]) => ({ id, t })).sort((p, q) => p.t - q.t || String(p.id).localeCompare(String(q.id)));
  }
  /** La valeur d'une série au créneau qui commence à `t`, 0 hors de la série. */
  const valeurA = (s, t, pas) => { if (!s) return 0; const i = Math.round((t - s.debut) / pas); return i >= 0 && i < s.valeurs.length ? s.valeurs[i] : 0; };

  /** Les points de la courbe : un par créneau de 15 min, de la première présence à la dernière ; et ses pics. */
  function points(c, pas) {
    if (c.debut === null) return { liste: [], pics: null };
    const fin = Math.max(...['presents', 'auTravail', 'enFile'].map(m => (c[m] ? c[m].debut + c[m].valeurs.length * pas : c.debut)));
    const liste = [];
    for (let t = c.debut; t < fin - EPS; t += pas) liste.push({ t, presents: valeurA(c.presents, t, pas), auTravail: valeurA(c.auTravail, t, pas), enFile: valeurA(c.enFile, t, pas) });
    const pic = m => liste.reduce((x, p) => (!x || p[m] > x[m] + EPS ? p : x), null);
    return { liste, pics: { presents: pic('presents'), auTravail: pic('auTravail'), enFile: pic('enFile') } };
  }

  /** La phrase qui décrit la courbe, pour qui ne la voit pas. */
  function decrire(pt, vols) {
    if (!pt.liste.length) return 'Personne n’est présent.';
    const p = pt.pics, bouts = [nombre(p.presents.presents) + ' présents au plus, à ' + heure(p.presents.t), nombre(p.auTravail.auTravail) + ' au travail au plus, à ' + heure(p.auTravail.t)];
    bouts.push(p.enFile.enFile > EPS ? nombre(p.enFile.enFile) + ' lots à faire au plus, à ' + heure(p.enFile.t) : 'aucun lot à faire');
    return 'La journée de l’unité : ' + bouts.join(', ') + ' ; ' + pluriel(vols.length, 'départ', 'départs') + '.';
  }

  const HAUT = 190, BANDE = 44, REPERES = 16, AXE = 22, MARGE_G = 40, MARGE_D = 12;
  /** Les traits de l'axe des heures : toutes les 1, 2, 3 ou 6 heures, pour qu'ils ne se touchent pas. */
  function graduations(t0, t1, largeur) {
    const pas = [60, 120, 180, 360].find(p => (largeur / ((t1 - t0) / p)) >= 72) || 720, out = [];
    for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas) out.push(t);
    return out;
  }
  /** Un escalier : un palier par créneau. */
  const escalier = (liste, m, x, y, pas) => liste.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p[m]).toFixed(1) + 'L' + x(p.t + pas).toFixed(1) + ' ' + y(p[m]).toFixed(1)).join('');

  /** La courbe en SVG, `largeur` pixels : présents (trait), au travail (aire), lots à faire — prêts, pas commencés — (barres, à part), départs (repères). */
  function courbe(r, k, largeur) {
    const pas = IND().PAS, pt = points(creneauxDeLUnite(k), pas), vols = departs(r);
    if (!pt.liste.length) return '<p class="mini-note">Personne n’est présent : pas de courbe.</p>';
    const t0 = pt.liste[0].t, t1 = pt.liste[pt.liste.length - 1].t + pas, L = Math.max(480, Math.round(largeur));
    const x = t => MARGE_G + (t - t0) / (t1 - t0) * (L - MARGE_G - MARGE_D);
    const max = Math.max(1, pt.pics.presents.presents, pt.pics.auTravail.auTravail), y = v => 8 + (HAUT - 8) * (1 - v / max);
    const maxFile = Math.max(1, pt.pics.enFile.enFile), yb = HAUT + REPERES, H = HAUT + REPERES + BANDE + AXE;
    const ticks = graduations(t0, t1, L - MARGE_G - MARGE_D), echelle = [0, max / 2, max].map(v => Math.round(v));
    const aire = escalier(pt.liste, 'auTravail', x, y, pas) + 'L' + x(t1).toFixed(1) + ' ' + y(0).toFixed(1) + 'L' + x(t0).toFixed(1) + ' ' + y(0).toFixed(1) + 'Z';
    const barres = pt.liste.filter(p => p.enFile > EPS).map(p => {
      const h = Math.max(2, p.enFile / maxFile * (BANDE - 6));
      return '<rect class="ch-file" x="' + (x(p.t) + 1).toFixed(1) + '" y="' + (yb + BANDE - h).toFixed(1) + '" width="' + Math.max(1, x(p.t + pas) - x(p.t) - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1"/>';
    }).join('');
    const reperes = vols.filter(v => v.t >= t0 && v.t <= t1).map(v => '<line class="sy-depart" x1="' + x(v.t).toFixed(1) + '" y1="' + (HAUT + 3) + '" x2="' + x(v.t).toFixed(1) + '" y2="' + (HAUT + REPERES - 3) + '"><title>'
      + esc(v.id + ' · départ ' + heure(v.t)) + '</title></line>').join('');
    return '<svg class="ds-graphique sy-courbe-svg" width="' + L + '" height="' + H + '" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="' + esc(decrire(pt, vols)) + '"'
      + ' data-t0="' + t0 + '" data-t1="' + t1 + '" data-pas="' + pas + '" data-gauche="' + MARGE_G + '" data-droite="' + MARGE_D + '">'
      + echelle.map(v => '<line class="sy-grille" x1="' + MARGE_G + '" x2="' + (L - MARGE_D) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="sy-echelle" x="' + (MARGE_G - 6) + '" y="'
        + (y(v) + 4).toFixed(1) + '">' + v + '</text>').join('')
      + '<path class="ch-travail" d="' + aire + '"/><path class="ch-presents" d="' + escalier(pt.liste, 'presents', x, y, pas) + '"/>' + reperes
      + '<line class="sy-grille" x1="' + MARGE_G + '" x2="' + (L - MARGE_D) + '" y1="' + (yb + BANDE) + '" y2="' + (yb + BANDE) + '"/>' + barres
      + '<text class="sy-echelle" x="' + (MARGE_G - 6) + '" y="' + (yb + 12) + '">' + nombre(maxFile) + '</text>'
      + ticks.map(t => '<text class="sy-heure" x="' + x(t).toFixed(1) + '" y="' + (H - 6) + '">' + esc(heure(t)) + '</text>').join('')
      + '<line class="sy-curseur" x1="0" x2="0" y1="0" y2="' + (yb + BANDE) + '" hidden/></svg>';
  }

  /** La bulle d'un instant de la courbe : présents, au travail, lots à faire, et les départs du créneau. */
  function bulle(r, k, t) {
    const pas = IND().PAS, c = creneauxDeLUnite(k), d = Math.floor(t / pas) * pas, v = m => nombre(valeurA(c[m], d, pas));
    const partent = departs(r).filter(x => x.t >= d && x.t < d + pas).map(x => x.id);
    const n = m => valeurA(c[m], d, pas);
    return heure(d) + '–' + heure(d + pas) + ' : ' + pluriel(n('presents'), 'présent', 'présents') + ', ' + v('auTravail') + ' au travail, ' + pluriel(n('enFile'), 'lot', 'lots') + ' à faire'
      + (partent.length ? ' ; départ' + (partent.length > 1 ? 's' : '') + ' : ' + partent.join(', ') : '');
  }

  /* ---- les trois cartes ----------------------------------------------------------- */

  /**
   * « Où ça coince », sur les conséquences (correction 18 a) : les services qui finissent après leur horaire d'au moins un
   * quart d'heure, ou dont un lot fait partir une commande ou un vol en retard — trois au plus, rangés par heures sup puis
   * par cumul d'attente. Chacun dit son jour de travail, son dépassement, ce qu'il fait partir en retard, et sa cause.
   * Sinon, rien ne coince ; un arrivage qui attend au-delà du seuil reste nommé, sans en faire un goulot.
   */
  function carteCoince(rep) {
    const goulots = (rep.coince.goulots || (rep.coince.goulot ? [rep.coince.goulot] : [])), seuil = rep.seuils.attenteLot, QUART = REP().DEPASSEMENT_MIN;
    const badge = mot => (mot ? ' <span class="sy-jour">' + esc(mot) + '</span>' : ''), jourDe = x => badge(REP().motDeLaLigne({ service: x.service, jour: x.jour || 0 }, rep.coince.services));
    if (!goulots.length) {
      // Les lignes où un arrivage attend plus que le seuil : nommées, sans en faire un goulot.
      const attendent = rep.coince.services.filter(x => x.attenteMax && x.attenteMax.minutes > seuil + EPS).sort((p, q) => q.cumul - p.cumul).slice(0, 3);
      return { ton: 'ok', titre: 'Où ça coince', corps: '<p class="sy-grand">Rien ne coince.</p><p class="mini-note">Aucun service ne finit au moins ' + esc(duree(QUART))
        + ' après son horaire, ni ne fait partir une commande ou un vol en retard.</p>'
        + (attendent.length ? '<p class="sy-aussi">Un arrivage attend plus de ' + esc(duree(seuil)) + ', sans retard ni dépassement :</p><ul class="sy-exceptions">'
          + attendent.map(x => '<li><b>' + esc(x.nom) + '</b>' + jourDe(x) + ' ' + esc(duree(x.attenteMax.minutes)) + ', à ' + esc(heure(x.attenteMax.de)) + '</li>').join('') + '</ul>' : '') };
    }
    const g = goulots[0], autres = goulots.slice(1, 3), reste = goulots.length - 1 - autres.length;
    const ligne = x => '<li><b>' + esc(x.nom) + '</b>' + jourDe(x) + ' ' + esc(consequences(x, '', true)) + '<small>' + esc(motsDeLaCause(x.cause)) + '</small></li>';
    return { ton: 'attente', titre: 'Où ça coince', page: 'at-planning', service: g.service, jour: g.jour || 0,
      corps: '<p class="sy-grand">' + esc(g.nom) + jourDe(g) + '</p><p>' + esc(consequences(g, '', true)) + (g.heuresSup > EPS ? ' ; heures sup : ' + esc(duree(g.heuresSup)) + ' (personnes × heures)' : '') + '.</p>'
      + '<p class="mini-note sy-cause">Cause : ' + esc(motsDeLaCause(g.cause)) + '.</p>'
      + (autres.length ? '<p class="sy-aussi">Coincent aussi :</p><ul class="sy-exceptions">' + autres.map(ligne).join('') + '</ul>' : '')
      + (reste > 0 ? '<p class="mini-note">Et ' + esc(pluriel(reste, 'autre service', 'autres services')) + '.</p>' : '') };
  }
  /** Une exception, en une ligne : quoi, de combien, pourquoi. */
  function exception(x) {
    const quoi = { 'sans-equipe': 'sans équipe', 'vol-pas-charge': 'pas chargé', 'vol-pas-pret': 'pas prêt', 'vol-en-retard': 'chargé ' + duree(x.retard) + ' après sa limite',
      'commande-en-retard': 'prête ' + duree(x.retard) + ' après sa limite' }[x.type];
    const nom = x.type === 'commande-en-retard' ? x.libelle : 'Vol ' + x.id;
    return '<li><b>' + esc(nom) + '</b> ' + esc(quoi) + (x.cause && x.cause.mot && x.type !== 'sans-equipe' && x.type !== 'vol-pas-charge' ? ' — ' + esc(x.cause.mot) : '')
      + (x.cause && x.cause.phrase ? '<small>' + esc(x.cause.phrase) + '</small>' : '') + '</li>';
  }
  /**
   * Les comptes de la journée en mots (évolution 15 c), les mêmes sur la Synthèse et dans « Détails » : chacun dit son
   * périmètre — les vols que le handling charge et, à part, les commandes sans avion ; les commandes de repas et, à part,
   * celles d'équipement. `c` : les comptes des réponses. Rend [{ sujet: 'vols' | 'commandes', q, v }].
   */
  function motsDesComptes(c) {
    if (!c) return [];
    const l = [], dire = (sujet, q, v) => l.push({ sujet, q, v: String(v) });
    if (c.vols.suivis) {
      dire('vols', 'Vols chargés à l’heure', c.vols.aHeure + ' sur ' + c.vols.suivis);
      if (c.vols.suivis > c.vols.charges) dire('vols', 'Vols pas chargés', c.vols.suivis - c.vols.charges);
    }
    if (c.sansAvion) dire('vols', 'Commandes sans avion', c.sansAvion);
    for (const [x, nom] of [[c.repas, 'de repas'], [c.equipement, 'd’équipement']]) {
      if (!x.suivies) continue;
      dire('commandes', 'Commandes ' + nom + ' à l’heure', x.aHeure + ' sur ' + x.suivies);
      if (x.enRetard) dire('commandes', 'Commandes ' + nom + ' en retard', x.enRetard);
      if (x.pasFinies) dire('commandes', 'Commandes ' + nom + ' pas finies', x.pasFinies);
    }
    return l;
  }
  /** Les comptes en liste de définitions (`sujet` : n'en garder qu'une sorte). */
  const listeDesComptes = (c, sujet) => {
    const l = motsDesComptes(c).filter(x => !sujet || x.sujet === sujet);
    return l.length ? '<dl class="sy-comptes">' + l.map(x => '<div><dt>' + esc(x.q) + '</dt><dd>' + esc(x.v) + '</dd></div>').join('') + '</dl>' : '';
  };
  /** « Ce qui part en retard » : les seules exceptions (les cinq premières), et les comptes de la journée. */
  function carteRetard(rep) {
    const ex = rep.exceptions, n = compteRetards(ex), compte = listeDesComptes(rep.comptes);
    if (!ex.length) return { ton: 'ok', titre: 'Ce qui part en retard', corps: '<p class="sy-grand">Rien.</p>' + compte };
    const reste = ex.length - 5, qui = [n.vols ? pluriel(n.vols, 'vol', 'vols') : '', n.commandes ? pluriel(n.commandes, 'commande', 'commandes') : ''].filter(Boolean).join(' et ');
    return { ton: 'retard', titre: 'Ce qui part en retard', page: n.vols ? 'v-departs' : 'at-repas', corps: '<p class="sy-grand">' + esc(qui) + '</p><ul class="sy-exceptions">'
      + ex.slice(0, 5).map(exception).join('') + '</ul>' + (reste > 0 ? '<p class="mini-note">Et ' + esc(pluriel(reste, 'autre', 'autres')) + '.</p>' : '') + compte };
  }
  /** « Ce que change l'essai » : B − A sur les quatre réponses (`e` : { A, B }, les réponses des deux essais retenus). */
  function carteEssai(e) {
    const d = e && e.A && e.B ? REP().comparer(e.A, e.B) : null;
    if (!d) return null;
    const nomG = x => { const mot = motDuGoulot(x.coince); return x.coince.goulot ? x.coince.goulot.nom + (mot ? ' (' + mot + ')' : '') : null; };
    const fl = x => (x.a === x.b ? esc(nombre(x.b)) : esc(nombre(x.a)) + ' → <b>' + esc(nombre(x.b)) + '</b>');
    const hs = d.fins.services.reduce((m, s) => ({ a: m.a + (s.heuresSup.a || 0), b: m.b + (s.heuresSup.b || 0) }), { a: 0, b: 0 });
    const goulot = g => (g ? esc(g) : 'aucun');
    return { ton: 'neutre', titre: 'Ce que change l’essai', page: 'j-comparer', corps: '<ul class="sy-essai">'
      + '<li>Il faut ' + fl(d.personnes.total.besoin) + ' personnes ; ' + fl(d.personnes.total.presents) + ' présentes.</li>'
      + '<li>Goulot : ' + (d.coince.goulot.change ? goulot(nomG(e.A)) + ' → <b>' + goulot(nomG(e.B)) + '</b>' : goulot(nomG(e.B)) + ', inchangé') + '.</li>'
      + '<li>Heures sup : ' + (Math.abs(hs.a - hs.b) < EPS ? esc(duree(hs.b)) : esc(duree(hs.a)) + ' → <b>' + esc(duree(hs.b)) + '</b>') + '.</li>'
      + '<li>En retard : ' + fl(d.exceptions.nombre) + (d.exceptions.reglees.length ? ' ; ' + esc(pluriel(d.exceptions.reglees.length, 'réglée', 'réglées')) : '')
      + (d.exceptions.nouvelles.length ? ' ; ' + esc(pluriel(d.exceptions.nouvelles.length, 'nouvelle', 'nouvelles')) : '') + '.</li></ul>'
      + '<p class="mini-note">Essai A → essai B.</p>' };
  }
  /** Une carte : son titre, son ton (l'état qu'elle dit), son contenu, et la page où regarder de plus près. */
  function carte(c) {
    const vers = c.page ? '<button type="button" class="lien-fort sy-vers" data-page="' + esc(c.page) + '"' + (c.service ? ' data-pg-viser="' + esc(c.service) + '"' + (c.jour == null ? '' : ' data-pg-viser-jour="' + c.jour + '"') : '') + '>Voir le détail →</button>' : '';
    return '<section class="sy-carte" data-ton="' + c.ton + '" aria-label="' + esc(c.titre) + '"><h4>' + esc(c.titre) + '</h4>' + c.corps + vers + '</section>';
  }

  /* ---- la page --------------------------------------------------------------------- */

  /** Des commandes que personne ne prépare : un problème à compléter, avec son lien (pas parmi les commandes comptées). */
  function probleme(k) {
    if (!k || !k.classesAbsentes) return '';
    const I = root.OrlyIcones, n = k.classesAbsentes;
    return '<p class="bilan-probleme" role="note">' + (I ? I.ico('alerte') : '') + '<span><b>' + n + (n > 1 ? ' commandes que personne ne prépare' : ' commande que personne ne prépare')
      + '</b> — un problème à compléter : elles ne sont pas parmi les commandes comptées ici.</span>'
      + '<button type="button" class="btn btn-sm" data-page="mu-services">Cocher dans un service ' + (I ? I.ico('droite') : '→') + '</button></p>';
  }

  /**
   * La Synthèse dans `box`. `o` : { reponses, resultat, k (les indicateurs), ordre (les services, de l'amont vers l'aval),
   * essais ({ A, B } : les réponses des deux essais retenus, ou null) }. Sans réponses : la page le dit.
   */
  function rendre(box, o) {
    if (!box) return;
    const rep = o && o.reponses;
    if (!rep) { box.innerHTML = '<p class="mini-note">Rien à résumer : aucune équipe ne prépare encore de commande.</p>'; return; }
    const k = o.resultat && o.resultat.indicateurs, cartes = [carteCoince(rep), carteRetard(rep), carteEssai(o.essais)].filter(Boolean);
    box.innerHTML = '<div class="sy-tete">' + phrases(rep).map(p => '<p class="bilan-resume">' + esc(p) + '</p>').join('') + '</div>' + probleme(k)
      + '<div class="sy-cartes" data-n="' + cartes.length + '">' + cartes.map(carte).join('') + '</div>'
      + '<section class="sy-bloc" aria-label="Les services"><h4>Les services</h4>' + tableau(rep, o.ordre) + '</section>'
      + '<section class="sy-bloc sy-courbe" aria-label="La journée"><h4>La journée</h4><div class="sy-legende-courbe" aria-hidden="true"><span class="sy-l-presents">présents</span>'
      + '<span class="sy-l-travail">au travail</span><span class="sy-l-file" title="Prêts, pas encore commencés : dans l’ordre de travail">lots à faire</span><span class="sy-l-depart">départ d’un vol</span></div>'
      + '<div class="sy-trace" tabindex="0" aria-describedby="sy-bulle"></div><p class="mini-note sy-bulle" id="sy-bulle" role="status"></p></section>';
    dessinerCourbe(box, o);
  }

  /** La courbe, à la largeur de son cadre (redessinée quand il change de taille) ; la bulle suit la souris ou les flèches. */
  function dessinerCourbe(box, o) {
    const trace = box.querySelector('.sy-trace');
    if (!trace || typeof document === 'undefined') return;
    const peindre = () => { trace.innerHTML = courbe(o.resultat, o.k, trace.clientWidth || 960); };
    peindre();
    if (root.ResizeObserver) { let l = trace.clientWidth; new root.ResizeObserver(() => { if (trace.clientWidth && trace.clientWidth !== l) { l = trace.clientWidth; peindre(); } }).observe(trace); }
    let ici = null;
    const montrer = t => {
      const svg = trace.querySelector('svg'), b = box.querySelector('.sy-bulle'); if (!svg || !b) return;
      const t0 = +svg.dataset.t0, t1 = +svg.dataset.t1, g = +svg.dataset.gauche, L = +svg.getAttribute('width') - g - +svg.dataset.droite, pas = +svg.dataset.pas;
      ici = Math.min(t1 - pas, Math.max(t0, Math.floor(t / pas) * pas));
      const c = svg.querySelector('.sy-curseur'), x = (g + (ici + pas / 2 - t0) / (t1 - t0) * L).toFixed(1);
      c.setAttribute('x1', x); c.setAttribute('x2', x); c.removeAttribute('hidden'); b.textContent = bulle(o.resultat, o.k, ici);
    };
    trace.addEventListener('mousemove', e => {
      const svg = trace.querySelector('svg'); if (!svg) return;
      const rect = svg.getBoundingClientRect(), g = +svg.dataset.gauche, L = rect.width - g - +svg.dataset.droite;
      montrer(+svg.dataset.t0 + (e.clientX - rect.left - g) / L * (+svg.dataset.t1 - +svg.dataset.t0));
    });
    trace.addEventListener('keydown', e => {
      const svg = trace.querySelector('svg'); if (!svg || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); montrer((ici ?? +svg.dataset.t0) + (e.key === 'ArrowRight' ? 1 : -1) * +svg.dataset.pas);
    });
  }

  const api = { nombre, motDuJour, motsDeLAttendu, motsDeLaCause, phrases, compteRetards, motsDesComptes, listeDesComptes, lignes, tons, tableau, creneauxDeLUnite, departs, points, decrire, courbe, bulle,
    carteCoince, carteRetard, carteEssai, rendre };
  if (enNode) module.exports = api;
  else root.OrlySyntheseVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
