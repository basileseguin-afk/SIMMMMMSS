/* Un service qui travaille par compagnie (retour d'usage du 01/10 : l'armement
 * ne travaille pas par BC, PC, Éco, SPML ; « une seule case par compagnie, oui
 * ou non, liée au chemin »). Minutes par vol selon la compagnie. Même jeu pour
 * la v1 et la v2 (tests/v2/categories.test.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');

function verifier(dossier, v) {
  const P = require(dossier + '/moteur/production.js');
  const vols = [{ id: 'AF1', cie: 'AF', sens: 'DEP', std: 600, yc: 100 }, { id: 'AF2', cie: 'AF', sens: 'DEP', std: 700, yc: 100 },
    { id: 'TX1', cie: 'TX', sens: 'DEP', std: 650, bc: 10 }, { id: 'QR1', cie: 'QR', sens: 'DEP', std: 900, yc: 50 },
    { id: 'AF-R', cie: 'AF', sens: 'ARR', std: 500, yc: 100 }];
  const categories = { armement: [{ id: 'ARM', nom: 'ARMEMENT', minutes: { '*': 10, AF: 15 } }] };
  // L'Éco passe par l'armement ; le Business (TX) non.
  const chemins = { parcours: [{ id: 'eco', nom: 'Éco', noeuds: ['prepa', 'armement', 'quais'], liens: [{ de: 'prepa', vers: 'armement' }, { de: 'armement', vers: 'quais' }] },
    { id: 'bc', nom: 'Business', noeuds: ['prepa', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }] }], parcoursCabine: { YC: 'eco', BC: 'bc' } };
  const armement = (lots, x) => ({ id: 'ar', nom: 'Armement', service: 'armement', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots, regime: { actif: false }, ...x });

  test(v + ' — une case par compagnie, seulement si son chemin passe par l’armement', () => {
    const passe = P.passeParVol(P.classesDeVols(vols), chemins);
    assert.equal(passe('armement', { id: 'AF1' }), true);
    assert.equal(passe('armement', { id: 'TX1' }), false, 'le Business ne passe pas par l’armement');
    const cl = P.classesCategories(vols, categories, { passe });
    assert.deepEqual(cl.map(c => [c.id, c.vols.length, c.minutes]), [['AF/@ARM', 2, 15], ['QR/@ARM', 1, 10]]);
    assert.equal(cl[0].echeance, 600 - 45);
    P.declarerCategories(categories);
    assert.equal(P.libelleClasse('AF/@ARM'), 'AF · ARMEMENT');
    assert.equal(P.enClair('AF/@ARM est en retard'), 'AF · ARMEMENT est en retard');
  });

  test(v + ' — le calcul : minutes par vol × vols ; sans minutes, il le dit', () => {
    const r = P.simuler({ vols, categories, ...chemins, bareme: { prepa: { '*/YC': 20, '*/BC': 20 } }, ateliers: [armement([['AF/@ARM'], ['QR/@ARM']])] });
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    const af = r.lots.find(l => l.classes.includes('AF/@ARM'));
    assert.equal(Math.round(af.fin - af.debut), 30, '2 vols AF × 15 min');
    assert.ok(!r.classes.some(c => c.id === 'TX/@ARM'), 'pas de case pour TX');
    assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou' && a.service === 'armement'), 'l’armement n’est pas un trou sur le chemin des repas');
    const sans = P.simuler({ vols, categories: { armement: [{ id: 'ARM', nom: 'ARMEMENT', minutes: { AF: 15 } }] }, ...chemins, ateliers: [armement([['AF/@ARM', 'QR/@ARM']])] });
    assert.match(sans.anomalies.find(a => a.code === 'bareme-classe').message, /pas de minutes par vol pour QR/);
  });

  test(v + ' — le handling attend l’armement du vol', () => {
    const mo = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [['AF/YC']], regime: { actif: false } };
    const h = { id: 'h', nom: 'Handling', service: 'quais', type: 'handling', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: false }, durees: { '*': 10 } };
    const r = P.simuler({ vols: vols.filter(x => x.cie === 'AF'), categories, bareme: { prepa: { '*/YC': 20 } }, ...chemins,
      ateliers: [mo, h, armement([['AF/@ARM']], { debut: '09:00' })] });
    assert.ok(r.ok);
    const charge = r.lots.find(l => l.handling && l.vol === 'AF1'), arm = r.lots.find(l => l.classes.includes('AF/@ARM'));
    assert.ok(charge.debut >= arm.fin, 'le vol est chargé après son armement');
  });

  test(v + ' — Excel : la feuille « Par compagnie », et « AF/@ARM » dans les fabrications', async () => {
    globalThis.MoteurProduction = P; globalThis.OrlyParcours = require(dossier + '/parcours.js');
    const A = require(dossier + '/ateliers.js'), E = require(dossier + '/echanges.js'), T = require(dossier + '/tableur.js');
    const services = [{ id: 'appros', nom: 'APPROS' }, { id: 'decontam', nom: 'LÉGUMERIE' }, { id: 'cuisine', nom: 'CUISINE' },
      { id: 'preparation', nom: 'PRÉPA' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' },
      { id: 'dotation', nom: 'DOTATION' }, { id: 'magasin', nom: 'MAGASIN' }, { id: 'armement', nom: 'ARMEMENT' }];
    const etat = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [armement([['AF/@ARM'], ['QR/@ARM']])], exclues: [], ajoutees: [], categories });
    assert.deepEqual(etat.categories, categories, 'l’enregistrement garde le réglage');
    const classes = P.classesDeVols(vols);
    const ctx = { services, programme: classes, classes: classes.map(c => ({ ...c, origine: 'programme' })) };
    const f = E.ateliersVersClasseur(etat, ctx);
    assert.deepEqual(f.find(x => x.nom === 'Par compagnie').lignes.slice(1), [['ARMEMENT', 'toutes', 10], ['ARMEMENT', 'AF', 15]]);
    const lu = E.classeurVersAteliers(await T.lireClasseur(T.ecrireClasseur(f)), etat, ctx);
    assert.deepEqual(lu.ajouteesAuto, [], 'une case d’armement n’est pas une classe à ajouter');
    assert.deepEqual(lu.etat.categories, categories);
    assert.deepEqual(lu.etat.ateliers[0].lots, [['AF/@ARM'], ['QR/@ARM']]);
  });
}
module.exports = verifier;
if (require.main === module) verifier('..', 'v1');
