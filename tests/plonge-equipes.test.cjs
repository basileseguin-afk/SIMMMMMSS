/* Une plonge par vol à deux équipes (matin, soir) : elles se partagent les vols
 * revenus. Chaque équipe lavait TOUS les vols : le travail et le matériel propre
 * étaient comptés deux fois (trouvé avec le jeu d'essai du 29/09). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');

const h = s => P.minutes(s);
const VOLS = ['06:00', '07:00', '12:00', '16:00', '18:00'].map((t, i) => ({ id: 'AF' + i, cie: 'AF', sens: 'DEP', std: h(t), bc: 0, pc: 0, yc: 100 }));
const equipe = (id, nom, debut, p) => ({ id, nom, service: 'plonge', type: 'lavage', debut, jour: 0, personnes: 2, pauses: [], lots: [],
  regime: { actif: true, presence: 480 }, parVol: true, durees: { '*': 60 }, tunnels: [{ nom: 'T1', debit: 300, personnes: 2, actif: true }], ...p });
const jouer = ateliers => P.simuler({ vols: VOLS, liaisons: [], rendement: 1, ateliers,
  materiel: { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } } });
const laves = (r, id) => r.lots.filter(l => l.retourVol && l.atelier === id && l.fin != null);

test('deux équipes de plonge : chaque vol n’est lavé qu’une fois', () => {
  const r = jouer([equipe('m', 'Matin', '05:00'), equipe('s', 'Soir', '13:00')]);
  const tous = r.lots.filter(l => l.retourVol && l.fin != null);
  assert.equal(tous.length, 5, 'cinq vols revenus, cinq lavages');
  assert.equal(new Set(tous.map(l => l.vol)).size, 5, 'aucun vol lavé deux fois');
  assert.equal(r.materiel.lavees, 50, 'le propre n’est pas compté deux fois');
  // Le matin lave ce qu'il a le temps de finir avant son départ (13:00) ; le vol
  // revenu à 12:30 (une heure de tunnel) passe à l'équipe du soir, dès 13:00.
  assert.deepEqual(laves(r, 'm').map(l => l.vol), ['AF0 (J-1)', 'AF1 (J-1)']);
  assert.deepEqual(laves(r, 's').map(l => [l.vol, P.hhmm(l.debut)]), [['AF2 (J-1)', '13:00'], ['AF3 (J-1)', '16:30'], ['AF4 (J-1)', '18:30']]);
});

test('un vol revenu après toutes les équipes est dit à celle du soir', () => {
  const r = jouer([equipe('m', 'Matin', '05:00', { regime: { actif: true, presence: 300 } }), equipe('s', 'Soir', '10:00', { regime: { actif: true, presence: 420 } })]);
  const non = r.lots.filter(l => l.retourVol && l.fin == null);
  assert.ok(non.length >= 1, 'le vol de 18:30 n’est pas lavé (soir fini à 17:00)');
  assert.ok(non.every(l => l.atelier === 's'), 'c’est l’équipe du soir qui le porte, pas celle du matin');
});

test('une seule équipe : rien ne change', () => {
  const r = jouer([equipe('m', 'Matin', '05:00', { regime: { actif: false } })]);
  assert.equal(laves(r, 'm').length, 5);
  assert.equal(r.materiel.lavees, 50);
});

/* Les tunnels sont des machines (retour d'usage du 15/10 : « l'équipe de plonge
 * fait l'après-midi, j'ajoute celle du matin »). Deux équipes qui se chevauchent
 * et ont un tunnel du même nom se le passent : il ne lave qu'un vol à la fois. */
const RELEVE = ['11:45', '11:50'].map((t, i) => ({ id: 'TX' + i, cie: 'TX', sens: 'DEP', std: h(t), bc: 0, pc: 0, yc: 100 }));
const relayer = (tunnelSoir, p) => P.simuler({ vols: RELEVE, liaisons: [], rendement: 1, ateliers: [
  equipe('m', 'Matin', '05:00', { durees: { '*': 30 } }),
  equipe('s', 'Soir', '12:00', { durees: { '*': 30 }, tunnels: [{ nom: tunnelSoir, debit: 300, personnes: 2, actif: true }] })],
  materiel: { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } }, ...p });
const plage = (r, vol) => { const l = r.lots.find(x => x.retourVol && x.vol.startsWith(vol)); return [l.atelier, P.hhmm(l.debut), P.hhmm(l.fin)]; };

test('deux équipes qui se chevauchent, un même tunnel : il lave un vol à la fois', () => {
  const r = relayer('T1');
  // 12:15 : le matin le prend (il finit à 12:45, avant son départ de 13:00).
  assert.deepEqual(plage(r, 'TX0'), ['m', '12:15', '12:45']);
  // 12:20 : le tunnel est pris ; le soir attend qu'il sorte, à 12:45.
  assert.deepEqual(plage(r, 'TX1'), ['s', '12:45', '13:15']);
  assert.equal(r.plonge.tunnels, 1, 'une seule machine, pas deux');
});

test('deux tunnels de noms différents : deux machines, deux vols en même temps', () => {
  const r = relayer('T2');
  assert.deepEqual(plage(r, 'TX0'), ['m', '12:15', '12:45']);
  assert.deepEqual(plage(r, 'TX1'), ['s', '12:20', '12:50']);
  assert.equal(r.plonge.tunnels, 2);
});

test('le nom d’un tunnel se lit sans casse ni espaces en trop ; dans une équipe, deux homonymes restent deux machines', () => {
  const eq = (id, noms) => ({ id, tunnels: noms.map(nom => ({ nom, personnes: 1, actif: true })) });
  const a = eq('a', ['Tunnel 1', 'Tunnel 1']), b = eq('b', [' tunnel  1 ']);
  assert.deepEqual(P.machinesDesTunnels(a, a.tunnels), ['tunnel:tunnel 1#0', 'tunnel:tunnel 1#1']);
  assert.deepEqual(P.machinesDesTunnels(b, b.tunnels), ['tunnel:tunnel 1#0']);
  // Sans liste de tunnels, l'équipe a le sien, que personne ne partage.
  assert.deepEqual(P.machinesDesTunnels({ id: 'c' }, [{ nom: 'Tunnel' }]), ['equipe:c#0']);
});

test('des équipes qui lavent par vol et au débit dans la même plonge : on le dit, la journée se calcule', () => {
  const r = P.simuler({ vols: VOLS, liaisons: [], rendement: 1, ateliers: [equipe('m', 'Matin', '05:00'), equipe('s', 'Soir', '13:00', { parVol: false })],
    materiel: { actif: true, delaiRetour: 30, retours: 'j1', stockInitial: 0, unites: { YC: { parVol: 10 } } } });
  assert.equal(r.ok, true);
  const a = r.anomalies.find(x => x.code === 'plonge-mixte');
  assert.ok(a, 'une anomalie plonge-mixte');
  assert.match(a.message, /« Matin » par vol, « Soir » au débit/);
});

test('150 plonges au hasard (v1, et v2 avec heures sup) : un tunnel lave un vol à la fois, un vol est lavé au plus une fois', () => {
  const { VOLS: DEMO } = require('../vols-demo.js');
  let graine = 20261015; const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const choix = l => l[Math.floor(alea() * l.length)];
  const hh = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  for (const [nom, M] of [['v1', P], ['v2', require('../v2/moteur/production.js')]]) {
    for (let e = 0; e < 150; e++) {
      const ateliers = Array.from({ length: choix([2, 2, 3]) }, (_, i) => equipe('pl' + i, 'Plonge ' + i, hh(choix([0, 4, 5, 6, 8, 10, 12, 13, 14, 18]) * 60 + choix([0, 30])), {
        jour: choix([0, 0, -1, 1]), personnes: choix([1, 2, 3]), regime: { actif: true, presence: choix([300, 480, 600]) }, durees: { '*': choix([20, 40, 60]) },
        tunnels: Array.from({ length: choix([1, 2, 3]) }, () => ({ nom: choix(['T1', 'T2', 'T3']), personnes: 1, actif: true, ...(alea() < 0.3 ? { vitesse: 2 } : {}) })) }));
      const r = M.simuler({ vols: DEMO, liaisons: [], rendement: 1, ateliers, ...(nom === 'v2' && alea() < 0.5 ? { heuresSup: { actif: true, plafond: 60 } } : {}),
        materiel: { actif: alea() < 0.5, delaiRetour: 30, retours: choix(['programme', 'j1']), stockInitial: 0 } });
      const cles = new Map(ateliers.map(x => [x.id, M.machinesDesTunnels(x, M.tunnelsQuiTournent(x).tournent)]));
      const laves = r.lots.filter(l => l.retourVol && l.fin != null);
      assert.equal(new Set(laves.map(l => l.vol)).size, laves.length, nom + ', journée ' + e + ' : un vol lavé deux fois');
      const parMachine = new Map();
      for (const l of laves) { const k = cles.get(l.atelier)[l.tunnel - 1]; (parMachine.get(k) || parMachine.set(k, []).get(k)).push(l); }
      for (const [k, ls] of parMachine) {
        ls.sort((x, y) => x.debut - y.debut);
        for (let i = 1; i < ls.length; i++) assert.ok(ls[i].debut >= ls[i - 1].fin - 1e-9,
          nom + ', journée ' + e + ' : ' + k + ' lave deux vols à la fois (' + ls[i - 1].vol + ' et ' + ls[i].vol + ')');
      }
    }
  }
});
