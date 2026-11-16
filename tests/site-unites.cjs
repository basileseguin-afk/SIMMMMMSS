/* Évolution 20 — des unités fictives pour le site de la vue en direct
 * (moteur/site.js) : les réglages que lit `generer`, sans navigateur.
 *   — `UNITE`, `atelier`, `T`, `NOMS`, `CHEMIN`, `REGIME` : une petite unité,
 *     celle des tests du site (tests/site-genere.test.cjs) ;
 *   — `unitesDeReference()` : les unités dont le site est gardé, champ par
 *     champ, dans tests/site-avant-20.attendu.json — le site que rendait le
 *     commit d'avant l'évolution 20. Aucune n'a d'annexe rattachée, deux
 *     équipes d'un même robot en même temps, ni deux services robot : ce sont
 *     les seuls cas où l'évolution 20 (a) change le site sans réglage.
 * Aucune donnée de l'unité : services, équipes et chemins sont inventés. */
const F = require('./plan-rejoue-fictif.cjs');
const U = require('./unite-15-services.cjs');

const REGIME = { seuils: [], presence: 480 };
const atelier = (id, service, type, debut, personnes, p = {}) => ({ id, nom: id, service, type, debut, jour: 0, personnes, lots: [], ...p });
const T = (nom, p = {}) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
const NOMS = { magasin: 'Magasin', preparation: 'Prépa', prepa: 'Montage', armement: 'Armement', cuisine: 'Cuisine', plonge: 'Plonge', quais: 'Quais',
  patisserie: 'Pâtisserie', controle: 'Contrôle', robot: 'Ligne robotisée', robot2: 'Seconde ligne', dotation: 'Dotation' };
// Un chemin, de l'amont vers l'aval : le magasin, la cuisine, la prépa, le montage, le quai ; l'armement rejoint le quai.
const CHEMIN = [{ id: 'c', nom: 'c', noeuds: ['magasin', 'cuisine', 'preparation', 'prepa', 'quais', 'armement', 'plonge'],
  liens: [{ de: 'magasin', vers: 'cuisine' }, { de: 'cuisine', vers: 'preparation' }, { de: 'preparation', vers: 'prepa' }, { de: 'prepa', vers: 'quais' }, { de: 'armement', vers: 'quais' }] }];
// L'unité : un magasin, la cuisine (6 personnes), la prépa et le montage, l'armement, la plonge (4), le quai (2).
const UNITE = (plus = []) => [
  atelier('mag', 'magasin', 'dispo', '02:00', 2),
  atelier('cu', 'cuisine', 'manuel', '04:00', 6),
  atelier('pr', 'preparation', 'manuel', '04:00', 4),
  atelier('mo', 'prepa', 'manuel', '05:00', 10),
  atelier('ar', 'armement', 'manuel', '05:00', 5),
  atelier('pl', 'plonge', 'lavage', '06:00', 4, { parVol: true, tunnels: [T('Tunnel 1'), T('Tunnel 2')] }),
  atelier('h', 'quais', 'handling', '04:00', 2),
  ...plus];

const etatDe = s => { const x = s.contenu['ory-ateliers-v1']; return typeof x === 'string' ? JSON.parse(x) : x; };
const nomsDe = s => Object.fromEntries(s.contenu['orly-plan-v3'].zones.map(z => [z.id, z.nom]));
/** Les réglages du site d'une sauvegarde fictive : ses équipes, ses chemins, les noms de son plan. */
function reglagesDe(sauvegarde, plus = {}) {
  const e = etatDe(sauvegarde);
  return { ateliers: e.ateliers, parcours: e.parcours, noms: nomsDe(sauvegarde), regime: REGIME, ...plus };
}

/** Des unités tirées d'une graine fixe : de zéro à huit services, des parts réglées, au plus une équipe robot. */
function unitesTirees(n) {
  let graine = 20261116;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; }, entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const SERVICES = ['magasin', 'cuisine', 'preparation', 'prepa', 'armement', 'plonge', 'quais', 'dotation'];
  const TYPES = { magasin: ['dispo'], plonge: ['lavage'], quais: ['handling'] }, out = [];
  for (let i = 0; i < n; i++) {
    const ateliers = [];
    for (const s of SERVICES) if (alea() < 0.8) for (let k = 0, nb = entier(1, 3); k < nb; k++) {
      const choix = TYPES[s] || ['manuel', 'manuel', 'appui'], type = choix[entier(0, choix.length - 1)];
      ateliers.push(atelier(s + k, s, type, String(entier(0, 23)).padStart(2, '0') + ':00', entier(0, 20), { jour: entier(-1, 1),
        ...(type === 'lavage' ? { parVol: true, tunnels: Array.from({ length: entier(1, 4) }, (_, j) => T('Tunnel ' + entier(1, 5), { personnes: entier(0, 2) })) } : {}) }));
    }
    // Au plus une équipe robot : sa ligne est la même avant et après l'évolution 20.
    if (alea() < 0.5) ateliers.push(atelier('robot0', ['prepa', 'cuisine', 'dotation'][entier(0, 2)], 'robot', String(entier(0, 23)).padStart(2, '0') + ':00', entier(0, 6)));
    const surfaces = Object.fromEntries(SERVICES.filter(() => alea() < 0.25).map(s => [s, entier(5, 50)]));
    out.push({ nom: 'tirée ' + i, reglages: { ateliers, noms: NOMS, ...(alea() < 0.5 ? { parcours: CHEMIN } : {}), regime: REGIME, surfaces } });
  }
  return out;
}

/** Les unités de la référence : [{ nom, reglages }]. */
function unitesDeReference() {
  return [
    { nom: 'petite unité', reglages: { ateliers: UNITE(), noms: NOMS, parcours: CHEMIN, regime: REGIME } },
    { nom: 'petite unité, un robot, des parts réglées', reglages: { ateliers: UNITE([atelier('rb1', 'prepa', 'robot', '03:00', 2), atelier('rb2', 'prepa', 'robot', '11:00', 2)]),
      noms: NOMS, parcours: CHEMIN, regime: REGIME, surfaces: { cuisine: 30, magasin: 10 } } },
    { nom: 'plan rejoué fictif', reglages: reglagesDe(F.sauvegardeFictive()) },
    { nom: 'unité de 15 services', reglages: reglagesDe(U.sauvegarde()) },
    { nom: 'sans équipe', reglages: { ateliers: [], noms: NOMS, regime: REGIME } },
    ...unitesTirees(60)];
}

/**
 * La référence, pour un générateur `S` (moteur/site.js) : le site entier des unités nommées, et l'empreinte (SHA-256 de son
 * JSON) de celui des unités tirées. `node tests/site-unites.cjs [racine]` l'écrit : c'est ainsi que
 * tests/site-avant-20.attendu.json a été calculé, sur le commit d'avant l'évolution 20.
 */
function reference(S) {
  const crypto = require('node:crypto'), sites = {}, empreintes = {};
  for (const u of unitesDeReference()) {
    const site = S.generer(u.reglages);
    if (u.nom.startsWith('tirée ')) empreintes[u.nom] = crypto.createHash('sha256').update(JSON.stringify(site)).digest('hex');
    else sites[u.nom] = JSON.parse(JSON.stringify(site));
  }
  return { sites, empreintes };
}

module.exports = { REGIME, atelier, T, NOMS, CHEMIN, UNITE, reglagesDe, etatDe, nomsDe, unitesTirees, unitesDeReference, reference };

if (require.main === module) {
  const path = require('node:path');
  console.log(JSON.stringify(reference(require(path.join(path.resolve(process.argv[2] || path.join(__dirname, '..')), 'moteur/site.js'))), null, 1));
}
