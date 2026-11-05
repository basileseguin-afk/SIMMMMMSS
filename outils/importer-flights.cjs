#!/usr/bin/env node
/* ==========================================================================
 *  LIRE L'EXPORT WINREST TEL QUEL (banc d'essai, évolution 13)
 *
 *  L'onglet « Flights » d'un export Winrest (.xlsx), ou un CSV aux mêmes
 *  colonnes, donne le programme de vols daté (le CSV de l'évolution 10, que
 *  outils/simuler-periode.cjs lit tel quel) et le rapport d'import. Le calcul
 *  est celui de la page (moteur/import-flights.js). Les règles d'import
 *  viennent de la sauvegarde si on la donne (« Tout sauvegarder », clé
 *  ory-import-winrest-v1), sinon des défauts. Voir docs/BANC_ESSAI.md § 14 et
 *  docs/FORMATS_EXCEL.md § 7.
 *
 *      node outils/importer-flights.cjs EXPORT.xlsx [sauvegarde.json] [--rapport rapport.json] [--xlsx rapport.xlsx] > programme.csv
 *          --rapport rapport.json   écrit aussi le rapport d'import (JSON)
 *          --xlsx rapport.xlsx      écrit aussi le classeur du rapport, compressé (celui de la page)
 *
 *  Un fichier refusé (une colonne manquante, une ligne illisible…) : rien sur
 *  la sortie, la raison sur la sortie d'erreur, code 1. Un export où rien
 *  n'est gardé : code 1 aussi, mais le rapport demandé s'écrit, il dit
 *  pourquoi. Un appel mal formé (une option sans valeur ou répétée, une
 *  sortie qui écraserait l'export, la sauvegarde ou l'autre sortie) :
 *  l'usage, code 2, rien d'écrit.
 *
 *  ⚠ L'export, le programme et le rapport contiennent les vols réels de
 *  l'unité : ils ne vont jamais dans le dépôt.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const W = require('../moteur/import-flights.js');
const T = require('../tableur.js');
// Le classeur compressé (correction 16 c), comme celui de la page.
const Z = require('../classeur-compresse.js');
const EW = require('../echanges-import-flights.js');
const { lireJson } = require('./simuler-journee.cjs');

const USAGE = 'Usage : node outils/importer-flights.cjs EXPORT.xlsx|EXPORT.csv [sauvegarde.json] [--rapport rapport.json] [--xlsx rapport.xlsx] > programme.csv';
/** Le même plafond que la page pour cet import. */
const MAX_EXPORT = 30 * 1024 * 1024;

/** L'export et, s'il y en a une, la sauvegarde → { vols, rapport, regles }. */
async function importerExport(cheminExport, cheminSauvegarde) {
  const regles = cheminSauvegarde ? W.reglesDeLaSauvegarde(lireJson(cheminSauvegarde, 'sauvegarde', 20 * 1024 * 1024)) : W.reglesCompletes();
  const taille = fs.statSync(cheminExport).size;
  if (taille > MAX_EXPORT) throw new Error('export : fichier trop volumineux (' + Math.round(MAX_EXPORT / 1048576) + ' Mo maximum).');
  const nom = path.basename(cheminExport);
  const feuilles = await T.lireFichier(new File([fs.readFileSync(cheminExport)], nom), MAX_EXPORT);
  return { ...W.convertir(W.lignesDeLExport(feuilles), regles, { fichier: nom }), regles };
}

/** Le même fichier, sous deux chemins (un lien, « ./ ») ; un fichier qui n'existe pas encore se compare par son chemin. */
function memeFichier(a, b) {
  const reel = c => { try { return fs.realpathSync(c); } catch (e) { return path.resolve(c); } };
  return reel(a) === reel(b);
}

/** Une sortie qui écraserait l'export, la sauvegarde ou l'autre sortie : son nom, ou null. */
function sortieQuiEcrase(entrees, sorties) {
  for (let i = 0; i < sorties.length; i++) {
    if (entrees.some(e => memeFichier(e, sorties[i])) || sorties.slice(0, i).some(o => memeFichier(o, sorties[i]))) return sorties[i];
  }
  return null;
}

/** Le résumé, sur la sortie d'erreur : les totaux de la page. */
const resume = r => EW.totaux(r).map(([k, v]) => k + ' : ' + v).join('\n');

if (require.main === module) {
  const brut = process.argv.slice(2), fichiers = [];
  let rapport = null, xlsx = null, malForme = false;
  // La valeur d'une option : le mot suivant, s'il n'est pas lui-même une option ; une option donnée deux fois est une erreur.
  const valeur = (i, deja) => { const v = brut[i + 1]; if (deja !== null || !v || v.startsWith('--')) malForme = true; return v || ''; };
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '--rapport') rapport = valeur(i++, rapport);
    else if (brut[i] === '--xlsx') xlsx = valeur(i++, xlsx);
    else if (brut[i].startsWith('--')) malForme = true;
    else fichiers.push(brut[i]);
  }
  if (malForme || !fichiers.length || fichiers.length > 2 || (xlsx && !/\.xlsx$/i.test(xlsx))) { console.error(USAGE); process.exit(2); }
  // Rien ne s'écrit par-dessus l'export, la sauvegarde ou l'autre sortie : une faute de frappe ne perd pas l'export.
  const ecrase = sortieQuiEcrase(fichiers, [rapport, xlsx].filter(Boolean));
  if (ecrase) { console.error('Import non fait : « ' + ecrase + ' » écraserait l’export, la sauvegarde ou l’autre sortie.\n' + USAGE); process.exit(2); }
  importerExport(fichiers[0], fichiers[1])
    .then(({ vols, rapport: r }) => {
      if (rapport) fs.writeFileSync(rapport, JSON.stringify(r, null, 2) + '\n');
      if (xlsx) fs.writeFileSync(xlsx, Z.compresserSync(EW.classeurDuRapport(r)));
      console.error(resume(r));
      if (!vols.length) { console.error('Import non fait : aucun vol gardé (voir le rapport).'); process.exitCode = 1; return; }
      process.stdout.write(W.versCsv(vols));
    })
    .catch(e => { console.error('Import non fait : ' + e.message); process.exitCode = 1; });
}

module.exports = { importerExport, sortieQuiEcrase, MAX_EXPORT };
