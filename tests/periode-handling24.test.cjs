/* Banc d'essai, correction 11 — une période avec un handling 24 h/24 : le
 * sale d'un avion que le handling décharge ne revient pas une seconde fois en
 * « J+1 ». Un départ de la veille ne revient en « J+1 » que si aucun handling
 * 24 h/24 ne décharge son avion (il charge sa compagnie, et le vol a une ETA ou
 * sa compagnie une escale) ; jugé d'après le vol de la veille, pas d'après les
 * identifiants du jour. Données fictives : l'unité de la référence de
 * non-régression (retours « J+1 », boucle du matériel active), son handling
 * passé en 24 h/24. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const J = require('../moteur/journee.js');
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const JOUR1 = '2026-11-02', JOUR2 = '2026-11-03';
const json = x => JSON.parse(JSON.stringify(x));
/** Le handling de l'unité fictive en 24 h/24 ; `reglages` : son escale, sa liste de compagnies… */
const en24h = reglages => ({ ...S.options, equipes: { h: { handling24h: true, ...reglages } } });
const TOUTES = en24h({ escale: { '*': 60 } });
/** Deux jours fictifs ; `renumeroter` : le jour 2, d'autres numéros de vol (fréquent en long-courrier). */
const deuxJours = ({ renumeroter = true, jour1 = v => v } = {}) => [
  ...S.args.vols.map(v => jour1({ ...v, date: JOUR1 })),
  ...S.args.vols.map(v => ({ ...v, date: JOUR2, ...(renumeroter && v.sens === 'DEP' ? { id: v.id.replace(/\d+$/, n => String(+n + 10)) } : {}) }))];
const periode = (vols, options) => PE.depuisSauvegarde(S.sauvegarde, vols, options, { detail: true });
const retoursJ1 = r => r.lots.filter(l => l.retourVol && /\(J-1\)$/.test(l.vol)).map(l => l.vol).sort();
const departsDu = (vols, d, f = () => true) => vols.filter(v => v.date === d && v.sens === 'DEP' && f(v));
/** Ce que rend l'outil d'une journée pour ses vols, avec ces options (le même chemin : argumentsDeLaJournee). */
const seule = (vols, d, options) => json(J.jouer(J.argumentsDeLaJournee(S.sauvegarde, PE.volsDuJour(vols, d), options)));

test('des numéros de vol qui changent, toutes les compagnies déchargées : aucun retour « J+1 » le jour 2, la journée de simuler-journee', () => {
  const vols = deuxJours(), p = periode(vols, TOUTES);
  const [j1, j2] = p.journees;
  assert.equal(j1.resultat.ok, true);
  // Le jour 1 : le handling décharge l'avion de chaque départ (une escale pour toutes les compagnies).
  assert.equal(j1.resultat.vols.filter(v => v.arrivee != null).length, departsDu(vols, JOUR1).length);
  assert.deepEqual(retoursJ1(j1.resultat), []);
  // Le jour 2 : aucun départ du jour 1 ne revient (avant la correction : tous, une seconde fois).
  assert.deepEqual(retoursJ1(j2.resultat), []);
  assert.ok(j2.entree.saleInitial.length > 0, 'du sale du jour 1 passe au jour 2');
  // Identique, champ par champ, à la journée seule avec le sale (et le stock propre) que le jour 1 lui laisse…
  const { volsVeille, ...sansVeille } = j2.entree;
  assert.ok(volsVeille.length > 0);
  assert.deepEqual(json(j2.resultat), seule(vols, JOUR2, PE.optionsDeRejeu(TOUTES, sansVeille)));
  // … et à ses options de rejeu (les vols de la veille compris).
  assert.deepEqual(json(j2.resultat), seule(vols, JOUR2, PE.optionsDeRejeu(TOUTES, j2.entree)));
  // Le jour 1, comme une journée seule.
  assert.deepEqual(json(j1.resultat), seule(vols, JOUR1, TOUTES));
});

test('par l’outil d’une journée : le jour 2 de la période, au champ près', () => {
  const vols = deuxJours(), p = periode(vols, TOUTES), j2 = p.journees[1];
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-c11-'));
  try {
    const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    const csv = 'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
      + PE.volsDuJour(vols, JOUR2).map(v => [v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n';
    const { volsVeille, ...sansVeille } = j2.entree;
    const f = (nom, x) => { const c = path.join(dossier, nom); fs.writeFileSync(c, x); return c; };
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'outils', 'simuler-journee.cjs'), f('sauvegarde.json', JSON.stringify(S.sauvegarde)),
      f('vols.csv', csv), f('options.json', JSON.stringify(PE.optionsDeRejeu(TOUTES, sansVeille)))], { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).resultat, json(j2.resultat));
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('une compagnie sans déchargement (sans escale ni ETA, ou hors de la liste du handling) : seuls ses départs de la veille reviennent en « J+1 »', () => {
  const vols = deuxJours();
  const attendu = departsDu(vols, JOUR1, v => v.cie === 'EST').map(v => v.id + ' (J-1)').sort();
  assert.ok(attendu.length > 0);
  // EST sans escale (et ses vols sans ETA) : ses départs du jour 1 reviennent, eux seuls.
  const sansEscale = periode(vols, en24h({ escale: { NORD: 60, SUD: 60, OUEST: 60 } }));
  assert.equal(sansEscale.journees[0].resultat.vols.filter(v => v.cie === 'EST' && v.arrivee != null).length, 0, 'EST : rien à décharger');
  assert.deepEqual(retoursJ1(sansEscale.journees[1].resultat), attendu);
  // EST hors de la liste du handling 24 h/24 (aucun handling ne la charge) : de même.
  const horsListe = periode(vols, en24h({ escale: { '*': 60 }, compagnies: ['NORD', 'SUD', 'OUEST'] }));
  assert.deepEqual(retoursJ1(horsListe.journees[1].resultat), attendu);
  // EST sans escale, mais ses vols du jour 1 avec une ETA : leurs avions sont déchargés, rien ne revient.
  const avecEta = deuxJours({ jour1: v => (v.cie === 'EST' && v.sens === 'DEP' ? { ...v, eta: v.std - 90 } : v) });
  const eta = periode(avecEta, en24h({ escale: { NORD: 60, SUD: 60, OUEST: 60 } }));
  assert.equal(eta.journees[0].resultat.vols.filter(v => v.cie === 'EST' && v.arrivee != null).length, attendu.length);
  assert.deepEqual(retoursJ1(eta.journees[1].resultat), []);
});

test('un vol qui vole les deux jours sous le même numéro : un seul déchargement par jour, aucun retour « J+1 »', () => {
  const vols = deuxJours({ renumeroter: false }), p = periode(vols, TOUTES);
  for (const j of p.journees) {
    const r = j.resultat, ids = departsDu(vols, j.date).map(v => v.id);
    for (const id of ids) assert.equal(r.vols.filter(v => v.id === id && v.arrivee != null).length, 1, j.date + ' : ' + id + ' déchargé une fois');
    assert.deepEqual(retoursJ1(r), [], j.date);
    // Chaque avion déchargé rend son sale une fois : aucun vol lavé deux fois le même jour.
    const laves = r.lots.filter(l => l.retourVol && !/\(veille\)$/.test(l.vol)).map(l => l.vol);
    assert.equal(new Set(laves).size, laves.length, j.date);
  }
});

test('non-régression : sans handling 24 h/24, rien ne change (les départs réels de la veille reviennent en « J+1 »)', () => {
  const vols = deuxJours(), p = periode(vols, S.options);
  assert.deepEqual(retoursJ1(p.journees[1].resultat), departsDu(vols, JOUR1).map(v => v.id + ' (J-1)').sort());
  assert.deepEqual(json(p.journees[1].resultat), seule(vols, JOUR2, PE.optionsDeRejeu(S.options, p.journees[1].entree)));
  // Une journée seule en 24 h/24 garde sa règle : ses propres départs déchargés ne reviennent pas en « J+1 ».
  assert.deepEqual(retoursJ1(json(J.jouer(J.argumentsDeLaJournee(S.sauvegarde, S.args.vols, TOUTES)))), []);
  const sansEscale = en24h({ escale: { NORD: 60, SUD: 60, OUEST: 60 } });
  assert.deepEqual(retoursJ1(json(J.jouer(J.argumentsDeLaJournee(S.sauvegarde, S.args.vols, sansEscale)))),
    S.args.vols.filter(v => v.sens === 'DEP' && v.cie === 'EST').map(v => v.id + ' (J-1)').sort());
});
