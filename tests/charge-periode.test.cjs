/* Banc d'essai, évolution 11 (a) — la charge de chaque équipe, et l'arrondi au
 * service (moteur/periode.js). La charge d'une équipe, en ETP, non arrondie :
 *   - une équipe calculée (à la main, hors tunnel, robot de l'évolution 9) : son besoin exact ;
 *   - un robot ou une plonge à effectif saisi : les homme-minutes de ses lots ÷ les minutes de son poste ;
 *   - toute autre équipe : personnes × sa présence ÷ la présence du réglage général ;
 *     de même pour une mise à disposition et pour l'encadrement saisi d'un service.
 * Par service et jour de travail : `charge` (la somme), `personnesService` = ⌈charge⌉,
 * `surplusArrondi` = personnes − personnesService ; `chargeEncadrement` à part. Ni les
 * personnes, ni le besoin, ni la simulation ne changent (docs/BANC_ESSAI.md § 10).
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const E = require('../echanges.js');
const REF = require('./non-regression.attendu.json');
const BASE = require('./periode-bilan.attendu.json');

const h = s => P.minutes(s);
const DATE = '2026-11-02';
const dep = (id, cie, std, yc) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc, crew: 0 });
const POSTE = { actif: true, seuils: [], presence: 420 };   // 420 minutes de travail, sans pause
const equipe = (id, service, lots, p) => ({ id, nom: id, service, type: 'manuel', debut: '06:00', jour: 0, personnes: 1, pauses: [], lots, regime: POSTE, ...p });
const proche = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-9, (msg || '') + ' : ' + x + ' ≠ ' + y);
/** Une journée jouée, extraite et mise au bilan comme dans une période. */
function jour(args, encadrement) {
  const a = { liaisons: [], rendement: 1, ...args };
  const extrait = PE.extraire(P.simuler(a), a, DATE);
  const b = PE.bilan([{ date: DATE, extrait }], { etat: { ateliers: a.ateliers, ...(encadrement ? { encadrement } : {}) } }, { debut: DATE, fin: DATE });
  return { equipe: id => extrait.equipes.find(e => e.id === id), service: id => b.joursTravail[0].services[id], w: b.joursTravail[0], b };
}

test('deux équipes calculées à 2,3 et 1,4 ETP : 3 + 2 = 5 personnes, 4 au service, 1 de surplus d’arrondi', () => {
  // 966 et 588 homme-minutes sur un poste de 420 minutes.
  const j = jour({ vols: [dep('SU1', 'SUD', '12:00', 100), dep('NO1', 'NORD', '12:00', 100)], bareme: { prepa: { 'SUD/YC': 966, 'NORD/YC': 588 } },
    ateliers: [equipe('a', 'prepa', [['SUD/YC']]), equipe('b', 'prepa', [['NORD/YC']])], effectifCalcule: ['prepa'] });
  proche(j.equipe('a').charge, 2.3, 'a'); proche(j.equipe('b').charge, 1.4, 'b');
  assert.equal(j.equipe('a').charge, j.equipe('a').besoin, 'une équipe calculée : son besoin exact');
  const s = j.service('prepa');
  assert.equal(s.personnes, 5);
  proche(s.charge, 3.7, 'la charge du service');
  assert.deepEqual([s.personnesService, s.surplusArrondi], [4, 1]);
  assert.deepEqual([j.w.total.personnesService, j.w.total.surplusArrondi], [4, 1], 'le total du jour');
  proche(j.w.equipes.a.charge, 2.3, 'le détail par équipe');
});

test('un robot à 6 personnes saisies, sa ligne 210 minutes sur un poste de 420 : 3 ETP', () => {
  // 3 vols × 350 plateaux à 300 plateaux par heure : 210 minutes de ligne.
  const robot = { id: 'rb', nom: 'Robot', service: 'robot', type: 'robot', debut: '06:00', jour: 0, personnes: 6, personnesMin: 1, debit: 300, pauses: [],
    lots: [['SUD/YC']], regime: POSTE };
  const j = jour({ vols: ['10:00', '11:00', '12:00'].map((t, i) => dep('SU' + i, 'SUD', t, 350)), bareme: {}, ateliers: [robot] });
  assert.equal(j.equipe('rb').calcule, false);
  proche(j.equipe('rb').charge, 3);
  assert.deepEqual([j.service('robot').personnes, j.service('robot').personnesService, j.service('robot').surplusArrondi], [6, 3, 3]);
});

test('un robot saturé : le lot que la fin du poste interrompt compte ce qui en a été fait', () => {
  // 6 personnes, un poste de 420 minutes, deux lots de 300 minutes chacun : la ligne tourne tout le poste.
  const robot = { id: 'rb', nom: 'Robot', service: 'robot', type: 'robot', debut: '06:00', jour: 0, personnes: 6, personnesMin: 1, debit: 60, pauses: [],
    lots: [['SUD/YC'], ['NORD/YC']], regime: POSTE };
  const j = jour({ vols: [dep('SU1', 'SUD', '23:00', 300), dep('NO1', 'NORD', '23:30', 300)], bareme: {}, ateliers: [robot] });
  proche(j.equipe('rb').charge, 6, 'toute l’équipe, tout le poste');
});

test('une plonge à effectif saisi : les homme-minutes de ses lots ÷ son poste', () => {
  // L'unité fictive de la référence : deux plonges par vol, un tunnel d'une personne par vol lavé (des vols non lavés à la fin du poste).
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const args = J.argumentsDeLaJournee(S.sauvegarde, S.args.vols, S.options), r = J.jouer(args);
  const extrait = PE.extraire(r, args, DATE), charge = id => extrait.equipes.find(e => e.id === id).charge;
  assert.equal(P.minutesDuPoste(args.ateliers.find(a => a.id === 'pl1'), args.regime), 390);
  proche(charge('pl1'), (30 + 20 + 30 + 20 + 20 + 20 + 30 + 20) / 390, 'pl1');
  proche(charge('pl2'), (30 + 30 + 30 + 45 + 30 + 30) / 390, 'pl2 : ses vols non lavés ne comptent pas');
  // Au débit : les personnes des tunnels qui tournent (2 + 1), pendant chaque lot.
  const D = REF.scenarios.find(s => s.nom === 'unite-debit');
  const a2 = J.argumentsDeLaJournee(D.sauvegarde, D.args.vols, D.options), r2 = J.jouer(a2);
  const lots = r2.lots.filter(l => l.atelier === 'pl' && !l.impossible);
  proche(PE.extraire(r2, a2, DATE).equipes.find(e => e.id === 'pl').charge, lots.reduce((n, l) => n + l.duree, 0) * 3 / 450, 'au débit');
});

test('toute autre équipe : personnes × sa présence ÷ la présence générale ; une mise à disposition et l’encadrement de même', () => {
  const fixe = p => equipe('f', 'prepa', [['SUD/YC']], { personnes: 3, effectif: 'fixe', ...p });
  const vols = [dep('SU1', 'SUD', '14:00', 100)];
  // Présence générale : 8 h (480 minutes), le réglage par défaut.
  const huit = jour({ vols, bareme: { prepa: { 'SUD/YC': 60 } }, ateliers: [fixe({ regime: { actif: true } })] });
  assert.equal(huit.equipe('f').charge, 3, 'sa présence est la présence générale : ses personnes');
  const six = jour({ vols, bareme: { prepa: { 'SUD/YC': 60 } }, ateliers: [fixe({ regime: { actif: true, presence: 360 } })] });
  proche(six.equipe('f').charge, 2.25, '3 personnes 6 h, présence générale 8 h');
  assert.deepEqual([six.service('prepa').personnesService, six.service('prepa').surplusArrondi], [3, 0]);
  // Une mise à disposition de 2 personnes, 6 h ; l'encadrement saisi d'un service, à la présence générale.
  const dispo = { id: 'md', nom: 'Appros', service: 'appros', type: 'dispo', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [['SUD/YC']], regime: { actif: true, presence: 360 } };
  const j = jour({ vols, bareme: { prepa: { 'SUD/YC': 60 } }, ateliers: [fixe(), dispo] }, { prepa: 2 });
  proche(j.equipe('md').charge, 1.5, 'la mise à disposition');
  assert.equal(j.service('prepa').encadrement, 2);
  assert.equal(j.service('prepa').chargeEncadrement, 2, 'l’encadrement, à part');
  assert.equal(j.service('prepa').personnesService, 3, 'l’encadrement n’entre pas dans les personnes du service');
  // Une équipe sans régime (pas de fin de poste) : ses personnes.
  assert.equal(jour({ vols, bareme: { prepa: { 'SUD/YC': 60 } }, ateliers: [fixe({ regime: { actif: false } })] }).equipe('f').charge, 3);
});

test('les totaux et les moyennes du mois et de la période ont la charge, les personnes du service et le surplus', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const vols = ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
  const b = PE.depuisSauvegarde(S.sauvegarde, vols, S.options).bilan;
  const complets = b.joursTravail.filter(w => w.complet);
  for (const k of ['charge', 'personnesService', 'surplusArrondi', 'chargeEncadrement']) {
    proche(b.periode.total[k], complets.reduce((n, w) => n + w.total[k], 0), k);
    proche(b.periode.moyenne[k], b.periode.total[k] / complets.length, k + ' en moyenne');
  }
  for (const w of b.joursTravail) for (const [id, s] of Object.entries(w.services)) {
    assert.equal(s.personnesService, Math.ceil(s.charge - 1e-9) || 0, w.date + ' ' + id);
    assert.ok(!Object.is(s.personnesService, -0), 'pas de −0 : ' + w.date + ' ' + id);
    assert.equal(s.surplusArrondi, s.personnes - s.personnesService, w.date + ' ' + id);
  }
});

test('l’encadrement, chaque jour de travail, et dans les totaux et les moyennes', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const sv = JSON.parse(JSON.stringify(S.sauvegarde));
  sv.contenu['ory-ateliers-v1'].encadrement = { cuisine: 2 };
  const vols = ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
  const b = PE.depuisSauvegarde(sv, vols, S.options).bilan, complets = b.joursTravail.filter(w => w.complet);
  for (const w of b.joursTravail) assert.deepEqual([w.services.cuisine.encadrement, w.services.cuisine.chargeEncadrement], [2, 2], w.date);
  assert.equal(b.periode.total.chargeEncadrement, 2 * complets.length);
  assert.equal(b.periode.moyenne.services.cuisine.chargeEncadrement, 2);
  assert.equal(complets[0].total.personnesService, Object.values(complets[0].services).reduce((n, x) => n + x.personnesService, 0), 'l’encadrement n’entre pas dans les personnes du service');
});

test('non-régression : les personnes, le besoin et les autres mesures du bilan ne changent pas', () => {
  const r3 = x => (x == null ? null : Math.round(x * 1000) / 1000);
  for (const [nom, attendu] of Object.entries(BASE.scenarios)) {
    const S = REF.scenarios.find(s => s.nom === nom);
    const vols = ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
    const p = PE.depuisSauvegarde(S.sauvegarde, vols, S.options);
    const m = x => BASE.mesures.map(k => r3(x[k]));
    assert.deepEqual(p.bilan.joursTravail.map(w => ({ date: w.date, complet: w.complet, services: Object.fromEntries(Object.entries(w.services).map(([id, s]) => [id, m(s)])),
      total: m(w.total) })), attendu.joursTravail, nom);
    assert.deepEqual({ total: m(p.bilan.periode.total), moyenne: m(p.bilan.periode.moyenne) }, attendu.periode, nom);
    assert.deepEqual(p.journees.map(j => ({ date: j.date, equipes: j.extrait.equipes.map(e => [e.id].concat(BASE.champsEquipe.map(k => r3(e[k])))) })), attendu.equipes, nom);
  }
});

test('le classeur de la période : la charge dans Période et dans Équipes', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const p = PE.depuisSauvegarde(S.sauvegarde, S.args.vols.map(v => ({ ...v, date: DATE })), S.options);
  const F = E.periodeVersClasseur(p, { sauvegarde: 'unite-fictive.json', vols: 'vols.csv', reglages: {}, calculeLe: new Date(2026, 10, 2) });
  const feuille = nom => F.find(f => f.nom === nom).lignes;
  const per = feuille('Période'), eq = feuille('Équipes');
  for (const c of ['Charge (ETP)', 'Personnes du service', 'Surplus d’arrondi', 'Charge de l’encadrement (ETP)']) assert.ok(per[0].includes(c), c);
  assert.ok(eq[0].includes('Charge (ETP)'));
  // Les lignes « Toute l'unité » des jours, dans l'ordre des jours de travail.
  const i = p.bilan.joursTravail.findIndex(x => x.date === DATE), tot = per.filter(l => l[0] === 'jour' && l[7] === 'Toute l’unité')[i];
  assert.equal(tot[per[0].indexOf('Personnes du service')], p.bilan.joursTravail[i].total.personnesService);
  assert.equal(tot[per[0].indexOf('Charge (ETP)')], Math.round(p.bilan.joursTravail[i].total.charge * 100) / 100);
  // Les valeurs : la charge de chaque équipe dans Équipes, le surplus et la charge d'encadrement dans Période.
  const ce = eq[0].indexOf('Charge (ETP)'), equipes = p.journees.flatMap(j => j.extrait.equipes);
  for (const l of eq.slice(1)) {
    const e = equipes.find(x => x.nom === l[4]);
    assert.equal(l[ce], Math.round(e.charge * 100) / 100, l[4]);
  }
  assert.equal(tot[per[0].indexOf('Surplus d’arrondi')], p.bilan.joursTravail[i].total.surplusArrondi);
  assert.equal(tot[per[0].indexOf('Charge de l’encadrement (ETP)')], 0);
  const lisez = feuille('Lisez-moi').map(l => l[0]).join('\n');
  assert.match(lisez, /Charge \(ETP\)/);
  assert.match(lisez, /Surplus d’arrondi/);
});
