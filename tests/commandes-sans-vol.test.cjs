/* Banc d'essai, correction 1 — une commande d'une équipe qui ne vole pas ce
 * jour-là (v1) : bien écrite, elle est absente de la journée, l'équipe passe
 * ce lot et fait les autres, et on le dit sans bloquer ; une compagnie qu'on ne
 * voit nulle part ailleurs ajoute un avertissement (faute de frappe ?) ; mal
 * écrite, elle reste refusée (docs/BANC_ESSAI.md § 1). Vols, compagnies et
 * équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const J = require('../moteur/journee.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, p) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, crew: 4, ...p });
// Ce jour-là, seule SUD vole. NORD vole d'autres jours : le barème la connaît, et les équipes ont ses commandes.
const VOLS = [dep('SU1', 'SUD', '12:00'), dep('SU2', 'SUD', '14:00')];
const BAREME = { prepa: { '*/YC': 30, '*/CREW': 10, 'NORD/YC': 40 } };
const CHEMIN = { id: 'c', nom: 'Montage', noeuds: ['prepa'], liens: [] };
const equipe = (id, lots, p) => ({ id, nom: id === 'mo' ? 'Montage' : 'Montage 2', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, pauses: [],
  lots, regime: { actif: false }, ...p });
const jouer = (ateliers, plus = {}) => P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, ateliers, parcours: [CHEMIN],
  parcoursCabine: { YC: 'c', CREW: 'c', BC: 'c' }, ...plus });
const codes = r => r.anomalies.map(a => a.code);

test('un jour sans aucun vol d’une compagnie, la journée se joue : ses commandes sont absentes, les autres sont faites', () => {
  const r = jouer([equipe('mo', [['NORD/CREW'], ['SUD/YC'], ['NORD/YC', 'SUD/CREW']])]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lots.map(l => [l.nom, l.debut, l.fin]), [['SUD/YC', h('06:00'), h('07:00')], ['SUD/CREW', h('07:00'), h('07:20')]],
    'l’équipe passe NORD/CREW, et fait SUD/CREW sans NORD/YC');
  assert.deepEqual(codes(r), ['commande-absente'], 'une information, rien de bloquant');
  const info = r.anomalies[0];
  assert.deepEqual([info.atelier, info.classes], ['mo', ['NORD/CREW', 'NORD/YC']]);
  assert.match(info.message, /^Montage : NORD\/CREW, NORD\/YC n’ont aucun vol ce jour-là : elles ne sont pas dans la journée\.$/);
  assert.ok(r.parClasse['SUD/YC'].aHeure && r.parClasse['SUD/CREW'].aHeure);
  assert.equal('NORD/CREW' in r.parClasse, false, 'pas une commande de la journée');
  assert.equal(r.indicateurs.pasFinies, 0);
});

test('une équipe dont aucune commande ne vole ce jour-là n’est pas « une équipe qui ne fabrique rien »', () => {
  const r = jouer([equipe('mo', [['NORD/CREW'], ['NORD/YC']]), equipe('m2', [['SUD/YC']])]);
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r), ['commande-absente']);
  assert.deepEqual(r.ateliers.find(a => a.id === 'mo').lots, []);
  // Son effectif calculé : personne, ce jour-là.
  const calc = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, parcours: [CHEMIN], parcoursCabine: { YC: 'c', CREW: 'c' },
    ateliers: [equipe('mo', [['NORD/CREW'], ['NORD/YC']], { effectif: 'calcule', regime: { actif: true, seuils: [], presence: 240 } })], effectifCalcule: ['prepa'] });
  assert.equal(calc.ok, true);
  assert.equal(calc.effectifs.mo.personnes, 0);
});

test('une commande mal écrite est toujours refusée, en la nommant', () => {
  for (const id of ['NORD/CRWE', 'NORDCREW', 'nord/YC', 'NORD/YC/BC', 'NORD/@XX']) {
    const r = jouer([equipe('mo', [[id], ['SUD/YC']])]);
    assert.equal(r.ok, false, id);
    assert.deepEqual(codes(r), ['lot'], id);
    assert.ok(r.anomalies[0].message.includes('compagnie × classe inconnue : ' + id), id);
  }
});

test('une compagnie qu’on ne voit nulle part ailleurs : un avertissement, pas un refus', () => {
  // NROD : ni dans les vols, ni au barème, ni ajoutée, ni dans une autre commande des lots.
  const r = jouer([equipe('mo', [['NROD/CREW'], ['SUD/YC']]), equipe('m2', [['NROD/CREW']])]);
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r).sort(), ['commande-absente', 'commande-absente', 'compagnie-inconnue']);
  const avis = r.anomalies.find(a => a.code === 'compagnie-inconnue');
  assert.equal(avis.message, 'compagnie jamais vue : NROD — faute de frappe ? (NROD/CREW, dans Montage, Montage 2)');
  assert.deepEqual([avis.cie, avis.classes], ['NROD', ['NROD/CREW']]);
  assert.deepEqual(r.lots.map(l => l.nom), ['SUD/YC']);
  // Vue ailleurs, elle n'est plus suspecte : dans une autre commande des lots, dans le barème, ou dans les vols du jour (un retour).
  for (const plus of [{ ateliers: [equipe('mo', [['NROD/CREW'], ['NROD/YC']])] }, { bareme: { prepa: { ...BAREME.prepa, 'NROD/BC': 20 } } },
    { vols: VOLS.concat([{ id: 'NR1', cie: 'NROD', sens: 'RET', sta: h('09:00'), bc: 0, pc: 0, yc: 100 }]) }]) {
    const x = P.simuler({ vols: VOLS, liaisons: [], bareme: BAREME, rendement: 1, parcours: [CHEMIN], parcoursCabine: { YC: 'c', CREW: 'c' },
      ateliers: [equipe('mo', [['NROD/CREW']])], ...plus });
    assert.equal(x.ok, true);
    assert.ok(!codes(x).includes('compagnie-inconnue'), JSON.stringify(Object.keys(plus)));
  }
});

test('une commande ajoutée, ou l’armement d’une compagnie cochée, reste une commande de la journée, sans vol', () => {
  const ajoutee = { id: 'NORD/CREW', cie: 'NORD', cabine: 'CREW', pax: 0, vols: [], echeance: 1440, origine: 'ajoutee' };
  const r = jouer([equipe('mo', [['NORD/CREW'], ['SUD/YC']])], { classes: P.classesDeVols(VOLS).concat([ajoutee]) });
  assert.equal(r.ok, true);
  assert.ok(!codes(r).includes('commande-absente'), 'déclarée : elle est dans la journée, sans vol');
  // L'armement (catégories par compagnie) : une compagnie qu'une équipe coche a sa commande chaque jour, même sans vol (comme avant).
  const cats = { prepa: [{ id: 'TB', nom: 'Trolleys bar', minutes: { '*': 10 } }] };
  const c = jouer([equipe('mo', [['NORD/@TB'], ['SUD/@TB']])], { categories: cats });
  assert.equal(c.ok, true);
  assert.ok(!codes(c).includes('commande-absente'));
  assert.deepEqual(c.lots.map(l => [l.nom, l.hommeMinutes]), [['NORD/@TB', 0], ['SUD/@TB', 20]]);
});

test('même comportement par l’outil : la sauvegarde d’une unité, une journée sans une de ses compagnies', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: [equipe('mo', [['NORD/CREW'], ['SUD/YC']])], parcours: [CHEMIN], parcoursCabine: { YC: 'c', CREW: 'c' },
    effectifs: { prepa: 'impose' } };
  const sauvegarde = { schema: 'ory-sauvegarde', version: 1, contenu: { 'ory-ateliers-v1': etat, 'ory-modele-v1': { bareme: BAREME, rendement: 1, regime: { seuils: [], presence: 480 } } } };
  const r = J.jouer(J.argumentsDeLaJournee(sauvegarde, VOLS));
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r), ['commande-absente']);
  assert.deepEqual(r.lots.map(l => l.nom), ['SUD/YC']);
});
