/* ==========================================================================
 *  LE JEU DE DÉMONSTRATION — un programme de vols inventé
 *
 *  Il vivait dans l'ancien moteur, qui l'utilisait pour ses propres calculs.
 *  Ce n'est pourtant qu'une donnée : un programme de vols au format de
 *  l'import CSV, que l'on charge tant que l'unité n'a pas fourni le sien.
 *
 *  Compagnies et effectifs sont FICTIFS. Ils n'ont aucun lien avec l'activité
 *  réelle de l'unité : ce dépôt est public.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const h = (hh, mm) => hh * 60 + mm;

  const VOLS = Object.freeze([
    { id:'AF1080', cie:'AF',  avion:'A320', sens:'DEP', std:h(6, 40),  bc:12, pc:0,  yc:150, crew:5,  spml:6 },
    { id:'TX305',  cie:'TX',  avion:'A320', sens:'DEP', std:h(7, 5),   bc:16, pc:0,  yc:120, crew:4,  spml:4 },
    { id:'AF1180', cie:'AF',  avion:'A350', sens:'DEP', std:h(7, 30),  bc:32, pc:48, yc:210, crew:8,  spml:12 },
    { id:'AF1380', cie:'AF',  avion:'A350', sens:'DEP', std:h(8, 0),   bc:38, pc:40, yc:230, crew:8,  spml:14 },
    { id:'FWI40',  cie:'FWI', avion:'A350', sens:'DEP', std:h(8, 20),  bc:30, pc:44, yc:200, crew:7,  spml:10 },
    { id:'CRL76',  cie:'CRL', avion:'A380', sens:'DEP', std:h(8, 50),  bc:14, pc:76, yc:340, crew:12, spml:18 },
    { id:'AF1290', cie:'AF',  avion:'A320', sens:'DEP', std:h(9, 10),  bc:12, pc:0,  yc:140, crew:5,  spml:5 },
    { id:'AF1081', cie:'AF',  avion:'A320', sens:'RET', sta:h(6, 10),  bc:12, pc:0,  yc:150 },
    { id:'AF1381', cie:'AF',  avion:'A350', sens:'RET', sta:h(7, 40),  bc:38, pc:40, yc:230 },
    { id:'AF1680', cie:'AF',  avion:'A350', sens:'DEP', std:h(17, 20), bc:32, pc:48, yc:205, crew:7,  spml:11 },
    { id:'TX315',  cie:'TX',  avion:'A320', sens:'DEP', std:h(17, 50), bc:16, pc:0,  yc:130, crew:5,  spml:5 },
    { id:'FWI42',  cie:'FWI', avion:'A350', sens:'DEP', std:h(18, 30), bc:30, pc:44, yc:210, crew:8,  spml:10 },
    { id:'FBU78',  cie:'FBU', avion:'A380', sens:'DEP', std:h(19, 0),  bc:14, pc:76, yc:350, crew:12, spml:20 },
    { id:'CRL78',  cie:'CRL', avion:'A380', sens:'DEP', std:h(19, 40), bc:38, pc:40, yc:235, crew:8,  spml:15 },
    { id:'EK77',   cie:'EK',  avion:'A380', sens:'RET', sta:h(16, 30), bc:14, pc:76, yc:340 },
    { id:'FWI41',  cie:'FWI', avion:'A350', sens:'RET', sta:h(17, 10), bc:30, pc:44, yc:200 },
    { id:'AF1681', cie:'AF',  avion:'A350', sens:'RET', sta:h(18, 0),  bc:32, pc:48, yc:205 },
    { id:'CRL79',  cie:'CRL', avion:'A380', sens:'RET', sta:h(18, 50), bc:38, pc:40, yc:235 }
  ].map(Object.freeze));

  /* Le jeu s'adapte à l'unité (retour d'usage du 02/10 : « supprime QR et DL
   * de la simulation et rajoute des vols des compagnies que j'utilise pour la
   * prépa, comme ça je peux bien paramétrer l'armement ») : QR et DL n'y sont
   * plus, et chaque compagnie que vos équipes préparent ou que vous avez
   * ajoutée, sans départ au programme, reçoit des vols d'essai — deux départs
   * et un retour, avec seulement les classes que vous préparez. Chiffres
   * FICTIFS, comme le reste du jeu. */

  // Passagers d'essai par classe (colonnes du programme).
  const PAX = { YC: ['yc', 150], BC: ['bc', 14], PC: ['pc', 30], CREW: ['crew', 5], SPML: ['spml', 6] };

  /** Les compagnies que l'unité utilise : `Map(compagnie → Set(classes))`, d'après
   *  ses ajouts et les cases cochées de ses équipes (l'armement, « AF/@ARM », ne compte pas). */
  function compagniesUtilisees(etat) {
    const m = new Map();
    const noter = (cie, cab) => {
      cie = String(cie || '').trim().toUpperCase(); cab = String(cab || '').trim().toUpperCase();
      if (!cie || cie === '*' || !PAX[cab]) return;
      if (!m.has(cie)) m.set(cie, new Set());
      m.get(cie).add(cab);
    };
    for (const c of (etat && etat.ajoutees) || []) noter(c.cie, c.cabine);
    for (const a of (etat && etat.ateliers) || []) for (const lot of a.lots || []) for (const id of [].concat(lot)) {
      const s = String(id), i = s.lastIndexOf('/');
      if (i > 0 && !s.includes('/@')) noter(s.slice(0, i), s.slice(i + 1));
    }
    return m;
  }

  /** Le programme `vols`, plus des vols d'essai pour chaque compagnie de `cies`
   *  (`Map(compagnie → Set(classes))`) qui n'y a aucun départ. */
  function completer(vols, cies) {
    const avecDepart = new Set(vols.filter(v => v.sens === 'DEP').map(v => String(v.cie).toUpperCase()));
    const pris = new Set(vols.map(v => v.id));
    const nouvelles = [...(cies || new Map()).keys()].filter(c => !avecDepart.has(c)).sort();
    const out = vols.slice();
    nouvelles.forEach((cie, i) => {
      const pax = {};
      for (const cab of cies.get(cie)) { const [col, n] = PAX[cab]; pax[col] = n; }
      // Étalés dans la journée, une compagnie après l'autre.
      const decale = (i * 25) % 240;
      const id = suffixe => { let x = cie + suffixe, k = 1; while (pris.has(x)) x = cie + suffixe + '-' + (++k); pris.add(x); return x; };
      out.push(Object.freeze({ id: id('-ESSAI1'), cie, avion: 'A320', sens: 'DEP', std: h(6, 15) + decale, ...pax, essai: true }));
      out.push(Object.freeze({ id: id('-ESSAI2'), cie, avion: 'A320', sens: 'DEP', std: h(15, 30) + decale, ...pax, essai: true }));
      out.push(Object.freeze({ id: id('-ESSAI-R'), cie, avion: 'A320', sens: 'RET', sta: h(9, 0) + decale, ...pax, essai: true }));
    });
    return out;
  }

  const api = { VOLS, compagniesUtilisees, completer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
