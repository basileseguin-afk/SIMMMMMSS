/* Banc d'essai, correction 16 (a) — des comparaisons fictives à trois lignes,
 * pour la bande du total de l'unité (tests/sigma-unite.test.cjs). Deux mois
 * fabriqués (septembre et octobre 2026) : le réel de chaque ligne = 0,8 ×
 * son simulé + un décalage propre au mois + un petit bruit. Avec le même
 * décalage pour les trois lignes, leurs erreurs hors échantillon vont dans le
 * même sens ; avec des décalages opposés, elles se compensent. Aucune donnée
 * réelle. */
'use strict';

/** Un hasard reproductible (le même à chaque passage). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

const DEBUT = Date.UTC(2026, 8, 1, 12), N = 61;
const DATES = Array.from({ length: N }, (_, i) => new Date(DEBUT + i * 86400000).toISOString().slice(0, 10));

/** Trois lignes ; `decalages[k]` : le décalage de la ligne k, { 'AAAA-MM': ETP }. */
function comparaison(decalages) {
  const lignes = decalages.map((d, k) => {
    const h = hasard(11 + k);
    return { nom: 'Ligne ' + (k + 1), couvre: 'fictif', jours: DATES.map(date => {
      const simule = 8 + 16 * h(), bruit = (h() + h() + h() - 1.5) * 0.1;
      return { date, simule, reel: 0.8 * simule + (d[date.slice(0, 7)] || 0) + bruit };
    }) };
  });
  return { lignes, unite: { jours: DATES.map(date => ({ date })) } };
}

/** Le même décalage chaque mois pour les trois lignes : leurs erreurs s'additionnent. */
const ensemble = () => comparaison([0, 1, 2].map(() => ({ '2026-09': 1, '2026-10': -1 })));
/** Des décalages opposés : la première monte quand la deuxième descend, la troisième n'en a pas. */
const opposes = () => comparaison([{ '2026-09': 1, '2026-10': -1 }, { '2026-09': -1, '2026-10': 1 }, {}]);

/** La correspondance des trois lignes, et des jours de travail fictifs pour le prévu (un service par ligne). */
const CORRESPONDANCE = { lignes: [0, 1, 2].map(k => ({ nom: 'Ligne ' + (k + 1), services: ['s' + (k + 1)] })) };
const JOURS = ['2026-11-02', '2026-11-03', '2026-11-04'].map((date, i) => ({ date,
  services: Object.fromEntries([0, 1, 2].map(k => ['s' + (k + 1), { charge: 8 + k + i }])), total: {} }));

module.exports = { comparaison, ensemble, opposes, CORRESPONDANCE, JOURS, DATES };
