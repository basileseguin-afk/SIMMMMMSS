#!/usr/bin/env node
/* ==========================================================================
 *  LE BANC DU STOCKAGE (banc d'essai, correction 22)
 *
 *  Deux tests navigateur échouaient de temps en temps, sur l'enregistrement
 *  des données. La cause n'était pas un délai trop court : un document qui
 *  touche `localStorage` TROP TÔT — avant que le navigateur ait fini
 *  d'installer ce document — peut se retrouver avec un stockage DÉTACHÉ. Il
 *  ne lit rien de ce qui est enregistré, rien de ce qu'il écrit n'est gardé,
 *  il n'entend pas les autres onglets, et il ne s'en remet pas : seul un
 *  rechargement le rétablit. C'est une course dans le navigateur (Chromium),
 *  rare, qui dépend de la machine.
 *
 *  Ce banc la mesure, sur des pages minuscules écrites dans un dossier
 *  temporaire (rien d'une unité, rien du dépôt) :
 *
 *    1. la course PROVOQUÉE : un script posé au tout début du document (comme
 *       le faisait tests/plusieurs-onglets-browser.cjs pour ôter le garde,
 *       jusqu'à la correction 22 b) ;
 *    2. une PAGE qui lit son stockage : dans un script en ligne en tête (comme
 *       le thème de index.html jusqu'à la correction 22 b), en fin de corps
 *       (comme secours.html), dans un script externe, après la parade ;
 *    3. avec --site, les VRAIES pages du dépôt, sur des équipes fictives.
 *
 *  Pour chaque cas et chaque passe, dans un contexte neuf : une page témoin,
 *  qui ne touche le stockage qu'une fois chargée, enregistre une valeur ;
 *  puis la page à l'essai s'ouvre (le premier document d'un onglet neuf), est
 *  rechargée, puis rejointe depuis un autre fichier. À chaque fois : lit-elle
 *  la valeur enregistrée ? Ce qu'elle écrit est-il lu par la page témoin ?
 *  Sinon, le document est compté « détaché ».
 *
 *      node outils/banc-stockage.cjs                  # 100 passes par cas
 *      node outils/banc-stockage.cjs --passes 300     # plus long, plus sûr
 *      node outils/banc-stockage.cjs --site           # aussi les pages du dépôt
 *
 *  LA PARADE : lire `document.cookie` juste avant le premier accès au
 *  stockage. Cette lecture attend la réponse du navigateur par la voie du
 *  document lui-même : quand elle revient, le document est installé, et le
 *  stockage se raccorde. Elle ne lit ni n'écrit aucune donnée.
 *
 *  C'est une mesure, pas un test : elle sort toujours en 0. Playwright vient
 *  de l'environnement, comme pour les tests navigateur.
 * ==========================================================================*/
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const RACINE = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
if (args.includes('--aide') || args.includes('--help')) {
  console.log('node outils/banc-stockage.cjs [--passes N] [--site]\n  --passes N : le nombre de passes par cas (100 par défaut)\n  --site     : mesure aussi les pages du dépôt (index.html, accueil.html, secours.html)');
  process.exit(0);
}
const PASSES = Math.max(1, parseInt(option('--passes'), 10) || 100);
const SITE = args.includes('--site');

/* ---- les pages à l'essai, écrites dans un dossier temporaire --------------------------------------------- */

const page = (tete, corps) => '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>banc</title>' + tete + '</head><body><p>banc</p>' + corps + '</body></html>\n';
const LIRE = "window.__lu = localStorage.getItem('avant');";
const PARADE = 'try { void document.cookie; } catch (e) { /* un document sans témoins */ }';
const FICHIERS = {
  'vide.html': page('', ''),
  'tete.html': page('<script>' + LIRE + '</script>', ''),
  'corps.html': page('', '<script>' + LIRE + '</script>'),
  'externe.html': page('<script src="lire.js"></script>', ''),
  'externe-parade.html': page('<script src="lire-parade.js"></script>', ''),
  'corps-parade.html': page('', '<script>' + PARADE + LIRE + '</script>'),
  'lire.js': LIRE + '\n',
  'lire-parade.js': PARADE + '\n' + LIRE + '\n'
};
/** Un script posé au tout début de chaque document de l'onglet à l'essai (la course provoquée). */
const DEBUT = {
  acces: () => { void window.localStorage; },
  figeEnLisant: () => { Object.defineProperty(window, 'localStorage', { value: window.localStorage, writable: false, configurable: false }); },
  figeSansLire: () => { const d = Object.getOwnPropertyDescriptor(window, 'localStorage'); Object.defineProperty(window, 'localStorage', { get: d.get, set: d.set, enumerable: d.enumerable, configurable: false }); },
  paradePuisAcces: () => { try { void document.cookie; } catch (e) { /* rien */ } void window.localStorage; }
};
const CAS = [
  ['1. La course provoquée : un script posé au tout début du document'],
  ['un accès au stockage, au tout début', 'vide.html', DEBUT.acces],
  ['la propriété figée en la lisant (le test des onglets, avant)', 'vide.html', DEBUT.figeEnLisant],
  ['la propriété figée sans la lire (le test des onglets, après)', 'vide.html', DEBUT.figeSansLire],
  ['document.cookie lu, puis l’accès (la parade)', 'vide.html', DEBUT.paradePuisAcces],
  ['2. Une page qui lit son stockage'],
  ['dans un script en ligne, en tête', 'tete.html', null],
  ['dans un script en ligne, en fin de corps', 'corps.html', null],
  ['en fin de corps, après la parade', 'corps-parade.html', null],
  ['dans un script externe, en tête', 'externe.html', null],
  ['dans un script externe, après la parade', 'externe-parade.html', null],
  ['seulement une fois chargée', 'vide.html', null]
];

/* ---- la mesure --------------------------------------------------------------------------------------------- */

/**
 * Un cas : `passes` contextes neufs. `ouvrir(p)` mène l'onglet à l'essai sur sa page ; `ailleurs` : un autre fichier,
 * pour l'arrivée par navigation ; `lire(p)` et `ecrire(p, n)` : ce que la page lit et écrit ; `vu(o, n)` : ce que la page
 * témoin en lit. Rend { documents, detaches, premier, recharge, navigation }.
 */
async function mesurer(navigateur, o) {
  const x = { documents: 0, detaches: 0, premier: 0, recharge: 0, navigation: 0 };
  for (let i = 0; i < PASSES; i++) {
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const temoin = await contexte.newPage();
      await temoin.goto(o.temoin);
      await o.enregistrer(temoin);
      const p = await contexte.newPage();
      if (o.debut) await p.addInitScript(o.debut);
      const essai = async (ou, n) => {
        x.documents++;
        const lu = await o.lire(p);
        await o.ecrire(p, n);
        if (!lu || !(await o.vu(temoin, n))) { x.detaches++; x[ou]++; }
      };
      await p.goto(o.url); await essai('premier', 1);
      await p.reload(); await essai('recharge', 2);
      await p.goto(o.ailleurs); await p.goto(o.url); await essai('navigation', 3);
    } finally { await contexte.close(); }
  }
  return x;
}
const dire = (nom, x) => console.log('  ' + (x.detaches + ' / ' + x.documents).padStart(11) + '  ' + nom
  + (x.detaches ? '  (à l’ouverture ' + x.premier + ', au rechargement ' + x.recharge + ', à l’arrivée d’un autre fichier ' + x.navigation + ')' : ''));

(async () => {
  const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-banc-stockage-'));
  for (const [nom, texte] of Object.entries(FICHIERS)) fs.writeFileSync(path.join(dossier, nom), texte);
  const U = nom => pathToFileURL(path.join(dossier, nom)).href;
  const navigateur = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote'] } : {}) });
  try {
    console.log('Le banc du stockage : documents détachés / documents ouverts, ' + PASSES + ' passes par cas (trois documents par passe).');
    for (const [nom, fichier, debut] of CAS) {
      if (!fichier) { console.log('\n' + nom); continue; }
      dire(nom, await mesurer(navigateur, { temoin: U('vide.html'), url: U(fichier), ailleurs: U('vide.html'), debut,
        enregistrer: t => t.evaluate(() => localStorage.setItem('avant', 'là')),
        lire: p => p.evaluate(() => localStorage.getItem('avant') === 'là'),
        ecrire: (p, n) => p.evaluate(n => localStorage.setItem('k', String(n)), n),
        vu: (t, n) => t.evaluate(n => localStorage.getItem('k') === String(n), n) }));
    }
    if (SITE) {
      console.log('\n3. Les pages du dépôt, sur des équipes fictives');
      // Des équipes fictives valides, telles que le site les enregistre.
      const c0 = await navigateur.newContext({ viewport: { width: 1280, height: 800 } }), p0 = await c0.newPage();
      await p0.goto(pathToFileURL(path.join(RACINE, 'index.html')).href);
      await p0.evaluate(() => Sim.ateliers.changer(() => { Sim.ateliers.state.ateliers.push({ id: 'tm', nom: 'Équipe témoin', service: 'cuisine', type: 'manuel', debut: '05:00', jour: 0, personnes: 2, pauses: [], lots: [], regime: { actif: true } }); }, ''));
      const equipes = await p0.evaluate(() => localStorage.getItem('ory-ateliers-v1'));
      await c0.close();
      const enregistrer = t => t.evaluate(e => { localStorage.setItem('ory-ateliers-v1', e); localStorage.setItem('ory-ui-theme', 'sombre'); }, equipes);
      const nomEnregistre = (t, n) => t.evaluate(n => { try { return JSON.parse(localStorage.getItem('ory-ateliers-v1')).ateliers.some(a => a.nom === 'Équipe témoin ' + n); } catch (e) { return false; } }, n);
      const site = nom => pathToFileURL(path.join(RACINE, nom)).href;
      dire('index.html : les équipes et le thème lus, un nom changé enregistré', await mesurer(navigateur, { temoin: U('vide.html'), url: site('index.html'), ailleurs: site('secours.html'), enregistrer,
        lire: p => p.evaluate(() => !!(window.Sim && Sim.ateliers) && Sim.ateliers.state.ateliers.some(a => a.id === 'tm') && document.documentElement.dataset.theme === 'sombre'),
        ecrire: (p, n) => p.evaluate(n => { if (window.Sim && Sim.ateliers) Sim.ateliers.changer(() => { const t = Sim.ateliers.state.ateliers.find(a => a.id === 'tm'); if (t) t.nom = 'Équipe témoin ' + n; }, ''); }, n),
        vu: nomEnregistre }));
      dire('accueil.html : le thème lu', await mesurer(navigateur, { temoin: U('vide.html'), url: site('accueil.html'), ailleurs: U('vide.html'), enregistrer,
        lire: p => p.evaluate(() => document.documentElement.dataset.theme === 'sombre' && localStorage.getItem('ory-ui-theme') === 'sombre'),
        ecrire: (p, n) => p.evaluate(n => localStorage.setItem('ory-banc', String(n)), n),
        vu: (t, n) => t.evaluate(n => { const ok = localStorage.getItem('ory-banc') === String(n); localStorage.removeItem('ory-banc'); return ok; }, n) }));
      dire('secours.html : les équipes listées', await mesurer(navigateur, { temoin: U('vide.html'), url: site('secours.html'), ailleurs: U('vide.html'), enregistrer,
        lire: p => p.evaluate(() => /ory-ateliers-v1/.test(document.getElementById('liste').textContent)),
        ecrire: (p, n) => p.evaluate(n => localStorage.setItem('ory-banc', String(n)), n),
        vu: (t, n) => t.evaluate(n => { const ok = localStorage.getItem('ory-banc') === String(n); localStorage.removeItem('ory-banc'); return ok; }, n) }));
    }
    console.log('\nUn document détaché ne lit rien de ce qui est enregistré et n’enregistre rien ; seul un rechargement le rétablit.');
  } finally {
    await navigateur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(2); });
