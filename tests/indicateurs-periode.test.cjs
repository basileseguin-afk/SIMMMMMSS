/* Banc d'essai, évolution 12 (b) — les indicateurs de charge sur une période
 * (moteur/periode.js, moteur/indicateurs.js ; docs/BANC_ESSAI.md § 13). Le
 * bilan de la période gagne, par jour de travail et par service, les ETP
 * présents, les heures au travail, les pics et leur créneau, l'occupation
 * pondérée ; par jour de travail et par équipe, l'occupation, le consommé sur
 * disponible, le débit, la file la plus longue (`indicateursCharge`). Les
 * créneaux d'un jour de travail rassemblent les journées de vols qui y
 * travaillent (J−2, J−1, J), comme le bilan ; totaux et moyennes par mois et
 * sur la période, sur les jours complets seulement. Unité, vols et équipes
 * fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const PE = require('../moteur/periode.js');

const h = s => P.minutes(s);
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const dep = (id, std) => ({ id, cie: 'NORD', sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const DATES = ['2026-11-02', '2026-11-03', '2026-11-04'];
// Une cuisine la veille (J−1, 06:00) et un montage le jour même (J, 14:00), dans deux services ; un second montage à J−1.
const ATELIERS = [
  { id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '06:00', jour: -1, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } },
  { id: 'mv', nom: 'Montage veille', service: 'prepa', type: 'manuel', debut: '06:00', jour: -1, personnes: 1, lots: [], regime: { actif: true } },
  { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '14:00', jour: 0, personnes: 3, lots: [['NORD/YC']], regime: { actif: true } }];
const args = (n, ateliers = ATELIERS) => ({ vols: Array.from({ length: n }, (_, i) => dep('NO' + i, P.hhmm(h('20:00') + i))), liaisons: [], rendement: 1,
  bareme: { cuisine: { '*/YC': 30 }, prepa: { '*/YC': 20 } }, ateliers,
  parcours: [{ id: 'c1', nom: 'Chaud', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }], parcoursCabine: { YC: 'c1' } });
/** Des journées jouées et extraites comme dans une période. */
const journeesDe = (dates, faire = () => args(2)) => dates.map(date => { const a = faire(); return { date, extrait: PE.extraire(P.simuler(a), a, date) }; });
const auBilan = (journees, ateliers = ATELIERS) => PE.bilan(journees, { etat: { ateliers } }, { debut: journees[0].date, fin: journees[journees.length - 1].date });
/** Des journées jouées et extraites comme dans une période, puis leur bilan. */
const periode = (dates, n = 2) => auBilan(journeesDe(dates, () => args(n)));
const jourDe = (b, date) => b.joursTravail.find(w => w.date === date);
const sansIndicateurs = x => { if (x && typeof x === 'object') { delete x.indicateursCharge; Object.values(x).forEach(sansIndicateurs); } return x; };

test('une équipe à J−1 compte au jour des vols − 1 ; un jour de travail rassemble J−1 et J', () => {
  const b = periode(DATES);
  assert.deepEqual(b.joursTravail.map(w => [w.date, w.complet]), [['2026-11-01', false], ['2026-11-02', true], ['2026-11-03', true], ['2026-11-04', false]]);
  // Le 01 : seulement la cuisine et le montage de la veille, pour les vols du 02.
  const w1 = jourDe(b, '2026-11-01');
  assert.deepEqual(Object.keys(w1.equipes).sort(), ['cu', 'mv']);
  assert.ok(w1.equipes.cu.indicateursCharge && w1.services.cuisine.indicateursCharge);
  // Le 02 : le montage des vols du 02 (J) et celui de la veille pour les vols du 03 (J−1), dans un seul service.
  const c = jourDe(b, '2026-11-02').services.prepa.indicateursCharge.creneaux;
  const v = t => c.presents.valeurs[(h(t) - c.debut) / 15];
  assert.deepEqual([c.debut, v('06:00'), v('13:45'), v('14:00'), v('21:45')], [h('06:00'), 1, 1, 3, 3]);
  const k = jourDe(b, '2026-11-02').services.prepa.indicateursCharge;
  proche(k.etp, 1 + 3, 'les deux montages');
  assert.deepEqual(k.picPresents, { personnes: 3, debut: h('14:00') });
});

test('par équipe et par jour de travail : occupation, consommé, débit, file la plus longue', () => {
  const b = periode(DATES), e = jourDe(b, '2026-11-02').equipes.mo.indicateursCharge;
  // 2 vols × 20 min, à 3 personnes : 40 homme-minutes, 40 / 3 min au travail.
  // Aucune pause atteinte : 480 min disponibles par personne (correction 16).
  proche(e.occupation, 40 / (3 * 480)); proche(e.consommeSurDisponible, 40 / (3 * 480));
  assert.deepEqual([e.unite, e.termines], ['repas', 200]);
  assert.ok(e.fileMax && Number.isFinite(e.fileMax.lots));
  assert.equal(jourDe(b, '2026-11-02').equipes.mo.vols, '2026-11-02');
});

test('un jour incomplet sort des moyennes ; la somme sur la période = la somme des jours complets', () => {
  const b = periode(DATES), complets = b.joursTravail.filter(w => w.complet);
  const p = b.periode.indicateursCharge.services;
  for (const s of ['cuisine', 'prepa']) {
    const jours = complets.map(w => w.services[s].indicateursCharge);
    proche(p[s].total.heuresAuTravail, jours.reduce((n, x) => n + x.heuresAuTravail, 0), s + ' : heures au travail');
    proche(p[s].total.etp, jours.reduce((n, x) => n + x.etp, 0), s + ' : ETP');
    proche(p[s].moyenne.heuresAuTravail, p[s].total.heuresAuTravail / complets.length, s + ' : la moyenne, sur les jours complets');
    assert.equal(p[s].jours, complets.length);
  }
  // Le 01 (incomplet) a de la cuisine : elle n'entre ni dans le total, ni dans la moyenne.
  assert.ok(jourDe(b, '2026-11-01').services.cuisine.indicateursCharge.heuresAuTravail > 0);
  proche(p.cuisine.total.heuresAuTravail, complets.reduce((n, w) => n + w.services.cuisine.indicateursCharge.heuresAuTravail, 0));
  // Par mois : le même calcul, mois par mois.
  assert.deepEqual(b.mois.map(m => [m.mois, m.indicateursCharge.services.prepa.jours]), [['2026-11', complets.length]]);
  // Le pic de la période : le plus haut des jours complets, avec sa date et son créneau.
  const pic = p.prepa.picAuTravail, pics = complets.map(w => w.services.prepa.indicateursCharge.picAuTravail.personnes);
  assert.equal(pic.personnes, Math.max(...pics));
  assert.deepEqual(pic, { ...jourDe(b, pic.date).services.prepa.indicateursCharge.picAuTravail, date: complets[pics.indexOf(pic.personnes)].date }, 'le premier jour du plus haut');
  proche(p.prepa.picAuTravailMoyen, pics.reduce((n, x) => n + x, 0) / complets.length);
  // Par équipe : l'occupation sur la période, Σ au travail ÷ Σ disponible.
  const eq = b.periode.indicateursCharge.equipes.mo, js = complets.map(w => w.equipes.mo.indicateursCharge);
  proche(eq.occupation, js.reduce((n, x) => n + x.auTravail, 0) / js.reduce((n, x) => n + x.disponible, 0));
});

test('sans les indicateurs dans les extraits, le bilan est celui d’avant, champ par champ', () => {
  const journees = journeesDe(DATES), b = auBilan(journees);
  // Des extraits d'avant l'évolution 12 (une période enregistrée avant elle) : sans `indicateursCharge`.
  const avant = auBilan(journees.map(j => ({ ...j, extrait: { ...j.extrait, indicateursCharge: undefined } })));
  assert.deepEqual(avant.periode.indicateursCharge, { services: {}, equipes: {} });
  assert.ok(Object.values(avant.joursTravail[1].services).every(s => !('indicateursCharge' in s)));
  assert.deepEqual(sansIndicateurs(JSON.parse(JSON.stringify(b))), sansIndicateurs(JSON.parse(JSON.stringify(avant))));
});

test('le handling : son débit sur la période = Σ vols chargés ÷ Σ heures de chargement ; une mise à disposition, sans objet', () => {
  const ateliers = [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } },
    { id: 'hq', nom: 'Quais', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, durees: { '*': 30 }, compagnies: [] },
    { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, permanent: true }];
  const faire = () => ({ vols: [dep('NO1', '12:00'), dep('NO2', '13:00'), dep('NO3', '13:30')], liaisons: [], bareme: { prepa: { '*/YC': 30 } }, rendement: 1, ateliers,
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['magasin', 'prepa', 'quais'], liens: [{ de: 'magasin', vers: 'prepa' }, { de: 'prepa', vers: 'quais' }] }], parcoursCabine: { YC: 'c1' } });
  const b = auBilan(journeesDe(DATES, faire), ateliers), js = b.joursTravail.filter(w => w.complet).map(w => w.equipes.hq.indicateursCharge);
  assert.ok(js.length === 3 && js.every(e => e.debit > 0 && e.heuresDebit > 0 && e.minutesAuTravail === null), JSON.stringify(js[0]));
  const q = b.periode.indicateursCharge.equipes.hq;
  proche(q.debit, js.reduce((n, e) => n + e.termines, 0) / js.reduce((n, e) => n + e.heuresDebit, 0));
  assert.equal(q.occupation, null);
  // La mise à disposition : présente, mais sans travail ni occupation ; ses ETP comptent.
  const m = jourDe(b, DATES[0]).services.magasin.indicateursCharge;
  assert.deepEqual([m.creneaux.auTravail, m.sansObjet.auTravail, m.heuresAuTravail, m.occupation, m.picAuTravail], [null, 'mise à disposition', null, null, null]);
  assert.ok(m.etp > 0 && m.picPresents.personnes === 2);
  assert.deepEqual([b.periode.indicateursCharge.services.magasin.occupation, b.periode.indicateursCharge.services.magasin.picAuTravail], [null, null]);
});

test('par mois : chaque mois ses jours complets ; une période vide garde la même forme', () => {
  const b = periode(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  assert.deepEqual(b.mois.map(m => [m.mois, m.jours, m.indicateursCharge.services.prepa.jours]), [['2026-11', 2, 2], ['2026-12', 1, 1]]);
  proche(b.mois[0].indicateursCharge.services.prepa.total.heuresAuTravail,
    ['2026-11-29', '2026-11-30'].reduce((n, d) => n + jourDe(b, d).services.prepa.indicateursCharge.heuresAuTravail, 0));
  const vide = PE.bilan([], { etat: { ateliers: ATELIERS } }, { debut: '2026-11-02', fin: '2026-11-04' });
  assert.deepEqual(vide.periode.indicateursCharge, { services: {}, equipes: {} });
});

test('60 journées fictives de 50 vols : extraites et mises au bilan en moins de 2 s', () => {
  // Une cuisine assez nombreuse pour livrer les 50 vols : le montage travaille, la mesure n'est pas vide.
  const ateliers = ATELIERS.map(x => (x.id === 'cu' ? { ...x, personnes: 10 } : x));
  const d0 = Date.UTC(2026, 10, 1), dates = Array.from({ length: 60 }, (_, i) => new Date(d0 + i * 864e5).toISOString().slice(0, 10));
  const a = args(50, ateliers), r = P.simuler(a);
  // La simulation d'une journée n'est pas comptée (elle est la même avant l'évolution 12) : l'extraction et le bilan, si.
  const t = Date.now();
  const journees = dates.map(date => ({ date, extrait: PE.extraire(r, a, date) }));
  const b = PE.bilan(journees, { etat: { ateliers } }, { debut: dates[0], fin: dates[59] });
  const ms = Date.now() - t;
  assert.ok(ms < 2000, ms + ' ms');
  const prepa = b.periode.indicateursCharge.services.prepa;
  assert.equal(prepa.jours, 59);
  assert.ok(prepa.total.heuresAuTravail > 0 && prepa.picAuTravail.personnes > 0, JSON.stringify(prepa.total));
});
