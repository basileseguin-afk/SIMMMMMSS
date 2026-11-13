/* Correction 18 (a) — des attentes qui disent vrai (moteur/reponses.js,
 * synthese-vue.js), sur des journées fictives calculées à la main :
 *   — l'arrivage : les lots d'une équipe qui deviennent prêts au même instant
 *     (ceux prêts avant son arrivée forment celui de son arrivée ; à une plonge
 *     par vol, chaque vol revenu). Son attente va de son instant au début de son
 *     premier lot ; les lots suivants sont « à faire », ils n'attendent pas. La
 *     file, l'attente la plus longue et le cumul se comptent en arrivages ;
 *   — les personnes sans travail, par service et jour de travail : les heures,
 *     leur part de la présence, en trois moments (avant le premier lot, entre
 *     deux lots, après le dernier), et ce que l'équipe attendait ;
 *   — « Où ça coince », sur les conséquences : un dépassement d'au moins un
 *     quart d'heure (une règle fixe, pas un réglage), ou un lot qui fait partir
 *     une commande ou un vol en retard ; rangés par heures sup, puis par cumul ;
 *   — une équipe d'un service mesuré dont le besoin ne se mesure pas ne compte
 *     plus dans le besoin.
 * Aucun seuil de plus ; le résultat de la journée et les indicateurs ne
 * changent pas. Vols, compagnies et équipes fictifs.
 * Le poste par défaut : 8 h de présence, 15 min de pause après 3 h de travail,
 * 45 min après 6 h. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, debut, personnes, lots, x) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes, lots, regime: { actif: true }, ...x });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const NOMS = { cuisine: 'Cuisine', prepa: 'Montage', magasin: 'Magasin', plonge: 'Plonge', quais: 'Quais' };
const jouer = args => { const a = { liaisons: [], rendement: 1, noms: NOMS, ...args }; return { r: P.simuler(a), args: a }; };
const de = (bloc, service, jour = 0) => bloc.services.find(s => s.service === service && s.jour === jour);
/** Une mise à disposition réglée « comme une boutique » : ouverte de 07:00 à 18:00. */
const BOUTIQUE = { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: true },
  permanent: true, ouverture: { de: '07:00', a: '18:00' } };
/** Le temps sans travail des indicateurs, pour une ligne : la somme de ses créneaux « sans travail », en minutes × personnes. */
const sansTravailDesIndicateurs = (k, service, jour = 0) => {
  const c = k.services.find(s => s.service === service && s.jour === jour).creneaux.sansTravail;
  return Math.round(c.valeurs.reduce((n, x) => n + x, 0) * I.PAS * 1e6) / 1e6;
};

/* ---- l'arrivage --------------------------------------------------------------------------------------- */

// Trois lots sans fournisseur, prêts dès l'arrivée de l'équipe (06:00), faits l'un après l'autre : un seul arrivage, à 06:00,
// commencé à 06:00. Le dernier lot commence deux heures (ou cinq) plus tard : c'est l'ordre de travail, pas une attente.
const ENSEMBLE = (minutes, x = {}) => jouer({ vols: [dep('NO1', 'NORD', '20:00', { bc: 10 }), dep('SU1', 'SUD', '21:00')], bareme: { prepa: { '*/BC': minutes, '*/YC': minutes } },
  ateliers: [...(x.boutique ? [BOUTIQUE] : []), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC'], ['SUD/YC']])],
  parcours: [chemin('c1', x.boutique ? ['magasin', 'prepa'] : ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c1' } });

test('une équipe dont tous les lots sont livrés ensemble, à l’ouverture : aucune attente, quelle que soit la durée du poste', () => {
  for (const minutes of [60, 150]) {
    const { r, args } = ENSEMBLE(minutes), mo = de(R.reponses(r, args).coince, 'prepa');
    // Le dernier lot commence bien après 06:00 : au lot, il « attendait » (les indicateurs, K4, le comptent toujours ainsi).
    assert.ok(r.ateliers.find(v => v.id === 'mo').lots[2].debut >= h('08:00'), minutes + ' min');
    assert.deepEqual([mo.arrivages, mo.file, mo.attenteMax, mo.cumul], [1, null, null, 0], minutes + ' min par lot : un arrivage, aucune attente');
  }
  // Même au seuil d'attente le plus bas, rien n'attend.
  const { r, args } = ENSEMBLE(150), rep = R.reponses(r, args, { seuils: { attenteLot: 0 } });
  assert.equal(SV.tons(SV.lignes(rep, ['prepa'])[0], rep.seuils).attente, null);
});

test('livrés ensemble une heure après l’ouverture du poste (une mise à disposition ouvre à 07:00) : un arrivage à 07:00, sans attente', () => {
  const { r, args } = ENSEMBLE(60, { boutique: true }), rep = R.reponses(r, args), mo = de(rep.coince, 'prepa');
  // Les trois lots sont prêts à 07:00, à l'ouverture ; l'équipe, là depuis 06:00, commence le premier à 07:00.
  assert.deepEqual(r.ateliers.find(v => v.id === 'mo').lots.map(l => [l.pret, l.debut]), [[h('07:00'), h('07:00')], [h('07:00'), h('08:00')], [h('07:00'), h('09:00')]]);
  assert.deepEqual([mo.arrivages, mo.file, mo.attenteMax, mo.cumul], [1, null, null, 0]);
  // Ce sont les personnes qui sont sans travail, de 06:00 à 07:00 : la ligne nomme la mise à disposition, et son heure.
  const st = de(rep.sansTravail, 'prepa');
  assert.equal(st.avant, 60);
  assert.deepEqual(st.attendait, [{ equipe: 'mo', quoi: 'ouverture', service: 'magasin', nom: 'Magasin', a: h('07:00'), minutes: 60 }]);
  assert.equal(SV.motsDeLAttendu(st.attendait[0]), 'attend l’ouverture de Magasin, à 07:00');
});

// La cuisine livre au fil de la matinée : AAA à 07:00, BBB à 08:15, CCC à 12:00. Le montage fait AAA de 07:00 à 11:15 (4 h de
// travail, 15 min de pause à 10:00), BBB de 11:15 à 11:45, CCC de 12:00 à 12:30.
const AU_FIL = () => jouer({ vols: [dep('A1', 'AAA', '20:00'), dep('B1', 'BBB', '20:30'), dep('C1', 'CCC', '21:00')],
  bareme: { cuisine: { 'AAA/YC': 60, 'BBB/YC': 75, 'CCC/YC': 210 }, prepa: { 'AAA/YC': 240, 'BBB/YC': 30, 'CCC/YC': 30 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 1, [['AAA/YC'], ['BBB/YC'], ['CCC/YC']]), eq('mo', 'prepa', '06:00', 1, [['AAA/YC'], ['BBB/YC'], ['CCC/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa'])], parcoursCabine: { YC: 'c1' } });

test('trois arrivages dont le deuxième attend 3 h : la file, l’attente la plus longue et le cumul, en arrivages', () => {
  const { r, args } = AU_FIL(), rep = R.reponses(r, args), mo = de(rep.coince, 'prepa'), cu = de(rep.coince, 'cuisine');
  assert.deepEqual(r.ateliers.find(v => v.id === 'mo').lots.map(l => [l.pret, l.debut, l.fin]),
    [[h('07:00'), h('07:00'), h('11:15')], [h('08:15'), h('11:15'), h('11:45')], [h('12:00'), h('12:00'), h('12:30')]]);
  // AAA arrive à 07:00 et commence à 07:00 ; BBB arrive à 08:15 et commence à 11:15 (3 h) ; CCC arrive à 12:00 et commence à 12:00.
  assert.equal(mo.arrivages, 3);
  assert.deepEqual(mo.file, { arrivages: 1, a: h('08:15') });
  assert.deepEqual(mo.attenteMax, { minutes: 180, lot: 'BBB/YC', lots: 1, equipe: 'mo', de: h('08:15'), a: h('11:15') });
  assert.equal(mo.cumul, 180, '1 arrivage × 180 min');
  // La cuisine reçoit sa journée en une fois, à son arrivée : un arrivage, sans attente.
  assert.deepEqual([cu.arrivages, cu.file, cu.attenteMax, cu.cumul], [1, null, null, 0]);
  // Le seuil d'attente, sa clé et son défaut inchangés, s'applique à l'attente d'un arrivage : 3 h passent un seuil de 2 h, pas le défaut de 6 h.
  const tonA = seuils => { const x = R.reponses(r, args, { seuils }); return SV.tons(SV.lignes(x, ['cuisine', 'prepa'])[1], x.seuils).attente; };
  assert.deepEqual([tonA(undefined), tonA({ attenteLot: 120 }), tonA({ attenteLot: 180 })], [null, 'attente', null]);
});

test('une plonge par vol : chaque vol revenu est un arrivage ; celui qui trouve le tunnel pris attend', () => {
  // Trois retours : R1 arrive au lavage à 10:30 (lavé 10:30–11:00), R2 à 10:40 (lavé 11:00–11:30 : 20 min d'attente), R3 à 13:30.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '18:00'), { id: 'R1', cie: 'NORD', sens: 'RET', sta: h('10:00'), bc: 0, pc: 0, yc: 100 },
    { id: 'R2', cie: 'NORD', sens: 'RET', sta: h('10:10'), bc: 0, pc: 0, yc: 100 }, { id: 'R3', cie: 'NORD', sens: 'RET', sta: h('13:00'), bc: 0, pc: 0, yc: 100 }],
    bareme: { prepa: { '*/YC': 60 } }, materiel: { actif: true, retours: 'j0' },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '08:00', jour: 0, personnes: 3, lots: [],
      regime: { actif: true }, parVol: true, durees: { '*': 30 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 3, actif: true }] }],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const rep = R.reponses(r, args), pl = de(rep.coince, 'plonge');
  assert.equal(pl.arrivages, 3);
  assert.deepEqual(pl.file, { arrivages: 1, a: h('10:40') });
  assert.deepEqual([pl.attenteMax.minutes, pl.attenteMax.de, pl.attenteMax.a, pl.cumul], [20, h('10:40'), h('11:00'), 20]);
  // Le « Bouchon » de la plonge suit cette attente : 20 min passent un seuil de 15 min, pas le défaut.
  assert.equal(rep.plonge.attenteMax, 20);
  const RV = require('../resultats-vue.js');
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 999 }, rep.seuils, rep.plonge), false, 'l’attente d’un arrivage, pas celle d’une unité');
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 0 }, { ...rep.seuils, attenteLot: 15 }, rep.plonge), true);
  assert.equal(RV.bouchon({ resteSale: 2, attenteMax: 0 }, rep.seuils, rep.plonge), true, 'du sale reste le soir');
  // Sans arrivage lu à la plonge (un résultat sans réponses, une plonge sans file) : l'attente du moteur, au même seuil.
  for (const plonge of [undefined, null, { attenteMax: null }]) {
    assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 400 }, rep.seuils, plonge), true, 'au-delà du seuil de 6 h');
    assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 300 }, rep.seuils, plonge), false);
  }
});

/* ---- les personnes sans travail ----------------------------------------------------------------------- */

test('les trois moments du temps sans travail ; leur somme est le temps sans travail des indicateurs', () => {
  // Le montage du fil de la matinée : sans travail de 06:00 à 07:00 (avant son premier lot), de 11:45 à 12:00 (entre deux
  // lots), de 12:30 à 14:00 (après le dernier) : 60 + 15 + 90 = 165 min ; sa présence : 480 min.
  const { r, args } = AU_FIL(), k = I.journee(r, args), rep = R.reponses(r, args, { k }), mo = de(rep.sansTravail, 'prepa'), cu = de(rep.sansTravail, 'cuisine');
  assert.deepEqual([mo.avant, mo.entre, mo.apres, mo.minutes, mo.presence], [60, 15, 90, 165, 480]);
  assert.equal(mo.part, 165 / 480);
  assert.equal(mo.minutes, sansTravailDesIndicateurs(k, 'prepa'));
  // Il attendait son amont, la cuisine, qui livre à 07:00.
  assert.deepEqual(mo.attendait, [{ equipe: 'mo', quoi: 'amont', service: 'cuisine', nom: 'Cuisine', a: h('07:00'), minutes: 60 }]);
  assert.equal(SV.motsDeLAttendu(mo.attendait[0]), 'attend Cuisine, jusqu’à 07:00');
  // La cuisine travaille de 06:00 à 12:00 (15 min de pause à 09:00), puis reste jusqu'à 14:00 : 2 h sans travail, après son dernier lot.
  assert.deepEqual([cu.avant, cu.entre, cu.apres, cu.minutes], [0, 0, 120, 120]);
  assert.deepEqual(cu.attendait, []);
  assert.equal(cu.minutes, sansTravailDesIndicateurs(k, 'cuisine'));
  // Deux personnes : des minutes × personnes.
  const deux = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 600 } }, ateliers: [eq('mo', 'prepa', '06:00', 2, [['NORD/YC']])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  // 600 homme-minutes à deux : 5 h de travail, de 06:00 à 11:15 (15 min de pause à 09:00) ; puis 2 h 45 sans travail, à deux.
  const kd = I.journee(deux.r, deux.args), d = de(R.reponses(deux.r, deux.args, { k: kd }).sansTravail, 'prepa');
  assert.deepEqual([d.avant, d.entre, d.apres, d.minutes, d.presence], [0, 0, 330, 330, 960]);
  assert.equal(d.minutes, sansTravailDesIndicateurs(kd, 'prepa'));
});

test('les trois moments : une équipe sans lot, une équipe de la veille, un lot jamais fini', () => {
  // Une équipe de deux personnes sans lot : tout son temps (2 × 8 h) est « avant », et elle n'attendait rien de nommé.
  const vide = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 240 } }, ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('vide', 'cuisine', '06:00', 2, [])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const kv = I.journee(vide.r, vide.args), cu = de(R.reponses(vide.r, vide.args, { k: kv }).sansTravail, 'cuisine');
  assert.deepEqual([cu.avant, cu.entre, cu.apres, cu.minutes, cu.presence, cu.part, cu.attendait], [960, 0, 0, 960, 960, 1, []]);
  assert.equal(cu.minutes, sansTravailDesIndicateurs(kv, 'cuisine'));
  // La veille : 4 h de travail de 06:00 à 10:15 (15 min de pause à 09:00), puis 3 h 45 sans travail, après son dernier lot —
  // les créneaux se lisent sur l'horloge de son jour de travail.
  const veille = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 240 } }, ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']], { jour: -1 })],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const kj = I.journee(veille.r, veille.args), mv = de(R.reponses(veille.r, veille.args, { k: kj }).sansTravail, 'prepa', -1);
  assert.deepEqual([mv.jour, mv.avant, mv.entre, mv.apres, mv.minutes, mv.presence], [-1, 0, 0, 225, 225, 480]);
  assert.equal(mv.minutes, sansTravailDesIndicateurs(kj, 'prepa', -1));
  // Un lot jamais fini (600 min pour une personne, commencées à 07:00, coupées par la fin du poste) : une heure « avant »,
  // rien « après ».
  const coupe = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 600 } }, ateliers: [BOUTIQUE, eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
    parcours: [chemin('c1', ['magasin', 'prepa'])], parcoursCabine: { YC: 'c1' } });
  assert.equal(coupe.r.ateliers.find(v => v.id === 'mo').lots[0].fin, null);
  const kc = I.journee(coupe.r, coupe.args), mc = de(R.reponses(coupe.r, coupe.args, { k: kc }).sansTravail, 'prepa');
  assert.deepEqual([mc.avant, mc.entre, mc.apres, mc.minutes], [60, 0, 0, 60]);
  assert.equal(mc.minutes, sansTravailDesIndicateurs(kc, 'prepa'));
});

test('sur toutes les lignes de l’unité fictive : la somme des trois moments égale le temps sans travail des indicateurs', () => {
  const F = require('./plan-rejoue-fictif.cjs'), p = F.heureDuPicAttendue(F.sauvegardeFictive(), F.volsCsv()), rep = R.reponses(p.resultat, p.args, { k: p.k });
  let lignes = 0;
  for (const s of p.k.services) {
    const st = de(rep.sansTravail, s.service, s.jour);
    if (!s.creneaux.sansTravail) { assert.equal(st.minutes, null, s.service + ' : sans objet'); continue; }
    lignes++;
    assert.ok(Math.abs(st.avant + st.entre + st.apres - st.minutes) < 1e-6, s.service + ' : les trois moments');
    assert.ok(Math.abs(st.minutes - sansTravailDesIndicateurs(p.k, s.service, s.jour)) < 1e-6, s.service + ' : le total des indicateurs');
    assert.ok(st.avant >= 0 && st.entre >= 0 && st.apres >= 0 && st.part >= 0 && st.part <= 1, s.service);
  }
  assert.ok(lignes >= 5);
});

/* ---- « Où ça coince » : sur les conséquences ---------------------------------------------------------- */

// Une personne, `minutes` de travail, les heures sup permises : 06:00–09:00, pause, 09:15–12:15, pause de 45 min, puis de
// 13:00 à la fin ; son horaire finit à 14:00. 430 min → 14:10 ; 460 min → 14:40.
const DEPASSE = (minutes, x = {}) => jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': minutes } }, heuresSup: { actif: true, plafond: 120 },
  ateliers: [...(x.boutique ? [BOUTIQUE] : []), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
  parcours: [chemin('c1', x.boutique ? ['magasin', 'prepa'] : ['prepa'])], parcoursCabine: { YC: 'c1' } });

test('un dépassement de 10 min ne fait pas un goulot ; un dépassement de 40 min en fait un', () => {
  assert.equal(R.DEPASSEMENT_MIN, 15, 'le quart d’heure : une règle fixe, pas un réglage');
  const dix = DEPASSE(430), r10 = R.reponses(dix.r, dix.args);
  assert.deepEqual([de(r10.fins, 'prepa').fin, de(r10.fins, 'prepa').depasse], [h('14:10'), 10], 'le dépassement s’affiche');
  assert.deepEqual([r10.coince.goulot, r10.coince.goulots], [null, []], 'mais ne compte pas');
  assert.equal(SV.phrases(r10)[1], 'Rien ne coince ; rien ne part en retard.');
  assert.match(SV.carteCoince(r10).corps, /Rien ne coince\./);
  // La fin ne prend la couleur de statut qu'à partir du quart d'heure.
  assert.equal(SV.tons(SV.lignes(r10, ['prepa'])[0], r10.seuils).fin, null);
  const quarante = DEPASSE(460), r40 = R.reponses(quarante.r, quarante.args), g = r40.coince.goulot;
  assert.deepEqual([g.service, g.jour, g.depasse, g.heuresSup, g.enRetard, g.cause], ['prepa', 0, 40, 40, 0, { code: 'charge' }]);
  assert.equal(r40.coince.goulots.length, 1);
  assert.equal(SV.tons(SV.lignes(r40, ['prepa'])[0], r40.seuils).fin, 'attente');
  assert.equal(SV.phrases(r40)[1], 'Montage coince : il finit 40 min après son horaire ; rien ne part en retard.');
  assert.match(SV.carteCoince(r40).corps, /Montage[\s\S]*finit 40 min après son horaire[\s\S]*la charge du jour ne tient pas dans l’horaire/);
  // Aucun seuil réglable n'y joue : au seuil d'attente le plus haut comme le plus bas, le même goulot.
  for (const attenteLot of [0, 1440]) assert.equal(R.reponses(quarante.r, quarante.args, { seuils: { attenteLot } }).coince.goulot.service, 'prepa');
  // À un quart d'heure juste (445 min → 14:25… non : 14:15 = 435 min), le dépassement compte.
  const quart = DEPASSE(435), rq = R.reponses(quart.r, quart.args);
  assert.deepEqual([de(rq.fins, 'prepa').depasse, rq.coince.goulot && rq.coince.goulot.service], [15, 'prepa']);
});

test('une équipe qui arrive une heure avant l’ouverture d’une mise à disposition : la ligne la nomme avec son heure, la cause du goulot aussi', () => {
  // 400 min de travail, commencées à 07:00 (l'ouverture) au lieu de 06:00 : 07:00–10:00, pause, 10:15–13:15, pause de 45 min,
  // 14:00–14:40. Commencées à 06:00, elles finissaient à 13:40, dans l'horaire : l'heure perdue explique le dépassement.
  const { r, args } = DEPASSE(400, { boutique: true }), rep = R.reponses(r, args), g = rep.coince.goulot, st = de(rep.sansTravail, 'prepa');
  assert.deepEqual([de(rep.fins, 'prepa').fin, g.service, g.depasse, g.heuresSup], [h('14:40'), 'prepa', 40, 40]);
  assert.deepEqual(g.cause, { code: 'ouverture', service: 'magasin', nom: 'Magasin', a: h('07:00') });
  assert.deepEqual(st.attendait, [{ equipe: 'mo', quoi: 'ouverture', service: 'magasin', nom: 'Magasin', a: h('07:00'), minutes: 60 }]);
  const carte = SV.carteCoince(rep).corps;
  assert.match(carte, /Montage[\s\S]*finit 40 min après son horaire[\s\S]*attend l’ouverture de Magasin, à 07:00/);
  // Dans le tableau : la colonne « Personnes sans travail » le dit au survol.
  const rang = SV.tableau(rep, ['magasin', 'prepa']).split('<tr data-service="prepa"')[1].split('</tr>')[0];
  assert.match(rang, /class="num sy-sans"[^>]*title="[^"]*avant le premier lot : 1 h 00[^"]*attend l’ouverture de Magasin, à 07:00/);
  // Sans la mise à disposition, la même charge tient dans l'horaire : rien ne coince.
  const sans = DEPASSE(400), rs = R.reponses(sans.r, sans.args);
  assert.deepEqual([de(rs.fins, 'prepa').fin, rs.coince.goulot], [h('13:40'), null]);
});

test('deux services qui dépassent sont rangés par heures sup (personnes × heures), pas par durée du dépassement', () => {
  // La cuisine, à deux : 880 homme-minutes → 14:20, 20 min × 2 personnes = 40 min d'heures sup. Le montage, seul : 450 min →
  // 14:30, 30 min d'heures sup. La cuisine passe devant, bien qu'elle dépasse moins longtemps.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00', { bc: 10 })], bareme: { cuisine: { '*/BC': 880 }, prepa: { '*/YC': 450 } }, heuresSup: { actif: true, plafond: 120 },
    ateliers: [eq('cu', 'cuisine', '06:00', 2, [['NORD/BC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
    parcours: [chemin('c1', ['cuisine']), chemin('c2', ['prepa'])], parcoursCabine: { BC: 'c1', YC: 'c2' } });
  const rep = R.reponses(r, args);
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.heuresSup]), [['cuisine', 20, 40], ['prepa', 30, 30]]);
  assert.equal(rep.coince.goulot.service, 'cuisine');
  const carte = SV.carteCoince(rep).corps;
  assert.ok(carte.indexOf('Cuisine') < carte.indexOf('Montage'), 'la carte les montre dans cet ordre');
  assert.match(SV.phrases(rep)[1], /^Cuisine coince : il finit 20 min après son horaire \(et 1 autre service\) ; /);
});

test('un service sans dépassement dont un lot fait partir un vol en retard coince ; à heures sup égales, le plus grand cumul d’attente d’abord', () => {
  // Le montage fait d'abord NORD/BC (06:00–09:00, due à 08:15 : le vol part à 09:00), puis NORD/YC, livrée par la cuisine à
  // 07:00 : commencée à 09:00, finie à 09:45 (15 min de pause à 09:00), due à 08:15. Tout finit dans l'horaire. NORD/YC, en
  // retard, passe par la cuisine et par le montage ; NORD/BC, en retard aussi, par le montage seul.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '09:00', { bc: 10 })], bareme: { cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']])],
    parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c2' } });
  const rep = R.reponses(r, args);
  assert.ok(rep.exceptions.some(x => x.type === 'commande-en-retard' && x.id === 'NORD/YC'));
  assert.deepEqual(rep.fins.services.map(s => s.depasse), [0, 0]);
  // L'arrivage de 07:00 (NORD/YC) attend jusqu'à 09:00 : 120 min. Le montage, au plus grand cumul, passe devant la cuisine.
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.enRetard, g.cumul]), [['prepa', 0, 2, 120], ['cuisine', 0, 1, 0]]);
  // Le montage finit ses deux lots après leur limite ; la cuisine a fini le sien à 07:00, avant la limite de 08:15 : la
  // commande passe par elle, mais prend son retard en aval — la carte ne dit pas qu'elle finit après la limite.
  assert.deepEqual(rep.coince.goulots.map(g => [g.apresLimite, g.cause]), [[2, { code: 'limite' }], [0, { code: 'aval' }]]);
  assert.match(SV.phrases(rep)[1], /^Montage coince : 2 commandes ou vols partent en retard par ses lots \(et 1 autre service\) ; /);
  const carte = SV.carteCoince(rep).corps;
  assert.match(carte, /Montage[\s\S]*finit dans son horaire, mais après la limite d’une commande ou d’un vol[\s\S]*Cuisine[\s\S]*ses lots finissent avant la limite : la commande ou le vol prend son retard en aval/);
});

test('le rang : un dépassement sous le quart d’heure n’y compte pas ; à égalité, le service dont un lot finit après la limite d’abord, puis l’ordre des lignes', () => {
  // Le magasin, à deux : 860 homme-minutes → 14:10, 10 min de dépassement (20 min × personnes) ; SUD/BC, due à 11:15, part en
  // retard par son lot. Le montage ne dépasse pas ; ses deux commandes partent en retard, un arrivage y attend 2 h. La
  // cuisine a fini NORD/YC à 07:00, avant la limite. Les lignes : cuisine, magasin, montage.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '09:00', { bc: 10 }), dep('SU1', 'SUD', '12:00', { bc: 10, yc: 0 })], heuresSup: { actif: true, plafond: 120 },
    bareme: { magasin: { 'SUD/BC': 860 }, cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mg', 'magasin', '06:00', 2, [['SUD/BC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']])],
    parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa']), chemin('c3', ['magasin'])], parcoursCabine: { YC: 'c1', BC: 'c2' }, parcoursClasse: { 'SUD/BC': 'c3' } });
  const rep = R.reponses(r, args);
  assert.deepEqual(rep.coince.services.map(x => x.service), ['cuisine', 'magasin', 'prepa']);
  assert.deepEqual([de(rep.fins, 'magasin').depasse, de(rep.fins, 'magasin').heuresSup.total], [10, 20], 'le dépassement et ses heures sup s’affichent');
  // Le dépassement de 10 min ne compte pas : les heures sup du rang sont nulles, le montage (120 min de cumul) passe devant le
  // magasin ; le magasin, dont le lot finit après la limite, passe devant la cuisine, pourtant première des lignes.
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.heuresSup, g.cumul, g.apresLimite, g.cause.code]),
    [['prepa', 0, 0, 120, 2, 'limite'], ['magasin', 10, 0, 0, 1, 'limite'], ['cuisine', 0, 0, 0, 0, 'aval']]);
  assert.doesNotMatch(SV.carteCoince(rep).corps, /heures sup/, 'aucune heure sup n’est comptée au goulot');
  // À égalité complète (ni heures sup, ni attente, des lots finis avant la limite) : l'ordre des lignes.
  const e = jouer({ vols: [dep('NO1', 'NORD', '09:00')], bareme: { cuisine: { '*/YC': 30 }, magasin: { '*/YC': 30 }, prepa: { '*/YC': 180 } },
    ateliers: [eq('mg', 'magasin', '06:00', 1, [['NORD/YC']]), eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
    parcours: [chemin('c1', ['cuisine', 'magasin', 'prepa'])], parcoursCabine: { YC: 'c1' } });
  const re = R.reponses(e.r, e.args);
  // La cuisine finit à 06:30, le magasin à 07:00, le montage à 10:00 pour une limite à 08:15.
  assert.deepEqual(re.coince.goulots.map(g => [g.service, g.apresLimite, g.cause.code]), [['prepa', 1, 'limite'], ['cuisine', 0, 'aval'], ['magasin', 0, 'aval']]);
  assert.deepEqual(R.reponses(e.r, e.args).coince.goulots, re.coince.goulots, 'le même rang d’un calcul à l’autre');
});

test('la cause ne nomme une attente que si elle explique : le dépassement, ou le retard', () => {
  // Il dépasse plus que l'heure perdue : 470 min commencées à 07:00 (l'ouverture) finissent à 15:50, 110 min après l'horaire ;
  // commencées à 06:00, elles finissaient encore à 14:50. L'heure perdue se lit sur la ligne, mais la cause est la charge.
  const lourd = DEPASSE(470, { boutique: true }), rl = R.reponses(lourd.r, lourd.args);
  assert.deepEqual([de(rl.fins, 'prepa').fin, rl.coince.goulot.depasse, rl.coince.goulot.cause], [h('15:50'), 110, { code: 'charge' }]);
  assert.equal(de(rl.sansTravail, 'prepa').attendait[0].quoi, 'ouverture');
  assert.match(SV.carteCoince(rl).corps, /la charge du jour ne tient pas dans l’horaire/);
  // Sans dépassement, une commande en retard : 120 min de travail commencées à 07:00 finissent à 09:00.
  const tard = std => jouer({ vols: [dep('NO1', 'NORD', std)], bareme: { prepa: { '*/YC': 120 } }, ateliers: [BOUTIQUE, eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
    parcours: [chemin('c1', ['magasin', 'prepa'])], parcoursCabine: { YC: 'c1' } });
  // Le vol de 09:15 : due à 08:30, prête 30 min après — l'heure perdue à attendre l'ouverture couvre le retard : la cause la nomme.
  const a = tard('09:15'), ra = R.reponses(a.r, a.args);
  assert.deepEqual([ra.coince.goulot.depasse, ra.coince.goulot.enRetard, ra.coince.goulot.cause], [0, 1, { code: 'ouverture', service: 'magasin', nom: 'Magasin', a: h('07:00') }]);
  // Le vol de 08:15 : due à 07:30, prête 90 min après — plus que l'heure perdue : même commencée à 06:00, elle partait en retard.
  const b = tard('08:15'), rb = R.reponses(b.r, b.args);
  assert.deepEqual([rb.coince.goulot.depasse, rb.coince.goulot.enRetard, rb.coince.goulot.cause], [0, 1, { code: 'limite' }]);
  // Une commande pas finie : aucun temps perdu ne l'explique.
  const c = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 600 } }, ateliers: [BOUTIQUE, eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
    parcours: [chemin('c1', ['magasin', 'prepa'])], parcoursCabine: { YC: 'c1' } }), rc = R.reponses(c.r, c.args);
  assert.equal(c.r.parClasse['NORD/YC'].fin, null);
  assert.deepEqual([rc.coince.goulot.service, rc.coince.goulot.apresLimite, rc.coince.goulot.cause], ['prepa', 1, { code: 'limite' }]);
});

test('la cause « matériel » : une équipe qui attend son matériel propre avant son premier lot', () => {
  // La dotation, à 05:00, n'a pas de matériel propre : le retour de 06:00 est lavé de 06:30 à 06:40. Son lot (60 min) va de
  // 06:40 à 07:40 ; la commande, due à 07:15 (le vol part à 08:00), part 25 min en retard : les 100 min perdues l'expliquent.
  const { r, args } = jouer({ vols: [{ id: 'R1', cie: 'NORD', sens: 'RET', sta: h('06:00'), bc: 0, pc: 0, yc: 100 }, dep('D1', 'NORD', '08:00')], noms: { ...NOMS, dotation: 'Dotation' },
    materiel: { actif: true, unites: { YC: { parVol: 100 } }, stockInitial: 0, delaiRetour: 30 }, bareme: { dotation: { '*/YC': 60 } },
    ateliers: [{ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 3, debit: 600, jour: 0, lots: [] },
      eq('do', 'dotation', '05:00', 1, [['NORD/YC']], { materiel: 'consomme' })] });
  const lot = r.ateliers.find(v => v.id === 'do').lots[0];
  assert.deepEqual([lot.debut, lot.fin, Math.round(lot.attenteMateriel)], [h('06:40'), h('07:40'), 100]);
  const rep = R.reponses(r, args), g = rep.coince.goulot, st = de(rep.sansTravail, 'dotation');
  assert.deepEqual([g.service, g.depasse, g.enRetard, g.cumul, g.cause], ['dotation', 0, 1, 100, { code: 'materiel' }]);
  assert.deepEqual([st.avant, st.entre, st.apres, st.minutes], [100, 0, 320, 420]);
  assert.deepEqual(st.attendait, [{ equipe: 'do', quoi: 'materiel', service: null, nom: null, a: h('06:40'), minutes: 100 }]);
  assert.equal(SV.motsDeLAttendu(st.attendait[0]), 'attend son matériel');
  assert.match(SV.carteCoince(rep).corps, /Dotation[\s\S]*Cause : ses arrivages attendent leur matériel\./);
});

/* ---- le besoin non mesuré ----------------------------------------------------------------------------- */

test('une équipe d’un service mesuré dont le besoin ne se mesure pas ne compte pas dans le besoin', () => {
  // Le montage : une équipe d'1 personne pour un poste (420 homme-minutes), et une équipe de 2 personnes sans lot. La
  // cuisine : une équipe de 3 personnes sans lot.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('vide', 'prepa', '06:00', 2, []), eq('cu', 'cuisine', '06:00', 3, [])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const rep = R.reponses(r, args), mo = de(rep.personnes, 'prepa'), cu = de(rep.personnes, 'cuisine');
  // Le montage : besoin 1 (son équipe mesurée) ; 3 présentes, dont 2 non mesurées ; écart (3 − 2) − 1 = 0.
  assert.deepEqual([mo.besoin, mo.presents, mo.fixes, mo.nonMesures, mo.ecart, mo.fixe, mo.nonMesure], [1, 3, 2, 2, 0, false, false]);
  assert.deepEqual(mo.equipes.map(e => [e.id, e.mesure, e.fixe, e.nonMesure]), [['mo', true, false, false], ['vide', false, false, true]]);
  // La cuisine : toutes ses équipes sont dans ce cas — « non mesuré », sans écart.
  assert.deepEqual([cu.besoin, cu.presents, cu.fixes, cu.nonMesures, cu.ecart, cu.fixe, cu.nonMesure, cu.signale], [null, 3, 3, 3, null, false, true, false]);
  // L'unité : il faut 1 personne ; 6 sont présentes, dont 5 en postes non mesurés.
  assert.deepEqual(rep.personnes.total, { besoin: 1, presents: 6, fixes: 5, nonMesures: 5, ecart: 0 });
  assert.equal(SV.phrases(rep)[0], 'Il faut 1 personne, 6 sont présentes, dont 5 en postes non mesurés.');
  const html = SV.tableau(rep, ['cuisine', 'prepa']), rang = id => html.split('<tr data-service="' + id + '"')[1].split('</tr>')[0];
  assert.match(rang('cuisine'), /class="num sy-fixe"[^>]*>non mesuré</);
  assert.match(rang('cuisine'), /class="num sy-ecart sy-vide">—</);
  assert.match(rang('prepa'), /<td class="num">1<small>\+ 2 non mesurés<\/small><\/td>/);
  // Avec un poste fixe à côté : « dont n en postes fixes ou non mesurés ».
  const b = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('vide', 'prepa', '06:00', 2, []),
      { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true }, permanent: true }],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const rb = R.reponses(b.r, b.args);
  assert.deepEqual(rb.personnes.total, { besoin: 1, presents: 5, fixes: 4, nonMesures: 2, ecart: 0 });
  assert.equal(SV.phrases(rb)[0], 'Il faut 1 personne, 5 sont présentes, dont 4 en postes fixes ou non mesurés.');
});

/* ---- la Synthèse : les colonnes, les mots ------------------------------------------------------------- */

test('la Synthèse : « Personnes sans travail » et « Attente d’un arrivage » remplacent « File la plus longue » ; les mots', () => {
  const { r, args } = AU_FIL(), rep = R.reponses(r, args, { seuils: { attenteLot: 120 } }), html = SV.tableau(rep, ['cuisine', 'prepa']);
  assert.match(html, /<th scope="col"[^>]*>Personnes sans travail<\/th><th scope="col"[^>]*>Attente d’un arrivage<\/th>/);
  assert.doesNotMatch(html, /File la plus longue/);
  const rang = id => html.split('<tr data-service="' + id + '"')[1].split('</tr>')[0];
  // Le montage : 165 min sans travail sur 480 (34 %), avec sa barre, sans couleur d'alerte ; 3 arrivages, l'attente la plus longue et son heure.
  assert.match(rang('prepa'), /class="num sy-sans"[^>]*>(?!<svg)[\s\S]*2 h 45[\s\S]*34 %[\s\S]*sy-sans-barre/);
  assert.doesNotMatch(rang('prepa').split('class="num sy-sans"')[1].split('</td>')[0], /data-ton/);
  assert.match(rang('prepa'), /class="sy-arrivage" data-ton="attente"[\s\S]*3 arrivages[\s\S]*3 h 00[\s\S]*à 08:15/);
  assert.match(rang('prepa'), /title="[^"]*avant le premier lot : 1 h 00[^"]*entre deux lots : 15 min[^"]*après le dernier lot : 1 h 30[^"]*attend Cuisine, jusqu’à 07:00/);
  // La cuisine : un arrivage, aucun n'a attendu.
  assert.match(rang('cuisine'), /class="sy-arrivage"[^>]*>[\s\S]*1 arrivage[\s\S]*<small>—<\/small>/);
  assert.doesNotMatch(rang('cuisine').split('class="sy-arrivage"')[1].split('</td>')[0], /data-ton/);
  // Sous le tableau, l'occupation s'explique.
  assert.match(html, /Occupation : la part du temps de présence couverte par le travail du barème\. Elle dépend des temps par vol et des effectifs réglés\./);
  // Les mots : jamais « attente » seul, jamais « un lot attend » pour un lot qui est simplement à faire.
  const texte = (html + SV.carteCoince(rep).corps + SV.phrases(rep).join(' ')).replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(texte, /un lot (y )?attend/);
  assert.doesNotMatch(texte, /\battente jusqu’à\b/);
});

/* ---- aucun réglage nouveau ; non-régression ----------------------------------------------------------- */

test('la page des seuils n’a aucun champ de plus, ses clés et ses défauts n’ont pas changé', () => {
  assert.deepEqual(R.SEUILS.map(s => s.cle), ['ecartPersonnes', 'attenteLot', 'occupation', 'dureeStockMax', 'retard']);
  assert.deepEqual(R.SEUILS_DEFAUT, { ecartPersonnes: 3, attenteLot: 360, occupation: 95, dureeStockMax: null, retard: 1 });
  assert.deepEqual(Object.keys(R.seuilsComplets()), ['ecartPersonnes', 'attenteLot', 'occupation', 'dureeStockMax', 'retard']);
  // Le seuil d'attente garde sa clé ; il dit ce qu'il mesure désormais : l'attente d'un arrivage.
  assert.equal(R.SEUILS.find(s => s.cle === 'attenteLot').nom, 'Attente d’un arrivage');
  const SEV = require('../seuils-vue.js'), html = SEV.html(R.seuilsComplets(), null);
  assert.equal((html.match(/data-seuil="/g) || []).length, 5);
});

test('non-régression : le résultat de la journée et les indicateurs sont identiques, avant et après les réponses', () => {
  for (const jeu of [() => ENSEMBLE(60, { boutique: true }), AU_FIL, () => DEPASSE(460), () => DEPASSE(400, { boutique: true })]) {
    const { r, args } = jeu(), avantR = JSON.stringify(r), k = I.journee(r, args), avantK = JSON.stringify(k), avantA = JSON.stringify(args);
    const rep = R.reponses(r, args, { k });
    SV.tableau(rep, []); SV.carteCoince(rep); SV.phrases(rep);
    assert.equal(JSON.stringify(r), avantR, 'le résultat');
    assert.equal(JSON.stringify(k), avantK, 'les indicateurs');
    assert.equal(JSON.stringify(args), avantA, 'les arguments');
    assert.equal(JSON.stringify(I.journee(r, args)), avantK, 'les indicateurs recalculés');
  }
});
