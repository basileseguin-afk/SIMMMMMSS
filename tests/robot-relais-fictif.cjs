/* Évolution 21 (c) — une unité fictive avec deux équipes de robot sur la même ligne, pour le relais dans les résultats.
 * L'unité de tests/plan-rejoue-fictif.cjs (fictive : rien d'une vraie unité), où le robot du matin a du temps devant lui
 * après sa commande, et où une équipe du soir, sur la même ligne, porte plus de plateaux que la ligne n'en fait pendant
 * son poste :
 *   — `suffit` : le matin avance assez de vols pour que le soir tienne dans son horaire ;
 *   — `insuffisant` : le soir arrive plus tôt et reste moins longtemps ; le relais ne suffit pas, il dépasse encore. */
const F = require('./plan-rejoue-fictif.cjs');

/** La sauvegarde de l'unité : `presence` du soir en minutes, `debut` de son poste. */
function sauvegarde({ debut = '07:00', presence = 210 } = {}) {
  const s = F.sauvegardeFictive(), etat = s.contenu['ory-ateliers-v1'], modele = s.contenu['ory-modele-v1'] || (s.contenu['ory-modele-v1'] = {});
  const sans = (lots, id) => lots.map(l => l.filter(c => c !== id)).filter(l => l.length);
  // Les plateaux de NORD et de SUD passent du montage à la main à la ligne du robot, pour l'équipe du soir.
  const montage = etat.ateliers.find(a => a.id === 'mo');
  montage.lots = sans(sans(montage.lots, 'NORD/YC'), 'SUD/YC');
  const matin = etat.ateliers.find(a => a.id === 'rb');
  Object.assign(matin, { nom: 'Robot matin' });
  etat.ateliers.splice(etat.ateliers.indexOf(matin) + 1, 0, { ...JSON.parse(JSON.stringify(matin)), id: 'rb2', nom: 'Robot soir', debut,
    lots: [['SUD/YC'], ['NORD/YC']], regime: { actif: true, presence } });
  // Une équipe qui n'a pas fini reste en heures sup : son dépassement se lit dans « Où ça coince ».
  modele.heuresSup = { actif: true, plafond: 180 };
  return s;
}
const suffit = () => sauvegarde({ debut: '07:00', presence: 210 }), insuffisant = () => sauvegarde({ debut: '06:30', presence: 120 });

module.exports = { sauvegarde, suffit, insuffisant, volsCsv: F.volsCsv, charger: F.charger };
