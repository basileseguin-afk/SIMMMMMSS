/* Le temps entre deux ateliers : ce qui attend est en stock, et se compte.
 * Et à la plonge : quand les retours arrivent plus vite que les tunnels ne
 * lavent, une file se forme — un bouchon — qui se mesure. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const VOLS = [{ id: 'TX9', cie: 'TX', sens: 'DEP', std: 14 * 60, bc: 12, pc: 0, yc: 0 }];
const CHEMIN = { id: 'c', nom: 'Complet TX BC', noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] };
const at = (id, service, debut, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots: [['TX/BC']], ...p });
const jouer = ateliers => P.simuler({ vols: VOLS, liaisons: [], bareme: { cuisine: { '*/BC': 60 }, prepa: { '*/BC': 30 } }, rendement: 1,
  parcours: [CHEMIN], parcoursCabine: {}, parcoursClasse: { 'TX/BC': 'c' }, ateliers });

test('la cuisine finit tôt, la prépa commence tard : TX BC est en stock entre les deux', () => {
  const r = jouer([at('cu', 'cuisine', '05:00'), at('pr', 'prepa', '09:00')]);
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const cu = r.lots.find(l => l.service === 'cuisine'), pr = r.lots.find(l => l.service === 'prepa');
  assert.equal(pr.debut, 9 * 60, 'la prépa commence à son heure');
  const s = r.stocks.sejours.find(x => x.de === 'cuisine' && x.vers === 'prepa');
  assert.ok(s, 'le séjour en stock est compté');
  assert.equal(s.entree, cu.fin); assert.equal(s.sortie, 9 * 60);
  assert.equal(s.duree, 9 * 60 - cu.fin, 'le delta entre la fin de la cuisine et le début de la prépa');
  assert.equal(s.repas, 12, 'autant de repas que de passagers');
  const lien = r.stocks.parLien.find(l => l.id === 'cuisine>prepa');
  assert.equal(lien.repasMax, 12); assert.equal(lien.dureeMax, s.duree); assert.equal(lien.classeMax, 'TX/BC');
  // Le niveau du stock devant la prépa, dans le temps.
  const serie = r.stocks.parService.prepa;
  assert.equal(P.niveauA(serie, cu.fin - 1), 0);
  assert.equal(P.niveauA(serie, cu.fin + 10), 12);
  assert.equal(P.niveauA(serie, 9 * 60), 0, 'la prépa l’a pris');
  // Prête avant le chargement : elle attend l'avion, en stock aussi.
  const c = r.stocks.sejours.find(x => x.vers === 'chargement');
  assert.ok(c); assert.equal(c.de, 'prepa'); assert.equal(c.entree, pr.fin); assert.equal(c.sortie, r.parClasse['TX/BC'].echeance);
  assert.equal(P.dureeLisible(125), '2 h 05'); assert.equal(P.dureeLisible(45), '45 min');
});

test('une commande livrée par deux services ne compte qu’une fois devant le suivant', () => {
  const deux = { ...CHEMIN, noeuds: ['cuisine', 'magasin', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }, { de: 'magasin', vers: 'prepa' }] };
  const r = P.simuler({ vols: VOLS, liaisons: [], bareme: { cuisine: { '*/BC': 60 }, magasin: { '*/BC': 10 }, prepa: { '*/BC': 30 } }, rendement: 1,
    parcours: [deux], parcoursCabine: {}, parcoursClasse: { 'TX/BC': 'c' },
    ateliers: [at('cu', 'cuisine', '05:00'), at('ma', 'magasin', '04:00'), at('pr', 'prepa', '09:00')] });
  assert.equal(r.stocks.parLien.length, 3, 'cuisine → prépa, magasin → prépa, prépa → chargement');
  assert.equal(P.niveauA(r.stocks.parService.prepa, 8 * 60), 12, '12 repas, pas 24');
  assert.equal(P.niveauA(r.stocks.parService.prepa, 4 * 60 + 30), 12, 'en stock dès la première livraison (le magasin)');
});

test('la prépa attend la cuisine : pas de stock entre les deux, de l’attente', () => {
  const r = jouer([at('cu', 'cuisine', '05:00'), at('pr', 'prepa', '04:00')]);
  const pr = r.lots.find(l => l.service === 'prepa');
  assert.ok(pr.attente > 0, 'c’est la prépa qui attend');
  assert.equal(r.stocks.sejours.filter(x => x.vers === 'prepa').length, 0, 'rien ne dort en stock');
});

/* Trois vols reviennent en vingt minutes, 400 unités chacun ; la plonge lave 300 u/h. */
const RETOURS = [0, 10, 20].map((m, i) => ({ id: 'R' + i, cie: 'CRL', sens: 'RET', sta: 6 * 60 + m, bc: 0, pc: 0, yc: 100 }));
const MAT = { actif: true, unites: { YC: { parVol: 400 } }, stockInitial: 0, delaiRetour: 0 };
const PLONGE = { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1,
  lots: [], regime: { actif: false }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] };

test('les retours s’enchaînent plus vite que le tunnel : un bouchon se forme, et se mesure', () => {
  const r = P.simuler({ vols: RETOURS, liaisons: [], materiel: MAT, ateliers: [PLONGE] });
  assert.equal(r.ok, true, JSON.stringify(r.anomalies));
  const p = r.plonge;
  assert.equal(p.capacite, 300);
  assert.equal(p.retours.length, 3);
  assert.deepEqual(p.heures, [{ t: 360, u: 1200 }], '1 200 u reviennent entre 06:00 et 07:00');
  assert.deepEqual(p.depassements, [{ de: 360, a: 420 }], 'le débit d’entrée dépasse celui du tunnel');
  assert.ok(p.max >= 800, 'jusqu’à ' + p.max + ' u sales en attente');
  assert.ok(p.attenteMax > 60, 'du matériel attend plus d’une heure : ' + p.attenteMax);
  assert.ok(p.attenteMoy > 0 && p.attenteMoy < p.attenteMax);
  const n = t => P.niveauLineaire(p.serie, t);
  assert.ok(n(6 * 60 + 20) >= 800, 'le sale pas lavé monte pendant les retours');
  assert.ok(n(8 * 60) < n(6 * 60 + 20) && n(8 * 60) > 0, 'et baisse au rythme du tunnel');
  assert.ok(Math.abs(n(8 * 60) - (1200 - 300 * 2)) < 1, '300 u lavées par heure depuis 06:00');
  assert.equal(n(13 * 60), 0, 'jusqu’à ce que la plonge ait rattrapé');
  assert.ok(Math.abs(p.attenteMax - (4 * 60 - 20)) < 1, 'le dernier revenu (06:20) sort du tunnel à 10:00');
  assert.equal(p.resteSale, 0);
  assert.ok(r.anomalies.some(a => a.code === 'bouchon' && /Bouchon à la plonge/.test(a.message)), 'le bouchon est signalé');
});

test('des retours espacés, un tunnel qui suit : pas de bouchon', () => {
  const espaces = [0, 120, 240].map((m, i) => ({ ...RETOURS[i], sta: 6 * 60 + m }));
  const r = P.simuler({ vols: espaces, liaisons: [], materiel: { ...MAT, unites: { YC: { parVol: 100 } } }, ateliers: [PLONGE] });
  assert.deepEqual(r.plonge.depassements, []);
  assert.ok(r.plonge.attenteMax <= 20 + 1e-6, 'chaque retour est lavé dès son arrivée : au plus ses 20 min de tunnel');
  assert.equal(r.anomalies.filter(a => a.code === 'bouchon').length, 0);
});

test('sans boucle du matériel, pas de file à suivre', () => {
  const r = jouer([at('cu', 'cuisine', '05:00')]);
  assert.equal(r.plonge, null);
});
