/* ==========================================================================
 *  LA PALETTE ET LA FICHE DES RACCOURCIS (refonte du 08/10, étape 10)
 *
 *  • La palette (Ctrl K, ⌘ K sur Mac, ou « Aller à… » dans la barre du haut) :
 *    quelques lettres, et elle propose une page, un service, une équipe, une
 *    commande ou un geste (rejouer, annuler, le thème…). Les flèches
 *    choisissent, Entrée ouvre, Échap ferme. Sans accents ni majuscules :
 *    « equipe » trouve « Équipes ». Le site lui donne ses éléments
 *    (`brancher`) ; elle ne sait rien de l'unité.
 *  • La fiche des raccourcis (touche ?, ou depuis la palette) : tous les
 *    raccourcis du site au même endroit.
 *  `chercher(elements, texte)` et `surligner(nom, texte)` sont purs (testés
 *  en Node). Rien n'est enregistré.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');
  /** Sans accents ni majuscules : « Équipe » se trouve en tapant « equipe ». */
  const plat = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/’/g, "'");
  const motsDe = texte => plat(texte).split(/\s+/).filter(Boolean);

  /* ---- chercher --------------------------------------------------------- */

  /** Ce que vaut un élément pour ces mots : 0 s'il en manque un. Le début du nom compte le plus. */
  function valeur(el, mots) {
    const nom = plat(el.nom), debuts = nom.split(/[^a-z0-9]+/).filter(Boolean);
    const reste = plat((el.indice || '') + ' ' + (el.mots || ''));
    let v = 0;
    for (const m of mots) {
      if (nom.startsWith(m)) v += 4;
      else if (debuts.some(d => d.startsWith(m))) v += 3;
      else if (nom.includes(m)) v += 2;
      else if (reste.includes(m)) v += 1;
      else return 0;
    }
    return v;
  }

  /**
   * Ce qui répond à un texte, par groupe ; le groupe du meilleur en tête, le
   * meilleur en tête de son groupe. Sans texte : les groupes `sansTexte`.
   * @param {{groupe:string, nom:string, indice?:string, mots?:string}[]} elements
   * @param {{groupes?:string[], sansTexte?:string[], max?:number}} o
   * @returns {{groupe:string, elements:object[]}[]}
   */
  function chercher(elements, texte, o = {}) {
    const mots = motsDe(texte);
    const ordre = o.groupes || [...new Set(elements.map(e => e.groupe))];
    const rang = g => (ordre.includes(g) ? ordre.indexOf(g) : ordre.length);
    if (!mots.length) {
      const montres = o.sansTexte || ordre;
      return ordre.filter(g => montres.includes(g))
        .map(g => ({ groupe: g, elements: elements.filter(e => e.groupe === g) }))
        .filter(g => g.elements.length);
    }
    const max = o.max || 8, groupes = new Map();
    elements.map((e, i) => ({ e, i, v: valeur(e, mots) })).filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v || rang(a.e.groupe) - rang(b.e.groupe) || a.i - b.i)
      .forEach(({ e }) => {
        if (!groupes.has(e.groupe)) groupes.set(e.groupe, []);
        const l = groupes.get(e.groupe); if (l.length < max) l.push(e);
      });
    return [...groupes].map(([groupe, els]) => ({ groupe, elements: els }));
  }

  /** Le nom, échappé, avec ce qui répond aux mots tapés en <mark>. */
  function surligner(nom, texte) {
    const s = String(nom ?? ''), p = plat(s), mots = motsDe(texte);
    // Une lettre qui change de longueur sans ses accents : on n'invente pas de position.
    if (!mots.length || p.length !== s.length) return esc(s);
    const zones = [];
    for (const m of mots) {
      const re = new RegExp('(^|[^a-z0-9])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const t = re.exec(p), i = t ? t.index + t[1].length : p.indexOf(m);
      if (i >= 0) zones.push([i, i + m.length]);
    }
    zones.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [a, b] of zones) {
      if (b <= pos) continue;
      const d = Math.max(a, pos);
      out += esc(s.slice(pos, d)) + '<mark>' + esc(s.slice(d, b)) + '</mark>';
      pos = b;
    }
    return out + esc(s.slice(pos));
  }

  /* ---- la palette --------------------------------------------------------- */

  let dlg = null, champ = null, liste = null, vide = null, plats = [], actif = 0;
  let config = { elements: () => [], groupes: null, sansTexte: null, peutOuvrir: () => true };

  function construire() {
    dlg = document.createElement('dialog');
    dlg.className = 'palette';
    dlg.setAttribute('aria-label', 'Aller à');
    dlg.innerHTML = `<div class="pal-champ">${ico('recherche')}
        <input type="text" id="pal-texte" role="combobox" aria-expanded="true" aria-controls="pal-liste" aria-autocomplete="list"
          aria-label="Aller à" autocomplete="off" spellcheck="false" placeholder="Une page, un service, une équipe, une commande…">
        <kbd>Échap</kbd></div>
      <div class="pal-liste" id="pal-liste" role="listbox" aria-label="Propositions"></div>
      <p class="pal-vide" role="status" hidden></p>
      <p class="pal-pied"><span><kbd>↑</kbd><kbd>↓</kbd> choisir</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></p>`;
    document.body.appendChild(dlg);
    champ = dlg.querySelector('input'); liste = dlg.querySelector('.pal-liste'); vide = dlg.querySelector('.pal-vide');
    champ.addEventListener('input', () => { actif = 0; rendre(); });
    champ.addEventListener('keydown', e => {
      const n = plats.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) { actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; marquer(true); }
      } else if (e.key === 'Enter') {
        e.preventDefault(); executer(actif);
      } else if (e.key === 'Tab') {
        e.preventDefault();   // le champ garde la main : les propositions se choisissent aux flèches
      }
    });
    // Le pointeur choisit sans voler le focus du champ.
    liste.addEventListener('mousedown', e => e.preventDefault());
    liste.addEventListener('pointermove', e => {
      const o = e.target.closest('[role=option]'); if (!o) return;
      const i = +o.id.slice(6);
      if (i !== actif) { actif = i; marquer(false); }
    });
    liste.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) executer(+o.id.slice(6)); });
    // Un clic hors de la fenêtre (sur le voile) la ferme.
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
  }

  function rendre() {
    const mots = champ.value;
    const groupes = chercher(config.elements() || [], mots, { groupes: config.groupes, sansTexte: config.sansTexte });
    plats = groupes.flatMap(g => g.elements);
    if (actif >= plats.length) actif = 0;
    let n = 0;
    liste.innerHTML = groupes.map((g, k) => `<div role="group" aria-labelledby="pal-g${k}"><div class="pal-groupe" id="pal-g${k}" role="presentation">${esc(g.groupe)}</div>`
      + g.elements.map(el => `<div class="pal-option" role="option" id="pal-o-${n++}" aria-selected="false">${el.ico ? ico(el.ico) : ''}`
        + `<span class="pal-nom">${surligner(el.nom, mots)}</span>${el.indice ? `<span class="pal-indice">${esc(el.indice)}</span>` : ''}</div>`).join('')
      + '</div>').join('');
    liste.hidden = !plats.length;
    vide.hidden = !!plats.length;
    vide.textContent = plats.length ? '' : 'Rien ne répond à « ' + mots.trim() + ' ».';
    marquer(true);
  }

  function marquer(defiler) {
    for (const o of liste.querySelectorAll('[aria-selected="true"]')) o.setAttribute('aria-selected', 'false');
    const o = liste.querySelector('#pal-o-' + actif);
    if (o) {
      o.setAttribute('aria-selected', 'true');
      champ.setAttribute('aria-activedescendant', o.id);
      if (defiler) o.scrollIntoView({ block: 'nearest' });
    } else champ.removeAttribute('aria-activedescendant');
  }

  function executer(i) {
    const el = plats[i]; if (!el) return;
    // La fenêtre fermée rend le focus à ce qui l'avait ; le geste peut ensuite le déplacer.
    dlg.close();
    try { el.faire(); } catch (e) { if (root.console) root.console.error('Palette :', e); }
  }

  /** Ouvre la palette (déjà ouverte : son texte est tout choisi, on retape par-dessus). */
  function ouvrir(texte) {
    if (!dlg) construire();
    if (dlg.open) { champ.select(); return; }
    if (config.peutOuvrir && !config.peutOuvrir()) return;
    if (fiche && fiche.open) fiche.close();
    champ.value = texte || '';
    actif = 0;
    rendre();
    dlg.showModal();
    champ.focus();
  }
  const fermer = () => { if (dlg && dlg.open) dlg.close(); };
  const ouverte = () => !!(dlg && dlg.open);

  /* ---- la fiche des raccourcis ------------------------------------------ */

  let fiche = null;
  const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const MOD = MAC ? '⌘' : 'Ctrl';
  const touches = t => t.split(' + ').map(k => `<kbd>${esc(k)}</kbd>`).join('<span aria-hidden="true">+</span>');

  /** Les raccourcis du site, par endroit : [touches (« A + B », « ou » entre deux), ce qu'elles font]. */
  function sections() {
    return [
      ['Partout', [
        [MOD + ' + K', 'Aller à une page, un service, une équipe, une commande'],
        ['?', 'Cette fiche des raccourcis'],
        [MOD + ' + Z', 'Annuler, hors d’un champ'],
        [MOD + ' + Maj + Z|' + MOD + ' + Y', 'Rétablir'],
        ['Échap', 'Fermer une fenêtre, un tiroir, une liste'],
        ['Tab|Maj + Tab', 'Passer d’un élément à l’autre']]],
      ['Champs et tableaux', [
        ['Entrée', 'Enregistrer ; dans un tableau, descendre à la ligne suivante'],
        ['Maj + Entrée', 'Enregistrer et remonter, dans un tableau'],
        ['↑|↓', 'Dans une heure : un quart d’heure de plus ou de moins'],
        ['Maj + ↑|Maj + ↓', 'Dans une heure : une heure ; dans un nombre : dix pas']]],
      ['Le plan rejoué', [
        ['Espace', 'Lire la journée, ou la mettre en pause'],
        ['+|−', 'Zoomer, dézoomer (le plan choisi)'],
        ['0', 'Toute l’unité'],
        ['← → ↑ ↓', 'Déplacer la vue']]],
      ['Le plan de l’unité, en modification', [
        ['V|R|P|H', 'Choisir, tracer un rectangle, un polygone, la main'],
        ['Espace', 'Maintenue : déplacer la vue'],
        ['← → ↑ ↓', 'Déplacer la zone choisie (Maj : dix fois plus)'],
        [MOD + ' + D', 'Dupliquer la zone choisie'],
        ['Suppr', 'Supprimer la zone, ou le sommet choisi'],
        ['Entrée', 'Fermer le polygone'],
        ['Échap', 'Abandonner le tracé']]],
      ['Les diagrammes des chemins et des liens', [
        ['Entrée|Espace', 'Choisir le service ou le lien qui a le focus'],
        ['Alt + ← → ↑ ↓', 'Déplacer le service choisi'],
        ['Suppr', 'Retirer le lien choisi'],
        ['Échap', 'Abandonner « relier »']]]
    ];
  }

  function construireFiche() {
    fiche = document.createElement('dialog');
    fiche.className = 'raccourcis';
    fiche.setAttribute('aria-labelledby', 'raccourcis-titre');
    fiche.innerHTML = `<div class="rac-tete"><h2 id="raccourcis-titre">Raccourcis clavier</h2>
        <button type="button" class="btn btn-icone" data-rac-fermer aria-label="Fermer">${ico('croix')}</button></div>
      <div class="rac-corps">${sections().map(([titre, l]) => `<section><h3>${esc(titre)}</h3><dl>${l.map(([k, quoi]) =>
        `<div><dt>${k.split('|').map(touches).join('<span class="rac-ou">ou</span>')}</dt><dd>${esc(quoi)}</dd></div>`).join('')}</dl></section>`).join('')}</div>`;
    document.body.appendChild(fiche);
    fiche.addEventListener('click', e => {
      if (e.target.closest('[data-rac-fermer]')) { fiche.close(); return; }
      if (e.target !== fiche) return;
      const r = fiche.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fiche.close();
    });
  }

  function raccourcis() {
    if (!fiche) construireFiche();
    if (dlg && dlg.open) dlg.close();
    if (!fiche.open) fiche.showModal();
  }

  /* ---- les touches -------------------------------------------------------- */

  /** Un champ où l'on tape du texte : « ? » s'y écrit. */
  const saisie = el => !!(el && el.closest) && (el.isContentEditable
    || el.matches('textarea,select,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=color])'));

  /**
   * Branche la palette sur le site.
   * @param {{elements:Function, groupes?:string[], sansTexte?:string[], peutOuvrir?:Function}} c
   *   elements()  — ce qu'elle propose maintenant : {groupe, nom, indice?, mots?, ico?, faire} ;
   *   peutOuvrir() — faux quand elle ne doit pas s'ouvrir (le plan en modification).
   */
  function brancher(c) {
    config = { ...config, ...c };
    if (brancher.fait) return;
    brancher.fait = true;
    document.addEventListener('keydown', e => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 'k') {
        e.preventDefault();
        if (ouverte()) fermer(); else ouvrir();
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !saisie(e.target)
        && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        raccourcis();
      }
    });
  }

  const api = { chercher, surligner, plat, brancher, ouvrir, fermer, ouverte, raccourcis, sections, MOD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
