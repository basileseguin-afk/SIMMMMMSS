/* Évolution 21 (b) — l'effectif calculé d'un robot ne dépasse pas ses postes de travail.
 *
 * L'effectif d'une équipe de robot se calcule au barème, avec un minimum
 * (`personnesMin`). Le réglage « Postes de travail » (`personnesMax`), qui ne
 * limitait que les renforts, le plafonne aussi : entre son minimum et ce
 * maximum. Des personnes en plus n'accélèrent pas la ligne.
 *
 * Une journée fictive, calculée à la main : le barème du service du robot
 * donne 1 200 min par vol à XA et 720 à XB, soit 1 920 homme-minutes ; un
 * poste de 480 min : 4 personnes. La ligne fait 60 plateaux par heure. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../moteur/production.js');
const Periode = require('../moteur/periode.js');
const Reponses = require('../moteur/reponses.js');

const h = s => P.minutes(s);
const vol = (id, cie, std, yc) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc });
const VOLS = [vol('XA1', 'XA', '18:00', 120), vol('XB1', 'XB', '19:00', 90)];
const presence = minutes => ({ actif: true, presence: minutes, seuils: [] });
const robot = p => ({ id: 'rob', nom: 'rob', service: 'robot', type: 'robot', debut: '05:00', jour: 0, personnes: 2, personnesMin: 2, debit: 60,
  lots: [['XA/YC'], ['XB/YC']], pauses: [], regime: presence(480), effectif: 'calcule', ...p });
const ARGS = { vols: VOLS, liaisons: [], bareme: { robot: { 'XA/YC': 1200, 'XB/YC': 720 }, prepa: { 'XA/YC': 1200, 'XB/YC': 720 } }, rendement: 1 };
const jouer = (p, autres = []) => P.simuler({ ...ARGS, ateliers: [robot(p), ...autres] });
const vue = (r, id = 'rob') => r.ateliers.find(v => v.id === id);
const lignes = r => r.lots.filter(l => l.atelier === 'rob').map(l => [P.hhmm(l.debut), P.hhmm(l.fin), l.duree]);
const empreinte = r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);

test('un robot dont le calcul dépasse ses postes de travail : son effectif est le maximum, la durée de la ligne ne change pas', () => {
  const sans = jouer(), avec = jouer({ personnesMax: 3 });
  assert.deepEqual([vue(sans).personnes, sans.effectifs.rob.personnes], [4, 4], '1 920 homme-minutes ÷ 480 min : 4 personnes');
  assert.deepEqual([vue(avec).personnes, avec.effectifs.rob], [3, { personnes: 3, saisi: 2, hommeMinutes: 1920, poste: 480, rendement: 1, plafond: 3 }]);
  // La ligne va à son débit : XA de 05:00 à 07:00, XB de 07:00 à 08:30, dans les deux cas.
  assert.deepEqual(lignes(avec), [['05:00', '07:00', 120], ['07:00', '08:30', 90]]);
  assert.deepEqual(lignes(avec), lignes(sans));
});

test('sous le maximum, le calcul d’aujourd’hui ; au minimum, le minimum', () => {
  const sans = jouer(), large = jouer({ personnesMax: 6 }), juste = jouer({ personnesMax: 4 });
  assert.equal(JSON.stringify(large), JSON.stringify(sans), 'un maximum que le calcul n’atteint pas ne change rien, champ par champ');
  assert.equal(JSON.stringify(juste), JSON.stringify(sans), 'ni un maximum égal au calcul');
  // Le calcul sous le minimum (240 homme-minutes : une personne) : le minimum, comme aujourd'hui, avec ou sans maximum.
  const peu = { ...ARGS, bareme: { robot: { 'XA/YC': 120, 'XB/YC': 120 } } };
  const mini = P.simuler({ ...peu, ateliers: [robot({ personnesMax: 3 })] });
  assert.deepEqual([vue(mini).personnes, mini.effectifs.rob.plafond], [2, undefined]);
  assert.equal(JSON.stringify(mini), JSON.stringify(P.simuler({ ...peu, ateliers: [robot()] })));
});

test('sans maximum, le résultat d’avant, champ par champ', () => {
  // L'empreinte du résultat entier, relevée sur le commit d'avant.
  assert.equal(empreinte(jouer()), 'c7b4d48a5c07e1a4');
  assert.equal(jouer().effectifs.rob.plafond, undefined);
});

test('un maximum sous le minimum ne s’applique pas : le minimum l’emporte, un avis à corriger le dit, la journée se joue', () => {
  // (La fiche refuse cette saisie — tests/robot-plafond-browser.cjs ; elle peut venir d'un fichier d'avant.)
  const r = jouer({ personnesMax: 1 }), sans = jouer();
  assert.equal(r.ok, true);
  const a = r.anomalies.filter(x => x.code === 'personnesMax');
  assert.deepEqual(a.map(x => x.atelier), ['rob']);
  assert.match(a[0].message, /Postes de travail \(1\) sous le minimum pour tourner \(2\)\. Le plafond n’est pas appliqué/);
  assert.equal(require('../avis.js').niveauDuCode('personnesMax'), 'corriger', 'un avis à corriger, pas un blocage');
  // Le résultat est celui d'avant, à cet avis près.
  assert.deepEqual([vue(r).personnes, r.effectifs.rob], [4, sans.effectifs.rob]);
  assert.equal(JSON.stringify({ ...r, anomalies: r.anomalies.filter(x => x.code !== 'personnesMax') }), JSON.stringify(sans));
  // Un robot dont l'effectif est saisi : ni plafond, ni avis — le résultat d'avant, champ par champ.
  const saisi = p => P.simuler({ ...ARGS, ateliers: [robot({ effectif: undefined, personnes: 5, ...p })] });
  assert.equal(JSON.stringify(saisi({ personnesMax: 1 })), JSON.stringify(saisi()));
  // À égalité, le plafond s'applique : l'effectif calculé est ce nombre.
  const egal = jouer({ personnesMax: 2 });
  assert.deepEqual([egal.ok, vue(egal).personnes, egal.anomalies.filter(x => x.code === 'personnesMax')], [true, 2, []]);
});

test('le robot saisi et les équipes à la main ne changent pas', () => {
  // Un robot dont l'effectif est saisi : ses postes de travail ne limitent que ses renforts, comme aujourd'hui.
  const saisi = p => P.simuler({ ...ARGS, ateliers: [robot({ effectif: undefined, personnes: 5, ...p })] });
  assert.equal(JSON.stringify(saisi({ personnesMax: 3 })), JSON.stringify(saisi()));
  // Une équipe à la main calculée : 1 920 homme-minutes, 4 personnes, avec ou sans postes de travail.
  const main = p => ({ id: 'main', nom: 'main', service: 'prepa', type: 'manuel', debut: '05:00', jour: 0, personnes: 1, lots: [['XA/YC'], ['XB/YC']], pauses: [],
    regime: presence(480), effectif: 'calcule', ...p });
  const avec = P.simuler({ ...ARGS, ateliers: [main({ personnesMax: 3 })] }), sans = P.simuler({ ...ARGS, ateliers: [main()] });
  assert.equal(avec.ateliers[0].personnes, 4);
  assert.equal(JSON.stringify(avec), JSON.stringify(sans));
});

test('le besoin, les indicateurs de charge et les réponses lisent l’effectif plafonné', () => {
  const args = p => ({ ...ARGS, ateliers: [robot(p)] });
  const equipe = p => Periode.extraire(P.simuler(args(p)), args(p), '2026-01-05').equipes.find(e => e.id === 'rob');
  assert.deepEqual([equipe().besoin, equipe().personnes], [4, 4]);
  assert.deepEqual([equipe({ personnesMax: 3 }).besoin, equipe({ personnesMax: 3 }).personnes], [3, 3], 'le besoin ne dépasse pas les postes de travail');
  // Un besoin sous le maximum reste exact : 1 200 homme-minutes ÷ 480 = 2,5 personnes.
  const peu = p => { const a = { ...args(p), bareme: { robot: { 'XA/YC': 600, 'XB/YC': 600 } } }; return Periode.extraire(P.simuler(a), a, '2026-01-05').equipes.find(e => e.id === 'rob'); };
  assert.deepEqual([peu({ personnesMax: 3 }).besoin, peu({ personnesMax: 3 }).personnes], [2.5, 3]);
  // Les indicateurs de charge comptent les personnes de l'équipe : 3 présentes.
  const r = P.simuler(args({ personnesMax: 3 })), k = require('../moteur/indicateurs.js').journee(r, args({ personnesMax: 3 }));
  assert.equal(k.equipes.find(e => e.id === 'rob').personnes, 3);
  // Les réponses : l'encadrement du service du robot lit le même besoin.
  const besoinDuService = a => Reponses.reponses(P.simuler(a), a).personnes.services.find(s => s.service === 'robot').besoin;
  assert.deepEqual([besoinDuService(args()), besoinDuService(args({ personnesMax: 3 }))], [4, 3]);
});

/* ---- la sauvegarde et Excel --------------------------------------------- */
const A = require('../ateliers.js');
const J = require('../moteur/journee.js');
const T = require('../tableur.js');
const E = require('../echanges.js');

test('sauvegarde, restauration, export et import Excel : les postes de travail du robot', async () => {
  // L'unité : une équipe de robot, un chemin qui passe par son service.
  const unite = ateliers => A.valider({ schema: 'ory-ateliers', version: 1, ateliers, parcours: [{ id: 'c1', nom: 'Chemin', noeuds: ['robot'], liens: [] }], parcoursCabine: { YC: 'c1' } });
  const etat = unite([robot({ personnesMax: 3 })]);
  assert.equal(etat.ateliers[0].personnesMax, 3);
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(etat))), etat, 'la sauvegarde se relit telle quelle');
  // Une sauvegarde d'avant, sans postes de travail : rien de nouveau.
  assert.equal('personnesMax' in unite([robot()]).ateliers[0], false);
  // La journée jouée depuis la sauvegarde restaurée : l'effectif du robot est plafonné.
  const sauvegarde = e => ({ schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': e, 'ory-modele-v1': { bareme: ARGS.bareme, rendement: 1, regime: { seuils: [], presence: 480 } } } });
  const jouee = e => J.jouer(J.argumentsDeLaJournee(sauvegarde(e), VOLS));
  assert.deepEqual([vue(jouee(etat)).personnes, jouee(etat).effectifs.rob.plafond], [3, 3]);
  assert.equal(vue(jouee(unite([robot()]))).personnes, 4);
  // Le classeur Excel : la colonne « Postes de travail », aller et retour.
  const CTX = { services: [{ id: 'robot', nom: 'ROBOT' }], programme: [], classes: [] };
  const f = await T.lireClasseur(T.ecrireClasseur(E.ateliersVersClasseur(etat, CTX)));
  const entetes = f.find(x => x.nom === 'Ateliers').lignes[0];
  assert.ok(entetes.includes('Postes de travail'));
  const relu = A.valider(E.classeurVersAteliers(f, etat, CTX).etat);
  assert.deepEqual([relu.ateliers[0].type, relu.ateliers[0].personnesMin, relu.ateliers[0].personnesMax], ['robot', 2, 3], 'aller-retour');
});
