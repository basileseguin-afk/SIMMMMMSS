#!/usr/bin/env node
/* ==========================================================================
 *  EMPREINTE DES FICHIERS SERVIS
 *
 *  GitHub Pages sert des fichiers statiques avec un cache de plusieurs
 *  minutes, et les navigateurs en gardent bien plus longtemps. Conséquence
 *  observée deux fois : le déploiement est vert, le dépôt est à jour, et
 *  l'utilisateur voit l'ancienne version — ou pire, un mélange des deux
 *  (un `index.html` neuf avec un `sim.js` périmé, donc une page cassée).
 *
 *  La parade est d'usage : faire dépendre l'URL du CONTENU. Chaque script et
 *  chaque feuille de style porte `?v=<empreinte>`, huit caractères du hachage
 *  de son contenu. Le fichier change, l'URL change, le navigateur redemande.
 *  Le fichier ne change pas, l'URL ne change pas, le cache fait son travail.
 *
 *  Il n'y a pas d'étape de construction dans ce projet, et c'est voulu : les
 *  fichiers s'ouvrent tels quels. Ce script est donc à lancer AVANT de livrer,
 *  et `tests/empreinte.test.cjs` refuse une page dont une empreinte a vieilli.
 *
 *      node outils/empreinte.cjs              # met à jour les pages
 *      node outils/empreinte.cjs --verifier   # sort en erreur si périmé
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RACINE = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'accueil.html'];

/** Huit caractères du SHA-256 du contenu : assez pour distinguer deux versions. */
function empreinte(fichier) {
  return crypto.createHash('sha256').update(fs.readFileSync(fichier)).digest('hex').slice(0, 8);
}

/**
 * Relit une page et calcule ce qu'elle devrait contenir.
 * @returns {{page:string, contenu:string, attendu:string, ecarts:string[]}}
 */
function analyser(page) {
  const chemin = path.join(RACINE, page);
  const contenu = fs.readFileSync(chemin, 'utf8');
  const ecarts = [];

  // `src="x.js"` ou `href="x.css"`, avec ou sans `?v=…` déjà présent.
  const motif = /(src|href)="([^"?#]+\.(?:js|css))(\?v=[0-9a-f]+)?"/g;
  const attendu = contenu.replace(motif, (tout, attr, relatif, version) => {
    // Une adresse absolue ou distante n'est pas à nous : on n'y touche pas.
    if (/^(https?:)?\/\//.test(relatif) || relatif.startsWith('/')) return tout;
    const cible = path.join(RACINE, relatif);
    if (!fs.existsSync(cible)) {
      ecarts.push(page + ' : ' + relatif + ' est référencé mais absent du dépôt.');
      return tout;
    }
    const v = '?v=' + empreinte(cible);
    if (version !== v) {
      ecarts.push(page + ' : ' + relatif + (version ? ' porte une empreinte périmée' : ' n’a pas d’empreinte')
        + ' (attendu ' + v + ').');
    }
    return attr + '="' + relatif + v + '"';
  });

  // Une empreinte globale, affichée dans le Centre des réglages : elle répond
  // à la seule question qui compte quand un doute s'installe — « est-ce que
  // mon navigateur me sert bien la dernière version ? »
  const global = crypto.createHash('sha256')
    .update([...attendu.matchAll(/\?v=([0-9a-f]+)/g)].map(m => m[1]).join(''))
    .digest('hex').slice(0, 10);
  const avecVersion = attendu.replace(
    /(<meta name="ory-version" content=")([0-9a-f]*)(")/,
    (tout, avant, actuel, apres) => {
      if (actuel !== global) ecarts.push(page + ' : la version affichée est périmée (attendu ' + global + ').');
      return avant + global + apres;
    });

  return { page, chemin, contenu, attendu: avecVersion, ecarts, version: global };
}

function toutes() {
  return PAGES.filter(p => fs.existsSync(path.join(RACINE, p))).map(analyser);
}

if (require.main === module) {
  const verifier = process.argv.includes('--verifier');
  const analyses = toutes();
  const ecarts = analyses.flatMap(a => a.ecarts);

  if (verifier) {
    if (!ecarts.length) { console.log('empreintes : à jour'); process.exit(0); }
    console.error('Empreintes périmées — lancez `node outils/empreinte.cjs` :');
    for (const e of ecarts) console.error('  · ' + e);
    process.exit(1);
  }

  let touchees = 0;
  for (const a of analyses) {
    if (a.attendu === a.contenu) continue;
    fs.writeFileSync(a.chemin, a.attendu);
    touchees++;
    console.log(a.page + ' : ' + a.ecarts.length + ' empreinte(s) mise(s) à jour');
  }
  if (!touchees) console.log('empreintes : rien à faire');
}

module.exports = { empreinte, analyser, toutes, PAGES };
