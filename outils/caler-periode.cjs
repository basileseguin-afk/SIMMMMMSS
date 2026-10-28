#!/usr/bin/env node
/* ==========================================================================
 *  COMPARER UNE PÉRIODE SIMULÉE AU RÉEL (banc d'essai, évolution 11)
 *
 *  La période que outils/simuler-periode.cjs a jouée (avec ou sans
 *  --sans-detail), le réel par jour et par rôle (CSV, ou la feuille « Réel »
 *  d'un classeur) et la correspondance des rôles avec la simulation (JSON).
 *  Le calcul est celui de la page (moteur/reel.js). Voir docs/BANC_ESSAI.md,
 *  § 10, et docs/FORMATS_EXCEL.md pour les formats.
 *
 *      node outils/caler-periode.cjs periode.json reel.csv|reel.xlsx correspondance.json [--xlsx calage.xlsx] > calage.json
 *          --xlsx calage.xlsx   écrit aussi le classeur (Lisez-moi, Réel, Comparaison, Calage)
 *
 *  Le JSON : { calage, comparaison, rapport } — `rapport`, le calage de chaque
 *  ligne (moteur/calage-periode.js) : le modèle retenu, ses paramètres, ses
 *  erreurs hors échantillon, le verdict de chaque règle, σ.
 *
 *  ⚠ Le réel, la période et le résultat contiennent des données réelles de
 *  l'unité : ils ne vont jamais dans le dépôt.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/reel.js');
const C = require('../moteur/calage-periode.js');
const T = require('../tableur.js');
const EC = require('../echanges-calage.js');
const { lireJson } = require('./simuler-journee.cjs');

const USAGE = 'Usage : node outils/caler-periode.cjs periode.json reel.csv|reel.xlsx correspondance.json [--xlsx calage.xlsx] > calage.json';
const MAX_PERIODE = 1024 * 1024 * 1024, MAX_REEL = 50 * 1024 * 1024;

/** La période simulée : le JSON de simuler-periode, dont on garde le bilan. */
function lirePeriode(chemin) {
  const p = lireJson(chemin, 'période', MAX_PERIODE);
  if (!p || !p.periode || p.periode.schema !== 'ory-periode' || !p.bilan || !Array.isArray(p.bilan.joursTravail))
    throw new Error('période : le JSON de node outils/simuler-periode.cjs est attendu.');
  if (!p.bilan.joursTravail.some(w => Object.values(w.services || {}).some(s => 'charge' in s)))
    throw new Error('période : elle n’a pas la charge des services ; relancez node outils/simuler-periode.cjs.');
  return p;
}

/** Compare la période au réel et cale chaque ligne : rend { calage, comparaison, rapport }. */
async function calerPeriode(cheminPeriode, cheminReel, cheminCorrespondance) {
  const p = lirePeriode(cheminPeriode);
  if (fs.statSync(cheminReel).size > MAX_REEL) throw new Error('réel : fichier trop volumineux (' + MAX_REEL / 1048576 + ' Mo au plus).');
  let reel;
  try { reel = R.lireReel(await T.lireFichier(new File([fs.readFileSync(cheminReel)], path.basename(cheminReel)), MAX_REEL)); }
  catch (e) { throw new Error('réel : ' + e.message); }
  const correspondance = lireJson(cheminCorrespondance, 'correspondance', 1024 * 1024);
  if (!correspondance || typeof correspondance !== 'object' || Array.isArray(correspondance)) throw new Error('correspondance : un objet { bases, lignes } est attendu.');
  // Les décisions (jours et cellules écartés, cellules réintégrées) peuvent accompagner la correspondance, comme la page l'exporte.
  const controle = R.controler(reel, correspondance.decisions);
  const comparaison = R.comparer(p.bilan, controle, correspondance);
  return {
    calage: { schema: 'ory-calage', version: 1, periode: { debut: p.periode.debut, fin: p.periode.fin, sauvegarde: p.periode.sauvegarde || null, vols: p.periode.vols || null },
      reel: path.basename(cheminReel), correspondance: path.basename(cheminCorrespondance) },
    comparaison, rapport: C.caler(comparaison), _bilan: p.bilan, _reel: controle
  };
}

/** Le classeur : le même que la page écrit (echanges.js). */
function classeurDuCalage(sortie, calculeLe = new Date()) {
  return T.ecrireClasseur(EC.calageVersClasseur({ comparaison: sortie.comparaison, reel: sortie._reel, rapport: sortie.rapport }, {
    periode: sortie.calage.periode, reel: sortie.calage.reel, correspondance: sortie.calage.correspondance, calculeLe }));
}

if (require.main === module) {
  const brut = process.argv.slice(2), fichiers = [];
  let xlsx = null, inconnu = false;
  for (let i = 0; i < brut.length; i++) {
    if (brut[i] === '--xlsx') xlsx = brut[++i] || '';
    else if (brut[i].startsWith('--')) inconnu = true;
    else fichiers.push(brut[i]);
  }
  if (inconnu || fichiers.length !== 3 || xlsx === '' || (xlsx && !/\.xlsx$/i.test(xlsx))) { console.error(USAGE); process.exit(2); }
  calerPeriode(fichiers[0], fichiers[1], fichiers[2])
    .then(sortie => {
      if (xlsx) fs.writeFileSync(xlsx, classeurDuCalage(sortie));
      const { _bilan, _reel, ...json } = sortie;
      process.stdout.write(JSON.stringify(json) + '\n');
      const c = sortie.comparaison;
      if (c.rolesSansLigne.length) console.error('Rôles sans ligne (non comptés) : ' + c.rolesSansLigne.join(', ') + '.');
      for (const a of c.anomalies.ecartees) console.error('Écartée : ' + a.date + ', ' + a.role + ' — ' + a.raison + '.');
      for (const a of c.anomalies.signalees) console.error('À vérifier : ' + a.raison + '.');
      for (const l of sortie.rapport.lignes) console.error('Calage, ' + l.nom + ' : ' + (l.cale ? l.retenu.nom + (l.raison ? ' (' + l.raison + ')' : '') : 'pas de calage, ' + l.raison) + '.');
      console.error('Comparaison : ' + c.lignes.length + ' ligne' + (c.lignes.length > 1 ? 's' : '') + ', ' + c.jours.length + ' jour' + (c.jours.length > 1 ? 's' : '')
        + ' de travail complets avec du réel.' + (xlsx ? ' Classeur : ' + xlsx + '.' : ''));
    })
    .catch(e => { console.error('Calage non fait : ' + e.message); process.exitCode = 1; });
}

module.exports = { calerPeriode, classeurDuCalage, lirePeriode };
