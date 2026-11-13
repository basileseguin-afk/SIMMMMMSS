/* Aller à une page du menu, comme on le ferait à la main : la partie dans
 * l'en-tête, puis l'onglet de la page. Partagé par les tests navigateur.
 *
 * `vue(page, v)` garde l'ancienne écriture des tests (« aller à la vue des
 * ateliers ») : elle ouvre la page qui était la première de cette vue. */
const PREMIERE = { vols: 'v-departs', ateliers: 'at-chemins', reglages: 'rg-minutes', plan: 'j-plan', flux: 'u-liens' };

/* Le plan de l'unité (refonte, étape 5) ouvre l'édition, et le menu attend
 * qu'on la termine : on la termine avant d'aller ailleurs, comme à la main. */
async function terminerPlan(page) {
  if (await page.evaluate(() => document.body.classList.contains('plan-editing'))) {
    await page.locator('#edit-done').click(); await page.waitForTimeout(150);
  }
}
async function aller(page, id) {
  const partie = await page.evaluate(id => (OrlyOnglets.partieDe(id) || {}).id, id);
  if (!partie) throw new Error('page inconnue : ' + id);
  if (id !== 'u-plan') await terminerPlan(page);
  if (partie !== 'fichier') {
    const actif = await page.evaluate(() => document.body.dataset.partie);
    if (actif !== partie) { await page.locator(`#menu [data-vers-partie=${partie}]`).click(); await page.waitForTimeout(120); }
  } else {
    await page.locator('#btn-sauvegarde').click(); await page.waitForTimeout(120);
  }
  if (await page.evaluate(() => document.body.dataset.sous) !== id) {
    const direct = page.locator(`#sous-onglets [data-sous-onglet=${id}]`);
    if (await direct.count()) await direct.click();
    else {
      // Une page d'un groupe (« Détails », évolution 15 c) : son entrée au menu, puis son onglet interne, comme à la main.
      const entree = await page.evaluate(id => {
        const g = OrlyOnglets.page(id).groupe, o = g && OrlyOnglets.menuDe(document.body.dataset.partie, Sim.onglets.choix).find(x => x.groupe === g);
        return o ? o.id : null;
      }, id);
      if (!entree) throw new Error('page absente du menu : ' + id);
      await page.locator(`#sous-onglets [data-sous-onglet=${entree}]`).click(); await page.waitForTimeout(120);
      if (await page.evaluate(() => document.body.dataset.sous) !== id) await page.locator(`#onglets-internes [data-sous-onglet=${id}]`).click();
    }
  }
  await page.waitForTimeout(150);
}
/* Comme l'ancienne barre d'étapes : aller à une vue, c'est retrouver sa
 * dernière page ouverte (sinon sa première) ; y être déjà ne change rien. */
async function vue(page, v) {
  if (!PREMIERE[v]) return aller(page, v);
  if (await page.evaluate(() => document.body.dataset.vue) === v) return;
  const id = await page.evaluate(v => Sim.onglets.actif(v), v);
  await aller(page, id);
}
/* L'effectif saisi à la main partout (05/10) : depuis l'effectif calculé, un
 * service qui prépare déduit les personnes de ses homme-minutes. Les tests qui
 * règlent les personnes d'une équipe à la main et vérifient les durées qui en
 * découlent (récap, Excel…) imposent donc l'effectif dans tous les services
 * (« Effectif imposé (essai) », 06/10) : les minutes par vol s'appliquent à
 * l'effectif saisi. (« Constant » n'aurait plus de minutes par vol.) */
async function effectifSaisi(page) {
  await page.evaluate(() => Sim.ateliers.changer(() => {
    Sim.ateliers.state.effectifs = Object.fromEntries(Sim.ateliers.a.services().map(s => [s.id, 'impose']));
  }, ''));
  await page.waitForTimeout(100);
}
const accueil = async page => { await terminerPlan(page); await page.locator('#btn-accueil').click(); await page.waitForTimeout(150); };

/* Un chemin à elle pour une commande (Chemins › Chemin d’une commande) : si elle
 * suit un flux, le formulaire est replié sous « Ou bien : un chemin à elle… ». */
async function creerChemin(page, c) {
  const b = page.locator(`[data-pc-action=creer][data-classe="${c}"]`);
  if (!(await b.count())) return false;
  if (!(await b.isVisible())) await page.locator('.pc-creer-plus>summary').click();
  await b.click(); await page.waitForTimeout(250);
  return true;
}
/** Le tableau des minutes range les classes sous leur compagnie, repliées (02/10) : tout déplier. */
async function deplier(page) {
  const b = page.locator('#rg-recap [data-rg-action=recap-tout][data-ouvrir="1"]');
  if (await b.count()) { await b.click(); await page.waitForTimeout(100); }
}

/* Une question du site (notifications.js, 08/10) : avant un geste qui ne se
 * défait pas d'un clic (supprimer un service et ses équipes, restaurer une
 * sauvegarde…), une fenêtre demande. `oui` y répond par le geste, sinon par
 * « Ne rien changer ». Les gestes qui se défont ne demandent plus rien. */
async function repondre(page, oui = true) {
  const d = page.locator('dialog.question[open]');
  await d.waitFor({ state: 'visible', timeout: 3000 });
  await d.locator(oui ? '[value=oui]' : '[value=non]').click();
  await page.waitForTimeout(150);
}

/* Le site a fini de démarrer (après une ouverture ou un rechargement) : ses objets sont là, et la marque du démarrage
 * (sim.js, « ory-demarrage-en-cours ») est effacée. On attend cet état plutôt qu'un délai (correction 18 c) : sur une machine
 * chargée, le démarrage prend le temps qu'il lui faut. */
async function pret(page) {
  await page.waitForFunction(() => {
    try { return !!(window.Sim && Sim.editor && Sim.ateliers && Sim.onglets && window.OrlyOnglets) && document.readyState === 'complete' && localStorage.getItem('ory-demarrage-en-cours') === null; }
    catch (e) { return false; }
  }, null, { timeout: 120000 });
}
/** Recharger la page, puis attendre qu'elle ait redémarré. */
async function recharger(page) { await page.reload(); await pret(page); }
/**
 * Attendre qu'une donnée soit enregistrée dans ce navigateur : `lire(valeur)` (une fonction passée à la page) dit si la clé
 * `cle` du stockage porte ce qu'on attend. Avant un rechargement : ce qui n'est pas encore écrit ne sera pas relu.
 */
async function enregistre(page, cle, lire, arg) {
  await page.waitForFunction(([k, source, x]) => {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v != null && !!(new Function('v', 'x', 'return (' + source + ')(v, x);'))(v, x); } catch (e) { return false; }
  }, [cle, lire.toString(), arg === undefined ? null : arg], { timeout: 60000 });
}

module.exports = { aller, vue, accueil, terminerPlan, creerChemin, deplier, effectifSaisi, repondre, pret, recharger, enregistre, PREMIERE };
