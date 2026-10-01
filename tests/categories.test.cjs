/* Un service qui travaille par catégories propres (retour d'usage du 01/10 :
 * l'armement ne travaille pas par BC, PC, Éco, SPML, mais par trolleys bar,
 * matériel thé/café…), avec des minutes par vol selon la compagnie. Même jeu
 * pour la v1 et la v2 (tests/v2/categories.test.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');

function verifier(dossier, v) {
  const P = require(dossier + '/moteur/production.js');
  const vols = [{ id: 'AF1', cie: 'AF', sens: 'DEP', std: 600, yc: 100 }, { id: 'AF2', cie: 'AF', sens: 'DEP', std: 700, yc: 100 },
    { id: 'TX1', cie: 'TX', sens: 'DEP', std: 650, yc: 80 }, { id: 'AF-R', cie: 'AF', sens: 'ARR', std: 500, yc: 100 }];
  const categories = { armement: [{ id: 'TB', nom: 'Trolleys bar', minutes: { '*': 10, AF: 15 } }, { id: 'TH', nom: 'Thé/café', minutes: { TX: 5 } }] };
  const armement = (lots, x) => ({ id: 'ar', nom: 'Armement', service: 'armement', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots, regime: { actif: false }, ...x });

  test(v + ' — les commandes d’une catégorie : chaque départ d’une compagnie qui a des minutes', () => {
    const cl = P.classesCategories(vols, categories);
    assert.deepEqual(cl.map(c => [c.id, c.vols.length, c.minutes]), [['AF/@TB', 2, 15], ['TX/@TB', 1, 10], ['TX/@TH', 1, 5]]);
    assert.equal(cl[0].echeance, 600 - 45);
    assert.equal(cl.find(c => c.id === 'TX/@TH').service, 'armement');
    P.declarerCategories(categories);
    assert.equal(P.libelleClasse('AF/@TB'), 'AF · Trolleys bar');
    assert.equal(P.enClair('AF/@TB est en retard'), 'AF · Trolleys bar est en retard');
  });

  test(v + ' — le calcul : minutes par vol × vols, dans les équipes qui les cochent', () => {
    const r = P.simuler({ vols, categories, ateliers: [armement([['AF/@TB'], ['TX/@TB', 'TX/@TH']])] });
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    assert.deepEqual(r.anomalies, [], 'pas de barème demandé pour l’armement');
    const af = r.lots.find(l => l.classes.includes('AF/@TB')), tx = r.lots.find(l => l.classes.includes('TX/@TB'));
    assert.equal(Math.round(af.fin - af.debut), 30, '2 vols AF × 15 min');
    assert.equal(Math.round(tx.fin - tx.debut), 15, 'TX : 10 + 5 min');
    assert.equal(r.parClasse['AF/@TB'].aHeure, true);
  });

  test(v + ' — sur le chemin des commandes, l’armement n’est pas un trou ; le handling l’attend', () => {
    const parcours = [{ id: 'e', nom: 'Éco', noeuds: ['prepa', 'armement', 'quais'], liens: [{ de: 'prepa', vers: 'armement' }, { de: 'armement', vers: 'quais' }] }];
    const mo = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [['AF/YC', 'TX/YC']], regime: { actif: false } };
    const h = { id: 'h', nom: 'Handling', service: 'quais', type: 'handling', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: false }, durees: { '*': 10 } };
    // L'armement commence tard : le chargement attend ses trolleys.
    const r = P.simuler({ vols, categories, bareme: { prepa: { '*/YC': 20 } }, parcours, parcoursCabine: { YC: 'e' },
      ateliers: [mo, h, armement([['AF/@TB'], ['TX/@TB', 'TX/@TH']], { debut: '09:00' })] });
    assert.ok(r.ok);
    assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou'), JSON.stringify(r.anomalies.map(a => a.message)));
    const charge = r.lots.find(l => l.handling && l.vol === 'AF1') || r.lots.find(l => l.handling);
    const tb = r.lots.find(l => l.classes.includes('AF/@TB'));
    assert.ok(charge.debut >= tb.fin, 'le vol est chargé après ses trolleys bar');
  });

  test(v + ' — Excel : la feuille « Catégories », et « AF/@TB » dans les fabrications', async () => {
    globalThis.MoteurProduction = P; globalThis.OrlyParcours = require(dossier + '/parcours.js');
    const A = require(dossier + '/ateliers.js'), E = require(dossier + '/echanges.js'), T = require(dossier + '/tableur.js');
    const services = [{ id: 'appros', nom: 'APPROS' }, { id: 'decontam', nom: 'LÉGUMERIE' }, { id: 'cuisine', nom: 'CUISINE' },
      { id: 'preparation', nom: 'PRÉPA' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' },
      { id: 'dotation', nom: 'DOTATION' }, { id: 'magasin', nom: 'MAGASIN' }, { id: 'armement', nom: 'ARMEMENT' }];
    const etat = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: [armement([['AF/@TB'], ['TX/@TB', 'TX/@TH']])], exclues: [], ajoutees: [], categories });
    assert.deepEqual(etat.categories, categories, 'l’enregistrement garde les catégories');
    const classes = P.classesDeVols(vols);
    const ctx = { services, programme: classes, classes: classes.map(c => ({ ...c, origine: 'programme' })) };
    const f = E.ateliersVersClasseur(etat, ctx);
    const feuille = f.find(x => x.nom === 'Catégories');
    assert.deepEqual(feuille.lignes.slice(1), [['ARMEMENT', 'Trolleys bar', 'TB', 'toutes', 10], ['ARMEMENT', 'Trolleys bar', 'TB', 'AF', 15], ['ARMEMENT', 'Thé/café', 'TH', 'TX', 5]]);
    const lu = E.classeurVersAteliers(await T.lireClasseur(T.ecrireClasseur(f)), etat, ctx);
    assert.deepEqual(lu.ajouteesAuto, [], 'une catégorie n’est pas une classe à ajouter');
    assert.deepEqual(lu.etat.categories, categories);
    assert.deepEqual(lu.etat.ateliers[0].lots, [['AF/@TB'], ['TX/@TB', 'TX/@TH']]);
  });
}
module.exports = verifier;
if (require.main === module) verifier('..', 'v1');
