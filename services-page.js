/* « Services et équipes » : six pages en une (version 1, évolution 22 b).
 *
 * Une chose se règle à un seul endroit. Cette page reprend « Services et
 * équipes », « Horaires des équipes », « Équipes une par une », « Temps par
 * vol », « Temps par vol par service » et « Liste des services ».
 *
 *   à gauche   la liste des services, de l'amont vers l'aval, avec pour chacun
 *              son nombre d'équipes ou « toujours ouvert » ; en tête, « Ajouter
 *              un service » ; en bas, les services supprimés ;
 *   à droite   la fiche du service choisi — son nom et ce qu'il fait, « Ses
 *              équipes » (un tableau), « Ses temps par vol » (ou ses minutes par
 *              compagnie, ses débits, ses durées de lavage : ce qui joue pour
 *              lui), « Réglages avancés », repliés ;
 *              ou la fiche d'une équipe, ouverte d'un clic sur sa ligne, avec
 *              tous ses réglages et un retour au service.
 *
 * Plus aucun résultat ici : ni heure de fin, ni attente, ni charge, ni effectif
 * calculé. « Voir ce service dans les résultats » y mène.
 *
 * Rien n'est réécrit : les éditeurs sont ceux de unite.js (commun avec la
 * version 2, que ce module ne modifie pas) et de ateliers.js. La page hérite
 * de `MonUnite` ; elle demande la fiche d'avant, sans les résultats, et en
 * range les morceaux autrement. Les champs gardent leurs attributs : les
 * mêmes gestes écrivent les mêmes données.
 */
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pl = (n, mot, pluriel) => n + ' ' + (n > 1 ? (pluriel || mot + 's') : mot);
  const jourLu = j => (!j ? 'J' : 'J' + (j > 0 ? '+' : '') + j);
  /** Au plus `max` commandes écrites, puis leur nombre. */
  const quelques = (noms, max = 3) => noms.slice(0, max).join(', ') + (noms.length > max ? '… (' + noms.length + ')' : '');

  /** Quand une mise à disposition sert : toujours, à ses heures, ou par vagues. */
  function ouvertureLue(a) {
    if (a.permanent === false) return pl((a.vagues || []).length, 'vague');
    return a.ouverture ? 'de ' + a.ouverture.de + ' à ' + a.ouverture.a : 'toujours ouvert';
  }

  /**
   * Une équipe, telle que la lit le tableau « Ses équipes » : ce qu'on a réglé, jamais un résultat.
   * @param {object} a l'équipe (une case de l'état)
   * @param {{calcule?: boolean, etiquette?: (c: string) => string}} o `calcule` : son effectif se calcule (d'après ses
   *   temps par vol et les vols) — le tableau le dit, sans donner de nombre ; `etiquette` : le nom d'une commande.
   * @returns {{nom: string, debut: string, jour: string, personnes: string, prepare: string}}
   */
  function resumeEquipe(a, o = {}) {
    const etiquette = o.etiquette || (c => String(c));
    const cmds = [...new Set((a.lots || []).flat())];
    const pers = n => (+n || 0) + ' pers.';
    if (a.type === 'dispo') return { nom: a.nom, debut: ouvertureLue(a), jour: 'chaque jour',
      personnes: +a.personnes > 0 ? pers(a.personnes) + ' sur la journée' : '—', prepare: 'sert toutes les commandes' };
    const base = { nom: a.nom, debut: a.debut || '—', jour: jourLu(a.jour) };
    if (a.type === 'lavage') return { ...base, jour: jourLu(a.jour) + ' de l’arrivée', personnes: pers(a.personnes), prepare: a.parVol ? 'lave les retours, vol par vol' : 'lave les retours, au débit' };
    if (a.type === 'handling') return { ...base, jour: 'J', personnes: (a.creneaux || []).length ? 'par camion' : pers(a.personnes), prepare: 'charge les vols, dans l’ordre des départs' };
    if (a.type === 'appui') return { ...base, personnes: o.calcule ? 'calculé' : pers(a.personnes), prepare: 'hors tunnel : présente à ses heures' };
    if (a.parCompagnie) { const cies = a.compagnies || [];
      return { ...base, personnes: pers(a.personnes), prepare: cies.length ? quelques(cies.map(String), 6) : 'aucune compagnie pour l’instant' }; }
    return { ...base, personnes: o.calcule ? 'calculé' : pers(a.personnes),
      prepare: cmds.length ? quelques(cmds.map(etiquette)) : 'rien pour l’instant' };
  }

  /**
   * Ce que la liste dit d'un service : son nombre d'équipes, ou « toujours ouvert » pour une mise à disposition.
   * @param {string} nature la nature du service (`dispo`, `manuel`, `lavage`…)
   * @param {object[]} cases ses équipes
   */
  function sousTitre(nature, cases) {
    const l = cases || [];
    if (nature === 'dispo' && l.length) return l.length === 1 ? ouvertureLue(l[0]) : pl(l.length, 'équipe');
    return l.length ? pl(l.length, 'équipe') : 'aucune équipe';
  }

  /** Le titre de la section des temps, selon ce que fait le service. */
  const TITRES_TEMPS = { manuel: 'Ses temps par vol', categories: 'Ses minutes par compagnie', robot: 'Ses temps par vol et ses débits',
    lavage: 'Ses durées de lavage', handling: 'Son temps par vol' };

  /** Les noms qu'une ligne écrit, puis « et n autres » ; les lignes de l'encart, avant « et n autres ». */
  const NOMS = 4;
  const nommer = noms => (noms.length > NOMS ? noms.slice(0, NOMS).join(', ') + ' et ' + pl(noms.length - NOMS, 'autre')
    : noms.length > 1 ? noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1] : (noms[0] || ''));

  /**
   * Les lignes de l'encart « à compléter » d'un service (correction 23 c) : une par point du bilan, comme avant, mais
   * chacune nomme les commandes ou les compagnies en cause (quatre au plus, puis « et n autres »), et dit où cela se règle.
   * Les points sont ceux du bilan (unite.js, commun avec la version 2, non modifié), dans le même ordre ; un point que la
   * page ne sait pas détailler garde son texte, sans geste.
   * @param {{points:string[], attendues?:string[], vides?:object[], cases?:object[]}} b  le bilan du service
   * @param {{libelle?:Function, enClair?:Function, passent?:string[], sansTemps?:string[], compagniesSansTemps?:string[]}} o
   *   libelle(id) — le nom d'une commande ; passent — les commandes qui passent par un service sans équipe ; sansTemps —
   *   celles dont le temps par vol manque ; compagniesSansTemps — les compagnies sans heures par vol (un service par compagnie).
   * @returns {Array<{texte:string, noms?:Array<{nom:string, geste:object}>, geste?:object}>}
   *   noms  — chaque nom se clique, et mène à son endroit ; geste — toute la ligne se clique.
   *   Un geste : {genre, texte?, equipe?, commande?, compagnie?} — `cocher` (la case de la commande, dans la fiche de
   *   l'équipe), `equipe` (la fiche de l'équipe), `ajouter` (« Ajouter une équipe »), `temps` (le champ du temps par vol).
   */
  function lignesACompleter(b, o = {}) {
    const lib = o.libelle || String, clair = o.enClair || (t => t), out = [];
    const cochent = (b.cases || []).filter(a => !a.type || a.type === 'manuel' || a.type === 'robot');
    // Plusieurs équipes : la case s'ouvre dans celle qui prépare déjà le plus de commandes de la même compagnie ; à
    // défaut, dans la première.
    const cieDe = id => String(id).split('/')[0];
    const equipeDe = id => cochent.reduce((m, a) => {
      const n = (a.lots || []).flat().filter(c => cieDe(c) === cieDe(id)).length;
      return n > m.n ? { n, a } : m;
    }, { n: 0, a: cochent[0] }).a;
    // Quatre noms au plus ; le suivant dit combien il en reste, et mène au premier d'entre eux.
    const nommes = (ids, geste) => ids.slice(0, NOMS).map(id => ({ nom: lib(id), geste: geste(id) }))
      .concat(ids.length > NOMS ? [{ nom: 'et ' + pl(ids.length - NOMS, 'autre'), geste: geste(ids[NOMS]) }] : []);
    for (const p of b.points || []) {
      const attendues = /à cocher dans une équipe$/.test(p) ? (b.attendues || []) : [];
      if (attendues.length && cochent.length)
        out.push({ texte: cochent.length === 1 ? 'À cocher dans « ' + cochent[0].nom + ' »' : 'À cocher dans une équipe',
          noms: nommes(attendues, id => ({ genre: 'cocher', equipe: equipeDe(id).id, commande: id, texte: equipeDe(id).nom })) });
      // Aucune équipe d'ici ne prépare de commande (une équipe hors tunnel, une mise à disposition) : il en faut une.
      else if (attendues.length)
        out.push({ texte: nommer(attendues.map(lib)) + ' : à cocher dans une équipe, et aucune d’ici ne prépare de commande', geste: { texte: 'Ajouter une équipe', genre: 'ajouter' } });
      else if (/ne prépar(e|ent) rien$/.test(p) && (b.vides || []).length)
        for (const a of b.vides) out.push({ texte: '« ' + a.nom + ' » ne prépare rien', geste: { texte: 'Cocher ses commandes', genre: 'equipe', equipe: a.id } });
      else if (/par ici, sans équipe$/.test(p) && (o.passent || []).length)
        out.push({ texte: nommer(o.passent.map(lib)) + (o.passent.length > 1 ? ' passent' : ' passe') + ' par ici, sans équipe', geste: { texte: 'Ajouter une équipe', genre: 'ajouter' } });
      else if (/^(temps par vol|heures de travail) à remplir$/.test(p))
        out.push((o.sansTemps || []).length ? { texte: 'Temps par vol à remplir', noms: nommes(o.sansTemps, id => ({ genre: 'temps', commande: id })) }
          : { texte: clair(p), geste: { texte: 'Remplir', genre: 'temps' } });
      else if (p === 'heures par vol à remplir' && (o.compagniesSansTemps || []).length)
        out.push({ texte: 'Heures par vol à remplir', noms: nommes(o.compagniesSansTemps, cie => ({ genre: 'temps', compagnie: cie })) });
      else out.push({ texte: clair(p) });
    }
    return out;
  }

  const api = { resumeEquipe, sousTitre, ouvertureLue, TITRES_TEMPS, lignesACompleter };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  const U = root.OrlyUnite;
  if (!U || !U.MonUnite) { root.OrlyServicesPage = api; return; }
  const PC = root.OrlyParcours;
  const I = () => root.OrlyIcones;
  const pic = (nom, classe) => (I() ? I().ico(nom, classe) : '');

  class PageServices extends U.MonUnite {
    /* `a` : l'adaptateur de `MonUnite`, plus
     *   resultats(id)   — ouvrir les résultats sur ce service
     *   rattachement(id)— le choix « rattaché à » d'un service ajouté au plan (du HTML), ou ''
     *   supprimes()     — { n, html } : les services supprimés et les zones du plan qui n'en sont pas
     *   jouent()        — OrlyJouent (ce qui joue pour un service), s'il est chargé */
    constructor(a) {
      super(a);
      this.equipeOuverte = null;   // l'équipe dont la fiche est ouverte, à la place de celle du service
      this.panneau = null;         // 'supprimes' : les services supprimés, à la place de la fiche
      this.ajout = false;          // « Ajouter un service », déplié
      this.lierPage();
    }

    /** Les équipes d'un service, et celles d'un autre service qui le font aussi, à la chaîne. */
    equipesDe(id) {
      const st = this.etat;
      return { siennes: (st.ateliers || []).filter(a => a.service === id),
        chainees: (st.ateliers || []).filter(a => a.type === 'manuel' && a.fusion === id && a.service !== id) };
    }

    /** Choisir un service : sa fiche, pas celle d'une équipe. */
    ouvrir(id) { this.equipeOuverte = null; this.panneau = null; super.ouvrir(id); }

    /**
     * Ouvrir la fiche d'une équipe, dans son service — ou dans le service `depuis` qu'elle fait aussi, à la chaîne :
     * elle s'y règle de la même façon. `null` : revenir à la fiche du service.
     */
    ouvrirEquipe(id, depuis) {
      const a = id && (this.etat.ateliers || []).find(x => x.id === id);
      this.panneau = null;
      if (a) { this.equipeOuverte = a.id; super.ouvrir(depuis && depuis === a.fusion ? depuis : a.service); }
      else { this.equipeOuverte = null; this.rendreServices(); }
      const f = root.document.querySelector('#mu-services .mu-fiche'); if (f) f.scrollTop = 0;
      return !!a;
    }

    /**
     * Arriver par le nom ou le lien d'une page d'avant (évolution 22 b), au bon endroit : `liste` — la liste des
     * services (« Liste des services ») ; `equipes` — la section « Ses équipes » du service choisi (« Horaires des
     * équipes », « Équipes une par une ») ; `temps` — celle de ses temps par vol (« Temps par vol », « Temps par vol par
     * service »), dépliée ; `supprimes` — les services supprimés et les zones du plan, au bas de la liste. La fiche d'une
     * équipe se referme : on arrive sur le service.
     */
    allerA(lieu) {
      // « Temps par vol » (l'ancienne page, correction 23 g) : l'entrée « Tous les temps par vol », le clavier sur sa recherche.
      if (lieu === 'tous' && this.tousLesTemps()) {
        this.equipeOuverte = null; this.panneau = 'temps';
        this.rendreServices();
        const cherche = root.document.querySelector('#mu-services #rg-recap-filtre');
        if (cherche) cherche.focus({ preventScroll: true });
        return;
      }
      if (lieu === 'tous') lieu = 'temps';
      this.equipeOuverte = null; this.panneau = lieu === 'supprimes' ? 'supprimes' : null;
      if (lieu === 'equipes' || lieu === 'temps') this.sections.set(lieu, true);
      this.rendreServices();
      const box = root.document.getElementById('mu-services'); if (!box) return;
      const section = () => box.querySelector(`.se-fiche details[data-mu-section="${lieu}"] > summary`);
      // Le service choisi n'a pas cette section (une mise à disposition n'a pas de temps par vol) : le premier de la
      // liste qui l'a, de l'amont vers l'aval.
      if ((lieu === 'equipes' || lieu === 'temps') && !section()) {
        const ids = [...box.querySelectorAll('.se-liste [data-mu-choisir]')].map(x => x.dataset.muChoisir);
        const depart = this.choisi;
        if (!ids.some(id => { super.ouvrir(id); return !!section(); }) && depart) super.ouvrir(depart);
      }
      const cible = lieu === 'supprimes' ? box.querySelector('.se-vers-supprimes')
        : lieu === 'liste' ? box.querySelector('.se-liste .mu-svc.actif') || box.querySelector('.se-liste .mu-svc[data-mu-choisir]')
        : section();
      if (!cible) return;
      cible.scrollIntoView({ block: 'nearest' });
      cible.focus({ preventScroll: true });
    }

    /**
     * Une équipe de plus : sa fiche s'ouvre, pour lui donner son heure, ses personnes et ce qu'elle prépare. Le curseur
     * va dans son premier champ ; pour une équipe de plonge en plus (elle lave comme la première, à ses heures), dans
     * son heure : c'est ce qu'on règle, comme avant.
     */
    ajouterEquipe(service) {
      const avant = new Set((this.etat.ateliers || []).map(a => a.id));
      const releve = (this.etat.ateliers || []).some(a => a.service === service && a.type === 'lavage');
      super.ajouterEquipe(service);
      const neuve = (this.etat.ateliers || []).find(a => !avant.has(a.id));
      if (!neuve) return;
      this.ouvrirEquipe(neuve.id);
      const fiche = root.document.querySelector(`#mu-services [data-at="${CSS.escape(neuve.id)}"]`);
      const heure = releve && neuve.type === 'lavage' && fiche ? fiche.querySelector('[data-at-champ="debut"]') : null;
      const el = heure || (fiche && fiche.querySelector('input'));
      if (!el) return;
      el.focus({ preventScroll: true });
      if (heure && el.select) el.select();
    }

    /* ---- les fournisseurs (évolution 24 a) : leurs clients se règlent dans « Chemins › Fournisseurs » ----------- */

    /** De quoi nommer les services et dire leur nature, pour fournisseurs.js. La nature choisie d'un service encore
     *  sans équipe compte, comme dans sa fiche. */
    optionsFournisseurs() {
      const st = this.etat, sans = id => !(st.ateliers || []).some(a => a.service === id);
      return { services: this.a.services().map(s => s.id), nom: id => this.nom(id),
        nature: id => (this.natures[id] && sans(id) ? this.natures[id] : PC.natureService(st, id, this.nom(id))) };
    }

    /** Ce service est-il un fournisseur ? Sans fournisseurs.js (la page d'avant), aucun ne l'est. */
    estFournisseur(s) { const F = root.OrlyFournisseurs; return !!F && F.estFournisseur(this.etat, s, this.optionsFournisseurs()); }

    /* ---- l'encart « Lié au handling » d'un service par compagnie (correction 23 e) --------------------------------- */

    /**
     * La phrase dit le service par son nom : « son armement » ne veut rien dire pour un service par compagnie qui ne
     * s'appelle pas « Armement ». Les liens d'un chemin se règlent dans « Chemins » : chaque chemin à reprendre est un
     * lien qui l'y ouvre, ce service choisi, et plus aucun bouton n'écrit de lien d'ici (« Le relier au seul handling »,
     * « L'ajouter à tous les chemins, relié au handling »). Remplace celui de unite.js, commun avec la version 2, non modifié.
     */
    lienHandling(s) {
      const st = this.etat, nom = esc(s.nom), handlings = (st.ateliers || []).filter(a => a.type === 'handling');
      // Seulement les chemins que suivent les commandes et qui passent par lui ; un lien vers un handling suffit.
      const aReprendre = handlings.length ? PC.armementACorriger(st, [s.id], this.handlings(st), this.at.classes) : [];
      const suivis = new Set((this.at.classes || []).map(c => (PC.fluxDe(st, c) || {}).id).filter(Boolean));
      const dans = (st.parcours || []).some(p => suivis.has(p.id) && (p.noeuds || []).includes(s.id));
      const chemin = x => `<button type="button" class="lien-discret mu-arm-chemin" data-mu-arm-chemin="${esc(x.parcours.id)}" data-service="${esc(s.id)}"
          title="Ouvrir ce chemin dans « Chemins », sur ${nom}">« ${esc(x.parcours.nom || x.parcours.id)} »</button> (${
        x.raison === 'autres' ? 'relié aussi à ' + x.avec.map(id => esc(this.nom(id))).join(', ') : 'pas relié au handling'})`;
      const ou = !handlings.length ? ''
        : aReprendre.length ? `<p class="mini-note mu-arm-reprendre">À reprendre dans ${aReprendre.length > 1 ? 'ces chemins' : 'ce chemin'} : ${aReprendre.map(chemin).join(', ')}.
          Dans un chemin, ${nom} se relie au handling, et à lui seul : cela se règle dans « Chemins ».</p>`
        : dans ? `<p class="mini-note mu-arm-ok">${pic('check', 'ico-texte')} Dans chaque chemin qui passe par lui, en branche à part, relié seulement au handling.</p>`
        : `<p class="mini-note mu-arm-aucun">Aucun chemin ne passe encore par ${nom} : ajoutez-le comme étape dans
          <button type="button" class="lien-discret" data-page="mu-flux">Chemins →</button>, relié au handling.</p>`;
      return `<div class="mu-lien-handling"><p><span aria-hidden="true">🚚</span> <b>Lié au handling.</b> ${handlings.length
        ? `Le handling attend ${nom} avant de charger un vol, pour les compagnies qui passent par lui : celles dont un chemin passe par ce service, ou qu’une de ses équipes a cochées. Il charge les autres sans l’attendre.`
        : `Pas encore de handling dans l’unité : créez-en un, puis reliez-lui ${nom} dans « Chemins ».`}</p>
        ${ou}</div>`;
    }

    /* ---- l'encart « à compléter » et l'endroit exact où un point se règle (correction 23 c) ------------------------ */

    /** L'encart « à compléter » d'un service : une ligne par point, qui nomme les commandes ou les compagnies en cause ; chaque nom se clique. */
    encartACompleter(s, b, classes, motAjout) {
      const P = root.MoteurProduction, rg = this.a.rg ? this.a.rg() : null;
      const parCie = b.nature === 'categories', siennes = parCie ? (this.at.classesDe(s.id) || []) : classes;
      // Une commande d'un service par compagnie (« NORD/@… ») se dit par sa compagnie.
      const lib = id => { const t = String(id); return !t.includes('/') ? t : t.includes('/@') ? t.slice(0, t.indexOf('/')) : P.libelleClasse(t); };
      // Sans équipe : les commandes qui passent par ici (la grille du service, comme pour son bilan).
      const grille = !b.cases.length && b.passent ? PC.grille(this.etat, s.id, '-', siennes) : null;
      const bloc = b.sansTemps && rg ? rg.blocService({ id: s.id, nom: s.nom }) : null;
      const lignes = lignesACompleter(b, { libelle: lib, enClair: P.enClair,
        passent: grille ? siennes.filter(c => grille.get(c.id).etat !== 'hors').map(c => c.id) : [],
        sansTemps: bloc ? bloc.manquent.map(c => c.id) : [],
        compagniesSansTemps: parCie ? siennes.filter(c => c.minutes == null).map(c => c.cie) : [] });
      const attrs = g => ['genre', 'equipe', 'commande', 'compagnie'].filter(k => g[k]).map(k => `data-se-${k === 'genre' ? 'viser' : k}="${esc(g[k])}"`).join(' ');
      // Ce qu'un nom ouvre, dit au survol : l'équipe où le cocher, ou son champ.
      const ou = (n, g) => (g.genre === 'cocher' ? 'Ouvrir « ' + g.texte + ' », pour y cocher ' + n : 'Ouvrir le champ de ' + n);
      const ligne = l => (l.noms
        // Chaque nom se clique : il ouvre son endroit exact.
        ? `<li><span class="se-afaire-dit">${esc(l.texte)} :</span>${l.noms.map(x => ` <button type="button" class="se-afaire-nom" ${attrs(x.geste)} title="${esc(ou(x.nom, x.geste))}">${esc(x.nom)} →</button>`).join('')}</li>`
        // Un seul endroit : toute la ligne se clique. Le geste qui ajoute une équipe porte le nom du bouton de la fiche.
        : l.geste ? `<li><button type="button" class="se-afaire-ligne" ${attrs(l.geste)}><span>${esc(l.texte)}</span>
            <span class="se-afaire-vers">${esc(l.geste.genre === 'ajouter' && motAjout ? motAjout : l.geste.texte)} →</span></button></li>`
        : `<li>${esc(l.texte)}</li>`);
      return `<ul class="mu-afaire se-afaire">${lignes.map(ligne).join('')}</ul>`;
    }

    /** Le champ du temps par vol d'une commande (ou d'une compagnie, pour un service par compagnie), dans la fiche. */
    champDuTemps(fiche, c) {
      const P = root.MoteurProduction, un = sel => fiche.querySelector('[data-mu-section="temps"] ' + sel);
      if (c.compagnie) return un(`input[data-mu-cat-min][data-cie="${CSS.escape(c.compagnie)}"]`) || un('input[data-mu-cat-min]');
      const i = c.commande ? String(c.commande).lastIndexOf('/') : -1;
      const cle = (cie, cab) => `input[data-rg-champ="heures"][data-cle="${CSS.escape(P.cleBareme(cie, cab))}"]`;
      return (i > 0 && (un(cle(c.commande.slice(0, i), c.commande.slice(i + 1))) || un(cle(P.TOUTES, c.commande.slice(i + 1)))))
        || un('input.rg-manque') || un('input:not(:disabled)') || fiche.querySelector('details[data-mu-section="temps"] > summary');
    }

    /**
     * Mener à l'endroit exact où un point se règle, le mettre en évidence et y poser le clavier :
     *   cocher  — la case de la commande, dans la fiche de l'équipe ;
     *   equipe  — la fiche de l'équipe : son champ `champ`, sinon sa première case à cocher, sinon son premier champ ;
     *   ajouter — « Ajouter une équipe », dans « Ses équipes » ;
     *   temps   — le champ du temps par vol de la commande, ou de la compagnie ;
     *   service — la fiche du service : la première ligne de son encart « à compléter », sinon « Ses équipes ».
     * @param {{genre:string, service?:string, equipe?:string, commande?:string, compagnie?:string, champ?:string}} c
     * @returns {Element|null} l'élément qui a le clavier
     */
    viser(c) {
      const box = root.document.getElementById('mu-services'); if (!box || !c) return null;
      let el = null;
      if (c.genre === 'cocher' || c.genre === 'equipe') {
        if (!this.ouvrirEquipe(c.equipe, c.service || this.choisi)) return null;
        const f = box.querySelector(`.se-equipe [data-at="${CSS.escape(c.equipe)}"]`); if (!f) return null;
        el = (c.commande && f.querySelector(`input[data-mu-cocher="${CSS.escape(c.commande)}"]:not(:disabled)`))
          || (c.champ && f.querySelector(`[data-at-champ="${CSS.escape(c.champ)}"]:not(:disabled)`))
          || (c.genre === 'equipe' && !c.champ && f.querySelector('.mu-grille input[data-mu-cocher]:not(:disabled)'))
          || f.querySelector('input:not([type="hidden"]):not(:disabled), select:not(:disabled)');
      } else {
        const service = c.service && this.a.services().some(x => x.id === c.service) ? c.service : this.choisi;
        this.equipeOuverte = null; this.panneau = null;
        if (c.genre === 'temps' || c.genre === 'ajouter') this.sections.set(c.genre === 'temps' ? 'temps' : 'equipes', true);
        if (service !== this.choisi || this.page() !== 'mu-services') super.ouvrir(service);
        this.rendreServices();
        const f = box.querySelector('.se-fiche'); if (!f) return null;
        el = c.genre === 'temps' ? this.champDuTemps(f, c)
          : c.genre === 'ajouter' ? f.querySelector('[data-mu-section="equipes"] [data-mu-action="equipe"]')
          : f.querySelector('.se-afaire button') || f.querySelector('details[data-mu-section="equipes"] > summary');
      }
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
      (el.closest('td, label') || el).classList.add('se-vise');
      return el;
    }

    /* La fiche d'avant (unite.js), sans aucun résultat, en morceaux : le calcul n'y est pas passé, et les fiches
     * d'équipe (ateliers.js) le savent — ni heure de fin, ni effectif calculé, ni plan du dernier calcul. */
    morceaux(s, b, classes) {
      const at = this.at, t = root.document.createElement('template');
      at.pageServices = true;
      try { t.innerHTML = this.fiche(s, b, classes, null); } finally { at.pageServices = false; }
      return t.content;
    }

    rendreServices() {
      const d = root.document, box = d.getElementById('mu-services'); if (!box) return;
      const classes = this.at.classes, r = this.at.resultat || {};
      const services = this.ordre(this.a.services());
      // Un service dont le bilan échoue reste dans la liste, avec son erreur : le reste s'affiche.
      const bilanSur = id => {
        try { return this.bilanDuCalcul(id, classes, r); }
        catch (e) { if (root.console) root.console.error(e); return { id, nature: 'manuel', cases: this.etat.ateliers.filter(a => a.service === id), passent: 0, attendues: [], vides: [], sansTemps: false, alertes: [], points: ['erreur d’affichage : ' + e.message], etat: 'afaire' }; }
      };
      const bilans = new Map(services.map(s => [s.id, bilanSur(s.id)]));
      if (!services.some(s => s.id === this.choisi)) {
        const premier = services.find(s => bilans.get(s.id).etat === 'afaire') || services.find(s => bilans.get(s.id).etat === 'ok') || services[0];
        this.choisi = premier ? premier.id : null;
      }
      // La fiche d'une équipe ne tient qu'à son service : supprimée, elle se referme ; déplacée dans un autre service
      // (son champ « Service »), la page la suit.
      const ouverte = this.equipeOuverte ? (this.etat.ateliers || []).find(a => a.id === this.equipeOuverte) : null;
      if (!ouverte) this.equipeOuverte = null;
      else if (ouverte.service !== this.choisi && ouverte.fusion !== this.choisi && services.some(x => x.id === ouverte.service)) this.choisi = ouverte.service;
      const s = services.find(x => x.id === this.choisi), b = s ? bilans.get(s.id) : null;
      if (ouverte && !(s && (ouverte.service === s.id || ouverte.fusion === s.id))) this.equipeOuverte = null;
      const ico = x => (I() ? I().ico(I().icoService(x.id, x.nom)) : '');
      // Deux services faits d'un bloc par une même équipe : chacun le dit, dans la liste.
      const ch = PC.chaines(this.etat, null, null);
      const lies = id => ch.filter(g => g.service === id).map(g => '+ ' + this.nom(g.avant)).concat(ch.filter(g => g.avant === id).map(g => 'avec ' + this.nom(g.service)));
      const sup = this.a.supprimes ? this.a.supprimes() : { n: 0, html: '' };
      const liste = `<nav class="mu-liste se-liste" aria-label="Les services">
        <details class="se-ajout" data-se-ajout${this.ajout ? ' open' : ''}><summary class="btn btn-sm">+ Ajouter un service</summary>
          <form class="mu-nouveau" data-mu-nouveau>
          <label>Nom <input name="nom" maxlength="120" placeholder="ex. Conditionnement" required></label>
          <label>Sur le plan, près de <select name="parent">${this.a.racines().map(x => `<option value="${esc(x.id)}">${esc(x.nom)}</option>`).join('')}</select></label>
          <label title="À part entière : ses propres temps par vol et ses propres liens, comme Prépa ou Dotation. Une salle de plus : elle reprend les temps et les liens du service choisi au-dessus.">C’est <select name="genre"><option value="autonome">un service à part entière</option>
            <option value="salle">une salle de plus de ce service</option></select></label>
          <button class="btn btn-sm" type="submit">+ Créer</button></form></details>
        ${this.entreeTousLesTemps()}
        ${services.map(x => { const bx = bilans.get(x.id), on = x.id === this.choisi && !this.panneau, l = lies(x.id);
          return `<button type="button" class="mu-svc ${bx.etat}${l.length ? ' en-chaine' : ''}${on ? ' actif' : ''}" data-mu-choisir="${esc(x.id)}" aria-current="${on}">
          <span class="mu-svc-ico" aria-hidden="true">${ico(x)}</span><span class="mu-svc-txt"><b>${esc(x.nom)}</b><small>${esc(sousTitre(bx.nature, bx.cases))}</small>${l.length
            ? `<i class="mu-svc-chaine" title="Fait d’un bloc, à la chaîne, par une même équipe">${pic('chaine', 'ico-texte')} ${esc(l.join(' · '))} à la chaîne</i>` : ''}</span>
          <span class="mu-point ${bx.etat}" title="${bx.etat === 'afaire' ? esc(bx.points.join(' · ')) : bx.etat === 'ok' ? 'Complet' : 'Pas utilisé'}" aria-hidden="true"></span></button>`; }).join('')}
        ${sup.html ? `<button type="button" class="lien-discret se-vers-supprimes${this.panneau === 'supprimes' ? ' actif' : ''}" data-se-panneau="supprimes" aria-current="${this.panneau === 'supprimes'}">${
          sup.n ? pl(sup.n, 'service supprimé', 'services supprimés') : 'Services supprimés'}, zones du plan →</button>` : ''}
      </nav>`;
      // Une fiche qui ne s'affiche pas doit le dire, pas laisser une page vide sans raison.
      let corps, vue = 'service';
      try {
        if (this.panneau === 'supprimes' && sup.html) { vue = 'supprimes'; corps = this.fichePanneau(sup); }
        else if (this.panneau === 'temps' && this.tousLesTemps()) { vue = 'temps'; corps = this.ficheTousLesTemps(); }
        else if (!s) corps = '<p class="mini-note">Aucun service.</p>';
        else if (this.equipeOuverte) { vue = 'equipe'; corps = this.ficheEquipe(s, b, classes, this.equipeOuverte); }
        else corps = this.ficheService(s, b, classes);
      } catch (e) {
        corps = `<p class="mu-q" role="alert">La fiche de « ${esc(s ? s.nom : '')} » n’a pas pu s’afficher : ${esc(e.message)}. Envoyez ce message pour qu’on corrige.</p>`;
        if (root.console) root.console.error(e);
      }
      this.poser(box, `<div class="mu-cadre se-cadre">${liste}<div class="mu-fiche se-fiche" data-mu-fiche="${esc(this.choisi || '')}" data-se-vue="${vue}"
        data-se-cle="${esc([this.choisi || '', vue, this.equipeOuverte || ''].join('|'))}">${corps}</div></div>`);
    }

    /* La fiche défile dans sa colonne. Redessinée — un champ validé, un recalcul —, elle reste où elle était ; une autre
     * fiche (un autre service, une équipe, le retour au service) s'ouvre en haut. */
    poser(box, html) {
      const tableau = box.id === 'mu-services' ? this.tousLesTemps() : null;
      // « Tous les temps par vol » reste en place quand la page se redessine : seule la liste se refait. Le tableau garde
      // ainsi le champ qu'on saisit et l'endroit où il a défilé ; il se redessine lui-même (reglages.js) (correction 23 g).
      if (tableau && box.contains(tableau) && html.includes('data-se-vue="temps"')) {
        if (box._html === html) return;
        const t = root.document.createElement('template'); t.innerHTML = html;
        const neuve = t.content.querySelector('.se-liste'), liste = box.querySelector('.se-liste');
        if (neuve && liste) { const haut = liste.scrollTop; liste.replaceWith(neuve); neuve.scrollTop = haut; }
        box._html = html;
        return;
      }
      const avant = box.querySelector('.se-fiche'), garde = avant ? { cle: avant.dataset.seCle, haut: avant.scrollTop } : null;
      super.poser(box, html);
      const apres = box.querySelector('.se-fiche');
      if (garde && apres && apres !== avant && apres.dataset.seCle === garde.cle) apres.scrollTop = garde.haut;
      // Son entrée vient d'être ouverte : le tableau entre dans la page, et se dessine.
      const hote = tableau ? box.querySelector('[data-se-hote-temps]') : null;
      if (!hote) return;
      this.preparerTousLesTemps(tableau);
      hote.appendChild(tableau);
      const rg = this.a.rg ? this.a.rg() : null;
      if (rg && rg.rendreRecap) rg.rendreRecap();
    }

    /* ---- « Tous les temps par vol » (correction 23 g) : le tableau d'avant, en seconde vue des champs des fiches ----- */

    /** Le panneau du tableau (reglages.js, commun avec la version 2) que la page garde hors de l'écran, s'il y en a un. */
    tousLesTemps() { return (this.a.tousLesTemps && this.a.tousLesTemps()) || null; }

    /** Son entrée, à part, en tête de la liste, sous « Pour toute l'unité » — comme « Fournisseurs » dans « Chemins ». */
    entreeTousLesTemps() {
      if (!this.tousLesTemps()) return '';
      const on = this.panneau === 'temps';
      return `<p class="mu-groupe">Pour toute l’unité</p>
        <button type="button" class="mu-svc se-tous-temps libre${on ? ' actif' : ''}" data-se-panneau="temps" aria-current="${on}"
          title="Tous les temps par vol, d’un coup d’œil : un tableau pour en saisir beaucoup à la suite">
          <span class="mu-svc-ico" aria-hidden="true">${pic('chrono')}</span>
          <span class="mu-svc-txt"><b>Tous les temps par vol</b><small>un tableau, pour saisir vite</small></span></button>
        <p class="mu-groupe">Services</p>`;
    }

    /** La colonne de droite : le tableau, posé par `poser`. */
    ficheTousLesTemps() { return '<div class="se-temps" data-se-hote-temps></div>'; }

    /**
     * Une fois : sous son titre, ce qu'est ce tableau et où sont son import et son export ; et, derrière son « ? », la
     * longue explication que le tableau écrit sous lui (la page la cache : la place va aux lignes).
     */
    preparerTousLesTemps(tableau) {
      if (tableau.dataset.sePret) return;
      tableau.dataset.sePret = '1';
      const titre = tableau.querySelector('.titre-aide'), aide = tableau.querySelector('.aide-corps');
      if (titre) titre.insertAdjacentHTML('afterend', `<p class="mini-note se-temps-dit">Une seconde vue des champs de « Ses temps par vol », dans la fiche
        de chaque service : une valeur changée ici se lit là-bas, et l’inverse.
        <button type="button" class="lien-discret" data-page="u-sauvegarde" data-lieu="classeurs">Importer ou exporter ce tableau : Fichiers →</button></p>`);
      // Le code des champs (évolution 25 c) : la légende le montre (ses deux premières pastilles), l'aide le dit.
      if (aide) aide.insertAdjacentHTML('beforeend', `<p class="se-temps-code"><b>Fond pêche : une valeur saisie ; italique gris : la valeur reprise.</b>
        Une cellule vide montre, en italique, la valeur de toutes les compagnies : elle la reprend tant qu’on n’y saisit rien.</p>
        <p>Les temps sont comptés pour <b>une seule personne</b>. Pour chaque service : la valeur,
        l’effectif de l’équipe qui prépare et la durée — le temps divisé par les personnes ; pour un robot, les plateaux divisés par le débit.
        Un effectif souligné en pointillé est celui d’une équipe partagée par plusieurs commandes : il vaut pour toutes.</p>`);
    }

    /** Les services supprimés (à remettre), et les zones du plan qui ne sont pas des services (à convertir). */
    fichePanneau(sup) {
      return `<p class="se-retour"><button type="button" class="lien-fort" data-se-retour>← Revenir aux services</button></p>
        <h2 class="se-titre">Services supprimés, zones du plan</h2>
        <div class="se-supprimes" data-svc-hote>${sup.html}</div>`;
    }

    /** Une ligne du tableau « Ses équipes ». */
    ligneEquipe(a, depuis) {
      const e = resumeEquipe(a, { calcule: this.at.effectifSeCalcule ? this.at.effectifSeCalcule(a) : false, etiquette: c => PC.etiquette(c) });
      const chaine = depuis ? ` <small class="se-chaine" title="Équipe du ${esc(this.nom(a.service))} : elle fait aussi ce service, d’un bloc">${pic('chaine', 'ico-texte')} équipe du ${esc(this.nom(a.service))}</small>` : '';
      return `<tr class="se-eq" data-se-equipe="${esc(a.id)}"><th scope="row"><button type="button" class="se-eq-nom" data-se-equipe="${esc(a.id)}"
          title="Ouvrir la fiche de « ${esc(a.nom)} » : tous ses réglages">${esc(e.nom)}</button>${chaine}</th>
        <td>${esc(e.debut)}</td><td>${esc(e.jour)}</td><td>${esc(e.personnes)}</td><td class="se-eq-prepare">${esc(e.prepare)}</td></tr>`;
    }

    /** La fiche d'un service : son nom et ce qu'il fait ; ses équipes ; ses temps ; l'avancé, replié. */
    ficheService(s, b, classes) {
      const m = this.morceaux(s, b, classes), nature = b.nature;
      const un = sel => m.querySelector(sel), tous = sel => [...m.querySelectorAll(sel)];
      const html = e => (e ? e.outerHTML : '');
      const section = (cle, titre, corps, note, ouvert) => `<details class="mu-etape se-section" data-mu-section="${cle}"${this.sections.get(cle) ?? ouvert ? ' open' : ''}>
        <summary><h3>${esc(titre)}${note ? `<small>${note}</small>` : ''}</h3></summary>${corps}</details>`;
      // Évolution 24 (a) : la fiche d'un fournisseur ne règle plus « Quels chemins en ont besoin ? ». Elle montre ses
      // clients, qui se lisent, et mène au tableau où ils se règlent pour toute l'unité. Une mise à disposition qui
      // reçoit d'un autre service reste une étape comme les autres : sa fiche ne change pas.
      const F = root.OrlyFournisseurs, besoin = un('.mu-besoin');
      if (F && besoin && this.estFournisseur(s.id)) {
        const t = root.document.createElement('template');
        t.innerHTML = F.clientsHTML(F.clientsDe(this.etat, s.id, this.ordre(this.a.services()), this.optionsFournisseurs()));
        besoin.replaceWith(t.content);
        // La phrase d'avant demandait aussi « qui en a besoin » : cela ne se dit plus ici (évolution 24 d, retouche de contrôle).
        const FIN = /, combien de personnes y travaillent sur la journée, et qui en a besoin\.$/;
        for (const n of tous('p.mini-note')) if (FIN.test(n.textContent)) n.textContent = n.textContent.replace(FIN, ' et combien de personnes y travaillent sur la journée.');
      }

      // Correction 23 (c) : l'encart « à compléter » nomme la commande ou la compagnie, et chaque ligne mène à l'endroit exact.
      const afaire = un('.mu-afaire');
      if (afaire) {
        // Le geste qui ajoute une équipe porte le nom du bouton de la fiche (« Mettre ce service en place », pour une mise à disposition).
        const ajout = un('[data-mu-section="equipes"] [data-mu-action="equipe"]'), t = root.document.createElement('template');
        t.innerHTML = this.encartACompleter(s, b, classes, ajout ? ajout.textContent.replace(/^\s*\+\s*/, '').trim() : '');
        afaire.replaceWith(t.content);
      }

      // 1. Son nom et ce qu'il fait : le type se choisit ici, une seule fois.
      const tete = un('.mu-tete'), typeDe = un('label.mu-nature');
      const boutons = tete ? [...tete.querySelectorAll('[data-mu-action]')] : [];
      for (const x of boutons) x.remove();
      const fin = tete && tete.querySelector('.mu-tete-fin');
      if (fin) fin.insertAdjacentHTML('beforebegin', html(typeDe));
      if (tete) tete.insertAdjacentHTML('beforeend', `<button type="button" class="lien-fort se-resultats" data-se-resultats="${esc(s.id)}">Voir ce service dans les résultats →</button>`);
      if (tete) tete.classList.add('se-tete');

      // 2. Ce que la fiche d'avant disait avant ses sections : les chemins qui passent ici, ce qu'il reste à faire.
      const avis = [...m.children].filter(e => !e.matches('.mu-tete, details.mu-etape')).map(html).join('');

      // 3. Ses équipes : un tableau, et de quoi en ajouter. Leurs fiches s'ouvrent d'un clic sur leur ligne.
      const eq = un('[data-mu-section="equipes"]'), { siennes, chainees } = this.equipesDe(s.id);
      // L'arrivée des retours face aux horaires de la plonge : une lecture de la planche, pas un réglage — repliée.
      const replie = e => (e.matches('.mu-retours') ? `<details class="se-retours" data-mu-section="retours"${this.sections.get('retours') ? ' open' : ''}>
        <summary>L’arrivée des retours, face à ses horaires</summary>${e.outerHTML}</details>` : e.outerHTML);
      const reste = eq ? [...eq.children].filter(e => !e.matches('summary, article.mu-equipe, .mu-carte, .mu-chainees, .mu-vide')).map(replie).join('') : '';
      const lignes = siennes.map(a => this.ligneEquipe(a)).concat(chainees.map(a => this.ligneEquipe(a, s.id))).join('');
      const tableau = lignes ? `<div class="table-scroll"><table class="svc-table se-equipes"><caption class="sr-only">Les équipes de ${esc(s.nom)}</caption>
          <thead><tr><th scope="col">Équipe</th><th scope="col">Début</th><th scope="col">Jour</th><th scope="col">Personnes</th><th scope="col">Ce qu’elle prépare</th></tr></thead>
          <tbody>${lignes}</tbody></table></div>` : '<p class="mini-note mu-vide">Aucune équipe pour l’instant.</p>';
      // L'effectif du service (constant, selon les vols, imposé) : il dit comment se comptent les personnes de ses
      // équipes. Replié, sa ligne dit le choix en cours.
      const choix = tous('[data-mu-section="nature"] .mu-effectif');
      const coche = sel => choix.some(e => { const c = e.matches(sel) ? e : e.querySelector(sel); return !!c && c.hasAttribute('checked'); });
      const dit = choix.some(e => e.matches('.mu-par-vols')) ? (coche('[data-mu-impose]') ? 'imposé (essai)' : 'selon les vols de chaque compagnie')
        : coche('[data-mu-effectif]') ? 'constant : le nombre de personnes saisi'
        : coche('[data-mu-impose]') ? 'imposé (essai)' : 'calculé, d’après ses temps par vol et les vols';
      const effectif = choix.length ? `<details class="se-effectif" data-mu-section="effectif"${this.sections.get('effectif') ? ' open' : ''}>
        <summary>Effectif de ses équipes : <b>${esc(dit)}</b></summary>${choix.map(html).join('')}</details>` : '';
      // La plonge lave ce qui revient : la boucle du matériel et les retours se règlent avec la simulation (« Équipes une
      // par une » y renvoyait).
      const renvoi = nature === 'lavage' ? `<p class="mini-note at-materiel-renvoi">La boucle du matériel et les retours des vols à la plonge se règlent dans
        <button type="button" class="lien-discret" data-page="rg-simulation">Simulation › Réglages →</button></p>` : '';
      const equipes = section('equipes', 'Ses équipes', tableau + reste + effectif + renvoi, lignes ? 'cliquez une équipe pour ouvrir sa fiche' : '', true);

      // 4. Ses temps : ce qui joue pour lui, rien d'autre.
      const temps = this.sectionTemps(s, nature, un('[data-mu-section="temps"]'), siennes, section);

      // 5. Réglages avancés, repliés : en parallèle, encadrement, rattachement, place sur le plan ; la part de surface
      //    et le poste de travail de la vue en direct s'y ajoutent (site-reglages.js) ; supprimer.
      const av = un('[data-mu-section="avance"]');
      if (av) {
        av.classList.add('se-section');
        const titre = av.querySelector('summary h3');
        if (titre) { const note = titre.querySelector('small'); titre.textContent = 'Réglages avancés'; if (note) titre.appendChild(note); }
        const supprimer = boutons.filter(x => x.dataset.muAction === 'supprimer');
        // Évolution 23 (a) : le plan de l'unité n'est plus au menu. « Voir sur le plan » et « Le déplacer sur le plan »
        // laissent la place à un seul lien discret, tout en bas, qui ouvre la page du plan sur ce service.
        av.insertAdjacentHTML('beforeend', (this.a.rattachement ? this.a.rattachement(s.id) : '')
          + (supprimer.length ? `<p class="se-supprimer">${supprimer.map(html).join('')}<span class="mini-note">ses équipes partent avec lui ; un service du plan se remet depuis la liste, en bas</span></p>` : '')
          + `<p class="se-place"><button type="button" class="lien-discret" data-mu-action="plan">Placer ce service sur le plan →</button></p>`);
      }
      return html(tete) + avis + equipes + temps + html(av);
    }

    /* La section des temps d'un service. Par classe (le barème) quand ses temps par classe jouent ; par compagnie pour
     * un service à une équipe par compagnie ; pour un handling ou une plonge par vol, ses durées sont dans la fiche de
     * son équipe : la section les rappelle et y mène. Une mise à disposition n'en a pas. */
    sectionTemps(s, nature, avant, equipes, section) {
      const J = this.a.jouent ? this.a.jouent() : null, st = this.etat, rg = this.a.rg ? this.a.rg() : null;
      // Une mise à disposition n'a pas de temps par vol — sauf si une équipe y prépare aussi : ses temps jouent alors.
      const prepare = (st.ateliers || []).some(a => a && a.service === s.id && a.type !== 'dispo' && a.type !== 'appui');
      if (nature === 'atelier' || (nature === 'dispo' && !prepare)) return '';
      const corpsDe = e => (e ? [...e.children].filter(x => x.tagName !== 'SUMMARY').map(x => x.outerHTML).join('') : '');
      const vers = l => l.map(a => `<button type="button" class="lien-discret" data-se-equipe="${esc(a.id)}">Ouvrir la fiche de « ${esc(a.nom)} » →</button>`).join(' ');
      const pc = J ? J.parCompagnie(s.id, st) : null;
      const P = root.MoteurProduction;
      // Un service qui travaille par compagnie garde ses temps par classe, qui ne jouent pas : une ligne discrète les
      // dit, grisés, comme depuis l'évolution 19 (« Temps par vol par service » la portait).
      const gardes = pc && rg && rg.etat ? Object.entries((rg.etat.bareme || {})[s.id] || {}).filter(([, v]) => v !== null && v !== '' && Number.isFinite(+v)) : [];
      const enHeures = m => (P && P.heuresFr ? P.heuresFr(m) : String(Math.round(m / 60 * 100) / 100).replace('.', ','));
      const horsJeu = gardes.length && J.ligne ? `<div class="nj-hote">${J.ligne(gardes.map(([k, v]) => { const i = k.lastIndexOf('/'), cie = k.slice(0, i);
        return { cle: k, libelle: k.slice(i + 1) + ' · ' + (cie === '*' ? 'toutes compagnies' : cie), valeur: enHeures(+v) + ' h par vol',
          raison: 'Ce service travaille par compagnie : ses temps par classe ne sont pas lus.' }; }), 'svc-' + s.id)}</div>` : '';
      if (nature === 'categories') return section('temps', TITRES_TEMPS.categories, corpsDe(avant) + horsJeu, 'pour une personne ; une cellule vide prend la valeur de « Toutes les compagnies »', false);
      if (pc && (pc.genre === 'handling' || pc.genre === 'plonge')) {
        const lu = pc.lignes.length ? `<table class="svc-table se-durees"><thead><tr><th scope="col">Compagnie</th><th scope="col">${esc(pc.unite)}</th></tr></thead><tbody>${
          pc.lignes.map(x => `<tr><th scope="row">${x.cie === '*' ? 'Toutes compagnies' : esc(x.cie)}</th><td class="num">${esc(String(x.minutes).replace('.', ','))}</td></tr>`).join('')}</tbody></table>`
          : '<p class="mini-note">Aucune durée n’est encore réglée.</p>';
        const porte = equipes.filter(a => a.id === pc.equipe);
        return section('temps', pc.genre === 'plonge' ? TITRES_TEMPS.lavage : TITRES_TEMPS.handling,
          `<p class="mini-note">${esc(pc.raison)}</p>${lu}<p class="se-vers">${vers(porte.length ? porte : equipes.slice(0, 1))}</p>${horsJeu}`, '', false);
      }
      // Des temps par vol d'exemple : le dire là où on les modifie (« Temps par vol par service » le disait).
      const exemple = rg && rg.etat && P && P.BAREME_DEMO && JSON.stringify(rg.etat.bareme) === JSON.stringify(P.BAREME_DEMO)
        ? `<p class="rg-avertissement se-exemple"><b>Ce sont des temps par vol d’exemple</b>, pas ceux de l’unité :
          saisissez les vôtres, ou importez votre étude depuis <button type="button" class="lien-discret" data-page="u-sauvegarde">Fichiers →</button></p>` : '';
      const bareme = rg ? exemple + rg.ficheTemps(s.id) : '';
      if (nature === 'manuel') return section('temps', TITRES_TEMPS.manuel, exemple + corpsDe(avant), 'le temps d’une seule personne, pour une compagnie dans une classe', false);
      if (nature === 'robot') return section('temps', TITRES_TEMPS.robot, bareme
        + `<p class="mini-note">Le débit de la ligne (plateaux par heure) se règle dans la fiche de chaque équipe robot.</p><p class="se-vers">${vers(equipes.filter(a => a.type === 'robot'))}</p>`, '', false);
      if (nature === 'lavage') return section('temps', 'Ses temps par classe et ses débits', bareme
        + `<p class="mini-note">Les tunnels et leurs débits se règlent dans la fiche de chaque équipe de plonge.</p><p class="se-vers">${vers(equipes.filter(a => a.type === 'lavage'))}</p>`, '', false);
      return bareme ? section('temps', TITRES_TEMPS.manuel, bareme, '', false) : '';
    }

    /** La fiche d'une équipe, au même endroit que celle de son service : tous ses réglages, et un retour. */
    ficheEquipe(s, b, classes, id) {
      const m = this.morceaux(s, b, classes);
      const bloc = [...m.querySelectorAll('article[data-at]')].find(e => e.dataset.at === id && !e.parentElement.closest('article[data-at]'));
      const a = (this.etat.ateliers || []).find(x => x.id === id);
      const tete = `<p class="se-retour"><button type="button" class="lien-fort" data-se-retour title="Revenir à la fiche du service">← ${esc(s.nom)}</button>
        <span class="se-fil" aria-hidden="true">›</span><b>${esc(a ? a.nom : '')}</b>
        <button type="button" class="lien-discret se-resultats" data-se-resultats="${esc(s.id)}">Voir ce service dans les résultats →</button></p>`;
      if (!bloc) return tete + '<p class="mini-note">Cette équipe n’a pas de fiche dans ce service.</p>';
      // Un réglage, un seul champ : ce que l'en-tête de l'équipe porte déjà (le débit d'un robot, son minimum pour
      // tourner) ne se répète pas sous « Plus de réglages ».
      const enTete = [...bloc.children].find(e => e.matches('.mu-equipe-tete'));
      for (const c of enTete ? enTete.querySelectorAll('[data-at-champ]') : []) {
        if (c.dataset.classe || c.dataset.index || c.dataset.cle) continue;
        for (const d of bloc.querySelectorAll(`details.mu-plus .at-champs > label [data-at-champ="${c.dataset.atChamp}"]`)) d.closest('label').remove();
      }
      // Les postes de travail d'un robot rejoignent alors son minimum, en tête : les deux bornes de son effectif se lisent ensemble.
      const min = enTete && enTete.querySelector('[data-at-champ="personnesMin"]'), max = bloc.querySelector('details.mu-plus .at-champs > label [data-at-champ="personnesMax"]');
      if (min && max) { const l = max.closest('label'); l.classList.add('mu-eq-pers'); min.closest('label').after(l); }
      return tete + `<div class="se-equipe${bloc.matches('.at-carte') ? ' mu-carte' : ''}">${bloc.outerHTML}</div>`;
    }

    /* Les gestes de la page : ouvrir une équipe, revenir au service, les services supprimés, les résultats. */
    lierPage() {
      const d = root.document;
      d.addEventListener('click', e => {
        // Un chemin à reprendre, dans l'encart « Lié au handling » (correction 23 e) : il s'ouvre dans « Chemins », ce service choisi.
        const arm = e.target.closest && e.target.closest('#mu-services [data-mu-arm-chemin]');
        if (arm) return void this.ouvrirFlux(arm.dataset.muArmChemin, arm.dataset.service);
        const t = e.target.closest && e.target.closest('#mu-services [data-se-viser], #mu-services [data-se-equipe], #mu-services [data-se-retour], #mu-services [data-se-panneau], #mu-services [data-se-resultats], #mu-services [data-fo-ouvrir]');
        if (!t) return;
        // Une ligne de l'encart « à compléter » (correction 23 c) : l'endroit exact, en évidence, le clavier dessus.
        if (t.dataset.seViser) return void this.viser({ genre: t.dataset.seViser, service: this.choisi, equipe: t.dataset.seEquipe, commande: t.dataset.seCommande, compagnie: t.dataset.seCompagnie });
        // La fiche d'un fournisseur : « Régler dans Chemins › Fournisseurs » (évolution 24 a).
        if (t.dataset.foOuvrir !== undefined) return void (this.ouvrirFournisseurs ? this.ouvrirFournisseurs() : this.a.page('mu-flux'));
        // Dans une ligne du tableau, un clic n'importe où ouvre la fiche ; le bouton du nom, au clavier.
        if (t.dataset.seEquipe) return void this.ouvrirEquipe(t.dataset.seEquipe, this.choisi);
        if (t.dataset.seRetour !== undefined) { this.panneau = null; return void this.ouvrirEquipe(null); }
        if (t.dataset.sePanneau) { this.panneau = t.dataset.sePanneau; this.equipeOuverte = null; return void this.rendreServices(); }
        if (t.dataset.seResultats && this.a.resultats) this.a.resultats(t.dataset.seResultats);
      });
      d.addEventListener('toggle', e => { const t = e.target; if (t.dataset && t.dataset.seAjout !== undefined) this.ajout = t.open; }, true);
    }
  }

  root.OrlyServicesPage = { ...api, PageServices };
})(typeof window !== 'undefined' ? window : globalThis);
