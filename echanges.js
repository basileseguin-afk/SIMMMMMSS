/* ==========================================================================
 *  ÉCHANGES AVEC EXCEL — trois classeurs, un format chacun
 *
 *  Le site se pilote depuis un tableur : on exporte, on modifie, on
 *  réimporte. Trois classeurs, parce que trois personnes différentes les
 *  tiennent souvent :
 *
 *    1. ATELIERS — les équipes, ce qu'elles fabriquent, dans quel ordre, les
 *       compagnies × classes et leurs parcours ;
 *    2. BARÈME   — les homme-minutes par vol, par service et par compagnie ×
 *       classe : l'étude de temps ;
 *    3. VOLS     — le programme de départs et de retours.
 *
 *  Règles communes, dites aussi dans la feuille « Lisez-moi » de chacun :
 *    • un service s'écrit par son NOM, comme sur le plan (« MONTAGE ») ou par
 *      son identifiant (« prepa ») ; casse et accents indifférents ;
 *    • une heure s'écrit HH:MM, ou comme Excel la range (une heure) ;
 *    • une colonne marquée « (info) » est donnée pour lire : elle est
 *      ignorée à l'import ;
 *    • un import refusé ne change RIEN, et dit quelles lignes corriger.
 *
 *  Ce module ne touche ni au DOM ni au stockage : il convertit, dans les
 *  deux sens, entre l'état du site et les feuilles d'un classeur.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof require === 'function' && typeof module !== 'undefined';
  const P = enNode ? require('./moteur/production.js') : root.MoteurProduction;
  const T = enNode ? require('./tableur.js') : root.OrlyTableur;
  const PC = enNode ? require('./parcours.js') : root.OrlyParcours;
  const UI = enNode ? require('./ui-model.js') : root.OrlyUI;

  const INFO = ' (info)';
  const hh = t => T.hhmm(t);

  /** Rassemble les erreurs : on veut tout corriger d'un coup, pas une par une. */
  class Erreurs {
    constructor() { this.liste = []; }
    ajouter(feuille, ligne, message) { this.liste.push((feuille ? feuille + ', ' : '') + (ligne ? 'ligne ' + ligne + ' : ' : '') + message); }
    essayer(feuille, ligne, fn) { try { return fn(); } catch (e) { this.ajouter(feuille, ligne, e.message); return undefined; } }
    lever() {
      if (!this.liste.length) return;
      const n = this.liste.length;
      throw new Error(this.liste.slice(0, 12).join('\n') + (n > 12 ? '\n… et ' + (n - 12) + ' autre(s).' : '')
        + '\nRien n’a été importé.');
    }
  }

  const lisezMoi = (titre, lignes) => ({ nom: 'Lisez-moi', lignes: [[titre], ...lignes.map(l => [l])], largeurs: [110] });

  /* ======================================================================
   *  1. BARÈME
   * ====================================================================*/

  const ENTETE_BAREME = ['Service', 'Compagnie', 'Classe', 'Minutes par vol', 'Vols au programme' + INFO, 'Valeur appliquée' + INFO];

  /**
   * @param etat  { bareme, rendement, regime }
   * @param ctx   { services:[{id,nom}], classes:[classe], routes: Map classe → {services:Set},
   *                sansBareme?: Set des services dont aucune équipe ne lit le barème }
   */
  function baremeVersClasseur(etat, ctx) {
    const services = ctx.services || [];
    const nomDe = id => (services.find(s => s.id === id) || {}).nom || id;
    const lignes = [ENTETE_BAREME];
    const vus = new Set();
    const ordre = services.map(s => s.id);
    for (const id of Object.keys(etat.bareme)) if (!ordre.includes(id)) ordre.push(id);
    // Compagnie par compagnie, puis dans l'ordre des classes : l'ordre d'une étude.
    const classesTriees = (ctx.classes || []).slice().sort((x, y) =>
      x.cie.localeCompare(y.cie) || P.CABINES.indexOf(x.cabine) - P.CABINES.indexOf(y.cabine));

    for (const sid of ordre) {
      const table = etat.bareme[sid] || {};
      // Les services sans barème ni classe à travailler n'encombrent pas la
      // feuille ; ceux dont les équipes ne lisent pas le barème (plonge au
      // débit, mise à disposition, robot) non plus.
      if (ctx.sansBareme && ctx.sansBareme.has(sid) && !Object.keys(table).length) continue;
      const concerne = Object.keys(table).length
        || (ctx.classes || []).some(c => { const r = ctx.routes && ctx.routes.get(c.id); return r && r.services.has(sid); });
      if (!concerne) continue;
      for (const cab of P.CABINES) {
        const cle = P.cleBareme(P.TOUTES, cab); vus.add(sid + '|' + cle);
        lignes.push([nomDe(sid), '*', cab, Number.isFinite(table[cle]) ? table[cle] : null, null, null]);
      }
      // Une ligne par compagnie × classe dont le parcours passe ici : c'est
      // exactement ce que l'étude doit renseigner. Vide = la valeur commune.
      for (const c of classesTriees) {
        const r = ctx.routes && ctx.routes.get(c.id);
        const cle = P.cleBareme(c.cie, c.cabine);
        if (!(r ? r.services.has(sid) : Number.isFinite(table[cle]))) continue;
        vus.add(sid + '|' + cle);
        const propre = table[cle];
        const applique = P.minutesParVol(table, c);
        lignes.push([nomDe(sid), c.cie, c.cabine, Number.isFinite(propre) ? propre : null,
          c.vols ? c.vols.length : null, applique == null ? 'non renseigné' : applique]);
      }
      // Les valeurs propres à une compagnie absente du programme restent : on ne perd rien.
      for (const [cle, v] of Object.entries(table)) {
        if (vus.has(sid + '|' + cle)) continue;
        const i = cle.lastIndexOf('/');
        lignes.push([nomDe(sid), cle.slice(0, i), cle.slice(i + 1), v, 0, v]);
      }
    }

    const reglages = [['Paramètre', 'Valeur'], ['Rendement', etat.rendement], ['Présence (min)', etat.regime.presence]];
    etat.regime.seuils.forEach((s, i) => {
      reglages.push(['Pause ' + (i + 1) + ' — après (min de travail)', s.apres]);
      reglages.push(['Pause ' + (i + 1) + ' — durée (min)', s.duree]);
    });

    return [
      { nom: 'Barème', lignes },
      { nom: 'Réglages', lignes: reglages },
      lisezMoi('Barème — homme-minutes par vol', [
        'Une ligne = un service, une compagnie, une classe, et les minutes de travail que coûte UN VOL de cette compagnie dans cette classe.',
        'Compagnie « * » : la valeur commune à toutes les compagnies qui n’en ont pas de propre.',
        'Minutes par vol vide : pas de valeur propre, c’est la valeur commune qui s’applique.',
        'Classe : BC, PC, YC, CREW (équipage) ou SPML (repas spéciaux).',
        'Service : son nom sur le plan (ex. MONTAGE) ou son identifiant (ex. prepa).',
        'Les lignes par compagnie sont proposées pour chaque service du PARCOURS de la classe.',
        'Les colonnes « (info) » sont données pour lire : elles sont ignorées à l’import.',
        'Temps de travail d’une classe dans la journée = minutes par vol × nombre de ses vols.',
        'Durée d’un lot = homme-minutes ÷ personnes ÷ rendement.',
        'L’import REMPLACE le barème entier. Il est annulable. Une erreur, et rien n’est importé.'
      ])
    ];
  }

  /**
   * @returns {{ bareme, rendement?, regime? }} — rendement et régime seulement
   *   si la feuille « Réglages » est présente.
   */
  function classeurVersBareme(feuilles, ctx) {
    const err = new Erreurs();
    const f = T.feuille(feuilles, 'Barème', 'Bareme') || (feuilles.length === 1 ? feuilles[0] : null);
    if (!f) throw new Error('Feuille « Barème » introuvable.');
    const { entetes, objets } = T.enObjets(f.lignes);
    for (const col of ['service', 'classe', 'minutes_par_vol']) {
      if (!entetes.includes(col)) err.ajouter(f.nom, null, 'colonne « ' + col.replace(/_/g, ' ') + ' » manquante.');
    }
    err.lever();
    const service = T.correspondance(ctx.services || []);
    const bareme = {}, vus = new Map();
    for (const o of objets) {
      err.essayer(f.nom, o._ligne, () => {
        const minutes = T.nombreDe(o.minutes_par_vol, null);
        if (minutes === null) return;                    // vide : valeur commune
        const sid = service(o.service);
        if (!sid) throw new Error('service inconnu « ' + (o.service ?? '') + ' »');
        const cab = String(o.classe ?? '').trim().toUpperCase();
        if (!P.CABINES.includes(cab)) throw new Error('classe inconnue « ' + (o.classe ?? '') + ' » (BC, PC, YC, CREW ou SPML)');
        const brute = String(o.compagnie ?? '').trim();
        const cie = !brute || brute === '*' || /^toutes?$/i.test(brute) ? P.TOUTES : brute;
        if (cie !== P.TOUTES && (cie.includes('/') || cie.length > 40)) throw new Error('compagnie illisible « ' + brute + ' »');
        if (!(minutes >= 0)) throw new Error('minutes par vol positives ou nulles');
        const cle = P.cleBareme(cie, cab);
        const k = sid + '|' + cle;
        if (vus.has(k)) throw new Error('déjà renseigné ligne ' + vus.get(k) + ' (' + (o.service) + ', ' + cle + ')');
        vus.set(k, o._ligne);
        (bareme[sid] || (bareme[sid] = {}))[cle] = Math.round(minutes * 100) / 100;
      });
    }
    const out = { bareme };
    const g = T.feuille(feuilles, 'Réglages', 'Reglages');
    if (g) {
      const { objets: params } = T.enObjets(g.lignes);
      const seuils = [];
      for (const o of params) {
        err.essayer(g.nom, o._ligne, () => {
          const cle = T.cleEntete(o.parametre), v = T.nombreDe(o.valeur, null);
          if (v === null) return;
          if (cle === 'rendement') { if (!(v > 0 && v <= 2)) throw new Error('rendement entre 0 et 2'); out.rendement = v; return; }
          if (cle === 'presence_min') { if (!(v >= 30 && v <= 1440)) throw new Error('présence entre 30 et 1440 min'); (out.regime || (out.regime = {})).presence = Math.round(v); return; }
          const m = /^pause_(\d+)_(apres|duree)/.exec(cle);
          if (!m) throw new Error('paramètre inconnu « ' + o.parametre + ' »');
          const i = +m[1] - 1; seuils[i] = seuils[i] || {}; seuils[i][m[2]] = v;
        });
      }
      const propres = seuils.filter(s => s && s.duree > 0).map(s => ({ apres: s.apres || 0, duree: s.duree }));
      if (propres.length || out.regime) out.regime = { ...(out.regime || {}), seuils: propres };
    }
    err.lever();
    return out;
  }

  /* ======================================================================
   *  1 bis. RÉCAP DES MAN-MINUTES — tout le barème d'un coup d'œil
   *
   *  Une ligne par commande (compagnie × classe), une colonne par service.
   *  Dans chaque case, les man-minutes d'UN VOL de cette commande dans ce
   *  service, et d'où elles viennent :
   *    propre  — la valeur de cette compagnie × classe dans le barème
   *    commun  — la valeur « toutes compagnies » de sa classe
   *    case    — fixée dans une case d'équipe (elle prime, pour cette case)
   *    manque  — rien : elle y travaillerait en temps nul
   *    hors    — son chemin ne passe pas par ce service
   *  Sur la journée : par vol × nombre de ses vols.
   * ====================================================================*/

  /**
   * @param ctx { bareme (complet), services:[{id,nom}], classes, routes: Map,
   *              ateliers:[…], sansBareme?: Set }
   * @returns {{ colonnes:[{id,nom}], lignes:[{ classe, vols, cellules:{sid:{parVol,jour,source,atelier}}, parVol, jour }],
   *             totaux:{ parVol:{sid}, jour:{sid}, jourTotal } }}
   */
  function recapManMinutes(ctx) {
    const bareme = ctx.bareme || {}, classes = ctx.classes || [], routes = ctx.routes || new Map();
    const sans = ctx.sansBareme || new Set(), ateliers = ctx.ateliers || [];
    const passe = (c, sid) => { const r = routes.get(c.id); return !r || r.services.has(sid); };
    // Un robot ne lit pas le barème, mais il a sa colonne : son débit par commande.
    const robots = new Set(ateliers.filter(a => a.type === 'robot').map(a => a.service));
    // Un service où aucune commande ne passe n'a rien à montrer : pas de colonne.
    const colonnes = (ctx.services || []).filter(sv => (!sans.has(sv.id) || robots.has(sv.id))
      && (Object.keys(bareme[sv.id] || {}).length || classes.some(c => routes.get(c.id) && routes.get(c.id).services.has(sv.id)))
      && classes.some(c => passe(c, sv.id))).map(sv => (robots.has(sv.id) ? { ...sv, robot: true } : sv));
    const lignes = classes.map(c => {
      const vols = (c.vols || []).length, cellules = {};
      let parVol = 0, jour = 0;
      for (const sv of colonnes) {
        if (!passe(c, sv.id)) { cellules[sv.id] = { source: 'hors', parVol: null, jour: null }; continue; }
        // L'équipe qui prépare cette commande ici : son effectif se règle aussi dans le récap.
        const eq = ateliers.find(x => x.service === sv.id && (x.type === 'manuel' || x.type === 'robot') && (x.lots || []).some(l => l.includes(c.id)));
        const equipe = eq ? { id: eq.id, nom: eq.nom, personnes: eq.personnes, type: eq.type,
          commandes: new Set((eq.lots || []).flat()).size } : null;
        if (eq && eq.type === 'robot') {
          // Le robot : des plateaux à un débit, pas des man-minutes.
          const debit = P.debitRobot(eq, c.id), parVolPax = vols ? c.pax / vols : c.pax;
          cellules[sv.id] = { source: 'robot', parVol: null, jour: null, equipe, debit,
            debitPropre: !!(eq.debits && Number.isFinite(+eq.debits[c.id])), debitRobot: eq.debit, personnesMin: eq.personnesMin,
            pax: c.pax, duree: debit > 0 ? parVolPax / debit * 60 : null };
          continue;
        }
        const a = eq && eq.type === 'manuel' && eq.minutes && Number.isFinite(eq.minutes[c.id]) ? eq : null;
        const t = bareme[sv.id] || {};
        const propre = t[P.cleBareme(c.cie, c.cabine)], commun = t[P.cleBareme(P.TOUTES, c.cabine)];
        // Les man-minutes fixées dans une case valent pour TOUTE la journée de la
        // commande (tous ses vols), comme le calcul les lit : ramenées ici à un vol.
        const v = a ? (vols ? a.minutes[c.id] / vols : a.minutes[c.id]) : Number.isFinite(propre) ? propre : Number.isFinite(commun) ? commun : null;
        const source = a ? 'case' : Number.isFinite(propre) ? 'propre' : Number.isFinite(commun) ? 'commun' : 'manque';
        cellules[sv.id] = { source, parVol: v, jour: v == null ? null : (a ? a.minutes[c.id] : v * vols), atelier: a ? a.nom : null, equipe,
          // Ce que dure un vol dans cette équipe : man-minutes ÷ personnes.
          duree: v != null && equipe && equipe.type === 'manuel' && equipe.personnes > 0 ? v / equipe.personnes : null,
          bareme: Number.isFinite(propre) ? propre : Number.isFinite(commun) ? commun : null };
        if (v != null) { parVol += v; jour += v * vols; }
      }
      return { classe: c, vols, cellules, parVol, jour };
    });
    const totaux = { parVol: {}, jour: {}, jourTotal: 0 };
    for (const sv of colonnes) {
      totaux.parVol[sv.id] = lignes.reduce((n, l) => n + (l.cellules[sv.id].parVol || 0), 0);
      totaux.jour[sv.id] = lignes.reduce((n, l) => n + (l.cellules[sv.id].jour || 0), 0);
      totaux.jourTotal += totaux.jour[sv.id];
    }
    return { colonnes, lignes, totaux };
  }

  /**
   * Le fichier de paramétrage des man-minutes : le tableau de l'écran, à
   * remplir dans Excel pour les grosses modifications, puis à réimporter.
   *   « Man-minutes par vol » — une ligne par commande, une colonne par service
   *   « Toutes compagnies »   — la valeur commune de chaque classe, par service
   */
  function recapVersClasseur(ctx) {
    const r0 = recapManMinutes(ctx);
    // Les robots ont leur feuille : leur colonne ne porte pas de man-minutes.
    const r = { ...r0, colonnes: r0.colonnes.filter(sv => !sv.robot) };
    const noms = r.colonnes.map(sv => sv.nom);
    const lignes = [['Compagnie', 'Classe', 'Vols' + INFO, ...noms]];
    for (const l of r.lignes) {
      lignes.push([l.classe.cie, l.classe.cabine, l.vols, ...r.colonnes.map(sv => {
        const c = l.cellules[sv.id];
        return c.source === 'hors' ? null : c.bareme;     // le barème, pas la valeur fixée dans une case
      })]);
    }
    const communs = [['Classe', ...noms]];
    for (const cab of P.CABINES) communs.push([cab, ...r.colonnes.map(sv => { const v = ((ctx.bareme || {})[sv.id] || {})[P.cleBareme(P.TOUTES, cab)]; return Number.isFinite(v) ? v : null; })]);
    // L'effectif de chaque équipe qui prépare ces commandes : une ligne par case
    // (une case partagée n'apparaît qu'une fois, avec ses commandes).
    const personnes = [['Case', 'Service' + INFO, 'Commandes' + INFO, 'Personnes']];
    const nomSvc = new Map((ctx.services || []).map(sv => [sv.id, sv.nom]));
    const vues = new Set(r.colonnes.map(sv => sv.id));
    for (const a of (ctx.ateliers || [])) {
      if (!vues.has(a.service) || (a.type !== 'manuel' && a.type !== 'robot') || !(a.lots || []).some(l => l.length)) continue;
      const cmds = [...new Set(a.lots.flat())];
      personnes.push([a.nom, nomSvc.get(a.service) || a.service, cmds.slice(0, 8).join(', ') + (cmds.length > 8 ? '…' : ''), a.personnes]);
    }
    // Les robots : le débit de chaque commande (plateaux/h) ; « toutes » = celui du robot.
    const robot = [['Case', 'Compagnie', 'Classe', 'Plateaux sur la journée' + INFO, 'Débit (plateaux/h)']];
    for (const a of (ctx.ateliers || [])) {
      if (a.type !== 'robot') continue;
      robot.push([a.nom, 'toutes', null, null, a.debit]);
      for (const id of [...new Set((a.lots || []).flat())]) {
        const c = (ctx.classes || []).find(x => x.id === id), i = id.lastIndexOf('/');
        robot.push([a.nom, id.slice(0, i), id.slice(i + 1), c ? c.pax : null, a.debits && Number.isFinite(+a.debits[id]) ? +a.debits[id] : null]);
      }
    }
    return [
      { nom: 'Man-minutes par vol', lignes },
      { nom: 'Toutes compagnies', lignes: communs },
      { nom: 'Personnes', lignes: personnes },
      { nom: 'Robot', lignes: robot },
      lisezMoi('Man-minutes — fichier de paramétrage, à modifier dans Excel puis réimporter', [
        'Man-minutes par vol : une ligne par commande (compagnie × classe), une colonne par service.',
        '   Chaque case : les man-minutes d’UN vol de cette commande dans ce service. Pour la journée, le calcul multiplie par le nombre de vols.',
        '   Une case égale à la valeur « Toutes compagnies » de sa classe la suit ; une autre valeur devient propre à cette compagnie.',
        '   Une case vidée revient à la valeur « Toutes compagnies ». Une case vide d’un service où la commande ne passe pas est ignorée.',
        'Toutes compagnies : la valeur commune de chaque classe, par service. Vide : aucune.',
        'Personnes : l’effectif de chaque case (équipe) qui prépare ces commandes. Le nom de la case est la clé : ne le changez pas.',
        'Robot : le débit du robot en plateaux par heure — ligne « toutes » — et celui de chaque commande. Vide : celui du robot.',
        '   Durée d’une commande sur le robot = ses plateaux ÷ son débit. Le robot tourne s’il a son effectif minimum (Personnes).',
        '   Une case partagée par plusieurs commandes n’a qu’une ligne : son effectif vaut pour toutes. Durée d’un vol = man-minutes ÷ personnes.',
        'Les colonnes sont des services : ajoutez-en ou retirez-en, seules celles présentes sont modifiées.',
        'Les man-minutes fixées dans une case d’équipe ne sont pas ici : elles se règlent dans la case (ou dans le classeur des cases).'
      ])
    ];
  }

  /**
   * Relit le fichier de paramétrage. Seuls les services présents en colonne
   * changent ; les autres gardent leur barème.
   * @param bareme le barème en place (complet)
   * @returns {{ bareme, changes:number, personnes:{ atelierId: n } }}
   */
  function classeurVersRecap(feuilles, bareme, ctx) {
    const err = new Erreurs();
    const f = T.feuille(feuilles, 'Man-minutes par vol', 'Man minutes par vol');
    if (!f) throw new Error('Feuille « Man-minutes par vol » introuvable : exportez le fichier depuis le récap des man-minutes.');
    const service = T.correspondance(ctx.services || []);
    const out = JSON.parse(JSON.stringify(bareme || {}));
    const avant = JSON.stringify(out);
    const colonnesDe = (feuille, depuis) => (feuille.lignes[0] || []).map((h, i) => {
      if (i < depuis || h == null || String(h).trim() === '' || /\(info\)$/.test(String(h).trim())) return null;
      const sid = service(String(h).trim());
      if (!sid) err.ajouter(feuille.nom, 1, 'service inconnu en colonne : « ' + h + ' »');
      return sid;
    });
    const nombre = (feuille, ligne, v) => {
      if (v === null || v === undefined || String(v).trim() === '' || /^[—·-]$/.test(String(v).trim())) return null;
      let n; try { n = T.nombreDe(v, NaN); } catch (e) { n = NaN; }
      if (!(n >= 0)) { err.ajouter(feuille.nom, ligne, 'man-minutes positives ou nulles attendues, pas « ' + v + ' »'); return undefined; }
      return Math.round(n * 100) / 100;
    };
    // 1. Les valeurs communes d'abord : une case égale à la sienne la suit.
    const fc = T.feuille(feuilles, 'Toutes compagnies');
    if (fc) {
      const cols = colonnesDe(fc, 1);
      fc.lignes.slice(1).forEach((row, k) => {
        const cab = String(row[0] ?? '').trim().toUpperCase(); if (!cab) return;
        if (!P.CABINES.includes(cab)) { err.ajouter(fc.nom, k + 2, 'classe inconnue « ' + row[0] + ' »'); return; }
        cols.forEach((sid, i) => {
          if (!sid) return;
          const v = nombre(fc, k + 2, row[i]); if (v === undefined) return;
          const t = out[sid] || (out[sid] = {}), cle = P.cleBareme(P.TOUTES, cab);
          if (v === null) delete t[cle]; else t[cle] = v;
        });
      });
    }
    // 2. Les commandes : propre si elle diffère de la valeur commune.
    const cols = colonnesDe(f, 2);
    const routes = ctx.routes || new Map();
    f.lignes.slice(1).forEach((row, k) => {
      const cie = String(row[0] ?? '').trim().toUpperCase(), cab = String(row[1] ?? '').trim().toUpperCase();
      if (!cie && !cab) return;
      if (!cie || cie.includes('/') || cie.length > 40) { err.ajouter(f.nom, k + 2, 'compagnie illisible « ' + (row[0] ?? '') + ' »'); return; }
      if (!P.CABINES.includes(cab)) { err.ajouter(f.nom, k + 2, 'classe inconnue « ' + (row[1] ?? '') + ' » (BC, PC, YC, CREW ou SPML)'); return; }
      const r = routes.get(P.idClasse(cie, cab));
      cols.forEach((sid, i) => {
        if (!sid) return;
        const v = nombre(f, k + 2, row[i]); if (v === undefined) return;
        const t = out[sid] || (out[sid] = {}), cle = P.cleBareme(cie, cab), commun = t[P.cleBareme(P.TOUTES, cab)];
        if (v === null) { if (!r || r.services.has(sid)) delete t[cle]; return; }
        if (Number.isFinite(commun) && commun === v) delete t[cle]; else t[cle] = v;
      });
    });
    // 3 bis. Les débits des robots : seulement ce qui change.
    const debits = {};
    const fr = T.feuille(feuilles, 'Robot');
    if (fr) {
      const parNom = new Map((ctx.ateliers || []).filter(a => a.type === 'robot').map(a => [T.cleEntete(a.nom), a]));
      const nouv = new Map();
      for (const o of T.enObjets(fr.lignes).objets) {
        err.essayer(fr.nom, o._ligne, () => {
          const nom = String(o.case ?? '').trim(); if (!nom) return;
          const a = parNom.get(T.cleEntete(nom));
          if (!a) throw new Error('robot inconnu « ' + nom + ' » : le nom de la case est la clé');
          if (!nouv.has(a)) nouv.set(a, { debit: a.debit, debits: {} });
          const n = nouv.get(a), v = T.nombreDe(o.debit_plateaux_h, null);
          const cie = String(o.compagnie ?? '').trim();
          if (v !== null && !(v > 0)) throw new Error(nom + ' : débit positif attendu, en plateaux par heure');
          if (!cie || T.cleEntete(cie) === 'toutes') { if (v !== null) n.debit = v; return; }
          const cab = String(o.classe ?? '').trim().toUpperCase();
          if (!P.CABINES.includes(cab)) throw new Error('classe inconnue « ' + (o.classe ?? '') + ' »');
          if (v !== null) n.debits[P.idClasse(cie, cab)] = v;
        });
      }
      for (const [a, n] of nouv) {
        const avant = JSON.stringify([a.debit, a.debits || {}]);
        if (avant !== JSON.stringify([n.debit, n.debits])) debits[a.id] = n;
      }
    }
    // 3. L'effectif des cases : seulement ce qui change.
    const personnes = {};
    const fp = T.feuille(feuilles, 'Personnes');
    if (fp) {
      const parNom = new Map((ctx.ateliers || []).map(a => [T.cleEntete(a.nom), a]));
      const { objets } = T.enObjets(fp.lignes);
      for (const o of objets) {
        err.essayer(fp.nom, o._ligne, () => {
          const nom = String(o.case ?? '').trim(); if (!nom) return;
          const a = parNom.get(T.cleEntete(nom));
          if (!a) throw new Error('case inconnue « ' + nom + ' » : le nom est la clé, il doit être celui du site');
          const v = T.nombreDe(o.personnes, null); if (v === null) return;
          if (!Number.isInteger(v) || v < 0 || v > 999) throw new Error(nom + ' : nombre de personnes entier attendu (0 à 999)');
          if (v !== a.personnes) personnes[a.id] = v;
        });
      }
    }
    err.lever();
    for (const k of Object.keys(out)) if (!Object.keys(out[k]).length && !(bareme || {})[k]) delete out[k];
    // Le nombre de valeurs qui changent, pour le dire avant de remplacer.
    let changes = 0;
    const a = JSON.parse(avant);
    for (const sid of new Set([...Object.keys(a), ...Object.keys(out)])) {
      for (const cle of new Set([...Object.keys(a[sid] || {}), ...Object.keys(out[sid] || {})])) if ((a[sid] || {})[cle] !== (out[sid] || {})[cle]) changes++;
    }
    return { bareme: out, changes: changes + Object.keys(personnes).length + Object.keys(debits).length, personnes, debits };
  }

  /* ======================================================================
   *  1 ter. RÉCAP DES CASES — le fichier de paramétrage des cases
   *
   *  Une ligne par case : son jour, son heure de départ, ses personnes et ses
   *  commandes dans l'ordre. « TX/BC → TX/PC + AF/PC » : TX BC d'abord, puis
   *  TX PC et AF PC ensemble. Le nom de la case est la clé.
   * ====================================================================*/

  const TYPE_LU = { manuel: 'équipe', robot: 'robot', lavage: 'plonge', dispo: 'mise à disposition', handling: 'handling' };
  const ecrireLots = lots => (lots || []).filter(l => l.length).map(l => l.join(' + ')).join(' → ');

  /* Une mise à disposition ouverte comme une boutique s'écrit « ouvert 07:00-18:00 » dans la colonne Vagues. */
  const RE_OUVERT = /^ouvert(?:e)?\s+(?:de\s+)?(\d{1,2}[:h]\d{2})\s*(?:-|–|—|à|a)\s*(\d{1,2}[:h]\d{2})$/i;
  const ecrireOuverture = a => 'ouvert ' + a.ouverture.de + '-' + a.ouverture.a;
  /** « ouvert 07:00-18:00 » → { de, a } ; autre chose → null. */
  function lireOuverture(texte) {
    const m = RE_OUVERT.exec(String(texte ?? '').trim()); if (!m) return null;
    const hm = x => { const t = T.heureDe(x.replace('h', ':')); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
    return { de: hm(m[1]), a: hm(m[2]) };
  }

  function recapCasesVersClasseur(etat, ctx) {
    const services = ctx.services || [];
    const nomDe = id => (services.find(s => s.id === id) || {}).nom || id;
    const fins = new Map((((ctx.resultat || {}).ateliers) || []).map(a => [a.id, a.fin]));
    const rang = new Map(services.map((s, i) => [s.id, i]));
    const lignes = [['Case', 'Service' + INFO, 'Type' + INFO, 'Jour', 'Départ', 'Personnes', 'Commandes, dans l’ordre', 'Vagues', 'Fin prévue' + INFO]];
    const debutDe = a => (a.jour || 0) * 1440 + (T.heureDe(a.debut) || 0);
    for (const a of [...etat.ateliers].sort((x, y) => (rang.get(x.service) ?? 999) - (rang.get(y.service) ?? 999) || debutDe(x) - debutDe(y))) {
      const fabrique = a.type === 'manuel' || a.type === 'robot';
      const fin = fins.get(a.id);
      lignes.push([a.nom, nomDe(a.service), TYPE_LU[a.type] || a.type,
        a.type === 'dispo' ? null : jourEcrit(a.jour || 0), a.type === 'dispo' ? null : a.debut,
        a.type === 'dispo' ? null : a.personnes,
        fabrique ? ecrireLots(a.lots) || null : null,
        a.type === 'dispo' ? (a.permanent === false ? (a.vagues && a.vagues.length ? a.vagues : [{ debut: a.debut, jour: a.jour }]).map(v => jourEcrit(v.jour || 0) + ' ' + v.debut).join('; ')
          : a.ouverture ? ecrireOuverture(a) : 'permanente') : null,
        Number.isFinite(fin) && a.type !== 'dispo' ? P.hhmm(fin) : null]);
    }
    return [
      { nom: 'Cases', lignes },
      lisezMoi('Cases — fichier de paramétrage, à modifier dans Excel puis réimporter', [
        'Une ligne par case. Le nom de la case est la clé : ne le changez pas (les colonnes « (info) » ne sont pas lues).',
        'Jour : J le jour du départ des vols, J-1 la veille… Départ : l’heure d’arrivée de l’équipe (HH:MM). Personnes : son effectif.',
        'Commandes, dans l’ordre : « TX/BC → TX/PC + AF/PC » = TX BC d’abord, puis TX PC et AF PC ensemble (elles sortent ensemble).',
        '   Une commande ajoutée à une case quitte les autres cases de ce service. Vide : la case ne prépare plus rien.',
        '   Seules les équipes et les robots ont des commandes : une plonge, une mise à disposition, un handling servent tout le monde.',
        'Vagues : pour une mise à disposition, « ouvert 07:00-18:00 » (ouverte chaque jour, comme une boutique),',
        '   « J-1 14:00; J 04:00 » (à heures fixes), ou « permanente » (toujours ouverte).',
        'Le handling travaille le jour J des vols : son jour reste J.'
      ])
    ];
  }

  /**
   * Relit le fichier de paramétrage des cases.
   * @returns {{ etat, changes:[nom de case] }}
   */
  function classeurVersRecapCases(feuilles, etat, ctx) {
    const err = new Erreurs();
    const f = T.feuille(feuilles, 'Cases');
    if (!f) throw new Error('Feuille « Cases » introuvable : exportez le fichier depuis le récap des cases.');
    const out = JSON.parse(JSON.stringify(etat));
    const parNom = new Map(out.ateliers.map(a => [T.cleEntete(a.nom), a]));
    const connues = new Set((ctx.classes || []).map(c => c.id));
    // Ce qui compte d'une case, tel que le calcul le lit : sans liste de vagues,
    // une mise à disposition a une vague, à son heure.
    const sig = a => JSON.stringify([a.jour || 0, a.debut, a.personnes, a.lots,
      a.type === 'dispo' ? (a.permanent === false ? ((a.vagues && a.vagues.length ? a.vagues : [{ debut: a.debut, jour: a.jour || 0 }]).map(v => [v.debut, v.jour || 0]))
        : a.ouverture ? [a.ouverture.de, a.ouverture.a] : 'permanente') : null]);
    const avant = new Map(out.ateliers.map(a => [a.id, sig(a)]));
    const nouveauxLots = new Map();
    for (const o of T.enObjets(f.lignes).objets) {
      err.essayer(f.nom, o._ligne, () => {
        const nom = String(o.case ?? '').trim(); if (!nom) return;
        const a = parNom.get(T.cleEntete(nom));
        if (!a) throw new Error('case inconnue « ' + nom + ' » : le nom est la clé, il doit être celui du site');
        if (a.type !== 'dispo') {
          if (o.jour !== undefined && o.jour !== null && String(o.jour).trim() !== '') {
            const j = jourDe(o.jour);
            if (a.type === 'handling' && j !== 0) throw new Error(nom + ' : le handling travaille le jour J des vols, pas ' + jourEcrit(j));
            a.jour = j;
          }
          if (o.depart !== undefined && o.depart !== null && String(o.depart).trim() !== '') {
            const t = T.heureDe(o.depart);
            if (t === null || t >= 1440) throw new Error(nom + ' : heure de départ illisible « ' + o.depart + ' » (HH:MM)');
            a.debut = hh(t);
          }
          const p = T.nombreDe(o.personnes, null);
          if (p !== null) { if (!Number.isInteger(p) || p < 0 || p > 999) throw new Error(nom + ' : personnes, entier de 0 à 999'); a.personnes = p; }
        }
        if (a.type === 'manuel' || a.type === 'robot') {
          const brut = String(o.commandes_dans_l_ordre ?? o.commandes ?? '').trim();
          const lots = !brut ? [] : brut.split(SEP_ETAPES).filter(Boolean).map(l => [...new Set(l.split(/\s*\+\s*/).filter(Boolean).map(x => {
            const m = /^(.+)\/([a-z]+)$/i.exec(x.trim());
            if (!m || !P.CABINES.includes(m[2].toUpperCase())) throw new Error(nom + ' : commande illisible « ' + x + ' » (ex. TX/BC)');
            const id = P.idClasse(m[1], m[2].toUpperCase());
            if (connues.size && !connues.has(id)) throw new Error(nom + ' : commande inconnue « ' + id + ' » (absente du programme)');
            return id;
          }))]).filter(l => l.length);
          nouveauxLots.set(a, lots);
        } else if (a.type === 'dispo') {
          const vv = String(o.vagues ?? '').trim();
          const ouv = lireOuverture(vv);
          if (ouv) { a.permanent = true; a.ouverture = ouv; }
          else if (/^permanente?$/i.test(vv)) { a.permanent = true; delete a.ouverture; }
          else if (vv) {
            delete a.ouverture;
            a.permanent = false;
            a.vagues = vv.split(/\s*;\s*/).filter(Boolean).map(t => {
              const m = /^(?:(J(?:\s*[-−–]\s*\d+)?)\s+)?(\d{1,2}[:h]\d{2})$/i.exec(t.trim());
              if (!m) throw new Error(nom + ' : vague illisible « ' + t + ' » (ex. « J-1 14:00; J 04:00 », ou « ouvert 07:00-18:00 »)');
              return { debut: hh(T.heureDe(m[2].replace('h', ':'))), jour: jourDe((m[1] || 'J').replace(/\s+/g, '')) };
            });
          }
        }
      });
    }
    // Un service, une commande, une case. Une commande écrite dans deux cases
    // du même service va à celle où elle est NOUVELLE — on l'a déplacée dans
    // Excel sans l'effacer de l'ancienne ; nouvelle dans les deux, on ne choisit pas.
    const lotsAvant = new Map(etat.ateliers.map(a => [a.id, new Set((a.lots || []).flat())]));
    const tous = new Map();   // service|commande → [cases]
    for (const [a, lots] of nouveauxLots) for (const id of new Set(lots.flat())) {
      const k = a.service + '|' + id; if (!tous.has(k)) tous.set(k, []); tous.get(k).push(a);
    }
    for (const [k, cs] of tous) {
      const id = k.slice(k.indexOf('|') + 1);
      // Une case de ce service hors du fichier qui la prépare compte aussi.
      const autres = out.ateliers.filter(b => !nouveauxLots.has(b) && b.service === cs[0].service && (b.lots || []).some(l => l.includes(id)));
      if (cs.length + autres.length < 2) continue;
      const neuves = cs.filter(a => !lotsAvant.get(a.id).has(id));
      if (neuves.length !== 1) { err.ajouter(f.nom, null, id + ' est dans plusieurs cases du même service (' + cs.concat(autres).map(a => '« ' + a.nom + ' »').join(', ') + ') : laissez-la dans une seule'); continue; }
      for (const a of cs.concat(autres)) if (a !== neuves[0]) {
        if (nouveauxLots.has(a)) nouveauxLots.set(a, nouveauxLots.get(a).map(l => l.filter(x => x !== id)).filter(l => l.length));
        else a.lots = (a.lots || []).map(l => l.filter(x => x !== id)).filter(l => l.length);
      }
    }
    for (const [a, lots] of nouveauxLots) a.lots = lots;
    err.lever();
    const changes = out.ateliers.filter(a => avant.get(a.id) !== sig(a)).map(a => a.nom);
    return { etat: out, changes };
  }

  /* ======================================================================
   *  2. VOLS
   * ====================================================================*/

  const COLS_VOLS = ['vol_id', 'compagnie', 'type_avion', 'sens', 'heure_std', 'heure_sta', 'nb_BC', 'nb_PC', 'nb_YC', 'nb_CREW', 'nb_SPML'];

  function volsVersClasseur(vols) {
    const ligne = (v, sens) => [v.id, v.cie, v.avion && v.avion !== '—' ? v.avion : null,
      sens === 'DEP' ? (Number.isFinite(v.std) ? hh(v.std) : null) : (Number.isFinite(v.sta) ? hh(v.sta) : null),
      v.bc || 0, v.pc || 0, v.yc || 0, v.crew || 0, v.spml || 0];
    const tete = h => ['vol_id', 'compagnie', 'type_avion', h, 'nb_BC', 'nb_PC', 'nb_YC', 'nb_CREW', 'nb_SPML'];
    return [
      { nom: 'Départs', lignes: [tete('heure_std'), ...vols.filter(v => v.sens === 'DEP').map(v => ligne(v, 'DEP'))] },
      { nom: 'Retours', lignes: [tete('heure_sta'), ...vols.filter(v => v.sens === 'RET').map(v => ligne(v, 'RET'))] },
      lisezMoi('Programme de vols — départs et retours', [
        'Feuille « Départs » : un vol qui part, avec son heure de départ (heure_std) et ses quantités par classe.',
        'Feuille « Retours » : un vol qui revient, avec son heure d’arrivée (heure_sta). Il ramène du matériel à laver.',
        'Heures en HH:MM. Quantités entières. nb_CREW et nb_SPML sont facultatifs.',
        'Chaque départ crée ou nourrit une compagnie × classe (AF/BC, AF/YC…) : c’est l’unité fabriquée.',
        'Une seule feuille avec une colonne « sens » (DEP / RET) est aussi acceptée : c’est le format CSV.',
        'L’import REMPLACE le programme entier. Une erreur, et rien n’est importé.'
      ])
    ];
  }

  function classeurVersVols(feuilles) {
    const dep = T.feuille(feuilles, 'Départs', 'Departs'), ret = T.feuille(feuilles, 'Retours');
    if (dep || ret) {
      // Deux feuilles : on reconstitue le format à une table, sens compris.
      const lignes = [COLS_VOLS];
      const err = new Erreurs();
      for (const [f, sens, h] of [[dep, 'DEP', 'heure_std'], [ret, 'RET', 'heure_sta']]) {
        if (!f) continue;
        const { entetes, objets } = T.enObjets(f.lignes);
        if (!entetes.includes(h)) { err.ajouter(f.nom, null, 'colonne « ' + h + ' » manquante.'); continue; }
        for (const o of objets) {
          const l = COLS_VOLS.map(c => {
            const k = T.cleEntete(c);
            if (c === 'sens') return sens;
            if (c === (sens === 'DEP' ? 'heure_sta' : 'heure_std')) return null;
            const v = o[k];
            return v === undefined ? null : v;
          });
          l.ligne = f.nom + ', ligne ' + o._ligne;
          lignes.push(l);
        }
      }
      err.lever();
      return UI.parseFlightRows(lignes);
    }
    const f = T.feuille(feuilles, 'Vols') || feuilles[0];
    return UI.parseFlightRows(f.lignes);
  }

  /* ======================================================================
   *  3. ATELIERS, CLASSES ET PARCOURS
   * ====================================================================*/

  const TYPES_FR = { manuel: 'manuel', robot: 'robot', lavage: 'plonge', dispo: 'mise à disposition', handling: 'handling' };
  const typeDe = v => {
    const k = T.cleEntete(v || 'manuel');
    if (['manuel', 'equipe'].includes(k)) return 'manuel';
    if (k === 'robot') return 'robot';
    if (['plonge', 'lavage'].includes(k)) return 'lavage';
    if (['mise_a_disposition', 'dispo', 'disposition'].includes(k)) return 'dispo';
    if (['handling', 'chargement', 'par_vol'].includes(k)) return 'handling';
    throw new Error('type inconnu « ' + v + ' » (manuel, robot, plonge, mise à disposition ou handling)');
  };
  const SEP_CLASSES = /\s*[+,;]\s*/;
  const SEP_ETAPES = /\s*(?:→|->|>)\s*/;

  /* ---- Horaires : l'heure de début de chaque case ------------------------
   * Une feuille à part, la seule à ouvrir pour décaler une équipe. Elle voyage
   * seule (bouton « ⇩ Horaires ») ou dans le classeur complet. */

  /** « J-1 », « J », « -1 » ou 0 : le décalage en jours, de -7 à 0. */
  function jourDe(v) {
    if (v === null || v === undefined || v === '') return 0;
    const t = String(v).trim().toUpperCase().replace(/\s+/g, '');
    const m = /^(?:J)?([-−–]\d+)?$/.exec(t) || /^(?:J)?(0)$/.exec(t);
    const n = m ? (m[1] ? -Math.abs(parseInt(m[1].replace(/[−–]/, '-'), 10)) : 0) : NaN;
    if (!Number.isInteger(n) || n < -7) throw new Error('jour illisible « ' + v + ' » : J pour le jour du départ, J-1 la veille… jusqu’à J-7');
    return n || 0;
  }
  const jourEcrit = j => (j ? 'J' + j : 'J');

  /**
   * @param ctx { services, resultat? } — le résultat du moment, pour la fin (info).
   */
  function feuilleHoraires(etat, ctx) {
    const services = ctx.services || [];
    const nomDe = id => (services.find(s => s.id === id) || {}).nom || id;
    const fins = new Map((((ctx.resultat || {}).ateliers) || []).map(a => [a.id, a.fin]));
    const lignes = [['Atelier', 'Jour', 'Début', 'Service' + INFO, 'Personnes' + INFO, 'Fin prévue' + INFO, 'Prépare' + INFO]];
    // Dans l'ordre de la journée : de la première équipe arrivée à la dernière.
    const ordre = services.map(s => s.id);
    const rang = a => (ordre.includes(a.service) ? ordre.indexOf(a.service) : ordre.length);
    const debutDe = a => (a.jour || 0) * 1440 + (T.heureDe(a.debut) || 0);
    const prepare = a => {
      const ids = (a.lots || []).map(l => l.join(' + '));
      return ids.length ? ids.slice(0, 8).join(', ') + (ids.length > 8 ? '… (' + ids.length + ')' : '') : null;
    };
    for (const a of [...etat.ateliers].sort((x, y) => debutDe(x) - debutDe(y) || rang(x) - rang(y))) {
      const fin = fins.get(a.id);
      lignes.push([a.nom, jourEcrit(a.jour || 0), a.debut, nomDe(a.service), a.type === 'dispo' ? null : a.personnes,
        Number.isFinite(fin) ? P.hhmm(fin) : null, prepare(a)]);
    }
    return { nom: 'Horaires', lignes };
  }

  /** Applique la feuille « Horaires » aux ateliers que `atelierNomme` retrouve. */
  function lireHoraires(fH, atelierNomme, err) {
    const vus = new Map(), changes = [];
    for (const o of T.enObjets(fH.lignes).objets) {
      const a = atelierNomme(o.atelier, fH.nom, o._ligne); if (!a) continue;
      err.essayer(fH.nom, o._ligne, () => {
        if (vus.has(a)) throw new Error('« ' + a.nom + ' » a déjà son horaire ligne ' + vus.get(a));
        vus.set(a, o._ligne);
        const t = T.heureDe(o.debut);
        if (t === null) throw new Error(a.nom + ' : heure de début manquante (HH:MM)');
        if (t >= 1440) throw new Error(a.nom + ' : ' + hh(t) + ' dépasse 23:59 — écrivez l’heure du jour et changez la colonne Jour');
        const jour = jourDe(o.jour);
        if (a.type === 'handling' && jour !== 0) throw new Error(a.nom + ' : le handling travaille le jour J des vols, pas ' + jourEcrit(jour));
        if (a.debut !== hh(t) || (a.jour || 0) !== jour) changes.push(a);
        a.debut = hh(t); a.jour = jour;
        // Une mise à disposition par vagues : l'horaire est celui de sa première.
        // (sauf si la colonne « Vagues » de la feuille Ateliers les donne : elle prime).
        if (a.type === 'dispo' && Array.isArray(a.vagues) && a.vagues.length && !a._vaguesLues) a.vagues[0] = { debut: a.debut, jour };
      });
    }
    return changes;
  }

  /** Le petit classeur des horaires : la feuille, et comment la remplir. */
  function horairesVersClasseur(etat, ctx) {
    return [feuilleHoraires(etat, ctx),
      lisezMoi('Horaires des ateliers — à modifier dans Excel puis réimporter', [
        'Une ligne par atelier (une case). Seules les colonnes Jour et Début sont lues ; celles marquées « (info) » sont là pour se repérer.',
        'Début : l’heure d’arrivée de l’équipe, en HH:MM (ex. 04:30).',
        'Jour : J le jour du départ des vols, J-1 la veille, J-2 l’avant-veille (jusqu’à J-7).',
        'Le nom de l’atelier est la clé : ne le changez pas ici. Une ligne retirée laisse son atelier à son heure.',
        'Réimportez avec « ⇧ Importer » : seules les heures changent, le reste de l’unité ne bouge pas. L’import est annulable.',
        'Une erreur, et rien n’est importé.'
      ])];
  }

  /** Le classeur ne porte que des horaires : pas de feuille « Ateliers ». */
  const estClasseurHoraires = feuilles => !!T.feuille(feuilles, 'Horaires') && !T.feuille(feuilles, 'Ateliers');

  /**
   * Seules les heures changent.
   * @returns {{ etat, changes:[noms des ateliers décalés] }}
   */
  function classeurVersHoraires(feuilles, etat) {
    const fH = T.feuille(feuilles, 'Horaires');
    if (!fH) throw new Error('Feuille « Horaires » introuvable.');
    const err = new Erreurs();
    const out = JSON.parse(JSON.stringify(etat));
    const parNom = new Map(out.ateliers.map(a => [T.cleEntete(a.nom), a]));
    const atelierNomme = (v, ou, ligne) => {
      const a = parNom.get(T.cleEntete(v));
      if (!a) err.ajouter(ou, ligne, 'atelier inconnu « ' + (v ?? '') + ' » : le nom est la clé, il doit être celui du site');
      return a;
    };
    const changes = lireHoraires(fH, atelierNomme, err);
    err.lever();
    return { etat: out, changes: changes.map(a => a.nom) };
  }

  /**
   * @param etat l'état de l'onglet Ateliers
   * @param ctx  { services:[{id,nom}], classes:[classe du moment], resultat? }
   */
  function ateliersVersClasseur(etat, ctx) {
    const services = ctx.services || [];
    const nomDe = id => (services.find(s => s.id === id) || {}).nom || id;
    const ateliers = [['Atelier', 'Service', 'Type', 'Personnes', 'Pauses',
      'Poste réglementaire', 'Présence (min)', 'Emporte du matériel', 'Débit robot (plateaux/h)',
      'Effectif mini robot', 'Plafond plonge (u/h)', 'Permanent', 'Identifiant',
      'Vols en même temps', 'Pas avant départ (h)', 'Compagnies chargées', 'Vagues',
      'Chauffeurs long courrier', 'Chauffeurs court courrier', 'Plonge par vol']];
    const handling = [['Atelier', 'Compagnie', 'Minutes par vol', 'Courrier']];
    const chauffeurs = [['Atelier', 'Début', 'Fin', 'Chauffeurs']];
    const plongeVol = [['Atelier', 'Compagnie', 'Minutes par vol']];
    const fab = [['Atelier', 'Ordre', 'Compagnies × classes']];
    const mm = [['Atelier', 'Compagnie × classe', 'Man-minutes']];
    const debitsRobot = [['Atelier', 'Compagnie × classe', 'Débit (plateaux/h)']];
    const tunnels = [['Atelier', 'Tunnel', 'Débit (u/h)', 'Personnes', 'Actif']];
    for (const a of etat.ateliers) {
      ateliers.push([a.nom, nomDe(a.service), TYPES_FR[a.type] || a.type,
        a.type === 'dispo' ? null : a.personnes,
        (a.pauses || []).map(p => p.de + '-' + p.a).join('; ') || null,
        a.regime && a.regime.actif === false ? 'non' : 'oui',
        a.regime && Number.isFinite(a.regime.presence) ? a.regime.presence : null,
        a.materiel === 'consomme' ? 'oui' : 'non',
        a.type === 'robot' ? a.debit : null, a.type === 'robot' ? a.personnesMin : null,
        a.type === 'lavage' ? a.plafond || null : null,
        a.type === 'dispo' ? (a.permanent === false ? 'non' : 'oui') : null,
        a.id,
        a.type === 'handling' ? a.simultanes || 1 : null,
        a.type === 'handling' ? Math.round((a.avance ?? P.AVANCE_HANDLING) / 6) / 10 : null,
        a.type === 'handling' ? (a.compagnies || []).join(', ') || 'toutes' : null,
        a.type === 'dispo' && a.permanent === false ? (a.vagues && a.vagues.length ? a.vagues : [{ debut: a.debut, jour: a.jour }])
          .map(v => jourEcrit(v.jour || 0) + ' ' + v.debut).join('; ') : a.type === 'dispo' && a.ouverture ? ecrireOuverture(a) : null,
        a.type === 'handling' ? (a.chauffeurs || {}).long ?? 2 : null, a.type === 'handling' ? (a.chauffeurs || {}).court ?? 1 : null,
        a.type === 'lavage' ? (a.parVol ? 'oui' : 'non') : null]);
      if (a.type === 'handling') {
        // Une ligne par compagnie réglée : sa durée, et si elle est long courrier.
        const longs = new Set(a.longs || []), d = a.durees || {};
        if (d[P.TOUTES] !== undefined) handling.push([a.nom, 'toutes', d[P.TOUTES], null]);
        for (const cie of [...new Set(Object.keys(d).filter(k => k !== P.TOUTES).concat([...longs]))].sort())
          handling.push([a.nom, cie, d[cie] ?? null, longs.has(cie) ? 'long' : 'court']);
        for (const c of (a.creneaux || [])) chauffeurs.push([a.nom, c.de, c.a, c.n]);
      }
      if (a.type === 'lavage' && a.parVol) for (const [cie, v] of Object.entries(a.durees || {})) plongeVol.push([a.nom, cie === P.TOUTES ? 'toutes' : cie, v]);
      (a.lots || []).forEach((l, i) => fab.push([a.nom, i + 1, l.join(' + ')]));
      for (const [id, v] of Object.entries(a.minutes || {})) mm.push([a.nom, id, v]);
      for (const [id, v] of Object.entries(a.debits || {})) debitsRobot.push([a.nom, id, v]);
      for (const t of (a.tunnels || [])) tunnels.push([a.nom, t.nom, t.debit, t.personnes, t.actif === false ? 'non' : 'oui']);
    }

    const exclues = new Set(etat.exclues || []);
    const ajoutees = new Set((etat.ajoutees || []).map(c => P.idClasse(c.cie, c.cabine)));
    const nomParcours = id => ((etat.parcours || []).find(p => p.id === id) || {}).nom || null;
    const classes = [['Compagnie', 'Classe', 'Parcours', 'Retirée', 'Au programme' + INFO, 'Vols' + INFO, 'Passagers' + INFO]];
    const lues = new Set();
    for (const c of (ctx.classes || [])) {
      lues.add(c.id);
      classes.push([c.cie, c.cabine, nomParcours((etat.parcoursClasse || {})[c.id]), exclues.has(c.id) ? 'oui' : 'non',
        c.origine === 'ajoutee' ? 'non' : 'oui', c.vols ? c.vols.length : 0, c.pax || 0]);
    }
    for (const id of [...exclues, ...ajoutees]) {
      if (lues.has(id)) continue; lues.add(id);
      const i = id.lastIndexOf('/');
      classes.push([id.slice(0, i), id.slice(i + 1), nomParcours((etat.parcoursClasse || {})[id]),
        exclues.has(id) ? 'oui' : 'non', ajoutees.has(id) ? 'non' : 'oui', null, null]);
    }

    // Un parcours est un diagramme de nœuds : une ligne par lien, « De » livre
    // « Vers ». Un nœud encore sans lien s'écrit seul, colonne « Vers » vide.
    const parcours = [['Parcours', 'De', 'Vers']];
    for (const p of (etat.parcours || [])) {
      const arcs = P.arcsDuParcours(p), relies = new Set(arcs.flatMap(a => [a.from, a.to]));
      for (const a of arcs) parcours.push([p.nom, nomDe(a.from), nomDe(a.to)]);
      for (const s of P.servicesDuParcours(p)) if (!relies.has(s)) parcours.push([p.nom, nomDe(s), null]);
      if (!P.servicesDuParcours(p).length) parcours.push([p.nom, null, null]);
    }
    const defauts = [['Classe', 'Parcours']];
    for (const c of P.CABINES) defauts.push([c, nomParcours((etat.parcoursCabine || {})[c])]);

    const m = etat.materiel || {};
    const materiel = [['Paramètre', 'Valeur'], ['Boucle du matériel active', m.actif ? 'oui' : 'non'],
      ['Stock propre à l’ouverture', m.stockInitial || 0], ['Délai après atterrissage (min)', m.delaiRetour ?? 30],
      ...P.CABINES.map(c => ['Unités par vol ' + c, ((m.unites || {})[c] || {}).parVol || 0])];

    return [
      { nom: 'Ateliers', lignes: ateliers },
      feuilleHoraires(etat, ctx),
      { nom: 'Fabrications', lignes: fab },
      { nom: 'Man-minutes', lignes: mm },
      { nom: 'Débits robot', lignes: debitsRobot },
      { nom: 'Tunnels', lignes: tunnels },
      { nom: 'Handling', lignes: handling },
      { nom: 'Chauffeurs', lignes: chauffeurs },
      { nom: 'Plonge par vol', lignes: plongeVol },
      { nom: 'Classes', lignes: classes },
      { nom: 'Parcours', lignes: parcours },
      { nom: 'Parcours par classe', lignes: defauts },
      { nom: 'Matériel', lignes: materiel },
      lisezMoi('Ateliers de travail — à modifier dans Excel puis réimporter', [
        'Ateliers : une ligne par équipe. Le nom est la clé : les autres feuilles s’y réfèrent.',
        '   Type : manuel, robot, plonge ou mise à disposition.',
        'Horaires : l’heure de début de chaque atelier, et son jour (J le jour du départ, J-1 la veille).',
        '   Un atelier sans ligne ici garde son heure du site ; un nouvel atelier commence à 06:00, jour J.',
        '   Pauses : « 10:00-10:15; 12:00-12:30 ». Présence vide : celle du réglage général.',
        'Fabrications : ce que fait chaque atelier, DANS L’ORDRE. Une ligne par lot ; plusieurs classes d’un lot se séparent par « + ».',
        '   Pour ajouter une compagnie × classe à un atelier : ajoutez une ligne (Atelier, Ordre, ex. « AF/BC »).',
        'Man-minutes : celles qu’un atelier fixe pour une compagnie × classe, POUR TOUTE SA JOURNÉE (tous ses vols), à la place du barème. Absente = le barème.',
        'Débits robot : le débit d’une compagnie × classe sur un robot (plateaux/h). Absente = le débit du robot (feuille Ateliers).',
        'Tunnels : les tunnels d’une plonge, avec leur débit et le personnel qui les tient.',
        'Vagues (Ateliers) : une mise à disposition (légumerie, magasin…) sert toutes les commandes à la fois, par vagues :',
        '   « J-1 14:00; J 04:00 ». Chaque commande prend la vague qui précède son besoin. Permanent = oui : pas de vague.',
        '   Ouverte comme une boutique : Permanent = oui et Vagues « ouvert 07:00-18:00 » ; fermée, l’étape d’après attend l’ouverture.',
        'Handling : il charge les vols un par un, dans l’ordre des départs. Une ligne par compagnie : ses minutes par vol ;',
        '   « toutes » pour les compagnies sans ligne. Dans Ateliers : vols en même temps, pas avant (heures avant le départ),',
        '   compagnies chargées (« toutes », ou « AF, TX »). Courrier : long ou court ; un vol long courrier prend',
        '   « Chauffeurs long courrier » chauffeurs (2 par défaut), un court « Chauffeurs court courrier » (1).',
        'Chauffeurs : les créneaux du handling, le jour J (Début, Fin, nombre de chauffeurs). Un vol attend d’avoir ses chauffeurs libres.',
        '   Sans créneau : « Vols en même temps » (Ateliers). Un créneau qui finit avant son début passe minuit.',
        'Plonge par vol : Plonge par vol = oui (Ateliers), puis une ligne par compagnie : le temps qu’un tunnel met à laver un de ses vols ;',
        '   « toutes » pour les compagnies sans ligne. Chaque tunnel qui tourne lave un vol revenu à la fois, dans l’ordre des retours.',
        'Classes : les compagnies × classes. Parcours vide = celui de sa classe. Retirée = oui pour ne plus la fabriquer.',
        '   Une compagnie × classe absente du programme de vols est ajoutée : ses volumes viendront du prochain import des vols.',
        'Parcours : une ligne par lien du diagramme. « De » livre « Vers » (ex. PLONGE → DOTATION).',
        '   Un service qui reçoit plusieurs liens attend qu’ils aient tous livré. « Vers » vide : un service encore sans lien.',
        '   L’ancienne écriture (Branche, Étapes « A > B > C ») est encore lue.',
        'Parcours par classe : le parcours par défaut de BC, PC, YC, CREW et SPML.',
        'Une feuille absente du fichier laisse la partie correspondante telle qu’elle est sur le site.',
        'Services : leur nom sur le plan ou leur identifiant. Les colonnes « (info) » sont ignorées à l’import.',
        'L’import remplace les ateliers. Il est annulable. Une erreur, et rien n’est importé.'
      ])
    ];
  }

  /**
   * @returns le nouvel état de l'onglet Ateliers, à valider par l'appelant.
   */
  function classeurVersAteliers(feuilles, etat, ctx) {
    const err = new Erreurs();
    const service = T.correspondance(ctx.services || []);
    const out = JSON.parse(JSON.stringify(etat));
    const fA = T.feuille(feuilles, 'Ateliers');
    if (!fA) throw new Error('Feuille « Ateliers » introuvable : ce n’est pas un classeur d’ateliers.');

    // Parcours d'abord : les classes s'y réfèrent par leur nom.
    const fP = T.feuille(feuilles, 'Parcours');
    if (fP) {
      const liste = [], parNom = new Map();
      for (const o of T.enObjets(fP.lignes).objets) {
        err.essayer(fP.nom, o._ligne, () => {
          const nom = String(o.parcours ?? '').trim();
          if (!nom) throw new Error('nom de parcours manquant');
          let p = parNom.get(T.cleEntete(nom));
          if (!p) {
            const ancien = (etat.parcours || []).find(x => T.cleEntete(x.nom) === T.cleEntete(nom));
            // Un chemin lu dans le classeur est pris tel quel : ses cases aussi.
            // Sans la marque `cases`, une case retirée exprès reviendrait au rechargement.
            p = { id: ancien ? ancien.id : 'pc-' + T.cleEntete(nom).slice(0, 40), nom, noeuds: [], liens: [], prepa: true, cases: true };
            parNom.set(T.cleEntete(nom), p); liste.push(p);
          }
          const vide = v => v === null || v === undefined || v === '';
          const sid = x => { const s = service(String(x).trim()); if (!s) throw new Error('service inconnu « ' + x + ' »'); return s; };
          const noeud = s => { if (!p.noeuds.includes(s)) p.noeuds.push(s); return s; };
          const lien = (de, vers) => {
            if (de === vers) throw new Error('un service ne se livre pas lui-même');
            if (!p.liens.some(l => l.de === de && l.vers === vers)) p.liens.push({ de, vers });
          };
          if (!vide(o.de)) {                       // l'écriture en liens
            const de = noeud(sid(o.de));
            if (!vide(o.vers)) lien(de, noeud(sid(o.vers)));
            return;
          }
          if (vide(o.etapes)) return;              // l'ancienne écriture en branches
          const etapes = String(o.etapes).split(SEP_ETAPES).filter(Boolean).map(sid);
          if (etapes.length < 2) throw new Error('une branche relie au moins deux services');
          etapes.forEach((s, i) => { noeud(s); if (i) lien(etapes[i - 1], s); });
        });
      }
      out.parcours = liste;
      // Un parcours disparu ne peut plus être désigné.
      const ids = new Set(liste.map(p => p.id));
      for (const c of Object.keys(out.parcoursCabine || {})) if (!ids.has(out.parcoursCabine[c])) delete out.parcoursCabine[c];
      for (const c of Object.keys(out.parcoursClasse || {})) if (!ids.has(out.parcoursClasse[c])) delete out.parcoursClasse[c];
    }
    const parcoursNomme = (v, ou, ligne) => {
      if (v === null || v === undefined || v === '') return null;
      const p = (out.parcours || []).find(x => T.cleEntete(x.nom) === T.cleEntete(v));
      if (!p) err.ajouter(ou, ligne, 'parcours inconnu « ' + v + ' »');
      return p ? p.id : null;
    };
    const fD = T.feuille(feuilles, 'Parcours par classe');
    if (fD) {
      out.parcoursCabine = {};
      for (const o of T.enObjets(fD.lignes).objets) {
        const cab = String(o.classe ?? '').trim().toUpperCase();
        if (!P.CABINES.includes(cab)) { err.ajouter(fD.nom, o._ligne, 'classe inconnue « ' + (o.classe ?? '') + ' »'); continue; }
        const id = parcoursNomme(o.parcours, fD.nom, o._ligne);
        if (id) out.parcoursCabine[cab] = id;
      }
    }

    const fC = T.feuille(feuilles, 'Classes');
    if (fC) {
      const auProgramme = new Set((ctx.programme || []).map(c => c.id));
      out.exclues = []; out.ajoutees = []; out.parcoursClasse = {};
      const vues = new Set();
      for (const o of T.enObjets(fC.lignes).objets) {
        err.essayer(fC.nom, o._ligne, () => {
          const cie = String(o.compagnie ?? '').trim().toUpperCase();
          const cab = String(o.classe ?? '').trim().toUpperCase();
          if (!cie || cie.includes('/') || cie.length > 40) throw new Error('compagnie illisible « ' + (o.compagnie ?? '') + ' »');
          if (!P.CABINES.includes(cab)) throw new Error('classe inconnue « ' + (o.classe ?? '') + ' »');
          const id = P.idClasse(cie, cab);
          if (vues.has(id)) throw new Error(id + ' figure deux fois');
          vues.add(id);
          if (T.ouiNon(o.retiree, false)) out.exclues.push(id);
          else if (!auProgramme.has(id)) out.ajoutees.push({ cie, cabine: cab });
          const p = parcoursNomme(o.parcours, fC.nom, o._ligne);
          if (p) out.parcoursClasse[id] = p;
        });
      }
    }

    // Les ateliers eux-mêmes.
    const parNom = new Map(), ids = new Set();
    out.ateliers = [];
    for (const o of T.enObjets(fA.lignes).objets) {
      err.essayer(fA.nom, o._ligne, () => {
        const nom = String(o.atelier ?? '').trim();
        if (!nom) throw new Error('nom d’atelier manquant');
        const k = T.cleEntete(nom);
        if (parNom.has(k)) throw new Error('« ' + nom + ' » existe déjà ligne ' + parNom.get(k)._ligne + ' : le nom est la clé');
        const sid = service(o.service);
        if (!sid) throw new Error('service inconnu « ' + (o.service ?? '') + ' »');
        const type = typeDe(o.type);
        // Les heures vivent dans la feuille « Horaires ». Un ancien classeur les
        // porte encore ici : on les lit. Sinon, celles du site restent.
        const avant = etat.ateliers.find(x => x.id === String(o.identifiant ?? '').trim())
          || etat.ateliers.find(x => T.cleEntete(x.nom) === k);
        const debut = T.heureDe(o.debut ?? (avant ? avant.debut : '06:00'));
        const jour = type === 'handling' ? 0 : jourDe(o.jour ?? (avant ? avant.jour || 0 : 0));
        const personnes = T.nombreDe(o.personnes, type === 'dispo' ? 0 : 1);
        if (!Number.isInteger(personnes) || personnes < 0) throw new Error('personnes : entier positif ou nul');
        const pauses = String(o.pauses ?? '').split(/\s*;\s*/).filter(Boolean).map(t => {
          const m = /^(.+?)\s*[-–]\s*(.+)$/.exec(t);
          if (!m) throw new Error('pause illisible « ' + t + ' » (ex. 10:00-10:15)');
          return { de: hh(T.heureDe(m[1])), a: hh(T.heureDe(m[2])) };
        });
        const presence = T.nombreDe(o.presence_min, null);
        let id = String(o.identifiant ?? '').trim();
        if (!id || ids.has(id)) id = 'at-x' + (out.ateliers.length + 1) + '-' + k.slice(0, 24);
        ids.add(id);
        const a = { id, nom, service: sid, type, debut: hh(debut), jour, personnes, pauses, lots: [],
          regime: { actif: T.ouiNon(o.poste_reglementaire, true), ...(presence !== null ? { presence } : {}) } };
        if (T.ouiNon(o.emporte_du_materiel, false)) a.materiel = 'consomme';
        if (type === 'robot') {
          a.debit = T.nombreDe(o.debit_robot_plateaux_h, 320);
          a.personnesMin = T.nombreDe(o.effectif_mini_robot, 1);
        }
        if (type === 'lavage') {
          a.plafond = T.nombreDe(o.plafond_plonge_u_h, 0); a.tunnels = [];
          const pv = String(o.plonge_par_vol ?? '').trim();
          if (pv ? T.ouiNon(pv, false) : !!(avant && avant.parVol)) {
            a.parVol = true;
            a.durees = avant && avant.type === 'lavage' && avant.durees ? JSON.parse(JSON.stringify(avant.durees)) : { [P.TOUTES]: 30 };
          }
        }
        if (type === 'dispo') {
          a.permanent = T.ouiNon(o.permanent, true);
          // « J-1 14:00; J 04:00 » : les vagues. Vide : celles du site, sinon son heure.
          const vv = String(o.vagues ?? '').trim();
          const ouv = lireOuverture(vv);
          if (ouv) { a.permanent = true; a.ouverture = ouv; }
          else if (!vv && a.permanent && avant && avant.type === 'dispo' && avant.ouverture) a.ouverture = { ...avant.ouverture };
          if (vv && !ouv) a._vaguesLues = true;
          if (vv && !ouv) a.vagues = vv.split(/\s*;\s*/).filter(Boolean).map(t => {
            const m = /^(?:(J(?:\s*[-−–]\s*\d+)?)\s+)?(\d{1,2}[:h]\d{2})$/i.exec(t.trim());
            if (!m) throw new Error('vague illisible « ' + t + ' » (ex. « J-1 14:00; J 04:00 »)');
            return { debut: hh(T.heureDe(m[2].replace('h', ':'))), jour: jourDe((m[1] || 'J').replace(/\s+/g, '')) };
          });
          else if (avant && avant.type === 'dispo' && avant.vagues) a.vagues = JSON.parse(JSON.stringify(avant.vagues));
        }
        if (type === 'handling') {
          const av = T.nombreDe(o.pas_avant_depart_h, null);
          const cies = String(o.compagnies_chargees ?? '').trim();
          a.simultanes = Math.max(1, Math.round(T.nombreDe(o.vols_en_meme_temps, 1)) || 1);
          a.avance = av === null ? (avant && avant.type === 'handling' ? avant.avance : P.AVANCE_HANDLING) : Math.max(0, Math.round(av * 60));
          a.compagnies = !cies || T.cleEntete(cies) === 'toutes' ? [] : [...new Set(cies.split(/[\s,;+]+/).map(x => x.trim().toUpperCase()).filter(Boolean))];
          a.durees = avant && avant.type === 'handling' ? JSON.parse(JSON.stringify(avant.durees || {})) : { [P.TOUTES]: 30 };
          const ah = avant && avant.type === 'handling' ? avant : {};
          a.chauffeurs = { long: Math.max(1, Math.round(T.nombreDe(o.chauffeurs_long_courrier, (ah.chauffeurs || {}).long ?? 2)) || 2),
            court: Math.max(1, Math.round(T.nombreDe(o.chauffeurs_court_courrier, (ah.chauffeurs || {}).court ?? 1)) || 1) };
          a.longs = (ah.longs || []).slice();
          a.creneaux = JSON.parse(JSON.stringify(ah.creneaux || []));
        }
        a._ligne = o._ligne;
        parNom.set(k, a); out.ateliers.push(a);
      });
    }
    const atelierNomme = (v, ou, ligne) => {
      const a = parNom.get(T.cleEntete(v));
      if (!a) err.ajouter(ou, ligne, 'atelier inconnu « ' + (v ?? '') + ' » (absent de la feuille Ateliers)');
      return a;
    };

    const fH = T.feuille(feuilles, 'Horaires');
    if (fH) lireHoraires(fH, atelierNomme, err);

    const fF = T.feuille(feuilles, 'Fabrications');
    const garder = !fF;   // sans la feuille, les fabrications restent celles du site
    if (garder) {
      for (const a of out.ateliers) {
        const avant = etat.ateliers.find(x => x.id === a.id) || etat.ateliers.find(x => T.cleEntete(x.nom) === T.cleEntete(a.nom));
        if (avant) a.lots = JSON.parse(JSON.stringify(avant.lots || []));
      }
    } else {
      const parAtelier = new Map();
      for (const o of T.enObjets(fF.lignes).objets) {
        const a = atelierNomme(o.atelier, fF.nom, o._ligne); if (!a) continue;
        err.essayer(fF.nom, o._ligne, () => {
          if (a.type === 'lavage' || a.type === 'dispo') throw new Error(a.nom + ' : une ' + TYPES_FR[a.type] + ' ne fabrique pas de lot');
          if (a.type === 'handling') throw new Error(a.nom + ' : un handling charge des vols, il n’a pas de liste de commandes');
          const ordre = T.nombreDe(o.ordre, Infinity);
          const cls = String(o.compagnies_classes ?? '').split(SEP_CLASSES).filter(Boolean).map(x => {
            const m = /^(.+)\/([a-z]+)$/i.exec(x.trim());
            if (!m || !P.CABINES.includes(m[2].toUpperCase())) throw new Error('compagnie × classe illisible « ' + x + ' » (ex. AF/BC)');
            return P.idClasse(m[1], m[2].toUpperCase());
          });
          if (!cls.length) throw new Error('aucune compagnie × classe');
          if (!parAtelier.has(a)) parAtelier.set(a, []);
          parAtelier.get(a).push({ ordre, ligne: o._ligne, cls: [...new Set(cls)] });
        });
      }
      for (const [a, lots] of parAtelier) {
        lots.sort((x, y) => x.ordre - y.ordre || x.ligne - y.ligne);
        a.lots = lots.map(l => l.cls);
      }
    }

    // Les man-minutes fixées dans une case : sans la feuille, celles du site restent.
    const fMM = T.feuille(feuilles, 'Man-minutes');
    for (const a of out.ateliers) {
      const avant = etat.ateliers.find(x => x.id === a.id) || etat.ateliers.find(x => T.cleEntete(x.nom) === T.cleEntete(a.nom));
      if (!fMM && avant && avant.minutes) a.minutes = JSON.parse(JSON.stringify(avant.minutes));
    }
    if (fMM) {
      for (const o of T.enObjets(fMM.lignes).objets) {
        const a = atelierNomme(o.atelier, fMM.nom, o._ligne); if (!a) continue;
        err.essayer(fMM.nom, o._ligne, () => {
          const m = /^(.+)\/([a-z]+)$/i.exec(String(o.compagnie_classe ?? '').trim());
          if (!m || !P.CABINES.includes(m[2].toUpperCase())) throw new Error('compagnie × classe illisible « ' + (o.compagnie_classe ?? '') + ' » (ex. AF/BC)');
          const v = T.nombreDe(o.man_minutes, null);
          if (v === null) return;
          if (!Number.isFinite(v) || v < 0) throw new Error('man-minutes : nombre positif attendu');
          (a.minutes || (a.minutes = {}))[P.idClasse(m[1], m[2].toUpperCase())] = v;
        });
      }
    }

    // Les débits d'un robot, commande par commande : sans la feuille, ceux du site restent.
    const fDR = T.feuille(feuilles, 'Débits robot', 'Debits robot');
    for (const a of out.ateliers) {
      if (a.type !== 'robot') continue;
      const avant = etat.ateliers.find(x => x.id === a.id) || etat.ateliers.find(x => T.cleEntete(x.nom) === T.cleEntete(a.nom));
      if (!fDR && avant && avant.debits) a.debits = JSON.parse(JSON.stringify(avant.debits));
    }
    if (fDR) {
      for (const o of T.enObjets(fDR.lignes).objets) {
        const a = atelierNomme(o.atelier, fDR.nom, o._ligne); if (!a) continue;
        err.essayer(fDR.nom, o._ligne, () => {
          if (a.type !== 'robot') throw new Error(a.nom + ' n’est pas un robot');
          const m = /^(.+)\/([a-z]+)$/i.exec(String(o.compagnie_classe ?? '').trim());
          if (!m || !P.CABINES.includes(m[2].toUpperCase())) throw new Error('compagnie × classe illisible « ' + (o.compagnie_classe ?? '') + ' » (ex. TX/YC)');
          const v = T.nombreDe(o.debit_plateaux_h, null);
          if (v === null) return;
          if (!(v > 0)) throw new Error('débit positif attendu, en plateaux par heure');
          (a.debits || (a.debits = {}))[P.idClasse(m[1], m[2].toUpperCase())] = v;
        });
      }
    }

    const fT = T.feuille(feuilles, 'Tunnels');
    for (const a of out.ateliers) {
      if (a.type !== 'lavage') continue;
      const avant = etat.ateliers.find(x => x.id === a.id) || etat.ateliers.find(x => T.cleEntete(x.nom) === T.cleEntete(a.nom));
      a.tunnels = !fT && avant ? JSON.parse(JSON.stringify(avant.tunnels || [])) : [];
    }
    if (fT) {
      for (const o of T.enObjets(fT.lignes).objets) {
        const a = atelierNomme(o.atelier, fT.nom, o._ligne); if (!a) continue;
        err.essayer(fT.nom, o._ligne, () => {
          if (a.type !== 'lavage') throw new Error(a.nom + ' n’est pas une plonge');
          a.tunnels.push({ nom: String(o.tunnel ?? '').trim() || 'Tunnel ' + (a.tunnels.length + 1),
            debit: T.nombreDe(o.debit_u_h, 300), personnes: T.nombreDe(o.personnes, 1), actif: T.ouiNon(o.actif, true) });
        });
      }
    }
    // Les durées du handling : sans la feuille, celles du site restent.
    const fHa = T.feuille(feuilles, 'Handling');
    if (fHa) {
      const lus = new Set();
      for (const o of T.enObjets(fHa.lignes).objets) {
        const a = atelierNomme(o.atelier, fHa.nom, o._ligne); if (!a) continue;
        err.essayer(fHa.nom, o._ligne, () => {
          if (a.type !== 'handling') throw new Error(a.nom + ' n’est pas un handling');
          if (!lus.has(a)) { lus.add(a); a.durees = {}; if (fHa.lignes[0] && fHa.lignes[0].some(h => T.cleEntete(h) === 'courrier')) a.longs = []; }
          const c = String(o.compagnie ?? '').trim();
          const cie = !c || T.cleEntete(c) === 'toutes' ? P.TOUTES : c.toUpperCase();
          const courrier = T.cleEntete(o.courrier ?? '');
          if (courrier && cie !== P.TOUTES) {
            if (!['long', 'court'].includes(courrier)) throw new Error('courrier : « long » ou « court »');
            if (courrier === 'long' && !a.longs.includes(cie)) a.longs.push(cie);
          }
          const v = T.nombreDe(o.minutes_par_vol, null);
          if (v === null) return;
          if (!Number.isFinite(v) || v < 0) throw new Error('minutes par vol : nombre positif attendu');
          a.durees[cie] = v;
        });
      }
    }
    // Les créneaux de chauffeurs du handling : sans la feuille, ceux du site restent.
    const fCh = T.feuille(feuilles, 'Chauffeurs');
    if (fCh) {
      const lus = new Set();
      for (const o of T.enObjets(fCh.lignes).objets) {
        const a = atelierNomme(o.atelier, fCh.nom, o._ligne); if (!a) continue;
        err.essayer(fCh.nom, o._ligne, () => {
          if (a.type !== 'handling') throw new Error(a.nom + ' n’est pas un handling');
          if (!lus.has(a)) { lus.add(a); a.creneaux = []; }
          const n = T.nombreDe(o.chauffeurs, null);
          if (n === null || !Number.isFinite(n) || n < 0) throw new Error('chauffeurs : nombre positif attendu');
          a.creneaux.push({ de: hh(T.heureDe(o.debut)), a: hh(T.heureDe(o.fin)), n: Math.round(n) });
        });
      }
    }
    // Le temps de lavage d'un vol, par compagnie, pour une plonge par vol.
    const fPv = T.feuille(feuilles, 'Plonge par vol');
    if (fPv) {
      const lus = new Set();
      for (const o of T.enObjets(fPv.lignes).objets) {
        const a = atelierNomme(o.atelier, fPv.nom, o._ligne); if (!a) continue;
        err.essayer(fPv.nom, o._ligne, () => {
          if (a.type !== 'lavage') throw new Error(a.nom + ' n’est pas une plonge');
          if (!lus.has(a)) { lus.add(a); a.durees = {}; a.parVol = true; }
          const c = String(o.compagnie ?? '').trim();
          const v = T.nombreDe(o.minutes_par_vol, null);
          if (v === null) return;
          if (!Number.isFinite(v) || v < 0) throw new Error('minutes par vol : nombre positif attendu');
          a.durees[!c || T.cleEntete(c) === 'toutes' ? P.TOUTES : c.toUpperCase()] = v;
        });
      }
    }
    for (const a of out.ateliers) {
      delete a._ligne; delete a._vaguesLues;
      if (a.type === 'lavage' && !a.tunnels.length) a.tunnels = [{ nom: 'Tunnel 1', debit: 300, personnes: 1, actif: true }];
    }

    const fM = T.feuille(feuilles, 'Matériel', 'Materiel');
    if (fM) {
      const m = JSON.parse(JSON.stringify(out.materiel || {}));
      m.unites = P.unitesDe(m);
      for (const o of T.enObjets(fM.lignes).objets) {
        err.essayer(fM.nom, o._ligne, () => {
          const k = T.cleEntete(o.parametre);
          if (k === 'boucle_du_materiel_active') m.actif = T.ouiNon(o.valeur, false);
          else if (k === 'stock_propre_a_l_ouverture') m.stockInitial = T.nombreDe(o.valeur, 0);
          else if (k === 'delai_apres_atterrissage_min') m.delaiRetour = T.nombreDe(o.valeur, 30);
          else {
            const u = /^unites_par_vol_([a-z]+)$/.exec(k);
            if (!u || !P.CABINES.includes(u[1].toUpperCase())) throw new Error('paramètre inconnu « ' + o.parametre + ' »');
            m.unites[u[1].toUpperCase()] = { parVol: T.nombreDe(o.valeur, 0) };
          }
        });
      }
      out.materiel = m;
    }

    // Une compagnie × classe tapée dans « Fabrications » sans être au programme
    // ni dans « Classes » : c'est une classe qu'on ajoute. On la déclare, et on
    // le dit. Une classe retirée mais encore fabriquée, elle, est une contradiction.
    const notes = [];
    const programme = new Set((ctx.programme || []).map(c => c.id));
    const ajoutees = new Set((out.ajoutees || []).map(c => P.idClasse(c.cie, c.cabine)));
    const exclues = new Set(out.exclues || []);
    for (const a of out.ateliers) for (const l of a.lots) for (const id of l) {
      if (exclues.has(id)) { err.ajouter(fF ? fF.nom : null, null, id + ' est retirée (feuille Classes) mais ' + a.nom + ' la fabrique encore'); continue; }
      if (programme.has(id) || ajoutees.has(id)) continue;
      const i = id.lastIndexOf('/');
      out.ajoutees = [...(out.ajoutees || []), { cie: id.slice(0, i), cabine: id.slice(i + 1) }];
      ajoutees.add(id); notes.push(id);
    }

    err.lever();
    return { etat: out, ajouteesAuto: notes };
  }

  const api = { baremeVersClasseur, classeurVersBareme, recapManMinutes, recapVersClasseur, classeurVersRecap,
    recapCasesVersClasseur, classeurVersRecapCases, volsVersClasseur, classeurVersVols,
    ateliersVersClasseur, classeurVersAteliers, horairesVersClasseur, classeurVersHoraires, estClasseurHoraires, jourDe };
  if (enNode && module.exports) module.exports = api;
  else root.OrlyEchanges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
