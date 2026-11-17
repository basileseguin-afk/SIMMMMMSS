/* Banc d'essai, correction 22 (b) — aucune page de la version 1 ne touche son
 * stockage trop tôt.
 *
 * Un document qui touche `localStorage` avant que le navigateur ait fini de
 * l'installer peut se retrouver avec un stockage détaché : il ne lit rien de
 * ce qui est enregistré, et rien de ce qu'il écrit n'est gardé
 * (docs/BANC_ESSAI.md § 11 ; outils/banc-stockage.cjs le mesure). Le thème,
 * lu dans un script en ligne en tête de page, était le premier accès au
 * stockage de index.html et de accueil.html.
 *
 * La règle : le premier accès au stockage d'une page vient après la lecture
 * de `document.cookie` (un aller-retour avec le navigateur par la voie du
 * document) ; dans index.html et accueil.html, il est dans un fichier
 * (theme-tot.js), plus dans un script en ligne. secours.html reste autonome
 * (elle ne charge rien du site) : son script en ligne commence par cette
 * lecture.
 * Sans navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.resolve(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const STOCKAGE = /\b(localStorage|sessionStorage)\b/, PARADE = /\bdocument\.cookie\b|\bdoc\.cookie\b|\.document\.cookie\b/;
/** Le code sans ses commentaires (les fichiers d'ici n'ont pas de « // » ni de « /* » dans une chaîne). */
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
/** Les scripts d'une page, dans l'ordre : { src } pour un fichier, { texte } pour un script en ligne. */
const scripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => {
  const src = (m[1].match(/\bsrc="([^"?#]+)/) || [])[1];
  return src ? { src } : { texte: m[2] };
});
/** Le code d'un script : celui du fichier, ou le texte en ligne. */
const codeDe = s => code(s.src ? lire(s.src) : s.texte);
/** Dans ce code, la lecture de `document.cookie` vient avant le premier accès au stockage. */
const paradeAvant = c => { const p = c.search(PARADE), s = c.search(STOCKAGE); return p >= 0 && s >= 0 && p < s; };

test('index.html et accueil.html : aucun script en ligne ne touche le stockage ; le premier accès est dans theme-tot.js', () => {
  for (const page of ['index.html', 'accueil.html']) {
    const liste = scripts(lire(page));
    assert.deepEqual(liste.filter(s => s.texte && STOCKAGE.test(code(s.texte))).map(s => s.texte.trim().slice(0, 60)), [], page + ' : aucun script en ligne ne touche le stockage');
    const premier = liste.find(s => STOCKAGE.test(codeDe(s)));
    assert.equal(premier && premier.src, 'theme-tot.js', page + ' : le premier script qui touche le stockage');
    // Il est en tête, avant les feuilles de style : le thème se pose avant tout dessin.
    const html = lire(page), tete = html.slice(0, html.indexOf('</head>'));
    assert.match(tete, /<script src="theme-tot\.js\?v=[0-9a-f]{8}"><\/script>/, page + ' : en tête, avec son empreinte');
    assert.ok(tete.indexOf('theme-tot.js') < tete.search(/<link[^>]+rel="stylesheet"|<link[^>]+href="[^"]+\.css/), page + ' : avant la première feuille de style');
  }
});

test('theme-tot.js lit document.cookie, puis le thème ; il le pose avant tout dessin, et ne casse rien sans stockage', () => {
  const source = lire('theme-tot.js');
  assert.ok(paradeAvant(code(source)), 'la lecture de document.cookie vient avant le premier accès au stockage');
  /** Joue le script dans une page simulée ; rend l'ordre des accès et le thème posé. */
  const jouer = ({ theme = null, sansStockage = false, sansTemoins = false } = {}) => {
    const ordre = [], dataset = {};
    const document = { documentElement: { dataset }, get cookie() { ordre.push('cookie'); if (sansTemoins) throw new Error('SecurityError'); return ''; } };
    const stockage = { getItem(k) { ordre.push('stockage:' + k); return k === 'ory-ui-theme' ? theme : null; } };
    const contexte = { document };
    Object.defineProperty(contexte, 'localStorage', { get() { if (sansStockage) { ordre.push('stockage refusé'); throw new Error('SecurityError'); } return stockage; } });
    vm.runInNewContext(source, contexte);
    return { ordre, theme: dataset.theme };
  };
  assert.deepEqual(jouer({ theme: 'sombre' }), { ordre: ['cookie', 'stockage:ory-ui-theme'], theme: 'sombre' });
  assert.deepEqual(jouer(), { ordre: ['cookie', 'stockage:ory-ui-theme'], theme: undefined }, 'sans préférence : le thème clair');
  assert.deepEqual(jouer({ theme: 'clair' }).theme, undefined);
  // Un document sans témoins, un stockage indisponible : ni erreur, ni thème.
  assert.deepEqual(jouer({ theme: 'sombre', sansTemoins: true }), { ordre: ['cookie', 'stockage:ory-ui-theme'], theme: 'sombre' });
  assert.deepEqual(jouer({ sansStockage: true }), { ordre: ['cookie', 'stockage refusé'], theme: undefined });
});

test('secours.html reste autonome : son script en ligne lit document.cookie avant de toucher le stockage', () => {
  const liste = scripts(lire('secours.html'));
  assert.deepEqual(liste.filter(s => s.src), [], 'elle ne charge rien du site');
  const touche = liste.filter(s => STOCKAGE.test(code(s.texte)));
  assert.equal(touche.length, 1);
  assert.ok(paradeAvant(code(touche[0].texte)), 'la lecture de document.cookie vient avant le premier accès au stockage');
});

test('stockage.js : le garde lit document.cookie avant de prendre localStorage', () => {
  const c = code(lire('stockage.js')), corps = c.slice(c.indexOf('function installer(win)'));
  const p = corps.search(/\.cookie\b/), s = corps.indexOf('win.localStorage');
  assert.ok(p >= 0 && s >= 0 && p < s, 'dans installer() : la parade, puis le stockage');
});

test('la règle vaut pour toute page de la version 1 : un script en ligne qui touche le stockage lit d’abord document.cookie', () => {
  const pages = fs.readdirSync(RACINE).filter(f => f.endsWith('.html')).sort();
  assert.deepEqual(pages, ['accueil.html', 'index.html', 'secours.html'], 'les pages de la version 1');
  for (const page of pages) for (const s of scripts(lire(page))) {
    if (s.src || !STOCKAGE.test(code(s.texte))) continue;
    assert.ok(paradeAvant(code(s.texte)), page + ' : « ' + s.texte.trim().slice(0, 50) + '… » touche le stockage sans la parade');
  }
});
