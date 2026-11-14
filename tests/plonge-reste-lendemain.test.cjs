/* Banc d'essai, correction 19 (b) — un reste normal ne fait pas coincer la
 * plonge (v1). Le soir, il reste presque toujours du sale : un vol revenu en
 * fin de soirée se lave le lendemain matin, c'est le fonctionnement
 * ordinaire. La plonge par vol ne coince pour son reste que si la première
 * équipe du lendemain ne peut pas l'absorber pendant sa présence : le
 * jugement de la mesure « absorbable », porté sur la journée telle qu'elle
 * s'est jouée, qu'il y ait ou non une équipe sous condition
 * (docs/BANC_ESSAI.md § 2). Sans seuil ni réglage. Une unité fictive, des
 * journées calculées à la main. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');
const RV = require('../resultats-vue.js');
const ER = require('../echanges-reponses.js');
const PV = require('../planning-vue.js');

const h = s => P.minutes(s);
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const T = (nom, p) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
// La plonge par vol : 90 min par vol, 180 min pour la compagnie LONG ; un tunnel « Tunnel 1 », le même pour toutes les équipes.
const plonge = (id, nom, debut, p) => ({ id, nom, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence: 480 }, parVol: true, durees: { '*': 90, LONG: 180 }, tunnels: [T('Tunnel 1')], plafond: 0, ...p });
// Le matin : 06:00 à 14:00 ; l'après-midi : 13:00 à 21:00 ; la nuit : 22:00 à 06:00.
const MATIN = plonge('matin', 'Plonge matin', '06:00'), APM = plonge('apm', 'Plonge après-midi', '13:00');
const NUIT = (p = {}) => plonge('nuit', 'Plonge nuit', '22:00', p);
// Le montage : une personne, de 06:00 à 14:00, 240 min de travail : il finit dans son horaire.
const MONTAGE = { id: 'montage', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true } };
const jouer = (retours, plonges, plus = {}) => {
  const args = { vols: [dep('NO1', 'NORD', '23:30'), ...retours], liaisons: [], rendement: 1, noms: { prepa: 'Montage', plonge: 'Plonge' }, bareme: { prepa: { 'NORD/YC': 240 } },
    heuresSup: { actif: true, plafond: 120 }, ateliers: [MONTAGE, ...plonges], parcours: [{ id: 'c1', nom: 'c1', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    ...plus, materiel: { actif: false, delaiRetour: 30, ...(plus.materiel || {}) } };
  const r = P.simuler(args), k = I.journee(r, args);
  return { r, args, k, rep: R.reponses(r, args, { k }) };
};
const de = (liste, service) => liste.find(s => s.service === service);
const rang = rep => SV.tableau(rep, ['prepa', 'plonge']).split('<tr data-service="plonge"')[1].split('</tr>')[0];
const DATE = '2026-11-02';
const col = nom => ER.TETE.indexOf(nom);
const lignesDe = (f, mesure) => f.lignes.slice(1).filter(l => l[col('Mesure')] === mesure);

/* ---- trois journées --------------------------------------------------------------------------------- */
// UN RESTE QUE LE MATIN ABSORBE. Une seule équipe, le matin. V1 (90 min) arrive à la plonge à 13:00 : 60 min lavées à 14:00,
// 30 restent. V2 arrive à 13:30 : il n'est pas commencé (90 min). Le soir : 2 vols, 120 min de lavage.
// Le lendemain, le matin les lave d'abord, de 06:00 à 08:00 ; son vol de 13:00 n'en est pas retardé : il finit comme
// aujourd'hui (30 min de lavage après sa présence, avec ou sans le reste). Le reste n'y ajoute rien : il l'absorbe.
const ABSORBE = () => jouer([ret('V1', 'NORD', '12:30'), ret('V2', 'SUD', '13:00')], [MATIN]);
// UN RESTE QU'IL N'ABSORBE PAS. Le matin est plein : A1 et A2 (LONG, 180 min) de 06:00 à 12:00, A3 (90 min) de 12:00 à 13:30.
// V1 arrive à 13:30 : 30 min lavées à 14:00, 60 restent. V2 arrive à 13:45 : pas commencé (90 min). Le soir : 2 vols, 150 min.
// Le lendemain, lavés d'abord (06:00 → 08:30), ils décalent tout de 150 min : A2 finit à 14:30 (30 min après sa présence),
// A3 est lavé de 14:30 à 16:00 (90), V1 de 16:00 à 17:30 (90) : 210 min de lavage après sa présence, contre 60 sans le reste
// (V1, de 13:30 à 15:00). Le reste pousse 150 min de lavage au-delà de sa présence.
const PLEIN = [ret('A1', 'LONG', '05:30'), ret('A2', 'LONG', '08:30'), ret('A3', 'NORD', '11:30')];
const DEBORDE = () => jouer([...PLEIN, ret('V1', 'NORD', '13:00'), ret('V2', 'SUD', '13:15')], [MATIN]);
// SANS RESTE. Tout est lavé dans les présences.
const SANS = () => jouer([ret('C1', 'NORD', '08:00')], [MATIN, APM]);

test('le jugement du moteur : la première équipe du lendemain absorbe-t-elle le reste pendant sa présence ?', () => {
  const a = ABSORBE(), d = DEBORDE(), s = SANS();
  assert.deepEqual(a.r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  assert.deepEqual(P.absorptionDuReste(a.r, a.args, 'plonge'), { equipe: 'matin', retard: { vols: 2, unites: 380 }, absorbe: true, depassement: 0 });
  assert.deepEqual(d.r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 60 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  assert.deepEqual(P.absorptionDuReste(d.r, d.args, 'plonge'), { equipe: 'matin', retard: { vols: 2, unites: 380 }, absorbe: false, depassement: 150 });
  assert.deepEqual(P.absorptionDuReste(s.r, s.args, 'plonge'), { equipe: 'matin', retard: { vols: 0, unites: 0 }, absorbe: true, depassement: 0 });
  // Un service qui n'est pas une plonge par vol : sans objet.
  assert.equal(P.absorptionDuReste(a.r, a.args, 'prepa'), null);
  assert.equal(P.absorptionDuReste(a.r, { ...a.args, ateliers: a.args.ateliers.map(x => (x.type === 'lavage' ? { ...x, parVol: false } : x)) }, 'plonge'), null);
  // Le résultat de la journée n'en porte rien : c'est une lecture.
  assert.equal(JSON.stringify(a.r), JSON.stringify(P.simuler(a.args)));
});

test('le même jugement que la mesure « absorbable », qu’il y ait ou non une équipe sous condition', () => {
  // Le soir, W1 (90 min) arrive à 20:00 : l'après-midi en lave 60 min, 30 restent à 21:00. Le matin, peu chargé, l'absorbe :
  // la nuit sous condition reste fermée, et le jugement de la journée dit comme elle.
  const W1 = ret('W1', 'NORD', '19:30');
  const fermee = jouer([ret('C1', 'NORD', '08:00'), W1], [MATIN, APM, NUIT({ condition: { mesure: 'absorbable' } })]);
  const c = fermee.r.ateliers.find(v => v.id === 'nuit').conditionSale;
  assert.deepEqual([c.ouverte, c.equipe, c.retard, c.absorbe, c.depassement], [false, 'matin', { vols: 1, unites: 190 }, true, 0]);
  assert.deepEqual(P.absorptionDuReste(fermee.r, fermee.args, 'plonge'), { equipe: c.equipe, retard: c.retard, absorbe: c.absorbe, depassement: c.depassement });
  // La même journée sans équipe sous condition : le même jugement.
  const sans = jouer([ret('C1', 'NORD', '08:00'), W1], [MATIN, APM]);
  assert.deepEqual(P.absorptionDuReste(sans.r, sans.args, 'plonge'), { equipe: 'matin', retard: { vols: 1, unites: 190 }, absorbe: true, depassement: 0 });
  // Le matin plein (A1, A2, A3 : de 06:00 à 15:00, le dernier en relais) : il n'absorbe pas les 30 min de W1 — la nuit s'ouvre
  // et les lave (correction 19 a). La journée jouée ne laisse rien : la plonge ne coince pas.
  const A3 = ret('A3', 'LONG', '11:30');
  const ouverte = jouer([...PLEIN.slice(0, 2), A3, W1], [MATIN, APM, NUIT({ condition: { mesure: 'absorbable' } })]);
  const o = ouverte.r.ateliers.find(v => v.id === 'nuit').conditionSale;
  assert.deepEqual([o.ouverte, o.absorbe, o.depassement, ouverte.r.saleFinal], [true, false, 30, []]);
  assert.deepEqual(P.absorptionDuReste(ouverte.r, ouverte.args, 'plonge'), { equipe: 'matin', retard: { vols: 0, unites: 0 }, absorbe: true, depassement: 0 });
  assert.deepEqual(ouverte.rep.coince.goulots, []);
  // Sans la nuit, la même journée : le jugement est celui qui l'a fait venir — 30 min de lavage poussées après la présence.
  const seule = jouer([...PLEIN.slice(0, 2), A3, W1], [MATIN, APM]);
  assert.deepEqual(P.absorptionDuReste(seule.r, seule.args, 'plonge'), { equipe: o.equipe, retard: o.retard, absorbe: false, depassement: o.depassement });
  // L'équipe que désigne la nuit (`equipe`) est celle qui juge : l'après-midi, vide, absorbe ce que le matin plein n'absorbe pas.
  const designee = jouer([...PLEIN.slice(0, 2), A3, W1], [MATIN, APM, NUIT({ condition: { mesure: 'absorbable', equipe: 'apm' } })]);
  assert.equal(designee.r.ateliers.find(v => v.id === 'nuit').conditionSale.ouverte, false);
  assert.deepEqual(P.absorptionDuReste(designee.r, designee.args, 'plonge'), { equipe: 'apm', retard: { vols: 1, unites: 190 }, absorbe: true, depassement: 0 });
});

test('le jugement ne compte pas le sale de la veille parmi les retours du matin ; une plonge mêlée n’est pas jugée', () => {
  // La veille a laissé Z (30 min restantes) : le matin le lave d'abord, de 06:00 à 06:30, puis A1, A2, A3, décalés de 30 min,
  // jusqu'à 14:00 tout juste. V1, arrivé à 13:30, n'est pas commencé : il reste seul le soir (90 min).
  // Le lendemain : V1 d'abord (06:00 → 07:30), puis les retours du matin à leur heure — A1, A2, A3, sans Z, qui était le sale
  // d'hier : A3 est lavé de 13:30 à 15:00, 60 min après la présence, contre 0 sans le reste. (Avec Z compté : 90.)
  const veille = jouer([...PLEIN, ret('V1', 'NORD', '13:00')], [MATIN], { materiel: { saleInitial: [{ vol: 'Z', cie: 'NORD', unites: 190, reste: 30 }] } });
  assert.deepEqual(veille.r.lots.filter(l => l.retourVol).map(l => [l.vol, l.debut, l.fin]),
    [['Z (veille)', h('06:00'), h('06:30')], ['A1', h('06:30'), h('09:30')], ['A2', h('09:30'), h('12:30')], ['A3', h('12:30'), h('14:00')], ['V1', h('13:30'), null]]);
  assert.deepEqual(veille.r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190 }]);
  assert.deepEqual(P.absorptionDuReste(veille.r, veille.args, 'plonge'), { equipe: 'matin', retard: { vols: 1, unites: 190 }, absorbe: false, depassement: 60 });
  // Une plonge qui mêle le débit et le vol est refusée par la journée (`plonge-mixte`) : si l'équipe qui juge lave au débit,
  // pas de jugement.
  const a = ABSORBE();
  const mixte = { ...a.args, ateliers: [...a.args.ateliers, plonge('debit', 'Plonge au débit', '05:00', { parVol: false })] };
  assert.equal(P.absorptionDuReste(a.r, mixte, 'plonge'), null);
});

test('un reste que le matin absorbe : la plonge ne coince pas, sa ligne affiche le reste sans alerte', () => {
  const { r, rep } = ABSORBE(), c = de(rep.coince.services, 'plonge');
  assert.deepEqual(c.lendemain, { vols: 2, minutes: 120, absorbe: true, equipe: { id: 'matin', nom: 'Plonge matin' }, depassement: 0 });
  assert.deepEqual(rep.plonge.lendemain, { vols: 2, minutes: 120, absorbe: true });
  // « Où ça coince » ne la cite pas.
  assert.deepEqual([rep.coince.goulot, rep.coince.goulots], [null, []]);
  assert.equal(SV.phrases(rep)[1], 'Rien ne coince ; rien ne part en retard.');
  assert.match(SV.carteCoince(rep).corps, /Rien ne coince\./);
  // Sa ligne : le reste, sans couleur d'alerte ni mot « à signaler ».
  const ligne = rang(rep);
  assert.match(ligne, /<td class="sy-fin">/, 'la case de la fin n’a pas de statut');
  assert.match(ligne, /<small class="sy-lendemain"[^>]*>reste à laver le lendemain : 2 vols \(2 h 00 de lavage\)<\/small>/);
  assert.doesNotMatch(ligne, /data-ton="attente"|à signaler|heures sup/);
  // Le « Bouchon » : non. La feuille « Réponses » : pas de goulot ; le reste, « non ».
  assert.equal(RV.bouchon({ resteSale: 380, attenteMax: 0 }, R.SEUILS_DEFAUT, rep.plonge), false);
  const f = ER.feuilleDesReponses(rep, { date: DATE });
  assert.equal(lignesDe(f, 'Goulot')[0][col('Sujet')], 'aucun');
  assert.deepEqual(lignesDe(f, 'Reste à laver le lendemain').map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Seuil')], x[col('Au-delà du seuil')], x[col('Détail')]]),
    [['Plonge', 2, 'vols', null, 'non', '120 min de lavage ; un lavage arrêté compte pour sa durée restante ; l’équipe du matin (Plonge matin) le lave pendant sa présence : la plonge ne coince pas']]);
  assert.deepEqual(R.lendemainDeLEquipe(r.ateliers.find(v => v.id === 'matin'), r), { vols: 2, minutes: 120 }, 'le reste par équipe ne change pas');
});

test('un reste qu’il n’absorbe pas : la plonge coince, et la phrase dit pourquoi', () => {
  const { rep } = DEBORDE(), c = de(rep.coince.services, 'plonge');
  const reste = { vols: 2, minutes: 150, absorbe: false, equipe: { id: 'matin', nom: 'Plonge matin' }, depassement: 150 };
  assert.deepEqual(c.lendemain, reste);
  assert.deepEqual(rep.plonge.lendemain, { vols: 2, minutes: 150, absorbe: false });
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.heuresSup, g.enRetard, g.equipe, g.lendemain, g.cause]), [['plonge', 0, 0, 0, null, reste, { code: 'presences' }]]);
  const pourquoi = 'laisse 2 vols à laver le lendemain, plus que l’équipe du matin ne peut en laver pendant sa présence';
  assert.equal(SV.phrases(rep)[1], 'Plonge coince : il ' + pourquoi + ' ; rien ne part en retard.');
  const carte = SV.carteCoince(rep);
  assert.equal(carte.ton, 'attente');
  assert.ok(carte.corps.includes('<p class="sy-grand">Plonge</p><p>' + pourquoi + '.</p>'), carte.corps);
  // Sa ligne : le reste, avec la couleur d'alerte et « à signaler ».
  const ligne = rang(rep);
  assert.match(ligne, /<td class="sy-fin" data-ton="attente">/);
  assert.match(ligne, /à signaler : /);
  assert.match(ligne, /<small class="sy-lendemain"[^>]*>reste à laver le lendemain : 2 vols \(2 h 30 de lavage\)<\/small>/);
  // Le « Bouchon » : oui. La feuille « Réponses » : le goulot et sa raison ; le reste, « oui ».
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 0 }, R.SEUILS_DEFAUT, rep.plonge), true);
  const f = ER.feuilleDesReponses(rep, { date: DATE }), g = lignesDe(f, 'Goulot')[0];
  assert.equal(g[col('Détail')], 'heures sup 0 min × personnes ; 0 commande(s) ou vol(s) en retard par ses lots ; laisse 2 vol(s) à laver le lendemain (150 min de lavage), '
    + 'plus que l’équipe du matin ne peut en laver pendant sa présence (Plonge matin : 150 min de lavage au-delà) ; '
    + 'cause : ses équipes partent à la fin de leur présence : personne ne reste pour finir, ce qui n’est pas lavé passe au lendemain');
  assert.deepEqual(lignesDe(f, 'Reste à laver le lendemain').map(x => [x[col('Valeur')], x[col('Seuil')], x[col('Au-delà du seuil')], x[col('Détail')]]),
    [[2, null, 'oui', '150 min de lavage ; un lavage arrêté compte pour sa durée restante ; plus que l’équipe du matin (Plonge matin) ne peut en laver pendant sa présence : 150 min de lavage au-delà']]);
});

test('sans reste : rien — aucun champ, aucune ligne, aucun mot de plus', () => {
  const { rep } = SANS();
  assert.equal('lendemain' in de(rep.coince.services, 'plonge'), false);
  assert.deepEqual(Object.keys(rep.plonge), ['attenteMax']);
  assert.deepEqual(rep.coince.goulots, []);
  assert.doesNotMatch(rang(rep), /lendemain|data-ton="attente"/);
  assert.doesNotMatch(SV.tableau(rep, ['prepa', 'plonge']), /lendemain/);
  assert.equal(lignesDe(ER.feuilleDesReponses(rep, { date: DATE }), 'Reste à laver le lendemain').length, 0);
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 0 }, R.SEUILS_DEFAUT, rep.plonge), false);
});

test('le « Bouchon » : pour une plonge par vol, le reste du soir ne compte que s’il n’est pas absorbé ; l’attente compte toujours', () => {
  const S = R.SEUILS_DEFAUT;
  // Au débit (pas de `lendemain`) : le sale du soir, comme avant.
  assert.equal(RV.bouchon({ resteSale: 50, attenteMax: 0 }, S, { attenteMax: null }), true);
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 0 }, S, { attenteMax: null }), false);
  // Par vol : absorbé, non ; pas absorbé, oui ; un vol qui attend plus que le seuil, oui dans les deux cas.
  assert.equal(RV.bouchon({ resteSale: 380, attenteMax: 0 }, S, { attenteMax: 0, lendemain: { vols: 2, minutes: 120, absorbe: true } }), false);
  assert.equal(RV.bouchon({ resteSale: 380, attenteMax: 0 }, S, { attenteMax: 0, lendemain: { vols: 2, minutes: 120, absorbe: false } }), true);
  assert.equal(RV.bouchon({ resteSale: 380, attenteMax: 0 }, S, { attenteMax: S.attenteLot + 1, lendemain: { vols: 2, minutes: 120, absorbe: true } }), true);
});

test('le planning des équipes : une reprise se dit « arrêté à hh:mm, repris par … à hh:mm »', () => {
  // W1 (90 min) arrive à 20:00 : l'après-midi en lave 60 min, jusqu'à 21:00 ; la nuit le reprend à 22:00, propre à 22:30.
  const { r, rep } = jouer([ret('W1', 'NORD', '19:30')], [MATIN, APM, NUIT()]);
  const w1 = r.lots.find(l => l.vol === 'W1'), nom = id => r.ateliers.find(a => a.id === id).nom;
  const apm = PV.lotTenu(w1, { id: 'apm' }, nom), nuit = PV.lotTenu(w1, { id: 'nuit' }, nom);
  assert.deepEqual([apm.debut, apm.fin, apm.duree, apm.relais], [h('20:00'), h('21:00'), 60,
    { rang: 0, n: 2, de: null, vers: { nom: 'Plonge nuit', a: h('22:00'), arrete: h('21:00') }, arrete: null, propre: h('22:30') }]);
  assert.deepEqual([nuit.debut, nuit.fin, nuit.duree, nuit.relais], [h('22:00'), h('22:30'), 30,
    { rang: 1, n: 2, de: { nom: 'Plonge après-midi', arrete: h('21:00') }, vers: null, arrete: null, propre: h('22:30') }]);
  assert.equal(PV.info(apm, { type: 'lavage', service: 'plonge' }, {}), 'Vol W1\n20:00 → 21:00 (1 h 00)\nAttente : aucune\nArrêté à 21:00, repris par Plonge nuit à 22:00\nPropre à 22:30');
  assert.equal(PV.info(nuit, { type: 'lavage', service: 'plonge' }, {}), 'Vol W1\n22:00 → 22:30 (30 min)\nAttente : aucune\nReprise : commencé par Plonge après-midi, arrêté à 21:00\nPropre à 22:30');
  // Les réponses : la reprise parmi les relais de la ligne, avec sa marque ; la feuille « Réponses » la nomme.
  assert.deepEqual(de(rep.fins.services, 'plonge').relais, [{ vol: 'W1', debut: h('20:00'), fin: h('22:30'), reste: 0, parts: [
    { id: 'apm', nom: 'Plonge après-midi', debut: h('20:00'), fin: h('21:00'), travail: 60 }, { id: 'nuit', nom: 'Plonge nuit', debut: h('22:00'), fin: h('22:30'), travail: 30, reprise: true }] }]);
  const f = ER.feuilleDesReponses(rep, { date: DATE });
  assert.deepEqual(lignesDe(f, 'Lavage repris').map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Détail')]]),
    [['Plonge', 90, 'min', 'W1 : Plonge après-midi 20:00 → 21:00 (60 min), arrêté à 21:00, repris par Plonge nuit 22:00 → 22:30 (30 min) ; propre à 22:30']]);
  assert.equal(lignesDe(f, 'Lavage en relais').length + lignesDe(f, 'Lavage arrêté').length, 0);
  // Tout est lavé : rien pour le lendemain, rien ne coince.
  assert.deepEqual([rep.coince.goulots, 'lendemain' in de(rep.coince.services, 'plonge')], [[], false]);
});
