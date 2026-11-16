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
/* Le plan rejoué montre la journée « En relief » (le site généré d'après les réglages, évolution 16) ou « À plat » (le plan
 * dessiné de l'unité), avec les mêmes données ; il s'ouvre en relief. Le choix tient jusqu'au rechargement de la page.
 * `vueDuPlan(page, 'plat' | 'relief')` clique le choix, comme à la main ; sans ce choix (la version 2), elle ne fait rien. */
async function vueDuPlan(page, mode) {
  const b = page.locator(`#direct-choix [data-direct-mode=${mode}]`);
  if (!(await b.count()) || !(await b.isVisible())) return;
  if (await page.evaluate(() => document.body.dataset.direct) !== mode) { await b.click(); await page.waitForTimeout(150); }
}
/* `aller(page, 'j-plan')` choisit « À plat » : les tests d'avant l'évolution 16 y lisent le plan dessiné. Ceux de la vue en
 * relief demandent `{ relief: true }`. En relief, sous 1 500 px de large, « En ce moment » est replié à l'ouverture
 * (évolution 16, retouches) : ces tests lisent le panneau, il s'ouvre donc par son bouton, comme à la main — sauf avec
 * `{ panneau: false }`, pour les tests qui regardent la page telle qu'elle s'ouvre. */
async function aller(page, id, options) {
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
    else if (await page.evaluate(id => typeof OrlyOnglets.auMenu === 'function' && !OrlyOnglets.page(id).groupe && !OrlyOnglets.auMenu(id), id)) {
      // Une page hors du menu (v1, évolution 19 b : « Liens entre services » quand toutes les commandes ont un chemin) :
      // « Aller à… » y mène encore — on y va par là, comme à la main.
      const nom = await page.evaluate(id => OrlyOnglets.page(id).nom, id);
      await page.keyboard.press('Control+k'); await page.waitForSelector('dialog.palette [role=option]');
      await page.keyboard.type(nom); await page.waitForTimeout(200);
      const options = page.locator('dialog.palette [role=option]');
      const i = (await options.evaluateAll(os => os.map(o => (o.querySelector('.pal-nom') || o).textContent.trim()))).findIndex(t => t === nom || t.endsWith('› ' + nom));
      if (i < 0) throw new Error('page introuvable par « Aller à… » : ' + id);
      await options.nth(i).click(); await page.waitForTimeout(150);
    } else {
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
  if (id === 'j-plan') await vueDuPlan(page, options && options.relief ? 'relief' : 'plat');
  if (id === 'j-plan' && options && options.relief && options.panneau !== false && await page.evaluate(() => document.body.classList.contains('sans-en-ce-moment'))) {
    await page.locator('#btn-en-ce-moment').click(); await page.waitForTimeout(150);
  }
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

module.exports = { aller, vue, vueDuPlan, accueil, terminerPlan, creerChemin, deplier, effectifSaisi, repondre, pret, recharger, enregistre, PREMIERE };
