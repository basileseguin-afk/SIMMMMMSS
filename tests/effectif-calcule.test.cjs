/* L'effectif calculé (retour d'usage du 05/10) : « on simule les man-minutes, et
 * le nombre de personnes se déduit des minutes par vol × le nombre de vols de
 * chaque compagnie ; il dépend des vols et n'est pas constant, à part sur
 * certains ateliers ». Dans un service calculé, une équipe à la main a pour
 * effectif : homme-minutes ÷ (minutes travaillées du poste × rendement), arrondi
 * au-dessus. Ailleurs, l'effectif saisi reste. v1 et v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [version, chemin] of [['v1', '../moteur/production.js'], ['v2', '../v2/moteur/production.js']]) {
  const P = require(chemin);
  const h = s => P.minutes(s);
  const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, pauses: [], ...p });
  // 6 vols AF, 4 vols TX : 30 min par vol en prépa → 300 homme-minutes.
  const VOLS = [];
  for (let i = 0; i < 6; i++) VOLS.push({ id: 'AF' + i, cie: 'AF', sens: 'DEP', std: h('20:00'), bc: 0, pc: 0, yc: 100 });
  for (let i = 0; i < 4; i++) VOLS.push({ id: 'TX' + i, cie: 'TX', sens: 'DEP', std: h('21:00'), bc: 0, pc: 0, yc: 80 });
  const BAREME = { prepa: { '*/YC': 30 }, cuisine: { 'AF/YC': 20, 'TX/YC': 10 } };
  const jouer = (ateliers, o) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers, ...o });

  test(version + ' : le poste d’une personne, pauses comprises', () => {
    // 8 h de présence, dont 1 h de pause après 4 h de travail : 420 min de travail (06/10).
    assert.equal(P.minutesDuPoste(at('a', 'prepa', '06:00', []), null), 420);
    // Une pause fixe d'une heure en plus.
    assert.equal(P.minutesDuPoste(at('a', 'prepa', '06:00', [], { pauses: [{ de: '10:00', a: '11:00' }] }), null), 360);
    // Une présence plus courte, sans pause de régime atteinte.
    assert.equal(P.minutesDuPoste(at('a', 'prepa', '06:00', [], { regime: { actif: true, presence: 120 } }), null), 120);
    // Sans régime : une présence ordinaire, pas un temps infini.
    assert.equal(P.minutesDuPoste(at('a', 'prepa', '06:00', [], { regime: { actif: false } }), null), 420);
  });

  test(version + ' : le plus petit effectif qui tient dans le poste', () => {
    assert.equal(P.effectifPour(0, 0, 450, 1), 0, 'sans travail, personne');
    assert.equal(P.effectifPour(450, 0, 450, 1), 1);
    assert.equal(P.effectifPour(451, 0, 450, 1), 2, 'arrondi au-dessus');
    assert.equal(P.effectifPour(900, 0, 450, 0.5), 4, 'le rendement compte');
    // À la chaîne, le poste le plus lent donne le rythme : 40 + 60 en 60 min, deux personnes ;
    // 400 + 60 en 230 min, trois (deux dressent en 200, une monte en 60), là où 460 ÷ 230 en dirait deux.
    assert.equal(P.effectifPour(60, 40, 60, 1), 2);
    assert.equal(P.effectifPour(60, 400, 230, 1), 3);
    assert.equal(P.effectifPour(10, 0, 0, 1), null, 'sans poste, pas de calcul');
  });

  test(version + ' : l’effectif suit le nombre de vols de chaque compagnie', () => {
    // 10 vols × 30 min = 300 homme-minutes sur un poste de 120 min : 3 personnes.
    const a = at('mo', 'prepa', '06:00', [['AF/YC'], ['TX/YC']], { personnes: 7, regime: { actif: true, presence: 120 } });
    const r = jouer([a], { effectifCalcule: ['prepa'] });
    assert.deepEqual(r.effectifs.mo, { personnes: 3, saisi: 7, hommeMinutes: 300, poste: 120, rendement: 1 });
    assert.equal(r.ateliers.find(x => x.id === 'mo').personnes, 3, 'la journée se joue avec 3 personnes');
    assert.equal(a.personnes, 7, 'l’équipe de l’appelant n’est pas touchée');
    const fin = Math.max(...r.lots.filter(l => l.atelier === 'mo').map(l => l.fin));
    assert.equal(fin, h('06:00') + 100, '300 homme-minutes à trois : 100 min');
    // Deux fois plus de vols AF : 480 homme-minutes, 4 personnes.
    const plus = VOLS.concat(VOLS.filter(v => v.cie === 'AF').map(v => ({ ...v, id: v.id + 'b' })));
    const r2 = P.simuler({ vols: plus, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [a], effectifCalcule: ['prepa'] });
    assert.equal(r2.effectifs.mo.hommeMinutes, 480);
    assert.equal(r2.effectifs.mo.personnes, 4);
  });

  test(version + ' : un service constant garde l’effectif saisi', () => {
    const a = at('mo', 'prepa', '06:00', [['AF/YC'], ['TX/YC']], { personnes: 7 });
    const r = jouer([a], { effectifCalcule: ['cuisine'] });
    assert.deepEqual(r.effectifs, {});
    assert.equal(r.ateliers.find(x => x.id === 'mo').personnes, 7);
    // Sans l'option, rien ne change.
    assert.deepEqual(jouer([a]).effectifs, {});
  });

  test(version + ' : les minutes propres à la case comptent, les autres types ne sont pas calculés', () => {
    const r = jouer([
      // Cuisine : AF 6 × 20 = 120, TX : 50 fixées dans la case. 170 sur 420 : 1 personne.
      at('cu', 'cuisine', '04:00', [['AF/YC'], ['TX/YC']], { personnes: 5, minutes: { 'TX/YC': 50 } }),
      { id: 'ro', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00', jour: 0, personnes: 4, lots: [['AF/YC']], debit: 300 }
    ], { effectifCalcule: ['cuisine', 'prepa'] });
    assert.equal(r.effectifs.cu.hommeMinutes, 170);
    assert.equal(r.effectifs.cu.personnes, 1);
    assert.equal(r.effectifs.ro, undefined, 'le robot garde son effectif');
    assert.equal(r.ateliers.find(x => x.id === 'ro').personnes, 4);
  });

  test(version + ' : une équipe sans commande n’a besoin de personne, sans alerte « sans personne »', () => {
    const r = jouer([at('vide', 'prepa', '06:00', [], { personnes: 0 })], { effectifCalcule: ['prepa'] });
    assert.equal(r.effectifs.vide.personnes, 0);
    assert.ok(!r.anomalies.some(x => x.atelier === 'vide' && (x.code === 'sans-personne' || x.code === 'personnes')));
  });

  test(version + ' : des commandes sans minutes au barème : une personne, pas une journée impossible', () => {
    const r = P.simuler({ vols: VOLS, liaisons: [], bareme: {}, rendement: 1, effectifCalcule: ['dotation'],
      ateliers: [at('do', 'dotation', '06:00', [['AF/YC']], { personnes: 0 })] });
    assert.equal(r.effectifs.do.hommeMinutes, 0);
    assert.equal(r.effectifs.do.personnes, 1);
    assert.ok(r.lots.filter(l => l.atelier === 'do').every(l => !l.impossible));
  });

  test(version + ' : une équipe fusionnée compte les deux étapes', () => {
    const CHEMIN = { id: 'c1', nom: 'Froid', liens: [{ from: 'preparation', to: 'prepa' }] };
    const r = P.simuler({ vols: VOLS, liaisons: [], rendement: 1, bareme: { preparation: { '*/YC': 40 }, prepa: { '*/YC': 30 } },
      parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, effectifCalcule: ['prepa'],
      ateliers: [at('fu', 'prepa', '06:00', [['AF/YC']], { fusion: 'preparation', regime: { actif: true, presence: 120 } })] });
    // AF : 6 × 40 = 240 (prépa) + 6 × 30 = 180 (montage) = 420 en 120 min.
    assert.equal(r.effectifs.fu.hommeMinutes, 420);
    assert.ok(P.dureeFusion(240, 180, r.effectifs.fu.personnes) <= 120);
    assert.ok(P.dureeFusion(240, 180, r.effectifs.fu.personnes - 1) > 120, 'le plus petit qui tient');
  });

  test(version + ' : une équipe hors tunnel à la plonge suit les vols qui reviennent (06/10)', () => {
    const RET = [];
    for (let i = 0; i < 40; i++) RET.push({ id: 'R' + i, cie: i < 30 ? 'AF' : 'TX', sens: 'RET', sta: h('10:00'), bc: 0, pc: 0, yc: 100 });
    const tunnel = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [],
      tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] };
    const tri = { id: 'tri', nom: 'Tri des chariots', service: 'plonge', type: 'appui', debut: '08:00', jour: 0, personnes: 1, pauses: [], lots: [],
      minutesVol: { AF: 20, '*': 12 } };
    const jouer2 = o => P.simuler({ vols: VOLS.concat(RET), liaisons: [], bareme: BAREME, rendement: 1, materiel: { actif: true, retours: 'programme' },
      ateliers: [tunnel, tri], ...o });
    const r = jouer2({ effectifCalcule: ['plonge'] });
    // 30 retours AF × 20 + 10 TX × 12 = 720 min sur un poste de 420 : 2 personnes.
    assert.deepEqual([r.effectifs.tri.hommeMinutes, r.effectifs.tri.vols, r.effectifs.tri.retours, r.effectifs.tri.personnes], [720, 40, true, 2]);
    assert.equal(r.effectifs.pl, undefined, 'le tunnel garde son effectif');
    const v = r.ateliers.find(x => x.id === 'tri');
    assert.equal(v.personnes, 2);
    assert.equal(v.finPoste, h('08:00') + 480, 'présente ses 8 h');
    assert.deepEqual(v.lots, [], 'elle ne fait rien attendre');
    assert.ok(!r.anomalies.some(x => x.atelier === 'tri'), 'pas d’alerte « ne fabrique rien » : ' + JSON.stringify(r.anomalies.filter(x => x.atelier === 'tri')));
    // Constant : l'effectif saisi.
    assert.equal(jouer2({ effectifCalcule: [] }).ateliers.find(x => x.id === 'tri').personnes, 1);
    // Sans minutes par vol : l'effectif saisi reste, même calculé.
    const sans = P.simuler({ vols: VOLS.concat(RET), liaisons: [], bareme: BAREME, materiel: { actif: true }, effectifCalcule: ['plonge'],
      ateliers: [tunnel, { ...tri, minutesVol: {} }] });
    assert.equal(sans.effectifs.tri, undefined);
  });

  test(version + ' : ailleurs qu’à la plonge, une équipe d’appui suit les départs', () => {
    const r = jouer([{ id: 'ck', nom: 'Checkeurs', service: 'handling', type: 'appui', debut: '04:00', jour: 0, personnes: 3, pauses: [], lots: [],
      minutesVol: { '*': 42 } }], { effectifCalcule: ['handling'] });
    // 10 départs × 42 min = 420 min sur un poste de 420 : 1 personne.
    assert.deepEqual([r.effectifs.ck.vols, r.effectifs.ck.retours, r.effectifs.ck.personnes], [10, false, 1]);
  });
}
