/* Banc d'essai, correction 15 — la batterie complète dans un clone propre
 * (outils/batterie.cjs). Avant chaque commit, la batterie se joue dans une
 * copie du dépôt sans les fichiers que .gitignore refuse (le plan privé, les
 * sauvegardes, le réel…) : un test qui en dépendrait échoue là, comme dans
 * tout clone du dépôt public. Ici, sur un petit dépôt Git fictif créé par le
 * test : ses tests Node, deux tests navigateur factices (l'un réussit, l'autre
 * échoue), un fichier ignoré qui ne doit pas suivre. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const B = require('../outils/batterie.cjs');

/** Les journaux d'une batterie jouée par le test : il les efface. */
const sansJournaux = j => { if (j) fs.rmSync(j, { recursive: true, force: true }); };
const journauxDe = sortie => (sortie.match(/journaux : (.+)$/m) || [])[1];

/** Un dépôt fictif : tests, fichiers ignorés, un fichier nouveau non suivi. */
function depot() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-batterie-test-'));
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), t); };
  // Un Git à part : ni signature, ni crochets de la configuration de la personne.
  const git = (...a) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=/dev/null', ...a], { cwd: r, stdio: 'pipe' });
  ecrire('.gitignore', 'plan-prive/\nreel*.csv\n');
  ecrire('page.js', 'module.exports = 1;\n');
  // Un test qui se sert d'un fichier ignoré échouerait : la copie n'en a aucun.
  const sansIgnores = "if (require('fs').existsSync('plan-prive') || require('fs').existsSync('reel-essai.csv')) process.exit(3);\n";
  ecrire('tests/a.test.cjs', "require('node:test')('a', () => {});\n" + sansIgnores);
  ecrire('tests/v2/b.test.cjs', "require('node:test')('b', () => {});\n");
  ecrire('tests/ok-browser.cjs', sansIgnores + "console.log('ok');\n");
  ecrire('tests/ko-browser.cjs', "console.error('échec voulu');process.exitCode = 1;\n");
  ecrire('tests/aide.cjs', 'module.exports = {};\n');
  ecrire('plan-prive/tuile1.png', 'fictif');
  ecrire('reel-essai.csv', 'date;role\n');
  fs.symlinkSync('page.js', path.join(r, 'lien.js'));
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'départ');
  ecrire('tests/nouveau-browser.cjs', sansIgnores);
  // Un lien vers un dossier, nouveau : il suit comme un lien, sans casser la copie.
  fs.symlinkSync(os.tmpdir(), path.join(r, 'ailleurs'));
  return r;
}

test('la copie propre : les fichiers suivis et les nouveaux, jamais ceux que .gitignore refuse', () => {
  const r = depot();
  try {
    const f = B.fichiersPropres(r);
    assert.ok(f.includes('tests/nouveau-browser.cjs') && f.includes('page.js') && f.includes('.gitignore'));
    assert.deepEqual(f.filter(x => x.startsWith('plan-prive') || x.startsWith('reel')), []);
    assert.deepEqual(B.testsDe(r), {
      node: ['tests/a.test.cjs', 'tests/v2/b.test.cjs'],
      navigateur: ['tests/ko-browser.cjs', 'tests/nouveau-browser.cjs', 'tests/ok-browser.cjs']
    });
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('la batterie dans une copie propre : chaque test, le bilan, et un échec qui se voit', () => {
  const r = depot(), lignes = [];
  try {
    const b = B.lancerBatterie({ racine: r, ecrire: l => lignes.push(l) });
    assert.equal(b.ok, false);
    assert.deepEqual(lignes.filter(l => /^(NODE|OK|ÉCHEC|FIN)/.test(l)).map(l => l.replace(/ \(\d+ s\)/, '').replace(/ — journaux : .*/, '')), [
      'NODE OK (2 réussis, 0 en échec)',
      'ÉCHEC ko-browser.cjs',
      'OK   nouveau-browser.cjs',
      'OK   ok-browser.cjs',
      'FIN 3 OK, 1 ÉCHEC'
    ]);
    assert.match(fs.readFileSync(path.join(b.journaux, 'ko-browser.cjs.log'), 'utf8'), /échec voulu/, 'le journal de l’échec reste');
    assert.equal(fs.existsSync(b.copie), false, 'la copie est effacée');
    assert.ok(!b.copie.startsWith(r) && !b.journaux.startsWith(r), 'hors du dépôt');
    sansJournaux(b.journaux);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('un commit : joué dans un worktree Git, sans ce qui n’est pas commité ; le worktree est retiré', () => {
  const r = depot(), lignes = [];
  try {
    const b = B.lancerBatterie({ racine: r, commit: 'HEAD', ecrire: l => lignes.push(l) });
    assert.ok(!lignes.some(l => /nouveau-browser/.test(l)), 'le fichier non commité n’y est pas');
    assert.ok(lignes.some(l => l.startsWith('FIN 2 OK, 1 ÉCHEC')), lignes.join('\n'));
    assert.match(lignes[0], /\(le commit [0-9a-f]+\)$/);
    assert.equal(fs.existsSync(b.copie), false);
    assert.equal(execFileSync('git', ['worktree', 'list'], { cwd: r, encoding: 'utf8' }).includes(b.copie), false, 'le worktree est retiré');
    sansJournaux(b.journaux);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('interrompue (Ctrl-C) : elle s’arrête, le dit, et ne compte pas comme réussie ; les liens restent des liens', () => {
  const r = depot(), lignes = [];
  try {
    const b = B.lancerBatterie({ racine: r, garder: true, arreter: () => true, ecrire: l => lignes.push(l) });
    assert.deepEqual([b.ok, b.interrompue, lignes.includes('Interrompue.')], [false, true, true]);
    assert.equal(fs.lstatSync(path.join(b.copie, 'lien.js')).isSymbolicLink(), true);
    assert.equal(fs.lstatSync(path.join(b.copie, 'ailleurs')).isSymbolicLink(), true);
    fs.rmSync(b.copie, { recursive: true, force: true }); sansJournaux(b.journaux);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('l’outil en ligne de commande : 1 si un test échoue, 0 si tout passe, 2 si la batterie ne peut pas se jouer', () => {
  const r = depot(), outil = path.join(__dirname, '..', 'outils', 'batterie.cjs');
  const lancer = (...a) => spawnSync(process.execPath, [outil, ...a], { encoding: 'utf8' });
  const autre = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-pas-git-'));
  try {
    const un = lancer('--racine', r);
    assert.equal(un.status, 1, un.stdout + un.stderr);
    assert.match(un.stdout, /^FIN 3 OK, 1 ÉCHEC/m);
    sansJournaux(journauxDe(un.stdout));
    fs.rmSync(path.join(r, 'tests', 'ko-browser.cjs'));
    const zero = lancer('--racine', r);
    assert.equal(zero.status, 0);
    sansJournaux(journauxDe(zero.stdout));
    const mal = lancer('--inconnu');
    assert.deepEqual([mal.status, /Usage/.test(mal.stderr)], [2, true]);
    const horsGit = lancer('--racine', autre);
    assert.deepEqual([horsGit.status, /n’est pas un dépôt Git/.test(horsGit.stderr)], [2, true]);
    assert.equal(lancer('--racine', r, '--commit', 'révision-inconnue').status, 2);
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(autre, { recursive: true, force: true }); }
});

test('les arguments de l’outil', () => {
  assert.deepEqual(B.lireArguments([]), { commit: null, garder: false });
  assert.deepEqual(B.lireArguments(['--commit', 'HEAD', '--garder']), { commit: 'HEAD', garder: true });
  assert.equal(B.lireArguments(['--racine', '.']).racine, process.cwd());
  assert.throws(() => B.lireArguments(['--commit']), /Usage/);
  assert.throws(() => B.lireArguments(['--racine', '--garder']), /Usage/);
  assert.throws(() => B.lireArguments(['--inconnu']), /Usage/);
});
