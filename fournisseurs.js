/* ==========================================================================
 *  LES FOURNISSEURS (version 1, évolution 24 a) — leurs clients, une fois pour
 *  toute l'unité
 *
 *  Un FOURNISSEUR est un service de mise à disposition où rien n'arrive : aucun
 *  lien n'y entre, dans aucun chemin (le magasin, la réception). Une mise à
 *  disposition qui reçoit d'un autre service reste une étape comme les autres.
 *
 *  Être client d'un fournisseur ne dépend pas du chemin : un service qui se sert
 *  chez lui s'y sert pour toutes ses commandes. Ses clients se cochent donc une
 *  seule fois, dans « Chemins › Fournisseurs » (le tableau « Qui se fournit
 *  où »). Cocher écrit le lien « fournisseur → client » dans chaque chemin où
 *  le client est une étape ; décocher le retire de tous.
 *
 *  LE CALCUL NE CHANGE PAS : le moteur lit toujours les liens des chemins. Ce
 *  module n'écrit que ces liens-là, et rien n'est calculé de plus.
 *
 *  L'état d'un client se lit dans les liens (`etatClient`) :
 *    oui     le lien est dans tous les chemins où il est une étape ;
 *    non     dans aucun ;
 *    partie  dans une partie seulement (une sauvegarde d'avant) : « en partie :
 *            n chemins sur m », jusqu'à ce qu'on choisisse « Partout » ou
 *            « Nulle part ». Tant qu'on ne choisit pas, aucun lien ne bouge.
 *
 *  LA LISTE, pour la suite : `etat.fournisseurs = { fournisseur: [clients] }`,
 *  gardée avec les équipes et les chemins (donc dans la sauvegarde). Elle
 *  retient ce qui est coché ; elle sert au service coché qui n'est dans aucun
 *  chemin : il recevra ses liens en y entrant. Une sauvegarde d'avant n'en a
 *  pas, et n'en reçoit pas tant qu'on ne coche rien. Le code d'avant (et la
 *  version 2) ne la lit pas : il lit les liens, et rend le même résultat.
 *
 *  SEUL LE TABLEAU CHANGE UN LIEN DE FOURNISSEUR. Après chaque geste sur
 *  l'unité, `suivre` y veille, chemin par chemin : une étape déjà dans un
 *  chemin y garde ce qu'elle avait ; une étape qui y entre reçoit le lien de
 *  ses fournisseurs si elle est cochée, aucun si elle est décochée, même
 *  quand l'insertion en devine un ; un client en partie ne bouge pas. Un
 *  chemin dupliqué porte les liens de son modèle ; un chemin créé vide reçoit
 *  ses étapes une à une.
 *
 *  Module pur (testé en Node) : parcours.js et unite.js, communs avec la
 *  version 2, ne sont pas modifiés.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
  const P = NODE ? require('./moteur/production.js') : root.MoteurProduction;
  const PC = NODE ? require('./parcours.js') : root.OrlyParcours;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pl = (n, un, des) => n + ' ' + (n > 1 ? (des || un + 's') : un);
  const nomDe = o => (o && typeof o.nom === 'function' ? o.nom : id => id);
  /** La nature d'un service : celle que la page donne (`o.nature`), sinon celle de ses équipes, ou devinée à son nom. */
  const dispo = (etat, s, o) => (o && typeof o.nature === 'function' ? o.nature(s) : PC.natureService(etat, s, nomDe(o)(s))) === 'dispo';
  const cle = (f, s) => f + '>' + s;

  /** Les services dont on parle : ceux de l'unité (`o.services`), puis ceux des équipes et des chemins. */
  function connus(etat, o) {
    const ids = new Set();
    const voir = s => { if (typeof s === 'string' && s) ids.add(s); };
    for (const s of (o && o.services) || []) voir(s);
    for (const a of etat.ateliers || []) voir(a && a.service);
    for (const p of etat.parcours || []) for (const s of P.servicesDuParcours(p)) voir(s);
    return [...ids];
  }

  /** Les services qui reçoivent d'un autre, dans un chemin au moins. */
  function recoivent(etat) {
    const out = new Set();
    for (const p of etat.parcours || []) for (const a of P.arcsDuParcours(p)) out.add(a.to);
    return out;
  }

  /**
   * Un fournisseur : un service de mise à disposition où rien n'arrive, dans aucun chemin.
   * @param {object} etat  l'unité (équipes, chemins)
   * @param {{nom?: Function, nature?: Function}} [o]  `nom(id)` : le nom du service (sa nature se devine à son nom quand il
   *   n'a pas d'équipe) ; `nature(id)` : sa nature, quand la page la connaît mieux (un service encore sans équipe)
   */
  function estFournisseur(etat, service, o) {
    return dispo(etat, service, o) && !recoivent(etat).has(service);
  }

  /** Les fournisseurs de l'unité, dans l'ordre de ses services. */
  function fournisseurs(etat, o) {
    const recu = recoivent(etat);
    return connus(etat, o).filter(s => !recu.has(s) && dispo(etat, s, o));
  }

  /** Où chaque service est une étape, et où se trouve chaque lien : par chemin (son identifiant). */
  function releve(etat) {
    const presents = new Map(), liens = new Map();
    const ajouter = (m, k, id) => { const l = m.get(k); if (l) l.push(id); else m.set(k, [id]); };
    for (const p of etat.parcours || []) {
      for (const s of P.servicesDuParcours(p)) ajouter(presents, s, p.id);
      for (const a of P.arcsDuParcours(p)) ajouter(liens, cle(a.from, a.to), p.id);
    }
    return { presents, liens };
  }

  /** La liste garde-t-elle ce client ? */
  const garde = (etat, f, s) => { const l = etat.fournisseurs && etat.fournisseurs[f]; return Array.isArray(l) && l.includes(s); };

  /**
   * L'état d'un client chez un fournisseur.
   * @returns {{etat: 'oui'|'non'|'partie', n: number, m: number, avec: string[], sans: string[], garde: boolean}}
   *   m : les chemins où le service est une étape ; n : ceux qui portent le lien ; avec, sans : leurs identifiants ;
   *   garde : la liste le retient. Dans aucun chemin, c'est la liste qui dit s'il est coché.
   */
  function etatClient(etat, f, s, r) {
    const rel = r || releve(etat), dans = rel.presents.get(s) || [], avec = (rel.liens.get(cle(f, s)) || []).slice();
    const sans = dans.filter(id => !avec.includes(id)), m = dans.length, n = avec.length, g = garde(etat, f, s);
    return { etat: !m ? (g ? 'oui' : 'non') : n === m ? 'oui' : n === 0 && !g ? 'non' : 'partie', n, m, avec, sans, garde: g };
  }

  /**
   * La liste gardée, mise au propre : { fournisseur: [clients] } — chaque client une fois, jamais le fournisseur
   * lui-même ; ni liste vide, ni valeur qui n'est pas un service.
   */
  function lire(brut) {
    const out = {};
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
    for (const [f, liste] of Object.entries(brut).slice(0, 200)) {
      if (!f || f.length > 160 || !Array.isArray(liste)) continue;
      const l = [...new Set(liste.filter(s => typeof s === 'string' && s && s.length <= 160 && s !== f))].slice(0, 500);
      if (l.length) out[f] = l;
    }
    return out;
  }

  /** Retenir, ou oublier, un client dans la liste. Une liste vide ne se garde pas. */
  function retenir(etat, f, s, oui) {
    const l = lire(etat.fournisseurs), liste = (l[f] || []).filter(x => x !== s);
    if (oui) liste.push(s);
    if (liste.length) l[f] = liste; else delete l[f];
    if (Object.keys(l).length) etat.fournisseurs = l; else delete etat.fournisseurs;
  }

  /** Le lien « f → s » dans chaque chemin où `s` est une étape ; le fournisseur y entre. */
  function ecrire(etat, f, s) {
    for (const p of etat.parcours || []) {
      if (!P.servicesDuParcours(p).includes(s)) continue;
      p.noeuds = Array.isArray(p.noeuds) ? p.noeuds : [];
      p.liens = Array.isArray(p.liens) ? p.liens : [];
      if (!p.noeuds.includes(f)) p.noeuds.push(f);
      if (!P.arcsDuParcours(p).some(a => a.from === f && a.to === s)) p.liens.push({ de: f, vers: s });
    }
  }

  /** Le lien « f → s » retiré de tous les chemins. `sortir` : un fournisseur sans client dans un chemin en sort. */
  function effacer(etat, f, s, sortir) {
    for (const p of etat.parcours || []) {
      if (!Array.isArray(p.liens) || !p.liens.some(l => l.de === f && l.vers === s)) continue;
      p.liens = p.liens.filter(l => !(l.de === f && l.vers === s));
      if (sortir && !p.liens.some(l => l.de === f || l.vers === f)) p.noeuds = (p.noeuds || []).filter(x => x !== f);
    }
  }

  /* Ce que le tableau a réglé pendant le geste en cours : `suivre` ne le défait pas. */
  const REGLES = new WeakMap();

  /**
   * Le geste du tableau : cocher (`oui`) ou décocher un client, pour toute l'unité. « Partout » coche, « Nulle part »
   * décoche. Modifie `etat` : les liens de ses chemins, et la liste.
   * @returns {boolean} l'unité a changé
   */
  function regler(etat, f, s, oui) {
    if (!f || !s || f === s) return false;
    const avant = JSON.stringify([etat.parcours, etat.fournisseurs || null]);
    if (oui) ecrire(etat, f, s); else effacer(etat, f, s, true);
    retenir(etat, f, s, !!oui);
    if (!REGLES.has(etat)) REGLES.set(etat, new Set());
    REGLES.get(etat).add(cle(f, s));
    return JSON.stringify([etat.parcours, etat.fournisseurs || null]) !== avant;
  }

  /**
   * Après un geste sur l'unité : seul le tableau change un lien de fournisseur. Chemin par chemin, pour chaque
   * fournisseur et chaque étape :
   *   - l'étape était déjà dans ce chemin : elle y garde ce qu'elle avait — son lien, ou pas de lien (une étape
   *     insérée entre elle et son fournisseur, ou retirée à côté d'elle, n'y change rien) ;
   *   - elle vient d'y entrer (une étape ajoutée) : un client coché reçoit son lien, un service décoché n'en reçoit
   *     pas ; un client en partie reste comme le geste l'a laissé.
   * Un chemin né de ce geste est pris tel quel : créé vide, il n'a pas encore d'étape (elles y entreront une à une) ;
   * dupliqué, il porte les liens de son modèle — ceux d'un client coché y sont donc.
   * Ce que le tableau vient de régler ne bouge pas. Un fournisseur qui perd dans ce geste son dernier client d'un
   * chemin en sort ; un client coché qui sort de tous les chemins reste coché : la liste le retient.
   * @param {object} avant  l'unité d'avant le geste
   * @param {object} apres  l'unité d'après : modifiée ici
   * @param {{services?: string[], nom?: Function, nature?: Function}} [o]
   * @returns {boolean} `apres` a été retouchée
   */
  function suivre(avant, apres, o) {
    const regles = REGLES.get(apres) || new Set();
    REGLES.delete(apres);
    const d = fournisseurs(avant, o);
    if (!d.length) return false;
    const encore = new Set(fournisseurs(apres, o)), suivis = d.filter(f => encore.has(f));
    if (!suivis.length) return false;
    const texte = JSON.stringify([apres.parcours, apres.fournisseurs || null]);
    const ra = releve(avant), connu = new Map();
    const etatAvant = (f, s) => { const k = cle(f, s); if (!connu.has(k)) connu.set(k, etatClient(avant, f, s, ra).etat); return connu.get(k); };
    for (const p of apres.parcours || []) {
      const pa = (avant.parcours || []).find(x => x.id === p.id);
      if (!pa) continue;
      const etapesAvant = new Set(P.servicesDuParcours(pa)), arcsAvant = P.arcsDuParcours(pa);
      const liensAvant = new Set(arcsAvant.map(a => cle(a.from, a.to))), fournissait = new Set(arcsAvant.map(a => a.from));
      for (const f of suivis) {
        for (const s of P.servicesDuParcours(p)) {
          if (s === f || regles.has(cle(f, s))) continue;
          const e = etapesAvant.has(s) ? null : etatAvant(f, s);
          const veut = e === null ? liensAvant.has(cle(f, s)) : e === 'oui' ? true : e === 'non' ? false : null;
          if (veut === null) continue;
          const a = (p.liens || []).some(l => l.de === f && l.vers === s);
          if (veut && !a) {
            p.noeuds = Array.isArray(p.noeuds) ? p.noeuds : []; p.liens = Array.isArray(p.liens) ? p.liens : [];
            if (!p.noeuds.includes(f)) p.noeuds.push(f);
            p.liens.push({ de: f, vers: s });
          } else if (!veut && a) p.liens = p.liens.filter(l => !(l.de === f && l.vers === s));
        }
        // Sans client dans ce chemin, alors qu'il en avait : il en sort.
        if (fournissait.has(f) && Array.isArray(p.noeuds) && p.noeuds.includes(f) && !(p.liens || []).some(l => l.de === f || l.vers === f))
          p.noeuds = p.noeuds.filter(x => x !== f);
      }
    }
    // Un client coché qui n'est plus une étape d'aucun chemin : la liste le retient, il retrouvera ses liens en y revenant.
    const ici = releve(apres).presents;
    for (const f of suivis) for (const s of ra.presents.keys()) {
      if (s !== f && !ici.has(s) && !regles.has(cle(f, s)) && etatAvant(f, s) === 'oui') retenir(apres, f, s, true);
    }
    return JSON.stringify([apres.parcours, apres.fournisseurs || null]) !== texte;
  }

  /* ---- ce que la page en montre ---------------------------------------------------------------------------------- */

  /**
   * Le tableau « Qui se fournit où » : une ligne par service de l'unité, une colonne par fournisseur.
   * @param {{id: string, nom: string}[]} services  les services de l'unité, dans l'ordre de la page
   * @returns {{fournisseurs: {id, nom, clients, equipes}[], lignes: {id, nom, chemins, cellules}[], enPartie: number}}
   *   une cellule : `null` entre un fournisseur et lui-même, sinon { fournisseur, etat, n, m, avec, sans } — `avec` et
   *   `sans` : les noms des chemins ; `enPartie` : le nombre de clients réglés en partie.
   */
  function tableau(etat, services, o) {
    const liste = (services || []).filter(s => s && s.id), ids = liste.map(s => s.id);
    const noms = new Map(liste.map(s => [s.id, s.nom || s.id])), r = releve(etat);
    const dedans = new Set(ids), fs = fournisseurs(etat, { ...(o || {}), services: ids, nom: id => noms.get(id) || nomDe(o)(id) }).filter(f => dedans.has(f));
    const chemin = new Map((etat.parcours || []).map(p => [p.id, p.nom || p.id]));
    const nommer = l => l.map(id => chemin.get(id) || id);
    let enPartie = 0;
    const lignes = liste.map(s => ({ id: s.id, nom: noms.get(s.id), chemins: (r.presents.get(s.id) || []).length,
      cellules: fs.map(f => {
        if (f === s.id) return null;
        const e = etatClient(etat, f, s.id, r);
        if (e.etat === 'partie') enPartie++;
        return { fournisseur: f, etat: e.etat, n: e.n, m: e.m, avec: nommer(e.avec), sans: nommer(e.sans) };
      }) }));
    return { fournisseurs: fs.map((f, i) => ({ id: f, nom: noms.get(f), clients: lignes.filter(l => l.cellules[i] && l.cellules[i].etat !== 'non').length,
      equipes: (etat.ateliers || []).filter(a => a && a.service === f).length })), lignes, enPartie };
  }

  /** Le nombre de clients réglés en partie (l'avis de « Contrôles »). */
  function enPartie(etat, services, o) { return tableau(etat, services, o).enPartie; }

  /** Les clients d'un fournisseur (cochés, ou en partie), dans l'ordre des services : [{id, nom, etat, n, m}]. */
  function clientsDe(etat, f, services, o) {
    const r = releve(etat);
    return (services || []).filter(s => s && s.id && s.id !== f).map(s => ({ id: s.id, nom: s.nom || nomDe(o)(s.id), ...etatClient(etat, f, s.id, r) }))
      .filter(c => c.etat !== 'non').map(c => ({ id: c.id, nom: c.nom, etat: c.etat, n: c.n, m: c.m }));
  }

  /** « en partie : 1 chemin sur 2 ». */
  const direPartie = c => 'en partie : ' + pl(c.n, 'chemin') + ' sur ' + c.m;
  const REGLE = 'Cochez les clients de chaque fournisseur. Un client l’est dans tous les chemins où il passe.';

  /** Le tableau, en HTML. Les noms (services, chemins) sont échappés ici. */
  function tableauHTML(t) {
    const titre = '<h2 class="se-titre fo-titre">Qui se fournit où</h2>';
    if (!t || !t.fournisseurs.length) return titre + `<p class="mini-note fo-vide">Aucun fournisseur dans l’unité. Un fournisseur est un service de mise à disposition
      qui ne reçoit d’aucun autre (un magasin, une réception) : donnez ce type à un service dans « Services et équipes ».</p>`;
    const cellule = (l, c) => {
      if (!c) return '<td class="fo-soi" aria-hidden="true">—</td>';
      const f = t.fournisseurs.find(x => x.id === c.fournisseur), qui = `data-fo-fournisseur="${esc(c.fournisseur)}"`;
      if (c.etat !== 'partie') return `<td class="fo-${c.etat}"><label class="chk fo-chk"><input type="checkbox" data-fo-client="${esc(l.id)}" ${qui}
        aria-label="${esc(l.nom + ' se fournit chez ' + f.nom)}"${c.etat === 'oui' ? ' checked' : ''}></label></td>`;
      const ou = 'Client dans : ' + (c.avec.length ? c.avec.join(', ') : 'aucun chemin') + '. Pas dans : ' + c.sans.join(', ') + '.';
      return `<td class="fo-partie"><span class="fo-dit" tabindex="0" title="${esc(ou)}">${esc(direPartie(c))}</span>
        <span class="fo-choix"><button type="button" class="btn btn-sm" data-fo-partout="${esc(l.id)}" ${qui} title="${esc(l.nom + ' se fournit chez ' + f.nom + ' dans tous les chemins où il passe')}">Partout</button>
        <button type="button" class="btn btn-sm" data-fo-nulle-part="${esc(l.id)}" ${qui} title="${esc(l.nom + ' ne se fournit plus chez ' + f.nom)}">Nulle part</button></span></td>`;
    };
    return titre + `<p class="fo-regle">${REGLE}</p>
      <div class="fo-cadre page-zone"><table class="svc-table fo-table"><caption class="sr-only">Qui se fournit où</caption>
        <thead><tr><th scope="col">Service</th>${t.fournisseurs.map(f => `<th scope="col" data-fo-colonne="${esc(f.id)}"><b>${esc(f.nom)}</b><small>${esc(f.clients ? pl(f.clients, 'client') : 'aucun client')}</small>${
          f.equipes ? '' : `<button type="button" class="lien-discret fo-sans" data-mu-ouvrir-svc="${esc(f.id)}" title="Sans équipe, ce fournisseur ne sert personne : sa fiche le met en place">sans équipe →</button>`}</th>`).join('')}</tr></thead>
        <tbody>${t.lignes.map(l => `<tr data-fo-service="${esc(l.id)}"><th scope="row">${esc(l.nom)}${l.chemins ? '' : '<small title="Coché, il recevra ses liens en entrant dans un chemin">dans aucun chemin</small>'}</th>${
          l.cellules.map(c => cellule(l, c)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /** La fiche d'un fournisseur, dans « Services et équipes » : ses clients, qui se lisent, et le lien vers le tableau. */
  function clientsHTML(clients) {
    const liste = (clients || []).map(c => esc(c.nom) + (c.etat === 'partie' ? ` <small class="fo-partie">(${esc(direPartie(c))})</small>` : '')).join(', ');
    return `<div class="mu-besoin fo-clients"><h4>Ses clients</h4>
      <p class="fo-clients-liste">${liste || '<span class="mini-note">Aucun client pour l’instant.</span>'}</p>
      <p class="fo-vers"><button type="button" class="lien-fort" data-fo-ouvrir>Régler dans Chemins › Fournisseurs →</button></p></div>`;
  }

  const api = { REGLE, estFournisseur, fournisseurs, releve, etatClient, lire, regler, suivre, tableau, enPartie, clientsDe, direPartie, tableauHTML, clientsHTML };
  if (NODE) module.exports = api;
  else root.OrlyFournisseurs = api;
})(typeof window !== 'undefined' ? window : globalThis);
