/* ==========================================================================
 *  UN RÉGLAGE QUI NE JOUE PAS NE S'AFFICHE PAS — dans la page
 *  (version 1, évolution 19 b)
 *  ------------------------------------------------------------------------
 *  jouent.js dit quels réglages d'une équipe ne jouent pas, et pourquoi. Ce
 *  module l'applique aux fiches que la page dessine, d'où qu'elles viennent
 *  (les fiches des équipes, celles de « Services et équipes », dont le module
 *  est commun avec la version 2 et ne change pas) :
 *    — un champ qui ne joue pas est retiré de la fiche ;
 *    — sous la fiche, une ligne discrète le dit, « n réglages ne jouent pas
 *      ici » ; dépliée, elle montre ces champs grisés, chacun avec sa raison ;
 *    — dans « Temps par vol par service », un service qui travaille par
 *      compagnie montre ses minutes par compagnie, pas des temps par classe.
 *  Il ne touche à aucune valeur : il masque, il ne supprime rien.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const J = () => root.OrlyJouent;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fr = n => String(n).replace('.', ',');
  const MASQUE = 'data-nj-masque';
  /**
   * Les fiches d'équipe ouvertes sous `racine`, de plus haut niveau : une fiche rangée dans une autre (les réglages repliés
   * d'une équipe, dans son service) suit la sienne ; une carte repliée de la liste des équipes n'est pas une fiche.
   */
  const fichesDe = racine => [...racine.querySelectorAll('article.at-carte.ouverte[data-at], article.mu-equipe[data-at]')].filter(e => !e.parentElement.closest('article[data-at]'));
  const masquer = (el, oui) => { if (oui === el.hasAttribute(MASQUE)) return; if (oui) el.setAttribute(MASQUE, ''); else el.removeAttribute(MASQUE); };

  class Vue {
    /* a = {
     *   etat()          — les équipes et les services par compagnie : { ateliers, categories }
     *   bareme()        — les temps par classe gardés, par service : { [service]: { '*' + '/BC': minutes, … } }
     *   heures(minutes) — une durée en minutes, écrite en heures par vol
     *   ouvrirService(id) — ouvre la fiche d'un service
     *   racines()       — les éléments de la page où des fiches se dessinent
     * } */
    constructor(a) { this.a = a; this.ouverts = new Set(); this.observateur = null; }

    /** Suit les rendus de la page : chaque fois qu'une fiche se redessine, elle est repassée. */
    brancher() {
      if (typeof MutationObserver !== 'function') return this;
      this.observateur = new MutationObserver(() => this.passer());
      for (const r of this.a.racines()) {
        this.observateur.observe(r, { childList: true, subtree: true });
        r.addEventListener('click', e => {
          const b = e.target.closest && e.target.closest('[data-nj-ouvrir]');
          if (b && this.a.ouvrirService) this.a.ouvrirService(b.dataset.njOuvrir);
        });
      }
      this.passer();
      return this;
    }

    /** Repasse toutes les fiches et les services affichés. Sans changement à faire, ne touche à rien. */
    passer() {
      const etat = this.a.etat();
      if (!etat) return;
      for (const r of this.a.racines()) { this.equipes(r, etat); this.services(r, etat); }
      // Ce que cette passe vient d'écrire n'a pas à la relancer.
      if (this.observateur) this.observateur.takeRecords();
    }

    equipes(racine, etat) {
      const parId = new Map((etat.ateliers || []).map(a => [a.id, a]));
      for (const fiche of fichesDe(racine)) {
        const a = parId.get(fiche.dataset.at), liste = a ? J().nonJoues(a) : [];
        // 1. Les champs qui ne jouent pas quittent la fiche (leur libellé avec eux).
        const cibles = new Set();
        for (const x of liste) for (const c of x.champs || []) {
          const sel = '[data-at-champ="' + c.champ + '"]' + (c.index != null ? '[data-index="' + c.index + '"]' : '');
          for (const el of fiche.querySelectorAll(sel)) if (!el.closest('.nj-hote')) cibles.add(el.closest('label') || el);
        }
        for (const el of fiche.querySelectorAll('[' + MASQUE + ']')) if (!cibles.has(el)) masquer(el, false);
        for (const el of cibles) masquer(el, true);
        // 2. La ligne « n réglages ne jouent pas ici », sous la fiche.
        this.poser(fiche, liste, a ? a.id : '');
      }
    }

    /** Pose, remplace ou retire la ligne sous un élément ; son état (dépliée ou non) est gardé d'un rendu à l'autre. */
    poser(hote, liste, cle) {
      let boite = [...hote.children].find(c => c.classList.contains('nj-hote'));
      if (!liste.length) { if (boite) boite.remove(); return; }
      const signature = JSON.stringify(liste.map(x => [x.cle, x.libelle, x.valeur, x.raison]));
      if (boite && boite.dataset.signature === signature) return;
      if (!boite) { boite = document.createElement('div'); boite.className = 'nj-hote'; hote.appendChild(boite); }
      boite.dataset.signature = signature;
      boite.innerHTML = J().ligne(liste, cle);
      const d = boite.querySelector('details');
      d.open = this.ouverts.has(cle);
      d.addEventListener('toggle', () => { if (d.open) this.ouverts.add(cle); else this.ouverts.delete(cle); });
    }

    /** « Temps par vol par service » : un service qui travaille par compagnie montre ses minutes par compagnie. */
    services(racine, etat) {
      const bareme = (this.a.bareme && this.a.bareme()) || {};
      for (const d of racine.querySelectorAll('details.rg-service[data-service]')) {
        const id = d.dataset.service, pc = J().parCompagnie(id, etat);
        let bloc = [...d.children].find(c => c.classList.contains('nj-par-cie'));
        const tete = [...d.children].find(c => c.tagName === 'SUMMARY');
        if (!tete) continue;
        const resume = tete.querySelector('.rg-svc-digest:not(.nj-digest)'), marque = tete.querySelector('.rg-zero');
        let digest = tete.querySelector('.nj-digest');
        if (!pc) {
          if (bloc) bloc.remove();
          if (digest) digest.remove();
          for (const c of d.querySelectorAll('[' + MASQUE + ']')) masquer(c, false);
          continue;
        }
        // Ses temps par classe ne jouent pas : ses champs par classe quittent la page, son résumé dit « par compagnie ».
        for (const c of d.children) if (c.tagName !== 'SUMMARY' && c !== bloc) masquer(c, true);
        if (resume) masquer(resume, true);
        if (marque) masquer(marque, true);
        const gardes = Object.entries(bareme[id] || {}).filter(([, v]) => Number.isFinite(+v) && v !== null && v !== '');
        const signature = JSON.stringify([pc, gardes]);
        if (bloc && bloc.dataset.signature === signature && digest) continue;
        const lu = l => l.map(x => (x.cie === '*' ? 'toutes compagnies' : x.cie) + ' ' + fr(x.minutes) + ' min').join(' · ');
        if (!digest) { digest = document.createElement('span'); digest.className = 'rg-svc-digest nj-digest'; tete.appendChild(digest); }
        digest.innerHTML = '<em>par compagnie</em>' + (pc.lignes.length ? ' · ' + esc(lu(pc.lignes)) : ' · aucune durée');
        if (!bloc) { bloc = document.createElement('div'); bloc.className = 'nj-par-cie'; d.appendChild(bloc); }
        bloc.dataset.signature = signature;
        bloc.dataset.njService = id;
        const heures = this.a.heures || (m => fr(Math.round(m / 60 * 100) / 100));
        const horsJeu = gardes.map(([k, v]) => { const i = k.lastIndexOf('/'), cie = k.slice(0, i), cabine = k.slice(i + 1);
          return { cle: k, libelle: cabine + ' · ' + (cie === '*' ? 'toutes compagnies' : cie), valeur: heures(+v) + ' h par vol',
            raison: 'Ce service travaille par compagnie : ses temps par classe ne sont pas lus.' }; });
        bloc.innerHTML = '<p class="mini-note nj-pc-titre"><b>Ses minutes par compagnie.</b> ' + esc(pc.raison) + '</p>'
          + (pc.lignes.length ? '<table class="rg-table nj-table"><thead><tr><th scope="col">Compagnie</th><th scope="col">' + esc(pc.unite) + '</th></tr></thead><tbody>'
            + pc.lignes.map(x => '<tr><th scope="row">' + (x.cie === '*' ? 'Toutes compagnies' : esc(x.cie)) + '</th><td class="num">' + esc(fr(x.minutes)) + '</td></tr>').join('') + '</tbody></table>'
            : '<p class="mini-note">Aucune durée par compagnie n’est encore réglée.</p>')
          + '<p><button type="button" class="btn btn-sm" data-nj-ouvrir="' + esc(id) + '">Régler dans la fiche' + (pc.nom ? ' de « ' + esc(pc.nom) + ' »' : '') + ' →</button></p>'
          + '<div class="nj-hote" data-signature="">' + J().ligne(horsJeu, 'svc-' + id) + '</div>';
        const lignePliee = bloc.querySelector('details.nj');
        if (lignePliee) {
          const cle = 'svc-' + id;
          lignePliee.open = this.ouverts.has(cle);
          lignePliee.addEventListener('toggle', () => { if (lignePliee.open) this.ouverts.add(cle); else this.ouverts.delete(cle); });
        }
      }
    }
  }

  /** Branche la vue sur la page : `OrlyJouentVue.brancher({ etat, bareme, heures, ouvrirService, racines })`. */
  const brancher = a => new Vue(a).brancher();

  root.OrlyJouentVue = { Vue, brancher };
})(typeof globalThis !== 'undefined' ? globalThis : this);
