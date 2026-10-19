/* ==========================================================================
 *  LA JOURNÉE — ce que le moteur reçoit, assemblé d'un seul chemin
 *  ------------------------------------------------------------------------
 *  La page assemblait elle-même les arguments de `MoteurProduction.simuler`
 *  (ateliers.js, calculer()) : les commandes du programme, moins celles qu'on
 *  retire et plus celles qu'on déclare ; les équipes resynchronisées ; les
 *  catégories ; les liens tirés du Centre des flux ; le barème et les règles
 *  de poste ; les services dont l'effectif se calcule ou s'impose ; les noms.
 *
 *  Un banc d'essai rejoue des journées hors du navigateur (docs/BANC_ESSAI.md) :
 *  il doit lancer EXACTEMENT le calcul de la page. L'assemblage vit donc ici,
 *  sans DOM, utilisable dans Node et dans la page, et la page s'en sert à son
 *  tour : il ne reste qu'un seul chemin de calcul.
 *
 *    argumentsDeLaJournee(sauvegarde, vols, options) → args
 *      sauvegarde — le contenu d'un fichier « Tout sauvegarder »
 *                   ({ schema: 'ory-sauvegarde', version: 1, contenu }),
 *                   relu et validé comme « Restaurer » le relit ;
 *      vols       — les vols du jour, tels que l'import les produit ;
 *      options    — { delaiChargement, decalage, modele, ateliers, equipes }.
 *    argumentsDeLUnite(unite, vols, options) → args
 *      la même chose depuis un état déjà relu : celui de la page.
 *    jouer(args) → le résultat de `simuler`, les catégories déclarées.
 *
 *  Ce qui se range à l'ouverture de la page (les migrations : la prépa insérée
 *  dans les chemins, l'armement par compagnie…) est déjà fait dans une
 *  sauvegarde prise depuis la page : il n'est pas refait ici.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  // Les modules de la page, pris à la demande : dans Node par require, dans la
  // page par leur nom (l'ordre des balises <script> n'a alors plus d'importance).
  const module_ = (nom, chemin) => (enNode ? require(chemin) : root[nom]);
  const P = () => module_('MoteurProduction', './production.js');
  const PB = () => module_('OrlyPlanBase', '../plan-base.js');
  const I = () => module_('OrlyIcones', '../icones.js');

  const clone = x => JSON.parse(JSON.stringify(x));
  const nomLisible = n => (I() ? I().nomLisible(n) : n);
  const objet = x => !!x && typeof x === 'object' && !Array.isArray(x);

  /** Le délai de chargement par défaut (« Horaires de vols », 45 min) et ses bornes. */
  const DELAI_CHARGEMENT = 45;

  /* ----------------------------------------------------------------------
   *  Les services, les liens, les noms — ce que la page lit du plan et du
   *  Centre des flux (sim.js : servicesDisponibles, liaisonsServices…).
   *  `zones` : les zones du plan (Sim.editor.state.zones) ; `base` : les
   *  services du plan de base (plan-base.js), dans leur ordre.
   * --------------------------------------------------------------------*/

  const zoneDe = (zones, id) => (zones || []).find(v => v.id === id) || null;
  /** Un service du plan d'origine retiré de l'unité (Organisation › Services). */
  const estRetire = (zones, id) => { const z = zoneDe(zones, id); return !!(z && z.retire); };
  /** Les annexes : des zones de production rattachées à un service, ou à part entière. */
  const annexesDe = zones => (zones || []).filter(z => z.kind === 'annexe');

  /** Les services de l'unité : ceux du plan de base qui n'en sont pas retirés, puis les annexes. */
  function servicesDeLUnite(zones, base) {
    const liste = Object.keys(base).filter(id => !estRetire(zones, id))
      .map(id => ({ id, nom: nomLisible((zoneDe(zones, id) || base[id]).nom) }));
    for (const a of annexesDe(zones)) liste.push({ id: a.id, nom: nomLisible(a.nom) });
    return liste;
  }

  /* Le parcours des compagnies × classes se lit dans le graphe du Centre des
   * flux : on n'en retient que les couples de services, en ignorant le détail
   * des stockages et les liaisons désactivées. Sans Centre des flux (`flux`
   * nul), les liens du plan de base. */
  function liaisonsDeLUnite(flux, zones, liensDeBase) {
    if (!flux) return (liensDeBase || []).map(([from, to]) => ({ from, to }));
    const service = point => { try { return JSON.parse(point)[0]; } catch (e) { return null; } };
    const out = [], tous = [];
    for (const l of flux.flows || []) {
      if (!l.enabled) continue;
      const from = service(l.from), to = service(l.to);
      if (!from || !to || from === to) continue;
      tous.push({ from, to });
      // Un service retiré de l'unité garde ses liens (Remettre les retrouve),
      // mais le calcul ne les lit plus.
      if (!estRetire(zones, from) && !estRetire(zones, to)) out.push({ from, to });
    }
    // Une annexe est une seconde salle de son atelier : elle en hérite les
    // fournisseurs et les clients. Sans cela, un atelier posé dans « Armement 2 »
    // n'attendrait personne et ne serait attendu de personne.
    const liens = out.slice();
    for (const a of annexesDe(zones)) {
      // Un service à part entière (05/10) n'hérite de personne.
      if (a.autonome) continue;
      // … sauf si on l'a câblée soi-même dans le Centre des flux : la saisie
      // explicite l'emporte sur l'héritage.
      if (liens.some(l => l.from === a.id || l.to === a.id)) continue;
      // Le service de rattachement peut avoir été supprimé de l'unité : ses
      // salles gardent ses liens, sans quoi elles n'attendraient plus personne.
      const source = estRetire(zones, a.parent) ? tous.filter(l => !estRetire(zones, l.from === a.parent ? l.to : l.from)) : liens;
      for (const l of source) {
        if (l.to === a.parent) out.push({ from: l.from, to: a.id });
        if (l.from === a.parent) out.push({ from: a.id, to: l.to });
      }
    }
    return out;
  }

  /** Le nom d'un service, même supprimé : « Armement (supprimé) » se comprend. */
  function nomDeService(id, services, zones, base) {
    const s = services.find(x => x.id === id); if (s) return s.nom;
    const z = zoneDe(zones, id) || (Object.hasOwn(base, id) ? base[id] : null);
    return (z ? nomLisible(z.nom) : id) + ' (supprimé)';
  }

  /* Les services supprimés (de l'unité ou du plan) que des cases ou des chemins
   * citent encore : le calcul les nomme quand même. */
  function fantomesDeLUnite(etat, services, zones, base) {
    const connus = new Set(services.map(s => s.id)), par = new Map();
    const noter = (id, champ) => {
      if (!id || connus.has(id)) return;
      const f = par.get(id) || { id, nom: nomDeService(id, services, zones, base), cases: 0, chemins: 0, retire: estRetire(zones, id) };
      f[champ]++; par.set(id, f);
    };
    for (const a of (etat && etat.ateliers) || []) noter(a.service, 'cases');
    for (const p of (etat && etat.parcours) || []) for (const s of P().servicesDuParcours(p)) noter(s, 'chemins');
    return [...par.values()];
  }

  /* ----------------------------------------------------------------------
   *  Le barème et les règles de poste (reglages.js, pourMoteur) : une annexe
   *  — « Armement 2 » — fait le même travail que l'atelier dont elle dépend.
   * --------------------------------------------------------------------*/

  /** Le barème complété des annexes, la règle de poste et le rendement ; rien sans réglages. */
  function reglagesDuModele(modele, services, zones) {
    if (!modele) return {};
    const bareme = clone(modele.bareme);
    for (const s of services) {
      if (bareme[s.id]) continue;
      const a = annexesDe(zones).find(z => z.id === s.id), pere = a ? a.parent : null;
      if (pere && bareme[pere]) bareme[s.id] = clone(bareme[pere]);
    }
    // Les heures sup (évolution 2) : seulement une fois réglées.
    return { bareme, rendement: modele.rendement, regime: modele.regime, ...(modele.heuresSup ? { heuresSup: modele.heuresSup } : {}) };
  }

  /* ----------------------------------------------------------------------
   *  Les cases (ateliers.js) : les commandes, les équipes resynchronisées,
   *  l'effectif de chaque service.
   * --------------------------------------------------------------------*/

  /* Le programme de vols reste la source. L'utilisateur en retire ce qu'il ne
   * fabrique pas et y ajoute ce que le programme ne porte pas encore : une
   * compagnie à venir, une prestation hors vol. Le programme fait foi : une
   * classe qu'il porte déjà garde SES chiffres. */
  function classesDuProgramme(programme, etat) {
    const exclues = new Set((etat && etat.exclues) || []);
    const par = new Map();
    for (const c of (programme || [])) {
      if (exclues.has(c.id)) continue;
      par.set(c.id, { ...c, origine: 'programme' });
    }
    for (const c of ((etat && etat.ajoutees) || [])) {
      const id = P().idClasse(c.cie, c.cabine);
      if (exclues.has(id)) continue;
      if (par.has(id)) { par.get(id).declaree = true; continue; }
      par.set(id, { id, cie: c.cie, cabine: c.cabine, pax: 0, vols: [],
        echeance: P().MINUTES_PAR_JOUR, origine: 'ajoutee' });
    }
    return [...par.values()].sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
  }

  /* L'effectif constant par défaut (retour d'usage du 05/10) : « le nombre de
   * personnes dépend du nombre de vols, à part sur certains ateliers ». CF
   * départ food (les checkeurs, à heures fixes), le magasin, la légumerie, le
   * duty free et les appros ne suivent pas les vols ; les autres services se
   * calculent. Une case dans la fiche du service change ce choix. */
  const CONSTANTS = new Set(['handling', 'magasin', 'decontam', 'bobduty', 'appros']);
  const NOMS_CONSTANTS = /cf\s*d[ée]part|magasin|l[ée]gumerie|duty|appro/i;

  /* Un service qui travaille par compagnie (l'armement) dépend toujours des
   * vols : ni lui ni ses équipes ne peuvent être constants. */
  const parVols = (etat, service) => !!((etat && etat.categories) || {})[service];
  /** Effectif imposé (essai) : les minutes par vol s'appliquent, l'effectif est celui saisi. */
  const effectifImpose = (etat, service) => ((etat && etat.effectifs) || {})[service] === 'impose';
  /** L'effectif d'un service : constant, ou calculé d'après les homme-minutes de ses équipes. */
  function effectifConstant(etat, service, services) {
    if (parVols(etat, service)) return false;
    const v = ((etat && etat.effectifs) || {})[service];
    if (v === 'fixe' || v === 'calcule' || v === 'impose') return v === 'fixe';
    const s = (services || []).find(x => x.id === service);
    return CONSTANTS.has(service) || NOMS_CONSTANTS.test((s && s.nom) || '');
  }
  const servicesDesCases = etat => [...new Set(((etat && etat.ateliers) || []).map(a => a.service))];
  /** Les services dont l'effectif se calcule (une équipe peut faire autrement : `effectif`). */
  const servicesCalcules = (etat, services) =>
    servicesDesCases(etat).filter(s => !effectifConstant(etat, s, services) && !effectifImpose(etat, s));
  /** Les services à effectif imposé (essai). */
  const servicesImposes = etat => servicesDesCases(etat).filter(s => effectifImpose(etat, s));

  /* L'atelier unique (07/10) : ses commandes sont celles de ses compagnies, toutes
   * classes, dans l'ordre des départs — de nouveaux vols, de nouvelles commandes. */
  function lotsAtelier(a, classes) {
    const cies = new Set(a.compagnies || []);
    return classes.filter(c => !c.categorie && cies.has(String(c.cie).toUpperCase())).map(c => [c.id]);
  }

  /** Remet les cases d'accord avec le programme (calculer()) ; rend le nombre de retouches. */
  function synchroniser(etat, classes) {
    let n = 0;
    // L'armement n'est jamais constant (07/10) : un ancien choix « constant » s'efface.
    const eff = etat.effectifs || {};
    for (const s of Object.keys(etat.categories || {})) if (eff[s] === 'fixe') { delete eff[s]; n++; }
    for (const a of etat.ateliers) {
      if (a.effectif === 'fixe' && parVols(etat, a.service)) {
        delete a.effectif; n++;
      }
      if (!a.parCompagnie) continue;
      const l = lotsAtelier(a, classes);
      if (JSON.stringify(l) !== JSON.stringify(a.lots)) { a.lots = l; n++; }
    }
    return n;
  }

  /* ----------------------------------------------------------------------
   *  L'assemblage
   * --------------------------------------------------------------------*/

  /** Le délai de chargement d'une option : celui de « Horaires de vols » (10 à 120 min). */
  function delaiDe(o) {
    if (o.delaiChargement === undefined || o.delaiChargement === null) return DELAI_CHARGEMENT;
    const d = +o.delaiChargement;
    if (!Number.isInteger(d) || d < 10 || d > 120) throw new Error('Délai de chargement attendu : un nombre entier de 10 à 120 minutes.');
    return d;
  }

  /** Le programme décalé (« Horaires de vols », Décalage) : tous les départs et arrivées. */
  function volsDecales(vols, decalage) {
    const k = +decalage || 0;
    return (vols || []).map(f => Object.assign({}, f, {
      std: f.std == null ? f.std : f.std + k,
      sta: f.sta == null ? f.sta : f.sta + k
    }));
  }

  /**
   * Les arguments de `simuler` depuis l'état relu de l'unité.
   * @param unite { etat, zones, base, flux, modele } — les cases (ory-ateliers-v1),
   *   les zones du plan, les services du plan de base, le Centre des flux
   *   (null : les liens du plan de base) et le barème (null : celui du moteur).
   * @param vols les vols, déjà décalés
   * @param options { delaiChargement }
   */
  function argumentsDeLUnite(unite, vols, options) {
    const o = options || {};
    const u = unite || {};
    const delaiChargement = o.delaiChargement === undefined || o.delaiChargement === null ? DELAI_CHARGEMENT : o.delaiChargement;
    const zones = u.zones || [];
    const base = u.base || PB().zones();
    const services = servicesDeLUnite(zones, base);
    const liaisons = liaisonsDeLUnite(u.flux || null, zones, PB().flux());
    const r = reglagesDuModele(u.modele || null, services, zones);
    const classes = classesDuProgramme(P().classesDeVols(vols, { delaiChargement }), u.etat);
    // Les cases resynchronisées, sur une copie : la page a déjà enregistré les siennes.
    const etat = clone(u.etat);
    synchroniser(etat, classes);
    return {
      vols, classes,
      ateliers: etat.ateliers, liaisons, materiel: etat.materiel,
      bareme: r.bareme, rendement: r.rendement, regime: r.regime, heuresSup: r.heuresSup, delaiChargement,
      parcours: etat.parcours, parcoursCabine: etat.parcoursCabine,
      parcoursClasse: etat.parcoursClasse,
      // Les services qui travaillent par catégories propres (l'armement).
      categories: etat.categories || {},
      // Les services dont l'effectif se calcule d'après les homme-minutes (05/10).
      effectifCalcule: servicesCalcules(etat, services), effectifImpose: servicesImposes(etat),
      noms: Object.fromEntries(fantomesDeLUnite(etat, services, zones, base).map(f => [f.id, f.nom])
        .concat(services.map(s => [s.id, s.nom])))
    };
  }

  /* ----------------------------------------------------------------------
   *  Relire une sauvegarde, comme « Restaurer » la relit
   * --------------------------------------------------------------------*/

  /** Fond un réglage forcé dans une partie : les objets se fondent, le reste remplace. */
  function fondre(brut, force) {
    if (!objet(force)) return clone(force);
    const out = objet(brut) ? clone(brut) : {};
    for (const [k, v] of Object.entries(force)) out[k] = objet(v) && objet(out[k]) ? fondre(out[k], v) : clone(v);
    return out;
  }
  /** Les chemins des réglages forcés (« heuresSup.plafond »), pour vérifier qu'ils ont tenu. */
  const feuilles = (x, avant = '') => (objet(x) && Object.keys(x).length
    ? Object.entries(x).flatMap(([k, v]) => feuilles(v, avant ? avant + '.' + k : k)) : [avant]);
  const lire = (x, chemin) => chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), x);
  /** Un réglage forcé que le validateur n'a pas gardé est une faute de frappe : on refuse. */
  function verifierForce(valide, force, ou) {
    if (!objet(force)) return;
    for (const f of feuilles(force)) if (lire(valide, f) === undefined)
      throw new Error('réglage inconnu ou refusé : ' + ou + '.' + f + '.');
  }

  /** Les équipes visées par `options.equipes` : par identifiant, sinon par nom (sans ambiguïté). */
  function equipeVisee(ateliers, cle) {
    const parId = ateliers.filter(a => a && a.id === cle);
    if (parId.length) return parId[0];
    const parNom = ateliers.filter(a => a && a.nom === cle);
    if (parNom.length === 1) return parNom[0];
    throw new Error(parNom.length ? 'plusieurs équipes s’appellent « ' + cle + ' » : désignez-la par son identifiant.'
      : 'aucune équipe « ' + cle + ' » dans la sauvegarde.');
  }

  /* Les règles de calcul que le banc peut forcer directement (`options.heuresSup`) :
   * elles se fondent dans `ory-modele-v1`, comme `options.modele`. */
  const REGLES = ['heuresSup'];
  const CLES_OPTIONS = new Set(['delaiChargement', 'decalage', 'modele', 'ateliers', 'equipes', ...REGLES]);

  /**
   * L'unité d'une sauvegarde : chaque partie validée comme « Restaurer » la
   * valide, les réglages forcés par `options` fondus dedans AVANT validation.
   * Une partie absente vaut ce que la page a sans elle.
   */
  function uniteDeLaSauvegarde(sauvegarde, options) {
    const o = options || {};
    for (const k of Object.keys(o)) if (!CLES_OPTIONS.has(k)) throw new Error('option inconnue : « ' + k + ' ».');
    if (!sauvegarde || sauvegarde.schema !== 'ory-sauvegarde' || sauvegarde.version !== 1 || !objet(sauvegarde.contenu))
      throw new Error('ce n’est pas une sauvegarde complète (« Tout sauvegarder »).');
    const c = sauvegarde.contenu;
    const A = module_('OrlyAteliers', '../ateliers.js'), R = module_('OrlyReglages', '../reglages.js');
    const F = module_('OrlyFlows', '../flow-center.js'), PL = module_('OrlyPlan', '../plan-editor.js');
    const partie = (nom, fn) => { try { return fn(); } catch (e) { throw new Error(nom + ' — ' + e.message); } };
    const base = PB().zones();
    // Le plan : les services du plan de base, comme l'éditeur les pose (plan-editor.js).
    const originaux = Object.entries(base).map(([id, z]) => PL.validZone({ id, nom: z.nom, kind: 'service', ...PL.bounds(z), ...(z.pts ? { pts: z.pts } : {}), approx: !!z.approx }));
    const plan = c['orly-plan-v3'] === undefined ? { zones: originaux }
      : partie('plan et zones', () => PL.validatePlan(clone(c['orly-plan-v3']), originaux));
    // Les cases : les réglages forcés de l'état, puis ceux des équipes.
    let brut = c['ory-ateliers-v1'] === undefined ? A.vide() : clone(c['ory-ateliers-v1']);
    if (o.ateliers !== undefined) {
      if (!objet(o.ateliers) || 'ateliers' in o.ateliers) throw new Error('option « ateliers » : un objet, sans la liste des équipes (voir « equipes »).');
      brut = fondre(brut, o.ateliers);
    }
    if (o.equipes !== undefined) {
      if (!objet(o.equipes)) throw new Error('option « equipes » : un objet { équipe: réglages }.');
      if (!objet(brut) || !Array.isArray(brut.ateliers)) throw new Error('la sauvegarde n’a pas d’équipes.');
      for (const [cle, force] of Object.entries(o.equipes)) {
        if (!objet(force)) throw new Error('option « equipes » : les réglages de « ' + cle + ' » sont un objet.');
        const a = equipeVisee(brut.ateliers, cle);
        brut.ateliers[brut.ateliers.indexOf(a)] = fondre(a, force);
      }
    }
    const etat = partie('ateliers de travail', () => A.valider(brut));
    verifierForce(etat, o.ateliers, 'ateliers');
    // La validation garde les équipes dans leur ordre : la n-ième relue est la n-ième forcée.
    for (const [cle, force] of Object.entries(o.equipes || {}))
      verifierForce(etat.ateliers[brut.ateliers.indexOf(equipeVisee(brut.ateliers, cle))], force, 'equipes.' + cle);
    const flux = c['orly-flows-v1'] === undefined ? F.initial(PB().flux().concat(PB().fluxRetour()))
      : partie('centre des flux', () => F.validate(clone(c['orly-flows-v1'])));
    if (o.modele !== undefined && !objet(o.modele)) throw new Error('option « modele » : un objet.');
    for (const k of REGLES) if (o[k] !== undefined && !objet(o[k])) throw new Error('option « ' + k + ' » : un objet.');
    const regles = Object.fromEntries(REGLES.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
    const force = o.modele === undefined && !Object.keys(regles).length ? undefined : fondre(o.modele || {}, regles);
    const modele = partie('barème et règles de poste', () =>
      R.valider(force === undefined ? (c['ory-modele-v1'] === undefined ? null : clone(c['ory-modele-v1'])) : fondre(c['ory-modele-v1'] || {}, force)));
    verifierForce(modele, force, 'modele');
    return { etat, zones: plan.zones, base, flux, modele };
  }

  /** Les arguments de `simuler` pour une sauvegarde et les vols d'un jour. */
  function argumentsDeLaJournee(sauvegarde, vols, options) {
    const o = options || {};
    if (o.decalage !== undefined && !(Number.isInteger(+o.decalage) && +o.decalage >= -60 && +o.decalage <= 60))
      throw new Error('Décalage attendu : un nombre entier de -60 à 60 minutes.');
    const unite = uniteDeLaSauvegarde(sauvegarde, o);
    return argumentsDeLUnite(unite, volsDecales(vols, o.decalage), { ...o, delaiChargement: delaiDe(o) });
  }

  /** La journée jouée : les noms des catégories déclarés (ils nomment les commandes), puis le calcul. */
  function jouer(args) {
    P().declarerCategories(args.categories);
    return P().simuler(args);
  }

  /* ----------------------------------------------------------------------
   *  Les vols d'un fichier, comme l'import de la page (Vols › Programme)
   * --------------------------------------------------------------------*/

  const MAX_VOLS = 4 * 1024 * 1024;
  /**
   * Un CSV ou un classeur Excel → les vols, par le code de l'import de la page.
   * @param fichier { name, size, text(), arrayBuffer() } : un File du navigateur, ou de Node
   * @param lireTexte comment lire le texte d'un CSV (la page passe par FileReader)
   */
  async function volsDuFichier(fichier, lireTexte) {
    if (fichier.size > MAX_VOLS) throw new Error('Fichier trop volumineux (maximum 4 Mo). Aucune donnée remplacée.');
    const UI = module_('OrlyUI', '../ui-model.js');
    if (/\.(csv|txt)$/i.test(fichier.name)) return UI.parseFlights(await (lireTexte ? lireTexte(fichier) : fichier.text()));
    const E = module_('OrlyEchanges', '../echanges.js'), T = module_('OrlyTableur', '../tableur.js');
    return E.classeurVersVols(await T.lireFichier(fichier, MAX_VOLS));
  }

  const api = {
    argumentsDeLaJournee, argumentsDeLUnite, uniteDeLaSauvegarde, jouer, volsDuFichier, volsDecales,
    servicesDeLUnite, liaisonsDeLUnite, fantomesDeLUnite, nomDeService, estRetire, reglagesDuModele,
    classesDuProgramme, synchroniser, lotsAtelier, effectifConstant, effectifImpose, parVols,
    servicesCalcules, servicesImposes, CONSTANTS, NOMS_CONSTANTS, DELAI_CHARGEMENT
  };
  if (enNode) module.exports = api;
  else root.OrlyJournee = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
