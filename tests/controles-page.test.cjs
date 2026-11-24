/* « Contrôles » (version 1, évolution 22 d) — deux pages et un panneau en un, sans navigateur : où mène chaque avis, le
 * nom de son bouton, la ligne d'état, les trois colonnes. Services, équipes, compagnies et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../avis.js');
const C = require('../controles-page.js');

const sources = () => ({
  anomalies: [
    { code: 'commande-absente', message: 'Montage : SUD/YC n’a aucun vol ce jour-là : elle n’est pas dans la journée.', service: 'montage', atelier: 'mo' },
    { code: 'handling-sans', message: '2 vols EST : aucun handling ne charge cette compagnie.', compagnie: 'EST', service: 'quais', atelier: 'h1' },
    { code: 'cycle', message: 'Le chemin « Complet » tourne en rond.' },
    { code: 'poste', message: 'Montage : le poste finit avant le travail.', service: 'montage', atelier: 'mo' },
    { code: 'bouchon', message: 'Plonge : 40 unités attendent à 14:00.', service: 'plonge' },
    { code: 'bareme', message: 'Dressage : aucun temps par vol pour « Dressage ».', service: 'dressage', atelier: 'dr' },
    { code: 'parcours-trou', message: '« Dotation » est sur le chemin de 2 commandes, mais aucune équipe ne l’y prépare.', service: 'dotation', classes: ['NO/BC', 'SU/BC'] },
    { code: 'hors-parcours', message: 'Montage bis : ZEN/YC est cochée ici, mais son chemin ne passe pas par « Montage bis ».', service: 'montage-bis', atelier: 'mob', classes: ['ZEN/YC'] }
  ],
  fantomes: [{ id: 'vieux', nom: 'Vieux service', cases: 2, chemins: 1 }],
  liens: [
    { texte: 'Quais ne livre à personne. Normal en bout de chaîne.', grave: false },
    { texte: 'Magasin fournit sans avoir d’équipe.', grave: true }
  ],
  etapes: [
    { id: 'vols', titre: 'Les vols de la journée', texte: 'Aucun vol : importez votre programme.', page: 'v-programme' },
    { id: 'flux', titre: 'Les chemins de production', texte: '3 commandes n’ont pas de chemin.', page: 'mu-flux' },
    { id: 'services', titre: 'Vos services et leurs équipes', texte: '…', page: 'mu-services', services: [{ id: 'cuisine', nom: 'Cuisine' }, { id: 'prepa', nom: 'Prépa' }] },
    { id: 'commandes', titre: 'Chaque commande a quelqu’un pour la préparer', texte: '2 commandes ne sont préparées par aucune équipe.', page: 'mu-services' }
  ]
});
const NOMS = { 'mu-services': 'Services et équipes', 'mu-flux': 'Chemins', 'u-liens': 'Liens entre services', 'j-chiffres': 'Synthèse', 'v-programme': 'Programme des vols' };
const nomPage = id => NOMS[id] || id;
const par = (l, debut) => l.find(p => p.titre.startsWith(debut));

test('chaque avis mène à la page et à l’endroit où il se règle', () => {
  const l = A.lister(sources());
  const d = debut => C.destination(par(l, debut));
  // Une étape du chemin que personne ne prépare : « Chemins », le tableau de l'étape, la première commande en évidence.
  assert.deepEqual(d('« Dotation »'), { page: 'mu-flux', service: 'dotation', commande: 'NO/BC' });
  // Un point d'une équipe : sa fiche. Un service sans temps par vol : la section des temps de sa fiche.
  assert.deepEqual(d('Montage bis'), { page: 'mu-services', equipe: 'mob', service: 'montage-bis' });
  assert.deepEqual(d('Dressage'), { page: 'mu-services', service: 'dressage', lieu: 'temps' });
  // Une compagnie qu'aucun handling ne charge : l'équipe du handling.
  assert.deepEqual(d('2 vols EST'), { page: 'mu-services', equipe: 'h1', service: 'quais' });
  // Un service supprimé encore cité : les services supprimés ; un avis des liens : « Liens entre services ».
  assert.deepEqual(d('« Vieux service »'), { page: 'mu-services', lieu: 'supprimes' });
  assert.deepEqual(d('Magasin'), { page: 'u-liens' });
  assert.deepEqual(d('Quais ne livre'), { page: 'u-liens' });
  // Le chemin qui tourne en rond : « Chemins ». Les étapes : leur page ; celle des services, le premier à compléter.
  assert.deepEqual(d('Le chemin'), { page: 'mu-flux' });
  assert.deepEqual(d('Les vols'), { page: 'v-programme' });
  assert.deepEqual(d('Les chemins de production'), { page: 'mu-flux' });
  assert.deepEqual(d('Vos services'), { page: 'mu-services', service: 'cuisine' });
  assert.deepEqual(d('Chaque commande'), { page: 'mu-services' });
  // Ce que la journée montre se lit dans la Synthèse ; une commande sans vol, dans la fiche de son équipe.
  assert.deepEqual(d('Montage : le poste'), { page: 'j-chiffres' });
  assert.deepEqual(d('Montage : SUD/YC'), { page: 'mu-services', equipe: 'mo', service: 'montage' });
  // Un avis qui ne mène nulle part ailleurs : pas de bouton.
  assert.equal(C.destination({ niveau: 'corriger', titre: 'x', page: 'mu-pas' }), null);
  assert.equal(C.destination(null), null);
  assert.equal(C.bouton({ niveau: 'corriger', titre: 'x', page: 'mu-pas' }, nomPage), null);
});

test('le bouton d’un avis porte le nom de sa destination : « Régler dans… » ; une information se lit : « Voir dans… »', () => {
  const l = A.lister(sources());
  const b = debut => C.bouton(par(l, debut), nomPage).texte;
  assert.equal(b('« Dotation »'), 'Régler dans Chemins');
  assert.equal(b('Montage bis'), 'Régler dans Services et équipes');
  assert.equal(b('Magasin'), 'Régler dans Liens entre services');
  assert.equal(b('Les vols'), 'Régler dans Programme des vols');
  assert.equal(b('Montage : le poste'), 'Voir dans Synthèse');
  assert.equal(b('Quais ne livre'), 'Voir dans Liens entre services');
  // Tous les avis de ce registre ont leur bouton.
  for (const p of l) assert.ok(C.bouton(p, nomPage), p.titre);
});

test('la ligne d’état : où en est le calcul, le dernier réglage changé et son heure', () => {
  assert.equal(C.etatDuCalcul(null), 'vide');
  assert.equal(C.etatDuCalcul({ ok: true, lots: [] }), 'vide');
  assert.equal(C.etatDuCalcul({ ok: true, lots: [{}] }), 'ok');
  assert.equal(C.etatDuCalcul({ ok: false, lots: [{}] }), 'arret');
  const a = new Date(2031, 2, 4, 9, 5).getTime(), plusTard = new Date(2031, 2, 4, 17, 0).getTime(), lendemain = new Date(2031, 2, 5, 8, 0).getTime();
  assert.equal(C.direDernier({ a, texte: 'Plonge livre maintenant Dotation, dans « Complet ».' }, plusTard), 'Dernier réglage changé à 09:05 : Plonge livre maintenant Dotation, dans « Complet ».');
  // Un autre jour : sa date. Sans annonce : ce que l'historique règle.
  assert.equal(C.direDernier({ a, texte: '', domaine: 'bareme' }, lendemain), 'Dernier réglage changé le 04/03 à 09:05 : les temps par vol et les réglages');
  assert.equal(C.direDernier({ a, domaine: 'inconnu' }, plusTard), 'Dernier réglage changé à 09:05.');
  assert.equal(C.direDernier(null, plusTard), 'Aucun réglage changé dans ce navigateur pour l’instant.');
  assert.equal(C.direDernier({ a: 'hier' }, plusTard), 'Aucun réglage changé dans ce navigateur pour l’instant.');
  // Une annonce très longue est coupée.
  assert.ok(C.direDernier({ a, texte: 'x'.repeat(400) }, plusTard).length < 200);
});

test('la page : la ligne d’état, puis trois colonnes — les mêmes avis, au même niveau', () => {
  const l = A.lister(sources());
  const html = C.html(l, { etat: 'ok', dernier: null, maintenant: 0, nomPage });
  assert.match(html, /<div class="ct-etat ok" data-ct-etat="ok"[^>]*>[^]*?Le calcul est à jour[^]*?Aucun réglage changé[^]*?data-page="j-chiffres">Voir la Synthèse →<\/button>/);
  const iB = html.indexOf('data-ct-niveau="bloquant"'), iC = html.indexOf('data-ct-niveau="corriger"'), iI = html.indexOf('data-ct-niveau="information"');
  assert.ok(iB > 0 && iB < iC && iC < iI, 'bloquant, à corriger, puis information');
  // Chaque colonne compte ses avis : ceux du registre, au même niveau.
  const n = A.parNiveau(l);
  assert.deepEqual(n, { bloquant: 3, corriger: 8, information: 4 });
  for (const [id, nom] of [['bloquant', 'Bloquant'], ['corriger', 'À corriger'], ['information', 'Information']]) {
    const col = html.slice(html.indexOf(`data-ct-niveau="${id}"`), id === 'information' ? undefined : html.indexOf('<section', html.indexOf(`data-ct-niveau="${id}"`)));
    assert.match(col, new RegExp('<span>' + nom + '</span><span class="ct-n">' + n[id] + '</span>'));
    assert.equal((col.match(/class="ct-point"/g) || []).length, n[id], nom + ' : un point par avis');
    for (const p of l.filter(x => x.niveau === id)) assert.ok(col.includes(p.titre.replace(/’/g, '’')), p.titre);
  }
  assert.deepEqual(C.colonnes(l).map(c => [c.niveau.id, c.avis.length]), [['bloquant', 3], ['corriger', 8], ['information', 4]]);
  // Les informations : trois d'emblée, les suivantes repliées (pas d'attribut open).
  const infos = html.slice(iI);
  assert.equal(C.INFOS_VISIBLES, 3);
  assert.match(infos, /<details class="ct-plus"><summary>1 autre information<\/summary>/);
  assert.equal((infos.slice(0, infos.indexOf('<details')).match(/class="ct-point"/g) || []).length, 3);
  assert.doesNotMatch(html, /<details[^>]* open/);
  // Chaque avis a son bouton, nommé par sa destination ; « C'est voulu » quand il en a un.
  assert.equal((html.match(/data-ct-aller=/g) || []).length, l.length);
  assert.match(html, /data-ct-page="mu-flux">Régler dans Chemins →<\/button>/);
  assert.match(html, /data-ct-page="j-chiffres">Voir dans Synthèse →<\/button>/);
  assert.equal((html.match(/data-ct-voulu=/g) || []).length, 1);
  assert.match(html, /data-ct-voulu="EST" aria-label="C’est voulu : pas de chargement pour cette compagnie \(EST\)"[^>]*>C’est voulu<\/button>/);
});

test('une colonne vide le dit en une phrase ; trois informations ou moins ne se replient pas', () => {
  const infos = A.lister({ anomalies: [{ code: 'commande-absente', message: 'Montage : SUD/YC n’a aucun vol ce jour-là.', service: 'montage' }] });
  const html = C.html(infos, { etat: 'vide', nomPage });
  assert.match(html, /data-ct-etat="vide"[^]*?Rien à calculer/);
  assert.match(html, /<section class="ct-niveau bloquant vide"[^]*?<span class="ct-n">0<\/span>[^]*?<p class="ct-vide">[^]*?Rien de bloquant : le calcul se fait, et chaque commande a une équipe pour la préparer\.<\/p>/);
  assert.match(html, /<section class="ct-niveau corriger vide"[^]*?<p class="ct-vide">[^]*?Rien à corriger\.<\/p>/);
  assert.doesNotMatch(html, /ct-plus/);
  assert.equal((html.match(/class="ct-point"/g) || []).length, 1);
  const vide = C.html([], { etat: 'arret', nomPage });
  assert.match(vide, /Le calcul est arrêté par un point bloquant/);
  assert.match(vide, /<section class="ct-niveau information vide"[^]*?Aucune information\./);
  assert.equal((vide.match(/class="ct-vide"/g) || []).length, 3);
  // Un état inconnu se lit comme « rien à calculer ».
  assert.match(C.html([], { etat: 'autre', nomPage }), /data-ct-etat="vide"/);
});

test('le texte venu d’un fichier est échappé avant d’entrer dans la page', () => {
  const l = A.lister({ anomalies: [{ code: 'bareme', message: '<img src=x onerror=alert(1)> : aucun temps par vol', service: 'a"b' },
    { code: 'handling-sans', message: '2 vols : aucun handling', compagnie: '"><b>X' }], fantomes: [{ id: 'f', nom: '<b>Faux</b>', cases: 1, chemins: 0 }] });
  const html = C.html(l, { etat: 'ok', dernier: { a: 0, texte: '<script>alert(2)</script>' }, maintenant: 0, nomPage: id => '<i>' + id + '</i>' });
  assert.doesNotMatch(html, /<img|<b>Faux|<i>|<script|"><b>X/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /data-ct-voulu="&quot;&gt;&lt;b&gt;X"/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('en lecture seule (évolution 23 d) : la page se lit en entier ; « Régler dans… » et « C’est voulu » sont grisés, avec leur raison', () => {
  const l = A.lister(sources());
  const base = { etat: 'ok', dernier: null, maintenant: 0, nomPage };
  const avant = C.html(l, base);
  // Hors lecture seule, rien ne change : la page d'avant, au caractère près, même si l'on dit quelles pages se ferment.
  assert.equal(C.html(l, { ...base, verrou: false, ferme: () => true, motFerme: 'Paramétrage verrouillé' }), avant);
  assert.doesNotMatch(avant, /disabled|ct-raison/);

  const FERMEES = new Set(['mu-services', 'mu-flux', 'u-liens', 'v-programme']);
  const html = C.html(l, { ...base, verrou: true, ferme: id => FERMEES.has(id), motFerme: 'Paramétrage verrouillé' });
  // La page se lit en entier : la ligne d'état, les trois colonnes, chaque point avec son titre et son détail.
  assert.match(html, /data-ct-etat="ok"[^]*?Le calcul est à jour[^]*?data-page="j-chiffres">Voir la Synthèse →<\/button>/);
  assert.equal((html.match(/class="ct-point"/g) || []).length, l.length);
  const sansGestes = h => h.replace(/<div class="ct-gestes">[^]*?<\/div>/g, '');
  assert.equal(sansGestes(html), sansGestes(avant), 'hors de ses boutons, la page est celle d’avant');
  // Chaque bouton qui mène à un réglage est grisé ; ceux qui mènent à un résultat marchent.
  const boutons = [...html.matchAll(/<button type="button" class="btn btn-sm[^"]*" data-ct-aller="(\d+)" data-ct-page="([^"]+)"([^>]*)>([^<]*)<\/button>/g)]
    .map(m => ({ i: +m[1], page: m[2], attrs: m[3], texte: m[4] }));
  assert.equal(boutons.length, l.length);
  assert.ok(boutons.some(b => FERMEES.has(b.page)) && boutons.some(b => !FERMEES.has(b.page)), 'des deux sortes');
  for (const b of boutons) {
    if (FERMEES.has(b.page)) assert.equal(b.attrs, ` disabled aria-describedby="ct-raison-${b.i}"`, b.texte);
    else assert.equal(b.attrs, '', b.texte + ' : un résultat, le bouton marche');
  }
  assert.match(html, /data-ct-page="mu-flux" disabled aria-describedby="ct-raison-\d+">Régler dans Chemins →<\/button>/);
  assert.match(html, /data-ct-page="j-chiffres">Voir dans Synthèse →<\/button>/);
  // « C'est voulu » change un réglage : grisé, toujours.
  assert.match(html, /data-ct-voulu="EST" disabled aria-describedby="ct-raison-(\d+)" aria-label=/);
  assert.equal((html.match(/data-ct-voulu=/g) || []).length, 1);
  // La raison, une fois par point qui a un bouton grisé, à la suite de ses boutons ; aucun point sans bouton grisé n'en a.
  const grises = new Set(boutons.filter(b => FERMEES.has(b.page)).map(b => b.i));
  const raisons = [...html.matchAll(/<small class="ct-raison" id="ct-raison-(\d+)">([^<]*)<\/small><\/div>/g)];
  assert.deepEqual(raisons.map(m => +m[1]).sort((a, b) => a - b), [...grises].sort((a, b) => a - b));
  for (const m of raisons) assert.equal(m[2], 'Paramétrage verrouillé');
  assert.equal(new Set(raisons.map(m => m[1])).size, raisons.length, 'un identifiant par raison');
  // Sans mot donné : celui de la lecture seule, par défaut.
  assert.match(C.html(l, { ...base, verrou: true, ferme: () => true }), /<small class="ct-raison" id="ct-raison-\d+">Paramétrage verrouillé<\/small>/);
  // Un avis dont le seul geste est « C'est voulu », sans destination fermée : sa raison est dite quand même.
  const un = A.lister({ anomalies: [{ code: 'handling-sans', message: '2 vols EST : aucun handling ne charge cette compagnie.', compagnie: 'EST', service: 'quais', atelier: 'h1' }] });
  const seul = C.html(un, { ...base, verrou: true, ferme: () => false });
  assert.match(seul, /data-ct-voulu="EST" disabled aria-describedby="ct-raison-0"/);
  assert.match(seul, /<small class="ct-raison" id="ct-raison-0">Paramétrage verrouillé<\/small>/);
  // Le texte venu d'un fichier reste échappé.
  const mal = A.lister({ anomalies: [{ code: 'handling-sans', message: '2 vols : aucun handling', compagnie: '"><b>X' }] });
  assert.doesNotMatch(C.html(mal, { ...base, verrou: true, ferme: () => true, motFerme: '<i>mot</i>' }), /"><b>X|<i>mot/);
});

test('évolution 24 (a) : un avis qui parle d’un lien de fournisseur mène au tableau « Qui se fournit où »', () => {
  const liste = A.lister({
    // Un fournisseur sans équipe, sur le chemin de ses clients : il se règle dans « Chemins › Fournisseurs ».
    anomalies: [{ code: 'parcours-trou', message: '« Réception » est sur le chemin de 2 commandes, mais aucune équipe ne l’y prépare.', service: 'reception', classes: ['NO/BC'], fournisseur: true },
      { code: 'parcours-trou', message: '« Dotation » est sur le chemin de 2 commandes, mais aucune équipe ne l’y prépare.', service: 'dotation', classes: ['NO/BC'] }],
    clientsEnPartie: 2
  });
  const trou = liste.find(p => /Réception/.test(p.titre)), autre = liste.find(p => /Dotation/.test(p.titre)), partie = liste.find(p => /en partie/.test(p.titre));
  assert.deepEqual(C.destination(trou), { page: 'mu-flux', lieu: 'fournisseurs' });
  assert.equal(C.bouton(trou, () => 'Chemins').texte, 'Régler dans Chemins › Fournisseurs');
  // Une étape qui n'est pas un fournisseur garde sa destination : son tableau, dans « Chemins ».
  assert.deepEqual(C.destination(autre), { page: 'mu-flux', service: 'dotation', commande: 'NO/BC' });
  assert.equal(C.bouton(autre, () => 'Chemins').texte, 'Régler dans Chemins');
  // Les clients réglés en partie : une information, qui se lit dans le tableau.
  assert.equal(partie.niveau, 'information');
  assert.equal(partie.titre, '2 clients réglés en partie');
  assert.deepEqual(C.destination(partie), { page: 'mu-flux', lieu: 'fournisseurs' });
  assert.equal(C.bouton(partie, () => 'Chemins').texte, 'Voir dans Chemins › Fournisseurs');
  assert.match(C.html(liste, { etat: 'ok', nomPage: () => 'Chemins' }), /Voir dans Chemins › Fournisseurs →/);
});
