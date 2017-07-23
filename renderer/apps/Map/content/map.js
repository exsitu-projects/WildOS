
var mainView, mainMap, mapApp, tileCenter;

function tileCoords(coords) {
	var res = mainView.getResolution();
	return [coords[0] + (tileCenter.x - mapApp.mapCenter.x)*res, 
			coords[1] - (tileCenter.y - mapApp.mapCenter.y)*res];
}

// Load the map in the browser
function loadMap(element, app, tile) {
	// console.log(element, app, tile);

	mapApp = app;

    mainView = new ol.View({
        center: ol.proj.transform(app.center, 'EPSG:4326', 'EPSG:3857'),
        resolution: app.resolution,
      });

    tileCenter = {x: tile.originX + tile.width/2, y: tile.originY + tile.height/2};
   	mainView.setCenter(tileCoords(mapApp.center));

    mainMap = new ol.Map({
      target: element,
      interactions: [],
      controls: [],
      logo: false,
      layers: [
        new ol.layer.Tile({
          source: new ol.source[app.source](app.options),
          preload: 10, // wild guess... what would be an appropriate level?
        })
      ],
      view: mainView,
    });
}

function panned(center) {
	if (!mainView)
		return;
	mainView.setCenter(tileCoords(center));
}

function zoomed(resolution) {
	if (!mainView)
		return;
	mainView.setResolution(resolution);
}

function rotated(rotation) {
  if (!mainView)
    return;
  mainView.rotate(rotation, mapApp.center);
}
