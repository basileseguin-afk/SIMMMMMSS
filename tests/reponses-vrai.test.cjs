/* Correction 17 (c) — des lignes qui disent vrai (moteur/reponses.js,
 * synthese-vue.js), sur des journées fictives calculées à la main :
 *   — un service permanent ou d'appui n'a pas de besoin calculé depuis une
 *     charge : « fixe », pas d'écart, hors de « Il faut n personnes » ; la
 *     phrase de tête dit « dont n en postes fixes » ;
 *   — un handling à chauffeurs compte les mêmes personnes dans Présents, Matin
 *     et Après-midi : ses chauffeurs ; une note dit ce qui n'est pas compté ;
 *   — l'écart ne prend la couleur de statut que s'il manque des personnes ;
 *   — les seuils par défaut : une attente de 6 h, un écart de 3 personnes,
 *     seulement quand rien n'est réglé ;
 *   — le goulot, depuis la correction 18 (a) : un service qui finit après son
 *     horaire d'au moins un quart d'heure, ou dont un lot fait partir une
 *     commande ou un vol en retard — le seuil d'attente n'y joue plus ; sinon,
 *     rien ne coince, et les attentes restent lisibles dans le tableau.
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');

const h = s => P.minutes(s), VEILLE = -1440;
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const dep = (id, cie, std, x) => ({ id, cie, sens: 'DEP', std: h(std), bc: 0, pc: 0, yc: 100, ...x });
const eq = (id, service, debut, personnes, lots, x) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes, lots, regime: { actif: true }, ...x });
const chemin = (id, noeuds) => ({ id, nom: id, noeuds, liens: noeuds.slice(1).map((v, i) => ({ de: noeuds[i], vers: v })) });
const NOMS = { cuisine: 'Cuisine', prepa: 'Montage', magasin: 'Magasin', dotation: 'Dotation', quais: 'Quais' };
const jouer = args => { const a = { liaisons: [], rendement: 1, noms: NOMS, ...args }; return { r: P.simuler(a), args: a }; };
const ligne = (rep, service, jour = 0) => rep.personnes.services.find(s => s.service === service && s.jour === jour);

/* ---- les postes fixes ------------------------------------------------------------------------------- */

// Le montage : 2 personnes pour 420 homme-minutes (un poste) ; le magasin, une mise à disposition permanente de 2 personnes ;
// la dotation, une équipe d'appui saisie d'1 personne. Ni le magasin ni la dotation n'ont de charge.
const FIXES = () => jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
  ateliers: [eq('mo', 'prepa', '06:00', 2, [['NORD/YC']]),
    { id: 'mag', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true }, permanent: true },
    { id: 'ap', nom: 'Appui', service: 'dotation', type: 'appui', debut: '06:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: true } }],
  parcours: [chemin('c1', ['magasin', 'prepa'])], parcoursCabine: { YC: 'c1' } });

test('un service permanent ou d’appui : « fixe », pas d’écart, hors de « Il faut n personnes »', () => {
  const { r, args } = FIXES(), rep = R.reponses(r, args);
  const mo = ligne(rep, 'prepa'), mag = ligne(rep, 'magasin'), ap = ligne(rep, 'dotation');
  // Le montage : 420 ÷ 420 = 1 poste ; 2 présentes → 1 de trop.
  assert.deepEqual([mo.fixe, mo.besoin, mo.presents, mo.fixes, mo.ecart, mo.sens], [false, 1, 2, 0, 1, 'sur']);
  // Le magasin et la dotation : pas de charge, pas de besoin ; leurs présents sont des postes fixes.
  assert.deepEqual([mag.fixe, mag.besoin, mag.presents, mag.fixes, mag.ecart, mag.sens, mag.signale], [true, null, 2, 2, null, null, false]);
  assert.deepEqual([ap.fixe, ap.besoin, ap.presents, ap.fixes, ap.ecart, ap.signale], [true, null, 1, 1, null, false]);
  assert.deepEqual(mag.equipes.map(e => [e.id, e.fixe]), [['mag', true]]);
  // L'unité : il faut 1 personne (le montage) ; 5 sont présentes, dont 3 en postes fixes ; l'écart compare ce qui se compare.
  assert.deepEqual(rep.personnes.total, { besoin: 1, presents: 5, fixes: 3, nonMesures: 0, ecart: 1 });
  assert.equal(SV.phrases(rep)[0], 'Il faut 1 personne, 5 sont présentes, dont 3 en postes fixes.');
  // Dans le tableau : « fixe » dans la colonne Besoin, pas d'écart.
  const html = SV.tableau(rep, ['magasin', 'prepa', 'dotation']), rang = id => html.split('<tr data-service="' + id + '"')[1].split('</tr>')[0];
  assert.match(rang('magasin'), /class="num sy-fixe"[^>]*>fixe</);
  assert.match(rang('magasin'), /class="num sy-ecart sy-vide">—</);
  assert.doesNotMatch(rang('prepa'), /sy-fixe/);
  // Sans poste fixe : la phrase d'avant.
  const sans = { ...rep, personnes: { ...rep.personnes, total: { besoin: 1, presents: 2, fixes: 0, nonMesures: 0, ecart: 1 } } };
  assert.equal(SV.phrases(sans)[0], 'Il faut 1 personne, 2 sont présentes.');
});

test('une ligne mixte : une équipe mesurée et un poste fixe dans le même service gardent le besoin et l’écart, hors poste fixe', () => {
  // Le montage : 2 personnes pour un poste, et à côté une équipe d'appui saisie de 2 personnes, dans le même service.
  const a = FIXES().args; Object.assign(a.ateliers.find(e => e.id === 'ap'), { service: 'prepa', personnes: 2 });
  const r = P.simuler(a), rep = R.reponses(r, a), mo = ligne(rep, 'prepa');
  // Présents : 4 ; postes fixes : 2 ; besoin : 1 (le poste du montage) ; écart : (4 − 2) − 1 = 1.
  assert.deepEqual([mo.fixe, mo.besoin, mo.presents, mo.fixes, mo.ecart, mo.sens], [false, 1, 4, 2, 1, 'sur']);
  assert.deepEqual(mo.equipes.map(e => [e.id, e.fixe]), [['mo', false], ['ap', true]]);
  // L'unité : le magasin (2) et l'appui (2) en postes fixes.
  assert.deepEqual(rep.personnes.total, { besoin: 1, presents: 6, fixes: 4, nonMesures: 0, ecart: 1 });
  const html = SV.tableau(rep, ['magasin', 'prepa']), rang = html.split('<tr data-service="prepa"')[1].split('</tr>')[0];
  assert.match(rang, /<td class="num">1<small>\+ 2 fixes<\/small><\/td>/, 'le besoin, et ses postes fixes à côté');
  assert.doesNotMatch(rang, /sy-fixe/);
  // Une ligne qui devient un poste fixe d'un essai à l'autre se voit dans « Comparer deux essais », même à présents égaux.
  const CV = require('../comparer-vue.js'), b = FIXES().args;
  Object.assign(b.ateliers.find(e => e.id === 'mo'), { type: 'appui', lots: [] });
  const A = FIXES(), l = CV.lignesDesReponses(R.reponses(A.r, A.args), R.reponses(P.simuler(b), b))[1].find(x => x.lib === 'Montage : il faut / présentes');
  assert.deepEqual([l.a, l.b], ['1 / 2', 'fixe / 2']);
});

test('deux essais : un poste fixe se lit « fixe », pas « absent » — dans « Comparer deux essais » et dans la feuille « Réponses »', () => {
  const CV = require('../comparer-vue.js'), ER = require('../echanges-reponses.js');
  // Le second essai met 3 personnes au magasin (2 dans le premier).
  const A = FIXES(), B = (() => { const x = FIXES().args; x.ateliers.find(e => e.id === 'mag').personnes = 3; return { r: P.simuler(x), args: x }; })();
  const ra = R.reponses(A.r, A.args), rb = R.reponses(B.r, B.args), d = R.comparer(ra, rb);
  const mag = d.personnes.services.find(x => x.service === 'magasin'), mo = d.personnes.services.find(x => x.service === 'prepa');
  assert.deepEqual([mag.besoin, mag.presents, mag.fixe], [{ a: null, b: null, d: null }, { a: 2, b: 3, d: 1 }, { a: true, b: true }]);
  assert.deepEqual(mo.fixe, { a: false, b: false });
  // « Il faut » ne bouge pas (le magasin n'y compte pas) ; les présentes, si.
  assert.deepEqual([d.personnes.total.besoin, d.personnes.total.presents], [{ a: 1, b: 1, d: 0 }, { a: 5, b: 6, d: 1 }]);
  const l = CV.lignesDesReponses(ra, rb)[1].find(x => x.lib === 'Magasin : il faut / présentes');
  assert.deepEqual([l.a, l.b], ['fixe / 2', 'fixe / 3']);
  const col = nom => ER.TETE.indexOf(nom), f = ER.feuilleDesReponses(rb, { date: '2026-11-02', comparaison: d });
  const m = f.lignes.find(x => x[col('Sujet')] === 'Magasin' && x[col('Mesure')] === 'Il faut / présentes (B − A)');
  assert.equal(m[col('Détail')], 'il faut fixe → fixe ; présentes 2 → 3');
  // La feuille, question 1 : le poste fixe sans besoin ni écart, l'unité avec ses postes fixes.
  const q1 = f.lignes.filter(x => x[col('Sujet')] === 'Magasin' && String(x[0]).startsWith('1.')), v = mes => q1.find(x => x[col('Mesure')] === mes);
  assert.deepEqual([v('Il faut')[col('Valeur')], v('Il faut')[col('Détail')]], [null, 'poste fixe : pas de besoin calculé depuis une charge']);
  assert.deepEqual([v('Écart (présentes − il faut)')[col('Valeur')], v('Écart (présentes − il faut)')[col('Au-delà du seuil')]], [null, null]);
  const u = f.lignes.find(x => x[col('Sujet')] === 'Toute l’unité' && x[col('Mesure')] === 'Dont postes fixes (ETP)');
  assert.equal(u[col('Valeur')], 4, '3 au magasin, 1 à la dotation');
});

test('une équipe sans travail ce jour-là n’est pas un poste fixe : son besoin ne se mesure pas (correction 18 a), elle ne compte plus dans « Il faut »', () => {
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
    ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), eq('vide', 'cuisine', '06:00', 2, [])], parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1' } });
  const rep = R.reponses(r, args), cu = ligne(rep, 'cuisine');
  assert.deepEqual([cu.fixe, cu.nonMesure, cu.besoin, cu.presents, cu.fixes, cu.nonMesures, cu.ecart], [false, true, null, 2, 2, 2, null]);
  assert.deepEqual(rep.personnes.total, { besoin: 1, presents: 3, fixes: 2, nonMesures: 2, ecart: 0 });
  // Dans « Comparer deux essais », elle se lit « non mesuré », pas « absent ».
  const CV = require('../comparer-vue.js'), b = JSON.parse(JSON.stringify(args)); b.ateliers.find(e => e.id === 'vide').personnes = 3;
  const l = CV.lignesDesReponses(rep, R.reponses(P.simuler(b), b))[1].find(x => x.lib === 'Cuisine : il faut / présentes');
  assert.deepEqual([l.a, l.b], ['non mesuré / 2', 'non mesuré / 3']);
});

/* ---- un handling à chauffeurs ----------------------------------------------------------------------- */

// Les quais : 4 personnes saisies à l'équipe, et des chauffeurs par créneaux — 3 de 03:30 à 12:00, 2 de 12:00 à 23:30.
const QUAIS = { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '04:00', jour: 0, personnes: 4, pauses: [], lots: [], regime: { actif: true },
  durees: { '*': 20 }, chauffeurs: { long: 2, court: 1 }, creneaux: [{ de: '03:30', a: '12:00', n: 3 }, { de: '12:00', a: '23:30', n: 2 }] };
const CHAUFFEURS = quais => jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { prepa: { '*/YC': 420 } },
  ateliers: [eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), quais], parcours: [chemin('c1', ['prepa', 'quais'])], parcoursCabine: { YC: 'c1' } });

test('un handling à chauffeurs : les mêmes personnes dans Présents, Matin et Après-midi, et une note sur ce qui n’est pas compté', () => {
  const { r, args } = CHAUFFEURS(QUAIS), rep = R.reponses(r, args), q = ligne(rep, 'quais');
  // Présents : ses chauffeurs, en équivalents temps plein — (3 × 510 + 2 × 690) minutes ÷ 480 de présence générale.
  proche(q.presents, (3 * 510 + 2 * 690) / 480);
  assert.deepEqual([q.matin.presents, q.apresMidi.presents], [3, 2], 'le matin et l’après-midi : ses chauffeurs aussi');
  assert.deepEqual([q.chauffeurs, q.horsCompte, q.fixe, q.besoin, q.ecart], [true, 4, true, null, null]);
  proche(rep.personnes.total.presents, 1 + q.presents);
  const html = SV.tableau(rep, ['prepa', 'quais']);
  assert.match(html, /chauffeurs/);
  assert.match(html, /Quais : les présents sont ses chauffeurs ; les 4 personnes saisies à l’équipe ne sont pas comptées\./);
  // Sans créneau de chauffeurs : ses personnes, comme avant, et aucune note.
  const { creneaux, chauffeurs, ...simple } = QUAIS, s = CHAUFFEURS(simple), qs = ligne(R.reponses(s.r, s.args), 'quais');
  assert.deepEqual([qs.presents, qs.chauffeurs, qs.horsCompte, qs.fixe], [4, false, 0, true]);
  assert.doesNotMatch(SV.tableau(R.reponses(s.r, s.args), ['prepa', 'quais']), /ne sont pas comptées/);
});

/* ---- l'écart : la couleur seulement s'il manque du monde --------------------------------------------- */

// La cuisine : 3 personnes pour un poste (2 de trop) ; le montage : 1 personne pour 1,43 poste (il en manque 1).
const SOUS_SUR = () => jouer({ vols: [dep('NO1', 'NORD', '20:00')], bareme: { cuisine: { '*/YC': 420 }, prepa: { '*/YC': 600 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 3, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa'])], parcoursCabine: { YC: 'c1' } });

test('un surplus sans couleur d’alerte, avec sa barre ; un manque avec', () => {
  const { r, args } = SOUS_SUR(), rep = R.reponses(r, args, { seuils: { ecartPersonnes: 1 } });
  const cu = ligne(rep, 'cuisine'), mo = ligne(rep, 'prepa');
  assert.deepEqual([cu.ecart, cu.sens, cu.signale], [2, 'sur', false], 'un surplus ne se signale pas, même au-delà du seuil');
  assert.deepEqual([mo.ecart, mo.sens, mo.signale], [-1, 'sous', true], 'il manque 1 personne, au seuil de 1');
  const html = SV.tableau(rep, ['cuisine', 'prepa']), rang = id => html.split('<tr data-service="' + id + '"')[1].split('</tr>')[0];
  assert.match(rang('cuisine'), /<td class="num sy-ecart">/, 'la cuisine : pas de ton');
  assert.match(rang('cuisine'), /sy-ecart-barre/, 'et sa barre');
  assert.match(rang('prepa'), /<td class="num sy-ecart" data-ton="attente">/);
  // Aux seuils par défaut (3 personnes), un manque d'1 personne ne se signale pas.
  assert.ok(R.reponses(r, args).personnes.services.every(s => !s.signale));
});

/* ---- les seuils par défaut --------------------------------------------------------------------------- */

test('les seuils par défaut : une attente de 6 h, un écart de 3 personnes ; un réglage enregistré ne change pas', () => {
  assert.deepEqual(R.SEUILS_DEFAUT, { ecartPersonnes: 3, attenteLot: 360, occupation: 95, dureeStockMax: null, retard: 1 });
  assert.deepEqual(R.seuilsComplets(), { ...R.SEUILS_DEFAUT });
  // Un réglage enregistré avant la correction, avec les anciens défauts écrits : relu tel quel.
  const avant = { schema: 'ory-seuils', version: 1, seuils: { ecartPersonnes: 1, attenteLot: 60, occupation: 95, dureeStockMax: null, retard: 1 } };
  assert.deepEqual(R.lireEnveloppe(avant), avant.seuils);
  const sauvegarde = contenu => ({ schema: 'ory-sauvegarde', version: 1, contenu });
  assert.deepEqual(R.seuilsDeLaSauvegarde(sauvegarde({ 'ory-seuils-v1': avant })), avant.seuils, 'la sauvegarde garde ses seuils');
  assert.deepEqual(R.seuilsDeLaSauvegarde(sauvegarde({})), { ...R.SEUILS_DEFAUT }, 'rien de réglé : les nouveaux défauts');
  // Ce qu'on enregistre écrit chaque seuil : un réglage fait aujourd'hui ne dépendra pas des défauts de demain.
  assert.deepEqual(Object.keys(R.enveloppe({ retard: 5 }).seuils).sort(), Object.keys(R.SEUILS_DEFAUT).sort());
});

/* ---- le goulot ---------------------------------------------------------------------------------------- */

// Le montage fait d'abord NORD/BC (3 h), puis NORD/YC, que la cuisine livre à 07:00 : YC attend de 07:00 à 09:00 (2 h), le
// montage finit à 09:45, dans son horaire (14:00) ; le vol part à `depart`.
const ATTENTE = depart => jouer({ vols: [dep('NO1', 'NORD', depart, { bc: 10 })], bareme: { cuisine: { '*/YC': 60 }, prepa: { '*/BC': 180, '*/YC': 30 } },
  ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']])],
  parcours: [chemin('c1', ['cuisine', 'prepa']), chemin('c2', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c2' } });

test('un arrivage qui attend 2 h, mais tout finit dans l’horaire et rien ne part en retard : rien ne coince', () => {
  const { r, args } = ATTENTE('18:00');
  for (const seuils of [undefined, { attenteLot: 60 }]) {
    const rep = R.reponses(r, args, { seuils }), mo = rep.coince.services.find(s => s.service === 'prepa');
    assert.equal(mo.attenteMax.minutes, 120);
    assert.equal(rep.fins.services.find(s => s.service === 'prepa').depasse, 0);
    assert.deepEqual(rep.exceptions, []);
    assert.equal(rep.coince.goulot, null, 'au seuil de ' + rep.seuils.attenteLot + ' min');
    assert.match(SV.phrases(rep)[1], /^Rien ne coince ; /);
    assert.match(SV.carteCoince(rep).corps, /Rien ne coince\./);
  }
  // L'attente reste lisible dans le tableau : au seuil d'1 h, sa case est signalée.
  const rep = R.reponses(r, args, { seuils: { attenteLot: 60 } });
  assert.equal(SV.tons(SV.lignes(rep, ['cuisine', 'prepa']).find(l => l.service === 'prepa'), rep.seuils).attente, 'attente');
  assert.match(SV.carteCoince(rep).corps, /Montage[\s\S]*2 h 00/, 'la carte nomme ce qui attend au-delà du seuil, sans en faire un goulot');
});

test('un service qui dépasse son horaire d’au moins un quart d’heure : le goulot, à n’importe quel seuil d’attente', () => {
  // La veille : NORD/BC et NORD/YC, prêtes à l'arrivée de l'équipe, forment un seul arrivage, commencé à 06:00 : aucune attente
  // (NORD/YC, faite après NORD/BC, est simplement à faire). L'équipe finit à 15:00 pour un horaire à 14:00 : 60 min de dépassement.
  const args = { liaisons: [], rendement: 1, noms: NOMS, heuresSup: { actif: true, plafond: 120 }, vols: [dep('NO1', 'NORD', '20:00', { bc: 10 })],
    bareme: { prepa: { 'NORD/BC': 180, 'NORD/YC': 300 } }, ateliers: [eq('veille', 'prepa', '06:00', 1, [['NORD/BC'], ['NORD/YC']], { jour: -1 })],
    parcours: [chemin('c1', ['prepa'])], parcoursCabine: { YC: 'c1', BC: 'c1' } };
  const r = P.simuler(args), rep = R.reponses(r, args, { seuils: { attenteLot: 60 } }), g = rep.coince.goulot;
  assert.deepEqual([g.service, g.jour, g.attenteMax, g.depasse, g.heuresSup, g.enRetard, g.cause], ['prepa', -1, null, 60, 60, 0, { code: 'charge' }]);
  assert.match(SV.carteCoince(rep).corps, /finit 1 h 00 après son horaire/);
  // Le seuil d'attente n'y joue pas : au défaut (6 h), le même goulot.
  assert.equal(R.reponses(r, args).coince.goulot.service, 'prepa');
  assert.equal(SV.phrases(rep)[1], 'Montage (veille) coince : il finit 1 h 00 après son horaire ; rien ne part en retard.');
});

test('un service qui fait partir une commande en retard : le goulot, sans dépasser son horaire', () => {
  // Le même montage, mais le vol part à 09:00 : NORD/YC, prête à 09:45, part 45 min en retard.
  const { r, args } = ATTENTE('09:00'), rep = R.reponses(r, args, { seuils: { attenteLot: 60 } }), g = rep.coince.goulot;
  assert.ok(rep.exceptions.some(x => x.type === 'commande-en-retard' && x.id === 'NORD/YC'));
  assert.deepEqual([g.service, g.jour, g.attenteMax, g.depasse], ['prepa', 0, 120, 0]);
  assert.ok(g.enRetard >= 1, 'une commande en retard passe par lui');
  assert.match(SV.carteCoince(rep).corps, /part(ent)? en retard/);
  // La cuisine, par qui passe la commande en retard, coince aussi, après le montage ; au seuil d'attente par défaut, les mêmes.
  assert.deepEqual(rep.coince.goulots.map(x => x.service), ['prepa', 'cuisine']);
  assert.deepEqual(R.reponses(r, args).coince.goulots.map(x => x.service), ['prepa', 'cuisine']);
});

test('ce qui part en retard par une ligne : une commande pas finie, un vol chargé en retard au handling', () => {
  // Une commande pas finie : 1 personne pour 600 homme-minutes, coupée par la fin du poste — elle passe par la cuisine et le montage.
  const s = SOUS_SUR(), ra = R.reponses(s.r, s.args);
  assert.equal(s.r.parClasse['NORD/YC'].fin, null, 'la commande n’est pas finie');
  assert.deepEqual(ra.coince.services.map(x => [x.service, x.enRetard]), [['cuisine', 1], ['prepa', 1]]);
  // Un vol chargé en retard : la cuisine livre à 08:00, le montage finit à 08:30, le vol part à 08:15 et se charge à 08:50.
  const quais = { id: 'h', nom: 'Quais', service: 'quais', type: 'handling', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true }, durees: { '*': 20 } };
  const { r, args } = jouer({ vols: [dep('NO1', 'NORD', '08:15')], bareme: { cuisine: { '*/YC': 120 }, prepa: { '*/YC': 30 } },
    ateliers: [eq('cu', 'cuisine', '06:00', 1, [['NORD/YC']]), eq('mo', 'prepa', '06:00', 1, [['NORD/YC']]), quais],
    parcours: [chemin('c1', ['cuisine', 'prepa', 'quais'])], parcoursCabine: { YC: 'c1' } });
  const rep = R.reponses(r, args), de = id => rep.coince.services.find(x => x.service === id);
  assert.deepEqual(rep.exceptions.map(x => [x.type, x.id]), [['vol-en-retard', 'NO1'], ['commande-en-retard', 'NORD/YC']]);
  // La commande en retard passe par la cuisine et le montage ; le vol chargé en retard, par les quais.
  assert.deepEqual([de('cuisine').enRetard, de('prepa').enRetard, de('quais').enRetard], [1, 1, 1]);
  // Un retard sous le seuil de retard ne compte pas.
  const large = R.reponses(r, args, { seuils: { retard: 61 } });
  assert.deepEqual(large.coince.services.map(x => x.enRetard), [0, 0, 0]);
  // Un départ en retard suffit (correction 18 a) : ces services coincent, sans attente ni dépassement. À heures sup et cumul
  // égaux, l'ordre des lignes. Le montage attendait la cuisine avant son premier lot : sa cause le dit.
  assert.deepEqual(rep.coince.goulots.map(g => [g.service, g.depasse, g.cumul]), [['cuisine', 0, 0], ['prepa', 0, 0], ['quais', 0, 0]]);
  assert.deepEqual(rep.coince.goulots[1].cause, { code: 'amont', service: 'cuisine', nom: 'Cuisine', a: h('08:00') });
  assert.deepEqual(large.coince.goulots, []);
});
