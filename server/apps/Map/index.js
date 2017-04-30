// Map app - display a multiscal map with OpenLayers
//
//

// Node modules
var events = require('events');

// Shared modules
var log = require('Log').logger('Map');

// Server modules
var App = require('../../lib/App');


// The `Map` class.
var Map = App.subclass().name('Map')
	.fields({
		source: "OSM", //"MapQuest",
		options: {layer: "sat"},
		center: [37.41, 8.82],	// LonLat coordinates of the center of the map
		mapCenter: {x:960, y:540}, 				// pixel coordinates of the center of the display (from topleft)
		mapSize: {width:1920, height:1080},	// pixel size of the map
		resolution: undefined,
		rotation: 0,
	})
	.constructor(function(config) {
		// *** It looks like we must define a constructor for the ObjectSharer constructor mixin to work
		log.method(this, 'constructor');
		this._super(config);
	})
	.methods({
		initPlatform: function(platform) {
			log.method(this, 'initPlatform', platform);
			this.platform = platform;

			// Make the app an emitter to signal state changes to the local UI.
			// this.uievents = new events.EventEmitter();

			var wall = platform.findDevice({type: 'Surface'});
			this.mapCenter = {x: Math.round(wall.width/2), y: Math.round(wall.height/2)};
			this.mapSize = {width: wall.width, height: wall.height};

			// compute resolution so world map fits the wall
			this.resolution = 40075016.68557849 / wall.width;

			// Create server-side window+UI
			var gui = platform.GUI.getGUI();
			if (gui) {
				var url = '../apps/Map/content/serverMap.html';	// URL is relative to the lib folder
				this.mapWindow = gui.Window.open(url, {
					width: 1200,
					height: 800,
					// toolbar: platform.program.showToolbar,
				});				
			}
		},

		// Called when the app is about to be unloaded.
		stop: function() {
			this._super();

			if (this.mapWindow)
				this.mapWindow.close();
		},

		// These methods are meant to be called by clients to change the state of the app
		panTo: function(center) {
			this.center = center;
		},
		zoomTo: function(resolution) {
			this.resolution = resolution;
		},
		rotateTo: function(rotation) {
			this.rotation = rotation;
		},

	})
	.shareState({
		fields: 'own', 
		arrayFields: ['center'],
		objectFields: ['mapCenter', 'mapSize', 'options'], 
		methods: ['panTo', 'zoomTo', 'rotateTo'],
	});


log.spyMethods(Map);

module.exports = Map;
