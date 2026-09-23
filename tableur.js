/* ==========================================================================
 *  TABLEUR — lire et écrire des classeurs Excel (.xlsx) et du CSV
 *
 *  Le site doit pouvoir être piloté depuis Excel : on exporte, on modifie
 *  dans le tableur, on réimporte. Il fallait donc lire et écrire du .xlsx.
 *
 *  Pas de bibliothèque : la seule répandue (SheetJS) n'est plus publiée sur
 *  npm dans une version sans faille connue, et le site doit marcher hors
 *  ligne, ouvert depuis le disque. Ce module fait le strict nécessaire :
 *
 *    • ÉCRIRE — un classeur de plusieurs feuilles, textes et nombres, ligne
 *      d'en-tête en gras et figée, largeurs de colonnes. L'archive est
 *      « stockée » (non compressée) : c'est permis par le format, Excel et
 *      LibreOffice l'ouvrent sans rien dire, et il n'y a rien à compresser
 *      de sérieux dans quelques centaines de lignes.
 *    • LIRE — ce qu'Excel, LibreOffice ou Numbers enregistrent : archive
 *      compressée (via `DecompressionStream`, natif des navigateurs et de
 *      Node), chaînes partagées, chaînes en ligne, nombres, booléens.
 *
 *  Le CSV reste accepté partout où une seule feuille suffit : c'est ce que
 *  produit un export Excel « CSV (séparateur : point-virgule) ».
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* ======================================================================
   *  1. ZIP
   * ====================================================================*/

  const TABLE_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(octets) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const utf8 = s => new TextEncoder().encode(s);
  const deUtf8 = o => new TextDecoder('utf-8').decode(o);

  /** Une archive « stockée » : chaque fichier tel quel, sans compression. */
  function zipper(fichiers) {
    const locaux = [], central = [];
    let decalage = 0;
    for (const f of fichiers) {
      const nom = utf8(f.nom), donnees = typeof f.contenu === 'string' ? utf8(f.contenu) : f.contenu;
      const crc = crc32(donnees);
      const tete = new DataView(new ArrayBuffer(30));
      tete.setUint32(0, 0x04034b50, true);
      tete.setUint16(4, 20, true);          // version requise
      tete.setUint16(6, 0x0800, true);      // noms en UTF-8
      tete.setUint16(8, 0, true);           // stocké
      tete.setUint16(10, 0, true); tete.setUint16(12, 0x21, true);   // 1980-01-01
      tete.setUint32(14, crc, true);
      tete.setUint32(18, donnees.length, true);
      tete.setUint32(22, donnees.length, true);
      tete.setUint16(26, nom.length, true);
      tete.setUint16(28, 0, true);
      locaux.push(new Uint8Array(tete.buffer), nom, donnees);

      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, donnees.length, true); c.setUint32(24, donnees.length, true);
      c.setUint16(28, nom.length, true);
      c.setUint32(42, decalage, true);
      central.push(new Uint8Array(c.buffer), nom);
      decalage += 30 + nom.length + donnees.length;
    }
    const tailleCentral = central.reduce((n, x) => n + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true);
    fin.setUint32(16, decalage, true);
    const morceaux = [...locaux, ...central, new Uint8Array(fin.buffer)];
    const out = new Uint8Array(morceaux.reduce((n, x) => n + x.length, 0));
    let i = 0; for (const m of morceaux) { out.set(m, i); i += m.length; }
    return out;
  }

  async function inflerBrut(octets) {
    if (typeof DecompressionStream !== 'function')
      throw new Error('Ce navigateur ne sait pas ouvrir un fichier Excel compressé. Enregistrez-le en CSV (point-virgule).');
    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  /** Les fichiers d'une archive, par nom → octets. */
  async function dezipper(octets) {
    const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    let fin = -1;
    for (let i = o.length - 22; i >= Math.max(0, o.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('Ce n’est pas un fichier Excel (.xlsx) lisible.');
    const n = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Fichier Excel abîmé (répertoire central).');
      const methode = v.getUint16(p + 10, true);
      const taille = v.getUint32(p + 20, true);
      const lNom = v.getUint16(p + 28, true), lExtra = v.getUint16(p + 30, true), lCom = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const nom = deUtf8(o.subarray(p + 46, p + 46 + lNom));
      p += 46 + lNom + lExtra + lCom;
      if (v.getUint32(local, true) !== 0x04034b50) throw new Error('Fichier Excel abîmé (en-tête local).');
      const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const brut = o.subarray(debut, debut + taille);
      if (methode === 0) out[nom] = brut;
      else if (methode === 8) out[nom] = await inflerBrut(brut);
      else throw new Error('Compression inconnue dans le fichier Excel (' + methode + ').');
    }
    return out;
  }

  /* ======================================================================
   *  2. XML
   * ====================================================================*/

  const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    // Les caractères de contrôle sont interdits en XML 1.0 : Excel refuserait le fichier.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const desechapper = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const l = e.toLowerCase();
    if (l === 'amp') return '&'; if (l === 'lt') return '<'; if (l === 'gt') return '>';
    if (l === 'quot') return '"'; if (l === 'apos') return "'";
    return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
  });
  const attribut = (attrs, nom) => {
    const m = new RegExp('(?:^|\\s)' + nom + '\\s*=\\s*"([^"]*)"').exec(attrs) || new RegExp('(?:^|\\s)' + nom + "\\s*=\\s*'([^']*)'").exec(attrs);
    return m ? desechapper(m[1]) : null;
  };
  /** Tout le texte des balises <t> d'un fragment (chaînes riches comprises). */
  const textes = frag => {
    let s = '';
    const re = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
    let m; while ((m = re.exec(frag))) s += desechapper(m[1] || '');
    return s;
  };

  /** « C12 » → index de colonne 2 (base 0). */
  function colonneDe(ref) {
    const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function nomColonne(i) {
    let s = ''; i += 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /* ======================================================================
   *  3. ÉCRIRE UN CLASSEUR
   * ====================================================================*/

  const NOM_FEUILLE_INTERDIT = /[\[\]:*?/\\]/g;

  /**
   * @param {Array} feuilles [{ nom, lignes: [[cellule…]…], largeurs?: [n…] }]
   *   La première ligne de chaque feuille est l'en-tête : en gras et figée.
   *   Une cellule est un texte, un nombre, un booléen, ou vide (null).
   * @returns {Uint8Array} le fichier .xlsx
   */
  function ecrireClasseur(feuilles) {
    if (!feuilles || !feuilles.length) throw new Error('Un classeur a au moins une feuille.');
    const noms = new Set();
    const propres = feuilles.map((f, i) => {
      let nom = String(f.nom || ('Feuille' + (i + 1))).replace(NOM_FEUILLE_INTERDIT, ' ').slice(0, 31).trim() || ('Feuille' + (i + 1));
      while (noms.has(nom.toLowerCase())) nom = nom.slice(0, 28) + ' ' + (i + 1);
      noms.add(nom.toLowerCase());
      return { ...f, nom };
    });

    const fichiers = [];
    fichiers.push({ nom: '[Content_Types].xml', contenu:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + propres.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1)
        + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
      + '</Types>' });
    fichiers.push({ nom: '_rels/.rels', contenu:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>' });
    fichiers.push({ nom: 'xl/workbook.xml', contenu:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + propres.map((f, i) => '<sheet name="' + echapper(f.nom) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('')
      + '</sheets></workbook>' });
    fichiers.push({ nom: 'xl/_rels/workbook.xml.rels', contenu:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + propres.map((_, i) => '<Relationship Id="rId' + (i + 1)
        + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
      + '<Relationship Id="rId' + (propres.length + 1)
      + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>' });
    // Deux styles : normal, et gras pour l'en-tête.
    fichiers.push({ nom: 'xl/styles.xml', contenu:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>' });

    propres.forEach((f, i) => {
      const lignes = f.lignes || [];
      const nbCol = Math.max(1, ...lignes.map(l => l.length));
      const largeurs = f.largeurs || Array.from({ length: nbCol }, (_, c) =>
        Math.min(60, Math.max(8, ...lignes.map(l => String(l[c] ?? '').length + 2))));
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetViews><sheetView workbookViewId="0">'
        + (lignes.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '')
        + '</sheetView></sheetViews>'
        + '<cols>' + largeurs.map((w, c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>'
        + '<sheetData>';
      lignes.forEach((ligne, r) => {
        xml += '<row r="' + (r + 1) + '">';
        ligne.forEach((v, c) => {
          if (v === null || v === undefined || v === '') return;
          const ref = nomColonne(c) + (r + 1), style = r === 0 ? ' s="1"' : '';
          if (typeof v === 'number' && Number.isFinite(v)) xml += '<c r="' + ref + '"' + style + '><v>' + v + '</v></c>';
          else if (typeof v === 'boolean') xml += '<c r="' + ref + '"' + style + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
          else xml += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + echapper(v) + '</t></is></c>';
        });
        xml += '</row>';
      });
      xml += '</sheetData></worksheet>';
      fichiers.push({ nom: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenu: xml });
    });
    return zipper(fichiers);
  }

  /* ======================================================================
   *  4. LIRE UN CLASSEUR
   * ====================================================================*/

  /**
   * @param {Uint8Array|ArrayBuffer} octets le fichier .xlsx
   * @returns {Promise<Array>} [{ nom, lignes }] dans l'ordre des onglets.
   *   Les lignes sont denses ; une cellule vide vaut null.
   */
  async function lireClasseur(octets) {
    const f = await dezipper(octets);
    const texte = nom => { const x = f[nom]; return x ? deUtf8(x) : null; };
    const classeur = texte('xl/workbook.xml');
    if (!classeur) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx).');

    const rels = {};
    const relsXml = texte('xl/_rels/workbook.xml.rels') || '';
    for (const m of relsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      const id = attribut(m[1], 'Id'), cible = attribut(m[1], 'Target');
      if (id && cible) rels[id] = cible.replace(/^\/?(xl\/)?/, 'xl/');
    }

    const partagees = [];
    const ss = texte('xl/sharedStrings.xml');
    if (ss) for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) partagees.push(textes(m[1]));

    const feuilles = [];
    for (const m of classeur.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
      const nom = attribut(m[1], 'name');
      const rid = attribut(m[1], 'r:id') || attribut(m[1], 'id');
      const chemin = rels[rid];
      const xml = chemin && texte(chemin);
      if (!xml) continue;
      const lignes = [];
      for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
        const numero = +attribut(r[1], 'r') || lignes.length + 1;
        const ligne = [];
        let suivante = 0;
        for (const c of (r[2] || '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
          const ref = attribut(c[1], 'r');
          const col = ref ? colonneDe(ref) : suivante;
          suivante = col + 1;
          const t = attribut(c[1], 't') || 'n';
          const corps = c[2] || '';
          const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(corps);
          const v = vm ? desechapper(vm[1]) : null;
          let val = null;
          if (t === 's') val = v == null ? null : (partagees[+v] ?? null);
          else if (t === 'inlineStr') val = textes(corps);
          else if (t === 'str') val = v;
          else if (t === 'b') val = v === '1';
          else if (t === 'e') val = null;
          else val = v == null || v === '' ? null : (Number.isFinite(+v) ? +v : v);
          ligne[col] = val;
        }
        for (let i = 0; i < ligne.length; i++) if (ligne[i] === undefined) ligne[i] = null;
        while (lignes.length < numero - 1) lignes.push([]);
        lignes[numero - 1] = ligne;
      }
      feuilles.push({ nom, lignes });
    }
    if (!feuilles.length) throw new Error('Le classeur ne contient aucune feuille lisible.');
    return feuilles;
  }

  /* ======================================================================
   *  5. CSV
   * ====================================================================*/

  /** Lit un CSV ; le séparateur (« ; », « , » ou tabulation) est deviné. */
  function lireCsv(texte) {
    const t = String(texte).replace(/^﻿/, '');
    const premiere = t.split(/\r?\n/)[0];
    const compte = ch => (premiere.match(new RegExp(ch === '\t' ? '\\t' : ch, 'g')) || []).length;
    const sep = [';', ',', '\t'].sort((a, b) => compte(b) - compte(a))[0];
    const lignes = []; let ligne = [], cell = '', guillemets = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (guillemets) {
        if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') guillemets = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') guillemets = true;
      else if (ch === sep) { ligne.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        ligne.push(cell); lignes.push(ligne); ligne = []; cell = '';
      } else cell += ch;
    }
    if (guillemets) throw new Error('Champ CSV entre guillemets non fermé.');
    if (cell !== '' || ligne.length) { ligne.push(cell); lignes.push(ligne); }
    return lignes.map(l => l.map(v => { const s = v.trim(); return s === '' ? null : s; }));
  }

  /** Écrit un CSV qu'Excel en français ouvre d'un double-clic. */
  function ecrireCsv(lignes) {
    const cell = v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + lignes.map(l => l.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  /* ======================================================================
   *  6. LIRE UN FICHIER, QUEL QU'IL SOIT
   * ====================================================================*/

  /**
   * Un fichier choisi par l'utilisateur → ses feuilles. Un CSV donne une
   * feuille unique, nommée d'après le fichier.
   */
  async function lireFichier(fichier, limiteOctets) {
    const max = limiteOctets || 10 * 1024 * 1024;
    if (fichier.size > max) throw new Error('Fichier trop volumineux (' + Math.round(max / 1048576) + ' Mo maximum).');
    const nom = String(fichier.name || '').toLowerCase();
    if (/\.xls$/.test(nom)) throw new Error('Format .xls (Excel 97-2003) non lu : enregistrez le fichier en .xlsx.');
    if (/\.(csv|txt)$/.test(nom)) return [{ nom: fichier.name, lignes: lireCsv(await fichier.text()) }];
    const octets = new Uint8Array(await fichier.arrayBuffer());
    if (octets[0] === 0x50 && octets[1] === 0x4b) return lireClasseur(octets);
    // Pas une archive : on tente le CSV, c'est ce qu'on reçoit le plus souvent.
    return [{ nom: fichier.name, lignes: lireCsv(deUtf8(octets)) }];
  }

  /* ======================================================================
   *  7. DES LIGNES AUX OBJETS
   * ====================================================================*/

  /** « Minutes par vol » → « minutes_par_vol » : la casse et les accents ne comptent pas. */
  const cleEntete = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  /**
   * Une feuille → des objets, clés normalisées depuis la ligne d'en-tête.
   * Chaque objet garde `_ligne`, son numéro dans le tableur, pour que les
   * messages d'erreur désignent la ligne que l'utilisateur voit.
   * Les lignes entièrement vides sont ignorées.
   */
  function enObjets(lignes) {
    const i0 = (lignes || []).findIndex(l => l && l.some(v => v !== null && v !== ''));
    if (i0 < 0) return { entetes: [], objets: [] };
    const entetes = lignes[i0].map(cleEntete);
    const objets = [];
    for (let i = i0 + 1; i < lignes.length; i++) {
      const l = lignes[i] || [];
      if (!l.some(v => v !== null && v !== '' && v !== undefined)) continue;
      const o = { _ligne: i + 1 };
      entetes.forEach((k, c) => { if (k) o[k] = l[c] === undefined ? null : l[c]; });
      objets.push(o);
    }
    return { entetes, objets };
  }

  /** La feuille d'un nom donné (casse et accents indifférents), ou null. */
  function feuille(feuilles, ...noms) {
    const voulus = noms.map(cleEntete);
    return (feuilles || []).find(f => voulus.includes(cleEntete(f.nom))) || null;
  }

  /**
   * Une heure lue dans un tableur. Excel range « 06:30 » comme une fraction
   * de jour (0,2708…) ; un CSV la garde en texte. Les deux donnent 390.
   */
  function heureDe(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      if (v >= 0 && v < 2) return Math.round(v * 1440);   // fraction de jour Excel
      throw new Error('heure illisible : ' + v);
    }
    const m = /^(\d{1,2})[:hH](\d{2})(?::\d{2})?$/.exec(String(v).trim());
    if (!m || +m[1] > 47 || +m[2] > 59) throw new Error('heure attendue au format HH:MM, reçu « ' + v + ' »');
    return +m[1] * 60 + +m[2];
  }
  const hhmm = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

  /** Un nombre lu dans un tableur : « 1,5 » vaut 1.5 ; vide vaut `defaut`. */
  function nombreDe(v, defaut) {
    if (v === null || v === undefined || v === '') return defaut;
    if (typeof v === 'number') return v;
    const n = +String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (!Number.isFinite(n)) throw new Error('nombre attendu, reçu « ' + v + ' »');
    return n;
  }

  /** Oui / non, vrai / faux, 1 / 0, x : ce qu'on tape dans une case à cocher. */
  function ouiNon(v, defaut) {
    if (v === null || v === undefined || v === '') return defaut;
    if (typeof v === 'boolean') return v;
    const s = cleEntete(v);
    if (['oui', 'o', 'vrai', 'true', '1', 'x', 'yes', 'y'].includes(s)) return true;
    if (['non', 'n', 'faux', 'false', '0', 'no'].includes(s)) return false;
    throw new Error('oui ou non attendu, reçu « ' + v + ' »');
  }

  /**
   * Retrouve un élément d'après ce qu'on a tapé dans le tableur : son
   * identifiant, ou son nom sans tenir compte de la casse ni des accents.
   * « MONTAGE », « montage » et « prepa » désignent le même service.
   * @returns {function(string): string|null} l'identifiant, ou null si inconnu
   */
  function correspondance(liste) {
    const parId = new Map(), parNom = new Map();
    for (const x of liste || []) {
      parId.set(String(x.id), x.id);
      const k = cleEntete(x.nom);
      if (k) parNom.set(k, parNom.has(k) && parNom.get(k) !== x.id ? null : x.id);
    }
    return v => {
      if (v === null || v === undefined || v === '') return null;
      const s = String(v).trim();
      if (parId.has(s)) return parId.get(s);
      const k = cleEntete(s);
      if (parNom.has(k) && parNom.get(k) === null) throw new Error('« ' + s + ' » désigne plusieurs services : utilisez son identifiant');
      return parNom.get(k) || parId.get(k) || null;
    };
  }

  /* ======================================================================
   *  8. TÉLÉCHARGER
   * ====================================================================*/

  function telecharger(nom, contenu, type) {
    const blob = new Blob([contenu], { type: type || (/\.csv$/.test(nom) ? 'text/csv;charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const api = { ecrireClasseur, lireClasseur, lireCsv, ecrireCsv, lireFichier, enObjets, feuille,
    cleEntete, heureDe, hhmm, nombreDe, ouiNon, telecharger, correspondance, crc32, zipper, dezipper };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyTableur = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
