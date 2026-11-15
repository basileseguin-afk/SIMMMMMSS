/* Évolution 16 (f) — les cinq réponses, à côté de la scène (v1), sans navigateur.
 * Le panneau de la vue en direct répond aux cinq questions de l'évolution 15,
 * dans leur ordre : les personnes par service à l'heure rejouée ; où ça coince
 * à cette heure, et sur la journée ; la fin de chaque service et ses heures
 * sup ; ce qui part en retard, avec la cause ; ce que change l'essai, avec le
 * choix « Référence / Essai ». À une heure donnée, les chiffres du panneau
 * égalent ceux du module. Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../direct-questions.js');
const PN = require('../direct-panneau.js');
const L = require('../direct-lire.js');
const E = require('../direct-etat.js');
const S = require('../moteur/site.js');
const R = require('../moteur/reponses.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const SY = require('../synthese-vue.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lireJson = x => (typeof x === 'string' ? JSON.parse(x) : x);
/** Une journée fictive : ses réponses, son site, sa lecture ; `csv` : son programme de vols. */
function journeeDe(csv = F.volsCsv()) {
  const sauvegarde = F.sauvegardeFictive(), vols = UI.parseFlights(csv, { eta: true, spmlParCabine: true, date: true });
  const args = J.argumentsDeLaJournee(sauvegarde, vols), r = P.simuler(args), k = I.journee(r, args), etat = lireJson(sauvegarde.contenu['ory-ateliers-v1']);
  const site = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, regime: args.regime }), journee = { r, args, k, reponses: R.reponses(r, args, { k }) };
  const heures = r.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite), bornes = { de: Math.min(...heures), a: Math.max(1440, ...heures) };
  return { journee, r, args, k, site, bornes, lu: L.lire(journee, bornes), noms: Object.fromEntries(site.zones.flatMap(z => z.services).map(id => [id, 'Service ' + id])) };
}
const U = journeeDe(), SANS = journeeDe(F.volsSansRetardCsv());
/** Ce que le panneau reçoit à l'heure `t`. */
const entree = (V, t, plus = {}) => ({ site: V.site, noms: V.noms, etat: E.etatA(V.journee, t), tons: L.tonsA(V.lu, V.journee, t), selection: null, t, lu: V.lu, reponses: V.journee.reponses, essais: null, montre: null, ...plus });
const hh = t => P.hhmm(t);
const sansBalises = h => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const section = (html, n) => { const m = new RegExp('<section class="dq-question" data-question="' + n + '"[\\s\\S]*?</section>').exec(html); return m ? m[0] : null; };
const HEURES = [-120, 190, U.lu.goulots[0].debut, 400, 560, 700, 1000, 1240];

test('les cinq questions, dans l’ordre de l’évolution 15', () => {
  const html = Q.rendu(entree(U, 400));
  assert.deepEqual([...html.matchAll(/data-question="(\d)"/g)].map(m => +m[1]), [1, 2, 3, 4, 5]);
  assert.deepEqual([...html.matchAll(/<h3 id="dq-titre-\d">([^<]*)/g)].map(m => m[1].trim()), ['1. Les personnes', '2. Où ça coince', '3. La fin de chaque service', '4. Ce qui part en retard', '5. Ce que change l’essai']);
  for (const n of [1, 2, 3, 4, 5]) assert.ok(section(html, n).includes('aria-labelledby="dq-titre-' + n + '"'), 'la question ' + n + ' porte son titre');
});

test('1. les personnes par service à l’heure rejouée : au travail ; en pause, en appui ou en chemin ; sans travail ; présents — ceux des indicateurs', () => {
  const ids = U.site.zones.flatMap(z => z.services);
  for (const t of HEURES) {
    const etat = E.etatA(U.journee, t), html = Q.personnes(entree(U, t));
    assert.ok(html.includes('<small>à ' + hh(t) + '</small>'), 'l’heure rejouée : ' + hh(t));
    // Une ligne par service, dans l'ordre des zones ; son nom est un bouton.
    const lignes = [...html.matchAll(/<tr[^>]*><th scope="row"><button type="button" class="dq-service" data-direct-service="([^"]*)" aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>[\s\S]*?<\/tr>/g)];
    assert.deepEqual(lignes.map(m => m[1]), ids, 'à ' + hh(t));
    const total = { auTravail: 0, ailleurs: 0, sansTravail: 0, presents: 0 };
    // Les titres des colonnes : celui du milieu reprend les mots de la légende (évolution 16, retouches).
    assert.deepEqual([...html.matchAll(/<th scope="col" class="num" data-etat="\w+">([^<]*)<\/th>/g)].map(m => m[1]), ['Au travail', 'En pause, en appui ou en chemin', 'Sans travail', 'Présents']);
    for (const m of lignes) {
      const x = etat.services[m[1]] || {}, cellules = Object.fromEntries([...m[0].matchAll(/data-etat="(\w+)">(\d+)</g)].map(c => [c[1], +c[2]]));
      assert.deepEqual(Object.keys(cellules), ['auTravail', 'ailleurs', 'sansTravail', 'presents'], 'les quatre colonnes, dans l’ordre');
      // Au travail, sans travail et présents : ceux des indicateurs ; le milieu : tous les autres présents (en pause, en
      // appui, en chemin). Les trois premières colonnes font les présents.
      for (const e of ['auTravail', 'sansTravail', 'presents']) assert.equal(cellules[e], x[e] || 0, m[1] + ' à ' + hh(t) + ' : ' + e);
      assert.equal(cellules.ailleurs, (x.presents || 0) - (x.auTravail || 0) - (x.sansTravail || 0), m[1] + ' à ' + hh(t) + ' : en pause, en appui ou en chemin');
      assert.ok(cellules.ailleurs >= (x.enPause || 0), m[1] + ' à ' + hh(t) + ' : au moins les personnes en pause');
      assert.equal(cellules.auTravail + cellules.ailleurs + cellules.sansTravail, cellules.presents, m[1] + ' à ' + hh(t) + ' : la somme des trois colonnes fait les présents');
      for (const e of Q.ETATS) total[e] += cellules[e];
      assert.equal(m[3], U.noms[m[1]]);
    }
    // L'unité : la somme des services.
    const pied = /<tfoot>[\s\S]*<\/tfoot>/.exec(html)[0], lus = Object.fromEntries([...pied.matchAll(/data-etat="(\w+)">(\d+)</g)].map(c => [c[1], +c[2]]));
    assert.deepEqual(lus, total, 'l’unité à ' + hh(t));
  }
  // Un service qui coince ou qu'il faut surveiller le dit en un mot ; le service choisi a son bouton enfoncé.
  const g = U.lu.goulots[0], t = g.debut + 30, html = Q.personnes(entree(U, t, { selection: 'armement' }));
  assert.ok(new RegExp('<tr class="dq-critique"><th scope="row"><button[^>]*data-direct-service="' + g.service + '"[^>]*>[^<]*</button> <span class="dq-ton">coince</span>').test(html));
  assert.ok(/data-direct-service="armement" aria-pressed="true"/.test(html));
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  // Dessous, la réponse de la journée : celle de la Synthèse.
  assert.ok(sansBalises(html).includes('Sur la journée : ' + SY.phrases(U.journee.reponses)[0]));
});

test('2. où ça coince à cette heure, et sur la journée', () => {
  let coincent = 0, calmes = 0;
  for (const t of HEURES) {
    const html = Q.coince(entree(U, t)), ici = L.goulotsA(U.lu, t), texte = sansBalises(html);
    assert.ok(html.includes('<h4>À ' + hh(t) + '</h4>') && html.includes('<h4>Sur la journée</h4>'));
    // À cette heure : les goulots du jour qui coincent maintenant, avec leur phrase ; sinon, rien ne coince.
    const boutons = [...html.matchAll(/<li><button type="button" class="dq-service" data-direct-service="([^"]*)"[^>]*>([^<]*)<\/button><\/li>/g)];
    assert.deepEqual(boutons.map(m => m[1]), ici.map(g => g.service), 'à ' + hh(t));
    assert.deepEqual(boutons.map(m => m[2].replace(/&#39;/g, "'")), ici.map(g => g.phrase));
    assert.equal(texte.includes('Rien ne coince à cette heure.'), ici.length === 0, 'à ' + hh(t));
    if (ici.length) coincent++; else calmes++;
    // Sur la journée : la carte « Où ça coince » de la Synthèse, mot pour mot.
    assert.ok(html.includes('<div class="dq-carte">' + SY.carteCoince(U.journee.reponses).corps + '</div>'));
  }
  assert.ok(coincent >= 3 && calmes >= 1, 'des heures où ça coince, des heures calmes');
  // Un service à surveiller est nommé, avec sa raison.
  const tons = { ...L.tonsA(U.lu, U.journee, 190), armement: { ton: 'avertissement', pourquoi: 'un arrivage attend depuis 7 h' } };
  assert.ok(sansBalises(Q.coince(entree(U, 190, { tons }))).includes(U.noms.armement + ' — à surveiller : un arrivage attend depuis 7 h.'));
  // Une journée sans retard : rien ne coince, à aucune heure — sauf ce que dit le module (une plonge qui laisse trop au lendemain).
  const calme = Q.coince(entree(SANS, 600));
  assert.ok(calme.includes(SY.carteCoince(SANS.journee.reponses).corps));
});

test('3. la fin de chaque service et ses heures sup : les lignes du module', () => {
  const html = Q.fins(entree(U, 400)), services = U.journee.reponses.fins.services;
  const lignes = [...html.matchAll(/<tr[^>]*><th scope="row">([\s\S]*?)<\/th><td class="num">([\s\S]*?)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><\/tr>/g)];
  assert.equal(lignes.length, services.length, 'une ligne par service et jour de travail');
  for (const [i, s] of services.entries()) {
    const m = lignes[i], mot = R.motDeLaLigne({ service: s.service, jour: s.jour || 0 }, U.journee.reponses.coince.services);
    assert.equal(sansBalises(m[1]), s.nom + (mot ? ' ' + mot : ''), 'le service, et son jour de travail');
    assert.ok(sansBalises(m[2]).startsWith(SY.heure(s.fin)), s.nom + ' : sa fin');
    assert.equal(m[3], SY.heure(s.finHoraire), s.nom + ' : son horaire');
    assert.equal(m[4], s.heuresSup.total > 0 ? SY.duree(s.heuresSup.total) : '—', s.nom + ' : ses heures sup');
  }
  assert.ok(services.some(s => s.jour === -1), 'la journée fictive a une ligne de la veille');
  // Un service qui dépasse son horaire d'un quart d'heure le dit : sa fin, et de combien.
  const rep = U.journee.reponses, depasse = { ...rep, fins: { services: [{ ...services[0], fin: services[0].finHoraire + 40, depasse: 40, heuresSup: { ...services[0].heuresSup, total: 80 } }, ...services.slice(1)] } };
  const h = Q.fins(entree(U, 400, { reponses: depasse }));
  assert.ok(/<tr class="dq-depasse">/.test(h) && sansBalises(h).includes('+' + SY.duree(40)) && sansBalises(h).includes(SY.duree(80)));
  assert.equal((html.match(/class="dq-depasse"/g) || []).length, services.filter(s => s.depasse >= R.DEPASSEMENT_MIN).length);
});

test('4. ce qui part en retard, avec la cause : la carte de la Synthèse', () => {
  const html = Q.retards(entree(U, 400)), carte = SY.carteRetard(U.journee.reponses);
  assert.ok(html.includes('<div class="dq-carte">' + carte.corps + '</div>'));
  const tard = U.journee.reponses.exceptions[0], m = SY.motsDeLException(tard);
  assert.ok(sansBalises(html).includes(m.nom + ' ' + m.quoi), 'la première exception, avec ce qu’elle est');
  assert.ok(m.mot && sansBalises(html).includes(m.mot), 'et sa cause');
  assert.ok(sansBalises(Q.retards(entree(SANS, 400))).includes('Rien.'), 'sans retard : rien');
});

test('5. ce que change l’essai, s’il y en a deux : le choix « Référence / Essai »', () => {
  // Sans essais retenus : une phrase dit comment en retenir deux ; pas de choix.
  const sans = Q.essai(entree(U, 400));
  assert.ok(!sans.includes('data-direct-essai') && sansBalises(sans).includes('Retenez deux essais'));
  // Deux essais : la carte de la Synthèse (A → B), et deux boutons.
  const essais = { A: U.journee.reponses, B: SANS.journee.reponses }, html = Q.essai(entree(U, 400, { essais }));
  assert.ok(html.includes('<div class="dq-carte">' + SY.carteEssai(essais).corps + '</div>'));
  const boutons = [...html.matchAll(/<button type="button" class="btn btn-mini" data-direct-essai="(A|B)" aria-pressed="(true|false)">([^<]*)<\/button>/g)];
  assert.deepEqual(boutons.map(m => [m[1], m[2], m[3]]), [['A', 'false', 'Référence'], ['B', 'false', 'Essai']]);
  assert.ok(sansBalises(html).includes('La scène rejoue la journée en cours.'));
  // L'essai que rejoue la scène a son bouton enfoncé, et la page le dit.
  const a = Q.essai(entree(U, 400, { essais, montre: 'A' })), b = Q.essai(entree(U, 400, { essais, montre: 'B' }));
  assert.ok(/data-direct-essai="A" aria-pressed="true"/.test(a) && /data-direct-essai="B" aria-pressed="false"/.test(a));
  assert.ok(sansBalises(a).includes("La scène rejoue la référence (l’essai A), à la même heure."));
  assert.ok(/data-direct-essai="B" aria-pressed="true"/.test(b) && sansBalises(b).includes("La scène rejoue l’essai (l’essai B), à la même heure."));
});

test('dans le panneau : les cinq réponses sans service choisi, le détail du service choisi ; tout texte de l’unité est échappé', () => {
  const x = entree(U, 400), questions = Q.rendu(x);
  assert.equal(PN.corps({ ...x, detail: null, questions }), questions, 'sans service choisi : les cinq réponses');
  const d = L.detail(U.lu, U.journee, 'prepa', 400);
  assert.ok(PN.corps({ ...x, detail: d, questions: null }).startsWith('<div class="dp-detail"'), 'un service choisi : son détail');
  assert.ok(PN.rendu({ ...x, detail: null, questions, suivi: L.suivi(U.journee, 'NO101') }).startsWith('<div class="dp-suivi'), 'le vol suivi reste au-dessus');
  // Un nom de service venu d'un fichier n'entre pas dans la page comme une balise.
  const piege = '<img src=x onerror=alert(1)>', noms = Object.fromEntries(Object.keys(U.noms).map(id => [id, piege]));
  const tons = Object.fromEntries(Object.keys(U.noms).map(id => [id, { ton: 'avertissement', pourquoi: piege }]));
  const rep = U.journee.reponses, mauvais = { ...rep, fins: { services: rep.fins.services.map(s => ({ ...s, nom: piege })) } };
  const html = Q.personnes({ ...x, noms, tons }) + Q.coince({ ...x, noms, tons }) + Q.fins({ ...x, reponses: mauvais });
  assert.ok(!html.includes('<img') && html.includes('&lt;img'));
  // La lecture ne touche à rien.
  const avant = JSON.stringify(U.journee.reponses);
  Q.rendu(entree(U, 560, { essais: { A: U.journee.reponses, B: SANS.journee.reponses }, montre: 'B' }));
  assert.equal(JSON.stringify(U.journee.reponses), avant);
});

test('les trois premières colonnes font les présents, pour chaque service, à chaque quart d’heure — aussi quand des chauffeurs sont sur la route', () => {
  const ids = U.site.zones.flatMap(z => z.services);
  let ailleursSeuls = 0, heures = 0;
  for (let t = Math.floor(U.bornes.de / 15) * 15; t <= U.bornes.a; t += 15) {
    const etat = E.etatA(U.journee, t), tournee = E.vehiculesA(U.r, t).length > 0;
    heures++;
    for (const id of ids) {
      const x = etat.services[id] || {}, c = Q.colonnes(etat.services[id]);
      assert.ok((x.auTravail || 0) + (x.sansTravail || 0) <= (x.presents || 0), id + ' à ' + hh(t) + ' : jamais plus de personnes au travail ou sans travail que de présents');
      assert.equal(c.auTravail + c.ailleurs + c.sansTravail, c.presents, id + ' à ' + hh(t) + ' : la somme fait les présents');
      assert.deepEqual([c.auTravail, c.sansTravail, c.presents], [x.auTravail || 0, x.sansTravail || 0, x.presents || 0], id + ' à ' + hh(t) + ' : les chiffres des indicateurs');
      // Le cas du constat : des présents qui ne sont ni au travail, ni en pause, ni sans travail — en appui ou en chemin.
      if (tournee && c.presents > 0 && c.auTravail === 0 && c.sansTravail === 0 && !(x.enPause > 0)) { ailleursSeuls++; assert.equal(c.ailleurs, c.presents); }
    }
  }
  assert.ok(heures > 80 && ailleursSeuls > 0, 'la journée fictive a des heures où des présents ne sont ni au travail, ni en pause, ni sans travail pendant une tournée (' + ailleursSeuls + ')');
  // Sans personne : des zéros.
  assert.deepEqual(Q.colonnes(undefined), { auTravail: 0, ailleurs: 0, sansTravail: 0, presents: 0 });
});
