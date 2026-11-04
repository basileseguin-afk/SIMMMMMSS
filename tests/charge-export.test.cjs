/* Banc d'essai, évolution 12 (d) — les indicateurs de charge dans les
 * classeurs et dans le JSON des outils (echanges-charge.js, outils/
 * simuler-journee.cjs, outils/simuler-periode.cjs ; docs/BANC_ESSAI.md § 13,
 * docs/FORMATS_EXCEL.md § 6). Le classeur de la journée : Lisez-moi, Charge
 * (jour × équipe), Créneaux (jour × service × créneau), des heures en vraies
 * dates Excel ; celui de la période : ces deux feuilles après « Équipes ».
 * Sans indicateurs, le classeur de la période d'avant, tel quel. Unité, vols
 * et équipes fictifs (la référence de non-régression). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const J = require('../moteur/journee.js');
const I = require('../moteur/indicateurs.js');
const PE = require('../moteur/periode.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const EC = require('../echanges-charge.js');

const S = require('./non-regression.attendu.json').scenarios.find(s => s.nom === 'unite-vol');
const json = x => JSON.parse(JSON.stringify(x));
const DATE = '2026-11-03';
const veille = d => PE.jourDecale(d, -1);
const args = J.argumentsDeLaJournee(S.sauvegarde, S.args.vols, S.options), r = J.jouer(args), K = I.journee(r, args);
const LE = new Date(2026, 10, 3, 12, 30);
const JOURNEE = EC.journeeVersClasseur({ resultat: r, args }, { date: DATE, calculeLe: LE, sauvegarde: 'unite-fictive.json', vols: 'vols-fictifs.csv' });
const feuille = (c, nom) => c.find(f => f.nom === nom);
const col = (f, nom) => { const i = f.lignes[0].indexOf(nom); assert.ok(i >= 0, nom); return i; };
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const dates = PE.joursEntre('2026-11-02', '2026-11-05');
const VOLS = dates.flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));

test('le classeur de la journée : Lisez-moi, Charge (une ligne par équipe), Créneaux ; des dates Excel', () => {
  assert.deepEqual(JOURNEE.map(f => f.nom), ['Lisez-moi', 'Charge', 'Créneaux']);
  const c = feuille(JOURNEE, 'Charge');
  assert.deepEqual(c.lignes[0], EC.TETE_CHARGE);
  assert.equal(c.lignes.length, K.equipes.length + 1);
  const ligne = nom => c.lignes.find(l => l[col(c, 'Équipe')] === nom);
  // Le montage : ses indicateurs, en pourcents à un dixième près ; son jour de travail, celui des vols.
  const mo = K.equipes.find(e => e.id === 'mo'), lmo = ligne(mo.nom);
  assert.equal(lmo[col(c, 'Occupation (%)')], Math.round(mo.occupation * 1000) / 10);
  assert.equal(lmo[col(c, 'Consommé sur disponible (%)')], Math.round(mo.consommeSurDisponible * 1000) / 10);
  assert.equal(lmo[col(c, 'Débit (unités/h)')], Math.round(mo.debit * 100) / 100);
  assert.equal(lmo[col(c, 'Service')], args.noms.prepa, 'le nom du service, pas son code');
  assert.deepEqual(lmo[col(c, 'Jour de travail')], T.celluleDate(DATE));
  // La cuisine à J−1 : son jour de travail est la veille ; sa file la plus longue, une date et une heure.
  const cu = K.equipes.find(e => e.id === 'cu1'), lcu = ligne(cu.nom);
  assert.deepEqual([lcu[col(c, 'Jour de travail')], lcu[col(c, 'Journée de vols')]], [T.celluleDate(veille(DATE)), T.celluleDate(DATE)]);
  assert.deepEqual(lcu[col(c, 'File la plus longue à')], T.celluleDate(DATE, cu.fileMax.a));
  assert.ok(cu.fileMax.a < 0 && lcu[col(c, 'File la plus longue à')].excel < T.dateExcel(DATE), 'la veille, en vraie date');
  // Sans objet : la case vide, la raison dans sa colonne.
  const lh = ligne(K.equipes.find(e => e.id === 'h').nom);
  assert.equal(lh[col(c, 'Occupation (%)')], null);
  assert.match(lh[col(c, 'Sans objet')], /occupation.*: handling/);
});

test('la feuille Créneaux : un créneau par ligne, sur l’horloge du jour de travail ; la somme, celle des créneaux', () => {
  const f = feuille(JOURNEE, 'Créneaux');
  assert.deepEqual(f.lignes[0], EC.TETE_CRENEAUX);
  const corps = f.lignes.slice(1), nomPrepa = args.noms.prepa;
  for (const s of K.services) {
    const w = PE.jourDecale(DATE, s.jour), nom = args.noms[s.service] || s.service;
    const ls = corps.filter(l => l[0].excel === T.dateExcel(w) && l[1] === nom);
    if (!s.creneaux.presents && !s.creneaux.auTravail && !s.creneaux.termines) continue;
    for (const m of ['presents', 'auTravail', 'termines']) {
      if (!s.creneaux[m]) { assert.ok(ls.every(l => l[3 + I.MESURES.indexOf(m)] === null), s.service + ' ' + m + ' : sans objet, vide'); continue; }
      const total = s.creneaux[m].valeurs.reduce((n, x) => n + x, 0), lu = ls.reduce((n, l) => n + l[3 + I.MESURES.indexOf(m)], 0);
      assert.ok(Math.abs(total - lu) < 0.01 * Math.max(1, ls.length), s.service + ' ' + m + ' : ' + lu + ' attendu ' + total);
    }
    // Chaque créneau : le jour de travail + son heure, en vraie date Excel.
    for (const l of ls) {
      const i = Math.round((l[2].excel - T.dateExcel(w)) * 1440 - s.creneaux.debut) / I.PAS;
      assert.ok(Number.isInteger(i) && i >= 0, s.service + ' : ' + l[2].excel);
    }
  }
  // Un créneau où rien ne se passe n'a pas de ligne ; le montage a ses lignes, le jour même.
  assert.ok(corps.every(l => l.slice(3).some(x => x)));
  assert.ok(corps.some(l => l[1] === nomPrepa && l[2].format === 'dateHeure'));
});

test('relu par tableur.js : les mêmes feuilles, les dates en nombres de jours ; déterministe', async () => {
  const octets = T.ecrireClasseur(JOURNEE), relu = await T.lireClasseur(octets);
  assert.deepEqual(relu.map(f => f.nom), JOURNEE.map(f => f.nom));
  const net = l => { const x = l.map(c => (c == null || c === '' ? null : c && typeof c === 'object' && 'excel' in c ? c.excel : c)); while (x.length && x[x.length - 1] == null) x.pop(); return x; };
  for (const f of JOURNEE.slice(1)) assert.deepEqual(relu.find(x => x.nom === f.nom).lignes.map(net).filter(l => l.length), f.lignes.map(net).filter(l => l.length), f.nom);
  assert.deepEqual(T.ecrireClasseur(EC.journeeVersClasseur({ resultat: r, args }, { date: DATE, calculeLe: LE, sauvegarde: 'unite-fictive.json', vols: 'vols-fictifs.csv' })), octets);
  // Sans date (une journée non datée) : la date du calcul, et le Lisez-moi le dit.
  const sans = EC.journeeVersClasseur({ indicateurs: K }, { calculeLe: LE });
  assert.match(sans[0].lignes.map(l => l[0]).join('\n'), /Journée sans date : ses jours et ses heures portent la date du calcul \(03\/11\/2026\)/);
});

test('la période : Charge et Créneaux après Équipes, le Lisez-moi les dit ; sans indicateurs, le classeur d’avant', () => {
  const p = PE.depuisSauvegarde(S.sauvegarde, VOLS, S.options, { detail: true });
  const x = { periode: p.periode, bilan: p.bilan, journees: p.journees }, ctx = { calculeLe: LE };
  const avant = E.periodeVersClasseur(x, ctx), c = EC.avecCharge(avant, x);
  assert.deepEqual(c.map(f => f.nom), ['Lisez-moi', 'Période', 'Équipes', 'Charge', 'Créneaux', 'Compagnies', 'Lots', 'Vols', 'Plonge', 'Jours']);
  // Les autres feuilles ne changent pas.
  for (const f of avant.filter(f => f.nom !== 'Lisez-moi')) assert.deepEqual(feuille(c, f.nom), f, f.nom);
  const lisez = feuille(c, 'Lisez-moi').lignes.map(l => l[0]).join('\n');
  assert.match(lisez, /Équipes — [^\n]*\n\s+Charge — [^\n]*\n\s+Créneaux — /);
  assert.match(lisez, /Disponible = personnes × \(présence − pauses vraiment prises\) \+ heures sup\. Occupation = minutes au travail ÷ disponible/);
  assert.match(lisez, /En appui ou à disposition : les équipes d’appui/);
  // Charge : chaque équipe de chaque journée de vols, au jour des vols + son jour ; « Jour complet » comme le bilan.
  const ch = feuille(c, 'Charge');
  assert.equal(ch.lignes.length - 1, p.journees.reduce((n, j) => n + j.extrait.equipes.length, 0));
  const complet = new Map(p.bilan.joursTravail.map(w => [T.dateExcel(w.date), w.complet ? 'oui' : 'non']));
  assert.ok(ch.lignes.slice(1).every(l => complet.get(l[0].excel) === l[col(ch, 'Jour complet')]));
  // Créneaux : un jour de travail, un service : les créneaux réunis du bilan (J−1 et J), au total près.
  const cr = feuille(c, 'Créneaux'), w = p.bilan.joursTravail.find(y => y.complet), s = w.services.prepa.indicateursCharge.creneaux;
  const ls = cr.lignes.slice(1).filter(l => l[0].excel === T.dateExcel(w.date) && l[2] === p.bilan.services.find(y => y.id === 'prepa').nom);
  proche(Math.round(ls.reduce((n, l) => n + l[col(cr, 'Au travail')], 0) * 100) / 100, Math.round(s.auTravail.valeurs.reduce((n, v) => n + v, 0) * 100) / 100, 'au travail');
  // La cuisine (à J−1 des vols du lendemain) : ses créneaux sur l'horloge de son jour de travail, le premier à son début.
  const cu = w.services.cuisine.indicateursCharge.creneaux, nomCu = p.bilan.services.find(y => y.id === 'cuisine').nom;
  const premiere = cr.lignes.slice(1).find(l => l[0].excel === T.dateExcel(w.date) && l[2] === nomCu);
  const i0 = I.MESURES.map(m => cu[m]).find(Boolean).valeurs.findIndex((_, i) => I.MESURES.some(m => cu[m] && cu[m].valeurs[i]));
  assert.deepEqual(premiere[col(cr, 'Créneau')], T.celluleDate(w.date, cu.debut + i0 * I.PAS));
  // Une période d'avant (des extraits sans indicateurs) : le même classeur, objet pour objet.
  const vieux = { ...x, journees: x.journees.map(j => ({ ...j, extrait: { ...j.extrait, indicateursCharge: undefined } })) };
  assert.equal(EC.avecCharge(avant, vieux), avant);
});

test('les outils : le JSON porte les indicateurs ; --xlsx écrit les classeurs ; le résultat reste celui d’avant', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-charge-export-'));
  try {
    const sv = path.join(dossier, 'sauvegarde.json'), vols = path.join(dossier, 'vols.xlsx'), opt = path.join(dossier, 'options.json');
    fs.writeFileSync(sv, JSON.stringify(S.sauvegarde)); fs.writeFileSync(opt, JSON.stringify(S.options));
    fs.writeFileSync(vols, T.ecrireClasseur(E.volsVersClasseur(S.args.vols)));
    const outilJ = path.join(__dirname, '..', 'outils', 'simuler-journee.cjs'), xj = path.join(dossier, 'charge.xlsx');
    const sortie = JSON.parse(execFileSync(process.execPath, [outilJ, '--xlsx', xj, sv, vols, opt], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.deepStrictEqual(sortie.resultat, json(r), 'le résultat, champ par champ');
    assert.deepStrictEqual(sortie.indicateursCharge, json(K), 'les indicateurs : ceux de moteur/indicateurs.js');
    assert.deepEqual(Object.keys(sortie), ['journee', 'resultat', 'indicateursCharge']);
    const relu = await T.lireClasseur(fs.readFileSync(xj));
    assert.deepEqual(relu.map(f => f.nom), ['Lisez-moi', 'Charge', 'Créneaux']);
    assert.equal(relu[1].lignes.length, K.equipes.length + 1);
    for (const faux of [['--xlsx', path.join(dossier, 'x.csv'), sv, vols], ['--xlsx'], ['--arguments', '--xlsx', xj, sv, vols]]) {
      const u = spawnSync(process.execPath, [outilJ, ...faux], { encoding: 'utf8' });
      assert.equal(u.status, 2, faux.join(' ')); assert.match(u.stderr, /Usage/);
    }
    // La période : le classeur a ses deux feuilles ; chaque journée de vols, ses indicateurs.
    const datees = path.join(dossier, 'vols-dates.csv');
    const hh = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    fs.writeFileSync(datees, 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n' + VOLS.map(v => [v.date, v.id, v.cie, v.avion, v.sens,
      v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(',')).join('\n') + '\n');
    const outilP = path.join(__dirname, '..', 'outils', 'simuler-periode.cjs'), xp = path.join(dossier, 'periode.xlsx');
    const per = JSON.parse(execFileSync(process.execPath, [outilP, '--xlsx', xp, sv, datees, opt], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.ok(per.journees.every(j => j.indicateursCharge && j.indicateursCharge.equipes.length > 0));
    assert.ok(per.bilan.periode.indicateursCharge.services.prepa.jours > 0);
    const rp = await T.lireClasseur(fs.readFileSync(xp));
    assert.deepEqual(rp.map(f => f.nom), ['Lisez-moi', 'Période', 'Équipes', 'Charge', 'Créneaux', 'Compagnies', 'Lots', 'Vols', 'Plonge', 'Jours']);
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});
