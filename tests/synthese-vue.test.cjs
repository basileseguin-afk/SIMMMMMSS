/* Évolution 15 (b) — la Synthèse, sans navigateur (synthese-vue.js) : les deux
 * phrases en tête ; le tableau « Les services » dans l'ordre du chemin, une
 * ligne par service et jour de travail, ses tons (seulement au-delà d'un seuil,
 * jamais le rouge) ; la courbe de la journée (les créneaux de l'unité, les
 * départs) ; les trois cartes, celle de l'essai seulement avec deux essais.
 * Rien n'est calculé ici : on lit les réponses. Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const R = require('../moteur/reponses.js');
const SV = require('../synthese-vue.js');
const F = require('./plan-rejoue-fictif.cjs');

const h = s => P.minutes(s);
const fictive = (csv = F.volsCsv()) => { const p = F.heureDuPicAttendue(F.sauvegardeFictive(), csv); return { ...p, rep: R.reponses(p.resultat, p.args, { k: p.k }) }; };

test('en tête, deux phrases : combien de personnes ; où ça coince et ce qui part en retard', () => {
  const rep = (goulot, exceptions) => ({ personnes: { total: { besoin: 42, presents: 45, ecart: 3 } }, coince: { goulot }, exceptions });
  assert.deepEqual(SV.phrases(rep({ nom: 'Montage', de: h('14:00'), a: h('16:30') }, [])),
    ['Il faut 42 personnes, 45 sont présentes.', 'Montage coince de 14:00 à 16:30 ; rien ne part en retard.']);
  const ex = [{ type: 'vol-en-retard', id: 'NO1' }, { type: 'commande-en-retard', id: 'NORD/YC' }, { type: 'sans-equipe', id: 'NO1' }, { type: 'vol-pas-charge', id: 'SU2' }];
  assert.deepEqual(SV.phrases(rep(null, ex))[1], 'Rien ne coince ; 2 vols et 1 commande partent en retard.', 'un vol compté une fois');
  assert.deepEqual(SV.phrases(rep(null, [ex[1]]))[1], 'Rien ne coince ; 1 commande part en retard.');
  assert.deepEqual(SV.phrases({ personnes: { total: { besoin: 1, presents: 1.5 } }, coince: { goulot: null }, exceptions: [] })[0], 'Il faut 1 personne, 1,5 est présente.');
  assert.deepEqual(SV.phrases({ personnes: { total: { besoin: 1, presents: 2 } }, coince: { goulot: null }, exceptions: [] })[0], 'Il faut 1 personne, 2 sont présentes.');
});

test('« Les services » : dans l’ordre du chemin, une ligne par service et jour ; la file, la fin et les heures sup une fois par service', () => {
  const { resultat: r, rep } = fictive(), ordre = require('../planning-vue.js').ordreDesServices(r);
  const l = SV.lignes(rep, ordre), rang = id => ordre.indexOf(id);
  for (let i = 1; i < l.length; i++) assert.ok(rang(l[i - 1].service) <= rang(l[i].service), 'de l’amont vers l’aval');
  // Un service sans personne ni besoin ni travail ne s'affiche pas (l'équipe à 0 personne de l'unité fictive).
  assert.ok(!l.some(x => x.presents === 0 && x.besoin === 0 && !(x.fin && x.fin.fin != null)));
  // Chaque ligne porte les chiffres du module, tels quels.
  for (const x of l) {
    const s = rep.personnes.services.find(y => y.service === x.service && y.jour === x.jour);
    assert.deepEqual([x.besoin, x.presents, x.ecart], [s.besoin, s.presents, s.ecart], x.service);
    if (x.premiere) assert.equal(x.fin, rep.fins.services.find(y => y.service === x.service));
  }
  // Un service à deux jours de travail : deux lignes, la première porte la hauteur.
  const deux = { ...rep, personnes: { ...rep.personnes, services: [{ ...rep.personnes.services[0], service: 'x', jour: -1 }, { ...rep.personnes.services[0], service: 'x', jour: 0 }] } };
  assert.deepEqual(SV.lignes(deux, ['x']).map(y => [y.jour, y.premiere, y.rang]), [[-1, true, 2], [0, false, 0]]);
});

test('les tons : seulement au-delà du seuil, et jamais le rouge (il est aux retards)', () => {
  const S = R.SEUILS_DEFAUT, l = x => ({ signale: false, occupation: 0.5, coince: { attenteMax: { minutes: 30 } }, ...x });
  assert.deepEqual(SV.tons(l(), S), { ecart: null, attente: null, occupation: null });
  assert.deepEqual(SV.tons(l({ signale: true, occupation: 0.96, coince: { attenteMax: { minutes: 61 } } }), S), { ecart: 'attente', attente: 'attente', occupation: 'attente' });
  assert.deepEqual(SV.tons(l({ occupation: 0.95, coince: { attenteMax: { minutes: 60 } } }), S), { ecart: null, attente: null, occupation: null }, 'au seuil : rien');
  const { rep } = fictive();
  assert.doesNotMatch(SV.tableau(rep, []), /data-ton="retard"/);
});

test('la courbe : les créneaux de l’unité (tous ses services, à leur jour), les départs des vols', () => {
  const { resultat: r, k } = fictive(), c = SV.creneauxDeLUnite(k), somme = (x, m) => (x[m] ? x[m].valeurs.reduce((n, v) => n + v, 0) : 0);
  for (const m of ['presents', 'auTravail', 'enFile']) assert.ok(Math.abs(somme(c, m) - k.services.reduce((n, s) => n + somme(s.creneaux, m), 0)) < 1e-6, m);
  const vols = SV.departs(r);
  assert.equal(vols.length, new Set(r.classes.flatMap(x => x.vols.map(v => v.id))).size);
  const svg = SV.courbe(r, k, 1000);
  assert.match(svg, /role="img" aria-label="La journée de l’unité : \d+ présents au plus/);
  assert.equal((svg.match(/class="sy-depart"/g) || []).length, vols.length, 'un repère par départ');
  assert.match(SV.bulle(r, k, h('06:50')), /^06:45–07:00 : \d+ présents?, [\d,]+ au travail, \d+ lots? en file ; départ : ES301$/);
});

test('les cartes : rien ne coince, rien ne part en retard ; et l’essai seulement avec deux essais', () => {
  const sans = fictive(F.volsSansRetardCsv());
  const r1 = SV.carteRetard(sans.rep, sans.resultat.indicateurs);
  assert.equal(r1.ton, 'ok'); assert.match(r1.corps, /Rien\./);
  assert.match(r1.corps, /Commandes prêtes à l’heure<\/dt><dd>\d+ sur \d+/);
  const libre = SV.carteCoince({ ...sans.rep, coince: { ...sans.rep.coince, goulot: null } });
  assert.equal(libre.ton, 'ok'); assert.match(libre.corps, /Rien ne coince\./);
  const avec = fictive(), r2 = SV.carteRetard(avec.rep, avec.resultat.indicateurs);
  assert.equal(r2.ton, 'retard'); assert.match(r2.corps, /Et \d+ autres\./);
  assert.equal(SV.carteCoince(avec.rep).ton, 'attente');
  assert.equal(SV.carteEssai(null), null); assert.equal(SV.carteEssai({ A: avec.rep, B: null }), null);
  const e = SV.carteEssai({ A: avec.rep, B: sans.rep });
  assert.match(e.corps, /En retard : \d+ → <b>0<\/b>/); assert.equal(e.page, 'j-comparer');
});
