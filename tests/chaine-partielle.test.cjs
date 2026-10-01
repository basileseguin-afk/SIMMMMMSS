/* Une équipe du Montage fait Prépa + Montage à la chaîne pour CRL et TX PC,
 * et le Montage SEUL pour RAM et AH YC, dont le flux n'a pas de Prépa (retour
 * d'usage du 01/10). La chaîne ne vaut que pour les commandes dont le chemin
 * passe par l'étape d'avant. Même jeu pour la v1 et la v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

function verifier(dossier, v) {
  const P = require(dossier + '/moteur/production.js');
  globalThis.MoteurProduction = P;
  const PC = require(dossier + '/parcours.js');
  const vols = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 600, pc: 20 }, { id: 'RAM1', cie: 'RAM', sens: 'DEP', std: 620, yc: 100 }];
  const etat = () => ({
    parcours: [{ id: 'pc', nom: 'Premium', noeuds: ['preparation', 'prepa'], liens: [{ de: 'preparation', vers: 'prepa' }] },
      { id: 'yc', nom: 'Éco sans prépa', noeuds: ['prepa'], liens: [] }],
    parcoursCabine: { PC: 'pc', YC: 'yc' }, parcoursClasse: {},
    ateliers: [{ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [],
      lots: [['TX/PC'], ['RAM/YC']], regime: { actif: false }, fusion: 'preparation' }]
  });
  const BAREME = { preparation: { '*/PC': 30, '*/YC': 40 }, prepa: { '*/PC': 20, '*/YC': 50 } };

  test(v + ' — le moteur : la Prépa à la chaîne pour TX PC, pas pour RAM YC', () => {
    const e = etat();
    const r = P.simuler({ vols, ateliers: e.ateliers, bareme: BAREME, parcours: e.parcours, parcoursCabine: e.parcoursCabine });
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    const tx = r.lots.find(l => l.classes.includes('TX/PC')), ram = r.lots.find(l => l.classes.includes('RAM/YC'));
    assert.equal(tx.minutesFusion, 30, 'TX PC : 30 min de Prépa, à la chaîne');
    assert.ok(!ram.minutesFusion, 'RAM YC : pas de Prépa');
    assert.equal(Math.round(ram.fin - ram.debut), 50, 'RAM YC : le Montage seul');
    assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou'));
  });

  test(v + ' — l’interface : à la chaîne seulement pour les commandes qui passent par la Prépa', () => {
    const e = etat();
    assert.equal(PC.passePar(e, 'TX/PC', 'preparation'), true);
    assert.equal(PC.passePar(e, 'RAM/YC', 'preparation'), false);
    assert.equal(PC.fusionneePar(e, 'preparation', 'TX/PC').id, 'mo');
    assert.equal(PC.fusionneePar(e, 'preparation', 'RAM/YC'), null, 'RAM YC n’est pas « faite à la chaîne » à la Prépa');
    assert.deepEqual(PC.chaines(e, null, null).map(g => g.commandes), [['TX/PC']]);
  });
}
module.exports = verifier;
if (require.main === module) verifier('..', 'v1');
