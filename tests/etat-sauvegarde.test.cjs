/* Correction 24 (b) — ne pas perdre son travail (version 1) : la partie pure de etat-sauvegarde.js, le signal d'une
 * écriture dans stockage.js, et la page de secours. Sans navigateur ; équipes et compagnies fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../etat-sauvegarde.js');
const Stockage = require('../stockage.js');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
/** Un instant local, écrit en ISO : les heures dites ne dépendent pas du fuseau de la machine. */
const le = (a, m, j, h, min) => new Date(a, m - 1, j, h, min).toISOString();
const MAINTENANT = new Date(2031, 2, 3, 16, 0);

test('la mémoire est une préférence d’affichage : hors des données, hors de la sauvegarde', () => {
  assert.match(E.CLE, /^ory-ui-/);
  assert.equal(Stockage.estDonnee(E.CLE), false);
  assert.equal(/cle:\s*'ory-ui-/.test(lire('sim.js')), false, 'aucune partie de la sauvegarde n’est une préférence');
});

test('une mémoire absente ou abîmée ne sait rien ; une mémoire écrite se relit', () => {
  const RIEN = { fait: null, par: null, change: null };
  for (const t of [null, '', 'pas du json', '42', '[]', '{"fait":"hier","change":12}']) {
    const m = E.lire(t);
    assert.equal(m.fait === null || typeof m.fait === 'string', true);
    if (t !== '{"fait":"hier","change":12}') assert.deepEqual(m, RIEN, String(t));
  }
  const fait = le(2031, 3, 3, 14, 32), change = le(2031, 3, 3, 15, 10);
  assert.deepEqual(E.lire(JSON.stringify({ fait, par: 'sauvegarde', change: null })), { fait, par: 'sauvegarde', change: null });
  assert.deepEqual(E.lire(JSON.stringify({ fait, par: 'restauration', change })), { fait, par: 'restauration', change });
  assert.deepEqual(E.lire(JSON.stringify({ fait, par: 'autre chose', change: 'jamais' })), { fait, par: 'sauvegarde', change: null }, 'ce qui ne se lit pas est ignoré');
  assert.deepEqual(E.lire(JSON.stringify({ fait: null, par: 'sauvegarde', change })), { fait: null, par: null, change });
});

test('un navigateur d’avant : la date de sa dernière sauvegarde, et un changement en attente si un réglage l’a suivie', () => {
  const fait = le(2031, 3, 1, 17, 2);
  assert.deepEqual(E.initiale(null), { fait: null, par: null, change: null }, 'une première visite');
  assert.deepEqual(E.initiale({ sauvegarde: null, reglage: null }), { fait: null, par: null, change: null });
  assert.deepEqual(E.initiale({ sauvegarde: fait, reglage: null }), { fait, par: 'sauvegarde', change: null });
  assert.deepEqual(E.initiale({ sauvegarde: fait, reglage: Date.parse(fait) - 60000 }), { fait, par: 'sauvegarde', change: null }, 'un réglage d’avant la sauvegarde est dedans');
  const apres = Date.parse(fait) + 3600000;
  assert.deepEqual(E.initiale({ sauvegarde: fait, reglage: apres }), { fait, par: 'sauvegarde', change: new Date(apres).toISOString() });
  assert.deepEqual(E.initiale({ sauvegarde: null, reglage: apres }), { fait: null, par: null, change: new Date(apres).toISOString() }, 'jamais sauvegardé, déjà réglé');
});

test('la barre du haut dit l’état par un mot : sauvegardé, non sauvegardé depuis, jamais sauvegardé', () => {
  const fait = le(2031, 3, 3, 14, 32), change = le(2031, 3, 3, 15, 10);
  const sauve = E.dire({ fait, par: 'sauvegarde', change: null }, MAINTENANT);
  assert.deepEqual([sauve.etat, sauve.texte, sauve.mot, sauve.quand], ['sauvegarde', 'Sauvegardé à 14:32', 'Sauvegardé', ' à 14:32']);
  assert.match(sauve.titre, /fichier téléchargé à 14:32 : rien n’a changé depuis\. Cliquer pour tout sauvegarder/);
  const non = E.dire({ fait, par: 'sauvegarde', change }, MAINTENANT);
  assert.deepEqual([non.etat, non.texte, non.mot, non.quand], ['non-sauvegarde', 'Non sauvegardé depuis 14:32', 'Non sauvegardé', ' depuis 14:32']);
  assert.match(non.titre, /depuis la sauvegarde faite à 14:32\. Premier changement à 15:10\./);
  const jamais = E.dire({ fait: null, par: null, change: null }, MAINTENANT);
  assert.deepEqual([jamais.etat, jamais.texte, jamais.mot, jamais.quand], ['jamais', 'Jamais sauvegardé', 'Jamais sauvegardé', '']);
  assert.equal(E.dire({ fait: null, par: null, change }, MAINTENANT).texte, 'Jamais sauvegardé', 'jamais sauvegardé, avec ou sans changement');
  assert.match(E.dire({ fait: null, par: null, change }, MAINTENANT).titre, /Premier changement à 15:10\./);
  // Le mot et l'heure font le texte, toujours.
  for (const d of [sauve, non, jamais]) assert.equal(d.mot + d.quand, d.texte);
  // Après une restauration : l'infobulle le dit.
  assert.match(E.dire({ fait, par: 'restauration', change: null }, MAINTENANT).titre, /^Restauré d’un fichier à 14:32/);
  assert.match(E.dire({ fait, par: 'restauration', change }, MAINTENANT).titre, /depuis la restauration faite à 14:32/);
});

test('un autre jour, la date se dit ; une autre année aussi', () => {
  const hier = le(2031, 3, 2, 17, 5), an = le(2030, 12, 31, 9, 7);
  assert.equal(E.dire({ fait: hier, par: 'sauvegarde', change: null }, MAINTENANT).texte, 'Sauvegardé le 02/03 à 17:05');
  assert.equal(E.dire({ fait: hier, par: 'sauvegarde', change: hier }, MAINTENANT).texte, 'Non sauvegardé depuis le 02/03 à 17:05');
  assert.equal(E.dire({ fait: an, par: 'sauvegarde', change: null }, MAINTENANT).texte, 'Sauvegardé le 31/12/2030 à 09:07');
});

test('il reste des changements dès qu’un changement attend, sauvegarde faite ou non', () => {
  const fait = le(2031, 3, 3, 14, 32), change = le(2031, 3, 3, 15, 10);
  assert.equal(E.reste({ fait, par: 'sauvegarde', change: null }), false);
  assert.equal(E.reste({ fait, par: 'sauvegarde', change }), true);
  assert.equal(E.reste({ fait: null, par: null, change: null }), false, 'jamais sauvegardé, rien de changé : rien à perdre');
  assert.equal(E.reste({ fait: null, par: null, change }), true);
});

test('une entrée de la sauvegarde écrite est un changement ; ce que le calcul écrit de lui-même dans les équipes, non', () => {
  const etat = ateliers => JSON.stringify({ version: 3, effectifs: { cuisine: 'calcule' }, ateliers });
  const tapee = { id: 'cu1', service: 'cuisine', type: 'manuel', personnes: 3, lots: ['EST/YC'] };
  const flotte = { id: 'ar', service: 'armement', type: 'manuel', parCompagnie: true, compagnies: ['EST', 'NORD'], personnes: 2, lots: ['EST/YC', 'NORD/YC'] };
  const robot = { id: 'rb', service: 'robot', type: 'robot', personnes: 2, lots: ['SUD/YC'] };
  const avant = etat([tapee, flotte, robot]);
  assert.equal(E.compte('ory-ateliers-v1', avant, avant), false, 'la même valeur');
  // L'effectif calculé reporté : le nombre tapé reste dans personnesSaisies.
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([{ ...tapee, personnes: 2, personnesSaisies: 3 }, flotte, robot])), false);
  assert.equal(E.compte('ory-ateliers-v1', etat([{ ...tapee, personnes: 2, personnesSaisies: 3 }, flotte, robot]),
    etat([{ ...tapee, personnes: 4, personnesSaisies: 3 }, flotte, robot])), false, 'un autre jour, un autre effectif calculé');
  // Un robot que le calcul ne fait plus retrouve son effectif tapé.
  assert.equal(E.compte('ory-ateliers-v1', etat([tapee, flotte, { ...robot, personnes: 3, personnesSaisies: 2 }]), avant), false);
  // Les commandes d'une équipe « par compagnie » suivent les vols du jour.
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([tapee, { ...flotte, lots: ['EST/YC'] }, robot])), false);
  // Un réglage, lui, compte : un effectif tapé, les commandes d'une équipe ordinaire, ses compagnies, une équipe de plus.
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([{ ...tapee, personnes: 4 }, flotte, robot])), true);
  assert.equal(E.compte('ory-ateliers-v1', etat([{ ...tapee, personnes: 2, personnesSaisies: 3 }, flotte, robot]), etat([{ ...tapee, personnes: 5 }, flotte, robot])), true, 'un effectif retapé sur une équipe calculée');
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([{ ...tapee, lots: ['EST/YC', 'OUEST/YC'] }, flotte, robot])), true);
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([tapee, { ...flotte, compagnies: ['EST'] }, robot])), true);
  assert.equal(E.compte('ory-ateliers-v1', avant, etat([tapee, flotte, robot, { ...tapee, id: 'cu2' }])), true);
  assert.equal(E.compte('ory-ateliers-v1', avant, JSON.stringify({ ...JSON.parse(avant), effectifs: {} })), true);
  // Une entrée retirée, une entrée neuve, une entrée illisible : un changement.
  assert.equal(E.compte('ory-ateliers-v1', avant, null), true);
  assert.equal(E.compte('ory-ateliers-v1', null, avant), true);
  assert.equal(E.compte('ory-ateliers-v1', '{', avant), true);
  // Toute autre entrée : écrite, c'est un changement.
  assert.equal(E.compte('ory-modele-v1', '{"a":1}', '{"a":2}'), true);
  assert.equal(E.compte('ory-modele-v1', '{"a":1}', '{"a":1}'), false);
  assert.equal(E.compte('ory-couleurs-compagnies-v1', null, '{"schema":"x"}'), true);
});

test('stockage.js signale chaque donnée vraiment écrite ou retirée, avec sa valeur d’avant', () => {
  const m = new Map();
  const vrai = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null, clear: () => m.clear(), get length() { return m.size; } };
  const vus = [];
  const g = Stockage.creerGarde(vrai, { surEcriture: (k, avant, apres) => vus.push([k, avant, apres]) });
  g.stockage.setItem('ory-modele-v1', '{"a":1}');
  g.stockage.setItem('ory-modele-v1', '{"a":1}');                       // la même valeur : rien n'est écrit
  g.stockage.setItem('ory-modele-v1', '{"a":2}');
  g.stockage.setItem('ory-ui-theme', 'sombre');                         // une préférence d'affichage
  g.stockage.setItem(E.CLE, '{}');                                      // la mémoire de l'état de sauvegarde : une préférence
  g.stockage.removeItem('ory-seuils-v1');                               // absente : rien n'est retiré
  g.stockage.removeItem('ory-modele-v1');
  assert.deepEqual(vus, [['ory-modele-v1', null, '{"a":1}'], ['ory-modele-v1', '{"a":1}', '{"a":2}'], ['ory-modele-v1', '{"a":2}', null]]);
  // Un onglet en retard n'écrit plus : il ne signale rien.
  vrai.setItem(Stockage.REVISION, '99');
  g.stockage.setItem('ory-modele-v1', '{"a":3}');
  assert.equal(vus.length, 3);
  // Sans écouteur, le garde fait comme avant.
  const h = Stockage.creerGarde(vrai, {});
  h.stockage.setItem('ory-modele-v1', '{"a":4}');
  assert.equal(m.get('ory-modele-v1'), '{"a":4}');
});

test('la page de secours rend toutes les entrées de « Tout sauvegarder », dans le même ordre, et reste autonome', () => {
  const sim = lire('sim.js'), secours = lire('secours.html');
  const bloc = sim.slice(sim.indexOf('const PARTIES = ['), sim.indexOf('function sauvegardeComplete'));
  const duSite = [...bloc.matchAll(/\{\s*cle:\s*'([^']+)'/g)].map(x => x[1]);
  assert.equal(duSite.length, 9, 'les parties de la sauvegarde : ' + duSite.join(' '));
  const liste = secours.match(/var PARTIES = \[([^\]]+)\]/);
  assert.ok(liste, 'la page de secours a sa liste');
  assert.deepEqual([...liste[1].matchAll(/'([^']+)'/g)].map(x => x[1]), duSite);
  assert.equal(/<script[^>]+src=|<link[^>]+stylesheet/.test(secours), false, 'elle ne charge aucun fichier du site');
  // La version 2 (gelée) garde sa page de secours.
  assert.equal(lire('v2/secours.html').includes('ory-couleurs-compagnies-v1'), false);
});

test('la page charge etat-sauvegarde.js après stockage.js et avant sim.js ; la version 2 et les pages hors application ne le chargent pas', () => {
  const scripts = f => [...lire(f).matchAll(/<script[^>]+src="([^"?]+)/g)].map(x => x[1]);
  const v1 = scripts('index.html');
  assert.ok(v1.indexOf('stockage.js') >= 0 && v1.indexOf('stockage.js') < v1.indexOf('etat-sauvegarde.js') && v1.indexOf('etat-sauvegarde.js') < v1.indexOf('sim.js'), v1.join(' '));
  for (const f of ['v2/index.html', 'accueil.html', 'secours.html', 'v2/secours.html']) assert.equal(scripts(f).includes('etat-sauvegarde.js'), false, f);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'v2', 'etat-sauvegarde.js')), false);
  // Le bouton est dans la barre du haut, à côté de l'état du calcul, avec son mot.
  assert.match(lire('index.html'), /id="calcul-etat"[^\n]*\n<button class="sauve" data-etat="jamais" id="etat-sauvegarde" type="button">.*<span class="sauve-mot">Jamais sauvegardé<\/span><\/button>/);
});
