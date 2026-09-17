/* ============================================================================
 * ui.js — Rendu de l'interface et interactions
 * ==========================================================================*/
window.F = window.F || {};

(function (F) {
  'use strict';

  const State = F.State;
  const Sim = F.Sim;
  const UI = { ongletActif: 'usine' };

  // --- Helpers DOM -----------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'value') node.value = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function $(sel) { return document.querySelector(sel); }
  function vider(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Formatte des secondes (sim) en jj hh:mm
  function fmtTemps(s) {
    s = Math.floor(s);
    const j = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (j > 0) return j + 'j ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function fmtArgent(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' €';
  }
  UI.fmtTemps = fmtTemps;

  const LABELS_ETAT = {
    arret: 'À l\'arrêt', sans_personnel: 'Sans personnel', en_attente: 'Attente matières',
    bloque: 'Stock plein', prepa: 'Préparation', marche: 'En production'
  };

  // ==========================================================================
  //  BARRE SUPÉRIEURE (horloge + KPI + contrôles)
  // ==========================================================================
  UI.majBarre = function () {
    const m = State.model;
    $('#kpi-temps').textContent = fmtTemps(m.horloge.temps);
    $('#kpi-budget').textContent = fmtArgent(m.economie.budget);
    $('#kpi-budget').className = 'kpi-val ' + (m.economie.budget < 0 ? 'neg' : 'pos');

    // Utilisation du personnel
    const affectes = m.ouvriers.filter((o) => o.machineId).length;
    $('#kpi-perso').textContent = affectes + ' / ' + m.ouvriers.length;

    // Stock
    $('#kpi-stock').textContent = State.stockOccupe() + ' / ' + State.capaciteTotale();

    // Bouton play/pause
    const btn = $('#btn-play');
    btn.textContent = m.horloge.enMarche ? '⏸ Pause' : '▶ Démarrer';
    btn.className = 'btn ' + (m.horloge.enMarche ? 'btn-pause' : 'btn-play');

    // Vitesse active
    document.querySelectorAll('.btn-vitesse').forEach((b) => {
      b.classList.toggle('actif', +b.dataset.v === m.horloge.vitesse);
    });
  };

  // ==========================================================================
  //  NAVIGATION PAR ONGLETS
  // ==========================================================================
  UI.setOnglet = function (nom) {
    UI.ongletActif = nom;
    document.querySelectorAll('.onglet').forEach((o) => o.classList.toggle('actif', o.dataset.onglet === nom));
    UI.render();
  };

  // ==========================================================================
  //  RENDU PRINCIPAL (contenu de l'onglet actif)
  // ==========================================================================
  UI.render = function () {
    const conteneur = $('#contenu');
    vider(conteneur);
    switch (UI.ongletActif) {
      case 'usine': conteneur.appendChild(vueUsine()); break;
      case 'ateliers': conteneur.appendChild(vueAteliers()); break;
      case 'personnel': conteneur.appendChild(vuePersonnel()); break;
      case 'stockage': conteneur.appendChild(vueStockage()); break;
      case 'marche': conteneur.appendChild(vueMarche()); break;
      case 'catalogue': conteneur.appendChild(vueCatalogue()); break;
    }
    UI.majBarre();
    UI.majJournal();
  };

  // Appelé à chaque tick : met à jour uniquement les valeurs dynamiques
  UI.tick = function () {
    UI.majBarre();
    if (UI.ongletActif === 'usine') majUsineDynamique();
    if (UI.ongletActif === 'stockage') majStockDynamique();
    if (UI.ongletActif === 'marche') majMarcheDynamique();
  };

  // ==========================================================================
  //  VUE : USINE (plan visuel animé)
  // ==========================================================================
  function vueUsine() {
    const wrap = el('div', { class: 'vue-usine' });

    if (!State.model.ateliers.length) {
      wrap.appendChild(el('div', { class: 'vide', html:
        '🏗️ Aucun atelier pour le moment.<br>Rendez-vous dans l\'onglet <b>Ateliers</b> pour en créer un.' }));
      return wrap;
    }

    const grille = el('div', { class: 'usine-grille', id: 'usine-grille' });
    State.model.ateliers.forEach((at) => grille.appendChild(carteAtelierUsine(at)));
    wrap.appendChild(grille);
    return wrap;
  }

  function carteAtelierUsine(at) {
    const machines = State.machinesDeAtelier(at.id);
    const nbOuvriers = State.ouvriersDeAtelier(at.id).length;
    const carte = el('div', { class: 'atelier-plan', style: '--couleur:' + at.couleur });

    carte.appendChild(el('div', { class: 'atelier-plan-tete' }, [
      el('span', { class: 'atelier-plan-nom', text: at.nom }),
      el('span', { class: 'atelier-plan-meta', text: '⏱ ' + at.tempsPrepa + 's · cadence ' + at.cadence + '× · 👤 ' + nbOuvriers })
    ]));

    const zone = el('div', { class: 'atelier-plan-machines' });
    if (!machines.length) {
      zone.appendChild(el('div', { class: 'mini-vide', text: 'Pas de machine' }));
    }
    machines.forEach((m) => zone.appendChild(tuileMachine(m)));
    carte.appendChild(zone);
    return carte;
  }

  function tuileMachine(m) {
    const type = State.typeMachine(m.typeId);
    const rt = Sim.runtime(m.id);
    const nbOuvriers = State.ouvriersDeMachine(m.id).length;
    const tuile = el('div', {
      class: 'machine-tuile etat-' + rt.etat, id: 'tuile-' + m.id,
      title: type ? type.nom : ''
    });
    tuile.appendChild(el('div', { class: 'machine-icone', text: type ? type.icone : '❓' }));
    tuile.appendChild(el('div', { class: 'machine-nom', text: m.nom }));
    tuile.appendChild(el('div', { class: 'machine-etat', text: LABELS_ETAT[rt.etat] || rt.etat }));
    tuile.appendChild(el('div', { class: 'machine-staff', text: '👤 ' + nbOuvriers + '/' + (type ? type.ouvriers : '?') }));
    const barre = el('div', { class: 'machine-barre' }, [el('div', { class: 'machine-barre-fill' })]);
    tuile.appendChild(barre);
    return tuile;
  }

  // Mise à jour légère (sans reconstruire le DOM) pendant la simulation
  function majUsineDynamique() {
    State.model.machines.forEach((m) => {
      const tuile = document.getElementById('tuile-' + m.id);
      if (!tuile) return;
      const type = State.typeMachine(m.typeId);
      const rt = Sim.runtime(m.id);
      tuile.className = 'machine-tuile etat-' + rt.etat;
      const etatEl = tuile.querySelector('.machine-etat');
      if (etatEl) etatEl.textContent = LABELS_ETAT[rt.etat] || rt.etat;
      const fill = tuile.querySelector('.machine-barre-fill');
      if (fill && type) {
        let pct = 0;
        const at = State.atelier(m.atelierId);
        if (rt.etat === 'prepa' && at) pct = (rt.prepaProgres / at.tempsPrepa) * 100;
        else if (rt.etat === 'marche' && at) pct = (rt.progres / (type.tempsBase / (at.cadence || 1))) * 100;
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }
    });
  }

  // ==========================================================================
  //  VUE : ATELIERS
  // ==========================================================================
  function vueAteliers() {
    const wrap = el('div', { class: 'vue' });
    wrap.appendChild(enteteSection('Ateliers', 'Créez des ateliers, réglez leur temps de préparation et leur cadence, puis équipez-les de machines.'));

    // Formulaire de création
    const form = el('div', { class: 'form-ligne carte-form' });
    const inNom = el('input', { class: 'input', placeholder: 'Nom de l\'atelier', value: '' });
    const inPrep = el('input', { class: 'input input-court', type: 'number', min: '0', value: '5', title: 'Temps de préparation (s)' });
    const inCad = el('input', { class: 'input input-court', type: 'number', min: '0.1', step: '0.1', value: '1', title: 'Cadence' });
    form.appendChild(labelChamp('Nom', inNom));
    form.appendChild(labelChamp('Prépa (s)', inPrep));
    form.appendChild(labelChamp('Cadence ×', inCad));
    form.appendChild(el('button', { class: 'btn btn-primaire', onclick: function () {
      State.ajouterAtelier({ nom: inNom.value || 'Nouvel atelier', tempsPrepa: inPrep.value, cadence: inCad.value });
      UI.render();
    } }, ['+ Créer l\'atelier']));
    wrap.appendChild(form);

    // Liste des ateliers
    State.model.ateliers.forEach((at) => wrap.appendChild(carteAtelierConfig(at)));
    return wrap;
  }

  function carteAtelierConfig(at) {
    const carte = el('div', { class: 'carte', style: '--couleur:' + at.couleur });
    const tete = el('div', { class: 'carte-tete' });

    const inNom = el('input', { class: 'input input-titre', value: at.nom, onchange: function () { at.nom = inNom.value; State.commit(); } });
    tete.appendChild(inNom);
    tete.appendChild(el('button', { class: 'btn btn-danger btn-sm', onclick: function () {
      if (confirm('Supprimer l\'atelier « ' + at.nom +' » et ses machines ?')) { State.supprimerAtelier(at.id); UI.render(); }
    } }, ['🗑']));
    carte.appendChild(tete);

    // Réglages
    const reglages = el('div', { class: 'form-ligne' });
    const inPrep = el('input', { class: 'input input-court', type: 'number', min: '0', value: at.tempsPrepa, onchange: function () { at.tempsPrepa = +inPrep.value; State.commit(); } });
    const inCad = el('input', { class: 'input input-court', type: 'number', min: '0.1', step: '0.1', value: at.cadence, onchange: function () { at.cadence = +inCad.value; State.commit(); } });
    reglages.appendChild(labelChamp('Temps de préparation (s)', inPrep));
    reglages.appendChild(labelChamp('Cadence de production ×', inCad));
    carte.appendChild(reglages);

    // Machines de l'atelier
    const listeM = el('div', { class: 'sous-liste' });
    listeM.appendChild(el('div', { class: 'sous-titre', text: 'Machines' }));
    const machines = State.machinesDeAtelier(at.id);
    if (!machines.length) listeM.appendChild(el('div', { class: 'mini-vide', text: 'Aucune machine dans cet atelier.' }));
    machines.forEach((m) => {
      const type = State.typeMachine(m.typeId);
      const nbO = State.ouvriersDeMachine(m.id).length;
      const ligne = el('div', { class: 'ligne-item' }, [
        el('span', { class: 'ligne-icone', text: type ? type.icone : '❓' }),
        el('span', { class: 'ligne-nom', text: m.nom }),
        el('span', { class: 'ligne-badge', text: (type ? recetteTexte(type) : '') }),
        el('span', { class: 'ligne-badge', text: '👤 ' + nbO + '/' + (type ? type.ouvriers : '?') }),
        el('button', { class: 'btn btn-danger btn-xs', onclick: function () { State.supprimerMachine(m.id); UI.render(); } }, ['✕'])
      ]);
      listeM.appendChild(ligne);
    });

    // Ajout de machine
    const ajout = el('div', { class: 'form-ligne' });
    const sel = el('select', { class: 'input' });
    State.model.typesMachine.forEach((t) => sel.appendChild(el('option', { value: t.id }, [t.icone + ' ' + t.nom])));
    ajout.appendChild(sel);
    ajout.appendChild(el('button', { class: 'btn btn-secondaire', onclick: function () {
      State.ajouterMachine(at.id, sel.value); UI.render();
    } }, ['+ Ajouter la machine']));
    listeM.appendChild(ajout);
    carte.appendChild(listeM);

    return carte;
  }

  function recetteTexte(type) {
    const e = Object.keys(type.entrees).map((pid) => (State.produit(pid) ? State.produit(pid).icone : '?') + '×' + type.entrees[pid]).join(' ');
    const s = Object.keys(type.sorties).map((pid) => (State.produit(pid) ? State.produit(pid).icone : '?') + '×' + type.sorties[pid]).join(' ');
    return (e || '∅') + ' → ' + (s || '∅');
  }

  // ==========================================================================
  //  VUE : PERSONNEL
  // ==========================================================================
  function vuePersonnel() {
    const wrap = el('div', { class: 'vue' });
    wrap.appendChild(enteteSection('Personnel', 'Embauchez des ouvriers et affectez-les à un atelier puis à une machine. Une machine ne tourne que si elle a assez d\'ouvriers.'));

    const barre = el('div', { class: 'form-ligne carte-form' });
    barre.appendChild(el('button', { class: 'btn btn-primaire', onclick: function () { State.ajouterOuvrier(null); UI.render(); } }, ['+ Embaucher un ouvrier']));
    barre.appendChild(el('span', { class: 'note', text: 'Total : ' + State.model.ouvriers.length + ' ouvrier(s)' }));
    wrap.appendChild(barre);

    const table = el('div', { class: 'table' });
    table.appendChild(el('div', { class: 'table-tete' }, [
      el('span', { text: 'Ouvrier' }), el('span', { text: 'Atelier' }), el('span', { text: 'Machine' }), el('span', { text: '' })
    ]));

    State.model.ouvriers.forEach((o) => {
      const selAtelier = el('select', { class: 'input', onchange: function () {
        State.affecterOuvrier(o.id, selAtelier.value || null, null); UI.render();
      } });
      selAtelier.appendChild(el('option', { value: '' }, ['— Aucun —']));
      State.model.ateliers.forEach((a) => {
        const opt = el('option', { value: a.id }, [a.nom]);
        if (a.id === o.atelierId) opt.selected = true;
        selAtelier.appendChild(opt);
      });

      const selMachine = el('select', { class: 'input', onchange: function () {
        State.affecterOuvrier(o.id, o.atelierId, selMachine.value || null); UI.render();
      } });
      selMachine.appendChild(el('option', { value: '' }, ['— Non affecté —']));
      if (o.atelierId) {
        State.machinesDeAtelier(o.atelierId).forEach((m) => {
          const type = State.typeMachine(m.typeId);
          const opt = el('option', { value: m.id }, [(type ? type.icone + ' ' : '') + m.nom]);
          if (m.id === o.machineId) opt.selected = true;
          selMachine.appendChild(opt);
        });
      } else {
        selMachine.disabled = true;
      }

      table.appendChild(el('div', { class: 'table-ligne' }, [
        el('span', { class: 'perso-nom', text: '👷 ' + o.nom }),
        selAtelier,
        selMachine,
        el('button', { class: 'btn btn-danger btn-xs', onclick: function () { State.supprimerOuvrier(o.id); UI.render(); } }, ['✕'])
      ]));
    });

    if (!State.model.ouvriers.length) table.appendChild(el('div', { class: 'mini-vide', text: 'Aucun ouvrier embauché.' }));
    wrap.appendChild(table);
    return wrap;
  }

  // ==========================================================================
  //  VUE : STOCKAGE
  // ==========================================================================
  function vueStockage() {
    const wrap = el('div', { class: 'vue' });
    wrap.appendChild(enteteSection('Zones de stockage', 'Les produits intermédiaires et finis (non vendus) occupent le stock. Ajoutez des zones pour augmenter la capacité.'));

    // Jauge globale
    const jauge = el('div', { class: 'carte' });
    jauge.appendChild(el('div', { class: 'sous-titre', text: 'Capacité globale' }));
    const pct = State.capaciteTotale() ? (State.stockOccupe() / State.capaciteTotale()) * 100 : 0;
    jauge.appendChild(el('div', { class: 'jauge' }, [el('div', { class: 'jauge-fill', id: 'jauge-stock', style: 'width:' + pct + '%' })]));
    jauge.appendChild(el('div', { class: 'note', id: 'jauge-stock-txt', text: State.stockOccupe() + ' / ' + State.capaciteTotale() + ' unités' }));
    wrap.appendChild(jauge);

    // Ajout de zone
    const form = el('div', { class: 'form-ligne carte-form' });
    const inNom = el('input', { class: 'input', placeholder: 'Nom de la zone' });
    const inCap = el('input', { class: 'input input-court', type: 'number', min: '1', value: '100' });
    form.appendChild(labelChamp('Nom', inNom));
    form.appendChild(labelChamp('Capacité', inCap));
    form.appendChild(el('button', { class: 'btn btn-primaire', onclick: function () {
      State.ajouterStockage(inNom.value || 'Zone de stockage', inCap.value); UI.render();
    } }, ['+ Ajouter une zone']));
    wrap.appendChild(form);

    // Zones existantes
    const grille = el('div', { class: 'grille-cartes' });
    State.model.stockages.forEach((s) => {
      const c = el('div', { class: 'carte carte-petite' });
      const inN = el('input', { class: 'input input-titre', value: s.nom, onchange: function () { s.nom = inN.value; State.commit(); } });
      c.appendChild(el('div', { class: 'carte-tete' }, [inN,
        el('button', { class: 'btn btn-danger btn-sm', onclick: function () { State.supprimerStockage(s.id); UI.render(); } }, ['🗑'])]));
      const inC = el('input', { class: 'input input-court', type: 'number', min: '1', value: s.capacite, onchange: function () { s.capacite = +inC.value; State.commit(); } });
      c.appendChild(labelChamp('Capacité (unités)', inC));
      grille.appendChild(c);
    });
    wrap.appendChild(grille);

    // Inventaire courant
    wrap.appendChild(el('div', { class: 'sous-titre', text: 'Inventaire courant' }));
    wrap.appendChild(tableInventaire());
    return wrap;
  }

  function tableInventaire() {
    const table = el('div', { class: 'table table-inv', id: 'table-inv' });
    remplirInventaire(table);
    return table;
  }
  function remplirInventaire(table) {
    vider(table);
    const produits = State.model.produits.filter((p) => p.categorie !== 'brut');
    let vide = true;
    produits.forEach((p) => {
      const q = State.qte(p.id);
      if (q <= 0) return;
      vide = false;
      table.appendChild(el('div', { class: 'inv-item' }, [
        el('span', { class: 'inv-icone', text: p.icone }),
        el('span', { class: 'inv-nom', text: p.nom }),
        el('span', { class: 'inv-qte', text: q })
      ]));
    });
    if (vide) table.appendChild(el('div', { class: 'mini-vide', text: 'Stock vide.' }));
  }
  function majStockDynamique() {
    const table = document.getElementById('table-inv');
    if (table) remplirInventaire(table);
    const fill = document.getElementById('jauge-stock');
    const txt = document.getElementById('jauge-stock-txt');
    if (fill) fill.style.width = (State.capaciteTotale() ? (State.stockOccupe() / State.capaciteTotale()) * 100 : 0) + '%';
    if (txt) txt.textContent = State.stockOccupe() + ' / ' + State.capaciteTotale() + ' unités';
  }

  // ==========================================================================
  //  VUE : MARCHÉ / ÉCONOMIE
  // ==========================================================================
  function vueMarche() {
    const wrap = el('div', { class: 'vue' });
    wrap.appendChild(enteteSection('Marché & économie', 'Les matières brutes sont achetées automatiquement lors de la production. Les produits finis peuvent être vendus automatiquement.'));

    const eco = State.model.economie;

    // Bilan
    const bilan = el('div', { class: 'grille-kpi' });
    bilan.appendChild(kpiCarte('Budget', fmtArgent(eco.budget), 'budget-eco'));
    bilan.appendChild(kpiCarte('Recettes (ventes)', fmtArgent(eco.recettes), 'rec-eco'));
    bilan.appendChild(kpiCarte('Dépenses (achats)', fmtArgent(eco.depenses), 'dep-eco'));
    wrap.appendChild(bilan);

    // Vente auto
    const opt = el('div', { class: 'carte' });
    const chk = el('input', { type: 'checkbox', id: 'chk-vente' });
    chk.checked = eco.venteAuto;
    chk.addEventListener('change', function () { eco.venteAuto = chk.checked; State.commit(); });
    opt.appendChild(el('label', { class: 'switch-ligne' }, [chk, el('span', { text: ' Vente automatique des produits finis' })]));
    wrap.appendChild(opt);

    // Tableau des produits (coûts / prix)
    wrap.appendChild(el('div', { class: 'sous-titre', text: 'Tarifs des produits' }));
    const table = el('div', { class: 'table' });
    table.appendChild(el('div', { class: 'table-tete table-tete-4' }, [
      el('span', { text: 'Produit' }), el('span', { text: 'Catégorie' }),
      el('span', { text: 'Achat (€)' }), el('span', { text: 'Vente (€)' })
    ]));
    State.model.produits.forEach((p) => {
      const inCout = el('input', { class: 'input input-court', type: 'number', min: '0', value: p.cout,
        disabled: p.categorie !== 'brut', onchange: function () { p.cout = +inCout.value; State.commit(); } });
      const inPrix = el('input', { class: 'input input-court', type: 'number', min: '0', value: p.prix,
        disabled: p.categorie === 'brut', onchange: function () { p.prix = +inPrix.value; State.commit(); } });
      table.appendChild(el('div', { class: 'table-ligne table-tete-4' }, [
        el('span', { text: p.icone + ' ' + p.nom }),
        el('span', { class: 'badge-cat cat-' + p.categorie, text: p.categorie }),
        inCout, inPrix
      ]));
    });
    wrap.appendChild(table);

    // Production cumulée
    wrap.appendChild(el('div', { class: 'sous-titre', text: 'Production cumulée' }));
    wrap.appendChild(tableProduction());
    return wrap;
  }

  function tableProduction() {
    const table = el('div', { class: 'table table-inv', id: 'table-prod' });
    remplirProduction(table);
    return table;
  }
  function remplirProduction(table) {
    vider(table);
    const stats = State.model.stats.producTotale;
    const ids = Object.keys(stats).filter((id) => stats[id] > 0);
    if (!ids.length) { table.appendChild(el('div', { class: 'mini-vide', text: 'Rien produit pour l\'instant.' })); return; }
    ids.sort((a, b) => stats[b] - stats[a]).forEach((id) => {
      const p = State.produit(id);
      if (!p) return;
      table.appendChild(el('div', { class: 'inv-item' }, [
        el('span', { class: 'inv-icone', text: p.icone }),
        el('span', { class: 'inv-nom', text: p.nom }),
        el('span', { class: 'inv-qte', text: stats[id] })
      ]));
    });
  }
  function majMarcheDynamique() {
    const eco = State.model.economie;
    const setTxt = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
    setTxt('budget-eco', fmtArgent(eco.budget));
    setTxt('rec-eco', fmtArgent(eco.recettes));
    setTxt('dep-eco', fmtArgent(eco.depenses));
    const table = document.getElementById('table-prod');
    if (table) remplirProduction(table);
  }

  // ==========================================================================
  //  VUE : CATALOGUE (produits + types de machine)
  // ==========================================================================
  function vueCatalogue() {
    const wrap = el('div', { class: 'vue' });
    wrap.appendChild(enteteSection('Catalogue', 'Définissez vos produits et vos types de machines (recettes : entrées → sorties).'));

    // --- Produits ---
    wrap.appendChild(el('div', { class: 'sous-titre', text: 'Produits' }));
    const formP = el('div', { class: 'form-ligne carte-form' });
    const pNom = el('input', { class: 'input', placeholder: 'Nom' });
    const pIco = el('input', { class: 'input input-court', placeholder: '📦', value: '📦' });
    const pCat = el('select', { class: 'input' });
    ['brut', 'intermediaire', 'fini'].forEach((c) => pCat.appendChild(el('option', { value: c }, [c])));
    const pCout = el('input', { class: 'input input-court', type: 'number', min: '0', value: '0', title: 'Coût d\'achat' });
    const pPrix = el('input', { class: 'input input-court', type: 'number', min: '0', value: '0', title: 'Prix de vente' });
    formP.appendChild(labelChamp('Nom', pNom));
    formP.appendChild(labelChamp('Icône', pIco));
    formP.appendChild(labelChamp('Catégorie', pCat));
    formP.appendChild(labelChamp('Achat', pCout));
    formP.appendChild(labelChamp('Vente', pPrix));
    formP.appendChild(el('button', { class: 'btn btn-primaire', onclick: function () {
      if (!pNom.value) return;
      State.ajouterProduit({ nom: pNom.value, icone: pIco.value || '📦', categorie: pCat.value, cout: pCout.value, prix: pPrix.value });
      UI.render();
    } }, ['+ Produit']));
    wrap.appendChild(formP);

    const grilleP = el('div', { class: 'grille-cartes' });
    State.model.produits.forEach((p) => {
      const utilise = State.qte(p.id) > 0;
      grilleP.appendChild(el('div', { class: 'puce' }, [
        el('span', { class: 'puce-ico', text: p.icone }),
        el('span', { class: 'puce-nom', text: p.nom }),
        el('span', { class: 'badge-cat cat-' + p.categorie, text: p.categorie }),
        el('button', { class: 'btn btn-danger btn-xs', title: 'Supprimer', onclick: function () {
          if (confirm('Supprimer le produit ' + p.nom + ' ?')) { State.supprimerProduit(p.id); UI.render(); }
        } }, ['✕'])
      ]));
    });
    wrap.appendChild(grilleP);

    // --- Types de machine ---
    wrap.appendChild(el('div', { class: 'sous-titre', text: 'Types de machine (recettes)' }));
    wrap.appendChild(constructeurRecette());

    const grilleM = el('div', { class: 'grille-cartes' });
    State.model.typesMachine.forEach((t) => {
      const utilise = State.model.machines.some((m) => m.typeId === t.id);
      const c = el('div', { class: 'carte carte-petite' });
      c.appendChild(el('div', { class: 'carte-tete' }, [
        el('span', { class: 'carte-titre', text: t.icone + ' ' + t.nom }),
        el('button', { class: 'btn btn-danger btn-sm', disabled: utilise, title: utilise ? 'Type utilisé par une machine' : 'Supprimer',
          onclick: function () { if (State.supprimerTypeMachine(t.id)) UI.render(); } }, ['🗑'])
      ]));
      c.appendChild(el('div', { class: 'note', text: '👤 ' + t.ouvriers + ' ouvrier(s) · ⏱ ' + t.tempsBase + 's/cycle' }));
      c.appendChild(el('div', { class: 'recette', text: recetteTexte(t) }));
      grilleM.appendChild(c);
    });
    wrap.appendChild(grilleM);

    return wrap;
  }

  // Constructeur de recette pour un nouveau type de machine
  function constructeurRecette() {
    const carte = el('div', { class: 'carte' });
    const nom = el('input', { class: 'input', placeholder: 'Nom de la machine' });
    const ico = el('input', { class: 'input input-court', placeholder: '🛠️', value: '🛠️' });
    const ouv = el('input', { class: 'input input-court', type: 'number', min: '1', value: '1' });
    const tps = el('input', { class: 'input input-court', type: 'number', min: '1', value: '5' });

    const ligne1 = el('div', { class: 'form-ligne' }, [
      labelChamp('Nom', nom), labelChamp('Icône', ico), labelChamp('Ouvriers', ouv), labelChamp('Temps/cycle (s)', tps)
    ]);
    carte.appendChild(ligne1);

    // Sélecteurs d'entrées / sorties (jusqu'à 3 chacun)
    const entrees = [];
    const sorties = [];
    function bloc(titre, tableau, filtreCat) {
      const b = el('div', { class: 'recette-bloc' });
      b.appendChild(el('div', { class: 'sous-titre-mini', text: titre }));
      for (let i = 0; i < 3; i++) {
        const sel = el('select', { class: 'input input-court' });
        sel.appendChild(el('option', { value: '' }, ['—']));
        State.model.produits.forEach((p) => sel.appendChild(el('option', { value: p.id }, [p.icone + ' ' + p.nom])));
        const qte = el('input', { class: 'input input-court', type: 'number', min: '1', value: '1' });
        tableau.push({ sel: sel, qte: qte });
        b.appendChild(el('div', { class: 'form-ligne-mini' }, [sel, qte]));
      }
      return b;
    }
    const grilleES = el('div', { class: 'recette-grille' }, [
      bloc('Entrées (consommées)', entrees), bloc('Sorties (produites)', sorties)
    ]);
    carte.appendChild(grilleES);

    carte.appendChild(el('button', { class: 'btn btn-primaire', onclick: function () {
      if (!nom.value) { alert('Donnez un nom à la machine.'); return; }
      const e = {}, s = {};
      entrees.forEach((x) => { if (x.sel.value) e[x.sel.value] = (e[x.sel.value] || 0) + (+x.qte.value || 1); });
      sorties.forEach((x) => { if (x.sel.value) s[x.sel.value] = (s[x.sel.value] || 0) + (+x.qte.value || 1); });
      if (!Object.keys(s).length) { alert('Ajoutez au moins une sortie.'); return; }
      State.ajouterTypeMachine({ nom: nom.value, icone: ico.value || '🛠️', ouvriers: ouv.value, tempsBase: tps.value, entrees: e, sorties: s });
      UI.render();
    } }, ['+ Créer le type de machine']));

    return carte;
  }

  // ==========================================================================
  //  ÉLÉMENTS COMMUNS
  // ==========================================================================
  function enteteSection(titre, desc) {
    return el('div', { class: 'section-tete' }, [
      el('h2', { text: titre }),
      desc ? el('p', { class: 'section-desc', text: desc }) : null
    ]);
  }
  function labelChamp(label, input) {
    return el('label', { class: 'champ' }, [el('span', { class: 'champ-label', text: label }), input]);
  }
  function kpiCarte(label, valeur, id) {
    return el('div', { class: 'kpi-carte' }, [
      el('div', { class: 'kpi-carte-label', text: label }),
      el('div', { class: 'kpi-carte-val', id: id, text: valeur })
    ]);
  }

  // ==========================================================================
  //  JOURNAL
  // ==========================================================================
  UI.majJournal = function () {
    const box = $('#journal');
    if (!box) return;
    vider(box);
    if (!State.journal.length) { box.appendChild(el('div', { class: 'journal-vide', text: 'Aucun événement.' })); return; }
    State.journal.slice(0, 30).forEach((ev) => {
      box.appendChild(el('div', { class: 'journal-item' }, [
        el('span', { class: 'journal-t', text: fmtTemps(ev.t) }),
        el('span', { class: 'journal-type type-' + ev.type, text: ev.type }),
        el('span', { class: 'journal-msg', text: ev.message })
      ]));
    });
  };

  F.UI = UI;
})(window.F);
