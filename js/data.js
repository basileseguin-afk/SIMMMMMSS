/* ============================================================================
 * data.js — Catalogue par défaut et création du modèle initial
 * Namespace global : window.F
 * ==========================================================================*/
window.F = window.F || {};

(function (F) {
  'use strict';

  // Identifiants uniques courts
  let _seq = 0;
  F.uid = function (prefix) {
    _seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + _seq.toString(36);
  };

  // --- Catalogue de produits par défaut --------------------------------------
  // category : 'brut' (matière première, approvisionnée), 'intermediaire', 'fini'
  // cout  : prix d'achat unitaire (matières brutes)
  // prix  : prix de vente unitaire (produits finis)
  F.DEFAULT_PRODUCTS = [
    { id: 'p_bois',      nom: 'Bois',        icone: '🪵', categorie: 'brut',          cout: 2,  prix: 0 },
    { id: 'p_metal',     nom: 'Métal',       icone: '🔩', categorie: 'brut',          cout: 4,  prix: 0 },
    { id: 'p_plastique', nom: 'Plastique',   icone: '🧪', categorie: 'brut',          cout: 3,  prix: 0 },
    { id: 'p_tissu',     nom: 'Tissu',       icone: '🧵', categorie: 'brut',          cout: 3,  prix: 0 },

    { id: 'p_planche',   nom: 'Planche',     icone: '🟫', categorie: 'intermediaire', cout: 0,  prix: 6 },
    { id: 'p_vis',       nom: 'Vis',         icone: '🔧', categorie: 'intermediaire', cout: 0,  prix: 3 },
    { id: 'p_coque',     nom: 'Coque',       icone: '⚙️', categorie: 'intermediaire', cout: 0,  prix: 7 },
    { id: 'p_coussin',   nom: 'Coussin',     icone: '🛋️', categorie: 'intermediaire', cout: 0,  prix: 9 },

    { id: 'p_chaise',    nom: 'Chaise',      icone: '🪑', categorie: 'fini',          cout: 0,  prix: 45 },
    { id: 'p_gadget',    nom: 'Gadget',      icone: '📱', categorie: 'fini',          cout: 0,  prix: 70 },
    { id: 'p_fauteuil',  nom: 'Fauteuil',    icone: '💺', categorie: 'fini',          cout: 0,  prix: 120 }
  ];

  // --- Types de machines par défaut ------------------------------------------
  // ouvriers  : nombre d'ouvriers requis pour tourner
  // tempsBase : secondes (sim) par cycle à cadence 1.0
  // entrees / sorties : { produitId: quantite }
  F.DEFAULT_MACHINE_TYPES = [
    {
      id: 'mt_scie', nom: 'Scie',           icone: '🪚', ouvriers: 1, tempsBase: 4,
      entrees: { p_bois: 2 },               sorties: { p_planche: 3 }
    },
    {
      id: 'mt_presse', nom: 'Presse',       icone: '🗜️', ouvriers: 1, tempsBase: 3,
      entrees: { p_metal: 1 },              sorties: { p_vis: 4 }
    },
    {
      id: 'mt_mouleuse', nom: 'Mouleuse',   icone: '🏭', ouvriers: 2, tempsBase: 6,
      entrees: { p_plastique: 3 },          sorties: { p_coque: 1 }
    },
    {
      id: 'mt_couture', nom: 'Atelier couture', icone: '🧶', ouvriers: 1, tempsBase: 5,
      entrees: { p_tissu: 2 },              sorties: { p_coussin: 1 }
    },
    {
      id: 'mt_assemblage', nom: 'Ligne d\'assemblage', icone: '🔨', ouvriers: 3, tempsBase: 8,
      entrees: { p_planche: 4, p_vis: 8 },  sorties: { p_chaise: 1 }
    },
    {
      id: 'mt_electronique', nom: 'Poste électronique', icone: '💡', ouvriers: 2, tempsBase: 10,
      entrees: { p_coque: 2, p_vis: 4 },    sorties: { p_gadget: 1 }
    },
    {
      id: 'mt_tapisserie', nom: 'Tapisserie', icone: '🪡', ouvriers: 2, tempsBase: 12,
      entrees: { p_chaise: 1, p_coussin: 2 }, sorties: { p_fauteuil: 1 }
    }
  ];

  // Prénoms pour générer du personnel
  F.PRENOMS = [
    'Camille', 'Léa', 'Hugo', 'Nadia', 'Yanis', 'Sofia', 'Karim', 'Manon',
    'Théo', 'Inès', 'Lucas', 'Fatou', 'Noah', 'Chloé', 'Adam', 'Jade',
    'Malo', 'Lina', 'Enzo', 'Anaïs', 'Rayan', 'Louise', 'Gabin', 'Emma'
  ];

  F.randomPrenom = function (used) {
    used = used || [];
    const libres = F.PRENOMS.filter((p) => !used.includes(p));
    const pool = libres.length ? libres : F.PRENOMS;
    let nom = pool[Math.floor(Math.random() * pool.length)];
    if (!libres.length) nom += ' ' + (Math.floor(Math.random() * 90) + 10);
    return nom;
  };

  // --- Modèle par défaut (usine de démonstration prête à tourner) ------------
  F.defaultModel = function () {
    const produits = F.DEFAULT_PRODUCTS.map((p) => Object.assign({}, p));
    const typesMachine = F.DEFAULT_MACHINE_TYPES.map((t) => Object.assign({}, t, {
      entrees: Object.assign({}, t.entrees),
      sorties: Object.assign({}, t.sorties)
    }));

    const model = {
      version: 1,
      produits: produits,
      typesMachine: typesMachine,
      ateliers: [],
      machines: [],
      ouvriers: [],
      stockages: [],
      inventaire: {},        // produitId -> quantité
      economie: {
        budget: 5000,
        recettes: 0,         // chiffre d'affaires cumulé
        depenses: 0,         // achats de matières cumulés
        venteAuto: true,     // vend automatiquement les produits finis
        prixParProduit: {}   // surcharge éventuelle du prix de vente
      },
      horloge: { temps: 0, enMarche: false, vitesse: 1 },
      stats: { producTotale: {}, tempsMachineMarche: 0, tempsMachineTotal: 0 }
    };

    // Zones de stockage de démarrage
    model.stockages.push({ id: F.uid('sto'), nom: 'Entrepôt central', capacite: 200 });
    model.stockages.push({ id: F.uid('sto'), nom: 'Quai d\'expédition', capacite: 100 });

    // Atelier 1 : Menuiserie (scie + assemblage -> chaises)
    const a1 = { id: F.uid('at'), nom: 'Menuiserie', tempsPrepa: 5, cadence: 1, couleur: '#e8843c' };
    const a2 = { id: F.uid('at'), nom: 'Métallerie', tempsPrepa: 4, cadence: 1, couleur: '#4a90d9' };
    model.ateliers.push(a1, a2);

    // Machines de l'atelier 1
    const m1 = { id: F.uid('m'), typeId: 'mt_scie', atelierId: a1.id, nom: 'Scie n°1' };
    const m2 = { id: F.uid('m'), typeId: 'mt_assemblage', atelierId: a1.id, nom: 'Assemblage n°1' };
    // Machines de l'atelier 2
    const m3 = { id: F.uid('m'), typeId: 'mt_presse', atelierId: a2.id, nom: 'Presse n°1' };
    model.machines.push(m1, m2, m3);

    // Personnel de démarrage, affecté aux machines
    const used = [];
    function nouvelOuvrier(atelierId, machineId) {
      const nom = F.randomPrenom(used);
      used.push(nom);
      const o = { id: F.uid('o'), nom: nom, atelierId: atelierId, machineId: machineId || null };
      model.ouvriers.push(o);
      return o;
    }
    nouvelOuvrier(a1.id, m1.id);
    nouvelOuvrier(a1.id, m2.id);
    nouvelOuvrier(a1.id, m2.id);
    nouvelOuvrier(a1.id, m2.id);
    nouvelOuvrier(a2.id, m3.id);
    // Un ouvrier libre, non affecté
    nouvelOuvrier(a2.id, null);

    return model;
  };
})(window.F);
