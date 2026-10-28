/* Banc d'essai, évolution 11 (e) — les vacations longues : une présence au
 * contrat (`presenceContrat`, des minutes ou « HH:MM ») sur une équipe et sur
 * l'encadrement saisi d'un service ({ personnes, presence, presenceContrat } ;
 * l'ancienne forme, un nombre, se lit toujours). Quand la présence dépasse le
 * contrat, chaque personne compte l'écart en heures sup d'office, chaque jour :
 * `heuresSupOffice` par équipe et par service, `heuresSupOfficeEncadrement` ;
 * la comparaison au réel les ajoute aux heures sup simulées. Sans le champ,
 * rien ne change (docs/BANC_ESSAI.md § 10). Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../ateliers.js');
const PE = require('../moteur/periode.js');
const R = require('../moteur/reel.js');
const REF = require('./non-regression.attendu.json');
const BASE = require('./periode-bilan.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const JOURS = ['2026-11-02', '2026-11-03', '2026-11-04'];
const VOLS = JOURS.flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
/** La sauvegarde fictive, retouchée : l'encadrement de la cuisine, une équipe de cuisine. */
function sauvegarde({ encadrement, equipe } = {}) {
  const sv = JSON.parse(JSON.stringify(S.sauvegarde)), at = sv.contenu['ory-ateliers-v1'];
  if (encadrement !== undefined) at.encadrement = { cuisine: encadrement };
  if (equipe) Object.assign(at.ateliers.find(a => a.id === 'cu1'), equipe);
  return sv;
}
const bilan = sv => PE.depuisSauvegarde(sv, VOLS, S.options).bilan;

test('l’encadrement : 2 personnes présentes 10 h pour un contrat de 7 h 30, 5 h d’office par jour', () => {
  const b = bilan(sauvegarde({ encadrement: { personnes: 2, presence: '10:00', presenceContrat: '07:30' } }));
  for (const w of b.joursTravail) {
    assert.equal(w.services.cuisine.heuresSupOfficeEncadrement, 2 * 150, w.date + ' : 2 × 2 h 30');
    assert.equal(w.services.cuisine.encadrement, 2);
  }
  assert.equal(b.periode.total.heuresSupOfficeEncadrement, 300 * b.periode.jours);
  // Sa charge suit sa présence : 2 × 10 h ÷ la présence générale.
  const generale = 450;   // le réglage général de l'unité fictive
  assert.equal(b.joursTravail[0].services.cuisine.chargeEncadrement, 2 * 600 / generale);
});

test('une équipe, de même : sa présence au-delà de son contrat, chaque personne', () => {
  const b = bilan(sauvegarde({ equipe: { regime: { actif: true, presence: 600 }, presenceContrat: 450 } }));
  const w = b.joursTravail.find(x => x.equipes.cu1), e = w.equipes.cu1;
  assert.ok(e.personnes > 0);
  assert.equal(e.heuresSupOffice, 150 * e.personnes);
  assert.equal(w.services.cuisine.heuresSupOffice, 150 * e.personnes, 'le service additionne ses équipes');
});

test('l’ancienne forme de l’encadrement se lit et ne change rien ; « HH:MM » ou des minutes', () => {
  const v = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [], encadrement: { cuisine: 2, prepa: { personnes: 3 }, dotation: { personnes: 1, presence: '09:00', presenceContrat: 420 }, x: 0 } });
  assert.deepEqual(v.encadrement, { cuisine: 2, prepa: 3, dotation: { personnes: 1, presence: 540, presenceContrat: 420 } });
  const b = bilan(sauvegarde({ encadrement: 2 }));
  assert.deepEqual([b.joursTravail[0].services.cuisine.chargeEncadrement, b.joursTravail[0].services.cuisine.heuresSupOfficeEncadrement], [2, 0]);
  const e = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [{ id: 'a', nom: 'A', service: 'prepa', type: 'manuel', presenceContrat: '07:30' }] }).ateliers[0];
  assert.equal(e.presenceContrat, 450);
  const equipe = presenceContrat => A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [{ id: 'a', nom: 'A', service: 'prepa', type: 'manuel', presenceContrat }] }).ateliers[0];
  assert.equal(equipe('450').presenceContrat, 450, 'des minutes en chiffres');
  assert.equal(equipe('24:00').presenceContrat, 1440);
  assert.equal('presenceContrat' in equipe(''), false, 'vide : pas de contrat');
  // Une présence illisible dans un fichier : il est refusé, en la nommant.
  for (const x of ['tard', '07:90', 29, 1441]) assert.throws(() => equipe(x), /Équipe « A », présence au contrat : « .* » n’est pas une présence/, String(x));
  assert.throws(() => A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [], encadrement: { cuisine: { personnes: 2, presence: 'tard' } } }),
    /Encadrement de « cuisine », présence : « tard » n’est pas une présence/);
});

test('une équipe sans poste réglé (sans présence propre) : l’écart se prend à la présence générale', () => {
  // La Prépa fictive n'a pas de poste avec pauses : sa présence est celle du réglage général, 7 h 30.
  const sv = sauvegarde(), at = sv.contenu['ory-ateliers-v1'];
  Object.assign(at.ateliers.find(a => a.id === 'pr'), { presenceContrat: 400 });
  const w = PE.depuisSauvegarde(sv, VOLS, S.options).bilan.joursTravail.find(x => x.equipes.pr), e = w.equipes.pr;
  assert.equal(e.heuresSupOffice, 50 * e.personnes, '450 − 400 = 50 min par personne');
  Object.assign(at.ateliers.find(a => a.id === 'pr'), { presenceContrat: 500 });
  assert.equal(PE.depuisSauvegarde(sv, VOLS, S.options).bilan.joursTravail.find(x => x.equipes.pr).equipes.pr.heuresSupOffice, 0, 'un contrat plus long : rien');
});

test('le classeur des équipes ne porte pas la présence au contrat : à la relecture, celle du site reste', () => {
  const E = require('../echanges.js');
  // Comme les postes de travail (tests/renforts.test.cjs) : un état fait des seules équipes.
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: A.valider({ schema: 'ory-ateliers', version: 1,
    ateliers: [{ id: 'a', nom: 'Équipe A', service: 'prepa', type: 'manuel', personnes: 2, presenceContrat: 450 }] }).ateliers };
  const ctx = { services: [{ id: 'prepa', nom: 'Montage' }], programme: [], classes: [] };
  const relu = A.valider(E.classeurVersAteliers(E.ateliersVersClasseur(etat, ctx), etat, ctx).etat);
  assert.equal(relu.ateliers.find(a => a.id === 'a').presenceContrat, 450);
});

test('la comparaison au réel ajoute les heures sup d’office aux heures sup simulées', () => {
  const b = bilan(sauvegarde({ encadrement: { personnes: 2, presence: 600, presenceContrat: 450 } }));
  const w = b.joursTravail.filter(x => x.complet);
  const lu = { lignes: w.flatMap((x, i) => [{ ligne: 2 * i + 2, date: x.date, role: 'Chef', titulaires: 20, interim: 0, supp: 5 }]), avecSupp: true };
  const c = R.comparer(b, R.controler(lu), { lignes: [{ nom: 'Encadrement', roles: ['Chef'], encadrement: 'cuisine' }] });
  assert.equal(c.lignes[0].heuresSupp[0].simule, 5 * w.length, '5 h d’office par jour');
});

test('non-régression : sans présence au contrat, les mesures du bilan ne changent pas, et les nouvelles valent 0', () => {
  const r3 = x => (x == null ? null : Math.round(x * 1000) / 1000);
  for (const [nom, attendu] of Object.entries(BASE.scenarios)) {
    const s = REF.scenarios.find(x => x.nom === nom);
    const b = PE.depuisSauvegarde(s.sauvegarde, ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap(d => s.args.vols.map(v => ({ ...v, date: d }))), s.options).bilan;
    assert.deepEqual(b.joursTravail.map(w => ({ date: w.date, complet: w.complet, services: Object.fromEntries(Object.entries(w.services).map(([id, x]) => [id, BASE.mesures.map(k => r3(x[k]))])),
      total: BASE.mesures.map(k => r3(w.total[k])) })), attendu.joursTravail, nom);
    assert.deepEqual([b.periode.total.heuresSupOffice, b.periode.total.heuresSupOfficeEncadrement], [0, 0]);
  }
});

test('le classeur de la période : les colonnes des heures sup d’office avec elles, le classeur d’avant sans elles', () => {
  const E = require('../echanges.js');
  const ctx = { sauvegarde: 'unite-fictive.json', vols: 'vols.csv', reglages: {}, calculeLe: new Date(2026, 10, 5) };
  const per = (sv, nom) => E.periodeVersClasseur(PE.depuisSauvegarde(sv, VOLS, S.options), ctx).find(f => f.nom === nom).lignes;
  const avec = sauvegarde({ encadrement: { personnes: 2, presence: 600, presenceContrat: 450 }, equipe: { regime: { actif: true, presence: 600 }, presenceContrat: 450 } });
  const h = per(avec, 'Période')[0], i = h.indexOf('Heures sup d’office de l’encadrement (min × pers.)');
  assert.ok(h.includes('Heures sup d’office (min × pers.)') && i > 0);
  assert.ok(per(avec, 'Période').some(l => l[0] === 'jour' && l[i] === 300), 'un jour : 2 × 2 h 30');
  assert.ok(per(avec, 'Équipes')[0].includes('Heures sup d’office (min × pers.)'));
  const sans = per(sauvegarde(), 'Période')[0];
  assert.ok(!sans.some(x => /d’office/.test(x)), 'sans présence au contrat : les colonnes d’avant');
  assert.ok(!per(sauvegarde(), 'Équipes')[0].some(x => /d’office/.test(x)));
});
