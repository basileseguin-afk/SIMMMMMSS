#!/usr/bin/env node
/* ==========================================================================
 *  LA BATTERIE COMPLÈTE DANS UN CLONE PROPRE (banc d'essai, correction 15)
 *
 *  Le dépôt est public : un clone n'a ni le plan privé (`plan-prive/`), ni
 *  les sauvegardes, ni le réel, que .gitignore refuse. Un test qui en
 *  dépendrait passe ici et échoue partout ailleurs. Avant chaque commit, la
 *  batterie complète (les tests Node, puis chaque test navigateur) se joue
 *  donc dans une copie propre, hors du dépôt :
 *
 *      node outils/batterie.cjs                  # la copie de travail, sans les fichiers ignorés
 *      node outils/batterie.cjs --commit HEAD    # un commit, dans un worktree Git
 *      node outils/batterie.cjs --garder         # garder la copie (pour y relancer un test)
 *      node outils/batterie.cjs --racine <dépôt> # un autre dépôt que celui de l'outil
 *
 *  Chaque test donne une ligne (« OK », « ÉCHEC »), puis le bilan :
 *  « FIN n OK, m ÉCHEC ». Les journaux restent dans un dossier temporaire.
 *  Code de sortie : 0 si tout passe, 1 si au moins un test échoue, 2 si la
 *  batterie n'a pas pu se jouer (appel mal formé, pas un dépôt Git…), 130 si
 *  elle a été interrompue (Ctrl-C, SIGTERM). L'environnement passe tel quel
 *  (CHROMIUM_EXECUTABLE_PATH, NODE_PATH…) : Playwright doit s'y trouver, pas
 *  dans un `node_modules/` du dépôt, qu'une copie propre n'a pas.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const USAGE = 'Usage : node outils/batterie.cjs [--commit <révision>] [--garder] [--racine <dépôt>]';
// Un test navigateur qui dépasse un quart d'heure est bloqué : compté en échec.
const DELAI_NAVIGATEUR = 15 * 60 * 1000;
const git = (racine, ...a) => execFileSync('git', a, { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

function lireArguments(argv) {
  const o = { commit: null, garder: false };
  const valeur = i => { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(USAGE); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--garder') o.garder = true;
    else if (argv[i] === '--commit') o.commit = valeur(i++);
    else if (argv[i] === '--racine') o.racine = path.resolve(valeur(i++));
    else throw new Error(USAGE);
  }
  return o;
}

/** Les fichiers d'une copie propre : suivis par Git, ou nouveaux mais pas ignorés ; jamais ce que .gitignore refuse. */
function fichiersPropres(racine) {
  let sortie;
  try { sortie = git(racine, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'); }
  catch (e) { throw new Error(racine + ' n’est pas un dépôt Git : ' + String(e.stderr || e.message).trim()); }
  return sortie.split('\0').filter(f => f && fs.existsSync(path.join(racine, f))).sort();
}

/** Les tests de la batterie : les tests Node (racine et v2), puis chaque test navigateur. */
function testsDe(racine) {
  const liste = (d, motif) => fs.existsSync(path.join(racine, d))
    ? fs.readdirSync(path.join(racine, d)).filter(f => motif.test(f)).sort().map(f => d + '/' + f) : [];
  return {
    node: liste('tests', /\.test\.cjs$/).concat(liste('tests/v2', /\.test\.cjs$/)),
    navigateur: liste('tests', /^browser-smoke\.cjs$/).concat(liste('tests', /-browser\.cjs$/))
  };
}

/** Copie un fichier de la liste : un lien reste un lien ; un dossier (sous-module) n'est pas un fichier, il ne suit pas. */
function copier(depuis, vers) {
  const s = fs.lstatSync(depuis);
  if (s.isDirectory()) return false;
  fs.mkdirSync(path.dirname(vers), { recursive: true });
  if (s.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(depuis), vers);
  else fs.copyFileSync(depuis, vers);
  return true;
}

/** La copie propre, hors du dépôt : la copie de travail sans les fichiers ignorés, ou un commit dans un worktree. */
function preparer(racine, commit) {
  if (commit) {
    const dossier = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ory-batterie-')), 'depot');
    try { git(racine, 'worktree', 'add', '--detach', dossier, commit); }
    catch (e) { fs.rmSync(path.dirname(dossier), { recursive: true, force: true }); throw new Error('worktree impossible (' + commit + ') : ' + String(e.stderr || e.message).trim()); }
    return { dossier, quoi: 'le commit ' + git(dossier, 'rev-parse', '--short', 'HEAD').trim(),
      effacer: () => { git(racine, 'worktree', 'remove', '--force', dossier); fs.rmSync(path.dirname(dossier), { recursive: true, force: true }); } };
  }
  const fichiers = fichiersPropres(racine), dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-batterie-'));
  let n = 0;
  try { for (const f of fichiers) if (copier(path.join(racine, f), path.join(dossier, f))) n++; }
  catch (e) { fs.rmSync(dossier, { recursive: true, force: true }); throw e; }
  return { dossier, quoi: 'la copie de travail, sans les fichiers ignorés (' + n + ' fichiers)',
    effacer: () => fs.rmSync(dossier, { recursive: true, force: true }) };
}

/** L'environnement des tests : celui de l'appel, sans la marque d'un lanceur de tests Node parent (l'outil peut être lancé par un test). */
function environnement() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** Un test lancé dans la copie : sa sortie va dans son journal. */
function jouer(dossier, journaux, nom, args, delai) {
  const debut = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: dossier, env: environnement(), encoding: 'utf8', timeout: delai, maxBuffer: 256 * 1024 * 1024 });
  const sortie = (r.stdout || '') + (r.stderr || '') + (r.error ? '\n' + r.error.message : '');
  fs.writeFileSync(path.join(journaux, nom + '.log'), sortie);
  return { ok: r.status === 0, secondes: Math.round((Date.now() - debut) / 1000), sortie };
}

/** Les tests, l'un après l'autre ; `arreter()` dit s'il faut s'arrêter (Ctrl-C). */
function jouerTout(dossier, journaux, ecrire, arreter) {
  const t = testsDe(dossier), compte = { ok: 0, echecs: 0 };
  const noter = (ok, ligne) => { ecrire(ligne); if (ok) compte.ok++; else compte.echecs++; };
  if (t.node.length) {
    const n = jouer(dossier, journaux, 'node', ['--test', '--test-reporter=tap', ...t.node], DELAI_NAVIGATEUR * 2);
    const nombre = m => Number((n.sortie.match(new RegExp('^# ' + m + ' (\\d+)', 'm')) || [])[1] || 0);
    noter(n.ok, 'NODE ' + (n.ok ? 'OK' : 'ÉCHEC') + ' (' + nombre('pass') + ' réussis, ' + nombre('fail') + ' en échec)');
  }
  for (const f of t.navigateur) {
    if (arreter()) { ecrire('Interrompue.'); compte.interrompue = true; break; }
    const nom = path.basename(f), r = jouer(dossier, journaux, nom, [f], DELAI_NAVIGATEUR);
    noter(r.ok, (r.ok ? 'OK   ' : 'ÉCHEC ') + nom + ' (' + r.secondes + ' s)');
  }
  return compte;
}

/** La batterie complète dans une copie propre ; chaque ligne passe par `ecrire`. */
function lancerBatterie({ racine = RACINE, commit = null, garder = false, ecrire = l => process.stdout.write(l + '\n'), arreter = () => false } = {}) {
  const copie = preparer(racine, commit);
  let journaux = null, compte = { ok: 0, echecs: 0 };
  try {
    journaux = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-batterie-journaux-'));
    ecrire('Batterie dans une copie propre : ' + copie.dossier + ' (' + copie.quoi + ')');
    compte = jouerTout(copie.dossier, journaux, ecrire, arreter);
    ecrire('FIN ' + compte.ok + ' OK, ' + compte.echecs + ' ÉCHEC — journaux : ' + journaux);
  } finally {
    // La copie effacée ne change pas le bilan ; si elle ne s'efface pas, on le dit.
    if (!garder) try { copie.effacer(); } catch (e) { ecrire('Copie non effacée (' + copie.dossier + ') : ' + e.message); }
  }
  return { ok: compte.echecs === 0 && !compte.interrompue, interrompue: !!compte.interrompue, reussis: compte.ok, echecs: compte.echecs, copie: copie.dossier, journaux };
}

if (require.main === module) {
  let interrompre = false;
  // Ctrl-C arrête aussi le test en cours (même groupe de processus) ; arrêtée ainsi ou par SIGTERM, la batterie
  // s'arrête après lui et range sa copie.
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrompre = true; });
  try {
    const b = lancerBatterie({ ...lireArguments(process.argv.slice(2)), arreter: () => interrompre });
    process.exitCode = b.interrompue ? 130 : b.ok ? 0 : 1;
  } catch (e) {
    process.stderr.write('Batterie impossible : ' + e.message + '\n');
    process.exitCode = 2;
  }
}

module.exports = { lireArguments, fichiersPropres, testsDe, lancerBatterie, USAGE };
