/* ==========================================================================
 *  LA PLACE D'UN SERVICE DANS LA VUE EN DIRECT — dans sa fiche (v1)
 *  ------------------------------------------------------------------------
 *  La vue en direct génère un site où chaque service a une part de surface
 *  (moteur/site.js, évolution 16 a), et où un service peut partager la zone
 *  d'un autre (évolution 20 a). Ces réglages se font dans la fiche du service,
 *  section « Avancé » : un champ en %, vide pour la part par défaut ; un choix
 *  « Dans la vue en direct, partage la zone de » (aucun, ou un autre service).
 *  La fiche est dessinée par unite.js, commun aux deux versions : ce module de
 *  la version 1 y ajoute ses champs après chaque dessin, sans toucher au
 *  fichier commun. Les réglages se sauvegardent avec les ateliers ; ils ne
 *  changent aucun calcul.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = x => String(Math.round(x * 10) / 10).replace('.', ',');

  /** La part d'un service dans le site généré, en % : celle de sa zone (la production réunit la prépa et le montage). */
  function partDe(site, service) {
    const z = site && site.zones.find(x => x.services.includes(service));
    return z ? z.part * 100 : null;
  }

  /**
   * Le champ, pour la fiche du service `service`. `reglee` : sa part réglée (en %, ou null) ; `part` : la part de sa zone
   * dans le site généré ; `zone` : le nom de cette zone si elle réunit plusieurs services.
   */
  /** Ce que le champ explique : la règle par défaut, et la place que le service occupe aujourd'hui. */
  function explication(part, zone) {
    const ou = part === null ? 'Ce service n’a pas d’équipe : il n’a pas de zone.'
      : (zone ? 'Avec la zone ' + zone + ', il' : 'Il') + ' occupe aujourd’hui ' + fr(part) + ' % du site.';
    return 'La place du service dans « En direct ». Vide : la part par défaut (le magasin, la production et l’armement un cinquième chacun, les autres '
      + 'services le reste, selon leurs personnes) ; les parts se ramènent à 100 %, et aucune ne descend sous la place de ses équipes. ' + ou + ' Ce réglage ne change aucun calcul.';
  }

  function champ(service, reglee, part, zone) {
    return '<label class="mu-encadrement site-surface">Part de surface, dans la vue en direct'
      + '<span class="champ-unite"><input type="number" min="0.1" max="100" step="0.1" inputmode="decimal" value="' + (reglee === null ? '' : esc(reglee)) + '" placeholder="auto" data-site-surface="'
      + esc(service) + '" aria-label="Part de surface du service dans la vue en direct, en pour cent" aria-describedby="site-surface-mot"><span class="unite">%</span></span>'
      + '<small id="site-surface-mot">' + esc(explication(part, zone)) + '</small></label>';
  }

  /** Les services de la production : réunis par défaut dans la zone « FOOD » (moteur/site.js). */
  const PRODUCTION = ['preparation', 'prepa'];

  /**
   * Ce que le choix « partage la zone de » explique : la règle, puis où est le service aujourd'hui. `e` : { service, zone
   * (le nom de sa zone, ou null s'il n'a pas d'équipe), avec (les noms des autres services de sa zone) }.
   */
  function explicationPartage(e) {
    const ou = e.zone === null ? 'Ce service n’a pas d’équipe : il n’a pas de zone.'
      : e.avec.length ? 'Aujourd’hui, il est dans la zone ' + e.zone + ', avec ' + e.avec.join(', ') + '.' : 'Aujourd’hui, il a sa propre zone.';
    return 'Les deux services forment alors une seule zone, qui porte le nom du service choisi : leurs équipes y gardent leurs îlots, leurs parts de surface '
      + 's’additionnent. ' + ou + ' Ce réglage ne change aucun calcul.';
  }

  /** Ce que dit « aucun » : la zone du service quand rien n'est choisi — la sienne, celle de son service de rattachement, ou la production. */
  function motAucun(e) {
    return e.parent ? 'aucun : la zone de ' + e.parent + ', son service' : PRODUCTION.includes(e.service) ? 'aucun : la zone FOOD, avec la préparation et le montage' : 'aucun';
  }

  /**
   * Le choix, pour la fiche du service `e.service`. `e` : { service, hote (le service choisi, ou null), parent (le nom du
   * service auquel son annexe est rattachée, ou null), services ([{ id, nom }], ceux de l'unité), zone, avec }.
   * Un service choisi qui n'existe plus reste dans la liste, « (supprimé) » : on le voit, on peut le changer.
   */
  function choix(e) {
    const autres = e.services.filter(x => x.id !== e.service), perdu = e.hote !== null && !autres.some(x => x.id === e.hote);
    return '<label class="mu-encadrement site-partage">Dans la vue en direct, partage la zone de'
      + '<select data-site-partage="' + esc(e.service) + '" aria-describedby="site-partage-mot"><option value="">' + esc(motAucun(e)) + '</option>'
      + autres.map(x => '<option value="' + esc(x.id) + '"' + (x.id === e.hote ? ' selected' : '') + '>' + esc(x.nom) + '</option>').join('')
      + (perdu ? '<option value="' + esc(e.hote) + '" selected>' + esc(e.hote) + ' (supprimé)</option>' : '') + '</select>'
      + '<small id="site-partage-mot">' + esc(explicationPartage(e)) + '</small></label>';
  }

  /** Le service de la fiche affichée : sa part réglée, la part et le nom de sa zone, le service dont il partage la zone, ceux qui sont avec lui. */
  function etatDe(section, a, regime) {
    const repere = section.querySelector('[data-mu-encadrement]'), service = repere && repere.dataset.muEncadrement;
    if (!service) return null;
    const site = a.site ? a.site(regime ? regime() : undefined) : null, z = site && site.zones.find(x => x.services.includes(service));
    const services = a.a && a.a.services ? a.a.services() : [], nomDe = id => (services.find(x => x.id === id) || {}).nom || id;
    const parent = a.parentsDuSite ? a.parentsDuSite()[service] : null;
    return { service, reglee: a.surface(service), part: partDe(site, service), zone: z && z.services.length > 1 ? z.nom : null,
      partage: { service, hote: a.partage ? a.partage(service) : null, parent: parent ? nomDe(parent) : null, services, zone: z ? z.nom : null,
        avec: z ? z.services.filter(x => x !== service).map(nomDe) : [] } };
  }

  /** Ajoute les champs à la section « Avancé » de la fiche affichée dans `box`, s'ils n'y sont pas : la part de surface, puis la zone partagée. */
  function completer(box, at, regime) {
    const section = box && box.querySelector('[data-mu-section="avance"]'), a = at && at();
    if (!section || !a || section.querySelector('[data-site-surface]')) return;
    const e = etatDe(section, a, regime);
    if (e) section.insertAdjacentHTML('beforeend', champ(e.service, e.reglee, e.part, e.zone) + (a.reglePartage ? choix(e.partage) : ''));
  }

  /** Après un réglage, la fiche n'est pas redessinée : le champ reprend la valeur gardée, et dit la place d'aujourd'hui. */
  function actualiser(box, at, regime) {
    const section = box && box.querySelector('[data-mu-section="avance"]'), a = at && at();
    const el = section && section.querySelector('[data-site-surface]');
    if (!el || !a) return completer(box, at, regime);
    const e = etatDe(section, a, regime), mot = el.closest('.site-surface').querySelector('small');
    if (!e || e.service !== el.dataset.siteSurface) return;
    const valeur = e.reglee === null ? '' : String(e.reglee);
    if (el.value !== valeur) el.value = valeur;
    if (mot) mot.textContent = explication(e.part, e.zone);
    // La zone partagée : le choix gardé, et où est le service aujourd'hui.
    const sel = section.querySelector('[data-site-partage]');
    if (!sel) return;
    const hote = e.partage.hote || '';
    if (sel.value !== hote) sel.value = hote;
    // Le service choisi n'est plus dans la liste (il vient d'être supprimé) : le choix se redessine, avec lui « (supprimé) ».
    if (sel.value !== hote) { sel.closest('.site-partage').outerHTML = choix(e.partage); return; }
    const dit = sel.closest('.site-partage').querySelector('#site-partage-mot');
    if (dit) dit.textContent = explicationPartage(e.partage);
  }

  /** Le refus d'un choix (une boucle) se lit sous le champ, comme tout refus de saisie (champs.js) ; sans phrase, il s'efface. */
  function direRefus(sel, phrase) {
    const C = root.OrlyChamps;
    if (!C) return;
    if (phrase) C.refuser(sel, phrase);
    else { C.effacer(sel); sel.setAttribute('aria-describedby', 'site-partage-mot'); }
  }

  /** Suit la fiche des services : le champ y revient après chaque dessin ; sa saisie règle la part. */
  function ecouter(box, at, regime) {
    if (!box || box.dataset.siteSurface) return;
    box.dataset.siteSurface = '1';
    box.addEventListener('change', e => {
      const el = e.target;
      if (!el || !el.dataset || !at()) return;
      if (el.dataset.sitePartage !== undefined) {
        // Une boucle est refusée en la nommant : le choix revient à ce qui était réglé, la phrase reste sous le champ.
        const service = el.dataset.sitePartage, r = at().reglePartage(service, el.value);
        if (r && r.refus) { el.value = at().partage(service) || ''; direRefus(el, r.refus); return; }
        direRefus(el, '');
        setTimeout(() => actualiser(box, at, regime), 0);
        return;
      }
      if (el.dataset.siteSurface === undefined) return;
      const service = el.dataset.siteSurface, valeur = el.value;
      setTimeout(() => { at().regleSurface(service, valeur); actualiser(box, at, regime); }, 0);
    });
    if (typeof MutationObserver === 'function') new MutationObserver(() => completer(box, at, regime)).observe(box, { childList: true, subtree: true });
    completer(box, at, regime);
  }

  const api = { ecouter, completer, actualiser, champ, partDe, choix, explicationPartage, motAucun };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlySiteReglages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
