#!/usr/bin/env node
/* ==========================================================================
 *  JOUER UNE PÉRIODE HORS DU NAVIGATEUR (évolution 10 du banc d'essai)
 *
 *  Un programme de vols daté (colonne `date`), joué jour après jour avec le
 *  moteur de la v1 : le fichier « Sauvegarde › Tout sauvegarder », le
 *  programme, et les mêmes options que outils/simuler-journee.cjs. Ce qui
 *  reste le soir passe au lendemain (le sale, le propre ; en « J+1 », les
 *  départs de la veille). Le calcul est celui de la page (moteur/periode.js).
 *  Voir docs/BANC_ESSAI.md, § 9.
 *
 *      node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv|vols-dates.xlsx [options.json] > periode.json
 *          --sans-detail      sans le résultat complet de chaque journée (un fichier léger)
 *          --xlsx periode.xlsx  écrit aussi le classeur de la période, celui de « Exporter les résultats »
 *
 *  Le résultat : { periode, bilan, journees: [{ date, departs, retours, options, resultat }] }.
 *  `options` d'une journée : celles qui la font rejouer seule par
 *  outils/simuler-journee.cjs, au champ près (le banc s'en sert pour vérifier).
 *  ⚠ Une sauvegarde contient le plan réel de l'unité : elle ne va jamais dans
 *  le dépôt (`.gitignore` refuse `ory-sauvegarde*.json`), le résultat non plus.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const { lireJson } = require('./simuler-journee.cjs');

const USAGE = 'Usage : node outils/simuler-periode.cjs sauvegarde.json vols-dates.csv|vols-dates.xlsx [options.json] [--sans-detail] [--xlsx periode.xlsx] > periode.json';

/** Joue la période : rend { periode, bilan, journees } (sans les journées avec `detail: false`). */
async function simulerPeriode(cheminSauvegarde, cheminVols, cheminOptions, { detail = true } = {}) {
  const sauvegarde = lireJson(cheminSauvegarde, 'sauvegarde', 20 * 1024 * 1024);
  const options = cheminOptions ? lireJson(cheminOptions, 'options', 1024 * 1024) : {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('options : un objet JSON est attendu.');
  let vols;
  try { vols = await J.volsDuFichier(new File([fs.readFileSync(cheminVols)], path.basename(cheminVols))); }
  catch (e) { throw new Error('vols : ' + e.message); }
  if (!PE.estDate(vols)) throw new Error('vols : le programme n’est pas daté (colonne date, docs/FORMATS_EXCEL.md) ; une seule journée : node outils/simuler-journee.cjs.');
  const p = PE.depuisSauvegarde(sauvegarde, vols, options, { detail });
  return {
    periode: { ...p.periode, sauvegarde: path.basename(cheminSauvegarde), vols: path.basename(cheminVols), options },
    bilan: p.bilan,
    ...(detail ? { journees: p.journees.map(j => ({ date: j.date, departs: j.departs, retours: j.retours,
      options: PE.optionsDeRejeu(options, j.entree), resultat: j.resultat })) } : {}),
    // Pour l'export Excel de la période (le même que celui de la page) : les extraits, hors du JSON.
    _journees: p.journees, _vols: vols
  };
}

/** Le classeur de la période : le même que la page écrit (echanges.js), pour les mêmes réglages. */
function classeurDeLaPeriode(sortie, calculeLe = new Date()) {
  const { delaiChargement, decalage, ...autres } = sortie.periode.options || {};
  return T.ecrireClasseur(E.periodeVersClasseur({ periode: sortie.periode, bilan: sortie.bilan, journees: sortie._journees }, {
    sauvegarde: sortie.periode.sauvegarde, vols: sortie.periode.vols, calculeLe,
    reglages: { delaiChargement: J.delaiDe(sortie.periode.options || {}), decalage: +decalage || 0, ...autres } }));
}

/** Le JSON, écrit morceau par morceau : une période de deux mois tient en mémoire, pas forcément en une seule chaîne. */
function ecrireJson(sortie, flux) {
  const { _journees, _vols, journees, ...tete } = sortie;
  flux.write('{' + Object.entries(tete).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(','));
  if (journees) {
    flux.write(',"journees":[');
    journees.forEach((j, i) => flux.write((i ? ',' : '') + JSON.stringify(j)));
    flux.write(']');
  }
  flux.write('}\n');
}

if (require.main === module) {
  const brut = process.argv.slice(2), drapeaux = [], fichiers = [];
  let xlsx = null;
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '--xlsx') { xlsx = brut[++i] || ''; drapeaux.push('--xlsx'); }
    else (brut[i].startsWith('--') ? drapeaux : fichiers).push(brut[i]);
  }
  const inconnus = drapeaux.filter(d => d !== '--sans-detail' && d !== '--xlsx');
  if (inconnus.length || fichiers.length < 2 || fichiers.length > 3 || xlsx === '' || (xlsx && !/\.xlsx$/i.test(xlsx))) { console.error(USAGE); process.exit(2); }
  const debut = Date.now();
  simulerPeriode(fichiers[0], fichiers[1], fichiers[2], { detail: !drapeaux.includes('--sans-detail') })
    .then(sortie => {
      if (xlsx) fs.writeFileSync(xlsx, classeurDeLaPeriode(sortie));
      ecrireJson(sortie, process.stdout);
      if (xlsx) console.error('Classeur de la période : ' + xlsx + '.');
      const p = sortie.periode;
      for (const d of p.joursSansVol) console.error('Aucun vol le ' + PE.dateLongue(d) + ' : jour sans vol ou oubli ?');
      console.error('Période jouée : ' + p.jours + (p.jours > 1 ? ' journées' : ' journée') + ' de vols, du ' + PE.dateLongue(p.debut) + ' au ' + PE.dateLongue(p.fin)
        + ' (' + p.joursIncomplets.length + ' jour' + (p.joursIncomplets.length > 1 ? 's' : '') + ' de travail incomplet' + (p.joursIncomplets.length > 1 ? 's' : '') + '), en ' + ((Date.now() - debut) / 1000).toFixed(1) + ' s.');
    })
    .catch(e => { console.error('Période non jouée : ' + e.message); process.exitCode = 1; });
}

module.exports = { simulerPeriode, ecrireJson, classeurDeLaPeriode };
