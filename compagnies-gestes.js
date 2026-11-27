/* ==========================================================================
 *  LES GESTES SUR UNE COMPAGNIE (version 1, évolution 26 c)
 *
 *  L'ajouter « comme une autre » ou en partant de zéro, la renommer, la
 *  retirer, lui ajouter ou lui ôter une classe. Une compagnie se nomme à
 *  plusieurs endroits de l'état des équipes (`ory-ateliers-v1`) et des temps
 *  par vol (`ory-modele-v1`, son barème) :
 *    - la liste des compagnies, les classes retirées et ajoutées ;
 *    - le chemin de chaque classe (`parcoursClasse`, « NORD/BC ») ;
 *    - les équipes : ce qu'elles préparent (`lots`), leurs heures propres
 *      (`minutes`) et les débits du robot (`debits`), commande par commande ;
 *      les compagnies qu'elles servent (`compagnies`, `longs`) ; leurs réglages
 *      par compagnie (`CHAMPS_PAR_COMPAGNIE`) ; la règle ⚡ (`condition.cie`) ;
 *    - les catégories d'un service (leurs minutes par compagnie) ;
 *    - les compagnies sans chargement en camion (`sansChargement`) ;
 *    - les temps par vol de chaque service (le barème, « NORD/BC »).
 *
 *  « Comme une autre » copie, classe par classe, ce que le modèle a : son
 *  chemin, l'équipe de chaque étape (un lot à part, juste après celui du
 *  modèle), ses heures propres et ses débits, ses temps par vol ; et, pour la
 *  compagnie, ses réglages par compagnie, les équipes qui la servent, ses
 *  catégories et le chargement en camion ou non. Les fournisseurs viennent du
 *  chemin : copier le chemin les copie. Une classe que le modèle n'a pas suit
 *  le chemin habituel de sa classe et est marquée « à compléter ». La règle ⚡
 *  d'une équipe (« si NORD a assez de vols ») reste au modèle.
 *
 *  Après chaque geste, les classes retirées et ajoutées d'avant suivent la
 *  liste (`aligner`) : le code d'avant, qui ne lit pas la liste, lit les mêmes
 *  commandes. Module pur : rien n'est modifié en place ; testé en Node.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);
  const CO = () => (enNode ? require('./compagnies.js') : root.OrlyCompagnies);

  /** Les réglages d'une équipe qui se donnent par compagnie (« * » : toutes) : une valeur par nom de compagnie. */
  const CHAMPS_PAR_COMPAGNIE = ['durees', 'allers', 'retours', 'volsCamion', 'minutesVol', 'escale', 'quaiDepart', 'quaiRetour', 'quaiParVol', 'dechargement'];
  /** Les listes de compagnies d'une équipe : celles qu'elle sert, les long-courriers du handling. */
  const LISTES_DE_COMPAGNIES = ['compagnies', 'longs'];
  /** Les réglages d'une équipe qui se donnent par commande (« NORD/BC ») : ses heures propres, les débits du robot. */
  const CHAMPS_PAR_COMMANDE = ['minutes', 'debits'];

  const clone = x => JSON.parse(JSON.stringify(x));
  const nom = c => CO().normaliser(c);
  /** La compagnie d'une commande (« NORD/BC », « NORD/@ARM ») et ce qui suit. */
  const couper = id => { const t = String(id), i = t.lastIndexOf('/'); return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : [t, '']; };
  const estObjet = o => !!o && typeof o === 'object' && !Array.isArray(o);

  /**
   * Un nom de compagnie neuf, mis au propre, ou une erreur qui dit quoi corriger : vide, une barre « / », trop long, déjà
   * dans la liste (`noms`, hors `sauf`, l'ancien nom d'une compagnie qu'on renomme).
   */
  function nomNeuf(brut, noms, sauf) {
    const n = nom(brut);
    if (!n) throw new Error('Nommez la compagnie.');
    if (String(brut ?? '').trim().length > 40) throw new Error('Un nom de compagnie tient en 40 caractères.');
    if (n.includes('/')) throw new Error('Le nom d’une compagnie ne porte pas de « / ».');
    if (n === '*') throw new Error('« * » veut dire « toutes les compagnies » : choisissez un autre nom.');
    if ((noms || []).some(x => x === n && x !== sauf)) throw new Error('La compagnie ' + n + ' est déjà dans la liste.');
    return n;
  }

  /** Les commandes que copie « comme une autre » : celles des classes communes, et la case de l'armement. */
  function correspondance(modele, neuf, cabines) {
    const m = new Map(cabines.map(cab => [P().idClasse(modele, cab), P().idClasse(neuf, cab)]));
    if (m.size) m.set(modele + '/@ARM', neuf + '/@ARM');
    return m;
  }

  /** Dans les équipes : un lot à part pour la compagnie neuve, juste après chaque lot du modèle qui porte une de ses commandes. */
  function copierLots(lots, ids) {
    const out = [];
    for (const lot of lots || []) {
      out.push(lot);
      const neufs = [].concat(lot).filter(id => ids.has(id)).map(id => ids.get(id));
      if (neufs.length) out.push(neufs);
    }
    return out;
  }

  /** Une équipe, avec les réglages du modèle copiés pour la compagnie neuve. */
  function copierEquipe(a, modele, neuf, ids) {
    const b = { ...a, lots: copierLots(a.lots, ids) };
    for (const k of CHAMPS_PAR_COMMANDE) if (estObjet(a[k])) {
      const t = { ...a[k] };
      for (const [de, vers] of ids) if (de in a[k]) t[vers] = a[k][de];
      b[k] = t;
    }
    for (const k of CHAMPS_PAR_COMPAGNIE) if (estObjet(a[k]) && modele in a[k]) b[k] = { ...a[k], [neuf]: a[k][modele] };
    for (const k of LISTES_DE_COMPAGNIES) if (Array.isArray(a[k]) && a[k].includes(modele) && !a[k].includes(neuf)) b[k] = [...a[k], neuf];
    return b;
  }

  /**
   * « Comme une autre compagnie » : la compagnie neuve reprend les réglages du modèle, classe par classe.
   * @param {object} etat     l'état des équipes
   * @param {object} bareme   les temps par vol ({ service: { « NORD/BC »: minutes } })
   * @param {{modele:string, nom:string, cabines:string[], classesModele:string[]}} o
   *   cabines : les classes de la compagnie neuve ; classesModele : celles du modèle
   * @returns {{etat:object, bareme:object, communes:string[], aCompleter:string[]}}
   */
  function copier(etat, bareme, o) {
    const modele = nom(o.modele), neuf = nom(o.nom), cab = P().CABINES.filter(c => (o.cabines || []).includes(c));
    const communes = cab.filter(c => (o.classesModele || []).includes(c)), aCompleter = cab.filter(c => !communes.includes(c));
    const ids = correspondance(modele, neuf, communes);
    const e = clone(etat), b = clone(bareme || {});
    if (communes.length) {
      const pc = e.parcoursClasse || {};
      for (const [de, vers] of ids) if (pc[de]) pc[vers] = pc[de];
      if (Object.keys(pc).length) e.parcoursClasse = pc;
      e.ateliers = (e.ateliers || []).map(a => copierEquipe(a, modele, neuf, ids));
      for (const [service, liste] of Object.entries(e.categories || {}))
        e.categories[service] = (liste || []).map(k => (k && estObjet(k.minutes) && modele in k.minutes ? { ...k, minutes: { ...k.minutes, [neuf]: k.minutes[modele] } } : k));
      if (Array.isArray(e.sansChargement) && e.sansChargement.includes(modele) && !e.sansChargement.includes(neuf)) e.sansChargement = [...e.sansChargement, neuf];
      for (const table of Object.values(b)) if (estObjet(table)) for (const [de, vers] of ids) if (de in table) table[vers] = table[de];
    }
    return { etat: e, bareme: b, communes, aCompleter };
  }

  /** Un identifiant de commande (ou un nom de compagnie) avec le nouveau nom, quand il nomme l'ancien. */
  const renommerId = (id, ancien, neuf) => { const [c, suite] = couper(id); return c === ancien ? (suite ? neuf + '/' + suite : neuf) : id; };
  const renommerCles = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

  /** Une équipe, sa compagnie renommée partout où elle la nomme. */
  function renommerEquipe(a, ancien, neuf) {
    const id = x => renommerId(x, ancien, neuf), cie = x => (x === ancien ? neuf : x);
    const b = { ...a, lots: (a.lots || []).map(l => [].concat(l).map(id)) };
    for (const k of CHAMPS_PAR_COMMANDE) if (estObjet(a[k])) b[k] = renommerCles(a[k], id);
    for (const k of CHAMPS_PAR_COMPAGNIE) if (estObjet(a[k])) b[k] = renommerCles(a[k], cie);
    for (const k of LISTES_DE_COMPAGNIES) if (Array.isArray(a[k])) b[k] = a[k].map(cie);
    if (a.condition && a.condition.cie === ancien) b.condition = { ...a.condition, cie: neuf };
    return b;
  }

  /**
   * Renommer une compagnie : partout où l'état des équipes et le barème la nomment. Ses réglages restent les siens.
   * @returns {{etat:object, bareme:object}}
   */
  function renommer(etat, bareme, ancienBrut, neufBrut) {
    const ancien = nom(ancienBrut), neuf = nom(neufBrut);
    const id = x => renommerId(x, ancien, neuf), cie = x => (x === ancien ? neuf : x);
    const e = clone(etat), b = clone(bareme || {});
    if (Array.isArray(e.compagnies)) e.compagnies = e.compagnies.map(c => (c.nom === ancien ? { ...c, nom: neuf } : c));
    e.exclues = (e.exclues || []).map(id);
    e.ajoutees = (e.ajoutees || []).map(c => ({ ...c, cie: cie(c.cie) }));
    if (estObjet(e.parcoursClasse)) e.parcoursClasse = renommerCles(e.parcoursClasse, id);
    e.ateliers = (e.ateliers || []).map(a => renommerEquipe(a, ancien, neuf));
    for (const [service, liste] of Object.entries(e.categories || {}))
      e.categories[service] = (liste || []).map(k => (k && estObjet(k.minutes) ? { ...k, minutes: renommerCles(k.minutes, cie) } : k));
    if (Array.isArray(e.sansChargement)) e.sansChargement = e.sansChargement.map(cie);
    for (const [service, table] of Object.entries(b)) if (estObjet(table)) b[service] = renommerCles(table, id);
    return { etat: e, bareme: b };
  }

  /**
   * Les classes retirées et ajoutées d'avant, alignées sur la liste (celles que le calcul lit) : le code d'avant, qui ne
   * lit pas la liste, lit alors les mêmes commandes. Sans liste, l'état lui-même.
   */
  function aligner(etat, idsProgramme) {
    const eff = CO().etatEffectif(etat, idsProgramme);
    return eff === etat ? etat : { ...etat, exclues: eff.exclues.slice(), ajoutees: eff.ajoutees.map(c => ({ ...c })) };
  }

  /** La liste d'un état : la sienne, ou, pour une unité d'avant, celle d'aujourd'hui (« En faire ma liste »). */
  function listeDe(etat, vols) {
    return Array.isArray(etat.compagnies) ? etat.compagnies : CO().listeDesVols(vols || [], etat);
  }

  /**
   * Ajouter une compagnie à la liste, avec ses classes. Une unité d'avant reçoit d'abord sa liste d'aujourd'hui.
   * @param {{nom:string, cabines:string[], fixe?:boolean, aCompleter?:string[]}} o
   */
  function ajouterALaListe(etat, vols, o) {
    const liste = listeDe(etat, vols), cabines = P().CABINES.filter(c => (o.cabines || []).includes(c));
    const aCompleter = cabines.filter(c => (o.aCompleter || []).includes(c));
    const c = { nom: nom(o.nom), classes: cabines, ...(aCompleter.length ? { aCompleter } : {}), ...(o.fixe ? { fixe: {} } : {}) };
    return { ...etat, compagnies: [...liste.filter(x => x.nom !== c.nom), c] };
  }

  /** Retirer une compagnie de la liste. Ses réglages restent (ses vols, s'il y en a, ne comptent plus) : « Annuler » la rend. */
  function retirerDeLaListe(etat, vols, nomBrut) {
    const n = nom(nomBrut);
    return { ...etat, compagnies: listeDe(etat, vols).filter(c => c.nom !== n) };
  }

  /** Ajouter ou ôter une classe d'une compagnie de la liste ; ôtée, elle n'est plus « à compléter ». */
  function classe(etat, vols, nomBrut, cabine, dedans) {
    const n = nom(nomBrut);
    return { ...etat, compagnies: listeDe(etat, vols).map(c => {
      if (c.nom !== n) return c;
      const classes = P().CABINES.filter(x => (x === cabine ? dedans : c.classes.includes(x)));
      const aCompleter = (c.aCompleter || []).filter(x => classes.includes(x) && (dedans || x !== cabine));
      const { aCompleter: _, ...reste } = c;
      return { ...reste, classes, ...(aCompleter.length ? { aCompleter } : {}) };
    }) };
  }

  /** « C'est complet » : la classe d'une compagnie n'est plus à compléter. */
  function complete(etat, nomBrut, cabine) {
    const n = nom(nomBrut);
    if (!Array.isArray(etat.compagnies)) return etat;
    return { ...etat, compagnies: etat.compagnies.map(c => {
      if (c.nom !== n || !(c.aCompleter || []).includes(cabine)) return c;
      const { aCompleter, ...reste } = c, garde = aCompleter.filter(x => x !== cabine);
      return { ...reste, ...(garde.length ? { aCompleter: garde } : {}) };
    }) };
  }

  const api = { CHAMPS_PAR_COMPAGNIE, LISTES_DE_COMPAGNIES, CHAMPS_PAR_COMMANDE, nomNeuf, copier, renommer, aligner, listeDe,
    ajouterALaListe, retirerDeLaListe, classe, complete };
  if (enNode) module.exports = api;
  else root.OrlyCompagniesGestes = api;
})(typeof window !== 'undefined' ? window : globalThis);
