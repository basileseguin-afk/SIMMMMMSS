/* ==========================================================================
 *  MON UNITÉ — tout le paramétrage, service par service (retour d'usage du 29/09)
 *
 *  « Que quelqu'un qui connaît uniquement l'unité puisse paramétrer
 *  entièrement la simulation. » Il connaît ses services, ses équipes, leurs
 *  horaires et ce que chacune prépare ; il ne connaît ni « chemins », ni
 *  « cases », ni « liens entre services ». Deux pages, donc :
 *
 *    Pas à pas — ce qui reste à faire avant de simuler, dans l'ordre, et
 *                chaque point mène à l'endroit où il se règle ;
 *    Services  — la liste des services, et la fiche de celui qu'on choisit :
 *                ce qu'il fait, ses équipes (heure, personnes, et une grille
 *                compagnies × classes à cocher), ses minutes de travail.
 *
 *  Les chemins des commandes se déduisent des coches (parcours.js, « la
 *  grille à cocher ») ; les outils fins restent, pour les cas rares, après la
 *  mention « Plus » de chaque partie.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const P = root.MoteurProduction, PC = root.OrlyParcours;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const jourEcrit = j => (j > 0 ? 'J+' + j : j < 0 ? 'J' + j : 'J');
  const CLE = 'ory-service-ouvert';

  /** Ce que fait un service, en mots de l'unité. */
  const NATURES = [
    { id: 'manuel', nom: 'Des équipes préparent les commandes', court: 'préparation' },
    { id: 'robot', nom: 'Un robot (une ligne) prépare les commandes', court: 'robot' },
    { id: 'dispo', nom: 'Il sert tout le monde : légumerie, magasin, réception…', court: 'sert tout le monde' },
    { id: 'lavage', nom: 'Plonge : il lave ce qui revient des vols', court: 'plonge' },
    { id: 'handling', nom: 'Il charge les vols (handling)', court: 'chargement des vols' },
    // L'armement : ni BC, ni PC, ni Éco — ses catégories à lui (retour d'usage du 01/10).
    // « Une seule case par compagnie, oui ou non » (01/10), « toujours lié au handling » (02/10).
    { id: 'categories', nom: 'Il travaille par compagnie : l’armement (relié au handling dans chaque chemin)', court: 'par compagnie' }
  ];
  const preparent = n => n === 'manuel' || n === 'robot' || n === 'categories';

  class MonUnite {
    /* a = {
     *   at()          — le centre des ateliers (état, calcul, fiches de case)
     *   rg()          — le centre des réglages (minutes de travail)
     *   services()    — [{id, nom}]
     *   parent(id)    — le service dont une salle annexe dépend, ou null
     *   racines()     — [{id, nom}] les services du plan, pour placer un nouveau service
     *   liaisons()    — [{from, to}] les liens de l'unité
     *   brut(id)      — le nom tel qu'il est enregistré (pour le champ « Nom »)
     *   renommer(id, nom), creer(nom, parent) → id, supprimer(id) → bool
     *   voir(id), plan(id) — le montrer sur le plan, le modifier sur le plan
     *   vols()        — { departs, importes }
     *   page(id)      — ouvrir une page du site
     *   notify(msg)
     * } */
    constructor(a) {
      this.a = a;
      this.natures = {};   // la nature choisie d'un service qui n'a pas encore d'équipe
      this.lierFlux();
      this.lierCarte();
      try { this.choisi = localStorage.getItem(CLE) || null; } catch (e) { this.choisi = null; }
      this.lier();
    }

    get at() { return this.a.at(); }
    get etat() { return this.at.state; }
    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }
    options() { return { classes: this.at.classes, liaisons: this.a.liaisons ? this.a.liaisons() : [], parent: this.a.parent, nomDe: s => this.nom(s) }; }

    /* ---- ce qu'on sait d'un service ------------------------------------ */

    /** L'état d'un service : ses équipes, ce qu'il lui manque, en une phrase. */
    bilan(id, classes, resultat) {
      const st = this.etat, cases = st.ateliers.filter(a => a.service === id);
      const nature = this.natures[id] && !cases.length ? this.natures[id] : PC.natureService(st, id, this.nom(id));
      // Par catégories : ses commandes à lui (« AF · Trolleys bar »), pas les classes des vols.
      if (nature === 'categories') classes = this.at.classesDe(id) || [];
      const g = PC.grille(st, id, '-', classes);
      const passent = classes.filter(c => g.get(c.id).etat !== 'hors').length;
      const attendues = preparent(nature) ? classes.filter(c => g.get(c.id).etat === 'attendue').map(c => c.id) : [];
      const vides = preparent(nature) ? cases.filter(a => (a.type === 'manuel' || a.type === 'robot') && !a.lots.some(l => l.length)) : [];
      const rg = this.a.rg ? this.a.rg() : null;
      const temps = rg && nature === 'manuel' && cases.some(a => a.lots.some(l => l.length)) ? rg.blocService({ id, nom: this.nom(id) }) : null;
      const sansTemps = !!temps && (temps.etat === 'vide' || temps.manquent.length > 0);
      const alertes = ((resultat && resultat.anomalies) || []).filter(x => !CODES_JOURNEE.has(x.code)
        && (x.service === id || cases.some(a => a.id === x.atelier)) && x.code !== 'parcours-trou' && x.code !== 'bareme' && x.code !== 'bareme-classe' && x.code !== 'lots');
      const points = [];
      if (passent && !cases.length) points.push(pl(passent, 'commande passe', 'commandes passent') + ' par ici, sans équipe');
      if (attendues.length && cases.length) points.push(pl(attendues.length, nature === 'categories' ? 'compagnie' : 'commande') + ' à cocher dans une équipe');
      if (vides.length) points.push(vides.length > 1 ? vides.length + ' équipes ne préparent rien' : '« ' + vides[0].nom + ' » ne prépare rien');
      if (sansTemps) points.push('minutes de travail à remplir');
      if (nature === 'categories' && !classes.length) points.push('aucune case : aucun chemin ne passe par ce service');
      else if (nature === 'categories' && classes.some(c => c.minutes == null)) points.push('minutes par vol à remplir');
      for (const x of alertes.slice(0, 3)) points.push(x.message);
      const utilise = cases.length > 0 || passent > 0 || nature === 'categories';
      return { id, nature, cases, passent, attendues, vides, sansTemps, alertes, points,
        etat: !utilise ? 'libre' : points.length ? 'afaire' : 'ok' };
    }

    /* ---- rendu ---------------------------------------------------------- */

    /** La page affichée de cette vue, s'il y en a une. */
    page() { const b = root.document.body; return b.dataset.vue === 'ateliers' ? b.dataset.sous : null; }

    rendre() {
      const p = this.page();
      if (p === 'mu-services') this.rendreServices();
      if (p === 'mu-pas') this.rendrePas();
      if (p === 'mu-flux') this.rendreFlux();
      if (p === 'mu-carte') this.rendreCarte();
    }

    /* Remplacer le HTML sans perdre le champ où l'on est, ni le défilement. */
    poser(box, html) {
      if (box._html === html) return;
      const actif = root.document.activeElement, dedans = actif && box.contains(actif) && actif !== box ? actif : null;
      let sel = null;
      if (dedans) {
        const attrs = Object.keys(dedans.dataset).map(k => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(dedans.dataset[k])}"]`).join('');
        const at = dedans.closest('[data-at]');
        sel = attrs ? (at && at !== dedans ? `[data-at="${CSS.escape(at.dataset.at)}"] ` : '') + dedans.tagName.toLowerCase() + attrs : null;
      }
      // La page défile dans un conteneur, pas dans la fenêtre : on retient la
      // position de chaque ancêtre qui a défilé.
      const defiles = [];
      for (let e = box.parentElement; e; e = e.parentElement) if (e.scrollTop || e.scrollLeft) defiles.push([e, e.scrollTop, e.scrollLeft]);
      const liste = box.querySelector('.mu-liste'), hautListe = liste ? liste.scrollTop : 0;
      box.innerHTML = html; box._html = html;
      for (const [e, t, l] of defiles) { e.scrollTop = t; e.scrollLeft = l; }
      const liste2 = box.querySelector('.mu-liste'); if (liste2) liste2.scrollTop = hautListe;
      if (sel) { const el = box.querySelector(sel); if (el) el.focus({ preventScroll: true }); }
    }

    ordre(services) {
      const cols = PC.colonnes(this.etat.parcours || []).map(c => c.service);
      const rang = id => { const i = cols.indexOf(id); return i < 0 ? 999 : i; };
      return services.slice().sort((x, y) => rang(x.id) - rang(y.id) || x.nom.localeCompare(y.nom));
    }

    rendreServices() {
      const box = root.document.getElementById('mu-services'); if (!box) return;
      const classes = this.at.classes, r = this.at.resultat || {};
      const services = this.ordre(this.a.services());
      // Un service dont le bilan échoue reste dans la liste, avec son erreur : le reste s'affiche.
      const bilanSur = id => {
        try { return this.bilan(id, classes, r); }
        catch (e) { if (root.console) root.console.error(e); return { id, nature: 'manuel', cases: this.etat.ateliers.filter(a => a.service === id), passent: 0, attendues: [], vides: [], sansTemps: false, alertes: [], points: ['erreur d’affichage : ' + e.message], etat: 'afaire' }; }
      };
      const bilans = new Map(services.map(s => [s.id, bilanSur(s.id)]));
      if (!services.some(s => s.id === this.choisi)) {
        const premier = services.find(s => bilans.get(s.id).etat === 'afaire') || services.find(s => bilans.get(s.id).etat === 'ok') || services[0];
        this.choisi = premier ? premier.id : null;
      }
      const I = root.OrlyIcones;
      const ico = s => (I ? I.ico(I.icoService(s.id, s.nom)) : '');
      // Deux services faits d'un bloc par une même équipe : chacun le dit, dans la liste.
      const ch = PC.chaines(this.etat, null, null);
      const lies = id => ch.filter(g => g.service === id).map(g => '+ ' + this.nom(g.avant)).concat(ch.filter(g => g.avant === id).map(g => 'avec ' + this.nom(g.service)));
      const groupe = (titre, liste) => liste.length ? `<p class="mu-groupe">${esc(titre)}</p>` + liste.map(s => {
        const b = bilans.get(s.id), n = b.cases.length, l = lies(s.id);
        const sous = b.etat === 'libre' ? 'pas utilisé'
          : (NATURES.find(x => x.id === b.nature) || {}).court + (n ? ' · ' + pl(n, 'équipe') : '') + (b.passent && preparent(b.nature) ? ' · ' + pl(b.passent, 'commande') : '');
        return `<button type="button" class="mu-svc ${b.etat}${l.length ? ' en-chaine' : ''}${s.id === this.choisi ? ' actif' : ''}" data-mu-choisir="${esc(s.id)}" aria-current="${s.id === this.choisi}">
          <span class="mu-svc-ico" aria-hidden="true">${ico(s)}</span><span class="mu-svc-txt"><b>${esc(s.nom)}</b><small>${esc(sous)}</small>${l.length
            ? `<i class="mu-svc-chaine" title="Fait d’un bloc, à la chaîne, par une même équipe">⛓ ${esc(l.join(' · '))} à la chaîne</i>` : ''}</span>
          <span class="mu-point ${b.etat}" title="${b.etat === 'afaire' ? esc(b.points.join(' · ')) : b.etat === 'ok' ? 'Complet' : 'Pas utilisé'}" aria-hidden="true"></span></button>`;
      }).join('') : '';
      const utilises = services.filter(s => bilans.get(s.id).etat !== 'libre'), libres = services.filter(s => bilans.get(s.id).etat === 'libre');
      const liste = `<nav class="mu-liste" aria-label="Les services">
        ${groupe('Utilisés', utilises)}${groupe('Pas utilisés', libres)}
        <form class="mu-nouveau" data-mu-nouveau><b>Nouveau service</b>
          <label>Nom <input name="nom" maxlength="120" placeholder="ex. Atelier APM" required></label>
          <label>Sur le plan, près de <select name="parent">${this.a.racines().map(x => `<option value="${esc(x.id)}">${esc(x.nom)}</option>`).join('')}</select></label>
          <label title="À part entière : ses propres minutes et ses propres liens, comme Prépa ou Dotation. Une salle de plus : elle reprend les minutes et les liens du service choisi au-dessus.">C’est <select name="genre"><option value="autonome">un service à part entière</option>
            <option value="salle">une salle de plus de ce service</option></select></label>
          <button class="btn btn-sm btn-play" type="submit">+ Créer</button></form>
      </nav>`;
      const s = services.find(x => x.id === this.choisi);
      // Une fiche qui ne s'affiche pas doit le dire, pas laisser une page vide sans raison.
      let corps;
      try { corps = s ? this.fiche(s, bilans.get(s.id), classes, r) : '<p class="mini-note">Aucun service.</p>'; }
      catch (e) {
        corps = `<p class="mu-q" role="alert">La fiche de « ${esc(s.nom)} » n’a pas pu s’afficher : ${esc(e.message)}. Envoyez ce message pour qu’on corrige.</p>`;
        if (root.console) root.console.error(e);
      }
      this.poser(box, `<div class="mu-cadre">${liste}<div class="mu-fiche" data-mu-fiche="${esc(this.choisi || '')}">${corps}</div></div>`);
    }

    /** La fiche d'un service : ce qu'il fait, ses équipes, ses minutes de travail. */
    fiche(s, b, classes, r) {
      const I = root.OrlyIcones, st = this.etat;
      if (b.nature === 'categories') classes = this.at.classesDe(s.id) || [];
      const calc = new Map(((r && r.ateliers) || []).map(a => [a.id, a]));
      const nature = b.nature;
      const tete = `<div class="mu-tete">
        <span class="mu-tete-ico" aria-hidden="true">${I ? I.ico(I.icoService(s.id, s.nom)) : ''}</span>
        <label class="mu-nom">Nom du service<input data-mu-nom="${esc(s.id)}" maxlength="120" value="${esc(this.a.brut ? this.a.brut(s.id) : s.nom)}"></label>
        <span class="mu-tete-fin"></span>
        <button class="btn btn-sm" type="button" data-mu-action="voir">Voir sur le plan</button>
        <button class="btn btn-sm" type="button" data-mu-action="plan">Le déplacer sur le plan</button>
        <button class="btn btn-sm svc-danger" type="button" data-mu-action="supprimer">Supprimer</button>
      </div>`;
      const passent = PC.types(st).filter(t => P.servicesDuParcours(t).includes(s.id));
      // Les commandes d'un flux qui ne passe pas ici ne se cochent pas : on fait d'abord passer le flux.
      const autres = b.nature === 'manuel' || b.nature === 'robot' ? PC.types(st).filter(t => !P.servicesDuParcours(t).includes(s.id)) : [];
      const ajoutFlux = autres.length ? `<select class="mu-flux-ajout-ici" data-mu-flux-ici="${esc(s.id)}" aria-label="Faire passer un flux par ce service">
        <option value="">+ Faire passer un flux par ici…</option>${autres.map(t => `<option value="${esc(t.id)}">${esc(t.nom)}</option>`).join('')}</select>` : '';
      const lesFlux = `<p class="mu-flux-passent"><span>${passent.length ? 'Flux qui passent ici :' : 'Aucun flux ne passe ici.'}</span>
        ${passent.map(t => `<button type="button" class="mu-flux-lien" data-mu-voir-flux="${esc(t.id)}">${esc(t.nom)}</button>`).join('')}
        ${ajoutFlux}
        <button type="button" class="lien-discret" data-page="mu-flux">${passent.length ? 'Tous les flux' : 'Les flux de production'} →</button></p>`;
      // Des commandes encore cochées ici alors que leur flux ne passe plus par ce service
      // (le service a été retiré du flux avant que ses équipes ne les lâchent toutes seules).
      // Pendant la question qui suit un clic (« Ajouter … au flux ? »), elle seule parle.
      const perdues = preparent(b.nature) && !(this.question && this.question.service === s.id) ? PC.liberer(st, s.id, b.nature === 'categories' ? this.at.classes : classes, { essai: true }) : [];
      const horsFlux = perdues.length ? `<div class="mu-q mu-hors-flux" role="alert"><p>⚠ ${perdues.length > 1 ? pl(perdues.length, 'commande') + ' sont encore cochées' : '1 commande est encore cochée'} ici
        (${esc(perdues.slice(0, 6).map(c => PC.etiquette(c)).join(', ') + (perdues.length > 6 ? '…' : ''))}), mais ${perdues.length > 1 ? 'leur flux ne passe' : 'son flux ne passe'} plus par ${esc(s.nom)}.</p>
        <div class="mu-q-gestes"><button class="btn btn-sm btn-play" type="button" data-mu-action="liberer">Les retirer de ses équipes</button></div></div>` : '';
      const aFaire = b.points.length ? `<ul class="mu-afaire">${b.points.map(p => `<li>${esc(P.enClair ? P.enClair(p) : p)}</li>`).join('')}</ul>` : '';
      const etape = (num, titre, corps, note) => `<section class="mu-etape"><h3><span class="mu-num">${num}</span>${esc(titre)}${note ? `<small>${note}</small>` : ''}</h3>${corps}</section>`;

      // À la chaîne : ce service et un autre ne font qu'un, pour certaines commandes.
      const ch = PC.chaines(st, null, null);
      const cmds = g => g.commandes.slice(0, 6).map(c => PC.etiquette(c)).join(', ') + (g.commandes.length > 6 ? '…' : '');
      const eqs = g => g.equipes.map(a => '« ' + esc(a.nom) + ' »').join(', ');
      const chaine = ch.filter(g => g.service === s.id).map(g => `<p><span class="mu-chaine-ico" aria-hidden="true">⛓</span>
          <span><b>${esc(this.nom(g.avant))} + ${esc(s.nom)}, à la chaîne.</b> ${eqs(g)} ${g.equipes.length > 1 ? 'font' : 'fait'} aussi ${esc(this.nom(g.avant))}
          pour ${pl(g.commandes.length, 'commande')} (${esc(cmds(g))}) : pour elles, ${esc(this.nom(g.avant))} n’a pas d’équipe à part.</span>
          <button class="btn btn-sm" type="button" data-mu-ouvrir="${esc(g.avant)}">Ouvrir ${esc(this.nom(g.avant))} →</button></p>`)
        .concat(ch.filter(g => g.avant === s.id).map(g => `<p><span class="mu-chaine-ico" aria-hidden="true">⛓</span>
          <span><b>${esc(s.nom)} + ${esc(this.nom(g.service))}, à la chaîne.</b> Pour ${pl(g.commandes.length, 'commande')} (${esc(cmds(g))}), ${esc(s.nom)}
          est fait par ${eqs(g)}, au ${esc(this.nom(g.service))}, d’un bloc : pas besoin d’équipe ici pour elles. Sa fiche est plus bas : elle se règle ici comme au ${esc(this.nom(g.service))}.</span>
          <button class="btn btn-sm" type="button" data-mu-ouvrir="${esc(g.service)}">Ouvrir ${esc(this.nom(g.service))} →</button></p>`)).join('');
      const blocChaine = chaine ? `<div class="mu-chaine-bloc">${chaine}</div>` : '';

      const choixNature = `<label class="mu-nature">Ce service…<select data-mu-nature="${esc(s.id)}">${NATURES.map(x =>
        `<option value="${x.id}"${x.id === nature ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>`;

      // Une équipe d'un autre service qui fait aussi celui-ci, à la chaîne : elle
      // existe dans les deux, et se règle dans les deux (retour d'usage du 01/10).
      const chainees = (st.ateliers || []).filter(a => a.type === 'manuel' && a.fusion === s.id && a.service !== s.id);
      let equipes;
      if (preparent(nature)) {
        equipes = b.cases.map(a => (a.type === 'manuel' || a.type === 'robot') ? this.equipe(a, calc.get(a.id), classes)
          : `<div class="mu-carte">${this.at.carte(a, calc.get(a.id), { cmd: null })}</div>`).join('')
          + (b.cases.length ? '' : '<p class="mini-note mu-vide">Aucune équipe pour l’instant.</p>')
          + (chainees.length ? `<h4 class="mu-chainees">⛓ À la chaîne : ${chainees.length > 1 ? 'ces équipes font' : 'cette équipe fait'} aussi ${esc(s.nom)}</h4>`
            + chainees.map(a => this.equipe(a, calc.get(a.id), classes, { depuis: s.id })).join('') : '')
          + `<p class="mu-ajout"><button class="btn btn-play btn-sm" type="button" data-mu-action="equipe">+ Ajouter une équipe</button>
             <span class="mini-note">une équipe du matin, de l’après-midi, de nuit… chacune avec son heure, ses personnes et ce qu’elle prépare</span></p>`;
      } else {
        const phrase = nature === 'dispo' ? 'Il sert toutes les commandes à la fois : ni effectif, ni minutes. Dites quand il est ouvert, et qui en a besoin.'
          : nature === 'lavage' ? 'Elle lave les retours de tous les vols, à mesure qu’ils arrivent : rien à cocher. Réglez ses tunnels et ses horaires.'
          : 'Il charge chaque vol à son départ, pour toutes les commandes : rien à cocher. Réglez ses horaires et le temps par vol.';
        equipes = `<p class="mini-note">${esc(phrase)}</p>`
          + (nature === 'lavage' ? this.friseRetours(b.cases) : '')
          + b.cases.map(a => `<div class="mu-carte">${this.at.carte(a, calc.get(a.id), { cmd: null })}</div>`).join('')
          + (b.cases.length ? '' : `<p class="mu-ajout"><button class="btn btn-play btn-sm" type="button" data-mu-action="equipe">+ ${nature === 'lavage' ? 'Ajouter une équipe de plonge' : nature === 'dispo' ? 'Mettre ce service en place' : 'Ajouter une équipe de chargement'}</button></p>`)
          + (nature === 'dispo' ? `<div class="mu-besoin"><h4>Quels flux en ont besoin ?</h4>${this.besoinFlux(s.id, classes)}</div>` : '');
      }

      const rg = this.a.rg ? this.a.rg() : null;
      const temps = nature === 'manuel' && rg
        ? etape(3, 'Minutes de travail pour un vol', rg.ficheTemps(s.id), 'pour une compagnie dans une classe : la durée se déduit des personnes de l’équipe')
        : nature === 'robot' ? etape(3, 'Débit du robot', '<p class="mini-note">Le débit (plateaux par heure) se règle dans la fiche de chaque équipe robot, plus haut : « Plus de réglages ».</p>') : '';

      if (nature === 'categories') return tete + this.lienHandling(s) + aFaire
        + etape(1, 'Ce qu’il fait', choixNature)
        + etape(2, 'Minutes par vol, selon la compagnie', this.blocParCompagnie(s, classes), 'une case vide prend la valeur de « Toutes les compagnies »')
        + etape(3, 'Ses équipes : une case par compagnie', equipes);
      // Un armement qui suit encore les classes (BC, PC, Éco…) : on propose la bonne façon, à la vue.
      // Quelle que soit sa nature actuelle (sert tout le monde, préparation…) : le réglage ne se cache pas.
      const proposer = /armement/i.test(s.nom) ? `<div class="mu-q mu-par-cie"><p>L’armement ne travaille pas par Business, Premium ou Éco :
        <b>une case par compagnie</b>, oui ou non, pour chaque vol que le handling charge, et des minutes par vol.</p>
        <div class="mu-q-gestes"><button class="btn btn-sm btn-play" type="button" data-mu-action="par-compagnie">Passer à « une case par compagnie »</button></div></div>` : '';
      return tete + lesFlux + blocChaine + horsFlux + proposer + aFaire
        + etape(1, 'Ce qu’il fait', choixNature)
        + etape(2, preparent(nature) ? 'Ses équipes, et ce que chacune prépare' : 'Ses horaires et ses réglages', equipes)
        + temps;
    }

    /* L'armement est lié au handling, pas aux chemins des repas : on arme un vol
     * (pas une classe), en parallèle des repas, et les deux se retrouvent au
     * handling, qui charge le vol quand tout est prêt (retour d'usage du 02/10).
     * Placé dans un flux, il n'y sert à rien : on propose de l'en retirer. */
    /** Les services de handling de l'unité (ceux de ses équipes de chargement). */
    handlings(st) { return [...new Set(((st || this.etat).ateliers || []).filter(a => a.type === 'handling').map(a => a.service))]; }

    lienHandling(s) {
      const st = this.etat, handlings = st.ateliers.filter(a => a.type === 'handling');
      const qui = handlings.length ? handlings.map(a => '« ' + esc(a.nom) + ' »').join(', ') : '';
      // Seulement les chemins que suivent les commandes ; un lien vers un handling suffit.
      const aCorriger = handlings.length ? PC.armementACorriger(st, [s.id], this.handlings(st), this.at.classes) : [];
      const integre = handlings.length && !aCorriger.length;
      const pourquoi = { absent: 'absent', 'sans-handling': 'pas relié au handling' };
      const liste = aCorriger.slice(0, 4).map(x => '« ' + esc(x.parcours.nom || x.parcours.id) + ' » ('
        + (x.raison === 'autres' ? 'relié aussi à ' + x.avec.map(id => esc(this.nom(id))).join(', ') : pourquoi[x.raison]) + ')').join(', ')
        + (aCorriger.length > 4 ? '…' : '');
      return `<div class="mu-lien-handling"><p><span aria-hidden="true">🚚</span> <b>Lié au handling.</b> ${handlings.length
        ? qui + (handlings.length > 1 ? ' attendent' : ' attend') + ' l’armement et les repas du vol pour le charger.'
        : 'Pas encore de handling dans l’unité : créez-en un, puis intégrez l’armement aux chemins, relié au handling.'}
        On arme un vol, pas une classe : une case par compagnie dont le chemin passe par ${esc(s.nom)}.</p>
        ${!handlings.length ? '' : integre ? `<p class="mini-note mu-arm-ok">✓ Dans tous les chemins, en branche à part, relié seulement au handling.</p>`
          : `<p class="mini-note mu-arm-reprendre">À reprendre dans ${aCorriger.length > 1 ? 'ces chemins' : 'ce chemin'} : ${liste}.
          <button class="btn btn-sm btn-play" type="button" data-mu-action="integrer-armement">L’intégrer à tous les chemins, relié au handling</button></p>`}</div>`;
    }

    /* Un service qui travaille par compagnie (l'armement) : ses minutes par vol,
     * pour toutes les compagnies, puis celles qui en ont d'autres. Chaque
     * compagnie dont un chemin passe par le service a sa case, avec ou sans vol. */
    blocParCompagnie(s, classes) {
      const k = (((this.etat.categories || {})[s.id]) || [])[0];
      if (!k) return '';
      const avec = [...new Set(classes.map(c => c.cie))].sort((x, y) => x.localeCompare(y));
      const toutes = [...new Set((this.at.classes || []).map(c => c.cie))];
      // Pas de case : aucun chemin de la compagnie ne passe par ce service.
      const hors = toutes.filter(c => !avec.includes(c)).sort((x, y) => x.localeCompare(y));
      // Une case, mais aucun départ au programme (une compagnie ajoutée à la main).
      const sansVol = avec.filter(cie => !classes.some(c => c.cie === cie && c.vols.length));
      const champ = cie => `<td><input type="number" min="0" step="1" value="${k.minutes[cie] ?? ''}" placeholder="${cie === '*' ? '—' : k.minutes['*'] ?? '—'}"
          data-mu-cat-min="${esc(k.id)}" data-cie="${esc(cie)}" aria-label="Minutes par vol${cie === '*' ? ', toutes les compagnies' : ', ' + esc(cie)}"></td>`;
      const aucun = !avec.length ? `<p class="mini-note">Aucune compagnie n’a de case : aucun chemin ne passe par ${esc(s.nom)}.</p>` : '';
      return aucun + `<div class="mu-grille-scroll"><table class="mu-cat-table" data-mu-cat-service="${esc(s.id)}">
        <thead><tr><th scope="col">Compagnie</th><th scope="col">Minutes par vol</th></tr></thead>
        <tbody><tr class="mu-cat-toutes"><th scope="row">Toutes les compagnies</th>${champ('*')}</tr>
        ${avec.map(cie => `<tr><th scope="row">${esc(cie)}</th>${champ(cie)}</tr>`).join('')}</tbody></table></div>`
        + (sansVol.length ? `<p class="mini-note mu-arm-sansvol">${esc(sansVol.join(', '))} : aucun départ au programme aujourd’hui — la case est là, à 0 vol, jusqu’à ce que le programme en porte.</p>` : '')
        + (hors.length ? `<p class="mini-note mu-arm-hors">Pas de case pour ${esc(hors.join(', '))} : ${hors.length > 1 ? 'leurs chemins ne passent' : 'son chemin ne passe'} pas par ${esc(s.nom)} (Une commande).</p>` : '');
    }

    /** Changer le réglage d'un service par compagnie. */
    changerCategories(service, fn, message) {
      this.at.changer(() => {
        const st = this.at.state;
        st.categories = st.categories || {};
        st.categories[service] = st.categories[service] || [];
        fn(st.categories[service], st);
      }, message);
    }

    /** Une équipe qui prépare : son heure, ses personnes, et sa grille. */
    equipe(a, calc, classes, o = {}) {
      const fin = calc && calc.fin != null ? P.hhmm(calc.fin) : null;
      // Chaque jour par son nom : J-2 n'est pas « la veille » (retour d'usage du 01/10).
      const NOMS_JOURS = { 0: 'jour du vol (J)', '-1': 'la veille (J-1)', '-2': 'l’avant-veille (J-2)', '-3': '3 jours avant (J-3)' };
      const jours = [0, -1, -2, -3].map(j => `<option value="${j}"${j === (a.jour || 0) ? ' selected' : ''}>${NOMS_JOURS[j]}</option>`).join('');
      // Ce qui la lie à une autre : une étape faite à la chaîne, une ligne robot partagée.
      const avec = a.type === 'manuel' && a.fusion && a.fusion !== a.service ? this.nom(a.fusion) : '';
      // Une équipe qui ne travaille que certains jours (règle ⚡).
      const cond = a.condition, etat = cond && this.at.etatCondition ? this.at.etatCondition(a) : null;
      const ligne = a.type === 'robot' && this.at.robotsDeLigne ? this.at.robotsDeLigne(a).filter(x => x !== a) : [];
      // Vue depuis l'étape qu'elle absorbe : on dit d'où elle vient.
      const badges = (o.depuis ? `<span class="mu-badge chaine" title="Équipe du ${esc(this.nom(a.service))} : elle fait ${esc(avec)} + ${esc(this.nom(a.service))} d’un bloc. La modifier ici la modifie aussi au ${esc(this.nom(a.service))}.">⛓ équipe du ${esc(this.nom(a.service))} · ${esc(avec)} + ${esc(this.nom(a.service))} à la chaîne</span>`
          + ` <button type="button" class="lien-discret" data-mu-ouvrir="${esc(a.service)}">la voir au ${esc(this.nom(a.service))} →</button>`
        : avec ? `<span class="mu-badge chaine" title="Cette équipe fait aussi ${esc(avec)}, d’un bloc, pour ses commandes">⛓ + ${esc(avec)} à la chaîne</span>` : '')
        + (ligne.length ? `<span class="mu-badge ligne" title="Une seule ligne robot : ces équipes ne tournent pas en même temps">⇄ ligne partagée avec ${ligne.map(x => '« ' + esc(x.nom) + ' »').join(', ')}</span>` : '')
        + (cond ? `<span class="mu-badge cond${etat && !etat.remplie ? ' off' : ''}" title="Elle ne travaille que certains jours, selon le nombre de vols">⚡ si ${esc(cond.cie === '*' ? 'toutes compagnies' : cond.cie)} ≥ ${cond.seuil} ${cond.mesure === 'repas' ? 'repas' : 'vols'}${etat ? (etat.remplie ? ' · travaille aujourd’hui' : ' · pas aujourd’hui') : ''}</span>` : '');
      const fusion = a.type === 'manuel' && this.at.blocFusion ? this.at.blocFusion(a) : '';
      // Une catégorie d'un service (« AF Trolleys bar ») n'a pas d'autre chemin que lui : pas de lien.
      const ordre = a.lots.filter(l => l.length).map((l, i) => `<span class="mu-ordre-cmd"><b>${i + 1}</b>${l.map(c => String(c).includes('/@') ? `<span>${esc(PC.etiquette(c))}</span>`
        : `<button type="button" data-mu-chemin="${esc(c)}" data-service="${esc(a.service)}" title="Voir le chemin de ${esc(PC.etiquette(c))}">${esc(PC.etiquette(c))}</button>`).join(' + ')}</span>`).join('');
      return `<article class="mu-equipe${avec ? ' en-chaine' : ''}${etat && !etat.remplie ? ' au-repos' : ''}" data-at="${esc(a.id)}">
        ${badges ? `<p class="mu-badges">${badges}</p>` : ''}
        <div class="mu-equipe-tete">
          <label class="mu-eq-nom">Équipe<input value="${esc(a.nom)}" data-at-champ="nom" maxlength="160"></label>
          <label>Arrive à<input type="time" value="${esc(a.debut)}" data-at-champ="debut"></label>
          <label>Le<select data-at-champ="jour">${jours}</select></label>
          <label class="mu-eq-pers">Personnes<input type="number" min="0" max="999" value="${a.personnes}" data-at-champ="personnes"></label>
          ${a.type === 'robot' ? `<label class="mu-eq-pers">Plateaux / h<input type="number" min="1" value="${a.debit}" data-at-champ="debit"></label>` : ''}
          <span class="mu-eq-fin">${fin ? 'finit à ' + esc(fin) : a.lots.length ? '' : ''}</span>
        </div>
        <p class="mu-question">Ce qu’elle prépare <small>cochez ; l’ordre suit les départs, la plus pressée d’abord</small></p>
        ${this.grille(a.service, a, classes, o)}
        ${this.questionHTML(a)}
        ${ordre ? `<p class="mu-ordre"><span>Dans l’ordre :</span>${ordre}<small>cliquez une commande pour voir son chemin</small></p>` : ''}
        ${fusion ? `<div class="mu-chaine-reglage">${fusion}</div>` : ''}
        ${this.at.blocCondition ? `<div class="mu-cond-reglage">${this.at.blocCondition(a)}</div>` : ''}
        <details class="mu-plus"${this.ouvertes && this.ouvertes.has(a.id) ? ' open' : ''} data-mu-plus="${esc(a.id)}"><summary>Plus de réglages : changer l’ordre, pauses, arrêts, minutes propres…</summary>
          ${this.at.carte(a, calc, { cmd: null, compact: true })}</details>
      </article>`;
    }

    /** La grille compagnies × classes d'une équipe (ou, sans équipe, de qui passe par le service). */
    grille(service, a, classes, o = {}) {
      const parCategories = PC.natureService(this.etat, service) === 'categories';
      if (!classes.length) return '<p class="mini-note">' + (parCategories ? 'Aucune case : aucun chemin ne passe par ce service (voir plus haut).'
        : 'Aucune commande : importez d’abord vos vols (Vols).') + '</p>';
      const g = PC.grille(this.etat, service, a ? a.id : null, classes);
      const par = new Map(classes.map(c => [c.id, c]));
      const cies = [...new Set(classes.map(c => c.cie))].sort((x, y) => x.localeCompare(y));
      // Les colonnes : les classes des vols, ou les catégories du service (« Trolleys bar »).
      const cabs = parCategories ? ((this.etat.categories || {})[service] || []).map(k => '@' + k.id).filter(c => classes.some(k => k.cabine === c))
        : P.CABINES.filter(c => classes.some(k => k.cabine === c));
      const coche = x => (a ? x.etat === 'ici' : x.etat === 'passe');
      const titre = (c, x) => {
        const lib = P.libelleClasse(c.id) + ' · ' + pl(c.vols.length, 'vol') + (Number.isFinite(c.echeance) ? ', prête avant ' + P.hhmm(c.echeance) : '');
        if (x.horsFlux) return lib + ' — cochée ici, mais son flux ne passe plus par ce service : décochez-la';
        if (x.montageSeul) return lib + ' — son flux ne passe pas par ' + this.nom(o.depuis) + ' : cette équipe n’en fait que ' + this.nom(a.service) + ' (cochez-la dans ' + this.nom(a.service) + ')';
        if (a && a.fusion && x.etat === 'ici') return lib + ' — ' + (PC.passePar(this.etat, c.id, a.fusion)
          ? 'préparée par cette équipe, à la chaîne : ' + this.nom(a.fusion) + ' + ' + this.nom(a.service)
          : 'préparée par cette équipe : ' + this.nom(a.service) + ' seulement (son flux ne passe pas par ' + this.nom(a.fusion) + ')');
        return lib + ' — ' + ({ ici: 'préparée par cette équipe', ailleurs: 'préparée par « ' + (x.par && x.par.nom) + ' » (cocher la déplace ici)',
          chaine: 'faite à la chaîne par « ' + (x.par && x.par.nom) + ' »', attendue: 'passe par ce service, personne ne la prépare encore',
          passe: 'en a besoin', hors: a ? 'ne passe pas par ce service : son flux ne le traverse pas (ajoutez ce service à son flux pour la préparer ici)' : 'n’en a pas besoin' })[x.etat];
      };
      const cellule = (cie, cab) => {
        const id = P.idClasse(cie, cab), c = par.get(id);
        if (!c) return '<td class="mu-rien" aria-hidden="true">·</td>';
        let x = g.get(id);
        // Une équipe à la chaîne, vue depuis l'étape qu'elle absorbe (la Prépa) : les
        // commandes dont le flux ne passe pas par cette étape n'y sont pas (elle ne fait
        // que le Montage pour elles) — ni cochées, ni cochables d'ici.
        const seulementIci = a && a.fusion && !PC.passePar(this.etat, id, a.fusion);
        if (o.depuis && seulementIci) x = { etat: 'hors', par: null, montageSeul: true };
        // Vue de son service : ⛓ sur les commandes qu'elle fait à la chaîne.
        const enChaine = !o.depuis && a && a.fusion && x.etat === 'ici' && !seulementIci;
        const marque = enChaine ? '<i class="mu-chez mu-chez-chaine">⛓</i>' : x.horsFlux ? '<i class="mu-chez">⚠</i>' : x.etat === 'ailleurs' ? `<i class="mu-chez">${esc(initiales(x.par.nom))}</i>` : x.etat === 'chaine' ? '<i class="mu-chez">⛓</i>' : x.etat === 'attendue' ? '<i class="mu-chez">!</i>' : '';
        // Hors de son flux : pas cochable. Le flux décide par où passe une commande ;
        // on y ajoute le service (« Faire passer un flux par ici »), puis on coche.
        const bloquee = x.etat === 'chaine' || (a && x.etat === 'hors');
        return `<td class="mu-c ${x.etat}${x.horsFlux ? ' hors-flux' : ''}"><label title="${esc(titre(c, x))}"><input type="checkbox" data-mu-cocher="${esc(id)}"${coche(x) ? ' checked' : ''}${bloquee ? ' disabled' : ''}
          aria-label="${esc(titre(c, x))}">${marque}</label></td>`;
      };
      return `<div class="mu-grille-scroll"><table class="mu-grille"${a ? ` data-mu-equipe="${esc(a.id)}"` : ` data-mu-service="${esc(service)}"`}>
        <thead><tr><th scope="col"><span class="sr-only">Compagnie</span></th>${cabs.map(c => `<th scope="col"><button type="button" class="mu-tout" data-mu-col="${c}"
          title="Cocher ou décocher toute la colonne ${esc(P.nomCabine ? P.nomCabine(c) : c)}">${parCategories ? esc(P.nomCabine(c)) : `<span class="puce-classe" data-cab="${c}"></span>${c}`}</button></th>`).join('')}</tr></thead>
        <tbody>${cies.map(cie => `<tr><th scope="row"><button type="button" class="mu-tout" data-mu-ligne="${esc(cie)}" title="Cocher ou décocher toute la ligne ${esc(cie)}">${esc(cie)}</button></th>${cabs.map(cab => cellule(cie, cab)).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    }

    /* ---- pas à pas ------------------------------------------------------ */

    /** Ce qui reste à faire avant de simuler, dans l'ordre. */
    etapes() {
      const classes = this.at.classes, r = this.at.resultat || {};
      const vols = this.a.vols ? this.a.vols() : { departs: 0, importes: false };
      const services = this.ordre(this.a.services());
      const bilans = services.map(s => ({ s, b: this.bilan(s.id, classes, r) }));
      const utilises = bilans.filter(x => x.b.etat !== 'libre');
      const absentes = Object.values(r.parClasse || {}).filter(c => c.absente).map(c => c.id);
      const corriger = (r.anomalies || []).filter(x => !CODES_JOURNEE.has(x.code) && !x.service && !x.atelier);
      const out = [];
      out.push({ num: 1, titre: 'Les vols de la journée', etat: !vols.departs ? 'afaire' : vols.importes ? 'ok' : 'exemple',
        texte: !vols.departs ? 'Aucun vol : importez votre programme.' : pl(vols.departs, 'départ') + ' · ' + pl(classes.length, 'commande') + ' (une par compagnie et par classe)'
          + (vols.importes ? '' : ' — ce sont les vols d’exemple : importez les vôtres.'),
        geste: { page: 'v-programme', texte: vols.importes ? 'Voir les vols' : 'Importer vos vols' } });
      // Les flux de production : chaque commande passe quelque part.
      const st = this.etat, types = PC.types(st);
      const propres = classes.filter(c => PC.cheminDe(st, c.id)).length, sansFlux = classes.filter(c => !PC.fluxDe(st, c)).length;
      const principaux = types.filter(t => !t.auto && PC.commandesDuType(st, t.id, classes).length), variantes = types.filter(t => t.auto);
      out.push({ num: 2, titre: 'Les flux de production', etat: !types.length || sansFlux || propres ? 'afaire' : 'ok',
        texte: !types.length ? 'Aucun flux : dessinez par où passe chaque type de production (Économie, Business…).'
          : propres ? pl(propres, 'commande a', 'commandes ont') + ' encore leur propre chemin : regroupez-les en flux.'
          : sansFlux ? pl(sansFlux, 'commande n’a', 'commandes n’ont') + ' pas de flux : donnez-en un à leur classe.'
          : pl(principaux.length, 'flux', 'flux') + ' : ' + principaux.map(t => t.nom).join(' · ') + (variantes.length ? ' — et ' + pl(variantes.length, 'variante') : ''),
        geste: { page: 'mu-flux', texte: 'Ouvrir les flux' } });
      out.push({ num: 3, titre: 'Vos services et leurs équipes', etat: !utilises.length ? 'afaire' : utilises.some(x => x.b.etat === 'afaire') ? 'afaire' : 'ok',
        texte: !utilises.length ? 'Aucun service n’a d’équipe : ouvrez un service, dites ce qu’il fait, ajoutez ses équipes.'
          : pl(utilises.length, 'service utilisé', 'services utilisés') + ', ' + pl(utilises.reduce((n, x) => n + x.b.cases.length, 0), 'équipe'),
        services: utilises.map(x => ({ id: x.s.id, nom: x.s.nom, etat: x.b.etat, points: x.b.points })),
        geste: { page: 'mu-services', texte: 'Ouvrir les services' } });
      const parCie = absentes.filter(id => String(id).includes('/@')), repas = absentes.filter(id => !String(id).includes('/@'));
      out.push({ num: 4, titre: 'Chaque commande a quelqu’un pour la préparer', etat: absentes.length ? 'afaire' : 'ok',
        // Les commandes des repas, puis les compagnies sans armement (« RAM/@ARM ») : deux choses, deux mots.
        texte: absentes.length ? [repas.length ? pl(repas.length, 'commande n’est préparée', 'commandes ne sont préparées') + ' par aucune équipe' : '',
          parCie.length ? pl(parCie.length, 'compagnie n’a', 'compagnies n’ont') + ' personne ' + [...new Set(parCie.map(id => (P.libelleClasse(id).split(' · ')[1] || 'service par compagnie')))].map(n => 'à l’« ' + n + ' »').join(', ') : '']
            .filter(Boolean).join(', et ') + ' : cochez-les dans l’équipe qui les prépare.'
          : 'Toutes les commandes sont préparées.',
        commandes: absentes.slice(0, 16).map(id => PC.etiquette(id)).concat(absentes.length > 16 ? ['+ ' + (absentes.length - 16)] : []),
        geste: absentes.length ? { page: 'mu-services', texte: 'Cocher dans un service' } : null });
      if (corriger.length) out.push({ num: 5, titre: 'Autres points à corriger', etat: 'afaire',
        texte: corriger.slice(0, 6).map(x => P.enClair ? P.enClair(x.message || x.code) : x.message).join(' · '),
        geste: { page: 'at-chemins', texte: 'Voir le chemin des commandes' } });
      const num = out.length + 1;
      out.push({ num, titre: 'Les réglages de la simulation', etat: 'ok',
        texte: 'Délai de chargement, retours à la plonge, rythme, pauses : des valeurs par défaut sont en place.',
        geste: { page: 'rg-simulation', texte: 'Voir les réglages' } });
      const pret = out.every(x => x.etat !== 'afaire');
      out.push({ num: num + 1, titre: 'Simuler la journée', etat: pret ? 'ok' : 'attente',
        texte: pret ? 'Tout est en place : la journée est calculée.' : 'La journée se calcule déjà ; elle sera juste quand les points ci-dessus seront faits.',
        geste: { page: 'j-chiffres', texte: 'Voir les résultats' } });
      return out;
    }

    rendrePas() {
      const box = root.document.getElementById('mu-pas'); if (!box) return;
      const l = this.etapes();
      const mots = { ok: 'fait', afaire: 'à faire', exemple: 'exemple', attente: 'ensuite' };
      // Deux services faits d'un bloc par une même équipe : dit dès le pas à pas.
      const ch = PC.chaines(this.etat, null, null);
      const lies = id => ch.filter(g => g.service === id).map(g => '+ ' + this.nom(g.avant)).concat(ch.filter(g => g.avant === id).map(g => 'avec ' + this.nom(g.service)));
      this.poser(box, `<ol class="mu-pas-liste">${l.map(e => `<li class="mu-pas-etape ${e.etat}">
        <span class="mu-pas-num" aria-hidden="true">${e.etat === 'ok' ? '✓' : e.num}</span>
        <div class="mu-pas-corps"><h3>${esc(e.titre)} <span class="mu-pas-etat ${e.etat}">${mots[e.etat]}</span></h3>
          <p>${esc(e.texte)}</p>
          ${e.commandes && e.commandes.length ? `<ul class="mu-pas-cmds">${e.commandes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
          ${e.services ? `<ul class="mu-pas-services">${e.services.map(x => `<li class="${x.etat}"><button type="button" class="lien-discret" data-mu-ouvrir="${esc(x.id)}">${esc(x.nom)}</button>
            <span>${x.points.length ? esc(x.points.map(p => P.enClair ? P.enClair(p) : p).join(' · ')) : 'complet'}</span>${lies(x.id).length
              ? `<i class="mu-svc-chaine">⛓ ${esc(lies(x.id).join(' · '))} à la chaîne</i>` : ''}</li>`).join('')}</ul>` : ''}
          ${e.geste ? `<button type="button" class="btn btn-sm${e.etat === 'afaire' ? ' btn-play' : ''}" data-page="${e.geste.page}">${esc(e.geste.texte)} →</button>` : ''}</div></li>`).join('')}</ol>`);
    }

    /** Le nombre de points à faire, pour le badge de l'onglet. */
    aFaire() { return this.etapes().filter(e => e.etat === 'afaire').length; }

    /* ---- gestes ----------------------------------------------------------- */

    ouvrir(id) {
      this.choisi = id;
      try { localStorage.setItem(CLE, id); } catch (e) { /* stockage indisponible */ }
      if (this.page() !== 'mu-services') this.a.page('mu-services'); else this.rendreServices();
      const f = root.document.querySelector('#mu-services .mu-fiche'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
    }

    /** Ouvre un flux dans Flux de production (depuis le chemin d'une commande ou une fiche de service). */
    ouvrirFlux(id) {
      this.fluxChoisi = id; this.fluxSel = null; this.fluxMessage = '';
      if (this.page() !== 'mu-flux') this.a.page('mu-flux'); else this.rendreFlux();
    }

    /** Ouvre le chemin d'une commande (Chemins › Chemin d’une commande), sur un service. */
    chemin(cmd, service) { if (this.a.chemin) this.a.chemin(cmd, service); }

    cocher(atelierId, cmds, oui) {
      const a = this.etat.ateliers.find(x => x.id === atelierId); if (!a) return;
      const noms = cmds.map(c => PC.etiquette(c)).join(', ');
      let r = { n: 0, horsFlux: [], orphelines: [] };
      this.question = null;
      const o = this.options(), propres = this.at.classesDe(a.service);
      if (propres) o.classes = propres;   // par catégories : l'ordre suit leurs vols
      this.at.changer(() => { r = PC.cocher(this.at.state, atelierId, cmds, oui, o); },
        oui ? '« ' + a.nom + ' » prépare ' + noms + '.' : '« ' + a.nom + ' » ne prépare plus ' + noms + '.');
      // Le flux ne change pas tout seul : on demande (tout le flux, ou seulement ces commandes).
      const liste = oui ? r.horsFlux : r.orphelines;
      if (liste.length) { this.question = { atelier: a.id, service: a.service, oui, cmds: liste }; this.rendreServices(); }
      return r.n;
    }

    /** La question sous la grille d'une équipe : que faire du flux de ces commandes ? */
    questionHTML(a) {
      const q = this.question; if (!q || q.atelier !== a.id) return '';
      const st = this.etat, svc = this.nom(q.service);
      const flux = new Map();
      for (const c of q.cmds) {
        const f = PC.fluxDe(st, c); if (!f) continue;
        if (!flux.has(f.id)) flux.set(f.id, { f, cmds: [], propre: !f.type });
        flux.get(f.id).cmds.push(c);
      }
      const partages = [...flux.values()].filter(x => !x.propre);
      const lib = q.cmds.map(c => PC.etiquette(c)).join(', ');
      const qui = (f) => pl(PC.commandesDuType(st, f.id, this.at.classes).length, 'commande');
      const texte = q.oui
        ? (q.cmds.length > 1 ? 'Le flux de ' + lib + ' ne passe pas par ' : 'Le flux de ' + lib + ' ne passe pas par ') + svc + '.'
        : svc + ' reste sur le flux de ' + lib + ', et plus personne ne l’y prépare.';
      const tout = partages.length ? `<button class="btn btn-sm btn-play" type="button" data-mu-q="flux">${q.oui ? 'Ajouter ' + esc(svc) + ' à ' : 'Retirer ' + esc(svc) + ' de '}${
        partages.map(x => '« ' + esc(x.f.nom) + ' » (' + qui(x.f) + ')').join(', ')}</button>` : '';
      const seul = `<button class="btn btn-sm" type="button" data-mu-q="seul">${q.oui ? 'Seulement pour ' : 'Retirer seulement pour '}${esc(lib)}</button>`;
      return `<div class="mu-q" role="alert"><p>${esc(texte)} ${q.oui ? 'Pour tout le flux, ou seulement pour cette commande ?' : 'Que faire ?'}</p>
        <div class="mu-q-gestes">${tout}${seul}<button class="btn btn-sm" type="button" data-mu-q="rien">${q.oui ? 'Annuler : ne pas la préparer ici' : 'Laisser : une autre équipe la prendra'}</button></div></div>`;
    }

    repondre(quoi) {
      const q = this.question; this.question = null;
      if (!q) return this.rendreServices();
      // Cochée hors de son flux, puis « Annuler » : la case se décoche (on revient avant le clic).
      if (quoi === 'rien') { if (q.oui) this.at.histoire(false); return this.rendreServices(); }
      const st = this.at.state, o = this.options(), svc = this.nom(q.service);
      if (quoi === 'flux') {
        const faits = new Set();
        this.at.changer(() => {
          for (const c of q.cmds) {
            const f = PC.fluxDe(st, c); if (!f) continue;
            if (!f.type) PC.adapter(st, [c], q.service, q.oui, o);
            else if (!faits.has(f.id)) { faits.add(f.id); PC.changerFlux(st, f.id, q.service, q.oui, o); }
          }
          // Sorti du flux : ses équipes lâchent aussi les autres commandes de ce flux.
          if (!q.oui) PC.liberer(st, q.service, this.at.classes);
        }, svc + (q.oui ? ' entre dans ' : ' sort de ') + (faits.size > 1 ? 'ces flux.' : 'ce flux, pour toutes ses commandes.'));
      } else {
        this.at.changer(() => { PC.adapter(st, q.cmds, q.service, q.oui, o); },
          q.cmds.map(c => PC.etiquette(c)).join(', ') + (q.oui ? ' passe' : ' ne passe plus') + ' par ' + svc + ' : une variante de son flux.');
      }
    }

    /** Un service qui sert tout le monde : les flux qui passent par lui. */
    besoinFlux(service, classes) {
      const st = this.etat, types = PC.types(st);
      if (!types.length) return '<p class="mini-note">Aucun flux de production pour l’instant : dessinez-les dans Chemins › Flux de production.</p>';
      return `<ul class="mu-besoins">${types.map(t => {
        const dedans = P.servicesDuParcours(t).includes(service), n = PC.commandesDuType(st, t.id, classes).length;
        return `<li><label class="chk"><input type="checkbox" data-mu-besoin="${esc(t.id)}" data-service="${esc(service)}"${dedans ? ' checked' : ''}>
          <b>${esc(t.nom)}</b> <small>${pl(n, 'commande')}</small></label></li>`;
      }).join('')}</ul>`;
    }

    passer(service, typeIds, oui) {
      this.at.changer(() => { PC.passerPar(this.at.state, service, typeIds, oui, this.options()); if (!oui) PC.liberer(this.at.state, service, this.at.classes); },
        this.nom(service) + (oui ? ' sert maintenant ' : ' ne sert plus ') + (typeIds.length > 1 ? 'ces flux.' : 'ce flux.'));
    }

    /* Toute une ligne (une compagnie) ou toute une colonne (une classe). */
    tout(table, cmds) {
      const service = table.dataset.muService || this.etat.ateliers.find(x => x.id === table.dataset.muEquipe).service;
      const g = PC.grille(this.etat, service, table.dataset.muEquipe || null, this.at.classesDe(service) || this.at.classes);
      if (table.dataset.muEquipe) {
        const ici = cmds.filter(c => g.get(c).etat === 'ici');
        // Tout cocher ne prend rien aux autres équipes : on coche ce qui est libre.
        const libres = cmds.filter(c => g.get(c).etat === 'hors' || g.get(c).etat === 'attendue');
        if (libres.length) this.cocher(table.dataset.muEquipe, libres, true);
        else if (ici.length) this.cocher(table.dataset.muEquipe, ici, false);
      }
    }

    nature(service, v) {
      const cases = this.etat.ateliers.filter(a => a.service === service);
      const avant = PC.natureService(this.etat, service, this.nom(service));
      // Par catégories, ou plus par catégories : ses équipes repartent d'une grille vide.
      if (v === 'categories' || avant === 'categories') {
        // Vers « par compagnie », ses équipes gardent leurs compagnies ; dans l'autre sens, leur grille repart de zéro.
        if (avant === 'categories' && cases.some(a => a.lots.some(l => l.length)) && !confirm('Changer ce que fait « ' + this.nom(service) + ' » ? Ce que ses équipes préparent est effacé (leur grille change de colonnes) ; « Annuler » revient en arrière.')) { this.rendreServices(); return; }
        delete this.natures[service];
        return this.at.changer(() => {
          const st = this.at.state;
          st.categories = st.categories || {};
          // Une seule case par compagnie : un réglage, au nom du service (son code : « ARM »).
          if (v === 'categories') st.categories[service] = (st.categories[service] || []).slice(0, 1).length ? st.categories[service].slice(0, 1)
            : [{ id: root.OrlyEchanges ? root.OrlyEchanges.codeService(this.nom(service), st) : 'ARM', nom: this.nom(service), minutes: {} }];
          else delete st.categories[service];
          for (const a of st.ateliers) if (a.service === service) {
            if (v === 'categories') { this.at.typer(a, 'manuel'); a.lots = a.lots || []; } else { if (v !== 'manuel') this.at.typer(a, v); a.lots = []; }
          }
          if (v === 'categories') {
            // Ses cases par classe deviennent des cases par compagnie ; il entre dans tous les chemins, relié au handling.
            PC.versParCompagnie(st, service, st.categories[service][0].id);
            PC.integrerArmement(st, [service], this.handlings(st));
          } else {
            for (const p of st.parcours || []) if (P.servicesDuParcours(p).includes(service)) PC.retirerService(p, service);
            this.natures[service] = v;
          }
        }, v === 'categories' ? this.nom(service) + ' travaille par compagnie, relié au handling dans tous les chemins : donnez ses minutes par vol, puis cochez les compagnies dans ses équipes.'
          : this.nom(service) + ' : ' + NATURES.find(x => x.id === v).nom.toLowerCase() + '.');
      }
      if (!cases.length) { this.natures[service] = v; this.rendreServices(); return; }
      const N = NATURES.find(x => x.id === v);
      if (!confirm('Changer ce que fait « ' + this.nom(service) + ' » : ' + N.nom.toLowerCase() + ' ? Ses ' + pl(cases.length, 'équipe') + ' changent de nature ; « Annuler » revient en arrière.')) { this.rendreServices(); return; }
      this.at.changer(() => { for (const a of this.at.state.ateliers) if (a.service === service) this.at.typer(a, v); }, this.nom(service) + ' : ' + N.nom.toLowerCase() + '.');
    }

    ajouterEquipe(service) {
      const nature = this.natures[service] || PC.natureService(this.etat, service, this.nom(service));
      let a;
      this.at.changer(() => { a = PC.equipeNeuve(this.at.state, service, this.nom(service), nature); this.at.state.ateliers.push(a); },
        preparent(nature) ? 'Équipe ajoutée : donnez son heure et ses personnes, puis cochez ce qu’elle prépare.' : 'C’est en place : réglez ses horaires.');
      const el = a && root.document.querySelector(`[data-at="${CSS.escape(a.id)}"] input`);
      if (el) el.focus();
    }

    /* ---- flux de production (30/09) ---------------------------------------
     * Un flux par type de production : par où il passe (un diagramme), et
     * les commandes qui le suivent (une grille). Les variantes — une commande
     * qui s'écarte du flux de sa classe — sont des flux comme les autres. */

    rendreFlux() {
      const box = root.document.getElementById('mu-flux'); if (!box) return;
      const st = this.etat, classes = this.at.classes, types = PC.types(st);
      if (!types.some(t => t.id === this.fluxChoisi)) {
        const suivi = types.map(t => [t, PC.commandesDuType(st, t.id, classes).length]).sort((a, b) => b[1] - a[1])[0];
        this.fluxChoisi = suivi ? suivi[0].id : null;
      }
      const propres = classes.filter(c => PC.cheminDe(st, c.id));
      const nbPropres = new Set(propres.map(c => PC.signature(PC.cheminDe(st, c.id)))).size;
      const regroupe = propres.length ? `<div class="mu-q mu-regrouper"><p><b>${pl(propres.length, 'commande a', 'commandes ont')} chacune ${propres.length > 1 ? 'leur' : 'son'} propre chemin</b>,
        qui se ${nbPropres > 1 ? 'résument à ' + nbPropres + ' flux différents' : 'résument à un seul flux'}. Regroupez-les : chaque classe aura son flux, et les commandes qui s’en écartent, leur variante.</p>
        <div class="mu-q-gestes"><button class="btn btn-sm btn-play" type="button" data-mu-flux-action="regrouper">Regrouper en ${pl(nbPropres, 'flux', 'flux')}</button></div></div>` : '';
      const defautDe = t => P.CABINES.filter(c => (st.parcoursCabine || {})[c] === t.id);
      const I = root.OrlyIcones;
      const ligne = t => {
        const cmds = PC.commandesDuType(st, t.id, classes), n = cmds.length, cabs = defautDe(t);
        // Deux de ses services faits d'un bloc par une même équipe : dit dès la liste.
        const ch = PC.chaines(st, t, cmds.map(c => c.id)).map(g => this.nom(g.avant) + ' + ' + this.nom(g.service));
        return `<button type="button" class="mu-svc ${n ? 'ok' : 'libre'}${ch.length ? ' en-chaine' : ''}${t.id === this.fluxChoisi ? ' actif' : ''}" data-mu-flux-choisir="${esc(t.id)}" aria-current="${t.id === this.fluxChoisi}">
          <span class="mu-svc-ico" aria-hidden="true">${I ? I.ico('fleche') : ''}</span>
          <span class="mu-svc-txt"><b>${esc(t.nom)}</b><small>${pl(n, 'commande')}${cabs.length ? ' · flux des ' + cabs.map(c => (P.NOM_CABINE || {})[c] || c).join(', ') : t.auto ? ' · variante' : ''}</small>${ch.length
            ? `<i class="mu-svc-chaine" title="Fait d’un bloc, à la chaîne, par une même équipe">⛓ ${esc(ch.join(' · '))} à la chaîne</i>` : ''}</span></button>`;
      };
      const principaux = types.filter(t => !t.auto), variantes = types.filter(t => t.auto);
      const liste = `<nav class="mu-liste" aria-label="Les flux de production">
        ${principaux.length ? '<p class="mu-groupe">Flux</p>' + principaux.map(ligne).join('') : ''}
        ${variantes.length ? '<p class="mu-groupe">Variantes</p>' + variantes.map(ligne).join('') : ''}
        <form class="mu-nouveau" data-mu-flux-nouveau><b>Nouveau flux</b>
          <label>Nom <input name="nom" maxlength="76" placeholder="ex. Économie robot" required></label>
          <label>Partir de <select name="source"><option value="">rien (vide)</option>${types.map(t => `<option value="${esc(t.id)}"${t.id === this.fluxChoisi ? ' selected' : ''}>${esc(t.nom)}</option>`).join('')}</select></label>
          <button class="btn btn-sm btn-play" type="submit">+ Créer</button></form>
      </nav>`;
      const t = types.find(x => x.id === this.fluxChoisi);
      this.poser(box, regroupe + `<div class="mu-cadre">${liste}<div class="mu-fiche" data-mu-flux-fiche="${esc(t ? t.id : '')}">${t ? this.ficheFlux(t, classes) : '<p class="mini-note">Aucun flux de production : créez-en un (à gauche).</p>'}</div></div>`
        + this.cheminsDesCommandes(classes));
      const g = this.grapheFlux(); if (g && t) g.rendre();
    }

    /* ---- vue d'ensemble (05/10) ---------------------------------------------
     * « Dès qu'on a beaucoup de services, cela devient incompréhensible » : tous
     * les chemins d'un coup d'œil, comme un plan de métro. Une colonne par flux
     * (puis les variantes, puis les chemins à part), une ligne par service,
     * rangée par étape ; une pastille où le chemin passe, reliées par sa couleur.
     * Une pastille ouvre le flux sur ce service ; une case vide l'y fait passer. */

    colonnesCarte() {
      const st = this.etat, classes = this.at.classes, types = PC.types(st), cols = [];
      for (const t of types.filter(x => !x.auto)) cols.push({ p: t, genre: 'flux' });
      for (const t of types.filter(x => x.auto)) cols.push({ p: t, genre: 'variante' });
      for (const c of classes) {
        const p = PC.cheminDe(st, c.id);
        if (p && !cols.some(x => x.p === p)) cols.push({ p, genre: 'propre', cmd: c.id });
      }
      const PAL = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#4f46e5', '#ca8a04'];
      let i = 0;
      for (const c of cols) {
        c.couleur = c.genre === 'propre' ? '#64748b' : PAL[i++ % PAL.length];
        c.cmds = c.genre === 'propre' ? [classes.find(x => x.id === c.cmd)].filter(Boolean) : PC.commandesDuType(st, c.p.id, classes);
        c.cabs = c.genre === 'flux' ? P.CABINES.filter(x => (st.parcoursCabine || {})[x] === c.p.id) : [];
        c.services = P.servicesDuParcours(c.p);
        c.arcs = P.arcsDuParcours(c.p);
      }
      return cols;
    }

    /** Les services des chemins, rangés par étape (comme le diagramme en étapes). */
    lignesCarte(cols) {
      const ids = [...new Set(cols.flatMap(c => c.services))];
      const arcs = cols.flatMap(c => c.arcs.map(a => ({ de: a.from, vers: a.to })));
      const G = root.OrlyGraphe, d = G ? G.disposer(ids.map(id => ({ id })), arcs, { sens: 'bas' }) : null;
      const isoles = new Set(d ? d.isoles : []);
      const rang = id => (d ? d.etape[id] : 0), x = id => (d && d[id] ? d[id].x : 0);
      const lignes = ids.map(id => ({ id, rang: rang(id), isole: isoles.has(id) }))
        .sort((a, b) => a.rang - b.rang || x(a.id) - x(b.id) || this.nom(a.id).localeCompare(this.nom(b.id), 'fr'));
      const rangs = [...new Set(lignes.filter(l => !l.isole).map(l => l.rang))];
      for (const l of lignes) l.etape = l.isole ? null : rangs.indexOf(l.rang) + 1;
      return lignes;
    }

    rendreCarte() {
      const box = root.document.getElementById('mu-carte'); if (!box) return;
      const cols = this.colonnesCarte(), I = root.OrlyIcones;
      if (!cols.length) {
        this.poser(box, `<div class="mu-carte-vide"><p><b>Aucun chemin pour l’instant.</b> Créez un flux de production : il dira par où passent les commandes.</p>
          <button type="button" class="btn btn-play" data-page="mu-flux">Ouvrir les flux de production →</button></div>`);
        return;
      }
      const lignes = this.lignesCarte(cols);
      const nb = g => cols.filter(c => c.genre === g).length;
      const cab = c => (P.NOM_CABINE || {})[c] || c;
      const tete = c => {
        const qui = c.genre === 'propre' ? 'chemin à part' : c.cabs.length ? 'flux des ' + c.cabs.map(cab).join(', ') : c.genre === 'variante' ? 'variante' : 'aucune classe';
        const attr = c.genre === 'propre' ? `data-mu-carte-cmd="${esc(c.cmd)}"` : `data-mu-carte-flux="${esc(c.p.id)}"`;
        return `<th scope="col" class="mu-ct-flux ${c.genre}" style="--fc:${c.couleur}">
          <button type="button" ${attr} title="Ouvrir « ${esc(c.p.nom)} »"><span class="mu-ct-puce" aria-hidden="true"></span><b>${esc(c.genre === 'propre' ? PC.etiquette(c.cmd) : c.p.nom)}</b></button>
          <small>${pl(c.cmds.length, 'commande')}</small><small class="mu-ct-qui">${esc(qui)}</small></th>`;
      };
      // Par étape : un en-tête de ligne qui couvre toutes les lignes de l'étape.
      const combien = {};
      for (const l of lignes) { const k = l.isole ? 'iso' : l.etape; combien[k] = (combien[k] || 0) + 1; }
      const vu = new Set();
      const corps = lignes.map(l => {
        const k = l.isole ? 'iso' : l.etape, premiere = !vu.has(k); vu.add(k);
        const etape = premiere ? `<th scope="rowgroup" rowspan="${combien[k]}" class="mu-ct-etape${l.isole ? ' sans-lien' : ''}">${l.isole ? 'Sans lien' : 'Étape ' + l.etape}</th>` : '';
        const cases = cols.map(c => {
          const i = c.services.indexOf(l.id), passe = i >= 0;
          const rangs = c.services.map(s => lignes.findIndex(x => x.id === s)).filter(r => r >= 0);
          const ici = lignes.indexOf(l), haut = Math.min(...rangs), bas = Math.max(...rangs);
          const trait = ici >= haut && ici <= bas ? ' trait' + (ici === haut ? ' debut' : '') + (ici === bas ? ' fin' : '') : '';
          const nomC = c.genre === 'propre' ? PC.etiquette(c.cmd) : c.p.nom, cle = esc(c.p.id + '|' + l.id);
          if (passe) {
            const avant = c.arcs.filter(a => a.to === l.id).map(a => this.nom(a.from)), apres = c.arcs.filter(a => a.from === l.id).map(a => this.nom(a.to));
            const titre = '« ' + nomC + ' » passe par ' + this.nom(l.id) + (avant.length ? ' — après ' + avant.join(', ') : '') + (apres.length ? ' — avant ' + apres.join(', ') : '') + '. Cliquer pour l’ouvrir sur ce service.';
            return `<td class="oui${trait}" style="--fc:${c.couleur}"><button type="button" class="mu-ct-arret" data-mu-carte-arret="${cle}" title="${esc(titre)}" aria-label="${esc(titre)}"></button></td>`;
          }
          return `<td class="${trait.trim()}" style="--fc:${c.couleur}"><button type="button" class="mu-ct-ajout" data-mu-carte-ajout="${cle}"
            title="Faire passer « ${esc(nomC)} » par ${esc(this.nom(l.id))}" aria-label="Faire passer « ${esc(nomC)} » par ${esc(this.nom(l.id))}">+</button></td>`;
        }).join('');
        const n = cols.filter(c => c.services.includes(l.id)).length;
        return `<tr class="${premiere ? 'mu-ct-nouvelle' : ''}" data-mu-carte-svc="${esc(l.id)}">${etape}
          <th scope="row" class="mu-ct-svc"><button type="button" data-mu-ouvrir="${esc(l.id)}" title="Ouvrir la fiche de ${esc(this.nom(l.id))} (ses équipes)">
            <span class="mu-ct-ico" aria-hidden="true">${I ? I.ico(I.icoService(l.id, this.nom(l.id))) : ''}</span><span>${esc(this.nom(l.id))}</span></button>
            <small>${pl(n, 'chemin')}</small></th>${cases}</tr>`;
      }).join('');
      this.poser(box, `<div class="mu-carte-tete">
          <p class="mu-carte-resume"><b>${pl(nb('flux'), 'flux', 'flux')}</b>${nb('variante') ? ' · ' + pl(nb('variante'), 'variante') : ''}${nb('propre') ? ' · ' + pl(nb('propre'), 'chemin à part', 'chemins à part') : ''}
            · ${pl(lignes.length, 'service')}, rangés par étape, de haut en bas</p>
          <p class="mini-note">Une colonne par chemin, une ligne par service. <span class="mu-ct-legende"><i class="mu-ct-l-arret"></i> il passe par ce service</span>
            · une pastille ouvre le chemin sur ce service · une case vide (+) l’y fait passer · le nom d’un service ouvre sa fiche.</p></div>
        <div class="mu-carte-cadre"><table class="mu-carte-table">
          <thead><tr><th scope="col" class="mu-ct-etape"></th><th scope="col" class="mu-ct-svc">Service</th>${cols.map(tete).join('')}</tr></thead>
          <tbody>${corps}</tbody></table></div>`);
    }

    /** Une pastille de la carte : le flux s'ouvre, ce service choisi (et sa chaîne éclairée). */
    carteArret(cle) {
      const [pid, svc] = cle.split('|'), st = this.etat;
      const p = (st.parcours || []).find(x => x.id === pid); if (!p) return;
      if (!p.type) { const cmd = PC.commandeDu(st, p.id); return cmd ? this.chemin(cmd, svc) : null; }
      this.ouvrirFlux(pid);
      const g = this.grapheFlux();
      if (g) { g.selection = { type: 'noeud', id: svc }; this.fluxSel = g.selection; this.rendreFlux(); g.montrer(svc); }
    }

    /** Une case vide de la carte : faire passer ce chemin par ce service, à sa place. */
    carteAjout(cle) {
      const [pid, svc] = cle.split('|'), st = this.at.state, o = this.options();
      const p = (st.parcours || []).find(x => x.id === pid); if (!p) return;
      this.at.changer(() => { const x = st.parcours.find(q => q.id === pid); if (x) { x.liens = x.liens || []; x.noeuds = x.noeuds || []; PC.insererService(st, x, svc, o); } },
        this.nom(svc) + ' entre dans « ' + p.nom + ' », à sa place (d’après les autres chemins) ; ouvrez-le pour ajuster les flèches.');
    }

    lierCarte() {
      root.document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#mu-carte [data-mu-carte-flux], #mu-carte [data-mu-carte-cmd], #mu-carte [data-mu-carte-arret], #mu-carte [data-mu-carte-ajout]');
        if (!b) return;
        if (b.dataset.muCarteFlux) return this.ouvrirFlux(b.dataset.muCarteFlux);
        if (b.dataset.muCarteCmd) return this.chemin(b.dataset.muCarteCmd);
        if (b.dataset.muCarteArret) return this.carteArret(b.dataset.muCarteArret);
        if (b.dataset.muCarteAjout) return this.carteAjout(b.dataset.muCarteAjout);
      });
    }

    /* La plonge et l'arrivée des retours (retour d'usage du 05/10 : « c'est
     * con de mettre le jour de départ, il faut le jour d'arrivée »). Le jour
     * d'une équipe de plonge se compte depuis l'arrivée des retours (J) ; la
     * frise les met face à face : les retours qui arrivent, heure par heure,
     * et chaque équipe de plonge sur sa plage. On voit d'un coup d'œil ce
     * qui arrive quand personne n'est là pour le laver. */
    friseRetours(cases) {
      const vols = this.at.a && this.at.a.vols ? this.at.a.vols() : [];
      const mat = this.etat.materiel || {};
      const source = P.sourceRetours(mat), delai = Number.isFinite(+mat.delaiRetour) ? +mat.delaiRetour : 30;
      const dou = { programme: 'les vols retour du programme (atterrissage + ' + delai + ' min)',
        j1: 'les départs de la veille, qui reviennent 24 h plus tard (+ ' + delai + ' min)',
        planche: 'la planche retour du handling' }[source];
      const retours = P.retoursDeVols(vols, mat).filter(r => Number.isFinite(r.t)).sort((x, y) => x.t - y.t);
      const r = this.at.a && this.at.a.reglages ? this.at.a.reglages() : {};
      const equipes = cases.filter(a => a.type === 'lavage').map(a => {
        const t0 = (a.jour || 0) * 1440 + P.minutes(a.debut || '06:00'), reg = P.normaliserRegime(a.regime, r.regime);
        return { a, t0, t1: t0 + (Number.isFinite(reg.presence) ? reg.presence : 480) };
      });
      const quand = t => { const j = Math.floor(t / 1440); return (j ? jourEcrit(j) + ' ' : '') + P.hhmm(t - j * 1440); };
      const regle = '<p class="mini-note">Le jour d’une équipe de plonge se compte <b>depuis l’arrivée des retours</b> : '
        + '<b>J</b> le jour où ils arrivent, <b>J+1</b> le lendemain, <b>J-1</b> la veille. D’où viennent les retours : '
        + '<button type="button" class="lien-discret" data-page="rg-simulation">Simulation › Réglages de la simulation →</button></p>';
      if (!retours.length) return `<div class="mu-retours"><h4>L’arrivée des retours</h4>
        <p>Aucun retour à laver d’après ${esc(dou)}.</p>${regle}</div>`;
      const dedans = t => equipes.some(e => t >= e.t0 && t < e.t1);
      const seuls = retours.filter(x => !dedans(x.t));
      const t0 = Math.floor(Math.min(retours[0].t, ...equipes.map(e => e.t0)) / 60) * 60;
      const t1 = Math.ceil(Math.max(retours[retours.length - 1].t + 1, ...equipes.map(e => e.t1)) / 60) * 60;
      // Le dessin : une colonne par heure (les retours qui arrivent), puis une ligne par équipe.
      const W = 1000, G = 150, D = 12, HH = 64, LH = 30, haut = 22 + HH + 10 + Math.max(1, equipes.length) * LH + 24;
      const x = t => G + (t - t0) / (t1 - t0) * (W - G - D);
      const parHeure = new Map();
      for (const q of retours) { const h = Math.floor(q.t / 60) * 60; parHeure.set(h, (parHeure.get(h) || 0) + 1); }
      const max = Math.max(...parHeure.values());
      const pas = [60, 120, 180, 240, 360].find(k => (W - G - D) * k / (t1 - t0) >= 54) || 360;
      let svg = '';
      // Les jours : une bande pour le jour d'arrivée, un trait à chaque minuit.
      for (let j = Math.floor(t0 / 1440); j * 1440 < t1; j++) {
        const a = Math.max(t0, j * 1440), b = Math.min(t1, (j + 1) * 1440);
        svg += `<rect class="mr-jour${j === 0 ? ' arrivee' : ''}" x="${x(a)}" y="16" width="${x(b) - x(a)}" height="${haut - 30}"/>`
          + `<text class="mr-jour-nom" x="${x(a) + 6}" y="12">${j === 0 ? 'J · jour d’arrivée des retours' : jourEcrit(j) + (j > 0 ? ' · lendemain' : ' · veille')}</text>`;
        if (j * 1440 > t0) svg += `<line class="mr-minuit" x1="${x(j * 1440)}" x2="${x(j * 1440)}" y1="16" y2="${haut - 14}"/>`;
      }
      for (let t = Math.ceil(t0 / pas) * pas; t <= t1; t += pas)
        svg += `<text class="mr-heure" x="${x(t)}" y="${haut - 2}" text-anchor="middle">${P.hhmm(((t % 1440) + 1440) % 1440)}</text>`;
      // Les retours, heure par heure.
      svg += `<text class="mr-lib" x="8" y="${22 + HH / 2 + 4}">Retours qui arrivent</text>`;
      for (const [h, n] of parHeure) {
        const hb = Math.max(4, n / max * HH), seulsIci = seuls.filter(q => Math.floor(q.t / 60) * 60 === h).length;
        svg += `<rect class="mr-retour${seulsIci ? ' seul' : ''}" x="${x(h) + 1}" y="${22 + HH - hb}" width="${Math.max(2, x(h + 60) - x(h) - 2)}" height="${hb}" rx="2">`
          + `<title>${quand(h)} : ${n} retour${n > 1 ? 's' : ''}${seulsIci ? ' — ' + seulsIci + ' sans équipe de plonge' : ''}</title></rect>`;
      }
      // Les équipes de plonge, chacune sur sa plage.
      equipes.forEach((e, i) => {
        const y = 22 + HH + 10 + i * LH;
        svg += `<text class="mr-lib" x="8" y="${y + 17}">${esc(e.a.nom.length > 20 ? e.a.nom.slice(0, 19) + '…' : e.a.nom)}</text>`
          + `<rect class="mr-equipe" x="${x(e.t0)}" y="${y + 4}" width="${Math.max(3, x(e.t1) - x(e.t0))}" height="${LH - 10}" rx="5"><title>${esc(e.a.nom)} : ${quand(e.t0)} → ${quand(e.t1)}</title></rect>`
          + `<text class="mr-plage" x="${x(e.t0) + 6}" y="${y + 18}">${quand(e.t0)} → ${quand(e.t1)}</text>`;
      });
      if (!equipes.length) svg += `<text class="mr-lib vide" x="${G}" y="${22 + HH + 27}">Aucune équipe de plonge : les retours attendent.</text>`;
      const jours = [...new Set(retours.map(q => Math.floor(q.t / 1440)))];
      const resume = `<b>${pl(retours.length, 'retour')}</b> à laver, ${jours.length === 1 && jours[0] === 0 ? 'le jour J, ' : ''}de <b>${quand(retours[0].t)}</b> à <b>${quand(retours[retours.length - 1].t)}</b> — d’après ${esc(dou)}.`;
      // Ce qui arrive sans personne : l'équipe qui le reprend, ou personne.
      const suivante = t => equipes.filter(e => e.t0 >= t).sort((p, q) => p.t0 - q.t0)[0];
      const repris = seuls.filter(q => suivante(q.t)), perdus = seuls.filter(q => !suivante(q.t));
      const liste = l => l.slice(0, 4).map(q => quand(q.t)).join(', ') + (l.length > 4 ? '…' : '');
      const alerte = !equipes.length ? '' : !seuls.length
        ? '<p class="mu-retours-ok">Chaque retour arrive pendant qu’une équipe de plonge est là.</p>'
        : (repris.length ? `<p class="mu-retours-attente">${pl(repris.length, 'retour arrive', 'retours arrivent')} entre deux équipes (${liste(repris)}) : `
            + `${repris.length > 1 ? 'ils attendent' : 'il attend'} ${[...new Set(repris.map(q => suivante(q.t)))].map(e => '« ' + esc(e.a.nom) + ' » (' + quand(e.t0) + ')').join(', ')}.</p>` : '')
          + (perdus.length ? `<p class="mu-retours-alerte">${pl(perdus.length, 'retour arrive', 'retours arrivent')} après la dernière équipe (${liste(perdus)}) : `
            + `${perdus.length > 1 ? 'ils restent' : 'il reste'} sale${perdus.length > 1 ? 's' : ''}. Ajoutez une équipe le soir, ou le lendemain de l’arrivée (J+1).</p>` : '');
      return `<div class="mu-retours"><h4>L’arrivée des retours, face à la plonge</h4><p>${resume}</p>
        <svg class="mu-retours-frise" viewBox="0 0 ${W} ${haut}" role="img" aria-label="Les retours qui arrivent, heure par heure, et les équipes de plonge">${svg}</svg>
        ${alerte}${regle}</div>`;
    }

    /* Qui suit quel chemin (retour d'usage du 05/10) : toutes les commandes, par
     * compagnie, chacune avec la liste de tous les chemins — un flux, une variante,
     * ou un chemin créé de toutes pièces. */
    cheminsDesCommandes(classes) {
      const st = this.etat, cies = [];
      for (const c of classes) if (!cies.includes(c.cie)) cies.push(c.cie);
      const ordre = c => P.CABINES.indexOf(c.cabine);
      return `<details class="mu-qui-suit panneau"${this.quiSuitOuvert === false ? '' : ' open'} data-mu-qui-suit><summary><b>Qui suit quel chemin</b>
          <span class="mini-note">— chaque compagnie × classe, et le chemin qu’elle suit : à choisir dans la liste</span></summary>
        <div class="mu-qui-suit-grille">${cies.map(cie => `<div class="mu-qs-cie"><p class="mu-qs-tete">${esc(cie)}</p>
          ${classes.filter(c => c.cie === cie).sort((a, b) => ordre(a) - ordre(b)).map(c => `<div class="mu-qs-ligne">
            <span class="mu-qs-classe"><span class="puce-classe" data-cab="${esc(c.cabine)}"></span>${esc((P.NOM_CABINE || {})[c.cabine] || c.cabine)}</span>
            ${PC.selectChemin(st, c, 'data-mu-cmd-chemin')}
            <button type="button" class="lien-discret" data-mu-chemin="${esc(c.id)}" title="Voir son chemin et ses équipes">voir</button></div>`).join('')}</div>`).join('')}</div>
      </details>`;
    }

    ficheFlux(t, classes) {
      const st = this.etat, dedans = P.servicesDuParcours(t);
      const cabs = P.CABINES.filter(c => (st.parcoursCabine || {})[c] === t.id);
      const n = PC.commandesDuType(st, t.id, classes).length;
      const hors = this.a.services().filter(s => !dedans.includes(s.id));
      const tete = `<div class="mu-tete">
        <span class="mu-tete-ico mu-tete-flux" aria-hidden="true">${root.OrlyIcones ? root.OrlyIcones.ico('fleche') : ''}</span>
        <label class="mu-nom">Nom du flux<input data-mu-flux-nom="${esc(t.id)}" maxlength="76" value="${esc(t.nom)}"></label>
        <span class="mu-tete-fin"></span>
        <button class="btn btn-sm" type="button" data-mu-flux-action="dupliquer">Dupliquer</button>
        <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="supprimer"${cabs.length ? ' disabled title="C’est le flux d’une classe : donnez d’abord un autre flux à la classe"' : ''}>Supprimer</button>
      </div>`;
      const sel = this.fluxSel;
      const actionSel = !sel ? '<span class="mini-note">Cliquez un service ou un lien pour le modifier. Tirez le rond d’un service jusqu’à un autre pour dire qu’il le livre.</span>'
        : sel.type === 'noeud' ? `<b>${esc(this.nom(sel.id))}</b> <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="retirer-service" data-service="${esc(sel.id)}">Retirer du flux</button>
          <button class="btn btn-sm" type="button" data-mu-ouvrir-svc="${esc(sel.id)}">Ses équipes →</button>`
        : `<b>${esc(this.nom(sel.id.split('>')[0]))} → ${esc(this.nom(sel.id.split('>')[1]))}</b> <button class="btn btn-sm svc-danger" type="button" data-mu-flux-action="retirer-lien" data-lien="${esc(sel.id)}">Retirer ce lien</button>`;
      const diagramme = `<div class="mu-flux-outils">
          <label>Ajouter un service <select data-mu-flux-ajout><option value="">choisir…</option>${hors.map(s => `<option value="${esc(s.id)}">${esc(s.nom)}</option>`).join('')}</select></label>
          <span class="mu-flux-sel">${actionSel}</span>
          <button class="btn btn-sm" type="button" data-mu-flux-action="reorganiser" title="Ranger les services de gauche à droite, dans le sens du flux">Réorganiser</button>
        </div>
        <div class="pc-graphe mu-graphe" data-mu-graphe></div>
        <p class="mini-note mu-flux-message" aria-live="polite">${esc(this.fluxMessage || '')}</p>`;
      const etape = (num, titre, corps, note) => `<section class="mu-etape"><h3><span class="mu-num">${num}</span>${esc(titre)}${note ? `<small>${note}</small>` : ''}</h3>${corps}</section>`;
      return tete
        + etape(1, 'Par où il passe', diagramme, 'un rond par service, une flèche pour « livre » ; un changement vaut pour toutes ses commandes')
        + etape(2, 'Qui le suit', this.quiSuit(t, classes), pl(n, 'commande') + ' aujourd’hui');
    }

    /* Qui suit un flux : des classes entières, et quelques exceptions — tout
     * se coche et se décoche, chaque exception se défait d'un clic. */
    quiSuit(t, classes) {
      if (!classes.length) return '<p class="mini-note">Aucune commande : importez d’abord vos vols (Vols).</p>';
      const st = this.etat, nomCab = c => (P.NOM_CABINE || {})[c] || c;
      const flux = id => (st.parcours || []).find(p => p.id === id);
      const cabs = P.CABINES.filter(c => classes.some(k => k.cabine === c));
      // 1. Les classes.
      const puces = cabs.map(cab => {
        const def = (st.parcoursCabine || {})[cab], ici = def === t.id, autre = def && !ici ? flux(def) : null;
        const nb = classes.filter(c => c.cabine === cab && (PC.fluxDe(st, c) || {}).id === t.id).length;
        const sous = ici ? pl(nb, 'commande') : autre ? 'suit « ' + autre.nom + ' »' : 'aucun flux';
        return `<label class="mu-classe${ici ? ' on' : ''}"><input type="checkbox" data-mu-flux-classe="${cab}"${ici ? ' checked' : ''}>
          <span class="puce-classe" data-cab="${cab}"></span><b>${esc(nomCab(cab))}</b><small>${esc(sous)}</small></label>`;
      }).join('');
      // 2. Les exceptions.
      const lib = c => P.libelleClasse(c.id);
      const suitAussi = classes.filter(c => !PC.cheminDe(st, c.id) && (st.parcoursClasse || {})[c.id] === t.id && (st.parcoursCabine || {})[c.cabine] !== t.id);
      const partent = classes.filter(c => (st.parcoursCabine || {})[c.cabine] === t.id && (PC.fluxDe(st, c) || {}).id !== t.id);
      const ligneAussi = c => {
        const def = flux((st.parcoursCabine || {})[c.cabine]);
        return `<li><span><b>${esc(lib(c))}</b> suit ce flux${def ? ', alors que les ' + esc(nomCab(c.cabine)) + ' suivent « ' + esc(def.nom) + ' »' : ''}.</span>
          <button class="btn btn-sm" type="button" data-mu-flux-retour="${esc(c.id)}">${def ? 'La remettre sur le flux de sa classe' : 'Retirer'}</button></li>`;
      };
      const lignePart = c => {
        const f = PC.fluxDe(st, c), propre = f && !f.type;
        return `<li><span><b>${esc(lib(c))}</b> ${propre ? 'a son propre chemin' : 'suit « ' + esc(f ? f.nom : '?') + ' »'}.</span>
          ${f && f.type ? `<button class="btn btn-sm" type="button" data-mu-flux-choisir="${esc(f.id)}">Voir ce flux</button>` : ''}
          ${propre ? `<button class="btn btn-sm" type="button" data-mu-chemin="${esc(c.id)}">Voir son chemin</button>` : ''}
          <button class="btn btn-sm" type="button" data-mu-flux-suivre="${esc(c.id)}">La remettre sur ce flux</button></li>`;
      };
      const autres = classes.filter(c => (PC.fluxDe(st, c) || {}).id !== t.id);
      const ajout = autres.length ? `<label class="mu-flux-ajout-cmd">Une autre commande suit ce flux :
        <select data-mu-flux-ajouter-cmd><option value="">choisir…</option>${autres.map(c => {
          const f = PC.fluxDe(st, c);
          return `<option value="${esc(c.id)}">${esc(lib(c))}${f ? ' — suit « ' + esc(f.nom) + ' »' : ' — sans flux'}</option>`;
        }).join('')}</select></label>` : '';
      const suivent = classes.filter(c => (PC.fluxDe(st, c) || {}).id === t.id);
      const voir = suivent.length ? `<label class="mu-flux-ajout-cmd">Voir le chemin d’une de ses commandes, avec ses équipes :
        <select data-mu-flux-chemin><option value="">choisir…</option>${suivent.map(c => `<option value="${esc(c.id)}">${esc(lib(c))}</option>`).join('')}</select></label>` : '';
      return `<p class="mu-sous-titre">Les classes qui le suivent <small>cochez une classe : toutes ses commandes suivent ce flux</small></p>
        <div class="mu-classes">${puces}</div>
        <p class="mu-sous-titre">Les exceptions <small>une compagnie qui ne fait pas comme sa classe</small></p>
        ${suitAussi.length || partent.length ? `<ul class="mu-exceptions">${suitAussi.map(ligneAussi).join('')}${partent.map(lignePart).join('')}</ul>`
          : '<p class="mini-note">Aucune : chaque commande suit le flux de sa classe.</p>'}
        ${ajout}${voir}`;
    }

    /* Une commande revient au flux de sa classe (ou n'en a plus, si sa classe n'en a pas). */
    revenirClasse(st, cmd) {
      const cab = cmd.slice(cmd.lastIndexOf('/') + 1), def = (st.parcoursCabine || {})[cab];
      if (def) PC.assignerType(st, cmd, def);
      else {
        const propre = PC.cheminDe(st, cmd);
        delete st.parcoursClasse[cmd];
        if (propre) st.parcours = st.parcours.filter(p => p !== propre);
      }
      PC.nettoyerTypes(st);
    }

    grapheFlux() {
      if (this.graphe || !root.OrlyGraphe) return this.graphe;
      const u = this;
      const flux = () => PC.types(u.etat).find(x => x.id === u.fluxChoisi);
      this.graphe = new root.OrlyGraphe.Diagramme({
        hote: () => root.document.querySelector('#mu-flux [data-mu-graphe]'),
        get cle() { return 'flux:' + (u.fluxChoisi || ''); },
        titre: 'Le flux de production : un nœud par service, une flèche par livraison',
        noeuds: () => {
          const t = flux(); if (!t) return [];
          const I = root.OrlyIcones, cmds = PC.commandesDuType(u.etat, t.id, u.at.classes);
          return P.servicesDuParcours(t).map(s => {
            const eq = u.etat.ateliers.filter(a => a.service === s);
            const fab = eq.filter(a => a.type === 'manuel' || a.type === 'robot');
            const prep = fab.length ? cmds.filter(c => fab.some(a => a.lots.some(l => l.includes(c.id))) || PC.fusionneePar(u.etat, s, c.id)).length : null;
            // L'armement (par compagnie, relié au handling) : ses compagnies cochées, pas les repas.
            const propres = u.at.classesDe(s);
            if (propres) {
              const faites = new Set(fab.flatMap(a => a.lots.flat()));
              const n = propres.filter(c => faites.has(c.id)).length;
              return { id: s, nom: u.nom(s), ico: I ? I.icoService(s, u.nom(s)) : 'service', sous: n + '/' + pl(propres.length, 'compagnie'), ton: n < propres.length ? 'neutre' : 'ok' };
            }
            const sous = !eq.length ? 'aucune équipe' : fab.length ? prep + '/' + cmds.length + ' préparées' : eq[0].type === 'dispo' ? 'sert tout le monde' : eq[0].type === 'lavage' ? 'plonge' : 'par vol';
            return { id: s, nom: u.nom(s), ico: I ? I.icoService(s, u.nom(s)) : 'service', sous, ton: !eq.length || (fab.length && prep < cmds.length) ? 'neutre' : 'ok' };
          });
        },
        // Deux étapes faites à la chaîne par une même équipe : un seul bloc.
        groupes: () => {
          const t = flux(); if (!t) return [];
          const cmds = PC.commandesDuType(u.etat, t.id, u.at.classes).map(c => c.id);
          return PC.chaines(u.etat, t, cmds).map(g => ({ id: g.id, ids: [g.avant, g.service],
            etiquettes: { [g.avant]: '⛓ à la chaîne → ' + u.nom(g.service), [g.service]: '⛓ + ' + u.nom(g.avant) + ' à la chaîne · ' + g.commandes.length + '/' + cmds.length },
            titre: g.equipes.map(a => '« ' + a.nom + ' »').join(', ') + ' : ' + u.nom(g.avant) + ' + ' + u.nom(g.service) + ' d’un bloc, pour '
              + g.commandes.map(c => PC.etiquette(c)).join(', ') + '.' }));
        },
        liens: () => { const t = flux(); return t ? P.arcsDuParcours(t).map(a => ({ id: a.from + '>' + a.to, de: a.from, vers: a.to, titre: u.nom(a.from) + ' livre ' + u.nom(a.to) })) : []; },
        relier: (de, vers) => {
          const t = flux(); if (!t) return 'Aucun flux choisi.';
          if (P.arcsDuParcours(t).some(a => a.from === de && a.to === vers)) return u.nom(de) + ' livre déjà ' + u.nom(vers) + '.';
          if (PC.creeBoucle(t, de, vers)) return 'Impossible : ' + u.nom(vers) + ' livre déjà ' + u.nom(de) + ' (directement ou par d’autres services).';
          u.changerFlux(x => { x.liens.push({ de, vers }); }, u.nom(de) + ' livre maintenant ' + u.nom(vers) + ', dans « ' + t.nom + ' ».');
          return '';
        },
        retirerLien: id => { const [de, vers] = id.split('>'); u.changerFlux(x => { x.liens = x.liens.filter(l => !(l.de === de && l.vers === vers)); }, 'Lien retiré.'); },
        choisir: sel => { u.fluxSel = sel; const b = root.document.querySelector('#mu-flux .mu-flux-sel'); if (b) { u.rendreFlux(); } },
        message: t => { u.fluxMessage = t; const m = root.document.querySelector('#mu-flux .mu-flux-message'); if (m) m.textContent = t; }
      });
      return this.graphe;
    }

    /* Modifier le flux choisi (tout le flux : toutes ses commandes). */
    changerFlux(fn, message) {
      const id = this.fluxChoisi;
      this.at.changer(() => { const x = this.at.state.parcours.find(p => p.id === id); if (x) { x.liens = x.liens || []; x.noeuds = x.noeuds || []; fn(x); } }, message);
    }

    actionFlux(quoi, el) {
      const st = this.at.state, id = this.fluxChoisi, t = PC.types(st).find(x => x.id === id), o = this.options();
      switch (quoi) {
        case 'regrouper': {
          let r;
          this.at.changer(() => { r = PC.regrouper(st, this.at.classes, o.nomDe); }, '');
          this.fluxChoisi = null;
          PC.annoncer(r ? pl(r.commandes, 'commande') + ' regroupées : ' + pl(r.types, 'flux créé', 'flux créés') + '. Chaque classe a son flux ; « Annuler » revient en arrière.' : '');
          return this.rendreFlux();
        }
        case 'dupliquer': {
          if (!t) return;
          let n;
          this.at.changer(() => { n = PC.nouveauType(st, t.nom + ' (copie)', t); }, 'Flux dupliqué : donnez-lui ses commandes.');
          this.fluxChoisi = n.id; return this.rendreFlux();
        }
        case 'supprimer': {
          if (!t) return;
          const cmds = PC.commandesDuType(st, t.id, this.at.classes);
          if (!confirm('Supprimer le flux « ' + t.nom + ' » ?' + (cmds.length ? ' Ses ' + pl(cmds.length, 'commande') + ' reprendront le flux de leur classe.' : ''))) return;
          this.at.changer(() => {
            for (const c of cmds) delete st.parcoursClasse[c.id];
            st.parcours = st.parcours.filter(p => p.id !== t.id);
          }, 'Flux « ' + t.nom + ' » supprimé.');
          this.fluxChoisi = null; return this.rendreFlux();
        }
        case 'retirer-service': {
          this.fluxSel = null;
          const svc = el.dataset.service; let parties = [];
          this.changerFlux(x => { PC.retirerService(x, svc); parties = PC.liberer(this.at.state, svc, this.at.classes); },
            this.nom(svc) + ' sort du flux : ceux qui le livraient livrent ceux qu’il livrait.');
          if (parties.length) this.at.rendre(this.nom(svc) + ' sort du flux ; ses équipes ne préparent plus '
            + (parties.length > 6 ? pl(parties.length, 'commande') : parties.map(c => PC.etiquette(c)).join(', ')) + '.');
          return;
        }
        case 'retirer-lien': { this.fluxSel = null; const [de, vers] = el.dataset.lien.split('>'); return this.changerFlux(x => { x.liens = x.liens.filter(l => !(l.de === de && l.vers === vers)); }, 'Lien retiré.'); }
        case 'reorganiser': if (this.graphe) this.graphe.reorganiser(); return;
      }
    }

    lierFlux() {
      const d = root.document, dans = el => el && el.closest && el.closest('#mu-flux');
      d.addEventListener('click', e => {
        if (!dans(e.target)) return;
        const c = e.target.closest('[data-mu-flux-choisir]');
        if (c) { this.fluxChoisi = c.dataset.muFluxChoisir; this.fluxSel = null; this.fluxMessage = ''; return this.rendreFlux(); }
        const a = e.target.closest('[data-mu-flux-action]');
        if (a) return this.actionFlux(a.dataset.muFluxAction, a);
        const s = e.target.closest('[data-mu-ouvrir-svc]');
        if (s) return this.ouvrir(s.dataset.muOuvrirSvc);
        const st = this.at.state, t = PC.types(st).find(x => x.id === this.fluxChoisi);
        const r = e.target.closest('[data-mu-flux-retour]');
        if (r && t) { const cmd = r.dataset.muFluxRetour; return this.at.changer(() => this.revenirClasse(st, cmd), PC.etiquette(cmd) + ' reprend le flux de sa classe.'); }
        const sv = e.target.closest('[data-mu-flux-suivre]');
        if (sv && t) { const cmd = sv.dataset.muFluxSuivre; return this.at.changer(() => { PC.assignerType(st, cmd, t.id); PC.nettoyerTypes(st); }, PC.etiquette(cmd) + ' suit de nouveau « ' + t.nom + ' ».'); }
      });
      d.addEventListener('change', e => {
        const el = e.target; if (!dans(el)) return;
        const st = this.at.state, t = PC.types(st).find(x => x.id === this.fluxChoisi);
        if (el.dataset.muFluxClasse && t) {
          const cab = el.dataset.muFluxClasse, nom = (P.NOM_CABINE || {})[cab] || cab;
          if (el.checked) this.at.changer(() => {
            st.parcoursCabine[cab] = t.id;
            // Celles de la classe désignées une à une sur ce flux le suivent désormais par leur classe.
            for (const [k, v] of Object.entries(st.parcoursClasse)) if (v === t.id && k.endsWith('/' + cab)) delete st.parcoursClasse[k];
            PC.nettoyerTypes(st);
          }, 'Les ' + nom + ' suivent maintenant « ' + t.nom + ' » (sauf leurs exceptions).');
          else this.at.changer(() => { delete st.parcoursCabine[cab]; PC.nettoyerTypes(st); },
            'Les ' + nom + ' ne suivent plus aucun flux : ouvrez celui qu’elles doivent suivre (à gauche) et cochez « ' + nom + ' ».');
        } else if (el.dataset.muCmdChemin !== undefined) {
          // Qui suit quel chemin : le chemin de cette commande, choisi dans la liste.
          const cmd = el.dataset.muCmdChemin, pid = el.value, q = (st.parcours || []).find(x => x.id === pid);
          const avec = q && !q.type ? PC.commandeDu(st, q.id) : null;
          this.quiSuitOuvert = true;
          this.at.changer(() => { PC.choisirChemin(st, cmd, pid); },
            PC.etiquette(cmd) + (q ? ' suit maintenant « ' + q.nom + ' ».' : ' suit de nouveau le flux de sa classe.')
            + (avec && avec !== cmd ? ' C’était le chemin à part de ' + PC.etiquette(avec) + ' : c’est maintenant un flux partagé, le modifier change pour les deux.' : ''));
        } else if (el.dataset.muFluxChemin !== undefined && el.value) {
          this.chemin(el.value);
        } else if (el.dataset.muFluxAjouterCmd !== undefined && el.value && t) {
          const cmd = el.value;
          this.at.changer(() => { PC.assignerType(st, cmd, t.id); PC.nettoyerTypes(st); }, PC.etiquette(cmd) + ' suit maintenant « ' + t.nom + ' ».');
        } else if (el.dataset.muFluxAjout !== undefined && el.value && t) {
          const s = el.value, o = this.options();
          this.changerFlux(x => { PC.insererService(st, x, s, o); }, this.nom(s) + ' entre dans « ' + t.nom + ' », à sa place ; ajustez les flèches si besoin.');
        } else if (el.dataset.muFluxNom && t) {
          const v = el.value.trim(); if (!v) { this.rendreFlux(); return; }
          this.changerFlux(x => { x.nom = v.slice(0, 76); delete x.auto; }, 'Flux renommé.');
        }
      });
      d.addEventListener('submit', e => {
        const f = e.target.closest && e.target.closest('[data-mu-flux-nouveau]'); if (!f) return;
        e.preventDefault();
        const st = this.at.state, src = PC.types(st).find(x => x.id === f.elements.source.value) || null;
        let n;
        this.at.changer(() => { n = PC.nouveauType(st, f.elements.nom.value.trim() || 'Flux', src); }, 'Flux créé : dessinez-le, puis cochez les commandes qui le suivent.');
        this.fluxChoisi = n.id; this.rendreFlux();
      });
    }

    lier() {
      const d = root.document;
      d.addEventListener('change', e => {
        const el = e.target;
        if (!el.closest || !el.closest('#mu-services')) return;
        if (el.dataset.muCocher) {
          const t = el.closest('table');
          if (t.dataset.muEquipe) this.cocher(t.dataset.muEquipe, [el.dataset.muCocher], el.checked);
        } else if (el.dataset.muBesoin) this.passer(el.dataset.service, [el.dataset.muBesoin], el.checked);
        else if (el.dataset.muNature) this.nature(el.dataset.muNature, el.value);
        else if (el.dataset.muCatMin) {
          const service = el.closest('[data-mu-cat-service]').dataset.muCatService, id = el.dataset.muCatMin;
          const cie = el.dataset.cie, v = el.value.trim();
          return this.changerCategories(service, l => {
            const k = l.find(x => x.id === id); if (!k) return;
            if (v === '' || !Number.isFinite(+v)) delete k.minutes[cie]; else k.minutes[cie] = Math.max(0, +v);
          }, 'Minutes par vol enregistrées.');
        }
        else if (el.dataset.muFluxIci) {
          const svc = el.dataset.muFluxIci, t = PC.types(this.etat).find(x => x.id === el.value); if (!t) return;
          this.at.changer(() => { PC.changerFlux(this.at.state, t.id, svc, true, this.options()); },
            this.nom(svc) + ' entre dans « ' + t.nom + ' », à sa place : ses commandes se cochent maintenant ici.');
        }
        else if (el.dataset.muNom) {
          const v = el.value.trim();
          if (!v) { this.a.notify('Le nom ne peut pas être vide.'); this.rendreServices(); return; }
          this.a.renommer(el.dataset.muNom, v); this.rendreServices();
        }
      });
      d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.muNom) { e.preventDefault(); e.target.blur(); } });
      d.addEventListener('toggle', e => {
        const t = e.target;
        // « Qui suit quel chemin » reste comme on l'a laissé, ouvert ou fermé.
        if (t.dataset && t.dataset.muQuiSuit !== undefined) { this.quiSuitOuvert = t.open; return; }
        if (!t.dataset || !t.dataset.muPlus) return;
        this.ouvertes = this.ouvertes || new Set();
        if (t.open) this.ouvertes.add(t.dataset.muPlus); else this.ouvertes.delete(t.dataset.muPlus);
      }, true);
      d.addEventListener('submit', e => {
        const f = e.target.closest && e.target.closest('[data-mu-nouveau]'); if (!f) return;
        e.preventDefault();
        const nom = f.elements.nom.value.trim(); if (!nom) return;
        if (this.a.services().some(x => x.nom.toLowerCase() === nom.toLowerCase())) { this.a.notify('« ' + nom + ' » existe déjà.'); return; }
        const id = this.a.creer(nom, f.elements.parent.value, !f.elements.genre || f.elements.genre.value !== 'salle');
        if (id) { this.a.notify('Service « ' + nom + ' » créé : dites ce qu’il fait, puis ajoutez ses équipes.'); this.ouvrir(id); }
      });
      d.addEventListener('click', e => {
        // Les passerelles entre Services, Flux et Une commande.
        const pont = e.target.closest && e.target.closest('#mu-services [data-mu-voir-flux], #mu-services [data-mu-chemin], #mu-flux [data-mu-chemin]');
        if (pont) return pont.dataset.muVoirFlux ? this.ouvrirFlux(pont.dataset.muVoirFlux) : this.chemin(pont.dataset.muChemin, pont.dataset.service);
        const q = e.target.closest && e.target.closest('[data-mu-q]');
        if (q) return this.repondre(q.dataset.muQ);
        const t = e.target.closest && e.target.closest('[data-mu-choisir], [data-mu-ouvrir], [data-mu-action], [data-mu-ligne], [data-mu-col]');
        if (!t || t.closest('#mu-flux')) return;
        if (t.dataset.muChoisir) return this.ouvrir(t.dataset.muChoisir);
        if (t.dataset.muOuvrir) return this.ouvrir(t.dataset.muOuvrir);
        const table = t.closest('table');
        if (t.dataset.muLigne || t.dataset.muCol) {
          const cmds = [...table.querySelectorAll('[data-mu-cocher]:not(:disabled)')].map(x => x.dataset.muCocher)
            .filter(c => (t.dataset.muLigne ? c.slice(0, c.lastIndexOf('/')) === t.dataset.muLigne : c.endsWith('/' + t.dataset.muCol)));
          if (cmds.length) this.tout(table, cmds);
          return;
        }
        const id = this.choisi;
        switch (t.dataset.muAction) {
          case 'equipe': return this.ajouterEquipe(id);
          case 'par-compagnie': return this.nature(id, 'categories');
          // L'armement n'a rien à faire dans les chemins des repas.
          // L'armement dans tous les chemins, en branche à part, relié seulement au handling.
          case 'integrer-armement': {
            let n = 0;
            this.at.changer(() => { n = PC.integrerArmement(this.at.state, [id], this.handlings(this.at.state)); }, '');
            return this.at.rendre(this.nom(id) + ' : intégré à ' + pl(n, 'chemin') + ', relié seulement au handling. « Annuler » revient en arrière.');
          }
          case 'liberer': {
            let parties = [];
            this.at.changer(() => { parties = PC.liberer(this.at.state, id, this.at.classes); }, '');
            return this.at.rendre(this.nom(id) + ' : ses équipes ne préparent plus ' + parties.map(c => PC.etiquette(c)).join(', ') + '.');
          }
          case 'voir': return this.a.voir(id);
          case 'plan': return this.a.plan(id);
          case 'supprimer':
            if (this.a.supprimer(id)) { this.choisi = null; this.rendreServices(); }
            return;
        }
      });
    }
  }

  /* Ce que la journée montre (un retard, un poste trop court) n'est pas une
   * erreur de saisie : la fiche d'un service ne le range pas dans « à faire ». */
  const CODES_JOURNEE = new Set(['poste', 'materiel', 'bouchon', 'inacheve', 'plonge-fermee', 'plonge-vol',
    'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs', 'sans-personne', 'robot-arret', 'plonge-arret']);
  // « hors-parcours » et « doublon » n'en sont plus (audit du 02/10) : depuis que les flux
  // décident des chemins, une case cochée hors de son chemin, ou deux fois dans un service,
  // est un réglage à corriger — on le dit dans la fiche du service et dans le pas à pas.
  const initiales = nom => String(nom || '').split(/\s+/).filter(Boolean).map(m => m[0]).join('').slice(0, 3).toUpperCase();

  root.OrlyUnite = { NATURES, MonUnite };
})(typeof window !== 'undefined' ? window : globalThis);
