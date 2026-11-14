/* Évolution 15 (e) — la feuille « Réponses » du classeur de la journée
 * (echanges-reponses.js) : les cinq réponses, dans l'ordre du contrat, celles
 * du module (moteur/reponses.js), à la fin du classeur ; les autres feuilles ne
 * changent pas, ni dans la page ni dans l'outil (simuler-journee --xlsx).
 * Unité, vols et compagnies fictifs (tests/plan-rejoue-fictif.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ER = require('../echanges-reponses.js');
const EC = require('../echanges-charge.js');
const REP = require('../moteur/reponses.js');
const T = require('../tableur.js');
const F = require('./plan-rejoue-fictif.cjs');
const P = require('../moteur/production.js');
const OUTIL = require('../outils/simuler-journee.cjs');

const DATE = '2026-11-02', LE = new Date(2026, 10, 2, 10, 0);
const sv = F.sauvegardeFictive(), p = F.heureDuPicAttendue(sv, F.volsCsv()), q = F.heureDuPicAttendue(sv, F.volsSansRetardCsv());
const A = REP.reponses(p.resultat, p.args), B = REP.reponses(q.resultat, q.args);
const QUESTIONS = ['1. Combien de personnes faut-il, par service ?', '2. Où et quand ça coince ?', '3. À quelle heure chaque service finit-il, et avec combien d’heures sup ?',
  '4. Qu’est-ce qui part en retard ?', '5. Que change mon scénario ?'];
/** Les lignes d'une question : { mesure: [valeur, sujet, au-delà, détail] }. */
const lignes = (f, i) => f.lignes.slice(1).filter(l => l[0] === QUESTIONS[i]);
const col = nom => ER.TETE.indexOf(nom);
const r2 = x => (x == null ? null : Math.round(x * 100) / 100);
// « Où ça coince » se juge sur les conséquences (correction 18 a) : avec ses départs en retard, l'unité fictive coince, à
// n'importe quel seuil d'attente ; sans retard (B), rien ne coince : sa plonge laisse des vols à laver le lendemain, que
// l'équipe du matin lave pendant sa présence — un reste normal (correction 19 b ; avec l'évolution 18, elle en coinçait).
const A60 = REP.reponses(p.resultat, p.args, { seuils: { attenteLot: 60 } });

test('le classeur de la journée gagne la feuille « Réponses », à la fin ; les autres ne changent pas', () => {
  const avant = EC.journeeVersClasseur({ resultat: p.resultat, args: p.args }, { date: DATE, calculeLe: LE });
  const copie = JSON.parse(JSON.stringify(avant));
  const apres = ER.avecReponses(avant, A, { date: DATE });
  assert.deepEqual(apres.map(f => f.nom), [...avant.map(f => f.nom), 'Réponses']);
  assert.deepEqual(apres.slice(0, -1), avant, 'les autres feuilles, telles quelles');
  assert.deepEqual(JSON.parse(JSON.stringify(avant)), copie, 'le classeur d’avant n’est pas touché');
});

test('les cinq réponses, dans l’ordre du contrat, celles du module', () => {
  const f = ER.feuilleDesReponses(A, { date: DATE });
  assert.equal(f.nom, 'Réponses');
  assert.deepEqual(f.lignes[0], ER.TETE);
  assert.deepEqual([...new Set(f.lignes.slice(1).map(l => l[0]))], QUESTIONS);
  // 1. Par service : il faut, présentes, l'écart et son seuil.
  // Une ligne par service et par jour de travail (correction 17 a) : on la cherche par son service et par son jour.
  const jourDe = s => T.celluleDate(new Date(Date.UTC(2026, 10, 2 + s.jour)).toISOString().slice(0, 10)).excel;
  const duJour = (l, s) => l[col('Sujet')] === s.nom && l[col('Jour de travail')] && l[col('Jour de travail')].excel === jourDe(s);
  for (const s of A.personnes.services) {
    const d = lignes(f, 0).filter(l => duJour(l, s)), v = m => (d.find(l => l[col('Mesure')] === m) || [])[col('Valeur')];
    assert.equal(v('Il faut'), s.besoin, s.nom);
    assert.equal(v('Présentes (ETP)'), r2(s.presents), s.nom);
    assert.equal(v('Écart (présentes − il faut)'), r2(s.ecart), s.nom);
    // Un poste fixe (correction 17 c) : ni besoin, ni écart, ni seuil — le détail le dit ; ailleurs, seul un manque est au-delà du seuil.
    const e = d.find(l => l[col('Mesure')] === 'Écart (présentes − il faut)');
    assert.equal(e[col('Au-delà du seuil')], s.fixe || s.nonMesure ? null : s.signale ? 'oui' : 'non', s.nom);
    if (s.fixe) { assert.equal(v('Il faut'), null); assert.match(e[col('Détail')], /poste fixe/); }
    // Un besoin qui ne se mesure pas (correction 18 a) : ni besoin, ni écart — le détail le dit.
    if (s.nonMesure) { assert.equal(v('Il faut'), null); assert.match(e[col('Détail')], /besoin non mesuré/); }
  }
  assert.ok(A.personnes.services.some(s => s.fixe) && A.personnes.services.some(s => s.nonMesure) && A.personnes.services.some(s => !s.fixe && !s.nonMesure));
  const unite = lignes(f, 0).filter(l => l[col('Sujet')] === 'Toute l’unité'), u = m => unite.find(l => l[col('Mesure')] === m)[col('Valeur')];
  assert.equal(u('Il faut'), A.personnes.total.besoin);
  assert.equal(u('Dont postes fixes (ETP)'), r2(A.personnes.total.fixes));
  assert.equal(u('Écart (présentes hors postes fixes − il faut)'), r2(A.personnes.total.ecart));
  // Un handling à chauffeurs : la ligne des présentes dit qu'elle compte ses chauffeurs.
  const ch = A.personnes.services.find(s => s.chauffeurs);
  assert.match(lignes(f, 0).find(l => duJour(l, ch) && l[col('Mesure')] === 'Présentes (ETP)')[col('Détail')], /^ses chauffeurs/);
  // 2. Les goulots, sur les conséquences : le premier, puis ceux qui coincent aussi ; son dépassement, face au quart d'heure
  //    qui compte ; en détail, ses heures sup, ce qu'il fait partir en retard et sa cause. Le seuil d'attente n'y change rien.
  //    Sans retard ni dépassement (B) : aucun.
  const g = lignes(f, 1).find(l => l[col('Mesure')] === 'Goulot');
  assert.equal(g[col('Sujet')], A.coince.goulot.nom);
  assert.deepEqual([g[col('Valeur')], g[col('Unité')], g[col('Seuil')], g[col('Au-delà du seuil')]],
    [Math.round(A.coince.goulot.depasse), 'min', 15, A.coince.goulot.depasse >= 15 ? 'oui' : 'non'], 'son dépassement, en minutes, face au quart d’heure');
  assert.match(g[col('Détail')], /^heures sup \d+ min × personnes ; \d+ commande\(s\) ou vol\(s\) en retard par ses lots ; cause : /);
  // Un goulot qui dépasse : sa valeur est son dépassement, pas ses heures sup.
  const depasse = A.coince.goulots.findIndex(x => x.depasse >= 15);
  if (depasse >= 0) {
    const l = lignes(f, 1).filter(x => /^(Goulot|Coince aussi)$/.test(x[col('Mesure')]))[depasse];
    assert.deepEqual([l[col('Valeur')], l[col('Au-delà du seuil')]], [Math.round(A.coince.goulots[depasse].depasse), 'oui']);
  }
  assert.equal(lignes(f, 1).filter(l => l[col('Mesure')] === 'Coince aussi').length, A.coince.goulots.length - 1);
  assert.deepEqual(lignes(ER.feuilleDesReponses(A60, { date: DATE }), 1).filter(l => /^(Goulot|Coince aussi)$/.test(l[col('Mesure')])), lignes(f, 1).filter(l => /^(Goulot|Coince aussi)$/.test(l[col('Mesure')])));
  // Sans retard (B) : rien ne coince. La plonge laisse 5 vols à laver le lendemain (180 min : ils reviennent trop tard), que
  // l'équipe du matin lave pendant sa présence : un reste normal, sur sa ligne, « non » (correction 19 b). Avec l'évolution 18,
  // elle en coinçait (goulot « Plonge », 0 min) ; avant la correction 19 (a) : 6 vols (200 min), avec les 20 min d'un vol
  // arrêté au départ de l'équipe du matin, que l'après-midi reprend désormais à son arrivée.
  const fB = ER.feuilleDesReponses(B, { date: DATE }), g0 = lignes(fB, 1).find(l => l[col('Mesure')] === 'Goulot');
  assert.deepEqual([B.coince.goulots.map(x => x.service), g0[col('Sujet')], g0[col('Valeur')], g0[col('Au-delà du seuil')]], [[], 'aucun', null, 'non']);
  const reste = lignes(fB, 1).find(l => l[col('Mesure')] === 'Reste à laver le lendemain');
  assert.deepEqual([reste[col('Sujet')], reste[col('Valeur')], reste[col('Seuil')], reste[col('Au-delà du seuil')]], ['Plonge', 5, null, 'non']);
  assert.equal(reste[col('Détail')], '180 min de lavage ; un lavage arrêté compte pour sa durée restante ; l’équipe du matin (Plonge matin) le lave pendant sa présence : la plonge ne coince pas');
  // Avec ses départs en retard (A), la plonge ne coince pas non plus : 2 vols (75 min), que le matin absorbe. (Évolution 18 :
  // elle coinçait aussi, la dernière.)
  assert.deepEqual([A.coince.goulots.some(g => g.service === 'plonge'), A.plonge.lendemain], [false, { vols: 2, minutes: 75, absorbe: true }]);
  // Sans rien qui coince : la ligne le dit.
  const rien = lignes(ER.feuilleDesReponses({ ...B, coince: { ...B.coince, goulot: null, goulots: [] } }, { date: DATE }), 1).find(l => l[col('Mesure')] === 'Goulot');
  assert.deepEqual([rien[col('Sujet')], rien[col('Valeur')], rien[col('Au-delà du seuil')]], ['aucun', null, 'non']);
  // Les arrivages (les lots livrés ensemble) et les personnes sans travail, par service et jour de travail.
  for (const c of A.coince.services.filter(x => x.arrivages != null)) {
    const d = lignes(f, 1).filter(l => duJour(l, c)), v = m => (d.find(l => l[col('Mesure')] === m) || [])[col('Valeur')];
    assert.equal(v('Arrivages du jour'), c.arrivages, c.nom);
    assert.equal(v('Attente la plus longue d’un arrivage'), c.attenteMax ? Math.round(c.attenteMax.minutes) : 0, c.nom);
    assert.equal(v('Cumul d’attente des arrivages'), Math.round(c.cumul), c.nom);
  }
  const sansT = A.sansTravail.services.filter(x => x.minutes != null);
  assert.ok(sansT.length >= 5);
  for (const t of sansT) {
    const l = lignes(f, 1).find(x => duJour(x, t) && x[col('Mesure')] === 'Personnes sans travail');
    assert.equal(l[col('Valeur')], Math.round(t.minutes), t.nom);
    assert.match(l[col('Détail')], /^avant le premier lot \d+, entre deux lots \d+, après le dernier lot \d+/);
  }
  assert.ok(!f.lignes.some(l => /un lot (y )?attend|File la plus longue/.test([l[col('Mesure')], l[col('Détail')]].join(' '))), 'les mots : un arrivage attend, un lot est à faire');
  // 3. Les heures sup de chaque service.
  for (const s of A.fins.services) {
    const h = lignes(f, 2).find(l => duJour(l, s) && l[col('Mesure')] === 'Heures sup');
    assert.equal(h[col('Valeur')], Math.round(s.heuresSup.total), s.nom);
  }
  // Les heures du détail : arrondies à la minute, comme la cellule et comme la page (P.hhmm).
  for (const s of A.fins.services.filter(x => x.fin != null && x.fin >= 0 && x.fin < 1440)) {
    const l = lignes(f, 2).find(x => duJour(x, s) && x[col('Mesure')] === 'Fin du dernier lot');
    assert.equal(l[col('Détail')], P.hhmm(s.fin), s.nom);
  }
  // La cause d'une file : un texte, dans « Détail » ; « Valeur » ne porte que des nombres, des heures, ou rien.
  for (const l of f.lignes.slice(1)) assert.ok(l[col('Valeur')] == null || typeof l[col('Valeur')] === 'number' || typeof l[col('Valeur')] === 'object', l.join(' | '));
  assert.ok(!f.lignes.some(l => /à —/.test(l[col('Détail')] || '')), 'pas d’heure inconnue écrite « à — »');
  // 4. Une ligne par exception, son retard en minutes et sa cause ; chacune au-delà de son seuil.
  const ex = lignes(f, 3);
  assert.equal(ex.length, A.exceptions.length);
  assert.ok(A.exceptions.length > 2);
  ex.forEach((l, i) => {
    assert.equal(l[col('Sujet')], A.exceptions[i].id);
    assert.equal(l[col('Valeur')], Math.round(A.exceptions[i].retard));
    assert.equal(l[col('Détail')], A.exceptions[i].cause.phrase);
    assert.equal(l[col('Au-delà du seuil')], 'oui');
  });
  // 5. Sans second essai : une ligne qui dit comment en avoir un.
  assert.equal(lignes(f, 4).length, 1);
  assert.match(lignes(f, 4)[0][col('Détail')], /Comparer deux essais/);
});

test('sans exception, une ligne le dit ; avec deux essais, ce que change le scénario', () => {
  const f = ER.feuilleDesReponses(B, { date: DATE });
  assert.equal(B.exceptions.length, 0);
  assert.deepEqual(lignes(f, 3).map(l => l[col('Mesure')]), ['Aucune exception']);
  const d = REP.comparer(A, B), g = ER.feuilleDesReponses(B, { date: DATE, comparaison: d });
  const v = m => (lignes(g, 4).find(l => l[col('Mesure')] === m) || [])[col('Valeur')];
  assert.equal(v('Il faut, toute l’unité (B − A)'), d.personnes.total.besoin.d);
  assert.equal(v('Exceptions (B − A)'), d.exceptions.nombre.d);
  assert.equal(v('Exceptions réglées dans B'), d.exceptions.reglees.length);
  assert.equal(v('Exceptions nouvelles dans B'), d.exceptions.nouvelles.length);
  // Un service qui n'existe que dans B : il compte, « absent → 3 ».
  const e = JSON.parse(JSON.stringify(d));
  e.personnes.services.push({ service: 'zz', nom: 'Service fictif', besoin: { a: null, b: 3, d: null }, presents: { a: null, b: 3, d: null } });
  e.fins.services.push({ service: 'zz', nom: 'Service fictif', fin: { a: null, b: 600, d: null }, heuresSup: { a: null, b: 0, d: null } });
  const h = lignes(ER.feuilleDesReponses(B, { date: DATE, comparaison: e }), 4).filter(l => l[col('Sujet')] === 'Service fictif');
  assert.deepEqual(h.map(l => l[col('Mesure')]), ['Il faut / présentes (B − A)', 'Fin (B − A)']);
  assert.match(h[0][col('Détail')], /^il faut absent → 3 ; présentes absent → 3$/);
  assert.match(h[1][col('Détail')], /^fin absent → 10:00/);
});

test('relue par le tableur : de vraies heures, des nombres, aucune donnée hors du module', async () => {
  const f = ER.feuilleDesReponses(A, { date: DATE }), relu = await T.lireClasseur(T.ecrireClasseur([f]));
  assert.equal(relu[0].nom, 'Réponses');
  assert.equal(relu[0].lignes.length, f.lignes.length);
  const fin = f.lignes.find(l => l[0] === QUESTIONS[2] && l[col('Mesure')] === 'Fin du dernier lot' && l[col('Valeur')] != null);
  assert.ok(fin && typeof fin[col('Valeur')] === 'object', 'une heure : une vraie date Excel');
});

test('l’outil (simuler-journee --xlsx) : la même feuille, aux seuils de la sauvegarde ; les autres feuilles d’avant', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-reponses-classeur-'));
  try {
    const sauvegarde = path.join(dir, 'unite-fictive.json'), vols = path.join(dir, 'vols-fictifs.csv');
    fs.writeFileSync(sauvegarde, JSON.stringify(sv)); fs.writeFileSync(vols, F.volsCsv());
    const sortie = await OUTIL.simulerJournee(sauvegarde, vols);
    assert.equal('reponses' in sortie, false, 'le JSON de l’outil, sans --reponses, ne change pas');
    const classeur = await T.lireClasseur(OUTIL.classeurDeLaJournee(sortie, LE));
    const avant = await T.lireClasseur(T.ecrireClasseur(EC.journeeVersClasseur({ indicateurs: sortie.indicateursCharge }, {
      date: sortie.journee.date, sauvegarde: sortie.journee.sauvegarde, vols: sortie.journee.vols, calculeLe: LE, nomService: id => (sortie.args.noms || {})[id] || id })));
    assert.deepEqual(classeur.map(x => x.nom), [...avant.map(x => x.nom), 'Réponses']);
    assert.deepEqual(classeur.slice(0, -1), avant);
    const rep = REP.reponses(sortie.resultat, sortie.args, { seuils: REP.seuilsDeLaSauvegarde(sv), k: sortie.indicateursCharge });
    const attendu = await T.lireClasseur(T.ecrireClasseur([ER.feuilleDesReponses(rep, { date: sortie.journee.date || null, calculeLe: LE })]));
    assert.deepEqual(classeur[classeur.length - 1], attendu[0], 'la feuille de l’outil, celle du module');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
