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
 *  Une compagnie créée « comme une autre » dont le modèle n'a pas une classe
 *  porte cette classe dans `aCompleter` (partie c). Une compagnie aux
 *  commandes fixes, sans vol, porte `fixe` : { BC: { quantite, jours, heure } }
 *  (partie d).
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
 *  L'import rattache, il ne crée plus (partie e). Avec une liste, chaque ligne du
 *  programme est rattachée à une compagnie de la liste par les règles de tri de
 *  l'import (moteur/import-flights.js : les codes compagnie, les ICAO exclus) ;
 *  une ligne qui ne se rattache à rien n'est pas comptée (`rattacher`).
 *
 *  Un seul chemin de calcul : la page et les outils (outils/simuler-journee.cjs,
 *  outils/simuler-periode.cjs) préparent la sauvegarde et les vols ici, puis
 *  appellent le même moteur. Module pur, testé en Node.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const W = () => (enNode ? require('./moteur/import-flights.js') : root.OrlyWinrest);

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
      const brutes = Array.isArray(c.classes) ? c.classes.map(String) : [], classes = P().CABINES.filter(cab => brutes.includes(cab));
      const aCompleter = Array.isArray(c.aCompleter) ? classes.filter(cab => c.aCompleter.includes(cab)) : [];
      return { nom, classes, ...(aCompleter.length ? { aCompleter } : {}), ...(c.fixe && typeof c.fixe === 'object' && !Array.isArray(c.fixe) ? { fixe: lireFixe(c.fixe, classes, nom) } : {}) };
    });
  }

  /** Les jours d'une semaine, du lundi (1) au dimanche (7). */
  const JOURS = [1, 2, 3, 4, 5, 6, 7];
  /** L'heure d'une commande fixe, tant qu'on ne l'a pas choisie. */
  const HEURE_FIXE = '12:00';
  /**
   * Les commandes fixes d'une compagnie, classe par classe : une quantité par jour, les jours où elle existe (tous, au
   * départ), l'heure où elle doit être prête. Une classe hors de la compagnie n'en a pas ; une valeur illisible refuse
   * la liste en disant quoi corriger.
   */
  function lireFixe(brut, classes, nom) {
    const out = {};
    for (const cab of classes) {
      const f = brut[cab]; if (!f || typeof f !== 'object') continue;
      const q = Number(f.quantite ?? 0);
      if (!Number.isInteger(q) || q < 0 || q > 99999) throw new Error(nom + ' : la quantité fixe d’une classe est un nombre entier, de 0 à 99 999.');
      const jours = Array.isArray(f.jours) ? JOURS.filter(j => f.jours.map(Number).includes(j)) : JOURS.slice();
      const heure = String(f.heure ?? HEURE_FIXE).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) throw new Error(nom + ' : l’heure d’une commande fixe s’écrit HH:MM (« ' + heure + ' »).');
      out[cab] = { quantite: q, jours, heure };
    }
    return out;
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

  /* ---- Les commandes fixes (partie d) ------------------------------------------------------------------------------
   * Une compagnie aux commandes fixes (`fixe`) ne dépend d'aucun vol : chaque jour où elle existe, chacune de ses
   * classes donne au calcul un départ, à son heure, avec sa quantité — comme une ligne du programme. Si le programme
   * porte aussi une ligne de départ de cette compagnie ce jour-là, la quantité est celle du programme, l'heure celle de
   * la commande fixe ; un jour non coché où le programme porte une ligne, la ligne compte, à l'heure de la commande fixe.
   * Les classes de même heure partent ensemble, comme les classes d'une ligne. Les retours de ses vols restent tels quels. */
  const CHAMP_PAX = { BC: 'bc', PC: 'pc', YC: 'yc', CREW: 'crew', SPML: 'spml' };
  const UN_JOUR = 864e5;
  /** Le jour de la semaine d'une date « AAAA-MM-JJ » : 1 (lundi) à 7 (dimanche). */
  const jourDeLaSemaine = d => new Date(d + 'T00:00:00Z').getUTCDay() || 7;
  const enMinutes = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const lendemain = d => new Date(Date.parse(d + 'T00:00:00Z') + UN_JOUR).toISOString().slice(0, 10);
  /** Les jours d'un programme daté, du premier au dernier ; `[null]` pour un programme sans date (une journée type). */
  function joursDuProgramme(vols) {
    const dates = [...new Set(vols.filter(v => v && v.date).map(v => v.date))].sort();
    if (!dates.length) return [null];
    const out = [];
    for (let d = dates[0]; d <= dates[dates.length - 1]; d = lendemain(d)) out.push(d);
    return out;
  }
  /**
   * Les départs d'une compagnie aux commandes fixes, un jour (`date` ; null pour un programme sans date, où la commande
   * existe si elle a au moins un jour coché). `lignes` : les lignes de départ du programme de cette compagnie ce jour-là.
   */
  function departsFixes(c, date, lignes) {
    const parHeure = new Map();
    for (const cab of c.classes) {
      const f = (c.fixe || {})[cab] || { quantite: 0, jours: JOURS, heure: HEURE_FIXE };
      const coche = date ? f.jours.includes(jourDeLaSemaine(date)) : f.jours.length > 0;
      const q = lignes.length ? lignes.reduce((k, v) => k + (Number(v[CHAMP_PAX[cab]]) || 0), 0) : coche ? f.quantite : 0;
      if (q > 0) parHeure.set(f.heure, { ...parHeure.get(f.heure), [cab]: q });
    }
    const heures = [...parHeure.keys()].sort();
    return heures.map(h => {
      const pax = parHeure.get(h), v = { id: c.nom + '-FIXE' + (heures.length > 1 ? '-' + h.replace(':', '') : ''), cie: c.nom, sens: 'DEP', avion: '', std: enMinutes(h), sta: null };
      for (const cab of P().CABINES) v[CHAMP_PAX[cab]] = pax[cab] || 0;
      return date ? { ...v, date } : v;
    });
  }

  /* ---- Le rattachement des lignes de l'import (partie e) -----------------------------------------------------------
   * Avec une liste, l'import ne crée plus de compagnie : chaque ligne du programme est rattachée à une compagnie de la
   * liste, par les règles de tri de l'import qui existent (moteur/import-flights.js) :
   *   - sa compagnie est un nom de la liste : elle y reste, telle quelle ;
   *   - sinon, la table des codes compagnie la mène à un nom de la liste : elle y est rattachée ;
   *   - sinon, son code est parmi les ICAO exclus : elle est ignorée ;
   *   - sinon, elle n'est rattachée à rien : elle n'est pas comptée, et « Contrôles » le dit, un point par code.
   * Le nom de la liste passe avant la table : une ligne déjà dans une compagnie de la liste n'en change pas. */
  const SANS_REGLES = { compagnies: {}, icaoExclus: [] };
  /** La clé des règles d'import dans le stockage et dans une sauvegarde complète. */
  const CLE_REGLES = 'ory-import-winrest-v1';
  /**
   * Les lignes d'un programme rattachées à la liste. `regles` : les règles d'import (complètes), ou rien (aucune table,
   * aucun code exclu). Rend les lignes gardées (le programme lui-même quand toutes y sont déjà), leur nombre, celui des
   * lignes ignorées, et les codes non rattachés, rangés par code : { code, vols (lignes), classes (celles de leurs départs) }.
   */
  function rattacher(vols, liste, regles) {
    const noms = new Set((liste || []).map(c => c.nom)), R = regles || SANS_REGLES, table = new Map();
    for (const [k, v] of Object.entries(R.compagnies || {})) { const c = normaliser(k); if (c && !table.has(c)) table.set(c, normaliser(v)); }
    const exclus = new Set((R.icaoExclus || []).map(normaliser)), hors = new Map(), out = [];
    let rattaches = 0, ignores = 0;
    for (const v of vols || []) {
      const code = normaliser(v && v.cie), cible = table.get(code);
      if (noms.has(code)) { out.push(v); rattaches++; }
      else if (cible && noms.has(cible)) { out.push({ ...v, cie: cible }); rattaches++; }
      else if (exclus.has(code)) ignores++;
      else { if (!hors.has(code)) hors.set(code, []); hors.get(code).push(v); }
    }
    const nonRattaches = [...hors.keys()].sort().map(code => {
      const ids = idsDuProgramme(hors.get(code));
      return { code, vols: hors.get(code).length, classes: P().CABINES.filter(cab => ids.has(P().idClasse(code, cab))) };
    });
    const memesLignes = out.length === (vols || []).length && out.every((v, i) => v === vols[i]);
    return { vols: memesLignes ? vols : out, rattaches, ignores, nonRattaches };
  }

  /**
   * Le programme de vols que le calcul lit. Sans liste, le programme lui-même (le même objet). Avec une liste, ses lignes
   * rattachées à la liste (`rattacher`, d'après les règles d'import `regles`) ; puis, s'il y a des compagnies aux
   * commandes fixes, leurs lignes de départ remplacées, jour par jour, par leurs départs fixes (à la place de leur
   * première ligne du jour, ou à la fin). Quand rien ne change (la liste d'aujourd'hui, toutes les lignes y sont, aucune
   * commande fixe), le programme lui-même.
   */
  function preparerVols(vols, etat, regles) {
    if (!etat || !Array.isArray(etat.compagnies) || !Array.isArray(vols)) return vols;
    return avecLesFixes(rattacher(vols, etat.compagnies, regles).vols, etat);
  }
  function avecLesFixes(vols, etat) {
    const fixes = new Map(etat.compagnies.filter(c => c && c.fixe).map(c => [c.nom, c]));
    if (!fixes.size) return vols;
    const estFixe = v => !!v && v.sens === 'DEP' && fixes.has(normaliser(v.cie));
    const cle = (nom, date) => nom + '|' + (date || '');
    const out = [], places = new Map(), lignes = new Map();
    for (const v of vols) {
      if (!estFixe(v)) { out.push(v); continue; }
      const k = cle(normaliser(v.cie), v.date);
      if (!places.has(k)) { places.set(k, out.length); out.push(null); lignes.set(k, []); }
      lignes.get(k).push(v);
    }
    const fin = [];
    for (const date of joursDuProgramme(vols)) for (const c of fixes.values()) {
      const k = cle(c.nom, date), d = departsFixes(c, date, lignes.get(k) || []);
      if (places.has(k)) out[places.get(k)] = d; else fin.push(...d);
    }
    if (!places.size && !fin.length) return vols;
    return [...out.flatMap(x => (Array.isArray(x) ? x : [x])), ...fin];
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
    // Les règles de tri de l'import, gardées dans la sauvegarde (validées comme à la restauration) ; sans elles, aucune.
    const regles = c[CLE_REGLES] === undefined ? null : W().lireEnveloppe(c[CLE_REGLES]);
    const v = preparerVols(vols, etat, regles), eff = etatEffectif(etat, idsDuProgramme(v));
    if (eff === etat && v === vols) return { sauvegarde, vols };
    return { sauvegarde: { ...sauvegarde, contenu: { ...c, 'ory-ateliers-v1': { ...brut, exclues: eff.exclues, ajoutees: eff.ajoutees } } }, vols: v };
  }

  const api = { MAX_COMPAGNIES, JOURS, HEURE_FIXE, normaliser, lire, lireFixe, idsDeLaListe, idsDuProgramme, compagniesDuProgramme, etatEffectif, listeDesVols, listeApresClasseur, rattacher, preparerVols, preparerSauvegarde };
  if (enNode) module.exports = api;
  else root.OrlyCompagnies = api;
})(typeof window !== 'undefined' ? window : globalThis);
