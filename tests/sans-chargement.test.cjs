/* Évolution 21 (e) — une compagnie sans chargement par camion ne lève plus d'avis, quand c'est voulu.
 *
 * Pour une compagnie qu'aucun handling ne charge, le moteur lève l'avis « aucun handling ne charge cette compagnie ».
 * Dans une vraie unité, c'est parfois voulu : ce qui est produit pour elle ne part pas en camion. Le choix se retient
 * avec les réglages (`sansChargement`, une liste de compagnies, vide par défaut) : la compagnie ne lève plus l'avis, et
 * le calcul ne change pas d'un champ. Si un handling la charge ensuite, elle sort de la liste d'elle-même.
 * Des compagnies, des vols et des équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const A = require('../ateliers.js');

const h = s => P.minutes(s);
const vol = (id, cie, std, yc) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc });
const VOLS = [vol('XA1', 'XA', '18:00', 120), vol('XB1', 'XB', '19:00', 90), vol('XB2', 'XB', '20:00', 60)];
const montage = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, lots: [['XA/YC'], ['XB/YC']], pauses: [], regime: { actif: true, presence: 480, seuils: [] } };
const handling = p => ({ id: 'h', nom: 'Handling', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, simultanes: 2, durees: { '*': 20 }, lots: [], pauses: [],
  regime: { actif: false }, compagnies: ['XA'], ...p });
const ARGS = { vols: VOLS, liaisons: [{ from: 'prepa', to: 'quais' }], bareme: { prepa: { '*/YC': 30 } }, rendement: 1 };
const jouer = (p, h_) => P.simuler({ ...ARGS, ateliers: [montage, handling(h_)], ...p });
const avis = r => r.anomalies.filter(x => x.code === 'handling-sans');

test('une compagnie qu’aucun handling ne charge lève l’avis ; choisie « sans chargement », elle ne le lève plus', () => {
  const r = jouer();
  assert.deepEqual(avis(r).map(x => [x.compagnie, x.message]), [['XB', '2 vols XB : aucun handling ne charge cette compagnie. Ajoutez-la à un handling, ou videz sa liste de compagnies.']]);
  assert.deepEqual(avis(jouer({ sansChargement: ['XB'] })), []);
  // Le choix d'une autre compagnie ne tait rien ; la casse et les espaces ne comptent pas.
  assert.equal(avis(jouer({ sansChargement: ['XC'] })).length, 1);
  assert.deepEqual(avis(jouer({ sansChargement: [' xb '] })), []);
});

test('le calcul ne change pas d’un champ : avec et sans le choix, le même résultat, à l’avis près', () => {
  const sans = jouer(), avec = jouer({ sansChargement: ['XB'] });
  assert.equal(JSON.stringify(avec), JSON.stringify({ ...sans, anomalies: sans.anomalies.filter(x => x.code !== 'handling-sans') }));
  // Sans avis à taire (un handling qui charge tout), la liste ne change rien du tout.
  const tout = h_ => jouer(h_ ? { sansChargement: ['XB'] } : {}, { compagnies: [] });
  assert.equal(JSON.stringify(tout(true)), JSON.stringify(tout(false)));
});

test('le choix se garde avec les réglages : une liste de compagnies, vide par défaut ; sauvegarde et restauration', () => {
  const unite = p => A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [montage, handling()], ...p });
  assert.equal('sansChargement' in unite(), false, 'une sauvegarde d’avant : rien de nouveau');
  const etat = unite({ sansChargement: ['xb', 'XB', ' xc ', 12, '', null, { cie: 'XD' }] });
  assert.deepEqual(etat.sansChargement, ['XB', 'XC'], 'des codes de compagnie, une fois chacun, dans l’ordre');
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(etat))), etat, 'relu tel quel');
  assert.equal('sansChargement' in unite({ sansChargement: [] }), false);
  assert.equal('sansChargement' in unite({ sansChargement: 'XB' }), false, 'autre chose qu’une liste : ignoré');
});

test('si un handling charge ensuite une compagnie de la liste, elle en sort d’elle-même', () => {
  const unite = (compagnies, sansChargement) => A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [montage, handling({ compagnies })], sansChargement });
  assert.deepEqual(unite(['XA'], ['XB', 'XC']).sansChargement, ['XB', 'XC']);
  assert.deepEqual(unite(['XA', 'XB'], ['XB', 'XC']).sansChargement, ['XC'], 'XB est maintenant chargée');
  // Un handling sans liste charge toutes les compagnies : plus aucune n'est sans chargement.
  assert.equal('sansChargement' in unite([], ['XB', 'XC']), false);
});

test('la journée jouée depuis la sauvegarde lit la liste', () => {
  const sauvegarde = sansChargement => ({ schema: 'ory-sauvegarde', version: 1, contenu: {
    'ory-ateliers-v1': A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [montage, handling()], parcours: [{ id: 'c1', nom: 'Chemin', noeuds: ['prepa', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }] }],
      parcoursCabine: { YC: 'c1' }, ...(sansChargement ? { sansChargement } : {}) }),
    'ory-modele-v1': { bareme: ARGS.bareme, rendement: 1, regime: { seuils: [], presence: 480 } } } });
  const args = s => J.argumentsDeLaJournee(sauvegarde(s), VOLS);
  assert.equal('sansChargement' in args(), false, 'sans le réglage : rien de plus dans les arguments du moteur');
  assert.deepEqual(args(['XB']).sansChargement, ['XB']);
  assert.equal(avis(J.jouer(args())).length, 1);
  assert.deepEqual(avis(J.jouer(args(['XB']))), []);
});

test('le panneau des Problèmes : l’avis garde son texte et gagne le bouton « C’est voulu », pour sa compagnie', () => {
  const Avis = require('../avis.js');
  const r = jouer(), a = r.anomalies.filter(x => x.code === 'handling-sans');
  assert.deepEqual(a.map(x => x.compagnie), ['XB']);
  const liste = Avis.lister({ anomalies: r.anomalies }), avis = liste.filter(p => p.voulu);
  assert.deepEqual(avis.map(p => [p.niveau, p.titre, p.voulu]), [['corriger', a[0].message, 'XB']], 'le même avis, au même niveau, avec sa compagnie');
  const html = Avis.panneau(liste, id => id);
  assert.equal(Avis.VOULU, 'C’est voulu : pas de chargement pour cette compagnie');
  assert.equal(html.split('class="pb-voulu"').length - 1, 1, 'un seul bouton : celui de cet avis');
  assert.ok(html.includes('<button type="button" class="pb-voulu" data-pb-voulu="XB" aria-label="' + Avis.VOULU + ' (XB)">' + Avis.VOULU + '</button></li>'), html);
  // Les autres avis n'ont pas de bouton ; le choix fait, l'avis et son bouton s'en vont.
  assert.equal(Avis.lister({ anomalies: [{ code: 'handling-sans', message: 'sans compagnie' }, { code: 'bareme', message: 'x', compagnie: 'XB' }] }).some(p => 'voulu' in p), false);
  const apres = Avis.lister({ anomalies: jouer({ sansChargement: ['XB'] }).anomalies });
  assert.equal(apres.some(p => p.voulu), false);
  assert.equal(Avis.panneau(apres, id => id).includes('pb-voulu'), false);
  // Un code de compagnie venu d'un fichier est échappé avant d'entrer dans la page.
  assert.ok(Avis.panneau(Avis.lister({ anomalies: [{ code: 'handling-sans', message: 'm', compagnie: '"><b>' }] }), id => id).includes('data-pb-voulu="&quot;&gt;&lt;b&gt;"'));
});

test('la liste, mise au propre : des codes comme ceux d’un handling ; plusieurs handlings ; un handling qui charge tout', () => {
  const unite = (sansChargement, handlings) => A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [montage, ...handlings], sansChargement });
  const h1 = handling({ id: 'h1', compagnies: ['XA'] }), h2 = handling({ id: 'h2', nom: 'Handling 2', compagnies: ['xc'] }), tout = handling({ id: 'h3', nom: 'Handling 3', compagnies: [] });
  // Un code à tiret, un code long, la casse et les espaces : gardés comme dans la liste d'un handling ; une fois chacun, dans l'ordre.
  assert.deepEqual(unite([' air-fr ', 'XB', 'xb', 'COMPAGNIE_LONGUE_9', '', 7, null], [h1]).sansChargement, ['AIR-FR', 'COMPAGNIE_LONGUE_9', 'XB']);
  // Plusieurs handlings : une compagnie que l'un d'eux charge sort de la liste, quelle que soit sa casse.
  assert.deepEqual(unite(['XA', 'XB', 'XC'], [h1, h2]).sansChargement, ['XB']);
  // Un handling sans liste charge toutes les compagnies : la liste se vide, et le champ avec elle.
  assert.equal('sansChargement' in unite(['XB'], [h1, tout]), false);
  // Sans handling, le moteur ne lève pas l'avis : la liste est gardée telle quelle.
  assert.deepEqual(unite(['XB'], []).sansChargement, ['XB']);
  // Le moteur lit le même code : un vol d'une compagnie à tiret, choisie « sans chargement », ne lève plus l'avis.
  const vols = [...VOLS, vol('AF1', 'AIR-FR', '21:00', 50)], args = { ...ARGS, vols, ateliers: [{ ...montage, lots: [['XA/YC'], ['XB/YC'], ['AIR-FR/YC']] }, handling()] };
  const sans = P.simuler(args).anomalies.filter(x => x.code === 'handling-sans').map(x => x.compagnie).sort();
  assert.deepEqual(sans, ['AIR-FR', 'XB']);
  assert.deepEqual(P.simuler({ ...args, sansChargement: ['AIR-FR'] }).anomalies.filter(x => x.code === 'handling-sans').map(x => x.compagnie), ['XB']);
});
