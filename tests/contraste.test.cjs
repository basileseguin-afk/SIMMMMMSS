/* Les jetons du design system (ds.css, refonte du 08/10) tiennent le contraste
 * AA, dans les deux thèmes : 4,5:1 pour le texte (texte 1 à 3, accent,
 * texte des états sur leur fond teinté), sur chaque surface où il se pose.
 * Les couleurs se lisent dans la feuille elle-même : un jeton qu'on retouche
 * sans le vérifier fait échouer ce test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'ds.css'), 'utf8');

/** Les jetons d'un bloc (`:root{…}` ou `:root[data-theme="sombre"]{…}`). */
function jetons(selecteur) {
  const i = CSS.indexOf(selecteur + '{');
  assert.ok(i >= 0, 'bloc introuvable : ' + selecteur);
  const bloc = CSS.slice(i, CSS.indexOf('\n}', i));
  const out = {};
  for (const m of bloc.matchAll(/--(ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const hex = h => { const v = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)); };
/** Une couleur du bloc, posée sur un fond : un hexadécimal, ou color-mix(in srgb,#X P%,transparent). */
function couleur(t, nom, fond) {
  const v = t[nom]; assert.ok(v, 'jeton absent : ' + nom);
  if (/^#[0-9a-f]{6}$/i.test(v)) return hex(v);
  const m = v.match(/^color-mix\(in srgb,(#[0-9a-f]{6}) ([\d.]+)%,transparent\)$/i);
  assert.ok(m && fond, 'couleur non lue : ' + nom + ' = ' + v);
  const p = +m[2] / 100, c = hex(m[1]);
  return c.map((x, i) => x * p + fond[i] * (1 - p));
}
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

for (const [nom, selecteur] of [['clair', ':root'], ['sombre', ':root[data-theme="sombre"]']]) {
  test('contraste AA du thème ' + nom, () => {
    const t = { ...jetons(':root'), ...(nom === 'sombre' ? jetons(selecteur) : {}) };
    const surfaces = ['ds-fond', 'ds-surface-1', 'ds-surface-2'].map(s => [s, couleur(t, s)]);
    const verifier = (texte, fond, nomFond, seuil = 4.5) => {
      const r = ratio(couleur(t, texte, fond), fond);
      assert.ok(r >= seuil, nom + ' : ' + texte + ' sur ' + nomFond + ' = ' + r.toFixed(2) + ':1');
    };
    for (const [s, fond] of surfaces) for (const texte of ['ds-texte-1', 'ds-texte-2', 'ds-texte-3']) verifier(texte, fond, s);
    const blanc = couleur(t, 'ds-surface-1');
    verifier('ds-accent-texte', blanc, 'ds-surface-1');
    // La page ouverte, dans la barre latérale : le texte sur l'accent pâle.
    for (const texte of ['ds-texte-1', 'ds-texte-2']) verifier(texte, couleur(t, 'ds-accent-pale'), 'ds-accent-pale');
    // Le texte sur l'accent (bouton principal).
    assert.ok(ratio(couleur(t, 'ds-sur-accent'), couleur(t, 'ds-accent')) >= 4.5, nom + ' : texte sur l’accent');
    // Le texte des états, sur leur fond teinté (pastilles, badges).
    for (const [texte, doux] of [['ds-ok-texte', 'ds-ok-doux'], ['ds-attente-texte', 'ds-attente-doux'], ['ds-retard-texte', 'ds-retard-doux'], ['ds-accent-texte', 'ds-accent-doux']]) {
      const fond = couleur(t, doux, blanc);
      verifier(texte, fond, doux);
    }
  });
}
