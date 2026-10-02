/* Audit de la logique des flux (02/10) : ce que le calcul doit refuser de faire.
 *   - préparer une commande dans un service que son chemin ne traverse pas ;
 *   - charger un vol avec son seul armement, sans aucun repas préparé.
 * v1 et v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [dossier, v] of [['..', 'v1'], ['../v2', 'v2']]) {
  const P = require(dossier + '/moteur/production.js');
  const { VOLS } = require(dossier + '/vols-demo.js');
  const classes = P.classesDeVols(VOLS, { delaiChargement: 45 });
  const tous = { BC: 'p', YC: 'p', PC: 'p', CREW: 'p', SPML: 'p' };
  const equipe = (id, service, lots, x) => ({ id, nom: id, service, type: 'manuel', debut: '04:00', jour: 0, personnes: 3, pauses: [], lots, regime: { actif: true }, ...x });
  const quais = { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '04:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true }, durees: { '*': 20 } };

  test(v + ' — cochée hors de son chemin : pas préparée là, et c’est dit', () => {
    // Le chemin de l'Éco ne passe pas par la cuisine ; la cuisine la coche quand même.
    const parcours = [{ id: 'p', nom: 'p', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] },
      { id: 'e', nom: 'e', noeuds: ['prepa'], liens: [] }];
    const r = P.simuler({ vols: VOLS, classes, parcours, parcoursCabine: { ...tous, YC: 'e' }, bareme: { cuisine: { '*/BC': 30, '*/YC': 30 }, prepa: { '*/BC': 10, '*/YC': 10 } },
      ateliers: [equipe('cu', 'cuisine', [['AF/BC', 'AF/YC']]), equipe('mo', 'prepa', [['AF/BC', 'AF/YC']])] });
    const cu = r.lots.filter(l => l.atelier === 'cu');
    assert.deepEqual(cu.flatMap(l => l.classes), ['AF/BC'], 'la cuisine ne prépare que la Business');
    const a = r.anomalies.find(x => x.code === 'hors-parcours');
    assert.ok(a, 'c’est dit');
    assert.match(a.message, /AF\/YC est cochée ici, mais son chemin ne passe pas par « cuisine » : elle n’est pas préparée ici/);
    assert.equal(cu[0].hommeMinutes, 30 * classes.find(c => c.id === 'AF/BC').vols.length, 'seulement les minutes de la Business');
  });

  test(v + ' — un vol ne part pas avec son seul armement', () => {
    const parcours = [{ id: 'p', nom: 'p', noeuds: ['prepa', 'armement', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }, { de: 'armement', vers: 'quais' }] }];
    const r = P.simuler({ vols: VOLS, classes, parcours, parcoursCabine: tous, bareme: { prepa: { '*/YC': 20 } },
      categories: { armement: [{ id: 'ARM', nom: 'Armement', minutes: { '*': 10 } }] },
      ateliers: [equipe('mo', 'prepa', [['AF/YC']]), equipe('ar', 'armement', [['AF/@ARM', 'TX/@ARM']]), quais] });
    const charges = r.lots.filter(l => l.handling);
    assert.ok(!charges.some(l => l.cie === 'TX'), 'TX : armée, mais aucun repas préparé — pas chargée');
    assert.ok(charges.filter(l => l.cie === 'AF').every(l => l.classes.includes('AF/@ARM') && l.classes.includes('AF/YC')), 'AF : chargée après ses repas ET son armement');
  });
}
