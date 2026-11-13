/* Une unité fictive pour l'évolution 17 (tests navigateur, outils, captures de
 * contrôle) : celle de la référence de non-régression, la cuisine huit fois
 * plus lourde au barème (son travail au barème va d'environ 3 à 20 ETP), un
 * programme daté de neuf semaines dont le nombre de vols change chaque jour,
 * et un réel fabriqué d'après la période simulée :
 *   — « Cuisinier » : des heures en puissance du travail au barème de la
 *     cuisine (K × x^0,4), des heures supp les seuls jours chargés — une
 *     ligne « à la limite » ;
 *   — « Plongeur » : six personnes tous les jours, sans une heure supp, quel
 *     que soit le travail de la plonge — une ligne « en sur-effectif » ;
 *   — « Agent de bureau » : deux personnes, hors simulation.
 * Tout est inventé : aucun vol, aucun rôle, aucune heure réels. */
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const CUISINE_FOIS = 8, EXPOSANT = 0.4, K = 4.4, PLONGEURS = 6, BUREAU = 2, HEURES_PAR_ETP = 7;
const JOURS = PE.joursEntre('2026-09-28', '2026-11-29');

/** La sauvegarde de l'unité fictive : la cuisine huit fois plus lourde au barème. */
function sauvegarde() {
  const sv = JSON.parse(JSON.stringify(S.sauvegarde)), bareme = sv.contenu['ory-modele-v1'].bareme;
  bareme.cuisine = Object.fromEntries(Object.entries(bareme.cuisine).map(([k, v]) => [k, v * CUISINE_FOIS]));
  return sv;
}

/** La part des vols gardée chaque jour : de 20 % à 100 %, sans rythme de semaine. */
const part = i => 0.2 + 0.8 * ((i * 0.618033988749895) % 1);
/** Un écart fabriqué, entre −1 et 1, le même à chaque passage. */
const ecart = i => 2 * ((i * 0.7548776662466927) % 1) - 1;
const DEPARTS = S.args.vols.filter(v => v.sens === 'DEP'), RETOURS = S.args.vols.filter(v => v.sens !== 'DEP');
/** `n` vols d'une liste, à partir d'un rang qui tourne d'un jour à l'autre : pas les mêmes vols chaque jour. */
const tournes = (l, n, i) => l.slice((i * 5) % l.length).concat(l.slice(0, (i * 5) % l.length)).slice(0, n);
/** Les vols du programme daté. */
const vols = () => JOURS.flatMap((d, i) => tournes(DEPARTS, Math.max(2, Math.round(DEPARTS.length * part(i))), i)
  .concat(tournes(RETOURS, Math.max(1, Math.round(RETOURS.length * part(i))), i)).map(v => ({ ...v, date: d })));
const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
/** Le programme daté, en CSV (docs/FORMATS_EXCEL.md). */
const volsCsv = () => 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  + vols().map(v => [v.date, v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n';

const h1 = x => Math.round(x * 10) / 10;
/** Le réel fabriqué d'après le bilan de la période (ses jours complets), en CSV : date ; rôle ; heures titulaires ; intérim ; supp. */
function reelCsv(bilan) {
  const complets = bilan.joursTravail.filter(w => w.complet), charges = complets.map(w => w.services.cuisine.charge).sort((a, b) => a - b);
  const charge = charges[Math.floor(charges.length * 2 / 3)];               // les heures supp : au-dessus des deux tiers des jours
  const lignes = complets.flatMap((w, i) => {
    const x = w.services.cuisine.charge, etp = K * Math.pow(x, EXPOSANT) + 0.35 * ecart(i);
    return [[w.date, 'Cuisinier', h1(HEURES_PAR_ETP * etp), 0, x > charge ? h1(2 * (x - charge)) : 0],
      [w.date, 'Plongeur', h1(HEURES_PAR_ETP * (PLONGEURS + 0.1 * ecart(i + 7))), 0, 0],
      [w.date, 'Agent de bureau', HEURES_PAR_ETP * BUREAU, 0, 0]];
  });
  return 'date;role;heures_titulaires;heures_interim;heures_supp\n' + lignes.map(l => l.join(';')).join('\n') + '\n';
}

const CORRESPONDANCE = { bases: { defaut: { titulaires: HEURES_PAR_ETP, interim: HEURES_PAR_ETP } }, lignes: [
  { nom: 'Cuisine', roles: ['Cuisinier'], services: ['cuisine'] }, { nom: 'Plonge', roles: ['Plongeur'], services: ['plonge'] },
  { nom: 'Bureau', roles: ['Agent de bureau'], hors: true }] };

const CLE_CALAGE = 'ory-calage-v1';
/**
 * Dans la page (Playwright) : l'unité fictive, sa correspondance, son programme daté, la période simulée, puis le
 * réel fabriqué d'après elle, importé. Rend { bilan, csv }. `dossier` : où écrire les fichiers à importer ; chaque
 * étape attend son effet, pas un délai.
 */
async function charger(page, nav, url, dossier) {
  const fs = require('node:fs'), path = require('node:path');
  const fichier = (nom, texte) => { const f = path.join(dossier, nom); fs.writeFileSync(f, texte); return f; };
  await page.goto(url); await nav.pret(page);
  await page.evaluate(() => localStorage.clear()); await nav.recharger(page);
  await nav.aller(page, 'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json', JSON.stringify(sauvegarde())));
  const recharge = page.waitForEvent('load'); await nav.repondre(page); await recharge; await nav.pret(page);
  // La correspondance, gardée comme la page la garde ; puis le programme daté (il ne survit pas à un rechargement).
  await page.evaluate(([k, c]) => localStorage.setItem(k, JSON.stringify({ correspondance: c, decisions: {} })), [CLE_CALAGE, CORRESPONDANCE]);
  await nav.recharger(page);
  await nav.aller(page, 'v-programme'); await page.locator('#imp-vols').setInputFiles(fichier('vols-dates.csv', volsCsv()));
  await page.waitForFunction(() => document.getElementById('source-label').textContent === 'vols-dates.csv');
  await nav.aller(page, 'j-periode');
  await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(() => Sim.periode.etat() === 'a-jour', null, { timeout: 180000 });
  const bilan = await page.evaluate(() => JSON.parse(JSON.stringify(Sim.periode.resultat.bilan))), csv = reelCsv(bilan);
  await page.locator('#calage-reel').setInputFiles(fichier('reel-fictif.csv', csv));
  await page.waitForFunction(() => /reel-fictif\.csv/.test(document.querySelector('#pv-reel .pc-etat').textContent));
  return { bilan, csv };
}

module.exports = { S, JOURS, EXPOSANT, K, PLONGEURS, CLE_CALAGE, sauvegarde, vols, volsCsv, reelCsv, charger, CORRESPONDANCE, options: S.options };
