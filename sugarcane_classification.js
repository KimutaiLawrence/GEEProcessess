// Load Drone TIFF file
var tiffImage = ee.Image("projects/analytical-rig-437519-k7/assets/ImageSample");

print('TIFF Image:', tiffImage);

var region = tiffImage.geometry().bounds();

var minMax = tiffImage.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: region,
  scale: 30,  
  maxPixels: 1e9,
  bestEffort: true // avoid errors due to large images
});

var min = minMax.get('b1_min') ? ee.Number(minMax.get('b1_min')).getInfo() : 0;
var max = minMax.get('b1_max') ? ee.Number(minMax.get('b1_max')).getInfo() : 255; 

// Viz params
var tiffVis = {
  min: min,
  max: max, 
  bands: ['b1', 'b2', 'b3'] 
}

Map.centerObject(tiffImage, 15); 
Map.addLayer(tiffImage, tiffVis, "Sample Tiff Image");


// Load sugarcane field polygons - was shared to me as a shapefile so i uploaded it here and then re picked the sugar fields alongside other classes
var sugarFields = ee.FeatureCollection("projects/analytical-rig-437519-k7/assets/Sugar_Farms");

// var sugarcaneClass = sugarFields.map(function(feature) {
//   return feature.set('class', 1);
// });

var sugarcaneVis = {
  color: 'FF0000',  
  opacity: 0.5    
};

// Add sugarcane fields to the map
Map.centerObject(sugarFields, 16);  
Map.addLayer(sugarFields, sugarcaneVis, "Sugarcane Fields");

// Calculate NDVI to help differentiate vegetation types
var ndvi = tiffImage.normalizedDifference(['b4', 'b3']).rename('NDVI');

// Add NDVI to the original image
var imageWithNDVI = tiffImage.addBands(ndvi);

var ndviVisParams = {
  min: 0,   // 
  max: 1,   //-1 to 1
  palette: ['blue', 'white', 'green']
};

Map.addLayer(ndvi, ndviVisParams, 'NDVI');

var training_points = sugarcane.merge(forest).merge(builtup).merge(bareland);
print(training_points, 'training_points');

var Bands_selection = ["b1", "b2", "b3"];

var training = tiffImage.select(Bands_selection).sampleRegions({
  collection: training_points,
  properties: ['landcover'],
  scale: 30
});
print(training, "training");

var bounded = training_points.geometry().bounds();

var filtered = training_points.filter(ee.Filter.bounds(bounded));

Export.table.toAsset({
  collection: filtered,
  description: 'SugarCaneAITrainingPointsAsset',
  assetId: 'SugarCaneTrainingPointsAsset'
});

Export.table.toDrive({
  collection: filtered,
  description: 'SugarCaneAITrainingPointsCSV',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: filtered,
  description: 'SugarCaneAITrainingPointsShapefile',
  fileFormat: 'SHP'
});

// SPLITS: Training (75%) & Testing samples (25%)
var Total_samples = training.randomColumn('random');
var training_samples = Total_samples.filter(ee.Filter.lessThan('random', 0.75));
print(training_samples, "Training Samples");
var validation_samples = Total_samples.filter(ee.Filter.greaterThanOrEquals('random', 0.75));
print(validation_samples, "Validation Samples");

// ---------------RANDOM FOREST CLASSIFIER-------------------/
var rfClassifier = ee.Classifier.smileRandomForest(10).train({
  features: training_samples,
  classProperty: 'landcover',
  inputProperties: Bands_selection
});

var classifiedRF = tiffImage.select(Bands_selection).classify(rfClassifier);

var palette = [
  'red',        // Sugarcane (0)
  'darkgreen',  // Forest (1)
  'yellow',     // Builtup (2)
  'tan'       // Bareland (3)
];

Map.addLayer(classifiedRF, {min: 0, max: 3, palette: palette}, "RF Classification");

// Validation of Random Forest
var rfValidationClassifier = ee.Classifier.smileRandomForest(10).train({
  features: validation_samples,
  classProperty: 'landcover',
  inputProperties: Bands_selection
});

// Random Forest Confusion Matrix Calculation
var rfConfusionMatrix = validation_samples.classify(rfValidationClassifier)
  .errorMatrix({
    actual: 'landcover',
    predicted: 'classification'
  });
print(rfConfusionMatrix, "RF Confusion Matrix");
print('RF Overall Accuracy:', rfConfusionMatrix.accuracy());

// ---------------SVM CLASSIFIER-------------------/
var svmClassifier = ee.Classifier.libsvm().train({
  features: training_samples,
  classProperty: 'landcover',
  inputProperties: Bands_selection
});

var classifiedSVM = tiffImage.select(Bands_selection).classify(svmClassifier);
Map.addLayer(classifiedSVM, {min: 0, max: 3, palette: palette}, "SVM Classification");

// Validation of SVM
var svmValidationClassifier = ee.Classifier.libsvm().train({
  features: validation_samples,
  classProperty: 'landcover',
  inputProperties: Bands_selection
});

// SVM Confusion Matrix Calculation
var svmConfusionMatrix = validation_samples.classify(svmValidationClassifier)
  .errorMatrix({
    actual: 'landcover',
    predicted: 'classification'
  });
print(svmConfusionMatrix, "SVM Confusion Matrix");
print('SVM Overall Accuracy:', svmConfusionMatrix.accuracy());

// Convert the SVM classified image to vector polygons
var svmClassifiedVectors = classifiedSVM.reduceToVectors({
  geometry: region,   // Use the image region or specify a custom region of interest
  scale: 30,
  geometryType: 'polygon',
  eightConnected: true,  // Connects diagonally adjacent pixels of the same class
  labelProperty: 'class', // Set property name for the classes
  maxPixels: 1e8
});

Export.table.toDrive({
  collection: svmClassifiedVectors,
  description: 'SVM_Classified_Shapefile',
  fileFormat: 'SHP'
});


// Filter to only include sugarcane class (class 0)
var sugarcaneVectors = svmClassifiedVectors.filter(ee.Filter.eq('class', 0));

// Export only the sugarcane polygons as a shapefile
Export.table.toDrive({
  collection: sugarcaneVectors,
  description: 'Sugarcane_Classified_Shapefile',
  fileFormat: 'SHP'
});

var aoi = ee.FeatureCollection("projects/analytical-rig-437519-k7/assets/WESTKENYAAOI");

//-------------Estimation of Area------------------/
var names = ['sugarcane','forest','builtup','bareland']
var count = classifiedSVM.eq([0,1,2,3])
var total = count.multiply(ee.Image.pixelArea()).divide(1e6).rename(names);
var area = total.reduceRegion({
reducer:ee.Reducer.sum(),
  geometry:aoi,
  scale:1,
maxPixels: 1e12,
bestEffort:true
});
print ('Area in (km²):', area)


var areaFeatures = ee.FeatureCollection(names.map(function(name) {
  return ee.Feature(null, { class: name, area: ee.Number(area.get(name)) });
}));

// Plot areas as bar chart
var areaChart = ui.Chart.feature.byFeature(areaFeatures, 'class', 'area')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Area of Each Class in km²',
    hAxis: { title: 'Class' },
    vAxis: { title: 'Area (km²)' },
    colors: ['#1f77b4']
  });

print(areaChart);


// // HYPER-PARAMETER TUNING
// // Adjusted Random Forest Classifier with Hyperparameters
// var tunedRFClassifier = ee.Classifier.smileRandomForest({
//   numberOfTrees: 50,
//   variablesPerSplit: 2,
//   minLeafPopulation: 1
// }).train({
//   features: training_samples,
//   classProperty: 'landcover',
//   inputProperties: Bands_selection
// });

// var classifiedTunedRF = tiffImage.select(Bands_selection).classify(tunedRFClassifier);
// Map.addLayer(classifiedTunedRF, {min: 0, max: 3, palette: palette}, "Tuned RF Classification");

// // Tuned SVM Classifier with Hyperparameters
// var tunedSVMClassifier = ee.Classifier.libsvm({
//   kernelType: 'RBF',
//   gamma: 0.01,
//   cost: 10
// }).train({
//   features: training_samples,
//   classProperty: 'landcover',
//   inputProperties: Bands_selection
// });

// var classifiedTunedSVM = tiffImage.select(Bands_selection).classify(tunedSVMClassifier);
// Map.addLayer(classifiedTunedSVM, {min: 0, max: 3, palette: palette}, "Tuned SVM Classification");

// Add a title to the map
var title = ui.Label('West Kenya Sugar - Land Cover Classification and Area Estimation');
title.style().set({
  fontSize: '22px',
  color: 'darkblue',
  fontWeight: 'bold',
  margin: '10px 0px 0px 60px'
});
Map.add(title);

// Create a legend
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

// Title for legend
var legendTitle = ui.Label({
  value: 'Land Cover Classes',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 8px 0',
    padding: '0'
  }
});
legend.add(legendTitle);

// Function to create a color entry for the legend
function makeColorBox(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label({
    value: name,
    style: { margin: '0 0 4px 6px' }
  });
  return ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal'));
}

// Add color and label for each class
legend.add(makeColorBox('red', 'Sugarcane (Class 0)'));
legend.add(makeColorBox('darkgreen', 'Forest (Class 1)'));
legend.add(makeColorBox('yellow', 'Builtup (Class 2)'));
legend.add(makeColorBox('tan', 'Bareland (Class 3)'));

// Add the legend to the map
Map.add(legend);

// // Display classified image and sugarcane fields
// Map.centerObject(tiffImage, 15);
// Map.addLayer(tiffImage, tiffVis, "Sample Tiff Image");
// Map.addLayer(classifiedSVM, {min: 0, max: 3, palette: palette}, "SVM Classification");
// Map.addLayer(sugarFields, sugarcaneVis, "Sugarcane Fields");

// // Display area chart
// print(areaChart);


// Project and bucket information
var OUTPUT_BUCKET = 'analytical-rig-437519-k7';
var TRAIN_FILE_PREFIX = 'Training_demo';
var TEST_FILE_PREFIX = 'Testing_demo';
var file_extension = '.tfrecord.gz';
var TRAIN_FILE_PATH = 'gs://' + OUTPUT_BUCKET + '/' + TRAIN_FILE_PREFIX + file_extension;
var TEST_FILE_PATH = 'gs://' + OUTPUT_BUCKET + '/' + TEST_FILE_PREFIX + file_extension;

// Export labeled training data to Google Cloud Storage as TFRecord
Export.table.toCloudStorage({
  collection: training_samples, 
  description: 'SugarCaneAITrainingData',
  bucket: OUTPUT_BUCKET,
  fileNamePrefix: TRAIN_FILE_PREFIX,
  fileFormat: 'TFRecord'
});

Export.table.toCloudStorage({
  collection: validation_samples,
  description: 'SugarCaneAIValidationData',
  bucket: OUTPUT_BUCKET,
  fileNamePrefix: TEST_FILE_PREFIX,
  fileFormat: 'TFRecord'
});
