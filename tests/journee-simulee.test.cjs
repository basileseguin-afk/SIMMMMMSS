/* Ce qu'une journée complète, jouée de bout en bout (34 commandes, cuisine à
 * J-1, plonge, dotation, montage), a montré : chaque test garde un défaut
 * trouvé ce jour-là pour qu'il ne revienne pas (BUGS.md, BUG-030 à 036). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const at = (id, service, debut, lots, p) => ({ id, nom: id, service, type: 'manuel', debut, jour: 0, personnes: 1, lots, ...p });

test('une heure arrondie à la minute ne s’écrit jamais « 03:60 »', () => {
  assert.equal(P.hhmm(59.6), '01:00');
  assert.equal(P.hhmm(3 * 60 + 59.5), '04:00');
  assert.equal(P.hhmm(-0.4), '00:00', 'une fraction avant minuit reste le jour J');
  assert.equal(P.hhmm(-600), 'J-1 14:00');
});

test('une plonge, un magasin ou un robot n’ont pas besoin de barème : aucune alerte', () => {
  const vols = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 10 * 60, bc: 10, pc: 0, yc: 0 }];
  const r = P.simuler({ vols, liaisons: [], bareme: { prepa: { '*/BC': 30 } }, rendement: 1,
    ateliers: [
      at('pr', 'prepa', '05:00', [['TX/BC']]),
      { id: 'ma', nom: 'Magasin', service: 'magasin', type: 'dispo', debut: '04:00', jour: 0, personnes: 0, lots: [] },
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1, lots: [],
        regime: { actif: false }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] }
    ] });
  assert.equal(r.anomalies.filter(a => a.code === 'bareme').length, 0, JSON.stringify(r.anomalies));
});

/* La dotation manque de matériel propre : elle reste bloquée sur TX BC. La
 * prépa, derrière elle, n'en voit jamais la couleur. */
const VOLS = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 10 * 60, bc: 10, pc: 0, yc: 0 }];
const CHEMIN = { id: 'c', nom: 'Complet TX BC', noeuds: ['dotation', 'prepa'], liens: [{ de: 'dotation', vers: 'prepa' }] };
const jourBloque = () => P.simuler({ vols: VOLS, liaisons: [], rendement: 1,
  bareme: { dotation: { '*/BC': 10 }, prepa: { '*/BC': 30 } },
  materiel: { actif: true, unites: { BC: { parVol: 50 } }, stockInitial: 0, delaiRetour: 0 },
  parcours: [CHEMIN], parcoursCabine: {}, parcoursClasse: { 'TX/BC': 'c' },
  ateliers: [at('do', 'dotation', '04:00', [['TX/BC']], { materiel: 'consomme' }), at('pr', 'prepa', '05:00', [['TX/BC']])] });

test('une commande que la prépa ne voit jamais n’est pas « prête à l’heure »', () => {
  const r = jourBloque();
  assert.equal(r.ok, true);
  const c = r.parClasse['TX/BC'];
  assert.equal(c.fin, null, 'pas prête : la prépa ne l’a jamais eue');
  assert.equal(c.aHeure, false);
  assert.equal(r.indicateurs.aHeure, 0);
  const a = r.anomalies.find(x => x.code === 'inacheve' && x.atelier === 'pr');
  assert.ok(a, 'la prépa est nommée : ' + JSON.stringify(r.anomalies));
  assert.match(a.message, /^pr ne prépare jamais TX · Business : l’équipe attend toujours TX · Business de « dotation »/);
  assert.match(a.message, /pas prêtes/);
  assert.ok(r.anomalies.some(x => x.code === 'materiel' && x.atelier === 'do'), 'la cause, le matériel, est dite aussi');
});

test('la dernière commande prête ne compte pas la plonge qui lave le soir', () => {
  const vols = [{ id: 'TX1', cie: 'TX', sens: 'DEP', std: 10 * 60, bc: 10, pc: 0, yc: 0 },
    { id: 'R1', cie: 'CRL', sens: 'RET', sta: 18 * 60, bc: 0, pc: 0, yc: 100 }];
  const r = P.simuler({ vols, liaisons: [], rendement: 1, bareme: { prepa: { '*/BC': 30 } },
    materiel: { actif: true, unites: { YC: { parVol: 100 } }, stockInitial: 1000, delaiRetour: 0 },
    ateliers: [at('pr', 'prepa', '05:00', [['TX/BC']]),
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1, lots: [],
        regime: { actif: false }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] }] });
  assert.ok(r.plonge.retours.length, 'la plonge lave bien le retour de 18:00');
  assert.equal(r.indicateurs.finDerniere, r.parClasse['TX/BC'].fin, 'la dernière commande : la prépa, le matin');
  assert.ok(r.indicateurs.finDerniere < 6 * 60);
});

test('une plonge fermée avant les derniers retours : ce n’est pas un bouchon, c’est une fermeture', () => {
  const vols = [0, 10].map((m, i) => ({ id: 'R' + i, cie: 'CRL', sens: 'RET', sta: 7 * 60 + m, bc: 0, pc: 0, yc: 100 }))
    .concat([{ id: 'R9', cie: 'CRL', sens: 'RET', sta: 15 * 60, bc: 0, pc: 0, yc: 100 }]);
  const r = P.simuler({ vols, liaisons: [], rendement: 1,
    materiel: { actif: true, unites: { YC: { parVol: 100 } }, stockInitial: 0, delaiRetour: 0 },
    ateliers: [{ id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '06:00', jour: 0, personnes: 1, lots: [],
      regime: { actif: true, presence: 6 * 60 }, tunnels: [{ nom: 'T1', debit: 600, personnes: 1, actif: true }] }] });
  const p = r.plonge;
  assert.equal(p.fermeture, 12 * 60, 'le poste finit à 12:00');
  assert.equal(p.apresFermeture, 100, 'le retour de 15:00 arrive plateau fermé');
  assert.ok(p.attenteMax < 60, 'l’attente ne compte que ce qui a été lavé : ' + p.attenteMax);
  assert.equal(r.anomalies.filter(a => a.code === 'bouchon').length, 0, 'pas de faux bouchon');
  const f = r.anomalies.find(a => a.code === 'plonge-fermee');
  assert.ok(f, JSON.stringify(r.anomalies));
  assert.match(f.message, /100 u reviennent après la fin du poste de la plonge \(12:00\)/);
});

test('dans la frise d’une commande, la plonge « sert tout le monde » : elle n’est pas sautée', () => {
  const PC = require('../parcours.js');
  const chemin = { id: 'c', nom: 'C', noeuds: ['plonge', 'dotation', 'prepa'],
    liens: [{ de: 'plonge', vers: 'dotation' }, { de: 'dotation', vers: 'prepa' }] };
  const r = P.simuler({ vols: VOLS, liaisons: [], rendement: 1, bareme: { dotation: { '*/BC': 10 }, prepa: { '*/BC': 30 } },
    parcours: [chemin], parcoursCabine: {}, parcoursClasse: { 'TX/BC': 'c' },
    ateliers: [at('do', 'dotation', '04:00', [['TX/BC']]), at('pr', 'prepa', '05:00', [['TX/BC']]),
      { id: 'pl', nom: 'Plonge', service: 'plonge', type: 'lavage', debut: '05:00', jour: 0, personnes: 1, lots: [],
        regime: { actif: false }, tunnels: [{ nom: 'T1', debit: 300, personnes: 1, actif: true }] }] });
  const g = PC.chronogramme(r, chemin, 'TX/BC');
  const pl = g.etapes.find(e => e.service === 'plonge');
  assert.equal(pl.absent, false, 'pas « sautée, sans équipe »');
  assert.equal(pl.commun, true);
  assert.equal(g.etapes.find(e => e.service === 'dotation').absent, false);
});
