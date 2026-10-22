#!/usr/bin/env node
/* ==========================================================================
 *  JOUER UNE JOURNÉE HORS DU NAVIGATEUR
 *
 *  Le banc d'essai rejoue des journées réelles avec le moteur de la v1 : le
 *  fichier « Sauvegarde › Tout sauvegarder », les vols du jour, et rend ce que
 *  la page aurait calculé, au champ près. L'assemblage des arguments est celui
 *  de la page (moteur/journee.js) ; les vols se lisent par le code de l'import
 *  (CSV ou classeur Excel). Voir docs/BANC_ESSAI.md.
 *
 *      node outils/simuler-journee.cjs sauvegarde.json vols.csv [options.json] > resultat.json
 *      node outils/simuler-journee.cjs --arguments sauvegarde.json vols.xlsx    # ce que reçoit le moteur
 *
 *  Le résultat : { journee: { ce qui a été lu }, resultat: { ce que rend simuler } }.
 *  ⚠ Une sauvegarde contient le plan réel de l'unité : elle ne va jamais dans
 *  le dépôt (`.gitignore` refuse `ory-sauvegarde*.json`), le résultat non plus.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const J = require('../moteur/journee.js');

const USAGE = 'Usage : node outils/simuler-journee.cjs [--arguments] sauvegarde.json vols.csv|vols.xlsx [options.json] > resultat.json';

/** Un fichier JSON lu, ou une erreur qui dit lequel. */
function lireJson(chemin, quoi, max) {
  const taille = fs.statSync(chemin).size;
  if (taille > max) throw new Error(quoi + ' : fichier trop volumineux (maximum ' + Math.round(max / 1048576) + ' Mo).');
  try { return JSON.parse(fs.readFileSync(chemin, 'utf8')); }
  catch (e) { throw new Error(quoi + ' : JSON illisible (' + e.message + ').'); }
}

/** Joue la journée : rend { journee, resultat } (ou les arguments du moteur, avec `arguments`). */
async function simulerJournee(cheminSauvegarde, cheminVols, cheminOptions, { arguments: seulementArguments = false } = {}) {
  // Une sauvegarde complète tient en 20 Mo, comme « Restaurer » l'accepte.
  const sauvegarde = lireJson(cheminSauvegarde, 'sauvegarde', 20 * 1024 * 1024);
  const options = cheminOptions ? lireJson(cheminOptions, 'options', 1024 * 1024) : {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('options : un objet JSON est attendu.');
  let vols;
  try { vols = await J.volsDuFichier(new File([fs.readFileSync(cheminVols)], path.basename(cheminVols))); }
  catch (e) { throw new Error('vols : ' + e.message); }
  // Un programme daté (évolution 10) : d'un seul jour, il se joue comme une journée ; de plusieurs, c'est une période.
  const dates = [...new Set(vols.filter(v => v.date).map(v => v.date))].sort();
  if (dates.length > 1) throw new Error('vols : programme daté sur ' + dates.length + ' jours (du ' + dates[0] + ' au ' + dates[dates.length - 1]
    + ') ; une journée se joue avec les vols d’un seul jour. Pour la période : node outils/simuler-periode.cjs.');
  if (dates.length) vols = vols.map(({ date, ...v }) => v);
  const args = J.argumentsDeLaJournee(sauvegarde, vols, options);
  if (seulementArguments) return args;
  return {
    journee: { schema: 'ory-journee', version: 1, sauvegarde: path.basename(cheminSauvegarde), vols: path.basename(cheminVols), ...(dates.length ? { date: dates[0] } : {}),
      departs: vols.filter(v => v.sens === 'DEP').length, retours: vols.filter(v => v.sens === 'RET').length, options },
    resultat: J.jouer(args)
  };
}

if (require.main === module) {
  const brut = process.argv.slice(2), drapeaux = brut.filter(a => a.startsWith('--')), fichiers = brut.filter(a => !a.startsWith('--'));
  const inconnus = drapeaux.filter(d => d !== '--arguments');
  if (inconnus.length || fichiers.length < 2 || fichiers.length > 3) { console.error(USAGE); process.exit(2); }
  simulerJournee(fichiers[0], fichiers[1], fichiers[2], { arguments: drapeaux.includes('--arguments') })
    .then(sortie => { process.stdout.write(JSON.stringify(sortie) + '\n'); })
    .catch(e => { console.error('Journée non jouée : ' + e.message); process.exitCode = 1; });
}

module.exports = { simulerJournee };
