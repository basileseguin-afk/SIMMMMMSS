/* Évolution 15 (d) — la page Période, sans navigateur (periode-vue.js,
 * periode-courbe.js, moteur/periode.js chargeDeLUnite), sur l'unité fictive de
 * la référence de non-régression et deux programmes datés fictifs :
 *   — la colonne « Unité » : chaque jour, la somme des services ; le pic au
 *     travail de l'unité (ses services réunis, créneau par créneau) et son
 *     occupation (pondérée par les personnes des équipes) ;
 *   — les lignes de cumul : pour les personnes, la moyenne par jour seule ;
 *     pour les heures, le total et la moyenne ; un seul bloc quand la période
 *     tient dans un mois ;
 *   — les jours complets se comptent d'abord ;
 *   — une seule écriture du temps : « 45 min », « 2 h 05 », « 525 h » ;
 *   — la courbe : un point par jour, la valeur de la colonne Unité ; le réel
 *     s'il est importé, pour une mesure en personnes.
 * Vols, compagnies et équipes fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PE = require('../moteur/periode.js');
const PV = require('../periode-vue.js');
const PC = require('../periode-courbe.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
/** Une période fictive : les vols de l'unité fictive chaque jour, un départ de moins un jour sur trois. */
const periode = (debut, fin) => PE.depuisSauvegarde(S.sauvegarde,
  PE.joursEntre(debut, fin).flatMap((d, i) => S.args.vols.filter(v => !(i % 3 === 1 && v.id === 'NO101')).map(v => ({ ...v, date: d }))), S.options);
const DEUX_MOIS = periode('2026-10-25', '2026-11-13').bilan, UN_MOIS = periode('2026-11-02', '2026-11-08').bilan;
const mesure = id => PV.MESURES.find(m => m.id === id);
const proche = (x, y, msg) => assert.ok(x === y || Math.abs(x - y) < 1e-9, (msg || '') + ' : ' + x + ' ≠ ' + y);
const sansParentheses = l => l.lib.replace(/\s*\(.*\)$/, '');

test('la colonne « Unité » : chaque jour, la somme des services, pour chaque mesure qui s’additionne', () => {
  const additives = PV.MESURES.filter(m => !m.jour);
  assert.ok(additives.length >= 8);
  for (const w of DEUX_MOIS.joursTravail) for (const m of additives) {
    const valeurs = Object.values(w.services).map(s => s[m.id]);
    const attendu = m.id === 'retardMax' ? (valeurs.some(v => v != null) ? Math.max(...valeurs.filter(v => v != null)) : null) : valeurs.reduce((n, v) => n + (v || 0), 0);
    proche(PV.valeurUnite(m, [w]), attendu, w.date + ' ' + m.id);
  }
});

test('le pic au travail de l’unité : ses services réunis, créneau par créneau ; l’occupation, pondérée par les personnes', () => {
  const pic = mesure('picAuTravail'), occ = mesure('occupation');
  let vus = 0;
  for (const w of DEUX_MOIS.joursTravail.filter(x => x.complet)) {
    // À la main : les créneaux de 15 min de chaque service, additionnés à la même heure.
    const parHeure = new Map();
    for (const s of Object.values(w.services)) {
      const c = s.indicateursCharge && s.indicateursCharge.creneaux && s.indicateursCharge.creneaux.auTravail;
      if (c) c.valeurs.forEach((v, i) => parHeure.set(c.debut + i * 15, (parHeure.get(c.debut + i * 15) || 0) + v));
    }
    const attendu = parHeure.size ? Math.max(...parHeure.values()) : null;
    proche(PV.valeurUnite(pic, [w]), attendu, w.date + ' pic');
    for (const s of Object.values(w.services)) if (s.indicateursCharge && s.indicateursCharge.picAuTravail)
      assert.ok(PV.valeurUnite(pic, [w]) >= s.indicateursCharge.picAuTravail.personnes - 1e-9, 'au moins le pic de chaque service');
    const eq = Object.values(w.equipes).map(e => e.indicateursCharge).filter(k => k && k.occupation !== null && k.personnes > 0);
    const o = eq.length ? eq.reduce((n, k) => n + k.occupation * k.personnes, 0) / eq.reduce((n, k) => n + k.personnes, 0) : null;
    proche(PV.valeurUnite(occ, [w]), o, w.date + ' occupation');
    vus++;
  }
  assert.ok(vus >= 10, vus + ' jours complets');
  // Sur des jours : le plus haut des pics, leur moyenne ; rien n'est ajouté au bilan.
  const complets = DEUX_MOIS.joursTravail.filter(x => x.complet), k = PE.chargeDeLUnite(complets);
  const pics = complets.map(w => PV.valeurUnite(pic, [w]));
  proche(k.picAuTravail.personnes, Math.max(...pics));
  proche(k.picAuTravailMoyen, pics.reduce((a, b) => a + b, 0) / pics.length);
  assert.ok(!('chargeDeLUnite' in DEUX_MOIS.periode) && !('unite' in DEUX_MOIS.joursTravail[0]), 'le bilan ne change pas');
});

test('les personnes : seule la moyenne par jour ; les heures : le total et la moyenne', () => {
  const moyennes = ['Moyenne par jour, octobre 2026', 'Moyenne par jour, novembre 2026', 'Moyenne par jour sur la période'];
  for (const id of ['personnes', 'besoin', 'charge', 'personnesService', 'surplusArrondi', 'picAuTravail'])
    assert.deepEqual(PV.lignesDeCumul(DEUX_MOIS, mesure(id)).map(sansParentheses), moyennes, id);
  for (const id of ['heuresSup', 'hommeMinutes'])
    assert.deepEqual(PV.lignesDeCumul(DEUX_MOIS, mesure(id)).map(sansParentheses), ['Total octobre 2026', 'Moyenne par jour, octobre 2026',
      'Total novembre 2026', 'Moyenne par jour, novembre 2026', 'Total de la période', 'Moyenne par jour sur la période'], id);
  // La moyenne des personnes : les personnes de l'unité de chaque jour complet, divisées par le nombre de ces jours.
  const complets = DEUX_MOIS.joursTravail.filter(w => w.complet), p = mesure('personnes');
  const l = PV.lignesDeCumul(DEUX_MOIS, p).find(x => /sur la période/.test(x.lib));
  proche(PV.valeurUnite(p, l.jours, l), complets.reduce((n, w) => n + w.total.personnes, 0) / complets.length);
  assert.match(l.lib, new RegExp('\\(' + complets.length + ' jours complets\\)$'), 'la moyenne dit sur combien de jours');
  // Et pour chaque service, la même moyenne.
  for (const s of DEUX_MOIS.services) {
    const n = complets.filter(w => w.services[s.id]).reduce((x, w) => x + w.services[s.id].personnes, 0) / complets.length;
    proche(PV.valeurService(p, s.id, l), n, s.id);
  }
});

test('un seul bloc de totaux quand la période tient dans un mois', () => {
  assert.deepEqual(PV.lignesDeCumul(UN_MOIS, mesure('personnes')).map(sansParentheses), ['Moyenne par jour sur la période']);
  assert.deepEqual(PV.lignesDeCumul(UN_MOIS, mesure('hommeMinutes')).map(sansParentheses), ['Total de la période', 'Moyenne par jour sur la période']);
});

test('les jours complets se comptent d’abord, les incomplets s’expliquent en une phrase', () => {
  const c = PV.comptesDesJours(DEUX_MOIS), complets = DEUX_MOIS.joursTravail.filter(w => w.complet).length, inc = DEUX_MOIS.joursTravail.length - complets;
  assert.ok(complets > 1 && inc > 1);
  assert.equal(c.texte, complets + ' jours complets, ' + inc + ' incomplets');
  assert.match(c.explication, /incomplet[\s\S]*vols[\s\S]*(totaux|moyennes)/);
  assert.equal(PV.comptesDesJours({ joursTravail: [{ complet: true }] }).texte, '1 jour complet');
  assert.equal(PV.comptesDesJours({ joursTravail: [{ complet: true }, { complet: false }] }).texte, '1 jour complet, 1 incomplet');
});

test('une seule écriture du temps : « 45 min », « 2 h 05 », un total d’heures de travail en heures entières', () => {
  assert.equal(mesure('heuresSup').ecrire(90), '1 h 30');
  assert.equal(mesure('heuresSup').ecrire(45), '45 min');
  assert.equal(mesure('hommeMinutes').ecrire(31500), '525 h');
  assert.equal(mesure('retardMax').ecrire(125), '2 h 05');
  assert.equal(mesure('retardMax').ecrire(0), '0 min');
  assert.equal(mesure('hommeMinutes').ecrire(20), '< 1 h', 'moins d’une demi-heure ne s’écrit pas « 0 h »');
  assert.equal(mesure('hommeMinutes').ecrire(0), '0 h');
  // Dans tout le tableau : jamais plus de 59 minutes, jamais d'heures décimales.
  for (const m of PV.MESURES) for (const w of DEUX_MOIS.joursTravail) for (const x of [PV.valeurUnite(m, [w]), ...Object.keys(w.services).map(s => PV.valeurService(m, s, null, w))]) {
    if (x == null) continue;
    const t = m.ecrire(x);
    for (const k of t.matchAll(/(\d+) min\b/g)) assert.ok(+k[1] < 60, m.id + ' : ' + t);
    assert.doesNotMatch(t, /\d,\d+ h\b/, m.id + ' : ' + t);
  }
});

test('la courbe : un point par jour de travail, la valeur de la colonne Unité ; le réel, pour une mesure comparable', () => {
  // Le réel (des ETP par jour) se compare aux personnes, au besoin, à la charge, aux personnes du service ; pas à un surplus
  // d'arrondi ni à un pic de 15 minutes.
  assert.deepEqual(PV.MESURES.filter(m => m.reel).map(m => m.id), ['personnes', 'besoin', 'charge', 'personnesService']);
  const p = mesure('personnes'), complets = DEUX_MOIS.joursTravail.filter(w => w.complet);
  const reel = complets.slice(0, 3).map((w, i) => ({ date: w.date, reel: 10 + i, simule: 0, ecart: 0 }));
  const pts = PC.points(DEUX_MOIS, w => PV.valeurUnite(p, [w]), p.reel ? reel : null);
  assert.deepEqual(pts.map(x => x.date), DEUX_MOIS.joursTravail.map(w => w.date));
  assert.deepEqual(pts.map(x => x.v), DEUX_MOIS.joursTravail.map(w => PV.valeurUnite(p, [w])));
  assert.deepEqual(pts.filter(x => x.reel != null).map(x => [x.date, x.reel]), reel.map(x => [x.date, x.reel]));
  const svg = PC.courbe(pts, { largeur: 960, ecrire: p.ecrire, nom: 'Personnes' });
  assert.equal((svg.match(/class="pvc-point"/g) || []).length, complets.length, 'un point plein par jour complet');
  assert.equal((svg.match(/class="pvc-point pvc-incomplet"/g) || []).length, DEUX_MOIS.joursTravail.length - complets.length, 'un point creux par jour incomplet');
  assert.match(svg, /class="pvc-reel"/);
  assert.match(svg, /role="img" aria-label="[^"]+"/);
  // Sans réel, pas de trait du réel.
  assert.doesNotMatch(PC.courbe(PC.points(DEUX_MOIS, w => PV.valeurUnite(p, [w]), null), { largeur: 960, ecrire: p.ecrire, nom: 'Personnes' }), /pvc-reel/);
  // La bulle d'un jour : sa date, la valeur, le réel s'il y en a.
  assert.match(PC.bulle(pts.find(x => x.reel != null), { ecrire: p.ecrire, nom: 'Personnes' }), /^\S+ \d\d\/\d\d : Unité \d+ · réel 1\d(,\d+)? ETP$/);
  assert.match(PC.bulle(pts.find(x => !x.complet), { ecrire: p.ecrire, nom: 'Personnes' }), /incomplet/);
  // L'échelle : chaque étiquette une fois ; toutes les valeurs à 0, un seul trait.
  const echelle = svg => [...svg.matchAll(/class="pvc-echelle"[^>]*>([^<]*)</g)].map(m => m[1]);
  const petits = DEUX_MOIS.joursTravail.map(w => ({ date: w.date, complet: w.complet, v: 1, reel: null }));
  assert.deepEqual(echelle(PC.courbe(petits, { largeur: 960, ecrire: p.ecrire, nom: 'Personnes' })), ['0', '1']);
  assert.deepEqual(echelle(PC.courbe(petits.map(x => ({ ...x, v: 0 })), { largeur: 960, ecrire: p.ecrire, nom: 'Personnes' })), ['0']);
});
