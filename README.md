# 🏭 UsineSim — Simulateur de gestion d'usine

Un « Sims pour l'industrie » : construisez votre usine, créez des ateliers,
embauchez du personnel, installez des machines de production et regardez la
chaîne tourner en temps réel — des matières premières jusqu'aux produits finis
vendus sur le marché.

Application **100 % navigateur**, sans installation ni serveur : ouvrez
`index.html` et jouez. La partie est sauvegardée automatiquement dans le
navigateur (localStorage).

![Aperçu de l'usine](assets/apercu.png)

## ▶️ Lancer

Ouvrez simplement `index.html` dans un navigateur récent.
(Ou servez le dossier : `python3 -m http.server` puis ouvrez `http://localhost:8000`.)

Une usine de démonstration est déjà en place. Cliquez sur **▶ Démarrer** pour
lancer la production, et ajustez la vitesse (1× → 8×).

## 🎮 Ce que vous pouvez faire

- **🧱 Ateliers** — créez des ateliers et réglez pour chacun :
  - un **temps de préparation** (setup avant chaque redémarrage),
  - une **cadence de production** (multiplicateur de vitesse),
  - les **machines** qu'il contient.
- **👷 Personnel** — embauchez des ouvriers, affectez-les à un atelier puis à
  une machine. Une machine ne tourne que si elle a **assez d'ouvriers**.
- **⚙️ Machines de production** — ajoutez des machines à vos ateliers. Chaque
  machine suit une **recette** : elle consomme des entrées et produit des
  sorties, à son rythme.
- **📦 Zones de stockage** — créez des zones pour augmenter la **capacité**.
  Une machine se **bloque** quand le stock est plein.
- **🏁 Sorties de produits finis** — la chaîne transforme les matières brutes en
  produits intermédiaires puis en produits finis.
- **💶 Marché & économie** — les matières brutes sont **achetées** à la
  production, les produits finis peuvent être **vendus automatiquement**. Suivez
  budget, recettes et dépenses.
- **📚 Catalogue** — définissez vos propres **produits** et **types de machines**
  (constructeur de recettes entrées → sorties).

## 🔄 Comment fonctionne la simulation

Chaque machine passe par un cycle :

```
à l'arrêt → préparation (temps de prépa de l'atelier) → production → (répète)
```

À chaque cycle terminé, la machine **consomme ses entrées** et **produit ses
sorties**. Elle s'interrompt automatiquement si :

| État              | Cause                                    |
|-------------------|------------------------------------------|
| Sans personnel    | pas assez d'ouvriers affectés            |
| Attente matières  | entrées manquantes en stock              |
| Stock plein       | plus de place pour ranger les sorties    |

La durée d'un cycle vaut `temps de base de la machine ÷ cadence de l'atelier`.

## 🏗️ La chaîne de démonstration

```
Bois  ──[Scie]──▶ Planche ─┐
                           ├─[Assemblage]──▶ Chaise 🪑 (vendue)
Métal ─[Presse]─▶ Vis ─────┘
```

D'autres recettes sont fournies (mouleuse, couture, électronique, tapisserie)
pour construire des chaînes plus longues jusqu'au **Gadget 📱** et au
**Fauteuil 💺**.

## 🧩 Structure du projet

| Fichier          | Rôle                                                        |
|------------------|-------------------------------------------------------------|
| `index.html`     | Structure de la page et barre d'outils                      |
| `css/styles.css` | Thème industriel sombre, responsive                         |
| `js/data.js`     | Catalogue par défaut (produits, machines) et usine de démo  |
| `js/state.js`    | État global, persistance, mutations du modèle               |
| `js/sim.js`      | Moteur de simulation (boucle de production, économie)       |
| `js/ui.js`       | Rendu de l'interface et interactions                        |
| `js/main.js`     | Point d'entrée et câblage des contrôles                     |

Aucune dépendance, aucune étape de build : du HTML/CSS/JavaScript pur.

## 💾 Sauvegarde

- Sauvegarde **automatique** toutes les 10 s pendant la simulation et à la
  fermeture de l'onglet.
- Bouton **💾** pour sauvegarder à la demande.
- Bouton **↺** pour repartir d'une usine neuve.
