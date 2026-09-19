# Centre des flux

Ouvrir l’onglet **Centre des flux**, à côté du plan et du suivi des vols.
Chaque ligne décrit une liaison orientée **origine → destination**. Les listes
proposent les services et leurs stockages. Un service ou un stockage peut
apparaître dans autant de lignes que nécessaire, comme origine ou destination.
Une liaison inverse se crée avec **Ajouter le retour** ; elle n’est jamais implicite.

## Familles

| Famille | Types proposés | Règle |
| --- | --- | --- |
| Humains | Personnel du service, Runner | Le personnel reste dans son service ; seul un runner peut emprunter une liaison entre services. |
| Matériels | Matériel | Équipements et contenants, avec une précision libre facultative. |
| Matières | Matières premières, Matières transformées | Deux types distincts, y compris sur une même paire d’emplacements. |
| Informations | OF, Kanban | Aucun autre type de message dans cette version. |

La circulation humaine interne est autorisée par défaut entre un service et
ses stockages, et entre ses stockages. Il n’est pas nécessaire de créer une ligne
par déplacement interne. Les cases **Circulation humaine à l’intérieur des
services** permettent de désactiver cette autorisation générale ; des liaisons
internes explicites restent possibles. Un runner bénéficie aussi de la
circulation interne, mais chaque liaison entre services doit être déclarée.
Les autorisations portent sur une liaison directe, pas sur un itinéraire calculé.

## Modifier les liaisons

1. Choisir une famille ou conserver **Tous**, puis éventuellement un service.
2. Sélectionner le type, l’origine et la destination dans **Ajouter une liaison**.
3. Ajouter une précision si utile, puis valider. Répéter pour les autres destinations.
4. Modifier directement les listes d’une ligne, décocher **Activer**, ajouter
   son retour ou la supprimer.

Un doublon exact (même type, même origine et même destination) est refusé,
même si la liaison existante est désactivée. La direction opposée et les autres
types restent possibles. Une liaison vers le même emplacement est refusée.
**Annuler / Rétablir** couvre les modifications, suppressions, règles humaines
et imports (80 actions, dans la session). Cet historique est distinct du plan.

Les anciennes flèches sont reprises **À classer** : leur contenu n’était pas
renseigné. Choisir leur type pour les qualifier. Elles restent affichables en
pointillés, mais ne donnent aucune autorisation humaine.

Les stockages se créent depuis la fiche du service sur le plan. Un changement
de nom est repris automatiquement dans les listes. Si un stockage disparaît,
ses liaisons sont conservées et signalées **à réparer**, sans être utilisables
ni dessinées. Choisir une nouvelle extrémité ou annuler la suppression du stockage.
Un stockage encore « à rattacher » dans l’éditeur n’est pas proposé comme extrémité.

## Affichage sur le plan

**Voir ces flux sur le plan** applique la famille et le service sélectionnés.
Le sélecteur **Flux affichés** permet ensuite de choisir une autre famille ou
**Aucun** ; cela enlève le filtre de service. Les couleurs distinguent les familles,
et les matières premières / transformées. Les stockages utilisent la position de
leur service : aucun frigo n’est replacé sur le dessin. Les échanges internes se
consultent dans la liste et ne génèrent pas de flèches sur le service lui-même.

## Sauvegarde et portée

La configuration est automatiquement enregistrée dans ce navigateur.
**Exporter** conserve les liaisons et les règles humaines dans un JSON.
**Importer** vérifie tout le fichier avant remplacement, demande confirmation
et reste annulable. Un fichier invalide laisse la configuration intacte.
Pour un autre poste, importer d’abord le plan avec ses stockages, puis les flux.
Les extrémités absentes sont conservées et signalées, sans attribution automatique.
En cas de sauvegarde locale impossible, exporter avant de fermer la page.

Le centre définit le réseau d’échanges et les autorisations de circulation.
Il ne recalcule pas encore les gammes, temps de transport, stocks, cadences ou
ETP du démonstrateur, et ne modifie pas le déplacement de ses jetons animés.
Le raccordement au moteur nécessitera les règles de routage et les temps métier.
Aucun catalogue d’articles ni quantité n’est demandé ici.

## Contrat technique pour la suite

- Module `flow-center.js`, accessible via `OrlyFlows` et `Sim.flows`.
- JSON `ory-flows`, version 1, clé locale `orly-flows-v1`.
- `flows` : identifiant stable, type, `from`, `to`, `enabled`, précision `label`.
- Extrémité : paire sérialisée `[serviceId, storageId]` ; `null` désigne le service.
- `internal` : autorisations générales par identifiant de service ; absent = autorisé.
- `OrlyFlows.canTravel(state, points, from, to, role)` contrôle les déplacements
  directs. `usable` exclut les liaisons désactivées, non classées ou orphelines.
- Limites d’import : 2 Mo, 2 000 liaisons ; précision libre de 200 caractères.

Vérification : `node --test tests/flows.test.cjs` et
`node tests/flows-browser.cjs` (Playwright et Chromium requis).
