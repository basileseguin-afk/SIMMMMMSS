/* Correction 21 (c) — le poste de travail, pour tout un service d'un coup.
 * Le poste de travail (tables, trolleys, machine…) se réglait équipe par
 * équipe. La fiche d'un service a maintenant « Poste de travail de ses
 * équipes, dans la vue en direct » : laisser à chaque équipe, ou un poste. Le
 * choix s'applique aux équipes du service qui n'ont pas leur propre réglage ;
 * une équipe peut toujours avoir le sien. Sauvegardé avec les équipes ; sans
 * lui, la scène d'aujourd'hui.
 * Sans navigateur. Unité, équipes et services fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../moteur/site.js');
const D = require('../direct-scene.js');
const A = require('../ateliers.js');
const { REGIME, atelier, NOMS, CHEMIN, UNITE } = require('./site-unites.cjs');

// La cuisine a deux équipes ; l'une des deux a son propre réglage.
const ATELIERS = UNITE([atelier('cu2', 'cuisine', 'manuel', '13:00', 4), atelier('cu3', 'cuisine', 'manuel', '05:00', 2, { poste: 'tables' })]);
const generer = (ateliers, plus = {}) => S.generer({ ateliers, noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const postesDe = ilots => Object.fromEntries(ilots.map(i => [i.atelier, i.poste]));
const scene = (postes, plus) => { const site = generer(ATELIERS, plus), ateliers = D.avecPostes(ATELIERS, postes); return { site, ateliers, ilots: D.ilots(site, ateliers) }; };

test('le choix du service s’applique à ses équipes ; une équipe avec son propre réglage le garde', () => {
  const avant = scene(null), avec = scene({ cuisine: 'trolleys' });
  assert.deepEqual([postesDe(avant.ilots).cu, postesDe(avant.ilots).cu2, postesDe(avant.ilots).cu3], ['tables', 'tables', 'tables']);
  // Les deux équipes sans réglage prennent celui du service ; la troisième garde le sien.
  assert.deepEqual([postesDe(avec.ilots).cu, postesDe(avec.ilots).cu2, postesDe(avec.ilots).cu3], ['trolleys', 'trolleys', 'tables']);
  const cu = avec.ilots.find(i => i.atelier === 'cu'), cu3 = avec.ilots.find(i => i.atelier === 'cu3');
  assert.ok(cu.trolleys.length > 0 && cu.tables.length === 0, 'des trolleys, plus de tables');
  assert.ok(cu3.tables.length > 0 && cu3.trolleys.length === 0, 'ses tables à elle');
  // Les autres services ne changent pas : leurs îlots sont ceux d'avant, champ par champ.
  const autres = l => l.filter(i => i.service !== 'cuisine');
  assert.deepEqual(postesDe(autres(avec.ilots)), postesDe(autres(avant.ilots)));
  assert.deepEqual(autres(avec.ilots).map(i => [i.atelier, i.x, i.y, i.w, i.h]), autres(avant.ilots).map(i => [i.atelier, i.x, i.y, i.w, i.h]));
  // Chaque poste se choisit ; « aucun » : les personnes seules.
  for (const poste of D.POSTES) assert.equal(postesDe(scene({ cuisine: poste }).ilots).cu2, poste, poste);
  // « Une machine », dans un service qui n'en a pas : les personnes seules, comme pour une équipe réglée ainsi.
  const sansMachine = scene({ cuisine: 'machine' }).ilots.find(i => i.atelier === 'cu');
  assert.deepEqual([sansMachine.machines || 0, sansMachine.tables.length, sansMachine.trolleys.length], [0, 0, 0]);
  const seules = scene({ cuisine: 'aucun' }).ilots.find(i => i.atelier === 'cu');
  assert.deepEqual([seules.tables.length, seules.trolleys.length, seules.rangs.length, seules.places.length > 0], [0, 0, 0, true]);
  // Un service réglé sur « machine » : ses équipes sont aux machines de sa zone, s'il y en a (la plonge, à ses tunnels).
  const plonge = scene({ plonge: 'machine' }).ilots.find(i => i.atelier === 'pl');
  assert.equal(plonge.machines, 2);
});

test('les équipes que la vue dessine : la même liste sans réglage, des copies avec — les réglages ne sont pas touchés', () => {
  // Sans réglage du service (absent, vide, illisible, pour un autre service, ou un poste inconnu) : la liste elle-même.
  for (const vide of [undefined, null, {}, [], 'tables', 7, { inconnu: 'tables' }, { cuisine: 'canapés' }, { cuisine: '' }, { cuisine: null }, JSON.parse('{"__proto__":"tables","constructor":"tables"}')]) {
    assert.equal(D.avecPostes(ATELIERS, vide), ATELIERS, JSON.stringify(vide));
  }
  // Avec : une liste neuve, dans le même ordre ; seules les équipes concernées sont copiées, avec leur poste.
  const gel = JSON.stringify(ATELIERS), vus = D.avecPostes(ATELIERS, { cuisine: 'trolleys', armement: 'tables' });
  assert.notEqual(vus, ATELIERS);
  assert.deepEqual(vus.map(a => a.id), ATELIERS.map(a => a.id));
  assert.deepEqual(vus.filter(a => a.poste).map(a => [a.id, a.poste]), [['cu', 'trolleys'], ['ar', 'tables'], ['cu2', 'trolleys'], ['cu3', 'tables']]);
  for (const [i, a] of ATELIERS.entries()) if (!['cuisine', 'armement'].includes(a.service) || a.poste) assert.equal(vus[i], a, a.id + ' : la même équipe');
  assert.equal(JSON.stringify(ATELIERS), gel, 'les réglages des équipes ne sont pas touchés');
  // Sans équipes : rien.
  assert.deepEqual(D.avecPostes([], { cuisine: 'tables' }), []);
  assert.equal(D.avecPostes(null, { cuisine: 'tables' }), null);
});

test('sans réglage, le site et la scène d’aujourd’hui ; le site ne dépend pas du poste', () => {
  const site = generer(ATELIERS);
  assert.deepEqual(D.ilots(site, D.avecPostes(ATELIERS, null)), D.ilots(site, ATELIERS), 'les îlots d’avant, champ par champ');
  // Le site généré ne lit pas le réglage : il est le même, quel que soit le poste des services.
  assert.deepEqual(generer(ATELIERS, { postes: { cuisine: 'trolleys', magasin: 'tables' } }), site);
  assert.deepEqual(generer(D.avecPostes(ATELIERS, { cuisine: 'trolleys', magasin: 'tables' })), site);
  // Avec des rayonnages dans la zone (évolution 20 d) : un service réglé sur « rayonnages » travaille entre eux.
  const avec = scene({ cuisine: 'rayonnages' }, { rayonnages: { cuisine: true } }), cu = avec.ilots.find(i => i.atelier === 'cu');
  assert.equal(cu.poste, 'rayonnages');
  assert.equal(cu.rangs.length, 0, 'pas de rangs à elle : ceux de la zone');
  assert.ok(cu.allee !== undefined);
});

test('le réglage se sauvegarde avec les équipes ; une sauvegarde d’avant se relit sans lui', () => {
  const etat = { schema: 'ory-ateliers', version: 1, ateliers: ATELIERS, parcours: CHEMIN };
  assert.equal('postes' in A.valider(etat), false);
  const avec = A.valider({ ...etat, postes: { cuisine: 'trolleys', plonge: 'machine', armement: 'canapés', quais: '', dotation: 7, magasin: null } });
  assert.deepEqual(avec.postes, { cuisine: 'trolleys', plonge: 'machine' }, 'seulement un poste connu');
  assert.deepEqual(A.valider(JSON.parse(JSON.stringify(avec))).postes, { cuisine: 'trolleys', plonge: 'machine' });
  for (const vide of [{}, null, 'x', [], 3, { cuisine: 'sofa' }]) assert.equal('postes' in A.valider({ ...etat, postes: vide }), false, JSON.stringify(vide));
  // Les équipes ne portent rien de plus : celle qui a son réglage le garde, les autres n'en ont pas.
  assert.deepEqual(avec.ateliers, A.valider(etat).ateliers);
  assert.deepEqual(avec.ateliers.filter(a => a.poste).map(a => [a.id, a.poste]), [['cu3', 'tables']]);
});
