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

  const TYPES_FR = { manuel: 'manuel', robot: 'robot', lavage: 'plonge', dispo: 'mise à disposition' };
  const typeDe = v => {
    const k = T.cleEntete(v || 'manuel');
    if (['manuel', 'equipe'].includes(k)) return 'manuel';
    if (k === 'robot') return 'robot';
    if (['plonge', 'lavage'].includes(k)) return 'lavage';
    if (['mise_a_disposition', 'dispo', 'disposition'].includes(k)) return 'dispo';
    throw new Error('type inconnu « ' + v + ' » (manuel, robot, plonge ou mise à disposition)');
  };
  const SEP_CLASSES = /\s*[+,;]\s*/;
  const SEP_ETAPES = /\s*(?:→|->|>)\s*/;

  /**
   * @param etat l'état de l'onglet Ateliers
   * @param ctx  { services:[{id,nom}], classes:[classe du moment] }
   */
  function ateliersVersClasseur(etat, ctx) {
    const services = ctx.services || [];
    const nomDe = id => (services.find(s => s.id === id) || {}).nom || id;
    const ateliers = [['Atelier', 'Service', 'Type', 'Début', 'Jour', 'Personnes', 'Pauses',
      'Poste réglementaire', 'Présence (min)', 'Emporte du matériel', 'Débit robot (plateaux/h)',
      'Effectif mini robot', 'Plafond plonge (u/h)', 'Permanent', 'Identifiant']];
    const fab = [['Atelier', 'Ordre', 'Compagnies × classes']];
    const tunnels = [['Atelier', 'Tunnel', 'Débit (u/h)', 'Personnes', 'Actif']];
    for (const a of etat.ateliers) {
      ateliers.push([a.nom, nomDe(a.service), TYPES_FR[a.type] || a.type, a.debut, a.jour || 0,
        a.type === 'dispo' ? null : a.personnes,
        (a.pauses || []).map(p => p.de + '-' + p.a).join('; ') || null,
        a.regime && a.regime.actif === false ? 'non' : 'oui',
        a.regime && Number.isFinite(a.regime.presence) ? a.regime.presence : null,
        a.materiel === 'consomme' ? 'oui' : 'non',
        a.type === 'robot' ? a.debit : null, a.type === 'robot' ? a.personnesMin : null,
        a.type === 'lavage' ? a.plafond || null : null,
        a.type === 'dispo' ? (a.permanent === false ? 'non' : 'oui') : null,
        a.id]);
      (a.lots || []).forEach((l, i) => fab.push([a.nom, i + 1, l.join(' + ')]));
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

    const parcours = [['Parcours', 'Branche', 'Étapes']];
    for (const p of (etat.parcours || [])) {
      for (const b of p.branches) parcours.push([p.nom, b.nom, b.services.map(nomDe).join(' > ')]);
      if (!p.branches.length) parcours.push([p.nom, null, null]);
    }
    const defauts = [['Classe', 'Parcours']];
    for (const c of P.CABINES) defauts.push([c, nomParcours((etat.parcoursCabine || {})[c])]);

    const m = etat.materiel || {};
    const materiel = [['Paramètre', 'Valeur'], ['Boucle du matériel active', m.actif ? 'oui' : 'non'],
      ['Stock propre à l’ouverture', m.stockInitial || 0], ['Délai après atterrissage (min)', m.delaiRetour ?? 30],
      ...P.CABINES.map(c => ['Unités par vol ' + c, ((m.unites || {})[c] || {}).parVol || 0])];

    return [
      { nom: 'Ateliers', lignes: ateliers },
      { nom: 'Fabrications', lignes: fab },
      { nom: 'Tunnels', lignes: tunnels },
      { nom: 'Classes', lignes: classes },
      { nom: 'Parcours', lignes: parcours },
      { nom: 'Parcours par classe', lignes: defauts },
      { nom: 'Matériel', lignes: materiel },
      lisezMoi('Ateliers de travail — à modifier dans Excel puis réimporter', [
        'Ateliers : une ligne par équipe. Le nom est la clé : les autres feuilles s’y réfèrent.',
        '   Type : manuel, robot, plonge ou mise à disposition. Début en HH:MM. Jour : 0 le jour du départ, -1 la veille.',
        '   Pauses : « 10:00-10:15; 12:00-12:30 ». Présence vide : celle du réglage général.',
        'Fabrications : ce que fait chaque atelier, DANS L’ORDRE. Une ligne par lot ; plusieurs classes d’un lot se séparent par « + ».',
        '   Pour ajouter une compagnie × classe à un atelier : ajoutez une ligne (Atelier, Ordre, ex. « AF/BC »).',
        'Tunnels : les tunnels d’une plonge, avec leur débit et le personnel qui les tient.',
        'Classes : les compagnies × classes. Parcours vide = celui de sa classe. Retirée = oui pour ne plus la fabriquer.',
        '   Une compagnie × classe absente du programme de vols est ajoutée : ses volumes viendront du prochain import des vols.',
        'Parcours : une ligne par branche. Étapes = services séparés par « > », dans l’ordre (ex. PLONGE > DOTATION > MONTAGE).',
        '   Les branches d’un même parcours partent en parallèle et se rejoignent aux services qu’elles partagent.',
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
            p = { id: ancien ? ancien.id : 'pc-' + T.cleEntete(nom).slice(0, 40), nom, branches: [] };
            parNom.set(T.cleEntete(nom), p); liste.push(p);
          }
          if (o.etapes === null || o.etapes === undefined || o.etapes === '') return;
          const etapes = String(o.etapes).split(SEP_ETAPES).filter(Boolean).map(x => {
            const sid = service(x); if (!sid) throw new Error('service inconnu « ' + x + ' »'); return sid;
          });
          if (etapes.length < 2) throw new Error('une branche relie au moins deux services');
          p.branches.push({ nom: String(o.branche ?? '').trim() || 'Branche ' + (p.branches.length + 1), services: etapes });
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
        const debut = T.heureDe(o.debut ?? '06:00');
        const jour = T.nombreDe(o.jour, 0);
        if (!Number.isInteger(jour) || jour > 0 || jour < -7) throw new Error('jour entre -7 et 0');
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
        if (type === 'lavage') { a.plafond = T.nombreDe(o.plafond_plonge_u_h, 0); a.tunnels = []; }
        if (type === 'dispo') a.permanent = T.ouiNon(o.permanent, true);
        a._ligne = o._ligne;
        parNom.set(k, a); out.ateliers.push(a);
      });
    }
    const atelierNomme = (v, ou, ligne) => {
      const a = parNom.get(T.cleEntete(v));
      if (!a) err.ajouter(ou, ligne, 'atelier inconnu « ' + (v ?? '') + ' » (absent de la feuille Ateliers)');
      return a;
    };

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
    for (const a of out.ateliers) {
      delete a._ligne;
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

  const api = { baremeVersClasseur, classeurVersBareme, volsVersClasseur, classeurVersVols,
    ateliersVersClasseur, classeurVersAteliers };
  if (enNode && module.exports) module.exports = api;
  else root.OrlyEchanges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
