/* Évolution 15 (d) — la correspondance propose 7,5 h par ETP titulaire et
 * 7 h par ETP intérimaire, seulement quand rien n'est encore réglé
 * (calage-vue.js) ; un réglage enregistré ne change pas, et la proposition ne
 * s'enregistre pas d'elle-même. Le moteur (moteur/reel.js) garde ses défauts
 * de 7 h : un fichier de correspondance sans bases se lit comme avant. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/reel.js');

globalThis.OrlyReel = R;
const { VueCalage } = require('../calage-vue.js');
/** La vue du calage, sans page : ses réglages gardés (ou null), et ce qu'elle enregistre. */
const vue = garde => {
  const ecrits = [];
  const v = new VueCalage({ reglages: () => garde, enregistrer: r => ecrits.push(r), bilan: () => null, periode: () => null, services: () => [], notifier: () => {} });
  return { v, ecrits };
};

test('rien de réglé : 7,5 h par ETP titulaire, 7 h par ETP intérimaire, sans rien enregistrer', () => {
  const { v, ecrits } = vue(null);
  assert.deepEqual(v.correspondance.bases, { defaut: { titulaires: 7.5, interim: 7 } });
  assert.deepEqual(v.correspondance.lignes, []);
  assert.deepEqual(ecrits, [], 'une proposition ne s’enregistre pas d’elle-même');
});

test('un réglage enregistré ne change pas', () => {
  const sept = { correspondance: { bases: { defaut: { titulaires: 7, interim: 7 } }, lignes: [] }, decisions: { ecartes: [], reintegres: [] } };
  assert.deepEqual(vue(sept).v.correspondance.bases.defaut, { titulaires: 7, interim: 7 });
  // Un réglage d'avant, sans bases : celles du moteur, 7 h, comme avant.
  const sansBases = { correspondance: { lignes: [{ nom: 'Fictive', roles: ['Rôle fictif'], hors: true }] }, decisions: null };
  assert.deepEqual(vue(sansBases).v.correspondance.bases.defaut, { titulaires: 7, interim: 7 });
  assert.deepEqual(vue({ correspondance: { bases: { defaut: { titulaires: 8 } }, lignes: [] } }).v.correspondance.bases.defaut, { titulaires: 8, interim: 7 });
  // Le moteur garde ses défauts.
  assert.deepEqual(R.BASE_DEFAUT, { titulaires: 7, interim: 7 });
  assert.deepEqual(R.validerCorrespondance(null).bases.defaut, { titulaires: 7, interim: 7 });
});
