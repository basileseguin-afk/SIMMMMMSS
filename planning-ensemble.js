/* ==========================================================================
 *  LE PLANNING, D'ABORD TOUTE L'UNITÉ (version 1, correction 18 b — README,
 *  « Lire le plan rejoué et le planning »)
 *  ------------------------------------------------------------------------
 *  Ce que le planning des équipes (planning-vue.js) montre, avant de le
 *  dessiner :
 *  — un jour de travail à la fois : les jours qui ont des lots, celui qu'on
 *    ouvre (le plus de lots), le cadre d'un jour (du premier début de lot
 *    moins 30 min à la dernière fin plus 30 min), l'échelle qui remplit la
 *    largeur (une heure fait au moins 40 px) ;
 *  — les lignes : un service par ligne, dans l'ordre des chemins, avec ses
 *    équipes qui ont des lots ce jour-là ; les services et les équipes sans
 *    lot, à part (« Sans lot ce jour ») ;
 *  — le résumé d'un service (pic, heure du pic, présents, occupation, heures
 *    sup), lu dans les indicateurs et les réponses ;
 *  — le temps sans travail avant le premier lot d'une équipe, et ce qu'elle
 *    attendait (les réponses, correction 18 a) ;
 *  — la largeur de la colonne des noms, jusqu'à 260 px.
 *  Rien n'est calculé ici : on lit le résultat du moteur, ses indicateurs
 *  (moteur/indicateurs.js) et les réponses (moteur/reponses.js). Sans
 *  navigateur : tout se teste sous Node.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const SV = () => (enNode ? require('./synthese-vue.js') : root.OrlySyntheseVue);

  const JOUR = 1440, EPS = 1e-9;
  /** Le cadre d'un jour : 30 min avant le premier lot, 30 min après le dernier. */
  const MARGE = 30;
  /** « Un jour » : une heure fait au moins 40 px ; « 6 h » : 160 px par heure ; « Toute la chaîne » : jamais moins de 4 px. */
  const PX_HEURE_JOUR = 40, PX_HEURE_SIX = 160, PX_HEURE_MIN = 4;
  /** La colonne des noms : de 160 à 260 px, selon le nom le plus long. */
  const NOMS_MIN = 160, NOMS_MAX = 260;
  /** La clé du groupe des équipes sans lot (aucun service ne porte ce nom). */
  const SANS_LOT = '§sans-lot';
  /** Une équipe qui n'a pas de lot à elle : la mise à disposition, l'appui, le handling attendent autre chose que leur amont. */
  const SANS_ATTENTE = new Set(['dispo', 'appui', 'handling']);

  const fini = x => Number.isFinite(x);
  /** Un lot de l'équipe : pas le repère d'une mise à disposition, et il a commencé. */
  const estUnLot = l => !l.dispo && fini(l.debut);
  /** Le lot tel que l'équipe l'a tenu (évolution 18) : d'un lavage par vol passé en relais, ou arrêté, sa part — son début, sa fin. */
  const tenu = (l, a) => { if (!Array.isArray(l.parts)) return l; const p = l.parts.find(x => x.atelier === a.id); return p ? { ...l, debut: p.debut, fin: p.fin } : null; };
  const lotsDe = a => (a.lots || []).map(l => tenu(l, a)).filter(l => l && estUnLot(l));
  /** Le jour de travail d'une équipe (0 : le jour des vols), celui de son poste. */
  const jourDeLEquipe = a => +a.jour || 0;
  const finDe = l => (fini(l.fin) ? l.fin : l.debut);

  /** Un nombre de personnes, à la française : un chiffre après la virgule au plus. */
  const nombre = x => String(Math.round(x * 10) / 10).replace('.', ',');
  /** Le mot d'un jour de travail, pour son onglet : « J−2 », « veille », « jour des vols », « J+1 ». */
  const motDuJour = j => (j === 0 ? 'jour des vols' : j === -1 ? 'veille' : 'J' + (j > 0 ? '+' : '−') + Math.abs(j));

  /* ---- un jour à la fois ------------------------------------------------------------ */

  /** Les jours de travail qui ont des lots, du premier au dernier : [{ jour, lots, equipes }] — `equipes` : celles qui y ont un lot. */
  function joursAvecLots(r) {
    const par = new Map();
    for (const a of (r && r.ateliers) || []) {
      const n = lotsDe(a).length; if (!n) continue;
      const j = jourDeLEquipe(a), x = par.get(j) || { jour: j, lots: 0, equipes: 0 };
      x.lots += n; x.equipes++; par.set(j, x);
    }
    return [...par.values()].sort((p, q) => p.jour - q.jour);
  }
  /** Le jour à ouvrir : celui qui a le plus de lots ; à égalité, le premier. Null sans lot. */
  function jourAOuvrir(r) {
    let mieux = null;
    for (const x of joursAvecLots(r)) if (!mieux || x.lots > mieux.lots) mieux = x;
    return mieux ? mieux.jour : null;
  }
  /**
   * Le cadre d'un jour de travail : du premier début de lot de ses équipes moins 30 min à leur dernière fin plus 30 min (un lot
   * pas fini compte à son début). Null si ce jour n'a pas de lot.
   */
  function cadreDuJour(r, jour) {
    const lots = ((r && r.ateliers) || []).filter(a => jourDeLEquipe(a) === jour).flatMap(lotsDe);
    if (!lots.length) return null;
    return { t0: Math.min(...lots.map(l => l.debut)) - MARGE, t1: Math.max(...lots.map(finDe)) + MARGE };
  }
  /**
   * La largeur d'une heure, en pixels. « Un jour » remplit la largeur visible, sans descendre sous 40 px par heure (au-delà,
   * on fait défiler) ; « 6 h » : 160 px ; « Toute la chaîne » tient dans la largeur.
   */
  function pxParHeure(zoom, largeur, t0, t1) {
    if (zoom === 'six') return PX_HEURE_SIX;
    const heures = Math.max(1 / 60, (t1 - t0) / 60);
    return zoom === 'jour' ? Math.max(PX_HEURE_JOUR, largeur / heures) : Math.max(PX_HEURE_MIN, largeur / Math.max(1, heures));
  }

  /* ---- les lignes ------------------------------------------------------------------- */

  /**
   * Les lignes du planning pour un jour de travail (`jour` null : tous les jours, pour « Toute la chaîne »), dans l'ordre des
   * services donné (`ordre`, de l'amont vers l'aval) :
   *   services : [{ service, nom, equipes, lots }] — les services dont une équipe a un lot ce jour-là, avec ces équipes ;
   *   sansLot  : [{ service, nom, equipe }] — les équipes de ce jour sans lot (une mise à disposition, une équipe sans
   *              commande), services entiers compris ; elles se rangent en bas, sous une ligne repliée.
   */
  function lignes(r, jour, ordre, nomService) {
    const nom = id => (nomService ? nomService(id) : id) || id;
    const du = ((r && r.ateliers) || []).filter(a => jour == null || jourDeLEquipe(a) === jour);
    const rang = new Map((ordre || []).map((s, i) => [s, i])), place = s => (rang.has(s) ? rang.get(s) : Infinity);
    const ids = [...new Set(du.map(a => a.service))].sort((p, q) => place(p) - place(q));
    const services = [], sansLot = [];
    for (const s of ids) {
      const toutes = du.filter(a => a.service === s), avec = toutes.filter(a => lotsDe(a).length);
      if (avec.length) services.push({ service: s, nom: nom(s), equipes: avec, lots: avec.reduce((n, a) => n + lotsDe(a).length, 0) });
      for (const a of toutes) if (!lotsDe(a).length) sansLot.push({ service: s, nom: nom(s), equipe: a });
    }
    return { services, sansLot };
  }

  /* ---- le résumé d'un service ------------------------------------------------------- */

  /** Une heure d'un jour de travail, en clair : « 09:15 », « veille 21:00 » hors du jour affiché. */
  const heureDuJour = (t, jour, affiche) => (jour === affiche ? '' : motDuJour(jour) + ' ') + P().hhmm(((t % JOUR) + JOUR) % JOUR);

  /**
   * Le résumé d'un service pour un jour de travail, lu dans sa ligne des indicateurs (`k.services`) et dans sa fin (les
   * réponses, `rep.fins`) : { jour, pic, a, presents, occupation, heuresSup } — `a` : l'heure du pic sur l'horloge de son jour ;
   * `heuresSup` en minutes × personnes. Null si la ligne n'existe pas.
   */
  function resume(k, rep, service, jour) {
    const s = ((k && k.services) || []).find(x => x.service === service && x.jour === jour);
    if (!s) return null;
    const fin = ((rep && rep.fins && rep.fins.services) || []).find(x => x.service === service && x.jour === jour);
    const pic = s.picAuTravail && fini(s.picAuTravail.personnes) ? s.picAuTravail : null, pres = s.picPresents && fini(s.picPresents.personnes) ? s.picPresents : null;
    return { jour, pic: pic ? pic.personnes : null, a: pic && pic.personnes > 0 ? pic.debut : null, presents: pres ? pres.personnes : null,
      occupation: fini(s.occupation) ? s.occupation : null, heuresSup: fin && fin.heuresSup && fini(fin.heuresSup.total) ? fin.heuresSup.total : null };
  }
  /** « pic au travail / présents », pour la ligne repliée : « 6 / 8 » ; « — » sans mesure. */
  function motsDuPic(x) {
    if (!x || x.pic == null) return '—';
    return nombre(x.pic) + (x.presents == null ? '' : ' / ' + nombre(x.presents));
  }
  /**
   * Le résumé en une phrase, entière (au survol de la ligne du service, et dans son panneau de détail) : « pic 6 au travail
   * à 09:15, 8 présents · occupation 72 % · heures sup 1 h 20 (personnes × heures) ». `affiche` : le jour affiché (le mot du
   * jour n'est dit que pour un autre jour).
   */
  function phraseDuResume(x, affiche) {
    if (!x) return '';
    const duree = m => P().dureeLisible(m), jour = affiche == null || x.jour !== affiche ? motDuJour(x.jour) + ' — ' : '';
    const pic = x.pic == null ? 'travail sans objet' : x.pic > 0 ? 'pic ' + nombre(x.pic) + ' au travail à ' + P().hhmm(x.a) : 'personne au travail';
    return jour + [pic + (x.presents == null ? '' : ', ' + nombre(x.presents) + (x.presents >= 2 ? ' présents' : ' présent')),
      x.occupation == null ? null : 'occupation ' + Math.round(x.occupation * 100) + ' %',
      x.heuresSup == null ? null : x.heuresSup > EPS ? 'heures sup ' + duree(x.heuresSup) + ' (personnes × heures)' : 'aucune heure sup'].filter(Boolean).join(' · ');
  }

  /* ---- avant le premier lot --------------------------------------------------------- */

  /**
   * Le temps sans travail avant le premier lot, par équipe : Map id → { de, a, minutes, attendait } — de son arrivée au début
   * de son premier lot, sur l'horloge ; `attendait` : ce qu'elle attendait, en mots (« attend l'ouverture de …, à 07:00 »,
   * « attend …, jusqu'à 07:00 », « attend son matériel »), lu dans les réponses (`rep.sansTravail`), ou null. Une mise à
   * disposition, une équipe d'appui et le handling n'ont pas de bande : ils n'attendent pas un amont.
   */
  function avantLePremierLot(r, rep) {
    const attendus = new Map();
    for (const s of (rep && rep.sansTravail && rep.sansTravail.services) || []) for (const a of s.attendait || []) attendus.set(a.equipe, a);
    const out = new Map();
    for (const v of (r && r.ateliers) || []) {
      if (SANS_ATTENTE.has(v.type) || !fini(v.debutPoste)) continue;
      const l = lotsDe(v).reduce((m, x) => (!m || x.debut < m.debut - EPS ? x : m), null);
      if (!l || !(l.debut - v.debutPoste >= 1 - EPS)) continue;
      const a = attendus.get(v.id);
      out.set(v.id, { de: v.debutPoste, a: l.debut, minutes: l.debut - v.debutPoste, attendait: a && SV() && SV().motsDeLAttendu ? SV().motsDeLAttendu(a) : null });
    }
    return out;
  }
  /** L'infobulle de la bande : sa durée, et ce que l'équipe attendait. */
  function motsDAvant(x) {
    return 'Sans travail avant le premier lot : ' + P().dureeLisible(x.minutes) + ' (de ' + P().hhmm(x.de) + ' à ' + P().hhmm(x.a) + ')' + (x.attendait ? '\nL’équipe ' + x.attendait + '.' : '');
  }

  /* ---- la colonne des noms ---------------------------------------------------------- */

  /** « 2 pers. », le nombre de personnes d'une équipe. */
  const motsDesPersonnes = a => nombre(+a.personnes || 0) + ' pers.';
  /**
   * La largeur de la colonne des noms : celle du texte le plus long, de 160 à 260 px. `textes` : [{ texte, taille, marge }] —
   * `marge` : ce qui entoure le texte (retrait, pastille, personnes) ; `mesurer(texte, taille)` rend une largeur en pixels.
   */
  function largeurDesNoms(textes, mesurer) {
    const besoin = Math.max(0, ...(textes || []).map(t => Math.ceil(mesurer(t.texte, t.taille || 13)) + (t.marge || 0)));
    return Math.max(NOMS_MIN, Math.min(NOMS_MAX, besoin));
  }

  /* ---- les courbes, en petit --------------------------------------------------------- */

  /**
   * Le chemin en escalier d'une série de créneaux ({ debut, valeurs }, pas `pas`, décalée de `decalage` minutes : le jour de
   * travail) entre `t0` et `t1` : chaque créneau à plat. `x(t)` et `y(v)` rendent des pixels. '' hors du cadre.
   */
  function escalier(serie, decalage, x, y, t0, t1, pas) {
    const pts = [];
    (serie.valeurs || []).forEach((v, i) => {
      const a = Math.max(t0, serie.debut + decalage + i * pas), b = Math.min(t1, serie.debut + decalage + (i + 1) * pas);
      if (b > a) pts.push([x(a), y(v)], [x(b), y(v)]);
    });
    return pts.length ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') : '';
  }

  const api = { MARGE, PX_HEURE_JOUR, PX_HEURE_SIX, NOMS_MIN, NOMS_MAX, SANS_LOT, estUnLot, lotsDe, jourDeLEquipe, nombre, motDuJour, joursAvecLots, jourAOuvrir, cadreDuJour,
    pxParHeure, lignes, heureDuJour, resume, motsDuPic, phraseDuResume, avantLePremierLot, motsDAvant, motsDesPersonnes, largeurDesNoms, escalier };
  if (enNode) module.exports = api;
  else root.OrlyPlanningEnsemble = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
