/* ============================================================================
 * state.js — État global, persistance (localStorage) et helpers d'accès
 * ==========================================================================*/
window.F = window.F || {};

(function (F) {
  'use strict';

  const STORAGE_KEY = 'usine-sim-v1';

  const State = {
    model: null,
    listeners: [],       // callbacks appelés quand le modèle change (hors tick)
    journal: []          // journal d'événements (max 200)
  };

  // --- Persistance -----------------------------------------------------------
  State.save = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(State.model));
      return true;
    } catch (e) {
      console.warn('Sauvegarde impossible :', e);
      return false;
    }
  };

  State.load = function () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const m = JSON.parse(raw);
      if (!m || !m.version) return false;
      State.model = m;
      // Sécurise les champs susceptibles de manquer sur d'anciennes sauvegardes
      State.model.inventaire = State.model.inventaire || {};
      State.model.stats = State.model.stats || { producTotale: {}, tempsMachineMarche: 0, tempsMachineTotal: 0 };
      State.model.horloge.enMarche = false;
      return true;
    } catch (e) {
      console.warn('Chargement impossible :', e);
      return false;
    }
  };

  State.reset = function () {
    State.model = F.defaultModel();
    State.journal = [];
    State.save();
    State.emit();
  };

  State.init = function () {
    if (!State.load()) {
      State.model = F.defaultModel();
      State.save();
    }
  };

  // --- Abonnement / notifications --------------------------------------------
  State.subscribe = function (cb) { State.listeners.push(cb); };
  State.emit = function () {
    State.listeners.forEach((cb) => {
      try { cb(State.model); } catch (e) { console.error(e); }
    });
  };
  // À appeler après toute mutation structurelle (ajout/suppression/édition)
  State.commit = function () {
    State.save();
    State.emit();
  };

  // --- Journal ---------------------------------------------------------------
  State.log = function (type, message) {
    State.journal.unshift({ t: State.model.horloge.temps, type: type, message: message });
    if (State.journal.length > 200) State.journal.length = 200;
  };

  // --- Helpers d'accès -------------------------------------------------------
  State.produit = function (id) { return State.model.produits.find((p) => p.id === id); };
  State.typeMachine = function (id) { return State.model.typesMachine.find((t) => t.id === id); };
  State.atelier = function (id) { return State.model.ateliers.find((a) => a.id === id); };
  State.machine = function (id) { return State.model.machines.find((m) => m.id === id); };
  State.ouvrier = function (id) { return State.model.ouvriers.find((o) => o.id === id); };
  State.stockage = function (id) { return State.model.stockages.find((s) => s.id === id); };

  State.machinesDeAtelier = function (atelierId) {
    return State.model.machines.filter((m) => m.atelierId === atelierId);
  };
  State.ouvriersDeAtelier = function (atelierId) {
    return State.model.ouvriers.filter((o) => o.atelierId === atelierId);
  };
  State.ouvriersDeMachine = function (machineId) {
    return State.model.ouvriers.filter((o) => o.machineId === machineId);
  };

  // Capacité totale de stockage (somme des zones)
  State.capaciteTotale = function () {
    return State.model.stockages.reduce((s, z) => s + (z.capacite || 0), 0);
  };
  // Nombre total d'unités stockées (produits non bruts)
  State.stockOccupe = function () {
    let total = 0;
    Object.keys(State.model.inventaire).forEach((pid) => {
      const p = State.produit(pid);
      if (p && p.categorie !== 'brut') total += State.model.inventaire[pid];
    });
    return total;
  };

  State.qte = function (produitId) { return State.model.inventaire[produitId] || 0; };

  // Prix de vente effectif d'un produit
  State.prixVente = function (produitId) {
    const eco = State.model.economie;
    if (eco.prixParProduit && eco.prixParProduit[produitId] != null) return eco.prixParProduit[produitId];
    const p = State.produit(produitId);
    return p ? p.prix : 0;
  };

  // --- Mutations : ateliers ---------------------------------------------------
  State.ajouterAtelier = function (data) {
    const couleurs = ['#e8843c', '#4a90d9', '#6cbf6c', '#c85cc8', '#d9b64a', '#4ac8c0'];
    const at = {
      id: F.uid('at'),
      nom: (data && data.nom) || 'Nouvel atelier',
      tempsPrepa: (data && +data.tempsPrepa) || 5,
      cadence: (data && +data.cadence) || 1,
      couleur: couleurs[State.model.ateliers.length % couleurs.length]
    };
    State.model.ateliers.push(at);
    State.log('atelier', 'Atelier créé : ' + at.nom);
    State.commit();
    return at;
  };

  State.supprimerAtelier = function (id) {
    // Libère les machines et les ouvriers rattachés
    State.machinesDeAtelier(id).forEach((m) => State.supprimerMachine(m.id, true));
    State.model.ouvriers = State.model.ouvriers.filter((o) => o.atelierId !== id);
    State.model.ateliers = State.model.ateliers.filter((a) => a.id !== id);
    State.log('atelier', 'Atelier supprimé');
    State.commit();
  };

  // --- Mutations : machines ---------------------------------------------------
  State.ajouterMachine = function (atelierId, typeId, nom) {
    const type = State.typeMachine(typeId);
    if (!type) return null;
    const compte = State.model.machines.filter((m) => m.typeId === typeId).length + 1;
    const m = {
      id: F.uid('m'),
      typeId: typeId,
      atelierId: atelierId,
      nom: nom || (type.nom + ' n°' + compte)
    };
    State.model.machines.push(m);
    State.log('machine', 'Machine ajoutée : ' + m.nom);
    State.commit();
    return m;
  };

  State.supprimerMachine = function (id, silencieux) {
    // Détache les ouvriers de la machine (ils restent dans l'atelier)
    State.ouvriersDeMachine(id).forEach((o) => { o.machineId = null; });
    State.model.machines = State.model.machines.filter((m) => m.id !== id);
    delete State._runtime[id];
    if (!silencieux) { State.log('machine', 'Machine supprimée'); State.commit(); }
  };

  // --- Mutations : personnel --------------------------------------------------
  State.ajouterOuvrier = function (atelierId) {
    const used = State.model.ouvriers.map((o) => o.nom);
    const o = { id: F.uid('o'), nom: F.randomPrenom(used), atelierId: atelierId || null, machineId: null };
    State.model.ouvriers.push(o);
    State.log('personnel', 'Embauche : ' + o.nom);
    State.commit();
    return o;
  };

  State.supprimerOuvrier = function (id) {
    const o = State.ouvrier(id);
    State.model.ouvriers = State.model.ouvriers.filter((x) => x.id !== id);
    if (o) State.log('personnel', 'Départ : ' + o.nom);
    State.commit();
  };

  State.affecterOuvrier = function (ouvrierId, atelierId, machineId) {
    const o = State.ouvrier(ouvrierId);
    if (!o) return;
    o.atelierId = atelierId || null;
    o.machineId = machineId || null;
    State.commit();
  };

  // --- Mutations : stockage ---------------------------------------------------
  State.ajouterStockage = function (nom, capacite) {
    const s = { id: F.uid('sto'), nom: nom || 'Zone de stockage', capacite: +capacite || 100 };
    State.model.stockages.push(s);
    State.log('stockage', 'Zone créée : ' + s.nom);
    State.commit();
    return s;
  };
  State.supprimerStockage = function (id) {
    State.model.stockages = State.model.stockages.filter((s) => s.id !== id);
    State.log('stockage', 'Zone supprimée');
    State.commit();
  };

  // --- Mutations : produits & types de machine (catalogue) --------------------
  State.ajouterProduit = function (data) {
    const p = {
      id: F.uid('p'),
      nom: data.nom || 'Produit',
      icone: data.icone || '📦',
      categorie: data.categorie || 'fini',
      cout: +data.cout || 0,
      prix: +data.prix || 0
    };
    State.model.produits.push(p);
    State.commit();
    return p;
  };
  State.supprimerProduit = function (id) {
    State.model.produits = State.model.produits.filter((p) => p.id !== id);
    delete State.model.inventaire[id];
    State.commit();
  };

  State.ajouterTypeMachine = function (data) {
    const t = {
      id: F.uid('mt'),
      nom: data.nom || 'Machine',
      icone: data.icone || '🛠️',
      ouvriers: +data.ouvriers || 1,
      tempsBase: +data.tempsBase || 5,
      entrees: data.entrees || {},
      sorties: data.sorties || {}
    };
    State.model.typesMachine.push(t);
    State.commit();
    return t;
  };
  State.supprimerTypeMachine = function (id) {
    // Ne supprime pas s'il est utilisé
    if (State.model.machines.some((m) => m.typeId === id)) return false;
    State.model.typesMachine = State.model.typesMachine.filter((t) => t.id !== id);
    State.commit();
    return true;
  };

  // Runtime : état de simulation par machine (non persisté)
  State._runtime = {};

  F.State = State;
})(window.F);
