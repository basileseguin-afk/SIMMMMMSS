/* Évolution 19 (c) — ce qui se supprime : les stockages du plan qui ne sont
 * rattachés à aucune zone et dont le contenu est vide. plan-menage.js les
 * retire ; un stockage rattaché ou renseigné ne change pas. Aucune donnée de
 * l'unité : des stockages fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../plan-menage.js');

const plan = () => ({ schema: 'ory-plan', version: 3, backgroundOpacity: 0.85,
  zones: [{ id: 'cuisine', nom: 'Cuisine', kind: 'service', x: 0, y: 0, w: 10, h: 10, storages: [{ id: 's1', nom: 'Frigo', contenu: '' }, { id: 's2', nom: 'Réserve', contenu: 'Conserves' }] }],
  unassignedStorages: [{ id: 'storage-0', nom: 'Chambre froide 1', contenu: '' }, { id: 'storage-1', nom: 'Chambre froide 2', contenu: 'Laitages' },
    { id: 'storage-2', nom: 'Local 3', contenu: '   ' }] });

test('un stockage non rattaché et vide est retiré ; un stockage rattaché ou renseigné ne change pas', () => {
  const p = plan(), fige = JSON.stringify(p), r = M.sansStockagesVides(p);
  assert.equal(r.retires, 2, 'les deux vides (un contenu d’espaces est vide)');
  assert.deepEqual(r.plan.unassignedStorages, [{ id: 'storage-1', nom: 'Chambre froide 2', contenu: 'Laitages' }]);
  assert.equal(JSON.stringify(p), fige, 'le plan donné n’est pas modifié');
  assert.equal(r.plan.zones, p.zones, 'les zones et leurs stockages — même vides — sont les mêmes');
  assert.deepEqual(Object.keys(r.plan), Object.keys(p), 'les mêmes clés, dans le même ordre');
});

test('rien à retirer : le même plan ; un plan sans liste ou illisible est rendu tel quel', () => {
  const p = plan(); p.unassignedStorages = [p.unassignedStorages[1]];
  const r = M.sansStockagesVides(p);
  assert.equal(r.plan, p); assert.equal(r.retires, 0);
  const sans = { schema: 'ory-plan', version: 3, zones: [] };
  assert.deepEqual(M.sansStockagesVides(sans), { plan: sans, retires: 0 });
  assert.deepEqual(M.sansStockagesVides(null), { plan: null, retires: 0 });
  assert.deepEqual(M.sansStockagesVides({ unassignedStorages: [] }).retires, 0);
  // Une seconde passe ne retire plus rien.
  const une = M.sansStockagesVides(plan()).plan;
  assert.equal(M.sansStockagesVides(une).plan, une);
});

test('la phrase de l’avis : « n stockages vides retirés du plan »', () => {
  assert.equal(M.phrase(3), '3 stockages vides retirés du plan');
  assert.equal(M.phrase(1), '1 stockage vide retiré du plan');
  assert.equal(M.phrase(0), '');
  assert.equal(M.estVide({ id: 'x', nom: 'A', contenu: 'Épices' }), false);
  assert.equal(M.estVide({ id: 'x', nom: 'A', contenu: '' }), true);
});
