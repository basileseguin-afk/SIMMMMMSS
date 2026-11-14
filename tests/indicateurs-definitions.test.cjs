/* Banc d'essai, correction 16 (b) — trois définitions des indicateurs de
 * charge (moteur/indicateurs.js ; docs/BANC_ESSAI.md § 13) :
 *   1. la disponibilité de toute équipe = personnes × (présence prolongée par
 *      les heures supp − les pauses vraiment prises) : une plonge qui lave sans
 *      pause ne dépasse plus 100 % ;
 *   2. une quatrième catégorie, « en appui ou à disposition » : dans chaque
 *      créneau, présents = au travail + en pause + sans travail + en appui ;
 *   3. une équipe aux lots de catégories par compagnie (« @… » : armement,
 *      dotation, roulés couverts) compte son débit en vols servis par heure ;
 *      sans vol, « sans objet ».
 * Journées fictives, calculées à la main. tests/indicateurs-definitions.attendu.json :
 * les indicateurs des journées de référence (fictives) d'avant la correction. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const REF = require('./non-regression.attendu.json');
const AVANT = require('./indicateurs-definitions.attendu.json');

const h = s => P.minutes(s);
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const ret = (id, sta) => ({ id, cie: 'NORD', sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const json = x => JSON.parse(JSON.stringify(x));
const equipe = (k, id) => k.equipes.find(e => e.id === id);
const service = (k, id, jour = 0) => k.services.find(s => s.service === id && s.jour === jour);

test('une plonge qui lave sans pause jusqu’à la fin de sa présence : sa disponibilité ne retire aucune pause ; occupation ≤ 100 %', () => {
  // 3 personnes, un tunnel de 3, le poste par défaut (8 h, deux pauses au réglage : 15 et 45 min) ; un vol revient toutes
  // les 30 min de 07:30 à 14:30, puis un à 15:15 : le tunnel lave de 08:00 à 15:30 et de 15:45 à 16:00, sans pause. Le
  // dernier vol s'arrête à la fin de sa présence (évolution 18) ; avant, elle le finissait à 16:15, en heures supp.
  const retours = Array.from({ length: 15 }, (_, k) => ret('R' + k, P.hhmm(h('07:30') + 30 * k))).concat([ret('R15', '15:15')]);
  const args = { vols: [dep('NO1', 'NORD', '18:00'), ...retours], liaisons: [], bareme: {}, rendement: 1, materiel: { actif: true, retours: 'j0' },
    heuresSup: { actif: true, plafond: 180 }, parcours: [{ id: 'c1', nom: 'R', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    ateliers: [{ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '08:00', jour: 0, personnes: 3, lots: [], regime: { actif: true },
      parVol: true, durees: { '*': 30 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 3, actif: true }] }] };
  const r = P.simuler(args), v = r.ateliers[0], e = equipe(I.journee(r, args), 'pl');
  assert.deepEqual([v.pausesPrises, v.presence, v.heuresSup, v.heuresSupPersonnes], [[], 480, 0, 0], 'aucune pause prise ; plus d’heures supp (avant : 15 min, 45 min × personnes)');
  // 450 + 15 min au travail, à 3 : 1 395 ; disponible : 3 × (480 − 0) = 1 440 (avant l'évolution 18 : 1 440 sur 1 485 ; avant
  // la correction 16 : 3 × 420 + 45 = 1 305, 110 %).
  assert.deepEqual([e.auTravail, e.minutesDisponibles * e.personnes], [1395, 1440]);
  proche(e.occupation, 1395 / 1440);
  assert.ok(e.occupation <= 1 && e.consommeSurDisponible <= 1);
});

test('une équipe à la main : sa disponibilité retire ses pauses vraiment prises, pas celles du réglage qu’elle n’a pas atteintes', () => {
  // Une équipe de 2 personnes, un lot de 600 homme-minutes : 15 min de pause prise après 3 h ; la pause de 45 min, après 6 h de travail, n'arrive pas.
  const args = { vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { prepa: { '*/YC': 600 } }, rendement: 1,
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 2, lots: [['NORD/YC']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' } };
  const r = P.simuler(args), e = equipe(I.journee(r, args), 'mo');
  assert.deepEqual(r.ateliers[0].pausesPrises, [{ de: h('09:00'), a: h('09:15') }]);
  assert.equal(e.minutesDisponibles, 480 - 15);
  proche(e.occupation, 600 / (2 * 465)); proche(e.consommeSurDisponible, 600 / (2 * 465));
  // Les créneaux le disent aussi : au travail + sans travail = la disponibilité.
  const c = e.creneaux, tot = m => c[m].valeurs.reduce((n, x) => n + x, 0) * 15;
  proche(tot('auTravail') + tot('sansTravail'), 2 * 465);
});

test('un service avec une équipe d’appui et une mise à disposition : présents = au travail + en pause + sans travail + en appui, créneau par créneau', () => {
  const args = { vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
    ateliers: [{ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 2, lots: [], regime: { actif: true }, permanent: true },
      { id: 'ap', nom: 'Appui', service: 'prepa', type: 'appui', debut: '07:00', jour: 0, personnes: 1, lots: [], regime: { actif: true }, minutesVol: { '*': 20 } },
      { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['magasin', 'prepa'], liens: [{ de: 'magasin', vers: 'prepa' }] }], parcoursCabine: { YC: 'c1' } };
  const r = P.simuler(args), k = I.journee(r, args);
  for (const id of ['prepa', 'magasin']) {
    const c = service(k, id).creneaux, v = (m, i) => (c[m] ? c[m].valeurs[i] || 0 : 0);
    assert.ok(c.enAppui, id + ' : la quatrième catégorie');
    c.presents.valeurs.forEach((p, i) => proche(p, v('auTravail', i) + v('enPause', i) + v('sansTravail', i) + v('enAppui', i), id + ', créneau ' + P.hhmm(c.debut + 15 * i)));
  }
  // L'appui, de 07:00 à 15:00 : 1 en appui ; la mise à disposition, toute en appui ; le montage, dans les trois autres.
  const prepa = service(k, 'prepa').creneaux;
  assert.equal(prepa.enAppui.valeurs[(h('10:00') - prepa.debut) / 15], 1);
  assert.equal(prepa.enAppui.valeurs[(h('06:00') - prepa.debut) / 15], 0, 'avant l’appui');
  assert.deepEqual(equipe(k, 'ap').creneaux.enAppui.valeurs, equipe(k, 'ap').creneaux.presents.valeurs);
  assert.ok(equipe(k, 'mo').creneaux.enAppui === null, 'une équipe qui travaille n’est pas en appui');
  // Un service sans appui ni mise à disposition : « sans objet », dit.
  const seul = I.journee(...(() => { const a = { ...args, ateliers: [args.ateliers[2]] }; return [P.simuler(a), a]; })());
  assert.deepEqual([service(seul, 'prepa').creneaux.enAppui, service(seul, 'prepa').sansObjet.enAppui], [null, 'aucune équipe d’appui ni mise à disposition']);
});

test('une équipe d’armement (lots « @… ») : son débit en vols servis par heure ; sans vol, « sans objet »', () => {
  // L'unité fictive de la référence : l'armement prépare NORD/@ARM + SUD/@ARM, puis EST/@ARM + OUEST/@ARM.
  const s = REF.scenarios.find(x => x.nom === 'unite-vol'), a = J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options), r = J.jouer(a);
  const e = equipe(I.journee(r, a), 'ar'), v = r.ateliers.find(x => x.id === 'ar');
  const vols = new Map(r.classes.map(c => [c.id, (c.vols || []).length]));
  const servis = v.lots.filter(l => Number.isFinite(l.fin)).reduce((n, l) => n + l.classes.reduce((t, id) => t + vols.get(id), 0), 0);
  assert.ok(servis > 0);
  assert.deepEqual([e.unite, e.termines], ['vols', servis]);
  proche(e.debit, servis / (e.minutesAuTravail / 60), 'vols ÷ heures au travail');
  assert.ok(!('debit' in e.sansObjet));
  // Les mêmes lots sans aucun vol de leurs compagnies : le débit « sans objet », avec sa raison.
  const args = { vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { armement: { '*/@ARM': 20 } }, rendement: 1,
    categories: { armement: [{ id: 'ARM', nom: 'Armement' }] },
    ateliers: [{ id: 'ar', nom: 'Armement', service: 'armement', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['SUD/@ARM']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Armement', noeuds: ['armement'], liens: [] }], parcoursCabine: { YC: 'c1' } };
  const sansVol = equipe(I.journee(P.simuler(args), args), 'ar');
  assert.deepEqual([sansVol.unite, sansVol.debit, sansVol.sansObjet.debit], ['vols', null, 'aucun vol de ses compagnies ce jour-là']);
});

test('une équipe qui reçoit des renforts : son consommé compte le disponible des renforts reçus, et ne dépasse pas 100 %', () => {
  const eq = (id, presence, lots) => ({ id, nom: id, service: 'prepa', type: 'manuel', debut: '08:00', jour: 0, personnes: 1, pauses: [], lots,
    regime: { actif: true, seuils: [], presence } });
  const args = { vols: [dep('NO1', 'NORD', '15:00'), dep('SU1', 'SUD', '15:10'), dep('ES1', 'EST', '15:20'), dep('ES2', 'EST', '15:30'), dep('ES3', 'EST', '15:40'),
    dep('OU1', 'OUEST', '16:00'), dep('OU2', 'OUEST', '16:10'), dep('OU3', 'OUEST', '16:20')], liaisons: [], bareme: { prepa: { '*/YC': 60 } }, rendement: 1,
    ateliers: [eq('ma', 180, [['NORD/YC'], ['SUD/YC']]), eq('mb', 300, [['EST/YC'], ['OUEST/YC']])],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' }, heuresSup: { actif: true, plafond: 180 }, renforts: { actif: true } };
  const k = I.journee(P.simuler(args), args), mb = equipe(k, 'mb');
  // B reçoit 60 min-personne de A : ses 360 homme-minutes ÷ (son disponible + 60) ; avant, ÷ son seul disponible (112,5 %).
  assert.equal(mb.renfortsRecus, 60);
  proche(mb.consommeSurDisponible, mb.hommeMinutes / (mb.minutesDisponibles * mb.personnes + 60));
  assert.ok(mb.consommeSurDisponible <= 1 && mb.occupation <= 1 + 1e-9);
});

test('une équipe surchargée, son lot coupé à la fin de la présence : le consommé compte la part faite, et ne dépasse pas 100 %', () => {
  // 1 personne, 120 min de présence sans pause, un lot de 177 homme-minutes : 120 faites, le reste ne se fait pas.
  const args = { vols: [dep('NO1', 'NORD', '18:00')], liaisons: [], bareme: { prepa: { '*/YC': 177 } }, rendement: 1,
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true, seuils: [], presence: 120 } }],
    parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' } };
  const r = P.simuler(args), l = r.ateliers[0].lots[0], e = equipe(I.journee(r, args), 'mo');
  assert.deepEqual([l.impossible, l.fait, l.hommeMinutes], [true, 120, 177]);
  // Avant : 177 ÷ 120 = 147,5 %. La part faite : 177 × 120 / 177 = 120.
  proche(e.hommeMinutes, 120); proche(e.consommeSurDisponible, 1);
});

test('un lot qui sert deux catégories d’une même compagnie : ses vols ne comptent qu’une fois', () => {
  const args = { vols: [dep('NO1', 'NORD', '12:00'), dep('NO2', 'NORD', '14:00')], liaisons: [], bareme: {}, rendement: 1,
    categories: { armement: [{ id: 'ARM', nom: 'Armement', minutes: { '*': 20 } }, { id: 'DOT', nom: 'Dotation', minutes: { '*': 10 } }] },
    ateliers: [{ id: 'ar', nom: 'Armement', service: 'armement', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/@ARM', 'NORD/@DOT']], regime: { actif: true } }],
    parcours: [{ id: 'c1', nom: 'Armement', noeuds: ['armement'], liens: [] }], parcoursCabine: { YC: 'c1' } };
  const r = P.simuler(args), e = equipe(I.journee(r, args), 'ar');
  assert.deepEqual(r.ateliers[0].lots.map(l => l.classes), [['NORD/@ARM', 'NORD/@DOT']]);
  assert.deepEqual([e.unite, e.termines], ['vols', 2], 'NO1 et NO2, pas quatre');
});

test('non-régression : la journée est la même ; les indicateurs des autres équipes aussi, hors de ce que la correction change', () => {
  for (const s of REF.scenarios) {
    const a = J.argumentsDeLaJournee(s.sauvegarde, s.args.vols, s.options), r = J.jouer(a), k = I.journee(r, a), avant = AVANT[s.nom];
    // Le résultat de la journée ne change pas : la correction ne touche pas au moteur (tests/non-regression.test.cjs le vérifie, champ par champ).
    for (const e of k.equipes) {
      const x = avant.equipes.find(y => y.id === e.id), { creneaux, ...apres } = json(e);
      const touche = e.unite === 'vols', coupe = r.ateliers.find(v => v.id === e.id).lots.some(l => l.impossible);
      // Ce qui change : la disponibilité (et l'occupation, le consommé qui en découlent) ; l'unité et le débit d'une équipe « @… » ;
      // les homme-minutes d'une équipe dont un lot est coupé à la fin de la présence (la part faite).
      const cles = Object.keys(x).filter(c => !['minutesDisponibles', 'occupation', 'consommeSurDisponible'].includes(c)
        && !(touche && ['unite', 'termines', 'debit', 'heuresDebit', 'sansObjet'].includes(c)) && !(coupe && c === 'hommeMinutes'));
      if (coupe) assert.ok(e.hommeMinutes <= x.hommeMinutes + 1e-9, s.nom + ' · ' + e.id + ' : la part faite, au plus la demande');
      for (const c of cles) assert.deepEqual(apres[c], x[c], s.nom + ' · ' + e.id + ' · ' + c);
      // Une équipe qui a pris toutes les pauses de son réglage (ou n'en a pas) : sa disponibilité aussi est la même.
      if (x.minutesDisponibles !== null && e.minutesDisponibles !== null && Math.abs(e.minutesDisponibles - x.minutesDisponibles) < 1e-9)
        assert.deepEqual([apres.occupation, coupe ? null : apres.consommeSurDisponible], [x.occupation, coupe ? null : x.consommeSurDisponible]);
      // Et partout : jamais au-dessus de 100 %.
      for (const m of ['occupation', 'consommeSurDisponible']) assert.ok(e[m] === null || e[m] <= 1 + 1e-9, s.nom + ' · ' + e.id + ' · ' + m + ' ' + e[m]);
    }
    // Les créneaux des services : les mêmes, avec la quatrième catégorie en plus (et les terminés d'un service « @… » en vols).
    for (const sv of k.services) {
      const x = avant.services.find(y => y.service === sv.service && y.jour === sv.jour), aEnVols = k.equipes.some(e => e.service === sv.service && e.unite === 'vols');
      for (const m of ['presents', 'auTravail', 'enPause', 'sansTravail', 'enFile'].concat(aEnVols ? [] : ['termines']))
        assert.deepEqual(json(sv.creneaux[m]), x.creneaux[m], s.nom + ' · ' + sv.service + ' · ' + m);
    }
  }
});
