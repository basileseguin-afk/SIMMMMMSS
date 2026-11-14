/* ==========================================================================
 *  LA FEUILLE « RÉPONSES » DU CLASSEUR DE LA JOURNÉE (version 1,
 *  évolution 15 e — docs/FORMATS_EXCEL.md § 8, docs/CAHIER_DES_CHARGES.md
 *  § 6 bis)
 *  ------------------------------------------------------------------------
 *  Les cinq réponses de la journée, dans l'ordre du contrat, une ligne par
 *  mesure : combien de personnes il faut, où et quand ça coince, à quelle
 *  heure chaque service finit, ce qui part en retard, ce que change le
 *  scénario (avec deux essais retenus). Les réponses 1, 2 et 3 ont une ligne
 *  par service et jour de travail (correction 17 a), chacune avec son jour.
 *  Les valeurs sont celles du module
 *  (moteur/reponses.js) : la page et l'outil (simuler-journee --xlsx) écrivent
 *  la même feuille. Elle s'ajoute à la fin du classeur de la journée
 *  (echanges-charge.js), sans changer les autres feuilles ; tableur.js et
 *  echanges.js, communs aux deux versions, ne changent pas.
 *
 *  ⚠ Un classeur tiré d'une sauvegarde réelle ne va jamais dans le dépôt
 *  (`.gitignore` refuse les classeurs).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const T = () => (enNode ? require('./tableur.js') : root.OrlyTableur);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const fini = x => x != null && Number.isFinite(+x);
  const r2 = x => (fini(x) ? Math.round(+x * 100) / 100 : null);
  const entier = x => (fini(x) ? Math.round(+x) : null);
  const pc = x => (fini(x) ? Math.round(+x * 1000) / 10 : null);
  const deux = n => String(n).padStart(2, '0');
  const decalerJour = (d, k) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + k)).toISOString().slice(0, 10);
  /**
   * L'heure d'un instant de la journée (minutes depuis minuit du jour des vols), arrondie à la minute comme la cellule Excel
   * à côté et comme le reste de la page : « 06:30 », « J−1 22:00 », « J+1 01:00 ».
   */
  const heure = t => {
    if (!fini(t)) return '—';
    const m = Math.round(+t), j = ((m % 1440) + 1440) % 1440;
    return (m < 0 ? 'J−1 ' : m >= 1440 ? 'J+1 ' : '') + deux(Math.floor(j / 60)) + ':' + deux(j % 60);
  };
  /** Une valeur de A ou de B dans la comparaison : « absent » quand l'essai ne l'a pas. */
  const ouAbsent = (x, ecrire = r2) => (x == null ? 'absent' : ecrire(x));
  /** Ce qui change entre A et B : un écart non nul, ou une valeur qui n'existe que dans l'un des deux essais. */
  const change = x => (x.d == null ? x.a != null || x.b != null : x.d !== 0);
  const EPS = 1e-9;
  const ouiNon = x => (x ? 'oui' : 'non');

  /** Les cinq questions, dans l'ordre du contrat (R1 à R5). */
  const QUESTIONS = Object.freeze(['1. Combien de personnes faut-il, par service ?', '2. Où et quand ça coince ?',
    '3. À quelle heure chaque service finit-il, et avec combien d’heures sup ?', '4. Qu’est-ce qui part en retard ?', '5. Que change mon scénario ?']);
  const TETE = Object.freeze(['Question', 'Sujet', 'Jour de travail', 'Mesure', 'Valeur', 'Unité', 'Seuil', 'Au-delà du seuil', 'Détail']);
  const CAUSES = Object.freeze({ personnel: 'personnel : il manque du monde', amont: 'l’amont : le service d’avant', materiel: 'le matériel propre' });
  const TYPES = Object.freeze({ 'vol-en-retard': 'Vol chargé en retard', 'vol-pas-charge': 'Vol pas chargé', 'vol-pas-pret': 'Vol pas prêt',
    'commande-en-retard': 'Commande en retard', 'sans-equipe': 'Vol sans équipe' });

  /** Une ligne de la feuille : la question (0 à 4), puis les colonnes de TETE. */
  const ligne = (q, sujet, jour, mesure, valeur, unite, seuil, au, detail) =>
    [QUESTIONS[q], sujet ?? null, jour ?? null, mesure, valeur ?? null, unite ?? null, seuil ?? null, au ?? null, detail ?? null];

  /** R1 : par service et jour de travail, il faut, présentes, l'écart, le matin et l'après-midi, le pic, l'occupation ; puis l'unité. */
  function personnes(rep, jour) {
    const S = rep.seuils, out = [];
    for (const s of rep.personnes.services) {
      const j = jour(s.jour), mi = (x, nom) => ligne(0, s.nom, j, nom + ', au travail au plus', x && fini(x.auTravail) ? r2(x.auTravail) : null, 'personnes', null, null,
        x && fini(x.presents) ? 'sur ' + r2(x.presents) + ' présentes' + (fini(x.a) ? ', à ' + heure(x.a) : '') : null);
      // Un poste fixe (correction 17 c) : pas de besoin calculé depuis une charge, pas d'écart ; un handling à chauffeurs les compte.
      const present = s.chauffeurs ? 'ses chauffeurs' + (s.horsCompte > 0 ? ' ; ' + r2(s.horsCompte) + ' personne(s) saisie(s) à l’équipe non comptée(s)' : '')
        : s.fixes > 0 && !s.fixe && !s.nonMesure ? 'dont ' + r2(s.fixes) + ' en ' + (s.nonMesures > 0 ? (s.fixes - s.nonMesures > EPS ? 'postes fixes ou non mesurés' : 'postes non mesurés') : 'postes fixes') : null;
      // Sans besoin : un poste fixe, ou des équipes dont le besoin ne se mesure pas (correction 18 a).
      const sans = s.fixe || s.nonMesure, pourquoi = s.fixe ? 'poste fixe' : 'besoin non mesuré';
      out.push(ligne(0, s.nom, j, 'Il faut', s.besoin, 'personnes', null, null, s.fixe ? 'poste fixe : pas de besoin calculé depuis une charge'
          : s.nonMesure ? 'besoin non mesuré : aucun travail au barème pour ses équipes' : 'la charge du jour : ' + r2(s.charge) + ' ETP'),
        ligne(0, s.nom, j, 'Présentes (ETP)', r2(s.presents), 'ETP', null, null, present),
        ligne(0, s.nom, j, 'Écart (présentes − il faut)', r2(s.ecart), 'personnes', S.ecartPersonnes, sans ? null : ouiNon(s.signale),
          sans ? pourquoi + ' : pas d’écart' : s.sens === 'sous' ? 'il manque du monde' : s.sens === 'sur' ? 'du monde en trop (pas une alerte)' : null),
        mi(s.matin, 'Matin'), mi(s.apresMidi, 'Après-midi'),
        ligne(0, s.nom, j, 'Pic au travail', s.pic ? r2(s.pic.personnes) : null, 'personnes', null, null, s.pic ? 'à ' + heure(s.pic.a) : null),
        ligne(0, s.nom, j, 'Occupation', pc(s.occupation), '%', S.occupation, fini(s.occupation) ? ouiNon(s.occupation * 100 > S.occupation + EPS) : null));
    }
    const t = rep.personnes.total;
    return out.concat([ligne(0, 'Toute l’unité', null, 'Il faut', t.besoin, 'personnes', null, null, 'hors postes fixes et besoins non mesurés'),
      ligne(0, 'Toute l’unité', null, 'Présentes (ETP)', r2(t.presents), 'ETP'),
      ligne(0, 'Toute l’unité', null, 'Dont postes fixes (ETP)', r2(t.fixes), 'ETP', null, null,
        'permanents, appui, handling : sans besoin calculé' + (t.nonMesures > 0 ? ' ; dont ' + r2(t.nonMesures) + ' au besoin non mesuré' : '')),
      ligne(0, 'Toute l’unité', null, 'Écart (présentes hors postes fixes − il faut)', r2(t.ecart), 'personnes')]);
  }

  /** Ce qu'une équipe attendait avant son premier lot, en mots (les mêmes que la Synthèse). */
  const attendu = a => (a.quoi === 'ouverture' ? 'attend l’ouverture de ' + (a.nom || 'la mise à disposition') + ', à ' + heure(a.a)
    : a.quoi === 'amont' ? 'attend ' + (a.nom || 'son amont') + ', jusqu’à ' + heure(a.a) : 'attend son matériel');
  /** La cause d'un service qui coince, en mots. */
  const causeDuGoulot = c => (!c ? null : c.code === 'ouverture' || c.code === 'amont' ? attendu({ quoi: c.code, nom: c.nom, a: c.a })
    : c.code === 'materiel' ? 'ses arrivages attendent leur matériel' : c.code === 'limite' ? 'finit dans son horaire, mais après la limite d’une commande ou d’un vol'
      : c.code === 'aval' ? 'ses lots finissent avant la limite : la commande ou le vol prend son retard en aval'
        : c.code === 'presences' ? 'ses équipes partent à la fin de leur présence : personne ne reste pour finir, ce qui n’est pas lavé passe au lendemain'
          : 'la charge du jour ne tient pas dans l’horaire');
  /** Ce qu'une plonge par vol laisse à laver le lendemain (évolution 18), en mots. */
  const lendemain = x => x.vols + ' vol(s) à laver le lendemain (' + entier(x.minutes) + ' min de lavage)';
  /** L'équipe qui doit absorber le reste, entre parenthèses, et ce dont il déborde (correction 19 b). */
  const duMatin = x => 'l’équipe du matin' + (x.equipe ? ' (' + x.equipe.nom + ')' : '');
  const auDela = x => (fini(x.depassement) ? entier(x.depassement) + ' min de lavage au-delà' : 'aucune équipe pour le laver');

  /**
   * R2 (correction 18 a). Les goulots, sur les conséquences : un service qui finit après son horaire d'au moins un quart
   * d'heure, ou dont un lot fait partir une commande ou un vol en retard — rangés par heures sup, puis par cumul d'attente.
   * Puis, par service et jour de travail : ses arrivages, la file la plus longue (en arrivages), l'attente la plus longue
   * d'un arrivage, le cumul, la cause ; et les personnes sans travail, en trois moments, avec ce que l'équipe attendait.
   */
  function coince(rep, jour) {
    const S = rep.seuils, QUART = REP().DEPASSEMENT_MIN, goulots = rep.coince.goulots || (rep.coince.goulot ? [rep.coince.goulot] : []);
    // La valeur : son dépassement, en minutes, au quart d'heure qui compte ; le détail : ses heures sup, ce qu'il fait partir en retard, sa cause.
    const out = goulots.length ? goulots.map((g, i) => ligne(1, g.nom, jour(g.jour), i ? 'Coince aussi' : 'Goulot', entier(g.depasse), 'min', QUART,
      ouiNon(g.depasse >= QUART - EPS), 'heures sup ' + entier(g.heuresSup) + ' min × personnes ; ' + g.enRetard + ' commande(s) ou vol(s) en retard par ses lots'
        + (g.lendemain ? ' ; laisse ' + lendemain(g.lendemain) + ', plus que l’équipe du matin ne peut en laver pendant sa présence ('
          + (g.lendemain.equipe ? g.lendemain.equipe.nom + ' : ' : '') + auDela(g.lendemain) + ')' : '') + ' ; cause : ' + causeDuGoulot(g.cause)))
      : [ligne(1, 'aucun', null, 'Goulot', null, 'min', QUART, 'non',
        'aucun service ne finit au moins ' + QUART + ' min après son horaire ni ne fait partir une commande ou un vol en retard')];
    for (const s of rep.coince.services.filter(x => fini(x.arrivages))) {
      const a = s.attenteMax, j = jour(s.jour);
      out.push(ligne(1, s.nom, j, 'Arrivages du jour', s.arrivages, 'arrivages', null, null, 'les lots livrés ensemble forment un arrivage'),
        ligne(1, s.nom, j, 'File d’arrivages la plus longue', s.file ? s.file.arrivages : 0, 'arrivages', null, null, s.file ? 'à ' + heure(s.file.a) : null),
        ligne(1, s.nom, j, 'Attente la plus longue d’un arrivage', a ? entier(a.minutes) : 0, 'min', S.attenteLot, ouiNon(!!a && a.minutes > S.attenteLot),
          a ? a.lot + (a.lots > 1 ? ' (et ' + (a.lots - 1) + ' autre(s) lot(s))' : '') + ', de ' + heure(a.de) + ' à ' + heure(a.a) : 'aucun arrivage n’a attendu'),
        ligne(1, s.nom, j, 'Cumul d’attente des arrivages', entier(s.cumul), 'arrivages × minutes'),
        ligne(1, s.nom, j, 'Cause de l’attente des arrivages', null, null, null, null, s.cause ? CAUSES[s.cause] : 'aucune établie'));
      // Une plonge par vol (évolution 18) : ce qu'elle laisse à laver le lendemain, seulement s'il y en a. Correction 19 (b) : sans
      // seuil — « oui » quand la première équipe du lendemain ne peut pas l'absorber pendant sa présence (elle coince alors).
      if (s.lendemain) out.push(ligne(1, s.nom, j, 'Reste à laver le lendemain', s.lendemain.vols, 'vols', null, ouiNon(!s.lendemain.absorbe),
        entier(s.lendemain.minutes) + ' min de lavage ; un lavage arrêté compte pour sa durée restante ; '
        + (s.lendemain.absorbe ? duMatin(s.lendemain) + ' le lave pendant sa présence : la plonge ne coince pas'
          : 'plus que ' + duMatin(s.lendemain) + ' ne peut en laver pendant sa présence : ' + auDela(s.lendemain))));
    }
    for (const s of ((rep.sansTravail || {}).services || []).filter(x => fini(x.minutes))) {
      const j = jour(s.jour);
      out.push(ligne(1, s.nom, j, 'Personnes sans travail', entier(s.minutes), 'min × personnes', null, null,
          'avant le premier lot ' + entier(s.avant) + ', entre deux lots ' + entier(s.entre) + ', après le dernier lot ' + entier(s.apres)
          + (s.attendait.length ? ' ; ' + s.attendait.map(attendu).join(' ; ') : '')),
        ligne(1, s.nom, j, 'Part de la présence sans travail', pc(s.part), '%'));
    }
    return out;
  }

  /** R3 : par service et jour de travail, la fin de son dernier lot et de son horaire (de vraies heures Excel), ce qui dépasse, ses heures sup. */
  function fins(rep, date, jour) {
    const quand = t => (fini(t) ? T().celluleDate(date, t) : null);
    return rep.fins.services.flatMap(s => {
      const h = s.heuresSup || {}, j = jour(s.jour);
      return [ligne(2, s.nom, j, 'Fin du dernier lot', quand(s.fin), 'heure', null, null, fini(s.fin) ? heure(s.fin) : null),
        ligne(2, s.nom, j, 'Fin de l’horaire', quand(s.finHoraire), 'heure', null, null, fini(s.finHoraire) ? heure(s.finHoraire) : null),
        // Le dépassement compte à partir du quart d'heure (une règle fixe, correction 18 a) : en dessous, il s'écrit sans compter.
        // En détail : l'équipe qui dépasse, avec sa propre fin et son propre horaire.
        ligne(2, s.nom, j, 'Dépassement', entier(s.depasse), 'min', REP().DEPASSEMENT_MIN, fini(s.depasse) ? ouiNon(s.depasse >= REP().DEPASSEMENT_MIN - EPS) : null,
          s.equipeQuiDepasse ? 'l’équipe ' + s.equipeQuiDepasse.nom + ' finit à ' + heure(s.equipeQuiDepasse.fin) + ' pour ' + heure(s.equipeQuiDepasse.finHoraire) : null),
        ligne(2, s.nom, j, 'Heures sup', entier(h.total), 'min × personnes', null, null,
          'équipes ' + (entier(h.equipes) ?? 0) + ', renforts prêtés ' + (entier(h.renforts) ?? 0) + ', chauffeurs ' + (entier(h.chauffeurs) ?? 0)),
        // Une plonge par vol (évolution 18) : ses lavages passés en relais, ou arrêtés à une fin de présence — les parts de chacun.
        // Correction 19 : un lavage arrêté puis repris par l'équipe qui arrive — « arrêté à hh:mm, repris par … ».
        ...(s.relais || []).map(x => ligne(2, s.nom, j, x.fin === null ? 'Lavage arrêté' : x.parts.some(p => p.reprise) ? 'Lavage repris' : 'Lavage en relais',
          entier(x.parts.reduce((n, p) => n + p.travail, 0)), 'min', null, null,
          x.vol + ' : ' + x.parts.map((p, i) => (p.reprise ? 'arrêté à ' + heure(x.parts[i - 1].fin) + ', repris par ' : '') + p.nom + ' ' + heure(p.debut) + ' → ' + heure(p.fin) + ' (' + entier(p.travail) + ' min)').join(', ')
          + (x.fin === null ? ' ; reste ' + entier(x.reste) + ' min à laver le lendemain' : ' ; propre à ' + heure(x.fin))))];
    });
  }

  /** R4 : une ligne par exception, son retard et sa cause ; sans exception, une ligne qui le dit. */
  function retards(rep) {
    if (!rep.exceptions.length) return [ligne(3, null, null, 'Aucune exception', 0, 'exceptions', rep.seuils.retard, 'non', 'rien ne part en retard')];
    // Chaque exception est au-delà de son seuil : un retard d'au moins le seuil, ou un vol pas chargé, pas prêt, sans équipe.
    return rep.exceptions.map(e => ligne(3, e.id, null, TYPES[e.type] || e.type, entier(e.retard), 'min', rep.seuils.retard, 'oui',
      e.cause ? e.cause.phrase : null));
  }

  /** R5 : avec deux essais (`d` = moteur/reponses.js, comparer(A, B)), B − A ; sans, une ligne qui dit comment en avoir deux. */
  function scenario(rep, d) {
    if (!d) return [ligne(4, null, null, 'Sans second essai', null, null, null, null,
      'retenez deux essais dans « Comparer deux essais » : le classeur de la page donne alors ce que change le scénario')];
    const nom = id => ((rep.personnes.services.find(s => s.service === id) || {}).nom) || id || 'aucun', t = d.personnes.total, x = d.exceptions;
    const de = (s, lignes) => { const mot = REP().motDeLaLigne(s, lignes); return s.nom + (mot ? ' (' + mot + ')' : ''); };
    // Un poste fixe (correction 17 c) n'a pas de besoin : « fixe », pas « absent ».
    const faut = (s, c) => ((s.nonMesure || {})[c] ? 'non mesuré' : (s.fixe || {})[c] ? 'fixe' : ouAbsent(s.besoin[c]));
    const g = d.coince.goulot, goulot = (id, j) => {
      const mot = id ? REP().motDeLaLigne({ service: id, jour: j || 0 }, d.coince.services) : null;
      return id ? nom(id) + (mot ? ' (' + mot + ')' : '') : 'aucun';
    };
    return [ligne(4, 'Toute l’unité', null, 'Il faut, toute l’unité (B − A)', r2(t.besoin.d), 'personnes', null, null, t.besoin.a + ' → ' + t.besoin.b),
      ligne(4, 'Toute l’unité', null, 'Présentes, toute l’unité (B − A)', r2(t.presents.d), 'ETP', null, null, r2(t.presents.a) + ' → ' + r2(t.presents.b)),
      // Un service qui n'existe que dans l'un des deux essais compte aussi : « absent → 3 ».
      ...d.personnes.services.filter(s => change(s.besoin) || change(s.presents)).map(s => ligne(4, de(s, d.personnes.services), null, 'Il faut / présentes (B − A)', r2(s.besoin.d), 'personnes', null, null,
        'il faut ' + faut(s, 'a') + ' → ' + faut(s, 'b') + ' ; présentes ' + ouAbsent(s.presents.a) + ' → ' + ouAbsent(s.presents.b))),
      ligne(4, nom(g.b || g.a), null, 'Goulot', null, null, null, null,
        (g.change ? 'change : ' : 'le même : ') + goulot(g.a, g.jourA) + ' → ' + goulot(g.b, g.jourB)),
      ...d.fins.services.filter(s => change(s.fin) || change(s.heuresSup)).map(s => ligne(4, de(s, d.fins.services), null, 'Fin (B − A)', entier(s.fin.d), 'min', null, null,
        'fin ' + ouAbsent(s.fin.a, heure) + ' → ' + ouAbsent(s.fin.b, heure) + ' ; heures sup ' + ouAbsent(s.heuresSup.a, entier) + ' → ' + ouAbsent(s.heuresSup.b, entier) + ' min × personnes')),
      ligne(4, 'Toute l’unité', null, 'Exceptions (B − A)', x.nombre.d, 'exceptions', null, null, x.nombre.a + ' → ' + x.nombre.b),
      ligne(4, 'Toute l’unité', null, 'Exceptions réglées dans B', x.reglees.length, 'exceptions', null, null, x.reglees.map(e => e.id).join(', ') || null),
      ligne(4, 'Toute l’unité', null, 'Exceptions nouvelles dans B', x.nouvelles.length, 'exceptions', null, null, x.nouvelles.map(e => e.id).join(', ') || null)];
  }

  /**
   * La feuille « Réponses » : les cinq réponses `rep` (moteur/reponses.js, reponses). `ctx` : { date (la journée de vols,
   * AAAA-MM-JJ ; sans date, celle du calcul), calculeLe, comparaison (moteur/reponses.js, comparer(A, B) ; facultative) }.
   */
  function feuilleDesReponses(rep, ctx = {}) {
    const le = ctx.calculeLe ? new Date(ctx.calculeLe) : new Date();
    const date = ctx.date || le.getFullYear() + '-' + deux(le.getMonth() + 1) + '-' + deux(le.getDate());
    const jour = k => T().celluleDate(decalerJour(date, k || 0));
    return { nom: 'Réponses', filtres: true, figerColonnes: 2, largeurs: [44, 24, 14, 34, 12, 16, 10, 10, 60],
      lignes: [TETE.slice(), ...personnes(rep, jour), ...coince(rep, jour), ...fins(rep, date, jour), ...retards(rep), ...scenario(rep, ctx.comparaison || null)] };
  }

  /** Le classeur de la journée (echanges-charge.js, journeeVersClasseur) avec la feuille « Réponses » à la fin ; les autres, telles quelles. */
  function avecReponses(classeur, rep, ctx = {}) {
    return rep ? classeur.concat([feuilleDesReponses(rep, ctx)]) : classeur;
  }

  const api = { QUESTIONS, TETE, feuilleDesReponses, avecReponses };
  if (enNode) module.exports = api;
  else root.OrlyEchangesReponses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
