/* ==========================================================================
 *  ATELIERS DE TRAVAIL — saisie et planning
 *  ------------------------------------------------------------------------
 *  Interface du modèle décrit dans docs/MODELE_ATELIERS.md. Ne calcule rien :
 *  tout le calcul est dans moteur/production.js. Ce fichier saisit, affiche,
 *  et enregistre.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const P = root.MoteurProduction;
  const PC = root.OrlyParcours;
  /** « J », « J-1 », « J+1 » : un décalage en jours, écrit comme on le dit. */
  const jourEcrit = j => (j > 0 ? 'J+' + j : j < 0 ? 'J' + j : 'J');
  /* La plonge lave ce qui revient des vols : son jour se compte depuis
   * l'arrivée des retours (J), pas depuis le départ (retour d'usage du 05/10). */
  const JOURS_PLONGE = [[-1, 'Veille de l’arrivée (J-1)'], [0, 'Jour d’arrivée des retours (J)'], [1, 'Lendemain de l’arrivée (J+1)']];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const uid = () => 'at-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const clone = x => JSON.parse(JSON.stringify(x));

  const CLE = 'ory-ateliers-v1';

  /* ----------------------------------------------------------------------
   *  Validation du fichier enregistré. Refuse en bloc plutôt que de charger
   *  à moitié : une saisie perdue est pire qu'une saisie refusée.
   * --------------------------------------------------------------------*/
  function minutesPropres(a, lots) {
    const dedans = new Set(lots.flat()), m = {};
    for (const [k, v] of Object.entries((a && a.minutes) || {}))
      if (dedans.has(k) && Number.isFinite(+v) && v !== null && v !== '' && +v >= 0) m[k] = Math.round(+v * 10) / 10;
    return Object.keys(m).length ? { minutes: m } : {};
  }

  /** Les débits propres d'un robot, commande par commande, bornés à ses commandes. */
  function debitsPropres(a, lots) {
    const siennes = new Set(lots.flat()), d = {};
    for (const [k, v] of Object.entries((a && a.debits) || {})) if (siennes.has(k) && Number.isFinite(+v) && +v > 0) d[k] = Math.min(100000, +v);
    return Object.keys(d).length ? { debits: d } : {};
  }

  /** Les heures d'une mise à disposition ouverte comme une boutique (07:00–18:00), s'il y en a. */
  function ouvertureDe(a) {
    const o = a.permanent !== false && a.ouverture;
    if (!o) return {};
    const de = String(o.de ?? ''), fin = String(o.a ?? '');
    P.minutes(de); P.minutes(fin);
    if (P.minutes(de) === P.minutes(fin)) throw new Error((a.nom || 'Case') + ' : ouverture et fermeture à la même heure.');
    return { ouverture: { de, a: fin } };
  }

  /** Les vagues d'une mise à disposition, triées ; sans liste, son heure seule. */
  function vaguesDe(a, jour) {
    const brut = Array.isArray(a.vagues) && a.vagues.length ? a.vagues : [{ debut: a.debut ?? '06:00', jour }];
    const vues = new Map();
    for (const v of brut.slice(0, 12)) {
      const debut = String((v && v.debut) ?? '06:00'); P.minutes(debut);
      const j = Number.isInteger(+v.jour) ? Math.max(-7, Math.min(0, +v.jour)) : 0;
      vues.set(j * 1440 + P.minutes(debut), { debut, jour: j });
    }
    return [...vues].sort((x, y) => x[0] - y[0]).map(x => x[1]);
  }

  /** Les réglages d'un handling, bornés. Sans durée saisie : 30 min par vol. */
  /** Les lignes de la planche retour : vol, compagnie, heure d'arrivée à l'unité, jour, et le détail des classes s'il est connu. */
  function plancheDe(brut) {
    return (Array.isArray(brut) ? brut : []).slice(0, 2000).map(l => {
      const heure = String((l && l.heure) ?? '').trim();
      P.minutes(heure);   // une heure illisible refuse la saisie, plutôt que d'être oubliée en silence
      const out = { vol: String((l && l.vol) ?? '').trim().slice(0, 40), cie: String((l && l.cie) ?? '').trim().toUpperCase().slice(0, 40),
        heure, jour: Number.isInteger(+l.jour) ? Math.max(-3, Math.min(0, +l.jour)) : 0 };
      for (const k of ['bc', 'pc', 'yc', 'crew', 'spml']) if (Number.isFinite(+l[k]) && +l[k] > 0 && l[k] !== '' && l[k] !== null) out[k] = Math.round(+l[k]);
      return out;
    });
  }

  /** Des durées par compagnie (« * » pour toutes), en minutes. */
  function dureesDe(a, defaut, champ = 'durees') {
    const durees = {};
    const brut = a[champ] && typeof a[champ] === 'object' && !Array.isArray(a[champ]) ? a[champ] : (defaut === undefined ? {} : { [P.TOUTES]: defaut });
    for (const [k, v] of Object.entries(brut).slice(0, 300)) {
      const cie = k === P.TOUTES ? k : String(k).trim().toUpperCase().slice(0, 40);
      if (!cie || v === '' || v === null || !Number.isFinite(+v)) continue;
      durees[cie] = Math.max(0, Math.min(1440, Math.round(+v * 10) / 10));
    }
    return durees;
  }
  const cies = l => [...new Set((Array.isArray(l) ? l : []).map(x => String(x).trim().toUpperCase().slice(0, 40)).filter(Boolean))].slice(0, 100);

  function handlingDe(a) {
    const durees = dureesDe(a, 30);
    const n = parseInt(a.simultanes, 10), av = a.avance === '' || a.avance === null || a.avance === undefined ? NaN : +a.avance;
    const ch = a.chauffeurs || {}, entier = (v, d) => { const x = parseInt(v, 10); return Number.isInteger(x) && x > 0 ? Math.min(20, x) : d; };
    // Les chauffeurs, par créneaux horaires du jour J (retour d'usage du 28/09).
    const creneaux = (Array.isArray(a.creneaux) ? a.creneaux : []).slice(0, 24).map(c => {
      const de = String((c && c.de) ?? '04:00'), fin = String((c && c.a) ?? '12:00'); P.minutes(de); P.minutes(fin);
      return { de, a: fin, n: Math.max(0, Math.min(200, parseInt(c && c.n, 10) || 0)) };
    });
    return {
      durees,
      longs: cies(a.longs),
      chauffeurs: { long: entier(ch.long, 2), court: entier(ch.court, 1) },
      creneaux,
      // Le camion : aller jusqu'à l'avion et retour à l'unité (par compagnie,
      // « * » pour toutes), combien de vols il charge, combien il y en a.
      allers: dureesDe(a, undefined, 'allers'),
      retours: dureesDe(a, undefined, 'retours'),
      volsParCamion: entier(a.volsParCamion, 1),
      // Par compagnie (« * » : toutes) ; sans valeur propre, « vols par camion ».
      volsCamion: Object.fromEntries(Object.entries(dureesDe(a, undefined, 'volsCamion')).map(([k, v]) => [k, Math.max(1, Math.min(10, Math.round(v)))])),
      camions: Math.max(0, Math.min(200, parseInt(a.camions, 10) || 0)),
      simultanes: Number.isInteger(n) && n > 0 ? Math.min(50, n) : 1,
      avance: Number.isFinite(av) ? Math.max(0, Math.min(1440, Math.round(av))) : P.AVANCE_HANDLING,
      compagnies: cies(a.compagnies)
    };
  }

  /* La nature d'une case change : ce qui n'a plus de sens s'efface. */
  function typer(a, v) {
    a.type = v;
    if (v === 'handling') { a.jour = 0; delete a.debit; delete a.personnesMin; delete a.tunnels; delete a.minutes; delete a.materiel; a.lots = []; Object.assign(a, handlingDe(a)); return; }
    delete a.durees; delete a.simultanes; delete a.avance; delete a.compagnies;
    if (v === 'robot') { a.debit = a.debit || 320; a.personnesMin = a.personnesMin === undefined ? 1 : a.personnesMin; }
    else if (v === 'lavage') { delete a.debit; delete a.personnesMin; a.lots = []; }
    // Hors tunnel, hors flux : ni commandes, ni tunnels ; des minutes par vol (06/10).
    else if (v === 'appui') { delete a.debit; delete a.personnesMin; delete a.tunnels; delete a.minutes; delete a.fusion; delete a.condition; a.lots = []; a.minutesVol = a.minutesVol || {}; }
    // Une mise à disposition ne fabrique rien : ses lignes, son
    // effectif et ses arrêts n'ont plus de sens, on les efface.
    else if (v === 'dispo') {
      delete a.debit; delete a.personnesMin; delete a.tunnels;
      a.lots = []; a.pauses = []; a.personnes = 0;
      if (a.permanent === undefined) a.permanent = true;
    }
    else { delete a.debit; delete a.personnesMin; }
  }

  /** Les catégories propres à un service (l'armement : trolleys bar, thé/café…),
   *  avec leurs minutes par vol selon la compagnie (« * » : toutes). Bornées. */
  function categoriesDe(brut) {
    const out = {};
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
    for (const [service, liste] of Object.entries(brut).slice(0, 100)) {
      if (!Array.isArray(liste)) continue;
      const vus = new Set();
      // Une seule case par compagnie : un seul réglage par service.
      out[String(service).slice(0, 160)] = liste.slice(0, 1).filter(k => k && typeof k === 'object').map(k => {
        const id = String(k.id ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
        const minutes = {};
        for (const [cie, v] of Object.entries(k.minutes && typeof k.minutes === 'object' ? k.minutes : {}).slice(0, 300)) {
          const c = cie === '*' ? '*' : String(cie).trim().toUpperCase().slice(0, 40);
          if (c && v !== null && v !== '' && Number.isFinite(+v) && +v >= 0) minutes[c] = Math.round(+v * 10) / 10;
        }
        return { id, nom: String(k.nom ?? id).slice(0, 80) || id, minutes };
      }).filter(k => k.id && !vus.has(k.id) && vus.add(k.id));
    }
    return out;
  }

  /** La règle ⚡ d'une équipe (voir moteur : appliquerConditions), bornée. Seules
   *  les équipes qui préparent des commandes (à la main ou au robot) en portent une. */
  function conditionDe(a, type) {
    const k = a.condition;
    if (!k || typeof k !== 'object' || (type !== 'manuel' && type !== 'robot')) return {};
    const seuil = Math.round(+k.seuil);
    if (!(seuil >= 1)) return {};
    const cie = String(k.cie ?? '*').trim().toUpperCase().slice(0, 40) || '*';
    return { condition: { cie, seuil: Math.min(seuil, 99999), mesure: k.mesure === 'repas' ? 'repas' : 'vols',
      sinon: typeof k.sinon === 'string' ? k.sinon : '',
      // Ses personnes : vers l'équipe qui reprend (rien), une autre (`renfort`), ou nulle part (`absorbe`).
      ...(k.absorbe ? { absorbe: true } : typeof k.renfort === 'string' && k.renfort && k.renfort !== k.sinon ? { renfort: k.renfort } : {}) } };
  }

  function valider(brut) {
    if (!brut || brut.schema !== 'ory-ateliers' || brut.version !== 1 || !Array.isArray(brut.ateliers))
      throw new Error('Fichier d’ateliers v1 attendu.');
    // Une case par service et par commande : plusieurs milliers pour une grosse unité.
    if (brut.ateliers.length > 5000) throw new Error('Maximum 5000 cases.');
    const ids = new Set();
    const ateliers = brut.ateliers.map(a => {
      if (!a || typeof a !== 'object') throw new Error('Atelier invalide.');
      const id = typeof a.id === 'string' && a.id ? a.id : uid();
      if (ids.has(id)) throw new Error('Identifiant d’atelier en double.');
      ids.add(id);
      const nom = String(a.nom ?? '').slice(0, 160);
      const service = String(a.service ?? '').slice(0, 160);
      const type = ['robot', 'lavage', 'dispo', 'handling', 'appui'].includes(a.type) ? a.type : 'manuel';
      P.minutes(a.debut ?? '06:00');
      // Le handling travaille le jour J des vols : jamais la veille. La plonge
      // se règle sur l'arrivée des retours (05/10) : la veille, le jour même ou
      // le lendemain de leur arrivée (J-1, J, J+1).
      const jour = type === 'handling' ? 0 : !Number.isInteger(a.jour) ? 0
        : type === 'lavage' ? Math.max(-1, Math.min(1, a.jour)) : type === 'appui' ? Math.max(-7, Math.min(1, a.jour)) : Math.max(-7, Math.min(0, a.jour));
      const personnes = Number.isInteger(a.personnes) ? Math.max(0, Math.min(999, a.personnes)) : 1;
      const pauses = (Array.isArray(a.pauses) ? a.pauses : []).slice(0, 12).map(p => {
        P.minutes(p.de); P.minutes(p.a); return { de: String(p.de), a: String(p.a) };
      });
      // Le handling charge des vols : il n'a pas de liste de commandes.
      const lots = (Array.isArray(a.lots) && type !== 'handling' ? a.lots : []).slice(0, 200)
        .map(l => (Array.isArray(l) ? l : l && l.classes) || [])
        .map(l => [...new Set(l.map(String))].slice(0, 200));
      return {
        id, nom, service, type, debut: String(a.debut ?? '06:00'), jour, personnes, pauses, lots,
        // Un poste : pauses automatiques et durée de présence. Désactivable
        // pour une équipe qui ne suit pas la règle commune. La présence n'est
        // retenue QUE si on l'a fixée : sans elle, l'atelier suit le réglage
        // général, et changer la règle commune déplace tout le monde.
        regime: { actif: a.regime ? a.regime.actif !== false : true,
                  ...(Number.isFinite(+(a.regime || {}).presence) ? { presence: +a.regime.presence } : {}) },
        ...(a.materiel === 'consomme' ? { materiel: 'consomme' } : {}),
        // L'effectif saisi à la main avant que le calcul ne le remplace (05/10) :
        // cocher « Effectif constant » le retrouve.
        // L'atelier unique d'un service, pour certaines compagnies (07/10).
        ...(type === 'manuel' && a.parCompagnie ? { parCompagnie: true,
          compagnies: [...new Set((Array.isArray(a.compagnies) ? a.compagnies : []).map(c => String(c).trim().toUpperCase().slice(0, 40)).filter(Boolean))].slice(0, 200) } : {}),
        // Son effectif, autrement que son service (06/10) : 'fixe' ou 'calcule' ; absent, comme le service.
        ...((type === 'manuel' || type === 'appui') && ['fixe', 'calcule', 'impose'].includes(a.effectif) ? { effectif: a.effectif } : {}),
        ...((type === 'manuel' || type === 'appui') && Number.isInteger(a.personnesSaisies) ? { personnesSaisies: Math.max(0, Math.min(999, a.personnesSaisies)) } : {}),
        // Fait aussi l'étape d'avant, à la chaîne (retour d'usage du 29/09) : le
        // service de cette étape. Une équipe qui prépare seulement, et pas le sien.
        ...(type === 'manuel' && typeof a.fusion === 'string' && a.fusion && a.fusion.length <= 160 && a.fusion !== service ? { fusion: a.fusion } : {}),
        // Les homme-minutes fixées dans la case, commande par commande ; sans
        // elles, celles du barème importé. Seules les commandes qu'elle prépare.
        ...minutesPropres(a, lots),
        // Ne travaille que si une compagnie a assez de vols ce jour-là (règle ⚡).
        ...conditionDe(a, type),
        ...(type === 'robot' ? {
          debit: Number.isFinite(a.debit) ? Math.max(1, a.debit) : 320,
          personnesMin: Number.isInteger(a.personnesMin) ? Math.max(0, a.personnesMin) : 1,
          // La ligne robot est partagée par les cases Robot du service ; une case
          // « ligne propre » a sa machine. Les arrêts de la ligne (12:15–13:00…).
          ...(a.lignePropre ? { lignePropre: true } : {}),
          ...(Array.isArray(a.arretsLigne) && a.arretsLigne.length ? { arretsLigne: a.arretsLigne.slice(0, 12).map(x => {
            P.minutes(x.de); P.minutes(x.a); return { de: String(x.de), a: String(x.a) };
          }) } : {}),
          // Le débit de chaque commande sur le robot (plateaux/h) ; sans lui, celui du robot.
          ...debitsPropres(a, lots)
        } : {}),
        ...(type === 'lavage' ? {
          // Le débit de l'ENSEMBLE : ce qui est partagé entre les lignes les
          // bride toutes. Zéro ou absent = aucun plafond.
          plafond: Number.isFinite(+a.plafond) ? Math.max(0, +a.plafond) : 0,
          // Par vol (retour d'usage du 28/09) : un tunnel lave un vol en la durée de sa compagnie.
          ...(a.parVol ? { parVol: true, durees: dureesDe(a, 30) } : {}),
          // Le débit d'une plonge est la somme de ses tunnels : on garde la
          // liste, pas le total, sinon on ne saurait plus d'où il vient.
          tunnels: (Array.isArray(a.tunnels) ? a.tunnels : [{ nom: 'Tunnel 1', debit: 300 }])
            .slice(0, 20).map((t, i) => ({
              nom: String(t.nom ?? ('Tunnel ' + (i + 1))).slice(0, 80),
              debit: Number.isFinite(+t.debit) ? Math.max(0, +t.debit) : 300,
              // Un tunnel que personne ne tient ne tourne pas : l'effectif de
              // l'équipe décide combien tournent vraiment.
              personnes: Number.isInteger(+t.personnes) ? Math.max(0, Math.min(99, +t.personnes)) : 1,
              actif: t.actif !== false,
              // Plonge par vol : combien de fois plus vite qu'un tunnel normal (1 : pas retenu).
              ...(Number.isFinite(+t.vitesse) && +t.vitesse > 0 && +t.vitesse !== 1 ? { vitesse: Math.min(10, Math.round(+t.vitesse * 100) / 100) } : {})
            }))
        } : {}),
        // L'équipe hors tunnel : ses minutes par vol, par compagnie (« * » : toutes).
        ...(type === 'appui' ? { minutesVol: Object.fromEntries(Object.entries(a.minutesVol && typeof a.minutesVol === 'object' ? a.minutesVol : {})
          .map(([k, x]) => [String(k).trim().toUpperCase().slice(0, 40), +x]).filter(([k, x]) => k && Number.isFinite(x) && x >= 0).map(([k, x]) => [k, Math.min(1440, x)]).slice(0, 200)) } : {}),
        // Une mise à disposition est permanente sauf si on lui donne une heure.
        ...(type === 'dispo' ? { permanent: a.permanent !== false, vagues: vaguesDe(a, jour), ...ouvertureDe(a) } : {}),
        // Le handling : une durée par vol et par compagnie, combien de vols à la
        // fois, et pas plus de `avance` minutes avant le départ.
        ...(type === 'handling' ? handlingDe(a) : {})
      };
    }).map(a => (a.type === 'dispo' && a.vagues.length ? { ...a, debut: a.vagues[0].debut, jour: a.vagues[0].jour } : a));
    // Une règle ⚡ renvoie vers une équipe du même service qui existe ; sinon elle ne tient pas.
    const parId = new Map(ateliers.map(a => [a.id, a]));
    for (const a of ateliers) {
      if (!a.condition) continue;
      const vers = parId.get(a.condition.sinon);
      if (!vers || vers.id === a.id || vers.service !== a.service) { delete a.condition; continue; }
      if (a.condition.renfort && (!parId.has(a.condition.renfort) || a.condition.renfort === a.id)) delete a.condition.renfort;
    }
    // Ce que l'utilisateur retire du programme, et ce qu'il y ajoute. Le
    // programme de vols reste la source ; ces deux listes le corrigent.
    const exclues = [...new Set((Array.isArray(brut.exclues) ? brut.exclues : []).map(String))].slice(0, 500);
    // Une compagnie × classe déclarée à la main ne porte QUE son identité.
    // Les passagers, le nombre de vols et l'échéance viennent du programme de
    // vols importé : les ressaisir serait ouvrir la porte à deux vérités.
    const ajoutees = (Array.isArray(brut.ajoutees) ? brut.ajoutees : []).slice(0, 500).map(c => {
      const cie = String(c.cie ?? '').trim().toUpperCase().slice(0, 40);
      const cabine = P.CABINES.includes(c.cabine) ? c.cabine : 'YC';
      if (!cie) throw new Error('Une compagnie × classe ajoutée doit nommer sa compagnie.');
      return { cie, cabine };
    });
    const m = brut.materiel || {};
    const materiel = {
      actif: m.actif === true,
      // Par classe, en unités PAR VOL. `unitesDe` convertit aussi l'ancienne
      // saisie, qui comptait par passager.
      unites: P.unitesDe(m),
      stockInitial: Number.isFinite(+m.stockInitial) ? Math.max(0, Math.round(+m.stockInitial)) : 0,
      delaiRetour: Number.isFinite(+m.delaiRetour) ? Math.max(0, Math.round(+m.delaiRetour)) : 30,
      // D'où viennent les retours à la plonge : les lignes RET du programme, les
      // départs de la veille (J+1), ou la planche retour du handling (Vols › Planche retour).
      retours: P.sourceRetours(m),
      planche: plancheDe(m.planche)
    };
    // Le chemin de chaque classe. Une sauvegarde d'avant les parcours reçoit
    // les parcours types ; une liste vidée exprès reste vide.
    const { parcours, parcoursCabine, parcoursClasse } = PC.validerParcours(brut);
    // Les changements d'organisation déjà faits une fois (ex. « robot-eco ») :
    // ils ne se refont pas à chaque ouverture.
    const migrations = [...new Set((Array.isArray(brut.migrations) ? brut.migrations : []).map(String))].slice(0, 50);
    const categories = categoriesDe(brut.categories);
    // L'effectif de chaque service : constant (« fixe ») ou calculé d'après les
    // homme-minutes (« calcule »). Absent : le choix par défaut (effectifConstant).
    const effectifs = Object.fromEntries(Object.entries(brut.effectifs && typeof brut.effectifs === 'object' ? brut.effectifs : {})
      .filter(([k, x]) => k && k.length <= 160 && (x === 'fixe' || x === 'calcule' || x === 'impose')).slice(0, 500));
    // Les superviseurs / coordinateurs de chaque service (06/10) : hors production,
    // ils serviront à relier l'unité au budget quotidien.
    const encadrement = Object.fromEntries(Object.entries(brut.encadrement && typeof brut.encadrement === 'object' ? brut.encadrement : {})
      .map(([k, x]) => [String(k).slice(0, 160), Math.round(+x)]).filter(([k, x]) => k && Number.isFinite(x) && x > 0).map(([k, x]) => [k, Math.min(99, x)]).slice(0, 500));
    return { schema: 'ory-ateliers', version: 1, ateliers, exclues, ajoutees, materiel,
      parcours, parcoursCabine, parcoursClasse, ...(Object.keys(categories).length ? { categories } : {}),
      ...(Object.keys(effectifs).length ? { effectifs } : {}), ...(Object.keys(encadrement).length ? { encadrement } : {}), ...(migrations.length ? { migrations } : {}) };
  }

  /* L'effectif constant par défaut (retour d'usage du 05/10) : « le nombre de
   * personnes dépend du nombre de vols, à part sur certains ateliers ». CF
   * départ food (les checkeurs, à heures fixes), le magasin, la légumerie, le
   * duty free et les appros ne suivent pas les vols ; les autres services se
   * calculent. Une case dans la fiche du service change ce choix. */
  const CONSTANTS = new Set(['handling', 'magasin', 'decontam', 'bobduty', 'appros']);
  const NOMS_CONSTANTS = /cf\s*d[ée]part|magasin|l[ée]gumerie|duty|appro/i;

  /** 420 → « 7 h », 60 → « 1 h », 15 → « 15 min », 495 → « 8 h 15 ». */
  const dureeLue = m => { m = Math.round(m || 0); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); };

  const vide = () => ({ schema: 'ory-ateliers', version: 1, ateliers: [], exclues: [], ajoutees: [],
    materiel: { actif: false, unites: P.UNITES_DEFAUT, stockInitial: 0, delaiRetour: 30 },
    ...PC.parcoursTypes() });

  /* ======================================================================
   *  Le panneau
   * ====================================================================*/

  class CentreAteliers {
    /**
     * @param {object} a adaptateur
     *   hote()      — élément où vivre
     *   services()  — [{id, nom}] où l'on peut poser un atelier
     *   classes()   — compagnies × classes du programme courant
     *   liaisons()  — [{from,to}] entre services
     *   reglages()  — {rendement, delaiChargement, bareme}
     *   notify(msg) — message passager
     */
    constructor(a) {
      this.a = a;
      this.state = vide();
      this.ouvert = null;         // atelier en cours d'édition
      this.resultat = null;
      this.undo = []; this.redo = [];
      let alerte = '';
      try {
        const brut = localStorage.getItem(CLE);
        if (brut) {
          const lu = JSON.parse(brut);
          this.state = valider(lu);
          if (lu && lu.parcours === undefined) {
            alerte = 'Parcours types créés : « Complet » pour BC, PC, CREW et SPML, « Sans cuisine » pour YC. '
              + 'Ajustez-les dans l’onglet « Les chemins ».';
            this.enregistrer();
          }
          // La prépa (24/09) s'insère une fois entre la cuisine et le montage
          // des chemins déjà dessinés. Les autres liens vers le montage restent.
          const insere = PC.insererPrepa ? PC.insererPrepa(this.state) : 0;
          if (insere) {
            alerte = 'Nouveau service « Prépa » : il s’insère entre Cuisine et Montage dans '
              + (insere > 1 ? insere + ' chemins' : '1 chemin') + '. Ajoutez-le ailleurs depuis l’onglet « Les chemins ».';
            this.enregistrer();
          }
        }
      }
      catch (e) { alerte = 'Ateliers enregistrés non chargés : ' + e.message + ' La copie reste en place.'; }
      // Un chemin de commande dessiné avant le 24/09 n'avait pas ses cases :
      // chaque service reçoit la sienne, une fois, pour qu'on puisse la régler.
      try {
        const nomDe = id => (this.a.services().find(x => x.id === id) || {}).nom || id;
        const n = PC.completerCases ? PC.completerCases(this.state, nomDe, this.classes) : 0;
        if (n) {
          this.state = valider(this.state); this.enregistrer();
          alerte = (n > 1 ? n + ' cases créées' : '1 case créée') + ' dans les chemins déjà dessinés : chaque service a maintenant la sienne, à régler dans « Les chemins » ou « Les cases ».';
        }
      } catch (e) { /* un état illisible est déjà signalé plus haut */ }
      // La légumerie, le magasin, la réception : une seule case par poste
      // (28/09). Les cases d'avant, une par commande, se fondent d'elles-mêmes à
      // l'ouverture — « Annuler » revient en arrière.
      try {
        const avant = clone(this.state);
        const r = this.fondreDispos(this.state);
        if (r.converties) {
          // Une copie de l'organisation d'avant, gardée dans ce navigateur :
          // « Annuler » ne survit pas à un rechargement de la page.
          try { localStorage.setItem(CLE + '-avant-fonte', JSON.stringify({ le: new Date().toISOString(), etat: avant })); } catch (e) { /* plein */ }
          this.state = valider(this.state); this.undo.push(avant); this.enregistrer();
          alerte = this.messageFonte(r) + ' « Annuler » revient en arrière.';
        }
      } catch (e) { /* un état illisible est déjà signalé plus haut */ }
      this.construire();
      this.lier();
      this.parcours = new PC.EditeurParcours({
        boite: () => document.getElementById('at-parcours'),
        etat: () => this.state,
        changer: (fn, message) => this.changer(() => fn(this.state), message),
        services: () => this.a.services(),
        classes: () => this.classes,
        resultat: () => this.resultat,
        // La fiche d'une case s'ouvre dans le chemin, sous le service choisi.
        fiche: (id, cmd) => this.ficheCase(id, cmd),
        ajout: () => this.formAjout('chemins'),
        onglet: id => { if (this.a.onglet) this.a.onglet(id); },
        // Un flux partagé se modifie dans Flux de production ; un service, dans Services et équipes.
        flux: this.a.flux ? id => this.a.flux(id) : null,
        service: this.a.ouvrirService ? id => this.a.ouvrirService(id) : null
      });
      this.rendre(alerte);
    }

    /* ---- données ----------------------------------------------------- */

    /* Le programme de vols reste la source. L'utilisateur en retire ce qu'il ne
     * fabrique pas et y ajoute ce que le programme ne porte pas encore : une
     * compagnie à venir, une prestation hors vol. Un ajout qui porte le même
     * identifiant qu'une classe du programme la remplace — c'est la façon de
     * corriger un volume sans toucher au fichier de vols. */
    get classes() {
      const exclues = new Set(this.state.exclues || []);
      const par = new Map();
      for (const c of (this.a.classes() || [])) {
        if (exclues.has(c.id)) continue;
        par.set(c.id, { ...c, origine: 'programme' });
      }
      for (const c of (this.state.ajoutees || [])) {
        const id = P.idClasse(c.cie, c.cabine);
        if (exclues.has(id)) continue;
        // Le programme fait foi : une classe qu'il porte déjà garde SES chiffres.
        // Une déclaration ne sert qu'à nommer ce que l'import ne nomme pas — et
        // ce qu'il ne nomme pas n'a, aujourd'hui, ni passager ni vol.
        if (par.has(id)) { par.get(id).declaree = true; continue; }
        par.set(id, { id, cie: c.cie, cabine: c.cabine, pax: 0, vols: [],
          echeance: P.MINUTES_PAR_JOUR, origine: 'ajoutee' });
      }
      return [...par.values()].sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
    }

    /* Les classes du programme que l'utilisateur a retirées, pour pouvoir les
     * rétablir : un retrait qu'on ne peut pas défaire est un piège. */
    get retirees() {
      const exclues = new Set(this.state.exclues || []);
      return (this.a.classes() || []).filter(c => exclues.has(c.id));
    }

    /** Les commandes d'un service qui travaille par catégories, ou null pour un autre. */
    classesDe(service) {
      const cats = (this.state.categories || {})[service]; if (!cats) return null;
      const r = this.a.reglages ? this.a.reglages() : {};
      // Une case par compagnie dont un chemin passe par ce service, avec ou sans vol.
      const base = this.classes;
      return P.classesCategories(this.a.vols(), { [service]: cats }, { delaiChargement: r.delaiChargement,
        compagnies: P.compagniesParService(base, P.routesDesClasses(base, this.state)) });
    }

    calculer() {
      this.synchroniserAteliers();
      if (P.declarerCategories) P.declarerCategories(this.state.categories);
      const r = this.a.reglages ? this.a.reglages() : {};
      try {
        this.resultat = P.simuler({
          vols: this.a.vols(), classes: this.classes,
          ateliers: this.state.ateliers, liaisons: this.a.liaisons(), materiel: this.state.materiel,
          bareme: r.bareme, rendement: r.rendement, regime: r.regime, delaiChargement: r.delaiChargement,
          parcours: this.state.parcours, parcoursCabine: this.state.parcoursCabine,
          parcoursClasse: this.state.parcoursClasse,
          // Les services qui travaillent par catégories propres (l'armement).
          categories: this.state.categories || {},
          // Les services dont l'effectif se calcule d'après les homme-minutes (05/10).
          effectifCalcule: this.servicesCalcules(), effectifImpose: this.servicesImposes(),
          noms: Object.fromEntries((this.a.fantomes ? this.a.fantomes() : []).map(f => [f.id, f.nom])
            .concat(this.a.services().map(s => [s.id, s.nom])))
        });
      } catch (e) {
        this.resultat = { ok: false, anomalies: [{ code: 'moteur', message: e.message }], lots: [], ateliers: [], classes: [], parClasse: {} };
      }
      this.reporterEffectifs();
      return this.resultat;
    }

    /* L'effectif d'un service (retour d'usage du 05/10) : constant, saisi équipe
     * par équipe, ou calculé d'après les homme-minutes de ses équipes. */
    effectifConstant(service) {
      if (this.parVols(service)) return false;
      const v = (this.state.effectifs || {})[service];
      if (v === 'fixe' || v === 'calcule' || v === 'impose') return v === 'fixe';
      const s = this.a.services().find(x => x.id === service);
      return CONSTANTS.has(service) || NOMS_CONSTANTS.test((s && s.nom) || '');
    }

    /* Un service qui travaille par compagnie (l'armement) dépend toujours des
     * vols (retour d'usage du 07/10 : « l'armement dépend du nombre de vols de la
     * compagnie ») : minutes par vol × départs de chaque compagnie. Ni lui ni ses
     * équipes ne peuvent être constants. */
    parVols(service) { return !!(this.state.categories || {})[service]; }

    /** Effectif imposé (essai) : les minutes par vol s'appliquent, l'effectif est celui saisi. */
    effectifImpose(service) { return (this.state.effectifs || {})[service] === 'impose'; }

    /** Les services dont l'effectif se calcule (une équipe peut faire autrement : `effectif`). */
    servicesCalcules() {
      return [...new Set(this.state.ateliers.map(a => a.service))].filter(s => !this.effectifConstant(s) && !this.effectifImpose(s));
    }

    /** Les services à effectif imposé (essai). */
    servicesImposes() {
      return [...new Set(this.state.ateliers.map(a => a.service))].filter(s => this.effectifImpose(s));
    }

    /** L'effectif de cette équipe est-il imposé (essai) ? */
    impose(a) { return !!a && (a.effectif === 'impose' || (!a.effectif && this.effectifImpose(a.service))); }

    regleImpose(service, oui) {
      const nom = (this.a.services().find(x => x.id === service) || {}).nom || service;
      this.changer(() => {
        this.state.effectifs = { ...(this.state.effectifs || {}), [service]: oui ? 'impose' : 'calcule' };
        if (oui) for (const a of this.state.ateliers) {
          if (a.service !== service || a.effectif || !Number.isInteger(a.personnesSaisies)) continue;
          a.personnes = a.personnesSaisies; delete a.personnesSaisies;
        }
      }, oui ? nom + ' : effectif imposé (essai) — les minutes par vol s’appliquent à l’effectif saisi.' : nom + ' : effectif calculé.');
    }

    /** Le poste de cette équipe dépend-il des vols ? Son choix à elle, sinon celui du service. */
    dependDesVols(a) {
      if (!a || !(a.type === 'manuel' || a.type === 'appui')) return false;
      if (this.parVols(a.service)) return true;
      if (['calcule', 'fixe', 'impose'].includes(a.effectif)) return a.effectif !== 'fixe';
      return !this.effectifConstant(a.service);
    }

    /* Le choix d'une équipe (06/10 : « le poste ne dépend pas forcément des vols ») :
     * comme son service, ou à part. Constant, elle retrouve l'effectif saisi. */
    regleEffectifEquipe(a, v) {
      if (v === 'fixe' || v === 'calcule' || v === 'impose') a.effectif = v; else delete a.effectif;
      if ((!this.dependDesVols(a) || this.impose(a)) && Number.isInteger(a.personnesSaisies)) { a.personnes = a.personnesSaisies; delete a.personnesSaisies; }
    }

    /* Le petit choix « Effectif » dans la fiche d'une équipe. */
    choixEffectifEquipe(a, classe) {
      if (!a || !(a.type === 'manuel' || a.type === 'appui')) return '';
      const svc = this.effectifConstant(a.service) ? 'constant' : this.effectifImpose(a.service) ? 'effectif imposé' : 'dépend des vols', v = a.effectif || '';
      const opt = (x, t) => `<option value="${x}"${x === v ? ' selected' : ''}>${t}</option>`;
      return `<label class="${classe || 'at-eff-equipe'}" title="Le poste de cette équipe dépend-il du nombre de vols ? Par défaut, comme son service (case « Effectif constant »).">Effectif
        <select data-at-champ="effectif">${opt('', 'Comme le service (' + svc + ')')}${opt('calcule', 'Dépend des vols')}${opt('impose', 'Dépend des vols, effectif imposé (essai)')}${this.parVols(a.service) ? '' : opt('fixe', 'Constant (saisi)')}</select></label>`;
    }

    regleEffectif(service, constant) {
      const nom = (this.a.services().find(x => x.id === service) || {}).nom || service;
      this.changer(() => {
        this.state.effectifs = { ...(this.state.effectifs || {}), [service]: constant ? 'fixe' : 'calcule' };
        // Constant : chaque équipe qui suit le service retrouve l'effectif saisi avant le calcul.
        if (constant) for (const a of this.state.ateliers) {
          if (a.service !== service || a.effectif || !Number.isInteger(a.personnesSaisies)) continue;
          a.personnes = a.personnesSaisies; delete a.personnesSaisies;
        }
      },
        constant ? nom + ' : effectif constant, ses équipes gardent le nombre de personnes saisi.'
          : nom + ' : effectif calculé, d’après les minutes par vol et le nombre de vols.');
    }

    /** L'effectif calculé d'une équipe ({ personnes, hommeMinutes, poste, rendement }), ou null. */
    effectifCalcule(a) {
      if (!this.dependDesVols(a) || this.impose(a)) return null;
      return ((this.resultat && this.resultat.effectifs) || {})[a.id] || null;
    }

    /* Le champ « Personnes » d'une équipe : à saisir, ou calculé (en lecture). */
    champPersonnes(a, classe) {
      const e = this.effectifCalcule(a), cls = classe ? ` class="${classe}"` : '';
      if (!e) return `<label${cls}>Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>`;
      const h = m => (m >= 60 ? Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0') : Math.round(m) + ' min');
      const pourquoi = h(e.hommeMinutes) + ' de travail (minutes par vol × vols de chaque compagnie) ÷ ' + h(e.poste)
        + ' travaillées par personne pendant son poste' + (e.rendement !== 1 ? ' × rendement ' + Math.round(e.rendement * 100) + ' %' : '')
        + ', arrondi au-dessus. Pour le saisir à la main, cochez « Effectif constant » dans la fiche du service.';
      return `<span${cls ? ` class="${classe} at-pers-calc"` : ' class="at-pers-calc"'} title="${esc(pourquoi)}">Personnes
        <output data-at-calcule="${esc(a.id)}">${e.personnes}</output><small>calculé · ${esc(h(e.hommeMinutes))} ÷ ${esc(h(e.poste))}</small></span>`;
    }

    /* Une mise à disposition a des gens qui y travaillent (retour d'usage du
     * 06/10 : « même si c'est une zone, les gens y travaillent, en quantité
     * constante : 2 personnes aux appros, ce sont 2 personnes en tout sur la
     * journée »). Ils ne changent pas le calcul (on vient s'y servir), mais
     * comptent dans l'effectif et les heures de la journée : une présence
     * chacun. */
    champPersonnesJournee(a) {
      const r = this.a.reglages ? this.a.reglages() : {};
      const reg = P.normaliserRegime(a.regime, r.regime);
      const presence = reg.actif ? reg.presence : P.normaliserRegime(null, r.regime).presence;
      // Le travail d'une présence : la présence moins ses pauses (8 h dont 1 h de pause : 7 h).
      const travail = P.minutesDuPoste({ debut: '06:00', jour: 0, pauses: [], regime: a.regime }, r.regime);
      const h = dureeLue;
      const n = Math.max(0, +a.personnes || 0);
      return `<label class="at-pers-jour">Personnes sur la journée<input type="number" min="0" max="999" value="${n}" data-at-champ="personnes"
        title="En tout, sur la journée : chacune fait une présence (${esc(h(presence))}, dont ${esc(h(presence - travail))} de pause)"></label>
        <span class="mini-note">${n ? `${n} × ${esc(h(presence))} de présence (dont ${esc(h(presence - travail))} de pause) = <b>${esc(h(n * presence))}</b> de présence,
          ${esc(h(n * travail))} de travail sur la journée. ` : ''}Constant : ne dépend pas du nombre de vols, ne change pas les heures de service.</span>`;
    }

    /** Les superviseurs / coordinateurs d'un service (0 sans). Hors production. */
    encadrement(service) { return ((this.state.encadrement || {})[service]) || 0; }

    regleEncadrement(service, n) {
      const k = Math.max(0, Math.min(99, Math.round(+n) || 0));
      const nom = (this.a.services().find(x => x.id === service) || {}).nom || service;
      this.changer(() => {
        const e = { ...(this.state.encadrement || {}) };
        if (k) e[service] = k; else delete e[service];
        this.state.encadrement = e;
      }, nom + ' : ' + (k ? k + (k > 1 ? ' superviseurs ou coordinateurs.' : ' superviseur ou coordinateur.') : 'aucun superviseur.'));
    }

    /** Les équipes à la main dont le poste ne dépend pas des vols : pas de minutes par vol. */
    constantes() { return this.state.ateliers.filter(a => a.type === 'manuel' && !this.dependDesVols(a)).map(a => a.id); }

    /** Ce service lave-t-il (une équipe de plonge, des tunnels) ? */
    serviceLave(service) { return this.state.ateliers.some(x => x.service === service && x.type === 'lavage'); }

    /* L'équipe hors tunnel, hors flux (retour d'usage du 06/10 : « des équipes qui
     * ne dépendent pas du tunnel, comme pour les autres, avec le choix si cela
     * dépend des vols ou non »). Ses minutes par vol, par compagnie ; ce qu'elle
     * en tire dépend de la case « Effectif constant » du service. */
    ficheAppui(a) {
      const lave = this.serviceLave(a.service), constant = !this.dependDesVols(a);
      const e = this.effectifCalcule(a), m = a.minutesVol || {};
      const cies = [...new Set((this.a.vols() || []).filter(x => lave ? true : (x.sens || 'DEP') === 'DEP').map(x => String(x.cie || '').toUpperCase()).filter(Boolean))].sort();
      const ligne = (cie, nom) => `<tr><th scope="row">${esc(nom)}</th><td><input type="number" min="0" step="0.5" value="${m[cie] ?? ''}"
        placeholder="${cie === P.TOUTES ? '—' : (m[P.TOUTES] ?? '—')}" data-at-champ="appui-min" data-cie="${esc(cie)}" aria-label="Minutes par vol : ${esc(nom)}"></td></tr>`;
      return `<p class="mini-note at-regle">Une équipe <b>hors ${lave ? 'tunnel' : 'flux'}</b> : elle est là à ses heures, ne prépare pas de commande${lave ? ', ne tient pas de tunnel' : ''}
        et ne fait rien attendre. ${constant
          ? 'Son effectif est <b>constant</b> : celui saisi plus haut.'
          : 'Son effectif <b>dépend des vols</b> : minutes par vol × ' + (lave ? 'vols qui reviennent à la plonge' : 'départs du jour') + ' de chaque compagnie ÷ son poste.'}
        Le choix se fait plus haut (« Effectif »), ou pour tout le service : « Effectif constant ».</p>
        ${constant ? '' : `<div class="at-sous-titre">Minutes de travail par vol, pour une personne
          <span class="mini-note">${lave ? 'pour chaque vol qui revient' : 'pour chaque départ'} ; vide : celle de toutes les compagnies</span></div>
        <table class="at-appui-cies"><tbody>${ligne(P.TOUTES, 'Toutes les compagnies')}${cies.map(c => ligne(c, c)).join('')}</tbody></table>
        <p class="mini-note at-appui-note">${e ? `${e.vols} vol${e.vols > 1 ? 's' : ''} · ${dureeLue(e.hommeMinutes)} de travail ÷ ${dureeLue(e.poste)} par personne : <b>${e.personnes} ${e.personnes > 1 ? 'personnes' : 'personne'}</b>.`
          : 'Renseignez ses minutes par vol : sans elles, son effectif reste celui saisi.'}</p>`}`;
    }

    /* L'atelier unique (07/10) : ses commandes sont celles de ses compagnies, toutes
     * classes, dans l'ordre des départs — de nouveaux vols, de nouvelles commandes. */
    lotsAtelier(a) {
      const cies = new Set(a.compagnies || []);
      return this.classes.filter(c => !c.categorie && cies.has(String(c.cie).toUpperCase())).map(c => [c.id]);
    }
    synchroniserAteliers() {
      let n = 0;
      // L'armement n'est jamais constant (07/10) : un ancien choix « constant » s'efface.
      const eff = this.state.effectifs || {};
      for (const s of Object.keys(this.state.categories || {})) if (eff[s] === 'fixe') { delete eff[s]; n++; }
      for (const a of this.state.ateliers) {
        if (a.effectif === 'fixe' && this.parVols(a.service)) {
          delete a.effectif; n++;
        }
        if (!a.parCompagnie) continue;
        const l = this.lotsAtelier(a);
        if (JSON.stringify(l) !== JSON.stringify(a.lots)) { a.lots = l; n++; }
      }
      if (n) this.enregistrer();
    }

    /* L'effectif calculé devient celui de l'équipe : le planning, le budget, les
     * exports et les fiches lisent tous le même nombre. */
    reporterEffectifs() {
      const eff = (this.resultat && this.resultat.effectifs) || {};
      let n = 0;
      for (const a of this.state.ateliers) {
        const e = eff[a.id];
        if (!e || a.personnes === e.personnes) continue;
        // La première fois, on garde ce qui avait été saisi : rien ne se perd.
        if (!Number.isInteger(a.personnesSaisies)) a.personnesSaisies = a.personnes;
        a.personnes = e.personnes; n++;
      }
      if (n) this.enregistrer();
    }

    changer(fn, message) {
      const avant = clone(this.state);
      try { fn(); this.state = valider(this.state); }
      catch (e) { this.state = avant; this.rendre('Refusé : ' + e.message); return false; }
      if (JSON.stringify(avant) !== JSON.stringify(this.state)) {
        this.undo.push(avant); if (this.undo.length > 80) this.undo.shift(); this.redo = [];
      }
      this.enregistrer(); this.rendre(message); return true;
    }

    enregistrer() {
      try { localStorage.setItem(CLE, JSON.stringify(this.state)); }
      catch { this.a.notify('Enregistrement impossible : exportez vos ateliers.'); }
    }

    histoire(refaire) {
      const de = refaire ? this.redo : this.undo, vers = refaire ? this.undo : this.redo;
      if (!de.length) return;
      vers.push(clone(this.state)); this.state = de.pop(); this.ouvert = null;
      this.enregistrer(); this.rendre(refaire ? 'Action rétablie.' : 'Action annulée.');
    }

    /* ---- structure --------------------------------------------------- */

    construire() {
      this.a.hote().innerHTML = `
<div class="at-tete">
  <div class="at-actions">
    <button class="btn btn-sm" id="at-undo" title="Annuler la dernière modification">↶<span class="mot-outil"> Annuler</span></button>
    <button class="btn btn-sm" id="at-redo" title="Rétablir ce qui a été annulé">↷<span class="mot-outil"> Rétablir</span></button>
    <button class="btn btn-sm" id="at-export" title="Les cases, ce qu’elles préparent et les chemins, dans un classeur Excel">⇩ Cases et chemins</button>
    <button class="btn btn-sm" id="at-export-horaires" title="L’heure de début de chaque case, dans un petit classeur Excel à modifier puis réimporter">⇩ Horaires</button>
    <button class="btn btn-sm" id="at-import-btn" title="Réimporter un classeur de cases et chemins, ou d’horaires, modifié dans Excel">⇧ Importer</button>
    <input id="at-import" type="file" accept=".xlsx,.json" hidden>
  </div>
</div>
<p id="at-status" role="status" aria-live="polite"></p>
<details id="at-anomalies" class="at-anomalies" data-sous="at-chemins at-equipes at-grille at-planning at-repas at-recap" hidden></details>
<section id="mu-pas" class="mu mu-pas" data-sous="mu-pas" aria-label="Pas à pas"></section>
<section id="mu-carte" class="mu mu-carte" data-sous="mu-carte" aria-label="Vue d’ensemble des chemins"></section>
<section id="mu-flux" class="mu mu-flux" data-sous="mu-flux" aria-label="Les flux de production"></section>
<section id="mu-services" class="mu mu-services" data-sous="mu-services" aria-label="Les services de l’unité"></section>
<div id="at-parcours" class="pc"></div>
<h3 class="at-titre" data-sous="at-equipes">Les cases <span class="pc-sous">calculées à partir des chemins : cliquez une commande pour régler sa case</span></h3>
<div class="at-barre" data-sous="at-equipes">
  <label>Service <select id="at-filtre"><option value="">Tous</option></select></label>
  <span class="at-barre-fin"></span>
  <button class="btn" id="at-new" title="Une case qui ne suit pas une commande : une plonge, une mise à disposition qui sert tout le monde">+ Case hors chemin</button>
</div>
<div id="at-liste" data-sous="at-equipes"></div>
<p class="mini-note at-materiel-renvoi" data-sous="at-equipes">La boucle du matériel et les retours des vols à la plonge se règlent dans
  <button class="lien-discret" data-page="rg-simulation">Simulation › Réglages de la simulation →</button></p>
<h3 class="at-titre" data-sous="at-planning">La journée des équipes <span class="pc-sous">qui travaille quand</span></h3>
<div id="at-indicateurs" class="at-indicateurs" data-sous="at-planning"></div>
<div id="at-planning" class="at-planning" data-sous="at-planning"></div>

<section class="recap-cases" data-sous="at-recap" aria-label="Récap des cases">
  <div class="rc-outils">
    <label class="rc-cherche">Chercher <input id="rc-filtre" type="search" placeholder="Case, service ou compagnie"></label>
    <span class="rc-fin"></span>
    <button class="btn btn-sm" id="rc-undo" title="Annuler la dernière modification">↶ Annuler</button>
    <button class="btn btn-sm" id="rc-redo" title="Rétablir ce qui a été annulé">↷ Rétablir</button>
    <button class="btn btn-sm" id="rc-export" title="Toutes les cases dans un classeur Excel de paramétrage : jour, heure de départ, personnes, commandes dans l’ordre">⇩ Cases</button>
    <button class="btn btn-sm" id="rc-import-btn" title="Réimporter le classeur des cases modifié">⇧ Importer</button>
    <input id="rc-import" type="file" accept=".xlsx" hidden>
  </div>
  <p class="rc-legende"><span class="rc-deroule unique">tâche unique</span> une seule préparation, de son départ à sa fin ·
    <span class="rc-deroule suite">à la suite</span> les lignes s’enchaînent, chacune quand la précédente est finie ·
    <span class="rc-ensemble-lab">ensemble</span> plusieurs commandes préparées en même temps, qui sortent ensemble.</p>
  <div id="rc-liste"></div>
</section>
<h3 class="at-titre" data-sous="at-repas">Les commandes à préparer <span class="pc-sous">une par compagnie et par classe, pour la journée</span></h3>
<div id="at-classes" data-sous="at-repas"></div>`;
    }

    lier() {
      const hote = this.a.hote();
      const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      on('at-undo', 'click', () => this.histoire(false));
      on('at-redo', 'click', () => this.histoire(true));
      on('at-filtre', 'change', e => { this.filtre = e.target.value; this.rendreListe(this.resultat || {}); });
      on('at-new', 'click', () => this.creer());
      on('at-export', 'click', () => this.exporter());
      on('at-export-horaires', 'click', () => this.exporterHoraires());
      on('at-import-btn', 'click', () => document.getElementById('at-import').click());
      on('at-import', 'change', e => this.importer(e));
      on('rc-undo', 'click', () => this.histoire(false));
      on('rc-redo', 'click', () => this.histoire(true));
      on('rc-export', 'click', () => this.exporterRecapCases());
      on('rc-import-btn', 'click', () => document.getElementById('rc-import').click());
      on('rc-import', 'change', e => this.importerRecapCases(e));
      on('rc-filtre', 'input', e => { this.rcFiltre = e.target.value.trim().toLowerCase(); this.rendreRecapCases(this.resultat || {}); });

      // Un seul écouteur pour toute la liste : les cartes sont redessinées à
      // chaque changement, des écouteurs par carte fuiraient.
      hote.addEventListener('click', e => {
        const b = e.target.closest('[data-at-action]'); if (!b) return;
        const id = b.closest('[data-at]')?.dataset.at;
        this.action(b.dataset.atAction, id, b.dataset);
      });
      // Le matériel se règle dans une autre vue (Réglages de la simulation) : on
      // l'écoute là où il est, quel que soit l'ordre de construction des vues.
      const ou = el => (el.closest('#rg-sim-materiel') ? { id: null } : hote.contains(el) ? { id: el.closest('[data-at]')?.dataset.at } : null);
      // Un champ d'heure envoie « change » dès que ses chiffres font une heure
      // valide : taper « 14 » passe par 01:00. Enregistrer là redessinait tout
      // et arrachait le champ sous les doigts — on ne pouvait taper qu'un
      // chiffre. Une heure TAPÉE s'enregistre donc quand on quitte le champ, ou
      // sur Entrée (retour d'usage du 29/09). Une saisie par programme (import,
      // tests) n'est pas « de confiance » et s'enregistre tout de suite.
      let enAttente = null;
      const valider = () => {
        const x = enAttente; enAttente = null;
        if (x) this.saisir(x.el.dataset.atChamp, x.id, x.el);
      };
      document.addEventListener('change', e => {
        const el = e.target; if (!el.dataset || !el.dataset.atChamp) return;
        const lieu = ou(el); if (!lieu) return;
        if (e.isTrusted && el.matches('input[type=time]')) {
          if (enAttente && enAttente.el !== el) valider();
          enAttente = { el, id: lieu.id }; return;
        }
        this.saisir(el.dataset.atChamp, lieu.id, el);
      });
      // Après le focus du champ suivant : le rendu le retrouve et le lui rend.
      document.addEventListener('focusout', e => { if (enAttente && e.target === enAttente.el) setTimeout(valider, 0); });
      document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && enAttente && e.target === enAttente.el) { e.preventDefault(); valider(); }
      });
    }

    /* ---- actions ----------------------------------------------------- */

    /* Une case hors chemin : une plonge, une mise à disposition, ou une case
     * qu'on rattachera ensuite. Elle s'ouvre ici, dans la liste. */
    creer(dans) {
      const services = this.a.services();
      // Depuis la page d'un service : la case naît dans ce service, et la liste
      // des cases se resserre sur lui.
      if (dans) this.filtre = dans;
      const service = dans || this.filtre || ((services.find(s => P.BAREME_DEMO[s.id]) || services[0] || {}).id);
      const nom = (services.find(s => s.id === service) || {}).nom || 'Case';
      // Dans le handling, la case née est un handling : elle charge des vols.
      // Seulement quand on la crée DANS ce service (page Services) : une case
      // neuve sans service choisi reste une équipe qui prépare.
      const atelier = dans === 'handling' ? PC.caseHandling(this.state, service, nom)
        : dans && PC.SERVICES_DISPO.includes(dans) ? PC.caseDispo(this.state, service, nom)
        : { id: uid(), nom: PC.nomLibre(this.state, nom), service, type: 'manuel',
          debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [] };
      this.changer(() => this.state.ateliers.push(atelier),
        'Case créée, hors chemin. Donnez-lui son type (plonge, mise à disposition…) ; une case qui prépare se rattache à une commande dans son chemin.');
      this.ouvert = atelier.id; this.rendre();
    }

    /* Le handling en un geste : sa case, et au bout de chaque chemin. Il vit
     * dans son service à lui, jamais dans CF départ food (la zone « handling »
     * du plan), où des checkeurs vérifient les trolleys. */
    brancherHandling() {
      const service = this.serviceHandling();
      const nom = (this.a.services().find(s => s.id === service) || {}).nom || 'Handling';
      let r;
      this.changer(() => { r = PC.brancherHandling(this.state, service, nom, this.servicesHandling()); }, 'Handling en place.');
      return r;
    }

    /* Le service du handling : celui qui en a déjà la case, sinon un service qui
     * porte ce nom, sinon un service « Handling » créé pour lui. */
    serviceHandling() {
      const aCase = (this.state.ateliers || []).find(a => a.type === 'handling');
      if (aCase) return aCase.service;
      const nomme = this.a.services().find(s => /handling|chargement/i.test(s.nom));
      if (nomme) return nomme.id;
      return (this.a.creerHandling && this.a.creerHandling()) || 'handling';
    }

    /* Les services de handling : ceux qui en ont une case, et ceux qui en portent le nom. */
    servicesHandling() {
      return [...new Set((this.state.ateliers || []).filter(a => a.type === 'handling').map(a => a.service)
        .concat(this.a.services().filter(s => /handling|chargement/i.test(s.nom)).map(s => s.id)))];
    }

    /* Les cases de handling d'avant, une par commande. */
    anciensHandlings() { return PC.anciensHandlings(this.state, this.servicesHandling()); }

    /* Un poste de mise à disposition, une case : fond les cases d'avant. */
    fondreDispos(etat) {
      return PC.partagerDispos(etat, id => (this.a.services().find(x => x.id === id) || {}).nom || id);
    }
    messageFonte(r) {
      const noms = r.services.map(id => (this.a.services().find(x => x.id === id) || {}).nom || id).join(', ');
      return noms + ' : ' + r.converties + (r.converties > 1 ? ' cases deviennent ' : ' case devient ')
        + (r.services.length > 1 ? 'une case par poste' : 'une seule case') + ', partagée par toutes les commandes ; leurs heures sont ses vagues.';
    }

    /** Changer la nature d'une case (Équipes › Services et équipes : ce que fait le service). */
    typer(a, v) { typer(a, v); }

    /* Une case se règle dans le chemin d'une de ses commandes, sous son service.
     * Une plonge ou une mise à disposition sert tout le monde : on prend la
     * première commande dont le chemin passe par son service. Sans chemin qui
     * passe par elle, elle se règle sur place. */
    ouvrirFiche(id) {
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return false;
      // Seul un chemin propre s'ouvre dans l'éditeur des chemins : un flux partagé
      // se règle dans Chemins › Flux de production ; la case s'ouvre alors sur place.
      const passe = c => { const p = PC.cheminDe(this.state, c); return !!p && P.servicesDuParcours(p).includes(a.service); };
      const cmd = [...new Set((a.lots || []).flat())].find(passe) || this.classes.map(c => c.id).find(passe);
      if (!cmd) return false;
      this.parcours.ouvrir(cmd, a.service);
      return true;
    }

    /* La fiche d'une case, ouverte, pour le panneau du chemin. */
    ficheCase(id, cmd) {
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return '';
      const calc = ((this.resultat || {}).ateliers || []).find(x => x.id === id);
      return this.carte(a, calc, { cmd });
    }

    action(quoi, id, data) {
      const a = this.state.ateliers.find(x => x.id === id);
      switch (quoi) {
        case 'handling-convertir': {
          const r = this.brancherHandling();
          if (r) this.rendre(r.converties + (r.converties > 1 ? ' cases de handling deviennent' : ' case de handling devient')
            + ' une seule case Handling, qui charge les vols' + (r.chemins ? ' ; ajoutée à ' + r.chemins + (r.chemins > 1 ? ' autres chemins.' : ' autre chemin.') : '.'));
          return;
        }
        case 'chemin': return this.parcours.ouvrir(data.classe, a ? a.service : '');
        // La règle ⚡ : ne travailler que si une compagnie a assez de vols ce jour-là.
        case 'cond-ajouter': {
          const autres = this.equipesSinon(a);
          if (!autres.length) return this.rendre('Ajoutez d’abord une autre équipe à ce service : c’est elle qui reprendra les commandes les jours sans.');
          const cies = this.compagniesDuJour();
          const cie = cies.includes('AF') ? 'AF' : cies[0] || '*';
          const seuil = Math.max(1, P.compteDuJour(this.classes, cie, 'vols'));
          // Par défaut, l'équipe qui reprend absorbe la charge avec ses propres personnes.
          return this.changer(() => { a.condition = { cie, seuil, mesure: 'vols', sinon: autres[0].id, absorbe: true }; },
            'Condition ajoutée : complétez la phrase (compagnie, nombre, et qui reprend les jours sans).');
        }
        case 'cond-retirer':
          return this.changer(() => { delete a.condition; }, '« ' + a.nom + ' » travaille tous les jours.');
        // Dans la liste des cases : aller la régler dans un chemin ; faute de
        // chemin qui passe par elle, elle se déplie sur place.
        case 'ouvrir':
          if (this.ouvert !== id && this.ouvrirFiche(id)) return;
          this.ouvert = this.ouvert === id ? null : id; return this.rendre();
        // Rien à valider : la saisie est enregistrée à chaque frappe. Le bouton
        // referme la fiche et le dit — sans lui, on cherche un « créer »
        // qui n'existe pas et on doute que l'atelier existe.
        case 'fermer':
          this.ouvert = null;
          return this.rendre('« ' + a.nom + ' » enregistré.');
        case 'supprimer':
          if (!confirm('Supprimer la case « ' + a.nom + ' » ? Ses commandes sauteront cette étape jusqu’à ce qu’on leur en donne une autre. L’action est annulable.')) return;
          return this.changer(() => { this.state.ateliers = this.state.ateliers.filter(x => x.id !== id); }, 'Case « ' + a.nom + ' » supprimée.');
        case 'dupliquer':
          return this.changer(() => {
            const c = clone(a); c.id = uid(); c.nom = (a.nom + ' (2)').slice(0, 160);
            this.state.ateliers.splice(this.state.ateliers.indexOf(a) + 1, 0, c);
          }, 'Équipe dupliquée.');
        case 'lot-ajouter':
          return this.changer(() => a.lots.push([]), 'Ligne ajoutée : choisissez ce qu’elle fabrique.');
        case 'lot-retirer':
          return this.changer(() => a.lots.splice(+data.index, 1), 'Fabrication retirée.');
        case 'lot-monter':
          return this.changer(() => { const i = +data.index; if (i > 0) a.lots.splice(i - 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'lot-descendre':
          return this.changer(() => { const i = +data.index; if (i < a.lots.length - 1) a.lots.splice(i + 1, 0, a.lots.splice(i, 1)[0]); }, 'Ordre modifié.');
        case 'classe-retirer':
          return this.changer(() => { a.lots[+data.index] = a.lots[+data.index].filter(c => c !== data.classe); }, 'Classe retirée.');
        case 'lot-tout':
          return this.changer(() => { a.lots = [this.classes.map(c => c.id)]; },
            'Tout sur une seule ligne : ces classes sortiront ensemble.');
        case 'lot-separer':
          return this.changer(() => { a.lots = this.classes.map(c => [c.id]); },
            'Une ligne par classe, dans l’ordre des échéances.');
        // Les arrêts de la ligne robot : une seule ligne, les mêmes arrêts pour
        // toutes les cases qui y travaillent.
        case 'arret-ligne-ajouter':
          return this.changer(() => { const l = this.robotsDeLigne(a); const arr = (a.arretsLigne || []).concat([{ de: '12:15', a: '13:00' }]); for (const x of l) x.arretsLigne = arr.map(y => ({ ...y })); }, 'Arrêt de la ligne ajouté.');
        case 'arret-ligne-retirer':
          return this.changer(() => { const l = this.robotsDeLigne(a); const arr = (a.arretsLigne || []).filter((_, i) => i !== +data.index); for (const x of l) { if (arr.length) x.arretsLigne = arr.map(y => ({ ...y })); else delete x.arretsLigne; } }, 'Arrêt de la ligne retiré.');
        case 'pause-ajouter':
          return this.changer(() => a.pauses.push({ de: '12:00', a: '12:45' }), 'Arrêt ajouté.');
        case 'pause-retirer':
          return this.changer(() => a.pauses.splice(+data.index, 1), 'Arrêt retiré.');
        case 'creneau-ajouter':
          return this.changer(() => {
            const d = (a.creneaux || [])[(a.creneaux || []).length - 1];
            a.creneaux = (a.creneaux || []).concat([d ? { de: d.a, a: d.a < '20:00' ? String(Math.min(23, +d.a.slice(0, 2) + 8)).padStart(2, '0') + ':00' : '23:59', n: d.n }
              : { de: a.debut || '04:00', a: '14:00', n: Math.max(2, (a.simultanes || 1) * 2) }]);
          }, 'Créneau ajouté : chaque vol attend d’avoir ses chauffeurs (2 pour un long courrier, 1 pour un court).');
        case 'creneau-retirer':
          return this.changer(() => { a.creneaux.splice(+data.index, 1); },
            a.creneaux.length > 1 ? 'Créneau retiré.' : 'Dernier créneau retiré : le handling revient à « N vols à la fois ».');
        case 'tunnel-ajouter':
          return this.changer(() => a.tunnels.push({ nom: 'Tunnel ' + (a.tunnels.length + 1), debit: 300, personnes: 1, actif: true }),
            'Tunnel ajouté. Le débit de la plonge est la somme des tunnels qui tournent.');
        case 'tunnel-retirer':
          return this.changer(() => a.tunnels.splice(+data.index, 1), 'Tunnel retiré.');
        case 'vague-ajouter':
          return this.changer(() => {
            const d = a.vagues[a.vagues.length - 1] || { debut: '06:00', jour: 0 };
            const t = Math.min(23 * 60 + 59, P.minutes(d.debut) + 6 * 60);
            a.vagues.push({ debut: String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), jour: d.jour || 0 });
          }, 'Vague ajoutée : chaque commande prend la vague qui précède son besoin.');
        case 'vague-retirer':
          return this.changer(() => { if (a.vagues.length > 1) a.vagues.splice(+data.index, 1); }, 'Vague retirée.');
        case 'separer': {
          const sv = data.service, nomSv = (this.a.services().find(x => x.id === sv) || {}).nom || sv;
          let n = 0;
          this.changer(() => { n = PC.separerParCommande(this.state, sv, nomSv, this.classes); }, '');
          return this.rendre(nomSv + ' : ' + n + (n > 1 ? ' cases, une par commande' : ' case') + ', à l’heure de sa première vague. '
            + 'Reprenez leurs effectifs et leurs heures (ou réimportez vos horaires : ⇧ Importer). « Annuler » revient en arrière.');
        }
        case 'avant-fonte': {
          let copie = null;
          try { copie = JSON.parse(localStorage.getItem(CLE + '-avant-fonte') || 'null'); } catch (e) { copie = null; }
          if (!copie || !copie.etat) return this.rendre('Aucune copie d’avant la fusion.');
          if (!confirm('Remplacer les cases et les chemins par ceux d’avant la fusion (' + String(copie.le || '').slice(0, 16).replace('T', ' ') + ') ? L’action est annulable.')) return;
          this.changer(() => { this.state = valider(copie.etat); }, 'Organisation d’avant la fusion rétablie. La légumerie et le magasin ne sont plus fondus : '
            + 'utilisez « Passer à une case partagée » dans les points à regarder, si besoin.');
          try { localStorage.removeItem(CLE + '-avant-fonte'); } catch (e) { /* rien */ }
          return this.rendre();
        }
        case 'boutiques': {
          const ids = this.state.ateliers.filter(x => x.type === 'dispo' && x.permanent === false && PC.SERVICES_DISPO.includes(x.service)).map(x => x.id);
          return this.changer(() => { for (const x of this.state.ateliers) if (ids.includes(x.id)) { x.permanent = true; x.ouverture = { de: '07:00', a: '18:00' }; } },
            ids.length + (ids.length > 1 ? ' cases ouvertes' : ' case ouverte') + ' comme des boutiques, de 07:00 à 18:00, chaque jour. « Annuler » revient aux vagues.');
        }
        case 'fantome-effacer':
          if (this.a.effacerService) this.a.effacerService(data.service, null);
          return;
        case 'oublier-copie':
          try { localStorage.removeItem(CLE + '-avant-fonte'); } catch (e) { /* rien */ }
          return this.rendre('Copie d’avant la fusion oubliée.');
        case 'dispo-partager': {
          let r;
          this.changer(() => { r = this.fondreDispos(this.state); }, '');
          if (r) this.rendre(this.messageFonte(r));
          return;
        }
        case 'duree-retirer':
          return this.changer(() => { for (const m of ['durees', 'allers', 'retours', 'volsCamion']) if (a[m]) { const d = { ...a[m] }; delete d[data.cie]; a[m] = d; } },
            'Durée retirée : ' + data.cie + ' prend la durée de toutes les compagnies.');
        case 'classe-supprimer': return this.supprimerClasse(data.classe);
        case 'classe-retablir':  return this.retablirClasse(data.classe);
        case 'classe-nouvelle':  return this.ouvrirAjout(data.lieu);
        case 'classe-annuler':   { this.ajout = null; return this.rendre(''); }
        case 'classe-valider':   return this.validerAjout(data.lieu);
      }
    }

    /* Un champ qui déclenche `change` est encore en train de perdre le focus :
     * remplacer tout de suite le HTML qui le contient fait échouer le rendu.
     * On laisse le navigateur finir, puis on redessine. */
    saisir(champ, id, el) {
      // Les réglages du matériel ne vivent pas dans une carte d'atelier : les
      // chercher par identifiant d'atelier les ferait disparaître en silence.
      if (champ.startsWith('mat-')) {
        const v = el.type === 'checkbox' ? el.checked : el.value;
        const data = { cabine: el.dataset.cabine, part: el.dataset.part };
        setTimeout(() => this.appliquerMateriel(champ, v, data), 0);
        return;
      }
      const a = this.state.ateliers.find(x => x.id === id); if (!a) return;
      const v = el.value;
      setTimeout(() => this.appliquerSaisie(champ, a, el, v), 0);
    }

    appliquerMateriel(champ, v, data) {
      this.changer(() => {
        const m = this.state.materiel;
        if (champ === 'mat-actif') m.actif = !!v;
        if (champ === 'mat-unite') {
          const { cabine } = data || {};
          if (m.unites[cabine]) m.unites[cabine].parVol = Math.max(0, parseFloat(v) || 0);
        }
        if (champ === 'mat-stock') m.stockInitial = Math.max(0, parseInt(v, 10) || 0);
        if (champ === 'mat-delai') m.delaiRetour = Math.max(0, parseInt(v, 10) || 0);
        if (champ === 'mat-retours' && P.SOURCES_RETOURS.includes(v)) m.retours = v;
      }, champ === 'mat-retours'
        ? (v === 'j1' ? 'Retours : le lendemain du départ, à la même heure.' : v === 'planche' ? 'Retours : la planche retour du handling.' : 'Retours : les lignes retour du programme de vols.')
        : champ === 'mat-actif'
        ? (v ? 'Le compte du matériel est tenu : déclarez la plonge et les équipes qui en emportent.'
             : 'Compte du matériel abandonné.')
        : 'Enregistré.');
    }

    appliquerSaisie(champ, a, el, v) {
      this.changer(() => {
        switch (champ) {
          case 'nom': {
            // Le nom est la clé des classeurs Excel : deux cases ne le partagent pas.
            const pris = this.state.ateliers.some(x => x !== a && String(x.nom).trim().toUpperCase() === String(v).trim().toUpperCase());
            if (pris) throw new Error('le nom « ' + v + ' » est déjà celui d’une autre case (le nom sert de clé dans Excel).');
            a.nom = v; break;
          }
          // Les man-minutes d'une commande dans cette case ; vide = celles de l'import.
          case 'minutes': {
            const cls = el.dataset.classe, m = { ...(a.minutes || {}) };
            if (v === '' || !Number.isFinite(+v)) delete m[cls]; else m[cls] = Math.max(0, +v);
            if (Object.keys(m).length) a.minutes = m; else delete a.minutes;
            break;
          }
          case 'service': {
            // Un nom par défaut (« Cuisine TX BC ») suit le service ; un nom choisi reste.
            const nomDe = id => (this.a.services().find(x => x.id === id) || {}).nom || id;
            const ancien = nomDe(a.service);
            if (a.nom === ancien || a.nom.startsWith(ancien + ' ')) a.nom = PC.nomLibre(this.state, nomDe(v) + a.nom.slice(ancien.length));
            a.service = v; break;
          }
          case 'debut': a.debut = v; break;
          case 'jour': a.jour = a.type === 'handling' ? 0 : a.type === 'lavage' ? Math.max(-1, Math.min(1, parseInt(v, 10) || 0)) : Math.min(0, parseInt(v, 10) || 0); break;
          case 'personnes': a.personnes = Math.max(0, parseInt(v, 10) || 0); delete a.personnesSaisies; break;
          case 'debit': a.debit = Math.max(1, parseFloat(v) || 1); break;
          // Le débit d'une commande sur ce robot ; vide = celui du robot.
          case 'debit-cmd': {
            const cls = el.dataset.classe, d = { ...(a.debits || {}) };
            if (v === '' || !(+v > 0)) delete d[cls]; else d[cls] = +v;
            if (Object.keys(d).length) a.debits = d; else delete a.debits;
            break;
          }
          case 'personnesMin': a.personnesMin = Math.max(0, parseInt(v, 10) || 0); break;
          case 'type': typer(a, v); break;
          case 'consomme': a.materiel = el.checked ? 'consomme' : undefined; break;
          // Fait aussi l'étape d'avant, à la chaîne : ses commandes quittent les
          // cases de cette étape — la case les fait désormais (« fusion des 2 cases »).
          case 'fusion': {
            if (!v) { delete a.fusion; break; }
            a.fusion = v;
            const miennes = new Set(a.lots.flat());
            for (const x of this.state.ateliers) {
              if (x === a || x.service !== v || !(x.type === 'manuel' || x.type === 'robot')) continue;
              x.lots = x.lots.map(l => l.filter(c => !miennes.has(c))).filter(l => l.length);
            }
            break;
          }
          case 'cond-cie': if (a.condition) a.condition.cie = v || '*'; break;
          case 'cond-seuil': if (a.condition) a.condition.seuil = Math.max(1, parseInt(v, 10) || 1); break;
          case 'cond-mesure': if (a.condition) a.condition.mesure = v === 'repas' ? 'repas' : 'vols'; break;
          case 'cond-sinon': if (a.condition) a.condition.sinon = v; break;
          case 'cond-renfort': if (a.condition) {
            delete a.condition.renfort; delete a.condition.absorbe;
            if (v === '-') a.condition.absorbe = true; else if (v) a.condition.renfort = v;
          } break;
          case 'tunnel-nom': a.tunnels[+el.dataset.index].nom = v; break;
          case 'tunnel-debit': a.tunnels[+el.dataset.index].debit = Math.max(0, parseFloat(v) || 0); break;
          case 'tunnel-actif': a.tunnels[+el.dataset.index].actif = el.checked; break;
          case 'tunnel-personnes': a.tunnels[+el.dataset.index].personnes = Math.max(0, parseInt(v, 10) || 0); break;
          case 'tunnel-vitesse': {
            const x = parseFloat(String(v).replace(',', '.'));
            if (Number.isFinite(x) && x > 0 && x !== 1) a.tunnels[+el.dataset.index].vitesse = Math.min(10, x); else delete a.tunnels[+el.dataset.index].vitesse;
            break;
          }
          case 'plafond': a.plafond = Math.max(0, parseFloat(v) || 0); break;
          case 'permanent': a.permanent = el.checked; if (!el.checked) delete a.ouverture; break;
          // Quand elle sert : toujours, aux heures d'ouverture (une boutique), ou par vagues.
          case 'mode-dispo':
            if (v === 'vagues') { a.permanent = false; delete a.ouverture; }
            else { a.permanent = true; if (v === 'boutique') a.ouverture = a.ouverture || { de: '07:00', a: '18:00' }; else delete a.ouverture; }
            break;
          case 'ouverture-de': a.ouverture = { ...(a.ouverture || { a: '18:00' }), de: v }; break;
          case 'ouverture-a': a.ouverture = { ...(a.ouverture || { de: '07:00' }), a: v }; break;
          // Les vagues d'une mise à disposition : l'heure et le jour de chacune.
          case 'vague-debut': a.vagues[+el.dataset.index].debut = v; break;
          case 'vague-jour': a.vagues[+el.dataset.index].jour = parseInt(v, 10) || 0; break;
          case 'simultanes': a.simultanes = Math.max(1, Math.min(50, parseInt(v, 10) || 1)); break;
          // Saisi en heures, gardé en minutes.
          case 'avance': a.avance = Math.max(0, Math.min(1440, Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 60))); break;
          case 'compagnies': a.compagnies = [...new Set(String(v).split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean))].slice(0, 100); break;
          case 'effectif': this.regleEffectifEquipe(a, v); break;
          case 'appui-min': {
            const cie = el.dataset.cie, d = { ...(a.minutesVol || {}) };
            if (v === '' || !Number.isFinite(+v)) delete d[cie]; else d[cie] = Math.max(0, Math.min(1440, +v));
            a.minutesVol = d; break;
          }
          case 'duree': {
            const cie = el.dataset.cie, d = { ...(a.durees || {}) };
            if (v === '' || !Number.isFinite(+v)) { if (cie !== P.TOUTES) delete d[cie]; } else d[cie] = Math.max(0, Math.min(1440, +v));
            a.durees = d; break;
          }
          // Le handling : long ou court courrier, chauffeurs par vol, créneaux.
          case 'categorie': {
            const l = new Set(a.longs || []); if (v === 'long') l.add(el.dataset.cie); else l.delete(el.dataset.cie);
            a.longs = [...l].sort(); break;
          }
          case 'chauffeurs-long': a.chauffeurs = { ...(a.chauffeurs || {}), long: Math.max(1, parseInt(v, 10) || 1) }; break;
          case 'chauffeurs-court': a.chauffeurs = { ...(a.chauffeurs || {}), court: Math.max(1, parseInt(v, 10) || 1) }; break;
          case 'camions': a.camions = Math.max(0, parseInt(v, 10) || 0); break;
          case 'temps': {
            const m = el.dataset.map, cie = el.dataset.cie, d = { ...(a[m] || {}) };
            if (v === '' || !Number.isFinite(+v)) delete d[cie];
            else d[cie] = m === 'volsCamion' ? Math.max(1, Math.min(10, Math.round(+v))) : Math.max(0, Math.min(1440, +v));
            a[m] = d;
            // « Toutes les compagnies » : c'est aussi le nombre de vols par camion du handling.
            if (m === 'volsCamion' && cie === P.TOUTES) { a.volsParCamion = d[cie] || 1; delete d[cie]; }
            break;
          }
          case 'creneau-de': a.creneaux[+el.dataset.index].de = v; break;
          case 'creneau-a': a.creneaux[+el.dataset.index].a = v; break;
          case 'creneau-n': a.creneaux[+el.dataset.index].n = Math.max(0, parseInt(v, 10) || 0); break;
          // La plonge : par vol, ou par débit.
          case 'plonge-mode':
            if (v === 'vol') { a.parVol = true; if (!a.durees || !Object.keys(a.durees).length) a.durees = { [P.TOUTES]: 30 }; }
            else { delete a.parVol; delete a.durees; }
            break;
          // Une compagnie absente des vols du jour : sa ligne, au temps de toutes.
          case 'cie-nouvelle': {
            const cie = String(v).trim().toUpperCase().slice(0, 40); if (!cie) break;
            a.durees = { ...(a.durees || {}), [cie]: (a.durees || {})[cie] ?? (a.durees || {})[P.TOUTES] ?? 30 };
            break;
          }
          case 'duree-nouvelle':
            if (v) a.durees = { ...(a.durees || {}), [v]: (a.durees || {})[P.TOUTES] ?? 30 };
            el.value = '';
            break;
          case 'regime': a.regime = { ...a.regime, actif: el.checked }; break;
          case 'presence': {
            // Vider le champ, c'est revenir au réglage général.
            const n = parseInt(v, 10);
            const suite = { ...a.regime }; delete suite.presence;
            if (Number.isFinite(n)) suite.presence = Math.max(30, n);
            a.regime = suite;
            break;
          }

          case 'lot-ajout': {
            const i = +el.dataset.index;
            if (v && !a.lots[i].includes(v)) a.lots[i].push(v);
            break;
          }
          // Ajouter une fabrication en un seul geste : la ligne naît remplie.
          // En deux temps — créer une ligne vide, puis la garnir — on ne
          // comprenait pas à quoi servait la ligne.
          case 'lot-nouveau':
            if (v && !a.lots.some(l => l.includes(v))) a.lots.push([v]);
            el.value = '';
            break;
          case 'arret-ligne-de': case 'arret-ligne-a': {
            const arr = (a.arretsLigne || []).map(y => ({ ...y })), i = +el.dataset.index;
            if (!arr[i]) break;
            arr[i][champ === 'arret-ligne-de' ? 'de' : 'a'] = v;
            for (const x of this.robotsDeLigne(a)) x.arretsLigne = arr.map(y => ({ ...y }));
            break;
          }
          // Un second robot : sa propre ligne, ses propres arrêts.
          case 'ligne-propre':
            if (el.checked) a.lignePropre = true;
            else { delete a.lignePropre; const autre = this.robotsDeLigne(a).find(x => x !== a && x.arretsLigne); if (autre) a.arretsLigne = autre.arretsLigne.map(y => ({ ...y })); }
            break;
          case 'pause-de': a.pauses[+el.dataset.index].de = v; break;
          case 'pause-a':  a.pauses[+el.dataset.index].a = v; break;
        }
      }, 'Enregistré.');
    }

    /* Retirer une compagnie × classe, c'est aussi couper tous les liens que les
     * ateliers avaient avec elle : sinon ils désigneraient un identifiant qui
     * n'existe plus, et le modèle refuserait de tourner. Un lot vidé de sa
     * dernière classe disparaît avec elle. */
    supprimerClasse(id) {
      const ajoutee = (this.state.ajoutees || []).some(c => P.idClasse(c.cie, c.cabine) === id);
      // Le message se construit AVANT le changement : les arguments d'un appel
      // sont évalués d'abord, compter pendant la modification ne dirait rien.
      const touches = this.state.ateliers.filter(a => a.lots.some(l => l.includes(id)));
      const lots = touches.reduce((n, a) => n + a.lots.filter(l => l.includes(id)).length, 0);
      const vides = touches.reduce((n, a) => n + a.lots.filter(l => l.length === 1 && l[0] === id).length, 0);
      const message = lots
        ? id + ' retirée — ' + lots + (lots > 1 ? ' préparations chez ' : ' préparation chez ') + touches.map(a => a.nom).join(', ')
            + (vides ? ', dont ' + vides + (vides > 1 ? ' vidées et supprimées' : ' vidée et supprimée') : '') + '.'
        : id + ' retirée : aucune équipe ne la préparait.';
      this.changer(() => {
        for (const a of this.state.ateliers) {
          const restants = [];
          for (const l of a.lots) {
            if (!l.includes(id)) { restants.push(l); continue; }
            const reste = l.filter(c => c !== id);
            // Un lot vidé de sa dernière classe disparaît avec elle. Un lot
            // resté vide parce qu'on vient de le créer, lui, est conservé.
            if (reste.length) restants.push(reste);
          }
          a.lots = restants;
        }
        if (ajoutee) this.state.ajoutees = this.state.ajoutees.filter(c => P.idClasse(c.cie, c.cabine) !== id);
        else this.state.exclues = [...new Set([...(this.state.exclues || []), id])];
      }, message);
    }

    retablirClasse(id) {
      this.changer(() => { this.state.exclues = (this.state.exclues || []).filter(x => x !== id); },
        id + ' rétablie. Elle est à fabriquer de nouveau.');
    }

    ouvrirAjout(lieu) { this.ajout = { lieu: lieu || 'commandes' }; this.rendre(''); }

    /* Ajouter une compagnie, ou les classes qui lui manquent (retour d'usage :
     * « je ne peux plus rajouter de compagnie ni de compagnie × classe ») : une
     * compagnie, et ses classes cochées d'un coup. Le formulaire vit là où
     * l'on regarde les commandes : les chemins, et la page des commandes. */
    formAjout(lieu) {
      if (!this.ajout || this.ajout.lieu !== lieu)
        return `<button class="btn btn-sm at-ajout-ouvrir" data-at-action="classe-nouvelle" data-lieu="${esc(lieu)}">+ Ajouter une compagnie ou une classe</button>`;
      const cies = [...new Set(this.classes.map(c => c.cie))].sort();
      return `<div class="at-ajout" data-lieu="${esc(lieu)}">
        <label>Compagnie<input data-ajout="cie" maxlength="40" placeholder="Ex. EZY" list="at-ajout-cies-${esc(lieu)}" autocomplete="off"></label>
        <datalist id="at-ajout-cies-${esc(lieu)}">${cies.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        <fieldset class="at-ajout-cabs"><legend>Classes</legend>${P.CABINES.map(c => `<label class="chk chk-mini"><input type="checkbox" data-ajout-cab="${c}"
          ${c === 'YC' ? 'checked' : ''}> ${esc((P.NOM_CABINE || {})[c] || c)}</label>`).join('')}</fieldset>
        <div class="at-ajout-actions">
          <button class="btn btn-play btn-sm" data-at-action="classe-valider" data-lieu="${esc(lieu)}">Ajouter</button>
          <button class="btn btn-sm" data-at-action="classe-annuler">Annuler</button>
        </div>
        <p class="mini-note at-ajout-note">Une compagnie déjà là : cochez les classes qui lui manquent. Passagers, nombre de vols et
          heure viennent de l’<b>import des vols</b> ; une commande absente des vols reste ajoutée, sans volume, jusqu’au prochain import.</p>
      </div>`;
    }

    validerAjout(lieu) {
      const f = document.querySelector('.at-ajout[data-lieu="' + (lieu || 'commandes') + '"]'); if (!f) return;
      const cie = String((f.querySelector('[data-ajout=cie]') || {}).value || '').trim().toUpperCase();
      const cabs = [...f.querySelectorAll('[data-ajout-cab]:checked')].map(x => x.dataset.ajoutCab);
      if (!cie) return this.rendre('Nommez la compagnie.');
      if (!cabs.length) return this.rendre('Cochez au moins une classe.');
      const ids = cabs.map(c => P.idClasse(cie, c));
      const deja = ids.filter(id => this.classes.some(c => c.id === id));
      const nouvelles = cabs.filter(c => !deja.includes(P.idClasse(cie, c)));
      if (!nouvelles.length) return this.rendre(deja.map(P.libelleClasse).join(', ') + (deja.length > 1 ? ' existent' : ' existe') + ' déjà.');
      this.ajout = null;
      const libs = nouvelles.map(c => (P.NOM_CABINE || {})[c] || c);
      this.changer(() => {
        this.state.exclues = (this.state.exclues || []).filter(x => !ids.includes(x));
        this.state.ajoutees = [...(this.state.ajoutees || []), ...nouvelles.map(cabine => ({ cie, cabine }))];
      }, (nouvelles.length > 1 ? cie + ' : ' + libs.join(', ') + ' ajoutées.' : P.libelleClasse(P.idClasse(cie, nouvelles[0])) + ' ajouté.')
        + (deja.length ? ' (' + deja.map(P.libelleClasse).join(', ') + ' : déjà là.)' : '')
        + ' Donnez-leur un chemin ; leurs passagers viendront de l’import des vols.');
    }

    /* Le classeur Excel : c'est lui qu'on modifie hors du site, puis qu'on
     * réimporte. Le format est décrit dans sa feuille « Lisez-moi » et dans
     * docs/FORMATS_EXCEL.md. */
    exporter() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      const octets = T.ecrireClasseur(E.ateliersVersClasseur(this.state,
        { services: this.a.services(), classes: this.classes, resultat: this.resultat }));
      T.telecharger('ory-ateliers-' + new Date().toISOString().slice(0, 10) + '.xlsx', octets);
      this.rendre('Classeur exporté : modifiez-le dans Excel, puis « Importer ».');
    }

    /** Juste les heures de début : le fichier qu'on retouche le plus souvent. */
    exporterHoraires() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      if (!this.state.ateliers.length) return this.rendre('Aucune case encore : créez les chemins, les horaires suivront.');
      const octets = T.ecrireClasseur(E.horairesVersClasseur(this.state,
        { services: this.a.services(), resultat: this.resultat }));
      T.telecharger('ory-horaires-' + new Date().toISOString().slice(0, 10) + '.xlsx', octets);
      this.rendre('Horaires exportés : changez les heures dans Excel, puis « Importer ».');
    }

    async importer(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        let etat, ajouts = [];
        if (/\.json$/i.test(f.name)) {
          // L'ancien format d'échange reste lu : une sauvegarde d'hier s'ouvre.
          if (f.size > 4 * 1024 * 1024) throw new Error('Fichier trop grand.');
          etat = valider(JSON.parse(await f.text()));
          this.fondreDispos(etat); etat = valider(etat);
        } else {
          const E = root.OrlyEchanges, T = root.OrlyTableur;
          const feuilles = await T.lireFichier(f, 8 * 1024 * 1024);
          // Un classeur d'horaires seuls ne remplace rien : il décale des équipes.
          if (E.estClasseurHoraires(feuilles)) return this.importerHoraires(E.classeurVersHoraires(feuilles, this.state));
          const r = E.classeurVersAteliers(feuilles, this.state,
            { services: this.a.services(), programme: this.a.classes() || [] });
          etat = valider(r.etat); ajouts = r.ajouteesAuto;
          this.fondreDispos(etat); etat = valider(etat);
        }
        if (!confirm('Remplacer les cases et les chemins par ceux du fichier (' + etat.ateliers.length + (etat.ateliers.length > 1 ? ' cases' : ' case') + ') ? L’action est annulable.')) return;
        this.changer(() => { this.state = etat; }, 'Cases importées : ' + etat.ateliers.length + (etat.ateliers.length > 1 ? ' cases.' : ' case.')
          + (ajouts.length ? (ajouts.length > 1 ? ' Commandes ajoutées : ' : ' Commande ajoutée : ') + ajouts.join(', ') + '.' : ''));
      } catch (err) { this.rendre('Import refusé — ' + err.message); }
      finally { e.target.value = ''; }
    }

    importerHoraires({ etat, changes }) {
      if (!changes.length) return this.rendre('Horaires lus : aucune heure ne change.');
      const liste = changes.slice(0, 6).join(', ') + (changes.length > 6 ? '…' : '');
      if (!confirm('Changer l’heure de début de ' + changes.length + (changes.length > 1 ? ' cases' : ' case') + ' (' + liste + ') ? Rien d’autre ne change. L’action est annulable.')) return;
      this.changer(() => { this.state = valider(etat); },
        'Horaires importés : ' + changes.length + (changes.length > 1 ? ' cases décalées' : ' case décalée') + ' (' + liste + ').');
    }

    /* ---- rendu ------------------------------------------------------- */

    rendre(message) {
      if (message !== undefined) PC.annoncer(message || '');
      const r = this.calculer();
      this.rendreIndicateurs(r);
      this.rendreAnomalies(r);
      this.rendreMateriel(r);
      this.rendreFiltre();
      // Seul l'onglet affiché se redessine : à deux cents commandes, la liste
      // des cases, le planning, les commandes et le tableau coûtent cher, et
      // personne ne les regarde. Les autres attendent qu'on les ouvre.
      this.aDessiner = new Set(['at-equipes', 'at-planning', 'at-repas', 'at-grille', 'at-recap']);
      const visible = this.ongletVisible();
      if (visible !== 'at-grille') this.parcours.rendre();
      this.surOnglet(visible);
      for (const id of ['at-undo', 'rc-undo']) document.getElementById(id).disabled = !this.undo.length;
      for (const id of ['at-redo', 'rc-redo']) document.getElementById(id).disabled = !this.redo.length;
      if (this.a.change) this.a.change(r);
    }

    /** L'onglet affiché de la vue, ou rien quand la vue est cachée. */
    ongletVisible() {
      const b = document.body;
      return b.dataset.vue === 'ateliers' ? b.dataset.sous || null : null;
    }

    /** Un onglet s'ouvre : on dessine ce qu'il montre, s'il a changé depuis. */
    surOnglet(id) {
      const r = this.resultat; if (!r || !this.aDessiner) return;
      // Le tableau a pu être remplacé par sa place vide en redessinant les chemins.
      if (id === 'at-grille' && document.querySelector('#at-parcours .qf[data-a-dessiner]')) this.aDessiner.add(id);
      if (!this.aDessiner.has(id)) return;
      this.aDessiner.delete(id);
      if (id === 'at-equipes') this.rendreListe(r);
      if (id === 'at-planning') this.rendrePlanning(r);
      if (id === 'at-repas') this.rendreClasses(r);
      if (id === 'at-recap') this.rendreRecapCases(r);
      if (id === 'at-grille') this.parcours.rendre();
    }

    /* Les indicateurs vivent à un seul endroit, « La journée › Les chiffres ».
     * Ici, une phrase les résume, avec les mêmes mots et le même moment
     * (la journée entière), et un lien y mène. */
    rendreIndicateurs(r) {
      const i = r.indicateurs || {};
      const pl = (n, s, p) => n + ' ' + (n > 1 ? p : s);
      const box = document.getElementById('at-indicateurs');
      if (!r.ok || !i.classesSuivies && !i.classesAbsentes) { box.innerHTML = ''; return; }
      const retard = i.enRetard ?? ((i.classesSuivies || 0) - (i.aHeure || 0)), pasFinies = i.pasFinies || 0;
      box.innerHTML = '<p class="at-resume"><b>Sur la journée :</b> '
        + pl(i.aHeure || 0, 'commande prête', 'commandes prêtes') + ' à l’heure sur ' + (i.classesSuivies || 0)
        + (retard ? ' · <span class="at-resume-retard">' + pl(retard, 'en retard', 'en retard') + '</span>' : '')
        + (pasFinies ? ' · <span class="at-resume-retard">' + pl(pasFinies, 'pas finie', 'pas finies') + '</span>' : '')
        + (i.classesAbsentes ? ' · ' + pl(i.classesAbsentes, 'commande', 'commandes') + ' sans équipe' : '')
        + (Number.isFinite(i.finDerniere) ? ' · dernière prête à ' + P.hhmm(i.finDerniere) : '')
        + (i.volsSuivis ? ' · <b>' + pl(i.volsAHeure, 'vol chargé', 'vols chargés') + ' à l’heure sur ' + i.volsSuivis + '</b>'
          + (i.volsSuivis - i.volsCharges ? ' · <span class="at-resume-retard">' + pl(i.volsSuivis - i.volsCharges, 'vol non chargé', 'vols non chargés') + '</span>' : '') : '')
        + ' <button class="lien-discret" data-aller="plan" data-onglet="j-chiffres">Les chiffres de la journée →</button></p>';
    }

    rendreAnomalies(r) {
      const box = document.getElementById('at-anomalies');
      // Une étape de parcours sans équipe se lit mieux dans le tableau « Qui
      // fabrique quoi » (ses cases « à choisir ») qu'en une phrase par service.
      const fantomes = this.a.fantomes ? this.a.fantomes() : [];
      const nomSv = id => ((this.a.services().find(x => x.id === id) || fantomes.find(x => x.id === id)) || {}).nom || id;
      const trous = (r.anomalies || []).filter(a => a.code === 'parcours-trou');
      const list = (r.anomalies || []).filter(a => a.code !== 'parcours-trou').map(a => esc(a.message));
      if (trous.length) {
        // Des commandes déjà commencées dont une étape n'a personne : elle est
        // sautée. Ce n'est pas le compte des cases vides du tableau (celles
        // des commandes pas encore commencées) : on le dit autrement.
        const cmd = new Set(trous.flatMap(a => a.classes || [])).size;
        list.push((cmd > 1 ? cmd + ' commandes commencées sautent' : '1 commande commencée saute') + ' une étape sans équipe ('
          + trous.map(a => esc(nomSv(a.service))).join(', ') + ') : à compléter dans Équipes › Services et équipes (cochez-les dans une équipe) ; « Étapes de chaque commande », dans Résultats, montre les étapes sautées.');
      }
      // Un service supprimé que des cases ou des chemins citent encore : il fait
      // des alertes, et aucune liste ne le montre. Le geste qui l'efface est ici.
      for (const f of fantomes) {
        list.unshift('<b>« ' + esc(f.nom) + ' » n’existe plus dans l’unité</b>, mais '
          + [f.cases ? f.cases + (f.cases > 1 ? ' cases' : ' case') : '', f.chemins ? f.chemins + (f.chemins > 1 ? ' chemins' : ' chemin') : ''].filter(Boolean).join(' et ')
          + (f.cases + f.chemins > 1 ? ' y passent' : ' y passe') + ' encore. '
          + '<button class="btn btn-sm svc-danger" data-at-action="fantome-effacer" data-service="' + esc(f.id) + '">Effacer partout</button> '
          + '<button class="lien-discret" data-page="u-services">Ou le remplacer, dans Équipes › Liste des services →</button>');
      }
      // Des cases de handling d'avant (une par commande) : le handling travaille
      // désormais par vol. On le dit en tête, avec le geste qui convertit.
      const vieilles = this.anciensHandlings();
      if (vieilles.length) list.unshift('<b>Handling : ' + vieilles.length + (vieilles.length > 1 ? ' cases le préparent' : ' case le prépare')
        + ' commande par commande (ancienne logique).</b> Le handling travaille par vol : il réunit les classes de chaque vol et le charge, le jour J. '
        + '<button class="btn btn-sm btn-play" data-at-action="handling-convertir">Passer au handling par vol</button>');
      const dispos = PC.anciensDispos(this.state);
      if (dispos.length) {
        const noms = [...new Set(dispos.map(a => (this.a.services().find(x => x.id === a.service) || {}).nom || a.service))];
        list.unshift('<b>' + esc(noms.join(', ')) + ' : ' + dispos.length + (dispos.length > 1 ? ' cases préparent' : ' case prépare')
          + ' commande par commande.</b> Ces postes travaillent pour toutes les commandes à la fois, par vagues : '
          + (dispos.length > 1 ? 'elles deviennent' : 'elle devient') + ' une seule case par poste, et leurs heures de début deviennent ses vagues. '
          + '<button class="btn btn-sm btn-play" data-at-action="dispo-partager">Passer à une case partagée</button>');
      }
      // Un service qui prépare commande par commande (la cuisine…) remplacé par
      // une mise à disposition : on propose de lui rendre une case par commande.
      const remplaces = [...new Set(this.state.ateliers.filter(a => a.type === 'dispo' && !PC.SERVICES_DISPO.includes(a.service)).map(a => a.service))]
        .filter(sv => (r.classes || []).filter(c => (c.vols || []).length).some(c => {
          const p = PC.fluxDe(this.state, c);
          return p && P.servicesDuParcours(p).includes(sv);
        }));
      for (const sv of remplaces) {
        const nomSv = (this.a.services().find(x => x.id === sv) || {}).nom || sv;
        list.unshift('<b>« ' + esc(nomSv) + ' » est une mise à disposition</b> : elle sert toutes les commandes à la fois, comme la légumerie. '
          + 'Si ce service prépare commande par commande, rendez-lui une case par commande. '
          + '<button class="btn btn-sm btn-play" data-at-action="separer" data-service="' + esc(sv) + '">Une case par commande dans ' + esc(nomSv) + '</button>');
      }
      // La légumerie, le magasin, la réception par vagues : ce sont plutôt des
      // boutiques, ouvertes de telle à telle heure (retour d'usage du 28/09).
      const parVagues = this.state.ateliers.filter(a => a.type === 'dispo' && a.permanent === false && PC.SERVICES_DISPO.includes(a.service));
      if (parVagues.length) {
        list.push('<b>' + esc(parVagues.map(a => a.nom).join(', ')) + (parVagues.length > 1 ? ' servent' : ' sert') + ' par vagues.</b> '
          + 'Ouverts de telle à telle heure, comme une boutique, ils servent à l’instant où l’on vient ; fermés, l’étape d’après attend l’ouverture. '
          + '<button class="btn btn-sm btn-play" data-at-action="boutiques">Ouvrir comme des boutiques, de 07:00 à 18:00</button> '
          + '<span class="mini-note">(les heures se changent ensuite dans chaque case, ou dans le récap des cases)</span>');
      }
      let copie = null;
      try { copie = JSON.parse(localStorage.getItem(CLE + '-avant-fonte') || 'null'); } catch (e) { copie = null; }
      if (copie && copie.etat) {
        list.push('Une copie de l’organisation d’avant la fusion (légumerie, magasin…) est gardée dans ce navigateur. '
          + '<button class="btn btn-sm" data-at-action="avant-fonte">Revenir à l’organisation d’avant la fusion</button> '
          + '<button class="lien-discret" data-at-action="oublier-copie">Oublier cette copie</button>');
      }
      box.hidden = !list.length;
      if (vieilles.length || dispos.length || remplaces.length || fantomes.length) box.open = true;
      // Replié par défaut : le nombre suffit à savoir qu'il y a à faire.
      box.innerHTML = list.length
        ? '<summary><strong>' + list.length + (list.length > 1 ? ' points' : ' point') + ' à regarder</strong></summary><ul>' +
          list.map(m => '<li>' + m + '</li>').join('') + '</ul>'
        : '';
    }

    rendreFiltre() {
      const sel = document.getElementById('at-filtre');
      sel.innerHTML = '<option value="">Tous les services</option>' +
        this.a.services().map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('');
      sel.value = this.filtre || '';
    }

    /* Les trolleys et la porcelaine ne s'achètent pas : ils reviennent. Ce bloc
     * dit ce que la boucle a fait de la journée. */
    rendreMateriel(r) {
      const m = this.state.materiel, bilan = r && r.materiel;
      const chiffre = (lab, val, note) =>
        `<div class="at-mat-chiffre"><span>${esc(lab)}</span><b>${esc(String(val))}</b>${note ? '<em>' + esc(note) + '</em>' : ''}</div>`;
      // Les retours et la boucle du matériel sont des réglages de la simulation :
      // ils vivent dans « Simulation › Réglages de la simulation » (retour d'usage du 29/09).
      const boite = document.getElementById('rg-sim-materiel') || document.getElementById('at-materiel');
      if (!boite) return;
      const src = P.sourceRetours(m), n = (m.planche || []).length;
      const retours = `<div class="at-retours">
  <h3>Retours des vols à la plonge</h3>
  <label class="at-mode-dispo">D’où viennent les retours ?<select data-at-champ="mat-retours">
    <option value="j1" ${src === 'j1' ? 'selected' : ''}>Automatiques : le lendemain du départ, J+1 (même heure)</option>
    <option value="planche" ${src === 'planche' ? 'selected' : ''}>La planche retour du handling</option>
    <option value="programme" ${src === 'programme' ? 'selected' : ''}>Les lignes « retour » du programme de vols</option></select></label>
  <p class="mini-note">${src === 'j1' ? 'Le programme se répète d’un jour à l’autre : le matériel des vols partis la veille revient aujourd’hui à l’heure de leur départ (+ 24 h), plus le délai après atterrissage. Autant de retours que de départs.'
    : src === 'planche' ? `Chaque ligne de la planche dit quand le vol revient à l’unité (sans délai ajouté). <b>${n} ligne${n > 1 ? 's' : ''}</b>
      <button class="lien-discret" data-page="v-planche">Ouvrir la planche retour (Données) →</button>`
    : 'Les vols « RET » du programme importé, à leur heure d’arrivée, plus le délai après atterrissage.'}</p>
  <p class="mini-note at-retours-comparer">Pour choisir en connaissance de cause :
    <button class="btn btn-sm" data-comparer-retours ${n ? '' : 'disabled title="Saisissez d’abord la planche retour (Vols › Planche retour)"'}>⇄ Comparer J+1 et planche retour</button></p>
  <label class="at-inline-champ">Délai après atterrissage (min)<input type="number" min="0" value="${m.delaiRetour}" data-at-champ="mat-delai"
    ${src === 'planche' ? 'disabled title="La planche donne déjà l’heure d’arrivée à l’unité"' : ''}></label>
</div>`;
      // La case qui active le compte ne doit pas être enfermée dans le bloc
      // qu'elle ouvre : elle reste visible, le reste suit.
      boite.innerHTML = retours + `
<section class="at-mat">
  <label class="chk chk-mini at-mat-tete"><input type="checkbox" data-at-champ="mat-actif" ${m.actif ? 'checked' : ''}>
    <span><strong>Matériel en boucle</strong> — ce qui part revient.<details class="aide">
      <summary aria-label="Comment la boucle du matériel fonctionne">?</summary>
      <span class="aide-corps">Un départ l’emporte, un retour le ramène sale, la plonge le rend
        propre, un départ le remporte. Un seul compte pour tout le matériel, non calibré : un
        trolley de CRL et un trolley d’AF ne s’y distinguent pas.</span></details></span></label>
  ${m.actif ? `<div class="at-mat-champs">
    <label>Propre à l'ouverture<input type="number" min="0" value="${m.stockInitial}" data-at-champ="mat-stock"></label>
  </div>
  <div class="mini-note">Ce qu’un vol emporte, classe par classe présente à bord.<details class="aide">
    <summary aria-label="Pourquoi par vol ?">?</summary>
    <span class="aide-corps">Un trolley part avec l’avion : sa quantité ne bouge pas parce que la
      cabine est à moitié vide. Un vol retour ramène la même quantité, classe par classe.</span></details></div>
  <table class="at-mat-table"><thead><tr><th scope="col">Classe</th>
    <th scope="col">unités / vol</th></tr></thead><tbody>
    ${P.CABINES.map(c => `<tr><th scope="row" title="${esc((P.NOM_CABINE || {})[c] || c)}">${c}</th>
      <td><input type="number" min="0" step="1"
        value="${(m.unites[c] || {}).parVol || 0}" data-at-champ="mat-unite"
        data-cabine="${c}" data-part="parVol" aria-label="${c} : unités par vol"></td>
    </tr>`).join('')}
  </tbody></table>` : ''}
  ${m.actif && bilan ? `<div class="at-mat-bilan">
    ${chiffre('Revenu des vols', bilan.entrees + ' u')}
    ${chiffre('Lavé', bilan.lavees + ' u', bilan.resteSale ? bilan.resteSale + ' u sales non lavées' : '')}
    ${chiffre('Emporté', bilan.consommees + ' u')}
    ${chiffre('Reste propre', bilan.restePropre + ' u', bilan.restePropre ? 'disponible demain' : 'aucun amortisseur')}
    ${chiffre('Plus bas niveau', bilan.minPropre + ' u', bilan.minPropre === 0 ? 'passé par zéro' : '')}
    ${chiffre('Attente de matériel', Math.round(bilan.attente) + ' min', bilan.enAttente ? bilan.enAttente + (bilan.enAttente > 1 ? ' préparations jamais servies' : ' préparation jamais servie') : '')}
  </div>` : ''}
</section>`;
    }

    /* La liste des cases, calculée : chacune dit ses commandes dans l'ordre ;
     * une commande mène à son chemin, où la case se règle. */
    rendreListe(r) {
      const services = this.a.services();
      const nom = id => (services.find(s => s.id === id) || {}).nom || id;
      const parAtelier = new Map(((r && r.ateliers) || []).map(a => [a.id, a]));
      const montrer = this.filtre ? this.state.ateliers.filter(a => a.service === this.filtre) : this.state.ateliers;
      const box = document.getElementById('at-liste');
      if (!montrer.length) {
        box.innerHTML = '<p class="at-vide">Aucune case' + (this.filtre ? ' dans ' + esc(nom(this.filtre)) : '')
          + '. Les cases se créent dans Équipes › Services et équipes, ou dans « Une commande » : choisissez une commande, puis cliquez un service de son chemin.'
          + ' <button class="lien-discret" data-aller="ateliers" data-onglet="at-chemins">Ouvrir « Une commande » →</button></p>';
        return;
      }
      const groupes = {};
      for (const a of montrer) (groupes[a.service] || (groupes[a.service] = [])).push(a);
      const rang = s => services.findIndex(x => x.id === s);
      const I = root.OrlyIcones;
      box.innerHTML = Object.keys(groupes).sort((x, y) => rang(x) - rang(y)).map(service => {
        const cartes = groupes[service].map(a => this.carte(a, parAtelier.get(a.id))).join('');
        return `<section class="at-service"><h3><span class="at-service-nom">${I ? I.ico(I.icoService(service, nom(service))) : ''}${esc(nom(service))}</span>
          <span>${groupes[service].length}</span></h3>${cartes}</section>`;
      }).join('');
    }

    /* Une case. Dans la liste : son résumé, et ses commandes qui mènent à leur
     * chemin. Dans un chemin (`o.cmd`, la commande qu'on y regarde) : sa fiche
     * complète, ouverte. */
    carte(a, calcul, o = {}) {
      const dansChemin = o.cmd !== undefined;
      const ouvert = dansChemin || this.ouvert === a.id;
      const dispo = a.type === 'dispo';
      const fin = calcul && calcul.fin != null ? P.hhmm(calcul.fin) : '—';
      const attente = calcul && calcul.attente ? ' · ' + Math.round(calcul.attente) + ' min d’attente' : '';
      const jour = a.jour ? ' (' + jourEcrit(a.jour) + (a.type === 'lavage' ? ' de l’arrivée' : '') + ')' : '';
      // Ses commandes dans l'ordre ; chacune ouvre son chemin sur cette case.
      const handling = a.type === 'handling';
      const nVols = handling && calcul ? calcul.lots.filter(l => l.vol).length : 0;
      const resume = dispo ? 'sert toutes les commandes à la fois'
        : a.type === 'lavage' ? 'lave pour toutes les commandes'
        : handling ? 'charge les vols dans l’ordre des départs' + (nVols ? ' · ' + nVols + ' vol' + (nVols > 1 ? 's' : '') : '')
        : a.type === 'appui' ? 'hors tunnel, hors flux : présente à ses heures, ne fait rien attendre'
        : !a.lots.length ? 'rattachée à aucune commande'
        : a.lots.map(l => l.map(c => `<button class="at-cmd-chip" data-at-action="chemin" data-classe="${esc(c)}"
            title="Ouvrir le chemin de ${esc(P.libelleClasse(c))}">${esc(PC.etiquette(c))}</button>`).join(' + ')).join(' <span aria-hidden="true">→</span> ');
      // Une mise à disposition n'a ni effectif ni heure de fin : son en-tête
      // dirait trois fois « — ». Elle dit ce qu'elle est.
      const sous = dispo
        ? (a.permanent === false ? (a.vagues.length > 1 ? a.vagues.length + ' vagues : ' : 'une vague : ')
            + a.vagues.map(v => (v.jour ? 'J' + v.jour + ' ' : '') + v.debut).map(esc).join(' · ')
          : a.ouverture ? 'ouvert de ' + esc(a.ouverture.de) + ' à ' + esc(a.ouverture.a) + ', chaque jour' : 'disponible en permanence')
          + (+a.personnes > 0 ? ' · ' + a.personnes + ' pers. sur la journée' : '')
        : esc(a.debut) + jour + (handling && (a.creneaux || []).length ? '' : ' · ' + a.personnes + ' pers.')
          + (a.type === 'robot' ? ' · robot ' + a.debit + ' pl/h' : a.type === 'lavage' ? (a.parVol ? ' · lave par vol' : ' · ' + P.debitLavage(a) + ' u/h')
            : handling ? ((a.creneaux || []).length ? ' · camion : ' + (a.chauffeurs || {}).long + ' chauffeurs en long courrier, ' + (a.chauffeurs || {}).court + ' en court · ' + (a.volsParCamion || 1) + ' vol' + ((a.volsParCamion || 1) > 1 ? 's' : '') + ' par camion' + (Object.keys(a.volsCamion || {}).length ? ' (sauf ' + Object.entries(a.volsCamion).map(([c, n]) => c + ' : ' + n).join(', ') + ')' : '')
              : ' · ' + a.simultanes + ' vol' + (a.simultanes > 1 ? 's' : '') + ' à la fois') : '')
          + ' → fin ' + esc(fin) + esc(attente);

      const entete = dansChemin
        ? `<div class="at-carte-tete"><div class="at-carte-nom fixe"><strong>Case « ${esc(a.nom)} »</strong><span>${sous}</span></div></div>`
        : `<div class="at-carte-tete">
        <button class="at-carte-nom" data-at-action="ouvrir" aria-expanded="${ouvert}" title="La régler dans le chemin d’une de ses commandes">
          <strong>${esc(a.nom)}</strong>
          <span>${sous}</span>
        </button>
        <span class="at-resume">${resume}</span>
      </div>`;

      if (!ouvert) return `<article class="at-carte" data-at="${esc(a.id)}">${entete}</article>`;

      const services = this.a.services();
      // Le régime de la maison, pour dire ce que suit un atelier qui ne fixe rien.
      const etatTunnels = P.tunnelsQuiTournent(a);
      const reg = P.normaliserRegime(undefined, (this.a.reglages ? this.a.reglages() : {}).regime);
      const defaut = { presence: reg.presence, seuils: reg.seuils, arret: reg.seuils.reduce((n, x) => n + x.duree, 0) };
      const restantes = i => this.classes.filter(c => !a.lots[i].includes(c.id));

      const libres = this.classes.filter(c => !a.lots.some(l => l.includes(c.id)));
      const optionsDe = liste => liste
        .map(c => `<option value="${esc(c.id)}">${esc(P.libelleClasse(c.id))} · ${c.vols.length} vol${c.vols.length > 1 ? 's' : ''}</option>`).join('');

      // Les man-minutes de chaque commande : celles de l'import, sauf si la case
      // en fixe d'autres (pour elle seule).
      const bareme = (this.a.reglages ? this.a.reglages() : {}).bareme;
      const importees = c => { const k = this.classes.find(x => x.id === c); return k ? Math.round(P.travailClasse(a.service, k, bareme) * 10) / 10 : 0; };
      const mm = c => {
        // Un poste qui ne dépend pas des vols n'a pas de minutes par vol (06/10).
        if (a.type === 'manuel' && !this.dependDesVols(a)) return '';
        const imp = importees(c), propre = (a.minutes || {})[c];
        return `<label class="at-mm" title="Man-minutes de ${esc(P.libelleClasse(c))} dans cette case, pour toute sa journée (tous ses vols). Vide : celles du barème (${imp}).">
          <input type="number" min="0" step="1" value="${propre ?? ''}" placeholder="${imp}" data-at-champ="minutes" data-classe="${esc(c)}"
            aria-label="Man-minutes de ${esc(P.libelleClasse(c))} dans cette case, pour la journée (barème : ${imp})"><span>min d’une personne / jour</span>${
          propre != null ? `<small class="at-mm-import">import ${imp}</small>` : ''}</label>`;
      };
      // Un robot : le débit de chaque commande, en plateaux par heure ; vide = celui du robot.
      const db = c => {
        const propre = (a.debits || {})[c];
        return `<label class="at-mm" title="Débit de ${esc(P.libelleClasse(c))} sur ce robot. Vide : celui du robot (${a.debit} pl/h).">
          <input type="number" min="1" step="10" value="${propre ?? ''}" placeholder="${a.debit}" data-at-champ="debit-cmd" data-classe="${esc(c)}"
            aria-label="Débit de ${esc(P.libelleClasse(c))} sur ce robot, en plateaux par heure (robot : ${a.debit})"><span>pl/h</span></label>`;
      };
      const lots = a.lots.map((l, i) => `
        <div class="at-lot${o.cmd && l.includes(o.cmd) ? ' ici' : ''}">
          <div class="at-lot-tete">
            <b>${i + 1}.</b>
            <span class="at-chips">${l.map(c => `<span class="at-lot-cmd"><button class="at-chip" data-at-action="classe-retirer" data-index="${i}" data-classe="${esc(c)}"
              title="Retirer ${esc(P.libelleClasse(c))} de cette case">${esc(P.libelleClasse(c))} ×</button>${a.type === 'manuel' ? mm(c) : a.type === 'robot' ? db(c) : ''}</span>`).join('') || '<em>à renseigner</em>'}</span>
            <span class="at-lot-fin">${esc(this.finLot(a.id, i))}</span>
            <button class="btn btn-sm" data-at-action="lot-monter" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Plus tôt">↑</button>
            <button class="btn btn-sm" data-at-action="lot-descendre" data-index="${i}" ${i === a.lots.length - 1 ? 'disabled' : ''} aria-label="Plus tard">↓</button>
            <button class="btn btn-sm" data-at-action="lot-retirer" data-index="${i}" aria-label="Retirer cette préparation">×</button>
          </div>
          <select class="at-lot-plus" data-at-champ="lot-ajout" data-index="${i}" aria-label="Préparer autre chose en même temps que la ligne ${i + 1}">
            <option value="">+ préparer en même temps…</option>
            ${optionsDe(restantes(i))}
          </select>
        </div>`).join('');

      const pauses = a.pauses.map((p, i) => `
        <div class="at-pause">
          <input type="time" value="${esc(p.de)}" data-at-champ="pause-de" data-index="${i}" aria-label="Début de pause">
          <input type="time" value="${esc(p.a)}" data-at-champ="pause-a" data-index="${i}" aria-label="Fin de pause">
          <button class="btn btn-sm" data-at-action="pause-retirer" data-index="${i}">Retirer</button>
        </div>`).join('');

      return `<article class="at-carte ouverte" data-at="${esc(a.id)}">${entete}
        <div class="at-champs">
          ${o.compact ? '' : `<label>Nom<input value="${esc(a.nom)}" data-at-champ="nom" maxlength="160"></label>`}
          ${o.compact ? '' : `<label>Service<select data-at-champ="service">${services.map(s => `<option value="${esc(s.id)}" ${s.id === a.service ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
          <label>Type<select data-at-champ="type">
            <option value="manuel" ${a.type === 'manuel' ? 'selected' : ''}>Équipe qui prépare</option>
            <option value="robot" ${a.type === 'robot' ? 'selected' : ''}>Robot</option>
            <option value="lavage" ${a.type === 'lavage' ? 'selected' : ''}>Lavage (plonge)</option>
            <option value="dispo" ${dispo ? 'selected' : ''}>Mise à disposition</option>
            <option value="handling" ${handling ? 'selected' : ''}>Handling (par vol)</option>
            <option value="appui" ${a.type === 'appui' ? 'selected' : ''}>Hors tunnel, hors flux (ne fait rien attendre)</option></select></label>`}
          ${dispo || o.compact ? '' : `
          <label>Arrive à<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          ${handling ? `<label>Jour<input value="Jour J des vols" disabled title="Le handling travaille le jour des vols, jamais la veille"></label>`
            : a.type === 'lavage' || (a.type === 'appui' && this.serviceLave(a.service)) ? `<label title="La plonge lave ce qui revient : son jour se compte depuis l’arrivée des retours, pas depuis le départ des vols">Jour<select data-at-champ="jour">${JOURS_PLONGE.map(([j, n]) => `<option value="${j}" ${j === (a.jour || 0) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
            : `<label>Jour<select data-at-champ="jour">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === a.jour ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>`}
          ${handling && (a.creneaux || []).length ? '' : this.champPersonnes(a)}
          ${this.choixEffectifEquipe(a)}`}
          ${a.type === 'robot' ? `
          ${o.compact ? '' : `<label>Débit du robot (plateaux/h)<input type="number" min="1" value="${a.debit}" data-at-champ="debit"
            title="Le débit des commandes qui n’ont pas le leur (réglable à côté de chaque commande)"></label>`}
          <label title="Sous ce nombre de personnes, le robot ne tourne pas">Minimum pour tourner<input type="number" min="0" value="${a.personnesMin}" data-at-champ="personnesMin"></label>` : ''}
        </div>
        ${dispo ? `
        <p class="mini-note at-regle">Ce service <b>ne prépare pas une commande après l’autre</b> : il sert
          <b>toutes les commandes à la fois</b> (légumerie, magasin, réception…), comme une boutique où l’on vient se servir.
          Ni man-minutes, ni durée : des gens y travaillent, en nombre constant sur la journée.
          Sur chaque chemin, une seule question : « Besoin de ${esc((services.find(x => x.id === a.service) || {}).nom || a.service)} ? ».</p>
        <div class="at-cases">
          ${(() => { const mode = a.permanent === false ? 'vagues' : a.ouverture ? 'boutique' : 'toujours';
            return `<label class="at-mode-dispo">Quand sert-il ?<select data-at-champ="mode-dispo">
              <option value="boutique" ${mode === 'boutique' ? 'selected' : ''}>Ouvert tous les jours, de … à … (comme une boutique)</option>
              <option value="toujours" ${mode === 'toujours' ? 'selected' : ''}>Toujours ouvert — personne ne l’attend</option>
              <option value="vagues" ${mode === 'vagues' ? 'selected' : ''}>À heures fixes (vagues)</option></select></label>
            ${this.champPersonnesJournee(a)}
            ${mode === 'boutique' ? `<div class="at-pause at-ouverture">
              <label>Ouvre à<input type="time" value="${esc(a.ouverture.de)}" data-at-champ="ouverture-de"></label>
              <label>Ferme à<input type="time" value="${esc(a.ouverture.a)}" data-at-champ="ouverture-a"></label>
              <span class="mini-note">Chaque jour (J-1, J…). Ouvert : on est servi tout de suite. Fermé : l’étape d’après attend l’ouverture.</span></div>` : ''}
            ${mode === 'vagues' ? '<p class="mini-note">Chaque commande prend la vague qui précède son besoin ; avant la première, on l’attend.</p>' : ''}`; })()}
          ${a.permanent === false ? `<div class="at-sous-titre">Vagues</div>
          ${a.vagues.map((v, i) => `<div class="at-pause at-vague">
            <b>${i + 1}.</b>
            <label>À<input type="time" value="${esc(v.debut)}" data-at-champ="vague-debut" data-index="${i}"></label>
            <label>Jour<select data-at-champ="vague-jour" data-index="${i}">${[0, -1, -2, -3].map(j => `<option value="${j}" ${j === (v.jour || 0) ? 'selected' : ''}>${j === 0 ? 'Jour du départ' : 'J' + j}</option>`).join('')}</select></label>
            <span class="mini-note">${esc(this.servisParVague(a.id, i))}</span>
            ${a.vagues.length > 1 ? `<button class="btn btn-sm" data-at-action="vague-retirer" data-index="${i}">Retirer</button>` : ''}
          </div>`).join('')}
          <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="vague-ajouter">+ Vague</button></div>` : ''}
        </div>` : `
        ${a.type === 'manuel' ? (o.compact ? '' : this.blocFusion(a)) : a.type === 'robot' ? this.blocLigne(a) : ''}
        ${o.compact ? '' : this.blocCondition(a)}
        <div class="at-cases">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="regime" ${a.regime.actif ? 'checked' : ''}>
            Poste avec pauses — ${esc((defaut.seuils || []).map(s => dureeLue(s.duree) + ' après ' + dureeLue(s.apres) + ' de travail').join(', ') || 'aucune pause')}</label>
          ${a.regime.actif ? `<label class="at-presence">Présence (min)<input type="number" min="30" max="1440"
            value="${a.regime.presence ?? ''}" placeholder="${defaut.presence}" data-at-champ="presence"></label>
            <span class="mini-note">${a.regime.presence === undefined
              ? 'réglage général · ' + defaut.presence + ' min' : 'propre à cette équipe'}
              — soit ${String(Math.round(((a.regime.presence ?? defaut.presence) - defaut.arret) / 6) / 10).replace('.', ',')} h de travail</span>` : ''}
          ${a.type !== 'lavage' && !handling && this.state.materiel.actif ? `<label class="chk chk-mini"><input type="checkbox" data-at-champ="consomme"
            ${a.materiel === 'consomme' ? 'checked' : ''}>
            Emporte du matériel propre (trolleys, porcelaine)</label>` : ''}
        </div>`}

        ${dispo ? '' : handling ? this.ficheHandling(a) : a.type === 'appui' ? this.ficheAppui(a) : a.type === 'lavage' ? `
        <label class="at-mode-dispo at-mode-plonge">Comment se compte le lavage ?<select data-at-champ="plonge-mode">
          <option value="vol" ${a.parVol ? 'selected' : ''}>Par vol : un tunnel lave un vol en tant de minutes</option>
          <option value="debit" ${a.parVol ? '' : 'selected'}>Par débit : unités de matériel par heure</option></select></label>
        ${a.parVol ? this.fichePlongeParVol(a, etatTunnels) : `
        <div class="at-sous-titre">Tunnels de lavage
          <span class="mini-note">un débit par ligne, un plafond pour l’ensemble</span></div>
        ${a.tunnels.map((t, i) => `<div class="at-tunnel ${t.actif ? '' : 'arret'}${
          etatTunnels.sansPersonne.includes(t) ? ' sans-personne' : ''}">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="tunnel-actif" data-index="${i}" ${t.actif ? 'checked' : ''}>
            <span class="sr-only">${esc(t.nom)} en service</span></label>
          <input value="${esc(t.nom)}" data-at-champ="tunnel-nom" data-index="${i}" maxlength="80" aria-label="Nom du tunnel">
          <input type="number" min="0" step="10" value="${t.debit}" data-at-champ="tunnel-debit" data-index="${i}" aria-label="Débit en unités par heure">
          <span class="at-tunnel-unite">u/h</span>
          <label class="at-seuil" title="Le tunnel ne tourne que si l’équipe a au moins ce nombre de personnes pour lui (servis dans l’ordre de la liste)">Minimum pour tourner
            <input type="number" min="0" max="99" value="${t.personnes}" data-at-champ="tunnel-personnes" data-index="${i}" aria-label="Personnes minimum pour que ${esc(t.nom)} tourne"><span>pers.</span></label>
          <span class="at-tunnel-etat">${!t.actif ? 'à l’arrêt'
            : etatTunnels.sansPersonne.includes(t) ? 'à l’arrêt : pas assez de monde' : 'tourne'}</span>
          <button class="btn btn-sm" data-at-action="tunnel-retirer" data-index="${i}">Retirer</button>
        </div>`).join('')}
        <div class="at-actions-lot">
          <button class="btn btn-sm" data-at-action="tunnel-ajouter">+ Tunnel</button>
          <label class="at-plafond">Débit maximum de l’ensemble
            <input type="number" min="0" step="50" value="${a.plafond || ''}" placeholder="aucun plafond"
              data-at-champ="plafond" aria-label="Débit maximum de la plonge, toutes lignes confondues">
            <span class="at-tunnel-unite">u/h</span></label>
        </div>
        <div class="at-bilan-debit${etatTunnels.bride ? ' bride' : ''}">
          <span><em>Somme des tunnels qui tournent</em><b>${etatTunnels.somme}</b> u/h</span>
          <span><em>Plafond de l’ensemble</em><b>${a.plafond ? a.plafond : '—'}</b>${a.plafond ? ' u/h' : ''}</span>
          <span class="retenu"><em>Débit retenu</em><b>${etatTunnels.debit}</b> u/h</span>
          <span class="at-tunnel-total">${etatTunnels.tournent.length} ${etatTunnels.tournent.length > 1 ? 'tunnels' : 'tunnel'} sur ${a.tunnels.length}${
            etatTunnels.sansPersonne.length ? ' · ' + etatTunnels.sansPersonne.length + ' sans personnel' : ''}${
            etatTunnels.reste ? ' · ' + etatTunnels.reste + (etatTunnels.reste > 1 ? ' personnes disponibles' : ' personne disponible') : ''}</span>
        </div>
        <div class="mini-note at-tunnel-note">Deux limites, et c’est la plus basse qui compte.${
          etatTunnels.bride ? ' <b class="at-danger">Ici, c’est le plafond.</b>' : ''}<details class="aide">
          <summary aria-label="Quelles limites et pourquoi">?</summary>
          <span class="aide-corps">
            <p>Un tunnel ne tourne que si l’équipe a les gens pour le tenir. Ils sont servis
              <b>dans l’ordre de la liste</b> : mettez en tête ceux qu’on allume d’abord.</p>
            <p>Et l’ensemble ne dépasse pas son plafond, quoi qu’on ajoute : le côté sale, le
              séchage et le retour des paniers sont partagés entre les lignes et les brident
              toutes.</p>
          </span></details></div>
        <p class="mini-note at-lavage-note">Cette équipe ne prépare pas de commande : son travail vient des retours de vols, à mesure qu’ils arrivent.</p>`}` : `
        <div class="at-sous-titre">Ce que cette case prépare, dans l’ordre</div>
        <p class="mini-note at-regle">Une ligne = une préparation. Plusieurs sur la même ligne sortent <b>ensemble</b> ;
          sur deux lignes, <b>l’une après l’autre</b>. La première part à l’heure de début.</p>
        ${lots || '<p class="mini-note at-rien">Rien pour l’instant : cette case ne prépare rien.</p>'}
        <div class="at-actions-lot">
          <select class="at-ajout-lot" data-at-champ="lot-nouveau" aria-label="Ajouter une commande à préparer">
            <option value="">+ Ajouter une commande à préparer…</option>
            ${optionsDe(libres)}
          </select>
          ${a.lots.length ? '' : `<button class="btn btn-sm" data-at-action="lot-separer">Toutes les commandes, une par ligne</button>
          <button class="btn btn-sm" data-at-action="lot-tout">Tout sur une seule ligne</button>`}
        </div>`}

        ${dispo ? '' : `
        <details class="at-arrets" ${a.pauses.length ? 'open' : ''}>
          <summary>Arrêt programmé${a.pauses.length ? ' (' + a.pauses.length + ')' : ''}</summary>
          <p class="mini-note">Les pauses de l’équipe sont déjà prises en compte plus haut. Ici, c’est autre chose :
            une plage où <b>rien ne tourne</b> — machine à l’arrêt, local fermé, créneau de nettoyage.
            À une heure fixe, pas après un temps de travail.</p>
          ${pauses}
          <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="pause-ajouter">+ Arrêt</button></div>
        </details>`}

        <div class="at-actions-lot at-bas">${dansChemin
          ? `<button class="btn btn-sm at-danger" data-at-action="supprimer">Supprimer la case</button>`
          : `<button class="btn btn-play btn-sm" data-at-action="fermer">Terminé</button>
          <button class="btn btn-sm at-danger" data-at-action="supprimer">Supprimer</button>`}
        </div>
      </article>`;
    }

    /* Une ligne par compagnie : ce qu'on règle pour elle, et combien de vols elle a.
     * `colonnes` : les temps réglés par compagnie ({ map, lib } ; `durees` est le
     * temps principal) ; `extra` : les colonnes propres au service. */
    tableCompagnies(a, cies, nbVols, colonnes, extra) {
      const cols = typeof colonnes === 'string' ? [{ map: 'durees', lib: colonnes }] : colonnes;
      const propres = [...new Set(cols.flatMap(c => Object.keys(a[c.map] || {})).filter(k => k !== P.TOUTES))];
      const liste = [...new Set(cies.concat(propres))].sort();
      const champ = (c, cie, lib) => {
        const m = a[c.map] || {}, toutes = m[P.TOUTES] ?? c.defaut;
        const vide = c.map === 'durees' ? 'à saisir' : String(c.defaut ?? 0);
        return `<input type="number" min="${c.defaut !== undefined ? 1 : 0}" max="${c.max || 1440}" step="1" value="${m[cie] ?? (cie === P.TOUTES && c.defaut !== undefined ? c.defaut : '')}"
          placeholder="${cie === P.TOUTES ? vide : toutes != null ? String(toutes) : vide}"
          ${c.map === 'durees' ? 'data-at-champ="duree"' : `data-at-champ="temps" data-map="${c.map}"`} data-cie="${esc(cie)}" aria-label="${esc(c.lib)} pour ${esc(lib)}">`;
      };
      const propre = cie => cols.some(c => (a[c.map] || {})[cie] != null);
      const total = extra && extra.total ? extra.total : null;
      return `<div class="at-cies-bloc"><div class="table-scroll"><table class="at-cies">
        <thead><tr><th scope="col">Compagnie</th><th scope="col">Vols</th>${extra ? extra.tete : ''}${cols.map(c => `<th scope="col">${esc(c.lib)}</th>`).join('')}${total ? '<th scope="col">Trajet</th>' : ''}<th></th></tr></thead><tbody>
        <tr class="at-cies-toutes"><th scope="row">Toutes les compagnies</th><td>—</td>${extra ? extra.toutes : ''}${cols.map(c => `<td>${champ(c, P.TOUTES, 'toutes les compagnies')}</td>`).join('')}${total ? `<td>${total(P.TOUTES)}</td>` : ''}<td></td></tr>
        ${liste.map(cie => `<tr><th scope="row">${esc(cie)}</th><td>${nbVols(cie) || '—'}</td>${extra ? extra.ligne(cie) : ''}${cols.map(c => `<td>${champ(c, cie, cie)}</td>`).join('')}${total ? `<td>${total(cie)}</td>` : ''}
          <td>${propre(cie) ? `<button class="lien-discret" data-at-action="duree-retirer" data-cie="${esc(cie)}" title="Revenir aux temps de toutes les compagnies" aria-label="Revenir aux temps de toutes les compagnies pour ${esc(cie)}">×</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="mini-note">Vide : le temps de « Toutes les compagnies ».
          <label class="at-inline">Ajouter une compagnie<input data-at-champ="cie-nouvelle" maxlength="40" placeholder="Ex. EZY"
            aria-label="Ajouter une compagnie à ce tableau"></label></p></div>`;
    }

    /* Le handling : il récupère les trolleys prêts dans la CF départ et charge les vols. */
    ficheHandling(a) {
      const cies = [...new Set(this.classes.map(c => c.cie))].sort();
      const nb = cie => new Set(this.classes.filter(c => c.cie === cie).flatMap(c => c.vols.map(v => v.id))).size;
      const avance = Math.round((a.avance ?? P.AVANCE_HANDLING) / 6) / 10;
      const ch = a.chauffeurs || { long: 2, court: 1 };
      const longs = new Set(a.longs || []);
      const creneaux = a.creneaux || [];
      const presents = P.creneauxDe(a);
      const maxi = presents.length ? Math.max(...presents.flatMap(c => [c.de, c.a]).map(t => P.chauffeursPresents(presents, t))) : 0;
      return `
        <div class="at-sous-titre">Chargement des vols</div>
        <div class="mini-note at-regle">Le handling <b>récupère les trolleys prêts dans la CF départ</b> et <b>charge les vols</b>,
          dans l’ordre des départs, le jour J des vols.
          <details class="aide"><summary aria-label="Comment le handling charge les vols">?</summary><span class="aide-corps">
            Il réunit les classes d’un même vol et prend les vols <b>strictement dans l’ordre des départs</b> : un vol incomplet retient
            les suivants. Il travaille <b>le jour J des vols</b>, jamais la veille. Un camion part avec ses chauffeurs,
            <b>va jusqu’à l’avion, le charge et revient à l’unité</b> : ses chauffeurs sont pris tout ce temps ; le vol est chargé
            à la fin de son chargement.</span></details></div>
        <div class="at-champs at-handling">
          <label>Chauffeurs par camion, <b>long courrier</b><input type="number" min="1" max="20" value="${ch.long}" data-at-champ="chauffeurs-long"></label>
          <label>Chauffeurs par camion, <b>court courrier</b><input type="number" min="1" max="20" value="${ch.court}" data-at-champ="chauffeurs-court"></label>
          <label>Camions disponibles<input type="number" min="0" max="200" value="${a.camions || ''}" placeholder="pas de limite" data-at-champ="camions"
            title="Vide : autant de camions que les chauffeurs en font partir"></label>
          <label>Pas avant (heures avant le départ)<input type="number" min="0" max="24" step="0.5" value="${String(avance)}" data-at-champ="avance"
            title="Le handling ne commence pas un vol plus tôt que cela avant son départ"></label>
          <label>Compagnies chargées<input value="${esc((a.compagnies || []).join(', '))}" placeholder="toutes" data-at-champ="compagnies"
            title="Vide : toutes les compagnies. Sinon, par exemple : AF, TX"></label>
        </div>

        <div class="at-sous-titre">Chauffeurs présents, par créneau (jour J)</div>
        ${creneaux.length ? creneaux.map((c, i) => `<div class="at-pause at-creneau">
            <label>De<input type="time" value="${esc(c.de)}" data-at-champ="creneau-de" data-index="${i}"></label>
            <label>À<input type="time" value="${esc(c.a)}" data-at-champ="creneau-a" data-index="${i}"></label>
            <label><input type="number" min="0" max="200" value="${c.n}" data-at-champ="creneau-n" data-index="${i}" aria-label="Chauffeurs de ce créneau"> chauffeurs</label>
            <button class="btn btn-sm" data-at-action="creneau-retirer" data-index="${i}">Retirer</button></div>`).join('')
          + `<p class="mini-note at-regle">Jusqu’à <b>${maxi}</b> chauffeurs en même temps. Deux créneaux qui se chevauchent s’additionnent ;
              un créneau qui finit avant son début passe minuit. Un vol attend d’avoir ses chauffeurs libres.</p>`
          : `<p class="mini-note at-regle">Aucun créneau : le handling charge <b>${a.simultanes || 1} vol${(a.simultanes || 1) > 1 ? 's' : ''} à la fois</b>, sans compter les chauffeurs.
              <label class="at-inline">Vols en même temps<input type="number" min="1" max="50" value="${a.simultanes || 1}" data-at-champ="simultanes"></label></p>`}
        <div class="at-actions-lot"><button class="btn btn-sm${creneaux.length ? '' : ' btn-play'}" data-at-action="creneau-ajouter">+ Créneau de chauffeurs</button></div>

        <div class="at-sous-titre">Par compagnie : courrier et trajet du camion, en minutes (aller + charger + retour)</div>
        ${this.tableCompagnies(a, cies, nb, [{ map: 'volsCamion', lib: 'Vols / camion', defaut: a.volsParCamion || 1, max: 10 }, { map: 'allers', lib: 'Aller piste' }, { map: 'durees', lib: 'Charger' }, { map: 'retours', lib: 'Retour unité' }], {
          total: cie => { const t = P.trajetHandling(a, cie), d = P.dureeHandling(a, cie);
            return d == null ? '—' : '<b>' + Math.round(t.aller + d + t.retour) + '</b> min'; },
          toutes: '<td>—</td><td>—</td>',
          ligne: cie => `<td><select data-at-champ="categorie" data-cie="${esc(cie)}" aria-label="${esc(cie)} : long ou court courrier">
              <option value="court" ${longs.has(cie) ? '' : 'selected'}>court</option><option value="long" ${longs.has(cie) ? 'selected' : ''}>long</option></select></td>
            <td>${longs.has(cie) ? ch.long : ch.court}</td>`, tete: '<th scope="col">Courrier</th><th scope="col" title="Chauffeurs par camion">Chauff.</th>' })}
        <p class="mini-note at-regle">Des durées, pas des man-minutes : plus de chauffeurs dans le camion ne raccourcissent pas le trajet.
          Un camion qui charge plusieurs vols fait un seul aller et un seul retour.</p>`;
    }

    /* La plonge par vol : un tunnel lave un vol en tant de temps, compagnie par compagnie. */
    fichePlongeParVol(a, etatTunnels) {
      const retours = (this.a.vols ? this.a.vols() : []).filter(v => v.sens === 'RET');
      const cies = [...new Set(retours.map(v => v.cie))].sort();
      const nb = cie => retours.filter(v => v.cie === cie).length;
      const n = Array.isArray(a.tunnels) && a.tunnels.length ? etatTunnels.tournent.length : (a.personnes > 0 ? 1 : 0);
      return `
        <div class="at-sous-titre">Tunnels de lavage</div>
        ${a.tunnels.map((t, i) => `<div class="at-tunnel ${t.actif ? '' : 'arret'}${etatTunnels.sansPersonne.includes(t) ? ' sans-personne' : ''}">
          <label class="chk chk-mini"><input type="checkbox" data-at-champ="tunnel-actif" data-index="${i}" ${t.actif ? 'checked' : ''}>
            <span class="sr-only">${esc(t.nom)} en service</span></label>
          <input value="${esc(t.nom)}" data-at-champ="tunnel-nom" data-index="${i}" maxlength="80" aria-label="Nom du tunnel">
          <label class="at-seuil" title="Le tunnel ne tourne que si l’équipe a au moins ce nombre de personnes pour lui (servis dans l’ordre de la liste)">Minimum pour tourner
            <input type="number" min="0" max="99" value="${t.personnes}" data-at-champ="tunnel-personnes" data-index="${i}" aria-label="Personnes minimum pour que ${esc(t.nom)} tourne"><span>pers.</span></label>
          <label class="at-vitesse" title="Par rapport à un tunnel normal : 2 = lave deux fois plus vite. Les temps par compagnie sont ceux d’un tunnel normal.">×<input type="number" min="0.1" max="10" step="0.5"
            value="${String(t.vitesse || 1)}" data-at-champ="tunnel-vitesse" data-index="${i}" aria-label="Vitesse de ${esc(t.nom)} par rapport à un tunnel normal"></label>
          <span class="at-tunnel-unite">plus vite</span>
          <span class="at-tunnel-etat">${!t.actif ? 'à l’arrêt' : etatTunnels.sansPersonne.includes(t) ? 'à l’arrêt : pas assez de monde' : 'tourne'}</span>
          <button class="btn btn-sm" data-at-action="tunnel-retirer" data-index="${i}">Retirer</button>
        </div>`).join('')}
        <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="tunnel-ajouter">+ Tunnel</button>
          <span class="mini-note at-tunnels-n"><b>${n}</b> tunnel${n > 1 ? 's' : ''} tourne${n > 1 ? 'nt' : ''} : autant de vols lavés en même temps.
            Un tunnel ne tourne que si l’équipe a son <b>minimum de personnes</b>, servi dans l’ordre de la liste
            (${esc(String(Math.max(0, +a.personnes || 0)))} dans l’équipe${etatTunnels.reste ? ', ' + etatTunnels.reste + ' sans tunnel' : ''}).</span></div>
        <div class="at-sous-titre">Temps pour laver un vol, par compagnie <span class="mini-note">dans un tunnel normal (×1) ; un tunnel ×2 le lave en deux fois moins de temps</span></div>
        ${this.tableCompagnies(a, cies, nb, 'min par vol et par tunnel')}
        <p class="mini-note at-lavage-note">La plonge lave les vols qui reviennent, dans l’ordre de leur retour (arrivée + le délai
          de la boucle du matériel). Chaque vol va au tunnel qui le rend propre le plus tôt — un tunnel plus rapide peut valoir la peine
          d’être attendu. Si la boucle du matériel est active, le matériel
          d’un vol redevient propre à sa sortie du tunnel.</p>`;
    }

    /* Les commandes qu'une vague a servies, d'après le dernier calcul. */
    servisParVague(atelierId, i) {
      const r = this.resultat; if (!r || !r.ok) return '';
      const a = this.state.ateliers.find(x => x.id === atelierId);
      const vs = a ? P.vaguesDe(a) : [];
      const l = (r.lots || []).find(x => x.dispo && x.atelier === atelierId && x.debut === vs[i]);
      const n = l ? l.classes.length : 0;
      return n ? 'sert ' + n + (n > 1 ? ' commandes' : ' commande') : 'ne sert aucune commande';
    }

    finLot(atelierId, index) {
      const r = this.resultat; if (!r || !r.ok) return '';
      const lots = (r.ateliers.find(a => a.id === atelierId) || {}).lots || [];
      const l = lots[index];
      if (!l) return '';
      if (l.impossible) return 'ne tourne pas';
      return P.hhmm(l.debut) + ' → ' + P.hhmm(l.fin) + (l.attente ? ' (attente ' + Math.round(l.attente) + ')' : '');
    }

    /* ---- planning ---------------------------------------------------- */

    rendrePlanning(r) {
      const box = document.getElementById('at-planning');
      if (!r.ok || !r.lots.length) {
        box.innerHTML = '<p class="mini-note">Le planning apparaîtra dès qu’une équipe aura quelque chose à fabriquer.</p>';
        return;
      }
      const t0 = Math.min(...r.lots.map(l => l.debut));
      const t1 = Math.max(...r.lots.map(l => (l.fin == null ? l.debut : l.fin)), t0 + 60);
      const lignes = r.ateliers.filter(a => a.lots.length);
      const H = 26, marge = 190, L = 900, haut = lignes.length * H + 34;
      const x = t => marge + (t - t0) / (t1 - t0) * (L - marge - 16);

      // Repères horaires : assez espacés pour se lire (64 px au moins entre deux),
      // sur deux jours comme sur un seul. Ils se chevauchaient (« J-1 04:00J-1 06:00 »).
      const largeur = L - marge - 16, span = Math.max(60, t1 - t0);
      const pas = [60, 120, 180, 240, 360, 480, 720, 1440].find(k => largeur * k / span >= 64) || 1440;
      const reperes = [];
      // Borné : une heure infinie ne doit jamais figer la page (BUG-050).
      if (Number.isFinite(t0) && Number.isFinite(t1)) for (let t = Math.ceil(t0 / pas) * pas; t <= t1 && reperes.length < 400; t += pas) reperes.push(t);
      // Le jour ne s'écrit qu'au premier repère de chaque jour, et à minuit.
      const jourDe = t => Math.floor(t / 1440);
      const heureSeule = t => P.hhmm(t - jourDe(t) * 1440);
      const etiquette = (t, i) => {
        const j = jourDe(t), neuf = i === 0 || jourDe(reperes[i - 1]) !== j;
        return neuf && (j !== 0 || jourDe(t0) !== 0) ? jourEcrit(j) + ' ' + heureSeule(t) : heureSeule(t);
      };

      const services = this.a.services(), nomSvc = id => (services.find(s => s.id === id) || {}).nom || id;
      const barres = lignes.map((a, i) => {
        const y = 28 + i * H;
        // Une équipe qui fait aussi l'étape d'avant, à la chaîne : son nom le dit, ses barres ont la teinte de la chaîne.
        const fu = (a.lots.find(l => l.fusion) || {}).fusion;
        const court = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
        const nom = `<text class="at-pl-nom" x="8" y="${y + 13}">${esc(fu ? court(a.nom, 15) : a.nom)}${fu ? `<tspan class="at-pl-chaine"> ⛓ +${esc(court(nomSvc(fu), 9))}</tspan>` : ''}<title>${esc(a.nom)}${fu ? ' — fait aussi ' + esc(nomSvc(fu)) + ', à la chaîne' : ''}</title></text>`;
        const lots = a.lots.map(l => {
          // Une mise à disposition n'a pas de durée : une barre de deux pixels
          // se lirait comme une fabrication minuscule. C'est un repère.
          if (l.dispo) return `<rect class="at-pl-dispo" x="${x(l.debut) - 3}" y="${y + 2}" width="6" height="16" rx="2"><title>Disponible à partir de ${P.hhmm(l.debut)}</title></rect>`;
          if (l.fin == null) return `<rect class="at-pl-bloque" x="${x(l.debut)}" y="${y + 3}" width="10" height="14" rx="3"><title>${esc(l.nom)} : ne tourne pas</title></rect>`;
          const att = l.attente ? `<rect class="at-pl-attente" x="${x(l.debut - l.attente)}" y="${y + 6}" width="${Math.max(1, x(l.debut) - x(l.debut - l.attente))}" height="8" rx="2"><title>Attente des amonts : ${Math.round(l.attente)} min</title></rect>` : '';
          const w = Math.max(2, x(l.fin) - x(l.debut));
          return att + `<rect class="at-pl-lot ${a.type === 'robot' ? 'robot' : ''}${l.fusion ? ' chaine' : ''}" x="${x(l.debut)}" y="${y + 3}" width="${w}" height="14" rx="3">
            <title>${esc(l.nom)}\n${P.hhmm(l.debut)} → ${P.hhmm(l.fin)} (${Math.round(l.duree)} min${l.arret ? ', dont ' + Math.round(l.arret) + ' min d’arrêt' : ''})${l.fusion
              ? '\n⛓ À la chaîne : ' + esc(nomSvc(l.fusion)) + ' ' + Math.round(l.minutesFusion || 0) + ' min + ' + esc(nomSvc(a.service)) + ' ' + Math.round(l.minutesIci || 0) + ' min de travail' : ''}</title></rect>`;
        }).join('');
        return nom + lots;
      }).join('');

      box.innerHTML = `<svg viewBox="0 0 ${L} ${haut}" role="img" aria-label="La journée des équipes">
        ${reperes.map((t, i) => `<g><line class="at-pl-grille${t % 1440 === 0 ? ' minuit' : ''}" x1="${x(t)}" y1="20" x2="${x(t)}" y2="${haut}"/><text class="at-pl-heure" x="${x(t)}" y="14">${etiquette(t, i)}</text></g>`).join('')}
        ${barres}
      </svg>
      <p class="mini-note">Barre pleine : l’équipe prépare. Barre fine devant : elle attend le service d’avant.${r.lots.some(l => l.fusion)
        ? ' <span class="at-pl-legende-chaine">Barre rose ⛓ : deux étapes faites d’un bloc, à la chaîne.</span>' : ''}</p>`;
    }

    /* ---- couverture par classe --------------------------------------- */

    /* ---- récap des cases ---------------------------------------------- */

    /*
     * Toutes les cases d'un coup d'œil, service par service : ce que chacune
     * traite, dans l'ordre, et son heure de départ (modifiable ici). Trois
     * déroulés : une tâche unique, des lignes à la suite, et plusieurs
     * commandes sur une même ligne, préparées ensemble.
     */
    /** Les cases Robot qui tournent sur la même ligne que `a` (elle comprise). */
    robotsDeLigne(a) {
      if (a.lignePropre) return [a];
      return this.state.ateliers.filter(x => x.type === 'robot' && x.service === a.service && !x.lignePropre);
    }

    /* La ligne robot (retour d'usage du 29/09) : une seule ligne physique,
     * partagée par l'équipe du matin et celle de l'après-midi. */
    blocLigne(a) {
      const autres = this.robotsDeLigne(a).filter(x => x !== a);
      const vue = ((this.resultat || {}).lots || []).filter(l => l.atelier === a.id && l.attenteLigne > 0);
      const attend = vue.reduce((n, l) => n + l.attenteLigne, 0);
      const arrets = a.arretsLigne || [];
      return `<div class="at-ligne-robot">
        <div class="at-sous-titre">La ligne robot</div>
        <p class="mini-note">${a.lignePropre ? 'Cette case a <b>sa propre machine</b> : elle tourne en même temps que les autres robots.'
          : autres.length ? `Une seule ligne, partagée avec ${autres.map(x => '« ' + esc(x.nom) + ' »').join(', ')} : un lot à la fois, quelle que soit l’équipe.`
          : 'Une seule ligne : une autre case Robot de ce service (l’équipe de l’après-midi…) la partagera.'}
          ${attend >= 1 ? ` <b>Attend la ligne ${Math.round(attend)} min</b> aujourd’hui.` : ''}</p>
        <label class="chk chk-mini"><input type="checkbox" data-at-champ="ligne-propre" ${a.lignePropre ? 'checked' : ''}> Un second robot : sa propre ligne</label>
        ${arrets.map((x, i) => `<div class="at-pause">
          <span class="mini-note">Arrêt de la ligne</span>
          <input type="time" value="${esc(x.de)}" data-at-champ="arret-ligne-de" data-index="${i}" aria-label="Début de l’arrêt ${i + 1} de la ligne">
          <input type="time" value="${esc(x.a)}" data-at-champ="arret-ligne-a" data-index="${i}" aria-label="Fin de l’arrêt ${i + 1} de la ligne">
          <button class="btn btn-sm" data-at-action="arret-ligne-retirer" data-index="${i}">Retirer</button></div>`).join('')}
        <div class="at-actions-lot"><button class="btn btn-sm" data-at-action="arret-ligne-ajouter">+ Arrêt de la ligne</button>
          <span class="mini-note">chaque jour, pour toutes les équipes de la ligne (ex. 12:15–13:00)</span></div>
      </div>`;
    }

    /* Deux étapes fusionnées, à la chaîne (retour d'usage du 29/09) : « une
     * personne dresse un plat puis le passe, l'autre fait le montage
     * directement ». La case fait aussi l'étape d'avant pour SES commandes. */
    blocFusion(a) {
      const services = this.a.services(), nom = id => (services.find(s => s.id === id) || {}).nom || id;
      const ids = [...new Set(a.lots.flat())];
      // Les étapes juste avant celle-ci, sur les chemins de ses commandes.
      const routes = P.routesDesClasses(this.classes, this.state);
      const avant = new Set(a.fusion ? [a.fusion] : []);
      for (const id of ids) for (const s of ((routes.get(id) || {}).amonts || {})[a.service] || []) avant.add(s);
      if (!avant.size) return '';
      const f = a.fusion;
      let bilan = '';
      // Seules les commandes dont le flux passe par l'étape d'avant se font à la chaîne ;
      // les autres, cette case n'en fait que son étape.
      const enChaine = f ? ids.filter(id => PC.passePar(this.state, id, f)) : [], seules = f ? ids.filter(id => !enChaine.includes(id)) : [];
      if (f && ids.length) {
        const bareme = (this.a.reglages ? this.a.reglages() : {}).bareme;
        const cls = ids.map(id => this.classes.find(c => c.id === id)).filter(Boolean);
        const pm = cls.filter(c => enChaine.includes(c.id)).reduce((n, c) => n + P.travailClasse(f, c, bareme), 0);
        const mm = cls.reduce((n, c) => n + P.travailDans(a, c, bareme), 0);
        const n = a.personnes, d = P.dureeFusion(pm, mm, n);
        let k = 0;
        if (n > 1 && pm && mm) { let mieux = Infinity; for (let i = 1; i < n; i++) { const x = Math.max(pm / i, mm / (n - i)); if (x < mieux) { mieux = x; k = i; } } }
        const min = x => Math.round(x) + ' min';
        bilan = `<p class="mini-note at-fusion-bilan">${esc(nom(f))} ${min(pm)} + ${esc(nom(a.service))} ${min(mm)} de travail →
          <b>${Number.isFinite(d) ? min(d) : 'rien ne se fait sans personne'}</b>${n === 1 ? ' : seule, la personne fait les deux, l’un après l’autre'
            : k ? ` : ${k} au ${esc(nom(f))}, ${n - k} au ${esc(nom(a.service))} — le poste le plus lent donne le rythme` : ''}.</p>`;
        if (seules.length) bilan += `<p class="mini-note">À la chaîne pour ${esc(enChaine.map(c => PC.etiquette(c)).join(', ') || 'aucune')} ;
          ${esc(nom(a.service))} seul pour ${esc(seules.map(c => PC.etiquette(c)).join(', '))} (leur flux ne passe pas par ${esc(nom(f))}).</p>`;
        const ailleurs = this.state.ateliers.filter(x => x.service === f && x.id !== a.id && (x.lots || []).some(l => l.some(c => enChaine.includes(c))));
        if (ailleurs.length) bilan += `<p class="mini-note at-alerte">Encore dans ${ailleurs.map(x => '« ' + esc(x.nom) + ' »').join(', ')} : ces commandes y sont faites à part.
          Rechoisissez « à la chaîne » pour les en retirer.</p>`;
      }
      return `<div class="at-fusion">
        <label class="at-mode-dispo">À la chaîne avec l’étape d’avant ?<select data-at-champ="fusion" aria-label="Cette case fait-elle aussi l’étape d’avant, à la chaîne ?">
          <option value="" ${f ? '' : 'selected'}>Non — l’étape d’avant a sa propre case</option>
          ${[...avant].map(s => `<option value="${esc(s)}" ${s === f ? 'selected' : ''}>Oui, avec ${esc(nom(s))} : ${esc(nom(s))} + ${esc(nom(a.service))} dans cette case</option>`).join('')}</select></label>
        <span class="mini-note">Pour les commandes de cette case dont le flux passe par cette étape (les autres : son étape seule) : une personne dresse et passe le plat, l’autre monte directement.
          Seule, une personne fait les deux ; à plusieurs, elles se répartissent entre les deux postes.</span>
        ${bilan}</div>`;
    }

    /* Une équipe qui ne travaille que certains jours (retour d'usage du 01/10) :
     * « s'il y a tant de vols Air France, une personne est consacrée au montage
     * AF ; sinon elle est rattachée à un autre atelier ». Une seule forme de
     * règle, qui se lit comme une phrase. Le moteur l'applique sur les vols du
     * jour (voir appliquerConditions). */
    equipesSinon(a) {
      return a ? this.state.ateliers.filter(x => x.id !== a.id && x.service === a.service && (x.type === 'manuel' || x.type === 'robot')) : [];
    }

    compagniesDuJour() {
      const n = new Map();
      for (const c of this.classes || []) n.set(c.cie, (n.get(c.cie) || 0) + (c.vols || []).length);
      return [...n].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(x => x[0]);
    }

    /** Ce que la règle donne aujourd'hui, en une ligne ; null sans règle. */
    etatCondition(a) {
      const k = a && a.condition; if (!k) return null;
      const compte = P.compteDuJour(this.classes, k.cie, k.mesure);
      const vue = ((this.resultat && this.resultat.conditions) || []).find(r => r.atelier === a.id);
      const nomDe = id => (this.state.ateliers.find(x => x.id === id) || {}).nom || '?';
      const qui = k.cie === '*' ? 'Toutes les compagnies ont' : k.cie + ' a';
      const unite = k.mesure === 'repas' ? 'repas' : compte > 1 ? 'vols' : 'vol';
      const remplie = compte >= k.seuil;
      let texte = `Aujourd’hui : ${esc(qui)} ${compte} ${unite} (au moins ${k.seuil}) → `;
      if (remplie) texte += '<b>elle travaille</b>.';
      else if (vue && vue.sansIssue) texte += '<b>elle travaille quand même</b> : aucune équipe de ce service ne travaille pour reprendre ses commandes.';
      else {
        const vers = vue && vue.vers ? vue.vers : k.sinon, renfort = k.absorbe ? null : vue ? vue.renforce : (k.renfort || k.sinon);
        texte += `<b>elle ne travaille pas</b> ; ses commandes vont à « ${esc(nomDe(vers))} »`
          + (k.absorbe ? ', qui absorbe la charge avec ses propres personnes'
            : a.personnes > 0 && renfort ? `, ${a.personnes > 1 ? 'ses ' + a.personnes + ' personnes' : 'sa personne'} renforce${a.personnes > 1 ? 'nt' : ''} « ${esc(nomDe(renfort))} »` : '') + '.';
      }
      return { remplie, compte, texte };
    }

    blocCondition(a) {
      if (!a || (a.type !== 'manuel' && a.type !== 'robot')) return '';
      const k = a.condition;
      if (!k) return `<p class="at-cond-ajout"><button class="btn btn-sm" type="button" data-at-action="cond-ajouter"
        title="Par exemple : une personne au montage AF seulement les jours où AF a au moins 6 vols ; sinon, elle rejoint le montage général">⚡ Ne travailler que certains jours (selon le nombre de vols)…</button></p>`;
      const cies = this.compagniesDuJour();
      if (k.cie !== '*' && !cies.includes(k.cie)) cies.push(k.cie);
      const autres = this.equipesSinon(a);
      const tous = this.state.ateliers.filter(x => x.id !== a.id && x.type !== 'handling');
      const opt = (v, lib, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(lib)}</option>`;
      const etat = this.etatCondition(a);
      return `<div class="at-cond${etat && !etat.remplie ? ' off' : ''}">
        <p class="at-cond-phrase"><span class="at-cond-eclair" aria-hidden="true">⚡</span> Cette équipe ne travaille que si
          <select data-at-champ="cond-cie" aria-label="Quelle compagnie">${opt('*', 'toutes les compagnies', k.cie === '*')}${cies.map(c => opt(c, c, c === k.cie)).join('')}</select>
          ${k.cie === '*' ? 'ont' : 'a'} au moins
          <input type="number" min="1" max="99999" value="${k.seuil}" data-at-champ="cond-seuil" aria-label="Combien au moins">
          <select data-at-champ="cond-mesure" aria-label="Vols ou repas">${opt('vols', 'vols', k.mesure !== 'repas')}${opt('repas', 'repas', k.mesure === 'repas')}</select>
          ce jour-là.</p>
        <p class="at-cond-phrase">Sinon, ses commandes passent à
          <select data-at-champ="cond-sinon" aria-label="Quelle équipe reprend ses commandes">${autres.map(x => opt(x.id, x.nom, x.id === k.sinon)).join('')}</select>,
          et ses personnes
          <select data-at-champ="cond-renfort" aria-label="Où vont ses personnes ces jours-là">${opt('-', 'ne viennent pas : elle absorbe la charge', !!k.absorbe)}${opt('', 'y vont aussi, en renfort', !k.absorbe && !k.renfort)}${tous.filter(x => x.id !== k.sinon).map(x => opt(x.id, 'vont en renfort à « ' + x.nom + ' »', x.id === k.renfort)).join('')}</select>.
          <button class="btn btn-sm at-cond-retirer" type="button" data-at-action="cond-retirer" title="Retirer la condition : l’équipe travaille tous les jours">Retirer</button></p>
        ${etat ? `<p class="at-cond-etat ${etat.remplie ? 'oui' : 'non'}">${etat.texte}</p>` : ''}
      </div>`;
    }

    rendreRecapCases(r) {
      const box = document.getElementById('rc-liste'); if (!box) return;
      const services = this.a.services();
      const nomSvc = id => (services.find(s => s.id === id) || {}).nom || id;
      const ordre = new Map(services.map((s, i) => [s.id, i]));
      const calc = new Map(((r && r.ateliers) || []).map(a => [a.id, a]));
      const minDe = a => (a.jour || 0) * 1440 + (a.type === 'dispo' && a.permanent !== false ? -1e9 : P.minutes(a.debut || '00:00'));
      const filtre = this.rcFiltre || '';
      const cases = this.state.ateliers.slice()
        .filter(a => !filtre || (a.nom + ' ' + nomSvc(a.service) + ' ' + (a.lots || []).flat().map(c => c + ' ' + P.libelleClasse(c)).join(' ')).toLowerCase().includes(filtre))
        .sort((x, y) => (ordre.get(x.service) ?? 999) - (ordre.get(y.service) ?? 999) || minDe(x) - minDe(y) || x.nom.localeCompare(y.nom));
      if (!this.state.ateliers.length) { box.innerHTML = '<p class="mini-note">Aucune case pour l’instant : décrivez vos équipes (Équipes › Services et équipes).</p>'; return; }
      const I = root.OrlyIcones, hh = P.hhmm;
      const jours = (v, attrs, plonge) => `<select ${attrs}>${(plonge ? [-1, 0, 1] : [0, -1, -2, -3]).map(j => `<option value="${j}" ${j === (v || 0) ? 'selected' : ''}>${jourEcrit(j)}</option>`).join('')}</select>`;
      // Une commande mène à son chemin, ouvert sur le service de cette case :
      // c'est là qu'on la voit et qu'on la règle.
      const chip = c => `<button type="button" class="rc-cmd" data-at-action="chemin" data-classe="${esc(c)}" title="Ouvrir le chemin de ${esc(P.libelleClasse(c))}"><span class="puce-classe" data-cab="${esc(c.slice(c.lastIndexOf('/') + 1))}"></span>${esc(PC.etiquette(c))}</button>`;
      const deroule = a => {
        // Une mise à disposition : quand elle sert se choisit ici aussi.
        if (a.type === 'dispo') {
          const mode = a.permanent === false ? 'vagues' : a.ouverture ? 'boutique' : 'toujours';
          return `<select class="rc-mode" data-at-champ="mode-dispo" aria-label="Quand ${esc(a.nom)} sert-il ?">
            <option value="boutique" ${mode === 'boutique' ? 'selected' : ''}>boutique (de … à …)</option>
            <option value="toujours" ${mode === 'toujours' ? 'selected' : ''}>toujours ouvert</option>
            <option value="vagues" ${mode === 'vagues' ? 'selected' : ''}>${(a.vagues || []).length > 1 ? a.vagues.length + ' vagues' : 'par vagues'}</option></select>`;
        }
        if (a.type === 'lavage') return '<span class="rc-deroule autre">plonge</span>';
        if (a.type === 'handling') return '<span class="rc-deroule autre">par vol</span>';
        const lignes = (a.lots || []).filter(l => l.length), ens = lignes.filter(l => l.length > 1).length;
        if (!lignes.length) return '<span class="rc-deroule vide">rien</span>';
        const chaine = a.fusion && a.type === 'manuel' ? ` <span class="rc-chaine" title="Fait aussi ${esc(nomSvc(a.fusion))}, à la chaîne">+ ${esc(nomSvc(a.fusion))} à la chaîne</span>`
          : a.type === 'robot' && this.robotsDeLigne(a).length > 1 ? ` <span class="rc-chaine" title="Une seule ligne robot, partagée avec ${esc(this.robotsDeLigne(a).filter(x => x !== a).map(x => x.nom).join(', '))}">ligne partagée</span>` : '';
        return (chaine ? chaine.trim() + ' ' : '') + (lignes.length === 1 ? '<span class="rc-deroule unique">tâche unique</span>' : `<span class="rc-deroule suite">${lignes.length} à la suite</span>`)
          + (ens ? ` <span class="rc-ensemble-lab">${ens > 1 ? ens + ' lignes' : 'dont 1 ligne'} ensemble</span>` : '');
      };
      const traite = a => {
        const vue = calc.get(a.id) || { lots: [] };
        if (a.type === 'dispo') {
          if (a.permanent !== false && a.ouverture) return `<span class="rc-vagues"><span class="rc-vague">de
            <input type="time" value="${esc(a.ouverture.de)}" data-at-champ="ouverture-de" aria-label="Heure d’ouverture de ${esc(a.nom)}"> à
            <input type="time" value="${esc(a.ouverture.a)}" data-at-champ="ouverture-a" aria-label="Heure de fermeture de ${esc(a.nom)}"></span></span>
            <span class="mini-note">chaque jour, comme une boutique : ouvert, on est servi ; fermé, on attend l’ouverture</span>`;
          if (a.permanent !== false) return '<span class="mini-note">sert toutes les commandes, à tout moment</span>';
          return `<span class="rc-vagues">${(a.vagues || []).map((v, i) => `<span class="rc-vague"><b>${i + 1}</b>
            ${jours(v.jour, `data-at-champ="vague-jour" data-index="${i}" aria-label="Jour de la vague ${i + 1}"`)}
            <input type="time" value="${esc(v.debut)}" data-at-champ="vague-debut" data-index="${i}" aria-label="Heure de la vague ${i + 1}"></span>`).join('')}</span>
            <span class="mini-note">sert toutes les commandes, chacune à la vague qui précède son besoin</span>`;
        }
        if (a.type === 'lavage') {
          if (!a.parVol) return `<span class="mini-note">lave les retours de vols, à mesure qu’ils arrivent · ${P.debitLavage(a)} u/h</span>`;
          const lav = vue.lots.filter(l => l.retourVol), faits = lav.filter(l => !l.impossible);
          return `<span class="mini-note">lave ${faits.length} vol${faits.length > 1 ? 's' : ''} revenu${faits.length > 1 ? 's' : ''}, dans l’ordre des retours`
            + (lav.length > faits.length ? ` · <b>${lav.length - faits.length} non lavé${lav.length - faits.length > 1 ? 's' : ''}</b>` : '')
            + ` · ${(a.durees || {})[P.TOUTES] ?? '—'} min par vol (toutes compagnies)</span>`;
        }
        if (a.type === 'handling') {
          const n = vue.lots.filter(l => l.vol).length;
          const cr = a.creneaux || [];
          return `<span class="mini-note">charge ${n} vol${n > 1 ? 's' : ''} dans l’ordre des départs · `
            + (cr.length ? `chauffeurs ${cr.map(c => c.de + '–' + c.a + ' : ' + c.n).join(', ')} · camion : ${(a.chauffeurs || {}).long} chauffeurs en long courrier (${(a.longs || []).join(', ') || 'aucune compagnie'}), ${(a.chauffeurs || {}).court} en court`
              + ` · ${a.volsParCamion || 1} vol${(a.volsParCamion || 1) > 1 ? 's' : ''} par camion` + (Object.keys(a.volsCamion || {}).length ? ` (${Object.entries(a.volsCamion).map(([c, n]) => c + ' : ' + n).join(', ')})` : '') + (a.camions ? ` · ${a.camions} camions` : '')
              : `${a.simultanes || 1} à la fois`)
            + ` · pas avant ${String(Math.round((a.avance ?? 180) / 6) / 10).replace('.', ',')} h avant le départ</span>`;
        }
        const lignes = (a.lots || []).filter(l => l.length);
        if (!lignes.length) return '<span class="mini-note">aucune commande : rattachez-la dans un chemin</span>';
        let k = 0;
        return `<ol class="rc-seq">${(a.lots || []).map(l => {
          if (!l.length) return '';
          const lot = vue.lots[k++];
          const quand = !lot ? '' : lot.impossible ? '<small class="rc-quand ko">ne se fait pas</small>'
            : `<small class="rc-quand">${hh(lot.debut)}–${hh(lot.fin)}${lot.attente >= 1 ? ` <span title="Attente du service d’avant">· attend ${Math.round(lot.attente)} min</span>` : ''}</small>`;
          return `<li class="${l.length > 1 ? 'ens' : ''}">${l.length > 1 ? '<span class="rc-ens-tete">ensemble</span>' : ''}<span class="rc-cmds">${l.map(chip).join('')}</span>${quand}</li>`;
        }).join('<li class="rc-fleche" aria-hidden="true">→</li>')}</ol>`;
      };
      const depart = a => {
        if (a.type === 'dispo') return '<td class="rc-jour">—</td><td class="rc-heure">—</td>';
        const jourFixe = a.type === 'handling';
        return `<td class="rc-jour">${jourFixe ? '<span title="Le handling travaille le jour J des vols">J</span>'
          : a.type === 'lavage' ? jours(a.jour, `data-at-champ="jour" aria-label="Jour de travail de ${esc(a.nom)}, compté depuis l’arrivée des retours" title="Compté depuis l’arrivée des retours (J)"`, true)
          : jours(a.jour, `data-at-champ="jour" aria-label="Jour de départ de ${esc(a.nom)}"`)}</td>
          <td class="rc-heure"><input type="time" value="${esc(a.debut)}" data-at-champ="debut" aria-label="Heure de départ de ${esc(a.nom)}"></td>`;
      };
      let service = null;
      const lignes = cases.map(a => {
        const vue = calc.get(a.id) || {};
        const tete = a.service !== service ? (service = a.service, `<tr class="rc-svc"><th colspan="6"><span>${I ? I.ico(I.icoService(a.service, nomSvc(a.service))) : ''}${esc(nomSvc(a.service))}</span>
          <small>${this.state.ateliers.filter(x => x.service === a.service).length} case${this.state.ateliers.filter(x => x.service === a.service).length > 1 ? 's' : ''}</small></th></tr>`) : '';
        return tete + `<tr data-at="${esc(a.id)}" class="rc-case">
          <th scope="row"><button class="lien-discret" data-at-action="ouvrir" title="Régler « ${esc(a.nom)} » dans sa fiche">${esc(a.nom)}</button>
            <small>${a.type === 'dispo' ? 'mise à disposition' + (+a.personnes > 0 ? ' · ' + a.personnes + ' pers.' : '') : a.type === 'lavage' ? 'plonge' : a.type === 'handling' ? 'handling' : a.type === 'robot' ? 'robot · ' + a.personnes + ' pers.' : a.personnes + ' pers.'}</small></th>
          <td class="rc-type">${deroule(a)}</td>
          ${depart(a)}
          <td class="rc-traite">${traite(a)}</td>
          <td class="rc-fin-h">${vue.fin != null && a.type !== 'dispo' ? hh(vue.fin) : '—'}</td>
        </tr>`;
      }).join('');
      // Redessiner ne doit ni ramener le tableau en haut, ni faire perdre le
      // champ où l'on est : on garde le défilement et le focus.
      const avant = box.querySelector('.rc-scroll'), haut = avant ? avant.scrollTop : 0, gauche = avant ? avant.scrollLeft : 0;
      const actif = box.contains(document.activeElement) && document.activeElement.dataset.atChamp ? document.activeElement : null;
      const cle = actif && { at: actif.closest('[data-at]')?.dataset.at, champ: actif.dataset.atChamp, index: actif.dataset.index };
      box.innerHTML = `<div class="rc-scroll"><table class="rc-table">
        <thead><tr><th scope="col">Case</th><th scope="col">Déroulé</th><th scope="col">Jour</th><th scope="col">Départ</th>
          <th scope="col">Ce qu’elle traite, dans l’ordre</th><th scope="col">Fin</th></tr></thead>
        <tbody>${lignes || `<tr><td colspan="6" class="mini-note">Aucune case ne correspond à « ${esc(filtre)} ».</td></tr>`}</tbody></table></div>`;
      const apres = box.querySelector('.rc-scroll');
      if (apres) { apres.scrollTop = haut; apres.scrollLeft = gauche; }
      if (cle && cle.at) {
        const el = [...box.querySelectorAll(`[data-at="${CSS.escape(cle.at)}"] [data-at-champ="${CSS.escape(cle.champ)}"]`)]
          .find(x => x.dataset.index === cle.index);
        if (el && el !== document.activeElement) el.focus({ preventScroll: true });
      }
    }

    exporterRecapCases() {
      const E = root.OrlyEchanges, T = root.OrlyTableur;
      T.telecharger('ory-cases-' + new Date().toISOString().slice(0, 10) + '.xlsx',
        T.ecrireClasseur(E.recapCasesVersClasseur(this.state, { services: this.a.services(), classes: this.classes, resultat: this.resultat })));
      this.rendre('Cases exportées : modifiez jour, heure, personnes ou commandes dans Excel, puis « ⇧ Importer ».');
    }

    async importerRecapCases(e) {
      const f = e.target.files[0]; if (!f) return;
      try {
        const E = root.OrlyEchanges, T = root.OrlyTableur;
        const r = E.classeurVersRecapCases(await T.lireFichier(f, 4 * 1024 * 1024), this.state, { services: this.a.services(), classes: this.classes });
        if (!r.changes.length) return this.rendre('Cases lues : rien ne change.');
        const liste = r.changes.slice(0, 6).join(', ') + (r.changes.length > 6 ? '…' : '');
        if (!confirm('Changer ' + r.changes.length + (r.changes.length > 1 ? ' cases' : ' case') + ' (' + liste + ') d’après le fichier ? L’action est annulable.')) return;
        this.changer(() => { this.state = valider(r.etat); }, 'Cases importées : ' + r.changes.length + (r.changes.length > 1 ? ' cases changées' : ' case changée') + ' (' + liste + ').');
      } catch (err) { this.rendre('Import refusé — ' + err.message); }
      finally { e.target.value = ''; }
    }

    rendreClasses(r) {
      const box = document.getElementById('at-classes');
      const classes = this.classes, retirees = this.retirees;
      const par = (r && r.parClasse) || {};

      const ouvert = this.ajout && this.ajout.lieu === 'commandes';
      const ajout = ouvert ? this.formAjout('commandes') : '';
      const barre = ouvert ? '' : `<div class="at-barre"><span class="at-barre-fin"></span>${this.formAjout('commandes')}</div>`;

      const exclues = retirees.length ? `<p class="at-exclues">Retirées du programme :
        ${retirees.map(c => `<button class="at-chip" data-at-action="classe-retablir" data-classe="${esc(c.id)}">${esc(c.id)} ↺</button>`).join(' ')}</p>` : '';

      if (!classes.length) {
        box.innerHTML = barre + ajout + exclues +
          '<p class="mini-note">Aucune commande à préparer : ni dans le programme de vols, ni ajoutée ici.</p>';
        return;
      }

      // Pourquoi une commande n'est pas finie, en quelques mots (audit du 29/09) :
      // « pas finie » seul ne disait pas où regarder.
      const pourquoi = new Map();
      for (const an of (r && r.anomalies) || []) {
        if (an.code !== 'inacheve' && an.code !== 'poste' && an.code !== 'materiel') continue;
        const t = an.cause === 'materiel' ? '« ' + an.case + ' » manque de matériel propre'
          : an.cause === 'amont' ? 'attend ' + (an.attend || []).map(x => '« ' + x + ' »').join(', ')
          : an.cause === 'bloque' ? '« ' + an.case + ' » reste bloquée' + (an.bloquePar ? ' sur ' + an.bloquePar : '')
          : 'le poste de « ' + an.case + ' » finit avant';
        for (const id of an.classes || []) if (!pourquoi.has(id)) pourquoi.set(id, t);
      }
      box.innerHTML = barre + ajout + exclues + `<table class="at-table"><thead><tr>
        <th scope="col">Commande</th><th scope="col">Passagers</th><th scope="col">Vols</th>
        <th scope="col">Prête avant</th><th scope="col">Prête à</th><th scope="col">Où elle en est</th>
        <th scope="col"><span class="sr-only">Retirer</span></th>
        </tr></thead><tbody>` +
        classes.map(c => {
          const v = par[c.id] || {};
          const etat = v.absente ? '<span class="at-etat neutre">pas encore d’équipe</span>'
            : v.fin == null ? '<span class="at-etat neutre">pas finie</span>' + (pourquoi.has(c.id) ? '<small class="at-pourquoi">' + esc(pourquoi.get(c.id)) + '</small>' : '')
            : v.aHeure ? '<span class="at-etat ok">à l’heure</span>'
            : '<span class="at-etat retard">+' + Math.round(v.retard) + ' min</span>';
          // Une classe déclarée que l'import ne porte pas n'a ni volume ni
          // échéance : afficher zéro et une heure ferait croire à une donnée.
          const horsImport = c.origine === 'ajoutee' && !c.vols.length;
          const source = c.origine === 'ajoutee'
            ? '<span class="at-source">' + (horsImport ? 'pas dans les vols' : 'ajoutée') + '</span>' : '';
          return `<tr><th scope="row" data-classe="${esc(c.id)}">${esc(P.libelleClasse(c.id))} ${source}</th>
            <td>${horsImport ? '—' : c.pax}</td><td>${horsImport ? '—' : c.vols.length}</td>
            <td>${horsImport ? '—' : P.hhmm(c.echeance)}</td><td>${v.fin == null ? '—' : P.hhmm(v.fin)}</td><td>${etat}</td>
            <td><button class="lien-discret" data-at-action="classe-supprimer" data-classe="${esc(c.id)}"
              title="Retirer ${esc(P.libelleClasse(c.id))} et couper ses liens avec les équipes">Retirer</button></td></tr>`;
        }).join('') + '</tbody></table>';
    }
  }

  const api = { CentreAteliers, valider, vide, CLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyAteliers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
