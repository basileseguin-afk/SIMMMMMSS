/* « Chemins » : cinq pages en une (version 1, évolution 22 c).
 *
 * Une chose se règle à un seul endroit. Cette page reprend « Vue d'ensemble »,
 * « Chemins de production », « Chemin d'une commande », « Étapes de chaque
 * commande » et « Liens entre services ».
 *
 *   à gauche   la liste des chemins, avec pour chacun son nombre de commandes
 *              et d'étapes ; en tête, « Ajouter un chemin » ; en bas, « Toutes
 *              les commandes ont un chemin », ou le nombre de celles qui n'en
 *              ont pas, avec un lien qui les montre ;
 *   à droite   le chemin choisi : ses étapes de l'amont vers l'aval, en cases
 *              reliées ; un clic sur une étape montre, dessous, le tableau
 *              « commande, équipe à cette étape, temps par vol ».
 *
 * Un seul éditeur de chemin : le diagramme de graphe.js, celui de « Chemins de
 * production ». La page hérite de `MonUnite` (unite.js, commun avec la
 * version 2, que ce module ne modifie pas) par « Services et équipes » : les
 * gestes d'avant gardent leurs attributs, les mêmes gestes écrivent les mêmes
 * données. Une équipe ne se règle que dans « Services et équipes » : son nom y
 * mène. Le choix de l'équipe qui prépare une commande à une étape se fait ici.
 */
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
  const P = NODE ? require('./moteur/production.js') : root.MoteurProduction;
  const PC = NODE ? require('./parcours.js') : root.OrlyParcours;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pl = (n, un, des) => n + ' ' + (n > 1 ? (des || un + 's') : un);
  const fabrique = a => a.type === 'manuel' || a.type === 'robot' || !a.type;

  /**
   * Les chemins de l'unité, dans l'ordre de la liste : les chemins que suivent des classes ou plusieurs commandes,
   * leurs variantes, puis les chemins à part (celui d'une seule commande).
   * @returns {{p: object, genre: 'chemin'|'variante'|'apart', commandes: object[], etapes: number}[]}
   */
  function chemins(etat, classes) {
    const rang = { chemin: 0, variante: 1, apart: 2 };
    return (etat.parcours || []).map((p, i) => {
      const genre = p.type ? (p.auto ? 'variante' : 'chemin') : 'apart';
      const commandes = genre === 'apart' ? (classes || []).filter(c => PC.cheminDe(etat, c.id) === p) : PC.commandesDuType(etat, p.id, classes);
      return { p, genre, commandes, etapes: P.servicesDuParcours(p).length, i };
    }).sort((a, b) => rang[a.genre] - rang[b.genre] || a.i - b.i);
  }

  /** Ce que la liste dit d'un chemin : « 12 commandes · 9 étapes ». */
  const compte = x => pl(x.commandes.length, 'commande') + ' · ' + pl(x.etapes, 'étape');

  /** Les commandes qui n'ont pas de chemin : ni le leur, ni celui de leur classe. */
  const sansChemin = (etat, classes) => (classes || []).filter(c => !PC.fluxDe(etat, c));

  /**
   * Ce que le tableau d'une étape dit d'une commande : qui la prépare ici.
   *   equipe   une équipe qui prépare la prépare (elle se choisit ici) ;
   *   chaine   l'équipe d'un autre service la fait ici aussi, à la chaîne ;
   *   commune  le service sert toutes les commandes (mise à disposition, plonge, chargement) ;
   *   aucune   personne : l'étape serait sautée — à corriger.
   * @returns {{genre: string, equipe: object|null, choix: object[]}} `choix` : les équipes du service qui préparent
   */
  function ligneEtape(etat, service, cmd) {
    const duService = (etat.ateliers || []).filter(a => a.service === service);
    const choix = duService.filter(fabrique), a = PC.caseDe(etat, service, cmd);
    if (a && fabrique(a)) return { genre: 'equipe', equipe: a, choix };
    const chaine = PC.fusionneePar(etat, service, cmd);
    if (chaine) return { genre: 'chaine', equipe: chaine, choix };
    if (a && !choix.length) return { genre: 'commune', equipe: a, choix };
    return { genre: 'aucune', equipe: null, choix };
  }

  const api = { chemins, compte, sansChemin, ligneEtape };
  if (NODE) { module.exports = api; return; }
  const S = root.OrlyServicesPage;
  if (!S || !S.PageServices) { root.OrlyCheminsPage = api; return; }
  const I = () => root.OrlyIcones;
  const pic = (nom, classe) => (I() ? I().ico(nom, classe) : '');
  const GENRES = { chemin: 'Chemins', variante: 'Variantes', apart: 'Chemins à part' };
  const COMMUNE = { dispo: 'mise à disposition : elle sert toutes les commandes', lavage: 'elle lave pour toutes les commandes',
    handling: 'elle charge les vols de toutes les commandes', appui: 'hors tunnel : elle sert toutes les commandes' };

  class PageChemins extends S.PageServices {
    constructor(a) {
      super(a);
      this.cheminPanneau = null;        // 'sans' : les commandes sans chemin, à la place du chemin choisi
      this.cheminAjout = false;         // « Ajouter un chemin », déplié
      this.cheminSections = new Map();  // les sections repliées de la fiche d'un chemin
      this.lierChemins();
    }

    /** Le chemin choisi : un chemin de l'unité, quel qu'il soit (suivi par des classes, variante, chemin à part). */
    cheminChoisi() { return (this.etat.parcours || []).find(p => p.id === this.fluxChoisi) || null; }

    /** Ouvrir un chemin, sur une de ses étapes s'il y a lieu. */
    ouvrirFlux(id, service) {
      this.cheminPanneau = null; this.fluxChoisi = id; this.fluxSel = service ? { type: 'noeud', id: service } : null;
      if (this.graphe) this.graphe.selection = this.fluxSel;
      if (this.page() !== 'mu-flux') this.a.page('mu-flux'); else this.rendreFlux();
      // Arrivé pour une étape : son tableau en vue, sous le diagramme — la ligne de la commande, si l'on vient pour elle.
      if (service) (root.requestAnimationFrame || (f => setTimeout(f, 0)))(() => {
        const l = root.document.querySelector('#mu-flux .ch-etape tr.ch-vise') || root.document.querySelector('#mu-flux .ch-etape-tete');
        if (l && l.scrollIntoView) l.scrollIntoView({ block: 'center' });
      });
    }

    /** Le chemin d'une commande : celui qu'elle suit, ouvert sur ce service — son équipe s'y choisit. */
    chemin(cmd, service) {
      const p = PC.fluxDe(this.etat, (this.at.classes || []).find(c => c.id === cmd) || cmd);
      this.cheminCmd = cmd;
      if (p) return this.ouvrirFlux(p.id, service && P.servicesDuParcours(p).includes(service) ? service : null);
      this.cheminPanneau = 'sans';
      if (this.page() !== 'mu-flux') this.a.page('mu-flux'); else this.rendreFlux();
    }

    /**
     * Arriver par le nom ou le lien d'une page d'avant, au bon endroit : `liste` — la liste des chemins (« Vue
     * d'ensemble », « Chemins de production ») ; `etapes` — le tableau d'une étape du chemin choisi (« Chemin d'une
     * commande », « Étapes de chaque commande ») ; `sans` — les commandes sans chemin (« Liens entre services »).
     */
    allerChemins(lieu) {
      this.cheminPanneau = lieu === 'sans' && sansChemin(this.etat, this.at.classes).length ? 'sans' : null;
      const p = this.cheminChoisi() || (chemins(this.etat, this.at.classes)[0] || {}).p;
      if (lieu === 'etapes' && p && !(this.fluxSel && this.fluxSel.type === 'noeud')) {
        const premiere = P.servicesDuParcours(p)[0];
        this.fluxChoisi = p.id; this.fluxSel = premiere ? { type: 'noeud', id: premiere } : null;
        if (this.graphe) this.graphe.selection = this.fluxSel;
      }
      this.rendreFlux();
      const box = root.document.getElementById('mu-flux'); if (!box) return;
      const cible = lieu === 'etapes' ? box.querySelector('.ch-etape select, .ch-etape button, .ch-etape')
        : lieu === 'sans' ? box.querySelector('.ch-bas [data-ch-panneau], .ch-bas')
        : box.querySelector('.ch-liste .mu-svc.actif') || box.querySelector('.ch-liste .mu-svc');
      if (!cible) return;
      cible.scrollIntoView({ block: 'nearest' });
      if (cible.focus) { if (!cible.matches('button,select,input,a')) cible.tabIndex = -1; cible.focus({ preventScroll: true }); }
    }

    /* ---- la page ------------------------------------------------------------------------------------------------ */

    rendreFlux() {
      const box = root.document.getElementById('mu-flux'); if (!box) return;
      const st = this.etat, classes = this.at.classes || [], tous = chemins(st, classes);
      if (!tous.some(x => x.p.id === this.fluxChoisi)) {
        const suivi = tous.slice().sort((a, b) => b.commandes.length - a.commandes.length)[0];
        this.fluxChoisi = suivi ? suivi.p.id : null; this.fluxSel = null;
      }
      const sans = sansChemin(st, classes);
      if (this.cheminPanneau === 'sans' && !sans.length) this.cheminPanneau = null;
      const x = tous.find(y => y.p.id === this.fluxChoisi);
      // Une étape choisie qui n'est plus dans le chemin (retirée, autre chemin) ne l'est plus.
      if (this.fluxSel && x && !(this.fluxSel.type === 'noeud' ? P.servicesDuParcours(x.p).includes(this.fluxSel.id)
        : P.arcsDuParcours(x.p).some(a => a.from + '>' + a.to === this.fluxSel.id))) this.fluxSel = null;
      const ligne = y => {
        const on = y.p.id === this.fluxChoisi && this.cheminPanneau !== 'sans';
        const ch = PC.chaines(st, y.p, y.commandes.map(c => c.id)).map(g => this.nom(g.avant) + ' + ' + this.nom(g.service));
        return `<button type="button" class="mu-svc ${y.commandes.length ? 'ok' : 'libre'}${ch.length ? ' en-chaine' : ''}${on ? ' actif' : ''}" data-mu-flux-choisir="${esc(y.p.id)}" aria-current="${on}">
          <span class="mu-svc-ico" aria-hidden="true">${pic('fleche')}</span>
          <span class="mu-svc-txt"><b>${esc(y.p.nom)}</b><small>${esc(compte(y))}</small>${ch.length
            ? `<i class="mu-svc-chaine" title="Fait d’un bloc, à la chaîne, par une même équipe">${pic('chaine', 'ico-texte')} ${esc(ch.join(' · '))} à la chaîne</i>` : ''}</span></button>`;
      };
      const groupe = g => { const l = tous.filter(y => y.genre === g); return l.length ? `<p class="mu-groupe">${GENRES[g]}</p>` + l.map(ligne).join('') : ''; };
      const bas = sans.length
        ? `<button type="button" class="lien-discret ch-sans${this.cheminPanneau === 'sans' ? ' actif' : ''}" data-ch-panneau="sans" aria-current="${this.cheminPanneau === 'sans'}">${
          pl(sans.length, 'commande')} sans chemin →</button>`
        : '<span class="ch-tous">Toutes les commandes ont un chemin</span>';
      const liste = `<nav class="mu-liste ch-liste" aria-label="Les chemins">
        <details class="se-ajout" data-ch-ajout${this.cheminAjout ? ' open' : ''}><summary class="btn btn-sm btn-play">+ Ajouter un chemin</summary>
          <form class="mu-nouveau" data-mu-flux-nouveau>
          <label>Nom <input name="nom" maxlength="76" placeholder="ex. Économie robot" required></label>
          <label>Partir de <select name="source"><option value="">rien (vide)</option>${PC.types(st).map(t => `<option value="${esc(t.id)}"${t.id === this.fluxChoisi ? ' selected' : ''}>${esc(t.nom)}</option>`).join('')}</select></label>
          <button class="btn btn-sm btn-play" type="submit">+ Créer</button></form></details>
        ${groupe('chemin')}${groupe('variante')}${groupe('apart')}${tous.some(y => y.genre === 'apart' && y.commandes.length)
          ? `<button type="button" class="lien-discret ch-regrouper" data-mu-flux-action="regrouper" title="Chaque classe aura son chemin ; les commandes qui s’en écartent, leur variante">Regrouper les chemins à part</button>` : ''}
        <p class="ch-bas">${bas}</p>
      </nav>`;
      let corps, vue = 'chemin';
      try {
        if (this.cheminPanneau === 'sans') { vue = 'sans'; corps = this.ficheSansChemin(sans); }
        else corps = x ? this.ficheChemin(x, classes) : '<p class="mini-note">Aucun chemin : ajoutez-en un (à gauche).</p>';
      } catch (e) {
        corps = `<p class="mu-q" role="alert">Ce chemin n’a pas pu s’afficher : ${esc(e.message)}. Envoyez ce message pour qu’on corrige.</p>`;
        if (root.console) root.console.error(e);
      }
      this.poserChemins(box, `<div class="mu-cadre ch-cadre">${liste}<div class="mu-fiche ch-fiche" data-mu-flux-fiche="${esc(x ? x.p.id : '')}" data-ch-vue="${vue}"
        data-ch-cle="${esc([this.fluxChoisi || '', vue].join('|'))}">${corps}</div></div>`);
      const g = this.grapheFlux(); if (g && x && vue === 'chemin') g.rendre();
    }

    /** Une étape vient d'être choisie : l'en-tête de son tableau vient au milieu de la colonne, sous le diagramme. */
    montrerEtape() {
      const t = root.document.querySelector('#mu-flux .ch-etape-tete');
      if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' });
    }

    /** La fiche défile dans sa colonne : redessinée, elle reste où elle était ; un autre chemin s'ouvre en haut. */
    poserChemins(box, html) {
      const avant = box.querySelector('.ch-fiche'), garde = avant ? { cle: avant.dataset.chCle, haut: avant.scrollTop } : null;
      this.poser(box, html);
      const apres = box.querySelector('.ch-fiche');
      if (garde && apres && apres !== avant && apres.dataset.chCle === garde.cle) apres.scrollTop = garde.haut;
    }

    /** Une section de la fiche, repliée ou non ; le repli est gardé d'un chemin à l'autre. */
    sectionChemin(cle, titre, corps, note, ouvert) {
      return `<details class="mu-etape se-section" data-ch-section="${cle}"${this.cheminSections.get(cle) ?? ouvert ? ' open' : ''}>
        <summary><h3>${esc(titre)}${note ? `<small>${note}</small>` : ''}</h3></summary>${corps}</details>`;
    }

    ficheChemin(x, classes) {
      const st = this.etat, p = x.p, dedans = P.servicesDuParcours(p), sel = this.fluxSel;
      const cabs = P.CABINES.filter(c => (st.parcoursCabine || {})[c] === p.id);
      const hors = this.a.services().filter(s => !dedans.includes(s.id));
      const tete = `<div class="mu-tete ch-tete">
        <span class="mu-tete-ico mu-tete-flux" aria-hidden="true">${pic('fleche')}</span>
        <label class="mu-nom">Nom du chemin<input data-mu-flux-nom="${esc(p.id)}" maxlength="76" value="${esc(p.nom)}"></label>
        <span class="ch-compte">${esc(compte(x))}${x.genre === 'variante' ? ' · variante' : x.genre === 'apart' ? ' · chemin à part' : ''}</span>
        <span class="mu-tete-fin"></span>
        <button class="btn btn-sm" type="button" data-mu-flux-action="dupliquer">Dupliquer</button>
        <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="supprimer"${cabs.length ? ' disabled title="C’est le chemin d’une classe : donnez d’abord un autre chemin à la classe"' : ''}>Supprimer</button>
      </div>`;
      // Ajouter un service et Réorganiser flottent sur le diagramme, comme avant.
      this.outilsFlux = `<label class="gr-outil-choix">Ajouter une étape <select data-mu-flux-ajout><option value="">choisir…</option>${hors.map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('')}</select></label>
          <button class="btn btn-sm" type="button" data-mu-flux-action="reorganiser" title="Ranger les étapes d’elles-mêmes, de l’amont vers l’aval">Réorganiser</button>`;
      const choisi = !sel ? `<p class="mini-note ch-geste">Cliquez une étape : le tableau dit, dessous, quelle équipe y prépare chaque commande. Tirez le rond d’une étape jusqu’à une autre pour dire qu’elle la livre.</p>`
        : sel.type === 'lien' ? `<p class="ch-lien"><b>${esc(this.nom(sel.id.split('>')[0]))} → ${esc(this.nom(sel.id.split('>')[1]))}</b>
          <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="retirer-lien" data-lien="${esc(sel.id)}">Retirer ce lien</button></p>`
        : this.tableEtape(x, sel.id);
      const suivi = x.genre === 'apart' ? this.quiSuitApart(x) : this.sansVoir(this.quiSuit(p, classes));
      return tete
        + `<div class="pc-graphe mu-graphe ch-graphe" data-mu-graphe></div>${choisi}`
        + this.sectionChemin('suivi', 'Qui le suit', suivi + this.cheminDeChacune(x) + this.variante(x), esc(pl(x.commandes.length, 'commande')), false)
        + this.sectionChemin('commandes', 'Commandes exclues et ajoutées', this.exclues(classes), (this.at.retirees || []).length ? esc(pl(this.at.retirees.length, 'exclue')) : '', false)
        + `<p class="ch-resultats"><button type="button" class="lien-discret" data-page="at-repas" data-lieu="etapes">Suivre ces commandes dans les résultats →</button></p>`;
    }

    /** « Qui le suit », sans la liste « voir le chemin d'une de ses commandes » : ses équipes sont dans le tableau de l'étape. */
    sansVoir(html) {
      const t = root.document.createElement('template'); t.innerHTML = html;
      for (const s of t.content.querySelectorAll('[data-mu-flux-chemin]')) (s.closest('label') || s).remove();
      return t.innerHTML;
    }

    /** Un chemin à part : la commande qui le suit, et le chemin qu'elle pourrait suivre à la place. */
    quiSuitApart(x) {
      const c = x.commandes[0];
      if (!c) return '<p class="mini-note">Aucune commande ne suit ce chemin : rattachez-en une depuis un autre chemin, ou supprimez-le.</p>';
      return `<p class="mini-note">C’est le chemin de <b>${esc(P.libelleClasse(c.id))}</b> seule. Une autre commande qui le choisit en fait un chemin partagé.</p>
        <label class="mu-flux-ajout-cmd">Le chemin de ${esc(P.libelleClasse(c.id))} : ${PC.selectChemin(this.etat, c, 'data-mu-cmd-chemin')}</label>`;
    }

    /** Le chemin que suit chacune de ses commandes : à choisir dans la liste de tous les chemins de l'unité. */
    cheminDeChacune(x) {
      if (x.genre === 'apart' || !x.commandes.length) return '';
      return `<p class="mu-sous-titre">Ses commandes <small>chacune peut suivre un autre chemin : à choisir dans sa liste</small></p>
        <div class="ch-suivent">${x.commandes.map(c => `<label class="ch-suit"><span><span class="puce-classe" data-cab="${esc(c.cabine)}"></span>${esc(P.libelleClasse(c.id))}</span>
          ${PC.selectChemin(this.etat, c, 'data-mu-cmd-chemin')}</label>`).join('')}</div>`;
    }

    /** Donner à une commande sa variante de ce chemin : une copie, qu'elle est seule à suivre. */
    variante(x) {
      if (x.genre === 'apart' || x.commandes.length < 2) return '';
      return `<label class="mu-flux-ajout-cmd ch-variante">Une commande s’en écarte : lui faire sa variante de ce chemin
        <select data-ch-variante><option value="">choisir…</option>${x.commandes.map(c => `<option value="${esc(c.id)}">${esc(P.libelleClasse(c.id))}</option>`).join('')}</select></label>`;
    }

    /** Le temps par vol d'une commande dans un service : lu ici, réglé dans la fiche du service. */
    tempsParVol(service, c) {
      const rg = this.a.rg ? this.a.rg() : null;
      const m = c.categorie ? P.minutesParVol(null, c) : rg && rg.baremeComplet ? P.minutesParVol(rg.baremeComplet()[service], c) : null;
      return Number.isFinite(m) ? P.heuresFr(m) + ' h' : null;
    }

    /**
     * Le tableau d'une étape : chaque commande du chemin, l'équipe qui la prépare ici, son temps par vol. L'équipe se
     * choisit ici ; son nom mène à sa fiche, dans « Services et équipes ». Une commande sans équipe est « à corriger ».
     * Un service à une équipe par compagnie (l'armement) a une ligne par compagnie.
     */
    tableEtape(x, s) {
      const st = this.etat, nom = this.nom(s), propres = this.at.classesDe(s);
      const cies = new Set(x.commandes.map(c => c.cie));
      const lignes = propres ? propres.filter(c => cies.has(c.cie)) : x.commandes;
      const lib = c => (c.categorie ? c.cie + ' · ' + (c.nom || nom) : P.libelleClasse(c.id));
      const fiche = a => `<button type="button" class="lien-discret ch-equipe" data-ch-fiche="${esc(a.id)}" title="Régler cette équipe : L’unité › Services et équipes">${esc(a.nom)} →</button>`;
      // Un service sans aucune équipe, qui sert toutes les commandes (handling, mise à disposition, plonge) : « + » crée
      // l'équipe du service, pas celle d'une commande (voir choisirEquipe).
      const partage = !st.ateliers.some(a => a.service === s) && (PC.natureService(st, s, nom) === 'handling' || PC.estDispo(st, s) || s === 'plonge');
      let manque = 0;
      const rangs = lignes.map(c => {
        const l = ligneEtape(st, s, c.id), a = l.equipe, t = this.tempsParVol(s, c);
        const choix = `<select data-ch-equipe="${esc(c.id)}" data-service="${esc(s)}" aria-label="Équipe de ${esc(lib(c))} à l’étape ${esc(nom)}">
            <option value=""${l.genre === 'equipe' ? '' : ' selected'}>— aucune —</option>
            ${l.choix.map(e => `<option value="${esc(e.id)}"${a && a.id === e.id && l.genre === 'equipe' ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}
            <option value="+">${partage ? '+ Créer l’équipe de ' + esc(nom) + ' : elle sert toutes les commandes' : '+ Nouvelle équipe « ' + esc(nom + ' ' + PC.etiquette(c.id)) + ' »'}</option></select>`;
        let equipe;
        if (l.genre === 'equipe') equipe = choix + fiche(a);
        else if (l.genre === 'chaine') equipe = `${fiche(a)}<span class="mini-note">${pic('chaine', 'ico-texte')} à la chaîne, depuis ${esc(this.nom(a.service))}</span>`;
        else if (l.genre === 'commune') equipe = `${fiche(a)}<span class="mini-note">${esc(COMMUNE[a.type] || 'elle sert toutes les commandes')}</span>`;
        else { manque++; equipe = `${choix}<span class="ch-a-corriger">à corriger</span>`; }
        return `<tr data-ch-cmd="${esc(c.id)}" class="${l.genre === 'aucune' ? 'ch-manque' : ''}${c.id === this.cheminCmd ? ' ch-vise' : ''}">
          <th scope="row">${c.cabine ? `<span class="puce-classe" data-cab="${esc(c.cabine)}"></span>` : ''}${esc(lib(c))}</th>
          <td><div class="ch-eq">${equipe}</div></td>
          <td class="num">${t ? esc(t) : '<span class="mini-note">—</span>'}</td></tr>`;
      }).join('');
      return `<section class="ch-etape" data-ch-etape="${esc(s)}" aria-label="L’étape ${esc(nom)}">
        <p class="ch-etape-tete"><b>Étape : ${esc(nom)}</b>
          <span class="mini-note">${manque ? `<b class="ch-a-corriger">${pl(manque, 'commande')} sans équipe ici</b>` : lignes.length ? 'chaque commande a son équipe' : 'aucune commande ne suit ce chemin'}</span>
          <span class="mu-tete-fin"></span>
          <button type="button" class="btn btn-sm" data-ch-relier="${esc(s)}" title="Puis choisissez l’étape qui reçoit : d’un clic, ou au clavier (Entrée)">Relier à…</button>
          <button type="button" class="lien-discret" data-ch-temps="${esc(s)}" title="Les temps par vol se règlent dans la fiche du service">Ses temps par vol →</button>
          <button type="button" class="lien-discret" data-mu-ouvrir-svc="${esc(s)}">Ses équipes →</button>
          <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="retirer-service" data-service="${esc(s)}">Retirer du chemin</button></p>
        ${lignes.length ? `<div class="table-scroll"><table class="svc-table ch-table"><caption class="sr-only">L’étape ${esc(nom)} : qui prépare chaque commande</caption>
          <thead><tr><th scope="col">${propres ? 'Compagnie' : 'Commande'}</th><th scope="col">Équipe à cette étape</th><th scope="col">Temps par vol</th></tr></thead>
          <tbody>${rangs}</tbody></table></div>` : ''}
      </section>`;
    }

    /** Les commandes qu'on ajoute au programme, et celles qu'on en retire : elles se règlent ici. */
    exclues(classes) {
      const retirees = this.at.retirees || [];
      const liste = retirees.length ? `<p class="at-exclues">Retirées du programme : ${retirees.map(c =>
        `<button type="button" class="at-chip" data-at-action="classe-retablir" data-classe="${esc(c.id)}" title="La remettre au programme">${esc(P.libelleClasse(c.id))} ↺</button>`).join(' ')}</p>`
        : '<p class="mini-note">Aucune commande n’est retirée du programme.</p>';
      const retirer = classes.length ? `<label class="mu-flux-ajout-cmd">Retirer une commande du programme
        <select data-ch-exclure><option value="">choisir…</option>${classes.map(c => `<option value="${esc(c.id)}">${esc(P.libelleClasse(c.id))}</option>`).join('')}</select></label>` : '';
      return `<div class="ch-ajoutees">${this.at.formAjout ? this.at.formAjout('chemins') : ''}</div>${liste}${retirer}`;
    }

    /** Les commandes sans chemin : chacune choisit le sien ; à défaut, les liens entre services les guident. */
    ficheSansChemin(sans) {
      const st = this.etat;
      return `<h2 class="se-titre">${pl(sans.length, 'commande')} sans chemin</h2>
        <p class="mini-note">Sans chemin, une commande suit les liens entre services. Donnez-lui un chemin : celui de sa classe (cochez la classe dans « Qui le suit », sur le chemin), ou un autre, ici.</p>
        <table class="svc-table ch-table ch-sans-table"><thead><tr><th scope="col">Commande</th><th scope="col">Chemin suivi</th></tr></thead><tbody>
        ${sans.map(c => `<tr data-ch-cmd="${esc(c.id)}"><th scope="row"><span class="puce-classe" data-cab="${esc(c.cabine)}"></span>${esc(P.libelleClasse(c.id))}</th>
          <td>${PC.selectChemin(st, c, 'data-mu-cmd-chemin')}</td></tr>`).join('')}</tbody></table>
        <p class="ch-liens"><button type="button" class="btn btn-sm" data-page="u-liens">Ouvrir les liens entre services →</button>
          <span class="mini-note">ils ne servent qu’à ces commandes</span></p>`;
    }

    /* ---- l'éditeur : un seul diagramme, pour tout chemin de l'unité --------------------------------------------- */

    grapheFlux() {
      if (this.graphe || !root.OrlyGraphe) return this.graphe;
      const u = this, chemin = () => u.cheminChoisi();
      const commandes = () => { const x = chemins(u.etat, u.at.classes).find(y => y.p.id === u.fluxChoisi); return x ? x.commandes : []; };
      this.graphe = new root.OrlyGraphe.Diagramme({
        hote: () => root.document.querySelector('#mu-flux [data-mu-graphe]'),
        get cle() { return 'flux:' + (u.fluxChoisi || ''); },
        titre: 'Le chemin : un rectangle par étape, une flèche par livraison',
        noeuds: () => {
          const t = chemin(); if (!t) return [];
          const cmds = commandes(), ico = s => (I() ? I().icoService(s, u.nom(s)) : 'service');
          return P.servicesDuParcours(t).map(s => {
            const eq = u.etat.ateliers.filter(a => a.service === s), fab = eq.filter(fabrique);
            const propres = u.at.classesDe(s);
            if (propres) {
              const faites = new Set(fab.flatMap(a => a.lots.flat())), n = propres.filter(c => faites.has(c.id)).length;
              return { id: s, nom: u.nom(s), ico: ico(s), sous: n + '/' + pl(propres.length, 'compagnie'), ton: n < propres.length ? 'neutre' : 'ok' };
            }
            const prep = fab.length ? cmds.filter(c => ligneEtape(u.etat, s, c.id).genre !== 'aucune').length : null;
            const sous = !eq.length ? 'aucune équipe' : fab.length ? prep + '/' + cmds.length + ' préparées' : eq[0].type === 'dispo' ? 'mise à disposition' : eq[0].type === 'lavage' ? 'plonge' : 'par vol';
            return { id: s, nom: u.nom(s), ico: ico(s), sous, ton: !eq.length || (fab.length && prep < cmds.length) ? 'neutre' : 'ok' };
          });
        },
        groupes: () => {
          const t = chemin(); if (!t) return [];
          const cmds = commandes().map(c => c.id);
          return PC.chaines(u.etat, t, cmds).map(g => ({ id: g.id, ids: [g.avant, g.service],
            etiquettes: { [g.avant]: 'à la chaîne → ' + u.nom(g.service), [g.service]: '+ ' + u.nom(g.avant) + ' à la chaîne · ' + g.commandes.length + '/' + cmds.length },
            titre: g.equipes.map(a => '« ' + a.nom + ' »').join(', ') + ' : ' + u.nom(g.avant) + ' + ' + u.nom(g.service) + ' d’un bloc, pour '
              + g.commandes.map(c => PC.etiquette(c)).join(', ') + '.' }));
        },
        liens: () => { const t = chemin(); return t ? P.arcsDuParcours(t).map(a => ({ id: a.from + '>' + a.to, de: a.from, vers: a.to, titre: u.nom(a.from) + ' livre ' + u.nom(a.to) })) : []; },
        relier: (de, vers) => {
          const t = chemin(); if (!t) return 'Aucun chemin choisi.';
          if (P.arcsDuParcours(t).some(a => a.from === de && a.to === vers)) return u.nom(de) + ' livre déjà ' + u.nom(vers) + '.';
          if (PC.creeBoucle(t, de, vers)) return 'Impossible : ' + u.nom(vers) + ' livre déjà ' + u.nom(de) + ' (directement ou par d’autres services).';
          u.changerFlux(y => { y.liens.push({ de, vers }); }, u.nom(de) + ' livre maintenant ' + u.nom(vers) + ', dans « ' + t.nom + ' ».');
          return '';
        },
        retirerLien: id => { const [de, vers] = id.split('>'); u.changerFlux(y => { y.liens = y.liens.filter(l => !(l.de === de && l.vers === vers)); }, 'Lien retiré.'); },
        choisir: sel => { u.fluxSel = sel; u.cheminCmd = null; u.rendreFlux(); u.montrerEtape(); },
        outils: () => u.outilsFlux || '',
        message: (t, o) => PC.annoncer(t, o)
      });
      return this.graphe;
    }

    /* ---- les gestes ---------------------------------------------------------------------------------------------
     * Ceux d'un chemin suivi par des classes sont ceux de unite.js (`lierFlux`), inchangés. Un chemin à part — celui
     * d'une seule commande, que réglait « Chemin d'une commande » — n'en est pas un pour unite.js : ses gestes sont ici. */

    /** Choisir l'équipe d'une commande à une étape : aucune, une équipe du service (à la suite), ou une nouvelle. */
    choisirEquipe(service, cmd, v) {
      // Un service à une équipe par compagnie range ses propres commandes (une par compagnie), pas celles des repas.
      const classes = this.at.classesDe(service) || this.at.classes, lib = PC.etiquette(cmd), nom = this.nom(service);
      if (!v) return this.at.changer(() => { PC.affecter(this.at.state, service, [cmd], null, classes); }, lib + ' n’a plus d’équipe à l’étape ' + nom + ' : l’étape sera sautée.');
      // Un service encore sans équipe : la première naît d'après ce qu'il est, comme quand « Chemin d'une commande »
      // ajoutait l'étape — un handling ou une mise à disposition, partagés ; une plonge ; un robot ; sinon l'équipe de la commande.
      const p = this.cheminChoisi();
      if (v === '+' && p && !this.at.state.ateliers.some(a => a.service === service)) return this.at.changer(() => {
        PC.donnerCases(this.at.state, cmd, p, [service], s => this.nom(s), classes);
      }, 'Équipe créée à l’étape ' + nom + ' : réglez son heure et ses personnes dans sa fiche (son nom y mène).');
      if (v === '+') return this.at.changer(() => {
        const st = this.at.state, cree = PC.nouvelleEquipe(st, service, nom, [], classes);
        cree.nom = PC.nomLibre(st, nom + ' ' + lib);
        PC.affecter(st, service, [cmd], cree.id, classes);
      }, 'Équipe créée pour ' + lib + ' : réglez son heure et ses personnes dans sa fiche (son nom y mène).');
      const a = (this.etat.ateliers || []).find(e => e.id === v);
      return this.at.changer(() => { PC.affecter(this.at.state, service, [cmd], v, classes); },
        lib + ' rejoint l’équipe « ' + (a ? a.nom : '') + ' », à la suite de ses commandes.');
    }

    actionApart(quoi, p) {
      const st = this.at.state;
      if (quoi === 'dupliquer') {
        let n;
        this.at.changer(() => { n = PC.nouveauType(st, p.nom + ' (copie)', p); }, 'Chemin dupliqué : donnez-lui ses commandes.');
        this.fluxChoisi = n.id; return this.rendreFlux();
      }
      if (quoi === 'supprimer') {
        const cmd = PC.commandeDu(st, p.id), dedans = new Set(P.servicesDuParcours(p));
        this.at.changer(() => {
          // Les équipes qui ne préparaient que cette commande partent avec son chemin ; une équipe partagée reste.
          if (cmd) st.ateliers = st.ateliers.filter(a => !(fabrique(a) && dedans.has(a.service) && a.lots.length && a.lots.every(l => l.every(id => id === cmd))));
          st.parcours = st.parcours.filter(y => y.id !== p.id);
          for (const c of Object.keys(st.parcoursCabine || {})) if (st.parcoursCabine[c] === p.id) delete st.parcoursCabine[c];
          for (const c of Object.keys(st.parcoursClasse || {})) if (st.parcoursClasse[c] === p.id) delete st.parcoursClasse[c];
        }, 'Chemin « ' + p.nom + ' » supprimé' + (cmd ? ' : ' + PC.etiquette(cmd) + ' suit de nouveau le chemin de sa classe.' : '.'));
        this.fluxChoisi = null; return this.rendreFlux();
      }
    }

    lierChemins() {
      const d = root.document, dans = el => el && el.closest && el.closest('#mu-flux');
      d.addEventListener('click', e => {
        if (!dans(e.target)) return;
        const p = this.cheminChoisi();
        const c = e.target.closest('[data-mu-flux-choisir]');
        // unite.js a choisi le chemin et redessiné, avant ce geste-ci : le panneau des commandes sans chemin se referme.
        if (c) { this.cheminPanneau = null; this.cheminCmd = null; if (this.graphe) this.graphe.selection = null; return this.rendreFlux(); }
        const pan = e.target.closest('[data-ch-panneau]');
        if (pan) { this.cheminPanneau = pan.dataset.chPanneau; return this.rendreFlux(); }
        const f = e.target.closest('[data-ch-fiche]');
        if (f) return void this.ouvrirEquipe(f.dataset.chFiche);
        const t = e.target.closest('[data-ch-temps]');
        if (t) { this.ouvrir(t.dataset.chTemps); return this.allerA('temps'); }
        // « Relier à… » : le geste du « + » de l'étape, sans la souris — l'étape choisie ensuite reçoit le lien.
        const rl = e.target.closest('[data-ch-relier]');
        if (rl && this.graphe) return void this.graphe.relierDepuis(rl.dataset.chRelier);
        const a = e.target.closest('[data-mu-flux-action]');
        if (a && p && !p.type) return this.actionApart(a.dataset.muFluxAction, p);
      });
      d.addEventListener('change', e => {
        const el = e.target; if (!dans(el)) return;
        const st = this.at.state, p = this.cheminChoisi();
        if (el.dataset.chEquipe !== undefined) { const v = el.value, s = el.dataset.service, cmd = el.dataset.chEquipe; return void setTimeout(() => this.choisirEquipe(s, cmd, v), 0); }
        if (el.dataset.chVariante !== undefined && el.value && p) {
          const cmd = el.value; let v;
          this.at.changer(() => { v = PC.nouveauType(st, p.nom + ' · ' + PC.etiquette(cmd), p); PC.assignerType(st, cmd, v.id); },
            PC.etiquette(cmd) + ' a sa variante de « ' + p.nom + ' » : modifiez-la, elle ne touche qu’elle.');
          if (v) { this.fluxChoisi = v.id; this.fluxSel = null; this.rendreFlux(); }
          return;
        }
        if (el.dataset.chExclure !== undefined && el.value) return void this.at.supprimerClasse(el.value);
        if (!p || p.type) return;
        // Un chemin à part : son nom, une étape de plus.
        if (el.dataset.muFluxNom) {
          const v = el.value.trim(), garde = el.defaultValue;
          const refus = !v ? 'Un chemin a besoin d’un nom : il garde « ' + garde + ' ».'
            : st.parcours.some(y => y.id !== p.id && String(y.nom).trim().toUpperCase() === v.toUpperCase()) ? '« ' + v + ' » est déjà le nom d’un autre chemin.' : '';
          if (refus) { el.value = garde; this.rendreFlux(); return void this.refuserAuChamp(el, refus); }
          return void this.changerFlux(y => { y.nom = v.slice(0, 76); }, 'Chemin renommé.');
        }
        if (el.dataset.muFluxAjout !== undefined && el.value) {
          const s = el.value, o = this.options();
          return void this.changerFlux(y => { PC.insererService(st, y, s, o); }, this.nom(s) + ' entre dans « ' + p.nom + ' », à sa place ; ajustez les flèches si besoin.');
        }
      });
      d.addEventListener('toggle', e => {
        const t = e.target; if (!t.dataset || !dans(t)) return;
        if (t.dataset.chAjout !== undefined) this.cheminAjout = t.open;
        if (t.dataset.chSection) this.cheminSections.set(t.dataset.chSection, t.open);
      }, true);
    }
  }

  root.OrlyCheminsPage = { ...api, PageChemins };
})(typeof window !== 'undefined' ? window : globalThis);
