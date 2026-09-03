# Journal technique — Pilote Mora

Ce document trace le déroulement réel du développement : décisions techniques, problèmes rencontrés et leur résolution, résultats obtenus. Objectif : une trace honnête du processus, pas seulement du résultat final.

## 1. Choix du site pilote

Mora a été retenu comme premier site pour son cycle cultural court et sa nébulosité relativement faible (climat sahélien), offrant des signatures phénologiques plus nettes pour valider le pipeline avant extension aux zones plus complexes (notamment Buea, forte nébulosité équatoriale).

## 2. Définition de la période d'analyse

**Décision clé** : la zone de Mora présente deux campagnes agricoles distinctes — une campagne pluviale classique (avril–octobre) et une campagne de contre-saison, le ***muskuwaari*** (sorgho de décrue sur vertisols, décembre–mars), typique de l'Extrême-Nord camerounais. Une fenêtre d'analyse limitée à la seule saison des pluies aurait manqué cette seconde campagne. La période retenue couvre donc un cycle complet (avril 2025 – mai 2026, 28 fenêtres de 15 jours).

## 3. Problèmes techniques rencontrés et résolus

| Problème | Diagnostic | Résolution |
|---|---|---|
| `Geometry.centroid` : erreur de type `maxError` | Géométrie trop complexe issue d'un buffer QGIS | Centrage manuel par coordonnées plutôt que `centerObject` |
| Fenêtres temporelles sans image S2 (nébulosité) | 3 fenêtres sur 28 sans observation optique exploitable en cœur de saison des pluies | Confirmé que Sentinel-1 comblait le vide (complémentarité radar/optique validée empiriquement) |
| `Image.unmask` : incompatibilité de bandes (0 vs 1) | `.median()` sur collection vide retourne une image à 0 bande | Image "fantôme" masquée injectée dans la collection avant réduction, garantissant une structure de bandes homogène |
| Erreur de typage `MaskOnly` vs `Float` | Optimisation interne GEE typant différemment une image constante masquée | Forçage explicite `.toFloat()` sur toutes les images de la collection |
| `ee.Clusterer` retourne `undefined` | Session/cache navigateur non rechargé après modifications | Rechargement complet de la page (résolu) |
| `ui.Chart.image.byClass` : axe des x trié alphabétiquement | Tri de chaînes de caractères (`NDVI_10` avant `NDVI_2`) au lieu d'un tri numérique | Reconstruction du graphique avec ordre chronologique correct côté client |
| Graphique vide malgré données valides | `ui.Chart.image.series` nécessite une propriété d'axe explicite | Ajout de `xProperty: 'window_index'` avec extraction numérique de l'index depuis le nom de bande |
| `reduceRegion` : dépassement de `maxPixels` | Zone d'étude trop grande pour l'échelle de calcul par défaut | Augmentation de l'échelle (`scale: 100`) pour les statistiques agrégées |

## 4. Diagnostic d'une fenêtre contaminée (fenêtre 8)

Une fenêtre affichait un pic NDVI anormal et incohérent avec la dynamique attendue. Investigation :
- Nébulosité déclarée : 33.6% et 38.2% (sous le seuil de 40%, donc acceptée par le filtre)
- Inspection visuelle de la composition RGB brute : nébulosité dense et **localement concentrée** au nord-est de la zone, non uniformément répartie
- **Conclusion** : le seuil de nébulosité par scène (`CLOUDY_PIXEL_PERCENTAGE`) est insuffisant seul — il ne capture pas la contamination locale au sein de l'AOI. Fenêtre exclue de l'analyse.
- **Amélioration identifiée pour la suite** : filtrage basé sur le pourcentage de pixels valides *après masquage*, spécifiquement dans l'AOI (pas sur la scène entière).

## 5. Clustering et interprétation

- K-means, k=7, entraîné sur un échantillon de 5000 pixels
- Résultat visuellement cohérent : formes géographiques nettes, pas de bruit aléatoire
- **Cluster 6** identifié comme distinct par son profil NDVI élevé et stable toute l'année — hypothèse initiale de végétation ripicole liée au réseau hydrographique
  - Test avec couche de cours d'eau OpenStreetMap : **non concluant**, absence de cours d'eau cartographiés dans le secteur concerné
  - Limite documentée : sous-cartographie connue des cours d'eau saisonniers (mayo) en zone sahélienne sur OSM — l'absence de donnée n'est pas une preuve d'absence de cours d'eau réel
  - Piste non finalisée : dérivation d'un réseau de drainage depuis un MNT (Copernicus DEM 30m) plutôt que dépendance à une source vectorielle externe potentiellement incomplète

## 6. Croisement avec des données de validation

**Première itération (retirée du dépôt)** : un jeu de données FAO/RGAE (184 polygones villageois, Mora, cultures dominantes déclarées) avait été utilisé pour un premier croisement, permettant un rapprochement du scénario 2 (données limitées) plutôt que le scénario 3 pur. Le résultat était peu discriminant : les cultures principales (Maïs, Mil/Sorgho, Arachide, Cotonnier, Niébé) se répartissaient de façon similaire sur tous les clusters — probablement un problème de granularité (déclaration à l'échelle du village, plusieurs centaines d'hectares, sans distinction spatiale interne) plutôt qu'un échec du clustering lui-même.

**Décision** : ce jeu de données étant une donnée de recensement gouvernemental (géométries et déclarations villageoises), il a été retiré de ce dépôt public par précaution — sa réutilisation/republication n'était pas clairement autorisée dans ce contexte. Le croisement a été **refait intégralement avec des sources publiques**, pour un pipeline entièrement reproductible :

- **[ESA WorldCover](https://esa-worldcover.org)** (10m, 2021, CC-BY-4.0) : occupation du sol générale, utilisée pour valider l'interprétation des clusters non-agricoles (ex. cluster à NDVI élevé et stable, hypothèse de végétation pérenne).
- **[ESA WorldCereal](https://esa-worldcereal.org)** (10m, marqueurs de culture active par saison, CC-BY-4.0) : validation croisée de l'étendue des surfaces cultivées actives par cluster.

**Limite à noter** : WorldCereal couvre la campagne 2020-2021, pas la période d'étude 2025-2026 — il sert de référence structurelle (où se trouvent les zones à cycles multiples dans la région), pas de comparaison temporelle directe.

## 7. Recherche du signal de contre-saison (muskuwaari) — investigation close

Hypothèse testée : un second pic NDVI en décembre-février signerait la culture de contre-saison (sorgho de décrue, *muskuwaari*), pratique typique de l'Extrême-Nord camerounais non couverte par le calendrier pluvial classique.

**Quatre approches indépendantes testées, toutes convergentes vers la même limite :**

| Approche | Résultat |
|---|---|
| Profil NDVI moyen sur tous les clusters (pipeline propre) | Pic unique net (fin août-septembre), décroissance continue — pas de second pic |
| Profil NDVI restreint aux zones agricoles FAO | Même constat — pic unique |
| Profil NDVI restreint aux surfaces cultivées ESA WorldCover | Même constat — pic unique |
| ESA WorldCereal, marqueur `tc-wintercereals` | Quasi intégralement inactif (0) sur toute la zone |
| ESA WorldCereal, marqueur `tc-maize-second` | 0 pixel valide dans l'AOI (produit non généré/masqué pour ce secteur de l'AEZ 32114) |

**Interprétation** : ni notre propre analyse de séries temporelles (à trois niveaux d'agrégation différents), ni les produits globaux de référence (WorldCereal) ne parviennent à capter cette pratique culturale. Deux explications convergentes plutôt que contradictoires :
- Les catégories saisonnières globales de WorldCereal (`wintercereals` = céréales d'hiver tempérées, calibrées sur un contexte agronomique différent) ne correspondent probablement pas au système agraire du muskuwaari (semis en fin de saison des pluies sur vertisols, sans irrigation ni vrai cycle hivernal).
- Le signal, s'il existe, reste possiblement dilué par l'agrégation à l'échelle testée (cluster entier, ensemble des zones agricoles) — une analyse **polygone par polygone ou parcelle par parcelle** serait nécessaire pour l'isoler, si les données de référence locales le permettent un jour.

**Conclusion retenue** : cette convergence de quatre méthodes indépendantes constitue un résultat documenté en soi, pas un échec de pipeline — elle illustre concrètement une limite reconnue par la méthodologie de référence RGAE (§8, variabilité spatiale des pratiques culturales) : les produits satellitaires globaux et les agrégations statistiques standards peinent à capter des pratiques agricoles hyper-locales et non-standards, ce qui justifie le recours à l'expertise agronomique de terrain en complément de la télédétection pour ce type spécifique de culture.

**Investigation clôturée à ce stade** ; pourrait être reprise ultérieurement avec des données de référence locales adaptées (cf. section 8).

## 8. Bug corrigé — indexation des croisements par groupe

Les premiers croisements cluster × classe (WorldCover, WorldCereal saison principale) utilisaient `groupField: 1` dans `ee.Reducer.frequencyHistogram().group()`, groupant par erreur sur la mauvaise bande. Corrigé en `groupField: 0` avec transtypage explicite (`.toInt()`) des deux bandes en entrée, afin de garantir un groupement par cluster (et non par la bande de valeur croisée) sur les trois croisements du script.

## 9. Prochaines étapes identifiées

- [ ] Extension du pipeline aux 3 autres zones RGAE (Buea, Fongo-Tongo, Bamenda I), avec paramètres recalibrés par zone

## 10. Carte finale — pré-cartographie interprétée de Mora

Production de la carte finale : symbologie par classe interprétée (croisement WorldCover/WorldCereal, cf. section 8bis ci-dessous pour les chiffres corrigés), mise en page QGIS (légende, échelle, cartouche source/auteur/date), export haute résolution. Voir [`results/carte_finale_mora.png`](../results/carte_finale_mora.png) et le tableau de légende dans le README principal.

**Correction supplémentaire rencontrée lors de l'export du raster final** : le GeoTIFF exporté depuis GEE couvrait le rectangle englobant de l'AOI, pas le contour exact du polygone — les pixels hors zone héritaient de la valeur 0 via `.unmask(0)`, entrant en conflit avec le cluster 0 (valide) lors de l'affichage. Corrigé par un export explicite `.clip(aoi).unmask(255).toByte()` avec `formatOptions: {noData: 255}`, permettant à QGIS de reconnaître automatiquement la transparence hors zone d'étude.

## 8bis. Croisement WorldCover/WorldCereal — chiffres corrigés (2e bug d'indexation)

Le premier correctif du bug d'indexation (section 8) était lui-même incorrect : `frequencyHistogram().group()` exige que la bande de groupe soit **après** la bande de valeur (erreur GEE : *"Group input must come after weighted inputs"*). Ordre final correct : bande de valeur (WorldCover/WorldCereal) en premier, bande `cluster` ajoutée en second, `groupField: 1`.

**Résultat (pourcentage de la surface de chaque cluster par classe WorldCover, et % actif WorldCereal saison principale) :**

| Cluster | Cultures | Prairie | Arbustes | Arbres | % actif WorldCereal |
|---|---|---|---|---|---|
| 0 | 45.3% | 53.0% | 1.4% | 0.0% | 97.8% |
| 1 | 18.6% | 60.7% | 19.8% | 0.3% | 84.0% |
| 2 | 64.1% | 34.4% | 1.3% | 0.0% | 88.5% |
| 3 | 20.5% | 71.1% | 6.1% | 0.1% | 85.7% |
| 4 | 12.8% | 61.7% | 18.2% | 4.7% | 94.4% |
| 5 | 28.2% | 70.3% | 0.1% | 0.0% | 85.6% |
| 6 | 6.5% | 24.3% | 48.6% | 17.0% | 72.7% (le plus bas) |

Le cluster 6 confirme statistiquement l'hypothèse de végétation naturelle/ligneuse posée dès son identification visuelle : composition la plus arbustive/arborée et activité culturale la plus faible de tous les clusters.
