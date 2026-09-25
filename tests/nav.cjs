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
const accueil = async page => { await page.locator('#btn-accueil').click(); await page.waitForTimeout(150); };

module.exports = { aller, vue, accueil, PREMIERE };
