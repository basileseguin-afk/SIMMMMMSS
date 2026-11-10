/* Le plan rejoué dans les tests (évolution 14) : l'unité fictive de la
 * référence de non-régression (une cuisine à J−1, un montage, un robot, une
 * plonge, une mise à disposition, une équipe d'appui, un handling) et ses vols
 * fictifs. Ses zones, des carrés de 10 unités en rang (le moteur n'en lit que
 * les noms), sont posées ici en une grille lisible, décalée de la vue d'origine
 * du plan : le cadrage ne peut pas tomber juste par hasard. Aucune donnée de
 * l'unité. Partagé par les tests navigateur de l'évolution 14. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const REF = require('./non-regression.attendu.json');
const UI = require('../ui-model.js');
const J = require('../moteur/journee.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const PE = require('../moteur/periode.js');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
const LIGNE = (v, d = 0) => [v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std + d) : '', v.sens === 'RET' ? hh(v.sta + d) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',');
const TETE = 'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
/** Les vols fictifs de l'unité, en CSV ; `decalage` minutes plus tard (un autre programme). */
const volsCsv = (decalage = 0) => TETE + '\n' + S.args.vols.map(v => LIGNE(v, decalage)).join('\n') + '\n';

/** La sauvegarde de l'unité fictive, ses zones en grille : `colonnes` par rang, chaque zone `w` × `h` unités, depuis (x0, y0). */
function sauvegardeFictive({ x0 = 900, y0 = 700, colonnes = 6, w = 520, h = 380, ecart = 140 } = {}) {
  const s = JSON.parse(JSON.stringify(S.sauvegarde));
  let i = 0;
  for (const z of s.contenu['orly-plan-v3'].zones) {
    Object.assign(z, { x: x0 + (i % colonnes) * (w + ecart), y: y0 + Math.floor(i / colonnes) * (h + ecart), w, h });
    delete z.pts;
    i++;
  }
  return s;
}

/** L'heure du pic de travail que la page doit ouvrir, calculée hors de la page : les mêmes modules, la même journée. */
function heureDuPicAttendue(sauvegarde, csv) {
  const vols = UI.parseFlights(csv, { eta: true, spmlParCabine: true, date: true });
  const args = J.argumentsDeLaJournee(sauvegarde, vols), r = P.simuler(args), k = I.journee(r, args);
  const decale = g => {
    const c = g.creneaux; if (c.debut === null) return c;
    const d = g.jour * 1440, out = { debut: c.debut + d };
    for (const m of I.MESURES) out[m] = c[m] ? { debut: c[m].debut + d, valeurs: c[m].valeurs } : null;
    return out;
  };
  const total = PE.sommeDesCreneaux(k.services.map(decale)), p = I.pic(total.auTravail);
  return { t: p.debut, personnes: p.personnes, resultat: r, args, k };
}

/** Restaurer la sauvegarde fictive dans la page, puis importer les vols : la page s'ouvre sur `pageId`. */
async function charger(page, nav, url, { sauvegarde = sauvegardeFictive(), csv = volsCsv(), pageId = 'j-plan' } = {}) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-plan-rejoue-'));
  const fichier = (nom, texte) => { const f = path.join(dossier, nom); fs.writeFileSync(f, texte); return f; };
  await page.goto(url);await page.waitForTimeout(300);
  await page.evaluate(() => localStorage.clear());await page.reload();await page.waitForTimeout(400);
  await nav.aller(page, 'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json', JSON.stringify(sauvegarde)));
  const recharge = page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(500);
  await importerVols(page, nav, fichier, 'vols-fictifs.csv', csv);
  await nav.aller(page, pageId);await page.waitForTimeout(400);
  return { fichier, effacer: () => fs.rmSync(dossier, { recursive: true, force: true }) };
}
async function importerVols(page, nav, fichier, nom, csv) {
  await nav.aller(page, 'v-programme');
  await page.locator('#imp-vols').setInputFiles(fichier(nom, csv));
  await page.waitForFunction(n => document.getElementById('source-label').textContent === n, nom);await page.waitForTimeout(200);
}

module.exports = { S, volsCsv, sauvegardeFictive, heureDuPicAttendue, charger, importerVols, hh };
