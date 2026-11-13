/* Évolution 15 (e) — les empreintes des résultats et des classeurs, pour la
 * non-régression : ce que rendent les outils d'une journée et d'une période
 * (leur JSON, leurs classeurs relus feuille par feuille), sur l'unité fictive
 * de la référence et ses vols fictifs, avec une date de calcul fixe. La même
 * fonction se joue sur un autre arbre (`racine`) : sur le commit d'avant
 * l'évolution 15, elle a donné les empreintes que tests/non-regression-15.test.cjs
 * attend. Aucune donnée de l'unité : tout est fictif. */
const crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const LE = new Date(2026, 10, 2, 10, 0);
const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
const LIGNE = v => [v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',');
const TETE = 'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
const JOURS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const empreinte = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

/**
 * Les empreintes, avec les modules de `racine` : { journee (le JSON de simuler-journee), classeurJournee (chaque feuille du
 * classeur de la journée, relue), periode (le JSON de simuler-periode), classeurPeriode (chaque feuille, relue) }.
 */
async function empreintes(racine) {
  const OJ = require(path.join(racine, 'outils/simuler-journee.cjs')), OP = require(path.join(racine, 'outils/simuler-periode.cjs'));
  const T = require(path.join(racine, 'tableur.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-empreintes-'));
  try {
    const f = (nom, texte) => { const x = path.join(dir, nom); fs.writeFileSync(x, texte); return x; };
    const sv = f('unite-fictive.json', JSON.stringify(S.sauvegarde));
    const jour = f('vols-fictifs.csv', TETE + '\n' + S.args.vols.map(LIGNE).join('\n') + '\n');
    const semaine = f('semaine-fictive.csv', 'date,' + TETE + '\n' + JOURS.flatMap((d, i) => S.args.vols.filter(v => !(i % 2 && v.id === 'NO101')).map(v => d + ',' + LIGNE(v))).join('\n') + '\n');
    const j = await OJ.simulerJournee(sv, jour);
    const cj = await T.lireClasseur(OJ.classeurDeLaJournee(j, LE));
    const p = await OP.simulerPeriode(sv, semaine);
    const { _journees, _vols, ...json } = p;
    const cp = await T.lireClasseur(OP.classeurDeLaPeriode(p, LE));
    return { journee: empreinte(j), classeurJournee: Object.fromEntries(cj.map(x => [x.nom, empreinte(x.lignes)])),
      periode: empreinte(json), classeurPeriode: Object.fromEntries(cp.map(x => [x.nom, empreinte(x.lignes)])) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { empreintes, LE };

if (require.main === module) empreintes(path.resolve(process.argv[2] || path.join(__dirname, '..'))).then(e => console.log(JSON.stringify(e, null, 2)));
