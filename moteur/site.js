/* ==========================================================================
 *  LE SITE DE LA VUE EN DIRECT — généré par des règles (évolution 16 a, v1)
 *  ------------------------------------------------------------------------
 *  La vue en relief ne recopie pas le plan dessiné : elle montre un site
 *  schématique, construit ici à partir des réglages de la simulation — les
 *  ateliers, les chemins, la part de surface de chaque service. Les mêmes
 *  réglages donnent toujours le même site. Rien n'est décoratif : une zone
 *  par service qui a un atelier, une ligne robotisée par service robot, un
 *  tunnel par tunnel tenu en même temps.
 *
 *  Ce module ne lit que des réglages et ne calcule rien de la journée. Il ne
 *  touche à rien : il rend un objet neuf. Sans navigateur : il se teste.
 *
 *  Les règles :
 *   - le site est un rectangle : deux bandes de zones, de part et d'autre d'un
 *     couloir central ; l'entrée est au bout gauche du couloir, l'aire de
 *     pause la jouxte ; les avions sont du côté droit ;
 *   - une zone par service qui a au moins un atelier ; la préparation et le
 *     montage partagent une seule zone, « FOOD » ;
 *   - qui partage la zone de qui (évolution 20 a) : une annexe rattachée à un
 *     service (`parents`, d'après le plan) n'a pas de zone à elle — ses équipes
 *     et ses machines sont dans la zone de son parent ; un service peut partager
 *     la zone d'un autre (`partages`, un réglage) — la zone porte le nom du
 *     service choisi, leurs parts de surface s'additionnent ; une boucle ne joue
 *     pas, et le site la nomme ;
 *   - une ligne par robot : les équipes d'un même service robot se partagent une
 *     seule ligne, même présentes ensemble ; elle est dans la production, ou dans
 *     la zone qui accueille son service s'il est rattaché ou s'il partage ;
 *   - chaque service a une part de surface (un réglage, en %). Par défaut : le
 *     magasin 1/5, la production (FOOD) 1/5, l'armement 1/5, et les autres
 *     services se partagent 2/5 au prorata de leurs personnes, chacun gardant
 *     au moins la place de ses ateliers. Les parts se ramènent à un total de 1 ;
 *   - les zones se rangent dans l'ordre du chemin, de l'amont vers l'aval : le
 *     magasin d'abord (côté arrivées), le quai du handling au bout (côté
 *     avions), la plonge au bout de l'autre bande (près du quai des retours) ;
 *   - ou bien là où l'utilisateur le dit (évolution 20 b) : avec une
 *     `disposition` — des colonnes et des rangées du bas —, le tracé est celui
 *     de moteur/disposition.js : des allées fines à la place du couloir,
 *     l'entrée et l'aire de pause en haut à gauche, les avions le long du bord
 *     extérieur de la zone du quai. Les tailles viennent toujours des parts ;
 *   - des rayonnages : le magasin en a toujours ; un autre service en a si sa
 *     fiche le dit (`rayonnages`, un réglage, évolution 20 d). Une zone qui n'a
 *     que les équipes du magasin est un entrepôt, sur toute sa profondeur ;
 *     sinon ils se rangent au fond (`rayonnagesAuFond`), et la zone garde le
 *     devant pour les postes de ses équipes — et la place des deux ;
 *   - ce qui attend le chargement se range au quai, ou dans la zone que l'équipe
 *     de handling a choisie (`attentes`, un réglage, évolution 20 c) : le site
 *     dit laquelle ; aucune autre aire de stockage n'est dessinée.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports;
  const P = () => (enNode ? require('./production.js') : root.MoteurProduction);
  const ORDRE = () => (enNode ? require('./ordre-services.js') : root.OrlyOrdreServices);
  const DISPOSITION = () => (enNode ? require('./disposition.js') : root.OrlyDisposition);

  /** Les services de la production : la préparation et le montage, dans une seule zone. */
  const FOOD = ['preparation', 'prepa'];
  /** Les parts par défaut : trois grandes zones à 1/5, et 2/5 pour tous les autres services. */
  const PARTS = { magasin: 0.2, food: 0.2, armement: 0.2, autres: 0.4 };
  /** Les dimensions fixes du dessin, en mètres de la scène. */
  const COULOIR = 3, PAUSE = { w: 7, h: 8 }, SURFACE_MIN = 600, ALLONGEMENT = 2.2, LARGEUR_MIN = 4;
  /** Une machine : sa largeur, sa profondeur, le pas entre deux rangs, l'écart entre deux colonnes, et la place qu'elle prend. */
  const ECART = 0.8;
  const LIGNE = { w: 9, h: 1.6, pas: 2.8, place: (9 + ECART) * 2.8 }, TUNNEL = { w: 6.5, h: 1.3, pas: 2.6, place: (6.5 + ECART) * 2.6 }, RAYON = { h: 1, pas: 2.2, place: 20 };
  /** La place d'un atelier : un socle, plus de quoi tenir debout autour de ses postes ; avec une marge pour circuler. */
  const MARGE = 1.3;
  const placeAtelier = a => 6 + 2.6 * Math.max(0, +a.personnes || 0);

  const somme = (l, f) => l.reduce((n, x) => n + f(x), 0);
  const personnesDe = l => somme(l, a => Math.max(0, +a.personnes || 0));

  /** La présence d'un atelier dans la journée : de son début à la fin de sa présence (sans règle de poste : 24 h). */
  function presenceDe(a, regime) {
    // Une heure illisible est refusée à la saisie (ateliers.js) ; ici, elle vaut minuit plutôt que d'empêcher le dessin.
    let minute = 0;
    try { minute = P().minutes(a.debut); } catch (e) { minute = 0; }
    const debut = minute + (+a.jour || 0) * P().MINUTES_PAR_JOUR, reg = P().normaliserRegime(a.regime, regime);
    return { debut, fin: debut + (reg.actif && reg.presence > 0 ? reg.presence : P().MINUTES_PAR_JOUR) };
  }

  /**
   * Les lignes robotisées : une par service robot (évolution 20 a). Les équipes d'un même robot se partagent sa ligne, qu'elles
   * se succèdent ou qu'elles soient là en même temps : il n'y a qu'un robot. Deux services robot ont chacun la leur. Les
   * lignes dans l'ordre de l'arrivée de leur première équipe, leurs équipes dans l'ordre de leur arrivée.
   * Rend [{ service, ateliers: [ids] }].
   */
  function lignesDesRobots(robots, regime) {
    const lignes = [];
    for (const x of robots.map(a => ({ id: a.id, service: a.service, ...presenceDe(a, regime) })).sort((p, q) => p.debut - q.debut)) {
      const l = lignes.find(y => y.service === x.service);
      if (l) l.ateliers.push(x.id); else lignes.push({ service: x.service, ateliers: [x.id] });
    }
    return lignes;
  }
  /** Les équipes de chaque ligne robotisée : [[ids des ateliers de la ligne]]. */
  const lignesRobot = (robots, regime) => lignesDesRobots(robots, regime).map(l => l.ateliers);

  /** Les tunnels qui tournent d'une équipe de plonge : ceux de sa liste que quelqu'un tient ; sans liste, un seul. */
  const tournentDe = a => (Array.isArray(a.tunnels) && a.tunnels.length ? P().tunnelsQuiTournent(a).tournent : (+a.personnes > 0 ? [{ nom: 'Tunnel' }] : []));
  /**
   * Les tunnels d'une plonge : le plus grand nombre de machines tenues en même temps. Deux équipes présentes ensemble avec
   * un tunnel du même nom tiennent la même machine ; des équipes qui se succèdent partagent les mêmes tunnels. Rend leurs
   * noms, ceux du premier moment où ils sont le plus nombreux.
   */
  function tunnelsDe(plonges, regime) {
    const eqs = plonges.map(a => { const t = tournentDe(a), cles = P().machinesDesTunnels(a, t); return { ...presenceDe(a, regime), machines: t.map((x, i) => [cles[i], (x && x.nom) || 'Tunnel ' + (i + 1)]) }; });
    let mieux = [];
    for (const t of [...new Set(eqs.map(e => e.debut))].sort((x, y) => x - y)) {
      const tenues = new Map();
      for (const e of eqs) if (e.debut <= t + 1e-9 && e.fin > t + 1e-9) for (const [cle, nom] of e.machines) if (!tenues.has(cle)) tenues.set(cle, nom);
      if (tenues.size > mieux.length) mieux = [...tenues.values()];
    }
    return mieux;
  }

  /** La zone de la production, qui réunit la préparation et le montage. */
  const ZONE_FOOD = 'food';
  const objet = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const texte = x => (typeof x === 'string' && x !== '' ? x : null);

  /**
   * Qui est rattaché à qui, d'après le plan (évolution 20 a) : une annexe qui a un parent, et qui n'est pas « à part entière ».
   * `zones` : les zones du plan ; `base` : ses services d'origine. Le parent est un service de l'unité — un service d'origine
   * qui n'en est pas retiré, ou une autre annexe. Rend { annexe: parent }.
   */
  function parentsDuPlan(zones, base) {
    const liste = (Array.isArray(zones) ? zones : []).filter(z => z && z.id != null), parId = new Map(liste.map(z => [z.id, z]));
    const existe = id => (base && Object.hasOwn(base, id) ? !(parId.get(id) && parId.get(id).retire) : !!parId.get(id) && parId.get(id).kind === 'annexe');
    return Object.fromEntries(liste.filter(z => z.kind === 'annexe' && !z.autonome && texte(z.parent) && z.parent !== z.id && existe(z.parent)).map(z => [z.id, z.parent]));
  }

  /**
   * Le lien d'un service vers celui dont il prend la zone : son réglage « partage la zone de » (s'il n'est pas annulé, et si
   * le service choisi existe), sinon le service auquel son annexe est rattachée, sinon la production pour la préparation et
   * le montage. `annules` : { regles, parents } — les services dont le réglage, ou le rattachement, ne joue pas (une boucle).
   * Rend { vers, regle } — `regle` : le lien vient du réglage —, ou null : il a sa zone.
   */
  function lienDe(s, r, annules, connu) {
    const h = annules && annules.regles.has(s) ? null : texte(objet(r.partages)[s]);
    if (h !== null && h !== s && (!connu || connu(h))) return { vers: h, regle: true };
    const p = annules && annules.parents.has(s) ? null : texte(objet(r.parents)[s]);
    return p !== null && p !== s ? { vers: p, regle: false } : FOOD.includes(s) ? { vers: ZONE_FOOD, regle: false } : null;
  }

  /**
   * La boucle que fermerait le réglage « `service` partage la zone de `hote` » : la liste des services, de `service` à
   * `service` ([cuisine, pâtisserie, cuisine] : la pâtisserie partage déjà la zone de la cuisine) ; null s'il n'en ferme
   * aucune. `r` : { partages, parents }. Le réglage d'avant de `service` ne compte pas : il serait remplacé. `connu(service)` :
   * ce service existe-t-il ? — un réglage resté sur un service supprimé ne joue pas, comme dans `generer` ; sans elle, tous.
   */
  function boucle(r, service, hote, connu) {
    if (service === hote) return [service, hote];
    const reglages = { partages: { ...objet(r && r.partages), [service]: hote }, parents: objet(r && r.parents) }, chemin = [service];
    for (let s = hote; s !== ZONE_FOOD && !chemin.includes(s);) {
      chemin.push(s);
      const l = lienDe(s, reglages, null, connu);
      if (!l) return null;
      if (l.vers === service) return [...chemin, service];
      s = l.vers;
    }
    return null;
  }

  /**
   * La zone de chaque service : il suit son lien, de proche en proche, jusqu'au service — ou à la production — qui ne suit
   * personne. Une boucle ne joue pas : ses réglages sont annulés (ses rattachements, si elle n'a que cela), et elle est
   * nommée. Un réglage vers un service qui n'existe plus ne joue pas non plus, et il est dit.
   * `services` : ceux qui ont une équipe. Rend { zone(service), regle(service) — son réglage joue —, notes: [{ code: 'boucle',
   * services } | { code: 'inconnu', service, hote }] }.
   */
  function zonesDesServices(services, r, noms) {
    const partages = objet(r.partages), parents = objet(r.parents), notes = [], annules = { regles: new Set(), parents: new Set() };
    const noeuds = [...new Set([...services, ...Object.keys(partages), ...Object.keys(parents)])].sort();
    const connus = new Set([...services, ...Object.keys(noms || {}), ...Object.keys(parents), ...Object.values(parents).filter(x => texte(x))]);
    const connu = h => connus.has(h), lien = s => lienDe(s, r, annules, connu);
    for (const s of services.slice().sort()) {
      const h = texte(partages[s]);
      if (h !== null && h !== s && !connu(h)) notes.push({ code: 'inconnu', service: s, hote: h });
    }
    // Les boucles : chacune est annulée, puis on recommence, jusqu'à n'en plus trouver.
    for (let trouve = true; trouve;) {
      trouve = false;
      for (const depart of noeuds) {
        const chemin = [];
        let s = depart;
        while (s !== null && s !== ZONE_FOOD && !chemin.includes(s)) { chemin.push(s); const l = lien(s); s = l ? l.vers : null; }
        if (s === null || s === ZONE_FOOD) continue;
        const tour = chemin.slice(chemin.indexOf(s)), regles = tour.filter(x => lien(x).regle), debut = tour.indexOf(tour.slice().sort()[0]);
        for (const x of regles.length ? regles : tour) (regles.length ? annules.regles : annules.parents).add(x);
        notes.push({ code: 'boucle', services: [...tour.slice(debut), ...tour.slice(0, debut)] });
        trouve = true;
        break;
      }
    }
    const zone = service => { let s = service; for (let l = lien(s); l; l = lien(s)) { s = l.vers; if (s === ZONE_FOOD) break; } return s; };
    return { zone, regle: service => { const l = lien(service); return !!l && l.regle; }, notes };
  }

  /** Le rôle d'un service, seul : le magasin, l'armement, le quai (une équipe de handling), la plonge (une équipe qui lave), ou un autre. */
  const roleDuService = (s, ateliers) => {
    const types = new Set(ateliers.filter(a => a.service === s).map(a => a.type));
    return s === 'magasin' ? 'magasin' : s === 'armement' ? 'armement' : types.has('handling') ? 'quai' : types.has('lavage') ? 'plonge' : 'autre';
  };
  /** Le rôle d'une zone qui réunit plusieurs services : le premier de cette liste qu'un de ses services tient. */
  const ROLES = ['quai', 'magasin', 'food', 'armement', 'plonge', 'autre'];

  /**
   * Les zones du site, dans l'ordre du chemin, et leurs unités.
   * Une unité est ce qui a sa part de surface et sa place : un service qui a un atelier, ou la production — la préparation
   * et le montage réunis (sans celui des deux qu'un réglage envoie dans une autre zone). Sans rattachement ni réglage, une
   * unité fait une zone : ce sont les zones d'avant l'évolution 20.
   * Une zone réunit l'unité dont elle porte le nom et celles qui prennent sa zone (une annexe rattachée, un service qui la
   * partage) ; elle est à la place de la première de ses unités dans le chemin. Les lignes robotisées : celle d'un robot
   * dont le service est accueilli par une autre zone est à son unité, donc dans cette zone ; les autres sont à la
   * production, qui existe alors même sans équipe.
   * Chaque unité : { id, zone, services, ateliers, personnes, lignes } ; chaque zone : { id, nom, role, unites, services,
   * ateliers (dans l'ordre des réglages), personnes, lignes (si elle en a ; la production a toujours la liste) }.
   * Rend { unites, zones, notes }.
   */
  function zonesDe(ateliers, r) {
    const noms = r.noms || {}, ids = [...new Set(ateliers.map(a => a.service))];
    const ordre = ORDRE().avecCases(r.parcours) ? ORDRE().ordreDesServices(r.parcours, ids) : ids;
    const { zone: zoneDe, regle, notes } = zonesDesServices(ids, r, noms);
    const uniteDe = s => (FOOD.includes(s) && !regle(s) ? ZONE_FOOD : s), unites = [];
    for (const s of ordre) {
      const id = uniteDe(s);
      let u = unites.find(x => x.id === id);
      if (!u) unites.push(u = { id, services: [] });
      u.services.push(s);
    }
    const lignes = lignesDesRobots(ateliers.filter(a => a.type === 'robot'), r.regime).map(l => ({ ...l, unite: zoneDe(l.service) !== uniteDe(l.service) ? uniteDe(l.service) : ZONE_FOOD }));
    if (lignes.some(l => l.unite === ZONE_FOOD) && !unites.some(u => u.id === ZONE_FOOD)) unites.push({ id: ZONE_FOOD, services: [] });
    const zones = [];
    for (const u of unites) {
      // Les services de la production dans son ordre (la préparation avant le montage), ses ateliers dans celui des réglages.
      if (u.id === ZONE_FOOD) u.services.sort((p, q) => FOOD.indexOf(p) - FOOD.indexOf(q));
      const siens = ateliers.filter(a => u.services.includes(a.service));
      u.ateliers = siens.map(a => a.id); u.personnes = personnesDe(siens);
      u.lignes = lignes.filter(l => l.unite === u.id).map(l => l.ateliers);
      u.zone = u.id === ZONE_FOOD ? ZONE_FOOD : zoneDe(u.id);
      let z = zones.find(x => x.id === u.zone);
      if (!z) zones.push(z = { id: u.zone, nom: u.zone === ZONE_FOOD ? 'FOOD' : noms[u.zone] || u.zone, unites: [] });
      z.unites.push(u);
    }
    for (const z of zones) {
      // Les services d'une zone dans l'ordre du chemin ; la production d'abord, dans la sienne.
      const services = z.unites.flatMap(u => u.services);
      z.services = z.id === ZONE_FOOD ? [...services.filter(s => FOOD.includes(s)), ...services.filter(s => !FOOD.includes(s))] : services;
      const roles = new Set(z.services.filter(s => !FOOD.includes(s)).map(s => roleDuService(s, ateliers)));
      if (z.id === ZONE_FOOD) roles.add('food');
      z.role = ROLES.find(x => roles.has(x)) || 'autre';
      const siens = ateliers.filter(a => z.services.includes(a.service));
      z.ateliers = siens.map(a => a.id); z.personnes = personnesDe(siens);
      // Ses lignes : celles de ses unités, dans l'ordre de l'arrivée de leur première équipe.
      const siennes = lignes.filter(l => z.unites.some(u => u.id === l.unite)).map(l => l.ateliers);
      if (z.id === ZONE_FOOD || siennes.length) z.lignes = siennes;
    }
    return { unites, zones, notes };
  }

  /**
   * Les parts de surface des unités (`zones` : les unités du site), ramenées à un total de 1. La part d'une unité est la
   * somme de celles de ses services. Une part réglée (en %) remplace le défaut de son service. Par défaut : le magasin et
   * l'armement 1/5 chacun ; la préparation et le montage se partagent 1/5 au prorata de leurs personnes ; les autres
   * services se partagent 2/5 au prorata de leurs personnes. Aucune unité ne descend sous `plancher(unité)` — la place de
   * ses ateliers, en part du site : une part réglée trop petite n'agrandit pas tout le site. Rend une Map unité → part.
   * La part d'une zone que des unités partagent est la somme des leurs (`generer`) : partager une zone ne change ni la
   * taille du site, ni la part des autres.
   */
  function partsDe(zones, ateliers, surfaces, plancher) {
    const reglee = s => { const p = +((surfaces || {})[s]); return Number.isFinite(p) && p > 0 ? p / 100 : null; };
    const pers = s => personnesDe(ateliers.filter(a => a.service === s));
    // La production : ses services qui ont une équipe, où qu'ils soient ; sans aucun, sa zone (pour une ligne) garde 1/5.
    const presents = new Set(zones.flatMap(z => z.services)), foods = FOOD.filter(s => presents.has(s)), totalFood = somme(foods, pers);
    /** La part propre d'un service ; null : il est de ceux qui se partagent les 2/5. */
    const propre = s => reglee(s) ?? (s === 'magasin' ? PARTS.magasin : s === 'armement' ? PARTS.armement
      : FOOD.includes(s) ? PARTS.food * (totalFood > 0 ? pers(s) / totalFood : 1 / foods.length) : null);
    // Par zone : la somme des parts propres de ses services, et les personnes de ceux qui se partagent les 2/5.
    const fixe = new Map(), communs = new Map();
    for (const z of zones) {
      const libres = z.services.filter(s => propre(s) === null);
      fixe.set(z.id, somme(z.services.filter(s => propre(s) !== null), propre) + (z.id === ZONE_FOOD && !foods.length ? PARTS.food : 0));
      if (libres.length) communs.set(z.id, somme(libres, pers));
    }
    // Les 2/5 : au prorata des personnes (à parts égales si personne), sans qu'une zone descende sous son plancher.
    const membres = zones.filter(z => communs.has(z.id)), partage = new Map(membres.map(z => [z.id, 0]));
    const manque = z => Math.max(0, plancher(z) - fixe.get(z.id));
    let libres = membres.slice(), reste = PARTS.autres;
    while (libres.length) {
      const total = somme(libres, z => communs.get(z.id));
      const voulu = z => (total > 0 ? reste * communs.get(z.id) / total : reste / libres.length);
      const sous = libres.filter(z => fixe.get(z.id) + voulu(z) < plancher(z) - 1e-12);
      if (!sous.length) { for (const z of libres) partage.set(z.id, voulu(z)); break; }
      for (const z of sous) { partage.set(z.id, manque(z)); reste -= manque(z); }
      libres = libres.filter(z => !sous.includes(z));
      if (libres.length && reste <= 0) { for (const z of libres) partage.set(z.id, manque(z)); break; }
    }
    const brut = new Map(zones.map(z => [z.id, Math.max(fixe.get(z.id) + (partage.get(z.id) || 0), plancher(z))]));
    const total = somme([...brut.values()], x => x);
    return new Map([...brut].map(([id, x]) => [id, total > 0 ? x / total : 0]));
  }

  /** Les bandes : le magasin en tête de la première, le quai au bout ; la plonge au bout de la seconde ; les autres zones,
   *  dans l'ordre du chemin, dans la bande la moins remplie. */
  function bandesDe(zones, parts) {
    const tete = zones.filter(z => z.role === 'magasin'), quais = zones.filter(z => z.role === 'quai'), plonges = zones.filter(z => z.role === 'plonge');
    const milieu = [[], []], poids = [somme(tete.concat(quais), z => parts.get(z.id)), somme(plonges, z => parts.get(z.id))];
    for (const z of zones.filter(x => !tete.includes(x) && !quais.includes(x) && !plonges.includes(x))) {
      const k = poids[1] < poids[0] - 1e-12 ? 1 : 0;
      milieu[k].push(z); poids[k] += parts.get(z.id);
    }
    const bandes = [tete.concat(milieu[0], quais), milieu[1].concat(plonges)];
    // Une seule bande occupée : c'est la première.
    return bandes[0].length ? bandes : [bandes[1], []];
  }

  /**
   * `n` machines rangées depuis le fond d'une zone (le côté opposé au couloir), dans ses murs : en rangs, sur une colonne
   * tant qu'elles tiennent, sur plusieurs sinon ; dans une zone étroite et profonde, elles se posent dans le sens de la
   * profondeur ; si la zone reste trop petite pour leur taille, elles rétrécissent ensemble. Jamais l'une sur l'autre,
   * jamais hors de la zone. Sans largeur (`forme.w`) : toute la largeur, en rangs. Rend [{ x, y, w, h }].
   */
  function empiler(z, n, forme) {
    if (!(n > 0)) return [];
    const mx = Math.min(1, 0.2 * z.w), my = Math.min(0.6, 0.15 * z.h), W = z.w - 2 * mx, H = z.h - 2 * my, allee = forme.pas - forme.h;
    // Les deux sens : en travers (la machine le long du fond), ou en long ; `a` × `b` : sa taille le long de x et de y.
    const sens = forme.w ? [{ a: forme.w, b: forme.h, ex: ECART, ey: allee }, { a: forme.h, b: forme.w, ex: allee, ey: ECART }] : [{ a: W, b: forme.h, ex: ECART, ey: allee }];
    let mieux = null;
    for (const o of sens) for (let cols = 1; cols <= n; cols++) {
      const rangs = Math.ceil(n / cols), k = Math.min(1, W / (cols * o.a + (cols - 1) * o.ex), H / (rangs * o.b + (rangs - 1) * o.ey));
      if (!mieux || k > mieux.k + 1e-9) mieux = { ...o, cols, rangs, k };
    }
    const { cols, rangs, k } = mieux, w = mieux.a * k, h = mieux.b * k, ex = mieux.ex * k, ey = mieux.ey * k;
    const x0 = z.x + (z.w - (cols * w + (cols - 1) * ex)) / 2;
    return Array.from({ length: n }, (_, i) => {
      const d = my + (i % rangs) * (h + ey);
      return { x: x0 + Math.floor(i / rangs) * (w + ex), y: z.bande === 0 ? z.y + d : z.y + z.h - d - h, w, h };
    });
  }

  /** Les rangées de rayonnages d'un entrepôt (une zone qui n'a que les équipes du magasin) : sur toute sa profondeur. */
  const rangeesDEntrepot = h => Math.max(1, Math.floor((h - 1.2 - RAYON.h) / RAYON.pas) + 1);
  /** Les rangées de rayonnages au fond d'une zone qui a aussi d'autres postes : la place des rayonnages, la moitié de la profondeur au plus. */
  const rangeesAuFond = z => Math.max(1, Math.min(Math.floor(0.5 * z.h / RAYON.pas), Math.ceil(RAYON.place / (Math.max(1, z.w - 2 * Math.min(1, 0.2 * z.w)) * RAYON.pas))));
  /** L'écart entre deux sortes de machines rangées l'une devant l'autre. */
  const ENTRE = 0.6;

  /** Dans une zone qui a des rayonnages au fond et des postes devant, la part de la profondeur que ses machines prennent au plus : des rayonnages seuls ; avec d'autres machines. */
  const FOND = { rayonnages: 0.5, machines: 0.75 };

  /**
   * Les machines d'une zone posée, depuis son fond : { lignes, tunnels, rayonnages }, des rectangles. Une seule sorte : dans
   * toute la zone. Plusieurs sortes (une zone que des services partagent) : l'une devant l'autre — les rayonnages au fond,
   * puis les lignes, puis les tunnels —, chacune dans sa tranche de la profondeur : à leur taille si elles tiennent toutes,
   * resserrées ensemble sinon. Jamais l'une sur l'autre, jamais hors de la zone.
   * Une zone qui a des rayonnages sans être un entrepôt (évolution 20 d) garde le devant libre pour les postes de ses
   * équipes : ses rayonnages ne passent pas la moitié de la profondeur ; avec d'autres machines, l'ensemble ne passe pas
   * les trois quarts — à l'étroit, ils rétrécissent.
   */
  function machinesDe(pose, z) {
    const sortes = [], out = { lignes: [], tunnels: [], rayonnages: [] }, auFond = z.rayons && !z.entrepot;
    if (z.rayons) sortes.push(['rayonnages', RAYON, null]);
    if (z.lignes && z.lignes.length) sortes.push(['lignes', LIGNE, z.lignes.length]);
    if (z.tunnels && z.tunnels.length) sortes.push(['tunnels', TUNNEL, z.tunnels.length]);
    const nombre = n => (n !== null ? n : z.entrepot && sortes.length === 1 ? rangeesDEntrepot(pose.h) : rangeesAuFond(pose));
    const depuisLeFond = m => (pose.bande === 0 ? Math.max(...m.map(p => p.y + p.h)) - pose.y : pose.y + pose.h - Math.min(...m.map(p => p.y)));
    /** La tranche du fond de la zone, de profondeur `h`, à `pris` du fond. */
    const tranche = (pris, h) => ({ ...pose, y: pose.bande === 0 ? pose.y + pris : pose.y + pose.h - pris - h, h });
    if (sortes.length <= 1) {
      for (const [cle, forme, n] of sortes) {
        out[cle] = empiler(pose, nombre(n), forme);
        // Des rayonnages au fond qui passeraient la moitié de la profondeur (une zone peu profonde) : rangés dans cette moitié.
        if (auFond && depuisLeFond(out[cle]) > FOND.rayonnages * pose.h + 1e-9) out[cle] = empiler(tranche(0, FOND.rayonnages * pose.h), nombre(n), forme);
      }
      return out;
    }
    const besoins = sortes.map(([, forme, n]) => depuisLeFond(empiler(pose, nombre(n), forme)) + ENTRE), k = Math.min(1, (auFond ? FOND.machines : 1) * pose.h / somme(besoins, x => x));
    let pris = 0;
    sortes.forEach(([cle, forme, n], i) => {
      const h = besoins[i] * k;
      out[cle] = empiler(tranche(pris, h), nombre(n), forme);
      pris += h;
    });
    return out;
  }

  /**
   * Où se range ce qui attend le chargement (évolution 20 c) : { service du handling: zone }. `attentes` ({ service du
   * handling: service }) est le réglage de la fiche de l'équipe de handling, « Ce qui attend le chargement se range dans
   * la zone de » : le service choisi désigne sa zone (la production se désigne aussi par « food »). Il ne joue que pour un
   * service qui a une équipe de handling, et s'il désigne une zone du site autre que la sienne ; sinon c'est le quai,
   * comme avant, et rien n'est rendu pour ce service.
   */
  function attentesDe(attentes, ateliers, zones) {
    const reglees = objet(attentes), out = {};
    for (const s of new Set(ateliers.filter(a => a.type === 'handling').map(a => a.service))) {
      const choix = Object.prototype.hasOwnProperty.call(reglees, s) ? texte(reglees[s]) : null;
      if (choix === null) continue;
      const z = zones.find(x => x.services.includes(choix)) || zones.find(x => x.id === choix), ici = zones.find(x => x.services.includes(s));
      if (z && z !== ici) out[s] = z.id;
    }
    return out;
  }

  /**
   * Le site généré à partir des réglages : { ateliers, parcours, noms, surfaces, regime, parents, partages, attentes, rayonnages }.
   * `parents` : { annexe: service } — les annexes rattachées, d'après le plan (`parentsDuPlan`) ; `partages` : { service:
   * service } — le réglage « partage la zone de ». Sans eux : une zone par service. `attentes` : { service du handling:
   * service } — le réglage « Ce qui attend le chargement se range dans la zone de » (`attentesDe`). `rayonnages` :
   * { service: true } — le réglage « Des rayonnages dans sa zone » (le magasin en a toujours).
   * Rend { largeur, profondeur, surface, couloir, entree, pause, emprise, avions, zones } ; chaque zone :
   * { id, nom, role, services, ateliers, personnes, part, surface, minimum, bande, x, y, w, h, porte } — plus `lignes` (ses
   * lignes robotisées, chacune avec ses ateliers ; la zone FOOD en a toujours la liste), `tunnels` (une zone qui lave) ou
   * `rayonnages` (la zone du magasin, ou d'un service qui en a ; avec `rayonnagesAuFond` si ce n'est pas un entrepôt). Et `notes`, s'il y a quelque chose à dire : une boucle de zones partagées
   * ({ code: 'boucle', services }), un service choisi qui n'existe plus ({ code: 'inconnu', service, hote }). Et `attentes`,
   * si le réglage joue : { service du handling: zone } — où se range ce qui attend le chargement (évolution 20 c).
   */
  function generer(reglages) {
    const r = reglages || {}, ateliers = (Array.isArray(r.ateliers) ? r.ateliers : []).filter(a => a && a.id != null && a.service != null);
    const { unites, zones, notes } = zonesDe(ateliers, r);
    const vide = { largeur: 0, profondeur: COULOIR, surface: 0, couloir: { x: 0, y: 0, w: 0, h: COULOIR }, entree: { x: 0, y: COULOIR / 2 },
      pause: { x: -PAUSE.w, y: 0, w: PAUSE.w, h: COULOIR }, emprise: { x0: -PAUSE.w, y0: 0, x1: 0, y1: COULOIR }, avions: 'droite', zones: [] };
    if (!zones.length) return vide;
    const parId = new Map(ateliers.map(a => [a.id, a]));
    // Les rayonnages : le magasin en a toujours ; un autre service, si sa fiche le dit (`rayonnages`, évolution 20 d).
    const reglees = objet(r.rayonnages), aDesRayonnages = s => s === 'magasin' || (Object.prototype.hasOwnProperty.call(reglees, s) && reglees[s] === true);
    // Les tunnels : dans la zone de la plonge, et dans toute zone dont un atelier lave (un quai qui a sa propre équipe de
    // lavage) — sauf les équipes de la production et du magasin, qui ont leurs propres machines.
    const tunnels = ids => { const laveurs = ids.map(id => parId.get(id)).filter(a => a.type === 'lavage' && !FOOD.includes(a.service) && a.service !== 'magasin'); return laveurs.length ? tunnelsDe(laveurs, r.regime) : null; };
    for (const u of unites) {
      // La place qu'il faut à l'unité : ses ateliers, ses machines, ses rayonnages.
      const siens = tunnels(u.ateliers);
      u.minimum = MARGE * somme(u.ateliers, id => placeAtelier(parId.get(id))) + u.lignes.length * LIGNE.place
        + (siens ? siens.length * TUNNEL.place : 0) + (u.services.some(aDesRayonnages) ? RAYON.place : 0);
    }
    // Le site : assez grand pour tous, sans descendre sous un minimum ; puis, les parts fixées, pour que chaque unité tienne.
    const base = Math.max(SURFACE_MIN, 1.6 * somme(unites, u => u.minimum));
    // Une unité garde aussi une largeur où ses îlots tiennent : un minimum de surface, d'après la profondeur d'une bande.
    const etroit = LARGEUR_MIN * Math.sqrt(base / ALLONGEMENT) / 2;
    for (const u of unites) u.minimum = Math.max(u.minimum, etroit);
    const partDe = partsDe(unites, ateliers, r.surfaces, u => u.minimum / base);
    const surface = Math.max(base, ...unites.map(u => (partDe.get(u.id) > 0 ? u.minimum / partDe.get(u.id) : 0)));
    // Une zone : la somme des parts et des places de ses unités ; ses tunnels, ses rayonnages.
    for (const z of zones) {
      z.part = somme(z.unites, u => partDe.get(u.id)); z.minimum = somme(z.unites, u => u.minimum);
      const siens = tunnels(z.ateliers);
      if (siens) z.tunnels = siens;
      // Les rayonnages : dans la zone où est le magasin, ou un service qui en a par réglage (évolution 20 d). Un entrepôt,
      // sur toute sa profondeur, si elle n'a que les équipes du magasin (comme avant) ; sinon ils se rangent au fond, et
      // les postes des équipes se placent devant.
      z.rayons = z.services.some(aDesRayonnages);
      z.entrepot = z.rayons && z.ateliers.every(id => parId.get(id).service === 'magasin');
    }
    const parts = new Map(zones.map(z => [z.id, z.part]));
    // Où se range ce qui attend le chargement (évolution 20 c) : dit avec le site, seulement si le réglage joue.
    const attentes = attentesDe(r.attentes, ateliers, zones), fini = site => (Object.keys(attentes).length ? { ...site, attentes } : site);
    /** Une zone posée : ce qu'elle est, sa place ({ bande, x, y, w, h, porte } — et `ouvert`, dans une disposition), ses machines. */
    const poser = (z, place) => {
      const pose = { id: z.id, nom: z.nom, role: z.role, services: z.services, ateliers: z.ateliers, personnes: z.personnes, part: parts.get(z.id), surface: parts.get(z.id) * surface, minimum: z.minimum, ...place };
      const machines = machinesDe(pose, z);
      if (z.lignes) pose.lignes = machines.lignes.map((p, i) => ({ ...p, ateliers: z.lignes[i] }));
      if (z.tunnels) pose.tunnels = machines.tunnels.map((p, i) => ({ nom: z.tunnels[i], ...p }));
      if (z.rayons) pose.rayonnages = machines.rayonnages;
      // Des rayonnages au fond, des postes devant : la scène y range les îlots devant les machines (direct-scene.js).
      if (z.rayons && !z.entrepot) pose.rayonnagesAuFond = true;
      return pose;
    };
    // La disposition de l'utilisateur (évolution 20 b) : des colonnes et des rangées du bas, tracées par moteur/disposition.js.
    const disposition = DISPOSITION() ? DISPOSITION().lire(r.disposition) : null;
    if (disposition) return fini(dispose(zones, disposition, surface, poser, notes));
    const largeur = Math.sqrt(ALLONGEMENT * surface), bandes = bandesDe(zones, parts);
    const fond = bandes.map(b => surface * somme(b, z => parts.get(z.id)) / largeur);
    const y = [0, fond[0] + COULOIR], sortie = [];
    bandes.forEach((b, k) => {
      let x = 0;
      for (const z of b) {
        const w = parts.get(z.id) * surface / fond[k];
        sortie.push(poser(z, { bande: k, x, y: y[k], w, h: fond[k], porte: { x: x + w / 2, y: k === 0 ? fond[0] : fond[0] + COULOIR } })); x += w;
      }
    });
    const profondeur = fond[0] + COULOIR + fond[1];
    // L'aire de pause : à gauche de l'entrée, le long de la seconde bande (ou de la première, s'il n'y en a qu'une).
    const hp = Math.min(PAUSE.h, Math.max(COULOIR, fond[1] || fond[0]));
    const pause = { x: -PAUSE.w, y: fond[1] > 0 ? fond[0] + COULOIR : Math.max(0, fond[0] - hp), w: PAUSE.w, h: hp };
    // Les zones dans l'ordre du chemin, comme elles ont été données.
    const rang = new Map(zones.map((z, i) => [z.id, i]));
    return fini({ largeur, profondeur, surface, couloir: { x: 0, y: fond[0], w: largeur, h: COULOIR }, entree: { x: 0, y: fond[0] + COULOIR / 2 }, pause,
      emprise: { x0: pause.x, y0: 0, x1: largeur, y1: profondeur }, avions: 'droite', zones: sortie.sort((p, q) => rang.get(p.id) - rang.get(q.id)),
      ...(notes.length ? { notes } : {}) });
  }

  /**
   * Le site d'une disposition (évolution 20 b) : les zones là où l'utilisateur les a mises. La disposition s'accorde
   * d'abord aux zones du site (une zone oubliée, en double ou disparue : c'est dit). La largeur : celle du site
   * automatique, plus une allée par colonne. Une zone d'une colonne ouvre sur l'allée de sa gauche ; son fond est en
   * haut (`bande` 0). Une rangée du bas ouvre sur l'allée au-dessus d'elle ; son fond est en bas (`bande` 1).
   * L'allée de l'entrée, en haut, tient lieu de couloir ; l'entrée est à son bout gauche, l'aire de pause à côté. Les
   * avions sont le long du bord extérieur de la zone du quai : à droite ou en bas du site, là où elle a son plus long
   * côté au bord ; si elle n'en a pas (ou sans quai), à droite.
   * Rend le site, avec en plus `allees` ([{ x, y, w, h, sens }]), `disposition` (celle qui est tracée) et, sur chaque zone, `ouvert`.
   */
  function dispose(zones, disposition, surface, poser, notes) {
    const D = DISPOSITION(), a = D.ALLEE, accord = D.accorder(disposition, zones.map(z => z.id));
    const largeur = Math.sqrt(ALLONGEMENT * surface) + accord.colonnes.filter(c => c.length).length * a;
    const trace = D.tracer(accord, new Map(zones.map(z => [z.id, z.part * surface])), largeur, a), profondeur = trace.profondeur;
    const sortie = zones.map(z => { const p = trace.zones.get(z.id); return poser(z, { bande: p.rangee ? 1 : 0, x: p.x, y: p.y, w: p.w, h: p.h, porte: p.porte, ouvert: p.ouvert }); });
    const pause = { x: -PAUSE.w, y: 0, w: PAUSE.w, h: Math.min(PAUSE.h, profondeur) };
    const quai = sortie.find(z => z.role === 'quai'), auBord = (bord, cote) => (Math.abs(bord) < 1e-6 ? cote : 0);
    const avions = quai && auBord(quai.y + quai.h - profondeur, quai.w) > auBord(quai.x + quai.w - largeur, quai.h) ? 'bas' : 'droite';
    const dites = [...notes, ...accord.notes, ...trace.notes];
    return { largeur, profondeur, surface, couloir: { x: 0, y: 0, w: largeur, h: a }, entree: { x: 0, y: a / 2 }, pause,
      emprise: { x0: pause.x, y0: 0, x1: largeur, y1: profondeur }, avions, zones: sortie, allees: trace.allees,
      disposition: { colonnes: accord.colonnes, rangees: accord.rangees }, ...(dites.length ? { notes: dites } : {}) };
  }

  const api = { generer, FOOD, PARTS, lignesRobot, tunnelsDe, parentsDuPlan, boucle };
  if (enNode) module.exports = api;
  else root.OrlySite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
