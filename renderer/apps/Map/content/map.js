
var mainView, mainMap, mapApp, tileOrigin;

// Load the map in the browser
function loadMap(element, app, tile) {
	console.log(element, app, tile);

	mapApp = app;

    mainView = new ol.View({
        center: ol.proj.transform(app.center, 'EPSG:4326', 'EPSG:3857'),
        zoom: app.zoom
      });

    tileOrigin = [tile.originX, tile.originY];
    var res = mainView.getResolution();
	var center = [app.center[0] + tile.originX*res, app.center[1] - tile.originY*res];
   	mainView.setCenter(center);

    mainMap = new ol.Map({
      target: element,
      interactions: [],
      controls: [],
      logo: false,
      layers: [
        new ol.layer.Tile({
          source: new ol.source[app.source](app.options),
        })
      ],
      view: mainView,
    });
}

function panned(center) {
	if (!mainView)
		return;
	var res = mainView.getResolution();
	center = [center[0] + tileOrigin[0]*res, center[1] - tileOrigin[1]*res];
	mainView.setCenter(center);
}

function zoomed(zoom) {
	if (!mainView)
		return;
	mainView.setZoom(zoom);
	var res = mainView.getResolution();
	center = [mapApp.center[0] + tileOrigin[0]*res, mapApp.center[1] - tileOrigin[1]*res];
	mainView.setCenter(center);
}
