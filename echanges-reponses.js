/* ==========================================================================
 *  LA FEUILLE « RÉPONSES » DU CLASSEUR DE LA JOURNÉE (version 1,
 *  évolution 15 e — docs/FORMATS_EXCEL.md § 8, docs/CAHIER_DES_CHARGES.md
 *  § 6 bis)
 *  ------------------------------------------------------------------------
 *  Les cinq réponses de la journée, dans l'ordre du contrat, une ligne par
 *  mesure : combien de personnes il faut, où et quand ça coince, à quelle
 *  heure chaque service finit, ce qui part en retard, ce que change le
 *  scénario (avec deux essais retenus). Les valeurs sont celles du module
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
      out.push(ligne(0, s.nom, j, 'Il faut', s.besoin, 'personnes', null, null, 'la charge du jour : ' + r2(s.charge) + ' ETP'),
        ligne(0, s.nom, j, 'Présentes (ETP)', r2(s.presents), 'ETP'),
        ligne(0, s.nom, j, 'Écart (présentes − il faut)', r2(s.ecart), 'personnes', S.ecartPersonnes, ouiNon(s.signale),
          s.sens === 'sous' ? 'il manque du monde' : s.sens === 'sur' ? 'du monde en trop' : null),
        mi(s.matin, 'Matin'), mi(s.apresMidi, 'Après-midi'),
        ligne(0, s.nom, j, 'Pic au travail', s.pic ? r2(s.pic.personnes) : null, 'personnes', null, null, s.pic ? 'à ' + heure(s.pic.a) : null),
        ligne(0, s.nom, j, 'Occupation', pc(s.occupation), '%', S.occupation, fini(s.occupation) ? ouiNon(s.occupation * 100 > S.occupation + EPS) : null));
    }
    const t = rep.personnes.total;
    return out.concat([ligne(0, 'Toute l’unité', null, 'Il faut', t.besoin, 'personnes'), ligne(0, 'Toute l’unité', null, 'Présentes (ETP)', r2(t.presents), 'ETP'),
      ligne(0, 'Toute l’unité', null, 'Écart (présentes − il faut)', r2(t.ecart), 'personnes')]);
  }

  /** R2 : le goulot, puis chaque service où un lot attend : la file la plus longue, l'attente la plus longue, le cumul, la cause. */
  function coince(rep) {
    const S = rep.seuils, g = rep.coince.goulot;
    const out = [ligne(1, g ? g.nom : 'aucun', null, 'Goulot', g ? entier(g.cumul) : null, 'lots × minutes', S.attenteLot, g ? 'oui' : 'non',
      g ? 'de ' + heure(g.de) + ' à ' + heure(g.a) + ' ; un lot y attend jusqu’à ' + entier(g.attenteMax) + ' min' + (g.cause ? ' ; cause : ' + CAUSES[g.cause] : '')
        : 'aucun lot n’attend plus de ' + S.attenteLot + ' min')];
    for (const s of rep.coince.services.filter(x => x.file || x.attenteMax)) {
      const a = s.attenteMax;
      out.push(ligne(1, s.nom, null, 'File la plus longue', s.file ? s.file.lots : null, 'lots', null, null, s.file ? 'à ' + heure(s.file.a) : null),
        ligne(1, s.nom, null, 'Attente la plus longue d’un lot', a ? entier(a.minutes) : null, 'min', S.attenteLot, a ? ouiNon(a.minutes > S.attenteLot) : null,
          a ? a.lot + ', de ' + heure(a.de) + ' à ' + heure(a.a) : null),
        ligne(1, s.nom, null, 'Cumul d’attente', entier(s.cumul), 'lots × minutes'),
        ligne(1, s.nom, null, 'Cause', null, null, null, null, s.cause ? CAUSES[s.cause] : 'aucune établie'));
    }
    return out;
  }

  /** R3 : par service, la fin de son dernier lot et de son horaire (de vraies heures Excel), ce qui dépasse, ses heures sup. */
  function fins(rep, date) {
    const quand = t => (fini(t) ? T().celluleDate(date, t) : null);
    return rep.fins.services.flatMap(s => {
      const h = s.heuresSup || {};
      return [ligne(2, s.nom, null, 'Fin du dernier lot', quand(s.fin), 'heure', null, null, fini(s.fin) ? heure(s.fin) : null),
        ligne(2, s.nom, null, 'Fin de l’horaire', quand(s.finHoraire), 'heure', null, null, fini(s.finHoraire) ? heure(s.finHoraire) : null),
        ligne(2, s.nom, null, 'Dépassement', entier(s.depasse), 'min', 0, fini(s.depasse) ? ouiNon(s.depasse > 0) : null),
        ligne(2, s.nom, null, 'Heures sup', entier(h.total), 'min × personnes', null, null,
          'équipes ' + (entier(h.equipes) ?? 0) + ', renforts prêtés ' + (entier(h.renforts) ?? 0) + ', chauffeurs ' + (entier(h.chauffeurs) ?? 0))];
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
    return [ligne(4, 'Toute l’unité', null, 'Il faut, toute l’unité (B − A)', r2(t.besoin.d), 'personnes', null, null, t.besoin.a + ' → ' + t.besoin.b),
      ligne(4, 'Toute l’unité', null, 'Présentes, toute l’unité (B − A)', r2(t.presents.d), 'ETP', null, null, r2(t.presents.a) + ' → ' + r2(t.presents.b)),
      // Un service qui n'existe que dans l'un des deux essais compte aussi : « absent → 3 ».
      ...d.personnes.services.filter(s => change(s.besoin) || change(s.presents)).map(s => ligne(4, s.nom, null, 'Il faut / présentes (B − A)', r2(s.besoin.d), 'personnes', null, null,
        'il faut ' + ouAbsent(s.besoin.a) + ' → ' + ouAbsent(s.besoin.b) + ' ; présentes ' + ouAbsent(s.presents.a) + ' → ' + ouAbsent(s.presents.b))),
      ligne(4, nom(d.coince.goulot.b || d.coince.goulot.a), null, 'Goulot', null, null, null, null,
        (d.coince.goulot.change ? 'change : ' : 'le même : ') + nom(d.coince.goulot.a) + ' → ' + nom(d.coince.goulot.b)),
      ...d.fins.services.filter(s => change(s.fin) || change(s.heuresSup)).map(s => ligne(4, s.nom, null, 'Fin (B − A)', entier(s.fin.d), 'min', null, null,
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
      lignes: [TETE.slice(), ...personnes(rep, jour), ...coince(rep), ...fins(rep, date), ...retards(rep), ...scenario(rep, ctx.comparaison || null)] };
  }

  /** Le classeur de la journée (echanges-charge.js, journeeVersClasseur) avec la feuille « Réponses » à la fin ; les autres, telles quelles. */
  function avecReponses(classeur, rep, ctx = {}) {
    return rep ? classeur.concat([feuilleDesReponses(rep, ctx)]) : classeur;
  }

  const api = { QUESTIONS, TETE, feuilleDesReponses, avecReponses };
  if (enNode) module.exports = api;
  else root.OrlyEchangesReponses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
