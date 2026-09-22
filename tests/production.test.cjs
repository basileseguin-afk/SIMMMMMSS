/* Régressions du modèle par ateliers de travail (moteur/production.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

/* Un programme minuscule mais complet : deux compagnies, trois cabines. */
const VOLS = [
  { id: 'CRL100', cie: 'CRL', sens: 'DEP', std: 10 * 60, bc: 10, pc: 20, yc: 100 },
  { id: 'CRL200', cie: 'CRL', sens: 'DEP', std: 12 * 60, bc: 0, pc: 0, yc: 150 },
  { id: 'AF300',  cie: 'AF',  sens: 'DEP', std: 11 * 60, bc: 8, pc: 0, yc: 120 },
  { id: 'AF900',  cie: 'AF',  sens: 'RET', sta: 9 * 60,  bc: 8, pc: 0, yc: 120 }
];

const LIAISONS = [
  { from: 'appros', to: 'cuisine' },
  { from: 'cuisine', to: 'prepa' },
  { from: 'magasin', to: 'prepa' },
  { from: 'dotation', to: 'prepa' }
];

const atelier = (p) => ({ type: 'manuel', personnes: 2, jour: 0, lots: [], ...p });

/* ---------------------------------------------------------------------- */

test('les compagnies × classes se déduisent des départs, jamais des retours', () => {
  const c = P.classesDeVols(VOLS);
  assert.deepEqual(c.map(x => x.id).sort(), ['AF/BC', 'AF/YC', 'CRL/BC', 'CRL/PC', 'CRL/YC']);
  const crlYc = c.find(x => x.id === 'CRL/YC');
  assert.equal(crlYc.pax, 250, 'les deux départs CRL s’additionnent');
  assert.equal(crlYc.vols.length, 2);
  // Le retour AF900 ne crée rien : on ne fabrique pas pour un avion qui arrive.
  assert.equal(c.filter(x => x.cie === 'AF').reduce((n, x) => n + x.vols.length, 0), 2);
});

test('l’échéance est le départ le plus serré, moins le délai de chargement', () => {
  const c = P.classesDeVols(VOLS, { delaiChargement: 45 });
  assert.equal(c.find(x => x.id === 'CRL/YC').echeance, 10 * 60 - 45, 'le vol de 10:00 commande');
  assert.equal(c.find(x => x.id === 'AF/BC').echeance, 11 * 60 - 45);
  const large = P.classesDeVols(VOLS, { delaiChargement: 90 });
  assert.equal(large.find(x => x.id === 'CRL/YC').echeance, 10 * 60 - 90);
});

test('un atelier enchaîne ses lots : le second démarre quand le premier finit', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [atelier({ id: 'a1', nom: 'Prépa CRL', service: 'prepa', debut: '06:00',
      personnes: 2, lots: [['CRL/BC'], ['CRL/PC']] })]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const [premier, second] = r.lots;
  assert.equal(premier.debut, 6 * 60);
  assert.equal(second.debut, premier.fin, 'pas de trou entre deux lots du même atelier');
  assert.ok(premier.duree > 0 && second.duree > 0);
});

test('un lot ne démarre que lorsque TOUS ses fournisseurs ont livré cette classe', () => {
  // La cuisine finit tard ; le magasin, tôt. Le montage attend la cuisine.
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'cui', nom: 'Cuisine', service: 'cuisine', debut: '05:00', personnes: 1, lots: [['CRL/BC']] }),
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', debut: '05:00', personnes: 4, lots: [['CRL/BC']] }),
      atelier({ id: 'mon', nom: 'Montage', service: 'prepa', debut: '05:00', personnes: 2, lots: [['CRL/BC']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const cui = r.lots.find(l => l.service === 'cuisine');
  const mag = r.lots.find(l => l.service === 'magasin');
  const mon = r.lots.find(l => l.service === 'prepa');
  assert.ok(cui.fin > mag.fin, 'la cuisine est bien la branche la plus longue');
  assert.equal(mon.debut, cui.fin, 'le montage part quand la dernière branche arrive');
  assert.ok(mon.attente > 0, 'l’attente du montage est mesurée, pas dissimulée');
});

test('le montage attend la branche la plus lente, quelle qu’elle soit', () => {
  // Cette fois c'est le magasin qui traîne : le résultat doit suivre la cause.
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'cui', nom: 'Cuisine', service: 'cuisine', debut: '05:00', personnes: 20, lots: [['CRL/BC']] }),
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', debut: '08:00', personnes: 1, lots: [['CRL/BC']] }),
      atelier({ id: 'mon', nom: 'Montage', service: 'prepa', debut: '05:00', personnes: 2, lots: [['CRL/BC']] })
    ]
  });
  const mag = r.lots.find(l => l.service === 'magasin');
  const mon = r.lots.find(l => l.service === 'prepa');
  assert.equal(mon.debut, mag.fin);
  assert.ok(mag.debut >= 8 * 60, 'un atelier ne démarre jamais avant son heure');
});

test('un service hors du parcours d’une classe n’est pas attendu', () => {
  // La dotation alimente le montage dans le graphe, mais ne fabrique pas AF/BC.
  // Le montage ne doit pas rester bloqué à l'attendre.
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'cui', nom: 'Cuisine', service: 'cuisine', debut: '05:00', personnes: 4, lots: [['AF/BC']] }),
      atelier({ id: 'dot', nom: 'Dotation', service: 'dotation', debut: '05:00', personnes: 4, lots: [['CRL/BC']] }),
      atelier({ id: 'mon', nom: 'Montage', service: 'prepa', debut: '05:00', personnes: 2, lots: [['AF/BC']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.ok(r.parClasse['AF/BC'].fin != null, 'AF/BC sort bien de l’unité');
});

test('la durée suit les personnes, et le rendement l’allonge', () => {
  const faire = (personnes, rendement) => P.simuler({
    vols: VOLS, liaisons: [], rendement,
    ateliers: [atelier({ id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes, lots: [['CRL/YC']] })]
  }).lots[0].duree;
  const un = faire(1), deux = faire(2);
  assert.ok(Math.abs(un / 2 - deux) < 1e-9, 'deux fois plus de monde, deux fois moins longtemps');
  assert.ok(Math.abs(faire(1, 0.5) - un * 2) < 1e-9, 'un rendement de 50 % double la durée');
  assert.throws(() => P.simuler({ vols: VOLS, ateliers: [], rendement: 0 }), /rendement/);
});

test('le barème se remplace en bloc sans toucher au moteur', () => {
  const sur = (bareme) => P.simuler({
    vols: VOLS, liaisons: [], bareme,
    ateliers: [atelier({ id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes: 1, lots: [['CRL/BC']] })]
  }).lots[0];
  const maison = { cuisine: { BC: { parPax: 10, parVol: 100 } } };
  const l = sur(maison);
  // 10 passagers BC sur un seul vol : 10 × 10 + 1 × 100 = 200 homme-minutes.
  assert.equal(l.hommeMinutes, 200);
  assert.equal(l.duree, 200);
});

/* ---- robot ----------------------------------------------------------- */

test('le robot travaille au débit, pas aux homme-minutes', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [{ id: 'r', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00',
      personnes: 2, personnesMin: 2, debit: 300, lots: [['CRL/YC']] }]
  });
  const l = r.lots[0];
  assert.equal(l.plateaux, 250);
  assert.ok(Math.abs(l.duree - 250 / 300 * 60) < 1e-9, '250 plateaux à 300/h');
  assert.equal(l.hommeMinutes, undefined, 'le robot ne consomme pas de barème');
});

test('sous son effectif minimum, le robot ne tourne pas et le dit', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [{ id: 'r', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00',
      personnes: 1, personnesMin: 2, debit: 300, lots: [['CRL/YC']] }]
  });
  assert.equal(r.ok, false);
  assert.match(r.anomalies.map(a => a.message).join(' '), /le robot ne tourne pas/);
});

test('les pauses arrêtent le robot et repoussent sa fin d’autant', () => {
  const sans = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [{ id: 'r', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00',
      personnes: 2, personnesMin: 2, debit: 300, lots: [['CRL/YC']] }]
  }).lots[0];
  const avec = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [{ id: 'r', nom: 'Robot', service: 'prepa', type: 'robot', debut: '06:00',
      personnes: 2, personnesMin: 2, debit: 300, pauses: [{ de: '06:10', a: '06:40' }],
      lots: [['CRL/YC']] }]
  }).lots[0];
  assert.equal(avec.duree, sans.duree, 'le travail est le même');
  assert.equal(avec.fin, sans.fin + 30, 'la pause de 30 min décale la fin de 30 min');
  assert.equal(avec.arret, 30, 'le temps d’arrêt est nommé à part');
});

test('une pause qui tombe hors du travail ne change rien', () => {
  const l = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [atelier({ id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes: 4,
      pauses: [{ de: '12:00', a: '13:00' }], lots: [['CRL/BC']] })]
  }).lots[0];
  assert.equal(l.arret, 0);
});

/* ---- validation ------------------------------------------------------ */

test('la validation rassemble toutes les anomalies, pas seulement la première', () => {
  const a = P.validerAteliers([
    { id: 'x', nom: '', service: 'inconnu', debut: '25:99', personnes: -1, lots: [] },
    { id: 'x', nom: 'Doublon', service: 'cuisine', debut: '06:00', personnes: 2, lots: [['ZZ/BC']] }
  ], { services: ['cuisine'], classes: ['CRL/BC'] });
  const codes = a.map(x => x.code);
  for (const attendu of ['nom', 'service', 'debut', 'personnes', 'lots', 'id', 'lot']) {
    assert.ok(codes.includes(attendu), 'anomalie ' + attendu + ' attendue, reçu ' + codes.join(','));
  }
});

test('une même classe dans deux ateliers du même service est signalée, pas arbitrée', () => {
  const a = P.validerAteliers([
    { id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes: 2, lots: [['CRL/BC']] },
    { id: 'b', nom: 'B', service: 'cuisine', debut: '07:00', personnes: 2, lots: [['CRL/BC']] }
  ], { services: ['cuisine'], classes: ['CRL/BC'] });
  assert.equal(a.filter(x => x.code === 'doublon').length, 1);
  // Ce n'est pas bloquant : la journée se joue quand même.
  const r = P.simuler({ vols: VOLS, liaisons: [], ateliers: [
    { id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes: 2, lots: [['CRL/BC']] },
    { id: 'b', nom: 'B', service: 'cuisine', debut: '07:00', personnes: 2, lots: [['CRL/BC']] }
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.anomalies.filter(x => x.code === 'doublon').length, 1);
});

test('un cycle dans les liaisons est refusé avant de jouer quoi que ce soit', () => {
  const r = P.simuler({
    vols: VOLS,
    liaisons: [{ from: 'cuisine', to: 'prepa' }, { from: 'prepa', to: 'cuisine' }],
    ateliers: [
      atelier({ id: 'c', nom: 'C', service: 'cuisine', debut: '06:00', lots: [['CRL/BC']] }),
      atelier({ id: 'p', nom: 'P', service: 'prepa', debut: '06:00', lots: [['CRL/BC']] })
    ]
  });
  assert.equal(r.ok, false);
  assert.match(r.anomalies.map(a => a.message).join(' '), /bouclent/);
});

/* ---- résultats ------------------------------------------------------- */

test('le bilan dit qui est à l’heure et de combien on déborde', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [
      atelier({ id: 'tot', nom: 'Tôt', service: 'cuisine', debut: '05:00', personnes: 20, lots: [['CRL/BC']] }),
      atelier({ id: 'tard', nom: 'Tard', service: 'cuisine', debut: '20:00', personnes: 1, lots: [['AF/BC']] })
    ]
  });
  assert.equal(r.parClasse['CRL/BC'].aHeure, true);
  assert.equal(r.parClasse['AF/BC'].aHeure, false);
  assert.ok(r.parClasse['AF/BC'].retard > 0);
  assert.equal(r.indicateurs.classesSuivies, 2);
  assert.equal(r.indicateurs.aHeure, 1);
  assert.equal(r.indicateurs.partAHeure, 50);
  // Les classes du programme que personne ne fabrique sont comptées à part.
  assert.equal(r.indicateurs.classesAbsentes, 3);
});

test('deux journées identiques donnent exactement le même résultat', () => {
  const faire = () => P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'c', nom: 'C', service: 'cuisine', debut: '05:00', personnes: 3, lots: [['CRL/BC'], ['CRL/PC']] }),
      atelier({ id: 'm', nom: 'M', service: 'prepa', debut: '05:00', personnes: 2, lots: [['CRL/BC'], ['CRL/PC']] })
    ]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(faire().lots)), JSON.parse(JSON.stringify(faire().lots)));
});

test('un lot peut porter plusieurs classes à la fois : elles sortent ensemble', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [atelier({ id: 'a', nom: 'Appros', service: 'appros', debut: '04:00', personnes: 5,
      lots: [['CRL/BC', 'CRL/PC', 'CRL/YC']] })]
  });
  assert.equal(r.lots.length, 1, 'un seul lot, donc une seule tâche');
  assert.equal(r.parClasse['CRL/BC'].fin, r.parClasse['CRL/YC'].fin, 'livrées au même instant');
  const attendu = ['CRL/BC', 'CRL/PC', 'CRL/YC']
    .map(id => P.travailClasse('appros', P.classesDeVols(VOLS).find(c => c.id === id)))
    .reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(r.lots[0].hommeMinutes - attendu) < 1e-9, 'le travail du lot est la somme de ses classes');
});

test('un atelier peut travailler un autre jour que le départ', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [atelier({ id: 'a', nom: 'Cuisine J−1', service: 'cuisine', debut: '14:00', jour: -1,
      personnes: 4, lots: [['CRL/BC']] })]
  });
  assert.ok(r.lots[0].debut < 0, 'la veille est bien avant le jour du départ');
  assert.equal(P.hhmm(r.lots[0].debut), 'J-1 14:00');
});

/* ---- utilitaires ----------------------------------------------------- */

test('les heures se lisent et s’écrivent dans les deux sens', () => {
  assert.equal(P.minutes('06:30'), 390);
  assert.equal(P.minutes(390), 390);
  assert.equal(P.hhmm(390), '06:30');
  assert.throws(() => P.minutes('6h30'), /HH:MM/);
  assert.throws(() => P.minutes('48:00'), /hors limites/);
});

test('les pauses qui se chevauchent sont fusionnées avant d’être appliquées', () => {
  const p = P.pausesDe({ pauses: [{ de: '12:00', a: '13:00' }, { de: '12:30', a: '14:00' }] });
  assert.deepEqual(p, [{ de: 720, a: 840 }]);
  // 20 min de travail avant la pause, la pause de 120 min, puis les 40 restantes.
  assert.equal(P.finAvecPauses(700, 60, p).fin, 880);
  assert.equal(P.finAvecPauses(700, 60, p).arret, 120);
});

test('une tâche qui commence pendant une pause attend sa fin', () => {
  const p = [{ de: 600, a: 660 }];
  assert.deepEqual(P.finAvecPauses(620, 30, p), { fin: 690, arret: 40 });
});

test('un retour qui boucle dans le graphe ne bloque pas une classe qui n’y passe pas', () => {
  // quais → plonge → dotation → quais : le graphe boucle, mais aucune classe ne
  // parcourt ce circuit. Refuser cette unité serait refuser sa description juste.
  const r = P.simuler({
    vols: VOLS,
    liaisons: [
      { from: 'quais', to: 'plonge' }, { from: 'plonge', to: 'dotation' },
      { from: 'dotation', to: 'quais' }, { from: 'cuisine', to: 'prepa' }
    ],
    ateliers: [
      atelier({ id: 'c', nom: 'C', service: 'cuisine', debut: '05:00', personnes: 4, lots: [['CRL/BC']] }),
      atelier({ id: 'd', nom: 'D', service: 'dotation', debut: '05:00', personnes: 4, lots: [['CRL/PC']] }),
      atelier({ id: 'p', nom: 'P', service: 'prepa', debut: '05:00', personnes: 4, lots: [['CRL/BC']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.ok(r.parClasse['CRL/BC'].fin != null);
});

test('une liste de compagnies × classes fournie remplace celle des vols', () => {
  // On retire CRL/PC du programme et on ajoute une compagnie qui n'y figure pas.
  const duProgramme = P.classesDeVols(VOLS);
  const classes = duProgramme.filter(c => c.id !== 'CRL/PC').concat([{
    id: 'ZZ/BC', cie: 'ZZ', cabine: 'BC', pax: 40,
    vols: [{ id: 'ZZ1', pax: 40, depart: 9 * 60, echeance: 9 * 60 - 45 }],
    echeance: 9 * 60 - 45
  }]);
  const r = P.simuler({
    vols: VOLS, classes, liaisons: [],
    ateliers: [atelier({ id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', personnes: 2,
      lots: [['ZZ/BC']] })]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  assert.ok(r.parClasse['ZZ/BC'], 'la classe ajoutée est fabricable');
  assert.equal(r.parClasse['ZZ/BC'].aHeure, true);
  assert.equal(r.parClasse['CRL/PC'], undefined, 'la classe retirée a disparu du bilan');
  // Son travail suit le barème comme n'importe quelle autre.
  assert.ok(r.lots[0].hommeMinutes > 0);
});

test('un lot qui nomme une classe inconnue est refusé, en la nommant', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [],
    ateliers: [atelier({ id: 'a', nom: 'A', service: 'cuisine', debut: '06:00', lots: [['ZZ/BC']] })]
  });
  assert.equal(r.ok, false);
  assert.match(r.anomalies.map(a => a.message).join(' '), /compagnie × classe inconnue : ZZ\/BC/);
});

/* ---- régime de poste -------------------------------------------------- */

test('une équipe prend 15 min après 3 h de travail, puis 30 min après 6 h', () => {
  const t = P.executerTache({ depart: 300, debutPoste: 300, duree: 200, prises: new Set() });
  // 180 min de travail, 15 min de pause, puis les 20 min restantes.
  assert.equal(t.fin, 300 + 200 + 15);
  assert.equal(t.arret, 15);
  assert.equal(t.cumul, 200);

  const long = P.executerTache({ depart: 300, debutPoste: 300, duree: 400, prises: new Set() });
  assert.equal(long.arret, 45, 'les deux pauses ont été prises');
  assert.equal(long.fin, 300 + 400 + 45);
});

test('une pause de régime n’est prise qu’une fois par poste', () => {
  const prises = new Set();
  const a = P.executerTache({ depart: 300, debutPoste: 300, duree: 200, prises });
  const b = P.executerTache({ depart: a.fin, debutPoste: 300, duree: 50, cumul: a.cumul, prises });
  assert.equal(b.arret, 0, 'le seuil de 3 h ne se redéclenche pas au lot suivant');
  assert.equal(b.fin, a.fin + 50);
});

test('le poste dure 8 h 15 de présence, dont 7 h 30 de travail', () => {
  assert.equal(P.REGIME_DEFAUT.presence, 495);
  assert.equal(P.travailDuPoste(), 450, '495 − 15 − 30');
  const t = P.executerTache({ depart: 300, debutPoste: 300, duree: 600, prises: new Set() });
  assert.equal(t.tronque, true, 'on ne fait pas 10 h dans un poste de 8 h 15');
  assert.equal(t.fait, 450);
  assert.equal(t.fin, 300 + 495);
});

test('un régime désactivé laisse travailler sans fin', () => {
  const t = P.executerTache({ depart: 300, debutPoste: 300, duree: 900, regime: false, prises: new Set() });
  assert.equal(t.tronque, false);
  assert.equal(t.arret, 0);
  assert.equal(t.fin, 300 + 900);
});

test('un lot que le poste ne peut pas finir est signalé, pas dissimulé', () => {
  // 250 passagers à 2 min chacun : 500 min de travail pour une seule personne,
  // là où le poste n'en offre que 450.
  const lourd = { cuisine: { YC: { parPax: 2, parVol: 0 }, BC: { parPax: 2, parVol: 0 } } };
  const r = P.simuler({
    vols: VOLS, liaisons: [], bareme: lourd,
    ateliers: [atelier({ id: 'a', nom: 'Cuisine', service: 'cuisine', debut: '05:00', personnes: 1,
      lots: [['CRL/YC']] })]
  });
  assert.equal(r.ok, true, 'la journée se joue quand même');
  assert.equal(r.lots[0].horsPoste, true);
  assert.equal(r.lots[0].fin, null);
  assert.equal(r.parClasse['CRL/YC'].fin, null, 'la classe ne sort pas');
  assert.match(r.anomalies.map(a => a.message).join(' '), /le poste se termine avant la fin/);
});

test('les lots suivants d’un poste terminé ne sont pas fabriqués', () => {
  const lourd = { cuisine: { YC: { parPax: 2, parVol: 0 }, BC: { parPax: 2, parVol: 0 } } };
  const r = P.simuler({
    vols: VOLS, liaisons: [], bareme: lourd,
    ateliers: [atelier({ id: 'a', nom: 'Cuisine', service: 'cuisine', debut: '05:00', personnes: 1,
      lots: [['CRL/YC'], ['CRL/BC']] })]
  });
  assert.equal(r.lots.length, 1, 'le second lot n’est même pas commencé');
  assert.equal(r.parClasse['CRL/BC'].absente, true);
});

test('les pauses de régime décalent la fin d’un atelier aval', () => {
  const sans = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'c', nom: 'C', service: 'cuisine', debut: '05:00', personnes: 1, regime: false, lots: [['CRL/BC']] }),
      atelier({ id: 'p', nom: 'P', service: 'prepa', debut: '05:00', personnes: 4, regime: false, lots: [['CRL/BC']] })
    ]
  });
  // Un régime très serré : pause de 20 min après 5 min de travail.
  const serre = { seuils: [{ apres: 5, duree: 20 }], presence: 600 };
  const avec = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'c', nom: 'C', service: 'cuisine', debut: '05:00', personnes: 1, regime: serre, lots: [['CRL/BC']] }),
      atelier({ id: 'p', nom: 'P', service: 'prepa', debut: '05:00', personnes: 4, regime: false, lots: [['CRL/BC']] })
    ]
  });
  const finSans = sans.lots.find(l => l.service === 'prepa').fin;
  const finAvec = avec.lots.find(l => l.service === 'prepa').fin;
  assert.equal(finAvec, finSans + 20, 'la pause de la cuisine retarde le montage d’autant');
});

/* ---- boucle du matériel ---------------------------------------------- */

/* Un programme équilibré : ce qui part le matin revient l'après-midi. */
const VOLS_BOUCLE = [
  { id: 'R1', cie: 'CRL', sens: 'RET', sta: 6 * 60,  bc: 0, pc: 0, yc: 100 },
  { id: 'D1', cie: 'CRL', sens: 'DEP', std: 10 * 60, bc: 0, pc: 0, yc: 100 }
];
const MAT = { actif: true, parPax: 1, stockInitial: 0, delaiRetour: 30 };
const bouclier = (p) => ({ type: 'manuel', personnes: 4, jour: 0, lots: [], ...p });

test('sans stock, la production attend que les retours soient lavés', () => {
  const r = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 3, debit: 600, jour: 0, lots: [] },
      bouclier({ id: 'do', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const lavage = r.lots.find(l => l.unites !== undefined);
  const dotation = r.lots.find(l => l.service === 'dotation');
  // Le vol arrive à 06:00, disponible à 06:30, lavé à 100 u sur 600 u/h = 10 min.
  assert.equal(lavage.debut, 6 * 60 + 30);
  assert.equal(lavage.fin, 6 * 60 + 40);
  assert.equal(dotation.debut, lavage.fin, 'la dotation part quand le propre arrive');
  assert.ok(dotation.attenteMateriel > 0, 'l’attente de matériel est mesurée');
  assert.equal(Math.round(dotation.attenteMateriel), 100, 'de 05:00 à 06:40');
});

test('retours = départs : le stock revient à zéro, sans jamais manquer deux fois', () => {
  const r = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 3, debit: 600, jour: 0, lots: [] },
      bouclier({ id: 'do', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  assert.equal(r.materiel.entrees, 100);
  assert.equal(r.materiel.lavees, 100);
  assert.equal(r.materiel.consommees, 100);
  assert.equal(r.materiel.restePropre, 0, 'rien ne reste : les retours couvraient juste les départs');
  assert.equal(r.materiel.resteSale, 0);
});

test('un excédent de retours se stocke et sert d’amortisseur', () => {
  // Deux retours pour un départ : le surplus reste propre en fin de journée.
  const vols = VOLS_BOUCLE.concat([{ id: 'R2', cie: 'CRL', sens: 'RET', sta: 7 * 60, bc: 0, pc: 0, yc: 60 }]);
  const r = P.simuler({
    vols, liaisons: [], materiel: MAT,
    ateliers: [
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 3, debit: 600, jour: 0, lots: [] },
      bouclier({ id: 'do', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  assert.equal(r.materiel.entrees, 160);
  assert.equal(r.materiel.consommees, 100);
  assert.equal(r.materiel.restePropre, 60, 'l’excédent est disponible pour le lendemain');
});

test('un stock d’ouverture évite l’attente : c’est à cela qu’il sert', () => {
  const avec = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: { ...MAT, stockInitial: 100 },
    ateliers: [
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 3, debit: 600, jour: 0, lots: [] },
      bouclier({ id: 'do', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  assert.equal(avec.lots.find(l => l.service === 'dotation').debut, 5 * 60, 'plus d’attente');
  assert.equal(avec.materiel.attente, 0);
  // Le matériel lavé n'a servi à personne ce jour-là : il reste pour demain.
  assert.equal(avec.materiel.restePropre, 100);
  assert.equal(avec.materiel.minPropre, 0, 'le stock est bien passé par zéro');
});

test('une plonge lente retarde la production, et le bilan le dit', () => {
  const lente = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', personnes: 1, debit: 60, jour: 0, lots: [] },
      bouclier({ id: 'do', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  // 100 unités à 60 u/h = 100 min, à partir de 06:30.
  assert.equal(lente.lots.find(l => l.unites !== undefined).fin, 6 * 60 + 30 + 100);
  assert.equal(lente.lots.find(l => l.service === 'dotation').debut, 6 * 60 + 30 + 100);
  assert.ok(lente.indicateurs.attenteMateriel > 0);
});

test('un atelier qui ne consomme pas de matériel n’attend rien', () => {
  const r = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [bouclier({ id: 'c', nom: 'Cuisine', service: 'cuisine', debut: '05:00', lots: [['CRL/YC']] })]
  });
  assert.equal(r.lots[0].debut, 5 * 60);
  assert.equal(r.materiel.consommees, 0);
});

test('les retours se déduisent des vols, avec leur délai de mise à disposition', () => {
  const r = P.retoursDeVols(VOLS_BOUCLE, MAT);
  assert.equal(r.length, 1, 'seuls les retours ramènent du matériel');
  assert.equal(r[0].t, 6 * 60 + 30);
  assert.equal(r[0].unites, 100);
  assert.equal(P.retoursDeVols(VOLS_BOUCLE, { ...MAT, parPax: 2 })[0].unites, 200);
});

test('un lot qui n’obtient jamais son matériel laisse une trace', () => {
  // Aucune plonge : rien ne revient propre. Sans ligne de journal, la classe
  // paraîtrait fabriquée par ses autres étapes.
  const r = P.simuler({
    vols: VOLS_BOUCLE, liaisons: LIAISONS, materiel: MAT,
    ateliers: [
      bouclier({ id: 'c', nom: 'Cuisine', service: 'cuisine', debut: '05:00', lots: [['CRL/YC']] }),
      bouclier({ id: 'd', nom: 'Dotation', service: 'dotation', debut: '05:00', materiel: 'consomme', lots: [['CRL/YC']] })
    ]
  });
  assert.equal(r.ok, true, 'ce n’est pas une erreur de saisie');
  const bloque = r.lots.find(l => l.sansMateriel);
  assert.ok(bloque, 'le lot bloqué figure au journal');
  assert.equal(bloque.service, 'dotation');
  assert.equal(bloque.fin, null);
  assert.equal(bloque.besoin, 100);
  assert.equal(r.parClasse['CRL/YC'].fin, null, 'la classe ne sort pas de l’unité');
  assert.match(r.anomalies.map(a => a.message).join(' '), /unités de matériel propre manquent/);
});

test('le débit d’un lavage est la somme de ses tunnels actifs', () => {
  assert.equal(P.debitLavage({ tunnels: [{ debit: 200 }, { debit: 200 }, { debit: 400 }] }), 800);
  assert.equal(P.debitLavage({ tunnels: [{ debit: 200 }, { debit: 200, actif: false }] }), 200,
    'un tunnel à l’arrêt ne lave rien');
  assert.equal(P.debitLavage({ debit: 600 }), 600, 'sans liste, le débit global fait foi');
  assert.equal(P.debitLavage({ tunnels: [] }), 0);
});

test('deux tunnels lavent deux fois plus vite qu’un seul', () => {
  const avec = (tunnels) => P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [{ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage',
      debut: '05:00', personnes: 3, jour: 0, lots: [], tunnels }]
  }).lots.find(l => l.unites !== undefined);
  const un = avec([{ debit: 300 }]);
  const deux = avec([{ debit: 300 }, { debit: 300 }]);
  assert.equal(un.fin - un.debut, 20, '100 unités à 300/h');
  assert.equal(deux.fin - deux.debut, 10);
  // Le tunnel double vitesse compte pour ce qu'il vaut, pas pour un.
  const double = avec([{ debit: 300 }, { debit: 600 }]);
  assert.ok(Math.abs((double.fin - double.debut) - 100 / 900 * 60) < 1e-9);
});

test('une plonge dont tous les tunnels sont à l’arrêt le dit', () => {
  const r = P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [{ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage',
      debut: '05:00', personnes: 3, jour: 0, lots: [],
      tunnels: [{ debit: 300, actif: false }, { debit: 300, actif: false }] }]
  });
  assert.equal(r.ok, false);
  assert.match(r.anomalies.map(a => a.message).join(' '), /aucun tunnel ne tourne/);
});

/* ---- la mise à disposition ------------------------------------------- */

test('une mise à disposition ne coûte ni personne ni minute', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0 }),
      atelier({ id: 'mo', nom: 'Montage', service: 'prepa', debut: '06:00', personnes: 4,
        lots: [['CRL/BC']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const mise = r.lots.find(l => l.dispo);
  assert.ok(mise, 'elle figure au parcours');
  assert.equal(mise.duree, 0, 'aucun temps de production');
  assert.equal(mise.hommeMinutes, undefined, 'aucun homme-minute');
  assert.equal(r.indicateurs.hommeHeures, r.lots.filter(l => !l.dispo)
    .reduce((n, l) => n + (l.hommeMinutes || 0), 0) / 60, 'elle ne pèse pas dans les heures');
});

test('elle sert toutes les classes sans qu’on les énumère', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0 }),
      atelier({ id: 'mo', nom: 'Montage', service: 'prepa', debut: '06:00', personnes: 4,
        lots: [['CRL/BC'], ['AF/YC']] })
    ]
  });
  assert.equal(r.ok, true);
  for (const id of ['CRL/BC', 'AF/YC'])
    assert.ok(r.parClasse[id].services.includes('magasin'), id + ' passe par le magasin');
});

test('permanente, elle ne fait attendre personne ; à l’heure, elle retarde l’aval', () => {
  const jouer = (dispo) => P.simuler({
    vols: VOLS, liaisons: [{ from: 'magasin', to: 'prepa' }],
    ateliers: [
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0, ...dispo }),
      atelier({ id: 'mo', nom: 'Montage', service: 'prepa', debut: '06:00', personnes: 4,
        lots: [['CRL/BC']] })
    ]
  }).lots.find(l => l.atelier === 'mo');
  const libre = jouer({});
  assert.equal(libre.debut, 6 * 60, 'rien à attendre');
  assert.equal(libre.attente, 0);
  const tard = jouer({ permanent: false, debut: '07:30' });
  assert.equal(tard.debut, 7 * 60 + 30, 'le montage attend l’ouverture du magasin');
  assert.equal(tard.attente, 90);
});

test('une mise à disposition doublée d’un atelier dans le même service est signalée', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0 }),
      atelier({ id: 'mag2', nom: 'Prépa magasin', service: 'magasin', debut: '05:00',
        personnes: 3, lots: [['CRL/BC']] })
    ]
  });
  assert.equal(r.ok, true, 'signalé, pas bloquant');
  assert.match(r.anomalies.map(a => a.message).join(' '), /déjà une mise à disposition/);
});

test('elle n’exige ni effectif ni ligne de fabrication', () => {
  const anomalies = P.validerAteliers([
    { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '06:00',
      personnes: 0, lots: [] }
  ], {});
  assert.deepEqual(anomalies, [], 'rien à lui reprocher');
});

test('une mise à disposition seule ne rend aucune classe « fabriquée »', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: LIAISONS,
    ateliers: [atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0 })]
  });
  assert.equal(r.ok, true);
  assert.equal(r.indicateurs.classesSuivies, 0, 'ouvrir un magasin ne fabrique rien');
  assert.equal(r.indicateurs.classesAbsentes, r.classes.length);
  assert.equal(r.parClasse['CRL/BC'].absente, true);
  assert.equal(r.parClasse['CRL/BC'].fin, null);
});

test('mais elle figure au parcours de ce qu’elle sert', () => {
  const r = P.simuler({
    vols: VOLS, liaisons: [{ from: 'magasin', to: 'prepa' }],
    ateliers: [
      atelier({ id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', personnes: 0 }),
      atelier({ id: 'mo', nom: 'Montage', service: 'prepa', debut: '06:00', personnes: 4, lots: [['CRL/BC']] })
    ]
  });
  const c = r.parClasse['CRL/BC'];
  assert.ok(c.services.includes('magasin'), 'le parcours la montre');
  assert.equal(c.absente, false);
  // Sa fin est celle du montage, pas celle de l'ouverture du magasin.
  assert.equal(c.fin, r.lots.find(l => l.atelier === 'mo').fin);
});

/* ---- équipage et repas spéciaux --------------------------------------- */

const VOLS_CS = [
  { id: 'AF1', cie: 'AF', sens: 'DEP', std: 10 * 60, bc: 10, pc: 0, yc: 100, crew: 8, spml: 6 },
  { id: 'AF2', cie: 'AF', sens: 'DEP', std: 11 * 60, bc: 0, pc: 0, yc: 120, crew: 6, spml: 0 }
];

test('CREW et SPML sont des classes comme les autres', () => {
  const classes = P.classesDeVols(VOLS_CS, { delaiChargement: 45 });
  const par = Object.fromEntries(classes.map(c => [c.id, c]));
  assert.equal(par['AF/CREW'].pax, 14, 'les équipages des deux vols');
  assert.equal(par['AF/CREW'].vols.length, 2);
  assert.equal(par['AF/SPML'].pax, 6, 'un seul vol en porte');
  assert.equal(par['AF/SPML'].vols.length, 1, 'un vol sans repas spécial n’en crée pas');
  assert.equal(par['AF/YC'].pax, 220, 'les cabines ne changent pas');
});

test('un vol qui ne les porte pas n’en fabrique pas', () => {
  const classes = P.classesDeVols(
    [{ id: 'X', cie: 'ZZ', sens: 'DEP', std: 9 * 60, bc: 0, pc: 0, yc: 80 }], {});
  assert.deepEqual(classes.map(c => c.id), ['ZZ/YC']);
});

test('elles ont leur propre barème : un repas spécial coûte plus cher', () => {
  const classe = P.classesDeVols(VOLS_CS, {}).find(c => c.id === 'AF/SPML');
  const yc = P.classesDeVols(VOLS_CS, {}).find(c => c.id === 'AF/YC');
  const parTete = (c) => P.travailClasse('cuisine', c, P.BAREME_DEMO) / c.pax;
  assert.ok(parTete(classe) > parTete(yc) * 3,
    'un repas spécial pèse bien plus qu’un plateau d’économie');
});

test('elles se fabriquent et sortent comme les cabines', () => {
  const r = P.simuler({
    vols: VOLS_CS, liaisons: [{ from: 'cuisine', to: 'prepa' }],
    ateliers: [
      atelier({ id: 'cu', nom: 'Cuisine', service: 'cuisine', debut: '04:00', personnes: 6,
        lots: [['AF/SPML'], ['AF/CREW']] }),
      atelier({ id: 'mo', nom: 'Montage', service: 'prepa', debut: '04:00', personnes: 6,
        lots: [['AF/SPML', 'AF/CREW']] })
    ]
  });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  for (const id of ['AF/SPML', 'AF/CREW']) {
    assert.equal(r.parClasse[id].absente, false, id + ' est fabriquée');
    assert.ok(r.parClasse[id].fin != null);
  }
  // Le montage attend que la cuisine ait livré LES DEUX.
  const montage = r.lots.find(l => l.atelier === 'mo');
  const finCuisine = Math.max(...r.lots.filter(l => l.atelier === 'cu').map(l => l.fin));
  assert.equal(montage.debut, finCuisine);
});

/* ---- la plonge, tunnel par tunnel -------------------------------------- */

const plonge = (personnes, tunnels) => ({ id: 'pl', nom: 'Plonge', service: 'plonge',
  type: 'lavage', debut: '05:00', personnes, jour: 0, lots: [], tunnels });

test('un tunnel sans personne pour le tenir ne tourne pas, et on le dit', () => {
  // Trois tunnels à deux personnes chacun, mais l'équipe est à quatre.
  const a = plonge(4, [
    { nom: 'T1', debit: 300, personnes: 2 },
    { nom: 'T2', debit: 300, personnes: 2 },
    { nom: 'T3', debit: 300, personnes: 2 }
  ]);
  const etat = P.tunnelsQuiTournent(a);
  assert.deepEqual(etat.tournent.map(t => t.nom), ['T1', 'T2'], 'servis dans l’ordre décrit');
  assert.deepEqual(etat.sansPersonne.map(t => t.nom), ['T3']);
  assert.equal(etat.debit, 600, 'et non 900');
  assert.equal(P.debitLavage(a), 600);

  const r = P.simuler({ vols: VOLS_BOUCLE, liaisons: [], materiel: MAT, ateliers: [a] });
  assert.equal(r.ok, true, 'signalé, pas bloquant');
  assert.match(r.anomalies.map(x => x.message).join(' '), /T3.*ne tournent pas/s);
});

test('ajouter du monde fait tourner le tunnel qui manquait', () => {
  const tunnels = [
    { nom: 'T1', debit: 300, personnes: 2 },
    { nom: 'T2', debit: 300, personnes: 2 }
  ];
  assert.equal(P.debitLavage(plonge(2, tunnels)), 300);
  assert.equal(P.debitLavage(plonge(4, tunnels)), 600);
  // Au-delà, rien de plus : ce sont les tunnels qui lavent, pas les gens.
  assert.equal(P.debitLavage(plonge(10, tunnels)), 600);
  assert.equal(P.tunnelsQuiTournent(plonge(10, tunnels)).reste, 6, 'les personnes en trop sont comptées');
});

test('un tunnel à l’arrêt ne mobilise personne', () => {
  const a = plonge(2, [
    { nom: 'T1', debit: 300, personnes: 2, actif: false },
    { nom: 'T2', debit: 400, personnes: 2 }
  ]);
  assert.equal(P.debitLavage(a), 400, 'le tunnel arrêté laisse ses gens au suivant');
  assert.deepEqual(P.tunnelsQuiTournent(a).sansPersonne, []);
});

test('la durée du lavage suit le débit réellement disponible', () => {
  const jouer = (personnes) => P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [plonge(personnes, [
      { nom: 'T1', debit: 300, personnes: 2 },
      { nom: 'T2', debit: 300, personnes: 2 }
    ])]
  }).lots.find(l => l.unites !== undefined);
  const seul = jouer(2), deux = jouer(4);
  assert.equal(seul.fin - seul.debut, 20, '100 unités à 300/h');
  assert.equal(deux.fin - deux.debut, 10, 'deux tunnels tenus : deux fois plus vite');
});

test('le plafond de la plonge bride l’ensemble de ses tunnels', () => {
  const tunnels = [
    { nom: 'T1', debit: 300, personnes: 1 },
    { nom: 'T2', debit: 300, personnes: 1 },
    { nom: 'T3', debit: 300, personnes: 1 }
  ];
  const sans = P.tunnelsQuiTournent(plonge(3, tunnels));
  assert.equal(sans.somme, 900, 'les trois lignes valent 900');
  assert.equal(sans.debit, 900, 'sans plafond, rien ne les bride');
  assert.equal(sans.bride, false);

  const avec = P.tunnelsQuiTournent({ ...plonge(3, tunnels), plafond: 700 });
  assert.equal(avec.somme, 900, 'les lignes valent toujours 900');
  assert.equal(avec.debit, 700, 'mais l’ensemble ne dépasse pas son plafond');
  assert.equal(avec.bride, true, 'et le modèle le dit');
  assert.equal(P.debitLavage({ ...plonge(3, tunnels), plafond: 700 }), 700);
});

test('un plafond plus haut que les lignes ne change rien', () => {
  const a = { ...plonge(2, [{ nom: 'T1', debit: 300, personnes: 1 }]), plafond: 1000 };
  assert.equal(P.debitLavage(a), 300);
  assert.equal(P.tunnelsQuiTournent(a).bride, false);
});

test('les deux contraintes se cumulent : le personnel puis le plafond', () => {
  const tunnels = [
    { nom: 'T1', debit: 500, personnes: 2 },
    { nom: 'T2', debit: 500, personnes: 2 },
    { nom: 'T3', debit: 500, personnes: 2 }
  ];
  // Quatre personnes : deux lignes tournent, soit 1000 ; le plafond les ramène à 800.
  const a = { ...plonge(4, tunnels), plafond: 800 };
  const etat = P.tunnelsQuiTournent(a);
  assert.equal(etat.tournent.length, 2);
  assert.equal(etat.somme, 1000);
  assert.equal(etat.debit, 800);
});

test('le plafond change la durée réellement simulée', () => {
  const tunnels = [{ nom: 'T1', debit: 300, personnes: 1 }, { nom: 'T2', debit: 300, personnes: 1 }];
  const jouer = (plafond) => P.simuler({
    vols: VOLS_BOUCLE, liaisons: [], materiel: MAT,
    ateliers: [{ ...plonge(2, tunnels), ...(plafond ? { plafond } : {}) }]
  }).lots.find(l => l.unites !== undefined);
  const libre = jouer(null), bride = jouer(300);
  assert.equal(libre.fin - libre.debut, 10, '100 unités à 600/h');
  assert.equal(bride.fin - bride.debut, 20, 'le plafond de 300/h double la durée');
});

/* ---- le matériel se compte par passager ET par vol ---------------------- */

test('une quantité par vol ne bouge pas avec le remplissage', () => {
  // Six trolleys par vol en YC, rien au passager : c'est ainsi qu'on décrit un
  // matériel qui part avec l'avion, pas avec les gens.
  const unites = { YC: { parPax: 0, parVol: 6 } };
  const plein = P.retoursDeVols(
    [{ id: 'R', sens: 'RET', sta: 6 * 60, bc: 0, pc: 0, yc: 300 }], { unites, delaiRetour: 0 });
  const vide = P.retoursDeVols(
    [{ id: 'R', sens: 'RET', sta: 6 * 60, bc: 0, pc: 0, yc: 20 }], { unites, delaiRetour: 0 });
  assert.equal(plein[0].unites, 6);
  assert.equal(vide[0].unites, 6, 'un avion à moitié vide ramène autant de trolleys');
});

test('chaque classe a sa propre quantité', () => {
  // La porcelaine suit le passager, mais seulement en avant.
  const unites = {
    BC: { parPax: 4, parVol: 0 }, PC: { parPax: 2, parVol: 0 },
    YC: { parPax: 0, parVol: 6 }, CREW: { parPax: 1, parVol: 0 }, SPML: { parPax: 1, parVol: 0 }
  };
  const r = P.retoursDeVols(
    [{ id: 'R', sens: 'RET', sta: 6 * 60, bc: 10, pc: 20, yc: 200 }], { unites, delaiRetour: 0 });
  assert.equal(r[0].unites, 10 * 4 + 20 * 2 + 6, '40 + 40 + 6');
});

test('mettre les parPax à zéro retire le compte au passager', () => {
  const unites = Object.fromEntries(P.CABINES.map(c => [c, { parPax: 0, parVol: 3 }]));
  const classes = P.classesDeVols(VOLS, { delaiChargement: 45 })
    .filter(c => c.id === 'CRL/YC');
  assert.equal(P.besoinMateriel(classes, { unites }), classes[0].vols.length * 3,
    'seul le nombre de vols compte');
});

test('un réglage d’hier — un seul « unités par passager » — donne le même résultat', () => {
  const vols = [{ id: 'R', sens: 'RET', sta: 6 * 60, bc: 10, pc: 0, yc: 90 }];
  assert.equal(P.retoursDeVols(vols, { parPax: 1, delaiRetour: 0 })[0].unites, 100);
  assert.equal(P.retoursDeVols(vols, { parPax: 2, delaiRetour: 0 })[0].unites, 200);
  assert.deepEqual(P.unitesDe({ parPax: 2 }).BC, { parPax: 2, parVol: 0 });
  // Et sans rien du tout, la valeur d'attente.
  assert.deepEqual(P.unitesDe(undefined), P.UNITES_DEFAUT);
});

test('le besoin d’un lot suit la même règle que les retours', () => {
  const unites = { BC: { parPax: 4, parVol: 2 }, YC: { parPax: 0, parVol: 6 } };
  const classes = [
    { id: 'A/BC', cabine: 'BC', pax: 10, vols: [{}, {}] },
    { id: 'A/YC', cabine: 'YC', pax: 200, vols: [{}, {}] }
  ];
  assert.equal(P.besoinMateriel(classes, { unites }), 10 * 4 + 2 * 2 + 0 + 2 * 6, '40 + 4 + 12');
});
