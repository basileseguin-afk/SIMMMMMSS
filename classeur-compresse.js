/* ==========================================================================
 *  LE CLASSEUR COMPRESSÉ (banc d'essai de la version 1, correction 16 c —
 *  docs/FORMATS_EXCEL.md, règles communes)
 *  ------------------------------------------------------------------------
 *  tableur.js écrit ses classeurs sans compression (les entrées du zip sont
 *  « stockées ») ; il est commun aux deux versions et ne change pas. Ce
 *  module reprend son archive et compresse chaque entrée (deflate) : sous
 *  Node, avec zlib ; dans le navigateur, avec CompressionStream("deflate-raw"),
 *  et, s'il ne l'a pas, le classeur reste tel quel, sans compression, comme
 *  avant. Une entrée que la compression grossirait reste stockée. Le contenu
 *  ne change pas : lireClasseur (tableur.js) lit les deux.
 *  Sans dépendance.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, FIN = 0x06054b50, STOCKE = 0, DEFLATE = 8;

  /** Les entrées d'une archive zip : { nom (octets), drapeaux, crc, methode, donnees (telles qu'écrites), taille (non compressée) }. */
  function entrees(octets) {
    const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    let fin = -1;
    for (let i = o.length - 22; i >= 0 && i >= o.length - 22 - 65535; i--) if (v.getUint32(i, true) === FIN) { fin = i; break; }
    if (fin < 0) throw new Error('Classeur illisible : ce n’est pas une archive zip.');
    const n = v.getUint16(fin + 10, true), out = [];
    let p = v.getUint32(fin + 16, true);
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== CENTRAL) throw new Error('Classeur illisible (répertoire central).');
      const drapeaux = v.getUint16(p + 8, true), methode = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
      const ecrite = v.getUint32(p + 20, true), taille = v.getUint32(p + 24, true), local = v.getUint32(p + 42, true);
      const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
      if (v.getUint32(local, true) !== LOCAL) throw new Error('Classeur illisible (en-tête local).');
      const d0 = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      out.push({ nom: o.subarray(p + 46, p + 46 + ln), drapeaux, crc, methode, donnees: o.subarray(d0, d0 + ecrite), taille });
      p += 46 + ln + le + lc;
    }
    return out;
  }

  /** L'archive de ces entrées (le même agencement que tableur.js : version 2.0, noms UTF-8, date 1980-01-01). */
  function assembler(liste) {
    const locaux = [], central = [];
    let decalage = 0;
    for (const e of liste) {
      const tete = new DataView(new ArrayBuffer(30));
      tete.setUint32(0, LOCAL, true); tete.setUint16(4, 20, true); tete.setUint16(6, e.drapeaux, true); tete.setUint16(8, e.methode, true);
      tete.setUint16(10, 0, true); tete.setUint16(12, 0x21, true);
      tete.setUint32(14, e.crc, true); tete.setUint32(18, e.donnees.length, true); tete.setUint32(22, e.taille, true);
      tete.setUint16(26, e.nom.length, true); tete.setUint16(28, 0, true);
      locaux.push(new Uint8Array(tete.buffer), e.nom, e.donnees);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, CENTRAL, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, e.drapeaux, true); c.setUint16(10, e.methode, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, e.crc, true); c.setUint32(20, e.donnees.length, true); c.setUint32(24, e.taille, true);
      c.setUint16(28, e.nom.length, true); c.setUint32(42, decalage, true);
      central.push(new Uint8Array(c.buffer), e.nom);
      decalage += 30 + e.nom.length + e.donnees.length;
    }
    const tailleCentral = central.reduce((n, x) => n + x.length, 0), fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, FIN, true); fin.setUint16(8, liste.length, true); fin.setUint16(10, liste.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
    const morceaux = [...locaux, ...central, new Uint8Array(fin.buffer)], out = new Uint8Array(morceaux.reduce((n, x) => n + x.length, 0));
    let i = 0; for (const m of morceaux) { out.set(m, i); i += m.length; }
    return out;
  }

  /** Une entrée compressée par `deflate` (octets bruts → deflate brut) ; si elle grossit, elle reste stockée. */
  const garder = (e, compresse) => (e.methode !== STOCKE || compresse.length >= e.donnees.length ? e : { ...e, methode: DEFLATE, donnees: compresse });

  /** Sous Node : chaque entrée stockée, compressée par zlib (deflate brut). */
  function compresserSync(octets) {
    if (!enNode) throw new Error('compresserSync : sous Node seulement.');
    const zlib = require('node:zlib');
    return assembler(entrees(octets).map(e => (e.methode === STOCKE ? garder(e, new Uint8Array(zlib.deflateRawSync(e.donnees, { level: 9 }))) : e)));
  }

  /** Avec CompressionStream("deflate-raw") (le navigateur ; Node l'a aussi) ; sans lui, le classeur tel quel. */
  async function compresserFlux(octets) {
    // Un navigateur ancien a CompressionStream, mais pas le format « deflate-raw » : il refuse de le créer.
    const sait = () => { try { return !!new CompressionStream('deflate-raw'); } catch (e) { return false; } };
    if (typeof CompressionStream !== 'function' || !sait()) return octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const une = async d => new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const out = [];
    for (const e of entrees(octets)) out.push(e.methode === STOCKE ? garder(e, await une(e.donnees)) : e);
    return assembler(out);
  }

  /**
   * Le classeur compressé : zlib sous Node, CompressionStream dans le navigateur, sinon tel quel. Une compression qui
   * échoue rend le classeur non compressé, comme avant : l'export ne se perd pas pour autant.
   */
  async function compresser(octets) {
    try { return enNode ? compresserSync(octets) : await compresserFlux(octets); }
    catch (e) { return octets instanceof Uint8Array ? octets : new Uint8Array(octets); }
  }

  const api = { compresser, compresserSync, compresserFlux, entrees, assembler };
  if (enNode) module.exports = api;
  else root.OrlyClasseurCompresse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
