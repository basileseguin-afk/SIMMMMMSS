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
 *  grille à cocher ») ; les anciens outils restent, pour les cas rares, dans
 *  « Outils avancés ».
 * ==========================================================================*/
(function (root) {
  'use strict';
  const P = root.MoteurProduction, PC = root.OrlyParcours;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const CLE = 'ory-service-ouvert';

  /** Ce que fait un service, en mots de l'unité. */
  const NATURES = [
    { id: 'manuel', nom: 'Des équipes préparent les commandes', court: 'préparation' },
    { id: 'robot', nom: 'Un robot (une ligne) prépare les commandes', court: 'robot' },
    { id: 'dispo', nom: 'Il sert tout le monde : légumerie, magasin, réception…', court: 'sert tout le monde' },
    { id: 'lavage', nom: 'Plonge : il lave ce qui revient des vols', court: 'plonge' },
    { id: 'handling', nom: 'Il charge les vols (handling)', court: 'chargement des vols' }
  ];
  const preparent = n => n === 'manuel' || n === 'robot';

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
      if (attendues.length && cases.length) points.push(pl(attendues.length, 'commande') + ' à cocher dans une équipe');
      if (vides.length) points.push(vides.length > 1 ? vides.length + ' équipes ne préparent rien' : '« ' + vides[0].nom + ' » ne prépare rien');
      if (sansTemps) points.push('minutes de travail à remplir');
      for (const x of alertes.slice(0, 3)) points.push(x.message);
      const utilise = cases.length > 0 || passent > 0;
      return { id, nature, cases, passent, attendues, vides, sansTemps, alertes, points,
        etat: !utilise ? 'libre' : points.length ? 'afaire' : 'ok' };
    }

    /* ---- rendu ---------------------------------------------------------- */

    /** La page affichée de Mon unité, s'il y en a une. */
    page() { const b = root.document.body; return b.dataset.vue === 'ateliers' ? b.dataset.sous : null; }

    rendre() {
      const p = this.page();
      if (p === 'mu-services') this.rendreServices();
      if (p === 'mu-pas') this.rendrePas();
      if (p === 'mu-flux') this.rendreFlux();
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
      const bilans = new Map(services.map(s => [s.id, this.bilan(s.id, classes, r)]));
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
          <button class="btn btn-sm btn-play" type="submit">+ Créer</button></form>
        <p class="mu-avance"><button type="button" class="lien-discret" data-page="at-equipes">Outils avancés : cases, minutes, liens →</button></p>
      </nav>`;
      const s = services.find(x => x.id === this.choisi);
      this.poser(box, `<div class="mu-cadre">${liste}<div class="mu-fiche" data-mu-fiche="${esc(this.choisi || '')}">${s ? this.fiche(s, bilans.get(s.id), classes, r) : '<p class="mini-note">Aucun service.</p>'}</div></div>`);
    }

    /** La fiche d'un service : ce qu'il fait, ses équipes, ses minutes de travail. */
    fiche(s, b, classes, r) {
      const I = root.OrlyIcones, st = this.etat;
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
      const lesFlux = `<p class="mu-flux-passent"><span>${passent.length ? 'Flux qui passent ici :' : 'Aucun flux ne passe ici.'}</span>
        ${passent.map(t => `<button type="button" class="mu-flux-lien" data-mu-voir-flux="${esc(t.id)}">${esc(t.nom)}</button>`).join('')}
        <button type="button" class="lien-discret" data-page="mu-flux">${passent.length ? 'Tous les flux' : 'Les flux de production'} →</button></p>`;
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
          est fait par ${eqs(g)}, au ${esc(this.nom(g.service))}, d’un bloc : pas besoin d’équipe ici pour elles.</span>
          <button class="btn btn-sm" type="button" data-mu-ouvrir="${esc(g.service)}">Ouvrir ${esc(this.nom(g.service))} →</button></p>`)).join('');
      const blocChaine = chaine ? `<div class="mu-chaine-bloc">${chaine}</div>` : '';

      const choixNature = `<label class="mu-nature">Ce service…<select data-mu-nature="${esc(s.id)}">${NATURES.map(x =>
        `<option value="${x.id}"${x.id === nature ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>`;

      let equipes;
      if (preparent(nature)) {
        equipes = b.cases.map(a => (a.type === 'manuel' || a.type === 'robot') ? this.equipe(a, calc.get(a.id), classes)
          : `<div class="mu-carte">${this.at.carte(a, calc.get(a.id), { cmd: null })}</div>`).join('')
          + (b.cases.length ? '' : '<p class="mini-note mu-vide">Aucune équipe pour l’instant.</p>')
          + `<p class="mu-ajout"><button class="btn btn-play btn-sm" type="button" data-mu-action="equipe">+ Ajouter une équipe</button>
             <span class="mini-note">une équipe du matin, de l’après-midi, de nuit… chacune avec son heure, ses personnes et ce qu’elle prépare</span></p>`;
      } else {
        const phrase = nature === 'dispo' ? 'Il sert toutes les commandes à la fois : ni effectif, ni minutes. Dites quand il est ouvert, et qui en a besoin.'
          : nature === 'lavage' ? 'Elle lave les retours de tous les vols, à mesure qu’ils arrivent : rien à cocher. Réglez ses tunnels et ses horaires.'
          : 'Il charge chaque vol à son départ, pour toutes les commandes : rien à cocher. Réglez ses horaires et le temps par vol.';
        equipes = `<p class="mini-note">${esc(phrase)}</p>`
          + b.cases.map(a => `<div class="mu-carte">${this.at.carte(a, calc.get(a.id), { cmd: null })}</div>`).join('')
          + (b.cases.length ? '' : `<p class="mu-ajout"><button class="btn btn-play btn-sm" type="button" data-mu-action="equipe">+ ${nature === 'lavage' ? 'Ajouter une équipe de plonge' : nature === 'dispo' ? 'Mettre ce service en place' : 'Ajouter une équipe de chargement'}</button></p>`)
          + (nature === 'dispo' ? `<div class="mu-besoin"><h4>Quels flux en ont besoin ?</h4>${this.besoinFlux(s.id, classes)}</div>` : '');
      }

      const rg = this.a.rg ? this.a.rg() : null;
      const temps = nature === 'manuel' && rg
        ? etape(3, 'Minutes de travail pour un vol', rg.ficheTemps(s.id), 'pour une compagnie dans une classe : la durée se déduit des personnes de l’équipe')
        : nature === 'robot' ? etape(3, 'Débit du robot', '<p class="mini-note">Le débit (plateaux par heure) se règle dans la fiche de chaque équipe robot, plus haut : « Plus de réglages ».</p>') : '';

      return tete + lesFlux + blocChaine + aFaire
        + etape(1, 'Ce qu’il fait', choixNature)
        + etape(2, preparent(nature) ? 'Ses équipes, et ce que chacune prépare' : 'Ses horaires et ses réglages', equipes)
        + temps;
    }

    /** Une équipe qui prépare : son heure, ses personnes, et sa grille. */
    equipe(a, calc, classes) {
      const fin = calc && calc.fin != null ? P.hhmm(calc.fin) : null;
      const jours = [0, -1, -2, -3].map(j => `<option value="${j}"${j === (a.jour || 0) ? ' selected' : ''}>${j === 0 ? 'jour du vol' : 'la veille' + (j < -1 ? ' (J' + j + ')' : '')}</option>`).join('');
      // Ce qui la lie à une autre : une étape faite à la chaîne, une ligne robot partagée.
      const avec = a.type === 'manuel' && a.fusion && a.fusion !== a.service ? this.nom(a.fusion) : '';
      // Une équipe qui ne travaille que certains jours (règle ⚡).
      const cond = a.condition, etat = cond && this.at.etatCondition ? this.at.etatCondition(a) : null;
      const ligne = a.type === 'robot' && this.at.robotsDeLigne ? this.at.robotsDeLigne(a).filter(x => x !== a) : [];
      const badges = (avec ? `<span class="mu-badge chaine" title="Cette équipe fait aussi ${esc(avec)}, d’un bloc, pour ses commandes">⛓ + ${esc(avec)} à la chaîne</span>` : '')
        + (ligne.length ? `<span class="mu-badge ligne" title="Une seule ligne robot : ces équipes ne tournent pas en même temps">⇄ ligne partagée avec ${ligne.map(x => '« ' + esc(x.nom) + ' »').join(', ')}</span>` : '')
        + (cond ? `<span class="mu-badge cond${etat && !etat.remplie ? ' off' : ''}" title="Elle ne travaille que certains jours, selon le nombre de vols">⚡ si ${esc(cond.cie === '*' ? 'toutes compagnies' : cond.cie)} ≥ ${cond.seuil} ${cond.mesure === 'repas' ? 'repas' : 'vols'}${etat ? (etat.remplie ? ' · travaille aujourd’hui' : ' · pas aujourd’hui') : ''}</span>` : '');
      const fusion = a.type === 'manuel' && this.at.blocFusion ? this.at.blocFusion(a) : '';
      const ordre = a.lots.filter(l => l.length).map((l, i) => `<span class="mu-ordre-cmd"><b>${i + 1}</b>${l.map(c =>
        `<button type="button" data-mu-chemin="${esc(c)}" data-service="${esc(a.service)}" title="Voir le chemin de ${esc(PC.etiquette(c))}">${esc(PC.etiquette(c))}</button>`).join(' + ')}</span>`).join('');
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
        ${this.grille(a.service, a, classes)}
        ${this.questionHTML(a)}
        ${ordre ? `<p class="mu-ordre"><span>Dans l’ordre :</span>${ordre}<small>cliquez une commande pour voir son chemin</small></p>` : ''}
        ${fusion ? `<div class="mu-chaine-reglage">${fusion}</div>` : ''}
        ${this.at.blocCondition ? `<div class="mu-cond-reglage">${this.at.blocCondition(a)}</div>` : ''}
        <details class="mu-plus"${this.ouvertes && this.ouvertes.has(a.id) ? ' open' : ''} data-mu-plus="${esc(a.id)}"><summary>Plus de réglages : changer l’ordre, pauses, arrêts, minutes propres…</summary>
          ${this.at.carte(a, calc, { cmd: null, compact: true })}</details>
      </article>`;
    }

    /** La grille compagnies × classes d'une équipe (ou, sans équipe, de qui passe par le service). */
    grille(service, a, classes) {
      if (!classes.length) return '<p class="mini-note">Aucune commande : importez d’abord vos vols (Vols).</p>';
      const g = PC.grille(this.etat, service, a ? a.id : null, classes);
      const par = new Map(classes.map(c => [c.id, c]));
      const cies = [...new Set(classes.map(c => c.cie))].sort((x, y) => x.localeCompare(y));
      const cabs = P.CABINES.filter(c => classes.some(k => k.cabine === c));
      const coche = x => (a ? x.etat === 'ici' : x.etat === 'passe');
      const titre = (c, x) => {
        const lib = P.libelleClasse(c.id) + ' · ' + pl(c.vols.length, 'vol') + (Number.isFinite(c.echeance) ? ', prête avant ' + P.hhmm(c.echeance) : '');
        return lib + ' — ' + ({ ici: 'préparée par cette équipe', ailleurs: 'préparée par « ' + (x.par && x.par.nom) + ' » (cocher la déplace ici)',
          chaine: 'faite à la chaîne par « ' + (x.par && x.par.nom) + ' »', attendue: 'passe par ce service, personne ne la prépare encore',
          passe: 'en a besoin', hors: a ? 'ne passe pas par ce service' : 'n’en a pas besoin' })[x.etat];
      };
      const cellule = (cie, cab) => {
        const id = P.idClasse(cie, cab), c = par.get(id);
        if (!c) return '<td class="mu-rien" aria-hidden="true">·</td>';
        const x = g.get(id);
        const marque = x.etat === 'ailleurs' ? `<i class="mu-chez">${esc(initiales(x.par.nom))}</i>` : x.etat === 'chaine' ? '<i class="mu-chez">⛓</i>' : x.etat === 'attendue' ? '<i class="mu-chez">!</i>' : '';
        return `<td class="mu-c ${x.etat}"><label title="${esc(titre(c, x))}"><input type="checkbox" data-mu-cocher="${esc(id)}"${coche(x) ? ' checked' : ''}${x.etat === 'chaine' ? ' disabled' : ''}
          aria-label="${esc(titre(c, x))}">${marque}</label></td>`;
      };
      return `<div class="mu-grille-scroll"><table class="mu-grille"${a ? ` data-mu-equipe="${esc(a.id)}"` : ` data-mu-service="${esc(service)}"`}>
        <thead><tr><th scope="col"><span class="sr-only">Compagnie</span></th>${cabs.map(c => `<th scope="col"><button type="button" class="mu-tout" data-mu-col="${c}"
          title="Cocher ou décocher toute la colonne ${esc((P.NOM_CABINE || {})[c] || c)}"><span class="puce-classe" data-cab="${c}"></span>${c}</button></th>`).join('')}</tr></thead>
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
      out.push({ num: 4, titre: 'Chaque commande a quelqu’un pour la préparer', etat: absentes.length ? 'afaire' : 'ok',
        texte: absentes.length ? pl(absentes.length, 'commande n’est préparée', 'commandes ne sont préparées') + ' par aucune équipe : cochez-les dans l’équipe qui les prépare.'
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

    /** Ouvre le chemin d'une commande (Mon unité › Une commande), sur un service. */
    chemin(cmd, service) { if (this.a.chemin) this.a.chemin(cmd, service); }

    cocher(atelierId, cmds, oui) {
      const a = this.etat.ateliers.find(x => x.id === atelierId); if (!a) return;
      const noms = cmds.map(c => PC.etiquette(c)).join(', ');
      let r = { n: 0, horsFlux: [], orphelines: [] };
      this.question = null;
      this.at.changer(() => { r = PC.cocher(this.at.state, atelierId, cmds, oui, this.options()); },
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
        <div class="mu-q-gestes">${tout}${seul}<button class="btn btn-sm" type="button" data-mu-q="rien">${q.oui ? 'Ne rien changer' : 'Laisser : une autre équipe la prendra'}</button></div></div>`;
    }

    repondre(quoi) {
      const q = this.question; this.question = null;
      if (!q || quoi === 'rien') return this.rendreServices();
      const st = this.at.state, o = this.options(), svc = this.nom(q.service);
      if (quoi === 'flux') {
        const faits = new Set();
        this.at.changer(() => {
          for (const c of q.cmds) {
            const f = PC.fluxDe(st, c); if (!f) continue;
            if (!f.type) PC.adapter(st, [c], q.service, q.oui, o);
            else if (!faits.has(f.id)) { faits.add(f.id); PC.changerFlux(st, f.id, q.service, q.oui, o); }
          }
        }, svc + (q.oui ? ' entre dans ' : ' sort de ') + (faits.size > 1 ? 'ces flux.' : 'ce flux, pour toutes ses commandes.'));
      } else {
        this.at.changer(() => { PC.adapter(st, q.cmds, q.service, q.oui, o); },
          q.cmds.map(c => PC.etiquette(c)).join(', ') + (q.oui ? ' passe' : ' ne passe plus') + ' par ' + svc + ' : une variante de son flux.');
      }
    }

    /** Un service qui sert tout le monde : les flux qui passent par lui. */
    besoinFlux(service, classes) {
      const st = this.etat, types = PC.types(st);
      if (!types.length) return '<p class="mini-note">Aucun flux de production pour l’instant : dessinez-les dans Mon unité › Flux de production.</p>';
      return `<ul class="mu-besoins">${types.map(t => {
        const dedans = P.servicesDuParcours(t).includes(service), n = PC.commandesDuType(st, t.id, classes).length;
        return `<li><label class="chk"><input type="checkbox" data-mu-besoin="${esc(t.id)}" data-service="${esc(service)}"${dedans ? ' checked' : ''}>
          <b>${esc(t.nom)}</b> <small>${pl(n, 'commande')}</small></label></li>`;
      }).join('')}</ul>`;
    }

    passer(service, typeIds, oui) {
      this.at.changer(() => { PC.passerPar(this.at.state, service, typeIds, oui, this.options()); },
        this.nom(service) + (oui ? ' sert maintenant ' : ' ne sert plus ') + (typeIds.length > 1 ? 'ces flux.' : 'ce flux.'));
    }

    /* Toute une ligne (une compagnie) ou toute une colonne (une classe). */
    tout(table, cmds) {
      const g = PC.grille(this.etat, table.dataset.muService || this.etat.ateliers.find(x => x.id === table.dataset.muEquipe).service,
        table.dataset.muEquipe || null, this.at.classes);
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
      this.poser(box, regroupe + `<div class="mu-cadre">${liste}<div class="mu-fiche" data-mu-flux-fiche="${esc(t ? t.id : '')}">${t ? this.ficheFlux(t, classes) : '<p class="mini-note">Aucun flux de production : créez-en un (à gauche).</p>'}</div></div>`);
      const g = this.grapheFlux(); if (g && t) g.rendre();
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
        case 'retirer-service':
          this.fluxSel = null;
          return this.changerFlux(x => { PC.retirerService(x, el.dataset.service); }, this.nom(el.dataset.service) + ' sort du flux : ceux qui le livraient livrent ceux qu’il livrait.');
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
        else if (el.dataset.muNom) {
          const v = el.value.trim();
          if (!v) { this.a.notify('Le nom ne peut pas être vide.'); this.rendreServices(); return; }
          this.a.renommer(el.dataset.muNom, v); this.rendreServices();
        }
      });
      d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.muNom) { e.preventDefault(); e.target.blur(); } });
      d.addEventListener('toggle', e => {
        const t = e.target; if (!t.dataset || !t.dataset.muPlus) return;
        this.ouvertes = this.ouvertes || new Set();
        if (t.open) this.ouvertes.add(t.dataset.muPlus); else this.ouvertes.delete(t.dataset.muPlus);
      }, true);
      d.addEventListener('submit', e => {
        const f = e.target.closest && e.target.closest('[data-mu-nouveau]'); if (!f) return;
        e.preventDefault();
        const nom = f.elements.nom.value.trim(); if (!nom) return;
        if (this.a.services().some(x => x.nom.toLowerCase() === nom.toLowerCase())) { this.a.notify('« ' + nom + ' » existe déjà.'); return; }
        const id = this.a.creer(nom, f.elements.parent.value);
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
    'handling-bloque', 'handling-poste', 'handling-retard', 'handling-chauffeurs', 'sans-personne', 'robot-arret', 'plonge-arret',
    'hors-parcours', 'doublon']);
  const initiales = nom => String(nom || '').split(/\s+/).filter(Boolean).map(m => m[0]).join('').slice(0, 3).toUpperCase();

  root.OrlyUnite = { NATURES, MonUnite };
})(typeof window !== 'undefined' ? window : globalThis);
