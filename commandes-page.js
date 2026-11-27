/* ==========================================================================
 *  « COMMANDES » (version 1, évolution 26 c) — les compagnies d'abord
 *
 *  La première page de « Régler » : la liste des commandes de l'unité,
 *  rangées par compagnie, et un geste, « + Ajouter une compagnie ».
 *    - le compte (« 11 commandes · 5 compagnies ») sous le titre de la page ;
 *    - une liste plate : une rangée par commande — la pastille et le nom de sa
 *      compagnie, l'étiquette de sa classe, son chemin, son état (« complète »,
 *      ou ce qui lui manque, dans les mots de « Contrôles ») ;
 *    - « + Ajouter une compagnie » ouvre un panneau à côté : son nom (la
 *      pastille se dessine à la frappe), ses commandes (« Avec des vols » ou
 *      « Fixe, sans vol »), ses classes, ses réglages (« Comme une autre
 *      compagnie » ou « Partir de zéro »). La liste montre par avance, à part
 *      et en tête, les commandes qui seront créées ;
 *    - un clic sur une compagnie ouvre son panneau : la renommer, lui ajouter
 *      ou lui ôter une classe, ses commandes (« Avec des vols » ou « Fixe, sans
 *      vol » ; fixes, chaque classe a sa quantité par jour, son heure de
 *      départ et ses jours — évolution 26 d), choisir sa couleur (les douze
 *      teintes), la retirer.
 *  Chaque geste se défait par « Annuler » : c'est la page qui le fait
 *  (sim.js, `a.ajouter`, `a.renommer`…), sur les équipes, les temps par vol
 *  et les couleurs à la fois.
 *
 *  `compte`, `etatDe`, `groupes`, `prevues` et `html` sont purs (testés en
 *  Node) ; `PageCommandes` dessine la page et écoute ses gestes.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';
  const P = () => (NODE ? require('./moteur/production.js') : root.MoteurProduction);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const nomCabine = c => ((P().NOM_CABINE || {})[c] || c);
  const NIVEAUX_MANQUE = ['bloquant', 'corriger'];

  /** « 11 commandes · 5 compagnies ». */
  function compte(commandes, compagnies) { return pl(commandes, 'commande') + ' · ' + pl(compagnies, 'compagnie'); }

  /** Le nom d'étape qu'un point de « Contrôles » met en tête (« « Dotation » est sur le chemin de… »). */
  const etapeEnTete = t => { const m = /^« ([^»]+) »/.exec(t); return m ? m[1] : null; };
  const nommerEtapes = l => l.map(x => '« ' + x + ' »').join(l.length === 2 ? ' et ' : ', ');
  const ETAPES_NOMMEES = 1, TITRE_COURT = 60;

  /** Ce qu'un point dit d'une seule commande, en peu de mots, ou null s'il parle d'elle parmi d'autres. */
  function ditDeLaCommande(p, l) {
    const t = String(p.titre || '').trim();
    if (t.startsWith(l + ' ')) return t.slice(l.length + 1);
    if (p.code === 'hors-parcours' && p.service) return 'cochée hors de son chemin';
    return t.length <= TITRE_COURT && !(p.classes || []).length ? t : null;
  }

  /**
   * L'état d'une commande, dans les mots de « Contrôles » : « complète », ou ce que ses points bloquants ou à corriger
   * disent d'elle, en peu de mots :
   *   - un point qui commence par son nom, sans ce nom (« n'a pas d'équipe à 3 étapes du chemin « Froid » ») ;
   *   - les étapes de son chemin où personne ne la prépare (« sans équipe à « Dotation » », « sans équipe à 2 étapes ») ;
   *   - sinon, le nombre de points de « Contrôles » qui la nomment.
   * @returns {{texte:string, manque:boolean}}
   */
  function etatDe(id, avis, libelle) {
    const ps = (avis || []).filter(x => NIVEAUX_MANQUE.includes(x.niveau) && ((x.classes || []).includes(id) || x.commande === id));
    if (!ps.length) return { texte: 'complète', manque: false };
    const l = typeof libelle === 'function' ? libelle(id) : id;
    const propre = ps.map(p => ditDeLaCommande(p, l)).find(Boolean);
    if (propre) return { texte: propre, manque: true };
    const trous = ps.filter(p => p.code === 'parcours-trou').map(p => etapeEnTete(String(p.titre || ''))).filter(Boolean);
    if (trous.length) {
      const noms = trous.length > ETAPES_NOMMEES ? pl(trous.length, 'étape') : nommerEtapes(trous);
      return { texte: 'sans équipe à ' + noms, manque: true };
    }
    return { texte: pl(ps.length, 'point') + ' à voir dans « Contrôles »', manque: true };
  }

  /**
   * Les rangées de la liste : chaque compagnie et ses commandes, dans l'ordre de la liste (sans liste, celui des noms).
   * @param {{liste:object[]|null, classes:object[], avis?:object[], cheminDe:Function, libelle?:Function}} o
   *   classes : les commandes de la journée (`Sim.ateliers.classes`) ; cheminDe(id) : { nom } du chemin d'une commande
   * @returns {{nom:string, fixe:boolean, commandes:{id, cabine, chemin, etat, aCompleter}[]}[]}
   */
  function groupes(o) {
    const cab = P().CABINES, classes = (o.classes || []).filter(c => cab.includes(c.cabine));
    const noms = o.liste ? o.liste.map(c => c.nom) : [...new Set(classes.map(c => c.cie))].sort();
    const deLaListe = new Map((o.liste || []).map(c => [c.nom, c]));
    return noms.map(nom => {
      const c = deLaListe.get(nom) || {}, aCompleter = c.aCompleter || [];
      const commandes = classes.filter(x => x.cie === nom).sort((a, b) => cab.indexOf(a.cabine) - cab.indexOf(b.cabine)).map(x => {
        const ch = o.cheminDe ? o.cheminDe(x.id) : null;
        const etat = aCompleter.includes(x.cabine) ? { texte: 'à compléter', manque: true } : etatDe(x.id, o.avis, o.libelle);
        return { id: x.id, cabine: x.cabine, chemin: ch ? ch.nom : '', etat, aCompleter: aCompleter.includes(x.cabine) };
      });
      return { nom, fixe: !!c.fixe, commandes };
    });
  }

  /**
   * Les commandes qu'un ajout créera, montrées à part dans la liste : leur chemin (celui du modèle, ou le chemin habituel
   * de leur classe) et leur état (« à créer », ou « à compléter » quand le modèle n'a pas la classe).
   * @param {{nom:string, cabines:string[], mode:'modele'|'zero', modele?:string}} d  le brouillon du panneau
   * @param {{classesDe:Function, cheminDe:Function, cheminHabituel:Function}} o
   */
  function prevues(d, o) {
    const nom = String(d.nom || '').trim().toUpperCase() || 'NOUVELLE', avecModele = d.mode === 'modele' && d.modele;
    const du = avecModele ? o.classesDe(d.modele) : [];
    return P().CABINES.filter(c => (d.cabines || []).includes(c)).map(cabine => {
      const copie = avecModele && du.includes(cabine), ch = copie ? o.cheminDe(P().idClasse(d.modele, cabine)) : o.cheminHabituel(cabine);
      return { nom, cabine, chemin: ch ? ch.nom : '', etat: avecModele && !copie ? 'à compléter' : 'à créer' };
    });
  }

  /** Le texte de l'action du panneau d'ajout : « Ajouter les 3 commandes ». */
  const action = n => (n > 1 ? 'Ajouter les ' + n + ' commandes' : n === 1 ? 'Ajouter la commande' : 'Ajouter');
  const bilan = n => (n > 1 ? n + ' commandes seront créées' : n === 1 ? '1 commande sera créée' : 'Cochez au moins une classe');

  /** Une pastille dessinée à la frappe : le rang de couleur qu'aura la compagnie, ses deux lettres si son nom est long. */
  function apercu(nom, rang, court) {
    if (!nom) return '<span class="co-apercu-vide"></span>';
    return `<span class="pa"><span class="pa-cie${court ? ' pa-long' : ''}" data-pa-rang="${esc(rang)}"${court ? ` data-pa-court="${esc(court)}"` : ''}>${esc(nom)}</span></span>`;
  }

  function rangees(g, ouverte) {
    const n = Math.max(1, g.commandes.length), choisie = g.nom === ouverte;
    const tete = `<th scope="rowgroup" rowspan="${n}" class="co-tete-cie"><button type="button" class="co-cie" data-co-ouvrir="${esc(g.nom)}" aria-pressed="${choisie}"`
      + ` title="Régler ${esc(g.nom)}"><span class="co-nom">${esc(g.nom)}</span></button></th>`;
    const fixe = g.fixe ? ' <small class="co-fixe">fixe</small>' : '';
    const ligne = (x, i) => `<tr data-co-commande="${esc(x.id)}">${i ? '' : tete}<td><span class="co-classe">${esc(nomCabine(x.cabine))}</span>${fixe}</td>`
      + `<td class="co-chemin">${esc(x.chemin || '—')}</td><td class="co-etat${x.etat.manque ? ' manque' : ''}">${esc(x.etat.texte)}</td></tr>`;
    const lignes = g.commandes.length ? g.commandes.map(ligne).join('') : `<tr>${tete}<td colspan="3" class="co-vide">aucune classe</td></tr>`;
    return `<tbody class="co-groupe${choisie ? ' choisie' : ''}" data-co-compagnie="${esc(g.nom)}">${lignes}</tbody>`;
  }

  function rangeesPrevues(liste) {
    if (!liste.length) return '';
    return `<tbody class="co-prevues" aria-label="Les commandes qui seront créées">${liste.map((x, i) => `<tr>${i ? '' : `<th scope="rowgroup" rowspan="${liste.length}" class="co-tete-cie"><span class="co-nom-prevu">${esc(x.nom)}</span></th>`}`
      + `<td><span class="co-classe">${esc(nomCabine(x.cabine))}</span></td><td class="co-chemin">${esc(x.chemin || '—')}</td><td class="co-etat${x.etat === 'à compléter' ? ' manque' : ''}">${esc(x.etat)}</td></tr>`).join('')}</tbody>`;
  }

  const coche = (oui) => (oui ? ' checked' : '');

  /** Le panneau d'ajout. `d` : le brouillon ; `noms` : les compagnies qui peuvent servir de modèle. */
  function panneauAjout(d, o) {
    const n = (d.cabines || []).length, modeles = o.noms || [], refus = d.refus ? `<p class="co-refus" role="alert">${esc(d.refus)}</p>` : '';
    const verrou = o.verrou ? ' disabled' : '';
    return `<aside class="co-panneau" data-co-panneau="ajout" aria-labelledby="co-p-titre">
      <h3 id="co-p-titre" class="co-p-titre">Ajouter une compagnie</h3>
      <label class="co-champ"><span>Nom</span><span class="co-saisie"><input data-co-champ="nom" value="${esc(d.nom || '')}" maxlength="40" autocomplete="off" spellcheck="false"${verrou}>`
      + `<span class="co-apercu" aria-hidden="true">${o.apercu || ''}</span></span></label>${refus}
      <fieldset class="co-choix"><legend>Ses commandes</legend>
        <label><input type="radio" name="co-type" data-co-champ="type" value="vols"${coche(!d.fixe)}${verrou}> Avec des vols</label>
        <label><input type="radio" name="co-type" data-co-champ="type" value="fixe"${coche(!!d.fixe)}${verrou}> Fixe, sans vol</label></fieldset>
      <fieldset class="co-choix co-classes"><legend>Ses classes</legend>${P().CABINES.map(c =>
        `<label><input type="checkbox" data-co-champ="cabine" value="${c}"${coche((d.cabines || []).includes(c))}${verrou}> ${esc(nomCabine(c))}</label>`).join('')}</fieldset>
      <fieldset class="co-choix"><legend>Ses réglages</legend>
        <span class="co-modele"><label><input type="radio" name="co-mode" data-co-champ="mode" value="modele"${coche(d.mode === 'modele')}${modeles.length ? verrou : ' disabled'}> Comme une autre compagnie</label>`
        + `<select data-co-champ="modele" aria-label="La compagnie modèle"${d.mode === 'modele' && modeles.length ? verrou : ' disabled'}>${modeles.map(m => `<option value="${esc(m)}"${m === d.modele ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></span>
        <label><input type="radio" name="co-mode" data-co-champ="mode" value="zero"${coche(d.mode !== 'modele')}${verrou}> Partir de zéro</label></fieldset>
      <p class="co-bilan">${esc(bilan(n))}</p>
      <div class="co-actions"><button type="button" class="btn" data-co-action="annuler">Annuler</button>`
      + `<button type="button" class="btn btn-play" data-co-action="valider"${n && !o.verrou ? '' : ' disabled'}>${esc(action(n))}</button></div>
    </aside>`;
  }

  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const NOMS_DES_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  /**
   * Ses commandes : « Avec des vols » ou « Fixe, sans vol » (évolution 26 d). Fixes, un tableau : par classe, la quantité
   * par jour, l'heure de départ, et ses jours (une case par jour de la semaine, sous la classe).
   * @param {{classes:string[], fixe:object|null}} c  fixe : { YC: { quantite, jours, heure } } pour chaque classe
   */
  function blocFixe(c, verrou) {
    const type = `<fieldset class="co-choix co-type"><legend>Ses commandes</legend>`
      + `<label><input type="radio" name="co-type-cie" data-co-champ="type-cie" value="vols"${coche(!c.fixe)}${verrou}> Avec des vols</label>`
      + `<label><input type="radio" name="co-type-cie" data-co-champ="type-cie" value="fixe"${coche(!!c.fixe)}${verrou}> Fixe, sans vol</label></fieldset>`;
    const cabs = c.fixe ? (c.classes || []).filter(cab => c.fixe[cab]) : [];
    if (!cabs.length) return type;
    const rangee = cab => {
      const f = c.fixe[cab], n = esc(nomCabine(cab)), de = `data-co-fixe="${cab}"`;
      const jours = LETTRES.map((l, i) => `<label title="${NOMS_DES_JOURS[i]}"><input type="checkbox" ${de} data-co-fixe-champ="jour-${i + 1}"`
        + `${coche(f.jours.includes(i + 1))} aria-label="${n} : le ${NOMS_DES_JOURS[i]}"${verrou}><span aria-hidden="true">${l}</span></label>`).join('');
      return `<tbody data-co-fixe-classe="${cab}"><tr><th scope="row" rowspan="2"><span class="co-classe">${n}</span></th>`
        + `<td><input type="number" class="co-saisi" ${de} data-co-fixe-champ="quantite" value="${esc(f.quantite)}" min="0" max="99999" step="1"`
        + ` inputmode="numeric" aria-label="${n} : quantité par jour"${verrou}></td>`
        + `<td><input class="co-saisi co-heure" ${de} data-co-fixe-champ="heure" data-heure value="${esc(f.heure)}" maxlength="5" autocomplete="off"`
        + ` aria-label="${n} : heure de départ"${verrou}></td></tr>`
        + `<tr><td colspan="2"><span class="co-jours" role="group" aria-label="${n} : ses jours">${jours}</span></td></tr></tbody>`;
    };
    return type + `<table class="co-fixes"><caption>Ses commandes fixes</caption>`
      + `<thead><tr><th scope="col">Classe</th><th scope="col">Par jour</th><th scope="col">Départ</th></tr></thead>${cabs.map(rangee).join('')}</table>`;
  }

  /** Le panneau d'une compagnie : son nom, ses classes, ses commandes (avec des vols, ou fixes), sa couleur, la retirer. */
  function panneauCompagnie(c, o) {
    const verrou = o.verrou ? ' disabled' : '', refus = c.refus ? `<p class="co-refus" role="alert">${esc(c.refus)}</p>` : '';
    return `<aside class="co-panneau" data-co-panneau="compagnie" data-co-nom="${esc(c.nom)}" aria-labelledby="co-p-titre">
      <h3 id="co-p-titre" class="co-p-titre"><span class="co-nom">${esc(c.nom)}</span></h3>
      <label class="co-champ"><span>Nom</span><input data-co-champ="renommer" value="${esc(c.nom)}" maxlength="40" autocomplete="off" spellcheck="false"${verrou}></label>${refus}
      <fieldset class="co-choix co-classes"><legend>Ses classes</legend>${P().CABINES.map(cab =>
        `<label><input type="checkbox" data-co-classe="${cab}"${coche((c.classes || []).includes(cab))}${verrou}> ${esc(nomCabine(cab))}</label>`).join('')}</fieldset>
      ${blocFixe(c, verrou)}
      <fieldset class="co-choix co-couleur"><legend>Sa couleur</legend>${o.teintes || ''}</fieldset>
      <div class="co-actions"><button type="button" class="btn svc-danger" data-co-action="retirer"${verrou}>Retirer ${esc(c.nom)}</button>`
      + `<button type="button" class="btn" data-co-action="fermer">Fermer</button></div>
    </aside>`;
  }

  /**
   * La page entière.
   * @param {{groupes:object[], panneau:object|null, prevues?:object[], verrou?:boolean, apercu?:string, teintes?:string,
   *          noms?:string[], compagnie?:object}} o
   */
  function html(o) {
    const gs = o.groupes || [], n = gs.reduce((k, g) => k + g.commandes.length, 0), pan = o.panneau, ajout = pan && pan.genre === 'ajout';
    const ouverte = pan && pan.genre === 'compagnie' ? pan.nom : null;
    const table = gs.length || (o.prevues || []).length
      ? `<table class="co-table"><caption class="sr-only">Les commandes, par compagnie</caption>
          <thead><tr><th scope="col">Compagnie</th><th scope="col">Classe</th><th scope="col">Chemin</th><th scope="col">État</th></tr></thead>
          ${rangeesPrevues(o.prevues || [])}${gs.map(g => rangees(g, ouverte)).join('')}</table>`
      : '<p class="co-aucune">Aucune compagnie pour l’instant.</p>';
    const panneau = ajout ? panneauAjout(pan, o) : ouverte && o.compagnie ? panneauCompagnie({ ...o.compagnie, refus: pan.refus }, o) : '';
    return `<div class="co-cadre${panneau ? ' avec-panneau' : ''}"><div class="co-principal">
        <div class="co-entete"><span class="co-compte">${esc(compte(n, gs.length))}</span>
          <button type="button" class="btn${ajout ? '' : ' btn-play'} co-ajouter" data-co-action="ouvrir-ajout"${o.verrou ? ' disabled' : ''} aria-pressed="${!!ajout}">+ Ajouter une compagnie</button></div>
        <div class="co-liste">${table}</div></div>${panneau}</div>`;
  }

  const api = { compte, etatDe, groupes, prevues, action, bilan, html };
  if (NODE) { module.exports = api; return; }

  const d = root.document;

  /**
   * La page. L'adaptateur (sim.js) :
   *   liste()                — la liste des compagnies, ou null (une unité d'avant) ;
   *   classes()              — les commandes de la journée ;
   *   avis()                 — le registre de « Contrôles » ;
   *   cheminDe(id)           — le chemin d'une commande ({ nom }) ; cheminHabituel(cabine) — celui de sa classe ;
   *   classesDe(nom)         — les classes d'une compagnie de la liste (ou de la journée) ;
   *   verrou()               — la lecture seule ;
   *   fixeDe(nom, cabine)    — la commande fixe d'une classe ({ quantite, jours, heure }) ;
   *   ajouter(brouillon), renommer(ancien, neuf), retirer(nom), classe(nom, cabine, dedans), couleur(nom, rang),
   *   type(nom, fixe), fixe(nom, cabine, { quantite | heure | jour, coche }) :
   *                            les gestes — une phrase d'erreur quand le geste est refusé, sinon rien.
   */
  class PageCommandes {
    constructor(a) {
      this.a = a;
      this.panneau = null;     // { genre: 'ajout', nom, fixe, cabines, mode, modele, refus } | { genre: 'compagnie', nom, refus }
      this.lier();
    }

    hote() { return d.getElementById('mu-commandes'); }
    verrouille() { return !!(this.a.verrou && this.a.verrou()); }

    noms() { const l = this.a.liste(); return l ? l.map(c => c.nom) : [...new Set((this.a.classes() || []).map(c => c.cie))].sort(); }

    /** Le rang de couleur qu'aura une compagnie neuve, et ses deux lettres si son nom est long. */
    apercu(nom) {
      const PA = root.OrlyPastilles, n = String(nom || '').trim().toUpperCase();
      if (!n || !PA) return apercu(n, '', '');
      return apercu(n, PA.rangs([...this.noms(), n], PA.choix()).get(n) || '', PA.court(n) || '');
    }

    donnees() {
      const liste = this.a.liste(), pan = this.panneau;
      const gs = groupes({ liste, classes: this.a.classes(), avis: this.a.avis(), cheminDe: this.a.cheminDe, libelle: id => P().libelleClasse(id) });
      const o = { groupes: gs, panneau: pan, verrou: this.verrouille(), noms: this.noms() };
      if (pan && pan.genre === 'ajout') {
        o.apercu = this.apercu(pan.nom);
        o.prevues = prevues(pan, { classesDe: this.a.classesDe, cheminDe: this.a.cheminDe, cheminHabituel: this.a.cheminHabituel });
      }
      if (pan && pan.genre === 'compagnie') {
        const g = gs.find(x => x.nom === pan.nom);
        if (!g) this.panneau = o.panneau = null;
        else {
          const classes = this.a.classesDe(g.nom), fixe = g.fixe && this.a.fixeDe;
          o.compagnie = { nom: g.nom, classes, fixe: fixe ? Object.fromEntries(classes.map(cab => [cab, this.a.fixeDe(g.nom, cab)])) : null };
          o.teintes = root.OrlyPastilles && root.OrlyPastilles.teintesHTML ? root.OrlyPastilles.teintesHTML(g.nom, this.verrouille()) : '';
        }
      }
      return o;
    }

    /** Dessine la page ; le clavier reste où il était (le même champ, au même endroit du texte). */
    rendre() {
      const box = this.hote(); if (!box) return;
      const actif = box.contains(d.activeElement) ? d.activeElement : null;
      const cle = actif && (actif.dataset.coChamp ? '[data-co-champ="' + actif.dataset.coChamp + '"]' + (actif.type === 'radio' || actif.type === 'checkbox' ? '[value="' + actif.value + '"]' : '')
        : actif.dataset.coAction ? '[data-co-action="' + actif.dataset.coAction + '"]' : actif.dataset.coOuvrir ? '[data-co-ouvrir="' + CSS.escape(actif.dataset.coOuvrir) + '"]'
          : actif.dataset.coFixe ? '[data-co-fixe="' + actif.dataset.coFixe + '"][data-co-fixe-champ="' + actif.dataset.coFixeChamp + '"]'
          : actif.dataset.coClasse ? '[data-co-classe="' + actif.dataset.coClasse + '"]' : actif.dataset.paTeinte ? '[data-pa-teinte="' + actif.dataset.paTeinte + '"]' : null);
      const sel = actif && typeof actif.selectionStart === 'number' ? [actif.selectionStart, actif.selectionEnd] : null;
      const html1 = html(this.donnees());
      if (html1 === this.dessine && box.firstElementChild) return;
      box.innerHTML = this.dessine = html1;
      const ici = cle && box.querySelector(cle);
      if (ici) { ici.focus({ preventScroll: true }); if (sel && typeof ici.setSelectionRange === 'function') try { ici.setSelectionRange(sel[0], sel[1]); } catch (e) { /* champ sans sélection */ } }
    }

    /** Le panneau d'ajout ; `o` (« L'ajouter », depuis « Contrôles » — évolution 26 e) : le nom et les classes, remplis. */
    ouvrirAjout(o = {}) {
      if (this.verrouille()) return;
      const noms = this.noms(), cabines = (o.cabines || []).length ? o.cabines.slice() : ['YC'];
      this.panneau = { genre: 'ajout', nom: String(o.nom || ''), fixe: false, cabines, mode: noms.length ? 'modele' : 'zero', modele: noms[0] || '' };
      this.rendre();
      const l = this.hote().querySelector('.co-liste'); if (l) l.scrollTop = 0;   // les commandes à créer, en tête, se voient
      const champ = this.hote().querySelector('[data-co-champ="nom"]'); if (champ) champ.focus();
    }
    /** Ouvre le panneau d'une compagnie ; un second clic le ferme, sauf `rester` (on y vient de « Contrôles »). */
    ouvrirCompagnie(nom, rester) {
      if (this.panneau && this.panneau.genre === 'compagnie' && this.panneau.nom === nom && !rester) return this.fermer(nom);
      this.panneau = { genre: 'compagnie', nom };
      this.rendre();
      const g = this.hote().querySelector('[data-co-compagnie="' + CSS.escape(nom) + '"]'); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'nearest' });
      const t = this.hote().querySelector('[data-co-champ="renommer"]'); if (t) t.focus({ preventScroll: true });
    }
    fermer(revenirA) {
      const nom = revenirA || (this.panneau && this.panneau.genre === 'compagnie' ? this.panneau.nom : null), ajout = this.panneau && this.panneau.genre === 'ajout';
      this.panneau = null; this.rendre();
      const b = ajout ? this.hote().querySelector('[data-co-action="ouvrir-ajout"]') : nom ? this.hote().querySelector('[data-co-ouvrir="' + CSS.escape(nom) + '"]') : null;
      if (b) b.focus({ preventScroll: true });
    }

    /**
     * Pendant la frappe du nom, la page ne se redessine pas (rendu.js garde le champ jusqu'à sa validation) : seuls
     * l'aperçu de la pastille et les commandes à créer suivent, à leur place.
     */
    frappe(b) {
      const box = this.hote(); if (!box) return;
      const a = box.querySelector('.co-apercu'); if (a) a.innerHTML = this.apercu(b.nom);
      const r = box.querySelector('.co-refus'); if (r) r.remove();
      const t = box.querySelector('tbody.co-prevues');
      if (t) t.innerHTML = rangeesPrevues(prevues(b, { classesDe: this.a.classesDe, cheminDe: this.a.cheminDe, cheminHabituel: this.a.cheminHabituel })).replace(/^<tbody[^>]*>|<\/tbody>$/g, '');
      this.dessine = null;
    }

    /** Un champ du panneau d'ajout a changé : le brouillon suit, la page aussi. */
    saisir(el) {
      const b = this.panneau; if (!b || b.genre !== 'ajout') return;
      const k = el.dataset.coChamp;
      if (k === 'nom') { b.nom = el.value; b.refus = ''; return this.frappe(b); }
      if (k === 'type') b.fixe = el.value === 'fixe';
      else if (k === 'cabine') b.cabines = P().CABINES.filter(c => (c === el.value ? el.checked : b.cabines.includes(c)));
      else if (k === 'mode') b.mode = el.value;
      else if (k === 'modele') b.modele = el.value;
      b.refus = '';
      this.rendre();
    }

    valider() {
      const b = this.panneau; if (!b || b.genre !== 'ajout' || this.verrouille()) return;
      const refus = this.a.ajouter({ nom: b.nom, fixe: b.fixe, cabines: b.cabines.slice(), modele: b.mode === 'modele' ? b.modele : null });
      if (refus) { b.refus = refus; this.rendre(); const c = this.hote().querySelector('[data-co-champ="nom"]'); if (c) c.focus(); return; }
      const nom = String(b.nom).trim().toUpperCase();
      this.panneau = null; this.rendre();
      const n = this.hote().querySelector('[data-co-ouvrir="' + CSS.escape(nom) + '"]'); if (n) n.focus({ preventScroll: true });
    }

    renommer(el) {
      const p = this.panneau; if (!p || p.genre !== 'compagnie' || this.verrouille() || this.renommage) return;
      const neuf = String(el.value || '').trim().toUpperCase();
      if (neuf === p.nom) return;
      // Le calcul qui suit redessine la page : le champ quitté envoie son « change » pendant ce temps — c'est le même geste.
      let refus;
      this.renommage = true;
      try { refus = this.a.renommer(p.nom, el.value); } finally { this.renommage = false; }
      if (refus) { p.refus = refus; this.rendre(); return; }
      p.nom = neuf; p.refus = ''; this.rendre();
    }

    /** Une valeur d'une commande fixe : la quantité, l'heure, un jour. Refusée, le champ reprend sa valeur et dit pourquoi. */
    reglerFixe(nom, el) {
      const cab = el.dataset.coFixe, k = el.dataset.coFixeChamp, f = this.a.fixeDe(nom, cab);
      const o = k === 'quantite' ? { quantite: el.value } : k === 'heure' ? { heure: el.value } : { jour: +k.slice(5), coche: el.checked };
      if (k === 'quantite' && /^\d+$/.test(String(el.value).trim()) && Number(el.value) === f.quantite) return;
      if (k === 'heure' && el.value === f.heure) return;
      const refus = this.a.fixe(nom, cab, o);
      if (!refus) return this.rendre();
      if (el.type === 'checkbox') el.checked = !el.checked; else el.value = el.defaultValue;
      const C = root.OrlyChamps; if (C && C.refuser) C.refuser(el, refus);
    }

    lier() {
      const dans = e => e.target.closest && e.target.closest('#mu-commandes');
      d.addEventListener('click', e => {
        if (!dans(e)) return;
        const o = e.target.closest('[data-co-ouvrir]');
        if (o) return this.ouvrirCompagnie(o.dataset.coOuvrir);
        const t = e.target.closest('[data-pa-teinte]'), p = this.panneau;
        if (t && p && p.genre === 'compagnie' && !this.verrouille()) { this.a.couleur(p.nom, +t.dataset.paTeinte); return this.rendre(); }
        const b = e.target.closest('[data-co-action]'); if (!b || b.disabled) return;
        const quoi = b.dataset.coAction;
        if (quoi === 'ouvrir-ajout') return this.panneau && this.panneau.genre === 'ajout' ? this.fermer() : this.ouvrirAjout();
        if (quoi === 'annuler' || quoi === 'fermer') return this.fermer();
        if (quoi === 'valider') return this.valider();
        if (quoi === 'retirer' && p && p.genre === 'compagnie' && !this.verrouille()) { const nom = p.nom; this.panneau = null; this.a.retirer(nom); this.rendre(); const f = this.hote().querySelector('[data-co-action="ouvrir-ajout"]'); if (f) f.focus(); }
      });
      d.addEventListener('input', e => { if (dans(e) && e.target.dataset.coChamp === 'nom') this.saisir(e.target); });
      // Un bouton de souris enfoncé : un réglage qu'il fait valider attend la fin du clic.
      d.addEventListener('pointerdown', () => { this.appui = true; }, true);
      d.addEventListener('pointerup', () => { this.appui = false; const f = this.apres; this.apres = null; if (f) f(); }, true);
      d.addEventListener('change', e => {
        if (!dans(e)) return;
        const el = e.target, p = this.panneau;
        if (el.dataset.coChamp === 'renommer') return this.renommer(el);
        if (el.dataset.coClasse && p && p.genre === 'compagnie' && !this.verrouille()) { this.a.classe(p.nom, el.dataset.coClasse, el.checked); return this.rendre(); }
        if (el.dataset.coChamp === 'type-cie' && p && p.genre === 'compagnie' && !this.verrouille()) { this.a.type(p.nom, el.value === 'fixe'); return this.rendre(); }
        // Une quantité ou une heure se règle une fois le clavier parti (Tab), ou le clic fini (une case cochée juste après
        // la saisie garde son clic) : le dessin neuf garde le clavier où il est allé.
        if (el.dataset.coFixe && p && p.genre === 'compagnie' && !this.verrouille()) {
          const nom = p.nom;
          if (el.type === 'checkbox') return this.reglerFixe(nom, el);
          const faire = () => root.setTimeout(() => this.reglerFixe(nom, el), 0);
          if (this.appui) this.apres = faire; else faire();
          return;
        }
        // Le nom validé (ou quitté) : la page se redessine, avec lui.
        if (el.dataset.coChamp === 'nom') return this.rendre();
        if (el.dataset.coChamp) this.saisir(el);
      });
      d.addEventListener('keydown', e => {
        if (!dans(e)) return;
        if (e.key === 'Escape' && this.panneau) { e.preventDefault(); e.stopPropagation(); return this.fermer(); }
        if (e.key === 'Enter' && e.target.dataset.coChamp === 'nom') { e.preventDefault(); return this.valider(); }
        if (e.key === 'Enter' && e.target.dataset.coChamp === 'renommer') { e.preventDefault(); return this.renommer(e.target); }
        if (root.OrlyPastilles && root.OrlyPastilles.clavierTeintes) root.OrlyPastilles.clavierTeintes(e);
      });
    }
  }

  root.OrlyCommandesPage = { ...api, PageCommandes };
})(typeof window !== 'undefined' ? window : globalThis);
