/* ==========================================================================
 *  LES INDICATEURS DE CHARGE D'UNE JOURNÉE
 *  (banc d'essai de la version 1, évolution 12 — docs/BANC_ESSAI.md § 13)
 *  ------------------------------------------------------------------------
 *  Pour chaque équipe et chaque service : combien de personnes sont
 *  présentes, au travail, en pause ou sans travail à chaque moment de la
 *  journée, combien de lots attendent, combien d'unités sortent ; et, pour
 *  le jour, l'occupation (K3), le consommé sur disponible (K6), le débit
 *  (K5), la file la plus longue (K4), les ETP présents (K8) et les pics.
 *
 *  Ce module, sans navigateur, LIT le résultat d'une journée (moteur/
 *  production.js) et ses arguments ; il ne change rien au calcul. La page,
 *  les outils et les exports l'appellent : un seul chemin.
 *
 *  Les créneaux font 15 minutes, alignés sur l'heure, sur l'horloge du jour
 *  de travail : une équipe à J−1 se place sur son propre jour (06:00 de la
 *  veille compte 06:00), comme dans le bilan de la période. Un service a donc
 *  une série par jour de travail où ses équipes travaillent.
 *
 *  L'occupation et le consommé se comptent en minutes × personnes : pour une
 *  équipe à la main ou un robot, c'est la même chose que des minutes ; à une
 *  plonge à tunnels, seules les personnes d'un tunnel qui lave sont au travail.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./production.js') : root.MoteurProduction);

  const PAS = 15, JOUR = 1440;
  const MESURES = ['presents', 'auTravail', 'enPause', 'sansTravail', 'enFile', 'termines'];
  const net = x => Math.round(x * 1e6) / 1e6;
  const somme = (l, f) => l.reduce((n, x) => n + (f(x) || 0), 0);
  const fini = x => Number.isFinite(x);

  /* ----------------------------------------------------------------------
   *  Des intervalles, et ce qu'ils déposent dans les créneaux
   * --------------------------------------------------------------------*/

  /** Des intervalles [de, a) triés et réunis. */
  function reunir(liste) {
    const out = [];
    for (const x of liste.filter(x => x.a > x.de).sort((p, q) => p.de - q.de)) {
      const d = out[out.length - 1];
      if (d && x.de <= d.a) d.a = Math.max(d.a, x.a); else out.push({ de: x.de, a: x.a });
    }
    return out;
  }
  /** L'intervalle [de, a) moins des intervalles réunis : ce qui reste, en morceaux. */
  function moins(de, a, retirer) {
    const out = [];
    let t = de;
    for (const r of retirer) {
      if (r.a <= t || r.de >= a) continue;
      if (r.de > t) out.push({ de: t, a: r.de });
      t = Math.max(t, r.a);
    }
    if (a > t) out.push({ de: t, a });
    return out;
  }
  const longueur = l => somme(l, x => x.a - x.de);

  /** Une série de créneaux : créneau → personnes × minutes (ou unités), sur l'horloge du jour de travail. */
  const serie = () => new Map();
  /** Dépose `n` personnes sur [de, a) : chaque créneau reçoit n × les minutes qu'il en couvre. */
  function deposer(s, de, a, n) {
    if (!(a > de) || !n) return;
    for (let k = Math.floor(de / PAS); k * PAS < a; k++) {
      const part = Math.min(a, (k + 1) * PAS) - Math.max(de, k * PAS);
      if (part > 0) s.set(k, (s.get(k) || 0) + n * part);
    }
  }
  /** Des unités finies à l'instant `t` : dans le créneau qui finit à `t` ou après, pas avant celui où leur travail a commencé. */
  function compter(s, t, n, debut) {
    const k = Math.max(Math.ceil(t / PAS - 1e-9) - 1, fini(debut) ? Math.floor(debut / PAS + 1e-9) : -Infinity);
    s.set(k, (s.get(k) || 0) + n);
  }

  /* ----------------------------------------------------------------------
   *  Une équipe
   * --------------------------------------------------------------------*/

  const RAISONS = { dispo: 'mise à disposition', appui: 'équipe d’appui', handling: 'handling' };
  const UNITES = { manuel: 'repas', robot: 'plateaux', handling: 'vols chargés' };

  /** Les personnes qui tiennent un lot de plonge : celles de son tunnel, ou de ceux qui tournent ; sans liste de tunnels, l'équipe. */
  function personnesDuLavage(v, def, l) {
    if (!def || !Array.isArray(def.tunnels) || !def.tunnels.length) return v.personnes || 0;
    const tournent = P().tunnelsQuiTournent({ ...def, personnes: v.personnes }).tournent;
    const qui = Number.isInteger(l.tunnel) ? [tournent[l.tunnel - 1]].filter(Boolean) : tournent;
    return somme(qui, t => +t.personnes);
  }

  /** La fin de la présence d'une équipe : son début de poste + sa présence + ses heures sup ; sans présence, la fin de son travail. */
  function finPresence(v) {
    if (fini(v.presence)) return v.debutPoste + v.presence + (v.heuresSup || 0);
    return Math.max(v.debutPoste, fini(v.fin) ? v.fin : v.debutPoste);
  }

  /** Les présents d'une équipe : [{ de, a, n }], en minutes du jour J. */
  function presencesDe(v, def, plan) {
    if (v.type === 'handling') return plan;
    if (v.type === 'dispo') {
      // Une mise à disposition compte présente à son heure et son jour saisis, pour sa présence.
      const debut = def ? P().minutes(def.debut) + (def.jour || 0) * JOUR : v.debutPoste;
      return fini(debut) && fini(v.presence) ? [{ de: debut, a: debut + v.presence, n: v.personnes || 0 }] : null;
    }
    if (!fini(v.debutPoste)) return null;
    const parTunnel = v.type === 'lavage' && v.heuresSup > 0 && def && Array.isArray(def.tunnels) && def.tunnels.length && v.lots.some(l => Number.isInteger(l.tunnel));
    if (!parTunnel) return [{ de: v.debutPoste, a: finPresence(v), n: v.personnes || 0 }];
    // Une plonge à tunnels en heures sup : seules les personnes des tunnels qui finissent un vol après sa présence restent.
    const fp = v.debutPoste + v.presence, out = [{ de: v.debutPoste, a: fp, n: v.personnes || 0 }];
    const tournent = P().tunnelsQuiTournent({ ...def, personnes: v.personnes }).tournent;
    tournent.forEach((t, i) => {
      const fin = Math.max(-Infinity, ...v.lots.filter(l => l.tunnel === i + 1 && fini(l.fin)).map(l => l.fin));
      if (fin > fp) out.push({ de: fp, a: fin, n: +t.personnes || 0 });
    });
    return out;
  }

  /** Les chauffeurs du plan d'un handling, ou ses créneaux de chauffeurs saisis : [{ de, a, n }] ; null sans vacation. */
  function chauffeursDe(v, def) {
    const plan = v.planChauffeurs && Array.isArray(v.planChauffeurs.vacations) ? v.planChauffeurs.vacations : [];
    const saisis = def ? P().creneauxDe(def) : [];
    const l = plan.length ? plan.map(x => ({ de: x.de, a: x.a, n: x.n || 1 })) : saisis.map(x => ({ de: x.de, a: x.a, n: x.n }));
    return l.length ? l : null;
  }

  /** Ce que l'équipe a vraiment fait : [{ de, a, n }] au travail (pauses retirées), et sa durée sur l'horloge. */
  function travailDe(v, def, pauses) {
    const fin = finPresence(v), morceaux = [];
    for (const l of v.lots) {
      if (l.dispo || v.type === 'handling') continue;
      const a = fini(l.fin) ? l.fin : (l.horsPoste && l.fait > 0 ? fin : null);
      if (!fini(a) || !fini(l.debut)) continue;
      const n = v.type === 'lavage' ? personnesDuLavage(v, def, l) : (v.personnes || 0);
      for (const x of moins(l.debut, a, pauses)) morceaux.push({ ...x, n });
    }
    return { morceaux, minutes: longueur(reunir(morceaux)) };
  }

  /** Les lots en file : prêts (tous leurs fournisseurs ont livré), pas encore commencés : [{ de, a }] ; null si sans objet. */
  function fileDe(v) {
    if (v.type === 'lavage') {
      // À la plonge par vol, les vols revenus qui attendent leur tunnel ; au débit, sans objet.
      const vols = v.lots.filter(l => l.retourVol && fini(l.arrivee));
      if (!vols.length && v.lots.some(l => !l.retourVol)) return null;
      return vols.map(l => ({ de: l.arrivee, a: fini(l.debut) ? l.debut : finPresence(v) }));
    }
    // Un lot sans fournisseur est prêt dès l'arrivée de l'équipe ; un lot jamais prêt n'a pas l'instant `pret`.
    return v.lots.filter(l => !l.dispo && 'pret' in l && fini(l.debut))
      .map(l => ({ de: Math.max(fini(l.pret) ? l.pret : v.debutPoste, v.debutPoste), a: l.debut }));
  }

  /** La plus longue file, et son premier instant. */
  function fileMax(file) {
    const ev = file.filter(x => x.a > x.de).flatMap(x => [[x.de, 1], [x.a, -1]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let n = 0, m = { lots: 0, a: null };
    for (const [t, d] of ev) { n += d; if (n > m.lots) m = { lots: n, a: t }; }
    return m;
  }

  /** Les unités finies : [{ t, n }] et leur unité. */
  function terminesDe(v, r, pax) {
    if (v.type === 'handling') return { unite: 'vols chargés', l: (r.vols || []).filter(x => x.atelier === v.id && fini(x.fin)).map(x => ({ t: x.fin, n: 1, debut: x.debut })) };
    if (v.type === 'lavage') {
      const parVol = v.lots.some(l => l.retourVol);
      return { unite: parVol ? 'vols lavés' : 'unités lavées',
        l: v.lots.filter(l => fini(l.fin)).map(l => ({ t: l.fin, n: parVol ? 1 : (+l.unites || 0), debut: l.debut })) };
    }
    if (v.type !== 'manuel' && v.type !== 'robot') return { unite: null, l: [] };
    return { unite: UNITES[v.type], l: v.lots.filter(l => fini(l.fin) && !l.dispo)
      .map(l => ({ t: l.fin, n: v.type === 'robot' && fini(l.plateaux) ? l.plateaux : somme(l.classes || [], id => pax.get(id)), debut: l.debut })) };
  }

  /** Les homme-minutes des lots : le barème d'un lot à la main ; ailleurs, sa durée × les personnes qui le tiennent. */
  function hommeMinutesDe(v, def) {
    return somme(v.lots.filter(l => !l.dispo), l => (fini(l.hommeMinutes) ? l.hommeMinutes
      : (l.impossible ? +l.fait || 0 : +l.duree || 0) * (v.type === 'lavage' ? personnesDuLavage(v, def, l) : (v.personnes || 0))));
  }

  /**
   * Les minutes × personnes de présence hors pauses : le poste de l'équipe (sa présence moins ses pauses, comme
   * l'effectif calculé le compte ; au robot, moins aussi les arrêts de sa ligne, que le moteur lui fait prendre
   * comme des pauses) × ses personnes, plus ses heures sup en minutes × personnes (à une plonge à tunnels, celles
   * des seuls tunnels qui finissent tard).
   */
  function disponibleDe(v, def, ctx, pauses) {
    const n = v.personnes || 0;
    if (!fini(v.presence)) return Math.max(0, finPresence(v) - v.debutPoste - longueur(pauses)) * n;
    let poste = null;
    try { poste = def ? P().minutesDuPoste(def, ctx.regime) : null; } catch (e) { poste = null; }
    if (!fini(poste)) poste = v.presence - longueur(pauses);
    if (v.type === 'robot' && def) {
      const fixes = reunir(P().pausesDe(def)), fin = v.debutPoste + v.presence;
      for (const x of ctx.arretsLigne(def)) for (const y of moins(Math.max(x.de, v.debutPoste), Math.min(x.a, fin), fixes)) poste -= y.a - y.de;
    }
    const sup = fini(v.heuresSupPersonnes) ? v.heuresSupPersonnes : (v.heuresSup || 0) * n;
    return Math.max(0, poste) * n + sup;
  }

  /** Des personnes présentes `presence` minutes, rapportées à la présence du réglage général (sans présence : une par personne). */
  function etpDe(v, regime) {
    const generale = P().normaliserRegime(null, regime).presence, n = v.personnes || 0;
    return fini(v.presence) && v.presence > 0 && generale > 0 ? n * v.presence / generale : n;
  }

  /** Une équipe : ses séries (minutes du jour J) et ses indicateurs du jour. */
  function equipe(v, def, r, ctx) {
    const jour = fini(v.jour) ? v.jour : (def && def.jour) || 0, sansObjet = {}, raison = RAISONS[v.type];
    const pauses = reunir((v.pausesPrises || []).filter(p => fini(p.de) && fini(p.a)));
    const presents = presencesDe(v, def, v.type === 'handling' ? chauffeursDe(v, def) : null);
    if (!presents) sansObjet.presents = v.type === 'handling' ? 'handling sans vacation de chauffeurs' : 'pas de poste';
    const occupe = !raison && fini(v.debutPoste);
    const t = occupe ? travailDe(v, def, pauses) : null, file = occupe ? fileDe(v) : null, fin = terminesDe(v, r, ctx.pax);
    for (const m of ['auTravail', 'enPause', 'sansTravail']) if (!occupe) sansObjet[m] = raison || 'pas de poste';
    if (!file) sansObjet.enFile = raison || (v.type === 'lavage' ? 'plonge au débit' : 'pas de poste');
    const n = v.personnes || 0, base = occupe ? disponibleDe(v, def, ctx, pauses) : null;
    const auTravail = t ? somme(t.morceaux, x => (x.a - x.de) * x.n) + (v.renfortsPretes || 0) : null;
    const hm = occupe ? hommeMinutesDe(v, def) : null, dispo = occupe && n > 0 ? base / n : null;
    if (!fin.unite) sansObjet.termines = raison || 'pas d’unité';
    const termines = somme(fin.l, x => x.n);
    const e = { id: v.id, nom: v.nom, service: v.service, type: v.type, jour, personnes: n, unite: fin.unite,
      minutesPresence: presents ? longueur(reunir(presents)) : null, minutesDisponibles: dispo,
      minutesAuTravail: t ? t.minutes : null, auTravail, enPause: occupe ? longueur(pauses) * n : null, hommeMinutes: hm,
      occupation: occupe && n > 0 && base > 0 ? auTravail / base : null, consommeSurDisponible: occupe && n > 0 && base > 0 ? hm / base : null,
      termines: fin.unite ? termines : null, debit: null, heuresDebit: null, fileMax: file ? fileMax(file) : null, attente: v.attente || 0,
      renfortsPretes: v.renfortsPretes || 0, renfortsRecus: v.renfortsRecus || 0, sansObjet };
    // Au handling, les heures de chargement : la réunion de ses chargements (un camion qui charge trois vols ne compte qu'une fois).
    const heures = v.type === 'handling' ? longueur(reunir(v.lots.filter(l => fini(l.fin) && fini(l.debut)).map(l => ({ de: l.debut, a: l.fin })))) / 60 : (t ? t.minutes / 60 : 0);
    if (heures > 0 && fin.unite) { e.debit = termines / heures; e.heuresDebit = heures; }
    if (occupe && !(n > 0 && base > 0)) sansObjet.occupation = sansObjet.consommeSurDisponible = 'aucune personne';
    if (raison && v.type !== 'handling') sansObjet.occupation = sansObjet.consommeSurDisponible = sansObjet.debit = raison;
    if (v.type === 'handling') sansObjet.occupation = sansObjet.consommeSurDisponible = raison;
    if (e.debit === null && !sansObjet.debit) sansObjet.debit = fin.unite ? 'aucun travail' : 'pas d’unité';
    return { e, jour, series: seriesDe(v, jour, presents, t, pauses, file, fin.l, occupe, fin.unite) };
  }

  /** Les séries d'une équipe sur l'horloge de son jour de travail. */
  function seriesDe(v, jour, presents, t, pauses, file, finis, occupe, unite) {
    const d = jour * JOUR, s = Object.fromEntries(MESURES.map(m => [m, null]));
    if (presents) { s.presents = serie(); for (const x of presents) deposer(s.presents, x.de - d, x.a - d, x.n); }
    if (occupe) {
      s.auTravail = serie(); for (const x of t.morceaux) deposer(s.auTravail, x.de - d, x.a - d, x.n);
      s.enPause = serie(); for (const p of pauses) deposer(s.enPause, p.de - d, p.a - d, v.personnes || 0);
      s.sansTravail = serie();
    }
    if (file) { s.enFile = serie(); for (const x of file) deposer(s.enFile, x.de - d, x.a - d, 1); }
    if (unite) { s.termines = serie(); for (const x of finis) compter(s.termines, x.t - d, x.n, fini(x.debut) ? x.debut - d : null); }
    return s;
  }

  /* ----------------------------------------------------------------------
   *  Les créneaux d'un groupe d'équipes (un service, un jour de travail)
   * --------------------------------------------------------------------*/

  /** Les créneaux d'équipes dont les séries ont la même horloge : { debut, presents: { debut, valeurs } | null, … }. */
  function creneaux(listes) {
    const ks = listes.flatMap(s => MESURES.flatMap(m => (s[m] ? [...s[m].keys()] : [])));
    if (!ks.length) return { debut: null, ...Object.fromEntries(MESURES.map(m => [m, null])) };
    const k0 = Math.min(...ks), k1 = Math.max(...ks), out = { debut: k0 * PAS };
    for (const m of MESURES) {
      const avec = listes.filter(s => s[m]);
      if (!avec.length) { out[m] = null; continue; }
      const valeurs = [];
      for (let k = k0; k <= k1; k++) {
        if (m === 'sansTravail') {
          // Présents − au travail − en pause, équipe par équipe : celles qui ont une occupation.
          valeurs.push(net(somme(avec, s => Math.max(0, ((s.presents && s.presents.get(k)) || 0) - (s.auTravail.get(k) || 0) - (s.enPause.get(k) || 0))) / PAS));
        } else valeurs.push(net(somme(avec, s => s[m].get(k)) / (m === 'termines' ? 1 : PAS)));
      }
      out[m] = { debut: k0 * PAS, valeurs };
    }
    return out;
  }

  /** Le pic d'une série : la valeur la plus haute, et le début de son premier créneau. */
  function pic(c) {
    if (!c) return null;
    let m = null;
    c.valeurs.forEach((x, i) => { if (!m || x > m.personnes) m = { personnes: x, debut: c.debut + i * PAS }; });
    return m;
  }

  /** Les indicateurs d'un service un jour de travail, d'après ses équipes. */
  function service(id, jour, membres, regime) {
    const c = creneaux(membres.map(x => x.series)), equipes = membres.map(x => x.e), sansObjet = {};
    for (const m of MESURES) if (!c[m]) sansObjet[m] = (equipes.find(e => e.sansObjet[m]) || { sansObjet: {} }).sansObjet[m] || 'sans objet';
    const occ = equipes.filter(e => e.occupation !== null && e.personnes > 0);
    const travail = equipes.filter(e => e.auTravail !== null);
    return {
      service: id, jour, equipes: equipes.map(e => e.id),
      etp: somme(membres, x => x.etp),
      heuresAuTravail: travail.length ? somme(travail, e => e.auTravail) / 60 : null,
      picAuTravail: pic(c.auTravail), picPresents: pic(c.presents),
      // L'occupation des équipes qui en ont une, pondérée par leurs personnes.
      occupation: occ.length ? somme(occ, e => e.occupation * e.personnes) / somme(occ, e => e.personnes) : null,
      termines: equipes.some(e => e.termines !== null) ? somme(equipes, e => e.termines) : null,
      sansObjet, creneaux: c
    };
  }

  /* ----------------------------------------------------------------------
   *  La journée
   * --------------------------------------------------------------------*/

  /**
   * Les indicateurs d'une journée. `r` : ce que rend MoteurProduction.simuler ;
   * `args` : ses arguments (les équipes telles qu'elle les a reçues, la règle
   * de poste générale). Rend { pas, equipes, services } ; chaque équipe porte
   * ses créneaux, chaque service les siens, par jour de travail (`jour`).
   */
  function journee(r, args) {
    const a = args || {}, defs = new Map((a.ateliers || []).map(x => [x.id, x]));
    // Les arrêts de chaque ligne robot : ceux de toutes ses cases (comme le moteur).
    const ligne = x => (x.lignePropre ? 'robot:' + x.id : 'robot:' + x.service), lignes = new Map();
    for (const x of (a.ateliers || []).filter(x => x.type === 'robot')) { if (!lignes.has(ligne(x))) lignes.set(ligne(x), []); lignes.get(ligne(x)).push(x); }
    const ctx = { regime: a.regime, pax: new Map((r.classes || []).map(c => [c.id, +c.pax || 0])),
      arretsLigne: x => reunir(P().arretsDeLigne(lignes.get(ligne(x)) || [x])) };
    const faites = (r.ateliers || []).map(v => {
      const def = defs.get(v.id), x = equipe(v, def, r, ctx);
      return { ...x, etp: etpDe(v, a.regime), e: { ...x.e, creneaux: creneaux([x.series]) } };
    });
    const groupes = new Map();
    for (const x of faites) {
      const k = x.e.service + '|' + x.jour;
      if (!groupes.has(k)) groupes.set(k, { service: x.e.service, jour: x.jour, membres: [] });
      groupes.get(k).membres.push(x);
    }
    const services = [...groupes.values()].sort((p, q) => String(p.service).localeCompare(String(q.service)) || p.jour - q.jour)
      .map(g => service(g.service, g.jour, g.membres, a.regime));
    return { pas: PAS, equipes: faites.map(x => x.e), services };
  }

  const api = { PAS, MESURES, journee, creneaux, pic, reunir, moins, deposer, compter };
  if (enNode) module.exports = api;
  else root.OrlyIndicateurs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
