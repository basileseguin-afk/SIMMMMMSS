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
    { id:'DL84',   cie:'DL',  avion:'B777', sens:'DEP', std:h(8, 0),   bc:38, pc:40, yc:230, crew:8,  spml:14 },
    { id:'FWI40',  cie:'FWI', avion:'A350', sens:'DEP', std:h(8, 20),  bc:30, pc:44, yc:200, crew:7,  spml:10 },
    { id:'CRL76',  cie:'CRL', avion:'A380', sens:'DEP', std:h(8, 50),  bc:14, pc:76, yc:340, crew:12, spml:18 },
    { id:'AF1290', cie:'AF',  avion:'A320', sens:'DEP', std:h(9, 10),  bc:12, pc:0,  yc:140, crew:5,  spml:5 },
    { id:'AF1081', cie:'AF',  avion:'A320', sens:'RET', sta:h(6, 10),  bc:12, pc:0,  yc:150 },
    { id:'DL85',   cie:'DL',  avion:'B777', sens:'RET', sta:h(7, 40),  bc:38, pc:40, yc:230 },
    { id:'AF1680', cie:'AF',  avion:'A350', sens:'DEP', std:h(17, 20), bc:32, pc:48, yc:205, crew:7,  spml:11 },
    { id:'TX315',  cie:'TX',  avion:'A320', sens:'DEP', std:h(17, 50), bc:16, pc:0,  yc:130, crew:5,  spml:5 },
    { id:'QR42',   cie:'QR',  avion:'A350', sens:'DEP', std:h(18, 30), bc:30, pc:44, yc:210, crew:8,  spml:10 },
    { id:'FBU78',  cie:'FBU', avion:'A380', sens:'DEP', std:h(19, 0),  bc:14, pc:76, yc:350, crew:12, spml:20 },
    { id:'DL88',   cie:'DL',  avion:'B777', sens:'DEP', std:h(19, 40), bc:38, pc:40, yc:235, crew:8,  spml:15 },
    { id:'EK77',   cie:'EK',  avion:'A380', sens:'RET', sta:h(16, 30), bc:14, pc:76, yc:340 },
    { id:'QR41',   cie:'QR',  avion:'A350', sens:'RET', sta:h(17, 10), bc:30, pc:44, yc:200 },
    { id:'AF1681', cie:'AF',  avion:'A350', sens:'RET', sta:h(18, 0),  bc:32, pc:48, yc:205 },
    { id:'DL89',   cie:'DL',  avion:'B777', sens:'RET', sta:h(18, 50), bc:38, pc:40, yc:235 }
  ].map(Object.freeze));

  const api = { VOLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
