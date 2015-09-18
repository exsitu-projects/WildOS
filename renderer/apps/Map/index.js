// Map app - displays a map with OpenLayers 
//

// Node modules
var Path = require('path');

// Shared modules
var log = require('Log').logger('Map');
var HTML = require('HTML');

// Renderer modules
var App = require('../../lib/App');
var Layer = require('../../lib/Layer');

var contentRoot = Path.join(__dirname, "content/");

// The `Map` class.
var Map = App.subclass().name('Map')
	.fields({
		source: "MapQuest",
		options: {layer: "sat"},
		center: [37.41, 8.82],
		zoom: 1,
	})
	.constructor(function(config) {
		this._super(config);

		this.layer = Layer.create({
			type: 'normal',
			mode: 'grid',
		});

		this.wrapFields({
			set center(c)   { this._set(c); this.panned(); },
			set zoom(z)		{ this._set(z); this.zoomed(); },
		});


	})
	.methods({
		tileReady: function(tile) {
			var self = this;
			this.loadTile(tile);
		},

		loadTile: function(tile) {
			if (!tile || !tile.ready || !tile.window)
				return;

			var win = tile.window.window;
			var self = this;
			var layerId = this.layer.id;
			HTML.replace(win, layerId, '');
			HTML.addCSS_URL(win, "http://openlayers.org/en/v3.9.0/css/ol.css", 'end', layerId);
			HTML.addJS_URL(win, "http://openlayers.org/en/v3.9.0/build/ol.js", {onload: function() {
				HTML.addJSFile(win, Path.join(contentRoot, "map.js"), 'end', layerId);
				win.loadMap(layerId, self, tile);
			}}, 'end', layerId);
			
		},

		panned: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				var win = tile.window.window;
				if (win.panned)
					win.panned(self.center);
			});	
		},
		zoomed: function() {
			var self = this;
			this.mapReadyTiles(function(tile) {
				var win = tile.window.window;
				if (win.zoomed)
					win.zoomed(self.zoom);
			});	
		},

		// Clean up when application is closed
		stop: function() {
			this.layer.close();
			this.layer = null;
			this._super();
		},
	})
	.shareState({
		fields: 'own', 
	})
;

log.spyMethods(Map);

module.exports = Map;
