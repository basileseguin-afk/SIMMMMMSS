/* ==========================================================================
 *  PICTOGRAMMES — un dessin au trait par idée, et une couleur par sens
 *
 *  Le site se lit d'abord en images : un pictogramme par étape, un par
 *  service (cuisine, plonge, montage…), un par état (au travail, attend,
 *  fini). Tous sur une grille de 24, au trait, sans remplissage : ils
 *  prennent la couleur du texte qui les porte (`currentColor`).
 *
 *  Les couleurs ont un sens et un seul :
 *    - une par ÉTAPE (vols, équipes, temps, journée), pour se repérer ;
 *    - une par CLASSE de cabine (Business, Premium…), pour la reconnaître
 *      partout — toujours accompagnée de son nom, jamais seule ;
 *    - les couleurs d'ÉTAT (vert, ambre, rouge) sont réservées aux états.
 *  Palettes validées contre le daltonisme (clair et sombre).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const TRAITS = {
    avion: '<path d="M10.5 3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V9l7.5 4.5V16l-7.5-2.3V19l2.5 1.8V22L12 21l-4 1v-1.2l2.5-1.8v-5.3L3 16v-2.5L10.5 9z"/>',
    equipe: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 20c0-3.3 2.5-5.8 5.5-5.8s5.5 2.5 5.5 5.8M14.5 14.6c.8-.3 1.6-.5 2.5-.5 2.5 0 4.5 2.1 4.5 5"/>',
    chrono: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5"/>',
    journee: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M10.5 13.5v4l3.5-2z"/>',
    unite: '<path d="M3 20.5h18M5 20.5V9l7-5 7 5v11.5"/><path d="M9.5 20.5v-5h5v5"/>',
    camion: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.2v3.3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    depart: '<path d="M3 17.5h18M5 14.5l-1.5-4 2-.6 2.5 2.4 4.5-1.5-3-6 2.5-.8 5.5 5.2 3.3-1c1-.3 1.9.2 2.1 1s-.3 1.6-1.2 1.9L6.5 16z"/>',
    boite: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
    trolley: '<rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 8h14M5 13h14"/><circle cx="8" cy="20.5" r="1.4"/><circle cx="16" cy="20.5" r="1.4"/>',
    plateau: '<path d="M2.5 16.5h19M4.5 16.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5M12 9V7.5M10.5 7h3"/><path d="M4 19.5h16"/>',
    etagere: '<path d="M3.5 3v18M20.5 3v18M3.5 9h17M3.5 15h17M3.5 21h17"/><rect x="6" y="5" width="4" height="4"/><rect x="12.5" y="11" width="5" height="4"/>',
    couverts: '<path d="M7 3v7c0 1.1.9 2 2 2s2-.9 2-2V3M9 3v18M17 21V3c-2 1.5-3 4-3 7 0 1.5.8 2.5 3 2.5"/>',
    carotte: '<path d="M14 10 5.5 20c-.6.7-1.9-.6-1.2-1.2L14 10zM14 10c1.5-1.5 4-1.5 5 .5-2 .9-3.5 2.4-4.5 4.5-2-1-2-3.5-.5-5zM15.5 8.5 18 3M17 9.5l4.5-1.5"/>',
    sac: '<path d="M5 8h14l-1 12.5H6zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
    marmite: '<path d="M4 10h16v6.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5zM2 10h20M9 4c0 1.5 1 1.5 1 3M13.5 4c0 1.5 1 1.5 1 3"/>',
    gouttes: '<path d="M12 3s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    service: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12h8M12 8v8"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
    sablier: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>',
    alerte: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    croix: '<path d="M6 6l12 12M18 6 6 18"/>',
    lecture: '<path d="M7 4.5v15l12-7.5z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.4"/>',
    fleche: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    ampoule: '<path d="M9 18h6M10 21h4M8.5 14.5C7 13.4 6 11.6 6 9.5a6 6 0 0 1 12 0c0 2.1-1 3.9-2.5 5V16h-7z"/>'
  };

  /** Un pictogramme, en SVG inline. `titre` le rend lisible aux lecteurs d'écran. */
  function ico(nom, classe, titre) {
    const t = TRAITS[nom] || TRAITS.service;
    return `<svg class="ico${classe ? ' ' + classe : ''}" viewBox="0 0 24 24" ${titre ? `role="img" aria-label="${titre}"` : 'aria-hidden="true"'}>${t}</svg>`;
  }

  /** Le pictogramme d'un service, d'après son identifiant ou son nom. */
  function icoService(id, nom) {
    const s = (String(id || '') + ' ' + String(nom || '')).toLowerCase();
    const regles = [
      [/plonge|lavage/, 'gouttes'], [/cuisine/, 'marmite'], [/l[ée]gumerie|decontam/, 'carotte'],
      [/montage|prepa/, 'plateau'], [/dotation/, 'couverts'], [/magasin/, 'etagere'],
      [/armement/, 'trolley'], [/duty|bobduty|boutique/, 'sac'], [/quais|camion/, 'camion'],
      [/d[ée]part|handling/, 'depart'], [/appro|r[ée]ception/, 'boite']
    ];
    for (const [re, n] of regles) if (re.test(s)) return n;
    return 'service';
  }

  /** Les étapes et leur couleur (variables CSS définies dans histoire.css). */
  const ETAPES = {
    vols: { ico: 'avion', couleur: 'var(--c-vols)' },
    ateliers: { ico: 'equipe', couleur: 'var(--c-equipes)' },
    reglages: { ico: 'chrono', couleur: 'var(--c-temps)' },
    plan: { ico: 'journee', couleur: 'var(--c-journee)' },
    flux: { ico: 'unite', couleur: 'var(--c-unite)' }
  };

  /** Une classe de cabine : sa pastille de couleur et son nom, jamais l'un sans l'autre. */
  function puceClasse(cabine) {
    return `<span class="puce-classe" data-cab="${String(cabine).replace(/[^A-Z]/g, '')}" aria-hidden="true"></span>`;
  }

  const api = { TRAITS, ico, icoService, ETAPES, puceClasse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyIcones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
