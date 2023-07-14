///////////////////////////////////////
//--------SENTINEL2 LEVEL2A----------//
///////////////////////////////////////

//----------Study Area------------/
// Load the shapefile
var Myselectionupperathi = ee.FeatureCollection("projects/ee-kimutailawrence19/assets/Myselectionupperathi");

// Filter the shapefile based on the "BASIN_1" column
var filteredShapefile = Myselectionupperathi.filter(
  ee.Filter.inList("BASIN_1", ["4BF", "4BG", "4CC", "4DE"])
);

// Get the geometry of the filtered shapefile
var Myselectionupperathi = filteredShapefile.geometry();

// Center the map on the filtered geometry
Map.centerObject(Myselectionupperathi, 11);

// Add the filtered shapefile to the map
Map.addLayer(Myselectionupperathi, {}, "Filtered Myselectionupperathi shapefile");

//-------------Raw sentinel_2A---------/
var Raw_sentinel_2A = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterBounds(Myselectionupperathi)
  .first()
  .clip(Myselectionupperathi);

var visparg = { min: 0, max: 2500 }; //visualization parameter
print(Raw_sentinel_2A, "Raw_sentinel_2A");
Map.addLayer(Raw_sentinel_2A.select("B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B11", "B12", "AOT"), visparg, 'Raw_sentinel_2A', false);

//-------Filtering data-------/
var sentinel_2A = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterBounds(Myselectionupperathi)
  .filterDate('2022-01-01', '2022-12-31')
  .filterMetadata("CLOUDY_PIXEL_PERCENTAGE", "less_than", 15)
  .sort('CLOUDY_PIXEL_PERCENTAGE')
  .median()
  .clip(Myselectionupperathi);

print(sentinel_2A, "FILTERED IMAGE");
var visualization = { gain: '0.1, 0.1, 0.1', scale: 7 };
Map.addLayer(sentinel_2A.select("B4", "B3", "B2"), visualization, 'True_colour_sentinel_2A');

// Calculate NDVI (Normalized Difference Vegetation Index)
var nirBand = sentinel_2A.select('B8');
var redBand = sentinel_2A.select('B4');
var ndvi = nirBand.subtract(redBand).divide(nirBand.add(redBand))
  .rename('NDVI');
  
// Calculate NDTI (Normalized Difference Turbidity Index)
var greenBand = sentinel_2A.select('B3');
var swir1Band = sentinel_2A.select('B11');
var ndti = swir1Band.subtract(greenBand).divide(swir1Band.add(greenBand))
  .rename('NDTI');

// Calculate SAVI (Soil Adjusted Vegetation Index)
var L = 0.5; // Soil brightness factor
var savi = nirBand.subtract(redBand).multiply(1 + L)
  .divide(nirBand.add(redBand).add(L))
  .multiply(1.5)
  .rename('SAVI');

// Calculate GCI (Green Chlorophyll Index)
var greenBand2 = sentinel_2A.select('B3');
var redEdgeBand = sentinel_2A.select('B5');
var gci = redEdgeBand.subtract(greenBand2).divide(redEdgeBand.add(greenBand2))
  .rename('GCI');

// Calculate EVI (Enhanced Vegetation Index)
var blueBand = sentinel_2A.select('B2');
var evi = nirBand.subtract(redBand).multiply(2.5)
  .divide(nirBand.add(redBand.multiply(6.0)).subtract(blueBand.multiply(7.5)).add(1.0))
  .rename('EVI');

// Calculate GNDVI (Green Normalized Difference Vegetation Index)
var gndvi = nirBand.subtract(greenBand).divide(nirBand.add(greenBand))
  .rename('GNDVI');

// Calculate NDBI (Normalized Difference Built-Up Index)
var swir2Band = sentinel_2A.select('B12');
var ndbi = swir2Band.subtract(nirBand).divide(swir2Band.add(nirBand))
  .rename('NDBI');
  
// Calculate MSAVI (Modified Soil-Adjusted Vegetation Index)
var nirBand = sentinel_2A.select("B8");
var redBand = sentinel_2A.select("B4");

var MSAVI = nirBand.subtract(redBand)
  .multiply(2)
  .add(1)
  .subtract(nirBand.subtract(redBand)
  .multiply(2)
  .add(1)
  .pow(2)
  .subtract(nirBand.subtract(redBand)
  .subtract(redBand)));

// Visualize the indices
var ndviVisParams = { min: -1, max: 1, palette: ['blue', 'white', 'green'] };
Map.addLayer(ndvi, ndviVisParams, 'NDVI');

var ndtiVisParams = { min: -1, max: 1, palette: ['grey', 'white', 'blue'] };
Map.addLayer(ndti, ndtiVisParams, 'NDTI');

var gciVisParams = { min: -1, max: 1, palette: ['red', 'yellow', 'green'] };
Map.addLayer(gci, gciVisParams, 'GCI');

var eviVisParams = { min: -1, max: 1, palette: ['purple', 'white', 'green'] };
Map.addLayer(evi, eviVisParams, 'EVI');

var gndviVisParams = { min: -1, max: 1, palette: ['black', 'white', 'green'] };
Map.addLayer(gndvi, gndviVisParams, 'GNDVI');

var ndbiVisParams = { min: -1, max: 1, palette: ['black', 'white', 'blue'] };
Map.addLayer(ndbi, ndbiVisParams, 'NDBI');

var msaviVisParams = { min: -1, max: 1, palette: ['blue', 'white', 'green'] };
Map.addLayer(MSAVI, msaviVisParams, 'MSAVI');

var saviVisParams = { min: -1, max: 1, palette: ['brown', 'yellow', 'green'] };
Map.addLayer(savi, saviVisParams, 'SAVI');