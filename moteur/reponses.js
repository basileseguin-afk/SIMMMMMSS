/* ==========================================================================
 *  LES RÉPONSES D'UNE JOURNÉE
 *  (version 1, évolution 15 — docs/CAHIER_DES_CHARGES.md, « Contrat des
 *  résultats »)
 *  ------------------------------------------------------------------------
 *  Les résultats répondent à cinq questions, dans cet ordre ; tout le reste
 *  est du détail :
 *    1. Combien de personnes faut-il, par service ?
 *    2. Où et quand ça coince ?
 *    3. À quelle heure chaque service finit-il, avec combien d'heures sup ?
 *    4. Qu'est-ce qui part en retard ? (les seules exceptions, et leur cause)
 *    5. Que change mon scénario ? (entre deux essais)
 *
 *  Ce module, sans navigateur, LIT le résultat d'une journée (moteur/
 *  production.js) et ses indicateurs de charge (moteur/indicateurs.js) ; il
 *  ne recalcule rien de ce qui existe et ne change rien. La page, les outils
 *  et les exports l'appellent : un seul chemin.
 *
 *  Les heures sont en minutes du jour J (la veille est négative), comme dans
 *  le résultat ; « le matin » se lit sur l'horloge du jour de travail.
 *  Les réponses 1, 2 et 3 se rendent par service ET par jour de travail
 *  (correction 17 a) : un service qui travaille la veille et le jour des vols
 *  a deux lignes, chacune avec ses personnes, sa file, sa fin et ses heures
 *  sup ; les mêmes lignes, dans le même ordre, dans les trois réponses.
 *  Les seuils d'alerte sont réglables et gardés dans « ory-seuils-v1 ».
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./production.js') : root.MoteurProduction);
  const IND = () => (enNode ? require('./indicateurs.js') : root.OrlyIndicateurs);
  const PARC = () => (enNode ? require('../parcours.js') : root.OrlyParcours);

  const JOUR = 1440, MIDI = 13 * 60, EPS = 1e-9;
  const fini = x => Number.isFinite(x);
  const somme = (l, f) => l.reduce((n, x) => n + (f(x) || 0), 0);
  const net = x => Math.round(x * 1e6) / 1e6;

  /* ----------------------------------------------------------------------
   *  Les seuils d'alerte : réglables, gardés, validés
   * --------------------------------------------------------------------*/

  const CLE_STOCKAGE = 'ory-seuils-v1', SCHEMA = 'ory-seuils', VERSION = 1, PREFIXE = 'seuils d’alerte';
  /**
   * Les défauts, quand rien n'est réglé : un écart de 3 personnes, une attente d'un lot de 6 h (correction 17 c : dans une
   * production par lots, un lot attend normalement son tour plusieurs heures ; à 1 h, la plupart des services étaient
   * signalés), une occupation de 95 %, pas de durée de stock, un retard de 1 min. Un réglage enregistré écrit ses cinq
   * seuils : il ne change pas.
   */
  const SEUILS_DEFAUT = Object.freeze({ ecartPersonnes: 3, attenteLot: 360, occupation: 95, dureeStockMax: null, retard: 1 });
  /** Chaque seuil : son nom, son unité, ses bornes ; `vide` : il peut rester vide (pas d'alerte). */
  const SEUILS = Object.freeze([
    { cle: 'ecartPersonnes', nom: 'Écart de personnes à signaler', unite: 'personnes', min: 0, max: 100 },
    { cle: 'attenteLot', nom: 'Attente d’un lot', unite: 'min', min: 0, max: JOUR },
    { cle: 'occupation', nom: 'Occupation', unite: '%', min: 1, max: 100 },
    { cle: 'dureeStockMax', nom: 'Durée maximale d’un stock', unite: 'min', min: 1, max: 7 * JOUR, vide: true },
    { cle: 'retard', nom: 'Retard', unite: 'min', min: 0, max: JOUR }
  ].map(Object.freeze));

  /** Des seuils complets et validés : les défauts pour ceux qui manquent ; une valeur invalide est refusée, en la nommant. */
  function seuilsComplets(x) {
    if (x === undefined || x === null) return { ...SEUILS_DEFAUT };
    if (typeof x !== 'object' || Array.isArray(x)) throw new Error(PREFIXE + ' : un objet est attendu.');
    for (const k of Object.keys(x)) if (!SEUILS.some(s => s.cle === k)) throw new Error(PREFIXE + ' : seuil inconnu « ' + k + ' ».');
    const out = {};
    for (const s of SEUILS) {
      const v = x[s.cle];
      if (v === undefined) out[s.cle] = SEUILS_DEFAUT[s.cle];
      else if (v === null && s.vide) out[s.cle] = null;
      else if (typeof v !== 'number' || !fini(v) || v < s.min || v > s.max) {
        throw new Error(PREFIXE + ' : « ' + s.nom + ' » refusé (' + (v === null ? 'vide' : JSON.stringify(v)) + ') ; un nombre de ' + s.min + ' à ' + s.max + '\u00a0'
          + s.unite + (s.vide ? ', ou vide' : '') + ' est attendu.');
      } else out[s.cle] = v;
    }
    return out;
  }
  /** Les seuils à garder, complets et validés, dans leur enveloppe (un schéma, une version). */
  function enveloppe(seuils) { return { schema: SCHEMA, version: VERSION, seuils: seuilsComplets(seuils) }; }
  /** Une enveloppe relue (le navigateur, une sauvegarde) → les seuils complets ; refusée en disant pourquoi. */
  function lireEnveloppe(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.schema !== SCHEMA) throw new Error(PREFIXE + ' : ce n’est pas un réglage « ' + SCHEMA + ' ».');
    if (x.version !== VERSION) throw new Error(PREFIXE + ' : version ' + x.version + ' inconnue (' + VERSION + ' attendue).');
    for (const k of Object.keys(x)) if (!['schema', 'version', 'seuils'].includes(k)) throw new Error(PREFIXE + ' : champ inconnu « ' + k + ' ».');
    if (!x.seuils || typeof x.seuils !== 'object' || Array.isArray(x.seuils)) throw new Error(PREFIXE + ' : les seuils manquent.');
    return seuilsComplets(x.seuils);
  }
  /** Les seuils d'une sauvegarde complète (« Tout sauvegarder ») ; sans eux (une sauvegarde d'avant), les défauts. */
  function seuilsDeLaSauvegarde(s) {
    if (!s || typeof s !== 'object' || s.schema !== 'ory-sauvegarde' || s.version !== 1 || !s.contenu || typeof s.contenu !== 'object')
      throw new Error('sauvegarde : ce n’est pas une sauvegarde complète (« Tout sauvegarder »).');
    return Object.prototype.hasOwnProperty.call(s.contenu, CLE_STOCKAGE) ? lireEnveloppe(s.contenu[CLE_STOCKAGE]) : { ...SEUILS_DEFAUT };
  }
  /** Un stock trop long : seulement si une durée maximale est réglée, et dépassée. */
  const stockTropLong = (duree, seuils) => seuils.dureeStockMax !== null && fini(duree) && duree > seuils.dureeStockMax;

  /* ----------------------------------------------------------------------
   *  Le jour de travail d'une ligne (correction 17 a)
   * --------------------------------------------------------------------*/

  /** Le jour de travail, en mots : « J−2 », « veille », « jour des vols », « J+1 ». */
  const motDuJour = j => (j === 0 ? 'jour des vols' : j === -1 ? 'veille' : 'J' + (j > 0 ? '+' : '−') + Math.abs(j));
  /**
   * Le mot du jour d'une ligne (service, jour) parmi les lignes affichées : toujours hors du jour des vols ; le jour des vols,
   * seulement quand le service a d'autres lignes (deux lignes ne portent pas le même nom). Sinon null.
   */
  function motDeLaLigne(l, lignes) {
    if (l.jour) return motDuJour(l.jour);
    return (lignes || []).some(x => x.service === l.service && x.jour !== l.jour) ? motDuJour(0) : null;
  }
  /** Les équipes du résultat d'une ligne (service, jour) des indicateurs : celles du groupe, dans l'ordre du résultat. */
  function equipesDe(r, s) {
    const ids = new Set(s.equipes || []);
    return (r.ateliers || []).filter(v => ids.has(v.id));
  }

  /* ----------------------------------------------------------------------
   *  1. Combien de personnes faut-il, par service ?
   * --------------------------------------------------------------------*/

  /** Les minutes de poste d'une équipe (sa présence moins ses pauses), ou null si son horaire ne se lit pas. */
  function posteDe(def, regime) {
    if (!def) return null;
    try { return P().minutesDuPoste(def, regime); } catch (e) { return null; }
  }
  /**
   * Le besoin d'une équipe, en personnes sur son poste : la charge du jour en homme-minutes ÷ les minutes utiles d'un poste.
   * Calculée : son besoin exact (homme-minutes ÷ poste ÷ rendement, évolution 11 a) ; un robot, une plonge saisis : ce que
   * ses lots occupent ÷ son poste (11 a) ; à la main, saisie : les homme-minutes de ses lots ÷ poste ÷ rendement. Sans
   * charge mesurée (aucun travail, une mise à disposition, une équipe d'appui, le handling) : null.
   */
  function tetesDe(v, def, e, ke, lots, args) {
    if (e) return e.poste > 0 && e.hommeMinutes > 0 ? e.hommeMinutes / e.poste / (e.rendement > 0 ? e.rendement : 1) : null;
    const poste = posteDe(def, args.regime);
    if (!(poste > 0)) return null;
    if (v.type === 'robot' || v.type === 'lavage') return ke && ke.hommeMinutes > 0 ? ke.hommeMinutes / poste : null;
    if (v.type !== 'manuel') return null;
    const hm = somme(lots, l => l.hommeMinutes), rendement = args.rendement > 0 ? args.rendement : 1;
    return hm > 0 ? hm / poste / rendement : null;
  }
  /** Les équipes qui n'ont pas de besoin calculé depuis une charge : une mise à disposition (permanente), une équipe d'appui saisie, un handling. */
  const TYPES_FIXES = new Set(['dispo', 'appui', 'handling']);
  /**
   * Les équipes : leurs présents (ETP, K8) et leur besoin, rapporté à la présence générale comme les présents.
   * Correction 17 (c) : un **poste fixe** (`fixe`) — une mise à disposition, une équipe d'appui saisie, un handling, sans
   * charge mesurée — n'a pas de besoin ; un handling à chauffeurs (son plan, ou ses créneaux saisis) compte ses chauffeurs,
   * les personnes de ses colonnes Matin et Après-midi : leurs minutes de vacation ÷ la présence générale ; les personnes
   * saisies à l'équipe ne sont alors pas comptées (`horsCompte`).
   */
  function equipesDuJour(r, args, k) {
    const defs = new Map((args.ateliers || []).map(a => [a.id, a])), ke = new Map(k.equipes.map(e => [e.id, e])), lots = new Map();
    for (const l of r.lots || []) if (l.atelier && !l.dispo) { if (!lots.has(l.atelier)) lots.set(l.atelier, []); lots.get(l.atelier).push(l); }
    const generale = P().normaliserRegime(null, args.regime).presence;
    return (r.ateliers || []).map(v => {
      const x = ke.get(v.id) || {}, def = defs.get(v.id);
      const chauffeurs = v.type === 'handling' && generale > 0 ? IND().chauffeursDe(v, def) : null;
      const presents = chauffeurs ? somme(chauffeurs, c => (+c.n || 0) * Math.max(0, c.a - c.de)) / generale : IND().etpDe(v, args.regime);
      const t = tetesDe(v, def, (r.effectifs || {})[v.id], x, lots.get(v.id) || [], args), fixe = t === null && TYPES_FIXES.has(v.type);
      return { id: v.id, nom: v.nom, service: v.service, jour: fini(x.jour) ? x.jour : 0, presents, mesure: t !== null, fixe,
        chauffeurs: !!chauffeurs, horsCompte: chauffeurs ? +v.personnes || 0 : 0,
        besoin: fixe ? 0 : t === null ? presents : t * IND().etpDe({ personnes: 1, presence: v.presence }, args.regime) };
    });
  }
  /** Le plus haut d'une série de créneaux sur un intervalle de l'horloge du jour de travail : { valeur, debut }. */
  function maxSur(c, serie, garder) {
    let m = null;
    if (serie) serie.valeurs.forEach((x, i) => { const t = serie.debut + i * IND().PAS; if (garder(t) && (!m || x > m.valeur)) m = { valeur: x, debut: t }; });
    return m;
  }
  /** Le matin (avant 13:00 du jour de travail) ou l'après-midi : les présents et le pic au travail (son heure, en minutes du jour J). */
  function moitie(c, jour, garder) {
    const p = maxSur(c, c.presents, garder), t = maxSur(c, c.auTravail, garder);
    return { presents: p ? p.valeur : null, auTravail: t ? t.valeur : null, a: t && t.valeur > 0 ? t.debut + jour * JOUR : null };
  }
  /**
   * Par service et jour de travail : besoin, présents, écart ; matin, après-midi ; pic et occupation, ceux des indicateurs.
   * Correction 17 (c) : une ligne dont toutes les équipes sont des postes fixes est `fixe` — pas de besoin, pas d'écart ;
   * `fixes` : ses présents en postes fixes, qui ne comptent ni dans le besoin ni dans l'écart ; l'écart ne se signale que
   * s'il **manque** des personnes (un surplus n'est pas une alerte). L'unité : il faut `besoin` personnes (hors postes
   * fixes), `presents` sont présentes, dont `fixes` en postes fixes ; l'écart compare les présents hors postes fixes au besoin.
   */
  function personnes(r, args, k, seuils) {
    const equipes = equipesDuJour(r, args, k), nom = nomDe(args);
    const services = k.services.map(s => {
      const eqs = equipes.filter(e => e.service === s.service && e.jour === s.jour), calculees = eqs.filter(e => !e.fixe);
      const fixe = eqs.length > 0 && !calculees.length, charge = net(somme(calculees, e => e.besoin));
      const presents = net(somme(eqs, e => e.presents)), fixes = net(somme(eqs.filter(e => e.fixe), e => e.presents));
      const besoin = fixe ? null : Math.ceil(charge - EPS) || 0, ecart = fixe ? null : net(presents - fixes - besoin);
      const sens = ecart === null ? null : ecart > EPS ? 'sur' : ecart < -EPS ? 'sous' : null;
      return { service: s.service, nom: nom(s.service), jour: s.jour, besoin, charge, presents, fixes, fixe, ecart, sens,
        signale: sens === 'sous' && Math.abs(ecart) >= seuils.ecartPersonnes - EPS,
        chauffeurs: eqs.some(e => e.chauffeurs), horsCompte: somme(eqs, e => e.horsCompte),
        matin: moitie(s.creneaux, s.jour, t => t < MIDI), apresMidi: moitie(s.creneaux, s.jour, t => t >= MIDI),
        pic: s.picAuTravail ? { personnes: s.picAuTravail.personnes, a: s.picAuTravail.debut + s.jour * JOUR } : null,
        occupation: s.occupation,
        equipes: eqs.map(e => ({ id: e.id, nom: e.nom, presents: net(e.presents), besoin: net(e.besoin), mesure: e.mesure, fixe: e.fixe })) };
    });
    const total = { besoin: somme(services, s => s.besoin), presents: net(somme(services, s => s.presents)), fixes: net(somme(services, s => s.fixes)) };
    return { services, total: { ...total, ecart: net(total.presents - total.fixes - total.besoin) } };
  }

  /* ----------------------------------------------------------------------
   *  2. Où et quand ça coince ?
   * --------------------------------------------------------------------*/

  /** Ce qu'une équipe a attendu de l'amont : de la fin de son lot précédent (ou de son arrivée) à l'instant où le lot suivant est prêt. */
  function attentesAmont(v) {
    if (v.type === 'lavage' || !fini(v.debutPoste)) return [];
    const lots = v.lots.filter(l => !l.dispo && fini(l.debut)).sort((p, q) => p.debut - q.debut), out = [];
    let libre = v.debutPoste;
    for (const l of lots) {
      if (fini(l.pret) && l.pret > libre + EPS) out.push({ de: libre, a: Math.min(l.pret, l.debut) });
      if (!fini(l.fin)) break;
      libre = Math.max(libre, l.fin);
    }
    return out;
  }
  const chevauche = (x, liste) => somme(liste, y => Math.max(0, Math.min(x.a, y.a) - Math.max(x.de, y.de)));

  /** Les lots en file d'un service, chacun avec son attente, sa part de matériel et sa part passée à attendre l'amont. */
  function fileDuService(equipes, ke) {
    const out = [];
    for (const v of equipes) {
      const x = ke.get(v.id);
      if (!x || (x.sansObjet && x.sansObjet.enFile)) continue;
      const amont = attentesAmont(v);
      for (const f of IND().fileDe(v) || []) {
        const minutes = Math.max(0, f.a - f.de);
        out.push({ ...f, equipe: v.id, minutes, materiel: Math.min(minutes, +f.lot.attenteMateriel || 0), amont: chevauche(f, amont) });
      }
    }
    return out;
  }
  /**
   * L'occupation d'un service pendant sa file : au travail ÷ (présents − en pause) des équipes qui tiennent les lots en
   * file, sur les créneaux où l'un d'eux attend (un robot inoccupé à côté d'une équipe débordée ne la dilue pas).
   */
  function occupationPendant(equipes) {
    let travail = 0, dispo = 0;
    for (const e of equipes) {
      const c = e.creneaux;
      if (!c.enFile || !c.auTravail || !c.presents) continue;
      c.enFile.valeurs.forEach((n, i) => {
        if (!(n > EPS)) return;
        const t = c.enFile.debut + i * IND().PAS, j = (t - c.auTravail.debut) / IND().PAS, p = (t - c.presents.debut) / IND().PAS;
        travail += c.auTravail.valeurs[j] || 0;
        dispo += Math.max(0, (c.presents.valeurs[p] || 0) - ((c.enPause && c.enPause.valeurs[(t - c.enPause.debut) / IND().PAS]) || 0));
      });
    }
    return dispo > EPS ? travail / dispo : null;
  }
  /**
   * La cause d'une file : « matériel » si les lots attendent surtout leur matériel (K9) ; sinon « personnel » si le service est
   * occupé au-delà du seuil pendant sa file ; sinon « amont » si ses personnes attendent le service d'avant ; sinon
   * « matériel » s'il en a manqué ; sinon aucune.
   */
  function causeDe(cumul, parts, occupation, seuils) {
    if (!(cumul > EPS)) return null;
    if (parts.materiel > EPS && parts.materiel >= cumul / 2 - EPS) return 'materiel';
    if (occupation !== null && occupation * 100 > seuils.occupation + EPS) return 'personnel';
    if (parts.amont > EPS) return 'amont';
    return parts.materiel > EPS ? 'materiel' : null;
  }
  /** Le moment où ça coince : le morceau d'un seul tenant de la file où l'attente s'accumule le plus. */
  function fenetreDe(file) {
    const tries = file.filter(f => f.minutes > EPS).sort((p, q) => p.de - q.de), morceaux = [];
    for (const f of tries) {
      const d = morceaux[morceaux.length - 1];
      if (d && f.de <= d.a + EPS) { d.a = Math.max(d.a, f.a); d.cumul += f.minutes; } else morceaux.push({ de: f.de, a: f.a, cumul: f.minutes });
    }
    return morceaux.reduce((m, x) => (!m || x.cumul > m.cumul + EPS ? x : m), null);
  }
  /**
   * Ce qui part en retard par les lots d'une ligne (ses équipes) : les commandes prêtes après leur limite ou pas finies
   * qu'ils portent ; au handling, les vols chargés après leur limite ou pas chargés. Rend leur nombre.
   */
  function retardsDe(equipes, r, seuils) {
    const ids = new Set(equipes.map(v => v.id)), par = r.parClasse || {}, vus = new Set();
    const tard = c => c && !c.absente && (c.fin == null || (c.fin > c.echeance + EPS && c.fin - c.echeance >= seuils.retard - EPS));
    for (const l of r.lots || []) {
      if (!ids.has(l.atelier) || l.dispo) continue;
      if (l.handling) { if (l.fin == null || (l.aHeure === false && (+l.retard || 0) >= seuils.retard - EPS)) vus.add('vol ' + l.vol); }
      else for (const c of l.classes || []) if (tard(par[c])) vus.add(c);
    }
    return vus.size;
  }

  /**
   * Par service et jour de travail (les lignes des indicateurs) : sa file la plus longue, l'attente la plus longue d'un lot,
   * le cumul ; la cause ; ce qui part en retard par ses lots (`enRetard`). Le goulot du jour, qui dit son jour de travail
   * (correction 17 c) : parmi les lignes qui dépassent le seuil d'attente ET qui finissent après leur horaire (`fins`) ou
   * font partir une commande ou un vol en retard, celle au plus grand cumul d'attente. Sinon : rien ne coince — les attentes
   * restent dans les lignes.
   */
  function coince(r, args, k, seuils, fins) {
    const ke = new Map(k.equipes.map(e => [e.id, e])), nom = nomDe(args);
    const depasse = new Map(((fins && fins.services) || []).map(f => [f.service + '|' + f.jour, f.depasse]));
    const services = k.services.map(s => {
      const membres = new Set(s.equipes || []), file = fileDuService(equipesDe(r, s), ke), cumul = net(somme(file, f => f.minutes));
      const pire = file.reduce((m, f) => (f.minutes > EPS && (!m || f.minutes > m.minutes + EPS) ? f : m), null);
      const parts = { materiel: net(somme(file, f => f.materiel)), amont: net(somme(file, f => f.amont)) };
      const occupationFile = occupationPendant(k.equipes.filter(e => membres.has(e.id) && e.creneaux));
      const plus = IND().fileMax(file);
      return { service: s.service, nom: nom(s.service), jour: s.jour, file: plus.lots ? plus : null, cumul, parts, occupationFile,
        cause: causeDe(cumul, parts, occupationFile, seuils), enRetard: retardsDe(equipesDe(r, s), r, seuils),
        attenteMax: pire ? { minutes: net(pire.minutes), lot: pire.lot.nom, equipe: pire.equipe, de: pire.de, a: pire.a } : null, fenetre: fenetreDe(file) };
    });
    // Le goulot (le contrat, R2) : une attente au-delà du seuil ET une fin après l'horaire ou un départ en retard ; le plus grand cumul.
    const apres = s => +depasse.get(s.service + '|' + s.jour) || 0;
    const candidats = services.filter(s => s.cumul > EPS && s.attenteMax && s.fenetre && s.attenteMax.minutes > seuils.attenteLot + EPS
      && (apres(s) > EPS || s.enRetard > 0));
    const g = candidats.reduce((m, s) => (!m || s.cumul > m.cumul + EPS ? s : m), null);
    const goulot = g ? { service: g.service, nom: g.nom, jour: g.jour, cause: g.cause, de: g.fenetre.de, a: g.fenetre.a, attenteMax: g.attenteMax.minutes,
      cumul: g.cumul, depasse: net(apres(g)), enRetard: g.enRetard } : null;
    return { services: services.map(({ fenetre, ...s }) => s), goulot };
  }

  /* ----------------------------------------------------------------------
   *  3. À quelle heure chaque service finit-il, avec combien d'heures sup ?
   * --------------------------------------------------------------------*/

  /** Les heures sup d'une équipe, en minutes × personnes : celles que la Synthèse compte (une plonge à tunnels : ses seules personnes restées). */
  const heuresSupDe = v => (v.heuresSup > 0 ? (fini(v.heuresSupPersonnes) ? v.heuresSupPersonnes : (+v.personnes || 0) * v.heuresSup) : 0);
  /** La fin de l'horaire d'une équipe : au handling, celle de ses vacations de chauffeurs ; ailleurs, son début de poste + sa présence. */
  function finHoraireDe(v, def) {
    const chauffeurs = v.type === 'handling' ? IND().chauffeursDe(v, def) : null;
    if (chauffeurs) return Math.max(...chauffeurs.map(x => x.a));
    return fini(v.debutPoste) && fini(v.presence) ? v.debutPoste + v.presence : null;
  }
  /**
   * Par service et jour de travail (les lignes des indicateurs) : la fin de son dernier lot, la fin de son horaire (les
   * équipes qui travaillent, pas une mise à disposition), ce qui dépasse — équipe par équipe, le plus grand dépassement (une
   * équipe qui finit tard dans son horaire n'en cache pas une autre qui déborde du sien) ; ses heures sup (équipes, renforts
   * prêtés, chauffeurs). Les équipes de la veille ne prêtent ni leur fin ni leurs heures sup à celles du jour des vols.
   */
  function fins(r, args, k) {
    const nom = nomDe(args), defs = new Map((args.ateliers || []).map(a => [a.id, a]));
    const max = l => (l.length ? Math.max(...l) : null);
    const services = k.services.map(s => {
      const eqs = equipesDe(r, s), travail = eqs.filter(v => v.type !== 'dispo');
      const parEquipe = travail.map(v => ({ id: v.id, nom: v.nom, fin: fini(v.fin) ? v.fin : null, finHoraire: finHoraireDe(v, defs.get(v.id)) }))
        .map(e => ({ ...e, depasse: e.fin !== null && fini(e.finHoraire) ? net(Math.max(0, e.fin - e.finHoraire)) : null }));
      const hs = { equipes: net(somme(eqs, heuresSupDe)), renforts: net(somme(eqs, v => v.renfortsHeuresSup)), chauffeurs: net(somme(eqs, v => v.heuresSupChauffeurs)) };
      return { service: s.service, nom: nom(s.service), jour: s.jour, fin: max(parEquipe.map(e => e.fin).filter(fini)),
        finHoraire: max(parEquipe.map(e => e.finHoraire).filter(fini)), depasse: max(parEquipe.map(e => e.depasse).filter(fini)),
        heuresSup: { ...hs, total: net(hs.equipes + hs.renforts + hs.chauffeurs) }, equipes: parEquipe };
    });
    return { services };
  }

  /* ----------------------------------------------------------------------
   *  4. Qu'est-ce qui part en retard ?
   * --------------------------------------------------------------------*/

  /** Les mots des causes d'un vol, ceux des pages (le tableau des vols, la fiche du handling). */
  const CAUSES_VOL = Object.freeze({ commande: 'commande pas prête', chauffeur: 'faute de chauffeur', vehicule: 'faute de véhicule', fenetre: 'fenêtre trop courte' });
  /** Pourquoi un vol n'est pas chargé : les phrases du tableau des vols, selon l'état que le moteur lui donne. */
  const PAS_CHARGE = Object.freeze({
    chauffeurs: v => 'pas assez de chauffeurs (' + v.chauffeurs + ' pour un ' + (v.categorie === 'long' ? 'long' : 'court') + ' courrier)',
    bloque: v => 'le handling attend ' + ((v.attendu || []).map(x => P().libelleClasse(x.classe)).join(', ') || 'un vol précédent'),
    poste: () => 'poste du handling fini',
    vehicule: v => 'pas de véhicule libre (' + (v.vehicule === 'vl' ? 'VL' : 'gros camion') + ')',
    fenetre: v => 'pas le temps de le charger avant ' + P().hhmm(v.limite)
  });

  /**
   * Pourquoi une commande est prête après sa limite (V7) : l'étape de son chemin qui a le plus attendu, et ce qu'elle
   * attendait ; sans attente, l'étape qui la finit. Le handling n'y compte pas : une commande est prête avant lui.
   */
  function causeCommande(r, args, id) {
    const nom = nomDe(args), dl = P().dureeLisible, c = (r.classes || []).find(x => x.id === id);
    const handling = new Set((r.ateliers || []).filter(v => v.type === 'handling').map(v => v.service));
    const parcours = c ? PARC().fluxDe(args, c) : null;
    const etapes = parcours ? PARC().chronogramme(r, parcours, id).etapes.filter(e => !handling.has(e.service)) : [];
    const g = etapes.filter(e => e.attendu).sort((p, q) => q.attente - p.attente)[0];
    if (g) return { code: 'attente', mot: 'attente de l’amont', phrase: 'Le plus long à attendre : ' + nom(g.service) + ' a attendu ' + dl(g.attente) + ' que ' + nom(g.attendu) + ' finisse.' };
    const l = (r.lots || []).filter(x => !x.handling && !x.dispo && fini(x.fin) && (x.classes || []).includes(id)).sort((p, q) => q.fin - p.fin)[0];
    return { code: 'travail', mot: 'finie trop tard', phrase: l ? nom(l.service) + ' la finit à ' + P().hhmm(l.fin) + ', sans attendre l’amont.' : null };
  }
  /** La cause d'un vol chargé après sa limite : celle du moteur ; au handling classique, la commande, les chauffeurs ou la fenêtre. */
  function causeVol(v, r, args) {
    const code = v.cause || (fini(v.pret) && v.pret + (v.fin - v.debut) > v.depart + EPS ? 'commande' : v.attenteChauffeurs >= 1 ? 'chauffeur' : 'fenetre');
    const derniere = (v.classes || []).map(id => (r.parClasse || {})[id]).filter(c => c && fini(c.fin)).sort((p, q) => q.fin - p.fin)[0];
    return { code, mot: CAUSES_VOL[code], phrase: code === 'commande' && derniere ? causeCommande(r, args, derniere.id).phrase : null };
  }
  /** Les départs : chaque vol, ses commandes, et ce que le handling en a fait. */
  function departs(r) {
    const out = new Map(), charges = new Map((r.vols || []).map(v => [v.id, v]));
    for (const c of r.classes || []) for (const x of c.vols || []) {
      const d = out.get(x.id) || { id: x.id, cie: c.cie, depart: x.depart, classes: [] };
      d.depart = Math.min(d.depart, x.depart); d.classes.push(c.id); out.set(x.id, d);
    }
    for (const v of r.vols || []) if (!out.has(v.id)) out.set(v.id, { id: v.id, cie: v.cie, depart: v.depart, classes: (v.classes || []).slice() });
    return [...out.values()].map(d => ({ ...d, handling: charges.get(d.id) || null }));
  }
  /** Un vol : sans équipe, pas chargé, pas prêt, ou chargé après sa limite ; sinon rien. */
  function exceptionVol(d, r, args, seuils) {
    const par = r.parClasse || {}, lib = ids => ids.map(id => P().libelleClasse(id)).join(', '), v = d.handling;
    const base = { id: d.id, cie: d.cie, depart: d.depart, limite: v && fini(v.limite) ? v.limite : d.depart };
    const sans = d.classes.filter(id => par[id] && par[id].absente);
    if (sans.length) return { type: 'sans-equipe', ...base, fin: null, retard: null, cause: { code: 'sans-equipe', mot: 'commandes sans équipe', phrase: 'pas encore d’équipe : ' + lib(sans) } };
    if (v && v.fin == null) {
      const etat = PAS_CHARGE[v.etat] ? v.etat : 'poste';
      return { type: 'vol-pas-charge', ...base, fin: null, retard: null, cause: { code: etat, mot: 'pas chargé', phrase: PAS_CHARGE[etat](v) } };
    }
    if (v) return !v.aHeure && v.retard >= seuils.retard - EPS ? { type: 'vol-en-retard', ...base, fin: v.fin, retard: net(v.retard), cause: causeVol(v, r, args) } : null;
    const pas = d.classes.filter(id => par[id] && par[id].fin == null);
    return pas.length ? { type: 'vol-pas-pret', ...base, fin: null, retard: null, cause: { code: 'pas-prete', mot: 'pas prêt', phrase: 'pas prête : ' + lib(pas) } } : null;
  }
  const RANG = { 'sans-equipe': 0, 'vol-pas-charge': 1, 'vol-pas-pret': 1, 'vol-en-retard': 2, 'commande-en-retard': 3 };
  /** Les seules exceptions : les vols sans équipe, pas chargés ou pas prêts, puis chargés en retard, puis les commandes prêtes en retard. */
  function exceptions(r, args, seuils) {
    const vols = departs(r).map(d => exceptionVol(d, r, args, seuils)).filter(Boolean);
    const commandes = Object.values(r.parClasse || {}).filter(c => !c.absente && fini(c.fin) && c.fin > c.echeance + EPS && c.fin - c.echeance >= seuils.retard - EPS)
      .map(c => ({ type: 'commande-en-retard', id: c.id, cie: c.cie, libelle: P().libelleClasse(c.id), limite: c.echeance, fin: c.fin, retard: net(c.fin - c.echeance),
        cause: causeCommande(r, args, c.id) }));
    return vols.concat(commandes).sort((p, q) => RANG[p.type] - RANG[q.type] || (q.retard || 0) - (p.retard || 0) || p.limite - q.limite || String(p.id).localeCompare(String(q.id)));
  }

  /* ----------------------------------------------------------------------
   *  Les comptes (évolution 15 c) : chacun dit son périmètre
   * --------------------------------------------------------------------*/

  /** Une commande d'équipement (armement, dotation, roulés couverts) : une catégorie par compagnie, « CIE/@… », sans repas. */
  const equipement = id => /\/@/.test(String(id));
  /**
   * Les comptes de la journée, les mêmes pour la Synthèse et les pages de détail : les vols que le handling charge ; à
   * part, les commandes sans avion (aucun de leurs vols n'est chargé par le handling) ; les commandes de repas et, à part,
   * celles d'équipement ; les commandes que personne ne prépare. Ils réunissent les indicateurs de la journée, sans rien
   * recompter autrement : à l'heure, en retard, pas finies, comme K1 et K2.
   */
  function comptes(r) {
    const toutes = Object.values(r.parClasse || {}), suivies = toutes.filter(c => !c.absente), vols = r.vols || [];
    const groupe = l => ({ suivies: l.length, aHeure: l.filter(c => c.aHeure).length, enRetard: l.filter(c => c.fin != null && !c.aHeure).length,
      pasFinies: l.filter(c => c.fin == null).length });
    const charges = new Set(vols.map(v => v.id)), volsDe = new Map((r.classes || []).map(c => [c.id, (c.vols || []).map(v => v.id)]));
    return {
      vols: { suivis: vols.length, charges: vols.filter(v => v.fin != null).length, aHeure: vols.filter(v => v.aHeure).length },
      sansAvion: charges.size ? suivies.filter(c => !(volsDe.get(c.id) || []).some(id => charges.has(id))).length : 0,
      repas: groupe(suivies.filter(c => !equipement(c.id))), equipement: groupe(suivies.filter(c => equipement(c.id))),
      sansEquipe: toutes.length - suivies.length
    };
  }

  /* ----------------------------------------------------------------------
   *  Les réponses, et 5. ce que change un scénario
   * --------------------------------------------------------------------*/

  /** Le nom d'un service : celui de l'unité, sinon son identifiant. */
  const nomDe = args => id => ((args && args.noms) || {})[id] || id;

  /**
   * Les réponses d'une journée. `r` : ce que rend MoteurProduction.simuler ; `args` : ses arguments ; `o.seuils` : les seuils
   * (sans eux, les défauts) ; `o.k` : les indicateurs de charge déjà calculés (sinon, ils le sont). Rien n'est modifié.
   */
  function reponses(r, args, o = {}) {
    if (!r || r.ok === false) return null;
    const a = args || {}, seuils = seuilsComplets(o.seuils), k = o.k || IND().journee(r, a);
    const f = fins(r, a, k);
    return { seuils, personnes: personnes(r, a, k, seuils), coince: coince(r, a, k, seuils, f), fins: f, exceptions: exceptions(r, a, seuils), comptes: comptes(r) };
  }

  /** Une différence : la valeur de A, celle de B, et B − A (null si l'une manque). */
  const ecartAB = (a, b) => ({ a: a ?? null, b: b ?? null, d: a != null && b != null ? net(b - a) : null });
  /** Les lignes de deux listes réunies par leur clé, dans l'ordre de A puis celles de B seules. */
  function reunirAB(la, lb, cle) {
    const ma = new Map(la.map(x => [cle(x), x])), mb = new Map(lb.map(x => [cle(x), x]));
    return [...new Set([...ma.keys(), ...mb.keys()])].map(id => [ma.get(id) || null, mb.get(id) || null]);
  }
  /** 5. Ce que change un scénario : B − A sur chacune des quatre réponses ; null s'il manque l'un des deux essais. */
  function comparer(A, B) {
    if (!A || !B) return null;   // un essai qui n'a pas pu se jouer : rien à comparer
    const champ = (x, f) => (x ? f(x) : null), cleEx = x => x.type + '|' + x.id, ligne = s => s.service + '|' + s.jour;
    const services = reunirAB(A.personnes.services, B.personnes.services, ligne).map(([a, b]) => ({ service: (a || b).service, jour: (a || b).jour, nom: (a || b).nom,
      besoin: ecartAB(champ(a, x => x.besoin), champ(b, x => x.besoin)), presents: ecartAB(champ(a, x => x.presents), champ(b, x => x.presents)),
      ecart: ecartAB(champ(a, x => x.ecart), champ(b, x => x.ecart)),
      // Un poste fixe n'a ni besoin ni écart (null) : `fixe` le dit, pour ne pas le lire comme un service absent de l'essai.
      fixe: { a: champ(a, x => !!x.fixe), b: champ(b, x => !!x.fixe) } }));
    const t = k => ecartAB(A.personnes.total[k], B.personnes.total[k]), ga = A.coince.goulot, gb = B.coince.goulot;
    const exA = new Set(A.exceptions.map(cleEx)), exB = new Set(B.exceptions.map(cleEx));
    return {
      personnes: { total: { besoin: t('besoin'), presents: t('presents'), ecart: t('ecart') }, services },
      coince: { goulot: { a: ga ? ga.service : null, b: gb ? gb.service : null, jourA: ga ? ga.jour : null, jourB: gb ? gb.jour : null,
        change: (ga ? ligne(ga) : null) !== (gb ? ligne(gb) : null) },
        services: reunirAB(A.coince.services, B.coince.services, ligne).map(([a, b]) => ({ service: (a || b).service, jour: (a || b).jour, nom: (a || b).nom,
          attenteMax: ecartAB(champ(a, x => (x.attenteMax ? x.attenteMax.minutes : 0)), champ(b, x => (x.attenteMax ? x.attenteMax.minutes : 0))),
          cumul: ecartAB(champ(a, x => x.cumul), champ(b, x => x.cumul)) })) },
      fins: { services: reunirAB(A.fins.services, B.fins.services, ligne).map(([a, b]) => ({ service: (a || b).service, jour: (a || b).jour, nom: (a || b).nom,
        fin: ecartAB(champ(a, x => x.fin), champ(b, x => x.fin)), heuresSup: ecartAB(champ(a, x => x.heuresSup.total), champ(b, x => x.heuresSup.total)) })) },
      exceptions: { nombre: ecartAB(A.exceptions.length, B.exceptions.length),
        nouvelles: B.exceptions.filter(x => !exA.has(cleEx(x))), reglees: A.exceptions.filter(x => !exB.has(cleEx(x))) }
    };
  }

  const api = { CLE_STOCKAGE, SEUILS_DEFAUT, SEUILS, CAUSES_VOL, seuilsComplets, enveloppe, lireEnveloppe, seuilsDeLaSauvegarde, stockTropLong,
    reponses, comparer, comptes, equipement, motDuJour, motDeLaLigne };
  if (enNode) module.exports = api;
  else root.OrlyReponses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
