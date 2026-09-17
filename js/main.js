/* ============================================================================
 * main.js — Point d'entrée : initialisation, câblage des contrôles, boucle
 * ==========================================================================*/
(function (F) {
  'use strict';

  const State = F.State;
  const Sim = F.Sim;
  const UI = F.UI;

  document.addEventListener('DOMContentLoaded', function () {
    State.init();

    // Rafraîchit l'écran quand le modèle change (hors tick)
    State.subscribe(function () { UI.render(); });

    // À chaque tick de simulation : maj légère de l'affichage
    Sim.setTickCallback(function () { UI.tick(); });

    // --- Onglets ---
    document.querySelectorAll('.onglet').forEach(function (o) {
      o.addEventListener('click', function () { UI.setOnglet(o.dataset.onglet); });
    });

    // --- Contrôles de simulation ---
    document.getElementById('btn-play').addEventListener('click', function () {
      Sim.basculer();
      UI.majBarre();
    });
    document.querySelectorAll('.btn-vitesse').forEach(function (b) {
      b.addEventListener('click', function () { Sim.setVitesse(+b.dataset.v); UI.majBarre(); });
    });

    // --- Sauvegarde / réinitialisation ---
    document.getElementById('btn-sauver').addEventListener('click', function () {
      if (State.save()) flash('Partie sauvegardée ✔');
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
      if (confirm('Réinitialiser toute l\'usine ? Cette action est irréversible.')) {
        Sim.pause();
        State.reset();
        UI.setOnglet('usine');
        flash('Nouvelle usine créée');
      }
    });

    // Sauvegarde périodique pendant que ça tourne
    setInterval(function () { if (State.model.horloge.enMarche) State.save(); }, 10000);
    // Sauvegarde à la fermeture
    window.addEventListener('beforeunload', function () { State.save(); });

    // Premier rendu
    UI.setOnglet('usine');
  });

  // Petit toast de confirmation
  function flash(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(flash._to);
    flash._to = setTimeout(function () { t.classList.remove('visible'); }, 1800);
  }
})(window.F);
