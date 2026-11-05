/* ==========================================================================
 *  L'EXPORT « FLIGHTS » DE WINREST → LE PROGRAMME DE VOLS DATÉ
 *  (banc d'essai de la version 1, évolution 13 — exigences D9 et D11 ;
 *  docs/BANC_ESSAI.md § 14, docs/FORMATS_EXCEL.md § 7)
 *  ------------------------------------------------------------------------
 *  Les lignes de l'onglet « Flights » (en-têtes en première ligne) et les
 *  règles d'import donnent le programme daté de l'évolution 10, sans
 *  retraitement à la main, et le rapport d'import. Sans navigateur : la page
 *  et l'outil (outils/importer-flights.cjs) appellent ce module.
 *
 *  Les règles, dans l'ordre :
 *    1. les colonnes par leur en-tête ; les autres (prix, montants…) ignorées ;
 *    2. une livraison (Delivery No) = un vol ;
 *    3. Guest qty compté une fois par livraison et par Guest type ;
 *    4. la table Guest type → classe ;
 *    5. les statuts exclus ;
 *    6. les ICAO et les Flight No exclus (égalité exacte) ;
 *    7. les codes compagnie (ICAO → compagnie) ;
 *    8. le vol_id ; « -2 », « -3 » pour le même vol le même jour (en dernier) ;
 *    9. un vol sans repas, écarté ;
 *   10. les réserves, fondues dans le premier vol de leur compagnie ;
 *   11. les vols fictifs quotidiens ;
 *   12. le programme trié, aux colonnes du programme daté.
 *
 *  ⚠ Les listes propres à une unité (compagnies, vols exclus, vols fictifs)
 *  sont des réglages : jamais dans le code, les tests ou la doc.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';

  /** Les colonnes lues, par leur en-tête ; les autres sont ignorées. */
  const ENTETES = { date: 'Date', livraison: 'Delivery No', vol: 'Flight No', icao: 'ICAO', etd: 'ETD', statut: 'Statut', type: 'Guest type', qte: 'Guest qty' };
  /** Les classes d'un Guest type, et la colonne du programme de chacune. */
  const CLASSES = ['BC', 'PC', 'YC', 'CREW', 'SPML BC', 'SPML PC', 'SPML YC', 'ignoré'];
  const REPAS = ['BC', 'PC', 'YC', 'CREW', 'SPML_BC', 'SPML_PC', 'SPML_YC'];
  const COLONNE = { BC: 'BC', PC: 'PC', YC: 'YC', CREW: 'CREW', 'SPML BC': 'SPML_BC', 'SPML PC': 'SPML_PC', 'SPML YC': 'SPML_YC' };
  /** Les colonnes du programme daté (évolution 10), dans l'ordre du CSV. */
  const COLONNES = ['date', 'vol_id', 'compagnie', 'type_avion', 'sens', 'heure_std', 'heure_sta', 'nb_BC', 'nb_PC', 'nb_YC', 'nb_CREW', 'nb_SPML',
    'nb_SPML_BC', 'nb_SPML_PC', 'nb_SPML_YC'];

  /** Gelé en profondeur : les défauts ne se changent pas par mégarde. */
  const gele = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') gele(v); }); return Object.freeze(o); };
  /** Les règles par défaut : aucune valeur propre à une unité. */
  const REGLES_DEFAUT = gele({
    statutsExclus: ['Cancelled'],
    icaoExclus: [], flightNoExclus: [],
    compagnies: {},
    types: { ECONOMY: 'YC', BUSINESS: 'BC', FIRST: 'BC', PREMIUM: 'PC', CREW: 'CREW', PNC: 'CREW', PNT: 'CREW', CDB: 'CREW',
      'ECO SPML': 'SPML YC', 'BUSINESS SPML': 'SPML BC', 'PREMIUM SPML': 'SPML PC' },
    motReserve: 'RESERVE',
    fictifs: []
  });
  const CLES_REGLES = Object.keys(REGLES_DEFAUT);
  const CLES_FICTIF = ['flightNo', 'compagnie', 'volId', 'heure', 'types', 'classe'];
  /** Une compagnie ou un vol_id du programme : ni séparateur du CSV, ni guillemet, ni fin de ligne. */
  const INTERDIT = /[,;"\r\n]/;
  const LIMITE = { liste: 500, texte: 120, compagnie: 40, volId: 60, fictifs: 50 };

  /* ---- les valeurs d'une ligne ---------------------------------------- */

  /** Une clé propre à l'objet : un texte du fichier (« constructor »…) ne lit jamais une propriété héritée. */
  const aSoi = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const texte = v => (v === null || v === undefined ? '' : String(v)).trim();
  const vide = v => texte(v) === '';
  /** Un en-tête comparable : sans accents, sans casse, les espaces réduits. */
  const cle = v => texte(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  /** Un Guest type comparable : en capitales, les espaces réduits. */
  const typeDe = v => texte(v).toUpperCase().replace(/\s+/g, ' ');
  /** Une comparaison par unités de code (UTF-16) : le même ordre dans la page, quelle que soit sa langue, et dans l'outil. */
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const deux = n => String(n).padStart(2, '0');
  const iso = (a, m, j) => a + '-' + deux(m) + '-' + deux(j);
  const dateValide = (a, m, j) => { const d = new Date(Date.UTC(a, m - 1, j)); return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j; };
  /** Ajouter à une liste rangée sous une clé. */
  const ranger = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  const compter = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  /** Une date : jj/mm/aaaa, aaaa-mm-jj, ou une date Excel (nombre de jours) → AAAA-MM-JJ ; null si vide ; undefined si illisible. */
  function lireDate(v) {
    if (vide(v)) return null;
    if (typeof v === 'number') {
      if (!(v > 0 && v < 2958466)) return undefined;
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const t = texte(v); let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
    if (m) return dateValide(+m[3], +m[2], +m[1]) ? iso(+m[3], +m[2], +m[1]) : undefined;
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.exec(t);
    if (m) return dateValide(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : undefined;
    return undefined;
  }

  /**
   * Une heure : hh:mm, hh:mm:ss, ou une fraction de jour d'Excel (une date et heure : sa partie heure) → minutes ;
   * null si vide ; undefined si illisible. 23:59:51 reste 23:59, le même jour.
   */
  function lireHeure(v) {
    if (vide(v)) return null;
    if (typeof v === 'number') {
      if (!(v >= 0) || !Number.isFinite(v)) return undefined;
      return Math.min(1439, Math.round((v - Math.floor(v)) * 1440));
    }
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(texte(v));
    if (!m || +m[1] > 23 || +m[2] > 59) return undefined;
    return +m[1] * 60 + +m[2];
  }

  /**
   * Une quantité : un entier positif ou nul, en chiffres seulement (« 1,000 », « 1e2 » sont refusés : séparateur ou
   * notation ambigus) ; null si vide (la case ne dit rien) ; undefined si illisible.
   */
  function lireQte(v) {
    if (vide(v)) return null;
    if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
    const t = texte(v);
    return /^\d{1,15}$/.test(t) ? Number(t) : undefined;
  }

  const hhmm = t => deux(Math.floor(t / 60)) + ':' + deux(t % 60);
  const dateFr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);

  /* ---- les règles --------------------------------------------------------- */

  const PREFIXE = 'règles d’import Winrest';

  /**
   * Les règles complètes : celles données, chaque champ absent pris aux défauts. Une règle mal formée ou inconnue est
   * refusée, en la nommant (une sauvegarde forgée, un réglage de l'outil). Le résultat se relit à l'identique.
   */
  function reglesCompletes(r) {
    const x = r === undefined || r === null ? {} : r;
    if (typeof x !== 'object' || Array.isArray(x)) throw new Error(PREFIXE + ' : un objet est attendu.');
    for (const k of Object.keys(x)) if (!CLES_REGLES.includes(k)) throw new Error(PREFIXE + ', règle inconnue « ' + k + ' ».');
    const pris = k => (x[k] === undefined ? REGLES_DEFAUT[k] : x[k]);
    const liste = (k, nom) => {
      const v = pris(k);
      if (!Array.isArray(v) || v.length > LIMITE.liste || !v.every(s => typeof s === 'string' && s.trim() && s.length <= LIMITE.texte))
        throw new Error(PREFIXE + ', ' + nom + ' : une liste de valeurs non vides est attendue.');
      return v.map(s => s.trim());
    };
    // Une table : ses clés comparées comme à l'import ; deux clés qui se confondent sont refusées.
    const table = (k, nom, cleDe, valeur) => {
      const v = pris(k);
      if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > LIMITE.liste) throw new Error(PREFIXE + ', ' + nom + ' : une table est attendue.');
      const vues = new Set(), out = [];
      for (const [a, b] of Object.entries(v)) {
        const c = cleDe(a);
        if (!c || a.length > LIMITE.texte) throw new Error(PREFIXE + ', ' + nom + ' : une clé vide ou trop longue.');
        if (vues.has(c)) throw new Error(PREFIXE + ', ' + nom + ' : « ' + c + ' » en double.');
        vues.add(c); out.push([c, valeur(c, b)]);
      }
      return Object.fromEntries(out);
    };
    const compagnies = table('compagnies', 'codes compagnie', a => a.trim(), (a, b) => {
      if (typeof b !== 'string' || !b.trim() || b.length > LIMITE.compagnie || INTERDIT.test(b))
        throw new Error(PREFIXE + ', codes compagnie : « ' + a + ' » demande une compagnie (sans virgule ni point-virgule).');
      return b.trim();
    });
    const types = table('types', 'table des Guest types', typeDe, (a, b) => {
      if (!CLASSES.includes(b)) throw new Error(PREFIXE + ', table des Guest types : « ' + a + ' » → « ' + b + ' », classe inconnue (' + CLASSES.join(', ') + ').');
      return b;
    });
    const mot = pris('motReserve');
    if (typeof mot !== 'string' || !mot.trim() || mot.length > LIMITE.compagnie) throw new Error(PREFIXE + ', mot des réserves : un mot non vide est attendu.');
    const fictifs = pris('fictifs');
    if (!Array.isArray(fictifs) || fictifs.length > LIMITE.fictifs) throw new Error(PREFIXE + ', vols fictifs : une liste de ' + LIMITE.fictifs + ' vols au plus est attendue.');
    const valides = fictifs.map((f, i) => fictifValide(f, i));
    valides.forEach((f, i) => {
      const j = valides.findIndex(g => g.volId === f.volId);
      if (j < i) throw new Error(PREFIXE + ', vol fictif ' + (i + 1) + ' : le vol_id « ' + f.volId + ' » est déjà celui du vol fictif ' + (j + 1) + '.');
    });
    return { statutsExclus: liste('statutsExclus', 'statuts exclus'), icaoExclus: liste('icaoExclus', 'ICAO exclus'), flightNoExclus: liste('flightNoExclus', 'Flight No exclus'),
      compagnies, types, motReserve: mot.trim(), fictifs: valides };
  }

  /** Un vol fictif quotidien : { flightNo, compagnie, volId, heure (HH:MM), types, classe (YC par défaut) }. */
  function fictifValide(f, i) {
    const ou = PREFIXE + ', vol fictif ' + (i + 1);
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(ou + ' : un objet est attendu.');
    for (const k of Object.keys(f)) if (!CLES_FICTIF.includes(k)) throw new Error(ou + ' : champ inconnu « ' + k + ' ».');
    const txt = (k, nom, max) => {
      if (typeof f[k] !== 'string' || !f[k].trim() || f[k].length > max) throw new Error(ou + ' : ' + nom + ' manque.');
      return f[k].trim();
    };
    const flightNo = txt('flightNo', 'le Flight No', LIMITE.texte), compagnie = txt('compagnie', 'la compagnie', LIMITE.compagnie), volId = txt('volId', 'le vol_id', LIMITE.volId);
    if (INTERDIT.test(compagnie)) throw new Error(ou + ' : la compagnie s’écrit sans virgule, point-virgule ni guillemet.');
    if (INTERDIT.test(volId)) throw new Error(ou + ' : le vol_id s’écrit sans virgule, point-virgule ni guillemet.');
    const heure = typeof f.heure === 'string' ? lireHeure(f.heure) : undefined;
    if (heure === null || heure === undefined) throw new Error(ou + ' : l’heure s’écrit HH:MM.');
    if (!Array.isArray(f.types) || !f.types.length || f.types.length > LIMITE.fictifs || !f.types.every(t => typeof t === 'string' && t.trim() && t.length <= LIMITE.texte))
      throw new Error(ou + ' : au moins un Guest type à sommer.');
    const classe = f.classe === undefined || f.classe === null || f.classe === '' ? 'YC' : f.classe;
    if (typeof classe !== 'string' || !aSoi(COLONNE, classe)) throw new Error(ou + ' : classe inconnue « ' + classe + ' ».');
    return { flightNo, compagnie, volId, heure: hhmm(heure), types: f.types.map(typeDe), classe };
  }

  /* ---- l'onglet ------------------------------------------------------------ */

  /** Les lignes de l'export : l'onglet « Flights » d'un classeur ; une seule feuille (un CSV), la table elle-même. */
  function lignesDeLExport(feuilles) {
    const f = (feuilles || []).find(x => cle(x.nom) === 'flights') || (feuilles && feuilles.length === 1 ? feuilles[0] : null);
    if (!f) throw new Error('onglet « Flights » absent du classeur (feuilles : ' + (feuilles || []).map(x => x.nom).join(', ') + ').');
    return f.lignes;
  }

  /* ---- la conversion ---------------------------------------------------------- */

  /** Le nom d'une livraison dans un message : son numéro, son Flight No et sa date quand ils existent. */
  const nommer = x => { const q = [x.vol, x.date && dateFr(x.date)].filter(Boolean); return 'livraison ' + x.no + (q.length ? ' (' + q.join(', ') + ')' : ''); };

  /** Règles 1 à 3 : les livraisons, dans l'ordre de leur première ligne. */
  function livraisonsDe(lignes, rapport) {
    const tete = (lignes[0] || []).map(cle), col = {};
    for (const [k, nom] of Object.entries(ENTETES)) {
      const i = tete.indexOf(cle(nom));
      if (i < 0) throw new Error('colonne « ' + nom + ' » absente de l’onglet Flights. Rien n’a été importé.');
      col[k] = i;
    }
    const parNo = new Map();
    // Un écart entre les lignes d'une livraison se signale une fois, par sorte (et par Guest type).
    const signaler = (x, sorte, quoi) => { if (!x.signales.has(sorte)) { x.signales.add(sorte); x.aVerifier.push(quoi); } };
    for (let n = 1; n < lignes.length; n++) {
      const l = lignes[n] || [];
      if (l.every(vide)) continue;
      rapport.lignes++;
      const ou = 'ligne ' + (n + 1) + ' : ', no = texte(l[col.livraison]);
      if (!no) throw new Error(ou + 'Delivery No vide.');
      const date = lireDate(l[col.date]), etd = lireHeure(l[col.etd]), qte = lireQte(l[col.qte]);
      if (date === undefined) throw new Error(ou + 'date illisible « ' + texte(l[col.date]) + ' » (jj/mm/aaaa attendu).');
      if (etd === undefined) throw new Error(ou + 'ETD illisible « ' + texte(l[col.etd]) + ' » (hh:mm attendu).');
      if (qte === undefined) throw new Error(ou + 'Guest qty illisible « ' + texte(l[col.qte]) + ' » (un nombre entier attendu).');
      const vol = texte(l[col.vol]), icao = texte(l[col.icao]), statut = texte(l[col.statut]), type = typeDe(l[col.type]);
      let x = parNo.get(no);
      if (!x) {
        x = { no, date, vol, icao, statut, etd: null, qtes: new Map(), aVerifier: [], signales: new Set() };
        parNo.set(no, x);
      } else {
        // Les valeurs de la première ligne comptent ; une autre valeur se signale.
        if (date && x.date && date !== x.date) signaler(x, 'date', 'date différente : ' + dateFr(x.date) + ', ' + dateFr(date));
        if (!x.date && date) x.date = date;
        if (vol !== x.vol) signaler(x, 'vol', 'Flight No différent : « ' + x.vol + ' », « ' + vol + ' »');
        if (icao !== x.icao) signaler(x, 'icao', 'ICAO différent : « ' + x.icao + ' », « ' + icao + ' »');
        if (statut !== x.statut) signaler(x, 'statut', 'statut différent : « ' + x.statut + ' », « ' + statut + ' »');
      }
      if (etd !== null && (x.etd === null || etd < x.etd)) x.etd = etd;
      // Règle 3 : la première quantité écrite compte ; une case vide ne dit rien.
      const avant = x.qtes.has(type) ? x.qtes.get(type) : null;
      if (avant === null) x.qtes.set(type, qte);
      else if (qte !== null && qte !== avant) signaler(x, 'qte|' + type, 'Guest qty différente pour ' + (type || '(vide)') + ' : ' + avant + ', ' + qte);
    }
    return [...parNo.values()];
  }

  /** Règle 4 : les repas d'une livraison par classe ; les types ignorés (inconnus ou vides) s'ajoutent au rapport. */
  function repasDe(x, R, ignores) {
    const r = Object.fromEntries(REPAS.map(c => [c, 0]));
    for (const [type, q] of x.qtes) {
      const c = aSoi(R.types, type) ? R.types[type] : null;
      if (c && c !== 'ignoré') r[COLONNE[c]] += q || 0;
      else if (!c) {
        const k = type || '(vide)', y = ignores.get(k) || { guestType: k, quantite: 0, livraisons: 0 };
        y.quantite += q || 0; y.livraisons++; ignores.set(k, y);
      }
    }
    return r;
  }

  /** Règle 8 : le vol_id d'un Flight No — les espaces réduits, sans suffixe d'équipage final (« CREW », « CEW »). */
  function volIdDe(flightNo) {
    const reduit = texte(flightNo).replace(/\s+/g, ' ');
    const sans = reduit.replace(/[.\s]*(?:CREW|CEW)$/i, '').trim();
    return sans || reduit;
  }

  /** Un vol gardé a une date, un Flight No, un ICAO et une heure ; sinon le fichier est refusé, la livraison nommée. */
  function exiger(x) {
    const manque = !x.date ? 'aucune date' : !x.vol ? 'Flight No vide' : !x.icao ? 'ICAO vide' : x.etd === null ? 'aucune ETD' : null;
    if (manque) throw new Error(nommer(x) + ' : ' + manque + '. Rien n’a été importé.');
  }

  /**
   * Les lignes de l'onglet « Flights » et les règles → { vols, rapport }. `vols` : le programme daté (objets aux
   * colonnes COLONNES, triés) ; `rapport` : le rapport d'import (D11). `o.fichier` : le nom du fichier, pour le rapport.
   * Une colonne manquante, une valeur illisible : le fichier entier est refusé, le message dit où.
   */
  function convertir(lignes, regles, o = {}) {
    const R = reglesCompletes(regles);
    const rapport = { fichier: o.fichier || null, periode: null, lignes: 0, livraisons: 0, parStatut: {}, vols: 0, parJour: [], parMotif: {}, ecartees: [],
      typesIgnores: [], reservesFondues: [], suffixes: [], fictifs: [], aVerifier: [] };
    const livraisons = livraisonsDe(lignes || [], rapport);
    rapport.livraisons = livraisons.length;
    const parStatut = new Map(), parMotif = new Map();
    for (const x of livraisons) {
      compter(parStatut, x.statut || '(vide)');
      for (const quoi of x.aVerifier) rapport.aVerifier.push({ date: x.date, flightNo: x.vol, deliveryNo: x.no, quoi });
    }
    const ecarter = (x, motif) => { rapport.ecartees.push({ date: x.date, flightNo: x.vol, deliveryNo: x.no, motif }); compter(parMotif, motif); };
    const statuts = new Set(R.statutsExclus.map(s => s.toLowerCase())), icaoExclus = new Set(R.icaoExclus), volsExclus = new Set(R.flightNoExclus);
    const fictifsNo = new Set(R.fictifs.map(f => f.flightNo)), mot = R.motReserve.toLowerCase(), ignores = new Map();
    const gardes = [], reserves = [], production = new Map();
    for (const x of livraisons) {
      // Règle 11 : les Flight No des vols fictifs ne donnent aucun autre vol, quel que soit leur statut.
      if (fictifsNo.has(x.vol)) {
        if (x.date) ranger(production, x.date + '|' + x.vol, x);
        else rapport.aVerifier.push({ date: null, flightNo: x.vol, deliveryNo: x.no, quoi: 'ligne de production sans date : non comptée' });
        continue;
      }
      if (statuts.has(x.statut.toLowerCase())) { ecarter(x, 'statut « ' + x.statut + ' »'); continue; }        // règle 5
      if (icaoExclus.has(x.icao)) { ecarter(x, 'ICAO exclu'); continue; }                                       // règle 6
      if (volsExclus.has(x.vol)) { ecarter(x, 'Flight No exclu'); continue; }
      const compagnie = aSoi(R.compagnies, x.icao) ? R.compagnies[x.icao] : x.icao;                             // règle 7
      const v = { x, date: x.date, heure: x.etd, compagnie, flightNo: x.vol, volId: volIdDe(x.vol), repas: repasDe(x, R, ignores) };
      if (x.vol.toLowerCase().includes(mot)) {                                                                   // règle 10
        if (!x.date) throw new Error(nommer(x) + ' : aucune date. Rien n’a été importé.');
        reserves.push(v); continue;
      }
      if (REPAS.every(c => !v.repas[c])) { ecarter(x, 'sans repas'); continue; }                                // règle 9
      exiger(x);
      gardes.push(v);
    }
    // Les vols gardés, jour par jour, dans l'ordre des heures, des vol_id, puis des livraisons.
    const ordre = (a, b) => a.heure - b.heure || cmp(a.volId, b.volId) || cmp(a.x.no, b.x.no);
    const parJourGardes = new Map();
    for (const v of gardes) ranger(parJourGardes, v.date, v);
    const jours = [...parJourGardes.keys()].sort(cmp);
    for (const d of jours) parJourGardes.get(d).sort(ordre);
    // Règle 10 : une réserve rejoint le premier vol, par heure, de sa compagnie le même jour ; sans lui, elle est écartée.
    for (const r of reserves) {
      const cible = (parJourGardes.get(r.date) || []).find(v => v.compagnie === r.compagnie);
      if (!cible) { ecarter(r.x, 'réserve sans vol'); continue; }
      for (const c of REPAS) cible.repas[c] += r.repas[c];
      rapport.reservesFondues.push({ date: r.date, flightNo: r.flightNo, deliveryNo: r.x.no, vers: cible, repas: { ...r.repas } });
    }
    // Règle 8, en dernier : le même vol_id le même jour, « -2 », « -3 », dans l'ordre des heures puis des vol_id.
    // Un vol_id qui reviendrait encore (un vrai « X-2 » à côté d'un « X » numéroté) refuse le fichier.
    const idsDuJour = new Map();
    for (const d of jours) {
      const n = new Map(), ids = new Set();
      for (const v of parJourGardes.get(d)) {
        const k = (n.get(v.volId) || 0) + 1;
        n.set(v.volId, k);
        if (k > 1) { v.volId += '-' + k; rapport.suffixes.push({ date: d, flightNo: v.flightNo, deliveryNo: v.x.no, volId: v.volId }); }
      }
      for (const v of parJourGardes.get(d)) {
        if (ids.has(v.volId)) throw new Error('vol_id « ' + v.volId + ' » en double le ' + dateFr(d) + ' (après la numérotation de la règle 8). Rien n’a été importé.');
        ids.add(v.volId);
      }
      idsDuJour.set(d, ids);
    }
    for (const f of rapport.reservesFondues) f.vers = f.vers.volId;
    // Règle 11 : chaque jour qui a un vol gardé, chaque vol fictif ; sa quantité, la somme de ses types sur les lignes de ce Flight No ce jour-là.
    const fictifs = [];
    for (const d of jours) for (const f of R.fictifs) {
      if (idsDuJour.get(d).has(f.volId)) throw new Error('vol fictif « ' + f.volId + ' » : ce vol_id existe déjà le ' + dateFr(d) + '. Rien n’a été importé.');
      const q = (production.get(d + '|' + f.flightNo) || []).reduce((n, x) => n + f.types.reduce((t, ty) => t + (x.qtes.get(ty) || 0), 0), 0);
      // Un jour sans ligne donne un vol à 0 : il reste au rapport, mais pas au programme, que le CSV daté refuse sans repas
      // (comme la règle 9) ; un vol sans repas n'y ferait aucun travail.
      const auProgramme = q > 0;
      rapport.fictifs.push({ date: d, volId: f.volId, flightNo: f.flightNo, quantite: q, classe: f.classe, auProgramme });
      if (!auProgramme) continue;
      const repas = Object.fromEntries(REPAS.map(c => [c, 0])); repas[COLONNE[f.classe]] = q;
      fictifs.push({ date: d, heure: lireHeure(f.heure), compagnie: f.compagnie, volId: f.volId, repas });
    }
    // Règle 12 : le programme trié par date, heure, vol_id, aux colonnes du programme daté.
    const tous = gardes.concat(fictifs).sort((a, b) => cmp(a.date, b.date) || a.heure - b.heure || cmp(a.volId, b.volId));
    const vols = tous.map(v => ({ date: v.date, vol_id: v.volId, compagnie: v.compagnie, type_avion: '', sens: 'DEP', heure_std: hhmm(v.heure), heure_sta: '',
      nb_BC: v.repas.BC, nb_PC: v.repas.PC, nb_YC: v.repas.YC, nb_CREW: v.repas.CREW, nb_SPML: v.repas.SPML_BC + v.repas.SPML_PC + v.repas.SPML_YC,
      nb_SPML_BC: v.repas.SPML_BC, nb_SPML_PC: v.repas.SPML_PC, nb_SPML_YC: v.repas.SPML_YC }));
    // Le rapport : la période couverte par le fichier, les vols gardés par jour et par compagnie avec leurs repas, les types ignorés.
    let debut = null, fin = null;
    for (const x of livraisons) if (x.date) { if (!debut || x.date < debut) debut = x.date; if (!fin || x.date > fin) fin = x.date; }
    if (debut) rapport.periode = { debut, fin, jours: Math.round((Date.parse(fin) - Date.parse(debut)) / 86400000) + 1 };
    rapport.vols = vols.length;
    const parJour = new Map();
    for (const v of tous) {
      const k = v.date + '|' + v.compagnie;
      const y = parJour.get(k) || { date: v.date, compagnie: v.compagnie, vols: 0, ...Object.fromEntries(REPAS.map(c => [c, 0])) };
      y.vols++; for (const c of REPAS) y[c] += v.repas[c];
      parJour.set(k, y);
    }
    rapport.parJour = [...parJour.values()].sort((a, b) => cmp(a.date, b.date) || cmp(a.compagnie, b.compagnie));
    rapport.typesIgnores = [...ignores.values()].sort((a, b) => cmp(a.guestType, b.guestType));
    rapport.parStatut = Object.fromEntries(parStatut);
    rapport.parMotif = Object.fromEntries(parMotif);
    return { vols, rapport };
  }

  /** Le programme en CSV daté (évolution 10), que l'import de la page et simuler-periode lisent tels quels. */
  function versCsv(vols) {
    const cellule = v => { const s = String(v ?? ''); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return COLONNES.join(',') + '\n' + vols.map(v => COLONNES.map(c => cellule(v[c])).join(',')).join('\n') + '\n';
  }

  /* ---- les règles gardées (évolution 13 b) ------------------------------------------------ */

  /** La clé de stockage de la version 1 ; l'enveloppe des règles : un schéma, une version. */
  const CLE_STOCKAGE = 'ory-import-winrest-v1', SCHEMA = 'ory-import-winrest', VERSION = 1;

  /** Les règles à garder : complètes et validées, dans leur enveloppe. */
  function enveloppe(regles) { return { schema: SCHEMA, version: VERSION, regles: reglesCompletes(regles) }; }

  /**
   * Une enveloppe relue (le stockage du navigateur, une sauvegarde) → les règles complètes. Une enveloppe d'un autre
   * schéma, d'une autre version, ou une règle invalide est refusée, en disant laquelle.
   */
  function lireEnveloppe(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.schema !== SCHEMA) throw new Error(PREFIXE + ' : ce n’est pas un réglage « ' + SCHEMA + ' ».');
    if (x.version !== VERSION) throw new Error(PREFIXE + ' : version ' + x.version + ' inconnue (' + VERSION + ' attendue).');
    for (const k of Object.keys(x)) if (!['schema', 'version', 'regles'].includes(k)) throw new Error(PREFIXE + ' : champ inconnu « ' + k + ' ».');
    if (!x.regles || typeof x.regles !== 'object' || Array.isArray(x.regles)) throw new Error(PREFIXE + ' : les règles manquent.');
    return reglesCompletes(x.regles);
  }

  /**
   * Les règles d'une sauvegarde complète (« Tout sauvegarder ») : sa clé ory-import-winrest-v1, validée comme à la
   * restauration ; sans elle (une sauvegarde d'avant), les défauts. Pour l'outil (outils/importer-flights.cjs).
   */
  function reglesDeLaSauvegarde(s) {
    if (!s || typeof s !== 'object' || s.schema !== 'ory-sauvegarde' || s.version !== 1 || !s.contenu || typeof s.contenu !== 'object')
      throw new Error('sauvegarde : ce n’est pas une sauvegarde complète (« Tout sauvegarder »).');
    return aSoi(s.contenu, CLE_STOCKAGE) ? lireEnveloppe(s.contenu[CLE_STOCKAGE]) : reglesCompletes();
  }

  const api = { ENTETES, CLASSES, COLONNES, REGLES_DEFAUT, CLE_STOCKAGE, reglesCompletes, lignesDeLExport, convertir, versCsv, volIdDe, lireDate, lireHeure,
    enveloppe, lireEnveloppe, reglesDeLaSauvegarde };
  if (enNode) module.exports = api;
  else root.OrlyWinrest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
