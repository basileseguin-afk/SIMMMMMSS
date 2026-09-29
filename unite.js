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
      try { this.choisi = localStorage.getItem(CLE) || null; } catch (e) { this.choisi = null; }
      this.lier();
    }

    get at() { return this.a.at(); }
    get etat() { return this.at.state; }
    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }
    options() { return { classes: this.at.classes, liaisons: this.a.liaisons ? this.a.liaisons() : [], parent: this.a.parent }; }

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
      const groupe = (titre, liste) => liste.length ? `<p class="mu-groupe">${esc(titre)}</p>` + liste.map(s => {
        const b = bilans.get(s.id), n = b.cases.length;
        const sous = b.etat === 'libre' ? 'pas utilisé'
          : (NATURES.find(x => x.id === b.nature) || {}).court + (n ? ' · ' + pl(n, 'équipe') : '') + (b.passent && preparent(b.nature) ? ' · ' + pl(b.passent, 'commande') : '');
        return `<button type="button" class="mu-svc ${b.etat}${s.id === this.choisi ? ' actif' : ''}" data-mu-choisir="${esc(s.id)}" aria-current="${s.id === this.choisi}">
          <span class="mu-svc-ico" aria-hidden="true">${ico(s)}</span><span class="mu-svc-txt"><b>${esc(s.nom)}</b><small>${esc(sous)}</small></span>
          <span class="mu-point ${b.etat}" title="${b.etat === 'afaire' ? esc(b.points.join(' · ')) : b.etat === 'ok' ? 'Complet' : 'Pas utilisé'}" aria-hidden="true"></span></button>`;
      }).join('') : '';
      const utilises = services.filter(s => bilans.get(s.id).etat !== 'libre'), libres = services.filter(s => bilans.get(s.id).etat === 'libre');
      const liste = `<nav class="mu-liste" aria-label="Les services">
        ${groupe('Utilisés', utilises)}${groupe('Pas utilisés', libres)}
        <form class="mu-nouveau" data-mu-nouveau><b>Nouveau service</b>
          <label>Nom <input name="nom" maxlength="120" placeholder="ex. Atelier APM" required></label>
          <label>Sur le plan, près de <select name="parent">${this.a.racines().map(x => `<option value="${esc(x.id)}">${esc(x.nom)}</option>`).join('')}</select></label>
          <button class="btn btn-sm btn-play" type="submit">+ Créer</button></form>
        <p class="mu-avance"><button type="button" class="lien-discret" data-page="at-chemins">Outils avancés : chemins, cases, liens →</button></p>
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
      const aFaire = b.points.length ? `<ul class="mu-afaire">${b.points.map(p => `<li>${esc(P.enClair ? P.enClair(p) : p)}</li>`).join('')}</ul>` : '';
      const etape = (num, titre, corps, note) => `<section class="mu-etape"><h3><span class="mu-num">${num}</span>${esc(titre)}${note ? `<small>${note}</small>` : ''}</h3>${corps}</section>`;

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
          + (nature === 'dispo' ? `<div class="mu-besoin"><h4>Qui en a besoin ?</h4>${this.grille(s.id, null, classes)}</div>` : '');
      }

      const rg = this.a.rg ? this.a.rg() : null;
      const temps = nature === 'manuel' && rg
        ? etape(3, 'Minutes de travail pour un vol', rg.ficheTemps(s.id), 'pour une compagnie dans une classe : la durée se déduit des personnes de l’équipe')
        : nature === 'robot' ? etape(3, 'Débit du robot', '<p class="mini-note">Le débit (plateaux par heure) se règle dans la fiche de chaque équipe robot, plus haut : « Plus de réglages ».</p>') : '';

      return tete + aFaire
        + etape(1, 'Ce qu’il fait', choixNature)
        + etape(2, preparent(nature) ? 'Ses équipes, et ce que chacune prépare' : 'Ses horaires et ses réglages', equipes)
        + temps;
    }

    /** Une équipe qui prépare : son heure, ses personnes, et sa grille. */
    equipe(a, calc, classes) {
      const fin = calc && calc.fin != null ? P.hhmm(calc.fin) : null;
      const jours = [0, -1, -2, -3].map(j => `<option value="${j}"${j === (a.jour || 0) ? ' selected' : ''}>${j === 0 ? 'jour du vol' : 'la veille' + (j < -1 ? ' (J' + j + ')' : '')}</option>`).join('');
      const ordre = a.lots.filter(l => l.length).map((l, i) => `<span class="mu-ordre-cmd"><b>${i + 1}</b>${l.map(c => esc(PC.etiquette(c))).join(' + ')}</span>`).join('');
      return `<article class="mu-equipe" data-at="${esc(a.id)}">
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
        ${ordre ? `<p class="mu-ordre"><span>Dans l’ordre :</span>${ordre}</p>` : ''}
        <details class="mu-plus"${this.ouvertes && this.ouvertes.has(a.id) ? ' open' : ''} data-mu-plus="${esc(a.id)}"><summary>Plus de réglages : changer l’ordre, pauses, arrêts, minutes propres, à la chaîne…</summary>
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
      out.push({ num: 2, titre: 'Vos services et leurs équipes', etat: !utilises.length ? 'afaire' : utilises.some(x => x.b.etat === 'afaire') ? 'afaire' : 'ok',
        texte: !utilises.length ? 'Aucun service n’a d’équipe : ouvrez un service, dites ce qu’il fait, ajoutez ses équipes.'
          : pl(utilises.length, 'service utilisé', 'services utilisés') + ', ' + pl(utilises.reduce((n, x) => n + x.b.cases.length, 0), 'équipe'),
        services: utilises.map(x => ({ id: x.s.id, nom: x.s.nom, etat: x.b.etat, points: x.b.points })),
        geste: { page: 'mu-services', texte: 'Ouvrir les services' } });
      out.push({ num: 3, titre: 'Chaque commande a quelqu’un pour la préparer', etat: absentes.length ? 'afaire' : 'ok',
        texte: absentes.length ? pl(absentes.length, 'commande n’est préparée', 'commandes ne sont préparées') + ' par aucune équipe : cochez-les dans l’équipe qui les prépare.'
          : 'Toutes les commandes sont préparées.',
        commandes: absentes.slice(0, 16).map(id => PC.etiquette(id)).concat(absentes.length > 16 ? ['+ ' + (absentes.length - 16)] : []),
        geste: absentes.length ? { page: 'mu-services', texte: 'Cocher dans un service' } : null });
      if (corriger.length) out.push({ num: 4, titre: 'Autres points à corriger', etat: 'afaire',
        texte: corriger.slice(0, 6).map(x => P.enClair ? P.enClair(x.message || x.code) : x.message).join(' · '),
        geste: { page: 'at-chemins', texte: 'Outils avancés' } });
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
      this.poser(box, `<ol class="mu-pas-liste">${l.map(e => `<li class="mu-pas-etape ${e.etat}">
        <span class="mu-pas-num" aria-hidden="true">${e.etat === 'ok' ? '✓' : e.num}</span>
        <div class="mu-pas-corps"><h3>${esc(e.titre)} <span class="mu-pas-etat ${e.etat}">${mots[e.etat]}</span></h3>
          <p>${esc(e.texte)}</p>
          ${e.commandes && e.commandes.length ? `<ul class="mu-pas-cmds">${e.commandes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
          ${e.services ? `<ul class="mu-pas-services">${e.services.map(x => `<li class="${x.etat}"><button type="button" class="lien-discret" data-mu-ouvrir="${esc(x.id)}">${esc(x.nom)}</button>
            <span>${x.points.length ? esc(x.points.map(p => P.enClair ? P.enClair(p) : p).join(' · ')) : 'complet'}</span></li>`).join('')}</ul>` : ''}
          ${e.geste ? `<button type="button" class="btn btn-sm${e.etat === 'afaire' ? ' btn-play' : ''}" data-page="${e.geste.page}">${esc(e.geste.texte)} →</button>` : ''}</div></li>`).join('')}</ol>`);
    }

    /** Le nombre de points à faire, pour le badge de l'onglet. */
    aFaire() { return this.etapes().filter(e => e.etat === 'afaire').length; }

    /* ---- gestes ----------------------------------------------------------- */

    ouvrir(id) {
      this.choisi = id;
      try { localStorage.setItem(CLE, id); } catch (e) { /* stockage indisponible */ }
      if (this.page() !== 'mu-services') this.a.page('mu-services'); else this.rendreServices();
      const f = root.document.querySelector('.mu-fiche'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
    }

    cocher(atelierId, cmds, oui) {
      const a = this.etat.ateliers.find(x => x.id === atelierId); if (!a) return;
      const noms = cmds.map(c => PC.etiquette(c)).join(', ');
      let n = 0;
      this.at.changer(() => { n = PC.cocher(this.at.state, atelierId, cmds, oui, this.options()); },
        oui ? '« ' + a.nom + ' » prépare ' + noms + '.' : '« ' + a.nom + ' » ne prépare plus ' + noms + '.');
      return n;
    }

    passer(service, cmds, oui) {
      this.at.changer(() => { PC.passerPar(this.at.state, service, cmds, oui, this.options()); },
        cmds.map(c => PC.etiquette(c)).join(', ') + (oui ? ' passe' + (cmds.length > 1 ? 'nt' : '') + ' par ' : ' ne passe' + (cmds.length > 1 ? 'nt' : '') + ' plus par ') + this.nom(service) + '.');
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
      } else {
        const non = cmds.filter(c => g.get(c).etat !== 'passe');
        this.passer(table.dataset.muService, non.length ? non : cmds, !!non.length);
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

    lier() {
      const d = root.document;
      d.addEventListener('change', e => {
        const el = e.target;
        if (!el.closest || !el.closest('#mu-services')) return;
        if (el.dataset.muCocher) {
          const t = el.closest('table');
          if (t.dataset.muEquipe) this.cocher(t.dataset.muEquipe, [el.dataset.muCocher], el.checked);
          else this.passer(t.dataset.muService, [el.dataset.muCocher], el.checked);
        } else if (el.dataset.muNature) this.nature(el.dataset.muNature, el.value);
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
        const t = e.target.closest && e.target.closest('[data-mu-choisir], [data-mu-ouvrir], [data-mu-action], [data-mu-ligne], [data-mu-col]');
        if (!t) return;
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
