/* ==========================================================================
 *  LE PLAN DE BASE — les services de l'unité, ses stockages, ses liens d'origine
 *  ------------------------------------------------------------------------
 *  Ce que la page dessine au premier lancement (sim.js), et ce qu'un calcul
 *  hors du navigateur doit connaître pour relire une sauvegarde
 *  (moteur/journee.js) : les services du plan d'origine, dans leur ordre, et
 *  les liens qu'on a avant d'en avoir saisi. Les positions et libellés des
 *  zones proviennent du plan réel de l'unité ; le plan lui-même (ses tuiles)
 *  est confidentiel et n'est pas dans ce dépôt.
 *
 *  Chaque appel rend une copie neuve : la page déplace et renomme ses zones.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Les services du plan de base (clé = identifiant du service).
   * `approx:true` => emplacement estimé, à confirmer. `sous` : sous-titres. */
  const ZONES = {
    quais:    { nom:'QUAIS · RÉCEPTION', x:700, y:330, w:1960, h:180, approx:true,
                sous:['camions : départ trolleys / retour vols sales'] },
    handling: { nom:'CF DÉPART FOOD', x:1528, y:673.1, w:808.6, h:230.3,
                sous:['trolleys prêts → camion'] },
    appros:   { nom:'RÉCEPTION / APPROS', x:2680, y:560, w:640, h:250, approx:true,
                sous:['réceptions & commandes'] },
    armement: { nom:'ARMEMENT', x:3065.8, y:755.1, w:317.9, h:296,
                sous:['trolleys non-food'] },
    prepa:    { nom:'MONTAGE', x:2180, y:900, w:400, h:350,
                sous:['dressage plateaux','montage trolleys'] },
    // La prépa précède le montage : elle prépare ce que le montage dresse.
    // Emplacement à confirmer sur le plan (« Modifier le plan »).
    preparation: { nom:'PRÉPA', x:2180, y:1262, w:400, h:110, approx:true,
                sous:['préparation avant montage'] },
    magasin:  { nom:'MAGASIN', x:4009.3, y:1052.8, w:486.7, h:140,
                sous:['produit compagnie'] },
    dotation: { nom:'DOTATION', x:1156, y:1387.9, w:348, h:629.9,
                sous:['couverts + serviettes','assiettes propres'] },
    decontam: { nom:'LÉGUMERIE', x:2555.1, y:1446.3, w:165.7, h:115.2,
                sous:['lavage / décontamination'] },
    bobduty:  { nom:'DUTY FREE', x:787.3, y:1519.5, w:348, h:492,
                sous:['buy-on-board'] },
    cuisine:  { nom:'CUISINE', x:1900, y:1560, w:280, h:520, approx:true,
                sous:['tranche · froid · chaud'] },
    plonge:   { nom:'PLONGE', x:1180, y:2090, w:420, h:330, approx:true,
                sous:['lavage des retours'] }
  };

  /* Stockages, chambres froides et locaux : repris tels quels du plan. */
  const STORAGES = [
    { l:'CF départ armement',        x:850,    y:680.6,  w:289.8, h:593.3, cat:'cf' },
    { l:'Congélateur (KSO + cuisine chaude)', x:2355.8, y:692.9, w:204.5, h:227.4, cat:'gel' },
    { l:'SAS plaquage produit congelé', x:2793.9, y:750.8, w:217, h:184.6, cat:'gel' },
    { l:'Montage KSO',               x:2216.7, y:914.1,  w:142.1, h:131.6, cat:'sub' },
    { l:'Sortie KSO',                x:2368.6, y:926.9,  w:186.5, h:152.5, cat:'sub' },
    { l:'Congélateur',               x:2845.3, y:936.8,  w:128,   h:581.3, cat:'gel' },
    { l:'CF + BOF',                  x:2637.4, y:978.4,  w:148.8, h:184.3, cat:'cf' },
    { l:'Réserve local Montage (mise à dispo montage + pain)', x:2270.3, y:1085.3, w:282.8, h:166, cat:'sub' },
    { l:'CF charcuterie',            x:2636.7, y:1177.4, w:146,   h:99.2,  cat:'cf' },
    { l:'CF Fruits & Légumes',       x:2267.8, y:1257.8, w:289.6, h:111.5, cat:'cf' },
    { l:'CF sortie cuisine',         x:2638.7, y:1292.3, w:148.1, h:80.2,  cat:'cf' },
    { l:'CF sortie matière pour prépa montage', x:2272.6, y:1377.7, w:220.2, h:137.9, cat:'cf' },
    { l:'Stockage compagnie',        x:383.1,  y:1533.8, w:380.3, h:492.9, cat:'aire' },
    { l:'Aire de stockage',          x:3033.3, y:1540,   w:390,   h:453.6, cat:'aire' },
    { l:'Aire de stockage',          x:4132,   y:1544,   w:408.7, h:313.9, cat:'aire' },
    { l:'CF Jour (tranché et décontaminé)', x:2420.1, y:1565.3, w:120.1, h:259.5, cat:'cf' },
    { l:'CF intermédiaire (prépa montage + produit fini)', x:2244.9, y:1620.2, w:165.7, h:204.9, cat:'cf' },
    { l:'Refroidissement et sous-vide', x:2194.4, y:1840.6, w:133.6, h:111.2, cat:'cf' },
    { l:'CF sous-vide',              x:2338.4, y:1842.1, w:200.9, h:117.8, cat:'cf' },
    { l:'CF 4e et 5e gamme',         x:2789.2, y:1915.3, w:228,   h:176.8, cat:'cf' },
    { l:'CF PEQ tranche cuisine',    x:2624.3, y:1965.2, w:111.8, h:139.2, cat:'cf' },
    { l:'Aire de stockage',          x:3890,   y:2039.2, w:658.7, h:381.3, cat:'aire' },
    { l:'Local produit chimique',    x:2793.8, y:2095,   w:218.2, h:70.7,  cat:'loc' },
    { l:'Bureau maintenance',        x:2397.3, y:2174.3, w:108.6, h:238,   cat:'loc' },
    { l:'Local QHSE (produit hygiène)', x:2522.3, y:2172.2, w:108, h:241.2, cat:'loc' },
    { l:'Réserve sèche',             x:2651.5, y:2175.9, w:302.2, h:241.8, cat:'sec' },
    { l:'Armement — zone retour',    x:915.2,  y:2182.3, w:208,   h:242.7, cat:'sub' }
  ];

  /* Flux fonctionnels (graphe de précédences §3), entre ateliers. */
  const FLUX = [
    ['magasin','prepa'], ['appros','cuisine'], ['appros','prepa'], ['appros','decontam'],
    ['decontam','cuisine'], ['cuisine','prepa'], ['plonge','prepa'], ['plonge','dotation'],
    ['dotation','quais'], ['dotation','prepa'], ['prepa','handling'], ['handling','quais'],
    ['armement','quais'], ['bobduty','quais']
  ];
  const FLUX_RETOUR = [ ['quais','plonge'], ['quais','armement'] ];

  const copie = x => JSON.parse(JSON.stringify(x));
  const api = {
    /** Les services du plan de base : { id: { nom, x, y, w, h, approx, sous } }, dans leur ordre. */
    zones: () => copie(ZONES),
    /** Les stockages, chambres froides et locaux du plan. */
    stockages: () => copie(STORAGES),
    /** Les liens d'origine entre services : [de, vers]. */
    flux: () => copie(FLUX),
    /** Les liens des retours (le sale qui revient des quais). */
    fluxRetour: () => copie(FLUX_RETOUR)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPlanBase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
