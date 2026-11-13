/* Évolution 14 (d) — les autres pages des résultats, sans navigateur
 * (resultats-vue.js) : la couleur de la Synthèse suit l'état (un retard nul
 * n'est jamais critique), ses libellés, sa phrase de résumé ; la marge d'une
 * commande et son tri ; les couloirs des points de la frise des départs (le
 * numéro d'un vol en retard toujours écrit) ; le tri des stocks, l'échelle de
 * leurs petites courbes, une attente de plus de 24 h. Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const RV = require('../resultats-vue.js');

const K = { classesSuivies: 32, aHeure: 30, partAHeure: 94, enRetard: 2, retardMax: 25, volsSuivis: 12, volsCharges: 12, volsAHeure: 11, partVolsAHeure: 92,
  retardVolMax: 8, finDerniere: 1300, attenteTotale: 0, hommeHeures: 41.5 };

test('la Synthèse : la couleur suit l’état, pas la case ; un retard nul n’est jamais critique', () => {
  const s = RV.synthese(K);
  const carte = q => s.cles.find(c => c.q === q), ligne = q => s.groupes.flatMap(g => g.lignes).find(l => l[0] === q);
  assert.deepEqual(s.cles.map(c => c.q), ['Vols chargés à l’heure', 'Commandes prêtes à l’heure', 'Commande la plus en retard', 'Travail fourni']);
  assert.equal(carte('Vols chargés à l’heure').ton, 'retard', 'un vol en retard : l’état n’est pas bon');
  assert.equal(carte('Commande la plus en retard').ton, 'retard');
  assert.equal(carte('Commande la plus en retard').v, '25 min');
  assert.equal(ligne('Vol le plus en retard')[2], 'retard');
  assert.equal(ligne('Temps passé à attendre')[2], 'neutre', 'aucune attente : pas la couleur de l’attente');
  // Tout à l'heure : rien en couleur critique.
  const ok = RV.synthese({ ...K, aHeure: 32, enRetard: 0, retardMax: 0, volsAHeure: 12, retardVolMax: 0 });
  for (const c of ok.cles) assert.notEqual(c.ton, 'retard', c.q);
  for (const l of ok.groupes.flatMap(g => g.lignes)) assert.notEqual(l[2], 'retard', l[0] + ' : ' + l[1]);
  assert.equal(ok.cles.find(c => c.q === 'Commande la plus en retard').v, 'aucune');
  assert.equal(ok.cles.find(c => c.q === 'Commande la plus en retard').ton, 'ok');
  assert.equal(ok.cles.find(c => c.q === 'Vols chargés à l’heure').ton, 'ok');
  assert.equal(ok.groupes.flatMap(g => g.lignes).find(l => l[0] === 'Vol le plus en retard')[1], 'aucun');
  // Rien de suivi : neutre.
  const rien = RV.synthese({ classesSuivies: 0, aHeure: 0, hommeHeures: 0, attenteTotale: 0 });
  assert.equal(rien.cles.find(c => c.q === 'Commandes prêtes à l’heure').ton, 'neutre');
  assert.equal(rien.cles.find(c => c.q === 'Commande la plus en retard').v, '—');
});

test('la phrase de résumé', () => {
  assert.equal(RV.resume(K), '30 commandes à l’heure sur 32 ; 1 vol chargé en retard, de 8 min.');
  assert.equal(RV.resume({ ...K, volsAHeure: 9, retardVolMax: 70 }), '30 commandes à l’heure sur 32 ; 3 vols chargés en retard, jusqu’à 1 h 10.');
  assert.equal(RV.resume({ ...K, aHeure: 32, volsAHeure: 12 }), '32 commandes à l’heure sur 32 ; les 12 vols chargés à l’heure.');
  assert.equal(RV.resume({ ...K, volsCharges: 10, volsAHeure: 10 }), '30 commandes à l’heure sur 32 ; 2 vols pas chargés.');
  assert.equal(RV.resume({ classesSuivies: 1, aHeure: 1 }), '1 commande à l’heure sur 1.');
  assert.equal(RV.resume({ classesSuivies: 3, aHeure: 2, pasFinies: 1 }), '2 commandes à l’heure sur 3, 1 pas finie.');
  assert.equal(RV.resume({ classesSuivies: 0 }), 'Aucune commande suivie.');
});

test('la marge : prête avant − prête à ; le tri, de la plus petite à la plus grande', () => {
  assert.equal(RV.marge({ echeance: 600, fin: 540 }), 60);
  assert.equal(RV.marge({ echeance: 600, fin: 615.4 }), -15.4);
  assert.equal(RV.marge({ echeance: 600, fin: null }), null);
  assert.equal(RV.marge({ echeance: 600, absente: true }), null);
  assert.equal(RV.marge(undefined), null);
  assert.equal(RV.ecrireMarge(60), '+1 h 00', 'une heure et plus : en heures (évolution 15 c)');
  assert.equal(RV.ecrireMarge(-227), '−3 h 47');
  assert.equal(RV.ecrireMarge(45), '+45 min');
  assert.equal(RV.ecrireMarge(-15.4), '−15 min');
  assert.equal(RV.ecrireMarge(0.2), '0 min');
  assert.equal(RV.ecrireMarge(null), '—');
  const par = { a: { echeance: 600, fin: 540 }, b: { echeance: 600, fin: 615 }, c: { echeance: 300, fin: null }, d: { echeance: 700, fin: 690 } };
  assert.deepEqual(RV.trier(['a', 'b', 'c', 'd'].map(id => ({ id })), par, 'marge').map(c => c.id), ['b', 'd', 'a', 'c'], 'pas finie : à la fin');
  assert.deepEqual(RV.trier(['a', 'b', 'c', 'd'].map(id => ({ id })), par, 'marge', -1).map(c => c.id), ['a', 'd', 'b', 'c'], 'à l’envers, pas finie toujours à la fin');
  assert.deepEqual(RV.trier(['d', 'b', 'a'].map(id => ({ id, echeance: par[id].echeance })), par, 'avant').map(c => c.id), ['b', 'a', 'd']);
  // La barre : sa largeur suit la marge, sa couleur dit le signe.
  assert.deepEqual(RV.barreMarge(30, 60), { largeur: 50, signe: 'positive' });
  assert.deepEqual(RV.barreMarge(-60, 60), { largeur: 100, signe: 'negative' });
  assert.deepEqual(RV.barreMarge(0, 60), { largeur: 0, signe: 'nulle' });
  assert.equal(RV.barreMarge(null, 60), null);
});

test('la frise : des points de 10 px en couloirs ; le numéro d’un vol en retard toujours écrit, sans chevauchement', () => {
  const vols = [{ id: 'AB1', depart: 600 }, { id: 'AB2', depart: 601 }, { id: 'AB3', depart: 700 }, { id: 'LONG123', depart: 602 }];
  const etat = d => (d.id === 'LONG123' ? 'overdue' : d.id === 'AB2' ? 'late' : 'ready');
  const x = t => (t - 600) * 2;
  const p = RV.couloirs(vols, etat, x);
  assert.deepEqual(p.map(q => [q.d.id, q.ecrit]), [['AB1', false], ['AB2', true], ['LONG123', true], ['AB3', false]]);
  // Deux points d'un même couloir ne se touchent pas ; un numéro écrit ne touche pas le point suivant.
  for (const c of new Set(p.map(q => q.c))) {
    const l = p.filter(q => q.c === c).sort((a, b) => a.x - b.x);
    for (let i = 1; i < l.length; i++) assert.ok(l[i].x - 5 >= l[i - 1].fin, 'couloir ' + c);
  }
  assert.equal(p.find(q => q.d.id === 'AB3').c, 0, 'loin des autres : le premier couloir');
  assert.ok(RV.EN_RETARD.has('late') && RV.EN_RETARD.has('overdue') && !RV.EN_RETARD.has('ready'));
});

test('les stocks : le plus en stock d’abord ; l’échelle des petites courbes ; plus de 24 h signalé', () => {
  const liens = [{ repasMax: 40, dureeMax: 90 }, { repasMax: 120, dureeMax: 1500 }, { repasMax: 120, dureeMax: 30 }, { repasMax: 5, dureeMax: 1441 }];
  assert.deepEqual(RV.ordreStocks(liens, 'stock'), [1, 2, 0, 3], 'à égalité, l’ordre du moteur');
  assert.deepEqual(RV.ordreStocks(liens, 'long'), [1, 3, 0, 2]);
  assert.equal(RV.echelleStocks(liens), 'hauteur : de 0 à 120 repas');
  assert.deepEqual(liens.map(l => RV.plusDe24h(l)), [false, true, false, true]);
  // Évolution 15 (c) : le bouchon de la plonge, seulement s'il reste du sale le soir ou si l'attente passe le seuil.
  const S = require('../moteur/reponses.js').SEUILS_DEFAUT;
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: S.attenteLot }, S), false, 'une attente au seuil (6 h par défaut) : pas de bouchon');
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: S.attenteLot + 1 }, S), true);
  assert.equal(RV.bouchon({ resteSale: 0, attenteMax: 61 }, { ...S, attenteLot: 60 }), true, 'un seuil réglé à une heure');
  assert.equal(RV.bouchon({ resteSale: 3, attenteMax: 5 }, S), true, 'du sale reste le soir');
  assert.equal(RV.bouchon(null, S), false);
});
