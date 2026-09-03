# Résumé méthodologique — RGAE / EOSTAT

*Adapté de la méthodologie officielle « Cartographie et estimation des surfaces agricoles par télédétection — Méthodologie pour des zones difficile d'accès dans le cadre du RGAE », Coordination nationale du RGAE, version révisée août 2026.*

## Contexte

Quatre arrondissements du Cameroun présentent des contraintes sécuritaires et logistiques limitant le déploiement classique d'équipes de recensement agricole :

- **Mora** (Extrême-Nord)
- **Bamenda I** (Nord-Ouest)
- **Buea** (Sud-Ouest)
- **Fongo-Tongo** (Ouest)

La méthodologie proposée s'inspire du projet **EOSTAT** (Earth Observation for Agricultural Statistics) de la FAO, qui promeut l'usage de l'observation de la Terre pour compléter les statistiques agricoles nationales lorsque les données de terrain sont insuffisantes.

## Principe

Chaque culture présente une **signature spectrale et un cycle de croissance caractéristiques**, observables via l'analyse temporelle d'indices de végétation dérivés de l'imagerie satellite. La combinaison de sources optiques (Sentinel-2) et radar (Sentinel-1) permet de :

- pallier les lacunes de nébulosité de l'optique en saison des pluies,
- enrichir la caractérisation structurale et hydrique des surfaces via le radar,
- suivre la dynamique phénologique complète du cycle cultural.

## Workflow en 11 étapes

1. Définition de la zone d'étude
2. Collecte des images satellitaires (Sentinel-1/Sentinel-2, via Google Earth Engine)
3. Prétraitement (masquage nuages, filtrage radar)
4. Extraction des caractéristiques (NDVI, NDRE, NDMI, VV, VH, VH/VV)
5. Fusion temporelle S1/S2 (composites par fenêtres de 10-15 jours)
6. Caractérisation phénologique et statistique des signatures
7. Classification des types de culture (Random Forest en scénario "données suffisantes", méthodes exploratoires sinon)
8. Production des cartes et évaluation de la précision
9. Estimation des superficies agricoles (comptage de pixels, ajustement par matrice de confusion)
10. Validation des résultats (matrice de confusion, exactitude globale, F1-score)
11. Production des résultats finaux (cartes, statistiques, rapports)

## Stratégie adaptative selon les données disponibles

| Scénario | Disponibilité terrain | Approche |
|---|---|---|
| 1 | Suffisante et représentative | Classification supervisée (Random Forest) |
| 2 | Limitée | Approche mixte : signatures temporelles + modèles supervisés si possible |
| 3 | Absente | Méthodes exploratoires non supervisées (clustering) — pré-cartographie |

**Ce dépôt documente une mise en œuvre à cheval entre les scénarios 2 et 3** pour Mora : classification non supervisée initiale (scénario 3), affinée par un croisement avec des données de terrain FAO découvertes en cours de projet (rapprochement du scénario 2).

## Limites reconnues par la méthodologie de référence

- Dépendance à la disponibilité et à la représentativité des données de terrain
- Résolution spatiale (10 m) limitant l'identification des petites parcelles
- Confusions possibles entre cultures aux signatures spectrales/phénologiques proches
- Variabilité spatiale et temporelle limitant la transférabilité d'un modèle d'une zone/campagne à une autre
