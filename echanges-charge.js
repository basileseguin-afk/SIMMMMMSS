/* ==========================================================================
 *  LES INDICATEURS DE CHARGE DANS LES CLASSEURS (banc d'essai de la version
 *  1, évolution 12 d — docs/BANC_ESSAI.md § 13, docs/FORMATS_EXCEL.md § 6)
 *  ------------------------------------------------------------------------
 *  Deux feuilles, pour le classeur de la journée et pour celui de la
 *  période, depuis la page et depuis les outils (un seul chemin) :
 *    — « Charge » : jour de travail × équipe — occupation, consommé sur
 *      disponible, débit, file la plus longue, attente, et ce qui les fait ;
 *    — « Créneaux » : jour de travail × service × créneau de 15 min —
 *      présents, au travail, en pause, sans travail, en file, terminés.
 *  Les jours et les heures sont de vraies dates Excel. Un cas sans objet
 *  reste une case vide ; sa raison est dans la colonne « Sans objet ».
 *  Version 1 seulement : echanges.js, commun aux deux versions, ne change
 *  pas ; ce module ajoute ses feuilles au classeur de la période.
 *
 *  ⚠ Un classeur tiré d'une sauvegarde réelle ne va jamais dans le dépôt
 *  (`.gitignore` refuse les classeurs).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const T = () => (enNode ? require('./tableur.js') : root.OrlyTableur);
  const I = () => (enNode ? require('./moteur/indicateurs.js') : root.OrlyIndicateurs);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const n2 = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 100) / 100);
  const pc = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 1000) / 10);
  const dateFr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const deux = n => String(n).padStart(2, '0');
  const decalerJour = (d, k) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + k)).toISOString().slice(0, 10);
  const feuille = (nom, lignes, figer) => ({ nom, lignes, filtres: true, figerColonnes: figer });
  const ouiNon = x => (x ? 'oui' : 'non');
  const TYPES = { manuel: 'manuel', robot: 'robot', lavage: 'plonge', dispo: 'mise à disposition', handling: 'handling', appui: 'hors tunnel' };
  const NOMS = { presents: 'présents', auTravail: 'au travail', enPause: 'en pause', sansTravail: 'sans travail', enAppui: 'en appui ou à disposition',
    enFile: 'en file', termines: 'terminés',
    occupation: 'occupation', consommeSurDisponible: 'consommé sur disponible', debit: 'débit' };

  /** Les cas sans objet d'une équipe : « occupation, débit : handling ; … », groupés par raison. */
  function sansObjet(so) {
    const parRaison = new Map();
    for (const [m, r] of Object.entries(so || {})) { if (!parRaison.has(r)) parRaison.set(r, []); parRaison.get(r).push(NOMS[m] || m); }
    return [...parRaison.entries()].map(([r, ms]) => ms.join(', ') + ' : ' + r).join(' ; ') || null;
  }

  /* ---- la feuille « Charge » ------------------------------------------- */

  const TETE_CHARGE = ['Jour de travail', 'Journée de vols', 'Service', 'Équipe', 'Type', 'Personnes', 'Unité', 'Occupation (%)', 'Consommé sur disponible (%)',
    'Débit (unités/h)', 'Unités terminées', 'Au travail (min × pers.)', 'Disponible (min × pers.)', 'Homme-minutes', 'Heures du débit (h)',
    'File la plus longue', 'File la plus longue à', 'Attente (min)', 'Renforts prêtés (min)', 'Renforts reçus (min)', 'Sans objet'];

  /**
   * Une ligne de la feuille « Charge ». `x` : { vols (date de la journée de vols), equipe ({ nom, type, service, jour }),
   * k (ses indicateurs : moteur/indicateurs.js, ou leur extrait de la période), nomService(id), complet (période) }.
   */
  function ligneCharge(x) {
    const e = x.equipe, k = x.k, w = decalerJour(x.vols, e.jour || 0), f = k.fileMax;
    const dispo = k.disponible !== undefined ? k.disponible : (k.minutesDisponibles == null ? null : k.minutesDisponibles * k.personnes);
    return [T().celluleDate(w), T().celluleDate(x.vols), ...(x.complet === undefined ? [] : [ouiNon(x.complet)]), x.nomService(e.service), e.nom, TYPES[e.type] || e.type || null,
      k.personnes, k.unite || null, pc(k.occupation), pc(k.consommeSurDisponible), n2(k.debit), n2(k.termines), n2(k.auTravail), n2(dispo), n2(k.hommeMinutes),
      n2(k.heuresDebit), f ? f.lots : null, f && f.lots && Number.isFinite(f.a) ? T().celluleDate(x.vols, f.a) : null, n2(k.attente),
      n2(k.renfortsPretes), n2(k.renfortsRecus), sansObjet(k.sansObjet)];
  }

  /**
   * Le relais à la plonge par vol (évolution 18), dans la feuille « Charge » de la journée : cinq colonnes de plus, à la
   * fin, seulement si une équipe a un relais ou laisse un vol au lendemain — sinon la feuille d'avant, telle quelle.
   */
  const TETE_RELAIS = ['Vols passés en relais', 'Vols repris en relais', 'Travail en relais (min)', 'Reste à laver le lendemain (vols)', 'Reste à laver le lendemain (min de lavage)'];
  const ligneRelais = (k, reste) => [k.relais ? k.relais.passes : null, k.relais ? k.relais.repris : null, k.relais ? n2(k.relais.minutes) : null,
    reste ? reste.vols : null, reste ? n2(reste.minutes) : null];

  /* ---- la feuille « Créneaux » ----------------------------------------- */

  const TETE_CRENEAUX = ['Jour de travail', 'Service', 'Créneau', 'Présents', 'Au travail', 'En pause', 'Sans travail', 'En appui ou à disposition', 'En file', 'Terminés'];

  /** Les lignes d'un service un jour de travail : un créneau par ligne, sur l'horloge de ce jour ; un créneau où rien ne se passe n'en a pas. */
  function lignesCreneaux(w, nom, c, complet) {
    if (!c || c.debut === null) return [];
    const ms = I().MESURES, pas = I().PAS, n = Math.max(0, ...ms.map(m => (c[m] ? c[m].valeurs.length : 0))), out = [];
    for (let i = 0; i < n; i++) {
      const v = ms.map(m => (c[m] ? n2(c[m].valeurs[i] || 0) : null));
      if (v.every(x => !x)) continue;
      out.push([T().celluleDate(w), ...(complet === undefined ? [] : [ouiNon(complet)]), nom, T().celluleDate(w, c.debut + i * pas), ...v]);
    }
    return out;
  }

  const avecComplet = tete => [...tete.slice(0, 2), 'Jour complet', ...tete.slice(2)];
  const avecCompletCreneaux = tete => [tete[0], 'Jour complet', ...tete.slice(1)];
  const parCle = (x, y) => x.cle.reduce((r, v, i) => r || (typeof v === 'number' ? v - y.cle[i] : String(v).localeCompare(String(y.cle[i]))), 0);

  /** Les définitions, pour les deux Lisez-moi. */
  const FEUILLES = [
    '   Charge — chaque jour de travail × équipe : occupation, consommé sur disponible, débit, file la plus longue, attente, et ce qui les fait.',
    '   Créneaux — chaque jour de travail × service × créneau de 15 min : présents, au travail, en pause, sans travail, en appui ou à disposition,',
    '   en file, terminés.'
  ];
  const DEFINITIONS = [
    'Les indicateurs de charge (docs/BANC_ESSAI.md § 13) :',
    '   Créneaux de 15 minutes, alignés sur l’heure, sur l’horloge du jour de travail : une équipe à J−1 se place sur la veille des vols.',
    '   Une mesure en personnes est la moyenne de ses 15 minutes (une personne présente la moitié du créneau compte 0,5) ; en file aussi, en lots.',
    '   Présents : les personnes dont le poste couvre le créneau, heures sup comprises. Au travail : pendant un lot en cours, pauses prises retirées.',
    '   En pause : pendant les pauses prises. Sans travail : présents − au travail − en pause. En appui ou à disposition : les équipes d’appui et les',
    '   mises à disposition, présentes sans travail propre ; présents = au travail + en pause + sans travail + en appui (hors handling).',
    '   En file : les lots prêts pas encore commencés (à la plonge par vol, les vols revenus qui attendent). Terminés : les unités finies dans le',
    '   créneau (repas, plateaux, vols lavés, vols chargés ; vols servis aux équipes d’armement, de dotation, de roulés couverts).',
    '   Disponible = personnes × (présence − pauses vraiment prises) + heures sup. Occupation = minutes au travail ÷ disponible ; consommé sur',
    '   disponible = homme-minutes de ses lots ÷ disponible : ni l’un ni l’autre ne dépasse 100 %. Débit = unités terminées ÷ heures au travail',
    '   (au handling, ÷ heures de chargement).',
    '   File la plus longue : le plus de lots en file à un instant, et ce premier instant. Les renforts comptent dans les totaux, pas dans les créneaux.',
    '   Sans objet (case vide, raison dans la colonne) : une mise à disposition et une équipe d’appui n’ont ni occupation, ni travail, ni file ;',
    '   le handling n’a ni occupation ni travail par créneau. Un créneau où rien ne se passe n’a pas de ligne.',
    '   Limites : la plonge ne prend pas de pause dans le moteur (ses tunnels lavent sans arrêt) ; une pause du réglage que l’équipe n’a pas',
    '   atteinte reste disponible, « sans travail » ; un pic d’une minute se lit atténué sur 15 minutes.'
  ];

  /* ---- la journée ------------------------------------------------------- */

  /**
   * Le classeur de la journée : Lisez-moi, Charge, Créneaux. `x` : { resultat, args } (moteur/journee.js) ou `indicateurs`
   * (moteur/indicateurs.js, journee) ; `ctx` : { date (la journée de vols, AAAA-MM-JJ ; sans date, celle du calcul),
   * nomService(id) (sinon les noms des arguments), sauvegarde, vols (les noms des fichiers), calculeLe (une date) }.
   */
  function journeeVersClasseur(x, ctx = {}) {
    const k = x.indicateurs || I().journee(x.resultat, x.args || {});
    const le = ctx.calculeLe ? new Date(ctx.calculeLe) : new Date();
    const date = ctx.date || le.getFullYear() + '-' + deux(le.getMonth() + 1) + '-' + deux(le.getDate());
    const noms = (x.args && x.args.noms) || {}, ns = ctx.nomService || (id => noms[id] || id);
    // Ce que chaque équipe de plonge laisse à laver le lendemain (évolution 18) : lu dans le résultat, quand on l'a.
    const vues = new Map(((x.resultat && x.resultat.ateliers) || []).map(v => [v.id, v]));
    const restes = new Map(k.equipes.map(e => [e.id, vues.has(e.id) ? REP().lendemainDeLEquipe(vues.get(e.id), x.resultat) : null]));
    const relais = k.equipes.some(e => e.relais || restes.get(e.id));
    const charge = [relais ? [...TETE_CHARGE, ...TETE_RELAIS] : TETE_CHARGE, ...k.equipes.map(e => ({ cle: [decalerJour(date, e.jour || 0), ns(e.service), e.nom],
      l: [...ligneCharge({ vols: date, equipe: e, k: e, nomService: ns }), ...(relais ? ligneRelais(e, restes.get(e.id)) : [])] }))
      .sort(parCle).map(y => y.l)];
    const creneaux = [TETE_CRENEAUX, ...k.services.slice().sort((p, q) => (p.jour - q.jour) || ns(p.service).localeCompare(ns(q.service)))
      .flatMap(s => lignesCreneaux(decalerJour(date, s.jour || 0), ns(s.service), s.creneaux))];
    const lisez = { nom: 'Lisez-moi', largeurs: [110], lignes: [
      ['Charge de la journée' + (ctx.date ? ' du ' + dateFr(ctx.date) : '') + ' (prototype)'],
      [ctx.date ? 'Journée de vols du ' + dateFr(ctx.date) + '.' : 'Journée sans date : ses jours et ses heures portent la date du calcul (' + dateFr(date) + ') ; la veille, le jour d’avant.'],
      ['Sauvegarde : ' + (ctx.sauvegarde || '—') + ' ; vols : ' + (ctx.vols || '—') + '.'],
      ['Calculée le ' + deux(le.getDate()) + '/' + deux(le.getMonth() + 1) + '/' + le.getFullYear() + ' à ' + deux(le.getHours()) + ':' + deux(le.getMinutes()) + '.'],
      [''], ['Les feuilles :'], ...FEUILLES.map(l => [l]), [''], ...DEFINITIONS.map(l => [l]),
      [''], ['PROTOTYPE — barème non calibré : résultats de simulation, à lire comme un ordre de grandeur, pas comme une mesure.']] };
    return [lisez, feuille('Charge', charge, 4), feuille('Créneaux', creneaux, 3)];
  }

  /* ---- la période ------------------------------------------------------- */

  /**
   * Les deux feuilles de la période, du bilan et des extraits (moteur/periode.js) : « Charge » de chaque journée de vols,
   * « Créneaux » de chaque jour de travail, journées de vols réunies. Sans indicateurs (une période d'avant), aucune.
   */
  function feuillesDeLaPeriode(p) {
    const b = p.bilan, journees = p.journees || [];
    if (!journees.some(j => j.extrait && j.extrait.indicateursCharge)) return [];
    const noms = new Map(b.services.map(x => [x.id, x.nom])), ns = id => noms.get(id) || id;
    const complet = new Map(b.joursTravail.map(w => [w.date, w.complet]));
    const lignes = [];
    for (const j of journees) {
      const kc = j.extrait.indicateursCharge; if (!kc) continue;
      const parId = new Map(kc.equipes.map(e => [e.id, e]));
      for (const e of j.extrait.equipes) {
        const k = parId.get(e.id); if (!k) continue;
        const w = decalerJour(j.date, e.jour || 0);
        lignes.push({ cle: [w, ns(e.service), e.nom, j.date], l: ligneCharge({ vols: j.date, equipe: e, k, nomService: ns, complet: !!complet.get(w) }) });
      }
    }
    const creneaux = [avecCompletCreneaux(TETE_CRENEAUX)];
    for (const w of b.joursTravail) for (const x of b.services) {
      const s = w.services[x.id];
      if (s && s.indicateursCharge) creneaux.push(...lignesCreneaux(w.date, x.nom, s.indicateursCharge.creneaux, w.complet));
    }
    return [feuille('Charge', [avecComplet(TETE_CHARGE), ...lignes.sort(parCle).map(y => y.l)], 5), feuille('Créneaux', creneaux, 4)];
  }

  /**
   * Le classeur de la période (echanges.js, periodeVersClasseur) avec ses deux feuilles de charge, après « Équipes »,
   * et leurs définitions dans le Lisez-moi. Sans indicateurs, le classeur d'avant, tel quel.
   */
  function avecCharge(classeur, p) {
    const f = feuillesDeLaPeriode(p);
    if (!f.length) return classeur;
    const i = classeur.findIndex(x => x.nom === 'Équipes'), out = classeur.slice();
    out.splice(i < 0 ? out.length : i + 1, 0, ...f);
    const lisez = out.find(x => x.nom === 'Lisez-moi');
    if (lisez) {
      // Dans la liste des feuilles, après « Équipes », comme dans le classeur.
      const ici = lisez.lignes.findIndex(l => /^\s*Équipes — /.test(l[0] || ''));
      const lignes = lisez.lignes.slice();
      lignes.splice(ici < 0 ? lignes.length : ici + 1, 0, ...FEUILLES.map(l => [l]));
      const fin = lignes.findIndex(l => /^PROTOTYPE/.test(l[0] || ''));
      lignes.splice(fin < 0 ? lignes.length : fin, 0, ...DEFINITIONS.map(l => [l]), ['   Feuille Charge : « Jour complet » dit si le jour de travail entre dans les totaux et les moyennes du bilan.'], ['']);
      out[out.indexOf(lisez)] = { ...lisez, lignes };
    }
    return out;
  }

  const api = { journeeVersClasseur, feuillesDeLaPeriode, avecCharge, TETE_CHARGE, TETE_CRENEAUX, TETE_RELAIS };
  if (enNode) module.exports = api;
  else root.OrlyEchangesCharge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
