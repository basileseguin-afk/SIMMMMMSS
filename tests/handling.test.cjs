/* Le handling travaille par vol : il réunit les classes d'un même vol et le
 * charge, dans l'ordre strict des départs. Les autres services, eux, préparent
 * une compagnie × classe pour tous ses vols (retour d'usage du 28/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = (heure) => Math.round(h0(heure));
const h0 = s => P.minutes(s);
const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, regime: { actif: false }, ...p });
const handling = p => ({ id: 'ha', nom: 'Handling', service: 'handling', type: 'handling', debut: '04:00', jour: 0, personnes: 4,
  lots: [], regime: { actif: false }, durees: { '*': 30 }, simultanes: 1, avance: 180, ...p });
const VOLS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: h('09:00'), bc: 10, pc: 0, yc: 100 },
  { id: 'AF2', cie: 'AF', sens: 'DEP', std: h('12:00'), bc: 10, pc: 0, yc: 100 },
  { id: 'TX1', cie: 'TX', sens: 'DEP', std: h('10:00'), bc: 0, pc: 0, yc: 50 }
];
const BAREME = { prepa: { '*/BC': 60, '*/YC': 30 } };
const jouer = (ha, ateliers, vols = VOLS) => P.simuler({ vols, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
  ateliers: (ateliers || [at('pr', 'prepa', '05:00', [['AF/BC'], ['AF/YC'], ['TX/YC']])]).concat(ha ? [ha] : []) });

test('les départs de la journée, avec leurs classes, dans l’ordre des départs', () => {
  const v = P.volsDesClasses(P.classesDeVols(VOLS));
  assert.deepEqual(v.map(x => x.id), ['AF1', 'TX1', 'AF2']);
  assert.deepEqual(v[0].classes.sort(), ['AF/BC', 'AF/YC']);
  assert.equal(v[0].pax['AF/YC'], 100);
});

test('la durée d’un vol : celle de sa compagnie, sinon celle de toutes', () => {
  const a = { durees: { AF: 40, '*': 25 } };
  assert.equal(P.dureeHandling(a, 'AF'), 40);
  assert.equal(P.dureeHandling(a, 'tx'), 25);
  assert.equal(P.dureeHandling({ durees: { AF: 40 } }, 'TX'), null);
  assert.equal(P.dureeHandling({ durees: { AF: '' , '*': 0 } }, 'AF'), 0, 'zéro est une durée ; vide n’en est pas une');
});

test('un vol est chargé quand toutes ses classes sont là, pas avant départ − avance', () => {
  const r = jouer(handling({ durees: { AF: 40, '*': 30 } }));
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  // prépa : AF/BC 2×60 = 05:00→07:00, AF/YC 2×30 → 08:00, TX/YC 30 → 08:30.
  const af1 = r.vols.find(v => v.id === 'AF1');
  assert.equal(af1.pret, h('08:00'), 'complet quand sa dernière classe sort de la prépa');
  assert.equal(af1.debut, h('08:00'));
  assert.equal(af1.fin, h('08:40'), '40 min pour AF');
  assert.equal(af1.aHeure, true);
  const tx1 = r.vols.find(v => v.id === 'TX1');
  assert.equal(tx1.debut, h('08:40'), 'une seule piste : après AF1');
  assert.equal(tx1.fin, h('09:10'), '30 min pour les autres compagnies');
  const af2 = r.vols.find(v => v.id === 'AF2');
  assert.equal(af2.debut, h('09:10'), 'le quai est pris par TX1 jusqu’à 09:10');
  // Trois quais : AF2, complet dès 08:00, n'est pas commencé avant 12:00 − 3 h.
  assert.equal(jouer(handling({ simultanes: 3 })).vols.find(v => v.id === 'AF2').debut, h('09:00'), 'pas plus de 3 h avant son départ');
  assert.equal(jouer(handling({ simultanes: 3, avance: 60 })).vols.find(v => v.id === 'AF2').debut, h('11:00'));
  assert.equal(r.indicateurs.volsAHeure, 3);
});

test('la commande est prête quand elle arrive au handling, pas quand son dernier vol est chargé', () => {
  const r = jouer(handling());
  assert.equal(r.parClasse['AF/YC'].fin, h('08:00'));
  assert.equal(r.parClasse['AF/YC'].echeance, h('09:00') - 45, 'échéance : au handling à départ − délai');
  assert.ok(!r.parClasse['AF/YC'].services.includes('handling'));
});

test('strictement dans l’ordre des départs : un vol incomplet retient les suivants', () => {
  // TX/YC est préparée en premier (05:00 → 05:30), AF/YC très tard.
  const ats = [at('pr', 'prepa', '05:00', [['TX/YC'], ['AF/BC']]), at('p2', 'prepa2', '10:00', [['AF/YC']])];
  const r = P.simuler({ vols: VOLS, liaisons: [], bareme: { prepa: BAREME.prepa, prepa2: BAREME.prepa }, rendement: 1,
    ateliers: ats.concat([handling()]) });
  const tx1 = r.vols.find(v => v.id === 'TX1'), af1 = r.vols.find(v => v.id === 'AF1');
  assert.equal(af1.debut, h('11:00'), 'AF1 attend son Économie (10:00 → 11:00)');
  assert.equal(af1.retard, 150, 'chargé à 11:30 pour un départ à 09:00');
  assert.ok(tx1.debut >= af1.debut, 'TX1, prêt dès 05:30, passe après AF1 : ordre strict');
  assert.equal(tx1.aHeure, false);
  assert.ok(r.anomalies.some(a => a.code === 'handling-retard'), JSON.stringify(r.anomalies));
});

test('plusieurs vols à la fois : chaque quai prend le suivant dans l’ordre', () => {
  const r = jouer(handling({ simultanes: 2 }));
  const tx1 = r.vols.find(v => v.id === 'TX1');
  assert.equal(tx1.debut, h('08:30'), 'le second quai prend TX1 dès qu’il est complet');
});

test('une classe qui n’arrive jamais : le handling le dit, et nomme les vols retenus', () => {
  const ats = [at('pr', 'prepa', '05:00', [['AF/BC'], ['TX/YC']]), at('mo', 'montage', '05:00', [['AF/YC']])];
  const chemin = { id: 'c', nom: 'AF YC', noeuds: ['dotation', 'montage', 'handling'], liens: [{ de: 'dotation', vers: 'montage' }, { de: 'montage', vers: 'handling' }] };
  const r = P.simuler({ vols: VOLS, liaisons: [], rendement: 1, bareme: { prepa: BAREME.prepa, montage: BAREME.prepa, dotation: BAREME.prepa },
    parcours: [chemin], parcoursClasse: { 'AF/YC': 'c' },
    materiel: { actif: true, unites: { YC: { parVol: 50 } }, stockInitial: 0, delaiRetour: 0 },
    ateliers: ats.concat([at('do', 'dotation', '04:00', [['AF/YC']], { materiel: 'consomme' }), handling()]) });
  assert.equal(r.ok, true);
  const a = r.anomalies.find(x => x.code === 'handling-bloque');
  assert.ok(a, JSON.stringify(r.anomalies));
  assert.match(a.message, /attend toujours le vol AF1 \(09:00\) : AF · Économie n’arrive jamais de « montage »/);
  assert.match(a.message, /2 vols suivants ne sont pas chargés/);
  assert.deepEqual(r.vols.map(v => v.etat), ['bloque', 'bloque', 'bloque']);
  assert.equal(r.indicateurs.volsCharges, 0);
});

test('le poste du handling finit : les vols restants ne sont pas chargés, en une seule alerte', () => {
  const r = jouer(handling({ debut: '08:00', regime: { actif: true, presence: 60 } }));
  const af2 = r.vols.find(v => v.id === 'AF2');
  assert.equal(af2.etat, 'poste');
  const a = r.anomalies.filter(x => x.code === 'handling-poste');
  assert.equal(a.length, 1);
  assert.match(a[0].message, /vols? n.est pas chargé|vols ne sont pas chargés/);
  assert.equal(r.anomalies.filter(x => x.code === 'poste').length, 0, 'pas une alerte par vol');
});

test('une compagnie sans durée, ou qu’aucun handling ne charge : c’est dit', () => {
  const r = jouer(handling({ durees: { AF: 40 } }));
  assert.match(r.anomalies.find(a => a.code === 'handling-duree').message, /aucune durée par vol pour TX/);
  const r2 = jouer(handling({ compagnies: ['AF'] }));
  assert.match(r2.anomalies.find(a => a.code === 'handling-sans').message, /1 vol TX : aucun handling/);
  assert.deepEqual(r2.vols.map(v => v.id), ['AF1', 'AF2']);
});

test('deux handlings : chacun ses compagnies, l’autre le reste', () => {
  const r2 = P.simuler({ vols: VOLS, liaisons: [{ from: 'prepa', to: 'handling' }], bareme: BAREME, rendement: 1,
    ateliers: [at('pr', 'prepa', '05:00', [['AF/BC'], ['AF/YC'], ['TX/YC']]), handling({ id: 'hb', nom: 'Handling AF', compagnies: ['AF'] }), handling()] });
  assert.deepEqual(r2.vols.filter(v => v.atelier === 'hb').map(v => v.id), ['AF1', 'AF2']);
  assert.deepEqual(r2.vols.filter(v => v.atelier === 'ha').map(v => v.id), ['TX1']);
});

test('le handling n’est pas un trou sur le chemin, et n’a pas besoin de barème', () => {
  const chemin = { id: 'c', nom: 'C', noeuds: ['prepa', 'handling'], liens: [{ de: 'prepa', vers: 'handling' }] };
  const r = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, parcours: [chemin], parcoursCabine: { BC: 'c', YC: 'c' },
    ateliers: [at('pr', 'prepa', '05:00', [['AF/BC'], ['AF/YC'], ['TX/YC']]), handling()] });
  assert.deepEqual(r.anomalies.filter(a => ['parcours-trou', 'bareme', 'lots'].includes(a.code)), []);
  // Le séjour en stock devant le handling se compte vol par vol, avec ses repas.
  const s = r.stocks.sejours.filter(x => x.vers === 'handling' && x.classe === 'AF/YC');
  assert.deepEqual(s.map(x => x.vol), ['AF2'], 'AF1 est chargé dès sa sortie ; AF2 attend 09:00');
  assert.equal(s[0].repas, 100);
  assert.equal(r.stocks.sejours.filter(x => x.vers === 'chargement').length, 0, 'plus de « chargement » : c’est le handling');
});

test('sans handling, rien ne change : pas de vols suivis', () => {
  const r = jouer(null);
  assert.deepEqual(r.vols, []);
  assert.equal(r.indicateurs.partVolsAHeure, null);
});

test('un handling sans effectif saisi ne bloque pas la journée', () => {
  const r = jouer(handling({ personnes: 0 }));
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.equal(r.indicateurs.volsCharges, 3);
});

test('le handling travaille le jour J des vols : ni la veille, ni avant 00:00', () => {
  const tot = [{ id: 'AF0', cie: 'AF', sens: 'DEP', std: h('01:00'), bc: 0, pc: 0, yc: 10 }];
  const ats = [at('pr', 'prepa', '20:00', [['AF/YC']], { jour: -1 })];
  // Une case réglée à J-1 par erreur travaille quand même le jour J.
  const r = jouer(handling({ debut: '22:00', jour: -1, avance: 180 }), ats, tot);
  const v = r.vols[0];
  assert.equal(r.parClasse['AF/YC'].fin, -1440 + h('20:30'), 'la commande, elle, est prête la veille');
  assert.equal(v.debut, h('22:00'), 'l’équipe arrive à 22:00 du jour J, pas de la veille');
  assert.equal(v.etat, 'retard');
  const r2 = jouer(handling({ debut: '00:00', avance: 180 }), ats, tot);
  assert.equal(r2.vols[0].debut, 0, 'pas plus de 3 h avant le départ, mais jamais avant 00:00');
  assert.equal(r2.vols[0].fin, h('00:30'));
});
