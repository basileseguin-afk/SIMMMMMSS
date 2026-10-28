/* ==========================================================================
 *  LA PÉRIODE — un programme de vols daté, joué jour après jour
 *  (banc d'essai de la version 1, évolution 10 — docs/BANC_ESSAI.md § 9)
 *  ------------------------------------------------------------------------
 *  Le site simulait une seule journée. Un programme de vols daté (colonne
 *  `date`) couvre une période : du premier au dernier jour, chaque jour se
 *  joue avec ses seuls vols, dans l'ordre, et ce qui reste le soir passe au
 *  lendemain. Ce module, sans navigateur, sert à l'outil
 *  (outils/simuler-periode.cjs) comme à la page : un seul chemin de calcul.
 *
 *  Les dates sont des jours du calendrier, « AAAA-MM-JJ » ; les heures d'une
 *  journée restent des minutes depuis son 00:00 (négatives : la veille).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const JOUR = 86400000;
  const versUTC = d => { const [a, m, j] = String(d).split('-').map(Number); return Date.UTC(a, m - 1, j); };
  const enIso = t => new Date(t).toISOString().slice(0, 10);
  /** Le jour `d` décalé de `k` jours. */
  const jourDecale = (d, k) => enIso(versUTC(d) + k * JOUR);
  /** Le nombre de jours de `a` à `b`. */
  const ecart = (a, b) => Math.round((versUTC(b) - versUTC(a)) / JOUR);
  /** Les jours de `debut` à `fin`, les deux compris. */
  function joursEntre(debut, fin) {
    const out = [];
    for (let d = debut; d <= fin; d = jourDecale(d, 1)) out.push(d);
    return out;
  }
  /** « 12/08 », « 12/08/2026 ». */
  const dateCourte = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const dateLongue = d => dateCourte(d) + '/' + d.slice(0, 4);

  /* ----------------------------------------------------------------------
   *  Le programme daté (partie a)
   * --------------------------------------------------------------------*/

  /** Le programme est-il daté ? Ses vols portent alors tous une date (l'import le garantit). */
  const estDate = vols => (vols || []).some(v => v && v.date);
  /** Les jours où le programme a des vols, dans l'ordre. */
  const datesDu = vols => [...new Set((vols || []).filter(v => v && v.date).map(v => v.date))].sort();
  /** Les vols d'un jour, sans leur date : ce qu'une journée reçoit, comme un programme d'un seul jour. */
  const volsDuJour = (vols, d) => (vols || []).filter(v => v.date === d).map(({ date, ...v }) => v);

  /**
   * Ce que couvre un programme daté : son premier et son dernier jour, tous les
   * jours entre les deux, les vols de chacun, et les jours sans aucun vol au
   * milieu (un jour sans vol, ou un oubli). Null pour un programme sans date.
   */
  function decrire(vols) {
    if (!estDate(vols)) return null;
    const dates = datesDu(vols), debut = dates[0], fin = dates[dates.length - 1];
    const parJour = joursEntre(debut, fin).map(date => {
      const l = vols.filter(v => v.date === date);
      return { date, departs: l.filter(v => v.sens === 'DEP').length, retours: l.filter(v => v.sens === 'RET').length };
    });
    return { debut, fin, jours: parJour.length, parJour, sansVol: parJour.filter(j => !j.departs && !j.retours).map(j => j.date) };
  }

  /** Le rapport d'import d'un programme daté, en lignes de texte (la page, l'outil). */
  function texteDuProgramme(d) {
    if (!d) return [];
    const n = j => j.departs + j.retours, avec = d.parJour.filter(j => n(j) > 0);
    const min = Math.min(...avec.map(n)), max = Math.max(...avec.map(n));
    const lignes = ['Programme daté : du ' + dateLongue(d.debut) + ' au ' + dateLongue(d.fin) + ', ' + d.jours + (d.jours > 1 ? ' jours.' : ' jour.'),
      'Vols par jour : ' + (min === max ? min : 'de ' + min + ' à ' + max) + ' (' + Math.round(avec.reduce((k, j) => k + n(j), 0) / Math.max(1, avec.length) * 10) / 10
        + ' en moyenne) — ' + d.parJour.map(j => dateCourte(j.date) + ' : ' + n(j)).join(' · ') + '.'];
    for (const s of d.sansVol) lignes.push('Aucun vol le ' + dateCourte(s) + ' : jour sans vol ou oubli ?');
    return lignes;
  }

  /* ----------------------------------------------------------------------
   *  Le calcul de la période (partie b)
   * --------------------------------------------------------------------*/

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const module_ = (nom, chemin) => (enNode ? require(chemin) : root[nom]);
  const J = () => module_('OrlyJournee', './journee.js');
  const P = () => module_('MoteurProduction', './production.js');
  const A = () => module_('OrlyAteliers', '../ateliers.js');
  const PL = () => module_('OrlyPlanning', './planning.js');
  const clone = x => JSON.parse(JSON.stringify(x));
  const up = x => String(x ?? '').trim().toUpperCase();

  /**
   * Une journée de la période : ses vols, avec ce que la veille lui laisse.
   *   — le sale non lavé : le `saleFinal` de la veille devient son `saleInitial`
   *     (le premier jour part du sale de la veille saisi) ;
   *   — le matériel propre restant, si la boucle du matériel est active : le
   *     stock propre de fin de journée devient son stock initial ;
   *   — avec la source de retours « J+1 » : son sale vient des départs réels de
   *     la veille (leur heure + 24 h + le délai), et non plus des siens ; le
   *     premier jour garde la règle d'aujourd'hui.
   * Rien d'autre ne passe (lots non finis, retards, préparations d'avance) : ils
   * se comptent dans le bilan du jour où ils manquent.
   * Rend aussi `entree` : les options qui font rejouer cette journée seule par
   * outils/simuler-journee.cjs, au champ près.
   */
  function jouerJournee(unite, volsJour, volsVeille, veille, o) {
    const m = (unite.etat && unite.etat.materiel) || {};
    const j1 = !!veille && P().sourceRetours(m) === 'j1';
    const force = veille ? { saleInitial: veille.saleFinal, ...(m.actif && veille.restePropre != null ? { stockInitial: veille.restePropre } : {}) } : null;
    return jouerForce(unite, volsJour, force, j1 ? volsVeille : null, o);
  }

  /**
   * Une journée de la période rejouée seule, d'après son `entree` (ce que la
   * veille lui a laissé dans la période) : la page s'en sert pour montrer la
   * journée choisie telle que la période l'a jouée, au champ près. Une entrée
   * vide (le premier jour) : la journée d'aujourd'hui.
   */
  function jouerAvecEntree(unite, volsJour, entree, o = {}) {
    const e = entree || {}, stock = e.ateliers && e.ateliers.materiel && 'stockInitial' in e.ateliers.materiel;
    const force = Array.isArray(e.saleInitial) ? { saleInitial: e.saleInitial, ...(stock ? { stockInitial: e.ateliers.materiel.stockInitial } : {}) } : null;
    return jouerForce(unite, volsJour, force, force && Array.isArray(e.volsVeille) ? e.volsVeille : null, o);
  }

  /**
   * Le cœur des deux : `force` (sale, stock propre) remplace celui de l'état ; `volsVeille`, en « J+1 ».
   * En rejeu (évolution 11 f) : `o.planningDuJour`, les lignes du planning de ce jour (moteur/planning.js) ;
   * `o.facteurs`, le facteur de travail de chaque service (le calage du travail).
   */
  function jouerForce(unite, volsJour, force, volsVeille, o) {
    const m = (unite.etat && unite.etat.materiel) || {}, j1 = Array.isArray(volsVeille);
    // Le même validateur que « Restaurer » et que l'outil d'une journée : la même journée, au champ près.
    const etat = force ? A().valider({ ...unite.etat, materiel: { ...m, ...force } }) : unite.etat;
    const decaler = l => J().volsDecales(l, o.decalage);
    const brut = J().argumentsDeLUnite({ ...unite, etat }, decaler(volsJour), { delaiChargement: o.delaiChargement, ...(j1 ? { volsVeille: decaler(volsVeille) } : {}) });
    // Un jour du planning : ses équipes, à effectif imposé ; des heures sup jusqu'à 12 h.
    const lignes = o.planningDuJour && o.planningDuJour.length ? o.planningDuJour : null;
    const jour = lignes ? PL().argsDuJour(brut, lignes) : brut;
    const args = o.facteurs ? PL().facteursSurArgs(jour, o.facteurs) : jour;
    const entree = !force ? {} : { saleInitial: clone(etat.materiel.saleInitial ?? []),
      ...('stockInitial' in force ? { ateliers: { materiel: { stockInitial: etat.materiel.stockInitial } } } : {}), ...(j1 ? { volsVeille: clone(volsVeille) } : {}) };
    return { resultat: J().jouer(args), args, entree };
  }

  /** Une période à jouer jour après jour : `suivant()` joue la journée suivante (la page avance ainsi sans se figer). */
  function creerPeriode(unite, vols, o = {}) {
    const d = decrire(vols);
    if (!d) throw new Error('le programme de vols n’est pas daté : une seule journée se simule (colonne date, docs/FORMATS_EXCEL.md).');
    const jours = joursEntre(d.debut, d.fin), journees = [];
    let veille = null;
    return {
      description: d, jours, total: jours.length,
      get fait() { return journees.length; },
      get fini() { return journees.length >= jours.length; },
      /** Joue la journée suivante ; rend sa date, ou null quand tout est joué. */
      suivant() {
        const i = journees.length;
        if (i >= jours.length) return null;
        const date = jours[i], dj = o.planning && o.planning.jours ? { ...o, planningDuJour: o.planning.jours[date] || null } : o;
        const j = jouerJournee(unite, volsDuJour(vols, date), i ? volsDuJour(vols, jours[i - 1]) : null, veille, dj);
        veille = { saleFinal: j.resultat.saleFinal || [], restePropre: j.resultat.materiel ? j.resultat.materiel.restePropre : null };
        const n = d.parJour[i];
        journees.push({ date, departs: n.departs, retours: n.retours, entree: j.entree, extrait: extraire(j.resultat, j.args, date), ...(o.detail ? { resultat: j.resultat } : {}) });
        return date;
      },
      /** La période jouée (jusqu'où elle l'est) : sa description, son bilan, ses journées. */
      resultat() {
        const b = bilan(journees, unite, d);
        // Un rejeu (évolution 11 f) : les jours de vols rejoués avec leur planning, et les facteurs de travail essayés ;
        // chaque jour de travail dit si toutes ses journées de vols avaient le leur (`planning`).
        const pj = (o.planning && o.planning.jours) || {};
        const rejeu = o.planning ? { joursAvecPlanning: jours.filter(x => pj[x]).length, ...(o.facteurs ? { facteurs: o.facteurs } : {}) } : null;
        if (rejeu) for (const w of b.joursTravail) w.planning = b.decalages.every(k => !!pj[jourDecale(w.date, -k)]);
        return { periode: { schema: 'ory-periode', version: 1, debut: d.debut, fin: d.fin, jours: d.jours, joursSansVol: d.sansVol,
          joursIncomplets: b.joursTravail.filter(x => !x.complet).map(x => x.date), joues: journees.length, ...(rejeu ? { rejeu } : {}) }, bilan: b, journees };
      }
    };
  }

  /** La période entière : toutes ses journées jouées. */
  function simulerPeriode(unite, vols, o) {
    const p = creerPeriode(unite, vols, o);
    while (p.suivant()) { /* jour après jour */ }
    return p.resultat();
  }

  /** La période d'une sauvegarde (« Tout sauvegarder ») et d'un programme daté, avec les options de l'outil d'une journée. */
  function depuisSauvegarde(sauvegarde, vols, options, o = {}) {
    const opt = options || {};
    if (opt.decalage !== undefined && !(Number.isInteger(+opt.decalage) && +opt.decalage >= -60 && +opt.decalage <= 60))
      throw new Error('Décalage attendu : un nombre entier de -60 à 60 minutes.');
    if (opt.volsVeille !== undefined) throw new Error('option « volsVeille » : une période trouve elle-même les vols de la veille.');
    const unite = J().uniteDeLaSauvegarde(sauvegarde, opt);
    return simulerPeriode(unite, vols, { ...o, delaiChargement: J().delaiDe(opt), decalage: opt.decalage });
  }

  /** Les options de l'outil d'une journée pour rejouer une journée de la période : celles de la période, et ce que la veille lui laisse. */
  function optionsDeRejeu(options, entree) {
    const o = { ...(options || {}), ...entree };
    if (entree.ateliers) o.ateliers = J().fondre((options && options.ateliers) || {}, entree.ateliers);
    return o;
  }

  /* ----------------------------------------------------------------------
   *  L'extrait d'une journée : ce que le bilan et l'export de la période en
   *  gardent (la page ne garde pas le résultat complet de chaque journée)
   * --------------------------------------------------------------------*/

  const somme = (l, f) => l.reduce((n, x) => n + (f(x) || 0), 0);
  const fini = x => (Number.isFinite(x) ? x : null);

  /**
   * La charge d'une équipe, en ETP, non arrondie (banc d'essai, évolution 11 a) :
   *   — calculée (à la main, hors tunnel, robot de l'évolution 9) : son besoin exact ;
   *   — un robot ou une plonge à effectif saisi : les homme-minutes de ses lots ÷ les minutes de son poste
   *     (pendant un lot : l'équipe du robot ; à la plonge, les personnes du tunnel qui lave, ou de ceux qui tournent ;
   *     un lot que la fin du poste interrompt compte ce qui en a été fait, un lot jamais commencé rien) ;
   *   — toute autre équipe : personnes × sa présence ÷ la présence du réglage général.
   * `def` : l'équipe telle que la journée l'a reçue ; `v` : ce que la journée en rend ; `ls` : ses lots ; `besoin` : son besoin exact.
   */
  function chargeEquipe(def, v, ls, e, besoin, regime) {
    if (e) return besoin;
    if (def && (v.type === 'robot' || v.type === 'lavage')) {
      let poste = null;
      try { poste = P().minutesDuPoste(def, regime); } catch (x) { poste = null; }
      const fait = l => (l.impossible ? +l.fait || 0 : l.duree || 0);
      if (poste > 0) return somme(ls, l => fait(l) * personnesDuLot(v, def, l)) / poste;
    }
    return presenceRelative(v.personnes || 0, v.presence, regime);
  }
  /** Les personnes qui tiennent un lot : à la plonge, celles de son tunnel (ou des tunnels qui tournent) ; ailleurs, l'équipe. */
  function personnesDuLot(v, def, l) {
    if (v.type !== 'lavage' || !Array.isArray(def.tunnels) || !def.tunnels.length) return v.personnes || 0;
    const tournent = P().tunnelsQuiTournent({ ...def, personnes: v.personnes }).tournent;
    const qui = Number.isInteger(l.tunnel) ? [tournent[l.tunnel - 1]].filter(Boolean) : tournent;
    return somme(qui, t => +t.personnes);
  }
  /**
   * Les heures sup d'office (banc d'essai, évolution 11 e), en minutes × personnes : une présence plus longue que la
   * présence au contrat, chaque jour, pour chaque personne. Sans présence au contrat : 0. Sans présence (pas de fin de
   * poste) : la présence générale.
   */
  function heuresSupOffice(personnes, presence, contrat, regime) {
    if (!Number.isFinite(contrat)) return 0;
    const p = Number.isFinite(presence) && presence > 0 ? presence : P().normaliserRegime(null, regime).presence;
    return Math.max(0, p - contrat) * (personnes || 0);
  }
  /** L'encadrement d'un service, ses deux formes : un nombre (l'ancienne), ou { personnes, presence, presenceContrat }. */
  const encadrementDe = x => (x && typeof x === 'object' ? x : { personnes: +x || 0 });
  /**
   * L'encadrement saisi d'un service, un jour : ses personnes, sa charge (ses personnes × sa présence ÷ la présence
   * générale ; l'ancienne forme : ses personnes) et ses heures sup d'office (évolution 11 e). La période et la
   * Synthèse de la journée (le prévu calé) le comptent ainsi.
   */
  function encadrementDuJour(x, regime) {
    const e = encadrementDe(x), personnes = e.personnes || 0;
    return { personnes, charge: presenceRelative(personnes, e.presence, regime), heuresSupOffice: heuresSupOffice(personnes, e.presence, e.presenceContrat, regime) };
  }

  /** Des personnes présentes `presence` minutes, rapportées à la présence du réglage général (sans fin de poste : la présence générale). */
  function presenceRelative(personnes, presence, regime) {
    const generale = P().normaliserRegime(null, regime).presence;
    return Number.isFinite(presence) && presence > 0 && generale > 0 ? personnes * presence / generale : personnes;
  }

  function extraire(r, args, date) {
    const parClasse = r.parClasse || {}, classes = new Map((r.classes || []).map(c => [c.id, c]));
    const bareme = args.bareme || {}, effectifs = r.effectifs || {};
    const lots = (r.lots || []).filter(l => l.atelier && !l.dispo);
    const parEquipe = new Map();
    for (const l of lots) { if (!parEquipe.has(l.atelier)) parEquipe.set(l.atelier, []); parEquipe.get(l.atelier).push(l); }
    // L'échéance d'un lot : la limite du vol qu'il charge (handling), sinon la plus proche de ses commandes.
    const echeanceDe = l => (Number.isFinite(l.limite) ? l.limite
      : (l.classes || []).reduce((m, id) => Math.min(m, parClasse[id] && Number.isFinite(parClasse[id].echeance) ? parClasse[id].echeance : Infinity), Infinity));
    const enRetard = l => l.fin != null && Number.isFinite(echeanceDe(l)) && l.fin > echeanceDe(l) + 1e-9;
    // Un lot de plusieurs compagnies se répartit au prorata des minutes du barème × vols de chacune.
    const poids = (service, c) => (P().minutesParVol(bareme[service], c) ?? 0) * ((c.vols || []).length);
    const paxDuVol = l => (l.pax && typeof l.pax === 'object' ? somme(Object.values(l.pax), x => +x) : 0);
    const definitions = new Map((args.ateliers || []).map(a => [a.id, a]));
    const equipes = (r.ateliers || []).map(a => {
      const ls = parEquipe.get(a.id) || [], e = effectifs[a.id], cies = {};
      // Le besoin exact : homme-minutes ÷ poste ÷ rendement pour une équipe à effectif calculé, ses personnes sinon.
      const besoin = e && e.poste > 0 ? e.hommeMinutes / e.poste / (e.rendement || 1) : (a.personnes || 0);
      const cie = k => (cies[k] = cies[k] || { classes: {}, vols: [], hommeMinutes: 0, retardMax: null });
      const vol = (x, id) => { if (id != null && !x.vols.includes(String(id))) x.vols.push(String(id)); };
      const tard = new Set();
      let retardMax = null;
      for (const l of ls) {
        const ech = echeanceDe(l), retard = enRetard(l) ? l.fin - ech : null;
        if (retard != null) retardMax = Math.max(retardMax ?? 0, retard);
        const ids = (l.classes || []).filter(id => classes.has(id));
        if (l.handling || l.retourVol || !ids.length) {
          if (!l.cie) continue;
          const x = cie(up(l.cie)); x.hommeMinutes += l.hommeMinutes || 0; vol(x, String(l.vol ?? '').replace(/^Vol /, ''));
          if (l.handling) for (const id of ids) x.classes[id] = classes.get(id).pax || 0;
          if (retard != null) { x.retardMax = Math.max(x.retardMax ?? 0, retard); for (const id of ids) tard.add(id); }
          continue;
        }
        const w = ids.map(id => poids(a.service, classes.get(id))), tot = somme(w, x => x);
        ids.forEach((id, k) => {
          const c = classes.get(id), x = cie(up(c.cie));
          x.hommeMinutes += (l.hommeMinutes || 0) * (tot > 0 ? w[k] / tot : 1 / ids.length);
          x.classes[id] = c.pax || 0;
          for (const v of c.vols || []) vol(x, v.id);
          const re = l.fin != null && parClasse[id] && Number.isFinite(parClasse[id].echeance) && l.fin > parClasse[id].echeance + 1e-9 ? l.fin - parClasse[id].echeance : null;
          if (re != null) { x.retardMax = Math.max(x.retardMax ?? 0, re); tard.add(id); }
        });
      }
      const plan = a.planChauffeurs || null, volsH = a.type === 'handling' ? (r.vols || []).filter(v => v.atelier === a.id) : [];
      return {
        id: a.id, nom: a.nom, service: a.service, type: a.type, jour: a.jour || 0,
        personnes: a.personnes || 0, calcule: !!e,
        besoin,
        // Sa charge, en ETP (évolution 11 a) : son besoin exact, ou ce que ses personnes occupent.
        charge: chargeEquipe(definitions.get(a.id), a, ls, e, besoin, args.regime),
        // Ses heures sup d'office (évolution 11 e) : sa présence au-delà de son contrat.
        heuresSupOffice: heuresSupOffice(a.personnes, a.presence, (definitions.get(a.id) || {}).presenceContrat, args.regime),
        hommeMinutes: somme(ls, l => l.hommeMinutes),
        debutPoste: fini(a.debutPoste), finPresence: Number.isFinite(a.debutPoste) && Number.isFinite(a.presence) ? a.debutPoste + a.presence : null,
        fin: fini(a.fin), travail: a.travail || 0, attente: a.attente || 0, pauses: a.arret || 0,
        heuresSup: (a.heuresSupPersonnes || 0) + (a.renfortsHeuresSup || 0), renfortsPretes: a.renfortsPretes || 0, renfortsRecus: a.renfortsRecus || 0,
        lots: ls.length, lotsEnRetard: ls.filter(enRetard).length, commandesEnRetard: [...tard].sort(), retardMax,
        ...(a.conditionSale ? { ouverte: !!a.conditionSale.ouverte } : {}),
        ...(a.type === 'lavage' ? { volsLaves: ls.filter(l => l.vol != null).length } : {}),
        ...(a.type === 'handling' ? { volsCharges: volsH.filter(v => v.fin != null).length, volsEnRetard: volsH.filter(v => !v.aHeure).length,
          chauffeurs: plan ? { camion: plan.chauffeurs.camion, vl: plan.chauffeurs.vl } : null, borneBasse: plan ? plan.borneBasse.total : null,
          heuresSupChauffeurs: a.heuresSupChauffeurs || 0 } : {}),
        compagnies: cies
      };
    });
    const k = r.indicateurs || {};
    const sale = l => Math.round(somme(l || [], x => +x.unites) * 100) / 100;
    return {
      date, ok: r.ok !== false, anomalies: (r.anomalies || []).length,
      indicateurs: { commandes: k.classesSuivies || 0, aHeure: k.aHeure || 0, enRetard: k.enRetard || 0, pasFinies: k.pasFinies || 0,
        retardMax: k.retardMax || 0, vols: k.volsSuivis || 0, volsCharges: k.volsCharges || 0, volsAHeure: k.volsAHeure || 0, retardVolMax: k.retardVolMax ?? null,
        hommeMinutes: Math.round((k.hommeHeures || 0) * 60 * 1000) / 1000 },
      saleInitial: sale(Array.isArray(args.materiel && args.materiel.saleInitial) ? args.materiel.saleInitial : [{ unites: +(args.materiel && args.materiel.saleInitial) || 0 }]),
      saleFinal: sale(r.saleFinal), stockInitial: r.materiel ? r.materiel.stockInitial : null, stockPropre: r.materiel ? r.materiel.restePropre : null,
      nuits: equipes.filter(e => 'ouverte' in e).map(e => ({ equipe: e.id, ouverte: e.ouverte })),
      chauffeurs: equipes.filter(e => e.type === 'handling' && e.chauffeurs).map(e => ({ equipe: e.id, ...e.chauffeurs, borneBasse: e.borneBasse, heuresSup: e.heuresSupChauffeurs })),
      equipes,
      // Les lignes de l'export : les lots, les vols et leur chargement, les vols lavés.
      lots: lots.map(l => ({ equipe: l.atelier, service: l.service, commande: l.nom, classes: (l.classes || []).slice(), debut: fini(l.debut), fin: fini(l.fin),
        duree: fini(l.duree), attente: l.attente || 0, hommeMinutes: l.hommeMinutes || 0, echeance: fini(echeanceDe(l)),
        marge: l.fin != null && Number.isFinite(echeanceDe(l)) ? echeanceDe(l) - l.fin : null })),
      vols: (r.vols || []).map(v => ({ id: v.id, cie: v.cie, depart: v.depart, pret: fini(v.pret), atelier: v.atelier || null, arrivee: fini(v.arrivee),
        dechargementDebut: v.dechargement ? fini(v.dechargement.debut) : null, dechargementFin: v.dechargement ? fini(v.dechargement.fin) : null,
        debut: fini(v.debut), fin: fini(v.fin), vehicule: v.vehicule || null, tournee: v.tournee ?? null, limite: fini(v.limite),
        retard: fini(v.retard), aHeure: !!v.aHeure, cause: v.cause || null })),
      plonge: lots.filter(l => l.vol != null && (r.ateliers || []).some(a => a.id === l.atelier && a.type === 'lavage')).map(l => ({ vol: l.vol, cie: l.cie || null,
        arrivee: fini(l.arrivee), equipe: l.atelier, tunnel: l.nomTunnel || (l.tunnel != null ? String(l.tunnel) : null), debut: fini(l.debut), fin: fini(l.fin), attente: l.attente || 0 })),
      noms: args.noms || {}
    };
  }

  /* ----------------------------------------------------------------------
   *  Le bilan par jour de travail
   * --------------------------------------------------------------------*/

  /** Les mesures qui s'additionnent d'un jour, d'une équipe, d'un service à l'autre ; `retardMax` se prend au plus haut. */
  const ADDITIVES = ['personnes', 'besoin', 'hommeMinutes', 'heuresSup', 'renfortsPretes', 'renfortsRecus', 'lots', 'lotsEnRetard', 'commandesEnRetard',
    'volsCharges', 'volsEnRetard', 'chauffeursCamion', 'chauffeursVL', 'borneBasse', 'heuresSupChauffeurs', 'volsLaves', 'encadrement',
    // L'arrondi au service (évolution 11 a) : la charge de ses équipes, ⌈charge⌉, et ce que l'arrondi équipe par équipe ajoute.
    'charge', 'personnesService', 'surplusArrondi', 'chargeEncadrement',
    // Les heures sup d'office (évolution 11 e) : des équipes, et de l'encadrement, à part.
    'heuresSupOffice', 'heuresSupOfficeEncadrement'];
  const vide = () => Object.fromEntries(ADDITIVES.map(k => [k, 0]).concat([['retardMax', null]]));
  function ajouter(m, x) {
    for (const k of ADDITIVES) m[k] += x[k] || 0;
    if (x.retardMax != null) m.retardMax = Math.max(m.retardMax ?? 0, x.retardMax);
    return m;
  }
  /** Les mesures d'une équipe un jour de travail. */
  const mesuresEquipe = e => ({ personnes: e.personnes, besoin: e.besoin, hommeMinutes: e.hommeMinutes, heuresSup: e.heuresSup,
    renfortsPretes: e.renfortsPretes, renfortsRecus: e.renfortsRecus, lots: e.lots, lotsEnRetard: e.lotsEnRetard, commandesEnRetard: e.commandesEnRetard.length,
    retardMax: e.retardMax, volsCharges: e.volsCharges || 0, volsEnRetard: e.volsEnRetard || 0,
    chauffeursCamion: e.chauffeurs ? e.chauffeurs.camion : 0, chauffeursVL: e.chauffeurs ? e.chauffeurs.vl : 0, borneBasse: e.borneBasse || 0,
    heuresSupChauffeurs: e.heuresSupChauffeurs || 0, volsLaves: e.volsLaves || 0, encadrement: 0, charge: e.charge || 0,
    heuresSupOffice: e.heuresSupOffice || 0 });

  /**
   * Le bilan de la période, par jour de travail : chaque équipe d'une journée de
   * vols compte au jour des vols + son `jour` (la cuisine à J−2 des vols du 12
   * travaille le 10 ; une plonge de nuit, le jour où elle commence). Pour chaque
   * jour de travail : par service, par équipe et par compagnie. Un jour de
   * travail est incomplet quand une de ses journées de vols manque (avant le
   * premier jour de vols, en fin de période) : il est montré, marqué, et sort
   * des totaux et des moyennes, par mois et sur la période.
   */
  function bilan(journees, unite, d) {
    const etat = (unite && unite.etat) || {}, encadrement = etat.encadrement || {};
    const regime = unite && unite.modele ? unite.modele.regime : undefined;
    const decalages = [...new Set(((etat.ateliers || []).map(a => a.jour || 0)).concat(journees.flatMap(j => j.extrait.equipes.map(e => e.jour))).concat([0]))].sort((x, y) => x - y);
    const servicesDeLUnite = [...new Set((etat.ateliers || []).map(a => a.service).concat(journees.flatMap(j => j.extrait.equipes.map(e => e.service))))];
    const noms = Object.assign({}, ...journees.map(j => j.extrait.noms || {}));
    const nomDe = s => noms[s] || s;
    const services = servicesDeLUnite.map(id => ({ id, nom: nomDe(id) })).sort((x, y) => x.nom.localeCompare(y.nom) || x.id.localeCompare(y.id));
    const equipesVues = new Map();
    for (const j of journees) for (const e of j.extrait.equipes) if (!equipesVues.has(e.id)) equipesVues.set(e.id, { id: e.id, nom: e.nom, service: e.service, type: e.type, jour: e.jour });
    const equipes = [...equipesVues.values()].sort((x, y) => nomDe(x.service).localeCompare(nomDe(y.service)) || x.jour - y.jour || x.nom.localeCompare(y.nom) || x.id.localeCompare(y.id));
    if (!journees.length) return { debut: d.debut, fin: d.fin, decalages, services, equipes, joursTravail: [], mois: [], periode: { jours: 0, joursIncomplets: [], total: vide(), moyenne: vide() } };
    // Les jours de travail : du premier jour de vols + le décalage le plus tôt, au dernier + le plus tard.
    const joues = new Set(journees.map(j => j.date)), premier = journees[0].date, dernier = journees[journees.length - 1].date;
    const W = joursEntre(jourDecale(premier, decalages[0]), jourDecale(dernier, decalages[decalages.length - 1])).map(date => {
      const manque = [...new Set(decalages.map(k => jourDecale(date, -k)).filter(x => !joues.has(x)))].sort();
      return { date, complet: !manque.length, manque, services: {}, equipes: {}, compagnies: {}, total: vide(), saleSoir: null, nuits: [] };
    });
    const parDate = new Map(W.map(w => [w.date, w]));
    for (const j of journees) {
      const vu = parDate.get(j.date);
      if (vu) { vu.saleSoir = j.extrait.saleFinal; }
      for (const e of j.extrait.equipes) {
        const w = parDate.get(jourDecale(j.date, e.jour)); if (!w) continue;
        const s = w.services[e.service] = w.services[e.service] || { ...vide(), _tard: new Set(), compagnies: {} };
        const m = mesuresEquipe(e);
        w.equipes[e.id] = { ...m, service: e.service, vols: j.date, ...('ouverte' in e ? { ouverte: e.ouverte } : {}) };
        ajouter(s, { ...m, commandesEnRetard: 0 });
        for (const id of e.commandesEnRetard) s._tard.add(id);
        if ('ouverte' in e) w.nuits.push({ equipe: e.id, ouverte: e.ouverte });
        for (const [cie, x] of Object.entries(e.compagnies)) {
          const c = s.compagnies[cie] = s.compagnies[cie] || { _classes: {}, _vols: new Set(), hommeMinutes: 0, retardMax: null };
          Object.assign(c._classes, x.classes); for (const v of x.vols) c._vols.add(v);
          c.hommeMinutes += x.hommeMinutes; if (x.retardMax != null) c.retardMax = Math.max(c.retardMax ?? 0, x.retardMax);
        }
      }
    }
    for (const w of W) {
      // L'encadrement saisi par service, une fois par jour ; les commandes en retard comptées une fois par service.
      for (const s of services) if (encadrement[s.id]) {
        const x = w.services[s.id] = w.services[s.id] || { ...vide(), _tard: new Set(), compagnies: {} };
        // Sa charge, à part (évolution 11 a) : ses personnes × sa présence ÷ la présence générale ; ses heures sup d'office (évolution 11 e).
        const enc = encadrementDuJour(encadrement[s.id], regime);
        x.encadrement = enc.personnes; x.chargeEncadrement = enc.charge; x.heuresSupOfficeEncadrement = enc.heuresSupOffice;
      }
      for (const [id, s] of Object.entries(w.services)) {
        s.commandesEnRetard = s._tard.size; delete s._tard;
        // L'arrondi au service : ses équipes arrondies une fois, ensemble (évolution 11 a).
        s.personnesService = Math.ceil(s.charge - 1e-9) || 0; s.surplusArrondi = s.personnes - s.personnesService;
        for (const c of Object.values(s.compagnies)) {
          c.commandes = Object.keys(c._classes).length; c.pax = somme(Object.values(c._classes), x => x); c.vols = c._vols.size;
          delete c._classes; delete c._vols;
        }
        ajouter(w.total, s);
        w.services[id] = s;
      }
    }
    // Totaux et moyennes, sur les jours complets seulement : par mois et sur la période.
    const cumul = liste => {
      const total = vide(), parService = {}, maxJour = [];
      for (const w of liste) {
        ajouter(total, w.total); maxJour.push(w.total.retardMax ?? 0);
        for (const [id, s] of Object.entries(w.services)) ajouter(parService[id] = parService[id] || vide(), s);
      }
      const n = liste.length, moyenne = m => Object.fromEntries(ADDITIVES.map(k => [k, n ? m[k] / n : 0]).concat([['retardMax', m.retardMax]]));
      return { jours: n, total: { ...total, services: parService }, moyenne: { ...moyenne(total), retardMax: n ? somme(maxJour, x => x) / n : null,
        services: Object.fromEntries(Object.entries(parService).map(([id, m]) => [id, moyenne(m)])) } };
    };
    const complets = W.filter(w => w.complet);
    const mois = [...new Set(W.map(w => w.date.slice(0, 7)))].map(mo => ({ mois: mo, ...cumul(complets.filter(w => w.date.startsWith(mo))),
      joursIncomplets: W.filter(w => !w.complet && w.date.startsWith(mo)).map(w => w.date) }));
    return { debut: d.debut, fin: d.fin, decalages, services, equipes, joursTravail: W, mois,
      periode: { ...cumul(complets), joursIncomplets: W.filter(w => !w.complet).map(w => w.date) } };
  }

  const api = { JOUR, jourDecale, ecart, joursEntre, dateCourte, dateLongue, estDate, datesDu, volsDuJour, decrire, texteDuProgramme,
    jouerJournee, jouerAvecEntree, creerPeriode, simulerPeriode, depuisSauvegarde, optionsDeRejeu, extraire, bilan, encadrementDuJour, ADDITIVES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPeriode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
