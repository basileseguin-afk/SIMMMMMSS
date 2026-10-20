/* Banc d'essai, évolution 2 — les heures supplémentaires (v1) : une équipe
 * dont le travail n'est pas fini à la fin de sa présence reste, jusqu'à un
 * plafond par personne, au lieu de partir en laissant ses lots hors poste.
 * La règle et ses noms sont ceux de la version 2 (tests/v2/heures-sup.test.cjs).
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');
const R = require('../reglages.js');

const h = s => P.minutes(s);
const VOLS = ['NORD', 'SUD', 'EST'].map((cie, i) => ({ id: cie.slice(0, 2) + '1', cie, sens: 'DEP', std: h('12:00') + i * 10, bc: 0, pc: 0, yc: 100 }));
// Une heure de montage par vol : trois heures de travail pour une personne.
const BAREME = { prepa: { '*/YC': 60 } };
const CHEMIN = { id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] };
const equipe = p => ({ id: 'mo', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1,
  lots: [['NORD/YC'], ['SUD/YC'], ['EST/YC']], regime: { actif: true, seuils: [], presence: 140 }, ...p });
const jouer = (heuresSup, p, autres = []) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [equipe(p), ...autres],
  parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup });
const vue = (r, id = 'mo') => r.ateliers.find(a => a.id === id);

test('une équipe qui finit dans son poste n’a pas d’heures sup', () => {
  const r = jouer({ actif: true, plafond: 180 }, { personnes: 2 });
  assert.equal(vue(r).heuresSup, 0);
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('une équipe qui déborde de 40 min a 40 min d’heures sup, et finit tout', () => {
  const r = jouer({ actif: true, plafond: 180 });
  assert.equal(vue(r).presence, 140);
  assert.equal(vue(r).heuresSup, 40, 'trois heures de travail pour 2 h 20 de présence');
  assert.equal(vue(r).fin, h('08:00'));
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('le plafond coupe : au-delà, le lot reste hors poste, comme aujourd’hui', () => {
  const r = jouer({ actif: true, plafond: 30 });
  assert.equal(vue(r).heuresSup, 30, 'la tâche coupée compte jusqu’au plafond');
  const coupe = r.lots.find(l => l.classes.includes('EST/YC'));
  assert.equal(coupe.horsPoste, true);
  assert.equal(r.indicateurs.pasFinies, 1);
});

test('sans l’option, ou désactivée : l’équipe part à la fin de sa présence, rien ne change', () => {
  const sans = jouer(undefined), off = jouer({ actif: false, plafond: 180 });
  assert.equal(vue(sans).heuresSup, 0);
  assert.equal(sans.indicateurs.pasFinies, 1, 'la troisième commande n’est pas faite');
  assert.deepEqual(JSON.parse(JSON.stringify(off)), JSON.parse(JSON.stringify(sans)));
});

test('une mise à disposition et une équipe d’appui n’ont pas d’heures sup', () => {
  const dispo = { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [],
    regime: { actif: true, seuils: [], presence: 60 }, permanent: false, vagues: [{ debut: '05:00', jour: 0 }, { debut: '09:00', jour: 0 }] };
  const appui = { id: 'ap', nom: 'Tri', service: 'prepa', type: 'appui', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [],
    regime: { actif: true, seuils: [], presence: 60 }, minutesVol: { '*': 30 } };
  const r = jouer({ actif: true, plafond: 180 }, {}, [dispo, appui]);
  assert.equal(vue(r, 'mag').heuresSup, 0, 'sa dernière vague passe sa présence : ce n’est pas du travail');
  assert.equal(vue(r, 'ap').heuresSup, 0);
  assert.equal(vue(r, 'ap').fin, h('06:00'), 'l’appui part à la fin de sa présence');
});

test('l’effectif calculé ne change pas : il se calcule sur la présence, jamais sur présence + plafond', () => {
  const calc = { effectif: 'calcule', personnes: 1, regime: { actif: true, seuils: [], presence: 120 } };
  const args = hs => ({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers: [equipe(calc)],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, effectifCalcule: ['prepa'], heuresSup: hs });
  const sans = P.simuler(args(undefined)), avec = P.simuler(args({ actif: true, plafond: 720 }));
  assert.equal(sans.effectifs.mo.personnes, 2, '180 min de travail pour 120 de poste');
  assert.deepEqual(avec.effectifs, sans.effectifs);
});

test('un robot continue sa ligne en heures sup ; l’équipe suivante attend la ligne', () => {
  const robot = (id, debut, presence) => ({ id, nom: id, service: 'prepa', type: 'robot', debut, jour: 0, personnes: 1, pauses: [],
    lots: [[id === 'r1' ? 'NORD/YC' : 'SUD/YC']], regime: { actif: true, seuils: [], presence }, debit: 100, personnesMin: 1 });
  // 100 plateaux à 100 / h : une heure de ligne, pour 40 minutes de présence.
  const a = { vols: VOLS.slice(0, 2), liaisons: [], rendement: 1, ateliers: [robot('r1', '05:00', 40), robot('r2', '05:30', 240)],
    parcours: [CHEMIN], parcoursCabine: { YC: 'c1' } };
  const r = P.simuler({ ...a, heuresSup: { actif: true, plafond: 60 } });
  assert.equal(vue(r, 'r1').heuresSup, 20);
  assert.equal(vue(r, 'r1').fin, h('06:00'));
  assert.equal(r.lots.find(l => l.atelier === 'r2').debut, h('06:00'), 'la ligne est tenue jusqu’à 06:00');
  const sans = P.simuler(a);
  assert.equal(sans.lots.find(l => l.atelier === 'r1').horsPoste, true, 'sans heures sup, le lot reste hors poste');
});

/* La plonge par vol : deux équipes qui se relaient sur leurs tunnels. */
const plongeur = (id, debut, tunnels) => ({ id, nom: id, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 1, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence: 480 }, parVol: true, durees: { '*': 30 }, tunnels: tunnels.map(nom => ({ nom, personnes: 1, actif: true })) });
const retour = (id, sta) => ({ id, cie: 'NORD', sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const MAT = { actif: true, delaiRetour: 0, retours: 'programme', stockInitial: 0, unites: { YC: { parVol: 10 } } };

test('plonge par vol : en heures sup, l’équipe finit le vol commencé ; un vol revenu après va à l’équipe suivante', () => {
  const r = P.simuler({ vols: [retour('NO8', '12:50'), retour('NO9', '13:10')], liaisons: [], rendement: 1, materiel: MAT,
    ateliers: [plongeur('matin', '05:00', ['T1']), plongeur('soir', '13:00', ['T1'])], heuresSup: { actif: true, plafond: 60 } });
  const l8 = r.lots.find(l => l.vol === 'NO8'), l9 = r.lots.find(l => l.vol === 'NO9');
  assert.deepEqual([l8.atelier, P.hhmm(l8.debut), P.hhmm(l8.fin)], ['matin', '12:50', '13:20'], 'revenu à 12:50 : le matin le finit');
  assert.equal(l9.atelier, 'soir', 'revenu à 13:10, après la présence du matin');
  assert.equal(P.hhmm(l9.debut), '13:20', 'le même tunnel, libre à 13:20');
  assert.equal(vue(r, 'matin').heuresSup, 20);
  assert.equal(vue(r, 'soir').heuresSup, 0);
});

test('plonge par vol : à égalité, l’équipe dans ses heures plutôt que celle en heures sup (comme la v2)', () => {
  // NO7 occupe le tunnel du matin jusqu'à 13:00 ; NO8, revenu à 12:50, finirait
  // à 13:30 chez le matin (en heures sup) comme chez le soir (dans ses heures).
  const r = P.simuler({ vols: [retour('NO7', '12:30'), retour('NO8', '12:50')], liaisons: [], rendement: 1, materiel: MAT,
    ateliers: [plongeur('matin', '05:00', ['T1']), plongeur('soir', '13:00', ['T2'])], heuresSup: { actif: true, plafond: 60 } });
  const l8 = r.lots.find(l => l.vol === 'NO8');
  assert.deepEqual([l8.atelier, P.hhmm(l8.fin)], ['soir', '13:30']);
  assert.equal(vue(r, 'matin').heuresSup, 0);
});

test('plonge au débit : elle s’arrête à la fin de sa présence, heures sup permises ou non (correction 7)', () => {
  const p = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1, pauses: [], lots: [],
    regime: { actif: true, seuils: [], presence: 120 }, tunnels: [{ nom: 'T1', debit: 60, personnes: 1, actif: true }] };
  const mat = { ...MAT, unites: { YC: { parVol: 60 } } };
  const r = P.simuler({ vols: [retour('NO8', '06:30'), retour('NO9', '07:10')], liaisons: [], rendement: 1, materiel: mat,
    ateliers: [p], heuresSup: { actif: true, plafond: 180 } });
  assert.equal(vue(r, 'pl').heuresSup, 0, '60 u revenues à 06:30 : à 07:00, elle en a lavé la moitié, et s’en va');
  assert.equal(vue(r, 'pl').finPoste, h('07:00'), 'sa fin de poste : la fin de sa présence');
  assert.equal(Math.round(r.plonge.resteSale), 90, 'les 30 u de 06:30 et les 60 u de 07:10 attendent l’équipe suivante');
  assert.deepEqual(r.saleFinal.map(x => [x.vol, Math.round(x.unites)]), [['NO8', 30], ['NO9', 60]]);
  const sans = P.simuler({ vols: [retour('NO8', '06:30')], liaisons: [], rendement: 1, materiel: mat, ateliers: [p] });
  assert.equal(vue(sans, 'pl').heuresSup, 0);
  assert.equal(Math.round(sans.plonge.resteSale), 30, 'sans heures sup, la moitié reste sale');
});

/* Le handling d'une équipe (sans créneaux de chauffeurs) charge ses vols jusqu'au plafond. */
const handling = p => ({ id: 'h', nom: 'Handling', service: 'quais', type: 'handling', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence: 120 }, durees: { '*': 40 }, compagnies: [], simultanes: 1, ...p });
const DEPARTS = ['06:00', '06:30', '07:30', '08:30'].map((t, i) => ({ id: 'SU' + (i + 1), cie: 'SUD', sens: 'DEP', std: h(t), bc: 0, pc: 0, yc: 10 }));
// Une prépa qui a tout fini à 00:04 : le handling n'attend rien.
const PREPA = { id: 'pr', nom: 'Prépa', service: 'prepa', type: 'manuel', debut: '00:00', jour: 0, personnes: 1, pauses: [], lots: [['SUD/YC']], regime: { actif: false } };
const jouerHandling = (hs, p) => P.simuler({ vols: DEPARTS, liaisons: [], bareme: { prepa: { '*/YC': 1 } }, rendement: 1,
  ateliers: [PREPA, handling(p)], parcours: [CHEMIN], parcoursCabine: { YC: 'c1' }, heuresSup: hs });

test('handling : l’équipe reste charger le vol suivant, dans le plafond', () => {
  const sans = jouerHandling(undefined);
  assert.equal(sans.lots.filter(l => l.handling && !l.impossible).length, 3, 'sans heures sup, trois vols chargés avant 07:00');
  const r = jouerHandling({ actif: true, plafond: 60 });
  assert.equal(r.lots.filter(l => l.handling && !l.impossible).length, 4);
  assert.equal(vue(r, 'h').heuresSup, 40, 'le quatrième chargé de 07:00 à 07:40');
});

test('handling à créneaux : ses chauffeurs viennent à leurs créneaux, l’équipe n’a pas d’heures sup', () => {
  // Un seul chauffeur : un vol après l'autre, jusqu'à 07:40.
  const r = jouerHandling({ actif: true, plafond: 180 }, { creneaux: [{ de: '05:00', a: '12:00', n: 1 }] });
  assert.ok(vue(r, 'h').fin > h('07:00'), 'elle charge au-delà de sa présence');
  assert.equal(vue(r, 'h').heuresSup, 0);
});

test('le réglage se range dans ory-modele-v1 : gardé une fois réglé, borné, absent d’un état d’avant', () => {
  const avant = R.valider({ rendement: 0.9 });
  assert.equal('heuresSup' in avant, false, 'un état d’avant reste tel quel');
  assert.deepEqual(R.valider({ heuresSup: { actif: true, plafond: 720 } }).heuresSup, { actif: true, plafond: 720 });
  assert.deepEqual(R.valider({ heuresSup: { actif: 'oui', plafond: 5000 } }).heuresSup, { actif: false, plafond: 720 });
  assert.deepEqual(R.valider({ heuresSup: { actif: true, plafond: 'x' } }).heuresSup, { actif: true, plafond: 180 }, 'défaut : 3 h');
  // Relu tel quel (Restaurer, rechargement).
  const lu = R.valider({ heuresSup: { actif: true, plafond: 90 } });
  assert.deepEqual(R.valider(JSON.parse(JSON.stringify(lu))), lu);
});

test('la journée reçoit la règle du barème ; le banc peut la forcer', () => {
  const REF = require('./non-regression.attendu.json').scenarios.find(s => s.nom === 'unite-vol');
  const sv = JSON.parse(JSON.stringify(REF.sauvegarde));
  assert.equal(J.argumentsDeLaJournee(sv, REF.args.vols, REF.options).heuresSup, undefined, 'sans réglage, pas d’option');
  sv.contenu['ory-modele-v1'].heuresSup = { actif: true, plafond: 180 };
  assert.deepEqual(J.argumentsDeLaJournee(sv, REF.args.vols, REF.options).heuresSup, { actif: true, plafond: 180 });
  // Le banc porte le plafond à 12 h pour voir tout le débordement.
  const banc = J.argumentsDeLaJournee(sv, REF.args.vols, { ...REF.options, heuresSup: { plafond: 720 } });
  assert.deepEqual(banc.heuresSup, { actif: true, plafond: 720 });
  assert.deepEqual(J.argumentsDeLaJournee(REF.sauvegarde, REF.args.vols, { heuresSup: { actif: true, plafond: 720 } }).heuresSup, { actif: true, plafond: 720 });
  assert.throws(() => J.argumentsDeLaJournee(REF.sauvegarde, REF.args.vols, { heuresSup: { plafon: 720 } }), /modele\.heuresSup\.plafon/);
  // L'unité « au débit » : son montage ne finit pas dans sa présence.
  const D = require('./non-regression.attendu.json').scenarios.find(s => s.nom === 'unite-debit');
  const sans = J.jouer(J.argumentsDeLaJournee(D.sauvegarde, D.args.vols, D.options));
  const r = J.jouer(J.argumentsDeLaJournee(D.sauvegarde, D.args.vols, { ...D.options, heuresSup: { actif: true, plafond: 720 } }));
  // Le montage « mo » attend du matériel propre au-delà de sa présence : il part à sa fin, sans heures sup (correction 4 :
  // on ne paie personne à attendre) ; « mo2 » travaille en heures sup.
  assert.equal(r.ateliers.find(a => a.id === 'mo').heuresSup, 0, 'le montage n’attend pas en heures sup');
  assert.ok(r.ateliers.find(a => a.id === 'mo2').heuresSup > 0, 'l’autre montage reste en heures sup');
  assert.ok(r.ateliers.every(a => a.heuresSup >= 0 && a.heuresSup <= 720));
  assert.ok(r.indicateurs.pasFinies < sans.indicateurs.pasFinies, 'et finit des commandes qu’il laissait');
  assert.deepEqual(r.effectifs, sans.effectifs, 'les mêmes effectifs calculés');
});
