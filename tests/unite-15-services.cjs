/* Une unité fictive pour les tests du planning des équipes (correction 18 b) :
 * 15 services qui ont des lots le jour des vols, et 50 équipes. Elle part de
 * l'unité fictive de la référence de non-régression
 * (tests/plan-rejoue-fictif.cjs) et lui ajoute des services et des équipes
 * inventés :
 *   — 15 services avec des lots le jour des vols : cuisine, préparation,
 *     montage, armement, dotation, quais, plonge, et huit services « à part
 *     entière » ajoutés après le montage (contrôle, emballage, pesée,
 *     étiquetage, mise en chariot, scellés, filmage, expédition) ;
 *   — 3 services de mise à disposition, sans lot (décontamination, magasin,
 *     réception) : les premiers du chemin, ils se rangent sous « Sans lot ce
 *     jour » — le cas le plus haut du planning, 15 lignes de service et une
 *     ligne « Sans lot ce jour » ;
 *   — 50 équipes : 35 ont des lots le jour des vols, 2 la veille (la cuisine),
 *     13 n'ont aucun lot ; un nom d'équipe long, pour la colonne des noms. La
 *     sauvegarde en porte une de plus, « Montage EST », conditionnelle : fermée
 *     ce jour-là, ses lots passent au montage, le calcul ne la garde pas ;
 *   — une commande (les repas spéciaux d'une compagnie) faite en entier par la
 *     cuisine, la veille : prête la veille, sa limite tombe le jour des vols —
 *     après la fenêtre de la veille (la flèche au bord droit du planning).
 * Aucune donnée de l'unité : services, équipes, vols et compagnies sont fictifs. */
const F = require('./plan-rejoue-fictif.cjs');

/** Les services ajoutés au plan, chacun « à part entière » (une zone annexe autonome, comme la page les crée), dans l'ordre où
 *  ils s'enchaînent après le montage : [identifiant, nom du service, nom de ses équipes]. */
const NOUVEAUX = [['local-controle', 'Contrôle qualité', 'Contrôle'], ['local-emballage', 'Emballage', 'Emballage'], ['local-pesee', 'Pesée', 'Pesée'],
  ['local-etiquetage', 'Étiquetage', 'Étiquetage'], ['local-chariots', 'Mise en chariot', 'Chariots'], ['local-scelles', 'Scellés', 'Scellés'],
  ['local-filmage', 'Filmage', 'Filmage'], ['local-expedition', 'Expédition', 'Expédition']];
const APRES_MONTAGE = NOUVEAUX.map(([id]) => id);
/** Leur barème : quelques minutes par commande et par cabine. */
const MINUTES = { '*/BC': 3, '*/PC': 3, '*/YC': 4, '*/CREW': 2, '*/SPML': 2 };
/** Les lots des trois équipes d'un service ajouté, ou de la dotation : une compagnie par équipe. */
const LOTS = [[['NORD/YC'], ['NORD/BC', 'NORD/PC']], [['SUD/YC'], ['SUD/BC']], [['OUEST/YC'], ['OUEST/BC', 'OUEST/PC']]];

/** La commande faite en entier la veille, par la cuisine. */
const FINIE_LA_VEILLE = 'SUD/SPML';

const equipe = (id, nom, service, lots, x = {}) => ({ id, nom, service, type: 'manuel', debut: '06:00', jour: 0, personnes: 2, pauses: [], lots, regime: { actif: true }, ...x });

/** La sauvegarde complète de l'unité. */
function sauvegarde() {
  const s = F.sauvegardeFictive(), plan = s.contenu['orly-plan-v3'], at = s.contenu['ory-ateliers-v1'], mo = s.contenu['ory-modele-v1'];
  NOUVEAUX.forEach(([id, nom], i) => plan.zones.push({ id, nom, kind: 'annexe', autonome: true, x: 900 + (i % 6) * 660, y: 2260 + Math.floor(i / 6) * 520, w: 520, h: 380,
    color: '#0e8aa8', locked: false, visible: true, approx: true }));
  for (const svc of APRES_MONTAGE) mo.bareme[svc] = { ...MINUTES };
  // Les chemins : après le montage, les huit services ajoutés, l'un après l'autre.
  for (const p of at.parcours) {
    p.noeuds.splice(p.noeuds.indexOf('prepa') + 1, 0, ...APRES_MONTAGE);
    let de = 'prepa';
    for (const vers of APRES_MONTAGE) { p.liens.push({ de, vers }); de = vers; }
  }
  // Les équipes d'avant : l'appui de la dotation et l'équipe sans personne laissent la place à des équipes à la main.
  at.ateliers = at.ateliers.filter(a => !['do', 'mob'].includes(a.id));
  const cu1 = at.ateliers.find(a => a.id === 'cu1');
  cu1.lots = cu1.lots.filter(l => !l.some(c => c.startsWith('OUEST/')));
  // Une commande finie la veille : ses repas spéciaux ne passent que par la cuisine (un chemin d'une seule case).
  at.parcours.push({ id: 'cuisine-seule', nom: 'Cuisine seule', noeuds: ['cuisine'], liens: [] });
  at.parcoursClasse = { ...(at.parcoursClasse || {}), [FINIE_LA_VEILLE]: 'cuisine-seule' };
  cu1.lots.push([FINIE_LA_VEILLE]);
  for (const a of at.ateliers) if (a.id !== 'cu1') a.lots = a.lots.map(l => l.filter(c => c !== FINIE_LA_VEILLE)).filter(l => l.length);
  at.ateliers.push(
    // La cuisine travaille aussi le jour des vols, pour une compagnie.
    equipe('cu3', 'Cuisine du jour', 'cuisine', [['OUEST/BC'], ['OUEST/PC']], { debut: '04:00', personnes: 1 }),
    // Une troisième mise à disposition, sans lot : la réception.
    { id: 'apr', nom: 'Réception', service: 'appros', type: 'dispo', debut: '03:00', jour: 0, personnes: 1, pauses: [], lots: [], regime: { actif: true }, permanent: true },
    // La dotation : trois équipes avec des lots, une sans.
    ...LOTS.map((lots, i) => equipe('dotation-' + (i + 1), 'Dotation ' + (i + 1), 'dotation', [lots[0]], { debut: '03:00' })),
    equipe('dotation-4', 'Dotation 4', 'dotation', [], { debut: '03:00', personnes: 1 }),
    // Après le montage : par service, trois équipes avec des lots, une sans.
    ...NOUVEAUX.flatMap(([svc, , nom]) => [
      ...LOTS.map((lots, i) => equipe(svc + '-' + (i + 1), nom + ' ' + (i + 1), svc, lots, { debut: '07:00' })),
      equipe(svc + '-4', nom + ' 4', svc, [], { debut: '07:00', personnes: 1 })]),
    // Une équipe sans lot au montage, au nom long : la colonne des noms s'élargit, l'infobulle dit le nom entier.
    equipe('mo-9', 'Montage — équipe de renfort du samedi et des jours fériés', 'prepa', [], { debut: '06:00', personnes: 3 }));
  return s;
}

module.exports = { sauvegarde, volsCsv: F.volsCsv, volsSansRetardCsv: F.volsSansRetardCsv, NOUVEAUX, APRES_MONTAGE, FINIE_LA_VEILLE,
  charger: (page, nav, url, o = {}) => F.charger(page, nav, url, { sauvegarde: sauvegarde(), ...o }) };
