/* Correction 17 (a) — le jour de travail va jusqu'au bout de la ligne
 * (moteur/reponses.js, synthese-vue.js). Une journée fictive, calculée à la
 * main : le montage a une équipe la veille et une le jour des vols.
 *   — la veille (J−1, 06:00, 1 personne) : NORD/BC, 180 homme-minutes, de 06:00
 *     à 09:00 ; puis NORD/YC, 300 homme-minutes, qui attend de 06:00 à 09:00,
 *     faite de 09:15 à 12:15 et de 13:00 à 15:00 (pauses de 15 et 45 min) ;
 *     son horaire finit à 14:00 : 60 min d'heures sup ;
 *   — le jour des vols (J, 06:00, 1 personne) : SUD/YC, 450 homme-minutes, de
 *     06:00 à 09:00, de 09:15 à 12:15, de 13:00 à 14:30 ; 30 min d'heures sup,
 *     aucune file.
 * Chaque ligne a sa fin, sa fin d'horaire, son dépassement, ses heures sup, sa
 * file et son attente ; la somme des lignes fait le service ; chaque ligne dit
 * son jour ; le goulot dit le sien. Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');

const h = s => P.minutes(s), VEILLE = -1440;
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, jour, lots) => ({ id, nom: id, service, type: 'manuel', debut: '06:00', jour, personnes: 1, lots, regime: { actif: true } });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const DEUX_JOURS = () => {
  const args = { liaisons: [], rendement: 1, noms: { prepa: 'Montage' }, heuresSup: { actif: true, plafond: 120 },
    vols: [dep('NO1', 'NORD', '20:00', { bc: 10 }), dep('SU1', 'SUD', '22:00')],
    bareme: { prepa: { 'NORD/BC': 180, 'NORD/YC': 300, 'SUD/YC': 450 } },
    ateliers: [eq('veille', 'prepa', -1, [['NORD/BC'], ['NORD/YC']]), eq('jour', 'prepa', 0, [['SUD/YC']])],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c1' } };
  return { r: P.simuler(args), args };
};
// Le goulot (correction 17 c) : une attente au-delà du seuil ET une fin après l'horaire. La veille attend 3 h et finit 1 h après
// son horaire : elle coince dès qu'on règle l'attente d'un lot sous 3 h (le défaut, 6 h, ne la retient pas).
const UNE_HEURE = { seuils: { attenteLot: 60 } };

test('la fin, la fin d’horaire, le dépassement et les heures sup : par service et par jour de travail', () => {
  const { r, args } = DEUX_JOURS(), f = R.reponses(r, args).fins.services.filter(s => s.service === 'prepa');
  assert.deepEqual(f.map(s => s.jour), [-1, 0], 'deux lignes : la veille, puis le jour des vols');
  const [v, j] = f;
  assert.deepEqual([v.nom, v.fin, v.finHoraire, v.depasse, v.heuresSup], ['Montage', VEILLE + h('15:00'), VEILLE + h('14:00'), 60, { equipes: 60, renforts: 0, chauffeurs: 0, total: 60 }]);
  assert.deepEqual([j.nom, j.fin, j.finHoraire, j.depasse, j.heuresSup], ['Montage', h('14:30'), h('14:00'), 30, { equipes: 30, renforts: 0, chauffeurs: 0, total: 30 }]);
  assert.deepEqual([v.equipes.map(e => e.id), j.equipes.map(e => e.id)], [['veille'], ['jour']]);
  // La somme des heures sup des lignes : celle du service, comptée à la main sur ses équipes (60 + 30).
  const service = r.ateliers.filter(a => a.service === 'prepa').reduce((n, a) => n + (a.heuresSup > 0 ? a.personnes * a.heuresSup : 0), 0);
  assert.equal(service, 90);
  assert.equal(f.reduce((n, s) => n + s.heuresSup.total, 0), service);
});

test('la file et l’attente : par service et par jour de travail ; le goulot dit son jour', () => {
  const { r, args } = DEUX_JOURS(), c = R.reponses(r, args, UNE_HEURE).coince, lignes = c.services.filter(s => s.service === 'prepa');
  assert.deepEqual(lignes.map(s => s.jour), [-1, 0]);
  const [v, j] = lignes;
  assert.deepEqual(v.file, { lots: 1, a: VEILLE + h('06:00') });
  assert.deepEqual(v.attenteMax, { minutes: 180, lot: 'NORD/YC', equipe: 'veille', de: VEILLE + h('06:00'), a: VEILLE + h('09:00') });
  assert.equal(v.cumul, 180);
  assert.deepEqual([j.file, j.attenteMax, j.cumul, j.cause], [null, null, 0, null], 'le jour des vols : rien n’attend');
  assert.deepEqual([c.goulot.service, c.goulot.jour, c.goulot.de, c.goulot.a], ['prepa', -1, VEILLE + h('06:00'), VEILLE + h('09:00')]);
  assert.equal(R.reponses(r, args).coince.goulot, null, 'au seuil par défaut (6 h), 3 h d’attente ne coincent pas');
});

test('les personnes, la file et les fins portent les mêmes lignes (service, jour)', () => {
  const { r, args } = DEUX_JOURS(), rep = R.reponses(r, args), cle = s => s.service + '|' + s.jour;
  assert.deepEqual(rep.fins.services.map(cle), rep.personnes.services.map(cle));
  assert.deepEqual(rep.coince.services.map(cle), rep.personnes.services.map(cle));
  // La comparaison de deux essais suit les mêmes lignes.
  const d = R.comparer(rep, rep);
  assert.deepEqual(d.fins.services.map(cle), ['prepa|-1', 'prepa|0']);
  assert.deepEqual(d.coince.services.map(cle), ['prepa|-1', 'prepa|0']);
  assert.ok(d.fins.services.every(s => s.fin.d === 0 && s.heuresSup.d === 0));
});

test('la Synthèse : deux lignes pour le service, chacune avec sa fin, ses heures sup et son jour', () => {
  const { r, args } = DEUX_JOURS(), rep = R.reponses(r, args), ls = SV.lignes(rep, ['prepa']);
  assert.deepEqual(ls.map(l => [l.service, l.jour, l.mot]), [['prepa', -1, 'veille'], ['prepa', 0, 'jour des vols']]);
  assert.deepEqual(ls.map(l => [l.fin.fin, l.fin.heuresSup.total]), [[VEILLE + h('15:00'), 60], [h('14:30'), 30]]);
  assert.deepEqual(ls.map(l => (l.coince.attenteMax ? l.coince.attenteMax.minutes : null)), [180, null]);
  // Dans le tableau : chaque ligne porte son jour, et ses propres cases de file, de fin et d'heures sup.
  const html = SV.tableau(rep, ['prepa']), rangs = html.split('<tr data-service="prepa"').slice(1);
  assert.equal(rangs.length, 2);
  assert.match(rangs[0], /data-jour="-1"[\s\S]*<span class="sy-jour">veille<\/span>[\s\S]*J-1 15:00[\s\S]*1 h 00/);
  assert.match(rangs[1], /data-jour="0"[\s\S]*<span class="sy-jour">jour des vols<\/span>[\s\S]*14:30[\s\S]*30 min/);
  assert.doesNotMatch(html, /rowspan/, 'plus de case partagée entre deux jours');
  for (const rang of rangs) assert.equal((rang.match(/class="sy-file"/g) || []).length, 1);
});

test('les mots du jour : J−2, veille, jour des vols, J+1 ; le jour des vols se dit quand le service a plusieurs lignes', () => {
  assert.deepEqual([-2, -1, 0, 1].map(j => SV.motDuJour(j)), ['J−2', 'veille', 'jour des vols', 'J+1']);
  // Un service à une seule ligne, le jour des vols : pas de mention ; la veille : « veille ».
  const { r, args } = DEUX_JOURS(), rep = R.reponses(r, args);
  const seul = { ...rep, personnes: { ...rep.personnes, services: rep.personnes.services.filter(s => s.jour === 0) } };
  assert.deepEqual(SV.lignes(seul, ['prepa']).map(l => l.mot), [null]);
  const veille = { ...rep, personnes: { ...rep.personnes, services: rep.personnes.services.filter(s => s.jour === -1) } };
  assert.deepEqual(SV.lignes(veille, ['prepa']).map(l => l.mot), ['veille']);
});

test('la phrase de tête et la carte « Où ça coince » disent le jour du goulot', () => {
  const { r, args } = DEUX_JOURS(), rep = R.reponses(r, args, UNE_HEURE);
  assert.match(SV.phrases(rep)[1], /^Montage \(veille\) coince de J-1 06:00 à J-1 09:00 ; /);
  assert.match(SV.carteCoince(rep).corps, /Montage <span class="sy-jour">veille<\/span>/);
  // Un goulot le jour des vols le dit aussi, quand son service a une autre ligne : comme la ligne du tableau.
  const g0 = { ...rep, coince: { ...rep.coince, goulot: { ...rep.coince.goulot, jour: 0, de: h('06:00'), a: h('09:00') } } };
  assert.match(SV.phrases(g0)[1], /^Montage \(jour des vols\) coince de 06:00 à 09:00 ; /);
  assert.match(SV.carteCoince(g0).corps, /Montage <span class="sy-jour">jour des vols<\/span>/);
  // Un service qui ne travaille que le jour des vols : la phrase d'avant, sans mention.
  const seul = { ...g0, coince: { ...g0.coince, services: g0.coince.services.filter(s => s.jour === 0) } };
  assert.match(SV.phrases(seul)[1], /^Montage coince de 06:00 à 09:00 ; /);
  assert.doesNotMatch(SV.carteCoince(seul).corps, /sy-jour">jour des vols/);
});

test('la feuille « Réponses » et « Comparer deux essais » portent le jour de chaque ligne', () => {
  const ER = require('../echanges-reponses.js'), CV = require('../comparer-vue.js');
  const { r, args } = DEUX_JOURS(), rep = R.reponses(r, args, UNE_HEURE), f = ER.feuilleDesReponses(rep, { date: '2026-11-02' });
  const col = nom => ER.TETE.indexOf(nom);
  const fins = f.lignes.filter(l => l[col('Sujet')] === 'Montage' && l[col('Mesure')] === 'Fin du dernier lot');
  assert.equal(fins.length, 2, 'une ligne par jour de travail');
  assert.equal(fins[1][col('Jour de travail')].excel - fins[0][col('Jour de travail')].excel, 1, 'la veille, puis le jour des vols');
  const files = f.lignes.filter(l => l[col('Sujet')] === 'Montage' && l[col('Mesure')] === 'File la plus longue');
  assert.deepEqual(files.map(l => l[col('Jour de travail')].excel), [fins[0][col('Jour de travail')].excel], 'la file de la veille, à son jour');
  assert.equal(f.lignes.find(l => l[col('Mesure')] === 'Goulot')[col('Jour de travail')].excel, fins[0][col('Jour de travail')].excel, 'le goulot dit son jour');
  // Un second essai où la veille a deux personnes : sa ligne change, et se nomme « Montage (veille) ».
  const B = (() => { const x = DEUX_JOURS().args; x.ateliers[0].personnes = 2; return { r: P.simuler(x), args: x }; })();
  const lignes = CV.lignesDesReponses(rep, R.reponses(B.r, B.args, UNE_HEURE));
  assert.ok(lignes[3].some(l => l.lib === 'Montage (veille) finit à'), lignes[3].map(l => l.lib).join(' | '));
  assert.ok(!lignes[3].some(l => l.lib === 'Montage (jour des vols) finit à'), 'le jour des vols ne change pas');
  assert.match(lignes[2][0].a, /^Montage \(veille\)$/, 'le goulot dit son jour');
});
