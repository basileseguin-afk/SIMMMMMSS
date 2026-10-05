/* Choisir le chemin d'une commande (05/10) : PC.choisirChemin et PC.cheminsPossibles. v1 et v2. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [dossier, v] of [['..', 'v1'], ['../v2', 'v2']]) {
  globalThis.MoteurProduction = require(dossier + '/moteur/production.js');
  const PC = require(dossier + '/parcours.js');
  const etat = () => ({ parcoursCabine: { YC: 'eco', BC: 'complet' }, parcoursClasse: { 'FWI/BC': 'fwi' },
    parcours: [{ id: 'complet', nom: 'Complet', type: true, noeuds: ['cuisine', 'prepa'], liens: [{ de: 'cuisine', vers: 'prepa' }] },
      { id: 'eco', nom: 'Sans cuisine', type: true, noeuds: ['prepa'], liens: [] },
      { id: 'robot', nom: 'Économie robot', type: true, noeuds: ['magasin', 'prepa'], liens: [{ de: 'magasin', vers: 'prepa' }] },
      { id: 'fwi', nom: 'Chemin de FWI', noeuds: ['prepa'], liens: [] }] });

  test(v + ' — la liste : flux, et chemins à part avec leur commande', () => {
    const l = PC.cheminsPossibles(etat(), 'AF/YC');
    assert.deepEqual(l.map(x => [x.id, x.groupe, x.proprio || null]),
      [['complet', 'flux', null], ['eco', 'flux', null], ['robot', 'flux', null], ['fwi', 'apart', 'FWI/BC']]);
    assert.equal(PC.cheminsPossibles(etat(), 'FWI/BC').find(x => x.id === 'fwi').groupe, 'sien');
  });

  test(v + ' — choisir un flux, revenir à celui de sa classe', () => {
    const e = etat();
    assert.deepEqual(PC.choisirChemin(e, 'AF/YC', 'robot'), { partage: null });
    assert.equal(PC.fluxDe(e, 'AF/YC').id, 'robot');
    PC.choisirChemin(e, 'AF/YC', 'eco');
    assert.ok(!('AF/YC' in e.parcoursClasse), 'le flux de sa classe : pas d’exception enregistrée');
    PC.choisirChemin(e, 'AF/YC', 'robot'); PC.choisirChemin(e, 'AF/YC', '');
    assert.equal(PC.fluxDe(e, 'AF/YC').id, 'eco');
  });

  test(v + ' — le chemin à part d’une autre commande devient un flux partagé', () => {
    const e = etat();
    assert.deepEqual(PC.choisirChemin(e, 'CRL/BC', 'fwi'), { partage: 'FWI/BC' });
    const p = e.parcours.find(x => x.id === 'fwi');
    assert.equal(p.type, true);
    assert.equal(PC.fluxDe(e, 'CRL/BC').id, 'fwi'); assert.equal(PC.fluxDe(e, 'FWI/BC').id, 'fwi');
    // Re-choisir son propre chemin ne change rien.
    const e2 = etat();
    assert.deepEqual(PC.choisirChemin(e2, 'FWI/BC', 'fwi'), { partage: null });
    assert.ok(!e2.parcours.find(x => x.id === 'fwi').type);
  });
}
