/**
 * ============================================================
 * RGAE Cameroun — Pré-cartographie exploratoire des surfaces agricoles
 * Zone pilote : Mora (Extrême-Nord)
 * ============================================================
 *
 * Contexte : recensement général de l'agriculture et de l'élevage (RGAE),
 * zones difficiles d'accès. Méthodologie inspirée du projet EOSTAT (FAO),
 * combinant séries temporelles Sentinel-1 (radar) et Sentinel-2 (optique)
 * pour une classification non supervisée (scénario 3 / 2 selon disponibilité
 * des données terrain).
 *
 * Auteur : Rose Moskolai
 * Plateforme : Google Earth Engine (JavaScript API)
 * ============================================================
 */

// ============================================================
// 1. ZONE D'ÉTUDE
// ============================================================
var aoi = ee.FeatureCollection('projects/TON_PROJET/assets/mora_aoi');
Map.setCenter(14.14, 11.05, 10);
Map.addLayer(aoi, {color: 'red'}, 'AOI Mora');

// ============================================================
// 2. PÉRIODE D'ANALYSE
// ============================================================
// Cycle complet incluant campagne pluviale (avril-nov.) et campagne
// de contre-saison / muskuwaari (déc.-mars), spécifique à l'Extrême-Nord.
var dateDebut = '2025-04-01';
var dateFin   = '2026-05-31';

// ============================================================
// 3. COLLECTE SENTINEL-2 ET SENTINEL-1
// ============================================================
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(dateDebut, dateFin)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(aoi)
  .filterDate(dateDebut, dateFin)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

print('Nombre d\'images S2 disponibles :', s2.size());
print('Nombre d\'images S1 disponibles :', s1.size());

// ============================================================
// 4. PRÉTRAITEMENT ET EXTRACTION DES CARACTÉRISTIQUES
// ============================================================

function maskS2clouds(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(mask);
}

function addIndicesS2(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var ndre = image.normalizedDifference(['B8A', 'B5']).rename('NDRE');
  var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
  return image.addBands([ndvi, ndre, ndmi]);
}

var s2_indices = s2.map(function(img) { return img.clip(aoi); })
  .map(maskS2clouds)
  .map(addIndicesS2);

function addRadarRatio(image) {
  var ratio = image.select('VH').divide(image.select('VV')).rename('VH_VV');
  return image.addBands(ratio);
}

var s1_features = s1.map(function(img) { return img.clip(aoi); })
  .map(addRadarRatio)
  .select(['VV', 'VH', 'VH_VV']);

// ============================================================
// 5. FENÊTRES TEMPORELLES (15 jours)
// ============================================================
var joursParFenetre = 15;
// floor() élimine la dernière fenêtre tronquée (artefact de bord)
var nbFenetres = ee.Date(dateFin).difference(ee.Date(dateDebut), 'day')
  .divide(joursParFenetre).floor();

var listeFenetres = ee.List.sequence(0, nbFenetres.subtract(1)).map(function(i) {
  var debut = ee.Date(dateDebut).advance(ee.Number(i).multiply(joursParFenetre), 'day');
  var fin = debut.advance(joursParFenetre, 'day');
  return ee.Feature(null, {'debut': debut, 'fin': fin, 'index': i});
});

var bandesOptiques = ['NDVI', 'NDRE', 'NDMI'];
var bandesRadar = ['VV', 'VH', 'VH_VV'];

// ============================================================
// 6. COMPOSITE SÉCURISÉ
// ============================================================
// Gère les fenêtres sans image (creux S2 en pleine saison des pluies) en
// injectant une image "fantôme" masquée de la bonne structure de bandes,
// pour éviter les erreurs de type/structure lors de l'empilement.
function compositeSecurise(coll, bandNames) {
  var valeurs = bandNames.map(function(b) { return 0; });
  var fantome = ee.Image.constant(valeurs)
    .rename(bandNames)
    .toFloat()
    .updateMask(ee.Image.constant(0).toFloat());

  var collTypee = coll.select(bandNames).map(function(img) {
    return img.toFloat();
  });

  var collSecurisee = ee.ImageCollection([fantome]).merge(collTypee);
  return collSecurisee.median();
}

// ============================================================
// 7. FUSION S1/S2 PAR FENÊTRE
// ============================================================
function fusionFenetre(f) {
  f = ee.Feature(f);
  var debut = ee.Date(f.get('debut'));
  var fin = ee.Date(f.get('fin'));
  var idx = f.get('index');

  var collS2 = s2_indices.filterDate(debut, fin);
  var collS1 = s1_features.filterDate(debut, fin);

  var compositeS2 = compositeSecurise(collS2, bandesOptiques).unmask(0);
  var compositeS1 = compositeSecurise(collS1, bandesRadar).unmask(0);

  return compositeS2.addBands(compositeS1).set({
    'system:time_start': debut.millis(),
    'index': idx,
    'nb_S2': collS2.size(),
    'nb_S1': collS1.size()
  });
}

var composites_fusionnes = ee.ImageCollection(listeFenetres.map(fusionFenetre));
print('Nombre de fenêtres fusionnées :', composites_fusionnes.size());

// ============================================================
// 8. EMPILEMENT EN IMAGE MULTIBANDE UNIQUE
// ============================================================
var listeImages = composites_fusionnes.toList(composites_fusionnes.size());
var nbImg = composites_fusionnes.size().getInfo();
var toutesBandes = bandesOptiques.concat(bandesRadar);

var imageEmpilee = ee.Image(listeImages.get(0)).rename(
  toutesBandes.map(function(b) { return b + '_0'; })
);
for (var i = 1; i < nbImg; i++) {
  var img = ee.Image(listeImages.get(i)).rename(
    toutesBandes.map(function(b) { return b + '_' + i; })
  );
  imageEmpilee = imageEmpilee.addBands(img);
}
print('Image multibande finale — nombre de bandes :', imageEmpilee.bandNames().size());

// ============================================================
// 9. CLUSTERING NON SUPERVISÉ (K-MEANS) — scénario 3/2 EOSTAT
// ============================================================
var echantillon = imageEmpilee.sample({
  region: aoi, scale: 10, numPixels: 5000, seed: 42, geometries: false
});

var nbClusters = 7;
var clusterer = ee.Clusterer.wekaKMeans(nbClusters).train(echantillon);
var resultatClustering = imageEmpilee.cluster(clusterer);

var palette = ['3366cc','dc3912','ff9900','109618','990099','0099c6','dd4477'];
Map.addLayer(resultatClustering, {min: 0, max: nbClusters - 1, palette: palette},
  'Clusters K-means (k=' + nbClusters + ')');

// ============================================================
// 10. CARACTÉRISATION TEMPORELLE PAR CLUSTER
// ============================================================
// Fenêtres 7, 8 et 9 exclues du calcul de profil : nébulosité résiduelle
// non filtrée par le masque SCL, diagnostiquée par inspection visuelle
// (cf. results/figures/ et docs/FINDINGS.md pour le détail).
var fenetresValides = [];
for (var w = 0; w < nbImg; w++) {
  if (w !== 7 && w !== 8 && w !== 9) fenetresValides.push('NDVI_' + w);
}

var listeImagesChart = fenetresValides.map(function(b) {
  var windowIndex = parseInt(b.split('_')[1], 10);
  return imageEmpilee.select([b]).rename(['NDVI']).set('window_index', windowIndex);
});

var chartClusters = ui.Chart.image.byClass({
  image: imageEmpilee.select(fenetresValides).addBands(resultatClustering.rename('cluster')),
  classBand: 'cluster',
  region: aoi,
  reducer: ee.Reducer.mean(),
  scale: 100,
  classLabels: ['0','1','2','3','4','5','6']
});
print(chartClusters);

// ============================================================
// 11. CROISEMENT AVEC DONNÉES PUBLIQUES (ESA WorldCover + WorldCereal)
// ============================================================
// Remplace un croisement initialement fait avec des données de terrain FAO/RGAE
// (retirées pour rendre ce pipeline entièrement reproductible avec des sources
// publiques, sans dépendance à des données de recensement gouvernemental).

// --- ESA WorldCover 10m : occupation du sol générale (CC-BY-4.0) ---
// Légende : 10=Arbres, 20=Arbustes, 30=Prairie, 40=Cultures, 50=Bâti,
// 60=Sol nu, 80=Eau, 90=Zones humides
var worldCover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(aoi);
Map.addLayer(worldCover, {}, 'ESA WorldCover 2021', false);

// clusterInt réutilisé pour tous les croisements de cette section.
// IMPORTANT : GEE exige que la bande de GROUPE soit ajoutée APRÈS la bande de
// VALEUR analysée pour un reducer groupé (sinon erreur "Group input must come
// after weighted inputs"). D'où l'ordre : valeur.addBands(cluster), groupField:1.
var clusterInt = resultatClustering.toInt().rename('cluster');

var histWorldCover = worldCover.select('Map').toInt().rename('landcover')
  .addBands(clusterInt)
  .reduceRegion({
    reducer: ee.Reducer.frequencyHistogram().group({groupField: 1, groupName: 'cluster'}),
    geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true
  });
print('Répartition des classes WorldCover par cluster :', histWorldCover);

// --- ESA WorldCereal : cultures actives par saison (CC-BY-4.0) ---
var worldCereal = ee.ImageCollection('ESA/WorldCereal/2021/MARKERS/v100')
  .filterBounds(aoi);
print('Saisons WorldCereal disponibles pour Mora :',
  worldCereal.aggregate_array('season').distinct());

var activeSummer = worldCereal.filter(ee.Filter.eq('season', 'tc-maize-main'))
  .mosaic().clip(aoi);
Map.addLayer(activeSummer, {bands: ['classification'], min: 0, max: 100,
  palette: ['eb0000', '37e622']}, 'WorldCereal - Culture active (saison principale)', false);

var histWorldCereal = activeSummer.select('classification').toInt().rename('active_crop')
  .addBands(clusterInt)
  .reduceRegion({
    reducer: ee.Reducer.frequencyHistogram().group({groupField: 1, groupName: 'cluster'}),
    geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true
  });
print('Activité culturale (WorldCereal, saison principale) par cluster :', histWorldCereal);

// Export des deux histogrammes croisés pour analyse hors GEE
Export.table.toDrive({
  collection: ee.FeatureCollection([ee.Feature(null, histWorldCover)]),
  description: 'Mora_clusters_x_WorldCover',
  folder: 'RGAE_Mora', fileFormat: 'CSV'
});
Export.table.toDrive({
  collection: ee.FeatureCollection([ee.Feature(null, histWorldCereal)]),
  description: 'Mora_clusters_x_WorldCereal',
  folder: 'RGAE_Mora', fileFormat: 'CSV'
});

// Profil NDVI restreint aux surfaces cultivées WorldCover (classe 40)
// -- reproduit le test du signal de contre-saison, cette fois sur source publique
var masqueCultures = worldCover.eq(40);
var ndviZoneCultures = imageEmpilee.select(fenetresValides).updateMask(masqueCultures);

var listeImagesCultures = fenetresValides.map(function(b) {
  var windowIndex = parseInt(b.split('_')[1], 10);
  return ndviZoneCultures.select([b]).rename(['NDVI']).set('window_index', windowIndex);
});

var chartCultures = ui.Chart.image.series({
  imageCollection: ee.ImageCollection(listeImagesCultures),
  region: aoi, reducer: ee.Reducer.mean(), scale: 30,
  xProperty: 'window_index'
});
print(chartCultures);

// ============================================================
// 12. EXPORTS FINAUX
// ============================================================
// .clip(aoi) masque proprement tout ce qui est hors du polygone exact ;
// .unmask(255) donne une valeur NoData distincte des 7 classes valides (0-6),
// évitant la confusion avec le cluster 0 lors de l'affichage QGIS.
var resultatClusteringFinal = resultatClustering.clip(aoi).unmask(255).toByte();

Export.image.toDrive({
  image: resultatClusteringFinal,
  description: 'Mora_clusters_raster_v2',
  folder: 'RGAE_Mora',
  region: aoi, scale: 10, maxPixels: 1e9,
  formatOptions: {noData: 255}
});

// ============================================================
// 13. INVESTIGATION COMPLÉMENTAIRE — recherche du signal de contre-saison
// (muskuwaari) via les couches saisonnières WorldCereal
// ============================================================
// Conclusion de cette investigation (voir docs/FINDINGS.md, section 7) :
// aucune des sources testées (profil NDVI global, profil restreint aux
// cultures WorldCover, WorldCereal tc-wintercereals, WorldCereal
// tc-maize-second) ne permet de confirmer un second cycle cultural distinct
// pour Mora. Conservé ici à titre de documentation méthodologique.

var activeWinter = worldCereal.filter(ee.Filter.eq('season', 'tc-wintercereals'))
  .mosaic().clip(aoi);
Map.addLayer(activeWinter, {bands: ['classification'], min: 0, max: 100,
  palette: ['eb0000', '37e622']}, 'WorldCereal - Contre-saison (wintercereals)', false);

var activeMaizeSecond = worldCereal.filter(ee.Filter.eq('season', 'tc-maize-second'))
  .mosaic().clip(aoi);
Map.addLayer(activeMaizeSecond, {bands: ['classification'], min: 0, max: 100,
  palette: ['eb0000', '37e622']}, 'WorldCereal - Maïs 2e saison', false);

// Diagnostic de couverture réelle des données (nombre de pixels valides)
print('Pixels valides tc-wintercereals :', activeWinter.select('classification')
  .reduceRegion({reducer: ee.Reducer.count(), geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true}));
print('Pixels valides tc-maize-second :', activeMaizeSecond.select('classification')
  .reduceRegion({reducer: ee.Reducer.count(), geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true}));
print('Pixels valides tc-maize-main (référence) :', activeSummer.select('classification')
  .reduceRegion({reducer: ee.Reducer.count(), geometry: aoi, scale: 10, maxPixels: 1e9, bestEffort: true}));
// Résultat obtenu lors du développement : tc-wintercereals quasi intégralement
// inactif (0) sur la zone ; tc-maize-second à 0 pixel valide (produit non
// généré/masqué pour ce secteur de l'AEZ) ; tc-maize-main : ~9.6M pixels valides.
