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
		source: "MapQuest",
		options: {layer: "sat"},
		center: [37.41, 8.82],
		zoom: 1,
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

			// Create server-side window+UI
			var gui = platform.GUI.getGUI();
			if (gui) {
				var url = '../apps/Map/content/serverMap.html';	// URL is relative to the lib folder
				this.mapWindow = gui.Window.open(url, {
					width: 1200,
					height: 800,
					toolbar: platform.program.showToolbar,
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
		zoomTo: function(zoom) {
			this.zoom = zoom;
		}

	})
	.shareState({
		fields: 'own', 
		objectFields: ['center', 'options'], 
		methods: ['panTo', 'zoomTo'],
	});


log.spyMethods(Map);

module.exports = Map;
