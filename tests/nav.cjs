/* Aller à une page du menu, comme on le ferait à la main : son entrée dans le
 * menu, puis son onglet interne si elle en est un (la version 1, évolution
 * 22 a) ; la partie, puis l'onglet de la page (la version 2). Partagé par les
 * tests navigateur.
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
/* « Aller à… » : chercher une page par son nom, et l'ouvrir — pour une page hors du menu. */
async function parAllerA(page, id) {
  const nom = await page.evaluate(id => OrlyOnglets.page(id).nom, id);
  await page.keyboard.press('Control+k'); await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type(nom); await page.waitForTimeout(200);
  const options = page.locator('dialog.palette [role=option]');
  const i = (await options.evaluateAll(os => os.map(o => (o.querySelector('.pal-nom') || o).textContent.trim()))).findIndex(t => t === nom || t.endsWith('› ' + nom));
  if (i < 0) throw new Error('page introuvable par « Aller à… » : ' + id);
  await options.nth(i).click(); await page.waitForTimeout(150);
}
/* Le menu de la version 1 (évolution 22 a) : toutes ses entrées sont visibles. Une page est une entrée, ou un onglet
 * interne de son entrée (« Services et équipes », « Chemins », « Contrôles », « Détails ») ; « Fichiers » est en bas ;
 * une page hors du menu (« Liens entre services » quand toutes les commandes ont un chemin) s'ouvre par « Aller à… ». */
async function parLeMenu(page, id) {
  if (await page.evaluate(() => document.body.dataset.sous) === id) return;
  const e = await page.evaluate(id => {
    const o = OrlyOnglets.page(id);
    if (!OrlyOnglets.auMenu(id, document.body.dataset.sous)) return { allerA: true };
    if (OrlyOnglets.partieDe(id).bas) return { bas: true };
    return { cle: o.groupe ? 'groupe:' + o.groupe : id };
  }, id);
  if (e.allerA) return parAllerA(page, id);
  await page.locator(e.bas ? '#btn-sauvegarde' : `#menu [data-entree="${e.cle}"]`).click(); await page.waitForTimeout(120);
  if (await page.evaluate(() => document.body.dataset.sous) !== id) await page.locator(`#onglets-internes [data-sous-onglet=${id}]`).click();
}
async function aller(page, id, options) {
  const partie = await page.evaluate(id => (OrlyOnglets.partieDe(id) || {}).id, id);
  if (!partie) throw new Error('page inconnue : ' + id);
  if (id !== 'u-plan') await terminerPlan(page);
  if (await page.evaluate(() => typeof OrlyOnglets.entrees === 'function')) await parLeMenu(page, id);
  else {
    // La version 2 (gelée) : la partie dans le menu, puis l'onglet de la page.
    if (partie !== 'fichier') {
      const actif = await page.evaluate(() => document.body.dataset.partie);
      if (actif !== partie) { await page.locator(`#menu [data-vers-partie=${partie}]`).click(); await page.waitForTimeout(120); }
    } else {
      await page.locator('#btn-sauvegarde').click(); await page.waitForTimeout(120);
    }
    if (await page.evaluate(() => document.body.dataset.sous) !== id) {
      const direct = page.locator(`#sous-onglets [data-sous-onglet=${id}]`);
      if (await direct.count()) await direct.click();
      else if (await page.evaluate(id => typeof OrlyOnglets.auMenu === 'function' && !OrlyOnglets.page(id).groupe && !OrlyOnglets.auMenu(id), id)) await parAllerA(page, id);
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
  // Y être par l'ouverture de l'application sur la Synthèse (v1, évolution 22 a) n'est pas y être allé : on retrouve
  // alors la dernière page choisie de la vue, comme en arrivant de l'accueil.
  const ici = await page.evaluate(() => ({ vue: document.body.dataset.vue, ouverture: !!Sim.onglets.ouverture }));
  if (ici.vue === v && !ici.ouverture) return;
  const id = await page.evaluate(([v, o]) => (o ? Sim.onglets.retenue(v) : Sim.onglets.actif(v)), [v, ici.ouverture]);
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
/* Ouvrir une entrée du menu, comme à la main : en version 1 (évolution 22 a), l'entrée `v1` — un identifiant de page, ou
 * « groupe:<groupe> » pour une entrée qui réunit plusieurs pages ; en version 2 (gelée), la partie `v2`. */
async function entree(page, v1, v2) {
  const neuf = await page.evaluate(() => typeof OrlyOnglets.entrees === 'function');
  await page.locator(neuf ? `#menu [data-entree="${v1}"]` : `#menu [data-vers-partie=${v2}]`).click();
  await page.waitForTimeout(150);
}
/* La fiche d'une équipe, dans la fiche de son service — ou d'un service `depuis` qu'elle fait aussi, à la chaîne.
 * Version 1 (évolution 22 b) : dans « Services et équipes », le service dans la liste, puis la ligne de l'équipe dans le
 * tableau « Ses équipes », comme à la main ; sa fiche s'ouvre à la place de celle du service, avec tous ses réglages.
 * Version 2 (gelée) : la fiche du service porte déjà celles de ses équipes — choisir le service suffit.
 * `retour(page)` revient à la fiche du service. */
async function equipe(page, id, depuis) {
  const service = depuis || await page.evaluate(id => { const a = Sim.ateliers.state.ateliers.find(x => x.id === id); return a ? a.service : null; }, id);
  if (!service) throw new Error('équipe inconnue : ' + id);
  await aller(page, 'mu-services');
  const neuf = await page.evaluate(() => !!(Sim.unite && Sim.unite.ouvrirEquipe));
  if (neuf && await page.evaluate(([id, s]) => Sim.unite.equipeOuverte === id && Sim.unite.choisi === s, [id, service])) return;
  await page.locator(`#mu-services .mu-liste [data-mu-choisir="${service}"]`).click(); await page.waitForTimeout(150);
  if (neuf) { await page.locator(`#mu-services .se-equipes .se-eq-nom[data-se-equipe="${id}"]`).click(); await page.waitForTimeout(200); }
}
/* La fiche d'un service : son bouton dans la liste de « Services et équipes » (en version 1, la fiche d'une équipe ouverte se referme). */
async function service(page, id) {
  await aller(page, 'mu-services');
  await page.locator(`#mu-services .mu-liste [data-mu-choisir="${id}"]`).click(); await page.waitForTimeout(150);
}
/* La fiche d'un service, son choix d'effectif déplié (« Effectif constant », « Effectif imposé ») : en version 1, il est replié
 * sous le tableau de ses équipes. */
async function effectif(page, id) { await service(page, id); await section(page, 'effectif'); }
/* Une section de la fiche d'un service (« equipes », « temps », « avance » ; en version 1, « effectif » : le choix de l'effectif
 * du service, sous le tableau de ses équipes) : repliée, elle s'ouvre par son titre, comme à la main. En version 1
 * (évolution 22 b), « Ses temps par vol », « Réglages avancés » et l'effectif sont repliés d'abord. */
async function section(page, cle) {
  const d = page.locator(`#mu-services details[data-mu-section="${cle}"]`);
  if (await d.count() && !(await d.evaluate(e => e.open))) { await d.locator('> summary').click(); await page.waitForTimeout(150); }
}
/* « Ajouter un service » (v1, évolution 22 b) : son formulaire se déplie en tête de la liste. En version 2, il est déjà là. */
async function ajouterService(page) {
  const d = page.locator('#mu-services details.se-ajout');
  if (await d.count() && !(await d.evaluate(e => e.open))) { await d.locator('> summary').click(); await page.waitForTimeout(150); }
}
async function retour(page) {
  const b = page.locator('#mu-services [data-se-retour]');
  if (await b.count()) { await b.click(); await page.waitForTimeout(150); }
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

module.exports = { aller, vue, vueDuPlan, entree, equipe, service, effectif, retour, section, ajouterService, accueil, terminerPlan, creerChemin, deplier, effectifSaisi, repondre, pret, recharger, enregistre, PREMIERE };
