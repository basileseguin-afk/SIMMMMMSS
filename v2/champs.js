/* ==========================================================================
 *  LES CHAMPS — l'heure en 24 h, les flèches, le refus sous le champ
 *  (refonte du 08/10, étape 7)
 *
 *  L'HEURE. Un champ texte `data-heure` remplace le champ natif `type=time`,
 *  qui s'affichait « 04:00 AM » selon la langue du navigateur. On tape
 *  « 0430 », « 430 », « 4:30 », « 4h30 » ou « 4 » : le champ écrit « 04:30 »
 *  (ou « 04:00 »). L'heure gardée s'écrit « HH:MM », comme avant : les
 *  données ne changent pas. Au focus, tout est choisi : on retape par-dessus.
 *  Rien ne s'enregistre pendant la frappe : Entrée, ou la sortie du champ,
 *  enregistrent. ↑↓ avancent d'un quart d'heure, Maj+↑↓ d'une heure.
 *
 *  LES NOMBRES. ↑↓ font ±1 (le pas du champ), comme le navigateur ;
 *  Maj+↑↓ font dix pas.
 *
 *  LE REFUS. Une heure impossible, ou une saisie que la page refuse (un nom
 *  vide, déjà pris…), se lit SOUS LE CHAMP : une bordure, et la raison. Le
 *  champ reprend la valeur gardée : l'écran ne montre jamais ce qui n'est pas
 *  retenu. Le message s'efface dès qu'on retape dans le champ, ou qu'il est
 *  enregistré.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** « 0430 », « 430 », « 4:30 », « 4h30 », « 4 » → « 04:30 » ; vide → '' ; impossible → null. */
  function heure(s) {
    let t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return '';
    t = t.replace(/^(\d{1,2})[h.]/, '$1:');
    let h, m;
    if (/^\d{1,2}$/.test(t)) { h = +t; m = 0; }
    else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, -2); m = +t.slice(-2); }
    else {
      const x = t.match(/^(\d{1,2}):(\d{0,2})$/);
      if (!x) return null;
      h = +x[1]; m = x[2] === '' ? 0 : +x[2];
    }
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /** Une heure « HH:MM » décalée de `pas` minutes, sur un cadran de 24 h ; au quart d'heure près, pour ±15. */
  function decaler(valeur, pas) {
    const v = heure(valeur);
    let t = v ? +v.slice(0, 2) * 60 + +v.slice(3) : 0;
    if (Math.abs(pas) === 15) t = pas > 0 ? Math.floor(t / 15) * 15 + 15 : Math.ceil(t / 15) * 15 - 15;
    else t += pas;
    t = ((t % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  /** Un nombre décalé de `n` pas du champ, dans ses bornes, sans poussière de virgule. */
  function avancer(valeur, n, o = {}) {
    const pas = Number.isFinite(+o.pas) && +o.pas > 0 ? +o.pas : 1;
    const x = parseFloat(String(valeur ?? '').replace(',', '.'));
    let v = (Number.isFinite(x) ? x : 0) + n * pas;
    if (Number.isFinite(o.min)) v = Math.max(o.min, v);
    if (Number.isFinite(o.max)) v = Math.min(o.max, v);
    const decimales = (String(pas).split('.')[1] || '').length;
    return String(+v.toFixed(Math.max(decimales, (String(x).split('.')[1] || '').length)));
  }

  const api = { heure, decaler, avancer };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.OrlyChamps = api;
  const d = root.document; if (!d) return;

  /* ---- le refus sous le champ ----------------------------------------------- */

  let numero = 0;
  const messages = new WeakMap();      // champ → son message

  /** Le message d'un champ : sous lui, ou sous son libellé quand il est dedans. */
  function refuser(el, texte) {
    if (!el || !el.isConnected) return;
    effacer(el);
    const p = d.createElement('span');
    p.className = 'champ-erreur'; p.id = 'champ-erreur-' + (++numero);
    p.setAttribute('role', 'alert');
    p.textContent = String(texte).replace(/^Refusé\s*:\s*/, '').replace(/^./, c => c.toUpperCase());
    (el.closest('label') || el).after(p);
    messages.set(el, p);
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', p.id);
  }
  function effacer(el) {
    const p = el && messages.get(el); if (!p) return;
    messages.delete(el); p.remove();
    el.removeAttribute('aria-invalid');
    if (el.getAttribute('aria-describedby') === p.id) el.removeAttribute('aria-describedby');
  }

  /** Le champ tel qu'il est à l'écran : lui, ou celui qui l'a remplacé quand la page s'est redessinée. */
  function retrouver(el) {
    if (!el || el.isConnected) return el || null;
    const attrs = Object.keys(el.dataset).map(k => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`).join('');
    if (!attrs) return null;
    const at = el.closest('[data-at]');
    const sel = (at && at !== el ? `[data-at="${CSS.escape(at.dataset.at)}"] ` : '') + el.tagName.toLowerCase() + attrs;
    const actif = d.activeElement;
    if (actif && actif.matches && actif.matches(sel)) return actif;
    return [...d.querySelectorAll(sel)].find(x => x.offsetParent !== null) || null;
  }

  /* ---- l'heure ----------------------------------------------------------------- */

  const estHeure = el => !!(el && el.matches && el.matches('input[data-heure]'));
  const choisi = new WeakSet();        // le premier clic a déjà tout choisi

  // Au focus, tout est choisi : on retape l'heure par-dessus.
  d.addEventListener('focusin', e => { if (estHeure(e.target)) e.target.select(); });
  // Le premier clic choisit toute l'heure, au lieu d'y poser le curseur (le
  // navigateur le poserait après nous, parfois seulement au relâchement) ; le
  // suivant pose le curseur, pour corriger un chiffre.
  d.addEventListener('mousedown', e => {
    const el = e.target;
    if (e.button !== 0 || !estHeure(el) || choisi.has(el) || el.disabled || el.readOnly) return;
    e.preventDefault();
    choisi.add(el);
    if (d.activeElement !== el) el.focus(); else el.select();
  });
  d.addEventListener('focusout', e => { if (estHeure(e.target)) choisi.delete(e.target); });

  d.addEventListener('input', e => {
    const el = e.target;
    if (messages.has(el)) effacer(el);
    // Quatre chiffres : « 1430 » s'écrit « 14:30 ».
    if (estHeure(el) && /^\d{4}$/.test(el.value) && heure(el.value)) el.value = heure(el.value);
  });

  /** Changer la valeur comme le ferait la frappe : la page l'entend, et l'enregistre. */
  function poser(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  d.addEventListener('keydown', e => {
    const el = e.target;
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey || !el || !el.matches) return;
    const sens = e.key === 'ArrowUp' ? 1 : -1;
    if (estHeure(el)) {
      if (el.readOnly || el.disabled) return;
      e.preventDefault();
      poser(el, decaler(el.value || el.defaultValue, sens * (e.shiftKey ? 60 : 15)));
      el.select();
    } else if (e.shiftKey && el.matches('input[type=number]') && !el.readOnly && !el.disabled) {
      // Le navigateur fait ±1 ; Maj, dix pas.
      e.preventDefault();
      const borne = a => (el.getAttribute(a) === null || el.getAttribute(a) === '' ? NaN : +el.getAttribute(a));
      poser(el, avancer(el.value, sens * 10, { pas: el.step && el.step !== 'any' ? +el.step : 1, min: borne('min'), max: borne('max') }));
    }
  });

  // Avant que la page ne l'enregistre : l'heure au propre, ou le refus sous le champ.
  d.addEventListener('change', e => {
    const el = e.target; if (!estHeure(el)) return;
    const v = heure(el.value);
    if (!v) {
      e.stopImmediatePropagation();
      const tape = el.value.trim();
      el.value = el.defaultValue;
      refuser(el, tape ? '« ' + tape + ' » n’est pas une heure : tapez par exemple 0430, 4:30 ou 4h30.'
        : 'Une heure est attendue : tapez par exemple 0430, 4:30 ou 4h30.');
      // On retape par-dessus, au clavier comme d'un clic.
      choisi.delete(el);
      if (d.activeElement === el) el.select();
      return;
    }
    effacer(el);
    el.value = v;
  }, true);

  /* ---- les tableaux d'heures au clavier (étape 8) ------------------------------ */

  // Dans un tableau d'heures ou d'horaires (`data-clavier`), Entrée enregistre et
  // descend à la ligne suivante, dans la même colonne ; Maj+Entrée remonte. Tab
  // avance, comme partout. La dernière ligne garde l'Entrée d'ailleurs : on
  // enregistre, et l'on reste.
  const saisissable = x => !!(x && x.matches && x.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]):not([disabled]):not([readonly])'));
  /** Le champ de la même colonne, `sens` lignes plus bas (1) ou plus haut (-1). */
  function voisin(el, sens) {
    const cellule = el.closest('td,th'), ligne = cellule && cellule.parentElement, table = ligne && ligne.closest('table');
    if (!table) return null;
    const r = cellule.getBoundingClientRect(), x = r.left + r.width / 2;
    const lignes = [...table.querySelectorAll('tbody tr')];
    for (let i = lignes.indexOf(ligne) + sens; i >= 0 && i < lignes.length; i += sens) {
      const c = [...lignes[i].children].find(c => { const b = c.getBoundingClientRect(); return b.left <= x && x < b.right; });
      const champ = c && [...c.querySelectorAll('input')].find(saisissable);
      if (champ && champ.offsetParent !== null) return champ;
    }
    return null;
  }
  d.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const el = e.target;
    if (!saisissable(el) || !el.closest('table[data-clavier]')) return;
    const suivant = voisin(el, e.shiftKey ? -1 : 1);
    if (!suivant) return;
    e.preventDefault();
    // Quitter le champ l'enregistre (« change ») ; le suivant se montre sans faire sauter le tableau.
    suivant.focus({ preventScroll: true });
    suivant.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (typeof suivant.select === 'function') suivant.select();
  });

  Object.assign(api, { refuser, effacer, retrouver });
})(typeof window !== 'undefined' ? window : globalThis);
