/* Correction 18, retouches d'affichage — la fin d'un service se lit contre
 * l'horaire de ses équipes qui travaillent ce jour-là (moteur/reponses.js,
 * synthese-vue.js, echanges-reponses.js) :
 *   — une équipe sans lot ce jour-là (sa commande n'a pas de vol) ne prête
 *     pas son horaire au service : la fin d'horaire est celle des équipes qui
 *     travaillent ;
 *   — quand une équipe dépasse, la ligne de la Synthèse et la carte « Où ça
 *     coince » la nomment, avec sa propre fin et son propre horaire
 *     (« l'équipe … finit à hh:mm pour hh:mm ») ;
 *   — le tableau « Les services » a une colonne de moins : les heures sup se
 *     lisent sous la fin, dans la même colonne.
 * Des journées fictives calculées à la main. Le poste par défaut : 8 h de
 * présence, 15 min de pause après 3 h de travail, 45 min après 6 h. Le moteur
 * et les indicateurs ne changent pas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');
const ER = require('../echanges-reponses.js');

const h = s => P.minutes(s);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, debut, personnes, lots, x) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes, lots, regime: { actif: true }, ...x });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const jouer = args => { const a = { liaisons: [], rendement: 1, noms: { prepa: 'Montage' }, heuresSup: { actif: true, plafond: 120 }, ...args }; return { r: P.simuler(a), args: a }; };
const fin = (rep, service = 'prepa', jour = 0) => rep.fins.services.find(s => s.service === service && s.jour === jour);
const rang = (rep, service = 'prepa') => SV.tableau(rep, [service]).split('<tr data-service="' + service + '"')[1].split('</tr>')[0];

// Le montage a trois équipes : le matin (06:00–14:00), le soir (13:00–21:00), la nuit (22:00–06:00 le lendemain). La commande
// de la nuit n'a pas de vol ce jour-là : elle ne travaille pas. `matin` et `soir` : les minutes de travail de chacune.
const TROIS = (matin, soir) => jouer({ vols: [dep('NO1', 'NORD', '23:30'), dep('SU1', 'SUD', '23:45')], bareme: { prepa: { 'NORD/YC': matin, 'SUD/YC': soir, 'EST/YC': 120 } },
  ateliers: [eq('matin', 'prepa', '06:00', 1, [['NORD/YC']]), eq('soir', 'prepa', '13:00', 1, [['SUD/YC']]), eq('nuit', 'prepa', '22:00', 1, [['EST/YC']])],
  parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });

test('trois équipes, une absente, une qui dépasse : la fin d’horaire est celle des équipes qui travaillent ce jour-là', () => {
  // Le matin : 240 min, de 06:00 à 10:15 (15 min de pause à 09:00), dans son horaire (14:00). Le soir : 450 min, de 13:00 à
  // 21:30 (pauses à 16:00 et à 19:15), 30 min après son horaire (21:00). La nuit n'a pas de lot.
  const { r, args } = TROIS(240, 450), k = I.journee(r, args), rep = R.reponses(r, args, { k }), f = fin(rep);
  assert.deepEqual(r.ateliers.map(v => [v.id, v.fin, (v.lots || []).length]), [['matin', h('10:15'), 1], ['soir', h('21:30'), 1], ['nuit', null, 0]]);
  assert.equal(f.fin, h('21:30'));
  assert.equal(f.finHoraire, h('21:00'), 'l’horaire du soir, pas celui de l’équipe de nuit (06:00 le lendemain)');
  assert.equal(f.depasse, 30);
  assert.deepEqual(f.equipes.map(e => [e.id, e.fin, e.finHoraire, e.depasse]), [['matin', h('10:15'), h('14:00'), 0], ['soir', h('21:30'), h('21:00'), 30]], 'les équipes qui travaillent');
  assert.deepEqual(f.equipeQuiDepasse, { id: 'soir', nom: 'soir', fin: h('21:30'), finHoraire: h('21:00'), depasse: 30 });
  assert.equal(f.heuresSup.total, 30, 'ses heures sup ne changent pas');
  // La ligne de la Synthèse : la fin, l'équipe qui dépasse avec sa fin et son horaire, les heures sup dessous, dans la même case.
  const ligne = rang(rep);
  assert.match(ligne, /class="sy-fin" data-ton="attente"[^>]*>[\s\S]*<span class="sy-v">21:30<\/span>/);
  assert.match(ligne, /l’équipe soir finit à 21:30 pour 21:00/);
  assert.doesNotMatch(ligne.split('class="sy-fin"')[1], /J\+1|06:00/, 'plus l’horaire de l’équipe absente');
  assert.match(ligne.split('class="sy-fin"')[1], /heures sup 30 min/, 'les heures sup, sous la fin');
  // La carte « Où ça coince » nomme l'équipe ; la phrase de tête reste courte.
  const g = rep.coince.goulot;
  assert.deepEqual([g.service, g.depasse, g.equipe], ['prepa', 30, { id: 'soir', nom: 'soir', fin: h('21:30'), finHoraire: h('21:00'), depasse: 30 }]);
  assert.match(SV.carteCoince(rep).corps, /finit 30 min après son horaire : l’équipe soir finit à 21:30 pour 21:00/);
  assert.equal(SV.phrases(rep)[1], 'Montage coince : il finit 30 min après son horaire ; rien ne part en retard.');
  // La feuille « Réponses » : la fin de l'horaire, et l'équipe au détail du dépassement.
  const lignes = ER.feuilleDesReponses(rep, { date: '2026-11-02' }).lignes || ER.feuilleDesReponses(rep, { date: '2026-11-02' });
  const texte = JSON.stringify(lignes);
  assert.match(texte, /l’équipe soir finit à 21:30 pour 21:00/);
  assert.doesNotMatch(texte, /J\+1 06:00/);
});

test('l’équipe qui dépasse n’est pas celle qui finit la dernière : elle est nommée avec sa propre fin et son propre horaire', () => {
  // Le matin : 450 min, de 06:00 à 14:30 (pauses à 09:00 et à 12:15), 30 min après son horaire (14:00). Le soir : 240 min, de
  // 13:00 à 17:15, dans son horaire (21:00). Le service finit à 17:15 ; c'est le matin qui dépasse.
  const { r, args } = TROIS(450, 240), rep = R.reponses(r, args), f = fin(rep);
  assert.deepEqual([f.fin, f.finHoraire, f.depasse], [h('17:15'), h('21:00'), 30]);
  assert.deepEqual(f.equipeQuiDepasse, { id: 'matin', nom: 'matin', fin: h('14:30'), finHoraire: h('14:00'), depasse: 30 });
  const ligne = rang(rep);
  assert.match(ligne, /<span class="sy-v">17:15<\/span>/);
  assert.match(ligne, /l’équipe matin finit à 14:30 pour 14:00/);
  assert.match(SV.carteCoince(rep).corps, /l’équipe matin finit à 14:30 pour 14:00/);
});

test('sans dépassement : l’horaire des équipes qui travaillent, aucune équipe nommée ; un petit dépassement la nomme sans couleur', () => {
  const { r, args } = TROIS(240, 240), rep = R.reponses(r, args), f = fin(rep);
  assert.deepEqual([f.fin, f.finHoraire, f.depasse, f.equipeQuiDepasse], [h('17:15'), h('21:00'), 0, null]);
  const ligne = rang(rep);
  assert.match(ligne, /<span class="sy-v">17:15<\/span><small>horaire 21:00<\/small>/);
  assert.doesNotMatch(ligne, /l’équipe|heures sup/);
  assert.equal(rep.coince.goulot, null);
  // 430 min le soir : de 13:00 à 21:10, 10 min après l'horaire — sous le quart d'heure : dit, sans couleur ni goulot.
  const p = TROIS(240, 430), rp = R.reponses(p.r, p.args), fp = fin(rp), lp = rang(rp);
  assert.deepEqual([fp.fin, fp.depasse, fp.equipeQuiDepasse.id], [h('21:10'), 10, 'soir']);
  assert.match(lp, /l’équipe soir finit à 21:10 pour 21:00/);
  assert.doesNotMatch(lp.split('class="sy-fin"')[1].split('>')[0], /data-ton/);
  assert.equal(rp.coince.goulot, null);
});

test('un service dont aucune équipe ne travaille ce jour-là n’a ni fin ni horaire ; une équipe d’appui garde le sien', () => {
  // La nuit seule, sans vol pour sa commande ; une équipe d'appui à la dotation, présente de 05:00 à 13:00.
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '23:30')], bareme: { prepa: { 'NORD/YC': 240, 'EST/YC': 120 } }, noms: { prepa: 'Montage', cuisine: 'Cuisine', dotation: 'Dotation' },
    ateliers: [eq('matin', 'prepa', '06:00', 1, [['NORD/YC']]), eq('nuit', 'cuisine', '22:00', 1, [['EST/YC']]), eq('appui', 'dotation', '05:00', 1, [], { type: 'appui' })],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const rep = R.reponses(r, args), cu = fin(rep, 'cuisine'), ap = fin(rep, 'dotation');
  assert.deepEqual([cu.fin, cu.finHoraire, cu.depasse, cu.equipes, cu.equipeQuiDepasse], [null, null, null, [], null]);
  assert.match(SV.tableau(rep, ['cuisine']).split('<tr data-service="cuisine"')[1].split('</tr>')[0], /class="sy-fin"[^>]*>—</);
  assert.equal(ap.finHoraire, h('13:00'), 'l’équipe d’appui, présente : son horaire');
});

test('le tableau « Les services » : une colonne « Fin et heures sup », plus de colonne « Heures sup » à part', () => {
  const { r, args } = TROIS(240, 450), rep = R.reponses(r, args), html = SV.tableau(rep, ['prepa']);
  const tetes = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);
  assert.deepEqual(tetes, ['Service', 'Besoin', 'Présents', 'Écart', 'Matin', 'Après-midi', 'Pic au travail', 'Occupation', 'Personnes sans travail', 'Attente d’un arrivage', 'Fin et heures sup']);
  assert.equal((rang(rep).match(/<td/g) || []).length, 10, 'dix cases après le nom du service');
});

test('non-régression : le résultat de la journée et les indicateurs sont identiques, avant et après les réponses', () => {
  const { r, args } = TROIS(240, 450), avantR = JSON.stringify(r), k = I.journee(r, args), avantK = JSON.stringify(k);
  const rep = R.reponses(r, args, { k });
  SV.tableau(rep, []); SV.carteCoince(rep);
  assert.equal(JSON.stringify(r), avantR);
  assert.equal(JSON.stringify(k), avantK);
});
