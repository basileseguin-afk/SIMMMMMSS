/* Banc d'essai, évolution 18 (b) — le relais à la plonge, dans les résultats
 * (v1) : le module des réponses lit les parts (chaque équipe est au travail
 * pendant sa part ; la fin d'une équipe de plonge est la fin de sa dernière
 * part) ; une plonge qui laisse à laver le lendemain plus que l'équipe du
 * matin ne peut en absorber coince (correction 19 b : un reste absorbé ne
 * fait pas coincer — tests/plonge-reste-lendemain.test.cjs), rangée après les
 * services qui dépassent leur horaire ; la Synthèse le dit sur la ligne de
 * la plonge ; les feuilles « Réponses » et « Charge » du classeur donnent les
 * parts et le reste du lendemain (docs/BANC_ESSAI.md § 2).
 * Une unité fictive, des journées calculées à la main. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');
const RV = require('../resultats-vue.js');
const ER = require('../echanges-reponses.js');
const EC = require('../echanges-charge.js');

const h = s => P.minutes(s);
const ret = (id, cie, sta) => ({ id, cie, sens: 'RET', sta: h(sta), bc: 0, pc: 0, yc: 100 });
const dep = (id, cie, std) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100 });
const T = (nom, p) => ({ nom, debit: 300, personnes: 1, actif: true, ...p });
// La plonge par vol : 90 min par vol, 180 min pour la compagnie LONG ; un tunnel « Tunnel 1 », le même pour les deux équipes.
const plonge = (id, nom, debut, p) => ({ id, nom, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, seuils: [], presence: 480 }, parVol: true, durees: { '*': 90, LONG: 180 }, tunnels: [T('Tunnel 1')], plafond: 0, ...p });
const MATIN = plonge('matin', 'Plonge matin', '06:00'), APM = plonge('apm', 'Plonge après-midi', '13:00');
// Le montage : une personne, de 06:00 à 14:00 (le poste par défaut : 15 min de pause après 3 h, 45 min après 6 h).
const montage = minutes => ({ args: { bareme: { prepa: { 'NORD/YC': minutes } } },
  equipe: { id: 'montage', nom: 'Montage', service: 'prepa', type: 'manuel', debut: '06:00', jour: 0, personnes: 1, lots: [['NORD/YC']], regime: { actif: true } } });
const jouer = (retours, plonges, minutes = 240) => {
  const m = montage(minutes);
  const args = { vols: [dep('NO1', 'NORD', '23:30'), ...retours], liaisons: [], rendement: 1, noms: { prepa: 'Montage', plonge: 'Plonge' }, ...m.args,
    heuresSup: { actif: true, plafond: 120 }, ateliers: [m.equipe, ...plonges], parcours: [{ id: 'c1', nom: 'c1', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    materiel: { actif: false, delaiRetour: 30 } };
  const r = P.simuler(args), k = I.journee(r, args);
  return { r, args, k, rep: R.reponses(r, args, { k }) };
};
const de = (liste, service) => liste.find(s => s.service === service);
// L1 (LONG, 180 min) arrive à la plonge à 12:00 : le matin le lave de 12:00 à 14:00, l'après-midi le finit de 14:00 à 15:00.
// V2 (90 min) arrive à 14:30 : l'après-midi le lave de 15:00 à 16:30.
const RELAIS = () => jouer([ret('L1', 'LONG', '11:30'), ret('V2', 'NORD', '14:00')], [MATIN, APM]);
// Une seule équipe : V1, arrivé à 13:00, s'arrête à 14:00 (30 min restent) ; V2, arrivé à 13:30, n'est pas commencé (90 min).
// Le lendemain, le matin les lave d'abord (06:00 → 08:00) sans retarder son vol de 13:00 : il absorbe ce reste (correction 19 b).
const RESTE = (minutes = 240) => jouer([ret('V1', 'NORD', '12:30'), ret('V2', 'SUD', '13:00')], [MATIN], minutes);
// Un matin plein : A1 et A2 (LONG) de 06:00 à 12:00, A3 de 12:00 à 13:30. V1, arrivé à 13:30, s'arrête à 14:00 (60 min restent) ;
// V2, arrivé à 13:45, n'est pas commencé (90 min). Le lendemain, ces 150 min, lavées d'abord, poussent 150 min de lavage après
// la présence du matin (210 min avec le reste, 60 sans) : il ne l'absorbe pas.
const DEBORDE = (minutes = 240) => jouer([ret('A1', 'LONG', '05:30'), ret('A2', 'LONG', '08:30'), ret('A3', 'NORD', '11:30'), ret('V1', 'NORD', '13:00'), ret('V2', 'SUD', '13:15')], [MATIN], minutes);
const DU_MATIN = { id: 'matin', nom: 'Plonge matin' };
const PLUS_QUE = 'plus que l’équipe du matin ne peut en laver pendant sa présence';
const DATE = '2026-11-02', LE = new Date(2026, 10, 2, 10, 0);
const col = nom => ER.TETE.indexOf(nom);
const lignesDe = (f, mesure) => f.lignes.slice(1).filter(l => l[col('Mesure')] === mesure);

test('un relais : la fin de chaque équipe est la fin de sa part, sans heures sup ; rien ne coince', () => {
  const { r, rep } = RELAIS(), f = de(rep.fins.services, 'plonge');
  assert.deepEqual(r.ateliers.filter(v => v.type === 'lavage').map(v => [v.id, v.fin, v.heuresSup]), [['matin', h('14:00'), 0], ['apm', h('16:30'), 0]]);
  assert.deepEqual([f.fin, f.finHoraire, f.depasse, f.equipeQuiDepasse, f.heuresSup.total], [h('16:30'), h('21:00'), 0, null, 0]);
  assert.deepEqual(f.equipes.map(e => [e.id, e.fin, e.finHoraire, e.depasse]), [['matin', h('14:00'), h('14:00'), 0], ['apm', h('16:30'), h('21:00'), 0]]);
  // Le lavage en relais, avec ses parts.
  assert.deepEqual(f.relais, [{ vol: 'L1', debut: h('12:00'), fin: h('15:00'), reste: 0, parts: [
    { id: 'matin', nom: 'Plonge matin', debut: h('12:00'), fin: h('14:00'), travail: 120 }, { id: 'apm', nom: 'Plonge après-midi', debut: h('14:00'), fin: h('15:00'), travail: 60 }] }]);
  // « Où ça coince » ne cite pas la plonge : tout est lavé dans les présences.
  assert.deepEqual([rep.coince.goulot, rep.coince.goulots], [null, []]);
  assert.equal('lendemain' in de(rep.coince.services, 'plonge'), false);
  assert.deepEqual(rep.plonge, { attenteMax: 30 }, 'V2 attend 30 min son tunnel ; rien pour le lendemain');
  // Le vol repris n'est pas un arrivage de l'équipe qui le reprend : deux arrivages, L1 et V2.
  assert.equal(de(rep.coince.services, 'plonge').arrivages, 2);
});

test('un relais : les personnes sans travail se comptent autour de la part de chaque équipe', () => {
  const { rep } = RELAIS(), s = de(rep.sansTravail.services, 'plonge');
  // Le matin (2 personnes, 06:00–14:00, une au tunnel de 12:00 à 14:00) : 720 avant son premier lot, 120 pendant.
  // L'après-midi (13:00–21:00, une au tunnel de 14:00 à 16:30) : 120 avant sa part (13:00–14:00), 150 pendant, 540 après.
  assert.deepEqual([s.avant, s.entre, s.apres, s.minutes], [720 + 120, 120 + 150, 540, 1650]);
  // Les lots tels que chaque équipe les a tenus : sa part, pas le lot entier.
  const { r } = RELAIS(), apm = r.ateliers.find(v => v.id === 'apm');
  assert.deepEqual(R.lotsTenus(apm).map(l => [l.vol, l.debut, l.fin]), [['L1', h('14:00'), h('15:00')], ['V2', h('15:00'), h('16:30')]]);
});

test('une plonge qui laisse au lendemain plus que le matin ne peut en absorber coince ; sa cause : personne ne reste pour finir', () => {
  const { r, rep } = DEBORDE(), c = de(rep.coince.services, 'plonge');
  assert.deepEqual(r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 60 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  // Deux vols : 60 min (la durée restante de V1) + 90 min (V2, en entier) ; le matin ne les absorbe pas (150 min au-delà).
  const reste = { vols: 2, minutes: 150, absorbe: false, equipe: DU_MATIN, depassement: 150 };
  assert.deepEqual(c.lendemain, reste);
  assert.deepEqual(rep.plonge.lendemain, { vols: 2, minutes: 150, absorbe: false });
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.heuresSup, g.enRetard, g.equipe, g.lendemain, g.cause]),
    [['plonge', 0, 0, 0, null, reste, { code: 'presences' }]]);
  assert.equal(rep.coince.goulot.service, 'plonge');
  // Elle ne dépasse pas son horaire : sa fin est la fin de sa présence, sans heures sup.
  const f = de(rep.fins.services, 'plonge');
  assert.deepEqual([f.fin, f.finHoraire, f.depasse, f.heuresSup.total], [h('14:00'), h('14:00'), 0, 0]);
  assert.deepEqual(f.relais, [{ vol: 'V1', debut: h('13:30'), fin: null, reste: 60, parts: [{ id: 'matin', nom: 'Plonge matin', debut: h('13:30'), fin: h('14:00'), travail: 30 }] }]);
  assert.deepEqual(R.lendemainDeLEquipe(r.ateliers.find(v => v.id === 'matin'), r), { vols: 2, minutes: 150 });
  // Un reste que le matin absorbe (correction 19 b) : il est sur la ligne, la plonge ne coince pas. (Évolution 18 : tout reste
  // la faisait coincer — goulot « plonge », lendemain { vols: 2, minutes: 120 }.)
  const ok = RESTE(), o = de(ok.rep.coince.services, 'plonge');
  assert.deepEqual(ok.r.saleFinal, [{ vol: 'V1', cie: 'NORD', unites: 190, reste: 30 }, { vol: 'V2', cie: 'SUD', unites: 190 }]);
  assert.deepEqual(o.lendemain, { vols: 2, minutes: 120, absorbe: true, equipe: DU_MATIN, depassement: 0 });
  assert.deepEqual([ok.rep.plonge.lendemain, ok.rep.coince.goulot, ok.rep.coince.goulots], [{ vols: 2, minutes: 120, absorbe: true }, null, []]);
  assert.deepEqual(R.lendemainDeLEquipe(ok.r.ateliers.find(v => v.id === 'matin'), ok.r), { vols: 2, minutes: 120 });
});

test('elle est rangée après les services qui dépassent leur horaire', () => {
  // Le montage : 500 min de travail, de 06:00 à 15:20 avec ses deux pauses — 1 h 20 après son horaire (14:00).
  const { rep } = DEBORDE(500);
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, 'lendemain' in g]), [['prepa', 80, false], ['plonge', 0, true]]);
  assert.equal(rep.coince.goulot.service, 'prepa');
  const phrase = SV.phrases(rep)[1];
  assert.equal(phrase, 'Montage coince : il finit 1 h 20 après son horaire (et 1 autre service) ; rien ne part en retard.');
  const carte = SV.carteCoince(rep);
  assert.ok(carte.corps.includes('Coincent aussi :</p><ul class="sy-exceptions"><li><b>Plonge</b> laisse 2 vols à laver le lendemain, ' + PLUS_QUE + '<small>ses équipes partent à la fin de leur présence'), carte.corps);
  // Avec un reste que le matin absorbe : le montage seul.
  assert.deepEqual(RESTE(500).rep.coince.goulots.map(g => g.service), ['prepa']);
});

test('la Synthèse : le reste du lendemain sur la ligne de la plonge, plus d’heures sup ; la phrase de tête et la carte le disent', () => {
  const { rep } = DEBORDE();
  assert.equal(SV.phrases(rep)[1], 'Plonge coince : il laisse 2 vols à laver le lendemain, ' + PLUS_QUE + ' ; rien ne part en retard.');
  const rang = SV.tableau(rep, ['prepa', 'plonge']).split('<tr data-service="plonge"')[1].split('</tr>')[0];
  assert.match(rang, /<td class="sy-fin" data-ton="attente">/, 'la case de la fin porte le statut');
  assert.match(rang, /<small class="sy-lendemain"[^>]*>reste à laver le lendemain : 2 vols \(2 h 30 de lavage\)<\/small>/);
  assert.doesNotMatch(rang, /heures sup/);
  const carte = SV.carteCoince(rep);
  assert.equal(carte.ton, 'attente');
  assert.ok(carte.corps.includes('<p class="sy-grand">Plonge</p><p>laisse 2 vols à laver le lendemain, ' + PLUS_QUE + '.</p>'), carte.corps);
  assert.match(carte.corps, /Cause : ses équipes partent à la fin de leur présence : personne ne reste pour finir, ce qui n’est pas lavé passe au lendemain\./);
  // Un reste que le matin absorbe (correction 19 b) : sur la ligne, sans couleur ; rien ne coince.
  const absorbe = RESTE().rep, sans = SV.tableau(absorbe, ['prepa', 'plonge']).split('<tr data-service="plonge"')[1].split('</tr>')[0];
  assert.match(sans, /<td class="sy-fin">/);
  assert.match(sans, /<small class="sy-lendemain"[^>]*>reste à laver le lendemain : 2 vols \(2 h 00 de lavage\)<\/small>/);
  assert.equal(SV.phrases(absorbe)[1], 'Rien ne coince ; rien ne part en retard.');
  // Avec le relais, tout est lavé : la ligne de la plonge ne dit rien du lendemain, et rien ne coince.
  const ok = RELAIS().rep, ligne = SV.tableau(ok, ['prepa', 'plonge']).split('<tr data-service="plonge"')[1].split('</tr>')[0];
  assert.doesNotMatch(ligne, /lendemain|heures sup|data-ton="attente">.*16:30/);
  assert.match(ligne, /<td class="sy-fin">/);
  assert.equal(SV.phrases(ok)[1], 'Rien ne coince ; rien ne part en retard.');
  assert.match(SV.carteCoince(ok).corps, /Rien ne coince\./);
});

test('l’étiquette « Bouchon » de la plonge suit : quand elle laisse au lendemain plus que le matin ne peut en absorber', () => {
  const S = R.SEUILS_DEFAUT, plongeDuMoteur = { resteSale: 0, attenteMax: 0 };
  assert.equal(RV.bouchon(plongeDuMoteur, S, DEBORDE().rep.plonge), true, 'deux vols restent, que le matin n’absorbe pas');
  assert.equal(RV.bouchon(plongeDuMoteur, S, RESTE().rep.plonge), false, 'deux vols restent, que le matin absorbe (évolution 18 : bouchon)');
  assert.equal(RV.bouchon(plongeDuMoteur, S, RELAIS().rep.plonge), false, 'tout est lavé, et V2 n’attend que 30 min');
});

test('la feuille « Réponses » : le goulot, le reste du lendemain, les parts d’un relais et d’un lavage arrêté', () => {
  const f = ER.feuilleDesReponses(DEBORDE().rep, { date: DATE });
  const g = lignesDe(f, 'Goulot')[0];
  assert.deepEqual([g[col('Sujet')], g[col('Valeur')], g[col('Unité')], g[col('Au-delà du seuil')]], ['Plonge', 0, 'min', 'non']);
  assert.equal(g[col('Détail')], 'heures sup 0 min × personnes ; 0 commande(s) ou vol(s) en retard par ses lots ; laisse 2 vol(s) à laver le lendemain (150 min de lavage), '
    + PLUS_QUE + ' (Plonge matin : 150 min de lavage au-delà) ; '
    + 'cause : ses équipes partent à la fin de leur présence : personne ne reste pour finir, ce qui n’est pas lavé passe au lendemain');
  const l = lignesDe(f, 'Reste à laver le lendemain');
  assert.deepEqual(l.map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Seuil')], x[col('Au-delà du seuil')], x[col('Détail')]]),
    [['Plonge', 2, 'vols', null, 'oui', '150 min de lavage ; un lavage arrêté compte pour sa durée restante ; plus que l’équipe du matin (Plonge matin) ne peut en laver pendant sa présence : 150 min de lavage au-delà']]);
  assert.deepEqual(lignesDe(f, 'Lavage arrêté').map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Détail')]]),
    [['Plonge', 30, 'min', 'V1 : Plonge matin 13:30 → 14:00 (30 min) ; reste 60 min à laver le lendemain']]);
  // Un reste que le matin absorbe : pas de goulot ; le reste, « non ».
  const absorbe = ER.feuilleDesReponses(RESTE().rep, { date: DATE });
  assert.equal(lignesDe(absorbe, 'Goulot')[0][col('Sujet')], 'aucun');
  assert.deepEqual(lignesDe(absorbe, 'Reste à laver le lendemain').map(x => [x[col('Valeur')], x[col('Seuil')], x[col('Au-delà du seuil')], x[col('Détail')]]),
    [[2, null, 'non', '120 min de lavage ; un lavage arrêté compte pour sa durée restante ; l’équipe du matin (Plonge matin) le lave pendant sa présence : la plonge ne coince pas']]);
  // Un relais : ses parts ; ni goulot, ni reste.
  const ok = ER.feuilleDesReponses(RELAIS().rep, { date: DATE });
  assert.deepEqual(lignesDe(ok, 'Lavage en relais').map(x => [x[col('Sujet')], x[col('Valeur')], x[col('Unité')], x[col('Détail')]]),
    [['Plonge', 180, 'min', 'L1 : Plonge matin 12:00 → 14:00 (120 min), Plonge après-midi 14:00 → 15:00 (60 min) ; propre à 15:00']]);
  assert.deepEqual([lignesDe(ok, 'Goulot')[0][col('Sujet')], lignesDe(ok, 'Reste à laver le lendemain').length, lignesDe(ok, 'Lavage arrêté').length], ['aucun', 0, 0]);
  // La ligne des heures sup de la plonge : 0.
  const hs = lignesDe(ok, 'Heures sup').find(x => x[col('Sujet')] === 'Plonge');
  assert.equal(hs[col('Valeur')], 0);
});

test('la feuille « Charge » : les relais et le reste du lendemain, en colonnes de plus, seulement s’il y en a', () => {
  const charge = x => EC.journeeVersClasseur({ resultat: x.r, args: x.args }, { date: DATE, calculeLe: LE }).find(f => f.nom === 'Charge').lignes;
  const n = EC.TETE_CHARGE.length, de_ = (lignes, nom) => lignes.find(l => l[3] === nom).slice(n);
  const relais = charge(RELAIS());
  assert.deepEqual(relais[0], [...EC.TETE_CHARGE, 'Vols passés en relais', 'Vols repris en relais', 'Travail en relais (min)', 'Reste à laver le lendemain (vols)', 'Reste à laver le lendemain (min de lavage)']);
  assert.deepEqual([de_(relais, 'Plonge matin'), de_(relais, 'Plonge après-midi'), de_(relais, 'Montage')], [[1, 0, 120, null, null], [0, 1, 60, null, null], [null, null, null, null, null]]);
  // Les indicateurs de l'équipe portent ses relais (seulement si elle en a).
  const k = RELAIS().k;
  assert.deepEqual(k.equipes.map(e => [e.id, e.relais || null]), [['montage', null], ['matin', { passes: 1, repris: 0, minutes: 120 }], ['apm', { passes: 0, repris: 1, minutes: 60 }]]);
  const reste = charge(RESTE());
  assert.deepEqual(de_(reste, 'Plonge matin'), [null, null, null, 2, 120]);
  // Une journée sans relais ni reste : la feuille d'avant, sans colonne de plus.
  const calme = charge(jouer([ret('C1', 'NORD', '08:00')], [MATIN, APM]));
  assert.deepEqual(calme[0], EC.TETE_CHARGE);
  assert.ok(calme.slice(1).every(l => l.length === n));
});

test('non-régression : sans relais ni reste, les réponses n’ont aucun champ de plus', () => {
  const { rep, k } = jouer([ret('C1', 'NORD', '08:00')], [MATIN, APM]);
  assert.deepEqual(Object.keys(rep.plonge), ['attenteMax']);
  assert.ok(rep.coince.services.every(s => !('lendemain' in s)) && rep.fins.services.every(s => !('relais' in s)) && k.equipes.every(e => !('relais' in e)));
  assert.deepEqual(rep.coince.goulots, []);
});

test('le planning des équipes : chaque équipe tient le lot pendant sa part ; l’infobulle dit le relais', () => {
  const PV = require('../planning-vue.js');
  const { r } = RELAIS(), l1 = r.lots.find(l => l.vol === 'L1'), nom = id => r.ateliers.find(a => a.id === id).nom;
  const matin = PV.lotTenu(l1, { id: 'matin' }, nom), apm = PV.lotTenu(l1, { id: 'apm' }, nom);
  assert.deepEqual([matin.debut, matin.fin, matin.duree, matin.attente, matin.relais], [h('12:00'), h('14:00'), 120, 0,
    { rang: 0, n: 2, de: null, vers: { nom: 'Plonge après-midi', a: h('14:00') }, arrete: null, propre: h('15:00') }]);
  assert.deepEqual([apm.debut, apm.fin, apm.duree, apm.relais], [h('14:00'), h('15:00'), 60, { rang: 1, n: 2, de: { nom: 'Plonge matin' }, vers: null, arrete: null, propre: h('15:00') }]);
  assert.equal(PV.info(matin, { type: 'lavage', service: 'plonge' }, {}), 'Vol L1\n12:00 → 14:00 (2 h 00)\nAttente : aucune\nEn relais : repris par Plonge après-midi à 14:00\nPropre à 15:00');
  assert.equal(PV.info(apm, { type: 'lavage', service: 'plonge' }, {}), 'Vol L1\n14:00 → 15:00 (1 h 00)\nAttente : aucune\nEn relais : commencé par Plonge matin\nPropre à 15:00');
  // Un lot ordinaire : tel quel, sans un mot de plus ; une équipe sans part : rien.
  const v2 = r.lots.find(l => l.vol === 'V2');
  assert.equal(PV.lotTenu(v2, { id: 'apm' }, nom), v2);
  assert.equal(PV.info(v2, { type: 'lavage', service: 'plonge' }, {}), 'Vol V2\n15:00 → 16:30 (1 h 30)\nAttente : 30 min');
  assert.equal(PV.lotTenu(l1, { id: 'montage' }, nom), null);
  // Un lavage arrêté : jusqu'à la fin de la présence, avec ce qu'il en reste.
  const v1 = PV.lotTenu(RESTE().r.lots.find(l => l.vol === 'V1'), { id: 'matin' }, nom);
  assert.deepEqual([v1.debut, v1.fin, v1.relais.arrete], [h('13:00'), h('14:00'), { a: h('14:00'), reste: 30 }]);
  assert.equal(PV.info(v1, { type: 'lavage', service: 'plonge' }, {}), 'Vol V1\n13:00 → 14:00 (1 h 00)\nAttente : aucune\nArrêté à 14:00, à la fin de la présence : reste 30 min à laver le lendemain');
});

test('deux vols du même nom non lavés (celui du jour, celui de la veille) : deux vols, pour la ligne comme pour l’équipe', () => {
  // Aucun tunnel ne tourne : X de la veille (LONG, 180 min) et X du jour ne sont pas commencés. Le sale du soir les fond en
  // une entrée (380 u) ; le reste du lendemain compte les deux lots, 2 × 180 min.
  const m = montage(240);
  const args = { vols: [dep('NO1', 'NORD', '23:30'), ret('X', 'LONG', '13:00')], liaisons: [], rendement: 1, noms: { prepa: 'Montage', plonge: 'Plonge' }, ...m.args,
    ateliers: [m.equipe, { ...MATIN, tunnels: [T('Tunnel 1', { actif: false })] }], parcours: [{ id: 'c1', nom: 'c1', noeuds: ['prepa'], liens: [] }], parcoursCabine: { YC: 'c1' },
    materiel: { actif: false, delaiRetour: 30, saleInitial: [{ vol: 'X', cie: 'LONG', unites: 190 }] } };
  const r = P.simuler(args), rep = R.reponses(r, args, { k: I.journee(r, args) });
  assert.deepEqual(r.saleFinal, [{ vol: 'X', cie: 'LONG', unites: 380 }]);
  // Aucun tunnel ne tourne : personne ne peut les laver le lendemain non plus — la plonge coince (`depassement` : null).
  assert.deepEqual(de(rep.coince.services, 'plonge').lendemain, { vols: 2, minutes: 360, absorbe: false, equipe: DU_MATIN, depassement: null });
  assert.deepEqual(rep.coince.goulots.map(g => g.service), ['plonge']);
  assert.deepEqual(R.lendemainDeLEquipe(r.ateliers.find(v => v.id === 'matin'), r), { vols: 2, minutes: 360 }, 'la feuille « Charge » dit comme la Synthèse');
});

test('le planning, « Toute la chaîne » : la fenêtre va jusqu’à la fin d’un lavage arrêté', () => {
  const PV = require('../planning-vue.js');
  // Un lot de 06:00 à 10:15, puis un lavage commencé à 13:00 et arrêté à 14:00 (sans fin, une part) : la fenêtre va jusqu'à
  // la fin de la part. Sans elle, elle s'arrêtait au début du lavage.
  const arrete = { debut: h('13:00'), fin: null, parts: [{ fin: h('14:00') }] };
  assert.deepEqual(PV.bornes({ lots: [{ debut: h('06:00'), fin: h('10:15') }, arrete] }), { t0: h('06:00'), t1: h('14:00') });
  assert.deepEqual(PV.bornes({ lots: [{ debut: h('06:00'), fin: h('10:15') }, { debut: h('13:00'), fin: null }] }), { t0: h('06:00'), t1: h('13:00') }, 'un lot qui ne tourne pas : à son début, comme avant');
});
