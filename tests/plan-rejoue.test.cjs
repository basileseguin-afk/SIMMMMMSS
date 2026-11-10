/* Évolution 14 (a) — le plan rejoué, sans navigateur (plan-rejoue.js) : le
 * cadrage qui fait tenir le plan avec une marge de 24 px, les tailles des textes
 * à tout zoom, les chiffres cumulés de la bande (jamais « — »), l'heure
 * d'ouverture au pic de travail (les indicateurs de charge de l'évolution 12,
 * sur l'unité fictive des tests), les repères du curseur. Données fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PR = require('../plan-rejoue.js');
const I = require('../moteur/indicateurs.js');
const PE = require('../moteur/periode.js');
const J = require('../moteur/journee.js');
const P = require('../moteur/production.js');
const REF = require('./non-regression.attendu.json');

const VUE = { x: 300, y: 320, w: 4340, h: 2140 };
/** La boîte `b` (unités du plan) à l'écran, après translate(tx ty) scale(k), dans une viewBox `vue` en « meet ». */
function aLEcran(b, vue, ecran, c) {
  const s = Math.min(ecran.w / vue.w, ecran.h / vue.h), ox = (ecran.w - vue.w * s) / 2, oy = (ecran.h - vue.h * s) / 2;
  const X = u => ox + (c.tx + c.k * u - vue.x) * s, Y = u => oy + (c.ty + c.k * u - vue.y) * s;
  return { x: X(b.x), y: Y(b.y), droite: X(b.x + b.w), bas: Y(b.y + b.h) };
}

test('bornes : la boîte de toutes les zones ; rien de lisible, null', () => {
  assert.deepEqual(PR.bornes([{ x: 10, y: 20, w: 100, h: 50 }, { x: -40, y: 60, w: 20, h: 200 }, null, { x: NaN, y: 0, w: 1, h: 1 }]), { x: -40, y: 20, w: 150, h: 240 });
  assert.equal(PR.bornes([]), null);
});

test('cadrage : le plan entier tient à 24 px des bords, centré, où qu’il soit et quelle que soit la fenêtre', () => {
  for (const ecran of [{ w: 1000, h: 600 }, { w: 1600, h: 900 }, { w: 640, h: 900 }])
    for (const b of [{ x: 0, y: 0, w: 330, h: 10 }, { x: 6000, y: 5000, w: 1200, h: 3000 }, { x: 300, y: 320, w: 4340, h: 2140 }]) {
      const c = PR.cadrage(b, VUE, ecran), e = aLEcran(b, VUE, ecran, c), msg = JSON.stringify({ ecran, b, e });
      assert.ok(e.x >= 24 - 1e-6 && e.y >= 24 - 1e-6 && e.droite <= ecran.w - 24 + 1e-6 && e.bas <= ecran.h - 24 + 1e-6, 'dans la marge : ' + msg);
      // Une dimension touche la marge : le plan est aussi grand qu'il peut.
      assert.ok(Math.abs(e.x - 24) < 1e-6 || Math.abs(e.y - 24) < 1e-6, 'aussi grand que possible : ' + msg);
      assert.ok(Math.abs((e.x + e.droite) / 2 - ecran.w / 2) < 1e-6 && Math.abs((e.y + e.bas) / 2 - ecran.h / 2) < 1e-6, 'centré : ' + msg);
    }
  assert.equal(PR.cadrage(null, VUE, { w: 100, h: 100 }), null);
  assert.equal(PR.cadrage({ x: 0, y: 0, w: 1, h: 1 }, VUE, { w: 0, h: 0 }), null, 'un plan caché ne se cadre pas');
});

test('les textes : le nom à 13 px à tout zoom ; les sous-titres seulement quand ils font 11 px, jamais plus de 13 px', () => {
  for (const px of [0.05, 0.23, 1, 4]) {
    const t = PR.tailles(px);
    assert.ok(Math.abs(t.nom * px - 13) < 1e-9, 'nom à 13 px pour ' + px);
    assert.equal(t.sousVisibles, 30 * px >= 11, 'sous-titres pour ' + px);
    if (t.sousVisibles) assert.ok(t.sous * px >= 11 - 1e-9 && t.sous * px <= 13 + 1e-9);
  }
  assert.ok(PR.NOM_PX >= 12 && PR.NOM_PX <= 16);
});

/** Une journée fictive : trois commandes, leurs échéances et leurs fins ; deux lots. */
const JOURNEE = {
  lots: [{ service: 'cuisine', debut: 300, fin: 420, attente: 0, nom: 'A', classes: [] }, { service: 'prepa', debut: 480, fin: 600, attente: 60, nom: 'B', classes: [] }],
  parClasse: { a: { echeance: 500, fin: 450 }, b: { echeance: 550, fin: 620 }, c: { echeance: 700, fin: 680 }, d: { absente: true, echeance: 100 } }
};

test('les chiffres de la bande : cumulés jusqu’à l’heure rejouée, jamais « — »', () => {
  const texte = t => PR.morceaux(PR.chiffresCumules(JOURNEE, t)).map(m => m.texte).join(' · ');
  assert.equal(texte(200), 'commandes prêtes jusqu’ici : 0 sur 3 · 0 service au travail');
  assert.equal(texte(460), 'commandes prêtes jusqu’ici : 1 sur 3, à l’heure · 0 service au travail, 1 attend le service d’avant');
  assert.equal(texte(560), 'commandes prêtes jusqu’ici : 1 sur 3, à l’heure · 1 commande en retard à cette heure · 1 service au travail');
  assert.equal(texte(700), 'commandes prêtes jusqu’ici : 3 sur 3, dont 1 en retard · 0 service au travail');
  const m = PR.morceaux(PR.chiffresCumules(JOURNEE, 700));
  assert.equal(m[0].etat, 'retard', 'le retard se dit par son état');
  for (let t = 0; t <= 800; t += 10) assert.doesNotMatch(texte(t), /—/);
  assert.equal(PR.morceaux(PR.chiffresCumules({ lots: [], parClasse: {} }, 0))[0].texte, 'aucune commande à préparer');
});

test('l’heure d’ouverture : le créneau où le plus de personnes sont au travail, sur l’unité fictive', () => {
  const S = REF.scenarios.find(s => s.nom === 'unite-vol');
  const r = P.simuler(S.args), k = I.journee(r, S.args);
  // La somme des créneaux de tous les services, décalés de leur jour (comme charge-vue.js).
  const somme = groupes => PE.sommeDesCreneaux(groupes.map(g => {
    const c = g.creneaux; if (c.debut === null) return c;
    const d = g.jour * 1440, out = { debut: c.debut + d };
    for (const m of I.MESURES) out[m] = c[m] ? { debut: c[m].debut + d, valeurs: c[m].valeurs } : null;
    return out;
  }));
  const t = PR.heureDuPic(k, somme, I.pic), total = somme(k.services).auTravail, max = Math.max(...total.valeurs);
  assert.ok(Number.isFinite(t));
  assert.equal(total.valeurs[(t - total.debut) / I.PAS], max, 'le créneau du pic');
  assert.equal(total.valeurs.findIndex(v => v === max), (t - total.debut) / I.PAS, 'le premier, à égalité');
  assert.ok(max > 0);
  assert.equal(PR.heureDuPic({ services: [] }, somme, I.pic), null, 'personne au travail : pas de pic');
  assert.equal(J.argumentsDeLaJournee === undefined, false);
});

test('les repères du curseur : chaque jour et chaque départ, à sa place', () => {
  const r = PR.reperes(-600, 1500, [600, 600, 1450, 2000, -700, 0]);
  assert.deepEqual(r.jours.map(j => [j.nom, j.t, j.minuit]), [['J−1', -600, false], ['J', 0, true], ['J+1', 1440, true]]);
  assert.ok(Math.abs(r.jours[1].pos - 600 / 2100) < 1e-12);
  // Le minuit suivant tout près du début : le jour du début ne se nomme pas (les deux noms se chevaucheraient).
  assert.deepEqual(PR.reperes(-300, 1500, []).jours.map(j => j.nom), ['J', 'J+1']);
  assert.deepEqual(r.departs.map(d => d.t), [0, 600, 1450], 'dans la journée, une fois chacun');
  assert.deepEqual(PR.reperes(0, 0, [0]), { jours: [], departs: [] });
  assert.deepEqual(PR.reperes(0, 900, []).jours.map(j => [j.nom, j.minuit]), [['J', true]]);
});
