/* ==========================================================================
 *  LA JOURNÉE REJOUÉE — ce que montre la vue Simulation
 *
 *  L'ancien moteur calculait la journée *pendant* qu'on la regardait : d'où un
 *  bouton « Lancer », une vitesse de lecture, et des réglages qui se
 *  verrouillaient une fois l'essai commencé.
 *
 *  Le modèle par ateliers calcule la journée **d'un coup**. Il n'y a donc plus
 *  rien à lancer : il y a une journée déjà calculée, qu'on **relit**. Changer
 *  un réglage la recalcule dans l'instant — plus de verrou, plus de
 *  « Recommencer ».
 *
 *  Ce module ne simule rien. Il répond à une seule question, pour un instant
 *  donné : **où en est-on ?** Le reste de l'interface s'en sert pour colorer le
 *  plan et remplir les indicateurs.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Quatre états, et quatre seulement. Ils se lisent sur le plan sans légende :
   * ce qui travaille, ce qui attend quelqu'un, ce qui a fini, ce qui n'a pas
   * commencé. Un cinquième aurait demandé une couleur de plus. */
  const ETATS = ['travail', 'attente', 'fini', 'avenir'];

  /** Les bornes de la journée calculée : du premier départ à la dernière fin. */
  function bornes(resultat) {
    const lots = (resultat && resultat.lots) || [];
    if (!lots.length) return { debut: 0, fin: 0, vide: true };
    let debut = Infinity, fin = -Infinity;
    for (const l of lots) {
      // L'attente des amonts fait partie de la journée : un atelier qui patiente
      // depuis 4 h du matin doit se voir patienter, pas apparaître d'un coup.
      const d = l.debut - (l.attente || 0);
      if (Number.isFinite(d)) debut = Math.min(debut, d);
      const f = l.fin == null ? l.debut : l.fin;
      if (Number.isFinite(f)) fin = Math.max(fin, f);
    }
    if (!Number.isFinite(debut) || !Number.isFinite(fin)) return { debut: 0, fin: 0, vide: true };
    // Une journée sans épaisseur ne se relit pas : on lui donne une heure.
    if (fin <= debut) fin = debut + 60;
    return { debut, fin, vide: false };
  }

  /**
   * Où en est chaque service à l'instant `t` ?
   *
   * @returns {object} { etat, lot, nom, classes } par identifiant de service
   */
  function servicesA(resultat, t) {
    const out = {};
    for (const l of ((resultat && resultat.lots) || [])) {
      const s = l.service; if (!s) continue;
      const courant = out[s] || (out[s] = { etat: 'avenir', lot: null, nom: '', classes: [] });
      const fin = l.fin == null ? Infinity : l.fin;
      const depuis = l.debut - (l.attente || 0);

      // Une mise à disposition n'a pas de durée : elle ouvre, puis elle est là.
      if (l.dispo) {
        if (t >= l.debut && courant.etat !== 'travail') {
          courant.etat = 'fini'; courant.nom = l.nom; courant.classes = l.classes || [];
        }
        continue;
      }
      if (t >= l.debut && t < fin) {
        courant.etat = 'travail'; courant.lot = l; courant.nom = l.nom; courant.classes = l.classes || [];
      } else if (courant.etat !== 'travail' && t >= depuis && t < l.debut) {
        courant.etat = 'attente'; courant.lot = l; courant.nom = l.nom; courant.classes = l.classes || [];
      } else if (courant.etat === 'avenir' && t >= fin) {
        courant.etat = 'fini'; courant.nom = l.nom; courant.classes = l.classes || [];
      }
    }
    return out;
  }

  /**
   * Les chiffres de l'instant `t`.
   *
   * `enRetard` compte les classes qui **auraient dû être parties** : leur
   * échéance est passée et elles ne sont pas sorties. C'est le seul chiffre
   * sur lequel on peut agir pendant qu'on regarde.
   */
  function chiffresA(resultat, t) {
    const par = (resultat && resultat.parClasse) || {};
    const suivies = Object.values(par).filter(c => !c.absente);
    let sorties = 0, enRetard = 0, sortiesEnRetard = 0, exigibles = 0, tenues = 0;
    for (const c of suivies) {
      const dehors = c.fin != null && c.fin <= t;
      if (dehors) { sorties++; if (c.fin > c.echeance) sortiesEnRetard++; }
      else if (t > c.echeance) enRetard++;
      // Une échéance passée est une promesse à juger : tenue si la classe est
      // sortie avant. Tant qu'aucune n'est passée, il n'y a rien à juger — et
      // afficher « 0 % » à l'aube accuserait une journée qui n'a rien raté.
      if (c.echeance <= t) { exigibles++; if (c.fin != null && c.fin <= c.echeance) tenues++; }
    }
    const services = servicesA(resultat, t);
    const etats = Object.values(services);
    return {
      suivies: suivies.length,
      sorties,
      sortiesEnRetard,
      enRetard,
      exigibles,
      tenues,
      auTravail: etats.filter(s => s.etat === 'travail').length,
      enAttente: etats.filter(s => s.etat === 'attente').length,
      part: suivies.length ? Math.round(sorties / suivies.length * 100) : null
    };
  }

  /** Tout ce qu'il faut pour dessiner l'instant `t`, en un seul appel. */
  function instant(resultat, t) {
    return { t, services: servicesA(resultat, t), chiffres: chiffresA(resultat, t) };
  }

  /**
   * Le premier instant où quelque chose change : c'est là qu'il faut sauter
   * quand on avance pas à pas, plutôt que de minute en minute dans le vide.
   */
  function prochainChangement(resultat, t) {
    let suivant = Infinity;
    for (const l of ((resultat && resultat.lots) || [])) {
      for (const borne of [l.debut - (l.attente || 0), l.debut, l.fin]) {
        if (Number.isFinite(borne) && borne > t) suivant = Math.min(suivant, borne);
      }
    }
    return Number.isFinite(suivant) ? suivant : null;
  }

  const api = { ETATS, bornes, servicesA, chiffresA, instant, prochainChangement };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
