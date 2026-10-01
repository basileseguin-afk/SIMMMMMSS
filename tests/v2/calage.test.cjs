/* Version 2 — le calage sur un mois réel. On fabrique un mois FICTIF dont on
 * connaît la vérité (le Montage prend 30 % de temps de plus que son barème),
 * on en tire les pointages qu'aurait produits cette réalité, et le calage
 * doit retrouver ce facteur — sur les jours qu'il apprend et sur ceux qu'il
 * n'a pas vus. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../v2/moteur/production.js');
const C = require('../../v2/calage.js');
const T = require('../../v2/tableur.js');
const UI = require('../../v2/ui-model.js');

const CIES = ['AF', 'TX', 'DL', 'QR', 'EK'];
const BAREME = { prepa: { '*/YC': 60 } };
const ARGS = {
  liaisons: [], bareme: BAREME, rendement: 1,
  parcours: [{ id: 'c1', nom: 'Montage', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
  ateliers: [{ id: 'mo', nom: 'Montage matin', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1,
    lots: CIES.map(c => [c + '/YC']), regime: { actif: true, seuils: [], presence: 120 } }]
};
// Un mois de 20 jours : de 1 à 5 vols, selon le jour.
const VRAI = 1.3;
const jours = Array.from({ length: 20 }, (_, d) => {
  const n = 1 + (d * 7) % 5;
  const vols = CIES.slice(0, n).map((cie, i) => ({ id: cie + d, cie, avion: 'A320', sens: 'DEP', std: 12 * 60 + i * 15, bc: 0, pc: 0, yc: 100, crew: 0, spml: 0 }));
  const planning = [{ service: 'prepa', equipe: 'Montage matin', debut: 300, fin: 420, duree: 120, personnes: 1, jour: 0 }];
  return { date: '2026-09-' + String(d + 1).padStart(2, '0'), vols, planning, pointages: [] };
});
// Ce que la réalité aurait pointé : la vacation, plus le débordement.
for (const j of jours) {
  const { parService } = C.simulerJour(P, { ...ARGS, heuresSup: { actif: true, plafond: 720 } }, j, { prepa: VRAI });
  const sup = (parService.get('prepa') || {}).sup || 0;
  j.pointages = [{ service: 'prepa', arrivee: 300, depart: 420 + sup, duree: 120 + sup }];
}

test('dates : numéro Excel, ISO, ou à la française', () => {
  assert.equal(C.dateDe(46266), '2026-09-01');
  assert.equal(C.dateDe('2026-9-4'), '2026-09-04');
  assert.equal(C.dateDe('04/09/2026'), '2026-09-04');
  assert.throws(() => C.dateDe('hier'), /illisible/);
});

test('les équipes du jour : heure, effectif et durée de poste du planning', () => {
  const { ateliers, inconnues } = C.ateliersDuJour(ARGS.ateliers.concat([{ id: 'x', nom: 'Soir', service: 'prepa', personnes: 2 }]),
    [{ service: 'prepa', equipe: 'MONTAGE  matin', debut: 270, fin: 750, duree: 480, personnes: 3 }, { service: 'prepa', equipe: 'Nuit', debut: 0, fin: 60, duree: 60, personnes: 1 }]);
  assert.equal(ateliers[0].debut, '04:30');
  assert.equal(ateliers[0].personnes, 3);
  assert.equal(ateliers[0].regime.presence, 480);
  assert.equal(ateliers[1].personnes, 0, 'pas au planning de ce jour : ne travaille pas');
  assert.deepEqual(inconnues, [{ service: 'prepa', equipe: 'Nuit' }]);
});

test('le réel : ce qui a été pointé au-delà du planning', () => {
  const r = C.reelParService({ planning: [{ service: 'prepa', personnes: 2, duree: 480 }],
    pointages: [{ service: 'prepa', duree: 480 }, { service: 'prepa', duree: 570 }] });
  assert.deepEqual(r.get('prepa'), { prevues: 960, pointees: 1050, sup: 90, personnes: 2 });
});

test('le calage retrouve la vitesse cachée, et prédit les jours qu’il n’a pas vus', async () => {
  const r = await C.ajuster(P, ARGS, jours);
  const s = r.services.find(x => x.service === 'prepa');
  assert.ok(Math.abs(r.facteurs.prepa - VRAI) <= 0.05, 'facteur trouvé : ' + r.facteurs.prepa);
  assert.equal(r.jours.apprendre, 15);
  assert.equal(r.jours.verifier, 5);
  assert.ok(s.avant.verifier.erreur > 30, 'au barème, l’erreur est grande : ' + s.avant.verifier.erreur);
  assert.ok(s.apres.verifier.erreur < 5, 'calé, il prédit les jours non vus : ' + s.apres.verifier.erreur);
  assert.ok(s.avant.apprendre.biais < 0, 'au barème, il sous-estime les heures sup');
  assert.equal(r.detail.length, 20);
});

test('le classeur modèle se relit tel quel', () => {
  const services = [{ id: 'prepa', nom: 'Montage' }];
  const lu = C.lireClasseur(C.classeurModele(), { T, parseVols: UI.parseFlightRows, service: T.correspondance(services) });
  assert.deepEqual(lu.avertissements, []);
  assert.equal(lu.jours.length, 2);
  assert.equal(lu.jours[0].vols.length, 2);
  assert.equal(lu.jours[0].planning[0].duree, 495);
  // Deux personnes prévues 8 h 15 ; l'une est restée 1 h 15 de plus.
  assert.equal(C.reelParService(lu.jours[0]).get('prepa').sup, 75);
  assert.equal(lu.cout.length, 2);
});

test('une ligne fautive est signalée, sans faire tomber le reste', () => {
  const f = C.classeurModele();
  f.find(x => x.nom === 'Pointages').lignes.push(['2026-09-02', 'Inconnu', 'Z', '04:00', '12:00']);
  const lu = C.lireClasseur(f, { T, parseVols: UI.parseFlightRows, service: T.correspondance([{ id: 'prepa', nom: 'Montage' }]) });
  assert.equal(lu.avertissements.length, 1);
  assert.match(lu.avertissements[0], /Pointages, ligne 6 : pointages : service inconnu « Inconnu »/);
  assert.equal(lu.jours.length, 2);
});

test('deux services enchaînés : seul le Montage est plus lent, le calage le distingue', async () => {
  const args = { ...ARGS, bareme: { cuisine: { '*/YC': 40 }, prepa: { '*/YC': 60 } },
    parcours: [{ id: 'c1', nom: 'Chaud', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] }],
    ateliers: ARGS.ateliers.concat([{ id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel', debut: '03:00', jour: 0, personnes: 1,
      lots: CIES.map(c => [c + '/YC']), regime: { actif: true, seuils: [], presence: 90 } }]) };
  const mois = jours.map(j => ({ ...j, planning: j.planning.concat([{ service: 'cuisine', equipe: 'Cuisine', debut: 180, fin: 270, duree: 90, personnes: 1, jour: 0 }]) }));
  for (const j of mois) {
    const { parService } = C.simulerJour(P, { ...args, heuresSup: { actif: true, plafond: 720 } }, j, { prepa: VRAI, cuisine: 1 });
    j.pointages = ['prepa', 'cuisine'].map(s => {
      const prevu = j.planning.find(p => p.service === s), sup = (parService.get(s) || {}).sup || 0;
      return { service: s, arrivee: prevu.debut, depart: prevu.fin + sup, duree: prevu.duree + sup };
    });
  }
  const r = await C.ajuster(P, args, mois);
  assert.ok(Math.abs(r.facteurs.prepa - VRAI) <= 0.06, 'Montage : ' + r.facteurs.prepa);
  assert.ok(Math.abs(r.facteurs.cuisine - 1) <= 0.06, 'Cuisine : ' + r.facteurs.cuisine);
});
