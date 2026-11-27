/* Évolution 26 (a) — la règle 12 de la charte (docs/CHARTE_INTERFACE.md) tenue par un test : toute couleur vient des
 * jetons du visuel ; aucune couleur écrite en dur dans une feuille ou un script propres à la version 1, hors la feuille
 * des jetons (visuel.css).
 *
 * Propres à la version 1 : les feuilles (.css) et les scripts (.js) de la racine qui ne sont pas identiques à leur jumeau
 * de v2/ (ceux-là sont communs, gelés avec la version 2), et les blocs <style> et <script> de ses pages (.html).
 * Une couleur écrite en dur : un code hexadécimal (#abc, #aabbcc…), une fonction de couleur à valeurs (rgb(…), hsl(…)…),
 * et, dans une feuille, une couleur nommée (white, black…). Un jeton (`var(--…)`), `transparent`, `currentColor` et
 * `inherit` n'en sont pas ; les commentaires ne comptent pas.
 *
 * Un test à cliquet, comme celui du budget des pages : ce qui existait au début de l'évolution 26 est relevé, fichier par
 * fichier, dans `tests/charte-dette.json` (« couleurs »). Le test échoue si un fichier qui n'y est pas a une couleur en
 * dur, si le compte d'un fichier grandit, ou s'il baisse sans que la dette soit réécrite à la baisse. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const JETONS = 'visuel.css';
const DETTE = JSON.parse(fs.readFileSync(path.join(__dirname, 'charte-dette.json'), 'utf8')).couleurs || {};

const HEX = /(?<![\w&$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const FONCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*-?[\d.]/g;
const NOMMEE = /(?<![\w-])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|navy|silver|maroon|teal|olive|lime|aqua|fuchsia|gold|crimson|tomato|coral|beige|ivory|khaki|salmon|tan|violet)(?![\w-])/g;

/** Les fichiers propres à la version 1 : feuilles et scripts de la racine sans jumeau identique dans v2/, et ses pages. */
function fichiersV1() {
  return fs.readdirSync(RACINE).filter(f => /\.(css|js|html)$/.test(f) && f !== JETONS).filter(f => {
    const v2 = path.join(RACINE, 'v2', f);
    return !(fs.existsSync(v2) && fs.readFileSync(v2, 'utf8') === fs.readFileSync(path.join(RACINE, f), 'utf8'));
  }).sort();
}

const sansCommentaires = (t, js) => {
  t = t.replace(/\/\*[\s\S]*?\*\//g, '');
  return js ? t.replace(/^\s*\/\/.*$/gm, '').replace(/([;{}(,])\s*\/\/[^\n'"`]*$/gm, '$1') : t;
};
/** Les valeurs des déclarations d'une feuille : ce qui suit « propriété: » dans un bloc, pas les sélecteurs. */
function valeursCss(css) {
  const out = [];
  for (const m of sansCommentaires(css).matchAll(/\{([^{}]*)\}/g))
    for (const d of m[1].split(';')) { const i = d.indexOf(':'); if (i > 0) out.push(d.slice(i + 1)); }
  return out.join(';\n');
}
/** Les couleurs écrites en dur d'un texte : `css` (des valeurs de déclarations) ou un script. */
function couleurs(texte, css) {
  return [...(texte.match(HEX) || []), ...(texte.match(FONCTION) || []), ...(css ? texte.match(NOMMEE) || [] : [])];
}
/** Les couleurs écrites en dur d'un fichier propre à la version 1. */
function couleursDe(nom) {
  const t = fs.readFileSync(path.join(RACINE, nom), 'utf8');
  if (nom.endsWith('.css')) return couleurs(valeursCss(t), true);
  if (nom.endsWith('.js')) return couleurs(sansCommentaires(t, true), false);
  const styles = [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => valeursCss(m[1])).join('\n');
  const scripts = [...t.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => sansCommentaires(m[1], true)).join('\n');
  const attributs = [...t.matchAll(/\sstyle="([^"]*)"/g)].map(m => m[1]).join(';\n');
  return [...couleurs(styles, true), ...couleurs(scripts, false), ...couleurs(attributs, true)];
}

test('le détecteur reconnaît une couleur écrite en dur, pas un jeton ni un sélecteur', () => {
  assert.deepEqual(couleurs(valeursCss('#mu-services .x{color:#fff;background:var(--ds-carte,#a1b2c3)}'), true), ['#fff', '#a1b2c3']);
  assert.deepEqual(couleurs(valeursCss('.a:hover{border:1px solid rgba(0,0,0,.2);color:white;white-space:nowrap}'), true), ['rgba(0', 'white']);
  assert.deepEqual(couleurs(valeursCss('.b{color:var(--orange);background:transparent;fill:currentColor}'), true), []);
  assert.deepEqual(couleurs(sansCommentaires("const a = '#' + id; // #fff\nconst b = 'rgb(' + c + ')'; /* #000 */", true), false), []);
  assert.deepEqual(couleurs(sansCommentaires("el.style.color = '#c0ffee';", true), false), ['#c0ffee']);
});

test('aucune couleur écrite en dur dans une feuille ou un script propres à la version 1, hors la feuille des jetons (règle 12)', () => {
  const trop = [], baisse = [], vus = new Set();
  for (const f of fichiersV1()) {
    const l = couleursDe(f), d = DETTE[f] || 0;
    vus.add(f);
    if (l.length > d) trop.push(f + ' : ' + l.length + ' (dette ' + d + ') — ' + l.slice(0, 6).join(' '));
    else if (l.length < d) baisse.push(f + ' : ' + d + ' → ' + l.length);
  }
  for (const f of Object.keys(DETTE)) if (!vus.has(f)) baisse.push(f + ' : le fichier n’est plus propre à la version 1, ou n’existe plus');
  assert.deepEqual(trop, [], 'des couleurs écrites en dur, au-delà de la dette (tests/charte-dette.json, « couleurs ») : utilisez les jetons de visuel.css');
  assert.deepEqual(baisse, [], 'la dette des couleurs a baissé : réécrivez-la à la baisse (tests/charte-dette.json, « couleurs »)');
});

test('la feuille des jetons existe et porte les couleurs', () => {
  assert.ok(couleursDe(JETONS).length > 0, 'visuel.css porte les couleurs du visuel');
});
