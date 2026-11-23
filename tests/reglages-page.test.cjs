/* « Réglages » (version 1, évolution 23 e), sans navigateur : une liste à gauche, une fiche à droite. Les sections et
 * leur titre, la règle qui ne montre que la section choisie, la liste, « Réglages avancés », la section retenue, et le
 * bilan du matériel, qui quitte la page pour « Détails ». Services, équipes et vols fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../reglages-page.js');
const SEV = require('../seuils-vue.js');
const REP = require('../moteur/reponses.js');
const V = require('../resultats-vue.js');

const stockage = (init = {}) => { const m = new Map(Object.entries(init)); return {
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), cles: () => [...m.keys()] }; };

test('les sections : leur titre d’aujourd’hui, dans l’ordre de la liste, chacune avec son pictogramme', () => {
  assert.deepEqual(R.SECTIONS.map(s => [s.id, s.nom]), [
    ['horaires', 'Horaires des vols'],
    ['retours', 'Retours des vols à la plonge'],
    ['materiel', 'Matériel en boucle'],
    ['rythme', 'Rythme de travail'],
    ['pauses', 'Pauses et présence'],
    ['heures-sup', 'Heures supplémentaires'],
    ['renforts', 'Renforts'],
    ['ordre', 'Ordre des lots'],
    ['spml', 'Repas spéciaux par cabine'],
    ['seuils', 'Seuils d’alerte']
  ]);
  const TRAITS = require('../icones.js').TRAITS;
  for (const s of R.SECTIONS) assert.ok(TRAITS[s.ico], s.nom + ' : ' + s.ico);
  // Chaque section dit quel panneau de la page elle montre ; deux sections se partagent celui des retours et du matériel.
  assert.deepEqual(R.SECTIONS.map(s => s.panneau), ['#rg-sim-horaires', '#rg-sim-materiel', '#rg-sim-materiel', '#rg-sim-rythme', '#rg-sim-pauses',
    '#rg-sim-heures-sup', '#rg-sim-renforts', '#rg-sim-ordre', '#rg-sim-spml', '#rg-sim-seuils']);
  assert.deepEqual(R.SECTIONS.filter(s => s.dedans).map(s => [s.id, s.dedans]), [['retours', '.at-retours'], ['materiel', '.at-mat']]);
  assert.equal(new Set(R.SECTIONS.map(s => s.id)).size, R.SECTIONS.length);
});

test('la règle : la section choisie se montre seule ; sans section choisie, rien n’est masqué', () => {
  const css = R.regles();
  for (const s of R.SECTIONS) {
    // Dans la fiche, tout ce qui n'est pas le panneau de la section est masqué.
    assert.ok(css.includes(`#view-reglages[data-rs="${s.id}"] #rg-modele>:not(${s.panneau}){display:none}`), s.nom);
    // Un panneau partagé ne montre que la part de la section.
    if (s.dedans) assert.ok(css.includes(`#view-reglages[data-rs="${s.id}"] ${s.panneau}>:not(${s.dedans}){display:none}`), s.nom + ' : sa part du panneau');
  }
  // Chaque sélecteur tient à `#view-reglages[data-rs="…"]` : sans cet attribut (la page d'avant), aucune règle ne joue.
  for (const regle of css.split('}').map(x => x.trim()).filter(Boolean)) assert.match(regle, /^#view-reglages\[data-rs="[a-z-]+"\] /, regle);
  assert.equal((css.match(/\{display:none\}/g) || []).length, R.SECTIONS.length + 2);
});

test('la liste : une entrée par section qui a quelque chose à régler ; la section choisie est marquée', () => {
  const toutes = R.SECTIONS.map(s => s.id);
  const html = R.liste(toutes, 'pauses');
  assert.match(html, /^<nav class="rs-liste" aria-label="Les sections des réglages">/);
  assert.deepEqual([...html.matchAll(/data-rs-choisir="([^"]+)"/g)].map(m => m[1]), toutes);
  assert.deepEqual([...html.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1]), R.SECTIONS.map(s => s.nom.replace(/’/g, '’')));
  assert.equal((html.match(/aria-current="true"/g) || []).length, 1);
  assert.match(html, /class="mu-svc rs-entree actif" data-rs-choisir="pauses" aria-current="true"/);
  assert.match(html, /class="mu-svc rs-entree" data-rs-choisir="horaires" aria-current="false"/);
  // Une section qui n'a rien à régler (son panneau ne s'affiche pas) n'a pas d'entrée.
  const sans = R.liste(toutes.filter(id => id !== 'spml' && id !== 'materiel'), 'horaires');
  assert.deepEqual([...sans.matchAll(/data-rs-choisir="([^"]+)"/g)].map(m => m[1]), ['horaires', 'retours', 'rythme', 'pauses', 'heures-sup', 'renforts', 'ordre', 'seuils']);
  // Une section inconnue est ignorée ; l'ordre est celui des sections, pas celui qu'on donne.
  assert.deepEqual([...R.liste(['seuils', 'rien', 'horaires'], 'seuils').matchAll(/data-rs-choisir="([^"]+)"/g)].map(m => m[1]), ['horaires', 'seuils']);
});

test('la section à montrer : celle qu’on a choisie si elle se montre encore, sinon la première', () => {
  const toutes = R.SECTIONS.map(s => s.id);
  assert.equal(R.choix('renforts', toutes), 'renforts');
  assert.equal(R.choix(null, toutes), 'horaires');
  assert.equal(R.choix('rien', toutes), 'horaires');
  assert.equal(R.choix('spml', toutes.filter(id => id !== 'spml')), 'horaires');
  assert.equal(R.choix('spml', ['seuils', 'pauses']), 'pauses', 'la première dans l’ordre de la liste');
  assert.equal(R.choix('spml', []), null);
});

test('la section choisie se retient comme une préférence d’affichage, hors des données', () => {
  assert.match(R.CLE, /^ory-ui-/);
  const s = stockage();
  assert.equal(R.lire(s), null);
  R.ecrire(s, 'renforts');
  assert.deepEqual([R.lire(s), s.cles()], ['renforts', ['ory-ui-reglages-section']]);
  // Une valeur inconnue (une section d'une autre version) ne vaut rien ; un stockage indisponible ne casse rien.
  assert.equal(R.lire(stockage({ 'ory-ui-reglages-section': 'ancienne' })), null);
  const casse = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); } };
  assert.equal(R.lire(casse), null);
  assert.doesNotThrow(() => R.ecrire(casse, 'seuils'));
});

test('« Réglages avancés » : les réglages rares d’une section, repliés ; ouverts, ils le restent d’un dessin à l’autre', () => {
  const champs = '<label>Délai <input type="number" value="30"></label>';
  assert.equal(R.avance('retours', champs),
    '<details class="rs-avance" data-rs-avance="retours"><summary>Réglages avancés</summary><div class="rs-avance-corps">' + champs + '</div></details>');
  // Rien à replier : rien n'est écrit.
  assert.equal(R.avance('retours', ''), '');
  assert.equal(R.avance('retours', '  \n '), '');
  // Dépliés par la personne, ils le restent quand le panneau se redessine.
  R.retenirAvance('retours', true);
  assert.match(R.avance('retours', champs), /^<details class="rs-avance" data-rs-avance="retours" open>/);
  assert.match(R.avance('renforts', champs), /^<details class="rs-avance" data-rs-avance="renforts">/, 'chaque section a les siens');
  R.retenirAvance('retours', false);
  assert.match(R.avance('retours', champs), /^<details class="rs-avance" data-rs-avance="retours">/);
  // Les sections qui ont des réglages rares, et lesquels.
  assert.deepEqual(Object.keys(R.RARES), ['retours', 'renforts', 'seuils']);
  assert.deepEqual(R.RARES.seuils, ['occupation', 'dureeStockMax']);
});

test('les seuils d’alerte : sans rangement, le panneau d’avant ; rangés, les seuils rares sous « Réglages avancés »', () => {
  const seuils = REP.seuilsComplets();
  const avant = SEV.html(seuils, null);
  // Sans option, ou avec une option vide : le panneau d'avant, au caractère près.
  assert.equal(SEV.html(seuils, null, undefined), avant);
  assert.equal(SEV.html(seuils, null, {}), avant);
  assert.equal(SEV.html(seuils, null, { rares: [], plier: h => '<details>' + h + '</details>' }), avant, 'aucun seuil rare : rien à replier');
  const ordre = h => [...h.matchAll(/data-seuil="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ordre(avant), ['ecartPersonnes', 'attenteLot', 'occupation', 'dureeStockMax', 'retard']);
  const range = SEV.html(seuils, null, { rares: R.RARES.seuils, plier: h => R.avance('seuils', h) });
  // Les mêmes cinq champs ; les trois courants d'abord, les deux rares repliés à leur suite.
  assert.deepEqual(ordre(range), ['ecartPersonnes', 'attenteLot', 'retard', 'occupation', 'dureeStockMax']);
  const i = range.indexOf('<details class="rs-avance"');
  assert.ok(i > 0);
  assert.deepEqual(ordre(range.slice(0, i)), ['ecartPersonnes', 'attenteLot', 'retard']);
  assert.deepEqual(ordre(range.slice(i, range.indexOf('</details>', i))), ['occupation', 'dureeStockMax']);
  // Chaque champ est écrit comme avant : son nom, sa valeur, son unité, sa phrase.
  const champ = (h, cle) => h.slice(h.lastIndexOf('<div class="seuil">', h.indexOf('data-seuil="' + cle + '"')), h.indexOf('</p></div>', h.indexOf('data-seuil="' + cle + '"')));
  for (const cle of ordre(avant)) assert.equal(champ(range, cle), champ(avant, cle), cle);
  // « Revenir aux défauts » reste hors du repli.
  const change = SEV.html({ ...seuils, retard: 12 }, null, { rares: R.RARES.seuils, plier: h => R.avance('seuils', h) });
  assert.ok(change.indexOf('data-seuils-defaut') > change.indexOf('</details>'));
});

test('le bilan du matériel quitte « Réglages » : les six chiffres d’avant, tels quels, pour « Détails › Stocks et retours »', () => {
  const bilan = { entrees: 480, lavees: 440, resteSale: 40, consommees: 455, restePropre: 25, minPropre: 0, attente: 12.4, enAttente: 2 };
  assert.deepEqual(V.bilanMateriel(bilan), [
    { nom: 'Revenu des vols', valeur: '480 u', note: '' },
    { nom: 'Lavé', valeur: '440 u', note: '40 u sales non lavées' },
    { nom: 'Emporté', valeur: '455 u', note: '' },
    { nom: 'Reste propre', valeur: '25 u', note: 'disponible demain' },
    { nom: 'Plus bas niveau', valeur: '0 u', note: 'passé par zéro' },
    { nom: 'Attente de matériel', valeur: '12 min', note: '2 préparations jamais servies' }
  ]);
  assert.deepEqual(V.bilanMateriel({ entrees: 0, lavees: 0, resteSale: 0, consommees: 0, restePropre: 0, minPropre: 5, attente: 0, enAttente: 1 }).map(c => c.note),
    ['', '', '', 'aucun amortisseur', '', '1 préparation jamais servie']);
  assert.deepEqual(V.bilanMateriel(null), []);
  // Le bloc, pour la page : un titre, six tuiles ; sans boucle du matériel, rien.
  const html = V.blocMateriel(bilan);
  assert.match(html, /^<section class="tp-sec tp-materiel" data-tp-materiel>/);
  assert.match(html, /<h3 class="tp-titre">Le matériel en boucle<\/h3>/);
  assert.equal((html.match(/class="tp-tuile"/g) || []).length, 6);
  assert.match(html, /<span>Reste propre<\/span><b>25 u<\/b><em>disponible demain<\/em>/);
  assert.equal(V.blocMateriel(null), '');
  // Le lien qui le remplace dans « Réglages ».
  assert.match(R.versDetails(), /^<p class="mini-note rs-vers-details">[^]*<button type="button" class="lien-discret" data-page="j-stocks">Détails › Stocks et retours →<\/button><\/p>$/);
  assert.match(R.versDetails(), /revenu des vols, lavé, reste propre/);
});
