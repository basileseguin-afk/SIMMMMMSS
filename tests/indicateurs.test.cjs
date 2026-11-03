/* Banc d'essai, évolution 12 (a) — les indicateurs de charge d'une journée
 * (moteur/indicateurs.js ; docs/BANC_ESSAI.md § 13). Par créneau de 15 min et
 * par service : présents, au travail, en pause, sans travail, en file,
 * terminés ; par équipe : occupation (K3), consommé sur disponible (K6),
 * débit (K5), file la plus longue (K4) ; par service : ETP présents (K8),
 * heures au travail, pics, occupation pondérée. Le module lit le résultat
 * d'une journée et ne change rien au calcul ; le moteur expose seulement les
 * pauses prises (`pausesPrises`) et l'instant où un lot est prêt (`pret`).
 * Journées fictives, calculées à la main. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
/** La valeur d'une série de créneaux à l'heure `hh:mm` (le créneau qui commence là). */
const a = (serie, hh) => serie.valeurs[(h(hh) - serie.debut) / 15];
/** Les créneaux d'une mesure, de `de` à `jusqua` (exclu), tous égaux à `v`. */
function partout(c, mesure, de, jusqua, v, m) {
  for (let t = h(de); t < h(jusqua); t += 15) proche(c[mesure].valeurs[(t - c[mesure].debut) / 15], v, (m || mesure) + ' à ' + P.hhmm(t));
}
const jouer = args => ({ r: P.simuler(args), args });
const service = (k, id, jour = 0) => k.services.find(s => s.service === id && s.jour === jour);
const equipe = (k, id) => k.equipes.find(e => e.id === id);

// Une équipe de 2 personnes à 06:00, le poste par défaut (8 h, 15 min de pause après 3 h de travail, 45 min après 6 h),
// un seul lot de 600 homme-minutes (5 h à deux), sans attente.
const UNE = () => jouer({ vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { prepa: { '*/YC': 600 } }, rendement: 1,
  ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } }],
  parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' } });

test('une équipe de 2, un lot de 600 homme-minutes : au travail, en pause, sans travail, créneau par créneau', () => {
  const { r, args } = UNE(), k = I.journee(r, args), c = service(k, 'prepa').creneaux;
  assert.deepEqual(r.ateliers[0].pausesPrises, [{ de: h('09:00'), a: h('09:15') }], 'la seule pause prise : 15 min après 3 h de travail');
  assert.equal(c.debut, h('06:00'));
  partout(c, 'presents', '06:00', '14:00', 2);
  partout(c, 'auTravail', '06:00', '09:00', 2); partout(c, 'enPause', '09:00', '09:15', 2);
  partout(c, 'auTravail', '09:15', '11:15', 2); partout(c, 'sansTravail', '11:15', '14:00', 2);
  partout(c, 'enPause', '06:00', '09:00', 0); partout(c, 'sansTravail', '06:00', '11:15', 0);
  assert.equal(c.presents.valeurs.length, 32, 'de 06:00 à 14:00');
  assert.equal(a(c.termines, '11:00'), 100, 'les 100 repas du lot, finis à 11:15');
  const e = equipe(k, 'mo');
  proche(e.occupation, 300 / 420, 'occupation : 300 min au travail ÷ 420 min de présence hors pauses');
  proche(e.consommeSurDisponible, 600 / (2 * 420));
  assert.deepEqual([e.minutesAuTravail, e.minutesDisponibles, e.unite], [300, 420, 'repas']);
  proche(e.debit, 100 / 5, '100 repas en 5 h au travail');
  const s = service(k, 'prepa');
  assert.deepEqual(s.picAuTravail, { personnes: 2, debut: h('06:00') });
  assert.deepEqual(s.picPresents, { personnes: 2, debut: h('06:00') });
  proche(s.etp, 2, '2 personnes × 480 ÷ 480');
  proche(s.heuresAuTravail, 10, '300 min × 2 personnes');
  proche(s.occupation, 300 / 420);
});

test('la somme des « au travail » d’une équipe = ses minutes au travail × ses personnes', () => {
  const { r, args } = UNE(), e = equipe(I.journee(r, args), 'mo');
  proche(e.creneaux.auTravail.valeurs.reduce((n, x) => n + x * 15, 0), e.minutesAuTravail * e.personnes);
  proche(e.creneaux.enPause.valeurs.reduce((n, x) => n + x * 15, 0), 15 * 2);
});

test('deux équipes d’un même service qui se chevauchent : les présents s’additionnent', () => {
  const eq = (id, debut, personnes) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut, jour: 0, personnes, lots: [], regime: { actif: true } });
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: {}, rendement: 1, ateliers: [eq('m1', '06:00', 2), eq('m2', '10:00', 3)],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' } });
  const c = service(I.journee(r, args), 'prepa').creneaux;
  partout(c, 'presents', '06:00', '10:00', 2); partout(c, 'presents', '10:00', '14:00', 5); partout(c, 'presents', '14:00', '18:00', 3);
  assert.deepEqual(service(I.journee(r, args), 'prepa').picPresents, { personnes: 5, debut: h('10:00') });
});

test('un lot prêt à 07:00 quand l’équipe est occupée jusqu’à 09:00 : en file 1 de 07:00 à 09:00', () => {
  // La cuisine livre NORD/YC à 07:00 ; le montage fait d'abord NORD/BC (3 h, sans fournisseur), puis NORD/YC.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00', { bc: 10 })], liaisons: [], rendement: 1,
    bareme: { cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
    ateliers: [{ id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true } },
      { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/BC'], ['NORD/YC']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Chaud', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }, { id: 'c2', nom: 'Froid', noeuds: ['prepa'], liens: [] }],
    parcoursCabine: { YC: 'c1', BC: 'c2' } });
  const lots = r.lots.filter(l => l.atelier === 'mo');
  assert.deepEqual(lots.map(l => [l.nom, l.pret, l.debut]), [['NORD/BC', null, h('06:00')], ['NORD/YC', h('07:00'), h('09:00')]], 'l’instant « prêt », exposé');
  const k = I.journee(r, args), c = service(k, 'prepa').creneaux;
  partout(c, 'enFile', '06:00', '07:00', 0); partout(c, 'enFile', '07:00', '09:00', 1); partout(c, 'enFile', '09:00', '14:00', 0);
  assert.deepEqual(equipe(k, 'mo').fileMax, { lots: 1, a: h('07:00') });
  assert.equal(equipe(k, 'cu').fileMax.lots, 0);
});

test('un robot et un tunnel de plonge : au travail pendant la marche seulement', () => {
  const CHEMIN = { id: 'c1', nom: 'Robot', noeuds: ['prepa'], liens: [] };
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00'), { id: 'NO2', cie: 'NORD', sens: 'RET', sta: h('10:00'), bc: 0, pc: 0, yc: 100 }],
    liaisons: [], bareme: {}, rendement: 1, materiel: { actif: true, retours: 'j0' }, parcours: [CHEMIN], parcoursCabine: { YC: 'c1' },
    ateliers: [{ id: 'rb', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00', jour: 0, personnes: 3, lots: [['NORD/YC']], regime: { actif: true }, debit: 100, personnesMin: 1 },
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '08:00', jour: 0, personnes: 4, lots: [], regime: { actif: true }, parVol: true, durees: { '*': 30 },
        tunnels: [{ nom: 'T1', debit: 300, personnes: 3, actif: true }] }] });
  const k = I.journee(r, args), rb = service(k, 'prepa').creneaux, pl = service(k, 'plonge').creneaux;
  // 100 plateaux à 100 / h : la ligne tourne de 06:00 à 07:00.
  partout(rb, 'auTravail', '06:00', '07:00', 3); partout(rb, 'sansTravail', '07:00', '14:00', 3);
  assert.equal(a(rb.termines, '06:45'), 100, 'les plateaux finis dans le créneau de 06:45');
  assert.equal(equipe(k, 'rb').unite, 'plateaux');
  // Le vol revient à 10:00, se lave de 10:30 à 11:00, par les 3 personnes du tunnel ; la quatrième ne tient aucun tunnel.
  partout(pl, 'auTravail', '08:00', '10:30', 0); partout(pl, 'auTravail', '10:30', '11:00', 3); partout(pl, 'auTravail', '11:00', '16:00', 0);
  partout(pl, 'presents', '08:00', '16:00', 4); partout(pl, 'sansTravail', '10:30', '11:00', 1);
  assert.deepEqual([a(pl.termines, '10:45'), equipe(k, 'pl').unite], [1, 'vols lavés']);
  proche(equipe(k, 'pl').occupation, 30 * 3 / (4 * 420), 'en minutes × personnes : 90 au travail, 4 × 420 disponibles');
});

test('une mise à disposition, une équipe d’appui : présentes, mais leur occupation est « sans objet »', () => {
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
    ateliers: [{ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, permanent: true },
      { id: 'ap', nom: 'Appui', service: 'prepa', type: 'appui', debut: '07:00', jour: 0, personnes: 1, lots: [], regime: { actif: true }, minutesVol: { '*': 20 } },
      { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['magasin', 'prepa'], liens: [{ de: 'magasin', vers: 'prepa' }] }], parcoursCabine: { YC: 'c1' } });
  const k = I.journee(r, args);
  for (const [id, raison] of [['mag', 'mise à disposition'], ['ap', 'équipe d’appui']]) {
    const e = equipe(k, id);
    assert.deepEqual([e.occupation, e.consommeSurDisponible, e.debit, e.sansObjet.occupation], [null, null, null, raison], id);
  }
  // Elles comptent dans les présents de leur service (la mise à disposition à son heure saisie), pas dans les trois autres mesures.
  partout(service(k, 'magasin').creneaux, 'presents', '05:00', '13:00', 2);
  assert.equal(service(k, 'magasin').creneaux.auTravail, null);
  assert.equal(service(k, 'magasin').sansObjet.auTravail, 'mise à disposition');
  partout(service(k, 'prepa').creneaux, 'presents', '07:00', '14:00', 2);
  proche(service(k, 'prepa').occupation, equipe(k, 'mo').occupation, 'l’occupation du service : la seule équipe qui en a une');
  proche(service(k, 'prepa').etp, 2);
});

test('le handling : ses vols chargés par créneau ; ses chauffeurs présents s’il a des vacations, sinon « sans objet »', () => {
  const base = { vols: [dep('NO1', 'NORD', '12:00'), dep('NO2', 'NORD', '13:00')], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }] }], parcoursCabine: { YC: 'c1' } };
  const ateliers = x => [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } },
    { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, durees: { '*': 30 }, compagnies: [], ...x }];
  const { r, args } = jouer({ ...base, ateliers: ateliers() });
  const k = I.journee(r, args), e = equipe(k, 'h'), c = service(k, 'quais').creneaux;
  assert.deepEqual([e.unite, e.termines, e.occupation, e.sansObjet.occupation, c.presents, service(k, 'quais').sansObjet.presents],
    ['vols chargés', 2, null, 'handling', null, 'handling sans vacation de chauffeurs']);
  const fins = r.vols.map(v => v.fin);
  assert.equal(c.termines.valeurs.reduce((n, x) => n + x, 0), 2);
  assert.equal(a(c.termines, P.hhmm(Math.ceil(fins[0] / 15) * 15 - 15)), 1);
  proche(e.debit, 2 / (r.lots.filter(l => l.atelier === 'h').reduce((n, l) => n + l.duree, 0) / 60), 'vols chargés ÷ heures de chargement');
  // Des créneaux de chauffeurs saisis : ils sont présents à leurs heures.
  const avec = jouer({ ...base, ateliers: ateliers({ creneaux: [{ de: '06:00', a: '14:00', n: 2 }, { de: '12:00', a: '20:00', n: 1 }] }) });
  const c2 = service(I.journee(avec.r, avec.args), 'quais').creneaux;
  partout(c2, 'presents', '06:00', '12:00', 2); partout(c2, 'presents', '12:00', '14:00', 3); partout(c2, 'presents', '14:00', '20:00', 1);
});

test('une équipe à J−1 se place sur son jour de travail ; deux jours, deux séries', () => {
  const eq = (id, jour) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut: '06:00', jour, personnes: 2, lots: [], regime: { actif: true } });
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: {}, rendement: 1, ateliers: [eq('veille', -1), eq('jour', 0)],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' } });
  const k = I.journee(r, args);
  assert.deepEqual(k.services.map(s => [s.service, s.jour, s.creneaux.debut]), [['prepa', -1, h('06:00')], ['prepa', 0, h('06:00')]]);
  partout(service(k, 'prepa', -1).creneaux, 'presents', '06:00', '14:00', 2);
});

test('les renforts : dans les totaux du jour, chez celle qui prête et chez celle qui reçoit ; pas dans les créneaux', () => {
  const vol = (id, cie, std) => dep(id, cie, std);
  const eq = (id, presence, lots) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut: '08:00', jour: 0, personnes: 1, pauses: [], lots,
    regime: { actif: true, seuils: [], presence } });
  const args = { vols: [vol('NO1', 'NORD', '15:00'), vol('SU1', 'SUD', '15:10'), vol('ES1', 'EST', '15:20'), vol('ES2', 'EST', '15:30'), vol('ES3', 'EST', '15:40'),
    vol('OU1', 'OUEST', '16:00'), vol('OU2', 'OUEST', '16:10'), vol('OU3', 'OUEST', '16:20')], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
  ateliers: [eq('ma', 180, [['NORD/YC'], ['SUD/YC']]), eq('mb', 300, [['EST/YC'], ['OUEST/YC']])],
  parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, renforts: { actif: true } };
  const r = P.simuler(args), k = I.journee(r, args), ma = equipe(k, 'ma'), mb = equipe(k, 'mb');
  // A travaille de 08:00 à 10:00, puis prête 60 min-personne à B jusqu'à 11:00.
  assert.deepEqual([ma.renfortsPretes, mb.renfortsRecus], [60, 60]);
  proche(ma.auTravail, 120 + 60, 'ses 120 min-personne, plus les 60 prêtées');
  proche(ma.occupation, 180 / 180);
  partout(ma.creneaux, 'auTravail', '10:00', '11:00', 0, 'pas dans les créneaux');
  partout(ma.creneaux, 'sansTravail', '10:00', '11:00', 1);
});

test('non-régression : la journée est la même, champ par champ, hors pausesPrises et pret ; le module ne la change pas', () => {
  const { r, args } = UNE(), avant = JSON.stringify(r);
  I.journee(r, args);
  assert.equal(JSON.stringify(r), avant, 'le module ne touche pas au résultat');
  const sans = JSON.parse(avant);
  for (const e of sans.ateliers) delete e.pausesPrises;
  for (const l of sans.lots.concat(sans.ateliers.flatMap(e => e.lots))) delete l.pret;
  assert.ok(!JSON.stringify(sans).includes('pausesPrises'));
  // Les pauses prises font le temps d'arrêt de l'équipe.
  for (const e of r.ateliers) proche(e.pausesPrises.reduce((n, p) => n + p.a - p.de, 0), e.arret, e.id);
});

test('sur les journées de référence (tous les types d’équipe) : les mesures tiennent ensemble', () => {
  const J = require('../moteur/journee.js'), REF = require('./non-regression.attendu.json');
  for (const s of REF.scenarios) {
    const args = J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options), r = J.jouer(args), k = I.journee(r, args);
    assert.equal(k.equipes.length, r.ateliers.length, s.nom);
    for (const e of k.equipes) {
      const c = e.creneaux, m = s.nom + ' · ' + e.id;
      // Chaque créneau est arrondi au millionième de personne : la somme, au millième de minute.
      if (c.auTravail) assert.ok(Math.abs(c.auTravail.valeurs.reduce((n, x) => n + x * 15, 0) + e.renfortsPretes - e.auTravail) < 1e-3, m + ' : la somme des créneaux');
      if (e.occupation !== null) assert.ok(e.occupation >= 0 && e.occupation <= 1 + 1e-9, m + ' : occupation ' + e.occupation);
      if (c.presents && c.auTravail) c.presents.valeurs.forEach((p, i) => assert.ok(p + 1e-6 >= c.auTravail.valeurs[i] + c.enPause.valeurs[i], m + ' : créneau ' + i));
      for (const x of Object.keys(e.sansObjet)) assert.equal(typeof e.sansObjet[x], 'string', m + ' : ' + x);
    }
    for (const x of k.services) assert.ok(x.etp >= 0 && (x.occupation === null || x.occupation <= 1 + 1e-9), s.nom + ' · ' + x.service);
    if (r.ateliers.length) assert.ok(k.services.some(x => x.picAuTravail && x.picAuTravail.personnes > 0), s.nom + ' : quelqu’un travaille');
  }
});

test('le handling : un camion qui charge trois vols ne compte ses heures de chargement qu’une fois', () => {
  const vols = ['NO1', 'NO2', 'NO3'].map((id, i) => dep(id, 'NORD', P.hhmm(h('12:00') + i * 5)));
  const args = { vols, liaisons: [], bareme: { prepa: { '*/YC': 30 } }, rendement: 1,
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }] }], parcoursCabine: { YC: 'c1' },
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } },
      { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, durees: { '*': 30 },
        compagnies: [], volsCamion: { '*': 3 } }] };
  const r = P.simuler(args), e = equipe(I.journee(r, args), 'h'), ls = r.lots.filter(l => l.atelier === 'h');
  assert.equal(new Set(ls.map(l => l.debut)).size, 1, 'un seul départ de camion');
  proche(e.debit, 3 / ((Math.max(...ls.map(l => l.fin)) - ls[0].debut) / 60), '3 vols ÷ la durée du trajet');
});

test('un robot sur une ligne qui s’arrête : l’arrêt compte comme une pause, et sort de sa présence hors pauses', () => {
  const args = { vols: [dep('NO1', 'NORD', '23:00', { yc: 1000 })], liaisons: [], bareme: {}, rendement: 1,
    parcours: [{ id: 'c1', nom: 'Robot', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    ateliers: [{ id: 'rb', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00', jour: 0, personnes: 3, lots: [['NORD/YC']], regime: { actif: true },
      debit: 100, personnesMin: 1, arretsLigne: [{ de: '12:15', a: '13:00' }] }] };
  const r = P.simuler(args), e = equipe(I.journee(r, args), 'rb');
  assert.ok(r.ateliers[0].pausesPrises.some(p => p.de <= h('12:15') && p.a >= h('13:00')), JSON.stringify(r.ateliers[0].pausesPrises));
  partout(e.creneaux, 'enPause', '12:15', '13:00', 3);
  assert.equal(e.minutesDisponibles, 420 - 45, 'le poste (420 min), moins les 45 min d’arrêt de la ligne');
});

test('les heures sup prolongent la présence jusqu’à la fin du travail, et s’ajoutent au disponible', () => {
  // 3 h de travail pour 2 h 20 de présence : 40 min d'heures sup.
  const args = { vols: ['NORD', 'SUD', 'EST'].map((cie, i) => dep(cie.slice(0, 2) + '1', cie, P.hhmm(h('12:00') + i * 10))), liaisons: [],
    bareme: { prepa: { '*/YC': 60 } }, rendement: 1, parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    heuresSup: { actif: true, plafond: 180 },
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, lots: [['NORD/YC'], ['SUD/YC'], ['EST/YC']],
      regime: { actif: true, seuils: [], presence: 140 } }] };
  const r = P.simuler(args), e = equipe(I.journee(r, args), 'mo');
  assert.equal(r.ateliers[0].heuresSup, 40);
  partout(e.creneaux, 'presents', '05:00', '08:00', 1);
  assert.deepEqual([e.minutesDisponibles, e.minutesAuTravail, e.occupation], [180, 180, 1]);
});

test('une équipe sans personne : son occupation est « sans objet », pas 0', () => {
  const args = { vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: {}, rendement: 1,
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 0, lots: [], regime: { actif: true } }] };
  const e = equipe(I.journee(P.simuler(args), args), 'mo');
  assert.deepEqual([e.occupation, e.sansObjet.occupation], [null, 'aucune personne']);
});

test('sur les journées de référence, les pauses prises d’une équipe à la main font son temps d’arrêt', () => {
  const J = require('../moteur/journee.js'), REF = require('./non-regression.attendu.json');
  for (const s of REF.scenarios) {
    const r = J.jouer(J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options));
    for (const e of r.ateliers.filter(x => x.type === 'manuel')) proche(e.pausesPrises.reduce((n, p) => n + p.a - p.de, 0), e.arret, s.nom + ' · ' + e.id);
  }
});
