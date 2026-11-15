#!/usr/bin/env node
/* ==========================================================================
 *  LES MOTS DE LA VERSION 1 (évolution 19 a) — un seul mot par chose
 *
 *  Plusieurs modules de la page sont communs avec la version 2, gelée :
 *  tests/parite.test.cjs les veut identiques des deux côtés. Leurs textes
 *  disent encore « case », « atelier », « flux », « barème », « heures de
 *  travail », « boutique ». La version 1 ne les modifie pas : elle charge, à
 *  leur place, une copie dont SEULS LES MOTS AFFICHÉS changent, rangée dans
 *  mots/ et écrite par cet outil à partir du module commun et des règles de
 *  outils/vocabulaire-regles.cjs. Le code, lui, reste celui du module commun :
 *  tests/vocabulaire.test.cjs refuse une copie qui s'en écarte ailleurs que
 *  dans le texte d'une chaîne, et une copie qui a vieilli.
 *
 *      node outils/vocabulaire.cjs              # réécrit mots/*.js
 *      node outils/vocabulaire.cjs --verifier   # sort en erreur si périmé
 *
 *  Les identifiants, les clés de la sauvegarde et les noms de fichiers ne
 *  changent pas : une règle ne touche que le texte d'une chaîne, jamais un
 *  nom de classe, d'attribut ou de champ.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');
const DOSSIER = 'mots';
const REGLES = require('./vocabulaire-regles.cjs');
const IDENTIFIANT = /^[\w\-:.#$/=\[\]()>+~*|^,]*$/;

/**
 * Découpe une source JavaScript en morceaux : [{ genre, texte }], dont la suite redonne la source. Les genres : « code »,
 * « commentaire », « regex », et « chaine » — le texte lisible d'une chaîne entre ', " ou `, sans ses guillemets ni ses
 * `${…}` (qui sont du code). Un découpage simple, suffisant pour les modules de la page ; `recoller` le vérifie.
 */
function decouper(source) {
  const out = [], n = source.length;
  let i = 0, debut = 0;
  // `gabarit` : le numéro du gabarit (entre `…`) dont le morceau fait partie — ses morceaux se suivent, coupés par ses `${…}`.
  const pousser = (genre, fin, gabarit) => { if (fin > debut) out.push(gabarit ? { genre, texte: source.slice(debut, fin), gabarit } : { genre, texte: source.slice(debut, fin) }); debut = fin; };
  // Une pile d'états : « code » (avec sa profondeur d'accolades quand il vient d'un `${`) ou « gabarit ».
  const pile = [{ etat: 'code', accolades: 0, deGabarit: false }];
  let gabarits = 0;
  const sommet = () => pile[pile.length - 1];
  // Le dernier caractère significatif du code : il dit si un « / » ouvre une expression régulière.
  let dernier = '';
  const ouvreRegex = () => dernier === '' || '(,=:[!&|?{};+-*%<>~^'.includes(dernier) || /(?:^|[^\w$.])(?:return|typeof|case|in|of|do|else|void|delete)$/.test(source.slice(Math.max(0, i - 8), i).trimEnd());
  while (i < n) {
    const s = sommet(), c = source[i], d = source[i + 1];
    if (s.etat === 'gabarit') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { pousser('chaine', i, s.id); i++; pousser('code', i); pile.pop(); dernier = '`'; continue; }
      if (c === '$' && d === '{') { pousser('chaine', i, s.id); i += 2; pousser('code', i); pile.push({ etat: 'code', accolades: 0, deGabarit: true }); dernier = '{'; continue; }
      i++; continue;
    }
    // Du code.
    if (c === '/' && d === '/') { pousser('code', i); while (i < n && source[i] !== '\n') i++; pousser('commentaire', i); continue; }
    if (c === '/' && d === '*') { pousser('code', i); const f = source.indexOf('*/', i + 2); i = f < 0 ? n : f + 2; pousser('commentaire', i); continue; }
    if (c === '\'' || c === '"') {
      i++; pousser('code', i);
      while (i < n && source[i] !== c) { if (source[i] === '\\') i++; i++; }
      pousser('chaine', i); i++; pousser('code', i); dernier = c; continue;
    }
    if (c === '`') { i++; pousser('code', i); pile.push({ etat: 'gabarit', id: ++gabarits }); continue; }
    if (c === '/' && ouvreRegex()) {
      pousser('code', i); i++;
      let classe = false;
      while (i < n) { const x = source[i]; if (x === '\\') { i += 2; continue; } if (x === '[') classe = true; else if (x === ']') classe = false; else if (x === '/' && !classe) break; else if (x === '\n') break; i++; }
      i++; while (i < n && /[a-z]/i.test(source[i])) i++;
      pousser('regex', i); dernier = '/'; continue;
    }
    if (c === '{') s.accolades++;
    else if (c === '}') {
      if (s.deGabarit && s.accolades === 0) { i++; pousser('code', i); pile.pop(); continue; }
      s.accolades--;
    }
    if (!/\s/.test(c)) dernier = c;
    i++;
  }
  if (sommet().etat === 'gabarit') pousser('chaine', n, sommet().id); else pousser('code', n);
  return out;
}
const recoller = morceaux => morceaux.map(m => m.texte).join('');

/** La source où chaque chaîne est vidée : ce qu'il reste est le code — il doit être le même dans la copie et dans le module commun. */
const squelette = source => decouper(source).map(m => (m.genre === 'chaine' ? '' : m.texte)).join('');

/** Les attributs d'une balise dont la valeur s'affiche (une bulle, un libellé lu, l'exemple d'un champ) : les règles s'y appliquent. */
const ATTRIBUTS_AFFICHES = new Set(['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'label']);

/**
 * Le texte d'une chaîne, coupé en morceaux : [{ texte, libre }]. Libre : ce qui s'affiche — le texte hors des balises, la
 * valeur d'un attribut affiché. Protégé : le nom d'une balise, ses attributs, la valeur d'un attribut qui ne s'affiche pas
 * (une classe, un identifiant, une donnée) — les règles générales n'y touchent pas. `etat` ({ lieu, guillemet, affiche })
 * se poursuit d'un morceau à l'autre d'un même gabarit, par-dessus ses `${…}`.
 */
function morceauxAffiches(texte, etat) {
  const out = [], libreIci = () => etat.lieu === 'texte' || (etat.lieu === 'valeur' && etat.affiche);
  let debut = 0, libre = libreIci();
  const couper = i => { if (i > debut) out.push({ texte: texte.slice(debut, i), libre }); debut = i; libre = libreIci(); };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (etat.lieu === 'texte') {
      if (c === '<' && /[a-zA-Z/!]/.test(texte[i + 1] || '')) { etat.lieu = 'balise'; couper(i); }
    } else if (etat.lieu === 'balise') {
      if (c === '>') { etat.lieu = 'texte'; couper(i + 1); }
      else if (c === '=' && (texte[i + 1] === '"' || texte[i + 1] === '\'')) {
        const nom = (/([\w:-]+)\s*$/.exec(texte.slice(0, i)) || [])[1] || '';
        etat.lieu = 'valeur'; etat.guillemet = texte[i + 1]; etat.affiche = ATTRIBUTS_AFFICHES.has(nom.toLowerCase());
        i++; couper(i + 1);
      }
    } else if (c === etat.guillemet) { etat.lieu = 'balise'; couper(i); }
  }
  couper(texte.length);
  return out;
}

/**
 * Applique les règles au texte des chaînes d'une source : d'abord celles du fichier (un extrait exact du texte d'une
 * chaîne, remplacé tel quel ; chacune doit servir), puis les règles générales (des expressions régulières). Rend la
 * source réécrite et les règles du fichier qui n'ont pas servi.
 */
function reecrire(source, fichier) {
  // Les règles « brutes » d'abord : un extrait exact de la source (une chaîne d'un seul mot dans son appel), une seule fois.
  const brutes = [];
  for (const [de, vers] of (REGLES.brutes[fichier] || [])) {
    const n = source.split(de).length - 1;
    if (n !== 1) brutes.push(de + ' (' + n + ' fois)'); else source = source.replace(de, () => vers);
  }
  const siennes = (REGLES.parFichier[fichier] || []).map(([de, vers]) => ({ de, vers, n: 0 }));
  const generales = !(REGLES.sansGenerales || []).includes(fichier);
  const etats = new Map();
  const morceaux = decouper(source).map(m => {
    if (m.genre !== 'chaine' || !m.texte) return m;
    // Où en est la balise en cours : d'un morceau à l'autre du même gabarit ; une chaîne entre guillemets repart du texte.
    const etat = (m.gabarit && etats.get(m.gabarit)) || { lieu: 'texte' };
    if (m.gabarit) etats.set(m.gabarit, etat);
    let t = m.texte;
    for (const r of siennes) {
      if (r.de[0] === '=') { if (t === r.de.slice(1)) { r.n++; t = r.vers; } }
      else if (t.includes(r.de)) { r.n += t.split(r.de).length - 1; t = t.split(r.de).join(r.vers); }
    }
    // Une chaîne d'un seul mot sans accent ni espace est un identifiant (« atelier », « flux », « case ») : on n'y touche pas.
    // Les règles générales : dans ce qui s'affiche seulement, jamais dans le nom d'une classe ou la valeur d'une donnée.
    const parties = morceauxAffiches(t, etat);
    if (generales && !IDENTIFIANT.test(t)) {
      t = parties.map(p => (p.libre ? REGLES.generales.reduce((x, [motif, par]) => x.replace(motif, par), p.texte) : p.texte)).join('');
    }
    return { ...m, texte: t };
  });
  return { source: recoller(morceaux), inutiles: brutes.concat(siennes.filter(r => !r.n).map(r => r.de)) };
}

const entete = fichier => '/* ÉCRIT PAR outils/vocabulaire.cjs — ne pas modifier à la main. Les mots de la version 1 (évolution 19 a) : une copie de\n'
  + ' * ../' + fichier + ', commun avec la version 2 et laissé tel quel, où seuls les mots affichés changent (outils/vocabulaire-regles.cjs). */\n';

/** La copie d'un module commun, avec les mots de la version 1. */
function copieDe(fichier) {
  const source = fs.readFileSync(path.join(RACINE, fichier), 'utf8'), r = reecrire(source, fichier);
  // Rangée un dossier plus bas, la copie retrouve les modules voisins un dossier plus haut (pour les outils et les tests).
  const texte = r.source.replace(/require\('\.\//g, "require('../");
  return { texte: entete(fichier) + texte, inutiles: r.inutiles, source };
}
const cheminDe = fichier => path.join(RACINE, DOSSIER, fichier);

function principal(argv) {
  const verifier = argv.includes('--verifier');
  let perimes = 0, ecrits = 0;
  for (const fichier of REGLES.communs) {
    const c = copieDe(fichier), cible = cheminDe(fichier);
    if (c.inutiles.length) { console.error(fichier + ' : des règles ne servent pas : ' + c.inutiles.join(' | ')); process.exitCode = 1; }
    const avant = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
    if (avant === c.texte) continue;
    if (verifier) { console.error(DOSSIER + '/' + fichier + ' a vieilli : node outils/vocabulaire.cjs'); perimes++; continue; }
    fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.writeFileSync(cible, c.texte); ecrits++;
  }
  if (verifier) { if (perimes) process.exitCode = 1; else console.log('mots : à jour'); }
  else console.log(ecrits ? 'mots : ' + ecrits + ' fichier(s) réécrit(s)' : 'mots : rien à faire');
}

module.exports = { DOSSIER, ATTRIBUTS_AFFICHES, decouper, recoller, squelette, morceauxAffiches, reecrire, copieDe, cheminDe, entete };
if (require.main === module) principal(process.argv.slice(2));
