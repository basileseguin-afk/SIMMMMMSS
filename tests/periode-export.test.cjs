/* Banc d'essai, évolution 10 (e) — le classeur d'une période (echanges.js,
 * `periodeVersClasseur`) : celui que la page propose dans « Exporter les
 * résultats » et que l'outil écrit avec --xlsx. Les feuilles et leurs
 * colonnes, de vraies dates Excel (la veille d'une journée de vols comprise),
 * les filtres et les volets figés, les lignes du bilan, relu par tableur.js.
 * Données fictives : l'unité de la référence de non-régression. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tableur.js');
const E = require('../echanges.js');
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const JOURS = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
const VOLS = JOURS.flatMap((d, i) => S.args.vols.filter(v => !(i === 1 && v.id === 'NO101')).map(v => ({ ...v, date: d })));
const P = PE.depuisSauvegarde(S.sauvegarde, VOLS, S.options);
const CTX = { sauvegarde: 'unite-fictive.json', vols: 'vols-dates.csv', reglages: { delaiChargement: 45, decalage: 0 }, calculeLe: new Date(2026, 9, 22, 14, 5) };
const F = E.periodeVersClasseur(P, CTX);
const feuille = nom => F.find(f => f.nom === nom);
const lignes = nom => feuille(nom).lignes.slice(1);
const col = (nom, entete) => feuille(nom).lignes[0].indexOf(entete);

test('les feuilles et leurs colonnes', () => {
  assert.deepEqual(F.map(f => f.nom), ['Lisez-moi', 'Période', 'Équipes', 'Compagnies', 'Lots', 'Vols', 'Plonge', 'Jours']);
  assert.deepEqual(feuille('Période').lignes[0], ['Ligne', 'Jour de travail', 'Jour', 'Mois', 'Complet', 'Vols manquants', 'Jours complets', 'Service',
    'Personnes', 'Besoin exact (pers.)', 'Homme-minutes', 'Heures sup (min × pers.)', 'Renforts prêtés (min)', 'Renforts reçus (min)', 'Lots', 'Lots en retard',
    'Commandes en retard', 'Retard max (min)', 'Vols chargés', 'Vols en retard', 'Chauffeurs camion', 'Chauffeurs VL', 'Borne basse chauffeurs',
    'Heures sup chauffeurs (min)', 'Vols lavés', 'Encadrement']);
  assert.deepEqual(feuille('Équipes').lignes[0], ['Jour de travail', 'Journée de vols', 'Jour complet', 'Service', 'Équipe', 'Type', 'Effectif', 'Personnes',
    'Homme-minutes', 'Besoin exact (pers.)', 'Début de poste', 'Fin de présence', 'Fin du travail', 'Travail (min)', 'Attente (min)', 'Pauses (min)',
    'Heures sup (min × pers.)', 'Renforts prêtés (min)', 'Renforts reçus (min)', 'Lots', 'Lots en retard', 'Commandes en retard', 'Retard max (min)']);
  assert.deepEqual(feuille('Compagnies').lignes[0], ['Jour de travail', 'Jour complet', 'Service', 'Compagnie', 'Commandes', 'Vols', 'Passagers', 'Homme-minutes', 'Retard max (min)']);
  assert.deepEqual(feuille('Lots').lignes[0], ['Journée de vols', 'Jour de travail', 'Service', 'Équipe', 'Commande', 'Début', 'Fin', 'Durée (min)', 'Attente (min)',
    'Homme-minutes', 'Échéance', 'Marge (min)']);
  assert.deepEqual(feuille('Vols').lignes[0], ['Journée de vols', 'Vol', 'Compagnie', 'Équipe', 'Départ', 'Commandes prêtes', 'Arrivée de l’avion',
    'Début du déchargement', 'Fin du déchargement', 'Début du chargement', 'Fin du chargement', 'Véhicule', 'Tournée', 'Limite', 'Retard (min)', 'À l’heure', 'Cause']);
  assert.deepEqual(feuille('Plonge').lignes[0], ['Journée de vols', 'Vol', 'Compagnie', 'Arrivée du sale', 'Équipe', 'Tunnel', 'Début', 'Fin', 'Attente (min)']);
  assert.deepEqual(feuille('Jours').lignes[0], ['Journée de vols', 'Jour', 'Départs', 'Retours', 'Calcul abouti', 'Anomalies', 'Commandes', 'Commandes à l’heure',
    'Commandes en retard', 'Commandes pas finies', 'Retard max (min)', 'Vols suivis', 'Vols chargés', 'Vols à l’heure', 'Retard vol max (min)', 'Homme-minutes',
    'Sale de la veille (u)', 'Sale restant le soir (u)', 'Stock propre initial (u)', 'Stock propre le soir (u)', 'Plonge de nuit', 'Chauffeurs camion',
    'Chauffeurs VL', 'Borne basse chauffeurs', 'Heures sup chauffeurs (min)']);
  // Chaque feuille de données : des filtres sur sa ligne d'en-tête, ses premières colonnes figées.
  for (const f of F.slice(1)) assert.ok(f.filtres && f.figerColonnes >= 1, f.nom);
});

test('le Lisez-moi : la période, la sauvegarde, les réglages, la date du calcul, les définitions, l’avertissement', () => {
  const t = feuille('Lisez-moi').lignes.map(l => l[0]).join('\n');
  assert.match(t, /^Période simulée du 30\/10\/2026 au 02\/11\/2026/);
  assert.match(t, /Période : 4 journées de vols, du 30\/10\/2026 au 02\/11\/2026 ; jours sans aucun vol : aucun\./);
  assert.match(t, /Jours de travail incomplets \(montrés, hors des totaux et des moyennes\) : 29\/10\/2026, 02\/11\/2026\./);
  assert.match(t, /Sauvegarde : unite-fictive\.json ; programme de vols : vols-dates\.csv\./);
  assert.match(t, /Réglages : délai de chargement 45 min, décalage des horaires 0 min\./);
  assert.match(t, /Calculée le 22\/10\/2026 à 14:05\./);
  assert.match(t, /Jour de travail : le jour où l’équipe travaille, le jour des vols \+ son jour/);
  assert.match(t, /Besoin exact \(pers\.\) : homme-minutes ÷ poste ÷ rendement/);
  assert.match(t, /PROTOTYPE — barème non calibré/);
});

test('de vraies dates Excel : le jour, et le jour et l’heure, la veille comprise', () => {
  const D = '2026-10-31', veille = '2026-10-30';
  // La cuisine à J−1 (« cu1 », jour −1) des vols du 31 travaille le 30, à partir de 20:00 la veille des vols (−240 min).
  const cu1 = P.journees[1].extrait.equipes.find(e => e.id === 'cu1');
  assert.deepEqual([cu1.jour, cu1.debutPoste], [-1, -240]);
  const l = lignes('Équipes').find(x => x[col('Équipes', 'Équipe')] === cu1.nom && x[col('Équipes', 'Journée de vols')].excel === T.dateExcel(D));
  assert.deepEqual(l[col('Équipes', 'Jour de travail')], { excel: T.dateExcel(veille), format: 'date' });
  assert.deepEqual(l[col('Équipes', 'Début de poste')], { excel: T.dateExcel(veille, 20 * 60), format: 'dateHeure' });
  assert.equal(T.dateExcel(veille, 20 * 60), T.dateExcel(D, -240));
  assert.equal(T.dateExcel('2026-10-30'), 46325, 'des jours depuis le 30/12/1899');
  // Un départ : le jour et l'heure de son vol.
  const v = lignes('Vols').find(x => x[1] === 'NO101' && x[0].excel === T.dateExcel('2026-10-30'));
  assert.deepEqual(v[col('Vols', 'Départ')], { excel: T.dateExcel('2026-10-30', 370), format: 'dateHeure' });
  // Chaque lot porte sa journée de vols et son jour de travail ; ses heures sont celles de sa journée de vols.
  const lot = lignes('Lots').find(x => x[3] === cu1.nom && x[0].excel === T.dateExcel(D));
  assert.equal(lot[1].excel, T.dateExcel(veille));
  assert.ok(lot[5].excel < T.dateExcel(D), 'commencé la veille des vols');
});

test('les lignes : celles du bilan et de chaque journée', () => {
  const b = P.bilan, ip = col('Période', 'Personnes'), is = col('Période', 'Service');
  const unite = lignes('Période').filter(x => x[is] === 'Toute l’unité');
  const jours = unite.filter(x => x[0] === 'jour');
  assert.deepEqual(jours.map(x => x[1].excel), b.joursTravail.map(w => T.dateExcel(w.date)));
  assert.deepEqual(jours.map(x => x[ip]), b.joursTravail.map(w => w.total.personnes));
  assert.deepEqual(jours.map(x => x[col('Période', 'Complet')]), b.joursTravail.map(w => (w.complet ? 'oui' : 'non')));
  assert.equal(jours.find(x => x[4] === 'non' && x[1].excel === T.dateExcel('2026-10-29'))[col('Période', 'Vols manquants')], '29/10/2026');
  // Par mois (octobre, novembre), puis sur la période : le total, puis la moyenne par jour, sur les jours complets.
  assert.deepEqual(unite.filter(x => x[0] !== 'jour').map(x => [x[0], x[3], x[6]]), [
    ['total du mois', '2026-10', b.mois[0].jours], ['moyenne par jour du mois', '2026-10', b.mois[0].jours],
    ['total du mois', '2026-11', b.mois[1].jours], ['moyenne par jour du mois', '2026-11', b.mois[1].jours],
    ['total de la période', null, b.periode.jours], ['moyenne par jour de la période', null, b.periode.jours]]);
  const derniere = (ligne) => unite.find(x => x[0] === ligne);
  assert.equal(derniere('total de la période')[ip], b.periode.total.personnes);
  assert.equal(derniere('moyenne par jour de la période')[ip], Math.round(b.periode.moyenne.personnes * 100) / 100);
  assert.equal(derniere('total de la période')[col('Période', 'Homme-minutes')], Math.round(b.periode.total.hommeMinutes * 100) / 100);
  // Service par service, un jour : ses mesures.
  const w = b.joursTravail.find(x => x.date === '2026-10-31');
  for (const [id, m] of Object.entries(w.services)) {
    const nom = b.services.find(s => s.id === id).nom;
    const x = lignes('Période').find(l => l[0] === 'jour' && l[1].excel === T.dateExcel(w.date) && l[is] === nom);
    assert.deepEqual([x[ip], x[col('Période', 'Lots')], x[col('Période', 'Heures sup (min × pers.)')]], [m.personnes, m.lots, Math.round(m.heuresSup * 100) / 100], nom);
  }
  // Une ligne par équipe et par journée, par compagnie d'un jour de travail, par lot, par vol, par vol lavé, par journée.
  const somme = f => P.journees.reduce((n, j) => n + f(j.extrait), 0);
  assert.equal(lignes('Équipes').length, somme(x => x.equipes.length));
  assert.equal(lignes('Compagnies').length, b.joursTravail.reduce((n, w) => n + Object.values(w.services).reduce((k, s) => k + Object.keys(s.compagnies || {}).length, 0), 0));
  assert.equal(lignes('Lots').length, somme(x => x.lots.length));
  assert.equal(lignes('Vols').length, somme(x => x.vols.length));
  assert.equal(lignes('Plonge').length, somme(x => x.plonge.length));
  assert.ok(lignes('Plonge').length > 0 && lignes('Compagnies').length > 0);
  assert.deepEqual(lignes('Jours').map(x => [x[0].excel, x[1], x[2], x[3]]), P.journees.map(j => [T.dateExcel(j.date), ['ven.', 'sam.', 'dim.', 'lun.'][P.journees.indexOf(j)], j.departs, j.retours]));
  assert.deepEqual(lignes('Jours').map(x => x[col('Jours', 'Sale restant le soir (u)')]), P.journees.map(j => j.extrait.saleFinal));
  assert.deepEqual(lignes('Jours').map(x => x[col('Jours', 'Sale de la veille (u)')]).slice(1), P.journees.slice(0, -1).map(j => j.extrait.saleFinal), 'le sale passe au lendemain');
  // Homme-minutes des équipes = celles du bilan, sur la période.
  const hm = lignes('Équipes').reduce((n, x) => n + x[col('Équipes', 'Homme-minutes')], 0);
  assert.ok(Math.abs(hm - b.joursTravail.reduce((n, w) => n + w.total.hommeMinutes, 0)) < 0.01 * lignes('Équipes').length);
});

test('relu par tableur.js : les mêmes feuilles, les dates en nombres de jours ; filtres et volets figés ; déterministe', async () => {
  const octets = T.ecrireClasseur(F);
  const relu = await T.lireClasseur(octets);
  assert.deepEqual(relu.map(f => f.nom), F.map(f => f.nom));
  const net = l => { const x = l.map(c => (c == null || c === '' ? null : c && typeof c === 'object' && 'excel' in c ? c.excel : c)); while (x.length && x[x.length - 1] == null) x.pop(); return x; };
  for (const f of F) {
    const r = relu.find(x => x.nom === f.nom).lignes.map(net).filter(l => l.length);
    assert.deepEqual(r, f.lignes.map(net).filter(l => l.length), f.nom);
  }
  // L'archive n'est pas compressée : les filtres et les volets se lisent dans ses feuilles.
  const xml = Buffer.from(octets).toString('utf8');
  const nb = F.length - 1;
  assert.equal((xml.match(/<autoFilter ref="A1:[A-Z]+\d+"\/>/g) || []).length, nb);
  assert.equal((xml.match(/<pane xSplit="\d" ySplit="1"[^>]*state="frozen"\/>/g) || []).length, nb);
  assert.match(xml, /<numFmt numFmtId="165" formatCode="dd\/mm\/yyyy hh:mm"\/>/);
  assert.deepEqual(T.ecrireClasseur(E.periodeVersClasseur(P, CTX)), octets, 'les mêmes données, le même fichier');
});

test('deux mois fictifs de 50 vols par jour : le classeur s’écrit en quelques secondes au plus', () => {
  const J = require('../moteur/journee.js');
  const cies = ['NORD', 'SUD', 'EST', 'OUEST'], v = S.args.vols;
  const gros = PE.joursEntre('2026-09-01', '2026-10-31').flatMap(d => Array.from({ length: 50 }, (_, i) => ({ ...v[i % v.length], id: 'X' + i, cie: cies[i % 4],
    std: v[i % v.length].std == null ? null : 300 + (i * 19) % 1000, date: d })));
  const p = PE.simulerPeriode(J.uniteDeLaSauvegarde(S.sauvegarde, S.options), gros, { delaiChargement: 45 });
  const t0 = Date.now();
  const f = E.periodeVersClasseur(p, CTX), octets = T.ecrireClasseur(f);
  const ms = Date.now() - t0;
  assert.equal(f.find(x => x.nom === 'Jours').lignes.length, 62);
  assert.ok(ms < 5000, ms + ' ms');
  assert.ok(octets.length < 30e6, octets.length + ' octets');
});
