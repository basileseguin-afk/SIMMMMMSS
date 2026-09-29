/* Deux étapes fusionnées, à la chaîne (retour d'usage du 29/09) : « une
 * personne dresse un plat puis le passe, l'autre fait le montage
 * directement ». Une case de Montage fait AUSSI la Prépa, pour ses seules
 * commandes ; seule, une personne fait les deux ; à plusieurs, le poste le
 * plus lent donne le rythme. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, regime: { actif: false }, ...p });
const VOLS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: h('14:00'), bc: 0, pc: 0, yc: 100 },
  { id: 'TX1', cie: 'TX', sens: 'DEP', std: h('15:00'), bc: 0, pc: 0, yc: 80 }
];
// Minutes par vol : cuisine 30, prépa (dresser) 40, montage 60, dotation 10.
const BAREME = { cuisine: { '*/YC': 30 }, preparation: { '*/YC': 40 }, prepa: { '*/YC': 60 }, dotation: { '*/YC': 10 } };
const CHEMIN = { id: 'c1', nom: 'Chaud', liens: [{ from: 'cuisine', to: 'preparation' }, { from: 'preparation', to: 'prepa' }, { from: 'preparation', to: 'dotation' }] };
const jouer = ateliers => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers,
  parcours: [CHEMIN], parcoursCabine: { YC: 'c1' } });
const lot = (r, atelier, classe) => r.lots.find(l => l.atelier === atelier && (l.classes || []).includes(classe));

test('la durée à la chaîne : seul, la somme ; à plusieurs, le poste le plus lent', () => {
  assert.equal(P.dureeFusion(40, 60, 1), 100, 'une personne dresse puis monte');
  assert.equal(P.dureeFusion(40, 60, 2), 60, 'une dresse, une monte : le montage donne le rythme');
  assert.equal(P.dureeFusion(40, 60, 3), 40, 'une dresse, deux montent : 40 et 30, la prépa donne le rythme');
  assert.equal(P.dureeFusion(40, 60, 4), 30, 'deux et deux : 20 et 30');
  assert.equal(P.dureeFusion(0, 60, 2), 30, 'sans prépa, c’est un montage ordinaire');
  assert.equal(P.dureeFusion(40, 60, 0), Infinity, 'personne : rien ne se fait');
});

test('une case de Montage qui fait aussi la Prépa, pour une compagnie seulement', () => {
  const ateliers = [
    at('cu', 'cuisine', '05:00', [['AF/YC'], ['TX/YC']]),
    // AF : prépa et montage fusionnés, à deux.
    at('fu', 'prepa', '05:00', [['AF/YC']], { personnes: 2, fusion: 'preparation' }),
    // TX : les deux cases habituelles.
    at('pr', 'preparation', '05:00', [['TX/YC']]),
    at('mo', 'prepa', '05:00', [['TX/YC']])
  ];
  const r = jouer(ateliers);
  assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou' && a.service === 'preparation'), 'la Prépa d’AF n’est pas un trou');
  const cu = lot(r, 'cu', 'AF/YC'), fu = lot(r, 'fu', 'AF/YC');
  assert.equal(fu.debut, cu.fin, 'la case fusionnée attend la cuisine, pas une prépa qui n’existe pas');
  assert.equal(fu.fin - fu.debut, 60, 'à deux : max(40, 60)');
  assert.equal(fu.hommeMinutes, 100, 'le travail des deux étapes');
  assert.equal(fu.fusion, 'preparation');
  // TX passe par ses deux cases, l'une après l'autre.
  const pr = lot(r, 'pr', 'TX/YC'), mo = lot(r, 'mo', 'TX/YC');
  assert.equal(mo.debut, pr.fin);
  assert.equal(pr.fin - pr.debut, 40);
});

test('seule dans la case, une personne dresse puis monte : la somme', () => {
  const r = jouer([at('cu', 'cuisine', '05:00', [['AF/YC']]), at('fu', 'prepa', '05:00', [['AF/YC']], { fusion: 'preparation' })]);
  const fu = lot(r, 'fu', 'AF/YC');
  assert.equal(fu.fin - fu.debut, 100);
});

test('ce qui suivait la Prépa attend la case qui l’a faite', () => {
  // La dotation part de la Prépa : pour AF, c'est la case fusionnée qui la livre.
  const r = jouer([at('cu', 'cuisine', '05:00', [['AF/YC']]), at('fu', 'prepa', '05:00', [['AF/YC']], { personnes: 2, fusion: 'preparation' }),
    at('do', 'dotation', '05:00', [['AF/YC']])]);
  assert.equal(lot(r, 'do', 'AF/YC').debut, lot(r, 'fu', 'AF/YC').fin);
});

test('une fusion vers son propre service, ou sur une plonge, ne compte pas', () => {
  const r = jouer([at('cu', 'cuisine', '05:00', [['AF/YC']]), at('fu', 'prepa', '05:00', [['AF/YC']], { personnes: 2, fusion: 'prepa' })]);
  assert.equal(lot(r, 'fu', 'AF/YC').fin - lot(r, 'fu', 'AF/YC').debut, 30, 'un montage ordinaire : 60 ÷ 2');
  assert.ok(r.anomalies.some(a => a.code === 'parcours-trou' && a.service === 'preparation'), 'la Prépa reste un trou, et on le dit');
});
