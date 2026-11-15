/* Évolution 16 (e) — lire la vue en direct et agir (v1), sans navigateur.
 * Le sol d'une zone se teinte selon ce que dit le module des réponses : neutre ;
 * avertissement quand un arrivage y attend au-delà du seuil d'attente, ou que
 * des personnes y travaillent après leur horaire ; critique quand le service
 * est un goulot du jour et que l'heure rejouée est dans le moment où il coince.
 * « Point suivant » saute au prochain moment à regarder ; la journée s'ouvre au
 * moment où le premier goulot commence à coincer, sinon au pic de travail. Rien
 * n'est calculé : tout est lu dans le résultat, les indicateurs et les
 * réponses, sans règle ni seuil nouveau. Unité, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../direct-lire.js');
const T = require('../direct-temps.js');
const PN = require('../direct-panneau.js');
const E = require('../direct-etat.js');
const D = require('../direct-scene.js');
const S = require('../moteur/site.js');
const R = require('../moteur/reponses.js');
const P = require('../moteur/production.js');
const I = require('../moteur/indicateurs.js');
const J = require('../moteur/journee.js');
const SY = require('../synthese-vue.js');
const UI = require('../ui-model.js');
const F = require('./plan-rejoue-fictif.cjs');

const lireJson = x => (typeof x === 'string' ? JSON.parse(x) : x);
/** Une journée fictive : son résultat, ses indicateurs, ses réponses, son site ; `seuils` : ceux des réglages. */
function journeeDe({ sauvegarde = F.sauvegardeFictive(), csv = F.volsCsv(), seuils, heuresSup } = {}) {
  const vols = UI.parseFlights(csv, { eta: true, spmlParCabine: true, date: true });
  const args = { ...J.argumentsDeLaJournee(sauvegarde, vols), ...(heuresSup ? { heuresSup } : {}) }, r = P.simuler(args), k = I.journee(r, args), etat = lireJson(sauvegarde.contenu['ory-ateliers-v1']);
  const site = S.generer({ ateliers: etat.ateliers, parcours: etat.parcours, regime: args.regime });
  const journee = { r, args, k, reponses: R.reponses(r, args, { k, seuils }) };
  const heures = r.lots.flatMap(l => [l.debut, l.fin, l.arrivee]).filter(Number.isFinite), bornes = { de: Math.min(...heures), a: Math.max(1440, ...heures) };
  return { journee, r, args, k, etat, site, bornes, lu: L.lire(journee, bornes) };
}
/** La sauvegarde fictive, ses ateliers modifiés par `f(ateliers, etat)`. */
function sauvegardeAvec(f) {
  const s = F.sauvegardeFictive(), texte = typeof s.contenu['ory-ateliers-v1'] === 'string', etat = lireJson(s.contenu['ory-ateliers-v1']);
  f(etat.ateliers, etat);
  s.contenu['ory-ateliers-v1'] = texte ? JSON.stringify(etat) : etat;
  return s;
}
const U = journeeDe();
/**
 * La même unité, dont le montage dépasse son horaire de 20 minutes : sa présence finit 20 min avant la fin de son dernier
 * lot et, les heures sup permises, elle le finit après son horaire.
 */
const DEPASSE = (() => {
  const v = U.r.ateliers.find(a => a.id === 'mo');
  return journeeDe({ heuresSup: { actif: true, plafond: 180 },
    sauvegarde: sauvegardeAvec(ateliers => { const e = ateliers.find(a => a.id === 'mo'); e.regime = { ...(e.regime || {}), actif: true, presence: Math.round(v.fin - 20 - v.debutPoste) }; }) });
})();
const hh = t => P.hhmm(t);
const HEURES = (() => { const l = []; for (let t = Math.floor(U.bornes.de / 15) * 15 - 30; t <= U.bornes.a + 30; t += 15) l.push(t, t + 7); return l; })();

test('le module des réponses dit « quand » dans le détail, sans rien changer à ses réponses', () => {
  const avant = JSON.stringify(U.journee.reponses), q = R.quand(U.r, U.args, { k: U.k });
  assert.equal(JSON.stringify(R.reponses(U.r, U.args, { k: U.k })), avant, 'les réponses sont les mêmes, champ par champ');
  // Les lots en retard d'une ligne : ceux que compte son goulot.
  for (const g of U.journee.reponses.coince.goulots) {
    const lots = q.enRetard.filter(x => x.service === g.service && x.jour === g.jour);
    assert.equal(new Set(lots.map(x => x.quoi + ' ' + x.id)).size, g.enRetard, g.nom + ' : autant de retards que le goulot en compte');
    assert.equal(new Set(lots.filter(x => x.apres).map(x => x.quoi + ' ' + x.id)).size, g.apresLimite, g.nom + ' : dont ceux que le lot finit lui-même après la limite');
    for (const x of lots) assert.ok(U.r.lots.some(l => l.atelier === x.atelier && l.nom === x.lot && l.debut === x.debut), 'un lot du journal : ' + x.lot);
  }
  assert.equal(q.enRetard.filter(x => !U.journee.reponses.coince.goulots.some(g => g.service === x.service && g.jour === x.jour)).length, 0, 'aucun lot en retard hors d’un goulot');
  // Les arrivages qui attendent : ceux que résume chaque ligne (son cumul, sa plus longue attente).
  for (const s of U.journee.reponses.coince.services) {
    const siens = q.arrivages.filter(a => a.service === s.service && a.jour === s.jour);
    assert.ok(Math.abs(siens.reduce((n, a) => n + a.minutes, 0) - s.cumul) < 1e-3, s.nom + ' : le cumul d’attente');
    if (s.attenteMax) assert.ok(siens.some(a => a.de === s.attenteMax.de && a.a === s.attenteMax.a && a.lot === s.attenteMax.lot), s.nom + ' : sa plus longue attente est un de ses arrivages');
  }
  assert.equal(R.quand(null), null);
  assert.equal(R.quand({ ok: false }), null);
});

test('un goulot coince autour de chaque lot par lequel quelque chose part en retard ; la phrase est celle de la Synthèse', () => {
  const rep = U.journee.reponses, q = R.quand(U.r, U.args, { k: U.k });
  assert.ok(rep.coince.goulots.length >= 3, 'la journée fictive a des goulots');
  assert.deepEqual(U.lu.goulots.map(g => g.service + '|' + g.jour), rep.coince.goulots.map(g => g.service + '|' + (g.jour || 0)), 'les goulots des réponses, dans leur ordre');
  for (const g of U.lu.goulots) {
    const lots = q.enRetard.filter(x => x.service === g.service && x.jour === g.jour && Number.isFinite(x.debut));
    assert.ok(g.fenetres.length >= 1, g.nom + ' : au moins un moment');
    // Chaque lot en retard est dans un moment ; chaque moment commence au début d'un de ces lots.
    for (const x of lots) assert.ok(g.fenetres.some(f => x.debut >= f.de - 1e-6 && (x.fin ?? x.debut) <= f.a + 1e-6), g.nom + ' : le lot « ' + x.lot + ' » est dans un moment');
    for (const f of g.fenetres) assert.ok(lots.some(x => Math.abs(x.debut - f.de) < 1e-6), g.nom + ' : un moment commence au début d’un lot en retard');
    for (const [i, f] of g.fenetres.entries()) { assert.ok(f.a > f.de); if (i) assert.ok(f.de > g.fenetres[i - 1].a, 'des moments distincts, dans l’ordre'); }
    assert.equal(g.debut, g.fenetres[0].de);
    assert.equal(g.phrase, g.nom + (g.jour ? ' (' + R.motDuJour(g.jour) + ')' : '') + ' : ' + SY.consequences(rep.coince.goulots[g.rang], '', false), 'la phrase de la Synthèse');
  }
  assert.match(U.lu.goulots[0].phrase, /^Montage : \d+ commandes ou vols partent en retard par ses lots$/);
});

test('un goulot qui dépasse son horaire coince après la fin d’horaire de l’équipe qui dépasse : « Montage : l’équipe … finit à hh:mm pour hh:mm »', () => {
  const rep = DEPASSE.journee.reponses, g0 = rep.coince.goulots.find(g => g.equipe);
  assert.ok(g0 && g0.service === 'prepa' && g0.depasse >= 15, 'le montage dépasse son horaire');
  const g = DEPASSE.lu.goulots.find(x => x.service === 'prepa');
  assert.equal(g.phrase, 'Montage : l’équipe ' + g0.equipe.nom + ' finit à ' + hh(g0.equipe.fin) + ' pour ' + hh(g0.equipe.finHoraire));
  assert.ok(g.fenetres.some(f => f.de <= g0.equipe.finHoraire + 1e-6 && f.a >= g0.equipe.fin - 1e-6), 'de la fin de son horaire à sa fin');
  // À l'heure où elle travaille après son horaire : critique, et c'est le goulot du moment.
  const t = (g0.equipe.finHoraire + g0.equipe.fin) / 2, tons = L.tonsA(DEPASSE.lu, DEPASSE.journee, t);
  assert.equal(tons.prepa.ton, 'critique');
  assert.equal(L.goulotA(DEPASSE.lu, t).service, 'prepa');
});

test('la teinte d’un service : critique dans le moment où son goulot coince, neutre hors de lui', () => {
  let critiques = 0, neutres = 0;
  for (const t of HEURES) {
    const tons = L.tonsA(U.lu, U.journee, t);
    for (const g of U.lu.goulots) {
      const dedans = g.fenetres.some(f => t >= f.de && t < f.a - 1e-9);
      if (dedans) { assert.equal(tons[g.service].ton, 'critique', g.nom + ' à ' + hh(t)); assert.match(tons[g.service].pourquoi, /part(ent)? en retard|finit à/); critiques++; }
    }
    for (const [service, x] of Object.entries(tons)) {
      const coince = U.lu.goulots.some(g => g.service === service && g.fenetres.some(f => t >= f.de && t < f.a - 1e-9));
      assert.equal(x.ton === 'critique', coince, service + ' à ' + hh(t) + ' : critique si, et seulement si, un de ses goulots coince');
      if (x.ton === 'neutre') { assert.equal(x.pourquoi, null); neutres++; }
    }
    // Le goulot du moment : le premier, dans l'ordre des réponses, qui coince à cette heure.
    const attendu = U.lu.goulots.find(g => g.fenetres.some(f => t >= f.de && t < f.a - 1e-9)) || null;
    assert.equal(L.goulotA(U.lu, t), attendu, 'à ' + hh(t));
  }
  assert.ok(critiques > 30 && neutres > 300, 'le contrôle a vu les deux (' + critiques + ', ' + neutres + ')');
  // Avant la journée : rien ne coince, tout est neutre.
  const tot = L.tonsA(U.lu, U.journee, U.bornes.de - 300);
  assert.ok(Object.values(tot).every(x => x.ton === 'neutre'));
  assert.equal(L.goulotA(U.lu, U.bornes.de - 300), null);
  // La teinte d'une zone : la plus grave de ses services.
  const food = U.site.zones.find(z => z.services.includes('prepa')), g = U.lu.goulots[0], dans = (g.fenetres[0].de + g.fenetres[0].a) / 2;
  assert.ok(food.services.length >= 2, 'la zone FOOD réunit la préparation et le montage');
  assert.equal(L.tonDeZone(L.tonsA(U.lu, U.journee, dans), food).ton, 'critique');
  assert.equal(L.tonDeZone({}, food).ton, 'neutre');
});

test('avertissement : un arrivage attend au-delà du seuil d’attente des réglages — pas avant, pas après', () => {
  // La journée fictive a un arrivage qui attend près de cinq heures : sous le seuil par défaut (6 h), au-delà d'un seuil d'une heure.
  const long = R.quand(U.r, U.args, { k: U.k }).arrivages.slice().sort((p, q) => q.minutes - p.minutes)[0];
  assert.ok(long.minutes > 120 && long.minutes < 360, 'un arrivage attend ' + Math.round(long.minutes) + ' min');
  assert.equal(U.lu.seuil, 360, 'le seuil par défaut : « Attente d’un arrivage », 6 h');
  assert.ok(U.lu.arrivages.every(a => a.auDela === null), 'au seuil par défaut, aucun arrivage n’attend au-delà');
  const V = journeeDe({ seuils: { attenteLot: 60 } });
  assert.equal(V.lu.seuil, 60);
  const a = V.lu.arrivages.find(x => x.de === long.de && x.service === long.service);
  assert.equal(a.auDela, long.de + 60, 'son attente passe le seuil une heure après son arrivée');
  // Hors d'un moment critique du service, la teinte passe à l'avertissement quand l'attente passe le seuil, et y reste jusqu'au premier lot.
  const coince = t => V.lu.goulots.some(g => g.service === a.service && g.fenetres.some(f => t >= f.de && t < f.a - 1e-9));
  const avant = long.de + 30, pendant = [long.de + 61, long.de + 90, long.de + 120].find(t => !coince(t) && t < long.a);
  assert.ok(pendant !== undefined, 'une heure où il attend au-delà du seuil sans que le service coince');
  assert.equal(L.tonsA(V.lu, V.journee, avant)[a.service].ton, 'neutre', 'avant le seuil : neutre');
  const x = L.tonsA(V.lu, V.journee, pendant)[a.service];
  assert.equal(x.ton, 'avertissement');
  assert.match(x.pourquoi, /^un arrivage attend depuis /);
  assert.equal(L.tonsA(U.lu, U.journee, pendant)[a.service].ton, 'neutre', 'au seuil par défaut, la même heure est neutre');
  // Le critique l'emporte sur l'avertissement.
  const les2 = [long.de + 61, long.a - 1].find(t => coince(t));
  if (les2 !== undefined) assert.equal(L.tonsA(V.lu, V.journee, les2)[a.service].ton, 'critique');
});

test('avertissement : des personnes travaillent après leur horaire', () => {
  const fin = DEPASSE.journee.reponses.fins.services.find(s => s.service === 'prepa').equipes.find(e => e.id === 'mo');
  assert.ok(fin.depasse >= 15, 'le montage finit après son horaire');
  assert.equal(DEPASSE.lu.horaires.get('mo'), fin.finHoraire, 'la fin d’horaire est celle des réponses');
  // La teinte du montage est critique à cette heure (c'est un goulot) ; le détail dit aussi qui travaille après son horaire.
  const t = fin.finHoraire + 5, d = L.detail(DEPASSE.lu, DEPASSE.journee, 'prepa', t), mo = d.equipes.find(e => e.id === 'mo');
  assert.equal(mo.apresHoraire, true);
  assert.ok(mo.personnes.auTravail > 0);
  assert.equal(L.detail(DEPASSE.lu, DEPASSE.journee, 'prepa', fin.finHoraire - 30).equipes.find(e => e.id === 'mo').apresHoraire, false, 'dans son horaire : non');
  // Sans goulot à cette heure, le service serait à l'avertissement : la même lecture, ses goulots retirés.
  const sans = { ...DEPASSE.lu, goulots: [] }, x = L.tonsA(sans, DEPASSE.journee, t).prepa;
  assert.equal(x.ton, 'avertissement');
  assert.match(x.pourquoi, /travaille après son horaire \(\d\d:\d\d\)$/);
  assert.equal(L.tonsA(sans, DEPASSE.journee, fin.finHoraire - 30).prepa.ton, 'neutre');
});

test('« Point suivant » : le début de chaque goulot, chaque chargement en retard, dans l’ordre ; l’ouverture au début du premier goulot', () => {
  const points = U.lu.points;
  for (const [i, p] of points.entries()) if (i) assert.ok(p.t >= points[i - 1].t, 'dans l’ordre du temps');
  // Le début de chaque goulot.
  for (const g of U.lu.goulots) assert.ok(points.some(p => p.quoi === 'goulot' && p.service === g.service && p.jour === g.jour && p.t === g.debut && p.texte === g.phrase), g.nom);
  assert.equal(points.filter(p => p.quoi === 'goulot').length, U.lu.goulots.length);
  // Chaque vol chargé en retard : au début de son chargement.
  const tard = U.journee.reponses.exceptions.filter(x => x.type === 'vol-en-retard');
  assert.ok(tard.length >= 5);
  for (const x of tard) {
    const lot = U.r.lots.find(l => l.handling && l.vol === x.id), p = points.find(q => q.quoi === 'chargement' && q.vol === x.id);
    assert.ok(p && p.t === lot.debut, 'vol ' + x.id + ' : au début de son chargement');
    assert.match(p.texte, new RegExp('^Vol ' + x.id + ' chargé .+ après sa limite$'));
  }
  assert.equal(points.filter(p => p.quoi === 'chargement').length, tard.length + U.journee.reponses.exceptions.filter(x => x.type === 'vol-pas-charge').length);
  // Le point suivant : le premier après l'heure ; arrivé dessus, on passe au suivant ; après le dernier, plus rien.
  const premier = L.pointSuivant(U.lu, U.bornes.de - 60);
  assert.equal(premier.t, points[0].t);
  let t = U.bornes.de - 60, n = 0;
  for (let p = L.pointSuivant(U.lu, t); p; p = L.pointSuivant(U.lu, t)) { assert.ok(p.t > t + 0.5); t = p.t; n++; assert.ok(n <= points.length); }
  assert.equal(new Set(points.map(p => Math.round(p.t * 2))).size >= n - 1 && n >= 5, true, 'chaque moment est visité une fois (' + n + ')');
  assert.equal(L.pointSuivant(U.lu, points[points.length - 1].t), null);
  // De juste avant le goulot du jour, « Point suivant » mène à son début ; ce qui arrive au même instant vient avec.
  const g = U.lu.goulots[0], p = L.pointSuivant(U.lu, g.debut - 10);
  assert.equal(p.t, g.debut);
  assert.equal(p.quoi, 'goulot');
  assert.equal(p.service, g.service);
  const ensemble = L.pointSuivant(U.lu, points.find(x => x.quoi === 'chargement').t - 1);
  assert.ok(ensemble.avec.every(x => Math.abs(x.t - ensemble.t) <= 0.5));
  // L'ouverture : le moment où le premier goulot du jour commence à coincer.
  assert.equal(U.lu.ouverture, g.debut);
  assert.equal(F.heureDOuvertureAttendue(F.sauvegardeFictive(), F.volsCsv()).t, g.debut, 'l’aide des tests dit la même heure');
  assert.notEqual(g.debut, F.heureDuPicAttendue(F.sauvegardeFictive(), F.volsCsv()).t, 'ce n’est pas le pic de travail');
  // Sans goulot, pas d'ouverture propre : la page ouvre au pic de travail.
  const calme = { ...U.journee, reponses: { ...U.journee.reponses, coince: { ...U.journee.reponses.coince, goulots: [], goulot: null }, exceptions: [] } }, lu = L.lire(calme, U.bornes);
  assert.equal(lu.ouverture, null);
  assert.deepEqual(lu.points, []);
  assert.equal(L.pointSuivant(lu, 0), null);
  // Un premier goulot sans moment daté (aucun lot en retard daté, personne ne dépasse) : l'ouverture va au suivant.
  const rep = U.journee.reponses, sansLots = { ...rep.coince.goulots[0], service: 'inconnu', nom: 'Sans moment', equipe: null, enRetard: 1 };
  const autre = L.lire({ ...U.journee, reponses: { ...rep, coince: { ...rep.coince, goulots: [sansLots, ...rep.coince.goulots] } } }, U.bornes);
  assert.equal(autre.goulots[0].debut, null);
  assert.equal(autre.ouverture, g.debut, 'le premier goulot qui a un moment');
  // Les moments hors de la journée rejouée ne sont pas des points : « Point suivant » ne s'y bloque pas.
  const court = L.lire(U.journee, { de: U.bornes.de, a: g.debut + 30 });
  assert.ok(court.points.length >= 1 && court.points.every(q => q.t >= U.bornes.de && q.t <= g.debut + 30));
  assert.ok(court.points.length < points.length);
  assert.equal(L.pointSuivant(court, court.points[court.points.length - 1].t), null);
  // Sans journée : rien.
  assert.deepEqual(L.lire(null).goulots, []);
  assert.equal(L.lire(null).ouverture, null);
});

test('la barre du temps : les personnes au travail, les arrivages en attente, un repère par départ de vol, les jours', () => {
  const f = L.frise(U.journee, U.lu, U.bornes.de, U.bornes.a);
  assert.equal(f.pas, 15);
  assert.ok(f.de <= U.bornes.de && f.a >= U.bornes.a && f.auTravail.length === (f.a - f.de) / 15);
  // À chaque créneau : la somme des personnes au travail de toutes les équipes, aux indicateurs.
  for (let i = 0; i < f.auTravail.length; i++) {
    const t = f.de + i * 15, attendu = U.k.equipes.reduce((s, e) => s + (e.creneaux ? E.valeurA(e.creneaux.auTravail, t - (e.jour || 0) * 1440) || 0 : 0), 0);
    assert.ok(Math.abs(f.auTravail[i] - attendu) < 1e-9, 'au travail à ' + hh(t));
    assert.equal(f.enAttente[i], U.lu.arrivages.filter(a => t + 7.5 >= a.de && t + 7.5 < a.a).length, 'en attente à ' + hh(t));
  }
  assert.equal(f.maxTravail, Math.max(...f.auTravail));
  assert.ok(f.maxTravail >= 8 && f.maxAttente >= 1);
  // Un repère par départ de vol dans la journée rejouée ; critique s'il est chargé en retard.
  const vols = E.volsDe(U.r).filter(v => v.depart >= U.bornes.de && v.depart <= U.bornes.a);
  assert.deepEqual(f.vols.map(v => v.id).sort(), vols.map(v => v.id).sort());
  for (const v of f.vols) { const x = U.r.vols.find(y => y.id === v.id); assert.equal(v.t, x.depart); assert.equal(v.enRetard, x.retard > 0, v.id); }
  assert.ok(f.vols.some(v => v.enRetard));
  // Les jours : de la veille au jour des vols, bout à bout.
  assert.deepEqual(f.jours.map(j => j.mot), ['J−1', 'J']);
  assert.equal(f.jours[0].a, 0); assert.equal(f.jours[1].de, 0);
  assert.deepEqual(L.frise(U.journee, U.lu, -2 * 1440 - 60, 1440 + 60).jours.map(j => j.mot), ['J−3', 'J−2', 'J−1', 'J', 'J+1']);
  // La géométrie : l'heure et sa place se répondent ; les repères sont à l'heure de leur vol.
  const g = T.geometrie(f, 900);
  for (const t of [f.de, 0, 400, f.a]) assert.ok(Math.abs(g.tDe(g.x(t)) - t) < 1e-6, 'aller et retour à ' + t);
  assert.equal(g.x(f.de), T.MARGE.gauche); assert.equal(g.x(f.a), 900 - T.MARGE.droite);
  assert.equal(g.tDe(-50), f.de); assert.equal(g.tDe(5000), f.a);
  for (const v of g.vols) assert.ok(Math.abs(v.x - g.x(v.t)) < 0.06);
  assert.equal(T.geometrie(f, 100), null, 'sans place, pas de barre');
  assert.equal(T.geometrie(null, 900), null);
  // Le dessin : une aire, une ligne, un repère par vol (ceux en retard à part), les jours ; aucun texte venu de l'unité sans échappement.
  const svg = T.svg(f, g);
  assert.equal((svg.match(/class="dt-aire"/g) || []).length, 1);
  assert.equal((svg.match(/class="dt-ligne"/g) || []).length, 1);
  assert.equal((svg.match(/data-vol=/g) || []).length, f.vols.length);
  assert.equal((svg.match(/dt-vol-retard/g) || []).length, f.vols.filter(v => v.enRetard).length);
  assert.ok(svg.includes('>J−1<') && svg.includes('>J<'));
  const piege = T.svg({ ...f, vols: [{ id: '"><script>x</script>', t: 100, enRetard: false }] }, T.geometrie({ ...f, vols: [{ id: '"><script>x</script>', t: 100, enRetard: false }] }, 900));
  assert.ok(!piege.includes('<script>'), 'un numéro de vol est échappé');
  // En clair : l'heure, les personnes au travail, les arrivages en attente de son créneau.
  const t = U.lu.goulots[0].debut, v = T.valeursA(f, t);
  assert.equal(T.enClair(f, t), 'J ' + hh(t) + ' — ' + v.auTravail + (v.auTravail >= 2 ? ' personnes au travail, ' : ' personne au travail, ') + v.enAttente + (v.enAttente >= 2 ? ' arrivages en attente' : ' arrivage en attente'));
  assert.equal(T.quand(-120), 'J−1 22:00'); assert.equal(T.quand(1500), 'J+1 01:00');
});

test('le détail d’un service : ses équipes, ses personnes par état, ses lots à faire, ses arrivages en attente, sa courbe de charge', () => {
  const t = U.lu.goulots[0].debut + 60, d = L.detail(U.lu, U.journee, 'prepa', t), etat = E.etatA(U.journee, t);
  assert.equal(d.service, 'prepa'); assert.equal(d.t, t);
  // Ses équipes : celles du service, avec leur horaire et leurs personnes par état (les indicateurs).
  const equipes = U.k.equipes.filter(e => e.service === 'prepa');
  assert.deepEqual(d.equipes.map(e => e.id), equipes.map(e => e.id));
  for (const e of d.equipes) {
    assert.deepEqual(e.personnes, etat.equipes[e.id], e.id + ' : ses personnes par état');
    const v = U.r.ateliers.find(a => a.id === e.id);
    assert.equal(e.debut, v.debutPoste); assert.equal(e.finHoraire, U.lu.horaires.get(e.id));
  }
  // Ses personnes par état : la somme de ses équipes — celles de l'étiquette de la scène.
  for (const m of ['presents', 'auTravail', 'enPause', 'sansTravail', 'enAppui']) assert.equal(d.personnes[m], etat.services.prepa[m], m);
  // Ses lots à faire : ce qui attend devant lui, les séjours en stock du résultat.
  const files = E.filesA(U.r, t).prepa || [];
  assert.equal(d.lots.length, files.length); assert.equal(d.lots.length, etat.services.prepa.lots);
  assert.ok(d.lots.length >= 1, 'des lots attendent devant le montage');
  for (const [i, l] of d.lots.entries()) { assert.equal(l.classe, files[i].classe); assert.equal(l.depuis, files[i].entree); assert.equal(l.attente, t - files[i].entree); assert.equal(l.libelle, P.libelleClasse(l.classe)); }
  assert.equal(d.repas, files.reduce((s, l) => s + l.repas, 0));
  // Ses arrivages en attente, avec leur attente à cette heure.
  const attendent = U.lu.arrivages.filter(a => a.service === 'prepa' && t >= a.de && t < a.a);
  assert.equal(d.arrivages.length, attendent.length); assert.ok(d.arrivages.length >= 1);
  for (const [i, a] of d.arrivages.entries()) { assert.equal(a.attente, t - attendent[i].de); assert.equal(a.jusqua, attendent[i].a); assert.equal(a.auDela, false, 'sous le seuil par défaut'); }
  // Ses personnes sans travail, et ce qu'elles attendent (les réponses).
  assert.equal(d.sansTravail.personnes, etat.services.prepa.sansTravail);
  const mots = U.journee.reponses.sansTravail.services.filter(s => s.service === 'prepa').flatMap(s => (s.attendait || []).map(SY.motsDeLAttendu));
  assert.deepEqual(d.sansTravail.attendait, [...new Set(mots)]);
  // Sa courbe de charge : au travail et présents de ses équipes, créneau par créneau.
  for (let i = 0; i < d.courbe.auTravail.length; i++) {
    const h = d.courbe.de + i * 15, somme = m => equipes.reduce((s, e) => s + (e.creneaux ? E.valeurA(e.creneaux[m], h - (e.jour || 0) * 1440) || 0 : 0), 0);
    assert.ok(Math.abs(d.courbe.auTravail[i] - somme('auTravail')) < 1e-9 && Math.abs(d.courbe.presents[i] - somme('presents')) < 1e-9, 'à ' + hh(h));
    assert.ok(d.courbe.auTravail[i] <= d.courbe.presents[i] + 1e-9);
  }
  // Sa teinte et sa raison ; ses goulots.
  assert.equal(d.ton, 'critique'); assert.equal(d.pourquoi, U.lu.goulots[0].phrase);
  assert.deepEqual(d.goulots.map(g => g.maintenant), [true]);
  // Un service sans équipe n'a pas de détail ; sans heure non plus.
  assert.equal(L.detail(U.lu, U.journee, 'inconnu', t), null);
  assert.equal(L.detail(U.lu, U.journee, 'prepa', null), null);
  // Au-delà du seuil réglé, l'arrivage le dit.
  const V = journeeDe({ seuils: { attenteLot: 60 } }), a = V.lu.arrivages.find(x => x.auDela !== null && x.service === 'prepa');
  assert.equal(L.detail(V.lu, V.journee, 'prepa', a.auDela + 5).arrivages.find(x => x.depuis === a.de).auDela, true);
});

test('suivre un vol : ses lots restent nets partout, le reste pâlit ; la phrase qui explique son retard est celle de la Synthèse', () => {
  const tard = U.journee.reponses.exceptions.find(x => x.type === 'vol-en-retard'), s = L.suivi(U.journee, tard.id), m = SY.motsDeLException(tard);
  assert.equal(s.vol, tard.id); assert.equal(s.enRetard, true);
  assert.equal(s.phrase, 'Vol ' + tard.id + ' (' + hh(tard.depart) + ') ' + m.quoi + (m.mot ? ' — ' + m.mot : '') + '.' + (m.phrase ? ' ' + m.phrase : ''));
  assert.match(s.phrase, /chargé .+ après sa limite/);
  // Ses commandes : celles dont il est l'un des vols.
  const attendues = U.r.classes.filter(c => (c.vols || []).some(v => v.id === tard.id)).map(c => c.id);
  assert.deepEqual([...s.classes].sort(), attendues.slice().sort());
  assert.ok(s.classes.size >= 3);
  // Dans la scène, à chaque heure : un chariot est du vol si, et seulement si, il porte ce vol ou l'une de ses commandes.
  const personnes = new Map(U.r.ateliers.map(e => [e.id, e.personnes])), ilots = D.ilots(U.site, U.etat.ateliers, id => personnes.get(id)), places = E.placesDesVols(U.r);
  const scene = { site: U.site, ilots, aire: D.aireDe(U.site, places.nombre), places };
  let nets = 0, pales = 0;
  for (const t of [300, 400, 500, 560, 600, 700]) {
    const c = D.circulation(scene, U.journee, t);
    for (const o of c.chariots) {
      const sien = o.ton !== 'sale' && (o.vol != null ? o.vol === tard.id : (o.classes || [o.classe]).some(id => s.classes.has(id)));
      assert.equal(L.estDuVol(s, o), sien, 'à ' + hh(t)); if (sien) nets++; else pales++;
    }
    for (const a of c.avions) assert.equal(L.estDuVol(s, a), a.id === tard.id);
    for (const v of c.vehicules) assert.equal(L.estDuVol(s, v), v.vols.includes(tard.id));
  }
  assert.ok(nets > 5 && pales > 50, 'ses lots restent nets (' + nets + '), le reste pâlit (' + pales + ')');
  // Un retour sale n'est d'aucun vol du jour ; une personne non plus.
  assert.equal(L.estDuVol(s, { quoi: 'chariot', ton: 'sale', vol: tard.id + ' (J-1)' }), false);
  assert.equal(L.estDuVol(s, { quoi: 'personne' }), false);
  assert.equal(L.estDuVol(null, { quoi: 'avion', id: tard.id }), false);
  // Le vol d'un objet cliqué : celui d'un avion ; celui d'un chariot (son vol, sinon le premier vol de sa commande).
  assert.equal(L.volDe(U.journee, { quoi: 'avion', id: 'NO101' }), 'NO101');
  assert.equal(L.volDe(U.journee, { quoi: 'chariot', ton: 'repas', vol: 'SU201', classe: 'x' }), 'SU201');
  const classe = U.r.classes.find(c => (c.vols || []).length >= 2), premier = classe.vols.slice().sort((p, q) => p.depart - q.depart)[0].id;
  assert.equal(L.volDe(U.journee, { quoi: 'chariot', ton: 'repas', vol: null, classe: classe.id }), premier);
  assert.equal(L.volDe(U.journee, { quoi: 'chariot', ton: 'sale', vol: 'NO101 (J-1)' }), null);
  assert.equal(L.volDe(U.journee, { quoi: 'vehicule', vols: ['ES301'] }), 'ES301');
  assert.equal(L.volDe(U.journee, null), null);
  // Un vol chargé à l'heure le dit ; un vol inconnu n'est pas suivi.
  const ok = U.r.vols.find(v => !(v.retard > 0) && Number.isFinite(v.fin)), s2 = L.suivi(U.journee, ok.id);
  assert.equal(s2.enRetard, false); assert.equal(s2.phrase, 'Vol ' + ok.id + ' (' + hh(ok.depart) + ') : chargé à l’heure.');
  assert.equal(L.suivi(U.journee, 'ZZ999'), null);
  assert.equal(L.suivi(U.journee, null), null);
});

test('le panneau : la liste des services est une liste de boutons ; le détail ; le vol suivi ; tout texte de l’unité est échappé', () => {
  const t = U.lu.goulots[0].debut + 60, etat = E.etatA(U.journee, t), tons = L.tonsA(U.lu, U.journee, t), noms = U.args.noms || {};
  const html = PN.services(U.site, etat, tons, noms, 'armement'), ids = U.site.zones.flatMap(z => z.services);
  // Un bouton par service, dans l'ordre des zones ; celui du service choisi est enfoncé ; un service qui coince le dit en un mot.
  const boutons = html.match(/<button [^>]*data-direct-service="[^"]*"[^>]*>/g) || [];
  assert.equal(boutons.length, ids.length);
  assert.deepEqual(boutons.map(b => /data-direct-service="([^"]*)"/.exec(b)[1]), ids);
  assert.ok(boutons.every(b => /type="button"/.test(b)));
  assert.equal(boutons.filter(b => /aria-pressed="true"/.test(b)).length, 1);
  assert.ok(/data-direct-service="armement"[^>]*aria-pressed="true"/.test(html));
  assert.ok(/data-direct-service="prepa"[^>]*>.*?<span class="dp-ton">coince<\/span>/.test(html), 'le goulot dit « coince », en toutes lettres');
  assert.ok(html.includes(etat.services.prepa.auTravail + ' au travail / ' + etat.services.prepa.presents + ' présents'));
  assert.ok(/^<h3[^>]*>Les services<\/h3><ul class="dp-services"/.test(html));
  // Le détail d'un service : ses rubriques, dans l'ordre.
  const d = L.detail(U.lu, U.journee, 'prepa', t), detail = PN.detail(d);
  const rubriques = [...detail.matchAll(/<h4>([^<]*)<\/h4>/g)].map(m => m[1]);
  assert.deepEqual(rubriques, ['Ses personnes', 'Ses équipes', 'Ses lots à faire', 'Ses arrivages en attente', 'Ses personnes sans travail', 'Sa courbe de charge']);
  assert.ok(detail.includes('data-direct-retour') && detail.includes('Tous les services'));
  assert.ok(detail.includes('<b>Coince</b> — ' + d.pourquoi.replace(/’/g, '’')));
  assert.equal((detail.match(/<tr><th scope="row">/g) || []).length, d.equipes.length);
  assert.ok(detail.includes('<svg ') && detail.includes('class="dp-aire"') && detail.includes('class="dp-presents"') && detail.includes('class="dp-maintenant"'), 'sa courbe : une aire, un trait, l’heure rejouée');
  // Le panneau : le détail du service choisi, sinon la liste ; le vol suivi au-dessus.
  const suivi = L.suivi(U.journee, 'NO101');
  assert.ok(PN.rendu({ site: U.site, etat, tons, noms, selection: null, detail: null, suivi: null }).startsWith('<h3'));
  assert.ok(PN.rendu({ site: U.site, etat, tons, noms, selection: 'prepa', detail: d, suivi: null }).startsWith('<div class="dp-detail"'));
  const avec = PN.rendu({ site: U.site, etat, tons, noms, selection: null, detail: null, suivi });
  assert.ok(avec.startsWith('<div class="dp-suivi dp-critique"') && avec.includes('Vol suivi : NO101') && avec.includes('data-direct-nesuivre'));
  // Un nom de service, d'équipe, de commande ou de vol venu d'un fichier est échappé.
  const piege = '<img src=x onerror=alert(1)>', site = { zones: [{ id: 'z', services: ['s<1>'] }] };
  const liste = PN.services(site, { services: { 's<1>': { auTravail: 1, presents: 2, lots: 0 } } }, { 's<1>': { ton: 'critique', pourquoi: piege } }, { 's<1>': piege }, null);
  assert.ok(!liste.includes('<img') && liste.includes('&lt;img') && liste.includes('data-direct-service="s&lt;1&gt;"'));
  const dp = PN.detail({ ...d, nom: piege, pourquoi: piege, equipes: d.equipes.map(e => ({ ...e, nom: piege })), lots: d.lots.map(l => ({ ...l, libelle: piege, vol: piege })), arrivages: d.arrivages.map(a => ({ ...a, lot: piege })),
    sansTravail: { personnes: 1, attendait: [piege] } });
  assert.ok(!dp.includes('<img'), 'le détail n’insère aucune balise venue de l’unité');
  assert.ok(!PN.suivi({ vol: piege, phrase: piege, enRetard: true }).includes('<img'));
});

test('les étiquettes : le nom seul, en petit ; les chiffres pour la seule zone du goulot (ou survolée, ou choisie) ; la phrase du goulot se replie', () => {
  const t = U.lu.goulots[0].debut, etat = E.etatA(U.journee, t), zoneDuGoulot = U.site.zones.find(z => z.services.includes(U.lu.goulots[0].service)).id;
  // Sans zone demandée : toutes en petit, le nom seul (évolution 16, retouches).
  assert.ok(D.etiquettes(U.site, etat).every(e => e.compacte === true && e.lignes.length === 0), 'le nom seul, en petit');
  // Avec la zone du goulot : elle seule dit ses chiffres.
  const l = D.etiquettes(U.site, etat, null, [zoneDuGoulot]);
  let compactes = 0, pleines = 0;
  for (const [i, z] of U.site.zones.entries()) {
    const n = z.services.reduce((s, id) => { const x = etat.services[id]; return x ? { p: s.p + x.presents, a: s.a + x.auTravail, l: s.l + x.lots } : s; }, { p: 0, a: 0, l: 0 });
    assert.equal(l[i].titre, z.nom);
    if (z.id !== zoneDuGoulot) { assert.deepEqual(l[i].lignes, []); assert.equal(l[i].compacte, true, z.nom + ' : son nom seul, compacte'); compactes++; }
    else { assert.equal(l[i].lignes[0], n.a + ' au travail / ' + n.p + (n.p > 1 ? ' présents' : ' présent')); assert.equal(l[i].compacte, undefined); pleines++; }
  }
  assert.ok(compactes >= 4 && pleines === 1, 'une seule étiquette pleine (' + compactes + ', ' + pleines + ')');
  assert.ok(D.etiquettes(U.site, null, null, [zoneDuGoulot]).every(e => e.compacte === true && e.lignes.length === 0), 'sans journée : le nom seul');
  // Une phrase se replie aux espaces, en lignes d'au plus n caractères, sans perdre un mot.
  const phrase = U.lu.goulots[0].phrase, lignes = D.replier(phrase, 40);
  assert.ok(lignes.length >= 2 && lignes.every(x => x.length <= 40));
  assert.equal(lignes.join(' '), phrase);
  assert.deepEqual(D.replier('court', 40), ['court']);
  assert.deepEqual(D.replier('unmotbeaucouptroplongpourtenir ici', 10), ['unmotbeaucouptroplongpourtenir', 'ici']);
  // Une étiquette qui passe avant les autres prend sa place d'abord : les autres s'écartent.
  const C = require('../direct-camera.js'), ecran = { w: 800, h: 500, haut: 0, bas: 0, gauche: 0, droite: 0 };
  const deux = [{ id: 'a', ax: 400, ay: 200, w: 120, h: 40 }, { id: 'b', ax: 410, ay: 205, w: 200, h: 60, avant: 1 }];
  const poses = C.placerEtiquettes(deux, ecran), b = poses.find(p => p.id === 'b'), a = poses.find(p => p.id === 'a');
  assert.equal(b.decalee, false, 'celle qui passe avant garde sa place');
  assert.equal(a.decalee, true);
  assert.deepEqual(C.recouvrements(poses), []);
});

test('un service choisi sans aucune équipe n’est pas dans la scène : le panneau le dit, et propose d’en ajouter une', () => {
  const piege = '<img src=x onerror=alert(1)>';
  const html = PN.corps({ site: U.site, etat: E.etatA(U.journee, 400), tons: {}, noms: {}, selection: 'sans"equipe', detail: null, sansEquipe: { service: 'sans"equipe', nom: piege } });
  assert.match(html, /Aucune équipe ici/);
  assert.ok(html.includes('data-direct-retour'), 'de quoi revenir à tous les services');
  // Les mêmes actions que le panneau du plan dessiné : ajouter une équipe, ouvrir le service.
  assert.ok(html.includes('data-svc-action="equipe" data-svc="sans&quot;equipe"'), 'ajouter une équipe à ce service : ' + html);
  assert.ok(html.includes('data-mu-ouvrir="sans&quot;equipe"'), 'ouvrir sa fiche');
  assert.ok(!html.includes('<img') && html.includes('&lt;img'), 'son nom est échappé');
  // Sans journée à rejouer, le panneau le dit quand même.
  assert.match(PN.corps({ sansEquipe: { service: 'x', nom: 'Service fictif' } }), /Service fictif[\s\S]*Aucune équipe ici/);
  // Sans journée ni service choisi : il le dit, et mène à la description de l'unité, comme le panneau du plan dessiné.
  const vide = PN.corps(null);
  assert.match(vide, /Pas encore de journée à rejouer/);
  assert.ok(vide.includes('data-page="mu-pas"') && /Décrire votre unité/.test(vide), 'un bouton vers la description de l’unité : ' + vide);
  // Un service qui a des équipes garde son détail ; sans service choisi, rien de cela.
  const x = { site: U.site, etat: E.etatA(U.journee, 400), tons: L.tonsA(U.lu, U.journee, 400), noms: {}, selection: null, detail: null, sansEquipe: null };
  assert.ok(!PN.corps(x).includes('Aucune équipe ici'));
  const service = U.lu.goulots[0].service, d = L.detail(U.lu, U.journee, service, 400);
  assert.ok(!PN.corps({ ...x, selection: service, detail: d, sansEquipe: { service, nom: 'x' } }).includes('Aucune équipe ici'), 'le détail l’emporte');
});
