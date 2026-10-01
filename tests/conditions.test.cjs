/* L'équipe qui ne travaille que certains jours (règle ⚡, retour d'usage du
 * 01/10) : « s'il y a tant de vols Air France, une personne est consacrée au
 * montage AF ; sinon elle est rattachée à un autre atelier ». Le même jeu de
 * tests vérifie la version 1 et la version 2 (tests/v2/conditions.test.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');

function verifier(dossier, nomVersion) {
  const P = require(dossier + '/moteur/production.js');
  // ateliers.js est fait pour la page : il lit le moteur et les parcours sur l'objet global.
  globalThis.MoteurProduction = P; globalThis.OrlyParcours = require(dossier + '/parcours.js');
  const A = require(dossier + '/ateliers.js');
  const E = require(dossier + '/echanges.js');
  const T = require(dossier + '/tableur.js');

  // n vols AF (100 YC chacun) et 2 vols TX.
  const vols = n => Array.from({ length: n }, (_, i) => ({ id: 'AF' + i, cie: 'AF', sens: 'DEP', std: 600 + i * 30, yc: 100 }))
    .concat([{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 620, yc: 80 }, { id: 'TX2', cie: 'TX', sens: 'DEP', std: 900, yc: 80 },
      { id: 'AF-R', cie: 'AF', sens: 'ARR', std: 500, yc: 100 }]);
  const equipes = () => [
    { id: 'af', nom: 'Montage AF', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [],
      lots: [['AF/YC']], regime: { actif: false }, condition: { cie: 'AF', seuil: 6, mesure: 'vols', sinon: 'gen' } },
    { id: 'gen', nom: 'Montage général', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [],
      lots: [['TX/YC']], regime: { actif: false } },
    { id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '03:00', jour: 0, personnes: 3, pauses: [], lots: [], regime: { actif: false } }
  ];
  const BAREME = { prepa: { '*/YC': 30 }, cuisine: { '*/YC': 10 } };
  const jouer = (n, at) => P.simuler({ vols: vols(n), ateliers: at || equipes(), bareme: BAREME, liaisons: [] });

  test(nomVersion + ' — ce que compte la règle : les départs de la compagnie, ou leurs repas', () => {
    const cl = P.classesDeVols(vols(4));
    assert.equal(P.compteDuJour(cl, 'AF', 'vols'), 4, 'un retour ne compte pas');
    assert.equal(P.compteDuJour(cl, 'af', 'vols'), 4);
    assert.equal(P.compteDuJour(cl, 'AF', 'repas'), 400);
    assert.equal(P.compteDuJour(cl, '*', 'vols'), 6, 'toutes les compagnies');
    assert.equal(P.compteDuJour(cl, 'QR', 'vols'), 0);
  });

  test(nomVersion + ' — assez de vols : l’équipe travaille, rien ne bouge', () => {
    const r = jouer(6);
    assert.ok(r.ok);
    assert.deepEqual(r.ateliers.map(a => a.id).sort(), ['af', 'cu', 'gen']);
    const c = r.conditions[0];
    assert.equal(c.compte, 6); assert.equal(c.remplie, true); assert.equal(c.vers, null);
    assert.equal(r.ateliers.find(a => a.id === 'gen').personnes, 2);
  });

  test(nomVersion + ' — pas assez : ses commandes et sa personne passent à l’autre équipe', () => {
    const r = jouer(4);
    assert.ok(r.ok, JSON.stringify(r.anomalies));
    assert.ok(!r.ateliers.some(a => a.id === 'af'), 'elle ne travaille pas');
    const gen = r.ateliers.find(a => a.id === 'gen');
    assert.equal(gen.personnes, 3, 'sa personne renforce le montage général');
    assert.deepEqual(gen.lots.map(l => l.classes ? l.classes.join('+') : l.nom).length, 2);
    assert.deepEqual(r.conditions[0], { atelier: 'af', nom: 'Montage AF', cie: 'AF', mesure: 'vols', seuil: 6, compte: 4, remplie: false,
      sinon: 'gen', renfort: 'gen', absorbe: false, vers: 'gen', renforce: 'gen', personnes: 1 });
    // Toutes les commandes sont faites : AF par le montage général.
    assert.equal(r.indicateurs.pasFinies, 0);
    assert.ok(r.lots.some(l => l.atelier === 'gen' && /AF\/YC/.test(l.classe || l.nom || '')) || r.parClasse['AF/YC'].fin != null);
  });

  test(nomVersion + ' — les commandes reprises s’insèrent par échéance', () => {
    const at = equipes();
    at[1].lots = [['TX/YC'], ['QR/YC']];
    const { ateliers } = P.appliquerConditions(at, P.classesDeVols(vols(2).concat([{ id: 'QR1', cie: 'QR', sens: 'DEP', std: 1200, yc: 50 }])));
    // AF part à 10:00, TX à 10:20, QR à 20:00 : AF passe devant.
    assert.deepEqual(ateliers.find(a => a.id === 'gen').lots, [['AF/YC'], ['TX/YC'], ['QR/YC']]);
  });

  test(nomVersion + ' — les personnes peuvent aller ailleurs que les commandes', () => {
    const at = equipes(); at[0].condition.renfort = 'cu';
    const r = jouer(2, at);
    assert.equal(r.ateliers.find(a => a.id === 'gen').personnes, 2);
    assert.equal(r.ateliers.find(a => a.id === 'cu').personnes, 4);
    assert.equal(r.conditions[0].renforce, 'cu');
  });

  test(nomVersion + ' — l’équipe qui reprend peut absorber la charge, sans les personnes', () => {
    const at = equipes(); at[0].condition.absorbe = true;
    const r = jouer(4, at);
    assert.ok(r.ok);
    const gen = r.ateliers.find(a => a.id === 'gen');
    assert.equal(gen.personnes, 2, 'ses personnes ne viennent pas');
    assert.equal(gen.lots.length, 2, 'mais ses commandes, si');
    assert.equal(r.conditions[0].absorbe, true);
    assert.equal(r.conditions[0].renforce, null);
    assert.equal(r.indicateurs.pasFinies, 0);
    // Moins de bras pour plus de travail : le montage général finit plus tard qu'avec le renfort.
    const avecRenfort = jouer(4);
    assert.ok(gen.fin >= avecRenfort.ateliers.find(a => a.id === 'gen').fin);
  });

  test(nomVersion + ' — en chaîne, sans tourner en rond ; sans issue, l’équipe garde ses commandes', () => {
    // Deux équipes qui se renvoient l'une à l'autre, toutes deux sous leur seuil :
    // la première n'a nulle part où aller et garde ses commandes ; l'autre la rejoint.
    const at = equipes();
    at[1].condition = { cie: 'AF', seuil: 10, mesure: 'vols', sinon: 'af' };
    const r = jouer(2, at);
    assert.ok(r.ok);
    assert.equal(r.conditions[0].sansIssue, true);
    assert.equal(r.conditions[1].vers, 'af');
    assert.deepEqual(r.ateliers.filter(a => a.service === 'prepa').map(a => [a.id, a.personnes]), [['af', 3]]);
    assert.equal(r.indicateurs.pasFinies, 0, 'aucune commande perdue');
    // Une chaîne qui aboutit : af → gen (au repos) → g2.
    const at2 = equipes();
    at2[1].condition = { cie: 'TX', seuil: 5, mesure: 'vols', sinon: 'g2' };
    at2.push({ id: 'g2', nom: 'Montage soir', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: false } });
    const r2 = jouer(2, at2);
    const g2 = r2.ateliers.find(a => a.id === 'g2');
    assert.equal(g2.personnes, 4);
    assert.equal(r2.ateliers.filter(a => a.service === 'prepa').length, 1);
    assert.equal(r2.indicateurs.pasFinies, 0);
  });

  test(nomVersion + ' — l’enregistrement garde la règle, et retire celle qui ne tient pas', () => {
    const etat = { schema: 'ory-ateliers', version: 1, ateliers: equipes(), exclues: [], ajoutees: [] };
    etat.ateliers[0].condition = { cie: ' af ', seuil: '6', mesure: 'repas', sinon: 'gen', renfort: 'gen', bidule: 1 };
    let v = A.valider(etat);
    assert.deepEqual(v.ateliers[0].condition, { cie: 'AF', seuil: 6, mesure: 'repas', sinon: 'gen' });
    etat.ateliers[0].condition = { cie: 'AF', seuil: 6, sinon: 'gen', renfort: 'cu', absorbe: true };
    assert.deepEqual(A.valider(etat).ateliers[0].condition, { cie: 'AF', seuil: 6, mesure: 'vols', sinon: 'gen', absorbe: true }, 'absorber l’emporte');
    etat.ateliers[0].condition = { cie: 'AF', seuil: 6, sinon: 'cu' };
    assert.equal(A.valider(etat).ateliers[0].condition, undefined, 'une équipe d’un autre service ne reprend pas les commandes');
    etat.ateliers[0].condition = { cie: 'AF', seuil: 0, sinon: 'gen' };
    assert.equal(A.valider(etat).ateliers[0].condition, undefined, 'au moins 1');
    etat.ateliers[0].condition = { cie: 'AF', seuil: 3, sinon: 'gen', renfort: 'disparue' };
    v = A.valider(etat);
    assert.equal(v.ateliers[0].condition.renfort, undefined);
    // L'équipe qui reprend est supprimée : la règle tombe avec elle.
    etat.ateliers = etat.ateliers.filter(a => a.id !== 'gen');
    assert.equal(A.valider(etat).ateliers[0].condition, undefined);
  });

  test(nomVersion + ' — Excel : « AF ≥ 6 vols », sinon une équipe nommée', async () => {
    // Les parcours types (ajoutés par l'enregistrement) passent par tous ces services.
    const services = [{ id: 'appros', nom: 'APPROS' }, { id: 'decontam', nom: 'LÉGUMERIE' }, { id: 'cuisine', nom: 'CUISINE' },
      { id: 'preparation', nom: 'PRÉPA' }, { id: 'prepa', nom: 'MONTAGE' }, { id: 'plonge', nom: 'PLONGE' },
      { id: 'dotation', nom: 'DOTATION' }, { id: 'magasin', nom: 'MAGASIN' }];
    const etat = A.valider({ schema: 'ory-ateliers', version: 1, ateliers: equipes(), exclues: [], ajoutees: [] });
    etat.ateliers[0].condition.renfort = 'cu';
    const classes = P.classesDeVols(vols(6));
    const ctx = { services, programme: classes, classes: classes.map(c => ({ ...c, origine: 'programme' })) };
    const f = E.ateliersVersClasseur(etat, ctx);
    const tete = f[0].lignes[0], ligne = f[0].lignes.find(l => l[0] === 'Montage AF');
    assert.equal(ligne[tete.indexOf('Ne travaille que si')], 'AF ≥ 6 vols');
    assert.equal(ligne[tete.indexOf('Sinon, commandes à')], 'Montage général');
    assert.equal(ligne[tete.indexOf('Sinon, personnes à')], 'Cuisine');
    const lu = E.classeurVersAteliers(await T.lireClasseur(T.ecrireClasseur(f)), etat, ctx).etat;
    assert.deepEqual(lu.ateliers.find(a => a.nom === 'Montage AF').condition, { cie: 'AF', seuil: 6, mesure: 'vols', sinon: 'gen', renfort: 'cu' });
    // Saisi à la main dans Excel : « toutes >= 300 repas ».
    const f2 = f.map(x => x.nom !== f[0].nom ? x : { ...x, lignes: x.lignes.map(l => (l[0] === 'Montage AF'
      ? l.map((v, i) => (i === tete.indexOf('Ne travaille que si') ? 'toutes >= 300 repas' : i === tete.indexOf('Sinon, personnes à') ? null : v)) : l)) });
    const lu2 = E.classeurVersAteliers(f2, etat, ctx).etat;
    assert.deepEqual(lu2.ateliers.find(a => a.nom === 'Montage AF').condition, { cie: '*', seuil: 300, mesure: 'repas', sinon: 'gen' });
    // « aucune » : l'équipe qui reprend absorbe la charge.
    const f4 = f.map(x => x.nom !== f[0].nom ? x : { ...x, lignes: x.lignes.map(l => (l[0] === 'Montage AF'
      ? l.map((v, i) => (i === tete.indexOf('Sinon, personnes à') ? 'aucune' : v)) : l)) });
    const lu4 = E.classeurVersAteliers(f4, etat, ctx).etat.ateliers.find(a => a.nom === 'Montage AF');
    assert.deepEqual(lu4.condition, { cie: 'AF', seuil: 6, mesure: 'vols', sinon: 'gen', absorbe: true });
    assert.equal(E.ateliersVersClasseur({ ...etat, ateliers: etat.ateliers.map(a => (a.id === 'af' ? lu4 : a)) }, ctx)[0].lignes
      .find(l => l[0] === 'Montage AF')[tete.indexOf('Sinon, personnes à')], 'aucune');
    // Une équipe inconnue est signalée.
    const f3 = f.map(x => x.nom !== f[0].nom ? x : { ...x, lignes: x.lignes.map(l => (l[0] === 'Montage AF'
      ? l.map((v, i) => (i === tete.indexOf('Sinon, commandes à') ? 'Personne' : v)) : l)) });
    assert.throws(() => E.classeurVersAteliers(f3, etat, ctx), /atelier inconnu « Personne »/);
  });
}

module.exports = verifier;
if (require.main === module) verifier('..', 'v1');
