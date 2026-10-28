/* ==========================================================================
 *  LE RÉEL — les heures par jour et par rôle, leur correspondance avec la
 *  simulation, la comparaison (banc d'essai de la version 1, évolution 11 b
 *  — docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Un fichier « Réel par jour » (un CSV, ou la feuille « Réel » d'un
 *  classeur) : une ligne par jour et par rôle, ses heures de titulaires et
 *  d'intérim, ses heures supp. La correspondance range les rôles en lignes ;
 *  chacune couvre des services (la charge de leurs équipes), l'encadrement
 *  saisi d'un service, les chauffeurs du handling, ou rien (« hors
 *  simulation »). La comparaison se fait sur les jours de travail complets
 *  de la période qui ont du réel. Sans navigateur : la page et l'outil
 *  (outils/caler-periode.cjs) appellent ce module.
 *
 *  ⚠ Les heures réelles ne vont jamais dans le dépôt. La page les garde en
 *  mémoire ; la sauvegarde ne garde que des réglages (la correspondance, les
 *  jours et les cellules écartés, les cellules réintégrées), sans heures.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const module_ = (nom, chemin) => (enNode ? require(chemin) : root[nom]);
  const T = () => module_('OrlyTableur', '../tableur.js');
  const C = () => module_('OrlyCalagePeriode', './calage-periode.js');
  const U = () => module_('OrlyUI', '../ui-model.js');

  /** Les heures d'une cellule : de titulaires, d'intérim, et les heures supp (comptées à part). */
  const CATEGORIES = ['titulaires', 'interim', 'supp'];
  const NOMS_CATEGORIES = { titulaires: 'titulaires', interim: 'intérim', supp: 'heures supp' };
  /** Les heures d'un ETP, par défaut : 7 h de titulaire, 7 h d'intérimaire. */
  const BASE_DEFAUT = { titulaires: 7, interim: 7 };
  const MAX_LIGNES_REEL = 200000, MAX_LIGNES = 200, MAX_ROLES = 500, MAX_NOM = 160, MAX_DECISIONS = 20000;
  /** Un rôle d'un service : « service / rôle ». */
  const SEP_ROLE = ' / ';
  const objet = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const somme = (l, f) => l.reduce((n, x) => n + (f(x) || 0), 0);
  const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const fr = n => String(Math.round(n * 100) / 100).replace('.', ',');

  /* ----------------------------------------------------------------------
   *  Le fichier « Réel par jour »
   * --------------------------------------------------------------------*/

  /** Des heures : un nombre décimal (« 7,5 »), ou « HH:MM » (« 7:30 », « 350:30 ») ; vide : null. */
  function heuresDe(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('heures illisibles : ' + v);
      return v;
    }
    const s = String(v).trim().replace(/\s/g, '');
    const m = /^(-?)(\d+)[:hH](\d{2})$/.exec(s);
    if (m && +m[3] <= 59) return (m[1] ? -1 : 1) * (+m[2] + +m[3] / 60);
    const n = +s.replace(',', '.');
    if (m || !s || !Number.isFinite(n)) throw new Error('heures attendues (7,5 ou 7:30), reçu « ' + v + ' »');
    return n;
  }

  /** La feuille du réel : « Réel » dans un classeur, la seule d'un CSV. */
  function feuilleDuReel(feuilles) {
    const l = Array.isArray(feuilles) ? feuilles : [];
    const f = T().feuille(l, 'Réel', 'Réel par jour', 'Reel par jour') || (l.length === 1 ? l[0] : null);
    if (!f) throw new Error('feuille « Réel » introuvable : nommez « Réel » la feuille du réel.');
    return f;
  }

  /**
   * Lit le fichier du réel (ses feuilles, comme tableur.js les rend). Les
   * en-têtes ne tiennent compte ni de la casse ni des accents. Une ligne
   * illisible refuse le fichier entier, en la nommant.
   * @returns {{ lignes: [{ ligne, date, role, titulaires, interim, supp }], avecSupp, avecService }}
   */
  function lireReel(feuilles) {
    const f = feuilleDuReel(feuilles);
    const { entetes, objets } = T().enObjets(f.lignes);
    const a = new Set(entetes), seule = !a.has('heures_titulaires') && !a.has('heures_interim') && a.has('heures');
    for (const c of ['date', 'role']) if (!a.has(c)) throw new Error('colonne « ' + c + ' » manquante (attendu : date, role, heures_titulaires, heures_interim).');
    if (!seule && !a.has('heures_titulaires')) throw new Error('colonne « heures_titulaires » (ou « heures ») manquante.');
    if (!seule && !a.has('heures_interim')) throw new Error('colonne « heures_interim » manquante.');
    if (!objets.length) throw new Error('aucune ligne de réel.');
    if (objets.length > MAX_LIGNES_REEL) throw new Error('trop de lignes (' + MAX_LIGNES_REEL + ' au plus).');
    const o = { seule, supp: a.has('heures_supp'), service: a.has('service') };
    heuresAuFormatHeure(objets, seule ? ['heures'] : ['heures_titulaires', 'heures_interim'].concat(o.supp ? ['heures_supp'] : []));
    return { lignes: objets.map(x => ligneDuReel(x, o)), avecSupp: o.supp, avecService: o.service };
  }

  /**
   * Une cellule Excel au format heure (7:30) arrive en fraction de jour (0,3125) : des heures 24 fois trop petites, sans
   * erreur. Quand toutes les valeurs numériques non nulles des colonnes d'heures sont des fractions de moins d'une heure,
   * le fichier est refusé, en disant comment l'écrire (une demi-heure d'intérim, à côté de vraies heures, se lit).
   */
  function heuresAuFormatHeure(objets, colonnes) {
    const n = colonnes.flatMap(c => objets.map(x => [c, x[c]])).filter(([, v]) => typeof v === 'number' && v !== 0);
    if (n.length && n.every(([, v]) => Math.abs(v) < 1) && n.some(([, v]) => !Number.isInteger(v)))
      throw new Error('colonne « ' + n[0][0] + ' » : des heures au format heure d’Excel (7:30 lu 0,3125). Écrivez-les en nombre (7,5) ou en texte (7:30).');
  }

  function ligneDuReel(x, o) {
    try {
      const date = U().dateDe(x.date);
      if (!date) throw new Error('date manquante');
      const nom = String(x.role ?? '').trim(), svc = o.service ? String(x.service ?? '').trim() : '';
      if (!nom) throw new Error('rôle manquant');
      const role = (svc ? svc + SEP_ROLE : '') + nom;
      if (role.length > MAX_NOM) throw new Error('rôle trop long (' + MAX_NOM + ' caractères au plus)');
      if (role.includes('|')) throw new Error('rôle « ' + role + ' » : le caractère « | » n’y est pas permis');
      const t = heuresDe(o.seule ? x.heures : x.heures_titulaires), i = o.seule ? 0 : heuresDe(x.heures_interim);
      return { ligne: x._ligne, date, role, titulaires: t ?? 0, interim: i ?? 0, supp: o.supp ? heuresDe(x.heures_supp) ?? 0 : null };
    } catch (e) { throw new Error('ligne ' + x._ligne + ' : ' + e.message); }
  }

  /* ----------------------------------------------------------------------
   *  Les contrôles : rien ne bloque, une anomalie écarte sa seule cellule
   * --------------------------------------------------------------------*/

  /** La clé d'une cellule (jour × rôle) ou d'une de ses heures (jour × rôle × catégorie). */
  const cle = (date, role, categorie) => date + '|' + role + (categorie ? '|' + categorie : '');

  /** Les décisions de l'utilisateur, relues : { ecartes: { jours, cellules }, reintegres } (des clés, aucune heure). */
  function validerDecisions(d) {
    if (d === undefined || d === null) return { ecartes: { jours: [], cellules: [] }, reintegres: [] };
    if (!objet(d)) throw new Error('décisions : un objet { ecartes, reintegres } est attendu.');
    const e = d.ecartes === undefined ? {} : d.ecartes;
    if (!objet(e)) throw new Error('décisions : « ecartes » est un objet { jours, cellules }.');
    const liste = (l, quoi, ok) => {
      if (l === undefined) return [];
      if (!Array.isArray(l) || l.length > MAX_DECISIONS || !l.every(x => typeof x === 'string' && x.length <= 2 * MAX_NOM && ok(x)))
        throw new Error('décisions : « ' + quoi + ' » est une liste de clés valides.');
      return [...new Set(l)].sort();
    };
    const jour = x => /^\d{4}-\d{2}-\d{2}$/.test(x), cellule = x => /^\d{4}-\d{2}-\d{2}\|[^|]+(\|(titulaires|interim|supp))?$/.test(x);
    return { ecartes: { jours: liste(e.jours, 'ecartes.jours', jour), cellules: liste(e.cellules, 'ecartes.cellules', cellule) },
      reintegres: liste(d.reintegres, 'reintegres', cellule) };
  }

  /**
   * Le réel contrôlé : une cellule par jour × rôle. Écartées, avec leur raison
   * (rien d'autre ne bloque) : des heures négatives (leur seule catégorie), un
   * jour × rôle en double (la cellule) — sauf si l'utilisateur les réintègre
   * (en double : les lignes s'additionnent) —, et ce qu'il écarte lui-même (un
   * jour, une cellule). Signalés sans rien écarter : une catégorie à zéro tout
   * un mois, présente les autres mois ; un rôle absent un jour, présent tous
   * les autres.
   */
  function controler(lu, decisions) {
    const d = validerDecisions(decisions), reint = new Set(d.reintegres);
    const ecJours = new Set(d.ecartes.jours), ecCellules = new Set(d.ecartes.cellules);
    const groupes = new Map();
    for (const l of lu.lignes) {
      const k = cle(l.date, l.role);
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k).push(l);
    }
    const cellules = new Map(), ecartees = [], dansJoursEcartes = [];
    for (const [k, ls] of groupes) {
      const { date, role } = ls[0];
      if (ls.length > 1 && !reint.has(k)) { ecartees.push({ cle: k, date, role, code: 'double', raison: 'en double (lignes ' + ls.map(l => l.ligne).join(', ') + ')' }); continue; }
      const c = { date, role, titulaires: somme(ls, l => l.titulaires), interim: somme(ls, l => l.interim), supp: lu.avecSupp ? somme(ls, l => l.supp) : null };
      for (const cat of CATEGORIES) {
        if (c[cat] === null || c[cat] >= 0 || reint.has(cle(date, role, cat))) continue;
        ecartees.push({ cle: cle(date, role, cat), date, role, categorie: cat, code: 'negatif', raison: NOMS_CATEGORIES[cat] + ' négatives (' + fr(c[cat]) + ' h)' });
        c[cat] = undefined;
      }
      if (ecJours.has(date)) { dansJoursEcartes.push(c); continue; }
      if (ecCellules.has(k)) { ecartees.push({ cle: k, date, role, code: 'choix', raison: 'écartée par vous' }); continue; }
      cellules.set(k, c);
    }
    const jours = [...new Set(lu.lignes.map(l => l.date))].sort();
    // Les cellules écartées entières (en double, par vous) : leur jour sort de la comparaison des lignes qui ont leur rôle.
    const sansReel = new Set(ecartees.filter(x => x.code === 'double' || x.code === 'choix').map(x => x.cle));
    return { cellules, ecartees, sansReel, dansJoursEcartes, signalees: signaler(lu, cellules, jours.filter(x => !ecJours.has(x))),
      roles: [...new Set(lu.lignes.map(l => l.role))].sort(), jours, joursEcartes: jours.filter(x => ecJours.has(x)), avecSupp: !!lu.avecSupp, decisions: d };
  }

  /** Ce qui se signale sans s'écarter : l'utilisateur décide. */
  function signaler(lu, cellules, jours) {
    const out = [], presents = new Map();
    for (const l of lu.lignes) { if (!presents.has(l.role)) presents.set(l.role, new Set()); presents.get(l.role).add(l.date); }
    const parRole = new Map();
    for (const c of cellules.values()) { if (!parRole.has(c.role)) parRole.set(c.role, []); parRole.get(c.role).push(c); }
    for (const [role, cs] of parRole) for (const cat of CATEGORIES.filter(x => x !== 'supp' || lu.avecSupp)) {
      const parMois = new Map();
      for (const c of cs) if (Number.isFinite(c[cat])) parMois.set(c.date.slice(0, 7), (parMois.get(c.date.slice(0, 7)) || 0) + c[cat]);
      if (![...parMois.values()].some(v => v > 0)) continue;
      for (const [mois, v] of parMois) if (v === 0) out.push({ code: 'mois-a-zero', role, categorie: cat, mois,
        raison: role + ' : ' + NOMS_CATEGORIES[cat] + ' à zéro tout le mois ' + mois + ', présentes les autres mois' });
    }
    for (const [role, ses] of presents) {
      const manque = jours.filter(x => !ses.has(x));   // les jours écartés n'y sont pas
      if (jours.length >= 3 && manque.length === 1) out.push({ code: 'jour-absent', role, date: manque[0],
        raison: role + ' : absent le ' + manque[0] + ', présent tous les autres jours' });
    }
    return out;
  }

  /* ----------------------------------------------------------------------
   *  La correspondance : des lignes de rôles, ce que chacune couvre
   * --------------------------------------------------------------------*/

  function validerBase(b, quoi, defaut = BASE_DEFAUT) {
    if (!objet(b)) throw new Error('correspondance : la base « ' + quoi + ' » est un objet { titulaires, interim }.');
    const n = (v, k) => {
      if (v === undefined) return defaut[k];
      if (!(typeof v === 'number' && v > 0 && v <= 24)) throw new Error('correspondance : base « ' + quoi + ' », ' + k + ' : des heures, de plus de 0 à 24.');
      return v;
    };
    return { titulaires: n(b.titulaires, 'titulaires'), interim: n(b.interim, 'interim') };
  }

  /** Une ligne : un nom, des rôles, et une seule chose couverte (services, encadrement, chauffeurs ou hors). */
  function validerLigne(l, i, connus) {
    const ou = 'correspondance, ligne ' + (i + 1);
    if (!objet(l)) throw new Error(ou + ' : un objet { nom, roles, … } est attendu.');
    const nom = String(l.nom ?? '').trim();
    if (!nom || nom.length > MAX_NOM) throw new Error(ou + ' : un nom de 1 à ' + MAX_NOM + ' caractères.');
    const roles = l.roles === undefined ? [] : l.roles;
    if (!Array.isArray(roles) || roles.length > MAX_ROLES || !roles.every(r => typeof r === 'string' && r.trim() && r.length <= MAX_NOM))
      throw new Error(ou + ' (« ' + nom + ' ») : « roles » est une liste de rôles.');
    const couvre = ['services', 'encadrement', 'chauffeurs', 'hors'].filter(k => l[k] !== undefined);
    if (couvre.length !== 1) throw new Error(ou + ' (« ' + nom + ' ») : une seule chose couverte — services, encadrement, chauffeurs ou hors.');
    const out = { nom, roles: [...new Set(roles.map(r => r.trim()))] };
    const service = s => { if (connus && !connus.has(s)) throw new Error(ou + ' (« ' + nom + ' ») : service inconnu « ' + s + ' ».'); return s; };
    if (couvre[0] === 'services') {
      if (!Array.isArray(l.services) || !l.services.length || !l.services.every(s => typeof s === 'string' && s))
        throw new Error(ou + ' (« ' + nom + ' ») : « services » est une liste d’identifiants de service.');
      out.services = [...new Set(l.services)].map(service);
    } else if (couvre[0] === 'encadrement') {
      if (typeof l.encadrement !== 'string' || !l.encadrement) throw new Error(ou + ' (« ' + nom + ' ») : « encadrement » est l’identifiant d’un service.');
      out.encadrement = service(l.encadrement);
    } else if (couvre[0] === 'chauffeurs') {
      if (l.chauffeurs !== 'camion' && l.chauffeurs !== 'vl') throw new Error(ou + ' (« ' + nom + ' ») : « chauffeurs » vaut camion ou vl.');
      out.chauffeurs = l.chauffeurs;
    } else if (l.hors !== true) throw new Error(ou + ' (« ' + nom + ' ») : « hors » vaut true.');
    else out.hors = true;
    return out;
  }

  /**
   * La correspondance relue : { bases: { defaut, <rôle> }, lignes }. Un rôle
   * n'appartient qu'à une ligne. `o.services` : les identifiants de service
   * connus (un service inconnu est refusé, nommé).
   */
  function validerCorrespondance(c, o = {}) {
    if (c === undefined || c === null) c = { lignes: [] };
    if (!objet(c)) throw new Error('correspondance : un objet { bases, lignes } est attendu.');
    const b = c.bases === undefined ? {} : c.bases;
    if (!objet(b) || Object.keys(b).length > MAX_ROLES + 1) throw new Error('correspondance : « bases » est un objet { defaut, <rôle> }.');
    const bases = { defaut: validerBase(b.defaut || {}, 'defaut') };
    for (const [role, x] of Object.entries(b)) if (role !== 'defaut') bases[role] = validerBase(x, role, bases.defaut);
    const l = c.lignes === undefined ? [] : c.lignes;
    if (!Array.isArray(l) || l.length > MAX_LIGNES) throw new Error('correspondance : « lignes » est une liste (' + MAX_LIGNES + ' au plus).');
    const connus = Array.isArray(o.services) ? new Set(o.services) : null, noms = new Set(), proprietaire = new Map(), couvert = new Map();
    const couvertures = v => (v.services ? v.services.map(x => 'service:le service « ' + x + ' »') : v.encadrement ? ['encadrement:l’encadrement de « ' + v.encadrement + ' »']
      : v.chauffeurs ? ['chauffeurs:les chauffeurs ' + (v.chauffeurs === 'vl' ? 'VL' : 'camion')] : []);
    const lignes = l.map((x, i) => {
      const v = validerLigne(x, i, connus);
      if (noms.has(v.nom)) throw new Error('correspondance : deux lignes s’appellent « ' + v.nom + ' ».');
      noms.add(v.nom);
      for (const r of v.roles) {
        if (proprietaire.has(r)) throw new Error('correspondance : le rôle « ' + r + ' » est dans deux lignes (« ' + proprietaire.get(r) + ' » et « ' + v.nom + ' »).');
        proprietaire.set(r, v.nom);
      }
      // Une même chose couverte par deux lignes compterait deux fois son simulé dans le total de l'unité.
      for (const k of couvertures(v)) {
        if (couvert.has(k)) throw new Error('correspondance : deux lignes couvrent ' + k.replace(/^[^:]+:/, '') + ' (« ' + couvert.get(k) + ' » et « ' + v.nom + ' »).');
        couvert.set(k, v.nom);
      }
      return v;
    });
    return { bases, lignes };
  }

  /** Ce que couvre une ligne, en mots. */
  function couvertureDe(l, nomService) {
    const n = s => (nomService ? nomService(s) : s);
    if (l.services) return l.services.map(n).join(', ');
    if (l.encadrement) return 'encadrement de ' + n(l.encadrement);
    if (l.chauffeurs) return 'chauffeurs ' + (l.chauffeurs === 'vl' ? 'VL' : 'camion');
    return 'hors simulation';
  }

  /* ----------------------------------------------------------------------
   *  La comparaison, sur les jours de travail complets qui ont du réel
   * --------------------------------------------------------------------*/

  const baseDe = (bases, role) => (Object.prototype.hasOwnProperty.call(bases, role) ? bases[role] : bases.defaut);
  /** Les ETP d'une cellule : titulaires ÷ leur base + intérim ÷ la sienne ; null si l'une est écartée. */
  function etpDe(c, base) {
    if (!Number.isFinite(c.titulaires) || !Number.isFinite(c.interim)) return null;
    return c.titulaires / base.titulaires + c.interim / base.interim;
  }

  /** Le simulé d'une ligne un jour de travail du bilan : la charge de ses services, son encadrement, ses chauffeurs ; 0 hors simulation. */
  function simuleDe(l, w) {
    const s = id => (w.services && w.services[id]) || {};
    if (l.services) return somme(l.services, id => s(id).charge);
    if (l.encadrement) return s(l.encadrement).chargeEncadrement || 0;
    if (l.chauffeurs) return (w.total && (l.chauffeurs === 'vl' ? w.total.chauffeursVL : w.total.chauffeursCamion)) || 0;
    return 0;
  }

  /** Les heures supp simulées d'une ligne un jour (heures) : celles de ses services ; ses chauffeurs, au prorata camion / VL. */
  function heuresSuppSimulees(l, w) {
    const s = id => (w.services && w.services[id]) || {};
    if (l.services) return somme(l.services, id => s(id).heuresSup) / 60;
    if (!l.chauffeurs || !w.total) return 0;
    const n = (w.total.chauffeursCamion || 0) + (w.total.chauffeursVL || 0), k = l.chauffeurs === 'vl' ? w.total.chauffeursVL : w.total.chauffeursCamion;
    return n > 0 ? (w.total.heuresSupChauffeurs || 0) / 60 * (k || 0) / n : 0;
  }

  /** Le coefficient de corrélation de Pearson ; null sans variance. */
  function correlation(x, y) {
    const n = x.length;
    if (n < 2) return null;
    const mx = moyenne(x), my = moyenne(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx > 1e-12 && syy > 1e-12 ? sxy / Math.sqrt(sxx * syy) : null;
  }

  /** Erreur absolue moyenne (MAE), biais (simulé − réel, en moyenne) et corrélation, sur des jours { reel, simule }. */
  function mesures(points, avecCorrelation = true) {
    if (!points.length) return { jours: 0, mae: null, biais: null, ...(avecCorrelation ? { correlation: null } : {}) };
    const e = points.map(p => p.simule - p.reel);
    return { jours: points.length, mae: moyenne(e.map(Math.abs)), biais: moyenne(e),
      ...(avecCorrelation ? { correlation: correlation(points.map(p => p.reel), points.map(p => p.simule)) } : {}) };
  }
  /** Par mois, puis sur la période. */
  function parMois(points, avecCorrelation) {
    const mois = [...new Set(points.map(p => p.date.slice(0, 7)))].sort();
    return { mois: mois.map(m => ({ mois: m, ...mesures(points.filter(p => p.date.startsWith(m)), avecCorrelation) })), periode: mesures(points, avecCorrelation) };
  }

  /** Les jours d'une ligne : réel, simulé, écart ; un jour où l'une de ses cellules ou de ses heures est écartée n'y compte pas. */
  function joursDeLaLigne(l, jours, cellules, bases, sansReel) {
    const out = [], sans = [];
    for (const w of jours) {
      if (l.roles.some(r => sansReel.has(cle(w.date, r)))) { sans.push(w.date); continue; }
      const cs = l.roles.map(r => cellules.get(cle(w.date, r))).filter(Boolean);
      const etps = cs.map(c => etpDe(c, baseDe(bases, c.role)));
      if (etps.some(x => x === null)) { sans.push(w.date); continue; }
      const reel = somme(etps, x => x), simule = simuleDe(l, w);
      out.push({ date: w.date, reel, simule, ecart: simule - reel });
    }
    return { jours: out, joursSansReel: sans };
  }

  /** Les heures supp d'une ligne, par mois (descriptif) : réelles et simulées, en heures. */
  function heuresSuppParMois(l, jours, cellules, sansReel) {
    const parMois = new Map();
    for (const w of jours) {
      if (l.roles.some(r => sansReel.has(cle(w.date, r)))) continue;
      const cs = l.roles.map(r => cellules.get(cle(w.date, r))).filter(Boolean);
      if (cs.some(c => !Number.isFinite(c.supp))) continue;
      const m = w.date.slice(0, 7), x = parMois.get(m) || { mois: m, jours: 0, reel: 0, simule: 0 };
      x.jours++; x.reel += somme(cs, c => c.supp); x.simule += heuresSuppSimulees(l, w);
      parMois.set(m, x);
    }
    return [...parMois.values()].sort((a, b) => a.mois.localeCompare(b.mois));
  }

  /**
   * Compare le réel à la période simulée.
   * @param bilan le bilan de la période (moteur/periode.js), avec la charge de chaque service
   * @param reel le réel lu (lireReel) ou déjà contrôlé (controler)
   * @param correspondance { bases, lignes }
   * @param o { decisions } : ce que l'utilisateur écarte ou réintègre ; { services } : les identifiants de service
   *   connus (la page : tous ceux de l'unité ; sans, ceux du bilan — un service inconnu est refusé, nommé)
   */
  function comparer(bilan, reel, correspondance, o = {}) {
    const corr = validerCorrespondance(correspondance, { services: o.services || (bilan.services || []).map(s => s.id) });
    const ctrl = reel.cellules ? reel : controler(reel, o.decisions);
    const avecReel = new Set([...ctrl.cellules.values()].map(c => c.date));
    const jours = (bilan.joursTravail || []).filter(w => w.complet && avecReel.has(w.date));
    const nomService = id => ((bilan.services || []).find(s => s.id === id) || {}).nom || id;
    const lignes = corr.lignes.map(l => {
      const sansReel = ctrl.sansReel || new Set();
      const j = joursDeLaLigne(l, jours, ctrl.cellules, corr.bases, sansReel);
      return { ...l, couvre: couvertureDe(l, nomService), ...j, ...parMois(j.jours, true),
        ...(ctrl.avecSupp ? { heuresSupp: heuresSuppParMois(l, jours, ctrl.cellules, sansReel) } : {}) };
    });
    // Toute l'unité : la somme de toutes les lignes, hors simulation comprise, les jours où chacune compte.
    const unite = (lignes.length ? jours : []).filter(w => lignes.every(l => l.jours.some(x => x.date === w.date))).map(w => {
      const x = lignes.map(l => l.jours.find(y => y.date === w.date));
      const reelU = somme(x, y => y.reel), simuleU = somme(x, y => y.simule);
      return { date: w.date, reel: reelU, simule: simuleU, ecart: simuleU - reelU };
    });
    const dansUneLigne = new Set(corr.lignes.flatMap(l => l.roles));
    return { schema: 'ory-comparaison', version: 1, bases: corr.bases, jours: jours.map(w => w.date),
      joursIncomplets: (bilan.joursTravail || []).filter(w => !w.complet && avecReel.has(w.date)).map(w => w.date),
      lignes, unite: { jours: unite, ...parMois(unite, false) },
      rolesSansLigne: ctrl.roles.filter(r => !dansUneLigne.has(r)),
      anomalies: { ecartees: ctrl.ecartees, signalees: ctrl.signalees, joursEcartes: ctrl.joursEcartes }, avecSupp: ctrl.avecSupp };
  }

  /* ----------------------------------------------------------------------
   *  Le modèle du fichier, et les réglages que la sauvegarde garde
   * --------------------------------------------------------------------*/

  /** Un réel d'exemple, FICTIF : trois jours, deux rôles. */
  function modeleCsv() {
    return ['date;role;heures_titulaires;heures_interim;heures_supp',
      '2026-11-02;Préparateur;56;14;2,5', '2026-11-02;Chauffeur;21;7;0',
      '2026-11-03;Préparateur;49;7;0', '2026-11-03;Chauffeur;21;0;1:30',
      '2026-11-04;Préparateur;63;14;4', '2026-11-04;Chauffeur;28;7;0'].join('\r\n') + '\r\n';
  }

  /**
   * Les réglages du calage que la sauvegarde garde (« ory-calage-v1 ») : la
   * correspondance et les décisions ; la politique d'effectif (les modèles
   * gardés, évolution 11 d) et les facteurs appliqués au barème (ce qu'il faut
   * pour les annuler). Aucune heure réelle.
   */
  function validerReglages(x) {
    if (x === undefined || x === null) return { correspondance: validerCorrespondance(null), decisions: validerDecisions(null) };
    if (!objet(x)) throw new Error('calage : un objet { correspondance, decisions } est attendu.');
    const p = x.politique === undefined || x.politique === null ? null : C().validerPolitique(x.politique);
    const a = x.applications === undefined ? [] : validerApplications(x.applications);
    return { correspondance: validerCorrespondance(x.correspondance), decisions: validerDecisions(x.decisions),
      ...(p ? { politique: p } : {}), ...(a.length ? { applications: a } : {}) };
  }

  /** Des minutes par vol : { clé: nombre }. */
  const tableMinutes = (t, ou) => {
    if (!objet(t) || !Object.values(t).every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error(ou + ' : des minutes par vol sont attendues.');
    return t;
  };
  /** Les facteurs appliqués au barème : la ligne, ses services, le facteur, la date, ce qu'il faut pour annuler, les erreurs d'avant. */
  function validerApplications(l) {
    if (!Array.isArray(l) || l.length > 50) throw new Error('calage : « applications » est une liste (50 au plus).');
    if (JSON.stringify(l).length > 4 * 1024 * 1024) throw new Error('calage : « applications » est trop volumineux.');
    return l.map((x, i) => {
      const ou = 'calage, application ' + (i + 1);
      if (!objet(x) || typeof x.ligne !== 'string' || !x.ligne || !Array.isArray(x.services) || !x.services.every(s => typeof s === 'string' && s))
        throw new Error(ou + ' : { ligne, services, a, date, avant } est attendu.');
      if (!(typeof x.a === 'number' && x.a > 0 && x.a <= 10)) throw new Error(ou + ' : le facteur a est un nombre positif.');
      const v = objet(x.avant) ? x.avant : null;
      if (!v) throw new Error(ou + ' : « avant » manque (de quoi annuler).');
      const bareme = Object.fromEntries(Object.entries(objet(v.bareme) ? v.bareme : {}).map(([s, t]) => [s, t === null ? null : tableMinutes(t, ou)]));
      const minutes = Object.fromEntries(Object.entries(objet(v.minutes) ? v.minutes : {}).map(([id, t]) => [id, tableMinutes(t, ou)]));
      const minutesVol = Object.fromEntries(Object.entries(objet(v.minutesVol) ? v.minutesVol : {}).map(([id, t]) => [id, tableMinutes(t, ou)]));
      const categories = Object.fromEntries(Object.entries(objet(v.categories) ? v.categories : {}).map(([s, c]) => {
        if (!Array.isArray(c) || c.length > 10 || !c.every(k => objet(k) && typeof k.id === 'string' && k.id.length <= 40 && objet(k.minutes)))
          throw new Error(ou + ' : des catégories { id, nom, minutes } sont attendues.');
        return [s, c.map(k => ({ id: k.id, nom: typeof k.nom === 'string' ? k.nom.slice(0, 80) : k.id, minutes: tableMinutes(k.minutes, ou) }))];
      }));
      const erreurs = Object.fromEntries(Object.entries(objet(x.erreursAvant) ? x.erreursAvant : {}).filter(([, e]) => typeof e === 'number' && Number.isFinite(e)));
      // Le modèle de la ligne avant l'application (pour le rendre à l'annulation).
      const modele = x.modele === undefined || x.modele === null ? null : C().validerPolitique({ lignes: [x.modele] }).lignes[0];
      return { ligne: x.ligne, services: x.services.slice(), a: x.a, date: typeof x.date === 'string' ? x.date.slice(0, 40) : null,
        avant: { bareme, minutes, minutesVol, categories }, erreursAvant: erreurs, ...(modele ? { modele } : {}) };
    });
  }

  const api = { CATEGORIES, BASE_DEFAUT, SEP_ROLE, heuresDe, lireReel, controler, validerDecisions, validerCorrespondance, couvertureDe,
    etpDe, baseDe, simuleDe, correlation, mesures, comparer, modeleCsv, validerReglages, cle };
  if (enNode) module.exports = api;
  else root.OrlyReel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
