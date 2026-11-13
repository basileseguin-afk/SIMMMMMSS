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
 *      node outils/simuler-journee.cjs --xlsx charge.xlsx sauvegarde.json vols.csv > resultat.json
 *      node outils/simuler-journee.cjs --reponses sauvegarde.json vols.csv > resultat.json
 *
 *  Le résultat : { journee: { ce qui a été lu }, resultat: { ce que rend simuler },
 *  indicateursCharge: { les indicateurs de charge, moteur/indicateurs.js } }.
 *  `--reponses` y ajoute `reponses` : les cinq réponses de la journée
 *  (moteur/reponses.js, évolution 15), aux seuils de la sauvegarde ; sans
 *  l'option, la sortie est celle d'avant.
 *  `--xlsx` écrit aussi le classeur de la charge de la journée (Lisez-moi,
 *  Charge, Créneaux), le même que la page (echanges-charge.js).
 *  ⚠ Une sauvegarde contient le plan réel de l'unité : elle ne va jamais dans
 *  le dépôt (`.gitignore` refuse `ory-sauvegarde*.json`), le résultat non plus.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const J = require('../moteur/journee.js');
const I = require('../moteur/indicateurs.js');
const REP = require('../moteur/reponses.js');
const T = require('../tableur.js');
// Le classeur compressé (correction 16 c) : le même contenu, bien plus léger.
const Z = require('../classeur-compresse.js');
// La feuille « Réponses » du classeur (évolution 15 e).
const ER = require('../echanges-reponses.js');
const EC = require('../echanges-charge.js');

const USAGE = 'Usage : node outils/simuler-journee.cjs [--arguments] [--reponses] [--xlsx charge.xlsx] sauvegarde.json vols.csv|vols.xlsx [options.json] > resultat.json';

/** Un fichier JSON lu, ou une erreur qui dit lequel. */
function lireJson(chemin, quoi, max) {
  const taille = fs.statSync(chemin).size;
  if (taille > max) throw new Error(quoi + ' : fichier trop volumineux (maximum ' + Math.round(max / 1048576) + ' Mo).');
  try { return JSON.parse(fs.readFileSync(chemin, 'utf8')); }
  catch (e) { throw new Error(quoi + ' : JSON illisible (' + e.message + ').'); }
}

/** Joue la journée : rend { journee, resultat } (ou les arguments du moteur, avec `arguments`). */
async function simulerJournee(cheminSauvegarde, cheminVols, cheminOptions, { arguments: seulementArguments = false, reponses = false } = {}) {
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
  const resultat = J.jouer(args);
  const sortie = {
    journee: { schema: 'ory-journee', version: 1, sauvegarde: path.basename(cheminSauvegarde), vols: path.basename(cheminVols), ...(dates.length ? { date: dates[0] } : {}),
      departs: vols.filter(v => v.sens === 'DEP').length, retours: vols.filter(v => v.sens === 'RET').length, options },
    resultat,
    // Les indicateurs de charge (banc d'essai, évolution 12) : à côté du résultat, qui reste celui d'avant.
    indicateursCharge: I.journee(resultat, args)
  };
  // Les cinq réponses (évolution 15), aux seuils de la sauvegarde (sans eux, les défauts) : seulement sur demande.
  const seuils = REP.seuilsDeLaSauvegarde(sauvegarde);
  if (reponses) sortie.reponses = REP.reponses(resultat, args, { seuils, k: sortie.indicateursCharge });
  // Les arguments et les seuils restent, hors du JSON (non énumérables) : les noms des services et la feuille « Réponses », pour le classeur.
  Object.defineProperty(sortie, 'seuils', { value: seuils, enumerable: false });
  return Object.defineProperty(sortie, 'args', { value: args, enumerable: false });
}

/**
 * Le classeur de la charge de la journée : le même que la page écrit (echanges-charge.js), et à la fin la feuille « Réponses »
 * (évolution 15 e, echanges-reponses.js) : les cinq réponses aux seuils de la sauvegarde.
 */
function classeurDeLaJournee(sortie, calculeLe = new Date()) {
  const j = sortie.journee;
  const classeur = EC.journeeVersClasseur({ indicateurs: sortie.indicateursCharge }, {
    date: j.date, sauvegarde: j.sauvegarde, vols: j.vols, calculeLe, nomService: id => ((sortie.args && sortie.args.noms) || {})[id] || id });
  const rep = sortie.reponses || (sortie.args ? REP.reponses(sortie.resultat, sortie.args, { seuils: sortie.seuils, k: sortie.indicateursCharge }) : null);
  return Z.compresserSync(T.ecrireClasseur(ER.avecReponses(classeur, rep, { date: j.date || null, calculeLe })));
}

if (require.main === module) {
  const brut = process.argv.slice(2), drapeaux = [], fichiers = [];
  let xlsx = null;
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '--xlsx') { xlsx = brut[++i] || ''; drapeaux.push('--xlsx'); }
    else (brut[i].startsWith('--') ? drapeaux : fichiers).push(brut[i]);
  }
  const inconnus = drapeaux.filter(d => d !== '--arguments' && d !== '--xlsx' && d !== '--reponses');
  const seulementArguments = drapeaux.includes('--arguments'), reponses = drapeaux.includes('--reponses');
  if (inconnus.length || fichiers.length < 2 || fichiers.length > 3 || xlsx === '' || (xlsx && (!/\.xlsx$/i.test(xlsx) || seulementArguments))
    || (reponses && seulementArguments)) { console.error(USAGE); process.exit(2); }
  simulerJournee(fichiers[0], fichiers[1], fichiers[2], { arguments: seulementArguments, reponses })
    .then(sortie => {
      if (xlsx) { fs.writeFileSync(xlsx, classeurDeLaJournee(sortie)); console.error('Classeur de la charge : ' + xlsx + '.'); }
      process.stdout.write(JSON.stringify(sortie) + '\n');
    })
    .catch(e => { console.error('Journée non jouée : ' + e.message); process.exitCode = 1; });
}

module.exports = { simulerJournee, lireJson, classeurDeLaJournee };
