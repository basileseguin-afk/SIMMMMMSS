/* ==========================================================================
 *  Mesure — moniteurs de niveau et de comptage
 *  --------------------------------------------------------------------------
 *  Idée reprise de salabim (https://github.com/salabim/salabim) : la mesure est
 *  portée par l'objet simulé, pas recalculée après coup par l'affichage.
 *  Aucune ligne n'est recopiée — le dépôt de salabim ne fournit pas de fichier
 *  de licence, voir docs/ETUDE_OPEN_SOURCE.md § 1.
 *
 *  Deux natures de grandeur, qui ne se moyennent pas de la même façon :
 *
 *    NIVEAU   — un état qui DURE : longueur de file, places occupées, encours.
 *               Les statistiques sont pondérées par le temps. Une file à 10
 *               pendant une minute puis à 0 pendant une heure a une longueur
 *               moyenne proche de zéro, pas de 5.
 *
 *    COMPTAGE — une valeur PAR OBJET : temps d'attente d'un dossier, retard,
 *               temps de traversée. Chaque observation pèse pareil.
 *
 *  C'est la distinction que `sim.js` ne fait pas : son taux de charge est un
 *  lissage exponentiel avec plancher artificiel, pas une grandeur mesurée.
 * ==========================================================================*/
(function (root, fabrique) {
  'use strict';
  const api = fabrique();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurMesure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class Moniteur {
    /**
     * @param env            environnement de simulation (pour l'horloge)
     * @param options.nom
     * @param options.niveau      true = grandeur qui dure (pondérée par le temps)
     * @param options.valeurInitiale  valeur de départ d'un moniteur de niveau
     */
    constructor(env, options) {
      const o = options || {};
      if (!env || typeof env.maintenant !== 'number') {
        throw new TypeError('Moniteur attend un environnement de simulation.');
      }
      this.env = env;
      this.nom = o.nom || 'mesure';
      this.niveau = !!o.niveau;

      this._t0 = env.maintenant;
      this._tDernier = env.maintenant;
      this._courante = this.niveau ? (o.valeurInitiale === undefined ? 0 : o.valeurInitiale) : null;

      this._valeurs = [];    // valeurs closes
      this._poids = [];      // durée (niveau) ou 1 (comptage)
      this._integrale = 0;   // somme des valeur × durée, intervalles clos
      this._n = 0;           // nombre d'observations
      this._min = this.niveau ? this._courante : null;
      this._max = this.niveau ? this._courante : null;
    }

    /** Valeur courante d'un moniteur de niveau, dernière valeur notée sinon. */
    get derniere() { return this._courante; }

    /** Nombre d'observations enregistrées. */
    get nombre() { return this._n; }

    /** Durée observée depuis la création du moniteur. */
    get duree() { return this.env.maintenant - this._t0; }

    /**
     * Enregistre une observation. Pour un moniteur de niveau, c'est la
     * nouvelle valeur de l'état ; l'ancienne est close sur sa durée de vie.
     */
    noter(valeur) {
      if (typeof valeur !== 'number' || Number.isNaN(valeur)) {
        throw new TypeError('Moniteur.noter attend un nombre (' + this.nom + ').');
      }
      if (this.niveau) {
        const t = this.env.maintenant;
        const dt = t - this._tDernier;
        if (dt > 0) {
          this._valeurs.push(this._courante);
          this._poids.push(dt);
          this._integrale += this._courante * dt;
        }
        this._tDernier = t;
        this._courante = valeur;
      } else {
        this._valeurs.push(valeur);
        this._poids.push(1);
        this._courante = valeur;
      }
      this._n++;
      if (this._min === null || valeur < this._min) this._min = valeur;
      if (this._max === null || valeur > this._max) this._max = valeur;
      return this;
    }

    /**
     * Échantillons pondérés, intervalle courant inclus, sans modifier l'état :
     * un moniteur peut donc être interrogé à tout moment pendant la simulation.
     */
    _echantillons() {
      const valeurs = this._valeurs.slice();
      const poids = this._poids.slice();
      if (this.niveau) {
        const dt = this.env.maintenant - this._tDernier;
        if (dt > 0) { valeurs.push(this._courante); poids.push(dt); }
      }
      return { valeurs, poids };
    }

    /** Somme des poids : une durée pour un niveau, un effectif pour un comptage. */
    get poidsTotal() {
      if (!this.niveau) return this._n;
      const dt = this.env.maintenant - this._tDernier;
      let total = dt > 0 ? dt : 0;
      for (let i = 0; i < this._poids.length; i++) total += this._poids[i];
      return total;
    }

    /**
     * Moyenne pondérée par le temps (niveau) ou arithmétique (comptage).
     * `null` si rien n'a encore été observé ; pour un niveau de durée nulle,
     * la valeur courante, qui est la seule réponse défendable.
     */
    moyenne() {
      if (this.niveau) {
        const total = this.poidsTotal;
        if (total <= 0) return this._courante;
        const dt = this.env.maintenant - this._tDernier;
        return (this._integrale + this._courante * (dt > 0 ? dt : 0)) / total;
      }
      if (this._n === 0) return null;
      let somme = 0;
      for (let i = 0; i < this._valeurs.length; i++) somme += this._valeurs[i];
      return somme / this._n;
    }

    get minimum() { return this._min; }
    get maximum() { return this._max; }

    /**
     * Percentile pondéré, par rang le plus proche et sans interpolation :
     * la plus petite valeur dont le poids cumulé atteint q % du total.
     * `null` si rien n'a été observé.
     */
    percentile(q) {
      if (typeof q !== 'number' || q < 0 || q > 100) throw new RangeError('Percentile hors de [0, 100].');
      const { valeurs, poids } = this._echantillons();
      if (valeurs.length === 0) return this.niveau ? this._courante : null;
      const rangs = valeurs.map((v, i) => [v, poids[i]]).sort((a, b) => a[0] - b[0]);
      let total = 0;
      for (const [, p] of rangs) total += p;
      if (total <= 0) return rangs[0][0];
      const cible = (q / 100) * total;
      let cumul = 0;
      for (const [v, p] of rangs) {
        cumul += p;
        if (cumul >= cible - 1e-12) return v;
      }
      return rangs[rangs.length - 1][0];
    }

    /** Vue compacte destinée à l'affichage. */
    resume() {
      return {
        nom: this.nom,
        nature: this.niveau ? 'niveau' : 'comptage',
        nombre: this._n,
        duree: this.duree,
        moyenne: this.moyenne(),
        minimum: this._min,
        maximum: this._max,
        mediane: this.percentile(50),
        p90: this.percentile(90),
        derniere: this._courante
      };
    }

    /** Repart de zéro à l'instant courant, en gardant la valeur d'état. */
    reinitialiser() {
      this._t0 = this._tDernier = this.env.maintenant;
      this._valeurs = []; this._poids = [];
      this._integrale = 0; this._n = 0;
      this._min = this.niveau ? this._courante : null;
      this._max = this.niveau ? this._courante : null;
      return this;
    }
  }

  return { Moniteur };
});
