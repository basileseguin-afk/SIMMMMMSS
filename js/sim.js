/* ============================================================================
 * sim.js — Moteur de simulation de production
 * Modèle : chaque machine suit un cycle
 *   idle -> setup (temps de prépa de l'atelier) -> run (cycle) -> [répète]
 * Bloquée si : personnel insuffisant / matières manquantes / stock plein
 * ==========================================================================*/
window.F = window.F || {};

(function (F) {
  'use strict';

  const State = F.State;

  // États possibles d'une machine
  const ETATS = {
    ARRET: 'arret',        // pas de recette valable
    SANS_PERSONNEL: 'sans_personnel',
    EN_ATTENTE: 'en_attente', // matières manquantes
    BLOQUE: 'bloque',      // stock de sortie plein
    PREPA: 'prepa',        // temps de préparation
    MARCHE: 'marche'       // en production
  };
  F.ETATS = ETATS;

  const Sim = {};

  function runtime(machineId) {
    if (!State._runtime[machineId]) {
      State._runtime[machineId] = { etat: ETATS.ARRET, progres: 0, prepaFaite: false, prepaProgres: 0 };
    }
    return State._runtime[machineId];
  }
  Sim.runtime = runtime;

  // Vérifie la disponibilité des matières en entrée
  function entreesDisponibles(type) {
    return Object.keys(type.entrees).every((pid) => {
      const p = State.produit(pid);
      if (p && p.categorie === 'brut') return true; // matières brutes approvisionnées
      return State.qte(pid) >= type.entrees[pid];
    });
  }

  // Place suffisante en stock pour les sorties (produits non bruts)
  function placeDisponible(type) {
    let ajout = 0;
    Object.keys(type.sorties).forEach((pid) => {
      const p = State.produit(pid);
      if (p && p.categorie !== 'brut') ajout += type.sorties[pid];
    });
    return State.stockOccupe() + ajout <= State.capaciteTotale();
  }

  // Consomme les entrées, produit les sorties, gère l'économie
  function completerCycle(machine, type, atelier) {
    const eco = State.model.economie;

    // Consommation des entrées
    Object.keys(type.entrees).forEach((pid) => {
      const qte = type.entrees[pid];
      const p = State.produit(pid);
      if (p && p.categorie === 'brut') {
        // Achat automatique des matières brutes
        const cout = (p.cout || 0) * qte;
        eco.budget -= cout;
        eco.depenses += cout;
      } else {
        State.model.inventaire[pid] = Math.max(0, State.qte(pid) - qte);
      }
    });

    // Production des sorties
    Object.keys(type.sorties).forEach((pid) => {
      const qte = type.sorties[pid];
      const p = State.produit(pid);

      // Statistiques de production
      State.model.stats.producTotale[pid] = (State.model.stats.producTotale[pid] || 0) + qte;

      if (p && p.categorie === 'fini' && eco.venteAuto) {
        // Vente immédiate des produits finis
        const revenu = State.prixVente(pid) * qte;
        eco.budget += revenu;
        eco.recettes += revenu;
      } else {
        State.model.inventaire[pid] = State.qte(pid) + qte;
      }
    });
  }

  // Un pas de simulation, dt en secondes (sim)
  Sim.step = function (dt) {
    const model = State.model;
    model.horloge.temps += dt;

    let machinesActives = 0;

    model.machines.forEach((machine) => {
      const type = State.typeMachine(machine.typeId);
      const atelier = State.atelier(machine.atelierId);
      const rt = runtime(machine.id);

      if (!type || !atelier) { rt.etat = ETATS.ARRET; return; }

      State.model.stats.tempsMachineTotal += dt;

      // Personnel suffisant ?
      const nbOuvriers = State.ouvriersDeMachine(machine.id).length;
      if (nbOuvriers < type.ouvriers) {
        rt.etat = ETATS.SANS_PERSONNEL;
        rt.prepaFaite = false; rt.prepaProgres = 0;
        return;
      }

      // Matières disponibles ?
      if (!entreesDisponibles(type)) {
        rt.etat = ETATS.EN_ATTENTE;
        return;
      }

      // Place en stock ?
      if (!placeDisponible(type)) {
        rt.etat = ETATS.BLOQUE;
        return;
      }

      machinesActives += 1;

      // Phase de préparation (une fois par redémarrage)
      if (!rt.prepaFaite) {
        rt.etat = ETATS.PREPA;
        rt.prepaProgres += dt;
        if (rt.prepaProgres >= atelier.tempsPrepa) {
          rt.prepaFaite = true;
          rt.prepaProgres = 0;
          rt.progres = 0;
        } else {
          return;
        }
      }

      // Phase de production
      rt.etat = ETATS.MARCHE;
      const cadence = atelier.cadence || 1;
      const dureeCycle = type.tempsBase / cadence;
      rt.progres += dt;

      if (rt.progres >= dureeCycle) {
        rt.progres -= dureeCycle;
        completerCycle(machine, type, atelier);
        State.model.stats.tempsMachineMarche += dureeCycle;
      }
    });

    return machinesActives;
  };

  // --- Boucle temps réel -----------------------------------------------------
  let _raf = null;
  let _last = 0;
  let _onTick = null;

  Sim.setTickCallback = function (cb) { _onTick = cb; };

  function boucle(now) {
    if (!State.model.horloge.enMarche) return;
    const dtReel = Math.min(0.25, (now - _last) / 1000); // borne pour éviter les sauts
    _last = now;
    const dtSim = dtReel * State.model.horloge.vitesse;
    Sim.step(dtSim);
    if (_onTick) _onTick();
    _raf = requestAnimationFrame(boucle);
  }

  Sim.demarrer = function () {
    if (State.model.horloge.enMarche) return;
    State.model.horloge.enMarche = true;
    _last = performance.now();
    _raf = requestAnimationFrame(boucle);
  };

  Sim.pause = function () {
    State.model.horloge.enMarche = false;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    State.save();
  };

  Sim.basculer = function () {
    if (State.model.horloge.enMarche) Sim.pause(); else Sim.demarrer();
  };

  Sim.setVitesse = function (v) { State.model.horloge.vitesse = v; };

  F.Sim = Sim;
})(window.F);
