/* Le fond de plan dans les tests (banc d'essai, correction 15). Le plan de
 * l'unité est confidentiel : son dossier `plan-prive/` est ignoré par Git,
 * absent de tout clone du dépôt public, et aucun test ne doit dépendre de sa
 * présence ni de son absence. On n'y touche donc pas : on crée, dans un
 * dossier temporaire HORS du dépôt, une vue du site (un lien vers chacun de
 * ses fichiers, sauf ceux que .gitignore refuse), avec ou sans son propre
 * `plan-prive/`, dont les douze tuiles sont des images fictives d'un pixel.
 * La page s'ouvre depuis ce dossier comme depuis le dépôt ; la version 2 y lit
 * le même `../plan-prive`. Partagé par les tests navigateur. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RACINE = path.resolve(__dirname, '..');
// Un PNG d'un pixel : une tuile fictive, rien du plan de l'unité.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const TUILES = 12;

/** Les entrées du dépôt que la vue reprend : celles que Git suit ou ne refuse pas. Hors Git (une copie déjà propre), toutes, sauf le plan privé. */
function entrees() {
  let fichiers = null;
  try {
    fichiers = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).split('\0');
  } catch (e) { /* pas un dépôt Git : la copie propre de outils/batterie.cjs */ }
  const noms = fichiers ? [...new Set(fichiers.filter(Boolean).map(f => f.split('/')[0]))] : fs.readdirSync(RACINE);
  return noms.filter(n => n !== 'plan-prive' && n !== '.git' && fs.existsSync(path.join(RACINE, n)));
}

/** Une vue du site hors du dépôt ; avec `planFictif`, son `plan-prive/` aux tuiles fictives. `effacer()` la retire. */
function vueDuSite(planFictif) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-plan-' + (planFictif ? 'fictif' : 'absent') + '-'));
  for (const nom of entrees()) fs.symlinkSync(path.join(RACINE, nom), path.join(racine, nom));
  if (planFictif) {
    fs.mkdirSync(path.join(racine, 'plan-prive'));
    for (let n = 1; n <= TUILES; n++) fs.writeFileSync(path.join(racine, 'plan-prive', 'tuile' + n + '.png'), PIXEL);
  }
  return {
    racine,
    url: fichier => pathToFileURL(path.join(racine, fichier)).href,
    effacer: () => fs.rmSync(racine, { recursive: true, force: true })
  };
}

module.exports = { siteAvecPlanFictif: () => vueDuSite(true), siteSansPlan: () => vueDuSite(false) };
