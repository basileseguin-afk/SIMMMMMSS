/* Un service qui travaille par compagnie (retours d'usage du 01/10 et du
 * 02/10 : l'armement ne travaille pas par BC, PC, Éco, SPML ; « une seule case
 * par compagnie, oui ou non » ; « toujours lié au handling » ; « dans le chemin
 * EZY, l'armement est présent : je veux sa case »). Minutes par vol selon la
 * compagnie. Même jeu pour la v1 et la v2 (tests/v2/categories.test.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');

function verifier(dossier, v) {
  const P = require(dossier + '/moteur/production.js');
  const vols = [{ id: 'AF1', cie: 'AF', sens: 'DEP', std: 600, yc: 100 }, { id: 'AF2', cie: 'AF', sens: 'DEP', std: 700, yc: 100 },
    { id: 'TX1', cie: 'TX', sens: 'DEP', std: 650, bc: 10 }, { id: 'QR1', cie: 'QR', sens: 'DEP', std: 900, yc: 50 },
    { id: 'AF-R', cie: 'AF', sens: 'ARR', std: 500, yc: 100 }];
  const categories = { armement: [{ id: 'ARM', nom: 'ARMEMENT', minutes: { '*': 10, AF: 15 } }] };
  // Les chemins : l'Éco porte l'armement, en branche à part reliée au handling ; la Business, non.
  const chemins = { parcours: [{ id: 'eco', nom: 'Éco', noeuds: ['prepa', 'armement', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }, { de: 'armement', vers: 'quais' }] },
    { id: 'bc', nom: 'Business', noeuds: ['prepa', 'quais'], liens: [{ de: 'prepa', vers: 'quais' }] }], parcoursCabine: { YC: 'eco', BC: 'bc' } };
  // Le handling charge AF, TX et QR — sa liste ne décide pas qui s'arme.
  const handling = { id: 'h', nom: 'Handling', service: 'quais', type: 'handling', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: false }, durees: { '*': 10 }, compagnies: ['AF', 'TX', 'QR'] };
  const montage = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [['AF/YC', 'TX/BC', 'QR/YC']], regime: { actif: false } };
  const armement = (lots, x) => ({ id: 'ar', nom: 'Armement', service: 'armement', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots, regime: { actif: false }, ...x });
  // EZY ajoutée à la main : une commande, aucun vol au programme.
  const ezy = { id: 'EZY/YC', cie: 'EZY', cabine: 'YC', pax: 0, vols: [], echeance: 1440 };

  test(v + ' — une case par compagnie dont un chemin passe par l’armement, avec ou sans vol', () => {
    const vols2 = vols.concat([{ id: 'DL1', cie: 'DL', sens: 'DEP', std: 800, yc: 50 }]);
    const classes = P.classesDeVols(vols2).concat([ezy]);
    const cies = P.compagniesParService(classes, P.routesDesClasses(classes, chemins));
    assert.deepEqual(cies('armement'), ['AF', 'DL', 'EZY', 'QR'], 'TX ne vole qu’en Business, dont le chemin ne passe pas par l’armement');
    const cl = P.classesCategories(vols2, categories, { compagnies: cies });
    assert.deepEqual(cl.map(c => [c.id, c.vols.length, c.minutes]), [['AF/@ARM', 2, 15], ['DL/@ARM', 1, 10], ['QR/@ARM', 1, 10], ['EZY/@ARM', 0, 10]],
      'un vol AF en Business et en Éco ne s’arme qu’une fois ; EZY a sa case, à 0 vol ; TX n’en a pas');
    assert.equal(cl[0].echeance, 600 - 45);
    assert.equal(cl.find(c => c.cie === 'EZY').echeance, 1440, 'sans vol : échéance en fin de journée');
    P.declarerCategories(categories);
    assert.equal(P.libelleClasse('AF/@ARM'), 'AF · ARMEMENT');
    assert.equal(P.enClair('AF/@ARM est en retard'), 'AF · ARMEMENT est en retard');
  });

  test(v + ' — le calcul : minutes par vol × vols ; sans minutes, il le dit', () => {
    const r = P.simuler({ vols, categories, ...chemins, bareme: { prepa: { '*/YC': 20, '*/BC': 20 } }, ateliers: [montage, handling, armement([['AF/@ARM'], ['QR/@ARM']])] });
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    const af = r.lots.find(l => l.classes.includes('AF/@ARM'));
    assert.equal(Math.round(af.fin - af.debut), 30, '2 vols AF × 15 min');
    assert.ok(!r.anomalies.some(a => a.code === 'parcours-trou'));
    const sans = P.simuler({ vols, categories: { armement: [{ id: 'ARM', nom: 'ARMEMENT', minutes: { AF: 15 } }] }, ...chemins, ateliers: [montage, handling, armement([['AF/@ARM', 'QR/@ARM']])] });
    assert.match(sans.anomalies.find(a => a.code === 'bareme-classe').message, /pas de minutes par vol pour QR/);
  });

  test(v + ' — une compagnie ajoutée sans vol : sa case se coche, à 0 minute ; le calcul tourne', () => {
    const r = P.simuler({ vols, classes: P.classesDeVols(vols).concat([ezy]), categories, ...chemins, bareme: { prepa: { '*/YC': 20, '*/BC': 20 } },
      ateliers: [montage, handling, armement([['AF/@ARM'], ['EZY/@ARM']])] });
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    assert.ok(r.classes.some(c => c.id === 'EZY/@ARM'), 'EZY a sa case');
    assert.ok(!r.anomalies.some(a => /EZY\/@ARM/.test(a.message) && a.code === 'lot'), 'la case est connue');
    // Une compagnie que personne ne prépare n'est pas chargée.
    const vols2 = vols.concat([{ id: 'DL1', cie: 'DL', sens: 'DEP', std: 800, yc: 50 }]);
    const r2 = P.simuler({ vols: vols2, categories, ...chemins, bareme: { prepa: { '*/YC': 20, '*/BC': 20 } }, ateliers: [montage, { ...handling, compagnies: [] }, armement([['AF/@ARM']])] });
    assert.ok(r2.ok);
    assert.ok(!r2.lots.some(l => l.handling && l.vol === 'DL1'), 'le handling ne charge pas DL : rien n’est préparé pour elle');
    assert.ok(r2.lots.some(l => l.handling && l.vol === 'AF1'), 'il charge AF');
  });

  test(v + ' — le handling attend l’armement du vol', () => {
    const mo = { id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [['AF/YC']], regime: { actif: false } };
    const r = P.simuler({ vols: vols.filter(x => x.cie === 'AF'), categories, bareme: { prepa: { '*/YC': 20 } }, ...chemins,
      ateliers: [mo, handling, armement([['AF/@ARM']], { debut: '09:00' })] });
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
    // En heures par vol (08/10) ; l'aller-retour retrouve les minutes du site.
    const parCie = f.find(x => x.nom === 'Par compagnie');
    assert.deepEqual(parCie.lignes[0], ['Service', 'Compagnie', 'Heures par vol']);
    assert.deepEqual(parCie.lignes.slice(1), [['ARMEMENT', 'toutes', 0.1667], ['ARMEMENT', 'AF', 0.25]]);
    const lu = E.classeurVersAteliers(await T.lireClasseur(T.ecrireClasseur(f)), etat, ctx);
    assert.deepEqual(lu.ajouteesAuto, [], 'une case d’armement n’est pas une classe à ajouter');
    assert.deepEqual(lu.etat.categories, categories);
    // Un classeur d'avant, en « Minutes par vol », se relit toujours en minutes.
    const ancien = f.map(x => x.nom !== 'Par compagnie' ? x
      : { ...x, lignes: [['Service', 'Compagnie', 'Minutes par vol'], ['ARMEMENT', 'toutes', 10], ['ARMEMENT', 'AF', 15]] });
    assert.deepEqual(E.classeurVersAteliers(await T.lireClasseur(T.ecrireClasseur(ancien)), etat, ctx).etat.categories, categories);
    assert.deepEqual(lu.etat.ateliers[0].lots, [['AF/@ARM'], ['QR/@ARM']]);
  });
}
module.exports = verifier;
if (require.main === module) verifier('..', 'v1');
