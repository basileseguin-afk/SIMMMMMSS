/* ==========================================================================
 *  LE PLANNING DATÉ — rejouer une période à effectif imposé (banc d'essai de
 *  la version 1, évolution 11 f — docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Un fichier « Planning » (CSV, ou la feuille « Planning » d'un classeur),
 *  comme celui du calage de la version 2 (docs/CALAGE.md) : une ligne par
 *  jour des vols, service et équipe, son heure de début, sa fin, ses
 *  personnes, et son jour (−1 : la veille des vols). Dans une période, un jour
 *  qui a des lignes de planning se rejoue avec elles :
 *    — chaque équipe nommée prend son début, sa fin (une fin avant le début
 *      passe minuit) et ses personnes, à effectif imposé ;
 *    — une équipe d'un service qui a des lignes ce jour-là, mais pas elle, ne
 *      travaille pas ;
 *    — un service sans ligne garde ses équipes ;
 *    — les heures sup vont jusqu'à 12 h, pour que le débordement se voie.
 *  Un jour sans planning se joue comme aujourd'hui. Le facteur de travail
 *  d'un service (le calage du travail) multiplie ses homme-minutes : son
 *  barème, les minutes propres de ses cases, les minutes par vol de ses
 *  équipes d'appui et celles de son armement. Sans navigateur : la page et
 *  les outils appellent ce module.
 *
 *  ⚠ Le planning réel ne va jamais dans le dépôt ; la page le garde en
 *  mémoire, le temps de la page.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const module_ = (nom, chemin) => (enNode ? require(chemin) : root[nom]);
  const T = () => module_('OrlyTableur', '../tableur.js');
  const U = () => module_('OrlyUI', '../ui-model.js');

  const MAX_LIGNES = 100000, MAX_OCTETS = 50 * 1024 * 1024;
  /** Les heures sup permises pendant un rejeu : 12 h, pour que le débordement s'exprime. */
  const PLAFOND_REJEU = 720;
  const COLONNES = ['date', 'service', 'equipe', 'debut', 'fin', 'personnes'];
  const cle = s => T().cleEntete(s);
  const hhmm = t => { const x = ((t % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

  /* ----------------------------------------------------------------------
   *  Lire le planning
   * --------------------------------------------------------------------*/

  /** La feuille du planning : « Planning » dans un classeur, la seule d'un CSV. */
  function feuilleDuPlanning(feuilles) {
    const l = Array.isArray(feuilles) ? feuilles : [];
    const f = T().feuille(l, 'Planning', 'Prévu', 'Prevu') || (l.length === 1 ? l[0] : null);
    if (!f) throw new Error('feuille « Planning » introuvable.');
    return f;
  }

  /**
   * Lit le planning (ses feuilles, comme tableur.js les rend), contre l'unité :
   * `unite` = { services: [{ id, nom }], ateliers: [{ id, nom, service, type }] }.
   * Un service ou une équipe se reconnaît à son identifiant ou à son nom, sans
   * tenir compte de la casse ni des accents. Un nom inconnu, une heure ou des
   * personnes illisibles, une équipe deux fois le même jour : le fichier est
   * refusé entier, et le message nomme la ligne.
   * @returns {{ jours: { [date]: [{ ligne, service, equipe, debut, fin, duree, personnes, jour (null : celui de l'équipe) }] }, dates, lignes }}
   */
  function lirePlanning(feuilles, unite) {
    const f = feuilleDuPlanning(feuilles);
    const { entetes, objets } = T().enObjets(f.lignes);
    for (const c of COLONNES)
      if (!entetes.includes(c)) throw new Error('colonne « ' + c + ' » manquante (attendu : ' + COLONNES.join(', ') + ', et jour, facultatif).');
    if (!objets.length) throw new Error('aucune ligne de planning.');
    if (objets.length > MAX_LIGNES) throw new Error('trop de lignes (' + MAX_LIGNES + ' au plus).');
    const services = (unite && unite.services) || [], ateliers = ((unite && unite.ateliers) || []).filter(a => a.type !== 'dispo');
    const service = T().correspondance(services), jours = {}, vus = new Set();
    for (const x of objets) {
      const l = lignePlanning(x, service, ateliers);
      const k = l.date + '|' + l.equipe;
      if (vus.has(k)) throw new Error('ligne ' + x._ligne + ' : l’équipe « ' + String(x.equipe ?? '').trim() + ' » est déjà au planning ce jour-là.');
      vus.add(k);
      (jours[l.date] = jours[l.date] || []).push(l);
    }
    return { jours, dates: Object.keys(jours).sort(), lignes: objets.length };
  }

  /** Une ligne du planning, validée ; refusée en nommant la ligne. */
  function lignePlanning(x, service, ateliers) {
    try {
      const date = U().dateDe(x.date);
      if (!date) throw new Error('date manquante');
      let s;
      try { s = service(x.service); } catch (e) { throw new Error(e.message); }
      if (!s) throw new Error('service inconnu « ' + String(x.service ?? '').trim() + ' »');
      const nom = String(x.equipe ?? '').trim(), dans = ateliers.filter(e => e.service === s);
      const parId = dans.find(e => e.id === nom), parNom = dans.filter(e => cle(e.nom) === cle(nom));
      if (!parId && parNom.length > 1) throw new Error('« ' + nom + ' » désigne plusieurs équipes de ce service : utilisez son identifiant');
      const a = parId || parNom[0];
      if (!a) throw new Error('équipe inconnue « ' + nom + ' » dans ce service');
      let debut, fin;
      try { debut = T().heureDe(x.debut); fin = T().heureDe(x.fin); } catch (e) { throw new Error('debut et fin : ' + e.message); }
      if (debut === null || fin === null) throw new Error('debut et fin obligatoires (HH:MM)');
      if (debut >= 1440 || fin >= 1440) throw new Error('debut et fin : une heure de 00:00 à 23:59 (une fin avant le début passe minuit)');
      let personnes;
      try { personnes = T().nombreDe(x.personnes, null); } catch (e) { personnes = NaN; }
      if (!(Number.isInteger(personnes) && personnes >= 0 && personnes <= 999)) throw new Error('personnes : un entier de 0 à 999');
      // Le jour de travail : vide, celui de l'équipe ; sinon de −3 (avant les vols) à +1 (le lendemain, une plonge).
      let jour;
      try { jour = T().nombreDe(x.jour, null); } catch (e) { jour = NaN; }
      if (jour !== null && !(Number.isInteger(jour) && jour >= -3 && jour <= 1)) throw new Error('jour : vide (celui de l’équipe), 0, −1 pour la veille des vols (−3 au plus), +1 le lendemain');
      let duree = fin - debut; if (duree <= 0) duree += 1440;
      return { ligne: x._ligne, date, service: s, equipe: a.id, debut, fin, duree, personnes, jour };
    } catch (e) { throw new Error('ligne ' + x._ligne + ' : ' + e.message); }
  }

  /** Le planning d'un fichier : un CSV (son texte) ou un classeur (ses feuilles). */
  function lireFichier(nom, contenu, unite) {
    if (typeof contenu === 'string') {
      if (contenu.length > MAX_OCTETS) throw new Error('fichier trop gros.');
      return lirePlanning([{ nom: 'Planning', lignes: T().lireCsv(contenu) }], unite);
    }
    return lirePlanning(contenu, unite);
  }

  /* ----------------------------------------------------------------------
   *  Rejouer un jour avec son planning
   * --------------------------------------------------------------------*/

  /**
   * Les équipes d'un jour de planning (les arguments de la journée,
   * moteur/journee.js) : chaque équipe nommée prend son début, sa présence
   * (fin − début), ses personnes et son jour (vide : le sien) ; une équipe
   * d'un service qui a des lignes ce jour-là, mais pas elle, ne travaille pas
   * (0 personne) ; un service sans ligne garde ses équipes, une mise à
   * disposition les siennes. L'effectif est imposé : une équipe à la main ou
   * d'appui dont le travail suit les vols garde ses minutes par vol (« dépend
   * des vols, effectif imposé ») ; une équipe constante le reste, les autres
   * (robot, plonge, handling) ont un effectif saisi.
   * `o` : { calcules, imposes } — les services à effectif calculé, imposé (les arguments de la journée).
   */
  function ateliersDuJour(ateliers, lignes, o = {}) {
    const parEquipe = new Map((lignes || []).map(l => [l.equipe, l])), services = new Set((lignes || []).map(l => l.service));
    const calcules = new Set(o.calcules || []), imposes = new Set(o.imposes || []);
    const mode = a => (['fixe', 'calcule', 'impose'].includes(a.effectif) ? a.effectif : imposes.has(a.service) ? 'impose' : calcules.has(a.service) ? 'calcule' : 'fixe');
    return (ateliers || []).map(a => {
      if (!services.has(a.service) || a.type === 'dispo') return a;
      const p = parEquipe.get(a.id), effectif = (a.type === 'manuel' || a.type === 'appui') && mode(a) !== 'fixe' ? 'impose' : 'fixe';
      const { personnesSaisies, ...reste } = a;
      if (!p) return { ...reste, personnes: 0, effectif, planning: 'absente' };
      const regime = { ...(a.regime && a.regime.actif !== false ? a.regime : {}), actif: true, presence: p.duree };
      return { ...reste, debut: hhmm(p.debut), jour: p.jour === null || p.jour === undefined ? a.jour || 0 : p.jour, personnes: p.personnes, effectif, regime, planning: 'imposee' };
    });
  }

  /** Les arguments d'un jour rejoué : ses équipes du planning, et des heures sup jusqu'à 12 h. Sans ligne : les mêmes. */
  const argsDuJour = (args, lignes) => (lignes && lignes.length ? { ...args,
    ateliers: ateliersDuJour(args.ateliers, lignes, { calcules: args.effectifCalcule, imposes: args.effectifImpose }),
    heuresSup: { ...(args.heuresSup || {}), actif: true, plafond: PLAFOND_REJEU } } : args);

  /**
   * Les arguments d'une journée, le travail de chaque service × son facteur
   * (`facteurs` : { service: k }) : son barème, les minutes propres de ses
   * cases, les minutes par vol de ses équipes d'appui (24 h au plus), les
   * minutes de son armement. Sans facteur : les mêmes arguments.
   */
  function facteursSurArgs(args, facteurs) {
    const f = s => (facteurs && Number.isFinite(facteurs[s]) && facteurs[s] > 0 ? facteurs[s] : 1);
    if (!facteurs || !Object.values(facteurs).some(k => k !== 1)) return args;
    const fois = (t, k, max) => Object.fromEntries(Object.entries(t || {}).map(([c, v]) => [c, typeof v === 'number' ? Math.min(max || Infinity, v * k) : v]));
    const bareme = Object.fromEntries(Object.entries(args.bareme || {}).map(([s, t]) => [s, f(s) === 1 ? t : fois(t, f(s))]));
    const ateliers = (args.ateliers || []).map(a => {
      const k = f(a.service); if (k === 1) return a;
      return { ...a, ...(a.minutes ? { minutes: fois(a.minutes, k) } : {}), ...(a.type === 'appui' && a.minutesVol ? { minutesVol: fois(a.minutesVol, k, 1440) } : {}) };
    });
    const categories = Object.fromEntries(Object.entries(args.categories || {}).map(([s, l]) => [s, f(s) === 1 ? l
      : (l || []).map(c => ({ ...c, minutes: fois(c.minutes, f(s)) }))]));
    return { ...args, bareme, ateliers, categories };
  }

  /** Un planning d'exemple, FICTIF : deux jours, une équipe, une nuit qui passe minuit. */
  function modeleCsv(unite) {
    const a = ((unite && unite.ateliers) || []).find(x => x.type === 'manuel') || { service: 'prepa', nom: 'Équipe' };
    const s = (((unite && unite.services) || []).find(x => x.id === a.service) || { nom: a.service }).nom;
    return ['date;service;equipe;debut;fin;personnes;jour', '2026-11-02;' + s + ';' + a.nom + ';06:00;14:00;3;0',
      '2026-11-03;' + s + ';' + a.nom + ';22:00;06:00;2;-1'].join('\r\n') + '\r\n';
  }

  const api = { PLAFOND_REJEU, lirePlanning, lireFichier, ateliersDuJour, argsDuJour, facteursSurArgs, modeleCsv };
  if (enNode) module.exports = api;
  else root.OrlyPlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
