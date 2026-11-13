/* ==========================================================================
 *  COMPARER DEUX ESSAIS, RANGÉ SELON LES CINQ QUESTIONS
 *  (version 1, évolution 15 c — docs/CAHIER_DES_CHARGES.md, § 6 bis)
 *  ------------------------------------------------------------------------
 *  D'abord le scénario (ce qui change entre A et B), puis, question par
 *  question, ce que ça donne : combien de personnes il faut, où ça coince,
 *  à quelle heure les services finissent, ce qui part en retard. Les lignes
 *  viennent de comparaison.js (commun aux deux versions, non modifié) et des
 *  réponses des deux essais (moteur/reponses.js, comparer) ; une durée s'y
 *  écrit « 45 min » sous une heure, « 2 h 05 » au-delà ; un total d'heures
 *  de travail, en heures entières.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const C = () => (enNode ? require('./comparaison.js') : root.OrlyComparaison);
  const EPS = 1e-9;

  /** Les cinq rubriques, dans l'ordre du contrat ; le scénario d'abord (ce qui change). */
  const RUBRIQUES = Object.freeze(['Le scénario : ce qui change entre A et B', '1. Combien de personnes faut-il ?', '2. Où et quand ça coince ?',
    '3. À quelle heure chaque service finit-il ?', '4. Qu’est-ce qui part en retard ?']);
  /** Où va chaque ligne de comparaison.js. */
  const RANGEMENT = Object.freeze({
    'Temps passé à attendre': 2, 'Attente de matériel propre': 2, 'Plus longue attente à la plonge': 2,
    'Dernière commande prête': 3, 'Heures de travail': 3, 'Sale non lavé en fin de journée': 3, 'Matériel revenu des vols': 3,
    'Vols chargés à l’heure (handling)': 4, 'Commandes prêtes à l’heure': 4, 'Retard moyen': 4, 'Retard le plus long': 4, 'Commandes sans équipe': 4
  });

  /** Les lignes de comparaison.js qui portent une durée en minutes (un nom de fichier ou d'équipe ne se réécrit pas). */
  const EN_MINUTES = Object.freeze(['Commandes prêtes avant le départ', 'Décalage des vols', 'Retard moyen', 'Retard le plus long',
    'Temps passé à attendre', 'Attente de matériel propre', 'Plus longue attente à la plonge']);

  /**
   * Une seule écriture du temps dans un texte : « 227 min » devient « 3 h 47 », « −90 min » « −1 h 30 » ; sous une heure,
   * rien ne change. `entieres` : un total d'heures de travail, « 68,9 h » devient « 69 h ».
   */
  function ecrireTemps(texte, entieres) {
    let s = String(texte ?? '').replace(/(\d[\d   ]*) min\b/g, (m, n) => {
      const v = +String(n).replace(/[\s  ]/g, '');
      return v >= 60 ? P().dureeLisible(v) : m;
    });
    if (entieres) s = s.replace(/(\d+)(?:,(\d+))? h\b/g, (m, e, d) => Math.round(+(e + '.' + (d || 0))) + ' h');
    return s;
  }

  /** Une ligne de différence, telle que la page l'écrit : { lib, a, b, diff, verdict, ecart }. */
  const ligne = (lib, a, b, o = {}) => ({ lib, a: a ?? '—', b: b ?? '—', diff: String(a ?? '—') !== String(b ?? '—'), verdict: o.verdict || '', ecart: o.ecart || null });
  /** Un écart signé et fléché, et son verdict : moins, c'est mieux (`sens` −1), ou plus (+1). */
  function ecartSigne(d, sens, ecrire) {
    if (d == null || Math.abs(d) < EPS) return {};
    if (!sens) return { ecart: { fleche: d > 0 ? '▲' : '▼', texte: (d > 0 ? '+' : '−') + ecrire(Math.abs(d)) } };
    const mieux = sens * d > 0;
    return { verdict: mieux ? 'mieux' : 'moins bien', ecart: { fleche: d > 0 ? '▲' : '▼', texte: (d > 0 ? '+' : '−') + ecrire(Math.abs(d)) } };
  }
  const n = x => (Number.isFinite(x) ? (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1).replace('.', ',')) : '—');

  /** Les lignes des réponses : les personnes (1), le goulot (2), les heures sup (3), les exceptions (4). */
  function lignesDesReponses(A, B) {
    const d = A && B ? REP().comparer(A, B) : null, out = { 1: [], 2: [], 3: [], 4: [] };
    if (!d) return out;
    const t = d.personnes.total, dl = m => P().dureeLisible(m);
    // Le goulot dit son jour de travail ; une ligne (service, jour) aussi, quand son service en a plusieurs (correction 17 a).
    const nom = x => {
      const g = x.coince.goulot, mot = g ? REP().motDeLaLigne({ service: g.service, jour: g.jour || 0 }, x.coince.services || []) : null;
      return g ? g.nom + (mot ? ' (' + mot + ')' : '') : 'aucun';
    };
    const de = (s, lignes) => { const mot = REP().motDeLaLigne(s, lignes); return s.nom + (mot ? ' (' + mot + ')' : ''); };
    out[1].push(ligne('Il faut (personnes)', n(t.besoin.a), n(t.besoin.b), ecartSigne(t.besoin.d, -1, n)));
    out[1].push(ligne('Présentes (équivalents temps plein)', n(t.presents.a), n(t.presents.b), ecartSigne(t.presents.d, 0, n)));
    // Un poste fixe (correction 17 c) n'a pas de besoin : « fixe / 2 ».
    const faut = (s, c) => ((s.nonMesure || {})[c] ? 'non mesuré' : (s.fixe || {})[c] ? 'fixe' : n(s.besoin[c]));
    // Une ligne qui devient un poste fixe (ou cesse de l'être) change aussi, même à présents égaux.
    for (const s of d.personnes.services.filter(x => x.besoin.d || x.presents.d || (x.fixe && x.fixe.a !== null && x.fixe.b !== null && x.fixe.a !== x.fixe.b)))
      out[1].push(ligne(de(s, d.personnes.services) + ' : il faut / présentes', faut(s, 'a') + ' / ' + n(s.presents.a), faut(s, 'b') + ' / ' + n(s.presents.b)));
    out[2].push(ligne('Goulot', nom(A), nom(B)));
    for (const s of d.coince.services.filter(x => x.attenteMax.d))
      out[2].push(ligne(de(s, d.coince.services) + ' : un arrivage attend jusqu’à', s.attenteMax.a == null ? '—' : dl(s.attenteMax.a), s.attenteMax.b == null ? '—' : dl(s.attenteMax.b), ecartSigne(s.attenteMax.d, -1, dl)));
    const hs = d.fins.services.reduce((m, s) => ({ a: m.a + (s.heuresSup.a || 0), b: m.b + (s.heuresSup.b || 0) }), { a: 0, b: 0 });
    out[3].push(ligne('Heures sup (personnes × heures)', dl(hs.a), dl(hs.b), ecartSigne(hs.b - hs.a, -1, dl)));
    for (const s of d.fins.services.filter(x => x.fin.d)) out[3].push(ligne(de(s, d.fins.services) + ' finit à', P().hhmm(s.fin.a), P().hhmm(s.fin.b), ecartSigne(s.fin.d, -1, dl)));
    const e = d.exceptions;
    out[4].push(ligne('Exceptions (en retard, pas prêtes, sans équipe)', String(e.nombre.a), String(e.nombre.b), ecartSigne(e.nombre.d, -1, n)));
    if (e.reglees.length) out[4].push(ligne('Réglées dans B', '', e.reglees.map(x => x.id).join(', ')));
    if (e.nouvelles.length) out[4].push(ligne('Nouvelles dans B', '', e.nouvelles.map(x => x.id).join(', ')));
    return out;
  }

  /**
   * Une ligne de comparaison.js, à l'écriture du temps des résultats. « Heures de travail » : en heures entières, et
   * l'écart, le verdict et la différence se lisent sur les nombres affichés (68,9 h et 69,2 h : 69 h des deux côtés, sans écart).
   */
  function reecrire(l) {
    // L'écart est toujours calculé (jamais un texte importé) : il se réécrit partout (« Dernière commande prête » : « +1 h 05 »).
    const ecart = l.ecart ? { ...l.ecart, texte: ecrireTemps(l.ecart.texte) } : null;
    if (EN_MINUTES.includes(l.lib)) return { ...l, a: ecrireTemps(l.a), b: ecrireTemps(l.b), ecart };
    if (l.lib !== 'Heures de travail') return { ...l, ecart };
    const a = ecrireTemps(l.a, true), b = ecrireTemps(l.b, true), x = parseInt(a, 10), y = parseInt(b, 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...l, a, b };
    const d = y - x;
    return { ...l, a, b, diff: d !== 0, verdict: d ? l.verdict : '', ecart: d ? { fleche: d > 0 ? '▲' : '▼', texte: (d > 0 ? '+' : '−') + Math.abs(d) + ' h' } : null };
  }

  /**
   * Les rubriques de la comparaison : [{ titre, lignes }], dans l'ordre du contrat. `snapA`, `snapB` : les essais retenus
   * (OrlyComparaison.capturer), chacun avec ses réponses (`reponses`) s'il en a.
   */
  function rubriques(snapA, snapB) {
    const parRubrique = RUBRIQUES.map(() => []);
    for (const l of C().lignes(snapA, snapB)) {
      parRubrique[l.groupe === 'Ce qui a changé' ? 0 : RANGEMENT[l.lib] || 4].push(reecrire(l));
    }
    const rep = lignesDesReponses(snapA && snapA.reponses, snapB && snapB.reponses);
    for (const i of [1, 2, 3, 4]) parRubrique[i].unshift(...rep[i]);
    return RUBRIQUES.map((titre, i) => ({ titre, lignes: parRubrique[i] })).filter(x => x.lignes.length);
  }

  const api = { RUBRIQUES, RANGEMENT, EN_MINUTES, ecrireTemps, reecrire, lignesDesReponses, rubriques };
  if (enNode) module.exports = api;
  else root.OrlyComparerVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
