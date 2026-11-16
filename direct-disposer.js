/* ==========================================================================
 *  « DISPOSER LES ZONES » — le panneau à côté de la scène (évolution 20 b, v1)
 *  ------------------------------------------------------------------------
 *  Dans la page « En direct », un bouton ouvre ce panneau : il liste les
 *  colonnes (de gauche à droite, leurs zones de haut en bas) et les rangées
 *  du bas (de haut en bas). Chaque zone s'y déplace par glisser-déposer et
 *  par des boutons : monter, descendre, colonne précédente, colonne suivante,
 *  « en rangée du bas », de quelle colonne à quelle colonne. « Ajouter une
 *  colonne », « Retirer cette colonne vide », « Revenir à la disposition
 *  automatique ». Tout se fait aussi au clavier ; chaque geste règle la
 *  disposition (moteur/disposition.js), et la scène se redessine.
 *
 *  Ce module dessine et écoute ; il ne calcule rien. La disposition est un
 *  réglage de l'utilisateur, gardé avec les équipes : « Annuler » et
 *  « Rétablir » le défont et le refont.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const D = () => (enNode ? require('./moteur/disposition.js') : root.OrlyDisposition);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /** Ce que le site a à dire de ses zones, en phrases (`notes` : celles du site généré ; `nom(id)` : le nom d'une zone ou d'un service). */
  function phrases(notes, nom) {
    return (notes || []).map(n => {
      if (n.code === 'absente') return nom(n.zone) + ' n’était pas dans la disposition : rangée à la fin de la dernière colonne.';
      if (n.code === 'double') return nom(n.zone) + ' est citée deux fois : sa première place est gardée, l’autre ignorée.';
      if (n.code === 'inconnue') return 'La disposition cite « ' + nom(n.zone) + ' », qui n’est plus une zone du site : ignoré.';
      if (n.code === 'niveaux') return 'La rangée de ' + nom(n.zone) + ' ferait un cinquième niveau de rangées emboîtées : elle est rangée à la fin de la dernière colonne.';
      if (n.code === 'reduite') return 'La rangée de ' + nom(n.zone) + ' croise une autre rangée du bas : elle ne longe que ' + (n.de === n.a ? 'la colonne ' + n.de : 'les colonnes ' + n.de + ' à ' + n.a) + '.';
      if (n.code === 'boucle') return 'Des zones partagées font une boucle (' + [...n.services, n.services[0]].map(nom).join(' → ') + ') : ces réglages ne jouent pas.';
      if (n.code === 'inconnu') return nom(n.service) + ' partage la zone d’un service qui n’existe plus : ce réglage ne joue pas.';
      return null;
    }).filter(Boolean);
  }

  /** Un bouton de geste : un signe, et son nom entier pour qui ne le voit pas. */
  const geste = (quoi, signe, dit, zone, inactif) => '<button type="button" class="btn btn-mini dd-geste" data-dd="' + quoi + '" data-dd-zone="' + esc(zone) + '" aria-label="' + esc(dit) + '" title="' + esc(dit) + '"'
    + (inactif ? ' disabled' : '') + '>' + signe + '</button>';

  /**
   * Le panneau, en HTML. `e` : { disposition ({ colonnes, rangees }, celle que le site trace — ou le point de départ, si
   * elle est automatique), reglee (elle est réglée par l'utilisateur), notes (les phrases à dire), nom(id) }.
   */
  function html(e) {
    const d = e.disposition, n = d.colonnes.length, nom = e.nom, l = [];
    l.push('<p class="dd-etat" id="dd-etat">' + (e.reglee
      ? 'Les zones sont là où vous les avez mises : ' + pluriel(n, 'colonne', 'colonnes') + (d.rangees.length ? ', ' + pluriel(d.rangees.length, 'rangée du bas', 'rangées du bas') : '') + '.'
      : 'Disposition automatique : deux bandes, dans l’ordre du chemin. Déplacez une zone pour la régler — voici d’où vous partez.') + '</p>');
    if (e.notes.length) l.push('<ul class="dd-notes" role="status">' + e.notes.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>');
    l.push('<p class="mini-note">Les tailles suivent les parts de surface. Glissez une zone, ou servez-vous de ses boutons ; au clavier, les flèches la déplacent quand elle a le focus.</p>');
    l.push('<h3 id="dd-titre-colonnes">Les colonnes <small>de gauche à droite</small></h3><ol class="dd-colonnes" aria-labelledby="dd-titre-colonnes">');
    d.colonnes.forEach((c, i) => {
      l.push('<li class="dd-colonne" data-dd-colonne="' + i + '"><h4>Colonne ' + (i + 1) + '</h4><ul class="dd-zones" data-dd-depot="' + i + '" aria-label="Les zones de la colonne ' + (i + 1) + ', de haut en bas">');
      c.forEach((z, k) => {
        const dit = nom(z);
        l.push('<li class="dd-zone" draggable="true" tabindex="0" data-dd-zone="' + esc(z) + '" aria-label="' + esc(dit + ', colonne ' + (i + 1) + ', rang ' + (k + 1)) + '"><span class="dd-nom">' + esc(dit) + '</span><span class="dd-gestes">'
          + geste('monter', '↑', 'Monter ' + dit, z, k === 0) + geste('descendre', '↓', 'Descendre ' + dit, z, k === c.length - 1)
          + geste('gauche', '←', dit + ' : colonne précédente', z, i === 0) + geste('droite', '→', dit + ' : colonne suivante', z, i === n - 1)
          + '<button type="button" class="btn btn-mini dd-geste dd-mot" data-dd="rangee" data-dd-zone="' + esc(z) + '" title="' + esc(dit + ' : en rangée du bas, sous les colonnes') + '">En rangée du bas</button></span></li>');
      });
      l.push('</ul>' + (c.length ? '' : '<p class="dd-vide">Vide. <button type="button" class="btn btn-mini" data-dd="retirer" data-dd-colonne="' + i + '">Retirer cette colonne vide</button></p>') + '</li>');
    });
    l.push('</ol><p class="row-btns"><button type="button" class="btn btn-sm" data-dd="ajouter">Ajouter une colonne</button></p>');
    l.push('<h3 id="dd-titre-rangees">Les rangées du bas <small>de haut en bas</small></h3>');
    const choix = (quoi, zone, valeur, dit) => '<label class="dd-longe">' + dit + ' <select data-dd="' + quoi + '" data-dd-zone="' + esc(zone) + '">'
      + Array.from({ length: Math.max(n, 1) }, (_, i) => '<option value="' + (i + 1) + '"' + (i + 1 === valeur ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select></label>';
    l.push('<ul class="dd-zones dd-rangees" data-dd-depot="rangees" aria-labelledby="dd-titre-rangees">');
    // Une rangée ne monte ou ne descend que si elle peut changer de place avec sa voisine : la plus large reste la plus basse.
    const rangee = JSON.stringify(D().ranger(d)), bouge = (zone, pas) => JSON.stringify(D().decaler(d, zone, pas)) !== rangee;
    d.rangees.forEach((r, k) => {
      const dit = nom(r.zone);
      l.push('<li class="dd-zone dd-rangee" draggable="true" tabindex="0" data-dd-zone="' + esc(r.zone) + '" aria-label="' + esc(dit + ', rangée du bas ' + (k + 1) + ', de la colonne ' + r.de + ' à la colonne ' + r.a) + '"><span class="dd-nom">' + esc(dit) + '</span><span class="dd-gestes">'
        + choix('de', r.zone, r.de, 'de la colonne') + choix('a', r.zone, r.a, 'à la colonne')
        + geste('monter', '↑', 'Monter ' + dit, r.zone, k === 0 || !bouge(r.zone, -1)) + geste('descendre', '↓', 'Descendre ' + dit, r.zone, k === d.rangees.length - 1 || !bouge(r.zone, 1))
        + '<button type="button" class="btn btn-mini dd-geste dd-mot" data-dd="colonne" data-dd-zone="' + esc(r.zone) + '" title="' + esc(dit + ' : dans une colonne') + '">En colonne</button></span></li>');
    });
    l.push('</ul>' + (d.rangees.length ? (d.rangees.length > 1 ? '<p class="dd-vide">La plus large est toujours la plus basse : deux rangées ne changent de place que si elles longent les mêmes colonnes.</p>' : '')
      : '<p class="dd-vide">Aucune : chaque colonne descend jusqu’en bas du site.</p>'));
    l.push('<p class="row-btns"><button type="button" class="btn btn-sm" data-dd="automatique"' + (e.reglee ? '' : ' disabled') + '>Revenir à la disposition automatique</button></p>');
    return l.join('');
  }

  /**
   * Le geste demandé, appliqué à une disposition : rend { disposition, dit } — `dit` : ce qu'il a fait, pour « Annuler » —,
   * ou null s'il ne change rien. `g` : { quoi, zone, colonne, rang, valeur } ; `nom(id)` : le nom d'une zone.
   */
  function appliquer(d, g, nom) {
    const M = D(), ou = g.zone != null ? M.placeDe(d, g.zone) : null, dit = g.zone != null ? nom(g.zone) : '';
    const enColonne = c => 'dans la colonne ' + (c + 1);
    let n = null, mot = '';
    if (g.quoi === 'ajouter') { n = M.ajouterColonne(d); mot = 'Une colonne de plus : la colonne ' + n.colonnes.length + '.'; }
    else if (g.quoi === 'retirer') { n = M.retirerColonne(d, g.colonne); mot = 'La colonne vide ' + (+g.colonne + 1) + ' est retirée.'; }
    else if (!ou) return null;
    else if (g.quoi === 'monter' || g.quoi === 'descendre') { n = M.decaler(d, g.zone, g.quoi === 'monter' ? -1 : 1); mot = dit + (g.quoi === 'monter' ? ' monte d’un rang.' : ' descend d’un rang.'); }
    else if (g.quoi === 'gauche' || g.quoi === 'droite') { n = M.changerDeColonne(d, g.zone, g.quoi === 'gauche' ? -1 : 1); const p = M.placeDe(n, g.zone); mot = dit + ' : ' + (p && 'colonne' in p ? enColonne(p.colonne) : 'en rangée du bas') + '.'; }
    else if (g.quoi === 'rangee') { n = M.enRangee(d, g.zone); mot = dit + ' : en rangée du bas.'; }
    else if (g.quoi === 'colonne') { const c = 'rangee' in ou ? Math.min(d.rangees[ou.rangee].de, Math.max(d.colonnes.length, 1)) - 1 : ou.colonne; n = M.mettre(d, g.zone, c); mot = dit + ' : ' + enColonne(c) + '.'; }
    else if (g.quoi === 'de' || g.quoi === 'a') {
      const r = 'rangee' in ou ? d.rangees[ou.rangee] : null; if (!r) return null;
      n = M.longer(d, g.zone, g.quoi === 'de' ? g.valeur : r.de, g.quoi === 'a' ? g.valeur : r.a);
      const x = n.rangees.find(q => q.zone === g.zone); mot = dit + ' longe ' + (x.de === x.a ? 'la colonne ' + x.de : 'les colonnes ' + x.de + ' à ' + x.a) + '.';
    }
    else if (g.quoi === 'poser') {
      // Un glisser-déposer : dans une colonne, à un rang ; ou parmi les rangées du bas.
      if (g.colonne === 'rangees') { if ('rangee' in ou) return null; n = M.enRangee(d, g.zone); mot = dit + ' : en rangée du bas.'; }
      else { n = M.mettre(d, g.zone, g.colonne, g.rang); mot = dit + ' : ' + enColonne(+g.colonne) + '.'; }
    }
    return n && JSON.stringify(n) !== JSON.stringify({ colonnes: d.colonnes, rangees: d.rangees }) ? { disposition: n, dit: mot } : null;
  }

  /**
   * Installe le panneau dans `hote`. `a` : { site() — le site généré montré —, siteAuto() — le même sans disposition —,
   * reglee() — une disposition est-elle réglée ? —, regler(disposition | null, dit), nom(id) }.
   * Rend { rendre(), etat() } : `rendre` redessine (après un geste, « Annuler », un changement d'équipes).
   */
  function installer(hote, a) {
    const M = D();
    /** La disposition sur laquelle portent les gestes : celle que le site trace ; automatique, celle qui lui ressemble. */
    const actuelle = () => { const s = a.site(); return s && s.disposition ? M.ranger(s.disposition) : M.depuisLeSite(a.siteAuto()); };
    const etat = () => { const s = a.site(); return { disposition: actuelle(), reglee: !!a.reglee(), notes: phrases(s && s.notes, a.nom), nom: a.nom }; };
    let aFocaliser = null;
    function rendre() {
      const e = etat(), cle = JSON.stringify([e.disposition, e.reglee, e.notes]) + '\n' + e.disposition.colonnes.flat().concat(e.disposition.rangees.map(r => r.zone)).map(a.nom).join('\n');
      if (hote.dataset.ddCle !== cle) { hote.innerHTML = html(e); hote.dataset.ddCle = cle; }
      // Après un geste au clavier, le focus revient sur le même bouton de la même zone (ou sur la zone) : on peut recommencer.
      if (aFocaliser) {
        const sel = aFocaliser, zone = hote.querySelector('.dd-zone[data-dd-zone="' + CSS.escape(sel.zone ?? '') + '"]');
        const cible = sel.quoi && zone ? zone.querySelector('[data-dd="' + sel.quoi + '"]:not(:disabled)') || zone : zone || hote.querySelector('[data-dd="' + (sel.quoi || 'ajouter') + '"]:not(:disabled)');
        aFocaliser = null;
        if (cible) cible.focus();
      }
    }
    function faire(g, focus) {
      const r = appliquer(actuelle(), g, a.nom);
      if (!r) return false;
      aFocaliser = focus || null;
      a.regler(r.disposition, r.dit);
      rendre();
      return true;
    }
    hote.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-dd]'); if (!b || b.disabled) return;
      const quoi = b.dataset.dd;
      if (quoi === 'automatique') { aFocaliser = { quoi: 'ajouter' }; a.regler(null, 'La disposition des zones redevient automatique.'); rendre(); return; }
      faire({ quoi, zone: b.dataset.ddZone, colonne: b.dataset.ddColonne }, { quoi, zone: b.dataset.ddZone });
    });
    hote.addEventListener('change', ev => {
      const s = ev.target.closest('select[data-dd]'); if (!s) return;
      if (!faire({ quoi: s.dataset.dd, zone: s.dataset.ddZone, valeur: +s.value }, { quoi: s.dataset.dd, zone: s.dataset.ddZone })) rendre();
    });
    // Au clavier, sur une zone qui a le focus : les flèches la déplacent (haut, bas : son rang ; gauche, droite : sa colonne).
    hote.addEventListener('keydown', ev => {
      const li = ev.target.matches && ev.target.matches('.dd-zone') ? ev.target : null; if (!li || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const quoi = { ArrowUp: 'monter', ArrowDown: 'descendre', ArrowLeft: 'gauche', ArrowRight: 'droite' }[ev.key]; if (!quoi) return;
      ev.preventDefault(); ev.stopPropagation();
      faire({ quoi, zone: li.dataset.ddZone }, { zone: li.dataset.ddZone });
    });
    // Glisser-déposer : une zone se lâche dans une colonne (à la place de la zone visée, ou à la fin) ou parmi les rangées du bas.
    let glissee = null;
    hote.addEventListener('dragstart', ev => {
      const li = ev.target.closest && ev.target.closest('.dd-zone'); if (!li) return;
      glissee = li.dataset.ddZone; li.classList.add('dd-glissee');
      if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', glissee); } catch (e) { /* le navigateur garde la zone glissée : `glissee` suffit */ } }
    });
    const depotSous = ev => (ev.target.closest ? ev.target.closest('[data-dd-depot]') : null);
    hote.addEventListener('dragover', ev => {
      const depot = glissee != null ? depotSous(ev) : null; if (!depot) return;
      ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      for (const x of hote.querySelectorAll('.dd-depot')) if (x !== depot) x.classList.remove('dd-depot');
      depot.classList.add('dd-depot');
    });
    const finir = () => { glissee = null; for (const x of hote.querySelectorAll('.dd-depot,.dd-glissee')) x.classList.remove('dd-depot', 'dd-glissee'); };
    hote.addEventListener('drop', ev => {
      const depot = glissee != null ? depotSous(ev) : null; if (!depot) return;
      ev.preventDefault();
      const zone = glissee, vise = ev.target.closest('.dd-zone'), rang = vise && vise.parentElement === depot ? [...depot.children].indexOf(vise) : undefined;
      finir();
      faire({ quoi: 'poser', zone, colonne: depot.dataset.ddDepot, rang }, { zone });
    });
    hote.addEventListener('dragend', finir);
    return { rendre, etat };
  }

  const api = { html, phrases, appliquer, installer };
  if (enNode) module.exports = api;
  else root.OrlyDirectDisposer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
