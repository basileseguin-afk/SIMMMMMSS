/* Banc d'essai, évolution 17 (b) — à la limite, ou en sur-effectif
 * (moteur/calage-statut.js, moteur/calage-periode.js, moteur/reel.js ;
 * docs/BANC_ESSAI.md § 10). Une formule apprise sur les heures dit ce que
 * l'unité met, pas toujours ce qu'il faut. Chaque ligne calée reçoit un
 * statut : « à la limite » (les heures réelles suivent le travail au barème,
 * corrélation de rang d'au moins 0,3, et la part des heures supp est plus
 * haute dans le tiers des jours les plus chargés que dans le tiers des moins
 * chargés), « en sur-effectif » (ni l'un ni l'autre), « indéterminé » (un
 * seul des deux, et le rapport dit lequel manque). Hors « à la limite », la
 * formule retenue est l'effectif mis, et le besoin se borne : au plus le
 * travail au barème du jour × le rythme des jours chargés, sans dépasser le
 * prévu. La politique d'effectif garde le statut et ce rythme, sans aucune
 * heure réelle. Des jours fabriqués ; aucune donnée réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../moteur/calage-periode.js');
const S = require('../moteur/calage-statut.js');
const R = require('../moteur/reel.js');
const T = require('../tableur.js');

function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const bruit = (h, s) => (h() + h() + h() - 1.5) * s * 2;
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, (m ? m + ' : ' : '') + x + ' attendu ' + y);
/** 91 jours du 1er septembre au 30 novembre 2026 ; `jour(simulé, hasard, i)` rend { reel, heures?, heuresSupp? }. */
function jours(jour, { graine = 7, n = 91, simule } = {}) {
  const h = hasard(graine), t0 = Date.parse('2026-09-01T12:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const s = simule ? simule(h, i) : 2 + 38 * h();
    return { date: new Date(t0 + i * 86400000).toISOString().slice(0, 10), simule: s, ...jour(s, h, i) };
  });
}
/** Les heures suivent la charge (0,8 × le travail), et les heures supp n'arrivent que les jours chargés (au-dessus de 25 ETP au barème). */
const tendue = (s, h) => { const reel = 0.8 * s + bruit(h, 0.3); return { reel, heures: 7 * reel, heuresSupp: s > 25 ? 0.6 * (s - 25) : 0 }; };
/** 15 personnes tous les jours, quel que soit le travail, et pas une heure supp. */
const large = (s, h) => { const reel = 15 + bruit(h, 0.4); return { reel, heures: 7 * reel, heuresSupp: 0 }; };

test('les deux seuils sont des constantes nommées ; les noms des statuts', () => {
  assert.deepEqual([S.CORRELATION_LIMITE, S.PART_DES_TIERS, S.PART_JOURS_CHARGES, S.JOURS_CHARGES_MIN], [0.3, 1 / 3, 0.1, 5]);
  assert.deepEqual(S.NOMS, { 'limite': 'à la limite', 'sur-effectif': 'en sur-effectif', 'indetermine': 'indéterminé' });
});

test('la corrélation de rang, sur un petit exemple calculé à la main', () => {
  // Rangs de x : 1, 2, 3, 4, 5 ; de y : 2, 1, 4, 3, 5 ; Σd² = 4 : 1 − 6 × 4 ÷ (5 × 24) = 0,8.
  proche(S.correlationDeRang([10, 20, 30, 40, 50], [7, 3, 9, 8, 12]), 0.8);
  proche(S.correlationDeRang([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  // Des ex aequo prennent leur rang moyen : x = 1, 2, 2, 3 → rangs 1 ; 2,5 ; 2,5 ; 4.
  proche(S.correlationDeRang([1, 2, 2, 3], [1, 2, 3, 4]), 4.5 / Math.sqrt(4.5 * 5));
  // Une série qui ne varie pas : pas de corrélation.
  assert.equal(S.correlationDeRang([5, 5, 5], [1, 2, 3]), null);
});

test('la part des heures supp par tiers, calculée à la main ; trop peu de jours connus', () => {
  // Six jours, du moins au plus chargé : les deux moins chargés font 1 h supp sur 100 h, les deux plus chargés 9 h sur 150 h.
  const six = [[1, 50, 0], [2, 50, 1], [3, 60, 2], [4, 60, 2], [5, 70, 4], [6, 80, 5]].map(([simule, heures, heuresSupp], i) => ({ date: '2026-10-0' + (i + 1), simule, reel: simule, heures, heuresSupp }));
  assert.deepEqual(S.heuresSuppParTiers(six), { jours: 6, parTiers: 2, partCalme: 1 / 100, partChargee: 9 / 150, monte: true });
  // Un jour sans ses heures supp ne compte pas : cinq jours, un par tiers (le moins chargé, le plus chargé).
  const cinq = six.map((j, i) => (i === 1 ? { ...j, heuresSupp: null } : j));
  assert.deepEqual(S.heuresSuppParTiers(cinq), { jours: 5, parTiers: 1, partCalme: 0, partChargee: 5 / 80, monte: true });
  // Sans la colonne : rien ; connues deux jours seulement : insuffisant, quel que soit le minimum demandé.
  assert.equal(S.heuresSuppParTiers(six.map(({ heures, heuresSupp, ...j }) => j)), null);
  assert.deepEqual(S.heuresSuppParTiers(six.slice(0, 2)), { insuffisant: 2 });
  assert.deepEqual(S.heuresSuppParTiers(six, 20), { insuffisant: 6 });
  // Le statut, appelé sans minimum : la raison ne dit jamais « undefined ».
  const s = S.statutDe(six.slice(0, 2).concat([{ date: '2026-10-09', simule: 9, reel: 9 }]));
  assert.match(s.raison, / ; heures supp connues sur 2 jours seulement \(moins de 3\), le statut se juge sur la corrélation seule$/);
});

test('des heures qui suivent la charge, des heures supp les jours chargés : « à la limite », la formule est le besoin', () => {
  const r = C.calerLigne(jours(tendue));
  assert.equal(r.retenu.modele, 'x-a');
  assert.deepEqual([r.statut.code, r.statut.nom, r.lecture], ['limite', 'à la limite', 'besoin']);
  assert.ok(r.statut.correlation > 0.9 && r.statut.suit === true);
  assert.equal(r.statut.supp.monte, true);
  assert.equal(r.statut.supp.partCalme, 0, 'aucune heure supp le tiers des jours les moins chargés');
  assert.ok(r.statut.supp.partChargee > 0.01);
  assert.deepEqual([r.statut.supp.jours, r.statut.supp.parTiers], [91, 30]);
  assert.match(r.statut.raison, /^à la limite : les heures réelles suivent le travail au barème \(corrélation de rang (0,9\d?|1)\) et la part des heures supp monte avec la charge \(\d+(,\d+)? % le tiers des jours les plus chargés, 0 % le tiers des moins chargés\)$/);
  assert.ok(!('manque' in r.statut));
});

test('des heures constantes, sans heures supp : « en sur-effectif », la formule est l’effectif mis, la borne calculée à la main', () => {
  // 60 jours : le travail au barème vaut 1, 2, … 60 ETP, dans le désordre ; 30 personnes tous les jours, à 0,2 près (29,8 ou 30,2, un jour sur deux), pas d'heures supp.
  const l = jours((s, h, i) => ({ reel: 30 + (i % 2 ? 0.2 : -0.2), heures: 210, heuresSupp: 0 }), { n: 60, simule: (h, i) => 1 + (i * 37) % 60 });
  const r = C.calerLigne(l);
  assert.equal(r.retenu.modele, 'constante');
  assert.deepEqual([r.statut.code, r.statut.nom, r.lecture], ['sur-effectif', 'en sur-effectif', 'effectif mis']);
  assert.ok(Math.abs(r.statut.correlation) < 0.3 && r.statut.suit === false && r.statut.supp.monte === false);
  assert.match(r.statut.raison, /^en sur-effectif : les heures réelles ne suivent pas le travail au barème \(corrélation de rang -?0(,\d+)?, sous 0,3\) et la part des heures supp ne monte pas avec la charge \(0 % le tiers des jours les plus chargés, 0 % le tiers des moins chargés\)$/);
  // Le dixième des jours les plus chargés : 6 jours, de 55 à 60 ETP au barème. Le rythme : la médiane de réel ÷ travail,
  // la moyenne des deux du milieu (57 et 58 ETP au barème).
  const reel = s => l.find(j => j.simule === s).reel;
  const attendu = (reel(57) / 57 + reel(58) / 58) / 2;
  assert.deepEqual(r.rythmeCharge.jours, 6);
  proche(r.rythmeCharge.rythme, attendu);
  assert.ok(Math.abs(attendu - 0.5218) < 0.004, 'à la main : environ 30 ÷ 57,5');
  // La borne d'un jour : son travail au barème × ce rythme, sans dépasser le prévu.
  proche(S.besoinAuPlus({ statut: 'sur-effectif', rythmeCharge: attendu }, 40, 30), 40 * attendu);
  assert.equal(S.besoinAuPlus({ statut: 'sur-effectif', rythmeCharge: attendu }, 70, 30), 30, 'sans dépasser le prévu');
  assert.equal(S.besoinAuPlus({ statut: 'limite', rythmeCharge: attendu }, 40, 30), null, 'à la limite : la formule est le besoin, pas de borne');
  assert.equal(S.besoinAuPlus({ statut: 'sur-effectif' }, 40, 30), null, 'sans rythme : pas de borne');
  assert.equal(S.besoinAuPlus({}, 40, 30), null, 'une politique d’avant : pas de borne');
});

test('des heures exactement constantes : elles ne suivent pas le travail, la ligne est « en sur-effectif » et a sa borne', () => {
  // 60 jours, un travail au barème de 1 à 60 ETP, 30 personnes chaque jour, sans une heure supp : aucune corrélation ne se calcule.
  const fixe = { n: 60, simule: (h, i) => 1 + (i * 37) % 60 };
  const r = C.calerLigne(jours(() => ({ reel: 30, heures: 210, heuresSupp: 0 }), fixe));
  assert.deepEqual([r.retenu.modele, r.statut.code, r.statut.correlation, r.statut.suit, r.lecture], ['constante', 'sur-effectif', null, false, 'effectif mis']);
  assert.equal(r.statut.raison, 'en sur-effectif : les heures réelles ne suivent pas le travail au barème (elles ne varient pas) et la part des heures supp ne monte pas avec la charge '
    + '(0 % le tiers des jours les plus chargés, 0 % le tiers des moins chargés)');
  // Les six jours les plus chargés, de 55 à 60 ETP : la médiane de 30 ÷ travail, la moyenne de 30 ÷ 57 et 30 ÷ 58.
  proche(r.rythmeCharge.rythme, (30 / 57 + 30 / 58) / 2);
  // Sans colonne d'heures supp : la même chose, sur la corrélation seule.
  const sans = C.calerLigne(jours(() => ({ reel: 30 }), fixe));
  assert.deepEqual([sans.statut.code, sans.statut.correlation, sans.statut.supp], ['sur-effectif', null, null]);
  assert.match(sans.statut.raison, /^en sur-effectif : les heures réelles ne suivent pas le travail au barème \(elles ne varient pas\) ; sans heures supp dans le fichier du réel/);
});

test('un rythme nul ou démesuré ne se garde pas : la politique se relit toujours', () => {
  // Aucune heure réelle les dix jours les plus chargés : le rythme serait 0. Pas de borne, et la raison le dit.
  const l = jours((s, h, i) => ({ reel: s > 50 ? 0 : 10 + (i % 7) }), { n: 60, simule: (h, i) => 1 + (i * 37) % 60 });
  const r = C.calerLigne(l);
  assert.equal(r.lecture, 'effectif mis');
  assert.deepEqual([r.rythmeCharge.rythme, r.rythmeCharge.jours], [null, 6]);
  assert.equal(r.rythmeCharge.raison, 'pas de borne : le rythme des jours chargés (0) n’est pas un nombre positif sous 1000');
  // La politique ne garde pas ce rythme, et se relit de la sauvegarde.
  const comparaison = { lignes: [{ nom: 'Lavage', couvre: 'fictif', jours: l }], unite: { jours: l.map(j => ({ date: j.date })) } };
  const politique = C.politiqueDe(C.caler(comparaison), { date: '2026-12-01' });
  assert.ok(!('rythmeCharge' in politique.lignes[0]));
  assert.deepEqual(C.validerPolitique(JSON.parse(JSON.stringify(politique))).lignes, politique.lignes);
  // Un « × a » appliqué qui porterait le rythme au-delà de la borne : la ligne n'a plus de borne, et se relit.
  const applique = C.ligneAppliquee({ nom: 'L', modele: 'x-a', parametres: { a: 0.5 }, sigma: 0.1, statut: 'indetermine', rythmeCharge: 600 });
  assert.deepEqual(applique, { nom: 'L', modele: 'x-a', parametres: { a: 1 }, sigma: 0.1, statut: 'indetermine', applique: true });
  assert.deepEqual(C.validerPolitique({ lignes: [applique] }).lignes[0], applique);
  assert.deepEqual([S.rythmeValide(0), S.rythmeValide(1000), S.rythmeValide(1000.5), S.rythmeValide(NaN), S.rythmeValide('1')], [false, true, false, false, false]);
});

test('indéterminé : un seul des deux critères, et le rapport dit lequel manque', () => {
  // Les heures suivent la charge, mais les heures supp sont les mêmes les jours calmes et chargés (une part plus haute les jours calmes).
  const sansMontee = C.calerLigne(jours((s, h) => { const reel = 0.8 * s + bruit(h, 0.3); return { reel, heures: 7 * reel, heuresSupp: 2 }; }));
  assert.deepEqual([sansMontee.statut.code, sansMontee.statut.manque, sansMontee.lecture], ['indetermine', 'supp', 'effectif mis']);
  assert.match(sansMontee.statut.raison, /^indéterminé : les heures réelles suivent le travail au barème \(corrélation de rang (0,9\d?|1)\), mais la part des heures supp ne monte pas avec la charge \(\d+(,\d+)? % le tiers des jours les plus chargés, \d+(,\d+)? % le tiers des moins chargés\)$/);
  // Les heures ne suivent pas la charge, mais les heures supp montent avec elle.
  const sansSuivi = C.calerLigne(jours((s, h) => { const reel = 15 + bruit(h, 0.4); return { reel, heures: 7 * reel, heuresSupp: s > 25 ? 3 : 0 }; }));
  assert.deepEqual([sansSuivi.statut.code, sansSuivi.statut.manque, sansSuivi.lecture], ['indetermine', 'correlation', 'effectif mis']);
  assert.match(sansSuivi.statut.raison, /^indéterminé : la part des heures supp monte avec la charge \(\d+(,\d+)? % le tiers des jours les plus chargés, 0 % le tiers des moins chargés\), mais les heures réelles ne suivent pas le travail au barème \(corrélation de rang -?0(,\d+)?, sous 0,3\)$/);
  // Indéterminée, la ligne a sa borne comme une ligne en sur-effectif.
  assert.ok(sansSuivi.rythmeCharge.rythme > 0 && sansSuivi.rythmeCharge.jours === 9);
});

test('sans colonne d’heures supp : le statut se juge sur la corrélation seule, et le rapport le dit', () => {
  const suit = C.calerLigne(jours((s, h) => ({ reel: 0.8 * s + bruit(h, 0.3) })));
  assert.deepEqual([suit.statut.code, suit.statut.supp, suit.lecture], ['limite', null, 'besoin']);
  assert.match(suit.statut.raison, /^à la limite : les heures réelles suivent le travail au barème \(corrélation de rang (0,9\d?|1)\) ; sans heures supp dans le fichier du réel, le statut se juge sur la corrélation seule$/);
  const plat = C.calerLigne(jours((s, h) => ({ reel: 15 + bruit(h, 0.4) })));
  assert.deepEqual([plat.statut.code, plat.statut.supp, plat.lecture], ['sur-effectif', null, 'effectif mis']);
  assert.match(plat.statut.raison, /^en sur-effectif : les heures réelles ne suivent pas le travail au barème \(corrélation de rang -?0(,\d+)?, sous 0,3\) ; sans heures supp dans le fichier du réel, le statut se juge sur la corrélation seule$/);
  // Des heures supp connues sur trop peu de jours (moins de 20) : comme sans la colonne, et la raison le dit.
  const rares = C.calerLigne(jours((s, h, i) => ({ reel: 0.8 * s + bruit(h, 0.3), heures: 50, heuresSupp: i < 12 ? 1 : null })));
  assert.deepEqual([rares.statut.code, rares.statut.supp], ['limite', null]);
  assert.match(rares.statut.raison, / ; heures supp connues sur 12 jours seulement \(moins de 20\), le statut se juge sur la corrélation seule$/);
});

test('moins de cinq jours dans le dixième des plus chargés : pas de borne, et le rapport le dit', () => {
  // 45 jours : le dixième en compte 4.
  const r = C.calerLigne(jours(large, { n: 45 }));
  assert.equal(r.statut.code, 'sur-effectif');
  assert.deepEqual([r.rythmeCharge.rythme, r.rythmeCharge.jours], [null, 4]);
  assert.equal(r.rythmeCharge.raison, 'pas de borne : 4 jours dans le dixième des jours les plus chargés, il en faut 5');
  // 50 jours : cinq, la borne existe.
  assert.equal(C.calerLigne(jours(large, { n: 50 })).rythmeCharge.jours, 5);
  // Une ligne à la limite n'a pas de borne à donner : sa formule est son besoin.
  assert.equal(C.calerLigne(jours(tendue)).rythmeCharge, null);
});

test('une ligne hors simulation, ou dont le simulé ne varie pas : pas de statut', () => {
  const hors = C.calerLigne(jours((s, h) => ({ reel: 4 + bruit(h, 0.2) }), { simule: () => 0 }), { hors: true });
  assert.deepEqual([hors.statut, hors.rythmeCharge, hors.lecture], [null, null, undefined]);
  const fixe = C.calerLigne(jours((s, h) => ({ reel: 4 + bruit(h, 0.2) }), { simule: () => 6 }));
  assert.equal(fixe.statut, null);
});

/** Une comparaison à deux lignes, comme moteur/reel.js la rend. */
function comparaison() {
  const lignes = [{ nom: 'Montage', couvre: 'fictif', jours: jours(tendue) }, { nom: 'Lavage', couvre: 'fictif', jours: jours(large, { graine: 9 }) }];
  return { lignes, unite: { jours: lignes[0].jours.map(j => ({ date: j.date })) } };
}

test('la politique d’effectif garde le statut et le rythme des jours chargés, sans aucune heure réelle', () => {
  const rapport = C.caler(comparaison()), politique = C.politiqueDe(rapport, { date: '2026-12-01' });
  const [montage, lavage] = politique.lignes;
  assert.deepEqual(Object.keys(montage), ['nom', 'modele', 'parametres', 'sigma', 'statut']);
  assert.deepEqual(Object.keys(lavage), ['nom', 'modele', 'parametres', 'sigma', 'statut', 'rythmeCharge']);
  assert.deepEqual([montage.statut, lavage.statut], ['limite', 'sur-effectif']);
  assert.equal(lavage.rythmeCharge, rapport.lignes[1].rythmeCharge.rythme);
  // Aucune heure réelle, aucun jour : des noms, des modèles, des paramètres, σ, un statut, un rythme.
  const texte = JSON.stringify(politique);
  assert.ok(!/reel|heures|2026-(09|10|11)/.test(texte), texte);
  // Relue de la sauvegarde, elle est la même.
  assert.deepEqual(C.validerPolitique(JSON.parse(texte)).lignes, politique.lignes);
});

test('validerPolitique : un statut connu, un rythme positif ; sinon la politique est refusée entière', () => {
  const ligne = x => ({ lignes: [{ nom: 'L', modele: 'constante', parametres: { c: 15 }, sigma: 0.4, ...x }] });
  assert.deepEqual(C.validerPolitique(ligne({ statut: 'indetermine', rythmeCharge: 0.52 })).lignes[0],
    { nom: 'L', modele: 'constante', parametres: { c: 15 }, sigma: 0.4, statut: 'indetermine', rythmeCharge: 0.52 });
  // Une politique d'avant (ni statut ni rythme) reste telle quelle.
  assert.deepEqual(Object.keys(C.validerPolitique(ligne({})).lignes[0]), ['nom', 'modele', 'parametres', 'sigma']);
  assert.throws(() => C.validerPolitique(ligne({ statut: 'tendu' })), /politique d’effectif, ligne 1 : statut inconnu « tendu »\./);
  // Ni un tableau qui se lirait comme un code, ni un nom hérité d'un objet.
  for (const faux of [['limite'], 'constructor', '__proto__', 7, {}]) assert.throws(() => C.validerPolitique(ligne({ statut: faux })), /ligne 1 : statut inconnu/, JSON.stringify(faux));
  assert.deepEqual([S.lectureDe('limite'), S.lectureDe('indetermine'), S.lectureDe('constructor'), S.lectureDe(['limite']), S.lectureDe(undefined)], ['besoin', 'effectif mis', null, null, null]);
  for (const faux of [0, -1, NaN, Infinity, '0,5', 1e4, {}])
    assert.throws(() => C.validerPolitique(ligne({ statut: 'sur-effectif', rythmeCharge: faux })), /ligne 1 : le rythme des jours chargés est un nombre positif\./, String(faux));
});

test('le prévu d’un jour : le statut de chaque ligne, et le besoin « au plus » hors « à la limite »', () => {
  const politique = { date: '2026-12-01', periode: null, signature: null, lignes: [
    { nom: 'Montage', modele: 'x-a', parametres: { a: 0.8 }, sigma: 0.5, statut: 'limite' },
    { nom: 'Lavage', modele: 'constante', parametres: { c: 15 }, sigma: 0.4, statut: 'sur-effectif', rythmeCharge: 0.5 },
    { nom: 'Plonge', modele: 'constante', parametres: { c: 6 }, sigma: 0.3, statut: 'indetermine' },
    { nom: 'Quais', modele: 'x-a', parametres: { a: 0.9 }, sigma: 0.2 }] };
  const corr = { lignes: politique.lignes.map(l => ({ nom: l.nom, roles: [l.nom], services: [l.nom.toLowerCase()] })) };
  const prevu = C.prevuDesJours(politique, corr, [{ date: '2026-12-07', x: 20 }, { date: '2026-12-08', x: 40 }], (l, w) => w.x);
  const [montage, lavage, plonge, quais] = prevu.lignes;
  assert.deepEqual([montage.statut, montage.nomStatut, montage.lecture], ['limite', 'à la limite', 'besoin']);
  assert.deepEqual([lavage.statut, lavage.nomStatut, lavage.lecture], ['sur-effectif', 'en sur-effectif', 'effectif mis']);
  assert.deepEqual([plonge.statut, plonge.nomStatut, plonge.lecture], ['indetermine', 'indéterminé', 'effectif mis']);
  assert.ok(!('statut' in quais) && !('lecture' in quais), 'une ligne gardée avant : pas de statut');
  // Lavage : 20 ETP au barème × 0,5 = 10, sous le prévu de 15 ; 40 × 0,5 = 20, au-dessus : la borne est le prévu.
  assert.deepEqual(lavage.jours.map(j => [j.prevu, j.besoinAuPlus]), [[15, 10], [15, 15]]);
  // À la limite, sans rythme, ou gardée avant : pas de borne.
  for (const l of [montage, plonge, quais]) assert.ok(l.jours.every(j => !('besoinAuPlus' in j)), l.nom);
  // Le total de l'unité : chaque ligne à son besoin au plus, sinon à son prévu (16 + 10 + 6 + 18 ; 32 + 15 + 6 + 36).
  assert.deepEqual(prevu.unite.map(j => [j.prevu, j.besoinAuPlus]), [[16 + 15 + 6 + 18, 16 + 10 + 6 + 18], [32 + 15 + 6 + 36, 32 + 15 + 6 + 36]]);
  // Sans aucune borne dans la politique : le total n'en a pas non plus, et rien d'autre ne change.
  const avant = { ...politique, lignes: politique.lignes.map(({ statut, rythmeCharge, ...l }) => l) };
  const sans = C.prevuDesJours(avant, corr, [{ date: '2026-12-07', x: 20 }], (l, w) => w.x);
  assert.ok(sans.unite.every(j => !('besoinAuPlus' in j)) && sans.lignes.every(l => !('statut' in l)));
  assert.deepEqual(sans.unite[0].prevu, prevu.unite[0].prevu);
});

test('un « × a » appliqué au barème : a = 1, et le rythme des jours chargés se divise par a — le besoin « au plus » reste le même', () => {
  const m = { nom: 'Montage', modele: 'x-a', parametres: { a: 0.8 }, sigma: 0.5, services: ['montage'], statut: 'indetermine', rythmeCharge: 0.6 };
  const applique = C.ligneAppliquee(m);
  assert.deepEqual(applique, { nom: 'Montage', modele: 'x-a', parametres: { a: 1 }, sigma: 0.5, services: ['montage'], statut: 'indetermine', applique: true, rythmeCharge: 0.6 / 0.8 });
  // Avant : 20 ETP au barème, prévu 16, au plus 20 × 0,6 = 12. Après : le barème compte 16 ETP, prévu 16, au plus 16 × 0,75 = 12.
  const corr = { lignes: [{ nom: 'Montage', roles: ['Monteur'], services: ['montage'] }] }, jour = [{ date: '2026-12-07' }];
  const avant = C.prevuDesJours({ lignes: [m] }, corr, jour, () => 20).lignes[0].jours[0], apres = C.prevuDesJours({ lignes: [applique] }, corr, jour, () => 16).lignes[0].jours[0];
  assert.deepEqual([avant.prevu, avant.besoinAuPlus], [16, 12]);
  proche(apres.prevu, 16); proche(apres.besoinAuPlus, 12);
  // Une ligne sans rythme (à la limite, ou gardée avant) : comme avant, a = 1 et « appliqué », rien d'autre.
  assert.deepEqual(C.ligneAppliquee({ nom: 'L', modele: 'x-a', parametres: { a: 1.2 }, sigma: 0.1 }), { nom: 'L', modele: 'x-a', parametres: { a: 1 }, sigma: 0.1, applique: true });
});

test('la comparaison donne, avec la colonne des heures supp, les heures et les heures supp de chaque jour d’une ligne', () => {
  const dates = Array.from({ length: 3 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
  const bilan = { services: [{ id: 'prepa', nom: 'Préparation' }], joursTravail: dates.map(date => ({ date, complet: true, services: { prepa: { charge: 2, heuresSup: 0 } }, total: {} })) };
  const corr = { lignes: [{ nom: 'Prépa', roles: ['Préparateur', 'Chef'], services: ['prepa'] }] };
  const lire = (entete, lignes) => R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv([entete].concat(lignes).join('\n')) }]);
  // Le chef n'a pas ses heures supp le deuxième jour : ce jour-là, celles de la ligne sont inconnues.
  const avec = lire('date;role;heures_titulaires;heures_interim;heures_supp', dates.flatMap((d, i) => [d + ';Préparateur;14;7;2', d + ';Chef;7;0;' + (i === 1 ? '' : '1')]));
  assert.deepEqual(R.comparer(bilan, avec, corr).lignes[0].jours.map(j => [j.heures, j.heuresSupp]), [[28, 3], [28, null], [28, 3]]);
  // Sans la colonne : les jours d'avant, sans ces champs.
  const sans = lire('date;role;heures_titulaires;heures_interim', dates.flatMap(d => [d + ';Préparateur;14;7', d + ';Chef;7;0']));
  assert.deepEqual(Object.keys(R.comparer(bilan, sans, corr).lignes[0].jours[0]), ['date', 'reel', 'simule', 'ecart']);
});
