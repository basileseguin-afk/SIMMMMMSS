/* Le jeu de démonstration suit l'unité (retour d'usage du 02/10 : « supprime
 * QR et DL de la simulation et rajoute des vols des compagnies que j'utilise
 * pour la prépa »). v1 et v2 : leurs deux fichiers sont identiques. */
const test = require('node:test');
const assert = require('node:assert/strict');

for (const [dossier, v] of [['..', 'v1'], ['../v2', 'v2']]) {
  const D = require(dossier + '/vols-demo.js');

  test(v + ' — le jeu : ni QR ni DL, 12 départs et 6 retours', () => {
    assert.ok(!D.VOLS.some(x => /^(QR|DL)$/.test(x.cie)));
    assert.equal(D.VOLS.filter(x => x.sens === 'DEP').length, 12);
    assert.equal(D.VOLS.filter(x => x.sens === 'RET').length, 6);
    assert.equal(new Set(D.VOLS.map(x => x.id)).size, D.VOLS.length, 'identifiants uniques');
  });

  test(v + ' — les compagnies utilisées : ajouts et cases cochées, sans l’armement', () => {
    const m = D.compagniesUtilisees({ ajoutees: [{ cie: 'ezy', cabine: 'YC' }],
      ateliers: [{ lots: [['RAM/YC', 'AF/BC'], ['DAH/YC', 'AF/@ARM']] }, { lots: [['RAM/BC']] }] });
    assert.deepEqual([...m].map(([c, s]) => [c, [...s].sort()]), [['EZY', ['YC']], ['RAM', ['BC', 'YC']], ['AF', ['BC']], ['DAH', ['YC']]]);
    assert.equal(D.compagniesUtilisees(null).size, 0);
  });

  test(v + ' — des vols d’essai pour chaque compagnie sans départ, avec ses seules classes', () => {
    const m = new Map([['AF', new Set(['BC'])], ['RAM', new Set(['YC', 'BC'])], ['EZY', new Set(['YC'])]]);
    const out = D.completer(D.VOLS, m), essai = out.filter(x => x.essai);
    assert.equal(out.length, D.VOLS.length + 6, 'AF vole déjà : rien pour elle ; RAM et EZY : deux départs et un retour');
    assert.deepEqual([...new Set(essai.map(x => x.cie))], ['EZY', 'RAM']);
    const ram = essai.filter(x => x.cie === 'RAM');
    assert.deepEqual(ram.map(x => x.sens), ['DEP', 'DEP', 'RET']);
    assert.ok(ram.every(x => x.yc > 0 && x.bc > 0 && !x.pc && !x.crew), 'seulement YC et BC');
    assert.ok(essai.filter(x => x.sens === 'DEP').every(x => Number.isFinite(x.std) && x.std < 24 * 60));
    assert.equal(new Set(out.map(x => x.id)).size, out.length, 'identifiants uniques');
    assert.deepEqual(D.completer(D.VOLS, new Map()), D.VOLS.slice(), 'rien à ajouter : le jeu tel quel');
  });
}
