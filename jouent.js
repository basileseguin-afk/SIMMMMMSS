/* ==========================================================================
 *  UN RÉGLAGE QUI NE JOUE PAS NE S'AFFICHE PAS (version 1, évolution 19 b)
 *  ------------------------------------------------------------------------
 *  Une équipe garde des réglages que le calcul ne lit pas dans la situation
 *  où elle est : le débit des tunnels d'une plonge qui lave par vol, le
 *  débit général d'un robot dont chaque commande a le sien, l'heure d'une
 *  mise à disposition toujours ouverte, « vols à la fois » d'un handling dont
 *  les chauffeurs sont comptés… Ce module dit lesquels, et pourquoi, en une
 *  phrase : la page les retire de la fiche et les montre, grisés, sous la
 *  ligne « n réglages ne jouent pas ici ».
 *
 *  Il lit, il ne change rien : une valeur masquée est gardée et sauvegardée ;
 *  elle rejoue le jour où la situation revient. Les règles suivent ce que le
 *  moteur lit (moteur/production.js) : `debitRobot`, `vaguesDe`, le handling
 *  avec ou sans créneaux de chauffeurs.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const TOUTES = '*';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nombre = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v);
  const fr = n => String(n).replace('.', ',');
  const jourLu = j => (!j ? 'J' : 'J' + (j > 0 ? '+' : '') + j);
  /** Les durées par compagnie d'une équipe, « toutes compagnies » d'abord : [{ cie, minutes }]. */
  function dureesDe(durees) {
    const out = [];
    for (const [cie, v] of Object.entries(durees || {})) { const n = nombre(v); if (n !== null) out.push({ cie, minutes: n }); }
    return out.sort((x, y) => (x.cie === TOUTES ? -1 : y.cie === TOUTES ? 1 : x.cie.localeCompare(y.cie)));
  }
  const dureesLues = l => l.map(x => (x.cie === TOUTES ? 'toutes compagnies' : x.cie) + ' : ' + fr(x.minutes) + ' min').join(' ; ');

  /** La plonge : par vol, les débits et le plafond ne jouent pas ; au débit, les durées par compagnie et la vitesse d'un tunnel. */
  function plonge(a) {
    const tunnels = Array.isArray(a.tunnels) ? a.tunnels : [], out = [];
    if (a.parVol) {
      const raison = 'La plonge lave par vol : un tunnel lave un vol en un temps donné, compagnie par compagnie ; son débit ne compte pas.';
      tunnels.forEach((t, i) => {
        if (nombre(t && t.debit) > 0) out.push({ cle: 'tunnel-debit:' + i, champs: [{ champ: 'tunnel-debit', index: i }], libelle: 'Débit de « ' + (t.nom || 'tunnel ' + (i + 1)) + ' »', valeur: fr(+t.debit) + ' u/h', raison });
      });
      if (nombre(a.plafond) > 0) out.push({ cle: 'plafond', champs: [{ champ: 'plafond' }], libelle: 'Débit maximum de l’ensemble', valeur: fr(+a.plafond) + ' u/h', raison });
      return out;
    }
    const raison = 'La plonge lave au débit : ce sont les débits des tunnels et le plafond de l’ensemble qui comptent.';
    const durees = dureesDe(a.durees);
    if (durees.length) out.push({ cle: 'durees', champs: [{ champ: 'duree' }], libelle: 'Temps pour laver un vol, par compagnie', valeur: dureesLues(durees), raison });
    tunnels.forEach((t, i) => {
      const v = nombre(t && t.vitesse);
      if (v !== null && v > 0 && v !== 1) out.push({ cle: 'tunnel-vitesse:' + i, champs: [{ champ: 'tunnel-vitesse', index: i }], libelle: 'Vitesse de « ' + (t.nom || 'tunnel ' + (i + 1)) + ' »', valeur: '× ' + fr(v), raison });
    });
    return out;
  }

  /** Le robot : son débit général ne joue pas quand chacune de ses commandes a le sien (comme `debitRobot` du moteur le lit). */
  function robot(a) {
    const commandes = (a.lots || []).flat().filter(Boolean);
    const propre = c => { const v = nombre((a.debits || {})[c]); return v !== null && v > 0; };
    if (!commandes.length || !commandes.every(propre) || nombre(a.debit) === null) return [];
    return [{ cle: 'debit', champs: [{ champ: 'debit' }], libelle: 'Débit du robot', valeur: fr(+a.debit) + ' pl/h',
      raison: 'Chaque commande de ce robot a son propre débit : le débit général ne sert à aucune.' }];
  }

  /** La mise à disposition : toujours ouverte, ou ouverte de … à …, son heure de début, son jour et ses vagues ne jouent pas. */
  function dispo(a) {
    if (a.permanent === false) return [];
    const o = a.ouverture;
    const raison = o && o.de && o.a ? 'Ouverte de ' + o.de + ' à ' + o.a + ', chaque jour : ce sont ses heures d’ouverture qui comptent.'
      : 'Toujours ouverte : on s’y sert à tout moment, personne ne l’attend.';
    const out = [];
    if (a.debut) out.push({ cle: 'debut', champs: [{ champ: 'debut' }], libelle: 'Heure de début', valeur: String(a.debut), raison });
    if (a.debut || a.jour) out.push({ cle: 'jour', champs: [{ champ: 'jour' }], libelle: 'Jour', valeur: jourLu(+a.jour || 0), raison });
    const vagues = Array.isArray(a.vagues) ? a.vagues.filter(v => v && v.debut) : [];
    if (vagues.length) out.push({ cle: 'vagues', champs: [{ champ: 'vague-debut' }, { champ: 'vague-jour' }], libelle: 'Vagues',
      valeur: vagues.map(v => jourLu(+v.jour || 0) + ' ' + v.debut).join(' ; '), raison });
    return out;
  }

  /** Le handling : « vols à la fois » ne joue que sans chauffeurs comptés ; les créneaux, que s'ils sont saisis et non calculés. */
  function handling(a) {
    const h24 = a.handling24h === true, creneaux = Array.isArray(a.creneaux) ? a.creneaux : [];
    const calcules = h24 && !!a.chauffeurs && a.chauffeurs.mode === 'calcules', comptes = calcules || creneaux.length > 0;
    const out = [];
    if (comptes && nombre(a.simultanes) !== null) out.push({ cle: 'simultanes', champs: [{ champ: 'simultanes' }], libelle: (h24 ? 'Tournées' : 'Vols') + ' en même temps', valeur: fr(+a.simultanes),
      raison: 'Les chauffeurs sont comptés : c’est leur nombre qui limite les ' + (h24 ? 'tournées menées' : 'vols menés') + ' en même temps.' });
    if (calcules && creneaux.length) out.push({ cle: 'creneaux', champs: [{ champ: 'creneau-de' }, { champ: 'creneau-a' }, { champ: 'creneau-n' }, { champ: 'creneau-type' }], libelle: 'Créneaux de chauffeurs',
      valeur: creneaux.map(c => c.de + '–' + c.a + ' : ' + c.n).join(' ; '), raison: 'Les chauffeurs sont calculés au plus juste : les créneaux saisis ne comptent pas.' });
    return out;
  }

  /**
   * Les réglages d'une équipe qui portent une valeur et ne jouent pas : [{ cle, champs: [{ champ, index? }] (ceux de la
   * fiche, `data-at-champ`), libelle, valeur (écrite), raison (une phrase) }]. Vide quand tout joue.
   */
  function nonJoues(a) {
    if (!a || typeof a !== 'object') return [];
    return a.type === 'lavage' ? plonge(a) : a.type === 'robot' ? robot(a) : a.type === 'dispo' ? dispo(a) : a.type === 'handling' ? handling(a) : [];
  }

  let numero = 0;
  /**
   * La ligne sous la fiche : « n réglages ne jouent pas ici », qui se déplie sur ces champs grisés, chacun avec sa raison.
   * `liste` : ce que rend `nonJoues` (ou toute liste { libelle, valeur, raison }). Vide : rien.
   */
  function ligne(liste, cle) {
    const l = liste || [];
    if (!l.length) return '';
    const n = l.length;
    return '<details class="nj" data-nj="' + n + '"><summary>' + n + (n > 1 ? ' réglages ne jouent pas ici' : ' réglage ne joue pas ici') + '</summary><ul class="nj-liste">'
      + l.map(x => { const id = 'nj-' + esc(cle || 'x') + '-' + (++numero);
        return '<li data-nj-cle="' + esc(x.cle || '') + '"><label class="nj-champ">' + esc(x.libelle) + '<input value="' + esc(x.valeur) + '" disabled aria-describedby="' + id + '"></label>'
          + '<span class="nj-raison" id="' + id + '">' + esc(x.raison) + '</span></li>'; }).join('')
      + '</ul></details>';
  }

  /**
   * Un service travaille-t-il par compagnie ? Oui s'il a ses minutes par compagnie : un handling, une plonge qui lave par
   * vol, un service à une équipe par compagnie (`categories`). Rend { genre, equipe (celle qui porte les durées, ou null),
   * nom, unite, raison, lignes: [{ cie ('*' : toutes), minutes }] } ; null sinon — ses temps par classe jouent, ou rien.
   */
  function parCompagnie(service, etat) {
    if (!etat || !service) return null;
    const cat = ((etat.categories || {})[service] || [])[0];
    if (cat) return { genre: 'categories', equipe: null, nom: String(cat.nom || cat.id || service), unite: 'min par vol',
      raison: 'Ce service a une équipe par compagnie : son temps se règle par compagnie, dans sa fiche.', lignes: dureesDe(cat.minutes) };
    // Les équipes qui font le travail du service : une équipe d'appui n'en change pas la nature.
    const equipes = (etat.ateliers || []).filter(a => a && a.service === service && a.type !== 'appui');
    if (!equipes.length) return null;
    if (equipes.every(a => a.type === 'handling')) { const a = equipes[0];
      return { genre: 'handling', equipe: a.id, nom: String(a.nom || ''), unite: 'min par vol', raison: 'Le handling travaille par vol : son temps se règle par compagnie, dans sa fiche.', lignes: dureesDe(a.durees) }; }
    if (equipes.every(a => a.type === 'lavage' && a.parVol)) { const a = equipes[0];
      return { genre: 'plonge', equipe: a.id, nom: String(a.nom || ''), unite: 'min par vol et par tunnel', raison: 'La plonge lave par vol : son temps se règle par compagnie, dans sa fiche.', lignes: dureesDe(a.durees) }; }
    return null;
  }

  /**
   * Un service est-il une mise à disposition (évolution 19 c) ? Oui quand toutes ses équipes (hors appui) en sont : on vient
   * s'y servir, il n'a pas de temps par vol — ses lignes quittent la page des temps par vol. Ses valeurs restent gardées.
   */
  function miseADisposition(service, etat) {
    if (!etat || !service) return false;
    const equipes = (etat.ateliers || []).filter(a => a && a.service === service && a.type !== 'appui');
    return equipes.length > 0 && equipes.every(a => a.type === 'dispo');
  }

  /** « Liens entre services » ne sert qu'aux commandes sans chemin : vrai si une commande au moins n'a pas de route. */
  function liensUtiles(classes, routes) {
    return (classes || []).some(c => c && !(routes && routes.has(c.id)));
  }

  const api = { nonJoues, ligne, parCompagnie, miseADisposition, liensUtiles, dureesDe, dureesLues };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyJouent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
