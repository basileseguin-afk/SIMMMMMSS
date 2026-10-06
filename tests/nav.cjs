/* Aller à une page du menu, comme on le ferait à la main : la partie dans
 * l'en-tête, puis l'onglet de la page. Partagé par les tests navigateur.
 *
 * `vue(page, v)` garde l'ancienne écriture des tests (« aller à la vue des
 * ateliers ») : elle ouvre la page qui était la première de cette vue. */
const PREMIERE = { vols: 'v-departs', ateliers: 'at-chemins', reglages: 'rg-minutes', plan: 'j-plan', flux: 'u-liens' };

async function aller(page, id) {
  const partie = await page.evaluate(id => (OrlyOnglets.partieDe(id) || {}).id, id);
  if (!partie) throw new Error('page inconnue : ' + id);
  if (partie !== 'fichier') {
    const actif = await page.evaluate(() => document.body.dataset.partie);
    if (actif !== partie) { await page.locator(`#menu [data-vers-partie=${partie}]`).click(); await page.waitForTimeout(120); }
  } else {
    await page.locator('#btn-sauvegarde').click(); await page.waitForTimeout(120);
  }
  if (await page.evaluate(() => document.body.dataset.sous) !== id)
    await page.locator(`#sous-onglets [data-sous-onglet=${id}]`).click();
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
const accueil = async page => { await page.locator('#btn-accueil').click(); await page.waitForTimeout(150); };

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

module.exports = { aller, vue, accueil, creerChemin, deplier, effectifSaisi, PREMIERE };
