/* Banc d'essai, évolution 10 (b) — le calcul d'une période (v1,
 * moteur/periode.js) : un programme daté, joué jour après jour, avec ce qui
 * passe d'un jour au suivant (le sale non lavé, le stock propre, les départs
 * de la veille en « J+1 ») et le bilan par jour de travail. Données fictives :
 * l'unité de la référence de non-régression (NORD, SUD, EST, OUEST). */
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const VOLS = S.args.vols;
const JOURS = ['2026-11-02', '2026-11-03', '2026-11-04'];
const json = x => JSON.stringify(x);
/** Un programme daté : les vols de l'unité fictive chaque jour ; `sauf` : par jour, les vols retirés. */
const programme = (jours = JOURS, sauf = {}) => jours.flatMap(d => VOLS.filter(v => !(sauf[d] || []).includes(v.id)).map(v => ({ ...v, date: d })));
const periode = (vols, options = S.options) => PE.depuisSauvegarde(S.sauvegarde, vols, options, { detail: true });
/** La journée telle que l'outil d'une journée la joue, avec les options que la période donne pour la rejouer. */
const seule = (p, j, vols, options = S.options) => J.jouer(J.argumentsDeLaJournee(S.sauvegarde, PE.volsDuJour(vols, j.date), PE.optionsDeRejeu(options, j.entree)));

test('une période d’un jour est la journée d’aujourd’hui, champ par champ', () => {
  const p = periode(programme(['2026-11-02']));
  assert.equal(p.journees.length, 1);
  assert.deepEqual(p.journees[0].entree, {}, 'rien de la veille');
  assert.equal(json(p.journees[0].resultat), json(J.jouer(J.argumentsDeLaJournee(S.sauvegarde, VOLS, S.options))));
});

test('chaque journée d’une période de 3 jours est celle de l’outil d’une journée, avec ce que la veille lui laisse', () => {
  const vols = programme(JOURS, { '2026-11-03': ['NO101'] });
  const p = periode(vols);
  assert.deepEqual(p.journees.map(j => j.date), JOURS);
  for (const j of p.journees) assert.equal(json(j.resultat), json(seule(p, j, vols)), j.date);
  assert.deepEqual([p.periode.debut, p.periode.fin, p.periode.jours], ['2026-11-02', '2026-11-04', 3]);
});

test('la page rejoue une journée de la période d’après son entrée (jouerAvecEntree) : le même résultat, décalage compris', () => {
  const vols = programme(JOURS, { '2026-11-03': ['NO101'] });
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  for (const decalage of [0, 15]) {
    const p = PE.simulerPeriode(u, vols, { delaiChargement: 45, decalage, detail: true });
    for (const j of p.journees) {
      // Comme la page : les vols du jour déjà décalés, ceux de la veille décalés de même.
      const entree = j.entree.volsVeille ? { ...j.entree, volsVeille: J.volsDecales(j.entree.volsVeille, decalage) } : j.entree;
      const r = PE.jouerAvecEntree(u, J.volsDecales(PE.volsDuJour(vols, j.date), decalage), entree, { delaiChargement: 45 });
      assert.equal(json(r.resultat), json(j.resultat), j.date + ', décalage ' + decalage);
      assert.deepEqual(r.entree, entree);
    }
  }
  // Une entrée vide (le premier jour) : la journée d'aujourd'hui.
  const jour = PE.volsDuJour(vols, JOURS[0]);
  assert.equal(json(PE.jouerAvecEntree(u, jour, {}, { delaiChargement: 45 }).resultat), json(J.jouer(J.argumentsDeLUnite(u, jour, { delaiChargement: 45 }))));
});

test('un vol non lavé le jour 1 est lavé le jour 2 ; le stock propre passe au lendemain quand la boucle du matériel est active', () => {
  const p = periode(programme());
  const [j1, j2] = p.journees;
  const restes = j1.resultat.saleFinal;
  assert.ok(restes.length > 0, 'du sale reste le soir du jour 1');
  assert.deepEqual(j2.entree.saleInitial, restes);
  const lavesJ2 = j2.resultat.lots.filter(l => l.retourVol).map(l => l.vol);
  for (const r of restes) assert.ok(lavesJ2.includes(r.vol + ' (veille)'), r.vol + ' lavé le jour 2');
  assert.equal(j2.extrait.saleInitial, j1.extrait.saleFinal);
  // Le stock propre de fin de journée devient le stock initial du lendemain.
  assert.equal(j2.resultat.materiel.stockInitial, j1.resultat.materiel.restePropre);
  assert.deepEqual(j2.entree.ateliers, { materiel: { stockInitial: j1.resultat.materiel.restePropre } });
  // Sans la boucle du matériel : rien à reporter.
  const sans = periode(programme(), { ...S.options, ateliers: { materiel: { actif: false } } });
  assert.ok(sans.journees.every(j => j.resultat.materiel === null && !j.entree.ateliers));
});

test('« J+1 » : le sale du jour 2 vient des départs du jour 1 ; le jour 1 reste comme aujourd’hui', () => {
  // NO101 part le jour 1, pas le jour 2 : son matériel revient le jour 2, pas le jour 3.
  const vols = programme(JOURS, { '2026-11-03': ['NO101'] });
  const p = periode(vols);
  const retours = j => j.resultat.lots.filter(l => l.retourVol && /\(J-1\)$/.test(l.vol)).map(l => l.vol);
  assert.ok(retours(p.journees[1]).includes('NO101 (J-1)'), 'jour 2 : le matériel de NO101, parti la veille');
  assert.ok(!retours(p.journees[2]).includes('NO101 (J-1)'), 'jour 3 : NO101 n’est pas parti le jour 2');
  assert.deepEqual(p.journees[1].entree.volsVeille.map(v => v.id), PE.volsDuJour(vols, '2026-11-02').map(v => v.id));
  // Le jour 1 : la règle d'aujourd'hui (ses propres départs).
  assert.ok(retours(p.journees[0]).includes('NO101 (J-1)'));
  assert.equal(p.journees[0].entree.volsVeille, undefined);
  // Une autre source de retours : pas de vols de la veille.
  const prog = periode(vols, { ...S.options, ateliers: { materiel: { retours: 'programme' } } });
  assert.ok(prog.journees.every(j => !j.entree.volsVeille));
});

test('un jour sans vol au milieu : joué, signalé, et le sale passe', () => {
  const vols = programme(['2026-11-02', '2026-11-04']);
  const p = periode(vols);
  assert.deepEqual(p.journees.map(j => [j.date, j.departs, j.retours]), [['2026-11-02', 16, 6], ['2026-11-03', 0, 0], ['2026-11-04', 16, 6]]);
  assert.deepEqual(p.periode.joursSansVol, ['2026-11-03']);
  const [j1, j2, j3] = p.journees;
  assert.ok(j2.resultat.ok);
  assert.deepEqual(j2.entree.saleInitial, j1.resultat.saleFinal, 'le sale du jour 1 passe au jour sans vol');
  assert.ok(j2.resultat.lots.some(l => l.retourVol && /\(veille\)$/.test(l.vol)), 'et s’y lave');
  assert.deepEqual(j3.entree.volsVeille, [], 'le jour 3 : aucun départ la veille');
  for (const j of p.journees) assert.equal(json(j.resultat), json(seule(p, j, vols)), j.date);
});

test('le bilan : chaque équipe compte au jour des vols + son jour ; les jours incomplets sont marqués et sortent des moyennes', () => {
  // La cuisine cu1 à J−2 ; cu2 à J−1 ; les autres le jour des vols.
  const options = { ...S.options, equipes: { cu1: { jour: -2 } }, ateliers: { encadrement: { prepa: 2 } } };
  const p = periode(programme(), options), b = p.bilan;
  assert.deepEqual(b.decalages, [-2, -1, 0]);
  assert.deepEqual(b.joursTravail.map(w => [w.date, w.complet]),
    [['2026-10-31', false], ['2026-11-01', false], ['2026-11-02', true], ['2026-11-03', false], ['2026-11-04', false]]);
  assert.deepEqual(b.joursTravail[0].manque, ['2026-10-31', '2026-11-01'], 'avant le premier jour de vols : les journées qui manquent');
  assert.deepEqual(b.joursTravail[3].manque, ['2026-11-05']);
  assert.deepEqual(p.periode.joursIncomplets, ['2026-10-31', '2026-11-01', '2026-11-03', '2026-11-04']);
  // cu1 travaille le 31/10 pour les vols du 02/11, cu2 le 01/11.
  const ou = id => b.joursTravail.filter(w => w.equipes[id]).map(w => [w.date, w.equipes[id].vols]);
  assert.deepEqual(ou('cu1'), [['2026-10-31', '2026-11-02'], ['2026-11-01', '2026-11-03'], ['2026-11-02', '2026-11-04']]);
  assert.deepEqual(ou('cu2'), [['2026-11-01', '2026-11-02'], ['2026-11-02', '2026-11-03'], ['2026-11-03', '2026-11-04']]);
  assert.deepEqual(ou('mo'), [['2026-11-02', '2026-11-02'], ['2026-11-03', '2026-11-03'], ['2026-11-04', '2026-11-04']]);
  // Totaux et moyennes sur les seuls jours complets (le 02/11) ; l'encadrement, une fois par jour.
  const complet = b.joursTravail[2];
  assert.equal(b.periode.jours, 1);
  assert.equal(b.periode.total.hommeMinutes, complet.total.hommeMinutes);
  assert.equal(b.periode.moyenne.personnes, complet.total.personnes);
  assert.equal(complet.services.prepa.encadrement, 2);
  assert.ok(b.joursTravail.every(w => !w.services.prepa || w.services.prepa.encadrement === 2));
  assert.deepEqual(b.mois.map(m => [m.mois, m.jours, m.joursIncomplets]), [['2026-10', 0, ['2026-10-31']], ['2026-11', 1, ['2026-11-01', '2026-11-03', '2026-11-04']]]);
  // La somme des homme-minutes sur la période est celle des journées.
  const parJours = b.joursTravail.reduce((n, w) => n + w.total.hommeMinutes, 0), parJournees = p.journees.reduce((n, j) => n + j.extrait.indicateurs.hommeMinutes, 0);
  assert.ok(Math.abs(parJours - parJournees) < 1e-6, parJours + ' ≠ ' + parJournees);
});

test('le bilan par équipe, par service et par compagnie : personnes, besoin exact, heures sup, retards, handling, plonge', () => {
  const p = periode(programme()), j = p.journees[0], b = p.bilan, w = b.joursTravail.find(x => x.date === '2026-11-02');
  const r = j.resultat, e = r.effectifs.cu1;
  // Une équipe à effectif calculé : homme-minutes ÷ poste ÷ rendement ; sinon ses personnes.
  assert.ok(Math.abs(b.joursTravail.find(x => x.date === '2026-11-01').equipes.cu1.besoin - e.hommeMinutes / e.poste / e.rendement) < 1e-9);
  assert.equal(w.equipes.pr.besoin, r.ateliers.find(a => a.id === 'pr').personnes);
  // Les heures sup en heures × personnes ; les vols chargés et en retard du handling ; les vols lavés.
  const v = id => r.ateliers.find(a => a.id === id);
  assert.equal(w.equipes.mo.heuresSup, (v('mo').heuresSupPersonnes || 0) + (v('mo').renfortsHeuresSup || 0));
  assert.equal(w.services.quais.volsCharges, r.vols.filter(x => x.fin != null).length);
  assert.equal(w.services.quais.volsEnRetard, r.vols.filter(x => !x.aHeure).length);
  assert.equal(w.services.plonge.volsLaves, r.lots.filter(l => l.vol != null && (l.atelier === 'pl1' || l.atelier === 'pl2')).length);
  assert.equal(w.saleSoir, j.extrait.saleFinal);
  // Les commandes finies après leur échéance, et le retard max.
  const tard = r.lots.filter(l => l.service === 'cuisine' && l.classes.some(id => l.fin > r.parClasse[id].echeance + 1e-9));
  assert.equal(b.joursTravail.find(x => x.date === '2026-11-01').services.cuisine.lotsEnRetard, tard.length);
});

test('un lot de deux compagnies se répartit au prorata des minutes du barème × vols de chacune', () => {
  // La prépa (mo) prépare EST/CREW et SUD/CREW en un seul lot ; elle compte 20,4 min par vol pour les deux.
  const p = periode(programme(['2026-11-02'])), r = p.journees[0].resultat;
  const lot = r.lots.find(l => l.atelier === 'mo' && json(l.classes) === json(['EST/CREW', 'SUD/CREW']));
  assert.ok(lot && lot.hommeMinutes > 0);
  const vols = id => r.classes.find(c => c.id === id).vols.length, est = vols('EST/CREW'), sud = vols('SUD/CREW');
  assert.notEqual(est, sud, 'des vols en nombre différent : la part se voit');
  const cies = p.bilan.joursTravail.find(x => x.date === '2026-11-02').services.prepa.compagnies;
  // EST n'a pas d'autre lot à la prépa : sa part vient de celui-là seul.
  assert.ok(r.lots.filter(l => l.atelier === 'mo' && l.classes.some(id => id.startsWith('EST/'))).length === 1);
  const mo = p.journees[0].extrait.equipes.find(x => x.id === 'mo').compagnies;
  assert.ok(Math.abs(mo.EST.hommeMinutes - lot.hommeMinutes * est / (est + sud)) < 1e-9);
  assert.equal(mo.EST.vols.length, est);
  // Le service : la somme de ses équipes ; ses compagnies, leurs commandes, vols et pax.
  const tot = Object.values(cies).reduce((n, c) => n + c.hommeMinutes, 0);
  assert.ok(Math.abs(tot - p.bilan.joursTravail.find(x => x.date === '2026-11-02').services.prepa.hommeMinutes) < 1e-6);
  assert.ok(cies.EST.commandes >= 1 && cies.EST.pax > 0);
});

test('une période se joue pas à pas, de façon déterministe, et vite', () => {
  const vols = programme();
  const u = J.uniteDeLaSauvegarde(S.sauvegarde, S.options);
  const pas = PE.creerPeriode(u, vols, { delaiChargement: 45 });
  assert.deepEqual([pas.total, pas.fait, pas.fini], [3, 0, false]);
  assert.equal(pas.suivant(), '2026-11-02');
  assert.equal(pas.fait, 1);
  const partiel = pas.resultat();
  assert.equal(partiel.periode.joues, 1);
  while (pas.suivant()) { /* la suite */ }
  assert.equal(pas.suivant(), null);
  const complet = pas.resultat();
  assert.equal(json(complet.bilan), json(PE.simulerPeriode(u, vols, { delaiChargement: 45 }).bilan));
  assert.ok(complet.journees.every(j => !('resultat' in j)), 'sans détail, la page ne garde pas les résultats complets');
  // Une journée fictive de 50 vols : moins d'une seconde.
  const cies = ['NORD', 'SUD', 'EST', 'OUEST'];
  const gros = JOURS.flatMap(d => Array.from({ length: 50 }, (_, i) => ({ ...VOLS[i % VOLS.length], id: 'X' + i, cie: cies[i % 4], std: VOLS[i % VOLS.length].std == null ? null : 300 + (i * 19) % 1000, date: d })));
  const t0 = Date.now();
  const r = PE.simulerPeriode(u, gros, { delaiChargement: 45 });
  const ms = (Date.now() - t0) / 3;
  assert.equal(r.journees.length, 3);
  assert.ok(ms < 1000, ms + ' ms par journée');
  assert.throws(() => PE.creerPeriode(u, VOLS), /pas daté/);
  assert.throws(() => PE.depuisSauvegarde(S.sauvegarde, vols, { volsVeille: [] }), /volsVeille/);
});
