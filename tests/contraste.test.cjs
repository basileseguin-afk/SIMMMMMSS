/* Les jetons du design system (ds.css, refonte du 08/10) tiennent le contraste
 * AA, dans les deux thèmes : 4,5:1 pour le texte (texte 1 à 3, accent,
 * texte des états sur leur fond teinté), sur chaque surface où il se pose.
 * Les couleurs se lisent dans la feuille elle-même : un jeton qu'on retouche
 * sans le vérifier fait échouer ce test.
 *
 * Évolution 25 (a) : la version 1 pose sa feuille (visuel.css) par-dessus ds.css.
 * Le test refait pour elle toutes ses vérifications, sur les jetons tels que la
 * page les reçoit (ds.css, puis visuel.css, dans l'ordre de la cascade), et y
 * ajoute les siennes : l'étiquette sur chacune des six couleurs de donnée et
 * sur la chaîne, le texte sur le fond d'un champ saisi, les traits du dessin.
 * Pour la version 2 (ds.css seule), rien ne change. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lireFeuille = nom => fs.readFileSync(path.join(__dirname, '..', nom), 'utf8');
const DS = lireFeuille('ds.css'), VISUEL = lireFeuille('visuel.css');
const SOMBRE = ':root[data-theme="sombre"]';

/** Les jetons d'un bloc (`:root{…}` ou `:root[data-theme="sombre"]{…}`) d'une feuille. */
function bloc(css, selecteur) {
  const i = css.indexOf(selecteur + '{');
  assert.ok(i >= 0, 'bloc introuvable : ' + selecteur);
  const texte = css.slice(i, css.indexOf('\n}', i));
  const out = {};
  for (const m of texte.matchAll(/--(ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
/**
 * Les jetons d'un thème, tels que la page les reçoit.
 * Version 2 : ds.css. Version 1 : ds.css, puis visuel.css — dans l'ordre de la cascade : le bloc sombre de ds.css
 * (`:root[data-theme="sombre"]`) l'emporte sur le `:root` de visuel.css, plus faible ; le bloc sombre de visuel.css,
 * de même force et posé après, l'emporte sur lui.
 */
const VERSIONS = [
  { nom: '', jetons: theme => ({ ...bloc(DS, ':root'), ...(theme === 'sombre' ? bloc(DS, SOMBRE) : {}) }) },
  { nom: 'version 1 (visuel.css) : ', v1: true,
    jetons: theme => ({ ...bloc(DS, ':root'), ...bloc(VISUEL, ':root'), ...(theme === 'sombre' ? { ...bloc(DS, SOMBRE), ...bloc(VISUEL, SOMBRE) } : {}) }) },
];
const hex = h => { const v = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)); };
/** Une couleur du bloc, posée sur un fond : un hexadécimal, color-mix(in srgb,#X P%,transparent),
 *  ou un renvoi à un autre jeton (var(--ds-…), le thème sombre de la navigation, 15/10). */
function couleur(t, nom, fond) {
  const v = t[nom]; assert.ok(v, 'jeton absent : ' + nom);
  const renvoi = v.match(/^var\(--(ds-[a-z0-9-]+)\)$/);
  if (renvoi) return couleur(t, renvoi[1], fond);
  if (/^#[0-9a-f]{6}$/i.test(v)) return hex(v);
  const m = v.match(/^color-mix\(in srgb,(#[0-9a-f]{6}) ([\d.]+)%,transparent\)$/i);
  assert.ok(m && fond, 'couleur non lue : ' + nom + ' = ' + v);
  const p = +m[2] / 100, c = hex(m[1]);
  return c.map((x, i) => x * p + fond[i] * (1 - p));
}
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

for (const version of VERSIONS) for (const nom of ['clair', 'sombre']) {
  test(version.nom + 'contraste AA du thème ' + nom, () => {
    const t = version.jetons(nom);
    const surfaces = ['ds-fond', 'ds-surface-1', 'ds-surface-2'].map(s => [s, couleur(t, s)]);
    const verifier = (texte, fond, nomFond, seuil = 4.5) => {
      const r = ratio(couleur(t, texte, fond), fond);
      assert.ok(r >= seuil, nom + ' : ' + texte + ' sur ' + nomFond + ' = ' + r.toFixed(2) + ':1');
    };
    for (const [s, fond] of surfaces) for (const texte of ['ds-texte-1', 'ds-texte-2', 'ds-texte-3']) verifier(texte, fond, s);
    const blanc = couleur(t, 'ds-surface-1');
    verifier('ds-accent-texte', blanc, 'ds-surface-1');
    // Un état dit dans une phrase, sur une carte (la frise des retours de la plonge, 15/10).
    for (const texte of ['ds-ok-texte', 'ds-attente-texte', 'ds-retard-texte']) verifier(texte, blanc, 'ds-surface-1');
    // L'élément choisi d'une liste : le texte sur l'accent pâle.
    for (const texte of ['ds-texte-1', 'ds-texte-2']) verifier(texte, couleur(t, 'ds-accent-pale'), 'ds-accent-pale');
    // La navigation (2e passe, 15/10) : ses textes sur ses deux teintes de fond, et
    // sur la lueur du bandeau de l'accueil qui reprend son bleu nuit.
    for (const fondNav of ['ds-nav-fond', 'ds-nav-fond-bas', 'ds-nav-lueur']) {
      const f = couleur(t, fondNav);
      for (const texte of ['ds-nav-texte-1', 'ds-nav-texte-2', 'ds-nav-texte-3']) verifier(texte, f, fondNav);
      // La partie ouverte, la page ouverte, une pastille : leur fond teinté, posé sur le bleu nuit.
      verifier('ds-nav-texte-1', couleur(t, 'ds-nav-actif', f), 'ds-nav-actif sur ' + fondNav);
      verifier('ds-nav-texte-1', couleur(t, 'ds-nav-sous-actif', f), 'ds-nav-sous-actif sur ' + fondNav);
      verifier('ds-nav-texte-2', couleur(t, 'ds-nav-badge', f), 'ds-nav-badge sur ' + fondNav);
      // Le repère de la page ouverte et le focus : une forme, 3:1 suffit.
      verifier('ds-nav-repere', f, fondNav, 3);
    }
    // Les pastilles des onglets (problèmes à corriger, retards), sur leur fond opaque.
    verifier('ds-nav-attente-texte', couleur(t, 'ds-nav-attente-fond'), 'ds-nav-attente-fond');
    verifier('ds-nav-retard-texte', couleur(t, 'ds-nav-retard-fond'), 'ds-nav-retard-fond');
    // Le texte sur l'accent (bouton principal).
    assert.ok(ratio(couleur(t, 'ds-sur-accent'), couleur(t, 'ds-accent')) >= 4.5, nom + ' : texte sur l’accent');
    // Les notifications et les questions, sur leur surface flottante.
    for (const texte of ['ds-texte-1', 'ds-texte-2', 'ds-texte-3', 'ds-accent-texte']) verifier(texte, couleur(t, 'ds-surface-3'), 'ds-surface-3');
    // Le geste qui détruit, dans une question : bouton plein, au repos et au survol.
    for (const fond of ['ds-retard', 'ds-retard-texte']) assert.ok(ratio(couleur(t, 'ds-sur-retard'), couleur(t, fond)) >= 4.5, nom + ' : texte sur ' + fond);
    // Le bouton Pause du rejeu, plein d'attente, au repos et au survol (étape 11 : blanc sur ambre, illisible en sombre).
    for (const fond of ['ds-attente', 'ds-attente-texte']) assert.ok(ratio(couleur(t, 'ds-sur-attente'), couleur(t, fond)) >= 4.5,
      nom + ' : texte sur ' + fond + ' = ' + ratio(couleur(t, 'ds-sur-attente'), couleur(t, fond)).toFixed(2) + ':1');
    // L'étiquette dans une barre du planning (étape 9) : sur chaque couleur de donnée qui porte du texte.
    for (const fond of ['ds-d1', 'ds-d2', 'ds-chaine']) assert.ok(ratio(couleur(t, 'ds-sur-donnee'), couleur(t, fond)) >= 4.5,
      nom + ' : étiquette sur ' + fond + ' = ' + ratio(couleur(t, 'ds-sur-donnee'), couleur(t, fond)).toFixed(2) + ':1');
    // Le texte des états, sur leur fond teinté (pastilles, badges).
    for (const [texte, doux] of [['ds-ok-texte', 'ds-ok-doux'], ['ds-attente-texte', 'ds-attente-doux'], ['ds-retard-texte', 'ds-retard-doux'], ['ds-accent-texte', 'ds-accent-doux']]) {
      const fond = couleur(t, doux, blanc);
      verifier(texte, fond, doux);
    }
    if (!version.v1) return;
    // ---- la version 1 seule (évolution 25 a) ----
    // L'étiquette sur chacune des six couleurs de donnée, et sur la chaîne.
    for (const fond of ['ds-d1', 'ds-d2', 'ds-d3', 'ds-d4', 'ds-d5', 'ds-d6', 'ds-chaine']) assert.ok(ratio(couleur(t, 'ds-sur-donnee'), couleur(t, fond)) >= 4.5,
      nom + ' : étiquette sur ' + fond + ' = ' + ratio(couleur(t, 'ds-sur-donnee'), couleur(t, fond)).toFixed(2) + ':1');
    // Un champ qui porte une valeur saisie : son texte, et l'unité grise qu'il porte, sur son fond pêche.
    for (const texte of ['ds-texte-1', 'ds-texte-3']) verifier(texte, couleur(t, 'ds-saisi-fond'), 'ds-saisi-fond');
    // Le trait du champ saisi se distingue de son fond et de la carte : il n'est pas un texte, aucun seuil ; il existe.
    assert.ok(t['ds-saisi-bord'], nom + ' : le trait du champ saisi');
    // Les traits du dessin (le contour d'un service sur le plan, un lien) : une forme, 3:1 sur la carte où ils se posent.
    for (const trait of ['ds-trait-plan', 'ds-trait-lien']) verifier(trait, blanc, 'ds-surface-1', 3);
    // Le plan rejoué (plan-flux.css) : un service qui a fini se remplit du texte 4 et porte son nom en texte 1.
    verifier('ds-texte-1', couleur(t, 'ds-texte-4'), 'ds-texte-4');
    verifier('ds-texte-4', blanc, 'ds-surface-1', 3);
    // Évolution 25 (b). Le choix retenu parmi quelques-uns, une pastille pleine : son texte sur son fond ; son trait, une
    // forme, sur la carte.
    verifier('ds-choix-texte', couleur(t, 'ds-choix-fond'), 'ds-choix-fond');
    verifier('ds-choix-trait', blanc, 'ds-surface-1', 3);
    // Un compteur du menu, et la lettre de la marque : à la couleur du menu, sur la pastille au repère.
    assert.ok(ratio(couleur(t, 'ds-nav-fond'), couleur(t, 'ds-nav-repere')) >= 4.5,
      nom + ' : le chiffre d’un compteur sur le repère = ' + ratio(couleur(t, 'ds-nav-fond'), couleur(t, 'ds-nav-repere')).toFixed(2) + ':1');
  });
}

/* Évolution 25 (a) : ce que la feuille de la version 1 doit dire, au jeton près — les valeurs choisies sur la maquette. */
test('version 1 (visuel.css) : les jetons de départ de la maquette, dans les deux thèmes', () => {
  const clair = bloc(VISUEL, ':root'), sombre = bloc(VISUEL, SOMBRE);
  const attendu = (t, valeurs, theme) => { for (const [k, v] of Object.entries(valeurs)) assert.equal((t[k] || '').toUpperCase(), v.toUpperCase(), theme + ' : --' + k); };
  attendu(clair, { 'ds-fond': '#FBF8F6', 'ds-surface-1': '#FFFFFF', 'ds-texte-1': '#2A1F23', 'ds-accent': '#B95B0F', 'ds-accent-pale': '#FFF1E7',
    'ds-nav-fond': '#2E0F1A', 'ds-nav-fond-bas': '#2E0F1A', 'ds-nav-repere': '#FF9853', 'ds-attente': '#8A6A00', 'ds-retard': '#C0262D',
    'ds-d1': '#2464A6', 'ds-d2': '#1B8364', 'ds-d3': '#5021A1', 'ds-d4': '#881E31', 'ds-d5': '#8A1C69', 'ds-d6': '#865D24', 'ds-chaine': '#8A1C69',
    'ds-saisi-fond': '#FFF7F0', 'ds-saisi-bord': '#F0D3BE', 'ds-r-1': '5px', 'ds-r-2': '8px', 'ds-r-3': '14px', 'ds-r-4': '16px' }, 'clair');
  attendu(sombre, { 'ds-fond': '#161113', 'ds-surface-1': '#1E1719', 'ds-texte-1': '#F2EAEC', 'ds-accent': '#F08A4B', 'ds-accent-pale': '#3A261C',
    'ds-attente': '#D6B13A', 'ds-retard': '#F2645C',
    'ds-d1': '#A7C5EB', 'ds-d2': '#A9EEE0', 'ds-d3': '#9463E1', 'ds-d4': '#CC8596', 'ds-d5': '#B666A4', 'ds-d6': '#E1D1A3', 'ds-chaine': '#B666A4',
    'ds-saisi-fond': '#2E2019', 'ds-saisi-bord': '#5A3A28' }, 'sombre');
  // En sombre, la navigation reste branchée sur les surfaces du thème, comme dans ds.css : la feuille ne lui donne pas de fond.
  for (const k of ['ds-nav-fond', 'ds-nav-fond-bas', 'ds-nav-lueur', 'ds-nav-texte-1', 'ds-nav-repere']) assert.equal(sombre[k], undefined, 'sombre : --' + k + ' reste celui de ds.css');
  // Les classes : Équipage d1, Économie d2, Premium d3, Business d4, repas spéciaux d6 — dans les deux thèmes ; d5 reste à la chaîne.
  const cab = Object.fromEntries([...VISUEL.matchAll(/--cab-([A-Z]+)\s*:\s*var\(--(ds-d\d)\)/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(cab, { CREW: 'ds-d1', YC: 'ds-d2', PC: 'ds-d3', BC: 'ds-d4', SPML: 'ds-d6' });
  assert.equal(VISUEL.match(/--cab-[A-Z]+\s*:/g).length, 5, 'une seule définition des classes, pour les deux thèmes');
  // Aucune ressource venue d'ailleurs : ni police, ni image, ni feuille importée.
  assert.equal(/url\(|@import|@font-face|https?:/i.test(VISUEL), false, 'la feuille ne charge rien');
});

/* Évolution 25 (d) : les douze couleurs au choix pour une compagnie, dans l'ordre de la demande. Le texte de la pastille
 * (blanc en clair, sombre en sombre) tient 4,5:1 sur chacune. Le module (pastilles.js) n'en connaît que le rang. */
test('version 1 (visuel.css) : les douze couleurs des compagnies, 4,5:1 sous le texte de la pastille, dans les deux thèmes', () => {
  const pastilles = selecteur => {
    const i = VISUEL.indexOf(selecteur + '{\n  --pa-1:');
    assert.ok(i >= 0, 'bloc des couleurs des compagnies introuvable : ' + selecteur);
    return Object.fromEntries([...VISUEL.slice(i, VISUEL.indexOf('\n}', i)).matchAll(/--(pa-[a-z0-9]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2].toUpperCase()]));
  };
  const attendu = {
    clair: ['#39778B', '#B54A65', '#846A36', '#654AB5', '#337D3F', '#AE4794', '#4A65B5', '#A35B43', '#327979', '#9A4AB5', '#647630', '#327B63'],
    sombre: ['#5CAEC9', '#DA90A3', '#C59E51', '#AB9ADD', '#40BF55', '#D88AC5', '#90A3DA', '#D59681', '#40BFBF', '#C890DA', '#9FBF40', '#40BF95']
  };
  const encre = { clair: '#FFFFFF', sombre: '#161113' };
  for (const [theme, selecteur] of [['clair', ':root'], ['sombre', SOMBRE]]) {
    const t = pastilles(selecteur);
    assert.deepEqual(attendu[theme].map((_, i) => t['pa-' + (i + 1)]), attendu[theme], theme + ' : les douze couleurs, dans l’ordre');
    assert.equal(Object.keys(t).filter(k => /^pa-\d+$/.test(k)).length, 12, theme + ' : douze, pas une de plus');
    assert.equal(t['pa-texte'], encre[theme], theme + ' : le texte de la pastille');
    for (let i = 1; i <= 12; i++) {
      const r = ratio(hex(t['pa-' + i]), hex(t['pa-texte']));
      assert.ok(r >= 4.5, theme + ' : couleur ' + i + ' (' + t['pa-' + i] + ') = ' + r.toFixed(2) + ':1');
    }
    assert.equal(new Set(attendu[theme]).size, 12, theme + ' : douze couleurs différentes');
  }
});
