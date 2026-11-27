/* ==========================================================================
 *  LA LISTE DES COMPAGNIES (version 1, évolution 26 b)
 *
 *  Les compagnies d'abord, les vols à la fin. L'utilisateur tient la liste des
 *  compagnies de son unité, chacune avec ses classes ; une compagnie y existe
 *  même sans vol. La liste vit dans l'état des équipes (`compagnies`, dans
 *  `ory-ateliers-v1`) :
 *
 *    compagnies: [{ nom: 'NORD', classes: ['BC', 'YC'] }, …]
 *
 *  Sans liste (une unité d'avant), rien ne change : les commandes viennent du
 *  programme de vols, moins les classes retirées, plus les classes ajoutées à
 *  la main (moteur/journee.js, `classesDuProgramme`).
 *
 *  Avec une liste, elle fait foi : les commandes sont celles de la liste, ni
 *  plus ni moins. Le moteur n'est pas touché : la liste se traduit, avant le
 *  calcul, dans les deux listes qu'il lit déjà (`etatEffectif`) —
 *    - une classe du programme qui n'est pas dans la liste est retirée ;
 *    - une classe de la liste qu'aucun vol du programme ne porte est ajoutée
 *      (une commande sans vol, comme une classe ajoutée à la main).
 *  Une classe de la liste que le programme porte un autre jour n'est pas une
 *  commande les jours où elle ne vole pas : c'est une commande « avec des vols ».
 *
 *  « En faire ma liste » (`listeDesVols`) écrit la liste telle qu'elle est : les
 *  compagnies du programme (tous ses jours, départs et retours) et celles des
 *  classes ajoutées, chacune avec ses commandes d'aujourd'hui (les classes
 *  ajoutées comprises, les classes retirées exclues). Juste après, l'état
 *  effectif est l'état lui-même : le calcul rend le même résultat, champ par
 *  champ.
 *
 *  Un seul chemin de calcul : la page et les outils (outils/simuler-journee.cjs,
 *  outils/simuler-periode.cjs) préparent la sauvegarde et les vols ici, puis
 *  appellent le même moteur. Module pur, testé en Node.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);

  /** Le plus de compagnies qu'une liste garde. */
  const MAX_COMPAGNIES = 500;
  /** Un nom de compagnie s'écrit comme partout ailleurs : sans espaces autour, en majuscules, 40 caractères au plus. */
  const normaliser = c => String(c ?? '').trim().toUpperCase().slice(0, 40);

  /**
   * La liste lue et mise au propre, ou `null` quand l'unité n'en a pas (une unité d'avant). Une liste vide est une liste.
   * Refusée en entier, avec ce qu'il faut corriger, si une compagnie n'a pas de nom, porte une barre « / » ou revient deux fois.
   * @returns {Array<{nom:string, classes:string[]}>|null}
   */
  function lire(brut) {
    if (brut === undefined || brut === null) return null;
    if (!Array.isArray(brut)) throw new Error('La liste des compagnies doit être une liste.');
    if (brut.length > MAX_COMPAGNIES) throw new Error('Une liste de ' + MAX_COMPAGNIES + ' compagnies au plus.');
    const vus = new Set();
    return brut.map(c => {
      if (!c || typeof c !== 'object') throw new Error('Une compagnie de la liste est illisible.');
      const nom = normaliser(c.nom);
      if (!nom) throw new Error('Une compagnie de la liste n’a pas de nom.');
      if (nom.includes('/')) throw new Error('Le nom de la compagnie « ' + nom + ' » ne peut pas porter de « / ».');
      if (vus.has(nom)) throw new Error('La compagnie « ' + nom + ' » est deux fois dans la liste.');
      vus.add(nom);
      const classes = Array.isArray(c.classes) ? c.classes.map(String) : [];
      return { nom, classes: P().CABINES.filter(cab => classes.includes(cab)) };
    });
  }

  /** Les commandes d'une liste : « NORD/BC »… */
  const idsDeLaListe = liste => new Set((liste || []).flatMap(c => c.classes.map(cab => P().idClasse(c.nom, cab))));
  /** Les commandes que porte un programme de vols (tous ses jours) : celles de ses départs. */
  const idsDuProgramme = vols => new Set(P().classesDeVols(vols || []).map(c => c.id));
  /** Les compagnies d'un programme de vols : celles de toutes ses lignes, départs et retours. */
  const compagniesDuProgramme = vols => new Set((vols || []).map(v => normaliser(v && v.cie)).filter(Boolean));

  const memes = (a, b) => a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));

  /**
   * L'état que le calcul lit : sans liste, l'état lui-même ; avec une liste, ses classes retirées et ajoutées tirées de
   * la liste et des commandes du programme (`idsProgramme`, tous ses jours). Rien n'est modifié en place ; quand la
   * traduction ne change rien (juste après « En faire ma liste »), l'état lui-même est rendu.
   */
  function etatEffectif(etat, idsProgramme) {
    if (!etat || !Array.isArray(etat.compagnies)) return etat;
    const L = idsDeLaListe(etat.compagnies), prog = idsProgramme instanceof Set ? idsProgramme : new Set(idsProgramme || []);
    const X = Array.isArray(etat.exclues) ? etat.exclues : [], A = Array.isArray(etat.ajoutees) ? etat.ajoutees : [];
    const id = c => P().idClasse(c.cie, c.cabine);
    // Retirées : celles d'avant qui ne sont pas dans la liste, puis chaque classe du programme hors de la liste.
    const exclues = X.filter(x => !L.has(x)), dejaX = new Set(X);
    for (const x of [...prog].sort()) if (!L.has(x) && !dejaX.has(x)) exclues.push(x);
    // Ajoutées : celles d'avant qui sont dans la liste, puis chaque classe de la liste qu'aucun vol ne porte.
    const ajoutees = A.filter(c => L.has(id(c))), dejaA = new Set(A.map(id));
    for (const c of etat.compagnies) for (const cab of c.classes) {
      const x = P().idClasse(c.nom, cab);
      if (!prog.has(x) && !dejaA.has(x)) ajoutees.push({ cie: c.nom, cabine: cab });
    }
    if (memes(exclues, X) && memes(ajoutees, A)) return etat;
    return { ...etat, exclues, ajoutees };
  }

  /**
   * « En faire ma liste » : la liste telle qu'elle est aujourd'hui. Les compagnies du programme (tous ses jours, départs
   * et retours) et celles des classes ajoutées, rangées par nom ; chacune avec ses commandes d'aujourd'hui — les classes
   * du programme moins les retirées, plus les ajoutées. Une compagnie dont toutes les classes sont retirées y est, sans
   * classe : ses vols restent dans le programme (ses retours vont à la plonge).
   */
  function listeDesVols(vols, etat) {
    const e = etat || {}, X = new Set((e.exclues || []).map(String));
    const commandes = new Set([...idsDuProgramme(vols)].filter(x => !X.has(x)));
    for (const c of e.ajoutees || []) { const x = P().idClasse(c.cie, c.cabine); if (!X.has(x)) commandes.add(x); }
    const noms = new Set([...compagniesDuProgramme(vols), ...(e.ajoutees || []).map(c => normaliser(c.cie))]);
    return [...noms].filter(Boolean).sort().map(nom => ({ nom, classes: P().CABINES.filter(cab => commandes.has(P().idClasse(nom, cab))) }));
  }

  /**
   * La liste après l'import d'un classeur d'équipes qui porte la feuille « Classes » : cette feuille dit, classe par
   * classe, ce qui est retiré et ce qui est ajouté ; la liste la suit. Les compagnies de la liste restent (sans classe si
   * la feuille les retire toutes), dans leur ordre ; celles qu'une commande de la feuille nomme y entrent, à la suite, par nom.
   * @param liste         la liste d'avant l'import
   * @param idsProgramme  les commandes que porte le programme de vols (tous ses jours)
   * @param etat          l'état importé : ses `exclues` et `ajoutees` viennent de la feuille
   */
  function listeApresClasseur(liste, idsProgramme, etat) {
    const e = etat || {}, X = new Set((e.exclues || []).map(String));
    const commandes = new Set([...(idsProgramme || [])].filter(x => !X.has(x)));
    for (const c of e.ajoutees || []) { const x = P().idClasse(normaliser(c.cie), c.cabine); if (!X.has(x)) commandes.add(x); }
    const avant = (liste || []).map(c => c.nom), deja = new Set(avant);
    const neufs = [...new Set([...commandes].map(x => x.slice(0, x.lastIndexOf('/'))))].filter(n => n && !deja.has(n)).sort();
    return [...avant, ...neufs].map(nom => ({ nom, classes: P().CABINES.filter(cab => commandes.has(P().idClasse(nom, cab))) }));
  }

  /**
   * Le programme de vols que le calcul lit. Sans liste, le programme lui-même. Avec une liste, c'est ici que les
   * commandes fixes (partie d) et le rattachement des lignes de l'import (partie e) se préparent ; pour l'instant, le
   * programme lui-même aussi.
   */
  function preparerVols(vols, etat) {
    if (!etat || !Array.isArray(etat.compagnies)) return vols;
    return vols;
  }

  /**
   * Une sauvegarde complète et ses vols, prêts pour le moteur (les outils) : sans liste, les mêmes objets ; avec une
   * liste, les vols préparés et l'état des équipes qui en porte la traduction (`etatEffectif`). La liste elle-même
   * reste dans l'état : le moteur ne la lit pas.
   */
  function preparerSauvegarde(sauvegarde, vols) {
    const c = sauvegarde && sauvegarde.contenu, brut = c && c['ory-ateliers-v1'];
    if (!brut || typeof brut !== 'object' || brut.compagnies === undefined) return { sauvegarde, vols };
    const etat = { ...brut, compagnies: lire(brut.compagnies) };
    if (!etat.compagnies) return { sauvegarde, vols };
    // L'état tel que la page le tient : ses retirées sans double, ses ajoutées nommées en majuscules.
    etat.exclues = [...new Set((Array.isArray(brut.exclues) ? brut.exclues : []).map(String))];
    etat.ajoutees = (Array.isArray(brut.ajoutees) ? brut.ajoutees : []).map(x => ({ cie: normaliser(x && x.cie), cabine: x && x.cabine }));
    const v = preparerVols(vols, etat), eff = etatEffectif(etat, idsDuProgramme(v));
    if (eff === etat && v === vols) return { sauvegarde, vols };
    return { sauvegarde: { ...sauvegarde, contenu: { ...c, 'ory-ateliers-v1': { ...brut, exclues: eff.exclues, ajoutees: eff.ajoutees } } }, vols: v };
  }

  const api = { MAX_COMPAGNIES, normaliser, lire, idsDeLaListe, idsDuProgramme, compagniesDuProgramme, etatEffectif, listeDesVols, listeApresClasseur, preparerVols, preparerSauvegarde };
  if (enNode) module.exports = api;
  else root.OrlyCompagnies = api;
})(typeof window !== 'undefined' ? window : globalThis);
